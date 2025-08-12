// worker.js - Worker per la generazione della mesh da un singolo chunk
// Questo worker riceve i dati di un chunk dal thread principale.

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
// # METODO PER LA GENERAZIONE DELLA MESH
// Questa funzione rimane la stessa, ma ora riceve direttamente i dati del chunk.
// ============================================================================
function generateMeshForChunk(chunkData, chunkWorldX, chunkWorldY, chunkWorldZ) {
    if (chunkData.length === 0) {
        return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint16Array() };
    }

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
// Ora il worker si aspetta di ricevere il buffer di un singolo chunk
// ============================================================================
self.onmessage = async (event) => {
    const { type, chunkData, chunkX, chunkY, chunkZ } = event.data;

    if (type === 'generateMeshFromChunk') {
        try {
            console.log(`Worker: Avvio generazione mesh per il chunk (${chunkX}, ${chunkY}, ${chunkZ})...`);

            const chunkWorldX = chunkX * CHUNK_SIZE;
            const chunkWorldY = chunkY * CHUNK_SIZE;
            const chunkWorldZ = chunkZ * CHUNK_SIZE;

            // `chunkData` è già un ArrayBuffer, lo convertiamo in Uint8Array
            const mesh = generateMeshForChunk(new Uint8Array(chunkData), chunkWorldX, chunkWorldY, chunkWorldZ);
            
            console.log(`Worker: Generazione mesh completata. Invio i dati al thread principale.`);
            
            // Invia i dati della mesh al thread principale
            self.postMessage({
                type: 'meshGenerated',
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