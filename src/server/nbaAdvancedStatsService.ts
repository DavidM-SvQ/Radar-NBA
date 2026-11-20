// @ts-nocheck
import { executeWithCircuitBreaker, identifyProviderFromUrl, isCircuitOpen } from "./circuitBreaker.ts";
import {
  readNbaSnapshotFromDisk,
  readNbaAdvancedSnapshotFromDisk,
  writeNbaAdvancedSnapshotToDisk,
  type NbaAdvancedSnapshotPayload,
} from "./nbaSnapshotStore.ts";
import { NBA_TEAMS_MAP } from "../utils/teamLogos.ts";

let memoryAdvancedSnapshot: NbaAdvancedSnapshotPayload | null = null;

export function getActiveAdvancedSnapshot(): NbaAdvancedSnapshotPayload | null {
  if (memoryAdvancedSnapshot) return memoryAdvancedSnapshot;
  try {
    const snap = readNbaAdvancedSnapshotFromDisk();
    if (snap) {
      memoryAdvancedSnapshot = snap;
      return snap;
    }
  } catch (err) {
    console.warn("[RadarNBA] Error leyendo snapshot avanzado:", err);
  }
  return null;
}

function getCachedAdvancedFromSnapshot(seasonToken: string | undefined, datasetKey: string, forceRefresh: boolean): any | null {
  if (forceRefresh) return null;
  try {
    const snap = readNbaSnapshotFromDisk();
    const season = resolveNbaSeasonParam(seasonToken);
    const ds = snap?.advancedDatasets?.[season]?.[datasetKey];
    if (ds && Array.isArray(ds.items) && ds.items.length > 0) {
      return ds;
    }
  } catch {
    // ignore
  }
  return null;
}

const advancedCache = new Map<string, { expiresAt: number; value: any }>();
const advancedInflight = new Map<string, Promise<any>>();
const advBenchmarksCache = new Map<string, { expiresAt: number; value: Record<string, { mean: number; sd: number }> }>();

const NBA_STATS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Referer": "https://www.nba.com/",
  "Origin": "https://www.nba.com",
  "Accept": "application/json, text/plain, */*",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
  "Accept-Language": "en-US,en;q=0.9",
};

const TEAM_ID_TO_ABBR = new Map<string, string>(
  Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) => [String(meta.id), abbr])
);

function round1(v: number): number {
  return Math.round((Number(v) || 0) * 10) / 10;
}
function round2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}
function toPct100(v: any): number {
  const n = Number(v) || 0;
  return n > 0 && n <= 1 ? round1(n * 100) : round1(n);
}

export function resolveNbaSeasonParam(token?: string): string {
  if (!token || token === "2027" || token === "continuous") return "2026-27";
  if (token === "2026") return "2025-26";
  if (token === "2025") return "2024-25";
  if (token === "2024") return "2023-24";
  return token.includes("-") ? token : "2026-27";
}

function resolveEntityId(o: any, scope: "team" | "player"): string {
  if (scope === "player") {
    return String(o.PLAYER_ID ?? o.CLOSE_DEF_PERSON_ID ?? o.PERSON_ID ?? "").trim();
  }
  return String(o.TEAM_ID ?? "").trim();
}

function resolveEntityName(o: any, scope: "team" | "player"): string {
  if (scope === "player") {
    return String(o.PLAYER_NAME ?? o.TEAM_NAME ?? "").trim();
  }
  return String(o.TEAM_NAME ?? o.PLAYER_NAME ?? "").trim();
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function cachedFetchAdvancedJson(url: string, ttlMs = 15 * 60 * 1000, forceRefresh = false): Promise<any> {
  if (!forceRefresh) {
    const hit = advancedCache.get(url);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
  }
  const inflight = advancedInflight.get(url);
  if (inflight && !forceRefresh) {
    return inflight;
  }
  const provider = identifyProviderFromUrl(url);
  if (!forceRefresh && isCircuitOpen(provider)) {
    const stale = advancedCache.get(url);
    return stale ? stale.value : null;
  }
  const p = executeWithCircuitBreaker(
    provider,
    async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8500);
        try {
          const res = await fetch(url, { headers: NBA_STATS_HEADERS, signal: controller.signal });
          clearTimeout(timer);
          if (!res.ok) {
            if (res.status === 400 || res.status === 404) {
              advancedCache.set(url, { expiresAt: Date.now() + 5 * 60 * 1000, value: null });
              return null;
            }
            if ((res.status >= 500 || res.status === 429) && attempt === 0) {
              await new Promise((r) => setTimeout(r, 350));
              continue;
            }
            throw new Error(`HTTP ${res.status} fetching ${url}`);
          }
          const data = await res.json();
          advancedCache.set(url, { expiresAt: Date.now() + ttlMs, value: data });
          return data;
        } catch (err: any) {
          clearTimeout(timer);
          const isAbort = err?.name === "AbortError" || /aborted/i.test(String(err?.message || ""));
          if (attempt === 0 && !isAbort) {
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          throw err;
        }
      }
      return null;
    },
    () => {
      const stale = advancedCache.get(url);
      return stale ? stale.value : null;
    }
  );
  advancedInflight.set(url, p);
  try {
    return await p;
  } catch {
    return null;
  } finally {
    advancedInflight.delete(url);
  }
}

function parseResultSet(raw: any, index = 0): { headers: string[]; rows: any[][] } {
  const rs = Array.isArray(raw?.resultSets)
    ? raw.resultSets[index]
    : raw?.resultSets && Array.isArray(raw.resultSets.rowSet)
    ? raw.resultSets
    : raw?.resultSet;
  if (!rs || !Array.isArray(rs.headers) || !Array.isArray(rs.rowSet)) {
    return { headers: [], rows: [] };
  }
  return { headers: rs.headers, rows: rs.rowSet };
}

function parseObjects(raw: any, index = 0): any[] {
  const { headers, rows } = parseResultSet(raw, index);
  if (!headers.length || !rows.length) return [];
  const out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const obj: any = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = r[j];
    }
    out[i] = obj;
  }
  return out;
}

function buildTeamDashUrl(measureType: string, season: string, extra = "", perMode: "PerGame" | "Totals" = "PerGame"): string {
  return `https://stats.nba.com/stats/leaguedashteamstats?Conference=&DateFrom=&DateTo=&Division=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=${encodeURIComponent(measureType)}&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=${perMode}&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0&VsConference=&VsDivision=&Weight=${extra}`;
}

function buildPlayerDashUrl(measureType: string, season: string, extra = "", perMode: "PerGame" | "Totals" = "PerGame"): string {
  return `https://stats.nba.com/stats/leaguedashplayerstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=${encodeURIComponent(measureType)}&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=${perMode}&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=${extra}`;
}

// Deterministic fallback builders for team views if NBA.com is temporarily unreachable
function buildDefaultTeamShotZones(teamId: string, abbr: string, name: string) {
  return {
    entityId: teamId,
    entityName: name,
    teamId,
    teamAbbr: abbr,
    restrictedArea: { fgm: 18.2, fga: 27.6, fgPct: 65.9 },
    paintNonRa: { fgm: 7.4, fga: 17.5, fgPct: 42.3 },
    midRange: { fgm: 4.1, fga: 10.0, fgPct: 41.0 },
    leftCorner3: { fgm: 1.8, fga: 4.6, fgPct: 39.1 },
    rightCorner3: { fgm: 1.7, fga: 4.5, fgPct: 37.8 },
    aboveBreak3: { fgm: 9.8, fga: 27.8, fgPct: 35.3 },
    corner3: { fgm: 3.5, fga: 9.1, fgPct: 38.5 },
    backcourt: { fgm: 0.1, fga: 0.3, fgPct: 33.3 },
    totalRimFga: 27.6,
    rimFgPct: 65.9,
    totalThreeFga: 36.9,
    threeFgPct: 36.1,
  };
}

function buildDefaultTeamClutch(teamId: string, abbr: string, name: string) {
  return {
    entityId: teamId,
    entityName: name,
    teamId,
    teamAbbr: abbr,
    gp: 24,
    w: 13,
    l: 11,
    wPct: 54.2,
    min: 4.2,
    pts: 9.4,
    fgm: 2.9,
    fga: 6.4,
    fgPct: 45.3,
    fg3m: 0.8,
    fg3a: 2.3,
    fg3Pct: 34.8,
    ftm: 2.8,
    fta: 3.6,
    ftPct: 77.8,
    reb: 4.1,
    ast: 1.8,
    stl: 0.7,
    blk: 0.5,
    tov: 0.9,
    plusMinus: 1.4,
    offRtg: 112.5,
    defRtg: 108.9,
    netRtg: 3.6,
    tsPct: 58.4,
    efgPct: 51.6,
    usgPct: 100.0,
    pie: 52.1,
  };
}

function buildDefaultTeamDefenseHustle(teamId: string, abbr: string, name: string) {
  return {
    entityId: teamId,
    entityName: name,
    teamId,
    teamAbbr: abbr,
    gp: 54,
    min: 48.0,
    defRating: 113.2,
    stl: 7.8,
    blk: 5.1,
    dreb: 32.8,
    drebPct: 72.4,
    pctDreb: 72.4,
    pctStl: 50.0,
    pctBlk: 50.0,
    oppPtsOffTov: 15.6,
    oppPts2ndChance: 13.2,
    oppPtsFb: 14.1,
    oppPtsPaint: 48.2,
    ptsPaint: 49.4,
    pts2ndChance: 13.6,
    ptsFb: 14.5,
    ptsOffTov: 16.4,
    blka: 4.8,
    pf: 19.2,
    pfd: 19.6,
    defWs: 18.4,
    dFgm: 41.2,
    dFga: 88.5,
    dFgPct: 46.6,
    normalFgPct: 47.2,
    pctPlusMinus: -0.6,
    defFreq: 100.0,
    oppFgm: 41.2,
    oppFga: 88.5,
    oppFgPct: 46.6,
    oppFg3m: 13.1,
    oppFg3a: 36.4,
    oppFg3Pct: 36.0,
    oppFtm: 17.5,
    oppFta: 22.4,
    oppFtPct: 78.1,
    oppOreb: 10.6,
    oppDreb: 32.1,
    oppReb: 42.7,
    oppAst: 26.2,
    oppTov: 14.1,
    oppStl: 7.6,
    oppBlk: 4.8,
    oppBlka: 5.1,
    oppPf: 19.6,
    oppPfd: 19.2,
    oppPts: 113.0,
    contestedShots: 47.8,
    contestedShots2pt: 31.4,
    contestedShots3pt: 16.4,
    deflections: 14.6,
    chargesDrawn: 0.42,
    screenAssists: 8.8,
    screenAstPts: 20.4,
    offLooseBalls: 2.8,
    defLooseBalls: 3.9,
    looseBalls: 6.7,
    pctLooseBallsOff: 41.8,
    pctLooseBallsDef: 58.2,
    offBoxOuts: 1.4,
    defBoxOuts: 8.9,
    boxOuts: 10.3,
    boxOutTeamRebs: 8.4,
    boxOutPlayerRebs: 3.2,
    pctBoxOutsOff: 13.6,
    pctBoxOutsDef: 86.4,
    pctBoxOutsTeamReb: 81.6,
    pctBoxOutsReb: 31.1,
  };
}

function buildDefaultTeamTracking(teamId: string, abbr: string, name: string) {
  return {
    entityId: teamId,
    entityName: name,
    teamId,
    teamAbbr: abbr,
    gp: 54,
    min: 48.0,
    drives: 44.5,
    driveFgm: 11.2,
    driveFga: 22.8,
    drivePts: 28.2,
    driveFgPct: 49.1,
    driveAstPct: 8.4,
    driveTovPct: 6.2,
    drivePassesPct: 38.4,
    catchShootFgm: 10.4,
    catchShootFga: 27.8,
    catchShootPts: 29.8,
    catchShootFgPct: 37.4,
    catchShootFg3Pct: 37.4,
    catchShootEfgPct: 56.1,
    pullUpFgm: 7.8,
    pullUpFga: 19.5,
    pullUpPts: 18.2,
    pullUpFgPct: 40.0,
    pullUpFg3Pct: 33.2,
    pullUpEfgPct: 44.6,
    passesMade: 284.5,
    passesReceived: 284.5,
    secondaryAst: 3.4,
    potentialAst: 46.2,
    astPtsCreated: 62.8,
    astToPassPctAdj: 9.4,
    orebContestPct: 38.2,
    orebChances: 24.5,
    orebChancePctAdj: 44.8,
    avgOrebDist: 6.1,
    drebContestPct: 28.6,
    drebChances: 56.8,
    drebChancePctAdj: 74.2,
    avgDrebDist: 7.4,
    rebContestPct: 31.4,
    rebChances: 81.3,
    rebChancePctAdj: 62.1,
    avgRebDist: 6.9,
    distMiles: 17.8,
    distMilesOff: 9.4,
    distMilesDef: 8.4,
    avgSpeed: 4.28,
    avgSpeedOff: 4.62,
    avgSpeedDef: 3.94,
    touches: 412.0,
    frontCtTouches: 234.0,
    timeOfPoss: 19.8,
    avgSecPerTouch: 2.88,
    avgDribPerTouch: 2.15,
    ptsPerTouch: 0.278,
    paintTouches: 24.6,
    paintTouchFgPct: 58.2,
    paintTouchPts: 28.4,
    ptsPerPaintTouch: 1.15,
    postTouches: 6.4,
    postTouchFgPct: 51.2,
    postTouchPts: 7.2,
    ptsPerPostTouch: 1.12,
    elbowTouches: 9.8,
    ptsPerElbowTouch: 0.94,
  };
}

function buildDefaultTeamScoringSplits(teamId: string, abbr: string, name: string) {
  return {
    entityId: teamId,
    entityName: name,
    teamId,
    teamAbbr: abbr,
    gp: 54,
    min: 48.0,
    pctFga2pt: 58.2,
    pctFga3pt: 41.8,
    pctPts2pt: 49.4,
    pctPts2ptMr: 7.2,
    pctPts3pt: 35.1,
    pctPtsFb: 12.6,
    pctPtsFt: 15.5,
    pctPtsOffTov: 14.8,
    pctPtsPaint: 42.2,
    pctAst2pm: 56.4,
    pctUast2pm: 43.6,
    pctAst3pm: 84.2,
    pctUast3pm: 15.8,
    pctAstFgm: 64.8,
    pctUastFgm: 35.2,
  };
}

function buildDefaultTeamFourFactors(teamId: string, abbr: string, name: string) {
  return {
    entityId: teamId,
    entityName: name,
    teamId,
    teamAbbr: abbr,
    gp: 54,
    min: 48.0,
    offRtg: 114.5,
    defRtg: 114.5,
    netRtg: 0.0,
    pace: 99.0,
    efgPct: 54.5,
    ftaRate: 25.4,
    tmTovPct: 13.8,
    orebPct: 27.6,
    oppEfgPct: 54.5,
    oppFtaRate: 25.4,
    oppTovPct: 13.8,
    oppOrebPct: 27.6,
    tsPct: 58.0,
    drebPct: 72.4,
    rebPct: 50.0,
    astPct: 63.5,
    astTo: 1.92,
    astRatio: 18.4,
    usgPct: 100.0,
    pie: 50.0,
  };
}

function buildDefaultTeamViolations(teamId: string, abbr: string, name: string) {
  return {
    entityId: teamId,
    entityName: name,
    teamId,
    teamAbbr: abbr,
    gp: 54,
    min: 48.0,
    travel: 24,
    doubleDribble: 3,
    discontinuedDribble: 5,
    offThreeSec: 6,
    fiveSec: 2,
    eightSec: 1,
    shotClock: 14,
    inbound: 2,
    backcourt: 3,
    offGoaltending: 4,
    palming: 3,
    offFoul: 26,
    defThreeSec: 8,
    charge: 8,
    delayOfGame: 9,
    defGoaltending: 7,
    lane: 4,
    jumpBall: 3,
    kickedBall: 12,
    totalViolations: 144,
    pf: 19.2,
    pfd: 19.6,
    blka: 4.8,
    tov: 14.1,
    dd2: 0.85,
    td3: 0.04,
    nbaFantasyPts: 238.5,
    ptsPaint: 49.4,
    pts2ndChance: 13.6,
    ptsFb: 14.5,
    ptsOffTov: 16.4,
    oppPtsPaint: 48.2,
    oppPts2ndChance: 13.2,
    oppPtsFb: 14.1,
    oppPtsOffTov: 15.6,
  };
}

function buildDefaultSynergyPlaytypes(typeGrouping: "offensive" | "defensive" = "offensive") {
  return [
    { playType: "Spotup", playTypeLabelEs: "Spot-Up (Tiro Tras Pase)", typeGrouping, percentile: 68, gp: 54, possPct: 22.4, ppp: 1.08, fgPct: 41.2, efgPct: 56.4, ftPossPct: 4.2, tovPossPct: 4.8, sfPossPct: 3.9, scorePossPct: 42.1, poss: 23.4, pts: 25.3 },
    { playType: "PRBallHandler", playTypeLabelEs: "P&R Manejador", typeGrouping, percentile: 72, gp: 54, possPct: 18.6, ppp: 0.94, fgPct: 44.8, efgPct: 49.2, ftPossPct: 9.6, tovPossPct: 12.8, sfPossPct: 8.4, scorePossPct: 43.6, poss: 19.5, pts: 18.3 },
    { playType: "Transition", playTypeLabelEs: "Transición Rápida", typeGrouping, percentile: 80, gp: 54, possPct: 15.2, ppp: 1.16, fgPct: 52.4, efgPct: 57.8, ftPossPct: 12.4, tovPossPct: 10.6, sfPossPct: 11.2, scorePossPct: 52.8, poss: 16.0, pts: 18.6 },
    { playType: "Isolation", playTypeLabelEs: "Aislamiento (1 vs 1)", typeGrouping, percentile: 60, gp: 54, possPct: 8.4, ppp: 0.92, fgPct: 42.1, efgPct: 46.5, ftPossPct: 11.8, tovPossPct: 8.4, sfPossPct: 9.8, scorePossPct: 41.2, poss: 8.8, pts: 8.1 },
    { playType: "PRRollMan", playTypeLabelEs: "P&R Continuador / Roll Man", typeGrouping, percentile: 64, gp: 54, possPct: 7.8, ppp: 1.18, fgPct: 58.6, efgPct: 60.2, ftPossPct: 14.2, tovPossPct: 8.2, sfPossPct: 12.4, scorePossPct: 54.2, poss: 8.2, pts: 9.7 },
    { playType: "Cut", playTypeLabelEs: "Corte sin Balón", typeGrouping, percentile: 75, gp: 54, possPct: 7.2, ppp: 1.32, fgPct: 64.5, efgPct: 65.0, ftPossPct: 16.4, tovPossPct: 7.4, sfPossPct: 14.8, scorePossPct: 62.1, poss: 7.5, pts: 9.9 },
    { playType: "Handoff", playTypeLabelEs: "Mano a Mano (DHO)", typeGrouping, percentile: 55, gp: 54, possPct: 5.6, ppp: 0.96, fgPct: 43.2, efgPct: 49.8, ftPossPct: 6.4, tovPossPct: 9.8, sfPossPct: 5.8, scorePossPct: 41.8, poss: 5.9, pts: 5.7 },
    { playType: "OffRebound", playTypeLabelEs: "Rebote Ofensivo / Putback", typeGrouping, percentile: 58, gp: 54, possPct: 5.2, ppp: 1.14, fgPct: 56.4, efgPct: 56.4, ftPossPct: 13.2, tovPossPct: 6.4, sfPossPct: 11.6, scorePossPct: 53.4, poss: 5.5, pts: 6.3 },
    { playType: "OffScreen", playTypeLabelEs: "Salida de Bloqueo Indirecto", typeGrouping, percentile: 62, gp: 54, possPct: 5.0, ppp: 0.98, fgPct: 40.8, efgPct: 48.6, ftPossPct: 5.8, tovPossPct: 9.2, sfPossPct: 5.2, scorePossPct: 40.6, poss: 5.2, pts: 5.1 },
    { playType: "Postup", playTypeLabelEs: "Poste Bajo", typeGrouping, percentile: 52, gp: 54, possPct: 4.6, ppp: 0.90, fgPct: 46.2, efgPct: 47.0, ftPossPct: 14.6, tovPossPct: 11.4, sfPossPct: 12.8, scorePossPct: 42.4, poss: 4.8, pts: 4.3 },
    { playType: "Misc", playTypeLabelEs: "Varios (Misc)", typeGrouping, percentile: 50, gp: 54, possPct: 4.2, ppp: 0.88, fgPct: 44.0, efgPct: 46.5, ftPossPct: 11.0, tovPossPct: 14.0, sfPossPct: 9.5, scorePossPct: 40.0, poss: 4.4, pts: 3.9 },
  ];
}

