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

  console.log(`[RadarNBA Sync] Snapshots modulares guardados con éxito en ${elapsedSec}s:`);
  console.log(`  - Temporada activa (2026-27): ${result.filePath}`);
  if ((result as any).biosFilePath) {
    console.log(`  - Fichas biográficas (Micro-Snapshot): ${(result as any).biosFilePath}`);
  }
  console.log(`  - Tamaño reescrito hoy: ${mbCompressed} MB comprimido (${mbRaw} MB JSON bruto)`);
  console.log(`  - Fuente activa: ${result.lastSyncedSource}`);
  console.log(`  - Fichas biográficas NBA: ${result.biosCount}`);
  console.log(
    `  - Temporada 2025-26: ${result.players2026} jugadores · ${result.teamGames2026} partidos`
  );
  console.log(
    `  - Temporada 2026-27: ${result.players2027} jugadores · ${result.teamGames2027} partidos`
  );
  if (result.advancedSnapshot) {
    const advKbGz = Math.round(result.advancedSnapshot.bytesCompressed / 1024);
    const advKbJson = Math.round(result.advancedSnapshot.bytesUncompressed / 1024);
    console.log(`[RadarNBA Sync] Snapshots Avanzados + Micro-Snapshot Heroic Shots guardados con éxito:`);
    console.log(`  - Archivo completo (con Lineups): ${result.advancedSnapshot.filePath}`);
    if ((result.advancedSnapshot as any).coreFilePath) {
      console.log(`  - Archivo Core ligero (8 capas + On/Off + Benchmarks): ${(result.advancedSnapshot as any).coreFilePath}`);
    }
    if ((result.advancedSnapshot as any).heroicShotsFilePath) {
      console.log(`  - Micro-Snapshot Buzzer Beaters & Game Winners: ${(result.advancedSnapshot as any).heroicShotsFilePath}`);
    }
    console.log(`  - Tamaño total avanzado: ${advKbGz} KB gzip (${advKbJson} KB JSON)`);
    console.log(`  - Jugadores / Equipos Zonas: ${result.advancedSnapshot.itemsCount.playerShotZones} / ${result.advancedSnapshot.itemsCount.teamShotZones}`);
    console.log(`  - Jugadores / Equipos Clutch: ${result.advancedSnapshot.itemsCount.playerClutch} / ${result.advancedSnapshot.itemsCount.teamClutch}`);
    console.log(`  - Jugadores / Equipos Defensa & Hustle: ${result.advancedSnapshot.itemsCount.playerDefenseHustle} / ${result.advancedSnapshot.itemsCount.teamDefenseHustle}`);
    console.log(`  - Jugadores / Equipos Tracking Óptico: ${result.advancedSnapshot.itemsCount.playerTracking} / ${result.advancedSnapshot.itemsCount.teamTracking}`);
    console.log(`  - Jugadores / Equipos Synergy Playtypes: ${result.advancedSnapshot.itemsCount.playerPlaytypes} / ${result.advancedSnapshot.itemsCount.teamPlaytypes}`);
    console.log(`  - Jugadores / Equipos Scoring Splits: ${result.advancedSnapshot.itemsCount.playerScoring} / ${result.advancedSnapshot.itemsCount.teamScoring}`);
    console.log(`  - Jugadores / Equipos 4 Factores: ${result.advancedSnapshot.itemsCount.playerFourFactors} / ${result.advancedSnapshot.itemsCount.teamFourFactors}`);
    console.log(`  - Jugadores / Equipos Infracciones & Violations: ${result.advancedSnapshot.itemsCount.playerViolations} / ${result.advancedSnapshot.itemsCount.teamViolations}`);
    console.log(`  - Alineaciones 5-Man / 3-Man / 2-Man: ${result.advancedSnapshot.itemsCount.lineups5} / ${result.advancedSnapshot.itemsCount.lineups3} / ${result.advancedSnapshot.itemsCount.lineups2}`);
    console.log(`  - Buzzer Beaters & Game Winners verificados: ${result.advancedSnapshot.itemsCount.heroicShotsCount}`);
    console.log(`  - Equipos con On/Off Court Splits: ${result.advancedSnapshot.itemsCount.teamsWithOnOff}`);
    console.log(`  - Benchmarks NBA (Jugador / Equipo): ${result.advancedSnapshot.itemsCount.playerBenchmarks} / ${result.advancedSnapshot.itemsCount.teamBenchmarks}`);
  }
}

main().catch((err) => {
  console.error('[RadarNBA Sync] Error abortado de forma segura (no se sobrescribió el snapshot):', err);
  process.exit(1);
});
