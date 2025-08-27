// src/world/chunkManager.js
import { REGION_SCHEMA } from './config.js';

export class ChunkManager {
  constructor(scene, shadowGenerator, worldLoader) {
    this.scene = scene;
    this.shadowGenerator = shadowGenerator;
    this.worldLoader = worldLoader;

    // Thread pool per la generazione della mesh
    this.workerPool = [];
    this.workerStatus = new Map(); // Mappa l'ID del worker al chunkKey che sta elaborando
    this.taskQueue = [];
    this.POOL_SIZE = 3; // Dimensione del pool dedicata alla generazione della mesh

    this.sceneMaterials = {};
    this.loadedChunks = new Set();
    
    this.initializeWorkerPool();
  }

  // Crea i worker e li aggiunge al pool
  initializeWorkerPool() {
    for (let i = 0; i < this.POOL_SIZE; i++) {
        const worker = new Worker(new URL('../worker/worker_structured.js', import.meta.url), { type: 'module' });
        worker.id = i;
        this.workerPool.push(worker);
        this.workerStatus.set(worker.id, null); // Stato iniziale: libero
        
        worker.onmessage = this.onWorkerMessage.bind(this);
    }
  }

  onWorkerMessage(event) {
    const { type, meshDataByVoxelType, chunkX, chunkY, chunkZ, regionX, regionY, regionZ, voxelOpacity } = event.data;
    
    const chunkKey = `${regionX}_${regionY}_${regionZ}_${chunkX}_${chunkY}_${chunkZ}`;
    
    if (type === 'meshGenerated') {
        const workerId = this.workerStatus.get(chunkKey);
        
        if (workerId !== undefined) {
            this.createMeshFromData(meshDataByVoxelType, chunkKey, voxelOpacity, regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
            this.loadedChunks.add(chunkKey);
            
            // Segna il worker come libero e processa il prossimo lavoro
            this.workerStatus.delete(chunkKey);
            this.workerStatus.set(workerId, null);
            this.processQueue();
        }
    }
  }

  processQueue() {
    if (this.taskQueue.length === 0) return;

    for (const worker of this.workerPool) {
      if (this.workerStatus.get(worker.id) === null) {
        const task = this.taskQueue.shift();
        if (task) {
          const { chunkData, chunkKey, regionX, regionY, regionZ, chunkX, chunkY, chunkZ } = task;
          
          this.workerStatus.set(worker.id, chunkKey); // Segna il worker come occupato
          this.workerStatus.set(chunkKey, worker.id);
          worker.postMessage({
              type: 'generateMeshFromChunk',
              chunkData,
              chunkX,
              chunkY,
              chunkZ,
              regionX,
              regionY,
              regionZ
          }, [chunkData.buffer]);
          break;
        }
      }
    }
  }

  getOrCreateMaterial(voxelType, isTransparent, materialAlpha = 1.0) {
    if (!this.sceneMaterials[voxelType]) {
      const material = new BABYLON.StandardMaterial(`material_${voxelType}`, this.scene);
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
        material.disableLighting = true;
      }
      this.sceneMaterials[voxelType] = material;
    }
    return this.sceneMaterials[voxelType];
  }

