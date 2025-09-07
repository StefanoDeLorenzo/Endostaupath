import { REGION_SCHEMA } from '../world/config.js';

self.onmessage = (event) => {
  const { regionBuffer, windowBuffer, rx, ry, rz, WINDOW_VOXEL_SPAN } = event.data;

  const windowArray = new Uint8Array(windowBuffer);

  if (regionBuffer && regionBuffer.byteLength > 0) {
    const GRID = REGION_SCHEMA.GRID;
    const CHUNK_SIZE = REGION_SCHEMA.CHUNK_SIZE;

    for (let cx = 0; cx < GRID; cx++) {
      for (let cy = 0; cy < GRID; cy++) {
        for (let cz = 0; cz < GRID; cz++) {
          const chunkData = getCoreChunkDataFromRegionBuffer(regionBuffer, cx, cy, cz);
          if (!chunkData) continue;

          const startX = rx * REGION_SCHEMA.REGION_SPAN + cx * CHUNK_SIZE;
          const startY = ry * REGION_SCHEMA.REGION_SPAN + cy * CHUNK_SIZE;
          const startZ = rz * REGION_SCHEMA.REGION_SPAN + cz * CHUNK_SIZE;

          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let y = 0; y < CHUNK_SIZE; y++) {
              for (let x = 0; x < CHUNK_SIZE; x++) {
                const destX = startX + x;
                const destY = startY + y;
                const destZ = startZ + z;
                const destOffset = destX + destY * WINDOW_VOXEL_SPAN + destZ * WINDOW_VOXEL_SPAN * WINDOW_VOXEL_SPAN;
                const srcIndex = x + CHUNK_SIZE * (y + CHUNK_SIZE * z);
                windowArray[destOffset] = chunkData[srcIndex];
              }
            }
          }
        }
      }
    }
  } else {
    const startX = rx * REGION_SCHEMA.REGION_SPAN;
    const startY = ry * REGION_SCHEMA.REGION_SPAN;
    const startZ = rz * REGION_SCHEMA.REGION_SPAN;

    for (let x = 0; x < REGION_SCHEMA.REGION_SPAN; x++) {
      for (let y = 0; y < REGION_SCHEMA.REGION_SPAN; y++) {
        for (let z = 0; z < REGION_SCHEMA.REGION_SPAN; z++) {
          const destX = startX + x;
          const destY = startY + y;
          const destZ = startZ + z;
          const destOffset = destX + destY * WINDOW_VOXEL_SPAN + destZ * WINDOW_VOXEL_SPAN * WINDOW_VOXEL_SPAN;
          windowArray[destOffset] = 0;
        }
      }
    }
  }

  self.postMessage({ regionBuffer, windowBuffer }, [regionBuffer, windowBuffer]);
};

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
  return new Uint8Array(buffer.slice(chunkFileOffset, chunkFileOffset + size));
}
