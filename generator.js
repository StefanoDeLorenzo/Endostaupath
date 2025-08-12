// Il Worker
// Includi l'implementazione del perlinNoise3D e la definizione della classe
// (per brevità, assumiamo che siano già in questo file).

const generator = new WorldGenerator();


class WorldGenerator {
    constructor() {
        this.worldCache = new Map(); // Usiamo una Map per la cache
    }

    // Genera e memorizza un singolo chunk logico (30x30x30)
    generateLogicalChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
        // Questa è la tua logica di generazione del terreno stratificato
        // che abbiamo definito in precedenza.
        const chunkData = new Uint8Array(30 * 30 * 30);
        // ... (qui va la logica del Perlin Noise per riempire chunkData) ...
        // Calcola le coordinate globali
        const globalRegionX = regionX * 120; // 4 chunks * 30
        const globalRegionY = regionY * 120;
        const globalRegionZ = regionZ * 120;

        const globalChunkX = chunkX * 30;
        const globalChunkY = chunkY * 30;
        const globalChunkZ = chunkZ * 30;

        for (let x = 0; x < 30; x++) {
            for (let y = 0; y < 30; y++) {
                for (let z = 0; z < 30; z++) {
                    const globalX = globalRegionX + globalChunkX + x;
                    const globalY = globalRegionY + globalChunkY + y;
                    const globalZ = globalRegionZ + globalChunkZ + z;
                    
                    let voxelType = VoxelTypes.Air; 
                    
                    if (globalY > 50) {
                        const cloudNoise = perlinNoise3D(globalX * 0.02, globalY * 0.02, globalZ * 0.02);
                        if (cloudNoise > 0.4) {
                            voxelType = VoxelTypes.Cloud;
                        }
                    } else {
                        const surfaceNoise = perlinNoise3D(globalX * 0.05, 0, globalZ * 0.05);
                        const surfaceHeight = 10 + Math.floor(Math.abs(surfaceNoise) * 20);
                        
                        if (globalY < surfaceHeight) {
                            if (globalY === surfaceHeight - 1) {
                                voxelType = VoxelTypes.Grass;
                            } else {
                                voxelType = VoxelTypes.Dirt;
                            }
                        }

                        if (globalY < 10) {
                            const caveNoise = perlinNoise3D(globalX * 0.1, globalY * 0.1, globalZ * 0.1);
                            if (caveNoise > 0.3) {
                                voxelType = VoxelTypes.Rock;
                            } else {
                                voxelType = VoxelTypes.Air;
                            }
                        }
                    }
                    chunkData[x + 30 * (y + 30 * z)] = voxelType;
                }
            }
        }
        
