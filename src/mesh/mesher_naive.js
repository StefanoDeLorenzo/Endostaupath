// src/worker/mesher_naive.js
// Naive mesher: culling tra voxel opachi; emette quads (4 vertici, 6 indici) per le facce esposte.
// Le posizioni sono in coordinate "logiche" [0..logicalSize] (il bordo shell non viene mesciato).

import { idx, DIRS, isOpaque, createIndexArray, tileUV } from '../mesh/common.js';

/**
 * @param {Uint8Array} voxels  - buffer shell (len = shellSize^3)
 * @param {{ shellSize:number, logicalSize:number, shellMargin:number }} sizes
 * @param {Uint8Array} opaqueMap - map 0/1 per tipo opaco (length 256)
 * @param {{ atlasCols?:number, atlasRows?:number, tileForType?:Record<number,number> }} uvCfg
 * @returns {{ positions:Float32Array, normals:Float32Array, uvs:Float32Array, indices:Uint16Array|Uint32Array, counts:{faces:number, vertices:number, indices:number} }}
 */
export function meshNaive(voxels, sizes, opaqueMap, uvCfg = {}) {
  const S  = sizes.shellSize | 0;
  const L  = sizes.logicalSize | 0;         // es. 30
  const M  = sizes.shellMargin | 0;         // es. 1
  const xMin = M, xMax = M + L - 1;
  const yMin = M, yMax = M + L - 1;
  const zMin = M, zMax = M + L - 1;

  // -------- Pass 1: conta facce esposte --------
  let faceCount = 0;

  for (let z = zMin; z <= zMax; z++) {
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const t = voxels[idx(x, y, z, S)];
        if (!isOpaque(opaqueMap, t)) continue;

        // controlla 6 vicini
        // (tutte le coordinate dei vicini esistono nel "shell", quindi non servono bound-check extra)
        // emetti una faccia se il vicino NON è opaco
        if (!isOpaque(opaqueMap, voxels[idx(x + 1, y, z, S)])) faceCount++; // +X
        if (!isOpaque(opaqueMap, voxels[idx(x - 1, y, z, S)])) faceCount++; // -X
        if (!isOpaque(opaqueMap, voxels[idx(x, y + 1, z, S)])) faceCount++; // +Y
        if (!isOpaque(opaqueMap, voxels[idx(x, y - 1, z, S)])) faceCount++; // -Y
        if (!isOpaque(opaqueMap, voxels[idx(x, y, z + 1, S)])) faceCount++; // +Z
        if (!isOpaque(opaqueMap, voxels[idx(x, y, z - 1, S)])) faceCount++; // -Z
      }
    }
  }

  if (faceCount === 0) {
    return {
      positions: new Float32Array(0),
      normals:   new Float32Array(0),
      uvs:       new Float32Array(0),
      indices:   new Uint16Array(0),
      counts: { faces: 0, vertices: 0, indices: 0 }
    };
  }

  // -------- Alloc --------
  const quadVerts = 4, triPerQuad = 2, idxPerTri = 3;
  const vertexCount = faceCount * quadVerts;
  const indexCount  = faceCount * triPerQuad * idxPerTri;

  const positions = new Float32Array(vertexCount * 3);
  const normals   = new Float32Array(vertexCount * 3);
  const uvs       = new Float32Array(vertexCount * 2);
  const indices   = createIndexArray(vertexCount, faceCount * triPerQuad);

  // -------- Pass 2: emetti facce --------
  let vCursor = 0; // in elementi (non byte)
  let iCursor = 0;

  // helpers local: emette un quad per una faccia direzionata
  const emitQuad = (lx, ly, lz, dirIndex, voxelType) => {
    // lx,ly,lz = coordinate LOGICHE (0..L-1), convertite sottraendo il margin
    const d = DIRS[dirIndex];
    const x0 = lx,     x1 = lx + 1;
    const y0 = ly,     y1 = ly + 1;
    const z0 = lz,     z1 = lz + 1;

    // 4 vertici in ordine CCW guardando la faccia dall'esterno:
    // (+X)
    let verts;
    switch (d.name) {
      case '+X': verts = [
        [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]
      ]; break;
      case '-X': verts = [
        [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]
      ]; break;
      case '+Y': verts = [
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]
      ]; break;
      case '-Y': verts = [
        [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]
      ]; break;
      case '+Z': verts = [
        [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]
      ]; break;
      case '-Z': verts = [
        [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0]
      ]; break;
      default: return;
    }

    // Normale costante per i 4 vertici
    const nx = d.nx, ny = d.ny, nz = d.nz;

    // UV (tile per tipo)
    const { u0, v0, u1, v1 } = tileUV(uvCfg, voxelType);
    // mappa base: (0,0) (1,0) (1,1) (0,1)
    const uvVerts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

    const baseIndex = vCursor / 3;

    // push 4 vertici
    for (let k = 0; k < 4; k++) {
      const [px, py, pz] = verts[k];
      positions[vCursor + 0] = px;
      positions[vCursor + 1] = py;
      positions[vCursor + 2] = pz;
      normals[vCursor + 0] = nx;
      normals[vCursor + 1] = ny;
      normals[vCursor + 2] = nz;
      vCursor += 3;

      const [uu, vv] = uvVerts[k];
      const uvOff = (baseIndex + k) * 2;
      uvs[uvOff + 0] = uu;
      uvs[uvOff + 1] = vv;
    }

    // indici (2 triangoli)
    // ordine: 0-1-2, 0-2-3
    const i0 = baseIndex, i1 = baseIndex + 1, i2 = baseIndex + 2, i3 = baseIndex + 3;
    indices[iCursor++] = i0; indices[iCursor++] = i1; indices[iCursor++] = i2;
    indices[iCursor++] = i0; indices[iCursor++] = i2; indices[iCursor++] = i3;
  };

  for (let z = zMin; z <= zMax; z++) {
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const t = voxels[idx(x, y, z, S)];
        if (!isOpaque(opaqueMap, t)) continue;

        // coordinate logiche (0..L-1)
        const lx = x - M, ly = y - M, lz = z - M;

        // verifica e emetti in ciascuna direzione
        if (!isOpaque(opaqueMap, voxels[idx(x + 1, y, z, S)])) emitQuad(lx, ly, lz, 0, t); // +X
        if (!isOpaque(opaqueMap, voxels[idx(x - 1, y, z, S)])) emitQuad(lx, ly, lz, 1, t); // -X
        if (!isOpaque(opaqueMap, voxels[idx(x, y + 1, z, S)])) emitQuad(lx, ly, lz, 2, t); // +Y
        if (!isOpaque(opaqueMap, voxels[idx(x, y - 1, z, S)])) emitQuad(lx, ly, lz, 3, t); // -Y
        if (!isOpaque(opaqueMap, voxels[idx(x, y, z + 1, S)])) emitQuad(lx, ly, lz, 4, t); // +Z
        if (!isOpaque(opaqueMap, voxels[idx(x, y, z - 1, S)])) emitQuad(lx, ly, lz, 5, t); // -Z
      }
    }
  }

  return {
    positions, normals, uvs, indices,
    counts: { faces: faceCount, vertices: vertexCount, indices: indexCount }
  };
}
