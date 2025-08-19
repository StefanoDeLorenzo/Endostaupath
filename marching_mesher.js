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
    const threshold = 4; // La nostra soglia di intensità.

    // Itera attraverso ogni "cubo" del chunk
    for (let x = 0; x < chunk.size; x++) {
        for (let y = 0; y < chunk.size; y++) {
            for (let z = 0; z < chunk.size; z++) {
                // Posizioni dei vertici del cubo in ordine standard
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

                // Valori di intensità degli 8 vertici, nello stesso ordine
                const val = [
                    chunk.getVertexIntensity(x, y, z),
                    chunk.getVertexIntensity(x + 1, y, z),
                    chunk.getVertexIntensity(x + 1, y, z + 1),
                    chunk.getVertexIntensity(x, y, z + 1),
                    chunk.getVertexIntensity(x, y + 1, z),
                    chunk.getVertexIntensity(x + 1, y + 1, z),
                    chunk.getVertexIntensity(x + 1, y + 1, z + 1),
                    chunk.getVertexIntensity(x, y + 1, z + 1)
                ];

                // Calcola l'indice del cubo in base alla soglia
                let cubeIndex = 0;
                if (val[0] >= threshold) cubeIndex |= 1;
                if (val[1] >= threshold) cubeIndex |= 2;
                if (val[2] >= threshold) cubeIndex |= 4;
                if (val[3] >= threshold) cubeIndex |= 8;
                if (val[4] >= threshold) cubeIndex |= 16;
                if (val[5] >= threshold) cubeIndex |= 32;
                if (val[6] >= threshold) cubeIndex |= 64;
                if (val[7] >= threshold) cubeIndex |= 128;

                // Salta se il cubo è completamente vuoto o completamente pieno
                if (edgeTable[cubeIndex] === 0) continue;

                const vertList = new Array(12).fill(null);

                // Calcola i vertici lungo gli spigoli intersecati
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

                // Aggiungi i triangoli usando triTable e i vertici calcolati
                const triIndices = triTable[cubeIndex];
                for (let i = 0; triIndices[i] !== -1; i += 3) {
                    const v1 = vertList[triIndices[i]];
                    const v2 = vertList[triIndices[i + 1]];
                    const v3 = vertList[triIndices[i + 2]];

                    const currentVertexCount = positions.length / 3;

                    positions.push(v1.x, v1.y, v1.z);
                    positions.push(v2.x, v2.y, v2.z);
                    positions.push(v3.x, v3.y, v3.z);

                    // Qui è la CORREZIONE: Invertiamo l'ordine degli indici per rendere le facce visibili.
                    indices.push(currentVertexCount, currentVertexCount + 2, currentVertexCount + 1);
                }
            }
        }
    }

    // Crea la mesh in Babylon.js
    const mesh = new BABYLON.Mesh("chunkMesh", scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    
    BABYLON.VertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals);
    vertexData.normals = normals;

    vertexData.applyToMesh(mesh, true);

    return mesh;
}