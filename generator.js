// generator.js

// Dimensioni logiche del chunk (senza guscio)
const CHUNK_SIZE_LOGIC = 30;
const CHUNK_SIZE_WITH_SHELL = 32;

const REGION_CHUNKS = 4;
const REGION_HEIGHT = 4; // Altezza della regione in chunk

// Logica per la generazione del rumore di Perlin
function PerlinNoise(seed) {
    const p = new Uint8Array(512);
    const permutation = new Uint8Array([151,160,137,91,90,15,
        131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
        190, 6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,
        88,237,149,56,87,178,81,155,164,5,195,143,235,193,64,204,196,1,77,159,202,
        2,14,167,68,162,40,116,22,139,2,9,20,91,41,12,6,10,21,98,162,255,201,219,101,162,
        150,159,124,142,39,114,242,125,23,202,118,220,130,111,232,152,10,21,118,206,128,126,
        148,220,117,146,160,147,151,160,137,91,90,15,
        131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
        190, 6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,
        88,237,149,56,87,178,81,155,164,5,195,143,235,193,64,204,196,1,77,159,202,
        2,14,167,68,162,40,116,22,139,2,9,20,91,41,12,6,10,21,98,162,255,201,219,101,162,
        150,159,124,142,39,114,242,125,23,202,118,220,130,111,232,152,10,21,118,206,128,126
    ]);
    for (let i = 0; i < 256; i++) p[i] = permutation[i];
    for (let i = 0; i < 256; i++) p[256 + i] = p[i];

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(t, a, b) { return a + t * (b - a); }
    function grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    
    this.noise = function(x, y, z) {
        const X = Math.floor(x) & 255,                  
              Y = Math.floor(y) & 255,
              Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        const u = fade(x),                               
              v = fade(y),
              w = fade(z);
        const A = p[X  ]+Y, AA = p[A]+Z, AB = p[A+1]+Z, 
              B = p[X+1]+Y, BA = p[B]+Z, BB = p[B+1]+Z;
        return lerp(w, lerp(v, lerp(u, grad(p[AA  ], x, y, z),  
                                     grad(p[BA  ], x-1, y, z)), 
                             lerp(u, grad(p[AB  ], x, y-1, z),
                                     grad(p[BB  ], x-1, y-1, z))),
                       lerp(v, lerp(u, grad(p[AA+1], x, y, z-1),
                                     grad(p[BA+1], x-1, y, z-1)),
                             lerp(u, grad(p[AB+1], x, y-1, z-1),
                                     grad(p[BB+1], x-1, y-1, z-1))));
    };
}

/**
 * @class RegionGenerator
 * @description Genera i dati di un mondo procedurale e li salva in file .voxl.
 */
class RegionGenerator {
    constructor() {
        this.chunkCache = new Map();
        this.noise = new PerlinNoise(Date.now());
    }

    /**
     * Ottiene o genera i dati dei voxel per un dato chunk logico (30x30x30).
     * @param {number} chunkX - Coordinata X del chunk.
     * @param {number} chunkY - Coordinata Y del chunk.
     * @param {number} chunkZ - Coordinata Z del chunk.
     * @returns {Uint8Array} I dati dei voxel.
     */
    getChunkData(chunkX, chunkY, chunkZ) {
        const chunkKey = `${chunkX},${chunkY},${chunkZ}`;
        if (this.chunkCache.has(chunkKey)) {
            return this.chunkCache.get(chunkKey);
        }

        const voxelData = new Uint8Array(CHUNK_SIZE_LOGIC * CHUNK_SIZE_LOGIC * CHUNK_SIZE_LOGIC);
        const noiseScale = 0.05;
        const surfaceHeightOffset = CHUNK_SIZE_LOGIC * REGION_HEIGHT / 2;

        for (let x = 0; x < CHUNK_SIZE_LOGIC; x++) {
            for (let z = 0; z < CHUNK_SIZE_LOGIC; z++) {
                const globalX = chunkX * CHUNK_SIZE_LOGIC + x;
                const globalZ = chunkZ * CHUNK_SIZE_LOGIC + z;
                
                const noiseValue = (this.noise.noise(globalX * noiseScale, 0, globalZ * noiseScale) + 1) / 2;
                const surfaceHeight = Math.floor(noiseValue * surfaceHeightOffset) + 5;

                for (let y = 0; y < CHUNK_SIZE_LOGIC; y++) {
                    const globalY = chunkY * CHUNK_SIZE_LOGIC + y;
                    const index = x * CHUNK_SIZE_LOGIC * CHUNK_SIZE_LOGIC + y * CHUNK_SIZE_LOGIC + z;

                    if (globalY < surfaceHeight) {
                        voxelData[index] = (globalY < surfaceHeight - 4) ? 3 : 1; // 3: Pietra, 1: Terra
                    } else if (globalY === surfaceHeight) {
                        voxelData[index] = 2; // 2: Erba
                    } else {
                        voxelData[index] = 0; // 0: Aria
                    }
                }
            }
        }

        this.chunkCache.set(chunkKey, voxelData);
        return voxelData;
    }

