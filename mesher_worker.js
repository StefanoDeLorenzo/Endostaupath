// mesher_worker.js — Mesher indipendente (no Babylon). Lavora per sub-chunk 15³.
// Dipendenze: voxel_types.js (UMD) caricato via importScripts.
try { importScripts('voxel_types.js'); } catch(_) {}
try { importScripts('voxel_materials.js'); } catch(_) {}
const L  = self.VoxelLib  || (typeof window!=='undefined' ? window.VoxelLib  : null);
const LM = self.VoxelMaterials || (typeof window!=='undefined' ? window.VoxelMaterials : null);
if (!L)  throw new Error('voxel_types.js non caricato');
if (!LM) throw new Error('voxel_materials.js non caricato');

const {
  ChunkType, VoxelSet,
  makePaletteForChunkType,
  getTypeId, getModelMeta, getMaterialForFace, getAtlasUVRect, getVertexTint,
  borderBit
} = L;

// ====== Costanti/mapping ======
const N = 30;                    // chunk 30³
const SUB = 15;                  // sub-chunk 15³ (2x2x2)
const FACE = { PX:0, NX:1, PY:2, NY:3, PZ:4, NZ:5 };
function lin(x,y,z){ return x + N*(y + N*z); }

const DIRS = [
  { dx:+1, dy:0, dz:0, face:FACE.PX, name:'east',  normal:[+1,0,0] },
  { dx:-1, dy:0, dz:0, face:FACE.NX, name:'west',  normal:[-1,0,0] },
  { dx:0, dy:+1, dz:0, face:FACE.PY, name:'top',   normal:[0,+1,0] },
  { dx:0, dy:-1, dz:0, face:FACE.NY, name:'bottom',normal:[0,-1,0] },
  { dx:0, dy:0, dz:+1, face:FACE.PZ, name:'south', normal:[0,0,+1] },
  { dx:0, dy:0, dz:-1, face:FACE.NZ, name:'north', normal:[0,0,-1] },
];

const QUAD = {
  // +X (right) — dal tuo: [1,1,1] [1,1,-1] [1,-1,-1] [1,-1,1]
  [FACE.PX]: {
    pos: [[1,1,1],[1,1,0],[1,0,0],[1,0,1]],
    uvs: [[1,1],[0,1],[0,0],[1,0]]
  },
  // -X (left) — dal tuo: [-1,1,-1] [-1,1,1] [-1,-1,1] [-1,-1,-1]
  [FACE.NX]: {
    pos: [[0,1,0],[0,1,1],[0,0,1],[0,0,0]],
    uvs: [[1,1],[0,1],[0,0],[1,0]]
  },
  // +Y (top) — dal tuo: [-1,1,-1] [1,1,-1] [1,1,1] [-1,1,1]
  [FACE.PY]: {
    pos: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]],
    uvs: [[0,1],[1,1],[1,0],[0,0]]
  },
  // -Y (bottom) — dal tuo: [-1,-1,1] [1,-1,1] [1,-1,-1] [-1,-1,-1]
  [FACE.NY]: {
    pos: [[0,0,1],[1,0,1],[1,0,0],[0,0,0]],
    uvs: [[0,0],[1,0],[1,1],[0,1]]
  },
  // +Z (front) — dal tuo: [-1,1,1] [1,1,1] [1,-1,1] [-1,-1,1]
  [FACE.PZ]: {
    pos: [[0,1,1],[1,1,1],[1,0,1],[0,0,1]],
    uvs: [[0,1],[1,1],[1,0],[0,0]]
  },
  // -Z (back) — dal tuo: [1,1,-1] [-1,1,-1] [-1,-1,-1] [1,-1,-1]
  [FACE.NZ]: {
    pos: [[1,1,0],[0,1,0],[0,0,0],[1,0,0]],
    uvs: [[0,1],[1,1],[1,0],[0,0]]
  },
};

// ====== Stato per chunk ======
/*
 store[chunkId] = {
   chunkType: number,
   voxels: Uint8Array(27000),         // valori locali 0..255
   borderMask: Uint8Array(675),       // 1-bit decision per facce verso fuori
   palette: Uint8Array(256),          // locale -> blockStateId
   subSize: 15
 }
*/
const store = new Map();

// ====== Border mask bit helpers ======
const FACE_STRIDE = N*N; // 900
function borderMaskIndex(face, x,y,z){
  let idxBase = 0, i = 0;
  switch(face){
    case FACE.PX: idxBase = 0*FACE_STRIDE; i = y*N + z; break;
    case FACE.NX: idxBase = 1*FACE_STRIDE; i = y*N + z; break;
    case FACE.PY: idxBase = 2*FACE_STRIDE; i = x*N + z; break;
    case FACE.NY: idxBase = 3*FACE_STRIDE; i = x*N + z; break;
    case FACE.PZ: idxBase = 4*FACE_STRIDE; i = x*N + y; break;
    case FACE.NZ: idxBase = 5*FACE_STRIDE; i = x*N + y; break;
  }
  return idxBase + i;
}
function getBorderBit(maskU8, bitIndex){
  const B = bitIndex>>3, o = bitIndex & 7;
  return ( (maskU8[B] >> o) & 1 );
}

