// src/world/config.js
export const REGION_SCHEMA = {
  GRID: 4,                 // 4x4x4 = 64 chunk
  CHUNK_SIZE: 32,          // lato del chunk
  CHUNK_SHELL_BYTES: 32**3 // 32768, 1 byte per voxel (no palette, no orientation)
};