    /**
     * Scrive un chunk in un buffer con il suo guscio.
     * Il buffer finale sarà di 32x32x32.
     * @param {number} chunkX - Coordinata X del chunk.
     * @param {number} chunkY - Coordinata Y del chunk.
     * @param {number} chunkZ - Coordinata Z del chunk.
     * @returns {ArrayBuffer} Il buffer del chunk con guscio.
     */
    writeChunkWithShell(chunkX, chunkY, chunkZ) {
        const chunkDataWithShell = new Uint8Array(CHUNK_SIZE_WITH_SHELL * CHUNK_SIZE_WITH_SHELL * CHUNK_SIZE_WITH_SHELL);
        
        // Copia i dati del chunk principale (30x30x30)
        const mainChunkData = this.getChunkData(chunkX, chunkY, chunkZ);
        for (let x = 0; x < CHUNK_SIZE_LOGIC; x++) {
            for (let y = 0; y < CHUNK_SIZE_LOGIC; y++) {
                for (let z = 0; z < CHUNK_SIZE_LOGIC; z++) {
                    const mainIndex = x * CHUNK_SIZE_LOGIC * CHUNK_SIZE_LOGIC + y * CHUNK_SIZE_LOGIC + z;
                    const shellIndex = (x + 1) * CHUNK_SIZE_WITH_SHELL * CHUNK_SIZE_WITH_SHELL + (y + 1) * CHUNK_SIZE_WITH_SHELL + (z + 1);
                    chunkDataWithShell[shellIndex] = mainChunkData[mainIndex];
                }
            }
        }

        // Popola il guscio con i dati dei chunk adiacenti
        for (let x = 0; x < CHUNK_SIZE_WITH_SHELL; x++) {
            for (let y = 0; y < CHUNK_SIZE_WITH_SHELL; y++) {
                for (let z = 0; z < CHUNK_SIZE_WITH_SHELL; z++) {
                    // Ignora i voxel interni, che abbiamo già copiato
                    if (x > 0 && x < CHUNK_SIZE_WITH_SHELL - 1 &&
                        y > 0 && y < CHUNK_SIZE_WITH_SHELL - 1 &&
                        z > 0 && z < CHUNK_SIZE_WITH_SHELL - 1) {
                        continue;
                    }

                    const shellIndex = x * CHUNK_SIZE_WITH_SHELL * CHUNK_SIZE_WITH_SHELL + y * CHUNK_SIZE_WITH_SHELL + z;

                    // Calcola le coordinate globali del voxel sul guscio
                    const globalX = (chunkX * CHUNK_SIZE_LOGIC) + x - 1;
                    const globalY = (chunkY * CHUNK_SIZE_LOGIC) + y - 1;
                    const globalZ = (chunkZ * CHUNK_SIZE_LOGIC) + z - 1;
                    
                    const isShellVoxel = (x === 0 || x === CHUNK_SIZE_WITH_SHELL - 1 ||
                                            y === 0 || y === CHUNK_SIZE_WITH_SHELL - 1 ||
                                            z === 0 || z === CHUNK_SIZE_WITH_SHELL - 1);
                    
                    if(isShellVoxel){
                        // Determina a quale chunk vicino appartiene il voxel del guscio
                        const neighborChunkX = Math.floor(globalX / CHUNK_SIZE_LOGIC);
                        const neighborChunkY = Math.floor(globalY / CHUNK_SIZE_LOGIC);
                        const neighborChunkZ = Math.floor(globalZ / CHUNK_SIZE_LOGIC);
                        
                        // Calcola le coordinate locali del voxel nel chunk vicino
                        const neighborVoxelLocalX = (globalX % CHUNK_SIZE_LOGIC + CHUNK_SIZE_LOGIC) % CHUNK_SIZE_LOGIC;
                        const neighborVoxelLocalY = (globalY % CHUNK_SIZE_LOGIC + CHUNK_SIZE_LOGIC) % CHUNK_SIZE_LOGIC;
                        const neighborVoxelLocalZ = (globalZ % CHUNK_SIZE_LOGIC + CHUNK_SIZE_LOGIC) % CHUNK_SIZE_LOGIC;
                        
                        const neighborData = this.getChunkData(neighborChunkX, neighborChunkY, neighborChunkZ);
                        const neighborVoxelIndex = neighborVoxelLocalX * CHUNK_SIZE_LOGIC * CHUNK_SIZE_LOGIC + neighborVoxelLocalY * CHUNK_SIZE_LOGIC + neighborVoxelLocalZ;
                        chunkDataWithShell[shellIndex] = neighborData[neighborVoxelIndex];
                    }
                }
            }
        }

        return chunkDataWithShell.buffer;
    }
    
