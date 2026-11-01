import type {
  PlayerAdvancedProfile,
  PlayerGameLog,
  PlayerInspectorBenchmarkItem,
  PlayerSummary,
} from '../types/nba.ts';

export type PlayerSamplePreset =
  | 'slider'
  | 'season_2026'
  | 'season_2027'
  | 'continuous_both'
  | 'same_date_compare';

export type InspectorReferenceMode = 'nba' | 'own';

export type OwnBaselineMode =
  | 'both_seasons'
  | 'season_2027'
  | 'season_2026'
  | 'same_date_2026'
  | 'outside_sample'
  | 'custom_last_k';

export type PlayerMetricFamily = 'basic' | 'shooting' | 'ratios';

export interface PlayerPerGameMetricDef {
  key: string;
  label: string;
  shortLabel: string;
  helpKey: string;
  family: PlayerMetricFamily;
  decimals: number;
  suffix: string;
  signed?: boolean;
  lowerIsBetter?: boolean;
  isDefaultBasicKpi?: boolean;
  isAdvancedRadiographyRatio?: boolean;
  fallbackMean: number;
  fallbackSd: number;
  gameValue: (g: PlayerGameLog) => number;
  sliceValue: (games: PlayerGameLog[]) => number;
}

export interface PlayerAnnualTrackingMetricDef {
  key: keyof PlayerAdvancedProfile;
  label: string;
  shortLabel: string;
  helpKey: string;
  group: 'on_court' | 'zones' | 'hustle';
  decimals: number;
  suffix: string;
  signed?: boolean;
  lowerIsBetter?: boolean;
  fallbackMean: number;
  fallbackSd: number;
}

export interface PlayerGameLogColumnDef {
  key: string;
  label: string;
  helpKey: string;
  family: 'basic' | 'shooting' | 'ratios';
  isDefault?: boolean;
  highlightTone?: 'primary' | 'orange' | 'emerald' | 'signed';
  renderCell: (g: PlayerGameLog) => string;
  numericForTone?: (g: PlayerGameLog) => number;
  renderAverage: (games: PlayerGameLog[]) => string;
}

function r1(v: number): number {
  return Math.round((Number(v) || 0) * 10) / 10;
}

function r2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function avgNums(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function sdNums(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avgNums(arr);
  let sq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    sq += d * d;
  }
  return Math.sqrt(sq / arr.length);
}

function sumBy(games: PlayerGameLog[], fn: (g: PlayerGameLog) => number): number {
  let s = 0;
  for (let i = 0; i < games.length; i++) s += fn(games[i]);
  return s;
}

export function formatMetricNumber(
  val: number,
  decimals = 1,
  suffix = '',
  signed = false
): string {
  const num = Number.isFinite(val) ? val : 0;
  if (signed) {
    const absFixed = Math.abs(num).toFixed(decimals);
    const threshold = decimals === 0 ? 0.4 : decimals === 2 ? 0.005 : 0.04;
    if (num > threshold) return `+${absFixed}${suffix}`;
    if (num < -threshold) return `-${absFixed}${suffix}`;
    return `${(0).toFixed(decimals)}${suffix}`;
  }
  return `${num.toFixed(decimals)}${suffix}`;
}

/**
 * Maps an ISO date (YYYY-MM-DD) onto a monotonic NBA regular-season day index:
 * Sep-Dec -> 901..1231, Jan-Aug -> 1301..2031.
 * Allows exact "same calendar date" comparisons across 2025-26 and 2026-27.
 */
export function seasonCycleDay(dateIso: string): number {
  const clean = (dateIso || '').slice(0, 10);
  const parts = clean.split('-');
  if (parts.length < 3) return 9999;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (Number.isNaN(month) || Number.isNaN(day)) return 9999;
  const shiftedMonth = month >= 9 ? month : month + 12;
  return shiftedMonth * 100 + day;
}

