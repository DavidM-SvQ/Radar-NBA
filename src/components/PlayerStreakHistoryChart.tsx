import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search, TrendingUp } from 'lucide-react';
import type { PlayerGameLog, PlayerSummary } from '../types/nba';
import { formatShortDate, normalizeSearchText } from '../utils/analytics';
import { PlayerAvatar } from './NbaVisuals';

interface PlayerStreakHistoryChartProps {
  players: PlayerSummary[];
  selectedPlayerId: string | null;
  onSelectPlayerId: (playerId: string) => void;
  onInspectPlayer: (playerId: string) => void;
}

type ScaleMode = 'auto' | 'raw' | 'normalized';

type MetricCategory = 'core' | 'shooting' | 'efficiency' | 'defense_control';

interface ChartMetricDef {
  id: string;
  shortLabel: string;
  label: string;
  category: MetricCategory;
  strokeHex: string;
  dotClass: string;
  textClass: string;
  decimals: number;
  unit: string;
  isPercentage?: boolean;
  isSmallCount?: boolean;
  allowNegative?: boolean;
  getValue: (g: PlayerGameLog) => number;
}

const CHART_METRICS: ChartMetricDef[] = [
  // Principales
  {
    id: 'pts',
    shortLabel: 'PTS',
    label: 'Puntos',
    category: 'core',
    strokeHex: '#F97316',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-400',
    decimals: 0,
    unit: '',
    getValue: (g) => g.points,
  },
  {
    id: 'reb',
    shortLabel: 'REB',
    label: 'Rebotes totales',
    category: 'core',
    strokeHex: '#38BDF8',
    dotClass: 'bg-sky-400',
    textClass: 'text-sky-400',
    decimals: 0,
    unit: '',
    getValue: (g) => g.rebounds,
  },
  {
    id: 'ast',
    shortLabel: 'AST',
    label: 'Asistencias',
    category: 'core',
    strokeHex: '#34D399',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-400',
    decimals: 0,
    unit: '',
    getValue: (g) => g.assists,
  },
  {
    id: 'pra',
    shortLabel: 'PRA',
    label: 'PTS + REB + AST',
    category: 'core',
    strokeHex: '#FB923C',
    dotClass: 'bg-orange-400',
    textClass: 'text-orange-300',
    decimals: 0,
    unit: '',
    getValue: (g) => g.pra,
  },
  {
    id: 'gmsc',
    shortLabel: 'GmSc',
    label: 'Valoración Hollinger',
    category: 'core',
    strokeHex: '#A78BFA',
    dotClass: 'bg-violet-400',
    textClass: 'text-violet-300',
    decimals: 1,
    unit: '',
    allowNegative: true,
    getValue: (g) => g.gameScore,
  },

  // Tiro & Volumen
  {
    id: 'fg3m',
    shortLabel: '3PM',
    label: 'Triples anotados',
    category: 'shooting',
    strokeHex: '#22D3EE',
    dotClass: 'bg-cyan-400',
    textClass: 'text-cyan-300',
    decimals: 0,
    unit: '',
    isSmallCount: true,
    getValue: (g) => g.fg3m,
  },
  {
    id: 'fgm',
    shortLabel: 'FGM',
    label: 'Tiros campo anotados',
    category: 'shooting',
    strokeHex: '#F472B6',
    dotClass: 'bg-pink-400',
    textClass: 'text-pink-300',
    decimals: 0,
    unit: '',
    getValue: (g) => g.fgm,
  },
  {
    id: 'ftm',
    shortLabel: 'FTM',
    label: 'Tiros libres anotados',
    category: 'shooting',
    strokeHex: '#FBBF24',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
    decimals: 0,
    unit: '',
    isSmallCount: true,
    getValue: (g) => g.ftm,
  },

  // Eficiencia %
  {
    id: 'fgPct',
    shortLabel: 'FG%',
    label: '% Tiros de campo',
    category: 'efficiency',
    strokeHex: '#60A5FA',
    dotClass: 'bg-blue-400',
    textClass: 'text-blue-300',
    decimals: 1,
    unit: '%',
    isPercentage: true,
    getValue: (g) => g.fgPct,
  },
  {
    id: 'fg3Pct',
    shortLabel: '3P%',
    label: '% Triples',
    category: 'efficiency',
    strokeHex: '#2DD4BF',
    dotClass: 'bg-teal-400',
    textClass: 'text-teal-300',
    decimals: 1,
    unit: '%',
    isPercentage: true,
    getValue: (g) => g.fg3Pct,
  },
  {
    id: 'ftPct',
    shortLabel: 'FT%',
    label: '% Tiros libres',
    category: 'efficiency',
    strokeHex: '#E879F9',
    dotClass: 'bg-fuchsia-400',
    textClass: 'text-fuchsia-300',
    decimals: 1,
    unit: '%',
    isPercentage: true,
    getValue: (g) => g.ftPct,
  },
  {
    id: 'tsPct',
    shortLabel: 'TS%',
    label: 'Acierto real (TS%)',
    category: 'efficiency',
    strokeHex: '#4ADE80',
    dotClass: 'bg-green-400',
    textClass: 'text-green-300',
    decimals: 1,
    unit: '%',
    isPercentage: true,
    getValue: (g) => g.tsPct,
  },

  // Rebote, Defensa & Control
  {
    id: 'oreb',
    shortLabel: 'OREB',
    label: 'Rebotes ofensivos',
    category: 'defense_control',
    strokeHex: '#FB7185',
    dotClass: 'bg-rose-400',
    textClass: 'text-rose-300',
    decimals: 0,
    unit: '',
    isSmallCount: true,
    getValue: (g) => g.oreb,
  },
  {
    id: 'dreb',
    shortLabel: 'DREB',
    label: 'Rebotes defensivos',
    category: 'defense_control',
    strokeHex: '#818CF8',
    dotClass: 'bg-indigo-400',
    textClass: 'text-indigo-300',
    decimals: 0,
    unit: '',
    getValue: (g) => g.dreb,
  },
  {
    id: 'stl',
    shortLabel: 'ROB',
    label: 'Robos de balón',
    category: 'defense_control',
    strokeHex: '#10B981',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-400',
    decimals: 0,
    unit: '',
    isSmallCount: true,
    getValue: (g) => g.steals,
  },
  {
    id: 'blk',
    shortLabel: 'TAP',
    label: 'Tapones',
    category: 'defense_control',
    strokeHex: '#06B6D4',
    dotClass: 'bg-cyan-500',
    textClass: 'text-cyan-400',
    decimals: 0,
    unit: '',
    isSmallCount: true,
    getValue: (g) => g.blocks,
  },
  {
    id: 'stocks',
    shortLabel: 'STK',
    label: 'Robos + Tapones',
    category: 'defense_control',
    strokeHex: '#14B8A6',
    dotClass: 'bg-teal-500',
    textClass: 'text-teal-400',
    decimals: 0,
    unit: '',
    isSmallCount: true,
    getValue: (g) => g.stocks,
  },
  {
    id: 'tov',
    shortLabel: 'PER',
    label: 'Pérdidas',
    category: 'defense_control',
    strokeHex: '#F43F5E',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-400',
    decimals: 0,
    unit: '',
    isSmallCount: true,
    getValue: (g) => g.turnovers,
  },
  {
    id: 'min',
    shortLabel: 'MIN',
    label: 'Minutos',
    category: 'defense_control',
    strokeHex: '#94A3B8',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-300',
    decimals: 1,
    unit: '',
    getValue: (g) => g.minutes,
  },
  {
    id: 'plusMinus',
    shortLabel: '+/-',
    label: 'Más / Menos',
    category: 'defense_control',
    strokeHex: '#FACC15',
    dotClass: 'bg-yellow-400',
    textClass: 'text-yellow-300',
    decimals: 0,
    unit: '',
    allowNegative: true,
    getValue: (g) => g.plusMinus,
  },
];

