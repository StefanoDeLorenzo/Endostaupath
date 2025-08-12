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
// Raggruppa le facce adiacenti in rettangoli più grandi per ridurre i poligoni.
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
    const visited = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);

    // Iterazione su ogni asse (X, Y, Z) per generare le facce
    for (let axis = 0; axis < 3; axis++) {
        const u = (axis + 1) % 3;
        const v = (axis + 2) % 3;
        const x = [0, 0, 0];
        const q = [0, 0, 0];
        q[axis] = 1;

        const mask = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
        
        for (x[axis] = -1; x[axis] < CHUNK_SIZE; x[axis]++) {
            let n = 0;
            for (x[v] = 0; x[v] < CHUNK_SIZE; x[v]++) {
                for (x[u] = 0; x[u] < CHUNK_SIZE; x[u]++) {
                    const i1 = (x[0] + 1) + CHUNK_SIZE_SHELL * ((x[1] + 1) + CHUNK_SIZE_SHELL * (x[2] + 1));
                    const i2 = (x[0] + q[0] + 1) + CHUNK_SIZE_SHELL * ((x[1] + q[1] + 1) + CHUNK_SIZE_SHELL * (x[2] + q[2] + 1));
                    
                    const voxel1 = (x[axis] >= 0) ? chunkData[i1] : 0;
                    const voxel2 = (x[axis] < CHUNK_SIZE) ? chunkData[i2] : 0;
                    
                    if (voxel1 !== voxel2 && (voxel1 === VOXEL_TYPES.Air || voxel2 === VOXEL_TYPES.Air)) {
                         mask[n] = (voxel1 !== VOXEL_TYPES.Air) ? voxel1 : -voxel2;
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
                        let w = 1;
                        let h = 1;
                        let a;
                        let b;

                        // Trova la larghezza del rettangolo
                        for (w = 1; x[u] + w < CHUNK_SIZE && mask[n + w] === mask[n]; w++) {}

                        // Trova l'altezza del rettangolo
                        let done = false;
                        for (h = 1; x[v] + h < CHUNK_SIZE; h++) {
                            for (b = 0; b < w; b++) {
                                if (mask[n + b + h * CHUNK_SIZE] !== mask[n]) {
                                    done = true;
                                    break;
                                }
                            }
                            if (done) break;
                        }

                        // Aggiungi la faccia
                        const voxel = mask[n];
                        const sign = voxel > 0 ? 1 : -1;
                        const dir = voxel > 0 ? 1 : 0;
                        const color = VoxelColors[Math.abs(voxel)];

                        const vert = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                        const normal = [0, 0, 0];
                        normal[axis] = sign;
                        
                        // Calcola le coordinate dei vertici
                        const v1 = [x[0], x[1], x[2]];
                        const v2 = [x[0], x[1], x[2]];
                        const v3 = [x[0], x[1], x[2]];
                        const v4 = [x[0], x[1], x[2]];

                        v1[u] += w;
                        v2[v] += h;
                        v3[u] += w;
                        v3[v] += h;
                        
                        if (dir === 1) {
                            positions.push(v1[0], v1[1], v1[2]);
                            positions.push(v2[0], v2[1], v2[2]);
                            positions.push(v3[0], v3[1], v3[2]);
                            positions.push(x[0], x[1], x[2]);
                        } else {
                            positions.push(x[0], x[1], x[2]);
                            positions.push(v2[0], v2[1], v2[2]);
                            positions.push(v3[0], v3[1], v3[2]);
                            positions.push(v1[0], v1[1], v1[2]);
                        }

                        normals.push(normal[0], normal[1], normal[2], normal[0], normal[1], normal[2], normal[0], normal[1], normal[2], normal[0], normal[1], normal[2]);
                        colors.push(...color, ...color, ...color, ...color);

                        indices.push(indexOffset + 0, indexOffset + 1, indexOffset + 2, indexOffset + 0, indexOffset + 2, indexOffset + 3);
                        indexOffset += 4;

                        // Marchia i voxel come visitati
                        for (a = 0; a < h; a++) {
                            for (b = 0; b < w; b++) {
                                mask[n + b + a * CHUNK_SIZE] = 0;
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