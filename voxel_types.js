/* voxel_types.js — base “PRAIRIE only” (UMD)
   Espone VoxelLib con:
   - ChunkType
   - VoxelSet (T, isAir, isTransparent)
   - makePaletteForChunkType(chunkType) -> Uint16Array(256)  (locale -> blockStateId)
   - getTypeId(blockStateId) -> typeId
   - getModelMeta(blockStateId) -> { model:'CUBE' }
   - getMaterialForFace(blockStateId, faceName) -> materialId (number)
   - borderBit(typeSelf, typeNei) -> 0|1

   Face names usate dal mesher: 'east','west','top','bottom','south','north'
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VoxelLib = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ------------------------------------------------------------
  // 1) Enumerazioni
  // ------------------------------------------------------------
  const ChunkType = {
    PRAIRIE: 0,
    SKY: 1,            // presenti solo per compatibilità; qui non usati
    UNDERWATER: 2
  };

  // "TypeId" logici dei voxel (non materiali!)
  const VoxelSet = {
    T: {
      Air:   0,
      Dirt:  1,
      Grass: 2,
      Rock:  3,
      Water: 4,
      Cloud: 5,
    },
    isAir(typeId) { return typeId === VoxelSet.T.Air; },
    isTransparent(typeId) {
      return (typeId === VoxelSet.T.Water) || (typeId === VoxelSet.T.Cloud) || (typeId === VoxelSet.T.Air);
    }
  };

  // Material IDs (devono combaciare con voxel_materials.js)
  // Esempio suggerito in voxel_materials.js:
  // 0: grass_top, 1: grass_side, 2: dirt, 3: rock, 5: water, 6: cloud
  const MaterialId = {
    GrassTop:  0,
    GrassSide: 1,
    Dirt:      2,
    Rock:      3,
    // 4: wood (non usato ora)
    Water:     5,
    Cloud:     6,
    // 7: sand, 8: coral (non usati ora)
  };

  // ------------------------------------------------------------
  // 2) BlockState encoding minimale
  //    Per ora blockStateId == typeId (1:1). In futuro potrai encodare varianti.
  // ------------------------------------------------------------
  function getTypeId(blockStateId) {
    return blockStateId | 0; // qui è identità
  }

  function getModelMeta(/*blockStateId*/) {
    // Solo CUBE per ora; bbox implicita [0..1]^3
    return { model: 'CUBE' };
  }

  // ------------------------------------------------------------
  // 3) Palette locale -> blockStateId (PRAIRIE-only)
  //    Locale: 0=Air, 1=Dirt, 2=Grass, 3=Rock, 4=Cloud, 5=Water, altri=Air
  // ------------------------------------------------------------
  function makePaletteForChunkType(/*chunkType*/) {
    const pal = new Uint16Array(256);
    pal[0] = VoxelSet.T.Air;
    pal[1] = VoxelSet.T.Dirt;
    pal[2] = VoxelSet.T.Grass;
    pal[3] = VoxelSet.T.Rock;
    pal[4] = VoxelSet.T.Cloud;
    pal[5] = VoxelSet.T.Water;
    for (let i = 6; i < 256; i++) pal[i] = VoxelSet.T.Air;
    return pal;
  }

  // ------------------------------------------------------------
  // 4) Materiale per faccia: blockStateId -> materialId (number)
  //    Face names: 'east','west','top','bottom','south','north'
  // ------------------------------------------------------------
  function getMaterialForFace(blockStateId, faceName) {
    const t = getTypeId(blockStateId);
    switch (t) {
      case VoxelSet.T.Grass:
        if (faceName === 'top') return MaterialId.GrassTop;
        if (faceName === 'bottom') return MaterialId.Dirt;
        // lati
        return MaterialId.GrassSide;

      case VoxelSet.T.Dirt:
        return MaterialId.Dirt;

      case VoxelSet.T.Rock:
        return MaterialId.Rock;

      case VoxelSet.T.Water:
        return MaterialId.Water;

      case VoxelSet.T.Cloud:
        return MaterialId.Cloud;

      case VoxelSet.T.Air:
      default:
        // Non dovrebbe servire: il mesher non disegna mai self=Air
        return MaterialId.Dirt;
    }
  }

  // ------------------------------------------------------------
  // 5) Regola di visibilità (bit di bordo/faccia interna)
  //    Ritorna 1 se dobbiamo DISEGNARE la faccia del voxel "self".
  // ------------------------------------------------------------
  function borderBit(typeSelf, typeNei) {
    // 1) L'aria non disegna mai la sua faccia
    if (VoxelSet.isAir(typeSelf)) return 0;

    // 2) Verso aria: mostra la faccia
    if (VoxelSet.isAir(typeNei)) return 1;

    const selfT = VoxelSet.isTransparent(typeSelf);
    const neiT  = VoxelSet.isTransparent(typeNei);

    // 3) entrambi trasparenti
    if (selfT && neiT) {
      // stesso tipo (es. water vs water): niente faccia
      if (typeSelf === typeNei) return 0;
      // trasparenti diversi (es. water vs cloud): mostra il bordo
      return 1;
    }

    // 4) self trasparente, vicino opaco -> NO (ci pensa l'opaco)
    if (selfT && !neiT) return 0;

    // 5) self opaco, vicino trasparente -> SÌ (bordo materiale)
    if (!selfT && neiT) return 1;

    // 6) entrambi opachi -> NO (facce interne non visibili)
    return 0;
  }

  // ------------------------------------------------------------
  // 6) API public
  // ------------------------------------------------------------
  return {
    ChunkType,
    VoxelSet,
    makePaletteForChunkType,
    getTypeId,
    getModelMeta,
    getMaterialForFace,
    borderBit,
  };
});