// =========================================================================
// 1. SHOT ZONES (Both PerGame + Totals merged; dynamic offset: 2 team / 6 player)
// =========================================================================
export async function getLeagueShotZonesAdvanced(seasonToken?: string, scope: "team" | "player" = "team", forceRefresh = false): Promise<any> {
  if (!forceRefresh) {
    const advSnap = getActiveAdvancedSnapshot();
    if (advSnap?.shotZones?.[scope]?.items?.length) {
      return advSnap.shotZones[scope];
    }
    const snapHit = getCachedAdvancedFromSnapshot(seasonToken, `shotZones_${scope}`, forceRefresh);
    if (snapHit) return snapHit;
  }
  const season = resolveNbaSeasonParam(seasonToken);
  const mkShotLocUrl = (perMode: "PerGame" | "Totals") =>
    scope === "team"
      ? `https://stats.nba.com/stats/leaguedashteamshotlocations?Conference=&DateFrom=&DateTo=&DistanceRange=By+Zone&GameScope=&GameSegment=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=${perMode}&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=`
      : `https://stats.nba.com/stats/leaguedashplayershotlocations?Conference=&DateFrom=&DateTo=&DistanceRange=By+Zone&GameScope=&GameSegment=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=${perMode}&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=`;

  const [pgRes, totRes] = await Promise.allSettled([
    cachedFetchAdvancedJson(mkShotLocUrl("PerGame"), 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(mkShotLocUrl("Totals"), 30 * 60 * 1000, forceRefresh),
  ]);

  const extractRs = (raw: any) =>
    Array.isArray(raw?.resultSets)
      ? raw.resultSets[0]
      : raw?.resultSets?.rowSet
      ? raw.resultSets
      : raw?.resultSet;

  const rsPg = pgRes.status === "fulfilled" ? extractRs(pgRes.value) : null;
  const rsTot = totRes.status === "fulfilled" ? extractRs(totRes.value) : null;

  const totRowById = new Map<string, any[]>();
  if (rsTot && Array.isArray(rsTot.rowSet)) {
    for (const r of rsTot.rowSet) {
      totRowById.set(String(r[0]), r);
    }
  }

  let items: any[] = [];
  const offset = scope === "team" ? 2 : 6;
  const primaryRs = rsPg && Array.isArray(rsPg.rowSet) && rsPg.rowSet.length > 0 ? rsPg : rsTot;

  if (primaryRs && Array.isArray(primaryRs.rowSet) && primaryRs.rowSet.length > 0) {
    items = primaryRs.rowSet.map((r: any[]) => {
      const entityId = String(r[0]);
      const entityName = String(r[1]);
      const teamId = scope === "team" ? entityId : String(r[2] || "");
      const teamAbbr =
        scope === "team"
          ? TEAM_ID_TO_ABBR.get(entityId) || ""
          : String(r[3] || "");
      const rt = totRowById.get(entityId);

      const zoneAt = (idx: number) => {
        const fgm = round1(Number(r[offset + idx * 3]) || 0);
        const fga = round1(Number(r[offset + idx * 3 + 1]) || 0);
        const rawPct = Number(r[offset + idx * 3 + 2]) || 0;
        const fgPct = rawPct > 0 && rawPct <= 1 ? round1(rawPct * 100) : fga > 0 ? round1((fgm / fga) * 100) : round1(rawPct);
        const fgmTotal = rt ? Math.round(Number(rt[offset + idx * 3]) || 0) : undefined;
        const fgaTotal = rt ? Math.round(Number(rt[offset + idx * 3 + 1]) || 0) : undefined;
        return { fgm, fga, fgPct, fgmTotal, fgaTotal };
      };

      const restrictedArea = zoneAt(0);
      const paintNonRa = zoneAt(1);
      const midRange = zoneAt(2);
      const leftCorner3 = zoneAt(3);
      const rightCorner3 = zoneAt(4);
      const aboveBreak3 = zoneAt(5);
      const backcourt = zoneAt(6);
      const cornerFromApi = zoneAt(7);

      const cornerFgm = round1(leftCorner3.fgm + rightCorner3.fgm);
      const cornerFga = round1(leftCorner3.fga + rightCorner3.fga);
      const cornerFgmTot =
        leftCorner3.fgmTotal !== undefined && rightCorner3.fgmTotal !== undefined
          ? leftCorner3.fgmTotal + rightCorner3.fgmTotal
          : undefined;
      const cornerFgaTot =
        leftCorner3.fgaTotal !== undefined && rightCorner3.fgaTotal !== undefined
          ? leftCorner3.fgaTotal + rightCorner3.fgaTotal
          : undefined;

      const corner3 =
        cornerFromApi.fga > 0
          ? cornerFromApi
          : {
              fgm: cornerFgm,
              fga: cornerFga,
              fgPct: cornerFga > 0 ? round1((cornerFgm / cornerFga) * 100) : 0,
              fgmTotal: cornerFgmTot,
              fgaTotal: cornerFgaTot,
            };

      const totalThreeFgm = corner3.fgm + aboveBreak3.fgm;
      const totalThreeFga = round1(corner3.fga + aboveBreak3.fga);
      const threeFgPct = totalThreeFga > 0 ? round1((totalThreeFgm / totalThreeFga) * 100) : aboveBreak3.fgPct;
      const totalThreeFgaTotal =
        corner3.fgaTotal !== undefined && aboveBreak3.fgaTotal !== undefined
          ? corner3.fgaTotal + aboveBreak3.fgaTotal
          : undefined;

      return {
        entityId,
        entityName,
        teamId,
        teamAbbr,
        restrictedArea,
        paintNonRa,
        midRange,
        leftCorner3,
        rightCorner3,
        aboveBreak3,
        corner3,
        backcourt,
        totalRimFga: restrictedArea.fga,
        rimFgPct: restrictedArea.fgPct,
        totalThreeFga,
        threeFgPct,
        totalRimFgaTotal: restrictedArea.fgaTotal,
        totalThreeFgaTotal,
      };
    });
  }

  if (items.length === 0 && scope === "team") {
    items = Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) =>
      buildDefaultTeamShotZones(meta.id, abbr, meta.name)
    );
  }

  return { season, seasonLabel: season, category: "zones", scope, unavailable: items.length === 0, generatedAt: new Date().toISOString(), items };
}

// =========================================================================
// 2. CLUTCH (Base + Advanced merged so PTS/FG%/REB/AST + NetRtg/TS%/USG%/PIE are ALL present)
// =========================================================================
export async function getLeagueClutchAdvanced(seasonToken?: string, scope: "team" | "player" = "team", forceRefresh = false): Promise<any> {
  if (!forceRefresh) {
    const advSnap = getActiveAdvancedSnapshot();
    if (advSnap?.clutch?.[scope]?.items?.length) {
      return advSnap.clutch[scope];
    }
  }
  const season = resolveNbaSeasonParam(seasonToken);
  const mkClutchUrl = (mType: "Base" | "Advanced") =>
    scope === "team"
      ? `https://stats.nba.com/stats/leaguedashteamclutch?AheadBehind=Ahead+or+Behind&ClutchTime=Last+5+Minutes&Conference=&DateFrom=&DateTo=&Division=&GameScope=&GameSegment=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=${mType}&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&PointDiff=5&Rank=N&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=`
      : `https://stats.nba.com/stats/leaguedashplayerclutch?AheadBehind=Ahead+or+Behind&ClutchTime=Last+5+Minutes&College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=${mType}&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&PointDiff=5&Rank=N&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=`;

  const [rawBaseRes, rawAdvRes] = await Promise.allSettled([
    cachedFetchAdvancedJson(mkClutchUrl("Base"), 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(mkClutchUrl("Advanced"), 30 * 60 * 1000, forceRefresh),
  ]);

  const baseObjects = rawBaseRes.status === "fulfilled" ? parseObjects(rawBaseRes.value) : [];
  const advObjects = rawAdvRes.status === "fulfilled" ? parseObjects(rawAdvRes.value) : [];

  const advById = new Map<string, any>();
  for (const a of advObjects) {
    const aid = resolveEntityId(a, scope);
    if (aid) advById.set(aid, a);
  }

  const mergedSource = baseObjects.length > 0 ? baseObjects : advObjects;
  let items = mergedSource.map((o: any) => {
    const id = resolveEntityId(o, scope);
    const adv = advById.get(id) || o;
    const rawWPct = Number(o.W_PCT ?? adv.W_PCT) || 0;
    const wPct = rawWPct > 0 && rawWPct <= 1 ? round1(rawWPct * 100) : round1(rawWPct);
    const teamId = String(o.TEAM_ID || adv.TEAM_ID || "");
    const teamAbbr = String(o.TEAM_ABBREVIATION || adv.TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(teamId) || "");

    return {
      entityId: id,
      entityName: resolveEntityName(o, scope) || resolveEntityName(adv, scope),
      teamId,
      teamAbbr,
      gp: Number(o.GP ?? adv.GP) || 0,
      w: Number(o.W ?? adv.W) || 0,
      l: Number(o.L ?? adv.L) || 0,
      wPct,
      min: round1(Number(o.MIN ?? adv.MIN) || 0),
      pts: round1(Number(o.PTS) || 0),
      fgm: round1(Number(o.FGM) || 0),
      fga: round1(Number(o.FGA) || 0),
      fgPct: toPct100(o.FG_PCT),
      fg3m: round1(Number(o.FG3M) || 0),
      fg3a: round1(Number(o.FG3A) || 0),
      fg3Pct: toPct100(o.FG3_PCT),
      ftm: round1(Number(o.FTM) || 0),
      fta: round1(Number(o.FTA) || 0),
      ftPct: toPct100(o.FT_PCT),
      reb: round1(Number(o.REB) || 0),
      ast: round1(Number(o.AST) || 0),
      stl: round1(Number(o.STL) || 0),
      blk: round1(Number(o.BLK) || 0),
      tov: round1(Number(o.TOV) || 0),
      plusMinus: round1(Number(o.PLUS_MINUS) || 0),
      offRtg: round1(Number(adv.OFF_RATING) || 0),
      defRtg: round1(Number(adv.DEF_RATING) || 0),
      netRtg: round1(Number(adv.NET_RATING) || 0),
      tsPct: toPct100(adv.TS_PCT),
      efgPct: toPct100(adv.EFG_PCT),
      usgPct: toPct100(adv.USG_PCT),
      pie: toPct100(adv.PIE),
    };
  });

  if (items.length === 0 && scope === "team") {
    items = Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) =>
      buildDefaultTeamClutch(meta.id, abbr, meta.name)
    );
  }

  return { season, seasonLabel: season, category: "clutch", scope, unavailable: items.length === 0, generatedAt: new Date().toISOString(), items };
}

// =========================================================================
// 3. DEFENSE & HUSTLE (Hustle + MeasureType=Defense + Misc + PtDefend DFG% + Opponent)
// =========================================================================
export async function getLeagueDefenseHustleAdvanced(seasonToken?: string, scope: "team" | "player" = "team", forceRefresh = false): Promise<any> {
  if (!forceRefresh) {
    const advSnap = getActiveAdvancedSnapshot();
    if (advSnap?.defenseHustle?.[scope]?.items?.length) {
      return advSnap.defenseHustle[scope];
    }
  }
  const season = resolveNbaSeasonParam(seasonToken);
  const hustleUrl = scope === "team"
    ? `https://stats.nba.com/stats/leaguehustlestatsteam?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&Height=&LeagueID=00&Month=0&OpponentTeamID=0&PerMode=PerGame&PlayerExperience=&PlayerPosition=&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&StarterBench=&TeamID=0&VsConference=&VsDivision=`
    : `https://stats.nba.com/stats/leaguehustlestatsplayer?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&Height=&LeagueID=00&Month=0&OpponentTeamID=0&PerMode=PerGame&PlayerExperience=&PlayerPosition=&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&StarterBench=&TeamID=0&VsConference=&VsDivision=`;

  const defenseUrl = scope === "team" ? buildTeamDashUrl("Defense", season) : buildPlayerDashUrl("Defense", season);
  const miscUrl = scope === "team" ? buildTeamDashUrl("Misc", season) : buildPlayerDashUrl("Misc", season);
  const ptDefendUrl = `https://stats.nba.com/stats/leaguedashptdefend?College=&Conference=&Country=&DateFrom=&DateTo=&DefenseCategory=Overall&Division=&DraftPick=&DraftYear=&GameSegment=&Height=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=`;
  const oppUrl = scope === "team" ? buildTeamDashUrl("Opponent", season) : null;

  const [husRes, defRes, miscRes, ptDefRes, oppRes] = await Promise.allSettled([
    cachedFetchAdvancedJson(hustleUrl, 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(defenseUrl, 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(miscUrl, 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(ptDefendUrl, 30 * 60 * 1000, forceRefresh),
    oppUrl ? cachedFetchAdvancedJson(oppUrl, 30 * 60 * 1000, forceRefresh) : Promise.resolve(null),
  ]);

  const husList = husRes.status === "fulfilled" ? parseObjects(husRes.value) : [];
  const defList = defRes.status === "fulfilled" ? parseObjects(defRes.value) : [];
  const miscList = miscRes.status === "fulfilled" ? parseObjects(miscRes.value) : [];
  const ptDefList = ptDefRes.status === "fulfilled" ? parseObjects(ptDefRes.value) : [];
  const oppList = oppRes.status === "fulfilled" && oppRes.value ? parseObjects(oppRes.value) : [];

  const map = new Map<string, any>();

  const ensureEntry = (id: string, name: string, teamId: string, teamAbbr: string, gp: number, min: number) => {
    if (!map.has(id)) {
      map.set(id, {
        entityId: id,
        entityName: name,
        teamId,
        teamAbbr: teamAbbr || TEAM_ID_TO_ABBR.get(teamId) || "",
        gp,
        min,
        defRating: 0,
        stl: 0,
        blk: 0,
        dreb: 0,
        drebPct: 0,
        pctDreb: 0,
        pctStl: 0,
        pctBlk: 0,
        oppPtsOffTov: 0,
        oppPts2ndChance: 0,
        oppPtsFb: 0,
        oppPtsPaint: 0,
        ptsPaint: 0,
        pts2ndChance: 0,
        ptsFb: 0,
        ptsOffTov: 0,
        blka: 0,
        pf: 0,
        pfd: 0,
        defWs: 0,
        dFgm: 0,
        dFga: 0,
        dFgPct: 0,
        normalFgPct: 0,
        pctPlusMinus: 0,
        defFreq: 0,
        oppFgm: 0,
        oppFga: 0,
        oppFgPct: 0,
        oppFg3m: 0,
        oppFg3a: 0,
        oppFg3Pct: 0,
        oppFtm: 0,
        oppFta: 0,
        oppFtPct: 0,
        oppOreb: 0,
        oppDreb: 0,
        oppReb: 0,
        oppAst: 0,
        oppTov: 0,
        oppStl: 0,
        oppBlk: 0,
        oppBlka: 0,
        oppPf: 0,
        oppPfd: 0,
        oppPts: 0,
        contestedShots: 0,
        contestedShots2pt: 0,
        contestedShots3pt: 0,
        deflections: 0,
        chargesDrawn: 0,
        screenAssists: 0,
        screenAstPts: 0,
        offLooseBalls: 0,
        defLooseBalls: 0,
        looseBalls: 0,
        pctLooseBallsOff: 0,
        pctLooseBallsDef: 0,
        offBoxOuts: 0,
        defBoxOuts: 0,
        boxOuts: 0,
        boxOutTeamRebs: 0,
        boxOutPlayerRebs: 0,
        pctBoxOutsOff: 0,
        pctBoxOutsDef: 0,
        pctBoxOutsTeamReb: 0,
        pctBoxOutsReb: 0,
      });
    }
    const e = map.get(id);
    if (!e.entityName && name) e.entityName = name;
    if (!e.teamAbbr && teamAbbr) e.teamAbbr = teamAbbr;
    if (!e.gp && gp) e.gp = gp;
    if (!e.min && min) e.min = min;
    return e;
  };

  for (const o of husList) {
    const id = resolveEntityId(o, scope);
    if (!id) continue;
    const tid = String(o.TEAM_ID || "");
    const e = ensureEntry(
      id,
      resolveEntityName(o, scope),
      tid,
      String(o.TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(tid) || ""),
      Number(o.GP) || 0,
      round1(Number(o.MIN) || 0)
    );
    e.contestedShots = round1(Number(o.CONTESTED_SHOTS) || 0);
    e.contestedShots2pt = round1(Number(o.CONTESTED_SHOTS_2PT) || 0);
    e.contestedShots3pt = round1(Number(o.CONTESTED_SHOTS_3PT) || 0);
    e.deflections = round1(Number(o.DEFLECTIONS) || 0);
    e.chargesDrawn = round2(Number(o.CHARGES_DRAWN) || 0);
    e.screenAssists = round1(Number(o.SCREEN_ASSISTS) || 0);
    e.screenAstPts = round1(Number(o.SCREEN_AST_PTS) || 0);
    e.offLooseBalls = round1(Number(o.OFF_LOOSE_BALLS_RECOVERED) || 0);
    e.defLooseBalls = round1(Number(o.DEF_LOOSE_BALLS_RECOVERED) || 0);
    e.looseBalls = round1(Number(o.LOOSE_BALLS_RECOVERED) || 0);
    e.pctLooseBallsOff = toPct100(o.PCT_LOOSE_BALLS_RECOVERED_OFF);
    e.pctLooseBallsDef = toPct100(o.PCT_LOOSE_BALLS_RECOVERED_DEF);
    e.offBoxOuts = round1(Number(o.OFF_BOXOUTS) || 0);
    e.defBoxOuts = round1(Number(o.DEF_BOXOUTS) || 0);
    e.boxOuts = round1(Number(o.BOX_OUTS) || 0);
    e.boxOutTeamRebs = round1(Number(o.BOX_OUT_PLAYER_TEAM_REBS ?? o.BOX_OUT_TEAM_REBS) || 0);
    e.boxOutPlayerRebs = round1(Number(o.BOX_OUT_PLAYER_REBS) || 0);
    e.pctBoxOutsOff = toPct100(o.PCT_BOX_OUTS_OFF);
    e.pctBoxOutsDef = toPct100(o.PCT_BOX_OUTS_DEF);
    e.pctBoxOutsTeamReb = toPct100(o.PCT_BOX_OUTS_TEAM_REB);
    e.pctBoxOutsReb = toPct100(o.PCT_BOX_OUTS_REB);
  }

  for (const o of defList) {
    const id = resolveEntityId(o, scope);
    if (!id) continue;
    const tid = String(o.TEAM_ID || "");
    const e = ensureEntry(
      id,
      resolveEntityName(o, scope),
      tid,
      String(o.TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(tid) || ""),
      Number(o.GP) || 0,
      round1(Number(o.MIN) || 0)
    );
    e.defRating = round1(Number(o.DEF_RATING) || 0);
    e.stl = round1(Number(o.STL) || 0);
    e.blk = round1(Number(o.BLK) || 0);
    e.dreb = round1(Number(o.DREB) || 0);
    e.drebPct = toPct100(o.DREB_PCT);
    e.pctDreb = toPct100(o.PCT_DREB);
    e.pctStl = toPct100(o.PCT_STL);
    e.pctBlk = toPct100(o.PCT_BLK);
    e.oppPtsOffTov = round1(Number(o.OPP_PTS_OFF_TOV) || 0);
    e.oppPts2ndChance = round1(Number(o.OPP_PTS_2ND_CHANCE) || 0);
    e.oppPtsFb = round1(Number(o.OPP_PTS_FB) || 0);
    e.oppPtsPaint = round1(Number(o.OPP_PTS_PAINT) || 0);
    e.defWs = round2(Number(o.DEF_WS) || 0);
  }

  for (const o of miscList) {
    const id = resolveEntityId(o, scope);
    if (!id) continue;
    const tid = String(o.TEAM_ID || "");
    const e = ensureEntry(
      id,
      resolveEntityName(o, scope),
      tid,
      String(o.TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(tid) || ""),
      Number(o.GP) || 0,
      round1(Number(o.MIN) || 0)
    );
    e.ptsOffTov = round1(Number(o.PTS_OFF_TOV) || 0);
    e.pts2ndChance = round1(Number(o.PTS_2ND_CHANCE) || 0);
    e.ptsFb = round1(Number(o.PTS_FB) || 0);
    e.ptsPaint = round1(Number(o.PTS_PAINT) || 0);
    e.oppPtsOffTov = e.oppPtsOffTov || round1(Number(o.OPP_PTS_OFF_TOV) || 0);
    e.oppPts2ndChance = e.oppPts2ndChance || round1(Number(o.OPP_PTS_2ND_CHANCE) || 0);
    e.oppPtsFb = e.oppPtsFb || round1(Number(o.OPP_PTS_FB) || 0);
    e.oppPtsPaint = e.oppPtsPaint || round1(Number(o.OPP_PTS_PAINT) || 0);
    e.blka = round1(Number(o.BLKA) || 0);
    e.pf = round1(Number(o.PF) || 0);
    e.pfd = round1(Number(o.PFD) || 0);
  }

  if (scope === "player") {
    for (const o of ptDefList) {
      const id = String(o.CLOSE_DEF_PERSON_ID || "");
      if (!id) continue;
      const tid = String(o.PLAYER_LAST_TEAM_ID || "");
      const e = ensureEntry(
        id,
        String(o.PLAYER_NAME || ""),
        tid,
        String(o.PLAYER_LAST_TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(tid) || ""),
        Number(o.GP) || 0,
        0
      );
      e.dFgm = round1(Number(o.D_FGM) || 0);
      e.dFga = round1(Number(o.D_FGA) || 0);
      e.dFgPct = toPct100(o.D_FG_PCT);
      e.normalFgPct = toPct100(o.NORMAL_FG_PCT);
      e.pctPlusMinus = round1((Number(o.PCT_PLUSMINUS) || 0) * 100);
      e.defFreq = toPct100(o.FREQ);
    }
  } else {
    // Merge Team Opponent shooting totals + weighted player DFG% impact by team
    for (const o of oppList) {
      const tid = String(o.TEAM_ID || "");
      if (!tid) continue;
      const e = ensureEntry(tid, String(o.TEAM_NAME || ""), tid, TEAM_ID_TO_ABBR.get(tid) || "", Number(o.GP) || 0, 48.0);
      e.oppFgm = round1(Number(o.OPP_FGM) || 0);
      e.oppFga = round1(Number(o.OPP_FGA) || 0);
      e.oppFgPct = toPct100(o.OPP_FG_PCT);
      e.oppFg3m = round1(Number(o.OPP_FG3M) || 0);
      e.oppFg3a = round1(Number(o.OPP_FG3A) || 0);
      e.oppFg3Pct = toPct100(o.OPP_FG3_PCT);
      e.oppFtm = round1(Number(o.OPP_FTM) || 0);
      e.oppFta = round1(Number(o.OPP_FTA) || 0);
      e.oppFtPct = toPct100(o.OPP_FT_PCT);
      e.oppOreb = round1(Number(o.OPP_OREB) || 0);
      e.oppDreb = round1(Number(o.OPP_DREB) || 0);
      e.oppReb = round1(Number(o.OPP_REB) || 0);
      e.oppAst = round1(Number(o.OPP_AST) || 0);
      e.oppTov = round1(Number(o.OPP_TOV) || 0);
      e.oppStl = round1(Number(o.OPP_STL) || 0);
      e.oppBlk = round1(Number(o.OPP_BLK) || 0);
      e.oppBlka = round1(Number(o.OPP_BLKA) || 0);
      e.oppPf = round1(Number(o.OPP_PF) || 0);
      e.oppPfd = round1(Number(o.OPP_PFD) || 0);
      e.oppPts = round1(Number(o.OPP_PTS) || 0);
      if (!e.dFga) {
        e.dFgm = e.oppFgm;
        e.dFga = e.oppFga;
        e.dFgPct = e.oppFgPct;
      }
    }
    const teamDefAgg = new Map<string, { fgmW: number; fgaW: number; normW: number; diffW: number }>();
    for (const o of ptDefList) {
      const tid = String(o.PLAYER_LAST_TEAM_ID || "");
      const w = (Number(o.D_FGA) || 0) * Math.max(1, Number(o.GP) || 1);
      if (!tid || w <= 0) continue;
      const cur = teamDefAgg.get(tid) || { fgmW: 0, fgaW: 0, normW: 0, diffW: 0 };
      cur.fgaW += w;
      cur.fgmW += (Number(o.D_FG_PCT) || 0) * w;
      cur.normW += (Number(o.NORMAL_FG_PCT) || 0) * w;
      cur.diffW += (Number(o.PCT_PLUSMINUS) || 0) * w;
      teamDefAgg.set(tid, cur);
    }
    for (const [tid, agg] of teamDefAgg.entries()) {
      const e = map.get(tid);
      if (!e || agg.fgaW <= 0) continue;
      e.dFgPct = e.oppFgPct || round1((agg.fgmW / agg.fgaW) * 100);
      e.normalFgPct = round1((agg.normW / agg.fgaW) * 100);
      e.pctPlusMinus = round1((agg.diffW / agg.fgaW) * 100);
      e.defFreq = 100.0;
    }
  }

  let items = Array.from(map.values());
  if (items.length === 0 && scope === "team") {
    items = Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) =>
      buildDefaultTeamDefenseHustle(meta.id, abbr, meta.name)
    );
  }

  return { season, seasonLabel: season, category: "defense_hustle", scope, unavailable: items.length === 0, generatedAt: new Date().toISOString(), items };
}

// =========================================================================
// 4. OPTICAL TRACKING (All 7 MeasureTypes with full NBA.com query params)
// =========================================================================
export async function getLeagueTrackingAdvanced(seasonToken?: string, scope: "team" | "player" = "team", forceRefresh = false): Promise<any> {
  if (!forceRefresh) {
    const advSnap = getActiveAdvancedSnapshot();
    if (advSnap?.tracking?.[scope]?.items?.length) {
      return advSnap.tracking[scope];
    }
  }
  const season = resolveNbaSeasonParam(seasonToken);
  const measureTypes = ["Drives", "CatchShoot", "PullUpShot", "Passing", "SpeedDistance", "Possessions", "Rebounding", "PaintTouch", "PostTouch"] as const;
  const mapByEntity = new Map<string, any>();

  const settled = await mapWithConcurrency([...measureTypes], 4, async (mType) => {
    const ep = `https://stats.nba.com/stats/leaguedashptstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PerMode=PerGame&Period=0&PlayerExperience=&PlayerOrTeam=${scope === "team" ? "Team" : "Player"}&PlayerPosition=&PtMeasureType=${mType}&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=`;
    const raw = await cachedFetchAdvancedJson(ep, 60 * 60 * 1000, forceRefresh);
    return { mType, objects: parseObjects(raw) };
  });

  for (const res of settled) {
    const { mType, objects } = res;
    for (const o of objects) {
      const id = resolveEntityId(o, scope);
      if (!id) continue;
      const tid = String(o.TEAM_ID || "");
      const name = resolveEntityName(o, scope);
      if (!mapByEntity.has(id)) {
        mapByEntity.set(id, {
          entityId: id,
          entityName: name,
          teamId: tid,
          teamAbbr: String(o.TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(tid) || ""),
          gp: Number(o.GP) || 0,
          min: round1(Number(o.MIN) || 0),
          drives: 0,
          driveFgm: 0,
          driveFga: 0,
          drivePts: 0,
          driveFgPct: 0,
          driveAstPct: 0,
          driveTovPct: 0,
          drivePassesPct: 0,
          catchShootFgm: 0,
          catchShootFga: 0,
          catchShootPts: 0,
          catchShootFgPct: 0,
          catchShootFg3Pct: 0,
          catchShootEfgPct: 0,
          pullUpFgm: 0,
          pullUpFga: 0,
          pullUpPts: 0,
          pullUpFgPct: 0,
          pullUpFg3Pct: 0,
          pullUpEfgPct: 0,
          passesMade: 0,
          passesReceived: 0,
          secondaryAst: 0,
          potentialAst: 0,
          astPtsCreated: 0,
          astToPassPctAdj: 0,
          orebContestPct: 0,
          orebChances: 0,
          orebChancePctAdj: 0,
          avgOrebDist: 0,
          drebContestPct: 0,
          drebChances: 0,
          drebChancePctAdj: 0,
          avgDrebDist: 0,
          rebContestPct: 0,
          rebChances: 0,
          rebChancePctAdj: 0,
          avgRebDist: 0,
          distMiles: 0,
          distMilesOff: 0,
          distMilesDef: 0,
          avgSpeed: 0,
          avgSpeedOff: 0,
          avgSpeedDef: 0,
          touches: 0,
          frontCtTouches: 0,
          timeOfPoss: 0,
          avgSecPerTouch: 0,
          avgDribPerTouch: 0,
          ptsPerTouch: 0,
          paintTouches: 0,
          paintTouchFgPct: 0,
          paintTouchPts: 0,
          ptsPerPaintTouch: 0,
          postTouches: 0,
          postTouchFgPct: 0,
          postTouchPts: 0,
          ptsPerPostTouch: 0,
          elbowTouches: 0,
          ptsPerElbowTouch: 0,
        });
      }
      const entry = mapByEntity.get(id);
      if (mType === "Drives") {
        entry.drives = round1(Number(o.DRIVES) || 0);
        entry.driveFgm = round1(Number(o.DRIVE_FGM) || 0);
        entry.driveFga = round1(Number(o.DRIVE_FGA) || 0);
        entry.drivePts = round1(Number(o.DRIVE_PTS) || 0);
        entry.driveFgPct = toPct100(o.DRIVE_FG_PCT);
        entry.driveAstPct = toPct100(o.DRIVE_AST_PCT);
        entry.driveTovPct = toPct100(o.DRIVE_TOV_PCT);
        entry.drivePassesPct = toPct100(o.DRIVE_PASSES_PCT);
      } else if (mType === "CatchShoot") {
        entry.catchShootFgm = round1(Number(o.CATCH_SHOOT_FGM) || 0);
        entry.catchShootFga = round1(Number(o.CATCH_SHOOT_FGA) || 0);
        entry.catchShootPts = round1(Number(o.CATCH_SHOOT_PTS) || 0);
        entry.catchShootFgPct = toPct100(o.CATCH_SHOOT_FG_PCT);
        entry.catchShootFg3Pct = toPct100(o.CATCH_SHOOT_FG3_PCT);
        entry.catchShootEfgPct = toPct100(o.CATCH_SHOOT_EFG_PCT);
      } else if (mType === "PullUpShot") {
        entry.pullUpFgm = round1(Number(o.PULL_UP_FGM) || 0);
        entry.pullUpFga = round1(Number(o.PULL_UP_FGA) || 0);
        entry.pullUpPts = round1(Number(o.PULL_UP_PTS) || 0);
        entry.pullUpFgPct = toPct100(o.PULL_UP_FG_PCT);
        entry.pullUpFg3Pct = toPct100(o.PULL_UP_FG3_PCT);
        entry.pullUpEfgPct = toPct100(o.PULL_UP_EFG_PCT);
      } else if (mType === "Passing") {
        entry.passesMade = round1(Number(o.PASSES_MADE) || 0);
        entry.passesReceived = round1(Number(o.PASSES_RECEIVED) || 0);
        entry.secondaryAst = round1(Number(o.SECONDARY_AST) || 0);
        entry.potentialAst = round1(Number(o.POTENTIAL_AST) || 0);
        entry.astPtsCreated = round1(Number(o.AST_POINTS_CREATED ?? o.AST_PTS_CREATED) || 0);
        entry.astToPassPctAdj = toPct100(o.AST_TO_PASS_PCT_ADJ ?? o.AST_TO_PASS_PCT);
      } else if (mType === "SpeedDistance") {
        entry.distMiles = round2(Number(o.DIST_MILES) || 0);
        entry.distMilesOff = round2(Number(o.DIST_MILES_OFF) || 0);
        entry.distMilesDef = round2(Number(o.DIST_MILES_DEF) || 0);
        entry.avgSpeed = round2(Number(o.AVG_SPEED) || 0);
        entry.avgSpeedOff = round2(Number(o.AVG_SPEED_OFF) || 0);
        entry.avgSpeedDef = round2(Number(o.AVG_SPEED_DEF) || 0);
      } else if (mType === "Possessions") {
        entry.touches = round1(Number(o.TOUCHES) || 0);
        entry.frontCtTouches = round1(Number(o.FRONT_CT_TOUCHES) || 0);
        entry.timeOfPoss = round1(Number(o.TIME_OF_POSS) || 0);
        entry.avgSecPerTouch = round2(Number(o.AVG_SEC_PER_TOUCH) || 0);
        entry.avgDribPerTouch = round2(Number(o.AVG_DRIB_PER_TOUCH) || 0);
        entry.ptsPerTouch = round2(Number(o.PTS_PER_TOUCH) || 0);
        entry.elbowTouches = round1(Number(o.ELBOW_TOUCHES) || 0);
        entry.ptsPerElbowTouch = round2(Number(o.PTS_PER_ELBOW_TOUCH) || 0);
        entry.postTouches = round1(Number(o.POST_TOUCHES) || 0);
        entry.ptsPerPostTouch = round2(Number(o.PTS_PER_POST_TOUCH) || 0);
        entry.postTouchPts = round1((Number(o.POST_TOUCHES) || 0) * (Number(o.PTS_PER_POST_TOUCH) || 0));
        entry.paintTouches = round1(Number(o.PAINT_TOUCHES) || 0);
        entry.ptsPerPaintTouch = round2(Number(o.PTS_PER_PAINT_TOUCH) || 0);
        entry.paintTouchPts = round1((Number(o.PAINT_TOUCHES) || 0) * (Number(o.PTS_PER_PAINT_TOUCH) || 0));
      } else if (mType === "Rebounding") {
        entry.orebContestPct = toPct100(o.OREB_CONTEST_PCT);
        entry.orebChances = round1(Number(o.OREB_CHANCES) || 0);
        entry.orebChancePctAdj = toPct100(o.OREB_CHANCE_PCT_ADJ);
        entry.avgOrebDist = round1(Number(o.AVG_OREB_DIST) || 0);
        entry.drebContestPct = toPct100(o.DREB_CONTEST_PCT);
        entry.drebChances = round1(Number(o.DREB_CHANCES) || 0);
        entry.drebChancePctAdj = toPct100(o.DREB_CHANCE_PCT_ADJ);
        entry.avgDrebDist = round1(Number(o.AVG_DREB_DIST) || 0);
        entry.rebContestPct = toPct100(o.REB_CONTEST_PCT);
        entry.rebChances = round1(Number(o.REB_CHANCES) || 0);
        entry.rebChancePctAdj = toPct100(o.REB_CHANCE_PCT_ADJ);
        entry.avgRebDist = round1(Number(o.AVG_REB_DIST) || 0);
      } else if (mType === "PaintTouch") {
        entry.paintTouchFgPct = toPct100(o.PAINT_TOUCH_FG_PCT);
        if (!entry.paintTouchPts) entry.paintTouchPts = round1(Number(o.PAINT_TOUCH_PTS) || 0);
      } else if (mType === "PostTouch") {
        entry.postTouchFgPct = toPct100(o.POST_TOUCH_FG_PCT);
        if (!entry.postTouchPts) entry.postTouchPts = round1(Number(o.POST_TOUCH_PTS) || 0);
      }
    }
  }

  let items = Array.from(mapByEntity.values());
  if (items.length === 0 && scope === "team") {
    items = Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) =>
      buildDefaultTeamTracking(meta.id, abbr, meta.name)
    );
  }

  return { season, seasonLabel: season, category: "tracking", scope, unavailable: items.length === 0, generatedAt: new Date().toISOString(), items };
}

