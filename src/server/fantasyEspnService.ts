// @ts-nocheck
const __name = (fn, _n) => fn;
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OFFICIAL_LEAGUE_RULES, normalizePlayerLookupKey } from "../utils/fantasyScoring.ts";
import { STATIC_SCHEDULE_2027, buildWeeklyWindowsFromSchedule, getEasternTodayIso } from "../utils/staticSchedule.ts";
import { translateMedicalDetailEs } from "./scoutingEngine.ts";
import { executeUpstashCommand, getRedisRestConfig } from "./upstashRedis.ts";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = [path.resolve(process.cwd(), "data"), path.resolve(__dirname, "../data"), path.resolve(__dirname, "../../data")].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "data");
const MANUAL_STATE_FILE = path.join(DATA_DIR, "fantasy-manual-league.json");
const SERVERLESS_TMP_STATE_FILE = "/tmp/radarnba-fantasy-manual-league.json";
const FANTASY_REDIS_KEY = "radarnba:fantasy:manual_league_v1";

function getFantasyStorageBackendInfo() {
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    return { storageMode: "upstash-redis", cloudConfigured: true };
  }
  if (process.env.VERCEL) {
    return { storageMode: "tmp-ephemeral", cloudConfigured: false };
  }
  return { storageMode: "local-disk", cloudConfigured: false };
}

