import { useEffect, useMemo, useState } from 'react';
import { Flame, Search, Shield, Star, Users, Zap } from 'lucide-react';
import type {
  AnomalyCategory,
  AnomalySignal,
  ExperienceMode,
  PlayerSummary,
  TeamSummary,
  TrendBreakoutAlert,
  TrendBreakoutAxis,
  WindowComparisonStrip,
  WindowSize,
} from '../types/nba';
import {
  DEFAULT_UNIFIED_FILTERS,
  buildEntityLookupContext,
  matchesEntityUnifiedFilters,
  matchesPlayerUnifiedFilters,
  type UnifiedTableFiltersState,
} from '../utils/entityFilters';
import { UnifiedEntityFilterBar } from './UnifiedEntityFilterBar';
import { formatSigned, normalizeSearchText } from '../utils/analytics';
import {
  describeZScoreHuman,
  evaluateVsLeague,
  isAnomalyPositive,
  plainAnomalyExplanation,
  plainMetricName,
  resolveSignalBenchmark,
  type LeagueBenchmarks,
} from '../utils/humanize';
import { STICKY_THEAD_CLASS, sortRows } from '../utils/tableSort';
import {
  BreakdownDetailCell,
  MetricInfoTooltip,
  NbaComparisonBar,
  SortableTh,
} from './MetricUiHelpers';
import { EntityBadge, PlayerAvatar } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import { buildTableSnapshotBlob } from '../utils/exportImageCard';

interface AnomalyRadarViewProps {
  signals: AnomalySignal[];
  trendBreakouts: TrendBreakoutAlert[];
  players?: PlayerSummary[];
  teams?: TeamSummary[];
  benchmarks: LeagueBenchmarks;
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onResetThresholds: () => void;
  windowSize: WindowSize;
  onChangeWindowSize: (w: WindowSize) => void;
  initialBreakoutAxis?: 'all' | TrendBreakoutAxis;
  onConsumeInitialAxis?: () => void;
  onNavigateStreaks?: () => void;
}

type SortField =
  | 'watched'
  | 'entityName'
  | 'metricLabel'
  | 'baselineAvg'
  | 'windowAvg'
  | 'pctDelta'
  | 'zScore'
  | 'vsNba'
  | 'streakAndRead';
type BreakoutSortField =
  | 'watched'
  | 'playerName'
  | 'axisAlert'
  | 'windowAvg'
  | 'baselineAvg'
  | 'absDelta'
  | 'breakoutScore'
  | 'streakRead';

