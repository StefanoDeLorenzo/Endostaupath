/* voxel_materials.js — registry materiali + texture (UMD) */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VoxelMaterials = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Directory base per le texture
  const BASE = "./textures/";

  // Materiali disponibili (id deve combaciare con quelli usati nei MaterialSet in voxel_types.js)
  // alphaMode: 'opaque' | 'blend'
  // tint: RGBA (opzionale)
  const Materials = [
    { id:0, key:"grass_top",  file: BASE+"grass_top.png",  alphaMode:"opaque", tint:[1,1,1,1] },
    { id:1, key:"grass_side", file: BASE+"grass_side.png", alphaMode:"opaque", tint:[1,1,1,1] },
    { id:2, key:"dirt",       file: BASE+"dirt.png",       alphaMode:"opaque", tint:[1,1,1,1] },
    { id:3, key:"rock",       file: BASE+"rock.png",       alphaMode:"opaque", tint:[1,1,1,1] },
    { id:4, key:"wood",       file: BASE+"wood.png",       alphaMode:"opaque", tint:[1,1,1,1] },
    { id:5, key:"water",      file: BASE+"water.png",      alphaMode:"blend",  tint:[1,1,1,0.5] },
    { id:6, key:"cloud",      file: BASE+"cloud.png",      alphaMode:"blend",  tint:[1,1,1,0.4] },
    { id:7, key:"sand",       file: BASE+"sand.png",       alphaMode:"opaque", tint:[1,1,1,1] },
    { id:8, key:"coral",      file: BASE+"coral.png",      alphaMode:"opaque", tint:[1,1,1,1] },
  ];

  // UV full-quad per texture singola
  function getUVRect(/*materialId*/) { return [0,0,1,1]; }

  function getMaterial(id) { return Materials[id]; }

  return { Materials, getMaterial, getUVRect };
});
