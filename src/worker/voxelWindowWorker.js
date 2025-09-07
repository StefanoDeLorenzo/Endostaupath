self.onmessage = (event) => {
  const { regionBuffer, rx, ry, rz, REGION_SCHEMA, id } = event.data;
  const { GRID, CHUNK_SIZE, REGION_SPAN } = REGION_SCHEMA;

  const regionSpan = REGION_SPAN;
  const regionVolume = regionSpan * regionSpan * regionSpan;
  const regionData = new Uint8Array(regionVolume);

  if (regionBuffer && regionBuffer.byteLength > 0) {
    const dv = new DataView(regionBuffer);
    const headerSize = 11;
    const CHUNK_BYTES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

    for (let cx = 0; cx < GRID; cx++) {
      for (let cy = 0; cy < GRID; cy++) {
        for (let cz = 0; cz < GRID; cz++) {
          const idx = ((cx * GRID) + cy) * GRID + cz;
          const off = headerSize + idx * 5;
          const chunkFileOffset =
            (dv.getUint8(off) << 16) | (dv.getUint8(off + 1) << 8) | dv.getUint8(off + 2);
          if (chunkFileOffset === 0) continue;

          const chunkBuffer = regionBuffer.slice(chunkFileOffset, chunkFileOffset + CHUNK_BYTES);
          const chunkData = new Uint8Array(chunkBuffer);

          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let y = 0; y < CHUNK_SIZE; y++) {
              const srcStart = (z * CHUNK_SIZE + y) * CHUNK_SIZE;
              const destStart = ((cz * CHUNK_SIZE + z) * regionSpan + (cy * CHUNK_SIZE + y)) * regionSpan + (cx * CHUNK_SIZE);
              regionData.set(chunkData.subarray(srcStart, srcStart + CHUNK_SIZE), destStart);
            }
          }
        }
      }
    }
  }

  self.postMessage({ type: 'regionCopied', id, rx, ry, rz, regionData }, [regionData.buffer]);
};
