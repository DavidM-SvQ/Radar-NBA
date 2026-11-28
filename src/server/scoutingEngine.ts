// @ts-nocheck
const __name = (fn, _n) => fn;
import fs from "fs";
import path from "path";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { STATIC_SCHEDULE_2027 } from "../utils/staticSchedule.ts";
import { ESPN_TEAM_IDS, NBA_TEAMS_MAP } from "../utils/teamLogos.ts";
import { executeUpstashCommand, getRedisRestConfig } from "./upstashRedis.ts";
import { analyzeGamePlayByPlayHeroicShots, getLeagueHeroicShots } from "./nbaAdvancedStatsService.ts";
import { getPlayerPriorCareerBaseline } from "./nbaCareerHistoryService.ts";
import { translateHeroicShotActionCompactEs } from "../utils/heroicPlayEs.ts";
import {
  buildEditorialDirectivesPromptBlock,
  bumpEditorialCacheEpoch,
  loadEditorialConfig,
} from "./editorialConfigService.ts";
const NBA_LIVE_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Referer: "https://www.nba.com/", Origin: "https://www.nba.com", Accept: "application/json" };
const NBA_TEAM_ARENAS = { ATL: { arenaName: "State Farm Arena", arenaCity: "Atlanta" }, BOS: { arenaName: "TD Garden", arenaCity: "Boston" }, BKN: { arenaName: "Barclays Center", arenaCity: "Brooklyn" }, CHA: { arenaName: "Spectrum Center", arenaCity: "Charlotte" }, CHI: { arenaName: "United Center", arenaCity: "Chicago" }, CLE: { arenaName: "Rocket Arena", arenaCity: "Cleveland" }, DAL: { arenaName: "American Airlines Center", arenaCity: "Dallas" }, DEN: { arenaName: "Ball Arena", arenaCity: "Denver" }, DET: { arenaName: "Little Caesars Arena", arenaCity: "Detroit" }, GSW: { arenaName: "Chase Center", arenaCity: "San Francisco" }, HOU: { arenaName: "Toyota Center", arenaCity: "Houston" }, IND: { arenaName: "Gainbridge Fieldhouse", arenaCity: "Indianapolis" }, LAC: { arenaName: "Intuit Dome", arenaCity: "Inglewood" }, LAL: { arenaName: "Crypto.com Arena", arenaCity: "Los \xC1ngeles" }, MEM: { arenaName: "FedExForum", arenaCity: "Memphis" }, MIA: { arenaName: "Kaseya Center", arenaCity: "Miami" }, MIL: { arenaName: "Fiserv Forum", arenaCity: "Milwaukee" }, MIN: { arenaName: "Target Center", arenaCity: "Minneapolis" }, NOP: { arenaName: "Smoothie King Center", arenaCity: "Nueva Orleans" }, NYK: { arenaName: "Madison Square Garden", arenaCity: "Nueva York" }, OKC: { arenaName: "Paycom Center", arenaCity: "Oklahoma City" }, ORL: { arenaName: "Kia Center", arenaCity: "Orlando" }, PHI: { arenaName: "Wells Fargo Center", arenaCity: "Filadelfia" }, PHX: { arenaName: "Footprint Center", arenaCity: "Phoenix" }, POR: { arenaName: "Moda Center", arenaCity: "Portland" }, SAC: { arenaName: "Golden 1 Center", arenaCity: "Sacramento" }, SAS: { arenaName: "Frost Bank Center", arenaCity: "San Antonio" }, TOR: { arenaName: "Scotiabank Arena", arenaCity: "Toronto" }, UTA: { arenaName: "Delta Center", arenaCity: "Salt Lake City" }, WAS: { arenaName: "Capital One Arena", arenaCity: "Washington" } };
const KNOWN_SPANISH_NBA_PLAYERS = /* @__PURE__ */ new Set(["santi aldama", "santiago aldama", "hugo gonzalez", "usman garuba", "eli ndiaye", "eli john ndiaye", "juan nunez", "aday mara", "izan almansa", "baba miller", "great osobor", "willy hernangomez", "juancho hernangomez", "ricky rubio", "alex abrines"]);
const reportMemoryCache = /* @__PURE__ */ new Map();
const reportInflight = /* @__PURE__ */ new Map();
const reportInflightStartedAt = /* @__PURE__ */ new Map();
const NARRATIVE_DISK_CACHE_FILE = process.env.VERCEL
  ? "/tmp/radarnba-narratives-cache.json"
  : path.resolve(process.cwd(), "data", "scouting-narratives-cache.json");
let diskNarrativeStoreCache: Record<string, { expiresAt: number; data: any }> | null = null;
let diskNarrativeFlushTimer: ReturnType<typeof setTimeout> | null = null;

function loadDiskNarrativeStore(): Record<string, { expiresAt: number; data: any }> {
  if (diskNarrativeStoreCache) return diskNarrativeStoreCache;
  try {
    if (fs.existsSync(NARRATIVE_DISK_CACHE_FILE)) {
      const raw = fs.readFileSync(NARRATIVE_DISK_CACHE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const now = Date.now();
        const pruned: Record<string, { expiresAt: number; data: any }> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v && typeof v === "object" && typeof (v as any).expiresAt === "number" && (v as any).expiresAt > now && (v as any).data) {
            pruned[k] = v as { expiresAt: number; data: any };
          }
        }
        diskNarrativeStoreCache = pruned;
        return diskNarrativeStoreCache;
      }
    }
  } catch {
  }
  diskNarrativeStoreCache = {};
  return diskNarrativeStoreCache;
}

function scheduleDiskNarrativeFlush() {
  if (diskNarrativeFlushTimer) return;
  diskNarrativeFlushTimer = setTimeout(() => {
    diskNarrativeFlushTimer = null;
    try {
      const store = loadDiskNarrativeStore();
      const now = Date.now();
      const entries = Object.entries(store)
        .filter(([, v]) => v && v.expiresAt > now)
        .slice(-250);
      const compact = Object.fromEntries(entries);
      diskNarrativeStoreCache = compact;
      if (!process.env.VERCEL) {
        fs.mkdirSync(path.dirname(NARRATIVE_DISK_CACHE_FILE), { recursive: true });
      }
      const tmp = `${NARRATIVE_DISK_CACHE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(compact), "utf8");
      fs.renameSync(tmp, NARRATIVE_DISK_CACHE_FILE);
    } catch {
    }
  }, 400);
}

async function readSharedPersistedNarrative(cacheKey: string) {
  const mem = reportMemoryCache.get(cacheKey);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.data;
  }
  const diskStore = loadDiskNarrativeStore();
  const diskHit = diskStore[cacheKey];
  if (diskHit && diskHit.expiresAt > Date.now() && diskHit.data) {
    reportMemoryCache.set(cacheKey, diskHit);
    return diskHit.data;
  }
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      const raw = await executeUpstashCommand(redisCfg, ["GET", `radarnba:nar:${cacheKey}`], 2500);
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && parsed.expiresAt > Date.now() && parsed.data) {
          reportMemoryCache.set(cacheKey, parsed);
          diskStore[cacheKey] = parsed;
          scheduleDiskNarrativeFlush();
          return parsed.data;
        }
      }
    } catch {
    }
  }
  return null;
}

async function writeSharedPersistedNarrative(cacheKey: string, data: any, ttlMs: number) {
  const entry = { expiresAt: Date.now() + ttlMs, data };
  reportMemoryCache.set(cacheKey, entry);
  if (data?.engineMode !== "gemini_search") return;
  const diskStore = loadDiskNarrativeStore();
  diskStore[cacheKey] = entry;
  scheduleDiskNarrativeFlush();
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      const ttlSec = Math.max(60, Math.round(ttlMs / 1000));
      await executeUpstashCommand(
        redisCfg,
        ["SET", `radarnba:nar:${cacheKey}`, JSON.stringify(entry), "EX", String(ttlSec)],
        3000
      );
    } catch {
    }
  }
}

async function purgeSharedPersistedNarrativeCache(opts: {
  scope: "all" | "date" | "game";
  date?: string;
  eventId?: string;
}) {
  const scope = opts.scope;
  const redisCfg = getRedisRestConfig();
  const diskStore = loadDiskNarrativeStore();
  let clearedLocalKeys = 0;

  if (scope === "all") {
    for (const k of [...reportMemoryCache.keys()]) {
      if (k.startsWith("game_narrative_") || k.startsWith("gameday_chronicle_")) {
        reportMemoryCache.delete(k);
        clearedLocalKeys += 1;
      }
    }
    for (const k of Object.keys(diskStore)) {
      if (k.startsWith("game_narrative_") || k.startsWith("gameday_chronicle_")) {
        delete diskStore[k];
      }
    }
    scheduleDiskNarrativeFlush();
    const updatedCfg = await bumpEditorialCacheEpoch();
    return {
      clearedScope: "all" as const,
      cacheEpoch: updatedCfg.cacheEpoch,
      clearedLocalKeys,
      clearedAt: Date.now(),
    };
  }

  const currentCfg = await loadEditorialConfig(true);
  const targetKeys: string[] = [];
  if (scope === "date" && opts.date) {
    targetKeys.push(
      `gameday_chronicle_v18:v2_tactical:e${currentCfg.cacheEpoch}:${opts.date}`,
      `gameday_chronicle_v18:v1_classic:e${currentCfg.cacheEpoch}:${opts.date}`,
      `gameday_chronicle_v18:e${currentCfg.cacheEpoch}:${opts.date}`,
      `gameday_chronicle_v17:e${currentCfg.cacheEpoch}:${opts.date}`,
      `gameday_chronicle_v16:${opts.date}`
    );
    for (const k of [...reportMemoryCache.keys()]) {
      if (k.startsWith("gameday_chronicle_") && k.endsWith(`:${opts.date}`)) {
        reportMemoryCache.delete(k);
        clearedLocalKeys += 1;
      }
    }
    for (const k of Object.keys(diskStore)) {
      if (k.startsWith("gameday_chronicle_") && k.endsWith(`:${opts.date}`)) {
        delete diskStore[k];
      }
    }
  } else if (scope === "game" && opts.eventId) {
    targetKeys.push(
      `game_narrative_v18:v2_tactical:e${currentCfg.cacheEpoch}:${opts.eventId}`,
      `game_narrative_v18:v1_classic:e${currentCfg.cacheEpoch}:${opts.eventId}`,
      `game_narrative_v18:e${currentCfg.cacheEpoch}:${opts.eventId}`,
      `game_narrative_v17:e${currentCfg.cacheEpoch}:${opts.eventId}`,
      `game_narrative_v16:${opts.eventId}`
    );
    for (const k of [...reportMemoryCache.keys()]) {
      if (k.startsWith("game_narrative_") && k.endsWith(`:${opts.eventId}`)) {
        reportMemoryCache.delete(k);
        clearedLocalKeys += 1;
      }
    }
    for (const k of Object.keys(diskStore)) {
      if (k.startsWith("game_narrative_") && k.endsWith(`:${opts.eventId}`)) {
        delete diskStore[k];
      }
    }
  }

  scheduleDiskNarrativeFlush();
  if (redisCfg && targetKeys.length > 0) {
    try {
      await executeUpstashCommand(
        redisCfg,
        ["DEL", ...targetKeys.map((k) => `radarnba:nar:${k}`)],
        3000
      );
    } catch {
      // Ignore transient Redis delete errors
    }
  }

  return {
    clearedScope: scope,
    target: opts.date || opts.eventId || null,
    cacheEpoch: currentCfg.cacheEpoch,
    clearedLocalKeys,
    clearedAt: Date.now(),
  };
}
function round1(val) {
  return Math.round((Number(val) || 0) * 10) / 10;
}
function normalizePlain(str) {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function isSpanishPlayerCheck(name, country) {
  const normCountry = normalizePlain(country || "");
  if (normCountry === "spain" || normCountry === "espana") return true;
  const normName = normalizePlain(name);
  return KNOWN_SPANISH_NBA_PLAYERS.has(normName);
}
function formatThousandsEs(num) {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function parseIsoMinutes(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    let mins = Math.floor(raw);
    let secs = Math.round((raw - mins) * 60);
    if (secs >= 60) {
      mins += 1;
      secs = 0;
    }
    return { decimal: round1(raw), formatted: `${mins}:${String(secs).padStart(2, "0")}` };
  }
  const str = String(raw || "").trim();
  const isoMatch = str.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/i);
  if (isoMatch) {
    let mins = Number(isoMatch[1]) || 0;
    let secs = Math.round(Number(isoMatch[2]) || 0);
    if (secs >= 60) {
      mins += 1;
      secs = 0;
    }
    return { decimal: round1(mins + secs / 60), formatted: `${mins}:${String(secs).padStart(2, "0")}` };
  }
  const colonMatch = str.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const mins = Number(colonMatch[1]) || 0;
    const secs = Math.min(59, Number(colonMatch[2]) || 0);
    return { decimal: round1(mins + secs / 60), formatted: `${mins}:${String(secs).padStart(2, "0")}` };
  }
  const n = Number(str) || 0;
  return { decimal: round1(n), formatted: `${Math.round(n)}:00` };
}
function buildShortPlayerName(fullName, firstName, familyName) {
  const f = (firstName || "").trim();
  const l = (familyName || "").trim();
  if (f && l) {
    return `${f.charAt(0).toUpperCase()}. ${l}`;
  }
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName.trim() || "Jugador";
  const initial = parts[0].charAt(0).toUpperCase();
  const rest = parts.slice(1).join(" ");
  return `${initial}. ${rest}`;
}
function sanitizeJersey(rawJersey, fallbackJersey) {
  const cleanA = String(rawJersey ?? "").replace(/[^0-9]/g, "").trim();
  if (cleanA.length > 0) return cleanA;
  const cleanB = String(fallbackJersey ?? "").replace(/[^0-9]/g, "").trim();
  if (cleanB.length > 0) return cleanB;
  return "0";
}
function computeHollingerGmSc(stats) {
  return round1(stats.points + 0.4 * stats.fgm - 0.7 * stats.fga - 0.4 * (stats.fta - stats.ftm) + 0.7 * stats.oreb + 0.3 * stats.dreb + stats.stl + 0.7 * stats.ast + 0.7 * stats.blk - 0.4 * stats.pf - stats.tov);
}
function parsePbpClockRemaining(rawClock, periodNum = 1) {
  const maxPeriodMins = Number(periodNum) > 4 ? 5 : 12;
  const str = String(rawClock || "").trim();
  const isoMatch = str.match(/^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (isoMatch && (isoMatch[1] !== undefined || isoMatch[2] !== undefined)) {
    let mins = Math.max(0, Number(isoMatch[1] || 0) || 0);
    let secs = Math.round(Math.max(0, Number(isoMatch[2] || 0) || 0));
    if (secs >= 60) {
      mins += Math.floor(secs / 60);
      secs = secs % 60;
    }
    if (mins > maxPeriodMins || (mins === maxPeriodMins && secs > 0)) return "";
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }
  const colonMatch = str.match(/^(\d{1,2}):(\d{2})(?:\.\d+)?$/);
  if (colonMatch) {
    const mins = Number(colonMatch[1]) || 0;
    const secs = Math.min(59, Number(colonMatch[2]) || 0);
    if (mins > maxPeriodMins || (mins === maxPeriodMins && secs > 0)) return "";
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }
  const secOnlyMatch = str.match(/^(\d+(?:\.\d+)?)$/);
  if (secOnlyMatch) {
    const totalSecs = Math.round(Math.max(0, Number(secOnlyMatch[1]) || 0));
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins > maxPeriodMins || (mins === maxPeriodMins && secs > 0)) return "";
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }
  return "";
}
function formatPbpPeriodLabel(periodNum) {
  const pNum = Number(periodNum) || 1;
  if (pNum <= 4) return `${pNum}Q`;
  return pNum === 5 ? "OT" : `OT${pNum - 4}`;
}
const MEDICAL_BODY_PARTS_ES = [{ rx: /\bplantar\s+fascia\b/i, es: "fascia plantar", gender: "f" }, { rx: /\bfifth\s+metatarsal\b/i, es: "quinto metatarsiano", gender: "m" }, { rx: /\bmetatarsal\b/i, es: "metatarsiano", gender: "m" }, { rx: /\bachilles(?:\s+tendon)?\b/i, es: "tend\xF3n de Aquiles", gender: "m" }, { rx: /\bacl\b|\banterior\s+cruciate(?:\s+ligament)?\b/i, es: "ligamento cruzado anterior (LCA)", gender: "m" }, { rx: /\bmcl\b|\bmedial\s+collateral(?:\s+ligament)?\b/i, es: "ligamento lateral interno", gender: "m" }, { rx: /\blcl\b|\blateral\s+collateral(?:\s+ligament)?\b/i, es: "ligamento lateral externo", gender: "m" }, { rx: /\bpcl\b|\bposterior\s+cruciate(?:\s+ligament)?\b/i, es: "ligamento cruzado posterior", gender: "m" }, { rx: /\bmeniscus\b/i, es: "menisco", gender: "m" }, { rx: /\brotator\s+cuff\b/i, es: "manguito rotador", gender: "m" }, { rx: /\blabrum\b/i, es: "labrum", gender: "m" }, { rx: /\bhip\s+flexor\b/i, es: "flexor de la cadera", gender: "m" }, { rx: /\blow(?:er)?\s+back\b|\blumbar\b/i, es: "zona lumbar", gender: "f" }, { rx: /\bupper\s+back\b|\bthoracic\b/i, es: "zona dorsal", gender: "f" }, { rx: /\bgreat\s+toe\b|\bbig\s+toe\b/i, es: "dedo gordo del pie", gender: "m" }, { rx: /\bindex\s+finger\b/i, es: "dedo \xEDndice", gender: "m" }, { rx: /\bring\s+finger\b/i, es: "dedo anular", gender: "m" }, { rx: /\bmiddle\s+finger\b/i, es: "dedo coraz\xF3n", gender: "m" }, { rx: /\bpinky(?:\s+finger)?\b|\blittle\s+finger\b/i, es: "dedo me\xF1ique", gender: "m" }, { rx: /\bankle\b/i, es: "tobillo", gender: "m" }, { rx: /\bknee\b|\bpatella(?:r)?\b/i, es: "rodilla", gender: "f" }, { rx: /\bhamstring\b/i, es: "isquiotibiales", gender: "mp" }, { rx: /\bcalf\b|\bgastrocnemius\b|\bsoleus\b/i, es: "gemelo", gender: "m" }, { rx: /\badductor\b/i, es: "aductor", gender: "m" }, { rx: /\babductor\b|\bgroin\b/i, es: "abductor", gender: "m" }, { rx: /\bquad(?:riceps)?\b/i, es: "cu\xE1driceps", gender: "m" }, { rx: /\bthigh\b/i, es: "muslo", gender: "m" }, { rx: /\bhip\b/i, es: "cadera", gender: "f" }, { rx: /\bpelvis\b|\bpelvic\b/i, es: "pelvis", gender: "f" }, { rx: /\bback\b|\bspine\b|\bspinal\b/i, es: "espalda", gender: "f" }, { rx: /\bshoulder\b|\bclavicle\b|\bcollarbone\b/i, es: "hombro", gender: "m" }, { rx: /\bwrist\b/i, es: "mu\xF1eca", gender: "f" }, { rx: /\bthumb\b/i, es: "pulgar", gender: "m" }, { rx: /\bfinger\b/i, es: "dedo de la mano", gender: "m" }, { rx: /\bhand\b|\bmetacarpal\b/i, es: "mano", gender: "f" }, { rx: /\bforearm\b/i, es: "antebrazo", gender: "m" }, { rx: /\belbow\b/i, es: "codo", gender: "m" }, { rx: /\bbiceps?\b/i, es: "b\xEDceps", gender: "m" }, { rx: /\btriceps?\b/i, es: "tr\xEDceps", gender: "m" }, { rx: /\bpectoral\b|\bchest\b/i, es: "pectoral", gender: "m" }, { rx: /\bfoot\b/i, es: "pie", gender: "m" }, { rx: /\btoe\b/i, es: "dedo del pie", gender: "m" }, { rx: /\bheel\b/i, es: "tal\xF3n", gender: "m" }, { rx: /\bshin\b|\btibia(?:l)?\b/i, es: "tibia", gender: "f" }, { rx: /\bfibula(?:r)?\b/i, es: "peron\xE9", gender: "m" }, { rx: /\bleg\b|\blower\s+leg\b/i, es: "pierna", gender: "f" }, { rx: /\barm\b/i, es: "brazo", gender: "m" }, { rx: /\bneck\b|\bcervical\b/i, es: "cuello", gender: "m" }, { rx: /\brib(?:s|cage)?\b/i, es: "costillas", gender: "fp" }, { rx: /\babdom(?:en|inal)\b|\bcore\b|\boblique\b/i, es: "zona abdominal", gender: "f" }, { rx: /\btailbone\b|\bcoccyx\b|\bglute(?:al)?\b/i, es: "zona gl\xFAtea", gender: "f" }, { rx: /\bnose\b|\bnasal\b/i, es: "tabique nasal", gender: "m" }, { rx: /\beye\b|\borbital\b/i, es: "zona ocular", gender: "f" }, { rx: /\bjaw\b/i, es: "mand\xEDbula", gender: "f" }, { rx: /\bface\b|\bfacial\b|\bcheek\b/i, es: "rostro", gender: "m" }, { rx: /\bhead\b/i, es: "cabeza", gender: "f" }];
const MEDICAL_CONDITIONS_ES = [{ rx: /\bconcussion(?:\s+protocol)?\b/i, withBody: __name(() => "protocolo de conmoci\xF3n cerebral", "withBody"), standalone: "protocolo de conmoci\xF3n cerebral" }, { rx: /\bplantar\s+fasciitis\b/i, withBody: __name((b) => b.includes("plantar") ? `fascitis en ${b}` : `fascitis plantar (${b})`, "withBody"), standalone: "fascitis plantar" }, { rx: /\bgastroenteritis\b|\bstomach\s+(?:illness|virus|flu|bug)\b/i, withBody: __name(() => "gastroenteritis", "withBody"), standalone: "gastroenteritis" }, { rx: /\bupper\s+respiratory(?:\s+illness|\s+infection)?\b|\brespiratory\s+illness\b|\bsinus(?:itis)?\b/i, withBody: __name(() => "infecci\xF3n respiratoria", "withBody"), standalone: "infecci\xF3n respiratoria" }, { rx: /\bmigraine\b/i, withBody: __name(() => "cuadro de migra\xF1a", "withBody"), standalone: "cuadro de migra\xF1a" }, { rx: /\b(?:non-covid\s+)?illness\b|\bflu\b|\bviral\b|\bsick(?:ness)?\b/i, withBody: __name(() => "proceso v\xEDrico", "withBody"), standalone: "proceso v\xEDrico" }, { rx: /\bhealth\s+and\s+safety(?:\s+protocols?)?\b/i, withBody: __name(() => "protocolo m\xE9dico de salud", "withBody"), standalone: "protocolo m\xE9dico de salud" }, { rx: /\breturn\s+to\s+competition(?:\s+reconditioning)?\b|\breconditioning\b/i, withBody: __name((b) => `readaptaci\xF3n competitiva (${b})`, "withBody"), standalone: "readaptaci\xF3n f\xEDsica a la competici\xF3n" }, { rx: /\binjury\s+management\b|\bload\s+management\b|\bmanagement\b/i, withBody: __name((b) => `gesti\xF3n m\xE9dica de cargas en ${b}`, "withBody"), standalone: "gesti\xF3n m\xE9dica de cargas" }, { rx: /\bsurgery\b|\bsurgical\b|\barthroscop(?:y|ic)\b|\brepair\b|\breconstruction\b/i, withBody: __name((b) => `recuperaci\xF3n quir\xFArgica en ${b}`, "withBody"), standalone: "recuperaci\xF3n tras intervenci\xF3n quir\xFArgica" }, { rx: /\btorn\b|\btear\b|\brupture(?:d)?\b/i, withBody: __name((b) => `rotura fibrilar/ligamentosa en ${b}`, "withBody"), standalone: "rotura fibrilar o ligamentosa" }, { rx: /\bstress\s+fracture\b/i, withBody: __name((b) => `fractura por estr\xE9s en ${b}`, "withBody"), standalone: "fractura por estr\xE9s" }, { rx: /\bstress\s+reaction\b/i, withBody: __name((b) => `reacci\xF3n \xF3sea por estr\xE9s en ${b}`, "withBody"), standalone: "reacci\xF3n \xF3sea por estr\xE9s" }, { rx: /\bavulsion\b|\bfracture(?:d)?\b|\bbroken\b/i, withBody: __name((b) => `fractura en ${b}`, "withBody"), standalone: "fractura \xF3sea" }, { rx: /\bdislocat(?:ion|ed)\b/i, withBody: __name((b) => `luxaci\xF3n en ${b}`, "withBody"), standalone: "luxaci\xF3n articular" }, { rx: /\bsubluxation\b/i, withBody: __name((b) => `subluxaci\xF3n en ${b}`, "withBody"), standalone: "subluxaci\xF3n articular" }, { rx: /\bsprain(?:ed)?\b/i, withBody: __name((b) => `esguince de ${b}`, "withBody"), standalone: "esguince articular" }, { rx: /\bstrain(?:ed)?\b|\bpulled\b/i, withBody: __name((b) => `distensi\xF3n en ${b}`, "withBody"), standalone: "distensi\xF3n muscular" }, { rx: /\btendinopathy\b/i, withBody: __name((b) => `tendinopat\xEDa en ${b}`, "withBody"), standalone: "tendinopat\xEDa" }, { rx: /\btendinitis\b|\btendonitis\b/i, withBody: __name((b) => `tendinitis en ${b}`, "withBody"), standalone: "tendinitis" }, { rx: /\bbursitis\b/i, withBody: __name((b) => `bursitis en ${b}`, "withBody"), standalone: "bursitis" }, { rx: /\bimpingement\b/i, withBody: __name((b) => `pinzamiento articular en ${b}`, "withBody"), standalone: "pinzamiento articular" }, { rx: /\bbone\s+bruise\b/i, withBody: __name((b) => `edema \xF3seo en ${b}`, "withBody"), standalone: "edema \xF3seo" }, { rx: /\bcontusion\b|\bbruis(?:e|ed|ing)\b/i, withBody: __name((b) => `contusi\xF3n en ${b}`, "withBody"), standalone: "contusi\xF3n" }, { rx: /\binflammation\b|\bswelling\b|\beffusion\b/i, withBody: __name((b) => `inflamaci\xF3n en ${b}`, "withBody"), standalone: "inflamaci\xF3n articular" }, { rx: /\bspasms?\b/i, withBody: __name((b) => `espasmos musculares en ${b}`, "withBody"), standalone: "espasmos musculares" }, { rx: /\btightness\b|\bstiffness\b/i, withBody: __name((b) => `sobrecarga en ${b}`, "withBody"), standalone: "sobrecarga muscular" }, { rx: /\blaceration\b|\bcut\b/i, withBody: __name((b) => `herida inciso-contusa en ${b}`, "withBody"), standalone: "herida inciso-contusa" }, { rx: /\bsore(?:ness)?\b|\bpain\b|\bach(?:e|ing)\b|\bdiscomfort\b/i, withBody: __name((b) => `molestias en ${b}`, "withBody"), standalone: "molestias f\xEDsicas" }, { rx: /\brecovery\b|\brehab(?:ilitation)?\b/i, withBody: __name((b) => `proceso de recuperaci\xF3n en ${b}`, "withBody"), standalone: "proceso de recuperaci\xF3n m\xE9dica" }];
function formatSpanishLaterality(side, gender) {
  if (!side) return "";
  if (side === "bilateral") {
    return gender === "mp" || gender === "fp" ? "bilaterales" : "bilateral";
  }
  if (side === "left") {
    if (gender === "f") return "izquierda";
    if (gender === "mp") return "izquierdos";
    if (gender === "fp") return "izquierdas";
    return "izquierdo";
  }
  if (gender === "f") return "derecha";
  if (gender === "mp") return "derechos";
  if (gender === "fp") return "derechas";
  return "derecho";
}
function translateMedicalDetailEs(rawDetail) {
  const cleaned = String(rawDetail || "").replace(/^Injury\/Illness\s*-\s*/i, "").replace(/^(?:INACTIVE|DNP|DND|NWT)_(?:INJURY|REST|PERSONAL|NORMAL)\s*[-:]?\s*/i, "").replace(/^(?:DNP|DND|NWT)\s*-\s*/i, "").replace(/\bNot\s+Specified\b/gi, "").replace(/\b(?:Out(?:\s+for\s+season)?|Day-To-Day|Questionable|Doubtful|Probable|Injured\s+Reserve)\b/gi, "").replace(/[;:]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return "";
  let side = null;
  if (/\bbilateral\b/i.test(cleaned)) side = "bilateral";
  else if (/\bleft\b|\bizq(?:uierd[oa]s?)?\b/i.test(cleaned)) side = "left";
  else if (/\bright\b|\bder(?:ech[oa]s?)?\b/i.test(cleaned)) side = "right";
  let matchedBody = null;
  for (const bp of MEDICAL_BODY_PARTS_ES) {
    if (bp.rx.test(cleaned)) {
      matchedBody = { es: bp.es, gender: bp.gender };
      break;
    }
  }
  const bodyPhrase = matchedBody ? [matchedBody.es, formatSpanishLaterality(side, matchedBody.gender)].filter(Boolean).join(" ") : "";
  for (const cond of MEDICAL_CONDITIONS_ES) {
    if (cond.rx.test(cleaned)) {
      return bodyPhrase ? cond.withBody(bodyPhrase) : cond.standalone;
    }
  }
  if (bodyPhrase) {
    return `molestias en ${bodyPhrase}`;
  }
  if (/\brest\b|\bdescanso\b/i.test(cleaned)) {
    return "descanso programado";
  }
  const hasEnglishLeak = /\b(?:the|and|for|with|from|against|game|out|ruled|expected|return|week|month|season|injury|injured|illness|unspecified|status|coach|decision|assignment|personal|suspended|suspension|pending|trade|sore|pain|tear|torn|broken|surgery|sprain|strain)\b/i.test(cleaned);
  if (hasEnglishLeak) {
    return "";
  }
  return cleaned;
}
function classifyAbsenceOrDnp(isActiveOnBench, rawReason, rawDesc, espnInjury) {
  const cleanReasonRaw = String(rawReason || "").trim();
  const cleanDescRaw = String(rawDesc || "").trim();
  const reasonDescLow = `${cleanReasonRaw} ${cleanDescRaw}`.toLowerCase();
  const espnStatusLow = String(espnInjury?.status || "").toLowerCase();
  const espnDetailLow = String(espnInjury?.detail || "").toLowerCase();
  if (reasonDescLow.includes("coach") || reasonDescLow.includes("cd -") || reasonDescLow.includes("dnp_coach") || reasonDescLow.includes("decision")) {
    return { statusType: "coach_decision", statusLabel: "Decisi\xF3n t\xE9cnica", statusTone: "slate", priorityRank: isActiveOnBench ? 7 : 6, note: isActiveOnBench ? "Convocado en banquillo sin minutos por rotaci\xF3n t\xE9cnica" : "Descarte t\xE9cnico de convocatoria (sin parte m\xE9dico)" };
  }
  if (reasonDescLow.includes("gleague") || reasonDescLow.includes("g-league") || reasonDescLow.includes("g league") || reasonDescLow.includes("two-way") || reasonDescLow.includes("twoway") || reasonDescLow.includes("on assignment")) {
    return { statusType: "gleague", statusLabel: "Decisi\xF3n t\xE9cnica \xB7 G-League", statusTone: "slate", priorityRank: 6, note: "Asignado a G-League / contrato dual (fuera de rotaci\xF3n NBA)" };
  }
  if (reasonDescLow.includes("rest") && !reasonDescLow.includes("wrist") || espnDetailLow === "rest") {
    return { statusType: "rest", statusLabel: "Descanso", statusTone: "amber", priorityRank: 4, note: "Gesti\xF3n programada de descanso y cargas f\xEDsicas" };
  }
  if (reasonDescLow.includes("suspension") || reasonDescLow.includes("suspended") || espnStatusLow.includes("suspension")) {
    return { statusType: "suspension_personal", statusLabel: "Sanci\xF3n", statusTone: "amber", priorityRank: 4, note: "Baja disciplinaria \xB7 Sanci\xF3n oficial NBA" };
  }
  if (reasonDescLow.includes("personal") || reasonDescLow.includes("not with team") || reasonDescLow.includes("nwt") || reasonDescLow.includes("bereavement")) {
    return { statusType: "suspension_personal", statusLabel: "Motivos personales", statusTone: "amber", priorityRank: 4, note: "Ausencia autorizada \xB7 Motivos personales" };
  }
  if (reasonDescLow.includes("trade")) {
    return { statusType: "suspension_personal", statusLabel: "Traspaso en curso", statusTone: "amber", priorityRank: 5, note: "Fuera de convocatoria \xB7 Operaci\xF3n de traspaso en curso" };
  }
  const espnConfirmsMedical = Boolean(espnInjury && (!isActiveOnBench || espnStatusLow.includes("out") || espnStatusLow.includes("doubtful") || espnStatusLow.includes("questionable") || espnStatusLow.includes("day-to-day") || espnStatusLow.includes("injured")));
  const fullMedicalCheckLow = `${reasonDescLow} ${espnConfirmsMedical ? espnDetailLow : ""}`;
  if (fullMedicalCheckLow.includes("illness") || fullMedicalCheckLow.includes("flu") || fullMedicalCheckLow.includes("stomach") || fullMedicalCheckLow.includes("gastro") || fullMedicalCheckLow.includes("respiratory") || fullMedicalCheckLow.includes("sinus") || fullMedicalCheckLow.includes("migraine") || fullMedicalCheckLow.includes("viral")) {
    const cleanIll = translateMedicalDetailEs(cleanDescRaw || espnInjury?.detail || "");
    return { statusType: "injury", statusLabel: "Baja m\xE9dica", statusTone: "rose", priorityRank: 3, note: cleanIll ? `Indisposici\xF3n m\xE9dica (${cleanIll})` : "Proceso v\xEDrico / indisposici\xF3n m\xE9dica en acta" };
  }
  const translatedCandidate = translateMedicalDetailEs([cleanDescRaw, espnConfirmsMedical ? espnInjury?.detail || "" : "", cleanReasonRaw].filter(Boolean).join(" "));
  const hasMedicalKeyword = Boolean(translatedCandidate) || fullMedicalCheckLow.includes("injury") || fullMedicalCheckLow.includes("dnd") || fullMedicalCheckLow.includes("sprain") || fullMedicalCheckLow.includes("strain") || fullMedicalCheckLow.includes("soreness") || fullMedicalCheckLow.includes("surgery") || fullMedicalCheckLow.includes("fracture") || fullMedicalCheckLow.includes("contusion") || fullMedicalCheckLow.includes("tightness") || fullMedicalCheckLow.includes("reconditioning") || fullMedicalCheckLow.includes("concussion") || fullMedicalCheckLow.includes("recovery") || fullMedicalCheckLow.includes("torn") || fullMedicalCheckLow.includes("tear") || fullMedicalCheckLow.includes("tendinitis") || fullMedicalCheckLow.includes("tendinopathy") || fullMedicalCheckLow.includes("bursitis") || fullMedicalCheckLow.includes("inflammation") || fullMedicalCheckLow.includes("dislocation") || fullMedicalCheckLow.includes("spasms");
  if (espnConfirmsMedical || hasMedicalKeyword) {
    return { statusType: "injury", statusLabel: "Lesionado", statusTone: "rose", priorityRank: 3, note: translatedCandidate ? `Parte m\xE9dico: ${translatedCandidate}` : "Baja por lesi\xF3n confirmada en acta oficial NBA" };
  }
  return { statusType: "coach_decision", statusLabel: "Decisi\xF3n t\xE9cnica", statusTone: "slate", priorityRank: isActiveOnBench ? 7 : 6, note: isActiveOnBench ? "Convocado en banquillo sin minutos por rotaci\xF3n t\xE9cnica" : "Descarte t\xE9cnico de convocatoria (sin parte m\xE9dico activo)" };
}
const KNOWN_NBA_COACH_NAMES = ["Tom Thibodeau", "Coach Thibs", "Thibodeau", "Thibs", "Mike Brown", "Joe Mazzulla", "Mazzulla", "Kenny Atkinson", "JB Bickerstaff", "J.B. Bickerstaff", "Bickerstaff", "Erik Spoelstra", "Spoelstra", "Rick Carlisle", "Carlisle", "Nick Nurse", "Doc Rivers", "Billy Donovan", "Jamahl Mosley", "Quin Snyder", "Charles Lee", "Jordi Fern\xE1ndez", "Jordi Fernandez", "Darko Rajakovic", "Darko Rajakovi\u0107", "Rajakovic", "Rajakovi\u0107", "Brian Keefe", "Mark Daigneault", "Daigneault", "Chris Finch", "JJ Redick", "J.J. Redick", "Redick", "Steve Kerr", "Tyronn Lue", "Ty Lue", "Ime Udoka", "Udoka", "Jason Kidd", "Michael Malone", "Mike Malone", "David Adelman", "Taylor Jenkins", "Tuomas Iisalo", "Iisalo", "Mike Budenholzer", "Budenholzer", "Frank Vogel", "Darvin Ham", "Monty Williams", "Adrian Griffin", "Jacque Vaughn", "Gregg Popovich", "Popovich", "Mitch Johnson", "Willie Green", "Will Hardy", "Chauncey Billups", "Doug Christie", "Jordan Ott", "James Borrego", "Terry Stotts", "Tiago Splitter", "Sam Cassell", "Micah Nori", "Chris Quinn", "Jeff Van Gundy", "Stan Van Gundy", "Brad Stevens", "Pat Riley", "Leon Rose", "Rob Pelinka", "Sam Presti", "Daryl Morey", "Masai Ujiri", "Danny Ainge"].sort((a, b) => b.length - a.length);
const NBA_TEAM_SAFE_TOKENS = ["atlanta", "hawks", "atl", "boston", "celtics", "bos", "brooklyn", "nets", "bkn", "charlotte", "hornets", "cha", "chicago", "bulls", "chi", "cleveland", "cavaliers", "cavs", "cle", "dallas", "mavericks", "mavs", "dal", "denver", "nuggets", "den", "detroit", "pistons", "det", "golden state", "warriors", "gsw", "houston", "rockets", "hou", "indiana", "pacers", "ind", "los angeles", "clippers", "lakers", "lac", "lal", "memphis", "grizzlies", "mem", "miami", "heat", "mia", "milwaukee", "bucks", "mil", "minnesota", "timberwolves", "wolves", "min", "new orleans", "pelicans", "nop", "new york", "knicks", "nyk", "oklahoma city", "thunder", "okc", "orlando", "magic", "orl", "philadelphia", "sixers", "76ers", "phi", "phoenix", "suns", "phx", "portland", "trail blazers", "blazers", "por", "sacramento", "kings", "sac", "san antonio", "spurs", "sas", "toronto", "raptors", "tor", "utah", "jazz", "uta", "washington", "wizards", "was", "nba"];
function buildVerifiedPlayerTokenSet(playerNames) {
  const set = /* @__PURE__ */ new Set();
  const suffixes = /* @__PURE__ */ new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);
  for (const raw of playerNames) {
    const clean = normalizePlain(raw);
    if (!clean) continue;
    set.add(clean);
    const parts = clean.split(/\s+/).filter((w) => w.length >= 3 && !suffixes.has(w));
    for (const part of parts) {
      set.add(part);
    }
  }
  return set;
}
function preserveCasePhrase(referenceMatch, lowerPhrase) {
  const trimmed = referenceMatch.trimStart();
  if (/^[A-ZÁÉÍÓÚÑ]/.test(trimmed)) {
    return lowerPhrase.charAt(0).toUpperCase() + lowerPhrase.slice(1);
  }
  return lowerPhrase;
}
function sanitizeUnverifiedCoachClaims(text, verifiedPlayerNames = []) {
  if (!text) return text;
  const playerTokens = buildVerifiedPlayerTokenSet(verifiedPlayerNames);
  const teamTokens = new Set(NBA_TEAM_SAFE_TOKENS.map((t) => normalizePlain(t)));
  const isVerifiedPlayerOrTeam = __name((candidate) => {
    const norm = normalizePlain(candidate.replace(/\*/g, "")).replace(/^(?:los|las|el|la|de|del)\s+/, "");
    if (!norm) return true;
    if (playerTokens.has(norm) || teamTokens.has(norm)) return true;
    for (const t of teamTokens) {
      if (t.length >= 4 && norm.includes(t)) return true;
    }
    return false;
  }, "isVerifiedPlayerOrTeam");
  let out = text;
  out = out.replace(/\b([Ee]l|[Ss]u)\s+(?:[Ee]ntrenador(?:\s+jefe)?|[Tt]écnico|[Pp]reparador)\s+de\s+((?:los\s+|las\s+)?[\p{L}\d\s]{2,26}?),\s*([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})\s*,?/gu, (match, determiner, teamPhrase, person) => {
    if (isVerifiedPlayerOrTeam(person)) return match;
    return `${preserveCasePhrase(determiner, "el cuerpo t\xE9cnico")} de ${teamPhrase.trim()}`;
  });
  out = out.replace(/\b([Ee]l|[Ss]u)\s+(?:[Ee]ntrenador(?:\s+jefe)?|[Tt]écnico|[Pp]reparador)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, determiner, person) => {
    if (isVerifiedPlayerOrTeam(person)) return match;
    return preserveCasePhrase(determiner, "el cuerpo t\xE9cnico");
  });
  out = out.replace(/\b([Ll]a\s+pizarra\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, prefix, entity) => {
    if (isVerifiedPlayerOrTeam(entity)) return match;
    return preserveCasePhrase(prefix, "la pizarra t\xE9cnica");
  }).replace(/\b([Ee]l\s+banquillo\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, prefix, entity) => {
    if (isVerifiedPlayerOrTeam(entity)) return match;
    return preserveCasePhrase(prefix, "el cuerpo t\xE9cnico");
  }).replace(/\b([Ll]os\s+(?:hombres|pupilos|chicos)\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, prefix, entity) => {
    if (isVerifiedPlayerOrTeam(entity)) return match;
    return preserveCasePhrase(prefix, "el conjunto");
  });
  const leftBound = "(?<![\\p{L}\\p{N}])";
  const rightBound = "(?![\\p{L}\\p{N}])";
  for (const coach of KNOWN_NBA_COACH_NAMES) {
    const normCoach = normalizePlain(coach);
    if (!normCoach || playerTokens.has(normCoach)) continue;
    const escaped = coach.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?:el\\s+|su\\s+)?(?:entrenador|t\xE9cnico|preparador)(?:\\s+jefe)?\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el cuerpo t\xE9cnico")).replace(new RegExp(`la\\s+pizarra\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "la pizarra t\xE9cnica")).replace(new RegExp(`el\\s+banquillo\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el cuerpo t\xE9cnico")).replace(new RegExp(`el\\s+sistema\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el planteamiento t\xE1ctico")).replace(new RegExp(`bajo\\s+(?:las\\s+\xF3rdenes|la\\s+batuta|el\\s+mando|la\\s+direcci\xF3n)\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "bajo la direcci\xF3n t\xE9cnica")).replace(new RegExp(`dirigidos\\s+por\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "desde la direcci\xF3n t\xE9cnica")).replace(new RegExp(`los\\s+(?:hombres|pupilos|chicos)\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el conjunto")).replace(new RegExp(`los\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el bloque")).replace(new RegExp(`${leftBound}${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "la direcci\xF3n t\xE9cnica"));
  }
  return sanitizeEditorialSpanishGrammar(out);
}
function normalizeClockForCompare(clockStr) {
  const parts = String(clockStr || "").trim().split(":");
  if (parts.length !== 2) return "";
  return `${Number(parts[0]) || 0}:${String(Number(parts[1]) || 0).padStart(2, "0")}`;
}
function toDiacriticInsensitivePattern(word) {
  const map = {
    a: "[aáàäâ]",
    e: "[eéèëê]",
    i: "[iíìïî]",
    o: "[oóòöô]",
    u: "[uúùüû]",
    c: "[cćčç]",
    n: "[nñ]",
    s: "[sš]",
    z: "[zž]",
  };
  return Array.from(normalizePlain(word))
    .map((ch) => map[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("");
}
function reconcileVerifiedFoulOutTimings(text, verifiedFoulOuts = []) {
  if (!text) return text;
  let out = String(text);

  const timingTailPattern =
    `(?:en\\s+el\\s+(?:primer|segundo|tercer|cuarto|último|[1-4]Q|OT\\d*|pr[oó]rroga(?:\\s*\\d+)?)\\s*(?:periodo|cuarto)?\\s*(?:,\\s*)?)?(?:faltando|a\\s+falta\\s+de|con|a)\\s+(\\d{1,2}:\\d{2})(?:\\s*(?:para\\s+(?:la\\s+conclusi[oó]n|el\\s+final|el\\s+cierre)|del\\s+(?:partido|cuarto|encuentro|choque|final)|por\\s+jugar))?`;

  for (const fo of verifiedFoulOuts) {
    const period = String(fo?.foulOutPeriod || "").trim();
    const clock = String(fo?.foulOutClock || "").trim();
    const normClockExpected = normalizeClockForCompare(clock);
    const fullNorm = normalizePlain(fo?.name || "");
    if (!fullNorm || !period || !normClockExpected) continue;
    const parts = fullNorm.split(/\s+/).filter((p) => p.length >= 2);
    const suffixes = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);
    const nonSuffixParts = parts.filter((p) => !suffixes.has(p));
    const lastName = nonSuffixParts[nonSuffixParts.length - 1] || parts[parts.length - 1] || fullNorm;
    const escapedLast = toDiacriticInsensitivePattern(lastName);
    const clauseRx = new RegExp(
      `(${escapedLast}[^.!?\n]{0,140}?(?:expuls|seis\\s+faltas|6\\s+faltas|sexta\\s+falta|l[ií]mite\\s+de\\s+faltas)[^.!?\n]{0,100}?)(${timingTailPattern})`,
      "giu"
    );
    out = out.replace(clauseRx, (match, lead, _timingPhrase, foundClock) => {
      if (normalizeClockForCompare(foundClock) === normClockExpected) {
        return match;
      }
      return `${lead}en el ${period} faltando ${clock}`;
    });
    const preClauseRx = new RegExp(
      `((?:la\\s+expulsi[oó]n(?:\\s+por\\s+(?:seis|6)\\s+faltas)?\\s+de|expulsad[oa]\\s+por\\s+(?:seis|6)\\s+faltas[^.!?\n]{0,40})[^.!?\n]{0,90}?${escapedLast}[^.!?\n]{0,50}?)(${timingTailPattern})`,
      "giu"
    );
    out = out.replace(preClauseRx, (match, lead, _timingPhrase, foundClock) => {
      if (normalizeClockForCompare(foundClock) === normClockExpected) {
        return match;
      }
      return `${lead}en el ${period} faltando ${clock}`;
    });
  }

  out = out.replace(
    /((?:expulsad[oa]s?\s+(?:por\s+(?:seis|6)\s+faltas|por\s+acumulaci[oó]n\s+de\s+faltas)|la\s+expulsi[oó]n(?:\s+por\s+(?:seis|6)\s+faltas)?\s+de)[^.!?\n]{0,110}?)\s+(?:en\s+el\s+(?:primer|segundo|tercer|cuarto|último|[1-4]Q|OT\d*|pr[oó]rroga(?:\s*\d+)?)\s*(?:periodo|cuarto)?\s*(?:,\s*)?)?(?:faltando|a\s+falta\s+de|con|a)\s+(\d{1,2}):(\d{2})(?:\s*(?:para\s+(?:la\s+conclusi[oó]n|el\s+final|el\s+cierre)|del\s+(?:partido|cuarto|encuentro|choque|final)|por\s+jugar))?/giu,
    (full, prefix, mmStr) => {
      const mm = Number(mmStr) || 0;
      if (mm > 12) return prefix.trimEnd();
      return full;
    }
  );
  return out;
}
function sanitizeEditorialSpanishGrammar(text) {
  if (!text) return text;
  const preserveLeadCase = (match, phrase) => {
    const cleanLead = match.replace(/^\*\*+/, "").trimStart();
    if (/^[A-ZÁÉÍÓÚÑ]/.test(cleanLead)) {
      return phrase.charAt(0).toUpperCase() + phrase.slice(1);
    }
    return phrase;
  };
  return text
    .replace(/\b(de|a|ante|contra|para|por|con|sobre|entre)\s+los\s+(\*\*)?Los\s+Angeles\b/giu, (_m, prep, stars) => `${prep} ${stars || ""}Los Angeles`)
    .replace(/\b[Ll]os\s+(\*\*)?Los\s+Angeles\b/gu, (_m, stars) => `${stars || ""}Los Angeles`)
    .replace(/\btasa\s+de\s+tiros\s+libres\b/giu, "frecuencia de visitas al tiro libre")
    .replace(/\ben\s+(?:una\s+|un\s+)?(?:situaci[oó]n|condici[oó]n|contexto|escenario|jornada|noche)\s+de\s+(\*\*)?espalda\s+(?:con|contra|a)\s+espalda(\*\*)?/giu, (m, s1, s2) => `${preserveLeadCase(m, "en")} ${s1 || ""}back-to-back${s2 || ""}`)
    .replace(/\buna\s+(?:situaci[oó]n|condici[oó]n)\s+de\s+(\*\*)?espalda\s+(?:con|contra|a)\s+espalda(\*\*)?/giu, (m, s1, s2) => `${preserveLeadCase(m, "un")} ${s1 || ""}back-to-back${s2 || ""}`)
    .replace(/\b(?:situaci[oó]n|condici[oó]n|contexto|escenario)\s+de\s+(\*\*)?espalda\s+(?:con|contra|a)\s+espalda(\*\*)?/giu, (m, s1, s2) => `${s1 || ""}${preserveLeadCase(m, "back-to-back")}${s2 || ""}`)
    .replace(/\b(?:(en|de|durante|tras)\s+)?(partidos?|noches?|jornadas?|duelos?|choques?|encuentros?)\s+(?:de\s+|en\s+)?(\*\*)?espalda\s+(?:con|contra|a)\s+espalda(\*\*)?/giu, (_m, prep, noun, s1, s2) => (prep ? `${prep} ${noun} ${s1 || ""}back-to-back${s2 || ""}` : `${noun} en ${s1 || ""}back-to-back${s2 || ""}`))
    .replace(/(\*\*)?\bespalda\s+(?:con|contra|a)\s+espalda\b(\*\*)?/giu, (m, s1, s2) => `${s1 || ""}${preserveLeadCase(m, "back-to-back")}${s2 || ""}`);
}
let flashLiteQuotaCooldownUntil = 0;
function getGeminiClient(timeoutMs = 2e4) {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ""
  ).trim();
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs, headers: { "User-Agent": "aistudio-build" } } });
}
function normalizeEspnTeamAbbr(raw) {
  const up = (raw || "").trim().toUpperCase();
  const map = { GS: "GSW", NY: "NYK", NO: "NOP", SA: "SAS", UTAH: "UTA", WSH: "WAS" };
  return map[up] || up;
}
function extractGroundingSources(response, seedSources = []) {
  const seen = /* @__PURE__ */ new Set();
  const links = [];
  const pushLink = __name((uri, title) => {
    const cleanUri = (uri || "").trim();
    if (!cleanUri || !/^https?:\/\//i.test(cleanUri) || seen.has(cleanUri)) return;
    seen.add(cleanUri);
    links.push({ uri: cleanUri, title: (title || "").trim() || "Fuente actualidad NBA" });
  }, "pushLink");
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  let webCount = 0;
  if (Array.isArray(chunks)) {
    for (const ch of chunks) {
      const uri = String(ch?.web?.uri || "").trim();
      if (!uri) continue;
      const prevLen = links.length;
      pushLink(uri, String(ch?.web?.title || ""));
      if (links.length > prevLen) webCount++;
      if (webCount >= 4) break;
    }
  }
  for (const s of seedSources) {
    pushLink(s.uri, s.title);
    if (links.length >= 8) break;
  }
  return links;
}
function hasLiveGroundingChunks(response): boolean {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  return Array.isArray(chunks) && chunks.some((ch) => Boolean(String(ch?.web?.uri || "").trim()));
}
const modelCooldownMap = new Map<string, number>();
const deprecatedModelsSet = new Set<string>();
const MODEL_DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000;
let discoveredModelsCache: { models: string[]; expiresAt: number } = { models: [], expiresAt: 0 };
let discoveryInflight: Promise<string[]> | null = null;

function isQuotaExhaustedError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || "");
  return (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("Quota exceeded")
  );
}

function isTransientOverloadError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || "");
  return (
    msg.includes("503") ||
    msg.includes("high demand") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("overloaded")
  );
}

function isAuthOrKeyError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || "");
  return (
    msg.includes("403") ||
    msg.includes("401") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("API_KEY_INVALID") ||
    msg.includes("API key not valid")
  );
}

function isModelDeprecatedError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || "");
  return (
    msg.includes("404") ||
    msg.includes("NOT_FOUND") ||
    msg.includes("no longer available") ||
    msg.includes("is not found")
  );
}

function isSuitableAutoTextModel(modelId: string, supportedActions?: string[]): boolean {
  const low = modelId.toLowerCase();
  if (!low.startsWith("gemini-")) return false;
  if (Array.isArray(supportedActions) && supportedActions.length > 0) {
    const supportsGen = supportedActions.some((a) => String(a).toLowerCase() === "generatecontent");
    if (!supportsGen) return false;
  }
  // Exclude non-text modalities, deprecated legacy generations (1.x, 2.x), and paid-only tiers
  if (/(?:image|nano-banana|tts|live|transcribe|translate|audio|speech|embedding|aqa|omni|robotics|computer-use|deep-research|customtools|decision|genie|lyria)/i.test(low)) {
    return false;
  }
  if (/^gemini-(?:1\.|2\.|pro$|pro-vision)/i.test(low)) {
    return false;
  }
  if (/(?:-argon|-carbon|-neon|-ultra|-pro(?:$|-))/i.test(low)) {
    return false;
  }
  return true;
}

function scoreDiscoveredGeminiModel(modelId: string): number {
  const low = modelId.toLowerCase();
  const verMatch = /^gemini-(\d+)(?:\.(\d+))?/i.exec(low);
  const major = verMatch ? Number(verMatch[1]) || 0 : 0;
  const minor = verMatch && verMatch[2] ? Number(verMatch[2]) || 0 : 0;
  let score = major * 100 + minor * 10;

  if (low.includes("hydrogen") || (low.includes("flash") && !low.includes("lite"))) {
    score += 40;
  } else if (low.includes("lite")) {
    score += 25;
  } else {
    score += 10;
  }

  if (low.includes("-exp")) {
    score -= 15;
  } else if (low.includes("-preview") || /-\d{3,4}$/.test(low)) {
    score += 5;
  } else {
    score += 18;
  }

  return score;
}

async function discoverLiveGeminiTextModels(ai: GoogleGenAI, forceRefresh = false): Promise<string[]> {
  const now = Date.now();
  if (!forceRefresh && discoveredModelsCache.models.length > 0 && discoveredModelsCache.expiresAt > now) {
    return discoveredModelsCache.models;
  }
  if (discoveryInflight) {
    return discoveryInflight;
  }

  discoveryInflight = (async () => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("models.list timeout")), 4500)
      );
      const listPromise = (async () => {
        const pager = await ai.models.list({ config: { pageSize: 100 } });
        const collected: string[] = [];
        for await (const m of pager) {
          const rawName = String(m?.name || "").replace(/^models\//, "").trim();
          if (rawName && !deprecatedModelsSet.has(rawName) && isSuitableAutoTextModel(rawName, m?.supportedActions)) {
            collected.push(rawName);
          }
          if (collected.length >= 40) break;
        }
        return collected;
      })();

      const candidates = await Promise.race([listPromise, timeoutPromise]);
      const ranked = [...new Set(candidates)]
        .sort((a, b) => scoreDiscoveredGeminiModel(b) - scoreDiscoveredGeminiModel(a))
        .slice(0, 6);

      if (ranked.length > 0) {
        discoveredModelsCache = { models: ranked, expiresAt: Date.now() + MODEL_DISCOVERY_TTL_MS };
        console.info(`[RadarNBA] Modelos Gemini vigentes detectados automáticamente: ${ranked.join(", ")}`);
      }
      return ranked;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || "");
      console.info(`[RadarNBA] Auto-descubrimiento models.list omitido: ${msg.slice(0, 100)}`);
      return discoveredModelsCache.models;
    } finally {
      discoveryInflight = null;
    }
  })();

  return discoveryInflight;
}

async function generateWithGeminiCascade(params: {
  systemInstruction: string;
  contents: string;
  seedSources?: Array<{ uri: string; title: string }>;
  isServerless?: boolean;
  budgetMs?: number;
  enableGoogleSearch?: boolean;
}) {
  const totalBudgetMs = Math.max(10000, params.budgetMs ?? 48000);
  const deadlineAt = Date.now() + totalBudgetMs;

  const ai = getGeminiClient(totalBudgetMs);
  if (!ai) {
    throw new Error("GEMINI_API_KEY unavailable");
  }

  // Stick strictly to active, low-latency free-tier text models (no deprecated 2.x or overloaded preview discovery on 503/timeout)
  const seedNames = [
    process.env.GEMINI_MODEL_PRIMARY,
    process.env.GEMINI_MODEL_SECONDARY,
    process.env.GEMINI_MODEL_TERTIARY,
    "gemini-4-hydrogen",
    "gemini-3.1-flash-lite",
  ].filter((n): n is string => Boolean(n && n.trim()));

  const getPreferredModelCapMs = (modelName: string, isRetryPass = false): number => {
    const low = modelName.toLowerCase();
    if (low.includes("lite")) {
      return isRetryPass ? 16000 : 20000;
    }
    if (low.includes("hydrogen")) {
      return isRetryPass ? 20000 : 26000;
    }
    return isRetryPass ? 16000 : 20000;
  };

  const buildOrderedQueue = (
    names: string[],
    excludeSet: Set<string>,
    isRetryPass = false
  ): Array<{ name: string; capMs: number }> => {
    const unique: Array<{ name: string; capMs: number }> = [];
    const seen = new Set<string>();
    for (const rawName of names) {
      const name = rawName.trim();
      if (name && !seen.has(name) && !excludeSet.has(name) && !deprecatedModelsSet.has(name)) {
        seen.add(name);
        unique.push({ name, capMs: getPreferredModelCapMs(name, isRetryPass) });
      }
    }
    const now = Date.now();
    const active = unique.filter((m) => (modelCooldownMap.get(m.name) || 0) < now);
    return active.length > 0 ? active : unique;
  };

  const triedNames = new Set<string>();
  const transientFailedModels = new Set<string>();
  const attemptErrors: string[] = [];
  let lastErr: unknown = null;
  let sawDeprecatedError = false;
  let sawAuthError = false;

  // Optional Pass 0: Google Search Grounding (used exclusively by Game Chronicles v2_tactical).
  // Automatically falls back to the non-search cascade if search grounding times out or errors.
  if (params.enableGoogleSearch) {
    const searchCandidates = buildOrderedQueue(
      seedNames.filter((n) => !n.toLowerCase().includes("lite")),
      new Set(),
      false
    );
    const primarySearchModel = searchCandidates[0]?.name || "gemini-4-hydrogen";
    const remainingForSearch = deadlineAt - Date.now();
    if (remainingForSearch >= 12000) {
      const searchTimeoutMs = Math.min(25000, Math.floor(remainingForSearch * 0.58));
      const searchController = new AbortController();
      let searchTimer: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          searchTimer = setTimeout(() => {
            searchController.abort();
            reject(new Error(`Timeout ${searchTimeoutMs}ms en búsqueda web (${primarySearchModel})`));
          }, searchTimeoutMs);
        });
        const lowModel = primarySearchModel.toLowerCase();
        const searchConfig: Record<string, any> = {
          systemInstruction: params.systemInstruction,
          abortSignal: searchController.signal,
          tools: [{ googleSearch: {} }],
        };
        if (/^gemini-(?:3|4)(?:[.-]|$)/i.test(lowModel)) {
          searchConfig.thinkingConfig = {
            thinkingLevel: ThinkingLevel.LOW,
          };
        }
        const searchCall = ai.models.generateContent({
          model: primarySearchModel,
          contents: params.contents,
          config: searchConfig,
        });
        const searchResp = (await Promise.race([searchCall, timeoutPromise])) as any;
        const searchText = (searchResp?.text || "").trim();
        if (searchText && searchText.length > 80) {
          modelCooldownMap.delete(primarySearchModel);
          return {
            text: searchText,
            model: primarySearchModel,
            sources: extractGroundingSources(searchResp, params.seedSources),
            groundingUsed: hasLiveGroundingChunks(searchResp) || true,
          };
        }
        attemptErrors.push(`${primarySearchModel}+search: empty_or_short_response`);
      } catch (err) {
        lastErr = err;
        if (isAuthOrKeyError(err)) {
          sawAuthError = true;
          attemptErrors.push(`${primarySearchModel}+search: clave_o_permiso_invalido`);
        } else {
          const rawMsg = err instanceof Error ? err.message : String(err || "");
          const tag = isQuotaExhaustedError(err)
            ? "cuota_agotada_429"
            : isTransientOverloadError(err)
            ? "alta_demanda_503"
            : rawMsg.toLowerCase().includes("timeout") || rawMsg.toLowerCase().includes("abort")
            ? "timeout_busqueda_web"
            : "busqueda_web_no_disponible";
          attemptErrors.push(`${primarySearchModel}+search: ${tag}`);
          console.info(`[RadarNBA] Grounding web (${primarySearchModel}) -> ${tag}; continuando con dossier táctico + AP/ESPN`);
        }
      } finally {
        if (searchTimer) clearTimeout(searchTimer);
      }
    }
  }

  const tryQueue = async (
    queue: Array<{ name: string; capMs: number }>,
    options: { isRetryPass?: boolean } = {}
  ) => {
    for (const { name: model, capMs } of queue) {
      if (sawAuthError) break;
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs < 3500) {
        attemptErrors.push(`budget_exhausted_before_${model}`);
        break;
      }
      const timeoutMs = Math.min(capMs, remainingMs);
      triedNames.add(model);

      const attemptController = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            attemptController.abort();
            reject(new Error(`Timeout ${timeoutMs}ms for ${model}`));
          }, timeoutMs);
        });

        const lowModel = model.toLowerCase();
        const genConfig: Record<string, any> = {
          systemInstruction: params.systemInstruction,
          abortSignal: attemptController.signal,
        };
        // Fast ThinkingLevel.LOW on Gemini 4 / Gemini 3 non-lite; ThinkingLevel.MINIMAL on flash-lite to eliminate thinking stalls
        if (/^gemini-3\.1-flash-lite/i.test(lowModel) || (lowModel.startsWith("gemini-3") && lowModel.includes("lite"))) {
          genConfig.thinkingConfig = {
            thinkingLevel: ThinkingLevel.MINIMAL,
          };
        } else if (/^gemini-(?:3|4)(?:[.-]|$)/i.test(lowModel)) {
          genConfig.thinkingConfig = {
            thinkingLevel: ThinkingLevel.LOW,
          };
        }

        const callPromise = ai.models.generateContent({
          model,
          contents: params.contents,
          config: genConfig,
        });

        const response = (await Promise.race([callPromise, timeoutPromise])) as any;

        const text = (response?.text || "").trim();
        if (text && text.length > 80) {
          modelCooldownMap.delete(model);
          return {
            text,
            model,
            sources: extractGroundingSources(response, params.seedSources),
            groundingUsed: false,
          };
        }
        attemptErrors.push(`${model}: empty_or_short_response`);
        transientFailedModels.add(model);
      } catch (err) {
        lastErr = err;
        let reasonTag = "fallo_llamada";
        if (isAuthOrKeyError(err)) {
          sawAuthError = true;
          reasonTag = "clave_o_permiso_invalido";
        } else if (isModelDeprecatedError(err)) {
          deprecatedModelsSet.add(model);
          sawDeprecatedError = true;
          reasonTag = "modelo_no_disponible_404";
        } else if (isQuotaExhaustedError(err)) {
          modelCooldownMap.set(model, Date.now() + 5 * 60 * 1000);
          reasonTag = "cuota_agotada_429";
        } else if (isTransientOverloadError(err)) {
          transientFailedModels.add(model);
          modelCooldownMap.set(model, Date.now() + 8 * 1000);
          reasonTag = "alta_demanda_503";
        } else {
          transientFailedModels.add(model);
          const rawMsg = err instanceof Error ? err.message : String(err || "");
          const isAbort =
            (err instanceof Error && err.name === "AbortError") ||
            attemptController.signal.aborted ||
            rawMsg.toLowerCase().includes("timeout") ||
            rawMsg.toLowerCase().includes("aborted");
          reasonTag = isAbort ? "timeout" : "error_transitorio";
        }
        attemptErrors.push(`${model}: ${reasonTag}`);
        console.info(`[RadarNBA] Transición de modelo ${model} -> ${reasonTag}`);
        if (sawAuthError) break;
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }
    }
    return null;
  };

  const initialQueue = buildOrderedQueue(seedNames, triedNames, false);
  const firstResult = await tryQueue(initialQueue, { isRetryPass: false });
  if (firstResult) {
    return firstResult;
  }

  if (!sawAuthError) {
    // Only run live model discovery if a seed model actually returned 404/NOT_FOUND
    let liveDiscovered: string[] = [];
    if (sawDeprecatedError && deadlineAt - Date.now() >= 6000) {
      liveDiscovered = await discoverLiveGeminiTextModels(ai, true);
      const unseenDiscoveredQueue = buildOrderedQueue(liveDiscovered, triedNames, true);
      if (unseenDiscoveredQueue.length > 0 && deadlineAt - Date.now() >= 4000) {
        const discoveredResult = await tryQueue(unseenDiscoveredQueue, { isRetryPass: true });
        if (discoveredResult) {
          return discoveredResult;
        }
      }
    }

    // Exponential backoff with jitter for transient 503 / timeout spikes on active seed models
    const retryCandidates = [
      ...new Set([
        ...seedNames.filter((m) => !deprecatedModelsSet.has(m) && transientFailedModels.has(m)),
        ...liveDiscovered.filter((m) => !deprecatedModelsSet.has(m)),
      ]),
    ].filter((m) => {
      const cooldownUntil = modelCooldownMap.get(m) || 0;
      // Allow transient 503 models to retry after backoff; respect 5-min 429 quota cooldowns
      return cooldownUntil <= Date.now() + 20 * 1000;
    });

    const maxBackoffRounds = 2;
    for (let round = 1; round <= maxBackoffRounds; round++) {
      if (retryCandidates.length === 0 || sawAuthError) break;
      const remainingBeforeWait = deadlineAt - Date.now();
      if (remainingBeforeWait < 6000) break;

      const baseDelay = round === 1 ? 1100 : 2400;
      const jitter = Math.floor(Math.random() * 500);
      const waitMs = Math.min(baseDelay + jitter, remainingBeforeWait - 4500);
      if (waitMs > 200) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      // Clear short transient 503 cooldowns so the backoff round can retry active models cleanly
      for (const m of retryCandidates) {
        if ((modelCooldownMap.get(m) || 0) <= Date.now() + 20 * 1000) {
          modelCooldownMap.delete(m);
        }
      }

      const retryQueue = buildOrderedQueue(retryCandidates, new Set(), true);
      const retryResult = await tryQueue(retryQueue, { isRetryPass: true });
      if (retryResult) {
        return retryResult;
      }
    }
  }

  if (attemptErrors.length > 0) {
    throw new Error(`Cascade failed (${attemptErrors.join(" | ")})`);
  }
  throw lastErr || new Error("All Gemini cascade models failed");
}
function cleanSectionText(raw, preserveHorizontalRules = false) {
  const withoutHeadings = (raw || "").replace(/^#+\s+.*$/gm, "").replace(/^\*\*PASO B.*?\*\*$/gim, "");
  const withoutRules = preserveHorizontalRules ? withoutHeadings.replace(/^(?:\s*---+\s*\n)+|(?:\n\s*---+\s*)+$/g, "") : withoutHeadings.replace(/^\s*---+\s*$/gm, "");
  return withoutRules.replace(/\n{3,}/g, "\n\n").trim();
}
function parseDelimitedSections(text, keys) {
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const startRegex = new RegExp(`===${key}===`, "i");
    const startMatch = startRegex.exec(text);
    if (!startMatch) continue;
    const contentStart = startMatch.index + startMatch[0].length;
    let contentEnd = text.length;
    for (let j = i + 1; j < keys.length; j++) {
      const nextRegex = new RegExp(`===${keys[j]}===`, "i");
      const nextMatch = nextRegex.exec(text.slice(contentStart));
      if (nextMatch) {
        contentEnd = contentStart + nextMatch.index;
        break;
      }
    }
    out[key] = cleanSectionText(text.slice(contentStart, contentEnd), key === "CAPITULOS_DINAMICOS");
  }
  return out;
}
function stripInlineWrapper(s) {
  return (s || "").replace(/^[-•*\d.)\s]+/, "").replace(/^\*\*|\*\*$/g, "").replace(/\*\*/g, "").trim();
}
function parseDynamicChapters(raw, fallback) {
  if (!raw || raw.trim().length < 50) return fallback;
  const normalizedSeparators = raw.replace(/^\s*---+\s*$/gm, "\n---\n").replace(/\n{2,}(?=[^\n:]{4,95}\s*::\s*\S)/g, "\n---\n").trim();
  const rawChunks = normalizedSeparators.split(/\n\s*(?:---+\s*\n?\s*)+/).map((c) => c.trim()).filter((c) => c.length > 40);
  const chapters = [];
  const chapterKickers = ["Foco Principal", "Segundo Foco", "Panorama de la Cartelera"];
  for (const chunk of rawChunks.slice(0, 3)) {
    let title = "";
    let body = "";
    const doubleColonIdx = chunk.indexOf("::");
    if (doubleColonIdx > 2 && doubleColonIdx < 130) {
      title = stripInlineWrapper(chunk.slice(0, doubleColonIdx));
      body = cleanSectionText(chunk.slice(doubleColonIdx + 2));
    } else {
      const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2 && lines[0].length <= 115) {
        title = stripInlineWrapper(lines[0]);
        body = cleanSectionText(lines.slice(1).join("\n\n"));
      }
    }
    if (title && body.length >= 45) {
      chapters.push({
        kicker: chapterKickers[chapters.length] || "Panorama de la Cartelera",
        title: sanitizeEditorialSpanishGrammar(title),
        body: sanitizeEditorialSpanishGrammar(body),
      });
    }
  }
  return chapters.length > 0 ? chapters : fallback;
}
function parseClavesList(raw, fallback) {
  if (!raw || raw.trim().length < 25) return fallback;
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 18);
  const items = [];
  for (const line of lines.slice(0, 4)) {
    let title = "";
    let detail = "";
    const sepIdx = line.indexOf("::");
    if (sepIdx > 2 && sepIdx < 95) {
      title = stripInlineWrapper(line.slice(0, sepIdx));
      let rawDetail = line.slice(sepIdx + 2).trim();
      if (/^\*\*[^*]+\*\*$/.test(rawDetail)) {
        rawDetail = rawDetail.slice(2, -2).trim();
      }
      detail = rawDetail;
    } else {
      const boldMatch = /^\*\*([^*]{3,80})\*\*[:\s—-]*(.+)$/.exec(line.replace(/^[-•\d.)\s]+/, ""));
      if (boldMatch) {
        title = stripInlineWrapper(boldMatch[1]);
        detail = boldMatch[2].trim();
      } else {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 3 && colonIdx < 75) {
          title = stripInlineWrapper(line.slice(0, colonIdx));
          detail = line.slice(colonIdx + 1).trim();
        }
      }
    }
    if (title && detail.length >= 15) {
      items.push({ title: sanitizeEditorialSpanishGrammar(title), detail: sanitizeEditorialSpanishGrammar(detail) });
    }
  }
  return items.length >= 2 ? items : fallback;
}
function parseSpotlight(raw, fallback) {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed || /^ningun[oa]\b/i.test(trimmed) || /^no aplica\b/i.test(trimmed) || trimmed.length < 40) {
    return null;
  }
  const pipeIdx = trimmed.indexOf("||");
  const colonIdx = trimmed.indexOf("::");
  const sepIdx = pipeIdx > 2 && pipeIdx < 120 ? pipeIdx : colonIdx > 2 && colonIdx < 120 ? colonIdx : -1;
  if (sepIdx !== -1) {
    const title = stripInlineWrapper(trimmed.slice(0, sepIdx));
    const body = cleanSectionText(trimmed.slice(sepIdx + 2));
    if (title && body.length >= 40) {
      return { title: sanitizeEditorialSpanishGrammar(title), body: sanitizeEditorialSpanishGrammar(body) };
    }
  }
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && lines[0].length <= 105) {
    const title = stripInlineWrapper(lines[0]);
    const body = cleanSectionText(lines.slice(1).join("\n\n"));
    if (title && body.length >= 40) {
      return { title: sanitizeEditorialSpanishGrammar(title), body: sanitizeEditorialSpanishGrammar(body) };
    }
  }
  return fallback;
}
function stripHtmlToPlainText(rawHtml: string, maxChars = 3200): string {
  if (!rawHtml) return "";
  const cleaned = String(rawHtml)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:\/p|br|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&mdash;/gi, " — ")
    .replace(/&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code >= 32 && code <= 126 ? String.fromCharCode(code) : " ";
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const lastPeriod = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  return (lastPeriod > maxChars * 0.7 ? cut.slice(0, lastPeriod + 1) : cut).trim();
}
function parseTacticalKeys(raw: string, fallback: Array<{ title: string; summary: string }>) {
  if (!raw || raw.trim().length < 25) return fallback;
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 16);
  const items: Array<{ title: string; summary: string }> = [];
  for (const line of lines.slice(0, 4)) {
    let title = "";
    let summary = "";
    const pipeIdx = line.indexOf("||");
    const colonDoubleIdx = line.indexOf("::");
    const sepIdx =
      pipeIdx > 2 && pipeIdx < 90
        ? pipeIdx
        : colonDoubleIdx > 2 && colonDoubleIdx < 90
        ? colonDoubleIdx
        : -1;
    if (sepIdx !== -1) {
      title = stripInlineWrapper(line.slice(0, sepIdx));
      summary = line.slice(sepIdx + 2).trim();
    } else {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 3 && colonIdx < 75) {
        title = stripInlineWrapper(line.slice(0, colonIdx));
        summary = line.slice(colonIdx + 1).trim();
      }
    }
    if (/^\*\*[^*]+\*\*$/.test(summary)) {
      summary = summary.slice(2, -2).trim();
    }
    if (title && summary.length >= 18) {
      items.push({
        title: sanitizeEditorialSpanishGrammar(title),
        summary: sanitizeEditorialSpanishGrammar(summary),
      });
    }
    if (items.length >= 3) break;
  }
  return items.length >= 2 ? items : fallback;
}
function parsePostgameQuotes(raw: string): Array<{ speaker: string; teamAbbr?: string; quoteEs: string; sourceTitle?: string }> {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (
    !trimmed ||
    /^(?:ningun[ao]|no aplica|sin declaraciones|sin citas|n\/a|none)\b/i.test(trimmed)
  ) {
    return [];
  }
  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 20);
  const quotes: Array<{ speaker: string; teamAbbr?: string; quoteEs: string; sourceTitle?: string }> = [];
  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 3) continue;
    const speaker = stripInlineWrapper(parts[0]);
    const maybeTeam = stripInlineWrapper(parts[1]).toUpperCase();
    const hasTeamAbbr = /^[A-Z]{2,4}$/.test(maybeTeam);
    const quoteRaw = hasTeamAbbr ? parts[2] : parts[1];
    const sourceRaw = hasTeamAbbr ? parts[3] || "" : parts[2] || "";
    const quoteClean = quoteRaw
      .replace(/^[«"“'‘]+|[»"”'’]+$/g, "")
      .replace(/\*\*/g, "")
      .trim();
    if (!speaker || speaker.length < 3 || /^(?:autor|jugador|nombre|protagonista|n\/a)$/i.test(speaker)) {
      continue;
    }
    if (!quoteClean || quoteClean.length < 18 || /^ningun[ao]\b/i.test(quoteClean)) {
      continue;
    }
    quotes.push({
      speaker: sanitizeEditorialSpanishGrammar(speaker),
      teamAbbr: hasTeamAbbr ? maybeTeam : undefined,
      quoteEs: sanitizeEditorialSpanishGrammar(quoteClean),
      sourceTitle: sourceRaw ? stripInlineWrapper(sourceRaw).slice(0, 70) : undefined,
    });
    if (quotes.length >= 2) break;
  }
  return quotes;
}
function extractTacticalRecapDigest(storyText: string, maxChars = 650): string {
  const clean = String(storyText || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;
  const sentences = clean
    .split(/(?<=[.!?])\s+(?=[A-Z"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
  if (sentences.length === 0) return clean.slice(0, maxChars).trim();
  const tacticalRe = /\b(defens\w*|zone|switch\w*|blitz\w*|double[- ]team\w*|guard\w*|paint|3-point\w*|three-point\w*|rebound\w*|turnover\w*|run|clutch|overtime|adjust\w*|fourth quarter|coach|said|told|matchup\w*)\b/i;
  const picked: string[] = [];
  const used = new Set<number>();
  const tryAdd = (idx: number) => {
    if (used.has(idx) || !sentences[idx]) return;
    const candidate = sentences[idx];
    const currentLen = picked.join(" ").length;
    if (picked.length > 0 && currentLen + candidate.length + 1 > maxChars) return;
    picked.push(candidate);
    used.add(idx);
  };
  // Always keep lead sentence
  tryAdd(0);
  // Prioritize direct quotes first, then tactical/defensive sentences
  for (let i = 1; i < sentences.length; i++) {
    if (/["“][^"”]{12,}["”]/.test(sentences[i])) tryAdd(i);
  }
  for (let i = 1; i < sentences.length; i++) {
    if (tacticalRe.test(sentences[i])) tryAdd(i);
  }
  for (let i = 1; i < sentences.length; i++) {
    tryAdd(i);
  }
  const joined = picked.join(" ").trim();
  return joined.length <= maxChars ? joined : `${joined.slice(0, maxChars - 1).trim()}…`;
}
function parseNightQuotes(
  raw: string
): Array<{ speaker: string; teamAbbr?: string; matchup?: string; quoteEs: string; sourceTitle?: string }> {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (
    !trimmed ||
    /^(?:ningun[ao]|no aplica|sin declaraciones|sin citas|n\/a|none)\b/i.test(trimmed)
  ) {
    return [];
  }
  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 22);
  const quotes: Array<{ speaker: string; teamAbbr?: string; matchup?: string; quoteEs: string; sourceTitle?: string }> = [];
  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 3) continue;
    const speaker = stripInlineWrapper(parts[0]);
    const maybeTeam = stripInlineWrapper(parts[1]).toUpperCase();
    const hasTeamAbbr = /^[A-Z]{2,4}$/.test(maybeTeam);
    let matchup: string | undefined;
    let quoteRaw = "";
    let sourceRaw = "";
    if (parts.length >= 5 && hasTeamAbbr) {
      matchup = stripInlineWrapper(parts[2]).slice(0, 28);
      quoteRaw = parts[3];
      sourceRaw = parts[4] || "";
    } else if (parts.length === 4 && hasTeamAbbr) {
      const p2Clean = stripInlineWrapper(parts[2]);
      if (/^[A-Z]{2,4}\s*(?:vs\.?|@|-|–)\s*[A-Z]{2,4}$/i.test(p2Clean)) {
        matchup = p2Clean.toUpperCase();
        quoteRaw = parts[3];
        sourceRaw = "";
      } else {
        quoteRaw = parts[2];
        sourceRaw = parts[3] || "";
      }
    } else {
      quoteRaw = hasTeamAbbr ? parts[2] : parts[1];
      sourceRaw = hasTeamAbbr ? parts[3] || "" : parts[2] || "";
    }
    const quoteClean = quoteRaw
      .replace(/^[«"“'‘]+|[»"”'’]+$/g, "")
      .replace(/\*\*/g, "")
      .trim();
    if (!speaker || speaker.length < 3 || /^(?:autor|jugador|nombre|protagonista|n\/a)$/i.test(speaker)) {
      continue;
    }
    if (!quoteClean || quoteClean.length < 18 || /^ningun[ao]\b/i.test(quoteClean)) {
      continue;
    }
    quotes.push({
      speaker: sanitizeEditorialSpanishGrammar(speaker),
      teamAbbr: hasTeamAbbr ? maybeTeam : undefined,
      matchup,
      quoteEs: sanitizeEditorialSpanishGrammar(quoteClean),
      sourceTitle: sourceRaw ? stripInlineWrapper(sourceRaw).slice(0, 70) : undefined,
    });
    if (quotes.length >= 3) break;
  }
  return quotes;
}
function computeSlateTacticalRadar(gd: any, matchEnrichments: Map<string, any>) {
  type TeamSlateRow = {
    eventId: string;
    matchupLabel: string;
    teamAbbr: string;
    teamName: string;
    isWinner: boolean;
    efgPct: number;
    tovPct: number;
    orebPct: number;
    ftRate: number;
    astPct: number;
    stocks: number;
  };
  const rows: TeamSlateRow[] = [];
  const perGameTacticalLines = new Map<string, string>();
  const defensiveDuels: string[] = [];
  const seenDuels = new Set<string>();

  const buildSide = (side: any, opp: any, sideLog: any, oppLog: any, m: any): TeamSlateRow => {
    const fga = Number(sideLog?.fga || 0);
    const fgm = Number(sideLog?.fgm || 0);
    const fg3m = Number(sideLog?.fg3m ?? side.fg3m ?? 0);
    const ftm = Number(sideLog?.ftm || 0);
    const fta = Number(sideLog?.fta || 0);
    const tov = Number(sideLog?.tov ?? side.tov ?? 0);
    const oreb = Number(sideLog?.oreb ?? 0);
    const ast = Number(sideLog?.ast ?? side.ast ?? 0);
    const stl = Number(sideLog?.stl ?? 0);
    const blk = Number(sideLog?.blk ?? 0);
    const oppReb = Number(oppLog?.reb ?? opp.reb ?? 0);
    const oppOreb = Number(oppLog?.oreb ?? 0);
    const oppDreb = Math.max(0, oppReb - oppOreb);

    const efgPct =
      typeof sideLog?.efgPct === "number" && Number.isFinite(sideLog.efgPct)
        ? sideLog.efgPct
        : typeof side.efgPct === "number" && Number.isFinite(side.efgPct)
        ? side.efgPct
        : fga > 0
        ? ((fgm + 0.5 * fg3m) / fga) * 100
        : 0;
    const estPoss = fga > 0 ? fga + 0.44 * fta + tov : Math.max(80, Number(m.pace || 98));
    const tovPct = (tov / Math.max(1, estPoss)) * 100;
    const orebPct = oreb + oppDreb > 0 ? (oreb / (oreb + oppDreb)) * 100 : 0;
    const ftRate = fga > 0 ? (ftm / fga) * 100 : 0;
    const astPct = fgm > 0 ? (ast / fgm) * 100 : 0;

    return {
      eventId: String(m.eventId),
      matchupLabel: `${m.away.abbr} ${m.away.score}-${m.home.score} ${m.home.abbr}`,
      teamAbbr: String(side.abbr || ""),
      teamName: String(side.name || side.shortName || side.abbr || ""),
      isWinner: Boolean(side.isWinner),
      efgPct: Number(efgPct.toFixed(1)),
      tovPct: Number(tovPct.toFixed(1)),
      orebPct: Number(orebPct.toFixed(1)),
      ftRate: Number(ftRate.toFixed(1)),
      astPct: Number(astPct.toFixed(1)),
      stocks: stl + blk,
    };
  };

  for (const m of gd.matchups || []) {
    const enr = matchEnrichments.get(m.eventId);
    const awayRow = buildSide(m.away, m.home, enr?.awayLog, enr?.homeLog, m);
    const homeRow = buildSide(m.home, m.away, enr?.homeLog, enr?.awayLog, m);
    rows.push(awayRow, homeRow);

    const winRow = awayRow.isWinner ? awayRow : homeRow;
    const loseRow = awayRow.isWinner ? homeRow : awayRow;
    const factorScores = [
      { label: "Eficiencia de tiro (eFG%)", score: (winRow.efgPct - loseRow.efgPct) * 0.40 },
      { label: "Cuidado del balón (TOV%)", score: (loseRow.tovPct - winRow.tovPct) * 0.25 * 1.6 },
      { label: "Rebote ofensivo (OREB%)", score: (winRow.orebPct - loseRow.orebPct) * 0.20 },
      { label: "Viajes a la línea (FTr)", score: (winRow.ftRate - loseRow.ftRate) * 0.15 },
    ].sort((a, b) => b.score - a.score);
    const decisive = factorScores[0]?.label || "Eficiencia de tiro (eFG%)";
    perGameTacticalLines.set(
      m.eventId,
      `Four Factors (${winRow.teamAbbr} vs ${loseRow.teamAbbr}): eFG ${winRow.efgPct.toFixed(1)}% vs ${loseRow.efgPct.toFixed(1)}% | TOV% ${winRow.tovPct.toFixed(1)}% vs ${loseRow.tovPct.toFixed(1)}% | OREB% ${winRow.orebPct.toFixed(1)}% vs ${loseRow.orebPct.toFixed(1)}% | ROB+TAP ${winRow.stocks} vs ${loseRow.stocks} | Factor decisivo: ${decisive}`
    );

    if (Array.isArray(enr?.pbp?.defensiveDuels)) {
      for (const duel of enr.pbp.defensiveDuels.slice(0, 2)) {
        const cleanDuel = String(duel || "").trim();
        if (!cleanDuel) continue;
        const tagged = `[${m.away.abbr} @ ${m.home.abbr}] ${cleanDuel}`;
        if (!seenDuels.has(tagged) && defensiveDuels.length < 6) {
          seenDuels.add(tagged);
          defensiveDuels.push(tagged);
        }
      }
    }
  }

  const extremes: Array<{
    label: string;
    teamAbbr: string;
    valueDisplay: string;
    matchupLabel: string;
    eventId: string;
  }> = [];

  if (rows.length > 0) {
    const bestEfg = [...rows].sort((a, b) => b.efgPct - a.efgPct)[0];
    const bestTov = [...rows].sort((a, b) => a.tovPct - b.tovPct)[0];
    const bestOreb = [...rows].sort((a, b) => b.orebPct - a.orebPct)[0];
    const bestStocks = [...rows].sort((a, b) => b.stocks - a.stocks)[0];

    if (bestEfg) {
      extremes.push({
        label: "Techo eFG%",
        teamAbbr: bestEfg.teamAbbr,
        valueDisplay: `${bestEfg.efgPct.toFixed(1)}%`,
        matchupLabel: bestEfg.matchupLabel,
        eventId: bestEfg.eventId,
      });
    }
    if (bestTov) {
      extremes.push({
        label: "Menor TOV%",
        teamAbbr: bestTov.teamAbbr,
        valueDisplay: `${bestTov.tovPct.toFixed(1)}%`,
        matchupLabel: bestTov.matchupLabel,
        eventId: bestTov.eventId,
      });
    }
    if (bestOreb && bestOreb.orebPct > 0) {
      extremes.push({
        label: "Dominio OREB%",
        teamAbbr: bestOreb.teamAbbr,
        valueDisplay: `${bestOreb.orebPct.toFixed(1)}%`,
        matchupLabel: bestOreb.matchupLabel,
        eventId: bestOreb.eventId,
      });
    }
    if (bestStocks && bestStocks.stocks > 0) {
      extremes.push({
        label: "Cerrojo ROB+TAP",
        teamAbbr: bestStocks.teamAbbr,
        valueDisplay: `${bestStocks.stocks} STK`,
        matchupLabel: bestStocks.matchupLabel,
        eventId: bestStocks.eventId,
      });
    }
  }

  const winRows = rows.filter((r) => r.isWinner);
  const loseRows = rows.filter((r) => !r.isWinner);
  const avgWinEfg = winRows.length ? winRows.reduce((s, r) => s + r.efgPct, 0) / winRows.length : 0;
  const avgLoseEfg = loseRows.length ? loseRows.reduce((s, r) => s + r.efgPct, 0) / loseRows.length : 0;
  const avgWinTov = winRows.length ? winRows.reduce((s, r) => s + r.tovPct, 0) / winRows.length : 0;
  const avgLoseTov = loseRows.length ? loseRows.reduce((s, r) => s + r.tovPct, 0) / loseRows.length : 0;

  const bestEfgRow = [...rows].sort((a, b) => b.efgPct - a.efgPct)[0];
  const bestStocksRow = [...rows].sort((a, b) => b.stocks - a.stocks)[0];
  const bestOrebRow = [...rows].sort((a, b) => b.orebPct - a.orebPct)[0];

  const fallbackKeys: Array<{ title: string; summary: string }> = [
    {
      title: "Brecha de eficacia en el tiro",
      summary: bestEfgRow
        ? `Los ganadores promediaron ${avgWinEfg.toFixed(1)}% eFG frente al ${avgLoseEfg.toFixed(1)}% de los perdedores, con **${bestEfgRow.teamName}** marcando el techo de la noche (${bestEfgRow.efgPct.toFixed(1)}% eFG en ${bestEfgRow.matchupLabel}).`
        : `La eficacia efectiva en el tiro marcó la principal diferencia entre vencedores (${avgWinEfg.toFixed(1)}%) y derrotados (${avgLoseEfg.toFixed(1)}%).`,
    },
    {
      title: "Actividad defensiva y cuidado de posesión",
      summary: bestStocksRow && bestStocksRow.stocks > 0
        ? `Los vencedores protegieron mejor el balón (${avgWinTov.toFixed(1)}% TOV frente al ${avgLoseTov.toFixed(1)}% rival), mientras **${bestStocksRow.teamName}** lideró la disrupción con ${bestStocksRow.stocks} acciones entre robos y tapones.`
        : `La economía de posesiones inclinó la balanza: ${avgWinTov.toFixed(1)}% de pérdidas en ganadores frente al ${avgLoseTov.toFixed(1)}% en los derrotados.`,
    },
    {
      title: defensiveDuels.length > 0 ? "Duelos directos y dominio en los tableros" : "Control del rebote ofensivo y ritmo",
      summary:
        defensiveDuels.length > 0
          ? `El Play-by-Play registró duelos defensivos clave como ${defensiveDuels[0]}, complementados por el dominio en rebote ofensivo de **${bestOrebRow?.teamName || "los vencedores"}** (${bestOrebRow ? `${bestOrebRow.orebPct.toFixed(1)}% OREB` : `${gd.pulse.avgPace.toFixed(1)} Pace`}).`
          : bestOrebRow && bestOrebRow.orebPct > 0
          ? `En un ritmo medio de ${gd.pulse.avgPace.toFixed(1)} posesiones, **${bestOrebRow.teamName}** lideró el castigo en segunda oportunidad con un ${bestOrebRow.orebPct.toFixed(1)}% de rebote ofensivo (${bestOrebRow.matchupLabel}).`
          : `La cartelera se movió a un ritmo medio de ${gd.pulse.avgPace.toFixed(1)} posesiones con ${gd.pulse.closeGamesCount} finales apretados (≤5 pts).`,
    },
  ];

  const dossierText = [
    `PROMEDIO FOUR FACTORS GANADORES VS PERDEDORES: eFG ${avgWinEfg.toFixed(1)}% vs ${avgLoseEfg.toFixed(1)}% | TOV% ${avgWinTov.toFixed(1)}% vs ${avgLoseTov.toFixed(1)}%`,
    extremes.length > 0
      ? `EXTREMOS TÁCTICOS DE LA NOCHE: ${extremes.map((e) => `${e.label}: ${e.teamAbbr} (${e.valueDisplay}, ${e.matchupLabel})`).join(" | ")}`
      : "",
    defensiveDuels.length > 0
      ? `DUELOS DEFENSIVOS DIRECTOS VERIFICADOS EN PLAY-BY-PLAY: ${defensiveDuels.join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    keys: fallbackKeys,
    extremes,
    defensiveDuels,
    perGameTacticalLines,
    dossierText,
  };
}
function computeGameTacticalProfile(report: any) {
  const computeSide = (side: any, opp: any) => {
    const t = side.totals || {};
    const ot = opp.totals || {};
    const fga = Number(t.fga || 0);
    const fgm = Number(t.fgm || 0);
    const fg3a = Number(t.fg3a || 0);
    const ftm = Number(t.ftm || 0);
    const fta = Number(t.fta || 0);
    const tov = Number(t.tov || 0);
    const oreb = Number(t.oreb || 0);
    const ast = Number(t.ast || 0);
    const oppReb = Number(ot.reb || 0);
    const oppOreb = Number(ot.oreb || 0);
    const oppDreb = Math.max(0, oppReb - oppOreb);
    const efgPct = Number(
      typeof t.efgPct === "number" && Number.isFinite(t.efgPct)
        ? t.efgPct
        : fga > 0
        ? ((fgm + 0.5 * Number(t.fg3m || 0)) / fga) * 100
        : 0
    );
    const tovPct = (tov / Math.max(1, fga + 0.44 * fta + tov)) * 100;
    const orebPct = (oreb / Math.max(1, oreb + oppDreb)) * 100;
    const ftRate = (ftm / Math.max(1, fga)) * 100;
    const astPct = (ast / Math.max(1, fgm)) * 100;
    const threePointRatePct = (fg3a / Math.max(1, fga)) * 100;
    const ptsPaint = typeof t.ptsPaint === "number" && Number.isFinite(t.ptsPaint) ? t.ptsPaint : null;
    const paintSharePct = ptsPaint !== null && Number(side.score || 0) > 0 ? (ptsPaint / Number(side.score)) * 100 : null;
    return {
      abbr: String(side.abbr || ""),
      efgPct: Number(efgPct.toFixed(1)),
      tovPct: Number(tovPct.toFixed(1)),
      orebPct: Number(orebPct.toFixed(1)),
      ftRate: Number(ftRate.toFixed(1)),
      astPct: Number(astPct.toFixed(1)),
      paintSharePct: paintSharePct !== null ? Number(paintSharePct.toFixed(1)) : null,
      threePointRatePct: Number(threePointRatePct.toFixed(1)),
      ptsPaint,
      ptsFastBreak: typeof t.ptsFastBreak === "number" ? t.ptsFastBreak : null,
      ptsOffTov: typeof t.ptsOffTov === "number" ? t.ptsOffTov : null,
      ptsSecondChance: typeof t.ptsSecondChance === "number" ? t.ptsSecondChance : null,
    };
  };

  const awayMetrics = computeSide(report.away, report.home);
  const homeMetrics = computeSide(report.home, report.away);
  const winnerSide = report.away.isWinner ? awayMetrics : homeMetrics;
  const loserSide = report.away.isWinner ? homeMetrics : awayMetrics;

  const factorImpacts = [
    {
      label: "Acierto efectivo (eFG%)",
      score: (winnerSide.efgPct - loserSide.efgPct) * 0.4,
      summary: `${winnerSide.abbr} ${winnerSide.efgPct.toFixed(1)}% frente a ${loserSide.abbr} ${loserSide.efgPct.toFixed(1)}% en tiro efectivo`,
    },
    {
      label: "Cuidado del balón (TOV%)",
      score: (loserSide.tovPct - winnerSide.tovPct) * 0.25,
      summary: `${winnerSide.abbr} limitó sus pérdidas al ${winnerSide.tovPct.toFixed(1)}% de posesiones frente al ${loserSide.tovPct.toFixed(1)}% de ${loserSide.abbr}`,
    },
    {
      label: "Rebote ofensivo (OREB%)",
      score: (winnerSide.orebPct - loserSide.orebPct) * 0.2,
      summary: `${winnerSide.abbr} capturó el ${winnerSide.orebPct.toFixed(1)}% de sus rebotes en aro rival frente al ${loserSide.orebPct.toFixed(1)}% de ${loserSide.abbr}`,
    },
    {
      label: "Presión al tiro libre (FTr)",
      score: (winnerSide.ftRate - loserSide.ftRate) * 0.15,
      summary: `${winnerSide.abbr} generó un ratio de tiro libre de ${winnerSide.ftRate.toFixed(1)}% frente al ${loserSide.ftRate.toFixed(1)}% de ${loserSide.abbr}`,
    },
  ].sort((a, b) => b.score - a.score);

  const topFactor = factorImpacts[0];
  const pbpClosingAway = Array.isArray(report.pbpHighlights?.closingLineupAway) ? report.pbpHighlights.closingLineupAway : [];
  const pbpClosingHome = Array.isArray(report.pbpHighlights?.closingLineupHome) ? report.pbpHighlights.closingLineupHome : [];
  const fallbackClosing = (side: any) =>
    [...(side.starters || []), ...(side.bench || [])]
      .sort((a, b) => Number(b.minutes || 0) - Number(a.minutes || 0))
      .slice(0, 5)
      .map((p) => `#${p.jersey} ${p.name}`);

  return {
    away: awayMetrics,
    home: homeMetrics,
    decisiveFactorLabel: topFactor.label,
    decisiveFactorSummary: topFactor.summary,
    closingLineupAway: pbpClosingAway.length >= 3 ? pbpClosingAway.slice(0, 5) : fallbackClosing(report.away),
    closingLineupHome: pbpClosingHome.length >= 3 ? pbpClosingHome.slice(0, 5) : fallbackClosing(report.home),
    defensiveDuels: Array.isArray(report.pbpHighlights?.defensiveDuels) ? report.pbpHighlights.defensiveDuels.slice(0, 6) : [],
  };
}
function createScoutingEngine(deps) {
  async function fetchLivePressContext(dateIso, forceRefresh = false) {
    const yyyymmdd = dateIso.replace(/-/g, "");
    const byMatchup = /* @__PURE__ */ new Map();
    const dayNotes = [];
    const daySources = [];
    const [sbSettled] = await Promise.allSettled([deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`, 15 * 60 * 1e3, {}, 7e3, forceRefresh)]);
    if (sbSettled.status === "fulfilled" && Array.isArray(sbSettled.value?.events)) {
      for (const ev of sbSettled.value.events) {
        const comp = ev?.competitions?.[0];
        const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const homeComp = competitors.find((c) => c?.homeAway === "home");
        const awayComp = competitors.find((c) => c?.homeAway === "away");
        const homeAbbr = normalizeEspnTeamAbbr(homeComp?.team?.abbreviation || "");
        const awayAbbr = normalizeEspnTeamAbbr(awayComp?.team?.abbreviation || "");
        if (!homeAbbr || !awayAbbr) continue;
        const key = `${awayAbbr}@${homeAbbr}`;
        const notes = [];
        const sources = [];
        const headlines = Array.isArray(comp?.headlines) ? comp.headlines : [];
        for (const hl of headlines) {
          const shortTxt = String(hl?.shortLinkText || "").trim();
          const descTxt = String(hl?.description || "").trim();
          const combined = [shortTxt, descTxt].filter(Boolean).join(" \u2014 ");
          if (combined) {
            notes.push(combined);
            dayNotes.push(`[${awayAbbr} @ ${homeAbbr}] ${combined}`);
          }
        }
        const evLinks = Array.isArray(ev?.links) ? ev.links : [];
        const recapLink = evLinks.find((l) => Array.isArray(l?.rel) && (l.rel.includes("recap") || l.rel.includes("summary"))) || evLinks[0];
        if (recapLink?.href) {
          const src = { uri: String(recapLink.href).replace(/^http:\/\//i, "https://"), title: `${awayAbbr} vs ${homeAbbr} \u2014 Cr\xF3nica y Resumen Oficial ESPN/AP` };
          sources.push(src);
          if (daySources.length < 6) daySources.push(src);
        }
        byMatchup.set(key, { espnEventId: String(ev?.id || ""), notes, sources });
      }
    }
    return { byMatchup, dayNotes, daySources };
  }
  async function fetchEspnFullGameRecap(espnEventIdHint, gameDate, awayAbbr, homeAbbr, forceRefresh = false) {
    try {
      const espnEventId =
        (espnEventIdHint && /^\d{6,14}$/.test(String(espnEventIdHint)) ? String(espnEventIdHint) : "") ||
        (await resolveEspnEventIdForGame(gameDate, awayAbbr, homeAbbr, forceRefresh));
      if (!espnEventId) return null;
      const summary = await deps.cachedFetchJson(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${espnEventId}`,
        20 * 60 * 1000,
        {},
        3500,
        forceRefresh
      );
      const article = summary?.article;
      if (!article || typeof article !== "object") return null;
      const headline = String(article.headline || "").trim();
      const storyText = stripHtmlToPlainText(String(article.story || ""), 3200);
      if (!headline && storyText.length < 120) return null;
      const rawUrl = String(article?.links?.web?.href || article?.links?.mobile?.href || "").trim();
      const url = rawUrl
        ? rawUrl.replace(/^http:\/\//i, "https://")
        : `https://www.espn.com/nba/recap/_/gameId/${espnEventId}`;
      return {
        espnEventId,
        headline,
        storyText,
        url,
        title: `${awayAbbr} vs ${homeAbbr} — Crónica Oficial AP/ESPN`,
      };
    } catch {
      return null;
    }
  }
  async function fetchSlateEspnFullRecaps(gd: any, pressCtx: any, forceRefresh = false) {
    const matchups = Array.isArray(gd?.matchups) ? gd.matchups : [];
    const digestsByEventId = new Map<string, { headline: string; digest: string; url: string; title: string }>();
    const sources: Array<{ uri: string; title: string }> = [];
    if (matchups.length === 0) return { digestsByEventId, sources, fetchedCount: 0 };

    const deadlineMs = 4500;
    const concurrency = 6;
    let cursor = 0;
    let timedOut = false;

    const worker = async () => {
      while (!timedOut) {
        const idx = cursor++;
        if (idx >= matchups.length) break;
        const m = matchups[idx];
        const key = `${m.away.abbr}@${m.home.abbr}`;
        const hintId = pressCtx?.byMatchup?.get(key)?.espnEventId || "";
        const recap = await fetchEspnFullGameRecap(hintId, gd.selectedDate, m.away.abbr, m.home.abbr, forceRefresh).catch(() => null);
        if (recap && !timedOut) {
          const digest = extractTacticalRecapDigest(recap.storyText, 640);
          if (digest || recap.headline) {
            digestsByEventId.set(m.eventId, {
              headline: recap.headline,
              digest,
              url: recap.url,
              title: recap.title,
            });
            if (recap.url) {
              sources.push({ uri: recap.url, title: recap.title });
            }
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, matchups.length) }, () => worker());
    await Promise.race([
      Promise.all(workers),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve();
        }, deadlineMs)
      ),
    ]);

    return {
      digestsByEventId,
      sources,
      fetchedCount: digestsByEventId.size,
    };
  }
  function utcToEasternDateIso(utcStr) {
    if (!utcStr) return "";
    const dt = new Date(utcStr);
    if (Number.isNaN(dt.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(dt);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return y && m && d ? `${y}-${m}-${d}` : "";
  }
  function normalizeScheduleDateToEasternIso(estRaw, gdDateRaw, utcRaw) {
    const estTrim = String(estRaw || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(estTrim)) {
      return estTrim.slice(0, 10);
    }
    for (const candidate of [estTrim, String(gdDateRaw || "").trim()]) {
      const slashMatch = candidate.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (slashMatch) {
        return `${slashMatch[3]}-${slashMatch[1]}-${slashMatch[2]}`;
      }
    }
    const utcTrim = String(utcRaw || "").trim();
    if (utcTrim.includes("T")) {
      const converted = utcToEasternDateIso(utcTrim);
      if (converted) return converted;
    }
    return utcTrim.slice(0, 10);
  }
  let cachedScheduleList = null;
  async function fetchLeagueScheduleGames(forceRefresh = false) {
    if (!forceRefresh && cachedScheduleList && cachedScheduleList.expiresAt > Date.now()) {
      return cachedScheduleList.games;
    }
    const gameMap = /* @__PURE__ */ new Map();
    for (const sg of STATIC_SCHEDULE_2027) {
      const fallbackArena = NBA_TEAM_ARENAS[sg.homeAbbr];
      gameMap.set(`${sg.dateIso}:${sg.awayAbbr}:${sg.homeAbbr}`, { gameId: sg.gameId, dateIso: sg.dateIso, dateTimeUtc: sg.dateTimeUtc, awayAbbr: sg.awayAbbr, homeAbbr: sg.homeAbbr, arenaName: fallbackArena?.arenaName || `Pabell\xF3n ${sg.homeAbbr}`, arenaCity: fallbackArena?.arenaCity || "" });
    }
    try {
      const raw = await deps.cachedFetchJson("https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json", 6 * 60 * 60 * 1e3, NBA_LIVE_HEADERS, 3500, forceRefresh);
      const gameDates = Array.isArray(raw?.leagueSchedule?.gameDates) ? raw.leagueSchedule.gameDates : [];
      for (const gd of gameDates) {
        const gamesArr = Array.isArray(gd?.games) ? gd.games : [];
        for (const g of gamesArr) {
          const homeAbbr = String(g?.homeTeam?.teamTricode || "").trim().toUpperCase();
          const awayAbbr = String(g?.awayTeam?.teamTricode || "").trim().toUpperCase();
          if (!homeAbbr || !awayAbbr) continue;
          const utcStr = String(g?.gameDateTimeUTC || g?.gameDateUTC || "").trim();
          const dateIso = normalizeScheduleDateToEasternIso(g?.gameDateEst, gd?.gameDate, utcStr);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
          const fallbackArena = NBA_TEAM_ARENAS[homeAbbr];
          gameMap.set(`${dateIso}:${awayAbbr}:${homeAbbr}`, { gameId: String(g?.gameId || ""), dateIso, dateTimeUtc: utcStr, awayAbbr, homeAbbr, arenaName: String(g?.arenaName || "").trim() || fallbackArena?.arenaName || `Pabell\xF3n ${homeAbbr}`, arenaCity: String(g?.arenaCity || "").trim() || fallbackArena?.arenaCity || "" });
        }
      }
    } catch {
    }
    if (gameMap.size === 0) {
      try {
        const full = await deps.getFullLeagueMemory();
        for (const t of full.teams) {
          for (const g of t.games) {
            const dateIso = g.date.slice(0, 10);
            const isHome = g.isHome;
            const homeAbbr = isHome ? t.abbreviation : g.opponentAbbr;
            const awayAbbr = isHome ? g.opponentAbbr : t.abbreviation;
            const key = `${dateIso}:${awayAbbr}:${homeAbbr}`;
            if (!gameMap.has(key)) {
              const fallbackArena = NBA_TEAM_ARENAS[homeAbbr];
              gameMap.set(key, { gameId: g.eventId || `mem_${dateIso}_${awayAbbr}_${homeAbbr}`, dateIso, dateTimeUtc: `${dateIso}T00:00:00Z`, awayAbbr, homeAbbr, arenaName: fallbackArena?.arenaName || `Pabell\xF3n ${homeAbbr}`, arenaCity: fallbackArena?.arenaCity || "" });
            }
          }
        }
      } catch {
      }
    }
    const combined = [...gameMap.values()];
    combined.sort((a, b) => (a.dateIso + "T" + (a.dateTimeUtc || "")).localeCompare(b.dateIso + "T" + (b.dateTimeUtc || "")));
    cachedScheduleList = { expiresAt: Date.now() + 6 * 60 * 60 * 1e3, games: combined };
    return combined;
  }
  async function fetchEspnInjuriesByName(forceRefresh = false) {
    const map = /* @__PURE__ */ new Map();
    try {
      const data = await deps.cachedFetchJson("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries", 20 * 60 * 1e3, {}, 5500, forceRefresh);
      const teamsArr = Array.isArray(data?.injuries) ? data.injuries : [];
      for (const tBlock of teamsArr) {
        const items = Array.isArray(tBlock?.injuries) ? tBlock.injuries : [];
        for (const inj of items) {
          const dispName = String(inj?.athlete?.displayName || "").trim();
          if (!dispName) continue;
          const status = String(inj?.status || "").trim();
          const cleanField = __name((val) => {
            const s = String(val || "").trim();
            return /^not\s+specified$/i.test(s) ? "" : s;
          }, "cleanField");
          const typeDesc = cleanField(inj?.details?.type);
          const sideDesc = cleanField(inj?.details?.side);
          const detailDesc = cleanField(inj?.details?.detail);
          const returnDate = cleanField(inj?.details?.returnDate);
          const comment = String(
            inj?.shortComment ||
            inj?.athlete?.notes?.items?.[0]?.headline ||
            inj?.details?.fantasyStatus?.description ||
            ""
          ).trim();

          const baseDetail = [sideDesc, typeDesc, detailDesc].filter(Boolean).join(" ").trim();
          let combinedDetail = baseDetail;
          if (comment) {
            combinedDetail = combinedDetail ? `${combinedDetail} (${comment})` : comment;
          }
          if (returnDate) {
            combinedDetail = combinedDetail ? `${combinedDetail} [Regreso est: ${returnDate}]` : `Regreso est: ${returnDate}`;
          }
          map.set(normalizePlain(dispName), { status, detail: combinedDetail });
        }
      }
    } catch {
    }
    return map;
  }
  function computeGameTimeRemaining(periodNum, clockStr) {
    const [mStr, sStr] = (clockStr || "00:00").split(":");
    const m = Number(mStr) || 0;
    const s = Number(sStr) || 0;
    if (periodNum <= 4) {
      const totalRegSecs = (4 - periodNum) * 720 + (m * 60 + s);
      const remMins = Math.floor(totalRegSecs / 60);
      const remSecs = totalRegSecs % 60;
      return `${remMins} min y ${String(remSecs).padStart(2, "0")}s de encuentro`;
    }
    return `${m} min y ${String(s).padStart(2, "0")}s de prórroga`;
  }
  async function resolveEspnEventIdForGame(gameDate, awayAbbr, homeAbbr, forceRefresh = false) {
    if (!gameDate || !awayAbbr || !homeAbbr) return "";
    try {
      const yyyymmdd = String(gameDate).slice(0, 10).replace(/-/g, "");
      if (!/^\d{8}$/.test(yyyymmdd)) return "";
      const sb = await deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`, 15 * 60 * 1e3, {}, 5500, forceRefresh);
      const events = Array.isArray(sb?.events) ? sb.events : [];
      for (const ev of events) {
        const comp = ev?.competitions?.[0];
        const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const h = normalizeEspnTeamAbbr(competitors.find((c) => c?.homeAway === "home")?.team?.abbreviation || "");
        const a = normalizeEspnTeamAbbr(competitors.find((c) => c?.homeAway === "away")?.team?.abbreviation || "");
        if (h === homeAbbr && a === awayAbbr && ev?.id) {
          return String(ev.id);
        }
      }
    } catch {
    }
    return "";
  }
  async function fetchPlayByPlayFoulOuts(eventId, fouledOutTargets, seasonLabel, forceRefresh = false, matchupMeta = null) {
    const out = /* @__PURE__ */ new Map();
    if (!Array.isArray(fouledOutTargets) || fouledOutTargets.length === 0 || !eventId) {
      return out;
    }
    const normalizedTargets = fouledOutTargets.map((t) =>
      typeof t === "string"
        ? { playerId: t, name: "", teamAbbr: "" }
        : { playerId: String(t?.playerId || ""), name: String(t?.name || ""), teamAbbr: String(t?.teamAbbr || "").toUpperCase() }
    );
    const ttl = seasonLabel === "2026-27" ? 15 * 60 * 1e3 : 180 * 60 * 1e3;
    try {
      let actions = [];
      if (/^00\d{8}$/.test(eventId)) {
        try {
          const pbp = await deps.cachedFetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${eventId}.json`, ttl, NBA_LIVE_HEADERS, 8500, forceRefresh);
          if (Array.isArray(pbp?.game?.actions)) {
            actions = pbp.game.actions;
          }
        } catch {
        }
      }
      if (actions.length === 0) {
        try {
          const espnEventId = !/^00\d{8}$/.test(eventId)
            ? eventId
            : await resolveEspnEventIdForGame(matchupMeta?.gameDate, matchupMeta?.awayAbbr, matchupMeta?.homeAbbr, forceRefresh);
          if (espnEventId) {
            const espnSummary = await deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${espnEventId}`, ttl, {}, 7500, forceRefresh);
            const espnPlays = Array.isArray(espnSummary?.plays) ? espnSummary.plays : [];
            if (espnPlays.length > 0) {
              actions = espnPlays.map((p) => ({
                period: Number(p?.period?.number) || 1,
                clock: p?.clock?.displayValue || "",
                teamTricode: normalizeEspnTeamAbbr(p?.team?.abbreviation || ""),
                personId: p?.athlete?.id || "",
                playerNameI: p?.athlete?.displayName || "",
                description: String(p?.text || "").trim(),
                actionType: /foul/i.test(String(p?.type?.text || p?.text || "")) ? "foul" : String(p?.type?.text || "").toLowerCase(),
                subType: String(p?.type?.text || "").toLowerCase(),
              }));
            }
          }
        } catch {
        }
      }
      if (actions.length === 0) return out;
      for (const target of normalizedTargets) {
        const pid = target.playerId;
        const numPid = Number(pid);
        const normTargetName = normalizePlain(target.name);
        const nameParts = normTargetName.split(/\s+/).filter(Boolean);
        const firstInitial = nameParts.length > 1 ? nameParts[0][0] : "";
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : nameParts[0] || "";
        const initialLast = nameParts.length > 1 ? `${firstInitial}. ${lastName}` : normTargetName;
        const playerFouls = actions.filter((a) => {
          const actType = String(a?.actionType || "").toLowerCase();
          const descRaw = String(a?.description || "");
          const descLow = descRaw.toLowerCase();
          if (actType === "ejection" || descLow.includes("ejection")) return false;
          if (actType !== "foul" && !descLow.includes("foul")) return false;
          const subType = String(a?.subType || "").toLowerCase();
          if (subType.includes("technical") || subType.includes("defense 3 second") || descLow.includes("technical foul") || descLow.includes("defensive 3 second")) {
            return false;
          }
          if (numPid && Number(a?.personId) === numPid) return true;
          const actTeam = String(a?.teamTricode || "").toUpperCase();
          if (target.teamAbbr && actTeam && actTeam !== target.teamAbbr) return false;
          if (!normTargetName) return false;
          const actionPlayerNorm = normalizePlain(a?.playerNameI || a?.playerName || "");
          if (actionPlayerNorm) {
            if (actionPlayerNorm === normTargetName || actionPlayerNorm === initialLast) return true;
            if (firstInitial && lastName.length >= 3 && actionPlayerNorm.startsWith(firstInitial) && actionPlayerNorm.endsWith(lastName)) {
              return true;
            }
          }
          const descNorm = normalizePlain(descRaw);
          if (descNorm.startsWith(normTargetName) || descNorm.startsWith(initialLast)) {
            return true;
          }
          return false;
        });
        if (playerFouls.length === 0) continue;
        const exactSixth =
          playerFouls.find((a) => Number(a?.foulPersonalTotal) === 6 || /\b(?:P6|6\s*PF)\b/i.test(String(a?.description || ""))) ||
          (playerFouls.length >= 6 ? playerFouls[5] : playerFouls[playerFouls.length - 1]);
        const pNum = Number(exactSixth?.period) || 4;
        const periodLabel = formatPbpPeriodLabel(pNum);
        const clockRemaining = parsePbpClockRemaining(exactSixth?.clock, pNum);
        const key = pid || target.name;
        if (key && clockRemaining) {
          out.set(key, { periodLabel, clockRemaining, periodNum: pNum });
        }
      }
    } catch {
    }
    return out;
  }
  async function fetchPlayByPlayHighlights(eventId, awayAbbr, homeAbbr, winnerAbbr, seasonLabel, forceRefresh = false, gameDate = "") {
    const emptyRes = { keyRun: null, breakpoint: null, clutchPlays: [], playerHotSpurts: [], heroicClinchers: [], formattedDossierBlock: "" };
    if (!eventId) return emptyRes;
    let actions = [];
    const ttl = seasonLabel === "2026-27" ? 15 * 60 * 1000 : 180 * 60 * 1000;
    if (/^00\d{8}$/.test(eventId)) {
      try {
        const pbp = await deps.cachedFetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${eventId}.json`, ttl, NBA_LIVE_HEADERS, 7500, forceRefresh);
        if (Array.isArray(pbp?.game?.actions)) {
          actions = pbp.game.actions;
        }
      } catch {
      }
    }
    if (actions.length === 0) {
      try {
        const espnEventId = !/^00\d{8}$/.test(eventId)
          ? eventId
          : await resolveEspnEventIdForGame(gameDate, awayAbbr, homeAbbr, forceRefresh);
        const espnSummary = espnEventId
          ? await deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${espnEventId}`, ttl, {}, 7500, forceRefresh)
          : null;
        const espnPlays = Array.isArray(espnSummary?.plays) ? espnSummary.plays : [];
        if (espnPlays.length > 0) {
          actions = espnPlays.map((p) => {
            const rawTextLow = String(p?.text || "").toLowerCase();
            const isMiss = rawTextLow.includes("misses") || rawTextLow.includes("falla");
            const isScoring = Boolean(p?.scoringPlay);
            return {
              period: Number(p?.period?.number) || 1,
              clock: p?.clock?.displayValue || "00:00",
              teamTricode: normalizeEspnTeamAbbr(p?.team?.abbreviation || ""),
              playerNameI: p?.athlete?.displayName || String(p?.text || "").split(" ")[0] || "",
              description: String(p?.text || "").trim(),
              scoreHome: String(p?.homeScore ?? 0),
              scoreAway: String(p?.awayScore ?? 0),
              actionType: p?.type?.text?.toLowerCase() || (isScoring ? "made" : "play"),
              pointsTotal: isScoring ? (p?.scoreValue || 2) : 0,
              subType: p?.type?.text || "",
              shotResult: isScoring ? "made" : isMiss ? "missed" : "",
            };
          });
        }
      } catch {
      }
    }
    if (actions.length === 0) return emptyRes;

    const clockToSec = (clockStr) => {
      const parts = String(clockStr || "00:00").split(":");
      const m = Number(parts[0]) || 0;
      const s = Number(parts[1]) || 0;
      return m * 60 + s;
    };

    // Index all tactical timeouts called during the game
    const timeoutEvents = [];
    for (const a of actions) {
      const actType = String(a?.actionType || "").toLowerCase();
      const subType = String(a?.subType || "").toLowerCase();
      const desc = String(a?.description || "").toLowerCase();
      const isTimeout = actType.includes("timeout") || subType.includes("timeout") || desc.includes("timeout") || desc.includes("tiempo muerto");
      if (!isTimeout) continue;
      const pNum = Number(a?.period) || 1;
      const periodLabel = formatPbpPeriodLabel(pNum);
      const clock = parsePbpClockRemaining(a?.clock, pNum) || "0:00";
      const clockSec = clockToSec(clock);
      let teamAbbr = String(a?.teamTricode || "").toUpperCase();
      if (!teamAbbr || (teamAbbr !== awayAbbr && teamAbbr !== homeAbbr)) {
        if (desc.includes(awayAbbr.toLowerCase())) teamAbbr = awayAbbr;
        else if (desc.includes(homeAbbr.toLowerCase())) teamAbbr = homeAbbr;
      }
      timeoutEvents.push({
        period: pNum,
        periodLabel,
        clock,
        clockSec,
        teamAbbr,
        description: String(a?.description || "").trim(),
      });
    }

    const scoringEvents = [];
    let currentAway = 0;
    let currentHome = 0;

    for (const a of actions) {
      const pNum = Number(a?.period) || 1;
      const periodLabel = formatPbpPeriodLabel(pNum);
      const clockRemaining = parsePbpClockRemaining(a?.clock, pNum) || "0:00";
      const teamAbbr = String(a?.teamTricode || "").toUpperCase();
      const desc = String(a?.description || "").trim();
      const playerName = String(a?.playerNameI || a?.playerName || "").trim();
      const parsedAway = Number(a?.scoreAway);
      const parsedHome = Number(a?.scoreHome);
      let ptsAdded = 0;
      if (Number.isFinite(parsedAway) && Number.isFinite(parsedHome) && (parsedAway > currentAway || parsedHome > currentHome)) {
        ptsAdded = (parsedAway - currentAway) + (parsedHome - currentHome);
        currentAway = Math.max(currentAway, parsedAway);
        currentHome = Math.max(currentHome, parsedHome);
      } else {
        const actType = String(a?.actionType || "").toLowerCase();
        const shotRes = String(a?.shotResult || "").toLowerCase();
        if (actType === "made" || shotRes === "made" || Number(a?.pointsTotal) > 0) {
          ptsAdded = Number(a?.pointsTotal) || 2;
          if (teamAbbr === awayAbbr) currentAway += ptsAdded;
          else if (teamAbbr === homeAbbr) currentHome += ptsAdded;
        }
      }

      if (ptsAdded > 0 && desc) {
        scoringEvents.push({
          period: pNum,
          periodLabel,
          clock: clockRemaining,
          teamAbbr,
          description: desc,
          playerName,
          points: ptsAdded,
          awayScore: currentAway,
          homeScore: currentHome,
        });
      }
    }

    if (scoringEvents.length === 0) return emptyRes;

    let bestRun = { scoringTeamAbbr: "", defendingTeamAbbr: "", runPoints: 0, opponentPoints: 0, periodLabel: "", startClock: "", endClock: "", summary: "", timeoutCalled: null };
    for (const team of [awayAbbr, homeAbbr]) {
      const oppTeam = team === awayAbbr ? homeAbbr : awayAbbr;
      let runPts = 0;
      let oppPts = 0;
      let startEv = scoringEvents[0];
      let endEv = scoringEvents[0];
      for (const ev of scoringEvents) {
        if (ev.teamAbbr === team) {
          if (runPts === 0) startEv = ev;
          runPts += ev.points;
          endEv = ev;
        } else if (ev.teamAbbr === oppTeam) {
          if (runPts > bestRun.runPoints && runPts >= 7) {
            bestRun = {
              scoringTeamAbbr: team,
              defendingTeamAbbr: oppTeam,
              runPoints: runPts,
              opponentPoints: oppPts,
              periodLabel: startEv.periodLabel,
              startClock: startEv.clock,
              endClock: endEv.clock,
              summary: `Parcial de ${runPts}-${oppPts} para ${team} en el ${startEv.periodLabel} (reloj ${startEv.clock} a ${endEv.clock})`,
              timeoutCalled: null,
            };
          }
          oppPts += ev.points;
          if (oppPts > 4) {
            runPts = 0;
            oppPts = 0;
          }
        }
      }
      if (runPts > bestRun.runPoints && runPts >= 7) {
        bestRun = {
          scoringTeamAbbr: team,
          defendingTeamAbbr: oppTeam,
          runPoints: runPts,
          opponentPoints: oppPts,
          periodLabel: startEv.periodLabel,
          startClock: startEv.clock,
          endClock: endEv.clock,
          summary: `Parcial de ${runPts}-${oppPts} para ${team} en el ${startEv.periodLabel} (reloj ${startEv.clock} a ${endEv.clock})`,
          timeoutCalled: null,
        };
      }
    }

    // Check if defending coach called a timeout during or immediately after the key run
    if (bestRun.runPoints >= 7) {
      const runStartSec = clockToSec(bestRun.startClock);
      const runEndSec = clockToSec(bestRun.endClock);
      const provokedTimeout = timeoutEvents.find((t) =>
        t.periodLabel === bestRun.periodLabel &&
        (t.teamAbbr === bestRun.defendingTeamAbbr || (!t.teamAbbr && t.clockSec <= runStartSec && t.clockSec >= runEndSec - 35)) &&
        t.clockSec <= runStartSec &&
        t.clockSec >= (runEndSec - 40)
      );
      if (provokedTimeout) {
        bestRun.timeoutCalled = {
          teamAbbr: bestRun.defendingTeamAbbr,
          periodLabel: provokedTimeout.periodLabel,
          clock: provokedTimeout.clock,
        };
        bestRun.summary = `Parcial de ${bestRun.runPoints}-${bestRun.opponentPoints} para ${bestRun.scoringTeamAbbr} en el ${bestRun.periodLabel} (reloj ${bestRun.startClock} a ${bestRun.endClock}) que obligó a parar el partido con tiempo muerto de ${bestRun.defendingTeamAbbr} (reloj ${provokedTimeout.clock})`;
      }
    }

    let lastLeadChange = null;
    const isWinningTeamHome = winnerAbbr === homeAbbr;
    for (let i = 0; i < scoringEvents.length; i++) {
      const ev = scoringEvents[i];
      const prevAway = i > 0 ? scoringEvents[i - 1].awayScore : 0;
      const prevHome = i > 0 ? scoringEvents[i - 1].homeScore : 0;
      const wasWinnerAhead = isWinningTeamHome ? prevHome > prevAway : prevAway > prevHome;
      const isWinnerAhead = isWinningTeamHome ? ev.homeScore > ev.awayScore : ev.awayScore > ev.homeScore;
      if (!wasWinnerAhead && isWinnerAhead) {
        let stayedAhead = true;
        for (let j = i + 1; j < scoringEvents.length; j++) {
          const futureEv = scoringEvents[j];
          const futureWinnerAhead = isWinningTeamHome ? futureEv.homeScore > futureEv.awayScore : futureEv.awayScore > futureEv.homeScore;
          if (!futureWinnerAhead) {
            stayedAhead = false;
            break;
          }
        }
        if (stayedAhead) {
          lastLeadChange = {
            winningTeamAbbr: winnerAbbr,
            periodLabel: ev.periodLabel,
            clock: ev.clock,
            playerScoreName: ev.playerName || ev.description,
            awayScore: ev.awayScore,
            homeScore: ev.homeScore,
            summary: `Canasta decisiva (${ev.playerName || ev.description}) a falta de ${ev.clock} del ${ev.periodLabel} (${ev.awayScore}-${ev.homeScore}) que dio a ${winnerAbbr} el liderazgo definitivo`,
          };
          break;
        }
      }
    }

    // Clutch = Last 5 minutes (300s) of 4Q or Overtime with margin <= 5
    const clutchPlays = [];
    for (const ev of scoringEvents) {
      if (ev.period >= 4) {
        const secsRemaining = clockToSec(ev.clock);
        const margin = Math.abs(ev.awayScore - ev.homeScore);
        if (secsRemaining <= 300 && margin <= 5) {
          clutchPlays.push({
            periodLabel: ev.periodLabel,
            clock: ev.clock,
            teamAbbr: ev.teamAbbr,
            description: ev.description,
            scoreMargin: margin,
          });
          if (clutchPlays.length >= 6) break;
        }
      }
    }

    // Individual consecutive player hot spurts
    const playerHotSpurts = [];
    let currentStreakPlayer = "";
    let currentStreak3PCount = 0;
    let currentStreakPts = 0;
    for (const ev of scoringEvents) {
      const is3P = /\b3pt\b|\btriple\b|\b3-pt\b/i.test(ev.description) || ev.points === 3;
      if (ev.playerName && ev.playerName === currentStreakPlayer) {
        if (is3P) currentStreak3PCount++;
        currentStreakPts += ev.points;
        if (currentStreak3PCount >= 3 || currentStreakPts >= 8) {
          playerHotSpurts.push({
            playerName: ev.playerName,
            teamAbbr: ev.teamAbbr,
            periodLabel: ev.periodLabel,
            clock: ev.clock,
            count3P: currentStreak3PCount,
            points: currentStreakPts,
            summary: currentStreak3PCount >= 3
              ? `${ev.playerName} (${ev.teamAbbr}) encadenó ${currentStreak3PCount} triples consecutivos en el ${ev.periodLabel} (reloj ${ev.clock})`
              : `${ev.playerName} (${ev.teamAbbr}) firmó una racha personal de ${currentStreakPts} puntos seguidos en el ${ev.periodLabel} (reloj ${ev.clock})`,
          });
          currentStreakPlayer = "";
          currentStreak3PCount = 0;
          currentStreakPts = 0;
        }
      } else {
        currentStreakPlayer = ev.playerName || "";
        currentStreak3PCount = is3P ? 1 : 0;
        currentStreakPts = ev.points;
      }
    }

    // Early foul trouble (3rd in 1Q, 4th in 2Q) & 6-foul ejections
    const earlyFoulTroubles = [];
    const foulOuts = [];
    const playerFoulMap = new Map();
    for (const a of actions) {
      const actType = String(a?.actionType || "").toLowerCase();
      const desc = String(a?.description || "").toLowerCase();
      const isFoul = actType === "foul" || desc.includes("foul") || desc.includes("falta");
      if (!isFoul) continue;
      const subType = String(a?.subType || "").toLowerCase();
      if (subType.includes("technical") || subType.includes("defense 3 second") || desc.includes("technical foul") || desc.includes("defensive 3 second")) continue;

      const pid = String(a?.personId || a?.playerNameI || a?.playerName || "").trim();
      if (!pid) continue;
      const pName = String(a?.playerNameI || a?.playerName || pid).trim();
      const teamAbbr = String(a?.teamTricode || "").toUpperCase();
      const pNum = Number(a?.period) || 1;
      const periodLabel = formatPbpPeriodLabel(pNum);
      const clock = parsePbpClockRemaining(a?.clock, pNum) || "0:00";

      const entry = playerFoulMap.get(pid) || { fouls: 0, logged1Q: false, logged2Q: false, loggedOut: false };
      const explicitTotal = Number(a?.foulPersonalTotal);
      entry.fouls = Number.isFinite(explicitTotal) && explicitTotal > 0 ? explicitTotal : entry.fouls + 1;
      playerFoulMap.set(pid, entry);

      if ((entry.fouls >= 6 || /\b(?:P6|6\s*PF)\b/i.test(String(a?.description || ""))) && !entry.loggedOut) {
        entry.loggedOut = true;
        foulOuts.push({
          playerId: String(a?.personId || ""),
          playerName: pName,
          teamAbbr,
          periodLabel,
          clock,
          summary: `${pName} (${teamAbbr}) fue expulsado por seis faltas en el ${periodLabel} faltando ${clock}`,
        });
      } else if (pNum === 1 && entry.fouls >= 3 && !entry.logged1Q) {
        entry.logged1Q = true;
        earlyFoulTroubles.push({
          playerName: pName,
          teamAbbr,
          periodLabel: "1Q",
          clock,
          foulCount: entry.fouls,
          summary: `${pName} (${teamAbbr}) cometió su 3ª falta en el 1er cuarto (reloj ${clock}) y tuvo que ir al banquillo tempranamente por acumulación de faltas`,
        });
      } else if (pNum === 2 && entry.fouls >= 4 && !entry.logged2Q) {
        entry.logged2Q = true;
        earlyFoulTroubles.push({
          playerName: pName,
          teamAbbr,
          periodLabel: "2Q",
          clock,
          foulCount: entry.fouls,
          summary: `${pName} (${teamAbbr}) cargó con su 4ª falta en el 2º cuarto (reloj ${clock}) condicionando su presencia antes del descanso`,
        });
      }
    }

    // Clutch Execution in the final 2 minutes (120s) of 4Q or Overtime when margin <= 5 pts
    let isClutchGame = false;
    for (const ev of scoringEvents) {
      if (ev.period >= 4) {
        const sec = clockToSec(ev.clock);
        const margin = Math.abs(ev.awayScore - ev.homeScore);
        if (sec <= 120 && margin <= 5) {
          isClutchGame = true;
          break;
        }
      }
    }
    if (!isClutchGame && scoringEvents.length > 0) {
      const lastEv = scoringEvents[scoringEvents.length - 1];
      if (Math.abs(lastEv.awayScore - lastEv.homeScore) <= 5) {
        isClutchGame = true;
      }
    }

    let clutchExecution = null;
    if (isClutchGame) {
      const clutchStats = {
        [awayAbbr]: { teamAbbr: awayAbbr, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, points: 0, turnovers: 0, playerShots: new Map() },
        [homeAbbr]: { teamAbbr: homeAbbr, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, points: 0, turnovers: 0, playerShots: new Map() },
      };

      for (const a of actions) {
        const pNum = Number(a?.period) || 1;
        if (pNum < 4) continue;
        const clock = parsePbpClockRemaining(a?.clock, pNum) || "00:00";
        const sec = clockToSec(clock);
        if (sec > 120) continue;

        const actType = String(a?.actionType || "").toLowerCase();
        const subType = String(a?.subType || "").toLowerCase();
        const shotResult = String(a?.shotResult || "").toLowerCase();
        const desc = String(a?.description || "").trim();
        const descLow = desc.toLowerCase();
        let teamAbbr = String(a?.teamTricode || "").toUpperCase();
        if (!teamAbbr || (teamAbbr !== awayAbbr && teamAbbr !== homeAbbr)) {
          if (descLow.includes(awayAbbr.toLowerCase())) teamAbbr = awayAbbr;
          else if (descLow.includes(homeAbbr.toLowerCase())) teamAbbr = homeAbbr;
        }
        if (teamAbbr !== awayAbbr && teamAbbr !== homeAbbr) continue;

        const teamObj = clutchStats[teamAbbr];
        const rawPlayer = String(a?.playerNameI || a?.playerName || "").trim();
        const pName = rawPlayer || (desc.split(" ")[0] || "Equipo");
        const pEntry = teamObj.playerShots.get(pName) || { name: pName, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, points: 0, turnovers: 0 };

        const is3P = actType === "3pt" || subType.includes("3pt") || descLow.includes("3pt") || descLow.includes("triple") || descLow.includes("3-pt");
        const isFT = actType.includes("freethrow") || descLow.includes("free throw") || descLow.includes("tiro libre");
        const isTurnover = actType.includes("turnover") || descLow.includes("turnover") || descLow.includes("pérdida") || descLow.includes("bad pass") || descLow.includes("lost ball") || descLow.includes("traveling") || descLow.includes("offensive foul");
        const isMade = shotResult === "made" || descLow.includes("makes") || actType === "made" || Number(a?.pointsTotal) > 0;
        const isMissed = shotResult === "missed" || descLow.includes("misses") || descLow.includes("falla");

        if (isTurnover) {
          teamObj.turnovers++;
          pEntry.turnovers++;
        } else if (isFT) {
          teamObj.fta++;
          pEntry.fta++;
          if (isMade) {
            teamObj.ftm++;
            teamObj.points += 1;
            pEntry.ftm++;
            pEntry.points += 1;
          }
        } else if (isMade || isMissed || actType === "2pt" || actType === "3pt" || actType === "shot") {
          teamObj.fga++;
          pEntry.fga++;
          if (is3P) {
            teamObj.fg3a++;
            pEntry.fg3a++;
          }
          if (isMade) {
            const pts = is3P ? 3 : 2;
            teamObj.fgm++;
            teamObj.points += pts;
            pEntry.fgm++;
            pEntry.points += pts;
            if (is3P) {
              teamObj.fg3m++;
              pEntry.fg3m++;
            }
          }
        }
        teamObj.playerShots.set(pName, pEntry);
      }

      const totalClutchFga = clutchStats[awayAbbr].fga + clutchStats[homeAbbr].fga;
      const totalClutchTov = clutchStats[awayAbbr].turnovers + clutchStats[homeAbbr].turnovers;

      if (totalClutchFga > 0 || totalClutchTov > 0) {
        const loserAbbr = winnerAbbr === awayAbbr ? homeAbbr : awayAbbr;
        const winnerStats = clutchStats[winnerAbbr] || { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, points: 0, turnovers: 0, playerShots: new Map() };
        const loserStats = clutchStats[loserAbbr] || { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, points: 0, turnovers: 0, playerShots: new Map() };

        const winnerPlayers = Array.from(winnerStats.playerShots.values())
          .filter((p) => p.fga > 0 || p.points > 0 || p.turnovers > 0)
          .sort((a, b) => (b.points * 2 + b.fgm) - (a.points * 2 + a.fgm));

        const loserPlayers = Array.from(loserStats.playerShots.values())
          .filter((p) => p.fga > 0 || p.points > 0 || p.turnovers > 0)
          .sort((a, b) => (b.points * 2 + b.fgm + b.turnovers) - (a.points * 2 + a.fgm + a.turnovers));

        const winnerDetail = winnerPlayers.slice(0, 2).map((p) =>
          `${p.name} (${p.fgm}/${p.fga} TC${p.fg3m > 0 ? `, ${p.fg3m} T3` : ""}${p.points > 0 ? `, ${p.points} pts` : ""})`
        ).join(" y ");

        const loserDetail = loserPlayers.slice(0, 2).map((p) =>
          `${p.name} (${p.fgm}/${p.fga} TC${p.turnovers > 0 ? `, ${p.turnovers} PER` : ""}${p.points > 0 ? `, ${p.points} pts` : ""})`
        ).join(" y ");

        const finalTimeout = timeoutEvents.find((t) => t.period >= 4 && t.clockSec <= 35);

        const winnerLine = `${winnerAbbr} ejecutó con ${winnerStats.fgm}/${winnerStats.fga} en tiros de campo (${winnerStats.points} pts${winnerStats.fg3m > 0 ? `, ${winnerStats.fg3m} triple(s)` : ""}) y ${winnerStats.turnovers === 0 ? "cero pérdidas" : `${winnerStats.turnovers} pérdida(s)`}${winnerDetail ? ` liderado por ${winnerDetail}` : ""}`;
        const loserLine = `${loserAbbr} firmó ${loserStats.fgm}/${loserStats.fga} TC (${loserStats.points} pts) y ${loserStats.turnovers > 0 ? `${loserStats.turnovers} pérdida(s) crítica(s)` : "cero pérdidas"}${loserDetail ? ` (${loserDetail})` : ""}`;

        let summaryNarrative = `En los dos minutos finales con el partido en el alambre (margen ≤5 pts), ${winnerLine}, mientras que ${loserLine}`;
        if (finalTimeout) {
          summaryNarrative += `, tras un tiempo muerto solicitado por ${finalTimeout.teamAbbr} a falta de ${finalTimeout.clock} para diseñar la posesión definitiva`;
        }

        clutchExecution = {
          isClutchGame: true,
          summaryNarrative,
          breakdownLine: `${winnerAbbr}: ${winnerStats.fgm}/${winnerStats.fga} TC, ${winnerStats.points} PTS, ${winnerStats.turnovers} PER (${winnerDetail || "sin tiros"}) | ${loserAbbr}: ${loserStats.fgm}/${loserStats.fga} TC, ${loserStats.points} PTS, ${loserStats.turnovers} PER (${loserDetail || "sin tiros"})`,
          winner: { teamAbbr: winnerAbbr, ...winnerStats },
          loser: { teamAbbr: loserAbbr, ...loserStats },
          finalTimeout: finalTimeout ? { teamAbbr: finalTimeout.teamAbbr, clock: finalTimeout.clock } : null,
        };
      }
    }

    const liveHeroicClinchers = /^00\d{8}$/.test(String(eventId || "")) && actions.length > 0
      ? analyzeGamePlayByPlayHeroicShots({ game: { actions } }, {
          gameId: String(eventId),
          date: gameDate || "",
          seasonLabel: seasonLabel || "2026-27",
          homeAbbr,
          awayAbbr,
          homeId: "",
          awayId: "",
        }).filter((s) => s.shotType === "buzzer_beater" || s.shotType === "game_winner")
      : [];

    const keyRun = bestRun.runPoints >= 7 ? bestRun : null;
    const lines = [];
    if (keyRun) lines.push(`- PARCIAL MÁXIMO INDEXADO E INTERVENCIÓN TÁCTICA: ${keyRun.summary}`);
    if (lastLeadChange) lines.push(`- PUNTO DE QUIEBRE Y VENTAJA DEFINITIVA: ${lastLeadChange.summary}`);
    for (const hc of liveHeroicClinchers) {
      const tag = hc.shotType === "buzzer_beater" ? "BUZZER BEATER (BB · 0.0s)" : `GAME WINNER (GW · ${hc.clock} en ${hc.periodLabel})`;
      const actionEs = translateHeroicShotActionCompactEs(hc.description);
      lines.push(`- CANASTA GANADORA DECISIVA (${tag}): ${hc.playerName} (${hc.teamAbbr}) firmó ${actionEs} para cerrar el triunfo ${hc.finalScoreTeam}-${hc.finalScoreOpp}`);
    }
    if (clutchExecution && clutchExecution.isClutchGame && clutchExecution.summaryNarrative) {
      lines.push(`- EJECUCIÓN CLUTCH EN LOS 2 MINUTOS FINALES (MARGEN ≤5 PTS): ${clutchExecution.summaryNarrative}`);
      if (clutchExecution.breakdownLine) lines.push(`  * Reparto de tiros y pérdidas: ${clutchExecution.breakdownLine}`);
    }
    if (playerHotSpurts.length > 0) lines.push(`- RÁFAGAS Y TRIPLES CONSECUTIVOS DE JUGADOR: ${playerHotSpurts.map((s) => s.summary).join("; ")}`);
    if (earlyFoulTroubles.length > 0) lines.push(`- PROBLEMAS DE FALTAS TEMPRANAS EN TITULARES/ROTACIÓN (1Q/2Q): ${earlyFoulTroubles.map((e) => e.summary).join("; ")}`);
    if (foulOuts.length > 0) lines.push(`- EXPULSADOS POR 6 FALTAS (PLAY-BY-PLAY): ${foulOuts.map((f) => f.summary).join("; ")}`);
    if (clutchPlays.length > 0 && (!clutchExecution || !clutchExecution.isClutchGame)) {
      lines.push(`- ACCIONES CLUTCH (ÚLTIMOS 5 MIN ≤5 PTS): ${clutchPlays.map((c) => `[${c.periodLabel} ${c.clock}] ${c.teamAbbr}: ${c.description} (margen ${c.scoreMargin} pts)`).join("; ")}`);
    }

    // Mine closing-5 lineups (last 4 min of final period) and direct defensive duels (blocks & steals) from PBP
    const maxPeriodNum = actions.reduce((acc, a) => Math.max(acc, Number(a?.period) || 1), 4);
    const closingPlayersMap: Record<string, string[]> = { [awayAbbr]: [], [homeAbbr]: [] };
    const pushClosingPlayer = (teamAbbr: string, rawName: string) => {
      if (!teamAbbr || !closingPlayersMap[teamAbbr]) return;
      const cleanName = String(rawName || "").trim();
      if (!cleanName || cleanName.length < 3 || /^team\b/i.test(cleanName)) return;
      const arr = closingPlayersMap[teamAbbr];
      if (!arr.some((n) => n.toLowerCase() === cleanName.toLowerCase()) && arr.length < 5) {
        arr.push(cleanName);
      }
    };
    const duelCounts = new Map<string, { defender: string; defTeam: string; victim: string; vicTeam: string; type: "tapón" | "robo"; count: number; lastPeriod: string }>();
    const addDuel = (defender: string, defTeam: string, victim: string, vicTeam: string, type: "tapón" | "robo", periodLabel: string) => {
      const defClean = String(defender || "").trim();
      const vicClean = String(victim || "").trim();
      if (!defClean || !vicClean || defClean.length < 3 || vicClean.length < 3) return;
      if (defClean.toLowerCase() === vicClean.toLowerCase()) return;
      const key = `${type}|${defTeam}|${defClean.toLowerCase()}|${vicClean.toLowerCase()}`;
      const existing = duelCounts.get(key);
      if (existing) {
        existing.count += 1;
        existing.lastPeriod = periodLabel;
      } else {
        duelCounts.set(key, { defender: defClean, defTeam, victim: vicClean, vicTeam, type, count: 1, lastPeriod: periodLabel });
      }
    };

    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const pNum = Number(a?.period) || 1;
      const periodLabel = formatPbpPeriodLabel(pNum);
      const clockStr = parsePbpClockRemaining(a?.clock, pNum) || "0:00";
      const cSec = clockToSec(clockStr);
      const tAbbr = String(a?.teamTricode || "").toUpperCase();
      const actType = String(a?.actionType || "").toLowerCase();
      const desc = String(a?.description || "").trim();
      const pName = String(a?.playerNameI || a?.playerName || "").trim();

      if (pNum === maxPeriodNum && cSec <= 240 && tAbbr && !actType.includes("timeout") && !actType.includes("substitution")) {
        pushClosingPlayer(tAbbr, pName);
      }

      // 1) NBA CDN paired block (actionType === 'block' adjacent to a missed shot at same period+clock)
      if (actType === "block" && pName && (tAbbr === awayAbbr || tAbbr === homeAbbr)) {
        const oppAbbr = tAbbr === awayAbbr ? homeAbbr : awayAbbr;
        const neighbor = [actions[i - 1], actions[i + 1]].find((n) => {
          if (!n) return false;
          const nTeam = String(n?.teamTricode || "").toUpperCase();
          const nPeriod = Number(n?.period) || 0;
          const nClock = parsePbpClockRemaining(n?.clock, nPeriod) || "";
          return nTeam === oppAbbr && nPeriod === pNum && nClock === clockStr && (String(n?.shotResult || "").toLowerCase() === "missed" || /miss/i.test(String(n?.description || "")));
        });
        const victim = String(neighbor?.playerNameI || neighbor?.playerName || "").trim();
        if (victim) addDuel(pName, tAbbr, victim, oppAbbr, "tapón", periodLabel);
      } else if (/\bblocks\b/i.test(desc)) {
        // ESPN PBP format: "Victor Wembanyama blocks LeBron James's 2-foot layup"
        const m = /^([A-Z][A-Za-z.' -]{2,32})\s+blocks\s+([A-Z][A-Za-z.' -]{2,32}?)(?:'s|’s|\s+shot|\s+layup|\s+dunk|\s+jumper)/i.exec(desc);
        if (m && (tAbbr === awayAbbr || tAbbr === homeAbbr)) {
          const oppAbbr = tAbbr === awayAbbr ? homeAbbr : awayAbbr;
          addDuel(m[1], tAbbr, m[2], oppAbbr, "tapón", periodLabel);
        }
      }

      // 2) NBA CDN paired steal (actionType === 'steal' adjacent to opponent turnover at same period+clock)
      if (actType === "steal" && pName && (tAbbr === awayAbbr || tAbbr === homeAbbr)) {
        const oppAbbr = tAbbr === awayAbbr ? homeAbbr : awayAbbr;
        const neighbor = [actions[i - 1], actions[i + 1]].find((n) => {
          if (!n) return false;
          const nTeam = String(n?.teamTricode || "").toUpperCase();
          const nPeriod = Number(n?.period) || 0;
          const nClock = parsePbpClockRemaining(n?.clock, nPeriod) || "";
          return nTeam === oppAbbr && nPeriod === pNum && nClock === clockStr && String(n?.actionType || "").toLowerCase().includes("turnover");
        });
        const victim = String(neighbor?.playerNameI || neighbor?.playerName || "").trim();
        if (victim) addDuel(pName, tAbbr, victim, oppAbbr, "robo", periodLabel);
      } else if (/\bsteals\b/i.test(desc)) {
        // ESPN PBP format: "Jamal Murray bad pass (Alex Caruso steals)"
        const m = /^([A-Z][A-Za-z.' -]{2,32})\s+(?:bad pass|lost ball|turnover).*?\(([A-Z][A-Za-z.' -]{2,32})\s+steals\)/i.exec(desc);
        if (m && (tAbbr === awayAbbr || tAbbr === homeAbbr)) {
          const defTeam = tAbbr === awayAbbr ? homeAbbr : awayAbbr;
          addDuel(m[2], defTeam, m[1], tAbbr, "robo", periodLabel);
        }
      }
    }

    const defensiveDuels = Array.from(duelCounts.values())
      .sort((a, b) => b.count - a.count || (a.type === "tapón" ? -1 : 1))
      .slice(0, 6)
      .map((d) =>
        d.count > 1
          ? `${d.defender} (${d.defTeam}) — ${d.count} ${d.type === "tapón" ? "tapones" : "robos"} directos ante ${d.victim} (${d.vicTeam})`
          : `${d.defender} (${d.defTeam}) — ${d.type} directo ante ${d.victim} (${d.vicTeam}) en ${d.lastPeriod}`
      );

    return {
      keyRun,
      breakpoint: lastLeadChange,
      clutchPlays,
      clutchExecution,
      playerHotSpurts,
      earlyFoulTroubles,
      foulOuts,
      heroicClinchers: liveHeroicClinchers,
      closingLineupAway: closingPlayersMap[awayAbbr],
      closingLineupHome: closingPlayersMap[homeAbbr],
      defensiveDuels,
      formattedDossierBlock: lines.join("\n"),
    };
  }
  function formatSpanishScheduleDateTime(dateIso, dateTimeUtc) {
    const monthsEs = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const weekdaysEs = ["Dom", "Lun", "Mar", "Mi\xE9", "Jue", "Vie", "S\xE1b"];
    if (dateTimeUtc && dateTimeUtc.includes("T")) {
      const dt = new Date(dateTimeUtc);
      if (!Number.isNaN(dt.getTime())) {
        const utcHours = dt.getUTCHours();
        const utcMinutes = dt.getUTCMinutes();
        const hasRealTipoff = !(utcHours === 0 && utcMinutes === 0);
        const esDateFmt = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: hasRealTipoff ? "Europe/Madrid" : "UTC" }).format(dt);
        const cleanDate = esDateFmt.replace(/\./g, "");
        if (hasRealTipoff) {
          const esTime = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Madrid" }).format(dt);
          const etTime = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).format(dt);
          return { dateFormatted: cleanDate.charAt(0).toUpperCase() + cleanDate.slice(1), timeFormatted: `${esTime}h ESP (${etTime} ET)` };
        }
      }
    }
    const [y, m, d] = (dateIso || "").slice(0, 10).split("-").map(Number);
    if (y && m && d) {
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const wd = weekdaysEs[dt.getUTCDay()] || "";
      const mo = monthsEs[dt.getUTCMonth()] || "";
      return { dateFormatted: `${wd} ${d} ${mo} ${y}`, timeFormatted: "Horario NBA oficial" };
    }
    return { dateFormatted: dateIso || "Por definir", timeFormatted: "Por confirmar" };
  }
  function computeNextGameFatigue(currentDateIso, nextDateIso) {
    if (!nextDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(currentDateIso) || !/^\d{4}-\d{2}-\d{2}$/.test(nextDateIso)) {
      return { restDays: null, isBackToBackNext: false, fatigueShort: "\u2014", fatigueDetail: "Sin fecha programada", fatigueTone: "slate" };
    }
    const [cy, cm, cd] = currentDateIso.split("-").map(Number);
    const [ny, nm, nd] = nextDateIso.split("-").map(Number);
    const dayDiff = Math.round((Date.UTC(ny, nm - 1, nd) - Date.UTC(cy, cm - 1, cd)) / 864e5);
    if (dayDiff <= 0) {
      return { restDays: null, isBackToBackNext: false, fatigueShort: "\u2014", fatigueDetail: "Por confirmar", fatigueTone: "slate" };
    }
    const restDays = dayDiff - 1;
    if (restDays === 0) {
      return { restDays: 0, isBackToBackNext: true, fatigueShort: "B2B \xB7 0 d\xEDas", fatigueDetail: "Back-to-Back (0 d\xEDas de descanso antes del pr\xF3ximo duelo)", fatigueTone: "rose" };
    }
    if (restDays === 1) {
      return { restDays: 1, isBackToBackNext: false, fatigueShort: "1 d\xEDa", fatigueDetail: "1 d\xEDa de descanso previo (ritmo est\xE1ndar)", fatigueTone: "slate" };
    }
    return { restDays, isBackToBackNext: false, fatigueShort: `${restDays} d\xEDas`, fatigueDetail: restDays >= 3 ? `${restDays} d\xEDas de descanso previo (plantilla descansada)` : `${restDays} d\xEDas de descanso previo`, fatigueTone: "emerald" };
  }
  async function resolveTeamNextGameInfo(params) {
    const { currentEventId, teamObj, recordAfter, fullTeams, gameDate, seasonLabel, scheduleGames, forceRefresh } = params;
    const abbr = teamObj.abbreviation;
    const findTeamIdByAbbr = __name((targetAbbr) => fullTeams.find((t) => t.abbreviation === targetAbbr)?.id, "findTeamIdByAbbr");
    const confPeers = fullTeams.filter((t) => t.conference === teamObj.conference).map((t) => {
      const logs = t.games.filter((g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate).sort((a, b) => b.date.localeCompare(a.date));
      const w = logs.filter((g) => g.result === "W").length;
      const l = logs.length - w;
      const gp = w + l;
      const pct = gp > 0 ? w / gp : 0;
      const diffSum = logs.reduce((s, g) => s + g.differential, 0);
      return { abbr: t.abbreviation, w, l, gp, pct, avgDiff: gp > 0 ? diffSum / gp : 0, logs };
    }).sort((a, b) => b.pct - a.pct || b.w - a.w || b.avgDiff - a.avgDiff);
    const peerIdx = confPeers.findIndex((p) => p.abbr === abbr);
    const conferenceRank = peerIdx >= 0 ? peerIdx + 1 : teamObj.playoffSeed || 1;
    const myLogs = peerIdx >= 0 ? confPeers[peerIdx].logs : teamObj.games.filter((g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate).sort((a, b) => b.date.localeCompare(a.date));
    let streakCode = teamObj.streakCode || "\u2014";
    if (myLogs.length > 0) {
      const firstRes = myLogs[0].result;
      let count = 0;
      for (const lg of myLogs) {
        if (lg.result === firstRes) count++;
        else break;
      }
      streakCode = `${firstRes}${count}`;
    }
    const futureTeamLogs = teamObj.games.filter((g) => g.seasonLabel === seasonLabel && g.eventId !== currentEventId && g.date.slice(0, 10) > gameDate).sort((a, b) => a.date.localeCompare(b.date));
    const nextFromSchedule = scheduleGames.find((sg) => sg.gameId !== currentEventId && sg.dateIso > gameDate && (sg.awayAbbr === abbr || sg.homeAbbr === abbr));
    if (futureTeamLogs.length > 0) {
      const nl = futureTeamLogs[0];
      const nlDate = nl.date.slice(0, 10);
      const matchedSched = scheduleGames.find((sg) => sg.gameId === nl.eventId || sg.dateIso === nlDate && (sg.awayAbbr === abbr || sg.homeAbbr === abbr));
      const hostAbbr = nl.isHome ? abbr : nl.opponentAbbr;
      const hostArena = NBA_TEAM_ARENAS[hostAbbr];
      const dtFmt = formatSpanishScheduleDateTime(nlDate, matchedSched?.dateTimeUtc);
      const fatigue = computeNextGameFatigue(gameDate, nlDate);
      return { hasScheduledGame: true, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: nl.opponentAbbr, opponentName: NBA_TEAMS_MAP[nl.opponentAbbr]?.name || nl.opponentName || nl.opponentAbbr, opponentTeamId: findTeamIdByAbbr(nl.opponentAbbr), isHome: nl.isHome, dateIso: nlDate, dateFormatted: dtFmt.dateFormatted, timeFormatted: dtFmt.timeFormatted, arenaName: matchedSched?.arenaName || hostArena?.arenaName || `Pabell\xF3n ${hostAbbr}`, arenaCity: matchedSched?.arenaCity || hostArena?.arenaCity || "", ...fatigue };
    }
    if (nextFromSchedule) {
      const isHome = nextFromSchedule.homeAbbr === abbr;
      const oppAbbr = isHome ? nextFromSchedule.awayAbbr : nextFromSchedule.homeAbbr;
      const dtFmt = formatSpanishScheduleDateTime(nextFromSchedule.dateIso, nextFromSchedule.dateTimeUtc);
      const fatigue = computeNextGameFatigue(gameDate, nextFromSchedule.dateIso);
      return { hasScheduledGame: true, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: oppAbbr, opponentName: NBA_TEAMS_MAP[oppAbbr]?.name || oppAbbr, opponentTeamId: findTeamIdByAbbr(oppAbbr), isHome, dateIso: nextFromSchedule.dateIso, dateFormatted: dtFmt.dateFormatted, timeFormatted: dtFmt.timeFormatted, arenaName: nextFromSchedule.arenaName, arenaCity: nextFromSchedule.arenaCity, ...fatigue };
    }
    const espnId = ESPN_TEAM_IDS[abbr];
    if (espnId && seasonLabel === "2026-27") {
      try {
        const espnSched = await deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnId}/schedule`, 2 * 60 * 60 * 1e3, {}, 5500, forceRefresh);
        const events = Array.isArray(espnSched?.events) ? espnSched.events : [];
        for (const ev of events) {
          const evUtc = String(ev?.date || "").trim();
          const evIso = evUtc.includes("T") ? utcToEasternDateIso(evUtc) || evUtc.slice(0, 10) : evUtc.slice(0, 10);
          if (!evIso || evIso <= gameDate) continue;
          const comp = ev?.competitions?.[0];
          const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const meComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") === abbr);
          const oppComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") !== abbr);
          if (!oppComp) continue;
          const oppAbbr = normalizeEspnTeamAbbr(oppComp?.team?.abbreviation || "NBA");
          const isHome = meComp?.homeAway === "home";
          const hostAbbr = isHome ? abbr : oppAbbr;
          const hostArena = NBA_TEAM_ARENAS[hostAbbr];
          const venueName = String(comp?.venue?.fullName || "").trim() || hostArena?.arenaName || `Pabell\xF3n ${hostAbbr}`;
          const venueCity = String(comp?.venue?.address?.city || "").trim() || hostArena?.arenaCity || "";
          const dtFmt = formatSpanishScheduleDateTime(evIso, evUtc);
          const fatigue = computeNextGameFatigue(gameDate, evIso);
          return { hasScheduledGame: true, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: oppAbbr, opponentName: NBA_TEAMS_MAP[oppAbbr]?.name || String(oppComp?.team?.displayName || oppAbbr), opponentTeamId: findTeamIdByAbbr(oppAbbr), isHome, dateIso: evIso, dateFormatted: dtFmt.dateFormatted, timeFormatted: dtFmt.timeFormatted, arenaName: venueName, arenaCity: venueCity, ...fatigue };
        }
      } catch {
      }
    }
    const emptyFatigue = computeNextGameFatigue(gameDate, void 0);
    return { hasScheduledGame: false, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: "", opponentName: "Calendario regular completado en este tramo", isHome: true, dateFormatted: "Sin pr\xF3ximo encuentro programado", timeFormatted: "\u2014", arenaName: NBA_TEAM_ARENAS[abbr]?.arenaName || "", arenaCity: NBA_TEAM_ARENAS[abbr]?.arenaCity || "", ...emptyFatigue };
  }
  async function computeGameOfficialReportData(eventId, forceRefresh = false, cacheKey = `game_official_report_v6:${eventId}`) {
    const [full, biosMap, scheduleGames] = await Promise.all([deps.getFullLeagueMemory(), deps.getPlayerBiosMap(forceRefresh), fetchLeagueScheduleGames(forceRefresh)]);
    let homeTeamObj;
    let homeLog;
    let awayTeamObj;
    let awayLog;
    const staticSched = STATIC_SCHEDULE_2027.find((s) => s.gameId === eventId) || scheduleGames.find((s) => s.gameId === eventId);
    for (const t of full.teams) {
      const g = t.games.find((x) => x.eventId === eventId);
      if (g) {
        const isHome = staticSched ? t.abbreviation === staticSched.homeAbbr : g.isHome;
        if (isHome) {
          homeTeamObj = t;
          homeLog = { ...g, isHome: true };
        } else {
          awayTeamObj = t;
          awayLog = { ...g, isHome: false };
        }
      }
    }
    if (!homeTeamObj || !homeLog || !awayTeamObj || !awayLog) {
      throw new Error(`Encuentro ${eventId} no encontrado en el registro oficial NBA.`);
    }
    const gameDate = homeLog.date.slice(0, 10);
    const seasonLabel = homeLog.seasonLabel;
    const homeAbbr = homeTeamObj.abbreviation;
    const awayAbbr = awayTeamObj.abbreviation;
    const playerById = /* @__PURE__ */ new Map();
    for (const p of full.allPlayers) {
      playerById.set(p.id, p);
    }
    const espnInjuriesMap = seasonLabel === "2026-27" ? await fetchEspnInjuriesByName(forceRefresh) : /* @__PURE__ */ new Map();
    let cdnGame = null;
    if (/^00\d{8}$/.test(eventId)) {
      const ttl = seasonLabel === "2026-27" ? 10 * 60 * 1e3 : 120 * 60 * 1e3;
      try {
        const bj = await deps.cachedFetchJson(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${eventId}.json`, ttl, NBA_LIVE_HEADERS, 9e3, forceRefresh);
        if (bj && bj.game) {
          cdnGame = bj.game;
        }
      } catch (err) {
        console.warn(`NBA CDN boxscore fallback for ${eventId}:`, err);
      }
    }

    const cdnAwayPeriods = Array.isArray(cdnGame?.awayTeam?.periods) ? cdnGame.awayTeam.periods : [];
    const cdnHomePeriods = Array.isArray(cdnGame?.homeTeam?.periods) ? cdnGame.homeTeam.periods : [];

    let espnEventData = null;
    if (cdnAwayPeriods.length === 0 || cdnHomePeriods.length === 0 || !cdnGame?.attendance || !cdnGame?.officials?.length) {
      try {
        const yyyymmdd = gameDate.replace(/-/g, "");
        const sbData = await deps.cachedFetchJson(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`,
          15 * 60 * 1000,
          {},
          6500,
          forceRefresh
        );
        const events = Array.isArray(sbData?.events) ? sbData.events : [];
        for (const ev of events) {
          const comp = ev?.competitions?.[0];
          const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const awayComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") === awayAbbr);
          const homeComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") === homeAbbr);
          if (awayComp && homeComp) {
            espnEventData = {
              evId: String(ev?.id || ""),
              awayLinescores: Array.isArray(awayComp.linescores) ? awayComp.linescores : [],
              homeLinescores: Array.isArray(homeComp.linescores) ? homeComp.linescores : [],
              attendance: Number(comp?.attendance) || 0,
              officials: Array.isArray(comp?.officials)
                ? comp.officials.map((o) => String(o?.fullName || o?.displayName || o?.name || "").trim()).filter(Boolean)
                : [],
              venueName: String(comp?.venue?.fullName || "").trim(),
              venueCity: String(comp?.venue?.address?.city || "").trim(),
            };
            break;
          }
        }
      } catch (err) {
        console.warn(`ESPN Scoreboard fallback for ${gameDate} ${awayAbbr}@${homeAbbr}:`, err);
      }
    }

    const fallbackArena = NBA_TEAM_ARENAS[homeAbbr] || { arenaName: `Pabellón de ${homeTeamObj.shortName}`, arenaCity: homeTeamObj.name };
    const arenaName = String(cdnGame?.arena?.arenaName || "").trim() || String(espnEventData?.venueName || "").trim() || fallbackArena.arenaName;
    const arenaCity = String(cdnGame?.arena?.arenaCity || "").trim() || String(espnEventData?.venueCity || "").trim() || fallbackArena.arenaCity;
    const rawAttendance = Number(cdnGame?.attendance) || Number(espnEventData?.attendance) || 0;
    const attendance = rawAttendance > 0 ? rawAttendance : null;
    const attendanceFormatted = attendance !== null ? `${formatThousandsEs(attendance)} espectadores` : "Aforo oficial NBA";
    const rawDuration = Number(cdnGame?.duration) || 0;
    const durationMinutes = rawDuration > 0 ? rawDuration : 135;
    const cdnOfficials = Array.isArray(cdnGame?.officials) ? cdnGame.officials.map((o) => String(o?.name || "").trim()).filter(Boolean) : [];
    const officials = cdnOfficials.length > 0 ? cdnOfficials : (espnEventData?.officials || []);

    const periods = [];
    if (cdnAwayPeriods.length > 0 && cdnHomePeriods.length > 0) {
      const maxLen = Math.max(cdnAwayPeriods.length, cdnHomePeriods.length);
      for (let i = 0; i < maxLen; i++) {
        const ap = cdnAwayPeriods[i];
        const hp = cdnHomePeriods[i];
        const pNum = Number(ap?.period || hp?.period || i + 1);
        const isOt = pNum > 4 || String(ap?.periodType || "").toUpperCase() === "OVERTIME";
        const otIdx = pNum - 4;
        periods.push({ period: pNum, label: isOt ? (maxLen > 5 ? `PR${otIdx}` : "PR") : `${pNum}Q`, isOvertime: isOt, awayScore: Number(ap?.score) || 0, homeScore: Number(hp?.score) || 0 });
      }
    } else if (espnEventData && espnEventData.awayLinescores.length > 0 && espnEventData.homeLinescores.length > 0) {
      const maxLen = Math.max(espnEventData.awayLinescores.length, espnEventData.homeLinescores.length);
      for (let i = 0; i < maxLen; i++) {
        const ap = espnEventData.awayLinescores[i];
        const hp = espnEventData.homeLinescores[i];
        const pNum = i + 1;
        const isOt = pNum > 4;
        const otIdx = pNum - 4;
        periods.push({ period: pNum, label: isOt ? (maxLen > 5 ? `PR${otIdx}` : "PR") : `${pNum}Q`, isOvertime: isOt, awayScore: Number(ap?.value) || 0, homeScore: Number(hp?.value) || 0 });
      }
    }
    const isOvertime = periods.some((p) => p.isOvertime);
    const overtimeCount = periods.filter((p) => p.isOvertime).length;
    const winnerSideKey = awayLog.pointsFor > homeLog.pointsFor ? "away" : "home";
    const winnerAbbr = winnerSideKey === "away" ? awayAbbr : homeAbbr;
    let decisivePeriodLabel = Math.abs(awayLog.pointsFor - homeLog.pointsFor) <= 5 ? "Desenlace en el clutch final" : `Dominio sostenido de ${winnerAbbr}`;
    if (periods.length > 0) {
      let bestSwing = -999;
      let bestP = periods[0];
      for (const p of periods) {
        const swing = winnerSideKey === "away" ? p.awayScore - p.homeScore : p.homeScore - p.awayScore;
        if (swing > bestSwing) {
          bestSwing = swing;
          bestP = p;
        }
      }
      if (bestP.isOvertime) {
        decisivePeriodLabel = `${bestP.label} (${bestP.awayScore}-${bestP.homeScore} \xB7 +${bestSwing} ${winnerAbbr})`;
      } else if (bestSwing >= 6) {
        decisivePeriodLabel = `${bestP.label} (${bestP.awayScore}-${bestP.homeScore} \xB7 +${bestSwing} ${winnerAbbr})`;
      } else {
        const p4 = periods.find((p) => p.period === 4) || bestP;
        decisivePeriodLabel = `Cierre en ${p4.label} (${p4.awayScore}-${p4.homeScore})`;
      }
    }
    const computeRecordUpToDate = __name((tm) => {
      const slice = tm.games.filter((g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate);
      const w = slice.filter((g) => g.result === "W").length;
      const l = slice.length - w;
      return `${w}-${l}`;
    }, "computeRecordUpToDate");
    const spanishDetails = [];
    const milestonesList = [];
    const seenSpanishIds = /* @__PURE__ */ new Set();
    const buildSideReport = __name((sideRole, teamObj, teamLog, cdnTeam, oppAbbr) => {
      const abbr = teamObj.abbreviation;
      const isWinner = teamLog.result === "W";
      const starters = [];
      const bench = [];
      const absencesAndDnp = [];
      const playedIdsTonight = /* @__PURE__ */ new Set();
      const listedIdsTonight = /* @__PURE__ */ new Set();
      const cdnPlayers = Array.isArray(cdnTeam?.players) ? cdnTeam.players : [];
      if (cdnPlayers.length > 0) {
        for (const cp of cdnPlayers) {
          const pid = String(cp?.personId || "");
          if (pid) listedIdsTonight.add(pid);
          const bio = pid ? biosMap.get(pid) : void 0;
          const fullName = String(cp?.name || "").trim() || bio?.name || "Jugador NBA";
          const shortName = buildShortPlayerName(fullName, cp?.firstName, cp?.familyName);
          const jersey = sanitizeJersey(cp?.jerseyNum, bio?.jersey);
          const position = String(cp?.position || "").trim() || bio?.position || "JUG";
          const country = bio?.country || "";
          const isSpanish = isSpanishPlayerCheck(fullName, country);
          const playedFlag = String(cp?.played || "") === "1";
          const statusStr = String(cp?.status || "ACTIVE").toUpperCase();
          const minParsed = parseIsoMinutes(cp?.statistics?.minutes);
          if (!playedFlag || statusStr !== "ACTIVE" || minParsed.decimal <= 0) {
            const isActiveOnBench = statusStr === "ACTIVE";
            const category = isActiveOnBench ? "dnp_bench" : "inactive";
            const espnInj = espnInjuriesMap.get(normalizePlain(fullName));
            const classified = classifyAbsenceOrDnp(isActiveOnBench, cp?.notPlayingReason, cp?.notPlayingDescription, espnInj);
            const plMem = pid ? playerById.get(pid) : void 0;
            const sLogs = plMem ? plMem.games.filter((g) => g.seasonLabel === seasonLabel) : [];
            const avgMin = sLogs.length >= 2 ? round1(sLogs.reduce((s, g) => s + g.minutes, 0) / sLogs.length) : void 0;
            const avgPts = sLogs.length >= 2 ? round1(sLogs.reduce((s, g) => s + g.points, 0) / sLogs.length) : void 0;
            const baselineTail = avgMin !== void 0 && avgPts !== void 0 && avgMin >= 12 && classified.statusType !== "coach_decision" && classified.statusType !== "gleague" ? ` \xB7 Media ${avgPts.toFixed(1)} PTS y ${avgMin.toFixed(1)} MIN` : "";
            const enrichedNote = `${classified.note}${baselineTail}`;
            absencesAndDnp.push({ playerId: pid || void 0, name: fullName, jersey, category, statusType: classified.statusType, statusLabel: classified.statusLabel, statusTone: classified.statusTone, priorityRank: classified.priorityRank, ptsAvg: avgPts, minAvg: avgMin, note: enrichedNote, isSpanish });
            if (isSpanish && pid && !seenSpanishIds.has(pid)) {
              seenSpanishIds.add(pid);
              spanishDetails.push({ playerId: pid, name: fullName, jersey, teamAbbr: abbr, played: false, lineSummary: `#${jersey} ${fullName} (${abbr}) \u2014 ${classified.statusLabel}: ${enrichedNote}` });
            }
            continue;
          }
          playedIdsTonight.add(pid);
          const st = cp.statistics || {};
          const pts = Number(st.points) || 0;
          const reb = Number(st.reboundsTotal) || 0;
          const oreb = Number(st.reboundsOffensive) || 0;
          const dreb = Number(st.reboundsDefensive) || 0;
          const ast = Number(st.assists) || 0;
          const stl = Number(st.steals) || 0;
          const blk = Number(st.blocks) || 0;
          const tov = Number(st.turnovers) || 0;
          const pf = Number(st.foulsPersonal) || 0;
          const pm = Number(st.plusMinusPoints) || 0;
          const fgm = Number(st.fieldGoalsMade) || 0;
          const fga = Number(st.fieldGoalsAttempted) || 0;
          const fg3m = Number(st.threePointersMade) || 0;
          const fg3a = Number(st.threePointersAttempted) || 0;
          const ftm = Number(st.freeThrowsMade) || 0;
          const fta = Number(st.freeThrowsAttempted) || 0;
          const fgPct = fga > 0 ? round1(fgm / fga * 100) : 0;
          const fg3Pct = fg3a > 0 ? round1(fg3m / fg3a * 100) : 0;
          const ftPct = fta > 0 ? round1(ftm / fta * 100) : 0;
          const tsDenom = 2 * (fga + 0.44 * fta);
          const tsPct = tsDenom > 0 ? round1(pts / tsDenom * 100) : 0;
          const gmSc = computeHollingerGmSc({ points: pts, fgm, fga, ftm, fta, oreb, dreb, stl, ast, blk, pf, tov });
          const tens = [pts, reb, ast, stl, blk].filter((v) => v >= 10).length;
          const tripleDouble = pts >= 10 && reb >= 10 && ast >= 10;
          const doubleDouble = !tripleDouble && tens >= 2;
          const lineObj = { playerId: pid, name: fullName, shortName, jersey, position, country, isSpanish, isStarter: String(cp?.starter || "") === "1", minutes: minParsed.decimal, minutesFormatted: minParsed.formatted, points: pts, rebounds: reb, oreb, dreb, assists: ast, steals: stl, blocks: blk, turnovers: tov, fouls: pf, plusMinus: pm, fgm, fga, fgPct, fg3m, fg3a, fg3Pct, ftm, fta, ftPct, tsPct, gameScore: gmSc, ptsPaint: typeof st.pointsInThePaint === "number" ? st.pointsInThePaint : void 0, ptsFastBreak: typeof st.pointsFastBreak === "number" ? st.pointsFastBreak : void 0, doubleDouble, tripleDouble };
          if (lineObj.isStarter) starters.push(lineObj);
          else bench.push(lineObj);
          if (isSpanish && !seenSpanishIds.has(pid)) {
            seenSpanishIds.add(pid);
            spanishDetails.push({ playerId: pid, name: fullName, jersey, teamAbbr: abbr, played: true, lineSummary: `#${jersey} ${fullName} (${abbr}): ${pts} PTS, ${reb} REB, ${ast} AST en ${minParsed.formatted} min (${fgm}/${fga} TC, ${pm >= 0 ? `+${pm}` : pm})` });
          }
          if (tripleDouble || doubleDouble) {
            milestonesList.push({ playerId: pid, name: fullName, jersey, teamAbbr: abbr, type: tripleDouble ? "TD" : "DD", detail: `#${jersey} ${fullName} (${abbr}): ${pts} PTS \xB7 ${reb} REB \xB7 ${ast} AST${stl >= 10 ? ` \xB7 ${stl} ROB` : ""}${blk >= 10 ? ` \xB7 ${blk} TAP` : ""}` });
          }
        }
      } else {
        const memMatched = [];
        for (const p of full.allPlayers) {
          const g = p.games.find((x) => x.eventId === eventId);
          if (!g) continue;
          const belongsHere = g.opponentAbbr === oppAbbr || g.isHome && sideRole === "home" || !g.isHome && sideRole === "away";
          if (!belongsHere) continue;
          playedIdsTonight.add(p.id);
          listedIdsTonight.add(p.id);
          const bio = biosMap.get(p.id);
          const jersey = sanitizeJersey(p.jersey, bio?.jersey);
          const country = p.country || bio?.country || "";
          const isSpanish = isSpanishPlayerCheck(p.name, country);
          const tens = [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter((v) => v >= 10).length;
          const tripleDouble = g.points >= 10 && g.rebounds >= 10 && g.assists >= 10;
          const doubleDouble = !tripleDouble && tens >= 2;
          const minParsed = parseIsoMinutes(g.minutes);
          const lineObj = { playerId: p.id, name: p.name, shortName: buildShortPlayerName(p.name), jersey, position: p.position || bio?.position || "JUG", country, isSpanish, isStarter: false, minutes: g.minutes, minutesFormatted: minParsed.formatted, points: g.points, rebounds: g.rebounds, oreb: g.oreb, dreb: g.dreb, assists: g.assists, steals: g.steals, blocks: g.blocks, turnovers: g.turnovers, fouls: g.fouls, plusMinus: g.plusMinus, fgm: g.fgm, fga: g.fga, fgPct: g.fgPct, fg3m: g.fg3m, fg3a: g.fg3a, fg3Pct: g.fg3Pct, ftm: g.ftm, fta: g.fta, ftPct: g.ftPct, tsPct: g.tsPct, gameScore: g.gameScore, ptsPaint: Math.max(0, (g.fgm - g.fg3m) * 2), doubleDouble, tripleDouble };
          memMatched.push(lineObj);
          if (isSpanish && !seenSpanishIds.has(p.id)) {
            seenSpanishIds.add(p.id);
            spanishDetails.push({ playerId: p.id, name: p.name, jersey, teamAbbr: abbr, played: true, lineSummary: `#${jersey} ${p.name} (${abbr}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST en ${minParsed.formatted} min` });
          }
          if (tripleDouble || doubleDouble) {
            milestonesList.push({ playerId: p.id, name: p.name, jersey, teamAbbr: abbr, type: tripleDouble ? "TD" : "DD", detail: `#${jersey} ${p.name} (${abbr}): ${g.points} PTS \xB7 ${g.rebounds} REB \xB7 ${g.assists} AST` });
          }
        }
        memMatched.sort((a, b) => b.minutes - a.minutes);
        memMatched.forEach((pl, idx) => {
          pl.isStarter = idx < 5;
          if (idx < 5) starters.push(pl);
          else bench.push(pl);
        });
      }
      if (seasonLabel === "2026-27") {
        for (const p of full.allPlayers) {
          if (p.teamAbbr !== abbr) continue;
          const bio = biosMap.get(p.id);
          const isSp = isSpanishPlayerCheck(p.name, p.country || bio?.country);
          const seasonGames = p.games.filter((g) => g.seasonLabel === "2026-27");
          if (isSp && !seenSpanishIds.has(p.id)) {
            seenSpanishIds.add(p.id);
            const j = sanitizeJersey(p.jersey, bio?.jersey);
            const spInj = espnInjuriesMap.get(normalizePlain(p.name));
            const spCleanInj = spInj ? translateMedicalDetailEs(spInj.detail) : "";
            spanishDetails.push({ playerId: p.id, name: p.name, jersey: j, teamAbbr: abbr, played: false, lineSummary: spInj ? `#${j} ${p.name} (${abbr}) \u2014 Lesionado: Parte m\xE9dico (${spCleanInj || "baja m\xE9dica"})` : `#${j} ${p.name} (${abbr}) \u2014 Decisi\xF3n t\xE9cnica: Fuera de convocatoria sin parte m\xE9dico activo` });
          }
          if (playedIdsTonight.has(p.id) || listedIdsTonight.has(p.id)) continue;
          if (seasonGames.length < 2) continue;
          const avgMin = seasonGames.reduce((s, g) => s + g.minutes, 0) / seasonGames.length;
          const avgPts = seasonGames.reduce((s, g) => s + g.points, 0) / seasonGames.length;
          if (avgMin >= 14.5) {
            const espnInj = espnInjuriesMap.get(normalizePlain(p.name));
            const cleanInj = espnInj ? translateMedicalDetailEs(espnInj.detail) : "";
            absencesAndDnp.unshift({ playerId: p.id, name: p.name, jersey: sanitizeJersey(p.jersey, bio?.jersey), category: "rotation_absence", statusType: espnInj ? "injury" : "coach_decision", statusLabel: espnInj ? "Lesionado" : "Decisi\xF3n t\xE9cnica", statusTone: espnInj ? "rose" : "slate", priorityRank: espnInj ? 3 : 6, ptsAvg: round1(avgPts), minAvg: round1(avgMin), note: espnInj ? `Parte m\xE9dico: ${cleanInj || "baja m\xE9dica confirmada"} \xB7 Media ${avgPts.toFixed(1)} PTS y ${avgMin.toFixed(1)} MIN` : `Fuera de convocatoria sin parte m\xE9dico activo (media ${avgPts.toFixed(1)} PTS \xB7 ${avgMin.toFixed(1)} MIN)`, isSpanish: isSp });
          }
        }
        for (const b of biosMap.values()) {
          if (b.teamAbbr !== abbr) continue;
          if (isSpanishPlayerCheck(b.name, b.country) && !seenSpanishIds.has(b.id)) {
            seenSpanishIds.add(b.id);
            const j = sanitizeJersey(b.jersey);
            spanishDetails.push({ playerId: b.id, name: b.name, jersey: j, teamAbbr: abbr, played: false, lineSummary: `#${j} ${b.name} (${abbr}): en plantilla oficial, sin participaci\xF3n en el encuentro` });
          }
        }
      }
      starters.sort((a, b) => b.minutes - a.minutes || b.points - a.points);
      bench.sort((a, b) => b.minutes - a.minutes || b.points - a.points);
      const allPlayed = [...starters, ...bench];
      const cdnStats = cdnTeam?.statistics || {};
      const sumFouls = allPlayed.reduce((s, x) => s + x.fouls, 0);
      const sumBenchPts = bench.reduce((s, x) => s + x.points, 0);
      const teamPossEst = teamLog.fga + 0.44 * teamLog.fta + teamLog.tov;
      for (const pl of allPlayed) {
        const plPoss = pl.fga + 0.44 * pl.fta + pl.turnovers;
        if (teamPossEst > 0 && pl.minutes > 0) {
          const usgVal = plPoss / (teamPossEst * (pl.minutes / 48)) * 20;
          pl.usgEst = round1(Math.min(55, Math.max(0, usgVal)));
        } else {
          pl.usgEst = 0;
        }
        const plSummary = playerById.get(pl.playerId);
        const seasonLogs = plSummary ? plSummary.games.filter((g) => g.seasonLabel === seasonLabel && g.minutes > 0) : [];
        const otherSeasonGames = seasonLogs.filter((g) => g.eventId !== eventId);
        if (otherSeasonGames.length >= 1) {
          const totalGamesSample = otherSeasonGames.length + 1;
          const highs = {};
          const evalSeasonHigh = __name((colKey, tonightVal, extractOther, opts) => {
            if (opts?.qualifyTonight === false) return;
            if ((opts?.minPositive ?? true) && tonightVal <= 0) return;
            const eligibleOthers = opts?.qualifyOther ? otherSeasonGames.filter(opts.qualifyOther) : otherSeasonGames;
            if (eligibleOthers.length === 0) return;
            let maxOther = -Infinity;
            let tiedCount = 0;
            const eps = opts?.eps ?? 0.05;
            for (const og of eligibleOthers) {
              const v = extractOther(og);
              if (v > maxOther) maxOther = v;
            }
            if (!Number.isFinite(maxOther)) return;
            for (const og of eligibleOthers) {
              if (Math.abs(extractOther(og) - tonightVal) <= eps) {
                tiedCount++;
              }
            }
            if (tonightVal > maxOther + eps) {
              highs[colKey] = { mode: "sole", prevBest: round1(maxOther), gamesPlayed: totalGamesSample };
            } else if (Math.abs(tonightVal - maxOther) <= eps) {
              if (opts?.skipRoutinePerfectTie && tonightVal >= 99.9 && tiedCount >= 2) {
                return;
              }
              highs[colKey] = { mode: "tied", prevBest: round1(maxOther), gamesPlayed: totalGamesSample };
            }
          }, "evalSeasonHigh");
          evalSeasonHigh("min", pl.minutes, (g) => g.minutes, { eps: 0.09 });
          evalSeasonHigh("pts", pl.points, (g) => g.points);
          evalSeasonHigh("fgm", pl.fgm, (g) => g.fgm);
          evalSeasonHigh("fga", pl.fga, (g) => g.fga);
          evalSeasonHigh("fgPct", pl.fgPct, (g) => g.fgPct, { qualifyTonight: pl.fga >= 4, qualifyOther: __name((g) => g.fga >= 4, "qualifyOther"), eps: 0.15, skipRoutinePerfectTie: true });
          evalSeasonHigh("fg3m", pl.fg3m, (g) => g.fg3m);
          evalSeasonHigh("fg3a", pl.fg3a, (g) => g.fg3a);
          evalSeasonHigh("fg3Pct", pl.fg3Pct, (g) => g.fg3Pct, { qualifyTonight: pl.fg3a >= 3, qualifyOther: __name((g) => g.fg3a >= 3, "qualifyOther"), eps: 0.15, skipRoutinePerfectTie: true });
          evalSeasonHigh("ftm", pl.ftm, (g) => g.ftm);
          evalSeasonHigh("fta", pl.fta, (g) => g.fta);
          evalSeasonHigh("ftPct", pl.ftPct, (g) => g.ftPct, { qualifyTonight: pl.fta >= 4, qualifyOther: __name((g) => g.fta >= 4, "qualifyOther"), eps: 0.15, skipRoutinePerfectTie: true });
          evalSeasonHigh("oreb", pl.oreb, (g) => g.oreb);
          evalSeasonHigh("dreb", pl.dreb, (g) => g.dreb);
          evalSeasonHigh("reb", pl.rebounds, (g) => g.rebounds);
          evalSeasonHigh("ast", pl.assists, (g) => g.assists);
          evalSeasonHigh("stl", pl.steals, (g) => g.steals);
          evalSeasonHigh("blk", pl.blocks, (g) => g.blocks);
          evalSeasonHigh("plusMinus", pl.plusMinus, (g) => g.plusMinus, { minPositive: true });
          evalSeasonHigh("gameScore", pl.gameScore, (g) => g.gameScore, { minPositive: true, eps: 0.09 });
          evalSeasonHigh("tsPct", pl.tsPct, (g) => g.tsPct, { qualifyTonight: pl.fga + pl.fta >= 5, qualifyOther: __name((g) => g.fga + g.fta >= 5, "qualifyOther"), eps: 0.15 });
          evalSeasonHigh("usgEst", pl.usgEst || 0, (g) => g.usgEst || 0, { qualifyTonight: pl.minutes >= 10, qualifyOther: __name((g) => g.minutes >= 10, "qualifyOther"), eps: 0.25 });
          if (Object.keys(highs).length > 0) {
            pl.seasonHighs = highs;
          }
        }
        const hasSeasonBase = seasonLogs.length >= 3;
        const avgMin = hasSeasonBase ? seasonLogs.reduce((s, g) => s + g.minutes, 0) / seasonLogs.length : void 0;
        const avgPts = hasSeasonBase ? seasonLogs.reduce((s, g) => s + g.points, 0) / seasonLogs.length : void 0;
        if (pl.fouls >= 6) {
          const roundedMin = Math.round(pl.minutes);
          absencesAndDnp.unshift({ playerId: pl.playerId, name: pl.name, jersey: pl.jersey, category: "foul_out", statusType: "foul_out", statusLabel: "Expulsado (6 faltas)", statusTone: "amber", priorityRank: 1, minutesPlayed: roundedMin, note: `Expulsado por 6 faltas personales (${roundedMin}') \xB7 ${pl.points} PTS \xB7 ${pl.rebounds} REB`, ptsAvg: avgPts !== void 0 ? round1(avgPts) : void 0, minAvg: avgMin !== void 0 ? round1(avgMin) : void 0, reason: "6 Faltas personales", isSpanish: pl.isSpanish });
        } else if (avgMin !== void 0 && avgPts !== void 0 && avgMin >= 16 && pl.minutes <= Math.min(11.5, avgMin * 0.42)) {
          const espnInj = espnInjuriesMap.get(normalizePlain(pl.name));
          const cleanInj = espnInj ? translateMedicalDetailEs(espnInj.detail) : "";
          absencesAndDnp.unshift({ playerId: pl.playerId, name: pl.name, jersey: pl.jersey, category: "in_game_setback", statusType: "in_game_setback", statusLabel: "Percance en pista", statusTone: "amber", priorityRank: 2, minutesPlayed: Math.round(pl.minutes), note: `Salida prematura${cleanInj ? ` (${cleanInj})` : ""} \xB7 Solo ${pl.minutesFormatted} min en pista (media habitual: ${avgMin.toFixed(1)} MIN \xB7 ${avgPts.toFixed(1)} PTS)`, ptsAvg: round1(avgPts), minAvg: round1(avgMin), reason: "Retirado prematuramente durante el encuentro", isSpanish: pl.isSpanish });
        }
      }
      absencesAndDnp.sort((a, b) => (a.priorityRank ?? 8) - (b.priorityRank ?? 8) || (b.ptsAvg ?? 0) - (a.ptsAvg ?? 0));
      const totals = { points: teamLog.pointsFor, fgm: teamLog.fgm, fga: teamLog.fga, fgPct: teamLog.fgPct, fg3m: teamLog.fg3m, fg3a: teamLog.fg3a, fg3Pct: teamLog.fg3Pct, ftm: teamLog.ftm, fta: teamLog.fta, ftPct: teamLog.ftPct, reb: teamLog.reb, oreb: teamLog.oreb, dreb: teamLog.dreb, ast: teamLog.ast, stl: teamLog.stl, blk: teamLog.blk, tov: teamLog.tov, fouls: typeof cdnStats.foulsPersonal === "number" ? cdnStats.foulsPersonal : sumFouls, efgPct: teamLog.efgPct, tsPct: teamLog.tsPct, offRtg: teamLog.offRtg, defRtg: teamLog.defRtg, netRtg: teamLog.netRtg, pace: teamLog.pace, ptsPaint: typeof cdnStats.pointsInThePaint === "number" ? cdnStats.pointsInThePaint : Math.round(teamLog.pointsFor * 0.42), ptsFastBreak: typeof cdnStats.pointsFastBreak === "number" ? cdnStats.pointsFastBreak : Math.round(teamLog.pointsFor * 0.14), ptsOffTov: typeof cdnStats.pointsFromTurnovers === "number" ? cdnStats.pointsFromTurnovers : Math.round(teamLog.tov * 1.1), ptsSecondChance: typeof cdnStats.pointsSecondChance === "number" ? cdnStats.pointsSecondChance : Math.round(teamLog.oreb * 1.25), benchPoints: typeof cdnStats.benchPoints === "number" ? cdnStats.benchPoints : sumBenchPts, biggestLead: typeof cdnStats.biggestLead === "number" ? cdnStats.biggestLead : 12, biggestRun: typeof cdnStats.biggestScoringRun === "number" ? cdnStats.biggestScoringRun : 8 };
      const rankedForPodium = [...allPlayed].map((pl) => ({ pl, podiumScore: round1(pl.gameScore + 0.22 * pl.plusMinus + (isWinner ? 1.5 : 0)) })).sort((a, b) => b.podiumScore - a.podiumScore || b.pl.gameScore - a.pl.gameScore || b.pl.points - a.pl.points).slice(0, 3);
      const podium = rankedForPodium.map((item, idx) => ({ stars: 3 - idx, playerId: item.pl.playerId, jersey: item.pl.jersey, name: item.pl.name, position: item.pl.position, points: item.pl.points, rebounds: item.pl.rebounds, assists: item.pl.assists, plusMinus: item.pl.plusMinus, fgm: item.pl.fgm, fga: item.pl.fga, tsPct: item.pl.tsPct, shortLine: `${item.pl.points}P \xB7 ${item.pl.rebounds}R \xB7 ${item.pl.assists}A \xB7 ${item.pl.plusMinus >= 0 ? `+${item.pl.plusMinus}` : item.pl.plusMinus}`, gameScore: item.pl.gameScore, podiumScore: item.podiumScore }));
      const placeholderNextGame = { hasScheduledGame: false, record: computeRecordUpToDate(teamObj), conference: teamObj.conference, conferenceRank: teamObj.playoffSeed || 1, streakCode: teamObj.streakCode || "\u2014", opponentAbbr: "", opponentName: "", isHome: true, dateFormatted: "", timeFormatted: "", arenaName: "", arenaCity: "" };
      return { teamId: teamObj.id, abbr, name: teamObj.name, shortName: teamObj.shortName, recordAfter: placeholderNextGame.record, score: teamLog.pointsFor, isWinner, isBackToBack: teamLog.isBackToBack, starters, bench, totals, absencesAndDnp, podium, nextGame: placeholderNextGame };
    }, "buildSideReport");
    const awaySide = buildSideReport("away", awayTeamObj, awayLog, cdnGame?.awayTeam, homeAbbr);
    const homeSide = buildSideReport("home", homeTeamObj, homeLog, cdnGame?.homeTeam, awayAbbr);
    const fouledOutTargets = [
      ...awaySide.absencesAndDnp.filter((item) => item.statusType === "foul_out").map((item) => ({ playerId: item.playerId ? String(item.playerId) : "", name: item.name, teamAbbr: awaySide.abbr })),
      ...homeSide.absencesAndDnp.filter((item) => item.statusType === "foul_out").map((item) => ({ playerId: item.playerId ? String(item.playerId) : "", name: item.name, teamAbbr: homeSide.abbr })),
    ];
    const [foulOutTimings, awayNextGame, homeNextGame, pbpHighlights, heroicSnapshotResp] = await Promise.all([
      fetchPlayByPlayFoulOuts(eventId, fouledOutTargets, seasonLabel, forceRefresh, { gameDate, awayAbbr, homeAbbr }),
      resolveTeamNextGameInfo({ currentEventId: eventId, teamObj: awayTeamObj, recordAfter: awaySide.recordAfter, fullTeams: full.teams, gameDate, seasonLabel, scheduleGames, forceRefresh }),
      resolveTeamNextGameInfo({ currentEventId: eventId, teamObj: homeTeamObj, recordAfter: homeSide.recordAfter, fullTeams: full.teams, gameDate, seasonLabel, scheduleGames, forceRefresh }),
      fetchPlayByPlayHighlights(eventId, awayAbbr, homeAbbr, winnerAbbr, seasonLabel, forceRefresh, gameDate),
      getLeagueHeroicShots("all", false).catch(() => null),
    ]);
    awaySide.nextGame = awayNextGame;
    homeSide.nextGame = homeNextGame;
    if (foulOutTimings.size > 0 || (pbpHighlights?.foulOuts && pbpHighlights.foulOuts.length > 0)) {
      for (const side of [awaySide, homeSide]) {
        const allPl = [...side.starters, ...side.bench];
        for (const item of side.absencesAndDnp) {
          if (item.statusType === "foul_out") {
            let timing = (item.playerId && foulOutTimings.get(item.playerId)) || foulOutTimings.get(item.name);
            if (!timing && pbpHighlights?.foulOuts?.length) {
              const normItemName = normalizePlain(item.name);
              const lastName = normItemName.split(/\s+/).slice(-1)[0] || "";
              const matchFo = pbpHighlights.foulOuts.find((f) =>
                (item.playerId && f.playerId === item.playerId) ||
                normalizePlain(f.playerName) === normItemName ||
                (lastName.length >= 3 && normalizePlain(f.playerName).endsWith(lastName) && (!f.teamAbbr || f.teamAbbr === side.abbr))
              );
              if (matchFo) {
                timing = { periodLabel: matchFo.periodLabel, clockRemaining: matchFo.clock };
              }
            }
            if (timing) {
              item.foulOutPeriod = timing.periodLabel;
              item.foulOutClock = timing.clockRemaining;
              const plLine = allPl.find((p) => (item.playerId && p.playerId === item.playerId) || normalizePlain(p.name) === normalizePlain(item.name));
              const roundedMin = plLine ? Math.round(plLine.minutes) : (item.minutesPlayed ?? null);
              if (roundedMin !== null) item.minutesPlayed = roundedMin;
              const minTag = roundedMin !== null ? ` (${roundedMin}')` : "";
              const statTail = plLine ? ` · ${plLine.points} PTS · ${plLine.rebounds} REB` : "";
              item.note = `Expulsado por 6 faltas${minTag} en el ${timing.periodLabel} faltando ${timing.clockRemaining}${statTail}`;
            }
          }
        }
      }
    }
    if (periods.length > 0) {
      const parsePeriodOrder = (lbl: string): number => {
        const up = String(lbl || "").toUpperCase().trim();
        if (up.endsWith("Q")) return Number(up.replace("Q", "")) || 4;
        if (up === "PR" || up === "OT") return 5;
        const otMatch = /^(?:PR|OT)(\d+)$/.exec(up);
        if (otMatch) return 4 + (Number(otMatch[1]) || 1);
        return 4;
      };
      const finalMargin = Math.abs(awayLog.pointsFor - homeLog.pointsFor);
      const getWinnerSwing = (p: typeof periods[number]) =>
        winnerSideKey === "away" ? p.awayScore - p.homeScore : p.homeScore - p.awayScore;

      if (isOvertime) {
        const otPeriods = periods.filter((p) => p.isOvertime);
        const lastOt = otPeriods[otPeriods.length - 1] || periods[periods.length - 1];
        const otSwing = getWinnerSwing(lastOt);
        decisivePeriodLabel = `${lastOt.label} (${lastOt.awayScore}-${lastOt.homeScore}${otSwing > 0 ? ` · +${otSwing} ${winnerAbbr}` : ""})`;
      } else if (pbpHighlights?.clutchExecution?.isClutchGame || finalMargin <= 5) {
        const p4 = periods.find((p) => p.period === 4) || periods[periods.length - 1];
        const p4Swing = getWinnerSwing(p4);
        decisivePeriodLabel = p4Swing > 0
          ? `Clutch ${p4.label} (${p4.awayScore}-${p4.homeScore} · +${p4Swing} ${winnerAbbr})`
          : `Clutch ${p4.label} (${p4.awayScore}-${p4.homeScore})`;
      } else {
        let minDecisiveOrder = 1;
        if (pbpHighlights?.breakpoint?.periodLabel) {
          minDecisiveOrder = Math.max(1, parsePeriodOrder(pbpHighlights.breakpoint.periodLabel));
        } else {
          // Without PBP, ensure an early quarter isn't labeled decisive if a later quarter erased the cushion
          let cumAway = 0;
          let cumHome = 0;
          for (const p of periods) {
            cumAway += p.awayScore;
            cumHome += p.homeScore;
            const cumWinnerLead = winnerSideKey === "away" ? cumAway - cumHome : cumHome - cumAway;
            if (p.period < 4 && cumWinnerLead <= 4) {
              minDecisiveOrder = Math.max(minDecisiveOrder, p.period + 1);
            }
          }
        }
        const eligiblePeriods = periods.filter((p) => p.period >= minDecisiveOrder);
        const searchPool = eligiblePeriods.length > 0 ? eligiblePeriods : periods;
        let bestSwing = -999;
        let bestP = searchPool[searchPool.length - 1];
        for (const p of searchPool) {
          const swing = getWinnerSwing(p);
          if (swing > bestSwing) {
            bestSwing = swing;
            bestP = p;
          }
        }
        if (bestSwing >= 6) {
          decisivePeriodLabel = `${bestP.label} (${bestP.awayScore}-${bestP.homeScore} · +${bestSwing} ${winnerAbbr})`;
        } else if (pbpHighlights?.breakpoint?.periodLabel) {
          const bpOrder = parsePeriodOrder(pbpHighlights.breakpoint.periodLabel);
          const bpPeriodObj = periods.find((p) => p.period === bpOrder) || periods.find((p) => p.period === 4) || bestP;
          const bpSwing = getWinnerSwing(bpPeriodObj);
          decisivePeriodLabel = bpSwing > 0
            ? `Quiebre en ${bpPeriodObj.label} (${bpPeriodObj.awayScore}-${bpPeriodObj.homeScore} · +${bpSwing} ${winnerAbbr})`
            : `Quiebre en ${bpPeriodObj.label} (${bpPeriodObj.awayScore}-${bpPeriodObj.homeScore})`;
        } else {
          const p4 = periods.find((p) => p.period === 4) || bestP;
          decisivePeriodLabel = `Cierre en ${p4.label} (${p4.awayScore}-${p4.homeScore})`;
        }
      }
    }
    let leaguePaceSum = 0;
    let leaguePaceCount = 0;
    for (const tm of full.teams) {
      for (const gm of tm.games) {
        if (gm.seasonLabel === seasonLabel && gm.pace > 75 && gm.pace < 125) {
          leaguePaceSum += gm.pace;
          leaguePaceCount++;
        }
      }
    }
    const leagueAvgPace = leaguePaceCount > 0 ? round1(leaguePaceSum / leaguePaceCount) : 99.6;
    const matchPace = round1((awaySide.totals.pace + homeSide.totals.pace) / 2 || awaySide.totals.pace);
    const paceDiffVsLeague = round1(matchPace - leagueAvgPace);
    const leadChanges = typeof cdnGame?.homeTeam?.statistics?.leadChanges === "number" ? cdnGame.homeTeam.statistics.leadChanges : null;
    const timesTied = typeof cdnGame?.homeTeam?.statistics?.timesTied === "number" ? cdnGame.homeTeam.statistics.timesTied : null;
    const otSuffix = isOvertime ? overtimeCount > 1 ? ` (${overtimeCount} PR)` : " (PR)" : "";
    const pasoBTitle = `${awaySide.name} vs ${homeSide.name} | ${awaySide.score}-${homeSide.score}${otSuffix} | ${arenaName}, ${arenaCity} (${attendanceFormatted})`;
    const teamComparisonRows = [];
    const pushTeamRow = __name((opts) => {
      const dec = opts.decimals ?? 0;
      const suf = opts.suffix ?? "";
      const rawDiff = opts.awayVal - opts.homeVal;
      let betterSide = "tie";
      if (Math.abs(rawDiff) > 0.04) {
        if (opts.lowerIsBetter) {
          betterSide = opts.awayVal < opts.homeVal ? "away" : "home";
        } else {
          betterSide = opts.awayVal > opts.homeVal ? "away" : "home";
        }
      }
      const winnerAbbrRow = betterSide === "away" ? awaySide.abbr : betterSide === "home" ? homeSide.abbr : "";
      const absStr = dec === 0 ? `${Math.round(Math.abs(rawDiff))}${suf}` : `${Math.abs(rawDiff).toFixed(dec)}${suf}`;
      const diffDisplay = betterSide === "tie" ? "Igualado" : `+${absStr} ${winnerAbbrRow}`;
      teamComparisonRows.push({ key: opts.key, label: opts.label, helpKey: opts.helpKey, awayDisplay: opts.awayDisplay, homeDisplay: opts.homeDisplay, awayNumeric: opts.awayVal, homeNumeric: opts.homeVal, diffDisplay, betterSide, section: opts.section, lowerIsBetter: opts.lowerIsBetter });
    }, "pushTeamRow");
    const at = awaySide.totals;
    const ht = homeSide.totals;
    pushTeamRow({ key: "pts", label: "Puntos Totales", helpKey: "ptsBase", awayVal: at.points, homeVal: ht.points, awayDisplay: `${at.points}`, homeDisplay: `${ht.points}`, section: "scoring_shooting" });
    pushTeamRow({ key: "fg", label: "Tiros de Campo (TC \xB7 %)", helpKey: "fgPct", awayVal: at.fgPct, homeVal: ht.fgPct, awayDisplay: `${at.fgm}/${at.fga} (${at.fgPct.toFixed(1)}%)`, homeDisplay: `${ht.fgm}/${ht.fga} (${ht.fgPct.toFixed(1)}%)`, decimals: 1, suffix: "%", section: "scoring_shooting" });
    pushTeamRow({ key: "fg3", label: "Triples (T3 \xB7 %)", helpKey: "fg3Pct", awayVal: at.fg3Pct, homeVal: ht.fg3Pct, awayDisplay: `${at.fg3m}/${at.fg3a} (${at.fg3Pct.toFixed(1)}%)`, homeDisplay: `${ht.fg3m}/${ht.fg3a} (${ht.fg3Pct.toFixed(1)}%)`, decimals: 1, suffix: "%", section: "scoring_shooting" });
    pushTeamRow({ key: "ft", label: "Tiros Libres (TL \xB7 %)", helpKey: "ftPct", awayVal: at.ftm, homeVal: ht.ftm, awayDisplay: `${at.ftm}/${at.fta} (${at.ftPct.toFixed(1)}%)`, homeDisplay: `${ht.ftm}/${ht.fta} (${ht.ftPct.toFixed(1)}%)`, suffix: " TL", section: "scoring_shooting" });
    pushTeamRow({ key: "efg", label: "Tiro Efectivo (eFG%)", helpKey: "efgPct", awayVal: at.efgPct, homeVal: ht.efgPct, awayDisplay: `${at.efgPct.toFixed(1)}%`, homeDisplay: `${ht.efgPct.toFixed(1)}%`, decimals: 1, suffix: "%", section: "efficiency_tactics" });
    pushTeamRow({ key: "ts", label: "Acierto Real (TS%)", helpKey: "tsPct", awayVal: at.tsPct, homeVal: ht.tsPct, awayDisplay: `${at.tsPct.toFixed(1)}%`, homeDisplay: `${ht.tsPct.toFixed(1)}%`, decimals: 1, suffix: "%", section: "efficiency_tactics" });
    pushTeamRow({ key: "offRtg", label: "Eficiencia Ofensiva (OffRtg)", helpKey: "offRtg", awayVal: at.offRtg, homeVal: ht.offRtg, awayDisplay: `${at.offRtg.toFixed(1)}`, homeDisplay: `${ht.offRtg.toFixed(1)}`, decimals: 1, section: "efficiency_tactics" });
    pushTeamRow({ key: "paint", label: "Puntos en la pintura (PITP)", helpKey: "ptsPaint", awayVal: at.ptsPaint ?? 0, homeVal: ht.ptsPaint ?? 0, awayDisplay: `${at.ptsPaint ?? 0}`, homeDisplay: `${ht.ptsPaint ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "secondChance", label: "Puntos 2\xAA oportunidad", helpKey: "pts2ndChance", awayVal: at.ptsSecondChance ?? 0, homeVal: ht.ptsSecondChance ?? 0, awayDisplay: `${at.ptsSecondChance ?? 0}`, homeDisplay: `${ht.ptsSecondChance ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "fastbreak", label: "Puntos contraataque (FB PTS)", helpKey: "ptsFastBreak", awayVal: at.ptsFastBreak ?? 0, homeVal: ht.ptsFastBreak ?? 0, awayDisplay: `${at.ptsFastBreak ?? 0}`, homeDisplay: `${ht.ptsFastBreak ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "ptsOffTov", label: "Puntos tras p\xE9rdidas", helpKey: "ptsOffTov", awayVal: at.ptsOffTov ?? 0, homeVal: ht.ptsOffTov ?? 0, awayDisplay: `${at.ptsOffTov ?? 0}`, homeDisplay: `${ht.ptsOffTov ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "bench", label: "Puntos banquillo", helpKey: "benchPts", awayVal: at.benchPoints, homeVal: ht.benchPoints, awayDisplay: `${at.benchPoints}`, homeDisplay: `${ht.benchPoints}`, section: "efficiency_tactics" });
    const away3PAr = at.fga > 0 ? round1(at.fg3a / at.fga * 100) : 0;
    const home3PAr = ht.fga > 0 ? round1(ht.fg3a / ht.fga * 100) : 0;
    pushTeamRow({ key: "threeRatio", label: "Ratio tiros de 3 (3PAr %)", helpKey: "threeRatio", awayVal: away3PAr, homeVal: home3PAr, awayDisplay: `${away3PAr.toFixed(1)}% (${at.fg3a} int)`, homeDisplay: `${home3PAr.toFixed(1)}% (${ht.fg3a} int)`, decimals: 1, suffix: "%", section: "efficiency_tactics" });
    pushTeamRow({ key: "reb", label: "Rebotes Totales (REB)", helpKey: "rebBase", awayVal: at.reb, homeVal: ht.reb, awayDisplay: `${at.reb} (${at.oreb} OF / ${at.dreb} DEF)`, homeDisplay: `${ht.reb} (${ht.oreb} OF / ${ht.dreb} DEF)`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "oreb", label: "Rebote Ofensivo (OREB \xB7 %)", helpKey: "orebPct", awayVal: at.oreb, homeVal: ht.oreb, awayDisplay: `${at.oreb} (${awayLog.orebPct.toFixed(1)}%)`, homeDisplay: `${ht.oreb} (${homeLog.orebPct.toFixed(1)}%)`, suffix: " OR", section: "reb_playmaking_defense" });
    pushTeamRow({ key: "ast", label: "Asistencias (AST)", helpKey: "astBase", awayVal: at.ast, homeVal: ht.ast, awayDisplay: `${at.ast}`, homeDisplay: `${ht.ast}`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "stl", label: "Robos (ROB)", helpKey: "steals", awayVal: at.stl, homeVal: ht.stl, awayDisplay: `${at.stl}`, homeDisplay: `${ht.stl}`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "blk", label: "Tapones (TAP)", helpKey: "blocks", awayVal: at.blk, homeVal: ht.blk, awayDisplay: `${at.blk}`, homeDisplay: `${ht.blk}`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "tov", label: "P\xE9rdidas de Bal\xF3n (PER)", helpKey: "tov", awayVal: at.tov, homeVal: ht.tov, awayDisplay: `${at.tov}`, homeDisplay: `${ht.tov}`, lowerIsBetter: true, suffix: " menos", section: "reb_playmaking_defense" });
    pushTeamRow({ key: "tovPct", label: "% P\xE9rdidas (TOV%)", helpKey: "tovPct", awayVal: awayLog.tovPct, homeVal: homeLog.tovPct, awayDisplay: `${awayLog.tovPct.toFixed(1)}%`, homeDisplay: `${homeLog.tovPct.toFixed(1)}%`, decimals: 1, lowerIsBetter: true, suffix: "%", section: "reb_playmaking_defense" });
    const awayAstTov = at.tov > 0 ? round1(at.ast / at.tov) : at.ast;
    const homeAstTov = ht.tov > 0 ? round1(ht.ast / ht.tov) : ht.ast;
    pushTeamRow({ key: "astTov", label: "Ratio Asist / P\xE9rd", helpKey: "astTo", awayVal: awayAstTov, homeVal: homeAstTov, awayDisplay: `${awayAstTov.toFixed(2)}`, homeDisplay: `${homeAstTov.toFixed(2)}`, decimals: 2, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "pf", label: "Faltas Personales (FP)", helpKey: "personalFouls", awayVal: at.fouls, homeVal: ht.fouls, awayDisplay: `${at.fouls}`, homeDisplay: `${ht.fouls}`, lowerIsBetter: true, suffix: " menos", section: "reb_playmaking_defense" });
    const awayPool = [...awaySide.starters, ...awaySide.bench];
    const homePool = [...homeSide.starters, ...homeSide.bench];
    const leaderComparisonRows = [];
    const pickTopLeader = __name((pool, getter, tieBreakMoreMinutes = false) => {
      if (pool.length === 0) return null;
      return [...pool].sort((a, b) => {
        const diff = getter(b) - getter(a);
        if (Math.abs(diff) > 0.01) return diff;
        if (tieBreakMoreMinutes) {
          return b.minutes - a.minutes || b.fga - a.fga;
        }
        if (b.gameScore !== a.gameScore) return b.gameScore - a.gameScore;
        return a.minutes - b.minutes;
      })[0];
    }, "pickTopLeader");
    const playerByNameKey = /* @__PURE__ */ new Map();
    for (const p of full.allPlayers) {
      playerByNameKey.set(normalizePlain(p.name), p);
    }
    const resolvePlayerBaselineLogs = __name((playerId, fullName) => {
      const summary = playerById.get(playerId) || playerByNameKey.get(normalizePlain(fullName));
      if (!summary) return { logs: [] };
      const seasonLogs = summary.games.filter((g) => g.seasonLabel === seasonLabel && g.minutes > 0);
      if (seasonLogs.length >= 2) {
        return { summary, logs: seasonLogs };
      }
      const allActiveLogs = summary.games.filter((g) => g.minutes > 0);
      return { summary, logs: allActiveLogs.length >= 2 ? allActiveLogs : [] };
    }, "resolvePlayerBaselineLogs");
    const avgOf = __name((logs, fn) => {
      if (logs.length === 0) return null;
      const sum = logs.reduce((acc, g) => acc + fn(g), 0);
      return round1(sum / logs.length);
    }, "avgOf");
    const leaderDefs = [{ key: "min", label: "Minutos Jugados", groupLabel: "I. Volumen Base y Tableros", helpKey: "minBase", getter: __name((p) => p.minutes, "getter"), formatStat: __name((p) => `${p.minutesFormatted}`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.minutes), "baselineGetter"), deltaUnit: "m", surgeThreshold: 3, isElite: __name((v) => v >= 38, "isElite"), decimals: 1, diffSuffix: "m" }, { key: "pts", label: "Puntos", groupLabel: "I. Volumen Base y Tableros", helpKey: "ptsBase", getter: __name((p) => p.points, "getter"), formatStat: __name((p) => `${p.points} PTS`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.points), "baselineGetter"), surgeThreshold: 3, isElite: __name((v) => v >= 30, "isElite"), diffSuffix: " PTS" }, { key: "reb", label: "Rebotes Totales", groupLabel: "I. Volumen Base y Tableros", helpKey: "rebBase", getter: __name((p) => p.rebounds, "getter"), formatStat: __name((p) => `${p.rebounds} REB`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.rebounds), "baselineGetter"), surgeThreshold: 2, isElite: __name((v) => v >= 13, "isElite"), diffSuffix: " REB" }, { key: "ast", label: "Asistencias", groupLabel: "I. Volumen Base y Tableros", helpKey: "astBase", getter: __name((p) => p.assists, "getter"), formatStat: __name((p) => `${p.assists} AST`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.assists), "baselineGetter"), surgeThreshold: 1.8, isElite: __name((v) => v >= 10, "isElite"), diffSuffix: " AST" }, { key: "oreb", label: "Rebotes Ofensivos", groupLabel: "I. Volumen Base y Tableros", helpKey: "orebBase", getter: __name((p) => p.oreb, "getter"), formatStat: __name((p) => `${p.oreb} OREB`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.oreb), "baselineGetter"), surgeThreshold: 1.2, isElite: __name((v) => v >= 5, "isElite"), diffSuffix: " OR" }, { key: "tc", label: "Tiros de Campo Anotados", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "fgmMade", getter: __name((p) => p.fgm, "getter"), formatStat: __name((p) => `${p.fgm}/${p.fga} TC`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.fgm), "baselineGetter"), surgeThreshold: 2, isElite: __name((v) => v >= 11, "isElite"), diffSuffix: " TC" }, { key: "fg3m", label: "Triples Anotados", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "fg3m", getter: __name((p) => p.fg3m, "getter"), formatStat: __name((p) => `${p.fg3m}/${p.fg3a} T3`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.fg3m), "baselineGetter"), surgeThreshold: 1.2, isElite: __name((v) => v >= 5, "isElite"), diffSuffix: " T3" }, { key: "tl", label: "Tiros Libres Anotados", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "ftmMade", getter: __name((p) => p.ftm, "getter"), formatStat: __name((p) => `${p.ftm}/${p.fta} TL`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.ftm), "baselineGetter"), surgeThreshold: 1.8, isElite: __name((v) => v >= 8, "isElite"), diffSuffix: " TL" }, { key: "tsPct", label: "Acierto Real (TS%)", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "tsPct", filter: __name((p) => p.fga >= 6, "filter"), getter: __name((p) => p.tsPct, "getter"), formatStat: __name((p) => `${p.tsPct.toFixed(1)}%`, "formatStat"), baselineGetter: __name((logs, summary) => {
      if (logs.length === 0) return summary?.advanced?.tsPct ?? null;
      const pts = logs.reduce((s, g) => s + g.points, 0);
      const fga = logs.reduce((s, g) => s + g.fga, 0);
      const fta = logs.reduce((s, g) => s + g.fta, 0);
      const denom = 2 * (fga + 0.44 * fta);
      return denom > 0 ? round1(pts / denom * 100) : avgOf(logs, (g) => g.tsPct);
    }, "baselineGetter"), deltaUnit: "%", surgeThreshold: 4.5, isElite: __name((v, p) => p.fga >= 6 && v >= 70, "isElite"), decimals: 1, diffSuffix: "%" }, { key: "tov", label: "P\xE9rdidas", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "leaderTurnovers", getter: __name((p) => p.turnovers, "getter"), formatStat: __name((p) => `${p.turnovers} PER`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.turnovers), "baselineGetter"), surgeThreshold: 0.8, isElite: __name((v) => v <= 1, "isElite"), lowerIsBetter: true, diffSuffix: " menos" }, { key: "astTo", label: "Ratio Asistencias/P\xE9rdidas", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "astTo", filter: __name((p) => p.assists >= 4, "filter"), getter: __name((p) => p.turnovers > 0 ? round1(p.assists / p.turnovers) : p.assists, "getter"), formatStat: __name((p) => `${(p.turnovers > 0 ? round1(p.assists / p.turnovers) : p.assists).toFixed(1)} A/P`, "formatStat"), baselineGetter: __name((logs) => {
      if (logs.length === 0) return null;
      const ast = logs.reduce((s, g) => s + g.assists, 0);
      const tov = logs.reduce((s, g) => s + g.turnovers, 0);
      return round1(ast / Math.max(1, tov));
    }, "baselineGetter"), surgeThreshold: 1, isElite: __name((v, p) => p.assists >= 5 && v >= 4.5, "isElite"), decimals: 1 }, { key: "stl", label: "Robos de Bal\xF3n", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "steals", getter: __name((p) => p.steals, "getter"), formatStat: __name((p) => `${p.steals} ROB`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.steals), "baselineGetter"), surgeThreshold: 0.8, isElite: __name((v) => v >= 3, "isElite"), diffSuffix: " ROB" }, { key: "blk", label: "Tapones", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "blocks", getter: __name((p) => p.blocks, "getter"), formatStat: __name((p) => `${p.blocks} TAP`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.blocks), "baselineGetter"), surgeThreshold: 0.8, isElite: __name((v) => v >= 3, "isElite"), diffSuffix: " TAP" }, { key: "pm", label: "Impacto M\xE1s / Menos", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "plusMinusBase", getter: __name((p) => p.plusMinus, "getter"), formatStat: __name((p) => `${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.plusMinus), "baselineGetter"), surgeThreshold: 4, isElite: __name((v) => v >= 15, "isElite") }, { key: "gmSc", label: "Valoraci\xF3n (GmSc)", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "gmSc", getter: __name((p) => p.gameScore, "getter"), formatStat: __name((p) => `${p.gameScore.toFixed(1)}`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.gameScore), "baselineGetter"), surgeThreshold: 3, isElite: __name((v) => v >= 24, "isElite"), decimals: 1 }, { key: "usgEst", label: "Uso Ofensivo Est. (USG%)", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "usgPct", filter: __name((p) => p.minutes >= 12, "filter"), getter: __name((p) => p.usgEst || 0, "getter"), formatStat: __name((p) => `${(p.usgEst || 0).toFixed(1)}%`, "formatStat"), baselineGetter: __name((logs, summary) => {
      if (seasonLabel === "2026-27" && summary?.advanced?.usgPct) {
        return round1(summary.advanced.usgPct);
      }
      return avgOf(logs, (g) => g.usgEst || 0);
    }, "baselineGetter"), deltaUnit: "%", surgeThreshold: 3, isElite: __name((v) => v >= 32, "isElite"), decimals: 1, diffSuffix: "%" }, { key: "sixthMan", label: "Mejor Suplente (6\xBA Hombre)", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "sixthMan", filter: __name((p) => !p.isStarter, "filter"), getter: __name((p) => p.gameScore, "getter"), formatStat: __name((p) => `${p.points}P \xB7 ${p.gameScore.toFixed(1)} GmSc`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.gameScore), "baselineGetter"), surgeThreshold: 2.5, isElite: __name((v) => v >= 14, "isElite"), decimals: 1, diffSuffix: " GmSc" }];
    const buildLeaderDeltaMeta = __name((val, player, def) => {
      const { summary, logs } = resolvePlayerBaselineLogs(player.playerId, player.name);
      const avg = def.baselineGetter(logs, summary);
      if (avg === null || !Number.isFinite(avg)) return {};
      const rawDelta = round1(val - avg);
      const effectiveDelta = def.lowerIsBetter ? -rawDelta : rawDelta;
      const unit = def.deltaUnit || "";
      const threshold = def.surgeThreshold ?? 1.5;
      let deltaDisplay;
      if (Math.abs(rawDelta) < 0.05) {
        deltaDisplay = "= media";
      } else {
        const signed = rawDelta > 0 ? `+${rawDelta.toFixed(1)}` : rawDelta.toFixed(1);
        deltaDisplay = `${signed}${unit} vs media`;
      }
      const deltaTone = effectiveDelta >= threshold ? "positive" : effectiveDelta <= -threshold ? "negative" : "neutral";
      return { avg, deltaVsAvg: rawDelta, deltaDisplay, deltaTone };
    }, "buildLeaderDeltaMeta");
    for (const def of leaderDefs) {
      const aFiltered = def.filter ? awayPool.filter(def.filter) : awayPool;
      const hFiltered = def.filter ? homePool.filter(def.filter) : homePool;
      const aL = pickTopLeader(aFiltered.length > 0 ? aFiltered : awayPool, def.getter, Boolean(def.lowerIsBetter));
      const hL = pickTopLeader(hFiltered.length > 0 ? hFiltered : homePool, def.getter, Boolean(def.lowerIsBetter));
      if (!aL || !hL) continue;
      const aVal = def.getter(aL);
      const hVal = def.getter(hL);
      const rawDiff = aVal - hVal;
      let betterSide = "tie";
      if (Math.abs(rawDiff) >= 0.05) {
        if (def.lowerIsBetter) {
          betterSide = aVal < hVal ? "away" : "home";
        } else {
          betterSide = aVal > hVal ? "away" : "home";
        }
      }
      const dec = def.decimals ?? 0;
      const suf = def.diffSuffix ?? "";
      const absStr = dec === 0 ? `${Math.round(Math.abs(rawDiff))}${suf}` : `${Math.abs(rawDiff).toFixed(dec)}${suf}`;
      const winAbbr = betterSide === "away" ? awaySide.abbr : betterSide === "home" ? homeSide.abbr : "";
      const diffDisplay = betterSide === "tie" ? "Igualado" : `+${absStr} ${winAbbr}`;
      const awayStatDisplay = def.formatStat(aL);
      const homeStatDisplay = def.formatStat(hL);
      const awayDeltaMeta = buildLeaderDeltaMeta(aVal, aL, def);
      const homeDeltaMeta = buildLeaderDeltaMeta(hVal, hL, def);
      leaderComparisonRows.push({ categoryKey: def.key, categoryLabel: def.label, groupLabel: def.groupLabel, helpKey: def.helpKey, awayPlayerId: aL.playerId, awayJersey: aL.jersey, awayShortName: aL.shortName, awayPlayerName: aL.name, awayStatDisplay, awayFormatted: `#${aL.jersey} ${aL.shortName} (${awayStatDisplay}${awayDeltaMeta.deltaDisplay ? ` \xB7 ${awayDeltaMeta.deltaDisplay}` : ""})`, awayValue: aVal, awayAvg: awayDeltaMeta.avg, awayDeltaVsAvg: awayDeltaMeta.deltaVsAvg, awayDeltaDisplay: awayDeltaMeta.deltaDisplay, awayDeltaTone: awayDeltaMeta.deltaTone, awayIsElite: def.isElite ? def.isElite(aVal, aL) : false, homePlayerId: hL.playerId, homeJersey: hL.jersey, homeShortName: hL.shortName, homePlayerName: hL.name, homeStatDisplay, homeFormatted: `#${hL.jersey} ${hL.shortName} (${homeStatDisplay}${homeDeltaMeta.deltaDisplay ? ` \xB7 ${homeDeltaMeta.deltaDisplay}` : ""})`, homeValue: hVal, homeAvg: homeDeltaMeta.avg, homeDeltaVsAvg: homeDeltaMeta.deltaVsAvg, homeDeltaDisplay: homeDeltaMeta.deltaDisplay, homeDeltaTone: homeDeltaMeta.deltaTone, homeIsElite: def.isElite ? def.isElite(hVal, hL) : false, diffDisplay, lowerIsBetter: def.lowerIsBetter, betterSide });
    }
    const hasSpanishPlayers = spanishDetails.length > 0;
    const spanishSummaryLine = hasSpanishPlayers ? spanishDetails.map((s) => s.lineSummary).join(" \xB7 ") : `Sin representaci\xF3n espa\xF1ola en las plantillas de ${awaySide.shortName} ni ${homeSide.shortName} en este encuentro.`;
    const rawSnapshotClinchers = Array.isArray(heroicSnapshotResp?.items)
      ? heroicSnapshotResp.items.filter((x) => String(x?.gameId || "") === String(eventId) && (x?.shotType === "buzzer_beater" || x?.shotType === "game_winner"))
      : [];
    const baseClinchers = rawSnapshotClinchers.length > 0 ? rawSnapshotClinchers : (Array.isArray(pbpHighlights?.heroicClinchers) ? pbpHighlights.heroicClinchers : []);
    const allBoxPlayersById = new Map();
    for (const pl of [...awaySide.starters, ...awaySide.bench, ...homeSide.starters, ...homeSide.bench]) {
      if (pl?.playerId) allBoxPlayersById.set(String(pl.playerId), pl);
    }
    const heroicClinchers = baseClinchers.map((hc) => {
      const pid = String(hc?.playerId || "");
      const boxPl = pid ? allBoxPlayersById.get(pid) : null;
      const memPl = pid ? playerById.get(pid) : null;
      const bio = pid ? biosMap.get(pid) : null;
      const fullName = boxPl?.name || memPl?.name || bio?.name || hc?.playerName || "Jugador";
      const jersey = boxPl?.jersey || sanitizeJersey(memPl?.jersey, bio?.jersey);
      const isBB = hc?.shotType === "buzzer_beater";
      return {
        shotType: hc.shotType,
        tagLabel: isBB ? "Buzzer Beater sobre la bocina (BB)" : "Game Winner decisivo (GW)",
        playerId: pid,
        playerName: fullName,
        jersey,
        teamAbbr: String(hc?.teamAbbr || winnerAbbr),
        opponentAbbr: String(hc?.opponentAbbr || (winnerAbbr === awayAbbr ? homeAbbr : awayAbbr)),
        periodLabel: String(hc?.periodLabel || "4Q"),
        clock: String(hc?.clock || "0.0"),
        clockSeconds: Number(hc?.clockSeconds ?? 0),
        points: Number(hc?.points || 2),
        shotDistance: hc?.shotDistance ?? null,
        actionEs: translateHeroicShotActionCompactEs(String(hc?.description || "")),
      };
    });
    const report = { eventId, date: gameDate, seasonLabel, pasoBTitle, arenaName, arenaCity, attendance, attendanceFormatted, durationMinutes, officials, isOvertime, overtimeCount, decisivePeriodLabel, leadChanges, timesTied, leagueAvgPace, paceDiffVsLeague, periods, away: awaySide, home: homeSide, spanishPlayersReport: { hasSpanishPlayers, summaryLine: spanishSummaryLine, details: spanishDetails }, milestonesList, teamComparisonRows, leaderComparisonRows, pbpHighlights, heroicClinchers };
    const missingFoulOutClock = [...awaySide.absencesAndDnp, ...homeSide.absencesAndDnp].some(
      (a) => a.statusType === "foul_out" && (!a.foulOutPeriod || !a.foulOutClock)
    );
    const ttlMs = missingFoulOutClock ? 60 * 1e3 : (seasonLabel === "2026-27" ? 10 * 60 * 1e3 : 120 * 60 * 1e3);
    reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, data: report });
    return report;
  }
  async function buildGameOfficialReportData(eventId, forceRefresh = false) {
    const cacheKey = `game_official_report_v10:${eventId}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }
    const inflightKey = `official_report_inflight:${eventId}`;
    const existing = reportInflight.get(inflightKey);
    const existingStart = reportInflightStartedAt.get(inflightKey) || 0;
    if (existing && (!forceRefresh || Date.now() - existingStart < 2500)) {
      return existing;
    }
    const p = computeGameOfficialReportData(eventId, forceRefresh, cacheKey);
    reportInflight.set(inflightKey, p);
    reportInflightStartedAt.set(inflightKey, Date.now());
    try {
      return await p;
    } finally {
      if (reportInflight.get(inflightKey) === p) {
        reportInflight.delete(inflightKey);
        reportInflightStartedAt.delete(inflightKey);
      }
    }
  }
  function buildDeterministicGameNarrative(report, chronicleVersion: "v1_classic" | "v2_tactical" = "v1_classic") {
    const winner = report.away.isWinner ? report.away : report.home;
    const loser = report.away.isWinner ? report.home : report.away;
    const margin = Math.abs(winner.score - loser.score);
    const wt = winner.totals;
    const lt = loser.totals;
    const wStar = winner.podium[0];
    const wSecond = winner.podium[1];
    const lStar = loser.podium[0];
    const clincher = Array.isArray(report.heroicClinchers) && report.heroicClinchers.length > 0 ? report.heroicClinchers[0] : null;
    const clincherIsBB = clincher?.shotType === "buzzer_beater";
    const clincherPhrase = clincher
      ? (clincherIsBB ? "con un Buzzer Beater sobre la bocina" : "con un Game Winner decisivo")
      : "";
    const clincherTiming = clincher
      ? (clincherIsBB ? `sobre la bocina del ${clincher.periodLabel} (0.0s)` : `a falta de ${clincher.clock} del ${clincher.periodLabel}`)
      : "";
    const pressHeadline = clincher
      ? `${winner.shortName} vence a ${loser.shortName} (${report.away.score}-${report.home.score}) ${clincherPhrase} de #${clincher.jersey} ${clincher.playerName}`
      : wStar ? `${winner.shortName} impone su ley ante ${loser.shortName} (${report.away.score}-${report.home.score}) al ritmo de #${wStar.jersey} ${wStar.name}` : `${winner.name} resuelve el pulso ante ${loser.name} (${report.away.score}-${report.home.score}) en ${report.arenaName}`;
    const pressLead = clincher
      ? `**${winner.name}** (${winner.recordAfter}) selló una victoria inolvidable ${report.away.isWinner ? "a domicilio" : "en su pista"} gracias a **#${clincher.jersey} ${clincher.playerName}**, autor del ${clincherIsBB ? "Buzzer Beater (BB)" : "Game Winner (GW)"} mediante un ${clincher.actionEs} ${clincherTiming} ante **${loser.name}** (${loser.recordAfter}).`
      : `**${winner.name}** (${winner.recordAfter}) sell\xF3 el triunfo ${report.away.isWinner ? "a domicilio" : "en su pista"} apoyado en un ${wt.efgPct.toFixed(1)}% de tiro efectivo y **el golpe t\xE1ctico asestado en ${report.decisivePeriodLabel}**, dejando sin premio la resistencia de **${loser.name}** (${loser.recordAfter}).`;
    const paceSignStr = report.paceDiffVsLeague >= 0 ? `+${report.paceDiffVsLeague.toFixed(1)}` : report.paceDiffVsLeague.toFixed(1);
    let quarterNarrative = report.periods.length >= 4 ? `El guion por parciales (${report.periods.map((p) => `${p.label}: ${p.awayScore}-${p.homeScore}`).join(", ")}) **encontr\xF3 su punto de ruptura definitivo en ${report.decisivePeriodLabel}**${report.leadChanges !== null ? `, tras un intercambio t\xE1ctico con ${report.leadChanges} cambios de mando y ${report.timesTied ?? 0} empates` : ""}, disput\xE1ndose a un ritmo de ${wt.pace.toFixed(1)} posesiones (${paceSignStr} frente a las ${report.leagueAvgPace.toFixed(1)} de media NBA esta temporada).` : `El encuentro entre **${report.away.shortName}** y **${report.home.shortName}** se defini\xF3 por una renta final de ${margin} tantos (${report.away.score}-${report.home.score}), **imponiendo el control del ritmo competitivo** con ${wt.pace.toFixed(1)} posesiones (${paceSignStr} respecto a las ${report.leagueAvgPace.toFixed(1)} de promedio NBA).`;
    if (report.pbpHighlights?.breakpoint?.summary) {
      quarterNarrative += ` ${report.pbpHighlights.breakpoint.summary}.`;
    }

    let dynamicSpotlight = null;
    if (report.isOvertime) {
      const otHeroTail = clincher
        ? ` El broche final llegó con **#${clincher.jersey} ${clincher.playerName}** anotando un ${clincher.actionEs} ${clincherTiming} como ${clincherIsBB ? "Buzzer Beater sobre la bocina" : "Game Winner ganador"}.`
        : "";
      dynamicSpotlight = { title: clincher ? `Prórroga resuelta ${clincherIsBB ? "sobre la bocina" : "con Game Winner"}` : "Tiempo extra bajo máxima presión", body: `El choque exigió ${report.overtimeCount > 1 ? `${report.overtimeCount} prórrogas` : "cinco minutos suplementarios"} tras agotarse el tiempo reglamentario en máxima igualdad, poniendo a prueba las piernas de los titulares y **premiando la ejecución en media pista** de **${winner.shortName}** frente a **${loser.shortName}**.${otHeroTail}` };
    } else if (clincher) {
      dynamicSpotlight = {
        title: clincherIsBB ? "Buzzer Beater sobre la bocina" : "Game Winner en los últimos segundos",
        body: `Con el marcador al límite, **${winner.shortName}** confió la posesión definitiva a **#${clincher.jersey} ${clincher.playerName}**, quien conectó un ${clincher.actionEs} ${clincherTiming} para **sentenciar el duelo con el tiro ganador** (${report.away.score}-${report.home.score}) ante **${loser.shortName}**.`,
      };
    } else if (report.pbpHighlights?.clutchExecution?.isClutchGame && margin <= 4) {
      dynamicSpotlight = {
        title: "Duelo táctico en los dos minutos finales",
        body: `Con el electrónico comprimido en una o dos posesiones, **la lucidez en la toma de decisiones al límite** dictó sentencia entre **${winner.shortName}** y **${loser.shortName}**. ${report.pbpHighlights.clutchExecution.summaryNarrative}.`,
      };
    } else if (Math.abs(wt.benchPoints - lt.benchPoints) >= 16) {
      const benchWinner = wt.benchPoints > lt.benchPoints ? winner.shortName : loser.shortName;
      dynamicSpotlight = { title: `Desequilibrio en los tramos de segunda unidad`, body: `La brecha de banquillos (${wt.benchPoints}-${lt.benchPoints} en puntos de suplentes) **alteró los minutos de descanso titular**, dando aire constante a la rotación de **${benchWinner}**.` };
    }

    let runAndClutchProse = wt.biggestLead !== null && wt.biggestRun !== null ? `**${winner.shortName}** llegó a estirar su ventaja máxima hasta los +${wt.biggestLead} puntos gracias a una racha de ${wt.biggestRun}-0 que **desarmó el balance defensivo rival**, sabiendo administrar las posesiones finales ante **${loser.shortName}** sin conceder segundas vidas.` : `En el tramo decisivo, **la gestión quirúrgica del tempo ofensivo** (${wt.offRtg.toFixed(1)} de eficiencia ofensiva frente a ${lt.offRtg.toFixed(1)}) permitió a **${winner.shortName}** blindar el electrónico frente a **${loser.shortName}**.`;
    if (report.pbpHighlights?.keyRun?.summary) {
      runAndClutchProse += ` El flujo anotador quedó marcado por el ${report.pbpHighlights.keyRun.summary}.`;
    }
    if (clincher) {
      runAndClutchProse += ` La última palabra perteneció a **#${clincher.jersey} ${clincher.playerName}**, firmando ese ${clincherIsBB ? "Buzzer Beater (BB)" : "Game Winner (GW)"} (${clincher.actionEs}) ${clincherTiming} que dejó sin réplica a **${loser.shortName}**.`;
    } else if (dynamicSpotlight?.title?.includes("dos minutos finales")) {
      runAndClutchProse += ` En los compases finales con el marcador en un puño, **${winner.shortName}** impuso su temple en cada posesión para no ceder el liderato ante el empuje de **${loser.shortName}**.`;
    } else if (report.pbpHighlights?.clutchExecution?.isClutchGame && report.pbpHighlights.clutchExecution.summaryNarrative) {
      runAndClutchProse += ` ${report.pbpHighlights.clutchExecution.summaryNarrative}.`;
    } else if (report.pbpHighlights?.clutchPlays && report.pbpHighlights.clutchPlays.length > 0) {
      const clutchSummary = report.pbpHighlights.clutchPlays.slice(0, 3).map((c) => `[${c.periodLabel} ${c.clock}] ${c.description}`).join("; ");
      runAndClutchProse += ` En los minutos calientes del clutch, destacaron estas acciones clave: ${clutchSummary}.`;
    }

    const paintAndThreeBattle = wt.ptsPaint !== null && lt.ptsPaint !== null ? `En la pizarra de espacios, **${winner.name}** **dominó la selección de tiro interior y exterior** con un ${wt.efgPct.toFixed(1)}% en tiro efectivo (${wt.fg3m}/${wt.fg3a} en triples) y ${wt.ptsPaint} puntos en la pintura frente a los ${lt.ptsPaint} de **${loser.shortName}**, mientras que en el rebote el pulso cerró ${wt.reb}-${lt.reb} (${wt.oreb} capturas ofensivas del ganador por ${lt.oreb} del rival).` : `En el pulso de los Cuatro Factores, **${winner.name}** **marcó diferencias desde la eficiencia real de tiro** con un ${wt.efgPct.toFixed(1)}% de acierto efectivo (${wt.fg3m}/${wt.fg3a} desde el perímetro) frente al ${lt.efgPct.toFixed(1)}% de **${loser.name}**, acompañando el acierto con un balance reboteador de ${wt.reb}-${lt.reb}.`;
    const isNonTechnicalAbsence = __name((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague" && a.statusType !== "foul_out", "isNonTechnicalAbsence");
    const awayMedAbs = report.away.absencesAndDnp.filter(isNonTechnicalAbsence);
    const homeMedAbs = report.home.absencesAndDnp.filter(isNonTechnicalAbsence);
    const awayFoulOuts = report.away.absencesAndDnp.filter((a) => a.statusType === "foul_out");
    const homeFoulOuts = report.home.absencesAndDnp.filter((a) => a.statusType === "foul_out");
    const formatFoulOutPlayer = (a) => {
      const minStr = a.minutesPlayed !== undefined && a.minutesPlayed !== null ? ` (${a.minutesPlayed}')` : "";
      const timingStr = a.foulOutPeriod && a.foulOutClock ? ` en el ${a.foulOutPeriod} faltando ${a.foulOutClock}` : "";
      return `**#${a.jersey} ${a.name}**${minStr} fue expulsado por seis faltas${timingStr}`;
    };
    const joinListEs = (items) => items.length <= 1 ? items[0] || "" : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
    const foulOutClauses = [];
    if (awayFoulOuts.length > 0) {
      foulOutClauses.push(`en el bando visitante (${report.away.abbr}), ${joinListEs(awayFoulOuts.map(formatFoulOutPlayer))}`);
    }
    if (homeFoulOuts.length > 0) {
      foulOutClauses.push(`por los locales (${report.home.abbr}), ${joinListEs(homeFoulOuts.map(formatFoulOutPlayer))}`);
    }
    const foulOutsProse = foulOutClauses.length > 0 ? ` En el apartado disciplinario, ${foulOutClauses.join("; ")}.` : "";
    const benchAndAbsences = `La rotación de segunda unidad aportó ${wt.benchPoints} puntos en **${winner.shortName}** por ${lt.benchPoints} del banquillo de **${loser.shortName}**${wt.ptsFastBreak !== null && lt.ptsFastBreak !== null ? `, **castigando cada pérdida a campo abierto** con un parcial de ${wt.ptsFastBreak}-${lt.ptsFastBreak} al contraataque y ${wt.ptsOffTov ?? 0} tantos tras las ${lt.tov} pérdidas rivales` : `, **penalizando los errores en el manejo** tras las ${lt.tov} pérdidas de **${loser.shortName}**`}.${foulOutsProse}${awayMedAbs.length > 0 || homeMedAbs.length > 0 ? ` Las rotaciones estuvieron condicionadas por el parte oficial de bajas: ${[...awayMedAbs.map((a) => `**${a.name}** (${report.away.abbr} · ${a.statusLabel || "Baja"}: ${a.note})`), ...homeMedAbs.map((a) => `**${a.name}** (${report.home.abbr} · ${a.statusLabel || "Baja"}: ${a.note})`)].slice(0, 4).join("; ")}.` : ""}`;
    const xFactorSection = wStar && lStar ? `El tim\xF3n ofensivo perteneci\xF3 a **#${wStar.jersey} ${wStar.name}** (${wStar.points} puntos, ${wStar.rebounds} rebotes, ${wStar.assists} asistencias, GmSc ${wStar.gameScore.toFixed(1)}), **generando ventajas constantes sobre la primera ayuda** de **${loser.shortName}**.

Como Factor X emergi\xF3 ${wSecond ? `**#${wSecond.jersey} ${wSecond.name}** (${wSecond.points} puntos, ${wSecond.rebounds} rebotes y ${wSecond.assists} asistencias, ${wSecond.plusMinus >= 0 ? `+${wSecond.plusMinus}` : wSecond.plusMinus} en pista)` : `el bloque exterior de **${winner.shortName}**`}, **dando continuidad ofensiva a cada tramo sin bal\xF3n**, mientras que en **${loser.name}** la producci\xF3n de **#${lStar.jersey} ${lStar.name}** (${lStar.points} puntos, ${lStar.rebounds} rebotes, ${lStar.assists} asistencias) sostuvo la pelea hasta el desenlace.` : `**El reparto coral en ataque est\xE1tico** de **${winner.name}** inclin\xF3 la balanza en las posesiones calientes del \xFAltimo cuarto ante **${loser.name}**.`;
    const ddProse = report.milestonesList.length > 0 ? `La hoja estad\xEDstica dej\xF3 actuaciones de dobles figuras m\xFAltiples con ${report.milestonesList.map((m) => m.type === "TD" ? `el triple-doble de **${m.detail.replace(/\s*\(.*$/, "")}** (${m.detail.match(/\((.*)\)/)?.[1] || m.detail})` : `el doble-doble de **${m.detail.replace(/\s*\(.*$/, "")}** (${m.detail.match(/\((.*)\)/)?.[1] || m.detail})`).join(", ")}. ` : "";
    const chList = Array.isArray(report._verifiedCareerHighs) ? report._verifiedCareerHighs : [];
    const chProse = chList.length > 0 ? `Adem\xE1s, la noche dej\xF3 un r\xE9cord personal de carrera hist\xF3rico: ${chList.slice(0, 3).map((ch) => `**${ch.playerName}** (${ch.teamAbbr}) estableci\xF3 un nuevo Career High con ${ch.summary}`).join("; ")}. ` : "";
    const verdictSection = `${ddProse}${chProse}En la lectura global de scouting, **${winner.name}** (${winner.recordAfter}) **refuerza su solidez competitiva en media pista** firmando ${wt.offRtg.toFixed(1)} puntos por cada 100 posesiones, mientras que **${loser.name}** (${loser.recordAfter}) deber\xE1 corregir el cierre del rebote y el cuidado del bal\xF3n (${lt.tov} p\xE9rdidas) para su siguiente cita.`;

    const basePayload: any = {
      eventId: report.eventId,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      engineMode: "empirical_fallback",
      chronicleVersion,
      groundingUsed: false,
      pressHeadline: sanitizeEditorialSpanishGrammar(pressHeadline),
      pressLead: sanitizeEditorialSpanishGrammar(pressLead),
      gameFlowSection: sanitizeEditorialSpanishGrammar(`${quarterNarrative}\n\n${runAndClutchProse}`),
      chalkboardSection: sanitizeEditorialSpanishGrammar(`${paintAndThreeBattle}\n\n${benchAndAbsences}`),
      dynamicSpotlight: dynamicSpotlight ? { title: sanitizeEditorialSpanishGrammar(dynamicSpotlight.title), body: sanitizeEditorialSpanishGrammar(dynamicSpotlight.body) } : null,
      xFactorSection: sanitizeEditorialSpanishGrammar(xFactorSection),
      spanishSection: sanitizeEditorialSpanishGrammar(report.spanishPlayersReport.summaryLine),
      verdictSection: sanitizeEditorialSpanishGrammar(verdictSection),
      sources: [],
    };

    if (chronicleVersion === "v2_tactical") {
      const tacticalProfile = computeGameTacticalProfile(report);
      const wMetrics = report.away.isWinner ? tacticalProfile.away : tacticalProfile.home;
      const lMetrics = report.away.isWinner ? tacticalProfile.home : tacticalProfile.away;
      const duelsText =
        tacticalProfile.defensiveDuels.length > 0
          ? ` El seguimiento jugada a jugada dejó cruces defensivos directos destacados: ${tacticalProfile.defensiveDuels.slice(0, 3).join("; ")}.`
          : "";
      basePayload.tacticalProfile = tacticalProfile;
      basePayload.tacticalKeys = [
        {
          title: sanitizeEditorialSpanishGrammar(tacticalProfile.decisiveFactorLabel),
          summary: sanitizeEditorialSpanishGrammar(
            `${tacticalProfile.decisiveFactorSummary}, marcando la principal brecha de los Four Factors en el duelo.`
          ),
        },
        {
          title: sanitizeEditorialSpanishGrammar("Perfil de tiro y generación"),
          summary: sanitizeEditorialSpanishGrammar(
            `**${winner.shortName}** asistió el ${wMetrics.astPct.toFixed(1)}% de sus canastas con un ${wMetrics.threePointRatePct.toFixed(1)}% de volumen exterior${wMetrics.ptsPaint !== null && lMetrics.ptsPaint !== null ? ` y un pulso de ${wMetrics.ptsPaint}-${lMetrics.ptsPaint} en la pintura` : ""}.`
          ),
        },
        {
          title: sanitizeEditorialSpanishGrammar(`Control del tramo clave (${report.decisivePeriodLabel})`),
          summary: sanitizeEditorialSpanishGrammar(
            `**${winner.shortName}** protegió mejor el balón (${wMetrics.tovPct.toFixed(1)}% TOV% por ${lMetrics.tovPct.toFixed(1)}% rival) y convirtió las pérdidas rivales en ${wt.ptsOffTov ?? 0} puntos para cerrar el triunfo.`
          ),
        },
      ];
      basePayload.defensiveMatchupsSection = sanitizeEditorialSpanishGrammar(
        `En la pizarra defensiva de los Four Factors, **${winner.name}** **marcó la diferencia desde ${tacticalProfile.decisiveFactorLabel.toLowerCase()}** (${tacticalProfile.decisiveFactorSummary}), obligando a **${loser.name}** a vivir en posesiones más forzadas (${lMetrics.astPct.toFixed(1)}% de tiros asistidos frente al ${wMetrics.astPct.toFixed(1)}% ganador) y concediendo ${wt.stl} robos y ${wt.blk} tapones.${duelsText}`
      );
      basePayload.postgameQuotes = [];
    }

    return basePayload;
  }
  async function buildGameNarrativePayload(eventId, forceRefresh = false) {
    const editorialCfg = await loadEditorialConfig(forceRefresh);
    const gameVersion: "v1_classic" | "v2_tactical" =
      editorialCfg.gameChronicleVersion === "v1_classic" ? "v1_classic" : "v2_tactical";
    const cacheKey = `game_narrative_v18:${gameVersion}:e${editorialCfg.cacheEpoch}:${eventId}`;
    if (!forceRefresh) {
      const persisted = await readSharedPersistedNarrative(cacheKey);
      if (persisted) {
        if (!(persisted.engineMode === 'empirical_fallback' && getGeminiClient())) {
          return persisted;
        }
      }
    }
    const existing = reportInflight.get(cacheKey);
    if (existing) {
      return existing;
    }
    const startTime = Date.now();
    const promise = (async () => {
      const isServerless =
        Boolean(process.env.VERCEL) ||
        Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
        process.env.NBA_SNAPSHOT_ONLY === "1";
      const report = await buildGameOfficialReportData(eventId, forceRefresh);
      if (report.seasonLabel === "2026-27") {
        try {
          const fullMem = await deps.getFullLeagueMemory();
          const memPlayersById = new Map((fullMem?.allPlayers || []).map((pl) => [String(pl.id), pl]));
          const verifiedCh = [];
          const allBoxPlayers = [
            ...(report.away.starters || []).map((p) => ({ ...p, teamAbbr: report.away.abbr })),
            ...(report.away.bench || []).map((p) => ({ ...p, teamAbbr: report.away.abbr })),
            ...(report.home.starters || []).map((p) => ({ ...p, teamAbbr: report.home.abbr })),
            ...(report.home.bench || []).map((p) => ({ ...p, teamAbbr: report.home.abbr })),
          ];
          for (const bp of allBoxPlayers) {
            const pid = String(bp.id || "");
            const memPl = memPlayersById.get(pid);
            if (!memPl || !Array.isArray(memPl.games)) continue;
            const chrono = [...memPl.games]
              .filter((x) => !x.seasonLabel || x.seasonLabel === "2026-27")
              .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
            const idx = chrono.findIndex((x) => String(x.eventId) === String(report.eventId) || String(x.date || "").slice(0, 10) === String(report.date || "").slice(0, 10));
            if (idx < 0) continue;
            const base = getPlayerPriorCareerBaseline(pid, chrono, idx);
            if (!base.hasHistoricalSnapshot || base.priorCareerGp < 15) continue;
            const hits = [];
            if ((bp.points || 0) >= 25 && bp.points > base.priorHighs.pts) hits.push(`${bp.points} puntos (anterior tope: ${base.priorHighs.pts})`);
            if ((bp.rebounds || 0) >= 14 && bp.rebounds > base.priorHighs.reb) hits.push(`${bp.rebounds} rebotes (anterior tope: ${base.priorHighs.reb})`);
            if ((bp.assists || 0) >= 10 && bp.assists > base.priorHighs.ast) hits.push(`${bp.assists} asistencias (anterior tope: ${base.priorHighs.ast})`);
            if ((bp.fg3m || 0) >= 6 && bp.fg3m > base.priorHighs.fg3m) hits.push(`${bp.fg3m} triples (anterior tope: ${base.priorHighs.fg3m})`);
            if ((bp.steals || 0) >= 5 && bp.steals > base.priorHighs.stl) hits.push(`${bp.steals} robos (anterior tope: ${base.priorHighs.stl})`);
            if ((bp.blocks || 0) >= 5 && bp.blocks > base.priorHighs.blk) hits.push(`${bp.blocks} tapones (anterior tope: ${base.priorHighs.blk})`);
            if (hits.length > 0) {
              verifiedCh.push({ playerName: bp.name, teamAbbr: bp.teamAbbr, summary: hits.join(" y ") });
            }
          }
          report._verifiedCareerHighs = verifiedCh;
        } catch {
          report._verifiedCareerHighs = [];
        }
      }
      if (!getGeminiClient()) {
        const fallback = buildDeterministicGameNarrative(report, gameVersion);
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = true;
        return fallback;
      }
      let pressCtx = { byMatchup: new Map(), globalNotes: [] };
      try {
        const pressTimeoutMs = 3500;
        pressCtx = (await Promise.race([
          fetchLivePressContext(report.date, forceRefresh),
          new Promise((resolve) =>
            setTimeout(() => resolve({ byMatchup: new Map(), globalNotes: [] }), pressTimeoutMs)
          ),
        ])) as any;
      } catch {
        pressCtx = { byMatchup: new Map(), globalNotes: [] };
      }
      const matchPress = pressCtx.byMatchup.get(`${report.away.abbr}@${report.home.abbr}`);
      let espnRecap: any = null;
      if (gameVersion === "v2_tactical") {
        try {
          espnRecap = await Promise.race([
            fetchEspnFullGameRecap(matchPress?.espnEventId, report.date, report.away.abbr, report.home.abbr, forceRefresh),
            new Promise((resolve) => setTimeout(() => resolve(null), 3600)),
          ]);
        } catch {
          espnRecap = null;
        }
      }
      const seedSources = [
        { uri: `https://www.nba.com/game/${report.away.abbr.toLowerCase()}-vs-${report.home.abbr.toLowerCase()}-${report.eventId}/box-score`, title: `NBA.com Acta Oficial \u2014 ${report.away.abbr} vs ${report.home.abbr}` },
        { uri: `https://www.nba.com/game/${report.away.abbr.toLowerCase()}-vs-${report.home.abbr.toLowerCase()}-${report.eventId}/play-by-play`, title: `NBA.com Play-by-Play \u2014 ${report.away.abbr} vs ${report.home.abbr}` },
        ...(espnRecap?.url ? [{ uri: espnRecap.url, title: espnRecap.title }] : []),
        ...matchPress?.sources || [],
      ];
      const formatPlayerDossier = __name((p) => `#${p.jersey} ${p.name} (${p.position}, ${p.isStarter ? "Titular" : "Suplente"}): ${p.points} PTS, ${p.rebounds} REB (${p.oreb} OR), ${p.assists} AST, ${p.steals} ROB, ${p.blocks} TAP, ${p.turnovers} PER, ${p.fgm}/${p.fga} TC, ${p.fg3m}/${p.fg3a} T3, ${p.ftm}/${p.fta} TL, ${p.minutesFormatted} MIN, +/- ${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}, GmSc ${p.gameScore.toFixed(1)}${p.tripleDouble ? " [TRIPLE-DOBLE]" : p.doubleDouble ? " [DOBLE-DOBLE]" : ""}`, "formatPlayerDossier");
      const verifiedGamePlayers = [...report.away.starters.map((p) => p.name), ...report.away.bench.map((p) => p.name), ...report.away.absencesAndDnp.map((p) => p.name), ...report.home.starters.map((p) => p.name), ...report.home.bench.map((p) => p.name), ...report.home.absencesAndDnp.map((p) => p.name)];
      const isRelevantTechnicalDnp = (a) => (a.statusType === "coach_decision" || a.statusType === "gleague") && ((a.minAvg ?? 0) >= 12 || (a.ptsAvg ?? 0) >= 5 || a.isSpanish);
      const formatRelevantDnp = (a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Decisión técnica"}${a.minAvg !== undefined ? ` · media ${a.ptsAvg?.toFixed(1) ?? "0.0"} PTS y ${a.minAvg.toFixed(1)} MIN` : ""}]`;
      const awayRelevantTechDnp = report.away.absencesAndDnp.filter(isRelevantTechnicalDnp);
      const homeRelevantTechDnp = report.home.absencesAndDnp.filter(isRelevantTechnicalDnp);
      const heroicDossierLine = Array.isArray(report.heroicClinchers) && report.heroicClinchers.length > 0
        ? `CANASTA DECISIVA VERIFICADA (BUZZER BEATER / GAME WINNER): ${report.heroicClinchers.map((hc) => `#${hc.jersey} ${hc.playerName} (${hc.teamAbbr}) anotó un ${hc.tagLabel} mediante ${hc.actionEs} ${hc.shotType === "buzzer_beater" ? `sobre la bocina del ${hc.periodLabel} (0.0s)` : `faltando ${hc.clock} del ${hc.periodLabel}`} para sellar la victoria (${report.away.score}-${report.home.score}).`).join(" | ")}`
        : "";
      const careerHighDossierLine = Array.isArray(report._verifiedCareerHighs) && report._verifiedCareerHighs.length > 0
        ? `RÉCORD PERSONAL DE CARRERA VERIFICADO (CAREER HIGH): ${report._verifiedCareerHighs.map((ch) => `${ch.playerName} (${ch.teamAbbr}) fijó nuevo Career High con ${ch.summary}`).join(" | ")}`
        : "";
      const dossierBody = [`AVISO CR\xCDTICO DE MUNDO CERRADO: Fecha real del encuentro ${report.date} (Temporada ${report.seasonLabel}). Tu memoria interna de entrenamiento est\xE1 desactualizada varios a\xF1os respecto a entrenadores actuales, traspasos, contratos y palmar\xE9s. NO des NING\xDAN dato por supuesto fuera de los hechos expl\xEDcitos de este dossier.`, `PARTIDO OFICIAL NBA (${report.date} \xB7 Temporada ${report.seasonLabel}):`, `T\xCDTULO: ${report.pasoBTitle}`, `PARCIALES POR CUARTOS: ${report.periods.length > 0 ? report.periods.map((p) => `${p.label} (${report.away.abbr} ${p.awayScore} - ${p.homeScore} ${report.home.abbr})`).join(" | ") : "Sin desglose parcial"} \xB7 Tramo decisivo: ${report.decisivePeriodLabel}`, `FLUJO DE MARCADOR: Cambios de l\xEDder=${report.leadChanges ?? "No consta"}, Empates=${report.timesTied ?? "No consta"}, M\xE1xima ventaja ${report.away.abbr}=+${report.away.totals.biggestLead ?? 0} (mejor parcial ${report.away.totals.biggestRun ?? 0}-0), M\xE1xima ventaja ${report.home.abbr}=+${report.home.totals.biggestLead ?? 0} (mejor parcial ${report.home.totals.biggestRun ?? 0}-0).`, `RITMO DEL ENCUENTRO (PACE VS MEDIA NBA): ${report.away.totals.pace.toFixed(1)} posesiones/48m (${report.paceDiffVsLeague >= 0 ? `+${report.paceDiffVsLeague.toFixed(1)}` : report.paceDiffVsLeague.toFixed(1)} frente al promedio oficial NBA ${report.seasonLabel} de ${report.leagueAvgPace.toFixed(1)} posesiones).`, heroicDossierLine, careerHighDossierLine, matchPress && matchPress.notes.length > 0 ? `TELETIPO DE PRENSA DE ESTE PARTIDO (${report.date}): ${matchPress.notes.join(" | ")}` : "", report.pbpHighlights?.formattedDossierBlock ? `HITOS PLAY-BY-PLAY (DATOS INDEXADOS EN VIVO EN PISTA):\n${report.pbpHighlights.formattedDossierBlock}` : "", ``, `ESTAD\xCDSTICAS COLECTIVAS:`, `- VISITANTE ${report.away.name} (${report.away.abbr}, r\xE9cord ${report.away.recordAfter}${report.away.isBackToBack ? ", en back-to-back" : ""}): ${report.away.score} PTS | ${report.away.totals.fgm}/${report.away.totals.fga} TC (${report.away.totals.fgPct}%) | ${report.away.totals.fg3m}/${report.away.totals.fg3a} T3 (${report.away.totals.fg3Pct}%) | ${report.away.totals.ftm}/${report.away.totals.fta} TL | ${report.away.totals.reb} REB (${report.away.totals.oreb} OR) | ${report.away.totals.ast} AST | ${report.away.totals.stl} ROB | ${report.away.totals.blk} TAP | ${report.away.totals.tov} PER | OffRtg ${report.away.totals.offRtg} | eFG% ${report.away.totals.efgPct}% | Pintura: ${report.away.totals.ptsPaint ?? "s/d"} | Contraataque: ${report.away.totals.ptsFastBreak ?? "s/d"} | Tras p\xE9rdida: ${report.away.totals.ptsOffTov ?? "s/d"} | 2\xAA jugada: ${report.away.totals.ptsSecondChance ?? "s/d"} | Banquillo: ${report.away.totals.benchPoints} PTS.`, `- LOCAL ${report.home.name} (${report.home.abbr}, r\xE9cord ${report.home.recordAfter}${report.home.isBackToBack ? ", en back-to-back" : ""}): ${report.home.score} PTS | ${report.home.totals.fgm}/${report.home.totals.fga} TC (${report.home.totals.fgPct}%) | ${report.home.totals.fg3m}/${report.home.totals.fg3a} T3 (${report.home.totals.fg3Pct}%) | ${report.home.totals.ftm}/${report.home.totals.fta} TL | ${report.home.totals.reb} REB (${report.home.totals.oreb} OR) | ${report.home.totals.ast} AST | ${report.home.totals.stl} ROB | ${report.home.totals.blk} TAP | ${report.home.totals.tov} PER | OffRtg ${report.home.totals.offRtg} | eFG% ${report.home.totals.efgPct}% | Pintura: ${report.home.totals.ptsPaint ?? "s/d"} | Contraataque: ${report.home.totals.ptsFastBreak ?? "s/d"} | Tras p\xE9rdida: ${report.home.totals.ptsOffTov ?? "s/d"} | 2\xAA jugada: ${report.home.totals.ptsSecondChance ?? "s/d"} | Banquillo: ${report.home.totals.benchPoints} PTS.`, ``, `PLANTILLA ${report.away.abbr} EN PISTA:`, ...[...report.away.starters, ...report.away.bench].map(formatPlayerDossier), `EXPULSADOS POR 6 FALTAS ${report.away.abbr}: ${report.away.absencesAndDnp.filter((a) => a.statusType === "foul_out").length > 0 ? report.away.absencesAndDnp.filter((a) => a.statusType === "foul_out").map((a) => `#${a.jersey} ${a.name} (${a.minutesPlayed ?? "?"}') — expulsado por seis faltas${a.foulOutPeriod && a.foulOutClock ? ` en el ${a.foulOutPeriod} faltando ${a.foulOutClock}` : ""}`).join("; ") : "Ninguno"}`, `BAJAS M\xC9DICAS / LESIONADOS E INCIDENCIAS EN PISTA ${report.away.abbr}: ${report.away.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague" && a.statusType !== "foul_out").length > 0 ? report.away.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague" && a.statusType !== "foul_out").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Lesionado"} \u2014 ${a.note}]`).join("; ") : "Ninguna baja m\xE9dica ni incidencia registrada"}`, awayRelevantTechDnp.length > 0 ? `ROTACI\xD3N HABITUAL SIN MINUTOS POR DECISI\xD3N T\xC9CNICA ${report.away.abbr}: ${awayRelevantTechDnp.map(formatRelevantDnp).join("; ")}` : "", ``, `PLANTILLA ${report.home.abbr} EN PISTA:`, ...[...report.home.starters, ...report.home.bench].map(formatPlayerDossier), `EXPULSADOS POR 6 FALTAS ${report.home.abbr}: ${report.home.absencesAndDnp.filter((a) => a.statusType === "foul_out").length > 0 ? report.home.absencesAndDnp.filter((a) => a.statusType === "foul_out").map((a) => `#${a.jersey} ${a.name} (${a.minutesPlayed ?? "?"}') — expulsado por seis faltas${a.foulOutPeriod && a.foulOutClock ? ` en el ${a.foulOutPeriod} faltando ${a.foulOutClock}` : ""}`).join("; ") : "Ninguno"}`, `BAJAS M\xC9DICAS / LESIONADOS E INCIDENCIAS EN PISTA ${report.home.abbr}: ${report.home.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague" && a.statusType !== "foul_out").length > 0 ? report.home.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague" && a.statusType !== "foul_out").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Lesionado"} \u2014 ${a.note}]`).join("; ") : "Ninguna baja m\xE9dica ni incidencia registrada"}`, homeRelevantTechDnp.length > 0 ? `ROTACI\xD3N HABITUAL SIN MINUTOS POR DECISI\xD3N T\xC9CNICA ${report.home.abbr}: ${homeRelevantTechDnp.map(formatRelevantDnp).join("; ")}` : "", ``, `DETECTOR OFICIAL DE JUGADORES ESPA\xD1OLES: ${report.spanishPlayersReport.summaryLine}`, `DOBLES-DOBLES Y TRIPLES-DOBLES VERIFICADOS: ${report.milestonesList.length > 0 ? report.milestonesList.map((m) => `${m.type}: ${m.detail}`).join(" | ") : "Ninguno en este encuentro"}`, `PODIO CALCULADO: ${report.away.abbr} (${report.away.podium.map((p) => `${"\u2B50".repeat(p.stars)} #${p.jersey} ${p.name}`).join(" | ")}) // ${report.home.abbr} (${report.home.podium.map((p) => `${"\u2B50".repeat(p.stars)} #${p.jersey} ${p.name}`).join(" | ")})`].filter(Boolean).join("\n");
      const dossier = `<dossier_partido_nba>\n${dossierBody}\n</dossier_partido_nba>`;
      const gameEditorialBlock = buildEditorialDirectivesPromptBlock(editorialCfg, "game");

      // =========================================================================
      // BRANCH A: v1_classic — 100% INTACT ORIGINAL 8-SECTION CLOSED-WORLD ENGINE
      // =========================================================================
      if (gameVersion === "v1_classic") {
        const systemInstruction = [
          "Eres un periodista sénior de prensa deportiva española y scout táctico profesional de la NBA (estilo The Athletic, Gigantes del Basket y NBAManiacs) para RadarNBA.",
          "Tu misión es redactar la crónica de scouting definitiva de este encuentro basándote EXCLUSIVAMENTE en los datos verificados dentro de <dossier_partido_nba> (estadísticas oficiales, pabellón, flujo de marcador, Play-by-Play de NBA.com, teletipo del choque, detector de españoles y podio calculado).",
          "1. REGLAS INQUEBRANTABLES DE RIGOR Y MUNDO CERRADO",
          '- Fidelidad empírica absoluta y jerarquía de fuentes: Usa EXCLUSIVAMENTE las cifras exactas, el pabellón oficial indicado en TÍTULO, los dorsales (#) y los hechos explícitos de <dossier_partido_nba>. Si cualquier dato de TELETIPO DE PRENSA discrepa con el acta numérica o con HITOS PLAY-BY-PLAY, manda SIEMPRE el acta oficial. Jamás inventes puntos, rebotes, parciales, jugadas concretas segundo a segundo (ej. "triple desde la esquina a falta de 2 segundos") ni dorsales que no figuren en PLANTILLA [ABBR] EN PISTA.',
          '- Cortafuegos contra memoria preentrenada y datos externos: Tu memoria interna está desactualizada respecto a la temporada actual. Tienes TERMINANTEMENTE PROHIBIDO mencionar (incluso si aparecieran citados de pasada en TELETIPO DE PRENSA): (a) nombres propios o apodos de entrenadores, asistentes o directivos —usa SIEMPRE "el cuerpo técnico de [Equipo]", "la dirección técnica de [Equipo]" o "la pizarra de [Equipo]"—; (b) antigüedad, edad, rondas de Draft, condición de rookie, contratos, exequipos o traspasos de jugadores; (c) premios pasados, anillos, "vigente campeón" o series de temporadas anteriores; (d) puestos exactos en la tabla clasificatoria (ej. "3º del Este") o próximos rivales del calendario; (e) diagnósticos médicos o plazos de recuperación más allá de lo escrito literalmente en BAJAS MÉDICAS / LESIONADOS E INCIDENCIAS EN PISTA o en el teletipo sobre lo ocurrido hoy en cancha.',
          '- Pulcritud estricta en bajas, expulsiones por faltas y rotación: Distingue escrupulosamente entre bajas médicas/incidencias (BAJAS MÉDICAS / LESIONADOS E INCIDENCIAS EN PISTA), expulsados por 6 faltas (EXPULSADOS POR 6 FALTAS) y rotación habitual sin minutos (ROTACIÓN HABITUAL SIN MINUTOS POR DECISIÓN TÉCNICA). Jamás llames "lesionado" a un expulsado por faltas ni a un descarte por decisión técnica. Si no existe bloque de rotación habitual sin minutos, ignora a los descartes de fondo de banquillo o G-League. En expulsiones por 6 faltas: si EXPULSADOS POR 6 FALTAS incluye cuarto y reloj exactos (ej. "en el OT2 faltando 0:16"), cópialos LITERALMENTE con formato "**#24 Nombre** (42\') fue expulsado por seis faltas en el OT2 faltando 0:16"; si NO incluye cuarto/reloj, cita solo los minutos jugados sin restar 48 menos minutos ni inventar relojes.',
          "2. EXPLOTACIÓN PROFUNDA DEL PLAY-BY-PLAY (PBP), BUZZER BEATERS Y CAREER HIGHS",
          "- Anatomía completa del partido (GUION_Y_QUIEBRE): No te limites al marcador por cuartos. Utiliza FLUJO DE MARCADOR y HITOS PLAY-BY-PLAY para reconstruir cómo mutó el choque: alternancias en el liderato, máximas ventajas, parciales demoledores que forzaron tiempos muertos técnicos, rachas anotadoras y problemas tempranos de faltas que alteraron las rotaciones.",
          "- Gestión del clutch: Si HITOS PLAY-BY-PLAY incluye el bloque clutch (últimos 2 minutos con margen ≤5 pts), sintetiza con precisión táctica quién asumió los tiros decisivos, qué tipo de acciones ejecutó y qué pérdidas o rebotes condenaron al derrotado en GUION_Y_QUIEBRE o FOCO_ESPECIAL, sin enumerar listas mecánicas ni inventar emparejamientos defensivos no recogidos en el acta.",
          "- Canasta ganadora (BB / GW): Menciona Buzzer Beaters o Game Winners (jugador, dorsal #, acción de tiro y reloj exacto) en TITULAR_PRENSA, ENTRADILLA y GUION_Y_QUIEBRE/FOCO_ESPECIAL ÚNICAMENTE si <dossier_partido_nba> incluye CANASTA DECISIVA VERIFICADA (BUZZER BEATER / GAME WINNER). Si no existe ese bloque, NO hables de buzzer beaters ni de game winners.",
          "- Career Highs verificados: Menciona un récord personal de carrera (Career High) en ENTRADILLA y VEREDICTO_E_HITOS (o FOCO_ESPECIAL) ÚNICAMENTE si <dossier_partido_nba> incluye RÉCORD PERSONAL DE CARRERA VERIFICADO (CAREER HIGH). Si no figura ese bloque, PROHIBIDO afirmar que algún jugador batió su máximo de carrera.",
          "3. ESTILO PERIODÍSTICO, PROSA SELECTIVA Y JERARQUÍA EN NEGRITA (**...**)",
          '- Redacción natural sin volcado telegráfico ni relleno: Escribe en español de España ágil y analítico, con léxico táctico auténtico (espaciado, pintura, bloqueo directo, ajuste tras descanso, transición defensiva, segunda unidad, rebote ofensivo, clutch). El dato sirve al relato: evita atiborrar una misma frase con 6 o 7 métricas seguidas entre paréntesis; selecciona las 2 o 3 cifras más reveladoras por argumento e intégralas con fluidez. Prohibido usar "En conclusión", "Cabe destacar", "Sin lugar a dudas", "Sin duda", "dar un golpe sobre la mesa", "arma de destrucción masiva", listas con viñetas, tablas Markdown o metatexto. Distribuye los datos armónicamente para NO repetir la misma cifra o secuencia exacta en dos secciones distintas.',
          '- Gramática y anglicismos técnicos NBA: Jamás dupliques el artículo delante de franquicias que empiezan por "Los" (escribe siempre **Los Angeles Lakers** o los **Lakers**, nunca "los Los Angeles Lakers"). Nunca traduzcas literalmente anglicismos técnicos: escribe siempre "back-to-back" (jamás "espalda con espalda" ni variantes), "clutch", "pick and roll", "box score" o "play-in".',
          '- Jerarquía estricta de negritas (**...**): En todos los párrafos del cuerpo (ENTRADILLA, GUION_Y_QUIEBRE, PIZARRA_Y_ROTACION, cuerpo de FOCO_ESPECIAL, FACTOR_X_Y_LIDERES, ESPANOLES —excepto si es una sola frase confirmando ausencia de españoles— y VEREDICTO_E_HITOS), utiliza negrita Markdown (**texto**) EXCLUSIVAMENTE para: (a) nombres de jugadores con su dorsal cuando lo cites (ej. **#15 Nikola Jokić**), (b) nombres o apodos oficiales de equipos/franquicias (ej. **Boston Celtics**, **Knicks**), y (c) UNA sola idea táctica clave por párrafo (frase breve de 4 a 10 palabras que sintetice la clave causal, ej. **colapsando la pintura tras cada bloqueo directo**). PROHIBIDO poner negritas en cifras o estadísticas sueltas (como "49 puntos", "12 rebotes" o "58.4%"), marcadores, TITULAR_PRENSA ni antes de || en FOCO_ESPECIAL.',
          "4. ESTRUCTURA EXACTA DE SALIDA (8 ETIQUETAS EN MAYÚSCULAS)",
          "===TITULAR_PRENSA===",
          "(Titular periodístico vibrante y directo de 1 línea sobre el ángulo táctico o protagonista del partido, sin # ni **).",
          "===ENTRADILLA===",
          "(2 líneas sintetizando la tesis táctica del encuentro y el protagonista principal, aplicando la regla de negritas).",
          "===GUION_Y_QUIEBRE===",
          "(2 párrafos fluidos: evolución por cuartos (PARCIALES POR CUARTOS), ritmo (RITMO DEL ENCUENTRO) comparado con la media NBA, cambios de líder, parciales de FLUJO DE MARCADOR y HITOS PLAY-BY-PLAY que forzaron tiempos muertos, problemas de faltas relevantes y el punto exacto donde se rompió o decidió el choque en el clutch).",
          "===PIZARRA_Y_ROTACION===",
          "(1 o 2 párrafos de scouting colectivo profundo según la riqueza del encuentro —sin paja si fue un choque unilateral—: cruza la eficiencia ofensiva (OffRtg y eFG%) con el origen de la anotación (puntos en la pintura frente al volumen y acierto en el triple), el castigo tras pérdida y en contraataque, las segundas oportunidades por rebote ofensivo, el desgaste por back-to-back si aplica, el diferencial de las segundas unidades y el impacto real de las bajas médicas, descartes técnicos o expulsiones con su cuarto/reloj, seleccionando siempre las cifras clave con prosa limpia).",
          "===FOCO_ESPECIAL===",
          '(Si el partido tuvo un ángulo singular —prórroga, remontada de gran calibre, exhibición histórica, Career High destacado, cortocircuito en el clutch, clínica defensiva o incidencia física en pista recogida en el teletipo—, escribe en una línea el título corto sin ** seguido de || y 1 párrafo analítico con la regla de negritas: ej. "Supervivencia en la prórroga || Texto...". Si fue un guion convencional sin ángulo extra, escribe únicamente: NINGUNO).',
          "===FACTOR_X_Y_LIDERES===",
          "(1 o 2 párrafos apoyados en PODIO CALCULADO (GmSc) y las estadísticas individuales: contrasta el duelo entre los referentes de ambos equipos y destaca quién emergió como Factor X inesperado desde el quinteto o el banquillo para inclinar la balanza, citando siempre dorsales # y 2-3 cifras clave por protagonista sin repetir lo ya contado en el guion).",
          "===ESPANOLES===",
          "(Si DETECTOR OFICIAL DE JUGADORES ESPAÑOLES confirma participación o presencia en convocatoria: 1 párrafo analizando sus minutos, serie de tiro, impacto en pista o situación exacta; si NO los hay: UNA SOLA FRASE breve, limpia y directa confirmándolo).",
          "===VEREDICTO_E_HITOS===",
          "(1 o 2 párrafos integrando con naturalidad los registros de DOBLES-DOBLES Y TRIPLES-DOBLES VERIFICADOS y Career Highs verificados —si constan— y cerrando con el veredicto estrictamente táctico del scout sobre qué certezas o señales de alarma deja este partido para ambos equipos).",
          "CHECKLIST FINAL INTERNO (verificación mental antes de emitir; PROHIBIDO imprimir este checklist ni ningún texto adicional tras VEREDICTO_E_HITOS): ¿Cero nombres de entrenadores/directivos (ni siquiera del teletipo), cero datos biográficos/clasificación, cero Career Highs o Buzzer Beaters sin bloque verificado y cero \"Los Los Angeles\" o \"espalda con espalda\"? ¿Cero cifras sueltas en negrita y cero repetición de los mismos datos entre secciones? ¿Dorsales # incluidos junto a los nombres de jugadores en negrita?",
          gameEditorialBlock,
        ].filter(Boolean).join("\n");
        try {
          const cascadeBudgetMs = 48000;
          const geminiCall = generateWithGeminiCascade({
            systemInstruction,
            contents: dossier,
            seedSources,
            isServerless,
            budgetMs: cascadeBudgetMs,
            enableGoogleSearch: false,
          });
          const cascadeTimer = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout ${cascadeBudgetMs}ms en cascada IA`)), cascadeBudgetMs + 500)
          );
          const { text: rawText, sources, model: modelUsed } = (await Promise.race([geminiCall, cascadeTimer])) as any;
          const verifiedFoulOuts = [...report.away.absencesAndDnp, ...report.home.absencesAndDnp].filter((a) => a.statusType === "foul_out");
          const safeRawText = reconcileVerifiedFoulOutTimings(sanitizeUnverifiedCoachClaims(rawText, verifiedGamePlayers), verifiedFoulOuts)
            .replace(/\n+(?:CHECKLIST FINAL[^\n]*[\s\S]*)$/i, "")
            .trim();
          const parsed = parseDelimitedSections(safeRawText, ["TITULAR_PRENSA", "ENTRADILLA", "GUION_Y_QUIEBRE", "PIZARRA_Y_ROTACION", "FOCO_ESPECIAL", "FACTOR_X_Y_LIDERES", "ESPANOLES", "VEREDICTO_E_HITOS"]);
          const fallback = buildDeterministicGameNarrative(report, "v1_classic");
          const payload = {
            eventId: report.eventId,
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            engineMode: "gemini_search",
            chronicleVersion: "v1_classic" as const,
            groundingUsed: false,
            modelUsed,
            generationTimeMs: Date.now() - startTime,
            pressHeadline: parsed.TITULAR_PRENSA && parsed.TITULAR_PRENSA.length > 12 ? stripInlineWrapper(parsed.TITULAR_PRENSA) : fallback.pressHeadline,
            pressLead: parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25 ? parsed.ENTRADILLA : fallback.pressLead,
            gameFlowSection: parsed.GUION_Y_QUIEBRE && parsed.GUION_Y_QUIEBRE.length > 60 ? parsed.GUION_Y_QUIEBRE : fallback.gameFlowSection,
            chalkboardSection: parsed.PIZARRA_Y_ROTACION && parsed.PIZARRA_Y_ROTACION.length > 60 ? parsed.PIZARRA_Y_ROTACION : fallback.chalkboardSection,
            dynamicSpotlight: parseSpotlight(parsed.FOCO_ESPECIAL, fallback.dynamicSpotlight),
            xFactorSection: parsed.FACTOR_X_Y_LIDERES && parsed.FACTOR_X_Y_LIDERES.length > 50 ? parsed.FACTOR_X_Y_LIDERES : fallback.xFactorSection,
            spanishSection: parsed.ESPANOLES && parsed.ESPANOLES.length > 12 ? parsed.ESPANOLES : fallback.spanishSection,
            verdictSection: parsed.VEREDICTO_E_HITOS && parsed.VEREDICTO_E_HITOS.length > 45 ? parsed.VEREDICTO_E_HITOS : fallback.verdictSection,
            sources,
          };
          const persistTtlMs = report.seasonLabel === "2026-27" ? 7 * 24 * 60 * 60 * 1e3 : 30 * 24 * 60 * 60 * 1e3;
          await writeSharedPersistedNarrative(cacheKey, payload, persistTtlMs);
          return payload;
        } catch (err) {
          const rawErrStr = String(err instanceof Error ? err.message : err || "timeout/offline");
          const cleanReason = rawErrStr.replace(/[\{\}\"\:]/g, " ").replace(/\s+/g, " ").slice(0, 160);
          console.info(`[RadarNBA] Motor determinista v1 activo para ${eventId} -> ${cleanReason}`);
          const isQuota = isQuotaExhaustedError(err) || cleanReason.includes("cuota_agotada_429");
          const isOverload = isTransientOverloadError(err) || cleanReason.includes("alta_demanda_503");
          const fallback = buildDeterministicGameNarrative(report, "v1_classic");
          fallback.generationTimeMs = Date.now() - startTime;
          fallback.missingApiKey = false;
          fallback.quotaExhausted = isQuota;
          fallback.overload503 = isOverload;
          fallback.fallbackReason = isQuota
            ? `quota_exhausted_429 (${cleanReason})`
            : isOverload
            ? `overload_503 (${cleanReason})`
            : cleanReason;
          reportMemoryCache.set(cacheKey, {
            expiresAt: Date.now() + (isQuota ? 5 * 60 * 1e3 : isOverload ? 30 * 1e3 : 2 * 60 * 1e3),
            data: fallback,
          });
          return fallback;
        }
      }

      // =========================================================================
      // BRANCH B: v2_tactical — HYBRID TACTICAL ENGINE (ONLY FOR INDIVIDUAL GAMES)
      // Four Factors + PBP Matchup Mining + Full AP/ESPN Recap + Google Search
      // =========================================================================
      const tacticalProfile = computeGameTacticalProfile(report);
      const tacticalBlock = [
        `<perfil_tactico_four_factors>`,
        `FACTOR DECISIVO (FOUR FACTORS): ${tacticalProfile.decisiveFactorLabel} — ${tacticalProfile.decisiveFactorSummary}`,
        `- ${tacticalProfile.away.abbr} (Visitante): eFG% ${tacticalProfile.away.efgPct}% | TOV% ${tacticalProfile.away.tovPct}% | OREB% ${tacticalProfile.away.orebPct}% | FTr ${tacticalProfile.away.ftRate}% | AST% ${tacticalProfile.away.astPct}% (canastas asistidas) | 3PAr ${tacticalProfile.away.threePointRatePct}% | Pintura ${tacticalProfile.away.ptsPaint ?? "s/d"} pts${tacticalProfile.away.paintSharePct !== null ? ` (${tacticalProfile.away.paintSharePct}% del total)` : ""}`,
        `- ${tacticalProfile.home.abbr} (Local): eFG% ${tacticalProfile.home.efgPct}% | TOV% ${tacticalProfile.home.tovPct}% | OREB% ${tacticalProfile.home.orebPct}% | FTr ${tacticalProfile.home.ftRate}% | AST% ${tacticalProfile.home.astPct}% (canastas asistidas) | 3PAr ${tacticalProfile.home.threePointRatePct}% | Pintura ${tacticalProfile.home.ptsPaint ?? "s/d"} pts${tacticalProfile.home.paintSharePct !== null ? ` (${tacticalProfile.home.paintSharePct}% del total)` : ""}`,
        `QUINTETOS DE CIERRE DETECTADOS (ÚLTIMOS MINUTOS PBP): ${tacticalProfile.away.abbr}: ${tacticalProfile.closingLineupAway.join(", ")} | ${tacticalProfile.home.abbr}: ${tacticalProfile.closingLineupHome.join(", ")}`,
        tacticalProfile.defensiveDuels.length > 0
          ? `DUELOS DEFENSIVOS DIRECTOS EN PLAY-BY-PLAY (TAPONES / ROBOS VERIFICADOS):\n${tacticalProfile.defensiveDuels.map((d) => `  * ${d}`).join("\n")}`
          : `DUELOS DEFENSIVOS DIRECTOS EN PLAY-BY-PLAY: Sin pares explícitos indexados (apóyate en Four Factors, crónica AP/ESPN y búsqueda web si detalla emparejamientos).`,
        `</perfil_tactico_four_factors>`,
      ].join("\n");

      const apEspnBlock = espnRecap
        ? [
            `<cronica_oficial_ap_espn>`,
            espnRecap.headline ? `TITULAR AP/ESPN: ${espnRecap.headline}` : "",
            espnRecap.storyText,
            `</cronica_oficial_ap_espn>`,
          ]
            .filter(Boolean)
            .join("\n")
        : "";

      const v2Dossier = [dossier, tacticalBlock, apEspnBlock].filter(Boolean).join("\n\n");

      const v2SystemInstruction = [
        "Eres un analista táctico sénior de la NBA y periodista deportivo español de referencia (estilo Zach Lowe, The Athletic y Gigantes del Basket) para RadarNBA.",
        `Tu misión es redactar la crónica táctica definitiva (v2 Híbrida) del partido ${report.away.name} (${report.away.abbr}) vs ${report.home.name} (${report.home.abbr}) del ${report.date} (${report.away.score}-${report.home.score}), combinando: (1) <dossier_partido_nba> y <perfil_tactico_four_factors> (autoridad numérica absoluta), (2) <cronica_oficial_ap_espn> si está presente, y (3) búsqueda web en vivo sobre crónicas post-partido y beat writers de este encuentro concreto (${report.date}) para identificar emparejamientos defensivos reales, esquemas (zona, drop, switch, blitz/2x1, ayudas) y declaraciones verificadas post-partido.`,
        "1. JERARQUÍA DE RIGOR Y CERO INVENCIÓN",
        "- Autoridad absoluta del acta oficial: Todas las cifras, marcadores, dorsales (#), bajas médicas y expulsiones deben coincidir al 100% con <dossier_partido_nba> y <perfil_tactico_four_factors>. Si una crónica externa o búsqueda web discrepa en un dato numérico, MANDA SIEMPRE el acta oficial.",
        "- Cero invención táctica ni de citas: Solo describe ajustes o esquemas específicos (ej. defensa en zona 2-3, blitz sobre el manejador, defender en drop o emparejamiento 1v1 concreto) si están respaldados por <perfil_tactico_four_factors>, <cronica_oficial_ap_espn> o la búsqueda web de este partido. Jamás inventes citas ni declaraciones post-partido: si no encuentras citas reales verificadas de jugadores/protagonistas en <cronica_oficial_ap_espn> o en la búsqueda web de este partido, escribe literalmente NINGUNA en ===VOCES_VESTUARIO===.",
        '- Pulcritud en bajas, Career Highs y Buzzer Beaters: Distingue entre bajas médicas, expulsados por 6 faltas (copiando cuarto/reloj literales si constan) y decisión técnica. Menciona Buzzer Beaters/Game Winners SOLO si existe CANASTA DECISIVA VERIFICADA, y Career Highs SOLO si existe RÉCORD PERSONAL DE CARRERA VERIFICADO. No menciones puestos exactos de tabla clasificatoria ni próximos rivales.',
        "2. PROFUNDIDAD TÁCTICA CAUSAL Y CONCISIÓN (CERO REPETICIÓN)",
        "- Explica el PORQUÉ de la victoria y de la derrota con claridad para todo público: qué rompió el partido (Four Factors, ritmo, volumen exterior vs pintura, pérdidas castigadas, rebote ofensivo, quintetos de cierre) y cómo respondió o colapsó el rival.",
        "- Prosa más incisiva y concisa: cada sección aporta un ángulo distinto SIN repetir cifras ni frases ya dichas en bloques anteriores. Evita volcar listas telegráficas de 6 números seguidos; integra 2 o 3 datos reveladores por argumento.",
        '- Español natural y negritas limpias: Jamás escribas "los Los Angeles Lakers" ni "espalda con espalda" (usa "back-to-back", "clutch", "pick and roll", "drop", "switch"). Prohibido usar clichés ("En conclusión", "Cabe destacar", "Sin lugar a dudas", "dar un golpe sobre la mesa"). En párrafos de prosa, usa **negrita** únicamente para jugadores con dorsal (**#15 Nikola Jokić**), equipos (**Denver Nuggets**, **Nuggets**) y UNA sola idea táctica clave breve por párrafo. Cero cifras sueltas en negrita.',
        "3. ESTRUCTURA EXACTA DE SALIDA (11 ETIQUETAS EN MAYÚSCULAS)",
        "===TITULAR_PRENSA===",
        "(Titular periodístico conciso y potente de 1 línea con el ángulo táctico decisivo, sin # ni **).",
        "===ENTRADILLA===",
        "(2 líneas concisas resumiendo por qué ganó el vencedor y cuál fue la clave táctica principal, aplicando negritas).",
        "===CLAVES_TACTICAS===",
        "(Exactamente 3 líneas, una por clave causal de por qué ganó/perdió cada equipo, formato exacto: Título corto sin ** (3-7 palabras) || Explicación concisa de 1 a 2 frases con dato exacto que demuestre causa y efecto. Sin numeración ni viñetas).",
        "===GUION_Y_QUIEBRE===",
        "(1 o 2 párrafos ágiles y concisos: evolución por cuartos, ritmo, cambios de líder, parcial decisivo que forzó tiempos muertos y ejecución del clutch/tramo final).",
        "===PIZARRA_Y_ROTACION===",
        "(1 o 2 párrafos concisos: perfil ofensivo —pintura vs triple, tiros asistidos AST%, transición, rebote ofensivo—, impacto del banquillo, desgaste back-to-back si aplica y bajas/expulsiones relevantes).",
        "===EMPAREJAMIENTOS_Y_DEFENSA===",
        "(1 o 2 párrafos de lectura táctica específica: cómo defendió cada equipo las fortalezas rivales —protección de aro, persecución del triple, ayudas/traps, presión al balón—, emparejamientos defensivos destacados apoyados en DUELOS DEFENSIVOS DIRECTOS PBP, crónica AP/ESPN y búsqueda web, y lectura de los quintetos de cierre).",
        "===FOCO_ESPECIAL===",
        '(Si el choque tuvo un ángulo singular —prórroga, remontada, Buzzer Beater/Game Winner verificado, Career High verificado, clínica defensiva o incidencia física—, escribe: Título corto sin ** || 1 párrafo conciso. Si no aplica, escribe únicamente: NINGUNO).',
        "===FACTOR_X_Y_LIDERES===",
        "(1 o 2 párrafos concisos comparando a los líderes del PODIO CALCULADO y destacando el Factor X que desequilibró el guion, con dorsales # y sin repetir datos ya citados).",
        "===ESPANOLES===",
        "(Si DETECTOR OFICIAL DE JUGADORES ESPAÑOLES confirma presencia: 1 párrafo conciso con su impacto; si no los hay: UNA sola frase sobria confirmándolo).",
        "===VOCES_VESTUARIO===",
        "(Si <cronica_oficial_ap_espn> o la búsqueda web contienen declaraciones reales post-partido de jugadores o protagonistas de este partido, incluye 1 o 2 líneas con formato exacto: Nombre completo | ABBR | Cita traducida con fidelidad al español natural sin comillas externas | Nombre del medio/fuente ej. AP/ESPN. Prioriza citas que expliquen el plan táctico, la defensa o el momento decisivo. Si NO hay declaraciones reales verificadas en las fuentes, escribe ÚNICAMENTE: NINGUNA).",
        "===VEREDICTO_E_HITOS===",
        "(1 párrafo final conciso integrando dobles-dobles/triples-dobles o Career Highs verificados y cerrando con la conclusión táctica que deja el partido para ambos equipos).",
        gameEditorialBlock,
      ].filter(Boolean).join("\n");

      try {
        const cascadeBudgetMs = 52000;
        const geminiCall = generateWithGeminiCascade({
          systemInstruction: v2SystemInstruction,
          contents: v2Dossier,
          seedSources,
          isServerless,
          budgetMs: cascadeBudgetMs,
          enableGoogleSearch: true,
        });
        const cascadeTimer = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ${cascadeBudgetMs}ms en cascada IA v2`)), cascadeBudgetMs + 500)
        );
        const { text: rawText, sources, model: modelUsed, groundingUsed } = (await Promise.race([geminiCall, cascadeTimer])) as any;
        const verifiedFoulOuts = [...report.away.absencesAndDnp, ...report.home.absencesAndDnp].filter((a) => a.statusType === "foul_out");
        const safeRawText = reconcileVerifiedFoulOutTimings(rawText, verifiedFoulOuts)
          .replace(/\n+(?:CHECKLIST FINAL[^\n]*[\s\S]*)$/i, "")
          .trim();
        const parsed = parseDelimitedSections(safeRawText, [
          "TITULAR_PRENSA",
          "ENTRADILLA",
          "CLAVES_TACTICAS",
          "GUION_Y_QUIEBRE",
          "PIZARRA_Y_ROTACION",
          "EMPAREJAMIENTOS_Y_DEFENSA",
          "FOCO_ESPECIAL",
          "FACTOR_X_Y_LIDERES",
          "ESPANOLES",
          "VOCES_VESTUARIO",
          "VEREDICTO_E_HITOS",
        ]);
        const fallback = buildDeterministicGameNarrative(report, "v2_tactical");
        const parsedQuotes = parsePostgameQuotes(parsed.VOCES_VESTUARIO || "");
        const payload = {
          eventId: report.eventId,
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          engineMode: "gemini_search",
          chronicleVersion: "v2_tactical" as const,
          groundingUsed: Boolean(groundingUsed || espnRecap),
          modelUsed,
          generationTimeMs: Date.now() - startTime,
          pressHeadline: parsed.TITULAR_PRENSA && parsed.TITULAR_PRENSA.length > 12 ? stripInlineWrapper(parsed.TITULAR_PRENSA) : fallback.pressHeadline,
          pressLead: parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25 ? parsed.ENTRADILLA : fallback.pressLead,
          tacticalKeys: parseTacticalKeys(parsed.CLAVES_TACTICAS || "", fallback.tacticalKeys || []),
          gameFlowSection: parsed.GUION_Y_QUIEBRE && parsed.GUION_Y_QUIEBRE.length > 60 ? parsed.GUION_Y_QUIEBRE : fallback.gameFlowSection,
          chalkboardSection: parsed.PIZARRA_Y_ROTACION && parsed.PIZARRA_Y_ROTACION.length > 60 ? parsed.PIZARRA_Y_ROTACION : fallback.chalkboardSection,
          defensiveMatchupsSection:
            parsed.EMPAREJAMIENTOS_Y_DEFENSA && parsed.EMPAREJAMIENTOS_Y_DEFENSA.length > 50
              ? parsed.EMPAREJAMIENTOS_Y_DEFENSA
              : fallback.defensiveMatchupsSection,
          tacticalProfile,
          postgameQuotes: parsedQuotes,
          dynamicSpotlight: parseSpotlight(parsed.FOCO_ESPECIAL, fallback.dynamicSpotlight),
          xFactorSection: parsed.FACTOR_X_Y_LIDERES && parsed.FACTOR_X_Y_LIDERES.length > 50 ? parsed.FACTOR_X_Y_LIDERES : fallback.xFactorSection,
          spanishSection: parsed.ESPANOLES && parsed.ESPANOLES.length > 12 ? parsed.ESPANOLES : fallback.spanishSection,
          verdictSection: parsed.VEREDICTO_E_HITOS && parsed.VEREDICTO_E_HITOS.length > 45 ? parsed.VEREDICTO_E_HITOS : fallback.verdictSection,
          sources,
        };
        const persistTtlMs = report.seasonLabel === "2026-27" ? 7 * 24 * 60 * 60 * 1e3 : 30 * 24 * 60 * 60 * 1e3;
        await writeSharedPersistedNarrative(cacheKey, payload, persistTtlMs);
        return payload;
      } catch (err) {
        const rawErrStr = String(err instanceof Error ? err.message : err || "timeout/offline");
        const cleanReason = rawErrStr.replace(/[\{\}\"\:]/g, " ").replace(/\s+/g, " ").slice(0, 160);
        console.info(`[RadarNBA] Motor determinista v2 activo para ${eventId} -> ${cleanReason}`);
        const isQuota = isQuotaExhaustedError(err) || cleanReason.includes("cuota_agotada_429");
        const isOverload = isTransientOverloadError(err) || cleanReason.includes("alta_demanda_503");
        const fallback = buildDeterministicGameNarrative(report, "v2_tactical");
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = false;
        fallback.quotaExhausted = isQuota;
        fallback.overload503 = isOverload;
        fallback.sources = seedSources;
        fallback.fallbackReason = isQuota
          ? `quota_exhausted_429 (${cleanReason})`
          : isOverload
          ? `overload_503 (${cleanReason})`
          : cleanReason;
        reportMemoryCache.set(cacheKey, {
          expiresAt: Date.now() + (isQuota ? 5 * 60 * 1e3 : isOverload ? 30 * 1e3 : 2 * 60 * 1e3),
          data: fallback,
        });
        return fallback;
      }
    })();
    reportInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      reportInflight.delete(cacheKey);
    }
  }
  function buildDeterministicDailyChronicle(gd, spanishNightNotes, matchEnrichments = new Map(), tripleDoublesNight = [], dailyHeroicClinchers = [], careerHighsNight = [], chronicleVersion: "v1_classic" | "v2_tactical" = "v1_classic") {
    const mvp = gd.mvpOfTheNight;
    const stmt = gd.statementTeamWin;
    const topExp = gd.topExplosion;
    const ptsDiff = gd.pulse.avgTotalPoints - gd.pulse.leagueAvgTotalPoints;
    const brokenList = gd.streakShifts.filter((s) => s.status === "broken");
    const extendedList = gd.streakShifts.filter((s) => s.status === "extended");

    const formatGameScoreline = (m) => {
      const winner = m.away.isWinner ? m.away : m.home;
      const loser = m.away.isWinner ? m.home : m.away;
      return `**${winner.name}** ${winner.score}-${loser.score} ante **${loser.name}**`;
    };

    const sortedByDrama = [...(gd.matchups || [])].sort((a, b) => a.margin - b.margin || b.totalPoints - a.totalPoints);
    const headlineGame = sortedByDrama[0];
    const hWin = headlineGame ? (headlineGame.away.isWinner ? headlineGame.away : headlineGame.home) : null;
    const hLose = headlineGame ? (headlineGame.away.isWinner ? headlineGame.home : headlineGame.away) : null;
    const leadClincher = dailyHeroicClinchers.length > 0 ? dailyHeroicClinchers[0] : null;
    const headline = leadClincher
      ? `${leadClincher.playerName} firma un ${leadClincher.shotType === "buzzer_beater" ? "Buzzer Beater sobre la bocina" : "Game Winner decisivo"} en una jornada de ${gd.pulse.gamesCount} partidos`
      : mvp
      ? `${mvp.playerName} lidera con ${mvp.points} puntos una jornada de ${gd.pulse.gamesCount} partidos (${gd.pulse.avgTotalPoints.toFixed(1)} pts de media)`
      : stmt
      ? `${stmt.teamName} marca el techo colectivo (${stmt.scoreDisplay}) en una jornada de ${gd.pulse.gamesCount} encuentros`
      : headlineGame && hWin && hLose
      ? `${hWin.shortName} resuelve el pulso de la noche (${hWin.score}-${hLose.score}) en ${gd.pulse.gamesCount} duelos`
      : `Radiografía táctica y scouting completo de los ${gd.pulse.gamesCount} partidos de la jornada NBA`;

    const roadLabel = gd.pulse.roadWinsCount === 1 ? "victoria visitante" : "victorias visitantes";
    const closeLabel = gd.pulse.closeGamesCount === 1 ? "final apretado" : "finales apretados";
    const blowLabel = gd.pulse.blowoutsCount === 1 ? "triunfo" : "triunfos";
    const clincherLeadTail = dailyHeroicClinchers.length > 0
      ? ` El clímax de la fecha llevó la firma de ${dailyHeroicClinchers.slice(0, 2).map((hc) => `**${hc.playerName}** (${hc.teamAbbr}), autor de un ${hc.shotType === "buzzer_beater" ? "Buzzer Beater sobre la bocina (BB)" : `Game Winner faltando ${hc.clock} (GW)`} ante **${hc.opponentAbbr}**`).join(" y ")}.`
      : "";
    const lead = `La cartelera del ${gd.selectedDate} reunió ${gd.pulse.gamesCount} partidos con un promedio de ${gd.pulse.avgTotalPoints.toFixed(1)} puntos combinados (${ptsDiff >= 0 ? `+${ptsDiff.toFixed(1)}` : ptsDiff.toFixed(1)} frente a los ${gd.pulse.leagueAvgTotalPoints.toFixed(1)} de media NBA) y un ritmo de ${gd.pulse.avgPace.toFixed(1)} posesiones. **${gd.pulse.roadWinsCount} ${roadLabel}, ${gd.pulse.closeGamesCount} ${closeLabel} (≤5 pts) y ${gd.pulse.blowoutsCount} ${blowLabel} por ≥15 tantos** retrataron una noche de marcados contrastes entre exhibiciones individuales y cerrojos defensivos.${clincherLeadTail}`;

    const dynamicSections = [];

    // Capítulo 1: Foco principal en el partido más dramático / exhibición MVP con narrativa táctica limpia
    const focusMatch = (mvp && gd.matchups.find((m) => m.away.abbr === mvp.teamAbbr || m.home.abbr === mvp.teamAbbr)) || sortedByDrama[0];
    if (focusMatch) {
      const enr = matchEnrichments.get(focusMatch.eventId);
      const winner = focusMatch.away.isWinner ? focusMatch.away : focusMatch.home;
      const loser = focusMatch.away.isWinner ? focusMatch.home : focusMatch.away;
      const wLog = enr?.winnerLog;
      const lLog = enr?.loserLog;
      const wTop = winner.topPlayer;
      const lTop = loser.topPlayer;
      const pbp = enr?.pbp;

      const p1Parts = [
        `El foco principal de la noche se detuvo en el duelo entre **${winner.name}** y **${loser.name}**, cerrado por ${winner.score}-${loser.score} a favor de **${winner.shortName}** tras imponer un ritmo de ${focusMatch.pace.toFixed(1)} posesiones.`
      ];
      if (wLog && lLog) {
        p1Parts.push(
          `La diferencia estuvo en la claridad con la que **${winner.shortName}** seleccionó sus lanzamientos hasta firmar un ${wLog.efgPct.toFixed(1)}% de acierto efectivo, frente al ${lLog.efgPct.toFixed(1)}% de su rival. A esa ventaja en eficacia se sumó **una gestión mucho más limpia del balón (${wLog.tov} pérdidas por ${lLog.tov} del oponente)** y un pulso en el rebote favorable por ${wLog.reb} a ${lLog.reb} que multiplicó las segundas opciones.`
        );
      }
      if (pbp?.keyRun?.summary) {
        p1Parts.push(`El punto de inflexión llegó con el ${pbp.keyRun.summary}, tramo que terminó por inclinar el guion del encuentro.`);
      }

      const p2Parts = [];
      if (wTop) {
        p2Parts.push(
          `Sobre la pista, **${wTop.playerName}** marcó el pulso para **${winner.shortName}** con ${wTop.points} puntos y ${wTop.assists} asistencias, acertando ${wTop.fgm} de sus ${wTop.fga} tiros de campo y elevando su producción claramente por encima de su media habitual (${wTop.ptsBaselineAvg.toFixed(1)} tantos).`
        );
      }
      if (lTop) {
        p2Parts.push(
          `En el bando de **${loser.shortName}**, **${lTop.playerName}** sostuvo las opciones visitantes con ${lTop.points} puntos y ${lTop.rebounds} rebotes${pbp?.clutchExecution?.summaryNarrative ? `, pero ${pbp.clutchExecution.summaryNarrative.charAt(0).toLowerCase()}${pbp.clutchExecution.summaryNarrative.slice(1)}.` : ", insuficiente ante **la mayor solidez colectiva y control de posesiones del vencedor**."}`
        );
      }

      dynamicSections.push({
        kicker: "Foco Principal",
        title: `${winner.shortName} impone su guion en el ${winner.score}-${loser.score}`,
        body: `${p1Parts.join(" ")}\n\n${p2Parts.join(" ") || (focusMatch.keyTakeawaysSimple || []).join(" ")}`,
      });
    }

    // Capítulo 2: Tendencia colectiva / contraste defensivo y economía de posesiones
    const stmtMatch = stmt ? gd.matchups.find((m) => m.away.abbr === stmt.teamAbbr || m.home.abbr === stmt.teamAbbr) : sortedByDrama[sortedByDrama.length - 1];
    if (stmtMatch) {
      const enr = matchEnrichments.get(stmtMatch.eventId);
      const winner = stmtMatch.away.isWinner ? stmtMatch.away : stmtMatch.home;
      const loser = stmtMatch.away.isWinner ? stmtMatch.home : stmtMatch.away;
      const wLog = enr?.winnerLog;
      const lLog = enr?.loserLog;
      const lSeasonAvg = enr?.loserAvgPtsFor || 0;
      const lVsAvg = lSeasonAvg > 0 ? loser.score - lSeasonAvg : 0;

      const c2p1 = wLog && lLog
        ? `Más allá de los marcadores ajustados, la exhibición de solidez atrás llevó la firma de **${winner.name}**, que doblegó a **${loser.name}** por ${winner.score}-${loser.score}. La defensa de **${winner.shortName}** dejó a su adversario en ${loser.score} puntos${lSeasonAvg > 0 ? ` (${lVsAvg < 0 ? `${Math.abs(lVsAvg).toFixed(1)} por debajo` : `${lVsAvg.toFixed(1)} por encima`} de su promedio de ${lSeasonAvg.toFixed(1)})` : ""}, **ahogando sus líneas de tiro hasta un discreto ${lLog.fgPct.toFixed(1)}% de campo** gracias a un despliegue de ${wLog.stl + wLog.blk} acciones defensivas entre robos y tapones.`
        : `En el plano colectivo, **${winner.name}** abrió brecha frente a **${loser.name}** (${winner.score}-${loser.score}) apoyado en un diferencial neto de +${winner.netRtg.toFixed(1)} y **una notable disciplina en ambos tableros**.`;

      const closeMatches = gd.matchups.filter((m) => m.margin <= 6);
      const avgWinTov = round1(gd.matchups.reduce((acc, m) => acc + (m.away.isWinner ? m.away.tov : m.home.tov), 0) / Math.max(1, gd.matchups.length)).toFixed(1);
      const avgLoseTov = round1(gd.matchups.reduce((acc, m) => acc + (m.away.isWinner ? m.home.tov : m.away.tov), 0) / Math.max(1, gd.matchups.length)).toFixed(1);
      const c2p2 = closeMatches.length > 0
        ? `Esa misma exigencia se trasladó a los ${closeMatches.length} encuentros resueltos por seis o menos puntos (${closeMatches.slice(0, 3).map(formatGameScoreline).join(", ")}). En el cómputo global de la noche, los conjuntos ganadores promediaron ${avgWinTov} pérdidas frente a las ${avgLoseTov} de sus rivales, **confirmando que proteger cada posesión pesó tanto como el acierto exterior**.`
        : `En el balance general de la cartelera, los ${gd.pulse.blowoutsCount} triunfos resueltos por quince o más puntos mostraron hasta qué punto la consistencia defensiva y la fluidez en el pase separaron a los vencedores cuando el ritmo medio rondó las ${gd.pulse.avgPace.toFixed(1)} posesiones.`;

      dynamicSections.push({
        kicker: "Segundo Foco",
        title: `El cerrojo de ${winner.shortName} y el valor de cuidar el balón`,
        body: `${c2p1}\n\n${c2p2}`,
      });
    }

    // Capítulo 3: Reseña obligatoria del resto de la cartelera para garantizar cobertura del 100% de los partidos
    const coveredEventIds = new Set([focusMatch?.eventId, stmtMatch?.eventId].filter(Boolean));
    const remainingMatchups = (gd.matchups || []).filter((m) => !coveredEventIds.has(m.eventId));
    if (remainingMatchups.length > 0) {
      const remSentences = remainingMatchups.map((m) => {
        const winner = m.away.isWinner ? m.away : m.home;
        const loser = m.away.isWinner ? m.home : m.away;
        const enr = matchEnrichments.get(m.eventId);
        const wLog = enr?.winnerLog;
        const lLog = enr?.loserLog;
        const topP = winner.topPlayer || loser.topPlayer;
        const topPLine = topP
          ? `, con **${topP.playerName}** como referente (${topP.points} puntos, ${topP.rebounds} rebotes y ${topP.assists} asistencias)`
          : "";
        const driverLine = wLog && lLog
          ? `apoyado en **${wLog.efgPct >= lLog.efgPct + 4 ? "su superioridad en eficacia de tiro" : wLog.tov < lLog.tov ? "un control mucho más limpio del balón" : "su solidez en los momentos clave"}** (${wLog.efgPct.toFixed(1)}% eFG frente al ${lLog.efgPct.toFixed(1)}% rival)`
          : `marcando diferencias por un margen de ${m.margin} puntos a un ritmo de ${m.pace.toFixed(1)} posesiones`;
        return `En ${m.away.abbr} @ ${m.home.abbr}, **${winner.name}** se impuso ${winner.score}-${loser.score} a **${loser.name}** ${driverLine}${topPLine}.`;
      });
      const chunkSize = Math.max(2, Math.ceil(remSentences.length / 2));
      const remParagraphs = [];
      for (let i = 0; i < remSentences.length; i += chunkSize) {
        remParagraphs.push(remSentences.slice(i, i + chunkSize).join(" "));
      }
      dynamicSections.push({
        kicker: "Panorama de la Cartelera",
        title: `Repaso completo al resto de la jornada (${remainingMatchups.length} ${remainingMatchups.length === 1 ? "duelo adicional" : "duelos restantes"})`,
        body: remParagraphs.join("\n\n"),
      });
    }

    const pizarrasSortedByEff = [...(gd.matchups || [])]
      .map((m) => {
        const winner = m.away.isWinner ? m.away : m.home;
        const loser = m.away.isWinner ? m.home : m.away;
        return { m, winner, loser, enr: matchEnrichments.get(m.eventId) };
      })
      .sort((a, b) => b.winner.efgPct - a.winner.efgPct);

    const pizarra1 = pizarrasSortedByEff[0];
    const pizarra2 = pizarrasSortedByEff[1];
    const pizarrasParagraphs = [];
    if (pizarra1) {
      const { winner, loser, enr } = pizarra1;
      const wLog = enr?.winnerLog;
      const lLog = enr?.loserLog;
      if (wLog && lLog) {
        pizarrasParagraphs.push(
          `Desde la pizarra colectiva, la propuesta ofensiva más afilada perteneció a **${winner.name}** en su victoria por ${winner.score}-${loser.score} ante **${loser.name}**. Con una circulación que generó ${wLog.ast} asistencias sobre ${wLog.fgm} canastas, el ataque de **${winner.shortName}** escaló hasta ${wLog.offRtg.toFixed(1)} puntos por cada cien posesiones y castigó desde el perímetro con ${wLog.fg3m} triples anotados, obligando a la defensa rival a conceder espacios interiores.`
        );
      } else {
        pizarrasParagraphs.push(
          `En el plano táctico, **${winner.name}** marcó la pauta ante **${loser.name}** (${winner.score}-${loser.score}) al combinar un ${winner.efgPct.toFixed(1)}% de tiro efectivo con ${winner.ast} asistencias, **desarmando las ayudas rivales mediante una circulación constante**.`
        );
      }
    }
    if (pizarra2) {
      const { winner, loser, enr } = pizarra2;
      const wLog = enr?.winnerLog;
      const lLog = enr?.loserLog;
      if (wLog && lLog) {
        pizarrasParagraphs.push(
          `En paralelo, **${winner.name}** edificó su triunfo frente a **${loser.name}** (${winner.score}-${loser.score}) desde el equilibrio entre el rebote ofensivo (${wLog.oreb} capturas) y la actividad defensiva. Al provocar ${lLog.tov} pérdidas y dejar al oponente en un ${lLog.offRtg.toFixed(1)} de rating ofensivo, **${winner.shortName}** demostró que controlar el ritmo (${gd.pulse.avgPace.toFixed(1)} posesiones de media en la jornada) sigue siendo la vía más fiable para gobernar el marcador.`
        );
      }
    }

    const pizarrasSection =
      pizarrasParagraphs.join("\n\n") ||
      `El análisis colectivo registró un ritmo medio de ${gd.pulse.avgPace.toFixed(1)} posesiones por 48 minutos.`;

    const hitosParagraphs = [];
    if (mvp) {
      const mvpNarrative = `La actuación individual más influyente de la noche llevó el nombre de **${mvp.playerName}**, clave para **${mvp.teamAbbr}** ante **${mvp.opponentAbbr}** (${mvp.result}) con ${mvp.points} puntos y ${mvp.assists} asistencias. Lejos de depender del volumen, firmó un sobresaliente ${mvp.fgm}/${mvp.fga} en tiros de campo que disparó su aportación muy por encima de su media de ${mvp.ptsBaselineAvg.toFixed(1)} tantos.`;
      const tdSnippet = tripleDoublesNight.length > 0
        ? ` La jornada también dejó huella en la estadística global gracias al pulso completo de los triples-dobles firmados en la cartelera (${tripleDoublesNight.slice(0, 2).map((line) => line.split(":")[0]).join(" y ")}).`
        : "";
      hitosParagraphs.push(`${mvpNarrative}${tdSnippet}`);
    } else if (tripleDoublesNight.length > 0) {
      hitosParagraphs.push(
        `El protagonismo individual quedó marcado por la polivalencia de quienes gobernaron todos los apartados del juego, con mención especial para ${tripleDoublesNight.slice(0, 2).map((line) => `**${line.split(" (")[0]}**`).join(" y ")}, capaces de producir triples-dobles de alto impacto colectivo.`
      );
    }

    const secondaryStoryParts = [];
    if (topExp && (!mvp || topExp.playerId !== mvp.playerId)) {
      secondaryStoryParts.push(
        `Entre los estallidos anotadores destacó **${topExp.playerName}** (${topExp.teamAbbr}), quien alcanzó los ${topExp.points} puntos frente a **${topExp.opponentAbbr}** —${topExp.ptsDelta.toFixed(1)} tantos por encima de su promedio habitual— apoyado en ${topExp.fg3m} triples convertidos.`
      );
    }
    if (gd.slumps.length > 0) {
      const sl = gd.slumps[0];
      secondaryStoryParts.push(
        `En la cara opuesta, **${sl.playerName}** vivió una noche espesa con **${sl.teamAbbr}**, limitado a ${sl.points} puntos tras acertar apenas ${sl.fgm} de ${sl.fga} intentos en ataque.`
      );
    }
    if (secondaryStoryParts.length > 0) {
      hitosParagraphs.push(secondaryStoryParts.join(" "));
    }

    const streakAndRoleParts = [];
    if (gd.roleShifts.length > 0) {
      const r0 = gd.roleShifts[0];
      streakAndRoleParts.push(
        `Desde el banquillo o en rotaciones ampliadas, **${r0.playerName}** aprovechó sus ${r0.minutes.toFixed(0)} minutos con **${r0.teamAbbr}** para aportar ${r0.points} puntos y ${r0.rebounds} rebotes.`
      );
    }
    if (extendedList.length > 0) {
      const ex = extendedList[0];
      streakAndRoleParts.push(
        `En el capítulo de regularidad, **${ex.playerName}** alargó hasta ${ex.streakCount} partidos consecutivos su serie en ${ex.thresholdLabel}.`
      );
    }
    if (brokenList.length > 0) {
      const br = brokenList[0];
      streakAndRoleParts.push(
        `Por el contrario, se detuvo la racha de ${br.streakCount} encuentros seguidos de **${br.playerName}** en ${br.thresholdLabel}.`
      );
    }
    if (streakAndRoleParts.length > 0) {
      hitosParagraphs.push(streakAndRoleParts.join(" "));
    }
    if (dailyHeroicClinchers.length > 0) {
      hitosParagraphs.push(
        `En el capítulo de desenlaces límite, ${dailyHeroicClinchers.map((hc) => `**${hc.playerName}** (${hc.teamAbbr}) decidió el choque frente a **${hc.opponentAbbr}** (${hc.scoreDisplay}) con un ${hc.shotType === "buzzer_beater" ? "Buzzer Beater sobre la bocina (BB · 0.0s)" : `Game Winner (GW) a falta de ${hc.clock} del ${hc.periodLabel}`} mediante ${hc.actionEs}`).join("; ")}.`
      );
    }
    if (careerHighsNight.length > 0) {
      hitosParagraphs.push(
        `La jornada también inscribió nuevos máximos personales de carrera (Career Highs verificados): ${careerHighsNight.slice(0, 4).join("; ")}.`
      );
    }

    const hitosSection = hitosParagraphs.filter(Boolean).join("\n\n");

    const espanolesSection =
      spanishNightNotes.length > 0
        ? `Acta de jugadores españoles: ${spanishNightNotes.join("; ")}.`
        : "Ningún jugador español sumó minutos en pista durante los encuentros disputados en esta fecha del calendario NBA.";

    const clavesList = (gd.matchups || []).slice(0, 4).map((m, idx) => {
      const winner = m.away.isWinner ? m.away : m.home;
      const loser = m.away.isWinner ? m.home : m.away;
      const enr = matchEnrichments.get(m.eventId);
      const wLog = enr?.winnerLog;
      const lLog = enr?.loserLog;
      const topP = winner.topPlayer;
      const rawKey = (m.keyTakeawaysAdvanced && m.keyTakeawaysAdvanced[0]) || (m.keyTakeawaysSimple && m.keyTakeawaysSimple[0]) || "";
      const cleanKey = rawKey.replace(/\*\*/g, "").trim();
      const titles = [
        `${winner.abbr} ${winner.score}-${loser.score} ${loser.abbr}: ${topP ? topP.playerName : winner.shortName}`,
        `Pizarra de ${winner.shortName} ante ${loser.shortName}`,
        `Pulso estadístico en ${m.away.abbr} @ ${m.home.abbr}`,
        `Factor decisivo de ${winner.shortName} (+${m.margin} pts)`,
      ];
      let detail = cleanKey;
      if (wLog && lLog) {
        detail = `**${winner.name}** venció ${winner.score}-${loser.score} a **${loser.name}** con ${wLog.efgPct.toFixed(1)}% eFG (${wLog.fgm}/${wLog.fga} TC, ${wLog.fg3m}/${wLog.fg3a} T3), ${wLog.tov} pérdidas frente a ${lLog.tov} del rival y ${wLog.reb}-${lLog.reb} en rebotes${topP ? `, guiado por **${topP.playerName}** (${topP.points} PTS, ${topP.rebounds} REB, ${topP.assists} AST, ${topP.tsPct.toFixed(1)}% TS)` : ""}.`;
      } else if (topP) {
        detail = `**${winner.name}** superó a **${loser.name}** (${winner.score}-${loser.score}) con **${topP.playerName}** firmando ${topP.points} PTS, ${topP.rebounds} REB y ${topP.assists} AST (${topP.fgm}/${topP.fga} TC).`;
      }
      return {
        title: titles[idx] || `${winner.abbr} ${winner.score}-${loser.score} ${loser.abbr}`,
        detail,
      };
    });

    const slateRadarFallback = chronicleVersion === "v2_tactical" ? computeSlateTacticalRadar(gd, matchEnrichments) : null;
    return {
      date: gd.selectedDate,
      seasonLabel: gd.seasonLabel,
      gamesCount: gd.pulse.gamesCount,
      generatedAt: new Date().toISOString(),
      engineMode: "empirical_fallback",
      chronicleVersion,
      groundingUsed: false,
      missingApiKey: !getGeminiClient(),
      headline: sanitizeEditorialSpanishGrammar(headline),
      lead: sanitizeEditorialSpanishGrammar(lead),
      dynamicSections: dynamicSections.map((s) => ({
        ...s,
        title: sanitizeEditorialSpanishGrammar(s.title),
        body: sanitizeEditorialSpanishGrammar(s.body),
      })),
      pizarrasSection: sanitizeEditorialSpanishGrammar(pizarrasSection),
      hitosSection: sanitizeEditorialSpanishGrammar(hitosSection || lead),
      espanolesSection: sanitizeEditorialSpanishGrammar(espanolesSection),
      clavesList: clavesList.map((c) => ({
        title: sanitizeEditorialSpanishGrammar(c.title),
        detail: sanitizeEditorialSpanishGrammar(c.detail),
      })),
      spanishPlayersSummary: sanitizeEditorialSpanishGrammar(
        spanishNightNotes.length > 0
          ? spanishNightNotes.join(" · ")
          : "Sin participación en pista de jugadores españoles registrada en los partidos de esta fecha."
      ),
      ...(slateRadarFallback
        ? {
            tacticalRadar: {
              keys: slateRadarFallback.keys.map((k) => ({
                title: sanitizeEditorialSpanishGrammar(k.title),
                summary: sanitizeEditorialSpanishGrammar(k.summary),
              })),
              extremes: slateRadarFallback.extremes,
              defensiveDuels: slateRadarFallback.defensiveDuels,
            },
            nightQuotes: [],
          }
        : {}),
      sources: [],
    };
  }
  async function buildGameDayChroniclePayload(requestedDate, forceRefresh = false) {
    const gd = await deps.getGameDayPayload(requestedDate, forceRefresh);

    const hasFinishedOrLiveGames = Array.isArray(gd.liveOrScheduledToday) && gd.liveOrScheduledToday.length > 0
      ? gd.liveOrScheduledToday.some((g) => g.gameStatus === 3 || g.status === 3 || g.gameStatus === 2 || g.status === 2 || (Number(g.homeScore) > 0 && g.gameStatus !== 1))
      : gd.matchups.length > 0 && gd.matchups.some((m) => m.away.score > 0 || m.home.score > 0);

    if (!hasFinishedOrLiveGames) {
      return {
        date: gd.selectedDate,
        seasonLabel: gd.seasonLabel,
        gamesCount: gd.pulse.gamesCount || gd.liveOrScheduledToday.length || 0,
        generatedAt: new Date().toISOString(),
        engineMode: "upcoming_not_played",
        missingApiKey: !getGeminiClient(),
        headline: sanitizeEditorialSpanishGrammar(`Jornada NBA del ${gd.selectedDate} · Partidos programados`),
        lead: sanitizeEditorialSpanishGrammar(`Los ${gd.pulse.gamesCount || gd.liveOrScheduledToday.length || 0} encuentros correspondientes a la jornada del ${gd.selectedDate} aún no se han disputado. La crónica editorial y el análisis de scouting detallado estarán disponibles una vez finalicen los partidos y se procesen las actas oficiales.`),
        dynamicSections: [],
        pizarrasSection: sanitizeEditorialSpanishGrammar("Los análisis tácticos, comparativas de pizarras y métricas de posesión se activarán en tiempo real conforme concluyan los encuentros de la fecha."),
        hitosSection: sanitizeEditorialSpanishGrammar("Las actuaciones estelares, triples-dobles y récords de la noche se registrarán y contrastarán con las medias de la temporada tras el cierre oficial de la jornada."),
        espanolesSection: sanitizeEditorialSpanishGrammar("La participación de los jugadores españoles se actualizará al término de sus respectivos partidos."),
        clavesList: [
          { title: sanitizeEditorialSpanishGrammar("Estado de la cartelera ::"), detail: sanitizeEditorialSpanishGrammar(`Hay ${gd.pulse.gamesCount || gd.liveOrScheduledToday.length || 0} partidos programados para la fecha ${gd.selectedDate} que se encuentran pendientes de disputa.`) },
          { title: sanitizeEditorialSpanishGrammar("Previa táctica ::"), detail: sanitizeEditorialSpanishGrammar("Los cuerpos técnicos ultiman las rotaciones y los planteamientos de scouting antes de saltar a pista.") },
          { title: sanitizeEditorialSpanishGrammar("Seguimiento en vivo ::"), detail: sanitizeEditorialSpanishGrammar("Utiliza el marcador en tiempo real y el analizador de partidos para seguir cada enfrentamiento segundo a segundo.") },
          { title: sanitizeEditorialSpanishGrammar("Informes oficiales ::"), detail: sanitizeEditorialSpanishGrammar("El motor generará la revista automática con todas las estadísticas avanzadas y de PBP al completarse las actas.") }
        ],
        spanishPlayersSummary: sanitizeEditorialSpanishGrammar("La participación de los jugadores españoles se actualizará al término de los partidos de la jornada."),
        sources: [],
      };
    }

    const editorialCfg = await loadEditorialConfig(forceRefresh);
    const dailyVersion: "v1_classic" | "v2_tactical" =
      editorialCfg.dailyChronicleVersion === "v1_classic" ? "v1_classic" : "v2_tactical";
    const cacheKey = `gameday_chronicle_v18:${dailyVersion}:e${editorialCfg.cacheEpoch}:${gd.selectedDate}`;
    if (!forceRefresh) {
      const persisted = await readSharedPersistedNarrative(cacheKey);
      if (persisted) {
        if (persisted.engineMode === 'gemini_search' || !getGeminiClient()) {
          return persisted;
        }
      }
    }
    const existing = reportInflight.get(cacheKey);
    if (existing) {
      return existing;
    }
    const promise = (async () => {
      const startTime = Date.now();
      const pressWithTimeout = Promise.race([
        fetchLivePressContext(gd.selectedDate, forceRefresh),
        new Promise((resolve) =>
          setTimeout(() => resolve({ byMatchup: new Map(), dayNotes: [], daySources: [] }), 3500)
        ),
      ]);
      const [full, biosMap, pressCtx, heroicSnapshotResp] = await Promise.all([
        deps.getFullLeagueMemory(),
        deps.getPlayerBiosMap(false),
        pressWithTimeout,
        getLeagueHeroicShots("all", false).catch(() => null),
      ]);
      const spanishNightNotes = [];
      const tripleDoublesNight = [];
      const doubleDoublesNight = [];
      const careerHighsNight = [];
      const verifiedNightPlayerNames = [];
      const eventIdsToday = new Set(gd.matchups.map((m) => m.eventId));
      let totalDoubleDoubles = 0;

      const teamByAbbr = new Map();
      for (const tm of full.teams) {
        teamByAbbr.set(tm.abbreviation, tm);
      }

      const playerByIdDay = new Map();
      for (const p of full.allPlayers) {
        playerByIdDay.set(p.id, p);
        const g = p.games.find((x) => eventIdsToday.has(x.eventId) || x.date.slice(0, 10) === gd.selectedDate);
        if (!g) continue;
        verifiedNightPlayerNames.push(p.name);
        const bio = biosMap.get(p.id);
        const isSp = isSpanishPlayerCheck(p.name, p.country || bio?.country);
        if (isSp) {
          spanishNightNotes.push(`#${sanitizeJersey(p.jersey, bio?.jersey)} ${p.name} (${p.teamAbbr} ${g.isHome ? "vs" : "@"} ${g.opponentAbbr}, ${g.result}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST, ${g.fgm}/${g.fga} TC (${g.fg3m}/${g.fg3a} T3) en ${Math.round(g.minutes)} MIN`);
        }
        const tens = [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter((v) => v >= 10).length;
        const isOfficialTd = g.points >= 10 && g.rebounds >= 10 && g.assists >= 10;
        if (isOfficialTd) {
          tripleDoublesNight.push(`${p.name} (${p.teamAbbr} ${g.isHome ? "vs" : "@"} ${g.opponentAbbr}, ${g.result}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST (${g.fgm}/${g.fga} TC, ${g.fg3m}/${g.fg3a} T3, ${g.tsPct.toFixed(1)}% TS, ${Math.round(g.minutes)} MIN, ${g.plusMinus >= 0 ? `+${g.plusMinus}` : g.plusMinus} +/-)`);
        } else if (tens >= 2) {
          totalDoubleDoubles++;
          if (doubleDoublesNight.length < 8) {
            doubleDoublesNight.push(`${p.name} (${p.teamAbbr} vs ${g.opponentAbbr}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST (${g.fgm}/${g.fga} TC)`);
          }
        }
        // Verified Career High detection for the selected 2026-27 date
        if (gd.seasonLabel === "2026-27") {
          const chrono27 = [...(p.games || [])]
            .filter((x) => !x.seasonLabel || x.seasonLabel === "2026-27")
            .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
          const gIdx = chrono27.findIndex((x) => x.eventId === g.eventId || String(x.date || "").slice(0, 10) === gd.selectedDate);
          if (gIdx >= 0) {
            const base = getPlayerPriorCareerBaseline(p.id, chrono27, gIdx);
            if (base.hasHistoricalSnapshot && base.priorCareerGp >= 15) {
              const chHits = [];
              if ((g.points || 0) >= 25 && g.points > base.priorHighs.pts) chHits.push(`${g.points} PTS (antes: ${base.priorHighs.pts})`);
              if ((g.rebounds || 0) >= 14 && g.rebounds > base.priorHighs.reb) chHits.push(`${g.rebounds} REB (antes: ${base.priorHighs.reb})`);
              if ((g.assists || 0) >= 10 && g.assists > base.priorHighs.ast) chHits.push(`${g.assists} AST (antes: ${base.priorHighs.ast})`);
              if ((g.fg3m || 0) >= 6 && g.fg3m > base.priorHighs.fg3m) chHits.push(`${g.fg3m} T3 (antes: ${base.priorHighs.fg3m})`);
              if ((g.steals || 0) >= 5 && g.steals > base.priorHighs.stl) chHits.push(`${g.steals} ROB (antes: ${base.priorHighs.stl})`);
              if ((g.blocks || 0) >= 5 && g.blocks > base.priorHighs.blk) chHits.push(`${g.blocks} TAP (antes: ${base.priorHighs.blk})`);
              if (chHits.length > 0) {
                careerHighsNight.push(`**${p.name}** (${p.teamAbbr} ${g.isHome ? "vs" : "@"} ${g.opponentAbbr}): ${chHits.join(" y ")}`);
              }
            }
          }
        }
      }

      // Build rich per-matchup boxscore & season baseline enrichments
      const matchEnrichments = new Map();
      for (const m of gd.matchups) {
        const awayTeamObj = teamByAbbr.get(m.away.abbr);
        const homeTeamObj = teamByAbbr.get(m.home.abbr);
        const awayLog = awayTeamObj?.games?.find((x) => x.eventId === m.eventId) || null;
        const homeLog = homeTeamObj?.games?.find((x) => x.eventId === m.eventId) || null;
        const winnerIsAway = m.away.isWinner;
        matchEnrichments.set(m.eventId, {
          awayLog,
          homeLog,
          winnerLog: winnerIsAway ? awayLog : homeLog,
          loserLog: winnerIsAway ? homeLog : awayLog,
          awayAvgPtsFor: awayTeamObj?.avgPointsFor || 0,
          homeAvgPtsFor: homeTeamObj?.avgPointsFor || 0,
          winnerAvgPtsFor: winnerIsAway ? (awayTeamObj?.avgPointsFor || 0) : (homeTeamObj?.avgPointsFor || 0),
          loserAvgPtsFor: winnerIsAway ? (homeTeamObj?.avgPointsFor || 0) : (awayTeamObj?.avgPointsFor || 0),
          pbp: null,
        });
      }

      // Fetch Play-by-Play highlights for marquee + all tight games (<=4 pts) of the night (with strict 3.5s budget)
      const marqueeEventIds = new Set();
      const closeSorted = [...gd.matchups].filter((m) => m.margin <= 8).sort((a, b) => a.margin - b.margin);
      for (const cm of closeSorted.filter((m) => m.margin <= 4)) marqueeEventIds.add(cm.eventId);
      for (const cm of closeSorted.slice(0, 2)) marqueeEventIds.add(cm.eventId);
      if (gd.mvpOfTheNight) {
        const mvpMatch = gd.matchups.find((m) => m.away.abbr === gd.mvpOfTheNight.teamAbbr || m.home.abbr === gd.mvpOfTheNight.teamAbbr);
        if (mvpMatch) marqueeEventIds.add(mvpMatch.eventId);
      }
      if (gd.statementTeamWin) {
        const stmtMatch = gd.matchups.find((m) => m.away.abbr === gd.statementTeamWin.teamAbbr || m.home.abbr === gd.statementTeamWin.teamAbbr);
        if (stmtMatch) marqueeEventIds.add(stmtMatch.eventId);
      }
      if (marqueeEventIds.size < 2) {
        for (const m of gd.matchups.slice(0, 2)) marqueeEventIds.add(m.eventId);
      }

      const pbpTargets = [...marqueeEventIds].slice(0, 6).map((eid) => gd.matchups.find((m) => m.eventId === eid)).filter(Boolean);
      const pbpTask = (async () => {
        if (pbpTargets.length === 0) return;
        try {
          const pbpBatch = await Promise.race([
            Promise.all(
              pbpTargets.map(async (m) => {
                const winnerAbbr = m.away.isWinner ? m.away.abbr : m.home.abbr;
                const h = await fetchPlayByPlayHighlights(m.eventId, m.away.abbr, m.home.abbr, winnerAbbr, gd.seasonLabel, forceRefresh, gd.selectedDate);
                return { eventId: m.eventId, h };
              })
            ),
            new Promise((resolve) => setTimeout(() => resolve([]), 3500)),
          ]);
          if (Array.isArray(pbpBatch)) {
            for (const item of pbpBatch) {
              if (item?.eventId && item?.h) {
                const enr = matchEnrichments.get(item.eventId);
                if (enr) enr.pbp = item.h;
              }
            }
          }
        } catch {
          // Non-blocking PBP enrichment
        }
      })();
      const espnSlateTask =
        dailyVersion === "v2_tactical"
          ? fetchSlateEspnFullRecaps(gd, pressCtx, forceRefresh).catch(() => ({
              digestsByEventId: new Map(),
              sources: [],
              fetchedCount: 0,
            }))
          : Promise.resolve({
              digestsByEventId: new Map(),
              sources: [],
              fetchedCount: 0,
            });
      const [, espnSlateRecaps] = await Promise.all([pbpTask, espnSlateTask]);

      // Collect verified Buzzer Beaters & Game Winners for this gameday (snapshot + live PBP fallback)
      const heroicMapToday = new Map();
      const registerHeroicClincher = (hc) => {
        if (!hc || (hc.shotType !== "buzzer_beater" && hc.shotType !== "game_winner")) return;
        const gid = String(hc.gameId || "");
        const dedupKey = `${gid}:${hc.shotType}`;
        if (heroicMapToday.has(dedupKey)) return;
        const pid = String(hc.playerId || "");
        const memPl = pid ? playerByIdDay.get(pid) : null;
        const bio = pid ? biosMap.get(pid) : null;
        const matchedGame = gd.matchups.find((m) => m.eventId === gid);
        const scoreDisplay = matchedGame
          ? `${matchedGame.away.abbr} ${matchedGame.away.score}-${matchedGame.home.score} ${matchedGame.home.abbr}`
          : `${hc.finalScoreTeam}-${hc.finalScoreOpp}`;
        heroicMapToday.set(dedupKey, {
          ...hc,
          playerName: memPl?.name || bio?.name || hc.playerName || "Jugador",
          jersey: sanitizeJersey(memPl?.jersey, bio?.jersey),
          scoreDisplay,
          actionEs: translateHeroicShotActionCompactEs(String(hc.description || "")),
        });
      };
      for (const s of (Array.isArray(heroicSnapshotResp?.items) ? heroicSnapshotResp.items : [])) {
        if (eventIdsToday.has(String(s?.gameId || "")) || String(s?.date || "").slice(0, 10) === gd.selectedDate) {
          registerHeroicClincher(s);
        }
      }
      for (const enr of matchEnrichments.values()) {
        for (const s of (Array.isArray(enr?.pbp?.heroicClinchers) ? enr.pbp.heroicClinchers : [])) {
          registerHeroicClincher(s);
        }
      }
      const dailyHeroicClinchers = Array.from(heroicMapToday.values());

      if (!getGeminiClient() || gd.matchups.length === 0) {
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes, matchEnrichments, tripleDoublesNight, dailyHeroicClinchers, careerHighsNight, dailyVersion);
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = !getGeminiClient();
        fallback.fallbackReason = !getGeminiClient() ? "missing_api_key" : "no_matchups";
        return fallback;
      }

      const formatTopRotLine = (playersList) => {
        return [...(playersList || [])]
          .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0) || (b.points ?? 0) - (a.points ?? 0))
          .slice(0, 3)
          .map((p) =>
            `${p.playerName} (${p.points}P/${p.rebounds}R/${p.assists}A${p.steals ? `/${p.steals}ROB` : ""}${p.blocks ? `/${p.blocks}TAP` : ""}, ${p.fgm}/${p.fga} TC, ${p.fg3m}/${p.fg3a} T3, ${p.ftm}/${p.fta} TL, ${p.tsPct.toFixed(1)}% TS, ${p.turnovers} PER, ${Math.round(p.minutes)}m, ${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus} +/-; media ${p.ptsBaselineAvg.toFixed(1)} PTS)`
          )
          .join(" | ");
      };

      const formatDetailedTeamLine = (side, log, seasonAvgPts) => {
        if (!log) {
          return `${side.abbr}: ${side.score} PTS (${side.fg3m}/${side.fg3a} T3, ${side.efgPct.toFixed(1)}% eFG, ${side.reb} REB, ${side.ast} AST, ${side.tov} PER, OffRtg ${side.offRtg.toFixed(1)}, DefRtg ${side.defRtg.toFixed(1)})`;
        }
        const fg2m = Math.max(0, log.fgm - log.fg3m);
        const fg2a = Math.max(0, log.fga - log.fg3a);
        const fg2Pct = fg2a > 0 ? ((fg2m / fg2a) * 100).toFixed(1) : "0.0";
        const fgPct = log.fga > 0 ? ((log.fgm / log.fga) * 100).toFixed(1) : "0.0";
        const vsMedia = seasonAvgPts > 0 ? ` [vs media equipo ${seasonAvgPts.toFixed(1)}: ${(side.score - seasonAvgPts) >= 0 ? "+" : ""}${(side.score - seasonAvgPts).toFixed(1)}]` : "";
        return `${side.abbr}: ${side.score} PTS${vsMedia} | ${log.fgm}/${log.fga} TC (${fgPct}%) | ${fg2m}/${fg2a} T2 (${fg2Pct}%) | ${log.fg3m}/${log.fg3a} T3 (${side.fg3Pct.toFixed(1)}%) | ${log.ftm}/${log.fta} TL | ${log.reb} REB (${log.oreb} OR) | ${log.ast} AST | ${log.stl} ROB | ${log.blk} TAP | ${log.tov} PER | eFG ${log.efgPct.toFixed(1)}% | TS ${log.tsPct.toFixed(1)}% | OffRtg ${log.offRtg.toFixed(1)} / DefRtg ${log.defRtg.toFixed(1)} / NetRtg ${log.netRtg >= 0 ? "+" : ""}${log.netRtg.toFixed(1)}`;
      };

      const detailedMatchupBlocks = gd.matchups.map((m) => {
        const enr = matchEnrichments.get(m.eventId);
        const pbpLines = [];
        if (enr?.pbp) {
          if (enr.pbp.keyRun?.summary) pbpLines.push(`Parcial/TM: ${enr.pbp.keyRun.summary}`);
          if (enr.pbp.breakpoint?.summary) pbpLines.push(`Quiebre: ${enr.pbp.breakpoint.summary}`);
          if (enr.pbp.clutchExecution?.summaryNarrative) pbpLines.push(`Clutch 2min: ${enr.pbp.clutchExecution.summaryNarrative}`);
          if (enr.pbp.playerHotSpurts?.length) pbpLines.push(`Rachas PBP: ${enr.pbp.playerHotSpurts.map((s) => s.summary).join("; ")}`);
          if (enr.pbp.earlyFoulTroubles?.length) pbpLines.push(`Faltas tempranas PBP: ${enr.pbp.earlyFoulTroubles.map((f) => f.summary).join("; ")}`);
          if (enr.pbp.foulOuts?.length) pbpLines.push(`Expulsados 6 faltas PBP: ${enr.pbp.foulOuts.map((f) => f.summary).join("; ")}`);
        }
        return [
          `PARTIDO: ${m.away.name} (${m.away.abbr} ${m.away.recordAfter || ""}${m.away.isBackToBack ? ", en back-to-back" : ""}) ${m.away.score} - ${m.home.score} ${m.home.name} (${m.home.abbr} ${m.home.recordAfter || ""}${m.home.isBackToBack ? ", en back-to-back" : ""}) [${m.contextTag} · Margen ${m.margin} · Pace ${m.pace.toFixed(1)}]`,
          `  - ${formatDetailedTeamLine(m.away, enr?.awayLog, enr?.awayAvgPtsFor || 0)}`,
          `  - ${formatDetailedTeamLine(m.home, enr?.homeLog, enr?.homeAvgPtsFor || 0)}`,
          `  - Líderes ${m.away.abbr}: ${formatTopRotLine(m.away.rotationPlayers)}`,
          `  - Líderes ${m.home.abbr}: ${formatTopRotLine(m.home.rotationPlayers)}`,
          `  - Claves analíticas: ${m.keyTakeawaysAdvanced.map((k) => k.replace(/\*\*/g, "")).join(" / ")}`,
          pbpLines.length > 0 ? `  - Hitos Play-by-Play en pista: ${pbpLines.join(" | ")}` : "",
        ].filter(Boolean).join("\n");
      });

      const dayHeroicBlock = dailyHeroicClinchers.length > 0
        ? `CANASTAS DECISIVAS DE LA JORNADA (BUZZER BEATERS / GAME WINNERS VERIFICADOS): ${dailyHeroicClinchers.map((hc) => `#${hc.jersey} ${hc.playerName} (${hc.teamAbbr}, ${hc.scoreDisplay}) firmó un ${hc.shotType === "buzzer_beater" ? "Buzzer Beater sobre la bocina (BB · 0.0s)" : `Game Winner decisivo (GW · faltando ${hc.clock})`} en el ${hc.periodLabel} con ${hc.actionEs}`).join(" | ")}`
        : "";
      const daySeedSources = [{ uri: `https://www.nba.com/games?date=${gd.selectedDate}`, title: `NBA.com — Resultados y Actas Oficiales (${gd.selectedDate})` }, ...pressCtx.daySources].slice(0, 6);
      const mandatoryMatchupsIndex = gd.matchups
        .map((m, idx) => `${idx + 1}. ${m.away.abbr} ${m.away.score}-${m.home.score} ${m.home.abbr}`)
        .join(" | ");
      const dayDossier = [
        `AVISO CRÍTICO DE MUNDO CERRADO: Jornada oficial NBA del ${gd.selectedDate} (Temporada ${gd.seasonLabel}). Tu memoria interna de entrenamiento está desactualizada varios años respecto a entrenadores actuales, traspasos, contratos y palmarés. NO des NINGÚN dato por supuesto fuera de los hechos explícitos de este dossier.`,
        `FECHA DE LA JORNADA NBA: ${gd.selectedDate} (Temporada ${gd.seasonLabel})`,
        `PULSO GLOBAL: ${gd.pulse.gamesCount} partidos disputados | Media puntos combinados: ${gd.pulse.avgTotalPoints.toFixed(1)} PTS (media liga: ${gd.pulse.leagueAvgTotalPoints.toFixed(1)}) | Finales apretados (<=5 pts): ${gd.pulse.closeGamesCount} | Palizas (>=15 pts): ${gd.pulse.blowoutsCount} | Victorias visitantes: ${gd.pulse.roadWinsCount}/${gd.pulse.gamesCount} | Ritmo medio (Pace): ${gd.pulse.avgPace.toFixed(1)}.`,
        `CHECKLIST DE PARTIDOS OBLIGATORIOS A RESEÑAR (TOTAL: ${gd.matchups.length}, PROHIBIDO OMITIR NINGUNO): ${mandatoryMatchupsIndex}`,
        dayHeroicBlock,
        gd.statementTeamWin ? `GOLPE EN LA MESA COLECTIVO: ${gd.statementTeamWin.teamName} (${gd.statementTeamWin.summaryAdvanced}).` : "",
        pressCtx.dayNotes.length > 0 ? `TELETIPOS DE PRENSA DE LOS PARTIDOS DE ESTA FECHA (${gd.selectedDate}):\n${pressCtx.dayNotes.slice(0, 12).map((n) => `  • ${n}`).join("\n")}` : "",
        ``,
        `QUINTETO IDEAL DE LA NOCHE (TOP 5 GAME SCORE):`,
        ...gd.idealFive.map((p, i) => `${i + 1}. ${p.playerName} (${p.teamAbbr} ${p.isHome ? "vs" : "@"} ${p.opponentAbbr}, ${p.result}): ${p.points} PTS, ${p.rebounds} REB, ${p.assists} AST, ${p.stocks} ROB+TAP, ${p.fgm}/${p.fga} TC, ${p.fg3m}/${p.fg3a} T3, ${p.ftm}/${p.fta} TL, ${p.tsPct.toFixed(1)}% TS, ${p.turnovers} PER, ${Math.round(p.minutes)} MIN, ${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus} +/-, GmSc ${p.gameScore.toFixed(1)} (su media es ${p.ptsBaselineAvg.toFixed(1)} PTS)`),
        ``,
        `DESGLOSE EMPÍRICO COMPLETO DE LOS ${gd.matchups.length} PARTIDOS:`,
        ...detailedMatchupBlocks,
        ``,
        `EXPLOSIONES FRENTE A SU MEDIA: ${gd.explosions.length > 0 ? gd.explosions.slice(0, 6).map((e) => `${e.playerName} (${e.teamAbbr} ${e.isHome ? "vs" : "@"} ${e.opponentAbbr}, ${e.result}): ${e.points} PTS (+${e.ptsDelta.toFixed(1)} vs media ${e.ptsAvg.toFixed(1)}), ${e.fgm}/${e.fga} TC, ${e.fg3m}/${e.fg3a} T3, ${e.tsPct.toFixed(1)}% TS, ${e.rebounds} REB, ${e.assists} AST, ${e.stocks} STK en ${Math.round(e.minutes)} MIN [${e.driverTag}]`).join(" | ") : "Ninguna extrema"}`,
        `BATACAZOS DE TITULARES: ${gd.slumps.length > 0 ? gd.slumps.slice(0, 5).map((s) => `${s.playerName} (${s.teamAbbr} vs ${s.opponentAbbr}, ${s.result}): ${s.points} PTS (${s.ptsDelta.toFixed(1)} vs media ${s.ptsAvg.toFixed(1)}), ${s.fgm}/${s.fga} TC, ${s.fg3m}/${s.fg3a} T3, ${s.tsPct.toFixed(1)}% TS, ${s.turnovers} PER en ${Math.round(s.minutes)} MIN [${s.driverTag}]`).join(" | ") : "Ninguno acusado"}`,
        `CAMBIOS DE ROL / PICOS DE MINUTOS: ${gd.roleShifts.length > 0 ? gd.roleShifts.slice(0, 4).map((r) => `${r.playerName} (${r.teamAbbr} vs ${r.opponentAbbr}): ${r.minutes.toFixed(0)} MIN (+${r.minutesDelta.toFixed(1)} vs media ${r.minutesAvg.toFixed(0)}), ${r.usgEst.toFixed(1)}% USG, ${r.points}P/${r.rebounds}R/${r.assists}A con ${r.fga} TCI`).join(" | ") : "Rotaciones estables"}`,
        `RACHAS DESTACADAS: ${gd.streakShifts.length > 0 ? gd.streakShifts.slice(0, 6).map((st) => `${st.playerName} (${st.teamAbbr} vs ${st.opponentAbbr}): ${st.status === "broken" ? `RACHA ROTA tras ${st.streakCount} PJ` : `PROLONGA a ${st.streakCount} PJ`} en ${st.thresholdLabel} (${st.nightValueDisplay} hoy, media racha ${st.avgDuringStreak})`).join(" | ") : "Sin rachas largas alteradas"}`,
        `TRIPLES-DOBLES DE LA NOCHE: ${tripleDoublesNight.length > 0 ? tripleDoublesNight.join(" | ") : "Ninguno"} (Total dobles-dobles en la jornada: ${totalDoubleDoubles}${doubleDoublesNight.length > 0 ? `; destacados: ${doubleDoublesNight.slice(0, 4).join(" | ")}` : ""}).`,
        careerHighsNight.length > 0 ? `RÉCORDS PERSONALES DE CARRERA VERIFICADOS (CAREER HIGHS): ${careerHighsNight.map((s) => s.replace(/\*\*/g, "")).join(" | ")}` : "",
        `JUGADORES ESPAÑOLES EN LA JORNADA: ${spanishNightNotes.length > 0 ? spanishNightNotes.join(" | ") : "Ningún jugador español sumó minutos en pista esta fecha."}`,
      ].filter(Boolean).join("\n");

      const dailyEditorialBlock = buildEditorialDirectivesPromptBlock(editorialCfg, "daily");
      const totalGamesCount = gd.matchups.length;
      const capitulosInstruction = totalGamesCount >= 3
        ? `(Exactamente 3 capítulos separados por una línea con --- para cubrir el 100% de los ${totalGamesCount} partidos de la cartelera. Formato obligatorio en cada capítulo: "Título concreto del capítulo :: Párrafo 1\\n\\nPárrafo 2...".\n- CAPÍTULO 1 (Foco Principal — el gran pulso o exhibición eje de la noche, 2 o 3 párrafos): Párrafo 1 narra el guion del partido, choque de estilos y quiebre (con hitos PBP si figuran); Párrafo 2 desgrana las claves tácticas colectivas con 2-3 cifras limpias; Párrafo 3 profundiza en los duelos individuales decisivos.\n- CAPÍTULO 2 (Segundo Foco — gran contraste táctico, sorpresa o segundo choque destacado, 2 párrafos): desarrolla otra gran narrativa de la jornada explicando qué ajustes defensivos u ofensivos decidieron el resultado.\n- CAPÍTULO 3 (Panorama Completo del Resto de la Cartelera — OBLIGATORIO reseñar TODOS Y CADA UNO de los ${totalGamesCount - 2} partidos no cubiertos en los capítulos 1 y 2, sin omitir ni un solo encuentro del CHECKLIST, en 2 o 3 párrafos cohesivos sin viñetas agrupados por dinámica —finales ajustados, triunfos visitantes, victorias contundentes—): dedica 2 frases claras y fluidas a cada partido restante incluyendo ambos equipos, marcador exacto, clave táctica del triunfo y protagonista principal con 2-3 cifras reales).`
        : `(Exactamente ${totalGamesCount === 1 ? "2 capítulos sobre el único duelo disputado" : "2 capítulos de fondo"} separados por una línea con --- cubriendo el 100% de los ${totalGamesCount} partidos de la jornada. Formato obligatorio: "Título concreto del capítulo :: Párrafo 1\\n\\nPárrafo 2\\n\\nPárrafo 3".\n- CAPÍTULO 1 (Foco Principal): narra el guion del choque principal, quiebre del marcador (con hitos PBP si constan), claves colectivas y duelo de estrellas.\n- CAPÍTULO 2 (${totalGamesCount === 1 ? "Lectura Táctica Complementaria y Banquillos" : "Segundo Foco — análisis completo del otro encuentro de la fecha"}): desarrolla con profundidad táctica, cifras selectivas y protagonistas reales sin repetir lo ya dicho en el Capítulo 1).`;

      const systemInstruction = [
        "Eres el analista jefe y cronista de scouting NBA de referencia en España. Cada mañana escribes la gran revista editorial de la jornada para que un lector exigente entienda con profundidad, buen ritmo periodístico y precisión táctica qué ocurrió exactamente en la pista y por qué se ganaron o perdieron TODOS los partidos de la fecha.",
        "REGLAS INQUEBRANTABLES DE RIGOR, COBERTURA COMPLETA Y LECTURA TÁCTICA:",
        "1. RIGOR EMPÍRICO TOTAL Y JERARQUÍA DE FUENTES: Todos los marcadores, puntos, series de tiro, porcentajes, pérdidas, rebotes, récords y rachas que cites deben coincidir al 100% con el dossier adjunto (ante cualquier matiz discrepante en TELETIPOS DE PRENSA, manda siempre el acta oficial). Jamás inventes resultados, cifras ni jugadas concretas no descritas. En expulsiones por 6 faltas, copia literalmente cuarto y reloj si aparecen en `Expulsados 6 faltas PBP`; si no figuran, NO deduzcas ni restes `48 - minutos`. SI Y SOLO SI el dossier incluye `CANASTAS DECISIVAS DE LA JORNADA` o `CANASTA GANADORA DECISIVA`, destaca ese Buzzer Beater (BB) o Game Winner (GW) (protagonista, equipo y reloj exacto) en ENTRADILLA, CAPITULOS_DINAMICOS/HITOS o CLAVES; si NO existe ese bloque, prohibido mencionar buzzer beaters o game winners. SI Y SOLO SI el dossier incluye `RÉCORDS PERSONALES DE CARRERA VERIFICADOS (CAREER HIGHS)`, destácalo en ENTRADILLA, HITOS o CLAVES; si NO figura ese bloque, PROHIBIDO afirmar que algún jugador batió su Career High.",
        '2. PROHIBICIÓN DE DAR DATOS POR SUPUESTOS: PROHIBIDO mencionar: (a) nombres propios o apodos de entrenadores, asistentes o directivos (usa SIEMPRE "el cuerpo técnico de [Equipo]", "la dirección técnica de [Equipo]" o "la pizarra de [Equipo]"); (b) antigüedad, edad, rondas de Draft, condición de rookie, contratos, exequipos o traspasos de jugadores; (c) premios pasados, anillos o series de temporadas anteriores; (d) puestos exactos en la clasificación o próximos rivales; (e) causas médicas no escritas literalmente en el dossier.',
        '3. DATO PRECISO AL SERVICIO DEL RELATO (CERO VOLCADOS TELEGRÁFICOS DE BOXSCORE): Respalda siempre tus tesis con cifras reales del dossier y cita el marcador exacto (ej. 116-94) la primera vez que analices cada encuentro. Evita atiborrar una misma frase con 6 o 7 métricas seguidas entre paréntesis: selecciona únicamente los 2 o 3 datos más reveladores para explicar cada idea táctica e intégralos con fluidez dentro de la oración. El lector ya dispone de las fichas numéricas completas en las tarjetas laterales; tu trabajo es contar el baloncesto con precisión, no copiar actas.',
        `4. COBERTURA INTEGRAL DE LA CARTELERA, CAUSA-EFECTO Y CERO CLICHÉS: Aunque los primeros focos profundicen en los duelos principales, es OBLIGATORIO reseñar TODOS Y CADA UNO de los ${totalGamesCount} partidos listados en el CHECKLIST DEL DOSSIER (cero partidos omitidos), redactando en párrafos periodísticos fluidos sin listas de viñetas y sin repetir los mismos hechos en dos secciones distintas. Desarrolla causa y efecto real (ayudas defensivas, protección de pintura, castigo tras pérdida, transición, rebote ofensivo, parciales o ejecución clutch del PBP cuando consten). EVITA tópicos gastados como "En conclusión", "Cabe destacar", "Sin lugar a dudas", "arma de destrucción masiva", "el reverso de la moneda", "la tiranía del...", "colapso de la jerarquía" o "dar un golpe sobre la mesa".`,
        '5. GRAMÁTICA Y TERMINOLOGÍA NBA EN ESPAÑOL + JERARQUÍA EN NEGRITA (**...**): JAMÁS dupliques el artículo delante de franquicias que empiezan por "Los" (escribe "**Los Angeles Lakers**" o "los **Lakers**", nunca "los Los Angeles Lakers"). NUNCA traduzcas literalmente "back-to-back" (PROHIBIDO "espalda con espalda"; escribe "en back-to-back" o "en segunda noche consecutiva sin descanso"); mantén clutch, pick and roll y play-in. En todos los párrafos del cuerpo (ENTRADILLA, CAPITULOS_DINAMICOS, PIZARRAS, HITOS, ESPANOLES —salvo frase única de ausencia— y explicación tras :: en CLAVES), usa **texto** EXCLUSIVAMENTE para: (a) jugadores (ej. **Nikola Jokić**), (b) equipos/franquicias (ej. **Boston Celtics**, **Lakers**), y (c) UNA sola idea táctica clave por párrafo (frase breve de 4 a 10 palabras, ej. **castigando las pérdidas rivales tras cada atrapada**). PROHIBIDO poner en negrita cifras aisladas y PROHIBIDO poner ** en TITULAR o antes de ::.',
        "6. FORMATO EXACTO CON ESTAS 7 ETIQUETAS EN MAYÚSCULAS:",
        "===TITULAR===",
        "(Titular periodístico potente de portada en 1 sola línea con foco concreto de la noche, sin # ni **).",
        "===ENTRADILLA===",
        "(Entradilla editorial de 2 a 3 líneas resumiendo los grandes focos con datos clave reales —marcadores o cifras destacadas— aplicando la regla de negritas).",
        "===CAPITULOS_DINAMICOS===",
        capitulosInstruction,
        "===PIZARRAS===",
        "(Epígrafe fijo Pizarras: 2 o 3 párrafos fluidos de lectura táctica comparada contrastando cómo los planes de partido de la noche —peso del triple frente a la pintura, presión al manejador y robos+tapones, carga del rebote ofensivo, ritmo frente al Pace medio— explicaron los resultados, citando cifras reales selectivas).",
        "===HITOS===",
        '(Epígrafe fijo Hitos: 2 o 3 párrafos de auténtica crónica narrativa sobre los protagonistas individuales de la fecha —actuaciones estelares, Career Highs verificados, triples-dobles, explosiones, noches frías de referentes, irrupciones desde el banquillo y rachas—. PROHIBICIÓN ABSOLUTA de fichas telegráficas tipo "Nombre (Equipo): 33 PTS, 5 REB, 9 AST...". Explica QUÉ hizo cada protagonista en pista y su impacto integrando solo 2 o 3 números decisivos por frase).',
        "===ESPANOLES===",
        "(Epígrafe fijo Españoles: si jugaron españoles, 1 párrafo analizando sus minutos, serie de tiro, producción exacta y contexto; si ninguno sumó minutos, 1 frase sobria, directa y natural confirmándolo).",
        "===CLAVES===",
        '(Epígrafe fijo Claves: exactamente 4 claves analíticas incisivas, una por línea con formato exacto "Título analítico corto sin ** :: Explicación táctica en 2 frases respaldada por marcador exacto y 2-3 cifras concretas aplicando negritas", sin numeración inicial. Criterio obligatorio: [1] gran exhibición individual o Career High de la noche; [2] pizarra colectiva o cerrojo táctico más determinante; [3] cierre apretado, manejo de pérdidas o factor X decisivo; [4] lectura táctica transversal de la cartelera con promedios reales de la fecha. PROHIBIDO usar ratios opacos como "tasa de tiros libres" / FTR% o afirmaciones sin cifras).',
        dailyEditorialBlock,
      ].filter(Boolean).join("\n");

      const nightVerifiedFoulOuts = [];
      for (const enr of matchEnrichments.values()) {
        if (Array.isArray(enr?.pbp?.foulOuts)) {
          for (const fo of enr.pbp.foulOuts) {
            nightVerifiedFoulOuts.push({ name: fo.playerName, foulOutPeriod: fo.periodLabel, foulOutClock: fo.clock });
          }
        }
      }

      if (dailyVersion === "v2_tactical") {
        const slateRadar = computeSlateTacticalRadar(gd, matchEnrichments);
        const v2MatchupBlocks = gd.matchups.map((m, idx) => {
          const baseBlock = detailedMatchupBlocks[idx];
          const fourFactorLine = slateRadar.perGameTacticalLines.get(m.eventId);
          const enr = matchEnrichments.get(m.eventId);
          const duelsLine =
            Array.isArray(enr?.pbp?.defensiveDuels) && enr.pbp.defensiveDuels.length > 0
              ? `  - Duelos defensivos PBP: ${enr.pbp.defensiveDuels.slice(0, 3).join(" | ")}`
              : "";
          return [baseBlock, fourFactorLine ? `  - ${fourFactorLine}` : "", duelsLine].filter(Boolean).join("\n");
        });

        const slateRecapBlocks: string[] = [];
        for (const m of gd.matchups) {
          const rec = espnSlateRecaps.digestsByEventId.get(m.eventId);
          if (rec && (rec.digest || rec.headline)) {
            slateRecapBlocks.push(
              `[${m.away.abbr} ${m.away.score}-${m.home.score} ${m.home.abbr}] ${rec.headline ? `Titular AP/ESPN: ${rec.headline}. ` : ""}${rec.digest}`
            );
          }
        }

        const dedupSourcesMap = new Map<string, { uri: string; title: string }>();
        for (const s of [
          { uri: `https://www.nba.com/games?date=${gd.selectedDate}`, title: `NBA.com — Resultados y Actas Oficiales (${gd.selectedDate})` },
          ...espnSlateRecaps.sources,
          ...pressCtx.daySources,
        ]) {
          if (s?.uri && !dedupSourcesMap.has(s.uri)) {
            dedupSourcesMap.set(s.uri, s);
          }
        }
        const v2SeedSources = Array.from(dedupSourcesMap.values()).slice(0, 8);

        const v2DayDossier = [
          `CONTEXTO DE JORNADA NBA (MOTOR TÁCTICO HÍBRIDO v2): Fecha oficial ${gd.selectedDate} (Temporada ${gd.seasonLabel}). Combina el acta oficial de RadarNBA (máxima autoridad en cifras), los Four Factors y duelos PBP de la cartelera, las crónicas oficiales post-partido AP/ESPN de toda la noche y la búsqueda web en vivo para detectar esquemas defensivos, ajustes tácticos y declaraciones post-partido verificadas.`,
          `FECHA DE LA JORNADA NBA: ${gd.selectedDate} (Temporada ${gd.seasonLabel})`,
          `PULSO GLOBAL: ${gd.pulse.gamesCount} partidos disputados | Media puntos combinados: ${gd.pulse.avgTotalPoints.toFixed(1)} PTS (media liga: ${gd.pulse.leagueAvgTotalPoints.toFixed(1)}) | Finales apretados (<=5 pts): ${gd.pulse.closeGamesCount} | Palizas (>=15 pts): ${gd.pulse.blowoutsCount} | Victorias visitantes: ${gd.pulse.roadWinsCount}/${gd.pulse.gamesCount} | Ritmo medio (Pace): ${gd.pulse.avgPace.toFixed(1)}.`,
          `CHECKLIST DE PARTIDOS OBLIGATORIOS A RESEÑAR (TOTAL: ${gd.matchups.length}, PROHIBIDO OMITIR NINGUNO): ${mandatoryMatchupsIndex}`,
          dayHeroicBlock,
          gd.statementTeamWin ? `GOLPE EN LA MESA COLECTIVO: ${gd.statementTeamWin.teamName} (${gd.statementTeamWin.summaryAdvanced}).` : "",
          `<radar_tactico_four_factors_jornada>\n${slateRadar.dossierText}\n</radar_tactico_four_factors_jornada>`,
          ``,
          `QUINTETO IDEAL DE LA NOCHE (TOP 5 GAME SCORE):`,
          ...gd.idealFive.map((p, i) => `${i + 1}. ${p.playerName} (${p.teamAbbr} ${p.isHome ? "vs" : "@"} ${p.opponentAbbr}, ${p.result}): ${p.points} PTS, ${p.rebounds} REB, ${p.assists} AST, ${p.stocks} ROB+TAP, ${p.fgm}/${p.fga} TC, ${p.fg3m}/${p.fg3a} T3, ${p.ftm}/${p.fta} TL, ${p.tsPct.toFixed(1)}% TS, ${p.turnovers} PER, ${Math.round(p.minutes)} MIN, ${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus} +/-, GmSc ${p.gameScore.toFixed(1)} (media ${p.ptsBaselineAvg.toFixed(1)} PTS)`),
          ``,
          `DESGLOSE EMPÍRICO Y FOUR FACTORS DE LOS ${gd.matchups.length} PARTIDOS:`,
          ...v2MatchupBlocks,
          ``,
          slateRecapBlocks.length > 0
            ? `<cronicas_ap_espn_cartelera_completa (${slateRecapBlocks.length}/${gd.matchups.length} partidos cubiertos)>\n${slateRecapBlocks.join("\n")}\n</cronicas_ap_espn_cartelera_completa>`
            : pressCtx.dayNotes.length > 0
            ? `TELETIPOS DE PRENSA (${gd.selectedDate}):\n${pressCtx.dayNotes.slice(0, 12).map((n) => `  • ${n}`).join("\n")}`
            : "",
          ``,
          `EXPLOSIONES FRENTE A SU MEDIA: ${gd.explosions.length > 0 ? gd.explosions.slice(0, 6).map((e) => `${e.playerName} (${e.teamAbbr} ${e.isHome ? "vs" : "@"} ${e.opponentAbbr}, ${e.result}): ${e.points} PTS (+${e.ptsDelta.toFixed(1)} vs media ${e.ptsAvg.toFixed(1)}), ${e.fgm}/${e.fga} TC, ${e.fg3m}/${e.fg3a} T3, ${e.tsPct.toFixed(1)}% TS, ${e.rebounds} REB, ${e.assists} AST, ${e.stocks} STK en ${Math.round(e.minutes)} MIN [${e.driverTag}]`).join(" | ") : "Ninguna extrema"}`,
          `BATACAZOS DE TITULARES: ${gd.slumps.length > 0 ? gd.slumps.slice(0, 5).map((s) => `${s.playerName} (${s.teamAbbr} vs ${s.opponentAbbr}, ${s.result}): ${s.points} PTS (${s.ptsDelta.toFixed(1)} vs media ${s.ptsAvg.toFixed(1)}), ${s.fgm}/${s.fga} TC, ${s.fg3m}/${s.fg3a} T3, ${s.tsPct.toFixed(1)}% TS, ${s.turnovers} PER en ${Math.round(s.minutes)} MIN [${s.driverTag}]`).join(" | ") : "Ninguno acusado"}`,
          `CAMBIOS DE ROL / PICOS DE MINUTOS: ${gd.roleShifts.length > 0 ? gd.roleShifts.slice(0, 4).map((r) => `${r.playerName} (${r.teamAbbr} vs ${r.opponentAbbr}): ${r.minutes.toFixed(0)} MIN (+${r.minutesDelta.toFixed(1)} vs media ${r.minutesAvg.toFixed(0)}), ${r.usgEst.toFixed(1)}% USG, ${r.points}P/${r.rebounds}R/${r.assists}A con ${r.fga} TCI`).join(" | ") : "Rotaciones estables"}`,
          `RACHAS DESTACADAS: ${gd.streakShifts.length > 0 ? gd.streakShifts.slice(0, 6).map((st) => `${st.playerName} (${st.teamAbbr} vs ${st.opponentAbbr}): ${st.status === "broken" ? `RACHA ROTA tras ${st.streakCount} PJ` : `PROLONGA a ${st.streakCount} PJ`} en ${st.thresholdLabel} (${st.nightValueDisplay} hoy, media racha ${st.avgDuringStreak})`).join(" | ") : "Sin rachas largas alteradas"}`,
          `TRIPLES-DOBLES DE LA NOCHE: ${tripleDoublesNight.length > 0 ? tripleDoublesNight.join(" | ") : "Ninguno"} (Total dobles-dobles: ${totalDoubleDoubles}${doubleDoublesNight.length > 0 ? `; destacados: ${doubleDoublesNight.slice(0, 4).join(" | ")}` : ""}).`,
          careerHighsNight.length > 0 ? `RÉCORDS PERSONALES DE CARRERA VERIFICADOS (CAREER HIGHS): ${careerHighsNight.map((s) => s.replace(/\*\*/g, "")).join(" | ")}` : "",
          `JUGADORES ESPAÑOLES EN LA JORNADA: ${spanishNightNotes.length > 0 ? spanishNightNotes.join(" | ") : "Ningún jugador español sumó minutos en pista esta fecha."}`,
        ].filter(Boolean).join("\n");

        const v2CapitulosInstruction = totalGamesCount >= 3
          ? `(Exactamente 3 capítulos separados por una línea con --- cubriendo el 100% de los ${totalGamesCount} partidos del CHECKLIST. Ritmo MÁS CONCISO Y ESCANEABLE que una crónica larga: párrafos directos de 3-4 líneas, cero relleno y cero repetición de lo ya dicho en RADAR_TACTICO. Formato obligatorio: "Título concreto del capítulo :: Párrafo 1\\n\\nPárrafo 2".\n- CAPÍTULO 1 (Foco Principal, 2 párrafos densos y afilados): guion del partido eje, ajuste defensivo/táctico o quiebre PBP y duelos individuales decisivos.\n- CAPÍTULO 2 (Segundo Foco, 2 párrafos ágiles): gran contraste táctico, sorpresa o segundo choque destacado de la noche explicando por qué se ganó o perdió.\n- CAPÍTULO 3 (Panorama Completo del Resto de la Cartelera — OBLIGATORIO reseñar TODOS Y CADA UNO de los ${totalGamesCount - 2} partidos restantes del CHECKLIST en 2 párrafos cohesivos): 1-2 frases precisas por partido con marcador exacto, factor táctico decisivo y protagonista con 2 cifras reales).`
          : `(Exactamente ${totalGamesCount === 1 ? "2 capítulos sobre el único duelo disputado" : "2 capítulos concisos"} separados por una línea con --- cubriendo el 100% de los ${totalGamesCount} partidos. Formato: "Título :: Párrafo 1\\n\\nPárrafo 2". Cada párrafo de 3-4 líneas, ágil y causal, sin repetir cifras ya expuestas en RADAR_TACTICO).`;

        const v2SystemInstruction = [
          "Eres el analista táctico jefe de RadarNBA en España. Escribes la Revista Táctica Híbrida de la jornada NBA: más concisa, directa y escaneable que una crónica larga, pero con verdadera profundidad de pizarra sobre POR QUÉ ganó y perdió cada equipo, emparejamientos defensivos clave y declaraciones reales post-partido.",
          "REGLAS INQUEBRANTABLES DE RIGOR, CONCISIÓN Y FUENTES HÍBRIDAS:",
          "1. JERARQUÍA DE FUENTES Y CERO INVENCIÓN: (a) En marcadores, puntos, series de tiro, porcentajes, Four Factors, rebotes, pérdidas, faltas y rachas MANDA SIEMPRE el acta oficial del dossier. (b) Usa `<cronicas_ap_espn_cartelera_completa>` y tu búsqueda web en vivo sobre los partidos de esta fecha para identificar esquemas defensivos concretos (zona, cambios, ayudas, drop, blitz, emparejamientos sobre la estrella), lesiones ocurridas durante el choque y citas textuales reales post-partido. (c) Solo menciona el nombre propio de un entrenador si aparece textualmente en `<cronicas_ap_espn_cartelera_completa>` o en un resultado verificado de búsqueda web de esta jornada; en caso contrario usa 'el cuerpo técnico de [Equipo]'. Jamás inventes citas, esquemas, Career Highs ni Buzzer Beaters/Game Winners que no figuren verificados.",
          "2. RITMO CONCISO Y ESCANEABLE (CERO REPETICIÓN): Párrafos limpios de 3 a 4 líneas máximo. Selecciona solo 2 o 3 datos decisivos por idea e intégralos con naturalidad. Si un dato ya abrió el RADAR_TACTICO, no repitas el mismo párrafo en PIZARRAS o CLAVES: aporta un ángulo nuevo en cada bloque.",
          `3. COBERTURA INTEGRAL OBLIGATORIA: Debes reseñar TODOS Y CADA UNO de los ${totalGamesCount} partidos del CHECKLIST en CAPITULOS_DINAMICOS sin omitir ninguno. Evita tópicos gastados ("En conclusión", "Cabe destacar", "Sin lugar a dudas", "arma de destrucción masiva", "el reverso de la moneda", "dar un golpe sobre la mesa").`,
          '4. GRAMÁTICA ESPAÑOLA Y NEGRITAS (**...**): Jamás escribas "los Los Angeles Lakers" (escribe "**Los Angeles Lakers**" o "los **Lakers**") ni "espalda con espalda" (usa "en back-to-back"). En el cuerpo usa **texto** SOLO para jugadores, equipos y UNA sola idea táctica breve por párrafo. PROHIBIDO poner ** en TITULAR, títulos de capítulo, títulos antes de || o antes de ::.',
          "5. FORMATO EXACTO CON ESTAS 9 ETIQUETAS EN MAYÚSCULAS:",
          "===TITULAR===",
          "(Titular periodístico afilado de 1 sola línea con foco táctico concreto de la noche, sin # ni **).",
          "===ENTRADILLA===",
          "(Entradilla concisa de 2 líneas resumiendo el pulso y el titular táctico de la cartelera con negritas editoriales).",
          "===RADAR_TACTICO===",
          '(Exactamente 3 líneas —una por línea, sin numeración— con el formato exacto "Título táctico breve sin ** || Explicación causal concisa de 1 a 2 frases con 1-2 cifras reales o emparejamiento PBP/AP-ESPN de la noche": [1] gran tendencia colectiva o techo ofensivo/defensivo Four Factors; [2] ajuste táctico o emparejamiento defensivo estrella de la noche; [3] factor de posesión, rebote ofensivo o cierre clutch decisivo).',
          "===CAPITULOS_DINAMICOS===",
          v2CapitulosInstruction,
          "===PIZARRAS===",
          "(Epígrafe fijo Pizarras: 2 párrafos ágiles y concretos comparando los planes de partido de la noche —pintura vs triple, defensas sobre el manejador, carga del rebote ofensivo o ritmo— sin repetir los mismos partidos ya desarrollados en los Capítulos 1 y 2).",
          "===HITOS===",
          "(Epígrafe fijo Hitos: 2 párrafos narrativos y ágiles sobre MVP, Career Highs verificados, triples-dobles, explosiones, noches grises de titulares y rachas. Prohibido formato lista telegráfica).",
          "===ESPANOLES===",
          "(Epígrafe fijo Españoles: 1 párrafo conciso si jugaron españoles con minutos, serie de tiro y contexto; o 1 frase sobria y directa si ninguno sumó minutos).",
          "===VOCES_NOCHE===",
          '(SOLO declaraciones REALES y VERIFICADAS post-partido procedentes de `<cronicas_ap_espn_cartelera_completa>` o de tu búsqueda web en vivo de esta jornada. Entre 1 y 3 líneas con formato exacto "Nombre completo | ABBR | Cruce ej. BOS vs NYK | Cita traducida fielmente al español sin comillas externas | Medio ej. AP/ESPN". REGLA DE ORO: Si NO encuentras citas reales verificadas de esta fecha exacta, escribe ÚNICAMENTE la palabra NINGUNA. PROHIBIDO inventar o parafrasear como cita una frase que nadie pronunció).',
          "===CLAVES===",
          '(Epígrafe fijo Claves: exactamente 4 claves breves y escaneables, una por línea con formato "Título corto sin ** :: Explicación causal de 1-2 frases con marcador exacto y 2 cifras reales": [1] gran actuación individual; [2] clave táctica/defensiva de la noche; [3] pulso clutch o factor X; [4] tendencia transversal de la cartelera).',
          dailyEditorialBlock,
        ].filter(Boolean).join("\n");

        try {
          const cascadeBudgetMs = 54000;
          const geminiCall = generateWithGeminiCascade({
            systemInstruction: v2SystemInstruction,
            contents: v2DayDossier,
            seedSources: v2SeedSources,
            budgetMs: cascadeBudgetMs,
            enableGoogleSearch: true,
          });
          const cascadeTimer = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout ${cascadeBudgetMs}ms en crónica de jornada v2`)), cascadeBudgetMs + 500)
          );
          const { text: rawText, sources, model: modelUsed, groundingUsed } = (await Promise.race([geminiCall, cascadeTimer])) as any;
          const safeRawText = reconcileVerifiedFoulOutTimings(rawText, nightVerifiedFoulOuts);
          const parsed = parseDelimitedSections(safeRawText, [
            "TITULAR",
            "ENTRADILLA",
            "RADAR_TACTICO",
            "CAPITULOS_DINAMICOS",
            "PIZARRAS",
            "HITOS",
            "ESPANOLES",
            "VOCES_NOCHE",
            "CLAVES",
          ]);
          const fallback = buildDeterministicDailyChronicle(
            gd,
            spanishNightNotes,
            matchEnrichments,
            tripleDoublesNight,
            dailyHeroicClinchers,
            careerHighsNight,
            "v2_tactical"
          );
          const radarKeys = parseTacticalKeys(parsed.RADAR_TACTICO, slateRadar.keys);
          const nightQuotes = parseNightQuotes(parsed.VOCES_NOCHE);
          const payload = {
            date: gd.selectedDate,
            seasonLabel: gd.seasonLabel,
            gamesCount: gd.pulse.gamesCount,
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            generationTimeMs: Date.now() - startTime,
            engineMode: "gemini_search",
            modelUsed,
            chronicleVersion: "v2_tactical",
            groundingUsed: Boolean(groundingUsed),
            headline: parsed.TITULAR && parsed.TITULAR.length > 12 ? stripInlineWrapper(parsed.TITULAR) : fallback.headline,
            lead: parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25 ? parsed.ENTRADILLA : fallback.lead,
            tacticalRadar: {
              keys: radarKeys,
              extremes: slateRadar.extremes,
              defensiveDuels: slateRadar.defensiveDuels,
            },
            dynamicSections: parseDynamicChapters(parsed.CAPITULOS_DINAMICOS, fallback.dynamicSections),
            pizarrasSection: parsed.PIZARRAS && parsed.PIZARRAS.length > 60 ? parsed.PIZARRAS : fallback.pizarrasSection,
            hitosSection: parsed.HITOS && parsed.HITOS.length > 60 ? parsed.HITOS : fallback.hitosSection,
            espanolesSection: parsed.ESPANOLES && parsed.ESPANOLES.length > 12 ? parsed.ESPANOLES : fallback.espanolesSection,
            nightQuotes,
            clavesList: parseClavesList(parsed.CLAVES, fallback.clavesList),
            spanishPlayersSummary:
              spanishNightNotes.length > 0
                ? spanishNightNotes.join(" · ")
                : "Sin minutos en pista de jugadores españoles en los encuentros disputados esta fecha.",
            sources: Array.isArray(sources) ? sources.slice(0, 8) : v2SeedSources,
          };
          const persistTtlMs = 7 * 24 * 60 * 60 * 1e3;
          await writeSharedPersistedNarrative(cacheKey, payload, persistTtlMs);
          return payload;
        } catch (err) {
          const rawErrStr = String(err instanceof Error ? err.message : err || "timeout/offline");
          const cleanReason = rawErrStr.replace(/[\{\}\"\:]/g, " ").replace(/\s+/g, " ").slice(0, 160);
          const isQuota = isQuotaExhaustedError(err) || cleanReason.includes("cuota_agotada_429");
          const isOverload = isTransientOverloadError(err) || cleanReason.includes("alta_demanda_503");
          console.info(
            `[RadarNBA] Activado motor determinista de jornada v2 para ${gd.selectedDate} (${
              isQuota ? "cuota_diaria_429_agotada" : isOverload ? "alta_demanda_503" : cleanReason
            })`
          );
          const fallback = buildDeterministicDailyChronicle(
            gd,
            spanishNightNotes,
            matchEnrichments,
            tripleDoublesNight,
            dailyHeroicClinchers,
            careerHighsNight,
            "v2_tactical"
          );
          fallback.generationTimeMs = Date.now() - startTime;
          fallback.missingApiKey = !getGeminiClient();
          fallback.quotaExhausted = isQuota;
          fallback.overload503 = isOverload;
          fallback.fallbackReason = isQuota
            ? `quota_exhausted_429 (${cleanReason})`
            : isOverload
            ? `overload_503 (${cleanReason})`
            : cleanReason;
          reportMemoryCache.set(cacheKey, {
            expiresAt: Date.now() + (isQuota ? 5 * 60 * 1e3 : isOverload ? 30 * 1e3 : 2 * 60 * 1e3),
            data: fallback,
          });
          return fallback;
        }
      }

      // v1_classic (100% untouched classic daily chronicle engine)
      try {
        const cascadeBudgetMs = 48000;
        const geminiCall = generateWithGeminiCascade({
          systemInstruction,
          contents: dayDossier,
          seedSources: daySeedSources,
          budgetMs: cascadeBudgetMs,
        });
        const cascadeTimer = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ${cascadeBudgetMs}ms en crónica de jornada`)), cascadeBudgetMs + 500)
        );
        const { text: rawText, sources, model: modelUsed } = (await Promise.race([geminiCall, cascadeTimer])) as any;
        const safeRawText = reconcileVerifiedFoulOutTimings(sanitizeUnverifiedCoachClaims(rawText, verifiedNightPlayerNames), nightVerifiedFoulOuts);
        const parsed = parseDelimitedSections(safeRawText, ["TITULAR", "ENTRADILLA", "CAPITULOS_DINAMICOS", "PIZARRAS", "HITOS", "ESPANOLES", "CLAVES"]);
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes, matchEnrichments, tripleDoublesNight, dailyHeroicClinchers, careerHighsNight, "v1_classic");
        const payload = { date: gd.selectedDate, seasonLabel: gd.seasonLabel, gamesCount: gd.pulse.gamesCount, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), generationTimeMs: Date.now() - startTime, engineMode: "gemini_search", modelUsed, chronicleVersion: "v1_classic", groundingUsed: false, headline: parsed.TITULAR && parsed.TITULAR.length > 12 ? stripInlineWrapper(parsed.TITULAR) : fallback.headline, lead: parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25 ? parsed.ENTRADILLA : fallback.lead, dynamicSections: parseDynamicChapters(parsed.CAPITULOS_DINAMICOS, fallback.dynamicSections), pizarrasSection: parsed.PIZARRAS && parsed.PIZARRAS.length > 60 ? parsed.PIZARRAS : fallback.pizarrasSection, hitosSection: parsed.HITOS && parsed.HITOS.length > 60 ? parsed.HITOS : fallback.hitosSection, espanolesSection: parsed.ESPANOLES && parsed.ESPANOLES.length > 12 ? parsed.ESPANOLES : fallback.espanolesSection, clavesList: parseClavesList(parsed.CLAVES, fallback.clavesList), spanishPlayersSummary: spanishNightNotes.length > 0 ? spanishNightNotes.join(" · ") : "Sin minutos en pista de jugadores españoles en los encuentros disputados esta fecha.", sources };
        const persistTtlMs = 7 * 24 * 60 * 60 * 1e3;
        await writeSharedPersistedNarrative(cacheKey, payload, persistTtlMs);
        return payload;
      } catch (err) {
        const rawErrStr = String(err instanceof Error ? err.message : err || "timeout/offline");
        const cleanReason = rawErrStr.replace(/[\{\}\"\:]/g, " ").replace(/\s+/g, " ").slice(0, 160);
        const isQuota = isQuotaExhaustedError(err) || cleanReason.includes("cuota_agotada_429");
        const isOverload = isTransientOverloadError(err) || cleanReason.includes("alta_demanda_503");
        console.info(
          `[RadarNBA] Activado motor determinista de jornada para ${gd.selectedDate} (${
            isQuota ? "cuota_diaria_429_agotada" : isOverload ? "alta_demanda_503" : cleanReason
          })`
        );
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes, matchEnrichments, tripleDoublesNight, dailyHeroicClinchers, careerHighsNight, "v1_classic");
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = !getGeminiClient();
        fallback.quotaExhausted = isQuota;
        fallback.overload503 = isOverload;
        fallback.fallbackReason = isQuota
          ? `quota_exhausted_429 (${cleanReason})`
          : isOverload
          ? `overload_503 (${cleanReason})`
          : cleanReason;
        reportMemoryCache.set(cacheKey, {
          expiresAt: Date.now() + (isQuota ? 5 * 60 * 1e3 : isOverload ? 30 * 1e3 : 2 * 60 * 1e3),
          data: fallback,
        });
        return fallback;
      }
    })();
    reportInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      reportInflight.delete(cacheKey);
    }
  }
  return { buildGameOfficialReportData, buildGameNarrativePayload, buildDeterministicGameNarrative, buildGameDayChroniclePayload, fetchLeagueScheduleGames, fetchEspnInjuriesByName, purgeNarrativeCache: purgeSharedPersistedNarrativeCache };
}
export {
  createScoutingEngine,
  purgeSharedPersistedNarrativeCache,
  translateMedicalDetailEs
};
