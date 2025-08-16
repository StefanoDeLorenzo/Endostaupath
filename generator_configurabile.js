// generator.js — Worker generazione regioni (FILE VERSION = 5)
// Output: postMessage({ type:'regionGenerated', regionX, regionY, regionZ, buffer }, [buffer])
// Responsabilità: SOLO dati (header chunk, 30^3 voxel, maschere di bordo a 1 bit).
// La logica "disegnare/non disegnare" resta nel worker.js.

// =====================
// CONFIG
// =====================
const CONFIG = {
  FILE: {
    VERSION: 5,                // v5: [HEADER_CHUNK(12B)][30^3 voxel][mask bordo 1-bit]
  },
  WORLD: {
    REGION_DIM: 4,             // 4x4x4 chunk per regione
    CHUNK_SIZE: 30,            // voxel interni
  },
  LEVELS: {
    SKY_LEVEL: 50,
    GROUND_LEVEL: 10,
    SEA_LEVEL: 6,              // livello "acqua" base (usato anche in prateria)
  },
  NOISE: {
    surfaceScale: 0.05,        // terreno
    caveScale: 0.10,           // caverne
    caveThreshold: 0.30,
    cloudScale: 0.02,          // nuvole
    cloudThreshold: 0.40,
    waterModScale: 0.02,       // modula leggermente il livello dell'acqua (laghi/insenature)
    waterModAmp: 2,            // +/- ampiezza in voxel del livello acqua locale
  },
};

// =====================
// VoxelSet: tipi globali logici
// =====================
const VoxelSet = (() => {
  const T = {
    Air:   0,
    Dirt:  1,
    Grass: 2,
    Rock:  3,
    Wood:  4,
    Water: 5,
    Acid:  6,
    Lava:  7,
    Cloud: 8,
    Sand:  9,
    Coral: 10,
  };
  const C = { Air:0, Opaque:1, Water:2, Acid:3, Lava:4, Cloud:5 };

  const meta = [];
  meta[T.Air]   = { key:"Air",   category:C.Air,   transparent:false };
  meta[T.Dirt]  = { key:"Dirt",  category:C.Opaque,transparent:false };
  meta[T.Grass] = { key:"Grass", category:C.Opaque,transparent:false };
  meta[T.Rock]  = { key:"Rock",  category:C.Opaque,transparent:false };
  meta[T.Wood]  = { key:"Wood",  category:C.Opaque,transparent:false };
  meta[T.Water] = { key:"Water", category:C.Water, transparent:true  };
  meta[T.Acid]  = { key:"Acid",  category:C.Acid,  transparent:true  };
  meta[T.Lava]  = { key:"Lava",  category:C.Lava,  transparent:true  };
  meta[T.Cloud] = { key:"Cloud", category:C.Cloud, transparent:true  };
  meta[T.Sand]  = { key:"Sand",  category:C.Opaque,transparent:false };
  meta[T.Coral] = { key:"Coral", category:C.Opaque,transparent:false };

  const isAir         = (id) => id === T.Air;
  const isTransparent = (id) => !!meta[id]?.transparent;
  const isSolid       = (id) => !isAir(id) && !isTransparent(id);

  return { T, C, meta, isAir, isTransparent, isSolid };
})();

// =====================
// Palette per chunkType: valore locale (0..255) -> typeId globale (VoxelSet)
// (oggi solo cubi; in futuro potrai far mappare anche shape/orientazione nel worker)
// =====================
function makePaletteForChunkType(chunkType) {
  // 0=prairie, 1=underwater, 2=sky
  const m = new Uint8Array(256); // default = Air
  m.fill(VoxelSet.T.Air);

  if (chunkType === 1) { // underwater
    // locale: 0=Water,1=Sand,2=Coral,3=Rock,4=Air
    m[0] = VoxelSet.T.Water;
    m[1] = VoxelSet.T.Sand;
    m[2] = VoxelSet.T.Coral;
    m[3] = VoxelSet.T.Rock;
    m[4] = VoxelSet.T.Air;
  } else if (chunkType === 2) { // sky
    // locale: 0=Air,4=Cloud
    m[0] = VoxelSet.T.Air;
    m[4] = VoxelSet.T.Cloud;
  } else { // prairie (default)
    // locale: 0=Air,1=Dirt,2=Grass,3=Rock,4=Cloud,5=Water
    m[0] = VoxelSet.T.Air;
    m[1] = VoxelSet.T.Dirt;
    m[2] = VoxelSet.T.Grass;
    m[3] = VoxelSet.T.Rock;
    m[4] = VoxelSet.T.Cloud;
    m[5] = VoxelSet.T.Water; // <--- acqua anche in prateria
  }
  return m;
}

