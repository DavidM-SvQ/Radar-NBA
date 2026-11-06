import { useMemo, useState, useRef } from 'react';
import {
  LayoutGrid,
  Search,
  Users,
  RotateCcw,
  TrendingUp,
  Filter,
  ChevronDown,
  BarChart2,
  Trophy,
} from 'lucide-react';
import type {
  ExperienceMode,
  PlayerSummary,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import {
  mean,
  normalizeSearchText,
} from '../utils/analytics';
import {
  STREAK_METRIC_OPTIONS,
} from '../utils/streakMetricsCatalog';
import { PlayerAvatar } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import {
  buildTableSnapshotBlob,
  type TableSnapshotCell,
} from '../utils/exportImageCard';
import { type LeagueBenchmarks } from '../utils/humanize';

const TEAM_TO_DIV: Record<string, string> = {
  BOS: 'Atlantic', BKN: 'Atlantic', NYK: 'Atlantic', PHI: 'Atlantic', TOR: 'Atlantic',
  CHI: 'Central', CLE: 'Central', DET: 'Central', IND: 'Central', MIL: 'Central',
  ATL: 'Southeast', CHA: 'Southeast', MIA: 'Southeast', ORL: 'Southeast', WAS: 'Southeast',
  DEN: 'Northwest', MIN: 'Northwest', OKC: 'Northwest', POR: 'Northwest', UTA: 'Northwest',
  GSW: 'Pacific', LAC: 'Pacific', LAL: 'Pacific', PHX: 'Pacific', SAC: 'Pacific',
  DAL: 'Southwest', HOU: 'Southwest', MEM: 'Southwest', NOP: 'Southwest', SAS: 'Southwest'
};

const DIVISIONS = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'];

interface ScatterAnalyticsViewProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
  benchmarks: LeagueBenchmarks;
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onToggleWatchlist: (key: string) => void;
  onInspectEntity: (type: 'player' | 'team', id: string) => void;
  windowSize: WindowSize;
}

interface ScatterPoint {
  id: string;
  name: string;
  teamAbbr: string;
  position: string;
  x: number;
  y: number;
  size: number;
  minAvg: number;
  item: PlayerSummary;
}

