import { useMemo, useState } from 'react';
import {
  ChevronDown,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import type {
  ConsistencyEntry,
  ExperienceMode,
  PlayerGameLog,
  PlayerSummary,
  StreakEntry,
} from '../types/nba';
import { formatShortDate, mean, normalizeSearchText } from '../utils/analytics';
import { ColumnHelpHeader, MetricInfoTooltip } from './MetricUiHelpers';
import { EntityBadge, PlayerAvatar } from './NbaVisuals';
import { PlayerStreakHistoryChart } from './PlayerStreakHistoryChart';

interface StreaksConsistencyViewProps {
  players: PlayerSummary[];
  streaks: StreakEntry[];
  consistencyRows: ConsistencyEntry[];
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  minStreakGames: number;
  allPlayersLoaded?: boolean;
  loadingAllPlayers?: boolean;
  totalLeaguePlayersAvailable?: number;
  onLoadAllPlayers?: () => void;
}

type SubTab = 'streaks' | 'consistency' | 'history';
type StreakEvalMode = 'custom' | 'auto';
type StreakSpanMode = 'active' | 'best';
type ThresholdOperator = 'gt' | 'gte' | 'lte' | 'lt';
type CustomStreakSort = 'count' | 'streakAvg' | 'seasonAvg';
type ConsistencySort =
  | 'consistencyScore'
  | 'ptsAvg'
  | 'ptsStdDev'
  | 'hitRate20Pts';

type StreakMetricGroup =
  | 'basic_counting'
  | 'shooting_vol'
  | 'combos_milestones'
  | 'shooting_eff'
  | 'ratios_per36';

interface StreakMetricOption {
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
}

const STREAK_METRIC_GROUPS: Array<{
  id: StreakMetricGroup;
  label: string;
  shortType: string;
}> = [
  {
    id: 'basic_counting',
    label: '1. Estadísticas básicas por partido',
    shortType: 'Acumulado',
  },
  {
    id: 'shooting_vol',
    label: '2. Volumen de tiro y conversión',
    shortType: 'Volumen',
  },
  {
    id: 'combos_milestones',
    label: '3. Combinadas e hitos (PRA, DD2, TD3)',
    shortType: 'Combinada',
  },
  {
    id: 'shooting_eff',
    label: '4. Porcentajes y eficiencia de tiro',
    shortType: 'Eficiencia %',
  },
  {
    id: 'ratios_per36',
    label: '5. Ratios de creación, ritmo /36m y valoración',
    shortType: 'Ratio',
  },
];

function countDoubleDigitStats(g: PlayerGameLog): number {
  let hits = 0;
  if (g.points >= 10) hits += 1;
  if (g.rebounds >= 10) hits += 1;
  if (g.assists >= 10) hits += 1;
  if (g.steals >= 10) hits += 1;
  if (g.blocks >= 10) hits += 1;
  return hits;
}

function evalThresholdOp(
  val: number,
  op: ThresholdOperator,
  target: number
): boolean {
  if (op === 'gt') return val > target;
  if (op === 'gte') return val >= target;
  if (op === 'lte') return val <= target;
  return val < target;
}

function getOperatorSymbol(op: ThresholdOperator): string {
  if (op === 'gt') return '>';
  if (op === 'gte') return '≥';
  if (op === 'lte') return '≤';
  return '<';
}

const STREAK_METRIC_OPTIONS: StreakMetricOption[] = [
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
    qualificationNote:
      'Exige ≥15 MIN (usa ≤ para seguridad o ≥ para exceso de pérdidas)',
    qualifies: (g) => g.minutes >= 15,
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
    qualificationNote:
      'Exige ≥15 MIN (usa ≤ para disciplina o ≥ para problemas de faltas)',
    qualifies: (g) => g.minutes >= 15,
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
    qualificationNote: '1 = logró Doble-Doble (≥10 en 2 categorías), 0 = no',
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
    qualificationNote: '1 = logró Triple-Doble (≥10 en 3 categorías), 0 = no',
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
    qualificationNote: 'Exige ≥5 tiros de campo o ≥4 libres en el partido',
    qualifies: (g) => g.fga >= 5 || g.fta >= 4,
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
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
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
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
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
    qualificationNote: 'Exige ≥4 tiros de 2 intentados en el partido',
    qualifies: (g) => g.fga - g.fg3a >= 4,
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
    qualificationNote: 'Exige ≥3 triples intentados en el partido',
    qualifies: (g) => g.fg3a >= 3,
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
    qualificationNote: 'Exige ≥2 tiros libres intentados en el partido',
    qualifies: (g) => g.fta >= 2,
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
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
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
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
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
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
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
    qualificationNote: 'Si tiene 0 pérdidas toma el total de asistencias',
    qualifies: (g) => g.assists > 0 || g.turnovers > 0,
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
    qualificationNote:
      'Exige ≥6 posesiones usadas (usa ≤ para seguridad o ≥ para exceso)',
    qualifies: (g) => g.fga + 0.44 * g.fta + g.turnovers >= 6,
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
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
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
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
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
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
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
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
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
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
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
    getValue: (g) => (g.minutes > 0 ? (g.pra / g.minutes) * 36 : 0),
  },
];

const QUICK_RATIO_CHIPS = [
  'points',
  'rebounds',
  'dreb',
  'assists',
  'fg3m',
  'turnovers',
  'astTo',
  'pra',
  'tsPct',
  'fg3Pct',
  'stocks',
  'gameScore',
];

function formatMetricNumber(
  val: number,
  decimals: number,
  unit: string,
  includeUnit = true
): string {
  const numStr = val.toFixed(decimals);
  return includeUnit ? `${numStr}${unit}` : numStr;
}

function resolveAutoStreakHelpKey(st: StreakEntry): string {
  const lbl = `${st.metricLabel} ${st.thresholdLabel}`.toLowerCase();
  if (lbl.includes('ts')) return 'tsPct';
  if (lbl.includes('gmsc') || lbl.includes('game score')) return 'gmSc';
  if (lbl.includes('net rating')) return 'netRtg';
  if (lbl.includes('puntos') || lbl.includes('pts')) return 'ptsBase';
  if (lbl.includes('rebotes') || lbl.includes('reb')) return 'rebBase';
  if (lbl.includes('asistencias') || lbl.includes('ast')) return 'astBase';
  if (lbl.includes('triples') || lbl.includes('3pm')) return 'fg3m';
  if (lbl.includes('victorias') || lbl.includes('derrotas')) return 'streakCurrent';
  return 'consecutiveStreak';
}

function humanThresholdLabel(st: StreakEntry, mode: ExperienceMode): string {
  if (mode === 'advanced') return st.thresholdLabel;
  if (st.thresholdLabel.includes('TS')) {
    return 'Mala puntería seguida (<46% acierto)';
  }
  if (st.thresholdLabel.includes('GmSc')) {
    return 'Partidazos seguidos (valoración élite)';
  }
  return st.thresholdLabel;
}

interface CustomEvaluatedRow {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  position: string;
  gamesPlayed: number;
  count: number;
  streakAvg: number;
  seasonAvg: number;
  recentSequence: number[];
  lastGameVal: number;
  lastGameDate: string;
  lastOpponent: string;
  lastIsHome: boolean;
}

