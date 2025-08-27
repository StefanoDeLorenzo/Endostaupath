// src/app/game.js
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

    this.worldLoader = new WorldLoader();
    this.chunkManager = new ChunkManager(this.scene, this.sceneInitializer.shadowGenerator, this.worldLoader);

    this.lastChunk = { x: null, y: null, z: null };
  }

  async start() {
    // Caricamento iniziale di due regioni all'avvio (come nel tuo)
    await this.chunkManager.loadRegionAndMeshAllChunks(0, 0, 0);
    await this.chunkManager.loadRegionAndMeshAllChunks(1, 0, 0);

    this.engine.runRenderLoop(() => {
      this.scene.render();
      this.checkCameraPosition();
    });

    window.addEventListener("resize", () => this.engine.resize());
  }

  checkCameraPosition() {
    const p = this.player.position;

    const currentRegionX = Math.floor(p.x / REGION_SCHEMA.REGION_SPAN);
    const currentRegionY = Math.floor(p.y / REGION_SCHEMA.REGION_SPAN);
    const currentRegionZ = Math.floor(p.z / REGION_SCHEMA.REGION_SPAN);

    const currentChunkX = Math.floor((p.x - currentRegionX * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkY = Math.floor((p.y - currentRegionY * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);
    const currentChunkZ = Math.floor((p.z - currentRegionZ * REGION_SCHEMA.REGION_SPAN) / REGION_SCHEMA.CHUNK_SIZE);

    if (currentChunkX !== this.lastChunk.x || currentChunkY !== this.lastChunk.y || currentChunkZ !== this.lastChunk.z) {
      
      const chunksToLoad = this.chunkManager.findChunksToLoad(p);
      if (chunksToLoad.length > 0) this.chunkManager.loadMissingChunks(chunksToLoad);
      
      this.chunkManager.printDebugInfo(p, chunksToLoad, this.worldLoader.loadedRegions);
      this.lastChunk = { x: currentChunkX, y: currentChunkY, z: currentChunkZ };
    }

    this.chunkManager.unloadFarChunks(p);
    this.chunkManager.unloadFarRegions(p);
  }
}
