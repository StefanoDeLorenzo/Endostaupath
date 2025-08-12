// worker.js - Worker per la generazione della mesh da un singolo chunk

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
// # CONFIGURAZIONE ALGORITMO DI MESHING
// ============================================================================
const MESHING_ALGORITHM = 'VOXEL'; // 'VOXEL' O 'GREEDY'

const VoxelColors = {
    [VOXEL_TYPES.Dirt]: [0.55, 0.45, 0.25, 1.0], // Marrone
    [VOXEL_TYPES.Grass]: [0.2, 0.6, 0.2, 1.0], // Verde
    [VOXEL_TYPES.Rock]: [0.4, 0.4, 0.4, 1.0], // Grigio
    [VOXEL_TYPES.Cloud]: [1.0, 1.0, 1.0, 0.8], // Bianco traslucido
    [VOXEL_TYPES.Air]: [0.0, 0.0, 0.0, 0.0] // Trasparente
};

const cubeFaceData = [
    { positions: [1,1,1, 1,1,-1, 1,-1,-1, 1,-1,1], normals: [1,0,0, 1,0,0, 1,0,0, 1,0,0], indices: [0,1,2, 0,2,3] },
    { positions: [-1,1,-1, -1,1,1, -1,-1,1, -1,-1,-1], normals: [-1,0,0, -1,0,0, -1,0,0, -1,0,0], indices: [0,1,2, 0,2,3] },
    { positions: [-1,1,-1, 1,1,-1, 1,1,1, -1,1,1], normals: [0,1,0, 0,1,0, 0,1,0, 0,1,0], indices: [0,1,2, 0,2,3] },
    { positions: [-1,-1,1, 1,-1,1, 1,-1,-1, -1,-1,-1], normals: [0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0], indices: [0,1,2, 0,2,3] },
    { positions: [-1,1,1, 1,1,1, 1,-1,1, -1,-1,1], normals: [0,0,1, 0,0,1, 0,0,1, 0,0,1], indices: [0,1,2, 0,2,3] },
    { positions: [1,1,-1, -1,1,-1, -1,-1,-1, 1,-1,-1], normals: [0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1], indices: [0,1,2, 0,2,3] }
];

function generateMeshForChunk_Voxel(chunkData) {
    const opaqueMeshData = { positions: [], normals: [], indices: [], colors: [], indexOffset: 0 };
    const transparentMeshData = { positions: [], normals: [], indices: [], colors: [], indexOffset: 0 };

    for (let x = 1; x < CHUNK_SIZE_SHELL - 1; x++) {
        for (let y = 1; y < CHUNK_SIZE_SHELL - 1; y++) {
            for (let z = 1; z < CHUNK_SIZE_SHELL - 1; z++) {
                const voxel = chunkData[x + CHUNK_SIZE_SHELL * (y + CHUNK_SIZE_SHELL * z)];
                
                if (voxel === VOXEL_TYPES.Air) {
                    continue;
                }

                const isVoxelTransparent = (voxel === VOXEL_TYPES.Cloud);
                const currentMeshData = isVoxelTransparent ? transparentMeshData : opaqueMeshData;

                const neighborOffsets = [
                    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
                ];

                neighborOffsets.forEach((offset, faceIndex) => {
                    const [ox, oy, oz] = offset;
                    const neighborVoxel = chunkData[(x + ox) + CHUNK_SIZE_SHELL * ((y + oy) + CHUNK_SIZE_SHELL * (z + oz))];
                    const isNeighborTransparent = (neighborVoxel === VOXEL_TYPES.Cloud);
                    const isNeighborAir = (neighborVoxel === VOXEL_TYPES.Air);

                    const shouldDrawFace = (isVoxelTransparent && isNeighborAir) || (!isVoxelTransparent && (isNeighborAir || isNeighborTransparent));

                    if (shouldDrawFace) {
                        const faceData = cubeFaceData[faceIndex];
                        const voxelColor = VoxelColors[voxel];

                        for (let i = 0; i < faceData.positions.length; i += 3) {
                            currentMeshData.positions.push((x - 1) + faceData.positions[i] * 0.5);
                            currentMeshData.positions.push((y - 1) + faceData.positions[i + 1] * 0.5);
                            currentMeshData.positions.push((z - 1) + faceData.positions[i + 2] * 0.5);
                            currentMeshData.normals.push(faceData.normals[i], faceData.normals[i + 1], faceData.normals[i + 2]);
                            currentMeshData.colors.push(...voxelColor);
                        }
                        
                        for (let i = 0; i < faceData.indices.length; i++) {
                            currentMeshData.indices.push(currentMeshData.indexOffset + faceData.indices[i]);
                        }
                        currentMeshData.indexOffset += 4;
                    }
                });
            }
        }
    }
    
    return {
        opaque: {
            positions: new Float32Array(opaqueMeshData.positions),
            normals: new Float32Array(opaqueMeshData.normals),
            indices: new Uint16Array(opaqueMeshData.indices),
            colors: new Float32Array(opaqueMeshData.colors)
        },
        transparent: {
            positions: new Float32Array(transparentMeshData.positions),
            normals: new Float32Array(transparentMeshData.normals),
            indices: new Uint16Array(transparentMeshData.indices),
            colors: new Float32Array(transparentMeshData.colors)
        }
    };
}