export function formatDayMonthEs(dateIso: string): string {
  const clean = (dateIso || '').slice(0, 10);
  if (!clean) return 'hoy';
  const d = new Date(`${clean}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return clean;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export const PLAYER_PER_GAME_METRICS: PlayerPerGameMetricDef[] = [
  // --- 15 ESTADÍSTICAS BÁSICAS (Mostradas de serie en Nivel Comparado) ---
  {
    key: 'minutes',
    label: 'Minutos jugados',
    shortLabel: 'MIN',
    helpKey: 'minBase',
    family: 'basic',
    decimals: 1,
    suffix: '',
    isDefaultBasicKpi: true,
    fallbackMean: 25.4,
    fallbackSd: 6.1,
    gameValue: (g) => g.minutes,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.minutes))),
  },
  {
    key: 'points',
    label: 'Puntos por partido',
    shortLabel: 'PTS',
    helpKey: 'ptsBase',
    family: 'basic',
    decimals: 1,
    suffix: '',
    isDefaultBasicKpi: true,
    fallbackMean: 13.8,
    fallbackSd: 6.2,
    gameValue: (g) => g.points,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.points))),
  },
  {
    key: 'rebounds',
    label: 'Rebotes totales',
    shortLabel: 'REB',
    helpKey: 'rebBase',
    family: 'basic',
    decimals: 1,
    suffix: '',
    isDefaultBasicKpi: true,
    fallbackMean: 4.9,
    fallbackSd: 2.4,
    gameValue: (g) => g.rebounds,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.rebounds))),
  },
  {
    key: 'oreb',
    label: 'Rebotes ofensivos',
    shortLabel: 'OREB',
    helpKey: 'orebBase',
    family: 'basic',
    decimals: 1,
    suffix: '',
    isDefaultBasicKpi: true,
    fallbackMean: 1.2,
    fallbackSd: 0.9,
    gameValue: (g) => g.oreb,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.oreb))),
  },
  {
    key: 'dreb',
    label: 'Rebotes defensivos',
    shortLabel: 'DREB',
    helpKey: 'drebBase',
    family: 'basic',
    decimals: 1,
    suffix: '',
    isDefaultBasicKpi: true,
    fallbackMean: 3.7,
    fallbackSd: 1.8,
    gameValue: (g) => g.dreb,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.dreb))),
  },
  {
    key: 'assists',
    label: 'Asistencias',
    shortLabel: 'AST',
    helpKey: 'astBase',
    family: 'basic',
    decimals: 1,
    suffix: '',
    isDefaultBasicKpi: true,
    fallbackMean: 3.2,
    fallbackSd: 2.1,
    gameValue: (g) => g.assists,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.assists))),
  },
  {
    key: 'steals',
    label: 'Robos de balón',
    shortLabel: 'ROB',
    helpKey: 'steals',
    family: 'basic',
    decimals: 1,
    suffix: '',
    isDefaultBasicKpi: true,
    fallbackMean: 0.9,
    fallbackSd: 0.4,
    gameValue: (g) => g.steals,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.steals))),
  },
  {
    key: 'blocks',
    label: 'Tapones',
    shortLabel: 'TAP',
    helpKey: 'blocks',
    family: 'basic',
    decimals: 1,
    suffix: '',
    isDefaultBasicKpi: true,
    fallbackMean: 0.6,
    fallbackSd: 0.5,
    gameValue: (g) => g.blocks,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.blocks))),
  },
  {
    key: 'turnovers',
    label: 'Pérdidas de balón',
    shortLabel: 'PER',
    helpKey: 'tov',
    family: 'basic',
    decimals: 1,
    suffix: '',
    lowerIsBetter: true,
    isDefaultBasicKpi: true,
    fallbackMean: 1.6,
    fallbackSd: 0.8,
    gameValue: (g) => g.turnovers,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.turnovers))),
  },
  {
    key: 'fouls',
    label: 'Faltas personales',
    shortLabel: 'FP',
    helpKey: 'personalFouls',
    family: 'basic',
    decimals: 1,
    suffix: '',
    lowerIsBetter: true,
    isDefaultBasicKpi: true,
    fallbackMean: 2.1,
    fallbackSd: 0.6,
    gameValue: (g) => g.fouls,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fouls))),
  },
  {
    key: 'fgPct',
    label: '% Tiros de campo',
    shortLabel: 'TC%',
    helpKey: 'fgPct',
    family: 'basic',
    decimals: 1,
    suffix: '%',
    isDefaultBasicKpi: true,
    fallbackMean: 47.2,
    fallbackSd: 5.8,
    gameValue: (g) => r1(g.fgPct),
    sliceValue: (gs) => {
      const m = sumBy(gs, (g) => g.fgm);
      const a = sumBy(gs, (g) => g.fga);
      return a > 0 ? r1((m / a) * 100) : 0;
    },
  },
  {
    key: 'fg3m',
    label: 'Triples anotados',
    shortLabel: '3PM',
    helpKey: 'fg3m',
    family: 'basic',
    decimals: 1,
    suffix: '',
    isDefaultBasicKpi: true,
    fallbackMean: 1.7,
    fallbackSd: 1.0,
    gameValue: (g) => g.fg3m,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fg3m))),
  },
  {
    key: 'fg3Pct',
    label: '% Triples',
    shortLabel: '3P%',
    helpKey: 'fg3Pct',
    family: 'basic',
    decimals: 1,
    suffix: '%',
    isDefaultBasicKpi: true,
    fallbackMean: 36.4,
    fallbackSd: 6.5,
    gameValue: (g) => r1(g.fg3Pct),
    sliceValue: (gs) => {
      const m = sumBy(gs, (g) => g.fg3m);
      const a = sumBy(gs, (g) => g.fg3a);
      return a > 0 ? r1((m / a) * 100) : 0;
    },
  },
  {
    key: 'ftPct',
    label: '% Tiros libres',
    shortLabel: 'TL%',
    helpKey: 'ftPct',
    family: 'basic',
    decimals: 1,
    suffix: '%',
    isDefaultBasicKpi: true,
    fallbackMean: 78.2,
    fallbackSd: 8.8,
    gameValue: (g) => r1(g.ftPct),
    sliceValue: (gs) => {
      const m = sumBy(gs, (g) => g.ftm);
      const a = sumBy(gs, (g) => g.fta);
      return a > 0 ? r1((m / a) * 100) : 0;
    },
  },
  {
    key: 'plusMinus',
    label: 'Impacto Más / Menos',
    shortLabel: '+/-',
    helpKey: 'plusMinusBase',
    family: 'basic',
    decimals: 1,
    suffix: '',
    signed: true,
    isDefaultBasicKpi: true,
    fallbackMean: 0.0,
    fallbackSd: 4.2,
    gameValue: (g) => g.plusMinus,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.plusMinus))),
  },

  // --- 8 MÉTRICAS DE VOLUMEN Y DESGLOSE DE TIRO ---
  {
    key: 'fgm',
    label: 'Tiros de campo anotados',
    shortLabel: 'TCA',
    helpKey: 'fgmMade',
    family: 'shooting',
    decimals: 1,
    suffix: '',
    fallbackMean: 5.1,
    fallbackSd: 2.3,
    gameValue: (g) => g.fgm,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fgm))),
  },
  {
    key: 'fga',
    label: 'Tiros de campo intentados',
    shortLabel: 'TCI',
    helpKey: 'fga',
    family: 'shooting',
    decimals: 1,
    suffix: '',
    fallbackMean: 10.8,
    fallbackSd: 4.8,
    gameValue: (g) => g.fga,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fga))),
  },
  {
    key: 'fg2m',
    label: 'Tiros de 2 anotados',
    shortLabel: 'T2A',
    helpKey: 'fg2m',
    family: 'shooting',
    decimals: 1,
    suffix: '',
    fallbackMean: 3.4,
    fallbackSd: 2.0,
    gameValue: (g) => Math.max(0, g.fgm - g.fg3m),
    sliceValue: (gs) => r1(avgNums(gs.map((g) => Math.max(0, g.fgm - g.fg3m)))),
  },
  {
    key: 'fg2a',
    label: 'Tiros de 2 intentados',
    shortLabel: 'T2I',
    helpKey: 'fg2a',
    family: 'shooting',
    decimals: 1,
    suffix: '',
    fallbackMean: 6.2,
    fallbackSd: 3.5,
    gameValue: (g) => Math.max(0, g.fga - g.fg3a),
    sliceValue: (gs) => r1(avgNums(gs.map((g) => Math.max(0, g.fga - g.fg3a)))),
  },
  {
    key: 'fg2Pct',
    label: '% Tiros de 2',
    shortLabel: 'T2%',
    helpKey: 'fg2Pct',
    family: 'shooting',
    decimals: 1,
    suffix: '%',
    fallbackMean: 54.5,
    fallbackSd: 6.8,
    gameValue: (g) => {
      const m2 = Math.max(0, g.fgm - g.fg3m);
      const a2 = Math.max(0, g.fga - g.fg3a);
      return a2 > 0 ? r1((m2 / a2) * 100) : 0;
    },
    sliceValue: (gs) => {
      const m2 = sumBy(gs, (g) => Math.max(0, g.fgm - g.fg3m));
      const a2 = sumBy(gs, (g) => Math.max(0, g.fga - g.fg3a));
      return a2 > 0 ? r1((m2 / a2) * 100) : 0;
    },
  },
  {
    key: 'fg3a',
    label: 'Triples intentados',
    shortLabel: '3PI',
    helpKey: 'fg3a',
    family: 'shooting',
    decimals: 1,
    suffix: '',
    fallbackMean: 4.6,
    fallbackSd: 2.5,
    gameValue: (g) => g.fg3a,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fg3a))),
  },
  {
    key: 'ftm',
    label: 'Tiros libres anotados',
    shortLabel: 'TLA',
    helpKey: 'ftmMade',
    family: 'shooting',
    decimals: 1,
    suffix: '',
    fallbackMean: 2.0,
    fallbackSd: 1.6,
    gameValue: (g) => g.ftm,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.ftm))),
  },
  {
    key: 'fta',
    label: 'Tiros libres intentados',
    shortLabel: 'TLI',
    helpKey: 'fta',
    family: 'shooting',
    decimals: 1,
    suffix: '',
    fallbackMean: 2.6,
    fallbackSd: 1.9,
    gameValue: (g) => g.fta,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fta))),
  },

  // --- 17 RATIOS, EFICIENCIA Y PROYECCIONES (Todos los ratios por partido) ---
  {
    key: 'tsPct',
    label: 'Acierto Real (TS%)',
    shortLabel: 'TS%',
    helpKey: 'tsPct',
    family: 'ratios',
    decimals: 1,
    suffix: '%',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 58.0,
    fallbackSd: 4.8,
    gameValue: (g) => r1(g.tsPct),
    sliceValue: (gs) => {
      const pts = sumBy(gs, (g) => g.points);
      const fga = sumBy(gs, (g) => g.fga);
      const fta = sumBy(gs, (g) => g.fta);
      const denom = 2 * (fga + 0.44 * fta);
      return denom > 0 ? r1((pts / denom) * 100) : 0;
    },
  },
  {
    key: 'efgPct',
    label: 'Tiro Efectivo (eFG%)',
    shortLabel: 'eFG%',
    helpKey: 'efgPct',
    family: 'ratios',
    decimals: 1,
    suffix: '%',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 54.4,
    fallbackSd: 5.2,
    gameValue: (g) => r1(g.efgPct),
    sliceValue: (gs) => {
      const fgm = sumBy(gs, (g) => g.fgm);
      const fg3m = sumBy(gs, (g) => g.fg3m);
      const fga = sumBy(gs, (g) => g.fga);
      return fga > 0 ? r1(((fgm + 0.5 * fg3m) / fga) * 100) : 0;
    },
  },
  {
    key: 'usgEst',
    label: 'Uso Ofensivo (USG%)',
    shortLabel: 'USG%',
    helpKey: 'usgPct',
    family: 'ratios',
    decimals: 1,
    suffix: '%',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 19.6,
    fallbackSd: 5.4,
    gameValue: (g) => r1(g.usgEst),
    sliceValue: (gs) => {
      const totMin = sumBy(gs, (g) => g.minutes);
      if (totMin > 0) {
        const w = sumBy(gs, (g) => g.usgEst * g.minutes);
        return r1(w / totMin);
      }
      return r1(avgNums(gs.map((g) => g.usgEst)));
    },
  },
  {
    key: 'gameScore',
    label: 'Valoración (GmSc)',
    shortLabel: 'GmSc',
    helpKey: 'gmSc',
    family: 'ratios',
    decimals: 1,
    suffix: '',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 10.6,
    fallbackSd: 4.9,
    gameValue: (g) => r1(g.gameScore),
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.gameScore))),
  },
  {
    key: 'pra',
    label: 'Producción PRA',
    shortLabel: 'PRA',
    helpKey: 'pra',
    family: 'ratios',
    decimals: 1,
    suffix: '',
    fallbackMean: 21.9,
    fallbackSd: 9.2,
    gameValue: (g) => g.pra,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.pra))),
  },
  {
    key: 'stocks',
    label: 'Robos + Tapones (STK)',
    shortLabel: 'STK',
    helpKey: 'stocksBase',
    family: 'ratios',
    decimals: 1,
    suffix: '',
    fallbackMean: 1.4,
    fallbackSd: 0.6,
    gameValue: (g) => g.stocks,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.stocks))),
  },
  {
    key: 'astTo',
    label: 'Ratio Asist./Pérdidas',
    shortLabel: 'AST/PER',
    helpKey: 'astTo',
    family: 'ratios',
    decimals: 2,
    suffix: '',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 2.05,
    fallbackSd: 0.85,
    gameValue: (g) => r2(g.turnovers > 0 ? g.assists / g.turnovers : g.assists),
    sliceValue: (gs) => {
      const ast = sumBy(gs, (g) => g.assists);
      const tov = sumBy(gs, (g) => g.turnovers);
      if (ast === 0 && tov === 0) return 0;
      return r2(tov > 0 ? ast / tov : ast);
    },
  },
  {
    key: 'threePar',
    label: 'Ratio de Triples (3PAr)',
    shortLabel: '3PAr',
    helpKey: 'threeRatio',
    family: 'ratios',
    decimals: 1,
    suffix: '%',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 42.0,
    fallbackSd: 18.0,
    gameValue: (g) => (g.fga > 0 ? r1((g.fg3a / g.fga) * 100) : 0),
    sliceValue: (gs) => {
      const fg3a = sumBy(gs, (g) => g.fg3a);
      const fga = sumBy(gs, (g) => g.fga);
      return fga > 0 ? r1((fg3a / fga) * 100) : 0;
    },
  },
  {
    key: 'ftr',
    label: 'Ratio Tiros Libres (FTr)',
    shortLabel: 'FTr',
    helpKey: 'ftr',
    family: 'ratios',
    decimals: 1,
    suffix: '%',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 24.5,
    fallbackSd: 11.5,
    gameValue: (g) => (g.fga > 0 ? r1((g.fta / g.fga) * 100) : 0),
    sliceValue: (gs) => {
      const fta = sumBy(gs, (g) => g.fta);
      const fga = sumBy(gs, (g) => g.fga);
      return fga > 0 ? r1((fta / fga) * 100) : 0;
    },
  },
  {
    key: 'tovRatioEst',
    label: 'Ratio Pérdidas (TOV%)',
    shortLabel: 'TOV%',
    helpKey: 'tovRatioEst',
    family: 'ratios',
    decimals: 1,
    suffix: '%',
    lowerIsBetter: true,
    isAdvancedRadiographyRatio: true,
    fallbackMean: 11.8,
    fallbackSd: 3.6,
    gameValue: (g) => {
      const plays = g.fga + 0.44 * g.fta + g.turnovers;
      return plays > 0 ? r1((g.turnovers / plays) * 100) : 0;
    },
    sliceValue: (gs) => {
      const tov = sumBy(gs, (g) => g.turnovers);
      const fga = sumBy(gs, (g) => g.fga);
      const fta = sumBy(gs, (g) => g.fta);
      const plays = fga + 0.44 * fta + tov;
      return plays > 0 ? r1((tov / plays) * 100) : 0;
    },
  },
  {
    key: 'ptsPerShot',
    label: 'Puntos por Tiro (PTS/TCI)',
    shortLabel: 'PTS/TCI',
    helpKey: 'ptsPerShot',
    family: 'ratios',
    decimals: 2,
    suffix: '',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 1.25,
    fallbackSd: 0.14,
    gameValue: (g) => (g.fga > 0 ? r2(g.points / g.fga) : 0),
    sliceValue: (gs) => {
      const pts = sumBy(gs, (g) => g.points);
      const fga = sumBy(gs, (g) => g.fga);
      return fga > 0 ? r2(pts / fga) : 0;
    },
  },
  {
    key: 'ptsPerMin',
    label: 'Puntos por Minuto',
    shortLabel: 'PTS/MIN',
    helpKey: 'ptsPerMin',
    family: 'ratios',
    decimals: 2,
    suffix: '',
    fallbackMean: 0.52,
    fallbackSd: 0.16,
    gameValue: (g) => (g.minutes > 0 ? r2(g.points / g.minutes) : 0),
    sliceValue: (gs) => {
      const pts = sumBy(gs, (g) => g.points);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r2(pts / min) : 0;
    },
  },
  {
    key: 'ptsPer36',
    label: 'Puntos por 36 min',
    shortLabel: 'PTS/36',
    helpKey: 'ptsPer36',
    family: 'ratios',
    decimals: 1,
    suffix: '',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 18.8,
    fallbackSd: 5.6,
    gameValue: (g) => (g.minutes > 0 ? r1((g.points / g.minutes) * 36) : 0),
    sliceValue: (gs) => {
      const pts = sumBy(gs, (g) => g.points);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r1((pts / min) * 36) : 0;
    },
  },
  {
    key: 'rebPer36',
    label: 'Rebotes por 36 min',
    shortLabel: 'REB/36',
    helpKey: 'rebPer36',
    family: 'ratios',
    decimals: 1,
    suffix: '',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 6.9,
    fallbackSd: 3.1,
    gameValue: (g) => (g.minutes > 0 ? r1((g.rebounds / g.minutes) * 36) : 0),
    sliceValue: (gs) => {
      const reb = sumBy(gs, (g) => g.rebounds);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r1((reb / min) * 36) : 0;
    },
  },
  {
    key: 'astPer36',
    label: 'Asistencias por 36 min',
    shortLabel: 'AST/36',
    helpKey: 'astPer36',
    family: 'ratios',
    decimals: 1,
    suffix: '',
    isAdvancedRadiographyRatio: true,
    fallbackMean: 4.5,
    fallbackSd: 2.5,
    gameValue: (g) => (g.minutes > 0 ? r1((g.assists / g.minutes) * 36) : 0),
    sliceValue: (gs) => {
      const ast = sumBy(gs, (g) => g.assists);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r1((ast / min) * 36) : 0;
    },
  },
  {
    key: 'praPer36',
    label: 'PRA por 36 min',
    shortLabel: 'PRA/36',
    helpKey: 'praPer36',
    family: 'ratios',
    decimals: 1,
    suffix: '',
    fallbackMean: 30.2,
    fallbackSd: 7.4,
    gameValue: (g) => (g.minutes > 0 ? r1((g.pra / g.minutes) * 36) : 0),
    sliceValue: (gs) => {
      const pra = sumBy(gs, (g) => g.pra);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r1((pra / min) * 36) : 0;
    },
  },
  {
    key: 'stocksPer36',
    label: 'Robos+Tapones / 36m',
    shortLabel: 'STK/36',
    helpKey: 'stocksPer36',
    family: 'ratios',
    decimals: 1,
    suffix: '',
    fallbackMean: 2.0,
    fallbackSd: 0.85,
    gameValue: (g) => (g.minutes > 0 ? r1((g.stocks / g.minutes) * 36) : 0),
    sliceValue: (gs) => {
      const stk = sumBy(gs, (g) => g.stocks);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r1((stk / min) * 36) : 0;
    },
  },
];

export const PLAYER_METRICS_MAP: Record<string, PlayerPerGameMetricDef> =
  Object.fromEntries(PLAYER_PER_GAME_METRICS.map((m) => [m.key, m]));

export const PLAYER_ANNUAL_TRACKING_METRICS: PlayerAnnualTrackingMetricDef[] = [
  {
    key: 'offRtg',
    label: 'Eficiencia Ofensiva (OffRtg)',
    shortLabel: 'OffRtg',
    helpKey: 'offRtg',
    group: 'on_court',
    decimals: 1,
    suffix: '',
    fallbackMean: 114.2,
    fallbackSd: 4.8,
  },
  {
    key: 'defRtg',
    label: 'Eficiencia Defensiva (DefRtg)',
    shortLabel: 'DefRtg',
    helpKey: 'defRtg',
    group: 'on_court',
    decimals: 1,
    suffix: '',
    lowerIsBetter: true,
    fallbackMean: 113.8,
    fallbackSd: 4.5,
  },
  {
    key: 'netRtg',
    label: 'Dominio Neto en pista (NetRtg)',
    shortLabel: 'NetRtg',
    helpKey: 'netRtg',
    group: 'on_court',
    decimals: 1,
    suffix: '',
    signed: true,
    fallbackMean: 0.4,
    fallbackSd: 5.8,
  },
  {
    key: 'pie',
    label: 'Impacto Global NBA.com (PIE%)',
    shortLabel: 'PIE%',
    helpKey: 'pie',
    group: 'on_court',
    decimals: 1,
    suffix: '%',
    fallbackMean: 10.2,
    fallbackSd: 3.4,
  },
  {
    key: 'astPct',
    label: '% Asistencias en pista (AST%)',
    shortLabel: 'AST%',
    helpKey: 'astPct',
    group: 'on_court',
    decimals: 1,
    suffix: '%',
    fallbackMean: 15.8,
    fallbackSd: 8.6,
  },
  {
    key: 'orebPct',
    label: '% Rebote Ofensivo (OREB%)',
    shortLabel: 'OREB%',
    helpKey: 'orebPct',
    group: 'on_court',
    decimals: 1,
    suffix: '%',
    fallbackMean: 4.6,
    fallbackSd: 3.4,
  },
  {
    key: 'drebPct',
    label: '% Rebote Defensivo (DREB%)',
    shortLabel: 'DREB%',
    helpKey: 'drebPct',
    group: 'on_court',
    decimals: 1,
    suffix: '%',
    fallbackMean: 14.2,
    fallbackSd: 5.8,
  },
  {
    key: 'rebPct',
    label: '% Rebote Total (REB%)',
    shortLabel: 'REB%',
    helpKey: 'rebPct',
    group: 'on_court',
    decimals: 1,
    suffix: '%',
    fallbackMean: 9.4,
    fallbackSd: 4.1,
  },
  {
    key: 'ptsPaint',
    label: 'Puntos en la Pintura / PJ',
    shortLabel: 'Pintura',
    helpKey: 'ptsPaint',
    group: 'zones',
    decimals: 1,
    suffix: '',
    fallbackMean: 5.8,
    fallbackSd: 3.6,
  },
  {
    key: 'pts2ndChance',
    label: 'Puntos 2ª Oportunidad / PJ',
    shortLabel: '2ª Jug.',
    helpKey: 'pts2ndChance',
    group: 'zones',
    decimals: 1,
    suffix: '',
    fallbackMean: 1.6,
    fallbackSd: 1.0,
  },
  {
    key: 'ptsFastBreak',
    label: 'Puntos Contraataque / PJ',
    shortLabel: 'Contraat.',
    helpKey: 'ptsFastBreak',
    group: 'zones',
    decimals: 1,
    suffix: '',
    fallbackMean: 1.9,
    fallbackSd: 1.2,
  },
  {
    key: 'ptsOffTov',
    label: 'Puntos tras Pérdida Rival / PJ',
    shortLabel: 'Tras Pérd.',
    helpKey: 'ptsOffTov',
    group: 'zones',
    decimals: 1,
    suffix: '',
    fallbackMean: 2.1,
    fallbackSd: 1.1,
  },
  {
    key: 'contestedShots',
    label: 'Tiros Punteados / PJ',
    shortLabel: 'Punteados',
    helpKey: 'contestedShots',
    group: 'hustle',
    decimals: 1,
    suffix: '',
    fallbackMean: 4.8,
    fallbackSd: 2.4,
  },
  {
    key: 'deflections',
    label: 'Desvíos de Balón / PJ',
    shortLabel: 'Desvíos',
    helpKey: 'deflections',
    group: 'hustle',
    decimals: 1,
    suffix: '',
    fallbackMean: 1.6,
    fallbackSd: 0.8,
  },
  {
    key: 'screenAssists',
    label: 'Asistencias de Bloqueo / PJ',
    shortLabel: 'Screen AST',
    helpKey: 'screenAssists',
    group: 'hustle',
    decimals: 1,
    suffix: '',
    fallbackMean: 1.1,
    fallbackSd: 1.2,
  },
  {
    key: 'boxOuts',
    label: 'Cierres de Rebote (Box-Outs)',
    shortLabel: 'Box-Outs',
    helpKey: 'boxOuts',
    group: 'hustle',
    decimals: 1,
    suffix: '',
    fallbackMean: 1.2,
    fallbackSd: 0.9,
  },
  {
    key: 'looseBalls',
    label: 'Balones Divididos / PJ',
    shortLabel: 'Bal. Sueltos',
    helpKey: 'looseBalls',
    group: 'hustle',
    decimals: 1,
    suffix: '',
    fallbackMean: 0.6,
    fallbackSd: 0.35,
  },
  {
    key: 'foulsDrawn',
    label: 'Faltas Recibidas / PJ',
    shortLabel: 'Faltas Rec.',
    helpKey: 'foulsDrawn',
    group: 'zones',
    decimals: 1,
    suffix: '',
    fallbackMean: 2.4,
    fallbackSd: 1.5,
  },
];

export const PLAYER_ANNUAL_TRACKING_MAP: Record<
  string,
  PlayerAnnualTrackingMetricDef
> = Object.fromEntries(PLAYER_ANNUAL_TRACKING_METRICS.map((m) => [m.key, m]));

export type AdvancedAddableGroup = 'ratios_36' | 'zones_reb' | 'hustle';

export interface PlayerAdvancedRadiographyMetricDef {
  key: string;
  label: string;
  shortLabel: string;
  helpKey: string;
  source: 'sample_ratio' | 'annual_tracking';
  isDefaultCore15: boolean;
  addableGroup?: AdvancedAddableGroup;
  perGameKey?: string;
  annualKey?: keyof PlayerAdvancedProfile;
}

const DEFAULT_15_SAMPLE_RATIO_KEYS = [
  'tsPct',
  'efgPct',
  'usgEst',
  'gameScore',
  'astTo',
  'tovRatioEst',
  'threePar',
  'ftr',
  'ptsPerShot',
] as const;

const DEFAULT_15_ANNUAL_TRACKING_KEYS: Array<keyof PlayerAdvancedProfile> = [
  'offRtg',
  'defRtg',
  'netRtg',
  'pie',
  'astPct',
  'rebPct',
];

const ADDABLE_SAMPLE_RATIO_KEYS = [
  'pra',
  'stocks',
  'ptsPerMin',
  'ptsPer36',
  'rebPer36',
  'astPer36',
  'praPer36',
  'stocksPer36',
] as const;

const ADDABLE_ZONES_REB_KEYS: Array<keyof PlayerAdvancedProfile> = [
  'orebPct',
  'drebPct',
  'ptsPaint',
  'pts2ndChance',
  'ptsFastBreak',
  'ptsOffTov',
  'foulsDrawn',
];

const ADDABLE_HUSTLE_KEYS: Array<keyof PlayerAdvancedProfile> = [
  'contestedShots',
  'deflections',
  'screenAssists',
  'boxOuts',
  'looseBalls',
];

export const PLAYER_ADVANCED_RADIOGRAPHY_METRICS: PlayerAdvancedRadiographyMetricDef[] =
  [
    // 15 estadísticas avanzadas de base (9 ratios recalculados en muestra + 6 pilares en pista NBA.com)
    ...DEFAULT_15_SAMPLE_RATIO_KEYS.map((k) => {
      const m = PLAYER_METRICS_MAP[k];
      return {
        key: m.key,
        label: m.label,
        shortLabel: m.shortLabel,
        helpKey: m.helpKey,
        source: 'sample_ratio' as const,
        isDefaultCore15: true,
        perGameKey: m.key,
      };
    }),
    ...DEFAULT_15_ANNUAL_TRACKING_KEYS.map((k) => {
      const m = PLAYER_ANNUAL_TRACKING_MAP[k];
      return {
        key: String(m.key),
        label: m.label,
        shortLabel: m.shortLabel,
        helpKey: m.helpKey,
        source: 'annual_tracking' as const,
        isDefaultCore15: true,
        annualKey: m.key,
      };
    }),
    // 20 KPIs avanzados adicionales seleccionables mediante "+ Añadir KPIs"
    ...ADDABLE_SAMPLE_RATIO_KEYS.map((k) => {
      const m = PLAYER_METRICS_MAP[k];
      return {
        key: m.key,
        label: m.label,
        shortLabel: m.shortLabel,
        helpKey: m.helpKey,
        source: 'sample_ratio' as const,
        isDefaultCore15: false,
        addableGroup: 'ratios_36' as const,
        perGameKey: m.key,
      };
    }),
    ...ADDABLE_ZONES_REB_KEYS.map((k) => {
      const m = PLAYER_ANNUAL_TRACKING_MAP[k];
      return {
        key: String(m.key),
        label: m.label,
        shortLabel: m.shortLabel,
        helpKey: m.helpKey,
        source: 'annual_tracking' as const,
        isDefaultCore15: false,
        addableGroup: 'zones_reb' as const,
        annualKey: m.key,
      };
    }),
    ...ADDABLE_HUSTLE_KEYS.map((k) => {
      const m = PLAYER_ANNUAL_TRACKING_MAP[k];
      return {
        key: String(m.key),
        label: m.label,
        shortLabel: m.shortLabel,
        helpKey: m.helpKey,
        source: 'annual_tracking' as const,
        isDefaultCore15: false,
        addableGroup: 'hustle' as const,
        annualKey: m.key,
      };
    }),
  ];

export const PLAYER_ADVANCED_RADIOGRAPHY_MAP: Record<
  string,
  PlayerAdvancedRadiographyMetricDef
> = Object.fromEntries(
  PLAYER_ADVANCED_RADIOGRAPHY_METRICS.map((m) => [m.key, m])
);

export const DEFAULT_PLAYER_LOG_COLUMNS = [
  'minutes',
  'points',
  'rebounds',
  'assists',
  'fg_split',
  'fg3_split',
  'ft_split',
  'plusMinus',
] as const;

export const MAX_PLAYER_LOG_COLUMNS = 10;

export const PLAYER_GAME_LOG_COLUMNS: PlayerGameLogColumnDef[] = [
  // Básicas (8 por defecto + complementarias)
  {
    key: 'minutes',
    label: 'MIN',
    helpKey: 'minBase',
    family: 'basic',
    isDefault: true,
    renderCell: (g) => `${g.minutes}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.minutes))).toFixed(1),
  },
  {
    key: 'points',
    label: 'PTS',
    helpKey: 'ptsBase',
    family: 'basic',
    isDefault: true,
    highlightTone: 'primary',
    renderCell: (g) => `${g.points}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.points))).toFixed(1),
  },
  {
    key: 'rebounds',
    label: 'REB',
    helpKey: 'rebBase',
    family: 'basic',
    isDefault: true,
    renderCell: (g) => `${g.rebounds}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.rebounds))).toFixed(1),
  },
  {
    key: 'oreb',
    label: 'OREB',
    helpKey: 'orebBase',
    family: 'basic',
    renderCell: (g) => `${g.oreb}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.oreb))).toFixed(1),
  },
  {
    key: 'dreb',
    label: 'DREB',
    helpKey: 'drebBase',
    family: 'basic',
    renderCell: (g) => `${g.dreb}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.dreb))).toFixed(1),
  },
  {
    key: 'assists',
    label: 'AST',
    helpKey: 'astBase',
    family: 'basic',
    isDefault: true,
    renderCell: (g) => `${g.assists}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.assists))).toFixed(1),
  },
  {
    key: 'steals',
    label: 'ROB',
    helpKey: 'steals',
    family: 'basic',
    renderCell: (g) => `${g.steals}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.steals))).toFixed(1),
  },
  {
    key: 'blocks',
    label: 'TAP',
    helpKey: 'blocks',
    family: 'basic',
    renderCell: (g) => `${g.blocks}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.blocks))).toFixed(1),
  },
  {
    key: 'stocks',
    label: 'STK',
    helpKey: 'stocksBase',
    family: 'basic',
    renderCell: (g) => `${g.stocks}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.stocks))).toFixed(1),
  },
  {
    key: 'turnovers',
    label: 'PER',
    helpKey: 'tov',
    family: 'basic',
    renderCell: (g) => `${g.turnovers}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.turnovers))).toFixed(1),
  },
  {
    key: 'fouls',
    label: 'FP',
    helpKey: 'personalFouls',
    family: 'basic',
    renderCell: (g) => `${g.fouls}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.fouls))).toFixed(1),
  },
  {
    key: 'pra',
    label: 'PRA',
    helpKey: 'pra',
    family: 'basic',
    highlightTone: 'primary',
    renderCell: (g) => `${g.pra}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.pra))).toFixed(1),
  },

  // Tiro (series A-I y porcentajes)
  {
    key: 'fg_split',
    label: 'TC',
    helpKey: 'fgPct',
    family: 'shooting',
    isDefault: true,
    renderCell: (g) => `${g.fgm}-${g.fga}`,
    renderAverage: (gs) =>
      `${r1(avgNums(gs.map((g) => g.fgm))).toFixed(1)}-${r1(
        avgNums(gs.map((g) => g.fga))
      ).toFixed(1)}`,
  },
  {
    key: 'fgPct',
    label: 'TC%',
    helpKey: 'fgPct',
    family: 'shooting',
    renderCell: (g) => (g.fga > 0 ? `${g.fgPct.toFixed(1)}%` : '—'),
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.fgPct.sliceValue(gs).toFixed(1)}%`,
  },
  {
    key: 'fg2_split',
    label: 'T2',
    helpKey: 'fg2Pct',
    family: 'shooting',
    renderCell: (g) =>
      `${Math.max(0, g.fgm - g.fg3m)}-${Math.max(0, g.fga - g.fg3a)}`,
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.fg2m.sliceValue(gs).toFixed(1)}-${PLAYER_METRICS_MAP.fg2a
        .sliceValue(gs)
        .toFixed(1)}`,
  },
  {
    key: 'fg2Pct',
    label: 'T2%',
    helpKey: 'fg2Pct',
    family: 'shooting',
    renderCell: (g) => {
      const a2 = Math.max(0, g.fga - g.fg3a);
      return a2 > 0
        ? `${PLAYER_METRICS_MAP.fg2Pct.gameValue(g).toFixed(1)}%`
        : '—';
    },
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.fg2Pct.sliceValue(gs).toFixed(1)}%`,
  },
  {
    key: 'fg3_split',
    label: '3P',
    helpKey: 'fg3Pct',
    family: 'shooting',
    isDefault: true,
    renderCell: (g) => `${g.fg3m}-${g.fg3a}`,
    renderAverage: (gs) =>
      `${r1(avgNums(gs.map((g) => g.fg3m))).toFixed(1)}-${r1(
        avgNums(gs.map((g) => g.fg3a))
      ).toFixed(1)}`,
  },
  {
    key: 'fg3Pct',
    label: '3P%',
    helpKey: 'fg3Pct',
    family: 'shooting',
    renderCell: (g) => (g.fg3a > 0 ? `${g.fg3Pct.toFixed(1)}%` : '—'),
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.fg3Pct.sliceValue(gs).toFixed(1)}%`,
  },
  {
    key: 'ft_split',
    label: 'TL',
    helpKey: 'ftPct',
    family: 'shooting',
    isDefault: true,
    renderCell: (g) => `${g.ftm}-${g.fta}`,
    renderAverage: (gs) =>
      `${r1(avgNums(gs.map((g) => g.ftm))).toFixed(1)}-${r1(
        avgNums(gs.map((g) => g.fta))
      ).toFixed(1)}`,
  },
  {
    key: 'ftPct',
    label: 'TL%',
    helpKey: 'ftPct',
    family: 'shooting',
    renderCell: (g) => (g.fta > 0 ? `${g.ftPct.toFixed(1)}%` : '—'),
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.ftPct.sliceValue(gs).toFixed(1)}%`,
  },
  {
    key: 'plusMinus',
    label: '+/-',
    helpKey: 'plusMinusBase',
    family: 'basic',
    isDefault: true,
    highlightTone: 'signed',
    numericForTone: (g) => g.plusMinus,
    renderCell: (g) => formatMetricNumber(g.plusMinus, 0, '', true),
    renderAverage: (gs) =>
      formatMetricNumber(PLAYER_METRICS_MAP.plusMinus.sliceValue(gs), 1, '', true),
  },

  // Ratios y eficiencia avanzada
  {
    key: 'usgEst',
    label: 'USG%',
    helpKey: 'usgPct',
    family: 'ratios',
    highlightTone: 'orange',
    renderCell: (g) => `${g.usgEst.toFixed(1)}%`,
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.usgEst.sliceValue(gs).toFixed(1)}%`,
  },
  {
    key: 'tsPct',
    label: 'TS%',
    helpKey: 'tsPct',
    family: 'ratios',
    highlightTone: 'emerald',
    renderCell: (g) => `${g.tsPct.toFixed(1)}%`,
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.tsPct.sliceValue(gs).toFixed(1)}%`,
  },
  {
    key: 'efgPct',
    label: 'eFG%',
    helpKey: 'efgPct',
    family: 'ratios',
    renderCell: (g) => `${g.efgPct.toFixed(1)}%`,
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.efgPct.sliceValue(gs).toFixed(1)}%`,
  },
  {
    key: 'gameScore',
    label: 'GmSc',
    helpKey: 'gmSc',
    family: 'ratios',
    highlightTone: 'primary',
    renderCell: (g) => g.gameScore.toFixed(1),
    renderAverage: (gs) =>
      PLAYER_METRICS_MAP.gameScore.sliceValue(gs).toFixed(1),
  },
  {
    key: 'astTo',
    label: 'AST/PER',
    helpKey: 'astTo',
    family: 'ratios',
    renderCell: (g) => PLAYER_METRICS_MAP.astTo.gameValue(g).toFixed(2),
    renderAverage: (gs) => PLAYER_METRICS_MAP.astTo.sliceValue(gs).toFixed(2),
  },
  {
    key: 'threePar',
    label: '3PAr',
    helpKey: 'threeRatio',
    family: 'ratios',
    renderCell: (g) =>
      g.fga > 0 ? `${PLAYER_METRICS_MAP.threePar.gameValue(g).toFixed(1)}%` : '—',
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.threePar.sliceValue(gs).toFixed(1)}%`,
  },
  {
    key: 'ftr',
    label: 'FTr',
    helpKey: 'ftr',
    family: 'ratios',
    renderCell: (g) =>
      g.fga > 0 ? `${PLAYER_METRICS_MAP.ftr.gameValue(g).toFixed(1)}%` : '—',
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.ftr.sliceValue(gs).toFixed(1)}%`,
  },
  {
    key: 'tovRatioEst',
    label: 'TOV%',
    helpKey: 'tovRatioEst',
    family: 'ratios',
    renderCell: (g) =>
      `${PLAYER_METRICS_MAP.tovRatioEst.gameValue(g).toFixed(1)}%`,
    renderAverage: (gs) =>
      `${PLAYER_METRICS_MAP.tovRatioEst.sliceValue(gs).toFixed(1)}%`,
  },
  {
    key: 'ptsPerShot',
    label: 'PTS/TCI',
    helpKey: 'ptsPerShot',
    family: 'ratios',
    renderCell: (g) =>
      g.fga > 0 ? PLAYER_METRICS_MAP.ptsPerShot.gameValue(g).toFixed(2) : '—',
    renderAverage: (gs) =>
      PLAYER_METRICS_MAP.ptsPerShot.sliceValue(gs).toFixed(2),
  },
  {
    key: 'ptsPerMin',
    label: 'PTS/MIN',
    helpKey: 'ptsPerMin',
    family: 'ratios',
    renderCell: (g) => PLAYER_METRICS_MAP.ptsPerMin.gameValue(g).toFixed(2),
    renderAverage: (gs) => PLAYER_METRICS_MAP.ptsPerMin.sliceValue(gs).toFixed(2),
  },
  {
    key: 'ptsPer36',
    label: 'PTS/36',
    helpKey: 'ptsPer36',
    family: 'ratios',
    renderCell: (g) => PLAYER_METRICS_MAP.ptsPer36.gameValue(g).toFixed(1),
    renderAverage: (gs) => PLAYER_METRICS_MAP.ptsPer36.sliceValue(gs).toFixed(1),
  },
  {
    key: 'rebPer36',
    label: 'REB/36',
    helpKey: 'rebPer36',
    family: 'ratios',
    renderCell: (g) => PLAYER_METRICS_MAP.rebPer36.gameValue(g).toFixed(1),
    renderAverage: (gs) => PLAYER_METRICS_MAP.rebPer36.sliceValue(gs).toFixed(1),
  },
  {
    key: 'astPer36',
    label: 'AST/36',
    helpKey: 'astPer36',
    family: 'ratios',
    renderCell: (g) => PLAYER_METRICS_MAP.astPer36.gameValue(g).toFixed(1),
    renderAverage: (gs) => PLAYER_METRICS_MAP.astPer36.sliceValue(gs).toFixed(1),
  },
];

export const PLAYER_LOG_COLUMNS_MAP: Record<string, PlayerGameLogColumnDef> =
  Object.fromEntries(PLAYER_GAME_LOG_COLUMNS.map((c) => [c.key, c]));

export function buildExtendedPlayerBenchmarks(
  players: PlayerSummary[],
  gameFilter?: (g: PlayerGameLog) => boolean
): Record<string, PlayerInspectorBenchmarkItem> {
  const projected = players
    .map((p) => ({
      advanced: p.advanced,
      games: gameFilter ? p.games.filter(gameFilter) : p.games,
    }))
    .filter((p) => p.games.length > 0);

  const rotPool = projected.filter(
    (p) =>
      p.games.length >= 2 && avgNums(p.games.map((g) => g.minutes)) >= 15
  );
  const pool =
    rotPool.length >= 20
      ? rotPool
      : projected.filter(
          (p) => avgNums(p.games.map((g) => g.minutes)) >= 12
        ).length >= 15
      ? projected.filter((p) => avgNums(p.games.map((g) => g.minutes)) >= 12)
      : projected;

  const out: Record<string, PlayerInspectorBenchmarkItem> = {};

  for (const m of PLAYER_PER_GAME_METRICS) {
    const vals = pool
      .filter((p) => {
        if (m.key === 'fg3Pct') return sumBy(p.games, (g) => g.fg3a) >= 4;
        if (m.key === 'ftPct') return sumBy(p.games, (g) => g.fta) >= 3;
        if (m.key === 'fg2Pct')
          return sumBy(p.games, (g) => Math.max(0, g.fga - g.fg3a)) >= 4;
        if (m.key === 'fgPct' || m.key === 'tsPct' || m.key === 'efgPct')
          return sumBy(p.games, (g) => g.fga) >= 6;
        return true;
      })
      .map((p) => m.sliceValue(p.games));

    if (vals.length < 8) {
      out[m.key] = {
        mean: m.fallbackMean,
        sd: m.fallbackSd,
        lowerIsBetter: m.lowerIsBetter,
        decimals: m.decimals,
        suffix: m.suffix,
      };
    } else {
      const avg = m.decimals === 2 ? r2(avgNums(vals)) : r1(avgNums(vals));
      const sdRaw = m.decimals === 2 ? r2(sdNums(vals)) : r1(sdNums(vals));
      out[m.key] = {
        mean: avg,
        sd: Math.max(m.fallbackSd * 0.45, sdRaw),
        lowerIsBetter: m.lowerIsBetter,
        decimals: m.decimals,
        suffix: m.suffix,
      };
    }
  }

  for (const t of PLAYER_ANNUAL_TRACKING_METRICS) {
    const vals = pool
      .map((p) => (p.advanced ? Number(p.advanced[t.key]) : NaN))
      .filter((v) => Number.isFinite(v) && (t.signed || v > 0));

    if (vals.length < 8) {
      out[t.key] = {
        mean: t.fallbackMean,
        sd: t.fallbackSd,
        lowerIsBetter: t.lowerIsBetter,
        decimals: t.decimals,
        suffix: t.suffix,
      };
    } else {
      const avg = r1(avgNums(vals));
      const sdRaw = r1(sdNums(vals));
      out[t.key] = {
        mean: avg,
        sd: Math.max(t.fallbackSd * 0.45, sdRaw),
        lowerIsBetter: t.lowerIsBetter,
        decimals: t.decimals,
        suffix: t.suffix,
      };
    }
  }

  return out;
}

export function resolveSampleSelection(
  allGames: PlayerGameLog[],
  preset: PlayerSamplePreset,
  sliderCount: number,
  latestLeagueDate2027: string
): {
  games: PlayerGameLog[];
  titleShort: string;
  subtitle: string;
  benchmarkScope: 'continuous' | 's2027' | 's2026' | 'sameDate2026';
  cutoffDateIso: string;
} {
  const games2027 = allGames.filter((g) => g.seasonLabel === '2026-27');
  const games2026 = allGames.filter((g) => g.seasonLabel === '2025-26');
  const fallbackCutoff =
    latestLeagueDate2027 ||
    games2027[0]?.date ||
    new Date().toISOString().slice(0, 10);

  if (preset === 'season_2027') {
    return {
      games: games2027,
      titleShort: `Temporada 2026/27 (${games2027.length} PJ)`,
      subtitle:
        games2027.length > 0
          ? `${formatDayMonthEs(games2027[games2027.length - 1].date)} – ${formatDayMonthEs(
              games2027[0].date
            )} · Campaña 2026/27`
          : 'Sin partidos disputados aún en la temporada 2026/27',
      benchmarkScope: 's2027',
      cutoffDateIso: fallbackCutoff,
    };
  }

  if (preset === 'season_2026') {
    return {
      games: games2026,
      titleShort: `Temporada 2025/26 (${games2026.length} PJ)`,
      subtitle:
        games2026.length > 0
          ? `${formatDayMonthEs(games2026[games2026.length - 1].date)} – ${formatDayMonthEs(
              games2026[0].date
            )} · Campaña 2025/26 completa`
          : 'Sin partidos registrados en la temporada 2025/26',
      benchmarkScope: 's2026',
      cutoffDateIso: fallbackCutoff,
    };
  }

  if (preset === 'continuous_both') {
    return {
      games: allGames,
      titleShort: `2025/26 + 2026/27 (${allGames.length} PJ)`,
      subtitle: `${games2026.length} PJ en 2025/26 + ${games2027.length} PJ en 2026/27`,
      benchmarkScope: 'continuous',
      cutoffDateIso: fallbackCutoff,
    };
  }

  if (preset === 'same_date_compare') {
    const cutoffCycle = seasonCycleDay(fallbackCutoff);
    const active2027 = games2027.filter(
      (g) => seasonCycleDay(g.date) <= cutoffCycle
    );
    const same2026 = games2026.filter(
      (g) => seasonCycleDay(g.date) <= cutoffCycle
    );
    const cutoffLabel = formatDayMonthEs(fallbackCutoff);
    return {
      games: active2027,
      titleShort: `2026/27 hasta ${cutoffLabel} (${active2027.length} PJ)`,
      subtitle: `Muestra 2026/27 hasta ${cutoffLabel} (${active2027.length} PJ) frente a misma fecha 2025/26 (${same2026.length} PJ)`,
      benchmarkScope: 's2027',
      cutoffDateIso: fallbackCutoff,
    };
  }

  const clamped = Math.max(1, Math.min(allGames.length || 1, sliderCount));
  const sliced = allGames.slice(0, clamped);
  return {
    games: sliced,
    titleShort: `Últimos ${sliced.length} partidos`,
    subtitle:
      sliced.length > 0
        ? `${formatDayMonthEs(sliced[sliced.length - 1].date)} – ${formatDayMonthEs(
            sliced[0].date
          )} · Muestra personalizada de ${sliced.length} PJ`
        : 'Sin partidos disponibles',
    benchmarkScope:
      sliced.length > 0 && sliced.every((g) => g.seasonLabel === '2026-27')
        ? 's2027'
        : sliced.length > 0 && sliced.every((g) => g.seasonLabel === '2025-26')
        ? 's2026'
        : 'continuous',
    cutoffDateIso: fallbackCutoff,
  };
}

export function resolveOwnBaselineSelection(
  allGames: PlayerGameLog[],
  sampleGames: PlayerGameLog[],
  mode: OwnBaselineMode,
  customLastK: number,
  latestLeagueDate2027: string
): {
  games: PlayerGameLog[];
  label: string;
  shortLabel: string;
} {
  const games2027 = allGames.filter((g) => g.seasonLabel === '2026-27');
  const games2026 = allGames.filter((g) => g.seasonLabel === '2025-26');
  const cutoffIso =
    latestLeagueDate2027 ||
    games2027[0]?.date ||
    new Date().toISOString().slice(0, 10);

  if (mode === 'season_2027') {
    return {
      games: games2027,
      label: `Temporada 2026/27 (${games2027.length} PJ)`,
      shortLabel: `26/27 (${games2027.length} PJ)`,
    };
  }

  if (mode === 'season_2026') {
    return {
      games: games2026,
      label: `Temporada 2025/26 (${games2026.length} PJ)`,
      shortLabel: `25/26 (${games2026.length} PJ)`,
    };
  }

  if (mode === 'same_date_2026') {
    const cutoffCycle = seasonCycleDay(cutoffIso);
    const same2026 = games2026.filter(
      (g) => seasonCycleDay(g.date) <= cutoffCycle
    );
    const dLabel = formatDayMonthEs(cutoffIso);
    return {
      games: same2026,
      label: `Misma fecha 2025/26 hasta ${dLabel} (${same2026.length} PJ)`,
      shortLabel: `Misma fecha 25/26 (${same2026.length} PJ)`,
    };
  }

  if (mode === 'outside_sample') {
    const activeIds = new Set(sampleGames.map((g) => g.eventId));
    const outside = allGames.filter((g) => !activeIds.has(g.eventId));
    return {
      games: outside,
      label: `Resto de partidos fuera de muestra (${outside.length} PJ)`,
      shortLabel: `Resto (${outside.length} PJ)`,
    };
  }

  if (mode === 'custom_last_k') {
    const k = Math.max(1, Math.min(allGames.length || 1, customLastK));
    const slice = allGames.slice(0, k);
    return {
      games: slice,
      label: `Últimos ${slice.length} partidos propios`,
      shortLabel: `Últ. ${slice.length} PJ`,
    };
  }

  return {
    games: allGames,
    label: `2025/26 + 2026/27 (${allGames.length} PJ)`,
    shortLabel: `25/26+26/27 (${allGames.length} PJ)`,
  };
}

export interface EvaluatedReferenceComparison {
  hasRef: boolean;
  pct: number;
  z: number;
  delta: number;
  deltaFormatted: string;
  refFormatted: string;
  statusLabel: string;
  textClass: string;
  barClass: string;
}

export function evaluateReferenceComparison(
  value: number,
  refMean: number,
  refSd: number,
  mode: InspectorReferenceMode,
  opts: {
    decimals: number;
    suffix: string;
    lowerIsBetter?: boolean;
    signed?: boolean;
    hasRefData?: boolean;
  }
): EvaluatedReferenceComparison {
  if (opts.hasRefData === false || !Number.isFinite(refMean)) {
    return {
      hasRef: false,
      pct: 50,
      z: 0,
      delta: 0,
      deltaFormatted: '—',
      refFormatted: 'Sin muestra base',
      statusLabel: 'Sin referencia',
      textClass: 'text-slate-500',
      barClass: 'bg-slate-600',
    };
  }

  const rawDiff = value - refMean;
  const favorableDiff = opts.lowerIsBetter ? refMean - value : value - refMean;
  const safeSd = Math.max(opts.decimals === 2 ? 0.06 : 0.3, refSd || 1);
  const z = favorableDiff / safeSd;
  const pct = Math.max(5, Math.min(97, Math.round(50 + z * 22)));

  const deltaFormatted = formatMetricNumber(
    rawDiff,
    opts.decimals,
    opts.suffix,
    true
  );
  const refFormatted = formatMetricNumber(
    refMean,
    opts.decimals,
    opts.suffix,
    Boolean(opts.signed)
  );

  if (mode === 'nba') {
    if (z >= 1.25) {
      return {
        hasRef: true,
        pct,
        z,
        delta: rawDiff,
        deltaFormatted,
        refFormatted,
        statusLabel: 'Élite NBA',
        textClass: 'text-emerald-400',
        barClass: 'bg-emerald-500',
      };
    }
    if (z >= 0.42) {
      return {
        hasRef: true,
        pct,
        z,
        delta: rawDiff,
        deltaFormatted,
        refFormatted,
        statusLabel: 'Sobre media NBA',
        textClass: 'text-orange-300',
        barClass: 'bg-orange-400',
      };
    }
    if (z > -0.42) {
      return {
        hasRef: true,
        pct,
        z,
        delta: rawDiff,
        deltaFormatted,
        refFormatted,
        statusLabel: 'En media NBA',
        textClass: 'text-slate-300',
        barClass: 'bg-slate-400',
      };
    }
    return {
      hasRef: true,
      pct,
      z,
      delta: rawDiff,
      deltaFormatted,
      refFormatted,
      statusLabel: 'Bajo media NBA',
      textClass: 'text-rose-400',
      barClass: 'bg-rose-500',
    };
  }

  // Own baseline mode ("Datos propios")
  if (z >= 0.9) {
    return {
      hasRef: true,
      pct,
      z,
      delta: rawDiff,
      deltaFormatted,
      refFormatted,
      statusLabel: 'Salto fuerte',
      textClass: 'text-emerald-400',
      barClass: 'bg-emerald-500',
    };
  }
  if (z >= 0.25) {
    return {
      hasRef: true,
      pct,
      z,
      delta: rawDiff,
      deltaFormatted,
      refFormatted,
      statusLabel: 'Sobre su base',
      textClass: 'text-emerald-300',
      barClass: 'bg-emerald-500',
    };
  }
  if (z > -0.25) {
    return {
      hasRef: true,
      pct,
      z,
      delta: rawDiff,
      deltaFormatted,
      refFormatted,
      statusLabel: 'En su línea',
      textClass: 'text-slate-300',
      barClass: 'bg-slate-400',
    };
  }
  return {
    hasRef: true,
    pct,
    z,
    delta: rawDiff,
    deltaFormatted,
    refFormatted,
    statusLabel: 'Bajo su base',
    textClass: 'text-rose-400',
    barClass: 'bg-rose-500',
  };
}

export function computeOwnMetricSpread(
  games: PlayerGameLog[],
  metric: PlayerPerGameMetricDef
): number {
  if (games.length < 2) return metric.fallbackSd * 0.65;
  const perGame = games.map((g) => metric.gameValue(g));
  const sd = sdNums(perGame);
  return Math.max(metric.fallbackSd * 0.35, sd);
}
