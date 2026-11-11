import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  Columns3,
  Expand,
  Maximize2,
  Minus,
  PanelRight,
  Plus,
  RotateCcw,
  Sliders,
  Star,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import type {
  ExperienceMode,
  PlayerGameLog,
  PlayerInspectorBenchmarkItem,
  PlayerInspectorDossier,
  PlayerSummary,
  RosterPlayerItem,
  SearchPlayerResult,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import {
  computePlayerTakeaways,
  computeTeamTakeaways,
  formatShortDate,
  formatSigned,
  mean,
  round1,
} from '../utils/analytics';
import {
  computePlainPlayerTakeaways,
  computePlainTeamTakeaways,
   type LeagueBenchmarks,
} from '../utils/humanize';
import {
  buildExtendedPlayerBenchmarks,
  computeOwnMetricSpread,
  DEFAULT_PLAYER_LOG_COLUMNS,
  evaluateReferenceComparison,
  formatMetricNumber,
  MAX_PLAYER_LOG_COLUMNS,
  PLAYER_ADVANCED_RADIOGRAPHY_MAP,
  PLAYER_ADVANCED_RADIOGRAPHY_METRICS,
  PLAYER_ANNUAL_TRACKING_MAP,
  PLAYER_GAME_LOG_COLUMNS,
  PLAYER_LOG_COLUMNS_MAP,
  PLAYER_METRICS_MAP,
  PLAYER_PER_GAME_METRICS,
  resolveOwnBaselineSelection,
  resolveSampleSelection,
  type InspectorReferenceMode,
  type OwnBaselineMode,
  type PlayerSamplePreset,
} from '../utils/playerInspectorAnalytics';
import {
  STICKY_THEAD_CLASS,
  sortRows,
  useTableSort,
  type SortPrimitive,
} from '../utils/tableSort';
import {
  MetricInfoTooltip,
  NbaComparisonBar,
  SortableTh,
} from './MetricUiHelpers';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';

type TeamLogSortKey =
  | 'date'
  | 'matchup'
  | 'pointsFor'
  | 'differential'
  | 'oreb'
  | 'fg3m'
  | 'offRtg'
  | 'defRtg'
  | 'netRtg'
  | 'pace'
  | 'efgPct';

function resolvePlayerLogGameSortValue(
  g: PlayerGameLog,
  key: string
): SortPrimitive {
  switch (key) {
    case 'date':
      return g.date;
    case 'opponent':
      return `${g.opponentAbbr} ${g.result}`;
    case 'fg_split':
      return g.fgm * 100 + g.fga;
    case 'fg2_split':
      return (
        Math.max(0, g.fgm - g.fg3m) * 100 + Math.max(0, g.fga - g.fg3a)
      );
    case 'fg3_split':
      return g.fg3m * 100 + g.fg3a;
    case 'ft_split':
      return g.ftm * 100 + g.fta;
    default: {
      const mDef = PLAYER_METRICS_MAP[key];
      if (mDef) return mDef.gameValue(g);
      const colDef = PLAYER_LOG_COLUMNS_MAP[key];
      if (colDef?.numericForTone) return colDef.numericForTone(g);
      if (colDef) {
        const rendered = colDef.renderCell(g);
        const match = rendered.replace(',', '.').match(/[+-]?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : rendered;
      }
      return g.date;
    }
  }
}

const STORAGE_EXTRA_KPIS_KEY = 'radarnba_inspector_extra_kpis_v1';
const STORAGE_EXTRA_ADV_KPIS_KEY = 'radarnba_inspector_extra_adv_kpis_v1';
const STORAGE_LOG_COLS_KEY = 'radarnba_inspector_log_cols_v1';

function loadSavedExtraKpis(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_EXTRA_KPIS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(String)
      .filter(
        (k) =>
          Boolean(PLAYER_METRICS_MAP[k]) &&
          !PLAYER_METRICS_MAP[k].isDefaultBasicKpi
      );
  } catch {
    return [];
  }
}

function loadSavedExtraAdvKpis(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_EXTRA_ADV_KPIS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(String)
      .filter(
        (k) =>
          Boolean(PLAYER_ADVANCED_RADIOGRAPHY_MAP[k]) &&
          !PLAYER_ADVANCED_RADIOGRAPHY_MAP[k].isDefaultCore15
      );
  } catch {
    return [];
  }
}

function loadSavedLogColumns(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_LOG_COLS_KEY);
    if (!raw) return [...DEFAULT_PLAYER_LOG_COLUMNS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_PLAYER_LOG_COLUMNS];
    const valid = parsed
      .map(String)
      .filter((k) => Boolean(PLAYER_LOG_COLUMNS_MAP[k]))
      .slice(0, MAX_PLAYER_LOG_COLUMNS);
    return valid.length > 0 ? valid : [...DEFAULT_PLAYER_LOG_COLUMNS];
  } catch {
    return [...DEFAULT_PLAYER_LOG_COLUMNS];
  }
}

interface EntityInspectorDrawerProps {
  entityType: 'player' | 'team' | null;
  entityId: string | null;
  players: PlayerSummary[];
  teams: TeamSummary[];
  experienceMode: ExperienceMode;
  benchmarks: LeagueBenchmarks;
  onSwitchToAdvanced: () => void;
  windowSize: WindowSize;
  watchlistIds: Set<string>;
  onToggleWatchlist: (entityKey: string) => void;
  onClose: () => void;
  onOpenInComparator: (entityType: 'player' | 'team', entityId: string) => void;
  onSelectRosterPlayer: (item: SearchPlayerResult) => Promise<void>;
}

type TeamChartMetric =
  | 'netRtg'
  | 'offRtg'
  | 'defRtg'
  | 'pace'
  | 'differential';

interface ReferenceSelectorBarProps {
  mode: InspectorReferenceMode;
  onChangeMode: (mode: InspectorReferenceMode) => void;
  ownMode: OwnBaselineMode;
  onChangeOwnMode: (mode: OwnBaselineMode) => void;
  ownCustomK: number;
  maxGames: number;
  onChangeOwnCustomK: (k: number) => void;
  ownShortLabel: string;
  ownLabelOverride?: string;
}

function ReferenceSelectorBar({
  mode,
  onChangeMode,
  ownMode,
  onChangeOwnMode,
  ownCustomK,
  maxGames,
  onChangeOwnCustomK,
  ownLabelOverride,
}: ReferenceSelectorBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
        <button
          type="button"
          onClick={() => onChangeMode('nba')}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            mode === 'nba'
              ? 'bg-orange-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          Media NBA
        </button>
        <button
          type="button"
          onClick={() => onChangeMode('own')}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            mode === 'own'
              ? 'bg-orange-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          {ownLabelOverride || 'Datos propios'}
        </button>
      </div>

      {mode === 'own' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400 whitespace-nowrap">
            frente a:
          </span>
          <div className="relative">
            <select
              aria-label="Rango de datos propios para comparar"
              value={ownMode}
              onChange={(e) =>
                onChangeOwnMode(e.target.value as OwnBaselineMode)
              }
              className="appearance-none bg-[#0B1120] border border-[#283548] hover:border-slate-600 rounded-lg pl-2.5 pr-7 py-1 text-xs text-slate-200 font-medium focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="both_seasons">2025/26 + 2026/27 completa</option>
              <option value="season_2027">Temporada 2026/27</option>
              <option value="season_2026">Temporada 2025/26</option>
              <option value="same_date_2026">Misma fecha 2025/26</option>
              <option value="outside_sample">Resto fuera de muestra</option>
              <option value="custom_last_k">Últimos K partidos propios</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
          </div>

          {ownMode === 'custom_last_k' && (
            <div className="inline-flex items-center gap-1 bg-[#0B1120] border border-[#283548] rounded-lg px-1.5 py-0.5">
              <button
                type="button"
                aria-label="Restar un partido al rango propio"
                onClick={() => onChangeOwnCustomK(Math.max(1, ownCustomK - 1))}
                className="p-0.5 text-slate-400 hover:text-white transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="number"
                min={1}
                max={Math.max(1, maxGames)}
                value={ownCustomK}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n)) {
                    onChangeOwnCustomK(
                      Math.max(1, Math.min(Math.max(1, maxGames), n))
                    );
                  }
                }}
                className="w-10 bg-transparent text-center font-mono tabular-nums text-xs text-orange-300 font-semibold focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 font-mono">PJ</span>
              <button
                type="button"
                aria-label="Sumar un partido al rango propio"
                onClick={() =>
                  onChangeOwnCustomK(
                    Math.min(Math.max(1, maxGames), ownCustomK + 1)
                  )
                }
                className="p-0.5 text-slate-400 hover:text-white transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface InspectorReferenceBarProps {
  value: number;
  refMean: number;
  refSd: number;
  mode: InspectorReferenceMode;
  refSourceShort: string;
  decimals: number;
  suffix: string;
  lowerIsBetter?: boolean;
  signed?: boolean;
  hasRefData?: boolean;
}

function InspectorReferenceBar({
  value,
  refMean,
  refSd,
  mode,
  refSourceShort,
  decimals,
  suffix,
  lowerIsBetter,
  signed,
  hasRefData = true,
}: InspectorReferenceBarProps) {
  const ev = evaluateReferenceComparison(value, refMean, refSd, mode, {
    decimals,
    suffix,
    lowerIsBetter,
    signed,
    hasRefData,
  });

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 text-[11px] mb-1 whitespace-nowrap">
        <span className={`font-medium truncate ${ev.textClass}`}>
          {ev.statusLabel}
          {ev.hasRef ? ` (${ev.deltaFormatted})` : ''}
        </span>
        <span className="font-mono tabular-nums text-slate-400 shrink-0">
          {ev.hasRef ? `${refSourceShort}: ${ev.refFormatted}` : ev.refFormatted}
        </span>
      </div>
      <div className="relative h-1.5 bg-[#0B1120] border border-[#1E293B] rounded overflow-hidden">
        <div
          className={`h-full rounded-l transition-transform duration-150 ${ev.barClass}`}
          style={{ width: `${ev.pct}%` }}
        />
        <div
          title={`${refSourceShort}: ${ev.refFormatted}`}
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-slate-100/80"
        />
      </div>
    </div>
  );
}

export interface MetricPercentileInfo {
  percentile: number;
  label: string;
  deltaVsNba: number;
  nbaMean: number;
  barColorClass: string;
  badgeColorClass: string;
}

export function computePercentileAndDelta(
  val: number,
  allVals: number[],
  nbaMean: number,
  lowerIsBetter = false
): MetricPercentileInfo {
  const validVals = (allVals || []).filter((v) => Number.isFinite(v));
  if (validVals.length === 0 || !Number.isFinite(val)) {
    return {
      percentile: 50,
      label: 'Promedio',
      deltaVsNba: 0,
      nbaMean,
      barColorClass: 'bg-sky-400',
      badgeColorClass: 'text-slate-300 bg-slate-800/80 border-slate-700',
    };
  }

  const deltaVsNba = val - nbaMean;
  const sorted = [...validVals].sort((a, b) => a - b);
  const count = sorted.length;
  let lowerCount = 0;
  for (let i = 0; i < count; i++) {
    if (sorted[i] < val) lowerCount++;
  }
  let pct = Math.round((lowerCount / Math.max(1, count)) * 100);
  pct = Math.max(1, Math.min(99, pct));

  if (lowerIsBetter) {
    pct = 100 - pct;
  }

  let label = `P${pct}`;
  let barColorClass = 'bg-sky-400';
  let badgeColorClass = 'text-sky-300 bg-sky-950/60 border-sky-500/30';

  if (pct >= 95) {
    label = 'Élite (Top 5%)';
    barColorClass = 'bg-emerald-400';
    badgeColorClass = 'text-emerald-300 bg-emerald-950/80 border-emerald-500/40';
  } else if (pct >= 80) {
    label = `Top ${100 - pct}%`;
    barColorClass = 'bg-emerald-500';
    badgeColorClass = 'text-emerald-400 bg-emerald-950/50 border-emerald-500/30';
  } else if (pct >= 60) {
    label = `P${pct} (Sobre media)`;
    barColorClass = 'bg-sky-400';
    badgeColorClass = 'text-sky-300 bg-sky-950/60 border-sky-500/30';
  } else if (pct >= 40) {
    label = `P${pct} (Media)`;
    barColorClass = 'bg-amber-400';
    badgeColorClass = 'text-amber-300 bg-amber-950/50 border-amber-500/30';
  } else if (pct >= 20) {
    label = `P${pct} (Bajo media)`;
    barColorClass = 'bg-orange-400';
    badgeColorClass = 'text-orange-300 bg-orange-950/50 border-orange-500/30';
  } else {
    label = `Inf ${pct}%`;
    barColorClass = 'bg-rose-500';
    badgeColorClass = 'text-rose-300 bg-rose-950/60 border-rose-500/40';
  }

  return {
    percentile: pct,
    label,
    deltaVsNba,
    nbaMean,
    barColorClass,
    badgeColorClass,
  };
}

interface KpiPercentileCardProps {
  label: string;
  value: string;
  numericVal: number;
  allLeagueVals: number[];
  nbaMean: number;
  helpKey?: string;
  decimals?: number;
  suffix?: string;
  signed?: boolean;
  lowerIsBetter?: boolean;
}

