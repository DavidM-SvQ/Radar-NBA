// @ts-nocheck
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import zlib from "zlib";
import { DEFAULT_AUTO_STREAKS_CONFIG_VALUES, DEFAULT_EXPERIENCE_METRICS_CONFIG_VALUES, DEFAULT_GAMEDAY_THRESHOLDS, DEFAULT_INSPECTOR_KPI_CONFIG, DEFAULT_MILESTONE_NOTIFICATIONS_CONFIG, DEFAULT_SIDEBAR_MENU_CONFIG_VALUES, DEFAULT_WEB_FEATURE_FLAGS, getAutoStreaksConfig, getBootstrapPayload, getBootstrapWireBuffers, getCareerLeadersPayload, getContractsPayload, getDraftHistoryPayload, getExperienceMetricsConfig, getFantasyEspnSyncPayload, getFutureDraftPicksPayload, getGameDayPayload, getGamedayThresholdsConfig, getInjuriesReportPayload, getInspectorKpiDefaultsConfig, getMilestoneNotificationsConfig, getMilestoneNotificationsPayload, getMilestoneNotificationsSeasonCounts, getMilestonesPayload, getPlayerCareerHistoryPayload, getPlayerInspectorDossier, getSeasonAwardsPayload, getScoreboardDeltaPayload, getSidebarMenuConfig, getSinglePlayerSummary, getTeamCareerHistoryPayload, getTeamRoster, getWebFeatureFlags, resetAutoStreaksConfigDefaults, resetExperienceMetricsConfigDefaults, resetGamedayThresholdsConfigDefaults, resetInspectorKpiDefaultsConfig, resetMilestoneNotificationsConfigDefaults, resetSidebarMenuConfigDefaults, scoutingEngine, searchLeaguePlayers, updateAutoStreaksConfig, updateExperienceMetricsConfig, updateGamedayThresholdsConfig, updateInspectorKpiDefaultsConfig, updateMilestoneNotificationsConfig, updateSidebarMenuConfig, updateWebFeatureFlags } from "./nbaDataService.ts";
import { getLeagueShotZonesAdvanced, getLeagueClutchAdvanced, getLeagueDefenseHustleAdvanced, getLeagueTrackingAdvanced, getLeaguePlaytypesAdvanced, getLeagueScoringSplitsAdvanced, getLeagueFourFactorsAdvanced, getLeagueViolationsAdvanced, getLeagueLineups, getLeagueHeroicShots, getTeamAdvancedDossier, getPlayerAdvancedDossier } from "./nbaAdvancedStatsService.ts";
import { readNbaSnapshotMetadataFromDisk } from "./nbaSnapshotStore.ts";
import { getFantasyStorageBackendInfo, readManualFantasyState, writeManualFantasyState } from "./fantasyEspnService.ts";
import { DEFAULT_ADMIN_SECURITY_VALUES, adminBruteForceLimiter, adminEndpointFloodLimiter, buildAdminSessionCookieHeader, buildClearAdminSessionCookieHeader, extractAdminTokenFromRequest, getAdminAuthReadiness, getAdminSecurityConfig, getRateLimitBackendInfo, issueAdminSessionToken, nbaApiRateLimiter, nbaHeavyRefreshLimiter, recordAdminLoginFailure, requireAdminAuth, requireAdminCsrfProtection, resetAdminBruteForceForRequest, resetAdminSecurityConfigToDefaults, resetAllRateLimitCounters, saveAdminSecurityConfig, verifyAdminPasscodeConstantTime, verifyAdminSessionToken } from "./securityMiddleware.ts";
import { DEFAULT_EDITORIAL_CONFIG_VALUES, buildEditorialDirectivesPromptBlock, getEditorialStorageInfo, loadEditorialConfig, resetEditorialConfigToDefaults, saveEditorialConfig } from "./editorialConfigService.ts";
import { ADMIN_SECURITY_BOUNDS, adminLoginBodySchema, adminSecurityConfigBodySchema, autoStreaksConfigBodySchema, awardsQuerySchema, bootstrapQuerySchema, editorialConfigBodySchema, emptyQuerySchema, experienceMetricsConfigBodySchema, gameEventParamsSchema, gamedayQuerySchema, gamedayThresholdsBodySchema, getValidated, historyLeadersQuerySchema, inspectorKpiDefaultsBodySchema, manualFantasyStateBodySchema, milestoneNotificationsBodySchema, playerParamsSchema, playerSummaryQuerySchema, purgeChronicleCacheBodySchema, refreshOnlyQuerySchema, searchQuerySchema, sidebarMenuConfigBodySchema, teamParamsSchema, validateRequest, advancedLeagueQuerySchema, advancedLineupsQuerySchema, advancedEntityQuerySchema, advancedHeroicShotsQuerySchema, webFeatureFlagsBodySchema } from "./validationSchemas.ts";
import { getAllCircuitMetrics, resetCircuit } from "./circuitBreaker.ts";
import { expressTelemetryMiddleware, getTelemetrySummary } from "./telemetryLogger.ts";
import { getEasternTodayIso } from "../utils/staticSchedule.ts";
import { NBA_TEAMS_MAP } from "../utils/teamLogos.ts";
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
const TEAM_LOGO_BUFFER_CACHE = new Map<string, { buffer: Buffer; contentType: string }>();

