// @ts-nocheck
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import zlib from "zlib";
import { getBootstrapPayload, getBootstrapWireBuffers, getFantasyEspnSyncPayload, getGameDayPayload, getMilestonesPayload, getPlayerInspectorDossier, getSeasonAwardsPayload, getScoreboardDeltaPayload, getSinglePlayerSummary, getTeamRoster, scoutingEngine, searchLeaguePlayers } from "./nbaDataService.ts";
import { readNbaSnapshotFromDisk } from "./nbaSnapshotStore.ts";
import { getFantasyStorageBackendInfo, readManualFantasyState, writeManualFantasyState } from "./fantasyEspnService.ts";
import { DEFAULT_ADMIN_SECURITY_VALUES, adminBruteForceLimiter, adminEndpointFloodLimiter, buildAdminSessionCookieHeader, buildClearAdminSessionCookieHeader, extractAdminTokenFromRequest, getAdminAuthReadiness, getAdminSecurityConfig, getRateLimitBackendInfo, issueAdminSessionToken, nbaApiRateLimiter, nbaHeavyRefreshLimiter, recordAdminLoginFailure, requireAdminAuth, requireAdminCsrfProtection, resetAdminBruteForceForRequest, resetAdminSecurityConfigToDefaults, resetAllRateLimitCounters, saveAdminSecurityConfig, verifyAdminPasscodeConstantTime, verifyAdminSessionToken } from "./securityMiddleware.ts";
import { ADMIN_SECURITY_BOUNDS, adminLoginBodySchema, adminSecurityConfigBodySchema, awardsQuerySchema, bootstrapQuerySchema, emptyQuerySchema, gameEventParamsSchema, gamedayQuerySchema, getValidated, manualFantasyStateBodySchema, playerParamsSchema, playerSummaryQuerySchema, refreshOnlyQuerySchema, searchQuerySchema, teamParamsSchema, validateRequest } from "./validationSchemas.ts";
import { getAllCircuitMetrics, resetCircuit } from "./circuitBreaker.ts";
import { expressTelemetryMiddleware, getTelemetrySummary } from "./telemetryLogger.ts";
import { getEasternTodayIso } from "../utils/staticSchedule.ts";
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const isVercelDeployment = Boolean(process.env.VERCEL);
function sendPreserializedJsonBuffers(req, res, buffers, cacheControl) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("Cache-Control", cacheControl);
  const acceptEnc = String(req.headers["accept-encoding"] || "");
  if (acceptEnc.includes("gzip") && buffers.jsonBuffer.byteLength > 2048) {
    res.setHeader("Content-Encoding", "gzip");
    res.send(buffers.gzipBuffer);
    return;
  }
  res.send(buffers.jsonBuffer);
}
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { defaultSrc: ["'self'"], scriptSrc: isProduction ? ["'self'", "'unsafe-inline'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"], styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"], imgSrc: ["'self'", "data:", "blob:", "https://cdn.nba.com", "https://ak-static.cms.nba.com", "https://a.espncdn.com", "https:"], connectSrc: isProduction ? ["'self'"] : ["'self'", "ws:", "wss:"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: isVercelDeployment ? ["'self'"] : ["'self'", "https://aistudio.google.com", "https://*.google.com", "https://*.googleusercontent.com", "https://*.run.app"], upgradeInsecureRequests: isProduction ? [] : null } }, frameguard: isVercelDeployment ? { action: "sameorigin" } : false, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: isVercelDeployment ? { policy: "same-origin" } : false, crossOriginResourcePolicy: { policy: "cross-origin" }, dnsPrefetchControl: { allow: true }, referrerPolicy: { policy: "same-origin" }, strictTransportSecurity: { maxAge: 31536e3, includeSubDomains: true, preload: false } }));
app.use((req, _res, next) => {
  const desc = Object.getOwnPropertyDescriptor(req, "body");
  if (desc && "value" in desc && desc.value !== void 0 && typeof desc.value === "object" && desc.value !== null && !req._body) {
    req._body = true;
  }
  next();
});
app.use(express.json({ limit: "512kb" }));
app.use(expressTelemetryMiddleware);
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Cuerpo JSON mal formado.", code: "INVALID_JSON_BODY" });
    return;
  }
  next(err);
});
app.use("/api/nba", nbaApiRateLimiter, nbaHeavyRefreshLimiter);
app.use("/api/admin", adminEndpointFloodLimiter);
app.get("/admin", adminEndpointFloodLimiter, (_req, _res, next) => {
  next();
});
app.get("/api/health", (_req, res) => {
  const snap = readNbaSnapshotFromDisk();
  res.json({ status: "ok", name: "RadarNBA", runtime: process.env.VERCEL ? "vercel-serverless" : "node-server", snapshotLoaded: Boolean(snap), snapshotGeneratedAt: snap?.generatedAt || null, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.post("/api/admin/login", requireAdminCsrfProtection, adminBruteForceLimiter, validateRequest({ query: emptyQuerySchema, body: adminLoginBodySchema }), async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const readiness = getAdminAuthReadiness();
    if (!readiness.configured) {
      res.status(503).json({
        ok: false,
        code: readiness.code || "ADMIN_ENV_NOT_CONFIGURED",
        error: readiness.reason || "Acceso administrativo deshabilitado por seguridad: variables de entorno no configuradas."
      });
      return;
    }
    const { body } = getValidated(req);
    const isValid = await verifyAdminPasscodeConstantTime(body.passcode);
    if (!isValid) {
      await recordAdminLoginFailure(req);
      await new Promise((resolve) => setTimeout(resolve, 250));
      res.status(401).json({ ok: false, error: "Clave incorrecta. Int\xE9ntalo de nuevo." });
      return;
    }
    await resetAdminBruteForceForRequest(req);
    const { token, expiresAt } = issueAdminSessionToken();
    const maxAgeSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1e3));
    res.setHeader("Set-Cookie", buildAdminSessionCookieHeader(token, maxAgeSec, req));
    res.json({ ok: true, expiresAt });
  } catch (err) {
    console.error("Error in /api/admin/login:", err);
    res.status(500).json({ ok: false, error: "Error al verificar credenciales." });
  }
});
app.get("/api/admin/session", validateRequest({ query: emptyQuerySchema }), (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const readiness = getAdminAuthReadiness();
  if (!readiness.configured) {
    res.status(503).json({ authenticated: false, code: readiness.code || "ADMIN_ENV_NOT_CONFIGURED" });
    return;
  }
  const token = extractAdminTokenFromRequest(req);
  const check = verifyAdminSessionToken(token);
  if (!check.valid) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, expiresAt: check.expiresAt });
});
app.post("/api/admin/logout", requireAdminCsrfProtection, validateRequest({ query: emptyQuerySchema }), (req, res) => {
  res.setHeader("Set-Cookie", buildClearAdminSessionCookieHeader(req));
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true });
});
app.get("/api/admin/security-config", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    const config = await getAdminSecurityConfig();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config, defaults: DEFAULT_ADMIN_SECURITY_VALUES, bounds: ADMIN_SECURITY_BOUNDS, circuits: getAllCircuitMetrics(), ...getRateLimitBackendInfo() });
  } catch (err) {
    console.error("Error in GET /api/admin/security-config:", err);
    res.status(500).json({ ok: false, error: "No se pudo leer la configuración de seguridad." });
  }
});
app.put("/api/admin/security-config", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: adminSecurityConfigBodySchema }), async (req, res) => {
  try {
    const { body } = getValidated(req);
    const saved = await saveAdminSecurityConfig(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: saved, defaults: DEFAULT_ADMIN_SECURITY_VALUES, circuits: getAllCircuitMetrics(), ...getRateLimitBackendInfo() });
  } catch (err) {
    console.error("Error in PUT /api/admin/security-config:", err);
    res.status(500).json({ ok: false, error: "No se pudo guardar la configuración de seguridad." });
  }
});
app.post("/api/admin/security-config/reset-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    const restored = await resetAdminSecurityConfigToDefaults();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: restored, defaults: DEFAULT_ADMIN_SECURITY_VALUES, circuits: getAllCircuitMetrics(), ...getRateLimitBackendInfo() });
  } catch (err) {
    console.error("Error in POST /api/admin/security-config/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudieron restaurar los valores base." });
  }
});
app.post("/api/admin/security-config/reset-counters", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    await resetAllRateLimitCounters();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, clearedAt: Date.now(), circuits: getAllCircuitMetrics(), ...getRateLimitBackendInfo() });
  } catch (err) {
    console.error("Error in POST /api/admin/security-config/reset-counters:", err);
    res.status(500).json({ ok: false, error: "No se pudieron reiniciar los contadores IP." });
  }
});
app.get("/api/admin/circuit-breaker", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, circuits: getAllCircuitMetrics() });
});
app.post("/api/admin/circuit-breaker/reset", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  resetCircuit();
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, clearedAt: Date.now(), circuits: getAllCircuitMetrics() });
});
app.get("/api/admin/telemetry", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, telemetry: getTelemetrySummary(getAllCircuitMetrics()) });
});
app.get("/api/nba/bootstrap", validateRequest({ query: bootstrapQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const { seasonMode: season, refresh, wire } = query;
    const isClosedHistorical = season === "2026" || season === "2025" || season === "2024";
    const cacheControl = refresh
      ? "no-store"
      : isClosedHistorical
      ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
      : "public, max-age=60, s-maxage=180, stale-while-revalidate=900";
    if (wire === "legacy") {
      res.setHeader("Cache-Control", cacheControl);
      const legacyPayload = await getBootstrapPayload(season, refresh);
      res.json(legacyPayload);
      return;
    }
    const buffers = await getBootstrapWireBuffers(season, refresh);
    sendPreserializedJsonBuffers(req, res, buffers, cacheControl);
  } catch (err) {
    console.error("Error in /api/nba/bootstrap:", err);
    res.status(500).json({ error: err?.message || "Error al cargar datos NBA." });
  }
});
app.get("/api/nba/search", validateRequest({ query: searchQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");
    const results = await searchLeaguePlayers(query.q);
    res.json({ results });
  } catch (err) {
    console.error("Error in /api/nba/search:", err);
    res.status(500).json({ error: err?.message || "Error en búsqueda NBA." });
  }
});
app.get("/api/nba/player/:playerId", validateRequest({ params: playerParamsSchema, query: playerSummaryQuerySchema }), async (req, res) => {
  try {
    const { params, query } = getValidated(req);
    const isClosedHistorical = query.seasonMode === "2026" || query.seasonMode === "2025" || query.seasonMode === "2024";
    res.setHeader(
      "Cache-Control",
      isClosedHistorical
        ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        : "public, max-age=120, s-maxage=600, stale-while-revalidate=3600"
    );
    const player = await getSinglePlayerSummary(params.playerId, query.seasonMode);
    if (!player) {
      res.status(404).json({ error: "Jugador no encontrado." });
      return;
    }
    res.json({ player });
  } catch (err) {
    console.error("Error in /api/nba/player/:playerId:", err);
    res.status(500).json({ error: err?.message || "Error al consultar jugador." });
  }
});
app.get("/api/nba/player/:playerId/inspector", validateRequest({ params: playerParamsSchema, query: emptyQuerySchema }), async (req, res) => {
  try {
    const { params } = getValidated(req);
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=3600");
    const dossier = await getPlayerInspectorDossier(params.playerId);
    if (!dossier) {
      res.status(404).json({ error: "Jugador no encontrado." });
      return;
    }
    res.json(dossier);
  } catch (err) {
    console.error("Error in /api/nba/player/:playerId/inspector:", err);
    res.status(500).json({ error: err?.message || "Error al cargar ficha completa del jugador." });
  }
});
app.get("/api/nba/team/:teamId/roster", validateRequest({ params: teamParamsSchema, query: emptyQuerySchema }), async (req, res) => {
  try {
    const { params } = getValidated(req);
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");
    const roster = await getTeamRoster(params.teamId);
    res.json({ roster });
  } catch (err) {
    console.error("Error in /api/nba/team/:teamId/roster:", err);
    res.status(500).json({ error: err?.message || "Error al cargar plantilla." });
  }
});
app.get("/api/nba/milestones", validateRequest({ query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader("Cache-Control", query.refresh ? "no-store" : "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");
    const payload = await getMilestonesPayload(Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/milestones:", err);
    res.status(500).json({ error: err?.message || "Error al calcular hitos." });
  }
});
app.get("/api/nba/awards", validateRequest({ query: awardsQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const isClosedHistorical = query.season === "2026" || query.season === "2025" || query.season === "2024";
    res.setHeader(
      "Cache-Control",
      query.refresh
        ? "no-store"
        : isClosedHistorical
        ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        : "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400"
    );
    const payload = await getSeasonAwardsPayload(query.season, Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/awards:", err);
    res.status(500).json({ error: err?.message || "Error al calcular carreras a los premios NBA." });
  }
});
app.get("/api/nba/gameday", validateRequest({ query: gamedayQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const todayIso = getEasternTodayIso();
    const isPastDate = query.date && query.date < todayIso;
    res.setHeader(
      "Cache-Control",
      query.refresh
        ? "no-store"
        : isPastDate
        ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        : "public, max-age=30, s-maxage=90, stale-while-revalidate=300"
    );
    const payload = await getGameDayPayload(query.date, Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/gameday:", err);
    res.status(500).json({ error: err?.message || "Error al analizar la jornada NBA." });
  }
});
app.get("/api/nba/gameday/chronicle", validateRequest({ query: gamedayQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const todayIso = getEasternTodayIso();
    const isPastDate = query.date && query.date < todayIso;
    res.setHeader(
      "Cache-Control",
      query.refresh
        ? "no-store"
        : isPastDate
        ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        : "public, max-age=60, s-maxage=300, stale-while-revalidate=1800"
    );
    const payload = await scoutingEngine.buildGameDayChroniclePayload(query.date, Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/gameday/chronicle:", err);
    res.status(500).json({ error: err?.message || "Error al generar crónica de la jornada." });
  }
});
app.get("/api/nba/scoreboard", validateRequest({ query: gamedayQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const clientEtag = req.headers["if-none-match"];
    const delta = await getScoreboardDeltaPayload(query.date, Boolean(query.refresh), clientEtag);
    if (delta.unmodified) {
      res.setHeader("ETag", delta.hash);
      res.setHeader("Cache-Control", "public, max-age=5, s-maxage=10, stale-while-revalidate=30");
      res.status(304).end();
      return;
    }
    res.setHeader("ETag", delta.hash);
    sendPreserializedJsonBuffers(req, res, delta.buffers, "public, max-age=5, s-maxage=10, stale-while-revalidate=30");
  } catch (err) {
    console.error("Error in /api/nba/scoreboard:", err);
    res.status(500).json({ error: err?.message || "Error al obtener marcador delta." });
  }
});
app.get("/api/nba/game/:eventId/boxscore", validateRequest({ params: gameEventParamsSchema, query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { params, query } = getValidated(req);
    const report = await scoutingEngine.buildGameOfficialReportData(params.eventId, Boolean(query.refresh));
    const isFinal = report?.status === "final" || report?.gameStatus === 3 || Boolean(report?.isFinal);
    res.setHeader(
      "Cache-Control",
      query.refresh
        ? "no-store"
        : isFinal
        ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        : "public, max-age=15, s-maxage=30, stale-while-revalidate=120"
    );
    res.json(report);
  } catch (err) {
    console.error("Error in /api/nba/game/:eventId/boxscore:", err);
    res.status(500).json({ error: err?.message || "Error al cargar acta oficial del partido." });
  }
});
app.get("/api/nba/game/:eventId/narrative", validateRequest({ params: gameEventParamsSchema, query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { params, query } = getValidated(req);
    const narrative = await scoutingEngine.buildGameNarrativePayload(params.eventId, Boolean(query.refresh));
    const isFinal = narrative?.isFinal || Boolean(narrative?.report?.isFinal);
    res.setHeader(
      "Cache-Control",
      query.refresh
        ? "no-store"
        : isFinal
        ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        : "public, max-age=60, s-maxage=300, stale-while-revalidate=1800"
    );
    res.json(narrative);
  } catch (err) {
    const cleanErr = String(err instanceof Error ? err.message : err || "").replace(/[\{\}\"\:]/g, " ").slice(0, 100);
    console.info(`[RadarNBA API] Respuesta determinista para crónica -> ${cleanErr}`);
    try {
      const { params } = getValidated(req);
      const report = await scoutingEngine.buildGameOfficialReportData(params.eventId, false);
      const fallback = scoutingEngine.buildDeterministicGameNarrative(report);
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=1800");
      res.json(fallback);
    } catch (innerErr) {
      const cleanInner = String(innerErr instanceof Error ? innerErr.message : innerErr || "").replace(/[\{\}\"\:]/g, " ").slice(0, 100);
      console.warn(`[RadarNBA API] Fallback de crónica secundario -> ${cleanInner}`);
      res.status(500).json({ error: "Error al redactar crónica del partido." });
    }
  }
});
app.get(["/api/nba/fantasy/context", "/api/nba/fantasy/espn"], validateRequest({ query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const { query } = getValidated(req);
    const payload = await getFantasyEspnSyncPayload(Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/fantasy/context:", err);
    res.status(500).json({ error: err?.message || "Error al cargar calendario y partes NBA para Fantasy." });
  }
});
app.get("/api/nba/fantasy/manual-state", validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const state = await readManualFantasyState();
    const backendInfo = getFantasyStorageBackendInfo();
    res.json({ state, ...backendInfo });
  } catch (err) {
    console.error("Error reading manual fantasy state:", err);
    res.status(500).json({ error: "Error al leer estado guardado de la liga Fantasy." });
  }
});
app.put("/api/nba/fantasy/manual-state", validateRequest({ query: emptyQuerySchema, body: manualFantasyStateBodySchema }), async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const { body } = getValidated(req);
    const saved = await writeManualFantasyState(body);
    if (!saved) {
      res.status(400).json({ error: "Formato de datos de liga Fantasy no v\xE1lido." });
      return;
    }
    const backendInfo = getFantasyStorageBackendInfo();
    res.json({ ok: true, state: saved, ...backendInfo });
  } catch (err) {
    console.error("Error saving manual fantasy state:", err);
    res.status(500).json({ error: err?.message || "Error al guardar permanentemente la liga Fantasy." });
  }
});


app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta de API no encontrada.", code: "API_ROUTE_NOT_FOUND" });
});
app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (String(req.url || "").startsWith("/api")) {
    console.error("[RadarNBA API Unhandled Error]:", err);
    res.status(500).json({ error: err?.message || "Error interno del servidor de estad\xEDsticas.", code: "INTERNAL_API_ERROR" });
    return;
  }
  next(err);
});
var apiApp_default = app;
export {
  app,
  apiApp_default as default
};
