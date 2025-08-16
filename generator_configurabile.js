// generator.js — Worker generazione regioni (FILE VERSION = 4)
// Output: postMessage({ type:'regionGenerated', regionX, regionY, regionZ, buffer }, [buffer])
// Responsabilità: SOLO dati (chunkType, 30^3 voxel, maschere CATEGORIA-NEIGHBOR 3-bit).
// La logica "disegnare/non disegnare" resta nel worker.js.

//// =====================
// CONFIG
//// =====================
const CONFIG = {
  FILE: {
    VERSION: 4,                // v4: [1B chunkType][30^3 voxel][6 facce * 900 celle * 3 bit categoria vicino]
  },
  WORLD: {
    REGION_DIM: 4,             // 4x4x4 chunk per regione
    CHUNK_SIZE: 30,            // voxel interni
  },
  LEVELS: {
    SKY_LEVEL: 50,
    GROUND_LEVEL: 10,
    SEA_LEVEL: 6,
  },
  NOISE: {
    surfaceScale: 0.05,        // terreno
    caveScale: 0.10,           // caverne
    caveThreshold: 0.30,
    cloudScale: 0.02,          // nuvole
    cloudThreshold: 0.40,
  },
  // palette "valori" per la generazione logica (per chunkType)
  PALETTE_VALUES: {
    PRAIRIE:   { Air:0, Dirt:1, Grass:2, Rock:3, Cloud:4 },
    UNDERWATER:{ Water:0, Sand:1, Coral:2, Rock:3, Air:4 },
    SKY:       { Air:0, Cloud:4 },
  }
};

// categorie condivise (usate solo come codifica dati, NON per decisione qui)
const C = { Air:0, Opaque:1, Water:2, Acid:3, Lava:4, Cloud:5 };

//// =====================
// PERLIN 3D
//// =====================
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
for (let i=0; i<256; i++) p[i] = p[i+256] = permutation[i];

function fade(t){ return t*t*t*(t*(t*6 - 15) + 10); }
function lerp(t,a,b){ return a + t*(b - a); }
function grad(h, x, y, z){
  const u = (h&15) < 8 ? x : y;
  const v = (h&15) < 4 ? y : ((h&15)===12|| (h&15)===14 ? x : z);
  return ((h&1)===0 ? u : -u) + ((h&2)===0 ? v : -v);
}
function perlin3(x, y, z){
  let X = Math.floor(x)&255, Y = Math.floor(y)&255, Z = Math.floor(z)&255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = p[X]+Y, AA = p[A]+Z, AB = p[A+1]+Z;
  const B = p[X+1]+Y, BA = p[B]+Z, BB = p[B+1]+Z;
  return lerp(w,
    lerp(v, lerp(u, grad(p[AA], x, y, z),     grad(p[BA], x-1, y, z)),
             lerp(u, grad(p[AB], x, y-1, z),  grad(p[BB], x-1, y-1, z))),
    lerp(v, lerp(u, grad(p[AA+1], x, y, z-1), grad(p[BA+1], x-1, y, z-1)),
             lerp(u, grad(p[AB+1], x, y-1, z-1), grad(p[BB+1], x-1, y-1, z-1))));
}

//// =====================
// COSTANTI DERIVATE
//// =====================
const REGION_DIM = CONFIG.WORLD.REGION_DIM;
const CHUNK_SIZE = CONFIG.WORLD.CHUNK_SIZE;
const TOTAL_CHUNKS = REGION_DIM * REGION_DIM * REGION_DIM;

const BYTES_30CUBE = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;        // 27.000
const FACE_CELLS   = CHUNK_SIZE * CHUNK_SIZE;                      // 900
const CAT_BITS     = 3;                                            // 3 bit per cella
const MASK_BITS    = 6 * FACE_CELLS * CAT_BITS;                    // 16.200 bit
const MASK_BYTES   = (MASK_BITS + 7) >> 3;                         // 2.025 byte

const CHUNK_HEADER_BYTES = 1;                                      // 1B chunkType
const CHUNK_RECORD_SIZE  = CHUNK_HEADER_BYTES + BYTES_30CUBE + MASK_BYTES;

const FILE_HEADER_SIZE   = 11;                                     // 'VOXL'(4) + ver(1) + dim(3) + count(3)
const INDEX_ENTRY_SIZE   = 5;                                      // 3B offset + 2B size
const INDEX_TABLE_SIZE   = TOTAL_CHUNKS * INDEX_ENTRY_SIZE;
const CHUNK_DATA_OFFSET  = FILE_HEADER_SIZE + INDEX_TABLE_SIZE;

