// La cache del mondo e le funzioni di generazione devono essere qui, 
// ma adattate per essere accessibili dal worker.
const WorldCache = {};

function getVoxelData(regionX, regionY, regionZ, innerX, innerY, innerZ) {
    const key = `${regionX}-${regionY}-${regionZ}`;
    const chunk = WorldCache[key];
    if (chunk) {
        return chunk[innerX * 30 * 30 + innerY * 30 + innerZ];
    }
    return 0; // Se il chunk non esiste, considera il voxel come vuoto
}

// Funzione principale che gestisce l'intera pipeline di scrittura del file
function generateRegionFile(regionX, regionY, regionZ) {
    // 1. Dati dei Voxel con guscio (32x32x32)
    const chunksWithShell = [];

    // Iteriamo su tutti i chunk logici 4x4x4 all'interno della regione
    for (let chunkX = 0; chunkX < 4; chunkX++) {
        for (let chunkY = 0; chunkY < 4; chunkY++) {
            for (let chunkZ = 0; chunkZ < 4; chunkZ++) {
                const chunkWithShell = createChunkWithShell(regionX, regionY, regionZ, chunkX, chunkY, chunkZ);
                chunksWithShell.push(chunkWithShell);
            }
        }
    }

    // 2. Calcolo degli Offsets e della Lunghezza
    const totalChunks = 64;
    const chunkSizeInBytes = 32768; // 32x32x32 voxel * 1 byte/voxel
    const headerSize = 11; // 4 (magic) + 1 (version) + 3 (dims) + 3 (count)
    const indexTableSize = totalChunks * 5;
    const chunkDataOffset = headerSize + indexTableSize;
    
    // Creiamo la tabella degli indici
    const indexTable = new Uint8Array(indexTableSize);
    let currentOffset = chunkDataOffset;
    for (let i = 0; i < totalChunks; i++) {
        // Scriviamo l'offset (3 byte) e la lunghezza (2 byte)
        indexTable[i * 5 + 0] = (currentOffset >> 16) & 0xFF;
        indexTable[i * 5 + 1] = (currentOffset >> 8) & 0xFF;
        indexTable[i * 5 + 2] = currentOffset & 0xFF;
        indexTable[i * 5 + 3] = (chunkSizeInBytes >> 8) & 0xFF;
        indexTable[i * 5 + 4] = chunkSizeInBytes & 0xFF;
        currentOffset += chunkSizeInBytes;
    }

    // 3. Creazione del Buffer Finale
    const totalFileSize = chunkDataOffset + totalChunks * chunkSizeInBytes;
    const finalBuffer = new ArrayBuffer(totalFileSize);
    const view = new DataView(finalBuffer);

    // Scrittura dell'Intestazione (Header)
    view.setUint32(0, 0x564F584C, false); // "VOXL" magic number
    view.setUint8(4, 1); // Versione 1
    view.setUint8(5, 32); view.setUint8(6, 32); view.setUint8(7, 32); // Dimensioni del chunk
    view.setUint8(8, 0); view.setUint8(9, 0); view.setUint8(10, 64); // Conteggio totale dei chunk (64)
    
    // Scrittura della Tabella degli Indici
    new Uint8Array(finalBuffer, headerSize, indexTableSize).set(indexTable);

    // Scrittura dei Dati dei Chunk
    let dataOffset = chunkDataOffset;
    for (const chunk of chunksWithShell) {
        new Uint8Array(finalBuffer, dataOffset, chunkSizeInBytes).set(chunk);
        dataOffset += chunkSizeInBytes;
    }

    return finalBuffer;
}

