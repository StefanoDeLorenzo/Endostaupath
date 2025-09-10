Creo questo file solo per comodità è per segnare quello che sto per fare.. 

TODO: 
- ricordarsi di aumentare la distanza visiva, adesso  è molto bassa è stata utile in fase di test
- implemetare l uso del SharedArrayBuffer per la copia dei dati dentro la VoxelWindow


adesso mi accingo a:
-Caricare i chunk solo dopo il completamento di updateVoxelWindow: - test OK
1. In `src/app/game.js` rendere `checkCameraPosition` una funzione `async`.
2. Sostituire la chiamata diretta a `updateVoxelWindow` con:

   ```js
   this.chunkManager.updateVoxelWindow(newRegionX, newRegionY, newRegionZ)
     .then(() => {
       const chunks = this.chunkManager.findChunksToLoad(this.player.position);
       if (chunks.length) this.chunkManager.loadMissingChunks(chunks);
     });
   ```
3. Nel `runRenderLoop` richiamare `checkCameraPosition` senza `await` (`void this.checkCameraPosition();`) per mantenere fluido il rendering.


-Rendere asincrono il trasferimento dei voxel in onRegionDataReady: ToDo (sarà difficile)
1. In src/world/chunkManager.js, dentro onRegionDataReady, spostare i cicli di copia (linee 416-451) in un Web Worker dedicato (type: "module") se necessario usando un transferable ArrayBuffer.

2. Aggiornare fetchAndStoreRegionData (src/io/worldLoader.js) affinché invochi un metodo asincrono che ritorna una Promise (no callback) e attenda il termine della copia.

3. Solo dopo la conferma che la regione è stata copiata, avviare il caricamento dei chunk; non cambiare l’indicizzazione/ordine esistenti.

DoD: nessun requestIdleCallback/setTimeout; worker module + transferable; fetchAndStoreRegionData/onRegionDataReady usano await; comportamento visivo invariato.


-Tracciare e annullare i worker della generazione geometrica: ToDo
-Rendere annullabile il trasferimento dei voxel in onRegionDataReady: ToDo


problemini vari (che forse non son problemi):

(1)
Chunk segnati come caricati anche se vuoti
In loadChunk, i chunk con shell completamente vuota vengono aggiunti a loadedChunks, impedendo nuovi tentativi dopo l’arrivo dei dati corretti

1. In `src/world/chunkManager.js` rimuovere `this.loadedChunks.add(chunkKey)` nel ramo `isChunkEmpty`.
2. Consentire a `loadChunk` di riprovare quando i dati della regione diventano disponibili.

(2)
Se l’indice di chunk locale rimane invariato, checkCameraPosition non ricarica i chunk della nuova regione, lasciando l’area vuota fino a un ulteriore spostamento: 

1. In `checkCameraPosition`, dopo aver aggiornato la regione, azzerare `this.lastChunk` oppure invocare subito `findChunksToLoad`.
2. Garantire che i chunk della nuova regione vengano caricati anche se gli indici locali coincidono con quelli precedenti.
