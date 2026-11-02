import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import type { z } from 'zod';
import type { AdminSecurityConfigValues } from '../types/nba.ts';
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
} from './nbaDataService.ts';
import { readNbaSnapshotFromDisk } from './nbaSnapshotStore.ts';
import {
  readManualFantasyStateFromDisk,
  writeManualFantasyStateToDisk,
} from './fantasyEspnService.ts';
import {
  ADMIN_COOKIE_NAME,
  DEFAULT_ADMIN_SECURITY_VALUES,
  adminBruteForceLimiter,
  adminEndpointFloodLimiter,
  extractAdminTokenFromRequest,
  getAdminSecurityConfig,
  issueAdminSessionToken,
  nbaApiRateLimiter,
  nbaHeavyRefreshLimiter,
  requireAdminAuth,
  resetAdminBruteForceForRequest,
  resetAdminSecurityConfigToDefaults,
  resetAllRateLimitCounters,
  saveAdminSecurityConfig,
  verifyAdminPasscodeConstantTime,
  verifyAdminSessionToken,
} from './securityMiddleware.ts';
import {
  ADMIN_SECURITY_BOUNDS,
  adminLoginBodySchema,
  adminSecurityConfigBodySchema,
  bootstrapQuerySchema,
  emptyQuerySchema,
  gameEventParamsSchema,
  gamedayQuerySchema,
  getValidated,
  manualFantasyStateBodySchema,
  playerParamsSchema,
  playerSummaryQuerySchema,
  refreshOnlyQuerySchema,
  searchQuerySchema,
  teamParamsSchema,
  validateRequest,
} from './validationSchemas.ts';

const isProduction =
  process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const isVercelDeployment = Boolean(process.env.VERCEL);

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

export const app = express();

app.disable('x-powered-by');

// Trust first reverse-proxy hop (Cloud Run / Vercel) for accurate client IP detection
app.set('trust proxy', 1);

// Strict HTTP Security Headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Frameguard)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isProduction
          ? ["'self'", "'unsafe-inline'"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://cdn.nba.com',
          'https://ak-static.cms.nba.com',
          'https://a.espncdn.com',
          'https:',
        ],
        connectSrc: isProduction ? ["'self'"] : ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: isVercelDeployment
          ? ["'self'"]
          : [
              "'self'",
              'https://aistudio.google.com',
              'https://*.google.com',
              'https://*.googleusercontent.com',
              'https://*.run.app',
            ],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    frameguard: isVercelDeployment ? { action: 'sameorigin' } : false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: isVercelDeployment ? { policy: 'same-origin' } : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    dnsPrefetchControl: { allow: true },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: false,
    },
  })
);

// Compatibility guard if a serverless wrapper pre-populated req.body as a plain value
app.use((req, _res, next) => {
  const desc = Object.getOwnPropertyDescriptor(req, 'body');
  if (
    desc &&
    'value' in desc &&
    desc.value !== undefined &&
    typeof desc.value === 'object' &&
    desc.value !== null &&
    !(req as unknown as { _body?: boolean })._body
  ) {
    (req as unknown as { _body?: boolean })._body = true;
  }
  next();
});

app.use(express.json({ limit: '512kb' }));

// Handle malformed JSON bodies cleanly without leaking stack traces
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        error: 'Cuerpo JSON mal formado.',
        code: 'INVALID_JSON_BODY',
      });
      return;
    }
    next(err);
  }
);

// Protect all /api/nba/* endpoints and /admin routes with server-side rate limiters
app.use('/api/nba', nbaApiRateLimiter, nbaHeavyRefreshLimiter);
app.use('/api/admin', adminEndpointFloodLimiter);
app.get('/admin', adminEndpointFloodLimiter, (_req, _res, next) => {
  next();
});

// Healthcheck endpoint
app.get('/api/health', (_req, res) => {
  const snap = readNbaSnapshotFromDisk();
  res.json({
    status: 'ok',
    name: 'RadarNBA',
    runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
    snapshotLoaded: Boolean(snap),
    snapshotGeneratedAt: snap?.generatedAt || null,
    timestamp: new Date().toISOString(),
  });
});

