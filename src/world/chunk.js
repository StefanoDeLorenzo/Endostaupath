// src/world/chunk.js - senza shell
import { REGION_SCHEMA } from "./config.js";

export class Chunk {
  static SIZE = REGION_SCHEMA.CHUNK_SIZE;
  static VOXELS = Chunk.SIZE ** 3;;

  constructor({ voxels, origin = { x: 0, y: 0, z: 0 }, regionCoords = { x: 0, y: 0, z: 0 } } = {}) {
    const expected = Chunk.VOXELS;

    if (voxels instanceof Uint8Array) {
      if (voxels.length !== expected) throw new Error(`voxels must be ${expected} bytes`);
      this.voxels = voxels;
    } else if (voxels == null) {
      this.voxels = new Uint8Array(expected); // 0 = aria
    } else if (Array.isArray(voxels)) {
      const arr = Uint8Array.from(voxels);
      if (arr.length !== expected) throw new Error(`voxels must be ${expected} bytes`);
      this.voxels = arr;
    } else {
      throw new Error("voxels must be Uint8Array | number[] | null");
    }

    this.origin = { x: origin.x | 0, y: origin.y | 0, z: origin.z | 0 };
    this.regionCoords = { x: regionCoords.x | 0, y: regionCoords.y | 0, z: regionCoords.z | 0 };
  }

  // --- Coordinate e bounds ---
  static index(x, y, z) {
    const S = Chunk.SIZE; return x + y * S + z * S * S;
  }
  inBounds(x, y, z) {
    const S = Chunk.SIZE; return x >= 0 && y >= 0 && z >= 0 && x < S && y < S && z < S;
  }

