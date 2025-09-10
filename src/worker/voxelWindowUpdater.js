// src/worker/voxelWindowUpdater.js

import { REGION_SCHEMA } from '../world/config.js';

// Z-major, X-fast index (see axis convention table)
const voxelIndex = (x, y, z, size) => x + y * size + z * size * size;

function getCoreChunkDataFromRegionBuffer(buffer, chunkX, chunkY, chunkZ) {
  const dv = new DataView(buffer);
  const headerSize = 11;
  const GRID = REGION_SCHEMA.GRID;
  const idx = ((chunkX * GRID) + chunkY) * GRID + chunkZ;
  const off = headerSize + idx * 5;
  const chunkFileOffset =
    (dv.getUint8(off) << 16) | (dv.getUint8(off + 1) << 8) | dv.getUint8(off + 2);
  if (chunkFileOffset === 0) return null;
  const size = REGION_SCHEMA.CHUNK_BYTES;
  const chunkBuffer = buffer.slice(chunkFileOffset, chunkFileOffset + size);
  return new Uint8Array(chunkBuffer);
}

self.onmessage = (event) => {
  const { type, regionBuffers, windowOrigin } = event.data;
  if (type !== 'updateVoxelWindow') return;

  const { GRID, CHUNK_SIZE, REGION_SPAN } = REGION_SCHEMA;
  const windowSpan = 3 * REGION_SPAN;
  const windowBuffer = new Uint8Array(windowSpan ** 3);

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const regionX = windowOrigin.x + dx;
        const regionY = windowOrigin.y + dy;
        const regionZ = windowOrigin.z + dz;
        const regionKey = `${regionX}_${regionY}_${regionZ}`;
        const buffer = regionBuffers[regionKey];

        const baseX = (dx + 1) * REGION_SPAN;
        const baseY = (dy + 1) * REGION_SPAN;
        const baseZ = (dz + 1) * REGION_SPAN;

        if (!buffer) continue;

        for (let cx = 0; cx < GRID; cx++) {
          for (let cy = 0; cy < GRID; cy++) {
            for (let cz = 0; cz < GRID; cz++) {
              const chunkData = getCoreChunkDataFromRegionBuffer(buffer, cx, cy, cz);
              const chunkBaseX = baseX + cx * CHUNK_SIZE;
              const chunkBaseY = baseY + cy * CHUNK_SIZE;
              const chunkBaseZ = baseZ + cz * CHUNK_SIZE;

              if (!chunkData) continue;

              for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                    const value = chunkData[voxelIndex(lx, ly, lz, CHUNK_SIZE)];
                    if (value === 0) continue;
                    const destIndex = voxelIndex(
                      chunkBaseX + lx,
                      chunkBaseY + ly,
                      chunkBaseZ + lz,
                      windowSpan
                    );
                    windowBuffer[destIndex] = value;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  self.postMessage(
    { type: 'voxelWindowUpdated', voxelWindow: windowBuffer.buffer, windowOrigin },
    [windowBuffer.buffer]
  );
};

export {};