// 0. Private /admin Authentication & Security Configuration Endpoints
app.post(
  '/api/admin/login',
  adminBruteForceLimiter,
  validateRequest({ query: emptyQuerySchema, body: adminLoginBodySchema }),
  async (req, res) => {
    try {
      const { body } = getValidated<
        Record<string, never>,
        Record<string, never>,
        z.infer<typeof adminLoginBodySchema>
      >(req);

      const isValid = verifyAdminPasscodeConstantTime(body.passcode);

      if (!isValid) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        res.status(401).json({
          ok: false,
          error: 'Clave incorrecta. Inténtalo de nuevo.',
        });
        return;
      }

      resetAdminBruteForceForRequest(req);

      const { token, expiresAt } = issueAdminSessionToken();
      const maxAgeSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));
      const secureCookie = isProduction ? '; Secure' : '';
      res.setHeader(
        'Set-Cookie',
        `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secureCookie}`
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, token, expiresAt });
    } catch (err: any) {
      console.error('Error in /api/admin/login:', err);
      res.status(500).json({ ok: false, error: 'Error al verificar credenciales.' });
    }
  }
);

app.get(
  '/api/admin/session',
  validateRequest({ query: emptyQuerySchema }),
  (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = extractAdminTokenFromRequest(req);
    const check = verifyAdminSessionToken(token);
    if (!check.valid) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, expiresAt: check.expiresAt });
  }
);

