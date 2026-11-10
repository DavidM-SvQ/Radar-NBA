import type {
  AnomalySignal,
  ComparisonMetricRow,
  FilterPresetId,
  PlayerSummary,
  StreakEntry,
  TeamSummary,
  ThresholdSettings,
  WindowSize,
} from '../types/nba';
import { formatSigned, mean, round1, stdDev } from './analytics';

export interface MetricBenchmark {
  mean: number;
  sd: number;
  lowerIsBetter?: boolean;
  decimals?: number;
  suffix?: string;
  isZeroSumBalance?: boolean;
  spreadMean?: number;
}

export interface LeagueBenchmarks {
  player: {
    pts: MetricBenchmark;
    reb: MetricBenchmark;
    oreb: MetricBenchmark;
    ast: MetricBenchmark;
    pra: MetricBenchmark;
    fg3m: MetricBenchmark;
    fg3Pct: MetricBenchmark;
    stocks: MetricBenchmark;
    tsPct: MetricBenchmark;
    usgPct: MetricBenchmark;
    efgPct: MetricBenchmark;
    gmSc: MetricBenchmark;
    pie: MetricBenchmark;
    min: MetricBenchmark;
  };
  team: {
    winPct: MetricBenchmark;
    avgPointsFor: MetricBenchmark;
    avgPointsAgainst: MetricBenchmark;
    differential: MetricBenchmark;
    offRtg: MetricBenchmark;
    defRtg: MetricBenchmark;
    netRtg: MetricBenchmark;
    pace: MetricBenchmark;
    efgPct: MetricBenchmark;
    tsPct: MetricBenchmark;
    orebPct: MetricBenchmark;
    tovPct: MetricBenchmark;
    fgmAvg: MetricBenchmark;
    fgaAvg: MetricBenchmark;
    fgPct: MetricBenchmark;
    fg3mAvg: MetricBenchmark;
    fg3aAvg: MetricBenchmark;
    fg3Pct: MetricBenchmark;
    ftmAvg: MetricBenchmark;
    ftaAvg: MetricBenchmark;
    ftPct: MetricBenchmark;
    astAvg: MetricBenchmark;
    tovAvg: MetricBenchmark;
    astTovRatio: MetricBenchmark;
    rebAvg: MetricBenchmark;
    orebAvg: MetricBenchmark;
    drebAvg: MetricBenchmark;
    ptsPaint: MetricBenchmark;
    oppPtsPaint: MetricBenchmark;
    pts2ndChance: MetricBenchmark;
    ptsFastBreak: MetricBenchmark;
    ptsOffTov: MetricBenchmark;
    stlAvg: MetricBenchmark;
    blkAvg: MetricBenchmark;
    contestedShots: MetricBenchmark;
    deflections: MetricBenchmark;
    boxOuts: MetricBenchmark;
    pctPts3p: MetricBenchmark;
    pctPtsPaint: MetricBenchmark;
  };
}

export interface LeagueEvaluation {
  pct: number; // 4..98, where 50 = exact NBA league average
  z: number;
  tierLabel: 'Élite NBA' | 'Destacado' | 'En media NBA' | 'Bajo media';
  textClass: string;
  barClass: string;
  avgFormatted: string;
}

export interface ColumnHelpEntry {
  title: string;
  simpleDesc: string;
  calculation: string;
  benchmarkText?: string;
}

export const FILTER_PRESETS: Record<
  Exclude<FilterPresetId, 'custom'>,
  {
    label: string;
    shortHint: string;
    values: Omit<ThresholdSettings, 'windowSize'>;
  }
> = {
  broad: {
    label: 'Amplio (Ver más)',
    shortHint: 'Detecta mejoras suaves y jugadores de rotación media',
    values: {
      minZScore: 0.9,
      minPctDelta: 12,
      minMinutes: 16,
      minStreakGames: 2,
    },
  },
  balanced: {
    label: 'Normal (Recomendado)',
    shortHint: 'Equilibrio ideal entre titulares y cambios claros',
    values: {
      minZScore: 1.2,
      minPctDelta: 16,
      minMinutes: 22,
      minStreakGames: 3,
    },
  },
  blockbusters: {
    label: 'Solo Bombazos',
    shortHint: 'Filtra únicamente explosiones o caídas extraordinarias',
    values: {
      minZScore: 1.8,
      minPctDelta: 24,
      minMinutes: 26,
      minStreakGames: 4,
    },
  },
};

export function detectActivePreset(settings: ThresholdSettings): FilterPresetId {
  for (const key of ['broad', 'balanced', 'blockbusters'] as const) {
    const p = FILTER_PRESETS[key].values;
    if (
      Math.abs(settings.minZScore - p.minZScore) < 0.05 &&
      settings.minPctDelta === p.minPctDelta &&
      settings.minMinutes === p.minMinutes &&
      settings.minStreakGames === p.minStreakGames
    ) {
      return key;
    }
  }
  return 'custom';
}

export function describeSliderSurpriseLevel(minZ: number): string {
  if (minZ <= 1.0) return 'Suave';
  if (minZ <= 1.35) return 'Normal';
  if (minZ <= 1.75) return 'Exigente';
  return 'Solo bombazos';
}

export function computeLeagueBenchmarks(
  players: PlayerSummary[],
  teams: TeamSummary[]
): LeagueBenchmarks {
  const rotPlayers = players.filter((p) => {
    if (p.games.length < 2) return false;
    return mean(p.games.map((g) => g.minutes)) >= 15;
  });
  const pPool =
    rotPlayers.length >= 20
      ? rotPlayers
      : players.filter((p) => p.games.length > 0);

  const buildStat = (
    vals: number[],
    fallbackMean: number,
    fallbackSd: number,
    opts?: {
      lowerIsBetter?: boolean;
      decimals?: number;
      suffix?: string;
      isZeroSumBalance?: boolean;
      spreadMean?: number;
    }
  ): MetricBenchmark => {
    if (vals.length < 5) {
      return {
        mean: fallbackMean,
        sd: fallbackSd,
        lowerIsBetter: opts?.lowerIsBetter,
        decimals: opts?.decimals ?? 1,
        suffix: opts?.suffix ?? '',
        isZeroSumBalance: opts?.isZeroSumBalance,
        spreadMean: opts?.spreadMean,
      };
    }
    const avg = opts?.isZeroSumBalance ? 0 : round1(mean(vals));
    const s = Math.max(fallbackSd * 0.45, round1(stdDev(vals)));
    return {
      mean: avg,
      sd: s,
      lowerIsBetter: opts?.lowerIsBetter,
      decimals: opts?.decimals ?? 1,
      suffix: opts?.suffix ?? '',
      isZeroSumBalance: opts?.isZeroSumBalance,
      spreadMean: opts?.spreadMean,
    };
  };

  const pPts = pPool.map((p) => mean(p.games.map((g) => g.points)));
  const pReb = pPool.map((p) => mean(p.games.map((g) => g.rebounds)));
  const pOreb = pPool.map((p) => mean(p.games.map((g) => g.oreb)));
  const pAst = pPool.map((p) => mean(p.games.map((g) => g.assists)));
  const pPra = pPool.map((p) => mean(p.games.map((g) => g.pra)));
  const pFg3m = pPool.map((p) => mean(p.games.map((g) => g.fg3m)));
  const pFg3Pct = pPool
    .map((p) => {
      const m = p.games.reduce((s, g) => s + g.fg3m, 0);
      const a = p.games.reduce((s, g) => s + g.fg3a, 0);
      return a >= 10 ? (m / a) * 100 : null;
    })
    .filter((v): v is number => v !== null);
  const pStocks = pPool.map((p) => mean(p.games.map((g) => g.stocks)));
  const pMin = pPool.map((p) => mean(p.games.map((g) => g.minutes)));
  const pGmSc = pPool.map((p) => mean(p.games.map((g) => g.gameScore)));
  const pUsg = pPool.map(
    (p) => p.advanced?.usgPct ?? mean(p.games.map((g) => g.usgEst))
  );
  const pTs = pPool.map((p) => {
    if (p.advanced?.tsPct) return p.advanced.tsPct;
    const fga = p.games.reduce((s, g) => s + g.fga, 0);
    const fta = p.games.reduce((s, g) => s + g.fta, 0);
    const pts = p.games.reduce((s, g) => s + g.points, 0);
    const denom = 2 * (fga + 0.44 * fta);
    return denom > 0 ? (pts / denom) * 100 : 56;
  });
  const pEfg = pPool.map(
    (p) => p.advanced?.efgPct ?? mean(p.games.map((g) => g.efgPct))
  );
  const pPie = pPool
    .map((p) => p.advanced?.pie ?? 0)
    .filter((v) => v > 0);

  const tPool = teams.filter(
    (t) => t.games.length > 0 || t.wins + t.losses > 0
  );

  const getTeamVal = (t: TeamSummary, key: string): number => {
    const games = t.games;
    switch (key) {
      case 'winPct': return t.winPct * 100;
      case 'avgPointsFor': return t.avgPointsFor || mean(games.map(g => g.pointsFor));
      case 'avgPointsAgainst': return t.avgPointsAgainst || mean(games.map(g => g.pointsAgainst));
      case 'differential': return t.differential;
      case 'offRtg': return t.advanced?.offRtg ?? mean(games.map(g => g.offRtg));
      case 'defRtg': return t.advanced?.defRtg ?? mean(games.map(g => g.defRtg));
      case 'netRtg': return t.advanced?.netRtg ?? (getTeamVal(t, 'offRtg') - getTeamVal(t, 'defRtg'));
      case 'pace': return t.advanced?.pace ?? mean(games.map(g => g.pace));
      case 'efgPct': return t.advanced?.efgPct ?? mean(games.map(g => g.efgPct));
      case 'tsPct': return t.advanced?.tsPct ?? mean(games.map(g => g.tsPct));
      case 'orebPct': return t.advanced?.orebPct ?? mean(games.map(g => g.orebPct));
      case 'tovPct': return t.advanced?.tovPct ?? mean(games.map(g => g.tovPct));
      case 'fgmAvg': return mean(games.map(g => g.fgm));
      case 'fgaAvg': return mean(games.map(g => g.fga));
      case 'fgPct': {
        const fga = games.reduce((s, g) => s + g.fga, 0);
        const fgm = games.reduce((s, g) => s + g.fgm, 0);
        return fga > 0 ? (fgm / fga) * 100 : 47;
      }
      case 'fg3mAvg': return mean(games.map(g => g.fg3m));
      case 'fg3aAvg': return mean(games.map(g => g.fg3a));
      case 'fg3Pct': {
        const fga = games.reduce((s, g) => s + g.fg3a, 0);
        const fgm = games.reduce((s, g) => s + g.fg3m, 0);
        return fga > 0 ? (fgm / fga) * 100 : 36;
      }
      case 'ftmAvg': return mean(games.map(g => g.ftm));
      case 'ftaAvg': return mean(games.map(g => g.fta));
      case 'ftPct': {
        const fta = games.reduce((s, g) => s + g.fta, 0);
        const ftm = games.reduce((s, g) => s + g.ftm, 0);
        return fta > 0 ? (ftm / fta) * 100 : 78;
      }
      case 'astAvg': return mean(games.map(g => g.ast));
      case 'tovAvg': return mean(games.map(g => g.tov));
      case 'astTovRatio': {
        const ast = mean(games.map(g => g.ast));
        const tov = mean(games.map(g => g.tov));
        return tov > 0 ? ast / tov : ast;
      }
      case 'rebAvg': return mean(games.map(g => g.reb));
      case 'orebAvg': return mean(games.map(g => g.oreb));
      case 'drebAvg': return mean(games.map(g => g.dreb));
      case 'ptsPaint': return t.advanced?.ptsPaint ?? 0;
      case 'oppPtsPaint': return t.advanced?.oppPtsPaint ?? 0;
      case 'pts2ndChance': return t.advanced?.pts2ndChance ?? 0;
      case 'ptsFastBreak': return t.advanced?.ptsFastBreak ?? 0;
      case 'ptsOffTov': return t.advanced?.ptsOffTov ?? 0;
      case 'stlAvg': return mean(games.map(g => g.stl));
      case 'blkAvg': return mean(games.map(g => g.blk));
      case 'contestedShots': return t.advanced?.contestedShots ?? 0;
      case 'deflections': return t.advanced?.deflections ?? 0;
      case 'boxOuts': return t.advanced?.boxOuts ?? 0;
      case 'pctPts3p': {
        const pts = getTeamVal(t, 'avgPointsFor');
        const fg3m = getTeamVal(t, 'fg3mAvg');
        return pts > 0 ? ((fg3m * 3) / pts) * 100 : 33;
      }
      case 'pctPtsPaint': {
        const pts = getTeamVal(t, 'avgPointsFor');
        const paint = getTeamVal(t, 'ptsPaint');
        return pts > 0 ? (paint / pts) * 100 : 42;
      }
      default: return 0;
    }
  };

  const tDiff = tPool.map((t) => t.differential);
  const tDiffAbs = tDiff.map((v) => Math.abs(v)).filter((v) => v > 0);
  const diffSpread = tDiffAbs.length >= 5 ? round1(mean(tDiffAbs)) : 4.8;
  const tNet = tPool.map((t) => getTeamVal(t, 'netRtg'));
  const tNetAbs = tNet.map((v) => Math.abs(v)).filter((v) => v > 0);
  const netSpread = tNetAbs.length >= 5 ? round1(mean(tNetAbs)) : 4.6;

  const getTeamPool = (key: string) => tPool.map(t => getTeamVal(t, key)).filter(v => v !== 0 || key.includes('differential') || key.includes('netRtg'));

  return {
    player: {
      pts: buildStat(pPts, 13.8, 6.2),
      reb: buildStat(pReb, 4.9, 2.4),
      oreb: buildStat(pOreb, 1.2, 0.9),
      ast: buildStat(pAst, 3.2, 2.1),
      pra: buildStat(pPra, 21.9, 9.2),
      fg3m: buildStat(pFg3m, 1.8, 1.1),
      fg3Pct: buildStat(pFg3Pct, 36.5, 4.8, { suffix: '%' }),
      stocks: buildStat(pStocks, 1.4, 0.6),
      tsPct: buildStat(pTs, 58.0, 4.8, { suffix: '%' }),
      usgPct: buildStat(pUsg, 19.6, 5.4, { suffix: '%' }),
      efgPct: buildStat(pEfg, 54.4, 5.2, { suffix: '%' }),
      gmSc: buildStat(pGmSc, 10.6, 4.9),
      pie: buildStat(pPie, 10.2, 3.4, { suffix: '%' }),
      min: buildStat(pMin, 25.5, 6.0),
    },
    team: {
      winPct: buildStat(getTeamPool('winPct'), 50, 15, { suffix: '%' }),
      avgPointsFor: buildStat(getTeamPool('avgPointsFor'), 114.2, 4.2),
      avgPointsAgainst: buildStat(getTeamPool('avgPointsAgainst'), 114.2, 4.2, { lowerIsBetter: true }),
      differential: buildStat(tDiff, 0.0, 4.8, {
        isZeroSumBalance: true,
        spreadMean: diffSpread,
        suffix: ' PTS',
      }),
      offRtg: buildStat(getTeamPool('offRtg'), 114.5, 3.6),
      defRtg: buildStat(getTeamPool('defRtg'), 114.5, 3.6, { lowerIsBetter: true }),
      netRtg: buildStat(tNet, 0.0, 4.6, {
        isZeroSumBalance: true,
        spreadMean: netSpread,
      }),
      pace: buildStat(getTeamPool('pace'), 99.6, 2.2),
      efgPct: buildStat(getTeamPool('efgPct'), 54.5, 2.1, { suffix: '%' }),
      tsPct: buildStat(getTeamPool('tsPct'), 58.0, 2.0, { suffix: '%' }),
      orebPct: buildStat(getTeamPool('orebPct'), 25.2, 2.4, { suffix: '%' }),
      tovPct: buildStat(getTeamPool('tovPct'), 13.8, 1.2, {
        lowerIsBetter: true,
        suffix: '%',
      }),
      fgmAvg: buildStat(getTeamPool('fgmAvg'), 42.5, 2.0),
      fgaAvg: buildStat(getTeamPool('fgaAvg'), 89.2, 3.0),
      fgPct: buildStat(getTeamPool('fgPct'), 47.6, 1.8, { suffix: '%' }),
      fg3mAvg: buildStat(getTeamPool('fg3mAvg'), 12.8, 2.0),
      fg3aAvg: buildStat(getTeamPool('fg3aAvg'), 35.4, 4.0),
      fg3Pct: buildStat(getTeamPool('fg3Pct'), 36.2, 2.2, { suffix: '%' }),
      ftmAvg: buildStat(getTeamPool('ftmAvg'), 17.5, 2.5),
      ftaAvg: buildStat(getTeamPool('ftaAvg'), 22.4, 3.0),
      ftPct: buildStat(getTeamPool('ftPct'), 78.4, 3.5, { suffix: '%' }),
      astAvg: buildStat(getTeamPool('astAvg'), 26.8, 2.5),
      tovAvg: buildStat(getTeamPool('tovAvg'), 14.2, 1.5, { lowerIsBetter: true }),
      astTovRatio: buildStat(getTeamPool('astTovRatio'), 1.85, 0.3),
      rebAvg: buildStat(getTeamPool('rebAvg'), 44.2, 3.0),
      orebAvg: buildStat(getTeamPool('orebAvg'), 10.5, 1.8),
      drebAvg: buildStat(getTeamPool('drebAvg'), 33.7, 2.5),
      ptsPaint: buildStat(getTeamPool('ptsPaint'), 48.5, 4.2),
      oppPtsPaint: buildStat(getTeamPool('oppPtsPaint'), 48.5, 4.2, { lowerIsBetter: true }),
      pts2ndChance: buildStat(getTeamPool('pts2ndChance'), 13.5, 2.2),
      ptsFastBreak: buildStat(getTeamPool('ptsFastBreak'), 14.2, 2.5),
      ptsOffTov: buildStat(getTeamPool('ptsOffTov'), 16.5, 2.8),
      stlAvg: buildStat(getTeamPool('stlAvg'), 7.5, 1.2),
      blkAvg: buildStat(getTeamPool('blkAvg'), 5.2, 1.0),
      contestedShots: buildStat(getTeamPool('contestedShots'), 60.5, 5.0),
      deflections: buildStat(getTeamPool('deflections'), 14.5, 2.0),
      boxOuts: buildStat(getTeamPool('boxOuts'), 16.2, 2.5),
      pctPts3p: buildStat(getTeamPool('pctPts3p'), 33.5, 4.0, { suffix: '%' }),
      pctPtsPaint: buildStat(getTeamPool('pctPtsPaint'), 42.5, 4.5, { suffix: '%' }),
    },
  };
}

