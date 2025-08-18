Appunti Palette:
Tipo di voxel:
Cubo Pieno, Lastra, Quarto di Blocco, Pilastro, Voxel Vuoto, Scala, Piano Inclinato, Angolo, Arco, Semicilindro, Corrimano, Voxel Trasparente, Cilindro, Cono, Voxel a Connessione Automatica.



perfetto—ti lascio una “scheda tecnica” sintetica ma precisa del formato che stiamo usando adesso (VOXL v5), con tipi, lunghezze, e layout di **region** e **chunk**. Ho incluso anche il dettaglio della **border mask 1-bit** (ordine facce e indicizzazione), e una nota sulla “variabile materiale nel chunk” (spoiler: non serve).

# VOXL v5 – Struttura file *region*

## Header di file (11 byte fissi)

| Offset | Nome       | Tipo          | Descrizione                            |
| -----: | ---------- | ------------- | -------------------------------------- |
|      0 | magic      | 4×char        | ASCII `"VOXL"`                         |
|      4 | version    | uint8         | Versione formato (es. `5`)             |
|      5 | dimX       | uint8         | Dimensione X di un chunk (es. `30`)    |
|      6 | dimY       | uint8         | Dimensione Y di un chunk (es. `30`)    |
|      7 | dimZ       | uint8         | Dimensione Z di un chunk (es. `30`)    |
|      8 | chunkCount | uint24 **BE** | Numero di chunk presenti nella regione |

> **Endianess**: i campi multi-byte nel file sono **big-endian** (BE).
> Esempio di lettura: `be24(u8, i) = (u8[i]<<16) | (u8[i+1]<<8) | u8[i+2]`.

## Indice chunk (chunkCount × 5 byte)

Per ogni chunk `i` (0..chunkCount-1):

| Campo  | Tipo          | Descrizione                                                      |
| ------ | ------------- | ---------------------------------------------------------------- |
| offset | uint24 **BE** | Offset assoluto nel file all’inizio dell’header del chunk        |
| size   | uint16 **BE** | Lunghezza totale del chunk (header + dati voxel + mask), in byte |

> Questo ti consente di saltare direttamente al chunk senza scorrere i precedenti.

---

# Struttura *chunk*

## ChunkHeader (lunghezza variabile, letta dal primo byte)

Esempio attuale (12 byte):

| Offset (rel.) | Nome       | Tipo  | Descrizione                                                           |
| ------------: | ---------- | ----- | --------------------------------------------------------------------- |
|             0 | hdrLen     | uint8 | **Lunghezza header** chunk in byte (es. `12`)                         |
|             1 | hdrVer     | uint8 | Versione header chunk (es. `1`)                                       |
|             2 | chunkType  | uint8 | Tipo chunk (es. `0=PRAIRIE`, `1=SKY`, `2=UNDERWATER`…)                |
|             3 | mediumType | uint8 | Medium predominante (es. aria/acqua) — per policy bordi, effetti ecc. |
|             4 | paletteId  | uint8 | Id palette (oggi non usato—noi generiamo la palette da `chunkType`)   |
|             5 | flags      | uint8 | Bit di stato (riservato: 0)                                           |
|             6 | waterLevel | uint8 | Livello acqua locale (se serve a gameplay/FX)                         |
|             7 | temp       | uint8 | Temperatura (placeholder)                                             |
|             8 | hum        | uint8 | Umidità (placeholder)                                                 |
| 9..(hdrLen-1) | reserved   | —     | Futuro/riservato                                                      |

> L’offset dei **dati voxel** è: `voxStart = chunkOffset + hdrLen`.

## Dati voxel (array 30×30×30 → 27000 byte)

* **Tipo**: `Uint8Array` di lunghezza `dimX*dimY*dimZ` (con le dimensioni del file header).
* **Semantica**: è il **valore locale (0..255)**.
  **Non è un materiale!** La conversione in “cosa si vede” avviene via **palette** → `blockStateId` → `typeId + materiali per faccia`.

Esempio: con la palette “prairie”