// Funzione per creare un singolo chunk 32x32x32 con guscio
function createChunkWithShell(regionX, regionY, regionZ, chunkX, chunkY, chunkZ) {
    const chunkWithShell = new Uint8Array(32 * 32 * 32);

    for (let i = 0; i < 32; i++) {
        for (let j = 0; j < 32; j++) {
            for (let k = 0; k < 32; k++) {
                // Mappa le coordinate 32x32x32 a 30x30x30
                const innerX = i - 1;
                const innerY = j - 1;
                const innerZ = k - 1;

                let voxelData = 0;

                // Controlla se siamo all'interno del chunk logico
                if (innerX >= 0 && innerX < 30 && innerY >= 0 && innerY < 30 && innerZ >= 0 && innerZ < 30) {
                    // Prende il dato dal nostro chunk logico interno
                    const key = `${regionX}-${regionY}-${regionZ}`;
                    voxelData = WorldCache[key][chunkX * 4 * 4 + chunkY * 4 + chunkZ][innerX * 30 * 30 + innerY * 30 + innerZ];
                } else {
                    // Altrimenti siamo nel guscio, prendiamo il dato dal chunk adiacente
                    const neighborRegionX = regionX + (i === 0 ? -1 : i === 31 ? 1 : 0);
                    const neighborRegionY = regionY + (j === 0 ? -1 : j === 31 ? 1 : 0);
                    const neighborRegionZ = regionZ + (k === 0 ? -1 : k === 31 ? 1 : 0);
                    
                    const neighborChunkX = chunkX + (i === 0 ? -1 : i === 31 ? 1 : 0);
                    const neighborChunkY = chunkY + (j === 0 ? -1 : j === 31 ? 1 : 0);
                    const neighborChunkZ = chunkZ + (k === 0 ? -1 : k === 31 ? 1 : 0);
                    
                    const neighborKey = `${neighborRegionX}-${neighborRegionY}-${neighborRegionZ}`;
                    const neighborChunk = WorldCache[neighborKey] ? WorldCache[neighborKey][neighborChunkX * 4 * 4 + neighborChunkY * 4 + neighborChunkZ] : null;

                    if (neighborChunk) {
                        const neighborInnerX = (i === 0) ? 29 : (i === 31) ? 0 : innerX;
                        const neighborInnerY = (j === 0) ? 29 : (j === 31) ? 0 : innerY;
                        const neighborInnerZ = (k === 0) ? 29 : (k === 31) ? 0 : innerZ;
                        
                        voxelData = neighborChunk[neighborInnerX * 30 * 30 + neighborInnerY * 30 + neighborInnerZ];
                    }
                }
                chunkWithShell[i * 32 * 32 + j * 32 + k] = voxelData;
            }
        }
    }
    return chunkWithShell;
}

// Funzione per generare un singolo chunk logico (30x30x30)
function generateLogicalChunk() {
    const chunk = new Uint8Array(30 * 30 * 30);
    // Logica di generazione dei voxel...
    // Un terreno semplice per l'esempio
    for (let i = 0; i < 30; i++) {
        for (let j = 0; j < 30; j++) {
            for (let k = 0; k < 30; k++) {
                if (k < 10) {
                    chunk[i * 30 * 30 + j * 30 + k] = 1;
                } else {
                    chunk[i * 30 * 30 + j * 30 + k] = 0;
                }
            }
        }
    }
    return chunk;
}

// Listener per i messaggi dal thread principale
self.onmessage = async (event) => {
    const { type, regionX, regionY, regionZ } = event.data;

    if (type === 'generateRegion') {
        // Prima di generare la regione, dobbiamo avere i dati di tutti i chunk 
        // e dei loro vicini nella cache. Questo è il punto critico.
        // Per questo esempio, generiamo un'unica regione e i suoi vicini.
        
        // Popola la cache per la regione corrente e i suoi vicini
        for (let x = regionX - 1; x <= regionX + 1; x++) {
            for (let y = regionY - 1; y <= regionY + 1; y++) {
                for (let z = regionZ - 1; z <= regionZ + 1; z++) {
                    const key = `${x}-${y}-${z}`;
                    if (!WorldCache[key]) {
                        WorldCache[key] = [];
                        for(let cx = 0; cx < 4; cx++) {
                            for(let cy = 0; cy < 4; cy++) {
                                for(let cz = 0; cz < 4; cz++) {
                                    WorldCache[key].push(generateLogicalChunk());
                                }
                            }
                        }
                    }
                }
            }
        }

        const buffer = generateRegionFile(regionX, regionY, regionZ);
        
        // Rispondi al thread principale con il buffer generato
        self.postMessage({
            type: 'regionGenerated',
            regionX: regionX,
            regionY: regionY,
            regionZ: regionZ,
            buffer: buffer
        }, [buffer]); // Trasferisci il buffer per efficienza
    }
};