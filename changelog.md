Creo questo file solo per comodità è per segnare quello che sto per fare.. 

TODO: ricordarsi di aumentare la distanza visiva, adesso  è molto bassa è stata utile in fase di test

adesso mi accingo a:
-Caricare i chunk solo dopo il completamento di updateVoxelWindow
-Rendere asincrono il trasferimento dei voxel in onRegionDataReady
-Tracciare e annullare i worker della generazione geometrica
-Rendere annullabile il trasferimento dei voxel in onRegionDataReady


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