function KpiPercentileCard({
  label,
  value,
  numericVal,
  allLeagueVals,
  nbaMean,
  helpKey,
  decimals = 1,
  suffix = '',
  signed = false,
  lowerIsBetter = false,
}: KpiPercentileCardProps) {
  const info = computePercentileAndDelta(
    numericVal,
    allLeagueVals,
    nbaMean,
    lowerIsBetter
  );

  const deltaFormatted = formatMetricNumber(
    info.deltaVsNba,
    decimals,
    suffix,
    true
  );

  return (
    <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5 flex flex-col justify-between space-y-2.5 transition-all hover:border-[#334155] shadow-sm">
      <div className="flex items-center justify-between gap-1.5 text-xs">
        <span className="font-medium text-slate-300 truncate inline-flex items-center gap-1">
          <span>{label}</span>
          {helpKey && (
            <MetricInfoTooltip helpKey={helpKey} iconClassName="w-3.5 h-3.5" align="left" />
          )}
        </span>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold border shrink-0 ${info.badgeColorClass}`}
        >
          {info.label}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-100">
          {value}
        </span>
        <div className="text-right font-mono text-xs tabular-nums">
          <span
            className={
              Math.abs(info.deltaVsNba) < 0.05
                ? 'text-slate-400'
                : (info.deltaVsNba > 0 && !lowerIsBetter) ||
                  (info.deltaVsNba < 0 && lowerIsBetter)
                ? 'text-emerald-400 font-semibold'
                : 'text-rose-400 font-semibold'
            }
          >
            {deltaFormatted}
          </span>
          <span className="text-[10px] text-slate-400 block">vs Media NBA</span>
        </div>
      </div>

      <div className="w-full space-y-1">
        <div className="relative h-1.5 bg-[#0B1120] rounded-full overflow-hidden border border-[#1E293B]">
          <div
            className={`h-full rounded-full transition-all duration-300 ${info.barColorClass}`}
            style={{ width: `${info.percentile}%` }}
          />
        </div>
        <div className="flex justify-between text-[9.5px] text-slate-400 font-mono">
          <span>P0</span>
          <span>Media NBA: {nbaMean.toFixed(decimals)}{suffix}</span>
          <span>P100</span>
        </div>
      </div>
    </div>
  );
}

export function EntityInspectorDrawer({
  entityType,
  entityId,
  players,
  teams,
  experienceMode,
  benchmarks,
  onSwitchToAdvanced,
  windowSize,
  watchlistIds,
  onToggleWatchlist,
  onClose,
  onOpenInComparator,
  onSelectRosterPlayer,
}: EntityInspectorDrawerProps) {
  // Modal layout mode: wide popup (default), fullscreen, or side panel
  const [displayMode, setDisplayMode] =
    useState<'wide' | 'fullscreen' | 'sidebar'>('wide');

  // Top Tab Navigation state
  const [activeInspectorTab, setActiveInspectorTab] = useState<
    'overview' | 'charts' | 'gamelog' | 'roster'
  >('overview');

  useEffect(() => {
    setActiveInspectorTab('overview');
  }, [entityType, entityId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Player Inspector configurable state
  const [samplePreset, setSamplePreset] =
    useState<PlayerSamplePreset>('slider');
  const [sliderCount, setSliderCount] = useState<number>(18);

  const [kpiRefMode, setKpiRefMode] = useState<InspectorReferenceMode>('nba');
  const [advRefMode, setAdvRefMode] = useState<InspectorReferenceMode>('nba');
  const [chartRefMode, setChartRefMode] =
    useState<InspectorReferenceMode>('own');

  const [ownBaselineMode, setOwnBaselineMode] =
    useState<OwnBaselineMode>('both_seasons');
  const [ownCustomK, setOwnCustomK] = useState<number>(25);

  const [extraKpiKeys, setExtraKpiKeys] = useState<string[]>(loadSavedExtraKpis);
  const [showKpiSelector, setShowKpiSelector] = useState(false);

  const [extraAdvKpiKeys, setExtraAdvKpiKeys] = useState<string[]>(
    loadSavedExtraAdvKpis
  );
  const [showAdvKpiSelector, setShowAdvKpiSelector] = useState(false);

  const [pChartMetricKey, setPChartMetricKey] = useState<string>('points');
  const [chartMetricCategory, setChartMetricCategory] = useState<
    'basic' | 'advanced' | 'all'
  >('basic');
  const [chartLayoutMode, setChartLayoutMode] = useState<
    'timeline' | 'parallel'
  >('timeline');
  const [parallelAlign, setParallelAlign] = useState<'opening' | 'recent'>(
    'opening'
  );
  const [hoveredChartIdx, setHoveredChartIdx] = useState<number | null>(null);

  const [selectedLogCols, setSelectedLogCols] =
    useState<string[]>(loadSavedLogColumns);
  const [showColSelector, setShowColSelector] = useState(false);
  const [showAllLogRows, setShowAllLogRows] = useState(false);

  const [dossier, setDossier] = useState<PlayerInspectorDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);

  // Team Inspector state
  const [tMetric, setTMetric] = useState<TeamChartMetric>(
    experienceMode === 'simple' ? 'differential' : 'netRtg'
  );
  const [teamLogMode, setTeamLogMode] = useState<'basic' | 'advanced'>('basic');
  const [roster, setRoster] = useState<RosterPlayerItem[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [loadingPlayerId, setLoadingPlayerId] = useState<string | null>(null);

  const {
    sortKey: pLogSortKey,
    sortAsc: pLogSortAsc,
    toggleSort: togglePLogSort,
  } = useTableSort<string>('date', false, ['opponent', 'turnovers', 'fouls', 'tovRatioEst']);

  const {
    sortKey: tLogSortKey,
    sortAsc: tLogSortAsc,
    toggleSort: toggleTLogSort,
  } = useTableSort<TeamLogSortKey>('date', false, ['matchup', 'defRtg']);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_EXTRA_KPIS_KEY, JSON.stringify(extraKpiKeys));
    } catch {
      // ignore storage errors
    }
  }, [extraKpiKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_EXTRA_ADV_KPIS_KEY,
        JSON.stringify(extraAdvKpiKeys)
      );
    } catch {
      // ignore storage errors
    }
  }, [extraAdvKpiKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_LOG_COLS_KEY,
        JSON.stringify(selectedLogCols)
      );
    } catch {
      // ignore storage errors
    }
  }, [selectedLogCols]);

  useEffect(() => {
    if (experienceMode === 'simple') {
      setTeamLogMode('basic');
      if (tMetric === 'netRtg') {
        setTMetric('differential');
      }
    }
  }, [experienceMode]);

  const basePlayer = useMemo(
    () =>
      entityType === 'player'
        ? players.find((p) => p.id === entityId)
        : undefined,
    [entityType, entityId, players]
  );

  const team = useMemo(
    () =>
      entityType === 'team' && entityId
        ? teams.find(
            (t) =>
              t.id === entityId ||
              t.abbreviation.toUpperCase() === entityId.toUpperCase()
          )
        : undefined,
    [entityType, entityId, teams]
  );

  // Fetch multi-season dossier on player open so all 2025/26 + 2026/27 presets always have 100% of games
  useEffect(() => {
    setHoveredChartIdx(null);
    setShowAllLogRows(false);
    setRoster([]);

    if (entityType !== 'player' || !entityId) {
      setDossier(null);
      setLoadingDossier(false);
      return;
    }

    let active = true;
    setLoadingDossier(true);
    fetch(`/api/nba/player/${entityId}/inspector`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PlayerInspectorDossier | null) => {
        if (active && data && data.player) {
          setDossier(data);
        }
      })
      .catch(() => {
        // Fallback smoothly to basePlayer in client memory
      })
      .finally(() => {
        if (active) setLoadingDossier(false);
      });

    return () => {
      active = false;
    };
  }, [entityType, entityId]);

  useEffect(() => {
    if (entityType !== 'team' || !team || activeInspectorTab !== 'roster') return;
    let active = true;
    setLoadingRoster(true);
    fetch(`/api/nba/team/${team.id}/roster`)
      .then((r) => r.json())
      .then((json) => {
        if (active) setRoster(json.roster || []);
      })
      .catch(() => {
        if (active) setRoster([]);
      })
      .finally(() => {
        if (active) setLoadingRoster(false);
      });
    return () => {
      active = false;
    };
  }, [entityType, team, activeInspectorTab]);

  const player: PlayerSummary | undefined = useMemo(() => {
    if (entityType !== 'player' || !entityId) return undefined;
    if (dossier && dossier.player.id === entityId) {
      return dossier.player;
    }
    return basePlayer;
  }, [entityType, entityId, dossier, basePlayer]);

  const clientExtendedBenchmarks = useMemo(
    () => buildExtendedPlayerBenchmarks(players),
    [players]
  );

  const leaguePlayerStats = useMemo(() => {
    if (!players || players.length === 0) return {};
    return {
      pts: players.map((p) => p.ptsAvg || 0),
      reb: players.map((p) => p.rebAvg || 0),
      ast: players.map((p) => p.astAvg || 0),
      stl: players.map((p) => p.stlAvg || 0),
      blk: players.map((p) => p.blkAvg || 0),
      fg3m: players.map((p) => mean(p.games.map((g) => g.fg3m))),
      fgPct: players.map((p) => p.fgPct || 0),
      fg3Pct: players.map((p) => p.fg3Pct || 0),
      usgEst: players.map((p) => p.usgAvg || 0),
      tsPct: players.map((p) => p.tsPct || 0),
      efgPct: players.map((p) => p.efgPct || 0),
      netRtg: players.map((p) => p.advanced?.netRtg || 0),
    };
  }, [players]);

  const leagueTeamStats = useMemo(() => {
    if (!teams || teams.length === 0) return {};
    return {
      offRtg: teams.map((t) => t.offRtg || 0),
      defRtg: teams.map((t) => t.defRtg || 0),
      netRtg: teams.map((t) => t.netRtg || 0),
      pace: teams.map((t) => t.pace || 0),
      pointsFor: teams.map((t) => t.avgPointsFor || 0),
      pointsAgainst: teams.map((t) => t.avgPointsAgainst || 0),
      differential: teams.map((t) => t.differential || 0),
      winPct: teams.map((t) => t.winPct || 0),
      efgPct: teams.map((t) => t.efgPct || 53.5),
      tovPct: teams.map((t) => t.tovPct || 13.5),
      orebPct: teams.map((t) => t.orebPct || 27.0),
      ftRate: teams.map((t) => t.ftRate || 0.21),
    };
  }, [teams]);

  const isOpen = Boolean(entityType && entityId && (player || team));

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // --- PLAYER ANALYTICS COMPUTATION ---
  const allPlayerGames: PlayerGameLog[] = player ? player.games : [];
  const totalAvailableGames = allPlayerGames.length;
  const count2027 = allPlayerGames.filter(
    (g) => g.seasonLabel === '2026-27'
  ).length;
  const count2026 = allPlayerGames.filter(
    (g) => g.seasonLabel === '2025-26'
  ).length;

  const latestLeagueDate2027 =
    (dossier?.player.id === entityId ? dossier.latestLeagueDate2027 : '') ||
    allPlayerGames.find((g) => g.seasonLabel === '2026-27')?.date ||
    new Date().toISOString().slice(0, 10);

  const effectiveSliderCount = Math.max(
    1,
    Math.min(Math.max(1, totalAvailableGames), sliderCount)
  );

  const sampleSelection = player
    ? resolveSampleSelection(
        allPlayerGames,
        samplePreset,
        effectiveSliderCount,
        latestLeagueDate2027
      )
    : {
        games: [] as PlayerGameLog[],
        titleShort: '',
        subtitle: '',
        benchmarkScope: 'continuous' as const,
        cutoffDateIso: latestLeagueDate2027,
      };

  const sampleGames = sampleSelection.games;

  const ownBaselineSelection = player
    ? resolveOwnBaselineSelection(
        allPlayerGames,
        sampleGames,
        ownBaselineMode,
        ownCustomK,
        latestLeagueDate2027
      )
    : { games: [] as PlayerGameLog[], label: '', shortLabel: '' };

  const activeScopeBenchmarks: Record<string, PlayerInspectorBenchmarkItem> =
    dossier && dossier.player.id === entityId
      ? dossier.benchmarksByScope[sampleSelection.benchmarkScope] ||
        dossier.benchmarksByScope.continuous
      : clientExtendedBenchmarks;

  const handleSelectSamplePreset = (nextPreset: PlayerSamplePreset) => {
    setSamplePreset(nextPreset);
    setHoveredChartIdx(null);
    setShowAllLogRows(false);
    if (nextPreset === 'same_date_compare') {
      // Automatically pair 2026/27 sample up to today against same calendar date in 2025/26
      setOwnBaselineMode('same_date_2026');
      setKpiRefMode('own');
      setAdvRefMode('own');
      setChartRefMode('own');
    }
  };

  // KPIs list = All 15 default basic stats + user-added extra KPIs
  const activeKpiDefs = useMemo(() => {
    const basics = PLAYER_PER_GAME_METRICS.filter((m) => m.isDefaultBasicKpi);
    const extras = extraKpiKeys
      .map((k) => PLAYER_METRICS_MAP[k])
      .filter(Boolean);
    return [...basics, ...extras];
  }, [extraKpiKeys]);

  const addableKpiDefs = useMemo(
    () => PLAYER_PER_GAME_METRICS.filter((m) => !m.isDefaultBasicKpi),
    []
  );

  const activeAdvKpiDefs = useMemo(() => {
    const defaults15 = PLAYER_ADVANCED_RADIOGRAPHY_METRICS.filter(
      (m) => m.isDefaultCore15
    );
    const extras = extraAdvKpiKeys
      .map((k) => PLAYER_ADVANCED_RADIOGRAPHY_MAP[k])
      .filter(Boolean);
    return [...defaults15, ...extras];
  }, [extraAdvKpiKeys]);

  const addableAdvKpiDefs = useMemo(
    () => PLAYER_ADVANCED_RADIOGRAPHY_METRICS.filter((m) => !m.isDefaultCore15),
    []
  );

  // Determine which annual NBA.com tracking profile to show & its warning context
  const trackingContext = (() => {
    if (!player) return null;
    const adv27 =
      dossier?.player.id === entityId
        ? dossier.advanced2027 ??
          (count2027 > 0 ? player.advanced : undefined)
        : player.advanced;
    const adv26 =
      dossier?.player.id === entityId ? dossier.advanced2026 : undefined;

    if (samplePreset === 'season_2026' && adv26) {
      return {
        activeAdv: adv26,
        ownRefAdv: adv27,
        ownRefShort: '26/27 anual',
        seasonTag: '2025/26',
        shortTag: 'Temp. 25/26',
        benchMap:
          dossier?.player.id === entityId
            ? dossier.benchmarksByScope.s2026
            : activeScopeBenchmarks,
        showPartialWarning: false,
      };
    }

    const chosen = adv27 || adv26 || player.advanced;
    const isCurrent27 = Boolean(adv27 || (!adv26 && player.advanced));
    return {
      activeAdv: chosen,
      ownRefAdv: isCurrent27 ? adv26 : adv27,
      ownRefShort: isCurrent27 ? '25/26 anual' : '26/27 anual',
      seasonTag: isCurrent27 ? '2026/27 (en curso)' : '2025/26',
      shortTag: isCurrent27 ? 'Temp. en curso' : 'Temp. 25/26',
      benchMap:
        dossier?.player.id === entityId
          ? isCurrent27
            ? dossier.benchmarksByScope.s2027
            : dossier.benchmarksByScope.s2026
          : activeScopeBenchmarks,
      showPartialWarning: true,
    };
  })();

  // Active Chart Metric Definition & Series
  const activePlayerChartMetric =
    PLAYER_METRICS_MAP[pChartMetricKey] || PLAYER_METRICS_MAP.points;

  const chartData = (() => {
    if (player) {
      const chrono = [...sampleGames].reverse();
      const values = chrono.map((g) => activePlayerChartMetric.gameValue(g));

      let base = 0;
      let baseLabel = '';
      if (chartRefMode === 'nba') {
        const nb = activeScopeBenchmarks[activePlayerChartMetric.key];
        base = nb ? nb.mean : activePlayerChartMetric.fallbackMean;
        baseLabel = `Media NBA (${formatMetricNumber(
          base,
          activePlayerChartMetric.decimals,
          activePlayerChartMetric.suffix,
          activePlayerChartMetric.signed
        )})`;
      } else {
        const refGames =
          ownBaselineSelection.games.length > 0
            ? ownBaselineSelection.games
            : allPlayerGames;
        base =
          refGames.length > 0
            ? activePlayerChartMetric.sliceValue(refGames)
            : 0;
        baseLabel = `Su media habitual · ${
          ownBaselineSelection.shortLabel
        } (${formatMetricNumber(
          base,
          activePlayerChartMetric.decimals,
          activePlayerChartMetric.suffix,
          activePlayerChartMetric.signed
        )})`;
      }

      const pointsMeta = chrono.map((g, idx) => ({
        idx,
        dateLabel: formatShortDate(g.date),
        seasonShort: g.seasonLabel === '2026-27' ? '26/27' : '25/26',
        isCurrentSeason: g.seasonLabel === '2026-27',
        matchupLabel: `${g.isHome ? 'vs' : '@'} ${g.opponentAbbr}`,
        result: g.result,
        minutes: g.minutes,
        value: values[idx],
        formattedValue: formatMetricNumber(
          values[idx],
          activePlayerChartMetric.decimals,
          activePlayerChartMetric.suffix,
          activePlayerChartMetric.signed
        ),
        deltaFormatted: formatMetricNumber(
          values[idx] - base,
          activePlayerChartMetric.decimals,
          activePlayerChartMetric.suffix,
          true
        ),
      }));

      return { values, base, baseLabel, pointsMeta };
    }

    if (team) {
      const recentChrono = [...team.games.slice(0, 18)].reverse();
      const values = recentChrono.map((g) => round1(g[tMetric]));
      const base = round1(mean(team.games.map((g) => g[tMetric])));
      const pointsMeta = recentChrono.map((g, idx) => ({
        idx,
        dateLabel: formatShortDate(g.date),
        seasonShort: g.seasonLabel === '2026-27' ? '26/27' : '25/26',
        isCurrentSeason: g.seasonLabel === '2026-27',
        matchupLabel: `${g.isHome ? 'vs' : '@'} ${g.opponentAbbr}`,
        result: g.result,
        minutes: 48,
        value: values[idx],
        formattedValue: `${values[idx]}`,
        deltaFormatted: formatSigned(values[idx] - base),
      }));
      return {
        values,
        base,
        baseLabel: `Su media habitual (${base.toFixed(1)})`,
        pointsMeta,
      };
    }

    return { values: [], base: 0, baseLabel: '', pointsMeta: [] };
  })();

  const parallelChartData = (() => {
    type ParallelSeriesPoint = {
      slot: number;
      seasonGameNum: number;
      value: number;
      formattedValue: string;
      dateLabel: string;
      matchupLabel: string;
      result: 'W' | 'L';
      minutes: number;
    };

    if (!player) {
      return {
        slotCount: 0,
        series27: [] as ParallelSeriesPoint[],
        series26: [] as ParallelSeriesPoint[],
        bySlot27: new Map<number, ParallelSeriesPoint>(),
        bySlot26: new Map<number, ParallelSeriesPoint>(),
        mean27: null as number | null,
        mean26: null as number | null,
      };
    }

    const chrono27 = allPlayerGames
      .filter((g) => g.seasonLabel === '2026-27')
      .slice()
      .reverse();
    const chrono26 = allPlayerGames
      .filter((g) => g.seasonLabel === '2025-26')
      .slice()
      .reverse();

    const maxEither = Math.max(chrono27.length, chrono26.length);
    let targetSlots = 18;
    if (samplePreset === 'continuous_both' || samplePreset === 'season_2026') {
      targetSlots = Math.max(2, maxEither);
    } else if (
      samplePreset === 'season_2027' ||
      samplePreset === 'same_date_compare'
    ) {
      targetSlots = Math.max(
        2,
        chrono27.length > 1 ? chrono27.length : Math.min(18, maxEither)
      );
    } else {
      targetSlots = Math.max(
        2,
        Math.min(maxEither, Math.max(chrono27.length, effectiveSliderCount))
      );
    }

    const sub27 =
      parallelAlign === 'opening'
        ? chrono27.slice(0, targetSlots)
        : chrono27.slice(Math.max(0, chrono27.length - targetSlots));
    const sub26 =
      parallelAlign === 'opening'
        ? chrono26.slice(0, targetSlots)
        : chrono26.slice(Math.max(0, chrono26.length - targetSlots));

    const slotCount = Math.max(sub27.length, sub26.length);

    const buildSeries = (
      subset: PlayerGameLog[],
      fullSeasonLen: number
    ): ParallelSeriesPoint[] => {
      const slotOffset =
        parallelAlign === 'recent' ? Math.max(0, slotCount - subset.length) : 0;
      const gameNumOffset =
        parallelAlign === 'recent'
          ? Math.max(0, fullSeasonLen - subset.length)
          : 0;
      return subset.map((g, idx) => {
        const val = activePlayerChartMetric.gameValue(g);
        return {
          slot: slotOffset + idx,
          seasonGameNum: gameNumOffset + idx + 1,
          value: val,
          formattedValue: formatMetricNumber(
            val,
            activePlayerChartMetric.decimals,
            activePlayerChartMetric.suffix,
            activePlayerChartMetric.signed
          ),
          dateLabel: formatShortDate(g.date),
          matchupLabel: `${g.isHome ? 'vs' : '@'} ${g.opponentAbbr}`,
          result: g.result,
          minutes: g.minutes,
        };
      });
    };

    const series27 = buildSeries(sub27, chrono27.length);
    const series26 = buildSeries(sub26, chrono26.length);

    const bySlot27 = new Map<number, ParallelSeriesPoint>();
    series27.forEach((p) => bySlot27.set(p.slot, p));
    const bySlot26 = new Map<number, ParallelSeriesPoint>();
    series26.forEach((p) => bySlot26.set(p.slot, p));

    const mean27 =
      sub27.length > 0 ? activePlayerChartMetric.sliceValue(sub27) : null;
    const mean26 =
      sub26.length > 0 ? activePlayerChartMetric.sliceValue(sub26) : null;

    return {
      slotCount,
      series27,
      series26,
      bySlot27,
      bySlot26,
      mean27,
      mean26,
    };
  })();

  const sampleMeans = useMemo(() => {
    if (!player || sampleGames.length === 0) return {} as Record<string, number>;
    const totalFga = sampleGames.reduce((s, g) => s + (g.fga || 0), 0);
    const totalFgm = sampleGames.reduce((s, g) => s + (g.fgm || 0), 0);
    const totalFg3a = sampleGames.reduce((s, g) => s + (g.fg3a || 0), 0);
    const totalFg3m = sampleGames.reduce((s, g) => s + (g.fg3m || 0), 0);
    const totalFta = sampleGames.reduce((s, g) => s + (g.fta || 0), 0);
    const totalPts = sampleGames.reduce((s, g) => s + (g.points || 0), 0);

    return {
      points: mean(sampleGames.map((g) => g.points)),
      rebounds: mean(sampleGames.map((g) => g.rebounds)),
      assists: mean(sampleGames.map((g) => g.assists)),
      steals: mean(sampleGames.map((g) => g.steals)),
      blocks: mean(sampleGames.map((g) => g.blocks)),
      fg3m: mean(sampleGames.map((g) => g.fg3m)),
      fgPct: totalFga > 0 ? (totalFgm / totalFga) * 100 : 0,
      fg3Pct: totalFg3a > 0 ? (totalFg3m / totalFg3a) * 100 : 0,
      usgEst: mean(sampleGames.map((g) => g.usgEst)),
      tsPct: totalFga + 0.44 * totalFta > 0 ? (totalPts / (2 * (totalFga + 0.44 * totalFta))) * 100 : 0,
      efgPct: mean(sampleGames.map((g) => g.efgPct)),
    };
  }, [player, sampleGames]);

  const leaguePlayerMeans = useMemo(() => {
    const stats = leaguePlayerStats;
    return {
      pts: mean(stats.pts || []),
      reb: mean(stats.reb || []),
      ast: mean(stats.ast || []),
      stl: mean(stats.stl || []),
      blk: mean(stats.blk || []),
      fg3m: mean(stats.fg3m || []),
      fgPct: mean(stats.fgPct || []),
      fg3Pct: mean(stats.fg3Pct || []),
      usgEst: mean(stats.usgEst || []),
      tsPct: mean((stats.tsPct || []).filter((v): v is number => v !== undefined)),
      efgPct: mean((stats.efgPct || []).filter((v): v is number => v !== undefined)),
      netRtg: mean((stats.netRtg || []).filter((v): v is number => v !== undefined)),
    };
  }, [leaguePlayerStats]);

  const filteredChartSelectorMetrics = useMemo(() => {
    if (chartMetricCategory === 'all') return PLAYER_PER_GAME_METRICS;
    if (chartMetricCategory === 'advanced') {
      return PLAYER_PER_GAME_METRICS.filter((m) => m.family === 'ratios');
    }
    return PLAYER_PER_GAME_METRICS.filter(
      (m) => m.family === 'basic' || m.family === 'shooting'
    );
  }, [chartMetricCategory]);

  // Dynamic Situational Splits (governed by sampleGames for player)
  const playerContextualSplits = useMemo(() => {
    if (!player) return [];
    const buildSplitCard = (
      title: string,
      subset: PlayerGameLog[],
      showRecord = true
    ) => {
      if (subset.length === 0) {
        return {
          title,
          countLabel: '0 PJ',
          primaryLine: 'Sin partidos en este tramo',
          secondaryLine: '—',
        };
      }
      const wins = subset.filter((g) => g.result === 'W').length;
      const losses = subset.length - wins;
      const pts = PLAYER_METRICS_MAP.points.sliceValue(subset);
      const reb = PLAYER_METRICS_MAP.rebounds.sliceValue(subset);
      const ast = PLAYER_METRICS_MAP.assists.sliceValue(subset);
      const ts = PLAYER_METRICS_MAP.tsPct.sliceValue(subset);
      const pm = PLAYER_METRICS_MAP.plusMinus.sliceValue(subset);

      return {
        title,
        countLabel: showRecord
          ? `${subset.length} PJ · ${wins}-${losses}`
          : `${subset.length} PJ`,
        primaryLine: `${pts.toFixed(1)} PTS · ${reb.toFixed(
          1
        )} REB · ${ast.toFixed(1)} AST`,
        secondaryLine: `${ts.toFixed(1)}% TS · ${formatMetricNumber(
          pm,
          1,
          '',
          true
        )} +/-`,
      };
    };

    return [
      buildSplitCard(
        'En Casa',
        sampleGames.filter((g) => g.isHome),
        true
      ),
      buildSplitCard(
        'Fuera de Casa',
        sampleGames.filter((g) => !g.isHome),
        true
      ),
      buildSplitCard(
        'Con Descanso (≥1d)',
        sampleGames.filter((g) => !g.isBackToBack),
        true
      ),
      buildSplitCard(
        'Back-to-Back (0d)',
        sampleGames.filter((g) => g.isBackToBack),
        true
      ),
      buildSplitCard(
        'En Victorias',
        sampleGames.filter((g) => g.result === 'W'),
        false
      ),
      buildSplitCard(
        'En Derrotas',
        sampleGames.filter((g) => g.result === 'L'),
        false
      ),
    ];
  }, [player, sampleGames]);

  // Takeaways over active sample
  const takeaways = useMemo(() => {
    if (player) {
      const scopedPlayer: PlayerSummary = {
        ...player,
        games: sampleGames.length >= 2 ? sampleGames : allPlayerGames,
      };
      return experienceMode === 'simple'
        ? computePlainPlayerTakeaways(scopedPlayer, windowSize, benchmarks)
        : computePlayerTakeaways(scopedPlayer, windowSize);
    }
    if (team) {
      return experienceMode === 'simple'
        ? computePlainTeamTakeaways(team, windowSize, benchmarks)
        : computeTeamTakeaways(team, windowSize);
    }
    return [];
  }, [player, sampleGames, allPlayerGames, team, experienceMode, windowSize, benchmarks]);

  // --- TEAM INSPECTOR DATA (Preserved intact) ---
  const teamNbaGaugeItems = useMemo(() => {
    if (!team) return [];
    const g = team.games;
    const pace = team.advanced?.pace ?? round1(mean(g.map((x) => x.pace)));
    if (experienceMode === 'simple') {
      return [
        {
          title: 'Puntos anotados (Ataque)',
          helpKey: 'avgPointsFor',
          valueLabel: `${team.avgPointsFor.toFixed(1)} PTS`,
          value: team.avgPointsFor,
          benchmark: benchmarks.team.avgPointsFor,
        },
        {
          title: 'Puntos recibidos (Defensa)',
          helpKey: 'avgPointsAgainst',
          valueLabel: `${team.avgPointsAgainst.toFixed(1)} PTS`,
          value: team.avgPointsAgainst,
          benchmark: benchmarks.team.avgPointsAgainst,
        },
        {
          title: 'Margen medio de puntos',
          helpKey: 'differential',
          valueLabel: `${formatSigned(team.differential)} PTS`,
          value: team.differential,
          benchmark: benchmarks.team.differential,
        },
        {
          title: 'Velocidad de partido',
          helpKey: 'paceSimple',
          valueLabel: `${pace.toFixed(1)} pos`,
          value: pace,
          benchmark: benchmarks.team.pace,
        },
      ];
    }
    const off = team.advanced?.offRtg ?? round1(mean(g.map((x) => x.offRtg)));
    const def = team.advanced?.defRtg ?? round1(mean(g.map((x) => x.defRtg)));
    const net = team.advanced?.netRtg ?? round1(off - def);
    return [
      {
        title: 'Ataque cada 100 pos. (OffRtg)',
        helpKey: 'offRtg',
        valueLabel: off.toFixed(1),
        value: off,
        benchmark: benchmarks.team.offRtg,
      },
      {
        title: 'Defensa cada 100 pos. (DefRtg)',
        helpKey: 'defRtg',
        valueLabel: def.toFixed(1),
        value: def,
        benchmark: benchmarks.team.defRtg,
      },
      {
        title: 'Dominio Neto (NetRtg)',
        helpKey: 'netRtg',
        valueLabel: formatSigned(net),
        value: net,
        benchmark: benchmarks.team.netRtg,
      },
      {
        title: 'Ritmo (Pace pos/48m)',
        helpKey: 'paceSimple',
        valueLabel: pace.toFixed(1),
        value: pace,
        benchmark: benchmarks.team.pace,
      },
    ];
  }, [team, experienceMode, benchmarks]);

  const teamProfileCells = useMemo(() => {
    if (!team) return [];
    const g = team.games;
    const adv = team.advanced;
    const off = adv?.offRtg ?? round1(mean(g.map((x) => x.offRtg)));
    const def = adv?.defRtg ?? round1(mean(g.map((x) => x.defRtg)));
    const net = adv?.netRtg ?? round1(off - def);
    const pace = adv?.pace ?? round1(mean(g.map((x) => x.pace)));
    const efg = adv?.efgPct ?? round1(mean(g.map((x) => x.efgPct)));
    const ts = adv?.tsPct ?? round1(mean(g.map((x) => x.tsPct)));
    const orebP = adv?.orebPct ?? round1(mean(g.map((x) => x.orebPct)));
    const tovP = adv?.tovPct ?? round1(mean(g.map((x) => x.tovPct)));

    return [
      { label: 'Offensive Rating', helpKey: 'offRtg', val: `${off.toFixed(1)}` },
      { label: 'Defensive Rating', helpKey: 'defRtg', val: `${def.toFixed(1)}` },
      { label: 'Net Rating', helpKey: 'netRtg', val: formatSigned(net) },
      { label: 'Pace (Pos/48m)', helpKey: 'paceSimple', val: `${pace.toFixed(1)}` },
      {
        label: '4F: eFG% / TS%',
        helpKey: 'efgPct',
        val: `${efg.toFixed(1)}% / ${ts.toFixed(1)}%`,
      },
      {
        label: '4F: OREB% / TOV%',
        helpKey: 'orebPct',
        val: `${orebP.toFixed(1)}% / ${tovP.toFixed(1)}%`,
      },
      {
        label: 'PTS Pintura (Fav/Riv)',
        helpKey: 'ptsPaint',
        val: adv
          ? `${adv.ptsPaint.toFixed(1)} / ${adv.oppPtsPaint.toFixed(1)}`
          : '—',
      },
      {
        label: 'PTS 2ª Oportunidad',
        helpKey: 'pts2ndChance',
        val: adv ? `${adv.pts2ndChance.toFixed(1)} PTS/PJ` : '—',
      },
      {
        label: 'Contraataque / Tras Pérd.',
        helpKey: 'ptsFastBreak',
        val: adv
          ? `${adv.ptsFastBreak.toFixed(1)} / ${adv.ptsOffTov.toFixed(1)}`
          : '—',
      },
      {
        label: 'Tiros Punteados / PJ',
        helpKey: 'contestedShots',
        val: adv ? `${adv.contestedShots.toFixed(1)}` : '—',
      },
      {
        label: 'Desvíos (Deflections)',
        helpKey: 'deflections',
        val: adv ? `${adv.deflections.toFixed(1)}` : '—',
      },
      {
        label: 'Screen AST / Box-Outs',
        helpKey: 'screenAssists',
        val: adv
          ? `${adv.screenAssists.toFixed(1)} / ${adv.boxOuts.toFixed(1)}`
          : '—',
      },
    ];
  }, [team]);

  const teamSplits = useMemo(() => {
    if (!team) return [];
    const home = team.games.filter((g) => g.isHome);
    const away = team.games.filter((g) => !g.isHome);
    const b2b = team.games.filter((g) => g.isBackToBack);
    const rest = team.games.filter((g) => !g.isBackToBack);
    if (experienceMode === 'simple') {
      return [
        {
          label: `En Casa (${team.homeRecord})`,
          value: home.length
            ? `${formatSigned(mean(home.map((g) => g.differential)))} pts margen`
            : '—',
        },
        {
          label: `Fuera (${team.roadRecord})`,
          value: away.length
            ? `${formatSigned(mean(away.map((g) => g.differential)))} pts margen`
            : '—',
        },
        {
          label: `Con descanso (${rest.length} PJ)`,
          value: rest.length
            ? `${formatSigned(mean(rest.map((g) => g.differential)))} pts margen`
            : '—',
        },
        {
          label: `Sin descanso (${b2b.length} PJ)`,
          value: b2b.length
            ? `${formatSigned(mean(b2b.map((g) => g.differential)))} pts margen`
            : '—',
        },
      ];
    }
    return [
      {
        label: `Casa (${team.homeRecord})`,
        value: home.length
          ? `${formatSigned(mean(home.map((g) => g.netRtg)))} NetRtg`
          : '—',
      },
      {
        label: `Fuera (${team.roadRecord})`,
        value: away.length
          ? `${formatSigned(mean(away.map((g) => g.netRtg)))} NetRtg`
          : '—',
      },
      {
        label: `Descansado (${rest.length} PJ)`,
        value: rest.length
          ? `${formatSigned(mean(rest.map((g) => g.netRtg)))} NetRtg`
          : '—',
      },
      {
        label: `Back-to-Back (${b2b.length} PJ)`,
        value: b2b.length
          ? `${formatSigned(mean(b2b.map((g) => g.netRtg)))} NetRtg`
          : '—',
      },
    ];
  }, [team, experienceMode]);

  if (!entityType || !entityId || (!player && !team)) {
    return null;
  }

  const wKey = `${entityType}:${entityId}`;
  const isWatched = watchlistIds.has(wKey);

  // SVG Geometry for Trend Chart (Timeline & Parallel Season Modes)
  const svgW = 620;
  const svgH = 175;
  const padX = 45;
  const padY = 28;
  const vals = chartData.values;
  const minVal = vals.length ? Math.min(...vals, chartData.base) : 0;
  const maxVal = vals.length ? Math.max(...vals, chartData.base) : 10;
  const rawSpan = maxVal - minVal;
  const span = rawSpan > 0 ? rawSpan : Math.max(1, Math.abs(maxVal) * 0.2 || 2);

  const toX = (i: number) =>
    vals.length <= 1
      ? svgW / 2
      : padX + (i / (vals.length - 1)) * (svgW - padX * 2);
  const toY = (v: number) =>
    svgH - padY - ((v - minVal) / span) * (svgH - padY * 2);

  const baseLineY = toY(chartData.base);

  // Split timeline polyline into contiguous same-season segments (no offseason bridge line)
  const seasonSegments: Array<{
    isCurrentSeason: boolean;
    pointsAttr: string;
    count: number;
  }> = [];
  for (let i = 0; i < vals.length; i++) {
    const isCurr = Boolean(chartData.pointsMeta[i]?.isCurrentSeason);
    const coord = `${toX(i)},${toY(vals[i])}`;
    const prevSeg = seasonSegments[seasonSegments.length - 1];
    if (prevSeg && prevSeg.isCurrentSeason === isCurr) {
      prevSeg.pointsAttr += ` ${coord}`;
      prevSeg.count += 1;
    } else {
      seasonSegments.push({
        isCurrentSeason: isCurr,
        pointsAttr: coord,
        count: 1,
      });
    }
  }

  // Compute exact X coordinates where season changes (e.g. 2025-26 -> 2026-27)
  const seasonTransitions: Array<{
    x: number;
    leftLabel: string;
    rightLabel: string;
    leftCurrent: boolean;
    rightCurrent: boolean;
  }> = [];
  for (let i = 1; i < chartData.pointsMeta.length; i++) {
    const prevMeta = chartData.pointsMeta[i - 1];
    const currMeta = chartData.pointsMeta[i];
    if (prevMeta.isCurrentSeason !== currMeta.isCurrentSeason) {
      seasonTransitions.push({
        x: (toX(i - 1) + toX(i)) / 2,
        leftLabel: prevMeta.seasonShort,
        rightLabel: currMeta.seasonShort,
        leftCurrent: prevMeta.isCurrentSeason,
        rightCurrent: currMeta.isCurrentSeason,
      });
    }
  }

  const sampleCount26 = chartData.pointsMeta.filter(
    (p) => !p.isCurrentSeason
  ).length;
  const sampleCount27 = chartData.pointsMeta.filter(
    (p) => p.isCurrentSeason
  ).length;

  const activePointMeta =
    hoveredChartIdx !== null && chartData.pointsMeta[hoveredChartIdx]
      ? chartData.pointsMeta[hoveredChartIdx]
      : chartData.pointsMeta[chartData.pointsMeta.length - 1] || null;

  // Parallel Mode SVG Geometry (2 seasons sharing the same X-axis)
  const parallelAllValues: number[] = [
    ...parallelChartData.series27.map((p) => p.value),
    ...parallelChartData.series26.map((p) => p.value),
    ...(parallelChartData.mean27 !== null ? [parallelChartData.mean27] : []),
    ...(parallelChartData.mean26 !== null ? [parallelChartData.mean26] : []),
  ];
  const pMinVal = parallelAllValues.length ? Math.min(...parallelAllValues) : 0;
  const pMaxVal = parallelAllValues.length
    ? Math.max(...parallelAllValues)
    : 10;
  const pRawSpan = pMaxVal - pMinVal;
  const pSpan =
    pRawSpan > 0 ? pRawSpan : Math.max(1, Math.abs(pMaxVal) * 0.2 || 2);

  const pToX = (slot: number) =>
    parallelChartData.slotCount <= 1
      ? svgW / 2
      : padX +
        (slot / (parallelChartData.slotCount - 1)) * (svgW - padX * 2);
  const pToY = (v: number) =>
    svgH - padY - ((v - pMinVal) / pSpan) * (svgH - padY * 2);

  const parallelPoints27 = parallelChartData.series27
    .map((p) => `${pToX(p.slot)},${pToY(p.value)}`)
    .join(' ');
  const parallelPoints26 = parallelChartData.series26
    .map((p) => `${pToX(p.slot)},${pToY(p.value)}`)
    .join(' ');

  const defaultParallelSlot =
    parallelAlign === 'opening' && parallelChartData.series27.length > 0
      ? parallelChartData.series27[parallelChartData.series27.length - 1].slot
      : Math.max(0, parallelChartData.slotCount - 1);

  const activeParallelSlot =
    hoveredChartIdx !== null &&
    hoveredChartIdx >= 0 &&
    hoveredChartIdx < parallelChartData.slotCount
      ? hoveredChartIdx
      : defaultParallelSlot;

  const activeParallel27 =
    parallelChartData.bySlot27.get(activeParallelSlot) || null;
  const activeParallel26 =
    parallelChartData.bySlot26.get(activeParallelSlot) || null;

  // Game log active columns & rows
  const activeLogColumnDefs = selectedLogCols
    .map((k) => PLAYER_LOG_COLUMNS_MAP[k])
    .filter(Boolean);

  const recentPlayerGameKeySet = new Set(
    sampleGames.slice(0, windowSize).map((g) => `${g.eventId}-${g.date}`)
  );

  const sortedPlayerLogGames = pLogSortKey
    ? sortRows(
        sampleGames,
        (g) => resolvePlayerLogGameSortValue(g, pLogSortKey),
        pLogSortAsc
      )
    : sampleGames;

  const visiblePlayerLogGames = showAllLogRows
    ? sortedPlayerLogGames
    : sortedPlayerLogGames.slice(0, 35);

  const baseTeamGames = team ? team.games.slice(0, 28) : [];
  const recentTeamEventIdSet = new Set(
    baseTeamGames.slice(0, windowSize).map((g) => g.eventId)
  );
  const sortedTeamLogGames = tLogSortKey
    ? sortRows(
        baseTeamGames,
        (g) => {
          switch (tLogSortKey) {
            case 'date':
              return g.date;
            case 'matchup':
              return `${g.opponentAbbr} ${g.result}`;
            case 'pointsFor':
              return g.pointsFor;
            case 'differential':
              return g.differential;
            case 'oreb':
              return g.oreb * 100 + g.reb;
            case 'fg3m':
              return g.fg3m * 100 + g.fg3a;
            case 'offRtg':
              return g.offRtg;
            case 'defRtg':
              return g.defRtg;
            case 'netRtg':
              return g.netRtg;
            case 'pace':
              return g.pace;
            case 'efgPct':
              return g.efgPct;
            default:
              return g.date;
          }
        },
        tLogSortAsc
      )
    : baseTeamGames;

  const handleToggleLogColumn = (colKey: string) => {
    setSelectedLogCols((prev) => {
      if (prev.includes(colKey)) {
        if (prev.length <= 1) return prev;
        return prev.filter((k) => k !== colKey);
      }
      if (prev.length >= MAX_PLAYER_LOG_COLUMNS) return prev;
      // Preserve logical catalog order
      const nextSet = new Set([...prev, colKey]);
      return PLAYER_GAME_LOG_COLUMNS.filter((c) => nextSet.has(c.key)).map(
        (c) => c.key
      );
    });
  };

  const wrapperClasses =
    displayMode === 'sidebar'
      ? 'fixed inset-0 z-50 flex items-end sm:items-stretch justify-end bg-black/75 backdrop-blur-[3px] p-0 animate-in fade-in duration-200'
      : 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-[3px] p-0 sm:p-3 md:p-5 animate-in fade-in duration-200';

  const containerClasses =
    displayMode === 'fullscreen'
      ? 'relative z-10 w-full h-[95dvh] sm:h-[96vh] sm:max-w-[98vw] bg-[#0F172A] border border-[#1E293B] rounded-t-3xl sm:rounded-2xl overflow-y-auto overscroll-contain flex flex-col shadow-2xl pb-safe transition-all duration-200'
      : displayMode === 'sidebar'
      ? 'relative z-10 w-full sm:max-w-2xl bg-[#0F172A] border-t sm:border-t-0 sm:border-l border-[#1E293B] rounded-t-3xl sm:rounded-none h-[92dvh] sm:h-full overflow-y-auto overscroll-contain flex flex-col shadow-2xl pb-safe transition-all duration-200'
      : 'relative z-10 w-full sm:max-w-5xl md:max-w-6xl xl:max-w-7xl h-[94dvh] sm:h-[90vh] bg-[#0F172A] border border-[#1E293B] rounded-t-3xl sm:rounded-2xl overflow-y-auto overscroll-contain flex flex-col shadow-2xl pb-safe transition-all duration-200';

  return (
    <div className={wrapperClasses}>
      <div className="fixed inset-0 z-0" onClick={onClose} aria-hidden="true" />
      <aside className={containerClasses}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar inspector"
          title="Cerrar ventana"
          className="fixed top-2.5 sm:top-5 right-2.5 sm:right-8 z-[70] min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] p-2 flex items-center justify-center rounded-xl bg-slate-900/60 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none border border-slate-700/50 sm:border-transparent text-slate-400 hover:text-white hover:bg-slate-800/80 active:scale-95 transition-all shadow-lg sm:shadow-none"
        >
          <X className="w-5 h-5 sm:w-5 sm:h-5" />
        </button>
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-[#0F172A]/95 backdrop-blur-md border-b border-[#1E293B] px-4 sm:px-6 pt-2.5 sm:pt-4 pb-3.5 sm:pb-4 space-y-2.5 sm:space-y-0">
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-2 sm:hidden" />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {player ? (
                <PlayerAvatar
                  playerId={player.id}
                  name={player.name}
                  headshotUrl={player.headshotUrl}
                  teamAbbr={player.teamAbbr}
                  showTeamBadge
                  size="lg"
                />
              ) : (
                <TeamLogo
                  abbr={team?.abbreviation}
                  teamId={team?.id}
                  logoUrl={team?.logoUrl}
                  size="lg"
                  framed
                />
              )}
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 truncate">
                  {player ? player.name : team?.name}
                </h2>
                <p className="text-xs text-slate-400 truncate">
                  {player
                    ? `${player.teamName} · ${
                        player.jersey ? `#${player.jersey} · ` : ''
                      }${player.position}${
                        player.height ? ` · ${player.height}` : ''
                      }${player.country ? ` · ${player.country}` : ''} · ${
                        allPlayerGames.length
                      } PJ disponibles${loadingDossier ? ' · sincronizando…' : ''}`
                    : `Conf. ${team?.conference} · Balance ${team?.wins}-${team?.losses} · Racha ${team?.streakCode}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Selector de formato de ventana: Popup Ámplio / Completa / Panel Lateral */}
              <div className="hidden sm:flex items-center bg-[#131C2E] border border-[#1E293B] rounded-lg p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDisplayMode('wide')}
                  title="Modal centrado amplio"
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    displayMode === 'wide'
                      ? 'bg-orange-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-[#182338]'
                  }`}
                >
                  <Expand className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Modal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode('fullscreen')}
                  title="Pantalla completa"
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    displayMode === 'fullscreen'
                      ? 'bg-orange-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-[#182338]'
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Completa</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode('sidebar')}
                  title="Panel lateral"
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    displayMode === 'sidebar'
                      ? 'bg-orange-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-[#182338]'
                  }`}
                >
                  <PanelRight className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Lateral</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => onToggleWatchlist(wKey)}
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isWatched
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                    : 'bg-[#131C2E] border-[#1E293B] text-slate-300 hover:text-white'
                }`}
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    isWatched ? 'fill-orange-400 text-orange-400' : ''
                  }`}
                />
                <span>{isWatched ? 'En seguimiento' : 'Seguir'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenInComparator(entityType, entityId);
                  onClose();
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Comparar tramos</span>
              </button>

            </div>
          </div>


          {/* Mobile Action Row (< sm) */}
          <div className="grid grid-cols-2 gap-1.5 sm:hidden pt-1">
            <button
              type="button"
              onClick={() => onToggleWatchlist(wKey)}
              className={`min-h-[40px] inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                isWatched
                  ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                  : 'bg-[#131C2E] border-[#1E293B] text-slate-200'
              }`}
            >
              <Star
                className={`w-3.5 h-3.5 shrink-0 ${
                  isWatched ? 'fill-orange-400 text-orange-400' : ''
                }`}
              />
              <span>{isWatched ? 'Favorito' : 'Seguir'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenInComparator(entityType, entityId);
                onClose();
              }}
              className="min-h-[40px] inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg active:scale-[0.98] transition-all whitespace-nowrap"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
              <span>Tramos</span>
            </button>
          </div>

          {/* TOP TAB NAVIGATION BAR */}
          <div className="flex items-center gap-1 bg-[#0B1120] px-4 sm:px-6 pt-1 overflow-x-auto scrollbar-none border-t border-[#1E293B]">
            <button
              type="button"
              onClick={() => setActiveInspectorTab('overview')}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeInspectorTab === 'overview'
                  ? 'border-orange-500 text-orange-400 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Resumen & KPIs</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveInspectorTab('charts')}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeInspectorTab === 'charts'
                  ? 'border-orange-500 text-orange-400 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Gráficos & Evolución</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveInspectorTab('gamelog')}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeInspectorTab === 'gamelog'
                  ? 'border-orange-500 text-orange-400 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>
                Historial Partidos ({player ? sampleGames.length : team?.games.length || 0})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveInspectorTab('roster')}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeInspectorTab === 'roster'
                  ? 'border-orange-500 text-orange-400 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{player ? 'Perfil & Trayectoria' : 'Plantilla / Roster'}</span>
            </button>
          </div>

        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* ================================================================ */}
          {/* PLAYER INSPECTOR VIEW                                            */}
          {/* ================================================================ */}
          {player && (
            <>
              {/* TAB 2: GRÁFICOS & EVOLUCIÓN (Jugador) */}
              {activeInspectorTab === 'charts' && (
                <section className="space-y-4">
              {/* SECTION 1 (FIRST): Evolución temporal interactiva (Secuencia continua o 2 líneas paralelas) */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div>
                    <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                      <span>
                        {chartLayoutMode === 'timeline'
                          ? `Evolución en ${sampleSelection.titleShort.toLowerCase()}`
                          : `Evolución comparada 26/27 vs 25/26 (${parallelChartData.slotCount} PJ)`}
                      </span>
                      <MetricInfoTooltip
                        helpKey={activePlayerChartMetric.helpKey}
                        align="left"
                      />
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                      {chartLayoutMode === 'timeline' ? (
                        <>
                          {sampleCount26 > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-block w-3 h-0.5 bg-sky-400" />
                              <span className="w-2 h-2 rounded-full bg-[#082F49] border border-sky-400 -ml-2.5 mr-0.5" />
                              <span className="text-sky-300 font-medium">
                                2025/26
                              </span>
                              <span className="font-mono tabular-nums text-slate-400">
                                ({sampleCount26} PJ)
                              </span>
                            </span>
                          )}
                          {sampleCount27 > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-block w-3 h-0.5 bg-orange-500" />
                              <span className="w-2 h-2 rounded-full bg-orange-500 border border-orange-300 -ml-2.5 mr-0.5" />
                              <span className="text-orange-300 font-medium">
                                2026/27
                              </span>
                              <span className="font-mono tabular-nums text-slate-400">
                                ({sampleCount27} PJ)
                              </span>
                            </span>
                          )}
                          {seasonTransitions.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-slate-400">
                              <span className="inline-block h-3 border-l border-dashed border-slate-400" />
                              <span>Cambio de curso</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-3 h-0.5 bg-orange-500" />
                            <span className="text-orange-300 font-medium">
                              2026/27 ({parallelChartData.series27.length} PJ)
                            </span>
                            {parallelChartData.mean27 !== null && (
                              <span className="font-mono tabular-nums text-slate-400">
                                · Media{' '}
                                {formatMetricNumber(
                                  parallelChartData.mean27,
                                  activePlayerChartMetric.decimals,
                                  activePlayerChartMetric.suffix,
                                  activePlayerChartMetric.signed
                                )}
                              </span>
                            )}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-3 h-0.5 bg-sky-400" />
                            <span className="text-sky-300 font-medium">
                              2025/26 ({parallelChartData.series26.length} PJ)
                            </span>
                            {parallelChartData.mean26 !== null && (
                              <span className="font-mono tabular-nums text-slate-400">
                                · Media{' '}
                                {formatMetricNumber(
                                  parallelChartData.mean26,
                                  activePlayerChartMetric.decimals,
                                  activePlayerChartMetric.suffix,
                                  activePlayerChartMetric.signed
                                )}
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Chart Disposition Switch: Secuencia continua vs 2 líneas en paralelo */}
                  <div className="inline-flex items-center gap-0.5 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setChartLayoutMode('timeline');
                        setHoveredChartIdx(null);
                      }}
                      className={`px-2.5 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                        chartLayoutMode === 'timeline'
                          ? 'bg-[#1E293B] text-slate-100 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Secuencia continua
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChartLayoutMode('parallel');
                        setHoveredChartIdx(null);
                      }}
                      className={`px-2.5 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                        chartLayoutMode === 'parallel'
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      2 líneas (26/27 vs 25/26)
                    </button>
                  </div>
                </div>

                {/* Secondary Reference / Alignment Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {chartLayoutMode === 'timeline' ? (
                    <>
                      <span className="text-[11px] text-slate-400">
                        Línea punteada: {chartData.baseLabel}
                      </span>
                      <ReferenceSelectorBar
                        mode={chartRefMode}
                        onChangeMode={setChartRefMode}
                        ownMode={ownBaselineMode}
                        onChangeOwnMode={setOwnBaselineMode}
                        ownCustomK={ownCustomK}
                        maxGames={totalAvailableGames}
                        onChangeOwnCustomK={setOwnCustomK}
                        ownShortLabel={ownBaselineSelection.shortLabel}
                        ownLabelOverride="Su media habitual"
                      />
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] text-slate-400">
                        Ambas temporadas comparten el mismo eje horizontal de
                        partidos
                      </span>
                      <div className="inline-flex items-center gap-0.5 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-md">
                        <button
                          type="button"
                          onClick={() => {
                            setParallelAlign('opening');
                            setHoveredChartIdx(null);
                          }}
                          className={`px-2 py-1 text-[11px] rounded transition-colors whitespace-nowrap ${
                            parallelAlign === 'opening'
                              ? 'bg-[#1E293B] text-orange-300 font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Mismo inicio (PJ 1→N)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setParallelAlign('recent');
                            setHoveredChartIdx(null);
                          }}
                          className={`px-2 py-1 text-[11px] rounded transition-colors whitespace-nowrap ${
                            parallelAlign === 'recent'
                              ? 'bg-[#1E293B] text-orange-300 font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Últimos PJ de cada curso
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5 space-y-2.5">
                  {/* Live Point / Dual-Season Readout Header */}
                  {chartLayoutMode === 'timeline' ? (
                    activePointMeta &&
                    vals.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-2 border-b border-[#1E293B]">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <span
                            className={`font-mono font-semibold ${
                              activePointMeta.isCurrentSeason
                                ? 'text-orange-300'
                                : 'text-sky-300'
                            }`}
                          >
                            {activePointMeta.seasonShort}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="font-mono text-slate-400">
                            {activePointMeta.dateLabel}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span
                            className={
                              activePointMeta.result === 'W'
                                ? 'text-emerald-400 font-semibold'
                                : 'text-rose-400 font-semibold'
                            }
                          >
                            {activePointMeta.result}
                          </span>
                          <span>{activePointMeta.matchupLabel}</span>
                          <span className="text-slate-600">·</span>
                          <span className="font-mono text-slate-400">
                            {activePointMeta.minutes} MIN
                          </span>
                        </div>

                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <span className="font-semibold text-slate-100">
                            {activePlayerChartMetric.shortLabel}:{' '}
                            {activePointMeta.formattedValue}
                          </span>
                          <span className="text-slate-400">
                            ({activePointMeta.deltaFormatted} vs línea)
                          </span>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-2 border-b border-[#1E293B]">
                      <div className="flex items-center gap-2 font-mono tabular-nums text-slate-300">
                        <span className="font-semibold text-slate-200">
                          Tramo #{activeParallelSlot + 1}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-orange-300">
                          26/27:{' '}
                          {activeParallel27
                            ? `${activeParallel27.formattedValue} (${activeParallel27.dateLabel} ${activeParallel27.matchupLabel})`
                            : 'Sin disputar'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                        <span className="text-sky-300">
                          25/26:{' '}
                          {activeParallel26
                            ? `${activeParallel26.formattedValue} (${activeParallel26.dateLabel} ${activeParallel26.matchupLabel})`
                            : '—'}
                        </span>
                        {activeParallel27 && activeParallel26 && (
                          <>
                            <span className="text-slate-600">·</span>
                            {(() => {
                              const rawDiff =
                                activeParallel27.value - activeParallel26.value;
                              const improved =
                                rawDiff === 0
                                  ? null
                                  : !activePlayerChartMetric.lowerIsBetter
                                  ? rawDiff > 0
                                  : rawDiff < 0;
                              return (
                                <span
                                  className={
                                    improved === null
                                      ? 'text-slate-400'
                                      : improved
                                      ? 'text-emerald-400 font-semibold'
                                      : 'text-rose-400 font-semibold'
                                  }
                                >
                                  Dif:{' '}
                                  {formatMetricNumber(
                                    rawDiff,
                                    activePlayerChartMetric.decimals,
                                    activePlayerChartMetric.suffix,
                                    true
                                  )}
                                </span>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SVG Canvas */}
                  {chartLayoutMode === 'timeline' ? (
                    vals.length > 1 ? (
                      <svg
                        viewBox={`0 0 ${svgW} ${svgH}`}
                        className="w-full h-44 overflow-visible select-none"
                        onMouseLeave={() => setHoveredChartIdx(null)}
                      >
                        {/* Axis Labels */}
                        <text
                          transform={`rotate(-90, 15, ${svgH / 2})`}
                          x={15}
                          y={svgH / 2}
                          textAnchor="middle"
                          className="fill-slate-500 text-[10px] font-bold uppercase tracking-wider"
                        >
                          {activePlayerChartMetric.shortLabel}
                        </text>

                        <text
                          x={svgW / 2}
                          y={svgH - 4}
                          textAnchor="middle"
                          className="fill-slate-500 text-[10px] font-semibold"
                        >
                          Secuencia temporal de partidos (Muestra: {sampleSelection.titleShort})
                        </text>

                        {/* Dotted Reference Line */}
                        <line
                          x1={padX}
                          y1={baseLineY}
                          x2={svgW - padX}
                          y2={baseLineY}
                          stroke="#94A3B8"
                          strokeDasharray="4 4"
                          strokeWidth="1.2"
                        />
                        <text
                          x={svgW - padX}
                          y={Math.max(12, baseLineY - 5)}
                          textAnchor="end"
                          className="fill-slate-400 text-[10px] font-mono"
                        >
                          Ref:{' '}
                          {formatMetricNumber(
                            chartData.base,
                            activePlayerChartMetric.decimals,
                            activePlayerChartMetric.suffix,
                            activePlayerChartMetric.signed
                          )}
                        </text>

                        {/* Vertical Season Separator Lines (25/26 | 26/27) */}
                        {seasonTransitions.map((tr, tIdx) => (
                          <g key={`tr-${tIdx}`} className="pointer-events-none">
                            <line
                              x1={tr.x}
                              y1={8}
                              x2={tr.x}
                              y2={svgH - 8}
                              stroke="#64748B"
                              strokeDasharray="3 3"
                              strokeWidth="1.3"
                            />
                            <text
                              x={tr.x - 5}
                              y={13}
                              textAnchor="end"
                              fill={tr.leftCurrent ? '#FB923C' : '#38BDF8'}
                              className="text-[9.5px] font-mono font-semibold"
                            >
                              {tr.leftLabel}
                            </text>
                            <text
                              x={tr.x + 5}
                              y={13}
                              textAnchor="start"
                              fill={tr.rightCurrent ? '#FB923C' : '#38BDF8'}
                              className="text-[9.5px] font-mono font-semibold"
                            >
                              {tr.rightLabel}
                            </text>
                          </g>
                        ))}

                        {/* Contiguous Same-Season Trend Polylines */}
                        {seasonSegments.map((seg, sIdx) =>
                          seg.count > 1 ? (
                            <polyline
                              key={`seg-${sIdx}`}
                              fill="none"
                              stroke={
                                seg.isCurrentSeason ? '#F97316' : '#38BDF8'
                              }
                              strokeWidth={vals.length > 45 ? '1.6' : '2.2'}
                              points={seg.pointsAttr}
                            />
                          ) : null
                        )}

                        {/* Season-Colored Data Points */}
                        {vals.map((v, i) => {
                          const meta = chartData.pointsMeta[i];
                          const isCurrSeason = Boolean(meta?.isCurrentSeason);
                          const isHovered = hoveredChartIdx === i;
                          const dense = vals.length > 40;
                          const r = isHovered
                            ? 5.5
                            : isCurrSeason
                            ? dense
                              ? 3.3
                              : 4.3
                            : dense
                            ? 2.4
                            : 3.4;

                          const isSeasonBoundary =
                            (i > 0 &&
                              chartData.pointsMeta[i - 1]?.isCurrentSeason !==
                                isCurrSeason) ||
                            (i < vals.length - 1 &&
                              chartData.pointsMeta[i + 1]?.isCurrentSeason !==
                                isCurrSeason);

                          const showValueTag =
                            isHovered ||
                            (!dense &&
                              (i === vals.length - 1 ||
                                i === 0 ||
                                isSeasonBoundary));

                          return (
                            <g
                              key={i}
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredChartIdx(i)}
                              onClick={() => setHoveredChartIdx(i)}
                            >
                              <circle
                                cx={toX(i)}
                                cy={toY(v)}
                                r={10}
                                fill="transparent"
                              />
                              <circle
                                cx={toX(i)}
                                cy={toY(v)}
                                r={r}
                                fill={
                                  isHovered
                                    ? isCurrSeason
                                      ? '#FDBA74'
                                      : '#7DD3FC'
                                    : isCurrSeason
                                    ? '#F97316'
                                    : '#082F49'
                                }
                                stroke={
                                  isHovered
                                    ? '#FFFFFF'
                                    : isCurrSeason
                                    ? '#FDBA74'
                                    : '#38BDF8'
                                }
                                strokeWidth="1.5"
                              />
                              {showValueTag && (
                                <text
                                  x={toX(i)}
                                  y={Math.max(14, toY(v) - 8)}
                                  textAnchor="middle"
                                  className="fill-slate-200 text-[10px] font-mono pointer-events-none"
                                >
                                  {formatMetricNumber(
                                    v,
                                    activePlayerChartMetric.decimals,
                                    '',
                                    activePlayerChartMetric.signed
                                  )}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    ) : (
                      <p className="text-xs text-slate-400 py-8 text-center">
                        Se necesitan al menos 2 partidos en la muestra para
                        trazar la evolución temporal.
                      </p>
                    )
                  ) : parallelChartData.slotCount > 1 ? (
                    <svg
                      viewBox={`0 0 ${svgW} ${svgH}`}
                      className="w-full h-44 overflow-visible select-none"
                      onMouseLeave={() => setHoveredChartIdx(null)}
                    >
                      {/* Axis Labels */}
                      <text
                        transform={`rotate(-90, 15, ${svgH / 2})`}
                        x={15}
                        y={svgH / 2}
                        textAnchor="middle"
                        className="fill-slate-500 text-[10px] font-bold uppercase tracking-wider"
                      >
                        {activePlayerChartMetric.shortLabel}
                      </text>

                      <text
                        x={svgW / 2}
                        y={svgH - 4}
                        textAnchor="middle"
                        className="fill-slate-500 text-[10px] font-semibold"
                      >
                        Comparativa por Tramo de Partidos (26/27 vs 25/26)
                      </text>

                      {/* Dual Season Dashed Mean Lines */}
                      {parallelChartData.mean26 !== null && (
                        <line
                          x1={padX}
                          y1={pToY(parallelChartData.mean26)}
                          x2={svgW - padX}
                          y2={pToY(parallelChartData.mean26)}
                          stroke="#38BDF8"
                          strokeOpacity="0.4"
                          strokeDasharray="4 4"
                          strokeWidth="1.1"
                        />
                      )}
                      {parallelChartData.mean27 !== null && (
                        <line
                          x1={padX}
                          y1={pToY(parallelChartData.mean27)}
                          x2={svgW - padX}
                          y2={pToY(parallelChartData.mean27)}
                          stroke="#F97316"
                          strokeOpacity="0.45"
                          strokeDasharray="4 4"
                          strokeWidth="1.1"
                        />
                      )}

                      {/* Active Slot Vertical Guide */}
                      <line
                        x1={pToX(activeParallelSlot)}
                        y1={10}
                        x2={pToX(activeParallelSlot)}
                        y2={svgH - 16}
                        stroke="#475569"
                        strokeDasharray="2 3"
                        strokeWidth="1"
                      />

                      {/* X-Axis Slot Labels */}
                      <text
                        x={padX}
                        y={svgH - 3}
                        textAnchor="start"
                        className="fill-slate-500 text-[9.5px] font-mono"
                      >
                        PJ 1
                      </text>
                      {parallelChartData.slotCount >= 5 && (
                        <text
                          x={pToX(Math.floor(parallelChartData.slotCount / 2))}
                          y={svgH - 3}
                          textAnchor="middle"
                          className="fill-slate-500 text-[9.5px] font-mono"
                        >
                          PJ {Math.floor(parallelChartData.slotCount / 2) + 1}
                        </text>
                      )}
                      <text
                        x={svgW - padX}
                        y={svgH - 3}
                        textAnchor="end"
                        className="fill-slate-500 text-[9.5px] font-mono"
                      >
                        PJ {parallelChartData.slotCount}
                      </text>

                      {/* 2025/26 Polyline (Sky Blue) */}
                      {parallelChartData.series26.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#38BDF8"
                          strokeOpacity="0.88"
                          strokeWidth={
                            parallelChartData.slotCount > 45 ? '1.5' : '2'
                          }
                          points={parallelPoints26}
                        />
                      )}

                      {/* 2026/27 Polyline (Amber-Orange, foreground) */}
                      {parallelChartData.series27.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#F97316"
                          strokeWidth={
                            parallelChartData.slotCount > 45 ? '1.8' : '2.4'
                          }
                          points={parallelPoints27}
                        />
                      )}

                      {/* 2025/26 Points */}
                      {parallelChartData.series26.map((pt) => {
                        const isActive = pt.slot === activeParallelSlot;
                        const dense = parallelChartData.slotCount > 40;
                        return (
                          <circle
                            key={`p26-${pt.slot}`}
                            cx={pToX(pt.slot)}
                            cy={pToY(pt.value)}
                            r={isActive ? 4.8 : dense ? 2.1 : 3.1}
                            fill={isActive ? '#7DD3FC' : '#082F49'}
                            stroke={isActive ? '#FFFFFF' : '#38BDF8'}
                            strokeWidth="1.4"
                          />
                        );
                      })}

                      {/* 2026/27 Points */}
                      {parallelChartData.series27.map((pt) => {
                        const isActive = pt.slot === activeParallelSlot;
                        const dense = parallelChartData.slotCount > 40;
                        const showLabel =
                          isActive ||
                          (!dense &&
                            pt.slot ===
                              parallelChartData.series27[
                                parallelChartData.series27.length - 1
                              ]?.slot);
                        return (
                          <g key={`p27-${pt.slot}`}>
                            <circle
                              cx={pToX(pt.slot)}
                              cy={pToY(pt.value)}
                              r={isActive ? 5.4 : dense ? 3 : 4}
                              fill={isActive ? '#FDBA74' : '#F97316'}
                              stroke={isActive ? '#FFFFFF' : '#FDBA74'}
                              strokeWidth="1.5"
                            />
                            {showLabel && (
                              <text
                                x={pToX(pt.slot)}
                                y={Math.max(13, pToY(pt.value) - 8)}
                                textAnchor="middle"
                                className="fill-orange-200 text-[10px] font-mono font-semibold pointer-events-none"
                              >
                                {formatMetricNumber(
                                  pt.value,
                                  activePlayerChartMetric.decimals,
                                  '',
                                  activePlayerChartMetric.signed
                                )}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Interactive Hit Columns across all X-Axis Slots */}
                      {Array.from({ length: parallelChartData.slotCount }).map(
                        (_, sIdx) => {
                          const colW =
                            parallelChartData.slotCount <= 1
                              ? svgW
                              : (svgW - padX * 2) /
                                (parallelChartData.slotCount - 1);
                          return (
                            <rect
                              key={`hit-${sIdx}`}
                              x={pToX(sIdx) - colW / 2}
                              y={0}
                              width={Math.max(12, colW)}
                              height={svgH}
                              fill="transparent"
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredChartIdx(sIdx)}
                              onClick={() => setHoveredChartIdx(sIdx)}
                            />
                          );
                        }
                      )}
                    </svg>
                  ) : (
                    <p className="text-xs text-slate-400 py-8 text-center">
                      Se necesitan al menos 2 partidos para comparar la
                      evolución en paralelo.
                    </p>
                  )}

                  {/* Bottom Selectors: Básicas (default) | Avanzadas | Todas */}
                  <div className="pt-2.5 border-t border-[#1E293B] space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-400">
                        Estadística o ratio representado:
                      </span>
                      <div className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-md">
                        {(
                          [
                            { id: 'basic', label: 'Básicas' },
                            { id: 'advanced', label: 'Avanzadas' },
                            { id: 'all', label: 'Todas' },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setChartMetricCategory(tab.id)}
                            className={`px-2.5 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap shrink-0 ${
                              chartMetricCategory === tab.id
                                ? 'bg-[#1E293B] text-orange-300 font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {filteredChartSelectorMetrics.map((m) => {
                        const active = pChartMetricKey === m.key;
                        return (
                          <button
                            key={m.key}
                            type="button"
                            title={m.label}
                            onClick={() => {
                              setPChartMetricKey(m.key);
                              setHoveredChartIdx(null);
                            }}
                            className={`px-2 py-1 text-xs font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
                              active
                                ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                                : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                            }`}
                          >
                            {m.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                    </div>
                  </div>
                </section>
              </section>
            )}

              {/* TAB 1: RESUMEN & KPIS (Jugador) */}
              {activeInspectorTab === 'overview' && (
                <>
                  {/* MASTER FILTER BAR: Configurable Sample Slider + Predefined Ranges */}
              <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-200">
                      Muestra de partidos y rango temporal
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {sampleSelection.subtitle}
                    </p>
                  </div>
                  <div className="font-mono tabular-nums text-xs text-orange-300 font-semibold whitespace-nowrap">
                    {sampleSelection.titleShort}
                  </div>
                </div>

                {/* Slider Control for exact game count */}
                <div className="flex items-center gap-3 pt-0.5">
                  <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                    Nº partidos:
                  </span>
                  <button
                    type="button"
                    aria-label="Restar un partido a la muestra"
                    disabled={totalAvailableGames <= 1}
                    onClick={() => {
                      setSamplePreset('slider');
                      setSliderCount(Math.max(1, effectiveSliderCount - 1));
                    }}
                    className="p-1.5 rounded-md bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white disabled:opacity-40 transition-colors shrink-0"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <input
                    type="range"
                    aria-label="Elegir número de partidos en la muestra"
                    min={1}
                    max={Math.max(1, totalAvailableGames)}
                    value={
                      samplePreset === 'slider'
                        ? effectiveSliderCount
                        : Math.max(1, sampleGames.length || 1)
                    }
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      if (!Number.isNaN(next)) {
                        setSamplePreset('slider');
                        setSliderCount(next);
                        setHoveredChartIdx(null);
                      }
                    }}
                    className="w-full h-1.5 bg-[#0B1120] rounded-lg accent-orange-500 cursor-pointer"
                  />

                  <button
                    type="button"
                    aria-label="Sumar un partido a la muestra"
                    disabled={totalAvailableGames <= 1}
                    onClick={() => {
                      setSamplePreset('slider');
                      setSliderCount(
                        Math.min(totalAvailableGames, effectiveSliderCount + 1)
                      );
                    }}
                    className="p-1.5 rounded-md bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white disabled:opacity-40 transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>

                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-100 min-w-[64px] text-right whitespace-nowrap shrink-0">
                    {samplePreset === 'slider'
                      ? `${effectiveSliderCount} / ${totalAvailableGames}`
                      : `${sampleGames.length} PJ`}
                  </span>
                </div>

                {/* Predefined Range Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#1E293B]">
                  {(
                    [
                      {
                        id: 'slider',
                        label: `Últimos ${effectiveSliderCount} PJ (Slider)`,
                      },
                      {
                        id: 'season_2026',
                        label: `Temporada 2025/26 (${count2026})`,
                      },
                      {
                        id: 'season_2027',
                        label: `Temporada 2026/27 (${count2027})`,
                      },
                      {
                        id: 'continuous_both',
                        label: 'Temporada 2025/26 completa + 2026/27',
                      },
                      {
                        id: 'same_date_compare',
                        label: 'Misma fecha temporada 2025/26 y 2026/27',
                      },
                    ] as const
                  ).map((preset) => {
                    const active = samplePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectSamplePreset(preset.id)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                            : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* DESTACADOS KPIS CON PERCENTILES EN LA LIGA & COMPARATIVE NBA */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>KPIs Principales & Percentiles de la Liga</span>
                      <MetricInfoTooltip helpKey="player_kpi_overview" align="left" />
                    </h3>
                    <p className="text-xs text-slate-400">
                      Promedios en la muestra ({sampleSelection.titleShort}) con posición relativa respecto a toda la NBA
                    </p>
                  </div>
                  <span className="text-xs font-mono text-sky-400 font-semibold px-2.5 py-1 bg-sky-500/10 border border-sky-500/30 rounded-lg">
                    Línea Central = Media NBA
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <KpiPercentileCard
                    label="Puntos (PTS)"
                    value={(sampleMeans.points || 0).toFixed(1)}
                    numericVal={sampleMeans.points || 0}
                    allLeagueVals={leaguePlayerStats.pts || []}
                    nbaMean={leaguePlayerMeans.pts || 12.8}
                    helpKey="pts"
                    decimals={1}
                  />
                  <KpiPercentileCard
                    label="Rebotes (REB)"
                    value={(sampleMeans.rebounds || 0).toFixed(1)}
                    numericVal={sampleMeans.rebounds || 0}
                    allLeagueVals={leaguePlayerStats.reb || []}
                    nbaMean={leaguePlayerMeans.reb || 4.8}
                    helpKey="reb"
                    decimals={1}
                  />
                  <KpiPercentileCard
                    label="Asistencias (AST)"
                    value={(sampleMeans.assists || 0).toFixed(1)}
                    numericVal={sampleMeans.assists || 0}
                    allLeagueVals={leaguePlayerStats.ast || []}
                    nbaMean={leaguePlayerMeans.ast || 2.8}
                    helpKey="ast"
                    decimals={1}
                  />
                  <KpiPercentileCard
                    label="Robos (STL)"
                    value={(sampleMeans.steals || 0).toFixed(1)}
                    numericVal={sampleMeans.steals || 0}
                    allLeagueVals={leaguePlayerStats.stl || []}
                    nbaMean={leaguePlayerMeans.stl || 0.8}
                    helpKey="stl"
                    decimals={1}
                  />
                  <KpiPercentileCard
                    label="Tapones (BLK)"
                    value={(sampleMeans.blocks || 0).toFixed(1)}
                    numericVal={sampleMeans.blocks || 0}
                    allLeagueVals={leaguePlayerStats.blk || []}
                    nbaMean={leaguePlayerMeans.blk || 0.5}
                    helpKey="blk"
                    decimals={1}
                  />
                  <KpiPercentileCard
                    label="Triples (3PM)"
                    value={(sampleMeans.fg3m || 0).toFixed(1)}
                    numericVal={sampleMeans.fg3m || 0}
                    allLeagueVals={leaguePlayerStats.fg3m || []}
                    nbaMean={leaguePlayerMeans.fg3m || 1.4}
                    helpKey="fg3m"
                    decimals={1}
                  />
                  <KpiPercentileCard
                    label="% Tiro (%FG)"
                    value={`${(sampleMeans.fgPct || 0).toFixed(1)}%`}
                    numericVal={sampleMeans.fgPct || 0}
                    allLeagueVals={(leaguePlayerStats.fgPct || []).filter((v): v is number => v !== undefined)}
                    nbaMean={leaguePlayerMeans.fgPct || 46.5}
                    helpKey="fgPct"
                    decimals={1}
                    suffix="%"
                  />
                  <KpiPercentileCard
                    label="% Triples (%3P)"
                    value={`${(sampleMeans.fg3Pct || 0).toFixed(1)}%`}
                    numericVal={sampleMeans.fg3Pct || 0}
                    allLeagueVals={(leaguePlayerStats.fg3Pct || []).filter((v): v is number => v !== undefined)}
                    nbaMean={leaguePlayerMeans.fg3Pct || 35.2}
                    helpKey="fg3Pct"
                    decimals={1}
                    suffix="%"
                  />
                  <KpiPercentileCard
                    label="Uso Estimado (USG%)"
                    value={`${(sampleMeans.usgEst || 0).toFixed(1)}%`}
                    numericVal={sampleMeans.usgEst || 0}
                    allLeagueVals={(leaguePlayerStats.usgEst || []).filter((v): v is number => v !== undefined)}
                    nbaMean={leaguePlayerMeans.usgEst || 19.5}
                    helpKey="usgEst"
                    decimals={1}
                    suffix="%"
                  />
                  <KpiPercentileCard
                    label="True Shooting (TS%)"
                    value={`${(sampleMeans.tsPct || 0).toFixed(1)}%`}
                    numericVal={sampleMeans.tsPct || 0}
                    allLeagueVals={(leaguePlayerStats.tsPct || []).filter((v): v is number => v !== undefined)}
                    nbaMean={leaguePlayerMeans.tsPct || 56.5}
                    helpKey="tsPct"
                    decimals={1}
                    suffix="%"
                  />
                  <KpiPercentileCard
                    label="Eficiencia Tiro (eFG%)"
                    value={`${(sampleMeans.efgPct || 0).toFixed(1)}%`}
                    numericVal={sampleMeans.efgPct || 0}
                    allLeagueVals={(leaguePlayerStats.efgPct || []).filter((v): v is number => v !== undefined)}
                    nbaMean={leaguePlayerMeans.efgPct || 52.0}
                    helpKey="efgPct"
                    decimals={1}
                    suffix="%"
                  />
                  <KpiPercentileCard
                    label="Net Rating (NetRtg)"
                    value={formatMetricNumber(sampleMeans.netRtg || 0, 1, '', true)}
                    numericVal={sampleMeans.netRtg || 0}
                    allLeagueVals={(leaguePlayerStats.netRtg || []).filter((v): v is number => v !== undefined)}
                    nbaMean={leaguePlayerMeans.netRtg || 0.0}
                    helpKey="netRtg"
                    decimals={1}
                    signed
                  />
                </div>
              </section>

              {/* SECTION 1: Nivel comparado (All Basic KPIs + Addable KPIs Selector) */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {kpiRefMode === 'nba'
                        ? 'Nivel comparado frente a la Media de la NBA'
                        : 'Nivel comparado frente a sus Datos propios'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Muestra evaluada: {sampleSelection.titleShort} · Marca
                      blanca central ={' '}
                      {kpiRefMode === 'nba'
                        ? 'promedio rotación NBA'
                        : ownBaselineSelection.shortLabel}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <ReferenceSelectorBar
                      mode={kpiRefMode}
                      onChangeMode={setKpiRefMode}
                      ownMode={ownBaselineMode}
                      onChangeOwnMode={setOwnBaselineMode}
                      ownCustomK={ownCustomK}
                      maxGames={totalAvailableGames}
                      onChangeOwnCustomK={setOwnCustomK}
                      ownShortLabel={ownBaselineSelection.shortLabel}
                    />

                    <button
                      type="button"
                      onClick={() => setShowKpiSelector((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        showKpiSelector || extraKpiKeys.length > 0
                          ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                          : 'bg-[#131C2E] border-[#1E293B] text-slate-200 hover:text-white'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        Añadir KPIs
                        {extraKpiKeys.length > 0
                          ? ` (+${extraKpiKeys.length})`
                          : ''}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Addable KPI Selector Tray */}
                {showKpiSelector && (
                  <div className="bg-[#131C2E] border border-[#283548] rounded-lg p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-200">
                        Selecciona indicadores adicionales de tiro, volumen o
                        ratios para añadir al bloque (las 15 básicas se muestran
                        siempre):
                      </span>
                      {extraKpiKeys.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExtraKpiKeys([])}
                          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Quitar añadidos</span>
                        </button>
                      )}
                    </div>

                    {(
                      [
                        {
                          family: 'shooting' as const,
                          title: 'Volumen y desglose de tiro',
                        },
                        {
                          family: 'ratios' as const,
                          title: 'Ratios, eficiencia y proyecciones por 36 min',
                        },
                      ] as const
                    ).map((grp) => (
                      <div key={grp.family} className="space-y-1.5">
                        <p className="text-[11px] font-medium text-slate-400">
                          {grp.title}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {addableKpiDefs
                            .filter((m) => m.family === grp.family)
                            .map((m) => {
                              const selected = extraKpiKeys.includes(m.key);
                              return (
                                <button
                                  key={m.key}
                                  type="button"
                                  onClick={() =>
                                    setExtraKpiKeys((prev) =>
                                      prev.includes(m.key)
                                        ? prev.filter((k) => k !== m.key)
                                        : [...prev, m.key]
                                    )
                                  }
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                                    selected
                                      ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                                      : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                                  }`}
                                >
                                  {selected && <Check className="w-3 h-3" />}
                                  <span>{m.shortLabel}</span>
                                  <span
                                    className={
                                      selected
                                        ? 'text-slate-900/80'
                                        : 'text-slate-500'
                                    }
                                  >
                                    · {m.label}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {sampleGames.length === 0 ? (
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-6 text-center text-xs text-slate-400">
                    No hay partidos disputados dentro del filtro seleccionado (
                    {sampleSelection.titleShort}). Prueba otro rango o ajusta el
                    deslizador.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y sm:divide-y divide-[#1E293B]">
                    {activeKpiDefs.map((metric) => {
                      const val = metric.sliceValue(sampleGames);
                      const formattedVal = formatMetricNumber(
                        val,
                        metric.decimals,
                        metric.suffix,
                        metric.signed
                      );

                      const nbaBench = activeScopeBenchmarks[metric.key];
                      const hasOwnData = ownBaselineSelection.games.length > 0;
                      const refMean =
                        kpiRefMode === 'nba'
                          ? nbaBench?.mean ?? metric.fallbackMean
                          : hasOwnData
                          ? metric.sliceValue(ownBaselineSelection.games)
                          : NaN;
                      const refSd =
                        kpiRefMode === 'nba'
                          ? nbaBench?.sd ?? metric.fallbackSd
                          : computeOwnMetricSpread(
                              ownBaselineSelection.games,
                              metric
                            );
                      const isCustomExtra = !metric.isDefaultBasicKpi;

                      return (
                        <div
                          key={metric.key}
                          className="p-3.5 space-y-1.5 border-b sm:border-r border-[#1E293B] last:border-b-0"
                        >
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="inline-flex items-center gap-1 text-slate-300 font-medium min-w-0">
                              <span className="truncate">{metric.label}</span>
                              <MetricInfoTooltip
                                helpKey={metric.helpKey}
                                align="left"
                                iconClassName="w-3 h-3"
                              />
                            </span>
                            <div className="inline-flex items-center gap-1.5 shrink-0">
                              <span className="font-mono tabular-nums font-semibold text-slate-100">
                                {formattedVal}
                              </span>
                              {isCustomExtra && (
                                <button
                                  type="button"
                                  title="Quitar este KPI añadido"
                                  onClick={() =>
                                    setExtraKpiKeys((prev) =>
                                      prev.filter((k) => k !== metric.key)
                                    )
                                  }
                                  className="text-slate-500 hover:text-rose-400 transition-colors p-0.5"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <InspectorReferenceBar
                            value={val}
                            refMean={refMean}
                            refSd={refSd}
                            mode={kpiRefMode}
                            refSourceShort={
                              kpiRefMode === 'nba'
                                ? 'Media NBA'
                                : ownBaselineSelection.shortLabel
                            }
                            decimals={metric.decimals}
                            suffix={metric.suffix}
                            lowerIsBetter={metric.lowerIsBetter}
                            signed={metric.signed}
                            hasRefData={kpiRefMode === 'nba' || hasOwnData}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* SECTION 2: Radiografía Avanzada (15 Core KPIs + Añadir KPIs selector) */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Radiografía avanzada
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Muestra evaluada: {sampleSelection.titleShort} · Marca
                      blanca central ={' '}
                      {advRefMode === 'nba'
                        ? 'promedio rotación NBA'
                        : ownBaselineSelection.shortLabel}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <ReferenceSelectorBar
                      mode={advRefMode}
                      onChangeMode={setAdvRefMode}
                      ownMode={ownBaselineMode}
                      onChangeOwnMode={setOwnBaselineMode}
                      ownCustomK={ownCustomK}
                      maxGames={totalAvailableGames}
                      onChangeOwnCustomK={setOwnCustomK}
                      ownShortLabel={ownBaselineSelection.shortLabel}
                    />

                    <button
                      type="button"
                      onClick={() => setShowAdvKpiSelector((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        showAdvKpiSelector || extraAdvKpiKeys.length > 0
                          ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                          : 'bg-[#131C2E] border-[#1E293B] text-slate-200 hover:text-white'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        Añadir KPIs
                        {extraAdvKpiKeys.length > 0
                          ? ` (+${extraAdvKpiKeys.length})`
                          : ''}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Addable Advanced KPI Selector Tray */}
                {showAdvKpiSelector && (
                  <div className="bg-[#131C2E] border border-[#283548] rounded-lg p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-200">
                        Selecciona indicadores avanzados adicionales para añadir
                        al bloque (las 15 principales se muestran siempre):
                      </span>
                      {extraAdvKpiKeys.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExtraAdvKpiKeys([])}
                          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Quitar añadidos</span>
                        </button>
                      )}
                    </div>

                    {(
                      [
                        {
                          group: 'ratios_36' as const,
                          title:
                            'Producción combinada y ritmo por 36 min (recalculados en muestra)',
                        },
                        {
                          group: 'zones_reb' as const,
                          title:
                            'Rebote en pista y anotación por zonas (cámaras NBA.com · dato anual)',
                        },
                        {
                          group: 'hustle' as const,
                          title:
                            'Intangibles defensivos y Hustle (cámaras NBA.com · dato anual)',
                        },
                      ] as const
                    ).map((grp) => (
                      <div key={grp.group} className="space-y-1.5">
                        <p className="text-[11px] font-medium text-slate-400">
                          {grp.title}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {addableAdvKpiDefs
                            .filter((m) => m.addableGroup === grp.group)
                            .map((m) => {
                              const selected = extraAdvKpiKeys.includes(m.key);
                              return (
                                <button
                                  key={m.key}
                                  type="button"
                                  onClick={() =>
                                    setExtraAdvKpiKeys((prev) =>
                                      prev.includes(m.key)
                                        ? prev.filter((k) => k !== m.key)
                                        : [...prev, m.key]
                                    )
                                  }
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                                    selected
                                      ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                                      : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                                  }`}
                                >
                                  {selected && <Check className="w-3 h-3" />}
                                  <span>{m.shortLabel}</span>
                                  <span
                                    className={
                                      selected
                                        ? 'text-slate-900/80'
                                        : 'text-slate-500'
                                    }
                                  >
                                    · {m.label}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {trackingContext && (
                  <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] text-xs text-amber-200/90">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <span className="font-semibold text-amber-300">
                        Aviso sobre métricas de cámaras NBA.com:{' '}
                      </span>
                      Los indicadores etiquetados como{' '}
                      <span className="font-semibold">Dato anual</span> solo
                      disponen del acumulado oficial de la{' '}
                      <span className="font-semibold">
                        temporada {trackingContext.seasonTag}
                      </span>{' '}
                      y no se desglosan partido a partido al mover el deslizador.
                    </p>
                  </div>
                )}

                {sampleGames.length === 0 && !trackingContext?.activeAdv ? (
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-6 text-center text-xs text-slate-400">
                    No hay datos disponibles en el filtro seleccionado (
                    {sampleSelection.titleShort}). Prueba otro rango o ajusta el
                    deslizador.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                    {activeAdvKpiDefs.map((item) => {
                      const isCustomExtra = !item.isDefaultCore15;

                      if (item.source === 'sample_ratio' && item.perGameKey) {
                        const metric = PLAYER_METRICS_MAP[item.perGameKey];
                        const hasSample = sampleGames.length > 0;
                        const val = hasSample
                          ? metric.sliceValue(sampleGames)
                          : 0;
                        const formattedVal = hasSample
                          ? formatMetricNumber(
                              val,
                              metric.decimals,
                              metric.suffix,
                              metric.signed
                            )
                          : '—';
                        const nbaBench = activeScopeBenchmarks[metric.key];
                        const hasOwnData =
                          ownBaselineSelection.games.length > 0;
                        const refMean =
                          advRefMode === 'nba'
                            ? nbaBench?.mean ?? metric.fallbackMean
                            : hasOwnData
                            ? metric.sliceValue(ownBaselineSelection.games)
                            : NaN;
                        const refSd =
                          advRefMode === 'nba'
                            ? nbaBench?.sd ?? metric.fallbackSd
                            : computeOwnMetricSpread(
                                ownBaselineSelection.games,
                                metric
                              );

                        return (
                          <div
                            key={item.key}
                            className="p-3.5 space-y-1.5 border-b sm:border-r border-[#1E293B]"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="inline-flex items-center gap-1 text-slate-300 font-medium min-w-0">
                                <span className="truncate">{metric.label}</span>
                                <MetricInfoTooltip
                                  helpKey={metric.helpKey}
                                  align="left"
                                  iconClassName="w-3 h-3"
                                />
                              </span>
                              <div className="inline-flex items-center gap-1.5 shrink-0">
                                <span className="font-mono tabular-nums font-semibold text-slate-100">
                                  {formattedVal}
                                </span>
                                {isCustomExtra && (
                                  <button
                                    type="button"
                                    title="Quitar este KPI añadido"
                                    onClick={() =>
                                      setExtraAdvKpiKeys((prev) =>
                                        prev.filter((k) => k !== item.key)
                                      )
                                    }
                                    className="text-slate-500 hover:text-rose-400 transition-colors p-0.5"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <InspectorReferenceBar
                              value={val}
                              refMean={refMean}
                              refSd={refSd}
                              mode={advRefMode}
                              refSourceShort={
                                advRefMode === 'nba'
                                  ? 'Media NBA'
                                  : ownBaselineSelection.shortLabel
                              }
                              decimals={metric.decimals}
                              suffix={metric.suffix}
                              lowerIsBetter={metric.lowerIsBetter}
                              signed={metric.signed}
                              hasRefData={
                                hasSample &&
                                (advRefMode === 'nba' || hasOwnData)
                              }
                            />
                          </div>
                        );
                      }

                      // source === 'annual_tracking'
                      const tm =
                        PLAYER_ANNUAL_TRACKING_MAP[String(item.annualKey)];
                      const activeAdv = trackingContext?.activeAdv;
                      const rawVal = activeAdv
                        ? Number(activeAdv[tm.key])
                        : NaN;
                      const hasAdvVal = Number.isFinite(rawVal);
                      const val = hasAdvVal ? rawVal : 0;
                      const formattedVal = hasAdvVal
                        ? formatMetricNumber(
                            val,
                            tm.decimals,
                            tm.suffix,
                            tm.signed
                          )
                        : '—';

                      const nbaBench = trackingContext?.benchMap[tm.key];
                      const ownOtherVal = trackingContext?.ownRefAdv
                        ? Number(trackingContext.ownRefAdv[tm.key])
                        : NaN;
                      const hasOwnAnnual = Number.isFinite(ownOtherVal);

                      const refMean =
                        advRefMode === 'nba'
                          ? nbaBench?.mean ?? tm.fallbackMean
                          : hasOwnAnnual
                          ? ownOtherVal
                          : NaN;
                      const refSd =
                        advRefMode === 'nba'
                          ? nbaBench?.sd ?? tm.fallbackSd
                          : Math.max(
                              0.3,
                              (nbaBench?.sd ?? tm.fallbackSd) * 0.65
                            );

                      return (
                        <div
                          key={item.key}
                          className="p-3.5 space-y-1.5 border-b sm:border-r border-[#1E293B]"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="inline-flex items-center gap-1 text-slate-300 font-medium min-w-0">
                              <span className="truncate">{tm.label}</span>
                              <MetricInfoTooltip
                                helpKey={tm.helpKey}
                                align="left"
                                iconClassName="w-3 h-3"
                              />
                            </span>
                            <div className="inline-flex items-center gap-1.5 shrink-0">
                              <span className="font-mono tabular-nums font-semibold text-slate-100">
                                {formattedVal}
                              </span>
                              {isCustomExtra && (
                                <button
                                  type="button"
                                  title="Quitar este KPI añadido"
                                  onClick={() =>
                                    setExtraAdvKpiKeys((prev) =>
                                      prev.filter((k) => k !== item.key)
                                    )
                                  }
                                  className="text-slate-500 hover:text-rose-400 transition-colors p-0.5"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <InspectorReferenceBar
                            value={val}
                            refMean={refMean}
                            refSd={refSd}
                            mode={advRefMode}
                            refSourceShort={
                              advRefMode === 'nba'
                                ? 'Media NBA'
                                : trackingContext?.ownRefShort || 'Datos propios'
                            }
                            decimals={tm.decimals}
                            suffix={tm.suffix}
                            lowerIsBetter={tm.lowerIsBetter}
                            signed={tm.signed}
                            hasRefData={
                              hasAdvVal &&
                              (advRefMode === 'nba' || hasOwnAnnual)
                            }
                          />

                          {trackingContext && (
                            <div className="text-[10px] text-amber-300/80 flex items-center justify-between">
                              <span>
                                Dato anual · {trackingContext.shortTag}
                              </span>
                              {activeAdv && (
                                <span>{activeAdv.gp} PJ acumulados</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* SECTION 4: Desglose por contexto (Governed by active sample filter) */}
              <section className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                    <span>Desglose por contexto</span>
                    <MetricInfoTooltip helpKey="splitContext" align="left" />
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Calculado sobre {sampleSelection.titleShort}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                  {playerContextualSplits.map((sp, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 border-b sm:border-r border-[#1E293B] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-300">
                          {sp.title}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-400">
                          {sp.countLabel}
                        </span>
                      </div>
                      <p className="text-xs font-semibold font-mono tabular-nums text-slate-100">
                        {sp.primaryLine}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-slate-400">
                        {sp.secondaryLine}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Analytical Takeaways over sample */}
              {takeaways.length > 0 && (
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Lecturas clave del tramo seleccionado
                  </h3>
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y divide-[#1E293B]">
                    {takeaways.map((note, idx) => (
                      <div
                        key={idx}
                        className="px-4 py-3 text-xs text-slate-200 leading-relaxed"
                      >
                        {note}
                      </div>
                    ))}
                  </div>
                </section>
              )}
                </>
              )}

              {/* TAB 3: HISTORIAL DE PARTIDOS (Jugador) */}
              {activeInspectorTab === 'gamelog' && (
                <section className="space-y-4">

              {/* SECTION 5: Registro partido a partido (8 basic defaults + selector up to max 10 cols) */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Registro partido a partido
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {sampleSelection.titleShort} · Elige hasta{' '}
                      {MAX_PLAYER_LOG_COLUMNS} columnas estadísticas simultáneas
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowColSelector((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      showColSelector
                        ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                        : 'bg-[#131C2E] border-[#1E293B] text-slate-200 hover:text-white'
                    }`}
                  >
                    <Columns3 className="w-3.5 h-3.5" />
                    <span>
                      Columnas ({selectedLogCols.length}/{MAX_PLAYER_LOG_COLUMNS})
                    </span>
                  </button>
                </div>

                {/* Column Customizer Panel (Max 10 columns) */}
                {showColSelector && (
                  <div className="bg-[#131C2E] border border-[#283548] rounded-lg p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-200 font-medium">
                        Activa o cambia estadísticas ({selectedLogCols.length} de{' '}
                        {MAX_PLAYER_LOG_COLUMNS} columnas activas):
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedLogCols([...DEFAULT_PLAYER_LOG_COLUMNS])
                          }
                          className="px-2 py-1 text-[11px] bg-[#0B1120] hover:bg-[#1E293B] border border-[#1E293B] rounded text-slate-300 transition-colors whitespace-nowrap"
                        >
                          Básicas por defecto (8)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedLogCols([
                              'minutes',
                              'points',
                              'fg_split',
                              'fgPct',
                              'fg2_split',
                              'fg3_split',
                              'fg3Pct',
                              'ft_split',
                              'ftPct',
                              'tsPct',
                            ])
                          }
                          className="px-2 py-1 text-[11px] bg-[#0B1120] hover:bg-[#1E293B] border border-[#1E293B] rounded text-slate-300 transition-colors whitespace-nowrap"
                        >
                          Perfil Tiro (10)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedLogCols([
                              'minutes',
                              'points',
                              'pra',
                              'usgEst',
                              'tsPct',
                              'efgPct',
                              'gameScore',
                              'astTo',
                              'threePar',
                              'plusMinus',
                            ])
                          }
                          className="px-2 py-1 text-[11px] bg-[#0B1120] hover:bg-[#1E293B] border border-[#1E293B] rounded text-slate-300 transition-colors whitespace-nowrap"
                        >
                          Perfil Ratios (10)
                        </button>
                      </div>
                    </div>

                    {selectedLogCols.length >= MAX_PLAYER_LOG_COLUMNS && (
                      <p className="text-[11px] text-amber-300">
                        Has alcanzado el máximo de {MAX_PLAYER_LOG_COLUMNS}{' '}
                        columnas para conservar una lectura cómoda. Desmarca una
                        columna activa si deseas añadir otra distinta.
                      </p>
                    )}

                    {(
                      [
                        { family: 'basic' as const, title: 'Estadísticas básicas' },
                        { family: 'shooting' as const, title: 'Series y porcentajes de tiro' },
                        { family: 'ratios' as const, title: 'Ratios y eficiencia avanzada' },
                      ] as const
                    ).map((grp) => (
                      <div key={grp.family} className="space-y-1.5">
                        <p className="text-[11px] font-medium text-slate-400">
                          {grp.title}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {PLAYER_GAME_LOG_COLUMNS.filter(
                            (c) => c.family === grp.family
                          ).map((col) => {
                            const active = selectedLogCols.includes(col.key);
                            const blocked =
                              !active &&
                              selectedLogCols.length >= MAX_PLAYER_LOG_COLUMNS;
                            return (
                              <button
                                key={col.key}
                                type="button"
                                disabled={blocked}
                                onClick={() => handleToggleLogColumn(col.key)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
                                  active
                                    ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                                    : blocked
                                    ? 'bg-[#0B1120]/50 border-[#1E293B] text-slate-600 cursor-not-allowed'
                                    : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                                }`}
                              >
                                {active && <Check className="w-3 h-3" />}
                                <span>{col.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-auto max-h-[56vh]">
                  {sampleGames.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      No hay partidos registrados para este filtro de muestra.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className={STICKY_THEAD_CLASS}>
                        <tr className="border-b border-[#1E293B] text-slate-400">
                          <SortableTh
                            label="Fecha"
                            align="left"
                            compact
                            active={pLogSortKey === 'date'}
                            asc={pLogSortAsc}
                            onSort={() => togglePLogSort('date')}
                            className="py-2.5 pl-3 pr-2"
                          />
                          <SortableTh
                            label="Rival"
                            align="left"
                            compact
                            active={pLogSortKey === 'opponent'}
                            asc={pLogSortAsc}
                            onSort={() => togglePLogSort('opponent')}
                            className="py-2.5 px-2"
                          />
                          {activeLogColumnDefs.map((col, idx) => (
                            <SortableTh
                              key={col.key}
                              label={col.label}
                              helpKey={col.helpKey}
                              align="right"
                              compact
                              active={pLogSortKey === col.key}
                              asc={pLogSortAsc}
                              onSort={() => togglePLogSort(col.key)}
                              className={`py-2.5 ${
                                idx === activeLogColumnDefs.length - 1
                                  ? 'pl-2 pr-3'
                                  : 'px-2'
                              }`}
                            />
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E293B] font-mono tabular-nums">
                        {/* Sample Average Row */}
                        <tr className="bg-[#0B1120]/85 text-slate-200 font-semibold">
                          <td
                            colSpan={2}
                            className="py-2 pl-3 pr-2 font-sans text-xs text-orange-300 whitespace-nowrap"
                          >
                            Media muestra ({sampleGames.length} PJ)
                          </td>
                          {activeLogColumnDefs.map((col, idx) => (
                            <td
                              key={col.key}
                              className={`py-2 text-right whitespace-nowrap ${
                                idx === activeLogColumnDefs.length - 1
                                  ? 'pl-2 pr-3'
                                  : 'px-2'
                              }`}
                            >
                              {col.renderAverage(sampleGames)}
                            </td>
                          ))}
                        </tr>

                        {visiblePlayerLogGames.map((g) => (
                          <tr
                            key={`${g.eventId}-${g.date}`}
                            className={
                              recentPlayerGameKeySet.has(`${g.eventId}-${g.date}`)
                                ? 'bg-orange-500/[0.04] hover:bg-[#182338]/70'
                                : 'hover:bg-[#182338]/70'
                            }
                          >
                            <td className="py-2 pl-3 pr-2 text-slate-300 whitespace-nowrap">
                              <span>{formatShortDate(g.date)}</span>
                              {samplePreset === 'continuous_both' && (
                                <span className="text-[10px] text-slate-500 ml-1">
                                  {g.seasonLabel === '2026-27' ? '27' : '26'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2 font-sans text-slate-200 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                <span
                                  className={
                                    g.result === 'W'
                                      ? 'text-emerald-400 font-medium'
                                      : 'text-rose-400 font-medium'
                                  }
                                >
                                  {g.result}
                                </span>
                                <span className="text-slate-500">·</span>
                                {g.teamAbbr && g.teamAbbr !== player.teamAbbr && (
                                  <span className="text-sky-300 font-mono text-[11px]">
                                    {g.teamAbbr}
                                  </span>
                                )}
                                <span className="text-slate-400">
                                  {g.isHome ? 'vs' : '@'}
                                </span>
                                <TeamLogo abbr={g.opponentAbbr} size="xs" />
                                <span>{g.opponentAbbr}</span>
                                {g.isBackToBack && (
                                  <span className="text-amber-400 text-[11px]">
                                    · B2B
                                  </span>
                                )}
                              </span>
                            </td>
                            {activeLogColumnDefs.map((col, cIdx) => {
                              let toneClass = 'text-slate-300';
                              if (col.highlightTone === 'primary') {
                                toneClass = 'font-semibold text-slate-100';
                              } else if (col.highlightTone === 'orange') {
                                toneClass = 'text-orange-300 font-medium';
                              } else if (col.highlightTone === 'emerald') {
                                toneClass = 'text-emerald-300';
                              } else if (
                                col.highlightTone === 'signed' &&
                                col.numericForTone
                              ) {
                                const nv = col.numericForTone(g);
                                toneClass =
                                  nv > 0
                                    ? 'text-emerald-400 font-medium'
                                    : nv < 0
                                    ? 'text-rose-400 font-medium'
                                    : 'text-slate-400';
                              }

                              return (
                                <td
                                  key={col.key}
                                  className={`py-2 text-right whitespace-nowrap ${
                                    cIdx === activeLogColumnDefs.length - 1
                                      ? 'pl-2 pr-3'
                                      : 'px-2'
                                  } ${toneClass}`}
                                >
                                  {col.renderCell(g)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {sampleGames.length > 35 && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowAllLogRows((prev) => !prev)}
                      className="px-4 py-1.5 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] border border-[#1E293B] rounded-lg text-slate-200 transition-colors"
                    >
                      {showAllLogRows
                        ? 'Contraer a los 35 partidos más recientes'
                        : `Mostrar los ${sampleGames.length} partidos completos de la muestra`}
                    </button>
                  </div>
                )}
              </section>
            </section>
          )}

              {/* TAB 4: PERFIL & TRAYECTORIA (Jugador) */}
              {activeInspectorTab === 'roster' && (
                <section className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Bio Card */}
                    <div className="bg-[#131C2E] border border-[#1E293B] rounded-2xl p-5 space-y-4 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-100 border-b border-[#1E293B] pb-2 flex items-center gap-2">
                        <Users className="w-4 h-4 text-orange-400" />
                        <span>Información Biográfica</span>
                      </h3>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs">
                        <div><p className="text-slate-500 font-medium mb-1">Nombre completo</p><p className="text-slate-100 font-bold text-sm">{player.name}</p></div>
                        <div><p className="text-slate-500 font-medium mb-1">Equipo actual</p><p className="text-slate-100 font-bold text-sm flex items-center gap-1.5"><TeamLogo abbr={player.teamAbbr} size="xs" /> {player.teamName}</p></div>
                        <div><p className="text-slate-500 font-medium mb-1">Posición</p><p className="text-slate-100 font-bold text-sm">{player.position}</p></div>
                        <div><p className="text-slate-500 font-medium mb-1">Dorsal</p><p className="text-slate-100 font-bold text-sm">#{player.jersey || '—'}</p></div>
                        <div><p className="text-slate-500 font-medium mb-1">Altura</p><p className="text-slate-100 font-bold text-sm">{player.height || '—'}</p></div>
                        <div><p className="text-slate-500 font-medium mb-1">País</p><p className="text-slate-100 font-bold text-sm">{player.country || '—'}</p></div>
                      </div>
                    </div>

                    {/* Quick Stats Card */}
                    <div className="bg-[#131C2E] border border-[#1E293B] rounded-2xl p-5 space-y-4 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-100 border-b border-[#1E293B] pb-2 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-orange-400" />
                        <span>Resumen Temporada 26/27</span>
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                         <div className="text-center p-2 rounded-xl bg-[#0B1120] border border-[#1E293B]">
                           <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Partidos</span>
                           <span className="text-lg font-bold text-orange-400 font-mono tabular-nums">{count2027}</span>
                         </div>
                         <div className="text-center p-2 rounded-xl bg-[#0B1120] border border-[#1E293B]">
                           <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Minutos</span>
                           <span className="text-lg font-bold text-slate-100 font-mono tabular-nums">{(player.minutesAvg || 0).toFixed(1)}</span>
                         </div>
                         <div className="text-center p-2 rounded-xl bg-[#0B1120] border border-[#1E293B]">
                           <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Puntos</span>
                           <span className="text-lg font-bold text-slate-100 font-mono tabular-nums">{(player.ptsAvg || 0).toFixed(1)}</span>
                         </div>
                      </div>
                    </div>
                  </div>

                  {/* Watchlist Status */}
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded-2xl p-5 space-y-4 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Star className={`w-4 h-4 ${isWatched ? 'text-orange-400 fill-orange-400' : 'text-slate-400'}`} />
                      <span>Estado en Seguimiento</span>
                    </h3>
                    <div className="flex items-center justify-between gap-4 p-4 bg-[#0B1120] rounded-xl border border-[#1E293B]">
                       <div className="flex items-center gap-3">
                         <div className={`p-2 rounded-full ${isWatched ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-500'}`}>
                           <Star className={`w-5 h-5 ${isWatched ? 'fill-orange-400' : ''}`} />
                         </div>
                         <div>
                           <p className="text-sm font-bold text-slate-100">{isWatched ? 'Jugador en Favoritos' : 'No estás siguiendo a este jugador'}</p>
                           <p className="text-xs text-slate-400">{isWatched ? 'Este jugador aparecerá destacado en tus paneles personalizados.' : 'Síguelo para recibir alertas de consistencia y rachas.'}</p>
                         </div>
                       </div>
                       <button
                         type="button"
                         onClick={() => onToggleWatchlist(wKey)}
                         className={`px-4 py-2 text-xs font-bold rounded-lg transition-all border ${isWatched ? 'bg-orange-500 text-slate-950 border-orange-400' : 'bg-transparent border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'}`}
                       >
                         {isWatched ? 'Dejar de seguir' : 'Seguir ahora'}
                       </button>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {/* ================================================================ */}
          {/* TEAM INSPECTOR VIEW                                              */}
          {/* ================================================================ */}
          {team && (
            <>
              {/* TAB 1: RESUMEN & KPIS */}
              {activeInspectorTab === 'overview' && (
                <>
                  {/* FEATURED TEAM KPIS GRID WITH LEAGUE PERCENTILES */}
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                          <span>KPIs Colectivos & Percentiles de la NBA</span>
                          <MetricInfoTooltip helpKey="team_kpi_overview" align="left" />
                        </h3>
                        <p className="text-xs text-slate-400">
                          Estadísticas colectivas comparadas contra las 30 franquicias de la liga
                        </p>
                      </div>
                      <span className="text-xs font-mono text-orange-400 font-semibold px-2.5 py-1 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                        Balance {team.wins}-{team.losses} (Win% {(team.winPct * 100).toFixed(1)}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      <KpiPercentileCard
                        label="Ataque (OffRtg)"
                        value={(team.offRtg || 0).toFixed(1)}
                        numericVal={team.offRtg || 0}
                        allLeagueVals={(leagueTeamStats.offRtg || []).filter((v): v is number => v !== undefined)}
                        nbaMean={114.5}
                        helpKey="offRtg"
                        decimals={1}
                      />
                      <KpiPercentileCard
                        label="Defensa (DefRtg)"
                        value={(team.defRtg || 0).toFixed(1)}
                        numericVal={team.defRtg || 0}
                        allLeagueVals={(leagueTeamStats.defRtg || []).filter((v): v is number => v !== undefined)}
                        nbaMean={114.5}
                        helpKey="defRtg"
                        decimals={1}
                        lowerIsBetter
                      />
                      <KpiPercentileCard
                        label="Net Rating (NetRtg)"
                        value={formatMetricNumber(team.netRtg || 0, 1, '', true)}
                        numericVal={team.netRtg || 0}
                        allLeagueVals={(leagueTeamStats.netRtg || []).filter((v): v is number => v !== undefined)}
                        nbaMean={0.0}
                        helpKey="netRtg"
                        decimals={1}
                        signed
                      />
                      <KpiPercentileCard
                        label="Ritmo (Pace)"
                        value={(team.pace || 0).toFixed(1)}
                        numericVal={team.pace || 0}
                        allLeagueVals={(leagueTeamStats.pace || []).filter((v): v is number => v !== undefined)}
                        nbaMean={98.5}
                        helpKey="pace"
                        decimals={1}
                      />
                      <KpiPercentileCard
                        label="Puntos Favor"
                        value={team.avgPointsFor.toFixed(1)}
                        numericVal={team.avgPointsFor}
                        allLeagueVals={(leagueTeamStats.pointsFor || []).filter((v): v is number => v !== undefined)}
                        nbaMean={114.2}
                        helpKey="avgPointsFor"
                        decimals={1}
                      />
                      <KpiPercentileCard
                        label="Puntos Contra"
                        value={team.avgPointsAgainst.toFixed(1)}
                        numericVal={team.avgPointsAgainst}
                        allLeagueVals={(leagueTeamStats.pointsAgainst || []).filter((v): v is number => v !== undefined)}
                        nbaMean={114.2}
                        helpKey="pointsAgainst"
                        decimals={1}
                        lowerIsBetter
                      />
                      <KpiPercentileCard
                        label="Diferencial"
                        value={formatMetricNumber(team.differential, 1, '', true)}
                        numericVal={team.differential}
                        allLeagueVals={(leagueTeamStats.differential || []).filter((v): v is number => v !== undefined)}
                        nbaMean={0.0}
                        helpKey="differential"
                        decimals={1}
                        signed
                      />
                      <KpiPercentileCard
                        label="% Victorias (Win%)"
                        value={`${(team.winPct * 100).toFixed(1)}%`}
                        numericVal={team.winPct * 100}
                        allLeagueVals={(leagueTeamStats.winPct || []).map((w) => w * 100)}
                        nbaMean={50.0}
                        helpKey="winPct"
                        decimals={1}
                        suffix="%"
                      />
                    </div>
                  </section>

                  {/* DEAN OLIVER 4 FACTORS & POSSESSION EFFICIENCY BLOCK */}
                  <section className="bg-[#131C2E] border border-[#1E293B] rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                          <span>Cuatro Factores de Dean Oliver</span>
                          <MetricInfoTooltip helpKey="four_factors" align="left" />
                        </h3>
                        <p className="text-xs text-slate-400">
                          Los 4 pilares estadísticos que determinan el éxito colectivo en la NBA
                        </p>
                      </div>
                      <span className="text-xs font-mono text-orange-400 font-semibold px-2.5 py-1 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                        Modelo Dean Oliver
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <KpiPercentileCard
                        label="1. Eficiencia Tiro (eFG%)"
                        value={`${(team.efgPct || 0).toFixed(1)}%`}
                        numericVal={team.efgPct || 0}
                        allLeagueVals={(leagueTeamStats.efgPct || []).filter((v): v is number => v !== undefined)}
                        nbaMean={53.5}
                        helpKey="efgPct"
                        decimals={1}
                        suffix="%"
                      />

                      <KpiPercentileCard
                        label="2. Pérdidas (TOV%)"
                        value={`${(team.tovPct || 13.5).toFixed(1)}%`}
                        numericVal={team.tovPct || 13.5}
                        allLeagueVals={(leagueTeamStats.tovPct || []).filter((v): v is number => v !== undefined)}
                        nbaMean={13.5}
                        helpKey="tovPct"
                        decimals={1}
                        suffix="%"
                        lowerIsBetter
                      />

                      <KpiPercentileCard
                        label="3. Reb. Ofensivo (OREB%)"
                        value={`${(team.orebPct || 27.0).toFixed(1)}%`}
                        numericVal={team.orebPct || 27.0}
                        allLeagueVals={(leagueTeamStats.orebPct || []).filter((v): v is number => v !== undefined)}
                        nbaMean={27.0}
                        helpKey="orebPct"
                        decimals={1}
                        suffix="%"
                      />

                      <KpiPercentileCard
                        label="4. Tiros Libres (FT Rate)"
                        value={(team.ftRate || 0.21).toFixed(2)}
                        numericVal={team.ftRate || 0.21}
                        allLeagueVals={(leagueTeamStats.ftRate || []).filter((v): v is number => v !== undefined)}
                        nbaMean={0.21}
                        helpKey="ftRate"
                        decimals={2}
                      />
                    </div>

                    <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                          <span>Eficiencia por 100 Posesiones</span>
                          <MetricInfoTooltip helpKey="netRtg" align="left" />
                        </span>
                        <span className="font-mono text-xs tabular-nums">
                          NetRtg:{' '}
                          <strong className={(team.netRtg || 0) >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {formatSigned(team.netRtg || 0, 1)} pts/100pos
                          </strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                        <div className="bg-[#131C2E] p-3 rounded-lg border border-[#1E293B] flex justify-between items-center">
                          <div>
                            <span className="text-sky-300 font-sans text-xs font-medium block">Eficiencia Ofensiva (OffRtg)</span>
                            <span className="text-[10px] text-slate-400 font-sans">Pts anotados por 100 pos</span>
                          </div>
                          <span className="text-lg font-bold text-slate-100">{(team.offRtg || 0).toFixed(1)}</span>
                        </div>

                        <div className="bg-[#131C2E] p-3 rounded-lg border border-[#1E293B] flex justify-between items-center">
                          <div>
                            <span className="text-rose-300 font-sans text-xs font-medium block">Eficiencia Defensiva (DefRtg)</span>
                            <span className="text-[10px] text-slate-400 font-sans">Pts recibidos por 100 pos (Menor = Mejor)</span>
                          </div>
                          <span className="text-lg font-bold text-slate-100">{(team.defRtg || 0).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">
                        Nivel comparado frente a la Media de la NBA
                      </h3>
                      <span className="text-[11px] text-slate-400">
                        Marca blanca central = promedio NBA
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-[#1E293B]">
                      {teamNbaGaugeItems.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
                              <span>{item.title}</span>
                              <MetricInfoTooltip
                                helpKey={item.helpKey}
                                align="left"
                                iconClassName="w-3 h-3"
                              />
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-slate-100">
                              {item.valueLabel}
                            </span>
                          </div>
                          <NbaComparisonBar
                            value={item.value}
                            benchmark={item.benchmark}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-[#1E293B]">
                      {teamNbaGaugeItems.slice(2, 4).map((item, idx) => (
                        <div key={idx} className="p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
                              <span>{item.title}</span>
                              <MetricInfoTooltip
                                helpKey={item.helpKey}
                                align="left"
                                iconClassName="w-3 h-3"
                              />
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-slate-100">
                              {item.valueLabel}
                            </span>
                          </div>
                          <NbaComparisonBar
                            value={item.value}
                            benchmark={item.benchmark}
                          />
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">
                        {experienceMode === 'simple'
                          ? 'Resumen de su rendimiento colectivo'
                          : 'Radiografía Avanzada, Pintura y Hustle (NBA.com)'}
                      </h3>
                      {experienceMode === 'simple' && (
                        <button
                          type="button"
                          onClick={onSwitchToAdvanced}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] border border-[#1E293B] rounded-md text-orange-400 transition-colors whitespace-nowrap shrink-0"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>Ver 12 métricas avanzadas NBA.com</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y divide-x divide-[#1E293B]">
                      {teamProfileCells.map((cell, idx) => (
                        <div key={idx} className="p-3">
                          <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
                            <span className="truncate">{cell.label}</span>
                            <MetricInfoTooltip
                              helpKey={cell.helpKey}
                              iconClassName="w-3 h-3"
                            />
                          </div>
                          <p className="mt-0.5 text-sm font-semibold font-mono tabular-nums text-slate-100 truncate">
                            {cell.val}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* TAB 2: GRÁFICOS & EVOLUCIÓN */}
              {activeInspectorTab === 'charts' && (
                <>
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                          <span>Evolución en sus últimos {vals.length} partidos</span>
                          <MetricInfoTooltip helpKey={tMetric} align="left" />
                        </h3>
                        <p className="text-xs text-slate-400">
                          Línea punteada: su media habitual ({chartData.base.toFixed(1)})
                          {' · '}
                          <span className="text-sky-300">25/26</span>
                          {' | '}
                          <span className="text-orange-300">26/27</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                        {(
                          [
                            { id: 'netRtg', label: 'NetRtg' },
                            { id: 'offRtg', label: 'OffRtg' },
                            { id: 'defRtg', label: 'DefRtg' },
                            { id: 'pace', label: 'Pace' },
                            { id: 'differential', label: 'DIF' },
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setTMetric(m.id)}
                            className={`px-2 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                              tMetric === m.id
                                ? 'bg-orange-500 text-slate-950 font-semibold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3">
                      {vals.length > 1 ? (
                        <svg
                          viewBox={`0 0 ${svgW} ${svgH}`}
                          className="w-full h-44 overflow-visible select-none"
                        >
                          {/* Axis Labels */}
                          <text
                            transform={`rotate(-90, 15, ${svgH / 2})`}
                            x={15}
                            y={svgH / 2}
                            textAnchor="middle"
                            className="fill-slate-500 text-[10px] font-bold uppercase tracking-wider"
                          >
                            {tMetric === 'differential' ? 'DIF' : tMetric.toUpperCase()}
                          </text>

                          <text
                            x={svgW / 2}
                            y={svgH - 4}
                            textAnchor="middle"
                            className="fill-slate-500 text-[10px] font-semibold"
                          >
                            Historial reciente de partidos
                          </text>

                          <line
                            x1={padX}
                            y1={baseLineY}
                            x2={svgW - padX}
                            y2={baseLineY}
                            stroke="#64748B"
                            strokeDasharray="4 4"
                            strokeWidth="1"
                          />
                          {seasonTransitions.map((tr, tIdx) => (
                            <g key={`t-tr-${tIdx}`}>
                              <line
                                x1={tr.x}
                                y1={8}
                                x2={tr.x}
                                y2={svgH - 8}
                                stroke="#64748B"
                                strokeDasharray="3 3"
                                strokeWidth="1.2"
                              />
                              <text
                                x={tr.x - 5}
                                y={13}
                                textAnchor="end"
                                fill={tr.leftCurrent ? '#FB923C' : '#38BDF8'}
                                className="text-[9.5px] font-mono font-semibold"
                              >
                                {tr.leftLabel}
                              </text>
                              <text
                                x={tr.x + 5}
                                y={13}
                                textAnchor="start"
                                fill={tr.rightCurrent ? '#FB923C' : '#38BDF8'}
                                className="text-[9.5px] font-mono font-semibold"
                              >
                                {tr.rightLabel}
                              </text>
                            </g>
                          ))}
                          {seasonSegments.map((seg, sIdx) =>
                            seg.count > 1 ? (
                              <polyline
                                key={`t-seg-${sIdx}`}
                                fill="none"
                                stroke={seg.isCurrentSeason ? '#F97316' : '#38BDF8'}
                                strokeWidth="2.1"
                                points={seg.pointsAttr}
                              />
                            ) : null
                          )}
                          {vals.map((v, i) => {
                            const isCurrSeason = Boolean(
                              chartData.pointsMeta[i]?.isCurrentSeason
                            );
                            return (
                              <g key={i}>
                                <circle
                                  cx={toX(i)}
                                  cy={toY(v)}
                                  r={isCurrSeason ? 4.2 : 3.2}
                                  fill={isCurrSeason ? '#F97316' : '#082F49'}
                                  stroke={isCurrSeason ? '#FDBA74' : '#38BDF8'}
                                  strokeWidth="1.5"
                                />
                              </g>
                            );
                          })}
                        </svg>
                      ) : (
                        <p className="text-xs text-slate-400 py-8 text-center">
                          Muestra insuficiente para trazar serie temporal.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="space-y-2.5">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Datos a tener en cuenta y contexto analítico
                    </h3>
                    <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y divide-[#1E293B]">
                      {takeaways.map((note, idx) => (
                        <div
                          key={idx}
                          className="px-4 py-3 text-xs text-slate-200 leading-relaxed"
                        >
                          {note}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-2.5">
                    <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                      <span>Desglose por contexto (Localía y Descanso)</span>
                      <MetricInfoTooltip helpKey="splitContext" align="left" />
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-[#1E293B]">
                      {teamSplits.map((sp, idx) => (
                        <div key={idx} className="p-3">
                          <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
                            <span className="truncate">{sp.label}</span>
                            <MetricInfoTooltip
                              helpKey="splitContext"
                              iconClassName="w-3 h-3"
                            />
                          </div>
                          <p className="mt-1 text-xs font-semibold font-mono tabular-nums text-slate-100">
                            {sp.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* TAB 3: HISTORIAL DE PARTIDOS (Equipo) */}
              {activeInspectorTab === 'gamelog' && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Historial completo de partidos
                    </h3>

                    <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                      {(
                        [
                          { id: 'basic', label: 'Básicas' },
                          { id: 'advanced', label: 'Avanzadas' },
                        ] as const
                      ).map((lm) => (
                        <button
                          key={lm.id}
                          type="button"
                          onClick={() => setTeamLogMode(lm.id)}
                          className={`px-2.5 py-1 text-xs font-medium rounded ${
                            teamLogMode === lm.id
                              ? 'bg-[#1E293B] text-orange-400 font-semibold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {lm.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-auto max-h-[56vh]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className={STICKY_THEAD_CLASS}>
                        <tr className="border-b border-[#1E293B] text-slate-400">
                          <SortableTh
                            label="Fecha"
                            align="left"
                            compact
                            active={tLogSortKey === 'date'}
                            asc={tLogSortAsc}
                            onSort={() => toggleTLogSort('date')}
                            className="py-2.5 pl-3 pr-2"
                          />
                          <SortableTh
                            label="Partido"
                            align="left"
                            compact
                            active={tLogSortKey === 'matchup'}
                            asc={tLogSortAsc}
                            onSort={() => toggleTLogSort('matchup')}
                            className="py-2.5 px-2"
                          />
                          {teamLogMode === 'basic' ? (
                            <>
                              <SortableTh
                                label="Marcador"
                                helpKey="avgPointsFor"
                                align="right"
                                compact
                                active={tLogSortKey === 'pointsFor'}
                                asc={tLogSortAsc}
                                onSort={() => toggleTLogSort('pointsFor')}
                                className="py-2.5 px-2"
                              />
                              <SortableTh
                                label="Dif."
                                helpKey="differential"
                                align="right"
                                compact
                                active={tLogSortKey === 'differential'}
                                asc={tLogSortAsc}
                                onSort={() => toggleTLogSort('differential')}
                                className="py-2.5 px-2"
                              />
                              <SortableTh
                                label="OR/REB"
                                helpKey="orebBase"
                                align="right"
                                compact
                                active={tLogSortKey === 'oreb'}
                                asc={tLogSortAsc}
                                onSort={() => toggleTLogSort('oreb')}
                                className="py-2.5 px-2"
                              />
                              <SortableTh
                                label="3PM"
                                helpKey="fg3m"
                                align="right"
                                compact
                                active={tLogSortKey === 'fg3m'}
                                asc={tLogSortAsc}
                                onSort={() => toggleTLogSort('fg3m')}
                                className="py-2.5 pr-3 pl-2"
                              />
                            </>
                          ) : (
                            <>
                              <SortableTh
                                label="OffRtg"
                                helpKey="offRtg"
                                align="right"
                                compact
                                active={tLogSortKey === 'offRtg'}
                                asc={tLogSortAsc}
                                onSort={() => toggleTLogSort('offRtg')}
                                className="py-2.5 px-2"
                              />
                              <SortableTh
                                label="DefRtg"
                                helpKey="defRtg"
                                align="right"
                                compact
                                active={tLogSortKey === 'defRtg'}
                                asc={tLogSortAsc}
                                onSort={() => toggleTLogSort('defRtg')}
                                className="py-2.5 px-2"
                              />
                              <SortableTh
                                label="NetRtg"
                                helpKey="netRtg"
                                align="right"
                                compact
                                active={tLogSortKey === 'netRtg'}
                                asc={tLogSortAsc}
                                onSort={() => toggleTLogSort('netRtg')}
                                className="py-2.5 px-2"
                              />
                              <SortableTh
                                label="Pace"
                                helpKey="paceSimple"
                                align="right"
                                compact
                                active={tLogSortKey === 'pace'}
                                asc={tLogSortAsc}
                                onSort={() => toggleTLogSort('pace')}
                                className="py-2.5 px-2"
                              />
                              <SortableTh
                                label="eFG%"
                                helpKey="efgPct"
                                align="right"
                                compact
                                active={tLogSortKey === 'efgPct'}
                                asc={tLogSortAsc}
                                onSort={() => toggleTLogSort('efgPct')}
                                className="py-2.5 pr-3 pl-2"
                              />
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E293B] font-mono tabular-nums">
                        {sortedTeamLogGames.map((g) => (
                          <tr
                            key={g.eventId}
                            className={
                              recentTeamEventIdSet.has(g.eventId)
                                ? 'bg-orange-500/[0.04]'
                                : undefined
                            }
                          >
                            <td className="py-2 pl-3 pr-2 text-slate-300 whitespace-nowrap">
                              {formatShortDate(g.date)}
                            </td>
                            <td className="py-2 px-2 font-sans text-slate-200 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                <span
                                  className={
                                    g.result === 'W'
                                      ? 'text-emerald-400'
                                      : 'text-rose-400'
                                  }
                                >
                                  {g.result}
                                </span>
                                <span className="text-slate-500">·</span>
                                <span className="text-slate-400">
                                  {g.isHome ? 'vs' : '@'}
                                </span>
                                <TeamLogo abbr={g.opponentAbbr} size="xs" />
                                <span>{g.opponentAbbr}</span>
                                {g.isBackToBack && (
                                  <span className="text-amber-400">· B2B</span>
                                )}
                              </span>
                            </td>
                            {teamLogMode === 'basic' ? (
                              <>
                                <td className="py-2 px-2 text-right text-slate-100 whitespace-nowrap">
                                  {g.pointsFor}-{g.pointsAgainst}
                                </td>
                                <td
                                  className={`py-2 px-2 text-right font-semibold ${
                                    g.differential >= 0
                                      ? 'text-emerald-400'
                                      : 'text-rose-400'
                                  }`}
                                >
                                  {formatSigned(g.differential, 0)}
                                </td>
                                <td className="py-2 px-2 text-right text-slate-300 whitespace-nowrap">
                                  {g.oreb}/{g.reb}
                                </td>
                                <td className="py-2 pr-3 pl-2 text-right text-slate-400 whitespace-nowrap">
                                  {g.fg3m}-{g.fg3a}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="py-2 px-2 text-right text-slate-200">
                                  {g.offRtg.toFixed(1)}
                                </td>
                                <td className="py-2 px-2 text-right text-slate-300">
                                  {g.defRtg.toFixed(1)}
                                </td>
                                <td
                                  className={`py-2 px-2 text-right font-semibold ${
                                    g.netRtg >= 0
                                      ? 'text-emerald-400'
                                      : 'text-rose-400'
                                  }`}
                                >
                                  {formatSigned(g.netRtg, 1)}
                                </td>
                                <td className="py-2 px-2 text-right text-slate-300">
                                  {g.pace.toFixed(1)}
                                </td>
                                <td className="py-2 pr-3 pl-2 text-right text-orange-300">
                                  {g.efgPct.toFixed(1)}%
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* TAB 4: PLANTILLA (Equipo) */}
              {activeInspectorTab === 'roster' && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Plantilla oficial NBA.com de {team.name}
                  </h3>
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
                    {loadingRoster ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Cargando plantilla...
                      </div>
                    ) : roster.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No se pudo cargar la plantilla.
                      </div>
                    ) : (
                      <div className="divide-y divide-[#1E293B]">
                        {roster.map((rp) => (
                          <div
                            key={rp.id}
                            className="px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#182338] transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <PlayerAvatar
                                playerId={rp.id}
                                name={rp.name}
                                teamAbbr={team.abbreviation}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-100 truncate">
                                  {rp.name}
                                </div>
                                <div className="text-xs text-slate-400 truncate">
                                  #{rp.jersey} · {rp.position}
                                  {rp.height ? ` · ${rp.height}` : ''}
                                  {rp.country ? ` · ${rp.country}` : ''}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={loadingPlayerId === rp.id}
                              onClick={async () => {
                                setLoadingPlayerId(rp.id);
                                try {
                                  await onSelectRosterPlayer({
                                    id: rp.id,
                                    name: rp.name,
                                    teamAbbr: team.abbreviation,
                                    position: rp.position,
                                  });
                                } finally {
                                  setLoadingPlayerId(null);
                                }
                              }}
                              className="min-h-[38px] sm:min-h-0 px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-orange-500 hover:text-slate-950 border border-[#283548] rounded-lg sm:rounded-md text-slate-200 transition-colors whitespace-nowrap shrink-0"
                            >
                              {loadingPlayerId === rp.id
                                ? 'Cargando...'
                                : 'Analizar'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
