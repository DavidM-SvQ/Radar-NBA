import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createScoutingEngine } from './src/server/scoutingEngine.ts';
import type {
  BootstrapPayload,
  GameDayDateOption,
  GameDayMatchupCard,
  GameDayMatchupTeamSide,
  GameDayOutlierItem,
  GameDayPayload,
  GameDayPlayerLine,
  GameDayRoleShiftItem,
  GameDayStreakShiftItem,
  LeagueGlobalSnapshot,
  MilestonesPayload,
  PlayerAdvancedProfile,
  PlayerGameLog,
  PlayerSummary,
  RosterPlayerItem,
  ScoreboardGame,
  SearchPlayerResult,
  SeasonLeaderHolder,
  SeasonLeaderMilestoneItem,
  SeasonMode,
  SingleGamePerformance,
  SingleGameRecordItem,
  TeamAdvancedProfile,
  TeamGameLog,
  TeamSummary,
} from './src/types/nba.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const CACHE_TTL_CURRENT_MS = 12 * 60 * 1000; // 12 minutes for live 2026-27
const CACHE_TTL_HIST_MS = 60 * 60 * 1000; // 60 minutes for completed 2025-26

const ESPN_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

const NBA_STATS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();

function round1(val: number): number {
  return Math.round((Number(val) || 0) * 10) / 10;
}

function toPct100(val: unknown): number {
  const n = Number(val) || 0;
  if (n === 0) return 0;
  return Math.abs(n) <= 1.5 ? round1(n * 100) : round1(n);
}

function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const ABBR_NORMALIZE_MAP: Record<string, string> = {
  GS: 'GSW',
  SA: 'SAS',
  NY: 'NYK',
  NO: 'NOP',
  UTAH: 'UTA',
  WSH: 'WAS',
};

function normalizeAbbr(abbr: string): string {
  const up = (abbr || '').toUpperCase().trim();
  return ABBR_NORMALIZE_MAP[up] || up;
}

const NBA_TEAMS_META: Record<
  string,
  { name: string; shortName: string; conference: 'Este' | 'Oeste'; espnId: string }
> = {
  ATL: { name: 'Atlanta Hawks', shortName: 'Hawks', conference: 'Este', espnId: '1' },
  BOS: { name: 'Boston Celtics', shortName: 'Celtics', conference: 'Este', espnId: '2' },
  BKN: { name: 'Brooklyn Nets', shortName: 'Nets', conference: 'Este', espnId: '17' },
  CHA: { name: 'Charlotte Hornets', shortName: 'Hornets', conference: 'Este', espnId: '30' },
  CHI: { name: 'Chicago Bulls', shortName: 'Bulls', conference: 'Este', espnId: '4' },
  CLE: { name: 'Cleveland Cavaliers', shortName: 'Cavaliers', conference: 'Este', espnId: '5' },
  DAL: { name: 'Dallas Mavericks', shortName: 'Mavericks', conference: 'Oeste', espnId: '6' },
  DEN: { name: 'Denver Nuggets', shortName: 'Nuggets', conference: 'Oeste', espnId: '7' },
  DET: { name: 'Detroit Pistons', shortName: 'Pistons', conference: 'Este', espnId: '8' },
  GSW: { name: 'Golden State Warriors', shortName: 'Warriors', conference: 'Oeste', espnId: '9' },
  HOU: { name: 'Houston Rockets', shortName: 'Rockets', conference: 'Oeste', espnId: '10' },
  IND: { name: 'Indiana Pacers', shortName: 'Pacers', conference: 'Este', espnId: '11' },
  LAC: { name: 'LA Clippers', shortName: 'Clippers', conference: 'Oeste', espnId: '12' },
  LAL: { name: 'Los Angeles Lakers', shortName: 'Lakers', conference: 'Oeste', espnId: '13' },
  MEM: { name: 'Memphis Grizzlies', shortName: 'Grizzlies', conference: 'Oeste', espnId: '29' },
  MIA: { name: 'Miami Heat', shortName: 'Heat', conference: 'Este', espnId: '14' },
  MIL: { name: 'Milwaukee Bucks', shortName: 'Bucks', conference: 'Este', espnId: '15' },
  MIN: { name: 'Minnesota Timberwolves', shortName: 'Timberwolves', conference: 'Oeste', espnId: '16' },
  NOP: { name: 'New Orleans Pelicans', shortName: 'Pelicans', conference: 'Oeste', espnId: '3' },
  NYK: { name: 'New York Knicks', shortName: 'Knicks', conference: 'Este', espnId: '18' },
  OKC: { name: 'Oklahoma City Thunder', shortName: 'Thunder', conference: 'Oeste', espnId: '25' },
  ORL: { name: 'Orlando Magic', shortName: 'Magic', conference: 'Este', espnId: '19' },
  PHI: { name: 'Philadelphia 76ers', shortName: '76ers', conference: 'Este', espnId: '20' },
  PHX: { name: 'Phoenix Suns', shortName: 'Suns', conference: 'Oeste', espnId: '21' },
  POR: { name: 'Portland Trail Blazers', shortName: 'Trail Blazers', conference: 'Oeste', espnId: '22' },
  SAC: { name: 'Sacramento Kings', shortName: 'Kings', conference: 'Oeste', espnId: '23' },
  SAS: { name: 'San Antonio Spurs', shortName: 'Spurs', conference: 'Oeste', espnId: '24' },
  TOR: { name: 'Toronto Raptors', shortName: 'Raptors', conference: 'Este', espnId: '28' },
  UTA: { name: 'Utah Jazz', shortName: 'Jazz', conference: 'Oeste', espnId: '26' },
  WAS: { name: 'Washington Wizards', shortName: 'Wizards', conference: 'Este', espnId: '27' },
};

async function cachedFetchJson<T>(
  url: string,
  ttlMs = CACHE_TTL_CURRENT_MS,
  headers: Record<string, string> = ESPN_HEADERS,
  timeoutMs = 11000,
  forceRefresh = false
): Promise<T> {
  const now = Date.now();
  if (!forceRefresh) {
    const cached = memoryCache.get(url);
    if (cached && cached.expiresAt > now) {
      return cached.data as T;
    }
  }

  const existing = inflightRequests.get(url);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching ${url}`);
      }
      const json = (await res.json()) as T;
      memoryCache.set(url, { expiresAt: Date.now() + ttlMs, data: json });
      return json;
    } finally {
      clearTimeout(timer);
      inflightRequests.delete(url);
    }
  })();

  inflightRequests.set(url, promise);
  return promise;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx]);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

function assignRestDays<T extends { date: string; seasonLabel: string }>(
  chronologicalAsc: T[]
): Array<T & { restDays: number | null; isBackToBack: boolean }> {
  return chronologicalAsc.map((item, idx) => {
    if (idx === 0 || chronologicalAsc[idx - 1].seasonLabel !== item.seasonLabel) {
      return { ...item, restDays: null, isBackToBack: false };
    }
    const prevDate = new Date(chronologicalAsc[idx - 1].date.slice(0, 10));
    const currDate = new Date(item.date.slice(0, 10));
    const diffDays = Math.round(
      (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const restDays = Math.max(0, diffDays - 1);
    return {
      ...item,
      restDays,
      isBackToBack: restDays === 0,
    };
  });
}

/* ============================================================================
 * 1. OFFICIAL NBA.COM STATS ENGINE (stats.nba.com)
 * ============================================================================ */

interface NbaResultSet {
  headers: string[];
  rowSet: any[][];
}

interface NbaStatsResponse {
  resultSets?: NbaResultSet[];
  resultSet?: NbaResultSet;
}

function parseNbaRows(json: NbaStatsResponse): Array<Record<string, any>> {
  const rs = json.resultSets?.[0] || json.resultSet;
  if (!rs || !Array.isArray(rs.headers) || !Array.isArray(rs.rowSet)) return [];
  const headers = rs.headers;
  return rs.rowSet.map((row) => {
    const obj: Record<string, any> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i];
    }
    return obj;
  });
}

async function fetchNbaEndpointRows(
  endpointAndQuery: string,
  ttlMs: number,
  forceRefresh = false
): Promise<Array<Record<string, any>>> {
  const url = `https://stats.nba.com/stats/${endpointAndQuery}`;
  const json = await cachedFetchJson<NbaStatsResponse>(
    url,
    ttlMs,
    NBA_STATS_HEADERS,
    12000,
    forceRefresh
  );
  return parseNbaRows(json);
}

interface PlayerBioMeta {
  id: string;
  name: string;
  teamId: string;
  teamAbbr: string;
  position: string;
  jersey: string;
  height: string;
  country: string;
}

interface SeasonNbaDataset {
  seasonLabel: '2026-27' | '2025-26';
  teamLogsByAbbr: Map<string, Omit<TeamGameLog, 'restDays' | 'isBackToBack'>[]>;
  teamIdByAbbr: Map<string, string>;
  teamAdvByAbbr: Map<string, TeamAdvancedProfile>;
  playerLogsById: Map<
    string,
    {
      name: string;
      teamId: string;
      teamAbbr: string;
      games: Omit<PlayerGameLog, 'restDays' | 'isBackToBack'>[];
    }
  >;
  playerAdvById: Map<string, PlayerAdvancedProfile>;
}

async function fetchPlayerBiosMap(forceRefresh = false): Promise<Map<string, PlayerBioMeta>> {
  const map = new Map<string, PlayerBioMeta>();
  try {
    const rows = await fetchNbaEndpointRows(
      'playerindex?College=&Country=&DraftPick=&DraftRound=&DraftYear=&Height=&Historical=0&LeagueID=00&Season=2026-27&SeasonType=Regular%20Season&TeamID=0&Weight=',
      CACHE_TTL_HIST_MS,
      forceRefresh
    );
    for (const r of rows) {
      const id = String(r.PERSON_ID || '');
      if (!id) continue;
      const first = String(r.PLAYER_FIRST_NAME || '').trim();
      const last = String(r.PLAYER_LAST_NAME || '').trim();
      map.set(id, {
        id,
        name: `${first} ${last}`.trim(),
        teamId: String(r.TEAM_ID || ''),
        teamAbbr: normalizeAbbr(String(r.TEAM_ABBREVIATION || 'NBA')),
        position: String(r.POSITION || 'G-F'),
        jersey: String(r.JERSEY_NUMBER || '—'),
        height: String(r.HEIGHT || ''),
        country: String(r.COUNTRY || ''),
      });
    }
  } catch (err) {
    console.warn('playerindex warning:', err);
  }
  return map;
}

