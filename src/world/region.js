// src/world/region.js
import { REGION_SCHEMA } from "./config.js";
import { Chunk } from "./chunk.js";

export class Region {
  static MAGIC = 0x564F584C; // 'VOXL'
  static VERSION = 1;

  constructor({
    regionX = 0, regionY = 0, regionZ = 0,
    schema = REGION_SCHEMA,          // schema uniforme passato una volta
    ChunkClass = Chunk
  } = {}) {
    this.regionX = regionX|0; this.regionY = regionY|0; this.regionZ = regionZ|0;
    this.schema = schema;
    this.ChunkClass = ChunkClass;

    // Precalcolo costanti dal solo schema (niente chiamate per-chunk)
    this.GRID = schema.GRID;
    this.CHUNK_SIZE_SHELL = schema.CHUNK_SIZE_SHELL;
    //this.CHUNK_BYTES = schema.CHUNK_SHELL_BYTES; // Vecchia shell
    this.CHUNK_BYTES = schema.CHUNK_SIZE ** 3; // Nuova senza shell

    this.TOTAL = this.GRID * this.GRID * this.GRID;
    this.HEADER_SIZE = 11;
    this.INDEX_ENTRY_SIZE = 5;
    this.INDEX_TABLE_SIZE = this.TOTAL * this.INDEX_ENTRY_SIZE;
    this.DATA_OFFSET = this.HEADER_SIZE + this.INDEX_TABLE_SIZE;
    this.FILE_SIZE = this.DATA_OFFSET + this.TOTAL * this.CHUNK_BYTES;

    this._chunks = new Array(this.TOTAL).fill(null);
  }

  // mapping lineare
  linearIndex(x,y,z){ return ((x*this.GRID)+y)*this.GRID+z; }
  unlinearIndex(i){
    const z = i % this.GRID;
    const t = (i - z) / this.GRID;
    const y = t % this.GRID;
    const x = (t - y) / this.GRID;
    return {x,y,z};
  }
  _checkXYZ(x,y,z){
    const G=this.GRID; if(x<0||y<0||z<0||x>=G||y>=G||z>=G) throw new Error(`out of range ${x},${y},${z}`);
  }

  hasChunk(x,y,z){ this._checkXYZ(x,y,z); return this._chunks[this.linearIndex(x,y,z)]!==null; }
  getChunk(x,y,z){ this._checkXYZ(x,y,z); return this._chunks[this.linearIndex(x,y,z)]; }
  setChunk(x,y,z,chunk){
    this._checkXYZ(x,y,z);
    if (chunk!==null && !(chunk instanceof this.ChunkClass)) throw new Error("setChunk expects Chunk");
    // Validazione soft: se presente, deve avere la lunghezza giusta
    if (chunk && chunk.coreByteLength && chunk.coreByteLength() !== this.CHUNK_BYTES) {
      throw new Error(`Chunk blob size mismatch: got ${chunk.coreByteLength()}, expected ${this.CHUNK_BYTES}`);
    }
    this._chunks[this.linearIndex(x,y,z)] = chunk;
  }
  ensureChunk(x,y,z,origin={x:0,y:0,z:0}) {
    let c=this.getChunk(x,y,z); if(!c){ c=new this.ChunkClass({ origin }); this.setChunk(x,y,z,c); } return c;
  }
  forEachChunk(cb){ for(let i=0;i<this.TOTAL;i++){ const {x,y,z}=this.unlinearIndex(i); cb(this._chunks[i],x,y,z,i);} }