    /**
     * Scrive un intero file di regione, includendo tutti i chunk.
     * @param {number} regionX - Coordinata X della regione.
     * @param {number} regionY - Coordinata Y della regione.
     * @param {number} regionZ - Coordinata Z della regione.
     * @returns {ArrayBuffer} Il buffer del file di regione.
     */
    writeRegion(regionX, regionY, regionZ) {
        console.log(`Generazione regione: ${regionX}, ${regionY}, ${regionZ}`);
        
        const chunkBuffers = [];
        const indexTable = [];
        let offset = 0;
        const totalChunks = REGION_CHUNKS * REGION_HEIGHT * REGION_CHUNKS;

        for (let chunkLocalX = 0; chunkLocalX < REGION_CHUNKS; chunkLocalX++) {
            for (let chunkLocalY = 0; chunkLocalY < REGION_HEIGHT; chunkLocalY++) {
                for (let chunkLocalZ = 0; chunkLocalZ < REGION_CHUNKS; chunkLocalZ++) {
                    const chunkX = regionX * REGION_CHUNKS + chunkLocalX;
                    const chunkY = regionY * REGION_HEIGHT + chunkLocalY;
                    const chunkZ = regionZ * REGION_CHUNKS + chunkLocalZ;
                    
                    const chunkDataBuffer = this.writeChunkWithShell(chunkX, chunkY, chunkZ);
                    
                    chunkBuffers.push(chunkDataBuffer);
                    indexTable.push(offset, chunkDataBuffer.byteLength);
                    offset += chunkDataBuffer.byteLength;
                }
            }
        }
        
        const header = new ArrayBuffer(4 + 1 + 3 + 4);
        const headerView = new DataView(header);
        new Uint8Array(header).set(new TextEncoder().encode('VOXL'), 0);
        headerView.setUint8(4, 1); // Versione
        headerView.setUint8(5, CHUNK_SIZE_WITH_SHELL);
        headerView.setUint8(6, CHUNK_SIZE_WITH_SHELL);
        headerView.setUint8(7, CHUNK_SIZE_WITH_SHELL);
        headerView.setUint32(8, totalChunks, true);
        
        const indexTableBuffer = new ArrayBuffer(indexTable.length * 4);
        const indexTableView = new DataView(indexTableBuffer);
        indexTable.forEach((value, i) => indexTableView.setUint32(i * 4, value, true));

        const combinedBuffer = new Uint8Array(header.byteLength + indexTableBuffer.byteLength + offset);
        combinedBuffer.set(new Uint8Array(header), 0);
        combinedBuffer.set(new Uint8Array(indexTableBuffer), header.byteLength);

        let dataOffset = header.byteLength + indexTableBuffer.byteLength;
        chunkBuffers.forEach(buffer => {
            combinedBuffer.set(new Uint8Array(buffer), dataOffset);
            dataOffset += buffer.byteLength;
        });

        return combinedBuffer.buffer;
    }
}


self.onmessage = (event) => {
    const { type, regionX, regionY, regionZ } = event.data;
    if (type === 'generateRegion') {
        const generator = new RegionGenerator();
        const regionBuffer = generator.writeRegion(regionX, regionY, regionZ);
        self.postMessage({
            type: 'regionGenerated',
            regionX,
            regionY,
            regionZ,
            buffer: regionBuffer
        }, [regionBuffer]);
    }
};