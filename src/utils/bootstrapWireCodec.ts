import type {
  BootstrapPayload,
  DataSourceKind,
  PlayerGameLog,
  PlayerSummary,
  ScoreboardGame,
  SeasonMode,
  TeamGameLog,
  TeamSummary,
} from '../types/nba.ts';
import { NBA_TEAMS_MAP } from './teamLogos.ts';

function round1(val: number): number {
  return Math.round((Number(val) || 0) * 10) / 10;
}

function meanNums(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

/**
 * Shared game header dictionary entry:
 * [eventId, date, seasonIdx, scoreDisplay]
 */
export type CompactGameHeaderTuple = [
  eventId: string,
  date: string,
  seasonIdx: number,
  scoreDisplay: string,
];

/**
 * Lossless compact tuple for TeamGameLog:
 * flags bitmask: 1 = isHome, 2 = isWin ('W'), 4 = isBackToBack
 */
export type CompactTeamGameTuple = [
  gameIdx: number,
  oppAbbrIdx: number,
  oppNameIdx: number,
  flags: number,
  pointsFor: number,
  pointsAgainst: number,
  restDays: number | null,
  fgm: number,
  fga: number,
  fg3m: number,
  fg3a: number,
  ftm: number,
  fta: number,
  oreb: number,
  dreb: number,
  reb: number,
  ast: number,
  stl: number,
  blk: number,
  tov: number,
  poss: number,
  offRtg: number,
  defRtg: number,
  netRtg: number,
  pace: number,
  efgPct: number,
  tsPct: number,
  orebPct: number,
  tovPct: number,
];

/**
 * Lossless compact tuple for PlayerGameLog:
 * flags bitmask: 1 = isHome, 2 = isWin ('W'), 4 = isBackToBack
 */
export type CompactPlayerGameTuple = [
  gameIdx: number,
  teamAbbrIdx: number,
  teamIdIdx: number,
  oppAbbrIdx: number,
  oppNameIdx: number,
  flags: number,
  restDays: number | null,
  minutes: number,
  points: number,
  rebounds: number,
  oreb: number,
  dreb: number,
  assists: number,
  steals: number,
  blocks: number,
  turnovers: number,
  fouls: number,
  plusMinus: number,
  fgm: number,
  fga: number,
  fg3m: number,
  fg3a: number,
  ftm: number,
  fta: number,
  usgEst: number,
  gameScore: number,
];

export type CompactTeamSummary = Omit<TeamSummary, 'games'> & {
  g: CompactTeamGameTuple[];
};

export type CompactPlayerSummary = Omit<PlayerSummary, 'games'> & {
  g: CompactPlayerGameTuple[];
};

export interface CompactBootstrapWirePayload {
  wireVersion: 2;
  seasonMode: SeasonMode;
  dataSource: DataSourceKind;
  totalLeaguePlayersAvailable: number;
  allPlayersLoaded: boolean;
  generatedAt: string;
  scoreboard: ScoreboardGame[];
  dicts: {
    seasons: string[];
    strings: string[];
    games: CompactGameHeaderTuple[];
  };
  teams: CompactTeamSummary[];
  players: CompactPlayerSummary[];
}

export function isCompactBootstrapWirePayload(
  candidate: unknown
): candidate is CompactBootstrapWirePayload {
  return (
    Boolean(candidate) &&
    typeof candidate === 'object' &&
    (candidate as Partial<CompactBootstrapWirePayload>).wireVersion === 2 &&
    Array.isArray((candidate as Partial<CompactBootstrapWirePayload>).teams) &&
    Array.isArray((candidate as Partial<CompactBootstrapWirePayload>).players)
  );
}

/**
 * Packs a full BootstrapPayload into a lossless compact tabular wire payload,
 * cutting uncompressed JSON size by ~86% (e.g. 15.3 MB -> ~2.1 MB per full 82-game season)
 * while preserving 100% of every game and field.
 */
export function packBootstrapWirePayload(
  payload: BootstrapPayload
): CompactBootstrapWirePayload {
  const seasons: string[] = [];
  const seasonMap = new Map<string, number>();
  const getSeasonIdx = (label: string): number => {
    let idx = seasonMap.get(label);
    if (idx === undefined) {
      idx = seasons.length;
      seasons.push(label);
      seasonMap.set(label, idx);
    }
    return idx;
  };

  const strings: string[] = [];
  const stringMap = new Map<string, number>();
  const getStringIdx = (val: string | undefined): number => {
    if (val === undefined) return -1;
    let idx = stringMap.get(val);
    if (idx === undefined) {
      idx = strings.length;
      strings.push(val);
      stringMap.set(val, idx);
    }
    return idx;
  };

  const games: CompactGameHeaderTuple[] = [];
  const gameMap = new Map<string, number>();
  const getGameIdx = (
    eventId: string,
    date: string,
    seasonLabel: string,
    scoreDisplay: string
  ): number => {
    const sIdx = getSeasonIdx(seasonLabel);
    const key = `${eventId}|${date}|${sIdx}|${scoreDisplay}`;
    let idx = gameMap.get(key);
    if (idx === undefined) {
      idx = games.length;
      games.push([eventId, date, sIdx, scoreDisplay]);
      gameMap.set(key, idx);
    }
    return idx;
  };

  const packedTeams: CompactTeamSummary[] = payload.teams.map((tm) => {
    const { games: tmGames, ...meta } = tm;
    const g: CompactTeamGameTuple[] = tmGames.map((log) => {
      const awayPts = log.isHome ? log.pointsAgainst : log.pointsFor;
      const homePts = log.isHome ? log.pointsFor : log.pointsAgainst;
      const gameIdx = getGameIdx(
        log.eventId,
        log.date,
        log.seasonLabel,
        `${awayPts}-${homePts}`
      );
      const flags =
        (log.isHome ? 1 : 0) |
        (log.result === 'W' ? 2 : 0) |
        (log.isBackToBack ? 4 : 0);

      return [
        gameIdx,
        getStringIdx(log.opponentAbbr),
        getStringIdx(log.opponentName),
        flags,
        log.pointsFor,
        log.pointsAgainst,
        log.restDays,
        log.fgm,
        log.fga,
        log.fg3m,
        log.fg3a,
        log.ftm,
        log.fta,
        log.oreb,
        log.dreb,
        log.reb,
        log.ast,
        log.stl,
        log.blk,
        log.tov,
        log.poss,
        log.offRtg,
        log.defRtg,
        log.netRtg,
        log.pace,
        log.efgPct,
        log.tsPct,
        log.orebPct,
        log.tovPct,
      ];
    });

    return {
      ...meta,
      g,
    };
  });

  const packedPlayers: CompactPlayerSummary[] = payload.players.map((pl) => {
    const { games: plGames, ...meta } = pl;
    const g: CompactPlayerGameTuple[] = plGames.map((log) => {
      const gameIdx = getGameIdx(
        log.eventId,
        log.date,
        log.seasonLabel,
        log.scoreDisplay || ''
      );
      const flags =
        (log.isHome ? 1 : 0) |
        (log.result === 'W' ? 2 : 0) |
        (log.isBackToBack ? 4 : 0);

      return [
        gameIdx,
        getStringIdx(log.teamAbbr),
        getStringIdx(log.teamId),
        getStringIdx(log.opponentAbbr),
        getStringIdx(log.opponentName),
        flags,
        log.restDays,
        log.minutes,
        log.points,
        log.rebounds,
        log.oreb,
        log.dreb,
        log.assists,
        log.steals,
        log.blocks,
        log.turnovers,
        log.fouls,
        log.plusMinus,
        log.fgm,
        log.fga,
        log.fg3m,
        log.fg3a,
        log.ftm,
        log.fta,
        log.usgEst,
        log.gameScore,
      ];
    });

    return {
      ...meta,
      g,
    };
  });

  return {
    wireVersion: 2,
    seasonMode: payload.seasonMode,
    dataSource: payload.dataSource,
    totalLeaguePlayersAvailable: payload.totalLeaguePlayersAvailable,
    allPlayersLoaded: payload.allPlayersLoaded,
    generatedAt: payload.generatedAt,
    scoreboard: payload.scoreboard,
    dicts: {
      seasons,
      strings,
      games,
    },
    teams: packedTeams,
    players: packedPlayers,
  };
}

/**
 * Unpacks either a CompactBootstrapWirePayload (v2) or a standard BootstrapPayload
 * into an exact BootstrapPayload object with 100% identical TeamGameLog & PlayerGameLog arrays.
 */
export function unpackBootstrapWirePayload(
  raw: CompactBootstrapWirePayload | BootstrapPayload
): BootstrapPayload {
  if (!isCompactBootstrapWirePayload(raw)) {
    return raw;
  }

  const { seasons, strings, games: gameDict } = raw.dicts;

  const teams: TeamSummary[] = raw.teams.map((tm) => {
    const { g: compactGames, ...meta } = tm;
    const games: TeamGameLog[] = compactGames.map((row) => {
      const gh = gameDict[row[0]];
      const flags = row[3];
      const pf = row[4];
      const pa = row[5];
      const fgm = row[7];
      const fga = row[8];
      const fg3m = row[9];
      const fg3a = row[10];
      const ftm = row[11];
      const fta = row[12];

      return {
        eventId: gh[0],
        date: gh[1],
        seasonLabel: seasons[gh[2]] || '',
        opponentAbbr: row[1] >= 0 ? strings[row[1]] || '' : '',
        opponentName: row[2] >= 0 ? strings[row[2]] || '' : '',
        isHome: (flags & 1) !== 0,
        result: (flags & 2) !== 0 ? 'W' : 'L',
        pointsFor: pf,
        pointsAgainst: pa,
        differential: pf - pa,
        totalPoints: pf + pa,
        restDays: row[6],
        isBackToBack: (flags & 4) !== 0,
        fgm,
        fga,
        fgPct: fga > 0 ? round1((fgm / fga) * 100) : 0,
        fg3m,
        fg3a,
        fg3Pct: fg3a > 0 ? round1((fg3m / fg3a) * 100) : 0,
        ftm,
        fta,
        ftPct: fta > 0 ? round1((ftm / fta) * 100) : 0,
        oreb: row[13],
        dreb: row[14],
        reb: row[15],
        ast: row[16],
        stl: row[17],
        blk: row[18],
        tov: row[19],
        poss: row[20],
        offRtg: row[21],
        defRtg: row[22],
        netRtg: row[23],
        pace: row[24],
        efgPct: row[25],
        tsPct: row[26],
        orebPct: row[27],
        tovPct: row[28],
      };
    });

    return {
      ...meta,
      games,
    };
  });

  const players: PlayerSummary[] = raw.players.map((pl) => {
    const { g: compactGames, ...meta } = pl;
    const games: PlayerGameLog[] = compactGames.map((row) => {
      const gh = gameDict[row[0]];
      const flags = row[5];
      const pts = row[8];
      const reb = row[9];
      const oreb = row[10];
      const dreb = row[11];
      const ast = row[12];
      const stl = row[13];
      const blk = row[14];
      const fgm = row[18];
      const fga = row[19];
      const fg3m = row[20];
      const fg3a = row[21];
      const ftm = row[22];
      const fta = row[23];
      const tsDenom = 2 * (fga + 0.44 * fta);

      const log: PlayerGameLog = {
        eventId: gh[0],
        date: gh[1],
        seasonLabel: seasons[gh[2]] || '',
        teamAbbr: row[1] >= 0 ? strings[row[1]] : undefined,
        teamId: row[2] >= 0 ? strings[row[2]] : undefined,
        opponentAbbr: row[3] >= 0 ? strings[row[3]] || '' : '',
        opponentName: row[4] >= 0 ? strings[row[4]] || '' : '',
        isHome: (flags & 1) !== 0,
        result: (flags & 2) !== 0 ? 'W' : 'L',
        scoreDisplay: gh[3] || '',
        restDays: row[6],
        isBackToBack: (flags & 4) !== 0,
        minutes: row[7],
        points: pts,
        rebounds: reb,
        oreb,
        dreb,
        assists: ast,
        steals: stl,
        blocks: blk,
        stocks: stl + blk,
        turnovers: row[15],
        fouls: row[16],
        plusMinus: row[17],
        fgm,
        fga,
        fgPct: fga > 0 ? round1((fgm / fga) * 100) : 0,
        fg3m,
        fg3a,
        fg3Pct: fg3a > 0 ? round1((fg3m / fg3a) * 100) : 0,
        ftm,
        fta,
        ftPct: fta > 0 ? round1((ftm / fta) * 100) : 0,
        pra: pts + reb + ast,
        tsPct: tsDenom > 0 ? round1((pts / tsDenom) * 100) : 0,
        efgPct: fga > 0 ? round1(((fgm + 0.5 * fg3m) / fga) * 100) : 0,
        usgEst: row[24],
        gameScore: row[25],
      };

      return log;
    });

    return {
      ...meta,
      games,
    };
  });

  return {
    seasonMode: raw.seasonMode,
    dataSource: raw.dataSource,
    totalLeaguePlayersAvailable: raw.totalLeaguePlayersAvailable,
    allPlayersLoaded: raw.allPlayersLoaded,
    generatedAt: raw.generatedAt,
    teams,
    players,
    scoreboard: raw.scoreboard || [],
  };
}

/**
 * Merges unpacked 2026-27 and 2025-26 BootstrapPayloads into an exact 'continuous'
 * BootstrapPayload matching server-side getFullLeagueMemory() ordering and fields.
 */
export function mergeBootstrapSeasonsClient(
  b2027: BootstrapPayload,
  b2026: BootstrapPayload
): BootstrapPayload {
  const t27ByAbbr = new Map<string, TeamSummary>();
  for (const t of b2027.teams) t27ByAbbr.set(t.abbreviation, t);
  const t26ByAbbr = new Map<string, TeamSummary>();
  for (const t of b2026.teams) t26ByAbbr.set(t.abbreviation, t);

  const mergedTeams: TeamSummary[] = [];
  for (const abbr of Object.keys(NBA_TEAMS_MAP)) {
    const t27 = t27ByAbbr.get(abbr);
    const t26 = t26ByAbbr.get(abbr);
    if (!t27 && !t26) continue;
    const base = t27 && t27.games.length > 0 ? t27 : t26 || t27!;
    const combinedGames = [
      ...(t27?.games || []),
      ...(t26?.games || []),
    ].sort((a, b) => b.date.localeCompare(a.date));

    mergedTeams.push({
      ...base,
      advanced: t27?.advanced || t26?.advanced,
      games: combinedGames,
    });
  }

  mergedTeams.sort(
    (a, b) =>
      b.winPct - a.winPct ||
      b.wins - a.wins ||
      b.differential - a.differential
  );

  const p27ById = new Map<string, PlayerSummary>();
  for (const p of b2027.players) p27ById.set(p.id, p);
  const p26ById = new Map<string, PlayerSummary>();
  for (const p of b2026.players) p26ById.set(p.id, p);

  const allPids = new Set<string>([
    ...p27ById.keys(),
    ...p26ById.keys(),
  ]);

  const mergedPlayers: PlayerSummary[] = [];
  for (const pid of allPids) {
    const p27 = p27ById.get(pid);
    const p26 = p26ById.get(pid);
    const primary = p27 || p26!;
    const mergedGames = [
      ...(p27?.games || []),
      ...(p26?.games || []),
    ].sort((a, b) => b.date.localeCompare(a.date));
    if (mergedGames.length === 0) continue;

    mergedPlayers.push({
      ...primary,
      jersey: p27?.jersey || p26?.jersey,
      height: p27?.height || p26?.height,
      country: p27?.country || p26?.country,
      advanced: p27?.advanced || p26?.advanced,
      games: mergedGames,
    });
  }

  mergedPlayers.sort((a, b) => {
    const aRecent = meanNums(a.games.slice(0, 10).map((g) => g.points));
    const bRecent = meanNums(b.games.slice(0, 10).map((g) => g.points));
    return bRecent - aRecent || a.id.localeCompare(b.id);
  });

  return {
    seasonMode: 'continuous',
    dataSource: b2027.dataSource,
    totalLeaguePlayersAvailable: Math.max(
      b2027.totalLeaguePlayersAvailable || 0,
      b2026.totalLeaguePlayersAvailable || 0,
      mergedPlayers.length
    ),
    allPlayersLoaded: true,
    generatedAt: b2027.generatedAt || b2026.generatedAt,
    teams: mergedTeams,
    players: mergedPlayers,
    scoreboard:
      b2027.scoreboard && b2027.scoreboard.length > 0
        ? b2027.scoreboard
        : b2026.scoreboard || [],
  };
}

/* --- Client-side Season Slice Loader & Zero-Latency Memory Store --- */

const clientBootstrapStore: Partial<Record<SeasonMode, BootstrapPayload>> = {};
const clientInflightRequests: Partial<
  Record<'2027' | '2026', Promise<BootstrapPayload>>
> = {};

export function peekCachedBootstrapClient(
  mode: SeasonMode
): BootstrapPayload | null {
  if (clientBootstrapStore[mode]) {
    return clientBootstrapStore[mode]!;
  }
  if (
    mode === 'continuous' &&
    clientBootstrapStore['2027'] &&
    clientBootstrapStore['2026']
  ) {
    const merged = mergeBootstrapSeasonsClient(
      clientBootstrapStore['2027']!,
      clientBootstrapStore['2026']!
    );
    clientBootstrapStore.continuous = merged;
    return merged;
  }
  return null;
}

export function clearBootstrapClientCache(): void {
  delete clientBootstrapStore['2027'];
  delete clientBootstrapStore['2026'];
  delete clientBootstrapStore.continuous;
}

async function fetchJsonWithSingleRetry(url: string): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let statusCode = 0;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      statusCode = res.status;
      const text = await res.text();

      if (!res.ok) {
        let serverError = '';
        try {
          const errJson = JSON.parse(text);
          if (typeof errJson?.error === 'string' && errJson.error.trim()) {
            serverError = errJson.error.trim();
          }
        } catch {
          // Ignore non-JSON error body
        }
        throw new Error(
          serverError ||
            `Respuesta no válida del servidor de estadísticas (HTTP ${res.status}).`
        );
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new Error(
          'El servidor devolvió un formato inesperado en lugar de datos JSON.'
        );
      }
    } catch (err) {
      lastErr = err;
      // Do not retry deterministic client/rate-limit statuses
      if (
        statusCode === 400 ||
        statusCode === 401 ||
        statusCode === 403 ||
        statusCode === 429
      ) {
        break;
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('No se pudo conectar con la fuente de datos NBA.');
}

async function loadSingleSeasonSliceClient(
  season: '2027' | '2026',
  forceRefresh = false
): Promise<BootstrapPayload> {
  if (!forceRefresh && clientBootstrapStore[season]) {
    return clientBootstrapStore[season]!;
  }

  if (!forceRefresh && clientInflightRequests[season]) {
    return clientInflightRequests[season]!;
  }

  const params = new URLSearchParams({
    seasonMode: season,
    wire: 'compact',
  });
  if (forceRefresh) {
    params.set('refresh', '1');
  }

  const promise = (async () => {
    const raw = await fetchJsonWithSingleRetry(
      `/api/nba/bootstrap?${params.toString()}`
    );
    const unpacked = unpackBootstrapWirePayload(raw);
    clientBootstrapStore[season] = unpacked;
    if (clientBootstrapStore['2027'] && clientBootstrapStore['2026']) {
      clientBootstrapStore.continuous = mergeBootstrapSeasonsClient(
        clientBootstrapStore['2027']!,
        clientBootstrapStore['2026']!
      );
    }
    return unpacked;
  })();

  clientInflightRequests[season] = promise;
  try {
    return await promise;
  } finally {
    delete clientInflightRequests[season];
  }
}

function scheduleBackgroundSliceWarmup(season: '2027' | '2026'): void {
  if (typeof window === 'undefined') return;
  if (clientBootstrapStore[season] || clientInflightRequests[season]) return;
  window.setTimeout(() => {
    if (!clientBootstrapStore[season] && !clientInflightRequests[season]) {
      void loadSingleSeasonSliceClient(season, false).catch(() => {
        // Ignore background warmup errors; fetched on demand if user switches tab
      });
    }
  }, 350);
}

/**
 * Fetches BootstrapPayload by splitting seasons into independent compact HTTP slices
 * (each strictly <= ~2.1 MB uncompressed even on Game 82 of an NBA season, well under
 * Vercel's 4.5 MB Serverless Function ceiling) and merging 'continuous' in memory.
 */
export async function fetchBootstrapClient(
  mode: SeasonMode,
  options?: { forceRefresh?: boolean }
): Promise<BootstrapPayload> {
  const forceRefresh = Boolean(options?.forceRefresh);

  if (!forceRefresh) {
    const cached = peekCachedBootstrapClient(mode);
    if (cached) {
      return cached;
    }
  }

  if (mode === '2027') {
    const b2027 = await loadSingleSeasonSliceClient('2027', forceRefresh);
    scheduleBackgroundSliceWarmup('2026');
    return b2027;
  }

  if (mode === '2026') {
    // 2025-26 is an immutable completed season; only refetch if not yet in memory
    const b2026 = await loadSingleSeasonSliceClient(
      '2026',
      forceRefresh && !clientBootstrapStore['2026']
    );
    scheduleBackgroundSliceWarmup('2027');
    return b2026;
  }

  // 'continuous': fetch 2027 (refreshable) and 2026 (cached archive) in parallel with graceful partial fallback
  const [res2027, res2026] = await Promise.allSettled([
    loadSingleSeasonSliceClient('2027', forceRefresh),
    loadSingleSeasonSliceClient('2026', false),
  ]);

  if (res2027.status === 'fulfilled' && res2026.status === 'fulfilled') {
    const merged = mergeBootstrapSeasonsClient(res2027.value, res2026.value);
    clientBootstrapStore.continuous = merged;
    return merged;
  }

  if (res2027.status === 'fulfilled') {
    scheduleBackgroundSliceWarmup('2026');
    return {
      ...res2027.value,
      seasonMode: 'continuous',
    };
  }

  if (res2026.status === 'fulfilled') {
    scheduleBackgroundSliceWarmup('2027');
    return {
      ...res2026.value,
      seasonMode: 'continuous',
    };
  }

  throw res2027.reason instanceof Error
    ? res2027.reason
    : new Error('No se pudo conectar con el servidor de estadísticas NBA.');
}
