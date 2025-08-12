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
        const positions = [];
        const normals = [];
        const indices = [];
        let indexOffset = 0;

        // Dati di un cubo con 6 facce separate
        const cubeFaceData = [
            // +X face
            { positions: [1,1,1, 1,1,-1, 1,-1,-1, 1,-1,1], normals: [1,0,0, 1,0,0, 1,0,0, 1,0,0], indices: [0,1,2, 0,2,3] },
            // -X face
            { positions: [-1,1,-1, -1,1,1, -1,-1,1, -1,-1,-1], normals: [-1,0,0, -1,0,0, -1,0,0, -1,0,0], indices: [0,1,2, 0,2,3] },
            // +Y face
            { positions: [-1,1,-1, 1,1,-1, 1,1,1, -1,1,1], normals: [0,1,0, 0,1,0, 0,1,0, 0,1,0], indices: [0,1,2, 0,2,3] },
            // -Y face
            { positions: [-1,-1,1, 1,-1,1, 1,-1,-1, -1,-1,-1], normals: [0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0], indices: [0,1,2, 0,2,3] },
            // +Z face
            { positions: [-1,1,1, 1,1,1, 1,-1,1, -1,-1,1], normals: [0,0,1, 0,0,1, 0,0,1, 0,0,1], indices: [0,1,2, 0,2,3] },
            // -Z face
            { positions: [1,1,-1, -1,1,-1, -1,-1,-1, 1,-1,-1], normals: [0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1], indices: [0,1,2, 0,2,3] }
        ];

        for (let x = 1; x < CHUNK_SIZE_SHELL - 1; x++) {
            for (let y = 1; y < CHUNK_SIZE_SHELL - 1; y++) {
                for (let z = 1; z < CHUNK_SIZE_SHELL - 1; z++) {
                    const voxel = chunkData[x + CHUNK_SIZE_SHELL * (y + CHUNK_SIZE_SHELL * z)];
                    if (voxel !== VOXEL_TYPES.Air && voxel !== VOXEL_TYPES.Cloud) {
                        
                        const neighborOffsets = [
                            [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
                        ];
                        
                        neighborOffsets.forEach((offset, faceIndex) => {
                            const [ox, oy, oz] = offset;
                            const neighborVoxel = chunkData[(x + ox) + CHUNK_SIZE_SHELL * ((y + oy) + CHUNK_SIZE_SHELL * (z + oz))];
                            
                            const neighborIsAir = (v) => v === VOXEL_TYPES.Air || v === VOXEL_TYPES.Cloud;
                            
                            if (neighborIsAir(neighborVoxel)) {
                                const faceData = cubeFaceData[faceIndex];
                                
                                // Aggiungi vertici e normali
                                for (let i = 0; i < faceData.positions.length; i += 3) {
                                    positions.push(chunkWorldX + (x - 1) + faceData.positions[i] * 0.5);
                                    positions.push(chunkWorldY + (y - 1) + faceData.positions[i + 1] * 0.5);
                                    positions.push(chunkWorldZ + (z - 1) + faceData.positions[i + 2] * 0.5);
                                    normals.push(faceData.normals[i], faceData.normals[i + 1], faceData.normals[i + 2]);
                                }
                                
                                // Aggiungi indici e aggiorna l'offset
                                for (let i = 0; i < faceData.indices.length; i++) {
                                    indices.push(indexOffset + faceData.indices[i]);
                                }
                                indexOffset += 4;
                            }
                        });
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