app.post(
  '/api/admin/logout',
  validateRequest({ query: emptyQuerySchema }),
  (_req, res) => {
    const secureCookie = isProduction ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureCookie}`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  }
);

// 0b. Editable Security & Rate-Limiting Configuration inside /admin
app.get(
  '/api/admin/security-config',
  requireAdminAuth,
  validateRequest({ query: emptyQuerySchema }),
  (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      config: getAdminSecurityConfig(),
      defaults: DEFAULT_ADMIN_SECURITY_VALUES,
      bounds: ADMIN_SECURITY_BOUNDS,
    });
  }
);

app.put(
  '/api/admin/security-config',
  requireAdminAuth,
  validateRequest({
    query: emptyQuerySchema,
    body: adminSecurityConfigBodySchema,
  }),
  (req, res) => {
    try {
      const { body } = getValidated<
        Record<string, never>,
        Record<string, never>,
        AdminSecurityConfigValues
      >(req);
      const saved = saveAdminSecurityConfig(body);
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        config: saved,
        defaults: DEFAULT_ADMIN_SECURITY_VALUES,
      });
    } catch (err: any) {
      console.error('Error in PUT /api/admin/security-config:', err);
      res
        .status(500)
        .json({ ok: false, error: 'No se pudo guardar la configuración de seguridad.' });
    }
  }
);

app.post(
  '/api/admin/security-config/reset-defaults',
  requireAdminAuth,
  validateRequest({ query: emptyQuerySchema }),
  (_req, res) => {
    try {
      const restored = resetAdminSecurityConfigToDefaults();
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        config: restored,
        defaults: DEFAULT_ADMIN_SECURITY_VALUES,
      });
    } catch (err: any) {
      console.error('Error in POST /api/admin/security-config/reset-defaults:', err);
      res
        .status(500)
        .json({ ok: false, error: 'No se pudieron restaurar los valores base.' });
    }
  }
);

app.post(
  '/api/admin/security-config/reset-counters',
  requireAdminAuth,
  validateRequest({ query: emptyQuerySchema }),
  (_req, res) => {
    try {
      resetAllRateLimitCounters();
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, clearedAt: Date.now() });
    } catch (err: any) {
      console.error('Error in POST /api/admin/security-config/reset-counters:', err);
      res
        .status(500)
        .json({ ok: false, error: 'No se pudieron reiniciar los contadores IP.' });
    }
  }
);

// 1. Bootstrap League Memory (Compact Wire v2 by default; ?wire=legacy optional)
app.get(
  '/api/nba/bootstrap',
  validateRequest({ query: bootstrapQuerySchema }),
  async (req, res) => {
    try {
      const { query } = getValidated<
        Record<string, never>,
        z.infer<typeof bootstrapQuerySchema>
      >(req);
      const { seasonMode: season, refresh, wire } = query;

      if (wire === 'legacy') {
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
  }
);

// 2. Directory Player Search
app.get(
  '/api/nba/search',
  validateRequest({ query: searchQuerySchema }),
  async (req, res) => {
    try {
      const { query } = getValidated<
        Record<string, never>,
        z.infer<typeof searchQuerySchema>
      >(req);
      const results = await searchLeaguePlayers(query.q);
      res.json({ results });
    } catch (err: any) {
      console.error('Error in /api/nba/search:', err);
      res.status(500).json({ error: err?.message || 'Error en búsqueda NBA.' });
    }
  }
);

// 3. Single Player Summary On-Demand
app.get(
  '/api/nba/player/:playerId',
  validateRequest({
    params: playerParamsSchema,
    query: playerSummaryQuerySchema,
  }),
  async (req, res) => {
    try {
      const { params, query } = getValidated<
        z.infer<typeof playerParamsSchema>,
        z.infer<typeof playerSummaryQuerySchema>
      >(req);
      const player = await getSinglePlayerSummary(
        params.playerId,
        query.seasonMode
      );
      if (!player) {
        res.status(404).json({ error: 'Jugador no encontrado.' });
        return;
      }
      res.json({ player });
    } catch (err: any) {
      console.error('Error in /api/nba/player/:playerId:', err);
      res.status(500).json({ error: err?.message || 'Error al consultar jugador.' });
    }
  }
);

// 3b. Multi-Season Player Inspector Dossier (2025-26 + 2026-27 + extended benchmarks)
app.get(
  '/api/nba/player/:playerId/inspector',
  validateRequest({
    params: playerParamsSchema,
    query: emptyQuerySchema,
  }),
  async (req, res) => {
    try {
      const { params } = getValidated<z.infer<typeof playerParamsSchema>>(req);
      const dossier = await getPlayerInspectorDossier(params.playerId);
      if (!dossier) {
        res.status(404).json({ error: 'Jugador no encontrado.' });
        return;
      }
      res.json(dossier);
    } catch (err: any) {
      console.error('Error in /api/nba/player/:playerId/inspector:', err);
      res
        .status(500)
        .json({ error: err?.message || 'Error al cargar ficha completa del jugador.' });
    }
  }
);

// 4. Official Franchise Roster
app.get(
  '/api/nba/team/:teamId/roster',
  validateRequest({
    params: teamParamsSchema,
    query: emptyQuerySchema,
  }),
  async (req, res) => {
    try {
      const { params } = getValidated<z.infer<typeof teamParamsSchema>>(req);
      const roster = await getTeamRoster(params.teamId);
      res.json({ roster });
    } catch (err: any) {
      console.error('Error in /api/nba/team/:teamId/roster:', err);
      res.status(500).json({ error: err?.message || 'Error al cargar plantilla.' });
    }
  }
);

// 5. Inter-Season Milestones & Single-Game Records
app.get(
  '/api/nba/milestones',
  validateRequest({ query: refreshOnlyQuerySchema }),
  async (req, res) => {
    try {
      const { query } = getValidated<
        Record<string, never>,
        z.infer<typeof refreshOnlyQuerySchema>
      >(req);
      const payload = await getMilestonesPayload(Boolean(query.refresh));
      res.json(payload);
    } catch (err: any) {
      console.error('Error in /api/nba/milestones:', err);
      res.status(500).json({ error: err?.message || 'Error al calcular hitos.' });
    }
  }
);

// 6. Game Day Analyzer Payload
app.get(
  '/api/nba/gameday',
  validateRequest({ query: gamedayQuerySchema }),
  async (req, res) => {
    try {
      const { query } = getValidated<
        Record<string, never>,
        z.infer<typeof gamedayQuerySchema>
      >(req);
      const payload = await getGameDayPayload(
        query.date,
        Boolean(query.refresh)
      );
      res.json(payload);
    } catch (err: any) {
      console.error('Error in /api/nba/gameday:', err);
      res.status(500).json({ error: err?.message || 'Error al analizar la jornada NBA.' });
    }
  }
);

// 7. Daily Global Editorial Chronicle (Gemini + Grounded Press/Stats)
app.get(
  '/api/nba/gameday/chronicle',
  validateRequest({ query: gamedayQuerySchema }),
  async (req, res) => {
    try {
      const { query } = getValidated<
        Record<string, never>,
        z.infer<typeof gamedayQuerySchema>
      >(req);
      const payload = await scoutingEngine.buildGameDayChroniclePayload(
        query.date,
        Boolean(query.refresh)
      );
      res.json(payload);
    } catch (err: any) {
      console.error('Error in /api/nba/gameday/chronicle:', err);
      res
        .status(500)
        .json({ error: err?.message || 'Error al generar crónica de la jornada.' });
    }
  }
);

// 8. Official Match Boxscore, 22 Team Metrics, 20 Leaders & Next Games
app.get(
  '/api/nba/game/:eventId/boxscore',
  validateRequest({
    params: gameEventParamsSchema,
    query: refreshOnlyQuerySchema,
  }),
  async (req, res) => {
    try {
      const { params, query } = getValidated<
        z.infer<typeof gameEventParamsSchema>,
        z.infer<typeof refreshOnlyQuerySchema>
      >(req);
      const report = await scoutingEngine.buildGameOfficialReportData(
        params.eventId,
        Boolean(query.refresh)
      );
      res.json(report);
    } catch (err: any) {
      console.error('Error in /api/nba/game/:eventId/boxscore:', err);
      res
        .status(500)
        .json({ error: err?.message || 'Error al cargar acta oficial del partido.' });
    }
  }
);

// 9. Match Tactical Scouting & Chronicle Narrative
app.get(
  '/api/nba/game/:eventId/narrative',
  validateRequest({
    params: gameEventParamsSchema,
    query: refreshOnlyQuerySchema,
  }),
  async (req, res) => {
    try {
      const { params, query } = getValidated<
        z.infer<typeof gameEventParamsSchema>,
        z.infer<typeof refreshOnlyQuerySchema>
      >(req);
      const narrative = await scoutingEngine.buildGameNarrativePayload(
        params.eventId,
        Boolean(query.refresh)
      );
      res.json(narrative);
    } catch (err: any) {
      console.error('Error in /api/nba/game/:eventId/narrative:', err);
      res
        .status(500)
        .json({ error: err?.message || 'Error al redactar crónica del partido.' });
    }
  }
);

// 10. Official NBA Weekly Schedule, Medical Reports & Manual Fantasy League State Persistence (Admin Protected)
app.get(
  ['/api/nba/fantasy/context', '/api/nba/fantasy/espn'],
  requireAdminAuth,
  validateRequest({ query: refreshOnlyQuerySchema }),
  async (req, res) => {
    try {
      const { query } = getValidated<
        Record<string, never>,
        z.infer<typeof refreshOnlyQuerySchema>
      >(req);
      const payload = await getFantasyEspnSyncPayload(Boolean(query.refresh));
      res.json(payload);
    } catch (err: any) {
      console.error('Error in /api/nba/fantasy/context:', err);
      res
        .status(500)
        .json({ error: err?.message || 'Error al cargar calendario y partes NBA para Fantasy.' });
    }
  }
);

app.get(
  '/api/nba/fantasy/manual-state',
  requireAdminAuth,
  validateRequest({ query: emptyQuerySchema }),
  (_req, res) => {
    try {
      const state = readManualFantasyStateFromDisk();
      res.json({ state });
    } catch (err: any) {
      console.error('Error reading manual fantasy state:', err);
      res
        .status(500)
        .json({ error: 'Error al leer estado guardado de la liga Fantasy.' });
    }
  }
);

app.put(
  '/api/nba/fantasy/manual-state',
  requireAdminAuth,
  validateRequest({
    query: emptyQuerySchema,
    body: manualFantasyStateBodySchema,
  }),
  (req, res) => {
    try {
      const { body } = getValidated<
        Record<string, never>,
        Record<string, never>,
        z.infer<typeof manualFantasyStateBodySchema>
      >(req);
      const saved = writeManualFantasyStateToDisk(body);
      if (!saved) {
        res.status(400).json({ error: 'Formato de datos de liga Fantasy no válido.' });
        return;
      }
      res.json({ ok: true, state: saved });
    } catch (err: any) {
      console.error('Error saving manual fantasy state:', err);
      res
        .status(500)
        .json({ error: 'Error al guardar permanentemente la liga Fantasy.' });
    }
  }
);

// Explicit JSON 404 handler for unknown /api/* routes (prevents HTML 404 responses)
app.use('/api', (_req, res) => {
  res.status(404).json({
    error: 'Ruta de API no encontrada.',
    code: 'API_ROUTE_NOT_FOUND',
  });
});

// Global Express JSON error handler for /api/* routes
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (String(req.url || '').startsWith('/api')) {
      console.error('[RadarNBA API Unhandled Error]:', err);
      res.status(500).json({
        error: err?.message || 'Error interno del servidor de estadísticas.',
        code: 'INTERNAL_API_ERROR',
      });
      return;
    }
    next(err);
  }
);

export default app;
