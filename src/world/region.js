// src/world/region.js
import { Chunk } from "./chunk.js";

/**
 * Region file format (legacy, invariato a livello di layout):
 * - Header (11 bytes, big-endian dove applicabile)
 *   [0..3]  Magic 'VOXL'
 *   [4]     Version = 1
 *   [5..7]  ChunkSizeX, ChunkSizeY, ChunkSizeZ  (letti da Chunk.SIZE)
 *   [8..10] TotalChunks (24-bit) = GRID^3
 *
 * - Index table (TotalChunks * 5 bytes):
 *   ogni entry: [offset24][size16] del blocco chunk i-esimo
 *
 * - Data area: i blocchi dei chunk in sequenza (dimensione presa da chunk.shellByteLength()).
 *
 * L'ordine rimane: for (x) for (y) for (z) → i = ((x*GRID)+y)*GRID+z
 */
export class Region {
  static MAGIC = 0x564F584C; // 'VOXL'
  static VERSION = 1;

  constructor({
    regionX = 0, regionY = 0, regionZ = 0,
    grid = 4,                         // flessibile (default 4x4x4)
    ChunkClass = Chunk,               // iniezione dipendenza (se in futuro vuoi un altro tipo di chunk)
  } = {}) {
    this.regionX = regionX | 0;
    this.regionY = regionY | 0;
    this.regionZ = regionZ | 0;

    this.GRID = grid | 0;
    if (this.GRID <= 0) throw new Error("grid must be >= 1");

    this.ChunkClass = ChunkClass;
    if (typeof this.ChunkClass.SIZE !== "number") {
      throw new Error("ChunkClass must expose static SIZE");
    }

    const total = this.totalChunks();
    this._chunks = new Array(total).fill(null);
  }

  // ---- utilità dimensioni/indici ----
  totalChunks() { return this.GRID * this.GRID * this.GRID; }
  static linearIndexOf(grid, x, y, z) { return ((x * grid) + y) * grid + z; }
  static unlinearIndexOf(grid, i) {
    const z = i % grid;
    const t = (i - z) / grid;
    const y = t % grid;
    const x = (t - y) / grid;
    return { x, y, z };
  }
  linearIndex(x, y, z) { return Region.linearIndexOf(this.GRID, x, y, z); }
  unlinearIndex(i) { return Region.unlinearIndexOf(this.GRID, i); }

  _checkXYZ(x, y, z) {
    const G = this.GRID;
    if (x < 0 || y < 0 || z < 0 || x >= G || y >= G || z >= G) {
      throw new Error(`Chunk coords out of range: ${x},${y},${z}`);
    }
  }

  hasChunk(x, y, z) {
    this._checkXYZ(x, y, z);
    return this._chunks[this.linearIndex(x, y, z)] !== null;
  }
  getChunk(x, y, z) {
    this._checkXYZ(x, y, z);
    return this._chunks[this.linearIndex(x, y, z)];
  }
  setChunk(x, y, z, chunk /* instance of ChunkClass or null */) {
    this._checkXYZ(x, y, z);
    if (chunk !== null && !(chunk instanceof this.ChunkClass)) {
      throw new Error("setChunk expects an instance of ChunkClass or null");
    }
    this._chunks[this.linearIndex(x, y, z)] = chunk;
  }
  ensureChunk(x, y, z, origin = { x: 0, y: 0, z: 0 }) {
    this._checkXYZ(x, y, z);
    let c = this.getChunk(x, y, z);
    if (!c) {
      c = new this.ChunkClass({ origin }); // Chunk decide come inizializzarsi
      this.setChunk(x, y, z, c);
    }
    return c;
  }
  forEachChunk(cb /* (chunk, x,y,z, i) => void */) {
    for (let i = 0, n = this.totalChunks(); i < n; i++) {
      const c = this._chunks[i];
      const { x, y, z } = this.unlinearIndex(i);
      cb(c, x, y, z, i);
    }
  }

