// src/world/chunk.js
export class Chunk {
  static SIZE = 32;                     // lato del chunk (coerente col writer attuale)
  static VOXELS = Chunk.SIZE ** 3;      // 32768

  constructor({ voxels, origin = { x: 0, y: 0, z: 0 } } = {}) {
    // Memoria: 32*32*32 = 32768 byte esatti
    if (voxels instanceof Uint8Array) {
      if (voxels.length !== Chunk.VOXELS) {
        throw new Error(`voxels length must be ${Chunk.VOXELS}`);
      }
      this.voxels = voxels;
    } else if (voxels == null) {
      this.voxels = new Uint8Array(Chunk.VOXELS); // 0 = vuoto/aria (in linea col worker attuale)
    } else if (Array.isArray(voxels)) {
      const arr = Uint8Array.from(voxels);
      if (arr.length !== Chunk.VOXELS) throw new Error(`voxels length must be ${Chunk.VOXELS}`);
      this.voxels = arr;
    } else {
      throw new Error("voxels must be Uint8Array | number[] | null/undefined");
    }

    // Origine (facoltativa, solo metadato utile lato generatore/caricatore)
    this.origin = {
      x: origin.x | 0,
      y: origin.y | 0,
      z: origin.z | 0,
    };
  }

  // Coordinate locali: 0..31 su ciascun asse
  static index(x, y, z) {
    // layout attuale implicito: x + y*32 + z*32*32
    return x + y * Chunk.SIZE + z * Chunk.SIZE * Chunk.SIZE;
  }
  inBounds(x, y, z) {
    const S = Chunk.SIZE;
    return x >= 0 && y >= 0 && z >= 0 && x < S && y < S && z < S;
  }

  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0; // sicurezza: fuori → aria
    return this.voxels[Chunk.index(x, y, z)];
  }
  set(x, y, z, value) {
    if (!this.inBounds(x, y, z)) return;
    this.voxels[Chunk.index(x, y, z)] = value & 0xFF;
  }
  fill(value = 0) {
    this.voxels.fill(value & 0xFF);
  }

  // ---- Bordi (il “guscio” è già dentro il 32³) ----
  // Questi helper servono se il generatore vuole leggere/scrivere i layer esterni.
  getFace(side /* 'N','S','E','W','Top','Bottom' */) {
    const S = Chunk.SIZE;
    const out = new Uint8Array(S * S);
    let k = 0;

    switch (side) {
      case 'N': { // z = 0
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) out[k++] = this.get(x, y, 0);
        break;
      }
      case 'S': { // z = S-1
        const z = S - 1;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) out[k++] = this.get(x, y, z);
        break;
      }
      case 'W': { // x = 0
        for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) out[k++] = this.get(0, y, z);
        break;
      }
      case 'E': { // x = S-1
        const x = S - 1;
        for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) out[k++] = this.get(x, y, z);
        break;
      }
      case 'Bottom': { // y = 0
        for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) out[k++] = this.get(x, 0, z);
        break;
      }
      case 'Top': { // y = S-1
        const y = S - 1;
        for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) out[k++] = this.get(x, y, z);
        break;
      }
      default:
        throw new Error("Invalid side");
    }
    return out;
  }

  setFace(side, data /* Uint8Array length 1024 */) {
    const S = Chunk.SIZE;
    if (!(data instanceof Uint8Array) || data.length !== S * S) {
      throw new Error(`data must be Uint8Array(${S * S})`);
    }
    let k = 0;
    switch (side) {
      case 'N': { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) this.set(x, y, 0, data[k++]); break; }
      case 'S': { const z = S - 1; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) this.set(x, y, z, data[k++]); break; }
      case 'W': { for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) this.set(0, y, z, data[k++]); break; }
      case 'E': { const x = S - 1; for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) this.set(x, y, z, data[k++]); break; }
      case 'Bottom': { for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) this.set(x, 0, z, data[k++]); break; }
      case 'Top': { const y = S - 1; for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) this.set(x, y, z, data[k++]); break; }
      default: throw new Error("Invalid side");
    }
  }

  // ---- Bridge con l’attuale writer/reader ----
  // Esporta ESATTAMENTE 32768 byte (ordine x, poi y, poi z) come nel writer attuale.
  toShellData() {
    return this.voxels; // già pronto per writeRegionFile(...)
  }

  // Importa un blocco 32768 byte preesistente (come quello prodotto da createChunkWithShell).
  static fromShellData(uint8 /* Uint8Array */ , origin = { x: 0, y: 0, z: 0 }) {
    if (!(uint8 instanceof Uint8Array) || uint8.length !== Chunk.VOXELS) {
      throw new Error(`fromShellData expects Uint8Array(${Chunk.VOXELS})`);
    }
    return new Chunk({ voxels: uint8, origin });
  }
  
  shellByteLength() { return this.voxels.length; } // oggi 32768
}
