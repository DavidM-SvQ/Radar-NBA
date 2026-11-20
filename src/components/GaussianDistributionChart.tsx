import React, { useMemo, useState } from 'react';
import { ExternalLink, Info, Layers, Sparkles, X } from 'lucide-react';
import { mean, stdDev } from '../utils/analytics';
import {
  formatScatterMetricValue,
  type ScatterMetricDefinition,
} from '../utils/scatterMetricsCatalog';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';

export interface GaussianEntityPoint {
  id: string;
  name: string;
  shortName?: string;
  subtitle: string;
  abbreviation?: string;
  teamAbbr?: string;
  logoUrl?: string;
  primaryColor: string;
  value: number;
  secondaryValue?: number | null;
  secondaryLabel?: string;
  isHighlighted?: boolean;
}

export interface EnrichedGaussianEntity extends GaussianEntityPoint {
  rawZ: number;
  perfZ: number;
  percentile: number;
  zoneId: 'elite_2s' | 'above_1s' | 'core_1s' | 'below_1s' | 'tail_2s';
  zoneLabel: string;
  densityAtValue: number;
}

interface GaussianDistributionChartProps {
  scope: 'teams' | 'players';
  metric: ScatterMetricDefinition;
  entities: GaussianEntityPoint[];
  referenceValues: number[];
  meanScope: 'league' | 'filtered';
  selectedId: string | null;
  hoveredId: string | null;
  onSelectId: (id: string | null) => void;
  onHoverId: (id: string | null) => void;
  onInspectEntity: (id: string) => void;
}