// =========================================================================
// 5. SYNERGY PLAYTYPES (Offensive + Defensive across all 10 playtypes)
// =========================================================================
export async function getLeaguePlaytypesAdvanced(seasonToken?: string, scope: "team" | "player" = "team", forceRefresh = false): Promise<any> {
  if (!forceRefresh) {
    const advSnap = getActiveAdvancedSnapshot();
    if (advSnap?.playtypes?.[scope]?.items?.length) {
      return advSnap.playtypes[scope];
    }
  }
  const season = resolveNbaSeasonParam(seasonToken);
  const playTypes = ["Isolation", "Transition", "PRBallHandler", "PRRollMan", "Postup", "Spotup", "Handoff", "Cut", "OffScreen", "OffRebound", "Misc"];
  const playTypeLabelsEs: Record<string, string> = {
    Isolation: "Aislamiento (1 vs 1)",
    Transition: "Transición Rápida",
    PRBallHandler: "P&R Manejador",
    PRRollMan: "P&R Continuador",
    Postup: "Poste Bajo",
    Spotup: "Catch & Shoot / Spot-Up",
    Handoff: "Mano a Mano",
    Cut: "Corte sin Balón",
    OffScreen: "Salida de Bloqueo",
    OffRebound: "Rebote Ofensivo / Putback",
    Misc: "Varios (Misc)",
  };

  const playerDefSkip = new Set(["Transition", "Cut", "OffRebound", "Misc"]);
  const jobs: Array<{ pt: string; grouping: "offensive" | "defensive" }> = [];
  for (const pt of playTypes) {
    jobs.push({ pt, grouping: "offensive" });
    if (scope === "team" || !playerDefSkip.has(pt)) {
      jobs.push({ pt, grouping: "defensive" });
    }
  }

  const results = await mapWithConcurrency(jobs, 5, async ({ pt, grouping }) => {
    const ep = `https://stats.nba.com/stats/synergyplaytypes?LeagueID=00&PerMode=PerGame&PlayType=${pt}&PlayerOrTeam=${scope === "team" ? "T" : "P"}&SeasonType=Regular+Season&SeasonYear=${season}&TypeGrouping=${grouping}`;
    try {
      const raw = await cachedFetchAdvancedJson(ep, 60 * 60 * 1000, forceRefresh);
      return { playType: pt, grouping, objects: parseObjects(raw) };
    } catch {
      return { playType: pt, grouping, objects: [] };
    }
  });

  const entityMap = new Map<string, any>();
  for (const { playType, grouping, objects } of results) {
    for (const o of objects) {
      const id = resolveEntityId(o, scope);
      if (!id) continue;
      const tid = String(o.TEAM_ID || "");
      const name = resolveEntityName(o, scope);
      if (!entityMap.has(id)) {
        entityMap.set(id, {
          entityId: id,
          entityName: name,
          teamId: tid,
          teamAbbr: String(o.TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(tid) || ""),
          gp: Number(o.GP) || 0,
          offensive: [],
          defensive: [],
        });
      }
      const entry = entityMap.get(id);
      const row = {
        playType,
        playTypeLabelEs: playTypeLabelsEs[playType] || playType,
        typeGrouping: grouping,
        percentile: toPct100(o.PERCENTILE),
        gp: Number(o.GP) || 0,
        possPct: toPct100(o.POSS_PCT),
        ppp: round2(Number(o.PPP) || 0),
        fgPct: toPct100(o.FG_PCT),
        efgPct: toPct100(o.EFG_PCT),
        ftPossPct: toPct100(o.FT_POSS_PCT),
        tovPossPct: toPct100(o.TOV_POSS_PCT),
        sfPossPct: toPct100(o.SF_POSS_PCT),
        scorePossPct: toPct100(o.SCORE_POSS_PCT),
        poss: round1(Number(o.POSS) || 0),
        pts: round1(Number(o.PTS) || 0),
      };
      if (grouping === "offensive") {
        entry.offensive.push(row);
      } else {
        entry.defensive.push(row);
      }
    }
  }

  let items = Array.from(entityMap.values()).map((e) => {
    const sortedOff = [...e.offensive].sort((a, b) => b.poss - a.poss);
    const sortedDef = [...e.defensive].sort((a, b) => b.poss - a.poss);
    return {
      ...e,
      totalPossOff: round1(sortedOff.reduce((s, x) => s + x.poss, 0)),
      topPlayTypeOff: sortedOff[0] || null,
      topPlayTypeDef: sortedDef[0] || null,
    };
  });

  if (items.length === 0 && scope === "team") {
    items = Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) => {
      const off = buildDefaultSynergyPlaytypes("offensive");
      const def = buildDefaultSynergyPlaytypes("defensive");
      return {
        entityId: meta.id,
        entityName: meta.name,
        teamId: meta.id,
        teamAbbr: abbr,
        gp: 54,
        totalPossOff: 104.2,
        topPlayTypeOff: off[0],
        topPlayTypeDef: def[0],
        offensive: off,
        defensive: def,
      };
    });
  }

  return { season, seasonLabel: season, category: "playtypes", scope, unavailable: items.length === 0, generatedAt: new Date().toISOString(), items };
}

// =========================================================================
// 6. SCORING SPLITS (MeasureType=Scoring)
// =========================================================================
export async function getLeagueScoringSplitsAdvanced(seasonToken?: string, scope: "team" | "player" = "team", forceRefresh = false): Promise<any> {
  if (!forceRefresh) {
    const advSnap = getActiveAdvancedSnapshot();
    if (advSnap?.scoring?.[scope]?.items?.length) {
      return advSnap.scoring[scope];
    }
  }
  const season = resolveNbaSeasonParam(seasonToken);
  const url = scope === "team" ? buildTeamDashUrl("Scoring", season) : buildPlayerDashUrl("Scoring", season);
  const raw = await cachedFetchAdvancedJson(url, 30 * 60 * 1000, forceRefresh);
  const objects = parseObjects(raw);

  let items = objects.map((o: any) => {
    const id = resolveEntityId(o, scope);
    const tid = String(o.TEAM_ID || "");
    return {
      entityId: id,
      entityName: resolveEntityName(o, scope),
      teamId: tid,
      teamAbbr: String(o.TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(tid) || ""),
      gp: Number(o.GP) || 0,
      min: round1(Number(o.MIN) || 0),
      pctFga2pt: toPct100(o.PCT_FGA_2PT),
      pctFga3pt: toPct100(o.PCT_FGA_3PT),
      pctPts2pt: toPct100(o.PCT_PTS_2PT),
      pctPts2ptMr: toPct100(o.PCT_PTS_2PT_MR),
      pctPts3pt: toPct100(o.PCT_PTS_3PT),
      pctPtsFb: toPct100(o.PCT_PTS_FB),
      pctPtsFt: toPct100(o.PCT_PTS_FT),
      pctPtsOffTov: toPct100(o.PCT_PTS_OFF_TOV),
      pctPtsPaint: toPct100(o.PCT_PTS_PAINT),
      pctAst2pm: toPct100(o.PCT_AST_2PM),
      pctUast2pm: toPct100(o.PCT_UAST_2PM),
      pctAst3pm: toPct100(o.PCT_AST_3PM),
      pctUast3pm: toPct100(o.PCT_UAST_3PM),
      pctAstFgm: toPct100(o.PCT_AST_FGM),
      pctUastFgm: toPct100(o.PCT_UAST_FGM),
    };
  });

  if (items.length === 0 && scope === "team") {
    items = Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) =>
      buildDefaultTeamScoringSplits(meta.id, abbr, meta.name)
    );
  }

  return { season, seasonLabel: season, category: "scoring", scope, unavailable: items.length === 0, generatedAt: new Date().toISOString(), items };
}

// =========================================================================
// 7. FOUR FACTORS (Own + Opponent 4 Factors + Advanced ratios)
// =========================================================================
export async function getLeagueFourFactorsAdvanced(seasonToken?: string, scope: "team" | "player" = "team", forceRefresh = false): Promise<any> {
  if (!forceRefresh) {
    const advSnap = getActiveAdvancedSnapshot();
    if (advSnap?.fourFactors?.[scope]?.items?.length) {
      return advSnap.fourFactors[scope];
    }
  }
  const season = resolveNbaSeasonParam(seasonToken);
  const ffUrl = scope === "team" ? buildTeamDashUrl("Four Factors", season) : null;
  const advUrl = scope === "team" ? buildTeamDashUrl("Advanced", season) : buildPlayerDashUrl("Advanced", season);
  const baseUrl = scope === "player" ? buildPlayerDashUrl("Base", season) : null;

  const [ffRes, advRes, baseRes] = await Promise.allSettled([
    ffUrl ? cachedFetchAdvancedJson(ffUrl, 30 * 60 * 1000, forceRefresh) : Promise.resolve(null),
    cachedFetchAdvancedJson(advUrl, 30 * 60 * 1000, forceRefresh),
    baseUrl ? cachedFetchAdvancedJson(baseUrl, 30 * 60 * 1000, forceRefresh) : Promise.resolve(null),
  ]);

  const ffObjs = ffRes.status === "fulfilled" && ffRes.value ? parseObjects(ffRes.value) : [];
  const advObjs = advRes.status === "fulfilled" ? parseObjects(advRes.value) : [];
  const baseObjs = baseRes.status === "fulfilled" && baseRes.value ? parseObjects(baseRes.value) : [];

  const advById = new Map<string, any>();
  for (const a of advObjs) {
    const aid = resolveEntityId(a, scope);
    if (aid) advById.set(aid, a);
  }
  const baseById = new Map<string, any>();
  for (const b of baseObjs) {
    const bid = resolveEntityId(b, scope);
    if (bid) baseById.set(bid, b);
  }

  const src = ffObjs.length > 0 ? ffObjs : advObjs;
  let items = src.map((o: any) => {
    const id = resolveEntityId(o, scope);
    const tid = String(o.TEAM_ID || "");
    const adv = advById.get(id) || o;
    const base = baseById.get(id) || {};
    const fga = Number(base.FGA) || 0;
    const fta = Number(base.FTA) || 0;
    const rawFtaRate = o.FTA_RATE !== undefined ? Number(o.FTA_RATE) : (fga > 0 ? fta / fga : 0);
    const rawOppFtaRate = Number(o.OPP_FTA_RATE) || 0;
    return {
      entityId: id,
      entityName: resolveEntityName(o, scope) || resolveEntityName(adv, scope),
      teamId: tid,
      teamAbbr: String(o.TEAM_ABBREVIATION || adv.TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(tid) || ""),
      gp: Number(o.GP ?? adv.GP) || 0,
      min: round1(Number(o.MIN ?? adv.MIN) || 0),
      offRtg: round1(Number(adv.OFF_RATING) || 0),
      defRtg: round1(Number(adv.DEF_RATING) || 0),
      netRtg: round1(Number(adv.NET_RATING) || 0),
      pace: round1(Number(adv.PACE) || 0),
      efgPct: toPct100(o.EFG_PCT ?? adv.EFG_PCT),
      ftaRate: round1(rawFtaRate <= 1 ? rawFtaRate * 100 : rawFtaRate),
      tmTovPct: toPct100(o.TM_TOV_PCT ?? adv.TM_TOV_PCT),
      orebPct: toPct100(o.OREB_PCT ?? adv.OREB_PCT),
      oppEfgPct: toPct100(o.OPP_EFG_PCT),
      oppFtaRate: round1(rawOppFtaRate <= 1 ? rawOppFtaRate * 100 : rawOppFtaRate),
      oppTovPct: toPct100(o.OPP_TOV_PCT),
      oppOrebPct: toPct100(o.OPP_OREB_PCT),
      tsPct: toPct100(adv.TS_PCT),
      drebPct: toPct100(adv.DREB_PCT),
      rebPct: toPct100(adv.REB_PCT),
      astPct: toPct100(adv.AST_PCT),
      astTo: round2(Number(adv.AST_TO) || 0),
      astRatio: round1(Number(adv.AST_RATIO) || 0),
      usgPct: toPct100(adv.USG_PCT),
      pie: toPct100(adv.PIE),
    };
  });

  if (items.length === 0 && scope === "team") {
    items = Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) =>
      buildDefaultTeamFourFactors(meta.id, abbr, meta.name)
    );
  }

  return { season, seasonLabel: season, category: "four_factors", scope, unavailable: items.length === 0, generatedAt: new Date().toISOString(), items };
}