app.get("/api/nba/team-logo/:abbr", async (req, res) => {
  const rawAbbr = String(req.params.abbr || "").toUpperCase().trim();
  const meta = NBA_TEAMS_MAP[rawAbbr];
  if (!meta) {
    res.status(404).send("Franquicia no encontrada");
    return;
  }

  const cached = TEAM_LOGO_BUFFER_CACHE.get(rawAbbr);
  if (cached) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(cached.buffer);
    return;
  }

  try {
    const slug = meta.espnSlug || rawAbbr.toLowerCase();
    const espnUrl = `https://a.espncdn.com/i/teamlogos/nba/500/${slug}.png`;
    const response = await fetch(espnUrl);
    if (!response.ok) {
      res.status(502).send("Error al obtener logo de CDN");
      return;
    }
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const contentType = response.headers.get("content-type") || "image/png";
    TEAM_LOGO_BUFFER_CACHE.set(rawAbbr, { buffer, contentType });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(buffer);
  } catch {
    res.status(500).send("Error interno en proxy de logo");
  }
});

app.use("/api/nba", nbaApiRateLimiter, nbaHeavyRefreshLimiter);
app.use("/api/admin", (req, res, next) => {
  if (
    req.path === "/milestone-notifications/preview-counts" ||
    req.path === "/session"
  ) {
    next();
    return;
  }
  return adminEndpointFloodLimiter(req, res, next);
});
app.get("/admin", adminEndpointFloodLimiter, (_req, _res, next) => {
  next();
});
app.get("/api/health", (_req, res) => {
  const snapMeta = readNbaSnapshotMetadataFromDisk();
  res.json({ status: "ok", name: "RadarNBA", runtime: process.env.VERCEL ? "vercel-serverless" : "node-server", snapshotLoaded: snapMeta.snapshotLoaded, modularSnapshots: snapMeta.modularSnapshots, heroicMicroSnapshot: snapMeta.heroicMicroSnapshot, snapshotGeneratedAt: snapMeta.snapshotGeneratedAt, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
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
    res.json({ ok: true, token, expiresAt });
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
app.get("/api/admin/gameday-thresholds", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getGamedayThresholdsConfig(), defaults: DEFAULT_GAMEDAY_THRESHOLDS });
});
app.put("/api/admin/gameday-thresholds", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: gamedayThresholdsBodySchema }), async (req, res) => {
  try {
    const { body } = getValidated(req);
    const updated = updateGamedayThresholdsConfig(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: updated, defaults: DEFAULT_GAMEDAY_THRESHOLDS });
  } catch (err) {
    console.error("Error in PUT /api/admin/gameday-thresholds:", err);
    res.status(500).json({ ok: false, error: "No se pudieron guardar los criterios de jornada." });
  }
});
app.post("/api/admin/gameday-thresholds/reset-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    const restored = resetGamedayThresholdsConfigDefaults();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: restored, defaults: DEFAULT_GAMEDAY_THRESHOLDS });
  } catch (err) {
    console.error("Error in POST /api/admin/gameday-thresholds/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudieron restablecer los criterios recomendados." });
  }
});
app.get("/api/admin/web-feature-flags", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, flags: getWebFeatureFlags(), defaults: DEFAULT_WEB_FEATURE_FLAGS });
});
app.put("/api/admin/web-feature-flags", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: webFeatureFlagsBodySchema }), (req, res) => {
  try {
    const { body } = getValidated(req);
    const updated = updateWebFeatureFlags(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, flags: updated, defaults: DEFAULT_WEB_FEATURE_FLAGS });
  } catch (err) {
    console.error("Error in PUT /api/admin/web-feature-flags:", err);
    res.status(500).json({ ok: false, error: "No se pudo guardar la configuración de insignias." });
  }
});
app.get("/api/nba/web-feature-flags", validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, flags: getWebFeatureFlags() });
});
app.get("/api/admin/inspector-kpi-defaults", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getInspectorKpiDefaultsConfig(), defaults: DEFAULT_INSPECTOR_KPI_CONFIG });
});
app.put("/api/admin/inspector-kpi-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: inspectorKpiDefaultsBodySchema }), (req, res) => {
  try {
    const { body } = getValidated(req);
    const updated = updateInspectorKpiDefaultsConfig(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: updated, defaults: DEFAULT_INSPECTOR_KPI_CONFIG });
  } catch (err) {
    console.error("Error in PUT /api/admin/inspector-kpi-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudo guardar la configuración de KPIs por defecto." });
  }
});
app.post("/api/admin/inspector-kpi-defaults/reset-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  try {
    const restored = resetInspectorKpiDefaultsConfig();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: restored, defaults: DEFAULT_INSPECTOR_KPI_CONFIG });
  } catch (err) {
    console.error("Error in POST /api/admin/inspector-kpi-defaults/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudieron restablecer los KPIs por defecto." });
  }
});
app.get("/api/nba/streaks-config", validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getAutoStreaksConfig() });
});
app.get("/api/admin/streaks-config", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getAutoStreaksConfig(), defaults: DEFAULT_AUTO_STREAKS_CONFIG_VALUES });
});
app.put("/api/admin/streaks-config", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: autoStreaksConfigBodySchema }), (req, res) => {
  try {
    const { body } = getValidated(req);
    const updated = updateAutoStreaksConfig(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: updated, defaults: DEFAULT_AUTO_STREAKS_CONFIG_VALUES });
  } catch (err) {
    console.error("Error in PUT /api/admin/streaks-config:", err);
    res.status(500).json({ ok: false, error: "No se pudo guardar la configuración de rachas automáticas." });
  }
});
app.post("/api/admin/streaks-config/reset-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  try {
    const restored = resetAutoStreaksConfigDefaults();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: restored, defaults: DEFAULT_AUTO_STREAKS_CONFIG_VALUES });
  } catch (err) {
    console.error("Error in POST /api/admin/streaks-config/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudieron restablecer las rachas por defecto." });
  }
});
app.get("/api/nba/experience-metrics-config", validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getExperienceMetricsConfig() });
});
app.get("/api/admin/experience-metrics-config", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getExperienceMetricsConfig(), defaults: DEFAULT_EXPERIENCE_METRICS_CONFIG_VALUES });
});
app.put("/api/admin/experience-metrics-config", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: experienceMetricsConfigBodySchema }), (req, res) => {
  try {
    const { body } = getValidated(req);
    const updated = updateExperienceMetricsConfig(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: updated, defaults: DEFAULT_EXPERIENCE_METRICS_CONFIG_VALUES });
  } catch (err) {
    console.error("Error in PUT /api/admin/experience-metrics-config:", err);
    res.status(500).json({ ok: false, error: "No se pudo guardar la distribución de estadísticas Sencillo/Avanzado." });
  }
});
app.post("/api/admin/experience-metrics-config/reset-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  try {
    const restored = resetExperienceMetricsConfigDefaults();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: restored, defaults: DEFAULT_EXPERIENCE_METRICS_CONFIG_VALUES });
  } catch (err) {
    console.error("Error in POST /api/admin/experience-metrics-config/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudo restablecer la distribución por defecto." });
  }
});
app.get("/api/nba/sidebar-menu-config", validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getSidebarMenuConfig() });
});
app.get("/api/admin/sidebar-menu-config", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getSidebarMenuConfig(), defaults: DEFAULT_SIDEBAR_MENU_CONFIG_VALUES });
});
app.put("/api/admin/sidebar-menu-config", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: sidebarMenuConfigBodySchema }), (req, res) => {
  try {
    const { body } = getValidated(req);
    const updated = updateSidebarMenuConfig(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: updated, defaults: DEFAULT_SIDEBAR_MENU_CONFIG_VALUES });
  } catch (err) {
    console.error("Error in PUT /api/admin/sidebar-menu-config:", err);
    res.status(500).json({ ok: false, error: "No se pudo guardar la organización del menú lateral." });
  }
});
app.post("/api/admin/sidebar-menu-config/reset-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  try {
    const restored = resetSidebarMenuConfigDefaults();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: restored, defaults: DEFAULT_SIDEBAR_MENU_CONFIG_VALUES });
  } catch (err) {
    console.error("Error in POST /api/admin/sidebar-menu-config/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudo restablecer el menú lateral por defecto." });
  }
});
app.get("/api/admin/milestone-notifications", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getMilestoneNotificationsConfig(), defaults: DEFAULT_MILESTONE_NOTIFICATIONS_CONFIG });
});
app.put("/api/admin/milestone-notifications", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: milestoneNotificationsBodySchema }), (req, res) => {
  try {
    const { body } = getValidated(req);
    const updated = updateMilestoneNotificationsConfig(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: updated, defaults: DEFAULT_MILESTONE_NOTIFICATIONS_CONFIG });
  } catch (err) {
    console.error("Error in PUT /api/admin/milestone-notifications:", err);
    res.status(500).json({ ok: false, error: "No se pudo guardar la configuración de notificaciones." });
  }
});
app.post("/api/admin/milestone-notifications/reset-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  try {
    const restored = resetMilestoneNotificationsConfigDefaults();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: restored, defaults: DEFAULT_MILESTONE_NOTIFICATIONS_CONFIG });
  } catch (err) {
    console.error("Error in POST /api/admin/milestone-notifications/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudieron restablecer las notificaciones por defecto." });
  }
});
app.post("/api/admin/milestone-notifications/preview-counts", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: milestoneNotificationsBodySchema }), async (req, res) => {
  try {
    const { body } = getValidated(req);
    const preview = await getMilestoneNotificationsSeasonCounts(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...preview });
  } catch (err) {
    console.error("Error in POST /api/admin/milestone-notifications/preview-counts:", err);
    res.status(500).json({ ok: false, error: "No se pudo calcular la simulación de conteos." });
  }
});
app.get("/api/admin/editorial-config", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    const config = await loadEditorialConfig(true);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      config,
      defaults: DEFAULT_EDITORIAL_CONFIG_VALUES,
      storage: getEditorialStorageInfo(),
      previewBlock: {
        game: buildEditorialDirectivesPromptBlock(config, "game"),
        daily: buildEditorialDirectivesPromptBlock(config, "daily"),
      },
    });
  } catch (err) {
    console.error("Error in GET /api/admin/editorial-config:", err);
    res.status(500).json({ ok: false, error: "No se pudo cargar la configuración editorial." });
  }
});
app.put("/api/admin/editorial-config", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: editorialConfigBodySchema }), async (req, res) => {
  try {
    const { body } = getValidated(req);
    const { invalidateCacheOnSave, ...values } = body;
    let updated = await saveEditorialConfig(values, { invalidateCache: false });
    let cachePurgeResult = null;
    if (invalidateCacheOnSave) {
      cachePurgeResult = await scoutingEngine.purgeNarrativeCache({ scope: "all" });
      updated = await loadEditorialConfig(true);
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      config: updated,
      defaults: DEFAULT_EDITORIAL_CONFIG_VALUES,
      storage: getEditorialStorageInfo(),
      cachePurgeResult,
      previewBlock: {
        game: buildEditorialDirectivesPromptBlock(updated, "game"),
        daily: buildEditorialDirectivesPromptBlock(updated, "daily"),
      },
    });
  } catch (err) {
    console.error("Error in PUT /api/admin/editorial-config:", err);
    res.status(500).json({ ok: false, error: "No se pudo guardar la configuración editorial." });
  }
});
app.post("/api/admin/editorial-config/reset-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    const restored = await resetEditorialConfigToDefaults({ invalidateCache: false });
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      config: restored,
      defaults: DEFAULT_EDITORIAL_CONFIG_VALUES,
      storage: getEditorialStorageInfo(),
      previewBlock: {
        game: buildEditorialDirectivesPromptBlock(restored, "game"),
        daily: buildEditorialDirectivesPromptBlock(restored, "daily"),
      },
    });
  } catch (err) {
    console.error("Error in POST /api/admin/editorial-config/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudo restablecer el perfil editorial por defecto." });
  }
});
app.post("/api/admin/chronicles/purge-cache", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: purgeChronicleCacheBodySchema }), async (req, res) => {
  try {
    const { body } = getValidated(req);
    if (body.scope === "date" && !body.date) {
      res.status(400).json({ ok: false, error: "Debes indicar una fecha (AAAA-MM-DD) para purgar una jornada concreta." });
      return;
    }
    if (body.scope === "game" && !body.eventId) {
      res.status(400).json({ ok: false, error: "Debes indicar el ID de partido (eventId) para purgar una crónica concreta." });
      return;
    }
    const result = await scoutingEngine.purgeNarrativeCache(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Error in POST /api/admin/chronicles/purge-cache:", err);
    res.status(500).json({ ok: false, error: "No se pudo purgar la caché de crónicas." });
  }
});
app.get("/api/nba/notifications", validateRequest({ query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : "public, max-age=30, s-maxage=120, stale-while-revalidate=300"
    );
    const payload = await getMilestoneNotificationsPayload(Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in GET /api/nba/notifications:", err);
    res.status(500).json({ error: "No se pudieron cargar las notificaciones de hitos." });
  }
});
app.get("/api/nba/inspector-kpi-defaults", validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getInspectorKpiDefaultsConfig() });
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
    const payload = await scoutingEngine.buildGameDayChroniclePayload(query.date, Boolean(query.refresh));
    const todayIso = getEasternTodayIso();
    const targetDate = query.date || payload?.date;
    const isPastDate = Boolean(targetDate && targetDate < todayIso);
    const isAi = payload?.engineMode === "gemini_search";
    res.setHeader(
      "Cache-Control",
      query.refresh
        ? "no-store"
        : !isAi
        ? "public, max-age=15, s-maxage=30, must-revalidate"
        : isPastDate
        ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        : "public, max-age=60, s-maxage=300, stale-while-revalidate=1800"
    );
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
    if (delta.buffers) {
      sendPreserializedJsonBuffers(req, res, delta.buffers, "public, max-age=5, s-maxage=10, stale-while-revalidate=30");
    } else {
      res.json(delta);
    }
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
    const isAi = narrative?.engineMode === "gemini_search";
    res.setHeader(
      "Cache-Control",
      query.refresh
        ? "no-store"
        : !isAi
        ? "public, max-age=15, s-maxage=30, must-revalidate"
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
      res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30, must-revalidate");
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

app.get("/api/nba/advanced/teams", validateRequest({ query: advancedLeagueQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader("Cache-Control", query.refresh ? "no-store" : "no-cache");
    let payload;
    if (query.category === "zones") payload = await getLeagueShotZonesAdvanced(query.season, "team", Boolean(query.refresh));
    else if (query.category === "clutch") payload = await getLeagueClutchAdvanced(query.season, "team", Boolean(query.refresh));
    else if (query.category === "defense_hustle") payload = await getLeagueDefenseHustleAdvanced(query.season, "team", Boolean(query.refresh));
    else if (query.category === "tracking") payload = await getLeagueTrackingAdvanced(query.season, "team", Boolean(query.refresh));
    else if (query.category === "playtypes") payload = await getLeaguePlaytypesAdvanced(query.season, "team", Boolean(query.refresh));
    else if (query.category === "scoring") payload = await getLeagueScoringSplitsAdvanced(query.season, "team", Boolean(query.refresh));
    else if (query.category === "four_factors") payload = await getLeagueFourFactorsAdvanced(query.season, "team", Boolean(query.refresh));
    else if (query.category === "violations") payload = await getLeagueViolationsAdvanced(query.season, "team", Boolean(query.refresh));
    else payload = await getLeagueShotZonesAdvanced(query.season, "team", Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/advanced/teams:", err);
    res.status(500).json({ error: err?.message || "Error al cargar estadísticas avanzadas de equipos." });
  }
});

app.get("/api/nba/advanced/players", validateRequest({ query: advancedLeagueQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader("Cache-Control", query.refresh ? "no-store" : "no-cache");
    let payload;
    if (query.category === "zones") payload = await getLeagueShotZonesAdvanced(query.season, "player", Boolean(query.refresh));
    else if (query.category === "clutch") payload = await getLeagueClutchAdvanced(query.season, "player", Boolean(query.refresh));
    else if (query.category === "defense_hustle") payload = await getLeagueDefenseHustleAdvanced(query.season, "player", Boolean(query.refresh));
    else if (query.category === "tracking") payload = await getLeagueTrackingAdvanced(query.season, "player", Boolean(query.refresh));
    else if (query.category === "playtypes") payload = await getLeaguePlaytypesAdvanced(query.season, "player", Boolean(query.refresh));
    else if (query.category === "scoring") payload = await getLeagueScoringSplitsAdvanced(query.season, "player", Boolean(query.refresh));
    else if (query.category === "four_factors") payload = await getLeagueFourFactorsAdvanced(query.season, "player", Boolean(query.refresh));
    else if (query.category === "violations") payload = await getLeagueViolationsAdvanced(query.season, "player", Boolean(query.refresh));
    else payload = await getLeagueShotZonesAdvanced(query.season, "player", Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/advanced/players:", err);
    res.status(500).json({ error: err?.message || "Error al cargar estadísticas avanzadas de jugadores." });
  }
});

app.get("/api/nba/advanced/lineups", validateRequest({ query: advancedLineupsQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader("Cache-Control", query.refresh ? "no-store" : "no-cache");
    const payload = await getLeagueLineups(query.season, query.group as any, query.teamId, Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/advanced/lineups:", err);
    res.status(500).json({ error: err?.message || "Error al cargar quintetos y alineaciones." });
  }
});

app.get("/api/nba/advanced/team/:teamId", validateRequest({ params: teamParamsSchema, query: advancedEntityQuerySchema }), async (req, res) => {
  try {
    const { params, query } = getValidated(req);
    res.setHeader("Cache-Control", query.refresh ? "no-store" : "no-cache");
    const dossier = await getTeamAdvancedDossier(params.teamId, query.season, Boolean(query.refresh));
    res.json(dossier);
  } catch (err) {
    console.error("Error in /api/nba/advanced/team/:teamId:", err);
    res.status(500).json({ error: err?.message || "Error al cargar dossier avanzado de equipo." });
  }
});

app.get("/api/nba/advanced/player/:playerId", validateRequest({ params: playerParamsSchema, query: advancedEntityQuerySchema }), async (req, res) => {
  try {
    const { params, query } = getValidated(req);
    res.setHeader("Cache-Control", query.refresh ? "no-store" : "no-cache");
    const dossier = await getPlayerAdvancedDossier(params.playerId, query.teamId, query.season, Boolean(query.refresh));
    res.json(dossier);
  } catch (err) {
    console.error("Error in /api/nba/advanced/player/:playerId:", err);
    res.status(500).json({ error: err?.message || "Error al cargar dossier avanzado de jugador." });
  }
});

app.get("/api/nba/advanced/heroic-shots", validateRequest({ query: advancedHeroicShotsQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
    );
    const payload = await getLeagueHeroicShots(query.season, Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/advanced/heroic-shots:", err);
    res.status(500).json({ error: err?.message || "Error al cargar buzzer beaters y game winners." });
  }
});

app.get("/api/nba/history/player/:playerId", validateRequest({ params: playerParamsSchema, query: emptyQuerySchema }), async (req, res) => {
  try {
    const { params } = getValidated(req);
    const profile = await getPlayerCareerHistoryPayload(params.playerId);
    if (!profile) {
      res.status(404).json({ error: "No se encontró historial de carrera para este jugador." });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    res.json(profile);
  } catch (err) {
    console.error("Error in /api/nba/history/player/:playerId:", err);
    res.status(500).json({ error: err?.message || "Error al cargar trayectoria histórica del jugador." });
  }
});

app.get("/api/nba/history/team/:teamId", validateRequest({ params: teamParamsSchema, query: emptyQuerySchema }), async (req, res) => {
  try {
    const { params } = getValidated(req);
    const history = await getTeamCareerHistoryPayload(params.teamId);
    if (!history) {
      res.status(404).json({ error: "No se encontró historial de franquicia para este equipo." });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    res.json(history);
  } catch (err) {
    console.error("Error in /api/nba/history/team/:teamId:", err);
    res.status(500).json({ error: err?.message || "Error al cargar historial de franquicia NBA." });
  }
});

app.get("/api/nba/history/leaders", validateRequest({ query: historyLeadersQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const payload = await getCareerLeadersPayload(query.scope);
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/history/leaders:", err);
    res.status(500).json({ error: err?.message || "Error al cargar líderes históricos de carrera." });
  }
});

app.get("/api/nba/injuries", validateRequest({ query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : "public, max-age=180, s-maxage=600, stale-while-revalidate=1800"
    );
    const payload = await getInjuriesReportPayload(Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/injuries:", err);
    res.status(500).json({ error: err?.message || "Error al cargar el parte oficial de lesiones y rotaciones." });
  }
});

app.get("/api/nba/contracts", validateRequest({ query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : "public, max-age=300, s-maxage=1800, stale-while-revalidate=7200"
    );
    const payload = await getContractsPayload(Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/contracts:", err);
    res.status(500).json({ error: err?.message || "Error al cargar las nóminas y contratos NBA." });
  }
});

app.get("/api/nba/draft/history", nbaApiRateLimiter, validateRequest({ query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : "public, max-age=600, s-maxage=3600, stale-while-revalidate=14400"
    );
    const payload = await getDraftHistoryPayload(Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/draft/history:", err);
    res.status(500).json({ error: err?.message || "Error al cargar el archivo histórico del Draft NBA." });
  }
});

app.get("/api/nba/draft/future-picks", nbaApiRateLimiter, validateRequest({ query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : "public, max-age=600, s-maxage=3600, stale-while-revalidate=14400"
    );
    const payload = await getFutureDraftPicksPayload(Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/draft/future-picks:", err);
    res.status(500).json({ error: err?.message || "Error al cargar el inventario de rondas futuras del Draft NBA." });
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