async function fetchNbaSeasonDataset(
  seasonStr: '2026-27' | '2025-26',
  forceRefresh = false
): Promise<SeasonNbaDataset> {
  const cacheKey = `nba_season_dataset:${seasonStr}`;
  const ttl = seasonStr === '2026-27' ? CACHE_TTL_CURRENT_MS : CACHE_TTL_HIST_MS;
  if (!forceRefresh) {
    const cached = memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as SeasonNbaDataset;
    }
  }

  const encSeason = encodeURIComponent(seasonStr);

  // Wave 1: Game Logs (Team + Player) + Team Advanced/Misc
  const [teamLogRows, playerLogRows, teamAdvRows, teamMiscRows] = await Promise.all([
    fetchNbaEndpointRows(
      `leaguegamelog?Counter=1000&DateFrom=&DateTo=&Direction=DESC&LeagueID=00&PlayerOrTeam=T&Season=${encSeason}&SeasonType=Regular%20Season&Sorter=DATE`,
      ttl,
      forceRefresh
    ),
    fetchNbaEndpointRows(
      `leaguegamelog?Counter=1000&DateFrom=&DateTo=&Direction=DESC&LeagueID=00&PlayerOrTeam=P&Season=${encSeason}&SeasonType=Regular%20Season&Sorter=DATE`,
      ttl,
      forceRefresh
    ),
    fetchNbaEndpointRows(
      `leaguedashteamstats?Conference=&DateFrom=&DateTo=&Division=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonSegment=&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0&VsConference=&VsDivision=`,
      ttl,
      forceRefresh
    ),
    fetchNbaEndpointRows(
      `leaguedashteamstats?Conference=&DateFrom=&DateTo=&Division=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Misc&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonSegment=&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0&VsConference=&VsDivision=`,
      ttl,
      forceRefresh
    ),
  ]);

  // Wave 2: Player Advanced, Player Misc, Player Hustle, Team Hustle (polite wave so Akamai stays happy)
  const [playerAdvRows, playerMiscRows, playerHustleRows, teamHustleRows] =
    await Promise.all([
      fetchNbaEndpointRows(
        `leaguedashplayerstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonSegment=&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0&VsConference=&VsDivision=&Weight=`,
        ttl,
        forceRefresh
      ).catch(() => []),
      fetchNbaEndpointRows(
        `leaguedashplayerstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Misc&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonSegment=&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0&VsConference=&VsDivision=&Weight=`,
        ttl,
        forceRefresh
      ).catch(() => []),
      fetchNbaEndpointRows(
        `leaguehustlestatsplayer?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonSegment=&SeasonType=Regular%20Season&TeamID=0&VsConference=&VsDivision=&Weight=`,
        ttl,
        forceRefresh
      ).catch(() => []),
      fetchNbaEndpointRows(
        `leaguehustlestatsteam?Conference=&DateFrom=&DateTo=&Division=&GameScope=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Season=${encSeason}&SeasonSegment=&SeasonType=Regular%20Season&TeamID=0&VsConference=&VsDivision=`,
        ttl,
        forceRefresh
      ).catch(() => []),
    ]);

  // Index Team Game Logs by GAME_ID to pair opponents & compute exact possessions/ratings/USG%
  const gameTeamsMap = new Map<string, Array<Record<string, any>>>();
  const teamIdToAbbr = new Map<string, string>();
  const teamIdByAbbr = new Map<string, string>();

  for (const row of teamLogRows) {
    const gid = String(row.GAME_ID || '');
    const tid = String(row.TEAM_ID || '');
    const abbr = normalizeAbbr(String(row.TEAM_ABBREVIATION || ''));
    if (tid && abbr) {
      teamIdToAbbr.set(tid, abbr);
      teamIdByAbbr.set(abbr, tid);
    }
    if (!gid) continue;
    const arr = gameTeamsMap.get(gid) || [];
    arr.push(row);
    gameTeamsMap.set(gid, arr);
  }

  // Lookup map `(gameId:teamAbbr)` -> team boxscore context for player USG% & scoreDisplay
  const teamGameBoxLookup = new Map<
    string,
    {
      ptsFor: number;
      ptsAgainst: number;
      tmMin: number;
      tmFga: number;
      tmFta: number;
      tmTov: number;
    }
  >();

  const teamLogsByAbbr = new Map<
    string,
    Omit<TeamGameLog, 'restDays' | 'isBackToBack'>[]
  >();

  for (const [gid, pair] of gameTeamsMap.entries()) {
    for (const us of pair) {
      const opp = pair.find((x) => x.TEAM_ID !== us.TEAM_ID);
      const abbr = normalizeAbbr(String(us.TEAM_ABBREVIATION || ''));
      const matchup = String(us.MATCHUP || '');
      const isHome = !matchup.includes('@');
      const oppAbbrFromMatchup = normalizeAbbr(
        matchup.split(isHome ? 'vs.' : '@')[1]?.trim() || ''
      );
      const oppAbbr = opp
        ? normalizeAbbr(String(opp.TEAM_ABBREVIATION || oppAbbrFromMatchup))
        : oppAbbrFromMatchup || 'NBA';
      const oppMeta = NBA_TEAMS_META[oppAbbr];

      const pf = Number(us.PTS) || 0;
      const pa = opp ? Number(opp.PTS) || 0 : pf;
      const fgm = Number(us.FGM) || 0;
      const fga = Number(us.FGA) || 0;
      const fg3m = Number(us.FG3M) || 0;
      const fg3a = Number(us.FG3A) || 0;
      const ftm = Number(us.FTM) || 0;
      const fta = Number(us.FTA) || 0;
      const oreb = Number(us.OREB) || 0;
      const dreb = Number(us.DREB) || 0;
      const reb = Number(us.REB) || 0;
      const ast = Number(us.AST) || 0;
      const stl = Number(us.STL) || 0;
      const blk = Number(us.BLK) || 0;
      const tov = Number(us.TOV) || 0;
      const tmMin = Number(us.MIN) || 240;

      const oppOreb = opp ? Number(opp.OREB) || 0 : oreb;
      const oppDreb = opp ? Number(opp.DREB) || 0 : dreb;
      const oppFga = opp ? Number(opp.FGA) || fga : fga;
      const oppFgm = opp ? Number(opp.FGM) || fgm : fgm;
      const oppFta = opp ? Number(opp.FTA) || fta : fta;
      const oppTov = opp ? Number(opp.TOV) || tov : tov;

      // Official NBA / Dean Oliver Possession estimate
      const usPoss =
        fga +
        0.44 * fta -
        1.07 * (oreb / Math.max(1, oreb + oppDreb)) * (fga - fgm) +
        tov;
      const oppPoss =
        oppFga +
        0.44 * oppFta -
        1.07 * (oppOreb / Math.max(1, oppOreb + dreb)) * (oppFga - oppFgm) +
        oppTov;
      const poss = Math.max(65, 0.5 * (usPoss + oppPoss));

      const offRtg = round1((pf / poss) * 100);
      const defRtg = round1((pa / poss) * 100);
      const netRtg = round1(offRtg - defRtg);
      const pace = round1((48 * poss) / Math.max(40, tmMin / 5));
      const efgPct = fga > 0 ? round1(((fgm + 0.5 * fg3m) / fga) * 100) : 0;
      const tsDenom = 2 * (fga + 0.44 * fta);
      const tsPct = tsDenom > 0 ? round1((pf / tsDenom) * 100) : 0;
      const orebPct =
        oreb + oppDreb > 0 ? round1((oreb / (oreb + oppDreb)) * 100) : 0;
      const tovPct = round1((tov / poss) * 100);

      teamGameBoxLookup.set(`${gid}:${abbr}`, {
        ptsFor: pf,
        ptsAgainst: pa,
        tmMin,
        tmFga: fga,
        tmFta: fta,
        tmTov: tov,
      });

      const list = teamLogsByAbbr.get(abbr) || [];
      list.push({
        eventId: gid,
        date: String(us.GAME_DATE || ''),
        seasonLabel: seasonStr,
        opponentAbbr: oppAbbr,
        opponentName: oppMeta?.name || String(opp?.TEAM_NAME || oppAbbr),
        isHome,
        result: String(us.WL || 'W') === 'L' ? 'L' : 'W',
        pointsFor: pf,
        pointsAgainst: pa,
        differential: pf - pa,
        totalPoints: pf + pa,
        fgm,
        fga,
        fgPct: toPct100(us.FG_PCT),
        fg3m,
        fg3a,
        fg3Pct: toPct100(us.FG3_PCT),
        ftm,
        fta,
        ftPct: toPct100(us.FT_PCT),
        oreb,
        dreb,
        reb,
        ast,
        stl,
        blk,
        tov,
        poss: round1(poss),
        offRtg,
        defRtg,
        netRtg,
        pace,
        efgPct,
        tsPct,
        orebPct,
        tovPct,
      });
      teamLogsByAbbr.set(abbr, list);
    }
  }

  // Build Team Advanced Profiles (combining Advanced + Misc + Hustle)
  const teamMiscById = new Map<string, Record<string, any>>();
  for (const r of teamMiscRows) teamMiscById.set(String(r.TEAM_ID), r);
  const teamHustleById = new Map<string, Record<string, any>>();
  for (const r of teamHustleRows) teamHustleById.set(String(r.TEAM_ID), r);

  const teamAdvByAbbr = new Map<string, TeamAdvancedProfile>();
  for (const r of teamAdvRows) {
    const tid = String(r.TEAM_ID || '');
    // Fallback match by TEAM_NAME if TEAM_ID wasn't in gamelog yet
    let abbr = teamIdToAbbr.get(tid);
    if (!abbr) {
      const tName = String(r.TEAM_NAME || '').toLowerCase();
      for (const [k, meta] of Object.entries(NBA_TEAMS_META)) {
        if (
          meta.name.toLowerCase() === tName ||
          tName.includes(meta.shortName.toLowerCase())
        ) {
          abbr = k;
          teamIdByAbbr.set(k, tid);
          break;
        }
      }
    }
    if (!abbr) continue;

    const misc = teamMiscById.get(tid) || {};
    const hustle = teamHustleById.get(tid) || {};

    teamAdvByAbbr.set(abbr, {
      gp: Number(r.GP) || 0,
      offRtg: round1(r.OFF_RATING),
      defRtg: round1(r.DEF_RATING),
      netRtg: round1(r.NET_RATING),
      pace: round1(r.PACE),
      pie: toPct100(r.PIE),
      efgPct: toPct100(r.EFG_PCT),
      tsPct: toPct100(r.TS_PCT),
      astPct: toPct100(r.AST_PCT),
      astTo: round1(r.AST_TO),
      astRatio: round1(r.AST_RATIO),
      orebPct: toPct100(r.OREB_PCT),
      drebPct: toPct100(r.DREB_PCT),
      rebPct: toPct100(r.REB_PCT),
      tovPct: toPct100(r.TM_TOV_PCT),
      ptsPaint: round1(misc.PTS_PAINT),
      oppPtsPaint: round1(misc.OPP_PTS_PAINT),
      pts2ndChance: round1(misc.PTS_2ND_CHANCE),
      oppPts2ndChance: round1(misc.OPP_PTS_2ND_CHANCE),
      ptsFastBreak: round1(misc.PTS_FB),
      ptsOffTov: round1(misc.PTS_OFF_TOV),
      contestedShots: round1(hustle.CONTESTED_SHOTS),
      deflections: round1(hustle.DEFLECTIONS),
      screenAssists: round1(hustle.SCREEN_ASSISTS),
      looseBalls: round1(hustle.LOOSE_BALLS_RECOVERED),
      boxOuts: round1(hustle.BOX_OUTS),
    });
  }

  // Build Player Game Logs (all ~580 players!)
  const playerLogsById = new Map<
    string,
    {
      name: string;
      teamId: string;
      teamAbbr: string;
      games: Omit<PlayerGameLog, 'restDays' | 'isBackToBack'>[];
    }
  >();

  for (const row of playerLogRows) {
    const pid = String(row.PLAYER_ID || '');
    const gid = String(row.GAME_ID || '');
    if (!pid || !gid) continue;

    const abbr = normalizeAbbr(String(row.TEAM_ABBREVIATION || 'NBA'));
    const tid = String(row.TEAM_ID || '');
    const matchup = String(row.MATCHUP || '');
    const isHome = !matchup.includes('@');
    const oppAbbr = normalizeAbbr(
      matchup.split(isHome ? 'vs.' : '@')[1]?.trim() || 'NBA'
    );
    const oppMeta = NBA_TEAMS_META[oppAbbr];

    const minutes = Math.round(Number(row.MIN) || 0);
    const points = Number(row.PTS) || 0;
    const oreb = Number(row.OREB) || 0;
    const dreb = Number(row.DREB) || 0;
    const rebounds = Number(row.REB) || oreb + dreb;
    const assists = Number(row.AST) || 0;
    const steals = Number(row.STL) || 0;
    const blocks = Number(row.BLK) || 0;
    const turnovers = Number(row.TOV) || 0;
    const fouls = Number(row.PF) || 0;
    const plusMinus = Number(row.PLUS_MINUS) || 0;
    const fgm = Number(row.FGM) || 0;
    const fga = Number(row.FGA) || 0;
    const fg3m = Number(row.FG3M) || 0;
    const fg3a = Number(row.FG3A) || 0;
    const ftm = Number(row.FTM) || 0;
    const fta = Number(row.FTA) || 0;

    const efgPct = fga > 0 ? round1(((fgm + 0.5 * fg3m) / fga) * 100) : 0;
    const tsDenom = 2 * (fga + 0.44 * fta);
    const tsPct = tsDenom > 0 ? round1((points / tsDenom) * 100) : 0;

    // Hollinger Single-Game Score (GmSc)
    const gameScore = round1(
      points +
        0.4 * fgm -
        0.7 * fga -
        0.4 * (fta - ftm) +
        0.7 * oreb +
        0.3 * dreb +
        steals +
        0.7 * assists +
        0.7 * blocks -
        0.4 * fouls -
        turnovers
    );

    const tmBox = teamGameBoxLookup.get(`${gid}:${abbr}`);
    const scoreDisplay = tmBox ? `${tmBox.ptsFor}-${tmBox.ptsAgainst}` : '';
    let usgEst = 0;
    if (minutes > 0 && tmBox) {
      const playerPossUsed = fga + 0.44 * fta + turnovers;
      const teamPossUsed = tmBox.tmFga + 0.44 * tmBox.tmFta + tmBox.tmTov;
      if (teamPossUsed > 0) {
        usgEst = round1(
          (100 * (playerPossUsed * (tmBox.tmMin / 5))) / (minutes * teamPossUsed)
        );
      }
    }

    let entry = playerLogsById.get(pid);
    if (!entry) {
      entry = {
        name: String(row.PLAYER_NAME || ''),
        teamId: tid,
        teamAbbr: abbr,
        games: [],
      };
      playerLogsById.set(pid, entry);
    }

    entry.games.push({
      eventId: gid,
      date: String(row.GAME_DATE || ''),
      seasonLabel: seasonStr,
      opponentAbbr: oppAbbr,
      opponentName: oppMeta?.name || oppAbbr,
      isHome,
      result: String(row.WL || 'W') === 'L' ? 'L' : 'W',
      scoreDisplay,
      minutes,
      points,
      rebounds,
      oreb,
      dreb,
      assists,
      steals,
      blocks,
      stocks: steals + blocks,
      turnovers,
      fouls,
      plusMinus,
      fgm,
      fga,
      fgPct: toPct100(row.FG_PCT),
      fg3m,
      fg3a,
      fg3Pct: toPct100(row.FG3_PCT),
      ftm,
      fta,
      ftPct: toPct100(row.FT_PCT),
      pra: points + rebounds + assists,
      tsPct,
      efgPct,
      usgEst,
      gameScore,
    });
  }

  // Build Player Advanced Profiles (Advanced + Misc + Hustle)
  const pMiscById = new Map<string, Record<string, any>>();
  for (const r of playerMiscRows) pMiscById.set(String(r.PLAYER_ID), r);
  const pHustleById = new Map<string, Record<string, any>>();
  for (const r of playerHustleRows) pHustleById.set(String(r.PLAYER_ID), r);

  const playerAdvById = new Map<string, PlayerAdvancedProfile>();
  for (const r of playerAdvRows) {
    const pid = String(r.PLAYER_ID || '');
    if (!pid) continue;
    const misc = pMiscById.get(pid) || {};
    const hustle = pHustleById.get(pid) || {};

    playerAdvById.set(pid, {
      gp: Number(r.GP) || 0,
      usgPct: toPct100(r.USG_PCT),
      tsPct: toPct100(r.TS_PCT),
      efgPct: toPct100(r.EFG_PCT),
      offRtg: round1(r.OFF_RATING),
      defRtg: round1(r.DEF_RATING),
      netRtg: round1(r.NET_RATING),
      pie: toPct100(r.PIE),
      pace: round1(r.PACE),
      astPct: toPct100(r.AST_PCT),
      astTo: round1(r.AST_TO),
      astRatio: round1(r.AST_RATIO),
      orebPct: toPct100(r.OREB_PCT),
      drebPct: toPct100(r.DREB_PCT),
      rebPct: toPct100(r.REB_PCT),
      tovPct: toPct100(r.TM_TOV_PCT || r.E_TOV_PCT),
      ptsPaint: round1(misc.PTS_PAINT),
      pts2ndChance: round1(misc.PTS_2ND_CHANCE),
      ptsFastBreak: round1(misc.PTS_FB),
      ptsOffTov: round1(misc.PTS_OFF_TOV),
      foulsDrawn: round1(misc.PFD),
      contestedShots: round1(hustle.CONTESTED_SHOTS),
      deflections: round1(hustle.DEFLECTIONS),
      screenAssists: round1(hustle.SCREEN_ASSISTS),
      looseBalls: round1(hustle.LOOSE_BALLS_RECOVERED),
      boxOuts: round1(hustle.BOX_OUTS),
    });
  }

  const dataset: SeasonNbaDataset = {
    seasonLabel: seasonStr,
    teamLogsByAbbr,
    teamIdByAbbr,
    teamAdvByAbbr,
    playerLogsById,
    playerAdvById,
  };

  memoryCache.set(cacheKey, { expiresAt: Date.now() + ttl, data: dataset });
  return dataset;
}

function blendPlayerAdv(
  a27?: PlayerAdvancedProfile,
  a26?: PlayerAdvancedProfile
): PlayerAdvancedProfile | undefined {
  if (a27 && !a26) return a27;
  if (!a27 && a26) return a26;
  if (!a27 || !a26) return undefined;
  const totGp = Math.max(1, a27.gp + a26.gp);
  const w = (k: keyof PlayerAdvancedProfile) =>
    round1((a27[k] * a27.gp + a26[k] * a26.gp) / totGp);

  return {
    gp: a27.gp + a26.gp,
    usgPct: w('usgPct'),
    tsPct: w('tsPct'),
    efgPct: w('efgPct'),
    offRtg: w('offRtg'),
    defRtg: w('defRtg'),
    netRtg: w('netRtg'),
    pie: w('pie'),
    pace: w('pace'),
    astPct: w('astPct'),
    astTo: w('astTo'),
    astRatio: w('astRatio'),
    orebPct: w('orebPct'),
    drebPct: w('drebPct'),
    rebPct: w('rebPct'),
    tovPct: w('tovPct'),
    ptsPaint: w('ptsPaint'),
    pts2ndChance: w('pts2ndChance'),
    ptsFastBreak: w('ptsFastBreak'),
    ptsOffTov: w('ptsOffTov'),
    foulsDrawn: w('foulsDrawn'),
    contestedShots: w('contestedShots'),
    deflections: w('deflections'),
    screenAssists: w('screenAssists'),
    looseBalls: w('looseBalls'),
    boxOuts: w('boxOuts'),
  };
}

function blendTeamAdv(
  a27?: TeamAdvancedProfile,
  a26?: TeamAdvancedProfile
): TeamAdvancedProfile | undefined {
  if (a27 && !a26) return a27;
  if (!a27 && a26) return a26;
  if (!a27 || !a26) return undefined;
  const totGp = Math.max(1, a27.gp + a26.gp);
  const w = (k: keyof TeamAdvancedProfile) =>
    round1((a27[k] * a27.gp + a26[k] * a26.gp) / totGp);

  return {
    gp: a27.gp + a26.gp,
    offRtg: w('offRtg'),
    defRtg: w('defRtg'),
    netRtg: w('netRtg'),
    pace: w('pace'),
    pie: w('pie'),
    efgPct: w('efgPct'),
    tsPct: w('tsPct'),
    astPct: w('astPct'),
    astTo: w('astTo'),
    astRatio: w('astRatio'),
    orebPct: w('orebPct'),
    drebPct: w('drebPct'),
    rebPct: w('rebPct'),
    tovPct: w('tovPct'),
    ptsPaint: w('ptsPaint'),
    oppPtsPaint: w('oppPtsPaint'),
    pts2ndChance: w('pts2ndChance'),
    oppPts2ndChance: w('oppPts2ndChance'),
    ptsFastBreak: w('ptsFastBreak'),
    ptsOffTov: w('ptsOffTov'),
    contestedShots: w('contestedShots'),
    deflections: w('deflections'),
    screenAssists: w('screenAssists'),
    looseBalls: w('looseBalls'),
    boxOuts: w('boxOuts'),
  };
}

/* ============================================================================
 * 2. ESPN LIVE SCOREBOARD, STANDINGS SEEDS & RESILIENT FALLBACK
 * ============================================================================ */

async function fetchScoreboard(forceRefresh = false): Promise<ScoreboardGame[]> {
  try {
    const sb = await cachedFetchJson<Record<string, any>>(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      2 * 60 * 1000,
      ESPN_HEADERS,
      8000,
      forceRefresh
    );
    const events: any[] = sb.events || [];
    return events.slice(0, 10).map((ev) => {
      const comp = ev.competitions?.[0] || {};
      const competitors: any[] = comp.competitors || [];
      const home = competitors.find((c) => c.homeAway === 'home') || competitors[0] || {};
      const away = competitors.find((c) => c.homeAway === 'away') || competitors[1] || {};
      const st = comp.status?.type || {};

      return {
        id: String(ev.id),
        date: String(ev.date || ''),
        statusText: String(st.shortDetail || st.description || ''),
        isLive: st.state === 'in',
        isCompleted: Boolean(st.completed),
        awayAbbr: normalizeAbbr(String(away.team?.abbreviation || '')),
        awayName: String(away.team?.shortDisplayName || ''),
        awayScore: Number(away.score || 0),
        homeAbbr: normalizeAbbr(String(home.team?.abbreviation || '')),
        homeName: String(home.team?.shortDisplayName || ''),
        homeScore: Number(home.score || 0),
      };
    });
  } catch {
    return [];
  }
}

