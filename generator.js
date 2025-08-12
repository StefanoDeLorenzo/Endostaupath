// generator.js

const CHUNK_SIZE = 32;
const REGION_CHUNKS = 4;
const WORLD_HEIGHT = 16; // Altezza del mondo in chunk

const perlin = require('perlin-noise');
const fs = require('fs');

/**
 * @class RegionGenerator
 * @description Genera i dati di un mondo procedurale e li salva in file .voxl.
 */
class RegionGenerator {
    constructor() {
        // La cache per i chunk generați, per riutilizzarli durante la creazione del guscio
        this.chunkCache = new Map();
        this.noise = perlin.generatePerlinNoise(WORLD_HEIGHT * CHUNK_SIZE, WORLD_HEIGHT * CHUNK_SIZE);
    }

    /**
     * Ottiene o genera i dati dei voxel per un dato chunk.
     * @param {number} chunkX - Coordinata X del chunk.
     * @param {number} chunkY - Coordinata Y del chunk.
     * @param {number} chunkZ - Coordinata Z del chunk.
     * @returns {Uint8Array} I dati dei voxel.
     */
    getChunkData(chunkX, chunkY, chunkZ) {
        const chunkKey = `${chunkX},${chunkY},${chunkZ}`;
        if (this.chunkCache.has(chunkKey)) {
            return this.chunkCache.get(chunkKey);
        }

        const voxelData = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
        const noiseScale = 0.05;

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const globalX = chunkX * CHUNK_SIZE + x;
                const globalZ = chunkZ * CHUNK_SIZE + z;
                
                const noiseIndex = (globalX + globalZ * WORLD_HEIGHT * CHUNK_SIZE) % (this.noise.length - 1);
                const noiseValue = this.noise[noiseIndex];
                
                const surfaceHeight = Math.floor(noiseValue * CHUNK_SIZE * WORLD_HEIGHT);

                for (let y = 0; y < CHUNK_SIZE; y++) {
                    const globalY = chunkY * CHUNK_SIZE + y;
                    const index = x * CHUNK_SIZE * CHUNK_SIZE + y * CHUNK_SIZE + z;

                    if (globalY < surfaceHeight) {
                        voxelData[index] = (globalY < surfaceHeight - 3) ? 3 : 1; // 3: Pietra, 1: Terra
                    } else if (globalY === surfaceHeight) {
                        voxelData[index] = 2; // 2: Erba
                    } else {
                        voxelData[index] = 0; // 0: Aria
                    }
                }
            }
        }

        this.chunkCache.set(chunkKey, voxelData);
        return voxelData;
    }

    /**
     * Scrive un chunk in un buffer con il suo guscio.
     * @param {Buffer} chunkBuffer - Il buffer in cui scrivere il chunk.
     * @param {number} chunkX - Coordinata X del chunk.
     * @param {number} chunkY - Coordinata Y del chunk.
     * @param {number} chunkZ - Coordinata Z del chunk.
     * @returns {Buffer} Il buffer del chunk con guscio.
     */
    writeChunkWithShell(chunkX, chunkY, chunkZ) {
        // La nuova dimensione del chunk con il guscio di un blocco su ogni lato
        const SHELL_CHUNK_SIZE = CHUNK_SIZE + 2;
        const chunkData = new Uint8Array(SHELL_CHUNK_SIZE * SHELL_CHUNK_SIZE * SHELL_CHUNK_SIZE);
        
        // Copia i dati del chunk principale
        const mainChunkData = this.getChunkData(chunkX, chunkY, chunkZ);
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let y = 0; y < CHUNK_SIZE; y++) {
                for (let z = 0; z < CHUNK_SIZE; z++) {
                    const mainIndex = x * CHUNK_SIZE * CHUNK_SIZE + y * CHUNK_SIZE + z;
                    const shellIndex = (x + 1) * SHELL_CHUNK_SIZE * SHELL_CHUNK_SIZE + (y + 1) * SHELL_CHUNK_SIZE + (z + 1);
                    chunkData[shellIndex] = mainChunkData[mainIndex];
                }
            }
        }

        // Popola il guscio con i dati dei chunk adiacenti
        const neighborOffsets = [
            [-1, 0, 0], [1, 0, 0],
            [0, -1, 0], [0, 1, 0],
            [0, 0, -1], [0, 0, 1]
        ];
        
        for (let x = 0; x < SHELL_CHUNK_SIZE; x++) {
            for (let y = 0; y < SHELL_CHUNK_SIZE; y++) {
                for (let z = 0; z < SHELL_CHUNK_SIZE; z++) {
                    // Ignora i voxel interni, che sono già stati copiati
                    if (x > 0 && x < SHELL_CHUNK_SIZE - 1 &&
                        y > 0 && y < SHELL_CHUNK_SIZE - 1 &&
                        z > 0 && z < SHELL_CHUNK_SIZE - 1) {
                        continue;
                    }

                    const shellIndex = x * SHELL_CHUNK_SIZE * SHELL_CHUNK_SIZE + y * SHELL_CHUNK_SIZE + z;

                    // Calcola le coordinate globali del voxel nel guscio
                    const globalX = (chunkX * CHUNK_SIZE) + x - 1;
                    const globalY = (chunkY * CHUNK_SIZE) + y - 1;
                    const globalZ = (chunkZ * CHUNK_SIZE) + z - 1;
                    
                    // Controlla se il voxel è all'interno del guscio
                    const isShellVoxel = (x === 0 || x === SHELL_CHUNK_SIZE - 1 ||
                                            y === 0 || y === SHELL_CHUNK_SIZE - 1 ||
                                            z === 0 || z === SHELL_CHUNK_SIZE - 1);
                    
                    if(isShellVoxel){
                        // Ottieni il tipo di voxel del chunk adiacente
                        // Nota: questo richiederà al generatore di accedere ai dati dei chunk vicini
                        const neighborChunkX = Math.floor(globalX / CHUNK_SIZE);
                        const neighborChunkY = Math.floor(globalY / CHUNK_SIZE);
                        const neighborChunkZ = Math.floor(globalZ / CHUNK_SIZE);
                        
                        const neighborVoxelLocalX = (globalX % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
                        const neighborVoxelLocalY = (globalY % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
                        const neighborVoxelLocalZ = (globalZ % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
                        
                        const neighborData = this.getChunkData(neighborChunkX, neighborChunkY, neighborChunkZ);
                        const neighborVoxelIndex = neighborVoxelLocalX * CHUNK_SIZE * CHUNK_SIZE + neighborVoxelLocalY * CHUNK_SIZE + neighborVoxelLocalZ;
                        chunkData[shellIndex] = neighborData[neighborVoxelIndex];
                    }
                }
            }
        }

        return Buffer.from(chunkData);
    }
    
    /**
     * Scrive un intero file di regione, includendo tutti i chunk.
     * @param {number} regionX - Coordinata X della regione.
     * @param {number} regionY - Coordinata Y della regione.
     * @param {number} regionZ - Coordinata Z della regione.
     */
    writeRegion(regionX, regionY, regionZ) {
        const regionFile = `r.${regionX}.${regionY}.${regionZ}.voxl`;
        const filePath = `./regions/${regionFile}`;
        
        console.log(`Generazione regione: ${regionX}, ${regionY}, ${regionZ}`);
        
        const chunkBuffers = [];
        const indexTable = [];
        let offset = 0;

        for (let chunkLocalX = 0; chunkLocalX < REGION_CHUNKS; chunkLocalX++) {
            for (let chunkLocalY = 0; chunkLocalY < WORLD_HEIGHT; chunkLocalY++) { // 👈 Ciclo sull'asse Y per supportare il 3D
                for (let chunkLocalZ = 0; chunkLocalZ < REGION_CHUNKS; chunkLocalZ++) {
                    const chunkX = regionX * REGION_CHUNKS + chunkLocalX;
                    const chunkY = regionY * WORLD_HEIGHT + chunkLocalY; // 👈 Ho modificato il calcolo
                    const chunkZ = regionZ * REGION_CHUNKS + chunkLocalZ;
                    
                    const chunkDataBuffer = this.writeChunkWithShell(chunkX, chunkY, chunkZ);
                    
                    chunkBuffers.push(chunkDataBuffer);
                    indexTable.push(offset, chunkDataBuffer.length);
                    offset += chunkDataBuffer.length;
                }
            }
        }
        
        const header = Buffer.alloc(4 + 1 + 3 + 4);
        header.write('VOXL', 0);
        header.writeUInt8(1, 4); // Versione
        header.writeUInt8(CHUNK_SIZE, 5); // Dimensione chunk X
        header.writeUInt8(CHUNK_SIZE, 6); // Dimensione chunk Y
        header.writeUInt8(CHUNK_SIZE, 7); // Dimensione chunk Z
        header.writeUInt32LE(REGION_CHUNKS * REGION_CHUNKS * WORLD_HEIGHT, 8); // Numero totale di chunk
        
        const indexTableBuffer = Buffer.alloc(indexTable.length * 4);
        indexTable.forEach((value, i) => indexTableBuffer.writeUInt32LE(value, i * 4));

        const combinedBuffer = Buffer.concat([header, indexTableBuffer, ...chunkBuffers]);
        fs.writeFileSync(filePath, combinedBuffer);
    }

    generateWorld(numRegions = 2, worldHeight = 1) {
        if (!fs.existsSync('./regions')) {
            fs.mkdirSync('./regions');
        }
        
        for (let x = -numRegions; x <= numRegions; x++) {
            for (let y = 0; y < worldHeight; y++) {
                for (let z = -numRegions; z <= numRegions; z++) {
                    this.writeRegion(x, y, z);
                }
            }
        }
    }
}

const generator = new RegionGenerator();
generator.generateWorld(2, 1);