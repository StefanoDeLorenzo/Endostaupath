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

// Mappa i tipi di voxel a colori in formato RGBA (0-1)
const VoxelColors = {
    [VOXEL_TYPES.Dirt]: [0.55, 0.45, 0.25, 1.0], // Marrone
    [VOXEL_TYPES.Grass]: [0.2, 0.6, 0.2, 1.0], // Verde
    [VOXEL_TYPES.Rock]: [0.4, 0.4, 0.4, 1.0], // Grigio
    [VOXEL_TYPES.Cloud]: [1.0, 1.0, 1.0, 0.8], // Bianco traslucido
    [VOXEL_TYPES.Air]: [0.0, 0.0, 0.0, 0.0] // Trasparente
};

// ============================================================================
// # METODO PER LA GENERAZIONE DELLA MESH
// Questa funzione ora genera anche un array di colori dei vertici.
// ============================================================================
function generateMeshForChunk(chunkData) {
    if (chunkData.length === 0) {
        return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint16Array(), colors: new Float32Array() };
    }

    const positions = [];
    const normals = [];
    const indices = [];
    const colors = []; // <- Nuovo array per i colori
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
                            
                            // Aggiungi vertici, normali e colori
                            const voxelColor = VoxelColors[voxel];
                            for (let i = 0; i < faceData.positions.length; i += 3) {
                                // CORREZIONE POSIZIONAMENTO VERTICI:
                                // Posizioni relative all'origine del chunk
                                positions.push((x - 1) + faceData.positions[i] * 0.5);
                                positions.push((y - 1) + faceData.positions[i + 1] * 0.5);
                                positions.push((z - 1) + faceData.positions[i + 2] * 0.5);
                                normals.push(faceData.normals[i], faceData.normals[i + 1], faceData.normals[i + 2]);
                                colors.push(...voxelColor); // <- Aggiunto il colore
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
        indices: new Uint16Array(indices),
        colors: new Float32Array(colors) // <- Invia il nuovo array
    };
}


// ============================================================================
// # LOGICA DEL WORKER
// ============================================================================
self.onmessage = async (event) => {
    const { type, chunkData, chunkX, chunkY, chunkZ } = event.data;

    if (type === 'generateMeshFromChunk') {
        try {
            console.log(`Worker: Avvio generazione mesh per il chunk (${chunkX}, ${chunkY}, ${chunkZ})...`);

            const mesh = generateMeshForChunk(new Uint8Array(chunkData));
            
            console.log(`Worker: Generazione mesh completata. Invio i dati al thread principale.`);
            
            // Invia i dati della mesh al thread principale
            self.postMessage({
                type: 'meshGenerated',
                chunkX, chunkY, chunkZ,
                meshData: mesh
            }, [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer, mesh.colors.buffer]);

        } catch (error) {
            console.error(`Worker: Errore critico durante la generazione della mesh del chunk.`, error);
            self.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
};