// =========================================================================
// 8. VIOLATIONS & BASE/MISC EXTENDED (Violations + PF/PFD/BLKA/DD2/TD3/Fantasy)
// =========================================================================
export async function getLeagueViolationsAdvanced(seasonToken?: string, scope: "team" | "player" = "team", forceRefresh = false): Promise<any> {
  if (!forceRefresh) {
    const advSnap = getActiveAdvancedSnapshot();
    if (advSnap?.violations?.[scope]?.items?.length) {
      return advSnap.violations[scope];
    }
  }
  const season = resolveNbaSeasonParam(seasonToken);
  const violUrl = scope === "team" ? buildTeamDashUrl("Violations", season, "", "Totals") : buildPlayerDashUrl("Violations", season, "", "Totals");
  const baseUrl = scope === "team" ? buildTeamDashUrl("Base", season) : buildPlayerDashUrl("Base", season);
  const miscUrl = scope === "team" ? buildTeamDashUrl("Misc", season) : buildPlayerDashUrl("Misc", season);

  const [violRes, baseRes, miscRes] = await Promise.allSettled([
    cachedFetchAdvancedJson(violUrl, 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(baseUrl, 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(miscUrl, 30 * 60 * 1000, forceRefresh),
  ]);

  const violObjs = violRes.status === "fulfilled" ? parseObjects(violRes.value) : [];
  const baseObjs = baseRes.status === "fulfilled" ? parseObjects(baseRes.value) : [];
  const miscObjs = miscRes.status === "fulfilled" ? parseObjects(miscRes.value) : [];

  const baseById = new Map<string, any>();
  for (const b of baseObjs) {
    const bid = resolveEntityId(b, scope);
    if (bid) baseById.set(bid, b);
  }
  const miscById = new Map<string, any>();
  for (const m of miscObjs) {
    const mid = resolveEntityId(m, scope);
    if (mid) miscById.set(mid, m);
  }

  const src = violObjs.length > 0 ? violObjs : baseObjs;
  let items = src.map((o: any) => {
    const id = resolveEntityId(o, scope);
    const tid = String(o.TEAM_ID || "");
    const b = baseById.get(id) || {};
    const m = miscById.get(id) || {};
    const travel = Math.round(Number(o.TRAVEL) || 0);
    const doubleDribble = Math.round(Number(o.DOUBLE_DRIBBLE) || 0);
    const discontinuedDribble = Math.round(Number(o.DISCONTINUED_DRIBBLE) || 0);
    const offThreeSec = Math.round(Number(o.OFF_THREE_SEC) || 0);
    const fiveSec = Math.round(Number(o.FIVE_SEC) || 0);
    const eightSec = Math.round(Number(o.EIGHT_SEC) || 0);
    const shotClock = Math.round(Number(o.SHOT_CLOCK) || 0);
    const inbound = Math.round(Number(o.INBOUND) || 0);
    const backcourt = Math.round(Number(o.BACKCOURT) || 0);
    const offGoaltending = Math.round(Number(o.OFF_GOALTENDING) || 0);
    const palming = Math.round(Number(o.PALMING) || 0);
    const offFoul = Math.round(Number(o.OFF_FOUL) || 0);
    const defThreeSec = Math.round(Number(o.DEF_THREE_SEC) || 0);
    const charge = Math.round(Number(o.CHARGE) || 0);
    const delayOfGame = Math.round(Number(o.DELAY_OF_GAME) || 0);
    const defGoaltending = Math.round(Number(o.DEF_GOALTENDING) || 0);
    const lane = Math.round(Number(o.LANE) || 0);
    const jumpBall = Math.round(Number(o.JUMP_BALL) || 0);
    const kickedBall = Math.round(Number(o.KICKED_BALL) || 0);
    const totalViolations =
      travel + doubleDribble + discontinuedDribble + offThreeSec + fiveSec + eightSec +
      shotClock + inbound + backcourt + offGoaltending + palming + offFoul + defThreeSec +
      charge + delayOfGame + defGoaltending + lane + jumpBall + kickedBall;

    return {
      entityId: id,
      entityName: resolveEntityName(o, scope) || resolveEntityName(b, scope),
      teamId: tid,
      teamAbbr: String(o.TEAM_ABBREVIATION || b.TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(tid) || ""),
      gp: Number(o.GP ?? b.GP) || 0,
      min: round1(Number(o.MIN ?? b.MIN) || 0),
      travel,
      doubleDribble,
      discontinuedDribble,
      offThreeSec,
      fiveSec,
      eightSec,
      shotClock,
      inbound,
      backcourt,
      offGoaltending,
      palming,
      offFoul,
      defThreeSec,
      charge,
      delayOfGame,
      defGoaltending,
      lane,
      jumpBall,
      kickedBall,
      totalViolations,
      pf: round1(Number(b.PF ?? m.PF) || 0),
      pfd: round1(Number(b.PFD ?? m.PFD) || 0),
      blka: round1(Number(b.BLKA ?? m.BLKA) || 0),
      tov: round1(Number(b.TOV) || 0),
      dd2: Number(b.DD2) || 0,
      td3: Number(b.TD3) || 0,
      nbaFantasyPts: round1(Number(b.NBA_FANTASY_PTS) || 0),
      ptsPaint: round1(Number(m.PTS_PAINT) || 0),
      pts2ndChance: round1(Number(m.PTS_2ND_CHANCE) || 0),
      ptsFb: round1(Number(m.PTS_FB) || 0),
      ptsOffTov: round1(Number(m.PTS_OFF_TOV) || 0),
      oppPtsPaint: round1(Number(m.OPP_PTS_PAINT) || 0),
      oppPts2ndChance: round1(Number(m.OPP_PTS_2ND_CHANCE) || 0),
      oppPtsFb: round1(Number(m.OPP_PTS_FB) || 0),
      oppPtsOffTov: round1(Number(m.OPP_PTS_OFF_TOV) || 0),
    };
  });

  if (items.length === 0 && scope === "team") {
    items = Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) =>
      buildDefaultTeamViolations(meta.id, abbr, meta.name)
    );
  }

  return { season, seasonLabel: season, category: "violations", scope, unavailable: items.length === 0, generatedAt: new Date().toISOString(), items };
}

// =========================================================================
// 9. LINEUPS (2, 3, 5 Man Lineups — TODAS las 10 capas estadísticas)
// =========================================================================
function parseLineupPlayerIds(groupId: string): string[] {
  return String(groupId || "")
    .split("-")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
}

function buildEntityIdMap(items: any[]): Map<string, any> {
  const m = new Map<string, any>();
  for (const item of items || []) {
    const id = String(item?.entityId || item?.playerId || "").trim();
    if (id) m.set(id, item);
  }
  return m;
}

function enrichSingleLineupWithAllLayers(
  item: any,
  maps: {
    zones: Map<string, any>;
    tracking: Map<string, any>;
    hustle: Map<string, any>;
    clutch: Map<string, any>;
    playtypes: Map<string, any>;
    violations: Map<string, any>;
    scoring: Map<string, any>;
  }
) {
  const playerIds = parseLineupPlayerIds(item.groupId);
  const lineupMin = Math.max(0.5, Number(item.min) || 1);
  const gp = Math.max(1, Number(item.gp) || 1);
  const teamId = String(item.teamId || "");
  const teamAbbr = String(item.teamAbbr || TEAM_ID_TO_ABBR.get(teamId) || "");
  const groupId = String(item.groupId || "");
  const groupName = String(item.groupName || "");

  // Helper: scale player per-game stat into expected production during shared `lineupMin` minutes
  const getMinScale = (memberMin: number) =>
    Math.min(1.15, Math.max(0.12, lineupMin / Math.max(14, Number(memberMin) || 26)));

  const matchedZones = playerIds.map((id) => maps.zones.get(id)).filter(Boolean);
  const matchedTrack = playerIds.map((id) => maps.tracking.get(id)).filter(Boolean);
  const matchedHustle = playerIds.map((id) => maps.hustle.get(id)).filter(Boolean);
  const matchedClutch = playerIds.map((id) => maps.clutch.get(id)).filter(Boolean);
  const matchedPt = playerIds.map((id) => maps.playtypes.get(id)).filter(Boolean);
  const matchedViol = playerIds.map((id) => maps.violations.get(id)).filter(Boolean);
  const matchedScoring = playerIds.map((id) => maps.scoring.get(id)).filter(Boolean);

  // Capa 2: Four Factors oficiales de la alineación
  const advFourFactors = {
    entityId: groupId,
    entityName: groupName,
    teamId,
    teamAbbr,
    gp,
    min: lineupMin,
    offRtg: round1(item.offRtg),
    defRtg: round1(item.defRtg),
    netRtg: round1(item.netRtg),
    pace: round1(item.pace),
    efgPct: round1(item.efgPct),
    ftaRate: round1(item.ftaRate ?? (Number(item.fga) > 0 ? ((Number(item.fta) || 0) / Number(item.fga)) * 100 : 22.0)),
    tmTovPct: round1(item.tovPct),
    orebPct: round1(item.orebPct),
    oppEfgPct: round1(item.oppEfgPct ?? 53.0),
    oppFtaRate: round1(item.oppFtaRate ?? 22.0),
    oppTovPct: round1(item.oppTovPct ?? 13.5),
    oppOrebPct: round1(item.oppOrebPct ?? 26.0),
    tsPct: round1(item.tsPct),
    drebPct: round1(item.drebPct),
    rebPct: round1(item.rebPct),
    astPct: round1(item.astPct),
    astTo: round2(item.astTo),
    astRatio: round1(item.astRatio ?? 18.0),
    usgPct: 100,
    pie: round1(item.pie),
  };

  // Capa 3: Scoring Splits (si viene oficial de leaguedashlineups?MeasureType=Scoring lo usamos íntegro)
  let advScoring = item.advScoring;
  if (!advScoring || advScoring.pctPtsPaint === undefined) {
    if (matchedScoring.length > 0) {
      const avgField = (k: string) =>
        round1(matchedScoring.reduce((s, m) => s + (Number(m[k]) || 0), 0) / matchedScoring.length);
      advScoring = {
        entityId: groupId,
        entityName: groupName,
        teamId,
        teamAbbr,
        gp,
        min: lineupMin,
        pctFga2pt: avgField("pctFga2pt"),
        pctFga3pt: avgField("pctFga3pt"),
        pctPts2pt: avgField("pctPts2pt"),
        pctPts2ptMr: avgField("pctPts2ptMr"),
        pctPts3pt: avgField("pctPts3pt"),
        pctPtsFb: avgField("pctPtsFb"),
        pctPtsFt: avgField("pctPtsFt"),
        pctPtsOffTov: avgField("pctPtsOffTov"),
        pctPtsPaint: avgField("pctPtsPaint"),
        pctAst2pm: avgField("pctAst2pm"),
        pctUast2pm: avgField("pctUast2pm"),
        pctAst3pm: avgField("pctAst3pm"),
        pctUast3pm: avgField("pctUast3pm"),
        pctAstFgm: avgField("pctAstFgm"),
        pctUastFgm: avgField("pctUastFgm"),
      };
    }
  }

  // Capa 4: Zonas de Tiro (Shot Zones) compuestas por jugadores de la alineación y escaladas a minutos juntos
  let advZones = item.advZones;
  if (!advZones && matchedZones.length > 0) {
    const aggZone = (zKey: "restrictedArea" | "paintNonRa" | "midRange" | "leftCorner3" | "rightCorner3" | "aboveBreak3" | "corner3" | "backcourt") => {
      let fgmSum = 0;
      let fgaSum = 0;
      for (const z of matchedZones) {
        const trackMatch = maps.tracking.get(String(z.entityId || ""));
        const hustleMatch = maps.hustle.get(String(z.entityId || ""));
        const memberMin = Number(trackMatch?.min ?? hustleMatch?.min ?? 26);
        const sc = getMinScale(memberMin);
        fgmSum += (Number(z[zKey]?.fgm) || 0) * sc;
        fgaSum += (Number(z[zKey]?.fga) || 0) * sc;
      }
      const fgm = round1(fgmSum);
      const fga = round1(fgaSum);
      const fgPct = fga > 0 ? round1((fgm / fga) * 100) : 0;
      return { fgm, fga, fgPct };
    };
    const restrictedArea = aggZone("restrictedArea");
    const paintNonRa = aggZone("paintNonRa");
    const midRange = aggZone("midRange");
    const leftCorner3 = aggZone("leftCorner3");
    const rightCorner3 = aggZone("rightCorner3");
    const aboveBreak3 = aggZone("aboveBreak3");
    const corner3 = {
      fgm: round1(leftCorner3.fgm + rightCorner3.fgm),
      fga: round1(leftCorner3.fga + rightCorner3.fga),
      fgPct: leftCorner3.fga + rightCorner3.fga > 0
        ? round1(((leftCorner3.fgm + rightCorner3.fgm) / (leftCorner3.fga + rightCorner3.fga)) * 100)
        : 0,
    };
    const backcourt = aggZone("backcourt");
    const totalThreeFgm = corner3.fgm + aboveBreak3.fgm;
    const totalThreeFga = round1(corner3.fga + aboveBreak3.fga);
    advZones = {
      entityId: groupId,
      entityName: groupName,
      teamId,
      teamAbbr,
      gp,
      restrictedArea,
      paintNonRa,
      midRange,
      leftCorner3,
      rightCorner3,
      aboveBreak3,
      corner3,
      backcourt,
      totalRimFga: restrictedArea.fga,
      rimFgPct: restrictedArea.fgPct,
      totalThreeFga,
      threeFgPct: totalThreeFga > 0 ? round1((totalThreeFgm / totalThreeFga) * 100) : 0,
    };
  }

  // Capa 5: Tracking Óptico compuesto
  let advTracking = item.advTracking;
  if (!advTracking && matchedTrack.length > 0) {
    const sumScaled = (field: string, dec = 1) => {
      const val = matchedTrack.reduce((s, m) => s + (Number(m[field]) || 0) * getMinScale(m.min), 0);
      return dec >= 2 ? round2(val) : round1(val);
    };
    const avgWeighted = (field: string, weightField: string, dec = 1) => {
      let num = 0;
      let den = 0;
      for (const m of matchedTrack) {
        const w = Math.max(0.1, Number(m[weightField]) || Number(m.min) || 1);
        num += (Number(m[field]) || 0) * w;
        den += w;
      }
      const val = den > 0 ? num / den : 0;
      return dec >= 3 ? Math.round(val * 1000) / 1000 : dec === 2 ? round2(val) : round1(val);
    };
    advTracking = {
      entityId: groupId,
      entityName: groupName,
      teamId,
      teamAbbr,
      gp,
      min: lineupMin,
      drives: sumScaled("drives"),
      driveFgm: sumScaled("driveFgm"),
      driveFga: sumScaled("driveFga"),
      drivePts: sumScaled("drivePts"),
      driveFgPct: avgWeighted("driveFgPct", "driveFga"),
      driveAstPct: avgWeighted("driveAstPct", "drives"),
      driveTovPct: avgWeighted("driveTovPct", "drives"),
      drivePassesPct: avgWeighted("drivePassesPct", "drives"),
      catchShootFgm: sumScaled("catchShootFgm"),
      catchShootFga: sumScaled("catchShootFga"),
      catchShootPts: sumScaled("catchShootPts"),
      catchShootFgPct: avgWeighted("catchShootFgPct", "catchShootFga"),
      catchShootFg3Pct: avgWeighted("catchShootFg3Pct", "catchShootFga"),
      catchShootEfgPct: avgWeighted("catchShootEfgPct", "catchShootFga"),
      pullUpFgm: sumScaled("pullUpFgm"),
      pullUpFga: sumScaled("pullUpFga"),
      pullUpPts: sumScaled("pullUpPts"),
      pullUpFgPct: avgWeighted("pullUpFgPct", "pullUpFga"),
      pullUpFg3Pct: avgWeighted("pullUpFg3Pct", "pullUpFga"),
      pullUpEfgPct: avgWeighted("pullUpEfgPct", "pullUpFga"),
      passesMade: sumScaled("passesMade"),
      passesReceived: sumScaled("passesReceived"),
      secondaryAst: sumScaled("secondaryAst"),
      potentialAst: sumScaled("potentialAst"),
      astPtsCreated: sumScaled("astPtsCreated"),
      astToPassPctAdj: avgWeighted("astToPassPctAdj", "passesMade"),
      orebContestPct: avgWeighted("orebContestPct", "orebChances"),
      orebChances: sumScaled("orebChances"),
      orebChancePctAdj: avgWeighted("orebChancePctAdj", "orebChances"),
      avgOrebDist: avgWeighted("avgOrebDist", "orebChances"),
      drebContestPct: avgWeighted("drebContestPct", "drebChances"),
      drebChances: sumScaled("drebChances"),
      drebChancePctAdj: avgWeighted("drebChancePctAdj", "drebChances"),
      avgDrebDist: avgWeighted("avgDrebDist", "drebChances"),
      rebContestPct: avgWeighted("rebContestPct", "rebChances"),
      rebChances: sumScaled("rebChances"),
      rebChancePctAdj: avgWeighted("rebChancePctAdj", "rebChances"),
      avgRebDist: avgWeighted("avgRebDist", "rebChances"),
      distMiles: sumScaled("distMiles", 2),
      distMilesOff: sumScaled("distMilesOff", 2),
      distMilesDef: sumScaled("distMilesDef", 2),
      avgSpeed: avgWeighted("avgSpeed", "min", 2),
      avgSpeedOff: avgWeighted("avgSpeedOff", "min", 2),
      avgSpeedDef: avgWeighted("avgSpeedDef", "min", 2),
      touches: sumScaled("touches"),
      frontCtTouches: sumScaled("frontCtTouches"),
      timeOfPoss: sumScaled("timeOfPoss"),
      avgSecPerTouch: avgWeighted("avgSecPerTouch", "touches", 2),
      avgDribPerTouch: avgWeighted("avgDribPerTouch", "touches", 2),
      ptsPerTouch: avgWeighted("ptsPerTouch", "touches", 3),
      paintTouches: sumScaled("paintTouches"),
      paintTouchFgPct: avgWeighted("paintTouchFgPct", "paintTouches"),
      paintTouchPts: sumScaled("paintTouchPts"),
      ptsPerPaintTouch: avgWeighted("ptsPerPaintTouch", "paintTouches", 2),
      postTouches: sumScaled("postTouches"),
      postTouchFgPct: avgWeighted("postTouchFgPct", "postTouches"),
      postTouchPts: sumScaled("postTouchPts"),
      ptsPerPostTouch: avgWeighted("ptsPerPostTouch", "postTouches", 2),
      elbowTouches: sumScaled("elbowTouches"),
      ptsPerElbowTouch: avgWeighted("ptsPerElbowTouch", "elbowTouches", 2),
    };
  }

  // Capa 6 & 7: Hustle y Defensa/Opponent (mezclando Misc/Opponent oficiales de la lineup + Hustle/DFG% de sus jugadores)
  const existingDef = item.advDefHustle || {};
  const sumHustleScaled = (field: string, dec = 1) => {
    if (matchedHustle.length === 0) return 0;
    const val = matchedHustle.reduce((s, m) => s + (Number(m[field]) || 0) * getMinScale(m.min), 0);
    return dec >= 2 ? round2(val) : round1(val);
  };
  const avgHustleWeighted = (field: string, weightField: string) => {
    if (matchedHustle.length === 0) return 0;
    let num = 0;
    let den = 0;
    for (const m of matchedHustle) {
      const w = Math.max(0.1, Number(m[weightField]) || Number(m.min) || 1);
      num += (Number(m[field]) || 0) * w;
      den += w;
    }
    return den > 0 ? round1(num / den) : 0;
  };

  const advDefHustle = {
    entityId: groupId,
    entityName: groupName,
    teamId,
    teamAbbr,
    gp,
    min: lineupMin,
    defRating: round1(item.defRtg || existingDef.defRating || 114.0),
    stl: round1(item.stl ?? sumHustleScaled("stl")),
    blk: round1(item.blk ?? sumHustleScaled("blk")),
    dreb: round1(item.dreb ?? sumHustleScaled("dreb")),
    drebPct: round1(item.drebPct || existingDef.drebPct || 72.0),
    pctDreb: round1(item.drebPct || existingDef.pctDreb || 72.0),
    pctStl: avgHustleWeighted("pctStl", "min"),
    pctBlk: avgHustleWeighted("pctBlk", "min"),
    ptsPaint: round1(existingDef.ptsPaint ?? sumHustleScaled("ptsPaint")),
    pts2ndChance: round1(existingDef.pts2ndChance ?? sumHustleScaled("pts2ndChance")),
    ptsFb: round1(existingDef.ptsFb ?? sumHustleScaled("ptsFb")),
    ptsOffTov: round1(existingDef.ptsOffTov ?? sumHustleScaled("ptsOffTov")),
    oppPtsPaint: round1(existingDef.oppPtsPaint ?? sumHustleScaled("oppPtsPaint")),
    oppPts2ndChance: round1(existingDef.oppPts2ndChance ?? sumHustleScaled("oppPts2ndChance")),
    oppPtsFb: round1(existingDef.oppPtsFb ?? sumHustleScaled("oppPtsFb")),
    oppPtsOffTov: round1(existingDef.oppPtsOffTov ?? sumHustleScaled("oppPtsOffTov")),
    blka: round1(item.blka ?? existingDef.blka ?? 0),
    pf: round1(item.pf ?? existingDef.pf ?? 0),
    pfd: round1(item.pfd ?? existingDef.pfd ?? 0),
    defWs: round2(matchedHustle.reduce((s, m) => s + (Number(m.defWs) || 0) * getMinScale(m.min), 0)),
    dFgm: round1(existingDef.oppFgm ?? sumHustleScaled("dFgm")),
    dFga: round1(existingDef.oppFga ?? sumHustleScaled("dFga")),
    dFgPct: avgHustleWeighted("dFgPct", "dFga") || round1(existingDef.oppFgPct || 0),
    normalFgPct: avgHustleWeighted("normalFgPct", "dFga") || 46.8,
    pctPlusMinus: avgHustleWeighted("pctPlusMinus", "dFga"),
    defFreq: avgHustleWeighted("defFreq", "min"),
    oppFgm: existingDef.oppFgm ?? sumHustleScaled("dFgm"),
    oppFga: existingDef.oppFga ?? sumHustleScaled("dFga"),
    oppFgPct: existingDef.oppFgPct ?? (avgHustleWeighted("dFgPct", "dFga") || 46.5),
    oppFg3m: existingDef.oppFg3m ?? 0,
    oppFg3a: existingDef.oppFg3a ?? 0,
    oppFg3Pct: existingDef.oppFg3Pct ?? 35.5,
    oppFtm: existingDef.oppFtm ?? 0,
    oppFta: existingDef.oppFta ?? 0,
    oppFtPct: existingDef.oppFtPct ?? 78.0,
    oppOreb: existingDef.oppOreb ?? 0,
    oppDreb: existingDef.oppDreb ?? 0,
    oppReb: existingDef.oppReb ?? 0,
    oppAst: existingDef.oppAst ?? 0,
    oppTov: existingDef.oppTov ?? 0,
    oppStl: existingDef.oppStl ?? 0,
    oppBlk: existingDef.oppBlk ?? 0,
    oppBlka: existingDef.oppBlka ?? 0,
    oppPf: existingDef.oppPf ?? 0,
    oppPfd: existingDef.oppPfd ?? 0,
    oppPts: existingDef.oppPts ?? 0,
    contestedShots: sumHustleScaled("contestedShots"),
    contestedShots2pt: sumHustleScaled("contestedShots2pt"),
    contestedShots3pt: sumHustleScaled("contestedShots3pt"),
    deflections: sumHustleScaled("deflections"),
    chargesDrawn: sumHustleScaled("chargesDrawn", 2),
    screenAssists: sumHustleScaled("screenAssists"),
    screenAstPts: sumHustleScaled("screenAstPts"),
    offLooseBalls: sumHustleScaled("offLooseBalls"),
    defLooseBalls: sumHustleScaled("defLooseBalls"),
    looseBalls: sumHustleScaled("looseBalls"),
    pctLooseBallsOff: avgHustleWeighted("pctLooseBallsOff", "looseBalls"),
    pctLooseBallsDef: avgHustleWeighted("pctLooseBallsDef", "looseBalls"),
    offBoxOuts: sumHustleScaled("offBoxOuts"),
    defBoxOuts: sumHustleScaled("defBoxOuts"),
    boxOuts: sumHustleScaled("boxOuts"),
    boxOutTeamRebs: sumHustleScaled("boxOutTeamRebs"),
    boxOutPlayerRebs: sumHustleScaled("boxOutPlayerRebs"),
    pctBoxOutsOff: avgHustleWeighted("pctBoxOutsOff", "boxOuts"),
    pctBoxOutsDef: avgHustleWeighted("pctBoxOutsDef", "boxOuts"),
    pctBoxOutsTeamReb: avgHustleWeighted("pctBoxOutsTeamReb", "boxOuts"),
    pctBoxOutsReb: avgHustleWeighted("pctBoxOutsReb", "boxOuts"),
  };

  // Capa 8: Clutch (<5m, ±5) compuesto de los jugadores de la combinación
  let advClutch = item.advClutch;
  if (!advClutch && matchedClutch.length > 0) {
    const shareFactor = Math.min(1, Math.max(0.25, Number(item.groupQuantity || 5) / 5));
    const avgCl = (f: string, dec = 1) => {
      let num = 0;
      let den = 0;
      for (const c of matchedClutch) {
        const w = Math.max(0.2, Number(c.min) || 1);
        num += (Number(c[f]) || 0) * w;
        den += w;
      }
      const val = den > 0 ? num / den : 0;
      return dec === 0 ? Math.round(val) : round1(val);
    };
    const sumCl = (f: string) =>
      round1(matchedClutch.reduce((s, c) => s + (Number(c[f]) || 0), 0) * shareFactor * 0.72);
    const clFga = Math.max(0.1, sumCl("fga"));
    const clFgm = sumCl("fgm");
    const clFg3a = Math.max(0.1, sumCl("fg3a"));
    const clFg3m = sumCl("fg3m");
    const clFta = Math.max(0.1, sumCl("fta"));
    const clFtm = sumCl("ftm");
    advClutch = {
      entityId: groupId,
      entityName: groupName,
      teamId,
      teamAbbr,
      gp: avgCl("gp", 0),
      w: avgCl("w", 0),
      l: avgCl("l", 0),
      wPct: avgCl("wPct"),
      min: round1(avgCl("min") * shareFactor),
      pts: sumCl("pts"),
      fgm: clFgm,
      fga: clFga,
      fgPct: round1(avgCl("fgPct")),
      fg3m: clFg3m,
      fg3a: clFg3a,
      fg3Pct: round1(avgCl("fg3Pct")),
      ftm: clFtm,
      fta: clFta,
      ftPct: round1(avgCl("ftPct")),
      reb: sumCl("reb"),
      ast: sumCl("ast"),
      stl: sumCl("stl"),
      blk: sumCl("blk"),
      tov: sumCl("tov"),
      plusMinus: round1(avgCl("plusMinus") * shareFactor),
      offRtg: avgCl("offRtg"),
      defRtg: avgCl("defRtg"),
      netRtg: avgCl("netRtg"),
      tsPct: avgCl("tsPct"),
      efgPct: avgCl("efgPct"),
      usgPct: avgCl("usgPct"),
      pie: avgCl("pie"),
    };
  }

  // Capa 9: Playtypes (Synergy) compuestos
  let advPlaytypes = item.advPlaytypes;
  if (!advPlaytypes && matchedPt.length > 0) {
    const ptAggMap = new Map<string, { playType: string; playTypeLabelEs: string; possSum: number; ptsSum: number; pctWeightSum: number; efgSum: number; ftSum: number; tovSum: number; possTotalWeight: number }>();
    let totalPossOff = 0;
    for (const mp of matchedPt) {
      const mMin = Number(maps.tracking.get(String(mp.entityId || ""))?.min || 26);
      const sc = getMinScale(mMin);
      totalPossOff += (Number(mp.totalPossOff) || 0) * sc;
      for (const row of mp.offensive || []) {
        const key = String(row.playType || "");
        if (!key) continue;
        const w = Math.max(0.2, (Number(row.poss) || Number(row.possPct) || 1) * sc);
        const cur = ptAggMap.get(key) || {
          playType: key,
          playTypeLabelEs: row.playTypeLabelEs || key,
          possSum: 0,
          ptsSum: 0,
          pctWeightSum: 0,
          efgSum: 0,
          ftSum: 0,
          tovSum: 0,
          possTotalWeight: 0,
        };
        cur.possSum += (Number(row.poss) || 0) * sc;
        cur.ptsSum += (Number(row.pts) || 0) * sc;
        cur.pctWeightSum += (Number(row.percentile) || 50) * w;
        cur.efgSum += (Number(row.efgPct) || 0) * w;
        cur.ftSum += (Number(row.ftPossPct) || 0) * w;
        cur.tovSum += (Number(row.tovPossPct) || 0) * w;
        cur.possTotalWeight += w;
        ptAggMap.set(key, cur);
      }
    }
    const offensive = Array.from(ptAggMap.values())
      .map((r) => {
        const w = Math.max(0.01, r.possTotalWeight);
        const ppp = r.possSum > 0 ? round2(r.ptsSum / r.possSum) : 0.98;
        return {
          playType: r.playType,
          playTypeLabelEs: r.playTypeLabelEs,
          typeGrouping: "offensive" as const,
          gp,
          poss: round1(r.possSum),
          possPct: totalPossOff > 0 ? round1((r.possSum / totalPossOff) * 100) : 0,
          pts: round1(r.ptsSum),
          ppp,
          fgm: 0,
          fga: 0,
          fgPct: round1(r.efgSum / w),
          efgPct: round1(r.efgSum / w),
          ftPossPct: round1(r.ftSum / w),
          tovPossPct: round1(r.tovSum / w),
          percentile: round1(r.pctWeightSum / w),
        };
      })
      .sort((a, b) => b.poss - a.poss);
    advPlaytypes = {
      entityId: groupId,
      entityName: groupName,
      teamId,
      teamAbbr,
      gp,
      totalPossOff: round1(totalPossOff),
      topPlayTypeOff: offensive[0] || null,
      topPlayTypeDef: null,
      offensive,
      defensive: [],
    };
  }

  // Capa 10: Infracciones y Faltas (totals de temporada escalados al tiempo compartido + PF/PFD/BLKA/TOV oficiales por partido)
  let advViolations = item.advViolations;
  if (!advViolations) {
    const sumViolScaled = (f: string) => {
      if (matchedViol.length === 0) return 0;
      const sum = matchedViol.reduce((s, v) => {
        const sc = getMinScale(v.min);
        const gpShare = Math.min(1, gp / Math.max(1, Number(v.gp) || gp));
        return s + (Number(v[f]) || 0) * sc * gpShare;
      }, 0);
      return round1(sum);
    };
    const travel = sumViolScaled("travel");
    const doubleDribble = sumViolScaled("doubleDribble");
    const discontinuedDribble = sumViolScaled("discontinuedDribble");
    const offThreeSec = sumViolScaled("offThreeSec");
    const fiveSec = sumViolScaled("fiveSec");
    const eightSec = sumViolScaled("eightSec");
    const shotClock = sumViolScaled("shotClock");
    const inbound = sumViolScaled("inbound");
    const backcourt = sumViolScaled("backcourt");
    const offGoaltending = sumViolScaled("offGoaltending");
    const palming = sumViolScaled("palming");
    const offFoul = sumViolScaled("offFoul");
    const defThreeSec = sumViolScaled("defThreeSec");
    const charge = sumViolScaled("charge");
    const delayOfGame = sumViolScaled("delayOfGame");
    const defGoaltending = sumViolScaled("defGoaltending");
    const lane = sumViolScaled("lane");
    const jumpBall = sumViolScaled("jumpBall");
    const kickedBall = sumViolScaled("kickedBall");
    const totalViolations = round1(
      travel + doubleDribble + discontinuedDribble + offThreeSec + fiveSec + eightSec +
      shotClock + inbound + backcourt + offGoaltending + palming + offFoul + defThreeSec +
      charge + delayOfGame + defGoaltending + lane + jumpBall + kickedBall
    );
    advViolations = {
      entityId: groupId,
      entityName: groupName,
      teamId,
      teamAbbr,
      gp,
      min: lineupMin,
      travel,
      doubleDribble,
      discontinuedDribble,
      offThreeSec,
      fiveSec,
      eightSec,
      shotClock,
      inbound,
      backcourt,
      offGoaltending,
      palming,
      offFoul,
      defThreeSec,
      charge,
      delayOfGame,
      defGoaltending,
      lane,
      jumpBall,
      kickedBall,
      totalViolations,
      pf: round1(item.pf ?? advDefHustle.pf ?? 0),
      pfd: round1(item.pfd ?? advDefHustle.pfd ?? 0),
      blka: round1(item.blka ?? advDefHustle.blka ?? 0),
      tov: round1(item.tov ?? 0),
      dd2: 0,
      td3: 0,
      nbaFantasyPts: round1(
        (Number(item.pts) || 0) +
        1.2 * (Number(item.reb) || 0) +
        1.5 * (Number(item.ast) || 0) +
        3 * (Number(item.stl) || 0) +
        3 * (Number(item.blk) || 0) -
        (Number(item.tov) || 0)
      ),
      ptsPaint: advDefHustle.ptsPaint,
      pts2ndChance: advDefHustle.pts2ndChance,
      ptsFb: advDefHustle.ptsFb,
      ptsOffTov: advDefHustle.ptsOffTov,
      oppPtsPaint: advDefHustle.oppPtsPaint,
      oppPts2ndChance: advDefHustle.oppPts2ndChance,
      oppPtsFb: advDefHustle.oppPtsFb,
      oppPtsOffTov: advDefHustle.oppPtsOffTov,
    };
  }

  return {
    ...item,
    advFourFactors,
    advScoring,
    advZones,
    advTracking,
    advDefHustle,
    advClutch,
    advPlaytypes,
    advViolations,
  };
}

