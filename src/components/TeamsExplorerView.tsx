import { useEffect, useMemo, useState } from 'react';
import { Search, Sliders, Star } from 'lucide-react';
import type { ExperienceMode, TeamSummary, WindowSize } from '../types/nba';
import {
  formatSigned,
  mean,
  normalizeSearchText,
  round1,
} from '../utils/analytics';
import {
  evaluateVsLeague,
  type LeagueBenchmarks,
} from '../utils/humanize';
import {
  ColumnHelpHeader,
  MetricInfoTooltip,
  NbaComparisonBar,
} from './MetricUiHelpers';

interface TeamsExplorerViewProps {
  teams: TeamSummary[];
  experienceMode: ExperienceMode;
  benchmarks: LeagueBenchmarks;
  onSwitchToAdvanced: () => void;
  windowSize: WindowSize;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
}

type TeamTableView = 'basic' | 'advanced' | 'zones_hustle';

type SortKey =
  | 'winPct'
  | 'avgPointsFor'
  | 'avgPointsAgainst'
  | 'differential'
  | 'windowDiff'
  | 'orebAvg'
  | 'fg3mAvg'
  | 'offRtg'
  | 'defRtg'
  | 'netRtg'
  | 'winNetRtg'
  | 'pace'
  | 'efgPct'
  | 'tsPct'
  | 'orebPct'
  | 'tovPct'
  | 'pie'
  | 'ptsPaint'
  | 'oppPtsPaint'
  | 'pts2ndChance'
  | 'ptsFastBreak'
  | 'ptsOffTov'
  | 'contestedShots'
  | 'deflections'
  | 'boxOuts';

function humanStreakCode(code: string): string {
  if (!code) return '—';
  const num = code.replace(/[^0-9]/g, '');
  if (code.startsWith('W')) return `${num} ${num === '1' ? 'victoria' : 'victorias'}`;
  if (code.startsWith('L')) return `${num} ${num === '1' ? 'derrota' : 'derrotas'}`;
  return code;
}

