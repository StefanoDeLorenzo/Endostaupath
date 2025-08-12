// runtime_worker.js - Worker per la generazione della mesh da un file .voxl

// ============================================================================
// # COSTANTI E CLASSI
// Queste sono le stesse definizioni usate in generator.js, necessarie per
// interpretare correttamente i dati del file .voxl.
// ============================================================================

const CHUNK_SIZE = 30;
const CHUNK_SIZE_SHELL = 32;
const VOXEL_TYPES = {
    Air: 0,
    Dirt: 1,
    Cloud: 2,
    Grass: 3,
    Rock: 4
};


// ============================================================================
// # METODO PER ESTRARRE I DATI DEL CHUNK DA UN BUFFER DI REGIONE
// ============================================================================
function getChunkDataFromRegionBuffer(buffer, chunkX, chunkY, chunkZ) {
    const dataView = new DataView(buffer);

    // Leggi l'header del file .voxl
    // Salta i primi 11 byte che contengono intestazione e numero di chunk
    const headerSize = 11;
    const indexTableSize = 64 * 5;
    const chunkDataOffset = headerSize + indexTableSize;
    const chunkSizeInBytes = CHUNK_SIZE_SHELL * CHUNK_SIZE_SHELL * CHUNK_SIZE_SHELL;

    // Calcola l'indice del chunk
    const chunkIndex = chunkX + 4 * (chunkY + 4 * chunkZ);

    // Leggi l'offset e la dimensione del chunk dalla tabella degli indici
    const chunkFileOffset = dataView.getUint32(headerSize + chunkIndex * 5, false);

    if (chunkFileOffset === 0) {
        // Il chunk non è presente nel file (offset 0), restituisci un array vuoto
        return new Uint8Array(0);
    }
    
    // Crea un nuovo ArrayBuffer per il chunk
    const chunkBuffer = buffer.slice(chunkFileOffset, chunkFileOffset + chunkSizeInBytes);
    return new Uint8Array(chunkBuffer);
}