// ====== Batching ======
function makeBatch(materialId, alphaMode){
  return { materialId, alphaMode,
    positions: [], normals: [], uvs: [], colors: [], indices: [],
    _indexOffset: 0
  };
}
function pushQuad(batch, baseX, baseY, baseZ, face, uvRect, tint, normal){
  const q = QUAD[face];
  const i0 = batch._indexOffset;

  const du = (uvRect[2] - uvRect[0]);
  const dv = (uvRect[3] - uvRect[1]);

  for (let i=0;i<4;i++){
    const p = q.pos[i];
    batch.positions.push(baseX+p[0], baseY+p[1], baseZ+p[2]);
    batch.normals.push(normal[0], normal[1], normal[2]);

    const uv = q.uvs[i];
    const u = uvRect[0] + uv[0]*du;
    const v = uvRect[1] + uv[1]*dv;
    batch.uvs.push(u, v);

    batch.colors.push(tint[0], tint[1], tint[2], (tint[3] ?? 1));
  }
  batch.indices.push(i0+0, i0+1, i0+2, i0+0, i0+2, i0+3);
  batch._indexOffset += 4;
}
function finalizeBatch(batch){
  return {
    materialId: batch.materialId,
    alphaMode: batch.alphaMode,
    positions: new Float32Array(batch.positions),
    normals:   new Float32Array(batch.normals),
    uvs:       new Float32Array(batch.uvs),
    colors:    new Float32Array(batch.colors),
    indices:   new Uint32Array(batch.indices)
  };
}

// ====== Meshing core: un sub-chunk ======
function meshSubchunk(ctx, sx,sy,sz){
  const { voxels, borderMask, chunkType, palette, subSize } = ctx;
  const xs = sx*subSize, xe = Math.min(xs+subSize, N);
  const ys = sy*subSize, ye = Math.min(ys+subSize, N);
  const zs = sz*subSize, ze = Math.min(zs+subSize, N);

  const opaque = new Map();
  const translucent = new Map();
  let facesOut = 0, voxCount = 0;

  const typeOfLocalVal = (lv) => getTypeId( palette[lv] );

  for (let x=xs; x<xe; x++){
    for (let y=ys; y<ye; y++){
      for (let z=zs; z<ze; z++){
        const lv = voxels[lin(x,y,z)];
        const typeSelf = typeOfLocalVal(lv);
        if (VoxelSet.isAir(typeSelf)) continue;
        voxCount++;

        const bsSelf = palette[lv];
        const model = getModelMeta(bsSelf);

        // (per ora modelli = CUBE unit, HALF_SLAB arriverà: bbox/posizioni custom)
        for (let d=0; d<DIRS.length; d++){
          const dir = DIRS[d];
          const nx = x + dir.dx, ny = y + dir.dy, nz = z + dir.dz;

          let visible = 0;
          if (nx>=0 && nx<N && ny>=0 && ny<N && nz>=0 && nz<N){
            const lvN = voxels[ lin(nx,ny,nz) ];
            const typeNei = typeOfLocalVal(lvN);
            visible = borderBit(typeSelf, typeNei);
          } else {
            const bitIdx = borderMaskIndex(dir.face, x,y,z);
            visible = getBorderBit(borderMask, bitIdx);
          }
          if (!visible) continue;
          facesOut++;

          const mat = getMaterialForFace(bsSelf, dir.name);
          const uvRect = getAtlasUVRect(mat.id);
          const tint   = getVertexTint(mat.id);
          const alpha  = mat.alphaMode || 'opaque';

          const map = (alpha === 'blend') ? translucent : opaque;
          if (!map.has(mat.id)) map.set(mat.id, makeBatch(mat.id, alpha));
          pushQuad(map.get(mat.id), x, y, z, dir.face, uvRect, tint, dir.normal);
        }
      }
    }
  }

  // finalize → object di batches + transferable buffers
  const outOpaque = {}, outTrans = {}, transfer = [];
  for (const [id,b] of opaque.entries()){
    const fin = finalizeBatch(b);
    outOpaque[id] = fin;
    transfer.push(fin.positions.buffer, fin.normals.buffer, fin.uvs.buffer, fin.colors.buffer, fin.indices.buffer);
  }
  for (const [id,b] of translucent.entries()){
    const fin = finalizeBatch(b);
    outTrans[id] = fin;
    transfer.push(fin.positions.buffer, fin.normals.buffer, fin.uvs.buffer, fin.colors.buffer, fin.indices.buffer);
  }

  return {
    subIndex:[sx,sy,sz],
    batches:{ opaque: outOpaque, translucent: outTrans },
    stats:{ faces: facesOut, voxels: voxCount },
    transfer
  };
}

