import type {
  AutoStreakRuleConfig,
  AutoStreaksConfigValues,
  PlayerGameLog,
  PlayerSummary,
  StreakEntry,
  TeamGameLog,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import {
  DEFAULT_AUTO_STREAKS_CONFIG,
  TEAM_STREAK_METRIC_MAP,
  TEAM_STREAK_METRIC_OPTIONS,
  compareRuleThreshold,
  formatDynamicStreakLabel,
  isBinaryStreakMetric,
  quantizeDynamicThreshold,
} from './autoStreaksConfig';
import { STREAK_METRIC_OPTIONS } from './streakMetricsCatalog';

export interface StreakSeasonReferenceSlices {
  players2027?: PlayerSummary[];
  players2026?: PlayerSummary[];
  teams2027?: TeamSummary[];
  teams2026?: TeamSummary[];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

const PLAYER_STREAK_METRIC_MAP = new Map(
  STREAK_METRIC_OPTIONS.map((m) => [m.id, m])
);

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function buildPlayerWeightedSliceAvg(
  metricId: string,
  extract: (g: PlayerGameLog) => number
): (arr: PlayerGameLog[]) => number | null {
  if (metricId === 'fg3Pct') {
    return (arr) => {
      const a = arr.reduce((s, g) => s + g.fg3a, 0);
      const m = arr.reduce((s, g) => s + g.fg3m, 0);
      return a > 0 ? round1((m / a) * 100) : null;
    };
  }
  if (metricId === 'fgPct') {
    return (arr) => {
      const a = arr.reduce((s, g) => s + g.fga, 0);
      const m = arr.reduce((s, g) => s + g.fgm, 0);
      return a > 0 ? round1((m / a) * 100) : null;
    };
  }
  if (metricId === 'fg2Pct') {
    return (arr) => {
      const a = arr.reduce((s, g) => s + Math.max(0, g.fga - g.fg3a), 0);
      const m = arr.reduce((s, g) => s + Math.max(0, g.fgm - g.fg3m), 0);
      return a > 0 ? round1((m / a) * 100) : null;
    };
  }
  if (metricId === 'ftPct') {
    return (arr) => {
      const a = arr.reduce((s, g) => s + g.fta, 0);
      const m = arr.reduce((s, g) => s + g.ftm, 0);
      return a > 0 ? round1((m / a) * 100) : null;
    };
  }
  if (metricId === 'tsPct') {
    return (arr) => {
      const pts = arr.reduce((s, g) => s + g.points, 0);
      const fga = arr.reduce((s, g) => s + g.fga, 0);
      const fta = arr.reduce((s, g) => s + g.fta, 0);
      const denom = 2 * (fga + 0.44 * fta);
      return denom > 0 ? round1((pts / denom) * 100) : null;
    };
  }
  if (metricId === 'efgPct') {
    return (arr) => {
      const fga = arr.reduce((s, g) => s + g.fga, 0);
      const fgm = arr.reduce((s, g) => s + g.fgm, 0);
      const fg3m = arr.reduce((s, g) => s + g.fg3m, 0);
      return fga > 0 ? round1(((fgm + 0.5 * fg3m) / fga) * 100) : null;
    };
  }
  if (metricId === 'ptsPerShot') {
    return (arr) => {
      const pts = arr.reduce((s, g) => s + g.points, 0);
      const fga = arr.reduce((s, g) => s + g.fga, 0);
      return fga > 0 ? round2(pts / fga) : null;
    };
  }
  if (metricId === 'threeRate') {
    return (arr) => {
      const fga = arr.reduce((s, g) => s + g.fga, 0);
      const fg3a = arr.reduce((s, g) => s + g.fg3a, 0);
      return fga > 0 ? round1((fg3a / fga) * 100) : null;
    };
  }
  if (metricId === 'ftRate') {
    return (arr) => {
      const fga = arr.reduce((s, g) => s + g.fga, 0);
      const fta = arr.reduce((s, g) => s + g.fta, 0);
      return fga > 0 ? round1((fta / fga) * 100) : null;
    };
  }
  if (metricId === 'tovPctEst') {
    return (arr) => {
      const tov = arr.reduce((s, g) => s + g.turnovers, 0);
      const denom = arr.reduce((s, g) => s + g.fga + 0.44 * g.fta + g.turnovers, 0);
      return denom > 0 ? round1((tov / denom) * 100) : null;
    };
  }
  if (metricId === 'astRatioEst') {
    return (arr) => {
      const ast = arr.reduce((s, g) => s + g.assists, 0);
      const denom = arr.reduce((s, g) => s + g.fga + 0.44 * g.fta + g.assists + g.turnovers, 0);
      return denom > 0 ? round1((ast / denom) * 100) : null;
    };
  }
  if (metricId === 'astTo') {
    return (arr) => {
      if (arr.length === 0) return null;
      const ast = arr.reduce((s, g) => s + g.assists, 0);
      const tov = arr.reduce((s, g) => s + g.turnovers, 0);
      return round2(tov === 0 ? ast : ast / tov);
    };
  }
  if (metricId === 'ptsPerMin') {
    return (arr) => {
      const pts = arr.reduce((s, g) => s + g.points, 0);
      const min = arr.reduce((s, g) => s + g.minutes, 0);
      return min > 0 ? round2(pts / min) : null;
    };
  }
  if (metricId === 'ptsPer36') {
    return (arr) => {
      const pts = arr.reduce((s, g) => s + g.points, 0);
      const min = arr.reduce((s, g) => s + g.minutes, 0);
      return min > 0 ? round1((pts / min) * 36) : null;
    };
  }
  if (metricId === 'rebPer36') {
    return (arr) => {
      const v = arr.reduce((s, g) => s + g.rebounds, 0);
      const min = arr.reduce((s, g) => s + g.minutes, 0);
      return min > 0 ? round1((v / min) * 36) : null;
    };
  }
  if (metricId === 'drebPer36') {
    return (arr) => {
      const v = arr.reduce((s, g) => s + g.dreb, 0);
      const min = arr.reduce((s, g) => s + g.minutes, 0);
      return min > 0 ? round1((v / min) * 36) : null;
    };
  }
  if (metricId === 'orebPer36') {
    return (arr) => {
      const v = arr.reduce((s, g) => s + g.oreb, 0);
      const min = arr.reduce((s, g) => s + g.minutes, 0);
      return min > 0 ? round1((v / min) * 36) : null;
    };
  }
  if (metricId === 'astPer36') {
    return (arr) => {
      const v = arr.reduce((s, g) => s + g.assists, 0);
      const min = arr.reduce((s, g) => s + g.minutes, 0);
      return min > 0 ? round1((v / min) * 36) : null;
    };
  }
  if (metricId === 'stocksPer36') {
    return (arr) => {
      const v = arr.reduce((s, g) => s + g.stocks, 0);
      const min = arr.reduce((s, g) => s + g.minutes, 0);
      return min > 0 ? round1((v / min) * 36) : null;
    };
  }
  if (metricId === 'praPer36') {
    return (arr) => {
      const v = arr.reduce((s, g) => s + g.pra, 0);
      const min = arr.reduce((s, g) => s + g.minutes, 0);
      return min > 0 ? round1((v / min) * 36) : null;
    };
  }
  if (metricId === 'doubleDouble' || metricId === 'tripleDouble') {
    return (arr) => {
      if (arr.length === 0) return null;
      const hits = arr.reduce((s, g) => s + (extract(g) >= 1 ? 1 : 0), 0);
      return round1((hits / arr.length) * 100);
    };
  }
  return (arr) => (arr.length > 0 ? round1(mean(arr.map(extract))) : null);
}

function passesPlayerRuleGuards(
  g: PlayerGameLog,
  rule: AutoStreakRuleConfig
): boolean {
  if (rule.minMinutes && rule.minMinutes > 0 && g.minutes < rule.minMinutes) {
    return false;
  }
  if (rule.minAttempts && rule.minAttempts > 0) {
    if (rule.metricId === 'fg3Pct' || rule.metricId === 'fg3m') {
      if (g.fg3a < rule.minAttempts) return false;
    } else if (rule.metricId === 'ftPct' || rule.metricId === 'ftm') {
      if (g.fta < rule.minAttempts) return false;
    } else if (rule.metricId === 'fg2Pct' || rule.metricId === 'fg2m') {
      if (g.fga - g.fg3a < rule.minAttempts) return false;
    } else {
      if (g.fga < rule.minAttempts) return false;
    }
  } else {
    const metricDef = PLAYER_STREAK_METRIC_MAP.get(rule.metricId);
    if (metricDef?.qualifies && !metricDef.qualifies(g)) {
      return false;
    }
  }
  return true;
}

interface DynamicStreakCandidate {
  count: number;
  dynamicThreshold: number;
  score: number;
}

/**
 * Escaneo dinámico O(N) por extremo acumulado (running min para ≥/>, running max para ≤/<).
 * Recorre los partidos desde el más reciente hacia atrás una sola vez, identifica todos
 * los puntos Pareto-óptimos (donde mejora el umbral real al acortar) y devuelve
 * únicamente la racha más destacada combinando duración y nivel real sobre el mínimo base.
 */
function findBestDynamicStreak<TGame>(
  games: TGame[],
  rule: AutoStreakRuleConfig,
  requiredGames: number,
  step: number,
  extract: (g: TGame) => number,
  passesGuards: (g: TGame) => boolean
): DynamicStreakCandidate | null {
  if (games.length < requiredGames) return null;

  // Reglas binarias (DD2, TD3, Victorias, Derrotas): conteo consecutivo exacto
  if (isBinaryStreakMetric(rule.metricId)) {
    let count = 0;
    for (let i = 0; i < games.length; i++) {
      if (!passesGuards(games[i])) break;
      const val = extract(games[i]);
      if (compareRuleThreshold(val, rule.operator, rule.threshold)) count++;
      else break;
    }
    if (count < requiredGames) return null;
    return {
      count,
      dynamicThreshold: rule.threshold,
      score: count,
    };
  }

  const isUpperBound = rule.operator === 'lte' || rule.operator === 'lt';
  const extrema: number[] = [];
  let runningExtremum = 0;

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (!passesGuards(g)) break;
    const val = extract(g);
    if (!Number.isFinite(val)) break;
    if (!compareRuleThreshold(val, rule.operator, rule.threshold)) break;

    if (i === 0) {
      runningExtremum = val;
    } else {
      runningExtremum = isUpperBound
        ? Math.max(runningExtremum, val)
        : Math.min(runningExtremum, val);
    }
    extrema.push(quantizeDynamicThreshold(runningExtremum, rule.metricId, rule.operator));
  }

  const maxCount = extrema.length;
  if (maxCount < requiredGames) return null;

  // Escala natural de dificultad sobre el mínimo base para equilibrar duración vs. exigencia
  const normScale = Math.max(Math.abs(rule.threshold), step * 3, 1);

  let best: DynamicStreakCandidate | null = null;

  for (let len = requiredGames; len <= maxCount; len++) {
    const exactThreshold = extrema[len - 1];
    // Si el siguiente partido mantiene exactamente el mismo umbral real, este corte
    // está estrictamente dominado por len + 1 (mismo nivel en más partidos) -> saltar.
    if (len < maxCount && extrema[len] === exactThreshold) {
      continue;
    }

    const excess = isUpperBound
      ? Math.max(0, rule.threshold - exactThreshold)
      : Math.max(0, exactThreshold - rule.threshold);
    const difficultyBonus = excess / normScale;
    const score = len * (1 + 0.9 * difficultyBonus);

    if (
      !best ||
      score > best.score + 1e-6 ||
      (Math.abs(score - best.score) <= 1e-6 &&
        (isUpperBound
          ? exactThreshold < best.dynamicThreshold
          : exactThreshold > best.dynamicThreshold))
    ) {
      best = {
        count: len,
        dynamicThreshold: exactThreshold,
        score,
      };
    }
  }

  return best;
}

export function detectConfigurableActiveStreaks(
  players: PlayerSummary[],
  teams: TeamSummary[],
  minStreakGames = 5,
  windowSize: WindowSize = 5,
  seasonSlices?: StreakSeasonReferenceSlices,
  streaksConfig?: AutoStreaksConfigValues | null
): StreakEntry[] {
  const streaks: StreakEntry[] = [];

  const activeConfig = streaksConfig ?? DEFAULT_AUTO_STREAKS_CONFIG;
  const globalMinGames = Math.max(
    2,
    streaksConfig ? activeConfig.minStreakGames : minStreakGames
  );

  const enabledPlayerRules = activeConfig.rules.filter(
    (r) => r.enabled && r.entityType === 'player'
  );
  const enabledTeamRules = activeConfig.rules.filter(
    (r) => r.enabled && r.entityType === 'team'
  );

  const compiledPlayerChecks = enabledPlayerRules
    .map((rule) => {
      const metricDef = PLAYER_STREAK_METRIC_MAP.get(rule.metricId);
      if (!metricDef) return null;
      const extract = metricDef.getValue;
      const sliceAvg = buildPlayerWeightedSliceAvg(rule.metricId, extract);
      const isMilestonePct =
        rule.metricId === 'doubleDouble' || rule.metricId === 'tripleDouble';
      const requiredGames =
        rule.minGamesOverride && rule.minGamesOverride >= 2
          ? rule.minGamesOverride
          : globalMinGames;
      return {
        rule,
        requiredGames,
        step: metricDef.step ?? 1,
        extract,
        sliceAvg,
        unit: isMilestonePct ? '%' : (rule.unit ?? metricDef.unit ?? ''),
        passesGuards: (g: PlayerGameLog) => passesPlayerRuleGuards(g, rule),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const compiledTeamChecks = enabledTeamRules
    .map((rule) => {
      const metricDef = TEAM_STREAK_METRIC_MAP.get(rule.metricId);
      if (!metricDef) return null;
      const extract = metricDef.getValue;
      const requiredGames =
        rule.minGamesOverride && rule.minGamesOverride >= 2
          ? rule.minGamesOverride
          : globalMinGames;
      return {
        rule,
        requiredGames,
        step: metricDef.step ?? 1,
        metricDef,
        extract,
        sliceAvg:
          metricDef.sliceAvg ||
          ((arr: TeamGameLog[]) =>
            arr.length > 0 ? round1(mean(arr.map(extract))) : null),
        unit: rule.unit ?? metricDef.unit ?? '',
        passesGuards: () => true,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const lowestPlayerMin =
    compiledPlayerChecks.length > 0
      ? Math.min(...compiledPlayerChecks.map((c) => c.requiredGames))
      : globalMinGames;
  const lowestTeamMin =
    compiledTeamChecks.length > 0
      ? Math.min(...compiledTeamChecks.map((c) => c.requiredGames))
      : globalMinGames;

  const p27Map = new Map<string, PlayerGameLog[]>();
  if (seasonSlices?.players2027) {
    for (const p of seasonSlices.players2027) p27Map.set(p.id, p.games);
  }
  const p26Map = new Map<string, PlayerGameLog[]>();
  if (seasonSlices?.players2026) {
    for (const p of seasonSlices.players2026) p26Map.set(p.id, p.games);
  }

  const t27Map = new Map<string, TeamGameLog[]>();
  if (seasonSlices?.teams2027) {
    for (const t of seasonSlices.teams2027) t27Map.set(t.abbreviation, t.games);
  }
  const t26Map = new Map<string, TeamGameLog[]>();
  if (seasonSlices?.teams2026) {
    for (const t of seasonSlices.teams2026) t26Map.set(t.abbreviation, t.games);
  }

  // ── 1. Jugadores (Motor Dinámico O(N) — 1 mejor racha por jugador y estadística) ──
  if (compiledPlayerChecks.length > 0) {
    for (const player of players) {
      const games = player.games;
      if (games.length < lowestPlayerMin) continue;

      const games2027 =
        p27Map.get(player.id) ??
        games.filter((g) => g.seasonLabel === '2026-27');
      const games2026 =
        p26Map.get(player.id) ??
        games.filter((g) => g.seasonLabel === '2025-26');

      if (games2027.length === 0) continue;

      const winSlice = games.slice(0, Math.min(windowSize, games.length));

      // Garantiza 1 única racha más destacada por (jugador, métrica, dirección)
      const bestPerStatKey = new Map<
        string,
        {
          check: (typeof compiledPlayerChecks)[number];
          candidate: DynamicStreakCandidate;
        }
      >();

      for (const c of compiledPlayerChecks) {
        const candidate = findBestDynamicStreak(
          games,
          c.rule,
          c.requiredGames,
          c.step,
          c.extract,
          c.passesGuards
        );
        if (!candidate) continue;

        const statKey = `${c.rule.metricId}:${c.rule.isPositive ? 'pos' : 'neg'}`;
        const prev = bestPerStatKey.get(statKey);
        if (!prev || candidate.score > prev.candidate.score) {
          bestPerStatKey.set(statKey, { check: c, candidate });
        }
      }

      if (bestPerStatKey.size === 0) continue;

      for (const { check: c, candidate } of bestPerStatKey.values()) {
        const count = candidate.count;
        const streakSlice = games.slice(0, count);
        const streakVal =
          c.sliceAvg(streakSlice) ?? round1(mean(streakSlice.map(c.extract)));
        const winRef =
          c.sliceAvg(winSlice) ?? round1(mean(winSlice.map(c.extract)));
        const currentSeasonAvg = c.sliceAvg(games2027);
        const prevSeasonAvg = c.sliceAvg(games2026);
        const fallbackBase =
          c.sliceAvg(games) ?? round1(mean(games.map(c.extract)));
        const seasonBase = currentSeasonAvg ?? prevSeasonAvg ?? fallbackBase;

        const dynamicLabel = formatDynamicStreakLabel(
          c.rule,
          candidate.dynamicThreshold
        );

        streaks.push({
          id: `streak-p-${player.id}-${c.rule.id}`,
          entityType: 'player',
          entityId: player.id,
          entityName: player.name,
          subtitle: `${player.teamAbbr} · ${player.position}`,
          teamAbbr: player.teamAbbr,
          streakLabel: `${count} PJ consecutivos`,
          metricLabel: c.rule.metricLabel,
          thresholdLabel: dynamicLabel,
          count,
          windowAvgDuringStreak: streakVal,
          seasonBaseline: seasonBase,
          currentSeasonAvg,
          currentSeasonGames: games2027.length,
          prevSeasonAvg,
          prevSeasonGames: games2026.length,
          isPositive: c.rule.isPositive,
          lastGameDate: games[0]?.date || '',
          breakoutAxis: c.rule.breakoutAxis ?? undefined,
          windowAvgRef: winRef,
          windowDeltaVsSeason: round1(winRef - seasonBase),
          unit: c.unit,
          ruleId: c.rule.id,
          ruleMetricId: c.rule.metricId,
          ruleOperator: c.rule.operator,
          ruleThreshold: candidate.dynamicThreshold,
          ruleMinMinutes: c.rule.minMinutes ?? null,
          ruleMinAttempts: c.rule.minAttempts ?? null,
        });
      }
    }
  }

  // ── 2. Equipos (Motor Dinámico O(N) — 1 mejor racha por equipo y estadística) ──
  if (compiledTeamChecks.length > 0) {
    for (const team of teams) {
      const games = team.games;
      if (games.length < lowestTeamMin) continue;

      const tGames2027 =
        t27Map.get(team.abbreviation) ??
        games.filter((g) => g.seasonLabel === '2026-27');
      const tGames2026 =
        t26Map.get(team.abbreviation) ??
        games.filter((g) => g.seasonLabel === '2025-26');

      if (tGames2027.length === 0) continue;

      const winSlice = games.slice(0, Math.min(windowSize, games.length));

      const bestPerStatKey = new Map<
        string,
        {
          check: (typeof compiledTeamChecks)[number];
          candidate: DynamicStreakCandidate;
        }
      >();

      for (const tc of compiledTeamChecks) {
        const candidate = findBestDynamicStreak(
          games,
          tc.rule,
          tc.requiredGames,
          tc.step,
          tc.extract,
          tc.passesGuards
        );
        if (!candidate) continue;

        const statKey = `${tc.rule.metricId}:${tc.rule.isPositive ? 'pos' : 'neg'}`;
        const prev = bestPerStatKey.get(statKey);
        if (!prev || candidate.score > prev.candidate.score) {
          bestPerStatKey.set(statKey, { check: tc, candidate });
        }
      }

      if (bestPerStatKey.size === 0) continue;

      for (const { check: tc, candidate } of bestPerStatKey.values()) {
        const count = candidate.count;
        const streakSlice = games.slice(0, count);
        const streakVal =
          tc.sliceAvg(streakSlice) ?? round1(mean(streakSlice.map(tc.extract)));
        const winRef =
          tc.sliceAvg(winSlice) ?? round1(mean(winSlice.map(tc.extract)));
        const currentSeasonAvg = tc.sliceAvg(tGames2027);
        const prevSeasonAvg = tc.sliceAvg(tGames2026);
        const fallbackBase =
          tc.sliceAvg(games) ?? round1(mean(games.map(tc.extract)));
        const seasonBase = currentSeasonAvg ?? prevSeasonAvg ?? fallbackBase;

        const isWin = tc.rule.metricId === 'team_win';
        const isLoss = tc.rule.metricId === 'team_loss';
        const dynamicLabel = formatDynamicStreakLabel(
          tc.rule,
          candidate.dynamicThreshold
        );

        streaks.push({
          id: `streak-t-${team.id}-${tc.rule.id}`,
          entityType: 'team',
          entityId: team.id,
          entityName: team.name,
          subtitle: `Conf. ${team.conference} · ${team.wins}-${team.losses}`,
          teamAbbr: team.abbreviation,
          streakLabel: isWin
            ? `${count} Victorias`
            : isLoss
            ? `${count} Derrotas`
            : `${count} PJ consecutivos`,
          metricLabel: tc.rule.metricLabel,
          thresholdLabel: dynamicLabel,
          count,
          windowAvgDuringStreak: streakVal,
          seasonBaseline: seasonBase,
          currentSeasonAvg,
          currentSeasonGames: tGames2027.length,
          prevSeasonAvg,
          prevSeasonGames: tGames2026.length,
          isPositive: tc.rule.isPositive,
          lastGameDate: games[0]?.date || '',
          breakoutAxis: tc.rule.breakoutAxis ?? undefined,
          windowAvgRef: winRef,
          windowDeltaVsSeason: round1(winRef - seasonBase),
          unit: tc.unit,
          ruleId: tc.rule.id,
          ruleMetricId: tc.rule.metricId,
          ruleOperator: tc.rule.operator,
          ruleThreshold: candidate.dynamicThreshold,
        });
      }
    }
  }

  return streaks.sort((a, b) => b.count - a.count);
}

/**
 * Evaluates a single rule dynamically, used by Admin live preview
 * to show exact active streak counts and the exact dynamic milestone detected.
 */
export function countSingleAutoStreakRuleMatches(
  players: PlayerSummary[],
  teams: TeamSummary[],
  rule: AutoStreakRuleConfig,
  globalMinGames: number
): {
  count: number;
  topExample: {
    name: string;
    teamAbbr: string;
    streak: number;
    thresholdLabel: string;
  } | null;
} {
  const singleConfig: AutoStreaksConfigValues = {
    minStreakGames: globalMinGames,
    rules: [{ ...rule, enabled: true, groupSingle: null }],
  };
  const matches = detectConfigurableActiveStreaks(
    players,
    teams,
    globalMinGames,
    5,
    undefined,
    singleConfig
  );
  const top = matches[0];
  return {
    count: matches.length,
    topExample: top
      ? {
          name: top.entityName,
          teamAbbr: top.teamAbbr,
          streak: top.count,
          thresholdLabel: top.thresholdLabel,
        }
      : null,
  };
}

export type NbaCalibrationPreset = 'nba_mean' | 'p75' | 'p90';

export interface NbaMetricBenchmark {
  entityType: 'player' | 'team';
  metricId: string;
  mean: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  sampleSize: number;
}

function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function roundBenchmark(val: number, step: number): number {
  if (step < 0.1) return Math.round(val * 100) / 100;
  if (step < 1) return Math.round(val * 10) / 10;
  return Math.round(val * 10) / 10;
}

/**
 * Computes live 2026-27 NBA league benchmarks (mean, P10, P25, P75, P90)
 * across all player metrics (rotation games with >=20 MIN + metric qualifiers)
 * and all team metrics. Used in Admin to show real NBA references and auto-calibrate thresholds.
 */
export function computeNbaStreakBenchmarks(
  players: PlayerSummary[],
  teams: TeamSummary[]
): Map<string, NbaMetricBenchmark> {
  const result = new Map<string, NbaMetricBenchmark>();

  // 1. Collect 2026-27 player rotation games (>=20 MIN) once
  const playerGames27: PlayerGameLog[] = [];
  for (const p of players) {
    for (const g of p.games) {
      if (g.seasonLabel === '2026-27' && g.minutes >= 20) {
        playerGames27.push(g);
      }
    }
  }
  // Fallback if 2026-27 is empty in test fixtures
  const effectivePlayerGames =
    playerGames27.length > 0
      ? playerGames27
      : players.flatMap((p) => p.games.filter((g) => g.minutes >= 20));

  for (const metricDef of STREAK_METRIC_OPTIONS) {
    if (isBinaryStreakMetric(metricDef.id)) continue;
    const vals: number[] = [];
    for (const g of effectivePlayerGames) {
      if (metricDef.qualifies && !metricDef.qualifies(g)) continue;
      const v = metricDef.getValue(g);
      if (Number.isFinite(v)) vals.push(v);
    }
    if (vals.length === 0) continue;
    vals.sort((a, b) => a - b);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const step = metricDef.step ?? 1;
    result.set(`player:${metricDef.id}`, {
      entityType: 'player',
      metricId: metricDef.id,
      mean: roundBenchmark(avg, step),
      p10: roundBenchmark(percentileSorted(vals, 0.1), step),
      p25: roundBenchmark(percentileSorted(vals, 0.25), step),
      p75: roundBenchmark(percentileSorted(vals, 0.75), step),
      p90: roundBenchmark(percentileSorted(vals, 0.9), step),
      sampleSize: vals.length,
    });
  }

  // 2. Collect 2026-27 team games once
  const teamGames27: TeamGameLog[] = [];
  for (const t of teams) {
    for (const g of t.games) {
      if (g.seasonLabel === '2026-27') {
        teamGames27.push(g);
      }
    }
  }
  const effectiveTeamGames =
    teamGames27.length > 0 ? teamGames27 : teams.flatMap((t) => t.games);

  for (const metricDef of TEAM_STREAK_METRIC_OPTIONS) {
    if (metricDef.isBinary || isBinaryStreakMetric(metricDef.id)) continue;
    const vals: number[] = [];
    for (const g of effectiveTeamGames) {
      const v = metricDef.getValue(g);
      if (Number.isFinite(v)) vals.push(v);
    }
    if (vals.length === 0) continue;
    vals.sort((a, b) => a - b);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const step = metricDef.step ?? 1;
    result.set(`team:${metricDef.id}`, {
      entityType: 'team',
      metricId: metricDef.id,
      mean: roundBenchmark(avg, step),
      p10: roundBenchmark(percentileSorted(vals, 0.1), step),
      p25: roundBenchmark(percentileSorted(vals, 0.25), step),
      p75: roundBenchmark(percentileSorted(vals, 0.75), step),
      p90: roundBenchmark(percentileSorted(vals, 0.9), step),
      sampleSize: vals.length,
    });
  }

  return result;
}

/**
 * Picks a clean step-aligned threshold for a given rule using the live NBA benchmark
 * and desired strictness preset (nba_mean, p75, or p90).
 */
export function computeCalibratedThresholdForRule(
  rule: AutoStreakRuleConfig,
  benchmark: NbaMetricBenchmark | undefined,
  preset: NbaCalibrationPreset,
  step: number,
  bounds: { min: number; max: number; isBinary: boolean }
): number | null {
  if (bounds.isBinary || !benchmark || benchmark.sampleSize === 0) return null;
  const isUpperBound = rule.operator === 'lte' || rule.operator === 'lt';

  let raw: number;
  if (preset === 'nba_mean') {
    raw = benchmark.mean;
  } else if (preset === 'p75') {
    raw = isUpperBound ? benchmark.p25 : benchmark.p75;
  } else {
    raw = isUpperBound ? benchmark.p10 : benchmark.p90;
  }

  const safeStep = step > 0 ? step : 1;
  // Quantize to natural metric step (conservative outward for strictness)
  const snapped = isUpperBound
    ? Math.floor(raw / safeStep) * safeStep
    : Math.ceil(raw / safeStep) * safeStep;
  const rounded = Math.round(snapped * 100) / 100;
  return Math.max(bounds.min, Math.min(bounds.max, rounded));
}
