// src/mesh/common.js

/** Indexing: x + y*S + z*S*S (shell size S) */
export function idx(x, y, z, S) {
  return x + y * S + z * S * S;
}

/** Crea una bitmap 0/1 per "tipo opaco" (0..255). */
export function makeOpaqueMap(opaqueList = []) {
  const map = new Uint8Array(256);
  for (const t of opaqueList) {
    const n = (t >>> 0) & 0xFF;
    map[n] = 1;
  }
  return map;
}

/** Mappa (0..255) -> rank opacità (0=aria, 1=trasp, 2=opaco) */
export function makeOpacityRank({ transparent = [], opaque = [] } = {}) {
  const rank = new Uint8Array(256); // default 0 = aria
  for (const t of transparent) rank[(t>>>0)&0xFF] = 1;
  for (const t of opaque)      rank[(t>>>0)&0xFF] = 2;
  return rank;
}

/** Sceglie l'array indici in base al numero di vertici. */
export function createIndexArray(vertexCount, triangleCount) {
  const maxIndex = vertexCount - 1;
  return (maxIndex <= 65535)
    ? new Uint16Array(triangleCount * 3)
    : new Uint32Array(triangleCount * 3);
}

/** UV base (0..1) per i 4 vertici del quad nell'ordine [0..3] */
export const BASE_UV = [[0,0],[1,0],[1,1],[0,1]];
