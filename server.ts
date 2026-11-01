import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { SeasonMode } from './src/types/nba.ts';
import {
  getBootstrapPayload,
  getBootstrapWireBuffers,
  getFantasyEspnSyncPayload,
  getGameDayPayload,
  getMilestonesPayload,
  getPlayerInspectorDossier,
  getSinglePlayerSummary,
  getTeamRoster,
  scoutingEngine,
  searchLeaguePlayers,
  type BootstrapSerializedWireBuffers,
} from './src/server/nbaDataService.ts';
import {
  readManualFantasyStateFromDisk,
  writeManualFantasyStateToDisk,
} from './src/server/fantasyEspnService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = isProduction && process.env.PORT ? Number(process.env.PORT) : 3000;

function parseSeasonParam(raw: unknown): SeasonMode {
  const s = String(raw || '').trim();
  if (s === '2027' || s === '2026' || s === 'continuous') return s;
  return 'continuous';
}

function sendPreserializedJsonBuffers(
  req: express.Request,
  res: express.Response,
  buffers: BootstrapSerializedWireBuffers,
  cacheControl: string
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', cacheControl);

  const acceptEnc = String(req.headers['accept-encoding'] || '');
  if (acceptEnc.includes('gzip') && buffers.jsonBuffer.byteLength > 2048) {
    res.setHeader('Content-Encoding', 'gzip');
    res.send(buffers.gzipBuffer);
    return;
  }

  res.send(buffers.jsonBuffer);
}

const app = express();

app.use(express.json({ limit: '1mb' }));

// Healthcheck endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', name: 'RadarNBA', timestamp: new Date().toISOString() });
});

// 1. Bootstrap League Memory (Compact Wire v2 by default; ?wire=legacy optional)
app.get('/api/nba/bootstrap', async (req, res) => {
  try {
    const season = parseSeasonParam(req.query.seasonMode ?? req.query.season);
    const refresh = req.query.refresh === '1';

    if (req.query.wire === 'legacy') {
      const legacyPayload = await getBootstrapPayload(season, refresh);
      res.json(legacyPayload);
      return;
    }

    const buffers = await getBootstrapWireBuffers(season, refresh);
    const cacheControl = refresh
      ? 'no-store'
      : season === '2026'
      ? 'public, max-age=300, stale-while-revalidate=3600'
      : 'public, max-age=30, stale-while-revalidate=120';

    sendPreserializedJsonBuffers(req, res, buffers, cacheControl);
  } catch (err: any) {
    console.error('Error in /api/nba/bootstrap:', err);
    res.status(500).json({ error: err?.message || 'Error al cargar datos NBA.' });
  }
});

// 2. Directory Player Search
app.get('/api/nba/search', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const results = await searchLeaguePlayers(q);
    res.json({ results });
  } catch (err: any) {
    console.error('Error in /api/nba/search:', err);
    res.status(500).json({ error: err?.message || 'Error en búsqueda NBA.' });
  }
});

// 3. Single Player Summary On-Demand
app.get('/api/nba/player/:playerId', async (req, res) => {
  try {
    const season = parseSeasonParam(req.query.seasonMode ?? req.query.season);
    const player = await getSinglePlayerSummary(req.params.playerId, season);
    if (!player) {
      res.status(404).json({ error: 'Jugador no encontrado.' });
      return;
    }
    res.json({ player });
  } catch (err: any) {
    console.error('Error in /api/nba/player/:playerId:', err);
    res.status(500).json({ error: err?.message || 'Error al consultar jugador.' });
  }
});

// 3b. Multi-Season Player Inspector Dossier (2025-26 + 2026-27 + extended benchmarks)
app.get('/api/nba/player/:playerId/inspector', async (req, res) => {
  try {
    const dossier = await getPlayerInspectorDossier(req.params.playerId);
    if (!dossier) {
      res.status(404).json({ error: 'Jugador no encontrado.' });
      return;
    }
    res.json(dossier);
  } catch (err: any) {
    console.error('Error in /api/nba/player/:playerId/inspector:', err);
    res.status(500).json({ error: err?.message || 'Error al cargar ficha completa del jugador.' });
  }
});