export function evaluateVsLeague(
  value: number,
  bench: MetricBenchmark
): LeagueEvaluation {
  const rawDelta = bench.lowerIsBetter
    ? bench.mean - value
    : value - bench.mean;
  const z = rawDelta / Math.max(0.25, bench.sd);
  const pct = Math.max(4, Math.min(98, Math.round(50 + z * 22)));
  const avgFormatted =
    bench.isZeroSumBalance && bench.spreadMean !== undefined && bench.spreadMean > 0
      ? `±${bench.spreadMean.toFixed(bench.decimals ?? 1)}${bench.suffix ?? ''}`
      : `${bench.mean.toFixed(bench.decimals ?? 1)}${bench.suffix ?? ''}`;

  if (z >= 1.3) {
    return {
      pct,
      z,
      tierLabel: 'Élite NBA',
      textClass: 'text-emerald-400',
      barClass: 'bg-emerald-500',
      avgFormatted,
    };
  }
  if (z >= 0.45) {
    return {
      pct,
      z,
      tierLabel: 'Destacado',
      textClass: 'text-orange-300',
      barClass: 'bg-orange-400',
      avgFormatted,
    };
  }
  if (z > -0.45) {
    return {
      pct,
      z,
      tierLabel: 'En media NBA',
      textClass: 'text-slate-400',
      barClass: 'bg-slate-400',
      avgFormatted,
    };
  }
  return {
    pct,
    z,
    tierLabel: 'Bajo media',
    textClass: 'text-rose-400',
    barClass: 'bg-rose-500',
    avgFormatted,
  };
}

export function qualifyRecentDelta(pctDelta: number): {
  label: string;
  textClass: string;
} {
  if (pctDelta >= 20) {
    return { label: 'En racha explosiva', textClass: 'text-emerald-400' };
  }
  if (pctDelta >= 8) {
    return { label: 'Muy caliente', textClass: 'text-emerald-400' };
  }
  if (pctDelta <= -20) {
    return { label: 'Bajón fuerte', textClass: 'text-rose-400' };
  }
  if (pctDelta <= -8) {
    return { label: 'Frío reciente', textClass: 'text-amber-300' };
  }
  return { label: 'En su línea', textClass: 'text-slate-400' };
}

export function qualifyUsageRole(usgPct: number): {
  label: string;
  textClass: string;
} {
  if (usgPct >= 28.5) {
    return { label: '1ª Estrella', textClass: 'text-orange-300' };
  }
  if (usgPct >= 23.0) {
    return { label: '2ª Opción', textClass: 'text-slate-200' };
  }
  if (usgPct >= 17.5) {
    return { label: 'Titular / Apoyo', textClass: 'text-slate-400' };
  }
  return { label: 'Jugador de rol', textClass: 'text-slate-500' };
}

export function describeZScoreHuman(
  zScore: number,
  isGood: boolean
): {
  label: string;
  textClass: string;
} {
  const abs = Math.abs(zScore);
  if (abs >= 2.2) {
    return {
      label: isGood ? 'Bombazo histórico' : 'Desplome extremo',
      textClass: isGood
        ? 'text-emerald-400 font-semibold'
        : 'text-rose-400 font-semibold',
    };
  }
  if (abs >= 1.7) {
    return {
      label: isGood ? 'Subida muy fuerte' : 'Bajón muy fuerte',
      textClass: isGood
        ? 'text-emerald-400 font-medium'
        : 'text-rose-400 font-medium',
    };
  }
  if (abs >= 1.2) {
    return {
      label: isGood ? 'Cambio notable' : 'Bajada notable',
      textClass: isGood
        ? 'text-orange-300 font-medium'
        : 'text-amber-300 font-medium',
    };
  }
  return {
    label: isGood ? 'Mejora moderada' : 'Caída moderada',
    textClass: 'text-slate-300',
  };
}

export function plainMetricName(metricKey: string, fallback: string): string {
  switch (metricKey) {
    case 'points':
    case 'pts':
      return 'Puntos por partido';
    case 'rebounds':
    case 'reb':
      return 'Rebotes totales';
    case 'oreb':
      return 'Rebotes en ataque';
    case 'assists':
    case 'ast':
      return 'Asistencias (pases de canasta)';
    case 'pra':
      return 'Producción total (Puntos+Reb+Asist)';
    case 'gameScore':
      return 'Valoración global del partido';
    case 'usgEst':
      return 'Protagonismo con balón';
    case 'minutes':
    case 'min':
      return 'Minutos jugados';
    case 'tsPct':
      return 'Acierto real de tiro';
    case 'efgPct':
      return 'Puntería en tiros de campo';
    case 'fg3m':
      return 'Triples anotados por partido';
    case 'fg3Pct':
      return 'Acierto desde el triple';
    case 'fg3a':
      return 'Triples intentados por partido';
    case 'netRtg':
      return 'Dominio real del equipo';
    case 'offRtg':
      return 'Potencia de ataque';
    case 'defRtg':
      return 'Solidez defensiva';
    case 'pace':
      return 'Velocidad de partido';
    default:
      return fallback;
  }
}

export function isAnomalyPositive(
  sig: Pick<AnomalySignal, 'metricKey' | 'absDelta'>
): boolean {
  if (sig.metricKey === 'defRtg') {
    return sig.absDelta < 0;
  }
  return sig.absDelta >= 0;
}

export interface ResolvedStatBenchmark {
  value: number;
  benchmark: MetricBenchmark;
  showValueLabel: string;
  shortUnit: string;
}

export function resolveSignalBenchmark(
  sig: Pick<AnomalySignal, 'entityType' | 'metricKey' | 'windowAvg'>,
  benchmarks: LeagueBenchmarks
): ResolvedStatBenchmark {
  const val = sig.windowAvg;

  if (sig.entityType === 'team') {
    switch (sig.metricKey) {
      case 'defRtg':
        return {
          value: val,
          benchmark: { ...benchmarks.team.defRtg, suffix: ' DefRtg' },
          showValueLabel: `${val.toFixed(1)} DefRtg`,
          shortUnit: 'DefRtg',
        };
      case 'offRtg':
        return {
          value: val,
          benchmark: { ...benchmarks.team.offRtg, suffix: ' OffRtg' },
          showValueLabel: `${val.toFixed(1)} OffRtg`,
          shortUnit: 'OffRtg',
        };
      case 'pace':
        return {
          value: val,
          benchmark: { ...benchmarks.team.pace, suffix: ' Pace' },
          showValueLabel: `${val.toFixed(1)} Pace`,
          shortUnit: 'Pace',
        };
      case 'differential':
        return {
          value: val,
          benchmark: {
            ...benchmarks.team.differential,
            isZeroSumBalance: false,
            suffix: ' PTS',
          },
          showValueLabel: `${formatSigned(val, 1)} PTS`,
          shortUnit: 'PTS dif.',
        };
      case 'avgPointsFor':
        return {
          value: val,
          benchmark: { ...benchmarks.team.avgPointsFor, suffix: ' PTS' },
          showValueLabel: `${val.toFixed(1)} PTS`,
          shortUnit: 'PTS',
        };
      case 'netRtg':
      default:
        return {
          value: val,
          benchmark: {
            ...benchmarks.team.netRtg,
            isZeroSumBalance: false,
            suffix: ' NetRtg',
          },
          showValueLabel: `${formatSigned(val, 1)} NetRtg`,
          shortUnit: 'NetRtg',
        };
    }
  }

  switch (sig.metricKey) {
    case 'rebounds':
    case 'reb':
      return {
        value: val,
        benchmark: { ...benchmarks.player.reb, suffix: ' REB' },
        showValueLabel: `${val.toFixed(1)} REB`,
        shortUnit: 'REB',
      };
    case 'oreb':
      return {
        value: val,
        benchmark: { ...benchmarks.player.oreb, suffix: ' OR' },
        showValueLabel: `${val.toFixed(1)} OR`,
        shortUnit: 'OR',
      };
    case 'assists':
    case 'ast':
      return {
        value: val,
        benchmark: { ...benchmarks.player.ast, suffix: ' AST' },
        showValueLabel: `${val.toFixed(1)} AST`,
        shortUnit: 'AST',
      };
    case 'pra':
      return {
        value: val,
        benchmark: { ...benchmarks.player.pra, suffix: ' PRA' },
        showValueLabel: `${val.toFixed(1)} PRA`,
        shortUnit: 'PRA',
      };
    case 'gameScore':
    case 'gmSc':
      return {
        value: val,
        benchmark: { ...benchmarks.player.gmSc, suffix: ' GmSc' },
        showValueLabel: `${val.toFixed(1)} GmSc`,
        shortUnit: 'GmSc',
      };
    case 'usgEst':
    case 'usgPct':
      return {
        value: val,
        benchmark: { ...benchmarks.player.usgPct, suffix: '% USG' },
        showValueLabel: `${val.toFixed(1)}% USG`,
        shortUnit: 'USG%',
      };
    case 'minutes':
    case 'min':
      return {
        value: val,
        benchmark: { ...benchmarks.player.min, suffix: ' MIN' },
        showValueLabel: `${val.toFixed(1)} MIN`,
        shortUnit: 'MIN',
      };
    case 'tsPct':
      return {
        value: val,
        benchmark: { ...benchmarks.player.tsPct, suffix: '% TS' },
        showValueLabel: `${val.toFixed(1)}% TS`,
        shortUnit: 'TS%',
      };
    case 'efgPct':
      return {
        value: val,
        benchmark: { ...benchmarks.player.efgPct, suffix: '% eFG' },
        showValueLabel: `${val.toFixed(1)}% eFG`,
        shortUnit: 'eFG%',
      };
    case 'fg3m':
      return {
        value: val,
        benchmark: { ...benchmarks.player.fg3m, suffix: ' 3PM' },
        showValueLabel: `${val.toFixed(1)} 3PM`,
        shortUnit: '3PM',
      };
    case 'fg3Pct':
      return {
        value: val,
        benchmark: { ...benchmarks.player.fg3Pct, suffix: '% 3P' },
        showValueLabel: `${val.toFixed(1)}% 3P`,
        shortUnit: '3P%',
      };
    case 'points':
    case 'pts':
    default:
      return {
        value: val,
        benchmark: { ...benchmarks.player.pts, suffix: ' PTS' },
        showValueLabel: `${val.toFixed(1)} PTS`,
        shortUnit: 'PTS',
      };
  }
}

export function resolveStreakBenchmark(
  st: Pick<
    StreakEntry,
    'id' | 'entityType' | 'metricLabel' | 'windowAvgDuringStreak'
  >,
  benchmarks: LeagueBenchmarks
): ResolvedStatBenchmark {
  const val = st.windowAvgDuringStreak;

  if (st.entityType === 'team' || st.metricLabel === 'Net Rating') {
    return {
      value: val,
      benchmark: {
        ...benchmarks.team.netRtg,
        isZeroSumBalance: false,
        suffix: ' NetRtg',
      },
      showValueLabel: `${formatSigned(val, 1)} NetRtg`,
      shortUnit: 'NetRtg',
    };
  }

  if (st.id.includes('-reb') || st.metricLabel === 'Rebotes') {
    return {
      value: val,
      benchmark: { ...benchmarks.player.reb, suffix: ' REB' },
      showValueLabel: `${val.toFixed(1)} REB`,
      shortUnit: 'REB',
    };
  }
  if (st.id.includes('-ast') || st.metricLabel === 'Asistencias') {
    return {
      value: val,
      benchmark: { ...benchmarks.player.ast, suffix: ' AST' },
      showValueLabel: `${val.toFixed(1)} AST`,
      shortUnit: 'AST',
    };
  }
  if (st.id.includes('-3pct') || st.metricLabel === 'Acierto Triple') {
    return {
      value: val,
      benchmark: { ...benchmarks.player.fg3Pct, suffix: '% 3P' },
      showValueLabel: `${val.toFixed(1)}% 3P`,
      shortUnit: '3P%',
    };
  }
  if (st.id.includes('-3pm') || st.metricLabel === 'Triples') {
    return {
      value: val,
      benchmark: { ...benchmarks.player.fg3m, suffix: ' 3PM' },
      showValueLabel: `${val.toFixed(1)} 3PM`,
      shortUnit: '3PM',
    };
  }
  if (st.id.includes('-min') || st.metricLabel === 'Minutos') {
    return {
      value: val,
      benchmark: { ...benchmarks.player.min, suffix: ' MIN' },
      showValueLabel: `${val.toFixed(1)} MIN`,
      shortUnit: 'MIN',
    };
  }
  if (st.id.includes('-usg') || st.metricLabel === 'Uso Ofensivo') {
    return {
      value: val,
      benchmark: { ...benchmarks.player.usgPct, suffix: '% USG' },
      showValueLabel: `${val.toFixed(1)}% USG`,
      shortUnit: 'USG%',
    };
  }
  if (st.id.includes('-gmsc') || st.metricLabel === 'Game Score') {
    return {
      value: val,
      benchmark: { ...benchmarks.player.gmSc, suffix: ' GmSc' },
      showValueLabel: `${val.toFixed(1)} GmSc`,
      shortUnit: 'GmSc',
    };
  }
  if (
    st.id.includes('-cold_ts') ||
    st.id.includes('-hot_ts') ||
    st.metricLabel === 'Tiro Verdadero'
  ) {
    return {
      value: val,
      benchmark: { ...benchmarks.player.tsPct, suffix: '% TS' },
      showValueLabel: `${val.toFixed(1)}% TS`,
      shortUnit: 'TS%',
    };
  }
  if (st.id.includes('-efg') || st.metricLabel === 'Tiro Efectivo') {
    return {
      value: val,
      benchmark: { ...benchmarks.player.efgPct, suffix: '% eFG' },
      showValueLabel: `${val.toFixed(1)}% eFG`,
      shortUnit: 'eFG%',
    };
  }

  return {
    value: val,
    benchmark: { ...benchmarks.player.pts, suffix: ' PTS' },
    showValueLabel: `${val.toFixed(1)} PTS`,
    shortUnit: 'PTS',
  };
}