  createMeshFromData(meshDataByVoxelType, chunkKey, voxelOpacity, regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
    const oldMeshes = this.scene.meshes.filter(mesh => mesh.name.startsWith(`chunk_${chunkKey}_`));
    for (const mesh of oldMeshes) {
      mesh.dispose();
    }
  
    const worldX = (regionX * REGION_SCHEMA.GRID + chunkX) * REGION_SCHEMA.CHUNK_SIZE;
    const worldY = (regionY * REGION_SCHEMA.GRID + chunkY) * REGION_SCHEMA.CHUNK_SIZE;
    const worldZ = (rz * REGION_SCHEMA.GRID + cz) * REGION_SCHEMA.CHUNK_SIZE;

    for (const voxelType in meshDataByVoxelType) {
      const md = meshDataByVoxelType[voxelType];
      if (!md.positions.length) continue;
      
      const isTransparent = (voxelOpacity[voxelType] === 'transparent');
      const meshName = `chunk_${chunkKey}_${voxelType}`;
      const mesh = new BABYLON.Mesh(meshName, this.scene);
      
      const vd = new BABYLON.VertexData();
      vd.positions = md.positions;
      vd.indices = md.indices;
      vd.normals = md.normals;
      vd.colors = md.colors;
      vd.uvs = md.uvs;
      
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
  }

  // Nuovo metodo unificato per caricare un singolo chunk e metterlo in coda
  async loadChunkAndMesh(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
    const chunkKey = `${regionX}_${regionY}_${regionZ}_${chunkX}_${chunkY}_${chunkZ}`;
    if (this.loadedChunks.has(chunkKey)) return;

    const chunkData = await this.worldLoader.getChunkDataFromMemory(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
    if (!chunkData) {
      this.loadedChunks.add(chunkKey);
      return;
    }

    this.taskQueue.push({ chunkData, chunkKey, regionX, regionY, regionZ, chunkX, chunkY, chunkZ });
    this.processQueue();
  }

  async loadRegionAndMeshAllChunks(regionX, regionY, regionZ) {
    await this.worldLoader.fetchAndStoreRegionData(regionX, regionY, regionZ);
    const regionKey = `${regionX}_${regionY}_${regionZ}`;

    for (let cx = 0; cx < REGION_SCHEMA.GRID; cx++) {
      for (let cy = 0; cy < REGION_SCHEMA.GRID; cy++) {
        for (let cz = 0; cz < REGION_SCHEMA.GRID; cz++) {
          const chunkX = cx;
          const chunkY = cy;
          const chunkZ = cz;
          
          this.loadChunkAndMesh(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
        }
      }
    }
  }

  findChunksToLoad(playerPosition) {
    const chunksToLoad = [];
    const VIEW_DISTANCE_CHUNKS = 2;

    const currentRegionX = Math.floor(playerPosition.x / REGION_SCHEMA.REGION_SPAN);
    const currentRegionY = Math.floor(playerPosition.y / REGION_SCHEMA.REGION_SPAN);
    const currentRegionZ = Math.floor(playerPosition.z / REGION_SCHEMA.REGION_SPAN);

    const currentChunkX = Math.floor((playerPosition.x - currentRegionX * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkY = Math.floor((playerPosition.y - currentRegionY * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkZ = Math.floor((playerPosition.z - currentRegionZ * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);

    for (let x = -VIEW_DISTANCE_CHUNKS; x <= VIEW_DISTANCE_CHUNKS; x++) {
      for (let y = -VIEW_DISTANCE_CHUNKS; y <= VIEW_DISTANCE_CHUNKS; y++) {
        for (let z = -VIEW_DISTANCE_CHUNKS; z <= VIEW_DISTANCE_CHUNKS; z++) {
          const adjChunkX = currentChunkX + x;
          const adjChunkY = currentChunkY + y;
          const adjChunkZ = currentChunkZ + z;
          
          const finalRegionX = currentRegionX + Math.floor(adjChunkX / REGION_SCHEMA.GRID);
          const finalRegionY = currentRegionY + Math.floor(adjChunkY / REGION_SCHEMA.GRID);
          const finalRegionZ = currentRegionZ + Math.floor(adjChunkZ / REGION_SCHEMA.GRID);
          
          const finalChunkX = (adjChunkX % REGION_SCHEMA.GRID + REGION_SCHEMA.GRID) % REGION_SCHEMA.GRID;
          const finalChunkY = (adjChunkY % REGION_SCHEMA.GRID + REGION_SCHEMA.GRID) % REGION_SCHEMA.GRID;
          const finalChunkZ = (adjChunkZ % REGION_SCHEMA.GRID + REGION_SCHEMA.GRID) % REGION_SCHEMA.GRID;

          const chunkKey = `${finalRegionX}_${finalRegionY}_${finalRegionZ}_${finalChunkX}_${finalChunkY}_${finalChunkZ}`;

          if (!this.loadedChunks.has(chunkKey)) {
            chunksToLoad.push({
              regionX: finalRegionX, regionY: finalRegionY, regionZ: finalRegionZ,
              chunkX: finalChunkX, chunkY: finalChunkY, chunkZ: finalChunkZ
            });
          }
        }
      }
    }
    return chunksToLoad;
  }

  unloadFarChunks(playerPosition) {
      const maxDistance = REGION_SCHEMA.REGION_SPAN * 3;
      const chunksToUnload = [];

      for (const chunkKey of this.loadedChunks) {
          const [rx, ry, rz, cx, cy, cz] = chunkKey.split('_').map(Number);
          
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

      for (const chunkKey of chunksToUnload) {
          this.unloadChunk(chunkKey);
      }
  }

  unloadChunk(chunkKey) {
      const meshPrefix = `chunk_${chunkKey}`;
      const meshes = this.scene.meshes.filter(mesh => mesh.name.startsWith(meshPrefix));
      for (const mesh of meshes) {
          mesh.dispose();
      }
      
      this.loadedChunks.delete(chunkKey);
  }

  unloadFarRegions(playerPosition) {
      const maxDistance = REGION_SCHEMA.REGION_SPAN * 4;
      
      for (const regionKey of [...this.worldLoader.loadedRegions]) {
          const [rx, ry, rz] = regionKey.split('_').map(Number);
          
          const regionWorldX = rx * REGION_SCHEMA.REGION_SPAN + REGION_SCHEMA.REGION_SPAN / 2;
          const regionWorldY = ry * REGION_SCHEMA.REGION_SPAN + REGION_SCHEMA.REGION_SPAN / 2;
          const regionWorldZ = rz * REGION_SCHEMA.REGION_SPAN + REGION_SCHEMA.REGION_SPAN / 2;
          
          const dx = playerPosition.x - regionWorldX;
          const dy = playerPosition.y - regionWorldY;
          const dz = playerPosition.z - regionWorldZ;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          
          if (dist > maxDistance) {
              this.unloadRegionIfAllChunksUnloaded(regionKey);
          }
      }
  }

  unloadRegionIfAllChunksUnloaded(regionKey) {
      const hasLoadedChunks = [...this.loadedChunks].some(chunkKey => chunkKey.startsWith(regionKey));
      
      if (!hasLoadedChunks) {
          this.worldLoader.regionsData.delete(regionKey);
          this.worldLoader.loadedRegions.delete(regionKey);
          console.log(`Regione ${regionKey} scaricata dalla memoria.`);
      }
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