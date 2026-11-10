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
  type MetricBenchmark,
} from '../utils/humanize';
import {
  MetricInfoTooltip,
  NbaComparisonBar,
  SortableTh,
} from './MetricUiHelpers';
import {
  STICKY_THEAD_CLASS,
  compareSortValues,
  parseStreakCodeValue,
} from '../utils/tableSort';
import { TeamLogo } from './NbaVisuals';

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

type TeamTableView =
  | 'basic'
  | 'advanced'
  | 'shooting'
  | 'playmaking_rebound'
  | 'hustle_defense';

type SortKey =
  | 'watched'
  | 'name'
  | 'domVsNba'
  | 'streak'
  | 'winPct'
  | 'avgPointsFor'
  | 'avgPointsAgainst'
  | 'differential'
  | 'windowDiff'
  | 'orebAvg'
  | 'drebAvg'
  | 'rebAvg'
  | 'fgmAvg'
  | 'fgaAvg'
  | 'fgPct'
  | 'fg3mAvg'
  | 'fg3aAvg'
  | 'fg3Pct'
  | 'ftmAvg'
  | 'ftaAvg'
  | 'ftPct'
  | 'astAvg'
  | 'stlAvg'
  | 'blkAvg'
  | 'tovAvg'
  | 'astTovRatio'
  | 'pctPts3p'
  | 'pctPtsPaint'
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