async function fetchEspnStandingsByAbbr(
  seasonMode: SeasonMode
): Promise<Map<string, Record<string, string>>> {
  const map = new Map<string, Record<string, string>>();
  try {
    const q = seasonMode === '2026' ? '?season=2026' : '';
    const json = await cachedFetchJson<Record<string, any>>(
      `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings${q}`
    );
    for (const child of json.children || []) {
      for (const entry of child.standings?.entries || []) {
        const abbr = normalizeAbbr(String(entry.team?.abbreviation || ''));
        if (!abbr) continue;
        const statsMap: Record<string, string> = {};
        for (const s of entry.stats || []) {
          if (s.name) statsMap[s.name] = String(s.displayValue ?? s.value ?? '');
          if (s.type) statsMap[s.type] = String(s.displayValue ?? s.value ?? '');
        }
        if (entry.team?.logos?.[0]?.href) {
          statsMap.logoUrl = String(entry.team.logos[0].href);
        }
        map.set(abbr, statsMap);
      }
    }
  } catch {
    // Standings metadata is optional enrichment; records are computed directly from games
  }
  return map;
}

/* ============================================================================
 * 3. UNIFIED HYBRID BOOTSTRAP BUILDER (NBA.com Primary + ESPN Fallback)
 * ============================================================================ */

