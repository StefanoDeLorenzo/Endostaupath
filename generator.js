// generator.js - Worker per la generazione di regioni Voxel

// ============================================================================
// # IMPLEMENTAZIONE DEL RUMORE PERLIN 3D
// Basata su una versione standard di Ken Perlin del 2002.
// ============================================================================
function perlinNoise3D(x, y, z) {
    const p = new Uint8Array(512);
    const permutation = [151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 175, 87, 86, 232, 199, 158, 58, 77, 24, 226, 207, 170, 182, 179, 5, 236, 123, 110, 150, 134, 100, 16, 93, 249, 112, 192, 169, 211, 218, 128, 76, 139, 115, 127, 245, 196, 49, 176, 185, 19, 147, 238, 156, 46, 143, 205, 107, 253, 178, 13, 242, 198, 11, 101, 145, 14, 18, 184, 194, 204, 173, 212, 152, 17, 18, 239, 210, 129, 172, 197, 45, 78, 16, 188, 104, 19, 181, 244, 209, 184, 96, 22, 216, 73, 126, 10, 215, 200, 162, 105, 114, 246, 209, 138, 12, 47, 118, 24, 165, 208, 22, 98, 166, 15, 102, 235, 221, 16, 233, 11, 198, 48, 149, 102, 60, 250, 173, 228, 14, 212, 213, 221, 203, 167, 235, 195, 219, 171, 15, 168, 158, 204, 135, 16, 70, 113, 187, 164, 119, 180, 251, 80, 14, 60, 159, 177, 224, 225, 230, 239, 216, 24, 111, 218, 202, 90, 89, 74, 169, 186, 206, 61, 91, 15, 217, 132, 21, 10, 12, 159, 168, 79, 167, 12, 143, 205, 193, 214, 112, 43, 25, 243, 85, 246, 163, 145, 154, 97, 113, 144, 171, 122, 191, 162, 248, 201, 220, 4, 189, 222, 247, 65, 133, 254, 195, 20, 231, 183, 174, 15
    ];
    for (let i = 0; i < 256; i++) {
        p[i] = p[i + 256] = permutation[i];
    }
    
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(t, a, b) { return a + t * (b - a); }
    function grad(hash, x, y, z) {
        let h = hash & 15;
        let u = h < 8 ? x : y;
        let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    
    let X = Math.floor(x) & 255;
    let Y = Math.floor(y) & 255;
    let Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    let u = fade(x);
    let v = fade(y);
    let w = fade(z);
    let A = p[X] + Y;
    let B = p[X + 1] + Y;
    let A0 = p[A] + Z;
    let A1 = p[A + 1] + Z;
    let B0 = p[B] + Z;
    let B1 = p[B + 1] + Z;
    return lerp(w, lerp(v, lerp(u, grad(p[A0], x, y, z), grad(p[B0], x - 1, y, z)),
            lerp(u, grad(p[A1], x, y - 1, z), grad(p[B1], x - 1, y - 1, z))),
        lerp(v, lerp(u, grad(p[A0 + 1], x, y, z - 1), grad(p[B0 + 1], x - 1, y, z - 1)),
            lerp(u, grad(p[A1 + 1], x, y - 1, z - 1), grad(p[B1 + 1], x - 1, y - 1, z - 1))));
}

// ============================================================================
// # COSTANTI E CLASSI
// ============================================================================

const SKY_LEVEL = 50; 
const GROUND_LEVEL = 10;
const VoxelTypes = {
    Air: 0,
    Dirt: 1,
    Cloud: 2,
    Grass: 3,
    Rock: 4
};


class VoxelChunk {
    constructor(logicalChunkData) {
        this.logicalChunkData = logicalChunkData; 
    }

    getVoxel(x, y, z) {
        if (x >= 0 && x < 30 && y >= 0 && y < 30 && z >= 0 && z < 30) {
            return this.logicalChunkData[x + 30 * (y + 30 * z)];
        }
        return VoxelTypes.Air;
    }
}

class WorldGenerator {
    constructor() {
        this.worldCache = new Map();
    }

    generateLogicalChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
        const chunkData = new Uint8Array(30 * 30 * 30);
        const scale = 0.05; 
    
        for (let x = 0; x < 30; x++) {
            for (let y = 0; y < 30; y++) {
                for (let z = 0; z < 30; z++) {
                    const globalX = regionX * (4 * 30) + chunkX * 30 + x;
                    const globalY = regionY * (4 * 30) + chunkY * 30 + y;
                    const globalZ = regionZ * (4 * 30) + chunkZ * 30 + z;

                    let voxelType = VoxelTypes.Air; 
                    
                    if (globalY > SKY_LEVEL) {
                        const cloudNoise = perlinNoise3D(globalX * 0.02, globalY * 0.02, globalZ * 0.02);
                        if (cloudNoise > 0.4) {
                            voxelType = VoxelTypes.Cloud; 
                        } else {
                            voxelType = VoxelTypes.Air;
                        }
                    } else {
                        const surfaceNoise = perlinNoise3D(globalX * scale, 0, globalZ * scale);
                        const surfaceHeight = GROUND_LEVEL + Math.floor(Math.abs(surfaceNoise) * 20);
                        
                        if (globalY < surfaceHeight) {
                            if (globalY === surfaceHeight - 1) {
                                voxelType = VoxelTypes.Grass;
                            } else {
                                voxelType = VoxelTypes.Dirt;
                            }
                        }

                        if (globalY < GROUND_LEVEL) {
                            const caveNoise = perlinNoise3D(globalX * 0.1, globalY * 0.1, globalZ * 0.1);
                            if (caveNoise > 0.3) {
                                voxelType = VoxelTypes.Rock;
                            } else {
                                voxelType = VoxelTypes.Air;
                            }
                        }
                    }
                    
                    const index = x + 30 * (y + 30 * z);
                    chunkData[index] = voxelType;
                }
            }
        }
        return new VoxelChunk(chunkData);
    }
    
    getOrCreateChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
        const key = `${regionX}-${regionY}-${regionZ}-${chunkX}-${chunkY}-${chunkZ}`;
        if (this.worldCache.has(key)) {
            return this.worldCache.get(key);
        }
        const chunk = this.generateLogicalChunk(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
        this.worldCache.set(key, chunk);
        return chunk;
    }
    
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
                        let neighborRegionX = regionX, neighborRegionY = regionY, neighborRegionZ = regionZ;
                        let neighborChunkX = chunkX, neighborChunkY = chunkY, neighborChunkZ = chunkZ;
                        let neighborInnerX = innerX, neighborInnerY = innerY, neighborInnerZ = innerZ;

                        if (innerX < 0) {
                            neighborChunkX--;
                            neighborInnerX = 29;
                        } else if (innerX >= 30) {
                            neighborChunkX++;
                            neighborInnerX = 0;
                        }

                        if (innerY < 0) {
                            neighborChunkY--;
                            neighborInnerY = 29;
                        } else if (innerY >= 30) {
                            neighborChunkY++;
                            neighborInnerY = 0;
                        }

                        if (innerZ < 0) {
                            neighborChunkZ--;
                            neighborInnerZ = 29;
                        } else if (innerZ >= 30) {
                            neighborChunkZ++;
                            neighborInnerZ = 0;
                        }

                        if (neighborChunkX < 0) {
                            neighborRegionX--;
                            neighborChunkX = 3;
                        } else if (neighborChunkX >= 4) {
                            neighborRegionX++;
                            neighborChunkX = 0;
                        }

                        if (neighborChunkY < 0) {
                            neighborRegionY--;
                            neighborChunkY = 3;
                        } else if (neighborChunkY >= 4) {
                            neighborRegionY++;
                            neighborChunkY = 0;
                        }

                        if (neighborChunkZ < 0) {
                            neighborRegionZ--;
                            neighborChunkZ = 3;
                        } else if (neighborChunkZ >= 4) {
                            neighborRegionZ++;
                            neighborChunkZ = 0;
                        }

                        const neighborChunk = this.getOrCreateChunk(neighborRegionX, neighborRegionY, neighborRegionZ, neighborChunkX, neighborChunkY, neighborChunkZ);
                        voxelData = neighborChunk.getVoxel(neighborInnerX, neighborInnerY, neighborInnerZ);
                    }
                    
                    const index = x + 32 * (y + 32 * z);
                    chunkWithShell[index] = voxelData;
                }
            }
        }
        return chunkWithShell;
    }

    writeRegionFile(regionX, regionY, regionZ) {
        const chunksWithShell = [];
        for (let chunkX = 0; chunkX < 4; chunkX++) {
            for (let chunkY = 0; chunkY < 4; chunkY++) {
                for (let chunkZ = 0; chunkZ < 4; chunkZ++) {
                    chunksWithShell.push(this.createChunkWithShell(regionX, regionY, regionZ, chunkX, chunkY, chunkZ));
                }
            }
        }
        
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

// ============================================================================
// # LOGICA DEL WORKER
// ============================================================================
const generator = new WorldGenerator();

self.onmessage = async (event) => {
    console.log("Worker: Messaggio ricevuto dal thread principale.", event.data);
    const { type, regionX, regionY, regionZ } = event.data;

    if (type === 'generateRegion') {
        try {
            console.log(`Worker: Avvio generazione per la regione (${regionX}, ${regionY}, ${regionZ})...`);
            
            // Popola la cache per la regione corrente e i suoi vicini
            const fromX = regionX - 1, toX = regionX + 1;
            const fromY = regionY - 1, toY = regionY + 1;
            const fromZ = regionZ - 1, toZ = regionZ + 1;
            
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
            
            console.log(`Worker: Generazione completata per la regione (${regionX}, ${regionY}, ${regionZ}). Invio i dati al thread principale.`);
            
            self.postMessage({
                type: 'regionGenerated',
                regionX: regionX,
                regionY: regionY,
                regionZ: regionZ,
                buffer: buffer
            }, [buffer]);

        } catch (error) {
            console.error(`Worker: Errore critico durante la generazione della regione (${regionX}, ${regionY}, ${regionZ}).`, error);
            self.postMessage({
                type: 'error',
                regionX: regionX,
                regionY: regionY,
                regionZ: regionZ,
                message: error.message
            });
        }
    }
};