export function TeamsExplorerView({
  teams,
  experienceMode,
  benchmarks,
  onSwitchToAdvanced,
  windowSize,
  watchlistIds,
  onlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
}: TeamsExplorerViewProps) {
  const [viewMode, setViewMode] = useState<TeamTableView>('basic');
  const [confFilter, setConfFilter] = useState<'all' | 'Este' | 'Oeste'>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('winPct');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (experienceMode === 'simple') {
      setViewMode('basic');
      if (
        sortKey !== 'winPct' &&
        sortKey !== 'avgPointsFor' &&
        sortKey !== 'avgPointsAgainst' &&
        sortKey !== 'differential' &&
        sortKey !== 'windowDiff'
      ) {
        setSortKey('winPct');
        setSortAsc(false);
      }
    }
  }, [experienceMode, sortKey]);

  const enrichedTeams = useMemo(() => {
    return teams.map((t) => {
      const games = t.games;
      const slice = games.slice(0, Math.min(windowSize, games.length));
      const windowDiff =
        slice.length > 0
          ? round1(mean(slice.map((g) => g.differential)))
          : t.differential;
      const orebAvg = round1(mean(games.map((g) => g.oreb)));
      const rebAvg = round1(mean(games.map((g) => g.reb)));
      const fg3mAvg = round1(mean(games.map((g) => g.fg3m)));
      const fg3aTot = games.reduce((s, g) => s + g.fg3a, 0);
      const fg3mTot = games.reduce((s, g) => s + g.fg3m, 0);
      const fg3Pct = fg3aTot > 0 ? round1((fg3mTot / fg3aTot) * 100) : 0;

      const adv = t.advanced;
      const offRtg = adv?.offRtg ?? round1(mean(games.map((g) => g.offRtg)));
      const defRtg = adv?.defRtg ?? round1(mean(games.map((g) => g.defRtg)));
      const netRtg = adv?.netRtg ?? round1(offRtg - defRtg);
      const winNetRtg =
        slice.length > 0 ? round1(mean(slice.map((g) => g.netRtg))) : netRtg;
      const pace = adv?.pace ?? round1(mean(games.map((g) => g.pace)));
      const efgPct = adv?.efgPct ?? round1(mean(games.map((g) => g.efgPct)));
      const tsPct = adv?.tsPct ?? round1(mean(games.map((g) => g.tsPct)));
      const orebPct = adv?.orebPct ?? round1(mean(games.map((g) => g.orebPct)));
      const tovPct = adv?.tovPct ?? round1(mean(games.map((g) => g.tovPct)));
      const pie = adv?.pie ?? 50;

      const ptsPaint = adv?.ptsPaint ?? 0;
      const oppPtsPaint = adv?.oppPtsPaint ?? 0;
      const pts2ndChance = adv?.pts2ndChance ?? 0;
      const ptsFastBreak = adv?.ptsFastBreak ?? 0;
      const ptsOffTov = adv?.ptsOffTov ?? 0;
      const contestedShots = adv?.contestedShots ?? 0;
      const deflections = adv?.deflections ?? 0;
      const boxOuts = adv?.boxOuts ?? 0;

      return {
        ...t,
        windowDiff,
        orebAvg,
        rebAvg,
        fg3mAvg,
        fg3Pct,
        offRtg,
        defRtg,
        netRtg,
        winNetRtg,
        pace,
        efgPct,
        tsPct,
        orebPct,
        tovPct,
        pie,
        ptsPaint,
        oppPtsPaint,
        pts2ndChance,
        ptsFastBreak,
        ptsOffTov,
        contestedShots,
        deflections,
        boxOuts,
      };
    });
  }, [teams, windowSize]);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query.trim());
    return enrichedTeams
      .filter((t) => {
        if (onlyWatchlist && !watchlistIds.has(`team:${t.id}`)) return false;
        if (confFilter !== 'all' && t.conference !== confFilter) return false;
        if (q) {
          const hay = normalizeSearchText(
            `${t.name} ${t.abbreviation} ${t.conference}`
          );
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) =>
        sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]
      );
  }, [
    enrichedTeams,
    onlyWatchlist,
    watchlistIds,
    confFilter,
    query,
    sortKey,
    sortAsc,
  ]);

  const summary = useMemo(() => {
    if (enrichedTeams.length === 0) return null;
    const bestNet = [...enrichedTeams].sort((a, b) => b.netRtg - a.netRtg)[0];
    const bestDef = [...enrichedTeams].sort((a, b) => a.defRtg - b.defRtg)[0];
    const fastest = [...enrichedTeams].sort((a, b) => b.pace - a.pace)[0];
    return { bestNet, bestDef, fastest };
  }, [enrichedTeams]);

  const handleModeSwitch = (mode: TeamTableView) => {
    setViewMode(mode);
    if (mode === 'basic') {
      setSortKey('winPct');
      setSortAsc(false);
    } else if (mode === 'advanced') {
      setSortKey('netRtg');
      setSortAsc(false);
    } else {
      setSortKey('ptsPaint');
      setSortAsc(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(
        key === 'avgPointsAgainst' ||
          key === 'defRtg' ||
          key === 'tovPct' ||
          key === 'oppPtsPaint'
      );
    }
  };

  const SH = ({
    label,
    k,
    helpKey,
  }: {
    label: string;
    k: SortKey;
    helpKey?: string;
  }) => (
    <ColumnHelpHeader
      label={label}
      helpKey={helpKey ?? k}
      sortable
      activeSort={sortKey === k}
      sortAsc={sortAsc}
      onSort={() => handleSort(k)}
    />
  );

  const mobileSortOptions: Array<{ id: SortKey; label: string }> =
    experienceMode === 'simple'
      ? [
          { id: 'winPct', label: 'Victorias' },
          { id: 'windowDiff', label: `Margen Últ.${windowSize}` },
          { id: 'avgPointsFor', label: 'Ataque' },
          { id: 'avgPointsAgainst', label: 'Defensa' },
        ]
      : viewMode === 'basic'
      ? [
          { id: 'winPct', label: '% Victorias' },
          { id: 'differential', label: 'Dif. Base' },
          { id: 'windowDiff', label: `Dif. Últ.${windowSize}` },
          { id: 'avgPointsFor', label: 'PTS Favor' },
          { id: 'avgPointsAgainst', label: 'PTS Contra' },
        ]
      : viewMode === 'advanced'
      ? [
          { id: 'netRtg', label: 'NetRtg' },
          { id: 'winNetRtg', label: `Net Últ.${windowSize}` },
          { id: 'offRtg', label: 'OffRtg' },
          { id: 'defRtg', label: 'DefRtg' },
          { id: 'pace', label: 'Pace' },
          { id: 'tsPct', label: 'TS%' },
        ]
      : [
          { id: 'ptsPaint', label: 'PTS Pintura' },
          { id: 'pts2ndChance', label: '2ª Jugada' },
          { id: 'ptsFastBreak', label: 'Contraataque' },
          { id: 'deflections', label: 'Desvíos' },
          { id: 'contestedShots', label: 'Punteados' },
        ];

  return (
    <div className="space-y-5">
      {/* Row 1: Homogeneous 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Franquicias NBA</span>
            <MetricInfoTooltip helpKey="avgPointsFor" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {teams.length}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Media: {benchmarks.team.avgPointsFor.mean.toFixed(1)} PTS/PJ
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Más dominante'
                : 'Mejor Net Rating'}
            </span>
            <MetricInfoTooltip helpKey="netRtg" align="right" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {summary?.bestNet?.name || '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
            {summary?.bestNet
              ? experienceMode === 'simple'
                ? `${formatSigned(summary.bestNet.differential)} PTS de ventaja`
                : `${formatSigned(summary.bestNet.netRtg)} (Off ${summary.bestNet.offRtg.toFixed(1)})`
              : '—'}
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Mejor defensa'
                : 'Mejor DefRtg'}
            </span>
            <MetricInfoTooltip helpKey="defRtg" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {summary?.bestDef?.name || '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
            {summary?.bestDef
              ? experienceMode === 'simple'
                ? `Encaja ${summary.bestDef.avgPointsAgainst.toFixed(1)} PTS`
                : `${summary.bestDef.defRtg.toFixed(1)} pts / 100 pos`
              : '—'}
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Ritmo más rápido'
                : 'Mayor Pace real'}
            </span>
            <MetricInfoTooltip helpKey="paceSimple" align="right" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {summary?.fastest?.name || '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-slate-300 truncate">
            {summary?.fastest
              ? `${summary.fastest.pace.toFixed(1)} pos / partido`
              : '—'}
          </p>
        </div>
      </div>

      {/* Row 2: Homogeneous Layer / Guidance + Conference + Search */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {experienceMode === 'simple' ? (
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <span className="text-xs text-slate-300">
                Vista esencial de las 30 franquicias con comparativa frente a la Media de la NBA.
              </span>
              <button
                type="button"
                onClick={onSwitchToAdvanced}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Ver Cuatro Factores, Pintura y Hustle</span>
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
                    { id: 'basic', label: '1. Básicas y Balance' },
                    { id: 'advanced', label: '2. Avanzadas y 4 Factores' },
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
        </div>

        <div className="pt-2.5 border-t border-[#1E293B] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg self-start overflow-x-auto no-scrollbar max-w-full">
            {(
              [
                { id: 'all', label: 'Toda la NBA (30)' },
                { id: 'Este', label: 'Conferencia Este' },
                { id: 'Oeste', label: 'Conferencia Oeste' },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setConfFilter(c.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  confFilter === c.id
                    ? 'bg-[#1E293B] text-orange-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="relative w-full xl:w-72 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar equipo o abreviatura..."
              className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Row 3: Homogeneous Data Table / Mobile Franchise Cards */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
        {/* Mobile Sort Strip + Franchise Cards (< md) */}
        <div className="md:hidden">
          <div className="px-3.5 py-2 bg-[#0F172A]/70 border-b border-[#1E293B] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
              Ordenar:
            </span>
            {mobileSortOptions.map((opt) => {
              const active = sortKey === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSort(opt.id)}
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

          {filtered.length === 0 ? (
            <div className="py-10 px-6 text-center text-xs text-slate-400">
              Ninguna franquicia coincide con el filtro actual.
            </div>
          ) : (
            <div className="divide-y divide-[#1E293B]">
              {filtered.map((t) => {
                const wKey = `team:${t.id}`;
                const watched = watchlistIds.has(wKey);

                return (
                  <div
                    key={t.id}
                    onClick={() => onInspectEntity('team', t.id)}
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
                            {t.name}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {t.abbreviation} · Conf. {t.conference} · Últ.10 {t.lastTenRecord}
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-sm font-bold text-slate-100">
                          {t.wins}-{t.losses}{' '}
                          <span className="text-xs font-normal text-slate-400">
                            ({(t.winPct * 100).toFixed(0)}%)
                          </span>
                        </div>
                        <div
                          className={`text-[11px] font-semibold ${
                            t.streakCode.startsWith('W')
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {experienceMode === 'simple'
                            ? humanStreakCode(t.streakCode)
                            : `Racha ${t.streakCode} · Casa ${t.homeRecord}`}
                        </div>
                      </div>
                    </div>

                    {experienceMode === 'simple' ? (
                      <>
                        <div className="grid grid-cols-3 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-3 py-2 text-xs">
                          <div>
                            <div className="text-[11px] text-slate-400">Anota</div>
                            <div className="font-mono tabular-nums font-medium text-slate-100 mt-0.5">
                              {t.avgPointsFor.toFixed(1)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-slate-400">Recibe</div>
                            <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                              {t.avgPointsAgainst.toFixed(1)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-slate-400">
                              Últ. {windowSize} PJ
                            </div>
                            <div
                              className={`font-mono tabular-nums font-semibold mt-0.5 ${
                                t.windowDiff >= 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {formatSigned(t.windowDiff)} PTS
                            </div>
                          </div>
                        </div>
                        <NbaComparisonBar
                          value={t.netRtg}
                          benchmark={benchmarks.team.netRtg}
                          compact
                        />
                      </>
                    ) : viewMode === 'basic' ? (
                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-400">PTS Fav/Con</div>
                          <div className="font-mono tabular-nums text-slate-100 mt-0.5">
                            {t.avgPointsFor.toFixed(0)}/{t.avgPointsAgainst.toFixed(0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Dif. Base</div>
                          <div
                            className={`font-mono tabular-nums font-medium mt-0.5 ${
                              t.differential >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatSigned(t.differential)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">
                            Dif. Últ.{windowSize}
                          </div>
                          <div className="font-mono tabular-nums font-semibold text-orange-300 mt-0.5">
                            {formatSigned(t.windowDiff)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">3PM (3P%)</div>
                          <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                            {t.fg3mAvg.toFixed(1)} ({t.fg3Pct.toFixed(0)}%)
                          </div>
                        </div>
                      </div>
                    ) : viewMode === 'advanced' ? (
                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-400">Off / Def</div>
                          <div className="font-mono tabular-nums text-slate-100 mt-0.5">
                            {t.offRtg.toFixed(0)}/{t.defRtg.toFixed(0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">NetRtg</div>
                          <div
                            className={`font-mono tabular-nums font-semibold mt-0.5 ${
                              t.netRtg >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatSigned(t.netRtg)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Pace</div>
                          <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                            {t.pace.toFixed(1)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">TS% / eFG%</div>
                          <div className="font-mono tabular-nums text-orange-300 mt-0.5">
                            {t.tsPct.toFixed(0)}%/{t.efgPct.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-400">Pintura</div>
                          <div className="font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                            {t.ptsPaint.toFixed(1)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">2ª Jugada</div>
                          <div className="font-mono tabular-nums text-orange-300 mt-0.5">
                            {t.pts2ndChance.toFixed(1)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Contraat.</div>
                          <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                            {t.ptsFastBreak.toFixed(1)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">Desv./Punt.</div>
                          <div className="font-mono tabular-nums text-emerald-300 mt-0.5">
                            {t.deflections.toFixed(1)}/{t.contestedShots.toFixed(0)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Full Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                <th className="py-3 pl-4 pr-2 w-10 font-medium">Seg.</th>
                <th className="py-3 px-3 font-medium">Franquicia</th>

                {experienceMode === 'simple' ? (
                  <>
                    <th className="py-3 px-2.5 font-medium text-right">
                      <SH label="Victorias" k="winPct" />
                    </th>
                    <th className="py-3 px-2.5 font-medium text-right">
                      <SH label="Ataque (Anota)" k="avgPointsFor" />
                    </th>
                    <th className="py-3 px-2.5 font-medium text-right">
                      <SH label="Defensa (Recibe)" k="avgPointsAgainst" />
                    </th>
                    <th className="py-3 px-2.5 font-medium text-right">
                      <SH
                        label={`Margen Últ.${windowSize}`}
                        k="windowDiff"
                        helpKey="windowDiff"
                      />
                    </th>
                    <th className="py-3 px-3 font-medium w-56">
                      <ColumnHelpHeader
                        label="Dominio vs Media NBA"
                        helpKey="vsLeagueBar"
                        align="left"
                      />
                    </th>
                    <th className="py-3 pl-2.5 pr-4 font-medium text-right">
                      <ColumnHelpHeader
                        label="Racha actual"
                        helpKey="streakCurrent"
                      />
                    </th>
                  </>
                ) : (
                  <>
                    {viewMode === 'basic' && (
                      <>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="Balance (%V)" k="winPct" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="PTS Favor" k="avgPointsFor" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="PTS Contra" k="avgPointsAgainst" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="Dif. Base" k="differential" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH
                            label={`Dif. Últ.${windowSize}`}
                            k="windowDiff"
                            helpKey="windowDiff"
                          />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="OR / REB" k="orebAvg" helpKey="orebBase" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="3PM (3P%)" k="fg3mAvg" helpKey="fg3m" />
                        </th>
                        <th className="py-3 pl-2.5 pr-4 font-medium text-right">
                          <ColumnHelpHeader
                            label="Racha / Casa-Fuera"
                            helpKey="streakCurrent"
                          />
                        </th>
                      </>
                    )}

                    {viewMode === 'advanced' && (
                      <>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="OffRtg" k="offRtg" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="DefRtg" k="defRtg" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="NetRtg" k="netRtg" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH
                            label={`Net Últ.${windowSize}`}
                            k="winNetRtg"
                            helpKey="winNetRtg"
                          />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="Pace" k="pace" helpKey="paceSimple" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="eFG%" k="efgPct" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="TS%" k="tsPct" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="OREB%" k="orebPct" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="TOV%" k="tovPct" />
                        </th>
                        <th className="py-3 pl-2.5 pr-4 font-medium text-right">
                          <SH label="PIE%" k="pie" />
                        </th>
                      </>
                    )}

                    {viewMode === 'zones_hustle' && (
                      <>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="PTS Pintura" k="ptsPaint" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="Pint. Rival" k="oppPtsPaint" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="2ª Jugada" k="pts2ndChance" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="Contraataque" k="ptsFastBreak" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="Tras Pérdida" k="ptsOffTov" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="Punteados" k="contestedShots" />
                        </th>
                        <th className="py-3 px-2.5 font-medium text-right">
                          <SH label="Desvíos" k="deflections" />
                        </th>
                        <th className="py-3 pl-2.5 pr-4 font-medium text-right">
                          <SH label="Box-Outs" k="boxOuts" />
                        </th>
                      </>
                    )}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-sm">
              {filtered.map((t) => {
                const wKey = `team:${t.id}`;
                const watched = watchlistIds.has(wKey);
                const offEval = evaluateVsLeague(
                  t.avgPointsFor,
                  benchmarks.team.avgPointsFor
                );
                const defEval = evaluateVsLeague(
                  t.avgPointsAgainst,
                  benchmarks.team.avgPointsAgainst
                );

                return (
                  <tr
                    key={t.id}
                    onClick={() => onInspectEntity('team', t.id)}
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
                        {t.name}
                      </div>
                      <div className="text-xs text-slate-400 whitespace-nowrap">
                        {t.abbreviation} · Conf. {t.conference} · Últ.10:{' '}
                        {t.lastTenRecord}
                      </div>
                    </td>

                    {experienceMode === 'simple' ? (
                      <>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="font-semibold text-slate-100">
                            {t.wins}-{t.losses}
                          </span>
                          <span className="ml-1.5 text-xs text-slate-400">
                            ({(t.winPct * 100).toFixed(0)}%)
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                          <div className="font-mono tabular-nums text-slate-100">
                            {t.avgPointsFor.toFixed(1)}
                          </div>
                          <div className={`text-[11px] ${offEval.textClass}`}>
                            {offEval.tierLabel}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                          <div className="font-mono tabular-nums text-slate-200">
                            {t.avgPointsAgainst.toFixed(1)}
                          </div>
                          <div className={`text-[11px] ${defEval.textClass}`}>
                            {defEval.tierLabel}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={
                              t.windowDiff >= 0
                                ? 'text-emerald-400 font-semibold'
                                : 'text-rose-400 font-semibold'
                            }
                          >
                            {formatSigned(t.windowDiff)} PTS
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <NbaComparisonBar
                            value={t.netRtg}
                            benchmark={benchmarks.team.netRtg}
                            compact
                          />
                        </td>
                        <td className="py-2.5 pl-2.5 pr-4 text-right text-xs whitespace-nowrap">
                          <span
                            className={
                              t.streakCode.startsWith('W')
                                ? 'text-emerald-400 font-semibold'
                                : 'text-rose-400 font-semibold'
                            }
                          >
                            {humanStreakCode(t.streakCode)}
                          </span>
                          <div className="font-mono tabular-nums text-slate-400">
                            Casa {t.homeRecord}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        {viewMode === 'basic' && (
                          <>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                              <span className="font-semibold text-slate-100">
                                {t.wins}-{t.losses}
                              </span>
                              <span className="ml-1.5 text-xs text-slate-400">
                                ({(t.winPct * 100).toFixed(1)}%)
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                              {t.avgPointsFor.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              {t.avgPointsAgainst.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                              <span
                                className={
                                  t.differential >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }
                              >
                                {formatSigned(t.differential)}
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-medium text-slate-100 whitespace-nowrap">
                              {formatSigned(t.windowDiff)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              <span className="text-orange-300">
                                {t.orebAvg.toFixed(1)}
                              </span>
                              <span className="text-slate-500"> / </span>
                              <span>{t.rebAvg.toFixed(1)}</span>
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              {t.fg3mAvg.toFixed(1)}{' '}
                              <span className="text-xs text-slate-400">
                                ({t.fg3Pct.toFixed(1)}%)
                              </span>
                            </td>
                            <td className="py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                              <span
                                className={
                                  t.streakCode.startsWith('W')
                                    ? 'text-emerald-400 font-semibold'
                                    : 'text-rose-400 font-semibold'
                                }
                              >
                                {t.streakCode}
                              </span>
                              <span className="text-slate-500"> · </span>
                              <span className="text-slate-400">
                                {t.homeRecord} / {t.roadRecord}
                              </span>
                            </td>
                          </>
                        )}

                        {viewMode === 'advanced' && (
                          <>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-medium text-slate-100 whitespace-nowrap">
                              {t.offRtg.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                              {t.defRtg.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                              <span
                                className={
                                  t.netRtg >= 0
                                    ? 'text-emerald-400 font-semibold'
                                    : 'text-rose-400 font-semibold'
                                }
                              >
                                {formatSigned(t.netRtg)}
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-orange-300 whitespace-nowrap">
                              {formatSigned(t.winNetRtg)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              {t.pace.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                              {t.efgPct.toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              {t.tsPct.toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-orange-300/90 whitespace-nowrap">
                              {t.orebPct.toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              {t.tovPct.toFixed(1)}%
                            </td>
                            <td className="py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums font-medium text-slate-100 whitespace-nowrap">
                              {t.pie.toFixed(1)}%
                            </td>
                          </>
                        )}

                        {viewMode === 'zones_hustle' && (
                          <>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                              {t.ptsPaint.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              {t.oppPtsPaint.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-orange-300 whitespace-nowrap">
                              {t.pts2ndChance.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                              {t.ptsFastBreak.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                              {t.ptsOffTov.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                              {t.contestedShots.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-emerald-300 whitespace-nowrap">
                              {t.deflections.toFixed(1)}
                            </td>
                            <td className="py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              {t.boxOuts.toFixed(1)}
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
      </div>
    </div>
  );
}
