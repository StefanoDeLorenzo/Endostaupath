// validate_region.js (versione per browser)
import { Region } from "./src/world/region.js";
import { REGION_SCHEMA } from "./src/world/config.js";


/**
 * Verifica l'integrità e il contenuto di una regione.
 * @param {ArrayBuffer} buffer Il buffer del file .voxl
 * @param {string} fileName Il nome del file per i log
 * @returns {object} Oggetto risultato della verifica.
 */
export function verifyGeneratedRegion(buffer, fileName) {
  try {
    const region = Region.fromBuffer(new Uint8Array(buffer), { schema: REGION_SCHEMA });
    
    let totalVoxels = 0;
    const histograms = [];

    region.forEachChunk((chunk) => {
      if (chunk) {
        const histogram = chunk.histogram();
        histograms.push(histogram);
        const chunkVoxels = histogram.reduce((sum, count) => sum + count, 0);
        totalVoxels += chunkVoxels;
      }
    });

    const nonAirVoxelCount = histograms.reduce((sum, hist) => sum + hist[1] + hist[3] + hist[4], 0);
    
    if (totalVoxels > 0 && nonAirVoxelCount > 0) {
      return {
        success: true,
        message: `✅ La regione contiene dati validi e non è vuota! Voxel totali: ${totalVoxels}`
      };
    } else {
      return {
        success: false,
        message: `❌ Attenzione: La regione non contiene dati voxel validi. Voxel totali: ${totalVoxels}`
      };
    }

  } catch (error) {
    return {
      success: false,
      message: `Si è verificato un errore durante la verifica del file "${fileName}": ${error.message}`
    };
  }
}