// =====================
// PERLIN 3D
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

// =====================
// COSTANTI DERIVATE
// =====================
const REGION_DIM = CONFIG.WORLD.REGION_DIM;
const CHUNK_SIZE = CONFIG.WORLD.CHUNK_SIZE;
const TOTAL_CHUNKS = REGION_DIM * REGION_DIM * REGION_DIM;

const BYTES_30CUBE = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;     // 27.000
const FACE_CELLS   = CHUNK_SIZE * CHUNK_SIZE;                   // 900
const MASK_BITS    = 6 * FACE_CELLS;                            // 5400 bit
const MASK_BYTES   = (MASK_BITS + 7) >> 3;                      // 675 byte

const CHUNK_HDR_LEN  = 12;                                      // header per-chunk (compatto)
const CHUNK_HDR_VER  = 1;
const CHUNK_RECORD_SIZE = CHUNK_HDR_LEN + BYTES_30CUBE + MASK_BYTES;

const FILE_HEADER_SIZE = 11;                                    // 'VOXL'(4) + ver(1) + dim(3) + count(3)
const INDEX_ENTRY_SIZE = 5;                                     // 3B offset + 2B size
const INDEX_TABLE_SIZE = TOTAL_CHUNKS * INDEX_ENTRY_SIZE;
const CHUNK_DATA_OFFSET = FILE_HEADER_SIZE + INDEX_TABLE_SIZE;

