// @ts-nocheck
import { z } from "zod";
function stripControlChars(raw) {
  return raw.replace(/[\x00-\x1F\x7F]+/g, " ").trim();
}
const FORBIDDEN_PROTOTYPE_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
const safeEntityIdSchema = z.string({ error: "Identificador requerido." }).trim().min(1, "El identificador no puede estar vac\xEDo.").max(48, "Identificador demasiado largo (m\xE1x. 48 caracteres).").regex(/^[a-zA-Z0-9:_-]+$/, 'Formato de identificador no v\xE1lido (solo letras, n\xFAmeros, ":", "_" o "-").').refine((val) => !val.includes("..") && !FORBIDDEN_PROTOTYPE_KEYS.has(val.toLowerCase()), "Identificador reservado o secuencia no permitida.");
const seasonModeSchema = z.enum(["continuous", "2027", "2026", "2025", "2024"], { error: "Modo de temporada no v\xE1lido (permitidos: continuous, 2027, 2026, 2025, 2024)." });
const booleanQueryFlagSchema = z.enum(["0", "1", "true", "false"], { error: "Par\xE1metro booleano no v\xE1lido (usa 0 o 1)." }).optional().transform((val) => val === "1" || val === "true");
const isoDateSchema = z.string({ error: "Fecha no v\xE1lida." }).trim().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato estricto YYYY-MM-DD.").refine((val) => {
  const [yStr, mStr, dStr] = val.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isInteger(y) || y < 2020 || y > 2035) return false;
  if (!Number.isInteger(m) || m < 1 || m > 12) return false;
  if (!Number.isInteger(d) || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}, "Fecha fuera de rango o inexistente en el calendario.");
