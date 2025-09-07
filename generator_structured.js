// generator_structured.js
// Generatore strutturato: usa Region/Chunk ma applica la STESSA logica del generator originale.
// - "Logico" 30x30x30
// - Shell: i 32x32x32 includono uno strato esterno, mappando le coord locali 0..31 → logiche -1..30
// - Stesse costanti e VoxelTypes del tuo generator.js
//
// 
// Output: ArrayBuffer nel formato legacy (.voxl) tramite Region.toBuffer().

import { REGION_SCHEMA } from "./src/world/config.js";
import { Region } from "./src/world/region.js";
import { Chunk } from "./src/world/chunk.js";

/* ----------------------- Costanti come nel tuo generator ----------------------- */
const SKY_LEVEL = 50;
const GROUND_LEVEL = 10;
const VoxelTypes = {
  Air:   0,
  Dirt:  1,
  Cloud: 2,
  Grass: 3,
  Rock:  4,
};

/* ---------------------------- Tuo Perlin 3D (copiato) ---------------------------- */
function perlinNoise3D(x, y, z) {
  const p = new Uint8Array(512);
  const permutation = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,175,87,86,232,199,158,58,77,24,226,207,170,182,179,5,236,123,110,150,134,100,16,93,249,112,192,169,211,218,128,76,139,115,127,245,196,49,176,185,19,147,238,156,46,143,205,107,253,178,13,242,198,11,101,145,14,18,184,194,204,173,212,152,17,18,239,210,129,172,197,45,78,16,188,104,19,181,244,209,184,96,22,216,73,126,10,215,200,162,105,114,246,209,138,12,47,118,24,165,208,22,98,166,15,102,235,221,16,233,11,198,48,149,102,60,250,173,228,14,212,213,221,203,167,235,195,219,171,15,168,158,204,135,16,70,113,187,164,119,180,251,80,14,60,159,177,224,225,230,239,216,24,111,218,202,90,89,74,169,186,206,61,91,15,217,132,21,10,12,159,168,79,167,12,143,205,193,214,112,43,25,243,85,246,163,145,154,97,113,144,171,122,191,162,248,201,220,4,189,222,247,65,133,254,195,20,231,183,174,15];
  for (let i = 0; i < 256; i++) p[i] = p[i + 256] = permutation[i];

  function fade(t){ return t*t*t*(t*(t*6-15)+10); }
  function lerp(t,a,b){ return a + t*(b-a); }
  function grad(hash,x,y,z){
    let h = hash & 15;
    let u = h < 8 ? x : y;
    let v = h < 4 ? y : (h===12 || h===14 ? x : z);
    return ((h&1)===0?u:-u) + ((h&2)===0?v:-v);
  }

  let X = Math.floor(x) & 255;
  let Y = Math.floor(y) & 255;
  let Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  let u = fade(x), v = fade(y), w = fade(z);
  let A = p[X] + Y, B = p[X+1] + Y;
  let A0 = p[A] + Z, A1 = p[A+1] + Z, B0 = p[B] + Z, B1 = p[B+1] + Z;

  return lerp(w,
    lerp(v, lerp(u, grad(p[A0], x, y, z),     grad(p[B0], x-1, y, z)),
            lerp(u, grad(p[A1], x, y-1, z),   grad(p[B1], x-1, y-1, z))),
    lerp(v, lerp(u, grad(p[A0+1], x, y, z-1), grad(p[B0+1], x-1, y, z-1)),
            lerp(u, grad(p[A1+1], x, y-1, z-1), grad(p[B1+1], x-1, y-1, z-1)))
  );
}

/* ----------------------- Mappatura globale identica alla tua ----------------------- */
/**
 * Chunk "logico": 30. Grid di regione: 4. Quindi lo span della regione è 4*30=120.
 * Nel 32^3 inseriamo il guscio mappando (x,y,z) locali 0..31 → logici -1..30.
 */