export function ScatterAnalyticsView({
  players,
  teams,
  onInspectEntity,
}: ScatterAnalyticsViewProps) {
  // Metric Selection
  const [metricXId, setMetricXId] = useState('usgEst');
  const [metricYId, setMetricYId] = useState('tsPct');
  const [metricSizeId, setMetricSizeId] = useState('minutes');

  // Filters
  const [posFilter, setPosFilter] = useState<'all' | 'G' | 'F' | 'C'>('all');
  const [confFilter, setConfFilter] = useState<'all' | 'East' | 'West'>('all');
  const [divFilter, setDivFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  
  // Thresholds
  const [minGames, setMinGames] = useState(5);
  const [minMpg, setMinMpg] = useState(15);
  const [minX, setMinX] = useState<number | null>(null);
  const [minY, setMinY] = useState<number | null>(null);

  // Advanced Stats Toggle
  const [showTrendLine, setShowTrendLine] = useState(false);
  const [showHistograms, setShowHistograms] = useState(true);

  const metricX = useMemo(
    () => STREAK_METRIC_OPTIONS.find((m) => m.id === metricXId) || STREAK_METRIC_OPTIONS[0],
    [metricXId]
  );
  const metricY = useMemo(
    () => STREAK_METRIC_OPTIONS.find((m) => m.id === metricYId) || STREAK_METRIC_OPTIONS[1],
    [metricYId]
  );
  const metricSize = useMemo(
    () => STREAK_METRIC_OPTIONS.find((m) => m.id === metricSizeId) || STREAK_METRIC_OPTIONS[2],
    [metricSizeId]
  );

  const points = useMemo(() => {
    const q = normalizeSearchText(query);
    return players
      .filter((p) => {
        if (p.games.length < minGames) return false;
        const avgMin = mean(p.games.map(g => g.minutes));
        if (avgMin < minMpg) return false;

        if (posFilter !== 'all' && !p.position.toUpperCase().includes(posFilter)) return false;
        
        // Team/Div/Conf filters
        const teamInfo = teams.find(t => t.abbreviation === p.teamAbbr);
        if (confFilter !== 'all') {
          const pConf = teamInfo?.conference === 'Este' || teamInfo?.conference === 'East' ? 'East' : 'West';
          if (pConf !== confFilter) return false;
        }
        if (divFilter !== 'all' && TEAM_TO_DIV[p.teamAbbr] !== divFilter) return false;
        if (teamFilter !== 'all' && p.teamAbbr !== teamFilter) return false;

        if (q) {
          const hay = normalizeSearchText(`${p.name} ${p.teamAbbr}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((p) => {
        const xVal = mean(p.games.map((g) => metricX.getValue(g)));
        const yVal = mean(p.games.map((g) => metricY.getValue(g)));
        const sVal = mean(p.games.map((g) => metricSize.getValue(g)));
        const avgMin = mean(p.games.map(g => g.minutes));
        return {
          id: p.id,
          name: p.name,
          teamAbbr: p.teamAbbr,
          position: p.position,
          x: xVal,
          y: yVal,
          size: sVal,
          minAvg: avgMin,
          item: p,
        };
      })
      .filter((p) => {
        if (minX !== null && p.x < minX) return false;
        if (minY !== null && p.y < minY) return false;
        return !isNaN(p.x) && !isNaN(p.y);
      });
  }, [players, teams, metricX, metricY, metricSize, posFilter, confFilter, divFilter, teamFilter, query, minGames, minMpg, minX, minY]);

  // Chart Dimensions
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<ScatterPoint | null>(null);

  const margin = { top: 40, right: 40, bottom: 60, left: 60 };
  const width = 800;
  const height = 500;
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  const xRange = useMemo(() => {
    if (points.length === 0) return { min: 0, max: 100 };
    const vals = points.map((p) => p.x);
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const padding = (mx - mn) * 0.1 || 1;
    return { min: mn - padding, max: mx + padding };
  }, [points]);

  const yRange = useMemo(() => {
    if (points.length === 0) return { min: 0, max: 100 };
    const vals = points.map((p) => p.y);
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const padding = (mx - mn) * 0.1 || 1;
    return { min: mn - padding, max: mx + padding };
  }, [points]);

  const sizeRange = useMemo(() => {
    if (points.length === 0) return { min: 0, max: 1 };
    const vals = points.map((p) => p.size);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [points]);

  const getX = (val: number) =>
    margin.left + ((val - xRange.min) / (xRange.max - xRange.min || 1)) * chartW;
  const getY = (val: number) =>
    margin.top + chartH - ((val - yRange.min) / (yRange.max - yRange.min || 1)) * chartH;
  const getSize = (val: number) => {
    const ratio = (val - sizeRange.min) / (sizeRange.max - sizeRange.min || 1);
    return 3 + ratio * 12;
  };

  const medianX = useMemo(() => mean(points.map((p) => p.x)), [points]);
  const medianY = useMemo(() => mean(points.map((p) => p.y)), [points]);

  // Linear Regression
  const trend = useMemo(() => {
    if (!showTrendLine || points.length < 2) return null;
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // R-squared
    let ssRes = 0, ssTot = 0;
    const meanY = sumY / n;
    for (const p of points) {
      const fitted = slope * p.x + intercept;
      ssRes += (p.y - fitted) ** 2;
      ssTot += (p.y - meanY) ** 2;
    }
    const r2 = 1 - (ssRes / (ssTot || 1));
    
    return { slope, intercept, r2 };
  }, [points, showTrendLine]);

  // Histogram Logic
  const histograms = useMemo(() => {
    if (!showHistograms || points.length === 0) return null;
    const bins = 20;
    const xData = points.map(p => p.x);
    const yData = points.map(p => p.y);
    
    const buildHist = (data: number[], range: { min: number, max: number }) => {
      const counts = new Array(bins).fill(0);
      data.forEach(v => {
        const idx = Math.min(bins - 1, Math.floor(((v - range.min) / (range.max - range.min || 1)) * bins));
        if (idx >= 0) counts[idx]++;
      });
      return counts;
    };
    
    return {
      x: buildHist(xData, xRange),
      y: buildHist(yData, yRange)
    };
  }, [points, xRange, yRange, showHistograms]);

  const quadrantLabels = useMemo(() => {
    if (metricX.id === 'usgEst' && metricY.id === 'tsPct') {
      return { tr: 'Estrellas Eficientes', tl: 'Finalizadores / Rol', br: 'Alto Volumen / Baja Efic.', bl: 'Poco Uso / Defensivos' };
    }
    return null;
  }, [metricX.id, metricY.id]);

  const handleReset = () => {
    setMetricXId('usgEst'); setMetricYId('tsPct'); setMetricSizeId('minutes');
    setPosFilter('all'); setConfFilter('all'); setDivFilter('all'); setTeamFilter('all');
    setQuery(''); setMinGames(5); setMinMpg(15); setMinX(null); setMinY(null);
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls Panel */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center text-orange-400">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Explorador Analítico Avanzado</h2>
              <p className="text-xs text-slate-400">Cruza métricas de toda la liga para encontrar tendencias y excepciones</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
             <div className="relative w-48 sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Resaltar jugador..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>

            <ExportImageButton
              disabled={points.length === 0}
              onBuildImage={async () => {
                const dateSlug = new Date().toISOString().slice(0, 10);
                const filename = `radarnba-scatter-${metricX.id}-vs-${metricY.id}-${dateSlug}.png`;
                const outliers = [...points].sort((a, b) => (b.x + b.y) - (a.x + a.y)).slice(0, 15);
                return buildTableSnapshotBlob({
                  filename,
                  categoryTag: 'ANÁLISIS AVANZADO',
                  title: `${metricY.shortLabel} vs ${metricX.shortLabel}`,
                  subtitle: `Comparativa de ${points.length} jugadores`,
                  entityColumnLabel: 'JUGADOR',
                  entityColumnWeight: 2.3,
                  kpis: [
                    { label: 'FILTRADOS', value: `${points.length}` },
                    { label: `MED. ${metricX.shortLabel}`, value: medianX.toFixed(1), tone: 'accent' },
                    { label: `MED. ${metricY.shortLabel}`, value: medianY.toFixed(1), tone: 'positive' },
                  ],
                  columns: [
                    { key: 'x', label: metricX.shortLabel.toUpperCase(), align: 'right', widthWeight: 1.1 },
                    { key: 'y', label: metricY.shortLabel.toUpperCase(), align: 'right', widthWeight: 1.1 },
                  ],
                  rows: outliers.map((p, idx) => ({
                    rank: idx + 1,
                    teamAbbr: p.teamAbbr,
                    entityName: p.name,
                    entitySubtext: `${p.position} · ${p.item.games.length} PJ`,
                    cells: {
                      x: { text: p.x.toFixed(1), tone: p.x > medianX ? 'positive' : 'neutral' },
                      y: { text: p.y.toFixed(1), tone: p.y > medianY ? 'positive' : 'neutral' },
                    },
                  })),
                });
              }}
            />
            
            <button onClick={handleReset} className="p-1.5 text-slate-400 hover:text-orange-400 transition-colors" title="Reiniciar filtros">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Multi-Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-[#1E293B]">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3 h-3" /> Eje X: {metricX.shortLabel}
            </label>
            <select
              value={metricXId}
              onChange={(e) => setMetricXId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200 focus:outline-none focus:border-orange-500 transition-colors"
            >
              {STREAK_METRIC_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3 h-3" /> Eje Y: {metricY.shortLabel}
            </label>
            <select
              value={metricYId}
              onChange={(e) => setMetricYId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200 focus:outline-none focus:border-orange-500 transition-colors"
            >
              {STREAK_METRIC_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Segmentar por
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={confFilter}
                onChange={(e) => setConfFilter(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200"
              >
                <option value="all">Conferencia: Todas</option>
                <option value="East">Este</option>
                <option value="West">Oeste</option>
              </select>
              <select
                value={posFilter}
                onChange={(e) => setPosFilter(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200"
              >
                <option value="all">Pos: Todas</option>
                <option value="G">G - Bases</option>
                <option value="F">F - Aleros</option>
                <option value="C">C - Pívots</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Trophy className="w-3 h-3" /> Equipo / Div
            </label>
             <div className="grid grid-cols-2 gap-2">
               <select
                 value={divFilter}
                 onChange={(e) => { setDivFilter(e.target.value); setTeamFilter('all'); }}
                 className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200"
               >
                 <option value="all">División: Todas</option>
                 {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
               </select>
               <select
                 value={teamFilter}
                 onChange={(e) => setTeamFilter(e.target.value)}
                 className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200"
               >
                 <option value="all">Equipo: Todos</option>
                 {teams.sort((a,b) => a.abbreviation.localeCompare(b.abbreviation)).map(t => (
                   <option key={t.id} value={t.abbreviation}>{t.abbreviation} - {t.shortName}</option>
                 ))}
               </select>
             </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main Chart Column */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl overflow-hidden relative min-h-[500px]">
            {/* Top X-Histogram */}
            {showHistograms && histograms && (
              <div className="absolute top-0 left-[60px] right-[40px] h-10 flex items-end gap-px pointer-events-none opacity-40">
                {histograms.x.map((count, i) => (
                  <div 
                    key={i} 
                    className="flex-1 bg-orange-500/40 rounded-t-sm" 
                    style={{ height: `${(count / Math.max(...histograms.x)) * 100}%` }} 
                  />
                ))}
              </div>
            )}
            
            {/* Left Y-Histogram */}
            {showHistograms && histograms && (
              <div className="absolute top-[40px] bottom-[60px] left-0 w-10 flex flex-col-reverse gap-px pointer-events-none opacity-40">
                {histograms.y.map((count, i) => (
                  <div 
                    key={i} 
                    className="w-full bg-sky-500/40 rounded-r-sm" 
                    style={{ width: `${(count / Math.max(...histograms.y)) * 100}%`, height: `${100 / histograms.y.length}%` }} 
                  />
                ))}
              </div>
            )}

            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-full select-none"
              onMouseLeave={() => setHoveredPoint(null)}
            >
              {/* Median Lines */}
              <line x1={getX(medianX)} y1={margin.top} x2={getX(medianX)} y2={margin.top + chartH} stroke="#1E293B" strokeWidth="1.5" strokeDasharray="6 4" />
              <line x1={margin.left} y1={getY(medianY)} x2={margin.left + chartW} y2={getY(medianY)} stroke="#1E293B" strokeWidth="1.5" strokeDasharray="6 4" />

              {/* Trend Line */}
              {trend && (
                <line 
                  x1={getX(xRange.min)} 
                  y1={getY(trend.slope * xRange.min + trend.intercept)} 
                  x2={getX(xRange.max)} 
                  y2={getY(trend.slope * xRange.max + trend.intercept)} 
                  stroke="#F97316" 
                  strokeWidth="2" 
                  strokeOpacity="0.4"
                />
              )}

              {/* Quadrant Labels */}
              {quadrantLabels && (
                <g className="opacity-30">
                  <text x={margin.left + 15} y={margin.top + 25} className="text-[11px] fill-slate-400 font-bold uppercase tracking-widest">{quadrantLabels.tl}</text>
                  <text x={margin.left + chartW - 15} y={margin.top + 25} textAnchor="end" className="text-[11px] fill-orange-400 font-bold uppercase tracking-widest">{quadrantLabels.tr}</text>
                  <text x={margin.left + 15} y={margin.top + chartH - 15} className="text-[11px] fill-slate-500 font-bold uppercase tracking-widest">{quadrantLabels.bl}</text>
                  <text x={margin.left + chartW - 15} y={margin.top + chartH - 15} textAnchor="end" className="text-[11px] fill-slate-400 font-bold uppercase tracking-widest">{quadrantLabels.br}</text>
                </g>
              )}

              {/* Axes & Ticks */}
              <g className="text-[10px] fill-slate-500 font-mono">
                {Array.from({ length: 6 }).map((_, i) => {
                  const valX = xRange.min + (i * (xRange.max - xRange.min)) / 5;
                  const valY = yRange.min + (i * (yRange.max - yRange.min)) / 5;
                  return (
                    <g key={i}>
                      <text x={getX(valX)} y={margin.top + chartH + 20} textAnchor="middle">{valX.toFixed(1)}</text>
                      <text x={margin.left - 15} y={getY(valY)} textAnchor="end" dominantBaseline="middle">{valY.toFixed(1)}</text>
                    </g>
                  );
                })}
              </g>

              {/* Data Points */}
              {points.map((p) => {
                const isHovered = hoveredPoint?.id === p.id;
                const isHighlighted = query && p.name.toLowerCase().includes(query.toLowerCase());
                const x = getX(p.x);
                const y = getY(p.y);
                const r = getSize(p.size);

                return (
                  <g
                    key={p.id}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint(p)}
                    onClick={() => onInspectEntity('player', p.id)}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill={isHighlighted ? '#F97316' : '#38BDF8'}
                      fillOpacity={isHovered ? 0.95 : isHighlighted ? 0.8 : 0.25}
                      stroke={isHighlighted ? '#FB923C' : isHovered ? '#7DD3FC' : '#1E293B'}
                      strokeWidth={isHovered ? 2.5 : 0.5}
                      className="transition-all duration-300"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredPoint && (
              <div
                className="absolute pointer-events-none bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 shadow-2xl z-20 w-56 space-y-2"
                style={{
                  left: Math.min(getX(hoveredPoint.x) + 20, chartW + margin.left - 230),
                  top: Math.min(getY(hoveredPoint.y) - 100, chartH + margin.top - 140),
                }}
              >
                <div className="flex items-center gap-3">
                  <PlayerAvatar playerId={hoveredPoint.id} name={hoveredPoint.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-100 truncate">{hoveredPoint.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono uppercase">{hoveredPoint.teamAbbr} · {hoveredPoint.position}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] border-t border-[#1E293B] pt-2 mt-2 font-mono">
                  <div className="text-slate-400 font-sans">{metricX.shortLabel}:</div>
                  <div className="text-right text-slate-100">{hoveredPoint.x.toFixed(1)}{metricX.unit}</div>
                  <div className="text-slate-400 font-sans">{metricY.shortLabel}:</div>
                  <div className="text-right text-slate-100">{hoveredPoint.y.toFixed(1)}{metricY.unit}</div>
                  <div className="text-slate-400 font-sans">{metricSize.shortLabel}:</div>
                  <div className="text-right text-slate-100">{hoveredPoint.size.toFixed(1)}{metricSize.unit}</div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Visualization Toggles */}
          <div className="flex flex-wrap items-center gap-4 bg-[#131C2E] border border-[#1E293B] rounded-xl p-3">
             <label className="flex items-center gap-2 cursor-pointer group">
               <input 
                 type="checkbox" 
                 checked={showTrendLine} 
                 onChange={e => setShowTrendLine(e.target.checked)} 
                 className="w-4 h-4 rounded border-[#1E293B] bg-[#0B1120] accent-orange-500" 
               />
               <span className="text-xs font-medium text-slate-300 group-hover:text-slate-100 transition-colors flex items-center gap-1.5">
                 <TrendingUp className="w-3.5 h-3.5 text-orange-400" /> Línea de Tendencia (Regresión)
               </span>
             </label>
             <label className="flex items-center gap-2 cursor-pointer group">
               <input 
                 type="checkbox" 
                 checked={showHistograms} 
                 onChange={e => setShowHistograms(e.target.checked)} 
                 className="w-4 h-4 rounded border-[#1E293B] bg-[#0B1120] accent-sky-500" 
               />
               <span className="text-xs font-medium text-slate-300 group-hover:text-slate-100 transition-colors flex items-center gap-1.5">
                 <BarChart2 className="w-3.5 h-3.5 text-sky-400" /> Histogramas de Ejes
               </span>
             </label>
             {trend && (
               <div className="ml-auto text-[11px] font-mono text-slate-500">
                 Coeficiente de Correlación (R²): <span className="text-orange-400 font-bold">{trend.r2.toFixed(3)}</span>
               </div>
             )}
          </div>
        </div>

        {/* Sidebar Data List & Advanced Filters */}
        <div className="space-y-4">
          <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-orange-400" />
              TOP Cuadrante Superior ({points.length})
            </h3>
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 no-scrollbar">
              {points
                .sort((a, b) => (b.x + b.y) - (a.x + a.y))
                .slice(0, 15)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onInspectEntity('player', p.id)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#0B1120] border border-transparent hover:border-[#1E293B] transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar playerId={p.id} name={p.name} size="xs" />
                      <div className="text-left min-w-0">
                        <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-orange-400">{p.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono uppercase">{p.teamAbbr} · {p.position}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-mono tabular-nums text-slate-300">{p.y.toFixed(1)}</p>
                      <p className="text-[9px] font-mono tabular-nums text-slate-500">{p.x.toFixed(1)}</p>
                    </div>
                  </button>
                ))}
              {points.length === 0 && <p className="text-xs text-slate-500 text-center py-8">No hay jugadores que cumplan los filtros</p>}
            </div>
          </section>

          <section className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 space-y-4">
             <div className="flex items-center justify-between gap-2 border-b border-orange-500/20 pb-2">
               <h4 className="text-[11px] font-bold text-orange-400 uppercase tracking-widest flex items-center gap-1.5">
                 <Filter className="w-3 h-3" /> Umbrales Mínimos
               </h4>
             </div>
             
             <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">Min. Partidos Jugados:</span>
                    <span className="text-orange-300 font-mono">{minGames} PJ</span>
                  </div>
                  <input type="range" min={1} max={30} value={minGames} onChange={e => setMinGames(Number(e.target.value))} className="w-full accent-orange-500" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">Min. Minutos / Partido:</span>
                    <span className="text-orange-300 font-mono">{minMpg}m</span>
                  </div>
                  <input type="range" min={0} max={40} value={minMpg} onChange={e => setMinMpg(Number(e.target.value))} className="w-full accent-orange-500" />
                </div>

                <div className="space-y-2 pt-2 border-t border-orange-500/10">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">Min. {metricX.shortLabel}:</span>
                    <span className="text-orange-300 font-mono">{minX || 'Desact.'}</span>
                  </div>
                  <input 
                    type="range" 
                    min={xRange.min} 
                    max={xRange.max} 
                    step={0.1}
                    value={minX ?? xRange.min} 
                    onChange={e => setMinX(Number(e.target.value))} 
                    className="w-full accent-orange-500" 
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">Min. {metricY.shortLabel}:</span>
                    <span className="text-orange-300 font-mono">{minY || 'Desact.'}</span>
                  </div>
                  <input 
                    type="range" 
                    min={yRange.min} 
                    max={yRange.max} 
                    step={0.1}
                    value={minY ?? yRange.min} 
                    onChange={e => setMinY(Number(e.target.value))} 
                    className="w-full accent-orange-500" 
                  />
                </div>
             </div>
          </section>
        </div>
      </div>
    </div>
  );
}