  // --- Accesso base ---
  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.voxels[Chunk.index(x, y, z)];
  }
  set(x, y, z, v) {
    if (!this.inBounds(x, y, z)) return;
    this.voxels[Chunk.index(x, y, z)] = v & 0xFF;
  }
  fill(v = 0) { this.voxels.fill(v & 0xFF); }

  // --- Facce (guscio già nel 32³) ---
  getFace(side /* 'N','S','E','W','Top','Bottom' */) {
    const S = Chunk.SIZE, out = new Uint8Array(S * S); let k = 0;
    switch (side) {
      case 'N': for (let y=0;y<S;y++) for (let x=0;x<S;x++) out[k++] = this.get(x,y,0); break;
      case 'S': { const z=S-1; for (let y=0;y<S;y++) for (let x=0;x<S;x++) out[k++] = this.get(x,y,z); } break;
      case 'W': for (let y=0;y<S;y++) for (let z=0;z<S;z++) out[k++] = this.get(0,y,z); break;
      case 'E': { const x=S-1; for (let y=0;y<S;y++) for (let z=0;z<S;z++) out[k++] = this.get(x,y,z); } break;
      case 'Bottom': for (let z=0;z<S;z++) for (let x=0;x<S;x++) out[k++] = this.get(x,0,z); break;
      case 'Top': { const y=S-1; for (let z=0;z<S;z++) for (let x=0;x<S;x++) out[k++] = this.get(x,y,z); } break;
      default: throw new Error("Invalid side");
    }
    return out;
  }
  setFace(side, data /* Uint8Array of S*S */) {
    const S = Chunk.SIZE;
    if (!(data instanceof Uint8Array) || data.length !== S * S) {
      throw new Error(`data must be Uint8Array(${S * S})`);
    }
    let k = 0;
    switch (side) {
      case 'N': for (let y=0;y<S;y++) for (let x=0;x<S;x++) this.set(x,y,0,data[k++]); break;
      case 'S': { const z=S-1; for (let y=0;y<S;y++) for (let x=0;x<S;x++) this.set(x,y,z,data[k++]); } break;
      case 'W': for (let y=0;y<S;y++) for (let z=0;z<S;z++) this.set(0,y,z,data[k++]); break;
      case 'E': { const x=S-1; for (let y=0;y<S;y++) for (let z=0;z<S;z++) this.set(x,y,z,data[k++]); } break;
      case 'Bottom': for (let z=0;z<S;z++) for (let x=0;x<S;x++) this.set(x,0,z,data[k++]); break;
      case 'Top': { const y=S-1; for (let z=0;z<S;z++) for (let x=0;x<S;x++) this.set(x,y,z,data[k++]); } break;
      default: throw new Error("Invalid side");
    }
  }

  // --- Sub‑box helpers (utili al generatore) ---
  fillBox(x0,y0,z0, x1,y1,z1, value) {
    const S = Chunk.SIZE, v = value & 0xFF;
    x0=Math.max(0,x0); y0=Math.max(0,y0); z0=Math.max(0,z0);
    x1=Math.min(S,x1); y1=Math.min(S,y1); z1=Math.min(S,z1);
    for (let z=z0; z<z1; z++) {
      const zOff = z*S*S;
      for (let y=y0; y<y1; y++) {
        const row = zOff + y*S;
        this.voxels.fill(v, row + x0, row + x1);
      }
    }
  }
  blitFrom(srcChunk, srcBox, dstOrigin) {
    const S = Chunk.SIZE;
    const {x: sx0, y: sy0, z: sz0, w: sw, h: sh, d: sd} = srcBox;
    const dx0 = dstOrigin.x|0, dy0 = dstOrigin.y|0, dz0 = dstOrigin.z|0;

    for (let z = 0; z < sd; z++) {
      const sz = sz0 + z, dz = dz0 + z; if (sz<0||dz<0||sz>=S||dz>=S) continue;
      for (let y = 0; y < sh; y++) {
        const sy = sy0 + y, dy = dy0 + y; if (sy<0||dy<0||sy>=S||dy>=S) continue;
        const srow = srcChunk.voxels.subarray(Chunk.index(sx0,sy,sz), Chunk.index(sx0+sw,sy,sz));
        const dbase = Chunk.index(dx0,dy,dz);
        for (let x = 0; x < srow.length; x++) {
          const dx = dx0 + x; if (dx<0||dx>=S) continue;
          this.voxels[dbase + x] = srow[x];
        }
      }
    }
  }

  // --- Iterazione e analisi ---
  forEach(cb /* (value,x,y,z,idx) */) {
    const S = Chunk.SIZE; let idx = 0;
    for (let z=0; z<S; z++) {
      for (let y=0; y<S; y++) {
        for (let x=0; x<S; x++, idx++) cb(this.voxels[idx], x, y, z, idx);
      }
    }
  }
  mapInPlace(fn /* (value,x,y,z,idx)->number */) {
    const S = Chunk.SIZE; let idx = 0;
    for (let z=0; z<S; z++) for (let y=0; y<S; y++) for (let x=0; x<S; x++, idx++) {
      this.voxels[idx] = fn(this.voxels[idx], x, y, z, idx) & 0xFF;
    }
  }
  histogram() {
    const hist = new Uint32Array(256);
    for (let i=0; i<this.voxels.length; i++) hist[this.voxels[i]]++;
    return hist;
  }

  // --- Bridge I/O legacy identico ---
  toShellData(){ return this.voxels; }
  static coreByteLength() {return REGION_SCHEMA.CHUNK_SIZE ** 3; }
  static shellByteLength(){ return REGION_SCHEMA.CHUNK_SIZE_SHELL ** 3; }
  static fromShellData(uint8, origin={x:0,y:0,z:0}){
    if (!(uint8 instanceof Uint8Array) || uint8.length !== Chunk.VOXELS) {
      throw new Error(`fromShellData expects Uint8Array(${Chunk.VOXELS})`);
    }
    return new Chunk({ voxels:uint8, origin });
  }

  toCoreData(){
    const S = Chunk.SIZE; // 30
    
    const coreVoxels = new Uint8Array(S * S * S);
    let k = 0;
    for (let z = 0; z < S; z++) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          coreVoxels[k++] = this.get(x, y, z);
        }
      }
    }
    return coreVoxels;
  }

  static fromCoreData(uint8, origin = { x: 0, y: 0, z: 0 }) {
    const S = Chunk.SIZE; // 30
    const chunkWithShell = new Chunk({ origin });
    let k = 0;
    for (let cz = 0; cz < S; cz++) {
      for (let cy = 0; cy < S; cy++) {
        for (let cx = 0; cx < S; cx++) {
          chunkWithShell.set(cx + 1, cy + 1, cz + 1, uint8[k++]);
        }
      }
    }
    return chunkWithShell;
  }

  // --- Utility ---
  clone() { return new Chunk({ voxels: this.voxels.slice(), origin: this.origin }); }
  static createEmpty(origin={x:0,y:0,z:0}) { return new Chunk({ origin }); }
}
