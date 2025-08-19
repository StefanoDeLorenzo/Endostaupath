// generator.js — Region generator worker (FILE VERSION = 5)
// Dipendenze: voxel_types.js (UMD) — deve essere caricabile via importScripts
// Output: postMessage({ type:'regionGenerated', regionX, regionY, regionZ, buffer }, [buffer])

// ---------------------------------------------------------
// 0) Import libreria voxel (tipi, palette, regole, ecc.)
// ---------------------------------------------------------
try {
  // se gira in worker classico
  importScripts('voxel_types.js');
} catch (_) {
  // se già presente (per test), ignora
}
const {
  ChunkType, Medium, VoxelSet,
  makePaletteForChunkType, borderBit, getTypeId
} = (self.VoxelLib || window.VoxelLib);

// ---------------------------------------------------------
// 1) Config
// ---------------------------------------------------------
const CONFIG = {
  FILE: { VERSION: 5 }, // [HEADER_CHUNK(12B)][30^3 voxel][mask bordo 1-bit]
  WORLD: { REGION_DIM: 4, CHUNK_SIZE: 30 },
  LEVELS: { SKY_LEVEL: 50, GROUND_LEVEL: 10, SEA_LEVEL: 6 },
  NOISE: {
    surfaceScale: 0.05,
    caveScale: 0.10, caveThreshold: 0.30,
    cloudScale: 0.02, cloudThreshold: 0.40,
    waterModScale: 0.02, waterModAmp: 2
  }
};

// Politica quando il vicino è fuori dalla regione corrente
// 'air' | 'wrap' | 'medium' | 'solid' | 'same'
const BORDER_NEIGHBOR_MODE = 'air';

// ---------------------------------------------------------
// 2) Perlin 3D (come prima)
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 3) Derivate
// ---------------------------------------------------------
const REGION_DIM   = CONFIG.WORLD.REGION_DIM;
const CHUNK_SIZE   = CONFIG.WORLD.CHUNK_SIZE;
const TOTAL_CHUNKS = REGION_DIM*REGION_DIM*REGION_DIM;

const BYTES_30CUBE = CHUNK_SIZE*CHUNK_SIZE*CHUNK_SIZE; // 27000
const FACE_CELLS   = CHUNK_SIZE*CHUNK_SIZE;            // 900
const MASK_BITS    = 6*FACE_CELLS;                     // 5400
const MASK_BYTES   = (MASK_BITS + 7) >> 3;             // 675

const CHUNK_HDR_LEN = 12, CHUNK_HDR_VER = 1;
const CHUNK_RECORD_SIZE = CHUNK_HDR_LEN + BYTES_30CUBE + MASK_BYTES;

const FILE_HEADER_SIZE = 11; // 'VOXL'(4) + ver(1) + dim(3) + count(3)
const INDEX_ENTRY_SIZE = 5;
const INDEX_TABLE_SIZE = TOTAL_CHUNKS * INDEX_ENTRY_SIZE;
const CHUNK_DATA_OFFSET = FILE_HEADER_SIZE + INDEX_TABLE_SIZE;