function sanitizeManualFantasyState(raw) {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw;
  const updatedAt = typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt) ? obj.updatedAt : Date.now();
  const myTeamName = typeof obj.myTeamName === "string" && obj.myTeamName.trim() ? obj.myTeamName.trim().slice(0, 80) : "Mi Equipo Fantasy";
  const roster = [];
  const seenRoster = /* @__PURE__ */ new Set();
  if (Array.isArray(obj.roster)) {
    for (const item of obj.roster) {
      if (!item || typeof item !== "object") continue;
      const r = item;
      const pid = String(r.playerId || "").trim();
      const slot = r.slot === "bench" ? "bench" : r.slot === "ir" ? "ir" : "starter";
      if (pid && !seenRoster.has(pid) && roster.length < OFFICIAL_LEAGUE_RULES.maxContracts) {
        seenRoster.add(pid);
        roster.push({ playerId: pid, slot });
      }
    }
  }
  const takenRivalIds = Array.isArray(obj.takenRivalIds) ? Array.from(new Set(obj.takenRivalIds.map((x) => String(x || "").trim()).filter(Boolean))) : [];
  const rivalRosters = {};
  if (obj.rivalRosters && typeof obj.rivalRosters === "object") {
    for (const [k, v] of Object.entries(obj.rivalRosters)) {
      const cleanKey = String(k || "").trim().slice(0, 40);
      if (!cleanKey || !Array.isArray(v)) continue;
      rivalRosters[cleanKey] = Array.from(new Set(v.map((x) => String(x || "").trim()).filter(Boolean)));
    }
  }
  const rivalTeamNames = {};
  if (obj.rivalTeamNames && typeof obj.rivalTeamNames === "object") {
    for (const [k, v] of Object.entries(obj.rivalTeamNames)) {
      const cleanKey = String(k || "").trim().slice(0, 40);
      if (!cleanKey || typeof v !== "string") continue;
      rivalTeamNames[cleanKey] = v.slice(0, 80);
    }
  }
  return { updatedAt, myTeamName, roster, takenRivalIds, rivalRosters, rivalTeamNames };
}
function readManualFantasyStateFromDisk() {
  const candidates = process.env.VERCEL ? [SERVERLESS_TMP_STATE_FILE, MANUAL_STATE_FILE] : [MANUAL_STATE_FILE];
  for (const target of candidates) {
    try {
      if (!fs.existsSync(target)) continue;
      const content = fs.readFileSync(target, "utf8");
      const parsed = JSON.parse(content);
      const valid = sanitizeManualFantasyState(parsed);
      if (valid) return valid;
    } catch {
    }
  }
  return null;
}
function persistNormalizedStateToLocalDisk(toSave) {
  try {
    if (process.env.VERCEL) {
      const tmpTarget = `${SERVERLESS_TMP_STATE_FILE}.tmp`;
      fs.writeFileSync(tmpTarget, JSON.stringify(toSave, null, 2), "utf8");
      fs.renameSync(tmpTarget, SERVERLESS_TMP_STATE_FILE);
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmpFile = `${MANUAL_STATE_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(toSave, null, 2), "utf8");
      fs.renameSync(tmpFile, MANUAL_STATE_FILE);
    }
  } catch (err) {
    console.error("Error writing fantasy-manual-league.json:", err);
  }
}
function writeManualFantasyStateToDisk(rawState) {
  const sanitized = sanitizeManualFantasyState(rawState);
  if (!sanitized) return null;
  const toSave = { ...sanitized, updatedAt: Math.max(sanitized.updatedAt, Date.now()) };
  persistNormalizedStateToLocalDisk(toSave);
  return toSave;
}
async function readManualFantasyState() {
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      const rawResult = await executeUpstashCommand(redisCfg, ["GET", FANTASY_REDIS_KEY]);
      if (rawResult !== null && rawResult !== void 0) {
        const parsed = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
        const valid = sanitizeManualFantasyState(parsed);
        if (valid) return valid;
      }
      return null;
    } catch (err) {
      console.error("Error reading Fantasy state from Upstash Redis:", err);
    }
  }
  return readManualFantasyStateFromDisk();
}
async function writeManualFantasyState(rawState) {
  const sanitized = sanitizeManualFantasyState(rawState);
  if (!sanitized) return null;
  const toSave = { ...sanitized, updatedAt: Math.max(sanitized.updatedAt, Date.now()) };
  persistNormalizedStateToLocalDisk(toSave);
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    await executeUpstashCommand(redisCfg, ["SET", FANTASY_REDIS_KEY, JSON.stringify(toSave)]);
  }
  return toSave;
}
function buildWeeklyWindows(scheduleGames, referenceTodayIso) {
  const effectiveGames = scheduleGames.length >= 200 ? scheduleGames : STATIC_SCHEDULE_2027;
  return buildWeeklyWindowsFromSchedule(effectiveGames, referenceTodayIso);
}
function mapInjuryStatusToSpanish(rawStatus, rawDetail) {
  const stLow = (rawStatus || "").toLowerCase().trim();
  const detLow = (rawDetail || "").toLowerCase().trim();
  const translated = translateMedicalDetailEs(rawDetail);
  const combinedText = `${detLow} ${(translated || "").toLowerCase()}`;

  const hasRestKeywords = /\b(?:rest|load management|injury management|recovery|descanso|dosificaci|gesti[oó]n de cargas)\b/i.test(
    combinedText
  );
  const hasLongTermKeywords =
    /\b(?:surgery|fracture|torn|acl|mcl|achilles|meniscus|indefinitely|months|season-ending|out for season|re-evaluated|extended|cirug|rotura|cruzado|fractur|meses|indefinid|temporada|prolongad|aquiles|menisco|8-10|6-8|4-6|3-4|2-4)\b/i.test(
      combinedText
    ) ||
    ((combinedText.includes("semanas") || combinedText.includes("weeks")) &&
      !combinedText.includes("esta semana") &&
      !combinedText.includes("this week") &&
      !combinedText.includes("proxima semana") &&
      !combinedText.includes("next week"));

  if (stLow.includes("suspension") || detLow.includes("suspension")) {
    return {
      severity: "suspended",
      absenceTier: "long_term",
      statusLabelEs: "Sancionado",
      detailEs: translated || "Sanci\xF3n disciplinaria oficial NBA",
    };
  }
  if (
    stLow.includes("injured reserve") ||
    stLow === "ir" ||
    /\b(?:out for season|season-ending)\b/i.test(detLow)
  ) {
    return {
      severity: "ir",
      absenceTier: "long_term",
      statusLabelEs: "Lista IR (Larga duraci\xF3n)",
      detailEs: translated || "En reserva de lesionados de larga duraci\xF3n",
    };
  }
  if (stLow.includes("out")) {
    if (hasLongTermKeywords) {
      return {
        severity: "out",
        absenceTier: "long_term",
        statusLabelEs: "Baja larga duraci\xF3n",
        detailEs: translated || "Baja m\xE9dica prolongada confirmada",
      };
    }
    if (hasRestKeywords) {
      return {
        severity: "out",
        absenceTier: "b2b_rest",
        statusLabelEs: "Baja por descanso",
        detailEs: translated || "Descanso puntual / gesti\xF3n de cargas",
      };
    }
    return {
      severity: "out",
      absenceTier: "punctual",
      statusLabelEs: "Baja puntual (Corto plazo)",
      detailEs: translated || "Baja puntual confirmada en parte oficial",
    };
  }
  if (stLow.includes("doubtful")) {
    return {
      severity: "doubtful",
      absenceTier: "punctual",
      statusLabelEs: "Muy dudoso (Puntual)",
      detailEs: translated || "Participaci\xF3n muy improbable en el pr\xF3ximo partido",
    };
  }
  if (stLow.includes("day-to-day") || stLow.includes("dtd")) {
    return {
      severity: "dtd",
      absenceTier: hasRestKeywords ? "b2b_rest" : "punctual",
      statusLabelEs: hasRestKeywords ? "DTD (Gesti\xF3n cargas)" : "D\xEDa a d\xEDa (DTD)",
      detailEs: translated || "Seguimiento diario previo al partido",
    };
  }
  if (stLow.includes("probable")) {
    return {
      severity: "probable",
      absenceTier: hasRestKeywords ? "b2b_rest" : "punctual",
      statusLabelEs: "Probable",
      detailEs: translated || "Molestias leves, previsto disponible",
    };
  }
  if (stLow.includes("questionable")) {
    return {
      severity: "questionable",
      absenceTier: hasRestKeywords ? "b2b_rest" : "punctual",
      statusLabelEs: hasRestKeywords ? "Duda (Descanso/B2B)" : "Cuestionable (Puntual)",
      detailEs: translated || "En evaluaci\xF3n m\xE9dica previa al partido",
    };
  }
  return {
    severity: "questionable",
    absenceTier: "punctual",
    statusLabelEs: "Seguimiento m\xE9dico",
    detailEs: translated || "Observaci\xF3n m\xE9dica en parte de equipo",
  };
}
let cachedNbaContext = null;
async function buildFantasyEspnSyncPayload(params) {
  const { allPlayers, fetchLeagueScheduleGames, fetchEspnInjuriesByName, forceRefresh = false } = params;
  const [savedState, backendInfo] = await Promise.all([
    readManualFantasyState(),
    Promise.resolve(getFantasyStorageBackendInfo()),
  ]);
  if (!forceRefresh && cachedNbaContext && cachedNbaContext.expiresAt > Date.now()) {
    return { ...cachedNbaContext.payloadBase, savedState, ...backendInfo };
  }
  const playersByNorm = /* @__PURE__ */ new Map();
  const playersByRawNorm = /* @__PURE__ */ new Map();
  for (const p of allPlayers) {
    const k1 = normalizePlayerLookupKey(p.name);
    const k2 = (p.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (k1) {
      const arr = playersByNorm.get(k1) || [];
      arr.push(p);
      playersByNorm.set(k1, arr);
    }
    if (k2) {
      const arr = playersByRawNorm.get(k2) || [];
      arr.push(p);
      playersByRawNorm.set(k2, arr);
    }
  }
  const resolveNbaPlayerId = __name((fullName) => {
    const kRaw = (fullName || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const kClean = normalizePlayerLookupKey(fullName);
    const cands = playersByRawNorm.get(kRaw) || playersByNorm.get(kClean) || [];
    return cands.length > 0 ? cands[0].id : null;
  }, "resolveNbaPlayerId");
  const [scheduleGames, rawInjuriesMap] = await Promise.all([fetchLeagueScheduleGames(forceRefresh), fetchEspnInjuriesByName(forceRefresh)]);
  const todayIso = getEasternTodayIso();
  const weeks = buildWeeklyWindows(scheduleGames, todayIso);
  const injuriesByNormName = {};
  const injuriesByPlayerId = {};
  for (const [normKey, rawInj] of rawInjuriesMap.entries()) {
    const mapped = mapInjuryStatusToSpanish(rawInj.status, rawInj.detail);
    const alert = {
      playerNameNorm: normKey,
      displayName: normKey,
      severity: mapped.severity,
      absenceTier: mapped.absenceTier,
      statusLabelEs: mapped.statusLabelEs,
      detailEs: mapped.detailEs,
    };
    injuriesByNormName[normKey] = alert;
    const matchedNbaId = resolveNbaPlayerId(normKey);
    if (matchedNbaId) {
      const pObj = allPlayers.find((p) => p.id === matchedNbaId);
      if (pObj) {
        alert.displayName = pObj.name;
      }
      injuriesByPlayerId[matchedNbaId] = alert;
    }
  }
  const payloadBase = { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), injuriesByNormName, injuriesByPlayerId, weeks, defaultWeekId: "current" };
  cachedNbaContext = { expiresAt: Date.now() + 5 * 60 * 1e3, payloadBase };
  return { ...payloadBase, savedState, ...backendInfo };
}
export {
  buildFantasyEspnSyncPayload,
  getFantasyStorageBackendInfo,
  readManualFantasyState,
  readManualFantasyStateFromDisk,
  sanitizeManualFantasyState,
  writeManualFantasyState,
  writeManualFantasyStateToDisk
};
