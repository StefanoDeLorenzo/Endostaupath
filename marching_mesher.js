// --- Funzione interpolate standard ---
/**
 * Calcola la posizione di un vertice lungo uno spigolo.
 * @param {BABYLON.Vector3} p1 - Il primo vertice dello spigolo.
 * @param {BABYLON.Vector3} p2 - Il secondo vertice dello spigolo.
 * @param {number} v1 - Il valore di intensità del primo vertice.
 * @param {number} v2 - Il valore di intensità del secondo vertice.
 * @param {number} threshold - La soglia di intensità.
 * @returns {BABYLON.Vector3} La posizione interpolata.
 */
function interpolate(p1, p2, v1, v2, threshold) {
    if (Math.abs(threshold - v1) < 0.00001) return p1;
    if (Math.abs(threshold - v2) < 0.00001) return p2;
    if (Math.abs(v1 - v2) < 0.00001) return p1;
    const mu = (threshold - v1) / (v2 - v1);
    return BABYLON.Vector3.Lerp(p1, p2, mu);
}

// --- Funzione generateMesh (Marching Cubes standard) ---
/**
 * Genera la mesh di un chunk usando l'algoritmo Marching Cubes.
 * @param {Chunk} chunk - L'istanza del chunk da elaborare.
 * @param {BABYLON.Scene} scene - La scena di Babylon.js.
 * @returns {BABYLON.Mesh} La mesh generata.
 */
function generateMesh(chunk, scene) {
    const positions = [];
    const indices = [];
    const normals = [];
    const threshold = 4;
    for (let x = 0; x < chunk.size; x++) {
        for (let y = 0; y < chunk.size; y++) {
            for (let z = 0; z < chunk.size; z++) {
                const p = [
                    new BABYLON.Vector3(x, y, z),
                    new BABYLON.Vector3(x + 1, y, z),
                    new BABYLON.Vector3(x + 1, y, z + 1),
                    new BABYLON.Vector3(x, y, z + 1),
                    new BABYLON.Vector3(x, y + 1, z),
                    new BABYLON.Vector3(x + 1, y + 1, z),
                    new BABYLON.Vector3(x + 1, y + 1, z + 1),
                    new BABYLON.Vector3(x, y + 1, z + 1)
                ];
                const val = [
                    chunk.getIntensity(x, y, z),
                    chunk.getIntensity(x + 1, y, z),
                    chunk.getIntensity(x + 1, y, z + 1),
                    chunk.getIntensity(x, y, z + 1),
                    chunk.getIntensity(x, y + 1, z),
                    chunk.getIntensity(x + 1, y + 1, z),
                    chunk.getIntensity(x + 1, y + 1, z + 1),
                    chunk.getIntensity(x, y + 1, z + 1)
                ];
                let cubeIndex = 0;
                if (val[0] >= threshold) cubeIndex |= 1;
                if (val[1] >= threshold) cubeIndex |= 2;
                if (val[2] >= threshold) cubeIndex |= 4;
                if (val[3] >= threshold) cubeIndex |= 8;
                if (val[4] >= threshold) cubeIndex |= 16;
                if (val[5] >= threshold) cubeIndex |= 32;
                if (val[6] >= threshold) cubeIndex |= 64;
                if (val[7] >= threshold) cubeIndex |= 128;
                if (edgeTable[cubeIndex] === 0) continue;
                const vertList = new Array(12).fill(null);
                if ((edgeTable[cubeIndex] & 1) > 0) vertList[0] = interpolate(p[0], p[1], val[0], val[1], threshold);
                if ((edgeTable[cubeIndex] & 2) > 0) vertList[1] = interpolate(p[1], p[2], val[1], val[2], threshold);
                if ((edgeTable[cubeIndex] & 4) > 0) vertList[2] = interpolate(p[2], p[3], val[2], val[3], threshold);
                if ((edgeTable[cubeIndex] & 8) > 0) vertList[3] = interpolate(p[3], p[0], val[3], val[0], threshold);
                if ((edgeTable[cubeIndex] & 16) > 0) vertList[4] = interpolate(p[4], p[5], val[4], val[5], threshold);
                if ((edgeTable[cubeIndex] & 32) > 0) vertList[5] = interpolate(p[5], p[6], val[5], val[6], threshold);
                if ((edgeTable[cubeIndex] & 64) > 0) vertList[6] = interpolate(p[6], p[7], val[6], val[7], threshold);
                if ((edgeTable[cubeIndex] & 128) > 0) vertList[7] = interpolate(p[7], p[4], val[7], val[4], threshold);
                if ((edgeTable[cubeIndex] & 256) > 0) vertList[8] = interpolate(p[0], p[4], val[0], val[4], threshold);
                if ((edgeTable[cubeIndex] & 512) > 0) vertList[9] = interpolate(p[1], p[5], val[1], val[5], threshold);
                if ((edgeTable[cubeIndex] & 1024) > 0) vertList[10] = interpolate(p[2], p[6], val[2], val[6], threshold);
                if ((edgeTable[cubeIndex] & 2048) > 0) vertList[11] = interpolate(p[3], p[7], val[3], val[7], threshold);
                const triIndices = triTable[cubeIndex];
                for (let i = 0; triIndices[i] !== -1; i += 3) {
                    const v1 = vertList[triIndices[i]];
                    const v2 = vertList[triIndices[i + 1]];
                    const v3 = vertList[triIndices[i + 2]];
                    const currentVertexCount = positions.length / 3;
                    positions.push(v1.x, v1.y, v1.z);
                    positions.push(v2.x, v2.y, v2.z);
                    positions.push(v3.x, v3.y, v3.z);
                    indices.push(currentVertexCount, currentVertexCount + 2, currentVertexCount + 1);
                }
            }
        }
    }
    const mesh = new BABYLON.Mesh("chunkMesh", scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    BABYLON.VertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals);
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh, true);
    return mesh;
}

