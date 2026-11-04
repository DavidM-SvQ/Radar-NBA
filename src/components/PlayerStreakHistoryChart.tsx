import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  ChevronDown,
  LineChart,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { PlayerGameLog, PlayerSummary } from '../types/nba';
import { formatShortDate, formatSigned, mean, normalizeSearchText } from '../utils/analytics';
import {
  evalThresholdOp,
  formatMetricNumber,
  getOperatorSymbol,
  isRulePositive,
  STREAK_METRIC_GROUPS,
  STREAK_METRIC_OPTIONS,
} from '../utils/streakMetricsCatalog';
import type {
  StreakChartPreloadRequest,
  StreakMetricGroup,
  StreakMetricOption,
  ThresholdOperator,
} from '../utils/streakMetricsCatalog';
import { MetricInfoTooltip } from './MetricUiHelpers';
import { PlayerAvatar } from './NbaVisuals';

interface PlayerStreakHistoryChartProps {
  players: PlayerSummary[];
  players2027?: PlayerSummary[];
  players2026?: PlayerSummary[];
  selectedPlayerId: string | null;
  onSelectPlayerId: (playerId: string) => void;
  onInspectPlayer: (playerId: string) => void;
  preloadRequest?: StreakChartPreloadRequest | null;
  onCloseInline?: () => void;
}

type ScaleMode = 'auto' | 'raw' | 'normalized';
type SpanPreset = 'last_n' | 'current_season' | 'two_seasons' | 'custom_brush';
type RefLineMode = 'threshold' | 'season_avg' | 'none';

interface MetricThresholdRule {
  operator: ThresholdOperator;
  threshold: number;
  customQualifies?: (g: PlayerGameLog) => boolean;
  customQualifiesLabel?: string;
}

const DISTINCT_SERIES_PALETTE = [
  '#F97316', // Orange
  '#38BDF8', // Sky
  '#A78BFA', // Violet
  '#22D3EE', // Cyan
  '#FBBF24', // Amber
];

const QUICK_METRIC_PRESETS: Array<{ label: string; ids: string[] }> = [
  { label: 'PTS · REB · AST', ids: ['points', 'rebounds', 'assists'] },
  { label: 'Impacto (PTS · PRA · GmSc)', ids: ['points', 'pra', 'gameScore'] },
  { label: 'Eficiencia (TS% · eFG% · 3P%)', ids: ['tsPct', 'efgPct', 'fg3Pct'] },
  { label: 'Rol (MIN · USG% · TCI)', ids: ['minutes', 'usgEst', 'fga'] },
  { label: 'Defensa (ROB · TAP · DR)', ids: ['steals', 'blocks', 'dreb'] },
];

function getGameKey(g: PlayerGameLog): string {
  return g.eventId || `${g.date}_${g.opponentAbbr}`;
}

function formatChartVal(
  val: number,
  m: StreakMetricOption,
  forceDecimals?: number,
  includeUnit = true
): string {
  const dec = forceDecimals ?? m.decimals;
  const prefix = m.id === 'plusMinus' && val > 0 ? '+' : '';
  const unitSuffix = includeUnit ? (m.unit === '%' ? '%' : m.unit) : '';
  return `${prefix}${val.toFixed(dec)}${unitSuffix}`;
}

function evalQualifiedAverage(
  games: PlayerGameLog[],
  metric: StreakMetricOption
): number | null {
  if (games.length === 0) return null;
  const qualified = metric.qualifies ? games.filter(metric.qualifies) : games;
  const sample = qualified.length > 0 ? qualified : games;
  return sample.length > 0 ? mean(sample.map((g) => metric.getValue(g))) : null;
}