function normalPdf(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function computeSampleSkewness(values: number[], mu: number, sigma: number): number {
  if (values.length < 3 || sigma <= 0) return 0;
  let m3 = 0;
  for (let i = 0; i < values.length; i++) {
    const z = (values[i] - mu) / sigma;
    m3 += z * z * z;
  }
  return m3 / values.length;
}

function classifySigmaZone(
  perfZ: number
): Pick<EnrichedGaussianEntity, 'zoneId' | 'zoneLabel'> {
  if (perfZ >= 2.0) {
    return { zoneId: 'elite_2s', zoneLabel: 'Élite (≥ +2σ)' };
  }
  if (perfZ >= 1.0) {
    return { zoneId: 'above_1s', zoneLabel: 'Por encima (+1σ a +2σ)' };
  }
  if (perfZ > -1.0) {
    return { zoneId: 'core_1s', zoneLabel: 'Núcleo medio (-1σ a +1σ)' };
  }
  if (perfZ > -2.0) {
    return { zoneId: 'below_1s', zoneLabel: 'Por debajo (-1σ a -2σ)' };
  }
  return { zoneId: 'tail_2s', zoneLabel: 'Cola baja (≤ -2σ)' };
}

export function getSigmaZoneTextClass(perfZ: number): string {
  if (perfZ >= 2.0) return 'text-emerald-400';
  if (perfZ >= 1.0) return 'text-sky-400';
  if (perfZ > -1.0) return 'text-slate-300';
  if (perfZ > -2.0) return 'text-amber-400';
  return 'text-rose-400';
}

export function formatSignedZ(z: number): string {
  const rounded = Math.abs(z) < 0.05 ? 0 : z;
  if (rounded > 0) return `+${rounded.toFixed(2)}σ`;
  if (rounded < 0) return `${rounded.toFixed(2)}σ`;
  return '0.00σ';
}

export function GaussianDistributionChart({
  scope,
  metric,
  entities,
  referenceValues,
  meanScope,
  selectedId,
  hoveredId,
  onSelectId,
  onHoverId,
  onInspectEntity,
}: GaussianDistributionChartProps) {
  const [showHistogram, setShowHistogram] = useState(true);
  const [probeX, setProbeX] = useState<number | null>(null);

  const stats = useMemo(() => {
    const validRef = referenceValues.filter(
      (v) => typeof v === 'number' && Number.isFinite(v)
    );
    const fallbackVals =
      validRef.length >= 3 ? validRef : entities.map((e) => e.value);

    if (fallbackVals.length < 3 || entities.length === 0) {
      return null;
    }

    const sortedRef = [...fallbackVals].sort((a, b) => a - b);
    const mu = mean(sortedRef);
    const rawSigma = stdDev(sortedRef);
    const sigma = Math.max(rawSigma, Math.abs(mu) * 0.01, 0.05);
    const mid = Math.floor(sortedRef.length / 2);
    const medianVal =
      sortedRef.length % 2 === 0
        ? (sortedRef[mid - 1] + sortedRef[mid]) / 2
        : sortedRef[mid];
    const skewness = computeSampleSkewness(sortedRef, mu, sigma);

    const entityVals = entities.map((e) => e.value);
    const minData = Math.min(...sortedRef, ...entityVals);
    const maxData = Math.max(...sortedRef, ...entityVals);

    const rawMinBound = Math.min(mu - 3.15 * sigma, minData);
    const minBound = minData >= 0 ? Math.max(0, rawMinBound) : rawMinBound;
    const maxBound = Math.max(mu + 3.15 * sigma, maxData);
    const spanPad = Math.max((maxBound - minBound) * 0.05, sigma * 0.25);
    const domainMin = minData >= 0 ? Math.max(0, minBound - spanPad * 0.35) : minBound - spanPad;
    const domainMax = maxBound + spanPad;
    const domainSpan = Math.max(domainMax - domainMin, 1e-4);

    // Enrich plotted entities with Z-score and empirical percentile
    const enrichedEntities: EnrichedGaussianEntity[] = entities.map((e) => {
      const rawZ = (e.value - mu) / sigma;
      const perfZ = metric.lowerIsBetter ? -rawZ : rawZ;

      let worseCount = 0;
      let eqCount = 0;
      for (let i = 0; i < sortedRef.length; i++) {
        const rv = sortedRef[i];
        if (rv === e.value) eqCount++;
        else if (metric.lowerIsBetter ? rv > e.value : rv < e.value) worseCount++;
      }
      const percentile = Math.max(
        1,
        Math.min(
          99,
          Math.round(((worseCount + 0.5 * eqCount) / sortedRef.length) * 100)
        )
      );
      const zone = classifySigmaZone(perfZ);
      return {
        ...e,
        rawZ,
        perfZ,
        percentile,
        zoneId: zone.zoneId,
        zoneLabel: zone.zoneLabel,
        densityAtValue: normalPdf(e.value, mu, sigma),
      };
    });

    // Histogram bins built from reference cohort
    const binCount = scope === 'teams' ? 12 : 20;
    const binWidth = domainSpan / binCount;
    const bins = Array.from({ length: binCount }, (_, idx) => ({
      x0: domainMin + idx * binWidth,
      x1: domainMin + (idx + 1) * binWidth,
      count: 0,
      density: 0,
    }));
    for (let i = 0; i < sortedRef.length; i++) {
      const idx = Math.min(
        binCount - 1,
        Math.max(0, Math.floor((sortedRef[i] - domainMin) / binWidth))
      );
      bins[idx].count++;
    }
    let maxBinDensity = 0;
    for (const b of bins) {
      b.density = b.count / (sortedRef.length * binWidth);
      if (b.density > maxBinDensity) maxBinDensity = b.density;
    }

    const peakPdf = normalPdf(mu, mu, sigma);
    const maxDensity = Math.max(peakPdf, maxBinDensity * 0.92, 1e-6) * 1.14;

    // Sample smooth curve points
    const samples = 140;
    const curvePoints: Array<{ x: number; density: number }> = [];
    for (let i = 0; i <= samples; i++) {
      const x = domainMin + (domainSpan * i) / samples;
      curvePoints.push({ x, density: normalPdf(x, mu, sigma) });
    }

    // Zone counts across visible entities
    const zoneCounts = {
      elite_2s: 0,
      above_1s: 0,
      core_1s: 0,
      below_1s: 0,
      tail_2s: 0,
    };
    for (const e of enrichedEntities) {
      zoneCounts[e.zoneId]++;
    }

    const sortedByPerf = [...enrichedEntities].sort((a, b) => b.perfZ - a.perfZ);

    return {
      mu,
      sigma,
      rawSigma,
      medianVal,
      skewness,
      minData,
      maxData,
      domainMin,
      domainMax,
      domainSpan,
      maxDensity,
      bins,
      curvePoints,
      enrichedEntities,
      zoneCounts,
      topEntity: sortedByPerf[0] || null,
      refCount: sortedRef.length,
    };
  }, [entities, referenceValues, metric.lowerIsBetter, scope]);

  // SVG Layout constants
  const W = 960;
  const H = 435;
  const padL = 44;
  const padR = 32;
  const padT = 46;
  const curveBottomY = 294;
  const swarmTopY = 310;
  const swarmBottomY = 388;
  const axisY = 398;
  const plotW = W - padL - padR;
  const curveH = curveBottomY - padT;

  const placedSwarmEntities = useMemo(() => {
    if (!stats) return [];
    const scaleX = (val: number) =>
      padL + ((val - stats.domainMin) / stats.domainSpan) * plotW;

    // Deterministic greedy lane packing so markers never overlap heavily
    const numRows = scope === 'teams' ? 4 : 5;
    const minSepPx = scope === 'teams' ? 28 : 9;
    const rowLastX = Array.from({ length: numRows }, () => -1e9);

    const sorted = [...stats.enrichedEntities].sort((a, b) => a.value - b.value);
    return sorted.map((entity) => {
      const px = scaleX(entity.value);
      let chosenRow = 0;
      let bestGap = -1e9;
      for (let r = 0; r < numRows; r++) {
        const gap = px - rowLastX[r];
        if (gap >= minSepPx) {
          chosenRow = r;
          bestGap = gap;
          break;
        }
        if (gap > bestGap) {
          bestGap = gap;
          chosenRow = r;
        }
      }
      rowLastX[chosenRow] = px;
      const laneStep =
        numRows > 1 ? (swarmBottomY - swarmTopY - 18) / (numRows - 1) : 0;
      const py = swarmTopY + 9 + chosenRow * laneStep;
      const curveY =
        curveBottomY - (entity.densityAtValue / stats.maxDensity) * curveH;
      return {
        entity,
        px,
        py,
        curveY,
      };
    });
  }, [stats, scope, plotW, curveH]);

  if (!stats) {
    return (
      <div className="w-full h-[460px] bg-[#0E1626]/40 rounded-lg border border-[#1E293B] flex flex-col items-center justify-center p-6 text-center space-y-2">
        <Layers className="w-8 h-8 text-slate-500" />
        <h4 className="text-sm font-bold text-slate-200">
          Muestra insuficiente para trazar la Campana de Gauss
        </h4>
        <p className="text-xs text-slate-400 max-w-md">
          Se necesitan al menos 3 {scope === 'teams' ? 'franquicias' : 'jugadores'} con datos válidos en{' '}
          <strong className="text-slate-200">{metric.shortLabel}</strong>. Ajusta los filtros para ampliar la muestra.
        </p>
      </div>
    );
  }

  const scaleX = (val: number) =>
    padL + ((val - stats.domainMin) / stats.domainSpan) * plotW;
  const scaleY = (density: number) =>
    curveBottomY - (density / stats.maxDensity) * curveH;

  // Build SVG path strings
  const linePath = stats.curvePoints
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${scaleX(pt.x).toFixed(2)} ${scaleY(pt.density).toFixed(2)}`
    )
    .join(' ');
  const areaPath = `${linePath} L ${scaleX(stats.domainMax).toFixed(2)} ${curveBottomY} L ${scaleX(stats.domainMin).toFixed(2)} ${curveBottomY} Z`;

  // Sigma stop percentages along [domainMin, domainMax]
  const stopPct = (val: number) =>
    `${Math.max(0, Math.min(100, ((val - stats.domainMin) / stats.domainSpan) * 100)).toFixed(2)}%`;

  const sigMinus2 = stats.mu - 2 * stats.sigma;
  const sigMinus1 = stats.mu - stats.sigma;
  const sigPlus1 = stats.mu + stats.sigma;
  const sigPlus2 = stats.mu + 2 * stats.sigma;

  // Color assignment respects metric.lowerIsBetter polarity
  const leftTailColor = metric.lowerIsBetter ? '#10B981' : '#F43F5E'; // Emerald if lower=better, Rose otherwise
  const leftMidColor = metric.lowerIsBetter ? '#38BDF8' : '#F59E0B';
  const centerColor = '#64748B';
  const rightMidColor = metric.lowerIsBetter ? '#F59E0B' : '#38BDF8';
  const rightTailColor = metric.lowerIsBetter ? '#F43F5E' : '#10B981';

  const sigmaMarkers = [
    { k: -2, label: '-2σ', x: sigMinus2, color: leftTailColor },
    { k: -1, label: '-1σ', x: sigMinus1, color: leftMidColor },
    { k: 0, label: 'Media μ', x: stats.mu, color: '#F97316' },
    { k: 1, label: '+1σ', x: sigPlus1, color: rightMidColor },
    { k: 2, label: '+2σ', x: sigPlus2, color: rightTailColor },
  ];

  // Clean X-axis numeric ticks (6 evenly spaced ticks)
  const tickCount = 6;
  const xTicks = Array.from({ length: tickCount }, (_, i) => {
    const v = stats.domainMin + (stats.domainSpan * i) / (tickCount - 1);
    return { val: v, px: scaleX(v) };
  });

  const selectedPlaced = selectedId
    ? placedSwarmEntities.find((p) => p.entity.id === selectedId) || null
    : null;
  const hoveredPlaced = hoveredId
    ? placedSwarmEntities.find((p) => p.entity.id === hoveredId) || null
    : null;
  const activePin = hoveredPlaced || selectedPlaced;

  // Highlighted pins (search matches + #1 leader if nothing pinned)
  const searchPins = placedSwarmEntities
    .filter(
      (p) =>
        p.entity.isHighlighted &&
        p.entity.id !== selectedId &&
        p.entity.id !== hoveredId
    )
    .slice(0, 4);

  const topLeaderPin =
    !selectedPlaced && !hoveredPlaced && searchPins.length === 0 && stats.topEntity
      ? placedSwarmEntities.find((p) => p.entity.id === stats.topEntity?.id) || null
      : null;

  // Probe computation for mouse tracking along empty curve space
  const probeStats =
    probeX !== null && !hoveredPlaced
      ? (() => {
          const rawZ = (probeX - stats.mu) / stats.sigma;
          const perfZ = metric.lowerIsBetter ? -rawZ : rawZ;
          const pct = Math.max(
            1,
            Math.min(
              99,
              Math.round((metric.lowerIsBetter ? 1 - normalCdf(rawZ) : normalCdf(rawZ)) * 100)
            )
          );
          const d = normalPdf(probeX, stats.mu, stats.sigma);
          return {
            x: probeX,
            px: scaleX(probeX),
            py: scaleY(d),
            perfZ,
            pct,
          };
        })()
      : null;

  const skewDesc =
    Math.abs(stats.skewness) < 0.35
      ? 'Distribución simétrica'
      : stats.skewness > 0
        ? 'Sesgo a la derecha (cola alta)'
        : 'Sesgo a la izquierda (cola baja)';

  // Build ordered sigma breakdown cards so Elite is visually clear
  const sigmaCards = metric.lowerIsBetter
    ? [
        {
          id: 'elite',
          title: 'Élite (≤ -2σ)',
          range: `≤ ${formatScatterMetricValue(sigMinus2, metric)}${metric.unit}`,
          count: stats.zoneCounts.elite_2s,
          pctShare: Math.round((stats.zoneCounts.elite_2s / stats.enrichedEntities.length) * 100),
          tone: 'border-emerald-500/30 text-emerald-400',
          sub: 'Mejor cola · Menor es mejor',
        },
        {
          id: 'above',
          title: 'Por encima (-2σ a -1σ)',
          range: `${formatScatterMetricValue(sigMinus2, metric)} – ${formatScatterMetricValue(sigMinus1, metric)}`,
          count: stats.zoneCounts.above_1s,
          pctShare: Math.round((stats.zoneCounts.above_1s / stats.enrichedEntities.length) * 100),
          tone: 'border-sky-500/30 text-sky-400',
          sub: 'Percentil 68–97',
        },
        {
          id: 'core',
          title: 'Núcleo Liga (-1σ a +1σ)',
          range: `${formatScatterMetricValue(sigMinus1, metric)} – ${formatScatterMetricValue(sigPlus1, metric)}`,
          count: stats.zoneCounts.core_1s,
          pctShare: Math.round((stats.zoneCounts.core_1s / stats.enrichedEntities.length) * 100),
          tone: 'border-slate-600/50 text-slate-200',
          sub: 'Zona central (~68%)',
        },
        {
          id: 'below',
          title: 'Por debajo (+1σ a +2σ)',
          range: `${formatScatterMetricValue(sigPlus1, metric)} – ${formatScatterMetricValue(sigPlus2, metric)}`,
          count: stats.zoneCounts.below_1s,
          pctShare: Math.round((stats.zoneCounts.below_1s / stats.enrichedEntities.length) * 100),
          tone: 'border-amber-500/30 text-amber-400',
          sub: 'Percentil 3–16',
        },
        {
          id: 'tail',
          title: 'Cola baja (≥ +2σ)',
          range: `≥ ${formatScatterMetricValue(sigPlus2, metric)}${metric.unit}`,
          count: stats.zoneCounts.tail_2s,
          pctShare: Math.round((stats.zoneCounts.tail_2s / stats.enrichedEntities.length) * 100),
          tone: 'border-rose-500/30 text-rose-400',
          sub: 'Registro más desfavorable',
        },
      ]
    : [
        {
          id: 'tail',
          title: 'Cola baja (≤ -2σ)',
          range: `≤ ${formatScatterMetricValue(sigMinus2, metric)}${metric.unit}`,
          count: stats.zoneCounts.tail_2s,
          pctShare: Math.round((stats.zoneCounts.tail_2s / stats.enrichedEntities.length) * 100),
          tone: 'border-rose-500/30 text-rose-400',
          sub: 'Percentil ≤ 2',
        },
        {
          id: 'below',
          title: 'Por debajo (-2σ a -1σ)',
          range: `${formatScatterMetricValue(sigMinus2, metric)} – ${formatScatterMetricValue(sigMinus1, metric)}`,
          count: stats.zoneCounts.below_1s,
          pctShare: Math.round((stats.zoneCounts.below_1s / stats.enrichedEntities.length) * 100),
          tone: 'border-amber-500/30 text-amber-400',
          sub: 'Percentil 3–16',
        },
        {
          id: 'core',
          title: 'Núcleo Liga (-1σ a +1σ)',
          range: `${formatScatterMetricValue(sigMinus1, metric)} – ${formatScatterMetricValue(sigPlus1, metric)}`,
          count: stats.zoneCounts.core_1s,
          pctShare: Math.round((stats.zoneCounts.core_1s / stats.enrichedEntities.length) * 100),
          tone: 'border-slate-600/50 text-slate-200',
          sub: 'Zona central (~68%)',
        },
        {
          id: 'above',
          title: 'Por encima (+1σ a +2σ)',
          range: `${formatScatterMetricValue(sigPlus1, metric)} – ${formatScatterMetricValue(sigPlus2, metric)}`,
          count: stats.zoneCounts.above_1s,
          pctShare: Math.round((stats.zoneCounts.above_1s / stats.enrichedEntities.length) * 100),
          tone: 'border-sky-500/30 text-sky-400',
          sub: 'Percentil 84–97',
        },
        {
          id: 'elite',
          title: 'Élite (≥ +2σ)',
          range: `≥ ${formatScatterMetricValue(sigPlus2, metric)}${metric.unit}`,
          count: stats.zoneCounts.elite_2s,
          pctShare: Math.round((stats.zoneCounts.elite_2s / stats.enrichedEntities.length) * 100),
          tone: 'border-emerald-500/30 text-emerald-400',
          sub: 'Top ~2.3% en la curva',
        },
      ];

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    if (svgX < padL || svgX > W - padR) {
      setProbeX(null);
      return;
    }
    const val = stats.domainMin + ((svgX - padL) / plotW) * stats.domainSpan;
    setProbeX(val);
  };

  return (
    <div className="space-y-3">
      {/* Compact Statistical Telemetry Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0B1120]/80 border border-[#1E293B] text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300 font-mono tabular-nums text-[11px]">
          <span>
            <span className="text-slate-400 font-sans">Media (μ):</span>{' '}
            <strong className="text-orange-400">
              {formatScatterMetricValue(stats.mu, metric)}
              {metric.unit}
            </strong>
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>
            <span className="text-slate-400 font-sans">Desv. típica (σ):</span>{' '}
            <strong className="text-sky-300">
              ±{formatScatterMetricValue(stats.rawSigma, metric)}
              {metric.unit}
            </strong>
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>
            <span className="text-slate-400 font-sans">Mediana:</span>{' '}
            <strong className="text-slate-200">
              {formatScatterMetricValue(stats.medianVal, metric)}
              {metric.unit}
            </strong>
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="font-sans text-slate-400">
            {skewDesc} ({meanScope === 'filtered' ? `Cohorte n=${stats.refCount}` : `Liga n=${stats.refCount}`})
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowHistogram((prev) => !prev)}
          aria-pressed={showHistogram}
          className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
            showHistogram
              ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
              : 'bg-[#131C2E] border-[#1E293B] text-slate-400 hover:text-slate-200'
          }`}
        >
          {showHistogram ? 'Histograma real: Visible' : 'Histograma real: Oculto'}
        </button>
      </div>

      {/* Selected Entity Pin Banner (if pinned) */}
      {selectedPlaced && (
        <div className="px-3 py-2 bg-[#0B1120] border border-orange-500/40 rounded-lg flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {scope === 'teams' ? (
              <TeamLogo
                abbr={selectedPlaced.entity.abbreviation || 'NBA'}
                teamId={selectedPlaced.entity.id}
                logoUrl={selectedPlaced.entity.logoUrl}
                size="xs"
              />
            ) : (
              <PlayerAvatar
                playerId={selectedPlaced.entity.id}
                name={selectedPlaced.entity.name}
                teamAbbr={selectedPlaced.entity.teamAbbr || 'NBA'}
                size="xs"
              />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className="font-bold text-slate-100 truncate">
                  {selectedPlaced.entity.name}
                </span>
                <span className="text-slate-400">{selectedPlaced.entity.subtitle}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono tabular-nums text-slate-300">
                <span>
                  {metric.shortLabel}:{' '}
                  <strong className="text-orange-400">
                    {formatScatterMetricValue(selectedPlaced.entity.value, metric)}
                    {metric.unit}
                  </strong>
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span>
                  Z-Score:{' '}
                  <strong className={getSigmaZoneTextClass(selectedPlaced.entity.perfZ)}>
                    {formatSignedZ(selectedPlaced.entity.perfZ)}
                  </strong>
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span>
                  Percentil:{' '}
                  <strong className="text-sky-300">
                    P{selectedPlaced.entity.percentile} (Top {Math.max(1, 100 - selectedPlaced.entity.percentile)}%)
                  </strong>
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="font-sans text-slate-400">
                  {selectedPlaced.entity.zoneLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onInspectEntity(selectedPlaced.entity.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-md hover:bg-orange-400 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir ficha</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectId(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              <span>Desmarcar</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Responsive Gaussian SVG Canvas */}
      <div className="relative w-full bg-[#0E1626]/50 border border-[#1E293B] rounded-lg p-2 sm:p-3 overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto max-h-[470px] select-none overflow-visible"
          role="img"
          aria-label={`Campana de Gauss de ${metric.label}`}
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={() => {
            setProbeX(null);
            onHoverId(null);
          }}
          onClick={() => onSelectId(null)}
        >
          <defs>
            <linearGradient id={`gauss-fill-${scope}-${metric.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={leftTailColor} stopOpacity="0.34" />
              <stop offset={stopPct(sigMinus2)} stopColor={leftTailColor} stopOpacity="0.34" />
              <stop offset={stopPct(sigMinus2)} stopColor={leftMidColor} stopOpacity="0.22" />
              <stop offset={stopPct(sigMinus1)} stopColor={leftMidColor} stopOpacity="0.22" />
              <stop offset={stopPct(sigMinus1)} stopColor={centerColor} stopOpacity="0.16" />
              <stop offset={stopPct(sigPlus1)} stopColor={centerColor} stopOpacity="0.16" />
              <stop offset={stopPct(sigPlus1)} stopColor={rightMidColor} stopOpacity="0.24" />
              <stop offset={stopPct(sigPlus2)} stopColor={rightMidColor} stopOpacity="0.24" />
              <stop offset={stopPct(sigPlus2)} stopColor={rightTailColor} stopOpacity="0.38" />
              <stop offset="100%" stopColor={rightTailColor} stopOpacity="0.38" />
            </linearGradient>

            <linearGradient id={`gauss-stroke-${scope}-${metric.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={leftTailColor} />
              <stop offset={stopPct(sigMinus2)} stopColor={leftTailColor} />
              <stop offset={stopPct(sigMinus1)} stopColor={leftMidColor} />
              <stop offset={stopPct(stats.mu)} stopColor="#E2E8F0" />
              <stop offset={stopPct(sigPlus1)} stopColor={rightMidColor} />
              <stop offset={stopPct(sigPlus2)} stopColor={rightTailColor} />
              <stop offset="100%" stopColor={rightTailColor} />
            </linearGradient>
          </defs>

          {/* Subtle horizontal gridlines */}
          {[0.25, 0.5, 0.75, 1.0].map((frac) => {
            const y = curveBottomY - frac * curveH * 0.88;
            return (
              <line
                key={frac}
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="#1E293B"
                strokeDasharray="3 3"
                strokeOpacity={0.6}
              />
            );
          })}

          {/* Empirical Histogram Bars (subtle translucent background behind Gaussian curve) */}
          {showHistogram &&
            stats.bins.map((b, idx) => {
              if (b.count === 0) return null;
              const bx0 = scaleX(b.x0) + 1;
              const bx1 = scaleX(b.x1) - 1;
              const bw = Math.max(2, bx1 - bx0);
              const by = scaleY(b.density);
              const bh = Math.max(0, curveBottomY - by);
              return (
                <rect
                  key={idx}
                  x={bx0}
                  y={by}
                  width={bw}
                  height={bh}
                  rx={2}
                  fill="#38BDF8"
                  fillOpacity={0.14}
                  stroke="#38BDF8"
                  strokeOpacity={0.25}
                  strokeWidth={0.75}
                />
              );
            })}

          {/* Gaussian Curve Shaded Area & Crisp Curve Stroke */}
          <path d={areaPath} fill={`url(#gauss-fill-${scope}-${metric.id})`} />
          <path
            d={linePath}
            fill="none"
            stroke={`url(#gauss-stroke-${scope}-${metric.id})`}
            strokeWidth={2.75}
            strokeLinecap="round"
          />

          {/* Sigma Reference Vertical Lines (-2σ, -1σ, μ, +1σ, +2σ) */}
          {sigmaMarkers.map((m) => {
            if (m.x < stats.domainMin || m.x > stats.domainMax) return null;
            const px = scaleX(m.x);
            const isMean = m.k === 0;
            return (
              <g key={m.k}>
                <line
                  x1={px}
                  x2={px}
                  y1={padT - 8}
                  y2={curveBottomY}
                  stroke={m.color}
                  strokeWidth={isMean ? 1.8 : 1.15}
                  strokeDasharray={isMean ? '5 3' : '3 4'}
                  strokeOpacity={isMean ? 0.9 : 0.65}
                />
                <text
                  x={px}
                  y={padT - 26}
                  textAnchor="middle"
                  fill={m.color}
                  fontSize="10.5"
                  fontWeight={isMean ? '700' : '600'}
                  className="font-mono"
                >
                  {m.label}
                </text>
                <text
                  x={px}
                  y={padT - 13}
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="9.5"
                  className="font-mono tabular-nums"
                >
                  {formatScatterMetricValue(m.x, metric)}
                </text>
              </g>
            );
          })}

          {/* Baseline separating Curve from Swarm Distribution Strip */}
          <line
            x1={padL}
            x2={W - padR}
            y1={curveBottomY}
            y2={curveBottomY}
            stroke="#334155"
            strokeWidth={1.2}
          />

          {/* Swarm Strip Band Background */}
          <rect
            x={padL}
            y={curveBottomY + 1}
            width={plotW}
            height={axisY - curveBottomY - 2}
            fill="#0B1120"
            fillOpacity={0.55}
          />

          {/* Subtle Guide Label for Swarm Strip */}
          <text
            x={padL + 6}
            y={curveBottomY + 13}
            fill="#64748B"
            fontSize="9.5"
            className="font-sans"
          >
            {scope === 'teams'
              ? 'Posición de las franquicias (click para fijar · doble click para ficha)'
              : `Distribución individual (${stats.enrichedEntities.length} jugadores · click para fijar)`}
          </text>

          {/* X-Axis Baseline & Ticks */}
          <line
            x1={padL}
            x2={W - padR}
            y1={axisY}
            y2={axisY}
            stroke="#475569"
            strokeWidth={1}
          />
          {xTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={t.px}
                x2={t.px}
                y1={axisY}
                y2={axisY + 5}
                stroke="#64748B"
                strokeWidth={1}
              />
              <text
                x={t.px}
                y={axisY + 17}
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="10"
                className="font-mono tabular-nums"
              >
                {formatScatterMetricValue(t.val, metric)}
                {metric.unit}
              </text>
            </g>
          ))}
          <text
            x={padL + plotW / 2}
            y={H - 4}
            textAnchor="middle"
            fill="#CBD5E1"
            fontSize="10.5"
            fontWeight="600"
          >
            {metric.label} {metric.lowerIsBetter ? '· Cola izquierda = Élite (menor es mejor)' : '· Cola derecha = Élite'}
          </text>

          {/* Mouse Probe Crosshair along empty curve space */}
          {probeStats && (
            <g className="pointer-events-none">
              <line
                x1={probeStats.px}
                x2={probeStats.px}
                y1={padT}
                y2={curveBottomY}
                stroke="#94A3B8"
                strokeWidth={1}
                strokeDasharray="2 2"
                strokeOpacity={0.5}
              />
              <circle
                cx={probeStats.px}
                cy={probeStats.py}
                r={4}
                fill="#E2E8F0"
                stroke="#0B1120"
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* Plot Entity Markers in Swarm Strip */}
          {placedSwarmEntities.map(({ entity, px, py }) => {
            const isSel = selectedId === entity.id;
            const isHov = hoveredId === entity.id;
            const isSearch = Boolean(entity.isHighlighted);
            const active = isSel || isHov || isSearch;

            if (scope === 'teams') {
              const r = active ? 13 : 10.5;
              const imgSz = (r - 2) * 2;
              return (
                <g
                  key={entity.id}
                  className="cursor-pointer"
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    onHoverId(entity.id);
                  }}
                  onMouseLeave={() => onHoverId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectId(isSel ? null : entity.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onInspectEntity(entity.id);
                  }}
                >
                  <circle
                    cx={px}
                    cy={py}
                    r={r}
                    fill="#0B1120"
                    stroke={
                      isSel
                        ? '#F97316'
                        : isHov
                          ? '#38BDF8'
                          : isSearch
                            ? '#10B981'
                            : entity.primaryColor || '#334155'
                    }
                    strokeWidth={active ? 2.2 : 1.3}
                  />
                  {entity.logoUrl ? (
                    <image
                      href={entity.logoUrl}
                      xlinkHref={entity.logoUrl}
                      x={px - imgSz / 2}
                      y={py - imgSz / 2}
                      width={imgSz}
                      height={imgSz}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  ) : (
                    <text
                      x={px}
                      y={py + 3}
                      textAnchor="middle"
                      fontSize="8"
                      fill="#E2E8F0"
                      className="font-mono font-bold"
                    >
                      {entity.abbreviation}
                    </text>
                  )}
                </g>
              );
            }

            // Players dot swarm
            const r = isSel ? 5.5 : isHov ? 5 : isSearch ? 4.5 : 3.2;
            return (
              <g
                key={entity.id}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  onHoverId(entity.id);
                }}
                onMouseLeave={() => onHoverId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectId(isSel ? null : entity.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onInspectEntity(entity.id);
                }}
              >
                <circle
                  cx={px}
                  cy={py}
                  r={r + 3}
                  fill="transparent"
                />
                <circle
                  cx={px}
                  cy={py}
                  r={r}
                  fill={
                    isSel
                      ? '#F97316'
                      : isHov
                        ? '#38BDF8'
                        : isSearch
                          ? '#10B981'
                          : entity.primaryColor || '#38BDF8'
                  }
                  fillOpacity={active ? 1 : 0.78}
                  stroke={active ? '#FFFFFF' : '#0B1120'}
                  strokeWidth={active ? 1.5 : 0.75}
                />
              </g>
            );
          })}

          {/* Vertical Laser Pins onto the Bell Curve for Search Matches / Top Leader / Selected / Hovered */}
          {searchPins.map((pin) => {
            const nearRight = pin.px > W - padR - 115;
            const nearLeft = pin.px < padL + 115;
            const anchor = nearRight ? 'end' : nearLeft ? 'start' : 'middle';
            const labelX = nearRight ? Math.min(W - padR - 4, pin.px) : nearLeft ? Math.max(padL + 4, pin.px) : pin.px;
            return (
              <g key={`search-pin-${pin.entity.id}`} className="pointer-events-none">
                <line
                  x1={pin.px}
                  x2={pin.px}
                  y1={pin.curveY}
                  y2={pin.py}
                  stroke="#10B981"
                  strokeWidth={1.4}
                  strokeDasharray="3 2"
                  strokeOpacity={0.85}
                />
                <circle
                  cx={pin.px}
                  cy={pin.curveY}
                  r={4.5}
                  fill="#10B981"
                  stroke="#0B1120"
                  strokeWidth={1.5}
                />
                <text
                  x={labelX}
                  y={Math.max(padT + 10, pin.curveY - 9)}
                  textAnchor={anchor}
                  fill="#6EE7B7"
                  fontSize="10"
                  fontWeight="700"
                >
                  {pin.entity.shortName || pin.entity.name} ({formatSignedZ(pin.entity.perfZ)})
                </text>
              </g>
            );
          })}

          {topLeaderPin && (() => {
            const nearRight = topLeaderPin.px > W - padR - 140;
            const nearLeft = topLeaderPin.px < padL + 140;
            const anchor = nearRight ? 'end' : nearLeft ? 'start' : 'middle';
            const labelX = nearRight
              ? Math.min(W - padR - 4, topLeaderPin.px + 8)
              : nearLeft
                ? Math.max(padL + 4, topLeaderPin.px - 8)
                : topLeaderPin.px;
            return (
              <g className="pointer-events-none">
                <line
                  x1={topLeaderPin.px}
                  x2={topLeaderPin.px}
                  y1={topLeaderPin.curveY}
                  y2={topLeaderPin.py}
                  stroke="#10B981"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  strokeOpacity={0.75}
                />
                <circle
                  cx={topLeaderPin.px}
                  cy={topLeaderPin.curveY}
                  r={5}
                  fill="#10B981"
                  stroke="#0B1120"
                  strokeWidth={1.5}
                />
                <text
                  x={labelX}
                  y={Math.max(padT + 12, topLeaderPin.curveY - 10)}
                  textAnchor={anchor}
                  fill="#34D399"
                  fontSize="10"
                  fontWeight="700"
                >
                  Líder: {topLeaderPin.entity.shortName || topLeaderPin.entity.name} · {formatSignedZ(topLeaderPin.entity.perfZ)}
                </text>
              </g>
            );
          })()}

          {selectedPlaced && (
            <g className="pointer-events-none">
              <line
                x1={selectedPlaced.px}
                x2={selectedPlaced.px}
                y1={selectedPlaced.curveY}
                y2={selectedPlaced.py}
                stroke="#F97316"
                strokeWidth={2.2}
              />
              <circle
                cx={selectedPlaced.px}
                cy={selectedPlaced.curveY}
                r={6}
                fill="#F97316"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
              <g
                transform={`translate(${Math.min(W - padR - 86, Math.max(padL + 86, selectedPlaced.px))}, ${Math.max(padT + 14, selectedPlaced.curveY - 22)})`}
              >
                <rect
                  x={-82}
                  y={-12}
                  width={164}
                  height={20}
                  rx={4}
                  fill="#0B1120"
                  stroke="#F97316"
                  strokeWidth={1.2}
                />
                <text
                  x={0}
                  y={2}
                  textAnchor="middle"
                  fill="#FDBA74"
                  fontSize="10"
                  fontWeight="700"
                  className="font-mono tabular-nums"
                >
                  {selectedPlaced.entity.abbreviation || selectedPlaced.entity.shortName || selectedPlaced.entity.name.split(' ').slice(-1)[0]} · {formatScatterMetricValue(selectedPlaced.entity.value, metric)}{metric.unit} ({formatSignedZ(selectedPlaced.entity.perfZ)})
                </text>
              </g>
            </g>
          )}

          {hoveredPlaced && hoveredPlaced.entity.id !== selectedId && (
            <g className="pointer-events-none">
              <line
                x1={hoveredPlaced.px}
                x2={hoveredPlaced.px}
                y1={hoveredPlaced.curveY}
                y2={hoveredPlaced.py}
                stroke="#38BDF8"
                strokeWidth={2}
              />
              <circle
                cx={hoveredPlaced.px}
                cy={hoveredPlaced.curveY}
                r={5.5}
                fill="#38BDF8"
                stroke="#FFFFFF"
                strokeWidth={1.8}
              />
            </g>
          )}
        </svg>

        {/* Floating Tooltip Overlay for Hovered Entity or Probe */}
        {activePin && hoveredPlaced ? (
          <div
            className="pointer-events-none absolute top-3 right-3 z-20 w-64 bg-[#0B1120]/95 border border-sky-500/40 rounded-lg p-3 shadow-2xl space-y-2 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2.5">
              {scope === 'teams' ? (
                <TeamLogo
                  abbr={activePin.entity.abbreviation || 'NBA'}
                  teamId={activePin.entity.id}
                  logoUrl={activePin.entity.logoUrl}
                  size="sm"
                />
              ) : (
                <PlayerAvatar
                  playerId={activePin.entity.id}
                  name={activePin.entity.name}
                  teamAbbr={activePin.entity.teamAbbr || 'NBA'}
                  size="sm"
                />
              )}
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-100 truncate">
                  {activePin.entity.name}
                </h4>
                <p className="text-[10px] text-slate-400 truncate">
                  {activePin.entity.subtitle}
                </p>
              </div>
            </div>
            <div className="space-y-1 pt-1.5 border-t border-[#1E293B] text-[11px] font-mono tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">{metric.shortLabel}:</span>
                <span className="font-bold text-orange-400">
                  {formatScatterMetricValue(activePin.entity.value, metric)}
                  {metric.unit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Z-Score rendimiento:</span>
                <span className={`font-bold ${getSigmaZoneTextClass(activePin.entity.perfZ)}`}>
                  {formatSignedZ(activePin.entity.perfZ)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Percentil en cohorte:</span>
                <span className="font-bold text-sky-300">
                  P{activePin.entity.percentile} (Top {Math.max(1, 100 - activePin.entity.percentile)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Diferencia vs μ:</span>
                <span className="text-slate-200">
                  {activePin.entity.value - stats.mu >= 0 ? '+' : ''}
                  {formatScatterMetricValue(activePin.entity.value - stats.mu, metric)}
                  {metric.unit}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-orange-400 text-center pt-1 border-t border-[#1E293B]/60">
              Click para fijar · Doble click para abrir ficha
            </p>
          </div>
        ) : probeStats ? (
          <div className="pointer-events-none absolute top-3 right-3 z-20 bg-[#0B1120]/90 border border-[#1E293B] rounded-lg px-3 py-2 text-[11px] font-mono tabular-nums space-y-0.5">
            <div className="text-slate-300 font-sans text-[10px] font-semibold flex items-center gap-1">
              <Info className="w-3 h-3 text-sky-400" />
              Lectura teórica en curva
            </div>
            <div className="text-slate-200">
              Valor:{' '}
              <strong className="text-orange-300">
                {formatScatterMetricValue(probeStats.x, metric)}
                {metric.unit}
              </strong>
            </div>
            <div className="text-slate-400">
              Z: <span className={getSigmaZoneTextClass(probeStats.perfZ)}>{formatSignedZ(probeStats.perfZ)}</span> · P{probeStats.pct} teórico
            </div>
          </div>
        ) : null}
      </div>

      {/* Sigma Zone Breakdown Cards (5 Standard Deviation Brackets) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-[11px]">
        {sigmaCards.map((card) => (
          <div
            key={card.id}
            className={`bg-[#0B1120]/70 border rounded-md p-2.5 space-y-0.5 ${card.tone}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide truncate">
                {card.title}
              </span>
              <span className="font-mono tabular-nums text-[11px] font-bold shrink-0">
                {card.count}
              </span>
            </div>
            <p className="font-mono tabular-nums text-[11px] text-slate-200 truncate">
              {card.range}
            </p>
            <p className="text-[10px] text-slate-400 truncate">
              {card.sub} · {card.pctShare}% de muestra
            </p>
          </div>
        ))}
      </div>

      {/* Didactic Explanation Footer Note */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1 border-t border-[#1E293B]/70">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          En una distribución normal estándar, el ~68.2% cae entre -1σ y +1σ, el ~95.4% entre -2σ y +2σ, y superar ±2σ señala registros estadísticos excepcionales.
        </span>
      </div>
    </div>
  );
}
