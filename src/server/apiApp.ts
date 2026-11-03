// @ts-nocheck
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { getBootstrapPayload, getBootstrapWireBuffers, getFantasyEspnSyncPayload, getGameDayPayload, getMilestonesPayload, getPlayerInspectorDossier, getSinglePlayerSummary, getTeamRoster, scoutingEngine, searchLeaguePlayers } from "./nbaDataService.ts";
import { readNbaSnapshotFromDisk } from "./nbaSnapshotStore.ts";
import { getFantasyStorageBackendInfo, readManualFantasyState, writeManualFantasyState } from "./fantasyEspnService.ts";
import { ADMIN_COOKIE_NAME, DEFAULT_ADMIN_SECURITY_VALUES, adminBruteForceLimiter, adminEndpointFloodLimiter, extractAdminTokenFromRequest, getAdminSecurityConfig, issueAdminSessionToken, nbaApiRateLimiter, nbaHeavyRefreshLimiter, requireAdminAuth, resetAdminBruteForceForRequest, resetAdminSecurityConfigToDefaults, resetAllRateLimitCounters, saveAdminSecurityConfig, verifyAdminPasscodeConstantTime, verifyAdminSessionToken } from "./securityMiddleware.ts";
import { ADMIN_SECURITY_BOUNDS, adminLoginBodySchema, adminSecurityConfigBodySchema, bootstrapQuerySchema, emptyQuerySchema, gameEventParamsSchema, gamedayQuerySchema, getValidated, manualFantasyStateBodySchema, playerParamsSchema, playerSummaryQuerySchema, refreshOnlyQuerySchema, searchQuerySchema, teamParamsSchema, validateRequest } from "./validationSchemas.ts";
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
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { defaultSrc: ["'self'"], scriptSrc: isProduction ? ["'self'", "'unsafe-inline'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"], styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"], imgSrc: ["'self'", "data:", "blob:", "https://cdn.nba.com", "https://ak-static.cms.nba.com", "https://a.espncdn.com", "https:"], connectSrc: isProduction ? ["'self'"] : ["'self'", "ws:", "wss:"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: isVercelDeployment ? ["'self'"] : ["'self'", "https://aistudio.google.com", "https://*.google.com", "https://*.googleusercontent.com", "https://*.run.app"], upgradeInsecureRequests: isProduction ? [] : null } }, frameguard: isVercelDeployment ? { action: "sameorigin" } : false, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: isVercelDeployment ? { policy: "same-origin" } : false, crossOriginResourcePolicy: { policy: "cross-origin" }, dnsPrefetchControl: { allow: true }, referrerPolicy: { policy: "no-referrer" }, strictTransportSecurity: { maxAge: 31536e3, includeSubDomains: true, preload: false } }));
app.use((req, _res, next) => {
  const desc = Object.getOwnPropertyDescriptor(req, "body");
  if (desc && "value" in desc && desc.value !== void 0 && typeof desc.value === "object" && desc.value !== null && !req._body) {
    req._body = true;
  }
  next();
});
app.use(express.json({ limit: "512kb" }));
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
app.post("/api/admin/login", adminBruteForceLimiter, validateRequest({ query: emptyQuerySchema, body: adminLoginBodySchema }), async (req, res) => {
  try {
    const { body } = getValidated(req);
    const isValid = verifyAdminPasscodeConstantTime(body.passcode);
    if (!isValid) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      res.status(401).json({ ok: false, error: "Clave incorrecta. Int\xE9ntalo de nuevo." });
      return;
    }
    resetAdminBruteForceForRequest(req);
    const { token, expiresAt } = issueAdminSessionToken();
    const maxAgeSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1e3));
    const secureCookie = isProduction ? "; Secure" : "";
    res.setHeader("Set-Cookie", `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secureCookie}`);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, token, expiresAt });
  } catch (err) {
    console.error("Error in /api/admin/login:", err);
    res.status(500).json({ ok: false, error: "Error al verificar credenciales." });
  }
});
app.get("/api/admin/session", validateRequest({ query: emptyQuerySchema }), (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const token = extractAdminTokenFromRequest(req);
  const check = verifyAdminSessionToken(token);
  if (!check.valid) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, expiresAt: check.expiresAt });
});
app.post("/api/admin/logout", validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  const secureCookie = isProduction ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureCookie}`);
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true });
});
app.get("/api/admin/security-config", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getAdminSecurityConfig(), defaults: DEFAULT_ADMIN_SECURITY_VALUES, bounds: ADMIN_SECURITY_BOUNDS });
});
app.put("/api/admin/security-config", requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: adminSecurityConfigBodySchema }), (req, res) => {
  try {
    const { body } = getValidated(req);
    const saved = saveAdminSecurityConfig(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: saved, defaults: DEFAULT_ADMIN_SECURITY_VALUES });
  } catch (err) {
    console.error("Error in PUT /api/admin/security-config:", err);
    res.status(500).json({ ok: false, error: "No se pudo guardar la configuraci\xF3n de seguridad." });
  }
});
app.post("/api/admin/security-config/reset-defaults", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  try {
    const restored = resetAdminSecurityConfigToDefaults();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: restored, defaults: DEFAULT_ADMIN_SECURITY_VALUES });
  } catch (err) {
    console.error("Error in POST /api/admin/security-config/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudieron restaurar los valores base." });
  }
});
app.post("/api/admin/security-config/reset-counters", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  try {
    resetAllRateLimitCounters();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, clearedAt: Date.now() });
  } catch (err) {
    console.error("Error in POST /api/admin/security-config/reset-counters:", err);
    res.status(500).json({ ok: false, error: "No se pudieron reiniciar los contadores IP." });
  }
});
app.get("/api/nba/bootstrap", validateRequest({ query: bootstrapQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const { seasonMode: season, refresh, wire } = query;
    if (wire === "legacy") {
      const legacyPayload = await getBootstrapPayload(season, refresh);
      res.json(legacyPayload);
      return;
    }
    const buffers = await getBootstrapWireBuffers(season, refresh);
    const cacheControl = refresh ? "no-store" : season === "2026" ? "public, max-age=300, stale-while-revalidate=3600" : "public, max-age=30, stale-while-revalidate=120";
    sendPreserializedJsonBuffers(req, res, buffers, cacheControl);
  } catch (err) {
    console.error("Error in /api/nba/bootstrap:", err);
    res.status(500).json({ error: err?.message || "Error al cargar datos NBA." });
  }
});
app.get("/api/nba/search", validateRequest({ query: searchQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const results = await searchLeaguePlayers(query.q);
    res.json({ results });
  } catch (err) {
    console.error("Error in /api/nba/search:", err);
    res.status(500).json({ error: err?.message || "Error en b\xFAsqueda NBA." });
  }
});
app.get("/api/nba/player/:playerId", validateRequest({ params: playerParamsSchema, query: playerSummaryQuerySchema }), async (req, res) => {
  try {
    const { params, query } = getValidated(req);
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
    const payload = await getMilestonesPayload(Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/milestones:", err);
    res.status(500).json({ error: err?.message || "Error al calcular hitos." });
  }
});
app.get("/api/nba/gameday", validateRequest({ query: gamedayQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
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
    const payload = await scoutingEngine.buildGameDayChroniclePayload(query.date, Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/gameday/chronicle:", err);
    res.status(500).json({ error: err?.message || "Error al generar cr\xF3nica de la jornada." });
  }
});
app.get("/api/nba/game/:eventId/boxscore", validateRequest({ params: gameEventParamsSchema, query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { params, query } = getValidated(req);
    const report = await scoutingEngine.buildGameOfficialReportData(params.eventId, Boolean(query.refresh));
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
    res.json(narrative);
  } catch (err) {
    console.error("Error in /api/nba/game/:eventId/narrative:", err);
    res.status(500).json({ error: err?.message || "Error al redactar cr\xF3nica del partido." });
  }
});
app.get(["/api/nba/fantasy/context", "/api/nba/fantasy/espn"], requireAdminAuth, validateRequest({ query: refreshOnlyQuerySchema }), async (req, res) => {
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
app.get("/api/nba/fantasy/manual-state", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
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
app.put("/api/nba/fantasy/manual-state", requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: manualFantasyStateBodySchema }), async (req, res) => {
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