function getHeatmapClass(
  value: number,
  benchmark: MetricBenchmark | undefined
): string {
  if (!benchmark || benchmark.sd === 0) return '';
  const z = (value - benchmark.mean) / benchmark.sd;

  if (Math.abs(z) < 0.5) return '';

  const isPositive = z >= 0.5;
  const isGood = benchmark.lowerIsBetter ? !isPositive : isPositive;

  return isGood ? 'bg-emerald-500/10' : 'bg-rose-500/10';
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
        sortKey !== 'watched' &&
        sortKey !== 'name' &&
        sortKey !== 'domVsNba' &&
        sortKey !== 'streak' &&
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

      const ptsForAvg = t.avgPointsFor || round1(mean(games.map((g) => g.pointsFor)));
      const ptsAgainstAvg = t.avgPointsAgainst || round1(mean(games.map((g) => g.pointsAgainst)));
      const orebAvg = round1(mean(games.map((g) => g.oreb)));
      const drebAvg = round1(mean(games.map((g) => g.dreb)));
      const rebAvg = round1(mean(games.map((g) => g.reb)));

      const fgmAvg = round1(mean(games.map((g) => g.fgm)));
      const fgaAvg = round1(mean(games.map((g) => g.fga)));
      const fgaTot = games.reduce((s, g) => s + g.fga, 0);
      const fgmTot = games.reduce((s, g) => s + g.fgm, 0);
      const fgPct = fgaTot > 0 ? round1((fgmTot / fgaTot) * 100) : 0;

      const fg3mAvg = round1(mean(games.map((g) => g.fg3m)));
      const fg3aAvg = round1(mean(games.map((g) => g.fg3a)));
      const fg3aTot = games.reduce((s, g) => s + g.fg3a, 0);
      const fg3mTot = games.reduce((s, g) => s + g.fg3m, 0);
      const fg3Pct = fg3aTot > 0 ? round1((fg3mTot / fg3aTot) * 100) : 0;

      const ftmAvg = round1(mean(games.map((g) => g.ftm)));
      const ftaAvg = round1(mean(games.map((g) => g.fta)));
      const ftaTot = games.reduce((s, g) => s + g.fta, 0);
      const ftmTot = games.reduce((s, g) => s + g.ftm, 0);
      const ftPct = ftaTot > 0 ? round1((ftmTot / ftaTot) * 100) : 0;

      const astAvg = round1(mean(games.map((g) => g.ast)));
      const stlAvg = round1(mean(games.map((g) => g.stl)));
      const blkAvg = round1(mean(games.map((g) => g.blk)));
      const tovAvg = round1(mean(games.map((g) => g.tov)));
      const astTovRatio = tovAvg > 0 ? round1(astAvg / tovAvg) : astAvg;

      const pctPts3p = ptsForAvg > 0 ? round1(((fg3mAvg * 3) / ptsForAvg) * 100) : 0;

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

      const pctPtsPaint = ptsForAvg > 0 ? round1((ptsPaint / ptsForAvg) * 100) : 0;

      return {
        ...t,
        windowDiff,
        ptsForAvg,
        ptsAgainstAvg,
        orebAvg,
        drebAvg,
        rebAvg,
        fgmAvg,
        fgaAvg,
        fgPct,
        fg3mAvg,
        fg3aAvg,
        fg3Pct,
        ftmAvg,
        ftaAvg,
        ftPct,
        astAvg,
        stlAvg,
        blkAvg,
        tovAvg,
        astTovRatio,
        pctPts3p,
        pctPtsPaint,
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
      .sort((a, b) => {
        if (sortKey === 'watched') {
          const wa = watchlistIds.has(`team:${a.id}`);
          const wb = watchlistIds.has(`team:${b.id}`);
          return compareSortValues(wa, wb, sortAsc) || b.winPct - a.winPct;
        }
        if (sortKey === 'name') {
          return compareSortValues(a.name, b.name, sortAsc);
        }
        if (sortKey === 'domVsNba') {
          return sortAsc ? a.netRtg - b.netRtg : b.netRtg - a.netRtg;
        }
        if (sortKey === 'streak') {
          const sa = parseStreakCodeValue(a.streakCode);
          const sb = parseStreakCodeValue(b.streakCode);
          return sortAsc ? sa - sb : sb - sa;
        }
        return sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey];
      });
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
    } else if (mode === 'shooting') {
      setSortKey('fg3Pct');
      setSortAsc(false);
    } else if (mode === 'playmaking_rebound') {
      setSortKey('astAvg');
      setSortAsc(false);
    } else {
      setSortKey('stlAvg');
      setSortAsc(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(
        key === 'name' ||
          key === 'avgPointsAgainst' ||
          key === 'defRtg' ||
          key === 'tovPct' ||
          key === 'tovAvg' ||
          key === 'oppPtsPaint'
      );
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
      onSort={() => handleSort(k)}
      align={align}
      className={className}
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
      : viewMode === 'shooting'
      ? [
          { id: 'fg3Pct', label: '3P%' },
          { id: 'fg3mAvg', label: '3PM' },
          { id: 'fgPct', label: 'FG%' },
          { id: 'ftPct', label: 'FT%' },
          { id: 'pctPts3p', label: '% Pts 3P' },
        ]
      : viewMode === 'playmaking_rebound'
      ? [
          { id: 'astAvg', label: 'AST/PJ' },
          { id: 'astTovRatio', label: 'AST/TO' },
          { id: 'rebAvg', label: 'REB/PJ' },
          { id: 'ptsPaint', label: 'Pintura' },
          { id: 'pts2ndChance', label: '2ª Oportun.' },
        ]
      : [
          { id: 'stlAvg', label: 'Robos' },
          { id: 'blkAvg', label: 'Tapones' },
          { id: 'ptsFastBreak', label: 'Contraataque' },
          { id: 'deflections', label: 'Desvíos' },
          { id: 'contestedShots', label: 'Punteados' },
        ];

  const renderAverageCell = (key: keyof LeagueBenchmarks['team'], suffix = '') => {
    const b = benchmarks.team[key];
    if (!b) return <td className="py-2.5 px-2.5 text-right font-mono text-slate-500">—</td>;
    return (
      <td className="py-2.5 px-2.5 text-right font-mono text-slate-400 bg-slate-800/20 italic tabular-nums">
        {b.mean.toFixed(b.decimals ?? 1)}{suffix || b.suffix}
      </td>
    );
  };

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
            Media: {benchmarks.team.avgPointsFor.mean.toFixed(1)} PTS · Margen ±
            {(benchmarks.team.differential.spreadMean ?? 4.8).toFixed(1)}
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
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.bestNet && (
              <TeamLogo
                abbr={summary.bestNet.abbreviation}
                teamId={summary.bestNet.id}
                logoUrl={summary.bestNet.logoUrl}
                size="sm"
                framed
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.bestNet?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
                {summary?.bestNet
                  ? experienceMode === 'simple'
                    ? `${formatSigned(summary.bestNet.differential)} PTS de ventaja`
                    : `${formatSigned(summary.bestNet.netRtg)} (Off ${summary.bestNet.offRtg.toFixed(1)})`
                  : '—'}
              </p>
            </div>
          </div>
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
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.bestDef && (
              <TeamLogo
                abbr={summary.bestDef.abbreviation}
                teamId={summary.bestDef.id}
                logoUrl={summary.bestDef.logoUrl}
                size="sm"
                framed
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.bestDef?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
                {summary?.bestDef
                  ? experienceMode === 'simple'
                    ? `Encaja ${summary.bestDef.avgPointsAgainst.toFixed(1)} PTS`
                    : `${summary.bestDef.defRtg.toFixed(1)} pts / 100 pos`
                  : '—'}
              </p>
            </div>
          </div>
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
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.fastest && (
              <TeamLogo
                abbr={summary.fastest.abbreviation}
                teamId={summary.fastest.id}
                logoUrl={summary.fastest.logoUrl}
                size="sm"
                framed
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.fastest?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-slate-300 truncate">
                {summary?.fastest
                  ? `${summary.fastest.pace.toFixed(1)} pos / partido`
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Homogeneous Layer Selector + Conference + Search */}
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
                <span>Ver Capas de Tiro, Creación, Pintura y Hustle</span>
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
                    { id: 'basic', label: '1. Balance y Racha' },
                    { id: 'advanced', label: '2. Ratings y 4 Factores' },
                    { id: 'shooting', label: '3. Tiro Exterior y %' },
                    { id: 'playmaking_rebound', label: '4. Creación y Rebotes' },
                    { id: 'hustle_defense', label: '5. Defensa y Hustle' },
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
                    className="p-3.5 space-y-2 hover:bg-[#182338]/50 active:bg-[#182338] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TeamLogo
                          abbr={t.abbreviation}
                          teamId={t.id}
                          logoUrl={t.logoUrl}
                          size="md"
                          framed
                        />
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm text-slate-100 truncate">
                            {t.name}
                          </h3>
                          <p className="text-xs text-slate-400 truncate">
                            {t.abbreviation} · Conf. {t.conference} · {t.wins}-
                            {t.losses} ({(t.winPct * 100).toFixed(0)}%)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleWatchlist(wKey);
                          }}
                          className="p-1.5 rounded-md text-slate-400 hover:text-orange-400"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              watched ? 'fill-orange-400 text-orange-400' : ''
                            }`}
                          />
                        </button>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            t.streakCode.startsWith('W')
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {t.streakCode}
                        </span>
                      </div>
                    </div>

                    {/* Stats Summary depending on active viewMode with Heatmap shading */}
                    {viewMode === 'basic' ? (
                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        <div className={getHeatmapClass(t.avgPointsFor, benchmarks.team.avgPointsFor)}>
                          <div className="text-[10px] text-slate-400">PTS Fav/Con</div>
                          <div className="font-mono tabular-nums text-slate-100 mt-0.5">
                            {t.avgPointsFor.toFixed(0)}/{t.avgPointsAgainst.toFixed(0)}
                          </div>
                        </div>
                        <div className={getHeatmapClass(t.differential, benchmarks.team.differential)}>
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
                        <div className={`text-right ${getHeatmapClass(t.fg3Pct, benchmarks.team.fg3Pct)}`}>
                          <div className="text-[10px] text-slate-400">3PM (3P%)</div>
                          <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                            {t.fg3mAvg.toFixed(1)} ({t.fg3Pct.toFixed(0)}%)
                          </div>
                        </div>
                      </div>
                    ) : viewMode === 'advanced' ? (
                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        <div className={getHeatmapClass(t.offRtg, benchmarks.team.offRtg)}>
                          <div className="text-[10px] text-slate-400">Off / Def</div>
                          <div className="font-mono tabular-nums text-slate-100 mt-0.5">
                            {t.offRtg.toFixed(0)}/{t.defRtg.toFixed(0)}
                          </div>
                        </div>
                        <div className={getHeatmapClass(t.netRtg, benchmarks.team.netRtg)}>
                          <div className="text-[10px] text-slate-400">NetRtg</div>
                          <div
                            className={`font-mono tabular-nums font-semibold mt-0.5 ${
                              t.netRtg >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatSigned(t.netRtg)}
                          </div>
                        </div>
                        <div className={getHeatmapClass(t.pace, benchmarks.team.pace)}>
                          <div className="text-[10px] text-slate-400">Pace</div>
                          <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                            {t.pace.toFixed(1)}
                          </div>
                        </div>
                        <div className={`text-right ${getHeatmapClass(t.tsPct, benchmarks.team.tsPct)}`}>
                          <div className="text-[10px] text-slate-400">TS% / eFG%</div>
                          <div className="font-mono tabular-nums text-orange-300 mt-0.5">
                            {t.tsPct.toFixed(0)}%/{t.efgPct.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    ) : viewMode === 'shooting' ? (
                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        <div className={getHeatmapClass(t.fg3Pct, benchmarks.team.fg3Pct)}>
                          <div className="text-[10px] text-slate-400">3PM (3P%)</div>
                          <div className="font-mono tabular-nums font-semibold text-orange-400 mt-0.5">
                            {t.fg3mAvg.toFixed(1)} ({t.fg3Pct.toFixed(1)}%)
                          </div>
                        </div>
                        <div className={getHeatmapClass(t.fgPct, benchmarks.team.fgPct)}>
                          <div className="text-[10px] text-slate-400">TC % (FG%)</div>
                          <div className="font-mono tabular-nums text-slate-100 mt-0.5">
                            {t.fgPct.toFixed(1)}%
                          </div>
                        </div>
                        <div className={getHeatmapClass(t.ftPct, benchmarks.team.ftPct)}>
                          <div className="text-[10px] text-slate-400">TL % (FT%)</div>
                          <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                            {t.ftPct.toFixed(1)}%
                          </div>
                        </div>
                        <div className={`text-right ${getHeatmapClass(t.pctPts3p, benchmarks.team.pctPts3p)}`}>
                          <div className="text-[10px] text-slate-400">% Pts Triple</div>
                          <div className="font-mono tabular-nums text-emerald-400 mt-0.5">
                            {t.pctPts3p.toFixed(0)}% Pts
                          </div>
                        </div>
                      </div>
                    ) : viewMode === 'playmaking_rebound' ? (
                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        <div className={getHeatmapClass(t.astAvg, benchmarks.team.astAvg)}>
                          <div className="text-[10px] text-slate-400">AST / TO</div>
                          <div className="font-mono tabular-nums font-semibold text-emerald-400 mt-0.5">
                            {t.astAvg.toFixed(1)} ({t.astTovRatio.toFixed(2)})
                          </div>
                        </div>
                        <div className={getHeatmapClass(t.rebAvg, benchmarks.team.rebAvg)}>
                          <div className="text-[10px] text-slate-400">REB (OR/DR)</div>
                          <div className="font-mono tabular-nums text-slate-100 mt-0.5">
                            {t.rebAvg.toFixed(1)} ({t.orebAvg.toFixed(1)})
                          </div>
                        </div>
                        <div className={getHeatmapClass(t.ptsPaint, benchmarks.team.ptsPaint)}>
                          <div className="text-[10px] text-slate-400">PTS Pintura</div>
                          <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                            {t.ptsPaint.toFixed(1)}
                          </div>
                        </div>
                        <div className={`text-right ${getHeatmapClass(t.pts2ndChance, benchmarks.team.pts2ndChance)}`}>
                          <div className="text-[10px] text-slate-400">2ª Oport.</div>
                          <div className="font-mono tabular-nums text-orange-300 mt-0.5">
                            {t.pts2ndChance.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        <div className={getHeatmapClass(t.stlAvg, benchmarks.team.stlAvg)}>
                          <div className="text-[10px] text-slate-400">Rob/Tap</div>
                          <div className="font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                            {t.stlAvg.toFixed(1)}/{t.blkAvg.toFixed(1)}
                          </div>
                        </div>
                        <div className={getHeatmapClass(t.ptsFastBreak, benchmarks.team.ptsFastBreak)}>
                          <div className="text-[10px] text-slate-400">Contraat.</div>
                          <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                            {t.ptsFastBreak.toFixed(1)}
                          </div>
                        </div>
                        <div className={getHeatmapClass(t.deflections, benchmarks.team.deflections)}>
                          <div className="text-[10px] text-slate-400">Desvíos</div>
                          <div className="font-mono tabular-nums text-emerald-300 mt-0.5">
                            {t.deflections.toFixed(1)}
                          </div>
                        </div>
                        <div className={`text-right ${getHeatmapClass(t.contestedShots, benchmarks.team.contestedShots)}`}>
                          <div className="text-[10px] text-slate-400">Punteados</div>
                          <div className="font-mono tabular-nums text-orange-300 mt-0.5">
                            {t.contestedShots.toFixed(0)}
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
        <div className="hidden md:block overflow-auto max-h-[72vh]">
          <table className="w-full text-left border-collapse">
            <thead className={STICKY_THEAD_CLASS}>
              <tr className="text-xs text-slate-400">
                <SortableTh
                  label="Seg."
                  active={sortKey === 'watched'}
                  asc={sortAsc}
                  onSort={() => handleSort('watched')}
                  align="left"
                  className="py-3 pl-4 pr-2 w-12"
                  compact
                />
                <SortableTh
                  label="Franquicia"
                  active={sortKey === 'name'}
                  asc={sortAsc}
                  onSort={() => handleSort('name')}
                  align="left"
                  className="py-3 px-3"
                />

                {experienceMode === 'simple' ? (
                  <>
                    <SH label="Victorias" k="winPct" />
                    <SH label="Ataque (Anota)" k="avgPointsFor" />
                    <SH label="Defensa (Recibe)" k="avgPointsAgainst" />
                    <SH
                      label={`Margen Últ.${windowSize}`}
                      k="windowDiff"
                      helpKey="windowDiff"
                    />
                    <SH
                      label="Dominio vs Media NBA"
                      k="domVsNba"
                      helpKey="vsLeagueBar"
                      align="left"
                      className="py-3 px-3 w-56"
                    />
                    <SH
                      label="Racha actual"
                      k="streak"
                      helpKey="streakCurrent"
                      className="py-3 pl-2.5 pr-4"
                    />
                  </>
                ) : (
                  <>
                    {viewMode === 'basic' && (
                      <>
                        <SH label="Balance (%V)" k="winPct" />
                        <SH label="PTS Favor" k="avgPointsFor" />
                        <SH label="PTS Contra" k="avgPointsAgainst" />
                        <SH label="Dif. Base" k="differential" />
                        <SH
                          label={`Dif. Últ.${windowSize}`}
                          k="windowDiff"
                          helpKey="windowDiff"
                        />
                        <SH label="OR / REB" k="orebAvg" helpKey="orebBase" />
                        <SH label="3PM (3P%)" k="fg3mAvg" helpKey="fg3m" />
                        <SH
                          label="Racha / Casa-Fuera"
                          k="streak"
                          helpKey="streakCurrent"
                          className="py-3 pl-2.5 pr-4"
                        />
                      </>
                    )}

                    {viewMode === 'advanced' && (
                      <>
                        <SH label="OffRtg" k="offRtg" />
                        <SH label="DefRtg" k="defRtg" />
                        <SH label="NetRtg" k="netRtg" />
                        <SH
                          label={`Net Últ.${windowSize}`}
                          k="winNetRtg"
                          helpKey="winNetRtg"
                        />
                        <SH label="Pace" k="pace" helpKey="paceSimple" />
                        <SH label="eFG%" k="efgPct" />
                        <SH label="TS%" k="tsPct" />
                        <SH label="OREB%" k="orebPct" />
                        <SH label="TOV%" k="tovPct" />
                        <SH
                          label="PIE%"
                          k="pie"
                          className="py-3 pl-2.5 pr-4"
                        />
                      </>
                    )}

                    {viewMode === 'shooting' && (
                      <>
                        <SH label="3PM / 3PA" k="fg3mAvg" />
                        <SH label="3P %" k="fg3Pct" />
                        <SH label="TC % (FG%)" k="fgPct" />
                        <SH label="TL % (FT%)" k="ftPct" />
                        <SH label="TLM / TLA" k="ftmAvg" />
                        <SH label="% Pts Triple" k="pctPts3p" />
                        <SH
                          label="% Pts Pintura"
                          k="pctPtsPaint"
                          className="py-3 pl-2.5 pr-4"
                        />
                      </>
                    )}

                    {viewMode === 'playmaking_rebound' && (
                      <>
                        <SH label="AST / PJ" k="astAvg" />
                        <SH label="TOV / PJ" k="tovAvg" />
                        <SH label="Ratio AST/TO" k="astTovRatio" />
                        <SH label="REB / PJ" k="rebAvg" />
                        <SH label="OREB / DREB" k="orebAvg" />
                        <SH label="PTS Pintura" k="ptsPaint" />
                        <SH label="Pintura Rival" k="oppPtsPaint" />
                        <SH
                          label="2ª Jugada"
                          k="pts2ndChance"
                          className="py-3 pl-2.5 pr-4"
                        />
                      </>
                    )}

                    {viewMode === 'hustle_defense' && (
                      <>
                        <SH label="Robos / PJ" k="stlAvg" />
                        <SH label="Tapones / PJ" k="blkAvg" />
                        <SH label="Contraataque" k="ptsFastBreak" />
                        <SH label="Tras Pérdida" k="ptsOffTov" />
                        <SH label="Punteados" k="contestedShots" />
                        <SH label="Desvíos" k="deflections" />
                        <SH
                          label="Box-Outs"
                          k="boxOuts"
                          className="py-3 pl-2.5 pr-4"
                        />
                      </>
                    )}
                  </>
                )}
              </tr>

              {/* Reference Row: PROMEDIO NBA */}
              <tr className="border-b-2 border-[#1E293B] bg-[#1E293B]/30 sticky top-[41px] z-20">
                <td className="py-2.5 pl-4 pr-2 bg-slate-800/40"></td>
                <td className="py-2.5 px-3 bg-slate-800/40">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-slate-700/50 flex items-center justify-center text-[10px] font-bold text-slate-400">NBA</div>
                    <span className="text-xs font-bold text-slate-300 tracking-wider">PROMEDIO NBA</span>
                  </div>
                </td>
                {experienceMode === 'simple' ? (
                  <>
                    {renderAverageCell('winPct')}
                    {renderAverageCell('avgPointsFor')}
                    {renderAverageCell('avgPointsAgainst')}
                    <td className="py-2.5 px-2.5 text-right font-mono text-slate-500 bg-slate-800/20 italic tabular-nums">±{(benchmarks.team.differential.spreadMean || 0).toFixed(1)}</td>
                    <td className="py-2.5 px-3 bg-slate-800/20"></td>
                    <td className="py-2.5 pl-2.5 pr-4 bg-slate-800/20"></td>
                  </>
                ) : (
                  <>
                    {viewMode === 'basic' && (
                      <>
                        {renderAverageCell('winPct')}
                        {renderAverageCell('avgPointsFor')}
                        {renderAverageCell('avgPointsAgainst')}
                        {renderAverageCell('differential')}
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-500 bg-slate-800/20 italic tabular-nums">±{(benchmarks.team.differential.spreadMean || 0).toFixed(1)}</td>
                        {renderAverageCell('orebAvg')}
                        {renderAverageCell('fg3mAvg')}
                        <td className="py-2.5 pl-2.5 pr-4 bg-slate-800/20"></td>
                      </>
                    )}
                    {viewMode === 'advanced' && (
                      <>
                        {renderAverageCell('offRtg')}
                        {renderAverageCell('defRtg')}
                        {renderAverageCell('netRtg')}
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-500 bg-slate-800/20 italic tabular-nums">±{(benchmarks.team.netRtg.spreadMean || 0).toFixed(1)}</td>
                        {renderAverageCell('pace')}
                        {renderAverageCell('efgPct')}
                        {renderAverageCell('tsPct')}
                        {renderAverageCell('orebPct')}
                        {renderAverageCell('tovPct')}
                        <td className="py-2.5 pl-2.5 pr-4 bg-slate-800/20"></td>
                      </>
                    )}
                    {viewMode === 'shooting' && (
                      <>
                        {renderAverageCell('fg3mAvg')}
                        {renderAverageCell('fg3Pct')}
                        {renderAverageCell('fgPct')}
                        {renderAverageCell('ftPct')}
                        {renderAverageCell('ftmAvg')}
                        {renderAverageCell('pctPts3p')}
                        {renderAverageCell('pctPtsPaint')}
                      </>
                    )}
                    {viewMode === 'playmaking_rebound' && (
                      <>
                        {renderAverageCell('astAvg')}
                        {renderAverageCell('tovAvg')}
                        {renderAverageCell('astTovRatio')}
                        {renderAverageCell('rebAvg')}
                        {renderAverageCell('orebAvg')}
                        {renderAverageCell('ptsPaint')}
                        {renderAverageCell('oppPtsPaint')}
                        {renderAverageCell('pts2ndChance')}
                      </>
                    )}
                    {viewMode === 'hustle_defense' && (
                      <>
                        {renderAverageCell('stlAvg')}
                        {renderAverageCell('blkAvg')}
                        {renderAverageCell('ptsFastBreak')}
                        {renderAverageCell('ptsOffTov')}
                        {renderAverageCell('contestedShots')}
                        {renderAverageCell('deflections')}
                        {renderAverageCell('boxOuts')}
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
                      <div className="flex items-center gap-2.5">
                        <TeamLogo
                          abbr={t.abbreviation}
                          teamId={t.id}
                          logoUrl={t.logoUrl}
                          size="sm"
                          framed
                        />
                        <div>
                          <div className="font-medium text-slate-100 whitespace-nowrap">
                            {t.name}
                          </div>
                          <div className="text-xs text-slate-400 whitespace-nowrap">
                            {t.abbreviation} · Conf. {t.conference} · Últ.10:{' '}
                            {t.lastTenRecord}
                          </div>
                        </div>
                      </div>
                    </td>

                    {experienceMode === 'simple' ? (
                      <>
                        <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap ${getHeatmapClass(t.winPct*100, benchmarks.team.winPct)}`}>
                          <span className="font-semibold text-slate-100">
                            {t.wins}-{t.losses}
                          </span>
                          <span className="ml-1.5 text-xs text-slate-400">
                            ({(t.winPct * 100).toFixed(0)}%)
                          </span>
                        </td>
                        <td className={`py-2.5 px-2.5 text-right whitespace-nowrap ${getHeatmapClass(t.avgPointsFor, benchmarks.team.avgPointsFor)}`}>
                          <div className="font-mono tabular-nums text-slate-100">
                            {t.avgPointsFor.toFixed(1)}
                          </div>
                          <div className={`text-[11px] ${offEval.textClass}`}>
                            {offEval.tierLabel}
                          </div>
                        </td>
                        <td className={`py-2.5 px-2.5 text-right whitespace-nowrap ${getHeatmapClass(t.avgPointsAgainst, benchmarks.team.avgPointsAgainst)}`}>
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
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap ${getHeatmapClass(t.winPct*100, benchmarks.team.winPct)}`}>
                              <span className="font-semibold text-slate-100">
                                {t.wins}-{t.losses}
                              </span>
                              <span className="ml-1.5 text-xs text-slate-400">
                                ({(t.winPct * 100).toFixed(1)}%)
                              </span>
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap ${getHeatmapClass(t.avgPointsFor, benchmarks.team.avgPointsFor)}`}>
                              {t.avgPointsFor.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.avgPointsAgainst, benchmarks.team.avgPointsAgainst)}`}>
                              {t.avgPointsAgainst.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap ${getHeatmapClass(t.differential, benchmarks.team.differential)}`}>
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
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.orebAvg, benchmarks.team.orebAvg)}`}>
                              <span className="text-orange-300">
                                {t.orebAvg.toFixed(1)}
                              </span>
                              <span className="text-slate-500"> / </span>
                              <span>{t.rebAvg.toFixed(1)}</span>
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.fg3Pct, benchmarks.team.fg3Pct)}`}>
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
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-medium text-slate-100 whitespace-nowrap ${getHeatmapClass(t.offRtg, benchmarks.team.offRtg)}`}>
                              {t.offRtg.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap ${getHeatmapClass(t.defRtg, benchmarks.team.defRtg)}`}>
                              {t.defRtg.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap ${getHeatmapClass(t.netRtg, benchmarks.team.netRtg)}`}>
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
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.pace, benchmarks.team.pace)}`}>
                              {t.pace.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap ${getHeatmapClass(t.efgPct, benchmarks.team.efgPct)}`}>
                              {t.efgPct.toFixed(1)}%
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.tsPct, benchmarks.team.tsPct)}`}>
                              {t.tsPct.toFixed(1)}%
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-orange-300/90 whitespace-nowrap ${getHeatmapClass(t.orebPct, benchmarks.team.orebPct)}`}>
                              {t.orebPct.toFixed(1)}%
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.tovPct, benchmarks.team.tovPct)}`}>
                              {t.tovPct.toFixed(1)}%
                            </td>
                            <td className="py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums font-medium text-slate-100 whitespace-nowrap">
                              {t.pie.toFixed(1)}%
                            </td>
                          </>
                        )}

                        {viewMode === 'shooting' && (
                          <>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-medium text-slate-100 whitespace-nowrap ${getHeatmapClass(t.fg3mAvg, benchmarks.team.fg3mAvg)}`}>
                              <span className="text-orange-400 font-semibold">
                                {t.fg3mAvg.toFixed(1)}
                              </span>
                              <span className="text-slate-500"> / </span>
                              <span>{t.fg3aAvg.toFixed(1)}</span>
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-emerald-400 whitespace-nowrap ${getHeatmapClass(t.fg3Pct, benchmarks.team.fg3Pct)}`}>
                              {t.fg3Pct.toFixed(1)}%
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap ${getHeatmapClass(t.fgPct, benchmarks.team.fgPct)}`}>
                              {t.fgPct.toFixed(1)}%
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.ftPct, benchmarks.team.ftPct)}`}>
                              {t.ftPct.toFixed(1)}%
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.ftmAvg, benchmarks.team.ftmAvg)}`}>
                              {t.ftmAvg.toFixed(1)} / {t.ftaAvg.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-emerald-300 whitespace-nowrap ${getHeatmapClass(t.pctPts3p, benchmarks.team.pctPts3p)}`}>
                              {t.pctPts3p.toFixed(1)}%
                            </td>
                            <td className={`py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums text-orange-300 whitespace-nowrap ${getHeatmapClass(t.pctPtsPaint, benchmarks.team.pctPtsPaint)}`}>
                              {t.pctPtsPaint.toFixed(1)}%
                            </td>
                          </>
                        )}

                        {viewMode === 'playmaking_rebound' && (
                          <>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap ${getHeatmapClass(t.astAvg, benchmarks.team.astAvg)}`}>
                              {t.astAvg.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.tovAvg, benchmarks.team.tovAvg)}`}>
                              {t.tovAvg.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-emerald-400 whitespace-nowrap ${getHeatmapClass(t.astTovRatio, benchmarks.team.astTovRatio)}`}>
                              {t.astTovRatio.toFixed(2)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap ${getHeatmapClass(t.rebAvg, benchmarks.team.rebAvg)}`}>
                              {t.rebAvg.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.orebAvg, benchmarks.team.orebAvg)}`}>
                              <span className="text-orange-300">{t.orebAvg.toFixed(1)}</span>
                              <span className="text-slate-500"> / </span>
                              <span>{t.drebAvg.toFixed(1)}</span>
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap ${getHeatmapClass(t.ptsPaint, benchmarks.team.ptsPaint)}`}>
                              {t.ptsPaint.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-rose-300 whitespace-nowrap ${getHeatmapClass(t.oppPtsPaint, benchmarks.team.oppPtsPaint)}`}>
                              {t.oppPtsPaint.toFixed(1)}
                            </td>
                            <td className={`py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums text-orange-300 whitespace-nowrap ${getHeatmapClass(t.pts2ndChance, benchmarks.team.pts2ndChance)}`}>
                              {t.pts2ndChance.toFixed(1)}
                            </td>
                          </>
                        )}

                        {viewMode === 'hustle_defense' && (
                          <>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-emerald-400 whitespace-nowrap ${getHeatmapClass(t.stlAvg, benchmarks.team.stlAvg)}`}>
                              {t.stlAvg.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-orange-300 whitespace-nowrap ${getHeatmapClass(t.blkAvg, benchmarks.team.blkAvg)}`}>
                              {t.blkAvg.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap ${getHeatmapClass(t.ptsFastBreak, benchmarks.team.ptsFastBreak)}`}>
                              {t.ptsFastBreak.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap ${getHeatmapClass(t.ptsOffTov, benchmarks.team.ptsOffTov)}`}>
                              {t.ptsOffTov.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.contestedShots, benchmarks.team.contestedShots)}`}>
                              {t.contestedShots.toFixed(1)}
                            </td>
                            <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums text-emerald-300 whitespace-nowrap ${getHeatmapClass(t.deflections, benchmarks.team.deflections)}`}>
                              {t.deflections.toFixed(1)}
                            </td>
                            <td className={`py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap ${getHeatmapClass(t.boxOuts, benchmarks.team.boxOuts)}`}>
                              {t.boxOuts.toFixed(1)}
                            </td>
                          </>
                        )}
                      </>
                    )
}
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
