// src/worker/worker_structured.js
// WebWorker (ES module) — orchestratore del meshing naive.
// Protocollo:
//   INIT  -> { type:'INIT', sizes:{shellSize, logicalSize, shellMargin}, classify:{opaque:number[]}, uv?:{atlasCols, atlasRows, tileForType} }
//   BUILD_CHUNK -> { type:'BUILD_CHUNK', key:{rx,ry,rz,cx,cy,cz}?, voxels:Uint8Array }
//   MESH_READY  <- { type:'MESH_READY', key, counts, positions, normals, uvs, indices }  (con transferables)

import { makeOpaqueMap } from '../mesh/common.js';
import { meshNaive } from '../mesh/mesher_naive.js';

let SIZES = { shellSize: 32, logicalSize: 30, shellMargin: 1 };
let OPAQUE_MAP = (() => {
  const m = new Uint8Array(256);
  // Default: opachi = Dirt(1), Grass(3), Rock(4) — come nel tuo generator
  m[1] = 1; m[3] = 1; m[4] = 1;
  return m;
})();
let UVCFG = { atlasCols: 1, atlasRows: 1, tileForType: { 0: 0 } }; // opzionale

self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'INIT': {
      const sizes = msg.sizes || {};
      const shellSize   = (sizes.shellSize   | 0) || 32;
      const logicalSize = (sizes.logicalSize | 0) || Math.max(0, shellSize - 2);
      const shellMargin = (sizes.shellMargin | 0) || ((shellSize - logicalSize) >> 1);

      SIZES = { shellSize, logicalSize, shellMargin };

      if (msg.classify?.opaque) {
        OPAQUE_MAP = makeOpaqueMap(msg.classify.opaque);
      }

      if (msg.uv) {
        UVCFG = {
          atlasCols: msg.uv.atlasCols | 0 || 1,
          atlasRows: (msg.uv.atlasRows | 0) || (msg.uv.atlasCols | 0) || 1,
          tileForType: msg.uv.tileForType || { 0: 0 }
        };
      }

      // ack
      self.postMessage({ type: 'INIT_OK', sizes: SIZES });
      break;
    }

    case 'BUILD_CHUNK': {
      try {
        const { voxels, key } = msg;
        if (!(voxels instanceof Uint8Array)) throw new Error('voxels must be Uint8Array');
        const expected = SIZES.shellSize ** 3;
        if (voxels.length !== expected) {
          throw new Error(`voxels length mismatch: got ${voxels.length}, expected ${expected}`);
        }

        const res = meshNaive(voxels, SIZES, OPAQUE_MAP, UVCFG);

        // Transfer buffers per evitare copie
        const transfers = [
          res.positions.buffer, res.normals.buffer, res.uvs.buffer, res.indices.buffer
        ];

        self.postMessage({
          type: 'MESH_READY',
          key: key || null,
          counts: res.counts,
          positions: res.positions,
          normals: res.normals,
          uvs: res.uvs,
          indices: res.indices
        }, transfers);
      } catch (err) {
        self.postMessage({
          type: 'MESH_ERROR',
          error: (err && err.message) ? err.message : String(err),
          key: msg.key || null
        });
      }
      break;
    }

    default:
      // ignora tipi non riconosciuti (estendibile in futuro)
      break;
  }
};
