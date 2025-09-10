import { REGION_SCHEMA } from '../world/config.js';

// Questa funzione è l'equivalente di this.worldLoader.getCoreChunkDataFromRegionBuffer
// Non è necessario che tu la includa nel file del worker.
const getChunkDataFromRegionBuffer = (buffer, chunkX, chunkY, chunkZ) => {
    const dv = new DataView(buffer);
    const headerSize = 11;
    const GRID = REGION_SCHEMA.GRID;

    const idx = ((chunkX * GRID) + chunkY) * GRID + chunkZ;
    const off = headerSize + idx * 5;

    const chunkFileOffset =
        (dv.getUint8(off) << 16) | (dv.getUint8(off + 1) << 8) | dv.getUint8(off + 2);

    if (chunkFileOffset === 0) return null;

    const size = REGION_SCHEMA.CHUNK_BYTES;
    const chunkBuffer = buffer.slice(chunkFileOffset, chunkFileOffset + size);
    return new Uint8Array(chunkBuffer);
};

self.onmessage = (event) => {
    const { type, regionBuffers, windowOrigin } = event.data;

    if (type === 'updateVoxelWindow') {
        const { CHUNK_SIZE, REGION_SPAN, GRID } = REGION_SCHEMA;
        const WINDOW_VOXEL_SPAN = 3 * REGION_SPAN;
        
        // La nuova voxelWindow ha una dimensione fissa di 3x3x3 regioni, senza la shell
        const windowBytes = WINDOW_VOXEL_SPAN ** 3;
        const newVoxelWindow = new Uint8Array(windowBytes);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const regionKey = `${windowOrigin.x + dx}_${windowOrigin.y + dy}_${windowOrigin.z + dz}`;
                    const regionBuffer = regionBuffers[regionKey];
                    
                    // Calcola le coordinate relative all'interno della finestra (0, 1, 2)
                    const rx = dx + 1;
                    const ry = dy + 1;
                    const rz = dz + 1;
                    
                    if (regionBuffer && regionBuffer.byteLength > 0) {
                        // Logica per copiare i chunk dalla regione al voxelWindow
                        for (let cx = 0; cx < GRID; cx++) {
                            for (let cy = 0; cy < GRID; cy++) {
                                for (let cz = 0; cz < GRID; cz++) {
                                    const chunkData = getChunkDataFromRegionBuffer(
                                        regionBuffer, cx, cy, cz
                                    );

                                    if (!chunkData) continue;

                                    const startX = rx * REGION_SPAN + cx * CHUNK_SIZE;
                                    const startY = ry * REGION_SPAN + cy * CHUNK_SIZE;
                                    const startZ = rz * REGION_SPAN + cz * CHUNK_SIZE;
                                    
                                    const CHUNK_SIZE_CUBE = CHUNK_SIZE ** 3;

                                    for (let z = 0; z < CHUNK_SIZE; z++) {
                                        for (let y = 0; y < CHUNK_SIZE; y++) {
                                            for (let x = 0; x < CHUNK_SIZE; x++) {
                                                const destX = startX + x;
                                                const destY = startY + y;
                                                const destZ = startZ + z;

                                                const destOffset = destX + destY * WINDOW_VOXEL_SPAN + destZ * WINDOW_VOXEL_SPAN * WINDOW_VOXEL_SPAN;
                                                const srcIndex = x + CHUNK_SIZE * (y + CHUNK_SIZE * z);

                                                if (destOffset >= 0 && destOffset < newVoxelWindow.length && srcIndex >= 0 && srcIndex < chunkData.length) {
                                                    newVoxelWindow[destOffset] = chunkData[srcIndex];
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // Se la regione è vuota (buffer è null o vuoto), azzera l'area
                        const startX = rx * REGION_SPAN;
                        const startY = ry * REGION_SPAN;
                        const startZ = rz * REGION_SPAN;
                        
                        for (let x = 0; x < REGION_SPAN; x++) {
                            for (let y = 0; y < REGION_SPAN; y++) {
                                for (let z = 0; z < REGION_SPAN; z++) {
                                    const destX = startX + x;
                                    const destY = startY + y;
                                    const destZ = startZ + z;
                                    const destOffset = destX + destY * WINDOW_VOXEL_SPAN + destZ * WINDOW_VOXEL_SPAN * WINDOW_VOXEL_SPAN;
                                    if (destOffset >= 0 && destOffset < newVoxelWindow.length) {
                                        newVoxelWindow[destOffset] = 0; // Imposta a zero (aria)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        self.postMessage({
            type: 'voxelWindowUpdated',
            voxelWindow: newVoxelWindow.buffer,
            windowOrigin
        }, [newVoxelWindow.buffer]);
    }
};