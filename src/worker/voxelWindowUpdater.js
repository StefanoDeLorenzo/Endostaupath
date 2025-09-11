// src/worker/voxelWindowUpdater.js
import { REGION_SCHEMA } from '../world/config.js';

// Z-major, X-fast index
const voxelIndex = (x, y, z, size) => x + y * size + z * size * size;

function getCoreChunkDataFromRegionBuffer(buffer, chunkX, chunkY, chunkZ) {
  const dv = new DataView(buffer);
  const HEADER_SIZE = 11;
  const GRID = REGION_SCHEMA.GRID;

  // ⚠️ Verifica che l'ordine nel tuo header sia CX → CY → CZ
  const idx = ((chunkX * GRID) + chunkY) * GRID + chunkZ;

  const off = HEADER_SIZE + idx * 5;
  const b0 = dv.getUint8(off), b1 = dv.getUint8(off + 1), b2 = dv.getUint8(off + 2);
  const chunkFileOffset = (b0 << 16) | (b1 << 8) | b2; // 24-bit big-endian
  if (chunkFileOffset === 0) return null;

  const size = REGION_SCHEMA.CHUNK_BYTES; //  (CHUNK_SIZE ** 3) - senza shell
  // Crea una view senza copiare i dati
  return new Uint8Array(buffer, chunkFileOffset, size);
}

self.onmessage = (event) => {
  const { type, regionBuffers, windowOrigin, id, sab } = event.data || {};
  if (type !== 'copyRegionToSAB') return;

  const { GRID, CHUNK_SIZE, REGION_SPAN } = REGION_SCHEMA;
  const WINDOW_SPAN = 3 * REGION_SPAN;

  // Finestra condivisa
  const dst = new Uint8Array(sab);

  // --- Estrai l'unica regione presente ---
  const keys = regionBuffers ? Object.keys(regionBuffers) : [];
  if (keys.length !== 1) {
    self.postMessage({ type: 'regionSliceDone', id });
    return;
  }

  const regionKey = keys[0];
  const regionBuffer = regionBuffers[regionKey]; // ArrayBuffer | null

  // Se la regione non esiste: non scrivere nulla (il main ha già azzerato la finestra)
  if (!regionBuffer || regionBuffer.byteLength === 0) {
    self.postMessage({ type: 'regionSliceDone', id });
    return;
  }

  // Ricava le coord della regione dalla chiave "<rx>_<ry>_<rz>"
  const [rxStr, ryStr, rzStr] = regionKey.split('_');
  const rx = parseInt(rxStr, 10), ry = parseInt(ryStr, 10), rz = parseInt(rzStr, 10);

  // Calcola l'offset della regione nella finestra 3×3×3
  // windowOrigin è l'angolo minimo (newRegion - 1)
  const dx = rx - windowOrigin.x;  // ∈ {-1,0,+1}
  const dy = ry - windowOrigin.y;
  const dz = rz - windowOrigin.z;

  const baseX = dx * REGION_SPAN;
  const baseY = dy * REGION_SPAN;
  const baseZ = dz * REGION_SPAN;

  // --- Copia CHUNK → SAB (solo per questa regione) ---
  for (let cz = 0; cz < GRID; cz++) {
    for (let cy = 0; cy < GRID; cy++) {
      for (let cx = 0; cx < GRID; cx++) {
        const chunk = getCoreChunkDataFromRegionBuffer(regionBuffer, cx, cy, cz);
        if (!chunk) continue;

        const chunkBaseX = baseX + cx * CHUNK_SIZE;
        const chunkBaseY = baseY + cy * CHUNK_SIZE;
        const chunkBaseZ = baseZ + cz * CHUNK_SIZE;

        // copia voxel (Z-major, X-fast)
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            let src = voxelIndex(0, ly, lz, CHUNK_SIZE);                          // inizio riga X
            let di  = voxelIndex(chunkBaseX, chunkBaseY + ly, chunkBaseZ + lz, WINDOW_SPAN);
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
              const v = chunk[src++];
              if (v) dst[di] = v; // scrivi solo se non zero (aria)
              di++;               // X-fast
            }
          }
        }
      }
    }
  }

  self.postMessage({ type: 'regionSliceDone', id });
};

export {};
