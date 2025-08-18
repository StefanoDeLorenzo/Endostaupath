// Versione di prova non utilizzata
// La classe Chunk è stata adattata per supportare l'algoritmo di Marching Cubes,
// mantenendo i campi di metadati originali per la gestione del terreno.
class Chunk {
    constructor(cx, cy, cz) {
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;

        // Header per i metadati del chunk, come nella tua versione originale.
        // Questi campi possono essere usati per la gestione del terreno,
        // l'illuminazione, o altre logiche di gioco.
        this.chunkType = 0;
        this.mediumType = 0; // indice 0 della tavolozza => medium
        this.paletteId = 0;
        this.flags = 0;
        this.waterLevel = 255; // 255 = n/a
        this.temp = 0;
        this.humidity = 0;

        // Le dimensioni della griglia Marching Cubes.
        // Poiché l'algoritmo opera sui vertici, la griglia è (size+1)^3.
        this.size = 30;
        const N_vertices = (this.size + 1) * (this.size + 1) * (this.size + 1);

        // L'array dei dati principali. A differenza della tua versione originale,
        // qui ogni byte memorizza l'intensità (per Marching Cubes) e il tipo di blocco
        // (come nella tua struttura precedente) usando il bit-packing.
        // 3 biy sono usati per l'intensità (0-7) e 5 bit per il tipo di blocco (0-31).
        this.data = new Uint8Array(N_vertices);

        // L'array delle maschere. Ho mantenuto questa struttura, anche se in un contesto
        // di Marching Cubes non è strettamente necessaria per l'occlusione delle facce
        // (la geometria è gestita dall'algoritmo), ma può avere altri scopi nel tuo progetto.
        this.masks = [
            new Uint8Array(113), new Uint8Array(113), new Uint8Array(113),
            new Uint8Array(113), new Uint8Array(113), new Uint8Array(113),
        ];
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
     * Imposta l'intensità (3 bit) e il tipo di blocco (5 bit) per un vertice.
     * @param {number} x - La coordinata x del vertice.
     * @param {number} y - La coordinata y del vertice.
     * @param {number} z - La coordinata z del vertice.
     * @param {number} intensity - Il valore di intensità (0-7).
     * @param {number} blockType - Il tipo di blocco (0-31).
     */
    setVoxel(x, y, z, intensity, blockType) {
        // Uniamo i due valori in un singolo byte utilizzando il bit-packing.
        // L'intensità viene spostata a sinistra di 5 bit, e unita al tipo di blocco.
        const value = (intensity << 5) | blockType;
        this.data[this.vertexIndex(x, y, z)] = value;
    }

    /**
     * Ottiene l'intensità di un vertice.
     * @param {number} x - La coordinata x del vertice.
     * @param {number} y - La coordinata y del vertice.
     * @param {number} z - La coordinata z del vertice.
     * @returns {number} Il valore di intensità (0-7).
     */
    getIntensity(x, y, z) {
        const value = this.data[this.vertexIndex(x, y, z)];
        // Spostiamo il byte a destra di 5 posizioni per isolare i primi 3 bit.
        return value >> 5;
    }

    /**
     * Ottiene il tipo di blocco di un vertice.
     * @param {number} x - La coordinata x del vertice.
     * @param {number} y - La coordinata y del vertice.
     * @param {number} z - La coordinata z del vertice.
     * @returns {number} Il tipo di blocco (0-31).
     */
    getBlockType(x, y, z) {
        const value = this.data[this.vertexIndex(x, y, z)];
        // Usiamo una maschera bitwise (00011111 in binario, che è 31 in decimale)
        // per isolare gli ultimi 5 bit.
        return value & 31;
    }

    // --- Metodi di Trasferimento ---
    // Questi metodi sono fondamentali per il trasferimento efficiente dei dati tra thread.

    /**
     * Prepara il chunk per il trasferimento tra Web Worker e thread principale.
     * Restituisce un oggetto con buffer trasferibili per evitare la copia dei dati.
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
            data: this.data.buffer,
            masks: this.masks.map(m => m.buffer),
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
        c.data = new Uint8Array(o.data);
        c.masks = o.masks.map(buf => new Uint8Array(buf));
        c.size = o.size;
        return c;
    }
}