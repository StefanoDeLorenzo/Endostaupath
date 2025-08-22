// src/mesh/common.js

/** Indexing: x + y*S + z*S*S (shell size S) */
export function idx(x, y, z, S) {
  return x + y * S + z * S * S;
}

/** Crea una bitmap 0/1 per "tipo opaco" (0..255). */
export function makeOpaqueMap(opaqueList = []) {
  const map = new Uint8Array(256);
  for (const t of opaqueList) {
    const n = t >>> 0;
    if (n >= 0 && n <= 255) map[n] = 1;
  }
  return map;
}

/** Ritorna true se il tipo è opaco. */
export function isOpaque(opaqueMap, type) {
  return opaqueMap[type & 0xFF] === 1;
}

/** Direzioni per le 6 facce: dx, dy, dz e metadati utili. */
export const DIRS = [
  { name: '+X', dx: +1, dy:  0, dz:  0, nx:  1, ny:  0, nz:  0 },
  { name: '-X', dx: -1, dy:  0, dz:  0, nx: -1, ny:  0, nz:  0 },
  { name: '+Y', dx:  0, dy: +1, dz:  0, nx:  0, ny:  1, nz:  0 },
  { name: '-Y', dx:  0, dy: -1, dz:  0, nx:  0, ny: -1, nz:  0 },
  { name: '+Z', dx:  0, dy:  0, dz: +1, nx:  0, ny:  0, nz:  1 },
  { name: '-Z', dx:  0, dy:  0, dz: -1, nx:  0, ny:  0, nz: -1 },
];

/** Sceglie l'array indici in base al numero di vertici. */
export function createIndexArray(vertexCount, triangleCount) {
  const maxIndex = vertexCount - 1;
  if (maxIndex <= 65535) {
    return new Uint16Array(triangleCount * 3);
  }
  return new Uint32Array(triangleCount * 3);
}

/**
 * Calcola le coordinate UV di una tile in un atlas.
 * uvCfg: { atlasCols: number, atlasRows?: number, tileForType?: Record<number, number> }
 * Se mancano i dati, ritorna coppie [0,1].
 */
export function tileUV(uvCfg, voxelType) {
  const cols = (uvCfg?.atlasCols | 0) || 1;
  const rows = (uvCfg?.atlasRows | 0) || cols;
  const tile = uvCfg?.tileForType?.[voxelType] ?? 0;

  const col = tile % cols;
  const row = Math.floor(tile / cols);
  const du = 1 / cols, dv = 1 / rows;
  const u0 = col * du, u1 = u0 + du;
  const v0 = row * dv, v1 = v0 + dv;
  return { u0, v0, u1, v1 };
}