async function buildFullLeagueMemory(
  seasonMode: SeasonMode,
  forceRefresh = false
): Promise<{
  dataSource: 'nba_official_hybrid' | 'espn_fallback';
  teams: TeamSummary[];
  allPlayers: PlayerSummary[];
  scoreboard: ScoreboardGame[];
}> {
  const memKey = `full_league_mem:${seasonMode}`;
  if (!forceRefresh) {
    const cached = memoryCache.get(memKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as {
        dataSource: 'nba_official_hybrid' | 'espn_fallback';
        teams: TeamSummary[];
        allPlayers: PlayerSummary[];
        scoreboard: ScoreboardGame[];
      };
    }
  }

  try {
    const [biosMap, ds2027, ds2026, espnStandings, scoreboard] = await Promise.all([
      fetchPlayerBiosMap(forceRefresh),
      seasonMode === '2026'
        ? Promise.resolve(null)
        : fetchNbaSeasonDataset('2026-27', forceRefresh),
      seasonMode === '2027'
        ? Promise.resolve(null)
        : fetchNbaSeasonDataset('2025-26', forceRefresh),
      fetchEspnStandingsByAbbr(seasonMode),
      fetchScoreboard(forceRefresh),
    ]);

    // Build all 30 TeamSummary items
    const teams: TeamSummary[] = [];
    for (const [abbr, meta] of Object.entries(NBA_TEAMS_META)) {
      const logs27 = ds2027?.teamLogsByAbbr.get(abbr) || [];
      const logs26 = ds2026?.teamLogsByAbbr.get(abbr) || [];
      const mergedAsc = [...logs26, ...logs27].sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      const gamesDesc = assignRestDays(mergedAsc).reverse();

      const tid =
        ds2027?.teamIdByAbbr.get(abbr) ||
        ds2026?.teamIdByAbbr.get(abbr) ||
        meta.espnId;

      const adv =
        seasonMode === '2027'
          ? ds2027?.teamAdvByAbbr.get(abbr)
          : seasonMode === '2026'
          ? ds2026?.teamAdvByAbbr.get(abbr)
          : blendTeamAdv(
              ds2027?.teamAdvByAbbr.get(abbr),
              ds2026?.teamAdvByAbbr.get(abbr)
            );

      const st = espnStandings.get(abbr) || {};
      const wins = gamesDesc.filter((g) => g.result === 'W').length;
      const losses = gamesDesc.length - wins;
      const totalG = Math.max(1, gamesDesc.length);
      const avgPf =
        gamesDesc.length > 0
          ? round1(gamesDesc.reduce((s, g) => s + g.pointsFor, 0) / gamesDesc.length)
          : Number(st.avgPointsFor || 0);
      const avgPa =
        gamesDesc.length > 0
          ? round1(
              gamesDesc.reduce((s, g) => s + g.pointsAgainst, 0) / gamesDesc.length
            )
          : Number(st.avgPointsAgainst || 0);

      const homeG = gamesDesc.filter((g) => g.isHome);
      const roadG = gamesDesc.filter((g) => !g.isHome);
      const l10 = gamesDesc.slice(0, 10);
      const l10W = l10.filter((g) => g.result === 'W').length;

      let streakLen = 0;
      const firstRes = gamesDesc[0]?.result || 'W';
      for (const g of gamesDesc) {
        if (g.result === firstRes) streakLen++;
        else break;
      }

      teams.push({
        id: tid,
        name: meta.name,
        shortName: meta.shortName,
        abbreviation: abbr,
        conference: meta.conference,
        logoUrl: st.logoUrl,
        wins,
        losses,
        winPct: Math.round((wins / totalG) * 1000) / 1000,
        playoffSeed: Number(st.playoffSeed || 0),
        gamesBehind: st.gamesBehind || '-',
        streakCode: gamesDesc.length > 0 ? `${firstRes}${streakLen}` : st.streak || '-',
        homeRecord: `${homeG.filter((g) => g.result === 'W').length}-${
          homeG.filter((g) => g.result === 'L').length
        }`,
        roadRecord: `${roadG.filter((g) => g.result === 'W').length}-${
          roadG.filter((g) => g.result === 'L').length
        }`,
        lastTenRecord: `${l10W}-${l10.length - l10W}`,
        avgPointsFor: avgPf,
        avgPointsAgainst: avgPa,
        differential: round1(avgPf - avgPa),
        advanced: adv,
        games: gamesDesc,
      });
    }

    teams.sort((a, b) => b.winPct - a.winPct || b.differential - a.differential);

    // Collect all unique player IDs across active seasons
    const allPlayerIds = new Set<string>();
    if (ds2027) {
      for (const id of ds2027.playerLogsById.keys()) allPlayerIds.add(id);
    }
    if (ds2026) {
      for (const id of ds2026.playerLogsById.keys()) allPlayerIds.add(id);
    }

    const allPlayers: PlayerSummary[] = [];
    for (const pid of allPlayerIds) {
      const p27 = ds2027?.playerLogsById.get(pid);
      const p26 = ds2026?.playerLogsById.get(pid);
      const bio = biosMap.get(pid);

      const rawGames = [...(p26?.games || []), ...(p27?.games || [])];
      if (rawGames.length === 0) continue;

      const seen = new Set<string>();
      const uniqueAsc = rawGames
        .filter((g) => {
          if (seen.has(g.eventId)) return false;
          seen.add(g.eventId);
          return Boolean(g.date);
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      const gamesDesc = assignRestDays(uniqueAsc).reverse();

      const teamAbbr = normalizeAbbr(
        p27?.teamAbbr || bio?.teamAbbr || p26?.teamAbbr || 'NBA'
      );
      const teamMeta = NBA_TEAMS_META[teamAbbr];
      const teamId =
        p27?.teamId ||
        bio?.teamId ||
        p26?.teamId ||
        ds2027?.teamIdByAbbr.get(teamAbbr) ||
        ds2026?.teamIdByAbbr.get(teamAbbr) ||
        '';

      const adv =
        seasonMode === '2027'
          ? ds2027?.playerAdvById.get(pid)
          : seasonMode === '2026'
          ? ds2026?.playerAdvById.get(pid)
          : blendPlayerAdv(
              ds2027?.playerAdvById.get(pid),
              ds2026?.playerAdvById.get(pid)
            );

      allPlayers.push({
        id: pid,
        name: bio?.name || p27?.name || p26?.name || 'Jugador NBA',
        teamId,
        teamAbbr,
        teamName: teamMeta?.name || teamAbbr,
        position: bio?.position || 'G-F',
        jersey: bio?.jersey,
        height: bio?.height,
        country: bio?.country,
        headshotUrl: `https://cdn.nba.com/headshots/nba/latest/260x190/${pid}.png`,
        advanced: adv,
        games: gamesDesc,
      });
    }

    // Rank players by total minutes played in current sample so rotation players come first
    allPlayers.sort((a, b) => {
      const minA = a.games.reduce((s, g) => s + g.minutes, 0);
      const minB = b.games.reduce((s, g) => s + g.minutes, 0);
      return minB - minA;
    });

    const result = {
      dataSource: 'nba_official_hybrid' as const,
      teams,
      allPlayers,
      scoreboard,
    };

    memoryCache.set(memKey, {
      expiresAt: Date.now() + CACHE_TTL_CURRENT_MS,
      data: result,
    });
    return result;
  } catch (err) {
    console.warn('NBA.com primary engine encountered an issue, engaging ESPN fallback:', err);
    return buildEspnFallbackMemory(seasonMode);
  }
}

/* --- Compact ESPN Fallback if stats.nba.com is ever unreachable --- */
const FALLBACK_ESPN_ATHLETES = [
  { id: '3112335', name: 'Nikola Jokic', teamAbbr: 'DEN', position: 'C' },
  { id: '4278073', name: 'Shai Gilgeous-Alexander', teamAbbr: 'OKC', position: 'G' },
  { id: '3945274', name: 'Luka Doncic', teamAbbr: 'LAL', position: 'G' },
  { id: '3032977', name: 'Giannis Antetokounmpo', teamAbbr: 'MIL', position: 'F' },
  { id: '5104157', name: 'Victor Wembanyama', teamAbbr: 'SAS', position: 'C' },
  { id: '4065648', name: 'Jayson Tatum', teamAbbr: 'BOS', position: 'F' },
  { id: '4594268', name: 'Anthony Edwards', teamAbbr: 'MIN', position: 'G' },
  { id: '3975', name: 'Stephen Curry', teamAbbr: 'GSW', position: 'G' },
  { id: '3934672', name: 'Jalen Brunson', teamAbbr: 'NYK', position: 'G' },
  { id: '3908809', name: 'Donovan Mitchell', teamAbbr: 'CLE', position: 'G' },
  { id: '4432166', name: 'Cade Cunningham', teamAbbr: 'DET', position: 'G' },
  { id: '3155526', name: 'Domantas Sabonis', teamAbbr: 'SAC', position: 'C' },
];

function parseMadeAttempted(raw: string): [number, number] {
  if (!raw || !raw.includes('-')) return [0, 0];
  const [m, a] = raw.split('-');
  return [Number(m) || 0, Number(a) || 0];
}

async function buildEspnFallbackMemory(seasonMode: SeasonMode): Promise<{
  dataSource: 'espn_fallback';
  teams: TeamSummary[];
  allPlayers: PlayerSummary[];
  scoreboard: ScoreboardGame[];
}> {
  const [espnStandings, scoreboard] = await Promise.all([
    fetchEspnStandingsByAbbr(seasonMode),
    fetchScoreboard(),
  ]);

  const teams: TeamSummary[] = Object.entries(NBA_TEAMS_META).map(([abbr, meta]) => {
    const st = espnStandings.get(abbr) || {};
    const wins = Number(st.wins || 0);
    const losses = Number(st.losses || 0);
    const tot = Math.max(1, wins + losses);
    const pf = Number(st.avgPointsFor || 114);
    const pa = Number(st.avgPointsAgainst || 114);
    return {
      id: meta.espnId,
      name: meta.name,
      shortName: meta.shortName,
      abbreviation: abbr,
      conference: meta.conference,
      logoUrl: st.logoUrl,
      wins,
      losses,
      winPct: Math.round((wins / tot) * 1000) / 1000,
      playoffSeed: Number(st.playoffSeed || 0),
      gamesBehind: st.gamesBehind || '-',
      streakCode: st.streak || '-',
      homeRecord: st.home || '-',
      roadRecord: st.road || '-',
      lastTenRecord: st.lasttengames || '-',
      avgPointsFor: pf,
      avgPointsAgainst: pa,
      differential: round1(pf - pa),
      games: [],
    };
  });

  const allPlayers: PlayerSummary[] = (
    await mapWithConcurrency(FALLBACK_ESPN_ATHLETES, 6, async (ath) => {
      try {
        const year = seasonMode === '2026' ? '2026' : '2027';
        const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${ath.id}/gamelog?season=${year}`;
        const data = await cachedFetchJson<Record<string, any>>(url);
        const labels: string[] = data.labels || [];
        const idx = (l: string) => labels.indexOf(l);
        const rawEvents: any[] = [];
        for (const st of data.seasonTypes || []) {
          for (const c of st.categories || []) {
            if (Array.isArray(c.events)) rawEvents.push(...c.events);
          }
        }
        const parsed = rawEvents.map((ev) => {
          const meta = data.events?.[ev.eventId] || {};
          const s = ev.stats || [];
          const [fgm, fga] = parseMadeAttempted(s[idx('FG')] || '');
          const [fg3m, fg3a] = parseMadeAttempted(s[idx('3PT')] || '');
          const [ftm, fta] = parseMadeAttempted(s[idx('FT')] || '');
          const pts = Number(s[idx('PTS')]) || 0;
          const reb = Number(s[idx('REB')]) || 0;
          const ast = Number(s[idx('AST')]) || 0;
          const stl = Number(s[idx('STL')]) || 0;
          const blk = Number(s[idx('BLK')]) || 0;
          const tov = Number(s[idx('TO')]) || 0;
          const pf = Number(s[idx('PF')]) || 0;
          const min = Number(s[idx('MIN')]) || 0;
          const tsDen = 2 * (fga + 0.44 * fta);
          return {
            eventId: String(ev.eventId),
            date: String(meta.gameDate || ''),
            seasonLabel: year === '2027' ? '2026-27' : '2025-26',
            opponentAbbr: normalizeAbbr(String(meta.opponent?.abbreviation || 'NBA')),
            opponentName: String(meta.opponent?.displayName || 'Rival'),
            isHome: String(meta.atVs || 'vs').toLowerCase() === 'vs',
            result: (String(meta.gameResult || 'W') === 'L' ? 'L' : 'W') as 'W' | 'L',
            scoreDisplay: String(meta.score || ''),
            minutes: min,
            points: pts,
            rebounds: reb,
            oreb: 0,
            dreb: reb,
            assists: ast,
            steals: stl,
            blocks: blk,
            stocks: stl + blk,
            turnovers: tov,
            fouls: pf,
            plusMinus: 0,
            fgm,
            fga,
            fgPct: Number(s[idx('FG%')]) || 0,
            fg3m,
            fg3a,
            fg3Pct: Number(s[idx('3P%')]) || 0,
            ftm,
            fta,
            ftPct: Number(s[idx('FT%')]) || 0,
            pra: pts + reb + ast,
            tsPct: tsDen > 0 ? round1((pts / tsDen) * 100) : 0,
            efgPct: fga > 0 ? round1(((fgm + 0.5 * fg3m) / fga) * 100) : 0,
            usgEst: 24,
            gameScore: round1(pts + 0.4 * fgm - 0.7 * fga + 0.5 * reb + 0.7 * ast - tov),
          };
        });
        const gamesDesc = assignRestDays(
          parsed.sort((a, b) => a.date.localeCompare(b.date))
        ).reverse();
        return {
          id: ath.id,
          name: ath.name,
          teamId: NBA_TEAMS_META[ath.teamAbbr]?.espnId || '',
          teamAbbr: ath.teamAbbr,
          teamName: NBA_TEAMS_META[ath.teamAbbr]?.name || ath.teamAbbr,
          position: ath.position,
          games: gamesDesc,
        } satisfies PlayerSummary;
      } catch {
        return null;
      }
    })
  ).filter((x): x is PlayerSummary => x !== null && x.games.length > 0);

  return {
    dataSource: 'espn_fallback',
    teams,
    allPlayers,
    scoreboard,
  };
}

async function buildBootstrapPayload(
  seasonMode: SeasonMode,
  includeAllPlayers = false,
  forceRefresh = false
): Promise<BootstrapPayload> {
  const full = await buildFullLeagueMemory(seasonMode, forceRefresh);
  const DEFAULT_ROTATION_CAP = 260;
  const players = includeAllPlayers
    ? full.allPlayers
    : full.allPlayers.slice(0, DEFAULT_ROTATION_CAP);

  return {
    seasonMode,
    dataSource: full.dataSource,
    totalLeaguePlayersAvailable: full.allPlayers.length,
    allPlayersLoaded: players.length >= full.allPlayers.length,
    generatedAt: new Date().toISOString(),
    teams: full.teams,
    players,
    scoreboard: full.scoreboard,
  };
}

/* ============================================================================
 * 4. FULL-LEAGUE (~580 PLAYERS) SEASON MILESTONES & ADVANCED COMPARATOR
 * ============================================================================ */

function computeLeagueSnapshot(
  seasonLabel: string,
  teamSlices: Array<{ team: TeamSummary; games: TeamGameLog[] }>,
  teamAdvMap?: Map<string, TeamAdvancedProfile>
): LeagueGlobalSnapshot {
  const uniqueGames = new Map<
    string,
    { homeWon: boolean; totalPts: number; margin: number }
  >();

  let entries = 0;
  let sumPts = 0;
  let sum3PM = 0;
  let sum3PA = 0;
  let sumORB = 0;
  let sumREB = 0;
  let sumAST = 0;
  let sumPace = 0;
  let sumOffRtg = 0;
  let sumEfg = 0;
  let sumTs = 0;
  let sumOrebPct = 0;
  let sumTovPct = 0;

  for (const ts of teamSlices) {
    for (const g of ts.games) {
      entries++;
      sumPts += g.pointsFor;
      sum3PM += g.fg3m;
      sum3PA += g.fg3a;
      sumORB += g.oreb;
      sumREB += g.reb;
      sumAST += g.ast;
      sumPace += g.pace;
      sumOffRtg += g.offRtg;
      sumEfg += g.efgPct;
      sumTs += g.tsPct;
      sumOrebPct += g.orebPct;
      sumTovPct += g.tovPct;

      if (!uniqueGames.has(g.eventId)) {
        const homeWon = g.isHome ? g.result === 'W' : g.result === 'L';
        uniqueGames.set(g.eventId, {
          homeWon,
          totalPts: g.totalPoints,
          margin: Math.abs(g.differential),
        });
      }
    }
  }

  const uList = Array.from(uniqueGames.values());
  const gc = uList.length;

  // Misc scoring zones from official teamAdvMap when available
  const advList = teamAdvMap ? Array.from(teamAdvMap.values()).filter((a) => a.gp > 0) : [];
  const avgAdv = (fn: (a: TeamAdvancedProfile) => number) =>
    advList.length > 0
      ? round1(advList.reduce((s, a) => s + fn(a), 0) / advList.length)
      : 0;

  return {
    seasonLabel,
    gamesCount: gc,
    avgTeamPoints: entries > 0 ? round1(sumPts / entries) : 0,
    avgTotalGamePoints:
      gc > 0 ? round1(uList.reduce((s, x) => s + x.totalPts, 0) / gc) : 0,
    avgMargin: gc > 0 ? round1(uList.reduce((s, x) => s + x.margin, 0) / gc) : 0,
    homeWinPct:
      gc > 0 ? round1((uList.filter((x) => x.homeWon).length / gc) * 100) : 0,
    closeGamesPct:
      gc > 0 ? round1((uList.filter((x) => x.margin <= 5).length / gc) * 100) : 0,
    blowoutGamesPct:
      gc > 0 ? round1((uList.filter((x) => x.margin >= 15).length / gc) * 100) : 0,
    avgTeam3PM: entries > 0 ? round1(sum3PM / entries) : 0,
    avgTeam3Pct: sum3PA > 0 ? round1((sum3PM / sum3PA) * 100) : 0,
    avgTeamORB: entries > 0 ? round1(sumORB / entries) : 0,
    avgTeamREB: entries > 0 ? round1(sumREB / entries) : 0,
    avgTeamAST: entries > 0 ? round1(sumAST / entries) : 0,
    avgPace: advList.length > 0 ? avgAdv((a) => a.pace) : entries > 0 ? round1(sumPace / entries) : 0,
    avgOffRtg: advList.length > 0 ? avgAdv((a) => a.offRtg) : entries > 0 ? round1(sumOffRtg / entries) : 0,
    avgEfgPct: entries > 0 ? round1(sumEfg / entries) : avgAdv((a) => a.efgPct),
    avgTsPct: entries > 0 ? round1(sumTs / entries) : avgAdv((a) => a.tsPct),
    avgOrebPct: entries > 0 ? round1(sumOrebPct / entries) : avgAdv((a) => a.orebPct),
    avgTovPct: entries > 0 ? round1(sumTovPct / entries) : avgAdv((a) => a.tovPct),
    avgPtsPaint: avgAdv((a) => a.ptsPaint),
    avgPts2ndChance: avgAdv((a) => a.pts2ndChance),
    avgPtsFastBreak: avgAdv((a) => a.ptsFastBreak),
  };
}

async function buildMilestonesPayload(forceRefresh = false): Promise<MilestonesPayload> {
  const cacheKey = 'milestones:v2_hybrid';
  if (!forceRefresh) {
    const cached = memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as MilestonesPayload;
    }
  }

  const [fullMem, ds27, ds26] = await Promise.all([
    buildFullLeagueMemory('continuous', forceRefresh),
    fetchNbaSeasonDataset('2026-27', forceRefresh).catch(() => null),
    fetchNbaSeasonDataset('2025-26', forceRefresh).catch(() => null),
  ]);

  const { teams, allPlayers, dataSource } = fullMem;

  const counts2027 = teams.map(
    (t) => t.games.filter((g) => g.seasonLabel === '2026-27').length
  );
  const avg2027 =
    counts2027.length > 0
      ? Math.round(counts2027.reduce((s, c) => s + c, 0) / counts2027.length)
      : 3;
  const openingN = Math.max(2, avg2027);

  const teamSlices2027 = teams.map((t) => ({
    team: t,
    games: t.games.filter((g) => g.seasonLabel === '2026-27'),
  }));
  const teamSlices2026Full = teams.map((t) => ({
    team: t,
    games: t.games.filter((g) => g.seasonLabel === '2025-26'),
  }));
  const teamSlices2026Opening = teams.map((t) => {
    const asc = [...t.games.filter((g) => g.seasonLabel === '2025-26')].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    return {
      team: t,
      games: asc.slice(0, openingN),
    };
  });

  const global2027 = computeLeagueSnapshot(
    '2026-27 (En curso)',
    teamSlices2027,
    ds27?.teamAdvByAbbr
  );
  const global2026Full = computeLeagueSnapshot(
    '2025-26 (82 PJ completa)',
    teamSlices2026Full,
    ds26?.teamAdvByAbbr
  );
  const global2026Opening = computeLeagueSnapshot(
    `2025-26 (Primeros ${openingN} PJ/equipo)`,
    teamSlices2026Opening,
    ds26?.teamAdvByAbbr
  );

  // Full 580-player game slices!
  const playerSlices = allPlayers.map((p) => {
    const g27 = p.games.filter((g) => g.seasonLabel === '2026-27');
    const g26Desc = p.games.filter((g) => g.seasonLabel === '2025-26');
    const g26Asc = [...g26Desc].sort((a, b) => a.date.localeCompare(b.date));
    return {
      player: p,
      g27,
      g26Full: g26Desc,
      g26Opening: g26Asc.slice(0, openingN),
    };
  });

  const topPlayerSingleGame = (
    sliceKey: 'g27' | 'g26Full' | 'g26Opening',
    extractor: (g: PlayerGameLog) => number
  ): SingleGamePerformance | null => {
    let best: SingleGamePerformance | null = null;
    for (const ps of playerSlices) {
      for (const g of ps[sliceKey]) {
        const val = extractor(g);
        if (!best || val > best.value) {
          best = {
            entityId: ps.player.id,
            entityName: ps.player.name,
            teamAbbr: ps.player.teamAbbr,
            value: round1(val),
            context: `${g.isHome ? 'vs' : '@'} ${g.opponentAbbr} · ${g.result}${
              g.scoreDisplay ? ` ${g.scoreDisplay}` : ''
            }`,
            date: g.date,
          };
        }
      }
    }
    return best;
  };

  const topTeamSingleGame = (
    slices: Array<{ team: TeamSummary; games: TeamGameLog[] }>,
    extractor: (g: TeamGameLog) => number
  ): SingleGamePerformance | null => {
    let best: SingleGamePerformance | null = null;
    for (const ts of slices) {
      for (const g of ts.games) {
        const val = extractor(g);
        if (!best || val > best.value) {
          best = {
            entityId: ts.team.id,
            entityName: ts.team.name,
            teamAbbr: ts.team.abbreviation,
            value: round1(val),
            context: `${g.isHome ? 'vs' : '@'} ${g.opponentAbbr} · ${g.pointsFor}-${g.pointsAgainst}`,
            date: g.date,
          };
        }
      }
    }
    return best;
  };

  const singleGameRecords: SingleGameRecordItem[] = [
    {
      metricId: 'sg-player-pts',
      metricLabel: 'Máxima puntuación de un jugador',
      category: 'player',
      unit: 'PTS',
      current2027: topPlayerSingleGame('g27', (g) => g.points),
      prev2026Full: topPlayerSingleGame('g26Full', (g) => g.points),
      prev2026Opening: topPlayerSingleGame('g26Opening', (g) => g.points),
    },
    {
      metricId: 'sg-player-gmsc',
      metricLabel: 'Mayor valoración Game Score (GmSc) en una noche',
      category: 'player',
      unit: 'GmSc',
      decimals: 1,
      current2027: topPlayerSingleGame('g27', (g) => g.gameScore),
      prev2026Full: topPlayerSingleGame('g26Full', (g) => g.gameScore),
      prev2026Opening: topPlayerSingleGame('g26Opening', (g) => g.gameScore),
    },
    {
      metricId: 'sg-player-3pm',
      metricLabel: 'Más triples anotados por un jugador',
      category: 'player',
      unit: '3PM',
      current2027: topPlayerSingleGame('g27', (g) => g.fg3m),
      prev2026Full: topPlayerSingleGame('g26Full', (g) => g.fg3m),
      prev2026Opening: topPlayerSingleGame('g26Opening', (g) => g.fg3m),
    },
    {
      metricId: 'sg-player-oreb',
      metricLabel: 'Máximos rebotes ofensivos en un partido',
      category: 'player',
      unit: 'OR',
      current2027: topPlayerSingleGame('g27', (g) => g.oreb),
      prev2026Full: topPlayerSingleGame('g26Full', (g) => g.oreb),
      prev2026Opening: topPlayerSingleGame('g26Opening', (g) => g.oreb),
    },
    {
      metricId: 'sg-player-reb',
      metricLabel: 'Máximos rebotes totales de un jugador',
      category: 'player',
      unit: 'REB',
      current2027: topPlayerSingleGame('g27', (g) => g.rebounds),
      prev2026Full: topPlayerSingleGame('g26Full', (g) => g.rebounds),
      prev2026Opening: topPlayerSingleGame('g26Opening', (g) => g.rebounds),
    },
    {
      metricId: 'sg-player-ast',
      metricLabel: 'Máximas asistencias en un partido',
      category: 'player',
      unit: 'AST',
      current2027: topPlayerSingleGame('g27', (g) => g.assists),
      prev2026Full: topPlayerSingleGame('g26Full', (g) => g.assists),
      prev2026Opening: topPlayerSingleGame('g26Opening', (g) => g.assists),
    },
    {
      metricId: 'sg-player-stocks',
      metricLabel: 'Más robos + tapones combinados (Stocks)',
      category: 'player',
      unit: 'STK',
      current2027: topPlayerSingleGame('g27', (g) => g.stocks),
      prev2026Full: topPlayerSingleGame('g26Full', (g) => g.stocks),
      prev2026Opening: topPlayerSingleGame('g26Opening', (g) => g.stocks),
    },
    {
      metricId: 'sg-player-pm',
      metricLabel: 'Mejor Más/Menos (+/-) individual en un partido',
      category: 'player',
      unit: '+/-',
      current2027: topPlayerSingleGame('g27', (g) => g.plusMinus),
      prev2026Full: topPlayerSingleGame('g26Full', (g) => g.plusMinus),
      prev2026Opening: topPlayerSingleGame('g26Opening', (g) => g.plusMinus),
    },
    {
      metricId: 'sg-team-pts',
      metricLabel: 'Máxima puntuación de un equipo',
      category: 'team',
      unit: 'PTS',
      current2027: topTeamSingleGame(teamSlices2027, (g) => g.pointsFor),
      prev2026Full: topTeamSingleGame(teamSlices2026Full, (g) => g.pointsFor),
      prev2026Opening: topTeamSingleGame(teamSlices2026Opening, (g) => g.pointsFor),
    },
    {
      metricId: 'sg-team-3pm',
      metricLabel: 'Más triples colectivos en un partido',
      category: 'team',
      unit: '3PM',
      current2027: topTeamSingleGame(teamSlices2027, (g) => g.fg3m),
      prev2026Full: topTeamSingleGame(teamSlices2026Full, (g) => g.fg3m),
      prev2026Opening: topTeamSingleGame(teamSlices2026Opening, (g) => g.fg3m),
    },
    {
      metricId: 'sg-team-margin',
      metricLabel: 'Mayor victoria / diferencial en un partido',
      category: 'team',
      unit: 'DIF',
      current2027: topTeamSingleGame(teamSlices2027, (g) => g.differential),
      prev2026Full: topTeamSingleGame(teamSlices2026Full, (g) => g.differential),
      prev2026Opening: topTeamSingleGame(teamSlices2026Opening, (g) => g.differential),
    },
    {
      metricId: 'sg-team-total',
      metricLabel: 'Partido con más puntos combinados',
      category: 'team',
      unit: 'TOT',
      current2027: topTeamSingleGame(teamSlices2027, (g) => g.totalPoints),
      prev2026Full: topTeamSingleGame(teamSlices2026Full, (g) => g.totalPoints),
      prev2026Opening: topTeamSingleGame(teamSlices2026Opening, (g) => g.totalPoints),
    },
  ];

  // Helpers for Season Leaders across all ~580 players using EXACT game logs + NBA.com Advanced/Hustle tables!
  const avgArr = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const leaderFromPlayerGames = (
    sliceKey: 'g27' | 'g26Full' | 'g26Opening',
    minGames: number,
    calc: (gs: PlayerGameLog[]) => { val: number; sec: string } | null
  ): SeasonLeaderHolder | null => {
    let best: SeasonLeaderHolder | null = null;
    for (const ps of playerSlices) {
      const gs = ps[sliceKey];
      if (gs.length < minGames) continue;
      const res = calc(gs);
      if (!res) continue;
      if (!best || res.val > best.value) {
        best = {
          entityId: ps.player.id,
          entityName: ps.player.name,
          teamAbbr: ps.player.teamAbbr,
          value: round1(res.val),
          secondaryLabel: res.sec,
        };
      }
    }
    return best;
  };

  const leaderFromTeamGames = (
    slices: Array<{ team: TeamSummary; games: TeamGameLog[] }>,
    calc: (gs: TeamGameLog[]) => { val: number; sec: string } | null,
    lowerIsBetter = false
  ): SeasonLeaderHolder | null => {
    let best: SeasonLeaderHolder | null = null;
    for (const ts of slices) {
      if (ts.games.length === 0) continue;
      const res = calc(ts.games);
      if (!res) continue;
      const isBetter =
        !best || (lowerIsBetter ? res.val < best.value : res.val > best.value);
      if (isBetter) {
        best = {
          entityId: ts.team.id,
          entityName: ts.team.name,
          teamAbbr: ts.team.abbreviation,
          value: round1(res.val),
          secondaryLabel: res.sec,
        };
      }
    }
    return best;
  };

  const leaderFromPlayerAdv = (
    advMap: Map<string, PlayerAdvancedProfile> | undefined,
    minGp: number,
    minMinutesAvg: number,
    sliceKey: 'g27' | 'g26Full',
    extract: (a: PlayerAdvancedProfile) => { val: number; sec: string } | null
  ): SeasonLeaderHolder | null => {
    if (!advMap) return null;
    let best: SeasonLeaderHolder | null = null;
    for (const ps of playerSlices) {
      const a = advMap.get(ps.player.id);
      if (!a || a.gp < minGp) continue;
      const gs = ps[sliceKey];
      const minAvg = gs.length > 0 ? avgArr(gs.map((g) => g.minutes)) : 25;
      if (minAvg < minMinutesAvg) continue;
      const res = extract(a);
      if (!res) continue;
      if (!best || res.val > best.value) {
        best = {
          entityId: ps.player.id,
          entityName: ps.player.name,
          teamAbbr: ps.player.teamAbbr,
          value: round1(res.val),
          secondaryLabel: res.sec,
        };
      }
    }
    return best;
  };

  const leaderFromTeamAdv = (
    advMap: Map<string, TeamAdvancedProfile> | undefined,
    extract: (a: TeamAdvancedProfile) => { val: number; sec: string } | null,
    lowerIsBetter = false
  ): SeasonLeaderHolder | null => {
    if (!advMap) return null;
    let best: SeasonLeaderHolder | null = null;
    for (const t of teams) {
      const a = advMap.get(t.abbreviation);
      if (!a || a.gp === 0) continue;
      const res = extract(a);
      if (!res) continue;
      const isBetter =
        !best || (lowerIsBetter ? res.val < best.value : res.val > best.value);
      if (isBetter) {
        best = {
          entityId: t.id,
          entityName: t.name,
          teamAbbr: t.abbreviation,
          value: round1(res.val),
          secondaryLabel: res.sec,
        };
      }
    }
    return best;
  };

  const countTD3 = (gs: PlayerGameLog[]) =>
    gs.filter(
      (g) =>
        [g.points, g.rebounds, g.assists, g.blocks, g.steals].filter((v) => v >= 10)
          .length >= 3
    ).length;

  const countDD2 = (gs: PlayerGameLog[]) =>
    gs.filter(
      (g) =>
        [g.points, g.rebounds, g.assists, g.blocks, g.steals].filter((v) => v >= 10)
          .length >= 2
    ).length;

  const seasonLeaders: SeasonLeaderMilestoneItem[] = [
    // --- REBOUNDING ---
    {
      metricId: 'sl-player-orb-avg',
      metricLabel: 'Máximos rebotes ofensivos / PJ (Jugador)',
      group: 'rebounding',
      entityType: 'player',
      unit: 'OR/PJ',
      decimals: 1,
      current2027: leaderFromPlayerGames('g27', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.oreb)),
        sec: `${gs.reduce((s, g) => s + g.oreb, 0)} OR totales · ${gs.length} PJ`,
      })),
      prev2026Full: leaderFromPlayerGames('g26Full', 45, (gs) => ({
        val: avgArr(gs.map((g) => g.oreb)),
        sec: `${gs.reduce((s, g) => s + g.oreb, 0)} OR totales · ${gs.length} PJ`,
      })),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.oreb)),
        sec: `${gs.reduce((s, g) => s + g.oreb, 0)} OR en primeros ${gs.length} PJ`,
      })),
    },
    {
      metricId: 'sl-player-orb-tot',
      metricLabel: 'Más rebotes ofensivos acumulados (Jugador)',
      group: 'rebounding',
      entityType: 'player',
      unit: 'OR',
      decimals: 0,
      isCumulativeTotal: true,
      current2027: leaderFromPlayerGames('g27', 1, (gs) => ({
        val: gs.reduce((s, g) => s + g.oreb, 0),
        sec: `${avgArr(gs.map((g) => g.oreb)).toFixed(1)} OR/PJ · ${gs.length} PJ`,
      })),
      prev2026Full: leaderFromPlayerGames('g26Full', 20, (gs) => ({
        val: gs.reduce((s, g) => s + g.oreb, 0),
        sec: `${avgArr(gs.map((g) => g.oreb)).toFixed(1)} OR/PJ · ${gs.length} PJ`,
      })),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 1, (gs) => ({
        val: gs.reduce((s, g) => s + g.oreb, 0),
        sec: `Primeros ${gs.length} PJ de 25-26`,
      })),
    },
    {
      metricId: 'sl-team-orb-avg',
      metricLabel: 'Equipo con más rebotes ofensivos / PJ',
      group: 'rebounding',
      entityType: 'team',
      unit: 'OR/PJ',
      decimals: 1,
      current2027: leaderFromTeamGames(teamSlices2027, (gs) => ({
        val: avgArr(gs.map((g) => g.oreb)),
        sec: `${avgArr(gs.map((g) => g.orebPct)).toFixed(1)}% OREB% · ${gs.length} PJ`,
      })),
      prev2026Full: leaderFromTeamGames(teamSlices2026Full, (gs) => ({
        val: avgArr(gs.map((g) => g.oreb)),
        sec: `${avgArr(gs.map((g) => g.orebPct)).toFixed(1)}% OREB% · ${gs.length} PJ`,
      })),
      prev2026Opening: leaderFromTeamGames(teamSlices2026Opening, (gs) => ({
        val: avgArr(gs.map((g) => g.oreb)),
        sec: `Primeros ${gs.length} PJ de 25-26`,
      })),
    },
    {
      metricId: 'sl-player-reb-avg',
      metricLabel: 'Líder en rebotes totales / PJ (Jugador)',
      group: 'rebounding',
      entityType: 'player',
      unit: 'REB/PJ',
      decimals: 1,
      current2027: leaderFromPlayerGames('g27', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.rebounds)),
        sec: `${avgArr(gs.map((g) => g.oreb)).toFixed(1)} OR/PJ · ${gs.length} PJ`,
      })),
      prev2026Full: leaderFromPlayerGames('g26Full', 45, (gs) => ({
        val: avgArr(gs.map((g) => g.rebounds)),
        sec: `${avgArr(gs.map((g) => g.oreb)).toFixed(1)} OR/PJ · ${gs.length} PJ`,
      })),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.rebounds)),
        sec: `Primeros ${gs.length} PJ de 25-26`,
      })),
    },

    // --- SHOOTING & SCORING ---
    {
      metricId: 'sl-player-pts-avg',
      metricLabel: 'Líder de anotación / PJ (Jugador)',
      group: 'shooting_scoring',
      entityType: 'player',
      unit: 'PTS/PJ',
      decimals: 1,
      current2027: leaderFromPlayerGames('g27', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.points)),
        sec: `${avgArr(gs.map((g) => g.tsPct)).toFixed(1)}% TS · ${gs.length} PJ`,
      })),
      prev2026Full: leaderFromPlayerGames('g26Full', 45, (gs) => ({
        val: avgArr(gs.map((g) => g.points)),
        sec: `${avgArr(gs.map((g) => g.tsPct)).toFixed(1)}% TS · ${gs.length} PJ`,
      })),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.points)),
        sec: `Primeros ${gs.length} PJ de 25-26`,
      })),
    },
    {
      metricId: 'sl-player-3pm-avg',
      metricLabel: 'Más triples anotados / PJ (Jugador)',
      group: 'shooting_scoring',
      entityType: 'player',
      unit: '3PM/PJ',
      decimals: 1,
      current2027: leaderFromPlayerGames('g27', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.fg3m)),
        sec: `${gs.reduce((s, g) => s + g.fg3m, 0)} triples · ${gs.length} PJ`,
      })),
      prev2026Full: leaderFromPlayerGames('g26Full', 45, (gs) => ({
        val: avgArr(gs.map((g) => g.fg3m)),
        sec: `${gs.reduce((s, g) => s + g.fg3m, 0)} triples · ${gs.length} PJ`,
      })),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.fg3m)),
        sec: `${gs.reduce((s, g) => s + g.fg3m, 0)} triples en ${gs.length} PJ`,
      })),
    },
    {
      metricId: 'sl-player-3pm-tot',
      metricLabel: 'Más triples totales acumulados (Jugador)',
      group: 'shooting_scoring',
      entityType: 'player',
      unit: '3PM',
      decimals: 0,
      isCumulativeTotal: true,
      current2027: leaderFromPlayerGames('g27', 1, (gs) => ({
        val: gs.reduce((s, g) => s + g.fg3m, 0),
        sec: `${avgArr(gs.map((g) => g.fg3m)).toFixed(1)} por PJ · ${gs.length} PJ`,
      })),
      prev2026Full: leaderFromPlayerGames('g26Full', 20, (gs) => ({
        val: gs.reduce((s, g) => s + g.fg3m, 0),
        sec: `${avgArr(gs.map((g) => g.fg3m)).toFixed(1)} por PJ · ${gs.length} PJ`,
      })),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 1, (gs) => ({
        val: gs.reduce((s, g) => s + g.fg3m, 0),
        sec: `Primeros ${gs.length} PJ de 25-26`,
      })),
    },
    {
      metricId: 'sl-team-3pm-avg',
      metricLabel: 'Equipo con más triples anotados / PJ',
      group: 'shooting_scoring',
      entityType: 'team',
      unit: '3PM/PJ',
      decimals: 1,
      current2027: leaderFromTeamGames(teamSlices2027, (gs) => {
        const m = gs.reduce((s, g) => s + g.fg3m, 0);
        const a = Math.max(1, gs.reduce((s, g) => s + g.fg3a, 0));
        return {
          val: m / gs.length,
          sec: `${((m / a) * 100).toFixed(1)}% acierto 3P · ${gs.length} PJ`,
        };
      }),
      prev2026Full: leaderFromTeamGames(teamSlices2026Full, (gs) => {
        const m = gs.reduce((s, g) => s + g.fg3m, 0);
        const a = Math.max(1, gs.reduce((s, g) => s + g.fg3a, 0));
        return {
          val: m / gs.length,
          sec: `${((m / a) * 100).toFixed(1)}% acierto 3P · ${m} totales`,
        };
      }),
      prev2026Opening: leaderFromTeamGames(teamSlices2026Opening, (gs) => {
        const m = gs.reduce((s, g) => s + g.fg3m, 0);
        return {
          val: m / gs.length,
          sec: `Primeros ${gs.length} PJ de 25-26`,
        };
      }),
    },

    // --- PLAYMAKING & ALL-AROUND ---
    {
      metricId: 'sl-player-ast-avg',
      metricLabel: 'Líder en asistencias / PJ (Jugador)',
      group: 'playmaking_allaround',
      entityType: 'player',
      unit: 'AST/PJ',
      decimals: 1,
      current2027: leaderFromPlayerGames('g27', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.assists)),
        sec: `${avgArr(gs.map((g) => g.turnovers)).toFixed(1)} PER/PJ · ${gs.length} PJ`,
      })),
      prev2026Full: leaderFromPlayerGames('g26Full', 45, (gs) => ({
        val: avgArr(gs.map((g) => g.assists)),
        sec: `${avgArr(gs.map((g) => g.turnovers)).toFixed(1)} PER/PJ · ${gs.length} PJ`,
      })),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.assists)),
        sec: `Primeros ${gs.length} PJ de 25-26`,
      })),
    },
    {
      metricId: 'sl-player-blk-avg',
      metricLabel: 'Líder en tapones / PJ (Jugador)',
      group: 'playmaking_allaround',
      entityType: 'player',
      unit: 'TAP/PJ',
      decimals: 1,
      current2027: leaderFromPlayerGames('g27', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.blocks)),
        sec: `${gs.reduce((s, g) => s + g.blocks, 0)} tapones · ${gs.length} PJ`,
      })),
      prev2026Full: leaderFromPlayerGames('g26Full', 45, (gs) => ({
        val: avgArr(gs.map((g) => g.blocks)),
        sec: `${gs.reduce((s, g) => s + g.blocks, 0)} tapones · ${gs.length} PJ`,
      })),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 2, (gs) => ({
        val: avgArr(gs.map((g) => g.blocks)),
        sec: `Primeros ${gs.length} PJ de 25-26`,
      })),
    },
    {
      metricId: 'sl-player-td3',
      metricLabel: 'Más Triples-Dobles logrados (TD3)',
      group: 'playmaking_allaround',
      entityType: 'player',
      unit: 'TD3',
      decimals: 0,
      isCumulativeTotal: true,
      current2027: leaderFromPlayerGames('g27', 1, (gs) => ({
        val: countTD3(gs),
        sec: `${countDD2(gs)} dobles-dobles · ${gs.length} PJ`,
      })),
      prev2026Full: leaderFromPlayerGames('g26Full', 15, (gs) => ({
        val: countTD3(gs),
        sec: `${countDD2(gs)} dobles-dobles · ${gs.length} PJ`,
      })),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 1, (gs) => ({
        val: countTD3(gs),
        sec: `Primeros ${gs.length} PJ de 25-26`,
      })),
    },

    // --- ADVANCED, ZONES & HUSTLE (NBA.COM OFFICIAL) ---
    {
      metricId: 'sl-player-usg',
      metricLabel: 'Mayor Uso Ofensivo de balón (USG% Jugador)',
      group: 'advanced_hustle',
      entityType: 'player',
      unit: '%',
      decimals: 1,
      current2027: leaderFromPlayerAdv(ds27?.playerAdvById, 2, 24, 'g27', (a) => ({
        val: a.usgPct,
        sec: `${a.tsPct.toFixed(1)}% TS · ${a.gp} PJ`,
      })),
      prev2026Full: leaderFromPlayerAdv(
        ds26?.playerAdvById,
        45,
        24,
        'g26Full',
        (a) => ({
          val: a.usgPct,
          sec: `${a.tsPct.toFixed(1)}% TS · ${a.gp} PJ`,
        })
      ),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 2, (gs) =>
        avgArr(gs.map((g) => g.minutes)) >= 24
          ? {
              val: avgArr(gs.map((g) => g.usgEst)),
              sec: `Primeros ${gs.length} PJ de 25-26`,
            }
          : null
      ),
    },
    {
      metricId: 'sl-player-pie',
      metricLabel: 'Mayor Impacto Global NBA (PIE Jugador)',
      group: 'advanced_hustle',
      entityType: 'player',
      unit: '%',
      decimals: 1,
      current2027: leaderFromPlayerAdv(ds27?.playerAdvById, 2, 24, 'g27', (a) => ({
        val: a.pie,
        sec: `NetRtg ${a.netRtg >= 0 ? '+' : ''}${a.netRtg.toFixed(1)} · ${a.gp} PJ`,
      })),
      prev2026Full: leaderFromPlayerAdv(
        ds26?.playerAdvById,
        45,
        24,
        'g26Full',
        (a) => ({
          val: a.pie,
          sec: `NetRtg ${a.netRtg >= 0 ? '+' : ''}${a.netRtg.toFixed(1)} · ${a.gp} PJ`,
        })
      ),
      prev2026Opening: leaderFromPlayerAdv(
        ds26?.playerAdvById,
        45,
        24,
        'g26Full',
        (a) => ({
          val: a.pie,
          sec: `Referencia base 25-26`,
        })
      ),
    },
    {
      metricId: 'sl-player-ts',
      metricLabel: 'Líder en Tiro Verdadero (TS% · ≥15 PTS/PJ)',
      group: 'advanced_hustle',
      entityType: 'player',
      unit: '%',
      decimals: 1,
      current2027: leaderFromPlayerGames('g27', 2, (gs) =>
        avgArr(gs.map((g) => g.points)) >= 15
          ? {
              val: avgArr(gs.map((g) => g.tsPct)),
              sec: `${avgArr(gs.map((g) => g.points)).toFixed(1)} PTS/PJ · ${gs.length} PJ`,
            }
          : null
      ),
      prev2026Full: leaderFromPlayerGames('g26Full', 45, (gs) =>
        avgArr(gs.map((g) => g.points)) >= 15
          ? {
              val: avgArr(gs.map((g) => g.tsPct)),
              sec: `${avgArr(gs.map((g) => g.points)).toFixed(1)} PTS/PJ · ${gs.length} PJ`,
            }
          : null
      ),
      prev2026Opening: leaderFromPlayerGames('g26Opening', 2, (gs) =>
        avgArr(gs.map((g) => g.points)) >= 15
          ? {
              val: avgArr(gs.map((g) => g.tsPct)),
              sec: `Primeros ${gs.length} PJ de 25-26`,
            }
          : null
      ),
    },
    {
      metricId: 'sl-player-paint',
      metricLabel: 'Más puntos en la pintura / PJ (Jugador)',
      group: 'advanced_hustle',
      entityType: 'player',
      unit: 'PINT/PJ',
      decimals: 1,
      current2027: leaderFromPlayerAdv(ds27?.playerAdvById, 2, 20, 'g27', (a) => ({
        val: a.ptsPaint,
        sec: `${a.pts2ndChance.toFixed(1)} pts 2ª jugada · ${a.gp} PJ`,
      })),
      prev2026Full: leaderFromPlayerAdv(
        ds26?.playerAdvById,
        45,
        20,
        'g26Full',
        (a) => ({
          val: a.ptsPaint,
          sec: `${a.pts2ndChance.toFixed(1)} pts 2ª jugada · ${a.gp} PJ`,
        })
      ),
      prev2026Opening: leaderFromPlayerAdv(
        ds26?.playerAdvById,
        45,
        20,
        'g26Full',
        (a) => ({
          val: a.ptsPaint,
          sec: `Referencia base 25-26`,
        })
      ),
    },
    {
      metricId: 'sl-player-defl',
      metricLabel: 'Líder en desvíos defensivos (Deflections / PJ)',
      group: 'advanced_hustle',
      entityType: 'player',
      unit: 'DEFL/PJ',
      decimals: 1,
      current2027: leaderFromPlayerAdv(ds27?.playerAdvById, 2, 18, 'g27', (a) => ({
        val: a.deflections,
        sec: `${a.looseBalls.toFixed(1)} balones divididos · ${a.gp} PJ`,
      })),
      prev2026Full: leaderFromPlayerAdv(
        ds26?.playerAdvById,
        45,
        18,
        'g26Full',
        (a) => ({
          val: a.deflections,
          sec: `${a.looseBalls.toFixed(1)} balones divididos · ${a.gp} PJ`,
        })
      ),
      prev2026Opening: leaderFromPlayerAdv(
        ds26?.playerAdvById,
        45,
        18,
        'g26Full',
        (a) => ({
          val: a.deflections,
          sec: `Referencia base 25-26`,
        })
      ),
    },
    {
      metricId: 'sl-team-netrtg',
      metricLabel: 'Mejor Net Rating colectivo (Pts / 100 pos.)',
      group: 'advanced_hustle',
      entityType: 'team',
      unit: 'NetRtg',
      decimals: 1,
      current2027:
        leaderFromTeamAdv(ds27?.teamAdvByAbbr, (a) => ({
          val: a.netRtg,
          sec: `Off ${a.offRtg.toFixed(1)} · Def ${a.defRtg.toFixed(1)}`,
        })) ||
        leaderFromTeamGames(teamSlices2027, (gs) => ({
          val: avgArr(gs.map((g) => g.netRtg)),
          sec: `${gs.length} PJ`,
        })),
      prev2026Full:
        leaderFromTeamAdv(ds26?.teamAdvByAbbr, (a) => ({
          val: a.netRtg,
          sec: `Off ${a.offRtg.toFixed(1)} · Def ${a.defRtg.toFixed(1)}`,
        })) ||
        leaderFromTeamGames(teamSlices2026Full, (gs) => ({
          val: avgArr(gs.map((g) => g.netRtg)),
          sec: `${gs.length} PJ`,
        })),
      prev2026Opening: leaderFromTeamGames(teamSlices2026Opening, (gs) => ({
        val: avgArr(gs.map((g) => g.netRtg)),
        sec: `Primeros ${gs.length} PJ de 25-26`,
      })),
    },
    {
      metricId: 'sl-team-defrtg',
      metricLabel: 'Mejor Eficiencia Defensiva (DefRtg · menor es mejor)',
      group: 'advanced_hustle',
      entityType: 'team',
      unit: 'DefRtg',
      decimals: 1,
      lowerIsBetter: true,
      current2027: leaderFromTeamAdv(
        ds27?.teamAdvByAbbr,
        (a) => ({
          val: a.defRtg,
          sec: `${a.contestedShots.toFixed(1)} tiros punteados/PJ`,
        }),
        true
      ),
      prev2026Full: leaderFromTeamAdv(
        ds26?.teamAdvByAbbr,
        (a) => ({
          val: a.defRtg,
          sec: `${a.contestedShots.toFixed(1)} tiros punteados/PJ`,
        }),
        true
      ),
      prev2026Opening: leaderFromTeamGames(
        teamSlices2026Opening,
        (gs) => ({
          val: avgArr(gs.map((g) => g.defRtg)),
          sec: `Primeros ${gs.length} PJ de 25-26`,
        }),
        true
      ),
    },
    {
      metricId: 'sl-team-pace',
      metricLabel: 'Equipo con ritmo más rápido (Pace pos./48m)',
      group: 'advanced_hustle',
      entityType: 'team',
      unit: 'POS',
      decimals: 1,
      current2027: leaderFromTeamAdv(ds27?.teamAdvByAbbr, (a) => ({
        val: a.pace,
        sec: `${a.ptsFastBreak.toFixed(1)} pts contraataque/PJ`,
      })),
      prev2026Full: leaderFromTeamAdv(ds26?.teamAdvByAbbr, (a) => ({
        val: a.pace,
        sec: `${a.ptsFastBreak.toFixed(1)} pts contraataque/PJ`,
      })),
      prev2026Opening: leaderFromTeamGames(teamSlices2026Opening, (gs) => ({
        val: avgArr(gs.map((g) => g.pace)),
        sec: `Primeros ${gs.length} PJ de 25-26`,
      })),
    },
  ];

  const payload: MilestonesPayload = {
    generatedAt: new Date().toISOString(),
    dataSource,
    totalPlayersScanned: allPlayers.length,
    openingGamesPerTeam: openingN,
    global2027,
    global2026Full,
    global2026Opening,
    singleGameRecords,
    seasonLeaders,
  };

  memoryCache.set(cacheKey, {
    expiresAt: Date.now() + 20 * 60 * 1000,
    data: payload,
  });

  return payload;
}

/* ============================================================================
 * 4B. FASE 1 — ANALIZADOR INTEGRAL DE JORNADAS NBA (0 EXTRA REQUESTS)
 * ============================================================================ */

function avgNums(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function sdNums(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = avgNums(vals);
  const variance = vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length;
  return Math.sqrt(variance);
}

function buildTacticalMatchupTakeaways(
  winner: GameDayMatchupTeamSide,
  loser: GameDayMatchupTeamSide,
  margin: number,
  pace: number
): { simple: string[]; advanced: string[] } {
  const candidates: Array<{
    weight: number;
    simple: string;
    advanced: string;
  }> = [];

  const efgDiff = winner.efgPct - loser.efgPct;
  if (efgDiff >= 2.5) {
    candidates.push({
      weight: efgDiff * 1.45,
      simple: `${winner.abbr} marcó diferencias con su puntería en juego (${winner.efgPct.toFixed(
        1
      )}% de acierto efectivo frente al ${loser.efgPct.toFixed(1)}% de ${loser.abbr}).`,
      advanced: ` Factor Tiro Efectivo: ${winner.abbr} dominó con ${winner.efgPct.toFixed(
        1
      )}% eFG (${winner.tsPct.toFixed(1)}% TS) frente al ${loser.efgPct.toFixed(
        1
      )}% eFG de ${loser.abbr}.`.trim(),
    });
  }

  const fg3Diff = winner.fg3m - loser.fg3m;
  if (fg3Diff >= 3 || (winner.fg3m >= 15 && winner.fg3Pct >= 39)) {
    const pts3Diff = fg3Diff * 3;
    candidates.push({
      weight: Math.max(4, fg3Diff * 1.6 + (winner.fg3Pct - loser.fg3Pct) * 0.25),
      simple:
        pts3Diff > 0
          ? `Bombardeo exterior: ${winner.abbr} convirtió ${winner.fg3m} triples (${winner.fg3Pct.toFixed(
              0
            )}%) por ${loser.fg3m} de ${loser.abbr} (+${pts3Diff} pts desde el perímetro).`
          : `Acierto letal desde el arco: ${winner.abbr} encestó ${winner.fg3m} triples al ${winner.fg3Pct.toFixed(
              1
            )}% de efectividad.`,
      advanced: `Diferencial perimetral: ${winner.fg3m}/${winner.fg3a} T3 (${winner.fg3Pct.toFixed(
        1
      )}%) de ${winner.abbr} vs ${loser.fg3m}/${loser.fg3a} (${loser.fg3Pct.toFixed(
        1
      )}%) de ${loser.abbr}${pts3Diff > 0 ? ` [+${pts3Diff} PTS]` : ''}.`,
    });
  }

  const tovDiff = loser.tov - winner.tov;
  if (tovDiff >= 3) {
    candidates.push({
      weight: tovDiff * 1.75,
      simple: `Batalla de errores: la defensa de ${winner.abbr} provocó ${loser.tov} pérdidas rivales cometiendo solo ${winner.tov}.`,
      advanced: `Control de posesiones (TOV%): ${winner.abbr} minimizó pérdidas (${winner.tov} PER · ${winner.tovPct.toFixed(
        1
      )}%) castigando las ${loser.tov} entregas (${loser.tovPct.toFixed(1)}% TOV) de ${loser.abbr}.`,
    });
  }

  const orebDiff = winner.oreb - loser.oreb;
  if (orebDiff >= 3 || winner.orebPct >= 30) {
    candidates.push({
      weight: Math.max(4.5, orebDiff * 1.4 + (winner.orebPct - 25) * 0.4),
      simple: `Dominio de los tableros: ${winner.abbr} capturó ${winner.oreb} rebotes en ataque (${winner.reb}-${loser.reb} en rebotes totales) generando segundas opciones.`,
      advanced: `Carga del cristal ofensivo: ${winner.abbr} firmó un ${winner.orebPct.toFixed(
        1
      )}% OREB (${winner.oreb} OR vs ${loser.oreb} OR; global ${winner.reb}-${loser.reb} REB).`,
    });
  }

  const ftDiff = winner.ftm - loser.ftm;
  if (ftDiff >= 6) {
    candidates.push({
      weight: ftDiff * 1.15,
      simple: `Castigo constante en falta: ${winner.abbr} sumó ${winner.ftm} puntos desde el tiro libre frente a los ${loser.ftm} de ${loser.abbr}.`,
      advanced: `Presión al aro y línea de personal: ${winner.ftm}/${winner.fta} TL de ${winner.abbr} frente a ${loser.ftm}/${loser.fta} TL de ${loser.abbr} (+${ftDiff} PTS libres).`,
    });
  }

  candidates.sort((a, b) => b.weight - a.weight);

  const simpleOut = candidates.slice(0, 2).map((c) => c.simple);
  const advOut = candidates.slice(0, 2).map((c) => c.advanced);

  if (margin <= 5) {
    const hero = winner.topPlayer;
    const clutchSimple = hero
      ? `Desenlace al límite (+${margin}): ${hero.playerName} (${hero.points} PTS, ${hero.assists} AST) lideró a ${winner.abbr} en los minutos calientes.`
      : `Final de máxima igualdad decidido por detalles en las últimas posesiones (+${margin} para ${winner.abbr}).`;
    const clutchAdv = hero
      ? `Cierre Clutch (+${margin} · Pace ${pace.toFixed(1)}): ${hero.playerName} sostuvo el ataque ganador con ${hero.points} PTS (${hero.tsPct.toFixed(
          1
        )}% TS · GmSc ${hero.gameScore.toFixed(1)}).`
      : `Cierre igualado (+${margin} · NetRtg ${winner.netRtg > 0 ? '+' : ''}${winner.netRtg.toFixed(
          1
        )} en ${pace.toFixed(1)} posesiones/48m).`;

    if (simpleOut.length >= 2) {
      simpleOut[1] = clutchSimple;
      advOut[1] = clutchAdv;
    } else {
      simpleOut.push(clutchSimple);
      advOut.push(clutchAdv);
    }
  }

  while (simpleOut.length < 2) {
    if (simpleOut.length === 0) {
      simpleOut.push(
        `${winner.abbr} impuso su ritmo colectivo (${winner.ast} asistencias) para superar a ${loser.abbr} por ${margin} puntos.`
      );
      advOut.push(
        `Eficiencia colectiva superior de ${winner.abbr}: ${winner.offRtg.toFixed(
          1
        )} OffRtg vs ${winner.defRtg.toFixed(1)} DefRtg (NetRtg +${Math.abs(
          winner.netRtg
        ).toFixed(1)}).`
      );
    } else {
      const hero = winner.topPlayer;
      simpleOut.push(
        hero
          ? `${hero.playerName} encabezó la victoria con ${hero.points} puntos, ${hero.rebounds} rebotes y ${hero.assists} asistencias.`
          : `Ritmo de ${pace.toFixed(0)} posesiones controlado de principio a fin por la rotación de ${winner.abbr}.`
      );
      advOut.push(
        hero
          ? `Referente individual: ${hero.playerName} registró ${hero.gameScore.toFixed(
              1
            )} GmSc (${hero.points}P/${hero.rebounds}R/${hero.assists}A · ${hero.tsPct.toFixed(
              1
            )}% TS).`
          : `Ritmo del choque: ${pace.toFixed(1)} Pace con ${winner.ast} AST y ${winner.efgPct.toFixed(
              1
            )}% eFG ganador.`
      );
    }
  }

  return { simple: simpleOut.slice(0, 2), advanced: advOut.slice(0, 2) };
}

async function buildGameDayPayload(
  requestedDate?: string,
  forceRefresh = false
): Promise<GameDayPayload> {
  const fullMem = await buildFullLeagueMemory('continuous', forceRefresh);
  const { teams, allPlayers, scoreboard, dataSource } = fullMem;

  // 1. Index all available NBA dates across loaded seasons (newest first)
  const dateEventsMap = new Map<
    string,
    { seasonLabel: string; eventIds: Set<string> }
  >();

  let allTeamEntriesCount = 0;
  let allUniqueLeagueGamesTotalPts = 0;
  const seenLeagueEvents = new Set<string>();

  for (const t of teams) {
    for (const g of t.games) {
      const d = g.date.slice(0, 10);
      if (!d || d.length < 10) continue;
      allTeamEntriesCount++;
      const entry = dateEventsMap.get(d) || {
        seasonLabel: g.seasonLabel,
        eventIds: new Set<string>(),
      };
      entry.eventIds.add(g.eventId);
      dateEventsMap.set(d, entry);

      if (!seenLeagueEvents.has(g.eventId)) {
        seenLeagueEvents.add(g.eventId);
        allUniqueLeagueGamesTotalPts += g.totalPoints;
      }
    }
  }

  // Fallback date indexing from players if team logs were ever empty
  if (dateEventsMap.size === 0) {
    for (const p of allPlayers) {
      for (const g of p.games) {
        const d = g.date.slice(0, 10);
        if (!d || d.length < 10) continue;
        const entry = dateEventsMap.get(d) || {
          seasonLabel: g.seasonLabel,
          eventIds: new Set<string>(),
        };
        entry.eventIds.add(g.eventId);
        dateEventsMap.set(d, entry);
      }
    }
  }

  const availableDates: GameDayDateOption[] = Array.from(dateEventsMap.entries())
    .map(([date, info]) => ({
      date,
      seasonLabel: info.seasonLabel,
      gamesCount: info.eventIds.size,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const cleanReq = (requestedDate || '').trim().slice(0, 10);
  const selectedDate =
    cleanReq && dateEventsMap.has(cleanReq)
      ? cleanReq
      : availableDates[0]?.date || new Date().toISOString().slice(0, 10);

  const gamedayCacheKey = `gameday_v1:${selectedDate}`;
  if (!forceRefresh) {
    const cached = memoryCache.get(gamedayCacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as GameDayPayload;
    }
  }

  const selectedSeasonLabel =
    dateEventsMap.get(selectedDate)?.seasonLabel || '2026-27';

  const leagueAvgTotalPoints =
    seenLeagueEvents.size > 0
      ? round1(allUniqueLeagueGamesTotalPts / seenLeagueEvents.size)
      : allTeamEntriesCount > 0
      ? 228.4
      : 228.4;

  // 2. Collect all player performances on `selectedDate` + compute single-night anomalies, role shifts, and streaks
  const playersByEventId = new Map<string, Array<{ player: PlayerSummary; game: PlayerGameLog; line: GameDayPlayerLine }>>();
  const allNightLines: GameDayPlayerLine[] = [];
  const explosions: GameDayOutlierItem[] = [];
  const slumps: GameDayOutlierItem[] = [];
  const roleShifts: Array<GameDayRoleShiftItem & { _rankScore: number }> = [];
  const streakShifts: GameDayStreakShiftItem[] = [];

  for (const p of allPlayers) {
    const gNight = p.games.find((g) => g.date.slice(0, 10) === selectedDate);
    if (!gNight) continue;

    // Historical baseline excluding tonight (prefer games strictly before selectedDate if >= 6, else continuous excluding tonight)
    const strictlyPrior = p.games.filter(
      (g) => g.eventId !== gNight.eventId && g.date.slice(0, 10) < selectedDate
    );
    const baselinePool =
      strictlyPrior.length >= 6
        ? strictlyPrior
        : p.games.filter((g) => g.eventId !== gNight.eventId);

    const ptsAvg =
      baselinePool.length > 0
        ? round1(avgNums(baselinePool.map((g) => g.points)))
        : gNight.points;
    const gmScAvg =
      baselinePool.length > 0
        ? round1(avgNums(baselinePool.map((g) => g.gameScore)))
        : gNight.gameScore;
    const minAvg =
      baselinePool.length > 0
        ? round1(avgNums(baselinePool.map((g) => g.minutes)))
        : gNight.minutes;
    const usgAvg =
      baselinePool.length > 0
        ? round1(avgNums(baselinePool.map((g) => g.usgEst)))
        : gNight.usgEst;
    const fgaAvg =
      baselinePool.length > 0
        ? round1(avgNums(baselinePool.map((g) => g.fga)))
        : gNight.fga;

    const totalBasePts = baselinePool.reduce((s, g) => s + g.points, 0);
    const totalBaseFga = baselinePool.reduce((s, g) => s + g.fga, 0);
    const totalBaseFta = baselinePool.reduce((s, g) => s + g.fta, 0);
    const baseTsDenom = 2 * (totalBaseFga + 0.44 * totalBaseFta);
    const tsAvg =
      baseTsDenom > 0 ? round1((totalBasePts / baseTsDenom) * 100) : gNight.tsPct;

    const ptsDelta = round1(gNight.points - ptsAvg);
    const minDelta = round1(gNight.minutes - minAvg);
    const usgDelta = round1(gNight.usgEst - usgAvg);

    const line: GameDayPlayerLine = {
      playerId: p.id,
      playerName: p.name,
      teamAbbr: p.teamAbbr,
      position: p.position,
      opponentAbbr: gNight.opponentAbbr,
      isHome: gNight.isHome,
      result: gNight.result,
      minutes: round1(gNight.minutes),
      points: gNight.points,
      rebounds: gNight.rebounds,
      oreb: gNight.oreb,
      assists: gNight.assists,
      steals: gNight.steals,
      blocks: gNight.blocks,
      stocks: gNight.stocks,
      turnovers: gNight.turnovers,
      fgm: gNight.fgm,
      fga: gNight.fga,
      fg3m: gNight.fg3m,
      fg3a: gNight.fg3a,
      ftm: gNight.ftm,
      fta: gNight.fta,
      plusMinus: gNight.plusMinus,
      tsPct: gNight.tsPct,
      efgPct: gNight.efgPct,
      usgEst: gNight.usgEst,
      gameScore: gNight.gameScore,
      ptsBaselineAvg: ptsAvg,
      ptsDelta,
      gmScBaselineAvg: gmScAvg,
    };

    allNightLines.push(line);
    const evList = playersByEventId.get(gNight.eventId) || [];
    evList.push({ player: p, game: gNight, line });
    playersByEventId.set(gNight.eventId, evList);

    // Single-night Z-score for Explosions & Slumps
    if (baselinePool.length >= 4) {
      const ptsSd = Math.max(3.8, sdNums(baselinePool.map((g) => g.points)));
      const gmScSd = Math.max(3.6, sdNums(baselinePool.map((g) => g.gameScore)));
      const zPts = (gNight.points - ptsAvg) / ptsSd;
      const zGmSc = (gNight.gameScore - gmScAvg) / gmScSd;
      const singleNightZ = Math.round((0.55 * zGmSc + 0.45 * zPts) * 100) / 100;

      // A) Explosion check
      if (
        gNight.minutes >= 16 &&
        (gNight.points >= 16 || gNight.gameScore >= 18) &&
        (singleNightZ >= 1.35 || ptsDelta >= 10)
      ) {
        const isRoleJump = minDelta >= 5.5 || usgDelta >= 5.0;
        const isHotShooting = gNight.tsPct - tsAvg >= 12;
        const driverTag = isRoleJump
          ? 'Salto de rol + producción'
          : isHotShooting
          ? 'Puntería al rojo vivo'
          : 'Dominio integral en pista';

        const driverDetailSimple = isRoleJump
          ? `Jugó ${gNight.minutes.toFixed(0)} min (su media es ${minAvg.toFixed(
              0
            )}) y asumió más tiros con gran acierto.`
          : isHotShooting
          ? `Noche inspiradísima de cara al aro (${gNight.fgm}/${gNight.fga} en tiros, ${gNight.fg3m} triples) en sus minutos habituales.`
          : `Superó su media en puntos (${ptsDelta >= 0 ? '+' : ''}${ptsDelta.toFixed(
              1
            )}) aportando además ${gNight.rebounds} rebotes y ${gNight.assists} asistencias.`;

        const driverDetailAdvanced = `Z ${
          singleNightZ >= 0 ? '+' : ''
        }${singleNightZ.toFixed(2)}σ · GmSc ${gNight.gameScore.toFixed(
          1
        )} (base ${gmScAvg.toFixed(1)}) · ${gNight.tsPct.toFixed(
          1
        )}% TS (base ${tsAvg.toFixed(1)}%) · ${gNight.usgEst.toFixed(1)}% USG.`;

        explosions.push({
          playerId: p.id,
          playerName: p.name,
          teamAbbr: line.teamAbbr,
          position: p.position,
          opponentAbbr: gNight.opponentAbbr,
          isHome: gNight.isHome,
          result: gNight.result,
          scoreDisplay: gNight.scoreDisplay,
          kind: 'explosion',
          minutes: round1(gNight.minutes),
          minutesAvg: minAvg,
          points: gNight.points,
          ptsAvg,
          ptsDelta,
          rebounds: gNight.rebounds,
          assists: gNight.assists,
          stocks: gNight.stocks,
          turnovers: gNight.turnovers,
          fgm: gNight.fgm,
          fga: gNight.fga,
          fg3m: gNight.fg3m,
          fg3a: gNight.fg3a,
          tsPct: gNight.tsPct,
          tsAvg,
          usgEst: gNight.usgEst,
          usgAvg,
          gameScore: gNight.gameScore,
          gmScAvg,
          singleNightZ,
          driverTag,
          driverDetailSimple,
          driverDetailAdvanced,
        });
      }

      // B) Slump / Batacazo check (consolidated rotation/starters >=22 MIN & >=12 PTS avg, played >=16 MIN tonight)
      if (
        baselinePool.length >= 5 &&
        minAvg >= 22 &&
        ptsAvg >= 12 &&
        gNight.minutes >= 16 &&
        (singleNightZ <= -1.25 || (ptsDelta <= -8 && gNight.tsPct <= 45))
      ) {
        const isColdShooting = gNight.fga >= 9 && gNight.tsPct < 43;
        const isTurnovers = gNight.turnovers >= 5;
        const driverTag = isColdShooting
          ? 'Cortocircuito en el tiro'
          : isTurnovers
          ? 'Exceso de pérdidas'
          : 'Noche gris sin ritmo';

        const driverDetailSimple = isColdShooting
          ? `Aro cerrado (${gNight.fgm}/${gNight.fga} en tiros de campo), pero mantuvo ${gNight.minutes.toFixed(
              0
            )} min en pista (candidato a rebotar).`
          : isTurnovers
          ? `Sufrió con la defensa rival acumulando ${gNight.turnovers} pérdidas y quedándose en ${gNight.points} puntos.`
          : `Muy lejos de sus ${ptsAvg.toFixed(1)} puntos habituales en ${gNight.minutes.toFixed(
              0
            )} minutos disputados.`;

        const driverDetailAdvanced = `Z ${singleNightZ.toFixed(
          2
        )}σ · GmSc ${gNight.gameScore.toFixed(1)} (base ${gmScAvg.toFixed(
          1
        )}) · ${gNight.tsPct.toFixed(1)}% TS (${gNight.fgm}/${gNight.fga} TC) · ${
          gNight.turnovers
        } PER.`;

        slumps.push({
          playerId: p.id,
          playerName: p.name,
          teamAbbr: line.teamAbbr,
          position: p.position,
          opponentAbbr: gNight.opponentAbbr,
          isHome: gNight.isHome,
          result: gNight.result,
          scoreDisplay: gNight.scoreDisplay,
          kind: 'slump',
          minutes: round1(gNight.minutes),
          minutesAvg: minAvg,
          points: gNight.points,
          ptsAvg,
          ptsDelta,
          rebounds: gNight.rebounds,
          assists: gNight.assists,
          stocks: gNight.stocks,
          turnovers: gNight.turnovers,
          fgm: gNight.fgm,
          fga: gNight.fga,
          fg3m: gNight.fg3m,
          fg3a: gNight.fg3a,
          tsPct: gNight.tsPct,
          tsAvg,
          usgEst: gNight.usgEst,
          usgAvg,
          gameScore: gNight.gameScore,
          gmScAvg,
          singleNightZ,
          driverTag,
          driverDetailSimple,
          driverDetailAdvanced,
        });
      }

      // C) Role / Minutes Surge check
      if (
        gNight.minutes >= 20 &&
        (minDelta >= 6.5 || (usgDelta >= 6.0 && gNight.fga >= 10))
      ) {
        const shiftType: GameDayRoleShiftItem['shiftType'] =
          minDelta >= 6.0 && usgDelta >= 5.0
            ? 'dual_breakout'
            : minDelta >= 6.5
            ? 'minutes_spike'
            : 'usage_spike';

        const headlineSimple =
          shiftType === 'dual_breakout'
            ? `Doble salto: +${minDelta.toFixed(0)} min extra y mucho más balón (${gNight.fga} tiros intentados)`
            : shiftType === 'minutes_spike'
            ? `Pico en la rotación: subió de ${minAvg.toFixed(0)} a ${gNight.minutes.toFixed(
                0
              )} minutos en cancha`
            : `Absorbió el ataque: lanzó ${gNight.fga} tiros (su media es ${fgaAvg.toFixed(1)})`;

        const headlineAdvanced = `MIN ${gNight.minutes.toFixed(0)} (${
          minDelta >= 0 ? '+' : ''
        }${minDelta.toFixed(1)} vs ${minAvg.toFixed(1)}) · USG ${gNight.usgEst.toFixed(
          1
        )}% (${usgDelta >= 0 ? '+' : ''}${usgDelta.toFixed(1)}% vs ${usgAvg.toFixed(
          1
        )}%) · ${gNight.fga} FGA.`;

        roleShifts.push({
          playerId: p.id,
          playerName: p.name,
          teamAbbr: line.teamAbbr,
          position: p.position,
          opponentAbbr: gNight.opponentAbbr,
          isHome: gNight.isHome,
          result: gNight.result,
          minutes: round1(gNight.minutes),
          minutesAvg: minAvg,
          minutesDelta: minDelta,
          usgEst: gNight.usgEst,
          usgAvg,
          usgDelta,
          points: gNight.points,
          rebounds: gNight.rebounds,
          assists: gNight.assists,
          fga: gNight.fga,
          fgaAvg,
          gameScore: gNight.gameScore,
          shiftType,
          headlineSimple,
          headlineAdvanced,
          _rankScore: minDelta * 1.15 + Math.max(0, usgDelta) * 0.9,
        });
      }
    }

    // D) Streak Extended or Broken on `selectedDate`
    const gamesUpToDate = p.games.filter(
      (g) => g.date.slice(0, 10) <= selectedDate
    );
    if (gamesUpToDate.length >= 4 && gamesUpToDate[0]?.eventId === gNight.eventId) {
      const streakChecks: Array<{
        key: string;
        label: string;
        unit: string;
        test: (g: PlayerGameLog) => boolean;
        val: (g: PlayerGameLog) => number;
      }> = [
        {
          key: 'pts25',
          label: '25+ puntos',
          unit: 'PTS',
          test: (g) => g.points >= 25,
          val: (g) => g.points,
        },
        {
          key: 'pts20',
          label: '20+ puntos',
          unit: 'PTS',
          test: (g) => g.points >= 20,
          val: (g) => g.points,
        },
        {
          key: 'reb10',
          label: '10+ rebotes',
          unit: 'REB',
          test: (g) => g.rebounds >= 10,
          val: (g) => g.rebounds,
        },
        {
          key: 'ast8',
          label: '8+ asistencias',
          unit: 'AST',
          test: (g) => g.assists >= 8,
          val: (g) => g.assists,
        },
        {
          key: 'fg3m3',
          label: '3+ triples',
          unit: '3PM',
          test: (g) => g.fg3m >= 3,
          val: (g) => g.fg3m,
        },
        {
          key: 'stk2',
          label: '2+ robos/tapones',
          unit: 'STK',
          test: (g) => g.stocks >= 2,
          val: (g) => g.stocks,
        },
      ];

      let emittedPts25Extended = false;
      let emittedPts25Broken = false;

      for (const sc of streakChecks) {
        if (sc.key === 'pts20' && (emittedPts25Extended || emittedPts25Broken)) {
          // Avoid duplicate 20+ and 25+ streak rows for the same player if same direction
        }
        const hitTonight = sc.test(gNight);
        if (hitTonight) {
          if (sc.key === 'pts20' && emittedPts25Extended) continue;
          let count = 0;
          for (const g of gamesUpToDate) {
            if (sc.test(g)) count++;
            else break;
          }
          if (count >= 4) {
            if (sc.key === 'pts25') emittedPts25Extended = true;
            const streakSlice = gamesUpToDate.slice(0, count);
            streakShifts.push({
              id: `ext:${p.id}:${sc.key}`,
              playerId: p.id,
              playerName: p.name,
              teamAbbr: line.teamAbbr,
              position: p.position,
              opponentAbbr: gNight.opponentAbbr,
              isHome: gNight.isHome,
              status: 'extended',
              thresholdLabel: sc.label,
              streakCount: count,
              nightValueDisplay: `Firmó ${sc.val(gNight)} ${sc.unit}`,
              avgDuringStreak: round1(avgNums(streakSlice.map(sc.val))),
              unit: sc.unit,
            });
          }
        } else if (gNight.minutes >= 14) {
          if (sc.key === 'pts20' && emittedPts25Broken) continue;
          let priorCount = 0;
          for (let i = 1; i < gamesUpToDate.length; i++) {
            if (sc.test(gamesUpToDate[i])) priorCount++;
            else break;
          }
          if (priorCount >= 4) {
            if (sc.key === 'pts25') emittedPts25Broken = true;
            const priorSlice = gamesUpToDate.slice(1, 1 + priorCount);
            streakShifts.push({
              id: `brk:${p.id}:${sc.key}`,
              playerId: p.id,
              playerName: p.name,
              teamAbbr: line.teamAbbr,
              position: p.position,
              opponentAbbr: gNight.opponentAbbr,
              isHome: gNight.isHome,
              status: 'broken',
              thresholdLabel: sc.label,
              streakCount: priorCount,
              nightValueDisplay: `Se quedó en ${sc.val(gNight)} ${sc.unit}`,
              avgDuringStreak: round1(avgNums(priorSlice.map(sc.val))),
              unit: sc.unit,
            });
          }
        }
      }
    }
  }

  // 3. Pair TeamGameLogs on `selectedDate` by `eventId` and attach exact game-night team abbreviations & player boxscores
  const teamLogsByEvent = new Map<
    string,
    Array<{ team: TeamSummary; log: TeamGameLog }>
  >();

  for (const t of teams) {
    for (const g of t.games) {
      if (g.date.slice(0, 10) === selectedDate) {
        const list = teamLogsByEvent.get(g.eventId) || [];
        list.push({ team: t, log: g });
        teamLogsByEvent.set(g.eventId, list);
      }
    }
  }

  // Map playerId -> exact teamAbbr in tonight's game (handles traded players on historical dates!)
  const tonightActualTeamByPlayer = new Map<string, string>();
  const matchups: GameDayMatchupCard[] = [];

  for (const [eventId, sides] of teamLogsByEvent.entries()) {
    const homeEntry = sides.find((s) => s.log.isHome) || sides[0];
    const awayEntry =
      sides.find((s) => !s.log.isHome && s.team.abbreviation !== homeEntry.team.abbreviation) ||
      sides.find((s) => s !== homeEntry);

    if (!homeEntry || !awayEntry) continue;

    const homeAbbr = homeEntry.team.abbreviation;
    const awayAbbr = awayEntry.team.abbreviation;

    const eventPlayers = playersByEventId.get(eventId) || [];
    const awayPlayers: GameDayPlayerLine[] = [];
    const homePlayers: GameDayPlayerLine[] = [];

    for (const ep of eventPlayers) {
      let actualAbbr = ep.line.teamAbbr;
      if (ep.game.opponentAbbr === homeAbbr) {
        actualAbbr = awayAbbr;
      } else if (ep.game.opponentAbbr === awayAbbr) {
        actualAbbr = homeAbbr;
      } else if (ep.game.isHome) {
        actualAbbr = homeAbbr;
      } else {
        actualAbbr = awayAbbr;
      }
      ep.line.teamAbbr = actualAbbr;
      tonightActualTeamByPlayer.set(ep.player.id, actualAbbr);

      if (actualAbbr === awayAbbr) awayPlayers.push(ep.line);
      else homePlayers.push(ep.line);
    }

    awayPlayers.sort((a, b) => b.gameScore - a.gameScore || b.points - a.points);
    homePlayers.sort((a, b) => b.gameScore - a.gameScore || b.points - a.points);

    const computeRecordUpToDate = (tm: TeamSummary, sLabel: string): string => {
      const slice = tm.games.filter(
        (g) => g.seasonLabel === sLabel && g.date.slice(0, 10) <= selectedDate
      );
      const w = slice.filter((g) => g.result === 'W').length;
      const l = slice.length - w;
      return `${w}-${l}`;
    };

    const awaySide: GameDayMatchupTeamSide = {
      teamId: awayEntry.team.id,
      abbr: awayAbbr,
      name: awayEntry.team.name,
      shortName: awayEntry.team.shortName,
      recordAfter: computeRecordUpToDate(awayEntry.team, awayEntry.log.seasonLabel),
      score: awayEntry.log.pointsFor,
      isWinner: awayEntry.log.result === 'W',
      fg3m: awayEntry.log.fg3m,
      fg3a: awayEntry.log.fg3a,
      fg3Pct: awayEntry.log.fg3Pct,
      efgPct: awayEntry.log.efgPct,
      tsPct: awayEntry.log.tsPct,
      reb: awayEntry.log.reb,
      oreb: awayEntry.log.oreb,
      orebPct: awayEntry.log.orebPct,
      ast: awayEntry.log.ast,
      tov: awayEntry.log.tov,
      tovPct: awayEntry.log.tovPct,
      ftm: awayEntry.log.ftm,
      fta: awayEntry.log.fta,
      offRtg: awayEntry.log.offRtg,
      defRtg: awayEntry.log.defRtg,
      netRtg: awayEntry.log.netRtg,
      pace: awayEntry.log.pace,
      isBackToBack: awayEntry.log.isBackToBack,
      topPlayer: awayPlayers[0] || null,
      rotationPlayers: awayPlayers.slice(0, 8),
    };

    const homeSide: GameDayMatchupTeamSide = {
      teamId: homeEntry.team.id,
      abbr: homeAbbr,
      name: homeEntry.team.name,
      shortName: homeEntry.team.shortName,
      recordAfter: computeRecordUpToDate(homeEntry.team, homeEntry.log.seasonLabel),
      score: homeEntry.log.pointsFor,
      isWinner: homeEntry.log.result === 'W',
      fg3m: homeEntry.log.fg3m,
      fg3a: homeEntry.log.fg3a,
      fg3Pct: homeEntry.log.fg3Pct,
      efgPct: homeEntry.log.efgPct,
      tsPct: homeEntry.log.tsPct,
      reb: homeEntry.log.reb,
      oreb: homeEntry.log.oreb,
      orebPct: homeEntry.log.orebPct,
      ast: homeEntry.log.ast,
      tov: homeEntry.log.tov,
      tovPct: homeEntry.log.tovPct,
      ftm: homeEntry.log.ftm,
      fta: homeEntry.log.fta,
      offRtg: homeEntry.log.offRtg,
      defRtg: homeEntry.log.defRtg,
      netRtg: homeEntry.log.netRtg,
      pace: homeEntry.log.pace,
      isBackToBack: homeEntry.log.isBackToBack,
      topPlayer: homePlayers[0] || null,
      rotationPlayers: homePlayers.slice(0, 8),
    };

    const margin = Math.abs(homeSide.score - awaySide.score);
    const totalPoints = homeSide.score + awaySide.score;
    const pace = round1(0.5 * (homeSide.pace + awaySide.pace));
    const winner = awaySide.isWinner ? awaySide : homeSide;
    const loser = awaySide.isWinner ? homeSide : awaySide;

    let contextTag = 'Duelo equilibrado';
    let contextTone: GameDayMatchupCard['contextTone'] = 'slate';
    if (margin <= 3) {
      contextTag = 'Final de infarto';
      contextTone = 'amber';
    } else if (margin <= 6) {
      contextTag = 'Final apretado';
      contextTone = 'amber';
    } else if (margin >= 20) {
      contextTag = 'Paliza autoritaria';
      contextTone = 'emerald';
    } else if (awaySide.isWinner && margin >= 10) {
      contextTag = 'Golpe visitante';
      contextTone = 'emerald';
    } else if (awaySide.isWinner) {
      contextTag = 'Triunfo visitante';
      contextTone = 'slate';
    } else if (totalPoints >= 246) {
      contextTag = 'Festival anotador';
      contextTone = 'slate';
    } else if (totalPoints <= 206) {
      contextTag = 'Batalla defensiva';
      contextTone = 'slate';
    }

    const keys = buildTacticalMatchupTakeaways(winner, loser, margin, pace);

    matchups.push({
      eventId,
      date: selectedDate,
      seasonLabel: homeEntry.log.seasonLabel,
      contextTag,
      contextTone,
      margin,
      totalPoints,
      pace,
      away: awaySide,
      home: homeSide,
      keyTakeawaysSimple: keys.simple,
      keyTakeawaysAdvanced: keys.advanced,
    });
  }

  // Propagate exact game-night teamAbbr to outlier, roleShift, and streakShift arrays
  for (const item of explosions) {
    const ab = tonightActualTeamByPlayer.get(item.playerId);
    if (ab) item.teamAbbr = ab;
  }
  for (const item of slumps) {
    const ab = tonightActualTeamByPlayer.get(item.playerId);
    if (ab) item.teamAbbr = ab;
  }
  for (const item of roleShifts) {
    const ab = tonightActualTeamByPlayer.get(item.playerId);
    if (ab) item.teamAbbr = ab;
  }
  for (const item of streakShifts) {
    const ab = tonightActualTeamByPlayer.get(item.playerId);
    if (ab) item.teamAbbr = ab;
  }

  // Sort matchups: closest games & highest star power first so the most exciting games lead
  matchups.sort((a, b) => {
    const aClose = a.margin <= 5 ? 1 : 0;
    const bClose = b.margin <= 5 ? 1 : 0;
    if (aClose !== bClose) return bClose - aClose;
    const aPeak = Math.max(
      a.away.topPlayer?.gameScore || 0,
      a.home.topPlayer?.gameScore || 0
    );
    const bPeak = Math.max(
      b.away.topPlayer?.gameScore || 0,
      b.home.topPlayer?.gameScore || 0
    );
    return bPeak - aPeak;
  });

  // Sort Ideal Five, Explosions, Slumps, Role Shifts, and Streaks
  allNightLines.sort(
    (a, b) => b.gameScore - a.gameScore || b.points - a.points
  );
  const idealFive = allNightLines.slice(0, 5);
  const mvpOfTheNight = idealFive[0] || null;

  explosions.sort((a, b) => b.singleNightZ - a.singleNightZ);
  slumps.sort((a, b) => a.singleNightZ - b.singleNightZ);
  roleShifts.sort((a, b) => b._rankScore - a._rankScore);

  const extendedStreaks = streakShifts
    .filter((s) => s.status === 'extended')
    .sort((a, b) => b.streakCount - a.streakCount)
    .slice(0, 8);
  const brokenStreaks = streakShifts
    .filter((s) => s.status === 'broken')
    .sort((a, b) => b.streakCount - a.streakCount)
    .slice(0, 8);
  const finalStreaks = [...brokenStreaks, ...extendedStreaks];

  // Statement Team Win of the Night
  let statementTeamWin: GameDayPayload['statementTeamWin'] = null;
  let bestTeamAuthority = -999;
  for (const m of matchups) {
    const winner = m.away.isWinner ? m.away : m.home;
    const loser = m.away.isWinner ? m.home : m.away;
    const isHome = m.home.isWinner;
    const authority = winner.netRtg + (isHome ? 0 : 3.5);
    if (authority > bestTeamAuthority) {
      bestTeamAuthority = authority;
      statementTeamWin = {
        teamId: winner.teamId,
        teamAbbr: winner.abbr,
        teamName: winner.name,
        opponentAbbr: loser.abbr,
        isHome,
        scoreDisplay: `${winner.score}-${loser.score}`,
        margin: m.margin,
        netRtg: winner.netRtg,
        efgPct: winner.efgPct,
        summarySimple: `${
          isHome ? 'En casa ante' : 'A domicilio en pista de'
        } ${loser.abbr} (+${m.margin} pts · ${winner.efgPct.toFixed(1)}% acierto efectivo)`,
        summaryAdvanced: `${isHome ? 'vs' : '@'} ${loser.abbr} · +${
          m.margin
        } PTS · NetRtg +${winner.netRtg.toFixed(1)} · ${winner.efgPct.toFixed(
          1
        )}% eFG`,
      };
    }
  }

  const gc = matchups.length;
  const pulse: GameDayPayload['pulse'] = {
    gamesCount: gc,
    avgTotalPoints:
      gc > 0 ? round1(avgNums(matchups.map((m) => m.totalPoints))) : 0,
    leagueAvgTotalPoints,
    closeGamesCount: matchups.filter((m) => m.margin <= 5).length,
    blowoutsCount: matchups.filter((m) => m.margin >= 15).length,
    roadWinsCount: matchups.filter((m) => m.away.isWinner).length,
    avgPace: gc > 0 ? round1(avgNums(matchups.map((m) => m.pace))) : 0,
  };

  const cleanRoleShifts: GameDayRoleShiftItem[] = roleShifts
    .slice(0, 8)
    .map(({ _rankScore: _unused, ...rest }) => rest);

  const payload: GameDayPayload = {
    generatedAt: new Date().toISOString(),
    dataSource,
    selectedDate,
    seasonLabel: selectedSeasonLabel,
    availableDates,
    pulse,
    mvpOfTheNight,
    topExplosion: explosions[0] || null,
    statementTeamWin,
    idealFive,
    matchups,
    explosions: explosions.slice(0, 8),
    slumps: slumps.slice(0, 8),
    roleShifts: cleanRoleShifts,
    streakShifts: finalStreaks,
    liveOrScheduledToday: scoreboard,
  };

  memoryCache.set(gamedayCacheKey, {
    expiresAt: Date.now() + 5 * 60 * 1000,
    data: payload,
  });

  return payload;
}

/* ============================================================================
 * 5. EXPRESS SERVER & API ROUTES
 * ============================================================================ */

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/nba/bootstrap', async (req, res) => {
    try {
      const rawMode = String(req.query.seasonMode || 'continuous');
      const seasonMode: SeasonMode =
        rawMode === '2027' || rawMode === '2026' ? rawMode : 'continuous';
      const includeAll = String(req.query.allPlayers || '') === '1';
      const forceRefresh = String(req.query.refresh || '') === '1';
      const payload = await buildBootstrapPayload(seasonMode, includeAll, forceRefresh);
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/nba/bootstrap:', err);
      res.status(502).json({
        error: 'No se pudieron recuperar los datos estadísticos NBA en este momento.',
      });
    }
  });

  const scoutingEngine = createScoutingEngine({
    getFullLeagueMemory: () => buildFullLeagueMemory('continuous'),
    getPlayerBiosMap: (forceRefresh = false) => fetchPlayerBiosMap(forceRefresh),
    getGameDayPayload: (requestedDate, forceRefresh = false) =>
      buildGameDayPayload(requestedDate, forceRefresh),
    cachedFetchJson,
  });

  app.get('/api/nba/gameday', async (req, res) => {
    try {
      const requestedDate = req.query.date ? String(req.query.date) : undefined;
      const forceRefresh = String(req.query.refresh || '') === '1';
      const payload = await buildGameDayPayload(requestedDate, forceRefresh);
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/nba/gameday:', err);
      res.status(502).json({
        error: 'No se pudo generar el resumen analítico de la jornada NBA.',
      });
    }
  });

  app.get('/api/nba/gameday/chronicle', async (req, res) => {
    try {
      const requestedDate = req.query.date ? String(req.query.date) : undefined;
      const forceRefresh = String(req.query.refresh || '') === '1';
      const payload = await scoutingEngine.buildGameDayChroniclePayload(
        requestedDate,
        forceRefresh
      );
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/nba/gameday/chronicle:', err);
      res.status(502).json({
        error: 'No se pudo redactar la crónica global de la jornada NBA.',
      });
    }
  });

  app.get('/api/nba/game/:eventId/boxscore', async (req, res) => {
    try {
      const eventId = String(req.params.eventId || '').trim();
      const forceRefresh = String(req.query.refresh || '') === '1';
      const payload = await scoutingEngine.buildGameOfficialReportData(
        eventId,
        forceRefresh
      );
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/nba/game/:eventId/boxscore:', err);
      res.status(502).json({
        error: 'No se pudo recuperar el acta oficial del encuentro.',
      });
    }
  });

  app.get('/api/nba/game/:eventId/narrative', async (req, res) => {
    try {
      const eventId = String(req.params.eventId || '').trim();
      const forceRefresh = String(req.query.refresh || '') === '1';
      const payload = await scoutingEngine.buildGameNarrativePayload(
        eventId,
        forceRefresh
      );
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/nba/game/:eventId/narrative:', err);
      res.status(502).json({
        error: 'No se pudo generar la crónica táctica del encuentro.',
      });
    }
  });

  app.get('/api/nba/milestones', async (req, res) => {
    try {
      const forceRefresh = String(req.query.refresh || '') === '1';
      const payload = await buildMilestonesPayload(forceRefresh);
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/nba/milestones:', err);
      res.status(502).json({
        error: 'No se pudieron calcular los hitos comparativos entre temporadas.',
      });
    }
  });

  app.get('/api/nba/search', async (req, res) => {
    const q = normalizeText(String(req.query.q || '').trim());
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    try {
      const full = await buildFullLeagueMemory('continuous');
      const matched: SearchPlayerResult[] = [];
      for (const p of full.allPlayers) {
        const hay = normalizeText(`${p.name} ${p.teamAbbr} ${p.teamName}`);
        if (hay.includes(q)) {
          matched.push({
            id: p.id,
            name: p.name,
            teamAbbr: p.teamAbbr,
            position: p.position,
          });
          if (matched.length >= 12) break;
        }
      }
      res.json({ results: matched });
    } catch (err) {
      console.error('Error in /api/nba/search:', err);
      res.json({ results: [] });
    }
  });

  app.get('/api/nba/player/:id', async (req, res) => {
    try {
      const athleteId = String(req.params.id);
      const rawMode = String(req.query.seasonMode || 'continuous');
      const seasonMode: SeasonMode =
        rawMode === '2027' || rawMode === '2026' ? rawMode : 'continuous';

      const full = await buildFullLeagueMemory(seasonMode);
      const found = full.allPlayers.find((p) => p.id === athleteId);
      if (found) {
        res.json({ player: found });
        return;
      }

      // If in 2027-only mode and player hasn't played yet in 2027, check continuous memory
      const cont = await buildFullLeagueMemory('continuous');
      const fallbackFound = cont.allPlayers.find((p) => p.id === athleteId);
      if (fallbackFound) {
        res.json({ player: fallbackFound });
        return;
      }

      res
        .status(404)
        .json({ error: 'Sin registros disponibles para este jugador.' });
    } catch (err) {
      console.error('Error in /api/nba/player/:id:', err);
      res.status(502).json({ error: 'No se pudo cargar el registro del jugador.' });
    }
  });

  app.get('/api/nba/team/:id/roster', async (req, res) => {
    try {
      const teamId = String(req.params.id);
      const [biosMap, full] = await Promise.all([
        fetchPlayerBiosMap(),
        buildFullLeagueMemory('continuous'),
      ]);
      const teamObj = full.teams.find(
        (t) => t.id === teamId || t.abbreviation === teamId.toUpperCase()
      );
      const targetAbbr = teamObj?.abbreviation || '';

      const roster: RosterPlayerItem[] = [];
      for (const b of biosMap.values()) {
        if (b.teamId === teamId || (targetAbbr && b.teamAbbr === targetAbbr)) {
          roster.push({
            id: b.id,
            name: b.name,
            position: b.position,
            jersey: b.jersey,
            height: b.height,
            country: b.country,
          });
        }
      }

      if (roster.length > 0) {
        roster.sort((a, b) => a.name.localeCompare(b.name));
        res.json({ roster });
        return;
      }

      // ESPN Fallback if biosMap was unavailable
      const espnTeamId =
        (targetAbbr && NBA_TEAMS_META[targetAbbr]?.espnId) || teamId;
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/roster`;
      const json = await cachedFetchJson<Record<string, any>>(url, 30 * 60 * 1000);
      const espnRoster: RosterPlayerItem[] = (json.athletes || []).map((a: any) => ({
        id: String(a.id),
        name: String(a.displayName || a.fullName || ''),
        position: String(a.position?.abbreviation || 'JUG'),
        jersey: String(a.jersey || '—'),
        age: typeof a.age === 'number' ? a.age : undefined,
      }));
      res.json({ roster: espnRoster });
    } catch (err) {
      console.error('Error in /api/nba/team/:id/roster:', err);
      res.json({ roster: [] });
    }
  });

  const distPath = path.join(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RadarNBA Hybrid Engine listening on http://0.0.0.0:${PORT}`);
    void buildBootstrapPayload('continuous')
      .then(() => buildMilestonesPayload())
      .catch((err) => {
        console.warn('Initial prewarm warning:', err);
      });
  });
}

void startServer();
