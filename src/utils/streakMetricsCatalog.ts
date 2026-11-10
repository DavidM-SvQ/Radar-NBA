import type { PlayerGameLog, StreakEntry } from '../types/nba';

export type ThresholdOperator = 'gt' | 'gte' | 'lte' | 'lt';

export type StreakMetricGroup =
  | 'basic_counting'
  | 'shooting_vol'
  | 'combos_milestones'
  | 'shooting_eff'
  | 'ratios_per36';

export interface StreakMetricOption {
  id: string;
  group: StreakMetricGroup;
  shortLabel: string;
  label: string;
  helpKey: string;
  min: number;
  max: number;
  step: number;
  defaultThreshold: number;
  defaultOperator?: ThresholdOperator;
  lowerIsBetter?: boolean;
  unit: string;
  decimals: number;
  gameDecimals: number;
  qualificationNote?: string;
  qualifies?: (g: PlayerGameLog) => boolean;
  getValue: (g: PlayerGameLog) => number;
  // Chart visual & scaling properties
  strokeHex: string;
  dotClass: string;
  textClass: string;
  isPercentage?: boolean;
  isSmallCount?: boolean;
  allowNegative?: boolean;
}

export interface StreakChartPreloadMetricRule {
  metricId: string;
  operator: ThresholdOperator;
  threshold: number;
  isPositive?: boolean;
  customQualifies?: (g: PlayerGameLog) => boolean;
  customQualifiesLabel?: string;
}

export interface StreakChartPreloadRequest {
  nonce: number;
  playerId: string;
  metrics: StreakChartPreloadMetricRule[];
}

export const STREAK_METRIC_GROUPS: Array<{
  id: StreakMetricGroup;
  label: string;
  compactLabel: string;
  shortType: string;
}> = [
  {
    id: 'basic_counting',
    label: '1. Estadísticas básicas por partido',
    compactLabel: '1. Básicas',
    shortType: 'Acumulado',
  },
  {
    id: 'shooting_vol',
    label: '2. Volumen de tiro y conversión',
    compactLabel: '2. Volumen tiro',
    shortType: 'Volumen',
  },
  {
    id: 'combos_milestones',
    label: '3. Combinadas e hitos (PRA, DD2, TD3)',
    compactLabel: '3. Combinadas',
    shortType: 'Combinada',
  },
  {
    id: 'shooting_eff',
    label: '4. Porcentajes y eficiencia de tiro',
    compactLabel: '4. Eficiencia %',
    shortType: 'Eficiencia %',
  },
  {
    id: 'ratios_per36',
    label: '5. Ratios de creación, ritmo /36m y valoración',
    compactLabel: '5. Ratios y /36m',
    shortType: 'Ratio',
  },
];

export function countDoubleDigitStats(g: PlayerGameLog): number {
  let hits = 0;
  if (g.points >= 10) hits += 1;
  if (g.rebounds >= 10) hits += 1;
  if (g.assists >= 10) hits += 1;
  if (g.steals >= 10) hits += 1;
  if (g.blocks >= 10) hits += 1;
  return hits;
}

export function evalThresholdOp(
  val: number,
  op: ThresholdOperator,
  target: number
): boolean {
  if (op === 'gt') return val > target;
  if (op === 'gte') return val >= target;
  if (op === 'lte') return val <= target;
  return val < target;
}

export function getOperatorSymbol(op: ThresholdOperator): string {
  if (op === 'gt') return '>';
  if (op === 'gte') return '≥';
  if (op === 'lte') return '≤';
  return '<';
}

export function formatMetricNumber(
  val: number,
  decimals: number,
  unit: string,
  includeUnit = true
): string {
  const numStr = val.toFixed(decimals);
  return includeUnit ? `${numStr}${unit}` : numStr;
}

export function isRulePositive(
  metric: Pick<StreakMetricOption, 'lowerIsBetter'>,
  op: ThresholdOperator
): boolean {
  const isUpper = op === 'gt' || op === 'gte';
  return metric.lowerIsBetter ? !isUpper : isUpper;
}

