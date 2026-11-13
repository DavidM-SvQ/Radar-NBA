import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Eye, EyeOff, Flame, Search, Sliders, Trophy } from 'lucide-react';
import type {
  ExperienceMode,
  MilestoneComparisonMode,
  MilestonesPayload,
  PlayerSummary,
  SeasonLeaderHolder,
  SingleGamePerformance,
  TeamSummary,
} from '../types/nba';
import { formatShortDate, formatSigned, normalizeSearchText } from '../utils/analytics';
import { MetricInfoTooltip, SortableTh } from './MetricUiHelpers';
import {
  STICKY_THEAD_CLASS,
  sortRows,
  useTableSort,
} from '../utils/tableSort';
import { EntityBadge, PlayerAvatar, TeamLogo } from './NbaVisuals';
import { UnifiedEntityFilterBar } from './UnifiedEntityFilterBar';
import {
  DEFAULT_UNIFIED_FILTERS,
  buildEntityLookupContext,
  hasActiveUnifiedFilters,
  matchesEntityUnifiedFilters,
  type UnifiedTableFiltersState,
} from '../utils/entityFilters';

interface SeasonMilestonesViewProps {
  data: MilestonesPayload | null;
  loading: boolean;
  errorMsg: string | null;
  players?: PlayerSummary[];
  teams?: TeamSummary[];
  experienceMode: ExperienceMode;
  onSwitchToAdvanced: () => void;
  onRetry: () => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
}

