// worker.js

/**
 * @class RegionFileManager
 * @description Gestisce la lettura e il parsing dei file binari di regione.
 */
class RegionFileManager {
    constructor(buffer) {
        this.buffer = buffer;
        this.parsedData = this.parseRegionFile(buffer);
    }

    parseRegionFile(buffer) {
        const dataView = new DataView(buffer);
        let offset = 0;

        const magicNumber = new TextDecoder().decode(new Uint8Array(buffer, offset, 4));
        offset += 4;

        if (magicNumber !== "VOXL") {
            console.error("Errore: il file non è in un formato corretto.");
            return null;
        }

        const version = dataView.getUint8(offset);
        offset += 1;

        const chunkSizeX = dataView.getUint8(offset);
        offset += 1;
        const chunkSizeY = dataView.getUint8(offset);
        offset += 1;
        const chunkSizeZ = dataView.getUint8(offset);
        offset += 1;

        const numberOfChunks = dataView.getUint32(offset, true);
        offset += 4;

        console.log(`Magic Number: ${magicNumber}`);
        console.log(`Versione: ${version}`);
        console.log(`Grandezza Chunk: ${chunkSizeX}x${chunkSizeY}x${chunkSizeZ}`);
        console.log(`Numero Chunks: ${numberOfChunks}`);

        const chunkIndexTable = new Array(numberOfChunks);

        for (let i = 0; i < numberOfChunks; i++) {
            const chunkOffset = dataView.getUint32(offset, true);
            offset += 4;
            const chunkSize = dataView.getUint32(offset, true);
            offset += 4;

            chunkIndexTable[i] = {
                offset: chunkOffset,
                size: chunkSize
            };
        }

        console.log("Tabella degli indici letta.");

        return {
            magicNumber,
            version,
            chunkSizeX,
            chunkSizeY,
            chunkSizeZ,
            numberOfChunks,
            chunkIndexTable,
            voxelDataOffset: offset
        };
    }

    getChunkData(chunkIndex) {
        if (!this.parsedData) {
            console.error("Errore: file di regione non parsato.");
            return null;
        }

        if (chunkIndex < 0 || chunkIndex >= this.parsedData.chunkIndexTable.length) {
            console.error("Errore: indice del chunk richiesto è fuori dai limiti.");
            return null;
        }

        const chunkInfo = this.parsedData.chunkIndexTable[chunkIndex];
        const offset = this.parsedData.voxelDataOffset + chunkInfo.offset;
        const size = chunkInfo.size;

        if (size === 0) {
            console.log(`Chunk ${chunkIndex} non contiene dati (dimensione 0).`);
            return null;
        }

        const chunkData = new Uint8Array(this.buffer, offset, size);

        console.log(`Dati del chunk ${chunkIndex} estratti. Dimensione: ${size} byte.`);
        return chunkData;
    }
}


/**
 * @class VoxelChunkWorker
 * @description Logica di generazione dei dati nel Web Worker per un singolo chunk.
 */
class VoxelChunkWorker {
    constructor(chunkX, chunkY, chunkZ, chunkSize) {
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.chunkZ = chunkZ;
        this.chunkSize = chunkSize;
        this.voxelData = [];
    }

    generateVoxelDataFromBuffer(data) {
        const chunkSize = this.chunkSize;
        let index = 0;
        for (let x = 0; x < chunkSize; x++) {
            this.voxelData[x] = [];
            for (let y = 0; y < chunkSize; y++) {
                this.voxelData[x][y] = [];
                for (let z = 0; z < chunkSize; z++) {
                    this.voxelData[x][y][z] = data[index++];
                }
            }
        }
    }
    
    getVoxel(x, y, z) {
        if (x >= 0 && x < this.chunkSize && y >= 0 && y < this.chunkSize && z >= 0 && z < this.chunkSize) {
            return this.voxelData[x][y][z];
        }
        return 0;
    }

