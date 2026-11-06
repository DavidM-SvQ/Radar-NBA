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
  Zap,
} from 'lucide-react';
import type {
  ActiveSection,
  AnomalySignal,
  ExperienceMode,
  PlayerSummary,
  StreakEntry,
  TeamSummary,
  TrendBreakoutAlert,
  TrendBreakoutAxis,
  WindowSize,
} from '../types/nba';
import { formatSigned, mean, round1 } from '../utils/analytics';
import {
  evaluateVsLeague,
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
  BreakdownDetailCell,
  MetricInfoTooltip,
  NbaComparisonBar,
  SortableTh,
} from './MetricUiHelpers';
import {
  STICKY_THEAD_CLASS,
  sortRows,
  useTableSort,
} from '../utils/tableSort';
import { EntityBadge, PlayerAvatar, TeamLogo } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import { buildTableSnapshotBlob } from '../utils/exportImageCard';

interface GuidedHomeViewProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
  anomalies: AnomalySignal[];
  trendBreakouts: TrendBreakoutAlert[];
  streaks: StreakEntry[];
  benchmarks: LeagueBenchmarks;
  windowSize: WindowSize;
  onChangeWindowSize: (w: WindowSize) => void;
  onOpenBreakoutAxis: (axis: 'all' | TrendBreakoutAxis) => void;
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
  trendBreakouts,
  streaks,
  benchmarks,
  windowSize,
  onChangeWindowSize,
  onOpenBreakoutAxis,
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

  const {
    sortKey: protSortKey,
    sortAsc: protSortAsc,
    toggleSort: toggleProtSort,
  } = useTableSort<
    'watched' | 'name' | 'zScore' | 'pctDelta' | 'vsNba' | 'headline'
  >('zScore', false, ['name', 'headline']);

  const {
    sortKey: teamSortKey,
    sortAsc: teamSortAsc,
    toggleSort: toggleTeamSort,
  } = useTableSort<'name' | 'recDiff' | 'vsNba'>(null, false, ['name']);

  const {
    sortKey: strSortKey,
    sortAsc: strSortAsc,
    toggleSort: toggleStrSort,
  } = useTableSort<'name' | 'count' | 'vsNba'>('count', false, ['name']);

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

  const scopedBreakouts = useMemo(() => {
    if (!onlyWatchlist) return trendBreakouts;
    return trendBreakouts.filter((b) =>
      watchlistIds.has(`player:${b.playerId}`)
    );
  }, [trendBreakouts, onlyWatchlist, watchlistIds]);

  const breakoutAxesSummary = useMemo(() => {
    const axesMeta: Array<{
      id: TrendBreakoutAxis;
      label: string;
      subtitle: string;
      helpKey: string;
    }> = [
      {
        id: 'exterior',
        label: 'Tiro Exterior',
        subtitle: 'Puntería de tres (3P%), triples anotados y volumen exterior',
        helpKey: 'breakoutExterior',
      },
      {
        id: 'minutes_usage',
        label: 'Minutos y Uso',
        subtitle: 'Expansión o recorte de rol en pista (MIN, USG% y tiros)',
        helpKey: 'breakoutMinutesUsage',
      },
      {
        id: 'efficiency',
        label: 'Eficiencia Real',
        subtitle: 'Conversión ponderada de tiro (TS%, eFG% y Game Score)',
        helpKey: 'breakoutEfficiency',
      },
    ];

    return axesMeta.map((meta) => {
      const items = scopedBreakouts.filter((b) => b.axis === meta.id);
      const posCount = items.filter((b) => b.direction === 'positive').length;
      const negCount = items.filter((b) => b.direction === 'negative').length;
      return {
        ...meta,
        totalCount: items.length,
        posCount,
        negCount,
        topAlert: items[0] || null,
      };
    });
  }, [scopedBreakouts]);

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
        protagonistRows: posDedup.slice(0, 15),
        posEntityCount: posDedup.length,
        negEntityCount: negDedup.length,
      };
    }

    if (protagonistDirection === 'negative') {
      return {
        protagonistRows: negDedup.slice(0, 15),
        posEntityCount: posDedup.length,
        negEntityCount: negDedup.length,
      };
    }

    // Balanced 'all' showcase: guarantee both positive surges and negative slumps appear across the top 15
    const picked = new Map<string, AnomalySignal>();
    const targetNeg = Math.min(7, negDedup.length);
    const targetPos = Math.min(8, posDedup.length);

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

    // Fill remaining up to 15 by highest |zScore|
    for (const s of byEntityType) {
      if (picked.size >= 15) break;
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

      {/* BLOCK 01: Alertas de Rupturas de Tendencia (Tiro Exterior, Minutos/Uso y Eficiencia) */}
      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100">
                01. Alertas de Rupturas de Tendencia (Últimos {windowSize} PJ vs Temporada)
              </h2>
              <MetricInfoTooltip helpKey="trendBreakouts" align="left" />
            </div>

            <button
              type="button"
              onClick={() => onOpenBreakoutAxis('all')}
              className="lg:hidden inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Ver ({scopedBreakouts.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2">
            <div className="inline-flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg">
              {([3, 5, 10] as WindowSize[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => onChangeWindowSize(w)}
                  className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    windowSize === w
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                  }`}
                >
                  Últ. {w} PJ
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onOpenBreakoutAxis('all')}
              className="hidden lg:inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0 ml-1"
            >
              <span>Ver todas las rupturas ({scopedBreakouts.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg divide-y md:divide-y-0 md:divide-x divide-[#1E293B]">
          {breakoutAxesSummary.map((axis) => {
            const top = axis.topAlert;
            const isPos = top?.direction === 'positive';
            const suffix = top?.unit === '%' ? '%' : '';
            return (
              <div
                key={axis.id}
                onClick={() => onOpenBreakoutAxis(axis.id)}
                className="p-4 hover:bg-[#182338] active:bg-[#182338] transition-colors cursor-pointer flex flex-col justify-between gap-3 group"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold text-slate-100 group-hover:text-orange-300 transition-colors truncate">
                        {axis.label}
                      </span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <MetricInfoTooltip helpKey={axis.helpKey} align="left" />
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-xs whitespace-nowrap shrink-0">
                      <span className="text-emerald-400 font-semibold">
                        ▲ {axis.posCount}
                      </span>
                      <span className="mx-1 text-slate-600">/</span>
                      <span className="text-rose-400 font-semibold">
                        ▼ {axis.negCount}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {axis.subtitle}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#1E293B]/80 space-y-2">
                  {top ? (
                    <>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectEntity('player', top.playerId);
                        }}
                        title="Abrir expediente completo del jugador"
                        className="flex items-center justify-between gap-2 rounded-md -mx-1.5 px-1.5 py-1 hover:bg-[#0B1120]/60 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <PlayerAvatar
                            playerId={top.playerId}
                            name={top.playerName}
                            teamAbbr={top.teamAbbr}
                            showTeamBadge
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-100 truncate">
                              {top.playerName}
                            </div>
                            <div className="text-xs truncate">
                              <span className="text-slate-400">
                                {top.teamAbbr}
                                {top.position ? ` · ${top.position}` : ''}
                                {' · '}
                              </span>
                              <span
                                className={
                                  isPos
                                    ? 'text-emerald-400 font-medium'
                                    : 'text-rose-400 font-medium'
                                }
                              >
                                {isPos ? '▲' : '▼'} {top.badgeLabel}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div className="text-sm font-semibold text-slate-100">
                            {top.windowAvg.toFixed(top.decimals)}
                            {suffix}{' '}
                            <span className="text-[11px] font-normal text-slate-400">
                              vs {top.baselineAvg.toFixed(top.decimals)}
                              {suffix}
                            </span>
                          </div>
                          <div
                            className={`text-xs font-semibold ${
                              isPos ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isPos ? '▲' : '▼'}{' '}
                            {formatSigned(
                              top.unit === '%' ? top.absDelta : top.pctDelta,
                              top.unit === '%' ? 1 : 0,
                              top.unit === '%' ? ' pt' : '%'
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-400 px-0.5">
                        <span className="truncate">
                          Temp {top.windows.season.toFixed(top.decimals)}
                          {suffix}
                          {' · '}
                          <span
                            className={
                              windowSize === 10
                                ? 'text-orange-300 font-semibold'
                                : ''
                            }
                          >
                            10P {top.windows.l10.toFixed(top.decimals)}
                            {suffix}
                          </span>
                          {' · '}
                          <span
                            className={
                              windowSize === 5
                                ? 'text-orange-300 font-semibold'
                                : ''
                            }
                          >
                            5P {top.windows.l5.toFixed(top.decimals)}
                            {suffix}
                          </span>
                          {' · '}
                          <span
                            className={
                              windowSize === 3
                                ? 'text-orange-300 font-semibold'
                                : ''
                            }
                          >
                            3P {top.windows.l3.toFixed(top.decimals)}
                            {suffix}
                          </span>
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 py-2">
                      Sin rupturas activas en este eje con el filtro actual.
                    </p>
                  )}
                </div>

                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400 group-hover:text-orange-300 whitespace-nowrap">
                  <span>
                    Explorar {axis.label.toLowerCase()} ({axis.totalCount})
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* BLOCK 02: Protagonistas del Día (Positive & Negative Statistical Anomalies for Players & Teams) */}
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
                02. Protagonistas del Día: Anomalías Estadísticas Positivas y Negativas
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

            <ExportImageButton
              disabled={protagonistRows.length === 0}
              onBuildImage={async () => {
                const dateSlug = new Date().toISOString().slice(0, 10);
                const filename = `radarnba-protagonistas-${dateSlug}.png`;
                return buildTableSnapshotBlob({
                  filename,
                  categoryTag: 'RESUMEN DEL DÍA · PROTAGONISTAS NBA',
                  title: `Top ${protagonistRows.length} Protagonistas del Día (Últ. ${windowSize} PJ)`,
                  subtitle: 'Anomalías estadísticas positivas y negativas más destacadas de la jornada',
                  entityColumnLabel: 'JUGADOR / EQUIPO',
                  entityColumnWeight: 2.25,
                  kpis: [
                    {
                      label: 'CASOS DESTACADOS',
                      value: `${protagonistRows.length}`,
                      sublabel: `De ${scopedAnomalies.length} señales totales`,
                      tone: 'accent',
                    },
                    {
                      label: 'EN RACHA (+) / BACHE (-)',
                      value: `${
                        protagonistRows.filter((s) => isAnomalyPositive(s)).length
                      } ↑ · ${
                        protagonistRows.filter((s) => !isAnomalyPositive(s)).length
                      } ↓`,
                      tone: 'positive',
                    },
                  ],
                  columns: [
                    { key: 'metric', label: 'ESTADÍSTICA', align: 'left', widthWeight: 1.5 },
                    { key: 'base', label: 'HABITUAL', align: 'right', widthWeight: 0.95 },
                    { key: 'win', label: `ÚLT. ${windowSize} PJ`, align: 'right', widthWeight: 1.0 },
                    { key: 'delta', label: 'DIFERENCIA', align: 'right', widthWeight: 1.1 },
                    { key: 'z', label: 'IMPACTO', align: 'right', widthWeight: 1.0 },
                  ],
                  rows: protagonistRows.map((sig, idx) => {
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
                          text: `${formatSigned(sig.pctDelta, 0)}%`,
                          subtext: `${formatSigned(sig.absDelta, 1)}${sig.unit}`,
                          tone: pos ? 'positive' : 'negative',
                        },
                        z: {
                          text: `${formatSigned(sig.zScore, 2)}σ`,
                          subtext: describeZScoreHuman(sig.zScore, pos).label,
                          tone: 'accent',
                        },
                      },
                    };
                  }),
                  footerNote: `Selección de los ${protagonistRows.length} casos más destacables sin recorte`,
                });
              }}
            />

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

              {/* Desktop Table (md+) — full 15 rows without vertical scroll */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className={STICKY_THEAD_CLASS}>
                    <tr className="text-xs text-slate-400">
                      <SortableTh
                        label="Seg."
                        active={protSortKey === 'watched'}
                        asc={protSortAsc}
                        onSort={() => toggleProtSort('watched')}
                        align="left"
                        className="py-3 pl-4 pr-2 w-12"
                        compact
                      />
                      <SortableTh
                        label="Jugador / Equipo"
                        active={protSortKey === 'name'}
                        asc={protSortAsc}
                        onSort={() => toggleProtSort('name')}
                        align="left"
                        className="py-3 px-3"
                      />
                      <SortableTh
                        label="Aspecto destacado"
                        helpKey="zScore"
                        active={protSortKey === 'zScore'}
                        asc={protSortAsc}
                        onSort={() => toggleProtSort('zScore')}
                        align="left"
                        className="py-3 px-3"
                      />
                      <SortableTh
                        label={`Últ. ${windowSize} vs Habitual`}
                        helpKey="windowAvg"
                        active={protSortKey === 'pctDelta'}
                        asc={protSortAsc}
                        onSort={() => toggleProtSort('pctDelta')}
                        align="right"
                        className="py-3 px-3"
                      />
                      <SortableTh
                        label="Estadística destacada vs Media NBA"
                        helpKey="vsLeagueBar"
                        active={protSortKey === 'vsNba'}
                        asc={protSortAsc}
                        onSort={() => toggleProtSort('vsNba')}
                        align="left"
                        className="py-3 px-3 min-w-[225px]"
                      />
                      <SortableTh
                        label="Lectura rápida"
                        active={protSortKey === 'headline'}
                        asc={protSortAsc}
                        onSort={() => toggleProtSort('headline')}
                        align="left"
                        className="py-3 pl-3 pr-4 min-w-[250px]"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] text-sm">
                    {sortRows(
                      protagonistRows,
                      (sig) => {
                        switch (protSortKey) {
                          case 'watched':
                            return watchlistIds.has(
                              `${sig.entityType}:${sig.entityId}`
                            );
                          case 'name':
                            return sig.entityName;
                          case 'pctDelta':
                            return Math.abs(sig.pctDelta);
                          case 'vsNba': {
                            const b = resolveSignalBenchmark(sig, benchmarks);
                            return evaluateVsLeague(b.value, b.benchmark).pct;
                          }
                          case 'headline':
                            return plainAnomalyExplanation(sig).headline;
                          case 'zScore':
                          default:
                            return Math.abs(sig.zScore);
                        }
                      },
                      protSortAsc
                    ).map((sig) => {
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
                            <BreakdownDetailCell
                              entityName={`${sig.entityName}${
                                sig.entityType === 'player'
                                  ? ` (${sig.teamAbbr})`
                                  : ''
                              }`}
                              badgeLabel={`${isUp ? '▲' : '▼'} ${
                                experienceMode === 'simple'
                                  ? plainMetricName(
                                      sig.metricKey,
                                      sig.metricLabel
                                    )
                                  : sig.metricLabel
                              } (${formatSigned(sig.pctDelta, 0, '%')})`}
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
                                sig.activeStreakLabel &&
                                (sig.activeStreakCount || 0) > 0
                                  ? `Racha activa: ${sig.activeStreakCount} PJ · ${sig.activeStreakLabel}`
                                  : null
                              }
                            >
                              <div className="text-xs font-medium text-slate-100 truncate">
                                {plainExp.headline}
                              </div>
                              <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                                {experienceMode === 'simple'
                                  ? plainExp.detail
                                  : sig.contextNote || plainExp.detail}
                              </div>
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

      {/* BLOCK 02: Collective Team Shifts & Active Statistical Streaks Side-by-Side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        {/* Left: Teams Collective Surges & Slumps */}
        <section className="space-y-3 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100">
                03. Equipos Destacados (Últimos {windowSize} PJ)
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
                <div className="hidden sm:block overflow-auto max-h-[56vh]">
                  <table className="w-full text-left border-collapse">
                    <thead className={STICKY_THEAD_CLASS}>
                      <tr className="text-xs text-slate-400">
                        <SortableTh
                          label="Franquicia y aspecto destacado"
                          active={teamSortKey === 'name'}
                          asc={teamSortAsc}
                          onSort={() => toggleTeamSort('name')}
                          align="left"
                          className="py-2.5 pl-4 pr-3"
                        />
                        <SortableTh
                          label={`Últ. ${windowSize} PJ`}
                          helpKey="differential"
                          active={teamSortKey === 'recDiff'}
                          asc={teamSortAsc}
                          onSort={() => toggleTeamSort('recDiff')}
                          align="right"
                          className="py-2.5 px-3"
                        />
                        <SortableTh
                          label="Aspecto destacado vs Media NBA"
                          helpKey="vsLeagueBar"
                          active={teamSortKey === 'vsNba'}
                          asc={teamSortAsc}
                          onSort={() => toggleTeamSort('vsNba')}
                          align="left"
                          className="py-2.5 pl-3 pr-4 min-w-[210px]"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B] text-sm">
                      {(!teamSortKey
                        ? featuredTeams
                        : sortRows(
                            featuredTeams,
                            (item) => {
                              switch (teamSortKey) {
                                case 'name':
                                  return item.team.name;
                                case 'recDiff':
                                  return item.recDiff;
                                case 'vsNba':
                                  return evaluateVsLeague(
                                    item.benchInfo.value,
                                    item.benchInfo.benchmark
                                  ).pct;
                              }
                            },
                            teamSortAsc
                          )
                      ).map(
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
                04. Rachas Estadísticas Activas Hoy
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
                <div className="hidden sm:block overflow-auto max-h-[56vh]">
                  <table className="w-full text-left border-collapse">
                    <thead className={STICKY_THEAD_CLASS}>
                      <tr className="text-xs text-slate-400">
                        <SortableTh
                          label="Protagonista y racha"
                          active={strSortKey === 'name'}
                          asc={strSortAsc}
                          onSort={() => toggleStrSort('name')}
                          align="left"
                          className="py-2.5 pl-4 pr-3"
                        />
                        <SortableTh
                          label="Racha"
                          helpKey="consecutiveStreak"
                          active={strSortKey === 'count'}
                          asc={strSortAsc}
                          onSort={() => toggleStrSort('count')}
                          align="right"
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="Media en racha vs Media NBA"
                          helpKey="vsLeagueBar"
                          active={strSortKey === 'vsNba'}
                          asc={strSortAsc}
                          onSort={() => toggleStrSort('vsNba')}
                          align="left"
                          className="py-2.5 pl-3 pr-4 min-w-[205px]"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B] text-sm">
                      {sortRows(
                        featuredStreaks,
                        (st) => {
                          switch (strSortKey) {
                            case 'name':
                              return st.entityName;
                            case 'vsNba': {
                              const b = resolveStreakBenchmark(st, benchmarks);
                              return evaluateVsLeague(b.value, b.benchmark).pct;
                            }
                            case 'count':
                            default:
                              return st.count;
                          }
                        },
                        strSortAsc
                      ).map((st) => {
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
            05. Profundiza en un Clic: Anomalías, Rachas, Jornadas y Duelos
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