export function PlayerStreakHistoryChart({
  players,
  players2027,
  players2026,
  selectedPlayerId,
  onSelectPlayerId,
  onInspectPlayer,
  preloadRequest,
  onCloseInline,
}: PlayerStreakHistoryChartProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [metricFilterText, setMetricFilterText] = useState('');

  // Categorized 49-metric selector (max 3 active simultaneously)
  const [selectedCategory, setSelectedCategory] =
    useState<StreakMetricGroup>('basic_counting');
  const [activeMetricIds, setActiveMetricIds] = useState<string[]>(['points']);
  const [metricRules, setMetricRules] = useState<
    Record<string, MetricThresholdRule>
  >(() => {
    const initial: Record<string, MetricThresholdRule> = {};
    for (const m of STREAK_METRIC_OPTIONS) {
      initial[m.id] = {
        operator: m.defaultOperator ?? 'gte',
        threshold: m.defaultThreshold,
      };
    }
    return initial;
  });

  // Span & Zoom controls (default: Últimos 10 partidos)
  const [spanPreset, setSpanPreset] = useState<SpanPreset>('last_n');
  const [lastNGames, setLastNGames] = useState<number>(10);
  const [brushRange, setBrushRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 9,
  });

  const [scaleMode, setScaleMode] = useState<ScaleMode>('auto');
  const [refLineMode, setRefLineMode] = useState<RefLineMode>('threshold');
  const [hoveredGameIndex, setHoveredGameIndex] = useState<number | null>(null);

  const brushTrackRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    mode: 'move' | 'left' | 'right';
    startClientX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);

  const players2027Map = useMemo(() => {
    const map = new Map<string, PlayerSummary>();
    if (players2027) {
      for (const p of players2027) map.set(p.id, p);
    }
    return map;
  }, [players2027]);

  const players2026Map = useMemo(() => {
    const map = new Map<string, PlayerSummary>();
    if (players2026) {
      for (const p of players2026) map.set(p.id, p);
    }
    return map;
  }, [players2026]);

  // Unified player catalog across active slice + both reference seasons
  const unifiedPlayers = useMemo(() => {
    const map = new Map<string, PlayerSummary>();
    for (const p of players) map.set(p.id, p);
    if (players2027) {
      for (const p of players2027) {
        if (!map.has(p.id)) map.set(p.id, p);
      }
    }
    if (players2026) {
      for (const p of players2026) {
        if (!map.has(p.id)) map.set(p.id, p);
      }
    }
    return Array.from(map.values());
  }, [players, players2027, players2026]);

  const activePlayer = useMemo(() => {
    if (selectedPlayerId) {
      const found = unifiedPlayers.find((p) => p.id === selectedPlayerId);
      if (found) return found;
    }
    return (
      unifiedPlayers.find((p) => p.games.length >= 3) ||
      unifiedPlayers[0] ||
      null
    );
  }, [unifiedPlayers, selectedPlayerId]);

  // Apply preload request when user clicks the chart icon on a table row
  useEffect(() => {
    if (!preloadRequest || preloadRequest.metrics.length === 0) return;
    const validMetrics = preloadRequest.metrics
      .filter((r) => STREAK_METRIC_OPTIONS.some((m) => m.id === r.metricId))
      .slice(0, 3);
    if (validMetrics.length === 0) return;

    const nextIds = Array.from(new Set(validMetrics.map((r) => r.metricId)));
    setActiveMetricIds(nextIds);

    setMetricRules((prev) => {
      const next = { ...prev };
      for (const r of validMetrics) {
        next[r.metricId] = {
          operator: r.operator,
          threshold: r.threshold,
          customQualifies: r.customQualifies,
          customQualifiesLabel: r.customQualifiesLabel,
        };
      }
      return next;
    });

    const primaryDef = STREAK_METRIC_OPTIONS.find(
      (m) => m.id === validMetrics[0].metricId
    );
    if (primaryDef) {
      setSelectedCategory(primaryDef.group);
    }
  }, [preloadRequest?.nonce]);

  // Full 2-season deduplicated games ordered oldest (left) -> newest (right)
  const { allChronoGames, allNewestFirstGames, games2027, games2026 } =
    useMemo(() => {
      if (!activePlayer) {
        return {
          allChronoGames: [] as PlayerGameLog[],
          allNewestFirstGames: [] as PlayerGameLog[],
          games2027: [] as PlayerGameLog[],
          games2026: [] as PlayerGameLog[],
        };
      }

      const byKey = new Map<string, PlayerGameLog>();
      const p26 = players2026Map.get(activePlayer.id);
      const p27 = players2027Map.get(activePlayer.id);

      if (p26) {
        for (const g of p26.games) {
          byKey.set(getGameKey(g), {
            ...g,
            seasonLabel: g.seasonLabel || '2025-26',
          });
        }
      }
      if (p27) {
        for (const g of p27.games) {
          byKey.set(getGameKey(g), {
            ...g,
            seasonLabel: g.seasonLabel || '2026-27',
          });
        }
      }
      for (const g of activePlayer.games) {
        const key = getGameKey(g);
        if (!byKey.has(key)) {
          byKey.set(key, g);
        }
      }

      const chrono = Array.from(byKey.values()).sort((a, b) => {
        const tA = new Date(a.date).getTime();
        const tB = new Date(b.date).getTime();
        if (!Number.isNaN(tA) && !Number.isNaN(tB) && tA !== tB) {
          return tA - tB;
        }
        if (a.seasonLabel !== b.seasonLabel) {
          return a.seasonLabel.localeCompare(b.seasonLabel);
        }
        return a.date.localeCompare(b.date);
      });

      const newestFirst = [...chrono].reverse();
      const g27 = chrono.filter((g) => g.seasonLabel === '2026-27');
      const g26 = chrono.filter((g) => g.seasonLabel === '2025-26');

      return {
        allChronoGames: chrono,
        allNewestFirstGames: newestFirst,
        games2027: g27,
        games2026: g26,
      };
    }, [activePlayer, players2026Map, players2027Map]);

  const totalGames = allChronoGames.length;

  // Keep brushRange synchronized with spanPreset & player changes
  useEffect(() => {
    setHoveredGameIndex(null);
    if (totalGames === 0) {
      setBrushRange({ start: 0, end: 0 });
      return;
    }
    if (spanPreset === 'two_seasons') {
      setBrushRange({ start: 0, end: totalGames - 1 });
      return;
    }
    if (spanPreset === 'current_season') {
      const first27 = allChronoGames.findIndex(
        (g) => g.seasonLabel === '2026-27'
      );
      setBrushRange({
        start: first27 >= 0 ? first27 : 0,
        end: totalGames - 1,
      });
      return;
    }
    if (spanPreset === 'last_n') {
      const count = Math.max(1, Math.min(totalGames, lastNGames));
      setBrushRange({
        start: Math.max(0, totalGames - count),
        end: totalGames - 1,
      });
      return;
    }
    // custom_brush when switching players: reset cleanly to lastNGames
    const fallbackCount = Math.max(1, Math.min(totalGames, lastNGames));
    setSpanPreset('last_n');
    setBrushRange({
      start: Math.max(0, totalGames - fallbackCount),
      end: totalGames - 1,
    });
  }, [activePlayer?.id, totalGames]);

  const applyLastNPreset = (n: number) => {
    const clamped = Math.max(1, Math.min(Math.max(1, totalGames), n));
    setLastNGames(clamped);
    setSpanPreset('last_n');
    setHoveredGameIndex(null);
    if (totalGames > 0) {
      setBrushRange({
        start: Math.max(0, totalGames - clamped),
        end: totalGames - 1,
      });
    }
  };

  const applyCurrentSeasonPreset = () => {
    setSpanPreset('current_season');
    setHoveredGameIndex(null);
    if (totalGames > 0) {
      const first27 = allChronoGames.findIndex(
        (g) => g.seasonLabel === '2026-27'
      );
      const start = first27 >= 0 ? first27 : 0;
      setBrushRange({ start, end: totalGames - 1 });
      setLastNGames(totalGames - start);
    }
  };

  const applyTwoSeasonsPreset = () => {
    setSpanPreset('two_seasons');
    setHoveredGameIndex(null);
    if (totalGames > 0) {
      setBrushRange({ start: 0, end: totalGames - 1 });
      setLastNGames(totalGames);
    }
  };

  const safeStart =
    totalGames > 0
      ? Math.max(0, Math.min(totalGames - 1, brushRange.start))
      : 0;
  const safeEnd =
    totalGames > 0
      ? Math.max(safeStart, Math.min(totalGames - 1, brushRange.end))
      : 0;

  const visibleGames = useMemo(() => {
    if (totalGames === 0) return [];
    return allChronoGames.slice(safeStart, safeEnd + 1);
  }, [allChronoGames, safeStart, safeEnd, totalGames]);

  // Index in allChronoGames where 2026-27 starts (for mini-timeline separator)
  const globalSeasonSplitIdx = useMemo(() => {
    for (let i = 1; i < allChronoGames.length; i++) {
      if (
        allChronoGames[i - 1].seasonLabel === '2025-26' &&
        allChronoGames[i].seasonLabel === '2026-27'
      ) {
        return i;
      }
    }
    return -1;
  }, [allChronoGames]);

  // Index in visibleGames where 2026-27 starts (for main SVG vertical separator)
  const visibleSeasonSplitIdx = useMemo(() => {
    for (let i = 1; i < visibleGames.length; i++) {
      if (
        visibleGames[i - 1].seasonLabel === '2025-26' &&
        visibleGames[i].seasonLabel === '2026-27'
      ) {
        return i;
      }
    }
    return -1;
  }, [visibleGames]);

  const filteredPickerPlayers = useMemo(() => {
    const q = normalizeSearchText(searchText);
    const base = unifiedPlayers.filter((p) => {
      const p27 = players2027Map.get(p.id);
      const p26 = players2026Map.get(p.id);
      return (
        p.games.length > 0 ||
        (p27 && p27.games.length > 0) ||
        (p26 && p26.games.length > 0)
      );
    });
    if (!q) return base.slice(0, 28);
    return base
      .filter((p) =>
        normalizeSearchText(
          `${p.name} ${p.teamAbbr} ${p.teamName} ${p.position}`
        ).includes(q)
      )
      .slice(0, 28);
  }, [unifiedPlayers, players2027Map, players2026Map, searchText]);

  // Active metrics (strictly 1 to 3) with guaranteed distinct polyline colors
  const activeMetricsWithColor = useMemo(() => {
    const chosen = activeMetricIds
      .map((id) => STREAK_METRIC_OPTIONS.find((m) => m.id === id))
      .filter((m): m is StreakMetricOption => Boolean(m))
      .slice(0, 3);
    const list = chosen.length > 0 ? chosen : [STREAK_METRIC_OPTIONS[0]];

    const usedColors = new Set<string>();
    return list.map((metric, idx) => {
      let color = metric.strokeHex;
      if (usedColors.has(color)) {
        color =
          DISTINCT_SERIES_PALETTE.find((c) => !usedColors.has(c)) ||
          DISTINCT_SERIES_PALETTE[idx % DISTINCT_SERIES_PALETTE.length];
      }
      usedColors.add(color);
      return { metric, seriesColor: color };
    });
  }, [activeMetricIds]);

  const categoryMetrics = useMemo(() => {
    const q = normalizeSearchText(metricFilterText);
    if (q) {
      return STREAK_METRIC_OPTIONS.filter((m) =>
        normalizeSearchText(`${m.shortLabel} ${m.label}`).includes(q)
      );
    }
    return STREAK_METRIC_OPTIONS.filter((m) => m.group === selectedCategory);
  }, [selectedCategory, metricFilterText]);

  // Evaluate active streak (from latest game backwards), current/prev season means, and span means
  const evaluatedIndicators = useMemo(() => {
    return activeMetricsWithColor.map(({ metric, seriesColor }) => {
      const rule = metricRules[metric.id] || {
        operator: metric.defaultOperator ?? 'gte',
        threshold: metric.defaultThreshold,
      };
      const isPositive = isRulePositive(metric, rule.operator);

      const activeStreakGameKeys = new Set<string>();
      const activeStreakVals: number[] = [];

      for (const g of allNewestFirstGames) {
        const qualFn = rule.customQualifies ?? metric.qualifies;
        const passesQual = qualFn ? qualFn(g) : true;
        const val = metric.getValue(g);
        if (passesQual && evalThresholdOp(val, rule.operator, rule.threshold)) {
          activeStreakGameKeys.add(getGameKey(g));
          activeStreakVals.push(val);
        } else {
          break;
        }
      }

      const streakCount = activeStreakVals.length;
      const streakAvg = streakCount > 0 ? mean(activeStreakVals) : null;

      const currentSeasonAvg = evalQualifiedAverage(games2027, metric);
      const prevSeasonAvg = evalQualifiedAverage(games2026, metric);
      const fallbackAllAvg = evalQualifiedAverage(allChronoGames, metric) ?? 0;
      const spanAvg = evalQualifiedAverage(visibleGames, metric);

      return {
        metric,
        seriesColor,
        rule,
        isPositive,
        activeStreakGameKeys,
        streakCount,
        streakAvg,
        currentSeasonAvg,
        prevSeasonAvg,
        fallbackAllAvg,
        spanAvg,
      };
    });
  }, [
    activeMetricsWithColor,
    metricRules,
    allNewestFirstGames,
    games2027,
    games2026,
    allChronoGames,
    visibleGames,
  ]);

  // Decide Raw vs Normalized 0-100% scale when combining up to 3 metrics
  const effectiveNormalized = useMemo(() => {
    if (scaleMode === 'normalized') return true;
    if (scaleMode === 'raw') return false;
    if (evaluatedIndicators.length <= 1) return false;

    const metrics = evaluatedIndicators.map((x) => x.metric);
    const hasPct = metrics.some((m) => m.isPercentage);
    const hasSmall = metrics.some((m) => m.isSmallCount);
    const hasHigh = metrics.some((m) => !m.isPercentage && !m.isSmallCount);

    if (hasPct && hasSmall) return true;
    if (
      hasPct &&
      metrics.some(
        (m) => m.id === 'points' || m.id === 'pra' || m.id === 'praPer36'
      )
    ) {
      return true;
    }
    if (hasSmall && hasHigh) return true;
    return false;
  }, [scaleMode, evaluatedIndicators]);

  // SVG Coordinate Geometry (viewBox 880 x 280)
  const SVG_W = 880;
  const SVG_H = 280;
  const PAD_L = 50;
  const PAD_R = 24;
  const PAD_T = 32;
  const PAD_B = 46;
  const PLOT_W = SVG_W - PAD_L - PAD_R;
  const PLOT_H = SVG_H - PAD_T - PAD_B;

  const chartSeriesData = useMemo(() => {
    if (visibleGames.length === 0) {
      return {
        rawMin: 0,
        rawMax: 40,
        yTicks: [0, 10, 20, 30, 40],
        series: [] as Array<{
          indicator: (typeof evaluatedIndicators)[number];
          points: Array<{
            x: number;
            y: number;
            rawVal: number;
            normPct: number;
            isStreak: boolean;
          }>;
          polylinePoints: string;
          maxIdx: number;
          minIdx: number;
          maxVal: number;
          minVal: number;
          mMin: number;
          mSpan: number;
        }>,
      };
    }

    let globalMin = Infinity;
    let globalMax = -Infinity;

    const rawMatrix = evaluatedIndicators.map((ind) => {
      const vals = visibleGames.map((g) => ind.metric.getValue(g));
      for (const v of vals) {
        if (v < globalMin) globalMin = v;
        if (v > globalMax) globalMax = v;
      }
      return { indicator: ind, vals };
    });

    if (!Number.isFinite(globalMin)) globalMin = 0;
    if (!Number.isFinite(globalMax)) globalMax = 10;

    // Include reference line value in raw Y-domain so threshold/season avg stays visible
    if (!effectiveNormalized && refLineMode !== 'none') {
      for (const ind of evaluatedIndicators) {
        const refVal =
          refLineMode === 'threshold'
            ? ind.rule.threshold
            : ind.currentSeasonAvg ?? ind.fallbackAllAvg;
        if (Number.isFinite(refVal)) {
          if (refVal < globalMin) globalMin = refVal;
          if (refVal > globalMax) globalMax = refVal;
        }
      }
    }

    const allowNeg =
      evaluatedIndicators.some((ind) => ind.metric.allowNegative) &&
      globalMin < 0;
    const rawMin = effectiveNormalized
      ? 0
      : allowNeg
      ? Math.floor(globalMin - 2)
      : 0;
    const rawMax = effectiveNormalized
      ? 100
      : Math.max(
          rawMin + (globalMax <= 3 ? 2 : 4),
          Math.ceil(globalMax * 1.14 * 10) / 10
        );

    const span = Math.max(0.5, rawMax - rawMin);
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const v = rawMin + span * t;
      return span <= 4 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10;
    });

    const nGames = visibleGames.length;
    const xAt = (idx: number) =>
      nGames === 1
        ? PAD_L + PLOT_W / 2
        : PAD_L + (idx / (nGames - 1)) * PLOT_W;

    const series = rawMatrix.map(({ indicator, vals }) => {
      const mMin = indicator.metric.allowNegative ? Math.min(0, ...vals) : 0;
      const mMax = Math.max(mMin + 0.5, ...vals);
      const mSpan = Math.max(0.5, mMax - mMin);

      let maxIdx = 0;
      let minIdx = 0;
      vals.forEach((v, idx) => {
        if (v >= vals[maxIdx]) maxIdx = idx;
        if (v <= vals[minIdx]) minIdx = idx;
      });

      const pts = vals.map((rawVal, idx) => {
        const normPct = ((rawVal - mMin) / mSpan) * 100;
        const plotVal = effectiveNormalized ? normPct : rawVal;
        const ratio = (plotVal - rawMin) / span;
        const clampedRatio = Math.max(0, Math.min(1, ratio));
        const x = xAt(idx);
        const y = PAD_T + PLOT_H - clampedRatio * PLOT_H;
        const isStreak = indicator.activeStreakGameKeys.has(
          getGameKey(visibleGames[idx])
        );
        return { x, y, rawVal, normPct, isStreak };
      });

      return {
        indicator,
        points: pts,
        polylinePoints: pts
          .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
          .join(' '),
        maxIdx,
        minIdx,
        maxVal: vals[maxIdx] ?? 0,
        minVal: vals[minIdx] ?? 0,
        mMin,
        mSpan,
      };
    });

    return { rawMin, rawMax, yTicks, series };
  }, [
    visibleGames,
    evaluatedIndicators,
    effectiveNormalized,
    refLineMode,
    PLOT_H,
    PLOT_W,
  ]);

  // Mini-sparkline polyline for the 2-season draggable zoom scrubber
  const miniBrushPolyline = useMemo(() => {
    if (allChronoGames.length < 2 || evaluatedIndicators.length === 0) return '';
    const primary = evaluatedIndicators[0].metric;
    const vals = allChronoGames.map((g) => primary.getValue(g));
    const minV = Math.min(...vals);
    const maxV = Math.max(minV + 0.5, ...vals);
    const spanV = maxV - minV;
    const W = 800;
    const H = 28;
    return vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * W;
        const y = H - 3 - ((v - minV) / spanV) * (H - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [allChronoGames, evaluatedIndicators]);

  const toggleMetric = (id: string) => {
    setActiveMetricIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least 1 metric selected
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 3) return prev; // Enforce max 3 simultaneously
      return [...prev, id];
    });
  };

  const applyMetricPreset = (ids: string[]) => {
    const valid = ids
      .filter((id) => STREAK_METRIC_OPTIONS.some((m) => m.id === id))
      .slice(0, 3);
    if (valid.length > 0) {
      setActiveMetricIds(valid);
      const firstDef = STREAK_METRIC_OPTIONS.find((m) => m.id === valid[0]);
      if (firstDef) setSelectedCategory(firstDef.group);
    }
  };

  const updateRuleOperator = (metricId: string, op: ThresholdOperator) => {
    setMetricRules((prev) => {
      const cur = prev[metricId] || { operator: 'gte', threshold: 10 };
      return {
        ...prev,
        [metricId]: {
          ...cur,
          operator: op,
          customQualifies: undefined,
          customQualifiesLabel: undefined,
        },
      };
    });
  };

  const updateRuleThreshold = (metricId: string, rawVal: number) => {
    if (!Number.isFinite(rawVal)) return;
    setMetricRules((prev) => {
      const cur = prev[metricId] || { operator: 'gte', threshold: 10 };
      return {
        ...prev,
        [metricId]: {
          ...cur,
          threshold: rawVal,
          customQualifies: undefined,
          customQualifiesLabel: undefined,
        },
      };
    });
  };

  // Pointer drag handlers for the 2-season zoom brush
  const handleBrushPointerDown = (
    e: ReactPointerEvent<HTMLElement>,
    mode: 'move' | 'left' | 'right'
  ) => {
    e.stopPropagation();
    if (totalGames <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      mode,
      startClientX: e.clientX,
      initialStart: safeStart,
      initialEnd: safeEnd,
    };
  };

  const handleBrushPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    const track = brushTrackRef.current;
    if (!drag || !track || totalGames <= 1) return;

    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;

    const deltaPx = e.clientX - drag.startClientX;
    const deltaGames = Math.round((deltaPx / rect.width) * (totalGames - 1));
    const minWin = Math.min(1, totalGames - 1);

    if (drag.mode === 'move') {
      const winLen = drag.initialEnd - drag.initialStart;
      const nextStart = Math.max(
        0,
        Math.min(totalGames - 1 - winLen, drag.initialStart + deltaGames)
      );
      const nextEnd = nextStart + winLen;
      setSpanPreset('custom_brush');
      setBrushRange({ start: nextStart, end: nextEnd });
      setLastNGames(nextEnd - nextStart + 1);
    } else if (drag.mode === 'left') {
      const nextStart = Math.max(
        0,
        Math.min(drag.initialEnd - minWin, drag.initialStart + deltaGames)
      );
      setSpanPreset('custom_brush');
      setBrushRange({ start: nextStart, end: drag.initialEnd });
      setLastNGames(drag.initialEnd - nextStart + 1);
    } else if (drag.mode === 'right') {
      const nextEnd = Math.min(
        totalGames - 1,
        Math.max(drag.initialStart + minWin, drag.initialEnd + deltaGames)
      );
      setSpanPreset('custom_brush');
      setBrushRange({ start: drag.initialStart, end: nextEnd });
      setLastNGames(nextEnd - drag.initialStart + 1);
    }
    setHoveredGameIndex(null);
  };

  const handleBrushPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragStateRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture already released
      }
      dragStateRef.current = null;
    }
  };

  const handleBrushTrackClick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current || totalGames <= 1) return;
    const track = brushTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clickRatio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width)
    );
    const centerIdx = Math.round(clickRatio * (totalGames - 1));
    const winLen = Math.max(2, safeEnd - safeStart);
    const half = Math.floor(winLen / 2);
    const nextStart = Math.max(
      0,
      Math.min(totalGames - 1 - winLen, centerIdx - half)
    );
    const nextEnd = Math.min(totalGames - 1, nextStart + winLen);
    setSpanPreset('custom_brush');
    setBrushRange({ start: nextStart, end: nextEnd });
    setLastNGames(nextEnd - nextStart + 1);
    setHoveredGameIndex(null);
  };

  const inspectedIdx =
    hoveredGameIndex !== null && hoveredGameIndex < visibleGames.length
      ? hoveredGameIndex
      : visibleGames.length > 0
      ? visibleGames.length - 1
      : null;

  const inspectedGame =
    inspectedIdx !== null ? visibleGames[inspectedIdx] : null;

  if (!activePlayer) {
    return null;
  }

  const nVisible = visibleGames.length;
  const xLabelStep = Math.max(1, Math.ceil(nVisible / 10));
  const brushLeftPct =
    totalGames > 1 ? (safeStart / (totalGames - 1)) * 100 : 0;
  const brushRightPct =
    totalGames > 1 ? (safeEnd / (totalGames - 1)) * 100 : 100;
  const brushWidthPct = Math.max(2, brushRightPct - brushLeftPct);

  return (
    <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
      {/* Row 1: Header + Player Selector + Scale & Reference Line Controls */}
      <div className="px-4 py-3.5 border-b border-[#1E293B] bg-[#0F172A]/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4 text-orange-400 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-100 whitespace-nowrap">
              Historial de Rachas
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            · {visibleGames.length} PJ en pantalla (Total 2 temp:{' '}
            {allChronoGames.length} PJ · {games2026.length} en 25-26 ·{' '}
            {games2027.length} en 26-27)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Searchable Player Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="min-h-[34px] inline-flex items-center gap-2.5 px-3 py-1.5 bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/50 rounded-lg text-xs text-slate-100 transition-colors"
            >
              <PlayerAvatar
                playerId={activePlayer.id}
                name={activePlayer.name}
                teamAbbr={activePlayer.teamAbbr}
                size="xs"
              />
              <span className="font-semibold whitespace-nowrap">
                {activePlayer.name}
              </span>
              <span className="font-mono text-slate-400 whitespace-nowrap">
                {activePlayer.teamAbbr} · {activePlayer.position}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {pickerOpen && (
              <div className="absolute right-0 mt-1.5 w-80 max-w-[90vw] bg-[#0F172A] border border-[#1E293B] rounded-lg shadow-2xl z-30 p-2.5 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Buscar jugador NBA..."
                    autoFocus
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-[#1E293B]/60">
                  {filteredPickerPlayers.map((p) => {
                    const selected = p.id === activePlayer.id;
                    const c27 = players2027Map.get(p.id)?.games.length ?? 0;
                    const c26 = players2026Map.get(p.id)?.games.length ?? 0;
                    const tot = c27 + c26 > 0 ? c27 + c26 : p.games.length;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectPlayerId(p.id);
                          setPickerOpen(false);
                          setSearchText('');
                        }}
                        className={`w-full px-2.5 py-2 flex items-center justify-between gap-2 text-left text-xs rounded transition-colors ${
                          selected
                            ? 'bg-orange-500/15 text-orange-300 font-semibold'
                            : 'text-slate-200 hover:bg-[#182338]'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <PlayerAvatar
                            playerId={p.id}
                            name={p.name}
                            teamAbbr={p.teamAbbr}
                            size="xs"
                          />
                          <span className="truncate">{p.name}</span>
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 shrink-0">
                          {p.teamAbbr} · {tot} PJ
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onInspectPlayer(activePlayer.id)}
            className="min-h-[34px] px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Ficha completa →
          </button>

          {/* Horizontal Reference Line Selector */}
          <div className="flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
            {(
              [
                { id: 'threshold', label: 'Línea Umbral' },
                { id: 'season_avg', label: 'Línea Media' },
                { id: 'none', label: 'Sin línea' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRefLineMode(opt.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  refLineMode === opt.id
                    ? 'bg-[#1E293B] text-orange-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Scale Switcher */}
          <div className="flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
            {(
              [
                { id: 'auto', label: 'Escala Auto' },
                { id: 'raw', label: 'Real' },
                { id: 'normalized', label: 'Relativa %' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScaleMode(opt.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  scaleMode === opt.id
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {onCloseInline && (
            <button
              type="button"
              onClick={onCloseInline}
              title="Ocultar gráfico"
              aria-label="Ocultar gráfico"
              className="p-1.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Games Played Filter (Últimos X PJ, default 10 + Temp. Actual + 2 Temporadas + Slider) */}
      <div className="px-4 py-2.5 border-b border-[#1E293B] bg-[#0B1120]/60 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-300 mr-1">
            Partidos jugados:
          </span>
          {[5, 10, 15, 25].map((n) => {
            const isSelected = spanPreset === 'last_n' && lastNGames === n;
            const disabled = totalGames === 0;
            return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => applyLastNPreset(n)}
                className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-orange-500 border-orange-500 text-slate-950 font-semibold'
                    : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                }`}
              >
                Últ. {n} PJ
              </button>
            );
          })}
          <button
            type="button"
            onClick={applyCurrentSeasonPreset}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
              spanPreset === 'current_season'
                ? 'bg-orange-500 border-orange-500 text-slate-950 font-semibold'
                : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
            }`}
          >
            Temp. actual ({games2027.length})
          </button>
          <button
            type="button"
            onClick={applyTwoSeasonsPreset}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
              spanPreset === 'two_seasons'
                ? 'bg-orange-500 border-orange-500 text-slate-950 font-semibold'
                : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
            }`}
          >
            2 Temporadas ({allChronoGames.length})
          </button>
        </div>

        {totalGames > 1 && (
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              Últimos X PJ:
            </span>
            <input
              type="range"
              min={Math.min(2, totalGames)}
              max={totalGames}
              step={1}
              value={Math.min(totalGames, Math.max(1, lastNGames))}
              onChange={(e) => applyLastNPreset(Number(e.target.value))}
              className="w-32 sm:w-44 accent-orange-500 cursor-pointer"
            />
            <input
              type="number"
              min={1}
              max={totalGames}
              value={lastNGames}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) applyLastNPreset(v);
              }}
              className="w-16 px-2 py-1 text-xs font-mono tabular-nums text-right bg-[#0B1120] border border-[#1E293B] rounded-md text-orange-400 font-semibold focus:outline-none focus:border-orange-500"
            />
            <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
              / {totalGames} PJ
            </span>
          </div>
        )}
      </div>

      {/* Row 3: Categorized All-49-Metrics Selector (Max 3 Simultaneously) + Editable Streak Thresholds */}
      <div className="px-4 py-3 border-b border-[#1E293B] bg-[#0B1120]/35 space-y-3">
        {/* Active Selection Status + Quick Presets */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-300 mr-1">
              Activas ({activeMetricIds.length}/3 máx.):
            </span>
            {evaluatedIndicators.map(({ metric, seriesColor }) => (
              <button
                key={metric.id}
                type="button"
                onClick={() => toggleMetric(metric.id)}
                title={
                  activeMetricIds.length > 1
                    ? `Quitar ${metric.shortLabel}`
                    : 'Debe haber al menos 1 métrica activa'
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#182338] border border-slate-600 text-xs font-mono font-semibold text-white hover:border-orange-400 transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: seriesColor }}
                />
                <span>{metric.shortLabel}</span>
                {activeMetricIds.length > 1 && (
                  <X className="w-3 h-3 text-slate-400 hover:text-white" />
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 mr-0.5">
              Combinaciones rápidas:
            </span>
            {QUICK_METRIC_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyMetricPreset(preset.ids)}
                className="px-2 py-1 text-[11px] font-medium rounded bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600 transition-colors whitespace-nowrap"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5 Homogeneous Categories + Metric Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pt-1 border-t border-[#1E293B]/60">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
            {STREAK_METRIC_GROUPS.map((grp) => {
              const countInGrp = STREAK_METRIC_OPTIONS.filter(
                (m) => m.group === grp.id
              ).length;
              const activeInGrp = STREAK_METRIC_OPTIONS.filter(
                (m) => m.group === grp.id && activeMetricIds.includes(m.id)
              ).length;
              const isSelected =
                !metricFilterText && selectedCategory === grp.id;
              return (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(grp.id);
                    setMetricFilterText('');
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 border ${
                    isSelected
                      ? 'bg-[#182338] border-orange-500/50 text-orange-300 font-semibold'
                      : 'bg-[#0B1120] border-[#1E293B] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>
                    {grp.compactLabel} ({countInGrp})
                  </span>
                  {activeInGrp > 0 && (
                    <span className="ml-1.5 font-mono text-[11px] text-orange-400">
                      · {activeInGrp} act.
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-56 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={metricFilterText}
              onChange={(e) => setMetricFilterText(e.target.value)}
              placeholder={`Filtrar ${STREAK_METRIC_OPTIONS.length} métricas...`}
              className="w-full pl-8 pr-6 py-1 text-xs bg-[#0B1120] border border-[#1E293B] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
            />
            {metricFilterText && (
              <button
                type="button"
                onClick={() => setMetricFilterText('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Metric Chips for Selected Category */}
        <div className="flex flex-wrap items-center gap-1.5">
          {categoryMetrics.map((m) => {
            const activeEntry = activeMetricsWithColor.find(
              (x) => x.metric.id === m.id
            );
            const isActive = Boolean(activeEntry);
            const limitReached = !isActive && activeMetricIds.length >= 3;
            return (
              <button
                key={m.id}
                type="button"
                disabled={limitReached}
                title={
                  limitReached
                    ? 'Máximo 3 métricas simultáneas. Desmarca una activa para añadir otra.'
                    : m.label
                }
                onClick={() => toggleMetric(m.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors whitespace-nowrap shrink-0 border ${
                  isActive
                    ? 'bg-[#182338] border-slate-500 text-white font-semibold'
                    : limitReached
                    ? 'bg-[#0B1120]/50 border-[#1E293B]/60 text-slate-600 cursor-not-allowed'
                    : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: activeEntry
                      ? activeEntry.seriesColor
                      : m.strokeHex,
                  }}
                />
                <span>{m.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Editable Threshold Rule per Selected Metric */}
        <div className="pt-2 border-t border-[#1E293B]/60 grid grid-cols-1 lg:grid-cols-3 gap-2">
          {evaluatedIndicators.map(
            ({
              metric,
              seriesColor,
              rule,
              isPositive,
              streakCount,
              currentSeasonAvg,
            }) => {
              const stepVal = metric.step || 1;
              return (
                <div
                  key={metric.id}
                  className="px-3 py-2 rounded-lg bg-[#0B1120] border border-[#1E293B] flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="inline-flex items-center gap-1.5 min-w-0">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: seriesColor }}
                    />
                    <span className="font-mono font-semibold text-slate-100">
                      Umbral {metric.shortLabel}
                    </span>
                    <MetricInfoTooltip
                      helpKey={metric.helpKey}
                      align="left"
                      iconClassName="w-3 h-3"
                    />
                    <span
                      className={`font-mono text-[11px] ${
                        streakCount > 0
                          ? isPositive
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      ({streakCount} PJ act.)
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-1.5">
                    <div className="inline-flex items-center p-0.5 bg-[#131C2E] border border-[#1E293B] rounded">
                      {(
                        [
                          { id: 'gt', label: '>' },
                          { id: 'gte', label: '≥' },
                          { id: 'lte', label: '≤' },
                          { id: 'lt', label: '<' },
                        ] as const
                      ).map((opBtn) => (
                        <button
                          key={opBtn.id}
                          type="button"
                          onClick={() => updateRuleOperator(metric.id, opBtn.id)}
                          className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors ${
                            rule.operator === opBtn.id
                              ? 'bg-orange-500 text-slate-950 font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {opBtn.label}
                        </button>
                      ))}
                    </div>

                    <input
                      type="number"
                      step={stepVal}
                      value={rule.threshold}
                      onChange={(e) =>
                        updateRuleThreshold(metric.id, parseFloat(e.target.value))
                      }
                      className="w-16 px-2 py-0.5 text-xs font-mono tabular-nums text-right bg-[#131C2E] border border-[#1E293B] rounded text-slate-100 focus:outline-none focus:border-orange-500"
                    />

                    {currentSeasonAvg !== null && (
                      <button
                        type="button"
                        title="Fijar umbral en la media de la temporada actual (2026-27)"
                        onClick={() =>
                          updateRuleThreshold(
                            metric.id,
                            Number(currentSeasonAvg.toFixed(metric.decimals))
                          )
                        }
                        className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-[#131C2E] border border-[#1E293B] text-slate-300 hover:text-orange-300 hover:border-orange-500/40 transition-colors whitespace-nowrap"
                      >
                        = Media
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>

        {effectiveNormalized && (
          <p className="text-[11px] text-slate-400">
            Escala normalizada (0–100% sobre el rango del tramo) activa para comparar métricas de distinta magnitud sin que una línea quede aplastada. Puedes cambiar a &ldquo;Real&rdquo; arriba en cualquier momento.
          </p>
        )}
      </div>

      {/* Row 4: Main SVG Line Chart + Draggable 2-Season Zoom Brush + Inspected Game Panel */}
      {visibleGames.length === 0 ? (
        <div className="py-12 px-6 text-center text-xs text-slate-400">
          Este jugador aún no registra partidos disputados en el corte actual.
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            {/* SVG Canvas + Draggable Zoom Scrubber (8 cols on xl) */}
            <div className="xl:col-span-8 bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 flex flex-col justify-between space-y-2.5">
              {/* Visual Legend */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 px-1">
                <div className="flex flex-wrap items-center gap-3">
                  {evaluatedIndicators.map(({ metric, seriesColor }) => (
                    <span
                      key={metric.id}
                      className="inline-flex items-center gap-1.5 font-mono text-slate-200"
                    >
                      <span
                        className="w-3 h-0.5 rounded shrink-0"
                        style={{ backgroundColor: seriesColor }}
                      />
                      <span>{metric.shortLabel}</span>
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30 shrink-0" />
                    <span>Punto racha activa (+)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/30 shrink-0" />
                    <span>Punto racha activa (−)</span>
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {visibleSeasonSplitIdx > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-amber-300 font-mono">
                      <span className="w-2.5 border-t border-dashed border-amber-400" />
                      <span>Cambio 25-26 | 26-27</span>
                    </span>
                  )}
                  <span className="font-mono text-slate-400">
                    ▲ Máx · ▼ Mín tramo
                  </span>
                </div>
              </div>

              <svg
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                className="w-full h-60 sm:h-68 select-none overflow-visible"
                role="img"
                aria-label={`Historial de rachas (${visibleGames.length} partidos) de ${activePlayer.name}`}
                onMouseLeave={() => setHoveredGameIndex(null)}
              >
                {/* Horizontal Grid Lines & Y-Axis Labels */}
                {chartSeriesData.yTicks.map((tick, idx) => {
                  const span = Math.max(
                    0.5,
                    chartSeriesData.rawMax - chartSeriesData.rawMin
                  );
                  const y =
                    PAD_T +
                    PLOT_H -
                    ((tick - chartSeriesData.rawMin) / span) * PLOT_H;
                  return (
                    <g key={idx}>
                      <line
                        x1={PAD_L}
                        y1={y}
                        x2={SVG_W - PAD_R}
                        y2={y}
                        stroke="#1E293B"
                        strokeWidth="1"
                        strokeDasharray={idx === 0 ? undefined : '3 3'}
                      />
                      <text
                        x={PAD_L - 8}
                        y={y + 4}
                        textAnchor="end"
                        fill="#64748B"
                        fontSize="11"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {effectiveNormalized ? `${Math.round(tick)}%` : tick}
                      </text>
                    </g>
                  );
                })}

                {/* Single-season context watermark when divider is outside current zoom */}
                {visibleSeasonSplitIdx <= 0 && visibleGames[0] && (
                  <text
                    x={PAD_L + 6}
                    y={PAD_T - 12}
                    textAnchor="start"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    Temporada {visibleGames[0].seasonLabel}
                  </text>
                )}

                {/* Vertical Dashed Season Divider Line (2025-26 | 2026-27) */}
                {visibleSeasonSplitIdx > 0 &&
                  chartSeriesData.series[0] &&
                  (() => {
                    const pts = chartSeriesData.series[0].points;
                    const leftPt = pts[visibleSeasonSplitIdx - 1];
                    const rightPt = pts[visibleSeasonSplitIdx];
                    if (!leftPt || !rightPt) return null;
                    const divX = (leftPt.x + rightPt.x) / 2;
                    return (
                      <g>
                        <line
                          x1={divX}
                          y1={PAD_T - 10}
                          x2={divX}
                          y2={PAD_T + PLOT_H + 8}
                          stroke="#F59E0B"
                          strokeWidth="1.6"
                          strokeDasharray="5 4"
                          strokeOpacity="0.85"
                        />
                        <text
                          x={divX - 6}
                          y={PAD_T - 12}
                          textAnchor="end"
                          fill="#FBBF24"
                          fontSize="10"
                          fontWeight="600"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          ← 2025-26
                        </text>
                        <text
                          x={divX + 6}
                          y={PAD_T - 12}
                          textAnchor="start"
                          fill="#34D399"
                          fontSize="10"
                          fontWeight="600"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          2026-27 →
                        </text>
                      </g>
                    );
                  })()}

                {/* Horizontal Reference Line(s) (Threshold or Current Season Average) */}
                {refLineMode !== 'none' &&
                  chartSeriesData.series.map(
                    ({ indicator, mMin, mSpan }, sIdx) => {
                      // In normalized mode only draw primary metric reference to keep axis clean
                      if (effectiveNormalized && sIdx > 0) return null;
                      const rawRef =
                        refLineMode === 'threshold'
                          ? indicator.rule.threshold
                          : indicator.currentSeasonAvg ??
                            indicator.fallbackAllAvg;
                      if (!Number.isFinite(rawRef)) return null;

                      const plotVal = effectiveNormalized
                        ? ((rawRef - mMin) / mSpan) * 100
                        : rawRef;
                      const span = Math.max(
                        0.5,
                        chartSeriesData.rawMax - chartSeriesData.rawMin
                      );
                      const yRef =
                        PAD_T +
                        PLOT_H -
                        ((plotVal - chartSeriesData.rawMin) / span) * PLOT_H;
                      if (yRef < PAD_T - 2 || yRef > PAD_T + PLOT_H + 2) {
                        return null;
                      }

                      const labelPrefix =
                        refLineMode === 'threshold'
                          ? `Umbral ${indicator.metric.shortLabel} ${getOperatorSymbol(
                              indicator.rule.operator
                            )}`
                          : `Media 26-27 ${indicator.metric.shortLabel}:`;

                      return (
                        <g key={`ref-${indicator.metric.id}`}>
                          <line
                            x1={PAD_L}
                            y1={yRef}
                            x2={SVG_W - PAD_R}
                            y2={yRef}
                            stroke={indicator.seriesColor}
                            strokeOpacity="0.55"
                            strokeWidth="1.4"
                            strokeDasharray="6 4"
                          />
                          {sIdx === 0 && (
                            <text
                              x={SVG_W - PAD_R - 4}
                              y={Math.max(PAD_T + 10, yRef - 5)}
                              textAnchor="end"
                              fill="#CBD5E1"
                              fontSize="10"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {labelPrefix}{' '}
                              {formatChartVal(
                                rawRef,
                                indicator.metric,
                                indicator.metric.step < 1 ? 1 : 0
                              )}
                            </text>
                          )}
                        </g>
                      );
                    }
                  )}

                {/* Vertical Active Game Hover Guide */}
                {inspectedIdx !== null &&
                  chartSeriesData.series[0]?.points[inspectedIdx] && (
                    <line
                      x1={chartSeriesData.series[0].points[inspectedIdx].x}
                      y1={PAD_T}
                      x2={chartSeriesData.series[0].points[inspectedIdx].x}
                      y2={PAD_T + PLOT_H}
                      stroke="#F97316"
                      strokeOpacity="0.5"
                      strokeWidth="1.4"
                    />
                  )}

                {/* Metric Polylines */}
                {chartSeriesData.series.map(({ indicator, polylinePoints }) => (
                  <polyline
                    key={indicator.metric.id}
                    fill="none"
                    stroke={indicator.seriesColor}
                    strokeWidth={nVisible > 45 ? '1.8' : '2.35'}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={polylinePoints}
                  />
                ))}

                {/* Data Points: Distinct Emerald/Rose Coloring ONLY for Active Streak Points */}
                {chartSeriesData.series.map(
                  ({ indicator, points, maxIdx, minIdx }) =>
                    points.map((pt, idx) => {
                      const isFocused = idx === inspectedIdx;
                      const isPeakOrFloor =
                        nVisible >= 2 && (idx === maxIdx || idx === minIdx);
                      const streakHex = indicator.isPositive
                        ? '#10B981'
                        : '#F43F5E';

                      if (pt.isStreak) {
                        return (
                          <g key={`${indicator.metric.id}-pt-${idx}`}>
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isFocused ? 8.5 : nVisible > 45 ? 5.2 : 6.5}
                              fill={streakHex}
                              fillOpacity="0.24"
                            />
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isFocused ? 5.2 : nVisible > 45 ? 3.4 : 4.2}
                              fill={streakHex}
                              stroke="#0B1120"
                              strokeWidth="1.5"
                            />
                          </g>
                        );
                      }

                      return (
                        <circle
                          key={`${indicator.metric.id}-pt-${idx}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={
                            isFocused
                              ? 4.8
                              : isPeakOrFloor
                              ? 3.8
                              : nVisible > 50
                              ? 1.8
                              : nVisible > 24
                              ? 2.5
                              : 3.2
                          }
                          fill={isFocused ? indicator.seriesColor : '#0B1120'}
                          stroke={indicator.seriesColor}
                          strokeWidth={nVisible > 50 ? '1.5' : '2'}
                        />
                      );
                    })
                )}

                {/* Peak (Máx) and Floor (Mín) Callout Labels on Primary Active Metric */}
                {nVisible >= 2 &&
                  chartSeriesData.series[0] &&
                  (() => {
                    const primary = chartSeriesData.series[0];
                    if (primary.maxVal === primary.minVal) return null;
                    const maxPt = primary.points[primary.maxIdx];
                    const minPt = primary.points[primary.minIdx];
                    const clampLabelX = (x: number) =>
                      Math.max(PAD_L + 28, Math.min(SVG_W - PAD_R - 28, x));

                    return (
                      <g>
                        {maxPt && (
                          <text
                            x={clampLabelX(maxPt.x)}
                            y={Math.max(12, maxPt.y - 9)}
                            textAnchor="middle"
                            fill="#34D399"
                            fontSize="10"
                            fontWeight="700"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            ▲ Máx{' '}
                            {formatChartVal(
                              primary.maxVal,
                              primary.indicator.metric,
                              primary.indicator.metric.gameDecimals,
                              primary.indicator.metric.unit === '%'
                            )}
                          </text>
                        )}
                        {minPt && (
                          <text
                            x={clampLabelX(minPt.x)}
                            y={Math.min(PAD_T + PLOT_H + 13, minPt.y + 14)}
                            textAnchor="middle"
                            fill="#FB7185"
                            fontSize="10"
                            fontWeight="700"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            ▼ Mín{' '}
                            {formatChartVal(
                              primary.minVal,
                              primary.indicator.metric,
                              primary.indicator.metric.gameDecimals,
                              primary.indicator.metric.unit === '%'
                            )}
                          </text>
                        )}
                      </g>
                    );
                  })()}

                {/* X-Axis Opponent + Date Labels (adaptive density) & Full-Resolution Hover Columns */}
                {visibleGames.map((g, idx) => {
                  const x =
                    nVisible === 1
                      ? PAD_L + PLOT_W / 2
                      : PAD_L + (idx / (nVisible - 1)) * PLOT_W;
                  const colWidth =
                    nVisible > 1 ? PLOT_W / (nVisible - 1) : PLOT_W;
                  const isFocused = idx === inspectedIdx;
                  const showTickLabel =
                    nVisible <= 12 ||
                    idx % xLabelStep === 0 ||
                    idx === nVisible - 1;

                  // Avoid colliding with the final tick label when nVisible is large
                  const safeShowLabel =
                    showTickLabel &&
                    !(
                      nVisible > 12 &&
                      idx !== nVisible - 1 &&
                      nVisible - 1 - idx < Math.ceil(xLabelStep * 0.6)
                    );

                  return (
                    <g key={`${getGameKey(g)}-${idx}`}>
                      {safeShowLabel && (
                        <>
                          <text
                            x={x}
                            y={SVG_H - 20}
                            textAnchor="middle"
                            fill={isFocused ? '#F8FAFC' : '#94A3B8'}
                            fontSize="10"
                            fontWeight={isFocused ? '700' : '500'}
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {g.isHome ? 'vs' : '@'}
                            {g.opponentAbbr}
                          </text>
                          <text
                            x={x}
                            y={SVG_H - 6}
                            textAnchor="middle"
                            fill={g.result === 'W' ? '#34D399' : '#FB7185'}
                            fontSize="9"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {formatShortDate(g.date)}
                          </text>
                        </>
                      )}
                      <rect
                        x={x - colWidth / 2}
                        y={PAD_T - 10}
                        width={Math.max(4, colWidth)}
                        height={PLOT_H + 46}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredGameIndex(idx)}
                        onClick={() => setHoveredGameIndex(idx)}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Draggable 2-Season Zoom Scrubber (Zoom deslizable) */}
              {totalGames > 3 && (
                <div className="pt-2 border-t border-[#1E293B] space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="font-mono tabular-nums">
                      Zoom deslizable (2 temporadas) · Partidos #{safeStart + 1}–#
                      {safeEnd + 1} de {totalGames} (
                      {formatShortDate(visibleGames[0].date)} –{' '}
                      {formatShortDate(
                        visibleGames[visibleGames.length - 1].date
                      )}
                      )
                    </span>
                    {spanPreset === 'custom_brush' && (
                      <button
                        type="button"
                        onClick={() => applyLastNPreset(10)}
                        className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 font-medium"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Volver a Últ. 10 PJ</span>
                      </button>
                    )}
                  </div>

                  <div
                    ref={brushTrackRef}
                    onPointerDown={handleBrushTrackClick}
                    className="relative h-8 w-full bg-[#131C2E] border border-[#1E293B] rounded-md overflow-hidden select-none touch-none cursor-pointer"
                  >
                    {/* Mini 2-Season Sparkline */}
                    <svg
                      viewBox="0 0 800 28"
                      preserveAspectRatio="none"
                      className="w-full h-full pointer-events-none"
                    >
                      {globalSeasonSplitIdx > 0 && (
                        <line
                          x1={
                            (globalSeasonSplitIdx / (totalGames - 1)) * 800
                          }
                          y1={0}
                          x2={
                            (globalSeasonSplitIdx / (totalGames - 1)) * 800
                          }
                          y2={28}
                          stroke="#F59E0B"
                          strokeWidth="2"
                          strokeDasharray="3 2"
                        />
                      )}
                      {miniBrushPolyline && (
                        <polyline
                          fill="none"
                          stroke="#64748B"
                          strokeWidth="1.5"
                          points={miniBrushPolyline}
                        />
                      )}
                    </svg>

                    {/* Dimmed Outside Regions */}
                    <div
                      style={{ width: `${brushLeftPct}%` }}
                      className="absolute inset-y-0 left-0 bg-[#0B1120]/70 pointer-events-none"
                    />
                    <div
                      style={{ width: `${Math.max(0, 100 - brushRightPct)}%` }}
                      className="absolute inset-y-0 right-0 bg-[#0B1120]/70 pointer-events-none"
                    />

                    {/* Active Draggable Window */}
                    <div
                      style={{
                        left: `${brushLeftPct}%`,
                        width: `${brushWidthPct}%`,
                      }}
                      onPointerDown={(e) => handleBrushPointerDown(e, 'move')}
                      onPointerMove={handleBrushPointerMove}
                      onPointerUp={handleBrushPointerUp}
                      onPointerCancel={handleBrushPointerUp}
                      className="absolute inset-y-0 bg-orange-500/15 border-x-2 border-y border-orange-500 cursor-grab active:cursor-grabbing flex items-center justify-between"
                    >
                      {/* Left Resize Handle */}
                      <div
                        onPointerDown={(e) => handleBrushPointerDown(e, 'left')}
                        onPointerMove={handleBrushPointerMove}
                        onPointerUp={handleBrushPointerUp}
                        onPointerCancel={handleBrushPointerUp}
                        title="Arrastrar inicio del tramo"
                        className="w-2.5 h-full -ml-1 cursor-ew-resize flex items-center justify-center"
                      >
                        <span className="w-0.5 h-3.5 bg-orange-300 rounded" />
                      </div>

                      {/* Right Resize Handle */}
                      <div
                        onPointerDown={(e) =>
                          handleBrushPointerDown(e, 'right')
                        }
                        onPointerMove={handleBrushPointerMove}
                        onPointerUp={handleBrushPointerUp}
                        onPointerCancel={handleBrushPointerUp}
                        title="Arrastrar fin del tramo"
                        className="w-2.5 h-full -mr-1 cursor-ew-resize flex items-center justify-center"
                      >
                        <span className="w-0.5 h-3.5 bg-orange-300 rounded" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Inspected Game Exact Telemetry Panel (4 cols on xl) */}
            <div className="xl:col-span-4 bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 flex flex-col justify-between space-y-3">
              {inspectedGame && inspectedIdx !== null && (
                <>
                  <div className="pb-2.5 border-b border-[#1E293B] flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-400 font-mono tabular-nums">
                        Partido {inspectedIdx + 1}/{visibleGames.length} ·{' '}
                        {formatShortDate(inspectedGame.date)} (
                        {inspectedGame.seasonLabel})
                      </div>
                      <div className="text-sm font-semibold text-slate-100 mt-0.5">
                        {inspectedGame.isHome ? 'vs' : '@'}{' '}
                        {inspectedGame.opponentName} (
                        {inspectedGame.opponentAbbr})
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div
                        className={`text-xs font-bold ${
                          inspectedGame.result === 'W'
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {inspectedGame.result === 'W' ? 'Victoria' : 'Derrota'}{' '}
                        {inspectedGame.scoreDisplay}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {inspectedGame.minutes.toFixed(1)} MIN
                        {inspectedGame.isBackToBack ? ' · B2B' : ''}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 flex-1 flex flex-col justify-center">
                    {evaluatedIndicators.map(
                      ({
                        metric,
                        seriesColor,
                        rule,
                        isPositive,
                        activeStreakGameKeys,
                        currentSeasonAvg,
                        fallbackAllAvg,
                      }) => {
                        const val = metric.getValue(inspectedGame);
                        const base = currentSeasonAvg ?? fallbackAllAvg;
                        const delta = val - base;
                        const inStreak = activeStreakGameKeys.has(
                          getGameKey(inspectedGame)
                        );
                        const deltaGood = metric.lowerIsBetter
                          ? delta <= 0
                          : delta >= 0;

                        return (
                          <div
                            key={metric.id}
                            className="p-2.5 rounded-md bg-[#131C2E]/70 border border-[#1E293B] space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="inline-flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: seriesColor }}
                                />
                                <span className="font-mono font-semibold text-slate-100">
                                  {metric.shortLabel}
                                </span>
                                <span className="text-slate-400 truncate">
                                  {metric.label.split('·')[1]?.trim() ||
                                    metric.label}
                                </span>
                              </span>
                              <span className="font-mono tabular-nums font-bold text-sm text-slate-100 shrink-0">
                                {formatChartVal(
                                  val,
                                  metric,
                                  metric.gameDecimals
                                )}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                              <span
                                className={
                                  inStreak
                                    ? isPositive
                                      ? 'text-emerald-400 font-semibold'
                                      : 'text-rose-400 font-semibold'
                                    : 'text-slate-500'
                                }
                              >
                                {inStreak
                                  ? `${
                                      isPositive ? '● En racha activa' : '● En racha activa (−)'
                                    } (${getOperatorSymbol(rule.operator)} ${
                                      rule.threshold
                                    })`
                                  : '○ Fuera de racha activa'}
                              </span>
                              <span
                                className={
                                  Math.abs(delta) < 0.05
                                    ? 'text-slate-400'
                                    : deltaGood
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }
                              >
                                {formatSigned(delta, metric.decimals)} vs temp.
                              </span>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>

                  <div className="pt-2 border-t border-[#1E293B] text-[11px] text-slate-400 font-mono tabular-nums flex items-center justify-between">
                    <span>
                      Boxscore: {inspectedGame.points} PTS ·{' '}
                      {inspectedGame.rebounds} REB · {inspectedGame.assists} AST
                    </span>
                    <span>
                      TS {inspectedGame.tsPct.toFixed(1)}% · GmSc{' '}
                      {inspectedGame.gameScore.toFixed(1)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Row 5: Bottom Indicator Summary & Deviations Strip (Required below chart) */}
          <div
            className={`grid grid-cols-1 ${
              evaluatedIndicators.length === 2
                ? 'lg:grid-cols-2'
                : evaluatedIndicators.length >= 3
                ? 'lg:grid-cols-3'
                : ''
            } gap-3`}
          >
            {chartSeriesData.series.map(
              ({ indicator, maxVal, minVal }) => {
                const {
                  metric,
                  seriesColor,
                  rule,
                  isPositive,
                  streakCount,
                  streakAvg,
                  currentSeasonAvg,
                  prevSeasonAvg,
                  spanAvg,
                } = indicator;

                const unitShort = metric.unit === '%' ? '%' : metric.unit;
                const opSym = getOperatorSymbol(rule.operator);
                const threshStr = formatMetricNumber(
                  rule.threshold,
                  metric.step < 1 ? (metric.step < 0.1 ? 2 : 1) : 0,
                  unitShort
                );

                const devVsSeason =
                  streakAvg !== null && currentSeasonAvg !== null
                    ? streakAvg - currentSeasonAvg
                    : null;
                const devVsSpan =
                  streakAvg !== null && spanAvg !== null
                    ? streakAvg - spanAvg
                    : null;

                const isDevGood = (d: number) =>
                  metric.lowerIsBetter ? d <= 0 : d >= 0;

                return (
                  <div
                    key={`summary-${metric.id}`}
                    className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 space-y-2.5"
                  >
                    {/* Indicator Title + Active Streak Headline */}
                    <div className="pb-2 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: seriesColor }}
                        />
                        <span className="text-xs font-semibold text-slate-100 truncate">
                          {metric.label}
                        </span>
                      </div>

                      <div className="font-mono tabular-nums text-xs shrink-0">
                        {streakCount > 0 && streakAvg !== null ? (
                          <span
                            className={`font-semibold ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            Racha activa: {streakCount} PJ ({opSym} {threshStr}
                            {rule.customQualifiesLabel
                              ? `, ${rule.customQualifiesLabel}`
                              : ''}
                            ) · Media racha:{' '}
                            {formatChartVal(streakAvg, metric, metric.decimals)}
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            Sin racha activa hoy (0 PJ con {opSym} {threshStr})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Required Text 1: Media temporada actual y desviación con la racha */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-300">
                        Media temporada actual (2026-27):{' '}
                        <strong className="font-mono tabular-nums text-slate-100">
                          {currentSeasonAvg !== null
                            ? formatChartVal(
                                currentSeasonAvg,
                                metric,
                                metric.decimals
                              )
                            : '—'}
                        </strong>
                        {prevSeasonAvg !== null && (
                          <span className="text-slate-500 font-mono tabular-nums ml-1.5">
                            · Pasada 25-26:{' '}
                            {formatChartVal(
                              prevSeasonAvg,
                              metric,
                              metric.decimals
                            )}
                          </span>
                        )}
                      </span>

                      <span className="font-mono tabular-nums">
                        <span className="text-slate-400 font-sans mr-1">
                          Desviación con la racha:
                        </span>
                        {devVsSeason !== null ? (
                          <strong
                            className={
                              Math.abs(devVsSeason) < 0.05
                                ? 'text-slate-300'
                                : isDevGood(devVsSeason)
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }
                          >
                            {formatSigned(
                              devVsSeason,
                              metric.decimals,
                              metric.unit === '%' ? '%' : ''
                            )}
                          </strong>
                        ) : (
                          <span className="text-slate-500">
                            — (sin racha activa)
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Required Text 2: Media tramo y desviación con la racha */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-300">
                        Media tramo ({visibleGames.length} PJ):{' '}
                        <strong className="font-mono tabular-nums text-slate-100">
                          {spanAvg !== null
                            ? formatChartVal(spanAvg, metric, metric.decimals)
                            : '—'}
                        </strong>
                        <span className="text-slate-500 font-mono tabular-nums ml-1.5">
                          · Máx{' '}
                          {formatChartVal(
                            maxVal,
                            metric,
                            metric.gameDecimals,
                            metric.unit === '%'
                          )}{' '}
                          / Mín{' '}
                          {formatChartVal(
                            minVal,
                            metric,
                            metric.gameDecimals,
                            metric.unit === '%'
                          )}
                        </span>
                      </span>

                      <span className="font-mono tabular-nums">
                        <span className="text-slate-400 font-sans mr-1">
                          Desviación con la racha:
                        </span>
                        {devVsSpan !== null ? (
                          <strong
                            className={
                              Math.abs(devVsSpan) < 0.05
                                ? 'text-slate-300'
                                : isDevGood(devVsSpan)
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }
                          >
                            {formatSigned(
                              devVsSpan,
                              metric.decimals,
                              metric.unit === '%' ? '%' : ''
                            )}
                          </strong>
                        ) : (
                          <span className="text-slate-500">
                            — (sin racha activa)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}
    </section>
  );
}
