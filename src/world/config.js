// src/world/config.js
const GRID = 4; // 4x4x4 = 64 chunk
const CHUNK_SIZE_SHELL = 32;
const CHUNK_SIZE = CHUNK_SIZE_SHELL - 2;
const REGION_SPAN = GRID * CHUNK_SIZE; // 4*30=120

export const REGION_SCHEMA = {
  GRID: 4, // 4x4x4 = 64 chunk
  CHUNK_SIZE_SHELL: CHUNK_SIZE_SHELL, // lato del chunk con shell
  CHUNK_SIZE: CHUNK_SIZE, //lato del chunk senza shell 
  CHUNK_SHELL_BYTES: CHUNK_SIZE_SHELL ** 3, // 32768, 1 byte per voxel
  CHUNK_BYTES: CHUNK_SIZE ** 3,
  REGION_SPAN: REGION_SPAN // 120, lato della regione in voxel logici
};