// worker_structured_compat.js  —  Protocollo legacy:
// IN : { type:'generateMeshFromChunk', chunkData:ArrayBuffer, chunkX, chunkY, chunkZ }
// OUT: { type:'meshGenerated', meshDataByVoxelType:{[type]:{positions,indices,colors,normals,uvs}}, voxelOpacity:{[type]:'opaque'|'transparent'} }

// --- Parametri world/chunk (legacy 32^3 con shell -> 30^3 logico) ---
const SHELL_SIZE   = 32;
const LOGICAL_SIZE = 30;
const SHELL_MARGIN = 1;

// --- Tipi voxel (come nel tuo generator.js) ---
const VoxelTypes = { Air:0, Dirt:1, Cloud:2, Grass:3, Rock:4 };

// --- Classificazione materiali ---
const TRANSPARENT_SET = new Set([VoxelTypes.Cloud]);                  // (estendibile)
const OPAQUE_SET      = new Set([VoxelTypes.Dirt, VoxelTypes.Grass, VoxelTypes.Rock]);

// Mappa testuale richiesta dal tuo main per scegliere il materiale
const VOXEL_OPACITY_TEXT = {
  [VoxelTypes.Air]:   'transparent',
  [VoxelTypes.Cloud]: 'transparent',
  [VoxelTypes.Dirt]:  'opaque',
  [VoxelTypes.Grass]: 'opaque',
  [VoxelTypes.Rock]:  'opaque',
};

// --- Winding / sistema di coordinate ---
// Babylon default: left-handed, front face = CW
const LEFT_HANDED = true;
let   FRONT_IS_CW = false; // se vedi facce invertite su un asse, metti false

// --- Helpers di base ---
function idx(x,y,z,S){ return x + y*S + z*S*S; }
function isAir(t){ return t === VoxelTypes.Air; }
function isTransparent(t){ return TRANSPARENT_SET.has(t); }
function isOpaque(t){ return OPAQUE_SET.has(t); }

// Regola di culling (come richiesto):
// - verso Air -> true
// - verso Trasparente -> true se (trasparente && tipo diverso)
// - opaco-trasparente -> SOLO lato opaco (questa funzione viene chiamata dal lato "corrente")
// - opaco-opaco -> false
function shouldEmitFace(currType, neighType) {
  if (isAir(neighType)) return true;

  const currTransp = isTransparent(currType);
  const neighTransp = isTransparent(neighType);

  if (neighTransp) {
    if (currTransp) {
      // trasparente vs trasparente → disegna SOLO se tipo diverso
      return currType !== neighType;
    } else {
      // opaco contro trasparente → emette il lato opaco (qui siamo sul lato opaco)
      return true;
    }
  }

  // qui: vicino opaco
  if (currTransp) {
    // trasparente contro opaco → NON emettere (lo farà l’opaco)
    return false;
  }

  // opaco vs opaco → culled
  return false;
}

// Indici per i due triangoli di un quad, baseIndex = primo dei 4 vertici
function writeIndices(buf, baseIndex) {
  // CCW: 0-1-2, 0-2-3
  buf.indices[buf._iCursor++] = baseIndex+0;
  buf.indices[buf._iCursor++] = baseIndex+1;
  buf.indices[buf._iCursor++] = baseIndex+2;
  buf.indices[buf._iCursor++] = baseIndex+0;
  buf.indices[buf._iCursor++] = baseIndex+2;
  buf.indices[buf._iCursor++] = baseIndex+3;
}

// Emetti un quad per una faccia del voxel (lx,ly,lz in coordinate LOGICHE 0..L-1)
function emitQuad(buf, lx, ly, lz, dir /*0..5*/, alpha /*0..1*/) {
  const x0=lx,   x1=lx+1;
  const y0=ly,   y1=ly+1;
  const z0=lz,   z1=lz+1;

  // 6 direzioni: +X,-X,+Y,-Y,+Z,-Z
  // Ogni voce: 4 posizioni [x,y,z] ordinate per ottenere il winding corretto
  let verts, nx=0, ny=0, nz=0;
  switch (dir) {
    case 0: // +X
      nx=+1; verts=[[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]]; break;
    case 1: // -X
      nx=-1; verts=[[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0]]; break;
    case 2: // +Y
      ny=+1; verts=[[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]]; break;
    case 3: // -Y
      ny=-1; verts=[[x0,y0,z1],[x0,y0,z0],[x1,y0,z0],[x1,y0,z1]]; break;
    case 4: // +Z
      nz=+1; verts=[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]]; break;
    case 5: // -Z
      nz=-1; verts=[[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]]; break;
  }

  const baseIndex = buf._vCursor / 3;

  // 4 vertici: pos, norm, uv, color
  const UV = [[0,0],[1,0],[1,1],[0,1]];
  for (let k=0;k<4;k++) {
    const [px,py,pz] = verts[k];

    buf.positions[buf._vCursor+0]=px;
    buf.positions[buf._vCursor+1]=py;
    buf.positions[buf._vCursor+2]=pz;
    buf.normals[buf._vCursor+0]=nx;
    buf.normals[buf._vCursor+1]=ny;
    buf.normals[buf._vCursor+2]=nz;
    buf._vCursor += 3;

    const uvOff = (baseIndex + k)*2;
    buf.uvs[uvOff+0]=UV[k][0]; buf.uvs[uvOff+1]=UV[k][1];

    const cOff = (baseIndex + k)*4;
    buf.colors[cOff+0]=1; buf.colors[cOff+1]=1; buf.colors[cOff+2]=1; buf.colors[cOff+3]=alpha;
  }

  writeIndices(buf, baseIndex);
}

