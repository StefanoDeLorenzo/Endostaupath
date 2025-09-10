// src/app/game.js //Provo a mettere a posto il caricamento delle regioni e dei chunk 070925
import { SceneInitializer } from '../render/sceneInitializer.js';
import { WorldLoader } from '../io/worldLoader.js';
import { ChunkManager } from '../world/chunkManager.js';
import { REGION_SCHEMA } from '../world/config.js';

export class Game {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.engine = new BABYLON.Engine(this.canvas, true);
    this.scene  = new BABYLON.Scene(this.engine);

    this.sceneInitializer = new SceneInitializer(this.scene, this.engine, this.canvas);
    this.sceneInitializer.initializeScene();
    this.player = this.scene.activeCamera;

    this.chunkManager = new ChunkManager(this.scene, this.sceneInitializer.shadowGenerator);
    this.worldLoader = new WorldLoader();

    this.chunkManager.worldLoader = this.worldLoader;

    this.lastChunk = { x: null, y: null, z: null };
    this.lastRegion = { x: null, y: null, z: null };
    this.isUpdatingRegion = false;

  }

  async start() {

    // Imposta la posizione iniziale della regione dopo il caricamento
    const p = this.player.position;
    const currentRegionX = Math.floor(p.x / REGION_SCHEMA.REGION_SPAN);
    const currentRegionY = Math.floor(p.y / REGION_SCHEMA.REGION_SPAN);
    const currentRegionZ = Math.floor(p.z / REGION_SCHEMA.REGION_SPAN);

    const currentChunkX = Math.floor((p.x - currentRegionX * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkY = Math.floor((p.y - currentRegionY * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkZ = Math.floor((p.z - currentRegionZ * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);


    this.lastRegion = {
      x: currentRegionX, 
      y: currentRegionY, 
      z: currentRegionZ
    };

    this.lastChunk = { x: -1, y: -1, z: -1 }; // Assicura che il primo chunk venga caricato
    
    // Popola il "nuvolozzo" con le regioni iniziali
    await this.chunkManager.updateVoxelWindow(currentRegionX, currentRegionY, currentRegionZ);
    this.lastRegion = { x: currentRegionX, y: currentRegionY, z: currentRegionZ };
    

    // Caricamento iniziale di due regioni all'avvio
    //await this.chunkManager.loadRegionAndMeshAllChunks(0, 1, 0);
    this.chunkManager.loadRegionAndMeshAllChunks(0, 0, 0);
    //await this.chunkManager.loadRegionAndMeshAllChunks(1, 0, 0);
    //await this.chunkManager.loadRegionAndMeshAllChunks(-1, 0, 0);

    
    //await this.chunkManager.loadRegionAndMeshAllChunks(0, 0, 1);
    //await this.chunkManager.loadRegionAndMeshAllChunks(0, 0, -1);
    //await this.chunkManager.loadRegionAndMeshAllChunks(1, 0, -1);

    //await this.chunkManager.loadRegionAndMeshAllChunks(1, 0, 1);
    //await this.chunkManager.loadRegionAndMeshAllChunks(-1, 0, 1);
    //await this.chunkManager.loadRegionAndMeshAllChunks(-1, 0, -1);
    
    console.log("-----------------------------------------");
    console.log("Sono in start, carico la regione iniziale...");
    console.log("-----------------------------------------");
    /*
    const chunksToLoad = this.chunkManager.findChunksToLoad(p);
    if (chunksToLoad.length > 0) this.chunkManager.loadMissingChunks(chunksToLoad);
     
    this.chunkManager.printDebugInfo(p, chunksToLoad, this.worldLoader.loadedRegions);
    this.lastChunk = { x: currentChunkX, y: currentChunkY, z: currentChunkZ };
    */


    this.engine.runRenderLoop(() => {
      this.scene.render();
      void this.checkCameraPosition();
    });

    window.addEventListener("resize", () => this.engine.resize());
  }

  async checkCameraPosition() {
    const p = this.player.position;

    const newRegionX = Math.floor(p.x / REGION_SCHEMA.REGION_SPAN);
    const newRegionY = Math.floor(p.y / REGION_SCHEMA.REGION_SPAN);
    const newRegionZ = Math.floor(p.z / REGION_SCHEMA.REGION_SPAN);

    const currentChunkX = Math.floor((p.x - newRegionX * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkY = Math.floor((p.y - newRegionY * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkZ = Math.floor((p.z - newRegionZ * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);

    // Controlla se il giocatore è entrato in una nuova regione
    if (newRegionX !== this.lastRegion.x || newRegionY !== this.lastRegion.y || newRegionZ !== this.lastRegion.z) {

      if (!this.isUpdatingRegion) {
        this.isUpdatingRegion = true;
        
          // Aggiorna il "nuvolozzo" di voxel e carica i chunk solo dopo l'aggiornamento
          this.chunkManager.updateVoxelWindow(newRegionX, newRegionY, newRegionZ)
                .then(() => {
                    this.isUpdatingRegion = false;
                    this.lastRegion = { x: newRegionX, y: newRegionY, z: newRegionZ };
                })
        
      }
    }

    // Controlla se il caricamento dei chunk è possibile
    if (!this.isUpdatingRegion && this.chunkManager.voxelWindow) {
      if (currentChunkX !== this.lastChunk.x || currentChunkY !== this.lastChunk.y || currentChunkZ !== this.lastChunk.z) {

        const chunksToLoad = this.chunkManager.findChunksToLoad(p);
        if (chunksToLoad.length > 0) this.chunkManager.loadMissingChunks(chunksToLoad);

        this.chunkManager.printDebugInfo(p, chunksToLoad, this.worldLoader.loadedRegions);
        this.lastChunk = { x: currentChunkX, y: currentChunkY, z: currentChunkZ };
      }
    }

    this.chunkManager.unloadFarChunks(p);
    this.chunkManager.unloadFarRegions(p);
  }
}