function generateMeshForChunk_Greedy(chunkData) {
    const opaqueMeshData = { positions: [], normals: [], indices: [], colors: [], indexOffset: 0 };
    const transparentMeshData = { positions: [], normals: [], indices: [], colors: [], indexOffset: 0 };
    
    const dims = [CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE];
    const mask = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    
    for (let axis = 0; axis < 3; axis++) {
        const u = (axis + 1) % 3;
        const v = (axis + 2) % 3;
        const x = [0, 0, 0];
        const q = [0, 0, 0];
        q[axis] = 1;

        // Passaggio 1: Genera le mesh opache
        for (x[axis] = -1; x[axis] < CHUNK_SIZE; x[axis]++) {
            let n = 0;
            for (x[v] = 0; x[v] < CHUNK_SIZE; x[v]++) {
                for (x[u] = 0; x[u] < CHUNK_SIZE; x[u]++) {
                    const i1 = (x[0] + 1) + CHUNK_SIZE_SHELL * ((x[1] + 1) + CHUNK_SIZE_SHELL * (x[2] + 1));
                    const i2 = (x[0] + q[0] + 1) + CHUNK_SIZE_SHELL * ((x[1] + q[1] + 1) + CHUNK_SIZE_SHELL * (x[2] + q[2] + 1));
                    
                    const voxel1 = (x[axis] >= 0) ? chunkData[i1] : 0;
                    const voxel2 = (x[axis] < CHUNK_SIZE) ? chunkData[i2] : 0;
                    
                    const isVoxel1Solid = (voxel1 !== VOXEL_TYPES.Air && voxel1 !== VOXEL_TYPES.Cloud);
                    const isVoxel2Solid = (voxel2 !== VOXEL_TYPES.Air && voxel2 !== VOXEL_TYPES.Cloud);
                    
                    if (isVoxel1Solid && !isVoxel2Solid) {
                         mask[n] = voxel1;
                    } else if (!isVoxel1Solid && isVoxel2Solid) {
                        mask[n] = -voxel2;
                    } else {
                        mask[n] = 0;
                    }
                    n++;
                }
            }

            n = 0;
            for (x[v] = 0; x[v] < CHUNK_SIZE; x[v]++) {
                for (x[u] = 0; x[u] < CHUNK_SIZE; x[u]++) {
                    if (mask[n] !== 0) {
                        const voxelValue = mask[n];
                        
                        let w = 1;
                        for (; x[u] + w < CHUNK_SIZE && mask[n + w] === voxelValue; w++) {}
                        
                        let h = 1;
                        let done = false;
                        for (; x[v] + h < CHUNK_SIZE; h++) {
                            for (let i = 0; i < w; i++) {
                                if (mask[n + i + h * CHUNK_SIZE] !== voxelValue) {
                                    done = true;
                                    break;
                                }
                            }
                            if (done) break;
                        }
                        
                        const sign = voxelValue > 0 ? 1 : -1;
                        const normal = [0, 0, 0];
                        normal[axis] = sign;
                        const color = VoxelColors[Math.abs(voxelValue)];
                        
                        const a = [0, 0, 0], b = [0, 0, 0];
                        a[u] = w;
                        b[v] = h;
                        
                        const v1 = [x[0], x[1], x[2]];
                        const v2 = [x[0] + a[0], x[1] + a[1], x[2] + a[2]];
                        const v3 = [x[0] + b[0], x[1] + b[1], x[2] + b[2]];
                        const v4 = [x[0] + a[0] + b[0], x[1] + a[1] + b[1], x[2] + a[2] + b[2]];

                        if (sign > 0) {
                            opaqueMeshData.positions.push(v1[0], v1[1], v1[2]);
                            opaqueMeshData.positions.push(v3[0], v3[1], v3[2]);
                            opaqueMeshData.positions.push(v4[0], v4[1], v4[2]);
                            opaqueMeshData.positions.push(v2[0], v2[1], v2[2]);
                        } else {
                            opaqueMeshData.positions.push(v1[0], v1[1], v1[2]);
                            opaqueMeshData.positions.push(v2[0], v2[1], v2[2]);
                            opaqueMeshData.positions.push(v4[0], v4[1], v4[2]);
                            opaqueMeshData.positions.push(v3[0], v3[1], v3[2]);
                        }

                        for(let i = 0; i < 4; i++) {
                            opaqueMeshData.normals.push(...normal);
                            opaqueMeshData.colors.push(...color);
                        }
                        
                        opaqueMeshData.indices.push(opaqueMeshData.indexOffset, opaqueMeshData.indexOffset + 1, opaqueMeshData.indexOffset + 2);
                        opaqueMeshData.indices.push(opaqueMeshData.indexOffset, opaqueMeshData.indexOffset + 2, opaqueMeshData.indexOffset + 3);
                        opaqueMeshData.indexOffset += 4;
                        
                        for (let aa = 0; aa < h; aa++) {
                            for (let bb = 0; bb < w; bb++) {
                                mask[n + bb + aa * CHUNK_SIZE] = 0;
                            }
                        }
                    }
                    n++;
                }
            }
        }
    }
    
    // Passaggio 2: Genera le mesh trasparenti (nuvole)
    for (let axis = 0; axis < 3; axis++) {
        const u = (axis + 1) % 3;
        const v = (axis + 2) % 3;
        const x = [0, 0, 0];
        const q = [0, 0, 0];
        q[axis] = 1;
        
        for (x[axis] = -1; x[axis] < CHUNK_SIZE; x[axis]++) {
            let n = 0;
            for (x[v] = 0; x[v] < CHUNK_SIZE; x[v]++) {
                for (x[u] = 0; x[u] < CHUNK_SIZE; x[u]++) {
                    const i1 = (x[0] + 1) + CHUNK_SIZE_SHELL * ((x[1] + 1) + CHUNK_SIZE_SHELL * (x[2] + 1));
                    const i2 = (x[0] + q[0] + 1) + CHUNK_SIZE_SHELL * ((x[1] + q[1] + 1) + CHUNK_SIZE_SHELL * (x[2] + q[2] + 1));
                    
                    const voxel1 = (x[axis] >= 0) ? chunkData[i1] : 0;
                    const voxel2 = (x[axis] < CHUNK_SIZE) ? chunkData[i2] : 0;
                    
                    const isVoxel1Cloud = voxel1 === VOXEL_TYPES.Cloud;
                    const isVoxel2Air = voxel2 === VOXEL_TYPES.Air;

                    if (isVoxel1Cloud && isVoxel2Air) {
                         mask[n] = voxel1;
                    } else if (!isVoxel1Cloud && !isVoxel2Air) {
                         mask[n] = 0;
                    } else {
                         mask[n] = -voxel2;
                    }
                    
                    n++;
                }
            }
            
            n = 0;
            for (x[v] = 0; x[v] < CHUNK_SIZE; x[v]++) {
                for (x[u] = 0; x[u] < CHUNK_SIZE; x[u]++) {
                    if (mask[n] !== 0) {
                        const voxelValue = mask[n];
                        
                        let w = 1;
                        for (; x[u] + w < CHUNK_SIZE && mask[n + w] === voxelValue; w++) {}
                        
                        let h = 1;
                        let done = false;
                        for (; x[v] + h < CHUNK_SIZE; h++) {
                            for (let i = 0; i < w; i++) {
                                if (mask[n + i + h * CHUNK_SIZE] !== voxelValue) {
                                    done = true;
                                    break;
                                }
                            }
                            if (done) break;
                        }
                        
                        const sign = voxelValue > 0 ? 1 : -1;
                        const normal = [0, 0, 0];
                        normal[axis] = sign;
                        const color = VoxelColors[Math.abs(voxelValue)];
                        
                        const a = [0, 0, 0], b = [0, 0, 0];
                        a[u] = w;
                        b[v] = h;
                        
                        const v1 = [x[0], x[1], x[2]];
                        const v2 = [x[0] + a[0], x[1] + a[1], x[2] + a[2]];
                        const v3 = [x[0] + b[0], x[1] + b[1], x[2] + b[2]];
                        const v4 = [x[0] + a[0] + b[0], x[1] + a[1] + b[1], x[2] + a[2] + b[2]];

                        if (sign > 0) {
                            transparentMeshData.positions.push(v1[0], v1[1], v1[2]);
                            transparentMeshData.positions.push(v3[0], v3[1], v3[2]);
                            transparentMeshData.positions.push(v4[0], v4[1], v4[2]);
                            transparentMeshData.positions.push(v2[0], v2[1], v2[2]);
                        } else {
                            transparentMeshData.positions.push(v1[0], v1[1], v1[2]);
                            transparentMeshData.positions.push(v2[0], v2[1], v2[2]);
                            transparentMeshData.positions.push(v4[0], v4[1], v4[2]);
                            transparentMeshData.positions.push(v3[0], v3[1], v3[2]);
                        }

                        for(let i = 0; i < 4; i++) {
                            transparentMeshData.normals.push(...normal);
                            transparentMeshData.colors.push(...color);
                        }
                        
                        transparentMeshData.indices.push(transparentMeshData.indexOffset, transparentMeshData.indexOffset + 1, transparentMeshData.indexOffset + 2);
                        transparentMeshData.indices.push(transparentMeshData.indexOffset, transparentMeshData.indexOffset + 2, transparentMeshData.indexOffset + 3);
                        transparentMeshData.indexOffset += 4;
                        
                        for (let aa = 0; aa < h; aa++) {
                            for (let bb = 0; bb < w; bb++) {
                                mask[n + bb + aa * CHUNK_SIZE] = 0;
                            }
                        }
                    }
                    n++;
                }
            }
        }
    }
    
    return {
        opaque: {
            positions: new Float32Array(opaqueMeshData.positions),
            normals: new Float32Array(opaqueMeshData.normals),
            indices: new Uint16Array(opaqueMeshData.indices),
            colors: new Float32Array(opaqueMeshData.colors)
        },
        transparent: {
            positions: new Float32Array(transparentMeshData.positions),
            normals: new Float32Array(transparentMeshData.normals),
            indices: new Uint16Array(transparentMeshData.indices),
            colors: new Float32Array(transparentMeshData.colors)
        }
    };
}