const CHUNK_SIZE   = REGION_SCHEMA.CHUNK_SIZE;          // es. 32 (legacy attuale)
//const LOGICAL_SIZE = REGION_SCHEMA.CHUNK_SIZE; // - 2;      // shell 1-voxel per lato → 30 quando SIZE=32
//const SHELL_MARGIN = (CHUNK_SIZE - LOGICAL_SIZE) >> 1; // =1 con SIZE=32 ; = 0 quando SIZE=30
const REGION_SPAN  = REGION_SCHEMA.GRID * CHUNK_SIZE; // es. 4*30 = 120

function generateChunkData({ chunk, regionX, regionY, regionZ, chunkX, chunkY, chunkZ }) {
  // basi come nel tuo generator: region*120 + chunk*30
  const baseX = regionX * REGION_SPAN + chunkX * CHUNK_SIZE;
  const baseY = regionY * REGION_SPAN + chunkY * CHUNK_SIZE;
  const baseZ = regionZ * REGION_SPAN + chunkZ * CHUNK_SIZE;

  const scale = 0.05;

  for (let z = 0; z < CHUNK_SIZE; z++) {
    const lz = z;
    const globalZ = baseZ + lz;
    for (let y = 0; y < CHUNK_SIZE; y++) {
      const ly = y;
      const globalY = baseY + ly;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const lx = x;
        const globalX = baseX + lx;

        let voxelType = VoxelTypes.Air;

        if (globalY > SKY_LEVEL) {
          const cloudNoise = perlinNoise3D(globalX * 0.02, globalY * 0.02, globalZ * 0.02);
          if (cloudNoise > 0.4) {
            voxelType = VoxelTypes.Cloud;
          } else {
            voxelType = VoxelTypes.Air;
          }
        } else {
          const surfaceNoise = perlinNoise3D(globalX * scale, 0, globalZ * scale);
          const surfaceHeight = GROUND_LEVEL + Math.floor(Math.abs(surfaceNoise) * 20);

          if (globalY < surfaceHeight) {
            if (globalY === surfaceHeight - 1) {
              voxelType = VoxelTypes.Grass;
            } else {
              voxelType = VoxelTypes.Dirt;
            }
          }

          if (globalY < GROUND_LEVEL) {
            const caveNoise = perlinNoise3D(globalX * 0.1, globalY * 0.1, globalZ * 0.1);
            if (caveNoise > 0.3) {
              voxelType = VoxelTypes.Rock;
            } else {
              voxelType = VoxelTypes.Air;
            }
          }
        }

        chunk.set(x, y, z, voxelType);
      }
    }
  }
}

/* ------------------------------ Build Region/Buffer ------------------------------ */

function buildChunk({ regionX, regionY, regionZ, chunkX, chunkY, chunkZ }) {
  // L'origine è solo un metadato (non scritto nel file legacy)
  const chunk = new Chunk({ origin: { x: chunkX, y: chunkY, z: chunkZ } });
  generateChunkData({ chunk, regionX, regionY, regionZ, chunkX, chunkY, chunkZ });
  return chunk;
}

export function buildRegion(regionX, regionY, regionZ) {
  const region = new Region({ regionX, regionY, regionZ, schema: REGION_SCHEMA, ChunkClass: Chunk });

  // Ordine identico al writer originale: for (x) for (y) for (z)
  for (let cx = 0; cx < REGION_SCHEMA.GRID; cx++) {
    for (let cy = 0; cy < REGION_SCHEMA.GRID; cy++) {
      for (let cz = 0; cz < REGION_SCHEMA.GRID; cz++) {
        region.setChunk(cx, cy, cz, buildChunk({ regionX, regionY, regionZ, chunkX: cx, chunkY: cy, chunkZ: cz }));
      }
    }
  }
  return region;
}

export function generateRegionBuffer(regionX, regionY, regionZ) {
  const region = buildRegion(regionX, regionY, regionZ);
  return region.toBuffer();
}

// Usato dalla pagina generate-structured.html
export function generateAndDownload(regionX, regionY, regionZ) {
  const buffer = generateRegionBuffer(regionX, regionY, regionZ);
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const fileName = `r.${regionX}.${regionY}.${regionZ}.voxl`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}
