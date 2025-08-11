// worker.js

const CHUNK_SIZE = 32;
const REGION_CHUNKS = 4;
const CHUNK_SIZE_IN_BYTES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 1;

const neighbors = {
    '1,0,0': {}, // +x
    '-1,0,0': {}, // -x
    '0,1,0': {}, // +y
    '0,-1,0': {}, // -y
    '0,0,1': {}, // +z
    '0,0,-1': {}, // -z
};

// ... altri 20 vicini

/**
 * @class VoxelReader
 * @description Si occupa di leggere i dati dei chunk da un buffer binario di una regione.
 */
class VoxelReader {
    constructor(regionBuffer) {
        this.regionBuffer = regionBuffer;
        this.dataView = new DataView(this.regionBuffer);
        this.header = this.parseHeader();
    }

    parseHeader() {
        const header = {};
        const decoder = new TextDecoder();
        header.magic = decoder.decode(this.regionBuffer.slice(0, 4));
        if (header.magic !== 'VOXL') {
            throw new Error("Formato del file di regione non valido.");
        }
        let offset = 4;
        header.version = this.dataView.getUint8(offset++);
        header.chunkSizeX = this.dataView.getUint8(offset++);
        header.chunkSizeY = this.dataView.getUint8(offset++);
        header.chunkSizeZ = this.dataView.getUint8(offset++);
        header.numChunks = this.dataView.getUint32(offset, true);
        return header;
    }

    getChunkData(chunkIndex) {
        if (chunkIndex < 0 || chunkIndex >= this.header.numChunks) {
            throw new Error(`Indice del chunk richiesto (${chunkIndex}) è fuori dai limiti.`);
        }
        
        const indexTableOffset = 4 + 1 + 3 + 4;
        const indexEntrySize = 8;
        const entryOffset = indexTableOffset + chunkIndex * indexEntrySize;
        const voxelDataOffset = this.dataView.getUint32(entryOffset, true);
        const voxelDataSize = this.dataView.getUint32(entryOffset + 4, true);

        const fullVoxelDataOffset = indexTableOffset + this.header.numChunks * indexEntrySize + voxelDataOffset;
        
        return new Uint8Array(this.regionBuffer, fullVoxelDataOffset, voxelDataSize);
    }
}

/**
 * @function getVoxel
 * @description Ottiene il tipo di blocco in una data posizione.
 * @param {Uint8Array} chunkData - I dati dei voxel del chunk.
 * @param {number} x - Coordinata locale X.
 * @param {number} y - Coordinata locale Y.
 * @param {number} z - Coordinata locale Z.
 * @returns {number} Il tipo di blocco.
 */
function getVoxel(chunkData, x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
        return 0;
    }
    return chunkData[x * CHUNK_SIZE * CHUNK_SIZE + y * CHUNK_SIZE + z];
}

/**
 * @function getNeighborVoxel
 * @description Ottiene il tipo di blocco in una data posizione, considerando anche i chunk vicini.
 * @param {Object} voxelData - Oggetto contenente i dati del chunk corrente e dei vicini.
 * @param {number} x - Coordinata locale X.
 * @param {number} y - Coordinata locale Y.
 * @param {number} z - Coordinata locale Z.
 * @param {number} dx - Offset del vicino X.
 * @param {number} dy - Offset del vicino Y.
 * @param {number} dz - Offset del vicino Z.
 * @returns {number} Il tipo di blocco.
 */