// ====== Utility: quali sub-chunk sono toccati da un edit ======
function affectedSubchunksForEdits(edits, subSize){
  const set = new Set();
  for (const e of edits){
    const minX = Math.max(0, e.x-1), maxX = Math.min(N-1, e.x+1);
    const minY = Math.max(0, e.y-1), maxY = Math.min(N-1, e.y+1);
    const minZ = Math.max(0, e.z-1), maxZ = Math.min(N-1, e.z+1);
    const sxs = Math.floor(minX / subSize), sxe = Math.floor(maxX / subSize);
    const sys = Math.floor(minY / subSize), sye = Math.floor(maxY / subSize);
    const szs = Math.floor(minZ / subSize), sze = Math.floor(maxZ / subSize);
    for (let sx=sxs; sx<=sxe; sx++)
      for (let sy=sys; sy<=sye; sy++)
        for (let sz=szs; sz<=sze; sz++)
          set.add(`${sx},${sy},${sz}`);
  }
  const out = [];
  for (const key of set){
    const [sx,sy,sz] = key.split(',').map(n=>parseInt(n,10));
    out.push([sx,sy,sz]);
  }
  return out;
}

// ====== Worker API ======
/*
Messages:

1) initChunk
{
  type: 'initChunk',
  chunkId: string,
  chunkType: number,                         // es. ChunkType.PRAIRIE
  voxels: Uint8Array(27000),
  borderMask: Uint8Array(675),
  options?: { subchunkSize?: 15 }
}

→ Risposta: { type:'chunkReady', chunkId }

2) buildAll
{ type:'buildAll', chunkId }

→ Risposta: per ogni sub-chunk:
{ type:'submeshReady', chunkId, subIndex:[sx,sy,sz], batches:{opaque,translucent}, stats }

3) applyEdits
{
  type:'applyEdits',
  chunkId,
  edits:[ { x,y,z,newVal } ]                 // newVal = valore locale 0..255
}

→ Risposta: come buildAll ma solo per i sub-chunk toccati
*/
self.onmessage = (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === 'initChunk'){
      const { chunkId, chunkType, voxels, borderMask, options } = msg;
      const subSize = Math.max(1, Math.min(SUB, options?.subchunkSize || SUB));
      const palette = makePaletteForChunkType(chunkType);
      // Copie locali per sicurezza (o usa direttamente i buffer passati se preferisci trasferirli)
      const vox = new Uint8Array(voxels);           // 27k
      const mask = new Uint8Array(borderMask);      // 675
      store.set(chunkId, { chunkType, voxels: vox, borderMask: mask, palette, subSize });
      self.postMessage({ type:'chunkReady', chunkId });
      return;
    }

    if (msg.type === 'buildAll'){
      const ctx = store.get(msg.chunkId);
      if (!ctx) throw new Error('chunk non inizializzato');
      for (let sx=0; sx<Math.ceil(N/ctx.subSize); sx++){
        for (let sy=0; sy<Math.ceil(N/ctx.subSize); sy++){
          for (let sz=0; sz<Math.ceil(N/ctx.subSize); sz++){
            const res = meshSubchunk(ctx, sx,sy,sz);
            self.postMessage({
              type:'submeshReady',
              chunkId: msg.chunkId,
              subIndex: res.subIndex,
              batches: res.batches,
              stats: res.stats
            }, res.transfer);
          }
        }
      }
      return;
    }

    if (msg.type === 'applyEdits'){
      const { chunkId, edits } = msg;
      const ctx = store.get(chunkId);
      if (!ctx) throw new Error('chunk non inizializzato');

      // Applica edit: newVal è valore locale 0..255 (coerente con palette del chunk)
      for (const e of edits){
        if (e.x<0||e.x>=N||e.y<0||e.y>=N||e.z<0||e.z>=N) continue;
        ctx.voxels[ lin(e.x,e.y,e.z) ] = e.newVal & 0xFF;
      }

      // Sub-chunk impattati (1-voxel raggio → al più 8 sub-chunk)
      const targets = affectedSubchunksForEdits(edits, ctx.subSize);
      for (const [sx,sy,sz] of targets){
        const res = meshSubchunk(ctx, sx,sy,sz);
        self.postMessage({
          type:'submeshReady',
          chunkId,
          subIndex: res.subIndex,
          batches: res.batches,
          stats: res.stats
        }, res.transfer);
      }

      // Nota: se l'edit tocca il bordo esterno (x/y/z = 0 o 29), il lato verso FUORI chunk
      // usa ancora la borderMask pre-calcolata (che riflette lo stato del vicino).
      // Se cambi anche il chunk adiacente, dovrai chiedere il remesh dei suoi sub-chunk simmetrici.
      return;
    }

  } catch (e){
    self.postMessage({ type:'meshError', error: e?.message || 'unknown error' });
  }
};
