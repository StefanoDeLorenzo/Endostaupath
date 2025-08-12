# Endostaupath

## Stato di avanzamento del progetto DVE

Abbiamo impostato le basi per lo sviluppo di un gioco voxel utilizzando il **Divine Voxel Engine (DVE)**. L'obiettivo è creare una base solida e organizzata fin dall'inizio.

### 1\. Ambiente di Sviluppo

Abbiamo preparato l'ambiente di lavoro installando i seguenti strumenti essenziali:

  * **Node.js**: Il motore JavaScript su cui si basa l'intero ecosistema di DVE.
  * **Visual Studio Code**: L'editor di codice scelto per lo sviluppo.
  * **Git**: Per la gestione del controllo versione del progetto.

-----

### 2\. Creazione del Progetto

Abbiamo avviato il progetto `Endostaupath` con il seguente setup:

  * **Inizializzazione di NPM**: Abbiamo creato un file `package.json` per gestire le dipendenze del progetto.
  * **Installazione dei pacchetti DVE**: Abbiamo installato le librerie principali del motore, basandoci sulla documentazione più recente:
      * `@divinevoxel/vlox`: Il core del motore voxel per la gestione dei dati e del mondo.
      * `@divinevoxel/vlox-babylon`: Il renderer che usa la libreria **Babylon.js** per la grafica 3D.
      * `@dvegames/vlox`: Una libreria di componenti per lo sviluppo del gioco.
      * `@dvegames/vlox-tools`: Strumenti per creare pannelli di debug e utility.

in sistesi il comando da lanciare è questo
npm install @divinevoxel/vlox @divinevoxel/vlox-babylon @dvegames/vlox @dvegames/vlox-tools
-----

### 3\. Struttura Iniziale del Codice

È stata definita una struttura di cartelle iniziale per mantenere il progetto ordinato:

```
/Endostaupath
├── /src
│   ├── /game         (Contiene il codice di gioco principale)
│   ├── /assets       (Per texture, modelli e suoni)
│   ├── /utils        (Per funzioni di utilità)
├── package.json
├── tsconfig.json
├── .gitignore
```

-----

### 4\. Prossimi passi

Ora che l'ambiente è configurato e i pacchetti sono installati, possiamo procedere con l'implementazione del codice:

  * **Configurare TypeScript**: Creare un file `tsconfig.json` per la configurazione del compilatore.
  * **Scrivere il primo codice**: Creare un file `main.ts` per inizializzare il motore DVE e il renderer.
  * **Creare una pagina HTML**: Preparare il file `index.html` che ospiterà il canvas del gioco e l'interfaccia utente (UI).