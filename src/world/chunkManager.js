// src/world/chunkManager.js
import { REGION_SCHEMA } from './config.js';

export class ChunkManager {
  constructor(scene, shadowGenerator, worldLoader) {
    this.scene = scene;
    this.shadowGenerator = shadowGenerator;
    this.worldLoader = worldLoader;

    this.workers = new Map();
    this.sceneMaterials = {};
    this.loadedChunks = new Set();
  }

  getOrCreateMaterial(voxelType, isTransparent, materialAlpha = 1.0) {
    if (!this.sceneMaterials[voxelType]) {
      const material = new BABYLON.StandardMaterial(`material_${voxelType}`, this.scene);

      // Grass (voxelType === 3) bump/parallax
      if (Number(voxelType) === 3) {
        material.useVertexColors = true;
        material.bumpTexture = new BABYLON.Texture("./texture/m_grass.png", this.scene);
        material.bumpTexture.level = 0.5;
        material.bumpTexture.uScale = 2.0;
        material.bumpTexture.vScale = 2.0;
        material.useParallax = true;
      } else {
        material.useVertexColors = true;
      }

      if (isTransparent) {
        material.alpha = materialAlpha;
        material.hasAlpha = true;
        material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
        material.backFaceCulling = false;
      }
      this.sceneMaterials[voxelType] = material;
    }
    return this.sceneMaterials[voxelType];
  }

  async loadChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
    const chunkKey = `${regionX}_${regionY}_${regionZ}_${chunkX}_${chunkY}_${chunkZ}`;
    if (this.loadedChunks.has(chunkKey)) return;

    await this.worldLoader.fetchAndStoreRegionData(regionX, regionY, regionZ);
    const chunkData = this.worldLoader.getChunkDataFromMemory(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);

    if (chunkData === null) { this.loadedChunks.add(chunkKey); return; }

    const workerId = `chunk_${regionX}_${regionY}_${regionZ}_${chunkX}_${chunkY}_${chunkZ}`;
    const worker = new Worker('./src/worker/worker_structured.js');
    this.workers.set(workerId, worker);

    worker.onmessage = (event) => {
      const { type, meshDataByVoxelType, voxelOpacity } = event.data;

      this.loadedChunks.add(chunkKey);

      if (type === 'meshGenerated' && meshDataByVoxelType) {
        // Posizione mondo: (region*GRID + chunk) * CHUNK_SIZE (logico 30)
        const worldX = (regionX * REGION_SCHEMA.GRID + chunkX) * REGION_SCHEMA.CHUNK_SIZE;
        const worldY = (regionY * REGION_SCHEMA.GRID + chunkY) * REGION_SCHEMA.CHUNK_SIZE;
        const worldZ = (regionZ * REGION_SCHEMA.GRID + chunkZ) * REGION_SCHEMA.CHUNK_SIZE;

        for (const voxelType in meshDataByVoxelType) {
          const md = meshDataByVoxelType[voxelType];
          if (!md.positions.length) continue;

          const isTransparent = (voxelOpacity[voxelType] === 'transparent');
          const meshName = `chunk_${regionX}_${regionY}_${regionZ}_${chunkX}_${chunkY}_${chunkZ}_${voxelType}`;
          const mesh = new BABYLON.Mesh(meshName, this.scene);

          const vd = new BABYLON.VertexData();
          vd.positions = md.positions;
          vd.indices   = md.indices;
          vd.colors    = md.colors;
          vd.normals   = md.normals;
          vd.uvs       = md.uvs;
          vd.applyToMesh(mesh);

          mesh.checkCollisions = true;

          const materialAlpha = isTransparent ? md.colors[3] : 1.0;
          mesh.material = this.getOrCreateMaterial(voxelType, isTransparent, materialAlpha);

          mesh.position = new BABYLON.Vector3(worldX, worldY, worldZ);

          if (voxelOpacity[voxelType] === 'opaque') {
            this.shadowGenerator.addShadowCaster(mesh);
            mesh.receiveShadows = true;
          }
        }
        worker.terminate();
        this.workers.delete(workerId);
      }
    };

