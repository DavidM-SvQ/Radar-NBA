// @ts-nocheck
import { z } from "zod";
function stripControlChars(raw) {
  return raw.replace(/[\x00-\x1F\x7F]+/g, " ").trim();
}
const FORBIDDEN_PROTOTYPE_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
const safeEntityIdSchema = z.string({ error: "Identificador requerido." }).trim().min(1, "El identificador no puede estar vac\xEDo.").max(48, "Identificador demasiado largo (m\xE1x. 48 caracteres).").regex(/^[a-zA-Z0-9:_-]+$/, 'Formato de identificador no v\xE1lido (solo letras, n\xFAmeros, ":", "_" o "-").').refine((val) => !val.includes("..") && !FORBIDDEN_PROTOTYPE_KEYS.has(val.toLowerCase()), "Identificador reservado o secuencia no permitida.");
const seasonModeSchema = z.enum(["continuous", "2027", "2026"], { error: "Modo de temporada no v\xE1lido (permitidos: continuous, 2027, 2026)." });
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
const safeRivalKeySchema = z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/, "Clave de equipo rival no v\xE1lida.").refine((k) => !FORBIDDEN_PROTOTYPE_KEYS.has(k.toLowerCase()), "Clave reservada.");
const manualFantasyStateBodySchema = z.strictObject({ updatedAt: z.number().finite().nonnegative().optional(), myTeamName: z.string().max(80, "El nombre del equipo no puede superar 80 caracteres.").transform(stripControlChars).optional(), roster: z.array(z.strictObject({ playerId: safeEntityIdSchema, slot: z.enum(["starter", "bench", "ir"]) })).max(25, "La plantilla no puede superar 25 jugadores."), takenRivalIds: z.array(safeEntityIdSchema).max(600, "Demasiados jugadores rivales marcados."), rivalRosters: z.record(safeRivalKeySchema, z.array(safeEntityIdSchema).max(30)), rivalTeamNames: z.record(safeRivalKeySchema, z.string().max(80).transform(stripControlChars)) });
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
export {
  ADMIN_SECURITY_BOUNDS,
  adminLoginBodySchema,
  adminSecurityConfigBodySchema,
  booleanQueryFlagSchema,
  bootstrapQuerySchema,
  emptyQuerySchema,
  gameEventParamsSchema,
  gamedayQuerySchema,
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
  validateRequest
};