        return new VoxelChunk(chunkData);
    }
    
    // Ottiene un chunk dalla cache o lo genera se non esiste
    getOrCreateChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
        const key = `${regionX}-${regionY}-${regionZ}-${chunkX}-${chunkY}-${chunkZ}`;
        if (this.worldCache.has(key)) {
            return this.worldCache.get(key);
        }
        const chunk = this.generateLogicalChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
        this.worldCache.set(key, chunk);
        return chunk;
    }
    
    // Funzione che crea un chunk con il guscio
    createChunkWithShell(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
        const chunkWithShell = new Uint8Array(32 * 32 * 32);

        for (let x = 0; x < 32; x++) {
            for (let y = 0; y < 32; y++) {
                for (let z = 0; z < 32; z++) {
                    const innerX = x - 1;
                    const innerY = y - 1;
                    const innerZ = z - 1;
                    
                    let voxelData = VoxelTypes.Air;
                    
                    if (innerX >= 0 && innerX < 30 && innerY >= 0 && innerY < 30 && innerZ >= 0 && innerZ < 30) {
                        const chunk = this.getOrCreateChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
                        voxelData = chunk.getVoxel(innerX, innerY, innerZ);
                    } else {
                        // Trova le coordinate del chunk adiacente
                        let neighborRegionX = regionX, neighborRegionY = regionY, neighborRegionZ = regionZ;
                        let neighborChunkX = chunkX, neighborChunkY = chunkY, neighborChunkZ = chunkZ;
                        let neighborInnerX = innerX, neighborInnerY = innerY, neighborInnerZ = innerZ;

                        if (innerX < 0) { neighborChunkX--; neighborInnerX = 29; } else if (innerX >= 30) { neighborChunkX++; neighborInnerX = 0; }
                        if (neighborChunkX < 0) { neighborRegionX--; neighborChunkX = 3; } else if (neighborChunkX >= 4) { neighborRegionX++; neighborChunkX = 0; }
                        
                        if (innerY < 0) { neighborChunkY--; neighborInnerY = 29; } else if (innerY >= 30) { neighborChunkY++; neighborInnerY = 0; }
                        if (neighborChunkY < 0) { neighborRegionY--; neighborChunkY = 3; } else if (neighborChunkY >= 4) { neighborRegionY++; neighborChunkY = 0; }
                        
                        if (innerZ < 0) { neighborChunkZ--; neighborInnerZ = 29; } else if (innerZ >= 30) { neighborChunkZ++; neighborInnerZ = 0; }
                        if (neighborChunkZ < 0) { neighborRegionZ--; neighborChunkZ = 3; } else if (neighborChunkZ >= 4) { neighborRegionZ++; neighborChunkZ = 0; }
                        
                        const neighborChunk = this.getOrCreateChunk(neighborRegionX, neighborRegionY, neighborRegionZ, neighborChunkX, neighborChunkY, neighborChunkZ);
                        voxelData = neighborChunk.getVoxel(neighborInnerX, neighborInnerY, neighborInnerZ);
                    }
                    
                    chunkWithShell[x + 32 * (y + 32 * z)] = voxelData;
                }
            }
        }
        return chunkWithShell;
    }

    // Scrive l'intero file della regione
    writeRegionFile(regionX, regionY, regionZ) {
        // ... (stessa logica di scrittura del file binario, ma che ora usa i metodi della classe)
        const chunksWithShell = [];
        for (let chunkX = 0; chunkX < 4; chunkX++) {
            for (let chunkY = 0; chunkY < 4; chunkY++) {
                for (let chunkZ = 0; chunkZ < 4; chunkZ++) {
                    chunksWithShell.push(this.createChunkWithShell(regionX, regionY, regionZ, chunkX, chunkY, chunkZ));
                }
            }
        }
        
        // ... Logica di calcolo di header, index table, ecc.
        const totalChunks = 64;
        const chunkSizeInBytes = 32768; 
        const headerSize = 11;
        const indexTableSize = totalChunks * 5;
        const chunkDataOffset = headerSize + indexTableSize;
        
        const indexTable = new Uint8Array(indexTableSize);
        let currentOffset = chunkDataOffset;
        for (let i = 0; i < totalChunks; i++) {
            indexTable[i * 5 + 0] = (currentOffset >> 16) & 0xFF;
            indexTable[i * 5 + 1] = (currentOffset >> 8) & 0xFF;
            indexTable[i * 5 + 2] = currentOffset & 0xFF;
            indexTable[i * 5 + 3] = (chunkSizeInBytes >> 8) & 0xFF;
            indexTable[i * 5 + 4] = chunkSizeInBytes & 0xFF;
            currentOffset += chunkSizeInBytes;
        }

        const totalFileSize = chunkDataOffset + totalChunks * chunkSizeInBytes;
        const finalBuffer = new ArrayBuffer(totalFileSize);
        const view = new DataView(finalBuffer);

        view.setUint32(0, 0x564F584C, false); 
        view.setUint8(4, 1);
        view.setUint8(5, 32); view.setUint8(6, 32); view.setUint8(7, 32); 
        view.setUint8(8, 0); view.setUint8(9, 0); view.setUint8(10, 64);
        
        new Uint8Array(finalBuffer, headerSize, indexTableSize).set(indexTable);

        let dataOffset = chunkDataOffset;
        for (const chunk of chunksWithShell) {
            new Uint8Array(finalBuffer, dataOffset, chunkSizeInBytes).set(chunk);
            dataOffset += chunkSizeInBytes;
        }

        return finalBuffer;
    }
}

class VoxelChunk {
    constructor(logicalChunkData) {
        // I dati del chunk interno (30x30x30)
        this.logicalChunkData = logicalChunkData; 
    }

    // Metodo per ottenere un singolo voxel dal chunk logico
    getVoxel(x, y, z) {
        if (x >= 0 && x < 30 && y >= 0 && y < 30 && z >= 0 && z < 30) {
            return this.logicalChunkData[x + 30 * (y + 30 * z)];
        }
        return VoxelTypes.Air;
    }
}

self.onmessage = async (event) => {
    const { type, regionX, regionY, regionZ } = event.data;

    if (type === 'generateRegion') {
        const fromX = regionX - 1, toX = regionX + 1;
        const fromY = regionY - 1, toY = regionY + 1;
        const fromZ = regionZ - 1, toZ = regionZ + 1;
        
        // Popola la cache per la regione corrente e i suoi vicini
        for (let x = fromX; x <= toX; x++) {
            for (let y = fromY; y <= toY; y++) {
                for (let z = fromZ; z <= toZ; z++) {
                    for(let cx = 0; cx < 4; cx++) {
                        for(let cy = 0; cy < 4; cy++) {
                            for(let cz = 0; cz < 4; cz++) {
                                generator.getOrCreateChunk(x, y, z, cx, cy, cz);
                            }
                        }
                    }
                }
            }
        }

        const buffer = generator.writeRegionFile(regionX, regionY, regionZ);
        
        self.postMessage({
            type: 'regionGenerated',
            regionX: regionX,
            regionY: regionY,
            regionZ: regionZ,
            buffer: buffer
        }, [buffer]);
    }
};