function formatStatVal(val: number, m: ChartMetricDef, forceDecimals?: number): string {
  const dec = forceDecimals ?? m.decimals;
  const prefix = m.id === 'plusMinus' && val > 0 ? '+' : '';
  return `${prefix}${val.toFixed(dec)}${m.unit}`;
}

export function PlayerStreakHistoryChart({
  players,
  selectedPlayerId,
  onSelectPlayerId,
  onInspectPlayer,
}: PlayerStreakHistoryChartProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeMetricIds, setActiveMetricIds] = useState<string[]>([
    'pts',
    'reb',
    'ast',
  ]);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('auto');
  const [hoveredGameIndex, setHoveredGameIndex] = useState<number | null>(null);
  const [showAllMetricChips, setShowAllMetricChips] = useState<boolean>(false);

  const activePlayer = useMemo(() => {
    if (selectedPlayerId) {
      const found = players.find((p) => p.id === selectedPlayerId);
      if (found) return found;
    }
    return players.find((p) => p.games.length >= 3) || players[0] || null;
  }, [players, selectedPlayerId]);

  useEffect(() => {
    setHoveredGameIndex(null);
  }, [activePlayer?.id]);

  const filteredPickerPlayers = useMemo(() => {
    const q = normalizeSearchText(searchText);
    const base = players.filter((p) => p.games.length > 0);
    if (!q) return base.slice(0, 24);
    return base
      .filter((p) =>
        normalizeSearchText(`${p.name} ${p.teamAbbr} ${p.teamName} ${p.position}`).includes(
          q
        )
      )
      .slice(0, 24);
  }, [players, searchText]);

  // Last 10 games ordered oldest (left) -> newest (right)
  const chronologicalGames = useMemo(() => {
    if (!activePlayer) return [];
    return activePlayer.games.slice(0, 10).reverse();
  }, [activePlayer]);

  const activeMetrics = useMemo(() => {
    const chosen = CHART_METRICS.filter((m) => activeMetricIds.includes(m.id));
    return chosen.length > 0 ? chosen : [CHART_METRICS[0]];
  }, [activeMetricIds]);

  // Season baselines per metric for delta & baseline line
  const seasonAvgByMetric = useMemo(() => {
    const map: Record<string, number> = {};
    if (!activePlayer || activePlayer.games.length === 0) return map;
    const sample = activePlayer.games;
    for (const m of CHART_METRICS) {
      const sum = sample.reduce((acc, g) => acc + m.getValue(g), 0);
      map[m.id] = sum / sample.length;
    }
    return map;
  }, [activePlayer]);

  // Decide whether to render Raw scale or Normalized 0-100% scale
  const effectiveNormalized = useMemo(() => {
    if (scaleMode === 'normalized') return true;
    if (scaleMode === 'raw') return false;
    // Auto mode: normalize when > 4 series OR when mixing % / high-volume stats with small counts (<= 6 max) or +/-
    if (activeMetrics.length > 4) return true;
    const hasPct = activeMetrics.some((m) => m.isPercentage);
    const hasSmall = activeMetrics.some((m) => m.isSmallCount);
    const hasHigh = activeMetrics.some((m) => !m.isPercentage && !m.isSmallCount);
    if (hasPct && (hasSmall || activeMetrics.some((m) => m.id === 'pts' || m.id === 'pra'))) {
      return activeMetrics.length > 1;
    }
    if (hasSmall && hasHigh && activeMetrics.length >= 2) {
      return true;
    }
    return false;
  }, [scaleMode, activeMetrics]);

  // SVG Coordinate Geometry (viewBox 860 x 260)
  const SVG_W = 860;
  const SVG_H = 260;
  const PAD_L = 48;
  const PAD_R = 24;
  const PAD_T = 22;
  const PAD_B = 42;
  const PLOT_W = SVG_W - PAD_L - PAD_R;
  const PLOT_H = SVG_H - PAD_T - PAD_B;

  const chartSeriesData = useMemo(() => {
    if (chronologicalGames.length === 0) {
      return {
        rawMin: 0,
        rawMax: 40,
        yTicks: [0, 10, 20, 30, 40],
        series: [] as Array<{
          metric: ChartMetricDef;
          points: Array<{ x: number; y: number; rawVal: number; normPct: number }>;
          polylinePoints: string;
          avg10: number;
          seasonAvg: number;
        }>,
      };
    }

    let globalMin = Infinity;
    let globalMax = -Infinity;

    const rawMatrix = activeMetrics.map((m) => {
      const vals = chronologicalGames.map((g) => m.getValue(g));
      for (const v of vals) {
        if (v < globalMin) globalMin = v;
        if (v > globalMax) globalMax = v;
      }
      return { metric: m, vals };
    });

    if (!Number.isFinite(globalMin)) globalMin = 0;
    if (!Number.isFinite(globalMax)) globalMax = 10;

    // Include seasonAvg in domain when showing single/dual raw series
    if (!effectiveNormalized && activeMetrics.length <= 2) {
      for (const m of activeMetrics) {
        const sAvg = seasonAvgByMetric[m.id] ?? 0;
        if (sAvg < globalMin) globalMin = sAvg;
        if (sAvg > globalMax) globalMax = sAvg;
      }
    }

    const allowNeg = activeMetrics.some((m) => m.allowNegative) && globalMin < 0;
    const rawMin = effectiveNormalized
      ? 0
      : allowNeg
      ? Math.floor(globalMin - 2)
      : 0;
    const rawMax = effectiveNormalized
      ? 100
      : Math.max(rawMin + 4, Math.ceil(globalMax * 1.12));

    const span = Math.max(1, rawMax - rawMin);
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) =>
      Math.round((rawMin + span * t) * 10) / 10
    );

    const nGames = chronologicalGames.length;
    const xAt = (idx: number) =>
      nGames === 1
        ? PAD_L + PLOT_W / 2
        : PAD_L + (idx / (nGames - 1)) * PLOT_W;

    const series = rawMatrix.map(({ metric, vals }) => {
      const mMin = metric.allowNegative ? Math.min(0, ...vals) : 0;
      const mMax = Math.max(mMin + 1, ...vals);
      const mSpan = Math.max(1, mMax - mMin);

      const pts = vals.map((rawVal, idx) => {
        const normPct = ((rawVal - mMin) / mSpan) * 100;
        const plotVal = effectiveNormalized ? normPct : rawVal;
        const ratio = (plotVal - rawMin) / span;
        const clampedRatio = Math.max(0, Math.min(1, ratio));
        const x = xAt(idx);
        const y = PAD_T + PLOT_H - clampedRatio * PLOT_H;
        return { x, y, rawVal, normPct };
      });

      const avg10 =
        vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;

      return {
        metric,
        points: pts,
        polylinePoints: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
        avg10,
        seasonAvg: seasonAvgByMetric[metric.id] ?? 0,
      };
    });

    return { rawMin, rawMax, yTicks, series };
  }, [
    chronologicalGames,
    activeMetrics,
    effectiveNormalized,
    seasonAvgByMetric,
    PLOT_H,
    PLOT_W,
  ]);

  const toggleMetric = (id: string) => {
    setActiveMetricIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least 1 metric active
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const applyPreset = (ids: string[]) => {
    setActiveMetricIds(ids);
  };

  const inspectedIdx =
    hoveredGameIndex !== null && hoveredGameIndex < chronologicalGames.length
      ? hoveredGameIndex
      : chronologicalGames.length > 0
      ? chronologicalGames.length - 1
      : null;

  const inspectedGame =
    inspectedIdx !== null ? chronologicalGames[inspectedIdx] : null;

  if (!activePlayer) {
    return null;
  }

  const visibleMetricOptions = showAllMetricChips
    ? CHART_METRICS
    : CHART_METRICS.slice(0, 10);

  return (
    <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
      {/* Top Bar: Title + Player Selector + Scale Control */}
      <div className="px-4 py-3.5 border-b border-[#1E293B] bg-[#0F172A]/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-400 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-100 whitespace-nowrap">
              Historial de Rachas (Últimos {chronologicalGames.length} Partidos)
            </h3>
          </div>
          <span className="text-xs text-slate-400 hidden sm:inline">
            · Progresión temporal partido a partido
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Searchable Player Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="min-h-[36px] inline-flex items-center gap-2.5 px-3 py-1.5 bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/50 rounded-lg text-xs text-slate-100 transition-colors"
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
                          {p.teamAbbr} · {p.games.length} PJ
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
            className="min-h-[36px] px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Ficha completa →
          </button>

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
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  scaleMode === opt.id
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric Presets + Individual Toggle Strip */}
      <div className="px-4 py-3 border-b border-[#1E293B] bg-[#0B1120]/40 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 mr-1">Perfiles rápidos:</span>
            <button
              type="button"
              onClick={() => applyPreset(['pts', 'reb', 'ast'])}
              className="px-2.5 py-1 text-[11px] font-medium rounded bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600 transition-colors whitespace-nowrap"
            >
              PTS · REB · AST
            </button>
            <button
              type="button"
              onClick={() => applyPreset(['pts', 'pra', 'gmsc'])}
              className="px-2.5 py-1 text-[11px] font-medium rounded bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600 transition-colors whitespace-nowrap"
            >
              Impacto (PRA · GmSc)
            </button>
            <button
              type="button"
              onClick={() => applyPreset(['fgPct', 'fg3Pct', 'ftPct', 'tsPct'])}
              className="px-2.5 py-1 text-[11px] font-medium rounded bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600 transition-colors whitespace-nowrap"
            >
              Eficiencia %
            </button>
            <button
              type="button"
              onClick={() => applyPreset(['oreb', 'dreb', 'stl', 'blk', 'tov'])}
              className="px-2.5 py-1 text-[11px] font-medium rounded bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600 transition-colors whitespace-nowrap"
            >
              Rebote y Defensa
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAllMetricChips(true);
                applyPreset(CHART_METRICS.map((m) => m.id));
              }}
              className="px-2.5 py-1 text-[11px] font-medium rounded bg-[#0B1120] border border-[#1E293B] text-orange-300 hover:border-orange-500/50 transition-colors whitespace-nowrap"
            >
              Todas ({CHART_METRICS.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAllMetricChips((v) => !v)}
            className="text-[11px] font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap"
          >
            {showAllMetricChips
              ? 'Ver catálogo compacto'
              : `Mostrar las ${CHART_METRICS.length} métricas →`}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {visibleMetricOptions.map((m) => {
            const active = activeMetricIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                title={m.label}
                onClick={() => toggleMetric(m.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors whitespace-nowrap shrink-0 border ${
                  active
                    ? 'bg-[#182338] border-slate-500 text-white font-semibold'
                    : 'bg-[#0B1120] border-[#1E293B] text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${m.dotClass}`} />
                <span>{m.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {effectiveNormalized && (
          <p className="text-[11px] text-slate-400">
            Vista normalizada activa (0–100% sobre el rango de cada métrica en los 10 partidos) para que categorías de menor cifra como robos o tapones no queden aplastadas frente a puntos o porcentajes. Los valores reales exactos se muestran abajo al señalar cada partido.
          </p>
        )}
      </div>

      {/* Main SVG Line Chart + Game Detail Strip */}
      {chronologicalGames.length === 0 ? (
        <div className="py-12 px-6 text-center text-xs text-slate-400">
          Este jugador aún no registra partidos disputados en el corte actual.
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
          {/* SVG Canvas (8 cols on xl) */}
          <div className="xl:col-span-8 bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 flex flex-col justify-between">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full h-56 sm:h-64 select-none overflow-visible"
              role="img"
              aria-label={`Evolución últimos ${chronologicalGames.length} partidos de ${activePlayer.name}`}
              onMouseLeave={() => setHoveredGameIndex(null)}
            >
              {/* Horizontal Grid Lines & Y-Axis Labels */}
              {chartSeriesData.yTicks.map((tick, idx) => {
                const span = Math.max(
                  1,
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

              {/* Season Average Dashed Baseline when showing 1 metric in Raw Mode */}
              {!effectiveNormalized &&
                chartSeriesData.series.length === 1 &&
                (() => {
                  const single = chartSeriesData.series[0];
                  const span = Math.max(
                    1,
                    chartSeriesData.rawMax - chartSeriesData.rawMin
                  );
                  const yBase =
                    PAD_T +
                    PLOT_H -
                    ((single.seasonAvg - chartSeriesData.rawMin) / span) * PLOT_H;
                  if (yBase < PAD_T || yBase > PAD_T + PLOT_H) return null;
                  return (
                    <g>
                      <line
                        x1={PAD_L}
                        y1={yBase}
                        x2={SVG_W - PAD_R}
                        y2={yBase}
                        stroke={single.metric.strokeHex}
                        strokeOpacity="0.45"
                        strokeWidth="1.5"
                        strokeDasharray="6 4"
                      />
                      <text
                        x={SVG_W - PAD_R - 4}
                        y={yBase - 5}
                        textAnchor="end"
                        fill="#94A3B8"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        Media habitual:{' '}
                        {formatStatVal(single.seasonAvg, single.metric, 1)}
                      </text>
                    </g>
                  );
                })()}

              {/* Vertical Active Game Guide */}
              {inspectedIdx !== null &&
                chartSeriesData.series[0]?.points[inspectedIdx] && (
                  <line
                    x1={chartSeriesData.series[0].points[inspectedIdx].x}
                    y1={PAD_T}
                    x2={chartSeriesData.series[0].points[inspectedIdx].x}
                    y2={PAD_T + PLOT_H}
                    stroke="#F97316"
                    strokeOpacity="0.55"
                    strokeWidth="1.5"
                  />
                )}

              {/* Metric Polylines */}
              {chartSeriesData.series.map(({ metric, polylinePoints }) => (
                <polyline
                  key={metric.id}
                  fill="none"
                  stroke={metric.strokeHex}
                  strokeWidth={chartSeriesData.series.length > 6 ? '1.75' : '2.4'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
              ))}

              {/* Data Nodes */}
              {chartSeriesData.series.map(({ metric, points }) =>
                points.map((pt, idx) => {
                  const isFocused = idx === inspectedIdx;
                  return (
                    <circle
                      key={`${metric.id}-${idx}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={
                        isFocused
                          ? 5
                          : chartSeriesData.series.length > 8
                          ? 2.5
                          : 3.5
                      }
                      fill={isFocused ? metric.strokeHex : '#0B1120'}
                      stroke={metric.strokeHex}
                      strokeWidth="2"
                    />
                  );
                })
              )}

              {/* X-Axis Opponent + Date Labels & Invisible Hover Hit Columns */}
              {chronologicalGames.map((g, idx) => {
                const n = chronologicalGames.length;
                const x =
                  n === 1 ? PAD_L + PLOT_W / 2 : PAD_L + (idx / (n - 1)) * PLOT_W;
                const colWidth = n > 1 ? PLOT_W / (n - 1) : PLOT_W;
                const isFocused = idx === inspectedIdx;

                return (
                  <g key={`${g.eventId}-${idx}`}>
                    <text
                      x={x}
                      y={SVG_H - 20}
                      textAnchor="middle"
                      fill={isFocused ? '#F8FAFC' : '#94A3B8'}
                      fontSize="10.5"
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
                      fontSize="9.5"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {g.result === 'W' ? 'V' : 'D'} · {formatShortDate(g.date)}
                    </text>
                    <rect
                      x={x - colWidth / 2}
                      y={PAD_T - 8}
                      width={colWidth}
                      height={PLOT_H + 42}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredGameIndex(idx)}
                      onClick={() => setHoveredGameIndex(idx)}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Bottom 10-Game Averages Summary */}
            <div className="pt-2.5 mt-1 border-t border-[#1E293B] flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <span className="text-slate-400">
                Media tramo ({chronologicalGames.length} PJ):
              </span>
              {chartSeriesData.series.slice(0, 6).map(({ metric, avg10, seasonAvg }) => {
                const diff = avg10 - seasonAvg;
                return (
                  <span
                    key={metric.id}
                    className="inline-flex items-center gap-1 font-mono tabular-nums"
                  >
                    <span className={`font-semibold ${metric.textClass}`}>
                      {metric.shortLabel} {formatStatVal(avg10, metric, 1)}
                    </span>
                    <span
                      className={`text-[11px] ${
                        diff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      ({diff >= 0 ? '+' : ''}
                      {diff.toFixed(1)})
                    </span>
                  </span>
                );
              })}
              {chartSeriesData.series.length > 6 && (
                <span className="text-[11px] text-slate-400">
                  +{chartSeriesData.series.length - 6} métricas en detalle →
                </span>
              )}
            </div>
          </div>

          {/* Inspected Game Exact Telemetry Panel (4 cols on xl) */}
          <div className="xl:col-span-4 bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 flex flex-col justify-between space-y-3">
            {inspectedGame && inspectedIdx !== null && (
              <>
                <div className="pb-2.5 border-b border-[#1E293B] flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-400">
                      Partido {inspectedIdx + 1} de {chronologicalGames.length} ·{' '}
                      {formatShortDate(inspectedGame.date)} ({inspectedGame.seasonLabel})
                    </div>
                    <div className="text-sm font-semibold text-slate-100 mt-0.5">
                      {inspectedGame.isHome ? 'vs' : '@'} {inspectedGame.opponentName} (
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

                <div className="max-h-52 overflow-y-auto pr-1 divide-y divide-[#1E293B]/60">
                  {activeMetrics.map((m) => {
                    const val = m.getValue(inspectedGame);
                    const sAvg = seasonAvgByMetric[m.id] ?? 0;
                    const delta = val - sAvg;
                    return (
                      <div
                        key={m.id}
                        className="py-1.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="flex items-center gap-2 text-slate-300 truncate">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${m.dotClass}`} />
                          <span className="font-mono font-semibold text-slate-200">
                            {m.shortLabel}
                          </span>
                          <span className="text-slate-400 truncate">{m.label}</span>
                        </span>
                        <span className="font-mono tabular-nums whitespace-nowrap shrink-0">
                          <span className="font-bold text-slate-100">
                            {formatStatVal(val, m)}
                          </span>
                          <span
                            className={`ml-1.5 text-[11px] ${
                              m.id === 'tov'
                                ? delta <= 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                                : delta >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            ({delta >= 0 ? '+' : ''}
                            {delta.toFixed(1)} vs base)
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