// ============================================================================
// # METODO PER LA GENERAZIONE DELLA MESH
// Questa funzione è identica a quella che abbiamo visto prima, ma ora è qui.
// ============================================================================
function generateMeshForChunk(chunkData, chunkWorldX, chunkWorldY, chunkWorldZ) {
    if (chunkData.length === 0) {
        return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint16Array() };
    }

    const positions = [];
    const normals = [];
    const indices = [];

    const cubePositions = [
        1, 1, 1, 1, 1, -1, 1, -1, -1, 1, -1, 1,
        -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1,
        -1, 1, -1, 1, 1, -1, 1, 1, 1, -1, 1, 1,
        -1, -1, 1, 1, -1, 1, 1, -1, -1, -1, -1, -1,
        -1, 1, 1, 1, 1, 1, 1, -1, 1, -1, -1, 1,
        1, 1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1,
    ];
    const cubeNormals = [
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    ];
    const cubeIndices = [
        0, 1, 2, 0, 2, 3,
        4, 5, 6, 4, 6, 7,
        8, 9, 10, 8, 10, 11,
        12, 13, 14, 12, 14, 15,
        16, 17, 18, 16, 18, 19,
        20, 21, 22, 20, 22, 23,
    ];
    
    let indexOffset = 0;
    
    for (let x = 1; x < CHUNK_SIZE_SHELL - 1; x++) {
        for (let y = 1; y < CHUNK_SIZE_SHELL - 1; y++) {
            for (let z = 1; z < CHUNK_SIZE_SHELL - 1; z++) {
                const voxel = chunkData[x + CHUNK_SIZE_SHELL * (y + CHUNK_SIZE_SHELL * z)];
                if (voxel !== VOXEL_TYPES.Air && voxel !== VOXEL_TYPES.Cloud) {
                    
                    const neighbors = [
                        chunkData[(x + 1) + CHUNK_SIZE_SHELL * (y + CHUNK_SIZE_SHELL * z)],
                        chunkData[(x - 1) + CHUNK_SIZE_SHELL * (y + CHUNK_SIZE_SHELL * z)],
                        chunkData[x + CHUNK_SIZE_SHELL * ((y + 1) + CHUNK_SIZE_SHELL * z)],
                        chunkData[x + CHUNK_SIZE_SHELL * ((y - 1) + CHUNK_SIZE_SHELL * z)],
                        chunkData[x + CHUNK_SIZE_SHELL * (y + CHUNK_SIZE_SHELL * (z + 1))],
                        chunkData[x + CHUNK_SIZE_SHELL * (y + CHUNK_SIZE_SHELL * (z - 1))],
                    ];
                    
                    const neighborIsAir = (v) => v === VOXEL_TYPES.Air || v === VOXEL_TYPES.Cloud;

                    if (neighborIsAir(neighbors[0])) { // +X
                        for (let i = 0; i < 4; i++) {
                            positions.push(chunkWorldX + (x - 1) + cubePositions[0*12 + i*3] * 0.5);
                            positions.push(chunkWorldY + (y - 1) + cubePositions[0*12 + i*3 + 1] * 0.5);
                            positions.push(chunkWorldZ + (z - 1) + cubePositions[0*12 + i*3 + 2] * 0.5);
                            normals.push(cubeNormals[0*12 + i*3], cubeNormals[0*12 + i*3 + 1], cubeNormals[0*12 + i*3 + 2]);
                        }
                        indices.push(indexOffset + cubeIndices[0], indexOffset + cubeIndices[1], indexOffset + cubeIndices[2]);
                        indices.push(indexOffset + cubeIndices[3], indexOffset + cubeIndices[4], indexOffset + cubeIndices[5]);
                        indexOffset += 4;
                    }
                    if (neighborIsAir(neighbors[1])) { // -X
                        for (let i = 0; i < 4; i++) {
                            positions.push(chunkWorldX + (x - 1) + cubePositions[1*12 + i*3] * 0.5);
                            positions.push(chunkWorldY + (y - 1) + cubePositions[1*12 + i*3 + 1] * 0.5);
                            positions.push(chunkWorldZ + (z - 1) + cubePositions[1*12 + i*3 + 2] * 0.5);
                            normals.push(cubeNormals[1*12 + i*3], cubeNormals[1*12 + i*3 + 1], cubeNormals[1*12 + i*3 + 2]);
                        }
                        indices.push(indexOffset + cubeIndices[6], indexOffset + cubeIndices[7], indexOffset + cubeIndices[8]);
                        indices.push(indexOffset + cubeIndices[9], indexOffset + cubeIndices[10], indexOffset + cubeIndices[11]);
                        indexOffset += 4;
                    }
                    if (neighborIsAir(neighbors[2])) { // +Y
                        for (let i = 0; i < 4; i++) {
                            positions.push(chunkWorldX + (x - 1) + cubePositions[2*12 + i*3] * 0.5);
                            positions.push(chunkWorldY + (y - 1) + cubePositions[2*12 + i*3 + 1] * 0.5);
                            positions.push(chunkWorldZ + (z - 1) + cubePositions[2*12 + i*3 + 2] * 0.5);
                            normals.push(cubeNormals[2*12 + i*3], cubeNormals[2*12 + i*3 + 1], cubeNormals[2*12 + i*3 + 2]);
                        }
                        indices.push(indexOffset + cubeIndices[12], indexOffset + cubeIndices[13], indexOffset + cubeIndices[14]);
                        indices.push(indexOffset + cubeIndices[15], indexOffset + cubeIndices[16], indexOffset + cubeIndices[17]);
                        indexOffset += 4;
                    }
                    if (neighborIsAir(neighbors[3])) { // -Y
                        for (let i = 0; i < 4; i++) {
                            positions.push(chunkWorldX + (x - 1) + cubePositions[3*12 + i*3] * 0.5);
                            positions.push(chunkWorldY + (y - 1) + cubePositions[3*12 + i*3 + 1] * 0.5);
                            positions.push(chunkWorldZ + (z - 1) + cubePositions[3*12 + i*3 + 2] * 0.5);
                            normals.push(cubeNormals[3*12 + i*3], cubeNormals[3*12 + i*3 + 1], cubeNormals[3*12 + i*3 + 2]);
                        }
                        indices.push(indexOffset + cubeIndices[18], indexOffset + cubeIndices[19], indexOffset + cubeIndices[20]);
                        indices.push(indexOffset + cubeIndices[21], indexOffset + cubeIndices[22], indexOffset + cubeIndices[23]);
                        indexOffset += 4;
                    }
                    if (neighborIsAir(neighbors[4])) { // +Z
                        for (let i = 0; i < 4; i++) {
                            positions.push(chunkWorldX + (x - 1) + cubePositions[4*12 + i*3] * 0.5);
                            positions.push(chunkWorldY + (y - 1) + cubePositions[4*12 + i*3 + 1] * 0.5);
                            positions.push(chunkWorldZ + (z - 1) + cubePositions[4*12 + i*3 + 2] * 0.5);
                            normals.push(cubeNormals[4*12 + i*3], cubeNormals[4*12 + i*3 + 1], cubeNormals[4*12 + i*3 + 2]);
                        }
                        indices.push(indexOffset + cubeIndices[24], indexOffset + cubeIndices[25], indexOffset + cubeIndices[26]);
                        indices.push(indexOffset + cubeIndices[27], indexOffset + cubeIndices[28], indexOffset + cubeIndices[29]);
                        indexOffset += 4;
                    }
                    if (neighborIsAir(neighbors[5])) { // -Z
                        for (let i = 0; i < 4; i++) {
                            positions.push(chunkWorldX + (x - 1) + cubePositions[5*12 + i*3] * 0.5);
                            positions.push(chunkWorldY + (y - 1) + cubePositions[5*12 + i*3 + 1] * 0.5);
                            positions.push(chunkWorldZ + (z - 1) + cubePositions[5*12 + i*3 + 2] * 0.5);
                            normals.push(cubeNormals[5*12 + i*3], cubeNormals[5*12 + i*3 + 1], cubeNormals[5*12 + i*3 + 2]);
                        }
                        indices.push(indexOffset + cubeIndices[30], indexOffset + cubeIndices[31], indexOffset + cubeIndices[32]);
                        indices.push(indexOffset + cubeIndices[33], indexOffset + cubeIndices[34], indexOffset + cubeIndices[35]);
                        indexOffset += 4;
                    }
                }
            }
        }
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices)
    };
}


