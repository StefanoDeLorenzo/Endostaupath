// generator.js

/**
 * @class RegionFileManager
 * @description Gestisce la generazione e la scrittura dei file binari di regione.
 */
class RegionFileManager {
    /**
     * Genera un file regione fittizio con un terreno di esempio
     * @param {number} regionX - La coordinata X della regione.
     * @param {number} regionZ - La coordinata Z della regione.
     * @returns {ArrayBuffer} Il buffer binario del file regione.
     */
    static generateRegionFile(regionX, regionZ) {
        const chunkSize = 32;
        const regionChunks = 1;
        const numberOfChunks = regionChunks * regionChunks * regionChunks;
        const indexEntrySize = 8;
        const headerSize = 4 + 1 + 3 + 4;
        const indexTableSize = numberOfChunks * indexEntrySize;
        const chunkSizeInBytes = chunkSize * chunkSize * chunkSize * 1;
        const totalVoxelDataSize = numberOfChunks * chunkSizeInBytes;
        const bufferSize = headerSize + indexTableSize + totalVoxelDataSize;
        const buffer = new ArrayBuffer(bufferSize);
        const dataView = new DataView(buffer);
        let offset = 0;

        new Uint8Array(buffer).set(new TextEncoder().encode("VOXL"), offset);
        offset += 4;

        dataView.setUint8(offset++, 1);
        dataView.setUint8(offset++, chunkSize);
        dataView.setUint8(offset++, chunkSize);
        dataView.setUint8(offset++, chunkSize);

        dataView.setUint32(offset, numberOfChunks, true);
        offset += 4;

        let currentVoxelDataOffset = 0;
        dataView.setUint32(offset, currentVoxelDataOffset, true);
        offset += 4;
        dataView.setUint32(offset, chunkSizeInBytes, true);
        offset += 4;

        const voxelDataOffset = headerSize + indexTableSize;
        const voxelDataArray = new Uint8Array(buffer, voxelDataOffset, totalVoxelDataSize);
        let dataIndex = 0;

        const chunkX = regionX * regionChunks;
        const chunkY = 0;
        const chunkZ = regionZ * regionChunks;

        for (let x = 0; x < chunkSize; x++) {
            for (let y = 0; y < chunkSize; y++) {
                for (let z = 0; z < chunkSize; z++) {
                    const globalX = chunkX * chunkSize + x;
                    const globalZ = chunkZ * chunkSize + z;
                    const baseHeight = Math.floor(chunkSize / 8 + Math.sin(globalX * 0.05) * 2 + Math.cos(globalZ * 0.05) * 2);

                    if (y < baseHeight - 2) {
                        voxelDataArray[dataIndex] = 3;
                    } else if (y < baseHeight) {
                        voxelDataArray[dataIndex] = 1;
                    } else if (y === baseHeight) {
                        voxelDataArray[dataIndex] = 2;
                    } else {
                        voxelDataArray[dataIndex] = 0;
                    }

                    if (x > chunkSize / 4 && x < chunkSize * 3 / 4 && z > chunkSize / 4 && z < chunkSize * 3 / 4 && y === baseHeight + 3) {
                         if (Math.random() < 0.1) {
                            voxelDataArray[dataIndex] = 1;
                         }
                    }
                    dataIndex++;
                }
            }
        }
        return buffer;
    }
}

// Listener per i messaggi inviati al Web Worker
self.onmessage = (event) => {
    const { type, regionX, regionZ } = event.data;

    if (type === 'generateRegion') {
        console.log(`Generazione regione (${regionX}, ${regionZ})...`);
        const regionBuffer = RegionFileManager.generateRegionFile(regionX, regionZ);
        
        self.postMessage({
            type: 'regionGenerated',
            regionX,
            regionZ,
            buffer: regionBuffer
        }, [regionBuffer]);
    }
};