export function plainAnomalyExplanation(sig: AnomalySignal): {
  headline: string;
  detail: string;
} {
  const isInverse = sig.metricKey === 'defRtg';
  const isUp = sig.absDelta >= 0;
  const isGood = isInverse ? !isUp : isUp;

  if (sig.entityType === 'player') {
    if (sig.category === 'exterior_shift') {
      if (sig.metricKey === 'fg3Pct') {
        return isUp
          ? {
              headline: 'Muñeca ardiendo desde la línea de tres puntos',
              detail: `Acierta el ${sig.windowAvg.toFixed(
                1
              )}% de sus triples en los últimos ${sig.sampleGames} partidos frente al ${sig.baselineAvg.toFixed(
                1
              )}% de su temporada.`,
            }
          : {
              headline: 'Sequía desde el perímetro en los últimos partidos',
              detail: `Baja al ${sig.windowAvg.toFixed(
                1
              )}% de acierto en triples recientemente (su media habitual es ${sig.baselineAvg.toFixed(
                1
              )}%).`,
            };
      }
      return isUp
        ? {
            headline: 'Explosión de triples anotados por partido',
            detail: `Encesta ${sig.windowAvg.toFixed(
              1
            )} triples por noche en sus últimos ${sig.sampleGames} encuentros frente a ${sig.baselineAvg.toFixed(
              1
            )} habituales.`,
          }
        : {
            headline: 'Frenazo en su producción desde el triple',
            detail: `Pasa de convertir ${sig.baselineAvg.toFixed(
              1
            )} triples por noche a solo ${sig.windowAvg.toFixed(1)} en el tramo reciente.`,
          };
    }

    if (sig.category === 'shooting_variance') {
      return isUp
        ? {
            headline: 'Racha de puntería extraordinaria (cuesta mantenerla)',
            detail: `Está metiendo un porcentaje altísimo de sus tiros recientes (${sig.windowAvg.toFixed(
              1
            )}% frente a su ${sig.baselineAvg.toFixed(1)}% normal).`,
          }
        : {
            headline: 'Mala racha de cara al aro (candidato a recuperarse)',
            detail: `Sus tiros no están entrando (${sig.windowAvg.toFixed(
              1
            )}% frente a su ${sig.baselineAvg.toFixed(
              1
            )}% habitual), pero sigue intentándolo en pista.`,
          };
    }

    if (sig.category === 'role_shift') {
      if (sig.metricKey === 'minutes') {
        return isUp
          ? {
              headline: 'El entrenador le está dando muchos más minutos',
              detail: `Ha subido de ${sig.baselineAvg.toFixed(
                1
              )} a ${sig.windowAvg.toFixed(
                1
              )} minutos por noche en sus últimos ${sig.sampleGames} partidos.`,
            }
          : {
              headline: 'Ha perdido tiempo en la rotación reciente',
              detail: `Baja de ${sig.baselineAvg.toFixed(
                1
              )} a ${sig.windowAvg.toFixed(
                1
              )} minutos por encuentro en el tramo reciente.`,
            };
      }
      return isUp
        ? {
            headline: 'Asume muchos más tiros y jugadas de su equipo',
            detail: `Finaliza el ${sig.windowAvg.toFixed(
              1
            )}% de los ataques cuando está en cancha (su media era ${sig.baselineAvg.toFixed(
              1
            )}%).`,
          }
        : {
            headline: 'Tiene menos balón en ataque últimamente',
            detail: `Ha pasado de finalizar el ${sig.baselineAvg.toFixed(
              1
            )}% de las jugadas al ${sig.windowAvg.toFixed(1)}% reciente.`,
          };
    }

    if (sig.sustainabilityTone === 'warning') {
      return isUp
        ? {
            headline: 'Anota más por puntería caliente que por jugar más',
            detail: `Sube a ${sig.windowAvg.toFixed(
              1
            )} sin apenas ganar minutos extra; depende de que siga enchufado en el tiro.`,
          }
        : {
            headline: 'Bajón por mala puntería, pero mantiene su rol intacto',
            detail:
              'Sigue jugando sus minutos habituales; lo normal es que sus números vuelvan a subir pronto.',
          };
    }

    return isGood
      ? {
          headline: 'Subida muy sólida respaldada por minutos y tiros',
          detail: `Pasa de ${sig.baselineAvg.toFixed(
            1
          )} a ${sig.windowAvg.toFixed(
            1
          )} de media en sus últimos ${sig.sampleGames} encuentros con mayor peso en el equipo.`,
        }
      : {
          headline: 'Caída clara de aportación en los últimos partidos',
          detail: `Baja de ${sig.baselineAvg.toFixed(
            1
          )} a ${sig.windowAvg.toFixed(
            1
          )} en sus últimos ${sig.sampleGames} partidos disputados.`,
        };
  }

  if (sig.metricKey === 'defRtg') {
    return isGood
      ? {
          headline: 'Cerrojo atrás: deja a los rivales en muy pocos puntos',
          detail: `Su defensa ha mejorado notablemente en los últimos ${sig.sampleGames} partidos respecto al resto del año.`,
        }
      : {
          headline: 'Defensa con fisuras: encaja bastante más de lo habitual',
          detail: `Los rivales están anotando con mucha más facilidad contra ellos en estas últimas ${sig.sampleGames} jornadas.`,
        };
  }

  if (sig.metricKey === 'pace') {
    return isUp
      ? {
          headline: 'Partidos de ida y vuelta mucho más rápidos',
          detail:
            'Están corriendo más la pista y jugando posesiones más cortas, lo que infla los marcadores.',
        }
      : {
          headline: 'Baloncesto más pausado y de ataques largos',
          detail:
            'Han frenado el ritmo de sus partidos recientes buscando posesiones más elaboradas.',
        };
  }

  if (sig.metricKey === 'offRtg') {
    return isGood
      ? {
          headline: 'Ataque en estado de gracia y muy efectivo',
          detail: `Aprovechan mucho mejor cada ataque en sus últimos ${sig.sampleGames} compromisos.`,
        }
      : {
          headline: 'Atasco ofensivo en las últimas jornadas',
          detail:
            'Les está costando bastante más conseguir canastas limpias que en su media de temporada.',
        };
  }

  return isGood
    ? {
        headline: 'Dominio colectivo claro frente a sus rivales recientes',
        detail: `Superan a sus oponentes con mucha más solvencia en estos últimos ${sig.sampleGames} partidos.`,
      }
    : {
        headline: 'Bache colectivo: pierden terreno en el marcador',
        detail:
          'Su diferencia de puntos contra los rivales ha empeorado de forma clara últimamente.',
      };
}

export function computePlainPlayerTakeaways(
  player: PlayerSummary,
  windowSize: WindowSize,
  benchmarks: LeagueBenchmarks
): string[] {
  const games = player.games;
  if (games.length < 2) {
    return [
      'Todavía lleva muy pocos partidos jugados para extraer patrones claros.',
    ];
  }

  const winSlice = games.slice(0, Math.min(windowSize, games.length));
  const notes: string[] = [];

  const basePts = mean(games.map((g) => g.points));
  const winPts = mean(winSlice.map((g) => g.points));
  const ptsDiff = winPts - basePts;

  const baseMin = mean(games.map((g) => g.minutes));
  const winMin = mean(winSlice.map((g) => g.minutes));
  const minDiff = winMin - baseMin;

  const baseFga = mean(games.map((g) => g.fga));
  const winFga = mean(winSlice.map((g) => g.fga));
  const fgaDiff = winFga - baseFga;

  const ptsEval = evaluateVsLeague(basePts, benchmarks.player.pts);
  notes.push(
    `Nivel frente a la NBA: promedia ${basePts.toFixed(
      1
    )} puntos por noche (${ptsEval.tierLabel.toLowerCase()}, la media de rotación NBA es ${benchmarks.player.pts.mean.toFixed(
      1
    )}).`
  );

  if (Math.abs(ptsDiff) >= 2.5) {
    if (ptsDiff > 0 && (minDiff >= 2.5 || fgaDiff >= 2.0)) {
      notes.push(
        `Está en plena subida real: anota ${winPts.toFixed(
          1
        )} puntos en sus últimos ${
          winSlice.length
        } partidos porque juega más tiempo (${winMin.toFixed(
          1
        )} min) y tira más veces a canasta.`
      );
    } else if (ptsDiff > 0) {
      notes.push(
        `Muñeca caliente: sube a ${winPts.toFixed(
          1
        )} puntos recientes gracias a un gran acierto en el tiro, manteniendo casi los mismos minutos.`
      );
    } else {
      notes.push(
        `Tramo más discreto: promedia ${winPts.toFixed(
          1
        )} puntos en los últimos ${winSlice.length} encuentros (${formatSigned(
          ptsDiff
        )} respecto a su media habitual).`
      );
    }
  }

  const homeGames = games.filter((g) => g.isHome);
  const awayGames = games.filter((g) => !g.isHome);
  if (homeGames.length >= 3 && awayGames.length >= 3) {
    const homePts = mean(homeGames.map((g) => g.points));
    const awayPts = mean(awayGames.map((g) => g.points));
    const splitDiff = homePts - awayPts;
    if (Math.abs(splitDiff) >= 2.8) {
      notes.push(
        splitDiff > 0
          ? `Se crece jugando en casa: anota ${homePts.toFixed(
              1
            )} puntos ante su público frente a ${awayPts.toFixed(
              1
            )} cuando viaja.`
          : `Rinde mejor fuera de casa: sube a ${awayPts.toFixed(
              1
            )} puntos como visitante frente a ${homePts.toFixed(
              1
            )} en su pabellón.`
      );
    }
  }

  if (player.advanced) {
    const adv = player.advanced;
    if (adv.ptsPaint >= 10) {
      notes.push(
        `Especialista cerca del aro: consigue ${adv.ptsPaint.toFixed(
          1
        )} puntos por noche pisando la zona interior.`
      );
    } else if (adv.deflections >= 2.8 || adv.contestedShots >= 8.5) {
      notes.push(
        `Gran trabajo defensivo sin balón: desvía ${adv.deflections.toFixed(
          1
        )} pases y puntea ${adv.contestedShots.toFixed(
          1
        )} tiros rivales por noche.`
      );
    }
  }

  const ptsSd = stdDev(games.map((g) => g.points));
  if (games.length >= 4) {
    const floor = Math.max(0, basePts - ptsSd);
    const ceil = basePts + ptsSd;
    notes.push(
      `Lo normal en una noche suya es moverse entre ${floor.toFixed(
        0
      )} y ${ceil.toFixed(0)} puntos.`
    );
  }

  return notes;
}

export function computePlainTeamTakeaways(
  team: TeamSummary,
  windowSize: WindowSize,
  benchmarks: LeagueBenchmarks
): string[] {
  const games = team.games;
  if (games.length < 2) {
    return [
      'Pocos partidos completados todavía en este filtro de temporada.',
    ];
  }

  const winSlice = games.slice(0, Math.min(windowSize, games.length));
  const notes: string[] = [];

  const recentWins = winSlice.filter((g) => g.result === 'W').length;
  const recentDiff = mean(winSlice.map((g) => g.differential));

  notes.push(
    `Momento actual: ha ganado ${recentWins} de sus últimos ${
      winSlice.length
    } partidos con una diferencia media de ${formatSigned(
      recentDiff
    )} puntos en el marcador.`
  );

  const offEval = evaluateVsLeague(
    team.avgPointsFor,
    benchmarks.team.avgPointsFor
  );
  const defEval = evaluateVsLeague(
    team.avgPointsAgainst,
    benchmarks.team.avgPointsAgainst
  );

  notes.push(
    `Perfil frente a la NBA: anota ${team.avgPointsFor.toFixed(
      1
    )} puntos (${offEval.tierLabel.toLowerCase()}) y recibe ${team.avgPointsAgainst.toFixed(
      1
    )} (${defEval.tierLabel.toLowerCase()} en defensa; media NBA: ${benchmarks.team.avgPointsFor.mean.toFixed(
      1
    )}).`
  );

  if (team.advanced) {
    if (team.advanced.pace >= benchmarks.team.pace.mean + 1.8) {
      notes.push(
        'Juega un baloncesto muy rápido de posesiones cortas, por lo que sus partidos suelen tener marcadores altos.'
      );
    } else if (team.advanced.pace <= benchmarks.team.pace.mean - 1.8) {
      notes.push(
        'Prefiere ataques largos y ritmo pausado, controlando el reloj y bajando el tanteo total.'
      );
    }
  }

  return notes;
}

export function computePlainComparisonInsights(
  entityType: 'player' | 'team',
  rows: ComparisonMetricRow[]
): string[] {
  const findRow = (k: string) => rows.find((r) => r.key === k);
  const out: string[] = [];

  if (entityType === 'player') {
    const pts = findRow('pts');
    const min = findRow('min');
    const fg = findRow('fgPct');
    const reb = findRow('reb');
    const ast = findRow('ast');

    if (pts && Math.abs(pts.absDiff) >= 1.8) {
      out.push(
        pts.absDiff > 0
          ? `Anota ${formatSigned(
              pts.absDiff
            )} puntos más por partido en el Tramo A (${pts.rangeAValue.toFixed(
              1
            )} frente a ${pts.rangeBValue.toFixed(1)} en el Tramo B).`
          : `Baja ${Math.abs(pts.absDiff).toFixed(
              1
            )} puntos por partido en el Tramo A (${pts.rangeAValue.toFixed(
              1
            )} frente a ${pts.rangeBValue.toFixed(1)}).`
      );
    }
    if (min && Math.abs(min.absDiff) >= 2.2) {
      out.push(
        min.absDiff > 0
          ? `Cuenta con más confianza en cancha: juega ${formatSigned(
              min.absDiff
            )} minutos extra por encuentro.`
          : `Juega ${Math.abs(min.absDiff).toFixed(
              1
            )} minutos menos por noche en este tramo.`
      );
    }
    if (fg && Math.abs(fg.absDiff) >= 3.5) {
      out.push(
        fg.absDiff > 0
          ? `Está mucho más acertado tirando a canasta (${fg.rangeAValue.toFixed(
              1
            )}% de acierto frente a ${fg.rangeBValue.toFixed(1)}%).`
          : `Le está costando más meter sus tiros (${fg.rangeAValue.toFixed(
              1
            )}% frente a ${fg.rangeBValue.toFixed(1)}%).`
      );
    }
    if (reb && Math.abs(reb.absDiff) >= 1.5) {
      out.push(
        `En el rebote pasa de ${reb.rangeBValue.toFixed(
          1
        )} a ${reb.rangeAValue.toFixed(1)} capturas por partido (${formatSigned(
          reb.absDiff
        )}).`
      );
    }
    if (ast && Math.abs(ast.absDiff) >= 1.3) {
      out.push(
        `Reparte ${ast.rangeAValue.toFixed(
          1
        )} pases de canasta frente a ${ast.rangeBValue.toFixed(
          1
        )} en el tramo de referencia.`
      );
    }
    if (out.length === 0) {
      out.push(
        'Sus números principales de puntos, minutos y acierto son muy parecidos entre ambos tramos.'
      );
    }
    return out;
  }

  const pf = findRow('pf');
  const pa = findRow('pa');
  const winPct = findRow('winPct');
  if (winPct && Math.abs(winPct.absDiff) >= 8) {
    out.push(
      winPct.absDiff > 0
        ? `Gana muchos más partidos en el Tramo A (${winPct.rangeAValue.toFixed(
            0
          )}% de victorias frente al ${winPct.rangeBValue.toFixed(0)}%).`
        : `Su porcentaje de victorias cae del ${winPct.rangeBValue.toFixed(
            0
          )}% al ${winPct.rangeAValue.toFixed(0)}% en el Tramo A.`
    );
  }
  if (pf && Math.abs(pf.absDiff) >= 2.5) {
    out.push(
      `En ataque pasa de anotar ${pf.rangeBValue.toFixed(
        1
      )} a ${pf.rangeAValue.toFixed(1)} puntos por partido (${formatSigned(
        pf.absDiff
      )}).`
    );
  }
  if (pa && Math.abs(pa.absDiff) >= 2.5) {
    out.push(
      pa.absDiff < 0
        ? `Defiende mejor: encaja ${Math.abs(pa.absDiff).toFixed(
            1
          )} puntos menos por noche (${pa.rangeAValue.toFixed(
            1
          )} vs ${pa.rangeBValue.toFixed(1)}).`
        : `Recibe ${formatSigned(pa.absDiff)} puntos más en contra por encuentro.`
    );
  }
  if (out.length === 0) {
    out.push(
      'El rendimiento en ataque y defensa se mantiene muy estable entre ambos periodos.'
    );
  }
  return out;
}

