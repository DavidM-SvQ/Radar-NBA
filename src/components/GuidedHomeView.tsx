import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Compass,
  Flame,
  Shield,
  Star,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  ActiveSection,
  AnomalySignal,
  ExperienceMode,
  PlayerSummary,
  StreakEntry,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import { formatSigned, mean, round1 } from '../utils/analytics';
import {
  describeZScoreHuman,
  isAnomalyPositive,
  plainAnomalyExplanation,
  plainMetricName,
  resolveSignalBenchmark,
  resolveStreakBenchmark,
  type LeagueBenchmarks,
  type ResolvedStatBenchmark,
} from '../utils/humanize';
import {
  ColumnHelpHeader,
  MetricInfoTooltip,
  NbaComparisonBar,
} from './MetricUiHelpers';
import { EntityBadge, TeamLogo } from './NbaVisuals';

interface GuidedHomeViewProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
  anomalies: AnomalySignal[];
  streaks: StreakEntry[];
  benchmarks: LeagueBenchmarks;
  windowSize: WindowSize;
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onNavigateSection: (section: ActiveSection) => void;
}

export function GuidedHomeView({
  teams,
  anomalies,
  streaks,
  benchmarks,
  windowSize,
  experienceMode,
  watchlistIds,
  onlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  onNavigateSection,
}: GuidedHomeViewProps) {
  const [protagonistDirection, setProtagonistDirection] = useState<
    'all' | 'positive' | 'negative'
  >('all');
  const [protagonistEntity, setProtagonistEntity] = useState<
    'all' | 'player' | 'team'
  >('all');
  const [teamDirection, setTeamDirection] = useState<'positive' | 'negative'>(
    'positive'
  );
  const [streakDirection, setStreakDirection] = useState<
    'all' | 'positive' | 'negative'
  >('all');

  // Watchlist-filtered base pools
  const scopedAnomalies = useMemo(() => {
    if (!onlyWatchlist) return anomalies;
    return anomalies.filter((s) =>
      watchlistIds.has(`${s.entityType}:${s.entityId}`)
    );
  }, [anomalies, onlyWatchlist, watchlistIds]);

  const scopedStreaks = useMemo(() => {
    if (!onlyWatchlist) return streaks;
    return streaks.filter((s) =>
      watchlistIds.has(`${s.entityType}:${s.entityId}`)
    );
  }, [streaks, onlyWatchlist, watchlistIds]);

  // Global pulse counts & hero items for Row 1 KPI strip
  const radarPulse = useMemo(() => {
    const posSignals = scopedAnomalies.filter((s) => isAnomalyPositive(s));
    const negSignals = scopedAnomalies.filter((s) => !isAnomalyPositive(s));
    const posStreaks = scopedStreaks.filter((s) => s.isPositive);
    const negStreaks = scopedStreaks.filter((s) => !s.isPositive);

    return {
      posCount: posSignals.length,
      negCount: negSignals.length,
      topPositive: posSignals[0] || null,
      topNegative: negSignals[0] || null,
      posStreakCount: posStreaks.length,
      negStreakCount: negStreaks.length,
      topStreak: scopedStreaks[0] || null,
    };
  }, [scopedAnomalies, scopedStreaks]);

  // Block 01: Protagonistas del Día (Jugadores y Equipos · Positivas y Negativas)
  const { protagonistRows, posEntityCount, negEntityCount } = useMemo(() => {
    const byEntityType = scopedAnomalies.filter((s) =>
      protagonistEntity === 'all' ? true : s.entityType === protagonistEntity
    );

    const seenPos = new Set<string>();
    const seenNeg = new Set<string>();
    const posDedup: AnomalySignal[] = [];
    const negDedup: AnomalySignal[] = [];

    for (const sig of byEntityType) {
      const eKey = `${sig.entityType}:${sig.entityId}`;
      if (isAnomalyPositive(sig)) {
        if (!seenPos.has(eKey)) {
          seenPos.add(eKey);
          posDedup.push(sig);
        }
      } else {
        if (!seenNeg.has(eKey)) {
          seenNeg.add(eKey);
          negDedup.push(sig);
        }
      }
    }

    if (protagonistDirection === 'positive') {
      return {
        protagonistRows: posDedup.slice(0, 8),
        posEntityCount: posDedup.length,
        negEntityCount: negDedup.length,
      };
    }

    if (protagonistDirection === 'negative') {
      return {
        protagonistRows: negDedup.slice(0, 8),
        posEntityCount: posDedup.length,
        negEntityCount: negDedup.length,
      };
    }

    // Balanced 'all' showcase: guarantee both positive surges and negative slumps appear
    const picked = new Map<string, AnomalySignal>();
    const targetNeg = Math.min(3, negDedup.length);
    const targetPos = Math.min(4, posDedup.length);

    for (const s of posDedup.slice(0, targetPos)) {
      picked.set(`${s.entityType}:${s.entityId}`, s);
    }
    for (const s of negDedup) {
      if (picked.size >= targetPos + targetNeg) break;
      const eKey = `${s.entityType}:${s.entityId}`;
      if (!picked.has(eKey)) {
        picked.set(eKey, s);
      }
    }

    // Fill remaining up to 8 by highest |zScore|
    for (const s of byEntityType) {
      if (picked.size >= 8) break;
      const eKey = `${s.entityType}:${s.entityId}`;
      if (!picked.has(eKey)) {
        picked.set(eKey, s);
      }
    }

    const combined = Array.from(picked.values()).sort(
      (a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)
    );

    return {
      protagonistRows: combined,
      posEntityCount: posDedup.length,
      negEntityCount: negDedup.length,
    };
  }, [scopedAnomalies, protagonistDirection, protagonistEntity]);

  // Block 02 Left: Teams collective surges & slumps with matched metric benchmark
  const featuredTeams = useMemo(() => {
    const teamSignalsById = new Map<string, AnomalySignal>();
    for (const sig of scopedAnomalies) {
      if (sig.entityType !== 'team') continue;
      const sigPositive = isAnomalyPositive(sig);
      if (
        (teamDirection === 'positive' && !sigPositive) ||
        (teamDirection === 'negative' && sigPositive)
      ) {
        continue;
      }
      if (!teamSignalsById.has(sig.entityId)) {
        teamSignalsById.set(sig.entityId, sig);
      }
    }

    return teams
      .filter((t) => {
        if (onlyWatchlist && !watchlistIds.has(`team:${t.id}`)) return false;
        return t.games.length > 0;
      })
      .map((t) => {
        const slice = t.games.slice(0, Math.min(windowSize, t.games.length));
        const recWins = slice.filter((g) => g.result === 'W').length;
        const recDiff = round1(mean(slice.map((g) => g.differential)));
        const recNet = round1(mean(slice.map((g) => g.netRtg)));
        const matchingSig = teamSignalsById.get(t.id) || null;

        let aspectLabel: string;
        let helpKey: string;
        let benchInfo: ResolvedStatBenchmark;

        if (matchingSig) {
          aspectLabel =
            experienceMode === 'simple'
              ? plainMetricName(matchingSig.metricKey, matchingSig.metricLabel)
              : matchingSig.categoryLabel;
          helpKey = matchingSig.metricKey;
          benchInfo = resolveSignalBenchmark(matchingSig, benchmarks);
        } else if (experienceMode === 'advanced') {
          aspectLabel =
            recNet >= 0
              ? 'Dominio Neto reciente (NetRtg)'
              : 'Bache Neto reciente (NetRtg)';
          helpKey = 'netRtg';
          benchInfo = resolveSignalBenchmark(
            { entityType: 'team', metricKey: 'netRtg', windowAvg: recNet },
            benchmarks
          );
        } else {
          aspectLabel =
            recDiff >= 0
              ? 'Margen de puntos reciente'
              : 'Desventaja de puntos reciente';
          helpKey = 'differential';
          benchInfo = resolveSignalBenchmark(
            {
              entityType: 'team',
              metricKey: 'differential',
              windowAvg: recDiff,
            },
            benchmarks
          );
        }

        return {
          team: t,
          recWins,
          recGames: slice.length,
          recDiff,
          recNet,
          matchingSig,
          aspectLabel,
          helpKey,
          benchInfo,
        };
      })
      .sort((a, b) =>
        teamDirection === 'positive'
          ? b.recNet - a.recNet
          : a.recNet - b.recNet
      )
      .slice(0, 5);
  }, [
    teams,
    scopedAnomalies,
    teamDirection,
    windowSize,
    onlyWatchlist,
    watchlistIds,
    experienceMode,
    benchmarks,
  ]);

  // Block 02 Right: Active statistical streaks (Positive & Negative)
  const featuredStreaks = useMemo(() => {
    const pos = scopedStreaks.filter((s) => s.isPositive);
    const neg = scopedStreaks.filter((s) => !s.isPositive);

    if (streakDirection === 'positive') return pos.slice(0, 5);
    if (streakDirection === 'negative') return neg.slice(0, 5);

    const chosen: StreakEntry[] = [];
    const targetNeg = Math.min(2, neg.length);
    const targetPos = Math.min(5 - targetNeg, pos.length);

    chosen.push(...pos.slice(0, targetPos));
    chosen.push(...neg.slice(0, targetNeg));

    if (chosen.length < 5) {
      const usedIds = new Set(chosen.map((c) => c.id));
      for (const s of scopedStreaks) {
        if (chosen.length >= 5) break;
        if (!usedIds.has(s.id)) {
          chosen.push(s);
          usedIds.add(s.id);
        }
      }
    }

    return chosen.sort((a, b) => b.count - a.count);
  }, [scopedStreaks, streakDirection]);

  const topPosBench = radarPulse.topPositive
    ? resolveSignalBenchmark(radarPulse.topPositive, benchmarks)
    : null;
  const topNegBench = radarPulse.topNegative
    ? resolveSignalBenchmark(radarPulse.topNegative, benchmarks)
    : null;

  const guidedQuestions: Array<{
    question: string;
    answerDesc: string;
    ctaLabel: string;
    target: ActiveSection;
  }> = [
    {
      question: '¿Quién se está saliendo o hundiendo en toda la liga?',
      answerDesc:
        'Explora todas las anomalías positivas y negativas en puntos, rebotes, asistencias, uso, TS% y eficiencia de equipos.',
      ctaLabel: 'Abrir Radar de Anomalías',
      target: 'anomalies',
    },
    {
      question: '¿Qué rachas seguidas y jugadores más fiables hay?',
      answerDesc:
        'Detecta rachas activas o históricas a medida en 38 estadísticas y mide la regularidad de cada jugador.',
      ctaLabel: 'Explorar Rachas y Consistencia',
      target: 'streaks',
    },
    {
      question: '¿Qué pasó anoche sin mirar los 12 partidos?',
      answerDesc:
        'Radiografía de la jornada con quinteto ideal, explosiones de una noche, bajones y rachas rotas o extendidas.',
      ctaLabel: 'Analizar Jornada NBA',
      target: 'gameday',
    },
    {
      question: '¿Cómo rinde un tramo concreto o un duelo 1 contra 1?',
      answerDesc:
        'Enfrenta dos jugadores cara a cara con radar de 6 ejes o compara dos ventanas de partidos cualesquiera.',
      ctaLabel: 'Abrir Duelo Directo 1v1',
      target: 'duel',
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Row 1: 4-Column Pulse Strip — Positive Anomaly, Negative Anomaly, Active Streak & Global Radar Balance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        {/* KPI 1: Top Positive Anomaly */}
        <div
          onClick={() =>
            radarPulse.topPositive &&
            onInspectEntity(
              radarPulse.topPositive.entityType,
              radarPulse.topPositive.entityId
            )
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            radarPulse.topPositive
              ? 'hover:bg-[#182338] active:bg-[#182338] cursor-pointer'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Mayor explosión positiva</span>
            <MetricInfoTooltip
              helpKey={radarPulse.topPositive?.metricKey || 'zScore'}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {radarPulse.topPositive && (
              <EntityBadge
                entityType={radarPulse.topPositive.entityType}
                entityId={radarPulse.topPositive.entityId}
                name={radarPulse.topPositive.entityName}
                teamAbbr={radarPulse.topPositive.teamAbbr}
                showTeamBadge={radarPulse.topPositive.entityType === 'player'}
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {radarPulse.topPositive
                  ? radarPulse.topPositive.entityName
                  : '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
                {radarPulse.topPositive && topPosBench
                  ? `${radarPulse.topPositive.absDelta >= 0 ? '▲' : '▼'} ${formatSigned(
                      radarPulse.topPositive.pctDelta,
                      0,
                      '%'
                    )} · ${topPosBench.showValueLabel}`
                  : 'Sin subidas con filtro actual'}
              </p>
            </div>
          </div>
        </div>

        {/* KPI 2: Top Negative Anomaly */}
        <div
          onClick={() =>
            radarPulse.topNegative &&
            onInspectEntity(
              radarPulse.topNegative.entityType,
              radarPulse.topNegative.entityId
            )
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            radarPulse.topNegative
              ? 'hover:bg-[#182338] active:bg-[#182338] cursor-pointer'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Mayor bajón estadístico</span>
            <MetricInfoTooltip
              helpKey={radarPulse.topNegative?.metricKey || 'zScore'}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {radarPulse.topNegative && (
              <EntityBadge
                entityType={radarPulse.topNegative.entityType}
                entityId={radarPulse.topNegative.entityId}
                name={radarPulse.topNegative.entityName}
                teamAbbr={radarPulse.topNegative.teamAbbr}
                showTeamBadge={radarPulse.topNegative.entityType === 'player'}
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {radarPulse.topNegative
                  ? radarPulse.topNegative.entityName
                  : '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-rose-400 truncate">
                {radarPulse.topNegative && topNegBench
                  ? `${radarPulse.topNegative.absDelta >= 0 ? '▲' : '▼'} ${formatSigned(
                      radarPulse.topNegative.pctDelta,
                      0,
                      '%'
                    )} · ${topNegBench.showValueLabel}`
                  : 'Sin bajones con filtro actual'}
              </p>
            </div>
          </div>
        </div>

        {/* KPI 3: Longest Active Streak */}
        <div
          onClick={() =>
            radarPulse.topStreak &&
            onInspectEntity(
              radarPulse.topStreak.entityType,
              radarPulse.topStreak.entityId
            )
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            radarPulse.topStreak
              ? 'hover:bg-[#182338] active:bg-[#182338] cursor-pointer'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Mayor racha activa hoy</span>
            <MetricInfoTooltip helpKey="consecutiveStreak" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {radarPulse.topStreak && (
              <EntityBadge
                entityType={radarPulse.topStreak.entityType}
                entityId={radarPulse.topStreak.entityId}
                name={radarPulse.topStreak.entityName}
                teamAbbr={radarPulse.topStreak.teamAbbr}
                showTeamBadge={radarPulse.topStreak.entityType === 'player'}
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {radarPulse.topStreak ? radarPulse.topStreak.entityName : '—'}
              </p>
              <p
                className={`mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums truncate ${
                  radarPulse.topStreak && !radarPulse.topStreak.isPositive
                    ? 'text-rose-400'
                    : 'text-orange-400'
                }`}
              >
                {radarPulse.topStreak
                  ? `${radarPulse.topStreak.count} PJ · ${radarPulse.topStreak.thresholdLabel}`
                  : 'Sin rachas con filtro actual'}
              </p>
            </div>
          </div>
        </div>

        {/* KPI 4: Global Balance of Anomalies & Streaks */}
        <div
          onClick={() => onNavigateSection('anomalies')}
          className="p-3.5 sm:p-4 hover:bg-[#182338] active:bg-[#182338] cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Balance anomalías y rachas</span>
            <MetricInfoTooltip helpKey="pctDelta" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100 truncate">
            <span className="text-emerald-400">▲ {radarPulse.posCount}</span>
            <span className="mx-1.5 text-slate-600">/</span>
            <span className="text-rose-400">▼ {radarPulse.negCount}</span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 font-mono tabular-nums truncate">
            Rachas: {radarPulse.posStreakCount}▲ · {radarPulse.negStreakCount}▼
          </p>
        </div>
      </div>

      {/* BLOCK 01: Protagonistas del Día (Positive & Negative Statistical Anomalies for Players & Teams) */}
      <section className="space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {protagonistDirection === 'negative' ? (
                <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
              ) : protagonistDirection === 'positive' ? (
                <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Activity className="w-4 h-4 text-orange-400 shrink-0" />
              )}
              <h2 className="text-sm font-semibold text-slate-100">
                01. Protagonistas del Día: Anomalías Estadísticas Positivas y Negativas
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onNavigateSection('anomalies')}
              className="xl:hidden inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Radar ({scopedAnomalies.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2">
            {/* Positive / Negative Segmented Filter */}
            <div className="inline-flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
              <button
                type="button"
                onClick={() => setProtagonistDirection('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  protagonistDirection === 'all'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                }`}
              >
                Todas ({posEntityCount + negEntityCount})
              </button>
              <button
                type="button"
                onClick={() => setProtagonistDirection('positive')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  protagonistDirection === 'positive'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                }`}
              >
                ▲ Positivas ({posEntityCount})
              </button>
              <button
                type="button"
                onClick={() => setProtagonistDirection('negative')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  protagonistDirection === 'negative'
                    ? 'bg-rose-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                }`}
              >
                ▼ Negativas ({negEntityCount})
              </button>
            </div>

            {/* Entity Type Filter (All / Players / Teams) */}
            <div className="inline-flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg">
              {(
                [
                  { id: 'all', label: 'Jugadores y Equipos' },
                  { id: 'player', label: 'Jugadores' },
                  { id: 'team', label: 'Equipos' },
                ] as const
              ).map((opt) => {
                const active = protagonistEntity === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setProtagonistEntity(opt.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#1E293B] text-orange-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => onNavigateSection('anomalies')}
              className="hidden xl:inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0 ml-1"
            >
              <span>Ver radar completo ({scopedAnomalies.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden">
          {protagonistRows.length === 0 ? (
            <div className="py-10 px-6 text-center">
              <p className="text-sm font-medium text-slate-200">
                No hay anomalías destacadas con la combinación de filtros actual.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Prueba a mostrar "Todas" o elige la sensibilidad "Amplio (Ver más)" en la barra superior.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Cards (< md) */}
              <div className="md:hidden divide-y divide-[#1E293B]">
                {protagonistRows.map((sig) => {
                  const wKey = `${sig.entityType}:${sig.entityId}`;
                  const watched = watchlistIds.has(wKey);
                  const isGood = isAnomalyPositive(sig);
                  const isUp = sig.absDelta >= 0;
                  const humanMag = describeZScoreHuman(sig.zScore, isGood);
                  const plainExp = plainAnomalyExplanation(sig);
                  const benchInfo = resolveSignalBenchmark(sig, benchmarks);

                  return (
                    <div
                      key={sig.id}
                      onClick={() =>
                        onInspectEntity(sig.entityType, sig.entityId)
                      }
                      className="p-3.5 space-y-2.5 active:bg-[#182338] cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
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
                              {sig.entityType === 'team' ? 'Equipo · ' : ''}
                              {sig.subtitle}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Alternar seguimiento"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleWatchlist(wKey);
                          }}
                          className="min-w-[40px] min-h-[40px] -m-1.5 flex items-center justify-center rounded-lg text-slate-400 active:text-orange-400 shrink-0"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              watched ? 'fill-orange-400 text-orange-400' : ''
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-[#0B1120]/70 border border-[#1E293B] rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200">
                            <span className="truncate">
                              {experienceMode === 'simple'
                                ? plainMetricName(
                                    sig.metricKey,
                                    sig.metricLabel
                                  )
                                : sig.metricLabel}
                            </span>
                            <MetricInfoTooltip
                              helpKey={sig.metricKey}
                              fallbackTitle={sig.metricLabel}
                              align="left"
                            />
                          </div>
                          <div className={`text-[11px] ${humanMag.textClass}`}>
                            {humanMag.label}
                            {experienceMode === 'advanced'
                              ? ` · Z ${formatSigned(sig.zScore, 2, 'σ')}`
                              : ''}
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div className="text-sm font-semibold text-slate-100">
                            {sig.windowAvg.toFixed(1)}{' '}
                            <span className="text-[11px] font-normal text-slate-400">
                              (era {sig.baselineAvg.toFixed(1)})
                            </span>
                          </div>
                          <div
                            className={`text-xs font-semibold ${
                              isGood ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isUp ? '▲' : '▼'} {formatSigned(sig.pctDelta, 0, '%')}
                          </div>
                        </div>
                      </div>

                      <NbaComparisonBar
                        value={benchInfo.value}
                        benchmark={benchInfo.benchmark}
                        showValueLabel={benchInfo.showValueLabel}
                      />

                      <div className="text-xs leading-relaxed">
                        <span className="font-medium text-slate-100">
                          {plainExp.headline}
                        </span>
                        <span className="text-slate-400">
                          {' · '}
                          {experienceMode === 'simple'
                            ? plainExp.detail
                            : sig.contextNote || plainExp.detail}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                      <th className="py-3 pl-4 pr-2 w-10 font-medium">Seg.</th>
                      <th className="py-3 px-3 font-medium">
                        Jugador / Equipo
                      </th>
                      <th className="py-3 px-3 font-medium">
                        <ColumnHelpHeader
                          label="Aspecto destacado"
                          helpKey="zScore"
                          align="left"
                        />
                      </th>
                      <th className="py-3 px-3 font-medium text-right">
                        <ColumnHelpHeader
                          label={`Últ. ${windowSize} vs Habitual`}
                          helpKey="windowAvg"
                          align="right"
                        />
                      </th>
                      <th className="py-3 px-3 font-medium min-w-[225px]">
                        <ColumnHelpHeader
                          label="Estadística destacada vs Media NBA"
                          helpKey="vsLeagueBar"
                          align="left"
                        />
                      </th>
                      <th className="py-3 pl-3 pr-4 font-medium min-w-[250px]">
                        Lectura rápida
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] text-sm">
                    {protagonistRows.map((sig) => {
                      const wKey = `${sig.entityType}:${sig.entityId}`;
                      const watched = watchlistIds.has(wKey);
                      const isGood = isAnomalyPositive(sig);
                      const isUp = sig.absDelta >= 0;
                      const humanMag = describeZScoreHuman(sig.zScore, isGood);
                      const plainExp = plainAnomalyExplanation(sig);
                      const benchInfo = resolveSignalBenchmark(sig, benchmarks);

                      return (
                        <tr
                          key={sig.id}
                          onClick={() =>
                            onInspectEntity(sig.entityType, sig.entityId)
                          }
                          className="hover:bg-[#182338] cursor-pointer transition-colors"
                        >
                          <td
                            className="py-3 pl-4 pr-2"
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
                                  watched
                                    ? 'fill-orange-400 text-orange-400'
                                    : ''
                                }`}
                              />
                            </button>
                          </td>
                          <td className="py-3 px-3">
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
                                  {sig.entityType === 'team' ? 'Equipo · ' : ''}
                                  {sig.subtitle}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                              <span>
                                {experienceMode === 'simple'
                                  ? plainMetricName(
                                      sig.metricKey,
                                      sig.metricLabel
                                    )
                                  : sig.metricLabel}
                              </span>
                              <MetricInfoTooltip
                                helpKey={sig.metricKey}
                                fallbackTitle={sig.metricLabel}
                                align="left"
                              />
                            </div>
                            <div className={`text-xs ${humanMag.textClass}`}>
                              {humanMag.label}
                              {experienceMode === 'advanced'
                                ? ` · Z ${formatSigned(sig.zScore, 2, 'σ')}`
                                : ''}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <div className="font-semibold text-slate-100">
                              {sig.windowAvg.toFixed(1)}{' '}
                              <span className="text-xs font-normal text-slate-400">
                                (era {sig.baselineAvg.toFixed(1)})
                              </span>
                            </div>
                            <div
                              className={`text-xs font-medium ${
                                isGood ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isUp ? '▲' : '▼'}{' '}
                              {formatSigned(sig.pctDelta, 0, '%')}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <NbaComparisonBar
                              value={benchInfo.value}
                              benchmark={benchInfo.benchmark}
                              compact
                              showValueLabel={benchInfo.showValueLabel}
                            />
                          </td>
                          <td className="py-3 pl-3 pr-4 max-w-md">
                            <div className="text-xs font-medium text-slate-100">
                              {plainExp.headline}
                            </div>
                            <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                              {experienceMode === 'simple'
                                ? plainExp.detail
                                : sig.contextNote || plainExp.detail}
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
      </section>

      {/* BLOCK 02: Collective Team Shifts & Active Statistical Streaks Side-by-Side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        {/* Left: Teams Collective Surges & Slumps */}
        <section className="space-y-3 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100">
                02. Equipos Destacados (Últimos {windowSize} PJ)
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                <button
                  type="button"
                  onClick={() => setTeamDirection('positive')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    teamDirection === 'positive'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  ▲ Dominantes
                </button>
                <button
                  type="button"
                  onClick={() => setTeamDirection('negative')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    teamDirection === 'negative'
                      ? 'bg-rose-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  ▼ En bache
                </button>
              </div>

              <button
                type="button"
                onClick={() => onNavigateSection('teams')}
                className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
              >
                <span>30 equipos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden flex-1">
            {featuredTeams.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No hay equipos disponibles con el filtro de favoritos actual.
              </div>
            ) : (
              <>
                {/* Mobile Cards (< sm) */}
                <div className="sm:hidden divide-y divide-[#1E293B]">
                  {featuredTeams.map(
                    ({
                      team,
                      recWins,
                      recGames,
                      recDiff,
                      recNet,
                      aspectLabel,
                      helpKey,
                      benchInfo,
                    }) => (
                      <div
                        key={team.id}
                        onClick={() => onInspectEntity('team', team.id)}
                        className="p-3.5 space-y-2.5 active:bg-[#182338] cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TeamLogo
                              abbr={team.abbreviation}
                              teamId={team.id}
                              logoUrl={team.logoUrl}
                              size="sm"
                              framed
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-sm text-slate-100 truncate">
                                {team.name}
                              </div>
                              <div className="text-xs text-slate-400 truncate">
                                {team.wins}-{team.losses} ·{' '}
                                <span className="text-slate-300">
                                  {aspectLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums shrink-0">
                            <div
                              className={`text-sm font-semibold ${
                                recDiff >= 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {recWins}-{recGames - recWins} (
                              {formatSigned(recDiff)})
                            </div>
                            <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <span>
                                {experienceMode === 'advanced'
                                  ? `NetRtg ${formatSigned(recNet)}`
                                  : `Racha ${team.streakCode}`}
                              </span>
                              <MetricInfoTooltip
                                helpKey={helpKey}
                                align="right"
                                iconClassName="w-3 h-3"
                              />
                            </div>
                          </div>
                        </div>
                        <NbaComparisonBar
                          value={benchInfo.value}
                          benchmark={benchInfo.benchmark}
                          showValueLabel={benchInfo.showValueLabel}
                        />
                      </div>
                    )
                  )}
                </div>

                {/* Desktop/Tablet Table (sm+) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                        <th className="py-2.5 pl-4 pr-3 font-medium">
                          Franquicia y aspecto destacado
                        </th>
                        <th className="py-2.5 px-3 font-medium text-right">
                          <ColumnHelpHeader
                            label={`Últ. ${windowSize} PJ`}
                            helpKey="differential"
                          />
                        </th>
                        <th className="py-2.5 pl-3 pr-4 font-medium min-w-[210px]">
                          <ColumnHelpHeader
                            label="Aspecto destacado vs Media NBA"
                            helpKey="vsLeagueBar"
                            align="left"
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B] text-sm">
                      {featuredTeams.map(
                        ({
                          team,
                          recWins,
                          recGames,
                          recDiff,
                          recNet,
                          aspectLabel,
                          helpKey,
                          benchInfo,
                        }) => (
                          <tr
                            key={team.id}
                            onClick={() => onInspectEntity('team', team.id)}
                            className="hover:bg-[#182338] cursor-pointer transition-colors"
                          >
                            <td className="py-3 pl-4 pr-3">
                              <div className="flex items-center gap-2.5">
                                <TeamLogo
                                  abbr={team.abbreviation}
                                  teamId={team.id}
                                  logoUrl={team.logoUrl}
                                  size="sm"
                                  framed
                                />
                                <div>
                                  <div className="font-medium text-slate-100 whitespace-nowrap">
                                    {team.name}{' '}
                                    <span className="text-xs font-normal text-slate-400">
                                      ({team.wins}-{team.losses})
                                    </span>
                                  </div>
                                  <div className="inline-flex items-center gap-1 text-xs text-slate-300 whitespace-nowrap">
                                    <span>{aspectLabel}</span>
                                    <MetricInfoTooltip
                                      helpKey={helpKey}
                                      align="left"
                                      iconClassName="w-3 h-3"
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              <div
                                className={`font-semibold ${
                                  recDiff >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                {recWins}-{recGames - recWins} (
                                {formatSigned(recDiff)} PTS)
                              </div>
                              <div className="text-xs text-slate-400">
                                {experienceMode === 'advanced'
                                  ? `NetRtg ${formatSigned(recNet)}`
                                  : `Racha ${team.streakCode}`}
                              </div>
                            </td>
                            <td className="py-3 pl-3 pr-4">
                              <NbaComparisonBar
                                value={benchInfo.value}
                                benchmark={benchInfo.benchmark}
                                compact
                                showValueLabel={benchInfo.showValueLabel}
                              />
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Right: Active Statistical Streaks (Positive & Negative) */}
        <section className="space-y-3 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Flame className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                03. Rachas Estadísticas Activas Hoy
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                <button
                  type="button"
                  onClick={() => setStreakDirection('all')}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    streakDirection === 'all'
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setStreakDirection('positive')}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    streakDirection === 'positive'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  ▲ Positivas ({radarPulse.posStreakCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStreakDirection('negative')}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    streakDirection === 'negative'
                      ? 'bg-rose-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  ▼ Negativas ({radarPulse.negStreakCount})
                </button>
              </div>

              <button
                type="button"
                onClick={() => onNavigateSection('streaks')}
                className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Ver ({scopedStreaks.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden flex-1">
            {featuredStreaks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Sin rachas activas de este tipo con el corte actual de partidos seguidos.
              </div>
            ) : (
              <>
                {/* Mobile Cards (< sm) */}
                <div className="sm:hidden divide-y divide-[#1E293B]">
                  {featuredStreaks.map((st) => {
                    const stBench = resolveStreakBenchmark(st, benchmarks);
                    return (
                      <div
                        key={st.id}
                        onClick={() =>
                          onInspectEntity(st.entityType, st.entityId)
                        }
                        className="p-3.5 space-y-2.5 active:bg-[#182338] cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <EntityBadge
                              entityType={st.entityType}
                              entityId={st.entityId}
                              name={st.entityName}
                              teamAbbr={st.teamAbbr}
                              showTeamBadge={st.entityType === 'player'}
                              size="sm"
                            />
                            <div className="min-w-0 space-y-0.5">
                              <div className="font-semibold text-sm text-slate-100 truncate">
                                {st.entityName}
                              </div>
                              <div className="text-xs text-slate-400 truncate">
                                {st.subtitle}
                              </div>
                              <div
                                className={`inline-flex items-center gap-1.5 text-xs font-medium pt-0.5 ${
                                  st.isPositive
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                <span>
                                  {st.isPositive ? '▲' : '▼'}{' '}
                                  {st.thresholdLabel}
                                </span>
                                <MetricInfoTooltip
                                  helpKey="consecutiveStreak"
                                  align="left"
                                  iconClassName="w-3 h-3"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono tabular-nums text-sm font-bold text-orange-400">
                              {st.count} PJ
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-400">
                              Base {st.seasonBaseline.toFixed(1)}
                            </div>
                          </div>
                        </div>

                        <NbaComparisonBar
                          value={stBench.value}
                          benchmark={stBench.benchmark}
                          showValueLabel={stBench.showValueLabel}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Desktop/Tablet Table (sm+) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                        <th className="py-2.5 pl-4 pr-3 font-medium">
                          Protagonista y racha
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          <ColumnHelpHeader
                            label="Racha"
                            helpKey="consecutiveStreak"
                          />
                        </th>
                        <th className="py-2.5 pl-3 pr-4 font-medium min-w-[205px]">
                          <ColumnHelpHeader
                            label="Media en racha vs Media NBA"
                            helpKey="vsLeagueBar"
                            align="left"
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B] text-sm">
                      {featuredStreaks.map((st) => {
                        const stBench = resolveStreakBenchmark(st, benchmarks);
                        return (
                          <tr
                            key={st.id}
                            onClick={() =>
                              onInspectEntity(st.entityType, st.entityId)
                            }
                            className="hover:bg-[#182338] cursor-pointer transition-colors"
                          >
                            <td className="py-3 pl-4 pr-3">
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
                                  <div
                                    className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${
                                      st.isPositive
                                        ? 'text-emerald-400'
                                        : 'text-rose-400'
                                    }`}
                                  >
                                    <span>
                                      {st.isPositive ? '▲' : '▼'}{' '}
                                      {st.thresholdLabel}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                              <div className="font-semibold text-orange-400">
                                {st.count} PJ
                              </div>
                              <div className="text-xs text-slate-400">
                                Base {st.seasonBaseline.toFixed(1)}
                              </div>
                            </td>
                            <td className="py-3 pl-3 pr-4">
                              <NbaComparisonBar
                                value={stBench.value}
                                benchmark={stBench.benchmark}
                                compact
                                showValueLabel={stBench.showValueLabel}
                              />
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
      </div>

      {/* BLOCK 03: Guided Exploration by Core Analytical Questions */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-orange-400 shrink-0" />
          <h2 className="text-sm font-semibold text-slate-100">
            04. Profundiza en un Clic: Anomalías, Rachas, Jornadas y Duelos
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y md:divide-y-0 md:divide-x divide-[#1E293B]">
          {guidedQuestions.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onNavigateSection(item.target)}
              className="p-4 text-left hover:bg-[#182338] transition-colors flex flex-col justify-between gap-3 group"
            >
              <div>
                <p className="text-sm font-semibold text-slate-100 group-hover:text-orange-300 transition-colors">
                  {item.question}
                </p>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  {item.answerDesc}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400 whitespace-nowrap">
                <span>{item.ctaLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
