// @ts-nocheck
const __name = (fn, _n) => fn;
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { STATIC_SCHEDULE_2027, addDaysIso, getEasternTodayIso } from "../utils/staticSchedule.ts";
import { NBA_TEAMS_MAP } from "../utils/teamLogos.ts";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NBA_CDN_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Referer: "https://www.nba.com/", Origin: "https://www.nba.com", Accept: "application/json" };
const EAST_TEAM_ABBRS = /* @__PURE__ */ new Set(["ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS"]);
function round1(val) {
  return Math.round((Number(val) || 0) * 10) / 10;
}
function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}
function meanNums(arr) {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}
function diffDaysIso(olderIso, newerIso) {
  const a = Date.parse(`${olderIso.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${newerIso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / (24 * 60 * 60 * 1e3)) - 1;
  return Math.max(0, days);
}
function getShortTeamName(abbr, fullName) {
  const meta = NBA_TEAMS_MAP[abbr];
  if (meta) {
    if (abbr === "POR") return "Trail Blazers";
    const parts2 = meta.name.split(" ");
    return parts2[parts2.length - 1] || meta.name;
  }
  const clean = (fullName || abbr).trim();
  const parts = clean.split(" ");
  return parts[parts.length - 1] || clean;
}
function parseCdnIsoMinutes(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return round1(raw);
  }
  const str = String(raw || "").trim();
  if (!str) return 0;
  const isoMatch = str.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/i);
  if (isoMatch) {
    const mins = Number(isoMatch[1]) || 0;
    const secs = Number(isoMatch[2]) || 0;
    return round1(mins + secs / 60);
  }
  const colonMatch = str.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const mins = Number(colonMatch[1]) || 0;
    const secs = Number(colonMatch[2]) || 0;
    return round1(mins + secs / 60);
  }
  const n = Number(str);
  return Number.isFinite(n) ? round1(n) : 0;
}
function computeHollingerGameScore(s) {
  return round1(s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.oreb + 0.3 * s.dreb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.tov);
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
function getSnapshotCandidatePaths() {
  const candidates = [path.resolve(process.cwd(), "data", "nba-snapshot.json.gz"), path.resolve(__dirname, "data", "nba-snapshot.json.gz"), path.resolve(__dirname, "..", "data", "nba-snapshot.json.gz"), path.resolve(__dirname, "..", "..", "data", "nba-snapshot.json.gz"), path.resolve(__dirname, "..", "..", "..", "data", "nba-snapshot.json.gz")];
  return Array.from(new Set(candidates));
}
function getPrimarySnapshotWritePath() {
  const cwdData = path.resolve(process.cwd(), "data");
  if (fs.existsSync(cwdData)) {
    return path.join(cwdData, "nba-snapshot.json.gz");
  }
  return path.resolve(__dirname, "../../data/nba-snapshot.json.gz");
}
let memorySnapshotCache = null;
function isValidSnapshotPayload(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  const snap = candidate;
  if (snap.version !== 1) return false;
  if (!Array.isArray(snap.bios) || snap.bios.length < 250) return false;
  if (!snap.s2026 || !Array.isArray(snap.s2026.teams) || snap.s2026.teams.length < 30 || !Array.isArray(snap.s2026.players) || snap.s2026.players.length < 300) {
    return false;
  }
  if (!snap.s2027 || !Array.isArray(snap.s2027.teams) || snap.s2027.teams.length < 30 || !Array.isArray(snap.s2027.players)) {
    return false;
  }
  return true;
}
function readNbaSnapshotFromDisk() {
  for (const filePath of getSnapshotCandidatePaths()) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      if (memorySnapshotCache && memorySnapshotCache.filePath === filePath && memorySnapshotCache.mtimeMs === stat.mtimeMs) {
        return memorySnapshotCache.snapshot;
      }
      const compressed = fs.readFileSync(filePath);
      const jsonStr = zlib.gunzipSync(compressed).toString("utf8");
      const parsed = JSON.parse(jsonStr);
      if (!isValidSnapshotPayload(parsed)) {
        console.warn(`[RadarNBA Snapshot] Archivo ignorado por validaci\xF3n incompleta: ${filePath}`);
        continue;
      }
      memorySnapshotCache = { filePath, mtimeMs: stat.mtimeMs, snapshot: parsed };
      return parsed;
    } catch (err) {
      console.warn(`[RadarNBA Snapshot] No se pudo leer ${filePath}:`, err);
    }
  }
  return null;
}
function writeNbaSnapshotToDisk(snapshot) {
  if (!isValidSnapshotPayload(snapshot)) {
    throw new Error("Validaci\xF3n de seguridad abortada: el snapshot generado est\xE1 incompleto y NO sobrescribir\xE1 los datos existentes.");
  }
  const targetPath = getPrimarySnapshotWritePath();
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const jsonBuffer = Buffer.from(JSON.stringify(snapshot), "utf8");
  const gzBuffer = zlib.gzipSync(jsonBuffer, { level: 9 });
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, gzBuffer);
  fs.renameSync(tmpPath, targetPath);
  const stat = fs.statSync(targetPath);
  memorySnapshotCache = { filePath: targetPath, mtimeMs: stat.mtimeMs, snapshot };
  return { filePath: targetPath, bytesCompressed: gzBuffer.byteLength, bytesUncompressed: jsonBuffer.byteLength };
}
function serializeSeasonDatasetForSnapshot(ds) {
  return { seasonCode: ds.seasonCode, dataSource: ds.dataSource, teams: [...ds.teamsByAbbr.values()].map((t) => ({ ...t, advanced: t.advanced ? { ...t.advanced } : void 0, games: t.games.map((g) => ({ ...g })) })), players: [...ds.playersById.values()].map((p) => ({ ...p, advanced: p.advanced ? { ...p.advanced } : void 0, games: p.games.map((g) => ({ ...g })) })) };
}
function hydrateSeasonDatasetFromSnapshot(serialized) {
  const teamsByAbbr = /* @__PURE__ */ new Map();
  const tmUsageCtx = /* @__PURE__ */ new Map();
  for (const t of serialized.teams) {
    const clonedTeamGames = t.games.map((g) => {
      const tmPlays = (Number(g.fga) || 0) + 0.44 * (Number(g.fta) || 0) + (Number(g.tov) || 0);
      const rawGameMins = g.poss && g.pace ? g.poss / Math.max(70, g.pace) * 48 : 48;
      const gameMins = Math.max(48, rawGameMins);
      if (tmPlays > 0 && g.eventId) {
        tmUsageCtx.set(`${g.eventId}:${t.abbreviation}`, { tmPlays, gameMins });
      }
      return { ...g };
    });
    teamsByAbbr.set(t.abbreviation, { ...t, advanced: t.advanced ? { ...t.advanced } : void 0, games: clonedTeamGames });
  }
  const playersById = /* @__PURE__ */ new Map();
  for (const p of serialized.players) {
    const clonedPlayerGames = p.games.map((g) => {
      const mins = Number(g.minutes) || 0;
      const tAbbr = g.teamAbbr || p.teamAbbr;
      const ctx = g.eventId && tAbbr ? tmUsageCtx.get(`${g.eventId}:${tAbbr}`) : null;
      const plPlays = (Number(g.fga) || 0) + 0.44 * (Number(g.fta) || 0) + (Number(g.turnovers) || 0);
      const tmPlays = ctx && ctx.tmPlays > 0 ? ctx.tmPlays : ((Number(ctx?.poss) || 99) * 1.135);
      const gameMins = Math.max(ctx ? ctx.gameMins : 48, mins);
      const usgEst = mins > 0 && tmPlays > 0 ? round1(Math.min(55, Math.max(0, plPlays / (tmPlays * (mins / gameMins)) * 100))) : 0;
      return { ...g, usgEst };
    });
    playersById.set(p.id, { ...p, advanced: p.advanced ? { ...p.advanced } : void 0, games: clonedPlayerGames });
  }
  return { seasonCode: serialized.seasonCode, dataSource: serialized.dataSource, teamsByAbbr, playersById };
}
async function fetchCdnJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: NBA_CDN_HEADERS, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
const ESPN_ABBR_TO_NBA = { GS: "GSW", NY: "NYK", NO: "NOP", SA: "SAS", UTAH: "UTA", WSH: "WAS" };
function normalizeEspnTricode(raw) {
  const up = String(raw || "").trim().toUpperCase();
  return ESPN_ABBR_TO_NBA[up] || up;
}
function normalizeLookupNamePlain(raw) {
  return (raw || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\b(jr|sr|ii|iii|iv)\b/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
async function discoverCandidateCompletedGames2027(timeoutMs) {
  const todayIso = getEasternTodayIso();
  const nowMs = Date.now();
  const byGameId = /* @__PURE__ */ new Map();
  const liveNotFinalIds = /* @__PURE__ */ new Set();
  for (const sg of STATIC_SCHEDULE_2027) {
    if (!/^00226\d{5}$/.test(sg.gameId)) continue;
    if (sg.dateIso > todayIso) continue;
    if (sg.dateIso === todayIso && sg.dateTimeUtc) {
      const tipMs = Date.parse(sg.dateTimeUtc);
      if (!Number.isNaN(tipMs) && nowMs - tipMs < 95 * 60 * 1e3) {
        continue;
      }
    }
    byGameId.set(sg.gameId, { gameId: sg.gameId, dateIso: sg.dateIso, dateTimeUtc: sg.dateTimeUtc, awayAbbr: sg.awayAbbr, homeAbbr: sg.homeAbbr, confirmedFinal: false });
  }
  try {
    const sb = await fetchCdnJsonWithTimeout("https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json", Math.min(2e3, Math.max(900, timeoutMs)));
    const sbDateRaw = String(sb?.scoreboard?.gameDate || "").slice(0, 10);
    const sbGames = Array.isArray(sb?.scoreboard?.games) ? sb.scoreboard.games : [];
    for (const g of sbGames) {
      const gameId = String(g?.gameId || "").trim();
      if (!/^00226\d{5}$/.test(gameId)) continue;
      const statusNum = Number(g?.gameStatus) || 0;
      const statusTxt = String(g?.gameStatusText || "").trim();
      const isFinal = statusNum === 3 || /^final/i.test(statusTxt);
      if (!isFinal) {
        liveNotFinalIds.add(gameId);
        byGameId.delete(gameId);
        continue;
      }
      const awayAbbr = String(g?.awayTeam?.teamTricode || "").trim().toUpperCase();
      const homeAbbr = String(g?.homeTeam?.teamTricode || "").trim().toUpperCase();
      if (!NBA_TEAMS_MAP[awayAbbr] || !NBA_TEAMS_MAP[homeAbbr]) continue;
      const utcStr = String(g?.gameTimeUTC || g?.gameEt || "").trim();
      const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(sbDateRaw) ? sbDateRaw : normalizeScheduleDateToEasternIso("", "", utcStr) || todayIso;
      byGameId.set(gameId, { gameId, dateIso, dateTimeUtc: utcStr, awayAbbr, homeAbbr, confirmedFinal: true });
    }
  } catch {
  }
  for (const openId of liveNotFinalIds) {
    byGameId.delete(openId);
  }
  const list = [...byGameId.values()];
  list.sort((a, b) => (b.dateIso + "T" + (b.dateTimeUtc || "")).localeCompare(a.dateIso + "T" + (a.dateTimeUtc || "")));
  return list;
}
async function fetchEspnFallbackForMissingRefs(stillMissing, biosMap, remainingBudgetMs, lookbackDays = 3) {
  if (stillMissing.length === 0 || remainingBudgetMs < 900) return [];
  const todayIso = getEasternTodayIso();
  const minDateIso = addDaysIso(todayIso, -Math.max(3, lookbackDays));
  const recentMissing = stillMissing.filter((r) => r.dateIso >= minDateIso);
  if (recentMissing.length === 0) return [];
  const bioByNormAndTeam = /* @__PURE__ */ new Map();
  const bioByNormOnly = /* @__PURE__ */ new Map();
  for (const b of biosMap.values()) {
    const n = normalizeLookupNamePlain(b.name);
    if (!n) continue;
    bioByNormAndTeam.set(`${n}|${b.teamAbbr}`, b);
    if (!bioByNormOnly.has(n)) bioByNormOnly.set(n, b);
  }
  const maxDates = lookbackDays > 3 ? 12 : 3;
  const datesToQuery = Array.from(new Set(recentMissing.map((r) => r.dateIso))).slice(0, maxDates);
  const startedAt = Date.now();
  const recovered = [];
  for (const dateIso of datesToQuery) {
    const budgetLeft = remainingBudgetMs - (Date.now() - startedAt);
    if (budgetLeft < 700) break;
    const ymd = dateIso.replace(/-/g, "");
    try {
      const sb = await fetchCdnJsonWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymd}`, Math.min(1800, budgetLeft));
      const events = Array.isArray(sb?.events) ? sb.events : [];
      const matchingPairs = [];
      for (const ev of events) {
        const comp = ev?.competitions?.[0];
        const completed = Boolean(comp?.status?.type?.completed || ev?.status?.type?.completed);
        if (!completed) continue;
        const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const awayComp = competitors.find((c) => c?.homeAway === "away");
        const homeComp = competitors.find((c) => c?.homeAway === "home");
        const awayAbbr = normalizeEspnTricode(awayComp?.team?.abbreviation);
        const homeAbbr = normalizeEspnTricode(homeComp?.team?.abbreviation);
        const refMatch = recentMissing.find((r) => r.dateIso === dateIso && r.awayAbbr === awayAbbr && r.homeAbbr === homeAbbr);
        const espnEventId = String(ev?.id || "").trim();
        if (refMatch && espnEventId) {
          matchingPairs.push({ ref: refMatch, espnEventId });
        }
      }
      if (matchingPairs.length === 0) continue;
      const summaries = await Promise.allSettled(matchingPairs.map(async ({ ref, espnEventId }) => {
        const sumRaw = await fetchCdnJsonWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${espnEventId}`, Math.min(2200, Math.max(800, remainingBudgetMs - (Date.now() - startedAt))));
        const bsPlayers = Array.isArray(sumRaw?.boxscore?.players) ? sumRaw.boxscore.players : [];
        const headerComps = sumRaw?.header?.competitions?.[0]?.competitors || [];
        const buildCdnSide = __name((targetAbbr) => {
          const pBlock = bsPlayers.find((b) => normalizeEspnTricode(b?.team?.abbreviation) === targetAbbr);
          const hComp = headerComps.find((c) => normalizeEspnTricode(c?.team?.abbreviation) === targetAbbr);
          const statGroup = pBlock?.statistics?.[0] || {};
          const labels = Array.isArray(statGroup.labels) ? statGroup.labels.map((l) => String(l || "").toUpperCase()) : [];
          const athletes = Array.isArray(statGroup.athletes) ? statGroup.athletes : [];
          const idxOf = __name((lbl) => labels.indexOf(lbl), "idxOf");
          const parseMadeAtt = __name((val) => {
            const m = String(val || "").match(/^(\d+)-(\d+)$/);
            return m ? [Number(m[1]) || 0, Number(m[2]) || 0] : [0, 0];
          }, "parseMadeAtt");
          const playersOut = [];
          for (const athEntry of athletes) {
            if (athEntry?.didNotPlay) continue;
            const statsArr = Array.isArray(athEntry?.stats) ? athEntry.stats.map(String) : [];
            if (statsArr.length === 0) continue;
            const rawName = String(athEntry?.athlete?.displayName || "").trim();
            const normName = normalizeLookupNamePlain(rawName);
            const matchedBio = bioByNormAndTeam.get(`${normName}|${targetAbbr}`) || bioByNormOnly.get(normName);
            const personId = matchedBio?.id || `espn_${String(athEntry?.athlete?.id || normName)}`;
            const minStr = statsArr[idxOf("MIN")] || "0";
            const mins = parseCdnIsoMinutes(minStr);
            if (mins <= 0) continue;
            const [fgm, fga] = parseMadeAtt(statsArr[idxOf("FG")]);
            const [fg3m, fg3a] = parseMadeAtt(statsArr[idxOf("3PT")]);
            const [ftm, fta] = parseMadeAtt(statsArr[idxOf("FT")]);
            const oreb = Number(statsArr[idxOf("OREB")]) || 0;
            const dreb = Number(statsArr[idxOf("DREB")]) || 0;
            const reb = Number(statsArr[idxOf("REB")]) || oreb + dreb;
            const ast = Number(statsArr[idxOf("AST")]) || 0;
            const stl = Number(statsArr[idxOf("STL")]) || 0;
            const blk = Number(statsArr[idxOf("BLK")]) || 0;
            const tov = Number(statsArr[idxOf("TO")]) || 0;
            const pf = Number(statsArr[idxOf("PF")]) || 0;
            const pm = Number(statsArr[idxOf("+/-")]) || 0;
            const pts = Number(statsArr[idxOf("PTS")]) || 0;
            const starterFlag = athEntry?.starter === true ? "1" : "0";
            playersOut.push({ personId, name: matchedBio?.name || rawName, position: matchedBio?.position || String(athEntry?.athlete?.position?.abbreviation || "G-F"), jerseyNum: matchedBio?.jersey || String(athEntry?.athlete?.jersey || ""), starter: starterFlag, played: "1", statistics: { minutes: minStr, points: pts, fieldGoalsMade: fgm, fieldGoalsAttempted: fga, threePointersMade: fg3m, threePointersAttempted: fg3a, freeThrowsMade: ftm, freeThrowsAttempted: fta, reboundsOffensive: oreb, reboundsDefensive: dreb, reboundsTotal: reb, assists: ast, steals: stl, blocks: blk, turnovers: tov, foulsPersonal: pf, plusMinusPoints: pm } });
          }
          const scoreNum = Number(hComp?.score) || playersOut.reduce((acc, p) => acc + (Number(p.statistics.points) || 0), 0);
          return { teamTricode: targetAbbr, score: scoreNum, statistics: {}, players: playersOut };
        }, "buildCdnSide");
        const awaySide = buildCdnSide(ref.awayAbbr);
        const homeSide = buildCdnSide(ref.homeAbbr);
        if (awaySide.score <= 0 || homeSide.score <= 0) {
          throw new Error("Incomplete ESPN boxscore");
        }
        const synthesized = { gameId: ref.gameId, gameStatus: 3, gameStatusText: "Final", awayTeam: awaySide, homeTeam: homeSide };
        cdnBoxscorePermanentCache.set(ref.gameId, synthesized);
        return { ref, cdnGame: synthesized };
      }));
      for (const s of summaries) {
        if (s.status === "fulfilled") {
          recovered.push(s.value);
        }
      }
    } catch {
    }
  }
  return recovered;
}
const cdnBoxscorePermanentCache = /* @__PURE__ */ new Map();
const cdnNotYetFinalCooldown = /* @__PURE__ */ new Map();
async function applyCdnDeltaGamesTo2027(dataset, biosMap, options) {
  const maxGamesToFetch = options?.maxGamesToFetch ?? 32;
  const timeoutBudgetMs = options?.timeoutBudgetMs ?? 5500;
  const forceRefresh = options?.forceRefresh ?? false;
  const startedAt = Date.now();
  const candidateRefs = await discoverCandidateCompletedGames2027(Math.min(1600, timeoutBudgetMs));
  if (candidateRefs.length === 0) return 0;
  const existingEventIds = /* @__PURE__ */ new Set();
  for (const tm of dataset.teamsByAbbr.values()) {
    for (const g of tm.games) {
      existingEventIds.add(g.eventId);
    }
  }
  const nowMs = Date.now();
  const missingRefs = candidateRefs.filter((ref) => {
    if (existingEventIds.has(ref.gameId)) return false;
    if (!forceRefresh && !ref.confirmedFinal) {
      const coolUntil = cdnNotYetFinalCooldown.get(ref.gameId) || 0;
      if (coolUntil > nowMs) return false;
    }
    return true;
  }).slice(0, maxGamesToFetch);
  if (missingRefs.length === 0) return 0;
  const fetchedGames = [];
  const failedRefs = [];
  const batchSize = 8;
  for (let i = 0; i < missingRefs.length; i += batchSize) {
    const elapsed = Date.now() - startedAt;
    const remainingMs = timeoutBudgetMs - elapsed;
    if (remainingMs < 600) {
      failedRefs.push(...missingRefs.slice(i));
      break;
    }
    const slice = missingRefs.slice(i, i + batchSize);
    const settled = await Promise.allSettled(slice.map(async (ref) => {
      const memHit = cdnBoxscorePermanentCache.get(ref.gameId);
      if (memHit) return { ref, cdnGame: memHit };
      const raw = await fetchCdnJsonWithTimeout(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${ref.gameId}.json`, Math.min(2200, Math.max(650, remainingMs)));
      const gameObj = raw?.game;
      if (!gameObj) {
        throw new Error(`Empty CDN boxscore for ${ref.gameId}`);
      }
      const statusNum = Number(gameObj.gameStatus) || 0;
      const statusTxt = String(gameObj.gameStatusText || "").trim();
      const isFinal = statusNum === 3 || /^final/i.test(statusTxt);
      if (!isFinal) {
        cdnNotYetFinalCooldown.set(ref.gameId, Date.now() + 3 * 60 * 1e3);
        throw new Error(`Game ${ref.gameId} not yet Final (${statusTxt})`);
      }
      cdnBoxscorePermanentCache.set(ref.gameId, gameObj);
      return { ref, cdnGame: gameObj };
    }));
    for (let idx = 0; idx < settled.length; idx++) {
      const s = settled[idx];
      if (s.status === "fulfilled") {
        fetchedGames.push(s.value);
      } else {
        const reason = String(s.reason || "");
        if (!reason.includes("not yet Final")) {
          failedRefs.push(slice[idx]);
        }
      }
    }
  }
  if (failedRefs.length > 0) {
    const remainingForEspn = timeoutBudgetMs - (Date.now() - startedAt);
    if (remainingForEspn >= 900) {
      const lookbackDays = options?.lookbackDays ?? (timeoutBudgetMs >= 15e3 ? 14 : 3);
      const espnRecovered = await fetchEspnFallbackForMissingRefs(failedRefs, biosMap, remainingForEspn, lookbackDays);
      fetchedGames.push(...espnRecovered);
    }
  }
  if (fetchedGames.length === 0) return 0;
  const touchedPlayers = /* @__PURE__ */ new Set();
  for (const { ref, cdnGame } of fetchedGames) {
    const awayTeamCdn = cdnGame.awayTeam || {};
    const homeTeamCdn = cdnGame.homeTeam || {};
    const awayAbbr = String(awayTeamCdn.teamTricode || ref.awayAbbr).trim().toUpperCase();
    const homeAbbr = String(homeTeamCdn.teamTricode || ref.homeAbbr).trim().toUpperCase();
    const awayTeamSummary = dataset.teamsByAbbr.get(awayAbbr);
    const homeTeamSummary = dataset.teamsByAbbr.get(homeAbbr);
    if (!awayTeamSummary || !homeTeamSummary) continue;
    if (awayTeamSummary.games.some((x) => x.eventId === ref.gameId)) continue;
    const extractTeamTotals = __name((cdnSide) => {
      const st = cdnSide.statistics || {};
      const playersArr = Array.isArray(cdnSide.players) ? cdnSide.players : [];
      const sumPl = __name((field) => playersArr.reduce((acc, p) => acc + (Number(p?.statistics?.[field]) || 0), 0), "sumPl");
      const pts = Number(cdnSide.score) || Number(st.points) || sumPl("points");
      const fgm = Number(st.fieldGoalsMade) || sumPl("fieldGoalsMade");
      const fga = Number(st.fieldGoalsAttempted) || sumPl("fieldGoalsAttempted");
      const fg3m = Number(st.threePointersMade) || sumPl("threePointersMade");
      const fg3a = Number(st.threePointersAttempted) || sumPl("threePointersAttempted");
      const ftm = Number(st.freeThrowsMade) || sumPl("freeThrowsMade");
      const fta = Number(st.freeThrowsAttempted) || sumPl("freeThrowsAttempted");
      const oreb = Number(st.reboundsOffensive) || sumPl("reboundsOffensive");
      const dreb = Number(st.reboundsDefensive) || sumPl("reboundsDefensive");
      const reb = Number(st.reboundsTotal) || Number(st.reboundsPersonal) || oreb + dreb;
      const ast = Number(st.assists) || sumPl("assists");
      const stl = Number(st.steals) || sumPl("steals");
      const blk = Number(st.blocks) || sumPl("blocks");
      const tov = Number(st.turnoversTotal) || Number(st.turnovers) || sumPl("turnovers");
      const teamTotalMins = parseCdnIsoMinutes(st.minutes) || playersArr.reduce((acc, p) => acc + parseCdnIsoMinutes(p?.statistics?.minutes), 0) || 240;
      return { pts, fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, blk, tov, gameMins: Math.max(48, teamTotalMins / 5) };
    }, "extractTeamTotals");
    const aw = extractTeamTotals(awayTeamCdn);
    const hm = extractTeamTotals(homeTeamCdn);
    if (aw.pts <= 0 && hm.pts <= 0) continue;
    const gameMins = Math.max(aw.gameMins, hm.gameMins, 48);
    const awPossRaw = aw.fga + 0.4 * aw.fta - 1.07 * (aw.oreb / Math.max(1, aw.oreb + hm.dreb)) * (aw.fga - aw.fgm) + aw.tov;
    const hmPossRaw = hm.fga + 0.4 * hm.fta - 1.07 * (hm.oreb / Math.max(1, hm.oreb + aw.dreb)) * (hm.fga - hm.fgm) + hm.tov;
    const poss = Math.max(1, round1(0.5 * (awPossRaw + hmPossRaw)));
    const pace = round1(poss / gameMins * 48);
    const buildTeamLog = __name((me, opp, oppAbbr, isHome) => {
      const offRtg = round1(me.pts / poss * 100);
      const defRtg = round1(opp.pts / poss * 100);
      const netRtg = round1(offRtg - defRtg);
      const fgPct = me.fga > 0 ? round1(me.fgm / me.fga * 100) : 0;
      const fg3Pct = me.fg3a > 0 ? round1(me.fg3m / me.fg3a * 100) : 0;
      const ftPct = me.fta > 0 ? round1(me.ftm / me.fta * 100) : 0;
      const efgPct = me.fga > 0 ? round1((me.fgm + 0.5 * me.fg3m) / me.fga * 100) : 0;
      const tsDenom = 2 * (me.fga + 0.44 * me.fta);
      const tsPct = tsDenom > 0 ? round1(me.pts / tsDenom * 100) : 0;
      const orebPct = me.oreb + opp.dreb > 0 ? round1(me.oreb / (me.oreb + opp.dreb) * 100) : 0;
      const tovDenom = me.fga + 0.44 * me.fta + me.tov;
      const tovPct = tovDenom > 0 ? round1(me.tov / tovDenom * 100) : 0;
      return { eventId: ref.gameId, date: ref.dateIso, seasonLabel: "2026-27", opponentAbbr: oppAbbr, opponentName: NBA_TEAMS_MAP[oppAbbr]?.name || oppAbbr, isHome, result: me.pts > opp.pts ? "W" : "L", pointsFor: me.pts, pointsAgainst: opp.pts, differential: me.pts - opp.pts, totalPoints: me.pts + opp.pts, restDays: null, isBackToBack: false, fgm: me.fgm, fga: me.fga, fgPct, fg3m: me.fg3m, fg3a: me.fg3a, fg3Pct, ftm: me.ftm, fta: me.fta, ftPct, oreb: me.oreb, dreb: me.dreb, reb: me.reb, ast: me.ast, stl: me.stl, blk: me.blk, tov: me.tov, poss, offRtg, defRtg, netRtg, pace, efgPct, tsPct, orebPct, tovPct };
    }, "buildTeamLog");
    const awayLog = buildTeamLog(aw, hm, homeAbbr, false);
    const homeLog = buildTeamLog(hm, aw, awayAbbr, true);
    awayTeamSummary.games.push(awayLog);
    homeTeamSummary.games.push(homeLog);
    const scoreDisplay = `${aw.pts}-${hm.pts}`;
    const awTmPlays = Math.max(1, aw.fga + 0.44 * aw.fta + aw.tov);
    const hmTmPlays = Math.max(1, hm.fga + 0.44 * hm.fta + hm.tov);
    for (const sideInfo of [{ cdnSide: awayTeamCdn, teamAbbr: awayAbbr, oppAbbr: homeAbbr, isHome: false, result: awayLog.result, tmPlays: awTmPlays }, { cdnSide: homeTeamCdn, teamAbbr: homeAbbr, oppAbbr: awayAbbr, isHome: true, result: homeLog.result, tmPlays: hmTmPlays }]) {
      const cdnPlayers = Array.isArray(sideInfo.cdnSide.players) ? sideInfo.cdnSide.players : [];
      const teamMeta = NBA_TEAMS_MAP[sideInfo.teamAbbr];
      for (const cp of cdnPlayers) {
        const pid = String(cp?.personId || "").trim();
        if (!pid) continue;
        const fullName = String(cp?.name || "").trim() || [cp?.firstName, cp?.familyName].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
        const pos = String(cp?.position || "").trim();
        const jersey = String(cp?.jerseyNum ?? "").trim();
        const existingBio = biosMap.get(pid);
        if (!existingBio) {
          biosMap.set(pid, { id: pid, name: fullName || pid, teamId: teamMeta?.id || "", teamAbbr: sideInfo.teamAbbr, position: pos || "G-F", jersey, height: "", country: "" });
        } else if (sideInfo.teamAbbr && NBA_TEAMS_MAP[sideInfo.teamAbbr]) {
          existingBio.teamAbbr = sideInfo.teamAbbr;
          existingBio.teamId = teamMeta?.id || existingBio.teamId;
          if (jersey) existingBio.jersey = jersey;
          if (pos) existingBio.position = pos;
        }
        const playedFlag = String(cp?.played || "") === "1";
        const minutes = parseCdnIsoMinutes(cp?.statistics?.minutes);
        if (!playedFlag || minutes <= 0) continue;
        const bio = biosMap.get(pid);
        let pSummary = dataset.playersById.get(pid);
        if (!pSummary) {
          pSummary = { id: pid, name: fullName || bio?.name || pid, teamId: teamMeta?.id || bio?.teamId || "", teamAbbr: sideInfo.teamAbbr, teamName: teamMeta?.name || sideInfo.teamAbbr, position: pos || bio?.position || "G-F", jersey: jersey || bio?.jersey || void 0, height: bio?.height || void 0, country: bio?.country || void 0, games: [] };
          dataset.playersById.set(pid, pSummary);
        } else {
          pSummary.teamAbbr = sideInfo.teamAbbr;
          pSummary.teamId = teamMeta?.id || pSummary.teamId;
          pSummary.teamName = teamMeta?.name || pSummary.teamName;
        }
        if (pSummary.games.some((g) => g.eventId === ref.gameId)) continue;
        const st = cp.statistics || {};
        const pts = Number(st.points) || 0;
        const oreb = Number(st.reboundsOffensive) || 0;
        const dreb = Number(st.reboundsDefensive) || 0;
        const reb = Number(st.reboundsTotal) || oreb + dreb;
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
        const efgPct = fga > 0 ? round1((fgm + 0.5 * fg3m) / fga * 100) : 0;
        const tsDenom = 2 * (fga + 0.44 * fta);
        const tsPct = tsDenom > 0 ? round1(pts / tsDenom * 100) : 0;
        const plPoss = fga + 0.44 * fta + tov;
        const effGameMins = Math.max(gameMins, minutes);
        const usgEst = minutes > 0 && sideInfo.tmPlays > 0 ? round1(Math.min(55, Math.max(0, plPoss / (sideInfo.tmPlays * (minutes / effGameMins)) * 100))) : 0;
        const gmSc = computeHollingerGameScore({ pts, fgm, fga, ftm, fta, oreb, dreb, stl, ast, blk, pf, tov });
        const isStarter = cp?.starter === "1" || cp?.starter === true || cp?.starter === 1;
        const pLog = { eventId: ref.gameId, date: ref.dateIso, seasonLabel: "2026-27", teamAbbr: sideInfo.teamAbbr, teamId: teamMeta?.id || pSummary.teamId, opponentAbbr: sideInfo.oppAbbr, opponentName: NBA_TEAMS_MAP[sideInfo.oppAbbr]?.name || sideInfo.oppAbbr, isHome: sideInfo.isHome, result: sideInfo.result, scoreDisplay, restDays: null, isBackToBack: false, isStarter, minutes, points: pts, rebounds: reb, oreb, dreb, assists: ast, steals: stl, blocks: blk, stocks: stl + blk, turnovers: tov, fouls: pf, plusMinus: pm, fgm, fga, fgPct, fg3m, fg3a, fg3Pct, ftm, fta, ftPct, pra: pts + reb + ast, tsPct, efgPct, usgEst, gameScore: gmSc };
        pSummary.games.push(pLog);
        touchedPlayers.add(pid);
      }
    }
  }
  for (const [abbr, tm] of dataset.teamsByAbbr.entries()) {
    if (!tm.shortName) {
      tm.shortName = getShortTeamName(abbr, tm.name);
    }
    if (!tm.conference) {
      tm.conference = EAST_TEAM_ABBRS.has(abbr) ? "Este" : "Oeste";
    }
    tm.games.sort((a, b) => b.date.localeCompare(a.date));
    for (let i = 0; i < tm.games.length; i++) {
      const cur = tm.games[i];
      const prev = tm.games[i + 1];
      if (prev) {
        const rd = diffDaysIso(prev.date, cur.date);
        cur.restDays = rd;
        cur.isBackToBack = rd === 0;
      } else {
        cur.restDays = null;
        cur.isBackToBack = false;
      }
    }
    if (tm.games.length > 0) {
      const w = tm.games.filter((g) => g.result === "W").length;
      const l = tm.games.length - w;
      tm.wins = w;
      tm.losses = l;
      tm.winPct = round2(w / tm.games.length);
      tm.avgPointsFor = round1(meanNums(tm.games.map((g) => g.pointsFor)));
      tm.avgPointsAgainst = round1(meanNums(tm.games.map((g) => g.pointsAgainst)));
      tm.differential = round1(tm.avgPointsFor - tm.avgPointsAgainst);
      const homeG = tm.games.filter((g) => g.isHome);
      const roadG = tm.games.filter((g) => !g.isHome);
      const l10G = tm.games.slice(0, 10);
      tm.homeRecord = `${homeG.filter((g) => g.result === "W").length}-${homeG.filter((g) => g.result === "L").length}`;
      tm.roadRecord = `${roadG.filter((g) => g.result === "W").length}-${roadG.filter((g) => g.result === "L").length}`;
      tm.lastTenRecord = `${l10G.filter((g) => g.result === "W").length}-${l10G.filter((g) => g.result === "L").length}`;
      const firstRes = tm.games[0].result;
      let sc = 0;
      for (const g of tm.games) {
        if (g.result === firstRes) sc++;
        else break;
      }
      tm.streakCode = `${firstRes}${sc}`;
    }
  }
  for (const conf of ["Este", "Oeste"]) {
    const peers = [...dataset.teamsByAbbr.values()].filter((t) => t.conference === conf).sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
    const leader = peers[0];
    peers.forEach((t, idx) => {
      t.playoffSeed = idx + 1;
      if (leader) {
        const gb = (leader.wins - t.wins + (t.losses - leader.losses)) / 2;
        t.gamesBehind = gb <= 0 ? "0.0" : gb.toFixed(1);
      }
    });
  }
  for (const pid of touchedPlayers) {
    const p = dataset.playersById.get(pid);
    if (!p) continue;
    p.games.sort((a, b) => b.date.localeCompare(a.date));
    for (let i = 0; i < p.games.length; i++) {
      const cur = p.games[i];
      const prev = p.games[i + 1];
      if (prev) {
        const rd = diffDaysIso(prev.date, cur.date);
        cur.restDays = rd;
        cur.isBackToBack = rd === 0;
      } else {
        cur.restDays = null;
        cur.isBackToBack = false;
      }
    }
  }
  dataset.dataSource = "nba_official_hybrid";
  return fetchedGames.length;
}
export {
  applyCdnDeltaGamesTo2027,
  getPrimarySnapshotWritePath,
  getSnapshotCandidatePaths,
  hydrateSeasonDatasetFromSnapshot,
  isValidSnapshotPayload,
  readNbaSnapshotFromDisk,
  serializeSeasonDatasetForSnapshot,
  writeNbaSnapshotToDisk
};
