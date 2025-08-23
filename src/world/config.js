// src/world/config.js
const CHUNK_SIZE_SHELL = 32;
const CHUNK_SIZE = CHUNK_SIZE_SHELL - 2;

export const REGION_SCHEMA = {
  GRID: 4, // 4x4x4 = 64 chunk
  CHUNK_SIZE_SHELL: CHUNK_SIZE_SHELL, // lato del chunk con shell
  CHUNK_SIZE: CHUNK_SIZE, //lato del chunk senza shell 
  CHUNK_SHELL_BYTES: CHUNK_SIZE_SHELL ** 3, // 32768, 1 byte per voxel
};