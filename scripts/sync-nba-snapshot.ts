import 'dotenv/config';
import { syncNbaSnapshotToDisk } from '../src/server/nbaDataService.ts';

async function main() {
  const forceFull2026 = process.argv.includes('--full');
  const startedAt = Date.now();
  console.log(
    `[RadarNBA Sync] Iniciando sincronización oficial NBA (${
      forceFull2026 ? 'completa 2025-26 + 2026-27' : 'incremental 2026-27 + CDN'
    })...`
  );

  const result = await syncNbaSnapshotToDisk({ forceFull2026 });
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const mbCompressed = (result.bytesCompressed / (1024 * 1024)).toFixed(2);
  const mbRaw = (result.bytesUncompressed / (1024 * 1024)).toFixed(2);

  console.log(`[RadarNBA Sync] Snapshot guardado con éxito en ${elapsedSec}s:`);
  console.log(`  - Archivo: ${result.filePath}`);
  console.log(`  - Tamaño: ${mbCompressed} MB comprimido (${mbRaw} MB JSON bruto)`);
  console.log(`  - Fuente activa: ${result.lastSyncedSource}`);
  console.log(`  - Fichas biográficas NBA: ${result.biosCount}`);
  console.log(
    `  - Temporada 2025-26: ${result.players2026} jugadores · ${result.teamGames2026} partidos`
  );
  console.log(
    `  - Temporada 2026-27: ${result.players2027} jugadores · ${result.teamGames2027} partidos`
  );
}

main().catch((err) => {
  console.error('[RadarNBA Sync] Error abortado de forma segura (no se sobrescribió el snapshot):', err);
  process.exit(1);
});