export const COLUMN_HELP: Record<string, ColumnHelpEntry> = {
  trendBreakouts: {
    title: 'Alertas de Rupturas de Tendencia',
    simpleDesc:
      'Detecta automáticamente jugadores que acaban de romper su guion habitual de la temporada en tres ejes clave: tiro exterior, minutos/uso y eficiencia.',
    calculation:
      'Compara el tramo reciente configurable (Últimos 3, 5 o 10 partidos) frente a su línea base de temporada filtrando muestras sin volumen real.',
    benchmarkText:
      'Distingue cambios estructurales (más minutos/tiros) de rachas de puntería sujetas a regresión.',
  },
  breakoutExterior: {
    title: 'Ruptura en Tiro Exterior (3P% · 3PM · 3PA)',
    simpleDesc:
      'Identifica explosiones o sequías desde el triple combinando triples anotados (3PM), volumen lanzado (3PA) y precisión agregada (3P%).',
    calculation:
      'Porcentaje ponderado real (∑3PM / ∑3PA) y promedio 3PM/PJ en la ventana reciente frente al acumulado de temporada (con filtro mínimo de volumen exterior).',
    benchmarkText:
      'Si sube 3PA + 3P% hay luz verde táctica; si sube solo 3P% sin más tiros suele haber regresión.',
  },
  breakoutMinutesUsage: {
    title: 'Ruptura en Minutos y Uso (MIN · USG% · TCI)',
    simpleDesc:
      'Señala qué jugadores están ganando o perdiendo protagonismo real en la rotación del entrenador y en el balón ofensivo.',
    calculation:
      'Cruza la variación de Minutos (MIN/PJ), Ratio de Uso Ofensivo (USG%) y Tiros de Campo Intentados (TCI/PJ) respecto a su media de temporada.',
    benchmarkText:
      'El indicador más fiable para anticipar subidas o bajadas duraderas de producción.',
  },
  breakoutEfficiency: {
    title: 'Ruptura en Eficiencia Anotadora (TS% · eFG% · GmSc)',
    simpleDesc:
      'Mide picos de estado de gracia o baches profundos convirtiendo posesiones de tiro en puntos.',
    calculation:
      'True Shooting ponderado real ∑PTS / (2 × (∑FGA + 0.44 × ∑FTA)) y eFG% de la ventana reciente frente a la temporada.',
    benchmarkText:
      'Baches fuertes de TS% manteniendo minutos y USG% intactos señalan candidatos claros a rebote positivo.',
  },
  multiWindowCompare: {
    title: 'Trayectoria Multi-Ventana (Temp → 10PJ → 5PJ → 3PJ)',
    simpleDesc:
      'Muestra de un vistazo cómo evoluciona el dato desde su media de temporada hasta sus últimos 10, 5 y 3 partidos.',
    calculation:
      'Calcula la métrica exacta sobre toda la temporada cargada y sobre los subconjuntos de los últimos 10, 5 y 3 partidos disputados.',
    benchmarkText:
      'Si 10PJ → 5PJ → 3PJ acelera en la misma dirección, la ruptura está ganando fuerza.',
  },
  baselineAvg: {
    title: 'Media habitual de temporada',
    simpleDesc:
      'Indica el rendimiento normal de este jugador o equipo a lo largo de todos sus partidos cargados.',
    calculation:
      'Suma total de la estadística en todos sus partidos disputados dividida entre el número total de partidos (PJ).',
    benchmarkText:
      'Sirve como línea base para detectar si ahora rinde por encima o por debajo de su nivel.',
  },
  windowAvg: {
    title: 'Promedio en el tramo reciente',
    simpleDesc:
      'Mide su rendimiento actual en los últimos partidos seleccionados (3, 5 o 10 encuentros, o durante una racha activa).',
    calculation:
      'Suma de la estadística en los últimos N partidos jugados dividida entre N.',
    benchmarkText:
      'Si supera claramente a su media habitual, atraviesa un momento caliente.',
  },
  pctDelta: {
    title: 'Variación porcentual (Cambio %)',
    simpleDesc:
      'Muestra cuánto han subido (▲) o bajado (▼) sus números recientes en porcentaje frente a su promedio habitual.',
    calculation:
      '((Promedio Reciente − Media Habitual) / |Media Habitual|) × 100.',
    benchmarkText: 'Variaciones de ±15% o más reflejan cambios muy notables en pista.',
  },
  absDiff: {
    title: 'Diferencia neta entre tramos',
    simpleDesc:
      'Indica cuántas unidades exactas (puntos, rebotes o puntos porcentuales) sube o baja del Tramo B al Tramo A.',
    calculation: 'Resta directa: Valor medio del Tramo A − Valor medio del Tramo B.',
    benchmarkText: 'En métricas defensivas o pérdidas, bajar (−) es positivo.',
  },
  zScore: {
    title: 'Nivel de sorpresa estadística (Z-Score σ)',
    simpleDesc:
      'Mide cómo de extraordinario es el cambio reciente teniendo en cuenta lo regular o irregular que suele ser ese jugador.',
    calculation:
      '(Promedio Reciente − Media Habitual) dividido entre la desviación típica (σ) de sus partidos.',
    benchmarkText:
      '1.2σ = cambio claro · 1.8σ = muy fuerte · 2.2σ+ = explosión o desplome histórico.',
  },
  magnitudeSimple: {
    title: 'Magnitud de la sorpresa',
    simpleDesc:
      'Traduce a lenguaje cotidiano cómo de inusual es la subida o bajada reciente respecto a lo que suele hacer.',
    calculation:
      'Clasifica la desviación típica Z (|Promedio Reciente − Media| / σ) en niveles: moderada, notable, muy fuerte o bombazo.',
    benchmarkText:
      'Cuanto mayor sea la magnitud, menos probable es que se deba al azar.',
  },
  minBase: {
    title: 'Minutos jugados por partido (MIN)',
    simpleDesc:
      'Tiempo medio que permanece el jugador en cancha cada noche (un partido NBA sin prórroga dura 48 minutos).',
    calculation: 'Minutos totales en pista divididos entre los partidos jugados (MIN / PJ).',
    benchmarkText:
      '32+ min = estrella titular · 24–30 min = titular · <18 min = rotación.',
  },
  ptsBase: {
    title: 'Puntos por partido (PTS)',
    simpleDesc:
      'Anotación media que consigue cada noche sumando canastas de dos, triples y tiros libres.',
    calculation:
      '(2 × Tiros de 2 anotados + 3 × Triples anotados + 1 × Tiros libres anotados) / Partidos jugados.',
    benchmarkText:
      '25+ PTS = superestrella · 15–20 PTS = gran anotador · ~13.8 PTS media rotación NBA.',
  },
  ptsWin: {
    title: 'Puntos en los últimos partidos',
    simpleDesc:
      'Promedio anotador del jugador únicamente en la ventana corta seleccionada (últimos 3, 5 o 10 encuentros).',
    calculation:
      'Suma de puntos anotados en los últimos N partidos dividida entre N.',
    benchmarkText:
      'Compáralo con sus Puntos Base para ver si llega en racha anotadora.',
  },
  rebBase: {
    title: 'Rebotes totales por partido (REB)',
    simpleDesc:
      'Balones recuperados tras un lanzamiento fallado, sumando tanto canasta propia como canasta rival.',
    calculation:
      '(Rebotes Defensivos + Rebotes Ofensivos) divididos entre los partidos jugados.',
    benchmarkText:
      '10+ REB = dominante bajo aros · ~4.9 REB media de rotación NBA.',
  },
  orebBase: {
    title: 'Rebotes ofensivos por partido (OR)',
    simpleDesc:
      'Rebotes capturados en el aro rival tras fallo propio; otorgan una segunda posesión inmediata para anotar.',
    calculation:
      'Total de rebotes ofensivos capturados dividido entre los partidos disputados (OREB / PJ).',
    benchmarkText:
      '3.0+ OR en jugadores o 12+ OR en equipos refleja élite cargando el rebote.',
  },
  drebBase: {
    title: 'Rebotes defensivos por partido (DR)',
    simpleDesc:
      'Rebotes asegurados bajo el aro propio tras un fallo del rival para cerrar la posesión defensiva.',
    calculation:
      'Total de rebotes defensivos capturados dividido entre los partidos jugados (DREB / PJ).',
    benchmarkText: '7.5+ DR por noche distingue a los grandes cierres defensivos.',
  },
  astBase: {
    title: 'Asistencias por partido (AST)',
    simpleDesc:
      'Pases directos a un compañero que terminan de forma inmediata en canasta anotada.',
    calculation:
      'Total de pases de canasta contabilizados dividido entre los partidos jugados (AST / PJ).',
    benchmarkText:
      '8+ AST = director de juego élite · 5+ AST = buen creador · ~3.2 AST media NBA.',
  },
  pra: {
    title: 'Producción combinada (PRA)',
    simpleDesc:
      'Resume el volumen ofensivo y de tableros total sumando las tres grandes estadísticas clásicas.',
    calculation:
      'Suma directa en cada partido: Puntos (PTS) + Rebotes (REB) + Asistencias (AST).',
    benchmarkText:
      '35+ PRA = producción de All-Star · 45+ PRA = impacto de candidato a MVP.',
  },
  steals: {
    title: 'Robos de balón por partido (ROB)',
    simpleDesc:
      'Balones arrebatados limpiamente al ataque rival cortando un pase o bote sin cometer falta.',
    calculation: 'Total de recuperaciones (STL) dividido entre partidos jugados (PJ).',
    benchmarkText: '1.5+ robos por noche sitúa al jugador entre los mejores ladrones de la liga.',
  },
  blocks: {
    title: 'Tapones por partido (TAP)',
    simpleDesc:
      'Lanzamientos del rival desviados o bloqueados legalmente en el aire antes de que el balón baje hacia el aro.',
    calculation: 'Total de tapones colocados (BLK) dividido entre partidos jugados (PJ).',
    benchmarkText: '2.0+ tapones por noche identifica a los grandes protectores de aro.',
  },
  stocksBase: {
    title: 'Robos + Tapones combinados (Stocks)',
    simpleDesc:
      'Mide la capacidad total de un jugador para destruir jugadas rivales mediante robos y tapones.',
    calculation: 'Suma directa por partido: Robos de balón (STL) + Tapones (BLK).',
    benchmarkText:
      '2.5+ Stocks por noche identifica a los defensores más disruptivos de la NBA.',
  },
  tov: {
    title: 'Pérdidas de balón por partido (PER)',
    simpleDesc:
      'Veces que el jugador o equipo entrega la posesión al rival por mal pase, pasos, falta en ataque o robo recibido.',
    calculation: 'Total de balones perdidos (TOV) dividido entre partidos jugados (PJ).',
    benchmarkText: 'Menos pérdidas es mejor, aunque las estrellas con mucho balón suelen rondar 3–4.',
  },
  fga: {
    title: 'Tiros de campo intentados (TCI)',
    simpleDesc:
      'Volumen de lanzamientos en juego (de 2 y de 3 puntos) que ejecuta el jugador cada noche.',
    calculation: 'Total de tiros de campo lanzados (FGA) dividido entre partidos jugados.',
    benchmarkText: '18+ TCI por partido corresponde a primeras espadas ofensivas.',
  },
  fgPct: {
    title: 'Porcentaje en tiros de campo (TC%)',
    simpleDesc:
      'Proporción de lanzamientos en juego (sumando tiros de 2 y triples, sin libres) que acaban dentro del aro.',
    calculation: '(Tiros de campo anotados FGM / Tiros de campo intentados FGA) × 100.',
    benchmarkText:
      '~47% media NBA; pívots suelen superar el 55% y exteriores rondan el 44–48%.',
  },
  fg3m: {
    title: 'Triples anotados por partido (3PM)',
    simpleDesc:
      'Canastas convertidas desde detrás de la línea de tres puntos (7,24 metros en la NBA).',
    calculation: 'Total de triples encestados (FG3M) dividido entre partidos jugados (PJ).',
    benchmarkText:
      'Jugador: 3.0+ 3PM es tirador élite. Equipo: 14.5+ 3PM refleja alto volumen exterior.',
  },
  fg3Pct: {
    title: 'Porcentaje de acierto en triples (3P%)',
    simpleDesc:
      'Precisión desde el perímetro: cuántos triples entran de cada 100 intentos.',
    calculation: '(Triples anotados FG3M / Triples intentados FG3A) × 100.',
    benchmarkText:
      '~36.5% es la media NBA · 40% o más con volumen es puntería exterior de élite.',
  },
  fta: {
    title: 'Tiros libres intentados por partido (TLI)',
    simpleDesc:
      'Lanzamientos desde la línea de personal provocados al forzar faltas de tiro o en bonus.',
    calculation: 'Total de tiros libres lanzados (FTA) dividido entre partidos jugados.',
    benchmarkText: '7+ TLI por noche caracteriza a jugadores muy agresivos atacando el aro.',
  },
  ftPct: {
    title: 'Porcentaje en tiros libres (TL%)',
    simpleDesc:
      'Seguridad desde la línea de personal sin oposición (1 punto por acierto).',
    calculation: '(Tiros libres anotados FTM / Tiros libres intentados FTA) × 100.',
    benchmarkText:
      '~78% es la media NBA · 85%+ = gran especialista · 90%+ = infalible.',
  },
  plusMinusBase: {
    title: 'Impacto Más / Menos en pista (+/-)',
    simpleDesc:
      'Diferencia neta en el marcador que logra su equipo frente al rival durante los minutos exactos en que él juega.',
    calculation:
      '(Puntos de su equipo con él en cancha − Puntos del rival con él en cancha) / Partidos jugados.',
    benchmarkText:
      'Positivo (+) indica que su equipo supera al rival cuando él está en pista.',
  },
  usgPct: {
    title: 'Ratio de Uso Ofensivo (USG%)',
    simpleDesc:
      'Porcentaje de jugadas ofensivas de su equipo que finaliza este jugador mientras está en pista.',
    calculation:
      '100 × ((FGA + 0.44 × FTA + Pérdidas) × (Minutos Equipo / 5)) / (Minutos Jugador × Posesiones Equipo).',
    benchmarkText:
      '30%+ = 1ª estrella absoluta · ~20% = media rotación · <15% = jugador de apoyo.',
  },
  usgWin: {
    title: 'Uso ofensivo reciente (USG% ventana)',
    simpleDesc:
      'Cuota de ataques que está absorbiendo el jugador en los últimos partidos frente al resto de la temporada.',
    calculation:
      'Promedio de su USG% partido a partido en los últimos N encuentros seleccionados.',
    benchmarkText:
      'Subidas de +4% suelen indicar bajas de compañeros o cambio táctico del entrenador.',
  },
  tsPct: {
    title: 'Acierto Real de Tiro (True Shooting TS%)',
    simpleDesc:
      'La medida más completa de eficiencia anotadora: pondera tiros de 2, el valor extra del triple y los tiros libres.',
    calculation: 'Puntos Totales / (2 × (Tiros de Campo Intentados FGA + 0.44 × Tiros Libres Intentados FTA)) × 100.',
    benchmarkText:
      '~58% = media NBA actual · 62%+ = eficiencia élite · <53% = baja eficacia.',
  },
  efgPct: {
    title: 'Tiro de Campo Efectivo (eFG%)',
    simpleDesc:
      'Porcentaje de acierto en tiros en juego corrigiendo que un triple vale un 50% más que una canasta de dos.',
    calculation: '((Tiros de Campo Anotados FGM + 0.5 × Triples Anotados FG3M) / FGA) × 100.',
    benchmarkText:
      '~54.5% es la media NBA · 58%+ indica una selección y puntería sobresalientes.',
  },
  offRtg: {
    title: 'Eficiencia Ofensiva (OffRtg)',
    simpleDesc:
      'Puntos producidos por cada 100 posesiones atacadas. Elimina la distorsión de jugar más rápido o más lento.',
    calculation: '(Puntos Anotados / Posesiones Totales) × 100.',
    benchmarkText:
      '118+ = ataque de élite NBA · ~114.5 = media de la liga · <110 = ataque espeso.',
  },
  defRtg: {
    title: 'Eficiencia Defensiva (DefRtg)',
    simpleDesc:
      'Puntos encajados por cada 100 posesiones rivales. ¡Aquí un número MÁS BAJO significa mejor defensa!',
    calculation: '(Puntos Recibidos del Rival / Posesiones Defendidas) × 100.',
    benchmarkText:
      '<110 = defensa de campeonato · ~114.5 = media NBA · >117 = defensa vulnerable.',
  },
  netRtg: {
    title: 'Dominio Neto por 100 posesiones (NetRtg)',
    simpleDesc:
      'Balance real de puntos a favor o en contra cada 100 posesiones ajustado al ritmo de juego.',
    calculation: 'Eficiencia Ofensiva (OffRtg) − Eficiencia Defensiva (DefRtg).',
    benchmarkText:
      '+6.0 o más = candidato al anillo · 0.0 = equilibrio medio · negativo = superado.',
  },
  pie: {
    title: 'Índice de Impacto Global NBA.com (PIE%)',
    simpleDesc:
      'Fórmula oficial de NBA.com que estima qué cuota porcentual de todas las acciones positivas del partido genera el jugador o equipo.',
    calculation:
      '(PTS + FGM + FTM − FGA − FTA + DREB + 0.5×OREB + AST + STL + 0.5×BLK − PF − TOV) / Total acumulado de ambos equipos × 100.',
    benchmarkText:
      'Jugador: 10% = media · 15%+ = All-Star · 18%+ = nivel MVP. Equipo: 50% = media.',
  },
  gmSc: {
    title: 'Valoración por partido (Hollinger Game Score)',
    simpleDesc:
      'Nota global en una sola cifra que premia la producción ofensiva y defensiva y penaliza tiros fallados, faltas y pérdidas.',
    calculation:
      'PTS + 0.4×FGM − 0.7×FGA − 0.4×(FTA−FTM) + 0.7×OREB + 0.3×DREB + STL + 0.7×AST + 0.7×BLK − 0.4×PF − TOV.',
    benchmarkText:
      '10 = actuación media · 20+ = gran partido · 30+ = noche histórica · 40+ = leyenda.',
  },
  astPct: {
    title: 'Porcentaje de Asistencias (AST%)',
    simpleDesc:
      'Porcentaje de las canastas en juego de sus compañeros que han sido asistidas por este jugador mientras está en pista.',
    calculation:
      'AST / (((Minutos Jugador / (Minutos Equipo / 5)) × FGM Equipo) − FGM Jugador) × 100.',
    benchmarkText:
      '30%+ distingue a los grandes directores de orquesta ofensivos de la NBA.',
  },
  astTo: {
    title: 'Ratio Asistencias por Pérdida (AST/PER)',
    simpleDesc:
      'Mide la seguridad y limpieza organizando el juego: cuántos pases de canasta reparte por cada balón que pierde.',
    calculation:
      'Asistencias totales (AST) divididas entre Pérdidas de balón (TOV). En un partido sin pérdidas toma el total de AST.',
    benchmarkText:
      '2.5+ = creador muy seguro · 3.5+ = control de balón de élite.',
  },
  ptsPerMin: {
    title: 'Ratio Puntos por Minuto (PTS/MIN)',
    simpleDesc:
      'Velocidad de producción anotadora por cada minuto que pisa el parqué, útil para detectar microondas y estrellas.',
    calculation: 'Puntos anotados (PTS) divididos entre los Minutos jugados (MIN).',
    benchmarkText:
      '0.75+ PTS/MIN equivale a 27+ puntos por 36 minutos · 0.90+ es ritmo de líder anotador.',
  },
  rebPer36: {
    title: 'Ratio Rebotes por 36 Minutos (REB/36)',
    simpleDesc:
      'Proyección del ritmo reboteador estandarizada a 36 minutos de juego para igualar titulares y suplentes.',
    calculation: '(Rebotes Totales REB / Minutos Jugados MIN) × 36.',
    benchmarkText: '11.0+ REB/36 identifica a reboteadores de élite aunque salgan del banquillo.',
  },
  astPer36: {
    title: 'Ratio Asistencias por 36 Minutos (AST/36)',
    simpleDesc:
      'Tasa de creación de pases de canasta proyectada a 36 minutos en pista.',
    calculation: '(Asistencias AST / Minutos Jugados MIN) × 36.',
    benchmarkText: '8.0+ AST/36 señala a generadores primarios de élite.',
  },
  orebPct: {
    title: 'Porcentaje de Rebote Ofensivo (OREB%)',
    simpleDesc:
      'Uno de los Cuatro Factores: qué porcentaje de todos los rebotes disponibles en el aro rival logra capturar.',
    calculation: 'Rebotes Ofensivos Propios / (Rebotes Ofensivos Propios + Rebotes Defensivos del Rival) × 100.',
    benchmarkText:
      'Equipo: ~25.2% media NBA (28%+ élite). Pívot: 11%+ es dominio interior.',
  },
  drebPct: {
    title: 'Porcentaje de Rebote Defensivo (DREB%)',
    simpleDesc:
      'Qué porcentaje de los tiros fallados por el rival asegura bajo su propio aro evitando segundas jugadas.',
    calculation: 'Rebotes Defensivos Propios / (Rebotes Defensivos Propios + Rebotes Ofensivos del Rival) × 100.',
    benchmarkText: 'Equipo: 75%+ cierra muy bien su aro. Jugador interior: 22%+ es élite.',
  },
  tovPct: {
    title: 'Porcentaje de Pérdidas por Posesión (TOV%)',
    simpleDesc:
      'Uno de los Cuatro Factores: cuántas posesiones de cada 100 terminan en balón perdido antes de poder lanzar.',
    calculation: 'Pérdidas Totales TOV / (FGA + 0.44 × FTA + TOV) × 100.',
    benchmarkText:
      '<12.5% = cuidado excelente · ~13.8% = media NBA · >15.5% = sangría de pérdidas.',
  },
  ptsPaint: {
    title: 'Puntos en la Pintura (Zona interior)',
    simpleDesc:
      'Puntos anotados pisando la zona restringida y pintura cercana al aro (mates, bandejas, ganchos y posteos).',
    calculation: 'Suma de puntos conseguidos desde dentro de la zona interior dividida entre partidos jugados (NBA.com Tracking).',
    benchmarkText:
      'Equipo: ~48.5 media NBA (53+ élite). Jugador: 12+ PTS es dominio interior.',
  },
  oppPtsPaint: {
    title: 'Puntos recibidos en la Pintura',
    simpleDesc:
      'Puntos cerca del aro que concede la defensa al equipo contrario. Menor cifra implica mayor protección interior.',
    calculation: 'Puntos en la pintura anotados por los rivales divididos entre los partidos jugados.',
    benchmarkText:
      'Dejar al rival por debajo de 45 PTS en la pintura es muralla interior de élite.',
  },
  pts2ndChance: {
    title: 'Puntos de Segunda Oportunidad',
    simpleDesc:
      'Puntos conseguidos en la misma jugada inmediatamente después de capturar un rebote ofensivo.',
    calculation: 'Puntos anotados tras rebote ofensivo propio divididos entre partidos jugados.',
    benchmarkText:
      'Equipo: 16+ PTS/PJ o Jugador: 3.5+ PTS/PJ castiga duramente a las defensas.',
  },
  ptsFastBreak: {
    title: 'Puntos al Contraataque (Transición)',
    simpleDesc:
      'Puntos logrados corriendo la pista a gran velocidad antes de que el balance defensivo rival se coloque.',
    calculation: 'Puntos anotados en posesiones de transición rápida divididos entre partidos jugados.',
    benchmarkText:
      '17+ PTS/PJ refleja un equipo letal corriendo tras robo o rebote.',
  },
  ptsOffTov: {
    title: 'Puntos tras Pérdida del Rival',
    simpleDesc:
      'Puntos que consigue anotar el equipo o jugador castigando directamente los balones perdidos del adversario.',
    calculation: 'Puntos logrados en la posesión inmediatamente posterior a provocar una pérdida rival / PJ.',
    benchmarkText:
      '19+ PTS/PJ suele distinguir a las defensas más agresivas de la liga.',
  },
  foulsDrawn: {
    title: 'Faltas personales recibidas (PFD)',
    simpleDesc:
      'Veces por partido que el jugador obliga al defensor a cometer falta sobre él por su agresividad o físico.',
    calculation: 'Total de faltas personales provocadas al rival dividido entre partidos jugados.',
    benchmarkText: '6.0+ faltas recibidas por noche es propio de estrellas imparables en el 1 contra 1.',
  },
  contestedShots: {
    title: 'Tiros Punteados en Defensa (Hustle)',
    simpleDesc:
      'Acción de esfuerzo defensivo: veces que el defensor acerca la mano levantada para tapar la visión del tirador.',
    calculation: 'Tiros de 2 punteados + Triples punteados registrados por cámaras de tracking NBA.com / PJ.',
    benchmarkText:
      'Jugador: 9+ por noche es ancla defensiva. Equipo: 50+ denota máxima intensidad.',
  },
  deflections: {
    title: 'Desvíos de Balón (Deflections)',
    simpleDesc:
      'Toques defensivos con la mano sobre pases o botes rivales que cortan el ritmo de la jugada aunque no acaben en robo.',
    calculation: 'Total de desvíos de balón contabilizados por el tracking oficial de NBA.com / PJ.',
    benchmarkText: 'Jugador: 3.0+ por noche es élite absoluta en líneas de pase.',
  },
  screenAssists: {
    title: 'Asistencias de Bloqueo (Screen Assists)',
    simpleDesc:
      'Pantallas o bloqueos directos que liberan a un compañero para que anote inmediatamente una canasta.',
    calculation: 'Bloqueos que derivan directamente en tiro anotado del compañero / PJ (NBA.com Hustle).',
    benchmarkText:
      '3.5+ por partido destaca a pívots fundamentales en el juego de bloqueo y continuación.',
  },
  looseBalls: {
    title: 'Balones Divididos Recuperados (Loose Balls)',
    simpleDesc:
      'Balones sueltos sin dueño claro en los que el jugador se lanza o anticipa para ganar la posesión.',
    calculation: 'Balones sueltos recuperados en ataque y defensa según tracking NBA.com / PJ.',
    benchmarkText: '1.2+ por noche muestra gran energía e instinto competitivo.',
  },
  boxOuts: {
    title: 'Cierres de Rebote (Box-Outs)',
    simpleDesc:
      'Veces que bloquea físicamente con el cuerpo a su par para impedirle acercarse al rebote.',
    calculation: 'Contactos de bloqueo de rebote contabilizados por NBA.com Hustle / PJ.',
    benchmarkText: 'Trabajo invisible clave para asegurar el rebote colectivo.',
  },
  winPct: {
    title: 'Balance Victorias - Derrotas (%V)',
    simpleDesc:
      'Registro acumulado de partidos ganados y perdidos junto a la proporción porcentual de triunfos.',
    calculation: '(Partidos Ganados W / Partidos Totales Disputados) × 100.',
    benchmarkText:
      '60%+ equivale a ~50 victorias en 82 partidos (zona noble de Playoffs).',
  },
  avgPointsFor: {
    title: 'Puntos Anotados a Favor (Ataque)',
    simpleDesc: 'Promedio bruto de puntos que sube el equipo a su marcador cada partido.',
    calculation: 'Suma total de puntos anotados por la franquicia dividida entre sus partidos jugados.',
    benchmarkText:
      '~114.2 PTS es la media NBA · 118+ PTS identifica a los equipos más anotadores.',
  },
  avgPointsAgainst: {
    title: 'Puntos Recibidos en Contra (Defensa)',
    simpleDesc:
      'Promedio de puntos que encaja el equipo por noche. ¡Cuanto más bajo sea el número, más sólida es su defensa!',
    calculation: 'Suma total de puntos anotados por sus rivales dividida entre los partidos jugados.',
    benchmarkText:
      'Dejar a los oponentes por debajo de 109–110 PTS es nivel defensivo top.',
  },
  differential: {
    title: 'Margen Medio de Puntos (Diferencial +/-)',
    simpleDesc:
      'Ventaja (+) o desventaja (−) media de puntos por la que gana o pierde sus encuentros respecto al equilibrio de la NBA.',
    calculation:
      'Puntos Anotados por partido (PTS Favor) − Puntos Recibidos por partido (PTS Contra). La referencia Media NBA (±PTS) refleja la desviación media real entre las 30 franquicias respecto al punto de equilibrio (0).',
    benchmarkText:
      'Media NBA de desviación ~±4.8 PTS · +5.0 PTS o más distingue a claros aspirantes al anillo.',
  },
  avgMargin: {
    title: 'Margen Medio de Victoria por Partido NBA',
    simpleDesc:
      'Diferencia media de puntos por la que se deciden los partidos oficiales en el marcador final.',
    calculation:
      'Promedio del valor absoluto |Puntos Local − Puntos Visitante| en todos los encuentros disputados.',
    benchmarkText:
      '~12.0 PTS es el margen medio habitual por el que se resuelve un partido NBA.',
  },
  windowDiff: {
    title: 'Margen de Puntos Reciente',
    simpleDesc:
      'Diferencia media en el marcador obtenida exclusivamente en los últimos N partidos seleccionados.',
    calculation: 'Promedio de (Puntos Favor − Puntos Contra) en los últimos N encuentros.',
    benchmarkText: 'Muestra el estado de forma competitivo más inmediato del equipo.',
  },
  winNetRtg: {
    title: 'Net Rating en Ventana Reciente',
    simpleDesc:
      'Dominio neto por cada 100 posesiones medido únicamente en los últimos N partidos jugados.',
    calculation: 'Promedio de (OffRtg − DefRtg) en los últimos N encuentros de la franquicia.',
    benchmarkText: 'Permite ver si un equipo mejora de verdad ajustando por velocidad.',
  },
  streakCurrent: {
    title: 'Racha Actual y Balance Local/Visitante',
    simpleDesc:
      'Indica cuántos triunfos (W) o derrotas (L) seguidos encadena hoy el equipo, junto a su récord en casa y fuera.',
    calculation: 'Conteo consecutivo desde su último partido hacia atrás sin cambiar de signo (W o L).',
    benchmarkText: 'W5 o superior señala a los equipos más en racha del momento.',
  },
  paceSimple: {
    title: 'Ritmo de Juego (Pace · Posesiones/48m)',
    simpleDesc:
      'Velocidad a la que juega el equipo: estima de cuántos ataques dispone cada conjunto en 48 minutos.',
    calculation:
      '48 × ((Posesiones Equipo + Posesiones Rival) / (2 × (Minutos Jugados Equipo / 5))).',
    benchmarkText:
      '101+ = ritmo vertiginoso · ~99.6 = media NBA · <97 = posesiones largas y pausadas.',
  },
  vsLeagueBar: {
    title: 'Termómetro frente a la Media de la NBA',
    simpleDesc:
      'Compara visualmente al jugador o equipo contra el promedio real de rotación de toda la NBA (línea blanca central).',
    calculation:
      'Posiciona el percentil relativo usando la desviación Z respecto a la Media NBA: 50% = media exacta de la liga.',
    benchmarkText:
      'Élite NBA (verde) = top ~10% · Destacado (naranja) = sobre la media.',
  },
  consistencyScore: {
    title: 'Índice de Regularidad (0 a 100)',
    simpleDesc:
      'Califica cómo de estable y predecible es la producción del jugador noche tras noche.',
    calculation:
      '100 − ((Coeficiente de Variación de PRA − 0.12) × 210), acotado en escala de 18 a 98, donde CV = Desv.Típica / Media.',
    benchmarkText:
      '78+ = "Reloj suizo" ultra fiable · <50 = perfil "Todo o nada" muy volátil.',
  },
  ptsStdDev: {
    title: 'Desviación Típica Anotadora (±σ)',
    simpleDesc:
      'Mide cuántos puntos arriba o abajo suele dispersarse de una noche a otra respecto a su propia media.',
    calculation:
      'Raíz cuadrada de la media de las diferencias al cuadrado entre los puntos de cada noche y su media: √(Σ(x − μ)² / N).',
    benchmarkText: '±4–5 PTS es muy regular · ±9 PTS o más indica fuertes altibajos.',
  },
  floorCeiling: {
    title: 'Horquilla Habitual (Suelo – Techo 1σ)',
    simpleDesc:
      'Rango normal de puntos entre una noche discreta (suelo) y una buena noche (techo) para ese jugador.',
    calculation:
      'Suelo = Media de Puntos − 1 Desviación Típica (σ) · Techo = Media de Puntos + 1σ (cubre ~68% de sus noches).',
    benchmarkText:
      'Ideal para saber qué mínimo razonable garantiza en un partido estándar.',
  },
  hitRate85: {
    title: 'Tasa de Cumplimiento (≥85% de su media)',
    simpleDesc:
      'Porcentaje de partidos disputados en los que alcanza al menos el 85% de su promedio anotador habitual.',
    calculation:
      '(Partidos con Puntos ≥ 0.85 × Media de Puntos / Partidos Totales Jugados) × 100.',
    benchmarkText:
      '65%+ identifica a jugadores muy seguros que rara vez firman noches grises.',
  },
  consecutiveStreak: {
    title: 'Partidos Consecutivos en Racha Activa',
    simpleDesc:
      'Cuántos encuentros seguidos acumula el jugador o equipo cumpliendo la condición desde su partido más reciente hacia atrás.',
    calculation:
      'Se evalúa partido a partido desde el más reciente (índice 0, 1, 2...) sumando +1 mientras supere el umbral; se detiene al primer fallo.',
    benchmarkText:
      '5+ partidos seguidos marcan una tendencia sostenida de alto nivel.',
  },
  lastGamePerf: {
    title: 'Último Partido Disputado',
    simpleDesc:
      'Registro más reciente del jugador o equipo en el calendario oficial para verificar cuándo sumó el último eslabón de la racha.',
    calculation:
      'Valor obtenido en el encuentro con fecha más reciente (posición 0 de su historial cronológico).',
  },
  totalGamePoints: {
    title: 'Marcador Combinado Medio por Encuentro',
    simpleDesc:
      'Suma media de puntos anotados entre ambos equipos en cada partido oficial de la NBA.',
    calculation:
      'Suma de (Puntos Local + Puntos Visitante) de todos los partidos dividida entre el total de encuentros.',
    benchmarkText: '~228.4 PTS combinados es el entorno medio de un partido NBA actual.',
  },
  homeWinPct: {
    title: 'Porcentaje de Victorias Locales',
    simpleDesc:
      'Mide el peso del factor cancha en la NBA: qué proporción de partidos gana el equipo que juega en su pabellón.',
    calculation: '(Victorias del equipo local / Total de partidos disputados en la liga) × 100.',
    benchmarkText: 'Históricamente en la NBA oscila entre el 54% y el 58%.',
  },
  closeGamesPct: {
    title: 'Partidos de Final Apretado (≤ 5 pts)',
    simpleDesc:
      'Proporción de encuentros decididos por una diferencia final de 5 puntos o menos en el marcador.',
    calculation: '(Partidos con |Puntos Local − Puntos Visitante| ≤ 5 / Total de partidos) × 100.',
    benchmarkText: 'Mide la competitividad e igualdad de los cierres de partido (Clutch).',
  },
  blowoutGamesPct: {
    title: 'Partidos por Amplio Margen (≥ 15 pts)',
    simpleDesc:
      'Proporción de encuentros resueltos por paliza o ventaja holgada de 15 o más puntos.',
    calculation: '(Partidos con |Puntos Local − Puntos Visitante| ≥ 15 / Total de partidos) × 100.',
    benchmarkText: 'Suele situarse alrededor del 28%–34% en la era del triple.',
  },
  tripleDoubles: {
    title: 'Triples-Dobles Logrados (TD3)',
    simpleDesc:
      'Partidos en los que un jugador alcanza 10 o más unidades (dobles dígitos) en al menos tres categorías estadísticas distintas.',
    calculation:
      'Conteo de partidos donde al menos 3 de [Puntos, Rebotes, Asistencias, Robos, Tapones] son ≥ 10.',
    benchmarkText: 'Hito de dominio total reservado a los jugadores más completos del planeta.',
  },
  singleGamePeak: {
    title: 'Tope Máximo en un Único Partido',
    simpleDesc:
      'La marca más alta lograda en una sola noche entre todos los jugadores o franquicias de la NBA.',
    calculation:
      'Valor máximo absoluto máx(x) escaneando todas las hojas de partido individuales de la temporada.',
    benchmarkText: '60+ PTS jugador o 145+ PTS equipo representan noches históricas.',
  },
  splitContext: {
    title: 'Rendimiento Segmentado por Contexto (Splits)',
    simpleDesc:
      'Compara cómo rinde jugando en Casa vs. Fuera o Con Descanso vs. Back-to-Back (dos noches seguidas sin descanso).',
    calculation:
      'Filtra únicamente los partidos que cumplen esa condición (ej. días de descanso = 0 para B2B) y calcula su promedio.',
    benchmarkText: 'En Back-to-Back suele bajar la eficiencia por fatiga acumulada.',
  },
  minMinutesFilter: {
    title: 'Filtro de Minutos Mínimos por Partido',
    simpleDesc:
      'Oculta en los radares automáticos a jugadores con presencia testimonial para enfocar el análisis en la rotación real.',
    calculation:
      'Conserva únicamente jugadores cuyo promedio (Minutos Totales / Partidos Jugados) sea mayor o igual al umbral elegido.',
    benchmarkText: '22+ MIN centra el foco en titulares y sextos hombres.',
  },
  duelCategoryScore: {
    title: 'Marcador de Categorías Ganadas (1 vs 1)',
    simpleDesc:
      'Cuenta en cuántos apartados estadísticos supera cada jugador a su rival directo estilo videojuego deportivo.',
    calculation:
      'Suma +1 victoria al jugador con mejor registro en cada categoría evaluada (en Pérdidas y en Eficiencia Defensiva DefRtg gana quien registra la cifra más baja). Diferencias mínimas dentro del margen técnico cuentan como empate.',
    benchmarkText:
      'Ganar 10+ de 17 categorías refleja un dominio integral en ambos lados de la pista.',
  },
  duelRadarRating: {
    title: 'Valoración Global Radar (Escala 0–99)',
    simpleDesc:
      'Nota global estilo videojuego deportivo que mide el calibre real del jugador sin penalizar su posición (evita que un base baje de nota por no rebotear como un pívot o viceversa).',
    calculation:
      'Pondera 55% sus 3 mejores ejes del radar (22% + 18% + 15%) + 25% Eje de Impacto Global + 20% media de sus 3 ejes complementarios. Cada eje se normaliza (50 + 18 × Z-Score con varianza unitaria σ=1, entre 25 y 99) frente al censo real de rotación NBA (349 jugadores ≥15 MIN).',
    benchmarkText:
      '50 = Media rotación NBA · 78–88 = Titular top / All-Star · 90+ = Superestrella / Candidato MVP.',
  },
  duelSimpleAxisAvg: {
    title: 'Media Simple de los 6 Ejes (Todoterreno)',
    simpleDesc:
      'Promedio aritmético puro de las 6 notas del hexágono a partes iguales, sin ajuste por posición ni especialidad.',
    calculation:
      '(Anotación + Eficiencia + Creación + Impacto + Defensa + Rebote) / 6 sobre la escala 25–99.',
    benchmarkText:
      '50 = Rotación media · 78+ = Jugador todoterreno dominante en casi todas las facetas.',
  },
  duelAxisScoring: {
    title: 'Eje Radar: Anotación (Escala 25–99)',
    simpleDesc:
      'Mide tanto el volumen total de puntos por noche como su capacidad para producir puntos por cada minuto en cancha.',
    calculation:
      '50 + 18 × Z, combinando 72% Z(PTS frente a 12.2 ± 5.9) + 28% Z(PTS/MIN frente a 0.47 ± 0.14), acotado entre 25 y 99.',
    benchmarkText:
      '50 = Media rotación NBA (12.2 PTS) · 90+ = Líderes anotadores NBA (27+ PTS).',
  },
  duelAxisEfficiency: {
    title: 'Eje Radar: Eficiencia de Tiro y Creación (Escala 25–99)',
    simpleDesc:
      'Evalúa cuánto aprovecha cada lanzamiento (tiros de 2, triples y tiros libres vía TS%) premiando además mantener alto acierto cuando el jugador asume gran volumen ofensivo frente a dobles ayudas.',
    calculation:
      '50 + 18 × (Z_TS + Bono_Volumen), donde Z_TS = (TS% − 58.0%) / 4.5%. Si supera el 57.5% TS con alto Uso (USG% > 19.1%), suma 0.38 × ((USG% − 19.1) / 8.5) × Z_TS para distinguir a superestrellas creadoras de finalizadores de bajo volumen.',
    benchmarkText:
      '50 = Media rotación NBA (58.0% TS) · 90+ = Eficiencia histórica a gran volumen (ej. 65%+ TS con 28%+ USG).',
  },
  duelAxisPlaymaking: {
    title: 'Eje Radar: Creación de Juego (Escala 25–99)',
    simpleDesc:
      'Valora la generación de canastas para los compañeros y la seguridad cuidando el balón al asistir.',
    calculation:
      '50 + 18 × (1.12 × [74% Z(AST frente a 2.82 ± 1.78) + 26% Z(Ratio AST/PER frente a 1.98 ± 0.74)]), con factor ×1.12 de varianza unitaria.',
    benchmarkText:
      '50 = Media rotación NBA (2.8 AST) · 88+ = Directores de orquesta élite (7.5+ AST).',
  },
  duelAxisRebounding: {
    title: 'Eje Radar: Dominio del Rebote (Escala 25–99)',
    simpleDesc:
      'Capacidad para cerrar el aro propio y capturar segundas oportunidades en el aro rival.',
    calculation:
      '50 + 18 × (1.03 × [72% Z(REB frente a 4.46 ± 2.20) + 28% Z(Rebote Ofensivo frente a 1.14 ± 0.82)]), acotado entre 25 y 99.',
    benchmarkText:
      '50 = Media rotación NBA (4.5 REB) · 90+ = Especialistas interiores (10.5+ REB).',
  },
  duelAxisDefense: {
    title: 'Eje Radar: Solidez y Disrupción Defensiva (Escala 25–99)',
    simpleDesc:
      'Combina la destrucción de jugadas (robos y tapones por partido y por 36 min), la eficacia real protegiendo la canasta (DefRtg en pista) y los intangibles de esfuerzo (desvíos y tiros punteados).',
    calculation:
      '50 + 18 × (1.38 × √(PJ/(PJ+5)) × [42% Z_Disrupción(Stocks y Stocks/36m) + 35% Z_DefRtg_Invertido((113.4 − DefRtg)/4.3) + 23% Z_Hustle(55% Desvíos + 45% Punteados)]). Evita inflar a pívots que encajan muchos puntos (DefRtg alto) o rachas cortas de 3 partidos.',
    benchmarkText:
      '50 = Defensa media NBA (113.4 DefRtg, 1.35 STK) · 83–90 = All-Defense · 92+ = Candidato DPOY.',
  },
  duelAxisImpact: {
    title: 'Eje Radar: Impacto Global (Escala 25–99)',
    simpleDesc:
      'Refleja cuánto inclina la balanza hacia la victoria cuando está en pista sumando producción integral y diferencial de marcador.',
    calculation:
      '50 + 18 × (1.15 × [50% Z(Game Score frente a 9.9 ± 4.6) + 22% Z(Más/Menos frente a 0 ± 3.7) + 28% Z(PIE% frente a 9.9% ± 3.0%)]).',
    benchmarkText:
      '50 = Jugador medio de rotación (9.9 GmSc) · 92+ = Impacto de calibre MVP.',
  },
  duelSampleScope: {
    title: 'Temporada y Tramo Evaluado en el Duelo',
    simpleDesc:
      'Define qué campaña se consulta y si el cara a cara enfrenta toda la temporada, la racha reciente (3, 5 o 10 partidos) o partidos en Casa / Visitante.',
    calculation:
      'Filtra las hojas oficiales de partido de ambos jugadores en el contexto elegido y recalcula desde cero promedios, porcentajes agregados (TS%, eFG%), radar y marcador.',
    benchmarkText:
      'Actual + Pasada (65+ PJ) mide su nivel real consolidado; Solo 2026-27 refleja únicamente el arranque actual.',
  },
  duelPlayerRole: {
    title: 'Escalafón Radar y Rol Ofensivo',
    simpleDesc:
      'Une el nivel global alcanzado en el radar con el grado de protagonismo con balón dentro de su equipo.',
    calculation:
      'Escalafón según Valoración Radar (≥90 Superestrella/MVP, ≥78 All-Star/Titular Top, ≥50 Rotación NBA) + Rol según Uso Ofensivo USG% (≥28% 1ª Espada, ≥23% Estrella, <23% Apoyo).',
    benchmarkText: 'Media de protagonismo en rotación NBA = ~19.1% USG.',
  },
  duelTugOfWar: {
    title: 'Barra de Pulso Directo (Proporción 1 vs 1)',
    simpleDesc:
      'Muestra de un vistazo qué porcentaje visual del cara a cara domina cada jugador en esa estadística.',
    calculation:
      'Proporción Valor_A / (Valor_A + Valor_B) acotada entre 10% y 90%. En Pérdidas y DefRtg se invierte la escala (menor cifra = barra mayor) y en Más/Menos (+/-) se traslada sobre el mínimo para admitir negativos.',
    benchmarkText: '50% / 50% (mitad exacta) equivale a igualdad total en la categoría.',
  },
  duelHustleActions: {
    title: 'Esfuerzo Defensivo Combinado (Hustle NBA.com)',
    simpleDesc:
      'Suma las acciones de desgaste e intimidación defensiva que no aparecen en las estadísticas clásicas de robos o tapones.',
    calculation:
      'Desvíos de balón con la mano (Deflections) + Tiros rivales punteados levantando el brazo (Contested Shots) por partido según el tracking óptico de NBA.com.',
    benchmarkText:
      '6.0 acciones/partido = Media rotación NBA · 10+ = Especialista defensivo de élite.',
  },
  duelVerdictCalc: {
    title: 'Síntesis Automática del Veredicto',
    simpleDesc:
      'Conclusión objetiva generada en tiempo real cruzando el marcador de categorías, el radar de estilos y la eficiencia anotadora.',
    calculation:
      'Integra 3 cálculos: 1) Vencedor del cómputo total de categorías, 2) Mayor ventaja diferencial en los 6 ejes del radar (≥ 5 pts) y 3) Balance entre Uso Ofensivo (USG%) y Acierto Real (TS% / GmSc).',
    benchmarkText:
      'Se adapta automáticamente entre lenguaje cotidiano (Modo Sencillo) y técnico (Modo Avanzado).',
  },
  loadFullLeagueCensus: {
    title: 'Ampliar al Censo Completo NBA (Rotación vs Liga Completa)',
    simpleDesc:
      'Para que la app abra al instante en móvil y PC, inicialmente se cargan los 260 jugadores principales por minutos jugados (todos los titulares y hombres clave de rotación de los 30 equipos). Este botón descarga el resto de plantillas completas.',
    calculation:
      'Añade a la memoria local los suplentes profundos, rookies y contratos duales restantes (ej. +151 hasta los 411 que han debutado en 2026-27, o +377 hasta los 637 del modo Continuo). Nota: el buscador por nombre ya encuentra e importa a cualquier jugador sin necesidad de pulsar este botón.',
    benchmarkText:
      '260 iniciales = 100% de titulares y rotación útil · Censo total = 411–637 jugadores con ≥1 minuto.',
  },
  gamedayPulse: {
    title: 'Pulso Global de la Jornada',
    simpleDesc:
      'Resume el ritmo anotador y la igualdad competitiva de todos los partidos disputados en la fecha seleccionada sin abrir uno por uno.',
    calculation:
      'Media de puntos combinados (Local + Visitante) de los N encuentros del día comparada con el promedio anual de la liga, junto al conteo de finales apretados (margen ≤ 5 pts) y triunfos visitantes.',
    benchmarkText:
      '~228 PTS combinados = ritmo anotador estándar NBA · ≥35% finales apretados = noche de alta tensión.',
  },
  gamedayMvp: {
    title: 'MVP de la Noche (Mejor Actuación Individual)',
    simpleDesc:
      'Distingue al jugador con mayor impacto estadístico integral entre todos los encuentros disputados en esa fecha del calendario.',
    calculation:
      'Jugador con el Hollinger Game Score (GmSc) más alto de la jornada: PTS + 0.4×FGM − 0.7×FGA − 0.4×(FTA−FTM) + 0.7×OREB + 0.3×DREB + STL + 0.7×AST + 0.7×BLK − 0.4×PF − TOV.',
    benchmarkText:
      '25+ GmSc = exhibición All-Star · 32+ GmSc = dominio de calibre MVP · 40+ GmSc = noche histórica.',
  },
  gamedaySingleZ: {
    title: 'Sorpresa de una Noche (Z-Score Puntual σ)',
    simpleDesc:
      'Mide cuánto superó (▲) o empeoró (▼) un jugador su propia media habitual en ese partido concreto, permitiendo descubrir explosiones de secundarios y no solo de las mismas superestrellas.',
    calculation:
      '0.55 × Z_GameScore + 0.45 × Z_Puntos, donde Z = (Valor_Noche − Media_Previa_Jugador) / máx(3.8, Desviación_Típica_Jugador) sobre su historial previo (mínimo 4 PJ base).',
    benchmarkText:
      '+1.5σ = gran noche sobre su nivel · +2.2σ o más = explosión extraordinaria · −1.4σ = batacazo claro.',
  },
  gamedayTeamStatement: {
    title: 'Golpe en la Mesa Colectivo',
    simpleDesc:
      'Identifica la victoria colectiva más autoritaria o meritoria de toda la jornada ponderando eficiencia neta y dificultad de jugar fuera de casa.',
    calculation:
      'Selecciona al equipo ganador con mayor Índice de Autoridad = Net Rating del partido (OffRtg − DefRtg por 100 posesiones) + Bono de +3.5 puntos si el triunfo se logra como visitante.',
    benchmarkText:
      '+15.0 NetRtg en una noche refleja un dominio táctico rotundo en ambos aros.',
  },
  gamedayIdealFive: {
    title: 'Quinteto Ideal de la Jornada (Top 5 GmSc)',
    simpleDesc:
      'Los cinco jugadores más determinantes de toda la noche ordenados por valoración objetiva completa (ataque, tableros, creación, defensa y eficiencia).',
    calculation:
      'Top 5 absoluto de Game Score (GmSc) entre todos los jugadores que saltaron a pista en la fecha seleccionada, mostrando su diferencial respecto a su promedio habitual.',
    benchmarkText:
      'Reúne en una sola fila las 5 mejores hojas estadísticas del día sin revisar 10–12 boxscores.',
  },
  gamedayMatchKeys: {
    title: 'Diagnóstico Individual de Claves del Partido',
    simpleDesc:
      'Detecta automáticamente las dos causas específicas que decidieron cada encuentro concreto, evitando plantillas genéricas cuando la historia real estuvo en otro apartado.',
    calculation:
      'Evalúa más de 15 casuísticas individuales por partido y elige las 2 de mayor peso real: paradojas de victoria con peor tiro, sangría de tiros libres en finales apretados, asedio en tiros de 2 frente al triple, robos y pérdidas, segundas opciones, cerrojos defensivos, explosiones de secundarios (Factor X), anulación de la estrella rival, rachas y peaje físico de Back-to-Back.',
    benchmarkText:
      'Combina siempre dos dimensiones complementarias del partido · Pulsa la tarjeta para abrir el informe completo.',
  },
  gamedayExplosions: {
    title: 'Noches de Explosión frente a su Media (▲)',
    simpleDesc:
      'Jugadores que firmaron una actuación muy superior a su promedio habitual, indicando si se debió a mayor rol en pista o a una muñeca ardiendo.',
    calculation:
      'Filtra jugadores con ≥4 PJ previos, ≥16 MIN en la noche y Z-Score puntual ≥ +1.35σ (o +10 PTS sobre su media). Clasifica el motor entre "Salto de rol" (+5.5 MIN o +5% USG) y "Puntería al rojo vivo" (+12% TS sobre su media).',
    benchmarkText:
      'Las explosiones respaldadas por más minutos y tiros (USG%) suelen mantenerse en jornadas siguientes.',
  },
  gamedaySlumps: {
    title: 'Noches Aciagas / Batacazos frente a su Media (▼)',
    simpleDesc:
      'Titulares y referentes ofensivos habituales que sufrieron un cortocircuito estadístico en puntos, porcentajes o pérdidas.',
    calculation:
      'Evalúa exclusivamente jugadores consolidados (media ≥22 MIN y ≥12 PTS con ≥5 PJ base) que jugaron al menos 16 minutos esa noche (excluyendo lesiones tempranas) y registraron Z ≤ −1.25σ.',
    benchmarkText:
      'Si el jugador mantuvo sus minutos y tiros habituales pero tuvo <42% TS, suele rebotar al alza en el siguiente partido.',
  },
  gamedayRoleShift: {
    title: 'Radar de Minutos Inusuales y Cambios de Rol',
    simpleDesc:
      'Detecta al instante qué jugadores absorbieron muchos más minutos o tiros de lo normal esa noche (por lesiones de compañeros, descansos o ajustes del entrenador).',
    calculation:
      'Compara la noche frente a la media previa del jugador y alerta cuando gana +6.5 MIN extra o +6.0% de Uso Ofensivo (USG% con ≥10 TCI) jugando al menos 20 minutos.',
    benchmarkText:
      'Herramienta clave para anticipar titulares emergentes y oportunidades antes de que suban sus medias globales.',
  },
  gamedayStreakShift: {
    title: 'Termómetro de Rachas: Prolongadas y Rotas',
    simpleDesc:
      'Rastrea entre todos los protagonistas de la jornada quién alargó una racha vigente de 4+ partidos seguidos y quién vio cortada su serie esa noche.',
    calculation:
      'Escanea el historial cronológico hasta la fecha elegida en 6 hitos (25+ PTS, 20+ PTS, 10+ REB, 8+ AST, 3+ 3PM, 2+ Robos/Tapones). Marca "Prolongada" si cumple y alcanza ≥4 PJ seguidos; marca "Racha rota" si llegaba con ≥4 PJ previos seguidos y falló (con ≥14 MIN en pista).',
    benchmarkText:
      'Permite ver de un vistazo qué dinámicas siguen vivas y qué rachas históricas cayeron anoche.',
  },
  gamedayGlobalChronicle: {
    title: 'Crónica Global de Scouting y Actualidad NBA',
    simpleDesc:
      'Artículo matinal escrito desde la óptica de un periodista y scout NBA que conecta las tendencias tácticas, exhibiciones individuales, sorpresas de rol e hitos de toda la jornada.',
    calculation:
      'Combina el expediente empírico completo del día (pulsos de ritmo, 4 Factores, Quinteto Ideal, explosiones Z, cambios de minutos y rachas) con Gemini y búsqueda de actualidad NBA en tiempo real para contextualizar lesiones, declaraciones y clasificación.',
    benchmarkText:
      'Permanece plegada por defecto cada mañana para no ralentizar tu lectura rápida y se guarda en caché tras abrirse.',
  },
  gameReportQuarters: {
    title: 'Parciales por Cuartos y Punto de Quiebre',
    simpleDesc:
      'Desglosa el tanteo periodo a periodo (Q1–Q4 y prórrogas) para identificar en qué tramo exacto cambió el mando táctico del encuentro.',
    calculation:
      'Extraído del acta oficial en vivo de NBA.com (liveData boxscore). El "Punto de quiebre" señala el cuarto donde el equipo ganador logró su mayor diferencial neto de puntos.',
    benchmarkText:
      'Un parcial de +10 o más en un solo cuarto suele marcar la ruptura definitiva de pizarra.',
  },
  gameReportPodium: {
    title: 'Podio del Partido (⭐⭐⭐ / ⭐⭐ / ⭐)',
    simpleDesc:
      'Clasifica objetivamente a los tres mejores jugadores de cada equipo combinando su producción estadística integral con el impacto real de su equipo mientras estuvieron en pista.',
    calculation:
      'Índice Podio = Hollinger Game Score (GmSc) + 0.22 × Más/Menos en pista (+/-) + Bono de +1.5 si su equipo logró la victoria. Asigna ⭐⭐⭐ al 1º, ⭐⭐ al 2º y ⭐ al 3º de cada conjunto.',
    benchmarkText:
      'Equilibra volumen anotador, eficiencia de tiro, creación, defensa y diferencial real con el jugador en cancha.',
  },
  gameReportSpecialty: {
    title: 'Batallas Tácticas del Acta Oficial NBA.com (Game Book)',
    simpleDesc:
      'Mide las cinco guerras invisibles de pizarra que publican los informes oficiales de partido de la NBA: dominio interior, velocidad de transición, castigo de errores, segundas jugadas y profundidad de rotación.',
    calculation:
      'Datos oficiales del NBA Game Book: Puntos en la Pintura (PIP), Puntos al Contraataque (Fast Break), Puntos tras Pérdida Rival, Puntos de 2ª Oportunidad (tras rebote ofensivo) y Puntos de Banquillo (suplentes).',
    benchmarkText:
      'Ganar 3 o más de estas 5 batallas tácticas se traduce en victoria en más del 78% de los partidos NBA.',
  },
  gameReportLeaders: {
    title: 'Cara a Cara: Líderes Individuales (20 categorías)',
    simpleDesc:
      'Enfrenta directamente al referente del equipo visitante y del equipo local en las 20 categorías individuales esenciales del partido.',
    calculation:
      'Selecciona al líder máximo de cada plantilla en cada apartado (desempatando por Game Score y menor minutaje). En "Pérdidas" muestra al jugador con más balones perdidos de cada equipo y otorga la ventaja al registro más bajo.',
    benchmarkText:
      'Incluye retrato oficial, dorsal, dato destacado, ventaja diferencial y pulso comparativo. Pulsa cualquier jugador para abrir su ficha.',
  },
  threeRatio: {
    title: 'Ratio de Tiros de Tres (3PAr %)',
    simpleDesc:
      'Mide el peso del perímetro en la pizarra ofensiva: qué proporción de todos los tiros en juego del equipo se lanzaron desde la línea de triple.',
    calculation: '(Triples Intentados FG3A / Tiros de Campo Intentados FGA) × 100.',
    benchmarkText:
      '~41% es la media NBA actual · 46%+ refleja un sistema ultramoderno de cinco abiertos (5-Out).',
  },
  personalFouls: {
    title: 'Faltas Personales Cometidas (FP / PF)',
    simpleDesc:
      'Infracciones de contacto señaladas sobre jugadores o equipo. Cometer menos faltas evita regalar tiros libres fáciles en bonus. Con 6 faltas un jugador queda expulsado.',
    calculation: 'Suma oficial en acta de faltas personales (excluye técnicas de banquillo). Menor cifra otorga ventaja disciplinaria.',
    benchmarkText:
      'Equipo: ~19.0 FP es la media NBA (<16 FP = gran disciplina defensiva). Jugador: 6 FP = eliminación del partido.',
  },
  fgmMade: {
    title: 'Tiros de Campo Anotados (TC / FGM)',
    simpleDesc:
      'Total de canastas en juego convertidas durante el partido (sumando tiros de dos puntos y triples, sin contar tiros libres).',
    calculation: 'Conteo directo de lanzamientos en juego encestados (FGM), acompañado de los intentos totales (FGM/FGA).',
    benchmarkText:
      'Jugador: 10+ TC anotados refleja una noche de gran peso anotador · Equipo: ~42 TC es la media NBA.',
  },
  fg3a: {
    title: 'Triples Intentados (3PA / T3I)',
    simpleDesc:
      'Volumen total de lanzamientos ejecutados desde más allá del arco de tres puntos.',
    calculation: 'Suma de triples anotados más triples fallados en el encuentro (FG3A).',
    benchmarkText:
      'Jugador: 8+ intentos identifica a especialistas exteriores de alto volumen · Equipo: ~37 intentos media NBA.',
  },
  ftmMade: {
    title: 'Tiros Libres Anotados (TL / FTM)',
    simpleDesc:
      'Puntos convertidos desde la línea de personal (a 4,57 m) tras recibir faltas de tiro o faltas en situación de bonus.',
    calculation: 'Conteo directo de tiros libres encestados (FTM), mostrado junto a los lanzados (FTM/FTA).',
    benchmarkText:
      'Jugador: 8+ TL anotados indica castigo constante atacando la pintura y sacando faltas.',
  },
  leaderTurnovers: {
    title: 'Pérdidas de Balón · Máximo Perdedor (PER)',
    simpleDesc:
      'Identifica al jugador de cada equipo que más balones perdió en el encuentro. Al ser una métrica negativa, la ventaja recae en el equipo cuyo máximo perdedor cometió MENOS errores.',
    calculation:
      'Selecciona máx(TOV) de cada plantilla; compara ambos registros otorgando la ventaja al valor numérico inferior.',
    benchmarkText:
      '≤2 pérdidas en el principal manejador es control élite · 5+ pérdidas señala fuerte presión defensiva rival.',
  },
  sixthMan: {
    title: 'Mejor Suplente (Impacto 6.º Hombre)',
    simpleDesc:
      'Destaca al jugador más determinante saliendo desde el banquillo (no titular) en cada equipo.',
    calculation:
      'Filtra exclusivamente suplentes y elige al de mayor valoración integral Hollinger Game Score (GmSc) en el partido.',
    benchmarkText:
      '14.0+ GmSc desde el banquillo suele inclinar los tramos de rotación de segunda unidad.',
  },
  matchAdvantageDelta: {
    title: 'Ventaja Estadística Directa (Δ)',
    simpleDesc:
      'Muestra la diferencia neta exacta en esa categoría a favor del equipo o líder ganador del duelo.',
    calculation:
      'Valor absoluto |Visitante − Local| acompañado de las siglas del conjunto con mejor registro (invirtiendo el sentido en Pérdidas y Faltas).',
    benchmarkText: 'Permite detectar al instante dónde se abrieron las brechas reales del marcador.',
  },
  comparisonPulse: {
    title: 'Pulso Comparativo Alineado',
    simpleDesc:
      'Representación visual proporcional del cara a cara entre Visitante (izquierda) y Local (derecha) en una columna unificada.',
    calculation:
      'Proporción relativa entre ambos valores acotada entre 10% y 90%. Invierte automáticamente las métricas donde menos es mejor (Pérdidas, TOV%, Faltas) y normaliza escalas con negativos (+/-).',
    benchmarkText: 'El tramo iluminado en naranja identifica al dominador de esa faceta.',
  },
  decisivePeriod: {
    title: 'Tramo Decisivo / Punto de Quiebre',
    simpleDesc:
      'Señala el cuarto o prórroga donde el ganador abrió la brecha parcial más determinante del encuentro.',
    calculation:
      'Evalúa el diferencial neto periodo a periodo (1Q–4Q y PR) a favor del vencedor final del partido.',
    benchmarkText: 'Un parcial de +8 o más puntos en un cuarto suele romper la inercia táctica.',
  },
  leadChangesTies: {
    title: 'Alternancias de Mando y Empates',
    simpleDesc:
      'Refleja cuántas veces cambió de dueño el liderato en el marcador y cuántas veces se igualó el tanteo.',
    calculation:
      'Contabilizado jugada a jugada en el acta oficial de NBA.com (leadChanges y timesTied).',
    benchmarkText:
      '12+ cambios de líder definen un duelo de máxima igualdad y alternativas constantes.',
  },
  gamePaceVsLeague: {
    title: 'Ritmo del Encuentro vs. Media NBA (Pace)',
    simpleDesc:
      'Estima las posesiones jugadas por cada 48 minutos y las compara directamente con el ritmo medio de toda la NBA en esta misma temporada.',
    calculation:
      'Pace del partido − Promedio oficial de Pace de los 30 equipos NBA en la campaña del encuentro.',
    benchmarkText:
      'Positivo (+) indica un partido más eléctrico y de ida y vuelta que la media de la liga; negativo (−) indica baloncesto pausado en media pista.',
  },
  benchPts: {
    title: 'Puntos de la Segunda Unidad (Banquillo)',
    simpleDesc:
      'Aportación ofensiva combinada de todos los jugadores que no formaron parte del quinteto titular inicial.',
    calculation:
      'Suma total de puntos anotados por los jugadores suplentes (no titulares) de cada equipo en el partido.',
    benchmarkText:
      '~34 PTS es el promedio NBA de banquillo; superar los 45 PTS indica una profundidad de plantilla decisiva.',
  },
  biggestLead: {
    title: 'Máxima Ventaja y Mayor Parcial',
    simpleDesc:
      'Refleja el techo de dominio que llegó a alcanzar cada equipo en el marcador y su racha consecutiva de puntos sin respuesta rival.',
    calculation:
      'Máxima diferencia favorable registrada en el acta jugada a jugada (Play-by-Play) y mayor racha ininterrumpida (ej. parcial 14-0).',
    benchmarkText:
      'Remontar desventajas de 15+ puntos distingue victorias de enorme resiliencia táctica.',
  },
  fg2m: {
    title: 'Tiros de Dos Anotados por Partido (T2A)',
    simpleDesc:
      'Canastas convertidas dentro del arco de tres puntos (bandejas, mates, posteos y media distancia).',
    calculation: '(Tiros de Campo Anotados FGM − Triples Anotados FG3M) / Partidos jugados.',
    benchmarkText:
      '6.0+ T2A por noche identifica a grandes finalizadores interiores y especialistas de media distancia.',
  },
  fg2a: {
    title: 'Tiros de Dos Intentados por Partido (T2I)',
    simpleDesc:
      'Volumen de lanzamientos en juego ejecutados desde dentro de la línea de tres puntos.',
    calculation: '(Tiros de Campo Intentados FGA − Triples Intentados FG3A) / Partidos jugados.',
    benchmarkText:
      'Mide el peso del juego interior y de media distancia dentro del repertorio del jugador.',
  },
  fg2Pct: {
    title: 'Porcentaje en Tiros de Dos (T2%)',
    simpleDesc:
      'Eficacia anotadora en lanzamientos de dos puntos (excluyendo triples y tiros libres).',
    calculation: '((FGM − FG3M) / (FGA − FG3A)) × 100.',
    benchmarkText:
      '~54.5% es la media NBA actual · 60%+ refleja gran eficacia finalizando cerca del aro.',
  },
  ftr: {
    title: 'Ratio de Tiros Libres (Free Throw Rate · FTr %)',
    simpleDesc:
      'Mide cuántos tiros libres provoca el jugador en proporción a sus lanzamientos de campo: refleja agresividad física atacando el aro.',
    calculation: '(Tiros Libres Intentados FTA / Tiros de Campo Intentados FGA) × 100.',
    benchmarkText:
      '~26% media rotación NBA · 38%+ identifica a especialistas sacando faltas personales.',
  },
  tovRatioEst: {
    title: 'Ratio de Pérdidas Ofensivas (TOV% indiv.)',
    simpleDesc:
      'Qué porcentaje de las jugadas que finaliza el jugador acaban en balón perdido antes de poder lanzar. ¡Menos es mejor!',
    calculation: 'Pérdidas TOV / (FGA + 0.44 × FTA + TOV) × 100.',
    benchmarkText:
      '<10% = gran seguridad · ~12.5% = media rotación NBA · >16% = exceso de pérdidas.',
  },
  ptsPerShot: {
    title: 'Puntos por Tiro de Campo Intentado (PTS/TCI)',
    simpleDesc:
      'Rentabilidad directa de cada lanzamiento de campo intentado incluyendo los puntos sumados desde el tiro libre.',
    calculation: 'Puntos Totales (PTS) / Tiros de Campo Intentados (FGA).',
    benchmarkText:
      '~1.24 PTS/TCI es la media NBA · 1.38+ indica una eficiencia ofensiva sobresaliente.',
  },
  ptsPer36: {
    title: 'Ratio Puntos por 36 Minutos (PTS/36)',
    simpleDesc:
      'Ritmo anotador estandarizado a 36 minutos de juego para comparar en igualdad a titulares y suplentes.',
    calculation: '(Puntos Totales PTS / Minutos Jugados MIN) × 36.',
    benchmarkText:
      '20+ PTS/36 = anotador sólido · 26+ PTS/36 = producción ofensiva de calibre All-Star.',
  },
  praPer36: {
    title: 'Producción PRA por 36 Minutos (PRA/36)',
    simpleDesc:
      'Suma de Puntos + Rebotes + Asistencias proyectada por cada 36 minutos sobre el parqué.',
    calculation: '((PTS + REB + AST) / Minutos Jugados MIN) × 36.',
    benchmarkText:
      '36+ PRA/36 = impacto integral alto · 44+ PRA/36 = ritmo de superestrella.',
  },
  stocksPer36: {
    title: 'Robos + Tapones por 36 Minutos (STK/36)',
    simpleDesc:
      'Tasa de disrupción defensiva (recuperaciones más tapones) estandarizada a 36 minutos en pista.',
    calculation: '((Robos STL + Tapones BLK) / Minutos Jugados MIN) × 36.',
    benchmarkText:
      '2.8+ STK/36 identifica a defensores de élite independientemente de su minutaje.',
  },
  astRatio: {
    title: 'Ratio de Asistencias NBA.com (AST Ratio)',
    simpleDesc:
      'Cuántas de cada 100 posesiones que pasan y terminan por manos del jugador se convierten en asistencia.',
    calculation: '(Asistencias AST × 100) / (FGA + 0.44 × FTA + AST + TOV).',
    benchmarkText:
      '~18.0 media rotación NBA · 28+ distingue a bases organizadores puros.',
  },
  rebPct: {
    title: 'Porcentaje de Rebote Total en Pista (REB%)',
    simpleDesc:
      'Porcentaje de todos los rebotes disponibles (en ambos aros) que captura el jugador mientras está en cancha.',
    calculation: 'Rebotes Jugador / Rebotes Totales Disponibles con él en pista × 100 (NBA.com).',
    benchmarkText:
      '~8.5% media rotación NBA · 16%+ identifica a dominadores de los tableros.',
  },
  doubleDoubles: {
    title: 'Dobles-Dobles Logrados (DD2)',
    simpleDesc:
      'Partidos en los que el jugador alcanza dobles dígitos (10 o más) en al menos dos apartados estadísticos.',
    calculation:
      'Conteo de partidos donde al menos 2 de [Puntos, Rebotes, Asistencias, Robos, Tapones] son ≥ 10.',
    benchmarkText:
      'Referencia clásica de consistencia interior y de bases directores de juego.',
  },
  prCombo: {
    title: 'Combinada Puntos + Rebotes (PTS+REB)',
    simpleDesc:
      'Suma directa de los puntos anotados más los rebotes totales capturados en el encuentro.',
    calculation: 'Puntos (PTS) + Rebotes Totales (REB) por partido.',
    benchmarkText:
      '30+ PTS+REB por noche distingue a referentes interiores y aleros dominantes.',
  },
  paCombo: {
    title: 'Combinada Puntos + Asistencias (PTS+AST)',
    simpleDesc:
      'Suma de puntos propios anotados más asistencias repartidas, reflejando el peso generador ofensivo directo.',
    calculation: 'Puntos (PTS) + Asistencias (AST) por partido.',
    benchmarkText:
      '32+ PTS+AST por noche caracteriza a bases y escoltas estrellas (1ª espada).',
  },
  raCombo: {
    title: 'Combinada Rebotes + Asistencias (REB+AST)',
    simpleDesc:
      'Mide el impacto complementario sin necesidad de anotar sumando control del cristal y creación de juego.',
    calculation: 'Rebotes Totales (REB) + Asistencias (AST) por partido.',
    benchmarkText:
      '14+ REB+AST identifica a conectores todoterreno y pívots distribuidores.',
  },
  drebPer36: {
    title: 'Rebotes Defensivos por 36 Minutos (DR/36)',
    simpleDesc:
      'Tasa de cierre del propio tablero proyectada a 36 minutos en pista.',
    calculation: '(Rebotes Defensivos DREB / Minutos Jugados MIN) × 36.',
    benchmarkText: '8.0+ DR/36 refleja gran solvencia asegurando el rebote defensivo.',
  },
  orebPer36: {
    title: 'Rebotes Ofensivos por 36 Minutos (OR/36)',
    simpleDesc:
      'Capacidad para generar segundas oportunidades en el aro rival estandarizada por cada 36 minutos.',
    calculation: '(Rebotes Ofensivos OREB / Minutos Jugados MIN) × 36.',
    benchmarkText: '3.2+ OR/36 identifica a especialistas en cargar el rebote ofensivo.',
  },
  tsaVolume: {
    title: 'Posesiones de Tiro Lanzadas (TSA)',
    simpleDesc:
      'Volumen real de lanzamientos consumidos sumando tiros de campo y viajes a la línea de tiros libres.',
    calculation: 'Tiros de Campo Intentados (FGA) + 0.44 × Tiros Libres Intentados (FTA).',
    benchmarkText: '18+ TSA refleja volumen ofensivo propio de primera opción anotadora.',
  },
};

