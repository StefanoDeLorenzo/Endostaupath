// worker.js

const CHUNK_SIZE = 32;
const REGION_CHUNKS = 4;
const CHUNK_SIZE_IN_BYTES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 1;

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
 * @description Ottiene il tipo di blocco in una data posizione, considerando anche i chunk vicini.
 * @param {Object} voxelData - Oggetto contenente i dati del chunk corrente e dei vicini.
 * @param {number} x - Coordinata locale X (da 0 a CHUNK_SIZE-1).
 * @param {number} y - Coordinata locale Y (da 0 a CHUNK_SIZE-1).
 * @param {number} z - Coordinata locale Z (da 0 a CHUNK_SIZE-1).
 * @returns {number} Il tipo di blocco.
 */
function getVoxel(voxelData, x, y, z) {
    // Se la posizione è all'interno del chunk corrente, la recupero
    if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
        return voxelData.chunkData[x * CHUNK_SIZE * CHUNK_SIZE + y * CHUNK_SIZE + z];
    }

    // Se la posizione è fuori dal chunk corrente, calcolo il vicino
    const neighborX = Math.floor(x / CHUNK_SIZE);
    const neighborY = Math.floor(y / CHUNK_SIZE);
    const neighborZ = Math.floor(z / CHUNK_SIZE);
    
    const localX = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = (y % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

    const neighborKey = `${neighborX},${neighborY},${neighborZ}`;
    const neighborChunkData = voxelData.neighborBuffers[neighborKey];
    
    if (neighborChunkData) {
        return neighborChunkData[localX * CHUNK_SIZE * CHUNK_SIZE + localY * CHUNK_SIZE + localZ];
    }

    return 0; // Aria se il vicino non è disponibile
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

    const materialColors = {
        1: [0.6, 0.4, 0.2, 1.0], // Terra
        2: [0.3, 0.6, 0.2, 1.0], // Erba
        3: [0.4, 0.4, 0.4, 1.0]  // Pietra
    };

    const faceData = [
        { normal: [0, 0, 1], vertices: [ {x:0,y:0,z:1}, {x:1,y:0,z:1}, {x:1,y:1,z:1}, {x:0,y:1,z:1} ] }, // +Z
        { normal: [0, 0, -1], vertices: [ {x:0,y:0,z:0}, {x:0,y:1,z:0}, {x:1,y:1,z:0}, {x:1,y:0,z:0} ] }, // -Z
        { normal: [1, 0, 0], vertices: [ {x:1,y:0,z:0}, {x:1,y:1,z:0}, {x:1,y:1,z:1}, {x:1,y:0,z:1} ] }, // +X
        { normal: [-1, 0, 0], vertices: [ {x:0,y:0,z:0}, {x:0,y:0,z:1}, {x:0,y:1,z:1}, {x:0,y:1,z:0} ] }, // -X
        { normal: [0, 1, 0], vertices: [ {x:0,y:1,z:0}, {x:0,y:1,z:1}, {x:1,y:1,z:1}, {x:1,y:1,z:0} ] }, // +Y
        { normal: [0, -1, 0], vertices: [ {x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:1,y:0,z:1}, {x:0,y:0,z:1} ] }, // -Y
    ];

    const neighborOffsets = [
        [0, 0, 1], [0, 0, -1],
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0]
    ];

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const blockType = getVoxel(voxelData, x, y, z);
                if (blockType === 0) continue;

                for (let i = 0; i < neighborOffsets.length; i++) {
                    const [dx, dy, dz] = neighborOffsets[i];
                    
                    const neighborType = getVoxel(voxelData, x + dx, y + dy, z + dz);
                    if (neighborType === 0) {
                        const face = faceData[i];
                        const faceColor = materialColors[blockType];

                        positions.push(x + face.vertices[0].x, y + face.vertices[0].y, z + face.vertices[0].z);
                        positions.push(x + face.vertices[1].x, y + face.vertices[1].y, z + face.vertices[1].z);
                        positions.push(x + face.vertices[2].x, y + face.vertices[2].y, z + face.vertices[2].z);
                        positions.push(x + face.vertices[3].x, y + face.vertices[3].y, z + face.vertices[3].z);

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


self.onmessage = (event) => {
    const { type, regionFileBuffer, neighborBuffers, chunkIndex, chunkX, chunkY, chunkZ } = event.data;

    if (type === 'loadChunkFromRegion') {
        const reader = new VoxelReader(regionFileBuffer);
        const chunkData = reader.getChunkData(chunkIndex);

        const newNeighborBuffers = {};
        for (const key in neighborBuffers) {
            newNeighborBuffers[key] = new Uint8Array(neighborBuffers[key]);
        }
        
        const { positions, indices, normals, colors } = getMeshData({ chunkData, neighborBuffers: newNeighborBuffers });
        
        self.postMessage({
            type: 'chunkGenerated',
            chunkX,
            chunkY,
            chunkZ,
            meshData: {
                positions: new Float32Array(positions),
                indices: new Uint32Array(indices),
                normals: new Float32Array(normals),
                colors: new Float32Array(colors),
            },
        }, [
            new Float32Array(positions).buffer,
            new Uint32Array(indices).buffer,
            new Float32Array(normals).buffer,
            new Float32Array(colors).buffer,
        ]);
    }
};