// =====================
// MODELLI DATI
// =====================
class VoxelChunk30 {
  constructor(chunkType, data30){
    this.chunkType = chunkType;          // 0 prairie, 1 underwater, 2 sky
    this.data = data30;                  // Uint8Array(27k) valori locali (0..255)
  }
  get(x,y,z){
    if (x<0||y<0||z<0||x>=CHUNK_SIZE||y>=CHUNK_SIZE||z>=CHUNK_SIZE) return 0;
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
    // palette locale (valore -> typeId globale)
    const pal = makePaletteForChunkType(chunkType);

    const sScale   = CONFIG.NOISE.surfaceScale;
    const cScale   = CONFIG.NOISE.caveScale, cThr = CONFIG.NOISE.caveThreshold;
    const clScale  = CONFIG.NOISE.cloudScale, clThr = CONFIG.NOISE.cloudThreshold;
    const wScale   = CONFIG.NOISE.waterModScale, wAmp = CONFIG.NOISE.waterModAmp;

    // comodi alias “valore locale” per scrittura (non typeId!)
    let Air, Dirt, Grass, Rock, Cloud, Sand, Water, Coral;
    if (chunkType === 1){ // underwater: 0=Water,1=Sand,2=Coral,3=Rock,4=Air
      Water=0; Sand=1; Coral=2; Rock=3; Air=4; Cloud=4; Dirt=1; Grass=1; // placeholder
    } else if (chunkType === 2){ // sky: 0=Air,4=Cloud
      Air=0; Cloud=4; Dirt=1; Grass=2; Rock=3; Sand=1; Water=0; Coral=2; // placeholder
    } else { // prairie: 0=Air,1=Dirt,2=Grass,3=Rock,4=Cloud,5=Water
      Air=0; Dirt=1; Grass=2; Rock=3; Cloud=4; Water=5; Sand=1; Coral=3; // placeholder
    }

    for (let x=0; x<CHUNK_SIZE; x++){
      for (let y=0; y<CHUNK_SIZE; y++){
        for (let z=0; z<CHUNK_SIZE; z++){
          const gX = RX*(REGION_DIM*CHUNK_SIZE) + CX*CHUNK_SIZE + x;
          const gY = RY*(REGION_DIM*CHUNK_SIZE) + CY*CHUNK_SIZE + y;
          const gZ = RZ*(REGION_DIM*CHUNK_SIZE) + CZ*CHUNK_SIZE + z;

          let val = Air;

          if (chunkType === 2) {
            // SKY: aria + nuvole
            const n = perlin3(gX*clScale, gY*clScale, gZ*clScale);
            val = (n > clThr) ? Cloud : Air;
          } else {
            // Altezza terreno
            const n = perlin3(gX*sScale, 0, gZ*sScale);
            const surfaceH = CONFIG.LEVELS.GROUND_LEVEL + Math.floor(Math.abs(n)*20);

            if (gY < surfaceH) {
              val = (gY === surfaceH-1) ? (chunkType===1 ? Sand : Grass) : Dirt;
            }

            // Caverne sotto ground_level
            if (gY < CONFIG.LEVELS.GROUND_LEVEL){
              const c = perlin3(gX*cScale, gY*cScale, gZ*cScale);
              val = (c > cThr) ? Rock : Air;
            }

            // Acqua: sia in UNDERWATER che in PRAIRIE sotto un livello modulato
            // livello acqua locale: SEA_LEVEL +/- wAmp in base al noise
            const wNoise = perlin3(gX*wScale, 0, gZ*wScale);
            const localWaterLevel = CONFIG.LEVELS.SEA_LEVEL + Math.floor(wNoise * wAmp);

            if (gY <= localWaterLevel) {
              // se è aria (vuoto), riempi d'acqua
              if (val === Air) val = Water;
              // se prateria e a pelo d'acqua, puoi avere sabbia sui bordi bassi
              if (chunkType === 0 && gY === localWaterLevel && val === Dirt) {
                // un po' di sabbia ai margini del lago/rivera
                if ((gX + gZ) % 7 === 0) val = Dirt; // lascia un po' irregolare
              }
            }
          }

          a[x + CHUNK_SIZE*(y + CHUNK_SIZE*z)] = val;
        }
      }
    }

    return new VoxelChunk30(chunkType, a);
  }

  getOrCreateChunk(RX,RY,RZ, CX,CY,CZ){
    const k = this.key(RX,RY,RZ, CX,CY,CZ);
    if (this.cache.has(k)) return this.cache.get(k);
    const t = this.determineChunkType(RX,RY,RZ, CX,CY,CZ);
    const c = this.generateLogicalChunk(RX,RY,RZ, CX,CY,CZ, t);
    this.cache.set(k, c);
    return c;
  }
}