    worker.postMessage({
      type: 'generateMeshFromChunk',
      chunkData: chunkData.buffer,
      chunkX, chunkY, chunkZ
    }, [chunkData.buffer]);
  }

  async loadRegionAndMeshAllChunks(regionX, regionY, regionZ) {
    await this.worldLoader.fetchAndStoreRegionData(regionX, regionY, regionZ);

    const tasks = [];
    for (let cx = 0; cx < REGION_SCHEMA.GRID; cx++)
      for (let cy = 0; cy < REGION_SCHEMA.GRID; cy++)
        for (let cz = 0; cz < REGION_SCHEMA.GRID; cz++)
          tasks.push(this.loadChunk(regionX, regionY, regionZ, cx, cy, cz));

    await Promise.all(tasks);
  }

  findChunksToLoad(playerPosition) {
    // Regione corrente basata su REGION_SPAN (4*30)
    const currentRegionX = Math.floor(playerPosition.x / REGION_SCHEMA.REGION_SPAN);
    const currentRegionY = Math.floor(playerPosition.y / REGION_SCHEMA.REGION_SPAN);
    const currentRegionZ = Math.floor(playerPosition.z / REGION_SCHEMA.REGION_SPAN);

    // Chunk corrente all'interno della regione
    const currentChunkX = Math.floor((playerPosition.x - currentRegionX * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkY = Math.floor((playerPosition.y - currentRegionY * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkZ = Math.floor((playerPosition.z - currentRegionZ * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);

    const chunksToLoad = [];

    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const wx = currentChunkX + dx;
          const wy = currentChunkY + dy;
          const wz = currentChunkZ + dz;

          const adjRegionX = currentRegionX + Math.floor(wx / REGION_SCHEMA.GRID);
          const adjRegionY = currentRegionY + Math.floor(wy / REGION_SCHEMA.GRID);
          const adjRegionZ = currentRegionZ + Math.floor(wz / REGION_SCHEMA.GRID);

          const adjChunkX = (wx % REGION_SCHEMA.GRID + REGION_SCHEMA.GRID) % REGION_SCHEMA.GRID;
          const adjChunkY = (wy % REGION_SCHEMA.GRID + REGION_SCHEMA.GRID) % REGION_SCHEMA.GRID;
          const adjChunkZ = (wz % REGION_SCHEMA.GRID + REGION_SCHEMA.GRID) % REGION_SCHEMA.GRID;

          const key = `${adjRegionX}_${adjRegionY}_${adjRegionZ}_${adjChunkX}_${adjChunkY}_${adjChunkZ}`;
          if (!this.loadedChunks.has(key)) {
            chunksToLoad.push({
              regionX: adjRegionX, regionY: adjRegionY, regionZ: adjRegionZ,
              chunkX: adjChunkX,   chunkY: adjChunkY,   chunkZ: adjChunkZ
            });
          }
        }

    return chunksToLoad;
  }

  async loadMissingChunks(chunksToLoad) {
    await Promise.all(chunksToLoad.map(c =>
      this.loadChunk(c.regionX, c.regionY, c.regionZ, c.chunkX, c.chunkY, c.chunkZ)
    ));
  }

  
    unloadFarChunks(playerPosition) {
        const maxDistance = REGION_SCHEMA.REGION_SPAN * 3;
        const chunksToUnload = [];

        // Prima, identifica tutti i chunk da scaricare
        for (const chunkKey of this.loadedChunks) {
            const [rx, ry, rz, cx, cy, cz] = chunkKey.split('_').map(Number);
            
            // Calcola la posizione del centro del chunk
            const chunkWorldX = (rx * REGION_SCHEMA.GRID + cx) * REGION_SCHEMA.CHUNK_SIZE + REGION_SCHEMA.CHUNK_SIZE / 2;
            const chunkWorldY = (ry * REGION_SCHEMA.GRID + cy) * REGION_SCHEMA.CHUNK_SIZE + REGION_SCHEMA.CHUNK_SIZE / 2;
            const chunkWorldZ = (rz * REGION_SCHEMA.GRID + cz) * REGION_SCHEMA.CHUNK_SIZE + REGION_SCHEMA.CHUNK_SIZE / 2;
            
            const dx = playerPosition.x - chunkWorldX;
            const dy = playerPosition.y - chunkWorldY;
            const dz = playerPosition.z - chunkWorldZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (dist > maxDistance) {
                chunksToUnload.push(chunkKey);
            }
        }

        // Poi, scarica i chunk identificati
        for (const chunkKey of chunksToUnload) {
            this.unloadChunk(chunkKey);
        }
    }

    unloadChunk(chunkKey) {
        // Rimuovi le mesh associate
        const meshPrefix = `chunk_${chunkKey}`;
        const meshes = this.scene.meshes.filter(mesh => mesh.name.startsWith(meshPrefix));
        for (const mesh of meshes) {
            mesh.dispose();
        }

        // La chiave del worker è "chunk_" + la chunkKey
        const workerId = `chunk_${chunkKey}`;
        const worker = this.workers.get(workerId);
        if (worker) {
            worker.terminate();
            this.workers.delete(workerId);
        }
        
        // Rimuovi il chunk dalla lista
        this.loadedChunks.delete(chunkKey);
    }

  printDebugInfo(playerPosition, chunksToLoad, loadedRegions) {
    const currentRegionX = Math.floor(playerPosition.x / REGION_SCHEMA.REGION_SPAN);
    const currentRegionY = Math.floor(playerPosition.y / REGION_SCHEMA.REGION_SPAN);
    const currentRegionZ = Math.floor(playerPosition.z / REGION_SCHEMA.REGION_SPAN);

    const currentChunkX = Math.floor((playerPosition.x - currentRegionX * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkY = Math.floor((playerPosition.y - currentRegionY * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkZ = Math.floor((playerPosition.z - currentRegionZ * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);

    console.log("-----------------------------------------");
    console.log(`Posizione Camera: X: ${playerPosition.x}, Y: ${playerPosition.y}, Z: ${playerPosition.z}`);
    const regionKey = `${currentRegionX}_${currentRegionY}_${currentRegionZ}`;
    console.log(`Regione Attuale: (${currentRegionX}, ${currentRegionY}, ${currentRegionZ}) - Caricata: ${loadedRegions.has(regionKey)}`);
    const chunkKey = `${currentRegionX}_${currentRegionY}_${currentRegionZ}_${currentChunkX}_${currentChunkY}_${currentChunkZ}`;
    console.log(`Chunk Attuale: (${currentChunkX}, ${currentChunkY}, ${currentChunkZ}) - Caricato: ${this.loadedChunks.has(chunkKey)}`);
    console.log("-----------------------------------------");
    console.log(`Trovati ${chunksToLoad.length} chunk da caricare nelle vicinanze.`);
    console.log("-----------------------------------------");
  }
}
