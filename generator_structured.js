// generator_structured.js
// Generatore strutturato: produce un ArrayBuffer identico al formato legacy,
// ma con architettura a classi (Region/Chunk).

import { REGION_SCHEMA } from "./src/world/config.js";
import { Region } from "./src/world/region.js";
import { Chunk } from "./src/world/chunk.js";

/** PRNG semplice e deterministico (xorshift32) per semi riproducibili */
function makeRng(seed) {
  let s = (seed | 0) || 123456789;
  return function rand() {
    // xorshift32
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    // [0,1)
    return ((s >>> 0) / 0x100000000);
  };
}

/** Mischia 3 interi (per coord region/chunk) in un seed 32-bit */
function mixSeed(a, b, c) {
  let h = 0x9e3779b9; // golden ratio
  h ^= a + 0x85ebca6b + (h << 6) + (h >>> 2);
  h ^= b + 0xc2b2ae35 + (h << 6) + (h >>> 2);
  h ^= c + 0x27d4eb2f + (h << 6) + (h >>> 2);
  return h | 0;
}

/** Helper: calcola l’origine (in voxel) di un chunk nel mondo globale */
function chunkWorldOrigin(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
  const S = REGION_SCHEMA.CHUNK_SIZE; // 32
  // Con griglia 4: ogni regione copre 4*S voxel per asse
  const span = REGION_SCHEMA.GRID * S; // 128 voxel per asse
  return {
    x: regionX * span + chunkX * S,
    y: regionY * span + chunkY * S,
    z: regionZ * span + chunkZ * S,
  };
}

/**
 * Qui va la TUA logica di generazione contenuti del chunk.
 * Scopo: riempire i 32*32*32 byte (shell già incluso) con gli stessi valori
 * che produceva `createChunkWithShell(...)`.
 *
 * Suggerimento: incolla qui dentro (o richiamala) la logica attuale, ma
 * scrivendo su `chunk.set(x,y,z,val)` / `chunk.voxels[...]`.
 */
function generateChunkData({ chunk, regionX, regionY, regionZ, chunkX, chunkY, chunkZ, seed }) {
  const S = Chunk.SIZE; // 32
  const rng = makeRng(seed);

  // === ESEMPIO MINIMO (sostituisci con la tua logica attuale!) ===
  // Attenzione: questo è solo un placeholder che riempie “aria” (0).
  // Incolla qui l’equivalente della tua createChunkWithShell per ottenere
  // esattamente lo stesso risultato di prima.
  chunk.fill(0);

  // Esempio di come potresti impostare un bordo solido (se servisse):
  // for (let x=0; x<S; x++) for (let z=0; z<S; z++) {
  //   chunk.set(x, 0, z, 1);          // pavimento
  //   chunk.set(x, S-1, z, 1);        // soffitto
  // }
  // for (let y=0; y<S; y++) for (let z=0; z<S; z++) {
  //   chunk.set(0, y, z, 1);          // muro W
  //   chunk.set(S-1, y, z, 1);        // muro E
  // }
  // for (let y=0; y<S; y++) for (let x=0; x<S; x++) {
  //   chunk.set(x, y, 0, 1);          // muro N
  //   chunk.set(x, y, S-1, 1);        // muro S
  // }

  // === FINE ESEMPIO ===
}

/**
 * Costruisce un singolo Chunk (classe) con la tua generazione, mantenendo
 * il “guscio” dentro i voxel esterni (come oggi).
 */
function buildChunk({ regionX, regionY, regionZ, chunkX, chunkY, chunkZ, baseSeed = 0 }) {
  const origin = chunkWorldOrigin(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
  const chunk = new Chunk({ origin }); // 32^3 zero (aria)
  const seed = mixSeed(
    baseSeed ^ (regionX * 73856093) ^ (regionY * 19349663) ^ (regionZ * 83492791),
    (chunkX * 15731) ^ (chunkY * 789221) ^ (chunkZ * 1376312589),
    0xDEADBEEF
  );
  generateChunkData({ chunk, regionX, regionY, regionZ, chunkX, chunkY, chunkZ, seed });
  return chunk;
}

/**
 * Costruisce una Region 4x4x4 e la popola chiamando `buildChunk` per ciascun chunk.
 * Ritorna un oggetto Region completo.
 */
export function buildRegion(regionX, regionY, regionZ, { baseSeed = 0 } = {}) {
  const region = new Region({ regionX, regionY, regionZ, schema: REGION_SCHEMA, ChunkClass: Chunk });

  // Ordine identico: for (x) for (y) for (z)
  for (let chunkX = 0; chunkX < REGION_SCHEMA.GRID; chunkX++) {
    for (let chunkY = 0; chunkY < REGION_SCHEMA.GRID; chunkY++) {
      for (let chunkZ = 0; chunkZ < REGION_SCHEMA.GRID; chunkZ++) {
        const chunk = buildChunk({ regionX, regionY, regionZ, chunkX, chunkY, chunkZ, baseSeed });
        region.setChunk(chunkX, chunkY, chunkZ, chunk);
      }
    }
  }
  return region;
}

/**
 * Entry point “compatibile” col flusso attuale:
 * ritorna l’ArrayBuffer del file regione (identico al legacy).
 */
export function generateRegionBuffer(regionX, regionY, regionZ, { baseSeed = 0 } = {}) {
  const region = buildRegion(regionX, regionY, regionZ, { baseSeed });
  return region.toBuffer(); // header+indice+64 blocchi 32768B
}

/**
 * Se vuoi integrarlo direttamente con generate.html (bottone “genera e scarica”):
 */
export function generateAndDownload(regionX, regionY, regionZ, { baseSeed = 0 } = {}) {
  const buffer = generateRegionBuffer(regionX, regionY, regionZ, { baseSeed });
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const fileName = `region_${regionX}_${regionY}_${regionZ}.voxl`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

/**
 * Adapter opzionale: se vuoi riusare temporaneamente la tua funzione legacy
 * `createChunkWithShell(...)` (che restituisce Uint8Array da 32768 B),
 * puoi chiamarla qui e riversarla in un Chunk, così:
 *
 *   function buildChunkWithLegacyAdapter(ctx, args...) {
 *     const shell = createChunkWithShell(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
 *     return Chunk.fromShellData(shell, origin);
 *   }
 *
 * Ma l’obiettivo è spostare la generazione in `generateChunkData()` e usare
 * solo API di Chunk (get/set/fill/…).
 */