function getNeighborVoxel(voxelData, x, y, z, dx, dy, dz) {
    const neighborKey = `${dx},${dy},${dz}`;
    const neighborChunkData = voxelData.neighborBuffers[neighborKey];
    
    // Se il vicino non esiste, restituisco un blocco "solido"
    // Questo è il cuore del problema che abbiamo risolto
    if (!neighborChunkData) {
        return 1;
    }

    const neighborX = x + dx;
    const neighborY = y + dy;
    const neighborZ = z + dz;

    const chunkX = Math.floor(neighborX / CHUNK_SIZE);
    const chunkY = Math.floor(neighborY / CHUNK_SIZE);
    const chunkZ = Math.floor(neighborZ / CHUNK_SIZE);

    const localX = (neighborX % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = (neighborY % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = (neighborZ % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

    // Se la posizione è all'interno del chunk, la recupero
    if (chunkX === 0 && chunkY === 0 && chunkZ === 0) {
        return getVoxel(voxelData.chunkData, localX, localY, localZ);
    }
    // Altrimenti, la recupero dal chunk vicino corretto
    const dataView = new DataView(neighborChunkData);
    const offset = localX * CHUNK_SIZE * CHUNK_SIZE + localY * CHUNK_SIZE + localZ;

    return new Uint8Array(neighborChunkData)[offset];
}


/**
 * @function getMeshData
 * @description Genera i dati della mesh per un dato chunk.
 * @param {Object} voxelData - Oggetto contenente i dati del chunk corrente e dei vicini.
 * @returns {Object} Un oggetto contenente posizioni, indici, normali e colori.
 */
function getMeshData(voxelData) {
    const positions = [];
    const indices = [];
    const normals = [];
    const colors = [];
    let vertexIndex = 0;

    const chunkData = voxelData.chunkData;

    const faceData = [
        // +Z face
        { normal: [0, 0, 1], vertices: [ {pos:[0,0,1], color:[0,0,1,1]}, {pos:[1,0,1], color:[0,0,1,1]}, {pos:[1,1,1], color:[0,0,1,1]}, {pos:[0,1,1], color:[0,0,1,1]} ] },
        // -Z face
        { normal: [0, 0, -1], vertices: [ {pos:[0,0,0], color:[0,0,1,1]}, {pos:[0,1,0], color:[0,0,1,1]}, {pos:[1,1,0], color:[0,0,1,1]}, {pos:[1,0,0], color:[0,0,1,1]} ] },
        // +X face
        { normal: [1, 0, 0], vertices: [ {pos:[1,0,0], color:[0,0,1,1]}, {pos:[1,1,0], color:[0,0,1,1]}, {pos:[1,1,1], color:[0,0,1,1]}, {pos:[1,0,1], color:[0,0,1,1]} ] },
        // -X face
        { normal: [-1, 0, 0], vertices: [ {pos:[0,0,0], color:[0,0,1,1]}, {pos:[0,0,1], color:[0,0,1,1]}, {pos:[0,1,1], color:[0,0,1,1]}, {pos:[0,1,0], color:[0,0,1,1]} ] },
        // +Y face
        { normal: [0, 1, 0], vertices: [ {pos:[0,1,0], color:[0,0,1,1]}, {pos:[0,1,1], color:[0,0,1,1]}, {pos:[1,1,1], color:[0,0,1,1]}, {pos:[1,1,0], color:[0,0,1,1]} ] },
        // -Y face
        { normal: [0, -1, 0], vertices: [ {pos:[0,0,0], color:[0,0,1,1]}, {pos:[1,0,0], color:[0,0,1,1]}, {pos:[1,0,1], color:[0,0,1,1]}, {pos:[0,0,1], color:[0,0,1,1]} ] },
    ];
    
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const blockType = getVoxel(chunkData, x, y, z);
                if (blockType === 0) continue;

                // Controlla i 6 vicini per ogni blocco
                const neighborOffsets = [
                    [1, 0, 0], [-1, 0, 0],
                    [0, 1, 0], [0, -1, 0],
                    [0, 0, 1], [0, 0, -1]
                ];

                for (let i = 0; i < neighborOffsets.length; i++) {
                    const [dx, dy, dz] = neighborOffsets[i];
                    
                    const neighborType = getNeighborVoxel(voxelData, x, y, z, dx, dy, dz);
                    if (neighborType === 0) { // Se il vicino è aria, disegna la faccia
                        const face = faceData[i];
                        const faceColor = getColorForBlock(blockType);

                        positions.push(x + face.vertices[0].pos[0], y + face.vertices[0].pos[1], z + face.vertices[0].pos[2]);
                        positions.push(x + face.vertices[1].pos[0], y + face.vertices[1].pos[1], z + face.vertices[1].pos[2]);
                        positions.push(x + face.vertices[2].pos[0], y + face.vertices[2].pos[1], z + face.vertices[2].pos[2]);
                        positions.push(x + face.vertices[3].pos[0], y + face.vertices[3].pos[1], z + face.vertices[3].pos[2]);

                        normals.push(...face.normal, ...face.normal, ...face.normal, ...face.normal);

                        colors.push(...faceColor, ...faceColor, ...faceColor, ...faceColor);

                        indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
                        indices.push(vertexIndex, vertexIndex + 2, vertexIndex + 3);

                        vertexIndex += 4;
                    }
                }
            }
        }
    }
    
    return { positions, indices, normals, colors };
}

/**
 * @function getColorForBlock
 * @description Restituisce il colore corrispondente a un tipo di blocco.
 * @param {number} blockType - Il tipo di blocco.
 * @returns {Array<number>} Un array RGBA del colore.
 */
function getColorForBlock(blockType) {
    const colors = {
        1: [0.5, 0.25, 0, 1], // Dirt
        2: [0.1, 0.8, 0.2, 1], // Grass
        3: [0.5, 0.5, 0.5, 1], // Stone
        4: [0.3, 0.2, 0.1, 1], // Wood
    };
    return colors[blockType] || [1, 0, 1, 1]; // Magenta per i blocchi sconosciuti
}

self.onmessage = (event) => {
    const { type, regionFileBuffer, neighborBuffers, chunkIndex, chunkLocalX, chunkLocalY, chunkLocalZ } = event.data;

    if (type === 'loadChunkFromRegion') {
        const reader = new VoxelReader(regionFileBuffer);
        const chunkData = reader.getChunkData(chunkIndex);

        const meshData = getMeshData({ chunkData, neighborBuffers });
        
        self.postMessage({
            type: 'chunkGenerated',
            chunkX: chunkLocalX,
            chunkY: chunkLocalY,
            chunkZ: chunkLocalZ,
            meshData
        });
    }
};
