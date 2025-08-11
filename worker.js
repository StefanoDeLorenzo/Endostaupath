// worker.js

const CHUNK_SIZE = 32;
const REGION_CHUNKS = 4;

/**
 * @class VoxelReader
 * @description Gestisce la lettura e il parsing dei file binari di regione.
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

    getChunkData(chunkLocalX, chunkLocalY, chunkLocalZ) {
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
 * @description Ottiene il tipo di blocco in una data posizione, considerando anche i chunk vicini.
 * @param {Object} context - Contesto contenente i dati delle regioni.
 * @param {number} x - Coordinata globale X del voxel.
 * @param {number} y - Coordinata globale Y del voxel.
 * @param {number} z - Coordinata globale Z del voxel.
 * @returns {number} Il tipo di blocco.
 */
function getVoxel(context, x, y, z) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkY = Math.floor(y / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);

    const regionX = Math.floor(chunkX / REGION_CHUNKS);
    const regionZ = Math.floor(chunkZ / REGION_CHUNKS);

    const chunkLocalX = (chunkX % REGION_CHUNKS + REGION_CHUNKS) % REGION_CHUNKS;
    const chunkLocalY = (chunkY % REGION_CHUNKS + REGION_CHUNKS) % REGION_CHUNKS;
    const chunkLocalZ = (chunkZ % REGION_CHUNKS + REGION_CHUNKS) % REGION_CHUNKS;

    const regionKey = `${regionX},${regionZ}`;
    const regionReader = context.regionReaders[regionKey];

    if (!regionReader) {
        return 0; // Aria se la regione non esiste
    }

    const chunkData = regionReader.getChunkData(chunkLocalX, chunkLocalY, chunkLocalZ);

    if (!chunkData) {
        return 0; // Aria se il chunk non esiste
    }
    
    const voxelLocalX = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const voxelLocalY = (y % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const voxelLocalZ = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

    const voxelIndex = voxelLocalX * CHUNK_SIZE * CHUNK_SIZE + voxelLocalY * CHUNK_SIZE + voxelLocalZ;

    return chunkData[voxelIndex];
}

/**
 * @function getMeshData
 * @description Genera i dati della mesh per un dato chunk.
 * @param {Object} context - Contesto contenente i dati delle regioni.
 * @param {number} chunkX - Coordinata X del chunk.
 * @param {number} chunkY - Coordinata Y del chunk.
 * @param {number} chunkZ - Coordinata Z del chunk.
 * @returns {Object} Un oggetto contenente posizioni, indici, normali e colori.
 */
function getMeshData(context, chunkX, chunkY, chunkZ) {
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

    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const startZ = chunkZ * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const globalX = startX + x;
                const globalY = startY + y;
                const globalZ = startZ + z;

                const blockType = getVoxel(context, globalX, globalY, globalZ);
                if (blockType === 0) continue;

                for (let i = 0; i < neighborOffsets.length; i++) {
                    const [dx, dy, dz] = neighborOffsets[i];
                    
                    const neighborType = getVoxel(context, globalX + dx, globalY + dy, globalZ + dz);
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
    const { type, regionBuffers, chunkX, chunkY, chunkZ } = event.data;

    if (type === 'loadChunkFromRegion') {
        const regionReaders = {};
        for (const key in regionBuffers) {
            regionReaders[key] = new VoxelReader(regionBuffers[key]);
        }

        const context = {
            regionReaders,
            chunkX,
            chunkY,
            chunkZ
        };
        
        const { positions, indices, normals, colors } = getMeshData(context, chunkX, chunkY, chunkZ);
        
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
