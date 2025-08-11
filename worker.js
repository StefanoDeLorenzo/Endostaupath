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

        if (chunkIndex < 0 || chunkIndex >= this.parsedData.numberOfChunks) {
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

// ... (VoxelChunkWorker e la sua logica restano invariate)

self.onmessage = (event) => {
    const { type, regionX, regionZ, regionFileBuffer, chunkIndex, chunkLocalX, chunkLocalY, chunkLocalZ } = event.data;
    
    if (type === 'loadChunkFromRegion') {
        const regionManager = new RegionFileManager(regionFileBuffer);

        const chunkVoxelData = regionManager.getChunkData(chunkIndex);

        if (chunkVoxelData) {
            const chunkSize = regionManager.parsedData.chunkSizeX;
            const chunkWorker = new VoxelChunkWorker(chunkLocalX, chunkLocalY, chunkLocalZ, chunkSize);
            chunkWorker.generateVoxelDataFromBuffer(chunkVoxelData);

            const meshData = chunkWorker.getMeshData();
            
            self.postMessage({
                type: 'chunkGenerated',
                chunkX: chunkLocalX,
                chunkY: chunkLocalY,
                chunkZ: chunkLocalZ,
                meshData
            }, [meshData.positions.buffer, meshData.indices.buffer, meshData.normals.buffer, meshData.colors.buffer]);
        }
    }
};