import type { NbaAdvancedBenchmarkStat } from '../types/nba';
import {
  getEntityScaleGp,
  getKpiMeta,
  getKpiNumericValue,
  NBA_KPI_LAYERS,
  type InspectorKpiContext,
  type InspectorNbaKpiDef,
  type InspectorStatScale,
} from '../utils/nbaInspectorAllKpis';
import {
  evaluateReferenceComparison,
  formatMetricNumber,
} from '../utils/playerInspectorAnalytics';
import { MetricInfoTooltip } from './MetricUiHelpers';

interface NbaAggregateDistributionChartProps {
  activeKpi: InspectorNbaKpiDef;
  layerKpis: InspectorNbaKpiDef[];
  ctx: InspectorKpiContext;
  statScale: InspectorStatScale;
  leagueBenchmarks: Record<string, NbaAdvancedBenchmarkStat>;
  onSelectKpiKey: (key: string) => void;
  entityName: string;
}

export function NbaAggregateDistributionChart({
  activeKpi,
  layerKpis,
  ctx,
  statScale,
  leagueBenchmarks,
  onSelectKpiKey,
  entityName,
}: NbaAggregateDistributionChartProps) {
  const disp = activeKpi.getDisplay(ctx);
  const meta = getKpiMeta(activeKpi, statScale);
  const numericVal = getKpiNumericValue(activeKpi, ctx);
  const rawBench = leagueBenchmarks[activeKpi.key];

  let refMean = rawBench ? rawBench.mean : NaN;
  let refSd = rawBench ? rawBench.sd : NaN;
  if (statScale === 'totals' && meta.scalable && rawBench) {
    const scaleGp = getEntityScaleGp(activeKpi, ctx);
    refMean = rawBench.mean * scaleGp;
    refSd = rawBench.sd * scaleGp;
  }

  const ev = evaluateReferenceComparison(
    numericVal ?? 0,
    refMean,
    refSd,
    'nba',
    {
      decimals: meta.decimals,
      suffix: meta.suffix,
      lowerIsBetter: meta.lowerIsBetter,
      signed: meta.signed,
      hasRefData: numericVal !== null && Boolean(rawBench),
    }
  );

  const layerLabel =
    NBA_KPI_LAYERS.find((l) => l.id === activeKpi.layer)?.label || activeKpi.layer;

  // Bell/Sigma SVG track geometry
  const safeSd =
    Number.isFinite(refSd) && refSd > 0
      ? refSd
      : Math.max(0.1, Math.abs(refMean || 1) * 0.2);
  const clampedZ = ev.hasRef && numericVal !== null
    ? Math.max(-2.6, Math.min(2.6, (numericVal - refMean) / safeSd))
    : 0;
  const markerX = 310 + (clampedZ / 2.6) * 240;

  return (
    <div className="space-y-4">
      <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-100">
              <span>{activeKpi.label}</span>
              <MetricInfoTooltip
                helpKey={activeKpi.helpKey}
                fallbackTitle={activeKpi.label}
                align="left"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Capa {layerLabel} · Agregado oficial NBA.com de temporada (comparativa frente a distribución de la liga)
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono tabular-nums">
            <span className="text-xl font-bold text-slate-100">{disp.text}</span>
            {ev.hasRef && (
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border border-[#1E293B] bg-[#131C2E] ${ev.textClass}`}
              >
                {ev.statusLabel} ({ev.deltaFormatted})
              </span>
            )}
          </div>
        </div>

        {/* SVG Sigma Bell / Distribution Gauge */}
        {ev.hasRef && numericVal !== null ? (
          <div className="space-y-1.5">
            <svg viewBox="0 0 620 116" className="w-full h-28 overflow-visible select-none">
              <defs>
                <linearGradient id="nbaBellGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={meta.lowerIsBetter ? '#10B981' : '#F43F5E'} stopOpacity="0.22" />
                  <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.25" />
                  <stop offset="100%" stopColor={meta.lowerIsBetter ? '#F43F5E' : '#10B981'} stopOpacity="0.22" />
                </linearGradient>
              </defs>

              {/* Soft Gaussian Curve */}
              <path
                d="M 50,82 C 135,82 200,22 310,20 C 420,22 485,82 570,82 L 570,84 L 50,84 Z"
                fill="url(#nbaBellGrad)"
              />
              <path
                d="M 50,82 C 135,82 200,22 310,20 C 420,22 485,82 570,82"
                fill="none"
                stroke="#475569"
                strokeWidth="1.5"
              />

              {/* Sigma Vertical Reference Lines */}
              {[
                { z: -2, label: '-2σ' },
                { z: -1, label: '-1σ' },
                { z: 0, label: 'Media NBA' },
                { z: 1, label: '+1σ' },
                { z: 2, label: '+2σ' },
              ].map((tick) => {
                const x = 310 + (tick.z / 2.6) * 240;
                const valAtTick = refMean + tick.z * safeSd;
                return (
                  <g key={tick.label}>
                    <line
                      x1={x}
                      y1={tick.z === 0 ? 14 : 38}
                      x2={x}
                      y2={84}
                      stroke={tick.z === 0 ? '#E2E8F0' : '#334155'}
                      strokeDasharray={tick.z === 0 ? '3 3' : '2 2'}
                      strokeWidth={tick.z === 0 ? 1.5 : 1}
                    />
                    <text
                      x={x}
                      y={97}
                      textAnchor="middle"
                      className={`text-[9.5px] font-mono ${
                        tick.z === 0 ? 'fill-slate-200 font-semibold' : 'fill-slate-500'
                      }`}
                    >
                      {formatMetricNumber(valAtTick, meta.decimals, meta.suffix, meta.signed)}
                    </text>
                    <text
                      x={x}
                      y={110}
                      textAnchor="middle"
                      className="fill-slate-500 text-[8.5px] font-sans"
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}

              {/* Entity Pin Marker */}
              <line
                x1={markerX}
                y1={12}
                x2={markerX}
                y2={84}
                stroke="#F97316"
                strokeWidth="2.4"
              />
              <circle
                cx={markerX}
                cy={48}
                r="6"
                fill="#F97316"
                stroke="#FFFFFF"
                strokeWidth="1.8"
              />
              <text
                x={markerX}
                y={9}
                textAnchor="middle"
                className="fill-orange-300 text-[10px] font-mono font-bold"
              >
                {entityName.split(' ').slice(-1)[0]}: {disp.text}
              </text>
            </svg>
            {disp.subtext && (
              <p className="text-[11px] font-mono text-slate-400 text-center">
                Detalle oficial: {disp.subtext}
              </p>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            Valor actual: <span className="font-mono font-bold text-slate-100">{disp.text}</span>
            {disp.subtext ? ` (${disp.subtext})` : ''}. Sin muestra suficiente de liga para calcular desviación estándar en esta métrica.
          </div>
        )}
      </div>

      {/* Interactive Layer Peer Comparison Bars */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Comparativa de todas las métricas en esta capa (pulsa cualquiera para inspeccionarla):</span>
          <span className="font-mono">{layerKpis.length} KPIs</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
          {layerKpis.map((peer) => {
            const pDisp = peer.getDisplay(ctx);
            const pMeta = getKpiMeta(peer, statScale);
            const pNum = getKpiNumericValue(peer, ctx);
            const pBench = leagueBenchmarks[peer.key];
            let pMean = pBench ? pBench.mean : NaN;
            let pSd = pBench ? pBench.sd : NaN;
            if (statScale === 'totals' && pMeta.scalable && pBench) {
              const gp = getEntityScaleGp(peer, ctx);
              pMean = pBench.mean * gp;
              pSd = pBench.sd * gp;
            }
            const pEv = evaluateReferenceComparison(pNum ?? 0, pMean, pSd, 'nba', {
              decimals: pMeta.decimals,
              suffix: pMeta.suffix,
              lowerIsBetter: pMeta.lowerIsBetter,
              signed: pMeta.signed,
              hasRefData: pNum !== null && Boolean(pBench),
            });
            const isActive = peer.key === activeKpi.key;

            return (
              <button
                key={peer.key}
                type="button"
                onClick={() => onSelectKpiKey(peer.key)}
                className={`text-left p-2.5 rounded-lg border transition-colors space-y-1.5 ${
                  isActive
                    ? 'bg-orange-500/15 border-orange-500/60'
                    : 'bg-[#0B1120] border-[#1E293B] hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className={`truncate font-medium ${isActive ? 'text-orange-300' : 'text-slate-200'}`}>
                    {peer.label}
                  </span>
                  <span className="font-mono font-bold text-slate-100 shrink-0">
                    {pDisp.text}
                  </span>
                </div>
                <div className="relative h-1.5 bg-[#131C2E] border border-[#1E293B] rounded overflow-hidden">
                  <div
                    className={`h-full rounded-l ${pEv.barClass}`}
                    style={{ width: `${pEv.pct}%` }}
                  />
                  <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1.5px] bg-slate-100/75" />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className={pEv.textClass}>
                    {pEv.hasRef ? `${pEv.statusLabel} (${pEv.deltaFormatted})` : 'Sin ref.'}
                  </span>
                  <span>{pEv.hasRef ? `NBA: ${pEv.refFormatted}` : '—'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