function CompactWindowStrip({
  windows,
  activeWindow,
  decimals = 1,
  suffix = '',
}: {
  windows: WindowComparisonStrip;
  activeWindow: WindowSize;
  decimals?: number;
  suffix?: string;
}) {
  const cells: Array<{ key: 'season' | WindowSize; label: string; val: number }> = [
    { key: 'season', label: 'Temp', val: windows.season },
    { key: 10, label: '10P', val: windows.l10 },
    { key: 5, label: '5P', val: windows.l5 },
    { key: 3, label: '3P', val: windows.l3 },
  ];

  return (
    <div className="inline-grid grid-cols-4 gap-1.5 font-mono tabular-nums text-[11px]">
      {cells.map((c) => {
        const isActive = c.key === activeWindow;
        return (
          <div
            key={String(c.key)}
            className={`px-1.5 py-0.5 rounded text-right ${
              isActive
                ? 'bg-[#0B1120] border border-orange-500/45 text-orange-300 font-semibold'
                : 'bg-[#0B1120]/55 border border-[#1E293B]/80 text-slate-300'
            }`}
          >
            <div className="text-[9.5px] leading-none text-slate-500 font-sans mb-0.5">
              {c.label}
            </div>
            <div className="leading-tight">
              {c.val.toFixed(decimals)}
              {suffix}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DivergenceMeterBar({
  pctDelta,
  zScore,
  isPositive,
}: {
  pctDelta: number;
  zScore: number;
  isPositive: boolean;
}) {
  // Visualizes deviation magnitude from center baseline (50%)
  const rawSpan = Math.max(Math.abs(zScore) * 16, Math.abs(pctDelta) * 0.85);
  const clampedHalfPct = Math.max(7, Math.min(48, Math.round(rawSpan)));

  return (
    <div className="relative h-2 w-full bg-[#0B1120] border border-[#1E293B] rounded overflow-hidden">
      <div
        title="Media de temporada"
        className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-slate-200/75 z-10"
      />
      {isPositive ? (
        <div
          className="absolute top-0 bottom-0 bg-emerald-500 rounded-r transition-transform"
          style={{ left: '50%', width: `${clampedHalfPct}%` }}
        />
      ) : (
        <div
          className="absolute top-0 bottom-0 bg-rose-500 rounded-l transition-transform"
          style={{
            left: `${50 - clampedHalfPct}%`,
            width: `${clampedHalfPct}%`,
          }}
        />
      )}
    </div>
  );
}

interface AnomalyBlockTableProps {
  rows: AnomalySignal[];
  benchmarks: LeagueBenchmarks;
  experienceMode: ExperienceMode;
  windowSize: WindowSize;
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
  benchmarks,
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
    return sortRows(
      rows,
      (sig) => {
        switch (sortField) {
          case 'watched':
            return watchlistIds.has(`${sig.entityType}:${sig.entityId}`) ? 1 : 0;
          case 'entityName':
            return sig.entityName;
          case 'metricLabel':
            return experienceMode === 'simple'
              ? plainMetricName(sig.metricKey, sig.metricLabel)
              : sig.metricLabel;
          case 'baselineAvg':
            return sig.baselineAvg;
          case 'windowAvg':
            return sig.windowAvg;
          case 'pctDelta':
            return Math.abs(sig.pctDelta);
          case 'zScore':
            return Math.abs(sig.zScore);
          case 'vsNba': {
            const benchInfo = resolveSignalBenchmark(sig, benchmarks);
            return evaluateVsLeague(benchInfo.value, benchInfo.benchmark).pct;
          }
          case 'streakAndRead':
            return (
              (sig.activeStreakCount || 0) * 100 +
              (sig.sustainabilityTone === 'solid' ||
              sig.sustainabilityTone === 'sustainable'
                ? 2
                : sig.sustainabilityTone === 'warning'
                ? 1
                : 0)
            );
          default:
            return Math.abs(sig.zScore);
        }
      },
      sortAsc
    );
  }, [rows, sortField, sortAsc, watchlistIds, experienceMode, benchmarks]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(field === 'entityName' || field === 'metricLabel');
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
            const isUp = sig.absDelta >= 0;
            const isGood = isAnomalyPositive(sig);
            const humanMag = describeZScoreHuman(sig.zScore, isGood);
            const plainExp = plainAnomalyExplanation(sig);
            const benchInfo = resolveSignalBenchmark(sig, benchmarks);

            return (
              <div
                key={sig.id}
                onClick={() => onInspectEntity(sig.entityType, sig.entityId)}
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
                          isWatched ? 'fill-orange-400 text-orange-400' : ''
                        }`}
                      />
                    </button>
                    <EntityBadge
                      entityType={sig.entityType}
                      entityId={sig.entityId}
                      name={sig.entityName}
                      teamAbbr={sig.teamAbbr}
                      showTeamBadge={sig.entityType === 'player'}
                      size="sm"
                    />
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

                {sig.windows ? (
                  <div className="flex items-center justify-between gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2">
                    <CompactWindowStrip
                      windows={sig.windows}
                      activeWindow={windowSize}
                      decimals={1}
                      suffix={sig.unit === '%' ? '%' : ''}
                    />
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div
                        className={`text-xs font-semibold ${
                          isGood ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isUp ? '▲ ' : '▼ '}
                        {formatSigned(sig.pctDelta, 1, '%')}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {formatSigned(sig.absDelta, 1)}
                      </div>
                    </div>
                  </div>
                ) : (
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
                )}

                <NbaComparisonBar
                  value={benchInfo.value}
                  benchmark={benchInfo.benchmark}
                  showValueLabel={benchInfo.showValueLabel}
                />

                <div className="text-xs leading-relaxed">
                  {experienceMode === 'simple' ? (
                    <p className="text-slate-300">
                      <span className="font-medium text-slate-100">
                        {plainExp.headline}:
                      </span>{' '}
                      <span className="text-slate-400">{plainExp.detail}</span>
                      {sig.activeStreakLabel && (sig.activeStreakCount || 0) > 0 && (
                        <span className="text-orange-300 font-medium">
                          {' · '}Racha {sig.activeStreakCount} PJ ({sig.activeStreakLabel})
                        </span>
                      )}
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
                      {sig.activeStreakLabel && (sig.activeStreakCount || 0) > 0 && (
                        <span className="text-orange-300 font-medium">
                          {' · '}Racha {sig.activeStreakCount} PJ ({sig.activeStreakLabel})
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop Full Table (md+) */}
      <div className="hidden md:block overflow-auto max-h-[68vh]">
        <table className="w-full text-left border-collapse">
          <thead className={STICKY_THEAD_CLASS}>
            <tr className="border-b border-[#1E293B] text-xs text-slate-400">
              <SortableTh
                label="Seg."
                align="left"
                compact
                active={sortField === 'watched'}
                asc={sortAsc}
                onSort={() => handleSort('watched')}
                className="py-3 pl-4 pr-2 w-10"
              />
              <SortableTh
                label={subjectColumnLabel}
                align="left"
                active={sortField === 'entityName'}
                asc={sortAsc}
                onSort={() => handleSort('entityName')}
                className="py-3 px-3"
              />
              <SortableTh
                label={
                  experienceMode === 'simple'
                    ? 'Qué está cambiando'
                    : 'Señal y Métrica'
                }
                helpKey="zScore"
                align="left"
                active={sortField === 'metricLabel'}
                asc={sortAsc}
                onSort={() => handleSort('metricLabel')}
                className="py-3 px-3"
              />
              <SortableTh
                label={experienceMode === 'simple' ? 'Habitual' : 'Temporada'}
                helpKey="baselineAvg"
                align="right"
                active={sortField === 'baselineAvg'}
                asc={sortAsc}
                onSort={() => handleSort('baselineAvg')}
                className="py-3 px-3"
              />
              <SortableTh
                label={`Últ. ${windowSize} PJ`}
                helpKey="windowAvg"
                align="right"
                active={sortField === 'windowAvg'}
                asc={sortAsc}
                onSort={() => handleSort('windowAvg')}
                className="py-3 px-3"
              />
              <SortableTh
                label="Cambio %"
                helpKey="pctDelta"
                align="right"
                active={sortField === 'pctDelta'}
                asc={sortAsc}
                onSort={() => handleSort('pctDelta')}
                className="py-3 px-3"
              />
              <SortableTh
                label={experienceMode === 'simple' ? 'Magnitud' : 'Desv. Z'}
                helpKey={
                  experienceMode === 'simple' ? 'magnitudeSimple' : 'zScore'
                }
                align="right"
                active={sortField === 'zScore'}
                asc={sortAsc}
                onSort={() => handleSort('zScore')}
                className="py-3 px-3"
              />
              <SortableTh
                label="Estadística vs Media NBA"
                helpKey="vsLeagueBar"
                align="left"
                active={sortField === 'vsNba'}
                asc={sortAsc}
                onSort={() => handleSort('vsNba')}
                className="py-3 px-3 min-w-[215px]"
              />
              <SortableTh
                label={
                  experienceMode === 'simple'
                    ? 'Explicación y racha'
                    : 'Lectura, ventanas y racha'
                }
                align="left"
                active={sortField === 'streakAndRead'}
                asc={sortAsc}
                onSort={() => handleSort('streakAndRead')}
                className="py-3 pl-3 pr-4 min-w-[240px]"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-sm">
            {sortedRows.map((sig) => {
              const wKey = `${sig.entityType}:${sig.entityId}`;
              const isWatched = watchlistIds.has(wKey);
              const isUp = sig.absDelta >= 0;
              const isGood = isAnomalyPositive(sig);
              const humanMag = describeZScoreHuman(sig.zScore, isGood);
              const plainExp = plainAnomalyExplanation(sig);
              const benchInfo = resolveSignalBenchmark(sig, benchmarks);

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
                    <div className="flex items-center gap-2.5">
                      <EntityBadge
                        entityType={sig.entityType}
                        entityId={sig.entityId}
                        name={sig.entityName}
                        teamAbbr={sig.teamAbbr}
                        showTeamBadge={sig.entityType === 'player'}
                        size="sm"
                      />
                      <div>
                        <div className="font-medium text-slate-100 whitespace-nowrap">
                          {sig.entityName}
                        </div>
                        <div className="text-xs text-slate-400 whitespace-nowrap">
                          {sig.subtitle}
                        </div>
                      </div>
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
                    {sig.unit === '%' ? '%' : ''}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                    <div className="font-semibold text-slate-100">
                      {sig.windowAvg.toFixed(1)}
                      {sig.unit === '%' ? '%' : ''}
                    </div>
                    {sig.windows && (
                      <div className="text-[10.5px] text-slate-400">
                        10P {sig.windows.l10.toFixed(1)} · 5P{' '}
                        {sig.windows.l5.toFixed(1)} · 3P{' '}
                        {sig.windows.l3.toFixed(1)}
                      </div>
                    )}
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
                      {formatSigned(
                        sig.absDelta,
                        1,
                        sig.unit === '%' ? ' pp' : ''
                      )}
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
                  <td className="py-2.5 px-3">
                    <NbaComparisonBar
                      value={benchInfo.value}
                      benchmark={benchInfo.benchmark}
                      compact
                      showValueLabel={benchInfo.showValueLabel}
                    />
                  </td>
                  <td className="py-2.5 pl-3 pr-4 max-w-md">
                    <BreakdownDetailCell
                      entityName={`${sig.entityName}${
                        sig.entityType === 'player' ? ` (${sig.teamAbbr})` : ''
                      }`}
                      badgeLabel={`${isUp ? '▲' : '▼'} ${
                        experienceMode === 'simple'
                          ? plainMetricName(sig.metricKey, sig.metricLabel)
                          : sig.metricLabel
                      } (${formatSigned(sig.pctDelta, 1, '%')})`}
                      badgeTone={isGood ? 'positive' : 'negative'}
                      diagnosisLabel={
                        experienceMode === 'advanced'
                          ? sig.sustainabilityLabel
                          : undefined
                      }
                      diagnosisTone={sig.sustainabilityTone}
                      headline={plainExp.headline}
                      detailText={
                        experienceMode === 'simple'
                          ? plainExp.detail
                          : sig.contextNote || plainExp.detail
                      }
                      secondaryText={
                        sig.takeaways && sig.takeaways.length > 0
                          ? sig.takeaways.join(' · ')
                          : undefined
                      }
                      windowsSummary={
                        sig.windows
                          ? `Temp ${sig.windows.season.toFixed(1)}${
                              sig.unit === '%' ? '%' : ''
                            } · 10P ${sig.windows.l10.toFixed(1)}${
                              sig.unit === '%' ? '%' : ''
                            } · 5P ${sig.windows.l5.toFixed(1)}${
                              sig.unit === '%' ? '%' : ''
                            } · 3P ${sig.windows.l3.toFixed(1)}${
                              sig.unit === '%' ? '%' : ''
                            }`
                          : undefined
                      }
                      streakText={
                        sig.activeStreakLabel && (sig.activeStreakCount || 0) > 0
                          ? `Racha activa: ${sig.activeStreakCount} PJ · ${sig.activeStreakLabel}`
                          : null
                      }
                    >
                      {experienceMode === 'simple' ? (
                        <>
                          <div className="text-xs font-medium text-slate-100 truncate">
                            {plainExp.headline}
                          </div>
                          <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                            {plainExp.detail}
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            className={`text-xs font-medium truncate ${
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
                      {sig.activeStreakLabel && (sig.activeStreakCount || 0) > 0 && (
                        <div className="text-[11px] font-mono tabular-nums text-orange-300 mt-0.5 truncate">
                          Racha activa: {sig.activeStreakCount} PJ ·{' '}
                          {sig.activeStreakLabel}
                        </div>
                      )}
                    </BreakdownDetailCell>
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

const BREAKOUT_AXES_META: Array<{
  id: TrendBreakoutAxis;
  titleSimple: string;
  titleAdvanced: string;
  subtitleSimple: string;
  subtitleAdvanced: string;
  helpKey: string;
}> = [
  {
    id: 'exterior',
    titleSimple: 'Tiro Exterior',
    titleAdvanced: 'Tiro Exterior (3P% · 3PM · 3PA)',
    subtitleSimple: 'Muñeca caliente o sequía en triples',
    subtitleAdvanced: 'Acierto ponderado y luz verde exterior',
    helpKey: 'breakoutExterior',
  },
  {
    id: 'minutes_usage',
    titleSimple: 'Minutos y Uso',
    titleAdvanced: 'Minutos y Uso (MIN · USG% · TCI)',
    subtitleSimple: 'Más o menos tiempo en pista y balón',
    subtitleAdvanced: 'Rotación estructural y absorción ofensiva',
    helpKey: 'breakoutMinutesUsage',
  },
  {
    id: 'efficiency',
    titleSimple: 'Eficiencia de Tiro',
    titleAdvanced: 'Eficiencia (TS% · eFG% · GmSc)',
    subtitleSimple: 'Aprovechamiento real de sus lanzamientos',
    subtitleAdvanced: 'Conversión verdadera ponderada vs temporada',
    helpKey: 'breakoutEfficiency',
  },
];

export function AnomalyRadarView({
  signals,
  trendBreakouts,
  players = [],
  teams = [],
  benchmarks,
  experienceMode,
  watchlistIds,
  onlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  onResetThresholds,
  windowSize,
  onChangeWindowSize,
  initialBreakoutAxis = 'all',
  onConsumeInitialAxis,
  onNavigateStreaks,
}: AnomalyRadarViewProps) {
  const [directionFilter, setDirectionFilter] = useState<
    'all' | 'positive' | 'negative'
  >('all');
  const [breakoutAxisFilter, setBreakoutAxisFilter] = useState<
    'all' | TrendBreakoutAxis
  >(initialBreakoutAxis);
  const [onlyWithActiveStreak, setOnlyWithActiveStreak] = useState(false);
  const [breakoutSortField, setBreakoutSortField] =
    useState<BreakoutSortField>('breakoutScore');
  const [breakoutSortAsc, setBreakoutSortAsc] = useState(false);

  const [playerCategoryFilter, setPlayerCategoryFilter] = useState<
    'all' | Exclude<AnomalyCategory, 'team_shift'>
  >('all');
  const [teamMetricFilter, setTeamMetricFilter] = useState<
    'all' | 'netRtg' | 'offRtg' | 'defRtg' | 'pace'
  >('all');
  const [query, setQuery] = useState('');
  const [unifiedFilters, setUnifiedFilters] = useState<UnifiedTableFiltersState>(
    DEFAULT_UNIFIED_FILTERS
  );

  const entityLookup = useMemo(
    () => buildEntityLookupContext(players, teams),
    [players, teams]
  );

  useEffect(() => {
    if (initialBreakoutAxis && initialBreakoutAxis !== 'all') {
      setBreakoutAxisFilter(initialBreakoutAxis);
      onConsumeInitialAxis?.();
    }
  }, [initialBreakoutAxis, onConsumeInitialAxis]);

  useEffect(() => {
    if (experienceMode === 'simple' && playerCategoryFilter === 'advanced_shift') {
      setPlayerCategoryFilter('all');
    }
  }, [experienceMode, playerCategoryFilter]);

  const handleBreakoutSort = (field: BreakoutSortField) => {
    if (breakoutSortField === field) {
      setBreakoutSortAsc((prev) => !prev);
    } else {
      setBreakoutSortField(field);
      setBreakoutSortAsc(field === 'playerName' || field === 'axisAlert');
    }
  };

  // Scoped breakouts (respecting watchlist, search, direction, axis, streak toggle)
  const { axisCardsSummary, filteredBreakouts, totalScopedBreakouts } =
    useMemo(() => {
      const q = normalizeSearchText(query.trim());

      const basePool = trendBreakouts.filter((b) => {
        const wKey = `player:${b.playerId}`;
        if (onlyWatchlist && !watchlistIds.has(wKey)) return false;
        if (directionFilter !== 'all' && b.direction !== directionFilter) {
          return false;
        }
        if (onlyWithActiveStreak && !b.activeStreakLabel) return false;
        if (
          !matchesPlayerUnifiedFilters(
            { id: b.playerId, teamAbbr: b.teamAbbr, position: b.position },
            unifiedFilters,
            entityLookup
          )
        ) {
          return false;
        }
        if (q) {
          const hay = normalizeSearchText(
            `${b.playerName} ${b.teamAbbr} ${b.axisLabel} ${b.badgeLabel} ${b.metricLabel} ${b.secondaryLabel}`
          );
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      const axisMap = BREAKOUT_AXES_META.map((meta) => {
        const items = basePool.filter((b) => b.axis === meta.id);
        const pos = items.filter((b) => b.direction === 'positive').length;
        const neg = items.filter((b) => b.direction === 'negative').length;
        return {
          ...meta,
          total: items.length,
          pos,
          neg,
          topAlert: items[0] || null,
        };
      });

      const axisFiltered =
        breakoutAxisFilter === 'all'
          ? basePool
          : basePool.filter((b) => b.axis === breakoutAxisFilter);

      const sorted = sortRows(
        axisFiltered,
        (b) => {
          switch (breakoutSortField) {
            case 'watched':
              return watchlistIds.has(`player:${b.playerId}`) ? 1 : 0;
            case 'playerName':
              return b.playerName;
            case 'axisAlert':
              return `${b.axisLabel} ${b.badgeLabel}`;
            case 'windowAvg':
              return b.windowAvg;
            case 'baselineAvg':
              return b.baselineAvg;
            case 'absDelta':
              return Math.abs(b.absDelta);
            case 'breakoutScore':
              return b.breakoutScore;
            case 'streakRead':
              return (
                (b.activeStreakCount || 0) * 100 +
                (b.sustainabilityTone === 'solid'
                  ? 2
                  : b.sustainabilityTone === 'warning'
                  ? 1
                  : 0)
              );
            default:
              return b.breakoutScore;
          }
        },
        breakoutSortAsc
      );

      return {
        axisCardsSummary: axisMap,
        filteredBreakouts: sorted,
        totalScopedBreakouts: basePool.length,
      };
    }, [
      trendBreakouts,
      onlyWatchlist,
      watchlistIds,
      directionFilter,
      onlyWithActiveStreak,
      unifiedFilters,
      entityLookup,
      query,
      breakoutAxisFilter,
      breakoutSortField,
      breakoutSortAsc,
    ]);

  const { playerSignals, teamSignals } = useMemo(() => {
    const q = normalizeSearchText(query.trim());

    const pRows: AnomalySignal[] = [];
    const tRows: AnomalySignal[] = [];

    for (const s of signals) {
      const wKey = `${s.entityType}:${s.entityId}`;
      if (onlyWatchlist && !watchlistIds.has(wKey)) continue;
      if (onlyWithActiveStreak && !s.activeStreakLabel) continue;
      const positive = isAnomalyPositive(s);
      if (directionFilter === 'positive' && !positive) continue;
      if (directionFilter === 'negative' && positive) continue;

      if (
        !matchesEntityUnifiedFilters(
          {
            entityType: s.entityType,
            entityId: s.entityId,
            teamAbbr: s.teamAbbr,
          },
          unifiedFilters,
          entityLookup
        )
      ) {
        continue;
      }

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
    onlyWithActiveStreak,
    directionFilter,
    unifiedFilters,
    entityLookup,
    query,
    playerCategoryFilter,
    teamMetricFilter,
  ]);

  const statsSummary = useMemo(() => {
    const allPlayers = signals.filter((s) => s.entityType === 'player');
    const allTeams = signals.filter((s) => s.entityType === 'team');
    const surges = signals.filter((s) => isAnomalyPositive(s)).length;
    const slumps = signals.filter((s) => !isAnomalyPositive(s)).length;
    const posBreakouts = trendBreakouts.filter(
      (b) => b.direction === 'positive'
    ).length;
    const negBreakouts = trendBreakouts.filter(
      (b) => b.direction === 'negative'
    ).length;
    const topSignal = signals[0];
    return {
      playerCount: allPlayers.length,
      teamCount: allTeams.length,
      surges,
      slumps,
      posBreakouts,
      negBreakouts,
      topSignal,
    };
  }, [signals, trendBreakouts]);

  const playerCategories: Array<{
    id: 'all' | Exclude<AnomalyCategory, 'team_shift'>;
    label: string;
  }> =
    experienceMode === 'simple'
      ? [
          { id: 'all', label: 'Todas' },
          { id: 'surge', label: 'En subida' },
          { id: 'slump', label: 'En bache' },
          { id: 'exterior_shift', label: 'Triples y 3P%' },
          { id: 'role_shift', label: 'Minutos y tiros' },
          { id: 'shooting_variance', label: 'Eficiencia tiro' },
        ]
      : [
          { id: 'all', label: 'Todas' },
          { id: 'surge', label: 'Explosiones' },
          { id: 'slump', label: 'Bajones' },
          { id: 'exterior_shift', label: 'Tiro Exterior 3P' },
          { id: 'role_shift', label: 'Minutos y Uso USG%' },
          { id: 'shooting_variance', label: 'Eficiencia TS%' },
          { id: 'advanced_shift', label: 'Impacto GmSc' },
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
        isAnomalyPositive(statsSummary.topSignal)
      )
    : null;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Row 1: Homogeneous 4-Column Flat Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Rupturas de tendencia</span>
            <MetricInfoTooltip helpKey="trendBreakouts" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            <span className="text-emerald-400">
              ▲ {statsSummary.posBreakouts}
            </span>
            <span className="mx-1.5 text-slate-600">/</span>
            <span className="text-rose-400">▼ {statsSummary.negBreakouts}</span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Triple, Minutos/Uso y Eficiencia
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Desviaciones globales'
                : 'Anomalías jugadores y equipos'}
            </span>
            <MetricInfoTooltip helpKey="zScore" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {statsSummary.playerCount}{' '}
            <span className="text-sm font-normal text-slate-400">
              jug · {statsSummary.teamCount} eq
            </span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Últ. {windowSize} PJ vs media de temporada
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Balance Subida / Bache</span>
            <MetricInfoTooltip helpKey="pctDelta" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            <span className="text-emerald-400">▲ {statsSummary.surges}</span>
            <span className="mx-1.5 sm:mx-2 text-slate-600">/</span>
            <span className="text-rose-400">▼ {statsSummary.slumps}</span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Señales positivas vs negativas
          </p>
        </div>

        <div
          onClick={() =>
            statsSummary.topSignal &&
            onInspectEntity(
              statsSummary.topSignal.entityType,
              statsSummary.topSignal.entityId
            )
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            statsSummary.topSignal
              ? 'hover:bg-[#182338] active:bg-[#182338] cursor-pointer'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Mayor sorpresa hoy'
                : 'Mayor desviación (|Z|)'}
            </span>
            <MetricInfoTooltip helpKey="zScore" align="right" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {statsSummary.topSignal && (
              <EntityBadge
                entityType={statsSummary.topSignal.entityType}
                entityId={statsSummary.topSignal.entityId}
                name={statsSummary.topSignal.entityName}
                teamAbbr={statsSummary.topSignal.teamAbbr}
                showTeamBadge={statsSummary.topSignal.entityType === 'player'}
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {statsSummary.topSignal
                  ? statsSummary.topSignal.entityName
                  : '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
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
        </div>
      </div>

      {/* Row 2: Configurable Window Quick Bar (3 / 5 / 10 PJ vs Temporada) + Sign Toggle + Streak Filter + Search */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Time Window Selector */}
          <div className="inline-flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg">
            <span className="px-2 text-[11px] text-slate-400 hidden sm:inline whitespace-nowrap">
              Ventana vs Temp.:
            </span>
            {([3, 5, 10] as WindowSize[]).map((w) => {
              const active = windowSize === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => onChangeWindowSize(w)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                  }`}
                >
                  Últ. {w} PJ
                </button>
              );
            })}
          </div>

          {/* Direction Sign Selector */}
          <div className="inline-flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => setDirectionFilter('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                directionFilter === 'all'
                  ? 'bg-orange-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter('positive')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                directionFilter === 'positive'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              ▲ Positivas
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter('negative')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                directionFilter === 'negative'
                  ? 'bg-rose-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              ▼ Negativas
            </button>
          </div>

          {/* Active Streak Cross-Filter */}
          <button
            type="button"
            onClick={() => setOnlyWithActiveStreak((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              onlyWithActiveStreak
                ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                : 'bg-[#131C2E] border-[#1E293B] text-slate-300 hover:text-white hover:bg-[#182338]'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span>Con racha activa</span>
          </button>
        </div>

        <div className="relative w-full xl:w-80 shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar jugador, equipo o métrica..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#131C2E] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
      </div>

      <UnifiedEntityFilterBar
        filters={unifiedFilters}
        onChange={setUnifiedFilters}
        players={players}
        teams={teams}
        entityScope="mixed"
        shownCount={filteredBreakouts.length + playerSignals.length + teamSignals.length}
        totalCount={trendBreakouts.length + signals.length}
        unitLabel="alertas"
      />

      {/* BLOCK 01: Visual Trend-Breakout Alerts (Exterior Shooting, Minutes/Usage, Efficiency) */}
      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              {experienceMode === 'simple'
                ? `01. Alertas de Rupturas de Tendencia (Últimos ${windowSize} PJ vs Temporada)`
                : `01. Rupturas de Tendencia: Tiro Exterior, Minutos/Uso y Eficiencia (Últ. ${windowSize} PJ)`}
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
              · {filteredBreakouts.length}
            </span>
            <MetricInfoTooltip helpKey="trendBreakouts" align="left" />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
            <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setBreakoutAxisFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  breakoutAxisFilter === 'all'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                }`}
              >
                Todos los ejes ({totalScopedBreakouts})
              </button>
              {axisCardsSummary.map((ax) => {
                const active = breakoutAxisFilter === ax.id;
                return (
                  <button
                    key={ax.id}
                    type="button"
                    onClick={() => setBreakoutAxisFilter(ax.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                    }`}
                  >
                    {ax.titleSimple} ({ax.total})
                  </button>
                );
              })}
            </div>

            {onNavigateStreaks && (
              <button
                type="button"
                onClick={onNavigateStreaks}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Evaluar rachas →</span>
              </button>
            )}

            <ExportImageButton
              disabled={filteredBreakouts.length === 0}
              onBuildImage={async () => {
                const dateSlug = new Date().toISOString().slice(0, 10);
                const topRows = filteredBreakouts.slice(0, 18);
                const filename = `radarnba-rupturas-tendencia-${dateSlug}.png`;
                return buildTableSnapshotBlob({
                  filename,
                  categoryTag: 'RADAR DE ANOMALÍAS · RUPTURA DE TENDENCIA',
                  title: `Alertas de Ruptura de Tendencia (Últ. ${windowSize} PJ vs Base)`,
                  subtitle: `${filteredBreakouts.length} alertas activas en Uso/Minutos, Eficiencia TS% y Impacto Defensivo`,
                  entityColumnLabel: 'JUGADOR',
                  entityColumnWeight: 2.2,
                  kpis: [
                    {
                      label: 'RUPTURAS ACTIVAS',
                      value: `${filteredBreakouts.length}`,
                      sublabel: `Ventana Últ. ${windowSize} PJ`,
                      tone: 'accent',
                    },
                    {
                      label: 'SUBIDAS / BAJADAS',
                      value: `${
                        filteredBreakouts.filter((b) => b.direction === 'positive').length
                      } ↑ · ${
                        filteredBreakouts.filter((b) => b.direction !== 'positive').length
                      } ↓`,
                      tone: 'positive',
                    },
                  ],
                  columns: [
                    { key: 'axis', label: 'EJE / SEÑAL', align: 'left', widthWeight: 1.55 },
                    { key: 'base', label: 'MEDIA BASE', align: 'right', widthWeight: 0.95 },
                    { key: 'win', label: `ÚLT. ${windowSize} PJ`, align: 'right', widthWeight: 1.0 },
                    { key: 'delta', label: 'CAMBIO', align: 'right', widthWeight: 1.1 },
                    { key: 'z', label: 'Z-SCORE', align: 'right', widthWeight: 0.9 },
                  ],
                  rows: topRows.map((b, idx) => ({
                    rank: idx + 1,
                    teamAbbr: b.teamAbbr,
                    entityName: b.playerName,
                    entitySubtext: `${b.position} · ${b.sustainabilityLabel}`,
                    cells: {
                      axis: {
                        text: b.badgeLabel,
                        subtext: b.metricLabel,
                        tone: b.direction === 'positive' ? 'positive' : 'negative',
                      },
                      base: { text: `${b.baselineAvg.toFixed(b.decimals)}${b.unit}` },
                      win: {
                        text: `${b.windowAvg.toFixed(b.decimals)}${b.unit}`,
                        tone: b.direction === 'positive' ? 'positive' : 'negative',
                      },
                      delta: {
                        text: `${formatSigned(b.absDelta, b.decimals)}${b.unit}`,
                        subtext: `${formatSigned(b.pctDelta, 0)}%`,
                        tone: b.direction === 'positive' ? 'positive' : 'negative',
                      },
                      z: { text: `${formatSigned(b.zScore, 2)}σ`, tone: 'accent' },
                    },
                  })),
                  footerNote: `Mostrando top ${topRows.length} de ${filteredBreakouts.length} rupturas de tendencia`,
                });
              }}
            />
          </div>
        </div>

        {/* 3-Column Interactive Axis Summary Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[#1E293B]">
          {axisCardsSummary.map((ax) => {
            const isSelected = breakoutAxisFilter === ax.id;
            const top = ax.topAlert;
            return (
              <div
                key={ax.id}
                onClick={() =>
                  setBreakoutAxisFilter((prev) =>
                    prev === ax.id ? 'all' : ax.id
                  )
                }
                className={`p-3.5 sm:p-4 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#182338]'
                    : 'hover:bg-[#182338]/75 active:bg-[#182338]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`text-xs font-semibold truncate ${
                        isSelected ? 'text-orange-300' : 'text-slate-100'
                      }`}
                    >
                      {experienceMode === 'simple'
                        ? ax.titleSimple
                        : ax.titleAdvanced}
                    </span>
                    <MetricInfoTooltip helpKey={ax.helpKey} align="left" />
                  </div>
                  <div className="font-mono tabular-nums text-xs shrink-0">
                    <span className="text-emerald-400 font-semibold">
                      ▲ {ax.pos}
                    </span>
                    <span className="mx-1 text-slate-600">/</span>
                    <span className="text-rose-400 font-semibold">
                      ▼ {ax.neg}
                    </span>
                  </div>
                </div>

                <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                  {experienceMode === 'simple'
                    ? ax.subtitleSimple
                    : ax.subtitleAdvanced}
                </p>

                {top ? (
                  <div className="mt-2.5 pt-2.5 border-t border-[#1E293B]/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar
                        playerId={top.playerId}
                        name={top.playerName}
                        teamAbbr={top.teamAbbr}
                        showTeamBadge
                        size="xs"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-100 truncate">
                          {top.playerName}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {top.badgeLabel}
                        </p>
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div
                        className={`text-xs font-semibold ${
                          top.direction === 'positive'
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {top.direction === 'positive' ? '▲ ' : '▼ '}
                        {top.windowAvg.toFixed(top.decimals)}
                        {top.unit === '%' ? '%' : ''}
                      </div>
                      <div className="text-[10.5px] text-slate-400">
                        Base {top.baselineAvg.toFixed(top.decimals)}
                        {top.unit === '%' ? '%' : ''}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2.5 pt-2.5 border-t border-[#1E293B]/80 text-[11px] text-slate-500">
                    Sin alertas activas en este eje con el filtro actual.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Breakout Alerts Data Grid */}
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {filteredBreakouts.length === 0 ? (
            <div className="py-10 px-6 text-center">
              <p className="text-sm font-medium text-slate-200">
                No hay rupturas de tendencia para la combinación de filtros seleccionada.
              </p>
              <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
                Prueba a mostrar todos los ejes o selecciona la sensibilidad
                &ldquo;Amplio (Ver más)&rdquo; para detectar giros incipientes.
              </p>
              <button
                type="button"
                onClick={() => {
                  setBreakoutAxisFilter('all');
                  setDirectionFilter('all');
                  setOnlyWithActiveStreak(false);
                  setQuery('');
                  setUnifiedFilters(DEFAULT_UNIFIED_FILTERS);
                  onResetThresholds();
                }}
                className="mt-3.5 px-3.5 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap shrink-0"
              >
                Restablecer filtros recomendados
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Cards (< md) */}
              <div className="md:hidden divide-y divide-[#1E293B]">
                {filteredBreakouts.slice(0, 30).map((b) => {
                  const wKey = `player:${b.playerId}`;
                  const watched = watchlistIds.has(wKey);
                  const isPos = b.direction === 'positive';

                  return (
                    <div
                      key={b.id}
                      onClick={() => onInspectEntity('player', b.playerId)}
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
                            playerId={b.playerId}
                            name={b.playerName}
                            teamAbbr={b.teamAbbr}
                            showTeamBadge
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-100 truncate">
                              {b.playerName}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              {b.teamAbbr} · {b.position} · {b.axisLabel}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className={`text-xs font-semibold ${
                              isPos ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isPos ? '▲ ' : '▼ '}
                            {b.badgeLabel}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-400">
                            {formatSigned(
                              b.absDelta,
                              b.decimals,
                              b.unit === '%' ? ' pp' : b.unit
                            )}{' '}
                            · Z {formatSigned(b.zScore, 1, 'σ')}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2">
                        <CompactWindowStrip
                          windows={b.windows}
                          activeWindow={windowSize}
                          decimals={b.decimals}
                          suffix={b.unit === '%' ? '%' : ''}
                        />
                        <div className="w-20 shrink-0 space-y-1">
                          <DivergenceMeterBar
                            pctDelta={b.pctDelta}
                            zScore={b.zScore}
                            isPositive={isPos}
                          />
                          <div className="text-[10px] font-mono tabular-nums text-right text-slate-400">
                            {b.sampleGames} vs {b.baselineGames} PJ
                          </div>
                        </div>
                      </div>

                      <div className="text-xs leading-relaxed">
                        <p className="text-slate-300">
                          <span className="font-medium text-slate-100">
                            {experienceMode === 'simple'
                              ? b.headlineSimple
                              : b.headlineAdvanced}
                            :
                          </span>{' '}
                          <span className="text-slate-400">
                            {experienceMode === 'simple'
                              ? b.detailSimple
                              : b.secondaryLabel}
                          </span>
                        </p>
                        {b.activeStreakLabel && b.activeStreakCount > 0 && (
                          <p className="mt-1 text-[11px] font-mono tabular-nums text-orange-300">
                            Racha activa: {b.activeStreakCount} PJ ·{' '}
                            {b.activeStreakLabel}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (md+) */}
              <div className="hidden md:block overflow-auto max-h-[66vh]">
                <table className="w-full text-left border-collapse">
                  <thead className={STICKY_THEAD_CLASS}>
                    <tr className="border-b border-[#1E293B] text-xs text-slate-400">
                      <SortableTh
                        label="Seg."
                        align="left"
                        compact
                        active={breakoutSortField === 'watched'}
                        asc={breakoutSortAsc}
                        onSort={() => handleBreakoutSort('watched')}
                        className="py-3 pl-4 pr-2 w-10"
                      />
                      <SortableTh
                        label="Jugador"
                        align="left"
                        active={breakoutSortField === 'playerName'}
                        asc={breakoutSortAsc}
                        onSort={() => handleBreakoutSort('playerName')}
                        className="py-3 px-3"
                      />
                      <SortableTh
                        label="Eje y alerta de ruptura"
                        helpKey="trendBreakouts"
                        align="left"
                        active={breakoutSortField === 'axisAlert'}
                        asc={breakoutSortAsc}
                        onSort={() => handleBreakoutSort('axisAlert')}
                        className="py-3 px-3"
                      />
                      <SortableTh
                        label="Progresión Temp · 10P · 5P · 3P"
                        helpKey="multiWindowCompare"
                        align="left"
                        active={breakoutSortField === 'windowAvg'}
                        asc={breakoutSortAsc}
                        onSort={() => handleBreakoutSort('windowAvg')}
                        className="py-3 px-3"
                      />
                      <SortableTh
                        label={`Salto (Últ. ${windowSize} PJ)`}
                        helpKey="pctDelta"
                        align="right"
                        active={breakoutSortField === 'absDelta'}
                        asc={breakoutSortAsc}
                        onSort={() => handleBreakoutSort('absDelta')}
                        className="py-3 px-3"
                      />
                      <SortableTh
                        label={
                          experienceMode === 'simple'
                            ? 'Intensidad'
                            : 'Índice Ruptura'
                        }
                        helpKey="zScore"
                        align="right"
                        active={breakoutSortField === 'breakoutScore'}
                        asc={breakoutSortAsc}
                        onSort={() => handleBreakoutSort('breakoutScore')}
                        className="py-3 px-3"
                      />
                      <SortableTh
                        label={
                          experienceMode === 'simple'
                            ? 'Lectura clara y racha'
                            : 'Desglose técnico y sostenibilidad'
                        }
                        align="left"
                        active={breakoutSortField === 'streakRead'}
                        asc={breakoutSortAsc}
                        onSort={() => handleBreakoutSort('streakRead')}
                        className="py-3 pl-3 pr-4 min-w-[250px]"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] text-sm">
                    {filteredBreakouts.slice(0, 40).map((b) => {
                      const wKey = `player:${b.playerId}`;
                      const watched = watchlistIds.has(wKey);
                      const isPos = b.direction === 'positive';

                      return (
                        <tr
                          key={b.id}
                          onClick={() => onInspectEntity('player', b.playerId)}
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
                                  watched
                                    ? 'fill-orange-400 text-orange-400'
                                    : ''
                                }`}
                              />
                            </button>
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar
                                playerId={b.playerId}
                                name={b.playerName}
                                teamAbbr={b.teamAbbr}
                                showTeamBadge
                                size="sm"
                              />
                              <div>
                                <div className="font-medium text-slate-100 whitespace-nowrap">
                                  {b.playerName}
                                </div>
                                <div className="text-xs text-slate-400 whitespace-nowrap">
                                  {b.teamAbbr} · {b.position} · Base{' '}
                                  {b.baselineGames} PJ
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <span
                                className={`font-semibold text-xs ${
                                  isPos ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {isPos ? '▲' : '▼'} {b.badgeLabel}
                              </span>
                              <MetricInfoTooltip
                                helpKey={b.metricKey}
                                fallbackTitle={b.metricLabel}
                                align="left"
                                iconClassName="w-3 h-3"
                              />
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {b.axisLabel} · {b.metricLabel}
                            </div>
                          </td>

                          <td className="py-2.5 px-3">
                            <CompactWindowStrip
                              windows={b.windows}
                              activeWindow={windowSize}
                              decimals={b.decimals}
                              suffix={b.unit === '%' ? '%' : ''}
                            />
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <div
                              className={`font-semibold ${
                                isPos ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isPos ? '▲ ' : '▼ '}
                              {formatSigned(
                                b.absDelta,
                                b.decimals,
                                b.unit === '%' ? ' pp' : b.unit
                              )}
                            </div>
                            <div className="w-24 ml-auto mt-1">
                              <DivergenceMeterBar
                                pctDelta={b.pctDelta}
                                zScore={b.zScore}
                                isPositive={isPos}
                              />
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div
                              className={`font-mono tabular-nums font-semibold ${
                                b.severity === 'extreme'
                                  ? 'text-orange-400'
                                  : 'text-slate-100'
                              }`}
                            >
                              {experienceMode === 'simple'
                                ? b.severity === 'extreme'
                                  ? 'Ruptura fuerte'
                                  : b.severity === 'high'
                                  ? 'Cambio claro'
                                  : 'Giro notable'
                                : `${formatSigned(b.zScore, 2, 'σ')}`}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-400">
                              {formatSigned(b.pctDelta, 0, '%')} vs base
                            </div>
                          </td>

                          <td className="py-2.5 pl-3 pr-4 max-w-md">
                            <BreakdownDetailCell
                              entityName={`${b.playerName} (${b.teamAbbr})`}
                              badgeLabel={`${isPos ? '▲' : '▼'} ${b.badgeLabel} · ${b.metricLabel}`}
                              badgeTone={isPos ? 'positive' : 'negative'}
                              diagnosisLabel={b.sustainabilityLabel}
                              diagnosisTone={b.sustainabilityTone}
                              headline={
                                experienceMode === 'simple'
                                  ? b.headlineSimple
                                  : b.headlineAdvanced
                              }
                              detailText={
                                experienceMode === 'simple'
                                  ? b.detailSimple
                                  : b.detailAdvanced
                              }
                              secondaryText={b.secondaryLabel}
                              windowsSummary={`Temp ${b.windows.season.toFixed(
                                b.decimals
                              )}${b.unit === '%' ? '%' : ''} · 10P ${b.windows.l10.toFixed(
                                b.decimals
                              )}${b.unit === '%' ? '%' : ''} · 5P ${b.windows.l5.toFixed(
                                b.decimals
                              )}${b.unit === '%' ? '%' : ''} · 3P ${b.windows.l3.toFixed(
                                b.decimals
                              )}${b.unit === '%' ? '%' : ''}`}
                              streakText={
                                b.activeStreakLabel && b.activeStreakCount > 0
                                  ? `Racha activa: ${b.activeStreakCount} PJ · ${b.activeStreakLabel}`
                                  : null
                              }
                            >
                              {experienceMode === 'simple' ? (
                                <>
                                  <div className="text-xs font-medium text-slate-100 truncate">
                                    {b.headlineSimple}
                                  </div>
                                  <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                                    {b.detailSimple}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div
                                    className={`text-xs font-medium truncate ${
                                      b.sustainabilityTone === 'solid'
                                        ? 'text-emerald-400'
                                        : b.sustainabilityTone === 'warning'
                                        ? 'text-amber-400'
                                        : 'text-rose-400'
                                    }`}
                                  >
                                    {b.sustainabilityTone === 'warning'
                                      ? '◆ '
                                      : ''}
                                    {b.sustainabilityLabel}
                                  </div>
                                  <div className="text-xs font-mono tabular-nums text-slate-400 line-clamp-1 mt-0.5">
                                    {b.secondaryLabel}
                                  </div>
                                </>
                              )}
                              {b.activeStreakLabel && b.activeStreakCount > 0 && (
                                <div className="text-[11px] font-mono tabular-nums text-orange-300 mt-0.5 truncate">
                                  Racha activa: {b.activeStreakCount} PJ ·{' '}
                                  {b.activeStreakLabel}
                                </div>
                              )}
                            </BreakdownDetailCell>
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
      </section>

      {/* BLOCK 02: Player Anomalies */}
      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              {experienceMode === 'simple'
                ? '02. Jugadores que se Salen de su Media'
                : '02. Desviaciones Estadísticas en Jugadores (Básicas y Avanzadas)'}
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
              · {playerSignals.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
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

            <ExportImageButton
              disabled={playerSignals.length === 0}
              onBuildImage={async () => {
                const dateSlug = new Date().toISOString().slice(0, 10);
                const topRows = playerSignals.slice(0, 18);
                const filename = `radarnba-anomalias-jugadores-${dateSlug}.png`;
                return buildTableSnapshotBlob({
                  filename,
                  categoryTag: 'RADAR DE ANOMALÍAS · JUGADORES',
                  title: `Desviaciones Estadísticas en Jugadores (Últ. ${windowSize} PJ)`,
                  subtitle: `${playerSignals.length} anomalías detectadas frente a media base`,
                  entityColumnLabel: 'JUGADOR',
                  entityColumnWeight: 2.2,
                  columns: [
                    { key: 'metric', label: 'MÉTRICA', align: 'left', widthWeight: 1.5 },
                    { key: 'base', label: 'HABITUAL', align: 'right', widthWeight: 0.95 },
                    { key: 'win', label: `ÚLT. ${windowSize} PJ`, align: 'right', widthWeight: 1.0 },
                    { key: 'delta', label: 'VARIACIÓN', align: 'right', widthWeight: 1.1 },
                    { key: 'z', label: 'Z-SCORE', align: 'right', widthWeight: 0.95 },
                  ],
                  rows: topRows.map((sig, idx) => {
                    const pos = isAnomalyPositive(sig);
                    return {
                      rank: idx + 1,
                      teamAbbr: sig.teamAbbr,
                      entityName: sig.entityName,
                      entitySubtext: sig.subtitle,
                      cells: {
                        metric: {
                          text: plainMetricName(sig.metricKey, sig.metricLabel),
                          tone: pos ? 'positive' : 'negative',
                        },
                        base: { text: `${sig.baselineAvg.toFixed(1)}${sig.unit}` },
                        win: {
                          text: `${sig.windowAvg.toFixed(1)}${sig.unit}`,
                          tone: pos ? 'positive' : 'negative',
                        },
                        delta: {
                          text: `${formatSigned(sig.pctDelta, 1)}%`,
                          subtext: `${formatSigned(sig.absDelta, 1)}${sig.unit}`,
                          tone: pos ? 'positive' : 'negative',
                        },
                        z: { text: `${formatSigned(sig.zScore, 2)}σ`, tone: 'accent' },
                      },
                    };
                  }),
                  footerNote: `Mostrando top ${topRows.length} de ${playerSignals.length} desviaciones estadísticas`,
                });
              }}
            />
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          <AnomalyBlockTable
            rows={playerSignals}
            benchmarks={benchmarks}
            experienceMode={experienceMode}
            windowSize={windowSize}
            watchlistIds={watchlistIds}
            onToggleWatchlist={onToggleWatchlist}
            onInspectEntity={onInspectEntity}
            subjectColumnLabel="Jugador"
            emptyTitle="Sin cambios llamativos en jugadores para el filtro actual."
            emptySubtitle='Elige el modo rápido "Amplio (Ver más)" en la barra superior para detectar tendencias más suaves.'
            onResetThresholds={() => {
              setDirectionFilter('all');
              setPlayerCategoryFilter('all');
              setOnlyWithActiveStreak(false);
              setQuery('');
              onResetThresholds();
            }}
          />
        </div>
      </section>

      {/* BLOCK 03: Team Anomalies */}
      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              {experienceMode === 'simple'
                ? '03. Equipos con Cambios en Ataque o Defensa'
                : '03. Desviaciones en Equipos (Ratings por 100 Posesiones)'}
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
            benchmarks={benchmarks}
            experienceMode={experienceMode}
            windowSize={windowSize}
            watchlistIds={watchlistIds}
            onToggleWatchlist={onToggleWatchlist}
            onInspectEntity={onInspectEntity}
            subjectColumnLabel="Franquicia"
            emptyTitle="Sin cambios bruscos en equipos con el filtro actual."
            emptySubtitle='Prueba el botón rápido "Amplio (Ver más)" arriba o selecciona la muestra "Continuo" para contar con más partidos.'
            onResetThresholds={() => {
              setDirectionFilter('all');
              setTeamMetricFilter('all');
              setOnlyWithActiveStreak(false);
              setQuery('');
              onResetThresholds();
            }}
          />
        </div>
      </section>
    </div>
  );
}
