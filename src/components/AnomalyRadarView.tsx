import { useEffect, useMemo, useState } from 'react';
import { Search, Shield, Star, Users } from 'lucide-react';
import type {
  AnomalyCategory,
  AnomalySignal,
  ExperienceMode,
} from '../types/nba';
import { formatSigned, normalizeSearchText } from '../utils/analytics';
import {
  describeZScoreHuman,
  plainAnomalyExplanation,
  plainMetricName,
} from '../utils/humanize';
import { ColumnHelpHeader, MetricInfoTooltip } from './MetricUiHelpers';

interface AnomalyRadarViewProps {
  signals: AnomalySignal[];
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onResetThresholds: () => void;
  windowSize: number;
}

type SortField = 'zScore' | 'pctDelta' | 'windowAvg' | 'baselineAvg';

interface AnomalyBlockTableProps {
  rows: AnomalySignal[];
  experienceMode: ExperienceMode;
  windowSize: number;
  watchlistIds: Set<string>;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  subjectColumnLabel: string;
  emptyTitle: string;
  emptySubtitle: string;
  onResetThresholds?: () => void;
}

function AnomalyBlockTable({
  rows,
  experienceMode,
  windowSize,
  watchlistIds,
  onToggleWatchlist,
  onInspectEntity,
  subjectColumnLabel,
  emptyTitle,
  emptySubtitle,
  onResetThresholds,
}: AnomalyBlockTableProps) {
  const [sortField, setSortField] = useState<SortField>('zScore');
  const [sortAsc, setSortAsc] = useState(false);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const valA =
        sortField === 'zScore' || sortField === 'pctDelta'
          ? Math.abs(a[sortField])
          : a[sortField];
      const valB =
        sortField === 'zScore' || sortField === 'pctDelta'
          ? Math.abs(b[sortField])
          : b[sortField];
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [rows, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  if (sortedRows.length === 0) {
    return (
      <div className="py-10 px-6 text-center">
        <p className="text-sm font-medium text-slate-200">{emptyTitle}</p>
        <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
          {emptySubtitle}
        </p>
        {onResetThresholds && (
          <button
            type="button"
            onClick={onResetThresholds}
            className="mt-3.5 px-3.5 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap shrink-0"
          >
            Restablecer filtros recomendados
          </button>
        )}
      </div>
    );
  }

  const mobileSortOptions: Array<{ id: SortField; label: string }> = [
    {
      id: 'zScore',
      label: experienceMode === 'simple' ? 'Magnitud' : 'Desv. |Z|',
    },
    { id: 'pctDelta', label: 'Cambio %' },
    { id: 'windowAvg', label: `Últ. ${windowSize} PJ` },
    { id: 'baselineAvg', label: experienceMode === 'simple' ? 'Habitual' : 'Base' },
  ];

  return (
    <div>
      {/* Mobile Sort Strip + Card List (< md) */}
      <div className="md:hidden">
        <div className="px-3.5 py-2 bg-[#0F172A]/70 border-b border-[#1E293B] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
            Ordenar:
          </span>
          {mobileSortOptions.map((opt) => {
            const active = sortField === opt.id;
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

        <div className="divide-y divide-[#1E293B]">
          {sortedRows.map((sig) => {
            const wKey = `${sig.entityType}:${sig.entityId}`;
            const isWatched = watchlistIds.has(wKey);
            const isInverseMetric = sig.metricKey === 'defRtg';
            const isUp = sig.absDelta >= 0;
            const isGood = isInverseMetric ? !isUp : isUp;
            const humanMag = describeZScoreHuman(sig.zScore, isGood);
            const plainExp = plainAnomalyExplanation(sig);

            return (
              <div
                key={sig.id}
                onClick={() => onInspectEntity(sig.entityType, sig.entityId)}
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
                          isWatched ? 'fill-orange-400 text-orange-400' : ''
                        }`}
                      />
                    </button>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-100 truncate">
                        {sig.entityName}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {sig.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-100">
                      <span>
                        {experienceMode === 'simple'
                          ? plainMetricName(sig.metricKey, sig.metricLabel)
                          : sig.metricLabel}
                      </span>
                      <MetricInfoTooltip
                        helpKey={sig.metricKey}
                        fallbackTitle={sig.metricLabel}
                        align="right"
                      />
                    </div>
                    <div className={`text-[11px] ${humanMag.textClass}`}>
                      {experienceMode === 'simple'
                        ? humanMag.label
                        : `Z ${formatSigned(sig.zScore, 2, 'σ')} · ${humanMag.label}`}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-3 py-2 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-400">
                      {experienceMode === 'simple' ? 'Habitual' : 'Base'}
                    </div>
                    <div className="font-mono tabular-nums text-slate-300 mt-0.5">
                      {sig.baselineAvg.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">
                      Últ. {windowSize} PJ
                    </div>
                    <div className="font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                      {sig.windowAvg.toFixed(1)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Cambio</div>
                    <div
                      className={`font-mono tabular-nums font-semibold mt-0.5 ${
                        isGood ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isUp ? '▲ ' : '▼ '}
                      {formatSigned(sig.pctDelta, 1, '%')}
                    </div>
                  </div>
                </div>

                <div className="text-xs leading-relaxed">
                  {experienceMode === 'simple' ? (
                    <p className="text-slate-300">
                      <span className="font-medium text-slate-100">
                        {plainExp.headline}:
                      </span>{' '}
                      <span className="text-slate-400">{plainExp.detail}</span>
                    </p>
                  ) : (
                    <p className="text-slate-400">
                      <span
                        className={`font-medium ${
                          sig.sustainabilityTone === 'solid'
                            ? 'text-emerald-400'
                            : sig.sustainabilityTone === 'warning'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {sig.sustainabilityTone === 'warning' ? '◆ ' : ''}
                        {sig.sustainabilityLabel}
                      </span>
                      {' · '}
                      <span>{sig.contextNote}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop Full Table (md+) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
            <th className="py-3 pl-4 pr-2 w-10 font-medium">Seg.</th>
            <th className="py-3 px-3 font-medium">{subjectColumnLabel}</th>
            <th className="py-3 px-3 font-medium">
              <ColumnHelpHeader
                label={
                  experienceMode === 'simple'
                    ? 'Qué está cambiando'
                    : 'Señal y Métrica'
                }
                helpKey="zScore"
                align="left"
              />
            </th>
            <th className="py-3 px-3 font-medium text-right">
              <ColumnHelpHeader
                label={experienceMode === 'simple' ? 'Habitual' : 'Base'}
                helpKey="baselineAvg"
                sortable
                activeSort={sortField === 'baselineAvg'}
                sortAsc={sortAsc}
                onSort={() => handleSort('baselineAvg')}
              />
            </th>
            <th className="py-3 px-3 font-medium text-right">
              <ColumnHelpHeader
                label={`Últ. ${windowSize} PJ`}
                helpKey="windowAvg"
                sortable
                activeSort={sortField === 'windowAvg'}
                sortAsc={sortAsc}
                onSort={() => handleSort('windowAvg')}
              />
            </th>
            <th className="py-3 px-3 font-medium text-right">
              <ColumnHelpHeader
                label="Cambio %"
                helpKey="pctDelta"
                sortable
                activeSort={sortField === 'pctDelta'}
                sortAsc={sortAsc}
                onSort={() => handleSort('pctDelta')}
              />
            </th>
            <th className="py-3 px-3 font-medium text-right">
              <ColumnHelpHeader
                label={experienceMode === 'simple' ? 'Magnitud' : 'Desv. Z'}
                helpKey={
                  experienceMode === 'simple' ? 'magnitudeSimple' : 'zScore'
                }
                sortable
                activeSort={sortField === 'zScore'}
                sortAsc={sortAsc}
                onSort={() => handleSort('zScore')}
              />
            </th>
            <th className="py-3 pl-3 pr-4 font-medium min-w-[260px]">
              {experienceMode === 'simple'
                ? 'Explicación en lenguaje claro'
                : 'Lectura y dato a tener en cuenta'}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E293B] text-sm">
          {sortedRows.map((sig) => {
            const wKey = `${sig.entityType}:${sig.entityId}`;
            const isWatched = watchlistIds.has(wKey);
            const isInverseMetric = sig.metricKey === 'defRtg';
            const isUp = sig.absDelta >= 0;
            const isGood = isInverseMetric ? !isUp : isUp;
            const humanMag = describeZScoreHuman(sig.zScore, isGood);
            const plainExp = plainAnomalyExplanation(sig);

            return (
              <tr
                key={sig.id}
                onClick={() => onInspectEntity(sig.entityType, sig.entityId)}
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
                    className="p-1 rounded text-slate-400 hover:text-orange-400 transition-colors"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        isWatched ? 'fill-orange-400 text-orange-400' : ''
                      }`}
                    />
                  </button>
                </td>
                <td className="py-2.5 px-3">
                  <div className="font-medium text-slate-100 whitespace-nowrap">
                    {sig.entityName}
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">
                    {sig.subtitle}
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <div className="inline-flex items-center gap-1.5 font-medium text-slate-200 whitespace-nowrap">
                    <span>
                      {experienceMode === 'simple'
                        ? plainMetricName(sig.metricKey, sig.metricLabel)
                        : sig.metricLabel}
                    </span>
                    <MetricInfoTooltip
                      helpKey={sig.metricKey}
                      fallbackTitle={sig.metricLabel}
                      align="left"
                    />
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">
                    {experienceMode === 'simple'
                      ? isGood
                        ? 'Evolución positiva'
                        : 'Evolución negativa'
                      : sig.categoryLabel}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                  {sig.baselineAvg.toFixed(1)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                  {sig.windowAvg.toFixed(1)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                  <span
                    className={
                      isGood
                        ? 'text-emerald-400 font-medium'
                        : 'text-rose-400 font-medium'
                    }
                  >
                    {isUp ? '▲' : '▼'} {formatSigned(sig.pctDelta, 1, '%')}
                  </span>
                  <div className="text-xs text-slate-400">
                    {formatSigned(sig.absDelta, 1)}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                  {experienceMode === 'simple' ? (
                    <span className={`text-xs ${humanMag.textClass}`}>
                      {humanMag.label}
                    </span>
                  ) : (
                    <div>
                      <span
                        className={`font-mono tabular-nums ${
                          Math.abs(sig.zScore) >= 1.8
                            ? 'text-orange-400 font-semibold'
                            : 'text-slate-200 font-medium'
                        }`}
                      >
                        {formatSigned(sig.zScore, 2, 'σ')}
                      </span>
                      <div className={`text-[11px] ${humanMag.textClass}`}>
                        {humanMag.label}
                      </div>
                    </div>
                  )}
                </td>
                <td className="py-2.5 pl-3 pr-4 max-w-md">
                  {experienceMode === 'simple' ? (
                    <>
                      <div className="text-xs font-medium text-slate-100">
                        {plainExp.headline}
                      </div>
                      <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                        {plainExp.detail}
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className={`text-xs font-medium ${
                          sig.sustainabilityTone === 'solid'
                            ? 'text-emerald-400'
                            : sig.sustainabilityTone === 'warning'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {sig.sustainabilityTone === 'warning' ? '◆ ' : ''}
                        {sig.sustainabilityLabel}
                      </div>
                      <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                        {sig.contextNote}
                      </div>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export function AnomalyRadarView({
  signals,
  experienceMode,
  watchlistIds,
  onlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  onResetThresholds,
  windowSize,
}: AnomalyRadarViewProps) {
  const [playerCategoryFilter, setPlayerCategoryFilter] = useState<
    'all' | Exclude<AnomalyCategory, 'team_shift'>
  >('all');
  const [teamMetricFilter, setTeamMetricFilter] = useState<
    'all' | 'netRtg' | 'offRtg' | 'defRtg' | 'pace'
  >('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (experienceMode === 'simple' && playerCategoryFilter === 'advanced_shift') {
      setPlayerCategoryFilter('all');
    }
  }, [experienceMode, playerCategoryFilter]);

  const { playerSignals, teamSignals } = useMemo(() => {
    const q = normalizeSearchText(query.trim());

    const pRows: AnomalySignal[] = [];
    const tRows: AnomalySignal[] = [];

    for (const s of signals) {
      const wKey = `${s.entityType}:${s.entityId}`;
      if (onlyWatchlist && !watchlistIds.has(wKey)) continue;
      if (q) {
        const hay = normalizeSearchText(
          `${s.entityName} ${s.teamAbbr} ${s.metricLabel} ${s.categoryLabel} ${s.contextNote}`
        );
        if (!hay.includes(q)) continue;
      }

      if (s.entityType === 'player') {
        if (
          playerCategoryFilter === 'all' ||
          s.category === playerCategoryFilter
        ) {
          pRows.push(s);
        }
      } else {
        if (teamMetricFilter === 'all' || s.metricKey === teamMetricFilter) {
          tRows.push(s);
        }
      }
    }

    return { playerSignals: pRows, teamSignals: tRows };
  }, [
    signals,
    watchlistIds,
    onlyWatchlist,
    query,
    playerCategoryFilter,
    teamMetricFilter,
  ]);

  const statsSummary = useMemo(() => {
    const allPlayers = signals.filter((s) => s.entityType === 'player');
    const allTeams = signals.filter((s) => s.entityType === 'team');
    const surges = allPlayers.filter(
      (s) =>
        s.category === 'surge' ||
        (s.category === 'advanced_shift' && s.absDelta > 0)
    ).length;
    const slumps = allPlayers.filter(
      (s) =>
        s.category === 'slump' ||
        (s.category === 'advanced_shift' && s.absDelta < 0)
    ).length;
    const topSignal = signals[0];
    return {
      playerCount: allPlayers.length,
      teamCount: allTeams.length,
      surges,
      slumps,
      topSignal,
    };
  }, [signals]);

  const playerCategories: Array<{
    id: 'all' | Exclude<AnomalyCategory, 'team_shift'>;
    label: string;
  }> =
    experienceMode === 'simple'
      ? [
          { id: 'all', label: 'Todas' },
          { id: 'surge', label: 'En plena subida' },
          { id: 'slump', label: 'En bache' },
          { id: 'role_shift', label: 'Más minutos o tiros' },
          { id: 'shooting_variance', label: 'Racha de puntería' },
        ]
      : [
          { id: 'all', label: 'Todas' },
          { id: 'surge', label: 'Explosiones' },
          { id: 'slump', label: 'Bajones' },
          { id: 'role_shift', label: 'Uso USG% y Rol' },
          { id: 'advanced_shift', label: 'Impacto GmSc' },
          { id: 'shooting_variance', label: 'Varianza TS%' },
        ];

  const teamCategories: Array<{
    id: 'all' | 'netRtg' | 'offRtg' | 'defRtg' | 'pace';
    label: string;
  }> =
    experienceMode === 'simple'
      ? [
          { id: 'all', label: 'Todas' },
          { id: 'netRtg', label: 'Dominio general' },
          { id: 'offRtg', label: 'Ataque' },
          { id: 'defRtg', label: 'Defensa' },
          { id: 'pace', label: 'Velocidad' },
        ]
      : [
          { id: 'all', label: 'Todas' },
          { id: 'netRtg', label: 'Net Rating' },
          { id: 'offRtg', label: 'Ataque (OffRtg)' },
          { id: 'defRtg', label: 'Defensa (DefRtg)' },
          { id: 'pace', label: 'Ritmo (Pace)' },
        ];

  const topHuman = statsSummary.topSignal
    ? describeZScoreHuman(
        statsSummary.topSignal.zScore,
        statsSummary.topSignal.metricKey === 'defRtg'
          ? statsSummary.topSignal.absDelta <= 0
          : statsSummary.topSignal.absDelta >= 0
      )
    : null;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Row 1: Homogeneous 4-Column Flat Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Jugadores con cambios'
                : 'Anomalías jugadores'}
            </span>
            <MetricInfoTooltip helpKey="zScore" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {statsSummary.playerCount}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {experienceMode === 'simple'
              ? 'Subidas o bajadas fuertes'
              : 'Básicas, USG%, TS% y GmSc'}
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Equipos cambiando'
                : 'Anomalías en equipos'}
            </span>
            <MetricInfoTooltip helpKey="netRtg" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {statsSummary.teamCount}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {experienceMode === 'simple'
              ? 'Ataque, defensa y ritmo'
              : 'NetRtg, OffRtg, DefRtg y Pace'}
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Subida / Bache</span>
            <MetricInfoTooltip helpKey="pctDelta" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            <span className="text-emerald-400">▲ {statsSummary.surges}</span>
            <span className="mx-1.5 sm:mx-2 text-slate-600">/</span>
            <span className="text-rose-400">▼ {statsSummary.slumps}</span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Últ. {windowSize} PJ vs media habitual
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Mayor sorpresa'
                : 'Mayor desv. (|Z|)'}
            </span>
            <MetricInfoTooltip helpKey="zScore" align="right" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {statsSummary.topSignal ? statsSummary.topSignal.entityName : '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
            {statsSummary.topSignal
              ? experienceMode === 'simple'
                ? `${topHuman?.label} · ${formatSigned(
                    statsSummary.topSignal.pctDelta,
                    0,
                    '%'
                  )}`
                : `${statsSummary.topSignal.metricLabel} · Z ${formatSigned(
                    statsSummary.topSignal.zScore
                  )}σ`
              : 'Sin señales con filtro actual'}
          </p>
        </div>
      </div>

      {/* Global Search Filter for Both Blocks */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
        <p className="text-xs text-slate-400">
          <span className="sm:hidden">
            Toca cualquier tarjeta para abrir su ficha completa. Pulsa (i) para ver fórmulas.
          </span>
          <span className="hidden sm:inline">
            Pulsa cualquier fila para ver la ficha completa y el termómetro frente a la media de la NBA. Pasa el ratón por (i) en las columnas para ayuda.
          </span>
        </p>
        <div className="relative w-full sm:w-80 shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar jugador, equipo o estadística..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#131C2E] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
      </div>

      {/* BLOCK 1: Player Anomalies */}
      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              {experienceMode === 'simple'
                ? '01. Jugadores que se Salen de su Media'
                : '01. Anomalías en Jugadores (Básicas y Avanzadas)'}
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
              · {playerSignals.length}
            </span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
            {playerCategories.map((cat) => {
              const active = playerCategoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setPlayerCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          <AnomalyBlockTable
            rows={playerSignals}
            experienceMode={experienceMode}
            windowSize={windowSize}
            watchlistIds={watchlistIds}
            onToggleWatchlist={onToggleWatchlist}
            onInspectEntity={onInspectEntity}
            subjectColumnLabel="Jugador"
            emptyTitle="Sin cambios llamativos en jugadores para el filtro actual."
            emptySubtitle='Elige el modo rápido "Amplio (Ver más)" en la barra superior para detectar tendencias más suaves.'
            onResetThresholds={() => {
              setPlayerCategoryFilter('all');
              setQuery('');
              onResetThresholds();
            }}
          />
        </div>
      </section>

      {/* BLOCK 2: Team Anomalies */}
      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              {experienceMode === 'simple'
                ? '02. Equipos con Cambios en Ataque o Defensa'
                : '02. Anomalías en Equipos (Ratings por 100 Posesiones)'}
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
              · {teamSignals.length}
            </span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
            {teamCategories.map((cat) => {
              const active = teamMetricFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setTeamMetricFilter(cat.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          <AnomalyBlockTable
            rows={teamSignals}
            experienceMode={experienceMode}
            windowSize={windowSize}
            watchlistIds={watchlistIds}
            onToggleWatchlist={onToggleWatchlist}
            onInspectEntity={onInspectEntity}
            subjectColumnLabel="Franquicia"
            emptyTitle="Sin cambios bruscos en equipos con el filtro actual."
            emptySubtitle='Prueba el botón rápido "Amplio (Ver más)" arriba o selecciona la muestra "Continuo" para contar con más partidos.'
            onResetThresholds={() => {
              setTeamMetricFilter('all');
              setQuery('');
              onResetThresholds();
            }}
          />
        </div>
      </section>
    </div>
  );
}