// --- Funzione generateHybridMesh (con spostamento Y) ---
/**
 * Genera una mesh ibrida (blocco + smussatura) da un chunk voxel.
 * Utilizza l'intensità dei vertici per smussare le facce esposte,
 * applicando lo spostamento solo sull'asse Y.
 * @param {Chunk} chunk - Il chunk con i dati voxel.
 * @param {BABYLON.Scene} scene - La scena di Babylon.js.
 * @param {number} threshold - La soglia per l'intensità.
 * @returns {BABYLON.Mesh} La mesh generata.
 */
function generateHybridMesh(chunk, scene, threshold = 4) {
    const positions = [];
    const indices = [];
    const normals = [];
    const voxelTypeAir = 0;
    for (let x = 0; x < chunk.size; x++) {
        for (let y = 0; y < chunk.size; y++) {
            for (let z = 0; z < chunk.size; z++) {
                if (chunk.getVoxelType(x, y, z) === voxelTypeAir) {
                    continue;
                }
                const offsetScale = 0.5;
                // Faccia Superiore (Y+)
                if (y === chunk.size - 1 || chunk.getVoxelType(x, y + 1, z) === voxelTypeAir) {
                    const v0 = chunk.getVertexIntensity(x, y + 1, z);
                    const v1 = chunk.getVertexIntensity(x + 1, y + 1, z);
                    const v2 = chunk.getVertexIntensity(x + 1, y + 1, z + 1);
                    const v3 = chunk.getVertexIntensity(x, y + 1, z + 1);
                    const currentVertexCount = positions.length / 3;
                    positions.push(x, (y + 1) + (v0 - threshold) * offsetScale, z);
                    positions.push(x + 1, (y + 1) + (v1 - threshold) * offsetScale, z);
                    positions.push(x + 1, (y + 1) + (v2 - threshold) * offsetScale, z + 1);
                    positions.push(x, (y + 1) + (v3 - threshold) * offsetScale, z + 1);
                    indices.push(currentVertexCount, currentVertexCount + 2, currentVertexCount + 1, currentVertexCount, currentVertexCount + 3, currentVertexCount + 2);
                }
                // Faccia Inferiore (Y-)
                if (y === 0 || chunk.getVoxelType(x, y - 1, z) === voxelTypeAir) {
                    const v0 = chunk.getVertexIntensity(x, y, z);
                    const v1 = chunk.getVertexIntensity(x + 1, y, z);
                    const v2 = chunk.getVertexIntensity(x + 1, y, z + 1);
                    const v3 = chunk.getVertexIntensity(x, y, z + 1);
                    const currentVertexCount = positions.length / 3;
                    positions.push(x, y + (v0 - threshold) * offsetScale, z);
                    positions.push(x + 1, y + (v1 - threshold) * offsetScale, z);
                    positions.push(x + 1, y + (v2 - threshold) * offsetScale, z + 1);
                    positions.push(x, y + (v3 - threshold) * offsetScale, z + 1);
                    indices.push(currentVertexCount, currentVertexCount + 1, currentVertexCount + 2, currentVertexCount, currentVertexCount + 2, currentVertexCount + 3);
                }
                // Faccia Frontale (Z+)
                if (z === chunk.size - 1 || chunk.getVoxelType(x, y, z + 1) === voxelTypeAir) {
                    const v0 = chunk.getVertexIntensity(x, y, z + 1);
                    const v1 = chunk.getVertexIntensity(x + 1, y, z + 1);
                    const v2 = chunk.getVertexIntensity(x + 1, y + 1, z + 1);
                    const v3 = chunk.getVertexIntensity(x, y + 1, z + 1);
                    const currentVertexCount = positions.length / 3;
                    positions.push(x, y + (v0 - threshold) * offsetScale, z + 1);
                    positions.push(x + 1, y + (v1 - threshold) * offsetScale, z + 1);
                    positions.push(x + 1, (y + 1) + (v2 - threshold) * offsetScale, z + 1);
                    positions.push(x, (y + 1) + (v3 - threshold) * offsetScale, z + 1);
                    indices.push(currentVertexCount, currentVertexCount + 1, currentVertexCount + 2, currentVertexCount, currentVertexCount + 2, currentVertexCount + 3);
                }
                // Faccia Posteriore (Z-)
                if (z === 0 || chunk.getVoxelType(x, y, z - 1) === voxelTypeAir) {
                    const v0 = chunk.getVertexIntensity(x, y, z);
                    const v1 = chunk.getVertexIntensity(x + 1, y, z);
                    const v2 = chunk.getVertexIntensity(x + 1, y + 1, z);
                    const v3 = chunk.getVertexIntensity(x, y + 1, z);
                    const currentVertexCount = positions.length / 3;
                    positions.push(x, y + (v0 - threshold) * offsetScale, z);
                    positions.push(x + 1, y + (v1 - threshold) * offsetScale, z);
                    positions.push(x + 1, (y + 1) + (v2 - threshold) * offsetScale, z);
                    positions.push(x, (y + 1) + (v3 - threshold) * offsetScale, z);
                    indices.push(currentVertexCount, currentVertexCount + 2, currentVertexCount + 1, currentVertexCount, currentVertexCount + 3, currentVertexCount + 2);
                }
                // Faccia Destra (X+)
                if (x === chunk.size - 1 || chunk.getVoxelType(x + 1, y, z) === voxelTypeAir) {
                    const v0 = chunk.getVertexIntensity(x + 1, y, z);
                    const v1 = chunk.getVertexIntensity(x + 1, y + 1, z);
                    const v2 = chunk.getVertexIntensity(x + 1, y + 1, z + 1);
                    const v3 = chunk.getVertexIntensity(x + 1, y, z + 1);
                    const currentVertexCount = positions.length / 3;
                    positions.push(x + 1, y + (v0 - threshold) * offsetScale, z);
                    positions.push(x + 1, (y + 1) + (v1 - threshold) * offsetScale, z);
                    positions.push(x + 1, (y + 1) + (v2 - threshold) * offsetScale, z + 1);
                    positions.push(x + 1, y + (v3 - threshold) * offsetScale, z + 1);
                    indices.push(currentVertexCount, currentVertexCount + 1, currentVertexCount + 2, currentVertexCount, currentVertexCount + 2, currentVertexCount + 3);
                }
                // Faccia Sinistra (X-)
                if (x === 0 || chunk.getVoxelType(x - 1, y, z) === voxelTypeAir) {
                    const v0 = chunk.getVertexIntensity(x, y, z);
                    const v1 = chunk.getVertexIntensity(x, y + 1, z);
                    const v2 = chunk.getVertexIntensity(x, y + 1, z + 1);
                    const v3 = chunk.getVertexIntensity(x, y, z + 1);
                    const currentVertexCount = positions.length / 3;
                    positions.push(x, y + (v0 - threshold) * offsetScale, z);
                    positions.push(x, (y + 1) + (v1 - threshold) * offsetScale, z);
                    positions.push(x, (y + 1) + (v2 - threshold) * offsetScale, z + 1);
                    positions.push(x, y + (v3 - threshold) * offsetScale, z + 1);
                    indices.push(currentVertexCount, currentVertexCount + 2, currentVertexCount + 1, currentVertexCount, currentVertexCount + 3, currentVertexCount + 2);
                }
            }
        }
    }
    const mesh = new BABYLON.Mesh("hybridMesh", scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    BABYLON.VertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals);
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh);
    return mesh;
}