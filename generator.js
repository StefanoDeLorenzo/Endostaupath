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
        const regionChunks = 4; // Ogni regione è ora 4x4x4 chunk
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
                    
                    const chunkX = regionX * regionChunks + chunkLocalX;
                    const chunkY = regionChunks * regionChunks + chunkLocalY; // Aggiustato per mostrare più chunk verticalmente
                    const chunkZ = regionZ * regionChunks + chunkLocalZ;
                    
                    for (let x = 0; x < chunkSize; x++) {
                        for (let y = 0; y < chunkSize; y++) {
                            for (let z = 0; z < chunkSize; z++) {
                                const globalX = chunkX * chunkSize + x;
                                const globalY = chunkY * chunkSize + y;
                                const globalZ = chunkZ * chunkSize + z;

                                const baseHeight = Math.floor(globalY / 8 + Math.sin(globalX * 0.05) * 2 + Math.cos(globalZ * 0.05) * 2);

                                if (y + chunkY*chunkSize < baseHeight - 2) {
                                    voxelDataArray[dataIndex] = 3;
                                } else if (y + chunkY*chunkSize < baseHeight) {
                                    voxelDataArray[dataIndex] = 1;
                                } else if (y + chunkY*chunkSize === baseHeight) {
                                    voxelDataArray[dataIndex] = 2;
                                } else {
                                    voxelDataArray[dataIndex] = 0;
                                }
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