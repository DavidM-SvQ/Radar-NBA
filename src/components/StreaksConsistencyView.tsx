import { useMemo, useState } from 'react';
import {
  ChevronDown,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
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

type SubTab = 'streaks' | 'consistency';
type StreakEvalMode = 'custom' | 'auto';
type StreakSpanMode = 'active' | 'best';
type ThresholdOperator = 'gt' | 'gte';
type CustomStreakSort = 'count' | 'streakAvg' | 'seasonAvg';
type ConsistencySort =
  | 'consistencyScore'
  | 'ptsAvg'
  | 'ptsStdDev'
  | 'hitRate20Pts';

interface StreakMetricOption {
  id: string;
  group: 'ratios' | 'counting';
  shortLabel: string;
  label: string;
  helpKey: string;
  min: number;
  max: number;
  step: number;
  defaultThreshold: number;
  unit: string;
  decimals: number;
  gameDecimals: number;
  qualificationNote?: string;
  qualifies?: (g: PlayerGameLog) => boolean;
  getValue: (g: PlayerGameLog) => number;
}

const STREAK_METRIC_OPTIONS: StreakMetricOption[] = [
  // Grupo 1: Ratios y Eficiencia
  {
    id: 'tsPct',
    group: 'ratios',
    shortLabel: 'TS%',
    label: 'TS% · Acierto Real (True Shooting %)',
    helpKey: 'tsPct',
    min: 45,
    max: 80,
    step: 1,
    defaultThreshold: 60,
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥5 tiros de campo o ≥4 libres en el partido',
    qualifies: (g) => g.fga >= 5 || g.fta >= 4,
    getValue: (g) => g.tsPct,
  },
  {
    id: 'efgPct',
    group: 'ratios',
    shortLabel: 'eFG%',
    label: 'eFG% · Tiro de Campo Efectivo',
    helpKey: 'efgPct',
    min: 40,
    max: 80,
    step: 1,
    defaultThreshold: 58,
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
    getValue: (g) => g.efgPct,
  },
  {
    id: 'fgPct',
    group: 'ratios',
    shortLabel: 'TC%',
    label: 'TC% · % Tiros de Campo',
    helpKey: 'fgPct',
    min: 35,
    max: 75,
    step: 1,
    defaultThreshold: 50,
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥5 tiros de campo intentados en el partido',
    qualifies: (g) => g.fga >= 5,
    getValue: (g) => g.fgPct,
  },
  {
    id: 'fg3Pct',
    group: 'ratios',
    shortLabel: '3P%',
    label: '3P% · % Acierto en Triples',
    helpKey: 'fg3Pct',
    min: 25,
    max: 70,
    step: 1,
    defaultThreshold: 40,
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥3 triples intentados en el partido',
    qualifies: (g) => g.fg3a >= 3,
    getValue: (g) => g.fg3Pct,
  },
  {
    id: 'ftPct',
    group: 'ratios',
    shortLabel: 'TL%',
    label: 'TL% · % Tiros Libres',
    helpKey: 'ftPct',
    min: 60,
    max: 100,
    step: 1,
    defaultThreshold: 85,
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥2 tiros libres intentados en el partido',
    qualifies: (g) => g.fta >= 2,
    getValue: (g) => g.ftPct,
  },
  {
    id: 'astTo',
    group: 'ratios',
    shortLabel: 'AST/PER',
    label: 'AST/PER · Ratio Asistencias por Pérdida',
    helpKey: 'astTo',
    min: 1,
    max: 8,
    step: 0.5,
    defaultThreshold: 3,
    unit: 'x',
    decimals: 2,
    gameDecimals: 1,
    qualificationNote: 'Si tiene 0 pérdidas toma el total de asistencias',
    qualifies: (g) => g.assists > 0 || g.turnovers > 0,
    getValue: (g) => (g.turnovers === 0 ? g.assists : g.assists / g.turnovers),
  },
  {
    id: 'ptsPerMin',
    group: 'ratios',
    shortLabel: 'PTS/MIN',
    label: 'PTS/MIN · Ratio Puntos por Minuto',
    helpKey: 'ptsPerMin',
    min: 0.4,
    max: 1.4,
    step: 0.05,
    defaultThreshold: 0.75,
    unit: '',
    decimals: 2,
    gameDecimals: 2,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    getValue: (g) => (g.minutes > 0 ? g.points / g.minutes : 0),
  },
  {
    id: 'rebPer36',
    group: 'ratios',
    shortLabel: 'REB/36',
    label: 'REB/36 · Ratio Rebotes por 36 min',
    helpKey: 'rebPer36',
    min: 4,
    max: 20,
    step: 0.5,
    defaultThreshold: 10,
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    getValue: (g) => (g.minutes > 0 ? (g.rebounds / g.minutes) * 36 : 0),
  },
  {
    id: 'astPer36',
    group: 'ratios',
    shortLabel: 'AST/36',
    label: 'AST/36 · Ratio Asistencias por 36 min',
    helpKey: 'astPer36',
    min: 3,
    max: 15,
    step: 0.5,
    defaultThreshold: 8,
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    getValue: (g) => (g.minutes > 0 ? (g.assists / g.minutes) * 36 : 0),
  },
  {
    id: 'usgEst',
    group: 'ratios',
    shortLabel: 'USG%',
    label: 'USG% · Ratio de Uso Ofensivo',
    helpKey: 'usgPct',
    min: 15,
    max: 42,
    step: 1,
    defaultThreshold: 28,
    unit: '%',
    decimals: 1,
    gameDecimals: 1,
    qualificationNote: 'Exige ≥12 minutos jugados en el partido',
    qualifies: (g) => g.minutes >= 12,
    getValue: (g) => g.usgEst,
  },
  {
    id: 'gameScore',
    group: 'ratios',
    shortLabel: 'GmSc',
    label: 'GmSc · Valoración Game Score',
    helpKey: 'gmSc',
    min: 10,
    max: 40,
    step: 1,
    defaultThreshold: 20,
    unit: '',
    decimals: 1,
    gameDecimals: 1,
    getValue: (g) => g.gameScore,
  },
  // Grupo 2: Estadísticas por Partido
  {
    id: 'points',
    group: 'counting',
    shortLabel: 'PTS',
    label: 'PTS · Puntos anotados',
    helpKey: 'ptsBase',
    min: 8,
    max: 45,
    step: 1,
    defaultThreshold: 20,
    unit: ' PTS',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.points,
  },
  {
    id: 'rebounds',
    group: 'counting',
    shortLabel: 'REB',
    label: 'REB · Rebotes totales',
    helpKey: 'rebBase',
    min: 3,
    max: 18,
    step: 1,
    defaultThreshold: 8,
    unit: ' REB',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.rebounds,
  },
  {
    id: 'oreb',
    group: 'counting',
    shortLabel: 'OR',
    label: 'OR · Rebotes ofensivos',
    helpKey: 'orebBase',
    min: 1,
    max: 8,
    step: 1,
    defaultThreshold: 3,
    unit: ' OR',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.oreb,
  },
  {
    id: 'assists',
    group: 'counting',
    shortLabel: 'AST',
    label: 'AST · Asistencias',
    helpKey: 'astBase',
    min: 3,
    max: 15,
    step: 1,
    defaultThreshold: 7,
    unit: ' AST',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.assists,
  },
  {
    id: 'fg3m',
    group: 'counting',
    shortLabel: '3PM',
    label: '3PM · Triples anotados',
    helpKey: 'fg3m',
    min: 1,
    max: 9,
    step: 1,
    defaultThreshold: 3,
    unit: ' 3PM',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.fg3m,
  },
  {
    id: 'pra',
    group: 'counting',
    shortLabel: 'PRA',
    label: 'PRA · Puntos + Rebotes + Asistencias',
    helpKey: 'pra',
    min: 15,
    max: 60,
    step: 1,
    defaultThreshold: 32,
    unit: ' PRA',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.pra,
  },
  {
    id: 'stocks',
    group: 'counting',
    shortLabel: 'STK',
    label: 'STK · Robos + Tapones (Stocks)',
    helpKey: 'stocksBase',
    min: 1,
    max: 6,
    step: 1,
    defaultThreshold: 2,
    unit: ' STK',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.stocks,
  },
  {
    id: 'steals',
    group: 'counting',
    shortLabel: 'ROB',
    label: 'ROB · Robos de balón',
    helpKey: 'steals',
    min: 1,
    max: 5,
    step: 1,
    defaultThreshold: 2,
    unit: ' ROB',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.steals,
  },
  {
    id: 'blocks',
    group: 'counting',
    shortLabel: 'TAP',
    label: 'TAP · Tapones',
    helpKey: 'blocks',
    min: 1,
    max: 5,
    step: 1,
    defaultThreshold: 2,
    unit: ' TAP',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.blocks,
  },
  {
    id: 'plusMinus',
    group: 'counting',
    shortLabel: '+/-',
    label: '+/- · Impacto Más / Menos en pista',
    helpKey: 'plusMinusBase',
    min: -5,
    max: 20,
    step: 1,
    defaultThreshold: 5,
    unit: '',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.plusMinus,
  },
  {
    id: 'minutes',
    group: 'counting',
    shortLabel: 'MIN',
    label: 'MIN · Minutos jugados',
    helpKey: 'minBase',
    min: 20,
    max: 42,
    step: 1,
    defaultThreshold: 34,
    unit: ' MIN',
    decimals: 1,
    gameDecimals: 0,
    getValue: (g) => g.minutes,
  },
];

const QUICK_RATIO_CHIPS = [
  'tsPct',
  'efgPct',
  'fg3Pct',
  'astTo',
  'ptsPerMin',
  'gameScore',
  'points',
  'pra',
  'assists',
  'fg3m',
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


  const activeMetric = useMemo(
    () =>
      STREAK_METRIC_OPTIONS.find((m) => m.id === selectedMetricId) ||
      STREAK_METRIC_OPTIONS[0],
    [selectedMetricId]
  );

  const secondaryMetric = useMemo(
    () =>
      STREAK_METRIC_OPTIONS.find((m) => m.id === secondaryMetricId) ||
      STREAK_METRIC_OPTIONS[11],
    [secondaryMetricId]
  );

  const handleSelectMetric = (metricId: string) => {
    const found = STREAK_METRIC_OPTIONS.find((m) => m.id === metricId);
    setSelectedMetricId(metricId);
    if (found) {
      setThresholdValue(found.defaultThreshold);
    }
  };

  const handleSelectSecondaryMetric = (metricId: string) => {
    const found = STREAK_METRIC_OPTIONS.find((m) => m.id === metricId);
    setSecondaryMetricId(metricId);
    if (found) {
      setSecondaryThresholdValue(found.defaultThreshold);
    }
  };

  const checkGamePasses = (g: PlayerGameLog): boolean => {
    const pQualifies = activeMetric.qualifies ? activeMetric.qualifies(g) : true;
    if (!pQualifies) return false;
    const pVal = activeMetric.getValue(g);
    const pPasses = operator === 'gt' ? pVal > thresholdValue : pVal >= thresholdValue;
    if (!pPasses) return false;

    if (useSecondaryCondition) {
      const sQualifies = secondaryMetric.qualifies ? secondaryMetric.qualifies(g) : true;
      if (!sQualifies) return false;
      const sVal = secondaryMetric.getValue(g);
      const sPasses = secondaryOperator === 'gt' ? sVal > secondaryThresholdValue : sVal >= secondaryThresholdValue;
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
        teamAbbr: player.teamAbbr,
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

  const operatorSymbol = operator === 'gt' ? '>' : '≥';
  const formattedThreshold = formatMetricNumber(
    thresholdValue,
    activeMetric.step < 1 ? (activeMetric.step < 0.1 ? 2 : 1) : 0,
    activeMetric.unit
  );

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
            <>
              <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
                {topCustomRow ? topCustomRow.playerName : 'Sin coincidencias'}
              </p>
              <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
                {topCustomRow
                  ? `${topCustomRow.count} PJ · Media ${formatMetricNumber(
                      topCustomRow.streakAvg,
                      activeMetric.decimals,
                      activeMetric.unit
                    )}`
                  : 'Baja el umbral o PJ'}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
                {topStreak ? topStreak.entityName : '—'}
              </p>
              <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
                {topStreak
                  ? `${topStreak.count} PJ · ${humanThresholdLabel(
                      topStreak,
                      experienceMode
                    )}`
                  : '—'}
              </p>
            </>
          )}
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Más fiable (Reloj suizo)</span>
            <MetricInfoTooltip helpKey="consistencyScore" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {mostConsistent ? mostConsistent.entityName : '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
            {mostConsistent
              ? `Nota ${mostConsistent.consistencyScore}/100 · ${mostConsistent.ptsFloor}-${mostConsistent.ptsCeiling} PTS`
              : '—'}
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Más impredecible</span>
            <MetricInfoTooltip helpKey="floorCeiling" align="right" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {mostVolatile ? mostVolatile.entityName : '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-amber-400 truncate">
            {mostVolatile
              ? `Nota ${mostVolatile.consistencyScore}/100 · ${mostVolatile.ptsFloor}-${mostVolatile.ptsCeiling} PTS`
              : '—'}
          </p>
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
          </div>

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
                    <optgroup label="Ratios">
                      {STREAK_METRIC_OPTIONS.filter((m) => m.group === 'ratios').map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Estadísticas">
                      {STREAK_METRIC_OPTIONS.filter((m) => m.group === 'counting').map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="lg:col-span-7 flex items-center gap-3">
                  <div className="inline-flex items-center p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-md shrink-0">
                    <button
                      type="button"
                      onClick={() => setSecondaryOperator('gt')}
                      className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                        secondaryOperator === 'gt' ? 'bg-orange-500 text-slate-950 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      &gt;
                    </button>
                    <button
                      type="button"
                      onClick={() => setSecondaryOperator('gte')}
                      className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                        secondaryOperator === 'gte' ? 'bg-orange-500 text-slate-950 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      ≥
                    </button>
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
                    {secondaryOperator === 'gt' ? '>' : '≥'}{' '}
                    {formatMetricNumber(secondaryThresholdValue, secondaryMetric.step < 1 ? 1 : 0, secondaryMetric.unit)}
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
                  <span>Ratio o estadística a evaluar</span>
                  <MetricInfoTooltip
                    helpKey={activeMetric.helpKey}
                    align="left"
                  />
                </span>
                <span className="text-[11px] font-mono text-orange-400">
                  {activeMetric.group === 'ratios' ? 'Ratio / %' : 'Acumulado'}
                </span>
              </div>
              <select
                value={selectedMetricId}
                onChange={(e) => handleSelectMetric(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500 transition-colors"
              >
                <optgroup label="Ratios y Eficiencia por partido">
                  {STREAK_METRIC_OPTIONS.filter(
                    (m) => m.group === 'ratios'
                  ).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Estadísticas por partido">
                  {STREAK_METRIC_OPTIONS.filter(
                    (m) => m.group === 'counting'
                  ).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Control 2: Quantity Slider (X) + Operator (> X / >= X) */}
            <div className="lg:col-span-5 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="inline-flex items-center gap-2">
                  <span className="text-slate-300 font-medium inline-flex items-center gap-1">
                    <span>Cantidad por partido</span>
                    <MetricInfoTooltip
                      helpKey={activeMetric.helpKey}
                      align="left"
                    />
                  </span>
                  <div className="inline-flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-md">
                    <button
                      type="button"
                      onClick={() => setOperator('gt')}
                      className={`px-2 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap ${
                        operator === 'gt'
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Más de (&gt;)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOperator('gte')}
                      className={`px-2 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap ${
                        operator === 'gte'
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Al menos (≥)
                    </button>
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

      {/* Row 3: Homogeneous Data Grid */}
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
                            <div className="flex items-start gap-2 min-w-0">
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
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-100 whitespace-nowrap">
                              {row.playerName}
                            </div>
                            <div className="text-xs text-slate-400 whitespace-nowrap">
                              {row.teamAbbr} · {row.position} · {row.gamesPlayed}{' '}
                              PJ
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="inline-flex items-center gap-1.5 text-emerald-400 font-medium whitespace-nowrap">
                              <span>
                                ▲ {activeMetric.shortLabel} {operatorSymbol}{' '}
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
                        <div className="flex items-start gap-2 min-w-0">
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
                          <div className="font-medium text-slate-100 whitespace-nowrap">
                            {st.entityName}
                          </div>
                          <div className="text-xs text-slate-400 whitespace-nowrap">
                            {st.subtitle}
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
                        <div className="flex items-start gap-2 min-w-0">
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
                        <div className="font-medium text-slate-100 whitespace-nowrap">
                          {row.entityName}
                        </div>
                        <div className="text-xs text-slate-400 whitespace-nowrap">
                          {row.teamAbbr} · {row.position} · {row.gamesPlayed} PJ ·{' '}
                          {row.minutesAvg} MIN
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
                        {row.hitRate20Pts}% de partidos
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
    </div>
  );
}