// ============================================================================
// # LOGICA DEL WORKER
// ============================================================================
self.onmessage = async (event) => {
    const { type, regionBuffer, regionX, regionY, regionZ, chunkX, chunkY, chunkZ } = event.data;

    if (type === 'generateMeshFromChunk') {
        try {
            console.log(`Worker: Avvio generazione mesh per il chunk (${chunkX}, ${chunkY}, ${chunkZ}) della regione (${regionX}, ${regionY}, ${regionZ})...`);

            const chunkData = getChunkDataFromRegionBuffer(regionBuffer, chunkX, chunkY, chunkZ);
            
            const chunkWorldX = regionX * (4 * CHUNK_SIZE) + chunkX * CHUNK_SIZE;
            const chunkWorldY = regionY * (4 * CHUNK_SIZE) + chunkY * CHUNK_SIZE;
            const chunkWorldZ = regionZ * (4 * CHUNK_SIZE) + chunkZ * CHUNK_SIZE;

            const mesh = generateMeshForChunk(chunkData, chunkWorldX, chunkWorldY, chunkWorldZ);
            
            console.log(`Worker: Generazione mesh completata. Invio i dati al thread principale.`);
            
            // Invia i dati della mesh al thread principale
            self.postMessage({
                type: 'meshGenerated',
                regionX, regionY, regionZ,
                chunkX, chunkY, chunkZ,
                meshData: mesh
            });

        } catch (error) {
            console.error(`Worker: Errore critico durante la generazione della mesh del chunk.`, error);
            self.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
};