  // --- Serializzazione (zero chiamate “per chunk” per conoscere dimensioni) ---
  toBuffer(){
    const finalBuffer = new ArrayBuffer(this.FILE_SIZE);
    const view = new DataView(finalBuffer);

    // Header
    view.setUint32(0, Region.MAGIC, false);
    view.setUint8(4, Region.VERSION);
    // Vogliamo salvare la dimensione del CORE del chunk, non la shell.
    // L'header deve corrispondere ai dati salvati.
    view.setUint8(5, this.schema.CHUNK_SIZE); // 30
    view.setUint8(6, this.schema.CHUNK_SIZE); // 30
    view.setUint8(7, this.schema.CHUNK_SIZE); // 30
    view.setUint8(8, (this.TOTAL >> 16) & 0xFF);
    view.setUint8(9, (this.TOTAL >> 8) & 0xFF);
    view.setUint8(10, this.TOTAL & 0xFF);

    // Index table (offsets contigui, size costante per tutti)
    const indexTable = new Uint8Array(this.INDEX_TABLE_SIZE);
    let currentOffset = this.DATA_OFFSET;
    for (let i=0;i<this.TOTAL;i++){
      const base = i * this.INDEX_ENTRY_SIZE;
      indexTable[base+0] = (currentOffset >> 16) & 0xFF;
      indexTable[base+1] = (currentOffset >> 8)  & 0xFF;
      indexTable[base+2] = (currentOffset)       & 0xFF;
      indexTable[base+3] = (this.CHUNK_BYTES >> 8) & 0xFF;
      indexTable[base+4] = (this.CHUNK_BYTES)      & 0xFF;
      currentOffset += this.CHUNK_BYTES;
    }
    new Uint8Array(finalBuffer, this.HEADER_SIZE, this.INDEX_TABLE_SIZE).set(indexTable);

    // Data area
    let dataOffset = this.DATA_OFFSET;
    for (let i=0;i<this.TOTAL;i++){
      const chunk = this._chunks[i];
      // Adesso salvi il solo core, come hai giustamente modificato
      const coreData = chunk ? chunk.toCoreData() : new Uint8Array(this.CHUNK_BYTES);
      if (!(coreData instanceof Uint8Array) || coreData.length !== this.CHUNK_BYTES) {
        throw new Error(`Chunk #${i} invalid payload length`);
      }
      new Uint8Array(finalBuffer, dataOffset, this.CHUNK_BYTES).set(coreData);
      dataOffset += this.CHUNK_BYTES;
    }

    return finalBuffer;
  }

  // --- Deserializzazione (validando contro lo schema una sola volta) ---
  static fromBuffer(buffer, {
    regionX=0, regionY=0, regionZ=0,
    schema = REGION_SCHEMA,
    ChunkClass = Chunk
  } = {}) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (view.getUint32(0, false) !== Region.MAGIC) throw new Error("Invalid magic");
    const version = view.getUint8(4);
    if (version !== Region.VERSION) throw new Error(`Unsupported version ${version}`);

    const sx = view.getUint8(5), sy = view.getUint8(6), sz = view.getUint8(7);
    if (sx !== schema.CHUNK_SIZE || sy !== schema.CHUNK_SIZE || sz !== schema.CHUNK_SIZE) {
      throw new Error(`Chunk size mismatch: file ${sx},${sy},${sz} vs schema ${schema.CHUNK_SIZE}`);
    }
    const total = (view.getUint8(8) << 16) | (view.getUint8(9) << 8) | view.getUint8(10);
    const GRID = schema.GRID;
    if (total !== GRID*GRID*GRID) throw new Error(`Chunk count mismatch: file ${total} vs schema ${GRID**3}`);

    const region = new Region({ regionX, regionY, regionZ, schema, ChunkClass });

    const HEADER_SIZE = 11, INDEX_ENTRY_SIZE = 5;
    for (let i=0;i<total;i++){
      const base = HEADER_SIZE + i*INDEX_ENTRY_SIZE;
      const off = (bytes[base+0] << 16) | (bytes[base+1] << 8) | bytes[base+2];
      const siz = (bytes[base+3] << 8) | bytes[base+4];
      if (siz !== schema.CHUNK_SIZE ** 3) throw new Error(`Chunk #${i} size ${siz} != ${schema.CHUNK_SIZE ** 3}`);

        const coreSlice = bytes.subarray(off, off + siz);
        const {x, y, z} = region.unlinearIndex(i);
        region._chunks[i] = ChunkClass.fromCoreData(coreSlice, {x, y, z});
    }

    return region;
  }
}