// =====================
// MASCHERA BORDO 1-BIT (decisione già calcolata) — niente guscio
// Regola: 1 (disegna) se vicino è Air oppure è Trasparente (non-Air) di tipo diverso.
//         0 (non disegnare) se vicino è Solido, oppure Trasparente dello stesso tipo, oppure self è Air.
// =====================
function buildBorderMask1bit(gen, RX,RY,RZ, CX,CY,CZ, localChunk) {
  const N = CHUNK_SIZE, FACE_CELLS = N*N, TOTAL_BITS = 6*FACE_CELLS;
  const mask = new Uint8Array((TOTAL_BITS+7)>>3);
  let bit = 0;

  const palSelf = makePaletteForChunkType(localChunk.chunkType);
  const localVal = (x,y,z) => localChunk.get(x,y,z);
  const typeSelf = (x,y,z) => palSelf[ localVal(x,y,z) ];

  function neighborType(dirX,dirY,dirZ, x,y,z) {
    let nRX=RX, nRY=RY, nRZ=RZ, nCX=CX, nCY=CY, nCZ=CZ;
    let nx=x+dirX, ny=y+dirY, nz=z+dirZ;
    if (nx<0){nCX--; nx=N-1;} else if (nx>=N){nCX++; nx=0;}
    if (ny<0){nCY--; ny=N-1;} else if (ny>=N){nCY++; ny=0;}
    if (nz<0){nCZ--; nz=N-1;} else if (nz>=N){nCZ++; nz=0;}
    if (nCX<0){nRX--; nCX=REGION_DIM-1;} else if (nCX>=REGION_DIM){nRX++; nCX=0;}
    if (nCY<0){nRY--; nCY=REGION_DIM-1;} else if (nCY>=REGION_DIM){nRY++; nCY=0;}
    if (nCZ<0){nRZ--; nCZ=REGION_DIM-1;} else if (nCZ>=REGION_DIM){nRZ++; nCZ=0;}
    const neigh = gen.getOrCreateChunk(nRX,nRY,nRZ, nCX,nCY,nCZ);
    const palNei = makePaletteForChunkType(neigh.chunkType);
    const v = neigh.get(nx,ny,nz);
    return palNei[v]; // typeId globale
  }

  function setBit(u8, idx, val){ const B=idx>>3, o=idx&7; if(val) u8[B]|=(1<<o); else u8[B]&=~(1<<o); }

  function borderBit(tSelf, tNei) {
    if (VoxelSet.isAir(tSelf)) return 0;     // niente facce "dell'aria"
    if (VoxelSet.isAir(tNei))  return 1;     // solido/trasp vs aria => sì
    if (VoxelSet.isSolid(tNei)) return 0;    // contro solido => no
    // vicino trasparente (non-Air) => sì SOLO se tipo diverso
    return (tSelf !== tNei) ? 1 : 0;
  }

  // +X (x=29)
  for (let y=0;y>N;y++) for (let z=0;z<N;z++){
    const tS = typeSelf(N-1,y,z);
    const tN = neighborType(+1,0,0, N-1,y,z);
    setBit(mask, bit++, borderBit(tS, tN));
  }
  // -X (x=0)
  for (let y=0;y<N;y++) for (let z=0;z<N;z++){
    const tS = typeSelf(0,y,z);
    const tN = neighborType(-1,0,0, 0,y,z);
    setBit(mask, bit++, borderBit(tS, tN));
  }
  // +Y (y=29)
  for (let x=0;x<N;x++) for (let z=0;z<N;z++){
    const tS = typeSelf(x,N-1,z);
    const tN = neighborType(0,+1,0, x,N-1,z);
    setBit(mask, bit++, borderBit(tS, tN));
  }
  // -Y (y=0)
  for (let x=0;x<N;x++) for (let z=0;z<N;z++){
    const tS = typeSelf(x,0,z);
    const tN = neighborType(0,-1,0, x,0,z);
    setBit(mask, bit++, borderBit(tS, tN));
  }
  // +Z (z=29)
  for (let x=0;x<N;x++) for (let y=0;y<N;y++){
    const tS = typeSelf(x,y,N-1);
    const tN = neighborType(0,0,+1, x,y,N-1);
    setBit(mask, bit++, borderBit(tS, tN));
  }
  // -Z (z=0)
  for (let x=0;x<N;x++) for (let y=0;y<N;y++){
    const tS = typeSelf(x,y,0);
    const tN = neighborType(0,0,-1, x,y,0);
    setBit(mask, bit++, borderBit(tS, tN));
  }

  return mask; // Uint8Array(675)
}

// =====================
// SCRITTURA FILE REGIONE (v5)
// =====================
function writeChunkHeader(view, baseOffset, {
  chunkType, mediumType, paletteId=0, flags=0,
  waterLevel=-1, temp=0, humidity=0
}){
  // Header 12B: [LEN][VER][CHUNK_TYPE][MEDIUM][PALETTE_ID][FLAGS][WATER_LEVEL:i16][TEMP:i8][HUM:i8]
  const u8 = new Uint8Array(view.buffer, baseOffset, CHUNK_HDR_LEN);
  let o = 0;
  u8[o++] = CHUNK_HDR_LEN;                // LEN
  u8[o++] = CHUNK_HDR_VER;                // VER
  u8[o++] = chunkType & 0xFF;             // CHUNK_TYPE
  u8[o++] = mediumType & 0xFF;            // MEDIUM_TYPE (0=Air,1=Water,2=Acid,3=Lava,...)
  u8[o++] = paletteId & 0xFF;             // PALETTE_ID (non usato ora)
  u8[o++] = flags & 0xFF;                 // FLAGS
  view.setInt16(baseOffset + o, waterLevel|0, false); o += 2; // big-endian
  u8[o++] = (temp|0) & 0xFF;              // TEMP
  u8[o++] = (humidity|0) & 0xFF;          // HUM
  return CHUNK_HDR_LEN;
}