// ---------------------------------------------------------
// 4) Dati & generatori
// ---------------------------------------------------------
class VoxelChunk30 {
  constructor(chunkType, data30){
    this.chunkType = chunkType; // 0/1/2
    this.data = data30;         // Uint8Array(27k) — valori locali (0..255)
  }
  get(x,y,z){
    if (x<0||y<0||z<0||x>=CHUNK_SIZE||y>=CHUNK_SIZE||z>=CHUNK_SIZE) return 0;
    return this.data[x + CHUNK_SIZE*(y + CHUNK_SIZE*z)];
  }
}
class WorldGenerator {
  constructor(seed=1337){ this.seed=seed; this.cache=new Map(); }
  key(RX,RY,RZ,CX,CY,CZ){ return `${RX}:${RY}:${RZ}:${CX}:${CY}:${CZ}`; }
  determineChunkType(RX,RY,RZ, CX,CY,CZ){
    const baseY = RY*(REGION_DIM*CHUNK_SIZE) + CY*CHUNK_SIZE;
    if (baseY >= CONFIG.LEVELS.SKY_LEVEL) return ChunkType.SKY;
    if (baseY <  CONFIG.LEVELS.SEA_LEVEL) return ChunkType.UNDERWATER;
    return ChunkType.PRAIRIE;
  }
  generateLogicalChunk(RX,RY,RZ, CX,CY,CZ, chunkType){
    const a = new Uint8Array(BYTES_30CUBE);
    const sScale=CONFIG.NOISE.surfaceScale,
          cScale=CONFIG.NOISE.caveScale, cThr=CONFIG.NOISE.caveThreshold,
          clScale=CONFIG.NOISE.cloudScale, clThr=CONFIG.NOISE.cloudThreshold,
          wScale=CONFIG.NOISE.waterModScale, wAmp=CONFIG.NOISE.waterModAmp;

    // alias “valori locali” per scrittura (non blockStateId!)
    let Air, Dirt, Grass, Rock, Cloud, Sand, Water, Coral;
    if (chunkType === ChunkType.UNDERWATER){ // 0=Water,1=Sand,2=Coral,3=Rock,4=Air
      Water=0; Sand=1; Coral=2; Rock=3; Air=4; Cloud=4; Dirt=1; Grass=1;
    } else if (chunkType === ChunkType.SKY){ // 0=Air,4=Cloud
      Air=0; Cloud=4; Dirt=1; Grass=2; Rock=3; Sand=1; Water=0; Coral=2;
    } else { // PRAIRIE: 0=Air,1=Dirt,2=Grass,3=Rock,4=Cloud,5=Water
      Air=0; Dirt=1; Grass=2; Rock=3; Cloud=4; Water=5; Sand=1; Coral=3;
    }

    for (let x=0;x<CHUNK_SIZE;x++){
      for (let y=0;y<CHUNK_SIZE;y++){
        for (let z=0;z<CHUNK_SIZE;z++){
          const gX = RX*(REGION_DIM*CHUNK_SIZE) + CX*CHUNK_SIZE + x;
          const gY = RY*(REGION_DIM*CHUNK_SIZE) + CY*CHUNK_SIZE + y;
          const gZ = RZ*(REGION_DIM*CHUNK_SIZE) + CZ*CHUNK_SIZE + z;

          let val = Air;

          if (chunkType === ChunkType.SKY){
            const n = perlin3(gX*clScale, gY*clScale, gZ*clScale);
            val = (n > clThr) ? Cloud : Air;
          } else {
            const n = perlin3(gX*sScale, 0, gZ*sScale);
            const surfaceH = CONFIG.LEVELS.GROUND_LEVEL + Math.floor(Math.abs(n)*20);
            if (gY < surfaceH) {
              val = (gY === surfaceH-1) ? (chunkType===ChunkType.UNDERWATER ? Sand : Grass) : Dirt;
            }
            if (gY < CONFIG.LEVELS.GROUND_LEVEL){
              const c = perlin3(gX*cScale, gY*cScale, gZ*cScale);
              val = (c > cThr) ? Rock : Air;
            }
            const wNoise = perlin3(gX*wScale, 0, gZ*wScale);
            const localWater = CONFIG.LEVELS.SEA_LEVEL + Math.floor(wNoise*wAmp);
            if (gY <= localWater) {
              if (val === Air) val = Water;
            }
          }

          a[x + CHUNK_SIZE*(y + CHUNK_SIZE*z)] = val;
        }
      }
    }
    return new VoxelChunk30(chunkType, a);
  }
  getOrCreateChunk(RX,RY,RZ, CX,CY,CZ){
    const k = this.key(RX,RY,RZ,CX,CY,CZ);
    if (this.cache.has(k)) return this.cache.get(k);
    const t = this.determineChunkType(RX,RY,RZ,CX,CY,CZ);
    const c = this.generateLogicalChunk(RX,RY,RZ,CX,CY,CZ,t);
    this.cache.set(k,c); return c;
  }
}