const emptyQuerySchema = z.strictObject({});
const refreshOnlyQuerySchema = z.strictObject({ refresh: booleanQueryFlagSchema });
const awardsQuerySchema = z.strictObject({ season: z.enum(["2027", "2026"], { error: "Temporada de premios no v\xE1lida (permitidos: 2027, 2026)." }).optional().default("2027"), refresh: booleanQueryFlagSchema });
const bootstrapQuerySchema = z.strictObject({ seasonMode: seasonModeSchema.optional(), season: seasonModeSchema.optional(), refresh: booleanQueryFlagSchema, wire: z.enum(["compact", "v2", "legacy"], { error: "Formato wire no v\xE1lido (permitidos: compact, v2, legacy)." }).optional(), full: booleanQueryFlagSchema }).transform((q) => ({ seasonMode: q.seasonMode ?? q.season ?? "continuous", refresh: Boolean(q.refresh), wire: q.wire ?? "compact" }));
const searchQuerySchema = z.strictObject({ q: z.string({ error: "Par\xE1metro de b\xFAsqueda no v\xE1lido." }).max(80, "La b\xFAsqueda no puede superar 80 caracteres.").transform(stripControlChars).refine((s) => !/[<>${}\\]/.test(s), "La b\xFAsqueda contiene caracteres especiales no permitidos.").optional().default("") });
const playerParamsSchema = z.strictObject({ playerId: safeEntityIdSchema });
const playerSummaryQuerySchema = z.strictObject({ seasonMode: seasonModeSchema.optional(), season: seasonModeSchema.optional(), name: z.string().max(80).transform(stripControlChars).optional(), teamAbbr: z.string().max(12).transform(stripControlChars).refine((v) => v === "" || /^[a-zA-Z0-9_-]{1,12}$/.test(v), "Abreviatura de equipo no v\xE1lida.").optional(), position: z.string().max(16).transform(stripControlChars).refine((v) => v === "" || /^[a-zA-Z0-9/_ -]{1,16}$/.test(v), "Posici\xF3n no v\xE1lida.").optional() }).transform((q) => ({ seasonMode: q.seasonMode ?? q.season ?? "continuous", name: q.name, teamAbbr: q.teamAbbr, position: q.position }));
const teamParamsSchema = z.strictObject({ teamId: safeEntityIdSchema });
const gamedayQuerySchema = z.strictObject({ date: z.preprocess((val) => val === "" ? void 0 : val, isoDateSchema.optional()), refresh: booleanQueryFlagSchema });
const gameEventParamsSchema = z.strictObject({ eventId: safeEntityIdSchema });
const adminLoginBodySchema = z.strictObject({ passcode: z.string({ error: "Debes introducir una clave de acceso v\xE1lida." }).trim().min(1, "La clave de acceso no puede estar vac\xEDa.").max(128, "La clave supera la longitud m\xE1xima permitida.") });
const ADMIN_SECURITY_BOUNDS = { nbaApiLimit: { min: 20, max: 2e3 }, nbaApiWindowMinutes: { min: 1, max: 60 }, nbaRefreshLimit: { min: 2, max: 200 }, nbaRefreshWindowMinutes: { min: 1, max: 60 }, adminBruteForceMaxAttempts: { min: 2, max: 25 }, adminBruteForceWindowMinutes: { min: 1, max: 180 }, adminFloodLimit: { min: 10, max: 500 }, adminFloodWindowMinutes: { min: 1, max: 180 }, adminSessionTtlHours: { min: 1, max: 168 } };
const adminSecurityConfigBodySchema = z.strictObject({ nbaApiLimit: z.coerce.number({ error: "El l\xEDmite de peticiones API debe ser num\xE9rico." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.nbaApiLimit.min, "M\xEDnimo 20 peticiones.").max(ADMIN_SECURITY_BOUNDS.nbaApiLimit.max, "M\xE1ximo 2000 peticiones."), nbaApiWindowMinutes: z.coerce.number({ error: "La ventana de tiempo API debe ser num\xE9rica." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.nbaApiWindowMinutes.min, "M\xEDnimo 1 minuto.").max(ADMIN_SECURITY_BOUNDS.nbaApiWindowMinutes.max, "M\xE1ximo 60 minutos."), nbaRefreshLimit: z.coerce.number({ error: "El l\xEDmite de recargas forzadas debe ser num\xE9rico." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.nbaRefreshLimit.min, "M\xEDnimo 2 recargas.").max(ADMIN_SECURITY_BOUNDS.nbaRefreshLimit.max, "M\xE1ximo 200 recargas."), nbaRefreshWindowMinutes: z.coerce.number({ error: "La ventana de recargas forzadas debe ser num\xE9rica." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.nbaRefreshWindowMinutes.min, "M\xEDnimo 1 minuto.").max(ADMIN_SECURITY_BOUNDS.nbaRefreshWindowMinutes.max, "M\xE1ximo 60 minutos."), adminBruteForceMaxAttempts: z.coerce.number({ error: "El m\xE1ximo de intentos fallidos debe ser num\xE9rico." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.adminBruteForceMaxAttempts.min, "M\xEDnimo 2 intentos.").max(ADMIN_SECURITY_BOUNDS.adminBruteForceMaxAttempts.max, "M\xE1ximo 25 intentos."), adminBruteForceWindowMinutes: z.coerce.number({ error: "El tiempo de bloqueo login debe ser num\xE9rico." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.adminBruteForceWindowMinutes.min, "M\xEDnimo 1 minuto.").max(ADMIN_SECURITY_BOUNDS.adminBruteForceWindowMinutes.max, "M\xE1ximo 180 minutos."), adminFloodLimit: z.coerce.number({ error: "El l\xEDmite de tr\xE1fico admin debe ser num\xE9rico." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.adminFloodLimit.min, "M\xEDnimo 10 solicitudes.").max(ADMIN_SECURITY_BOUNDS.adminFloodLimit.max, "M\xE1ximo 500 solicitudes."), adminFloodWindowMinutes: z.coerce.number({ error: "La ventana de tr\xE1fico admin debe ser num\xE9rica." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.adminFloodWindowMinutes.min, "M\xEDnimo 1 minuto.").max(ADMIN_SECURITY_BOUNDS.adminFloodWindowMinutes.max, "M\xE1ximo 180 minutos."), adminSessionTtlHours: z.coerce.number({ error: "La duraci\xF3n de sesi\xF3n debe ser num\xE9rica." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.adminSessionTtlHours.min, "M\xEDnimo 1 hora.").max(ADMIN_SECURITY_BOUNDS.adminSessionTtlHours.max, "M\xE1ximo 168 horas (7 d\xEDas).") });
const gamedayThresholdsBodySchema = z.strictObject({
  explosionShootingTsDiff: z.coerce.number().min(2).max(40),
  explosion3pMinMade: z.coerce.number().int().min(1).max(15),
  explosion3pDelta: z.coerce.number().min(0.5).max(10),
  explosionRebMinTotal: z.coerce.number().int().min(3).max(25),
  explosionRebDelta: z.coerce.number().min(1).max(15),
  explosionAstMinTotal: z.coerce.number().int().min(3).max(25),
  explosionAstDelta: z.coerce.number().min(1).max(15),
  explosionStocksMinTotal: z.coerce.number().int().min(2).max(12),
  explosionStocksDelta: z.coerce.number().min(1).max(10),
  explosionMinutesDelta: z.coerce.number().min(1).max(20),
  explosionScoringPtsDelta: z.coerce.number().min(2).max(25),
  explosionZScoreThreshold: z.coerce.number().min(0.8).max(3.5),

  starterMinMinutesAvg: z.coerce.number().min(10).max(40),
  starterMinPointsAvg: z.coerce.number().min(4).max(30),
  slumpScoringDropPts: z.coerce.number().min(2).max(25),
  slumpShootingMaxTsPct: z.coerce.number().min(25).max(60),
  slumpShootingTsDrop: z.coerce.number().min(4).max(30),
  slumpFoulsTroubleCount: z.coerce.number().int().min(3).max(6),
  slumpFoulsMinutesCut: z.coerce.number().min(2).max(20),
  slumpTurnoversCount: z.coerce.number().int().min(2).max(12),
  slumpTurnoversDelta: z.coerce.number().min(0.5).max(8),
  slump3pSpecialistAvg: z.coerce.number().min(0.8).max(6),
  slump3pDropDelta: z.coerce.number().min(0.5).max(6),
  slumpAstFacilitatorAvg: z.coerce.number().min(2).max(15),
  slumpAstDropDelta: z.coerce.number().min(1).max(10),
  slumpRebInteriorAvg: z.coerce.number().min(4).max(18),
  slumpRebDropDelta: z.coerce.number().min(1).max(12),
  slumpMinutesCutDelta: z.coerce.number().min(2).max(25),
});
const webFeatureFlagsBodySchema = z.strictObject({
  showHeroicBadges: z.boolean({ error: "El estado de insignias debe ser booleano." }),
});
const milestoneNotificationsBodySchema = z.strictObject({
  enabled: z.boolean(),
  lookbackDays: z.coerce.number().int().min(1).max(14),
  maxNotifications: z.coerce.number().int().min(5).max(100),

  scoringMilestoneEnabled: z.boolean(),
  scoringThreshold: z.coerce.number().int().min(20).max(80),
  seasonHighPtsEnabled: z.boolean(),
  seasonHighMinPts: z.coerce.number().int().min(15).max(60),
  seasonHighMinGames: z.coerce.number().int().min(2).max(20),
  threePointExplosionEnabled: z.boolean(),
  threePointThreshold: z.coerce.number().int().min(4).max(16),
  assistExplosionEnabled: z.boolean(),
  assistExplosionThreshold: z.coerce.number().int().min(8).max(25),
  reboundExplosionEnabled: z.boolean(),
  reboundExplosionThreshold: z.coerce.number().int().min(10).max(30),
  orebExplosionEnabled: z.boolean(),
  orebExplosionThreshold: z.coerce.number().int().min(4).max(15),
  tripleDoubleEnabled: z.boolean(),
  tripleDoubleMinStat: z.coerce.number().int().min(8).max(15),
  twentyTwentyEnabled: z.boolean(),
  twentyTwentyPtsMin: z.coerce.number().int().min(15).max(40),
  twentyTwentySecMin: z.coerce.number().int().min(10).max(25),
  doubleDoubleEnabled: z.boolean(),
  doubleDoubleMinPts: z.coerce.number().int().min(10).max(35),
  efficiencySniperEnabled: z.boolean(),
  efficiencyMinPts: z.coerce.number().int().min(15).max(45),
  efficiencyMinFgPct: z.coerce.number().int().min(60).max(95),
  cleanPlaymakerEnabled: z.boolean(),
  cleanPlaymakerMinAst: z.coerce.number().int().min(5).max(18),
  cleanPlaymakerMinPts: z.coerce.number().int().min(10).max(35),

  defenseMilestoneEnabled: z.boolean(),
  defenseMinBlk: z.coerce.number().int().min(3).max(12),
  defenseMinStl: z.coerce.number().int().min(3).max(12),
  defenseComboMinEach: z.coerce.number().int().min(2).max(6),
  gameScoreMilestoneEnabled: z.boolean(),
  gameScoreThreshold: z.coerce.number().int().min(25).max(60),
  plusMinusMilestoneEnabled: z.boolean(),
  plusMinusThreshold: z.coerce.number().int().min(15).max(45),
  teamBlowoutEnabled: z.boolean(),
  teamMarginThreshold: z.coerce.number().int().min(15).max(50),
  teamPointsThreshold: z.coerce.number().int().min(120).max(165),

  heroicBuzzerEnabled: z.boolean(),
  heroicOtTieEnabled: z.boolean(),
  heroicGameWinnerEnabled: z.boolean(),
  heroicGameWinnerMaxSec: z.coerce.number().int().min(1).max(24),
  heroicLongRangeEnabled: z.boolean(),
  heroicLongRangeMinFt: z.coerce.number().int().min(20).max(75),

  cumPointsEnabled: z.boolean(),
  seasonPointsStep: z.coerce.number().int().min(200).max(1000),
  cum3pmEnabled: z.boolean(),
  season3pmStep: z.coerce.number().int().min(25).max(200),
  cumRebEnabled: z.boolean(),
  seasonRebStep: z.coerce.number().int().min(100).max(500),
  cumOrebEnabled: z.boolean(),
  seasonOrebStep: z.coerce.number().int().min(25).max(200),
  cumAstEnabled: z.boolean(),
  seasonAstStep: z.coerce.number().int().min(100).max(500),
  cumStlEnabled: z.boolean(),
  seasonStlStep: z.coerce.number().int().min(15).max(100),
  cumBlkEnabled: z.boolean(),
  seasonBlkStep: z.coerce.number().int().min(15).max(100),
  teamSeasonWinsMilestoneEnabled: z.boolean(),
  teamSeasonWinsStep: z.coerce.number().int().min(5).max(25),

  imminentMilestonesEnabled: z.boolean(),
  imminentPtsWithin: z.coerce.number().int().min(5).max(60),
  imminentOtherWithin: z.coerce.number().int().min(1).max(15),
  streakMilestoneEnabled: z.boolean(),
  streakMinGames: z.coerce.number().int().min(3).max(20),
  streakPtsThreshold: z.coerce.number().int().min(15).max(35),
  teamWinStreakEnabled: z.boolean(),
  teamWinStreakMin: z.coerce.number().int().min(2).max(20),
});
const kpiKeyStringSchema = z.string().trim().min(1, "La clave del KPI no puede estar vacía.").max(60, "Clave de KPI demasiado larga.").regex(/^[a-zA-Z0-9_]+$/, "Clave de KPI con formato no válido.");
const inspectorKpiDefaultsBodySchema = z.strictObject({
  playerDefaultKpiKeys: z.array(kpiKeyStringSchema).min(1, "Debe haber al menos 1 KPI para jugador.").max(80, "Máximo 80 KPIs por defecto."),
  teamDefaultKpiKeys: z.array(kpiKeyStringSchema).min(1, "Debe haber al menos 1 KPI para equipo.").max(80, "Máximo 80 KPIs por defecto."),
});
const safeRivalKeySchema = z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/, "Clave de equipo rival no válida.").refine((k) => !FORBIDDEN_PROTOTYPE_KEYS.has(k.toLowerCase()), "Clave reservada.");
const safeGameCorrectionKeySchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_:-]+$/, "Clave de corrección no válida.").refine((k) => !FORBIDDEN_PROTOTYPE_KEYS.has(k.toLowerCase()), "Clave reservada.");
const gameCorrectionItemSchema = z.object({
  fptsDelta: z.number().finite(),
  reason: z.string().max(200).optional().default(""),
  updatedAt: z.number().finite().nonnegative().optional(),
});
const manualFantasyStateBodySchema = z.object({
  updatedAt: z.number().finite().nonnegative().optional(),
  myTeamName: z.string().max(80, "El nombre del equipo no puede superar 80 caracteres.").transform(stripControlChars).optional(),
  roster: z.array(z.object({ playerId: safeEntityIdSchema, slot: z.enum(["starter", "bench", "ir"]) })).max(25, "La plantilla no puede superar 25 jugadores."),
  takenRivalIds: z.array(safeEntityIdSchema).max(600, "Demasiados jugadores rivales marcados."),
  rivalRosters: z.record(safeRivalKeySchema, z.array(safeEntityIdSchema).max(30)),
  rivalTeamNames: z.record(safeRivalKeySchema, z.string().max(80).transform(stripControlChars)),
  gameCorrections: z.record(safeGameCorrectionKeySchema, gameCorrectionItemSchema).optional(),
}).passthrough();
function getValidated(req) {
  const bag = req.__validated;
  if (bag) {
    return bag;
  }
  return { params: req.params ?? {}, query: req.query ?? {}, body: req.body };
}
function validateRequest(schemas) {
  return (req, res, next) => {
    const issues = [];
    let parsedParams = req.params;
    let parsedQuery = req.query;
    let parsedBody = req.body;
    if (schemas.params) {
      const r = schemas.params.safeParse(req.params ?? {});
      if (!r.success) {
        for (const iss of r.error.issues) {
          const subPath = iss.path.map(String).join(".");
          issues.push({ field: subPath ? `params.${subPath}` : "params", message: iss.message });
        }
      } else {
        parsedParams = r.data;
      }
    }
    if (schemas.query) {
      const rawQueryObj = req.query && typeof req.query === "object" ? req.query : {};
      const cleanedQuery = {};
      for (const [k, v] of Object.entries(rawQueryObj)) {
        if (k === "__api_path" || k === "path" || k.startsWith("__vercel") || k.startsWith("nxtP")) {
          continue;
        }
        cleanedQuery[k] = v;
      }
      const r = schemas.query.safeParse(cleanedQuery);
      if (!r.success) {
        for (const iss of r.error.issues) {
          const subPath = iss.path.map(String).join(".");
          issues.push({ field: subPath ? `query.${subPath}` : "query", message: iss.message });
        }
      } else {
        parsedQuery = r.data;
      }
    }
    if (schemas.body) {
      const r = schemas.body.safeParse(req.body ?? {});
      if (!r.success) {
        for (const iss of r.error.issues) {
          const subPath = iss.path.map(String).join(".");
          issues.push({ field: subPath ? `body.${subPath}` : "body", message: iss.message });
        }
      } else {
        parsedBody = r.data;
      }
    }
    if (issues.length > 0) {
      res.status(400).json({ error: issues[0]?.message || "Par\xE1metros de entrada no v\xE1lidos.", code: "VALIDATION_ERROR", issues });
      return;
    }
    req.__validated = { params: parsedParams, query: parsedQuery, body: parsedBody };
    next();
  };
}
const advancedCategorySchema = z.enum(["zones", "clutch", "defense_hustle", "tracking", "playtypes", "scoring", "four_factors", "violations"]).optional().default("zones");
const advancedLeagueQuerySchema = z.strictObject({
  season: seasonModeSchema.optional(),
  category: advancedCategorySchema,
  refresh: booleanQueryFlagSchema,
  v: z.string().max(32).optional(),
});
const advancedLineupsQuerySchema = z.strictObject({
  season: seasonModeSchema.optional(),
  group: z.enum(["2", "3", "5"]).optional().default("5").transform(Number),
  teamId: z.string().optional().default("0"),
  refresh: booleanQueryFlagSchema,
  v: z.string().max(32).optional(),
});
const advancedEntityQuerySchema = z.strictObject({
  season: seasonModeSchema.optional(),
  teamId: z.string().optional(),
  refresh: booleanQueryFlagSchema,
  v: z.string().max(32).optional(),
});
const advancedHeroicShotsQuerySchema = z.strictObject({
  season: z.enum(["all", "continuous", "2027", "2026", "2025", "2024"]).optional(),
  refresh: booleanQueryFlagSchema,
  v: z.string().max(32).optional(),
});
export {
  ADMIN_SECURITY_BOUNDS,
  adminLoginBodySchema,
  adminSecurityConfigBodySchema,
  awardsQuerySchema,
  booleanQueryFlagSchema,
  bootstrapQuerySchema,
  emptyQuerySchema,
  gameEventParamsSchema,
  gamedayQuerySchema,
  gamedayThresholdsBodySchema,
  getValidated,
  isoDateSchema,
  manualFantasyStateBodySchema,
  playerParamsSchema,
  playerSummaryQuerySchema,
  refreshOnlyQuerySchema,
  safeEntityIdSchema,
  searchQuerySchema,
  seasonModeSchema,
  stripControlChars,
  teamParamsSchema,
  validateRequest,
  advancedLeagueQuerySchema,
  advancedLineupsQuerySchema,
  advancedEntityQuerySchema,
  advancedHeroicShotsQuerySchema,
  webFeatureFlagsBodySchema,
  inspectorKpiDefaultsBodySchema,
  milestoneNotificationsBodySchema
};