export const STREAK_METRIC_OPTIONS: StreakMetricOption[] = [
  // 1. Estadísticas básicas por partido (12)
  {
    id: 'points',
    group: 'basic_counting',
    shortLabel: 'PTS',
    label: 'PTS · Puntos anotados',
    helpKey: 'ptsBase',
    min: 5,
    max: 50,
    step: 1,
    defaultThreshold: 20,
    defaultOperator: 'gte',
    unit: ' PTS',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#F97316',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-400',
    getValue: (g) => g.points,
  },
  {
    id: 'rebounds',
    group: 'basic_counting',
    shortLabel: 'REB',
    label: 'REB · Rebotes totales',
    helpKey: 'rebBase',
    min: 2,
    max: 20,
    step: 1,
    defaultThreshold: 8,
    defaultOperator: 'gte',
    unit: ' REB',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#38BDF8',
    dotClass: 'bg-sky-400',
    textClass: 'text-sky-400',
    getValue: (g) => g.rebounds,
  },
  {
    id: 'dreb',
    group: 'basic_counting',
    shortLabel: 'DR',
    label: 'DR · Rebotes defensivos',
    helpKey: 'drebBase',
    min: 2,
    max: 16,
    step: 1,
    defaultThreshold: 6,
    defaultOperator: 'gte',
    unit: ' DR',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#818CF8',
    dotClass: 'bg-indigo-400',
    textClass: 'text-indigo-300',
    getValue: (g) => g.dreb,
  },
  {
    id: 'oreb',
    group: 'basic_counting',
    shortLabel: 'OR',
    label: 'OR · Rebotes ofensivos',
    helpKey: 'orebBase',
    min: 1,
    max: 9,
    step: 1,
    defaultThreshold: 3,
    defaultOperator: 'gte',
    unit: ' OR',
    decimals: 1,
    gameDecimals: 0,
    isSmallCount: true,
    strokeHex: '#FB923C',
    dotClass: 'bg-orange-400',
    textClass: 'text-orange-300',
    getValue: (g) => g.oreb,
  },
  {
    id: 'assists',
    group: 'basic_counting',
    shortLabel: 'AST',
    label: 'AST · Asistencias',
    helpKey: 'astBase',
    min: 2,
    max: 16,
    step: 1,
    defaultThreshold: 7,
    defaultOperator: 'gte',
    unit: ' AST',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#A78BFA',
    dotClass: 'bg-violet-400',
    textClass: 'text-violet-300',
    getValue: (g) => g.assists,
  },
  {
    id: 'steals',
    group: 'basic_counting',
    shortLabel: 'ROB',
    label: 'ROB · Robos de balón',
    helpKey: 'steals',
    min: 1,
    max: 6,
    step: 1,
    defaultThreshold: 2,
    defaultOperator: 'gte',
    unit: ' ROB',
    decimals: 1,
    gameDecimals: 0,
    isSmallCount: true,
    strokeHex: '#22D3EE',
    dotClass: 'bg-cyan-400',
    textClass: 'text-cyan-300',
    getValue: (g) => g.steals,
  },
  {
    id: 'blocks',
    group: 'basic_counting',
    shortLabel: 'TAP',
    label: 'TAP · Tapones',
    helpKey: 'blocks',
    min: 1,
    max: 6,
    step: 1,
    defaultThreshold: 2,
    defaultOperator: 'gte',
    unit: ' TAP',
    decimals: 1,
    gameDecimals: 0,
    isSmallCount: true,
    strokeHex: '#60A5FA',
    dotClass: 'bg-blue-400',
    textClass: 'text-blue-300',
    getValue: (g) => g.blocks,
  },
  {
    id: 'stocks',
    group: 'basic_counting',
    shortLabel: 'STK',
    label: 'STK · Robos + Tapones (Stocks)',
    helpKey: 'stocksBase',
    min: 1,
    max: 8,
    step: 1,
    defaultThreshold: 3,
    defaultOperator: 'gte',
    unit: ' STK',
    decimals: 1,
    gameDecimals: 0,
    isSmallCount: true,
    strokeHex: '#2DD4BF',
    dotClass: 'bg-teal-400',
    textClass: 'text-teal-300',
    getValue: (g) => g.stocks,
  },
  {
    id: 'turnovers',
    group: 'basic_counting',
    shortLabel: 'PER',
    label: 'PER · Pérdidas de balón',
    helpKey: 'tov',
    min: 0,
    max: 9,
    step: 1,
    defaultThreshold: 2,
    defaultOperator: 'lte',
    lowerIsBetter: true,
    unit: ' PER',
    decimals: 1,
    gameDecimals: 0,
    isSmallCount: true,
    qualificationNote:
      'Exige ≥15 MIN (usa ≤ para seguridad o ≥ para exceso de pérdidas)',
    qualifies: (g) => g.minutes >= 15,
    strokeHex: '#FBBF24',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
    getValue: (g) => g.turnovers,
  },
  {
    id: 'fouls',
    group: 'basic_counting',
    shortLabel: 'FP',
    label: 'FP · Faltas personales cometidas',
    helpKey: 'personalFouls',
    min: 0,
    max: 6,
    step: 1,
    defaultThreshold: 2,
    defaultOperator: 'lte',
    lowerIsBetter: true,
    unit: ' FP',
    decimals: 1,
    gameDecimals: 0,
    isSmallCount: true,
    qualificationNote:
      'Exige ≥15 MIN (usa ≤ para disciplina o ≥ para problemas de faltas)',
    qualifies: (g) => g.minutes >= 15,
    strokeHex: '#E879F9',
    dotClass: 'bg-fuchsia-400',
    textClass: 'text-fuchsia-300',
    getValue: (g) => g.fouls,
  },
  {
    id: 'plusMinus',
    group: 'basic_counting',
    shortLabel: '+/-',
    label: '+/- · Impacto Más / Menos en pista',
    helpKey: 'plusMinusBase',
    min: -15,
    max: 25,
    step: 1,
    defaultThreshold: 5,
    defaultOperator: 'gte',
    unit: '',
    decimals: 1,
    gameDecimals: 0,
    allowNegative: true,
    strokeHex: '#FACC15',
    dotClass: 'bg-yellow-400',
    textClass: 'text-yellow-300',
    getValue: (g) => g.plusMinus,
  },
  {
    id: 'minutes',
    group: 'basic_counting',
    shortLabel: 'MIN',
    label: 'MIN · Minutos jugados',
    helpKey: 'minBase',
    min: 15,
    max: 44,
    step: 1,
    defaultThreshold: 34,
    defaultOperator: 'gte',
    unit: ' MIN',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#94A3B8',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-300',
    getValue: (g) => g.minutes,
  },

  // 2. Volumen de tiro y conversión (9)
  {
    id: 'fg3m',
    group: 'shooting_vol',
    shortLabel: '3PM',
    label: '3PM · Triples anotados',
    helpKey: 'fg3m',
    min: 1,
    max: 10,
    step: 1,
    defaultThreshold: 3,
    defaultOperator: 'gte',
    unit: ' 3PM',
    decimals: 1,
    gameDecimals: 0,
    isSmallCount: true,
    strokeHex: '#22D3EE',
    dotClass: 'bg-cyan-400',
    textClass: 'text-cyan-300',
    getValue: (g) => g.fg3m,
  },
  {
    id: 'fg3a',
    group: 'shooting_vol',
    shortLabel: '3PA',
    label: '3PA · Triples intentados',
    helpKey: 'fg3a',
    min: 2,
    max: 16,
    step: 1,
    defaultThreshold: 7,
    defaultOperator: 'gte',
    unit: ' 3PA',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#38BDF8',
    dotClass: 'bg-sky-400',
    textClass: 'text-sky-400',
    getValue: (g) => g.fg3a,
  },
  {
    id: 'fgm',
    group: 'shooting_vol',
    shortLabel: 'TCM',
    label: 'TCM · Tiros de campo anotados',
    helpKey: 'fgmMade',
    min: 3,
    max: 18,
    step: 1,
    defaultThreshold: 8,
    defaultOperator: 'gte',
    unit: ' TCM',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#F472B6',
    dotClass: 'bg-pink-400',
    textClass: 'text-pink-300',
    getValue: (g) => g.fgm,
  },
  {
    id: 'fga',
    group: 'shooting_vol',
    shortLabel: 'TCI',
    label: 'TCI · Tiros de campo intentados',
    helpKey: 'fga',
    min: 6,
    max: 30,
    step: 1,
    defaultThreshold: 16,
    defaultOperator: 'gte',
    unit: ' TCI',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#F97316',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-400',
    getValue: (g) => g.fga,
  },
  {
    id: 'fg2m',
    group: 'shooting_vol',
    shortLabel: 'T2M',
    label: 'T2M · Tiros de 2 puntos anotados',
    helpKey: 'fg2m',
    min: 2,
    max: 15,
    step: 1,
    defaultThreshold: 6,
    defaultOperator: 'gte',
    unit: ' T2M',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#A78BFA',
    dotClass: 'bg-violet-400',
    textClass: 'text-violet-300',
    getValue: (g) => Math.max(0, g.fgm - g.fg3m),
  },
  {
    id: 'fg2a',
    group: 'shooting_vol',
    shortLabel: 'T2I',
    label: 'T2I · Tiros de 2 puntos intentados',
    helpKey: 'fg2a',
    min: 4,
    max: 24,
    step: 1,
    defaultThreshold: 10,
    defaultOperator: 'gte',
    unit: ' T2I',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#818CF8',
    dotClass: 'bg-indigo-400',
    textClass: 'text-indigo-300',
    getValue: (g) => Math.max(0, g.fga - g.fg3a),
  },
  {
    id: 'ftm',
    group: 'shooting_vol',
    shortLabel: 'TLM',
    label: 'TLM · Tiros libres anotados',
    helpKey: 'ftmMade',
    min: 2,
    max: 16,
    step: 1,
    defaultThreshold: 6,
    defaultOperator: 'gte',
    unit: ' TLM',
    decimals: 1,
    gameDecimals: 0,
    isSmallCount: true,
    strokeHex: '#FBBF24',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
    getValue: (g) => g.ftm,
  },
  {
    id: 'fta',
    group: 'shooting_vol',
    shortLabel: 'TLI',
    label: 'TLI · Tiros libres intentados',
    helpKey: 'fta',
    min: 2,
    max: 18,
    step: 1,
    defaultThreshold: 7,
    defaultOperator: 'gte',
    unit: ' TLI',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#FACC15',
    dotClass: 'bg-yellow-400',
    textClass: 'text-yellow-300',
    getValue: (g) => g.fta,
  },
  {
    id: 'tsa',
    group: 'shooting_vol',
    shortLabel: 'TSA',
    label: 'TSA · Posesiones de tiro lanzadas (FGA + 0.44×FTA)',
    helpKey: 'tsaVolume',
    min: 8,
    max: 34,
    step: 1,
    defaultThreshold: 18,
    defaultOperator: 'gte',
    unit: ' TSA',
    decimals: 1,
    gameDecimals: 1,
    strokeHex: '#E879F9',
    dotClass: 'bg-fuchsia-400',
    textClass: 'text-fuchsia-300',
    getValue: (g) => g.fga + 0.44 * g.fta,
  },

  // 3. Combinadas e hitos (6)
  {
    id: 'pra',
    group: 'combos_milestones',
    shortLabel: 'PRA',
    label: 'PRA · Puntos + Rebotes + Asistencias',
    helpKey: 'pra',
    min: 15,
    max: 65,
    step: 1,
    defaultThreshold: 32,
    defaultOperator: 'gte',
    unit: ' PRA',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#F97316',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-400',
    getValue: (g) => g.pra,
  },
  {
    id: 'ptsReb',
    group: 'combos_milestones',
    shortLabel: 'PTS+REB',
    label: 'PTS+REB · Puntos + Rebotes',
    helpKey: 'prCombo',
    min: 12,
    max: 55,
    step: 1,
    defaultThreshold: 26,
    defaultOperator: 'gte',
    unit: ' P+R',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#38BDF8',
    dotClass: 'bg-sky-400',
    textClass: 'text-sky-400',
    getValue: (g) => g.points + g.rebounds,
  },
  {
    id: 'ptsAst',
    group: 'combos_milestones',
    shortLabel: 'PTS+AST',
    label: 'PTS+AST · Puntos + Asistencias',
    helpKey: 'paCombo',
    min: 12,
    max: 55,
    step: 1,
    defaultThreshold: 26,
    defaultOperator: 'gte',
    unit: ' P+A',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#A78BFA',
    dotClass: 'bg-violet-400',
    textClass: 'text-violet-300',
    getValue: (g) => g.points + g.assists,
  },
  {
    id: 'rebAst',
    group: 'combos_milestones',
    shortLabel: 'REB+AST',
    label: 'REB+AST · Rebotes + Asistencias',
    helpKey: 'raCombo',
    min: 6,
    max: 28,
    step: 1,
    defaultThreshold: 12,
    defaultOperator: 'gte',
    unit: ' R+A',
    decimals: 1,
    gameDecimals: 0,
    strokeHex: '#22D3EE',
    dotClass: 'bg-cyan-400',
    textClass: 'text-cyan-300',
    getValue: (g) => g.rebounds + g.assists,
  },
  {
    id: 'doubleDouble',
    group: 'combos_milestones',
    shortLabel: 'DD2',
    label: 'DD2 · Doble-Doble logrado en el partido',
    helpKey: 'doubleDoubles',
    min: 1,
    max: 1,
    step: 1,
    defaultThreshold: 1,
    defaultOperator: 'gte',
    unit: ' DD2',
    decimals: 2,
    gameDecimals: 0,
    isSmallCount: true,
    qualificationNote: '1 = logró Doble-Doble (≥10 en 2 categorías), 0 = no',
    strokeHex: '#FBBF24',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
    getValue: (g) => (countDoubleDigitStats(g) >= 2 ? 1 : 0),
  },
  {
    id: 'tripleDouble',
    group: 'combos_milestones',
    shortLabel: 'TD3',
    label: 'TD3 · Triple-Doble logrado en el partido',
    helpKey: 'tripleDoubles',
    min: 1,
    max: 1,
    step: 1,
    defaultThreshold: 1,
    defaultOperator: 'gte',
    unit: ' TD3',
    decimals: 2,
    gameDecimals: 0,
    isSmallCount: true,
    qualificationNote: '1 = logró Triple-Doble (≥10 en 3 categorías), 0 = no',
    strokeHex: '#E879F9',
    dotClass: 'bg-fuchsia-400',
    textClass: 'text-fuchsia-300',
    getValue: (g) => (countDoubleDigitStats(g) >= 3 ? 1 : 0),
  },

  // 4. Porcentajes y eficiencia de tiro (9)
  {
    id: 'tsPct',
    group: 'shooting_eff',
    shortLabel: 'TS%',
    label: 'TS% · Acierto Real (True Shooting %)',
    helpKey: 'tsPct',
    min: 40,
    max: 80,
    step: 1,
    defaultThreshold: 60,
    defaultOperator: 'gt',
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote: 'Exige ≥5 tiros de campo o ≥4 libres en el partido',
    qualifies: (g) => g.fga >= 5 || g.fta >= 4,
    strokeHex: '#38BDF8',
    dotClass: 'bg-sky-400',
    textClass: 'text-sky-400',
    getValue: (g) => g.tsPct,
  },
  {
    id: 'efgPct',
    group: 'shooting_eff',
    shortLabel: 'eFG%',
    label: 'eFG% · Tiro de Campo Efectivo',
    helpKey: 'efgPct',
    min: 35,
    max: 80,
    step: 1,
    defaultThreshold: 58,
    defaultOperator: 'gt',
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
    strokeHex: '#A78BFA',
    dotClass: 'bg-violet-400',
    textClass: 'text-violet-300',
    getValue: (g) => g.efgPct,
  },
  {
    id: 'fgPct',
    group: 'shooting_eff',
    shortLabel: 'TC%',
    label: 'TC% · % Tiros de Campo',
    helpKey: 'fgPct',
    min: 30,
    max: 75,
    step: 1,
    defaultThreshold: 50,
    defaultOperator: 'gte',
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
    strokeHex: '#60A5FA',
    dotClass: 'bg-blue-400',
    textClass: 'text-blue-300',
    getValue: (g) => g.fgPct,
  },
  {
    id: 'fg2Pct',
    group: 'shooting_eff',
    shortLabel: 'T2%',
    label: 'T2% · % Acierto en Tiros de 2 puntos',
    helpKey: 'fg2Pct',
    min: 35,
    max: 80,
    step: 1,
    defaultThreshold: 58,
    defaultOperator: 'gte',
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote: 'Exige ≥4 tiros de 2 intentados en el partido',
    qualifies: (g) => g.fga - g.fg3a >= 4,
    strokeHex: '#818CF8',
    dotClass: 'bg-indigo-400',
    textClass: 'text-indigo-300',
    getValue: (g) => {
      const fg2a = g.fga - g.fg3a;
      return fg2a > 0 ? ((g.fgm - g.fg3m) / fg2a) * 100 : 0;
    },
  },
  {
    id: 'fg3Pct',
    group: 'shooting_eff',
    shortLabel: '3P%',
    label: '3P% · % Acierto en Triples',
    helpKey: 'fg3Pct',
    min: 20,
    max: 70,
    step: 1,
    defaultThreshold: 40,
    defaultOperator: 'gte',
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote: 'Exige ≥3 triples intentados en el partido',
    qualifies: (g) => g.fg3a >= 3,
    strokeHex: '#F97316',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-400',
    getValue: (g) => g.fg3Pct,
  },
  {
    id: 'ftPct',
    group: 'shooting_eff',
    shortLabel: 'TL%',
    label: 'TL% · % Tiros Libres',
    helpKey: 'ftPct',
    min: 50,
    max: 100,
    step: 1,
    defaultThreshold: 85,
    defaultOperator: 'gte',
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote: 'Exige ≥2 tiros libres intentados en el partido',
    qualifies: (g) => g.fta >= 2,
    strokeHex: '#E879F9',
    dotClass: 'bg-fuchsia-400',
    textClass: 'text-fuchsia-300',
    getValue: (g) => g.ftPct,
  },
  {
    id: 'ptsPerShot',
    group: 'shooting_eff',
    shortLabel: 'PTS/TCI',
    label: 'PTS/TCI · Puntos por Tiro de Campo Intentado',
    helpKey: 'ptsPerShot',
    min: 0.9,
    max: 1.9,
    step: 0.05,
    defaultThreshold: 1.35,
    defaultOperator: 'gte',
    unit: '',
    decimals: 2,
    gameDecimals: 2,
    isSmallCount: true,
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
    strokeHex: '#FBBF24',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
    getValue: (g) => (g.fga > 0 ? g.points / g.fga : 0),
  },
  {
    id: 'threeRate',
    group: 'shooting_eff',
    shortLabel: '3PAr',
    label: '3PAr · % Volumen de Triples (3PA / FGA)',
    helpKey: 'threeRatio',
    min: 15,
    max: 85,
    step: 1,
    defaultThreshold: 50,
    defaultOperator: 'gte',
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
    strokeHex: '#22D3EE',
    dotClass: 'bg-cyan-400',
    textClass: 'text-cyan-300',
    getValue: (g) => (g.fga > 0 ? (g.fg3a / g.fga) * 100 : 0),
  },
  {
    id: 'ftRate',
    group: 'shooting_eff',
    shortLabel: 'FTr',
    label: 'FTr · Ratio de Tiros Libres (FTA / FGA)',
    helpKey: 'ftr',
    min: 10,
    max: 80,
    step: 1,
    defaultThreshold: 35,
    defaultOperator: 'gte',
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
    strokeHex: '#FACC15',
    dotClass: 'bg-yellow-400',
    textClass: 'text-yellow-300',
    getValue: (g) => (g.fga > 0 ? (g.fta / g.fga) * 100 : 0),
  },

  // 5. Ratios de creación, ritmo por 36m y valoración (13)
  {
    id: 'astTo',
    group: 'ratios_per36',
    shortLabel: 'AST/PER',
    label: 'AST/PER · Asistencias/Pérdidas (Ratio creación/seguridad)',
    helpKey: 'astTo',
    min: 0.5,
    max: 10,
    step: 0.5,
    defaultThreshold: 3,
    defaultOperator: 'gte',
    unit: 'x',
    decimals: 2,
    gameDecimals: 1,
    isSmallCount: true,
    qualificationNote: 'Si tiene 0 pérdidas toma el total de asistencias',
    qualifies: (g) => g.assists > 0 || g.turnovers > 0,
    strokeHex: '#22D3EE',
    dotClass: 'bg-cyan-400',
    textClass: 'text-cyan-300',
    getValue: (g) => (g.turnovers === 0 ? g.assists : g.assists / g.turnovers),
  },
  {
    id: 'tovPctEst',
    group: 'ratios_per36',
    shortLabel: 'TOV%',
    label: 'TOV% · % Pérdidas sobre posesiones jugadas',
    helpKey: 'tovRatioEst',
    min: 3,
    max: 30,
    step: 1,
    defaultThreshold: 10,
    defaultOperator: 'lte',
    lowerIsBetter: true,
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote:
      'Exige ≥6 posesiones usadas (usa ≤ para seguridad o ≥ para exceso)',
    qualifies: (g) => g.fga + 0.44 * g.fta + g.turnovers >= 6,
    strokeHex: '#FBBF24',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
    getValue: (g) => {
      const denom = g.fga + 0.44 * g.fta + g.turnovers;
      return denom > 0 ? (g.turnovers / denom) * 100 : 0;
    },
  },
  {
    id: 'astRatioEst',
    group: 'ratios_per36',
    shortLabel: 'AST Ratio',
    label: 'AST Ratio · % Posesiones que acaban en asistencia',
    helpKey: 'astRatio',
    min: 8,
    max: 50,
    step: 1,
    defaultThreshold: 25,
    defaultOperator: 'gte',
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    strokeHex: '#38BDF8',
    dotClass: 'bg-sky-400',
    textClass: 'text-sky-400',
    getValue: (g) => {
      const denom = g.fga + 0.44 * g.fta + g.assists + g.turnovers;
      return denom > 0 ? (g.assists / denom) * 100 : 0;
    },
  },
  {
    id: 'gameScore',
    group: 'ratios_per36',
    shortLabel: 'GmSc',
    label: 'GmSc · Valoración Game Score (Hollinger)',
    helpKey: 'gmSc',
    min: 5,
    max: 42,
    step: 1,
    defaultThreshold: 20,
    defaultOperator: 'gte',
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    allowNegative: true,
    strokeHex: '#A78BFA',
    dotClass: 'bg-violet-400',
    textClass: 'text-violet-300',
    getValue: (g) => g.gameScore,
  },
  {
    id: 'usgEst',
    group: 'ratios_per36',
    shortLabel: 'USG%',
    label: 'USG% · Ratio de Uso Ofensivo',
    helpKey: 'usgPct',
    min: 12,
    max: 44,
    step: 1,
    defaultThreshold: 28,
    defaultOperator: 'gte',
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    isPercentage: true,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    strokeHex: '#F97316',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-400',
    getValue: (g) => g.usgEst,
  },
  {
    id: 'ptsPerMin',
    group: 'ratios_per36',
    shortLabel: 'PTS/MIN',
    label: 'PTS/MIN · Ratio Puntos por Minuto',
    helpKey: 'ptsPerMin',
    min: 0.35,
    max: 1.4,
    step: 0.05,
    defaultThreshold: 0.75,
    defaultOperator: 'gte',
    unit: '',
    decimals: 2,
    gameDecimals: 2,
    isSmallCount: true,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    strokeHex: '#E879F9',
    dotClass: 'bg-fuchsia-400',
    textClass: 'text-fuchsia-300',
    getValue: (g) => (g.minutes > 0 ? g.points / g.minutes : 0),
  },
  {
    id: 'ptsPer36',
    group: 'ratios_per36',
    shortLabel: 'PTS/36',
    label: 'PTS/36 · Puntos por 36 minutos',
    helpKey: 'ptsPer36',
    min: 12,
    max: 44,
    step: 1,
    defaultThreshold: 26,
    defaultOperator: 'gte',
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    strokeHex: '#FB923C',
    dotClass: 'bg-orange-400',
    textClass: 'text-orange-300',
    getValue: (g) => (g.minutes > 0 ? (g.points / g.minutes) * 36 : 0),
  },
  {
    id: 'rebPer36',
    group: 'ratios_per36',
    shortLabel: 'REB/36',
    label: 'REB/36 · Rebotes totales por 36 minutos',
    helpKey: 'rebPer36',
    min: 4,
    max: 22,
    step: 0.5,
    defaultThreshold: 11,
    defaultOperator: 'gte',
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    strokeHex: '#60A5FA',
    dotClass: 'bg-blue-400',
    textClass: 'text-blue-300',
    getValue: (g) => (g.minutes > 0 ? (g.rebounds / g.minutes) * 36 : 0),
  },
  {
    id: 'drebPer36',
    group: 'ratios_per36',
    shortLabel: 'DR/36',
    label: 'DR/36 · Rebotes defensivos por 36 minutos',
    helpKey: 'drebPer36',
    min: 3,
    max: 16,
    step: 0.5,
    defaultThreshold: 8.5,
    defaultOperator: 'gte',
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    strokeHex: '#818CF8',
    dotClass: 'bg-indigo-400',
    textClass: 'text-indigo-300',
    getValue: (g) => (g.minutes > 0 ? (g.dreb / g.minutes) * 36 : 0),
  },
  {
    id: 'orebPer36',
    group: 'ratios_per36',
    shortLabel: 'OR/36',
    label: 'OR/36 · Rebotes ofensivos por 36 minutos',
    helpKey: 'orebPer36',
    min: 1,
    max: 10,
    step: 0.5,
    defaultThreshold: 3.5,
    defaultOperator: 'gte',
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    isSmallCount: true,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    strokeHex: '#FACC15',
    dotClass: 'bg-yellow-400',
    textClass: 'text-yellow-300',
    getValue: (g) => (g.minutes > 0 ? (g.oreb / g.minutes) * 36 : 0),
  },
  {
    id: 'astPer36',
    group: 'ratios_per36',
    shortLabel: 'AST/36',
    label: 'AST/36 · Asistencias por 36 minutos',
    helpKey: 'astPer36',
    min: 3,
    max: 16,
    step: 0.5,
    defaultThreshold: 8,
    defaultOperator: 'gte',
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    strokeHex: '#C084FC',
    dotClass: 'bg-purple-400',
    textClass: 'text-purple-300',
    getValue: (g) => (g.minutes > 0 ? (g.assists / g.minutes) * 36 : 0),
  },
  {
    id: 'stocksPer36',
    group: 'ratios_per36',
    shortLabel: 'STK/36',
    label: 'STK/36 · Robos + Tapones por 36 minutos',
    helpKey: 'stocksPer36',
    min: 1,
    max: 8,
    step: 0.5,
    defaultThreshold: 3,
    defaultOperator: 'gte',
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    isSmallCount: true,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    strokeHex: '#2DD4BF',
    dotClass: 'bg-teal-400',
    textClass: 'text-teal-300',
    getValue: (g) => (g.minutes > 0 ? (g.stocks / g.minutes) * 36 : 0),
  },
  {
    id: 'praPer36',
    group: 'ratios_per36',
    shortLabel: 'PRA/36',
    label: 'PRA/36 · Puntos + Rebotes + Asistencias por 36m',
    helpKey: 'praPer36',
    min: 20,
    max: 65,
    step: 1,
    defaultThreshold: 38,
    defaultOperator: 'gte',
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    strokeHex: '#F472B6',
    dotClass: 'bg-pink-400',
    textClass: 'text-pink-300',
    getValue: (g) => (g.minutes > 0 ? (g.pra / g.minutes) * 36 : 0),
  },
];

