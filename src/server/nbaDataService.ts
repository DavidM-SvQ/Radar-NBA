// @ts-nocheck
const __name = (fn, _name) => fn;
import crypto from "crypto";
import { buildExtendedPlayerBenchmarks, seasonCycleDay } from "../utils/playerInspectorAnalytics.ts";
import { NBA_TEAMS_MAP } from "../utils/teamLogos.ts";
import { createScoutingEngine } from "./scoutingEngine.ts";
import { buildFantasyEspnSyncPayload } from "./fantasyEspnService.ts";
import zlib from "zlib";
import { packBootstrapWirePayload } from "../utils/bootstrapWireCodec.ts";
import { applyCdnDeltaGamesTo2027, hydrateSeasonDatasetFromSnapshot, readNbaSnapshotFromDisk, serializeSeasonDatasetForSnapshot, writeNbaSnapshotToDisk } from "./nbaSnapshotStore.ts";
import { buildSeasonAwardsPayload, enrichBiosWithEspnRosters } from "./seasonAwardsService.ts";
import { executeWithCircuitBreaker, identifyProviderFromUrl } from "./circuitBreaker.ts";
import { STATIC_SCHEDULE_2027 } from "../utils/staticSchedule.ts";
function isSnapshotOnlyRuntime() {
  return Boolean(process.env.VERCEL) || process.env.NBA_SNAPSHOT_ONLY === "1";
}
const staticScheduleByGameId = new Map(STATIC_SCHEDULE_2027.map((s) => [s.gameId, s]));
const NBA_STATS_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Referer: "https://www.nba.com/", Origin: "https://www.nba.com", Accept: "application/json, text/plain, */*", "x-nba-stats-origin": "stats", "x-nba-stats-token": "true", "Accept-Language": "en-US,en;q=0.9" };
const EAST_TEAM_ABBRS = /* @__PURE__ */ new Set(["ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS"]);
const jsonCache = /* @__PURE__ */ new Map();
const jsonInflight = /* @__PURE__ */ new Map();
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
function stdDevNums(arr) {
  if (arr.length < 2) return 0;
  const avg = meanNums(arr);
  let sq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - avg;
    sq += d * d;
  }
  return Math.sqrt(sq / arr.length);
}
function toPct100(raw) {
  const n = Number(raw) || 0;
  if (n === 0) return 0;
  if (Math.abs(n) <= 1.5) return round1(n * 100);
  return round1(n);
}
function normalizeText(str) {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function normalizeEspnAbbr(raw) {
  const up = (raw || "").trim().toUpperCase();
  const map = { GS: "GSW", NY: "NYK", NO: "NOP", SA: "SAS", UTAH: "UTA", WSH: "WAS" };
  return map[up] || up;
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
async function cachedFetchJson(url, ttlMs = 5 * 60 * 1e3, headers = {}, timeoutMs = 12e3, forceRefresh = false) {
  if (!forceRefresh) {
    const hit = jsonCache.get(url);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
  }
  const inflight = jsonInflight.get(url);
  if (inflight && !forceRefresh) {
    return inflight;
  }
  const provider = identifyProviderFromUrl(url);
  const p = executeWithCircuitBreaker(
    provider,
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { headers, signal: controller.signal });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} fetching ${url}`);
        }
        const data = await res.json();
        jsonCache.set(url, { expiresAt: Date.now() + ttlMs, value: data });
        return data;
      } finally {
        clearTimeout(timer);
      }
    },
    (err) => {
      const staleHit = jsonCache.get(url);
      if (staleHit) {
        console.warn(`[CircuitBreaker Fallback] Sirviendo caché stale para ${url} debido a: ${err.message}`);
        return staleHit.value;
      }
      throw err;
    }
  );
  jsonInflight.set(url, p);
  try {
    return await p;
  } finally {
    jsonInflight.delete(url);
  }
}
function parseNbaResultSet(raw) {
  const rs = Array.isArray(raw?.resultSets) ? raw.resultSets[0] : raw?.resultSet;
  if (!rs || !Array.isArray(rs.headers) || !Array.isArray(rs.rowSet)) {
    return [];
  }
  const headers = rs.headers;
  const rows = rs.rowSet;
  const out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = r[j];
    }
    out[i] = obj;
  }
  return out;
}
function computeHollingerGameScore(s) {
  return round1(s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.oreb + 0.3 * s.dreb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.tov);
}
function parseMatchupField(matchupRaw, selfAbbr) {
  const str = String(matchupRaw || "").trim();
  if (str.includes("@")) {
    const parts = str.split("@").map((s) => s.trim().toUpperCase());
    return { isHome: false, opponentAbbr: parts[1] || selfAbbr };
  }
  if (/vs\.?/i.test(str)) {
    const parts = str.split(/vs\.?/i).map((s) => s.trim().toUpperCase());
    return { isHome: true, opponentAbbr: parts[1] || selfAbbr };
  }
  return { isHome: true, opponentAbbr: "NBA" };
}
function diffDaysIso(olderIso, newerIso) {
  const a = Date.parse(`${olderIso.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${newerIso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / (24 * 60 * 60 * 1e3)) - 1;
  return Math.max(0, days);
}
let cachedBios = null;
async function getPlayerBiosMap(forceRefresh = false, options) {
  const forceLive = Boolean(options?.forceLiveStats);
  if (!forceRefresh && !forceLive && cachedBios && cachedBios.expiresAt > Date.now()) {
    return cachedBios.map;
  }
  const map = /* @__PURE__ */ new Map();
  const snap = readNbaSnapshotFromDisk();
  if (snap?.bios?.length) {
    for (const b of snap.bios) {
      if (b?.id) {
        map.set(b.id, { ...b });
      }
    }
  }
  if (isSnapshotOnlyRuntime() && !forceLive) {
    cachedBios = { expiresAt: Date.now() + 60 * 60 * 1e3, map };
    return map;
  }
  const need2026Live = forceLive || map.size < 450;
  const requests = [];
  if (need2026Live) {
    requests.push(cachedFetchJson("https://stats.nba.com/stats/playerindex?College=&Country=&DraftPick=&DraftRound=&DraftYear=&Height=&Historical=0&LeagueID=00&Season=2025-26&SeasonType=Regular%20Season&TeamID=0&Weight=", 6 * 60 * 60 * 1e3, NBA_STATS_HEADERS, 12e3, forceRefresh || forceLive));
  }
  requests.push(cachedFetchJson("https://stats.nba.com/stats/playerindex?College=&Country=&DraftPick=&DraftRound=&DraftYear=&Height=&Historical=0&LeagueID=00&Season=2026-27&SeasonType=Regular%20Season&TeamID=0&Weight=", 60 * 60 * 1e3, NBA_STATS_HEADERS, 12e3, forceRefresh || forceLive));
  const settledList = await Promise.allSettled(requests);
  let statsRowsParsed = 0;
  for (const settled of settledList) {
    if (settled.status !== "fulfilled") continue;
    const rows = parseNbaResultSet(settled.value);
    for (const r of rows) {
      const id = String(r.PERSON_ID || "").trim();
      if (!id) continue;
      statsRowsParsed++;
      const prev = map.get(id);
      const first = String(r.PLAYER_FIRST_NAME || "").trim();
      const last = String(r.PLAYER_LAST_NAME || "").trim();
      const name = [first, last].filter(Boolean).join(" ").trim();
      const teamAbbr = String(r.TEAM_ABBREVIATION || "").trim().toUpperCase();
      const teamId = String(r.TEAM_ID || "").trim() || NBA_TEAMS_MAP[teamAbbr]?.id || "";
      const fromYear = Number(r.FROM_YEAR) || prev?.fromYear;
      const draftYear = Number(r.DRAFT_YEAR) || prev?.draftYear;
      map.set(id, { id, name: name || prev?.name || id, teamId, teamAbbr: teamAbbr || "NBA", position: String(r.POSITION || prev?.position || "G-F").trim() || "G-F", jersey: String(r.JERSEY_NUMBER ?? prev?.jersey ?? "").trim(), height: String(r.HEIGHT || prev?.height || "").trim(), country: String(r.COUNTRY || prev?.country || "").trim(), ...(fromYear ? { fromYear } : {}), ...(draftYear ? { draftYear } : {}), ...(typeof prev?.experienceYears === "number" ? { experienceYears: prev.experienceYears } : {}) });
    }
  }
  if (forceLive) {
    await enrichBiosWithEspnRosters(map, { forceRefresh: true, updateActiveTeams: statsRowsParsed === 0, timeoutMs: 6e3 });
  }
  cachedBios = { expiresAt: Date.now() + 60 * 60 * 1e3, map };
  return map;
}
const seasonDatasetCache = /* @__PURE__ */ new Map();
const seasonDatasetInflight = /* @__PURE__ */ new Map();
async function buildSingleSeasonDataset(seasonCode, forceRefresh = false, options) {
  const forceLive = Boolean(options?.forceLiveStats);
  const ttlMs = seasonCode === "2026-27" ? 4 * 60 * 1e3 : 6 * 60 * 60 * 1e3;
  if (!forceRefresh && !forceLive) {
    const hit = seasonDatasetCache.get(seasonCode);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.data;
    }
  }
  const existing = seasonDatasetInflight.get(seasonCode);
  if (existing && !forceRefresh && !forceLive) {
    return existing;
  }
  const promise = (async () => {
    const snap = readNbaSnapshotFromDisk();
    if (seasonCode === "2025-26" && !forceLive && snap?.s2026) {
      const hydrated26 = hydrateSeasonDatasetFromSnapshot(snap.s2026);
      seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: hydrated26 });
      return hydrated26;
    }
    if (seasonCode === "2023-24" && !forceLive && snap?.s2024) {
      const hydrated24 = hydrateSeasonDatasetFromSnapshot(snap.s2024);
      seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: hydrated24 });
      return hydrated24;
    }
    const biosMap = await getPlayerBiosMap(forceRefresh, { forceLiveStats: forceLive });
    if (isSnapshotOnlyRuntime() && !forceLive) {
      const createEmptyTeamsMap = __name(() => new Map(Object.values(NBA_TEAMS_MAP).map((tm) => [tm.abbr, { id: tm.id, name: tm.name, shortName: tm.abbr === "POR" ? "Trail Blazers" : tm.name.split(" ").slice(-1)[0] || tm.name, abbreviation: tm.abbr, conference: EAST_TEAM_ABBRS.has(tm.abbr) ? "Este" : "Oeste", wins: 0, losses: 0, winPct: 0, playoffSeed: 0, gamesBehind: "-", streakCode: "-", homeRecord: "0-0", roadRecord: "0-0", lastTenRecord: "0-0", avgPointsFor: 0, avgPointsAgainst: 0, differential: 0, games: [] }])), "createEmptyTeamsMap");
      if (seasonCode === "2025-26") {
        const fallback26 = snap?.s2026 ? hydrateSeasonDatasetFromSnapshot(snap.s2026) : { seasonCode: "2025-26", dataSource: "espn_fallback", teamsByAbbr: createEmptyTeamsMap(), playersById: /* @__PURE__ */ new Map() };
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback26 });
        return fallback26;
      }
      if (seasonCode === "2024-25") {
        const fallback25 = snap?.s2025 ? hydrateSeasonDatasetFromSnapshot(snap.s2025) : { seasonCode: "2024-25", dataSource: "espn_fallback", teamsByAbbr: createEmptyTeamsMap(), playersById: /* @__PURE__ */ new Map() };
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback25 });
        return fallback25;
      }
      if (seasonCode === "2023-24") {
        const fallback24 = snap?.s2024 ? hydrateSeasonDatasetFromSnapshot(snap.s2024) : { seasonCode: "2023-24", dataSource: "espn_fallback", teamsByAbbr: createEmptyTeamsMap(), playersById: /* @__PURE__ */ new Map() };
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback24 });
        return fallback24;
      }
      const hydrated27 = snap?.s2027 ? hydrateSeasonDatasetFromSnapshot(snap.s2027) : { seasonCode: "2026-27", dataSource: "nba_official_hybrid", teamsByAbbr: createEmptyTeamsMap(), playersById: /* @__PURE__ */ new Map() };
      await applyCdnDeltaGamesTo2027(hydrated27, biosMap, { maxGamesToFetch: options?.cdnMaxGames ?? 32, timeoutBudgetMs: options?.cdnTimeoutMs ?? 3800, forceRefresh });
      seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: hydrated27 });
      return hydrated27;
    }
    const encSeason = encodeURIComponent(seasonCode);
    const [teamLogsRes, playerLogsRes, standingsRes, teamAdvRes, teamMiscRes, teamHustleRes, playerAdvRes, playerMiscRes, playerHustleRes] = await Promise.allSettled([cachedFetchJson(`https://stats.nba.com/stats/leaguegamelog?Counter=0&DateFrom=&DateTo=&Direction=DESC&LeagueID=00&PlayerOrTeam=T&Season=${encSeason}&SeasonType=Regular%20Season&Sorter=DATE`, ttlMs, NBA_STATS_HEADERS, 14e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguegamelog?Counter=0&DateFrom=&DateTo=&Direction=DESC&LeagueID=00&PlayerOrTeam=P&Season=${encSeason}&SeasonType=Regular%20Season&Sorter=DATE`, ttlMs, NBA_STATS_HEADERS, 16e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguestandingsv3?GroupBy=conf&LeagueID=00&Season=${encSeason}&SeasonType=Regular%20Season&Section=overall`, ttlMs, NBA_STATS_HEADERS, 11e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguedashteamstats?Conference=&DateFrom=&DateTo=&Division=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0&VsConference=&VsDivision=`, ttlMs, NBA_STATS_HEADERS, 11e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguedashteamstats?Conference=&DateFrom=&DateTo=&Division=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Misc&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0&VsConference=&VsDivision=`, ttlMs, NBA_STATS_HEADERS, 11e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguehustlestatsteam?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&TeamID=0&VsConference=&VsDivision=&Weight=`, ttlMs, NBA_STATS_HEADERS, 11e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguedashplayerstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=`, ttlMs, NBA_STATS_HEADERS, 12e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguedashplayerstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Misc&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=`, ttlMs, NBA_STATS_HEADERS, 12e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguehustlestatsplayer?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&TeamID=0&VsConference=&VsDivision=&Weight=`, ttlMs, NBA_STATS_HEADERS, 12e3, forceRefresh)]);
    const rawTeamLogs = teamLogsRes.status === "fulfilled" ? parseNbaResultSet(teamLogsRes.value) : [];
    const rawPlayerLogs = playerLogsRes.status === "fulfilled" ? parseNbaResultSet(playerLogsRes.value) : [];
    const rawStandings = standingsRes.status === "fulfilled" ? parseNbaResultSet(standingsRes.value) : [];
    const rawTeamAdv = teamAdvRes.status === "fulfilled" ? parseNbaResultSet(teamAdvRes.value) : [];
    const rawTeamMisc = teamMiscRes.status === "fulfilled" ? parseNbaResultSet(teamMiscRes.value) : [];
    const rawTeamHustle = teamHustleRes.status === "fulfilled" ? parseNbaResultSet(teamHustleRes.value) : [];
    const rawPlayerAdv = playerAdvRes.status === "fulfilled" ? parseNbaResultSet(playerAdvRes.value) : [];
    const rawPlayerMisc = playerMiscRes.status === "fulfilled" ? parseNbaResultSet(playerMiscRes.value) : [];
    const rawPlayerHustle = playerHustleRes.status === "fulfilled" ? parseNbaResultSet(playerHustleRes.value) : [];
    const teamsByAbbr = /* @__PURE__ */ new Map();
    const teamIdToAbbr = /* @__PURE__ */ new Map();
    for (const [abbr, meta] of Object.entries(NBA_TEAMS_MAP)) {
      teamIdToAbbr.set(meta.id, abbr);
      teamsByAbbr.set(abbr, { id: meta.id, name: meta.name, shortName: getShortTeamName(abbr, meta.name), abbreviation: abbr, conference: EAST_TEAM_ABBRS.has(abbr) ? "Este" : "Oeste", wins: 0, losses: 0, winPct: 0, playoffSeed: 8, gamesBehind: "0.0", streakCode: "\u2014", homeRecord: "0-0", roadRecord: "0-0", lastTenRecord: "0-0", avgPointsFor: 0, avgPointsAgainst: 0, differential: 0, games: [] });
    }
    const byGameId = /* @__PURE__ */ new Map();
    for (const r of rawTeamLogs) {
      const gid = String(r.GAME_ID || "").trim();
      if (!gid) continue;
      const list = byGameId.get(gid) || [];
      list.push(r);
      byGameId.set(gid, list);
    }
    const teamGameContextMap = /* @__PURE__ */ new Map();
    for (const [gid, pair] of byGameId.entries()) {
      for (const row of pair) {
        const abbr = String(row.TEAM_ABBREVIATION || "").trim().toUpperCase();
        const teamSummary = teamsByAbbr.get(abbr);
        if (!teamSummary) continue;
        const oppRow = pair.find((x) => String(x.TEAM_ABBREVIATION || "").trim().toUpperCase() !== abbr);
        const parsedMatchup = parseMatchupField(String(row.MATCHUP || ""), abbr);
        const oppAbbr = oppRow ? String(oppRow.TEAM_ABBREVIATION || "").trim().toUpperCase() : parsedMatchup.opponentAbbr;
        const oppName = NBA_TEAMS_MAP[oppAbbr]?.name || String(oppRow?.TEAM_NAME || oppAbbr);
        const ptsFor = Number(row.PTS) || 0;
        const pm = Number(row.PLUS_MINUS) || 0;
        const ptsAgainst = oppRow ? Number(oppRow.PTS) || 0 : Math.max(0, ptsFor - pm);
        const fgm = Number(row.FGM) || 0;
        const fga = Number(row.FGA) || 0;
        const fg3m = Number(row.FG3M) || 0;
        const fg3a = Number(row.FG3A) || 0;
        const ftm = Number(row.FTM) || 0;
        const fta = Number(row.FTA) || 0;
        const oreb = Number(row.OREB) || 0;
        const dreb = Number(row.DREB) || 0;
        const reb = Number(row.REB) || oreb + dreb;
        const ast = Number(row.AST) || 0;
        const stl = Number(row.STL) || 0;
        const blk = Number(row.BLK) || 0;
        const tov = Number(row.TOV) || 0;
        const rawMin = Number(row.MIN) || 240;
        const gameMins = Math.max(48, rawMin / 5);
        const oppFgm = Number(oppRow?.FGM) || fgm;
        const oppFga = Number(oppRow?.FGA) || fga;
        const oppFta = Number(oppRow?.FTA) || fta;
        const oppOreb = Number(oppRow?.OREB) || oreb;
        const oppDreb = Number(oppRow?.DREB) || dreb;
        const oppTov = Number(oppRow?.TOV) || tov;
        const selfPoss = fga + 0.4 * fta - 1.07 * (oreb / Math.max(1, oreb + oppDreb)) * (fga - fgm) + tov;
        const oppPoss = oppFga + 0.4 * oppFta - 1.07 * (oppOreb / Math.max(1, oppOreb + dreb)) * (oppFga - oppFgm) + oppTov;
        const poss = Math.max(1, round1(0.5 * (selfPoss + oppPoss)));
        const pace = round1(poss / gameMins * 48);
        const offRtg = round1(ptsFor / poss * 100);
        const defRtg = round1(ptsAgainst / poss * 100);
        const netRtg = round1(offRtg - defRtg);
        const fgPct = fga > 0 ? round1(fgm / fga * 100) : 0;
        const fg3Pct = fg3a > 0 ? round1(fg3m / fg3a * 100) : 0;
        const ftPct = fta > 0 ? round1(ftm / fta * 100) : 0;
        const efgPct = fga > 0 ? round1((fgm + 0.5 * fg3m) / fga * 100) : 0;
        const tsDenom = 2 * (fga + 0.44 * fta);
        const tsPct = tsDenom > 0 ? round1(ptsFor / tsDenom * 100) : 0;
        const orebPct = oreb + oppDreb > 0 ? round1(oreb / (oreb + oppDreb) * 100) : 0;
        const tovDenom = fga + 0.44 * fta + tov;
        const tovPct = tovDenom > 0 ? round1(tov / tovDenom * 100) : 0;
        const result = String(row.WL || "").toUpperCase() === "W" || ptsFor > ptsAgainst ? "W" : "L";
        const dateStr = String(row.GAME_DATE || "").slice(0, 10);
        const tLog = { eventId: gid, date: dateStr, seasonLabel: seasonCode, opponentAbbr: oppAbbr, opponentName: oppName, isHome: parsedMatchup.isHome, result, pointsFor: ptsFor, pointsAgainst: ptsAgainst, differential: ptsFor - ptsAgainst, totalPoints: ptsFor + ptsAgainst, restDays: null, isBackToBack: false, fgm, fga, fgPct, fg3m, fg3a, fg3Pct, ftm, fta, ftPct, oreb, dreb, reb, ast, stl, blk, tov, poss, offRtg, defRtg, netRtg, pace, efgPct, tsPct, orebPct, tovPct };
        teamSummary.games.push(tLog);
      }
    }
    for (const tm of teamsByAbbr.values()) {
      tm.games.sort((a, b) => b.date.localeCompare(a.date));
      for (let i = 0; i < tm.games.length; i++) {
        const cur = tm.games[i];
        const prev = tm.games[i + 1];
        if (prev) {
          const rd = diffDaysIso(prev.date, cur.date);
          cur.restDays = rd;
          cur.isBackToBack = rd === 0;
        }
        const awayPts = cur.isHome ? cur.pointsAgainst : cur.pointsFor;
        const homePts = cur.isHome ? cur.pointsFor : cur.pointsAgainst;
        teamGameContextMap.set(`${cur.eventId}:${tm.abbreviation}`, { scoreDisplay: `${awayPts}-${homePts}`, opponentName: cur.opponentName, opponentAbbr: cur.opponentAbbr, isHome: cur.isHome, result: cur.result, poss: cur.poss, tmPlays: cur.fga + 0.44 * cur.fta + cur.tov, gameMins: Math.max(48, cur.poss / Math.max(70, cur.pace) * 48), restDays: cur.restDays, isBackToBack: cur.isBackToBack });
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
    for (const s of rawStandings) {
      const tid = String(s.TeamID || "").trim();
      const abbr = teamIdToAbbr.get(tid);
      if (!abbr) continue;
      const tm = teamsByAbbr.get(abbr);
      if (!tm) continue;
      tm.wins = Number(s.WINS ?? tm.wins);
      tm.losses = Number(s.LOSSES ?? tm.losses);
      tm.winPct = Number(s.WinPCT ?? tm.winPct);
      tm.playoffSeed = Number(s.PlayoffRank || s.LeagueRank || tm.playoffSeed);
      tm.gamesBehind = String(s.ConferenceGamesBack ?? "0.0");
      if (s.strCurrentStreak) {
        tm.streakCode = String(s.strCurrentStreak).replace(/\s+/g, "");
      }
      if (s.HOME) tm.homeRecord = String(s.HOME).trim();
      if (s.ROAD) tm.roadRecord = String(s.ROAD).trim();
      if (s.L10) tm.lastTenRecord = String(s.L10).trim();
      if (s.PointsPG) tm.avgPointsFor = round1(Number(s.PointsPG));
      if (s.OppPointsPG) tm.avgPointsAgainst = round1(Number(s.OppPointsPG));
      if (s.DiffPointsPG !== void 0 && s.DiffPointsPG !== null) {
        tm.differential = round1(Number(s.DiffPointsPG));
      }
    }
    for (const conf of ["Este", "Oeste"]) {
      const peers = [...teamsByAbbr.values()].filter((t) => t.conference === conf).sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
      peers.forEach((t, idx) => {
        if (!rawStandings.length || !t.playoffSeed) {
          t.playoffSeed = idx + 1;
        }
      });
    }
    const teamMiscById = /* @__PURE__ */ new Map();
    for (const r of rawTeamMisc) teamMiscById.set(String(r.TEAM_ID), r);
    const teamHustleById = /* @__PURE__ */ new Map();
    for (const r of rawTeamHustle) teamHustleById.set(String(r.TEAM_ID), r);
    for (const r of rawTeamAdv) {
      const tid = String(r.TEAM_ID || "").trim();
      const abbr = teamIdToAbbr.get(tid);
      if (!abbr) continue;
      const tm = teamsByAbbr.get(abbr);
      if (!tm) continue;
      const misc = teamMiscById.get(tid) || {};
      const hus = teamHustleById.get(tid) || {};
      const adv = { gp: Number(r.GP) || tm.games.length, offRtg: round1(Number(r.OFF_RATING) || 0), defRtg: round1(Number(r.DEF_RATING) || 0), netRtg: round1(Number(r.NET_RATING) || 0), pace: round1(Number(r.PACE) || 99.5), pie: toPct100(r.PIE), efgPct: toPct100(r.EFG_PCT), tsPct: toPct100(r.TS_PCT), astPct: toPct100(r.AST_PCT), astTo: round2(Number(r.AST_TO) || 0), astRatio: round1(Number(r.AST_RATIO) || 0), orebPct: toPct100(r.OREB_PCT), drebPct: toPct100(r.DREB_PCT), rebPct: toPct100(r.REB_PCT), tovPct: toPct100(r.TM_TOV_PCT), ptsPaint: round1(Number(misc.PTS_PAINT) || 0), oppPtsPaint: round1(Number(misc.OPP_PTS_PAINT) || 0), pts2ndChance: round1(Number(misc.PTS_2ND_CHANCE) || 0), oppPts2ndChance: round1(Number(misc.OPP_PTS_2ND_CHANCE) || 0), ptsFastBreak: round1(Number(misc.PTS_FB) || 0), ptsOffTov: round1(Number(misc.PTS_OFF_TOV) || 0), contestedShots: round1(Number(hus.CONTESTED_SHOTS) || 0), deflections: round1(Number(hus.DEFLECTIONS) || 0), screenAssists: round1(Number(hus.SCREEN_ASSISTS) || 0), looseBalls: round1(Number(hus.LOOSE_BALLS_RECOVERED) || 0), boxOuts: round1(Number(hus.BOX_OUTS) || 0) };
      tm.advanced = adv;
    }
    const playerAdvById = /* @__PURE__ */ new Map();
    for (const r of rawPlayerAdv) playerAdvById.set(String(r.PLAYER_ID), r);
    const playerMiscById = /* @__PURE__ */ new Map();
    for (const r of rawPlayerMisc) playerMiscById.set(String(r.PLAYER_ID), r);
    const playerHustleById = /* @__PURE__ */ new Map();
    for (const r of rawPlayerHustle) playerHustleById.set(String(r.PLAYER_ID), r);
    const playersById = /* @__PURE__ */ new Map();
    for (const row of rawPlayerLogs) {
      const pid = String(row.PLAYER_ID || "").trim();
      if (!pid) continue;
      const gid = String(row.GAME_ID || "").trim();
      const tAbbr = String(row.TEAM_ABBREVIATION || "").trim().toUpperCase();
      const tMeta = NBA_TEAMS_MAP[tAbbr];
      const bio = biosMap.get(pid);
      let pSummary = playersById.get(pid);
      if (!pSummary) {
        const activeTeamAbbr = seasonCode === "2025-26" ? tAbbr || bio?.teamAbbr || "NBA" : bio?.teamAbbr && NBA_TEAMS_MAP[bio.teamAbbr] ? bio.teamAbbr : tAbbr || "NBA";
        const activeTeamMeta = NBA_TEAMS_MAP[activeTeamAbbr] || tMeta;
        pSummary = { id: pid, name: String(row.PLAYER_NAME || bio?.name || pid).trim(), teamId: activeTeamMeta?.id || String(row.TEAM_ID || bio?.teamId || ""), teamAbbr: activeTeamAbbr, teamName: activeTeamMeta?.name || String(row.TEAM_NAME || activeTeamAbbr), position: bio?.position || "G-F", jersey: bio?.jersey || void 0, height: bio?.height || void 0, country: bio?.country || void 0, games: [] };
        playersById.set(pid, pSummary);
      }
      const ctx = teamGameContextMap.get(`${gid}:${tAbbr}`);
      const parsedMatch = parseMatchupField(String(row.MATCHUP || ""), tAbbr);
      const oppAbbr = ctx?.opponentAbbr || parsedMatch.opponentAbbr;
      const oppName = ctx?.opponentName || NBA_TEAMS_MAP[oppAbbr]?.name || oppAbbr;
      const isHome = ctx ? ctx.isHome : parsedMatch.isHome;
      const result = ctx?.result || (String(row.WL || "").toUpperCase() === "W" ? "W" : "L");
      const minutes = round1(Number(row.MIN) || 0);
      const pts = Number(row.PTS) || 0;
      const reb = Number(row.REB) || 0;
      const oreb = Number(row.OREB) || 0;
      const dreb = Number(row.DREB) || 0;
      const ast = Number(row.AST) || 0;
      const stl = Number(row.STL) || 0;
      const blk = Number(row.BLK) || 0;
      const tov = Number(row.TOV) || 0;
      const pf = Number(row.PF) || 0;
      const pm = Number(row.PLUS_MINUS) || 0;
      const fgm = Number(row.FGM) || 0;
      const fga = Number(row.FGA) || 0;
      const fg3m = Number(row.FG3M) || 0;
      const fg3a = Number(row.FG3A) || 0;
      const ftm = Number(row.FTM) || 0;
      const fta = Number(row.FTA) || 0;
      const fgPct = fga > 0 ? round1(fgm / fga * 100) : 0;
      const fg3Pct = fg3a > 0 ? round1(fg3m / fg3a * 100) : 0;
      const ftPct = fta > 0 ? round1(ftm / fta * 100) : 0;
      const efgPct = fga > 0 ? round1((fgm + 0.5 * fg3m) / fga * 100) : 0;
      const tsDenom = 2 * (fga + 0.44 * fta);
      const tsPct = tsDenom > 0 ? round1(pts / tsDenom * 100) : 0;
      const teamPoss = ctx?.poss || 99;
      const tmPlays = ctx?.tmPlays && ctx.tmPlays > 0 ? ctx.tmPlays : teamPoss * 1.135;
      const gameMins = Math.max(ctx?.gameMins || 48, minutes);
      const plPoss = fga + 0.44 * fta + tov;
      const usgEst = minutes > 0 && tmPlays > 0 ? round1(Math.min(55, Math.max(0, plPoss / (tmPlays * (minutes / gameMins)) * 100))) : 0;
      const gmSc = computeHollingerGameScore({ pts, fgm, fga, ftm, fta, oreb, dreb, stl, ast, blk, pf, tov });
      const gLog = { eventId: gid, date: String(row.GAME_DATE || "").slice(0, 10), seasonLabel: seasonCode, teamAbbr: tAbbr || pSummary.teamAbbr, teamId: tMeta?.id || String(row.TEAM_ID || pSummary.teamId || ""), opponentAbbr: oppAbbr, opponentName: oppName, isHome, result, scoreDisplay: ctx?.scoreDisplay || "", restDays: ctx?.restDays ?? null, isBackToBack: ctx?.isBackToBack ?? false, minutes, points: pts, rebounds: reb, oreb, dreb, assists: ast, steals: stl, blocks: blk, stocks: stl + blk, turnovers: tov, fouls: pf, plusMinus: pm, fgm, fga, fgPct, fg3m, fg3a, fg3Pct, ftm, fta, ftPct, pra: pts + reb + ast, tsPct, efgPct, usgEst, gameScore: gmSc };
      pSummary.games.push(gLog);
    }
    for (const [pid, p] of playersById.entries()) {
      p.games.sort((a, b) => b.date.localeCompare(a.date));
      const latestLogTeam = p.games[0]?.teamAbbr;
      if (latestLogTeam && NBA_TEAMS_MAP[latestLogTeam] && (seasonCode === "2025-26" || !NBA_TEAMS_MAP[p.teamAbbr])) {
        const meta = NBA_TEAMS_MAP[latestLogTeam];
        p.teamAbbr = latestLogTeam;
        p.teamId = meta.id;
        p.teamName = meta.name;
      }
      for (let i = 0; i < p.games.length; i++) {
        const cur = p.games[i];
        const prev = p.games[i + 1];
        if (prev) {
          const rd = diffDaysIso(prev.date, cur.date);
          cur.restDays = rd;
          cur.isBackToBack = rd === 0;
        }
      }
      const advR = playerAdvById.get(pid);
      if (advR) {
        const miscR = playerMiscById.get(pid) || {};
        const husR = playerHustleById.get(pid) || {};
        const pAdv = { gp: Number(advR.GP) || p.games.length, usgPct: toPct100(advR.USG_PCT), tsPct: toPct100(advR.TS_PCT), efgPct: toPct100(advR.EFG_PCT), offRtg: round1(Number(advR.OFF_RATING) || 0), defRtg: round1(Number(advR.DEF_RATING) || 0), netRtg: round1(Number(advR.NET_RATING) || 0), pie: toPct100(advR.PIE), pace: round1(Number(advR.PACE) || 99.5), astPct: toPct100(advR.AST_PCT), astTo: round2(Number(advR.AST_TO) || 0), astRatio: round1(Number(advR.AST_RATIO) || 0), orebPct: toPct100(advR.OREB_PCT), drebPct: toPct100(advR.DREB_PCT), rebPct: toPct100(advR.REB_PCT), tovPct: toPct100(advR.TM_TOV_PCT ?? advR.E_TOV_PCT), ptsPaint: round1(Number(miscR.PTS_PAINT) || 0), pts2ndChance: round1(Number(miscR.PTS_2ND_CHANCE) || 0), ptsFastBreak: round1(Number(miscR.PTS_FB) || 0), ptsOffTov: round1(Number(miscR.PTS_OFF_TOV) || 0), foulsDrawn: round1(Number(miscR.PFD) || 0), contestedShots: round1(Number(husR.CONTESTED_SHOTS) || 0), deflections: round1(Number(husR.DEFLECTIONS) || 0), screenAssists: round1(Number(husR.SCREEN_ASSISTS) || 0), looseBalls: round1(Number(husR.LOOSE_BALLS_RECOVERED) || 0), boxOuts: round1(Number(husR.BOX_OUTS) || 0) };
        p.advanced = pAdv;
      }
    }
    if (rawTeamLogs.length === 0 || rawPlayerLogs.length === 0) {
      if (seasonCode === "2024-25" && snap?.s2025) {
        const fallback25 = hydrateSeasonDatasetFromSnapshot(snap.s2025);
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback25 });
        return fallback25;
      }
      if (seasonCode === "2023-24" && snap?.s2024) {
        const fallback24 = hydrateSeasonDatasetFromSnapshot(snap.s2024);
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback24 });
        return fallback24;
      }
      if (seasonCode === "2025-26" && snap?.s2026) {
        const fallback26 = hydrateSeasonDatasetFromSnapshot(snap.s2026);
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback26 });
        return fallback26;
      }
      if (seasonCode === "2026-27") {
        const base27 = snap?.s2027 ? hydrateSeasonDatasetFromSnapshot(snap.s2027) : { seasonCode: "2026-27", dataSource: "nba_official_hybrid", teamsByAbbr, playersById };
        await applyCdnDeltaGamesTo2027(base27, biosMap, { maxGamesToFetch: options?.cdnMaxGames ?? 60, timeoutBudgetMs: options?.cdnTimeoutMs ?? 8e3, forceRefresh: true });
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: base27 });
        return base27;
      }
    }
    const built = { seasonCode, dataSource: rawTeamLogs.length > 0 ? "nba_official_hybrid" : "espn_fallback", teamsByAbbr, playersById };
    if (seasonCode === "2026-27") {
      await applyCdnDeltaGamesTo2027(built, biosMap, { maxGamesToFetch: options?.cdnMaxGames ?? 16, timeoutBudgetMs: options?.cdnTimeoutMs ?? 4500, forceRefresh });
    }
    seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: built });
    return built;
  })();
  seasonDatasetInflight.set(seasonCode, promise);
  try {
    return await promise;
  } finally {
    seasonDatasetInflight.delete(seasonCode);
  }
}
async function getFullLeagueMemory(forceRefresh = false) {
  const [s2027, s2026] = await Promise.all([buildSingleSeasonDataset("2026-27", forceRefresh), buildSingleSeasonDataset("2025-26", false)]);
  const teams = [];
  for (const abbr of Object.keys(NBA_TEAMS_MAP)) {
    const t27 = s2027.teamsByAbbr.get(abbr);
    const t26 = s2026.teamsByAbbr.get(abbr);
    if (!t27 && !t26) continue;
    const base = t27 && t27.games.length > 0 ? t27 : t26 || t27;
    const combinedGames = [...t27?.games || [], ...t26?.games || []].sort((a, b) => b.date.localeCompare(a.date));
    teams.push({ ...base, advanced: t27?.advanced || t26?.advanced, games: combinedGames });
  }
  teams.sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
  const allPids = /* @__PURE__ */ new Set([...s2027.playersById.keys(), ...s2026.playersById.keys()]);
  const allPlayers = [];
  for (const pid of allPids) {
    const p27 = s2027.playersById.get(pid);
    const p26 = s2026.playersById.get(pid);
    const primary = p27 || p26;
    const mergedGames = [...p27?.games || [], ...p26?.games || []].sort((a, b) => b.date.localeCompare(a.date));
    if (mergedGames.length === 0) continue;
    allPlayers.push({ ...primary, jersey: p27?.jersey || p26?.jersey, height: p27?.height || p26?.height, country: p27?.country || p26?.country, advanced: p27?.advanced || p26?.advanced, games: mergedGames });
  }
  allPlayers.sort((a, b) => {
    const aRecent = meanNums(a.games.slice(0, 10).map((g) => g.points));
    const bRecent = meanNums(b.games.slice(0, 10).map((g) => g.points));
    return bRecent - aRecent || a.id.localeCompare(b.id);
  });
  return { teams, allPlayers, s2027, s2026 };
}
async function fetchLiveScoreboardGames(dateIso, forceRefresh = false) {
  try {
    const qs = dateIso ? `?dates=${dateIso.replace(/-/g, "")}` : "";
    const raw = await cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard${qs}`, 2 * 60 * 1e3, {}, isSnapshotOnlyRuntime() ? 3500 : 7e3, forceRefresh);
    const events = Array.isArray(raw?.events) ? raw.events : [];
    const list = [];
    for (const ev of events) {
      const comp = ev?.competitions?.[0];
      const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
      const awayC = competitors.find((c) => c?.homeAway === "away");
      const homeC = competitors.find((c) => c?.homeAway === "home");
      if (!awayC || !homeC) continue;
      const awayAbbr = normalizeEspnAbbr(awayC?.team?.abbreviation || "");
      const homeAbbr = normalizeEspnAbbr(homeC?.team?.abbreviation || "");
      const stateStr = String(ev?.status?.type?.state || "").toLowerCase();
      list.push({ id: String(ev?.id || ""), date: String(ev?.date || "").slice(0, 10), statusText: String(ev?.status?.type?.shortDetail || ev?.status?.type?.detail || "Programado"), isLive: stateStr === "in", isCompleted: stateStr === "post", awayAbbr, awayName: NBA_TEAMS_MAP[awayAbbr]?.name || String(awayC?.team?.displayName || awayAbbr), awayScore: Number(awayC?.score) || 0, homeAbbr, homeName: NBA_TEAMS_MAP[homeAbbr]?.name || String(homeC?.team?.displayName || homeAbbr), homeScore: Number(homeC?.score) || 0 });
    }
    return list;
  } catch {
    return [];
  }
}
async function getScoreboardDeltaPayload(clientSinceHash?: string, forceRefresh = false) {
  const games = await fetchLiveScoreboardGames(void 0, forceRefresh);
  const scoreFingerprint = games
    .map((g) => `${g.id}:${g.statusText}:${g.isLive ? 1 : 0}:${g.isCompleted ? 1 : 0}:${g.awayScore}:${g.homeScore}`)
    .join("|");
  const serverHash = crypto.createHash("md5").update(scoreFingerprint || "empty").digest("hex").slice(0, 16);
  const liveCount = games.filter((g) => g.isLive).length;

  if (clientSinceHash && clientSinceHash === serverHash) {
    return {
      unmodified: true,
      hash: serverHash,
      liveCount,
      timestamp: new Date().toISOString(),
      gamesCount: games.length,
    };
  }

  let changedGames: any[] | undefined = undefined;
  if (clientSinceHash && clientSinceHash !== serverHash) {
    changedGames = games.filter((g) => g.isLive || g.isCompleted);
  }

  return {
    unmodified: false,
    hash: serverHash,
    liveCount,
    timestamp: new Date().toISOString(),
    games,
    changedGames,
  };
}
async function getBootstrapPayload(seasonMode = "continuous", forceRefresh = false) {
  if (seasonMode === "2027") {
    const [s2027, biosMap2, scoreboard2] = await Promise.all([buildSingleSeasonDataset("2026-27", forceRefresh), getPlayerBiosMap(false), fetchLiveScoreboardGames(void 0, forceRefresh)]);
    const teams = [...s2027.teamsByAbbr.values()].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
    const players = [...s2027.playersById.values()].sort((a, b) => meanNums(b.games.map((g) => g.points)) - meanNums(a.games.map((g) => g.points)));
    return { seasonMode, dataSource: s2027.dataSource, totalLeaguePlayersAvailable: Math.max(biosMap2.size, players.length), allPlayersLoaded: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), teams, players, scoreboard: scoreboard2 };
  }
  if (seasonMode === "2026") {
    const [s2026, biosMap2, scoreboard2] = await Promise.all([buildSingleSeasonDataset("2025-26", false), getPlayerBiosMap(false), fetchLiveScoreboardGames(void 0, false)]);
    const teams = [...s2026.teamsByAbbr.values()].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
    const players = [...s2026.playersById.values()].sort((a, b) => meanNums(b.games.map((g) => g.points)) - meanNums(a.games.map((g) => g.points)));
    return { seasonMode, dataSource: s2026.dataSource, totalLeaguePlayersAvailable: Math.max(biosMap2.size, players.length), allPlayersLoaded: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), teams, players, scoreboard: scoreboard2 };
  }
  if (seasonMode === "2025") {
    const [s2025, biosMap2, scoreboard2] = await Promise.all([buildSingleSeasonDataset("2024-25", false), getPlayerBiosMap(false), fetchLiveScoreboardGames(void 0, false)]);
    const teams = [...s2025.teamsByAbbr.values()].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
    const players = [...s2025.playersById.values()].sort((a, b) => meanNums(b.games.map((g) => g.points)) - meanNums(a.games.map((g) => g.points)));
    return { seasonMode, dataSource: s2025.dataSource, totalLeaguePlayersAvailable: Math.max(biosMap2.size, players.length), allPlayersLoaded: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), teams, players, scoreboard: scoreboard2 };
  }
  if (seasonMode === "2024") {
    const [s2024, biosMap2, scoreboard2] = await Promise.all([buildSingleSeasonDataset("2023-24", false), getPlayerBiosMap(false), fetchLiveScoreboardGames(void 0, false)]);
    const teams = [...s2024.teamsByAbbr.values()].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
    const players = [...s2024.playersById.values()].sort((a, b) => meanNums(b.games.map((g) => g.points)) - meanNums(a.games.map((g) => g.points)));
    return { seasonMode, dataSource: s2024.dataSource, totalLeaguePlayersAvailable: Math.max(biosMap2.size, players.length), allPlayersLoaded: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), teams, players, scoreboard: scoreboard2 };
  }
  const [full, biosMap, scoreboard] = await Promise.all([getFullLeagueMemory(forceRefresh), getPlayerBiosMap(false), fetchLiveScoreboardGames(void 0, forceRefresh)]);
  return { seasonMode, dataSource: full.s2027.dataSource, totalLeaguePlayersAvailable: Math.max(biosMap.size, full.allPlayers.length), allPlayersLoaded: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), teams: full.teams, players: full.allPlayers, scoreboard };
}
const bootstrapWireBuffersCache = /* @__PURE__ */ new Map();
const bootstrapWireInflight = /* @__PURE__ */ new Map();
async function getBootstrapWireBuffers(seasonMode = "continuous", forceRefresh = false) {
  if (forceRefresh) {
    bootstrapWireBuffersCache.delete("2027");
    bootstrapWireBuffersCache.delete("continuous");
    if (seasonMode === "2026") {
      bootstrapWireBuffersCache.delete("2026");
    }
    if (seasonMode === "2025") {
      bootstrapWireBuffersCache.delete("2025");
    }
    if (seasonMode === "2024") {
      bootstrapWireBuffersCache.delete("2024");
    }
  } else {
    const hit = bootstrapWireBuffersCache.get(seasonMode);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.data;
    }
    const inflight = bootstrapWireInflight.get(seasonMode);
    if (inflight) {
      return inflight;
    }
  }
  const ttlMs = (seasonMode === "2026" || seasonMode === "2025" || seasonMode === "2024") ? 10 * 60 * 1e3 : 90 * 1e3;
  const promise = (async () => {
    const rawPayload = await getBootstrapPayload(seasonMode, forceRefresh);
    const wirePayload = packBootstrapWirePayload(rawPayload);
    const jsonBuffer = Buffer.from(JSON.stringify(wirePayload), "utf8");
    const gzipBuffer = zlib.gzipSync(jsonBuffer, { level: 6 });
    const entry = { wirePayload, jsonBuffer, gzipBuffer };
    bootstrapWireBuffersCache.set(seasonMode, { expiresAt: Date.now() + ttlMs, data: entry });
    return entry;
  })();
  bootstrapWireInflight.set(seasonMode, promise);
  try {
    return await promise;
  } finally {
    bootstrapWireInflight.delete(seasonMode);
  }
}
async function getBootstrapWirePayload(seasonMode = "continuous", forceRefresh = false) {
  const { wirePayload } = await getBootstrapWireBuffers(seasonMode, forceRefresh);
  return wirePayload;
}
async function searchLeaguePlayers(query) {
  const norm = normalizeText(query);
  if (norm.length < 2) return [];
  const [biosMap, full] = await Promise.all([getPlayerBiosMap(false), getFullLeagueMemory(false)]);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const p of full.allPlayers) {
    if (normalizeText(`${p.name} ${p.teamAbbr} ${p.teamName}`).includes(norm)) {
      seen.add(p.id);
      out.push({ id: p.id, name: p.name, teamAbbr: p.teamAbbr, position: p.position });
      if (out.length >= 16) return out;
    }
  }
  for (const b of biosMap.values()) {
    if (seen.has(b.id)) continue;
    if (normalizeText(`${b.name} ${b.teamAbbr}`).includes(norm)) {
      seen.add(b.id);
      out.push({ id: b.id, name: b.name, teamAbbr: b.teamAbbr, position: b.position });
      if (out.length >= 20) break;
    }
  }
  return out;
}
async function getSinglePlayerSummary(playerId, seasonMode = "continuous") {
  const [full, biosMap] = await Promise.all([getFullLeagueMemory(false), getPlayerBiosMap(false)]);
  if (seasonMode === "2027") {
    const p = full.s2027.playersById.get(playerId);
    if (p) return p;
  } else if (seasonMode === "2026") {
    const p = full.s2026.playersById.get(playerId);
    if (p) return p;
  } else if (seasonMode === "2025") {
    const s2025 = await buildSingleSeasonDataset("2024-25", false);
    const p = s2025.playersById.get(playerId);
    if (p) return p;
  } else if (seasonMode === "2024") {
    const s2024 = await buildSingleSeasonDataset("2023-24", false);
    const p = s2024.playersById.get(playerId);
    if (p) return p;
  } else {
    const p = full.allPlayers.find((x) => x.id === playerId);
    if (p) return p;
  }
  const bio = biosMap.get(playerId);
  if (!bio) return null;
  const tMeta = NBA_TEAMS_MAP[bio.teamAbbr];
  return { id: bio.id, name: bio.name, teamId: bio.teamId || tMeta?.id || "", teamAbbr: bio.teamAbbr || "NBA", teamName: tMeta?.name || bio.teamAbbr || "NBA", position: bio.position || "G-F", jersey: bio.jersey || void 0, height: bio.height || void 0, country: bio.country || void 0, games: [] };
}
let cachedInspectorBenchmarks = null;
async function getPlayerInspectorDossier(playerId) {
  const [full, biosMap] = await Promise.all([getFullLeagueMemory(false), getPlayerBiosMap(false)]);
  const pContinuous = full.allPlayers.find((x) => x.id === playerId);
  const p2027 = full.s2027.playersById.get(playerId);
  const p2026 = full.s2026.playersById.get(playerId);
  let player = pContinuous || null;
  if (!player) {
    const bio = biosMap.get(playerId);
    if (!bio) return null;
    const tMeta = NBA_TEAMS_MAP[bio.teamAbbr];
    player = { id: bio.id, name: bio.name, teamId: bio.teamId || tMeta?.id || "", teamAbbr: bio.teamAbbr || "NBA", teamName: tMeta?.name || bio.teamAbbr || "NBA", position: bio.position || "G-F", jersey: bio.jersey || void 0, height: bio.height || void 0, country: bio.country || void 0, games: [] };
  }
  const now = Date.now();
  if (!cachedInspectorBenchmarks || cachedInspectorBenchmarks.expiresAt <= now) {
    let latestLeagueDate2027 = "";
    for (const t of full.s2027.teamsByAbbr.values()) {
      if (t.games[0]?.date && t.games[0].date > latestLeagueDate2027) {
        latestLeagueDate2027 = t.games[0].date;
      }
    }
    if (!latestLeagueDate2027) {
      latestLeagueDate2027 = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    }
    const cutoffCycle = seasonCycleDay(latestLeagueDate2027);
    const players2027 = [...full.s2027.playersById.values()];
    const players2026 = [...full.s2026.playersById.values()];
    cachedInspectorBenchmarks = { expiresAt: now + 5 * 60 * 1e3, latestLeagueDate2027, benchmarksByScope: { continuous: buildExtendedPlayerBenchmarks(full.allPlayers), s2027: buildExtendedPlayerBenchmarks(players2027), s2026: buildExtendedPlayerBenchmarks(players2026), sameDate2026: buildExtendedPlayerBenchmarks(players2026, (g) => seasonCycleDay(g.date) <= cutoffCycle) } };
  }
  return { player, advanced2027: p2027?.advanced, advanced2026: p2026?.advanced, latestLeagueDate2027: cachedInspectorBenchmarks.latestLeagueDate2027, benchmarksByScope: cachedInspectorBenchmarks.benchmarksByScope };
}
async function getTeamRoster(teamId) {
  const [biosMap, full] = await Promise.all([getPlayerBiosMap(false), getFullLeagueMemory(false)]);
  const targetTeam = full.teams.find((t) => t.id === teamId || t.abbreviation.toUpperCase() === teamId.toUpperCase());
  const targetAbbr = targetTeam?.abbreviation || "";
  const roster = [];
  const seen = /* @__PURE__ */ new Set();
  for (const b of biosMap.values()) {
    if (b.teamId === teamId || targetAbbr && b.teamAbbr === targetAbbr) {
      seen.add(b.id);
      roster.push({ id: b.id, name: b.name, position: b.position || "JUG", jersey: b.jersey || "0", height: b.height || void 0, country: b.country || void 0 });
    }
  }
  if (roster.length === 0 && targetAbbr) {
    for (const p of full.allPlayers) {
      if (p.teamAbbr === targetAbbr && !seen.has(p.id)) {
        seen.add(p.id);
        roster.push({ id: p.id, name: p.name, position: p.position || "JUG", jersey: p.jersey || "0", height: p.height, country: p.country });
      }
    }
  }
  roster.sort((a, b) => {
    const na = parseInt(a.jersey, 10);
    const nb = parseInt(b.jersey, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return a.name.localeCompare(b.name);
  });
  return roster;
}
function buildIndividualMatchupKeys(params) {
  const { awaySide, homeSide, winner, loser, winnerLog, loserLog, winnerTeam, loserTeam, winnerPlayers, loserPlayers, roleShifts, streakShifts, usedFamilyCounts } = params;
  const margin = Math.abs(awaySide.score - homeSide.score);
  const totalPoints = awaySide.score + homeSide.score;
  const isRoadWin = awaySide.isWinner;
  const pace = homeSide.pace;
  const w2m = Math.max(0, winnerLog.fgm - winnerLog.fg3m);
  const w2a = Math.max(1, winnerLog.fga - winnerLog.fg3a);
  const w2Pct = w2m / w2a * 100;
  const l2m = Math.max(0, loserLog.fgm - loserLog.fg3m);
  const l2a = Math.max(1, loserLog.fga - loserLog.fg3a);
  const l2Pct = l2m / l2a * 100;
  const w2Diff = w2m - l2m;
  const pts2Diff = w2Diff * 2;
  const fg3mDiff = winnerLog.fg3m - loserLog.fg3m;
  const pts3Diff = fg3mDiff * 3;
  const w3Par = winnerLog.fg3a / Math.max(1, winnerLog.fga) * 100;
  const l3Par = loserLog.fg3a / Math.max(1, loserLog.fga) * 100;
  const ftmDiff = winnerLog.ftm - loserLog.ftm;
  const loserMissedFt = Math.max(0, loserLog.fta - loserLog.ftm);
  const winnerFtr = winnerLog.fta / Math.max(1, winnerLog.fga) * 100;
  const loserFtr = loserLog.fta / Math.max(1, loserLog.fga) * 100;
  const fgaDiff = winnerLog.fga - loserLog.fga;
  const orebDiff = winnerLog.oreb - loserLog.oreb;
  const rebDiff = winnerLog.reb - loserLog.reb;
  const tovDiff = loserLog.tov - winnerLog.tov;
  const astDiff = winnerLog.ast - loserLog.ast;
  const wAstPctOfFgm = winnerLog.ast / Math.max(1, winnerLog.fgm) * 100;
  const wAstTo = winnerLog.ast / Math.max(1, winnerLog.tov);
  const wStocks = winnerLog.stl + winnerLog.blk;
  const loserPtsVsSeason = loserTeam.avgPointsFor > 0 ? loser.score - loserTeam.avgPointsFor : 0;
  const wTop = winnerPlayers[0] || null;
  const lTop = loserPlayers[0] || null;
  const wDoubleDigits = winnerPlayers.filter((p) => p.points >= 10).length;
  const lDoubleDigits = loserPlayers.filter((p) => p.points >= 10).length;
  const candidates = [];
  if (winnerLog.efgPct + 0.8 < loserLog.efgPct) {
    const efgGap = loserLog.efgPct - winnerLog.efgPct;
    const extraShotsReason = fgaDiff >= 5 && ftmDiff >= 5 ? `lanzando ${fgaDiff} tiros de campo m\xE1s (${winnerLog.oreb} rebotes ofensivos y solo ${winnerLog.tov} p\xE9rdidas) y sumando +${ftmDiff} puntos en tiros libres` : fgaDiff >= 4 ? `fabricando ${fgaDiff} tiros a canasta m\xE1s (${winnerLog.fga} vs ${loserLog.fga} TC) gracias a ${winnerLog.oreb} rebotes ofensivos y ${tovDiff > 0 ? `${tovDiff} p\xE9rdidas menos` : `su empuje interior`}` : ftmDiff >= 4 ? `compens\xE1ndolo desde la l\xEDnea de personal con +${ftmDiff} tiros libres anotados (${winnerLog.ftm}/${winnerLog.fta} frente a ${loserLog.ftm}/${loserLog.fta})` : `exprimiendo m\xE1s posesiones \xFAtiles (${winnerLog.oreb} rebotes ofensivos y ${winnerLog.ftm} tiros libres convertidos)`;
    candidates.push({ family: "paradox_won_shooting_worse", axis: "paradox", score: 19 + efgGap * 1.55 + Math.max(0, fgaDiff) * 0.35 + Math.max(0, ftmDiff) * 0.3, simple: `**Triunfo pese a peor punter\xEDa:** Aunque ${winner.shortName} tir\xF3 peor que ${loser.shortName} (${winnerLog.efgPct.toFixed(1)}% vs ${loserLog.efgPct.toFixed(1)}% efectivo), volte\xF3 el duelo ${extraShotsReason}.`, advanced: `**Paradoja de volumen sobre acierto:** ${winner.abbr} sobrevivi\xF3 a un d\xE9ficit de -${efgGap.toFixed(1)} pp en eFG% (${winnerLog.efgPct.toFixed(1)}% vs ${loserLog.efgPct.toFixed(1)}%) imponiendo volumen (${winnerLog.fga} vs ${loserLog.fga} FGA \xB7 ${winnerLog.orebPct.toFixed(1)}% OREB \xB7 ${winnerLog.tovPct.toFixed(1)}% TOV \xB7 +${Math.max(0, ftmDiff)} FTM).` });
  }
  const winnerMissedFt = Math.max(0, winnerLog.fta - winnerLog.ftm);
  if (margin <= 7 && loserMissedFt >= 6 && loserLog.ftPct <= 73.5 && loserMissedFt >= margin && loserMissedFt - winnerMissedFt >= 4 && winnerLog.ftPct - loserLog.ftPct >= 8) {
    candidates.push({ family: "clutch_ft_bleeding", axis: "free_throws", score: 16.4 + (loserMissedFt - margin) * 1.1 + Math.max(0, 75 - loserLog.ftPct) * 0.22, simple: `**Sangr\xEDa en los tiros libres:** En un cierre por solo ${margin} puntos, ${loser.shortName} perdon\xF3 ${loserMissedFt} tiros libres (${loserLog.ftm}/${loserLog.fta}, ${loserLog.ftPct.toFixed(0)}%) frente al ${winnerLog.ftm}/${winnerLog.fta} (${winnerLog.ftPct.toFixed(0)}%) de ${winner.shortName}.`, advanced: `**Peaje cr\xEDtico en el 4,60m:** Con margen final de ${margin} pts, el ${loserLog.ftPct.toFixed(1)}% FT de ${loser.abbr} (${loserMissedFt} libres errados) hundi\xF3 su cierre frente al ${winnerLog.ftPct.toFixed(1)}% FT (${winnerLog.ftm}/${winnerLog.fta}) de ${winner.abbr}.` });
  }
  if (ftmDiff >= 11 || margin <= 6 && ftmDiff >= 7 && winnerLog.fta >= 22) {
    candidates.push({ family: "free_throw_disparity", axis: "free_throws", score: 9.2 + Math.min(4.5, Math.max(0, ftmDiff - 8) * 0.45) + (margin <= 6 ? 1.8 : 0), simple: `**Castigo constante hacia la personal:** ${winner.shortName} sac\xF3 +${ftmDiff} puntos de ventaja en tiros libres (${winnerLog.ftm}/${winnerLog.fta} al ${winnerLog.ftPct.toFixed(0)}% frente al ${loserLog.ftm}/${loserLog.fta} de ${loser.shortName}) atacando la pintura con agresividad.`, advanced: `**Agresividad hacia la l\xEDnea (+${ftmDiff} pts en libres):** ${winner.abbr} convirti\xF3 ${winnerLog.ftm}/${winnerLog.fta} en tiros libres (${winnerLog.ftPct.toFixed(0)}%) frente al ${loserLog.ftm}/${loserLog.fta} (${loserLog.ftPct.toFixed(0)}%) de ${loser.abbr}, forzando faltas en penetraci\xF3n y juego interior.` });
  }
  if (fg3mDiff >= 5 || winnerLog.fg3m >= 17 && winnerLog.fg3Pct >= 39.5 && fg3mDiff >= 3) {
    candidates.push({ family: "three_point_avalanche", axis: "perimeter", score: 10.2 + fg3mDiff * 1.05 + (winnerLog.fg3Pct >= 42.5 ? 2.2 : 0) + (winnerLog.fg3m >= 19 ? 1.8 : 0), simple: `**Bombardeo desde el per\xEDmetro:** ${winner.shortName} abri\xF3 brecha desde el arco con ${winnerLog.fg3m}/${winnerLog.fg3a} en triples (${winnerLog.fg3Pct.toFixed(1)}%), firmando +${pts3Diff} puntos exteriores m\xE1s que ${loser.shortName} (${loserLog.fg3m}/${loserLog.fg3a}).`, advanced: `**Matem\xE1tica perimetral (+${pts3Diff} pts):** ${winner.abbr} castig\xF3 con ${winnerLog.fg3m} T3 al ${winnerLog.fg3Pct.toFixed(1)}% (${w3Par.toFixed(0)}% 3PAr) frente al ${loserLog.fg3m}/${loserLog.fg3a} (${loserLog.fg3Pct.toFixed(1)}%) de ${loser.abbr}.` });
  }
  if (loserLog.fg3a >= 28 && loserLog.fg3Pct <= 26.5 && fg3mDiff >= 2) {
    const missed3 = loserLog.fg3a - loserLog.fg3m;
    candidates.push({ family: "rival_perimeter_collapse", axis: "perimeter", score: 11.8 + (27.5 - loserLog.fg3Pct) * 0.8 + missed3 * 0.14, simple: `**Apag\xF3n exterior de ${loser.shortName}:** El aro se cerr\xF3 desde lejos para ${loser.shortName}, estancado en un gris ${loserLog.fg3m}/${loserLog.fg3a} en triples (${loserLog.fg3Pct.toFixed(1)}%, ${missed3} fallos exteriores).`, advanced: `**Colapso de varianza en el triple:** Pese a volcar el ${l3Par.toFixed(0)}% de sus tiros al per\xEDmetro, ${loser.abbr} naufrag\xF3 con ${loserLog.fg3Pct.toFixed(1)}% 3P (${loserLog.fg3m}/${loserLog.fg3a}), lastrando su ataque a ${loserLog.offRtg.toFixed(1)} OffRtg.` });
  }
  if (w2Diff >= 7 && w2Pct >= 54 || fg3mDiff <= -3 && w2Diff >= 5) {
    candidates.push({ family: "interior_2pt_siege", axis: "interior", score: 10.4 + w2Diff * 0.85 + (fg3mDiff <= -3 ? 3.8 : 0) + Math.max(0, w2Pct - 56) * 0.25, simple: fg3mDiff <= -3 ? `**Martillo interior pese a ceder el triple:** Aunque encaj\xF3 ${Math.abs(fg3mDiff)} triples m\xE1s, ${winner.shortName} gobern\xF3 la pintura con un ${w2m}/${w2a} en tiros de dos (${w2Pct.toFixed(1)}%, +${pts2Diff} puntos dentro del arco).` : `**Asedio constante en la pintura:** ${winner.shortName} impuso su ley cerca del aro firmando un ${w2m}/${w2a} en tiros de dos (${w2Pct.toFixed(1)}%), por el ${l2m}/${l2a} (${l2Pct.toFixed(1)}%) de ${loser.shortName}.`, advanced: `**Dominio interior 2PT (+${pts2Diff} pts):** ${winner.abbr} convirti\xF3 el ${w2Pct.toFixed(1)}% en tiros de 2 (${w2m}/${w2a} vs ${l2m}/${l2a}, ${l2Pct.toFixed(1)}% de ${loser.abbr})${fg3mDiff <= -3 ? `, neutralizando un d\xE9ficit de ${Math.abs(pts3Diff)} pts en el triple` : ""}.` });
  }
  if (tovDiff >= 5 || winnerLog.stl >= 11 && loserLog.tov >= 15 && tovDiff >= 2 || winnerLog.tov <= 7 && tovDiff >= 3) {
    const activeHands = winnerLog.stl >= 10 && loserLog.tov >= 15;
    candidates.push({ family: activeHands ? "defensive_steals_press" : "surgical_ball_security", axis: "ball_security", score: 10.4 + Math.max(0, tovDiff) * 1.1 + (winnerLog.stl >= 11 ? 2.4 : 0) + (winnerLog.tov <= 7 ? 2 : 0), simple: activeHands ? `**Asfixia en l\xEDneas de pase:** Las manos activas de ${winner.shortName} (${winnerLog.stl} robos) provocaron ${loserLog.tov} p\xE9rdidas de ${loser.shortName} (${winnerLog.tov <= 12 ? `por solo ${winnerLog.tov} propias` : `+${tovDiff} en el balance de p\xE9rdidas`}) para castigar a campo abierto.` : winnerLog.tov <= 10 ? `**Cuidado quir\xFArgico del bal\xF3n:** ${winner.shortName} apenas concedi\xF3 ${winnerLog.tov} p\xE9rdidas en toda la noche mientras exprim\xEDa los ${loserLog.tov} balones perdidos de ${loser.shortName}.` : `**Batalla ganada en las p\xE9rdidas:** ${winner.shortName} protegi\xF3 mucho mejor sus posesiones (${winnerLog.tov} p\xE9rdidas frente a las ${loserLog.tov} de ${loser.shortName}) para inclinar el volumen ofensivo.`, advanced: `**Econom\xEDa de posesiones (TOV%):** ${winner.abbr} cerr\xF3 en ${winnerLog.tovPct.toFixed(1)}% TOV (${winnerLog.tov} p\xE9rdidas, AST/TOV ${wAstTo.toFixed(2)}) frente al ${loserLog.tovPct.toFixed(1)}% TOV (${loserLog.tov} p\xE9rdidas, ${winnerLog.stl} STL rivales) de ${loser.abbr}.` });
  }
  if (orebDiff >= 6 || winnerLog.oreb >= 15 && orebDiff >= 3 || rebDiff >= 12) {
    candidates.push({ family: "second_chance_glass", axis: "glass", score: 10 + Math.max(0, orebDiff) * 0.9 + Math.max(0, rebDiff - 6) * 0.45 + (winnerLog.oreb >= 16 ? 1.8 : 0), simple: winnerLog.oreb >= 14 && orebDiff >= 3 ? `**Segundas vidas en el cristal:** ${winner.shortName} carg\xF3 el aro rival con ${winnerLog.oreb} rebotes ofensivos (${winnerLog.reb}-${loserLog.reb} en el total) para desgastar cada defensa de ${loser.shortName}.` : `**Monopolio bajo los tableros:** ${winner.shortName} impuso su f\xEDsico dominando el rebote por ${winnerLog.reb} a ${loserLog.reb} (+${rebDiff} capturas, con ${winnerLog.oreb} rechaces en ataque).`, advanced: `**Control del rebote ofensivo:** ${winner.abbr} captur\xF3 el ${winnerLog.orebPct.toFixed(1)}% OREB (${winnerLog.oreb} vs ${loserLog.oreb} OREB \xB7 +${rebDiff} REB totales), inclinando el volumen de tiro (${winnerLog.fga} vs ${loserLog.fga} FGA).` });
  }
  if (astDiff >= 7 || winnerLog.ast >= 31 && wAstPctOfFgm >= 68) {
    candidates.push({ family: "ball_movement_clinic", axis: "playmaking", score: 9.8 + Math.max(0, astDiff) * 0.72 + (winnerLog.ast >= 33 ? 2.4 : 0) + (wAstPctOfFgm >= 72 ? 1.6 : 0), simple: `**Cl\xEDnica de pase extra:** El bal\xF3n vol\xF3 en el ataque de ${winner.shortName}, repartiendo ${winnerLog.ast} asistencias sobre ${winnerLog.fgm} canastas en juego (por ${loserLog.ast} asistencias de ${loser.shortName}).`, advanced: `**Creaci\xF3n colectiva (${wAstPctOfFgm.toFixed(0)}% AST/FGM):** ${winner.abbr} asisti\xF3 ${winnerLog.ast} de sus ${winnerLog.fgm} tiros anotados (${astDiff >= 0 ? `+${astDiff}` : astDiff} AST vs ${loser.abbr}) sosteniendo un ratio AST/TOV de ${wAstTo.toFixed(2)}.` });
  }
  if (loserPtsVsSeason <= -10.5 || winnerLog.defRtg <= 103.5 || winnerLog.blk >= 8) {
    const rimWall = winnerLog.blk >= 8;
    const defLeadLabel = winnerLog.defRtg <= 101.5 ? "Contenci\xF3n \xE9lite" : "Freno defensivo";
    candidates.push({ family: rimWall ? "rim_protection_wall" : "defensive_stranglehold", axis: "defense", score: 10.2 + Math.max(0, -loserPtsVsSeason - 7) * 0.6 + Math.max(0, 106 - winnerLog.defRtg) * 0.55 + (rimWall ? 3.2 : 0), simple: rimWall ? `**Muro protector del aro:** ${winner.shortName} intimid\xF3 cada penetraci\xF3n con ${winnerLog.blk} tapones (${wStocks} robos+tapones), frenando a ${loser.shortName} en ${loser.score} puntos (${loserLog.fgPct.toFixed(1)}% TC).` : `**Cerrojo defensivo:** ${winner.shortName} dej\xF3 a ${loser.shortName} en ${loser.score} puntos${loserPtsVsSeason <= -8 ? ` (${Math.abs(Math.round(loserPtsVsSeason))} menos de sus ${loserTeam.avgPointsFor.toFixed(1)} habituales)` : ""} y un ${loserLog.fgPct.toFixed(1)}% en tiros de campo.`, advanced: `**${defLeadLabel} (${winnerLog.defRtg.toFixed(1)} DefRtg):** ${winner.abbr} sum\xF3 ${wStocks} stocks (${winnerLog.stl} STL / ${winnerLog.blk} BLK)${loserPtsVsSeason <= -6 ? ` y sec\xF3 a ${loser.abbr} ${Math.abs(loserPtsVsSeason).toFixed(1)} pts bajo su media (${loserTeam.avgPointsFor.toFixed(1)})` : ` dejando en ${loserLog.efgPct.toFixed(1)}% eFG a ${loser.abbr}`}.` });
  }
  const xFactorCandidates = winnerPlayers.filter((p) => p.ptsBaselineAvg > 0 && p.ptsBaselineAvg <= 16.8 && (p.points >= 18 && p.ptsDelta >= 9.5 || p.ptsBaselineAvg <= 13.5 && p.points >= 16 && p.fg3m >= 4 || p.ptsBaselineAvg <= 14 && p.points >= 14 && p.plusMinus >= 18)).sort((a, b) => b.ptsDelta + b.plusMinus * 0.25 - (a.ptsDelta + a.plusMinus * 0.25));
  if (xFactorCandidates.length > 0) {
    const xf = xFactorCandidates[0];
    candidates.push({ family: "unexpected_x_factor", axis: "x_factor", score: 12.4 + Math.max(0, xf.ptsDelta - 8) * 0.68 + (xf.plusMinus >= 14 ? 1.8 : 0), simple: `**Factor X inesperado:** ${xf.playerName} rompi\xF3 el guion para ${winner.shortName} aportando ${xf.points} puntos (+${xf.ptsDelta.toFixed(1)} sobre su media de ${xf.ptsBaselineAvg.toFixed(1)})${xf.fg3m >= 4 ? ` con ${xf.fg3m}/${xf.fg3a} en triples` : xf.plusMinus >= 12 ? ` y +${xf.plusMinus} en pista` : ""}.`, advanced: `**Disrupci\xF3n de secundario:** ${xf.playerName} elev\xF3 el techo de ${winner.abbr} con ${xf.points} PTS (+${xf.ptsDelta.toFixed(1)} vs media) al ${xf.tsPct.toFixed(1)}% TS (${xf.plusMinus >= 0 ? `+${xf.plusMinus}` : xf.plusMinus} +/- en ${xf.minutes.toFixed(0)}m).` });
  } else {
    const matchRoleSpike = roleShifts.find((r) => r.teamAbbr === winner.abbr && r.points >= 15 && (r.minutesDelta >= 8 || r.usgDelta >= 8));
    if (matchRoleSpike) {
      candidates.push({ family: "role_spike_step_up", axis: "x_factor", score: 10.8 + Math.max(0, matchRoleSpike.minutesDelta - 6) * 0.35 + Math.max(0, matchRoleSpike.usgDelta - 6) * 0.3, simple: `**Paso al frente en la rotaci\xF3n:** Asumiendo galones extra (${matchRoleSpike.minutes.toFixed(0)} minutos, +${matchRoleSpike.minutesDelta.toFixed(1)} sobre su media), ${matchRoleSpike.playerName} respondi\xF3 con ${matchRoleSpike.points} puntos y ${matchRoleSpike.rebounds} rebotes para ${winner.shortName}.`, advanced: `**Expansi\xF3n de rol productiva:** ${matchRoleSpike.playerName} absorbi\xF3 ${matchRoleSpike.minutes.toFixed(0)} MIN (+${matchRoleSpike.minutesDelta.toFixed(1)}) y ${matchRoleSpike.usgEst.toFixed(1)}% USG (${matchRoleSpike.usgDelta >= 0 ? "+" : ""}${matchRoleSpike.usgDelta.toFixed(1)} pp) firmando ${matchRoleSpike.gameScore.toFixed(1)} GmSc.` });
    }
  }
  const lockedRivalStars = loserPlayers.filter((p) => p.ptsBaselineAvg >= 19.5 && p.minutes >= 20 && p.ptsDelta <= -8.5 && p.tsPct <= 47.5).sort((a, b) => a.ptsDelta - b.ptsDelta);
  if (lockedRivalStars.length > 0) {
    const ls = lockedRivalStars[0];
    candidates.push({ family: "rival_star_lockdown", axis: "rival_star", score: 12.2 + Math.abs(ls.ptsDelta) * 0.52 + Math.max(0, 48 - ls.tsPct) * 0.18, simple: `**Estrella rival maniatada:** La defensa de ${winner.shortName} sec\xF3 a ${ls.playerName}, limitado a ${ls.points} puntos (${ls.fgm}/${ls.fga} en tiros, ${Math.abs(ls.ptsDelta).toFixed(1)} por debajo de su media de ${ls.ptsBaselineAvg.toFixed(1)}).`, advanced: `**Anulaci\xF3n del generador primario:** ${ls.playerName} cay\xF3 a ${ls.points} PTS (${ls.ptsDelta.toFixed(1)} vs media) con un ${ls.tsPct.toFixed(1)}% TS (${ls.fgm}/${ls.fga} TC) en ${ls.minutes.toFixed(0)}m ante las ayudas de ${winner.abbr}.` });
  } else if (lTop && lTop.points >= 35 && lDoubleDigits <= 3) {
    candidates.push({ family: "lonely_rival_star", axis: "rival_star", score: 11.2 + (lTop.points - 33) * 0.48, simple: `**Estrella sin escolta en ${loser.shortName}:** Los ${lTop.points} puntos de ${lTop.playerName} (${lTop.fgm}/${lTop.fga} en tiros) quedaron hu\xE9rfanos de apoyo coral (solo ${Math.max(0, lDoubleDigits - 1)} compa\xF1eros m\xE1s llegaron a 10 puntos).`, advanced: `**Hiperdependencia rival:** Pese a los ${lTop.points} PTS (${lTop.gameScore.toFixed(1)} GmSc) de ${lTop.playerName} (${(lTop.points / Math.max(1, loser.score) * 100).toFixed(0)}% del total de ${loser.abbr}), su rotaci\xF3n secundaria naufrag\xF3.` });
  }
  const tdPlayer = winnerPlayers.find((p) => {
    const cats = (p.points >= 10 ? 1 : 0) + (p.rebounds >= 10 ? 1 : 0) + (p.assists >= 10 ? 1 : 0) + (p.steals >= 10 ? 1 : 0) + (p.blocks >= 10 ? 1 : 0);
    return cats >= 3;
  });
  if (tdPlayer) {
    candidates.push({ family: "triple_double_command", axis: "star_outlier", score: 13.8 + Math.max(0, tdPlayer.gameScore - 25) * 0.5, simple: `**Triple-doble total de ${tdPlayer.playerName}:** Gobern\xF3 cada faceta del juego con ${tdPlayer.points} puntos, ${tdPlayer.rebounds} rebotes y ${tdPlayer.assists} asistencias (${tdPlayer.plusMinus >= 0 ? `+${tdPlayer.plusMinus}` : tdPlayer.plusMinus} en pista) para conducir a ${winner.shortName}.`, advanced: `**Motor integral (${tdPlayer.gameScore.toFixed(1)} GmSc):** Triple-doble de ${tdPlayer.playerName} (${tdPlayer.points}P/${tdPlayer.rebounds}R/${tdPlayer.assists}A) al ${tdPlayer.tsPct.toFixed(1)}% TS con ${tdPlayer.usgEst.toFixed(1)}% USG (${tdPlayer.plusMinus >= 0 ? `+${tdPlayer.plusMinus}` : tdPlayer.plusMinus} +/-).` });
  } else if (wTop && (wTop.points >= 38 || wTop.ptsDelta >= 12.5 || wTop.gameScore >= 32)) {
    candidates.push({ family: "supernova_star_eruption", axis: "star_outlier", score: 12.2 + Math.max(0, wTop.gameScore - 28) * 0.62, simple: `**Exhibici\xF3n imparable de ${wTop.playerName}:** Desat\xF3 ${wTop.points} puntos (${wTop.ptsDelta >= 8 ? `+${wTop.ptsDelta.toFixed(1)} sobre su media habitual, ` : ""}${wTop.fgm}/${wTop.fga} en tiros) sin que la defensa de ${loser.shortName} encontrara ant\xEDdoto.`, advanced: `**Techo individual MVP (${wTop.gameScore.toFixed(1)} GmSc):** ${wTop.playerName} produjo ${wTop.points} PTS (${wTop.ptsDelta >= 0 ? `+${wTop.ptsDelta.toFixed(1)}` : wTop.ptsDelta.toFixed(1)} vs media) al ${wTop.tsPct.toFixed(1)}% TS con ${wTop.usgEst.toFixed(1)}% USG.` });
  } else if (winnerPlayers.length >= 2 && winnerPlayers[0].points >= 26 && winnerPlayers[1].points >= 24 && winnerPlayers[0].points + winnerPlayers[1].points >= Math.max(55, winner.score * 0.48)) {
    const p1 = winnerPlayers[0];
    const p2 = winnerPlayers[1];
    const duoPts = p1.points + p2.points;
    candidates.push({ family: "star_duo_punch", axis: "star_outlier", score: 11 + (duoPts - 54) * 0.4, simple: `**Doble martillo ofensivo:** ${p1.playerName} (${p1.points} PTS) y ${p2.playerName} (${p2.points} PTS) se combinaron para ${duoPts} puntos, desbordando las ayudas de ${loser.shortName}.`, advanced: `**Doble gravedad ofensiva:** ${p1.playerName} (${p1.tsPct.toFixed(0)}% TS) y ${p2.playerName} (${p2.tsPct.toFixed(0)}% TS) generaron el ${(duoPts / Math.max(1, winner.score) * 100).toFixed(0)}% del marcador de ${winner.abbr} (${duoPts} PTS conjuntos).` });
  }
  const brokenRivalStreak = streakShifts.find((s) => s.status === "broken" && s.teamAbbr === loser.abbr && s.streakCount >= 6);
  const extendedWinnerStreak = streakShifts.find((s) => s.status === "extended" && s.teamAbbr === winner.abbr && s.streakCount >= 8);
  if (brokenRivalStreak) {
    candidates.push({ family: "snapped_rival_streak", axis: "rival_star", score: 11.4 + (brokenRivalStreak.streakCount - 5) * 0.55, simple: `**Racha cortada de ra\xEDz:** ${winner.shortName} fren\xF3 la racha de ${brokenRivalStreak.streakCount} partidos seguidos en ${brokenRivalStreak.thresholdLabel} de ${brokenRivalStreak.playerName}, dej\xE1ndolo esta noche en ${brokenRivalStreak.nightValueDisplay}.`, advanced: `**Ruptura de tendencia estad\xEDstica:** ${brokenRivalStreak.playerName} vio cortada su serie activa de ${brokenRivalStreak.streakCount} encuentros en ${brokenRivalStreak.thresholdLabel} (qued\xE1ndose en ${brokenRivalStreak.nightValueDisplay} frente a ${brokenRivalStreak.avgDuringStreak} de media en la racha).` });
  } else if (extendedWinnerStreak) {
    candidates.push({ family: "extended_winner_streak", axis: "star_outlier", score: 10.6 + (extendedWinnerStreak.streakCount - 7) * 0.45, simple: `**Racha en estado de gracia:** ${extendedWinnerStreak.playerName} prolong\xF3 a ${extendedWinnerStreak.streakCount} noches consecutivas su racha de ${extendedWinnerStreak.thresholdLabel} (${extendedWinnerStreak.nightValueDisplay} hoy) impulsando a ${winner.shortName}.`, advanced: `**Continuidad de racha \xE9lite:** ${extendedWinnerStreak.playerName} encaden\xF3 su ${extendedWinnerStreak.streakCount}\xBA partido consecutivo en ${extendedWinnerStreak.thresholdLabel} (${extendedWinnerStreak.nightValueDisplay}, promedio de ${extendedWinnerStreak.avgDuringStreak} en la serie).` });
  }
  if (wDoubleDigits >= 6 && (wDoubleDigits - lDoubleDigits >= 2 || !wTop || wTop.points <= 25)) {
    candidates.push({ family: "coral_collective_depth", axis: "depth", score: 10.6 + (wDoubleDigits - 5) * 1.45 + Math.max(0, wDoubleDigits - lDoubleDigits) * 0.65, simple: `**Victoria coral de toda la plantilla:** Hasta ${wDoubleDigits} jugadores de ${winner.shortName} sumaron dobles d\xEDgitos en anotaci\xF3n (por ${lDoubleDigits} en ${loser.shortName}), castigando cada rotaci\xF3n rival.`, advanced: `**Profundidad y reparto ofensivo:** ${wDoubleDigits} efectivos con \u226510 PTS sostuvieron los ${winnerLog.offRtg.toFixed(1)} OffRtg de ${winner.abbr} sin monopolio de uso (techo individual de ${wTop ? wTop.usgEst.toFixed(1) : "24.0"}% USG).` });
  } else {
    const benchRunPlayer = winnerPlayers.slice(2).filter((p) => p.plusMinus >= 17 && p.minutes >= 15 && margin <= 16).sort((a, b) => b.plusMinus - a.plusMinus)[0];
    if (benchRunPlayer) {
      candidates.push({ family: "rotation_plus_minus_run", axis: "depth", score: 10.3 + (benchRunPlayer.plusMinus - 15) * 0.38, simple: `**Parcial demoledor de rotaci\xF3n:** Los minutos en cancha de ${benchRunPlayer.playerName} arrojaron un +${benchRunPlayer.plusMinus} en el marcador (${benchRunPlayer.points}P \xB7 ${benchRunPlayer.rebounds}R \xB7 ${benchRunPlayer.assists}A en ${benchRunPlayer.minutes.toFixed(0)}m) para romper la igualdad.`, advanced: `**Impacto neto de rotaci\xF3n (+/-):** ${benchRunPlayer.playerName} inclin\xF3 los tramos puente con +${benchRunPlayer.plusMinus} en ${benchRunPlayer.minutes.toFixed(0)} MIN (${benchRunPlayer.gameScore.toFixed(1)} GmSc) en un choque de ${margin} pts de margen.` });
    }
  }
  if (winner.isBackToBack && !loser.isBackToBack) {
    candidates.push({ family: "b2b_resilience_win", axis: "context_pace", score: 10.6 + (isRoadWin ? 2 : 0) + (margin >= 9 ? 1 : 0), simple: `**Pulso f\xEDsico sin descanso:** Pese a jugar en segunda noche consecutiva (Back-to-Back)${isRoadWin ? " y a domicilio" : ""}, ${winner.shortName} sostuvo piernas y concentraci\xF3n ante un ${loser.shortName} descansado.`, advanced: `**Resiliencia en Back-to-Back (0 d\xEDas reposo):** Desafiando el peaje de calendario${isRoadWin ? " como visitante" : ""}, ${winner.abbr} firm\xF3 +${winner.netRtg.toFixed(1)} NetRtg (${winner.offRtg.toFixed(1)} OffRtg) a ${pace.toFixed(1)} Pace.` });
  } else if (loser.isBackToBack && !winner.isBackToBack && (loserLog.efgPct <= 49.5 || margin >= 10)) {
    candidates.push({ family: "rival_b2b_fatigue", axis: "context_pace", score: 10 + (margin >= 12 ? 1.4 : 0), simple: `**Factura f\xEDsica del calendario:** ${winner.shortName} impuso piernas frescas ante un ${loser.shortName} sin descanso (Back-to-Back) que acus\xF3 el desgaste en el tiro (${loserLog.fgPct.toFixed(1)}% TC).`, advanced: `**Asimetr\xEDa de descanso (rival en B2B):** La fatiga acumulada de ${loser.abbr} (0 d\xEDas de reposo) hundi\xF3 su tiro a ${loserLog.efgPct.toFixed(1)}% eFG y su balance a ${loserLog.netRtg.toFixed(1)} NetRtg.` });
  } else if (pace >= 105 || pace <= 93.5) {
    const isTrackMeet = pace >= 105;
    candidates.push({ family: isTrackMeet ? "fast_pace_track_meet" : "slow_pace_grind", axis: "context_pace", score: 9.5 + Math.abs(pace - 99.5) * 0.38, simple: isTrackMeet ? `**V\xE9rtigo a campo abierto:** El partido vol\xF3 a ${pace.toFixed(0)} posesiones (${totalPoints} puntos totales), un intercambio fren\xE9tico donde ${winner.shortName} ejecut\xF3 mejor en transici\xF3n.` : `**Guerra de trincheras a media pista:** Encuentro espeso de pocas posesiones (ritmo de ${pace.toFixed(0)}) donde ${winner.shortName} supo fabricar mejores tiros en est\xE1tico.`, advanced: isTrackMeet ? `**Imposici\xF3n de Pace alto (${pace.toFixed(1)}):** A ritmo de v\xE9rtigo, ${winner.abbr} maximiz\xF3 el intercambio con ${winnerLog.offRtg.toFixed(1)} OffRtg (${winnerLog.tsPct.toFixed(1)}% TS).` : `**Control de tempo bajo (${pace.toFixed(1)} Pace):** En batalla de media pista, ${winner.abbr} marc\xF3 diferencias desde el orden t\xE1ctico (+${winner.netRtg.toFixed(1)} NetRtg \xB7 ${winner.defRtg.toFixed(1)} DefRtg).` });
  }
  if (winnerLog.efgPct > loserLog.efgPct && (winnerLog.tsPct - loserLog.tsPct >= 8 || winnerLog.efgPct >= 60.5)) {
    const tsGap = winnerLog.tsPct - loserLog.tsPct;
    candidates.push({ family: "true_shooting_clinic", axis: "efficiency", score: 9.6 + Math.max(0, tsGap - 4) * 0.45 + Math.max(0, winnerLog.efgPct - 59) * 0.4, simple: `**Cl\xEDnica de punter\xEDa:** ${winner.shortName} roz\xF3 la excelencia en selecci\xF3n de tiro con un ${winnerLog.fgPct.toFixed(1)}% en tiros de campo (${winnerLog.efgPct.toFixed(1)}% efectivo) frente al ${loserLog.fgPct.toFixed(1)}% de ${loser.shortName}.`, advanced: `**Brecha de eficiencia real (+${tsGap.toFixed(1)} pp TS):** ${winner.abbr} escal\xF3 hasta ${winnerLog.tsPct.toFixed(1)}% TS (${winnerLog.efgPct.toFixed(1)}% eFG \xB7 ${winnerLog.offRtg.toFixed(1)} OffRtg) ante el ${loserLog.tsPct.toFixed(1)}% TS de ${loser.abbr}.` });
  }
  const ranked = [...candidates].sort((a, b) => {
    const effA = a.score - (usedFamilyCounts.get(a.family) ?? 0) * 2.25;
    const effB = b.score - (usedFamilyCounts.get(b.family) ?? 0) * 2.25;
    return effB - effA || b.score - a.score;
  });
  const picked = [];
  const usedAxes = /* @__PURE__ */ new Set();
  for (const cand of ranked) {
    if (picked.length >= 2) break;
    if (usedAxes.has(cand.axis)) continue;
    picked.push(cand);
    usedAxes.add(cand.axis);
    if (cand.family === "paradox_won_shooting_worse") {
      if (fgaDiff >= 4) usedAxes.add("glass");
      if (ftmDiff >= 4) usedAxes.add("free_throws");
      if (fgaDiff >= 5 && tovDiff >= 4) usedAxes.add("ball_security");
    }
  }
  if (picked.length < 2) {
    const microLevers = [];
    if (margin <= 6 && !usedAxes.has("efficiency")) {
      const clutchEdgeSimple = tovDiff >= 2 && !usedAxes.has("ball_security") ? `cometiendo ${tovDiff} p\xE9rdidas menos (${winnerLog.tov} vs ${loserLog.tov})` : ftmDiff >= 3 && !usedAxes.has("free_throws") ? `sumando +${ftmDiff} puntos desde el tiro libre (${winnerLog.ftm}/${winnerLog.fta})` : pts2Diff >= 6 && !usedAxes.has("interior") ? `anotando +${pts2Diff} puntos en canastas de dos (${w2m}/${w2a})` : pts3Diff >= 6 && !usedAxes.has("perimeter") ? `convirtiendo ${fg3mDiff} triples m\xE1s (${winnerLog.fg3m}/${winnerLog.fg3a})` : `templando mejor el pulso en las posesiones finales (${winnerLog.ast} asistencias y ${winnerLog.tov} p\xE9rdidas)`;
      microLevers.push({ family: "clutch_micro_execution", axis: "efficiency", score: 8.5, simple: `**Sangre fr\xEDa en el alambre:** En un desenlace decidido por ${margin} puntos (${awaySide.score}-${homeSide.score}), ${winner.shortName} inclin\xF3 la balanza ${clutchEdgeSimple}.`, advanced: `**Ejecuci\xF3n en final apretado (+${margin}):** En pulso de 1\u20132 posesiones, ${winner.abbr} sostuvo +${winner.netRtg.toFixed(1)} NetRtg (${winner.offRtg.toFixed(1)} vs ${loser.offRtg.toFixed(1)} OffRtg) minimizando errores clave.` });
    }
    const zoneOptions = [{ val: pts2Diff, cand: { family: "micro_2pt_edge", axis: "interior", score: 8, simple: `**Ventaja dentro del arco:** ${winner.shortName} encontr\xF3 mejores penetraciones y tiros cortos con ${w2m}/${w2a} de dos (${w2Pct.toFixed(1)}%), sacando +${pts2Diff} puntos interiores a ${loser.shortName}.`, advanced: `**Renta en finalizaci\xF3n 2PT:** +${pts2Diff} pts en canastas de 2 para ${winner.abbr} (${w2m}/${w2a}, ${w2Pct.toFixed(1)}% vs ${l2m}/${l2a}, ${l2Pct.toFixed(1)}% de ${loser.abbr}).` } }, { val: pts3Diff, cand: { family: "micro_3pt_edge", axis: "perimeter", score: 8, simple: `**Mejor tino exterior:** Los ${winnerLog.fg3m} triples de ${winner.shortName} (${winnerLog.fg3Pct.toFixed(1)}%) frente a los ${loserLog.fg3m} de ${loser.shortName} aportaron un colch\xF3n de +${pts3Diff} puntos.`, advanced: `**Diferencial en el arco:** ${winner.abbr} sum\xF3 +${pts3Diff} pts desde el triple (${winnerLog.fg3m}/${winnerLog.fg3a} al ${winnerLog.fg3Pct.toFixed(1)}% vs ${loserLog.fg3m}/${loserLog.fg3a} de ${loser.abbr}).` } }, { val: ftmDiff * 1.15, cand: { family: "micro_ft_edge", axis: "free_throws", score: 8, simple: `**Renta desde el tiro libre:** ${winner.shortName} supo forzar personales (${winnerLog.ftm}/${winnerLog.fta} en libres por ${loserLog.ftm}/${loserLog.fta} de ${loser.shortName}) para amarrar +${ftmDiff} puntos.`, advanced: `**Renta en tiros libres (+${ftmDiff} pts):** ${winner.abbr} convirti\xF3 ${winnerLog.ftm}/${winnerLog.fta} TL (${winnerLog.ftPct.toFixed(0)}%) frente al ${loserLog.ftm}/${loserLog.fta} (${loserLog.ftPct.toFixed(0)}%) de ${loser.abbr}.` } }, { val: tovDiff * 2.2, cand: { family: "micro_tov_edge", axis: "ball_security", score: 8, simple: `**Pulso ganado en las p\xE9rdidas:** Cuidar mejor la posesi\xF3n (${winnerLog.tov} p\xE9rdidas de ${winner.shortName} frente a ${loserLog.tov} de ${loser.shortName}, con ${winnerLog.stl} robos) evit\xF3 rachas rivales.`, advanced: `**Control de p\xE9rdidas:** ${winner.abbr} oper\xF3 al ${winnerLog.tovPct.toFixed(1)}% TOV (${winnerLog.tov} p\xE9rdidas) frente al ${loserLog.tovPct.toFixed(1)}% TOV (${loserLog.tov} p\xE9rdidas) de ${loser.abbr}.` } }, { val: astDiff * 1.5, cand: { family: "micro_ast_edge", axis: "playmaking", score: 8, simple: `**Fluidez en media pista:** Con ${winnerLog.ast} asistencias (frente a ${loserLog.ast} de ${loser.shortName}), ${winner.shortName} gener\xF3 tiros m\xE1s c\xF3modos en los cuartos finales.`, advanced: `**Fluidez ofensiva:** ${winner.abbr} reparti\xF3 ${winnerLog.ast} AST (${wAstPctOfFgm.toFixed(0)}% de sus FGM asistidos) por ${loserLog.ast} AST de ${loser.abbr}.` } }];
    zoneOptions.sort((a, b) => b.val - a.val);
    for (const z of zoneOptions) {
      if (z.val > 0) microLevers.push(z.cand);
    }
    const bestPmPlayer = [...winnerPlayers].filter((p) => p.minutes >= 18).sort((a, b) => b.plusMinus - a.plusMinus || b.gameScore - a.gameScore)[0];
    if (bestPmPlayer && bestPmPlayer.plusMinus >= 4) {
      microLevers.push({ family: "on_court_lineup_swing", axis: "depth", score: 7.8, simple: `**Quinteto dominante en pista:** Con ${bestPmPlayer.playerName} sobre el parqu\xE9, ${winner.shortName} firm\xF3 un parcial de +${bestPmPlayer.plusMinus} en ${bestPmPlayer.minutes.toFixed(0)} minutos (${bestPmPlayer.points}P \xB7 ${bestPmPlayer.rebounds}R \xB7 ${bestPmPlayer.assists}A).`, advanced: `**Diferencial en pista (+/-):** Los minutos con ${bestPmPlayer.playerName} arrojaron +${bestPmPlayer.plusMinus} en ${bestPmPlayer.minutes.toFixed(0)}m (${bestPmPlayer.gameScore.toFixed(1)} GmSc \xB7 ${bestPmPlayer.tsPct.toFixed(0)}% TS).` });
    }
    microLevers.push({ family: "two_way_balance_fallback", axis: "defense", score: 7, simple: `**Solidez en ambos aros:** ${winner.shortName} combin\xF3 equilibrio anotador (${winner.score} puntos, ${winnerLog.fgm}/${winnerLog.fga} en tiros) y control atr\xE1s para cerrar el ${awaySide.score}-${homeSide.score}.`, advanced: `**Balance neto por posesi\xF3n:** ${winner.abbr} se impuso con +${winner.netRtg.toFixed(1)} NetRtg (${winner.offRtg.toFixed(1)} OffRtg vs ${winner.defRtg.toFixed(1)} DefRtg) a ${pace.toFixed(1)} posesiones.` });
    for (const fb of microLevers) {
      if (picked.length >= 2) break;
      if (usedAxes.has(fb.axis)) continue;
      picked.push(fb);
      usedAxes.add(fb.axis);
    }
  }
  for (const p of picked) {
    usedFamilyCounts.set(p.family, (usedFamilyCounts.get(p.family) ?? 0) + 1);
  }
  return { simple: picked.map((p) => p.simple), advanced: picked.map((p) => p.advanced) };
}
async function getGameDayPayload(requestedDate, forceRefresh = false) {
  const full = await getFullLeagueMemory(forceRefresh);
  const dateEventMap = /* @__PURE__ */ new Map();
  for (const t of full.teams) {
    for (const g of t.games) {
      const d = g.date.slice(0, 10);
      if (!d) continue;
      let entry = dateEventMap.get(d);
      if (!entry) {
        entry = { seasonLabel: g.seasonLabel, eventIds: /* @__PURE__ */ new Set() };
        dateEventMap.set(d, entry);
      }
      entry.eventIds.add(g.eventId);
    }
  }
  const availableDates = [...dateEventMap.entries()].map(([date, info]) => ({ date, seasonLabel: info.seasonLabel, gamesCount: info.eventIds.size })).sort((a, b) => b.date.localeCompare(a.date));
  const cleanReq = (requestedDate || "").slice(0, 10);
  const selectedOpt = availableDates.find((d) => d.date === cleanReq) || availableDates[0];
  const selectedDate = selectedOpt?.date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const seasonLabel = selectedOpt?.seasonLabel || "2026-27";
  const eventIdsSet = dateEventMap.get(selectedDate)?.eventIds || /* @__PURE__ */ new Set();
  const liveOrScheduledToday = await fetchLiveScoreboardGames(void 0, forceRefresh);
  const seasonTotals = [];
  for (const t of full.teams) {
    for (const g of t.games) {
      if (g.seasonLabel === seasonLabel && g.isHome) {
        seasonTotals.push(g.totalPoints);
      }
    }
  }
  const leagueAvgTotalPoints = seasonTotals.length > 0 ? round1(meanNums(seasonTotals)) : 228.4;
  const nightLinesByEventSide = /* @__PURE__ */ new Map();
  const allNightLines = [];
  const explosions = [];
  const slumps = [];
  const roleShifts = [];
  const streakShifts = [];
  for (const p of full.allPlayers) {
    const nightIdx = p.games.findIndex((g2) => eventIdsSet.has(g2.eventId) || g2.date.slice(0, 10) === selectedDate);
    if (nightIdx === -1) continue;
    const g = p.games[nightIdx];
    const nightTeamAbbr = g.teamAbbr || p.teamAbbr;
    const priorGames = p.games.filter((_, idx) => idx !== nightIdx).slice(0, 25);
    let baselinePool = [...priorGames];

    // Prior Supplementation: If active season sample is small (< 15 games),
    // supplement baseline with previous season games to avoid small-sample volatility.
    // For rookies/debutants with NO prior NBA history (like Kon Knueppel), fill missing slots
    // with standard NBA rotation expectations so an explosive debut registers as an outlier!
    if (baselinePool.length < 15) {
      const pPrev = full.s2026?.playersById?.get(p.id) || full.s2025?.playersById?.get(p.id);
      if (pPrev && Array.isArray(pPrev.games) && pPrev.games.length > 0) {
        const needed = 15 - baselinePool.length;
        baselinePool = [...baselinePool, ...pPrev.games.slice(0, needed)];
      } else {
        const needed = 15 - baselinePool.length;
        const posUp = (p.position || "").toUpperCase();
        const isGuard = posUp.includes("G");
        const isCenter = posUp.includes("C");
        const defaultPts = isGuard ? 10.5 : isCenter ? 9.2 : 10.0;
        const defaultReb = isCenter ? 6.5 : isGuard ? 2.8 : 4.2;
        const defaultAst = isGuard ? 3.8 : 1.8;
        const default3pm = isGuard ? 1.4 : isCenter ? 0.3 : 1.0;

        for (let k = 0; k < needed; k++) {
          baselinePool.push({
            points: defaultPts,
            rebounds: defaultReb,
            assists: defaultAst,
            fg3m: default3pm,
            minutes: 18.0,
            gameScore: 7.5,
            tsPct: 54.0,
            usgEst: 18.5,
            fga: 8.5,
            fgm: 4.0,
            stocks: 1.2,
          });
        }
      }
    }
    if (baselinePool.length === 0) baselinePool = p.games;
    const ptsAvg = round1(meanNums(baselinePool.map((x) => x.points)));
    const ptsSd = Math.max(2.6, stdDevNums(baselinePool.map((x) => x.points)));
    const gmScAvg = round1(meanNums(baselinePool.map((x) => x.gameScore)));
    const minAvg = round1(meanNums(baselinePool.map((x) => x.minutes)));
    const tsAvg = round1(meanNums(baselinePool.map((x) => x.tsPct)));
    const usgAvg = round1(meanNums(baselinePool.map((x) => x.usgEst)));
    const fgaAvg = round1(meanNums(baselinePool.map((x) => x.fga)));
    const ptsDelta = round1(g.points - ptsAvg);
    const staticSched = staticScheduleByGameId.get(g.eventId);
    const resolvedIsHome = staticSched
      ? (nightTeamAbbr === staticSched.homeAbbr || p.teamAbbr === staticSched.homeAbbr)
      : g.isHome;
    const line = { playerId: p.id, playerName: p.name, teamAbbr: nightTeamAbbr, position: p.position, opponentAbbr: g.opponentAbbr, isHome: resolvedIsHome, result: g.result, minutes: g.minutes, points: g.points, rebounds: g.rebounds, oreb: g.oreb, assists: g.assists, steals: g.steals, blocks: g.blocks, stocks: g.stocks, turnovers: g.turnovers, fgm: g.fgm, fga: g.fga, fg3m: g.fg3m, fg3a: g.fg3a, ftm: g.ftm, fta: g.fta, plusMinus: g.plusMinus, tsPct: g.tsPct, efgPct: g.efgPct, usgEst: g.usgEst, gameScore: g.gameScore, ptsBaselineAvg: ptsAvg, ptsDelta, gmScBaselineAvg: gmScAvg };
    allNightLines.push(line);
    const sideKey = `${g.eventId}:${resolvedIsHome ? "home" : "away"}`;
    const bucket = nightLinesByEventSide.get(sideKey) || [];
    bucket.push(line);
    nightLinesByEventSide.set(sideKey, bucket);
    if (baselinePool.length >= 3) {
      const zPts = round1((g.points - ptsAvg) / ptsSd);
      const rebAvg = round1(meanNums(baselinePool.map((x) => x.rebounds)));
      const rebSd = Math.max(1.8, stdDevNums(baselinePool.map((x) => x.rebounds)));
      const zReb = round1((g.rebounds - rebAvg) / rebSd);
      const astAvg = round1(meanNums(baselinePool.map((x) => x.assists)));
      const astSd = Math.max(1.8, stdDevNums(baselinePool.map((x) => x.assists)));
      const zAst = round1((g.assists - astAvg) / astSd);
      const fg3mAvg = round1(meanNums(baselinePool.map((x) => x.fg3m)));
      const fg3mSd = Math.max(1.0, stdDevNums(baselinePool.map((x) => x.fg3m)));
      const z3PM = round1((g.fg3m - fg3mAvg) / fg3mSd);
      const gmScSd = Math.max(2.5, stdDevNums(baselinePool.map((x) => x.gameScore)));
      const zGmSc = round1((g.gameScore - gmScAvg) / gmScSd);

      const maxZ = Math.max(zPts, zGmSc, zReb, zAst, z3PM);
      const minDiff = round1(g.minutes - minAvg);
      const tsDiff = round1(g.tsPct - tsAvg);

      const isPtsExplosion = zPts >= 1.35 && ptsDelta >= 6.5;
      const isGmScExplosion = zGmSc >= 1.4 && (g.gameScore - gmScAvg) >= 6.0;
      const isRebExplosion = zReb >= 1.8 && (g.rebounds - rebAvg) >= 5.5 && g.rebounds >= 10;
      const isAstExplosion = zAst >= 1.8 && (g.assists - astAvg) >= 4.5 && g.assists >= 8;
      const is3pExplosion = z3PM >= 1.8 && (g.fg3m - fg3mAvg) >= 3.0 && g.fg3m >= 4;

      if (isPtsExplosion || isGmScExplosion || isRebExplosion || isAstExplosion || is3pExplosion) {
        let driverTag = "Despliegue estadístico sobresaliente";
        let driverDetailSimple = `Anotó ${g.points} PTS (${ptsDelta >= 0 ? "+" : ""}${ptsDelta.toFixed(1)} vs media de ${ptsAvg.toFixed(1)}) con ${g.fgm}/${g.fga} TC.`;
        if (priorGames.length === 0) {
          driverTag = "Reaparición / Debut de temporada";
          driverDetailSimple = `Debutó en la temporada sumando ${g.points} PTS (${ptsDelta >= 0 ? "+" : ""}${ptsDelta.toFixed(1)} vs su media anterior de ${ptsAvg.toFixed(1)}) en ${g.minutes.toFixed(0)} MIN.`;
        } else if (is3pExplosion && g.fg3m >= 4) {
          driverTag = "Explosión desde el triple";
          driverDetailSimple = `Anotó ${g.fg3m} triples (${g.fg3m}/${g.fg3a}) sumando ${g.points} PTS (${ptsDelta >= 0 ? "+" : ""}${ptsDelta.toFixed(1)} vs media).`;
        } else if (isRebExplosion) {
          driverTag = "Dominio en el rebote";
          driverDetailSimple = `Capturó ${g.rebounds} REB (+${(g.rebounds - rebAvg).toFixed(1)} vs media) y anotó ${g.points} PTS.`;
        } else if (isAstExplosion) {
          driverTag = "Recital en la dirección";
          driverDetailSimple = `Repartió ${g.assists} AST (+${(g.assists - astAvg).toFixed(1)} vs media) con ${g.points} PTS.`;
        } else if (tsDiff >= 10 && minDiff < 4) {
          driverTag = "Explosión de puntería";
        } else if (minDiff >= 5) {
          driverTag = "Expansión de minutos y rol";
        }

        explosions.push({
          playerId: p.id,
          playerName: p.name,
          teamAbbr: nightTeamAbbr,
          position: p.position,
          opponentAbbr: g.opponentAbbr,
          isHome: g.isHome,
          result: g.result,
          scoreDisplay: g.scoreDisplay,
          kind: "explosion",
          minutes: g.minutes,
          minutesAvg: minAvg,
          points: g.points,
          ptsAvg,
          ptsDelta,
          rebounds: g.rebounds,
          assists: g.assists,
          stocks: g.stocks,
          turnovers: g.turnovers,
          fgm: g.fgm,
          fga: g.fga,
          fg3m: g.fg3m,
          fg3a: g.fg3a,
          tsPct: g.tsPct,
          tsAvg,
          usgEst: g.usgEst,
          usgAvg,
          gameScore: g.gameScore,
          gmScAvg,
          singleNightZ: maxZ,
          driverTag,
          driverDetailSimple,
          driverDetailAdvanced: `Z +${maxZ.toFixed(1)}σ · TS% ${g.tsPct.toFixed(1)}% (base ${tsAvg.toFixed(1)}%) · USG ${g.usgEst.toFixed(1)}% · GmSc ${g.gameScore.toFixed(1)}.`
        });
      }
      if (minAvg >= 25 && ptsAvg >= 15 && ptsDelta <= -8 && g.minutes >= 16) {
        slumps.push({ playerId: p.id, playerName: p.name, teamAbbr: nightTeamAbbr, position: p.position, opponentAbbr: g.opponentAbbr, isHome: g.isHome, result: g.result, scoreDisplay: g.scoreDisplay, kind: "slump", minutes: g.minutes, minutesAvg: minAvg, points: g.points, ptsAvg, ptsDelta, rebounds: g.rebounds, assists: g.assists, stocks: g.stocks, turnovers: g.turnovers, fgm: g.fgm, fga: g.fga, fg3m: g.fg3m, fg3a: g.fg3a, tsPct: g.tsPct, tsAvg, usgEst: g.usgEst, usgAvg, gameScore: g.gameScore, gmScAvg, singleNightZ: zPts, driverTag: g.tsPct < 42 ? "Atasco en el tiro" : "Frenado por la defensa", driverDetailSimple: `Se quedó en ${g.points} PTS (${ptsDelta.toFixed(1)} respecto a su media de ${ptsAvg.toFixed(1)}) con ${g.fgm}/${g.fga} en tiros.`, driverDetailAdvanced: `Z ${zPts.toFixed(1)}σ · TS% ${g.tsPct.toFixed(1)}% vs ${tsAvg.toFixed(1)}% habitual · USG ${g.usgEst.toFixed(1)}%.` });
      }
      const minDelta = round1(g.minutes - minAvg);
      const usgDelta = round1(g.usgEst - usgAvg);
      if (minDelta >= 7.5 && g.minutes >= 24 || usgDelta >= 7.5 && g.minutes >= 20) {
        const shiftType = minDelta >= 6.5 && usgDelta >= 6 ? "dual_breakout" : minDelta >= 7.5 ? "minutes_spike" : "usage_spike";
        roleShifts.push({ playerId: p.id, playerName: p.name, teamAbbr: nightTeamAbbr, position: p.position, opponentAbbr: g.opponentAbbr, isHome: g.isHome, result: g.result, minutes: g.minutes, minutesAvg: minAvg, minutesDelta: minDelta, usgEst: g.usgEst, usgAvg, usgDelta, points: g.points, rebounds: g.rebounds, assists: g.assists, fga: g.fga, fgaAvg, gameScore: g.gameScore, shiftType, headlineSimple: `Salto a ${g.minutes.toFixed(0)} minutos (+${minDelta.toFixed(1)} vs media) con ${g.points} PTS y ${g.fga} tiros.`, headlineAdvanced: `${g.minutes.toFixed(0)} MIN (+${minDelta.toFixed(1)}) \xB7 ${g.usgEst.toFixed(1)}% USG (${usgDelta >= 0 ? "+" : ""}${usgDelta.toFixed(1)} pp) \xB7 ${g.fga} FGA (base ${fgaAvg.toFixed(1)}).` });
      }
    }
    const olderChrono = p.games.slice(nightIdx + 1);
    const streakRules = [{ id: "pts25", label: "25+ PTS", unit: "PTS", minCount: 3, check: __name((x) => x.points >= 25, "check"), val: __name((x) => x.points, "val") }, { id: "pts20", label: "20+ PTS", unit: "PTS", minCount: 4, check: __name((x) => x.points >= 20, "check"), val: __name((x) => x.points, "val") }, { id: "ast8", label: "8+ AST", unit: "AST", minCount: 3, check: __name((x) => x.assists >= 8, "check"), val: __name((x) => x.assists, "val") }, { id: "reb10", label: "10+ REB", unit: "REB", minCount: 3, check: __name((x) => x.rebounds >= 10, "check"), val: __name((x) => x.rebounds, "val") }];
    for (const sr of streakRules) {
      let priorCount = 0;
      const vals = [];
      for (const og of olderChrono) {
        if (sr.check(og)) {
          priorCount++;
          vals.push(sr.val(og));
        } else {
          break;
        }
      }
      const hitTonight = sr.check(g);
      if (hitTonight && priorCount + 1 >= sr.minCount) {
        vals.unshift(sr.val(g));
        streakShifts.push({ id: `${p.id}-${sr.id}-ext`, playerId: p.id, playerName: p.name, teamAbbr: nightTeamAbbr, position: p.position, opponentAbbr: g.opponentAbbr, isHome: g.isHome, status: "extended", thresholdLabel: sr.label, streakCount: priorCount + 1, nightValueDisplay: `${sr.val(g)} ${sr.unit}`, avgDuringStreak: round1(meanNums(vals)), unit: sr.unit });
        break;
      } else if (!hitTonight && priorCount >= sr.minCount) {
        streakShifts.push({ id: `${p.id}-${sr.id}-brk`, playerId: p.id, playerName: p.name, teamAbbr: nightTeamAbbr, position: p.position, opponentAbbr: g.opponentAbbr, isHome: g.isHome, status: "broken", thresholdLabel: sr.label, streakCount: priorCount, nightValueDisplay: `${sr.val(g)} ${sr.unit}`, avgDuringStreak: round1(meanNums(vals)), unit: sr.unit });
        break;
      }
    }
  }
  explosions.sort((a, b) => b.ptsDelta - a.ptsDelta);
  slumps.sort((a, b) => a.ptsDelta - b.ptsDelta);
  roleShifts.sort((a, b) => b.minutesDelta + b.usgDelta * 0.6 - (a.minutesDelta + a.usgDelta * 0.6));
  streakShifts.sort((a, b) => b.streakCount - a.streakCount);
  const rawMatchups = [];
  const recordUpTo = __name((tm) => {
    const sl = tm.games.filter((x) => x.seasonLabel === seasonLabel && x.date.slice(0, 10) <= selectedDate);
    const w = sl.filter((x) => x.result === "W").length;
    return `${w}-${sl.length - w}`;
  }, "recordUpTo");
  for (const eventId of eventIdsSet) {
    let homeTeam;
    let homeLog;
    let awayTeam;
    let awayLog;
    const staticSched = staticScheduleByGameId.get(eventId);
    for (const tm of full.teams) {
      const gl = tm.games.find((x) => x.eventId === eventId);
      if (!gl) continue;
      const isHomeTeam = staticSched
        ? tm.abbreviation === staticSched.homeAbbr
        : gl.isHome;
      if (isHomeTeam) {
        homeTeam = tm;
        homeLog = { ...gl, isHome: true };
      } else {
        awayTeam = tm;
        awayLog = { ...gl, isHome: false };
      }
    }
    if (!homeTeam || !homeLog || !awayTeam || !awayLog) continue;
    const buildMatchSide = __name((tm, lg, role) => {
      const rot = [...nightLinesByEventSide.get(`${eventId}:${role}`) || []].sort((a, b) => b.gameScore - a.gameScore || b.points - a.points);
      return { allRot: rot, side: { teamId: tm.id, abbr: tm.abbreviation, name: tm.name, shortName: tm.shortName, recordAfter: recordUpTo(tm), score: lg.pointsFor, isWinner: lg.result === "W", fg3m: lg.fg3m, fg3a: lg.fg3a, fg3Pct: lg.fg3Pct, efgPct: lg.efgPct, tsPct: lg.tsPct, reb: lg.reb, oreb: lg.oreb, orebPct: lg.orebPct, ast: lg.ast, tov: lg.tov, tovPct: lg.tovPct, ftm: lg.ftm, fta: lg.fta, offRtg: lg.offRtg, defRtg: lg.defRtg, netRtg: lg.netRtg, pace: lg.pace, isBackToBack: lg.isBackToBack, topPlayer: rot[0] || null, rotationPlayers: rot.slice(0, 8) } };
    }, "buildMatchSide");
    const awayBuilt = buildMatchSide(awayTeam, awayLog, "away");
    const homeBuilt = buildMatchSide(homeTeam, homeLog, "home");
    const awaySide = awayBuilt.side;
    const homeSide = homeBuilt.side;
    rawMatchups.push({ eventId, awayTeam, awayLog, awaySide, awayAllPlayers: awayBuilt.allRot, homeTeam, homeLog, homeSide, homeAllPlayers: homeBuilt.allRot, margin: Math.abs(awaySide.score - homeSide.score), totalPoints: awaySide.score + homeSide.score });
  }
  rawMatchups.sort((a, b) => a.margin - b.margin || b.totalPoints - a.totalPoints);
  const usedFamilyCounts = /* @__PURE__ */ new Map();
  const matchups = rawMatchups.map((rm) => {
    const { eventId, awayTeam, awayLog, awaySide, awayAllPlayers, homeTeam, homeLog, homeSide, homeAllPlayers, margin, totalPoints } = rm;
    const winner = awaySide.isWinner ? awaySide : homeSide;
    const loser = awaySide.isWinner ? homeSide : awaySide;
    const winnerLog = awaySide.isWinner ? awayLog : homeLog;
    const loserLog = awaySide.isWinner ? homeLog : awayLog;
    const winnerTeam = awaySide.isWinner ? awayTeam : homeTeam;
    const loserTeam = awaySide.isWinner ? homeTeam : awayTeam;
    const winnerPlayers = awaySide.isWinner ? awayAllPlayers : homeAllPlayers;
    const loserPlayers = awaySide.isWinner ? homeAllPlayers : awayAllPlayers;
    let contextTag = "Duelo de temporada regular";
    let contextTone = "slate";
    if (margin <= 3) {
      contextTag = "Final de infarto (Clutch)";
      contextTone = "amber";
    } else if (margin <= 6) {
      contextTag = "Desenlace apretado";
      contextTone = "amber";
    } else if (awaySide.isWinner && margin >= 14) {
      contextTag = "Golpe visitante";
      contextTone = "emerald";
    } else if (margin >= 18) {
      contextTag = "Dominio contundente";
      contextTone = "emerald";
    } else if (awaySide.isWinner && winner.isBackToBack && !loser.isBackToBack) {
      contextTag = "Asalto visitante en B2B";
      contextTone = "emerald";
    } else if (awaySide.isWinner && margin >= 9) {
      contextTag = "Triunfo a domicilio";
      contextTone = "slate";
    } else if (totalPoints >= 246) {
      contextTag = "Duelo de alto voltaje";
      contextTone = "slate";
    } else if (totalPoints <= 204) {
      contextTag = "Batalla defensiva";
      contextTone = "slate";
    }
    const keys = buildIndividualMatchupKeys({ awaySide, homeSide, winner, loser, winnerLog, loserLog, winnerTeam, loserTeam, winnerPlayers, loserPlayers, roleShifts, streakShifts, usedFamilyCounts });
    return { eventId, date: selectedDate, seasonLabel, contextTag, contextTone, margin, totalPoints, pace: homeLog.pace, away: awaySide, home: homeSide, keyTakeawaysSimple: keys.simple, keyTakeawaysAdvanced: keys.advanced };
  });
  const sortedByGmSc = [...allNightLines].sort((a, b) => b.gameScore - a.gameScore || b.points - a.points);
  const idealFive = sortedByGmSc.slice(0, 5);
  const mvpOfTheNight = idealFive[0] || null;
  let statementTeamWin = null;
  if (matchups.length > 0) {
    const bestWinMatch = [...matchups].sort((a, b) => {
      const wA = a.away.isWinner ? a.away : a.home;
      const wB = b.away.isWinner ? b.away : b.home;
      const scoreA = wA.netRtg + (a.away.isWinner ? 3.5 : 0);
      const scoreB = wB.netRtg + (b.away.isWinner ? 3.5 : 0);
      return scoreB - scoreA;
    })[0];
    const wSide = bestWinMatch.away.isWinner ? bestWinMatch.away : bestWinMatch.home;
    const lSide = bestWinMatch.away.isWinner ? bestWinMatch.home : bestWinMatch.away;
    statementTeamWin = { teamId: wSide.teamId, teamAbbr: wSide.abbr, teamName: wSide.name, opponentAbbr: lSide.abbr, isHome: !bestWinMatch.away.isWinner, scoreDisplay: `${bestWinMatch.away.score}-${bestWinMatch.home.score}`, margin: bestWinMatch.margin, netRtg: wSide.netRtg, efgPct: wSide.efgPct, summarySimple: `+${bestWinMatch.margin} pts (${bestWinMatch.away.score}-${bestWinMatch.home.score}) ante ${lSide.shortName} con ${wSide.efgPct.toFixed(1)}% eFG`, summaryAdvanced: `NetRtg +${wSide.netRtg.toFixed(1)} \xB7 OffRtg ${wSide.offRtg.toFixed(1)} \xB7 ${wSide.efgPct.toFixed(1)}% eFG (${bestWinMatch.away.score}-${bestWinMatch.home.score} vs ${lSide.abbr})` };
  }
  const gamesCount = matchups.length;
  const avgTotalPoints = gamesCount > 0 ? round1(meanNums(matchups.map((m) => m.totalPoints))) : leagueAvgTotalPoints;
  const avgPace = gamesCount > 0 ? round1(meanNums(matchups.map((m) => m.pace))) : 99.6;
  return { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), dataSource: full.s2027.dataSource, selectedDate, seasonLabel, availableDates, pulse: { gamesCount, avgTotalPoints, leagueAvgTotalPoints, closeGamesCount: matchups.filter((m) => m.margin <= 5).length, blowoutsCount: matchups.filter((m) => m.margin >= 15).length, roadWinsCount: matchups.filter((m) => m.away.isWinner).length, avgPace }, mvpOfTheNight, topExplosion: explosions[0] || null, statementTeamWin, idealFive, matchups, explosions: explosions.slice(0, 12), slumps: slumps.slice(0, 12), roleShifts: roleShifts.slice(0, 12), streakShifts: streakShifts.slice(0, 16), liveOrScheduledToday };
}
let cachedMilestones = null;
async function getMilestonesPayload(forceRefresh = false) {
  if (!forceRefresh && cachedMilestones && cachedMilestones.expiresAt > Date.now()) {
    return cachedMilestones.payload;
  }
  const full = await getFullLeagueMemory(forceRefresh);
  const t27 = [...full.s2027.teamsByAbbr.values()];
  const t26 = [...full.s2026.teamsByAbbr.values()];
  const p27 = [...full.s2027.playersById.values()];
  const p26 = [...full.s2026.playersById.values()];
  const avgGp27 = Math.max(1, Math.round(meanNums(t27.map((t) => t.games.length))));
  const buildGlobalSnap = __name((label, teamsList, maxGamesChrono) => {
    const allLogs = [];
    for (const tm of teamsList) {
      const chrono = [...tm.games].reverse();
      const slice = maxGamesChrono ? chrono.slice(0, maxGamesChrono) : chrono;
      allLogs.push(...slice);
    }
    const homeLogs = allLogs.filter((g) => g.isHome);
    const gamesCount = homeLogs.length;
    const avgPtsPaint = round1(meanNums(teamsList.map((t) => t.advanced?.ptsPaint || 0).filter((v) => v > 0)) || 48.4);
    const avgPts2nd = round1(meanNums(teamsList.map((t) => t.advanced?.pts2ndChance || 0).filter((v) => v > 0)) || 14.1);
    const avgPtsFb = round1(meanNums(teamsList.map((t) => t.advanced?.ptsFastBreak || 0).filter((v) => v > 0)) || 15.2);
    return { seasonLabel: label, gamesCount, avgTeamPoints: round1(meanNums(allLogs.map((g) => g.pointsFor))), avgTotalGamePoints: round1(meanNums(homeLogs.map((g) => g.totalPoints))), avgMargin: round1(meanNums(homeLogs.map((g) => Math.abs(g.differential)))), homeWinPct: gamesCount > 0 ? round1(homeLogs.filter((g) => g.result === "W").length / gamesCount * 100) : 54, closeGamesPct: gamesCount > 0 ? round1(homeLogs.filter((g) => Math.abs(g.differential) <= 5).length / gamesCount * 100) : 28, blowoutGamesPct: gamesCount > 0 ? round1(homeLogs.filter((g) => Math.abs(g.differential) >= 15).length / gamesCount * 100) : 31, avgTeam3PM: round1(meanNums(allLogs.map((g) => g.fg3m))), avgTeam3Pct: round1(meanNums(allLogs.map((g) => g.fg3Pct))), avgTeamORB: round1(meanNums(allLogs.map((g) => g.oreb))), avgTeamREB: round1(meanNums(allLogs.map((g) => g.reb))), avgTeamAST: round1(meanNums(allLogs.map((g) => g.ast))), avgPace: round1(meanNums(allLogs.map((g) => g.pace))), avgOffRtg: round1(meanNums(allLogs.map((g) => g.offRtg))), avgEfgPct: round1(meanNums(allLogs.map((g) => g.efgPct))), avgTsPct: round1(meanNums(allLogs.map((g) => g.tsPct))), avgOrebPct: round1(meanNums(allLogs.map((g) => g.orebPct))), avgTovPct: round1(meanNums(allLogs.map((g) => g.tovPct))), avgPtsPaint, avgPts2ndChance: avgPts2nd, avgPtsFastBreak: avgPtsFb };
  }, "buildGlobalSnap");
  const sampleDates26 = [];
  for (const tm of t26) {
    const chrono = [...tm.games].reverse();
    if (chrono.length > 0) {
      const idx = Math.min(chrono.length - 1, avgGp27 - 1);
      sampleDates26.push(chrono[idx].date);
    }
  }
  sampleDates26.sort();
  const openingCutoff26 = sampleDates26[Math.floor(sampleDates26.length / 2)] || "2025-11-05";
  const pickBestPlayerGame = __name((pool, getter, opts) => {
    let best = null;
    let bestTieBreak = -Infinity;
    const dec = opts?.decimals ?? 1;
    const roundFn = dec >= 2 ? round2 : round1;
    for (const p of pool) {
      for (const g of p.games) {
        if (opts?.maxDate && g.date > opts.maxDate) continue;
        if (opts?.qualifies && !opts.qualifies(g)) continue;
        const rawVal = getter(g);
        if (!Number.isFinite(rawVal)) continue;
        const val = dec === 0 ? Math.round(rawVal) : roundFn(rawVal);
        const tie = g.gameScore;
        const isBetter = !best ? true : opts?.lowerIsBetter ? val < best.value || val === best.value && tie > bestTieBreak : val > best.value || val === best.value && tie > bestTieBreak;
        if (isBetter) {
          bestTieBreak = tie;
          const gameTeamAbbr = g.teamAbbr || p.teamAbbr;
          const extra = opts?.extraContext ? opts.extraContext(g) : "";
          best = { entityId: p.id, entityName: p.name, teamAbbr: gameTeamAbbr, value: val, context: `${g.isHome ? "vs" : "@"} ${g.opponentAbbr} (${g.result}${g.scoreDisplay ? ` ${g.scoreDisplay}` : ""})${extra ? ` \xB7 ${extra}` : ""}`, date: g.date };
        }
      }
    }
    return best;
  }, "pickBestPlayerGame");
  const pickBestTeamGame = __name((pool, getter, opts) => {
    let best = null;
    let bestTieBreak = -Infinity;
    const dec = opts?.decimals ?? 1;
    const roundFn = dec >= 2 ? round2 : round1;
    for (const t of pool) {
      for (const g of t.games) {
        if (opts?.maxDate && g.date > opts.maxDate) continue;
        if (opts?.qualifies && !opts.qualifies(g)) continue;
        const rawVal = getter(g);
        if (!Number.isFinite(rawVal)) continue;
        const val = dec === 0 ? Math.round(rawVal) : roundFn(rawVal);
        const tie = g.differential;
        const isBetter = !best ? true : opts?.lowerIsBetter ? val < best.value || val === best.value && tie > bestTieBreak : val > best.value || val === best.value && tie > bestTieBreak;
        if (isBetter) {
          bestTieBreak = tie;
          const extra = opts?.extraContext ? opts.extraContext(g) : "";
          best = { entityId: t.id, entityName: t.name, teamAbbr: t.abbreviation, value: val, context: `${g.isHome ? "vs" : "@"} ${g.opponentAbbr} (${g.pointsFor}-${g.pointsAgainst})${extra ? ` \xB7 ${extra}` : ""}`, date: g.date };
        }
      }
    }
    return best;
  }, "pickBestTeamGame");
  const makePlayerSG = __name((metricId, metricLabel, subGroup, unit, getter, opts) => {
    const decimals = opts?.decimals ?? 0;
    return { metricId, metricLabel, category: "player", subGroup, unit, decimals, lowerIsBetter: opts?.lowerIsBetter, current2027: pickBestPlayerGame(p27, getter, { ...opts, decimals }), prev2026Full: pickBestPlayerGame(p26, getter, { ...opts, decimals }), prev2026Opening: pickBestPlayerGame(p26, getter, { ...opts, decimals, maxDate: openingCutoff26 }) };
  }, "makePlayerSG");
  const makeTeamSG = __name((metricId, metricLabel, subGroup, unit, getter, opts) => {
    const decimals = opts?.decimals ?? 0;
    return { metricId, metricLabel, category: "team", subGroup, unit, decimals, lowerIsBetter: opts?.lowerIsBetter, current2027: pickBestTeamGame(t27, getter, { ...opts, decimals }), prev2026Full: pickBestTeamGame(t26, getter, { ...opts, decimals }), prev2026Opening: pickBestTeamGame(t26, getter, { ...opts, decimals, maxDate: openingCutoff26 }) };
  }, "makeTeamSG");
  const singleGameRecords = [makePlayerSG("sg-player-pts", "M\xE1xima anotaci\xF3n individual en un partido", "scoring", "PTS", (g) => g.points), makePlayerSG("sg-player-fgm", "M\xE1s tiros de campo anotados por un jugador", "scoring", "TCM", (g) => g.fgm, { extraContext: __name((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makePlayerSG("sg-player-fga", "M\xE1s tiros de campo intentados por un jugador", "scoring", "TCI", (g) => g.fga, { extraContext: __name((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makePlayerSG("sg-player-fg2m", "M\xE1s canastas de 2 puntos anotadas en una noche", "scoring", "T2M", (g) => Math.max(0, g.fgm - g.fg3m), { extraContext: __name((g) => `${Math.max(0, g.fgm - g.fg3m)}/${Math.max(0, g.fga - g.fg3a)} T2`, "extraContext") }), makePlayerSG("sg-player-3pm", "M\xE1s triples anotados por un jugador en un partido", "scoring", "3PM", (g) => g.fg3m, { extraContext: __name((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makePlayerSG("sg-player-3pa", "M\xE1s triples intentados por un jugador en una noche", "scoring", "3PA", (g) => g.fg3a, { extraContext: __name((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makePlayerSG("sg-player-ftm", "M\xE1s tiros libres anotados por un jugador", "scoring", "TLM", (g) => g.ftm, { extraContext: __name((g) => `${g.ftm}/${g.fta} TL`, "extraContext") }), makePlayerSG("sg-player-fta", "M\xE1s tiros libres intentados por un jugador", "scoring", "TLI", (g) => g.fta, { extraContext: __name((g) => `${g.ftm}/${g.fta} TL`, "extraContext") }), makePlayerSG("sg-player-ft-perfect", "M\xE1s tiros libres encestados sin fallo (100% TL)", "scoring", "TLM", (g) => g.ftm, { qualifies: __name((g) => g.fta >= 8 && g.ftm === g.fta, "qualifies"), extraContext: __name((g) => `${g.ftm}/${g.fta} TL`, "extraContext") }), makePlayerSG("sg-player-fgpct", "Mejor % en tiros de campo en una noche (m\xEDn. 12 TCI)", "scoring", "%", (g) => g.fgPct, { decimals: 1, qualifies: __name((g) => g.fga >= 12, "qualifies"), extraContext: __name((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makePlayerSG("sg-player-3ppct", "Mejor % en triples en una noche (m\xEDn. 7 intentos)", "scoring", "%", (g) => g.fg3Pct, { decimals: 1, qualifies: __name((g) => g.fg3a >= 7, "qualifies"), extraContext: __name((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makePlayerSG("sg-player-ts", "Mayor eficiencia True Shooting en una noche (m\xEDn. 20 PTS)", "scoring", "%", (g) => g.tsPct, { decimals: 1, qualifies: __name((g) => g.points >= 20 && g.fga >= 8, "qualifies"), extraContext: __name((g) => `${g.points} PTS`, "extraContext") }), makePlayerSG("sg-player-efg", "Mayor tiro efectivo eFG% individual (m\xEDn. 12 TCI)", "scoring", "%", (g) => g.efgPct, { decimals: 1, qualifies: __name((g) => g.fga >= 12, "qualifies"), extraContext: __name((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makePlayerSG("sg-player-reb", "M\xE1ximos rebotes totales individuales en una noche", "playmaking_reb", "REB", (g) => g.rebounds, { extraContext: __name((g) => `${g.oreb} OR + ${g.dreb} DR`, "extraContext") }), makePlayerSG("sg-player-oreb", "M\xE1ximos rebotes ofensivos individuales en un partido", "playmaking_reb", "OR", (g) => g.oreb), makePlayerSG("sg-player-dreb", "M\xE1ximos rebotes defensivos individuales en un partido", "playmaking_reb", "DR", (g) => g.dreb), makePlayerSG("sg-player-ast", "M\xE1ximas asistencias repartidas en un partido", "playmaking_reb", "AST", (g) => g.assists, { extraContext: __name((g) => `${g.turnovers} PER`, "extraContext") }), makePlayerSG("sg-player-ast-notov", "M\xE1s asistencias repartidas sin ninguna p\xE9rdida (0 PER)", "playmaking_reb", "AST", (g) => g.assists, { qualifies: __name((g) => g.turnovers === 0 && g.assists >= 6, "qualifies"), extraContext: __name(() => "0 p\xE9rdidas", "extraContext") }), makePlayerSG("sg-player-pra", "Mayor producci\xF3n combinada PRA (PTS+REB+AST)", "playmaking_reb", "PRA", (g) => g.pra, { extraContext: __name((g) => `${g.points}+${g.rebounds}+${g.assists}`, "extraContext") }), makePlayerSG("sg-player-stl", "M\xE1s robos de bal\xF3n individuales en un partido", "defense", "ROB", (g) => g.steals), makePlayerSG("sg-player-blk", "M\xE1s tapones colocados por un jugador en una noche", "defense", "TAP", (g) => g.blocks), makePlayerSG("sg-player-stocks", "M\xE1s acciones defensivas Stocks (Robos + Tapones)", "defense", "STK", (g) => g.stocks, { extraContext: __name((g) => `${g.steals} ROB + ${g.blocks} TAP`, "extraContext") }), makePlayerSG("sg-player-tov", "M\xE1s p\xE9rdidas cometidas por un jugador en una noche", "defense", "PER", (g) => g.turnovers), makePlayerSG("sg-player-gmsc", "Mayor Valoraci\xF3n Hollinger (Game Score) en una noche", "impact", "GmSc", (g) => g.gameScore, { decimals: 1, extraContext: __name((g) => `${g.points}p/${g.rebounds}r/${g.assists}a`, "extraContext") }), makePlayerSG("sg-player-pm", "Mejor impacto M\xE1s/Menos (+/-) individual en pista", "impact", "+/-", (g) => g.plusMinus), makePlayerSG("sg-player-usg", "Mayor Uso Ofensivo (USG%) en una noche (m\xEDn. 20 MIN)", "impact", "%", (g) => g.usgEst, { decimals: 1, qualifies: __name((g) => g.minutes >= 20, "qualifies"), extraContext: __name((g) => `${g.fga} TCI`, "extraContext") }), makePlayerSG("sg-player-min", "M\xE1s minutos disputados por un jugador en un partido", "impact", "MIN", (g) => g.minutes, { decimals: 1 }), makeTeamSG("sg-team-pts", "M\xE1xima anotaci\xF3n colectiva de un equipo", "scoring", "PTS", (g) => g.pointsFor), makeTeamSG("sg-team-total", "Partido con mayor marcador combinado (ambos equipos)", "scoring", "PTS", (g) => g.totalPoints, { qualifies: __name((g) => g.result === "W", "qualifies") }), makeTeamSG("sg-team-fgm", "M\xE1s tiros de campo anotados por un equipo", "scoring", "TCM", (g) => g.fgm, { extraContext: __name((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makeTeamSG("sg-team-fgpct", "Mejor % de tiro de campo colectivo en un partido", "scoring", "%", (g) => g.fgPct, { decimals: 1, extraContext: __name((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makeTeamSG("sg-team-3pm", "M\xE1s triples anotados por un equipo en una noche", "scoring", "3PM", (g) => g.fg3m, { extraContext: __name((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makeTeamSG("sg-team-3pa", "M\xE1s triples intentados por un equipo en una noche", "scoring", "3PA", (g) => g.fg3a, { extraContext: __name((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makeTeamSG("sg-team-3ppct", "Mejor % en triples colectivo (m\xEDn. 25 intentos)", "scoring", "%", (g) => g.fg3Pct, { decimals: 1, qualifies: __name((g) => g.fg3a >= 25, "qualifies"), extraContext: __name((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makeTeamSG("sg-team-ftm", "M\xE1s tiros libres anotados por un equipo", "scoring", "TLM", (g) => g.ftm, { extraContext: __name((g) => `${g.ftm}/${g.fta} TL`, "extraContext") }), makeTeamSG("sg-team-efg", "Mayor Tiro Efectivo (eFG%) colectivo en una noche", "scoring", "%", (g) => g.efgPct, { decimals: 1 }), makeTeamSG("sg-team-ts", "Mayor True Shooting (TS%) colectivo en una noche", "scoring", "%", (g) => g.tsPct, { decimals: 1 }), makeTeamSG("sg-team-reb", "M\xE1s rebotes totales capturados por un equipo", "playmaking_reb", "REB", (g) => g.reb, { extraContext: __name((g) => `${g.oreb} OR + ${g.dreb} DR`, "extraContext") }), makeTeamSG("sg-team-oreb", "M\xE1s rebotes ofensivos de un equipo en una noche", "playmaking_reb", "OR", (g) => g.oreb), makeTeamSG("sg-team-dreb", "M\xE1s rebotes defensivos de un equipo en una noche", "playmaking_reb", "DR", (g) => g.dreb), makeTeamSG("sg-team-ast", "M\xE1s asistencias colectivas repartidas en un partido", "playmaking_reb", "AST", (g) => g.ast), makeTeamSG("sg-team-stl", "M\xE1s robos de bal\xF3n colectivos en un partido", "defense", "ROB", (g) => g.stl), makeTeamSG("sg-team-blk", "M\xE1s tapones colectivos en un partido", "defense", "TAP", (g) => g.blk), makeTeamSG("sg-team-stocks", "M\xE1s robos + tapones colectivos en una noche", "defense", "STK", (g) => g.stl + g.blk, { extraContext: __name((g) => `${g.stl} ROB + ${g.blk} TAP`, "extraContext") }), makeTeamSG("sg-team-opp-pts-low", "Menor anotaci\xF3n permitida al rival en un partido", "defense", "PTS", (g) => g.pointsAgainst, { lowerIsBetter: true, qualifies: __name((g) => g.pointsAgainst > 50, "qualifies") }), makeTeamSG("sg-team-tov-low", "Menos p\xE9rdidas cometidas por un equipo en un partido", "defense", "PER", (g) => g.tov, { lowerIsBetter: true }), makeTeamSG("sg-team-defrtg", "Mejor Eficiencia Defensiva (DefRtg) en una noche", "defense", "RTG", (g) => g.defRtg, { decimals: 1, lowerIsBetter: true, qualifies: __name((g) => g.defRtg > 60, "qualifies") }), makeTeamSG("sg-team-margin", "Mayor diferencia de puntos lograda en una victoria", "impact", "PTS", (g) => g.differential), makeTeamSG("sg-team-offrtg", "Mejor Eficiencia Ofensiva (OffRtg) en una noche", "impact", "RTG", (g) => g.offRtg, { decimals: 1 }), makeTeamSG("sg-team-netrtg", "Mayor Dominio Neto (NetRtg) en un partido", "impact", "RTG", (g) => g.netRtg, { decimals: 1 }), makeTeamSG("sg-team-pace", "Partido disputado a mayor ritmo de posesiones (Pace)", "impact", "POS", (g) => g.pace, { decimals: 1, qualifies: __name((g) => g.result === "W", "qualifies") })];
  const resolvePlayerSliceTeam = __name((slice, fallbackAbbr) => {
    const primary = slice[0]?.teamAbbr || fallbackAbbr;
    const chrono = [...slice].reverse();
    const seen = [];
    for (const g of chrono) {
      const ab = g.teamAbbr || fallbackAbbr;
      if (ab && !seen.includes(ab)) seen.push(ab);
    }
    return { teamAbbr: primary, stintNote: seen.length > 1 ? `${seen.join("/")} \xB7 ` : "" };
  }, "resolvePlayerSliceTeam");
  const countDoubleDoubles = __name((gs) => gs.reduce((acc, g) => {
    let tens = 0;
    if (g.points >= 10) tens++;
    if (g.rebounds >= 10) tens++;
    if (g.assists >= 10) tens++;
    if (g.steals >= 10) tens++;
    if (g.blocks >= 10) tens++;
    return acc + (tens >= 2 ? 1 : 0);
  }, 0), "countDoubleDoubles");
  const countTripleDoubles = __name((gs) => gs.reduce((acc, g) => {
    let tens = 0;
    if (g.points >= 10) tens++;
    if (g.rebounds >= 10) tens++;
    if (g.assists >= 10) tens++;
    if (g.steals >= 10) tens++;
    if (g.blocks >= 10) tens++;
    return acc + (tens >= 3 ? 1 : 0);
  }, 0), "countTripleDoubles");
  const avgGp26 = Math.max(1, Math.round(meanNums(t26.map((t) => t.games.length))));
  const minGp27 = Math.max(2, Math.min(45, Math.floor(avgGp27 * 0.55)));
  const minGp26Full = Math.max(10, Math.min(45, Math.floor(avgGp26 * 0.55)));
  const minGp26Open = Math.max(2, Math.min(45, Math.floor(avgGp27 * 0.55)));
  const pickPlayerSliceLeader = __name((pool, minGames, getter, opts) => {
    const minMin = opts?.minMinutesAvg ?? (opts?.isTotal ? 0 : 16);
    const dec = opts?.decimals ?? 1;
    const roundFn = dec >= 2 ? round2 : dec === 0 ? Math.round : round1;
    let best = null;
    let bestTie = -Infinity;
    for (const p of pool) {
      const slice = opts?.maxDate ? p.games.filter((g) => g.date <= opts.maxDate) : p.games;
      if (slice.length < minGames) continue;
      if (minMin > 0 && meanNums(slice.map((g) => g.minutes)) < minMin) continue;
      const rawVal = getter(slice, p);
      if (rawVal === null || !Number.isFinite(rawVal)) continue;
      const val = roundFn(rawVal);
      if (opts?.isTotal && val <= 0) continue;
      const tie = slice.length;
      const isBetter = !best ? true : opts?.lowerIsBetter ? val < best.value || val === best.value && tie > bestTie : val > best.value || val === best.value && tie > bestTie;
      if (isBetter) {
        bestTie = tie;
        const { teamAbbr, stintNote } = resolvePlayerSliceTeam(slice, p.teamAbbr);
        const extra = opts?.extraSecondary ? opts.extraSecondary(slice, p) : "";
        best = { entityId: p.id, entityName: p.name, teamAbbr, value: val, secondaryLabel: `${stintNote}${slice.length} PJ${extra ? ` \xB7 ${extra}` : ""}` };
      }
    }
    return best;
  }, "pickPlayerSliceLeader");
  const makePlayerSL = __name((metricId, metricLabel, group, unit, decimals, getter, opts) => {
    const isTotal = Boolean(opts?.isCumulativeTotal);
    return { metricId, metricLabel, group, entityType: "player", unit, decimals, isCumulativeTotal: isTotal, lowerIsBetter: opts?.lowerIsBetter, current2027: pickPlayerSliceLeader(p27, isTotal ? 1 : minGp27, getter, { decimals, minMinutesAvg: opts?.minMinutesAvg, lowerIsBetter: opts?.lowerIsBetter, isTotal, extraSecondary: opts?.extraSecondary }), prev2026Full: pickPlayerSliceLeader(p26, isTotal ? 1 : minGp26Full, getter, { decimals, minMinutesAvg: opts?.minMinutesAvg, lowerIsBetter: opts?.lowerIsBetter, isTotal, extraSecondary: opts?.extraSecondary }), prev2026Opening: pickPlayerSliceLeader(p26, isTotal ? 1 : minGp26Open, getter, { maxDate: openingCutoff26, decimals, minMinutesAvg: opts?.minMinutesAvg, lowerIsBetter: opts?.lowerIsBetter, isTotal, extraSecondary: opts?.extraSecondary }) };
  }, "makePlayerSL");
  const makePlayerAdvSL = __name((metricId, metricLabel, group, unit, decimals, advGetter, opts) => {
    const minMin = opts?.minMinutesAvg ?? 18;
    const pickAdv = __name((pool, minGames, maxDate) => {
      let best = null;
      for (const p of pool) {
        if (!p.advanced) continue;
        const slice = maxDate ? p.games.filter((g) => g.date <= maxDate) : p.games;
        if (slice.length < minGames) continue;
        if (meanNums(slice.map((g) => g.minutes)) < minMin) continue;
        const raw = advGetter(p.advanced);
        if (!Number.isFinite(raw) || raw <= 0) continue;
        const val = decimals >= 2 ? round2(raw) : round1(raw);
        const isBetter = !best ? true : opts?.lowerIsBetter ? val < best.value : val > best.value;
        if (isBetter) {
          const { teamAbbr, stintNote } = resolvePlayerSliceTeam(slice, p.teamAbbr);
          best = { entityId: p.id, entityName: p.name, teamAbbr, value: val, secondaryLabel: maxDate ? `${stintNote}${slice.length} PJ (perfil 25-26)` : `${stintNote}${p.advanced.gp || slice.length} PJ` };
        }
      }
      return best;
    }, "pickAdv");
    return { metricId, metricLabel, group, entityType: "player", unit, decimals, lowerIsBetter: opts?.lowerIsBetter, current2027: pickAdv(p27, minGp27), prev2026Full: pickAdv(p26, minGp26Full), prev2026Opening: pickAdv(p26, minGp26Open, openingCutoff26) };
  }, "makePlayerAdvSL");
  const makeTeamSL = __name((metricId, metricLabel, unit, decimals, getter, opts) => {
    const pickTeam = __name((pool, maxDate) => {
      let best = null;
      const roundFn = decimals >= 2 ? round2 : decimals === 0 ? Math.round : round1;
      for (const t of pool) {
        const slice = maxDate ? t.games.filter((g) => g.date <= maxDate) : t.games;
        if (slice.length === 0) continue;
        const raw = getter(slice, t, Boolean(maxDate));
        if (raw === null || !Number.isFinite(raw)) continue;
        const val = roundFn(raw);
        const isBetter = !best ? true : opts?.lowerIsBetter ? val < best.value : val > best.value;
        if (isBetter) {
          const wins = slice.filter((g) => g.result === "W").length;
          const losses = slice.length - wins;
          best = { entityId: t.id, entityName: t.name, teamAbbr: t.abbreviation, value: val, secondaryLabel: `Balance ${wins}-${losses} (${slice.length} PJ)` };
        }
      }
      return best;
    }, "pickTeam");
    return { metricId, metricLabel, group: "team_leaders", entityType: "team", unit, decimals, lowerIsBetter: opts?.lowerIsBetter, current2027: pickTeam(t27), prev2026Full: pickTeam(t26), prev2026Opening: pickTeam(t26, openingCutoff26) };
  }, "makeTeamSL");
  const seasonLeaders = [makePlayerSL("sl-player-pts-avg", "Puntos por partido (PPG)", "shooting_scoring", "PTS", 1, (gs) => meanNums(gs.map((g) => g.points)), { extraSecondary: __name((gs) => `${gs.reduce((s, g) => s + g.points, 0)} PTS tot.`, "extraSecondary") }), makePlayerSL("sl-player-pts-tot", "Puntos totales acumulados", "shooting_scoring", "PTS", 0, (gs) => gs.reduce((s, g) => s + g.points, 0), { isCumulativeTotal: true, extraSecondary: __name((gs) => `${round1(meanNums(gs.map((g) => g.points))).toFixed(1)} PTS/PJ`, "extraSecondary") }), makePlayerSL("sl-player-pts36", "Puntos por cada 36 minutos (PTS/36m)", "shooting_scoring", "PTS", 1, (gs) => {
    const min = gs.reduce((s, g) => s + g.minutes, 0);
    const pts = gs.reduce((s, g) => s + g.points, 0);
    return min >= gs.length * 18 ? pts / min * 36 : null;
  }, { minMinutesAvg: 20 }), makePlayerSL("sl-player-fgm-avg", "Tiros de campo anotados por partido (FGM)", "shooting_scoring", "TCM", 1, (gs) => meanNums(gs.map((g) => g.fgm))), makePlayerSL("sl-player-fgm-tot", "Tiros de campo totales anotados", "shooting_scoring", "TCM", 0, (gs) => gs.reduce((s, g) => s + g.fgm, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-fga-avg", "Tiros de campo intentados por partido (FGA)", "shooting_scoring", "TCI", 1, (gs) => meanNums(gs.map((g) => g.fga))), makePlayerSL("sl-player-fgpct", "% Acierto en tiros de campo (FG%, m\xEDn. 7 TCI/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const fgm = gs.reduce((s, g) => s + g.fgm, 0);
    const fga = gs.reduce((s, g) => s + g.fga, 0);
    return fga >= gs.length * 7 ? fgm / fga * 100 : null;
  }, { extraSecondary: __name((gs) => `${gs.reduce((s, g) => s + g.fgm, 0)}/${gs.reduce((s, g) => s + g.fga, 0)} TC`, "extraSecondary") }), makePlayerSL("sl-player-fg2m-avg", "Tiros de 2 puntos anotados por partido (2PM)", "shooting_scoring", "T2M", 1, (gs) => meanNums(gs.map((g) => Math.max(0, g.fgm - g.fg3m)))), makePlayerSL("sl-player-fg2pct", "% Acierto en tiros de 2 puntos (2P%, m\xEDn. 5 T2I/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const fg2m = gs.reduce((s, g) => s + Math.max(0, g.fgm - g.fg3m), 0);
    const fg2a = gs.reduce((s, g) => s + Math.max(0, g.fga - g.fg3a), 0);
    return fg2a >= gs.length * 5 ? fg2m / fg2a * 100 : null;
  }, { extraSecondary: __name((gs) => `${gs.reduce((s, g) => s + Math.max(0, g.fgm - g.fg3m), 0)}/${gs.reduce((s, g) => s + Math.max(0, g.fga - g.fg3a), 0)} T2`, "extraSecondary") }), makePlayerSL("sl-player-3pm-avg", "Triples anotados por partido (3PM)", "shooting_scoring", "3PM", 1, (gs) => meanNums(gs.map((g) => g.fg3m)), { extraSecondary: __name((gs) => `${gs.reduce((s, g) => s + g.fg3m, 0)} triples tot.`, "extraSecondary") }), makePlayerSL("sl-player-3pm-tot", "Triples totales acumulados", "shooting_scoring", "3PM", 0, (gs) => gs.reduce((s, g) => s + g.fg3m, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-3pa-avg", "Triples intentados por partido (3PA)", "shooting_scoring", "3PA", 1, (gs) => meanNums(gs.map((g) => g.fg3a))), makePlayerSL("sl-player-3ppct", "% Acierto en triples (3P%, m\xEDn. 3.5 3PA/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const m = gs.reduce((s, g) => s + g.fg3m, 0);
    const a = gs.reduce((s, g) => s + g.fg3a, 0);
    return a >= gs.length * 3.5 ? m / a * 100 : null;
  }, { extraSecondary: __name((gs) => `${gs.reduce((s, g) => s + g.fg3m, 0)}/${gs.reduce((s, g) => s + g.fg3a, 0)} T3`, "extraSecondary") }), makePlayerSL("sl-player-ftm-avg", "Tiros libres anotados por partido (FTM)", "shooting_scoring", "TLM", 1, (gs) => meanNums(gs.map((g) => g.ftm))), makePlayerSL("sl-player-ftm-tot", "Tiros libres totales anotados", "shooting_scoring", "TLM", 0, (gs) => gs.reduce((s, g) => s + g.ftm, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-fta-avg", "Tiros libres intentados por partido (FTA)", "shooting_scoring", "TLI", 1, (gs) => meanNums(gs.map((g) => g.fta))), makePlayerSL("sl-player-ftpct", "% Acierto en tiros libres (FT%, m\xEDn. 2.5 TLI/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const m = gs.reduce((s, g) => s + g.ftm, 0);
    const a = gs.reduce((s, g) => s + g.fta, 0);
    return a >= gs.length * 2.5 ? m / a * 100 : null;
  }, { extraSecondary: __name((gs) => `${gs.reduce((s, g) => s + g.ftm, 0)}/${gs.reduce((s, g) => s + g.fta, 0)} TL`, "extraSecondary") }), makePlayerSL("sl-player-efg", "Tiro de Campo Efectivo (eFG%, m\xEDn. 7 TCI/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const fgm = gs.reduce((s, g) => s + g.fgm, 0);
    const fg3m = gs.reduce((s, g) => s + g.fg3m, 0);
    const fga = gs.reduce((s, g) => s + g.fga, 0);
    return fga >= gs.length * 7 ? (fgm + 0.5 * fg3m) / fga * 100 : null;
  }), makePlayerSL("sl-player-ts", "Acierto Real True Shooting (TS%, m\xEDn. 12 PTS/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const pts = gs.reduce((s, g) => s + g.points, 0);
    const fga = gs.reduce((s, g) => s + g.fga, 0);
    const fta = gs.reduce((s, g) => s + g.fta, 0);
    const denom = 2 * (fga + 0.44 * fta);
    return pts >= gs.length * 12 && denom > 0 ? pts / denom * 100 : null;
  }, { extraSecondary: __name((gs) => `${round1(meanNums(gs.map((g) => g.points))).toFixed(1)} PTS/PJ`, "extraSecondary") }), makePlayerSL("sl-player-reb-avg", "Rebotes totales por partido (RPG)", "rebounding", "REB", 1, (gs) => meanNums(gs.map((g) => g.rebounds))), makePlayerSL("sl-player-reb-tot", "Rebotes totales acumulados", "rebounding", "REB", 0, (gs) => gs.reduce((s, g) => s + g.rebounds, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-orb-avg", "Rebotes ofensivos por partido (ORPG)", "rebounding", "OR", 1, (gs) => meanNums(gs.map((g) => g.oreb))), makePlayerSL("sl-player-orb-tot", "Rebotes ofensivos totales acumulados", "rebounding", "OR", 0, (gs) => gs.reduce((s, g) => s + g.oreb, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-drb-avg", "Rebotes defensivos por partido (DRPG)", "rebounding", "DR", 1, (gs) => meanNums(gs.map((g) => g.dreb))), makePlayerSL("sl-player-drb-tot", "Rebotes defensivos totales acumulados", "rebounding", "DR", 0, (gs) => gs.reduce((s, g) => s + g.dreb, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-reb36", "Rebotes totales por cada 36 minutos (REB/36m)", "rebounding", "REB", 1, (gs) => {
    const min = gs.reduce((s, g) => s + g.minutes, 0);
    const reb = gs.reduce((s, g) => s + g.rebounds, 0);
    return min >= gs.length * 16 ? reb / min * 36 : null;
  }), makePlayerAdvSL("sl-player-orebpct", "% Rebote Ofensivo capturado en pista (OREB% NBA.com)", "rebounding", "%", 1, (adv) => adv.orebPct), makePlayerAdvSL("sl-player-rebpct", "% Rebote Total capturado en pista (REB% NBA.com)", "rebounding", "%", 1, (adv) => adv.rebPct), makePlayerSL("sl-player-ast-avg", "Asistencias por partido (APG)", "playmaking_allaround", "AST", 1, (gs) => meanNums(gs.map((g) => g.assists))), makePlayerSL("sl-player-ast-tot", "Asistencias totales acumuladas", "playmaking_allaround", "AST", 0, (gs) => gs.reduce((s, g) => s + g.assists, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-astto", "Ratio Asistencias / P\xE9rdidas (AST/PER, m\xEDn. 4 AST/PJ)", "playmaking_allaround", "x", 2, (gs) => {
    const ast = gs.reduce((s, g) => s + g.assists, 0);
    const tov = gs.reduce((s, g) => s + g.turnovers, 0);
    if (ast < gs.length * 4) return null;
    return tov > 0 ? ast / tov : ast;
  }, { extraSecondary: __name((gs) => `${round1(meanNums(gs.map((g) => g.assists))).toFixed(1)} AST / ${round1(meanNums(gs.map((g) => g.turnovers))).toFixed(1)} PER`, "extraSecondary") }), makePlayerSL("sl-player-ast36", "Asistencias por cada 36 minutos (AST/36m)", "playmaking_allaround", "AST", 1, (gs) => {
    const min = gs.reduce((s, g) => s + g.minutes, 0);
    const ast = gs.reduce((s, g) => s + g.assists, 0);
    return min >= gs.length * 18 ? ast / min * 36 : null;
  }), makePlayerAdvSL("sl-player-astpct", "% de Asistencias sobre canastas en pista (AST% NBA.com)", "playmaking_allaround", "%", 1, (adv) => adv.astPct), makePlayerSL("sl-player-pra-avg", "Producci\xF3n combinada PRA (PTS+REB+AST) / PJ", "playmaking_allaround", "PRA", 1, (gs) => meanNums(gs.map((g) => g.pra))), makePlayerSL("sl-player-pr-avg", "Combinada Puntos + Rebotes (PTS+REB) / PJ", "playmaking_allaround", "P+R", 1, (gs) => meanNums(gs.map((g) => g.points + g.rebounds))), makePlayerSL("sl-player-pa-avg", "Combinada Puntos + Asistencias (PTS+AST) / PJ", "playmaking_allaround", "P+A", 1, (gs) => meanNums(gs.map((g) => g.points + g.assists))), makePlayerSL("sl-player-ra-avg", "Combinada Rebotes + Asistencias (REB+AST) / PJ", "playmaking_allaround", "R+A", 1, (gs) => meanNums(gs.map((g) => g.rebounds + g.assists))), makePlayerSL("sl-player-dd2", "Dobles-Dobles logrados en temporada (DD2)", "playmaking_allaround", "DD2", 0, (gs) => countDoubleDoubles(gs), { isCumulativeTotal: true }), makePlayerSL("sl-player-td3", "Triples-Dobles logrados en temporada (TD3)", "playmaking_allaround", "TD3", 0, (gs) => countTripleDoubles(gs), { isCumulativeTotal: true }), makePlayerSL("sl-player-gmsc-avg", "Valoraci\xF3n media Hollinger (Game Score / PJ)", "playmaking_allaround", "GmSc", 1, (gs) => meanNums(gs.map((g) => g.gameScore))), makePlayerSL("sl-player-min-avg", "Minutos disputados por partido (MPG)", "playmaking_allaround", "MIN", 1, (gs) => meanNums(gs.map((g) => g.minutes))), makePlayerSL("sl-player-min-tot", "Minutos totales acumulados", "playmaking_allaround", "MIN", 0, (gs) => gs.reduce((s, g) => s + g.minutes, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-pm-avg", "Impacto M\xE1s/Menos medio por partido (+/-)", "playmaking_allaround", "+/-", 1, (gs) => meanNums(gs.map((g) => g.plusMinus))), makePlayerSL("sl-player-pm-tot", "Impacto M\xE1s/Menos total acumulado (+/-)", "playmaking_allaround", "+/-", 0, (gs) => gs.reduce((s, g) => s + g.plusMinus, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-stl-avg", "Robos de bal\xF3n por partido (SPG)", "defense_discipline", "ROB", 1, (gs) => meanNums(gs.map((g) => g.steals))), makePlayerSL("sl-player-stl-tot", "Robos totales acumulados", "defense_discipline", "ROB", 0, (gs) => gs.reduce((s, g) => s + g.steals, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-blk-avg", "Tapones colocados por partido (BPG)", "defense_discipline", "TAP", 1, (gs) => meanNums(gs.map((g) => g.blocks))), makePlayerSL("sl-player-blk-tot", "Tapones totales acumulados", "defense_discipline", "TAP", 0, (gs) => gs.reduce((s, g) => s + g.blocks, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-stocks-avg", "Stocks (Robos + Tapones) por partido", "defense_discipline", "STK", 1, (gs) => meanNums(gs.map((g) => g.stocks))), makePlayerSL("sl-player-stocks-tot", "Stocks (Robos + Tapones) totales acumulados", "defense_discipline", "STK", 0, (gs) => gs.reduce((s, g) => s + g.stocks, 0), { isCumulativeTotal: true }), makePlayerAdvSL("sl-player-defl", "Desv\xEDos de bal\xF3n por partido (Deflections NBA.com)", "defense_discipline", "DESV", 1, (adv) => adv.deflections), makePlayerAdvSL("sl-player-contest", "Tiros rivales punteados por partido (Contested Shots)", "defense_discipline", "PUNT", 1, (adv) => adv.contestedShots), makePlayerAdvSL("sl-player-loose", "Balones divididos recuperados / PJ (Loose Balls)", "defense_discipline", "REC", 1, (adv) => adv.looseBalls), makePlayerAdvSL("sl-player-boxouts", "Cierres de rebote por partido (Box-Outs NBA.com)", "defense_discipline", "BOX", 1, (adv) => adv.boxOuts), makePlayerSL("sl-player-tov-high", "M\xE1s p\xE9rdidas de bal\xF3n cometidas por partido", "defense_discipline", "PER", 1, (gs) => meanNums(gs.map((g) => g.turnovers))), makePlayerSL("sl-player-pf-low", "Menor media de faltas en titulares (\u226528 MIN/PJ)", "defense_discipline", "FP", 1, (gs) => meanNums(gs.map((g) => g.fouls)), { minMinutesAvg: 28, lowerIsBetter: true }), makePlayerSL("sl-player-usg", "Protagonismo ofensivo (Uso estimado USG%)", "advanced_hustle", "%", 1, (gs) => meanNums(gs.map((g) => g.usgEst)), { minMinutesAvg: 20 }), makePlayerAdvSL("sl-player-pie", "Impacto global en pista (PIE% NBA.com)", "advanced_hustle", "%", 1, (adv) => adv.pie, { minMinutesAvg: 22 }), makePlayerAdvSL("sl-player-netrtg", "Mejor Net Rating individual en pista (\u226524 MIN/PJ)", "advanced_hustle", "RTG", 1, (adv) => adv.netRtg, { minMinutesAvg: 24 }), makePlayerAdvSL("sl-player-offrtg", "Mejor Eficiencia Ofensiva en pista OffRtg (\u226524 MIN/PJ)", "advanced_hustle", "RTG", 1, (adv) => adv.offRtg, { minMinutesAvg: 24 }), makePlayerAdvSL("sl-player-defrtg", "Mejor Eficiencia Defensiva en pista DefRtg (\u226524 MIN/PJ)", "advanced_hustle", "RTG", 1, (adv) => adv.defRtg, { minMinutesAvg: 24, lowerIsBetter: true }), makePlayerAdvSL("sl-player-paint", "Puntos en la Pintura por partido (NBA.com)", "advanced_hustle", "PTS", 1, (adv) => adv.ptsPaint), makePlayerAdvSL("sl-player-fb", "Puntos al Contraataque por partido (Fast Break)", "advanced_hustle", "PTS", 1, (adv) => adv.ptsFastBreak), makePlayerAdvSL("sl-player-2nd", "Puntos de 2\xAA Oportunidad por partido (NBA.com)", "advanced_hustle", "PTS", 1, (adv) => adv.pts2ndChance), makePlayerAdvSL("sl-player-pfd", "Faltas personales provocadas por partido (PFD)", "advanced_hustle", "PFD", 1, (adv) => adv.foulsDrawn), makePlayerAdvSL("sl-player-screen", "Asistencias de bloqueo por partido (Screen Assists)", "advanced_hustle", "PANT", 1, (adv) => adv.screenAssists), makeTeamSL("sl-team-winpct", "Mejor porcentaje de victorias colectivo (%V)", "%", 1, (gs) => gs.filter((g) => g.result === "W").length / gs.length * 100), makeTeamSL("sl-team-pts-avg", "Ataque m\xE1s anotador de la NBA (PTS a favor / PJ)", "PTS", 1, (gs) => meanNums(gs.map((g) => g.pointsFor))), makeTeamSL("sl-team-opp-pts", "Defensa que menos puntos recibe (PTS en contra / PJ)", "PTS", 1, (gs) => meanNums(gs.map((g) => g.pointsAgainst)), { lowerIsBetter: true }), makeTeamSL("sl-team-diff", "Mayor margen medio de puntos (Diferencial +/-)", "PTS", 1, (gs) => meanNums(gs.map((g) => g.differential))), makeTeamSL("sl-team-offrtg", "Mejor Eficiencia Ofensiva colectiva (OffRtg)", "RTG", 1, (gs, t, isOpen) => !isOpen && t.advanced?.offRtg ? t.advanced.offRtg : meanNums(gs.map((g) => g.offRtg))), makeTeamSL("sl-team-defrtg", "Mejor Eficiencia Defensiva colectiva (DefRtg)", "RTG", 1, (gs, t, isOpen) => !isOpen && t.advanced?.defRtg ? t.advanced.defRtg : meanNums(gs.map((g) => g.defRtg)), { lowerIsBetter: true }), makeTeamSL("sl-team-netrtg", "Mejor Dominio Neto por 100 posesiones (NetRtg)", "RTG", 1, (gs, t, isOpen) => !isOpen && t.advanced?.netRtg !== void 0 ? t.advanced.netRtg : meanNums(gs.map((g) => g.netRtg))), makeTeamSL("sl-team-pace", "Franquicia con ritmo m\xE1s alto de juego (Pace)", "POS", 1, (gs, t, isOpen) => !isOpen && t.advanced?.pace ? t.advanced.pace : meanNums(gs.map((g) => g.pace))), makeTeamSL("sl-team-3pm-avg", "M\xE1s triples anotados por partido (Equipo)", "3PM", 1, (gs) => meanNums(gs.map((g) => g.fg3m))), makeTeamSL("sl-team-3ppct", "Mejor % de acierto en triples colectivo", "%", 1, (gs) => {
    const m = gs.reduce((s, g) => s + g.fg3m, 0);
    const a = gs.reduce((s, g) => s + g.fg3a, 0);
    return a > 0 ? m / a * 100 : null;
  }), makeTeamSL("sl-team-fgpct", "Mejor % en tiros de campo colectivo (FG%)", "%", 1, (gs) => {
    const m = gs.reduce((s, g) => s + g.fgm, 0);
    const a = gs.reduce((s, g) => s + g.fga, 0);
    return a > 0 ? m / a * 100 : null;
  }), makeTeamSL("sl-team-ftpct", "Mejor % en tiros libres colectivo (FT%)", "%", 1, (gs) => {
    const m = gs.reduce((s, g) => s + g.ftm, 0);
    const a = gs.reduce((s, g) => s + g.fta, 0);
    return a > 0 ? m / a * 100 : null;
  }), makeTeamSL("sl-team-efg", "Mejor Tiro Efectivo colectivo (eFG%)", "%", 1, (gs, t, isOpen) => !isOpen && t.advanced?.efgPct ? t.advanced.efgPct : meanNums(gs.map((g) => g.efgPct))), makeTeamSL("sl-team-ts", "Mejor True Shooting colectivo (TS%)", "%", 1, (gs, t, isOpen) => !isOpen && t.advanced?.tsPct ? t.advanced.tsPct : meanNums(gs.map((g) => g.tsPct))), makeTeamSL("sl-team-reb-avg", "M\xE1s rebotes totales por partido (Equipo)", "REB", 1, (gs) => meanNums(gs.map((g) => g.reb))), makeTeamSL("sl-team-orb-avg", "M\xE1s rebotes ofensivos por partido (Equipo)", "OR", 1, (gs) => meanNums(gs.map((g) => g.oreb))), makeTeamSL("sl-team-ast-avg", "M\xE1s asistencias colectivas por partido (Equipo)", "AST", 1, (gs) => meanNums(gs.map((g) => g.ast))), makeTeamSL("sl-team-stl-avg", "M\xE1s robos de bal\xF3n por partido (Equipo)", "ROB", 1, (gs) => meanNums(gs.map((g) => g.stl))), makeTeamSL("sl-team-blk-avg", "M\xE1s tapones colocados por partido (Equipo)", "TAP", 1, (gs) => meanNums(gs.map((g) => g.blk))), makeTeamSL("sl-team-tov-low", "Equipo que menos balones pierde por partido", "PER", 1, (gs) => meanNums(gs.map((g) => g.tov)), { lowerIsBetter: true }), makeTeamSL("sl-team-paint", "M\xE1s puntos en la Pintura por partido (Equipo NBA.com)", "PTS", 1, (_gs, t) => t.advanced?.ptsPaint && t.advanced.ptsPaint > 0 ? t.advanced.ptsPaint : null), makeTeamSL("sl-team-fb", "M\xE1s puntos al Contraataque por partido (Equipo NBA.com)", "PTS", 1, (_gs, t) => t.advanced?.ptsFastBreak && t.advanced.ptsFastBreak > 0 ? t.advanced.ptsFastBreak : null)];
  const payload = { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), dataSource: full.s2027.dataSource, totalPlayersScanned: (/* @__PURE__ */ new Set([...p27.map((x) => x.id), ...p26.map((x) => x.id)])).size, openingGamesPerTeam: avgGp27, global2027: buildGlobalSnap("2026-27", t27), global2026Full: buildGlobalSnap("2025-26", t26), global2026Opening: buildGlobalSnap("2025-26 (Mismo tramo)", t26, avgGp27), singleGameRecords, seasonLeaders };
  cachedMilestones = { expiresAt: Date.now() + 10 * 60 * 1e3, payload };
  return payload;
}
const scoutingEngine = createScoutingEngine({ getFullLeagueMemory: __name(async () => {
  const full = await getFullLeagueMemory(false);
  return { teams: full.teams, allPlayers: full.allPlayers };
}, "getFullLeagueMemory"), getPlayerBiosMap, getGameDayPayload, cachedFetchJson });
async function getFantasyEspnSyncPayload(forceRefresh = false) {
  const biosMap = await getPlayerBiosMap(false);
  const lightweightPlayers = [...biosMap.values()].map((b) => ({ id: b.id, name: b.name, teamId: b.teamId, teamAbbr: b.teamAbbr, teamName: NBA_TEAMS_MAP[b.teamAbbr]?.name || b.teamAbbr, position: b.position || "G-F", jersey: b.jersey || void 0, height: b.height || void 0, country: b.country || void 0, games: [] }));
  return buildFantasyEspnSyncPayload({ allPlayers: lightweightPlayers, fetchLeagueScheduleGames: scoutingEngine.fetchLeagueScheduleGames, fetchEspnInjuriesByName: scoutingEngine.fetchEspnInjuriesByName, forceRefresh });
}
async function getSeasonAwardsPayload(seasonScope = "2027", forceRefresh = false) {
  const [full, biosMap] = await Promise.all([getFullLeagueMemory(forceRefresh), getPlayerBiosMap(false)]);
  return buildSeasonAwardsPayload({ full, biosMap, seasonScope, forceRefresh });
}
async function syncNbaSnapshotToDisk(options) {
  const existingSnap = readNbaSnapshotFromDisk();
  const prevGames2027 = existingSnap?.s2027 ? Math.round(existingSnap.s2027.teams.reduce((acc, t) => acc + t.games.length, 0) / 2) : 0;
  const forceFull2026 = Boolean(options?.forceFull2026) || !existingSnap?.s2026;
  const biosMap = await getPlayerBiosMap(true, { forceLiveStats: true });
  const s2026 = forceFull2026 ? await buildSingleSeasonDataset("2025-26", true, { forceLiveStats: true }) : hydrateSeasonDatasetFromSnapshot(existingSnap.s2026);
  let statsLiveSucceeded = false;
  try {
    const probe = await cachedFetchJson("https://stats.nba.com/stats/leaguestandingsv3?GroupBy=conf&LeagueID=00&Season=2026-27&SeasonType=Regular%20Season&Section=overall", 60 * 1e3, NBA_STATS_HEADERS, 8e3, true);
    statsLiveSucceeded = parseNbaResultSet(probe).length >= 30;
  } catch {
    statsLiveSucceeded = false;
  }
  const s2027 = await buildSingleSeasonDataset("2026-27", true, { forceLiveStats: true, cdnMaxGames: 180, cdnTimeoutMs: 4e4 });
  if (existingSnap?.s2027) {
    const prevPlayersById = new Map(existingSnap.s2027.players.map((p) => [p.id, p]));
    for (const [pid, curP] of s2027.playersById.entries()) {
      if (!curP.advanced) {
        const prevP = prevPlayersById.get(pid);
        if (prevP?.advanced) curP.advanced = { ...prevP.advanced };
      }
    }
    const prevTeamsByAbbr = new Map(existingSnap.s2027.teams.map((t) => [t.abbreviation, t]));
    for (const [abbr, curT] of s2027.teamsByAbbr.entries()) {
      if (!curT.advanced) {
        const prevT = prevTeamsByAbbr.get(abbr);
        if (prevT?.advanced) curT.advanced = { ...prevT.advanced };
      }
    }
  }
  const lastSyncedSource = statsLiveSucceeded ? "nba_stats_live" : "cdn_delta_only";
  const snapshot = { version: 1, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), lastSyncedSource, bios: [...biosMap.values()], s2025: existingSnap?.s2025, s2024: existingSnap?.s2024, s2026: serializeSeasonDatasetForSnapshot(s2026), s2027: serializeSeasonDatasetForSnapshot(s2027) };
  const teamGames2026 = Math.round(snapshot.s2026.teams.reduce((acc, t) => acc + t.games.length, 0) / 2);
  const teamGames2027 = Math.round(snapshot.s2027.teams.reduce((acc, t) => acc + t.games.length, 0) / 2);
  if (teamGames2027 < prevGames2027) {
    throw new Error(`Guardia de no-regresi\xF3n activada: el nuevo snapshot ten\xEDa ${teamGames2027} partidos 2026-27 frente a ${prevGames2027} previos.`);
  }
  const written = writeNbaSnapshotToDisk(snapshot);
  return { ...written, lastSyncedSource, biosCount: snapshot.bios.length, players2026: snapshot.s2026.players.length, players2027: snapshot.s2027.players.length, teamGames2026, teamGames2027 };
}
export {
  buildSingleSeasonDataset,
  cachedFetchJson,
  fetchLiveScoreboardGames,
  getBootstrapPayload,
  getBootstrapWireBuffers,
  getBootstrapWirePayload,
  getFantasyEspnSyncPayload,
  getFullLeagueMemory,
  getGameDayPayload,
  getMilestonesPayload,
  getPlayerBiosMap,
  getPlayerInspectorDossier,
  getSeasonAwardsPayload,
  getScoreboardDeltaPayload,
  getSinglePlayerSummary,
  getTeamRoster,
  scoutingEngine,
  searchLeaguePlayers,
  syncNbaSnapshotToDisk
};
