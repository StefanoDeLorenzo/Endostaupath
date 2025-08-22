// generator_structured.js
// Generatore strutturato compatibile col formato legacy (.voxl).
// Usa la tua logica: volumetria "logica" 30^3 + shell nei voxel esterni (32^3).

import { REGION_SCHEMA } from "./src/world/config.js";
import { Region } from "./src/world/region.js";
import { Chunk } from "./src/world/chunk.js";

/* ----------------------- Globals / fallback non invasivi ----------------------- */
const G = (typeof window !== "undefined" ? window : globalThis);

// Usa le tue costanti se presenti nel progetto, altrimenti fallback sensati
const VoxelTypes = G.VoxelTypes ?? {
  Air:   0,
  Dirt:  1,
  Grass: 2,
  Rock:  3,
  Cloud: 4,
};

const SKY_LEVEL    = (G.SKY_LEVEL    ?? 110) | 0;
const GROUND_LEVEL = (G.GROUND_LEVEL ?? 10)  | 0;

/* ---------------------------- Tuo Perlin 3D (copy) ---------------------------- */
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

/* ------------------------------ Logica “tua” ------------------------------ */
/**
 * Applica esattamente le regole che mi hai passato:
 * - Se globalY > SKY_LEVEL → nuvole (noise 3D), altrimenti aria.
 * - Sotto SKY_LEVEL → calcolo superficie con noise 3D su (x*scale, 0, z*scale).
 *   surfaceHeight = GROUND_LEVEL + floor(abs(surfaceNoise)*20)
 *   Se globalY < surfaceHeight: top = Grass (y==surfaceHeight-1), sotto Dirt.
 *   Se globalY < GROUND_LEVEL: caves con noise 3D (x*.1,y*.1,z*.1): >0.3 → Rock, altrimenti Air.
 */
function logicalVoxelType(globalX, globalY, globalZ) {
  const scale = 0.05;

  // Above sky: nuvole/aria
  if (globalY > SKY_LEVEL) {
    const cloudNoise = perlinNoise3D(globalX * 0.02, globalY * 0.02, globalZ * 0.02);
    return (cloudNoise > 0.4) ? VoxelTypes.Cloud : VoxelTypes.Air;
  }

  // Superficie (usa perlin 3D con y=0 come nel tuo snippet)
  const surfaceNoise = perlinNoise3D(globalX * scale, 0, globalZ * scale);
  const surfaceHeight = GROUND_LEVEL + Math.floor(Math.abs(surfaceNoise) * 20);

  let voxelType = VoxelTypes.Air;

  if (globalY < surfaceHeight) {
    voxelType = (globalY === surfaceHeight - 1) ? VoxelTypes.Grass : VoxelTypes.Dirt;
  }

  // Caverne sotto il livello del suolo
  if (globalY < GROUND_LEVEL) {
    const caveNoise = perlinNoise3D(globalX * 0.1, globalY * 0.1, globalZ * 0.1);
    voxelType = (caveNoise > 0.3) ? VoxelTypes.Rock : VoxelTypes.Air;
  }

  return voxelType;
}

/* --------------------------- Generazione del chunk --------------------------- */
/**
 * Genera il 32^3 con shell.
 * Mappa coordinate locali 0..31 su "logico" -1..30 (30^3 + bordo),
 * poi calcola le GLOBALI come nel tuo `generateLogicalChunk`:
 *   globalX = regionX*(4*30) + chunkX*30 + logicalX
 *   (idem per Y/Z)
 */
function generateChunkData({ chunk, regionX, regionY, regionZ, chunkX, chunkY, chunkZ }) {
  const S = Chunk.SIZE;      // 32
  const L = 30;              // lato "logico" 30
  const REG_SPAN = REGION_SCHEMA.GRID * L; // 4 * 30 = 120

  // Precompute basi regione/chunk come nel tuo snippet
  const baseX = regionX * REG_SPAN + chunkX * L;
  const baseY = regionY * REG_SPAN + chunkY * L;
  const baseZ = regionZ * REG_SPAN + chunkZ * L;

  for (let z = 0; z < S; z++) {
    const lz = z - 1; // [-1..30]
    for (let y = 0; y < S; y++) {
      const ly = y - 1; // [-1..30]
      for (let x = 0; x < S; x++) {
        const lx = x - 1; // [-1..30]

        // Coordinate GLOBALI come nel tuo codice (consentiamo -1 e 30 per il guscio)
        const globalX = baseX + lx;
        const globalY = baseY + ly;
        const globalZ = baseZ + lz;

        const vt = logicalVoxelType(globalX, globalY, globalZ);
        chunk.set(x, y, z, vt);
      }
    }
  }
}

/* ------------------------- Costruzione chunk e regioni ------------------------- */
function buildChunk({ regionX, regionY, regionZ, chunkX, chunkY, chunkZ }) {
  // L’origine qui è solo metadato; il wire-format non lo include
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
  return region.toBuffer(); // header 11B + indice 5B*64 + 64 blocchi (32^3)
}

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
