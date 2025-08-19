// La classe Chunk è stata adattata per supportare l'algoritmo di Marching Cubes,
// mantenendo i campi di metadati originali per la gestione del terreno.
// La struttura dati è ora altamente ottimizzata, separando i dati dei vertici
// da quelli dei voxel per evitare la ridondanza e ridurre il consumo di memoria.
class Chunk {
    constructor(cx, cy, cz) {
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;

        // Header per i metadati del chunk, come nella tua versione originale.
        this.chunkType = 0;
        this.mediumType = 0;
        this.paletteId = 0;
        this.flags = 0;
        this.waterLevel = 255;
        this.temp = 0;
        this.humidity = 0;

        // Le dimensioni del chunk in "voxel".
        this.size = 15;

        // Dati dei vertici (intensità) impacchettati in un Uint8Array.
        // Ogni vertice usa 3 bit per un totale di 8 livelli di intensità.
        const numVertices = (this.size + 1) * (this.size + 1) * (this.size + 1);
        const numBytesVertices = Math.ceil((numVertices * 3) / 8);
        this.vertexData = new Uint8Array(numBytesVertices);

        // Dati dei voxel (tipo di blocco) impacchettati in un Uint8Array.
        // Ogni voxel usa 4 bit per un totale di 16 tipi di blocco.
        const numVoxels = this.size * this.size * this.size;
        const numBytesVoxels = Math.ceil((numVoxels * 4) / 8);
        this.voxelTypeData = new Uint8Array(numBytesVoxels);
    }

    /**
     * Calcola l'indice 1D per un vertice 3D.
     * La griglia è (size+1) x (size+1) x (size+1).
     * @param {number} x - La coordinata x del vertice.
     * @param {number} y - La coordinata y del vertice.
     * @param {number} z - La coordinata z del vertice.
     * @returns {number} L'indice unidimensionale corrispondente.
     */
    vertexIndex(x, y, z) {
        return x + (this.size + 1) * (y + (this.size + 1) * z);
    }

    /**
     * Calcola l'indice 1D per un voxel 3D.
     * La griglia è (size) x (size) x (size).
     * @param {number} x - La coordinata x del voxel.
     * @param {number} y - La coordinata y del voxel.
     * @param {number} z - La coordinata z del voxel.
     * @returns {number} L'indice unidimensionale corrispondente.
     */
    voxelIndex(x, y, z) {
        return x + this.size * (y + this.size * z);
    }

    /**
     * Imposta il valore di intensità (3 bit) per un vertice.
     * @param {number} x - La coordinata x del vertice.
     * @param {number} y - La coordinata y del vertice.
     * @param {number} z - La coordinata z del vertice.
     * @param {number} intensity - Il valore di intensità (0-7).
     */
    setVertexIntensity(x, y, z, intensity) {
        const index = this.vertexIndex(x, y, z);
        const byteIndex = Math.floor((index * 3) / 8);
        const bitOffset = (index * 3) % 8;

        // Puliamo i 3 bit esistenti nella posizione corretta.
        const mask = ~(7 << bitOffset); // 7 in binario è 0111
        this.vertexData[byteIndex] &= mask;

        // Impostiamo i nuovi 3 bit con il valore di intensità.
        const value = intensity << bitOffset;
        this.vertexData[byteIndex] |= value;
    }

    /**
     * Ottiene il valore di intensità (3 bit) di un vertice.
     * @param {number} x - La coordinata x del vertice.
     * @param {number} y - La coordinata y del vertice.
     * @param {number} z - La coordinata z del vertice.
     * @returns {number} Il valore di intensità (0-7).
     */
    getVertexIntensity(x, y, z) {
        const index = this.vertexIndex(x, y, z);
        const byteIndex = Math.floor((index * 3) / 8);
        const bitOffset = (index * 3) % 8;

        const value = (this.vertexData[byteIndex] >> bitOffset) & 7;
        return value;
    }

    /**
     * Imposta il tipo di blocco (4 bit) per un voxel.
     * @param {number} x - La coordinata x del voxel.
     * @param {number} y - La coordinata y del voxel.
     * @param {number} z - La coordinata z del voxel.
     * @param {number} type - Il tipo di blocco (0-15).
     */
    setVoxelType(x, y, z, type) {
        const index = this.voxelIndex(x, y, z);
        const byteIndex = Math.floor((index * 4) / 8);
        const bitOffset = (index * 4) % 8;

        const mask = ~(15 << bitOffset); // 15 in binario è 1111
        this.voxelTypeData[byteIndex] &= mask;

        const value = type << bitOffset;
        this.voxelTypeData[byteIndex] |= value;
    }

    /**
     * Ottiene il tipo di blocco (4 bit) di un voxel.
     * @param {number} x - La coordinata x del voxel.
     * @param {number} y - La coordinata y del voxel.
     * @param {number} z - La coordinata z del voxel.
     * @returns {number} Il tipo di blocco (0-15).
     */
    getVoxelType(x, y, z) {
        const index = this.voxelIndex(x, y, z);
        const byteIndex = Math.floor((index * 4) / 8);
        const bitOffset = (index * 4) % 8;

        const value = (this.voxelTypeData[byteIndex] >> bitOffset) & 15;
        return value;
    }

    /**
     * Restituisce i dati completi (posizione e intensità) degli 8 vertici
     * che definiscono un voxel.
     * @param {number} vx - La coordinata x del voxel.
     * @param {number} vy - La coordinata y del voxel.
     * @param {number} vz - La coordinata z del voxel.
     * @returns {Array<{x: number, y: number, z: number, intensity: number}>} Un array di 8 oggetti.
     */
    getVoxelVerticesData(vx, vy, vz) {
        const verticesData = [];
        const positions = [
            [vx, vy, vz],
            [vx + 1, vy, vz],
            [vx + 1, vy, vz + 1],
            [vx, vy, vz + 1],
            [vx, vy + 1, vz],
            [vx + 1, vy + 1, vz],
            [vx + 1, vy + 1, vz + 1],
            [vx, vy + 1, vz + 1]
        ];

        for (let i = 0; i < positions.length; i++) {
            const x = positions[i][0];
            const y = positions[i][1];
            const z = positions[i][2];
            const intensity = this.getVertexIntensity(x, y, z);
            
            verticesData.push({ x, y, z, intensity });
        }

        return verticesData;
    }

    /**
     * Prepara il chunk per il trasferimento tra Web Worker e thread principale.
     * @returns {object} Un oggetto con dati trasferibili.
     */
    toTransfer() {
        return {
            cx: this.cx,
            cy: this.cy,
            cz: this.cz,
            header: new Uint8Array([
                this.chunkType, this.mediumType, this.paletteId,
                this.flags, this.waterLevel, this.temp, this.humidity
            ]).buffer,
            vertexData: this.vertexData.buffer,
            voxelTypeData: this.voxelTypeData.buffer,
            size: this.size
        };
    }

    /**
     * Ricostruisce un oggetto Chunk da un buffer di dati trasferito.
     * @param {object} o - L'oggetto trasferito.
     * @returns {Chunk} La nuova istanza di Chunk.
     */
    static fromTransfer(o) {
        const c = new Chunk(o.cx, o.cy, o.cz);
        const h = new Uint8Array(o.header);
        [c.chunkType, c.mediumType, c.paletteId, c.flags, c.waterLevel, c.temp, c.humidity] = h;
        c.vertexData = new Uint8Array(o.vertexData);
        c.voxelTypeData = new Uint8Array(o.voxelTypeData);
        c.size = o.size;
        return c;
    }
}