// ---------------------------------------------------------
// 5) Maschera bordo 1-bit, usando BlockState → TypeId
//     - palette: locale(0..255) → blockStateId
//     - typeId = getTypeId(blockStateId) per la regola borderBit()
// ---------------------------------------------------------
function buildBorderMask1bit(gen, RX,RY,RZ, CX,CY,CZ, localChunk) {
  const N = CHUNK_SIZE, TOTAL_BITS = 6*(N*N);
  const mask = new Uint8Array((TOTAL_BITS+7)>>3);
  let bit = 0;

  const palSelf = makePaletteForChunkType(localChunk.chunkType);
  const localVal = (x,y,z) => localChunk.get(x,y,z);
  const typeSelf = (x,y,z) => getTypeId( palSelf[ localVal(x,y,z) ] ); // <-- typeId globale

  function setBit(u8, idx, val){ const B=idx>>3, o=idx&7; if(val) u8[B]|=(1<<o); else u8[B]&=~(1<<o); }

  function neighborType(dirX,dirY,dirZ, x,y,z) {
    let nRX=RX, nRY=RY, nRZ=RZ, nCX=CX, nCY=CY, nCZ=CZ;
    let nx=x+dirX, ny=y+dirY, nz=z+dirZ;
    if (nx<0){nCX--; nx=N-1;} else if (nx>=N){nCX++; nx=0;}
    if (ny<0){nCY--; ny=N-1;} else if (ny>=N){nCY++; ny=0;}
    if (nz<0){nCZ--; nz=N-1;} else if (nz>=N){nCZ++; nz=0;}

    // se usciamo dalla regione, applica la politica richiesta
    const out = (nCX<0 || nCX>=REGION_DIM || nCY<0 || nCY>=REGION_DIM || nCZ<0 || nCZ>=REGION_DIM);
    if (out) {
      if (BORDER_NEIGHBOR_MODE === 'air')    return VoxelSet.T.Air;   // come richiesto
      if (BORDER_NEIGHBOR_MODE === 'medium') return (localChunk.chunkType===ChunkType.UNDERWATER) ? VoxelSet.T.Water : VoxelSet.T.Air;
      if (BORDER_NEIGHBOR_MODE === 'solid')  return VoxelSet.T.Rock;
      if (BORDER_NEIGHBOR_MODE === 'same')   return typeSelf(x,y,z);
      // 'wrap': continua sotto
    }

    if (nCX<0){nRX--; nCX=REGION_DIM-1;} else if (nCX>=REGION_DIM){nRX++; nCX=0;}
    if (nCY<0){nRY--; nCY=REGION_DIM-1;} else if (nCY>=REGION_DIM){nRY++; nCY=0;}
    if (nCZ<0){nRZ--; nCZ=REGION_DIM-1;} else if (nCZ>=REGION_DIM){nRZ++; nCZ=0;}

    const neigh = gen.getOrCreateChunk(nRX,nRY,nRZ, nCX,nCY,nCZ);
    const palNei = makePaletteForChunkType(neigh.chunkType);
    const v = neigh.get(nx,ny,nz);
    const bsId = palNei[v];           // blockStateId
    return getTypeId(bsId);           // typeId globale, per regola borderBit()
  }

  // Regola finale: 1 = disegna, 0 = no
  const bbit = (tSelf, tNei) => borderBit(tSelf, tNei);

  // +X
  for (let y=0;y<N;y++) for (let z=0;z<N;z++){
    setBit(mask, bit++, bbit( typeSelf(N-1,y,z), neighborType(+1,0,0, N-1,y,z) ));
  }
  // -X
  for (let y=0;y<N;y++) for (let z=0;z<N;z++){
    setBit(mask, bit++, bbit( typeSelf(0,y,z), neighborType(-1,0,0, 0,y,z) ));
  }
  // +Y
  for (let x=0;x<N;x++) for (let z=0;z<N;z++){
    setBit(mask, bit++, bbit( typeSelf(x,N-1,z), neighborType(0,+1,0, x,N-1,z) ));
  }
  // -Y
  for (let x=0;x<N;x++) for (let z=0;z<N;z++){
    setBit(mask, bit++, bbit( typeSelf(x,0,z), neighborType(0,-1,0, x,0,z) ));
  }
  // +Z
  for (let x=0;x<N;x++) for (let y=0;y<N;y++){
    setBit(mask, bit++, bbit( typeSelf(x,y,N-1), neighborType(0,0,+1, x,y,N-1) ));
  }
  // -Z
  for (let x=0;x<N;x++) for (let y=0;y<N;y++){
    setBit(mask, bit++, bbit( typeSelf(x,y,0), neighborType(0,0,-1, x,y,0) ));
  }

  return mask;
}