function writeRegionFile(gen, RX,RY,RZ){
  const chunks = [];
  const types  = [];
  const masks  = []; // Uint8Array(675)

  for (let CX=0; CX<REGION_DIM; CX++){
    for (let CY=0; CY<REGION_DIM; CY++){
      for (let CZ=0; CZ<REGION_DIM; CZ++){
        const ch = gen.getOrCreateChunk(RX,RY,RZ, CX,CY,CZ);
        const m  = buildBorderMask1bit(gen, RX,RY,RZ, CX,CY,CZ, ch);
        chunks.push(ch);
        types.push(ch.chunkType);
        masks.push(m);
      }
    }
  }

  const buffer = new ArrayBuffer(CHUNK_DATA_OFFSET + TOTAL_CHUNKS * CHUNK_RECORD_SIZE);
  const view = new DataView(buffer);

  // Header file (11B): 'VOXL', versione, dim chunk (30,30,30), numero chunk (64)
  view.setUint32(0, 0x564F584C, false); // 'VOXL'
  view.setUint8(4, CONFIG.FILE.VERSION);
  view.setUint8(5, CHUNK_SIZE);
  view.setUint8(6, CHUNK_SIZE);
  view.setUint8(7, CHUNK_SIZE);
  view.setUint8(8, 0); view.setUint8(9, 0); view.setUint8(10, TOTAL_CHUNKS);

  // Index table (offset, size per chunk)
  const idx = new Uint8Array(buffer, FILE_HEADER_SIZE, INDEX_TABLE_SIZE);
  let off = CHUNK_DATA_OFFSET;
  for (let i=0; i<TOTAL_CHUNKS; i++){
    idx[i*5+0] = (off >> 16) & 0xFF;
    idx[i*5+1] = (off >> 8)  & 0xFF;
    idx[i*5+2] = (off)       & 0xFF;
    idx[i*5+3] = (CHUNK_RECORD_SIZE >> 8) & 0xFF;
    idx[i*5+4] = (CHUNK_RECORD_SIZE)      & 0xFF;
    off += CHUNK_RECORD_SIZE;
  }

  // Dati per chunk
  let ptr = CHUNK_DATA_OFFSET;
  for (let i=0; i<TOTAL_CHUNKS; i++){
    const chunkType = types[i];
    // mediumType coerente (vuoto del chunk) — utile per mezzi voxel nel worker
    const mediumType = (chunkType === 1) ? 1 /*Water*/ : 0 /*Air*/;
    const headerWritten = writeChunkHeader(view, ptr, {
      chunkType, mediumType,
      paletteId: 0, flags: 0,
      waterLevel: CONFIG.LEVELS.SEA_LEVEL, temp: 0, humidity: 0
    });
    ptr += headerWritten;

    // 30^3 valori locali
    new Uint8Array(buffer, ptr, BYTES_30CUBE).set(chunks[i].data);
    ptr += BYTES_30CUBE;

    // maschera bordo 1-bit
    new Uint8Array(buffer, ptr, MASK_BYTES).set(masks[i]);
    ptr += MASK_BYTES;
  }

  return buffer;
}

// =====================
// WORLD GENERATOR
// =====================
const gen = new WorldGenerator();

self.onmessage = (ev) => {
  const { type, regionX, regionY, regionZ } = ev.data || {};
  if (type !== 'generateRegion') return;
  try {
    const buf = writeRegionFile(gen, regionX, regionY, regionZ);
    self.postMessage({ type:'regionGenerated', regionX, regionY, regionZ, buffer: buf }, [buf]);
  } catch (e) {
    self.postMessage({ type:'error', message: e?.message || 'unknown error', regionX, regionY, regionZ });
  }
};