    getMeshData() {
        const positions = [];
        const indices = [];
        const normals = [];
        const colors = [];

        let vertexCount = 0;

        const materialColors = {
            1: { r: 0.6, g: 0.4, b: 0.2 },
            2: { r: 0.3, g: 0.6, b: 0.2 },
            3: { r: 0.4, g: 0.4, b: 0.4 }
        };

        const faceData = {
            top: { normal: [0, 1, 0], vertices: [ {x:-0.5,y:0.5,z:-0.5}, {x:0.5,y:0.5,z:-0.5}, {x:0.5,y:0.5,z:0.5}, {x:-0.5,y:0.5,z:0.5} ] },
            bottom: { normal: [0, -1, 0], vertices: [ {x:-0.5,y:-0.5,z:-0.5}, {x:-0.5,y:-0.5,z:0.5}, {x:0.5,y:-0.5,z:0.5}, {x:0.5,y:-0.5,z:-0.5} ] },
            front: { normal: [0, 0, 1], vertices: [ {x:-0.5,y:-0.5,z:0.5}, {x:-0.5,y:0.5,z:0.5}, {x:0.5,y:0.5,z:0.5}, {x:0.5,y:-0.5,z:0.5} ] },
            back: { normal: [0, 0, -1], vertices: [ {x:-0.5,y:-0.5,z:-0.5}, {x:0.5,y:-0.5,z:-0.5}, {x:0.5,y:0.5,z:-0.5}, {x:-0.5,y:0.5,z:-0.5} ] },
            right: { normal: [1, 0, 0], vertices: [ {x:0.5,y:-0.5,z:-0.5}, {x:0.5,y:-0.5,z:0.5}, {x:0.5,y:0.5,z:0.5}, {x:0.5,y:0.5,z:-0.5} ] },
            left: { normal: [-1, 0, 0], vertices: [ {x:-0.5,y:-0.5,z:-0.5}, {x:-0.5,y:0.5,z:-0.5}, {x:-0.5,y:0.5,z:0.5}, {x:-0.5,y:-0.5,z:0.5} ] }
        };

        const addFace = (blockX, blockY, blockZ, faceVertices, faceNormal, blockColor) => {
            for (let i = 0; i < faceVertices.length; i++) {
                const v = faceVertices[i];
                positions.push(blockX + v.x, blockY + v.y, blockZ + v.z);
                normals.push(faceNormal[0], faceNormal[1], faceNormal[2]);
                colors.push(blockColor.r, blockColor.g, blockColor.b, 1.0);
            }
            indices.push(vertexCount + 0, vertexCount + 1, vertexCount + 2);
            indices.push(vertexCount + 0, vertexCount + 2, vertexCount + 3);
            vertexCount += 4;
        };

        for (let x = 0; x < this.chunkSize; x++) {
            for (let y = 0; y < this.chunkSize; y++) {
                for (let z = 0; z < this.chunkSize; z++) {
                    const blockType = this.voxelData[x][y][z];

                    if (blockType !== 0) {
                        const blockColor = materialColors[blockType];
                        
                        if (y === this.chunkSize - 1 || this.getVoxel(x, y + 1, z) === 0) {
                            addFace(x, y, z, faceData.top.vertices, faceData.top.normal, blockColor);
                        }
                        if (y === 0 || this.getVoxel(x, y - 1, z) === 0) {
                            addFace(x, y, z, faceData.bottom.vertices, faceData.bottom.normal, blockColor);
                        }
                        if (z === this.chunkSize - 1 || this.getVoxel(x, y, z + 1) === 0) {
                            addFace(x, y, z, faceData.front.vertices, faceData.front.normal, blockColor);
                        }
                        if (z === 0 || this.getVoxel(x, y, z - 1) === 0) {
                            addFace(x, y, z, faceData.back.vertices, faceData.back.normal, blockColor);
                        }
                        if (x === this.chunkSize - 1 || this.getVoxel(x + 1, y, z) === 0) {
                            addFace(x, y, z, faceData.right.vertices, faceData.right.normal, blockColor);
                        }
                        if (x === 0 || this.getVoxel(x - 1, y, z) === 0) {
                            addFace(x, y, z, faceData.left.vertices, faceData.left.normal, blockColor);
                        }
                    }
                }
            }
        }

        return {
            positions: new Float32Array(positions),
            indices: new Uint32Array(indices),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors)
        };
    }
}

// Listener per i messaggi inviati al Web Worker
self.onmessage = (event) => {
    const { type, chunkX, chunkY, chunkZ, chunkSize, regionFileBuffer } = event.data;
    
    // Logica per caricare un chunk da un file di regione
    if (type === 'loadChunkFromRegion') {
        const regionManager = new RegionFileManager(regionFileBuffer);

        const chunkIndex = 0; 

        const chunkVoxelData = regionManager.getChunkData(chunkIndex);

        if (chunkVoxelData) {
            const chunkWorker = new VoxelChunkWorker(chunkX, chunkY, chunkZ, chunkSize);
            chunkWorker.generateVoxelDataFromBuffer(chunkVoxelData);

            const meshData = chunkWorker.getMeshData();
            
            self.postMessage({
                type: 'chunkGenerated',
                chunkX,
                chunkY,
                chunkZ,
                meshData
            }, [meshData.positions.buffer, meshData.indices.buffer, meshData.normals.buffer, meshData.colors.buffer]);
        }
    }
};