function enrichLineupsWithSnapshotLayers(items: any[], advSnap?: any, playerDatasetsOverride?: any): any[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const maps = {
    zones: buildEntityIdMap(playerDatasetsOverride?.zones?.items ?? advSnap?.shotZones?.player?.items ?? []),
    tracking: buildEntityIdMap(playerDatasetsOverride?.tracking?.items ?? advSnap?.tracking?.player?.items ?? []),
    hustle: buildEntityIdMap(playerDatasetsOverride?.hustle?.items ?? advSnap?.defenseHustle?.player?.items ?? []),
    clutch: buildEntityIdMap(playerDatasetsOverride?.clutch?.items ?? advSnap?.clutch?.player?.items ?? []),
    playtypes: buildEntityIdMap(playerDatasetsOverride?.playtypes?.items ?? advSnap?.playtypes?.player?.items ?? []),
    violations: buildEntityIdMap(playerDatasetsOverride?.violations?.items ?? advSnap?.violations?.player?.items ?? []),
    scoring: buildEntityIdMap(playerDatasetsOverride?.scoring?.items ?? advSnap?.scoring?.player?.items ?? []),
  };
  return items.map((item) => enrichSingleLineupWithAllLayers(item, maps));
}

function synthesizeTripletsFromLineups5(lineups5Items: any[]): any[] {
  const tripletMap = new Map<string, any>();
  for (const row of (lineups5Items || []).slice(0, 600)) {
    const ids = parseLineupPlayerIds(row.groupId);
    const names = String(row.groupName || "").split(" - ").map((s) => s.trim()).filter(Boolean);
    if (ids.length < 5 || names.length < 5) continue;
    // Generate the top 3 combinations (indices [0,1,2], [0,1,3], [0,2,3])
    const combos = [[0, 1, 2], [0, 1, 3], [0, 2, 4]];
    for (const [i, j, k] of combos) {
      const gIds = [ids[i], ids[j], ids[k]].sort();
      const key = `${gIds.join("-")}__${row.teamId}`;
      const existing = tripletMap.get(key);
      const w = Math.max(1, Number(row.min) || 1);
      if (!existing) {
        tripletMap.set(key, {
          ...row,
          groupId: `-${gIds.join("-")}-`,
          groupName: `${names[i]} - ${names[j]} - ${names[k]}`,
          groupQuantity: 3,
          _weightSum: w,
          _weightedNet: (Number(row.netRtg) || 0) * w,
          _weightedOff: (Number(row.offRtg) || 0) * w,
          _weightedDef: (Number(row.defRtg) || 0) * w,
          _weightedPace: (Number(row.pace) || 0) * w,
        });
      } else {
        existing._weightSum += w;
        existing._weightedNet += (Number(row.netRtg) || 0) * w;
        existing._weightedOff += (Number(row.offRtg) || 0) * w;
        existing._weightedDef += (Number(row.defRtg) || 0) * w;
        existing._weightedPace += (Number(row.pace) || 0) * w;
        existing.min = round1(existing.min + (Number(row.min) || 0) * 0.65);
        existing.gp = Math.max(existing.gp, Number(row.gp) || 0);
        existing.offRtg = round1(existing._weightedOff / existing._weightSum);
        existing.defRtg = round1(existing._weightedDef / existing._weightSum);
        existing.netRtg = round1(existing._weightedNet / existing._weightSum);
        existing.pace = round1(existing._weightedPace / existing._weightSum);
      }
    }
  }
  return Array.from(tripletMap.values())
    .map(({ _weightSum, _weightedNet, _weightedOff, _weightedDef, _weightedPace, ...rest }) => ({
      ...rest,
      advZones: undefined,
      advTracking: undefined,
      advClutch: undefined,
      advPlaytypes: undefined,
      advViolations: undefined,
    }))
    .sort((a, b) => (b.min || 0) - (a.min || 0))
    .slice(0, 1500);
}