export function SeasonMilestonesView({
  data,
  loading,
  errorMsg,
  players = [],
  teams = [],
  experienceMode,
  onSwitchToAdvanced,
  onRetry,
  onInspectEntity,
}: SeasonMilestonesViewProps) {
  const [compMode, setCompMode] = useState<MilestoneComparisonMode>('full_season');
  const [showCurSeasonCol, setShowCurSeasonCol] = useState(true);
  const [showPrevSeasonCol, setShowPrevSeasonCol] = useState(true);
  const [globalLayer, setGlobalLayer] = useState<'all' | 'basic' | 'advanced'>(
    experienceMode === 'simple' ? 'basic' : 'all'
  );
  const [sgCategory, setSgCategory] = useState<'all' | 'player' | 'team'>('all');
  const [sgSubGroup, setSgSubGroup] = useState<
    'all' | 'scoring' | 'playmaking_reb' | 'defense' | 'impact'
  >('all');
  const [leaderGroup, setLeaderGroup] = useState<
    | 'all'
    | 'shooting_scoring'
    | 'rebounding'
    | 'playmaking_allaround'
    | 'defense_discipline'
    | 'advanced_hustle'
    | 'team_leaders'
  >('all');
  const [leaderStatMode, setLeaderStatMode] = useState<
    'all' | 'averages' | 'totals'
  >('all');
  const [query, setQuery] = useState('');
  const [unifiedFilters, setUnifiedFilters] = useState<UnifiedTableFiltersState>(
    DEFAULT_UNIFIED_FILTERS
  );

  const {
    sortKey: macroSortKey,
    sortAsc: macroSortAsc,
    toggleSort: toggleMacroSort,
  } = useTableSort<'label' | 'cur' | 'prev' | 'diff' | 'pct'>(null, false, [
    'label',
  ]);

  const {
    sortKey: sgSortKey,
    sortAsc: sgSortAsc,
    toggleSort: toggleSgSort,
  } = useTableSort<'metric' | 'cur' | 'prev' | 'comp'>(null, false, [
    'metric',
  ]);

  const {
    sortKey: leadSortKey,
    sortAsc: leadSortAsc,
    toggleSort: toggleLeadSort,
  } = useTableSort<'metric' | 'cur' | 'prev' | 'diff'>(null, false, [
    'metric',
  ]);

  useEffect(() => {
    setGlobalLayer(experienceMode === 'simple' ? 'basic' : 'all');
  }, [experienceMode]);

  const toggleCurSeasonCol = () => {
    if (showCurSeasonCol && !showPrevSeasonCol) {
      setShowCurSeasonCol(false);
      setShowPrevSeasonCol(true);
    } else {
      setShowCurSeasonCol((prev) => !prev);
    }
  };

  const togglePrevSeasonCol = () => {
    if (showPrevSeasonCol && !showCurSeasonCol) {
      setShowPrevSeasonCol(false);
      setShowCurSeasonCol(true);
    } else {
      setShowPrevSeasonCol((prev) => !prev);
    }
  };

  const bothColsVisible = showCurSeasonCol && showPrevSeasonCol;

  const qNorm = normalizeSearchText(query);
  const entityLookup = useMemo(
    () => buildEntityLookupContext(players, teams),
    [players, teams]
  );
  const unifiedActive = hasActiveUnifiedFilters(unifiedFilters, 'mixed');

  const filteredSingleGame = useMemo(() => {
    const records = data?.singleGameRecords ?? [];
    return records.filter((item) => {
      if (sgCategory !== 'all' && item.category !== sgCategory) return false;
      if (sgSubGroup !== 'all' && item.subGroup && item.subGroup !== sgSubGroup)
        return false;
      const refPerf =
        compMode === 'same_opening' ? item.prev2026Opening : item.prev2026Full;
      if (unifiedActive) {
        const curMatch = item.current2027
          ? matchesEntityUnifiedFilters(
              {
                entityType: item.category,
                id: item.current2027.entityId,
                entityId: item.current2027.entityId,
                teamAbbr: item.current2027.teamAbbr,
              },
              unifiedFilters,
              entityLookup
            )
          : false;
        const prevMatch = refPerf
          ? matchesEntityUnifiedFilters(
              {
                entityType: item.category,
                id: refPerf.entityId,
                entityId: refPerf.entityId,
                teamAbbr: refPerf.teamAbbr,
              },
              unifiedFilters,
              entityLookup
            )
          : false;
        if (!curMatch && !prevMatch) return false;
      }
      if (!qNorm) return true;
      const hay = normalizeSearchText(
        `${item.metricLabel} ${item.current2027?.entityName || ''} ${
          item.current2027?.teamAbbr || ''
        } ${refPerf?.entityName || ''} ${refPerf?.teamAbbr || ''}`
      );
      return hay.includes(qNorm);
    });
  }, [
    data?.singleGameRecords,
    sgCategory,
    sgSubGroup,
    qNorm,
    compMode,
    unifiedActive,
    unifiedFilters,
    entityLookup,
  ]);

  const baseSeasonLeaders = useMemo(() => {
    const leaders = data?.seasonLeaders ?? [];
    if (compMode === 'head_to_head') {
      return leaders.filter((x) => !x.isCumulativeTotal);
    }
    if (leaderStatMode === 'averages') {
      return leaders.filter((x) => !x.isCumulativeTotal);
    }
    if (leaderStatMode === 'totals') {
      return leaders.filter((x) => Boolean(x.isCumulativeTotal));
    }
    return leaders;
  }, [data?.seasonLeaders, compMode, leaderStatMode]);

  const filteredSeasonLeaders = useMemo(() => {
    return baseSeasonLeaders.filter((item) => {
      if (leaderGroup !== 'all' && item.group !== leaderGroup) return false;
      const refHold =
        compMode === 'same_opening' ? item.prev2026Opening : item.prev2026Full;
      if (unifiedActive) {
        const curMatch = item.current2027
          ? matchesEntityUnifiedFilters(
              {
                entityType: item.entityType,
                id: item.current2027.entityId,
                entityId: item.current2027.entityId,
                teamAbbr: item.current2027.teamAbbr,
              },
              unifiedFilters,
              entityLookup
            )
          : false;
        const prevMatch = refHold
          ? matchesEntityUnifiedFilters(
              {
                entityType: item.entityType,
                id: refHold.entityId,
                entityId: refHold.entityId,
                teamAbbr: refHold.teamAbbr,
              },
              unifiedFilters,
              entityLookup
            )
          : false;
        if (!curMatch && !prevMatch) return false;
      }
      if (!qNorm) return true;
      const hay = normalizeSearchText(
        `${item.metricLabel} ${item.current2027?.entityName || ''} ${
          item.current2027?.teamAbbr || ''
        } ${refHold?.entityName || ''} ${refHold?.teamAbbr || ''}`
      );
      return hay.includes(qNorm);
    });
  }, [
    baseSeasonLeaders,
    leaderGroup,
    qNorm,
    compMode,
    unifiedActive,
    unifiedFilters,
    entityLookup,
  ]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-3 space-y-1.5 animate-pulse">
              <div className="h-3 w-24 bg-[#1E293B] rounded" />
              <div className="h-6 w-16 bg-[#1E293B] rounded" />
              <div className="h-3 w-28 bg-[#1E293B] rounded" />
            </div>
          ))}
        </div>
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y divide-[#1E293B]">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-9 px-3 flex items-center justify-between gap-4 animate-pulse"
            >
              <div className="h-3 w-44 bg-[#1E293B] rounded" />
              <div className="h-3 w-28 bg-[#1E293B] rounded" />
              <div className="h-3 w-28 bg-[#1E293B] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="bg-[#131C2E] border border-rose-500/40 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-rose-300">
            No se pudieron cargar los hitos comparativos de ambas temporadas
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {errorMsg || 'Intenta actualizar de nuevo en unos segundos.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap shrink-0"
        >
          Reintentar carga
        </button>
      </div>
    );
  }

  const refGlobal =
    compMode === 'same_opening' ? data.global2026Opening : data.global2026Full;
  const curGlobal = data.global2027;

  const refShortHeader =
    compMode === 'same_opening'
      ? `2025-26 (${data.openingGamesPerTeam} PJ)`
      : '2025-26 (82 PJ)';

  const globalRows: Array<{
    id: string;
    label: string;
    cur: number;
    prev: number;
    unit: string;
    layer: 'basic' | 'advanced';
    lowerIsBetter?: boolean;
  }> = [
    {
      id: 'ppg',
      label: 'Puntos por equipo y partido',
      cur: curGlobal.avgTeamPoints,
      prev: refGlobal.avgTeamPoints,
      unit: 'PTS',
      layer: 'basic',
    },
    {
      id: 'tot',
      label: 'Marcador combinado medio por encuentro',
      cur: curGlobal.avgTotalGamePoints,
      prev: refGlobal.avgTotalGamePoints,
      unit: 'PTS',
      layer: 'basic',
    },
    {
      id: 'margin',
      label: 'Margen medio de victoria por partido NBA',
      cur: curGlobal.avgMargin,
      prev: refGlobal.avgMargin,
      unit: 'PTS',
      layer: 'basic',
    },
    {
      id: 'pace',
      label: 'Ritmo medio de juego NBA (Pace — posesiones/48m)',
      cur: curGlobal.avgPace,
      prev: refGlobal.avgPace,
      unit: 'POS',
      layer: 'advanced',
    },
    {
      id: 'offrtg',
      label: 'Eficiencia Ofensiva media NBA (OffRtg — PTS/100 pos)',
      cur: curGlobal.avgOffRtg,
      prev: refGlobal.avgOffRtg,
      unit: 'RTG',
      layer: 'advanced',
    },
    {
      id: 'efg',
      label: 'Tiro de Campo Efectivo medio NBA (eFG%)',
      cur: curGlobal.avgEfgPct,
      prev: refGlobal.avgEfgPct,
      unit: '%',
      layer: 'advanced',
    },
    {
      id: 'ts',
      label: 'Tiro Verdadero medio NBA (True Shooting TS%)',
      cur: curGlobal.avgTsPct,
      prev: refGlobal.avgTsPct,
      unit: '%',
      layer: 'advanced',
    },
    {
      id: '3pm',
      label: 'Triples anotados por equipo / PJ',
      cur: curGlobal.avgTeam3PM,
      prev: refGlobal.avgTeam3PM,
      unit: '3PM',
      layer: 'basic',
    },
    {
      id: '3pct',
      label: 'Acierto medio en triples de la liga',
      cur: curGlobal.avgTeam3Pct,
      prev: refGlobal.avgTeam3Pct,
      unit: '%',
      layer: 'basic',
    },
    {
      id: 'orb',
      label: 'Rebotes ofensivos medios por equipo / PJ',
      cur: curGlobal.avgTeamORB,
      prev: refGlobal.avgTeamORB,
      unit: 'OR',
      layer: 'basic',
    },
    {
      id: 'orebpct',
      label: 'Porcentaje de Rebote Ofensivo capturado (OREB%)',
      cur: curGlobal.avgOrebPct,
      prev: refGlobal.avgOrebPct,
      unit: '%',
      layer: 'advanced',
    },
    {
      id: 'tovpct',
      label: 'Ratio de Pérdidas por cada 100 posesiones (TOV%)',
      cur: curGlobal.avgTovPct,
      prev: refGlobal.avgTovPct,
      unit: '%',
      layer: 'advanced',
      lowerIsBetter: true,
    },
    {
      id: 'paint',
      label: 'Puntos medios en la Pintura por equipo (NBA.com)',
      cur: curGlobal.avgPtsPaint,
      prev: refGlobal.avgPtsPaint,
      unit: 'PTS',
      layer: 'advanced',
    },
    {
      id: 'second',
      label: 'Puntos tras 2ª Oportunidad por equipo (NBA.com)',
      cur: curGlobal.avgPts2ndChance,
      prev: refGlobal.avgPts2ndChance,
      unit: 'PTS',
      layer: 'advanced',
    },
    {
      id: 'fb',
      label: 'Puntos al Contraataque por equipo (NBA.com)',
      cur: curGlobal.avgPtsFastBreak,
      prev: refGlobal.avgPtsFastBreak,
      unit: 'PTS',
      layer: 'advanced',
    },
    {
      id: 'reb',
      label: 'Rebotes totales medios por equipo / PJ',
      cur: curGlobal.avgTeamREB,
      prev: refGlobal.avgTeamREB,
      unit: 'REB',
      layer: 'basic',
    },
    {
      id: 'ast',
      label: 'Asistencias medias por equipo / PJ',
      cur: curGlobal.avgTeamAST,
      prev: refGlobal.avgTeamAST,
      unit: 'AST',
      layer: 'basic',
    },
    {
      id: 'homew',
      label: 'Porcentaje de victorias locales',
      cur: curGlobal.homeWinPct,
      prev: refGlobal.homeWinPct,
      unit: '%',
      layer: 'basic',
    },
    {
      id: 'close',
      label: 'Partidos decididos por final apretado (≤ 5 pts)',
      cur: curGlobal.closeGamesPct,
      prev: refGlobal.closeGamesPct,
      unit: '%',
      layer: 'basic',
    },
    {
      id: 'blowout',
      label: 'Partidos decididos por amplio margen (≥ 15 pts)',
      cur: curGlobal.blowoutGamesPct,
      prev: refGlobal.blowoutGamesPct,
      unit: '%',
      layer: 'basic',
    },
  ];

  const visibleGlobalRows = globalRows.filter(
    (r) => globalLayer === 'all' || r.layer === globalLayer
  );

  const maxPtsPlayer = data.singleGameRecords.find(
    (r) => r.metricId === 'sg-player-pts'
  );
  const maxPtsTeam = data.singleGameRecords.find(
    (r) => r.metricId === 'sg-team-pts'
  );
  const ppgDiff = curGlobal.avgTeamPoints - refGlobal.avgTeamPoints;

  const renderPerfCell = (
    perf: SingleGamePerformance | null,
    entityType: 'player' | 'team',
    unit: string,
    decimals = 0,
    highlightOrange = false
  ) => {
    if (!perf) return <span className="text-xs text-slate-500">Sin registros</span>;
    return (
      <button
        type="button"
        onClick={() => onInspectEntity(entityType, perf.entityId)}
        title={`${perf.entityName} (${perf.teamAbbr}) · ${perf.value.toFixed(decimals)} ${unit} · ${perf.context} · ${formatShortDate(perf.date)}`}
        className="w-full flex items-center gap-2 text-left group focus:outline-none min-w-0"
      >
        <EntityBadge
          entityType={entityType}
          entityId={perf.entityId}
          name={perf.entityName}
          teamAbbr={perf.teamAbbr}
          showTeamBadge={entityType === 'player'}
          size="xs"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 leading-tight min-w-0">
            <span
              className={`font-mono tabular-nums font-bold text-xs sm:text-[13px] shrink-0 ${
                highlightOrange ? 'text-orange-400' : 'text-slate-100'
              }`}
            >
              {perf.value.toFixed(decimals)} {unit}
            </span>
            <span className="text-xs font-medium text-slate-100 group-hover:text-orange-300 transition-colors truncate">
              {perf.entityName}
            </span>
          </div>
          <div className="text-[11px] leading-tight text-slate-400 truncate mt-0.5">
            {perf.teamAbbr} · {perf.context} · {formatShortDate(perf.date)}
          </div>
        </div>
      </button>
    );
  };

  const renderLeaderCell = (
    holder: SeasonLeaderHolder | null,
    entityType: 'player' | 'team',
    unit: string,
    decimals: number,
    highlightOrange = false
  ) => {
    if (!holder) return <span className="text-xs text-slate-500">Sin registros</span>;
    return (
      <button
        type="button"
        onClick={() => onInspectEntity(entityType, holder.entityId)}
        title={`${holder.entityName} (${holder.teamAbbr}) · ${holder.value.toFixed(decimals)} ${unit} · ${holder.secondaryLabel}`}
        className="w-full flex items-center gap-2 text-left group focus:outline-none min-w-0"
      >
        <EntityBadge
          entityType={entityType}
          entityId={holder.entityId}
          name={holder.entityName}
          teamAbbr={holder.teamAbbr}
          showTeamBadge={entityType === 'player'}
          size="xs"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 leading-tight min-w-0">
            <span
              className={`font-mono tabular-nums font-bold text-xs sm:text-[13px] shrink-0 ${
                highlightOrange ? 'text-orange-400' : 'text-slate-100'
              }`}
            >
              {holder.value.toFixed(decimals)} {unit}
            </span>
            <span className="text-xs font-medium text-slate-100 group-hover:text-orange-300 transition-colors truncate">
              {holder.entityName}
            </span>
          </div>
          <div className="text-[11px] leading-tight text-slate-400 truncate mt-0.5">
            {holder.teamAbbr} · {holder.secondaryLabel}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0">
      {/* Row 1: Compact 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-2.5 sm:p-3 min-w-0">
          <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
            <span className="truncate">Partidos comparados</span>
            <MetricInfoTooltip
              customHelp={{
                title: 'Muestra oficial de partidos NBA',
                simpleDesc:
                  'Cantidad total de partidos oficiales disputados que entran en cada lado de la comparativa interanual.',
                calculation:
                  'Conteo total de actas oficiales finalizadas en 2026-27 frente al corte seleccionado de 2025-26.',
              }}
            />
          </div>
          <p className="mt-1 text-lg sm:text-xl font-semibold font-mono tabular-nums text-slate-100 leading-tight">
            {curGlobal.gamesCount}{' '}
            <span className="text-slate-500 text-xs sm:text-sm">vs</span>{' '}
            {refGlobal.gamesCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400 truncate">
            2026-27 vs {compMode === 'same_opening' ? 'mismo inicio' : '2025-26'}
          </p>
        </div>

        <div className="p-2.5 sm:p-3 min-w-0">
          <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
            <span className="truncate">Tope individual</span>
            <MetricInfoTooltip helpKey="singleGamePeak" align="right" />
          </div>
          <div className="mt-1 flex items-center gap-2 min-w-0">
            {maxPtsPlayer?.current2027 && (
              <PlayerAvatar
                playerId={maxPtsPlayer.current2027.entityId}
                name={maxPtsPlayer.current2027.entityName}
                teamAbbr={maxPtsPlayer.current2027.teamAbbr}
                showTeamBadge
                size="xs"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold font-mono tabular-nums text-orange-400 leading-tight">
                {maxPtsPlayer?.current2027?.value ?? '—'}
                <span className="mx-1 text-slate-600 text-xs">/</span>
                <span className="text-slate-200">
                  {(compMode === 'same_opening'
                    ? maxPtsPlayer?.prev2026Opening?.value
                    : maxPtsPlayer?.prev2026Full?.value) ?? '—'}
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                {maxPtsPlayer?.current2027?.entityName || '—'} ·{' '}
                {(compMode === 'same_opening'
                  ? maxPtsPlayer?.prev2026Opening?.entityName
                  : maxPtsPlayer?.prev2026Full?.entityName) || '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-2.5 sm:p-3 min-w-0">
          <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
            <span className="truncate">Tope equipo</span>
            <MetricInfoTooltip helpKey="singleGamePeak" />
          </div>
          <div className="mt-1 flex items-center gap-2 min-w-0">
            {maxPtsTeam?.current2027 && (
              <TeamLogo
                abbr={maxPtsTeam.current2027.teamAbbr}
                teamId={maxPtsTeam.current2027.entityId}
                size="xs"
                framed
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold font-mono tabular-nums text-emerald-400 leading-tight">
                {maxPtsTeam?.current2027?.value ?? '—'}
                <span className="mx-1 text-slate-600 text-xs">/</span>
                <span className="text-slate-200">
                  {(compMode === 'same_opening'
                    ? maxPtsTeam?.prev2026Opening?.value
                    : maxPtsTeam?.prev2026Full?.value) ?? '—'}
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                {maxPtsTeam?.current2027?.teamAbbr || '—'} vs{' '}
                {(compMode === 'same_opening'
                  ? maxPtsTeam?.prev2026Opening?.teamAbbr
                  : maxPtsTeam?.prev2026Full?.teamAbbr) || '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-2.5 sm:p-3 min-w-0">
          <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
            <span className="truncate">Evolución PTS/eq.</span>
            <MetricInfoTooltip helpKey="avgPointsFor" align="right" />
          </div>
          <p className="mt-1 text-lg sm:text-xl font-semibold font-mono tabular-nums text-slate-100 leading-tight">
            <span className={ppgDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {ppgDiff >= 0 ? '▲ ' : '▼ '}
              {formatSigned(ppgDiff, 1)}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400 truncate">
            {curGlobal.avgTeamPoints.toFixed(1)} vs {refGlobal.avgTeamPoints.toFixed(1)} PTS
          </p>
        </div>
      </div>

      {/* Row 2: Comparator Mode + Season Column Visibility Toggles + Search */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3 space-y-2.5 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Inter-Season Comparison Mode */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {experienceMode === 'simple'
                ? 'Modo comparación:'
                : 'Comparador interanual:'}
            </span>
            <div className="flex flex-wrap items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
              {(
                [
                  {
                    id: 'full_season',
                    label:
                      experienceMode === 'simple'
                        ? 'Vs. 25-26 completo'
                        : 'Vs. 2025-26 Completa',
                  },
                  {
                    id: 'same_opening',
                    label:
                      experienceMode === 'simple'
                        ? `Mismo inicio (${data.openingGamesPerTeam} PJ)`
                        : `Mismo Tramo (${data.openingGamesPerTeam} PJ)`,
                  },
                  {
                    id: 'head_to_head',
                    label:
                      experienceMode === 'simple'
                        ? 'Medias y topes'
                        : 'Promedios Cara a Cara',
                  },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCompMode(m.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    compMode === m.id
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Season Column Visibility Controls + Search */}
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-between xl:justify-end">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 whitespace-nowrap">
                Columnas visibles:
              </span>
              <div className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                <button
                  type="button"
                  onClick={toggleCurSeasonCol}
                  aria-pressed={showCurSeasonCol}
                  title="Mostrar u ocultar la columna de la temporada actual (2026-27)"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    showCurSeasonCol
                      ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {showCurSeasonCol ? (
                    <Eye className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <span>Temp. Actual (26-27)</span>
                </button>

                <button
                  type="button"
                  onClick={togglePrevSeasonCol}
                  aria-pressed={showPrevSeasonCol}
                  title="Mostrar u ocultar la columna de la temporada pasada (2025-26)"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    showPrevSeasonCol
                      ? 'bg-[#1E293B] text-slate-100 border border-slate-600/60 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {showPrevSeasonCol ? (
                    <Eye className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <span>Temp. Pasada (25-26)</span>
                </button>
              </div>

              {!bothColsVisible && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCurSeasonCol(true);
                    setShowPrevSeasonCol(true);
                  }}
                  className="px-2 py-1 text-[11px] font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
                >
                  Mostrar ambas
                </button>
              )}
            </div>

            <div className="relative w-full sm:w-56 shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar hito, jugador o equipo..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 border-t border-[#1E293B] pt-2 leading-snug">
          {compMode === 'full_season' &&
            'Comparando los registros actuales de 2026-27 contra el listón final completo de los 82 partidos de 2025-26 (incluye % del récord alcanzado).'}
          {compMode === 'same_opening' &&
            `Comparando el arranque actual de 2026-27 frente a exactamente los primeros ${data.openingGamesPerTeam} partidos inaugurales de cada franquicia y jugador en 2025-26.`}
          {compMode === 'head_to_head' &&
            'Enfrentando únicamente tasas por partido y topes máximos homologables cara a cara (excluyendo totales acumulados asimétricos).'}
        </p>
      </div>

      <UnifiedEntityFilterBar
        filters={unifiedFilters}
        onChange={setUnifiedFilters}
        players={players}
        teams={teams}
        entityScope="mixed"
      />

      {/* BLOCK 1: Global Macro NBA Comparison */}
      <section className="space-y-2.5 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              {experienceMode === 'simple'
                ? '01. ¿Cómo se juega este año en la NBA vs el pasado?'
                : '01. Datos Globales Comparativos NBA (Pace, 4 Factores y Pintura)'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-lg">
              {(
                [
                  { id: 'basic', label: 'Esenciales' },
                  { id: 'advanced', label: 'Ritmo, Puntería y Pintura' },
                  { id: 'all', label: `Todos (${globalRows.length})` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setGlobalLayer(opt.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    globalLayer === opt.id
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {experienceMode === 'simple' && (
              <button
                type="button"
                onClick={onSwitchToAdvanced}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] border border-[#1E293B] rounded-lg text-orange-400 transition-colors whitespace-nowrap shrink-0"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Modo Avanzado</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {/* Mobile Global Indicators Cards (< md) */}
          <div className="md:hidden divide-y divide-[#1E293B]">
            {visibleGlobalRows.map((r) => {
              const diff = r.cur - r.prev;
              const pct = r.prev !== 0 ? (diff / Math.abs(r.prev)) * 100 : 0;
              const isGood = r.lowerIsBetter ? diff <= 0 : diff >= 0;

              return (
                <div key={r.id} className="p-2.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 font-medium text-xs text-slate-100 min-w-0">
                      <span className="leading-snug">{r.label}</span>
                      <MetricInfoTooltip
                        helpKey={r.id}
                        fallbackTitle={r.label}
                        align="left"
                        iconClassName="w-3 h-3"
                      />
                    </div>
                    {bothColsVisible && (
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <span
                          className={`text-xs font-semibold ${
                            Math.abs(pct) < 0.4
                              ? 'text-slate-400'
                              : isGood
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {diff > 0.1 ? '▲ ' : diff < -0.1 ? '▼ ' : ''}
                          {formatSigned(pct, 1, '%')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div
                    className={`grid ${
                      bothColsVisible ? 'grid-cols-2' : 'grid-cols-1'
                    } gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-md px-2.5 py-1.5 text-xs`}
                  >
                    {showCurSeasonCol && (
                      <div>
                        <span className="text-[10px] text-slate-400">2026-27</span>
                        <div className="font-mono tabular-nums font-semibold text-orange-300">
                          {r.cur.toFixed(1)}
                          {r.unit === '%' ? '%' : ` ${r.unit}`}
                        </div>
                      </div>
                    )}
                    {showPrevSeasonCol && (
                      <div className={bothColsVisible ? 'text-right' : ''}>
                        <span className="text-[10px] text-slate-400">
                          {refShortHeader}
                        </span>
                        <div className="font-mono tabular-nums text-slate-200">
                          {r.prev.toFixed(1)}
                          {r.unit === '%' ? '%' : ` ${r.unit}`}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Global Macro Table (md+, fixed layout so everything fits horizontally) */}
          <div className="hidden md:block overflow-auto max-h-[62vh]">
            <table className="w-full table-fixed text-left border-collapse">
              <colgroup>
                <col className={bothColsVisible ? 'w-[44%]' : 'w-[70%]'} />
                {showCurSeasonCol && (
                  <col className={bothColsVisible ? 'w-[16%]' : 'w-[30%]'} />
                )}
                {showPrevSeasonCol && (
                  <col className={bothColsVisible ? 'w-[16%]' : 'w-[30%]'} />
                )}
                {bothColsVisible && (
                  <>
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                  </>
                )}
              </colgroup>
              <thead className={STICKY_THEAD_CLASS}>
                <tr className="text-[11px] text-slate-400">
                  <SortableTh
                    label="Indicador Global NBA"
                    active={macroSortKey === 'label'}
                    asc={macroSortAsc}
                    onSort={() => toggleMacroSort('label')}
                    align="left"
                    className="py-2.5 pl-3 pr-2"
                    customHelp={{
                      title: 'Promedios globales de toda la liga',
                      simpleDesc:
                        'Mide el estilo de juego medio sumando todos los partidos disputados por los 30 equipos de la NBA.',
                      calculation:
                        'Pasa el ratón sobre el icono (i) junto a cada métrica para ver su significado y fórmula exacta.',
                    }}
                  />
                  {showCurSeasonCol && (
                    <SortableTh
                      label="Temp. 2026-27"
                      active={macroSortKey === 'cur'}
                      asc={macroSortAsc}
                      onSort={() => toggleMacroSort('cur')}
                      align="right"
                      className="py-2.5 px-2.5"
                      customHelp={{
                        title: 'Promedio actual 2026-27',
                        simpleDesc:
                          'Dato medio registrado en lo que llevamos de temporada actual.',
                        calculation:
                          'Agregación oficial de todos los partidos de liga disputados en 2026-27.',
                      }}
                    />
                  )}
                  {showPrevSeasonCol && (
                    <SortableTh
                      label={refShortHeader}
                      active={macroSortKey === 'prev'}
                      asc={macroSortAsc}
                      onSort={() => toggleMacroSort('prev')}
                      align="right"
                      className="py-2.5 px-2.5"
                      customHelp={{
                        title: 'Temporada pasada de referencia',
                        simpleDesc:
                          'Valor registrado la temporada 2025-26 según el modo de comparación elegido arriba.',
                        calculation:
                          'Agregación oficial de los partidos de 2025-26 (curso completo o mismo tramo inicial).',
                      }}
                    />
                  )}
                  {bothColsVisible && (
                    <>
                      <SortableTh
                        label="Dif."
                        active={macroSortKey === 'diff'}
                        asc={macroSortAsc}
                        onSort={() => toggleMacroSort('diff')}
                        align="right"
                        className="py-2.5 px-2"
                        customHelp={{
                          title: 'Cambio respecto al año pasado',
                          simpleDesc:
                            'Cuántos puntos o puntos porcentuales ha subido o bajado la media de la liga este curso.',
                          calculation:
                            'Resta directa: Valor medio 2026-27 − Valor de referencia 2025-26.',
                        }}
                      />
                      <SortableTh
                        label="Var. %"
                        helpKey="pctDelta"
                        active={macroSortKey === 'pct'}
                        asc={macroSortAsc}
                        onSort={() => toggleMacroSort('pct')}
                        align="right"
                        className="py-2.5 pl-2 pr-3"
                      />
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-xs">
                {(!macroSortKey
                  ? visibleGlobalRows
                  : sortRows(
                      visibleGlobalRows,
                      (r) => {
                        const diff = r.cur - r.prev;
                        const pct =
                          r.prev !== 0 ? (diff / Math.abs(r.prev)) * 100 : 0;
                        switch (macroSortKey) {
                          case 'label':
                            return r.label;
                          case 'cur':
                            return r.cur;
                          case 'prev':
                            return r.prev;
                          case 'diff':
                            return diff;
                          case 'pct':
                            return pct;
                        }
                      },
                      macroSortAsc
                    )
                ).map((r) => {
                  const diff = r.cur - r.prev;
                  const pct = r.prev !== 0 ? (diff / Math.abs(r.prev)) * 100 : 0;
                  const isGood = r.lowerIsBetter ? diff <= 0 : diff >= 0;

                  return (
                    <tr key={r.id} className="hover:bg-[#182338] transition-colors">
                      <td className="py-1.5 pl-3 pr-2 font-medium text-slate-100">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate" title={r.label}>
                            {r.label}
                          </span>
                          <MetricInfoTooltip
                            helpKey={r.id}
                            fallbackTitle={r.label}
                            align="left"
                            iconClassName="w-3 h-3"
                          />
                        </div>
                      </td>
                      {showCurSeasonCol && (
                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums font-semibold text-orange-300 whitespace-nowrap">
                          {r.cur.toFixed(1)}
                          {r.unit === '%' ? '%' : ` ${r.unit}`}
                        </td>
                      )}
                      {showPrevSeasonCol && (
                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {r.prev.toFixed(1)}
                          {r.unit === '%' ? '%' : ` ${r.unit}`}
                        </td>
                      )}
                      {bothColsVisible && (
                        <>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                            <span
                              className={
                                Math.abs(diff) < 0.15
                                  ? 'text-slate-400'
                                  : isGood
                                  ? 'text-emerald-400 font-medium'
                                  : 'text-rose-400 font-medium'
                              }
                            >
                              {formatSigned(diff, 1, r.unit === '%' ? ' pp' : '')}
                            </span>
                          </td>
                          <td className="py-1.5 pl-2 pr-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <span
                              className={
                                Math.abs(pct) < 0.4
                                  ? 'text-slate-400'
                                  : isGood
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }
                            >
                              {diff > 0.1 ? '▲ ' : diff < -0.1 ? '▼ ' : ''}
                              {formatSigned(pct, 1, '%')}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* BLOCK 2: Single-Game Records (Topes en un partido) */}
      <section className="space-y-2.5 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Flame className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              02. Hitos Explosivos en un Único Partido (Topes de una Noche ·{' '}
              {filteredSingleGame.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex flex-wrap items-center gap-1 p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-lg">
              {(
                [
                  {
                    id: 'all',
                    label: `Todos (${data.singleGameRecords.length})`,
                  },
                  {
                    id: 'player',
                    label: `Jugadores (${
                      data.singleGameRecords.filter((x) => x.category === 'player')
                        .length
                    })`,
                  },
                  {
                    id: 'team',
                    label: `Equipos (${
                      data.singleGameRecords.filter((x) => x.category === 'team')
                        .length
                    })`,
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSgCategory(opt.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    sgCategory === opt.id
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-lg">
              {(
                [
                  { id: 'all', label: 'Todas las facetas' },
                  { id: 'scoring', label: 'Anotación y Tiro' },
                  { id: 'playmaking_reb', label: 'Rebote y Creación' },
                  { id: 'defense', label: 'Defensa y Cuidado' },
                  { id: 'impact', label: 'Impacto y Ritmo' },
                ] as const
              ).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSgSubGroup(sub.id)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    sgSubGroup === sub.id
                      ? 'bg-[#1E293B] text-orange-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {filteredSingleGame.length === 0 ? (
            <div className="py-8 px-4 text-center text-xs text-slate-400">
              No hay récords en un partido que coincidan con el filtro actual.
            </div>
          ) : (
            <>
              {/* Mobile Single-Game Records Cards (< md) */}
              <div className="md:hidden divide-y divide-[#1E293B]">
                {filteredSingleGame.map((rec) => {
                  const refPerf =
                    compMode === 'same_opening'
                      ? rec.prev2026Opening
                      : rec.prev2026Full;
                  const curVal = rec.current2027?.value ?? 0;
                  const prevVal = refPerf?.value ?? 0;
                  const diff = curVal - prevVal;
                  const ratioPct = rec.lowerIsBetter
                    ? curVal > 0
                      ? Math.round((prevVal / curVal) * 100)
                      : 0
                    : prevVal > 0
                    ? Math.round((curVal / prevVal) * 100)
                    : 0;
                  const isGoodDiff = rec.lowerIsBetter ? diff < 0 : diff > 0;
                  const isBadDiff = rec.lowerIsBetter ? diff > 0 : diff < 0;

                  return (
                    <div key={rec.metricId} className="p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 font-semibold text-xs text-slate-100 min-w-0">
                          <span className="truncate">{rec.metricLabel}</span>
                          <MetricInfoTooltip
                            helpKey={rec.metricId}
                            fallbackTitle={rec.metricLabel}
                            align="left"
                            iconClassName="w-3 h-3"
                          />
                        </div>
                        {bothColsVisible && (
                          <div className="font-mono tabular-nums text-xs shrink-0">
                            {compMode === 'full_season' ? (
                              <span
                                className={
                                  ratioPct >= 100
                                    ? 'text-emerald-400 font-semibold'
                                    : 'text-slate-300'
                                }
                              >
                                {ratioPct}% tope
                              </span>
                            ) : (
                              <span
                                className={
                                  isGoodDiff
                                    ? 'text-emerald-400 font-semibold'
                                    : isBadDiff
                                    ? 'text-rose-400'
                                    : 'text-slate-300'
                                }
                              >
                                {formatSigned(diff, rec.decimals ?? 0)} {rec.unit}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-md p-2">
                        {showCurSeasonCol && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono text-orange-400 shrink-0">
                              26-27
                            </span>
                            <div className="min-w-0 flex-1">
                              {renderPerfCell(
                                rec.current2027,
                                rec.category,
                                rec.unit,
                                rec.decimals ?? 0,
                                true
                              )}
                            </div>
                          </div>
                        )}
                        {bothColsVisible && (
                          <div className="border-t border-[#1E293B]/70" />
                        )}
                        {showPrevSeasonCol && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              25-26
                            </span>
                            <div className="min-w-0 flex-1">
                              {renderPerfCell(
                                refPerf,
                                rec.category,
                                rec.unit,
                                rec.decimals ?? 0,
                                false
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Single-Game Records Table (md+, fixed layout so everything fits horizontally) */}
              <div className="hidden md:block overflow-auto max-h-[65vh]">
                <table className="w-full table-fixed text-left border-collapse">
                  <colgroup>
                    <col className={bothColsVisible ? 'w-[28%]' : 'w-[42%]'} />
                    {showCurSeasonCol && (
                      <col className={bothColsVisible ? 'w-[29%]' : 'w-[58%]'} />
                    )}
                    {showPrevSeasonCol && (
                      <col className={bothColsVisible ? 'w-[29%]' : 'w-[58%]'} />
                    )}
                    {bothColsVisible && <col className="w-[14%]" />}
                  </colgroup>
                  <thead className={STICKY_THEAD_CLASS}>
                    <tr className="text-[11px] text-slate-400">
                      <SortableTh
                        label="Récord (1 Partido)"
                        active={sgSortKey === 'metric'}
                        asc={sgSortAsc}
                        onSort={() => toggleSgSort('metric')}
                        align="left"
                        className="py-2.5 pl-3 pr-2"
                        customHelp={{
                          title: 'Mejor marca lograda en una sola noche',
                          simpleDesc:
                            'Muestra la actuación individual o colectiva más alta registrada en un único partido.',
                          calculation:
                            'Máximo absoluto máx(x) escaneando todas las hojas de partido oficiales de jugadores y equipos.',
                        }}
                      />
                      {showCurSeasonCol && (
                        <SortableTh
                          label="Tope 2026-27"
                          active={sgSortKey === 'cur'}
                          asc={sgSortAsc}
                          onSort={() => toggleSgSort('cur')}
                          align="left"
                          className="py-2.5 px-2.5"
                          customHelp={{
                            title: 'Récord actual 2026-27',
                            simpleDesc:
                              'Pulsa sobre el nombre del jugador o equipo para abrir su ficha completa.',
                            calculation:
                              'Mayor registro logrado en una sola noche durante la temporada 2026-27.',
                          }}
                        />
                      )}
                      {showPrevSeasonCol && (
                        <SortableTh
                          label={`Tope ${refShortHeader}`}
                          active={sgSortKey === 'prev'}
                          asc={sgSortAsc}
                          onSort={() => toggleSgSort('prev')}
                          align="left"
                          className="py-2.5 px-2.5"
                          customHelp={{
                            title: 'Récord de la temporada pasada',
                            simpleDesc:
                              'Mejor actuación en una sola noche durante el tramo comparado de 2025-26.',
                            calculation:
                              'Mayor registro logrado en un partido durante el periodo seleccionado de 2025-26.',
                          }}
                        />
                      )}
                      {bothColsVisible && (
                        <SortableTh
                          label={
                            compMode === 'full_season'
                              ? '% Tope 25-26'
                              : 'Comparativa'
                          }
                          active={sgSortKey === 'comp'}
                          asc={sgSortAsc}
                          onSort={() => toggleSgSort('comp')}
                          align="right"
                          className="py-2.5 pl-2 pr-3"
                          customHelp={{
                            title: 'Comparativa frente al tope anterior',
                            simpleDesc:
                              'Indica cómo de cerca está el récord de este año respecto al techo del curso pasado (si llega o supera el 100%, ya lo ha batido).',
                            calculation:
                              '(Tope 2026-27 / Tope 2025-26) × 100 y diferencia neta (Tope 26-27 − Tope 25-26).',
                          }}
                        />
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] text-xs">
                    {(!sgSortKey
                      ? filteredSingleGame
                      : sortRows(
                          filteredSingleGame,
                          (rec) => {
                            const refPerf =
                              compMode === 'same_opening'
                                ? rec.prev2026Opening
                                : rec.prev2026Full;
                            const curVal = rec.current2027?.value ?? null;
                            const prevVal = refPerf?.value ?? null;
                            switch (sgSortKey) {
                              case 'metric':
                                return rec.metricLabel;
                              case 'cur':
                                return curVal;
                              case 'prev':
                                return prevVal;
                              case 'comp': {
                                if (curVal === null || prevVal === null)
                                  return null;
                                if (compMode === 'full_season') {
                                  return rec.lowerIsBetter
                                    ? curVal > 0
                                      ? (prevVal / curVal) * 100
                                      : 0
                                    : prevVal > 0
                                    ? (curVal / prevVal) * 100
                                    : 0;
                                }
                                return curVal - prevVal;
                              }
                            }
                          },
                          sgSortAsc
                        )
                    ).map((rec) => {
                      const refPerf =
                        compMode === 'same_opening'
                          ? rec.prev2026Opening
                          : rec.prev2026Full;
                      const curVal = rec.current2027?.value ?? 0;
                      const prevVal = refPerf?.value ?? 0;
                      const diff = curVal - prevVal;
                      const ratioPct = rec.lowerIsBetter
                        ? curVal > 0
                          ? Math.round((prevVal / curVal) * 100)
                          : 0
                        : prevVal > 0
                        ? Math.round((curVal / prevVal) * 100)
                        : 0;
                      const isGoodDiff = rec.lowerIsBetter ? diff < 0 : diff > 0;
                      const isBadDiff = rec.lowerIsBetter ? diff > 0 : diff < 0;

                      return (
                        <tr
                          key={rec.metricId}
                          className="hover:bg-[#182338] transition-colors"
                        >
                          <td className="py-1.5 pl-3 pr-2">
                            <div className="flex items-center gap-1.5 font-medium text-slate-100 min-w-0">
                              <span
                                className="truncate"
                                title={`${rec.metricLabel} (${
                                  rec.category === 'player'
                                    ? 'Individual'
                                    : 'Colectivo'
                                })`}
                              >
                                {rec.metricLabel}
                              </span>
                              {rec.category === 'team' && sgCategory === 'all' && (
                                <span className="text-[10px] text-slate-400 font-normal shrink-0">
                                  · Eq.
                                </span>
                              )}
                              <MetricInfoTooltip
                                helpKey={rec.metricId}
                                fallbackTitle={rec.metricLabel}
                                align="left"
                                iconClassName="w-3 h-3"
                              />
                            </div>
                          </td>

                          {showCurSeasonCol && (
                            <td className="py-1.5 px-2.5">
                              {renderPerfCell(
                                rec.current2027,
                                rec.category,
                                rec.unit,
                                rec.decimals ?? 0,
                                true
                              )}
                            </td>
                          )}

                          {showPrevSeasonCol && (
                            <td className="py-1.5 px-2.5">
                              {renderPerfCell(
                                refPerf,
                                rec.category,
                                rec.unit,
                                rec.decimals ?? 0,
                                false
                              )}
                            </td>
                          )}

                          {bothColsVisible && (
                            <td className="py-1.5 pl-2 pr-3 text-right font-mono tabular-nums whitespace-nowrap">
                              {compMode === 'full_season' ? (
                                <div className="leading-tight">
                                  <span
                                    className={
                                      ratioPct >= 100
                                        ? 'text-emerald-400 font-semibold'
                                        : 'text-slate-200 font-medium'
                                    }
                                  >
                                    {ratioPct}%
                                  </span>
                                  <span className="ml-1 text-[11px] text-slate-400">
                                    ({formatSigned(diff, rec.decimals ?? 0)})
                                  </span>
                                </div>
                              ) : (
                                <span
                                  className={
                                    isGoodDiff
                                      ? 'text-emerald-400 font-semibold'
                                      : isBadDiff
                                      ? 'text-rose-400 font-medium'
                                      : 'text-slate-300'
                                  }
                                >
                                  {diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : ''}
                                  {formatSigned(diff, rec.decimals ?? 0)} {rec.unit}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>

      {/* BLOCK 3: Season Leaders (Basic, Rebounding, Playmaking, Defense/Hustle, Advanced/Zones & Team Leaders) */}
      <section className="space-y-2.5 min-w-0">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Trophy className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                {experienceMode === 'simple'
                  ? `03. Líderes de la NBA en cada categoría (${filteredSeasonLeaders.length})`
                  : `03. Líderes de Temporada · Jugadores y Equipos (${filteredSeasonLeaders.length})`}
              </h2>
            </div>

            {compMode !== 'head_to_head' && (
              <div className="flex flex-wrap items-center gap-1 p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                {(
                  [
                    { id: 'all', label: 'Promedios y Totales' },
                    { id: 'averages', label: 'Solo Promedios / %' },
                    { id: 'totals', label: 'Solo Totales Acumulados' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setLeaderStatMode(mode.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      leaderStatMode === mode.id
                        ? 'bg-[#1E293B] text-orange-400 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1 p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-lg self-start">
            {(
              [
                { id: 'all', label: `Todos (${baseSeasonLeaders.length})` },
                {
                  id: 'shooting_scoring',
                  label: `Anotación y Tiro (${
                    baseSeasonLeaders.filter((x) => x.group === 'shooting_scoring')
                      .length
                  })`,
                },
                {
                  id: 'rebounding',
                  label: `Rebotes (${
                    baseSeasonLeaders.filter((x) => x.group === 'rebounding')
                      .length
                  })`,
                },
                {
                  id: 'playmaking_allaround',
                  label: `Creación y Todo-Terreno (${
                    baseSeasonLeaders.filter(
                      (x) => x.group === 'playmaking_allaround'
                    ).length
                  })`,
                },
                {
                  id: 'defense_discipline',
                  label: `Defensa y Hustle (${
                    baseSeasonLeaders.filter(
                      (x) => x.group === 'defense_discipline'
                    ).length
                  })`,
                },
                {
                  id: 'advanced_hustle',
                  label:
                    experienceMode === 'simple'
                      ? `Pintura e Impacto (${
                          baseSeasonLeaders.filter(
                            (x) => x.group === 'advanced_hustle'
                          ).length
                        })`
                      : `Avanzadas y Zonas (${
                          baseSeasonLeaders.filter(
                            (x) => x.group === 'advanced_hustle'
                          ).length
                        })`,
                },
                {
                  id: 'team_leaders',
                  label: `Equipos NBA (${
                    baseSeasonLeaders.filter((x) => x.group === 'team_leaders')
                      .length
                  })`,
                },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setLeaderGroup(g.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  leaderGroup === g.id
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {filteredSeasonLeaders.length === 0 ? (
            <div className="py-8 px-4 text-center text-xs text-slate-400">
              No hay líderes de temporada que coincidan con el filtro actual.
            </div>
          ) : (
            <>
              {/* Mobile Season Leaders Cards (< md) */}
              <div className="md:hidden divide-y divide-[#1E293B]">
                {filteredSeasonLeaders.map((item) => {
                  const refHold =
                    compMode === 'same_opening'
                      ? item.prev2026Opening
                      : item.prev2026Full;
                  const curVal = item.current2027?.value ?? 0;
                  const prevVal = refHold?.value ?? 0;
                  const diff = curVal - prevVal;

                  return (
                    <div key={item.metricId} className="p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 font-semibold text-xs text-slate-100 min-w-0">
                          <span className="truncate">{item.metricLabel}</span>
                          <MetricInfoTooltip
                            helpKey={item.metricId}
                            fallbackTitle={item.metricLabel}
                            align="left"
                            iconClassName="w-3 h-3"
                          />
                        </div>
                        {bothColsVisible && (
                          <div className="font-mono tabular-nums text-xs shrink-0">
                            {item.isCumulativeTotal && compMode === 'full_season' ? (
                              <span className="text-slate-300">
                                {prevVal > 0
                                  ? `${Math.round((curVal / prevVal) * 100)}% acum.`
                                  : '—'}
                              </span>
                            ) : (
                              <span
                                className={
                                  Math.abs(diff) < 0.05
                                    ? 'text-slate-400'
                                    : (item.lowerIsBetter ? diff < 0 : diff > 0)
                                    ? 'text-emerald-400 font-semibold'
                                    : 'text-rose-400'
                                }
                              >
                                {formatSigned(diff, item.decimals)} {item.unit}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-md p-2">
                        {showCurSeasonCol && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono text-orange-400 shrink-0">
                              26-27
                            </span>
                            <div className="min-w-0 flex-1">
                              {renderLeaderCell(
                                item.current2027,
                                item.entityType,
                                item.unit,
                                item.decimals,
                                true
                              )}
                            </div>
                          </div>
                        )}
                        {bothColsVisible && (
                          <div className="border-t border-[#1E293B]/70" />
                        )}
                        {showPrevSeasonCol && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              25-26
                            </span>
                            <div className="min-w-0 flex-1">
                              {renderLeaderCell(
                                refHold,
                                item.entityType,
                                item.unit,
                                item.decimals,
                                false
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Season Leaders Table (md+, fixed layout so everything fits horizontally) */}
              <div className="hidden md:block overflow-auto max-h-[68vh]">
                <table className="w-full table-fixed text-left border-collapse">
                  <colgroup>
                    <col className={bothColsVisible ? 'w-[28%]' : 'w-[42%]'} />
                    {showCurSeasonCol && (
                      <col className={bothColsVisible ? 'w-[29%]' : 'w-[58%]'} />
                    )}
                    {showPrevSeasonCol && (
                      <col className={bothColsVisible ? 'w-[29%]' : 'w-[58%]'} />
                    )}
                    {bothColsVisible && <col className="w-[14%]" />}
                  </colgroup>
                  <thead className={STICKY_THEAD_CLASS}>
                    <tr className="text-[11px] text-slate-400">
                      <SortableTh
                        label="Categoría Estadística"
                        active={leadSortKey === 'metric'}
                        asc={leadSortAsc}
                        onSort={() => toggleLeadSort('metric')}
                        align="left"
                        className="py-2.5 pl-3 pr-2"
                        customHelp={{
                          title: 'Apartado estadístico liderado',
                          simpleDesc:
                            'Quién encabeza toda la NBA en promedios por partido o totales acumulados.',
                          calculation:
                            'Ordenación descendente (o ascendente en DefRtg) entre los jugadores y equipos que cumplen el mínimo oficial de partidos.',
                        }}
                      />
                      {showCurSeasonCol && (
                        <SortableTh
                          label="Líder 2026-27"
                          active={leadSortKey === 'cur'}
                          asc={leadSortAsc}
                          onSort={() => toggleLeadSort('cur')}
                          align="left"
                          className="py-2.5 px-2.5"
                          customHelp={{
                            title: 'Número 1 actual en 2026-27',
                            simpleDesc:
                              'Pulsa sobre el líder para inspeccionar todos sus partidos.',
                            calculation:
                              'Mejor promedio o total acumulado registrado en la temporada 2026-27.',
                          }}
                        />
                      )}
                      {showPrevSeasonCol && (
                        <SortableTh
                          label={`Líder ${refShortHeader}`}
                          active={leadSortKey === 'prev'}
                          asc={leadSortAsc}
                          onSort={() => toggleLeadSort('prev')}
                          align="left"
                          className="py-2.5 px-2.5"
                          customHelp={{
                            title: 'Número 1 en 2025-26',
                            simpleDesc:
                              'Líder de la temporada anterior en este mismo apartado.',
                            calculation:
                              'Mejor promedio o total registrado en el corte seleccionado de 2025-26.',
                          }}
                        />
                      )}
                      {bothColsVisible && (
                        <SortableTh
                          label="Diferencial"
                          active={leadSortKey === 'diff'}
                          asc={leadSortAsc}
                          onSort={() => toggleLeadSort('diff')}
                          align="right"
                          className="py-2.5 pl-2 pr-3"
                          customHelp={{
                            title: 'Diferencia entre ambos líderes',
                            simpleDesc:
                              'Compara la marca del líder actual frente a la del líder del curso pasado.',
                            calculation:
                              'Resta directa: Marca del líder 2026-27 − Marca del líder 2025-26.',
                          }}
                        />
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] text-xs">
                    {(!leadSortKey
                      ? filteredSeasonLeaders
                      : sortRows(
                          filteredSeasonLeaders,
                          (item) => {
                            const refHold =
                              compMode === 'same_opening'
                                ? item.prev2026Opening
                                : item.prev2026Full;
                            const curVal = item.current2027?.value ?? null;
                            const prevVal = refHold?.value ?? null;
                            switch (leadSortKey) {
                              case 'metric':
                                return item.metricLabel;
                              case 'cur':
                                return curVal;
                              case 'prev':
                                return prevVal;
                              case 'diff':
                                if (curVal === null || prevVal === null)
                                  return null;
                                if (
                                  item.isCumulativeTotal &&
                                  compMode === 'full_season'
                                ) {
                                  return prevVal > 0
                                    ? (curVal / prevVal) * 100
                                    : 0;
                                }
                                return curVal - prevVal;
                            }
                          },
                          leadSortAsc
                        )
                    ).map((item) => {
                      const refHold =
                        compMode === 'same_opening'
                          ? item.prev2026Opening
                          : item.prev2026Full;
                      const curVal = item.current2027?.value ?? 0;
                      const prevVal = refHold?.value ?? 0;
                      const diff = curVal - prevVal;

                      return (
                        <tr
                          key={item.metricId}
                          className="hover:bg-[#182338] transition-colors"
                        >
                          <td className="py-1.5 pl-3 pr-2">
                            <div className="flex items-center gap-1.5 font-medium text-slate-100 min-w-0">
                              <span
                                className="truncate"
                                title={`${item.metricLabel} (${
                                  item.entityType === 'player'
                                    ? 'Individual'
                                    : 'Colectivo'
                                })`}
                              >
                                {item.metricLabel}
                              </span>
                              {item.entityType === 'team' &&
                                leaderGroup === 'all' && (
                                  <span className="text-[10px] text-slate-400 font-normal shrink-0">
                                    · Eq.
                                  </span>
                                )}
                              <MetricInfoTooltip
                                helpKey={item.metricId}
                                fallbackTitle={item.metricLabel}
                                align="left"
                                iconClassName="w-3 h-3"
                              />
                            </div>
                          </td>

                          {showCurSeasonCol && (
                            <td className="py-1.5 px-2.5">
                              {renderLeaderCell(
                                item.current2027,
                                item.entityType,
                                item.unit,
                                item.decimals,
                                true
                              )}
                            </td>
                          )}

                          {showPrevSeasonCol && (
                            <td className="py-1.5 px-2.5">
                              {renderLeaderCell(
                                refHold,
                                item.entityType,
                                item.unit,
                                item.decimals,
                                false
                              )}
                            </td>
                          )}

                          {bothColsVisible && (
                            <td className="py-1.5 pl-2 pr-3 text-right font-mono tabular-nums whitespace-nowrap">
                              {item.isCumulativeTotal &&
                              compMode === 'full_season' ? (
                                <span className="text-xs text-slate-300">
                                  {prevVal > 0
                                    ? `${Math.round((curVal / prevVal) * 100)}% acum.`
                                    : '—'}
                                </span>
                              ) : (
                                <span
                                  className={
                                    Math.abs(diff) < 0.05
                                      ? 'text-slate-400'
                                      : (item.lowerIsBetter ? diff < 0 : diff > 0)
                                      ? 'text-emerald-400 font-medium'
                                      : 'text-rose-400 font-medium'
                                  }
                                >
                                  {diff > 0.05 ? '▲ ' : diff < -0.05 ? '▼ ' : ''}
                                  {formatSigned(diff, item.decimals)} {item.unit}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