export function StreaksConsistencyView({
  players,
  streaks,
  consistencyRows,
  experienceMode,
  watchlistIds,
  onlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  minStreakGames,
  allPlayersLoaded = false,
  loadingAllPlayers = false,
  totalLeaguePlayersAvailable = 0,
  onLoadAllPlayers,
}: StreaksConsistencyViewProps) {
  const [subTab, setSubTab] = useState<SubTab>('streaks');
  const [streakEvalMode, setStreakEvalMode] =
    useState<StreakEvalMode>('custom');
  const [streakSpanMode, setStreakSpanMode] = useState<StreakSpanMode>('active');
  const [useSecondaryCondition, setUseSecondaryCondition] = useState<boolean>(false);
  const [secondaryMetricId, setSecondaryMetricId] = useState<string>('points');
  const [secondaryOperator, setSecondaryOperator] = useState<ThresholdOperator>('gt');
  const [secondaryThresholdValue, setSecondaryThresholdValue] = useState<number>(20);

  const [selectedMetricId, setSelectedMetricId] = useState<string>('tsPct');
  const [operator, setOperator] = useState<ThresholdOperator>('gt');
  const [thresholdValue, setThresholdValue] = useState<number>(60);
  const [minConsecutive, setMinConsecutive] = useState<number>(() =>
    Math.max(1, Math.min(15, minStreakGames))
  );
  const [customSort, setCustomSort] = useState<CustomStreakSort>('count');
  const [customAsc, setCustomAsc] = useState<boolean>(false);

  const [streakFilter, setStreakFilter] = useState<'all' | 'player' | 'team'>(
    'all'
  );
  const [query, setQuery] = useState('');
  const [consSort, setConsSort] = useState<ConsistencySort>('consistencyScore');
  const [consAsc, setConsAsc] = useState(false);
  const [customScrollTop, setCustomScrollTop] = useState<number>(0);
  const [mobileCustomScrollTop, setMobileCustomScrollTop] = useState<number>(0);
  const [mobileSlidersOpen, setMobileSlidersOpen] = useState<boolean>(true);
  const [historyPlayerId, setHistoryPlayerId] = useState<string | null>(null);
  const [showInlineHistoryChart, setShowInlineHistoryChart] =
    useState<boolean>(true);


  const activeMetric = useMemo(
    () =>
      STREAK_METRIC_OPTIONS.find((m) => m.id === selectedMetricId) ||
      STREAK_METRIC_OPTIONS[0],
    [selectedMetricId]
  );

  const secondaryMetric = useMemo(
    () =>
      STREAK_METRIC_OPTIONS.find((m) => m.id === secondaryMetricId) ||
      STREAK_METRIC_OPTIONS[0],
    [secondaryMetricId]
  );

  const handleSelectMetric = (metricId: string) => {
    const found = STREAK_METRIC_OPTIONS.find((m) => m.id === metricId);
    setSelectedMetricId(metricId);
    if (found) {
      setThresholdValue(found.defaultThreshold);
      if (found.defaultOperator) {
        setOperator(found.defaultOperator);
      }
    }
  };

  const handleSelectSecondaryMetric = (metricId: string) => {
    const found = STREAK_METRIC_OPTIONS.find((m) => m.id === metricId);
    setSecondaryMetricId(metricId);
    if (found) {
      setSecondaryThresholdValue(found.defaultThreshold);
      if (found.defaultOperator) {
        setSecondaryOperator(found.defaultOperator);
      }
    }
  };

  const checkGamePasses = (g: PlayerGameLog): boolean => {
    const pQualifies = activeMetric.qualifies ? activeMetric.qualifies(g) : true;
    if (!pQualifies) return false;
    const pVal = activeMetric.getValue(g);
    const pPasses = evalThresholdOp(pVal, operator, thresholdValue);
    if (!pPasses) return false;

    if (useSecondaryCondition) {
      const sQualifies = secondaryMetric.qualifies ? secondaryMetric.qualifies(g) : true;
      if (!sQualifies) return false;
      const sVal = secondaryMetric.getValue(g);
      const sPasses = evalThresholdOp(
        sVal,
        secondaryOperator,
        secondaryThresholdValue
      );
      if (!sPasses) return false;
    }

    return true;
  };

  // Real-time evaluation of consecutive games with active vs best historical span and parlay support
  const customEvaluatedRows = useMemo<CustomEvaluatedRow[]>(() => {
    const q = normalizeSearchText(query);
    const out: CustomEvaluatedRow[] = [];

    for (const player of players) {
      if (player.games.length === 0) continue;
      const wKey = `player:${player.id}`;
      if (onlyWatchlist && !watchlistIds.has(wKey)) continue;
      if (q) {
        const hay = normalizeSearchText(
          `${player.name} ${player.teamAbbr} ${player.teamName} ${player.position}`
        );
        if (!hay.includes(q)) continue;
      }

      let count = 0;
      const streakVals: number[] = [];

      if (streakSpanMode === 'active') {
        for (const g of player.games) {
          if (checkGamePasses(g)) {
            count += 1;
            streakVals.push(activeMetric.getValue(g));
          } else {
            break;
          }
        }
      } else {
        let bestSub: number[] = [];
        let currentSub: number[] = [];
        for (const g of player.games) {
          if (checkGamePasses(g)) {
            currentSub.push(activeMetric.getValue(g));
          } else {
            if (currentSub.length > bestSub.length) {
              bestSub = [...currentSub];
            }
            currentSub = [];
          }
        }
        if (currentSub.length > bestSub.length) {
          bestSub = [...currentSub];
        }
        count = bestSub.length;
        streakVals.push(...bestSub);
      }

      if (count < minConsecutive) continue;

      const qualifiedSeasonGames = activeMetric.qualifies
        ? player.games.filter(activeMetric.qualifies)
        : player.games;
      const seasonVals = (
        qualifiedSeasonGames.length > 0 ? qualifiedSeasonGames : player.games
      ).map((g) => activeMetric.getValue(g));

      const latest = player.games[0];
      out.push({
        playerId: player.id,
        playerName: player.name,
        teamAbbr: latest.teamAbbr || player.teamAbbr,
        position: player.position || '—',
        gamesPlayed: player.games.length,
        count,
        streakAvg: mean(streakVals),
        seasonAvg: mean(seasonVals),
        recentSequence: streakVals.slice(0, 6),
        lastGameVal: streakVals[0] ?? activeMetric.getValue(latest),
        lastGameDate: latest.date,
        lastOpponent: latest.opponentAbbr,
        lastIsHome: latest.isHome,
      });
    }

    out.sort((a, b) => {
      const diff = a[customSort] - b[customSort];
      if (diff !== 0) return customAsc ? diff : -diff;
      if (b.count !== a.count) return b.count - a.count;
      return b.streakAvg - a.streakAvg;
    });

    return out;
  }, [
    players,
    onlyWatchlist,
    watchlistIds,
    query,
    activeMetric,
    secondaryMetric,
    operator,
    thresholdValue,
    secondaryOperator,
    secondaryThresholdValue,
    useSecondaryCondition,
    streakSpanMode,
    minConsecutive,
    customSort,
    customAsc,
  ]);

  const CUSTOM_ROW_HEIGHT = 58;
  const VISIBLE_CONTAINER_HEIGHT = 600;
  const customStartIndex = Math.max(0, Math.floor(customScrollTop / CUSTOM_ROW_HEIGHT) - 5);
  const customVisibleCount = Math.ceil(VISIBLE_CONTAINER_HEIGHT / CUSTOM_ROW_HEIGHT) + 10;
  const customEndIndex = Math.min(customEvaluatedRows.length, customStartIndex + customVisibleCount);
  const customTopSpacerHeight = customStartIndex * CUSTOM_ROW_HEIGHT;
  const customBottomSpacerHeight = Math.max(0, (customEvaluatedRows.length - customEndIndex) * CUSTOM_ROW_HEIGHT);
  const customVisibleRows = useMemo(
    () => customEvaluatedRows.slice(customStartIndex, customEndIndex),
    [customEvaluatedRows, customStartIndex, customEndIndex]
  );

  const MOBILE_CUSTOM_HEIGHT = 122;
  const MOBILE_VISIBLE_HEIGHT = 540;
  const mobileCustomStart = Math.max(
    0,
    Math.floor(mobileCustomScrollTop / MOBILE_CUSTOM_HEIGHT) - 4
  );
  const mobileCustomCount =
    Math.ceil(MOBILE_VISIBLE_HEIGHT / MOBILE_CUSTOM_HEIGHT) + 8;
  const mobileCustomEnd = Math.min(
    customEvaluatedRows.length,
    mobileCustomStart + mobileCustomCount
  );
  const mobileCustomTopSpacer = mobileCustomStart * MOBILE_CUSTOM_HEIGHT;
  const mobileCustomBottomSpacer = Math.max(
    0,
    (customEvaluatedRows.length - mobileCustomEnd) * MOBILE_CUSTOM_HEIGHT
  );
  const mobileCustomVisibleRows = useMemo(
    () => customEvaluatedRows.slice(mobileCustomStart, mobileCustomEnd),
    [customEvaluatedRows, mobileCustomStart, mobileCustomEnd]
  );

  const filteredStreaks = useMemo(() => {
    const q = normalizeSearchText(query);
    return streaks.filter((s) => {
      const wKey = `${s.entityType}:${s.entityId}`;
      if (onlyWatchlist && !watchlistIds.has(wKey)) return false;
      if (streakFilter !== 'all' && s.entityType !== streakFilter) return false;
      if (q) {
        const hay = normalizeSearchText(
          `${s.entityName} ${s.teamAbbr} ${s.thresholdLabel} ${s.metricLabel}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [streaks, watchlistIds, onlyWatchlist, streakFilter, query]);

  const filteredConsistency = useMemo(() => {
    const q = normalizeSearchText(query);
    return consistencyRows
      .filter((r) => {
        const wKey = `player:${r.entityId}`;
        if (onlyWatchlist && !watchlistIds.has(wKey)) return false;
        if (q) {
          const hay = normalizeSearchText(
            `${r.entityName} ${r.teamAbbr} ${r.profileLabel}`
          );
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) =>
        consAsc ? a[consSort] - b[consSort] : b[consSort] - a[consSort]
      );
  }, [consistencyRows, watchlistIds, onlyWatchlist, query, consSort, consAsc]);

  const topCustomRow = customEvaluatedRows[0];
  const topStreak = streaks[0];
  const mostConsistent = consistencyRows[0];
  const mostVolatile =
    consistencyRows.length > 0
      ? consistencyRows[consistencyRows.length - 1]
      : undefined;

  const toggleCustomSort = (field: CustomStreakSort) => {
    if (customSort === field) {
      setCustomAsc((prev) => !prev);
    } else {
      setCustomSort(field);
      setCustomAsc(false);
    }
  };

  const toggleConsSort = (field: ConsistencySort) => {
    if (consSort === field) {
      setConsAsc((prev) => !prev);
    } else {
      setConsSort(field);
      setConsAsc(field === 'ptsStdDev');
    }
  };

  const operatorSymbol = getOperatorSymbol(operator);
  const secondaryOperatorSymbol = getOperatorSymbol(secondaryOperator);
  const formattedThreshold = formatMetricNumber(
    thresholdValue,
    activeMetric.step < 1 ? (activeMetric.step < 0.1 ? 2 : 1) : 0,
    activeMetric.unit
  );
  const isUpperDirection = operator === 'gt' || operator === 'gte';
  const conditionToneClass = activeMetric.lowerIsBetter
    ? isUpperDirection
      ? 'text-rose-400'
      : 'text-emerald-400'
    : isUpperDirection
    ? 'text-emerald-400'
    : 'text-amber-400';
  const activeGroupMeta =
    STREAK_METRIC_GROUPS.find((g) => g.id === activeMetric.group) ||
    STREAK_METRIC_GROUPS[0];

  return (
    <div className="space-y-5">
      {/* Row 1: Homogeneous 4-Column Summary Strip with (i) tooltips */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {subTab === 'streaks' && streakEvalMode === 'custom'
                ? `${activeMetric.shortLabel} ${operatorSymbol} ${formattedThreshold}`
                : 'Rachas activas hoy'}
            </span>
            <MetricInfoTooltip
              helpKey={
                subTab === 'streaks' && streakEvalMode === 'custom'
                  ? activeMetric.helpKey
                  : 'consecutiveStreak'
              }
            />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {subTab === 'streaks' && streakEvalMode === 'custom'
              ? customEvaluatedRows.length
              : streaks.length}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {subTab === 'streaks' && streakEvalMode === 'custom'
              ? `Mínimo ${minConsecutive} ${
                  minConsecutive === 1 ? 'PJ seguido' : 'PJ seguidos'
                }`
              : `Al menos ${minStreakGames} PJ seguidos`}
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Líder de racha</span>
            <MetricInfoTooltip helpKey="consecutiveStreak" align="right" />
          </div>
          {subTab === 'streaks' && streakEvalMode === 'custom' ? (
            <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
              {topCustomRow && (
                <PlayerAvatar
                  playerId={topCustomRow.playerId}
                  name={topCustomRow.playerName}
                  teamAbbr={topCustomRow.teamAbbr}
                  showTeamBadge
                  size="sm"
                />
              )}
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                  {topCustomRow ? topCustomRow.playerName : 'Sin coincidencias'}
                </p>
                <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
                  {topCustomRow
                    ? `${topCustomRow.count} PJ · Media ${formatMetricNumber(
                        topCustomRow.streakAvg,
                        activeMetric.decimals,
                        activeMetric.unit
                      )}`
                    : 'Baja el umbral o PJ'}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
              {topStreak && (
                <EntityBadge
                  entityType={topStreak.entityType}
                  entityId={topStreak.entityId}
                  name={topStreak.entityName}
                  teamAbbr={topStreak.teamAbbr}
                  showTeamBadge={topStreak.entityType === 'player'}
                  size="sm"
                />
              )}
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                  {topStreak ? topStreak.entityName : '—'}
                </p>
                <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
                  {topStreak
                    ? `${topStreak.count} PJ · ${humanThresholdLabel(
                        topStreak,
                        experienceMode
                      )}`
                    : '—'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Más fiable (Reloj suizo)</span>
            <MetricInfoTooltip helpKey="consistencyScore" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {mostConsistent && (
              <PlayerAvatar
                playerId={mostConsistent.entityId}
                name={mostConsistent.entityName}
                teamAbbr={mostConsistent.teamAbbr}
                showTeamBadge
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {mostConsistent ? mostConsistent.entityName : '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
                {mostConsistent
                  ? `Nota ${mostConsistent.consistencyScore}/100 · ${mostConsistent.ptsFloor}-${mostConsistent.ptsCeiling} PTS`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Más impredecible</span>
            <MetricInfoTooltip helpKey="floorCeiling" align="right" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {mostVolatile && (
              <PlayerAvatar
                playerId={mostVolatile.entityId}
                name={mostVolatile.entityName}
                teamAbbr={mostVolatile.teamAbbr}
                showTeamBadge
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {mostVolatile ? mostVolatile.entityName : '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-amber-400 truncate">
                {mostVolatile
                  ? `Nota ${mostVolatile.consistencyScore}/100 · ${mostVolatile.ptsFloor}-${mostVolatile.ptsCeiling} PTS`
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Homogeneous Controls & Search */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => setSubTab('streaks')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'streaks'
                  ? 'bg-orange-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              Rachas seguidas (
              {streakEvalMode === 'custom'
                ? customEvaluatedRows.length
                : streaks.length}
              )
            </button>
            <button
              type="button"
              onClick={() => setSubTab('consistency')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'consistency'
                  ? 'bg-orange-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              {experienceMode === 'simple'
                ? `Más regulares (${consistencyRows.length})`
                : `Índice consistencia (${consistencyRows.length})`}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('history')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'history'
                  ? 'bg-orange-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Historial de rachas (10 PJ)</span>
            </button>
          </div>

          {subTab !== 'history' && (
            <button
              type="button"
              onClick={() => setShowInlineHistoryChart((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                showInlineHistoryChart
                  ? 'bg-[#182338] border-orange-500/40 text-orange-300'
                  : 'bg-[#131C2E] border-[#1E293B] text-slate-300 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
              <span>{showInlineHistoryChart ? 'Ocultar curva 10 PJ' : 'Mostrar curva 10 PJ'}</span>
            </button>
          )}

          {subTab === 'streaks' && (
            <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
              <button
                type="button"
                onClick={() => setStreakEvalMode('custom')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  streakEvalMode === 'custom'
                    ? 'bg-[#1E293B] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400" />
                <span>Evaluador ratios y sliders</span>
              </button>
              <button
                type="button"
                onClick={() => setStreakEvalMode('auto')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  streakEvalMode === 'auto'
                    ? 'bg-[#1E293B] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Multi-racha ({streaks.length})
              </button>
            </div>
          )}

          {subTab === 'streaks' && streakEvalMode === 'auto' && (
            <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'player', label: 'Jugadores' },
                  { id: 'team', label: 'Equipos' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStreakFilter(opt.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    streakFilter === opt.id
                      ? 'bg-[#1E293B] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative w-full xl:w-72 shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar jugador o franquicia..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#131C2E] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
      </div>

      {/* Custom Streak Evaluator Panel (Ratios + Quantity Slider + Consecutive Games Slider) */}
      {subTab === 'streaks' && streakEvalMode === 'custom' && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {/* Mobile Collapsible Header (< md) */}
          <button
            type="button"
            onClick={() => setMobileSlidersOpen((prev) => !prev)}
            className="md:hidden w-full px-3.5 py-2.5 flex items-center justify-between gap-2 bg-[#0F172A]/60 border-b border-[#1E293B] text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-100 truncate">
                Condición: {activeMetric.shortLabel} {operatorSymbol} {formattedThreshold} · ≥{minConsecutive} PJ
                {useSecondaryCondition ? ' (+Parlay)' : ''}
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-400 shrink-0">
              <span>{mobileSlidersOpen ? 'Plegar' : 'Editar'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  mobileSlidersOpen ? 'rotate-180' : ''
                }`}
              />
            </span>
          </button>

          <div
            className={`${
              mobileSlidersOpen ? 'block' : 'hidden'
            } md:block p-3.5 sm:p-4 space-y-4`}
          >
            {/* Span Mode & Parlay Toggle Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 pb-3 border-b border-[#1E293B]">
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <span className="text-xs font-medium text-slate-300 hidden sm:inline">
                  Modo de evaluación temporal:
                </span>
                <div className="flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
                  <button
                    type="button"
                    onClick={() => setStreakSpanMode('active')}
                    className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      streakSpanMode === 'active'
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Racha activa
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreakSpanMode('best')}
                    className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      streakSpanMode === 'best'
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Mejor racha histórica
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUseSecondaryCondition((prev) => !prev)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    useSecondaryCondition
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {useSecondaryCondition ? '✓ Parlay Activo (2ª Condición)' : '+ Añadir 2ª Condición (Parlay)'}
                </button>
              </div>
            </div>

            {/* Secondary Condition Panel if Parlay is Enabled */}
            {useSecondaryCondition && (
              <div className="p-3 bg-[#0B1120] border border-orange-500/40 rounded-lg space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-orange-300 font-semibold">
                  <span className="truncate">Parlay Estadístico: 2ª condición simultánea (Y)</span>
                  <button
                    type="button"
                    onClick={() => setUseSecondaryCondition(false)}
                    className="text-xs text-slate-400 hover:text-white whitespace-nowrap shrink-0"
                  >
                    Quitar
                  </button>
                </div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                <div className="lg:col-span-5">
                  <select
                    value={secondaryMetricId}
                    onChange={(e) => handleSelectSecondaryMetric(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#131C2E] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500"
                  >
                    {STREAK_METRIC_GROUPS.map((grp) => (
                      <optgroup key={grp.id} label={grp.label}>
                        {STREAK_METRIC_OPTIONS.filter(
                          (m) => m.group === grp.id
                        ).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-7 flex items-center gap-2.5 sm:gap-3">
                  <div className="inline-flex items-center p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-md shrink-0">
                    {(
                      [
                        { id: 'gt', label: '>' },
                        { id: 'gte', label: '≥' },
                        { id: 'lte', label: '≤' },
                        { id: 'lt', label: '<' },
                      ] as const
                    ).map((opBtn) => (
                      <button
                        key={opBtn.id}
                        type="button"
                        onClick={() => setSecondaryOperator(opBtn.id)}
                        className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                          secondaryOperator === opBtn.id
                            ? 'bg-orange-500 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opBtn.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min={secondaryMetric.min}
                    max={secondaryMetric.max}
                    step={secondaryMetric.step}
                    value={secondaryThresholdValue}
                    onChange={(e) => setSecondaryThresholdValue(Number(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  <span className="font-mono tabular-nums text-xs font-semibold text-orange-400 shrink-0 w-24 text-right">
                    {secondaryOperatorSymbol}{' '}
                    {formatMetricNumber(
                      secondaryThresholdValue,
                      secondaryMetric.step < 1
                        ? secondaryMetric.step < 0.1
                          ? 2
                          : 1
                        : 0,
                      secondaryMetric.unit
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 pb-3 border-b border-[#1E293B]">
            <div className="flex items-center gap-2 max-w-full overflow-hidden">
              <span className="text-xs font-medium text-slate-300 hidden sm:inline shrink-0">
                Accesos directos:
              </span>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar sm:flex-wrap">
                {QUICK_RATIO_CHIPS.map((chipId) => {
                  const opt = STREAK_METRIC_OPTIONS.find(
                    (m) => m.id === chipId
                  );
                  if (!opt) return null;
                  const active = selectedMetricId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectMetric(opt.id)}
                      className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                      }`}
                    >
                      {opt.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            {!allPlayersLoaded && onLoadAllPlayers && (
              <div className="inline-flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onLoadAllPlayers}
                  disabled={loadingAllPlayers}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0B1120] border border-[#1E293B] text-orange-300 hover:border-orange-500/60 hover:bg-[#182338] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  {loadingAllPlayers ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-400" />
                  ) : (
                    <Users className="w-3.5 h-3.5 text-orange-400" />
                  )}
                  <span>
                    {loadingAllPlayers
                      ? 'Cargando censo...'
                      : totalLeaguePlayersAvailable && totalLeaguePlayersAvailable > players.length
                      ? `Ampliar censo (+${
                          totalLeaguePlayersAvailable - players.length
                        } → ${totalLeaguePlayersAvailable} NBA)`
                      : `Evaluar toda la NBA (${
                          totalLeaguePlayersAvailable && totalLeaguePlayersAvailable > 0
                            ? totalLeaguePlayersAvailable
                            : '580+'
                        } jugadores)`}
                  </span>
                </button>
                <MetricInfoTooltip helpKey="loadFullLeagueCensus" align="right" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-end">
            {/* Control 1: Ratio / Stat Selector + (i) tooltip */}
            <div className="lg:col-span-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span>
                    Ratio o estadística a evaluar ({STREAK_METRIC_OPTIONS.length})
                  </span>
                  <MetricInfoTooltip
                    helpKey={activeMetric.helpKey}
                    align="left"
                  />
                </span>
                <span className="text-[11px] font-mono text-orange-400">
                  {activeGroupMeta.shortType}
                </span>
              </div>
              <select
                value={selectedMetricId}
                onChange={(e) => handleSelectMetric(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500 transition-colors"
              >
                {STREAK_METRIC_GROUPS.map((grp) => (
                  <optgroup key={grp.id} label={grp.label}>
                    {STREAK_METRIC_OPTIONS.filter(
                      (m) => m.group === grp.id
                    ).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Control 2: Quantity Slider (X) + Operator (>, >=, <=, <) */}
            <div className="lg:col-span-5 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="inline-flex items-center gap-2">
                  <span className="text-slate-300 font-medium inline-flex items-center gap-1">
                    <span>Cantidad</span>
                    <MetricInfoTooltip
                      helpKey={activeMetric.helpKey}
                      align="left"
                    />
                  </span>
                  <div className="inline-flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-md">
                    {(
                      [
                        { id: 'gt', label: '>', title: 'Más de (>)' },
                        { id: 'gte', label: '≥', title: 'Al menos (≥)' },
                        { id: 'lte', label: '≤', title: 'Como mucho (≤)' },
                        { id: 'lt', label: '<', title: 'Menos de (<)' },
                      ] as const
                    ).map((opBtn) => (
                      <button
                        key={opBtn.id}
                        type="button"
                        title={opBtn.title}
                        onClick={() => setOperator(opBtn.id)}
                        className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors whitespace-nowrap ${
                          operator === opBtn.id
                            ? 'bg-orange-500 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opBtn.label}
                      </button>
                    ))}
                  </div>
                </div>

                <span className="font-mono tabular-nums text-sm font-semibold text-orange-400">
                  {operatorSymbol} {formattedThreshold}
                </span>
              </div>

              <input
                type="range"
                min={activeMetric.min}
                max={activeMetric.max}
                step={activeMetric.step}
                value={thresholdValue}
                onChange={(e) => setThresholdValue(Number(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />

              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500">
                <span>
                  {formatMetricNumber(
                    activeMetric.min,
                    activeMetric.step < 1 ? 1 : 0,
                    activeMetric.unit
                  )}
                </span>
                {activeMetric.qualificationNote && (
                  <span className="font-sans text-slate-400 truncate px-2">
                    {activeMetric.qualificationNote}
                  </span>
                )}
                <span>
                  {formatMetricNumber(
                    activeMetric.max,
                    activeMetric.step < 1 ? 1 : 0,
                    activeMetric.unit
                  )}
                </span>
              </div>
            </div>

            {/* Control 3: Minimum Consecutive Games Slider */}
            <div className="lg:col-span-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-300 font-medium inline-flex items-center gap-1">
                  <span>Partidos consecutivos</span>
                  <MetricInfoTooltip helpKey="consecutiveStreak" />
                </span>
                <span className="font-mono tabular-nums text-sm font-semibold text-emerald-400">
                  ≥ {minConsecutive} PJ seguidos
                </span>
              </div>

              <input
                type="range"
                min={1}
                max={15}
                step={1}
                value={minConsecutive}
                onChange={(e) => setMinConsecutive(Number(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />

              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500">
                <span>1 PJ</span>
                <span className="font-sans text-slate-400">
                  Desde su último partido
                </span>
                <span>15 PJ</span>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Historial de Rachas (10-Game Progression Line Chart) */}
      {(subTab === 'history' || showInlineHistoryChart) && (
        <PlayerStreakHistoryChart
          players={players}
          selectedPlayerId={
            historyPlayerId || topCustomRow?.playerId || players[0]?.id || null
          }
          onSelectPlayerId={(pid) => setHistoryPlayerId(pid)}
          onInspectPlayer={(pid) => onInspectEntity('player', pid)}
        />
      )}

      {/* Row 3: Homogeneous Data Grid */}
      {subTab !== 'history' && (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
        {subTab === 'streaks' ? (
          streakEvalMode === 'custom' ? (
            customEvaluatedRows.length === 0 ? (
              <div className="py-14 px-6 text-center space-y-2">
                <p className="text-sm font-medium text-slate-200">
                  Ningún jugador cargado encadena ahora mismo {minConsecutive} o
                  más partidos seguidos haciendo {operatorSymbol}{' '}
                  {formattedThreshold} en {activeMetric.shortLabel}.
                </p>
                <p className="text-xs text-slate-400">
                  Desliza hacia la izquierda la cantidad ({formattedThreshold})
                  o el mínimo de partidos ({minConsecutive} PJ) para abrir el
                  radar.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Virtualized Streak Cards (< md) */}
                <div className="md:hidden">
                  <div className="px-3.5 py-2 bg-[#0F172A]/70 border-b border-[#1E293B] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                      Ordenar ({customEvaluatedRows.length}):
                    </span>
                    {(
                      [
                        { id: 'count', label: 'PJ seguidos' },
                        { id: 'streakAvg', label: 'Media racha' },
                        { id: 'seasonAvg', label: 'Media habitual' },
                      ] as const
                    ).map((opt) => {
                      const active = customSort === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleCustomSort(opt.id)}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-[#1E293B] text-orange-400 font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {opt.label}
                          {active ? (customAsc ? ' ↑' : ' ↓') : ''}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className="max-h-[540px] overflow-y-auto divide-y divide-[#1E293B]"
                    onScroll={(e) =>
                      setMobileCustomScrollTop(e.currentTarget.scrollTop)
                    }
                  >
                    {mobileCustomTopSpacer > 0 && (
                      <div
                        style={{ height: `${mobileCustomTopSpacer}px` }}
                        aria-hidden="true"
                      />
                    )}
                    {mobileCustomVisibleRows.map((row) => {
                      const wKey = `player:${row.playerId}`;
                      const watched = watchlistIds.has(wKey);
                      return (
                        <div
                          key={row.playerId}
                          onClick={() => onInspectEntity('player', row.playerId)}
                          style={{ height: `${MOBILE_CUSTOM_HEIGHT}px` }}
                          className="px-3.5 py-2.5 hover:bg-[#182338] active:bg-[#182338] cursor-pointer transition-colors flex flex-col justify-between overflow-hidden"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                aria-label="Alternar seguimiento"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleWatchlist(wKey);
                                }}
                                className="p-2 -m-1.5 rounded text-slate-400 hover:text-orange-400 shrink-0 touch-manipulation"
                              >
                                <Star
                                  className={`w-4 h-4 ${
                                    watched
                                      ? 'fill-orange-400 text-orange-400'
                                      : ''
                                  }`}
                                />
                              </button>
                              <PlayerAvatar
                                playerId={row.playerId}
                                name={row.playerName}
                                teamAbbr={row.teamAbbr}
                                showTeamBadge
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-sm text-slate-100 truncate">
                                  {row.playerName}
                                </div>
                                <div className="text-xs text-slate-400 truncate">
                                  {row.teamAbbr} · {row.position} · Últ:{' '}
                                  {formatMetricNumber(
                                    row.lastGameVal,
                                    activeMetric.gameDecimals,
                                    activeMetric.unit === '%' ? '%' : ''
                                  )}{' '}
                                  {row.lastIsHome ? 'vs' : '@'} {row.lastOpponent}
                                </div>
                              </div>
                            </div>

                            <div className="text-right font-mono tabular-nums shrink-0">
                              <div className="text-sm font-bold text-orange-400">
                                {row.count} PJ seguidos
                              </div>
                              <div className="text-[11px] text-emerald-400">
                                Media{' '}
                                {formatMetricNumber(
                                  row.streakAvg,
                                  activeMetric.decimals,
                                  activeMetric.unit === '%' ? '%' : ''
                                )}{' '}
                                <span className="text-slate-500">
                                  (Base{' '}
                                  {formatMetricNumber(
                                    row.seasonAvg,
                                    activeMetric.decimals,
                                    activeMetric.unit === '%' ? '%' : ''
                                  )}
                                  )
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-1.5 text-[11px] font-mono tabular-nums text-slate-300 truncate">
                            <span className="text-slate-400 font-sans">
                              Serie:{' '}
                            </span>
                            {row.recentSequence
                              .map((v) =>
                                formatMetricNumber(
                                  v,
                                  activeMetric.gameDecimals,
                                  activeMetric.unit === '%' ? '%' : '',
                                  activeMetric.unit === '%'
                                )
                              )
                              .join(' · ')}
                            {row.count > row.recentSequence.length ? ' …' : ''}
                          </div>
                        </div>
                      );
                    })}
                    {mobileCustomBottomSpacer > 0 && (
                      <div
                        style={{ height: `${mobileCustomBottomSpacer}px` }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </div>

                {/* Desktop Virtualized Table (md+) */}
                <div
                  className="hidden md:block overflow-x-auto max-h-[600px] overflow-y-auto"
                  onScroll={(e) => setCustomScrollTop(e.currentTarget.scrollTop)}
                >
                  <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60 sticky top-0 z-10">
                      <th className="py-3 pl-4 pr-2 w-10 font-medium">Seg.</th>
                      <th className="py-3 px-3 font-medium">Jugador</th>
                      <th className="py-3 px-3 font-medium">
                        <ColumnHelpHeader
                          label={`Serie reciente (${activeMetric.shortLabel} ${operatorSymbol} ${formattedThreshold})`}
                          helpKey={activeMetric.helpKey}
                          align="left"
                        />
                      </th>
                      <th className="py-3 px-3 font-medium text-right">
                        <ColumnHelpHeader
                          label="Partidos seguidos"
                          helpKey="consecutiveStreak"
                          sortable
                          activeSort={customSort === 'count'}
                          sortAsc={customAsc}
                          onSort={() => toggleCustomSort('count')}
                        />
                      </th>
                      <th className="py-3 px-3 font-medium text-right">
                        <ColumnHelpHeader
                          label="Media en la racha"
                          helpKey="windowAvg"
                          sortable
                          activeSort={customSort === 'streakAvg'}
                          sortAsc={customAsc}
                          onSort={() => toggleCustomSort('streakAvg')}
                        />
                      </th>
                      <th className="py-3 px-3 font-medium text-right">
                        <ColumnHelpHeader
                          label="Media habitual"
                          helpKey="baselineAvg"
                          sortable
                          activeSort={customSort === 'seasonAvg'}
                          sortAsc={customAsc}
                          onSort={() => toggleCustomSort('seasonAvg')}
                        />
                      </th>
                      <th className="py-3 pl-3 pr-4 font-medium text-right">
                        <ColumnHelpHeader
                          label="Último partido"
                          helpKey="lastGamePerf"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] text-sm">
                    {customTopSpacerHeight > 0 && (
                      <tr style={{ height: `${customTopSpacerHeight}px` }}>
                        <td colSpan={7} className="p-0 border-0" />
                      </tr>
                    )}
                    {customVisibleRows.map((row) => {
                      const wKey = `player:${row.playerId}`;
                      const watched = watchlistIds.has(wKey);
                      return (
                        <tr
                          key={row.playerId}
                          onClick={() => onInspectEntity('player', row.playerId)}
                          className="hover:bg-[#182338] cursor-pointer transition-colors"
                          style={{ height: `${CUSTOM_ROW_HEIGHT}px` }}
                        >
                          <td
                            className="py-2.5 pl-4 pr-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleWatchlist(wKey);
                            }}
                          >
                            <button
                              type="button"
                              aria-label="Alternar seguimiento"
                              className="p-1 rounded text-slate-400 hover:text-orange-400"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  watched ? 'fill-orange-400 text-orange-400' : ''
                                }`}
                              />
                            </button>
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar
                                playerId={row.playerId}
                                name={row.playerName}
                                teamAbbr={row.teamAbbr}
                                showTeamBadge
                                size="sm"
                              />
                              <div>
                                <div className="font-medium text-slate-100 whitespace-nowrap leading-tight">
                                  {row.playerName}
                                </div>
                                <div className="text-xs text-slate-400 whitespace-nowrap leading-tight mt-0.5">
                                  {row.teamAbbr} · {row.position} · {row.gamesPlayed}{' '}
                                  PJ
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div
                              className={`inline-flex items-center gap-1.5 ${conditionToneClass} font-medium whitespace-nowrap`}
                            >
                              <span>
                                {isUpperDirection ? '▲' : '▼'}{' '}
                                {activeMetric.shortLabel} {operatorSymbol}{' '}
                                {formattedThreshold}
                              </span>
                              <MetricInfoTooltip
                                helpKey={activeMetric.helpKey}
                                align="left"
                                iconClassName="w-3 h-3"
                              />
                            </div>
                            <div className="text-xs font-mono tabular-nums text-slate-400 truncate max-w-xs">
                              Últimos:{' '}
                              {row.recentSequence
                                .map((v) =>
                                  formatMetricNumber(
                                    v,
                                    activeMetric.gameDecimals,
                                    activeMetric.unit === '%' ? '%' : '',
                                    activeMetric.unit === '%'
                                  )
                                )
                                .join(' · ')}
                              {row.count > row.recentSequence.length ? ' …' : ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-orange-400 whitespace-nowrap">
                            {row.count} PJ
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-slate-100 whitespace-nowrap">
                            {formatMetricNumber(
                              row.streakAvg,
                              activeMetric.decimals,
                              activeMetric.unit === '%' ? '%' : ''
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                            {formatMetricNumber(
                              row.seasonAvg,
                              activeMetric.decimals,
                              activeMetric.unit === '%' ? '%' : ''
                            )}
                          </td>
                          <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-2">
                              <div>
                                <span>
                                  {formatMetricNumber(
                                    row.lastGameVal,
                                    activeMetric.gameDecimals,
                                    activeMetric.unit === '%' ? '%' : ''
                                  )}
                                </span>
                                <span className="text-slate-500">
                                  {' · '}
                                  {row.lastIsHome ? 'vs' : '@'} {row.lastOpponent} (
                                  {formatShortDate(row.lastGameDate)})
                                </span>
                              </div>
                              <button
                                type="button"
                                title="Ver evolución últimos 10 partidos en el gráfico"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryPlayerId(row.playerId);
                                  setShowInlineHistoryChart(true);
                                }}
                                className="px-2 py-1 rounded bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/50 text-[11px] font-sans font-medium text-orange-300 hover:text-orange-200 transition-colors"
                              >
                                10 PJ
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {customBottomSpacerHeight > 0 && (
                      <tr style={{ height: `${customBottomSpacerHeight}px` }}>
                        <td colSpan={7} className="p-0 border-0" />
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </>
            )
          ) : filteredStreaks.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <p className="text-sm font-medium text-slate-200">
                No se encontraron rachas automáticas de {minStreakGames} o más
                partidos seguidos.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Usa el modo &ldquo;Evaluador por ratios y sliders&rdquo; arriba o
                elige &ldquo;Amplio (Ver más)&rdquo;.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Auto-Streaks Cards (< md) */}
              <div className="md:hidden divide-y divide-[#1E293B]">
                {filteredStreaks.map((st) => {
                  const wKey = `${st.entityType}:${st.entityId}`;
                  const watched = watchlistIds.has(wKey);
                  const rowHelpKey = resolveAutoStreakHelpKey(st);
                  return (
                    <div
                      key={st.id}
                      onClick={() => onInspectEntity(st.entityType, st.entityId)}
                      className="p-3.5 hover:bg-[#182338] active:bg-[#182338] cursor-pointer transition-colors space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            aria-label="Alternar seguimiento"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleWatchlist(wKey);
                            }}
                            className="p-2 -m-1.5 rounded text-slate-400 hover:text-orange-400 shrink-0 touch-manipulation"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                watched ? 'fill-orange-400 text-orange-400' : ''
                              }`}
                            />
                          </button>
                          <EntityBadge
                            entityType={st.entityType}
                            entityId={st.entityId}
                            name={st.entityName}
                            teamAbbr={st.teamAbbr}
                            showTeamBadge={st.entityType === 'player'}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-100 truncate">
                              {st.entityName}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              {st.subtitle} · Últ. {formatShortDate(st.lastGameDate)}
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div className="text-sm font-bold text-orange-400">
                            {st.count} PJ seguidos
                          </div>
                          <div className="text-[11px] text-slate-300">
                            Media {st.windowAvgDuringStreak.toFixed(1)}{' '}
                            <span className="text-slate-500">
                              (Base {st.seasonBaseline.toFixed(1)})
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-1.5 text-xs">
                        <span
                          className={`font-medium ${
                            st.isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {st.isPositive ? '▲ ' : '▼ '}
                          {humanThresholdLabel(st, experienceMode)}
                        </span>
                        <MetricInfoTooltip
                          helpKey={rowHelpKey}
                          align="left"
                          iconClassName="w-3 h-3"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Auto-Streaks Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                    <th className="py-3 pl-4 pr-2 w-10 font-medium">Seg.</th>
                    <th className="py-3 px-3 font-medium">Protagonista</th>
                    <th className="py-3 px-3 font-medium">
                      <ColumnHelpHeader
                        label="Qué lleva haciendo seguido"
                        helpKey="consecutiveStreak"
                        align="left"
                      />
                    </th>
                    <th className="py-3 px-3 font-medium text-right">
                      <ColumnHelpHeader
                        label="Partidos seguidos"
                        helpKey="consecutiveStreak"
                      />
                    </th>
                    <th className="py-3 px-3 font-medium text-right">
                      <ColumnHelpHeader
                        label="Media en la racha"
                        helpKey="windowAvg"
                      />
                    </th>
                    <th className="py-3 px-3 font-medium text-right">
                      <ColumnHelpHeader
                        label="Media habitual"
                        helpKey="baselineAvg"
                      />
                    </th>
                    <th className="py-3 pl-3 pr-4 font-medium text-right">
                      <ColumnHelpHeader
                        label="Último partido"
                        helpKey="lastGamePerf"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] text-sm">
                  {filteredStreaks.map((st) => {
                    const wKey = `${st.entityType}:${st.entityId}`;
                    const watched = watchlistIds.has(wKey);
                    const rowHelpKey = resolveAutoStreakHelpKey(st);
                    return (
                      <tr
                        key={st.id}
                        onClick={() =>
                          onInspectEntity(st.entityType, st.entityId)
                        }
                        className="hover:bg-[#182338] cursor-pointer transition-colors"
                      >
                        <td
                          className="py-2.5 pl-4 pr-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleWatchlist(wKey);
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Alternar seguimiento"
                            className="p-1 rounded text-slate-400 hover:text-orange-400"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                watched ? 'fill-orange-400 text-orange-400' : ''
                              }`}
                            />
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <EntityBadge
                              entityType={st.entityType}
                              entityId={st.entityId}
                              name={st.entityName}
                              teamAbbr={st.teamAbbr}
                              showTeamBadge={st.entityType === 'player'}
                              size="sm"
                            />
                            <div>
                              <div className="font-medium text-slate-100 whitespace-nowrap">
                                {st.entityName}
                              </div>
                              <div className="text-xs text-slate-400 whitespace-nowrap">
                                {st.subtitle}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className={`font-medium ${
                                st.isPositive
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {st.isPositive ? '▲ ' : '▼ '}
                              {humanThresholdLabel(st, experienceMode)}
                            </span>
                            <MetricInfoTooltip
                              helpKey={rowHelpKey}
                              align="left"
                              iconClassName="w-3 h-3"
                            />
                          </div>
                          <div className="text-xs text-slate-400">
                            {experienceMode === 'simple' &&
                            st.metricLabel === 'Net Rating'
                              ? 'Diferencia de puntos'
                              : st.metricLabel}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-orange-400 whitespace-nowrap">
                          {st.count} PJ
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap">
                          {st.windowAvgDuringStreak.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                          {st.seasonBaseline.toFixed(1)}
                        </td>
                        <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums text-xs text-slate-400 whitespace-nowrap">
                          {formatShortDate(st.lastGameDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )
        ) : (
          <>
            {/* Mobile Consistency Sort + Cards (< md) */}
            <div className="md:hidden">
              <div className="px-3.5 py-2 bg-[#0F172A]/70 border-b border-[#1E293B] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                  Ordenar:
                </span>
                {(
                  [
                    { id: 'consistencyScore', label: 'Regularidad' },
                    { id: 'ptsAvg', label: 'Puntos media' },
                    { id: 'hitRate20Pts', label: 'Noches cumple' },
                  ] as const
                ).map((opt) => {
                  const active = consSort === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleConsSort(opt.id)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-[#1E293B] text-orange-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                      {active ? (consAsc ? ' ↑' : ' ↓') : ''}
                    </button>
                  );
                })}
              </div>

              <div className="divide-y divide-[#1E293B]">
                {filteredConsistency.map((row) => {
                  const wKey = `player:${row.entityId}`;
                  const watched = watchlistIds.has(wKey);
                  return (
                    <div
                      key={row.entityId}
                      onClick={() => onInspectEntity('player', row.entityId)}
                      className="p-3.5 hover:bg-[#182338] active:bg-[#182338] cursor-pointer transition-colors space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            aria-label="Alternar seguimiento"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleWatchlist(wKey);
                            }}
                            className="p-2 -m-1.5 rounded text-slate-400 hover:text-orange-400 shrink-0 touch-manipulation"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                watched ? 'fill-orange-400 text-orange-400' : ''
                              }`}
                            />
                          </button>
                          <PlayerAvatar
                            playerId={row.entityId}
                            name={row.entityName}
                            teamAbbr={row.teamAbbr}
                            showTeamBadge
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-100 truncate">
                              {row.entityName}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              {row.teamAbbr} · {row.position} · {row.gamesPlayed} PJ ·{' '}
                              {row.minutesAvg} MIN
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono tabular-nums text-sm font-bold text-orange-400">
                            {row.consistencyScore}/100
                          </div>
                          <div
                            className={`text-[11px] font-medium ${
                              row.consistencyScore >= 78
                                ? 'text-emerald-400'
                                : row.consistencyScore >= 60
                                ? 'text-slate-300'
                                : 'text-amber-400'
                            }`}
                          >
                            {row.profileLabel}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-3 py-2 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-400">Media PTS</div>
                          <div className="font-mono tabular-nums font-medium text-slate-100 mt-0.5">
                            {row.ptsAvg.toFixed(1)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Suelo–Techo</div>
                          <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                            {row.ptsFloor.toFixed(0)}–{row.ptsCeiling.toFixed(0)} PTS
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">Cumple ≥85%</div>
                          <div className="font-mono tabular-nums font-semibold text-emerald-400 mt-0.5">
                            {row.hitRate20Pts}%
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desktop Consistency Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                  <th className="py-3 pl-4 pr-2 w-10 font-medium">Seg.</th>
                  <th className="py-3 px-3 font-medium">Jugador</th>
                  <th className="py-3 px-3 font-medium">
                    <ColumnHelpHeader
                      label="Tipo de fiabilidad"
                      helpKey="consistencyScore"
                      align="left"
                    />
                  </th>
                  <th className="py-3 px-3 font-medium text-right">
                    <ColumnHelpHeader
                      label="Nota Regularidad"
                      helpKey="consistencyScore"
                      sortable
                      activeSort={consSort === 'consistencyScore'}
                      sortAsc={consAsc}
                      onSort={() => toggleConsSort('consistencyScore')}
                    />
                  </th>
                  <th className="py-3 px-3 font-medium text-right">
                    <ColumnHelpHeader
                      label="Puntos Media"
                      helpKey="ptsBase"
                      sortable
                      activeSort={consSort === 'ptsAvg'}
                      sortAsc={consAsc}
                      onSort={() => toggleConsSort('ptsAvg')}
                    />
                  </th>
                  {experienceMode === 'advanced' && (
                    <th className="py-3 px-3 font-medium text-right">
                      <ColumnHelpHeader
                        label="Desv. ±σ"
                        helpKey="ptsStdDev"
                        sortable
                        activeSort={consSort === 'ptsStdDev'}
                        sortAsc={consAsc}
                        onSort={() => toggleConsSort('ptsStdDev')}
                      />
                    </th>
                  )}
                  <th className="py-3 px-3 font-medium text-right">
                    <ColumnHelpHeader
                      label={
                        experienceMode === 'simple'
                          ? 'Noche normal (Suelo – Techo)'
                          : 'Suelo – Techo (1σ PTS)'
                      }
                      helpKey="floorCeiling"
                    />
                  </th>
                  <th className="py-3 pl-3 pr-4 font-medium text-right">
                    <ColumnHelpHeader
                      label={
                        experienceMode === 'simple'
                          ? 'Noches que cumple'
                          : 'Cumple ≥85% media'
                      }
                      helpKey="hitRate85"
                      sortable
                      activeSort={consSort === 'hitRate20Pts'}
                      sortAsc={consAsc}
                      onSort={() => toggleConsSort('hitRate20Pts')}
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-sm">
                {filteredConsistency.map((row) => {
                  const wKey = `player:${row.entityId}`;
                  const watched = watchlistIds.has(wKey);
                  return (
                    <tr
                      key={row.entityId}
                      onClick={() => onInspectEntity('player', row.entityId)}
                      className="hover:bg-[#182338] cursor-pointer transition-colors"
                    >
                      <td
                        className="py-2.5 pl-4 pr-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWatchlist(wKey);
                        }}
                      >
                        <button
                          type="button"
                          aria-label="Alternar seguimiento"
                          className="p-1 rounded text-slate-400 hover:text-orange-400"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              watched ? 'fill-orange-400 text-orange-400' : ''
                            }`}
                          />
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <PlayerAvatar
                            playerId={row.entityId}
                            name={row.entityName}
                            teamAbbr={row.teamAbbr}
                            showTeamBadge
                            size="sm"
                          />
                          <div>
                            <div className="font-medium text-slate-100 whitespace-nowrap">
                              {row.entityName}
                            </div>
                            <div className="text-xs text-slate-400 whitespace-nowrap">
                              {row.teamAbbr} · {row.position} · {row.gamesPlayed} PJ ·{' '}
                              {row.minutesAvg} MIN
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-xs font-medium ${
                            row.consistencyScore >= 78
                              ? 'text-emerald-400'
                              : row.consistencyScore >= 60
                              ? 'text-slate-200'
                              : 'text-amber-400'
                          }`}
                        >
                          {row.profileLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-orange-400 whitespace-nowrap">
                        {row.consistencyScore}/100
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap">
                        {row.ptsAvg.toFixed(1)}
                      </td>
                      {experienceMode === 'advanced' && (
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                          ±{row.ptsStdDev.toFixed(1)}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {row.ptsFloor.toFixed(0)} – {row.ptsCeiling.toFixed(0)}{' '}
                        PTS
                      </td>
                       <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums text-emerald-400 whitespace-nowrap">
                         <div className="inline-flex items-center justify-end gap-2">
                           <span>{row.hitRate20Pts}% de partidos</span>
                           <button
                             type="button"
                             title="Ver evolución últimos 10 partidos en el gráfico"
                             onClick={(e) => {
                               e.stopPropagation();
                               setHistoryPlayerId(row.entityId);
                               setShowInlineHistoryChart(true);
                             }}
                             className="px-2 py-1 rounded bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/50 text-[11px] font-sans font-medium text-orange-300 hover:text-orange-200 transition-colors"
                           >
                             10 PJ
                           </button>
                         </div>
                       </td>
                     </tr>
                   );
                 })}
               </tbody>
             </table>
             </div>
           </>
         )}
       </div>
       )}
     </div>
   );
 }