* `0 = Air`, `1 = Dirt`, `2 = Grass`, `3 = Rock`, `4 = Cloud`, `5 = Water`, …
* Se trovi `10`, decidi **cosa significhi** mappando `palette[10]` (es. `Rock` o `Water`).

## Border Mask (6 \* N\*N bit → 5400 bit → 675 byte)

* **Tipo**: bitfield compatto, 1 bit per cella su **ogni faccia del cubo** del chunk.

* **Ordine facce** (in bit, a blocchi da N×N):

  1. `+X` (PX / right) — **cella**: `i = y*N + z`
  2. `-X` (NX / left)  — `i = y*N + z`
  3. `+Y` (PY / top)   — `i = x*N + z`
  4. `-Y` (NY / bottom)— `i = x*N + z`
  5. `+Z` (PZ / front) — `i = x*N + y`
  6. `-Z` (NZ / back)  — `i = x*N + y`

* **Bit value**: `1 = disegna la faccia self verso l’esterno del chunk`, `0 = non disegnare`.

* **Calcolo dell’indice bit** (esattamente come nel mesher):

  ```js
  const FACE = { PX:0, NX:1, PY:2, NY:3, PZ:4, NZ:5 };
  const stride = N*N; // 900 con N=30
  function borderMaskIndex(face, x,y,z, N){
    let idxBase = 0, i = 0;
    switch(face){
      case FACE.PX: idxBase = 0*stride; i = y*N + z; break;
      case FACE.NX: idxBase = 1*stride; i = y*N + z; break;
      case FACE.PY: idxBase = 2*stride; i = x*N + z; break;
      case FACE.NY: idxBase = 3*stride; i = x*N + z; break;
      case FACE.PZ: idxBase = 4*stride; i = x*N + y; break;
      case FACE.NZ: idxBase = 5*stride; i = x*N + y; break;
    }
    return idxBase + i; // bit index nell’array di 675 byte
  }
  // Lettura bit:
  function getBorderBit(maskU8, bitIndex){
    const B = bitIndex>>3, o = bitIndex & 7;
    return ( (maskU8[B] >> o) & 1 );
  }
  ```

### Dimensioni complessive chunk (con N=30)

* **Header**: `hdrLen` (es. 12)
* **Voxels**: `30*30*30 = 27000` byte
* **Border mask**: `6*N*N / 8 = 5400/8 = 675` byte
* **Totale**: `hdrLen + 27000 + 675` (es. `12 + 27000 + 675 = 27687`)

---

## Nota sul “materiale nel chunk”

Avevamo valutato di aggiungere nel chunk un “materiale” (o simili). **Non serve** nel pipeline attuale:

* Il **valore locale (0..255)** del voxel è convertito dalla **palette** (`makePaletteForChunkType`) in `blockStateId`.
* Dal `blockStateId` deriviamo:

  * **typeId** (Air/Dirt/Grass/…)
  * **modello** (`getModelMeta`: CUBE, HALF\_SLAB…)
  * **materiale per faccia** (`getMaterialForFace` → `materialId` numerico)
* Il **materiale (texture/alpha/tint)** è poi risolto a runtime da `voxel_materials.js` con `getMaterial(materialId)`.

Quindi: **nessun campo “materiale”** è richiesto nei dati del chunk.
Se un domani ti serve un override “speciale” per una porzione (es. tint macro-bioma), meglio usare:

* un **campo di header** (es. `paletteId`/`biomeId`) che cambi la palette locale,
* oppure un **flag** nel `flags` (bitfield) interpretato a livello di gameplay/renderer.

---

## Riepilogo “in una riga”

* **Region**: `VOXL` + ver + `N` + `chunkCount` + indice (offset/size) → tanti **chunk**.
* **Chunk**: **header** (tipo/medium/… ) + **voxels** (`Uint8` 27k) + **mask** 1-bit (675 B).
* **Render**: **palette** → `blockStateId` → `type + model + materialIdPerFaccia` → `voxel_materials` (texture/alpha/tint).

Se vuoi, ti preparo un **README.md** pronto da incollare nel repo con questa tabella (così restano documentate anche le funzioni di `VoxelLib` che il mesher usa).
