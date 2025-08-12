// worker.js

// NOTA: Le dimensioni sono aumentate per includere il guscio di un blocco
const CHUNK_SIZE = 32;
const SHELL_CHUNK_SIZE = CHUNK_SIZE + 2;
const REGION_CHUNKS = 4;

/**
 * @class VoxelReader
 * @description Gestisce la lettura e il parsing dei file binari di regione.
 */
class VoxelReader {
    constructor(regionBuffer) {
        this.regionBuffer = regionBuffer;
        if (this.regionBuffer.byteLength === 0) {
            this.isEmpty = true;
            return;
        }

        this.isEmpty = false;
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

    getChunkData(chunkLocalX, chunkLocalY, chunkLocalZ) {
        if (this.isEmpty) {
            return null;
        }
        
        const chunkIndex = chunkLocalX * REGION_CHUNKS * REGION_CHUNKS + chunkLocalY * REGION_CHUNKS + chunkLocalZ;
        if (chunkIndex < 0 || chunkIndex >= this.header.numChunks) {
            return null;
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
 * @param {Uint8Array} chunkData - I dati del chunk con guscio.
 * @param {number} x - Coordinata X del voxel all'interno del chunk con guscio.
 * @param {number} y - Coordinata Y del voxel all'interno del chunk con guscio.
 * @param {number} z - Coordinata Z del voxel all'interno del chunk con guscio.
 * @returns {number} Il tipo di blocco.
 */
function getVoxel(chunkData, x, y, z) {
    // 💡 Abbiamo un guscio, quindi le dimensioni sono SHELL_CHUNK_SIZE
    const index = x * SHELL_CHUNK_SIZE * SHELL_CHUNK_SIZE + y * SHELL_CHUNK_SIZE + z;
    return chunkData[index];
}

/**
 * @function getMeshData
 * @description Genera i dati della mesh per un dato chunk.
 * @param {Uint8Array} chunkData - I dati del chunk con guscio.
 * @returns {Object} Un oggetto contenente posizioni, indici, normali e colori.
 */
function getMeshData(chunkData) {
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

    // 💡 Iteriamo solo sul chunk interno (da 1 a CHUNK_SIZE)
    for (let x = 1; x < SHELL_CHUNK_SIZE - 1; x++) {
        for (let y = 1; y < SHELL_CHUNK_SIZE - 1; y++) {
            for (let z = 1; z < SHELL_CHUNK_SIZE - 1; z++) {
                const blockType = getVoxel(chunkData, x, y, z);
                if (blockType === 0) continue;

                for (let i = 0; i < neighborOffsets.length; i++) {
                    const [dx, dy, dz] = neighborOffsets[i];
                    
                    const neighborType = getVoxel(chunkData, x + dx, y + dy, z + dz);
                    if (neighborType === 0) {
                        const face = faceData[i];
                        const faceColor = materialColors[blockType];

                        positions.push(x - 1 + face.vertices[0].x, y - 1 + face.vertices[0].y, z - 1 + face.vertices[0].z);
                        positions.push(x - 1 + face.vertices[1].x, y - 1 + face.vertices[1].y, z - 1 + face.vertices[1].z);
                        positions.push(x - 1 + face.vertices[2].x, y - 1 + face.vertices[2].y, z - 1 + face.vertices[2].z);
                        positions.push(x - 1 + face.vertices[3].x, y - 1 + face.vertices[3].y, z - 1 + face.vertices[3].z);

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
    const { type, regionBuffers, chunkX, chunkY, chunkZ, chunkLocalX, chunkLocalY, chunkLocalZ } = event.data;

    if (type === 'loadChunkFromRegion') {
        const regionReaders = {};
        for (const key in regionBuffers) {
            regionReaders[key] = new VoxelReader(regionBuffers[key]);
        }

        const regionReader = regionReaders[Object.keys(regionReaders)[0]];
        const chunkData = regionReader.getChunkData(chunkLocalX, chunkLocalY, chunkLocalZ);
        
        if (!chunkData) {
             self.postMessage({
                type: 'chunkGenerated',
                chunkX,
                chunkY,
                chunkZ,
                meshData: { positions: [], indices: [], normals: [], colors: [] }
            });
            return;
        }

        const { positions, indices, normals, colors } = getMeshData(chunkData);
        
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