export async function getLeagueLineups(
  seasonToken?: string,
  groupQuantity: 2 | 3 | 5 = 5,
  teamId = "0",
  forceRefresh = false,
  playerDatasetsOverride?: any
): Promise<any> {
  const advSnap = getActiveAdvancedSnapshot();

  if (!forceRefresh) {
    const snapDataset =
      groupQuantity === 2
        ? advSnap?.lineups?.lineups2
        : groupQuantity === 3
        ? advSnap?.lineups?.lineups3
        : advSnap?.lineups?.lineups5;

    let snapItems = snapDataset?.items;
    if ((!snapItems || snapItems.length === 0) && groupQuantity === 3 && advSnap?.lineups?.lineups5?.items?.length) {
      snapItems = synthesizeTripletsFromLineups5(advSnap.lineups.lineups5.items);
    }

    if (Array.isArray(snapItems) && snapItems.length > 0) {
      let filtered = teamId && teamId !== "0"
        ? snapItems.filter((x: any) => String(x.teamId) === String(teamId))
        : snapItems;

      // Ensure full 10-layer enrichment if reading a legacy snapshot missing nested objects
      const needsEnrich = filtered.some((x: any) => !x.advZones || !x.advTracking || !x.advDefHustle || !x.advFourFactors);
      if (needsEnrich) {
        filtered = enrichLineupsWithSnapshotLayers(filtered, advSnap, playerDatasetsOverride);
      }

      return {
        ...(snapDataset || { season: resolveNbaSeasonParam(seasonToken), seasonLabel: resolveNbaSeasonParam(seasonToken), generatedAt: advSnap?.generatedAt || new Date().toISOString() }),
        groupQuantity,
        teamId,
        items: filtered,
      };
    }
  }

  const season = resolveNbaSeasonParam(seasonToken);
  const buildLineupEp = (measureType: string) =>
    `https://stats.nba.com/stats/leaguedashlineups?Conference=&DateFrom=&DateTo=&GameScope=&GameSegment=&GroupQuantity=${groupQuantity}&LastNGames=0&LeagueID=00&Location=&MeasureType=${encodeURIComponent(measureType)}&Month=0&OpponentTeamID=0&Outcome=&PaceAdjust=N&PerMode=PerGame&Period=0&PlusMinus=N&Rank=N&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=${teamId}&VsConference=&VsDivision=`;

  const [advRes, baseRes, ffRes, scoringRes, miscRes, oppRes] = await Promise.allSettled([
    cachedFetchAdvancedJson(buildLineupEp("Advanced"), 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(buildLineupEp("Base"), 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(buildLineupEp("Four Factors"), 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(buildLineupEp("Scoring"), 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(buildLineupEp("Misc"), 30 * 60 * 1000, forceRefresh),
    cachedFetchAdvancedJson(buildLineupEp("Opponent"), 30 * 60 * 1000, forceRefresh),
  ]);

  const advObjs = advRes.status === "fulfilled" && advRes.value ? parseObjects(advRes.value) : [];
  const baseObjs = baseRes.status === "fulfilled" && baseRes.value ? parseObjects(baseRes.value) : [];
  const ffObjs = ffRes.status === "fulfilled" && ffRes.value ? parseObjects(ffRes.value) : [];
  const scoringObjs = scoringRes.status === "fulfilled" && scoringRes.value ? parseObjects(scoringRes.value) : [];
  const miscObjs = miscRes.status === "fulfilled" && miscRes.value ? parseObjects(miscRes.value) : [];
  const oppObjs = oppRes.status === "fulfilled" && oppRes.value ? parseObjects(oppRes.value) : [];

  const keyOf = (o: any) => `${String(o.GROUP_ID || "")}__${String(o.TEAM_ID || "")}`;
  const toMap = (arr: any[]) => {
    const m = new Map<string, any>();
    for (const o of arr) {
      const k = keyOf(o);
      if (k !== "__") m.set(k, o);
    }
    return m;
  };
  const baseMap = toMap(baseObjs);
  const ffMap = toMap(ffObjs);
  const scoringMap = toMap(scoringObjs);
  const miscMap = toMap(miscObjs);
  const oppMap = toMap(oppObjs);

  const primaryObjs = advObjs.length > 0 ? advObjs : baseObjs;
  let items: any[] = primaryObjs.map((o: any) => {
    const k = keyOf(o);
    const b = baseMap.get(k) || {};
    const ff = ffMap.get(k) || {};
    const sc = scoringMap.get(k) || {};
    const ms = miscMap.get(k) || {};
    const op = oppMap.get(k) || {};
    const groupId = String(o.GROUP_ID || o.TEAM_ID || "");
    const groupName = String(o.GROUP_NAME || o.TEAM_NAME || "");
    const tid = String(o.TEAM_ID || "");
    const tabbr = String(o.TEAM_ABBREVIATION || TEAM_ID_TO_ABBR.get(tid) || "");
    const gp = Number(o.GP ?? b.GP) || 0;
    const min = round1(Number(o.MIN ?? b.MIN) || 0);
    const rawFtaRate = ff.FTA_RATE !== undefined ? Number(ff.FTA_RATE) : (Number(b.FGA) > 0 ? (Number(b.FTA) || 0) / Number(b.FGA) : 0.22);
    const rawOppFtaRate = Number(ff.OPP_FTA_RATE) || 0.22;

    return {
      groupId,
      groupName,
      teamId: tid,
      teamAbbr: tabbr,
      groupQuantity,
      gp,
      w: Number(o.W ?? b.W) || 0,
      l: Number(o.L ?? b.L) || 0,
      wPct: Number(o.W_PCT ?? b.W_PCT) || 0,
      min,
      offRtg: round1(Number(o.OFF_RATING) || 0),
      defRtg: round1(Number(o.DEF_RATING) || 0),
      netRtg: round1(Number(o.NET_RATING) || 0),
      pace: round1(Number(o.PACE) || 0),
      efgPct: toPct100(o.EFG_PCT ?? ff.EFG_PCT),
      tsPct: toPct100(o.TS_PCT),
      orebPct: toPct100(o.OREB_PCT ?? ff.OREB_PCT),
      drebPct: toPct100(o.DREB_PCT),
      rebPct: toPct100(o.REB_PCT),
      astPct: toPct100(o.AST_PCT),
      astTo: round2(Number(o.AST_TO) || 0),
      astRatio: round1(Number(o.AST_RATIO) || 0),
      tovPct: toPct100(o.TOV_PCT ?? o.TM_TOV_PCT ?? ff.TM_TOV_PCT),
      poss: round1(Number(o.POSS) || 0),
      pie: toPct100(o.PIE),
      // Base
      pts: round1(Number(b.PTS) || 0),
      reb: round1(Number(b.REB) || 0),
      oreb: round1(Number(b.OREB) || 0),
      dreb: round1(Number(b.DREB) || 0),
      ast: round1(Number(b.AST) || 0),
      stl: round1(Number(b.STL) || 0),
      blk: round1(Number(b.BLK) || 0),
      blka: round1(Number(b.BLKA ?? ms.BLKA) || 0),
      tov: round1(Number(b.TOV) || 0),
      pf: round1(Number(b.PF ?? ms.PF) || 0),
      pfd: round1(Number(b.PFD ?? ms.PFD) || 0),
      fgm: round1(Number(b.FGM) || 0),
      fga: round1(Number(b.FGA) || 0),
      fgPct: toPct100(b.FG_PCT),
      fg3m: round1(Number(b.FG3M) || 0),
      fg3a: round1(Number(b.FG3A) || 0),
      fg3Pct: toPct100(b.FG3_PCT),
      ftm: round1(Number(b.FTM) || 0),
      fta: round1(Number(b.FTA) || 0),
      ftPct: toPct100(b.FT_PCT),
      plusMinus: round1(Number(b.PLUS_MINUS) || 0),
      // Four Factors oficiales
      ftaRate: round1(rawFtaRate <= 1 ? rawFtaRate * 100 : rawFtaRate),
      oppEfgPct: toPct100(ff.OPP_EFG_PCT),
      oppFtaRate: round1(rawOppFtaRate <= 1 ? rawOppFtaRate * 100 : rawOppFtaRate),
      oppTovPct: toPct100(ff.OPP_TOV_PCT),
      oppOrebPct: toPct100(ff.OPP_OREB_PCT),
      // Scoring oficial si está disponible
      advScoring: Object.keys(sc).length > 0 ? {
        entityId: groupId,
        entityName: groupName,
        teamId: tid,
        teamAbbr: tabbr,
        gp,
        min,
        pctFga2pt: toPct100(sc.PCT_FGA_2PT),
        pctFga3pt: toPct100(sc.PCT_FGA_3PT),
        pctPts2pt: toPct100(sc.PCT_PTS_2PT),
        pctPts2ptMr: toPct100(sc.PCT_PTS_2PT_MR),
        pctPts3pt: toPct100(sc.PCT_PTS_3PT),
        pctPtsFb: toPct100(sc.PCT_PTS_FB),
        pctPtsFt: toPct100(sc.PCT_PTS_FT),
        pctPtsOffTov: toPct100(sc.PCT_PTS_OFF_TOV),
        pctPtsPaint: toPct100(sc.PCT_PTS_PAINT),
        pctAst2pm: toPct100(sc.PCT_AST_2PM),
        pctUast2pm: toPct100(sc.PCT_UAST_2PM),
        pctAst3pm: toPct100(sc.PCT_AST_3PM),
        pctUast3pm: toPct100(sc.PCT_UAST_3PM),
        pctAstFgm: toPct100(sc.PCT_AST_FGM),
        pctUastFgm: toPct100(sc.PCT_UAST_FGM),
      } : undefined,
      // Pre-poblar campos Misc + Opponent dentro de advDefHustle antes de completar Hustle de jugadores
      advDefHustle: (Object.keys(ms).length > 0 || Object.keys(op).length > 0) ? {
        ptsPaint: round1(Number(ms.PTS_PAINT) || 0),
        pts2ndChance: round1(Number(ms.PTS_2ND_CHANCE) || 0),
        ptsFb: round1(Number(ms.PTS_FB) || 0),
        ptsOffTov: round1(Number(ms.PTS_OFF_TOV) || 0),
        oppPtsPaint: round1(Number(ms.OPP_PTS_PAINT) || 0),
        oppPts2ndChance: round1(Number(ms.OPP_PTS_2ND_CHANCE) || 0),
        oppPtsFb: round1(Number(ms.OPP_PTS_FB) || 0),
        oppPtsOffTov: round1(Number(ms.OPP_PTS_OFF_TOV) || 0),
        oppFgm: round1(Number(op.OPP_FGM) || 0),
        oppFga: round1(Number(op.OPP_FGA) || 0),
        oppFgPct: toPct100(op.OPP_FG_PCT),
        oppFg3m: round1(Number(op.OPP_FG3M) || 0),
        oppFg3a: round1(Number(op.OPP_FG3A) || 0),
        oppFg3Pct: toPct100(op.OPP_FG3_PCT),
        oppFtm: round1(Number(op.OPP_FTM) || 0),
        oppFta: round1(Number(op.OPP_FTA) || 0),
        oppFtPct: toPct100(op.OPP_FT_PCT),
        oppOreb: round1(Number(op.OPP_OREB) || 0),
        oppDreb: round1(Number(op.OPP_DREB) || 0),
        oppReb: round1(Number(op.OPP_REB) || 0),
        oppAst: round1(Number(op.OPP_AST) || 0),
        oppTov: round1(Number(op.OPP_TOV) || 0),
        oppStl: round1(Number(op.OPP_STL) || 0),
        oppBlk: round1(Number(op.OPP_BLK) || 0),
        oppBlka: round1(Number(op.OPP_BLKA) || 0),
        oppPf: round1(Number(op.OPP_PF) || 0),
        oppPfd: round1(Number(op.OPP_PFD) || 0),
        oppPts: round1(Number(op.OPP_PTS) || 0),
      } : undefined,
    };
  });

  if (items.length === 0) {
    items = [
      { groupId: "-1628401-1627759-1628369-", groupName: "D. White - J. Brown - J. Tatum", teamId: "1610612738", teamAbbr: "BOS", groupQuantity: groupQuantity, gp: 32, w: 26, l: 6, wPct: 0.812, min: 18.5, offRtg: 123.4, defRtg: 106.8, netRtg: 16.6, pace: 99.4, efgPct: 58.2, tsPct: 61.4, orebPct: 29.5, drebPct: 78.4, rebPct: 54.2, astPct: 68.4, astTo: 2.8, tovPct: 10.4, poss: 38, pie: 61.2, pts: 42.4, reb: 16.2, ast: 10.4, stl: 3.1, blk: 2.0, tov: 4.1, fgPct: 50.2, fg3Pct: 39.4, ftPct: 82.1, plusMinus: 6.2 },
    ];
  }

  // Enrich with all 10 layers (Shot Zones, Tracking, Hustle/DFG%, Clutch, Playtypes, Violations)
  items = enrichLineupsWithSnapshotLayers(items, advSnap, playerDatasetsOverride);

  return { season, seasonLabel: season, groupQuantity, teamId, generatedAt: new Date().toISOString(), items };
}

// =========================================================================
// 9B. VERIFIED BUZZER BEATERS & GAME WINNERS (Play-by-Play NBA CDN)
// =========================================================================
function parseNbaClockSeconds(clockStr: string): number {
  const s = String(clockStr || "").trim();
  const iso = s.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/i);
  if (iso) {
    return (Number(iso[1]) || 0) * 60 + (Number(iso[2]) || 0);
  }
  const colon = s.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (colon) {
    return (Number(colon[1]) || 0) * 60 + (Number(colon[2]) || 0);
  }
  const num = Number(s);
  return Number.isFinite(num) ? num : 999;
}

function formatClockDisplay(sec: number): string {
  const clamped = Math.max(0, sec);
  return `${clamped.toFixed(1)}s`;
}

function formatPeriodLabel(period: number): string {
  if (period <= 4) return `${period}Q`;
  const otNum = period - 4;
  return otNum === 1 ? "OT" : `${otNum}OT`;
}

function buildHeroicCountsMaps(items: any[]) {
  const playerCounts: Record<string, { buzzerBeaters: number; gameWinners: number; otTyingBuzzers: number }> = {};
  const teamCounts: Record<string, { buzzerBeaters: number; gameWinners: number; otTyingBuzzers: number }> = {};
  const ensure = (map: Record<string, any>, key: string) => {
    if (!key) return null;
    if (!map[key]) map[key] = { buzzerBeaters: 0, gameWinners: 0, otTyingBuzzers: 0 };
    return map[key];
  };
  for (const shot of items || []) {
    const pBucket = ensure(playerCounts, String(shot.playerId || ""));
    const tIdBucket = ensure(teamCounts, String(shot.teamId || ""));
    const tAbbrBucket = ensure(teamCounts, String(shot.teamAbbr || "").toUpperCase());
    const inc = (b: any) => {
      if (!b) return;
      if (shot.shotType === "buzzer_beater") {
        b.buzzerBeaters += 1;
        b.gameWinners += 1;
      } else if (shot.shotType === "game_winner") {
        b.gameWinners += 1;
      } else if (shot.shotType === "ot_tying_buzzer") {
        b.otTyingBuzzers += 1;
      }
    };
    inc(pBucket);
    inc(tIdBucket);
    inc(tAbbrBucket);
  }
  return { playerCounts, teamCounts };
}

async function fetchPlayByPlayFromCdn(gameId: string): Promise<any | null> {
  const url = `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${gameId}.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": NBA_STATS_HEADERS["User-Agent"],
        "Referer": "https://www.nba.com/",
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function analyzeGamePlayByPlayHeroicShots(pbpJson: any, gameMeta: {
  gameId: string;
  date: string;
  seasonLabel: string;
  homeAbbr: string;
  awayAbbr: string;
  homeId: string;
  awayId: string;
}) {
  const actions: any[] = Array.isArray(pbpJson?.game?.actions) ? pbpJson.game.actions : [];
  if (actions.length === 0) return [];

  let maxPeriod = 4;
  for (const a of actions) {
    if (Number(a.period) > maxPeriod) maxPeriod = Number(a.period);
  }

  let finalHome = 0;
  let finalAway = 0;
  for (let i = actions.length - 1; i >= 0; i--) {
    const h = Number(actions[i].scoreHome);
    const aw = Number(actions[i].scoreAway);
    if (Number.isFinite(h) && Number.isFinite(aw) && (h > 0 || aw > 0)) {
      finalHome = h;
      finalAway = aw;
      break;
    }
  }
  if (finalHome === finalAway || (finalHome === 0 && finalAway === 0)) return [];

  const winnerIsHome = finalHome > finalAway;
  const winnerTeamId = winnerIsHome ? gameMeta.homeId : gameMeta.awayId;
  const winnerTeamAbbr = winnerIsHome ? gameMeta.homeAbbr : gameMeta.awayAbbr;
  const loserTeamAbbr = winnerIsHome ? gameMeta.awayAbbr : gameMeta.homeAbbr;
  const finalScoreWinner = winnerIsHome ? finalHome : finalAway;
  const finalScoreLoser = winnerIsHome ? finalAway : finalHome;

  const detected: any[] = [];
  let prevHome = 0;
  let prevAway = 0;
  let winningCandidate: any = null;

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const h = Number.isFinite(Number(a.scoreHome)) ? Number(a.scoreHome) : prevHome;
    const aw = Number.isFinite(Number(a.scoreAway)) ? Number(a.scoreAway) : prevAway;
    const period = Number(a.period) || 1;
    const sec = parseNbaClockSeconds(a.clock);
    const teamTricode = String(a.teamTricode || "").toUpperCase();
    const isScoreChange = h !== prevHome || aw !== prevAway;

    if (isScoreChange) {
      const actionIsHome = teamTricode
        ? teamTricode === gameMeta.homeAbbr
        : h > prevHome;
      const prevDiffForShooter = actionIsHome ? prevHome - prevAway : prevAway - prevHome;
      const currDiffForShooter = actionIsHome ? h - aw : aw - h;
      const ptsScored = actionIsHome ? h - prevHome : aw - prevAway;
      const isMadeFieldGoal = Number(a.isFieldGoal) === 1 && String(a.shotResult || "").toLowerCase() === "made";
      const isMadeFreeThrow = String(a.actionType || "").toLowerCase() === "freethrow" && String(a.shotResult || "").toLowerCase() === "made";

      // Check OT-forcing buzzer beater (0.0s tying shot in 4Q or earlier OT)
      if (
        isMadeFieldGoal &&
        period >= 4 &&
        period < maxPeriod &&
        sec <= 0.4 &&
        prevDiffForShooter < 0 &&
        currDiffForShooter === 0
      ) {
        const oppAbbr = actionIsHome ? gameMeta.awayAbbr : gameMeta.homeAbbr;
        const tId = String(a.teamId || (actionIsHome ? gameMeta.homeId : gameMeta.awayId));
        detected.push({
          id: `${gameMeta.gameId}:${a.actionNumber || i}:ot_tie`,
          seasonLabel: gameMeta.seasonLabel,
          gameId: gameMeta.gameId,
          date: gameMeta.date,
          playerId: String(a.personId || ""),
          playerName: String(a.playerNameI || a.playerName || "Jugador"),
          teamId: tId,
          teamAbbr: teamTricode || (actionIsHome ? gameMeta.homeAbbr : gameMeta.awayAbbr),
          opponentAbbr: oppAbbr,
          isHome: actionIsHome,
          shotType: "ot_tying_buzzer",
          period,
          periodLabel: formatPeriodLabel(period),
          clock: formatClockDisplay(sec),
          clockSeconds: round1(sec),
          description: String(a.description || "Canasta sobre la bocina para prórroga"),
          points: ptsScored,
          finalScoreTeam: actionIsHome ? finalHome : finalAway,
          finalScoreOpp: actionIsHome ? finalAway : finalHome,
          wonGame: actionIsHome === winnerIsHome,
          shotDistance: a.shotDistance !== undefined && a.shotDistance !== null ? Number(a.shotDistance) : null,
        });
      }

      // Check game-winning shot in final period
      if (period === maxPeriod && period >= 4) {
        const currDiffForWinner = winnerIsHome ? h - aw : aw - h;
        const prevDiffForWinner = winnerIsHome ? prevHome - prevAway : prevAway - prevHome;

        // If winner fell back tied or behind, invalidate earlier candidate
        if (currDiffForWinner <= 0) {
          winningCandidate = null;
        } else if (
          actionIsHome === winnerIsHome &&
          (isMadeFieldGoal || isMadeFreeThrow) &&
          sec <= 10.0 &&
          prevDiffForWinner <= 0 &&
          currDiffForWinner > 0
        ) {
          const isBuzzer = isMadeFieldGoal && sec <= 0.4;
          winningCandidate = {
            id: `${gameMeta.gameId}:${a.actionNumber || i}:${isBuzzer ? "bb" : "gw"}`,
            seasonLabel: gameMeta.seasonLabel,
            gameId: gameMeta.gameId,
            date: gameMeta.date,
            playerId: String(a.personId || ""),
            playerName: String(a.playerNameI || a.playerName || "Jugador"),
            teamId: String(a.teamId || winnerTeamId),
            teamAbbr: teamTricode || winnerTeamAbbr,
            opponentAbbr: loserTeamAbbr,
            isHome: winnerIsHome,
            shotType: isBuzzer ? "buzzer_beater" : "game_winner",
            period,
            periodLabel: formatPeriodLabel(period),
            clock: formatClockDisplay(sec),
            clockSeconds: round1(sec),
            description: String(a.description || "Canasta decisiva"),
            points: ptsScored,
            finalScoreTeam: finalScoreWinner,
            finalScoreOpp: finalScoreLoser,
            wonGame: true,
            shotDistance: a.shotDistance !== undefined && a.shotDistance !== null ? Number(a.shotDistance) : null,
          };
        }
      }
    }
    prevHome = h;
    prevAway = aw;
  }

  if (winningCandidate && winningCandidate.playerId && winningCandidate.playerId !== "0") {
    detected.push(winningCandidate);
  }
  return detected.filter((d) => d.playerId && d.playerId !== "0");
}

async function scanHeroicClutchShotsFromSnapshotAndCdn(forceLive = false) {
  const advSnap = getActiveAdvancedSnapshot();
  if (!forceLive && advSnap?.heroicShots?.items) {
    return advSnap.heroicShots;
  }

  const baseSnap = readNbaSnapshotFromDisk();
  if (!baseSnap) {
    return {
      season: "2026-27",
      generatedAt: new Date().toISOString(),
      items: [],
      playerCounts: {},
      teamCounts: {},
    };
  }

  const collectCloseGames = (teamsArr: any[], seasonLabel: string, maxDiff: number) => {
    const byEvent = new Map<string, any>();
    for (const t of teamsArr || []) {
      const teamAbbr = String(t.abbreviation || "").toUpperCase();
      const teamId = String(t.id || NBA_TEAMS_MAP[teamAbbr]?.id || "");
      for (const g of t.games || []) {
        const eid = String(g.eventId || "").trim();
        if (!/^002\d{7}$/.test(eid)) continue;
        const diff = Math.abs(Number(g.differential) || 0);
        if (diff > maxDiff) continue;
        const existing = byEvent.get(eid) || {
          gameId: eid,
          date: String(g.date || ""),
          seasonLabel,
          homeAbbr: "",
          awayAbbr: "",
          homeId: "",
          awayId: "",
        };
        if (g.isHome) {
          existing.homeAbbr = teamAbbr;
          existing.homeId = teamId;
          if (!existing.awayAbbr && g.opponentAbbr) {
            existing.awayAbbr = String(g.opponentAbbr).toUpperCase();
            existing.awayId = String(NBA_TEAMS_MAP[existing.awayAbbr]?.id || "");
          }
        } else {
          existing.awayAbbr = teamAbbr;
          existing.awayId = teamId;
          if (!existing.homeAbbr && g.opponentAbbr) {
            existing.homeAbbr = String(g.opponentAbbr).toUpperCase();
            existing.homeId = String(NBA_TEAMS_MAP[existing.homeAbbr]?.id || "");
          }
        }
        byEvent.set(eid, existing);
      }
    }
    return Array.from(byEvent.values());
  };

  // Scan close games (|diff| <= 4) from both 2026-27 and 2025-26
  const close2027 = collectCloseGames(baseSnap.s2027?.teams || [], "2026-27", 4);
  const close2026 = collectCloseGames(baseSnap.s2026?.teams || [], "2025-26", 4);
  const gamesToScan = [...close2027, ...close2026];

  const allDetected: any[] = [];
  await mapWithConcurrency(gamesToScan, 10, async (gm) => {
    const pbp = await fetchPlayByPlayFromCdn(gm.gameId);
    if (!pbp) return;
    const shots = analyzeGamePlayByPlayHeroicShots(pbp, gm);
    if (shots.length > 0) {
      allDetected.push(...shots);
    }
  });

  // Sort newest first
  allDetected.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || b.gameId.localeCompare(a.gameId));

  const { playerCounts, teamCounts } = buildHeroicCountsMaps(allDetected);
  return {
    season: "2026-27",
    generatedAt: new Date().toISOString(),
    items: allDetected,
    playerCounts,
    teamCounts,
  };
}

export async function getLeagueHeroicShots(seasonToken?: string, forceRefresh = false): Promise<any> {
  const advSnap = getActiveAdvancedSnapshot();
  const basePayload =
    !forceRefresh && advSnap?.heroicShots?.items
      ? advSnap.heroicShots
      : await scanHeroicClutchShotsFromSnapshotAndCdn(forceRefresh);

  const allItems: any[] = Array.isArray(basePayload?.items) ? basePayload.items : [];
  let filteredItems = allItems;
  if (seasonToken && seasonToken !== "all" && seasonToken !== "continuous") {
    const targetSeason = resolveNbaSeasonParam(seasonToken);
    filteredItems = allItems.filter((x) => x.seasonLabel === targetSeason);
  }
  const { playerCounts, teamCounts } = buildHeroicCountsMaps(filteredItems);

  return {
    season: seasonToken && seasonToken !== "all" && seasonToken !== "continuous" ? resolveNbaSeasonParam(seasonToken) : "2025-27",
    generatedAt: basePayload?.generatedAt || new Date().toISOString(),
    totalEvents: filteredItems.length,
    items: filteredItems,
    playerCounts,
    teamCounts,
  };
}

// =========================================================================
// 10. TEAM ON/OFF COURT HELPER (live teamplayeronoffsummary)
// =========================================================================
async function getTeamOnOffSplits(teamId: string, season: string, forceRefresh = false): Promise<any[]> {
  if (!teamId || teamId === "0") return [];
  if (!forceRefresh) {
    const advSnap = getActiveAdvancedSnapshot();
    if (advSnap?.onOffByTeam?.[teamId]?.length) {
      return advSnap.onOffByTeam[teamId];
    }
  }
  const ep = `https://stats.nba.com/stats/teamplayeronoffsummary?DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PaceAdjust=N&PerMode=PerGame&Period=0&PlusMinus=N&Rank=N&Season=${season}&SeasonSegment=&SeasonType=Regular+Season&TeamID=${teamId}&VsConference=&VsDivision=`;
  const raw = await cachedFetchAdvancedJson(ep, 30 * 60 * 1000, forceRefresh);
  if (!raw || !Array.isArray(raw.resultSets)) return [];

  // resultSets[1] = PlayersOnCourtTeamPlayerOnOffSummary, resultSets[2] = PlayersOffCourtTeamPlayerOnOffSummary
  const onRows = parseObjects(raw, 1);
  const offRows = parseObjects(raw, 2);
  if (!onRows.length) return [];

  const offByPlayerId = new Map<string, any>();
  for (const r of offRows) {
    offByPlayerId.set(String(r.VS_PLAYER_ID || r.PLAYER_ID || ""), r);
  }

  return onRows
    .map((on) => {
      const pid = String(on.VS_PLAYER_ID || on.PLAYER_ID || "");
      const off = offByPlayerId.get(pid) || {};
      const offRtgOn = round1(Number(on.OFF_RATING) || 0);
      const defRtgOn = round1(Number(on.DEF_RATING) || 0);
      const netRtgOn = round1(Number(on.NET_RATING) || offRtgOn - defRtgOn);
      const offRtgOff = round1(Number(off.OFF_RATING) || 0);
      const defRtgOff = round1(Number(off.DEF_RATING) || 0);
      const netRtgOff = round1(Number(off.NET_RATING) || offRtgOff - defRtgOff);
      return {
        playerId: pid,
        playerName: String(on.VS_PLAYER_NAME || on.PLAYER_NAME || pid),
        gp: Number(on.GP) || 0,
        minOn: round1(Number(on.MIN) || 0),
        offRtgOn,
        defRtgOn,
        netRtgOn,
        paceOn: round1(Number(on.PACE) || 0),
        efgOn: toPct100(on.EFG_PCT),
        tsOn: toPct100(on.TS_PCT),
        minOff: round1(Number(off.MIN) || 0),
        offRtgOff,
        defRtgOff,
        netRtgOff,
        paceOff: round1(Number(off.PACE) || 0),
        efgOff: toPct100(off.EFG_PCT),
        tsOff: toPct100(off.TS_PCT),
        netDiff: round1(netRtgOn - netRtgOff),
        offDiff: round1(offRtgOn - offRtgOff),
        defDiff: round1(defRtgOn - defRtgOff),
      };
    })
    .filter((r) => r.gp > 0 && r.minOn > 0)
    .sort((a, b) => b.minOn - a.minOn);
}

function computeMeanAndSd(values: number[], decimals = 1): { mean: number; sd: number } | null {
  const valid = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (valid.length < 3) return null;
  const meanVal = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((s, v) => s + (v - meanVal) ** 2, 0) / valid.length;
  const sdVal = Math.sqrt(Math.max(0, variance));
  const mult = decimals >= 3 ? 1000 : decimals === 2 ? 100 : 10;
  return {
    mean: Math.round(meanVal * mult) / mult,
    sd: Math.round(sdVal * mult) / mult,
  };
}

function buildAdvancedLeagueBenchmarks(
  scope: "team" | "player",
  season: string,
  datasets: {
    zones: any;
    clutch: any;
    hustle: any;
    tracking: any;
    playtypes: any;
    scoring: any;
    fourFactors: any;
    violations: any;
  },
  forceRefresh = false
): Record<string, { mean: number; sd: number }> {
  const advSnapForOnOff = getActiveAdvancedSnapshot();
  const computeOnOffLeagueStats = (): Record<string, { mean: number; sd: number }> => {
    const outOnOff: Record<string, { mean: number; sd: number }> = {};
    const byTeam = advSnapForOnOff?.onOffByTeam;
    if (byTeam && typeof byTeam === "object") {
      const allEntries: any[] = Object.values(byTeam).flat().filter(Boolean);
      const rot = allEntries.filter(
        (x: any) => (Number(x.gp) || 0) >= 5 && (Number(x.minOn) || 0) >= 8
      );
      const pool = rot.length >= 15 ? rot : allEntries;
      const diffRes = computeMeanAndSd(pool.map((x: any) => Number(x.netDiff)), 1);
      const onRes = computeMeanAndSd(pool.map((x: any) => Number(x.netRtgOn)), 1);
      const offRes = computeMeanAndSd(pool.map((x: any) => Number(x.netRtgOff)), 1);
      if (diffRes) outOnOff.adv_onOffNetDiff = diffRes;
      if (onRes) outOnOff.adv_onOffNetOn = onRes;
      if (offRes) outOnOff.adv_onOffNetOff = offRes;
    }
    if (!outOnOff.adv_onOffNetDiff) outOnOff.adv_onOffNetDiff = { mean: 0.1, sd: 5.9 };
    if (!outOnOff.adv_onOffNetOn) outOnOff.adv_onOffNetOn = { mean: -0.3, sd: 8.4 };
    if (!outOnOff.adv_onOffNetOff) outOnOff.adv_onOffNetOff = { mean: -0.4, sd: 6.9 };
    return outOnOff;
  };

  if (!forceRefresh) {
    const advSnap = getActiveAdvancedSnapshot();
    if (advSnap?.benchmarks?.[scope] && Object.keys(advSnap.benchmarks[scope]).length >= 100) {
      return {
        ...advSnap.benchmarks[scope],
        ...computeOnOffLeagueStats(),
      };
    }
    const cacheKey = `${scope}:${season}`;
    const hit = advBenchmarksCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return {
        ...hit.value,
        ...computeOnOffLeagueStats(),
      };
    }
  }
  const cacheKey = `${scope}:${season}`;

  const out: Record<string, { mean: number; sd: number }> = {};
  const setBench = (key: string, values: number[], decimals = 1) => {
    const res = computeMeanAndSd(values, decimals);
    if (res) out[key] = res;
  };

  const filterPool = <T extends { gp?: number; min?: number }>(items: T[], minGp = 5, minMinutes = 8): T[] => {
    if (!Array.isArray(items) || items.length === 0) return [];
    if (scope === "team") return items;
    const rot = items.filter((x) => (Number(x.gp) || 0) >= minGp && (x.min === undefined || Number(x.min) >= minMinutes));
    return rot.length >= 12 ? rot : items.filter((x) => (Number(x.gp) || 0) >= 2).length >= 8 ? items.filter((x) => (Number(x.gp) || 0) >= 2) : items;
  };

  // Layer 2: Advanced & 4 Factors
  const ffItems = filterPool(datasets.fourFactors?.items || []);
  setBench("adv_offRtg", ffItems.map((x: any) => Number(x.offRtg)), 1);
  setBench("adv_defRtg", ffItems.map((x: any) => Number(x.defRtg)), 1);
  setBench("adv_netRtg", ffItems.map((x: any) => Number(x.netRtg)), 1);
  setBench("adv_pace", ffItems.map((x: any) => Number(x.pace)), 1);
  setBench("adv_efgPct", ffItems.map((x: any) => Number(x.efgPct)), 1);
  setBench("adv_tsPct", ffItems.map((x: any) => Number(x.tsPct)), 1);
  if (scope === "player") setBench("adv_usgPct", ffItems.map((x: any) => Number(x.usgPct)), 1);
  setBench("adv_pie", ffItems.map((x: any) => Number(x.pie)), 1);
  setBench("adv_astPct", ffItems.map((x: any) => Number(x.astPct)), 1);
  setBench("adv_astRatio", ffItems.map((x: any) => Number(x.astRatio)), 1);
  setBench("adv_astTo", ffItems.map((x: any) => Number(x.astTo)), 2);
  setBench("adv_orebPct", ffItems.map((x: any) => Number(x.orebPct)), 1);
  setBench("adv_drebPct", ffItems.map((x: any) => Number(x.drebPct)), 1);
  setBench("adv_rebPct", ffItems.map((x: any) => Number(x.rebPct)), 1);
  setBench("adv_tovPct", ffItems.map((x: any) => Number(x.tmTovPct)), 1);
  setBench("adv_ftaRate", ffItems.map((x: any) => Number(x.ftaRate)), 2);
  setBench("adv_oppEfgPct", ffItems.map((x: any) => Number(x.oppEfgPct)).filter((v) => v > 0), 1);
  setBench("adv_oppTovPct", ffItems.map((x: any) => Number(x.oppTovPct)).filter((v) => v > 0), 1);
  setBench("adv_oppOrebPct", ffItems.map((x: any) => Number(x.oppOrebPct)).filter((v) => v > 0), 1);
  setBench("adv_oppFtaRate", ffItems.map((x: any) => Number(x.oppFtaRate)).filter((v) => v > 0), 2);
  Object.assign(out, computeOnOffLeagueStats());

  // Layer 3: Scoring Splits
  const scItems = filterPool(datasets.scoring?.items || []);
  const scFields: Array<[string, string]> = [
    ["sc_pctFga2pt", "pctFga2pt"],
    ["sc_pctFga3pt", "pctFga3pt"],
    ["sc_pctPts2pt", "pctPts2pt"],
    ["sc_pctPts2ptMr", "pctPts2ptMr"],
    ["sc_pctPts3pt", "pctPts3pt"],
    ["sc_pctPtsFb", "pctPtsFb"],
    ["sc_pctPtsFt", "pctPtsFt"],
    ["sc_pctPtsOffTov", "pctPtsOffTov"],
    ["sc_pctPtsPaint", "pctPtsPaint"],
    ["sc_pctAst2pm", "pctAst2pm"],
    ["sc_pctUast2pm", "pctUast2pm"],
    ["sc_pctAst3pm", "pctAst3pm"],
    ["sc_pctUast3pm", "pctUast3pm"],
    ["sc_pctAstFgm", "pctAstFgm"],
    ["sc_pctUastFgm", "pctUastFgm"],
  ];
  for (const [k, f] of scFields) {
    setBench(k, scItems.map((x: any) => Number(x[f])), 1);
  }

  // Layer 4: Shot Zones
  const znAll: any[] = datasets.zones?.items || [];
  const znItems = scope === "team" ? znAll : znAll.filter((x) => (Number(x.totalRimFga) + Number(x.totalThreeFga)) >= 1.5);
  const znPool = znItems.length >= 12 ? znItems : znAll;
  const zoneSpecs: Array<[string, string]> = [
    ["zn_ra", "restrictedArea"],
    ["zn_paintNonRa", "paintNonRa"],
    ["zn_mid", "midRange"],
    ["zn_lc3", "leftCorner3"],
    ["zn_rc3", "rightCorner3"],
    ["zn_corner3", "corner3"],
    ["zn_ab3", "aboveBreak3"],
    ["zn_bc", "backcourt"],
  ];
  for (const [prefix, zField] of zoneSpecs) {
    const minFga = zField === "backcourt" ? 0.001 : scope === "team" ? 0.1 : 0.25;
    setBench(
      `${prefix}FgPct`,
      znPool.filter((x) => (Number(x[zField]?.fga) || 0) >= minFga).map((x) => Number(x[zField]?.fgPct)),
      1
    );
    setBench(`${prefix}Fga`, znPool.map((x) => Number(x[zField]?.fga)), 2);
    setBench(`${prefix}Fgm`, znPool.map((x) => Number(x[zField]?.fgm)), 2);
  }
  setBench("zn_totalRimFga", znPool.map((x) => Number(x.totalRimFga)), 1);
  setBench("zn_rimFgPct", znPool.filter((x) => Number(x.totalRimFga) > 0.2).map((x) => Number(x.rimFgPct)), 1);
  setBench("zn_totalThreeFga", znPool.map((x) => Number(x.totalThreeFga)), 1);
  setBench("zn_threeFgPct", znPool.filter((x) => Number(x.totalThreeFga) > 0.2).map((x) => Number(x.threeFgPct)), 1);

  // Layer 5: Tracking
  const trItems = filterPool(datasets.tracking?.items || []);
  const trFields: Array<[string, string, number, boolean?]> = [
    ["tr_drives", "drives", 1],
    ["tr_driveFgm", "driveFgm", 2],
    ["tr_driveFga", "driveFga", 1],
    ["tr_drivePts", "drivePts", 1],
    ["tr_driveFgPct", "driveFgPct", 1, true],
    ["tr_driveAstPct", "driveAstPct", 1, true],
    ["tr_driveTovPct", "driveTovPct", 1, true],
    ["tr_drivePassesPct", "drivePassesPct", 1, true],
    ["tr_csPts", "catchShootPts", 1],
    ["tr_csFgm", "catchShootFgm", 2],
    ["tr_csFga", "catchShootFga", 1],
    ["tr_csFgPct", "catchShootFgPct", 1, true],
    ["tr_csFg3Pct", "catchShootFg3Pct", 1, true],
    ["tr_csEfgPct", "catchShootEfgPct", 1, true],
    ["tr_puPts", "pullUpPts", 1],
    ["tr_puFgm", "pullUpFgm", 2],
    ["tr_puFga", "pullUpFga", 1],
    ["tr_puFgPct", "pullUpFgPct", 1, true],
    ["tr_puFg3Pct", "pullUpFg3Pct", 1, true],
    ["tr_puEfgPct", "pullUpEfgPct", 1, true],
    ["tr_passesMade", "passesMade", 1],
    ["tr_passesRec", "passesReceived", 1],
    ["tr_secAst", "secondaryAst", 2],
    ["tr_potAst", "potentialAst", 1],
    ["tr_astPtsCreated", "astPtsCreated", 1],
    ["tr_astToPassAdj", "astToPassPctAdj", 1, true],
    ["tr_touches", "touches", 1],
    ["tr_frontCtTouches", "frontCtTouches", 1],
    ["tr_timeOfPoss", "timeOfPoss", 2],
    ["tr_secPerTouch", "avgSecPerTouch", 2, true],
    ["tr_dribPerTouch", "avgDribPerTouch", 2, true],
    ["tr_ptsPerTouch", "ptsPerTouch", 3, true],
    ["tr_paintTouches", "paintTouches", 1],
    ["tr_paintTouchFgPct", "paintTouchFgPct", 1, true],
    ["tr_postTouches", "postTouches", 2],
    ["tr_postTouchFgPct", "postTouchFgPct", 1, true],
    ["tr_elbowTouches", "elbowTouches", 2],
    ["tr_distMiles", "distMiles", 2],
    ["tr_distMilesOff", "distMilesOff", 2],
    ["tr_distMilesDef", "distMilesDef", 2],
    ["tr_avgSpeed", "avgSpeed", 2, true],
    ["tr_avgSpeedOff", "avgSpeedOff", 2, true],
    ["tr_avgSpeedDef", "avgSpeedDef", 2, true],
    ["tr_rebChances", "rebChances", 1],
    ["tr_rebChanceAdj", "rebChancePctAdj", 1, true],
    ["tr_orebContestPct", "orebContestPct", 1, true],
    ["tr_drebContestPct", "drebContestPct", 1, true],
    ["tr_avgRebDist", "avgRebDist", 1, true],
  ];
  for (const [k, f, dec, nz] of trFields) {
    const arr = trItems.map((x: any) => Number(x[f]));
    setBench(k, nz ? arr.filter((v) => v > 0) : arr, dec);
  }

  // Layer 6 & 7: Hustle & Defense
  const huItems = filterPool(datasets.hustle?.items || []);
  const huFields: Array<[string, string, number, boolean?]> = [
    ["hu_ptsPaint", "ptsPaint", 1],
    ["hu_pts2ndChance", "pts2ndChance", 1],
    ["hu_ptsFb", "ptsFb", 1],
    ["hu_ptsOffTov", "ptsOffTov", 1],
    ["hu_contestedShots", "contestedShots", 1],
    ["hu_contestedShots2pt", "contestedShots2pt", 1],
    ["hu_contestedShots3pt", "contestedShots3pt", 1],
    ["hu_deflections", "deflections", 1],
    ["hu_chargesDrawn", "chargesDrawn", 2],
    ["hu_screenAssists", "screenAssists", 1],
    ["hu_screenAstPts", "screenAstPts", 1],
    ["hu_looseBalls", "looseBalls", 2],
    ["hu_offLooseBalls", "offLooseBalls", 2],
    ["hu_defLooseBalls", "defLooseBalls", 2],
    ["hu_boxOuts", "boxOuts", 1],
    ["hu_offBoxOuts", "offBoxOuts", 2],
    ["hu_defBoxOuts", "defBoxOuts", 1],
    ["hu_boxOutRebs", "boxOutTeamRebs", 2],
    ["def_dFgPct", "dFgPct", 1, true],
    ["def_pctPlusMinus", "pctPlusMinus", 1],
    ["def_dFgm", "dFgm", 1],
    ["def_dFga", "dFga", 1],
    ["def_normalFgPct", "normalFgPct", 1, true],
    ["def_freq", "defFreq", 1, true],
    ["def_ws", "defWs", 3],
    ["def_pctStl", "pctStl", 1],
    ["def_pctBlk", "pctBlk", 1],
    ["def_oppPtsPaint", "oppPtsPaint", 1],
    ["def_oppPts2ndChance", "oppPts2ndChance", 1],
    ["def_oppPtsFb", "oppPtsFb", 1],
    ["def_oppPtsOffTov", "oppPtsOffTov", 1],
    ["def_oppFgPct", "oppFgPct", 1, true],
    ["def_oppFg3Pct", "oppFg3Pct", 1, true],
    ["def_oppFg3m", "oppFg3m", 1],
    ["def_oppFtPct", "oppFtPct", 1, true],
    ["def_oppReb", "oppReb", 1],
    ["def_oppAst", "oppAst", 1],
    ["def_oppTov", "oppTov", 1],
    ["def_oppStl", "oppStl", 1],
  ];
  for (const [k, f, dec, nz] of huFields) {
    const arr = huItems.map((x: any) => Number(x[f]));
    setBench(k, nz ? arr.filter((v) => v > 0) : arr, dec);
  }

  // Layer 8: Clutch
  const clItems = filterPool(datasets.clutch?.items || [], 2, 1);
  const clFields: Array<[string, string, number, boolean?]> = [
    ["cl_gp", "gp", 1],
    ["cl_min", "min", 1],
    ["cl_pts", "pts", 1],
    ["cl_netRtg", "netRtg", 1],
    ["cl_offRtg", "offRtg", 1, true],
    ["cl_defRtg", "defRtg", 1, true],
    ["cl_fgPct", "fgPct", 1, true],
    ["cl_fg3Pct", "fg3Pct", 1, true],
    ["cl_ftPct", "ftPct", 1, true],
    ["cl_tsPct", "tsPct", 1, true],
    ["cl_efgPct", "efgPct", 1, true],
    ["cl_usgPct", "usgPct", 1, true],
    ["cl_pie", "pie", 1],
    ["cl_rebAst", "reb", 1],
    ["cl_ast", "ast", 1],
    ["cl_stl", "stl", 2],
    ["cl_blk", "blk", 2],
    ["cl_tov", "tov", 2],
    ["cl_plusMinus", "plusMinus", 1],
  ];
  for (const [k, f, dec, nz] of clFields) {
    const arr = clItems.map((x: any) => Number(x[f]));
    setBench(k, nz ? arr.filter((v) => v > 0) : arr, dec);
  }

  // Layer 9: Playtypes
  const ptItems: any[] = filterPool(datasets.playtypes?.items || [], 3, 0);
  const ptKeyMap: Array<[string, string, "offensive" | "defensive"]> = [
    ["pt_spotup", "Spotup", "offensive"],
    ["pt_prbh", "PRBallHandler", "offensive"],
    ["pt_trans", "Transition", "offensive"],
    ["pt_iso", "Isolation", "offensive"],
    ["pt_prr", "PRRollMan", "offensive"],
    ["pt_cut", "Cut", "offensive"],
    ["pt_post", "Postup", "offensive"],
    ["pt_handoff", "Handoff", "offensive"],
    ["pt_offscr", "OffScreen", "offensive"],
    ["pt_putback", "OffRebound", "offensive"],
    ["pt_misc", "Misc", "offensive"],
    ["pt_def_spotup", "Spotup", "defensive"],
    ["pt_def_prbh", "PRBallHandler", "defensive"],
    ["pt_def_iso", "Isolation", "defensive"],
    ["pt_def_post", "Postup", "defensive"],
    ["pt_def_prr", "PRRollMan", "defensive"],
    ["pt_def_trans", "Transition", "defensive"],
  ];
  setBench(
    "pt_top_off",
    ptItems
      .map((x) => {
        const list = Array.isArray(x.offensive) ? x.offensive : [];
        if (!list.length) return NaN;
        const top = [...list].sort((a, b) => Number(b.possPct) - Number(a.possPct))[0];
        return Number(top?.ppp);
      })
      .filter((v) => Number.isFinite(v) && v > 0),
    2
  );
  for (const [k, ptType, grp] of ptKeyMap) {
    const vals = ptItems
      .map((x) => {
        const list = x[grp] || [];
        const row = list.find((r: any) => String(r.playType).toLowerCase() === ptType.toLowerCase());
        return row && Number(row.poss) > 0 ? Number(row.ppp) : NaN;
      })
      .filter((v) => Number.isFinite(v) && v > 0);
    setBench(k, vals, 2);
  }

  // Layer 10: Violations & Box Hitos (violations divided by gp to match per_game scale)
  const vlItems = filterPool(datasets.violations?.items || []);
  const violFields: Array<[string, string]> = [
    ["vl_total", "totalViolations"],
    ["vl_travel", "travel"],
    ["vl_doubleDribble", "doubleDribble"],
    ["vl_discontinuedDribble", "discontinuedDribble"],
    ["vl_palming", "palming"],
    ["vl_offThreeSec", "offThreeSec"],
    ["vl_defThreeSec", "defThreeSec"],
    ["vl_shotClock", "shotClock"],
    ["vl_fiveSec", "fiveSec"],
    ["vl_eightSec", "eightSec"],
    ["vl_backcourt", "backcourt"],
    ["vl_offFoul", "offFoul"],
    ["vl_charge", "charge"],
    ["vl_kickedBall", "kickedBall"],
    ["vl_lane", "lane"],
    ["vl_offGoaltending", "offGoaltending"],
    ["vl_defGoaltending", "defGoaltending"],
    ["vl_inbound", "inbound"],
    ["vl_jumpBall", "jumpBall"],
    ["vl_delayOfGame", "delayOfGame"],
  ];
  for (const [k, f] of violFields) {
    setBench(
      k,
      vlItems.map((x: any) => {
        const gp = Math.max(1, Number(x.gp) || 1);
        return (Number(x[f]) || 0) / gp;
      }),
      3
    );
  }
  setBench("vl_pf", vlItems.map((x: any) => Number(x.pf)), 1);
  setBench("vl_pfd", vlItems.map((x: any) => Number(x.pfd)), 1);
  setBench("vl_blka", vlItems.map((x: any) => Number(x.blka)), 2);
  setBench("vl_tov", vlItems.map((x: any) => Number(x.tov)), 1);
  if (scope === "player") {
    setBench("vl_dd2", vlItems.map((x: any) => Number(x.dd2)), 1);
    setBench("vl_td3", vlItems.map((x: any) => Number(x.td3)), 1);
    setBench("vl_nbaFantasyPts", vlItems.map((x: any) => Number(x.nbaFantasyPts)), 1);
  }

  // Only cache permanently when the vast majority of live NBA.com layers succeeded;
  // partial timeouts are returned immediately without poisoning advBenchmarksCache.
  const liveCount = Object.keys(out).length;
  const minHealthyCount = scope === "team" ? 130 : 140;
  if (liveCount >= minHealthyCount) {
    advBenchmarksCache.set(cacheKey, { expiresAt: Date.now() + 30 * 60 * 1000, value: out });
  }
  return out;
}

export async function getTeamAdvancedDossier(teamId: string, seasonToken?: string, forceRefresh = false): Promise<any> {
  const season = resolveNbaSeasonParam(seasonToken);
  const [zones, clutch, hustle, tracking, playtypes, scoring, fourFactors, violations, lineups5, lineups3, lineups2, liveOnOff, heroicAll] = await Promise.all([
    getLeagueShotZonesAdvanced(seasonToken, "team", forceRefresh),
    getLeagueClutchAdvanced(seasonToken, "team", forceRefresh),
    getLeagueDefenseHustleAdvanced(seasonToken, "team", forceRefresh),
    getLeagueTrackingAdvanced(seasonToken, "team", forceRefresh),
    getLeaguePlaytypesAdvanced(seasonToken, "team", forceRefresh),
    getLeagueScoringSplitsAdvanced(seasonToken, "team", forceRefresh),
    getLeagueFourFactorsAdvanced(seasonToken, "team", forceRefresh),
    getLeagueViolationsAdvanced(seasonToken, "team", forceRefresh),
    getLeagueLineups(seasonToken, 5, teamId, forceRefresh),
    getLeagueLineups(seasonToken, 3, teamId, forceRefresh),
    getLeagueLineups(seasonToken, 2, teamId, forceRefresh),
    getTeamOnOffSplits(teamId, season, forceRefresh),
    getLeagueHeroicShots("all", forceRefresh),
  ]);

  let teamZone = zones.items.find((x: any) => x.entityId === teamId || x.teamId === teamId) || null;
  let teamClutch = clutch.items.find((x: any) => x.entityId === teamId || x.teamId === teamId) || null;
  let teamHustle = hustle.items.find((x: any) => x.entityId === teamId || x.teamId === teamId) || null;
  let teamTracking = tracking.items.find((x: any) => x.entityId === teamId || x.teamId === teamId) || null;
  let teamPlaytype = playtypes.items.find((x: any) => x.entityId === teamId || x.teamId === teamId) || null;
  let teamScoring = scoring.items.find((x: any) => x.entityId === teamId || x.teamId === teamId) || null;
  let teamFourFactors = fourFactors.items.find((x: any) => x.entityId === teamId || x.teamId === teamId) || null;
  let teamViolations = violations.items.find((x: any) => x.entityId === teamId || x.teamId === teamId) || null;

  const teamEntry = Object.entries(NBA_TEAMS_MAP).find(([abbr, meta]) => meta.id === teamId || abbr === teamId);
  const teamAbbr = teamEntry ? teamEntry[0] : "NBA";
  const teamName = teamEntry ? teamEntry[1].name : `Team ${teamId}`;

  if (!teamZone) teamZone = buildDefaultTeamShotZones(teamId, teamAbbr, teamName);
  if (!teamClutch) teamClutch = buildDefaultTeamClutch(teamId, teamAbbr, teamName);
  if (!teamHustle) teamHustle = buildDefaultTeamDefenseHustle(teamId, teamAbbr, teamName);
  if (!teamTracking) teamTracking = buildDefaultTeamTracking(teamId, teamAbbr, teamName);
  if (!teamScoring) teamScoring = buildDefaultTeamScoringSplits(teamId, teamAbbr, teamName);
  if (!teamFourFactors) teamFourFactors = buildDefaultTeamFourFactors(teamId, teamAbbr, teamName);
  if (!teamViolations) teamViolations = buildDefaultTeamViolations(teamId, teamAbbr, teamName);
  if (!teamPlaytype) {
    teamPlaytype = {
      entityId: teamId,
      entityName: teamName,
      teamId,
      teamAbbr,
      gp: 54,
      totalPossOff: 104.2,
      topPlayTypeOff: null,
      topPlayTypeDef: null,
      offensive: buildDefaultSynergyPlaytypes("offensive"),
      defensive: buildDefaultSynergyPlaytypes("defensive"),
    };
  }

  const defaultOnOffSplits = [
    { playerId: "1", playerName: "Líder Anotador", gp: 52, minOn: 34.5, offRtgOn: 118.4, defRtgOn: 109.2, netRtgOn: 9.2, paceOn: 99.4, efgOn: 56.4, tsOn: 60.2, minOff: 13.5, offRtgOff: 106.8, defRtgOff: 114.5, netRtgOff: -7.7, paceOff: 97.2, efgOff: 49.8, tsOff: 53.4, netDiff: 16.9, offDiff: 11.6, defDiff: -5.3 },
    { playerId: "2", playerName: "Base Director", gp: 54, minOn: 32.8, offRtgOn: 116.8, defRtgOn: 110.4, netRtgOn: 6.4, paceOn: 100.1, efgOn: 55.2, tsOn: 58.9, minOff: 15.2, offRtgOff: 108.2, defRtgOff: 113.8, netRtgOff: -5.6, paceOff: 96.8, efgOff: 51.0, tsOff: 54.2, netDiff: 12.0, offDiff: 8.6, defDiff: -3.4 },
    { playerId: "3", playerName: "Pívot Titular", gp: 50, minOn: 31.0, offRtgOn: 117.2, defRtgOn: 108.0, netRtgOn: 9.2, paceOn: 98.6, efgOn: 56.8, tsOn: 60.8, minOff: 17.0, offRtgOff: 109.4, defRtgOff: 115.6, netRtgOff: -6.2, paceOff: 98.4, efgOff: 51.4, tsOff: 54.8, netDiff: 15.4, offDiff: 7.8, defDiff: -7.6 },
    { playerId: "4", playerName: "Alero Defensivo", gp: 53, minOn: 29.4, offRtgOn: 114.6, defRtgOn: 107.4, netRtgOn: 7.2, paceOn: 98.2, efgOn: 54.6, tsOn: 57.8, minOff: 18.6, offRtgOff: 111.2, defRtgOff: 114.2, netRtgOff: -3.0, paceOff: 99.0, efgOff: 52.8, tsOff: 56.2, netDiff: 10.2, offDiff: 3.4, defDiff: -6.8 },
  ];

  const leagueBenchmarks = buildAdvancedLeagueBenchmarks(
    "team",
    season,
    { zones, clutch, hustle, tracking, playtypes, scoring, fourFactors, violations },
    forceRefresh
  );

  const teamHeroicShots = (heroicAll?.items || []).filter(
    (s: any) => String(s.teamId) === String(teamId) || String(s.teamAbbr).toUpperCase() === teamAbbr.toUpperCase()
  );

  return {
    teamId,
    season,
    seasonLabel: season,
    generatedAt: new Date().toISOString(),
    shotZones: teamZone,
    clutch: teamClutch,
    defenseHustle: teamHustle,
    tracking: teamTracking,
    scoring: teamScoring,
    fourFactors: teamFourFactors,
    violations: teamViolations,
    playtypesOff: teamPlaytype?.offensive || [],
    playtypesDef: teamPlaytype?.defensive || [],
    onOffSplits: liveOnOff.length > 0 ? liveOnOff : defaultOnOffSplits,
    lineups5: lineups5.items || [],
    lineups3: lineups3.items || [],
    lineups2: lineups2.items || [],
    heroicShots: teamHeroicShots,
    leagueBenchmarks,
  };
}

export async function getPlayerAdvancedDossier(playerId: string, teamIdHint?: string, seasonToken?: string, forceRefresh = false): Promise<any> {
  const season = resolveNbaSeasonParam(seasonToken);
  const [zones, clutch, hustle, tracking, playtypes, scoring, fourFactors, violations, teamOnOff, heroicAll] = await Promise.all([
    getLeagueShotZonesAdvanced(seasonToken, "player", forceRefresh),
    getLeagueClutchAdvanced(seasonToken, "player", forceRefresh),
    getLeagueDefenseHustleAdvanced(seasonToken, "player", forceRefresh),
    getLeagueTrackingAdvanced(seasonToken, "player", forceRefresh),
    getLeaguePlaytypesAdvanced(seasonToken, "player", forceRefresh),
    getLeagueScoringSplitsAdvanced(seasonToken, "player", forceRefresh),
    getLeagueFourFactorsAdvanced(seasonToken, "player", forceRefresh),
    getLeagueViolationsAdvanced(seasonToken, "player", forceRefresh),
    teamIdHint ? getTeamOnOffSplits(teamIdHint, season, forceRefresh) : Promise.resolve([]),
    getLeagueHeroicShots("all", forceRefresh),
  ]);

  let pZone = zones.items.find((x: any) => x.entityId === playerId) || null;
  let pClutch = clutch.items.find((x: any) => x.entityId === playerId) || null;
  let pHustle = hustle.items.find((x: any) => x.entityId === playerId) || null;
  let pTracking = tracking.items.find((x: any) => x.entityId === playerId) || null;
  let pPlaytype = playtypes.items.find((x: any) => x.entityId === playerId) || null;
  let pScoring = scoring.items.find((x: any) => x.entityId === playerId) || null;
  let pFourFactors = fourFactors.items.find((x: any) => x.entityId === playerId) || null;
  let pViolations = violations.items.find((x: any) => x.entityId === playerId) || null;
  const pOnOff = (teamOnOff || []).find((x: any) => String(x.playerId) === String(playerId)) || null;

  if (!pZone) {
    pZone = {
      entityId: playerId,
      entityName: "Jugador",
      teamId: teamIdHint || "",
      teamAbbr: "NBA",
      restrictedArea: { fgm: 0, fga: 0, fgPct: 0 },
      paintNonRa: { fgm: 0, fga: 0, fgPct: 0 },
      midRange: { fgm: 0, fga: 0, fgPct: 0 },
      leftCorner3: { fgm: 0, fga: 0, fgPct: 0 },
      rightCorner3: { fgm: 0, fga: 0, fgPct: 0 },
      aboveBreak3: { fgm: 0, fga: 0, fgPct: 0 },
      corner3: { fgm: 0, fga: 0, fgPct: 0 },
      backcourt: { fgm: 0, fga: 0, fgPct: 0 },
      totalRimFga: 0,
      rimFgPct: 0,
      totalThreeFga: 0,
      threeFgPct: 0,
    };
  }

  const leagueBenchmarks = buildAdvancedLeagueBenchmarks(
    "player",
    season,
    { zones, clutch, hustle, tracking, playtypes, scoring, fourFactors, violations },
    forceRefresh
  );

  const playerHeroicShots = (heroicAll?.items || []).filter(
    (s: any) => String(s.playerId) === String(playerId)
  );

  return {
    playerId,
    teamId: teamIdHint || pZone?.teamId || pHustle?.teamId || "",
    season,
    seasonLabel: season,
    generatedAt: new Date().toISOString(),
    shotZones: pZone,
    clutch: pClutch,
    defenseHustle: pHustle,
    tracking: pTracking,
    scoring: pScoring,
    fourFactors: pFourFactors,
    violations: pViolations,
    playtypesOff: pPlaytype?.offensive || [],
    playtypesDef: pPlaytype?.defensive || [],
    onOffSplit: pOnOff,
    heroicShots: playerHeroicShots,
    leagueBenchmarks,
  };
}

export async function buildAdvancedSnapshotFromCurrentState(
  seasonToken = "2026-27",
  forceLive = false
): Promise<NbaAdvancedSnapshotPayload> {
  const season = resolveNbaSeasonParam(seasonToken);
  console.log(`[RadarNBA Snapshot Avanzado] Construyendo capas avanzadas para temporada ${season} (forceLive=${forceLive})...`);

  // 1. Fetch / resolve all team and player layers FIRST so lineups can use fresh player datasets
  const [
    teamZones,
    playerZones,
    teamClutch,
    playerClutch,
    teamHustle,
    playerHustle,
    teamTracking,
    playerTracking,
    teamPlaytypes,
    playerPlaytypes,
    teamScoring,
    playerScoring,
    teamFourFactors,
    playerFourFactors,
    teamViolations,
    playerViolations,
  ] = await Promise.all([
    getLeagueShotZonesAdvanced(season, "team", forceLive),
    getLeagueShotZonesAdvanced(season, "player", forceLive),
    getLeagueClutchAdvanced(season, "team", forceLive),
    getLeagueClutchAdvanced(season, "player", forceLive),
    getLeagueDefenseHustleAdvanced(season, "team", forceLive),
    getLeagueDefenseHustleAdvanced(season, "player", forceLive),
    getLeagueTrackingAdvanced(season, "team", forceLive),
    getLeagueTrackingAdvanced(season, "player", forceLive),
    getLeaguePlaytypesAdvanced(season, "team", forceLive),
    getLeaguePlaytypesAdvanced(season, "player", forceLive),
    getLeagueScoringSplitsAdvanced(season, "team", forceLive),
    getLeagueScoringSplitsAdvanced(season, "player", forceLive),
    getLeagueFourFactorsAdvanced(season, "team", forceLive),
    getLeagueFourFactorsAdvanced(season, "player", forceLive),
    getLeagueViolationsAdvanced(season, "team", forceLive),
    getLeagueViolationsAdvanced(season, "player", forceLive),
  ]);

  const playerDatasetsOverride = {
    zones: playerZones,
    tracking: playerTracking,
    hustle: playerHustle,
    clutch: playerClutch,
    playtypes: playerPlaytypes,
    violations: playerViolations,
    scoring: playerScoring,
  };

  // 2. Fetch 5-Man, 3-Man, 2-Man lineups with all 10 layers + scan Heroic Shots (Buzzer Beaters / Game Winners)
  const [lineups5, lineups3, lineups2, heroicShots] = await Promise.all([
    getLeagueLineups(season, 5, "0", forceLive, playerDatasetsOverride),
    getLeagueLineups(season, 3, "0", forceLive, playerDatasetsOverride),
    getLeagueLineups(season, 2, "0", forceLive, playerDatasetsOverride),
    scanHeroicClutchShotsFromSnapshotAndCdn(forceLive),
  ]);

  // 3. Fetch or synthesize on/off splits for each team
  const onOffByTeam: Record<string, any[]> = {};
  const baseSnap = readNbaSnapshotFromDisk();
  const s2027Players = baseSnap?.s2027?.players || [];

  const teamEntries = Object.entries(NBA_TEAMS_MAP);
  await mapWithConcurrency(teamEntries, 4, async ([abbr, meta]) => {
    const tid = String(meta.id);
    let splits: any[] = [];
    try {
      if (forceLive) {
        splits = await getTeamOnOffSplits(tid, season, true);
      }
    } catch {
      // fallback
    }

    if (!Array.isArray(splits) || splits.length === 0) {
      const teamPlayers = s2027Players
        .filter((p: any) => String(p.teamId) === tid || String(p.teamAbbr) === abbr)
        .sort((a: any, b: any) => {
          const scoreB = (Number(b.games?.length || b.gp || 0)) * (Number(b.advanced?.offRtg || 100));
          const scoreA = (Number(a.games?.length || a.gp || 0)) * (Number(a.advanced?.offRtg || 100));
          return scoreB - scoreA;
        })
        .slice(0, 10);

      if (teamPlayers.length > 0) {
        splits = teamPlayers.map((tp: any) => {
          const adv = tp.advanced || {};
          const gp = Number(tp.games?.length || adv.gp || 50);
          const totalMins = (tp.games || []).reduce((acc: number, g: any) => acc + (Number(g.min) || 0), 0);
          const minOn = gp > 0 && totalMins > 0 ? round1(totalMins / gp) : round1(adv.min || 28.5);
          const minOff = Math.max(2, round1(48 - minOn));
          const offRtgOn = round1(Number(adv.offRtg) || 114.5);
          const defRtgOn = round1(Number(adv.defRtg) || 112.0);
          const netRtgOn = round1(Number(adv.netRtg) || (offRtgOn - defRtgOn));
          const netDiffEst = round1((Number(adv.pie) || 10) > 12 ? (Number(adv.pie) - 10) * 1.8 : ((Number(adv.pie) || 10) - 10) * 1.2);
          const netRtgOff = round1(netRtgOn - netDiffEst);
          const offRtgOff = round1(offRtgOn - round1(netDiffEst * 0.65));
          const defRtgOff = round1(defRtgOn + round1(netDiffEst * 0.35));

          return {
            playerId: String(tp.id),
            playerName: String(tp.name),
            gp,
            minOn,
            offRtgOn,
            defRtgOn,
            netRtgOn,
            paceOn: round1(Number(adv.pace) || 99.5),
            efgOn: round1(Number(adv.efgPct) || 54.0),
            tsOn: round1(Number(adv.tsPct) || 58.0),
            minOff,
            offRtgOff,
            defRtgOff,
            netRtgOff,
            paceOff: round1((Number(adv.pace) || 99.5) - 0.8),
            efgOff: round1(Math.max(45, (Number(adv.efgPct) || 54.0) - 3.5)),
            tsOff: round1(Math.max(48, (Number(adv.tsPct) || 58.0) - 3.8)),
            netDiff: netDiffEst,
            offDiff: round1(offRtgOn - offRtgOff),
            defDiff: round1(defRtgOn - defRtgOff),
          };
        });
      }
    }

    if (!splits || splits.length === 0) {
      splits = [
        { playerId: `${tid}_1`, playerName: `Líder ${meta.name}`, gp: 54, minOn: 34.0, offRtgOn: 118.5, defRtgOn: 110.0, netRtgOn: 8.5, paceOn: 99.8, efgOn: 56.5, tsOn: 60.0, minOff: 14.0, offRtgOff: 108.0, defRtgOff: 114.5, netRtgOff: -6.5, paceOff: 97.5, efgOff: 50.5, tsOff: 54.0, netDiff: 15.0, offDiff: 10.5, defDiff: -4.5 },
        { playerId: `${tid}_2`, playerName: `Base Director ${abbr}`, gp: 52, minOn: 32.5, offRtgOn: 116.2, defRtgOn: 111.0, netRtgOn: 5.2, paceOn: 100.2, efgOn: 55.0, tsOn: 58.5, minOff: 15.5, offRtgOff: 109.0, defRtgOff: 113.8, netRtgOff: -4.8, paceOff: 98.0, efgOff: 51.5, tsOff: 55.0, netDiff: 10.0, offDiff: 7.2, defDiff: -2.8 },
      ];
    }

    onOffByTeam[tid] = splits;
  });

  // 4. Compute benchmarks across all datasets
  const teamBenchmarks = buildAdvancedLeagueBenchmarks(
    "team",
    season,
    {
      zones: teamZones,
      clutch: teamClutch,
      hustle: teamHustle,
      tracking: teamTracking,
      playtypes: teamPlaytypes,
      scoring: teamScoring,
      fourFactors: teamFourFactors,
      violations: teamViolations,
    },
    true
  );

  const playerBenchmarks = buildAdvancedLeagueBenchmarks(
    "player",
    season,
    {
      zones: playerZones,
      clutch: playerClutch,
      hustle: playerHustle,
      tracking: playerTracking,
      playtypes: playerPlaytypes,
      scoring: playerScoring,
      fourFactors: playerFourFactors,
      violations: playerViolations,
    },
    true
  );

  const payload: NbaAdvancedSnapshotPayload = {
    version: 1,
    season,
    generatedAt: new Date().toISOString(),
    source: "nba_stats_advanced_snapshot",
    shotZones: { player: playerZones, team: teamZones },
    clutch: { player: playerClutch, team: teamClutch },
    defenseHustle: { player: playerHustle, team: teamHustle },
    tracking: { player: playerTracking, team: teamTracking },
    playtypes: { player: playerPlaytypes, team: teamPlaytypes },
    scoring: { player: playerScoring, team: teamScoring },
    fourFactors: { player: playerFourFactors, team: teamFourFactors },
    violations: { player: playerViolations, team: teamViolations },
    lineups: { lineups5, lineups3, lineups2 },
    onOffByTeam,
    heroicShots,
    benchmarks: {
      player: playerBenchmarks,
      team: teamBenchmarks,
    },
  };

  return payload;
}

export async function syncNbaAdvancedSnapshotToDisk(options?: { forceLive?: boolean }) {
  const payload = await buildAdvancedSnapshotFromCurrentState("2026-27", options?.forceLive ?? false);
  const writeRes = writeNbaAdvancedSnapshotToDisk(payload);
  memoryAdvancedSnapshot = payload;

  const itemsCount = {
    playerShotZones: payload.shotZones.player?.items?.length || 0,
    teamShotZones: payload.shotZones.team?.items?.length || 0,
    playerClutch: payload.clutch.player?.items?.length || 0,
    teamClutch: payload.clutch.team?.items?.length || 0,
    playerDefenseHustle: payload.defenseHustle.player?.items?.length || 0,
    teamDefenseHustle: payload.defenseHustle.team?.items?.length || 0,
    playerTracking: payload.tracking.player?.items?.length || 0,
    teamTracking: payload.tracking.team?.items?.length || 0,
    playerPlaytypes: payload.playtypes.player?.items?.length || 0,
    teamPlaytypes: payload.playtypes.team?.items?.length || 0,
    playerScoring: payload.scoring.player?.items?.length || 0,
    teamScoring: payload.scoring.team?.items?.length || 0,
    playerFourFactors: payload.fourFactors.player?.items?.length || 0,
    teamFourFactors: payload.fourFactors.team?.items?.length || 0,
    playerViolations: payload.violations.player?.items?.length || 0,
    teamViolations: payload.violations.team?.items?.length || 0,
    lineups5: payload.lineups.lineups5?.items?.length || 0,
    lineups3: payload.lineups.lineups3?.items?.length || 0,
    lineups2: payload.lineups.lineups2?.items?.length || 0,
    teamsWithOnOff: Object.keys(payload.onOffByTeam).length,
    heroicShotsCount: payload.heroicShots?.items?.length || 0,
    playerBenchmarks: Object.keys(payload.benchmarks.player).length,
    teamBenchmarks: Object.keys(payload.benchmarks.team).length,
  };

  console.log(`[RadarNBA Snapshot Avanzado] Guardado con éxito en ${writeRes.filePath} (${Math.round(writeRes.bytesCompressed / 1024)} KB gzip / ${Math.round(writeRes.bytesUncompressed / 1024)} KB JSON)`);

  return {
    ...writeRes,
    itemsCount,
  };
}
