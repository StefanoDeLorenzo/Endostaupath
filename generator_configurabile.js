// generator_configurable.js - Worker per la generazione di regioni Voxel (configurabile)
// Mantiene lo stesso protocollo del tuo worker originale:
//   postMessage({ type: 'regionGenerated', regionX, regionY, regionZ, buffer }, [buffer])
// Modifiche principali:
// - +1 byte di header per chunk (chunkType) -> VERSIONE FILE = 2
// - Config globale all'inizio per fare test rapidi (noise, livelli, palette, ecc.)
// - Funzione determineChunkType(...) per definire la "tavolozza" del chunk
// - Perlin ottimizzato (permutation p fuori dalla funzione)
// - createChunkWithShell: invariato nell'API, 32^3 (SHELL_SIZE) con bordi dai vicini
// - generateLogicalChunk: usa CONFIG per noise/soglie/materiali base

// =====================
// CONFIGURAZIONE GLOBALE
// =====================
const CONFIG = {
  FILE: {
    VERSION: 2,
    CHUNK_HEADER_BYTES: 1,       // 1 byte di tipo chunk
  },
  WORLD: {
    REGION_DIM: 4,               // 4x4x4 chunk per regione
    CHUNK_SIZE: 30,              // voxel interni senza shell
    SHELL_SIZE: 32,              // CHUNK_SIZE + 2 (1 bordo per lato)
  },
  LEVELS: {
    SKY_LEVEL: 50,               // altezza oltre cui considerare cielo/nuvole
    GROUND_LEVEL: 10,            // base del terreno
    SEA_LEVEL: 6,                // livello "mare" per chunkType (decide bioma)
  },
  NOISE: {
    // scala base per la superficie
    surfaceScale: 0.05,
    // nuvole
    cloudScale: 0.02,
    cloudThreshold: 0.4,
    // caverne
    caveScale: 0.10,
    caveThreshold: 0.3,
  },
  // Definizione delle "tavolozze" per chunkType (label -> valore voxel 0..255)
  PALETTE: {
    PRAIRIE: { Air: 0, Dirt: 1, Grass: 2, Rock: 3, Cloud: 4 },
    UNDERWATER: { Water: 0, Sand: 1, Coral: 2, Rock: 3, Air: 4 },
    SKY: { Air: 0, Cloud: 4 },
  },
};

// =====================
// PERLIN NOISE 3D
// =====================
const permutation = new Uint8Array([
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,
  247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,175,87,86,232,199,158,58,
  77,24,226,207,170,182,179,5,236,123,110,150,134,100,16,93,249,112,192,169,211,218,128,76,139,115,127,245,196,
  49,176,185,19,147,238,156,46,143,205,107,253,178,13,242,198,11,101,145,14,18,184,194,204,173,212,152,17,18,
  239,210,129,172,197,45,78,16,188,104,19,181,244,209,184,96,22,216,73,126,10,215,200,162,105,114,246,209,138,
  12,47,118,24,165,208,22,98,166,15,102,235,221,16,233,11,198,48,149,102,60,250,173,228,14,212,213,221,203,167,
  235,195,219,171,15,168,158,204,135,16,70,113,187,164,119,180,251,80,14,60,159,177,224,225,230,239,216,24,111,
  218,202,90,89,74,169,186,206,61,91,15,217,132,21,10,12,159,168,79,167,12,143,205,193,214,112,43,25,243,85,246,
  163,145,154,97,113,144,171,122,191,162,248,201,220,4,189,222,247,65,133,254,195,20,231,183,174,15
]);
const p = new Uint8Array(512);
for (let i = 0; i < 256; i++) p[i] = p[i + 256] = permutation[i];

