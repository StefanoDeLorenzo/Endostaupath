// src/io/worldLoader.js
import { REGION_SCHEMA } from '../world/config.js';

export class WorldLoader {
  constructor() {
    this.loadedRegions = new Set();
    this.regionsData = new Map(); // key -> ArrayBuffer
  }

  async fetchAndStoreRegionData(regionX, regionY, regionZ) {
    const regionKey = `${regionX}_${regionY}_${regionZ}`;
    if (this.loadedRegions.has(regionKey)) {
      return;
    }


    // Aggiungi subito la chiave al set per evitare tentativi doppi
    this.loadedRegions.add(regionKey);

    try {
      const regionPath = `./regions/r.${regionX}.${regionY}.${regionZ}.voxl`;
      console.log(`WorldLoader: Caricamento del file ${regionPath}...`);
      const response = await fetch(regionPath);
      
      if (!response.ok) {
        // Log che mancava
        console.error(`Regione (${regionX}, ${regionY}, ${regionZ}) non trovata. Trattata come vuota.`);
        const emptyBuffer = new ArrayBuffer(0);
        this.regionsData.set(regionKey, emptyBuffer);
      } else {
        const buffer = await response.arrayBuffer();
        console.log(`WorldLoader: File caricato. Dimensione: ${buffer.byteLength} byte. Regione: (${regionX}, ${regionY}, ${regionZ})`);
        this.regionsData.set(regionKey, buffer);
      }
      
    } catch (err) {
      console.error(`Errore durante il caricamento della regione (${regionX}, ${regionY}, ${regionZ}):`, err);
      const emptyBuffer = new ArrayBuffer(0);
      this.regionsData.set(regionKey, emptyBuffer);
    }
  }

  getChunkDataFromRegionBuffer(buffer, chunkX, chunkY, chunkZ) {
    const dv = new DataView(buffer);
    const headerSize = 11;
    const GRID = REGION_SCHEMA.GRID;

    // Calcola l'indice con ordine X→Y→Z
    const idx = ((chunkX * GRID) + chunkY) * GRID + chunkZ;
    const off = headerSize + idx * 5;

    // offset a 24 bit (big-endian)
    const chunkFileOffset =
      (dv.getUint8(off) << 16) | (dv.getUint8(off + 1) << 8) | dv.getUint8(off + 2);

    if (chunkFileOffset === 0) return null;

    //const size = REGION_SCHEMA.CHUNK_SHELL_BYTES; // 32^3
    const size = REGION_SCHEMA.CHUNK_BYTES; // 30^3
    const chunkBuffer = buffer.slice(chunkFileOffset, chunkFileOffset + size);
    return new Uint8Array(chunkBuffer);
  }

  getCoreChunkDataFromRegionBuffer(buffer, chunkX, chunkY, chunkZ) {
    const dv = new DataView(buffer);
    const headerSize = 11;
    const GRID = REGION_SCHEMA.GRID;

    // Calcola l'indice con ordine X→Y→Z
    const idx = ((chunkX * GRID) + chunkY) * GRID + chunkZ;
    const off = headerSize + idx * 5;

    // offset a 24 bit
    const chunkFileOffset =
      (dv.getUint8(off) << 16) | (dv.getUint8(off + 1) << 8) | dv.getUint8(off + 2);

    if (chunkFileOffset === 0) return null;

    const size = REGION_SCHEMA.CHUNK_BYTES;
    const chunkBuffer = buffer.slice(chunkFileOffset, chunkFileOffset + size);
    return new Uint8Array(chunkBuffer);
  }

  getChunkDataFromMemory(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
    const regionKey = `${regionX}_${regionY}_${regionZ}`;
    if (!this.regionsData.has(regionKey)) return null;
    const regionBuffer = this.regionsData.get(regionKey);
    return this.getChunkDataFromRegionBuffer(regionBuffer, chunkX, chunkY, chunkZ);
  }
}