export function resolveAutoStreakPreload(
  st: StreakEntry
): StreakChartPreloadMetricRule {
  if (st.id.endsWith('-pts40')) {
    return { metricId: 'points', operator: 'gte', threshold: 40, isPositive: true };
  }
  if (st.id.endsWith('-pts35')) {
    return { metricId: 'points', operator: 'gte', threshold: 35, isPositive: true };
  }
  if (st.id.endsWith('-pts30')) {
    return { metricId: 'points', operator: 'gte', threshold: 30, isPositive: true };
  }
  if (st.id.endsWith('-pts25')) {
    return { metricId: 'points', operator: 'gte', threshold: 25, isPositive: true };
  }
  if (st.id.endsWith('-pts20')) {
    return { metricId: 'points', operator: 'gte', threshold: 20, isPositive: true };
  }
  if (st.id.endsWith('-pts15')) {
    return { metricId: 'points', operator: 'gte', threshold: 15, isPositive: true };
  }
  if (st.id.endsWith('-reb10')) {
    return { metricId: 'rebounds', operator: 'gte', threshold: 10, isPositive: true };
  }
  if (st.id.endsWith('-ast8')) {
    return { metricId: 'assists', operator: 'gte', threshold: 8, isPositive: true };
  }
  if (st.id.endsWith('-3pm6')) {
    return { metricId: 'fg3m', operator: 'gte', threshold: 6, isPositive: true };
  }
  if (st.id.endsWith('-3pm5')) {
    return { metricId: 'fg3m', operator: 'gte', threshold: 5, isPositive: true };
  }
  if (st.id.endsWith('-3pm4')) {
    return { metricId: 'fg3m', operator: 'gte', threshold: 4, isPositive: true };
  }
  if (st.id.endsWith('-3pm3')) {
    return { metricId: 'fg3m', operator: 'gte', threshold: 3, isPositive: true };
  }
  if (st.id.endsWith('-3pm2')) {
    return { metricId: 'fg3m', operator: 'gte', threshold: 2, isPositive: true };
  }
  if (st.id.endsWith('-3pm1')) {
    return { metricId: 'fg3m', operator: 'gte', threshold: 1, isPositive: true };
  }
  if (st.id.endsWith('-pts_reb27')) {
    return { metricId: 'ptsReb', operator: 'gte', threshold: 27, isPositive: true };
  }
  if (st.id.endsWith('-pts_reb25')) {
    return { metricId: 'ptsReb', operator: 'gte', threshold: 25, isPositive: true };
  }
  if (st.id.endsWith('-pts_reb20')) {
    return { metricId: 'ptsReb', operator: 'gte', threshold: 20, isPositive: true };
  }
  if (st.id.endsWith('-pts_ast24')) {
    return { metricId: 'ptsAst', operator: 'gte', threshold: 24, isPositive: true };
  }
  if (st.id.endsWith('-pts_ast20')) {
    return { metricId: 'ptsAst', operator: 'gte', threshold: 20, isPositive: true };
  }
  if (st.id.endsWith('-pts_ast15')) {
    return { metricId: 'ptsAst', operator: 'gte', threshold: 15, isPositive: true };
  }
  if (st.id.endsWith('-pra35')) {
    return { metricId: 'pra', operator: 'gte', threshold: 35, isPositive: true };
  }
  if (st.id.endsWith('-pra30')) {
    return { metricId: 'pra', operator: 'gte', threshold: 30, isPositive: true };
  }
  if (st.id.endsWith('-pra25')) {
    return { metricId: 'pra', operator: 'gte', threshold: 25, isPositive: true };
  }
  if (st.id.endsWith('-hot_3pct')) {
    return {
      metricId: 'fg3Pct',
      operator: 'gte',
      threshold: 42,
      isPositive: true,
      customQualifies: (g) => g.fg3a >= 5,
      customQualifiesLabel: '≥5 3PA',
    };
  }
  if (st.id.endsWith('-slump_sub10')) {
    return {
      metricId: 'points',
      operator: 'lte',
      threshold: 10,
      isPositive: false,
      customQualifies: (g) => g.minutes >= 24,
      customQualifiesLabel: '≥24 MIN',
    };
  }
  if (st.id.endsWith('-slump_sub12')) {
    return {
      metricId: 'points',
      operator: 'lte',
      threshold: 12,
      isPositive: false,
      customQualifies: (g) => g.minutes >= 26,
      customQualifiesLabel: '≥26 MIN',
    };
  }
  if (st.id.endsWith('-cold_3pm_zero')) {
    return {
      metricId: 'fg3m',
      operator: 'lte',
      threshold: 0,
      isPositive: false,
      customQualifies: (g) => g.fg3a >= 3,
      customQualifiesLabel: '≥3 3PA',
    };
  }
  if (st.id.endsWith('-cold_3pct')) {
    return {
      metricId: 'fg3Pct',
      operator: 'lt',
      threshold: 25,
      isPositive: false,
      customQualifies: (g) => g.fg3a >= 4,
      customQualifiesLabel: '≥4 3PA',
    };
  }
  if (st.id.endsWith('-min35')) {
    return { metricId: 'minutes', operator: 'gte', threshold: 35, isPositive: true };
  }
  if (st.id.endsWith('-usg30') || st.id.endsWith('-usg29')) {
    return {
      metricId: 'usgEst',
      operator: 'gte',
      threshold: 30,
      isPositive: true,
      customQualifies: (g) => g.minutes >= 25,
      customQualifiesLabel: '≥25 MIN',
    };
  }
  if (st.id.endsWith('-hot_ts')) {
    return {
      metricId: 'tsPct',
      operator: 'gte',
      threshold: 64,
      isPositive: true,
      customQualifies: (g) => g.fga >= 10,
      customQualifiesLabel: '≥10 TCI',
    };
  }
  if (st.id.endsWith('-gmsc22')) {
    return { metricId: 'gameScore', operator: 'gte', threshold: 22, isPositive: true };
  }
  if (st.id.endsWith('-cold_ts')) {
    return {
      metricId: 'tsPct',
      operator: 'lt',
      threshold: 46,
      isPositive: false,
      customQualifies: (g) => g.fga >= 10,
      customQualifiesLabel: '≥10 TCI',
    };
  }
  if (st.id.endsWith('-cold_ft')) {
    return {
      metricId: 'ftPct',
      operator: 'lt',
      threshold: 50,
      isPositive: false,
      customQualifies: (g) => g.fta >= 4,
      customQualifiesLabel: '≥4 TLI',
    };
  }
  if (st.id.endsWith('-to4')) {
    return { metricId: 'turnovers', operator: 'gte', threshold: 4, isPositive: false };
  }
  if (st.id.endsWith('-to3')) {
    return { metricId: 'turnovers', operator: 'gte', threshold: 3, isPositive: false };
  }
  if (st.id.endsWith('-cold_fg')) {
    return {
      metricId: 'fgPct',
      operator: 'lt',
      threshold: 38,
      isPositive: false,
      customQualifies: (g) => g.fga >= 8,
      customQualifiesLabel: '≥8 TCI',
    };
  }
  if (st.id.endsWith('-foul_trouble_4')) {
    return {
      metricId: 'fouls',
      operator: 'gte',
      threshold: 4,
      isPositive: false,
      customQualifies: (g) => g.minutes >= 16,
      customQualifiesLabel: '≥16 MIN',
    };
  }
  if (st.id.endsWith('-foul_trouble') || st.id.endsWith('-foul_trouble_3')) {
    return {
      metricId: 'fouls',
      operator: 'gte',
      threshold: 3,
      isPositive: false,
      customQualifies: (g) => g.minutes >= 18,
      customQualifiesLabel: '≥18 MIN',
    };
  }
  if (st.id.endsWith('-neg_pm10')) {
    return {
      metricId: 'plusMinus',
      operator: 'lte',
      threshold: -10,
      isPositive: false,
      customQualifies: (g) => g.minutes >= 20,
      customQualifiesLabel: '≥20 MIN',
    };
  }
  if (st.id.endsWith('-neg_pm') || st.id.endsWith('-neg_pm8')) {
    return {
      metricId: 'plusMinus',
      operator: 'lte',
      threshold: -8,
      isPositive: false,
      customQualifies: (g) => g.minutes >= 20,
      customQualifiesLabel: '≥20 MIN',
    };
  }

  return {
    metricId: 'points',
    operator: 'gte',
    threshold: 20,
    isPositive: st.isPositive,
  };
}
