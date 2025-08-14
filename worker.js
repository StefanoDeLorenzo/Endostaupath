// worker.js - Worker per la generazione della mesh da un singolo chunk

const CHUNK_SIZE = 30;
const CHUNK_SIZE_SHELL = 32;
const VOXEL_TYPES = {
    Air: 0,
    Dirt: 1,
    Cloud: 2,
    Grass: 3,
    Rock: 4,
    Lava: 5,
    Water: 6,
    Acid: 7
};

// ============================================================================
// # CONFIGURAZIONE ALGORITMO DI MESHING
// ============================================================================
const MESHING_ALGORITHM = 'VOXEL'; // O 'GREEDY'

const VoxelColors = {
    [VOXEL_TYPES.Dirt]: [0.55, 0.45, 0.25, 1.0], // Marrone
    [VOXEL_TYPES.Grass]: [0.2, 0.6, 0.2, 1.0], // Verde
    [VOXEL_TYPES.Rock]: [0.4, 0.4, 0.4, 1.0], // Grigio
    [VOXEL_TYPES.Cloud]: [1.0, 1.0, 1.0, 0.4], // Bianco traslucido
    [VOXEL_TYPES.Lava]: [0.9, 0.3, 0.0, 0.7],  // Lava semi-opaca
    [VOXEL_TYPES.Water]: [0.2, 0.5, 1.0, 0.5], // Acqua trasparente
    [VOXEL_TYPES.Acid]: [0.6, 1.0, 0.2, 0.6],  // Acido
    [VOXEL_TYPES.Air]: [0.0, 0.0, 0.0, 0.0] // Trasparente
};

const VoxelOpacity = {
    [VOXEL_TYPES.Air]: 'transparent',
    [VOXEL_TYPES.Cloud]: 'transparent',
    [VOXEL_TYPES.Lava]: 'transparent',
    [VOXEL_TYPES.Water]: 'transparent',
    [VOXEL_TYPES.Acid]: 'transparent',
    [VOXEL_TYPES.Dirt]: 'opaque',
    [VOXEL_TYPES.Grass]: 'opaque',
    [VOXEL_TYPES.Rock]: 'opaque'
};

const cubeFaceData = [
    { positions: [1,1,1, 1,1,-1, 1,-1,-1, 1,-1,1], normals: [1,0,0, 1,0,0, 1,0,0, 1,0,0], indices: [0,1,2, 0,2,3], isBackFace: false },
    { positions: [-1,1,-1, -1,1,1, -1,-1,1, -1,-1,-1], normals: [-1,0,0, -1,0,0, -1,0,0, -1,0,0], indices: [0,1,2, 0,2,3], isBackFace: false },
    { positions: [-1,1,-1, 1,1,-1, 1,1,1, -1,1,1], normals: [0,1,0, 0,1,0, 0,1,0, 0,1,0], indices: [0,1,2, 0,2,3], isBackFace: false },
    { positions: [-1,-1,1, 1,-1,1, 1,-1,-1, -1,-1,-1], normals: [0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0], indices: [0,1,2, 0,2,3], isBackFace: false },
    { positions: [-1,1,1, 1,1,1, 1,-1,1, -1,-1,1], normals: [0,0,1, 0,0,1, 0,0,1, 0,0,1], indices: [0,1,2, 0,2,3], isBackFace: false },
    { positions: [1,1,-1, -1,1,-1, -1,-1,-1, 1,-1,-1], normals: [0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1], indices: [0,1,2, 0,2,3], isBackFace: false }
];