function allocBuffersForFaces(faceN) {
  const verts = faceN * 4;
  const tris  = faceN * 2;
  return {
    positions: new Float32Array(verts*3),
    normals:   new Float32Array(verts*3),
    uvs:       new Float32Array(verts*2),
    colors:    new Float32Array(verts*4),
    indices:   (verts-1)<=65535 ? new Uint16Array(tris*3) : new Uint32Array(tris*3),
    _vCursor: 0,
    _iCursor: 0
  };
}

// --- Mesher per-materiale (naive) con la regola di culling corretta ---
function meshPerMaterial(voxels /*Uint8Array len 32^3*/) {
  const S=SHELL_SIZE, L=LOGICAL_SIZE, M=SHELL_MARGIN;
  const xMin=M, xMax=M+L-1, yMin=M, yMax=M+L-1, zMin=M, zMax=M+L-1;

  // Pass 1: conta facce per tipo
  const faceCount = new Uint32Array(256);

  for (let z=zMin; z<=zMax; z++) {
    for (let y=yMin; y<=yMax; y++) {
      for (let x=xMin; x<=xMax; x++) {
        const T = voxels[idx(x,y,z,S)];
        if (isAir(T)) continue; // aria non emette mai

        if (shouldEmitFace(T, voxels[idx(x+1,y,z,S)])) faceCount[T]++;
        if (shouldEmitFace(T, voxels[idx(x-1,y,z,S)])) faceCount[T]++;
        if (shouldEmitFace(T, voxels[idx(x,y+1,z,S)])) faceCount[T]++;
        if (shouldEmitFace(T, voxels[idx(x,y-1,z,S)])) faceCount[T]++;
        if (shouldEmitFace(T, voxels[idx(x,y,z+1,S)])) faceCount[T]++;
        if (shouldEmitFace(T, voxels[idx(x,y,z-1,S)])) faceCount[T]++;
      }
    }
  }

  // Alloc per tipo
  const byType = Object.create(null);
  for (let t=0; t<256; t++) {
    const f = faceCount[t];
    if (!f) continue;
    byType[t] = allocBuffersForFaces(f);
  }
  if (Object.keys(byType).length === 0) {
    return { byType: {}, voxelOpacity: {} };
  }

  // Pass 2: emetti
  for (let z=zMin; z<=zMax; z++) {
    for (let y=yMin; y<=yMax; y++) {
      for (let x=xMin; x<=xMax; x++) {
        const T = voxels[idx(x,y,z,S)];
        if (isAir(T)) continue;

        const lx = x - M, ly = y - M, lz = z - M;
        const buf = byType[T];
        if (!buf) continue;

        // alpha per materiale: opachi 1.0, trasparenti <1 (es. Cloud 0.6)
        const alpha = isTransparent(T) ? 0.6 : 1.0;

        if (shouldEmitFace(T, voxels[idx(x+1,y,z,S)])) emitQuad(buf,lx,ly,lz,0,alpha); // +X
        if (shouldEmitFace(T, voxels[idx(x-1,y,z,S)])) emitQuad(buf,lx,ly,lz,1,alpha); // -X
        if (shouldEmitFace(T, voxels[idx(x,y+1,z,S)])) emitQuad(buf,lx,ly,lz,2,alpha); // +Y
        if (shouldEmitFace(T, voxels[idx(x,y-1,z,S)])) emitQuad(buf,lx,ly,lz,3,alpha); // -Y
        if (shouldEmitFace(T, voxels[idx(x,y,z+1,S)])) emitQuad(buf,lx,ly,lz,4,alpha); // +Z
        if (shouldEmitFace(T, voxels[idx(x,y,z-1,S)])) emitQuad(buf,lx,ly,lz,5,alpha); // -Z
      }
    }
  }

  // pulizia cursori
  for (const k of Object.keys(byType)) {
    delete byType[k]._vCursor;
    delete byType[k]._iCursor;
  }

  // Opacità testuale per i tipi presenti
  const voxelOpacity = {};
  for (const k of Object.keys(byType)) {
    const t = k|0;
    voxelOpacity[k] = VOXEL_OPACITY_TEXT[t] || 'opaque';
  }

  return { byType, voxelOpacity };
}

// --- Messaggi legacy ---
self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'generateMeshFromChunk') return;

  try {
    const arr = msg.chunkData instanceof ArrayBuffer ? new Uint8Array(msg.chunkData)
              : (msg.chunkData instanceof Uint8Array ? msg.chunkData
              : new Uint8Array(msg.chunkData));

    if (arr.length !== SHELL_SIZE*SHELL_SIZE*SHELL_SIZE) {
      throw new Error(`chunkData length ${arr.length} != ${SHELL_SIZE**3}`);
    }

    const { byType, voxelOpacity } = meshPerMaterial(arr);

    const meshDataByVoxelType = {};
    const transfers = [];
    for (const tStr of Object.keys(byType)) {
      const buf = byType[tStr];
      meshDataByVoxelType[tStr] = {
        positions: buf.positions,
        indices:   buf.indices,
        colors:    buf.colors,
        normals:   buf.normals,
        uvs:       buf.uvs,
      };
      transfers.push(
        buf.positions.buffer,
        buf.indices.buffer,
        buf.colors.buffer,
        buf.normals.buffer,
        buf.uvs.buffer
      );
    }

    self.postMessage({
      type: 'meshGenerated',
      meshDataByVoxelType,
      voxelOpacity
    }, transfers);

  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