//// =====================
// PALETTE -> CATEGORIA (solo mapping dati)
//// =====================
function categoryFromValue(chunkType, value){
  switch (chunkType) {
    case 1: { // UNDERWATER
      const P = CONFIG.PALETTE_VALUES.UNDERWATER; // { Water:0, Sand:1, Coral:2, Rock:3, Air:4 }
      if (value === P.Air)   return C.Air;
      if (value === P.Water) return C.Water;
      if (value === P.Sand)  return C.Opaque;
      if (value === P.Coral) return C.Opaque;
      if (value === P.Rock)  return C.Opaque;
      return C.Opaque;
    }
    case 2: { // SKY
      const P = CONFIG.PALETTE_VALUES.SKY; // { Air:0, Cloud:4 }
      if (value === P.Air)   return C.Air;
      if (value === P.Cloud) return C.Cloud;
      return C.Air;
    }
    default: { // 0 PRAIRIE
      const P = CONFIG.PALETTE_VALUES.PRAIRIE; // { Air:0, Dirt:1, Grass:2, Rock:3, Cloud:4 }
      if (value === P.Air)   return C.Air;
      if (value === P.Cloud) return C.Cloud;
      return C.Opaque; // Dirt/Grass/Rock
    }
  }
}

//// =====================
// MODELLI DATI
//// =====================
class VoxelChunk30 {
  constructor(chunkType, data30){
    this.chunkType = chunkType;
    this.data = data30; // Uint8Array(27k)
  }
  get(x,y,z){
    if (x<0||y<0||z<0||x>=CHUNK_SIZE||y>=CHUNK_SIZE||z>=CHUNK_SIZE) return null;
    return this.data[x + CHUNK_SIZE*(y + CHUNK_SIZE*z)];
  }
}

class WorldGenerator {
  constructor(seed=1337){
    this.seed = seed;
    this.cache = new Map(); // key -> VoxelChunk30
  }

  key(RX,RY,RZ, CX,CY,CZ){ return `${RX}:${RY}:${RZ}:${CX}:${CY}:${CZ}`; }

  determineChunkType(RX,RY,RZ, CX,CY,CZ){
    const worldBaseY = RY * (REGION_DIM * CHUNK_SIZE) + CY * CHUNK_SIZE;
    if (worldBaseY >= CONFIG.LEVELS.SKY_LEVEL) return 2;  // SKY
    if (worldBaseY <  CONFIG.LEVELS.SEA_LEVEL) return 1;  // UNDERWATER
    return 0;                                             // PRAIRIE
  }

  generateLogicalChunk(RX,RY,RZ, CX,CY,CZ, chunkType){
    const a = new Uint8Array(BYTES_30CUBE);
    const sScale = CONFIG.NOISE.surfaceScale;
    const cScale = CONFIG.NOISE.caveScale, cThr = CONFIG.NOISE.caveThreshold;
    const clScale = CONFIG.NOISE.cloudScale, clThr = CONFIG.NOISE.cloudThreshold;

    const PV = (chunkType===1) ? CONFIG.PALETTE_VALUES.UNDERWATER
             : (chunkType===2) ? CONFIG.PALETTE_VALUES.SKY
                               : CONFIG.PALETTE_VALUES.PRAIRIE;

    for (let x=0; x<CHUNK_SIZE; x++){
      for (let y=0; y<CHUNK_SIZE; y++){
        for (let z=0; z<CHUNK_SIZE; z++){
          const gX = RX*(REGION_DIM*CHUNK_SIZE) + CX*CHUNK_SIZE + x;
          const gY = RY*(REGION_DIM*CHUNK_SIZE) + CY*CHUNK_SIZE + y;
          const gZ = RZ*(REGION_DIM*CHUNK_SIZE) + CZ*CHUNK_SIZE + z;

          let v = PV.Air;

          if (chunkType === 2) {
            const n = perlin3(gX*clScale, gY*clScale, gZ*clScale);
            v = (n > clThr) ? PV.Cloud : PV.Air;
          } else {
            const n = perlin3(gX*sScale, 0, gZ*sScale);
            const surfaceH = CONFIG.LEVELS.GROUND_LEVEL + Math.floor(Math.abs(n)*20);
            if (gY < surfaceH) {
              v = (gY === surfaceH-1)
                ? ((chunkType===1) ? PV.Sand : PV.Grass)
                : PV.Dirt;
            }
            if (gY < CONFIG.LEVELS.GROUND_LEVEL){
              const c = perlin3(gX*cScale, gY*cScale, gZ*cScale);
              v = (c > cThr) ? PV.Rock : PV.Air;
            }
            if (chunkType === 1 && gY < CONFIG.LEVELS.SEA_LEVEL) {
              if (v === PV.Air) v = PV.Water;
            }
          }

          a[x + CHUNK_SIZE*(y + CHUNK_SIZE*z)] = v;
        }
      }
    }
    return n
