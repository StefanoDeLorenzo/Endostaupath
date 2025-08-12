// worker.js

// Impostazioni del mondo
const CHUNK_SIZE_LOGIC = 30;
const CHUNK_SIZE_WITH_SHELL = 32;
const REGION_CHUNKS = 4;
const REGION_HEIGHT = 4;

/**
 * Funzione per generare la mesh di un chunk.
 * @param {Uint8Array} chunkData - L'array di voxel con guscio (32x32x32).
 * @returns {object} Un oggetto contenente i dati della mesh (posizioni, indici, normali, colori).
 */
function generateMesh(chunkData) {
    const meshData = {
        positions: [],
        indices: [],
        normals: [],
        colors: []
    };
    let indexCount = 0;

    const getVoxel = (x, y, z) => {
        if (x >= 0 && x < CHUNK_SIZE_WITH_SHELL &&
            y >= 0 && y < CHUNK_SIZE_WITH_SHELL &&
            z >= 0 && z < CHUNK_SIZE_WITH_SHELL) {
            return chunkData[x * CHUNK_SIZE_WITH_SHELL * CHUNK_SIZE_WITH_SHELL + y * CHUNK_SIZE_WITH_SHELL + z];
        }
        return 0; // Voxel fuori dai limiti del guscio, trattato come aria
    };

    const isSolid = (x, y, z) => getVoxel(x, y, z) !== 0;

    const voxelColors = [
        null, // 0: Air (unused)
        [0.55, 0.45, 0.35, 1], // 1: Dirt
        [0.4, 0.7, 0.2, 1], // 2: Grass
        [0.5, 0.5, 0.5, 1] // 3: Stone
    ];

    // Iteriamo solo sui voxel interni del chunk (da 1 a 30)
    for (let x = 1; x < CHUNK_SIZE_WITH_SHELL - 1; x++) {
        for (let y = 1; y < CHUNK_SIZE_WITH_SHELL - 1; y++) {
            for (let z = 1; z < CHUNK_SIZE_WITH_SHELL - 1; z++) {
                const currentVoxel = getVoxel(x, y, z);
                if (currentVoxel === 0) continue;

                const color = voxelColors[currentVoxel];
                
                // Le coordinate della mesh devono essere basate sul chunk logico
                const meshX = x - 1;
                const meshY = y - 1;
                const meshZ = z - 1;

                // Face Culling Logic - Controlla i vicini usando il guscio
                // Right Face (+X)
                if (!isSolid(x + 1, y, z)) {
                    meshData.positions.push(meshX + 1, meshY, meshZ, meshX + 1, meshY, meshZ + 1, meshX + 1, meshY + 1, meshZ + 1, meshX + 1, meshY + 1, meshZ);
                    meshData.normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0);
                    meshData.colors.push(...color, ...color, ...color, ...color);
                    meshData.indices.push(indexCount, indexCount + 1, indexCount + 2, indexCount, indexCount + 2, indexCount + 3);
                    indexCount += 4;
                }
                // Left Face (-X)
                if (!isSolid(x - 1, y, z)) {
                    meshData.positions.push(meshX, meshY, meshZ, meshX, meshY + 1, meshZ, meshX, meshY + 1, meshZ + 1, meshX, meshY, meshZ + 1);
                    meshData.normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0);
                    meshData.colors.push(...color, ...color, ...color, ...color);
                    meshData.indices.push(indexCount, indexCount + 1, indexCount + 2, indexCount, indexCount + 2, indexCount + 3);
                    indexCount += 4;
                }
                // Top Face (+Y)
                if (!isSolid(x, y + 1, z)) {
                    meshData.positions.push(meshX, meshY + 1, meshZ, meshX, meshY + 1, meshZ + 1, meshX + 1, meshY + 1, meshZ + 1, meshX + 1, meshY + 1, meshZ);
                    meshData.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
                    meshData.colors.push(...color, ...color, ...color, ...color);
                    meshData.indices.push(indexCount, indexCount + 1, indexCount + 2, indexCount, indexCount + 2, indexCount + 3);
                    indexCount += 4;
                }
                // Bottom Face (-Y)
                if (!isSolid(x, y - 1, z)) {
                    meshData.positions.push(meshX, meshY, meshZ, meshX + 1, meshY, meshZ, meshX + 1, meshY, meshZ + 1, meshX, meshY, meshZ + 1);
                    meshData.normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0);
                    meshData.colors.push(...color, ...color, ...color, ...color);
                    meshData.indices.push(indexCount, indexCount + 1, indexCount + 2, indexCount, indexCount + 2, indexCount + 3);
                    indexCount += 4;
                }
                // Front Face (+Z)
                if (!isSolid(x, y, z + 1)) {
                    meshData.positions.push(meshX, meshY, meshZ + 1, meshX, meshY + 1, meshZ + 1, meshX + 1, meshY + 1, meshZ + 1, meshX + 1, meshY, meshZ + 1);
                    meshData.normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
                    meshData.colors.push(...color, ...color, ...color, ...color);
                    meshData.indices.push(indexCount, indexCount + 1, indexCount + 2, indexCount, indexCount + 2, indexCount + 3);
                    indexCount += 4;
                }
                // Back Face (-Z)
                if (!isSolid(x, y, z - 1)) {
                    meshData.positions.push(meshX, meshY, meshZ, meshX + 1, meshY, meshZ, meshX + 1, meshY + 1, meshZ, meshX, meshY + 1, meshZ);
                    meshData.normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1);
                    meshData.colors.push(...color, ...color, ...color, ...color);
                    meshData.indices.push(indexCount, indexCount + 1, indexCount + 2, indexCount, indexCount + 2, indexCount + 3);
                    indexCount += 4;
                }
            }
        }
    }
    return meshData;
}

self.onmessage = (event) => {
    const { type, regionBuffers, chunkX, chunkY, chunkZ, chunkLocalX, chunkLocalY, chunkLocalZ } = event.data;

    if (type === 'loadChunkFromRegion') {
        const regionKey = `r.${Math.floor(chunkX / REGION_CHUNKS)}.${Math.floor(chunkY / REGION_HEIGHT)}.${Math.floor(chunkZ / REGION_CHUNKS)}.voxl`;
        const regionBuffer = regionBuffers[regionKey];

        if (regionBuffer) {
            const dataView = new DataView(regionBuffer);
            const headerSize = 12; 
            const totalChunks = dataView.getUint32(8, true);

            const indexTableOffset = headerSize;
            
            const regionChunkIndex = chunkLocalX * REGION_HEIGHT * REGION_CHUNKS + chunkLocalY * REGION_CHUNKS + chunkLocalZ;
            
            if (regionChunkIndex >= 0 && regionChunkIndex < totalChunks) {
                const offset = dataView.getUint32(indexTableOffset + regionChunkIndex * 8, true);
                const length = dataView.getUint32(indexTableOffset + regionChunkIndex * 8 + 4, true);

                const chunkBuffer = regionBuffer.slice(offset, offset + length);
                const chunkData = new Uint8Array(chunkBuffer);
                
                const meshData = generateMesh(chunkData);

                self.postMessage({
                    type: 'chunkGenerated',
                    chunkX: chunkX,
                    chunkY: chunkY,
                    chunkZ: chunkZ,
                    meshData: meshData,
                });
            }
        }
    }
};