const METRIC_KEY_ALIASES: Record<string, string> = {
  // General & Comparator aliases
  points: 'ptsBase',
  pts: 'ptsBase',
  rebounds: 'rebBase',
  reb: 'rebBase',
  oreb: 'orebBase',
  orebAvg: 'orebBase',
  dreb: 'drebBase',
  assists: 'astBase',
  ast: 'astBase',
  minutes: 'minBase',
  min: 'minBase',
  stocks: 'stocksBase',
  turnovers: 'tov',
  fouls: 'personalFouls',
  fgm: 'fgmMade',
  fga: 'fga',
  ftm: 'ftmMade',
  fta: 'fta',
  threePar: 'threeRatio',
  threeRate: 'threeRatio',
  ftRate: 'ftr',
  tovPctEst: 'tovRatioEst',
  doubleDouble: 'doubleDoubles',
  tripleDouble: 'tripleDoubles',
  ptsReb: 'prCombo',
  ptsAst: 'paCombo',
  rebAst: 'raCombo',
  tsa: 'tsaVolume',
  fg_split: 'fgPct',
  fg2_split: 'fg2Pct',
  fg3_split: 'fg3Pct',
  ft_split: 'ftPct',
  plusMinus: 'plusMinusBase',
  usgEst: 'usgPct',
  gameScore: 'gmSc',
  fg3mAvg: 'fg3m',
  pf: 'avgPointsFor',
  pa: 'avgPointsAgainst',
  avgPointsAgainst: 'avgPointsAgainst',
  diff: 'differential',
  pace: 'paceSimple',
  // Milestones Global IDs
  ppg: 'avgPointsFor',
  tot: 'totalGamePoints',
  margin: 'avgMargin',
  offrtg: 'offRtg',
  efg: 'efgPct',
  ts: 'tsPct',
  '3pm': 'fg3m',
  '3pct': 'fg3Pct',
  orb: 'orebBase',
  orebpct: 'orebPct',
  tovpct: 'tovPct',
  paint: 'ptsPaint',
  second: 'pts2ndChance',
  fb: 'ptsFastBreak',
  homew: 'homeWinPct',
  close: 'closeGamesPct',
  blowout: 'blowoutGamesPct',
  // Milestones Single-Game IDs (51 metrics)
  'sg-player-pts': 'ptsBase',
  'sg-player-fgm': 'fgmMade',
  'sg-player-fga': 'fga',
  'sg-player-fg2m': 'fg2m',
  'sg-player-3pm': 'fg3m',
  'sg-player-3pa': 'fg3a',
  'sg-player-ftm': 'ftmMade',
  'sg-player-fta': 'fta',
  'sg-player-ft-perfect': 'ftPct',
  'sg-player-fgpct': 'fgPct',
  'sg-player-3ppct': 'fg3Pct',
  'sg-player-ts': 'tsPct',
  'sg-player-efg': 'efgPct',
  'sg-player-reb': 'rebBase',
  'sg-player-oreb': 'orebBase',
  'sg-player-dreb': 'drebBase',
  'sg-player-ast': 'astBase',
  'sg-player-ast-notov': 'astTo',
  'sg-player-pra': 'pra',
  'sg-player-stl': 'steals',
  'sg-player-blk': 'blocks',
  'sg-player-stocks': 'stocksBase',
  'sg-player-tov': 'tov',
  'sg-player-gmsc': 'gmSc',
  'sg-player-pm': 'plusMinusBase',
  'sg-player-usg': 'usgPct',
  'sg-player-min': 'minBase',
  'sg-team-pts': 'avgPointsFor',
  'sg-team-total': 'totalGamePoints',
  'sg-team-fgm': 'fgmMade',
  'sg-team-fgpct': 'fgPct',
  'sg-team-3pm': 'fg3m',
  'sg-team-3pa': 'fg3a',
  'sg-team-3ppct': 'fg3Pct',
  'sg-team-ftm': 'ftmMade',
  'sg-team-efg': 'efgPct',
  'sg-team-ts': 'tsPct',
  'sg-team-reb': 'rebBase',
  'sg-team-oreb': 'orebBase',
  'sg-team-dreb': 'drebBase',
  'sg-team-ast': 'astBase',
  'sg-team-stl': 'steals',
  'sg-team-blk': 'blocks',
  'sg-team-stocks': 'stocksBase',
  'sg-team-opp-pts-low': 'avgPointsAgainst',
  'sg-team-tov-low': 'tov',
  'sg-team-defrtg': 'defRtg',
  'sg-team-margin': 'differential',
  'sg-team-offrtg': 'offRtg',
  'sg-team-netrtg': 'netRtg',
  'sg-team-pace': 'paceSimple',
  // Milestones Season Leaders IDs (88 metrics)
  'sl-player-pts-avg': 'ptsBase',
  'sl-player-pts-tot': 'ptsBase',
  'sl-player-pts36': 'ptsPer36',
  'sl-player-fgm-avg': 'fgmMade',
  'sl-player-fgm-tot': 'fgmMade',
  'sl-player-fga-avg': 'fga',
  'sl-player-fgpct': 'fgPct',
  'sl-player-fg2m-avg': 'fg2m',
  'sl-player-fg2pct': 'fg2Pct',
  'sl-player-3pm-avg': 'fg3m',
  'sl-player-3pm-tot': 'fg3m',
  'sl-player-3pa-avg': 'fg3a',
  'sl-player-3ppct': 'fg3Pct',
  'sl-player-ftm-avg': 'ftmMade',
  'sl-player-ftm-tot': 'ftmMade',
  'sl-player-fta-avg': 'fta',
  'sl-player-ftpct': 'ftPct',
  'sl-player-efg': 'efgPct',
  'sl-player-ts': 'tsPct',
  'sl-player-reb-avg': 'rebBase',
  'sl-player-reb-tot': 'rebBase',
  'sl-player-orb-avg': 'orebBase',
  'sl-player-orb-tot': 'orebBase',
  'sl-player-drb-avg': 'drebBase',
  'sl-player-drb-tot': 'drebBase',
  'sl-player-reb36': 'rebPer36',
  'sl-player-orebpct': 'orebPct',
  'sl-player-rebpct': 'rebPct',
  'sl-player-ast-avg': 'astBase',
  'sl-player-ast-tot': 'astBase',
  'sl-player-astto': 'astTo',
  'sl-player-ast36': 'astPer36',
  'sl-player-astpct': 'astPct',
  'sl-player-pra-avg': 'pra',
  'sl-player-pr-avg': 'prCombo',
  'sl-player-pa-avg': 'paCombo',
  'sl-player-ra-avg': 'raCombo',
  'sl-player-dd2': 'doubleDoubles',
  'sl-player-td3': 'tripleDoubles',
  'sl-player-gmsc-avg': 'gmSc',
  'sl-player-min-avg': 'minBase',
  'sl-player-min-tot': 'minBase',
  'sl-player-pm-avg': 'plusMinusBase',
  'sl-player-pm-tot': 'plusMinusBase',
  'sl-player-stl-avg': 'steals',
  'sl-player-stl-tot': 'steals',
  'sl-player-blk-avg': 'blocks',
  'sl-player-blk-tot': 'blocks',
  'sl-player-stocks-avg': 'stocksBase',
  'sl-player-stocks-tot': 'stocksBase',
  'sl-player-defl': 'deflections',
  'sl-player-contest': 'contestedShots',
  'sl-player-loose': 'looseBalls',
  'sl-player-boxouts': 'boxOuts',
  'sl-player-tov-high': 'tov',
  'sl-player-pf-low': 'personalFouls',
  'sl-player-usg': 'usgPct',
  'sl-player-pie': 'pie',
  'sl-player-netrtg': 'netRtg',
  'sl-player-offrtg': 'offRtg',
  'sl-player-defrtg': 'defRtg',
  'sl-player-paint': 'ptsPaint',
  'sl-player-fb': 'ptsFastBreak',
  'sl-player-2nd': 'pts2ndChance',
  'sl-player-pfd': 'foulsDrawn',
  'sl-player-screen': 'screenAssists',
  'sl-team-winpct': 'winPct',
  'sl-team-pts-avg': 'avgPointsFor',
  'sl-team-opp-pts': 'avgPointsAgainst',
  'sl-team-diff': 'differential',
  'sl-team-offrtg': 'offRtg',
  'sl-team-defrtg': 'defRtg',
  'sl-team-netrtg': 'netRtg',
  'sl-team-pace': 'paceSimple',
  'sl-team-3pm-avg': 'fg3m',
  'sl-team-3ppct': 'fg3Pct',
  'sl-team-fgpct': 'fgPct',
  'sl-team-ftpct': 'ftPct',
  'sl-team-efg': 'efgPct',
  'sl-team-ts': 'tsPct',
  'sl-team-reb-avg': 'rebBase',
  'sl-team-orb-avg': 'orebBase',
  'sl-team-ast-avg': 'astBase',
  'sl-team-stl-avg': 'steals',
  'sl-team-blk-avg': 'blocks',
  'sl-team-tov-low': 'tov',
  'sl-team-paint': 'ptsPaint',
  'sl-team-fb': 'ptsFastBreak',
};

export function resolveMetricHelp(
  key?: string,
  fallbackTitle?: string
): ColumnHelpEntry | undefined {
  if (key) {
    if (COLUMN_HELP[key]) return COLUMN_HELP[key];
    const mapped = METRIC_KEY_ALIASES[key];
    if (mapped && COLUMN_HELP[mapped]) return COLUMN_HELP[mapped];
  }
  if (fallbackTitle) {
    return {
      title: fallbackTitle,
      simpleDesc: 'Indicador estadístico oficial calculado sobre los partidos registrados.',
      calculation: 'Obtenido agregando las hojas oficiales de partido de la NBA.',
    };
  }
  return undefined;
}