// ---------------------------------------------------------
// 6) Scrittura file regione (v5)
// ---------------------------------------------------------
function writeChunkHeader(view, baseOffset, {
  chunkType, mediumType, paletteId=0, flags=0,
  waterLevel=-1, temp=0, humidity=0
}){
  // Header 12B: [LEN][VER][CHUNK_TYPE][MEDIUM][PALETTE_ID][FLAGS][WATER_LEVEL:i16][TEMP:i8][HUM:i8]
  const u8 = new Uint8Array(view.buffer, baseOffset, CHUNK_HDR_LEN);
  let o = 0;
  u8[o++] = CHUNK_HDR_LEN;
  u8[o++] = CHUNK_HDR_VER;
  u8[o++] = chunkType & 0xFF;
  u8[o++] = mediumType & 0xFF;        // 0=Air,1=Water,...
  u8[o++] = paletteId & 0xFF;
  u8[o++] = flags & 0xFF;
  view.setInt16(baseOffset + o, waterLevel|0, false); o += 2; // big-endian
  u8[o++] = (temp|0) & 0xFF;
  u8[o++] = (humidity|0) & 0xFF;
  return CHUNK_HDR_LEN;
}

function writeRegionFile(gen, RX,RY,RZ){
  const chunks = [], types = [], masks = [];

  for (let CX=0; CX<REGION_DIM; CX++){
    for (let CY=0; CY<REGION_DIM; CY++){
      for (let CZ=0; CZ<REGION_DIM; CZ++){
        const ch = gen.getOrCreateChunk(RX,RY,RZ, CX,CY,CZ);
        const m  = buildBorderMask1bit(gen, RX,RY,RZ, CX,CY,CZ, ch);
        chunks.push(ch); types.push(ch.chunkType); masks.push(m);
      }
    }
  }

  const buffer = new ArrayBuffer(CHUNK_DATA_OFFSET + TOTAL_CHUNKS*CHUNK_RECORD_SIZE);
  const view = new DataView(buffer);

  // Header file
  view.setUint32(0, 0x564F584C, false); // 'VOXL'
  view.setUint8(4, CONFIG.FILE.VERSION);
  view.setUint8(5, CHUNK_SIZE);
  view.setUint8(6, CHUNK_SIZE);
  view.setUint8(7, CHUNK_SIZE);
  view.setUint8(8, 0); view.setUint8(9, 0); view.setUint8(10, TOTAL_CHUNKS);

  // Tabella indici
  const idx = new Uint8Array(buffer, FILE_HEADER_SIZE, INDEX_TABLE_SIZE);
  let off = CHUNK_DATA_OFFSET;
  for (let i=0;i<TOTAL_CHUNKS;i++){
    idx[i*5+0] = (off >> 16) & 0xFF;
    idx[i*5+1] = (off >> 8)  & 0xFF;
    idx[i*5+2] = (off)       & 0xFF;
    idx[i*5+3] = (CHUNK_RECORD_SIZE >> 8) & 0xFF;
    idx[i*5+4] = (CHUNK_RECORD_SIZE)      & 0xFF;
    off += CHUNK_RECORD_SIZE;
  }

  // Dati chunk
  let ptr = CHUNK_DATA_OFFSET;
  for (let i=0;i<TOTAL_CHUNKS;i++){
    const chunkType = types[i];
    const mediumType = (chunkType === ChunkType.UNDERWATER) ? Medium.Water : Medium.Air;

    ptr += writeChunkHeader(view, ptr, {
      chunkType, mediumType, paletteId: 0, flags: 0,
      waterLevel: CONFIG.LEVELS.SEA_LEVEL, temp: 0, humidity: 0
    });

    new Uint8Array(buffer, ptr, BYTES_30CUBE).set(chunks[i].data);
    ptr += BYTES_30CUBE;

    new Uint8Array(buffer, ptr, MASK_BYTES).set(masks[i]);
    ptr += MASK_BYTES;
  }

  return buffer;
}

// ---------------------------------------------------------
// 7) Worker API
// ---------------------------------------------------------
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
