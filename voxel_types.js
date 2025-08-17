/* voxel_types.js — tipi + modelli + materiali + palette (UMD) */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VoxelLib = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // -----------------------------------------------------------------------
  // 1) Tipi logici & categorie (per regole di visibilità)
  // -----------------------------------------------------------------------
  const ChunkType = { PRAIRIE:0, UNDERWATER:1, SKY:2 };
  const Medium    = { Air:0, Water:1, Acid:2, Lava:3, Cloud:4 };

  const VoxelSet = (() => {
    const T = { Air:0, Dirt:1, Grass:2, Rock:3, Wood:4, Water:5, Acid:6, Lava:7, Cloud:8, Sand:9, Coral:10 };
    const C = { Air:0, Opaque:1, Water:2, Acid:3, Lava:4, Cloud:5 };
    const meta = [];
    meta[T.Air]   = { key:"Air",   cat:C.Air,   transp:false };
    meta[T.Dirt]  = { key:"Dirt",  cat:C.Opaque,transp:false };
    meta[T.Grass] = { key:"Grass", cat:C.Opaque,transp:false };
    meta[T.Rock]  = { key:"Rock",  cat:C.Opaque,transp:false };
    meta[T.Wood]  = { key:"Wood",  cat:C.Opaque,transp:false };
    meta[T.Water] = { key:"Water", cat:C.Water, transp:true  };
    meta[T.Acid]  = { key:"Acid",  cat:C.Acid,  transp:true  };
    meta[T.Lava]  = { key:"Lava",  cat:C.Lava,  transp:true  };
    meta[T.Cloud] = { key:"Cloud", cat:C.Cloud, transp:true  };
    meta[T.Sand]  = { key:"Sand",  cat:C.Opaque,transp:false };
    meta[T.Coral] = { key:"Coral", cat:C.Opaque,transp:false };
    const isAir = (id)=>id===T.Air;
    const isTransparent = (id)=>!!meta[id]?.transp;
    const isSolid = (id)=>!isAir(id)&&!isTransparent(id);
    return { T, C, meta, isAir, isTransparent, isSolid };
  })();

  // Regola facce condivisa (maschera bordo / worker)
  function borderBit(tSelf, tNei) {
    if (VoxelSet.isAir(tSelf)) return 0;  // niente facce “dell’aria”
    if (VoxelSet.isAir(tNei))  return 1;  // visibile verso il vuoto
    if (VoxelSet.isSolid(tNei)) return 0; // solido vs solido → chiuso
    return (tSelf !== tNei) ? 1 : 0;      // trasparente vs trasparente: diverso = sì, uguale = no
  }

  // -----------------------------------------------------------------------
  // 2) Atlas & Materiali
  // -----------------------------------------------------------------------
  // Atlas: array di rettangoli UV normalizzati [u0,v0,u1,v1]
  // Esempio: 4x4 tile → UV a passi di 0.25. Sostituisci con il tuo layout.
  const Atlas = [
    [0.00,0.00,0.25,0.25], // 0: grass_top
    [0.25,0.00,0.50,0.25], // 1: grass_side
    [0.50,0.00,0.75,0.25], // 2: dirt
    [0.75,0.00,1.00,0.25], // 3: rock
    [0.00,0.25,0.25,0.50], // 4: wood
    [0.25,0.25,0.50,0.50], // 5: water
    [0.50,0.25,0.75,0.50], // 6: cloud
    [0.75,0.25,1.00,0.50], // 7: sand
    [0.00,0.50,0.25,0.75], // 8: coral
    // aggiungi slot a piacere
  ];

  // Material: albedoSlot + opzionali normal/orm/tint/alpha
  const Materials = [
    { id:0, key:"grass_top",  albedo:0, tint:[1,1,1,1], alphaMode:"opaque" },
    { id:1, key:"grass_side", albedo:1, tint:[1,1,1,1], alphaMode:"opaque" },
    { id:2, key:"dirt",       albedo:2, tint:[1,1,1,1], alphaMode:"opaque" },
    { id:3, key:"rock",       albedo:3, tint:[1,1,1,1], alphaMode:"opaque" },
    { id:4, key:"wood",       albedo:4, tint:[1,1,1,1], alphaMode:"opaque" },
    { id:5, key:"water",      albedo:5, tint:[1,1,1,0.5], alphaMode:"blend" },
    { id:6, key:"cloud",      albedo:6, tint:[1,1,1,0.4], alphaMode:"blend" },
    { id:7, key:"sand",       albedo:7, tint:[1,1,1,1], alphaMode:"opaque" },
    { id:8, key:"coral",      albedo:8, tint:[1,1,1,1], alphaMode:"opaque" },
  ];
  // lookup rapido per id -> material
  const MatById = Materials; // indicizzato per semplicità

  // -----------------------------------------------------------------------
  // 3) MaterialSet (per-faccia) e BlockModels
  // -----------------------------------------------------------------------
  // MaterialSet: quale materiale usare per ogni faccia “logica”.
  // Schema semplice: { all?, top?, bottom?, north?, south?, east?, west? } → id materiale
  const MaterialSets = [
    // 0: grass block (top: grass_top, sides: grass_side, bottom: dirt)
    { id:0, all:null, top:0, bottom:2, north:1, south:1, east:1, west:1 },
    // 1: dirt full
    { id:1, all:2 },
    // 2: rock full
    { id:2, all:3 },
    // 3: water full (trasparente)
    { id:3, all:5 },
    // 4: cloud full
    { id:4, all:6 },
    // 5: sand full
    { id:5, all:7 },
    // 6: coral full
    { id:6, all:8 },
    // 7: wood full
    { id:7, all:4 },
  ];

  // Modelli base (geometria procedurale nel worker userà questi metadati)
  // Per ora: CUBE (6 facce) e HALF_SLAB (metà inferiore), più in avanti SLOPE, STAIRS, ecc.
  const BlockModels = {
    CUBE: 0,
    HALF_SLAB: 1,
    // SLOPE: 2, STAIRS: 3, ...
  };

  const ModelMeta = [];
  ModelMeta[BlockModels.CUBE] = {
    key:"cube",
    faces: ["top","bottom","north","south","east","west"], // ordine utile per UV/material
    // i vertici/uv reali li generi nel worker; qui basta l’elenco facce
  };
  ModelMeta[BlockModels.HALF_SLAB] = {
    key:"half_slab",
    faces: ["top","bottom","north","south","east","west"], // ma con bounding box Y [0..0.5]
  };

  // -----------------------------------------------------------------------
  // 4) BlockStates (palette “ricca” che il worker risolve in O(1))
  // -----------------------------------------------------------------------
  // NB: questi sono “globali”. La PALETTE del chunk mappa 0..255 -> blockStateId.
  // Qui metto esempi (solo pochi). Aggiungerai gli altri in base ai tuoi biomi.
  const BlockStates = [
    // id:0 riservato all’aria
    { id:0, typeId:VoxelSet.T.Air, modelId:BlockModels.CUBE, orientation:0, materialSetId:0, flags:0 },

    // Erba full cube (top/side/bottom differenziati via materialSet)
    { id:1, typeId:VoxelSet.T.Grass, modelId:BlockModels.CUBE, orientation:0, materialSetId:0, flags:0 },

    // Dirt, Rock, Wood
    { id:2, typeId:VoxelSet.T.Dirt, modelId:BlockModels.CUBE, orientation:0, materialSetId:1, flags:0 },
    { id:3, typeId:VoxelSet.T.Rock, modelId:BlockModels.CUBE, orientation:0, materialSetId:2, flags:0 },
    { id:4, typeId:VoxelSet.T.Wood, modelId:BlockModels.CUBE, orientation:0, materialSetId:7, flags:0 },

    // Water, Cloud (trasparenti)
    { id:5, typeId:VoxelSet.T.Water, modelId:BlockModels.CUBE, orientation:0, materialSetId:3, flags:0 },
    { id:6, typeId:VoxelSet.T.Cloud, modelId:BlockModels.CUBE, orientation:0, materialSetId:4, flags:0 },

    // Sand, Coral
    { id:7, typeId:VoxelSet.T.Sand,  modelId:BlockModels.CUBE, orientation:0, materialSetId:5, flags:0 },
    { id:8, typeId:VoxelSet.T.Coral, modelId:BlockModels.CUBE, orientation:0, materialSetId:6, flags:0 },

    // Esempio half-slab di roccia (mezzo cubo inferiore)
    { id:9, typeId:VoxelSet.T.Rock, modelId:BlockModels.HALF_SLAB, orientation:0, materialSetId:2, flags:0 },
  ];
  const BS = BlockStates; // alias semplice

  // -----------------------------------------------------------------------
  // 5) Palette per chunkType: mappa 0..255 (locale) -> blockStateId
  // Manteniamo le tue mappature attuali ma puntiamo a BlockState (non solo typeId)
  // -----------------------------------------------------------------------
  function makePaletteForChunkType(chunkType) {
    const m = new Uint8Array(256);
    m.fill(0); // 0 -> aria (BlockState 0)

    if (chunkType === ChunkType.UNDERWATER) {
      // 0=Water,1=Sand,2=Coral,3=Rock,4=Air
      m[0] = 5;  // Water -> BS#5
      m[1] = 7;  // Sand  -> BS#7
      m[2] = 8;  // Coral -> BS#8
      m[3] = 3;  // Rock  -> BS#3
      m[4] = 0;  // Air   -> BS#0
    } else if (chunkType === ChunkType.SKY) {
      // 0=Air,4=Cloud
      m[0] = 0;  // Air
      m[4] = 6;  // Cloud
    } else {
      // PRAIRIE: 0=Air,1=Dirt,2=Grass,3=Rock,4=Cloud,5=Water
      m[0] = 0;  // Air
      m[1] = 2;  // Dirt
      m[2] = 1;  // Grass
      m[3] = 3;  // Rock
      m[4] = 6;  // Cloud
      m[5] = 5;  // Water
      // esempio: potresti usare un locale (es. 6) per rock slab -> 9
      // m[6] = 9;
    }
    return m;
  }

  // -----------------------------------------------------------------------
  // 6) Helper veloci per il worker/index
  // -----------------------------------------------------------------------
  // Dato un blockStateId -> info risolte
  function getBlockState(id) { return BS[id]; }
  function getTypeId(blockStateId) { return BS[blockStateId].typeId; }
  function getModelMeta(blockStateId) { return ModelMeta[ BS[blockStateId].modelId ]; }
  function getMaterialSet(blockStateId) { return MaterialSets[ BS[blockStateId].materialSetId ]; }
  function getMaterialForFace(blockStateId, faceName) {
    const set = getMaterialSet(blockStateId);
    const matId = (set.all != null) ? set.all : (set[faceName] ?? set.all);
    return MatById[matId];
  }
  function getAtlasUVRect(materialId) { return Atlas[ MatById[materialId].albedo ]; }

  // Colori vertice/tinte (puoi mescolare biomeTint/AO in worker)
  function getVertexTint(materialId) { return MatById[materialId].tint || [1,1,1,1]; }
  function typeCategory(typeId){ return VoxelSet.meta[typeId]?.cat; }

  // Esport
  return {
    ChunkType, Medium, VoxelSet,
    Atlas, Materials, MaterialSets, BlockModels,
    BlockStates,
    makePaletteForChunkType, borderBit,
    getBlockState, getTypeId, getModelMeta, getMaterialSet, getMaterialForFace,
    getAtlasUVRect, getVertexTint, typeCategory
  };
});