// # Funzione di Meshing Voxel per Voxel
function generateMeshForChunk_Voxel(chunkData) {
    const meshDataByVoxelType = {};

    function getMeshData(voxelType) {
        if (!meshDataByVoxelType[voxelType]) {
            meshDataByVoxelType[voxelType] = {
                positions: [],
                normals: [],
                indices: [],
                colors: [],
                indexOffset: 0
            };
        }
        return meshDataByVoxelType[voxelType];
    }
    
    for (let x = 1; x < CHUNK_SIZE_SHELL - 1; x++) {
        for (let y = 1; y < CHUNK_SIZE_SHELL - 1; y++) {
            for (let z = 1; z < CHUNK_SIZE_SHELL - 1; z++) {
                const voxel = chunkData[x + CHUNK_SIZE_SHELL * (y + CHUNK_SIZE_SHELL * z)];
                
                if (voxel === VOXEL_TYPES.Air) {
                    continue;
                }

                const currentMeshData = getMeshData(voxel);

                const neighborOffsets = [
                    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
                ];

                neighborOffsets.forEach((offset, faceIndex) => {
                    const [ox, oy, oz] = offset;
                    const neighborVoxel = chunkData[(x + ox) + CHUNK_SIZE_SHELL * ((y + oy) + CHUNK_SIZE_SHELL * (z + oz))];
                    const isNeighborTransparent = (VoxelOpacity[neighborVoxel] === 'transparent');
                    const isVoxelTransparent = (VoxelOpacity[voxel] === 'transparent');

                    const shouldDrawFace = (isVoxelTransparent && neighborVoxel === VOXEL_TYPES.Air) || (!isVoxelTransparent && (neighborVoxel === VOXEL_TYPES.Air || isNeighborTransparent));

                    if (shouldDrawFace) {
                        const faceData = cubeFaceData[faceIndex];
                        const voxelColor = VoxelColors[voxel];

                        for (let i = 0; i < faceData.positions.length; i += 3) {
                            currentMeshData.positions.push((x - 1) + faceData.positions[i] * 0.5);
                            currentMeshData.positions.push((y - 1) + faceData.positions[i + 1] * 0.5);
                            currentMeshData.positions.push((z - 1) + faceData.positions[i + 2] * 0.5);
                        }
                        
                        // Assicurati che le normali siano rivolte verso l'esterno
                        if (faceData.isBackFace) {
                            for (let i = 0; i < faceData.normals.length; i += 3) {
                                currentMeshData.normals.push(-faceData.normals[i], -faceData.normals[i + 1], -faceData.normals[i + 2]);
                            }
                        } else {
                            currentMeshData.normals.push(...faceData.normals);
                        }

                        // Inverti gli indici se necessario per la normale
                        if (faceData.isBackFace) {
                            currentMeshData.indices.push(currentMeshData.indexOffset + 0);
                            currentMeshData.indices.push(currentMeshData.indexOffset + 2);
                            currentMeshData.indices.push(currentMeshData.indexOffset + 1);
                            currentMeshData.indices.push(currentMeshData.indexOffset + 0);
                            currentMeshData.indices.push(currentMeshData.indexOffset + 3);
                            currentMeshData.indices.push(currentMeshData.indexOffset + 2);
                        } else {
                            currentMeshData.indices.push(currentMeshData.indexOffset + 0);
                            currentMeshData.indices.push(currentMeshData.indexOffset + 1);
                            currentMeshData.indices.push(currentMeshData.indexOffset + 2);
                            currentMeshData.indices.push(currentMeshData.indexOffset + 0);
                            currentMeshData.indices.push(currentMeshData.indexOffset + 2);
                            currentMeshData.indices.push(currentMeshData.indexOffset + 3);
                        }

                        currentMeshData.indexOffset += 4;
                        
                        for (let i = 0; i < 4; i++) {
                             currentMeshData.colors.push(...voxelColor);
                        }
                    }
                });
            }
        }
    }
    
    const finalMeshData = {};
    for (const voxelType in meshDataByVoxelType) {
        finalMeshData[voxelType] = {
            positions: new Float32Array(meshDataByVoxelType[voxelType].positions),
            normals: new Float32Array(meshDataByVoxelType[voxelType].normals),
            indices: new Uint16Array(meshDataByVoxelType[voxelType].indices),
            colors: new Float32Array(meshDataByVoxelType[voxelType].colors)
        };
    }

    return finalMeshData;
}

self.onmessage = async (event) => {
    const { type, chunkData, chunkX, chunkY, chunkZ } = event.data;

    if (type === 'generateMeshFromChunk') {
        try {
            console.log(`Worker: Avvio generazione mesh per il chunk (${chunkX}, ${chunkY}, ${chunkZ})...`);

            let meshData;
            switch (MESHING_ALGORITHM) {
                case 'VOXEL':
                    meshData = generateMeshForChunk_Voxel(new Uint8Array(chunkData));
                    break;
                case 'GREEDY':
                    console.error('L\'algoritmo GREEDY non supporta ancora la separazione per materiale.');
                    return;
                default:
                    console.error('Algoritmo di meshing non valido.');
                    return;
            }
            
            console.log(`Worker: Generazione mesh completata. Invio i dati al thread principale.`);
            
            const transferableObjects = [];
            for (const voxelType in meshData) {
                transferableObjects.push(
                    meshData[voxelType].positions.buffer,
                    meshData[voxelType].normals.buffer,
                    meshData[voxelType].indices.buffer,
                    meshData[voxelType].colors.buffer
                );
            }

            self.postMessage({
                type: 'meshGenerated',
                chunkX, chunkY, chunkZ,
                meshDataByVoxelType: meshData,
                voxelOpacity: VoxelOpacity
            }, transferableObjects);

        } catch (error) {
            console.error(`Worker: Errore critico durante la generazione della mesh del chunk.`, error);
            self.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
};