// 4. Official Franchise Roster
app.get('/api/nba/team/:teamId/roster', async (req, res) => {
  try {
    const roster = await getTeamRoster(req.params.teamId);
    res.json({ roster });
  } catch (err: any) {
    console.error('Error in /api/nba/team/:teamId/roster:', err);
    res.status(500).json({ error: err?.message || 'Error al cargar plantilla.' });
  }
});

// 5. Inter-Season Milestones & Single-Game Records
app.get('/api/nba/milestones', async (req, res) => {
  try {
    const refresh = req.query.refresh === '1';
    const payload = await getMilestonesPayload(refresh);
    res.json(payload);
  } catch (err: any) {
    console.error('Error in /api/nba/milestones:', err);
    res.status(500).json({ error: err?.message || 'Error al calcular hitos.' });
  }
});

// 6. Game Day Analyzer Payload
app.get('/api/nba/gameday', async (req, res) => {
  try {
    const date = req.query.date ? String(req.query.date) : undefined;
    const refresh = req.query.refresh === '1';
    const payload = await getGameDayPayload(date, refresh);
    res.json(payload);
  } catch (err: any) {
    console.error('Error in /api/nba/gameday:', err);
    res.status(500).json({ error: err?.message || 'Error al analizar la jornada NBA.' });
  }
});

// 7. Daily Global Editorial Chronicle (Gemini + Grounded Press/Stats)
app.get('/api/nba/gameday/chronicle', async (req, res) => {
  try {
    const date = req.query.date ? String(req.query.date) : undefined;
    const refresh = req.query.refresh === '1';
    const payload = await scoutingEngine.buildGameDayChroniclePayload(date, refresh);
    res.json(payload);
  } catch (err: any) {
    console.error('Error in /api/nba/gameday/chronicle:', err);
    res.status(500).json({ error: err?.message || 'Error al generar crónica de la jornada.' });
  }
});

// 8. Official Match Boxscore, 22 Team Metrics, 20 Leaders & Next Games (06 · Próximos Partidos)
app.get('/api/nba/game/:eventId/boxscore', async (req, res) => {
  try {
    const refresh = req.query.refresh === '1';
    const report = await scoutingEngine.buildGameOfficialReportData(
      req.params.eventId,
      refresh
    );
    res.json(report);
  } catch (err: any) {
    console.error('Error in /api/nba/game/:eventId/boxscore:', err);
    res.status(500).json({ error: err?.message || 'Error al cargar acta oficial del partido.' });
  }
});

// 9. Match Tactical Scouting & Chronicle Narrative
app.get('/api/nba/game/:eventId/narrative', async (req, res) => {
  try {
    const refresh = req.query.refresh === '1';
    const narrative = await scoutingEngine.buildGameNarrativePayload(
      req.params.eventId,
      refresh
    );
    res.json(narrative);
  } catch (err: any) {
    console.error('Error in /api/nba/game/:eventId/narrative:', err);
    res.status(500).json({ error: err?.message || 'Error al redactar crónica del partido.' });
  }
});

// 10. Official NBA Weekly Schedule, Medical Reports & Manual Fantasy League State Persistence
app.get(['/api/nba/fantasy/context', '/api/nba/fantasy/espn'], async (req, res) => {
  try {
    const refresh = req.query.refresh === '1';
    const payload = await getFantasyEspnSyncPayload(refresh);
    res.json(payload);
  } catch (err: any) {
    console.error('Error in /api/nba/fantasy/context:', err);
    res.status(500).json({ error: err?.message || 'Error al cargar calendario y partes NBA para Fantasy.' });
  }
});

app.get('/api/nba/fantasy/manual-state', (_req, res) => {
  try {
    const state = readManualFantasyStateFromDisk();
    res.json({ state });
  } catch (err: any) {
    console.error('Error reading manual fantasy state:', err);
    res.status(500).json({ error: 'Error al leer estado guardado de la liga Fantasy.' });
  }
});

app.put('/api/nba/fantasy/manual-state', (req, res) => {
  try {
    const saved = writeManualFantasyStateToDisk(req.body);
    if (!saved) {
      res.status(400).json({ error: 'Formato de datos de liga Fantasy no válido.' });
      return;
    }
    res.json({ ok: true, state: saved });
  } catch (err: any) {
    console.error('Error saving manual fantasy state:', err);
    res.status(500).json({ error: 'Error al guardar permanentemente la liga Fantasy.' });
  }
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 RadarNBA Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

export default app;
