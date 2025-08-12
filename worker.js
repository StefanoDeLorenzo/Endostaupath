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
// Scegli l'algoritmo da usare.
// Valori possibili: 'VOXEL', 'GREEDY'
// ============================================================================
const MESHING_ALGORITHM = 'GREEDY';

// Mappa i tipi di voxel a colori in formato RGBA (0-1)
const VoxelColors = {
    [VOXEL_TYPES.Dirt]: [0.55, 0.45, 0.25, 1.0], // Marrone
    [VOXEL_TYPES.Grass]: [0.2, 0.6, 0.2, 1.0], // Verde
    [VOXEL_TYPES.Rock]: [0.4, 0.4, 0.4, 1.0], // Grigio
    [VOXEL_TYPES.Cloud]: [1.0, 1.0, 1.0, 0.8], // Bianco traslucido
    [VOXEL_TYPES.Air]: [0.0, 0.0, 0.0, 0.0] // Trasparente
};

// # Funzione di Meshing Originale (Voxel per Voxel)
// Mantenuta per riferimento
function generateMeshForChunk_Voxel(chunkData) {
    if (chunkData.length === 0) {
        return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint16Array(), colors: new Float32Array() };
    }

    const positions = [];
    const normals = [];
    const indices = [];
    const colors = [];
    let indexOffset = 0;

    const cubeFaceData = [
        { positions: [1,1,1, 1,1,-1, 1,-1,-1, 1,-1,1], normals: [1,0,0, 1,0,0, 1,0,0, 1,0,0], indices: [0,1,2, 0,2,3] },
        { positions: [-1,1,-1, -1,1,1, -1,-1,1, -1,-1,-1], normals: [-1,0,0, -1,0,0, -1,0,0, -1,0,0], indices: [0,1,2, 0,2,3] },
        { positions: [-1,1,-1, 1,1,-1, 1,1,1, -1,1,1], normals: [0,1,0, 0,1,0, 0,1,0, 0,1,0], indices: [0,1,2, 0,2,3] },
        { positions: [-1,-1,1, 1,-1,1, 1,-1,-1, -1,-1,-1], normals: [0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0], indices: [0,1,2, 0,2,3] },
        { positions: [-1,1,1, 1,1,1, 1,-1,1, -1,-1,1], normals: [0,0,1, 0,0,1, 0,0,1, 0,0,1], indices: [0,1,2, 0,2,3] },
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
                            
                            const voxelColor = VoxelColors[voxel];
                            for (let i = 0; i < faceData.positions.length; i += 3) {
                                positions.push((x - 1) + faceData.positions[i] * 0.5);
                                positions.push((y - 1) + faceData.positions[i + 1] * 0.5);
                                positions.push((z - 1) + faceData.positions[i + 2] * 0.5);
                                normals.push(faceData.normals[i], faceData.normals[i + 1], faceData.normals[i + 2]);
                                colors.push(...voxelColor);
                            }
                            
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
        colors: new Float32Array(colors)
    };
}

// # Funzione di Meshing Ottimizzata (Greedy Meshing)
function generateMeshForChunk_Greedy(chunkData) {
    if (chunkData.length === 0) {
        return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint16Array(), colors: new Float32Array() };
    }

    const positions = [];
    const normals = [];
    const indices = [];
    const colors = [];
    let indexOffset = 0;
    
    const dims = [CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE];
    const mask = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    
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
                    
                    // CORREZIONE: Gestisci sia aria che nuvole come "spazio vuoto"
                    const isVoxel1Solid = voxel1 !== VOXEL_TYPES.Air && voxel1 !== VOXEL_TYPES.Cloud;
                    const isVoxel2Solid = voxel2 !== VOXEL_TYPES.Air && voxel2 !== VOXEL_TYPES.Cloud;
                    const isVoxel1Transparent = voxel1 === VOXEL_TYPES.Cloud;
                    const isVoxel2Transparent = voxel2 === VOXEL_TYPES.Cloud;

                    // Logica di culling corretta: disegna la faccia solo se c'è un cambio
                    // tra un voxel solido e aria/trasparente, oppure tra due voxel trasparenti diversi.
                    if ((isVoxel1Solid && !isVoxel2Solid) || (!isVoxel1Solid && isVoxel2Solid) || (isVoxel1Transparent !== isVoxel2Transparent && voxel1 !== 0 && voxel2 !== 0)) {
                         mask[n] = (isVoxel1Solid || isVoxel1Transparent) ? voxel1 : -voxel2;
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

                        // CORREZIONE: Orientamento corretto dei vertici
                        if (sign > 0) {
                             positions.push(v1[0], v1[1], v1[2]);
                             positions.push(v3[0], v3[1], v3[2]);
                             positions.push(v4[0], v4[1], v4[2]);
                             positions.push(v2[0], v2[1], v2[2]);
                        } else {
                            positions.push(v1[0], v1[1], v1[2]);
                            positions.push(v2[0], v2[1], v2[2]);
                            positions.push(v4[0], v4[1], v4[2]);
                            positions.push(v3[0], v3[1], v3[2]);
                        }

                        for(let i = 0; i < 4; i++) {
                            normals.push(...normal);
                            colors.push(...color);
                        }
                        
                        indices.push(indexOffset, indexOffset + 1, indexOffset + 2);
                        indices.push(indexOffset, indexOffset + 2, indexOffset + 3);
                        indexOffset += 4;
                        
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
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices),
        colors: new Float32Array(colors)
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

            let mesh;
            switch (MESHING_ALGORITHM) {
                case 'VOXEL':
                    mesh = generateMeshForChunk_Voxel(new Uint8Array(chunkData));
                    break;
                case 'GREEDY':
                    mesh = generateMeshForChunk_Greedy(new Uint8Array(chunkData));
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