// # Placeholder per Marching Cubes (implementazione futura)
/*
function generateMeshForChunk_MarchingCubes(chunkData) {
    // Logica di Marching Cubes qui
    // ...
    return {
        positions: new Float32Array(),
        normals: new Float32Array(),
        indices: new Uint16Array(),
        colors: new Float32Array()
    };
}
*/

// ============================================================================
// # LOGICA DEL WORKER
// Sceglie la funzione di meshing in base alla costante MESHING_ALGORITHM
// ============================================================================
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
                    meshData = generateMeshForChunk_Greedy(new Uint8Array(chunkData));
                    break;
                // case 'MARCHING_CUBES':
                //     mesh = generateMeshForChunk_MarchingCubes(new Uint8Array(chunkData));
                //     break;
                default:
                    console.error('Algoritmo di meshing non valido.');
                    return;
            }
            
            console.log(`Worker: Generazione mesh completata. Invio i dati al thread principale.`);
            
            self.postMessage({
                type: 'meshGenerated',
                chunkX, chunkY, chunkZ,
                opaqueMeshData: meshData.opaque,
                transparentMeshData: meshData.transparent
            }, [
                meshData.opaque.positions.buffer, meshData.opaque.normals.buffer, meshData.opaque.indices.buffer, meshData.opaque.colors.buffer,
                meshData.transparent.positions.buffer, meshData.transparent.normals.buffer, meshData.transparent.indices.buffer, meshData.transparent.colors.buffer
            ]);

        } catch (error) {
            console.error(`Worker: Errore critico durante la generazione della mesh del chunk.`, error);
            self.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
};