  // ---- Serializzazione: delega i blocchi al Chunk ----
  toBuffer() {
    const totalChunks = this.totalChunks();
    const CHUNK_SIZE = this.ChunkClass.SIZE; // lato (es. 32)

    // 1) Calcola le dimensioni reali dei blocchi (chiede a ogni chunk)
    const blockSizes = new Array(totalChunks);
    for (let i = 0; i < totalChunks; i++) {
      const c = this._chunks[i];
      const size = c ? (typeof c.shellByteLength === "function" ? c.shellByteLength() : c.toShellData().length)
                     : (CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE); // fallback standard legacy
      blockSizes[i] = size | 0;
    }

    // 2) Header + index table sizes
    const HEADER_SIZE = 11;
    const INDEX_ENTRY_SIZE = 5;
    const INDEX_TABLE_SIZE = totalChunks * INDEX_ENTRY_SIZE;

    // 3) Calcolo offset cumulativi
    const DATA_OFFSET = HEADER_SIZE + INDEX_TABLE_SIZE;
    const offsets = new Array(totalChunks);
    let currentOffset = DATA_OFFSET;
    for (let i = 0; i < totalChunks; i++) {
      offsets[i] = currentOffset;
      currentOffset += blockSizes[i];
    }
    const FILE_SIZE = currentOffset;

    // 4) Alloca buffer finale
    const finalBuffer = new ArrayBuffer(FILE_SIZE);
    const view = new DataView(finalBuffer);

    // 5) Header (legacy)
    view.setUint32(0, Region.MAGIC, false);
    view.setUint8(4, Region.VERSION);
    view.setUint8(5, CHUNK_SIZE);
    view.setUint8(6, CHUNK_SIZE);
    view.setUint8(7, CHUNK_SIZE);
    // totalChunks 24-bit
    view.setUint8(8,  (totalChunks >> 16) & 0xFF);
    view.setUint8(9,  (totalChunks >> 8)  & 0xFF);
    view.setUint8(10, (totalChunks)       & 0xFF);

    // 6) Index table
    const indexTable = new Uint8Array(INDEX_TABLE_SIZE);
    for (let i = 0; i < totalChunks; i++) {
      const base = i * INDEX_ENTRY_SIZE;
      const off = offsets[i];
      const siz = blockSizes[i];

      // offset 24-bit, big-endian
      indexTable[base + 0] = (off >> 16) & 0xFF;
      indexTable[base + 1] = (off >> 8)  & 0xFF;
      indexTable[base + 2] = (off)       & 0xFF;
      // size 16-bit, big-endian (ATTENZIONE: se >65535 non ci sta nel legacy)
      if (siz > 0xFFFF) {
        throw new Error(`Chunk #${i} size ${siz} exceeds 16-bit field in legacy index`);
      }
      indexTable[base + 3] = (siz >> 8) & 0xFF;
      indexTable[base + 4] = (siz)      & 0xFF;
    }
    new Uint8Array(finalBuffer, HEADER_SIZE, INDEX_TABLE_SIZE).set(indexTable);

    // 7) Data area: scrive i blob delegando al Chunk
    for (let i = 0; i < totalChunks; i++) {
      const chunk = this._chunks[i];
      const dstOffset = offsets[i];

      let shell;
      if (chunk) {
        shell = chunk.toShellData(); // Uint8Array
      } else {
        // chunk mancante → blob vuoto coerente con legacy (aria)
        shell = new Uint8Array(blockSizes[i]);
      }

      if (!(shell instanceof Uint8Array) || shell.length !== blockSizes[i]) {
        throw new Error(`Chunk #${i} invalid shell payload`);
      }
      new Uint8Array(finalBuffer, dstOffset, shell.length).set(shell);
    }

    return finalBuffer;
  }

  // ---- Deserializzazione: chiede al ChunkClass come ricostruirsi dal blob ----
  static fromBuffer(buffer /* ArrayBuffer|Uint8Array */, {
    regionX = 0, regionY = 0, regionZ = 0,
    grid = 4,
    ChunkClass = Chunk,
  } = {}) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Header
    if (view.getUint32(0, false) !== Region.MAGIC) throw new Error("Invalid magic");
    const version = view.getUint8(4);
    if (version !== Region.VERSION) throw new Error(`Unsupported region version ${version}`);

    const sx = view.getUint8(5), sy = view.getUint8(6), sz = view.getUint8(7);
    if (typeof ChunkClass.SIZE === "number") {
      if (sx !== ChunkClass.SIZE || sy !== ChunkClass.SIZE || sz !== ChunkClass.SIZE) {
        throw new Error(`Chunk size mismatch: file ${sx},${sy},${sz} vs class ${ChunkClass.SIZE}`);
      }
    }

    const totalChunks = (view.getUint8(8) << 16) | (view.getUint8(9) << 8) | view.getUint8(10);
    const INDEX_ENTRY_SIZE = 5;
    const HEADER_SIZE = 11;
    const INDEX_TABLE_SIZE = totalChunks * INDEX_ENTRY_SIZE;

    // Index table
    const offsets = new Array(totalChunks);
    const sizes = new Array(totalChunks);
    for (let i = 0; i < totalChunks; i++) {
      const base = HEADER_SIZE + i * INDEX_ENTRY_SIZE;
      const off = (bytes[base + 0] << 16) | (bytes[base + 1] << 8) | bytes[base + 2];
      const siz = (bytes[base + 3] << 8) | bytes[base + 4];
      offsets[i] = off; sizes[i] = siz;
    }

    // Crea region
    const region = new Region({ regionX, regionY, regionZ, grid, ChunkClass });

    // Data area
    for (let i = 0; i < totalChunks; i++) {
      const off = offsets[i];
      const siz = sizes[i];
      const slice = bytes.subarray(off, off + siz);
      const { x, y, z } = region.unlinearIndex(i);

      // Delego al Chunk la ricostruzione
      const chunk = ChunkClass.fromShellData(slice, { x, y, z });
      region._chunks[i] = chunk;
    }

    return region;
  }
}
