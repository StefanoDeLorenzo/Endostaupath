// generator.js

/**
 * @class RegionFileManager
 * @description Gestisce la generazione e la scrittura dei file binari di regione.
 */
class RegionFileManager {
    /**
     * Genera un file regione con un terreno di esempio
     * @param {number} regionX - La coordinata X della regione.
     * @param {number} regionZ - La coordinata Z della regione.
     * @returns {ArrayBuffer} Il buffer binario del file regione.
     */
    static generateRegionFile(regionX, regionZ) {
        const chunkSize = 32;
        const regionChunks = 4;
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
        const indexTableOffset = offset;
        const voxelDataOffset = headerSize + indexTableSize;
        const voxelDataArray = new Uint8Array(buffer, voxelDataOffset, totalVoxelDataSize);
        let dataIndex = 0;

        for (let chunkLocalX = 0; chunkLocalX < regionChunks; chunkLocalX++) {
            for (let chunkLocalY = 0; chunkLocalY < regionChunks; chunkLocalY++) {
                for (let chunkLocalZ = 0; chunkLocalZ < regionChunks; chunkLocalZ++) {
                    dataView.setUint32(indexTableOffset + (chunkLocalX * regionChunks * regionChunks + chunkLocalY * regionChunks + chunkLocalZ) * indexEntrySize, currentVoxelDataOffset, true);
                    dataView.setUint32(indexTableOffset + (chunkLocalX * regionChunks * regionChunks + chunkLocalY * regionChunks + chunkLocalZ) * indexEntrySize + 4, chunkSizeInBytes, true);
                    
                    const groundLevel = 64; 
                    
                    for (let x = 0; x < chunkSize; x++) {
                        for (let y = 0; y < chunkSize; y++) {
                            for (let z = 0; z < chunkSize; z++) {
                                const globalX = regionX * regionChunks * chunkSize + chunkLocalX * chunkSize + x;
                                const globalY = chunkLocalY * chunkSize + y;
                                const globalZ = regionZ * regionChunks * chunkSize + chunkLocalZ * chunkSize + z;

                                let blockType = 0; // Aria
                                const heightVariation = Math.sin(globalX * 0.05) * 2 + Math.cos(globalZ * 0.05) * 2;
                                const currentHeight = Math.floor(groundLevel + heightVariation);
                                
                                if (globalY < currentHeight - 4) {
                                    blockType = 3; // Pietra
                                } else if (globalY < currentHeight) {
                                    blockType = 1; // Terra
                                } else if (globalY === currentHeight) {
                                    blockType = 2; // Erba
                                }

                                voxelDataArray[dataIndex] = blockType;
                                dataIndex++;
                            }
                        }
                    }
                    currentVoxelDataOffset += chunkSizeInBytes;
                }
            }
        }
        return buffer;
    }
}

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
