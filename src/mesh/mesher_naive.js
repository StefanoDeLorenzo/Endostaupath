// src/worker/mesher_naive.js
// Naive mesher per-materiale con culling per "rank di opacità" (aria < trasparente < opaco).
// Winding compatibile Babylon (left-handed, front = CW) — configurabile.

import { idx, createIndexArray, BASE_UV } from '../mesh/common.js';

/**
 * @param {Uint8Array} voxels  - buffer shell (len = shellSize^3)
 * @param {{ shellSize:number, logicalSize:number, shellMargin:number }} sizes
 * @param {Uint8Array} opacityRank - rank (0..2) per tipo
 * @param {{ leftHanded?:boolean, frontIsCCW?:boolean }} windingCfg
 * @returns {{ byType: Record<number, {positions:Float32Array,normals:Float32Array,uvs:Float32Array,indices:Uint16Array|Uint32Array,colors:Float32Array}>, voxelOpacity: Record<number,'opaque'|'transparent'> }}
 */
export function meshNaivePerMaterial(voxels, sizes, opacityRank, windingCfg = {}) {
  const S  = sizes.shellSize | 0;
  const L  = sizes.logicalSize | 0;         // es. 30
  const M  = sizes.shellMargin | 0;         // es. 1
  const xMin = M, xMax = M + L - 1;
  const yMin = M, yMax = M + L - 1;
  const zMin = M, zMax = M + L - 1;

  const leftHanded = (windingCfg.leftHanded !== false); // default true
  const frontIsCCW = !!windingCfg.frontIsCCW;           // default false (Babylon front=CW)

  // -------- Pass 1: conta facce per materiale --------
  const faceCount = new Uint32Array(256);

  // helper: decide se emettere faccia da t -> n (neighbour)
  const shouldEmit = (t, n) => {
    const rt = opacityRank[t & 0xFF];
    const rn = opacityRank[n & 0xFF];
    return rt > rn; // emetti solo se current "più opaco" del vicino
  };

  for (let z = zMin; z <= zMax; z++) {
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const t = voxels[idx(x, y, z, S)];
        const rt = opacityRank[t];
        if (rt === 0) continue; // aria → mai sorgente di facce

        if (shouldEmit(t, voxels[idx(x+1, y, z, S)])) faceCount[t]++;
        if (shouldEmit(t, voxels[idx(x-1, y, z, S)])) faceCount[t]++;
        if (shouldEmit(t, voxels[idx(x, y+1, z, S)])) faceCount[t]++;
        if (shouldEmit(t, voxels[idx(x, y-1, z, S)])) faceCount[t]++;
        if (shouldEmit(t, voxels[idx(x, y, z+1, S)])) faceCount[t]++;
        if (shouldEmit(t, voxels[idx(x, y, z-1, S)])) faceCount[t]++;
      }
    }
  }

  // -------- Alloc per materiale --------
  const byType = Object.create(null);
  const voxelOpacity = Object.create(null);

  for (let t = 0; t < 256; t++) {
    const f = faceCount[t];
    if (!f) continue;

    const verts = f * 4;
    const tris  = f * 2;

    byType[t] = {
      positions: new Float32Array(verts * 3),
      normals:   new Float32Array(verts * 3),
      uvs:       new Float32Array(verts * 2),
      indices:   createIndexArray(verts, tris),
      colors:    new Float32Array(verts * 4),
      _vCursor: 0,
      _iCursor: 0
    };

    // Mappa di “opacità testuale” per il main
    voxelOpacity[t] = (opacityRank[t] === 2) ? 'opaque' : 'transparent';
  }

  if (Object.keys(byType).length === 0) {
    return { byType, voxelOpacity };
  }

  // -------- Pass 2: emetti facce --------
  // helper per scrivere un quad
  function emitQuadForType(T, lx, ly, lz, dir /*0..5*/) {
    const buf = byType[T];
    if (!buf) return;

    // 4 posizioni locali in base a dir, con schema coerente
    // usiamo coordinate LOGICHE [0..L], senza shell
    const x0 = lx,     x1 = lx + 1;
    const y0 = ly,     y1 = ly + 1;
    const z0 = lz,     z1 = lz + 1;

    // definizione corner in funzione della direzione e sistema left-handed
    // orientiamo i 4 vertici in modo consistente, poi scegliamo l’ordine indici in base a frontIsCCW
    let verts; let nx=0, ny=0, nz=0;
    switch (dir) {
      case 0: // +X
        nx=+1; verts = [[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]]; break;
      case 1: // -X
        nx=-1; verts = [[x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1]]; break;
      case 2: // +Y
        ny=+1; verts = [[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]]; break;
      case 3: // -Y
        ny=-1; verts = [[x0,y0,z1],[x1,y0,z1],[x1,y0,z0],[x0,y0,z0]]; break;
      case 4: // +Z
        nz=+1; verts = [[x0,y0,z1],[x0,y1,z1],[x1,y1,z1],[x1,y0,z1]]; break;
      case 5: // -Z
        nz=-1; verts = [[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z0]]; break;
    }

    const baseIndex = buf._vCursor / 3;

    // push vertices, normals, uvs, colors
    for (let k=0;k<4;k++) {
      const [px,py,pz] = verts[k];
      buf.positions[buf._vCursor+0]=px;
      buf.positions[buf._vCursor+1]=py;
      buf.positions[buf._vCursor+2]=pz;
      buf.normals[buf._vCursor+0]=nx;
      buf.normals[buf._vCursor+1]=ny;
      buf.normals[buf._vCursor+2]=nz;
      buf._vCursor += 3;

      const [uu,vv] = BASE_UV[k];
      const uoff = (baseIndex + k)*2;
      buf.uvs[uoff+0]=uu; buf.uvs[uoff+1]=vv;

      // colore RGBA (alpha < 1 solo per trasparenti: utile al tuo materiale)
      const coff = (baseIndex + k)*4;
      const isTransp = (opacityRank[T] !== 2);
      buf.colors[coff+0] = 1;
      buf.colors[coff+1] = 1;
      buf.colors[coff+2] = 1;
      buf.colors[coff+3] = isTransp ? 0.6 : 1.0;
    }

    // indici: due triangoli
    // per Babylon (left-handed, front = CW) usiamo winding CW:
    // triangoli 0-2-1 e 0-3-2
    if (leftHanded && !frontIsCCW) {
      buf.indices[buf._iCursor++] = baseIndex+0;
      buf.indices[buf._iCursor++] = baseIndex+2;
      buf.indices[buf._iCursor++] = baseIndex+1;
      buf.indices[buf._iCursor++] = baseIndex+0;
      buf.indices[buf._iCursor++] = baseIndex+3;
      buf.indices[buf._iCursor++] = baseIndex+2;
    } else {
      // CCW
      buf.indices[buf._iCursor++] = baseIndex+0;
      buf.indices[buf._iCursor++] = baseIndex+1;
      buf.indices[buf._iCursor++] = baseIndex+2;
      buf.indices[buf._iCursor++] = baseIndex+0;
      buf.indices[buf._iCursor++] = baseIndex+2;
      buf.indices[buf._iCursor++] = baseIndex+3;
    }
  }

  for (let z = zMin; z <= zMax; z++) {
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const T = voxels[idx(x, y, z, S)];
        if (opacityRank[T] === 0) continue;

        const lx = x - M, ly = y - M, lz = z - M;

        // +X, -X, +Y, -Y, +Z, -Z
        if (opacityRank[T] > opacityRank[voxels[idx(x+1,y,z,S)]]) emitQuadForType(T,lx,ly,lz,0);
        if (opacityRank[T] > opacityRank[voxels[idx(x-1,y,z,S)]]) emitQuadForType(T,lx,ly,lz,1);
        if (opacityRank[T] > opacityRank[voxels[idx(x,y+1,z,S)]]) emitQuadForType(T,lx,ly,lz,2);
        if (opacityRank[T] > opacityRank[voxels[idx(x,y-1,z,S)]]) emitQuadForType(T,lx,ly,lz,3);
        if (opacityRank[T] > opacityRank[voxels[idx(x,y,z+1,S)]]) emitQuadForType(T,lx,ly,lz,4);
        if (opacityRank[T] > opacityRank[voxels[idx(x,y,z-1,S)]]) emitQuadForType(T,lx,ly,lz,5);
      }
    }
  }

  // rimuovi cursori interni
  for (const tStr of Object.keys(byType)) {
    const buf = byType[tStr];
    delete buf._vCursor;
    delete buf._iCursor;
  }

  return { byType, voxelOpacity };
}
