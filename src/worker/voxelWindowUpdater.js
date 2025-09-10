// src/worker/voxelWindowUpdater.js

import { REGION_SCHEMA } from '../world/config.js';

const toLinearIndex = (x, y, z, size) => (x * size + y) * size + z;

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
        const { CHUNK_SIZE_SHELL, CHUNK_SIZE, REGION_SPAN, GRID } = REGION_SCHEMA;
        const regionCount = GRID + 2;
        const windowSize = regionCount * CHUNK_SIZE;
        const windowShellSize = windowSize + 2;
        const windowBytes = windowShellSize ** 3;

        // Inizializza la nuova voxelWindow
        const newVoxelWindow = new Uint8Array(windowBytes);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const regionX = windowOrigin.x + dx;
                    const regionY = windowOrigin.y + dy;
                    const regionZ = windowOrigin.z + dz;
                    const regionKey = `${regionX}_${regionY}_${regionZ}`;
                    const buffer = regionBuffers[regionKey];

                    if (buffer) {
                        // Il buffer esiste, copia i dati dei chunk
                        for (let cx = 0; cx < GRID; cx++) {
                            for (let cy = 0; cy < GRID; cy++) {
                                for (let cz = 0; cz < GRID; cz++) {
                                    const chunkData = getChunkDataFromRegionBuffer(buffer, cx, cy, cz);
                                    if (chunkData) {
                                        const chunkWindowX = (dx + 1) * CHUNK_SIZE + 1 + cx * CHUNK_SIZE;
                                        const chunkWindowY = (dy + 1) * CHUNK_SIZE + 1 + cy * CHUNK_SIZE;
                                        const chunkWindowZ = (dz + 1) * CHUNK_SIZE + 1 + cz * CHUNK_SIZE;

                                        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                                            for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                                                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                                                    const voxelValue = chunkData[toLinearIndex(lx, ly, lz, CHUNK_SIZE)];
                                                    if (voxelValue === 0) continue;

                                                    const windowIndex = toLinearIndex(
                                                        chunkWindowX + lx,
                                                        chunkWindowY + ly,
                                                        chunkWindowZ + lz,
                                                        windowShellSize
                                                    );
                                                    newVoxelWindow[windowIndex] = voxelValue;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // Il buffer non esiste, azzera l'area corrispondente
                        const startX = (dx + 1) * REGION_SPAN + 1;
                        const startY = (dy + 1) * REGION_SPAN + 1;
                        const startZ = (dz + 1) * REGION_SPAN + 1;
                        const WINDOW_VOXEL_SPAN = windowShellSize;

                        for (let x = 0; x < REGION_SPAN; x++) {
                            for (let y = 0; y < REGION_SPAN; y++) {
                                for (let z = 0; z < REGION_SPAN; z++) {
                                    const destX = startX + x;
                                    const destY = startY + y;
                                    const destZ = startZ + z;
                                    const destOffset = destX + destY * WINDOW_VOXEL_SPAN + destZ * WINDOW_VOXEL_SPAN * WINDOW_VOXEL_SPAN;
                                    newVoxelWindow[destOffset] = 0;
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