function fade(t){ return t*t*t*(t*(t*6 - 15) + 10); }
function lerp(t,a,b){ return a + t*(b - a); }
function grad(hash, x, y, z){
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
function perlinNoise3D(x, y, z){
  let X = Math.floor(x) & 255;
  let Y = Math.floor(y) & 255;
  let Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = p[X] + Y, B = p[X + 1] + Y;
  const A0 = p[A] + Z, A1 = p[A + 1] + Z;
  const B0 = p[B] + Z, B1 = p[B + 1] + Z;
  return lerp(w, lerp(v, lerp(u, grad(p[A0], x, y, z), grad(p[B0], x-1, y, z)),
                       lerp(u, grad(p[A1], x, y-1, z), grad(p[B1], x-1, y-1, z))),
                  lerp(v, lerp(u, grad(p[A0+1], x, y, z-1), grad(p[B0+1], x-1, y, z-1)),
                       lerp(u, grad(p[A1+1], x, y-1, z-1), grad(p[B1+1], x-1, y-1, z-1))));
}

// =====================
// CLASSI
// =====================
const REGION_DIM = CONFIG.WORLD.REGION_DIM;
const CHUNK_SIZE = CONFIG.WORLD.CHUNK_SIZE;
const SHELL_SIZE = CONFIG.WORLD.SHELL_SIZE;
const TOTAL_CHUNKS = REGION_DIM * REGION_DIM * REGION_DIM;
const BYTES_PER_CHUNK = SHELL_SIZE * SHELL_SIZE * SHELL_SIZE;
const CHUNK_HEADER_BYTES = CONFIG.FILE.CHUNK_HEADER_BYTES;
const CHUNK_RECORD_SIZE = CHUNK_HEADER_BYTES + BYTES_PER_CHUNK;

const SKY_LEVEL = CONFIG.LEVELS.SKY_LEVEL;
const GROUND_LEVEL = CONFIG.LEVELS.GROUND_LEVEL;
const SEA_LEVEL = CONFIG.LEVELS.SEA_LEVEL;

const VoxelTypesDefault = CONFIG.PALETTE.PRAIRIE;

class VoxelChunk {
  constructor(logicalChunkData) {
    this.logicalChunkData = logicalChunkData;
  }
  getVoxel(x,y,z){
    if (x>=0 && x<CHUNK_SIZE && y>=0 && y<CHUNK_SIZE && z>=0 && z<CHUNK_SIZE) {
      return this.logicalChunkData[x + CHUNK_SIZE * (y + CHUNK_SIZE * z)];
    }
    return VoxelTypesDefault.Air;
  }
}

class WorldGenerator {
  constructor(seed = 1337) {
    this.worldCache = new Map();
    this.seed = seed;
  }

  determineChunkType(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
    const worldBaseY = regionY * (REGION_DIM * CHUNK_SIZE) + chunkY * CHUNK_SIZE;
    if (worldBaseY >= SKY_LEVEL) return 2;      // SKY
    if (worldBaseY < SEA_LEVEL) return 1;       // UNDERWATER
    return 0;                                   // PRAIRIE
  }

  generateLogicalChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
    const sScale = CONFIG.NOISE.surfaceScale;
    const cScale = CONFIG.NOISE.caveScale;
    const cThr = CONFIG.NOISE.caveThreshold;
    const cloudScale = CONFIG.NOISE.cloudScale;
    const cloudThr = CONFIG.NOISE.cloudThreshold;

    for (let x=0; x<CHUNK_SIZE; x++) {
      for (let y=0; y<CHUNK_SIZE; y++) {
        for (let z=0; z<CHUNK_SIZE; z++) {
          const gX = regionX * (REGION_DIM * CHUNK_SIZE) + chunkX * CHUNK_SIZE + x;
          const gY = regionY * (REGION_DIM * CHUNK_SIZE) + chunkY * CHUNK_SIZE + y;
          const gZ = regionZ * (REGION_DIM * CHUNK_SIZE) + chunkZ * CHUNK_SIZE + z;

          let voxel = VoxelTypesDefault.Air;

          if (gY > SKY_LEVEL) {
            const n = perlinNoise3D(gX * cloudScale, gY * cloudScale, gZ * cloudScale);
            voxel = (n > cloudThr) ? VoxelTypesDefault.Cloud : VoxelTypesDefault.Air;
          } else {
            const surfaceNoise = perlinNoise3D(gX * sScale, 0, gZ * sScale);
            const surfaceH = GROUND_LEVEL + Math.floor(Math.abs(surfaceNoise) * 20);
            if (gY < surfaceH) {
              voxel = (gY === surfaceH - 1) ? VoxelTypesDefault.Grass : VoxelTypesDefault.Dirt;
            }
            if (gY < GROUND_LEVEL) {
              const cave = perlinNoise3D(gX * cScale, gY * cScale, gZ * cScale);
              voxel = (cave > cThr) ? VoxelTypesDefault.Rock : VoxelTypesDefault.Air;
            }
          }

          data[x + CHUNK_SIZE * (y + CHUNK_SIZE * z)] = voxel;
        }
      }
    }

    return new VoxelChunk(data);
  }

  getOrCreateChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ){
    const key = `${regionX}-${regionY}-${regionZ}-${chunkX}-${chunkY}-${chunkZ}`;
    if (this.worldCache.has(key)) return this.worldCache.get(key);
    const c = this.generateLogicalChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
    this.worldCache.set(key, c);
    return c;
  }

  createChunkWithShell(regionX, regionY, regionZ, chunkX, chunkY, chunkZ){
    const shell = new Uint8Array(SHELL_SIZE * SHELL_SIZE * SHELL_SIZE);
    for (let x=0; x<SHELL_SIZE; x++) {
      for (let y=0; y<SHELL_SIZE; y++) {
        for (let z=0; z<SHELL_SIZE; z++) {
          const ix = x - 1, iy = y - 1, iz = z - 1;
          let v = VoxelTypesDefault.Air;
          if (ix>=0 && ix<CHUNK_SIZE && iy>=0 && iy<CHUNK_SIZE && iz>=0 && iz<CHUNK_SIZE) {
            const c = this.getOrCreateChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
            v = c.getVoxel(ix,iy,iz);
          } else {
            let nRX = regionX, nRY = regionY, nRZ = regionZ;
            let nCX = chunkX,  nCY = chunkY,  nCZ = chunkZ;
            let nIX = ix,      nIY = iy,      nIZ = iz;

            if (ix < 0) { nCX--; nIX = CHUNK_SIZE-1; }
            else if (ix >= CHUNK_SIZE) { nCX++; nIX = 0; }
            if (iy < 0) { nCY--; nIY = CHUNK_SIZE-1; }
            else if (iy >= CHUNK_SIZE) { nCY++; nIY = 0; }
            if (iz < 0) { nCZ--; nIZ = CHUNK_SIZE-1; }
            else if (iz >= CHUNK_SIZE) { nCZ++; nIZ = 0; }

            if (nCX < 0) { nRX--; nCX = REGION_DIM-1; }
            else if (nCX >= REGION_DIM) { nRX++; nCX = 0; }
            if (nCY < 0) { nRY--; nCY = REGION_DIM-1; }
            else if (nCY >= REGION_DIM) { nRY++; nCY = 0; }
            if (nCZ < 0) { nRZ--; nCZ = REGION_DIM-1; }
            else if (nCZ >= REGION_DIM) { nRZ++; nCZ = 0; }

            const nc = this.getOrCreateChunk(nRX, nRY, nRZ, nCX, nCY, nCZ);
            v = nc.getVoxel(nIX, nIY, nIZ);
          }
          shell[x + SHELL_SIZE * (y + SHELL_SIZE * z)] = v;
        }
      }
    }
    return shell;
  }

  writeRegionFile(regionX, regionY, regionZ){
    const chunks = [];
    const types  = [];
    for (let cx=0; cx<REGION_DIM; cx++) {
      for (let cy=0; cy<REGION_DIM; cy++) {
        for (let cz=0; cz<REGION_DIM; cz++) {
          const type = this.determineChunkType(regionX, regionY, regionZ, cx, cy, cz);
          const shell = this.createChunkWithShell(regionX, regionY, regionZ, cx, cy, cz);
          chunks.push(shell);
          types.push(type);
        }
      }
    }

    const totalChunks = TOTAL_CHUNKS;
    const headerSize = 11;
    const indexTableSize = totalChunks * 5;
    const chunkDataOffset = headerSize + indexTableSize;

    const indexTable = new Uint8Array(indexTableSize);
    let currentOffset = chunkDataOffset;
    for (let i = 0; i < totalChunks; i++) {
      indexTable[i*5 + 0] = (currentOffset >> 16) & 0xFF;
      indexTable[i*5 + 1] = (currentOffset >> 8) & 0xFF;
      indexTable[i*5 + 2] = currentOffset & 0xFF;
      indexTable[i*5 + 3] = (CHUNK_RECORD_SIZE >> 8) & 0xFF;
      indexTable[i*5 + 4] = CHUNK_RECORD_SIZE & 0xFF;
      currentOffset += CHUNK_RECORD_SIZE;
    }

    const totalFileSize = chunkDataOffset + totalChunks * CHUNK_RECORD_SIZE;
    const finalBuffer = new ArrayBuffer(totalFileSize);
    const view = new DataView(finalBuffer);

    view.setUint32(0, 0x564F584C, false);
    view.setUint8(4, CONFIG.FILE.VERSION);
    view.setUint8(5, SHELL_SIZE); view.setUint8(6, SHELL_SIZE); view.setUint8(7, SHELL_SIZE);
    view.setUint8(8, 0); view.setUint8(9, 0); view.setUint8(10, totalChunks);

    new Uint8Array(finalBuffer, headerSize, indexTableSize).set(indexTable);

    let dataOffset = chunkDataOffset;
    for (let i=0; i<totalChunks; i++) {
      new Uint8Array(finalBuffer, dataOffset, 1)[0] = types[i];
      dataOffset += CHUNK_HEADER_BYTES;
      new Uint8Array(finalBuffer, dataOffset, BYTES_PER_CHUNK).set(chunks[i]);
      dataOffset += BYTES_PER_CHUNK;
    }

    return finalBuffer;
  }
}

// =====================
// LOGICA WORKER
// =====================
const generator = new WorldGenerator();

self.onmessage = (event) => {
  const { type, regionX, regionY, regionZ } = event.data || {};
  if (type !== 'generateRegion') return;
  try {
    const buffer = generator.writeRegionFile(regionX, regionY, regionZ);
    self.postMessage({ type: 'regionGenerated', regionX, regionY, regionZ, buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', regionX, regionY, regionZ, message: err?.message || 'unknown error' });
  }
};
