import 'dotenv/config';
import { syncCareerHistoryToDisk } from '../src/server/nbaCareerHistoryService.ts';

async function main() {
  const startedAt = Date.now();
  const res = await syncCareerHistoryToDisk({ verbose: true });
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[RadarNBA CareerSync] Finalizado en ${elapsedSec}s: ${res.playersWithHistory} jugadores · ${res.teamsCount} equipos · ${Math.round(
      res.bytesCompressed / 1024
    )} KB comprimido.`
  );
}

main().catch((err) => {
  console.error('[RadarNBA CareerSync] Error fatal:', err);
  process.exit(1);
});
