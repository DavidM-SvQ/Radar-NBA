import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Sliders, Star, Users } from 'lucide-react';
import type {
  ExperienceMode,
  PlayerSummary,
  SearchPlayerResult,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import {
  DEFAULT_UNIFIED_FILTERS,
  buildEntityLookupContext,
  matchesPlayerUnifiedFilters,
  type UnifiedTableFiltersState,
} from '../utils/entityFilters';
import { UnifiedEntityFilterBar } from './UnifiedEntityFilterBar';
import {
  formatSigned,
  mean,
  normalizeSearchText,
  round1,
} from '../utils/analytics';
import {
  evaluateVsLeague,
  qualifyRecentDelta,
  qualifyUsageRole,
  type LeagueBenchmarks,
} from '../utils/humanize';
import {
  MetricInfoTooltip,
  NbaComparisonBar,
  SortableTh,
} from './MetricUiHelpers';
import { STICKY_THEAD_CLASS, compareSortValues } from '../utils/tableSort';
import { PlayerAvatar } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import {
  buildTableSnapshotBlob,
  type TableSnapshotCell,
} from '../utils/exportImageCard';

interface PlayersExplorerViewProps {
  players: PlayerSummary[];
  teams?: TeamSummary[];
  experienceMode: ExperienceMode;
  benchmarks: LeagueBenchmarks;
  onSwitchToAdvanced: () => void;
  totalLeaguePlayersAvailable: number;
  allPlayersLoaded: boolean;
  loadingAllPlayers: boolean;
  onLoadAllPlayers: () => void;
  windowSize: WindowSize;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onAddExternalPlayer: (item: SearchPlayerResult) => Promise<void>;
  addingPlayerId: string | null;
}

type TableViewMode = 'basic' | 'advanced' | 'zones_hustle';

type SortKey =
  | 'watched'
  | 'name'
  | 'ptsVsNba'
  | 'minBase'
  | 'ptsBase'
  | 'ptsWin'
  | 'pctDelta'
  | 'rebBase'
  | 'orebBase'
  | 'astBase'
  | 'stocksBase'
  | 'fgPct'
  | 'plusMinusBase'
  | 'usgPct'
  | 'usgWin'
  | 'tsPct'
  | 'efgPct'
  | 'offRtg'
  | 'defRtg'
  | 'netRtg'
  | 'pie'
  | 'gmSc'
  | 'astPct'
  | 'astTo'
  | 'orebPct'
  | 'ptsPaint'
  | 'pts2ndChance'
  | 'ptsFastBreak'
  | 'contestedShots'
  | 'deflections'
  | 'screenAssists';

export function PlayersExplorerView({
  players,
  teams = [],
  experienceMode,
  benchmarks,
  onSwitchToAdvanced,
  totalLeaguePlayersAvailable,
  allPlayersLoaded,
  loadingAllPlayers,
  onLoadAllPlayers,
  windowSize,
  watchlistIds,
  onlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  onAddExternalPlayer,
  addingPlayerId,
}: PlayersExplorerViewProps) {
  const [viewMode, setViewMode] = useState<TableViewMode>('basic');
  const [unifiedFilters, setUnifiedFilters] = useState<UnifiedTableFiltersState>(
    DEFAULT_UNIFIED_FILTERS
  );
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ptsBase');
  const [sortAsc, setSortAsc] = useState(false);

  const entityLookup = useMemo(
    () => buildEntityLookupContext(players, teams),
    [players, teams]
  );

  const [remoteResults, setRemoteResults] = useState<SearchPlayerResult[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [mobileScrollTop, setMobileScrollTop] = useState(0);

  useEffect(() => {
    if (experienceMode === 'simple') {
      setViewMode('basic');
      if (
        sortKey !== 'watched' &&
        sortKey !== 'name' &&
        sortKey !== 'ptsVsNba' &&
        sortKey !== 'minBase' &&
        sortKey !== 'ptsBase' &&
        sortKey !== 'ptsWin' &&
        sortKey !== 'rebBase' &&
        sortKey !== 'astBase' &&
        sortKey !== 'tsPct'
      ) {
        setSortKey('ptsBase');
        setSortAsc(false);
      }
    }
  }, [experienceMode, sortKey]);

  const handleQueryChange = async (val: string) => {
    setQuery(val);
    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setRemoteResults([]);
      return;
    }
    setSearchingRemote(true);
    try {
      const res = await fetch(`/api/nba/search?q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const json = await res.json();
        setRemoteResults(json.results || []);
      }
    } catch {
      // Ignore transient search errors
    } finally {
      setSearchingRemote(false);
    }
  };

  const rows = useMemo(() => {
    return players.map((p) => {
      const games = p.games;
      const winSlice = games.slice(0, Math.min(windowSize, games.length));
      const minBase = round1(mean(games.map((g) => g.minutes)));
      const ptsBase = round1(mean(games.map((g) => g.points)));
      const ptsWin = round1(mean(winSlice.map((g) => g.points)));
      const pctDelta =
        ptsBase > 0 ? round1(((ptsWin - ptsBase) / ptsBase) * 100) : 0;

      const rebBase = round1(mean(games.map((g) => g.rebounds)));
      const orebBase = round1(mean(games.map((g) => g.oreb)));
      const astBase = round1(mean(games.map((g) => g.assists)));
      const stocksBase = round1(mean(games.map((g) => g.stocks)));
      const plusMinusBase = round1(mean(games.map((g) => g.plusMinus)));

      const fgm = games.reduce((s, g) => s + g.fgm, 0);
      const fga = games.reduce((s, g) => s + g.fga, 0);
      const fg3m = games.reduce((s, g) => s + g.fg3m, 0);
      const fg3a = games.reduce((s, g) => s + g.fg3a, 0);
      const fta = games.reduce((s, g) => s + g.fta, 0);
      const ptsTot = games.reduce((s, g) => s + g.points, 0);
      const tovTot = games.reduce((s, g) => s + g.turnovers, 0);
      const astTot = games.reduce((s, g) => s + g.assists, 0);

      const fgPct = fga > 0 ? round1((fgm / fga) * 100) : 0;
      const fg3Pct = fg3a > 0 ? round1((fg3m / fg3a) * 100) : 0;
      const calcEfg = fga > 0 ? round1(((fgm + 0.5 * fg3m) / fga) * 100) : 0;
      const tsDenom = 2 * (fga + 0.44 * fta);
      const calcTs = tsDenom > 0 ? round1((ptsTot / tsDenom) * 100) : 0;

      const adv = p.advanced;
      const usgPct = adv?.usgPct ?? round1(mean(games.map((g) => g.usgEst)));
      const usgWin = round1(mean(winSlice.map((g) => g.usgEst)));
      const tsPct = adv?.tsPct || calcTs;
      const efgPct = adv?.efgPct || calcEfg;
      const offRtg = adv?.offRtg ?? 0;
      const defRtg = adv?.defRtg ?? 0;
      const netRtg = adv?.netRtg ?? plusMinusBase;
      const pie = adv?.pie ?? 0;
      const gmSc = round1(mean(games.map((g) => g.gameScore)));

      const astPct = adv?.astPct ?? 0;
      const astTo =
        adv?.astTo ?? (tovTot > 0 ? round1(astTot / tovTot) : round1(astBase));
      const orebPct = adv?.orebPct ?? 0;
      const ptsPaint = adv?.ptsPaint ?? 0;
      const pts2ndChance = adv?.pts2ndChance ?? 0;
      const ptsFastBreak = adv?.ptsFastBreak ?? 0;
      const contestedShots = adv?.contestedShots ?? 0;
      const deflections = adv?.deflections ?? 0;
      const screenAssists = adv?.screenAssists ?? 0;

      return {
        ...p,
        minBase,
        ptsBase,
        ptsWin,
        pctDelta,
        rebBase,
        orebBase,
        astBase,
        stocksBase,
        fgPct,
        fg3Pct,
        plusMinusBase,
        usgPct,
        usgWin,
        tsPct,
        efgPct,
        offRtg,
        defRtg,
        netRtg,
        pie,
        gmSc,
        astPct,
        astTo,
        orebPct,
        ptsPaint,
        pts2ndChance,
        ptsFastBreak,
        contestedShots,
        deflections,
        screenAssists,
      };
    });
  }, [players, windowSize]);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query.trim());
    return rows
      .filter((r) => {
        if (onlyWatchlist && !watchlistIds.has(`player:${r.id}`)) return false;
        if (!matchesPlayerUnifiedFilters(r, unifiedFilters, entityLookup)) return false;
        if (q) {
          const hay = normalizeSearchText(
            `${r.name} ${r.teamAbbr} ${r.teamName} ${r.position} ${r.country || ''}`
          );
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'watched') {
          const wa = watchlistIds.has(`player:${a.id}`);
          const wb = watchlistIds.has(`player:${b.id}`);
          return compareSortValues(wa, wb, sortAsc) || b.ptsBase - a.ptsBase;
        }
        if (sortKey === 'name') {
          return compareSortValues(a.name, b.name, sortAsc);
        }
        if (sortKey === 'ptsVsNba') {
          return sortAsc ? a.ptsBase - b.ptsBase : b.ptsBase - a.ptsBase;
        }
        return sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey];
      });
  }, [rows, onlyWatchlist, watchlistIds, unifiedFilters, entityLookup, query, sortKey, sortAsc]);

  const existingIds = useMemo(() => new Set(players.map((p) => p.id)), [players]);
  const unaddedRemote = useMemo(
    () => remoteResults.filter((r) => !existingIds.has(r.id)),
    [remoteResults, existingIds]
  );

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const qualified = rows.filter((r) => r.minBase >= 20);
    const pool = qualified.length > 0 ? qualified : rows;
    const topScorer = [...pool].sort((a, b) => b.ptsBase - a.ptsBase)[0];
    const topUsage = [...pool].sort((a, b) => b.usgPct - a.usgPct)[0];
    const topPie = [...pool].sort((a, b) => b.pie - a.pie)[0];
    return { topScorer, topUsage, topPie };
  }, [rows]);

  const handleBuildPlayersSnapshot = async () => {
    const dateSlug = new Date().toISOString().slice(0, 10);
    const topRows = filtered.slice(0, 20);
    const modeSlug = experienceMode === 'simple' ? 'esencial' : viewMode;
    const filename = `radarnba-jugadores-${modeSlug}-${dateSlug}.png`;

    const posLabel =
      unifiedFilters.position === 'all'
        ? 'Todas las posiciones'
        : unifiedFilters.position === 'G'
        ? 'Bases / Escoltas (G)'
        : unifiedFilters.position === 'F'
        ? 'Aleros (F)'
        : 'Pívots (C)';

    const isAdvancedLayer = experienceMode === 'advanced' && viewMode === 'advanced';
    const isHustleLayer =
      experienceMode === 'advanced' && viewMode === 'zones_hustle';

    return buildTableSnapshotBlob({
      filename,
      categoryTag: 'EXPLORADOR DE JUGADORES NBA',
      title: isAdvancedLayer
        ? 'Ranking de Impacto Avanzado y Eficiencia NBA'
        : isHustleLayer
        ? 'Ranking de Pintura, Creación e Intangibles (Hustle)'
        : 'Ranking Estadístico de Jugadores NBA',
      subtitle: `${posLabel} · ${filtered.length} jugadores · Ventana reciente Últ. ${windowSize} PJ`,
      entityColumnLabel: 'JUGADOR',
      entityColumnWeight: 2.3,
      kpis: [
        {
          label: 'MUESTRA FILTRADA',
          value: `${filtered.length} jug.`,
          sublabel: query.trim() ? `Búsqueda: "${query.trim()}"` : posLabel,
        },
        {
          label: 'LÍDER ANOTACIÓN',
          value: summary?.topScorer ? summary.topScorer.name : '—',
          sublabel: summary?.topScorer
            ? `${summary.topScorer.ptsBase.toFixed(1)} PTS (${summary.topScorer.teamAbbr})`
            : undefined,
          tone: 'accent',
        },
        {
          label: 'MAYOR IMPACTO PIE',
          value: summary?.topPie ? summary.topPie.name : '—',
          sublabel: summary?.topPie
            ? `${summary.topPie.pie.toFixed(1)}% PIE (${summary.topPie.teamAbbr})`
            : undefined,
          tone: 'positive',
        },
      ],
      columns: isAdvancedLayer
        ? [
            { key: 'min', label: 'MIN', align: 'right', widthWeight: 0.8 },
            { key: 'pie', label: 'PIE%', align: 'right', widthWeight: 0.95 },
            { key: 'usg', label: 'USG%', align: 'right', widthWeight: 0.95 },
            { key: 'ts', label: 'TS%', align: 'right', widthWeight: 0.95 },
            { key: 'net', label: 'NET RTG', align: 'right', widthWeight: 1.0 },
            { key: 'gmsc', label: 'GMSC', align: 'right', widthWeight: 0.95 },
          ]
        : isHustleLayer
        ? [
            { key: 'paint', label: 'PINTURA', align: 'right', widthWeight: 0.95 },
            { key: 'astPct', label: 'AST%', align: 'right', widthWeight: 0.9 },
            { key: 'orebPct', label: 'OREB%', align: 'right', widthWeight: 0.9 },
            { key: 'defl', label: 'DESVÍOS', align: 'right', widthWeight: 0.95 },
            { key: 'cont', label: 'PUNTEADOS', align: 'right', widthWeight: 1.0 },
            { key: 'scr', label: 'PANTALLAS', align: 'right', widthWeight: 1.0 },
          ]
        : [
            { key: 'min', label: 'MIN', align: 'right', widthWeight: 0.8 },
            { key: 'pts', label: 'PTS', align: 'right', widthWeight: 0.9 },
            { key: 'win', label: `ÚLT. ${windowSize} PJ`, align: 'right', widthWeight: 1.05 },
            { key: 'reb', label: 'REB', align: 'right', widthWeight: 0.85 },
            { key: 'ast', label: 'AST', align: 'right', widthWeight: 0.85 },
            { key: 'ts', label: 'TS%', align: 'right', widthWeight: 0.95 },
          ],
      rows: topRows.map((r, idx) => {
        const cells: Record<string, TableSnapshotCell | string> = isAdvancedLayer
          ? {
              min: { text: r.minBase.toFixed(1) },
              pie: { text: `${r.pie.toFixed(1)}%`, tone: 'accent' },
              usg: { text: `${r.usgPct.toFixed(1)}%` },
              ts: {
                text: `${r.tsPct.toFixed(1)}%`,
                tone: r.tsPct >= 60 ? 'positive' : r.tsPct < 53 ? 'warning' : 'neutral',
              },
              net: {
                text: formatSigned(r.netRtg, 1),
                tone: r.netRtg >= 4 ? 'positive' : r.netRtg <= -4 ? 'negative' : 'neutral',
              },
              gmsc: { text: r.gmSc.toFixed(1) },
            }
          : isHustleLayer
          ? {
              paint: { text: r.ptsPaint.toFixed(1), tone: 'accent' },
              astPct: { text: `${r.astPct.toFixed(1)}%` },
              orebPct: { text: `${r.orebPct.toFixed(1)}%` },
              defl: { text: r.deflections.toFixed(1), tone: 'positive' },
              cont: { text: r.contestedShots.toFixed(1) },
              scr: { text: r.screenAssists.toFixed(1) },
            }
          : {
              min: { text: r.minBase.toFixed(1) },
              pts: { text: r.ptsBase.toFixed(1), tone: 'accent' },
              win: {
                text: r.ptsWin.toFixed(1),
                subtext: `${formatSigned(r.pctDelta, 0)}%`,
                tone:
                  r.pctDelta >= 12
                    ? 'positive'
                    : r.pctDelta <= -12
                    ? 'negative'
                    : 'neutral',
              },
              reb: { text: r.rebBase.toFixed(1) },
              ast: { text: r.astBase.toFixed(1) },
              ts: { text: `${r.tsPct.toFixed(1)}%` },
            };
        return {
          rank: idx + 1,
          teamAbbr: r.teamAbbr,
          entityName: r.name,
          entitySubtext: `${r.position} · ${r.gamesPlayed} PJ`,
          cells,
        };
      }),
      footerNote: `Mostrando top ${topRows.length} de ${filtered.length} jugadores según el orden actual de la tabla`,
    });
  };

  const handleModeSwitch = (mode: TableViewMode) => {
    setViewMode(mode);
    if (mode === 'basic') {
      setSortKey('ptsBase');
      setSortAsc(false);
    } else if (mode === 'advanced') {
      setSortKey('pie');
      setSortAsc(false);
    } else {
      setSortKey('ptsPaint');
      setSortAsc(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === 'defRtg' || key === 'name');
    }
  };

  const SH = ({
    label,
    k,
    helpKey,
    className = 'py-3 px-2.5',
    align = 'right',
  }: {
    label: string;
    k: SortKey;
    helpKey?: string;
    className?: string;
    align?: 'left' | 'right';
  }) => (
    <SortableTh
      label={label}
      helpKey={helpKey ?? k}
      active={sortKey === k}
      asc={sortAsc}
      onSort={() => toggleSort(k)}
      align={align}
      className={className}
    />
  );

  const mobileSortOptions: Array<{ id: SortKey; label: string }> =
    experienceMode === 'simple'
      ? [
          { id: 'ptsBase', label: 'Puntos' },
          { id: 'ptsWin', label: `Últ. ${windowSize} PJ` },
          { id: 'rebBase', label: 'Rebotes' },
          { id: 'astBase', label: 'Asistencias' },
          { id: 'tsPct', label: 'Acierto TS%' },
          { id: 'minBase', label: 'Minutos' },
        ]
      : viewMode === 'basic'
      ? [
          { id: 'ptsBase', label: 'PTS Base' },
          { id: 'ptsWin', label: `Últ. ${windowSize}` },
          { id: 'pctDelta', label: 'Delta %' },
          { id: 'rebBase', label: 'REB' },
          { id: 'astBase', label: 'AST' },
          { id: 'stocksBase', label: 'STK' },
          { id: 'plusMinusBase', label: '+/-' },
        ]
      : viewMode === 'advanced'
      ? [
          { id: 'pie', label: 'PIE%' },
          { id: 'usgPct', label: 'USG%' },
          { id: 'tsPct', label: 'TS%' },
          { id: 'netRtg', label: 'NetRtg' },
          { id: 'gmSc', label: 'GmSc' },
          { id: 'offRtg', label: 'OffRtg' },
          { id: 'defRtg', label: 'DefRtg' },
        ]
      : [
          { id: 'ptsPaint', label: 'Pintura' },
          { id: 'astPct', label: 'AST%' },
          { id: 'orebPct', label: 'OREB%' },
          { id: 'deflections', label: 'Desvíos' },
          { id: 'contestedShots', label: 'Punteados' },
          { id: 'screenAssists', label: 'Screen AST' },
        ];

  const mobileCardHeight = experienceMode === 'simple' ? 152 : 118;
  const mobileContainerHeight = 580;
  const mobileStartIndex = Math.max(
    0,
    Math.floor(mobileScrollTop / mobileCardHeight) - 4
  );
  const mobileVisibleCount =
    Math.ceil(mobileContainerHeight / mobileCardHeight) + 8;
  const mobileEndIndex = Math.min(
    filtered.length,
    mobileStartIndex + mobileVisibleCount
  );
  const mobileTopSpacer = mobileStartIndex * mobileCardHeight;
  const mobileBottomSpacer = Math.max(
    0,
    (filtered.length - mobileEndIndex) * mobileCardHeight
  );
  const mobileVisiblePlayers = useMemo(
    () => filtered.slice(mobileStartIndex, mobileEndIndex),
    [filtered, mobileStartIndex, mobileEndIndex]
  );

  return (
    <div className="space-y-5">
      {/* Row 1: Homogeneous 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Jugadores (NBA.com)</span>
            <MetricInfoTooltip helpKey="ptsBase" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {players.length}
            <span className="text-xs sm:text-sm text-slate-500 font-normal">
              {' '}
              / {Math.max(players.length, totalLeaguePlayersAvailable)}
            </span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Media NBA: {benchmarks.player.pts.mean.toFixed(1)} PTS
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Máximo anotador</span>
            <MetricInfoTooltip helpKey="ptsBase" align="right" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.topScorer && (
              <PlayerAvatar
                playerId={summary.topScorer.id}
                name={summary.topScorer.name}
                headshotUrl={summary.topScorer.headshotUrl}
                teamAbbr={summary.topScorer.teamAbbr}
                showTeamBadge
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.topScorer?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
                {summary?.topScorer
                  ? `${summary.topScorer.ptsBase.toFixed(1)} PTS · Élite NBA`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Más jugadas asume'
                : 'Mayor Uso (USG%)'}
            </span>
            <MetricInfoTooltip helpKey="usgPct" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.topUsage && (
              <PlayerAvatar
                playerId={summary.topUsage.id}
                name={summary.topUsage.name}
                headshotUrl={summary.topUsage.headshotUrl}
                teamAbbr={summary.topUsage.teamAbbr}
                showTeamBadge
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.topUsage?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
                {summary?.topUsage
                  ? experienceMode === 'simple'
                    ? `${summary.topUsage.usgPct.toFixed(1)}% ataques · 1ª Estrella`
                    : `${summary.topUsage.usgPct.toFixed(1)}% USG · ${summary.topUsage.gmSc.toFixed(1)} GmSc`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Impacto total'
                : 'Mayor Impacto (PIE)'}
            </span>
            <MetricInfoTooltip helpKey="pie" align="right" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.topPie && (
              <PlayerAvatar
                playerId={summary.topPie.id}
                name={summary.topPie.name}
                headshotUrl={summary.topPie.headshotUrl}
                teamAbbr={summary.topPie.teamAbbr}
                showTeamBadge
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.topPie?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-slate-300 truncate">
                {summary?.topPie
                  ? experienceMode === 'simple'
                    ? `Impacto ${summary.topPie.pie.toFixed(1)}% · Nivel MVP`
                    : `${summary.topPie.pie.toFixed(1)}% PIE · Net ${formatSigned(summary.topPie.netRtg)}`
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Homogeneous Layer / Guidance + Position + Search */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3.5 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {experienceMode === 'simple' ? (
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <span className="text-xs text-slate-300">
                Vista clara con traducción humana y barra frente a la Media de la NBA.
              </span>
              <button
                type="button"
                onClick={onSwitchToAdvanced}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Ver 20+ métricas avanzadas y Hustle</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <span className="text-xs text-slate-400 whitespace-nowrap">
                Capa estadística:
              </span>
              <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
                {(
                  [
                    { id: 'basic', label: '1. Básicas' },
                    { id: 'advanced', label: '2. Avanzadas e Impacto' },
                    { id: 'zones_hustle', label: '3. Pintura y Hustle' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModeSwitch(m.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      viewMode === m.id
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!allPlayersLoaded && totalLeaguePlayersAvailable > players.length && (
            <div className="inline-flex items-center gap-1.5 self-start xl:self-auto shrink-0">
              <button
                type="button"
                disabled={loadingAllPlayers}
                onClick={onLoadAllPlayers}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#283548] rounded-lg text-orange-300 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <Users className="w-3.5 h-3.5 text-orange-400" />
                <span>
                  {loadingAllPlayers
                    ? 'Cargando censo...'
                    : `Ampliar censo (+${
                        totalLeaguePlayersAvailable - players.length
                      } → ${totalLeaguePlayersAvailable} NBA)`}
                </span>
              </button>
              <MetricInfoTooltip helpKey="loadFullLeagueCensus" align="right" />
            </div>
          )}
        </div>

        <div className="pt-2.5 border-t border-[#1E293B] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => void handleQueryChange(e.target.value)}
              placeholder="Buscar jugador (Jokic, Doncic, Aldama)..."
              className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ExportImageButton
              onBuildImage={handleBuildPlayersSnapshot}
              disabled={filtered.length === 0}
            />
          </div>
        </div>
      </div>

      <UnifiedEntityFilterBar
        filters={unifiedFilters}
        onChange={setUnifiedFilters}
        players={players}
        teams={teams}
        entityScope="player"
        shownCount={filtered.length}
        totalCount={rows.length}
        unitLabel="jugadores"
      />

      {/* On-demand NBA Player Loader Banner */}
      {query.trim().length >= 2 && (unaddedRemote.length > 0 || searchingRemote) && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-300">
            {searchingRemote
              ? 'Buscando en la base oficial NBA.com...'
              : 'Añadir jugador adicional a la sesión actual:'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {unaddedRemote.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={addingPlayerId === item.id}
                onClick={() => void onAddExternalPlayer(item)}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#283548] rounded-md text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                <PlayerAvatar
                  playerId={item.id}
                  name={item.name}
                  teamAbbr={item.teamAbbr}
                  size="xs"
                />
                <span>
                  {addingPlayerId === item.id
                    ? `Cargando ${item.name}...`
                    : `${item.name} · ${item.teamAbbr}`}
                </span>
                <Plus className="w-3.5 h-3.5 text-orange-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Row 3: Homogeneous Player Data Table */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-200">
              Ningún jugador en tabla coincide con el filtro actual.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Usa el buscador superior o pulsa en cargar toda la liga para incluir jugadores de rotación profunda.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Sort Strip + Virtualized Player Cards (< md) */}
            <div className="md:hidden">
              <div className="px-3.5 py-2 bg-[#0F172A]/70 border-b border-[#1E293B] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                  Ordenar ({filtered.length}):
                </span>
                {mobileSortOptions.map((opt) => {
                  const active = sortKey === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleSort(opt.id)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-[#1E293B] text-orange-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                      {active ? (sortAsc ? ' ↑' : ' ↓') : ''}
                    </button>
                  );
                })}
              </div>

              <div
                className="max-h-[580px] overflow-y-auto divide-y divide-[#1E293B]"
                onScroll={(e) => setMobileScrollTop(e.currentTarget.scrollTop)}
              >
                {mobileTopSpacer > 0 && (
                  <div
                    style={{ height: `${mobileTopSpacer}px` }}
                    aria-hidden="true"
                  />
                )}
                {mobileVisiblePlayers.map((p) => {
                  const wKey = `player:${p.id}`;
                  const watched = watchlistIds.has(wKey);
                  const roleHint = qualifyUsageRole(p.usgPct);
                  const formHint = qualifyRecentDelta(p.pctDelta);

                  return (
                    <div
                      key={p.id}
                      onClick={() => onInspectEntity('player', p.id)}
                      style={{ height: `${mobileCardHeight}px` }}
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
                                watched ? 'fill-orange-400 text-orange-400' : ''
                              }`}
                            />
                          </button>
                          <PlayerAvatar
                            playerId={p.id}
                            name={p.name}
                            headshotUrl={p.headshotUrl}
                            teamAbbr={p.teamAbbr}
                            showTeamBadge
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-100 truncate">
                              {p.name}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              <span>
                                {p.teamAbbr} · {p.position} · {p.games.length} PJ
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span className={roleHint.textClass}>
                                {roleHint.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono tabular-nums shrink-0">
                          {experienceMode === 'simple' || viewMode === 'basic' ? (
                            <>
                              <div className="text-sm font-bold text-slate-100">
                                {p.ptsBase.toFixed(1)} PTS
                              </div>
                              <div className={`text-[11px] ${formHint.textClass}`}>
                                Últ.{windowSize}: {p.ptsWin.toFixed(1)}
                              </div>
                            </>
                          ) : viewMode === 'advanced' ? (
                            <>
                              <div className="text-sm font-bold text-orange-300">
                                {p.pie > 0 ? `${p.pie.toFixed(1)}% PIE` : `${p.gmSc.toFixed(1)} GmSc`}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                USG {p.usgPct.toFixed(1)}%
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-sm font-bold text-slate-100">
                                {p.ptsPaint.toFixed(1)} Pint.
                              </div>
                              <div className="text-[11px] text-emerald-300">
                                {p.deflections.toFixed(1)} desv.
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {experienceMode === 'simple' ? (
                        <>
                          <div className="grid grid-cols-4 gap-1.5 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-1.5 text-xs">
                            <div>
                              <div className="text-[10px] text-slate-400">MIN</div>
                              <div className="font-mono tabular-nums text-slate-200">
                                {p.minBase.toFixed(1)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">REB</div>
                              <div className="font-mono tabular-nums text-slate-200">
                                {p.rebBase.toFixed(1)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">AST</div>
                              <div className="font-mono tabular-nums text-slate-200">
                                {p.astBase.toFixed(1)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400">TS%</div>
                              <div className="font-mono tabular-nums text-emerald-300">
                                {p.tsPct.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                          <NbaComparisonBar
                            value={p.ptsBase}
                            benchmark={benchmarks.player.pts}
                            compact
                          />
                        </>
                      ) : viewMode === 'basic' ? (
                        <div className="grid grid-cols-4 gap-1.5 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-1.5 text-xs">
                          <div>
                            <div className="text-[10px] text-slate-400">REB (OR)</div>
                            <div className="font-mono tabular-nums text-slate-200">
                              {p.rebBase.toFixed(1)} ({p.orebBase.toFixed(1)})
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400">AST / STK</div>
                            <div className="font-mono tabular-nums text-slate-200">
                              {p.astBase.toFixed(1)} / {p.stocksBase.toFixed(1)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400">Delta %</div>
                            <div
                              className={`font-mono tabular-nums ${
                                p.pctDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatSigned(p.pctDelta, 0, '%')}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400">+/-</div>
                            <div
                              className={`font-mono tabular-nums ${
                                p.plusMinusBase >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatSigned(p.plusMinusBase, 1)}
                            </div>
                          </div>
                        </div>
                      ) : viewMode === 'advanced' ? (
                        <div className="grid grid-cols-4 gap-1.5 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-1.5 text-xs">
                          <div>
                            <div className="text-[10px] text-slate-400">TS% / eFG%</div>
                            <div className="font-mono tabular-nums text-emerald-300">
                              {p.tsPct.toFixed(0)}%/{p.efgPct.toFixed(0)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400">Off / Def</div>
                            <div className="font-mono tabular-nums text-slate-200">
                              {p.offRtg > 0 ? `${p.offRtg.toFixed(0)}/${p.defRtg.toFixed(0)}` : '—'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400">NetRtg</div>
                            <div
                              className={`font-mono tabular-nums ${
                                p.netRtg >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatSigned(p.netRtg, 1)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400">GmSc</div>
                            <div className="font-mono tabular-nums text-slate-100">
                              {p.gmSc.toFixed(1)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-1.5 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-1.5 text-xs">
                          <div>
                            <div className="text-[10px] text-slate-400">AST% / A:T</div>
                            <div className="font-mono tabular-nums text-slate-200">
                              {p.astPct > 0 ? `${p.astPct.toFixed(0)}%` : '—'}/{p.astTo.toFixed(1)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400">OREB%</div>
                            <div className="font-mono tabular-nums text-orange-300">
                              {p.orebPct > 0 ? `${p.orebPct.toFixed(1)}%` : '—'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400">Punteados</div>
                            <div className="font-mono tabular-nums text-slate-200">
                              {p.contestedShots.toFixed(1)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400">Screen AST</div>
                            <div className="font-mono tabular-nums text-slate-200">
                              {p.screenAssists.toFixed(1)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {mobileBottomSpacer > 0 && (
                  <div
                    style={{ height: `${mobileBottomSpacer}px` }}
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>

            {/* Desktop Full Table (md+) */}
            <div className="hidden md:block overflow-auto max-h-[72vh]">
              <table className="w-full text-left border-collapse">
              <thead className={STICKY_THEAD_CLASS}>
                <tr className="text-xs text-slate-400">
                  <SortableTh
                    label="Seg."
                    active={sortKey === 'watched'}
                    asc={sortAsc}
                    onSort={() => toggleSort('watched')}
                    align="left"
                    className="py-3 pl-4 pr-2 w-12"
                    compact
                  />
                  <SortableTh
                    label="Jugador y Rol"
                    active={sortKey === 'name'}
                    asc={sortAsc}
                    onSort={() => toggleSort('name')}
                    align="left"
                    className="py-3 px-3"
                  />

                  {experienceMode === 'simple' ? (
                    <>
                      <SH label="Minutos" k="minBase" />
                      <SH label="Puntos" k="ptsBase" />
                      <SH label={`Últ. ${windowSize} PJ`} k="ptsWin" />
                      <SH label="Rebotes" k="rebBase" />
                      <SH label="Asistencias" k="astBase" />
                      <SH label="Acierto Real" k="tsPct" />
                      <SH
                        label="Nivel anotador vs Media NBA"
                        k="ptsVsNba"
                        helpKey="vsLeagueBar"
                        align="left"
                        className="py-3 pl-3 pr-4 w-56"
                      />
                    </>
                  ) : (
                    <>
                      {viewMode === 'basic' && (
                        <>
                          <SH label="MIN" k="minBase" />
                          <SH label="PTS Base" k="ptsBase" />
                          <SH label={`Últ. ${windowSize}`} k="ptsWin" />
                          <SH label="Delta %" k="pctDelta" />
                          <SH label="REB" k="rebBase" />
                          <SH label="OR" k="orebBase" />
                          <SH label="AST" k="astBase" />
                          <SH label="STK" k="stocksBase" />
                          <SH label="TC%" k="fgPct" />
                          <SH
                            label="+/-"
                            k="plusMinusBase"
                            className="py-3 pl-2.5 pr-4"
                          />
                        </>
                      )}

                      {viewMode === 'advanced' && (
                        <>
                          <SH label="MIN" k="minBase" />
                          <SH label="USG% Base" k="usgPct" />
                          <SH label={`USG Últ.${windowSize}`} k="usgWin" />
                          <SH label="TS%" k="tsPct" />
                          <SH label="eFG%" k="efgPct" />
                          <SH label="OffRtg" k="offRtg" />
                          <SH label="DefRtg" k="defRtg" />
                          <SH label="NetRtg" k="netRtg" />
                          <SH label="PIE%" k="pie" />
                          <SH
                            label="GmSc"
                            k="gmSc"
                            className="py-3 pl-2.5 pr-4"
                          />
                        </>
                      )}

                      {viewMode === 'zones_hustle' && (
                        <>
                          <SH label="AST%" k="astPct" />
                          <SH label="AST/PER" k="astTo" />
                          <SH label="OREB%" k="orebPct" />
                          <SH label="PTS Pintura" k="ptsPaint" />
                          <SH label="2ª Jugada" k="pts2ndChance" />
                          <SH label="Contraat." k="ptsFastBreak" />
                          <SH label="Punteados" k="contestedShots" />
                          <SH label="Desvíos" k="deflections" />
                          <SH
                            label="Screen AST"
                            k="screenAssists"
                            className="py-3 pl-2.5 pr-4"
                          />
                        </>
                      )}
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-sm">
                {filtered.map((p) => {
                  const wKey = `player:${p.id}`;
                  const watched = watchlistIds.has(wKey);
                  const isPos = p.pctDelta >= 0;
                  const roleHint = qualifyUsageRole(p.usgPct);
                  const formHint = qualifyRecentDelta(p.pctDelta);
                  const tsEval = evaluateVsLeague(
                    p.tsPct,
                    benchmarks.player.tsPct
                  );

                  return (
                    <tr
                      key={p.id}
                      onClick={() => onInspectEntity('player', p.id)}
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
                            playerId={p.id}
                            name={p.name}
                            headshotUrl={p.headshotUrl}
                            teamAbbr={p.teamAbbr}
                            showTeamBadge
                            size="sm"
                          />
                          <div>
                            <div className="font-medium text-slate-100 whitespace-nowrap">
                              {p.name}
                            </div>
                            <div className="text-xs text-slate-400 whitespace-nowrap">
                              <span>
                                {p.teamAbbr} · {p.position} · {p.games.length} PJ
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span className={roleHint.textClass}>
                                {roleHint.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {experienceMode === 'simple' ? (
                        <>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                            {p.minBase.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                            {p.ptsBase.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                            <div className="font-mono tabular-nums font-semibold text-slate-100">
                              {p.ptsWin.toFixed(1)}
                            </div>
                            <div className={`text-[11px] ${formHint.textClass}`}>
                              {p.pctDelta > 2 ? '▲ ' : p.pctDelta < -2 ? '▼ ' : ''}
                              {formHint.label}
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                            {p.rebBase.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                            {p.astBase.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                            <div className="font-mono tabular-nums text-slate-100">
                              {p.tsPct.toFixed(1)}%
                            </div>
                            <div className={`text-[11px] ${tsEval.textClass}`}>
                              {tsEval.tierLabel}
                            </div>
                          </td>
                          <td className="py-2.5 pl-3 pr-4">
                            <NbaComparisonBar
                              value={p.ptsBase}
                              benchmark={benchmarks.player.pts}
                              compact
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          {viewMode === 'basic' && (
                            <>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.minBase.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                                {p.ptsBase.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                                {p.ptsWin.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                                <span
                                  className={
                                    Math.abs(p.pctDelta) < 2
                                      ? 'text-slate-400'
                                      : isPos
                                      ? 'text-emerald-400 font-medium'
                                      : 'text-rose-400 font-medium'
                                  }
                                >
                                  {p.pctDelta > 2
                                    ? '▲ '
                                    : p.pctDelta < -2
                                    ? '▼ '
                                    : ''}
                                  {formatSigned(p.pctDelta, 1, '%')}
                                </span>
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.rebBase.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-orange-300/90 whitespace-nowrap">
                                {p.orebBase.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.astBase.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.stocksBase.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.fgPct.toFixed(1)}%
                              </td>
                              <td className="py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                                <span
                                  className={
                                    p.plusMinusBase > 0.2
                                      ? 'text-emerald-400'
                                      : p.plusMinusBase < -0.2
                                      ? 'text-rose-400'
                                      : 'text-slate-400'
                                  }
                                >
                                  {formatSigned(p.plusMinusBase, 1)}
                                </span>
                              </td>
                            </>
                          )}

                          {viewMode === 'advanced' && (
                            <>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.minBase.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-medium text-slate-200 whitespace-nowrap">
                                {p.usgPct.toFixed(1)}%
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-orange-300 whitespace-nowrap">
                                {p.usgWin.toFixed(1)}%
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-emerald-300 whitespace-nowrap">
                                {p.tsPct.toFixed(1)}%
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.efgPct.toFixed(1)}%
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                                {p.offRtg > 0 ? p.offRtg.toFixed(1) : '—'}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.defRtg > 0 ? p.defRtg.toFixed(1) : '—'}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                                <span
                                  className={
                                    p.netRtg > 0.2
                                      ? 'text-emerald-400 font-medium'
                                      : p.netRtg < -0.2
                                      ? 'text-rose-400 font-medium'
                                      : 'text-slate-400'
                                  }
                                >
                                  {formatSigned(p.netRtg, 1)}
                                </span>
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                                {p.pie > 0 ? `${p.pie.toFixed(1)}%` : '—'}
                              </td>
                              <td className="py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                                {p.gmSc.toFixed(1)}
                              </td>
                            </>
                          )}

                          {viewMode === 'zones_hustle' && (
                            <>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                                {p.astPct > 0 ? `${p.astPct.toFixed(1)}%` : '—'}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.astTo.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-orange-300 whitespace-nowrap">
                                {p.orebPct > 0 ? `${p.orebPct.toFixed(1)}%` : '—'}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                                {p.ptsPaint.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                                {p.pts2ndChance.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.ptsFastBreak.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                                {p.contestedShots.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-emerald-300 whitespace-nowrap">
                                {p.deflections.toFixed(1)}
                              </td>
                              <td className="py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                {p.screenAssists.toFixed(1)}
                              </td>
                            </>
                          )}
                        </>
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
    </div>
  );
}
