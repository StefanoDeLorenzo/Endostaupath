// src/world/chunkManager.js
import { REGION_SCHEMA } from './config.js';

export class ChunkManager {
  constructor(scene, shadowGenerator) {
    this.scene = scene;
    this.shadowGenerator = shadowGenerator;
    this.worldLoader = null;

    // MODIFICA: Thread pool per la generazione della mesh
    this.workerPool = [];
    this.taskQueue = [];
    this.POOL_SIZE = 4; // navigator.hardwareConcurrency || 4; // Dimensione del pool: usa il numero di core disponibili oppure 4 di default
    this.workers = new Map(); // Mappa per tracciare i worker attivi per chunk

    this.sceneMaterials = {};
    this.loadedChunks = new Set();

// Nuvolo di voxel per la generazione della mesh
    this.voxelWindow = null;
    this.windowOrigin = { x: null, y: null, z: null };
    this.voxelWindowUpdater = new Worker(
      new URL('../worker/voxelWindowUpdater.js', import.meta.url),
      { type: 'module' }
    );

    this._voxelWindowOpId = 0;

    // MODIFICA: Inizializza il pool di worker
    this.initializeWorkerPool();
  }

  initializeWorkerPool() {
    for (let i = 0; i < this.POOL_SIZE; i++) {
        const worker = new Worker(new URL('../worker/worker_structured.js', import.meta.url), { type: 'module' });
        worker.isFree = true; // Aggiunge una proprietà per tracciare lo stato
        this.workerPool.push(worker);
        
        // Collega un listener generico che gestisce i messaggi di tutti i worker
        worker.onmessage = this.onWorkerMessage.bind(this);
    }
  }
  // MODIFICA: Gestisce i messaggi in arrivo dai worker
  onWorkerMessage(event) {
    const { type, meshDataByVoxelType, chunkX, chunkY, chunkZ, regionX, regionY, regionZ, voxelOpacity } = event.data;
    
    // Trova il worker che ha inviato il messaggio
    const worker = this.workerPool.find(w => w === event.currentTarget);
    worker.isFree = true;
    
    const chunkKey = `${regionX}_${regionY}_${regionZ}_${chunkX}_${chunkY}_${chunkZ}`;
    this.loadedChunks.add(chunkKey);

    if (type === 'meshGenerated' && meshDataByVoxelType) {
        const worldX = (regionX * REGION_SCHEMA.GRID + chunkX) * REGION_SCHEMA.CHUNK_SIZE;
        const worldY = (regionY * REGION_SCHEMA.GRID + chunkY) * REGION_SCHEMA.CHUNK_SIZE;
        const worldZ = (regionZ * REGION_SCHEMA.GRID + chunkZ) * REGION_SCHEMA.CHUNK_SIZE;

        for (const voxelType in meshDataByVoxelType) {
            const md = meshDataByVoxelType[voxelType];
            if (!md.positions.length) continue;

            const isTransparent = (voxelOpacity[voxelType] === 'transparent');
            const meshName = `chunk_${chunkKey}_${voxelType}`;
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
    }
    this.processQueue();
  }

  // MODIFICA: Gestisce la coda delle richieste in attesa
  processQueue() {
    if (this.taskQueue.length > 0) {
      const freeWorker = this.workerPool.find(w => w.isFree);
      if (freeWorker) {
          const task = this.taskQueue.shift();
          this.submitTaskToWorker(freeWorker, task);
      }
    }
  }

  // MODIFICA: Invia un task a un worker specifico
  submitTaskToWorker(worker, task) {
    worker.isFree = false;
    worker.postMessage(task, [task.chunkData]);
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

    // MODIFICA: Preleva i dati del chunk, compreso lo shell, dal voxelWindow
    const shellData = this.getChunkDataWithShell(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
    
    // Se la shell non ha dati (es. chunk vuoto o fuori dai bordi del voxelWindow), non fare nulla
    // Questo è un controllo di sicurezza per evitare errori.
    const isChunkEmpty = shellData.every(voxel => voxel === 0);
    if (isChunkEmpty) {
        this.loadedChunks.add(chunkKey);
        return;
    }

    // MODIFICA: Ora che abbiamo il buffer completo, trova un worker e invia il task
    const freeWorker = this.workerPool.find(w => w.isFree);
    const task = {
        type: 'generateMeshFromChunk',
        chunkData: shellData.buffer, // Ora invii il buffer creato da getChunkDataWithShell()
        chunkX, chunkY, chunkZ,
        regionX, regionY, regionZ
    };

    if (freeWorker) {
        this.submitTaskToWorker(freeWorker, task);
    } else {
        this.taskQueue.push(task);
    }
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

  findChunksToLoad(playerPosition, radius = 2) {
    // Regione corrente basata su REGION_SPAN (4*30)
    const currentRegionX = Math.floor(playerPosition.x / REGION_SCHEMA.REGION_SPAN);
    const currentRegionY = Math.floor(playerPosition.y / REGION_SCHEMA.REGION_SPAN);
    const currentRegionZ = Math.floor(playerPosition.z / REGION_SCHEMA.REGION_SPAN);

    // Chunk corrente all'interno della regione
    const currentChunkX = Math.floor((playerPosition.x - currentRegionX * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkY = Math.floor((playerPosition.y - currentRegionY * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkZ = Math.floor((playerPosition.z - currentRegionZ * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);

    const chunksToLoad = [];

    // I cicli for ora si basano sul raggio visivo
    for (let dx = -radius; dx <= radius; dx++)
        for (let dy = -radius; dy <= radius; dy++)
            for (let dz = -radius; dz <= radius; dz++) {
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

    // Rimove tutte le regioni lontane che non hanno più chunk caricati - in realtà senza controllare che i chunk siano caricati o no, calcolo solo la distanza
    unloadFarRegions(playerPosition) {
        const maxDistance = REGION_SCHEMA.REGION_SPAN * 4;
        
        // Creiamo una copia del set per evitare errori durante l'iterazione
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
        // Controlla se esistono ancora chunk caricati che appartengono a questa regione
        const hasLoadedChunks = [...this.loadedChunks].some(chunkKey => chunkKey.startsWith(regionKey));
        
        // Se non ci sono più chunk di questa regione in memoria, scarichiamo la regione
        if (!hasLoadedChunks) {
            this.worldLoader.regionsData.delete(regionKey);
            this.worldLoader.loadedRegions.delete(regionKey);
            console.log(`Regione ${regionKey} scaricata dalla memoria.`);
        }
    }

// Assicurati in ctor:
// this.isInitialLoad = true;
// this.windowOrigin = { x: Infinity, y: Infinity, z: Infinity };
// this._voxelWindowOpId = 0;

async updateVoxelWindow(newRegionX, newRegionY, newRegionZ) {
  console.log('Aggiornamento finestra voxel.');

  const WINDOW_SPAN  = 3 * REGION_SCHEMA.REGION_SPAN;
  const WINDOW_BYTES = WINDOW_SPAN * WINDOW_SPAN * WINDOW_SPAN;

  // 1) Inizializza la finestra come SharedArrayBuffer la prima volta
  if (!this.voxelWindow || !(this.voxelWindow.buffer instanceof SharedArrayBuffer)) {
    const sab = new SharedArrayBuffer(WINDOW_BYTES);
    this.voxelWindow = new Uint8Array(sab);
  }

  // 2) Calcola l'origine minima della finestra 3×3×3
  const newWindowOrigin = {
    x: newRegionX - 1,
    y: newRegionY - 1,
    z: newRegionZ - 1,
  };

  // 3) Se la finestra non cambia, non fare nulla
  if (
    this.windowOrigin &&
    this.windowOrigin.x === newWindowOrigin.x &&
    this.windowOrigin.y === newWindowOrigin.y &&
    this.windowOrigin.z === newWindowOrigin.z
  ) {
    console.log('Nessun cambio di finestra. Esco da updateVoxelWindow.');
    return Promise.resolve();
  }

  // Aggiorna l'origine
  this.windowOrigin = newWindowOrigin;

  // 4) Assicurati che le 27 regioni siano in cache
  const regionFetches = [];
  for (let rx = -1; rx <= 1; rx++) {
    for (let ry = -1; ry <= 1; ry++) {
      for (let rz = -1; rz <= 1; rz++) {
        const R = { x: newRegionX + rx, y: newRegionY + ry, z: newRegionZ + rz };
        const key = `${R.x}_${R.y}_${R.z}`;
        if (!this.worldLoader.regionsData.has(key)) {
          regionFetches.push(this.worldLoader.fetchAndStoreRegionData(R.x, R.y, R.z));
        }
      }
    }
  }
  await Promise.all(regionFetches);

  if (this.isInitialLoad) {
    console.log('ChunkManager: caricamento iniziale delle regioni completato.');
    this.isInitialLoad = false;
  }

  // 5) Azzerare la finestra condivisa (regioni assenti restano aria)
  this.voxelWindow.fill(0);

  // 6) Lancia 27 worker: ciascuno riceve SOLO il buffer della sua regione
  const opId = ++this._voxelWindowOpId;
  const sab = this.voxelWindow.buffer; // SharedArrayBuffer
  const tasks = [];
  let seq = 0;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const rx = newRegionX + dx;
        const ry = newRegionY + dy;
        const rz = newRegionZ + dz;

        const regionKey = `${rx}_${ry}_${rz}`;
        const buffer = this.worldLoader.regionsData.get(regionKey) || null; // può essere null

        tasks.push(new Promise((resolve, reject) => {
          const worker = new Worker(new URL('../worker/voxelWindowUpdater.js', import.meta.url), { type: 'module' });
          const id = (opId << 8) | (seq & 0xff); // id univoco per questa richiesta+worker
          seq++;

          const onMessage = (event) => {
            const { type, id: respId, error } = event.data || {};
            if (respId !== id) return; // ignora messaggi di altre richieste
            worker.removeEventListener('message', onMessage);
            worker.terminate();

            if (type === 'regionSliceDone') return resolve();
            if (type === 'voxelWindowError') return reject(new Error(error || 'voxelWindow worker error'));
            // fallback: risolvi comunque
            resolve();
          };

          worker.addEventListener('message', onMessage);

          // Una sola entry: la regione di competenza di questo worker
          const regionBuffers = { [regionKey]: buffer };

          worker.postMessage({
            type: 'copyRegionToSAB',
            id,
            regionBuffers,             // { "<rx>_<ry>_<rz>": ArrayBuffer|null } (una sola chiave)
            windowOrigin: this.windowOrigin, // origine minima della finestra 3×3×3
            sab,                       // SharedArrayBuffer su cui scrivere
          }/*, buffer ? [buffer] : undefined */);
        }));
      }
    }
  }

  // 7) Attendi tutti i worker
  await Promise.all(tasks);

  // A questo punto this.voxelWindow (SAB) è completa
  return;
}



  // --- 2. Metodo per ottenere i dati del chunk con la shell virtuale ---
  // Aggiungilo a chunkManager.js
  getChunkDataWithShell(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
    const CHUNK_SIZE_SHELL = REGION_SCHEMA.CHUNK_SIZE_SHELL;
    const CHUNK_SIZE = REGION_SCHEMA.CHUNK_SIZE;
    const WINDOW_VOXEL_SPAN = 3 * REGION_SCHEMA.REGION_SPAN;

    const shellData = new Uint8Array(CHUNK_SIZE_SHELL ** 3);

    const originX = (regionX - this.windowOrigin.x) * REGION_SCHEMA.REGION_SPAN + chunkX * CHUNK_SIZE;
    const originY = (regionY - this.windowOrigin.y) * REGION_SCHEMA.REGION_SPAN + chunkY * CHUNK_SIZE;
    const originZ = (regionZ - this.windowOrigin.z) * REGION_SCHEMA.REGION_SPAN + chunkZ * CHUNK_SIZE;
    
    // NUOVO ORDINE: x, y, z
    for (let x = 0; x < CHUNK_SIZE_SHELL; x++) {
      for (let y = 0; y < CHUNK_SIZE_SHELL; y++) {
        for (let z = 0; z < CHUNK_SIZE_SHELL; z++) {
          const globalX = originX + x - 1;
          const globalY = originY + y - 1;
          const globalZ = originZ + z - 1;

          if (
            globalX >= 0 && globalX < WINDOW_VOXEL_SPAN &&
            globalY >= 0 && globalY < WINDOW_VOXEL_SPAN &&
            globalZ >= 0 && globalZ < WINDOW_VOXEL_SPAN
          ) {
            // CORREZIONE: Ordine dell'offset per X-maggiore
            const windowIndex = globalX + globalY * WINDOW_VOXEL_SPAN + globalZ * WINDOW_VOXEL_SPAN * WINDOW_VOXEL_SPAN;
            const shellIndex = x + y * CHUNK_SIZE_SHELL + z * CHUNK_SIZE_SHELL * CHUNK_SIZE_SHELL;
            shellData[shellIndex] = this.voxelWindow[windowIndex];
          }
        }
      }
    }
    return shellData;
  }

  // onRegionDataReady removed - worker now updates voxel window directly

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
