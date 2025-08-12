// worker.js

self.importScripts('./meshGenerator.js');

const CHUNK_SIZE_LOGIC = 30;
const REGION_CHUNKS = 4;
const WORLD_HEIGHT = 16;

self.onmessage = (event) => {
    const { type, regionBuffers, chunkX, chunkY, chunkZ, chunkLocalX, chunkLocalY, chunkLocalZ } = event.data;

    if (type === 'loadChunkFromRegion') {
        const regionKey = `r.${Math.floor(chunkX / REGION_CHUNKS)}.${Math.floor(chunkY / WORLD_HEIGHT)}.${Math.floor(chunkZ / REGION_CHUNKS)}.voxl`;
        const regionBuffer = regionBuffers[regionKey];

        if (regionBuffer) {
            const dataView = new DataView(regionBuffer);
            const headerSize = 12; // 4 (VOXL) + 1 (versione) + 3 (dimensioni) + 4 (totale chunk)
            const chunkSizeFromHeader = dataView.getUint8(5);
            const totalChunks = dataView.getUint32(8, true);

            const indexTableOffset = headerSize;
            
            // Il nostro mondo è basato su chunk logici di 30x30x30
            // ma le regioni contengono un numero fisso di chunk
            const regionChunkIndexY = chunkLocalX * REGION_CHUNKS * WORLD_HEIGHT + chunkLocalY * REGION_CHUNKS + chunkLocalZ;
            
            if (regionChunkIndexY >= 0 && regionChunkIndexY < totalChunks) {
                const offset = dataView.getUint32(indexTableOffset + regionChunkIndexY * 8, true);
                const length = dataView.getUint32(indexTableOffset + regionChunkIndexY * 8 + 4, true);

                const chunkBuffer = regionBuffer.slice(offset, offset + length);
                const chunkData = new Uint8Array(chunkBuffer);
                
                const meshData = generateMesh(chunkData);

                self.postMessage({
                    type: 'chunkGenerated',
                    chunkX: chunkX,
                    chunkY: chunkY,
                    chunkZ: chunkZ,
                    meshData: meshData,
                });
            }
        }
    }
};