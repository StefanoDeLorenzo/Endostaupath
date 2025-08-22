// src/worker/worker_structured.js
// WebWorker (ES module) — compatibile con il tuo protocollo legacy:
// IN:  { type:'generateMeshFromChunk', chunkData:ArrayBuffer, chunkX, chunkY, chunkZ }
// OUT: { type:'meshGenerated', meshDataByVoxelType: { [voxelType]: {positions,indices,colors,normals,uvs} }, voxelOpacity: { [voxelType]:'opaque'|'transparent' } }

import { makeOpacityRank } from '../mesh/common.js';
import { meshNaivePerMaterial } from '../mesh/mesher_naive.js';

// === Costanti di progetto (come nel tuo generator.js) ===
const SHELL_SIZE   = 32;
const LOGICAL_SIZE = 30;
const SHELL_MARGIN = 1;

// Tipi voxel
const VoxelTypes = { Air:0, Dirt:1, Cloud:2, Grass:3, Rock:4 };

// Rank di opacità (0 aria, 1 trasparente, 2 opaco)
const OPACITY_RANK = makeOpacityRank({
  transparent: [VoxelTypes.Cloud],
  opaque: [VoxelTypes.Dirt, VoxelTypes.Grass, VoxelTypes.Rock],
});

// Per il main (stringhe richieste dal tuo codice)
const VOXEL_OPACITY_TEXT = {
  [VoxelTypes.Air]:   'transparent',
  [VoxelTypes.Cloud]: 'transparent',
  [VoxelTypes.Dirt]:  'opaque',
  [VoxelTypes.Grass]: 'opaque',
  [VoxelTypes.Rock]:  'opaque',
};

// Winding/handedness (Babylon: left-handed, front=CW)
const WINDING = { leftHanded: true, frontIsCCW: false };

// Handler
self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg.type !== 'string') return;

  // Compat legacy (minime modifiche a structured.html)
  if (msg.type === 'generateMeshFromChunk') {
    try {
      const arr = msg.chunkData instanceof ArrayBuffer ? new Uint8Array(msg.chunkData) :
                  (msg.chunkData instanceof Uint8Array ? msg.chunkData : new Uint8Array(msg.chunkData));
      if (arr.length !== SHELL_SIZE * SHELL_SIZE * SHELL_SIZE) {
        throw new Error(`chunkData length ${arr.length} != ${SHELL_SIZE**3}`);
      }

      const { byType, voxelOpacity } = meshNaivePerMaterial(
        arr,
        { shellSize: SHELL_SIZE, logicalSize: LOGICAL_SIZE, shellMargin: SHELL_MARGIN },
        OPACITY_RANK,
        WINDING
      );

      // Adatta l’output al tuo formato atteso
      const meshDataByVoxelType = {};
      const transfers = [];
      for (const tStr of Object.keys(byType)) {
        const t = tStr | 0;
        const buf = byType[t];

        meshDataByVoxelType[tStr] = {
          positions: buf.positions,
          indices:   buf.indices,
          colors:    buf.colors,
          normals:   buf.normals,
          uvs:       buf.uvs,
        };

        // trasferisci i buffer per zero-copy
        transfers.push(
          buf.positions.buffer,
          buf.indices.buffer,
          buf.colors.buffer,
          buf.normals.buffer,
          buf.uvs.buffer
        );
      }

      // compila mappa di opacità testuale
      const opacityTextMap = {};
      for (const tStr of Object.keys(meshDataByVoxelType)) {
        const t = tStr | 0;
        opacityTextMap[tStr] = VOXEL_OPACITY_TEXT[t] || 'opaque';
      }

      self.postMessage({
        type: 'meshGenerated',
        meshDataByVoxelType,
        voxelOpacity: opacityTextMap
      }, transfers);
    } catch (err) {
      self.postMessage({ type: 'error', message: (err && err.message) ? err.message : String(err) });
    }
    return;
  }

  // (In futuro possiamo gestire anche INIT/BUILD_CHUNK strutturati)
};
