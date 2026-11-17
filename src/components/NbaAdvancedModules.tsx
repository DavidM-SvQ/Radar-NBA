import { useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Flame,
  Gauge,
  PieChart,
  Scale,
  Shield,
  Target,
  Zap,
} from 'lucide-react';
import type {
  NbaAdvancedBenchmarkStat,
  NbaClutchEntry,
  NbaDefenseHustleEntry,
  NbaFourFactorsEntry,
  NbaOnOffSplitEntry,
  NbaPlaytypeEntitySummary,
  NbaScoringSplitsEntry,
  NbaShotZonesEntry,
  NbaTrackingEntry,
  NbaViolationsEntry,
  ShotZoneMetric,
} from '../types/nba';
import { formatSigned } from '../utils/analytics';
import { evaluateReferenceComparison } from '../utils/playerInspectorAnalytics';
import { MetricInfoTooltip } from './MetricUiHelpers';
import { LayerColumnCustomizer } from './LayerColumnCustomizer';

function getZoneColor(zoneName: string, pct: number): { bg: string; text: string; ring: string } {
  let avg = 40;
  if (zoneName === 'restrictedArea') avg = 66.0;
  else if (zoneName === 'paintNonRa') avg = 43.5;
  else if (zoneName === 'midRange') avg = 42.0;
  else if (zoneName === 'corner3') avg = 38.5;
  else if (zoneName === 'aboveBreak3') avg = 35.8;

  const diff = pct - avg;
  if (diff >= 4.0) return { bg: 'bg-emerald-950/40', text: 'text-emerald-400', ring: 'border-emerald-500/40' };
  if (diff >= 1.0) return { bg: 'bg-emerald-900/20', text: 'text-emerald-300', ring: 'border-emerald-600/30' };
  if (diff >= -2.0) return { bg: 'bg-amber-950/30', text: 'text-amber-300', ring: 'border-amber-500/30' };
  if (diff >= -5.0) return { bg: 'bg-rose-950/30', text: 'text-rose-300', ring: 'border-rose-500/30' };
  return { bg: 'bg-rose-950/50', text: 'text-rose-400', ring: 'border-rose-500/50' };
}

function usePersistentModuleKeys(storageKey: string, validKeys: string[], defaultKeys: string[]) {
  const [keys, setKeys] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaultKeys;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return defaultKeys;
      const validSet = new Set(validKeys);
      const filtered = parsed.map(String).filter((k) => validSet.has(k));
      return filtered.length > 0 ? filtered : defaultKeys;
    } catch {
      return defaultKeys;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(keys));
    } catch {
      // ignore
    }
  }, [storageKey, keys]);

  return [keys, setKeys] as const;
}

interface StatCardDef<T> {
  key: string;
  label: string;
  sublabel?: (d: T) => string;
  value: (d: T) => string;
  toneClass?: (d: T) => string;
  benchKey?: string;
  numeric?: (d: T) => number | null | undefined;
  decimals?: number;
  suffix?: string;
  signed?: boolean;
  lowerIsBetter?: boolean;
  scaleBenchByGp?: (d: T) => number;
}

function ModuleBenchmarkBar<T>({
  card,
  data,
  leagueBenchmarks,
}: {
  card: StatCardDef<T>;
  data: T;
  leagueBenchmarks?: Record<string, NbaAdvancedBenchmarkStat>;
}) {
  if (!card.benchKey || !leagueBenchmarks) return null;
  const rawBench = leagueBenchmarks[card.benchKey];
  const rawVal = card.numeric ? card.numeric(data) : null;
  if (!rawBench || rawVal === null || rawVal === undefined || !Number.isFinite(rawVal)) {
    return null;
  }
  const gpMult = card.scaleBenchByGp ? Math.max(1, card.scaleBenchByGp(data) || 1) : 1;
  const refMean = rawBench.mean * gpMult;
  const refSd = rawBench.sd * gpMult;

  const ev = evaluateReferenceComparison(rawVal, refMean, refSd, 'nba', {
    decimals: card.decimals ?? 1,
    suffix: card.suffix ?? '',
    signed: card.signed ?? false,
    lowerIsBetter: card.lowerIsBetter ?? false,
    hasRefData: true,
  });

  if (!ev.hasRef) return null;

  return (
    <div className="w-full pt-2 mt-1.5 border-t border-[#1E293B]/70 font-sans">
      <div className="flex items-center justify-between gap-1.5 text-[10px] mb-1 whitespace-nowrap">
        <span className={`font-medium truncate ${ev.textClass}`}>
          {ev.statusLabel} ({ev.deltaFormatted})
        </span>
        <span className="font-mono tabular-nums text-slate-400 shrink-0">
          Media NBA: {ev.refFormatted}
        </span>
      </div>
      <div className="relative h-1.5 bg-[#131C2E] border border-[#1E293B] rounded overflow-hidden">
        <div
          className={`h-full rounded-l transition-transform duration-150 ${ev.barClass}`}
          style={{ width: `${ev.pct}%` }}
        />
        <div
          title={`Media NBA: ${ev.refFormatted}`}
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-slate-100/80"
        />
      </div>
    </div>
  );
}

interface ShotZonesCourtPanelProps {
  zones: NbaShotZonesEntry;
  title?: string;
  subtitle?: string;
}

export function ShotZonesCourtPanel({ zones, title, subtitle }: ShotZonesCourtPanelProps) {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const zoneCards: Array<{
    id: string;
    label: string;
    shortLabel: string;
    metric: ShotZoneMetric;
    desc: string;
  }> = [
    {
      id: 'restrictedArea',
      label: 'Bajo el Aro (Restricted Area)',
      shortLabel: 'Bajo Aro (0-4 ft)',
      metric: zones.restrictedArea,
      desc: 'Tiros a menos de 1.2 m del aro, bandejas y mates.',
    },
    {
      id: 'paintNonRa',
      label: 'Pintura Fuera de Zona Restringida',
      shortLabel: 'Pintura Flotadores (4-14 ft)',
      metric: zones.paintNonRa,
      desc: 'Flotadores, ganchos y suspensiones cortas.',
    },
    {
      id: 'midRange',
      label: 'Media Distancia (Mid-Range)',
      shortLabel: 'Media Distancia (14-22 ft)',
      metric: zones.midRange,
      desc: 'Suspensiones tras bote y bloqueos directos.',
    },
    {
      id: 'leftCorner3',
      label: 'Triple Esquina Izquierda',
      shortLabel: 'Triple Esq. Izq',
      metric: zones.leftCorner3,
      desc: 'Tiro de 3 puntos más cercano al aro (6.70 m).',
    },
    {
      id: 'rightCorner3',
      label: 'Triple Esquina Derecha',
      shortLabel: 'Triple Esq. Der',
      metric: zones.rightCorner3,
      desc: 'Triple desde el rincón derecho de la cancha.',
    },
    {
      id: 'aboveBreak3',
      label: 'Triple Frontal y Cabecera',
      shortLabel: 'Triple Cabecera (Above Break)',
      metric: zones.aboveBreak3,
      desc: 'Lanzamientos de 7.24 m desde las alas y cabecera.',
    },
  ];

  return (
    <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Target className="w-4 h-4 text-orange-400 shrink-0" />
            <span>{title || 'Mapa de Tiro por Zonas Oficiales NBA.com'}</span>
            <MetricInfoTooltip helpKey="restrictedArea" />
          </h3>
          <p className="text-xs text-slate-400">
            {subtitle || 'Volumen y acierto desglosado por las 6 demarcaciones analíticas oficiales'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-[#0B1120] border border-[#1E293B] px-3 py-1.5 rounded-lg text-xs font-mono">
            <span className="text-slate-400 mr-1.5 font-sans font-medium">Aro:</span>
            <span className="text-slate-100 font-bold tabular-nums">
              {zones.rimFgPct.toFixed(1)}%
            </span>
            <span className="text-slate-500 text-[11px] ml-1">
              ({zones.totalRimFga.toFixed(1)}/PJ{zones.totalRimFgaTotal !== undefined ? ` · ${zones.totalRimFgaTotal} tot.` : ''})
            </span>
          </div>
          <div className="bg-[#0B1120] border border-[#1E293B] px-3 py-1.5 rounded-lg text-xs font-mono">
            <span className="text-slate-400 mr-1.5 font-sans font-medium">T3 Total:</span>
            <span className="text-orange-400 font-bold tabular-nums">
              {zones.threeFgPct.toFixed(1)}%
            </span>
            <span className="text-slate-500 text-[11px] ml-1">
              ({zones.totalThreeFga.toFixed(1)}/PJ{zones.totalThreeFgaTotal !== undefined ? ` · ${zones.totalThreeFgaTotal} tot.` : ''})
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        <div className="lg:col-span-6 bg-[#0B1120] rounded-xl border border-[#1E293B] p-4 flex flex-col items-center">
          <div className="w-full max-w-[380px] aspect-[50/47] relative border-b-2 border-slate-700/60 bg-[#0c1424] rounded-t-2xl overflow-hidden shadow-inner">
            <svg
              viewBox="0 0 500 470"
              className="w-full h-full text-slate-600/40"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
            >
              <rect x="5" y="5" width="490" height="460" strokeWidth="4" />
              <rect x="170" y="5" width="160" height="190" />
              <circle cx="250" cy="190" r="60" />
              <path d="M 210,5 A 40,40 0 0,0 290,5" strokeWidth="3" />
              <line x1="220" y1="40" x2="280" y2="40" stroke="#F97316" strokeWidth="4" />
              <circle cx="250" cy="52" r="12" stroke="#F97316" strokeWidth="3" fill="#F97316" fillOpacity="0.2" />
              <path d="M 30,5 L 30,140 A 237.5,237.5 0 0,0 470,140 L 470,5" strokeWidth="3" />
            </svg>

            <button
              type="button"
              onClick={() => setSelectedZone('restrictedArea')}
              className={`absolute top-[6%] left-1/2 -translate-x-1/2 min-w-[74px] py-1 px-2 rounded-lg text-center transition-all border ${
                selectedZone === 'restrictedArea'
                  ? 'ring-2 ring-orange-500 scale-105 bg-orange-950/90'
                  : 'bg-[#131C2E]/92 hover:bg-[#1A263D]'
              } border-slate-700 text-[10px] font-mono z-10`}
            >
              <div className="text-[9px] text-slate-400 uppercase font-sans font-bold leading-tight">Aro</div>
              <div className="font-bold text-slate-100 tabular-nums leading-tight">
                {zones.restrictedArea.fgPct.toFixed(1)}%
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedZone('paintNonRa')}
              className={`absolute top-[25%] left-1/2 -translate-x-1/2 min-w-[86px] py-1 px-2.5 rounded-lg text-center transition-all border ${
                selectedZone === 'paintNonRa'
                  ? 'ring-2 ring-orange-500 scale-105 bg-orange-950/90'
                  : 'bg-[#131C2E]/92 hover:bg-[#1A263D]'
              } border-slate-700 text-[10px] font-mono z-10`}
            >
              <div className="text-[9px] text-slate-400 uppercase font-sans font-bold leading-tight">Pintura</div>
              <div className="font-bold text-slate-100 tabular-nums leading-tight">
                {zones.paintNonRa.fgPct.toFixed(1)}%
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedZone('leftCorner3')}
              className={`absolute top-[9%] left-[2.5%] w-[21%] min-w-[66px] py-1 px-1.5 rounded-lg text-center transition-all border ${
                selectedZone === 'leftCorner3'
                  ? 'ring-2 ring-orange-500 scale-105 bg-orange-950/90'
                  : 'bg-[#131C2E]/92 hover:bg-[#1A263D]'
              } border-slate-700 text-[10px] font-mono z-10`}
            >
              <div className="text-[8px] text-slate-400 uppercase font-sans font-bold leading-tight">Esq Izq</div>
              <div className="font-bold text-slate-100 tabular-nums leading-tight">
                {zones.leftCorner3.fgPct.toFixed(1)}%
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedZone('rightCorner3')}
              className={`absolute top-[9%] right-[2.5%] w-[21%] min-w-[66px] py-1 px-1.5 rounded-lg text-center transition-all border ${
                selectedZone === 'rightCorner3'
                  ? 'ring-2 ring-orange-500 scale-105 bg-orange-950/90'
                  : 'bg-[#131C2E]/92 hover:bg-[#1A263D]'
              } border-slate-700 text-[10px] font-mono z-10`}
            >
              <div className="text-[8px] text-slate-400 uppercase font-sans font-bold leading-tight">Esq Der</div>
              <div className="font-bold text-slate-100 tabular-nums leading-tight">
                {zones.rightCorner3.fgPct.toFixed(1)}%
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedZone('midRange')}
              className={`absolute top-[45%] left-1/2 -translate-x-1/2 min-w-[116px] py-1 px-2.5 rounded-lg text-center transition-all border ${
                selectedZone === 'midRange'
                  ? 'ring-2 ring-orange-500 scale-105 bg-orange-950/90'
                  : 'bg-[#131C2E]/92 hover:bg-[#1A263D]'
              } border-slate-700 text-[10px] font-mono z-10`}
            >
              <div className="text-[9px] text-slate-400 uppercase font-sans font-bold leading-tight">Media Distancia</div>
              <div className="font-bold text-slate-100 tabular-nums leading-tight">
                {zones.midRange.fgPct.toFixed(1)}%
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedZone('aboveBreak3')}
              className={`absolute top-[74%] left-1/2 -translate-x-1/2 min-w-[152px] py-1.5 px-3 rounded-lg text-center transition-all border ${
                selectedZone === 'aboveBreak3'
                  ? 'ring-2 ring-orange-500 scale-105 bg-orange-950/90'
                  : 'bg-[#131C2E]/92 hover:bg-[#1A263D]'
              } border-slate-700 text-[10px] font-mono z-10`}
            >
              <div className="text-[9px] text-slate-400 uppercase font-sans font-bold leading-tight">Triple Cabecera / Alas</div>
              <div className="font-bold text-slate-100 tabular-nums leading-tight">
                {zones.aboveBreak3.fgPct.toFixed(1)}%
              </div>
            </button>
          </div>
          <span className="text-[11px] text-slate-500 mt-2 font-medium">
            Pulsa en cualquier demarcación para filtrar detalles
          </span>
        </div>

        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {zoneCards.map((card) => {
            const colors = getZoneColor(card.id, card.metric.fgPct);
            const isSelected = selectedZone === card.id;
            return (
              <div
                key={card.id}
                onClick={() => setSelectedZone(isSelected ? null : card.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${colors.bg} ${colors.ring} ${
                  isSelected ? 'ring-2 ring-orange-500 shadow-md' : 'hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-semibold text-slate-200 truncate">
                    {card.shortLabel}
                  </span>
                  <span className={`text-xs font-mono font-bold tabular-nums ${colors.text}`}>
                    {card.metric.fgPct.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Por partido / Total:</span>
                  <span className="font-semibold text-slate-300 tabular-nums">
                    {card.metric.fgm.toFixed(1)}/{card.metric.fga.toFixed(1)} PJ
                    {card.metric.fgmTotal !== undefined && card.metric.fgaTotal !== undefined
                      ? ` · ${card.metric.fgmTotal}/${card.metric.fgaTotal}`
                      : ''}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{card.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface PlaytypesPanelProps {
  playtypes: NbaPlaytypeEntitySummary;
  entityName: string;
  entityType: 'team' | 'player';
}

export function PlaytypesPanel({ playtypes, entityName }: PlaytypesPanelProps) {
  const [activeTab, setActiveTab] = useState<'offensive' | 'defensive'>('offensive');
  const rows = activeTab === 'offensive' ? playtypes.offensive : playtypes.defensive;

  return (
    <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-400 shrink-0" />
            <span>Synergy Playtypes NBA.com ({activeTab === 'offensive' ? 'Ataque' : 'Defensa'})</span>
            <MetricInfoTooltip helpKey="ppp" />
          </h3>
          <p className="text-xs text-slate-400">
            Frecuencia táctica, eficiencia de posesión (PPP) y percentiles oficiales de {entityName}
          </p>
        </div>

        <div className="flex items-center bg-[#0B1120] p-1 rounded-lg border border-[#1E293B]">
          <button
            type="button"
            onClick={() => setActiveTab('offensive')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'offensive'
                ? 'bg-orange-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ataque (Ofensiva)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('defensive')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'defensive'
                ? 'bg-orange-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Defensa
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">
          No hay datos de jugadas registradas para esta selección.
        </div>
      ) : (
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1E293B] text-[11px] text-slate-400 uppercase font-mono">
                <th className="py-2.5 px-3">Tipo de Jugada</th>
                <th className="py-2.5 px-3 text-right">Frecuencia %</th>
                <th className="py-2.5 px-3 text-right">PPP (Pts/Pos)</th>
                <th className="py-2.5 px-3 text-right">Percentil</th>
                <th className="py-2.5 px-3 text-right">eFG%</th>
                <th className="py-2.5 px-3 text-right">Falta %</th>
                <th className="py-2.5 px-3 text-right">Pérdida %</th>
                <th className="py-2.5 px-3 text-right">Posesiones</th>
                <th className="py-2.5 px-3 text-right">Pts Totales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] font-mono tabular-nums">
              {rows.map((row) => {
                const isHighPct = row.percentile >= 75;
                const isLowPct = row.percentile <= 25;
                return (
                  <tr key={row.playType} className="hover:bg-[#182338] transition-colors">
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-200 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500/80 shrink-0" />
                      <span>{row.playTypeLabelEs}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({row.playType})</span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300 font-semibold">
                      {row.possPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-orange-400">
                      {row.ppp.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          isHighPct
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isLowPct
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        P{Math.round(row.percentile)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {row.efgPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      {row.ftPossPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      {row.tovPossPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {row.poss}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-100">
                      {row.pts}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CLUTCH_CARDS: StatCardDef<NbaClutchEntry>[] = [
  { key: 'netRtg', label: 'NetRtg Clutch', value: (c) => formatSigned(c.netRtg), toneClass: (c) => (c.netRtg >= 0 ? 'text-emerald-400' : 'text-rose-400'), benchKey: 'cl_netRtg', numeric: (c) => c.netRtg, decimals: 1, signed: true },
  { key: 'offRtg', label: 'OffRtg Clutch', value: (c) => c.offRtg.toFixed(1), benchKey: 'cl_offRtg', numeric: (c) => c.offRtg, decimals: 1 },
  { key: 'defRtg', label: 'DefRtg Clutch', value: (c) => c.defRtg.toFixed(1), benchKey: 'cl_defRtg', numeric: (c) => c.defRtg, decimals: 1, lowerIsBetter: true },
  { key: 'pts', label: 'Puntos Clutch', value: (c) => c.pts.toFixed(1), benchKey: 'cl_pts', numeric: (c) => c.pts, decimals: 1 },
  { key: 'min', label: 'Minutos Clutch', value: (c) => c.min.toFixed(1), sublabel: (c) => `${c.gp} PJ`, benchKey: 'cl_min', numeric: (c) => c.min, decimals: 1 },
  { key: 'fgPct', label: 'FG% Clutch', value: (c) => `${c.fgPct.toFixed(1)}%`, toneClass: () => 'text-orange-400', sublabel: (c) => `${c.fgm.toFixed(1)}/${c.fga.toFixed(1)}`, benchKey: 'cl_fgPct', numeric: (c) => c.fgPct, decimals: 1, suffix: '%' },
  { key: 'fg3Pct', label: '3P% Clutch', value: (c) => `${c.fg3Pct.toFixed(1)}%`, sublabel: (c) => `${c.fg3m.toFixed(1)}/${c.fg3a.toFixed(1)}`, benchKey: 'cl_fg3Pct', numeric: (c) => c.fg3Pct, decimals: 1, suffix: '%' },
  { key: 'ftPct', label: 'FT% Clutch', value: (c) => `${c.ftPct.toFixed(1)}%`, sublabel: (c) => `${c.ftm.toFixed(1)}/${c.fta.toFixed(1)}`, benchKey: 'cl_ftPct', numeric: (c) => c.ftPct, decimals: 1, suffix: '%' },
  { key: 'tsPct', label: 'TS% Clutch', value: (c) => `${c.tsPct.toFixed(1)}%`, benchKey: 'cl_tsPct', numeric: (c) => c.tsPct, decimals: 1, suffix: '%' },
  { key: 'efgPct', label: 'eFG% Clutch', value: (c) => `${c.efgPct.toFixed(1)}%`, benchKey: 'cl_efgPct', numeric: (c) => c.efgPct, decimals: 1, suffix: '%' },
  { key: 'usgPct', label: 'USG% Clutch', value: (c) => `${c.usgPct.toFixed(1)}%`, benchKey: 'cl_usgPct', numeric: (c) => c.usgPct, decimals: 1, suffix: '%' },
  { key: 'pie', label: 'PIE% Clutch', value: (c) => `${c.pie.toFixed(1)}%`, benchKey: 'cl_pie', numeric: (c) => c.pie, decimals: 1, suffix: '%' },
  { key: 'reb', label: 'Rebotes Clutch', value: (c) => c.reb.toFixed(1), benchKey: 'cl_rebAst', numeric: (c) => c.reb, decimals: 1 },
  { key: 'ast', label: 'Asistencias Clutch', value: (c) => c.ast.toFixed(1), benchKey: 'cl_ast', numeric: (c) => c.ast, decimals: 1 },
  { key: 'stl', label: 'Robos Clutch', value: (c) => c.stl.toFixed(1), benchKey: 'cl_stl', numeric: (c) => c.stl, decimals: 2 },
  { key: 'blk', label: 'Tapones Clutch', value: (c) => c.blk.toFixed(1), benchKey: 'cl_blk', numeric: (c) => c.blk, decimals: 2 },
  { key: 'tov', label: 'Pérdidas Clutch', value: (c) => c.tov.toFixed(1), benchKey: 'cl_tov', numeric: (c) => c.tov, decimals: 2, lowerIsBetter: true },
  { key: 'plusMinus', label: '+/- Clutch', value: (c) => formatSigned(c.plusMinus), toneClass: (c) => (c.plusMinus >= 0 ? 'text-emerald-400' : 'text-rose-400'), benchKey: 'cl_plusMinus', numeric: (c) => c.plusMinus, decimals: 1, signed: true },
];

const DEFAULT_CLUTCH_KEYS = ['netRtg', 'pts', 'fgPct', 'fg3Pct', 'ftPct', 'plusMinus', 'tsPct', 'usgPct', 'ast', 'reb', 'tov', 'pie'];

const DEF_HUSTLE_CARDS: StatCardDef<NbaDefenseHustleEntry>[] = [
  { key: 'dFgPct', label: 'DFG% (Acierto Rival)', value: (d) => `${d.dFgPct.toFixed(1)}%`, sublabel: (d) => `${formatSigned(d.pctPlusMinus)}% vs Media (${d.normalFgPct.toFixed(1)}%)`, benchKey: 'def_dFgPct', numeric: (d) => (d.dFgPct > 0 ? d.dFgPct : null), decimals: 1, suffix: '%', lowerIsBetter: true },
  { key: 'pctPlusMinus', label: 'Diff% (DFG)', value: (d) => `${formatSigned(d.pctPlusMinus)}%`, toneClass: (d) => (d.pctPlusMinus <= 0 ? 'text-emerald-400' : 'text-rose-400'), sublabel: (d) => `${d.dFgm.toFixed(1)}/${d.dFga.toFixed(1)} T.Def`, benchKey: 'def_pctPlusMinus', numeric: (d) => (d.dFga > 0 ? d.pctPlusMinus : null), decimals: 1, suffix: '%', signed: true, lowerIsBetter: true },
  { key: 'defFreq', label: 'Frec. Defensa (FREQ%)', value: (d) => `${(d.defFreq || 0).toFixed(1)}%`, benchKey: 'def_freq', numeric: (d) => (d.defFreq > 0 ? d.defFreq : null), decimals: 1, suffix: '%' },
  { key: 'defRating', label: 'Def Rating', value: (d) => d.defRating.toFixed(1), benchKey: 'adv_defRtg', numeric: (d) => (d.defRating > 0 ? d.defRating : null), decimals: 1, lowerIsBetter: true },
  { key: 'defWs', label: 'Def Win Shares', value: (d) => d.defWs.toFixed(3), benchKey: 'def_ws', numeric: (d) => d.defWs, decimals: 3 },
  { key: 'drebPct', label: 'DREB% / %Equipo', value: (d) => `${d.drebPct.toFixed(1)}%`, sublabel: (d) => (d.pctDreb !== undefined ? `%Eq DREB: ${d.pctDreb.toFixed(1)}%` : 'Rebote Def.'), benchKey: 'adv_drebPct', numeric: (d) => d.drebPct, decimals: 1, suffix: '%' },
  { key: 'pctStlBlk', label: '%STL / %BLK Equipo', value: (d) => (d.pctStl !== undefined || d.pctBlk !== undefined ? `${(d.pctStl || 0).toFixed(1)}% / ${(d.pctBlk || 0).toFixed(1)}%` : '—'), benchKey: 'def_pctStl', numeric: (d) => (d.pctStl !== undefined ? d.pctStl : null), decimals: 1, suffix: '%' },
  { key: 'contestedShots', label: 'Tiros Punteados', value: (d) => d.contestedShots.toFixed(1), sublabel: (d) => `${d.contestedShots2pt.toFixed(1)} 2P · ${d.contestedShots3pt.toFixed(1)} 3P`, benchKey: 'hu_contestedShots', numeric: (d) => d.contestedShots, decimals: 1 },
  { key: 'deflections', label: 'Desvíos (Deflections)', value: (d) => d.deflections.toFixed(1), toneClass: () => 'text-orange-400', sublabel: () => 'balones tocados', benchKey: 'hu_deflections', numeric: (d) => d.deflections, decimals: 1 },
  { key: 'chargesDrawn', label: 'Cargas Provocadas', value: (d) => d.chargesDrawn.toFixed(2), sublabel: () => 'Charges Drawn', benchKey: 'hu_chargesDrawn', numeric: (d) => d.chargesDrawn, decimals: 2 },
  { key: 'screenAssists', label: 'Screen Assists', value: (d) => d.screenAssists.toFixed(1), sublabel: (d) => `${d.screenAstPts.toFixed(1)} pts generados`, benchKey: 'hu_screenAssists', numeric: (d) => d.screenAssists, decimals: 1 },
  { key: 'looseBalls', label: 'Balones Sueltos', value: (d) => d.looseBalls.toFixed(1), sublabel: (d) => `${d.offLooseBalls.toFixed(1)} Of (${(d.pctLooseBallsOff || 0).toFixed(0)}%) · ${d.defLooseBalls.toFixed(1)} Def (${(d.pctLooseBallsDef || 0).toFixed(0)}%)`, benchKey: 'hu_looseBalls', numeric: (d) => d.looseBalls, decimals: 2 },
  { key: 'boxOuts', label: 'Box-Outs Totales', value: (d) => d.boxOuts.toFixed(1), toneClass: () => 'text-emerald-400', sublabel: (d) => `${d.offBoxOuts.toFixed(1)} Of (${(d.pctBoxOutsOff || 0).toFixed(0)}%) · ${d.defBoxOuts.toFixed(1)} Def (${(d.pctBoxOutsDef || 0).toFixed(0)}%)`, benchKey: 'hu_boxOuts', numeric: (d) => d.boxOuts, decimals: 1 },
  { key: 'boxOutTeamRebs', label: 'BoxOut Rebs Eq./Jug.', value: (d) => `${d.boxOutTeamRebs.toFixed(1)} / ${d.boxOutPlayerRebs.toFixed(1)}`, benchKey: 'hu_boxOutRebs', numeric: (d) => d.boxOutTeamRebs, decimals: 2 },
  { key: 'oppPtsPaint', label: 'Pintura Rival (Opp)', value: (d) => d.oppPtsPaint.toFixed(1), sublabel: (d) => `2ªOp: ${d.oppPts2ndChance.toFixed(1)} · FB: ${d.oppPtsFb.toFixed(1)}`, benchKey: 'def_oppPtsPaint', numeric: (d) => d.oppPtsPaint, decimals: 1, lowerIsBetter: true },
  { key: 'oppPtsOffTov', label: 'Opp PTS tras Pérd.', value: (d) => d.oppPtsOffTov.toFixed(1), benchKey: 'def_oppPtsOffTov', numeric: (d) => d.oppPtsOffTov, decimals: 1, lowerIsBetter: true },
  { key: 'oppFgPct', label: 'Opp FG% / 3P% / FT% (Eq)', value: (d) => (d.oppFgPct ? `${d.oppFgPct.toFixed(1)}% / ${(d.oppFg3Pct || 0).toFixed(1)}% / ${(d.oppFtPct || 0).toFixed(1)}%` : '—'), sublabel: (d) => (d.oppPts ? `${d.oppPts.toFixed(1)} PTS · ${d.oppFgm?.toFixed(1) || 0}/${d.oppFga?.toFixed(1) || 0} TC` : 'Solo equipos'), benchKey: 'def_oppFgPct', numeric: (d) => (d.oppFgPct && d.oppFgPct > 0 ? d.oppFgPct : null), decimals: 1, suffix: '%', lowerIsBetter: true },
  { key: 'oppFg3mFta', label: 'Opp 3PM-3PA / FTM-FTA', value: (d) => (d.oppFg3a ? `${(d.oppFg3m || 0).toFixed(1)}-${d.oppFg3a.toFixed(1)} / ${(d.oppFtm || 0).toFixed(1)}-${(d.oppFta || 0).toFixed(1)}` : '—'), benchKey: 'def_oppFg3m', numeric: (d) => (d.oppFg3m && d.oppFg3a ? d.oppFg3m : null), decimals: 1, lowerIsBetter: true },
  { key: 'oppRebAstTov', label: 'Opp REB (OR/DR) · AST · TOV', value: (d) => (d.oppReb ? `${d.oppReb.toFixed(1)} (${(d.oppOreb || 0).toFixed(1)}/${(d.oppDreb || 0).toFixed(1)}) · ${(d.oppAst || 0).toFixed(1)} · ${(d.oppTov || 0).toFixed(1)}` : '—'), benchKey: 'def_oppReb', numeric: (d) => (d.oppReb && d.oppReb > 0 ? d.oppReb : null), decimals: 1, lowerIsBetter: true },
  { key: 'oppStlBlkPf', label: 'Opp STL · BLK · PF/PFD', value: (d) => (d.oppStl !== undefined ? `${d.oppStl.toFixed(1)} · ${(d.oppBlk || 0).toFixed(1)} · ${(d.oppPf || 0).toFixed(1)}/${(d.oppPfd || 0).toFixed(1)}` : '—'), benchKey: 'def_oppStl', numeric: (d) => (d.oppStl !== undefined ? d.oppStl : null), decimals: 1, lowerIsBetter: true },
];

const DEFAULT_DEF_HUSTLE_KEYS = ['dFgPct', 'contestedShots', 'deflections', 'chargesDrawn', 'screenAssists', 'looseBalls', 'boxOuts', 'defRating', 'oppPtsPaint', 'oppPtsOffTov'];

const TRACKING_CARDS: StatCardDef<NbaTrackingEntry>[] = [
  { key: 'drives', label: 'Penetraciones (Drives)', value: (t) => t.drives.toFixed(1), toneClass: () => 'text-orange-400', sublabel: (t) => `${t.drivePts.toFixed(1)} pts · ${(t.driveFgm ?? 0).toFixed(1)}/${(t.driveFga ?? 0).toFixed(1)} (${t.driveFgPct.toFixed(1)}%)`, benchKey: 'tr_drives', numeric: (t) => t.drives, decimals: 1 },
  { key: 'driveAstTov', label: 'Drives AST% / TOV% / Pase%', value: (t) => `${t.driveAstPct.toFixed(1)}% / ${t.driveTovPct.toFixed(1)}% / ${(t.drivePassesPct ?? 0).toFixed(1)}%`, benchKey: 'tr_driveAstPct', numeric: (t) => t.driveAstPct, decimals: 1, suffix: '%' },
  { key: 'catchShootPts', label: 'Catch & Shoot PTS', value: (t) => t.catchShootPts.toFixed(1), toneClass: () => 'text-emerald-400', sublabel: (t) => `${t.catchShootFg3Pct.toFixed(1)}% 3P · ${t.catchShootEfgPct.toFixed(1)}% eFG · ${(t.catchShootFgm || 0).toFixed(1)}/${(t.catchShootFga || 0).toFixed(1)}`, benchKey: 'tr_csPts', numeric: (t) => t.catchShootPts, decimals: 1 },
  { key: 'pullUpPts', label: 'Pull-Up PTS', value: (t) => t.pullUpPts.toFixed(1), toneClass: () => 'text-orange-300', sublabel: (t) => `${t.pullUpFg3Pct.toFixed(1)}% 3P · ${t.pullUpEfgPct.toFixed(1)}% eFG · ${(t.pullUpFgm || 0).toFixed(1)}/${(t.pullUpFga || 0).toFixed(1)}`, benchKey: 'tr_puPts', numeric: (t) => t.pullUpPts, decimals: 1 },
  { key: 'passes', label: 'Pases Dados / Rec.', value: (t) => `${t.passesMade.toFixed(1)} / ${t.passesReceived.toFixed(1)}`, sublabel: (t) => `Ratio AST Aj.: ${t.astToPassPctAdj.toFixed(1)}%`, benchKey: 'tr_passesMade', numeric: (t) => t.passesMade, decimals: 1 },
  { key: 'potentialAst', label: 'Asist. Potenciales', value: (t) => t.potentialAst.toFixed(1), sublabel: (t) => `${t.secondaryAst.toFixed(1)} sec. · ${t.astPtsCreated.toFixed(1)} pts`, benchKey: 'tr_potAst', numeric: (t) => t.potentialAst, decimals: 1 },
  { key: 'touches', label: 'Toques / FrontCt / Posesión', value: (t) => `${t.touches.toFixed(1)} / ${(t.frontCtTouches ?? 0).toFixed(1)}`, sublabel: (t) => `Posesión: ${(t.timeOfPoss ?? 0).toFixed(1)}m · ${(t.avgSecPerTouch ?? 0).toFixed(2)}s · ${(t.avgDribPerTouch ?? 0).toFixed(2)} bot. · ${(t.ptsPerTouch ?? 0).toFixed(3)} pts/toq`, benchKey: 'tr_touches', numeric: (t) => t.touches, decimals: 1 },
  { key: 'paintPostElbow', label: 'Pintura / Poste / Codo', value: (t) => `${t.paintTouches.toFixed(1)} / ${t.postTouches.toFixed(1)} / ${t.elbowTouches.toFixed(1)}`, sublabel: (t) => `${t.paintTouchFgPct.toFixed(0)}% pint. (${t.paintTouchPts.toFixed(1)}p) · ${t.postTouchFgPct.toFixed(0)}% poste (${t.postTouchPts.toFixed(1)}p)`, benchKey: 'tr_paintTouches', numeric: (t) => t.paintTouches, decimals: 1 },
  { key: 'distSpeed', label: 'Distancia / Velocidad', value: (t) => `${t.distMiles.toFixed(2)} mi (${t.distMilesOff.toFixed(2)} Of / ${t.distMilesDef.toFixed(2)} Def)`, sublabel: (t) => `${t.avgSpeed.toFixed(2)} mph (Of ${t.avgSpeedOff.toFixed(2)} / Def ${t.avgSpeedDef.toFixed(2)})`, benchKey: 'tr_distMiles', numeric: (t) => t.distMiles, decimals: 2, suffix: ' mi' },
  { key: 'rebChances', label: 'Oportunidades Rebote', value: (t) => t.rebChances.toFixed(1), sublabel: (t) => `OR Cont ${t.orebContestPct.toFixed(0)}% · DR Cont ${t.drebContestPct.toFixed(0)}% · Aj ${t.rebChancePctAdj.toFixed(1)}% · ${t.avgRebDist.toFixed(1)}ft`, benchKey: 'tr_rebChances', numeric: (t) => t.rebChances, decimals: 1 },
];

const DEFAULT_TRACKING_KEYS = ['drives', 'catchShootPts', 'pullUpPts', 'passes', 'potentialAst', 'touches', 'paintPostElbow', 'distSpeed', 'rebChances'];

interface ClutchAndDefensePanelProps {
  clutch?: NbaClutchEntry | null;
  defenseHustle?: NbaDefenseHustleEntry | null;
  tracking?: NbaTrackingEntry | null;
  entityName: string;
  leagueBenchmarks?: Record<string, NbaAdvancedBenchmarkStat>;
}

export function ClutchAndDefensePanel({
  clutch,
  defenseHustle,
  tracking,
  leagueBenchmarks,
}: ClutchAndDefensePanelProps) {
  const [clutchKeys, setClutchKeys] = usePersistentModuleKeys(
    'radarnba_mod_clutch_v1',
    CLUTCH_CARDS.map((c) => c.key),
    DEFAULT_CLUTCH_KEYS
  );
  const [defHustleKeys, setDefHustleKeys] = usePersistentModuleKeys(
    'radarnba_mod_defhustle_v1',
    DEF_HUSTLE_CARDS.map((c) => c.key),
    DEFAULT_DEF_HUSTLE_KEYS
  );
  const [trackingKeys, setTrackingKeys] = usePersistentModuleKeys(
    'radarnba_mod_tracking_v1',
    TRACKING_CARDS.map((c) => c.key),
    DEFAULT_TRACKING_KEYS
  );

  return (
    <div className="space-y-5">
      {/* CLUTCH SITUATIONS CARD */}
      {clutch && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400 shrink-0" />
                <span>Rendimiento en Situaciones Clutch (&lt; 5 min, ±5 pts)</span>
                <MetricInfoTooltip helpKey="clutch" />
              </h3>
              <p className="text-xs text-slate-400">
                Momentos decisivos de último cuarto y prórroga en partidos apretados vs Media NBA
              </p>
            </div>
            <div className="bg-[#0B1120] border border-[#1E293B] px-3 py-1 rounded-lg text-xs font-mono">
              <span className="text-slate-400 mr-1.5 font-sans">Balance:</span>
              <span className="text-emerald-400 font-bold">{clutch.w}V</span>
              <span className="text-slate-500 mx-1">-</span>
              <span className="text-rose-400 font-bold">{clutch.l}D</span>
              <span className="text-slate-400 ml-1.5 font-semibold">({clutch.wPct.toFixed(1)}%)</span>
            </div>
          </div>

          <LayerColumnCustomizer
            columns={CLUTCH_CARDS.map((c) => ({ key: c.key, label: c.label }))}
            visibleKeys={clutchKeys}
            defaultKeys={DEFAULT_CLUTCH_KEYS}
            onChangeVisibleKeys={setClutchKeys}
            title="Añadir / quitar stats Clutch"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 font-mono tabular-nums text-xs">
            {CLUTCH_CARDS.filter((c) => clutchKeys.includes(c.key)).map((c) => (
              <div key={c.key} className="p-3 rounded-lg bg-[#0B1120] border border-[#1E293B] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] text-slate-400 font-sans uppercase font-bold truncate">
                      {c.label}
                    </span>
                    <span className={`text-sm font-bold shrink-0 ${c.toneClass ? c.toneClass(clutch) : 'text-slate-100'}`}>
                      {c.value(clutch)}
                    </span>
                  </div>
                  {c.sublabel && (
                    <span className="block text-[10px] text-slate-500 font-sans">{c.sublabel(clutch)}</span>
                  )}
                </div>
                <ModuleBenchmarkBar card={c} data={clutch} leagueBenchmarks={leagueBenchmarks} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DEFENSE & HUSTLE STATS CARD */}
      {defenseHustle && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 sm:p-5 space-y-4">
          <div className="border-b border-[#1E293B] pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-400 shrink-0" />
              <span>Defensa Avanzada, Stats Rival & Hustle Stats Oficiales</span>
              <MetricInfoTooltip helpKey="dFgPct" />
            </h3>
            <p className="text-xs text-slate-400">
              Impacto en tiros defendidos (DFG%), desvíos, cargas, pantallas, balones sueltos, box-outs y datos del rival vs Media NBA
            </p>
          </div>

          <LayerColumnCustomizer
            columns={DEF_HUSTLE_CARDS.map((c) => ({ key: c.key, label: c.label }))}
            visibleKeys={defHustleKeys}
            defaultKeys={DEFAULT_DEF_HUSTLE_KEYS}
            onChangeVisibleKeys={setDefHustleKeys}
            title="Añadir / quitar stats Defensa y Hustle"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 font-mono tabular-nums text-xs">
            {DEF_HUSTLE_CARDS.filter((c) => defHustleKeys.includes(c.key)).map((c) => (
              <div key={c.key} className="p-3 rounded-lg bg-[#0B1120] border border-[#1E293B] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] text-slate-400 font-sans uppercase font-bold truncate" title={c.label}>
                      {c.label}
                    </span>
                    <span className={`text-sm font-bold shrink-0 ${c.toneClass ? c.toneClass(defenseHustle) : 'text-slate-100'}`}>
                      {c.value(defenseHustle)}
                    </span>
                  </div>
                  {c.sublabel && (
                    <span className="block text-[10px] text-slate-500 font-sans truncate">
                      {c.sublabel(defenseHustle)}
                    </span>
                  )}
                </div>
                <ModuleBenchmarkBar card={c} data={defenseHustle} leagueBenchmarks={leagueBenchmarks} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TRACKING STATS CARD (SECOND SPECTRUM) */}
      {tracking && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 sm:p-5 space-y-4">
          <div className="border-b border-[#1E293B] pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-400 shrink-0" />
              <span>Tracking Óptico Completo (Drives, Tiros, Pases, Toques, Velocidad y Rebotes)</span>
              <MetricInfoTooltip helpKey="drives" />
            </h3>
            <p className="text-xs text-slate-400">
              Las 7 categorías de Tracking Óptico oficial de NBA.com con comparativa frente a la Media NBA
            </p>
          </div>

          <LayerColumnCustomizer
            columns={TRACKING_CARDS.map((c) => ({ key: c.key, label: c.label }))}
            visibleKeys={trackingKeys}
            defaultKeys={DEFAULT_TRACKING_KEYS}
            onChangeVisibleKeys={setTrackingKeys}
            title="Añadir / quitar bloques Tracking"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 font-mono tabular-nums text-xs">
            {TRACKING_CARDS.filter((c) => trackingKeys.includes(c.key)).map((c) => (
              <div key={c.key} className="p-3.5 rounded-xl bg-[#0B1120] border border-[#1E293B] flex flex-col justify-between gap-1">
                <div>
                  <span className="block text-[11px] font-sans font-bold text-slate-300">{c.label}</span>
                  <span className={`block text-base font-bold mt-0.5 ${c.toneClass ? c.toneClass(tracking) : 'text-slate-100'}`}>
                    {c.value(tracking)}
                  </span>
                  {c.sublabel && (
                    <span className="block text-[11px] text-slate-400 font-sans mt-0.5">{c.sublabel(tracking)}</span>
                  )}
                </div>
                <ModuleBenchmarkBar card={c} data={tracking} leagueBenchmarks={leagueBenchmarks} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const SCORING_CARDS: StatCardDef<NbaScoringSplitsEntry>[] = [
  { key: 'pctFga2pt', label: '% Tiros de 2P', value: (s) => `${s.pctFga2pt.toFixed(1)}%`, benchKey: 'sc_pctFga2pt', numeric: (s) => s.pctFga2pt, decimals: 1, suffix: '%' },
  { key: 'pctFga3pt', label: '% Tiros de 3P', value: (s) => `${s.pctFga3pt.toFixed(1)}%`, toneClass: () => 'text-orange-400', benchKey: 'sc_pctFga3pt', numeric: (s) => s.pctFga3pt, decimals: 1, suffix: '%' },
  { key: 'pctPts2pt', label: '% Puntos de 2P', value: (s) => `${s.pctPts2pt.toFixed(1)}%`, benchKey: 'sc_pctPts2pt', numeric: (s) => s.pctPts2pt, decimals: 1, suffix: '%' },
  { key: 'pctPts2ptMr', label: '% Puntos Media Dist.', value: (s) => `${s.pctPts2ptMr.toFixed(1)}%`, benchKey: 'sc_pctPts2ptMr', numeric: (s) => s.pctPts2ptMr, decimals: 1, suffix: '%' },
  { key: 'pctPts3pt', label: '% Puntos de 3P', value: (s) => `${s.pctPts3pt.toFixed(1)}%`, toneClass: () => 'text-orange-300', benchKey: 'sc_pctPts3pt', numeric: (s) => s.pctPts3pt, decimals: 1, suffix: '%' },
  { key: 'pctPtsFb', label: '% Puntos Contraataque', value: (s) => `${s.pctPtsFb.toFixed(1)}%`, benchKey: 'sc_pctPtsFb', numeric: (s) => s.pctPtsFb, decimals: 1, suffix: '%' },
  { key: 'pctPtsFt', label: '% Puntos Tiros Libres', value: (s) => `${s.pctPtsFt.toFixed(1)}%`, benchKey: 'sc_pctPtsFt', numeric: (s) => s.pctPtsFt, decimals: 1, suffix: '%' },
  { key: 'pctPtsOffTov', label: '% Puntos tras Pérdida', value: (s) => `${s.pctPtsOffTov.toFixed(1)}%`, benchKey: 'sc_pctPtsOffTov', numeric: (s) => s.pctPtsOffTov, decimals: 1, suffix: '%' },
  { key: 'pctPtsPaint', label: '% Puntos en Pintura', value: (s) => `${s.pctPtsPaint.toFixed(1)}%`, toneClass: () => 'text-emerald-400', benchKey: 'sc_pctPtsPaint', numeric: (s) => s.pctPtsPaint, decimals: 1, suffix: '%' },
  { key: 'pctAst2pm', label: '% Canastas 2P Asistidas', value: (s) => `${s.pctAst2pm.toFixed(1)}%`, benchKey: 'sc_pctAst2pm', numeric: (s) => s.pctAst2pm, decimals: 1, suffix: '%' },
  { key: 'pctUast2pm', label: '% Canastas 2P Sin Asist.', value: (s) => `${s.pctUast2pm.toFixed(1)}%`, benchKey: 'sc_pctUast2pm', numeric: (s) => s.pctUast2pm, decimals: 1, suffix: '%' },
  { key: 'pctAst3pm', label: '% Triples Asistidos', value: (s) => `${s.pctAst3pm.toFixed(1)}%`, benchKey: 'sc_pctAst3pm', numeric: (s) => s.pctAst3pm, decimals: 1, suffix: '%' },
  { key: 'pctUast3pm', label: '% Triples Sin Asist.', value: (s) => `${s.pctUast3pm.toFixed(1)}%`, benchKey: 'sc_pctUast3pm', numeric: (s) => s.pctUast3pm, decimals: 1, suffix: '%' },
  { key: 'pctAstFgm', label: '% Canastas Tot. Asistidas', value: (s) => `${s.pctAstFgm.toFixed(1)}%`, benchKey: 'sc_pctAstFgm', numeric: (s) => s.pctAstFgm, decimals: 1, suffix: '%' },
  { key: 'pctUastFgm', label: '% Canastas Sin Asist.', value: (s) => `${s.pctUastFgm.toFixed(1)}%`, benchKey: 'sc_pctUastFgm', numeric: (s) => s.pctUastFgm, decimals: 1, suffix: '%' },
];

const DEFAULT_SCORING_KEYS = ['pctFga2pt', 'pctFga3pt', 'pctPts2ptMr', 'pctPts3pt', 'pctPtsFb', 'pctPtsFt', 'pctPtsOffTov', 'pctPtsPaint', 'pctAstFgm', 'pctUastFgm'];

export function ScoringSplitsPanel({
  scoring,
  entityName,
  leagueBenchmarks,
}: {
  scoring: NbaScoringSplitsEntry;
  entityName: string;
  leagueBenchmarks?: Record<string, NbaAdvancedBenchmarkStat>;
}) {
  const [keys, setKeys] = usePersistentModuleKeys(
    'radarnba_mod_scoring_v1',
    SCORING_CARDS.map((c) => c.key),
    DEFAULT_SCORING_KEYS
  );

  return (
    <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 sm:p-5 space-y-4">
      <div className="border-b border-[#1E293B] pb-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <PieChart className="w-4 h-4 text-orange-400 shrink-0" />
          <span>Distribución Anotadora y Asistencias (Scoring Splits · {entityName})</span>
          <MetricInfoTooltip helpKey="pctPtsPaint" />
        </h3>
        <p className="text-xs text-slate-400">
          Origen exacto de cada lanzamiento y punto anotado (% Asistido vs Autogenerado) frente a la Media NBA
        </p>
      </div>

      <LayerColumnCustomizer
        columns={SCORING_CARDS.map((c) => ({ key: c.key, label: c.label }))}
        visibleKeys={keys}
        defaultKeys={DEFAULT_SCORING_KEYS}
        onChangeVisibleKeys={setKeys}
        title="Añadir / quitar splits de tiro"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 font-mono tabular-nums text-xs">
        {SCORING_CARDS.filter((c) => keys.includes(c.key)).map((c) => (
          <div key={c.key} className="p-3 rounded-lg bg-[#0B1120] border border-[#1E293B] flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 font-sans uppercase font-bold truncate" title={c.label}>
                {c.label}
              </span>
              <span className={`text-sm font-bold shrink-0 ${c.toneClass ? c.toneClass(scoring) : 'text-slate-100'}`}>
                {c.value(scoring)}
              </span>
            </div>
            <ModuleBenchmarkBar card={c} data={scoring} leagueBenchmarks={leagueBenchmarks} />
          </div>
        ))}
      </div>
    </div>
  );
}

const FOUR_FACTORS_CARDS: StatCardDef<NbaFourFactorsEntry>[] = [
  { key: 'efgPct', label: '1. eFG% Propio', value: (f) => `${f.efgPct.toFixed(1)}%`, benchKey: 'adv_efgPct', numeric: (f) => f.efgPct, decimals: 1, suffix: '%' },
  { key: 'tmTovPct', label: '2. TOV% Propio', value: (f) => `${f.tmTovPct.toFixed(1)}%`, benchKey: 'adv_tovPct', numeric: (f) => f.tmTovPct, decimals: 1, suffix: '%', lowerIsBetter: true },
  { key: 'orebPct', label: '3. OREB% Propio', value: (f) => `${f.orebPct.toFixed(1)}%`, benchKey: 'adv_orebPct', numeric: (f) => f.orebPct, decimals: 1, suffix: '%' },
  { key: 'ftaRate', label: '4. FTA Rate Propio', value: (f) => `${(f.ftaRate < 1.5 && f.ftaRate > 0 ? f.ftaRate * 100 : f.ftaRate).toFixed(1)}%`, benchKey: 'adv_ftaRate', numeric: (f) => (f.ftaRate < 1.5 && f.ftaRate > 0 ? f.ftaRate * 100 : f.ftaRate), decimals: 1, suffix: '%' },
  { key: 'oppEfgPct', label: '1. Opp eFG% Rival', value: (f) => `${f.oppEfgPct.toFixed(1)}%`, toneClass: () => 'text-orange-300', benchKey: 'adv_oppEfgPct', numeric: (f) => (f.oppEfgPct > 0 ? f.oppEfgPct : null), decimals: 1, suffix: '%', lowerIsBetter: true },
  { key: 'oppTovPct', label: '2. Opp TOV% Rival', value: (f) => `${f.oppTovPct.toFixed(1)}%`, toneClass: () => 'text-emerald-400', benchKey: 'adv_oppTovPct', numeric: (f) => (f.oppTovPct > 0 ? f.oppTovPct : null), decimals: 1, suffix: '%' },
  { key: 'oppOrebPct', label: '3. Opp OREB% Rival', value: (f) => `${f.oppOrebPct.toFixed(1)}%`, benchKey: 'adv_oppOrebPct', numeric: (f) => (f.oppOrebPct > 0 ? f.oppOrebPct : null), decimals: 1, suffix: '%', lowerIsBetter: true },
  { key: 'oppFtaRate', label: '4. Opp FTA Rate', value: (f) => `${(f.oppFtaRate < 1.5 && f.oppFtaRate > 0 ? f.oppFtaRate * 100 : f.oppFtaRate).toFixed(1)}%`, benchKey: 'adv_oppFtaRate', numeric: (f) => (f.oppFtaRate > 0 ? (f.oppFtaRate < 1.5 ? f.oppFtaRate * 100 : f.oppFtaRate) : null), decimals: 1, suffix: '%', lowerIsBetter: true },
  { key: 'offRtg', label: 'OffRtg', value: (f) => f.offRtg.toFixed(1), benchKey: 'adv_offRtg', numeric: (f) => f.offRtg, decimals: 1 },
  { key: 'defRtg', label: 'DefRtg', value: (f) => f.defRtg.toFixed(1), benchKey: 'adv_defRtg', numeric: (f) => f.defRtg, decimals: 1, lowerIsBetter: true },
  { key: 'netRtg', label: 'NetRtg', value: (f) => formatSigned(f.netRtg), toneClass: (f) => (f.netRtg >= 0 ? 'text-emerald-400' : 'text-rose-400'), benchKey: 'adv_netRtg', numeric: (f) => f.netRtg, decimals: 1, signed: true },
  { key: 'pace', label: 'Pace', value: (f) => f.pace.toFixed(1), benchKey: 'adv_pace', numeric: (f) => f.pace, decimals: 1 },
];

const DEFAULT_FF_KEYS = ['efgPct', 'tmTovPct', 'orebPct', 'ftaRate', 'oppEfgPct', 'oppTovPct', 'oppOrebPct', 'oppFtaRate'];

export function FourFactorsFullPanel({
  fourFactors,
  entityName,
  leagueBenchmarks,
}: {
  fourFactors: NbaFourFactorsEntry;
  entityName: string;
  leagueBenchmarks?: Record<string, NbaAdvancedBenchmarkStat>;
}) {
  const [keys, setKeys] = usePersistentModuleKeys(
    'radarnba_mod_fourfactors_v1',
    FOUR_FACTORS_CARDS.map((c) => c.key),
    DEFAULT_FF_KEYS
  );

  return (
    <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 sm:p-5 space-y-4">
      <div className="border-b border-[#1E293B] pb-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Scale className="w-4 h-4 text-orange-400 shrink-0" />
          <span>4 Factores Ofensivos y Defensivos Oficiales (NBA.com · {entityName})</span>
          <MetricInfoTooltip helpKey="oppFourFactors" />
        </h3>
        <p className="text-xs text-slate-400">
          Comparativa completa de los 4 pilares propios frente a los 4 pilares permitidos al rival y la Media NBA
        </p>
      </div>

      <LayerColumnCustomizer
        columns={FOUR_FACTORS_CARDS.map((c) => ({ key: c.key, label: c.label }))}
        visibleKeys={keys}
        defaultKeys={DEFAULT_FF_KEYS}
        onChangeVisibleKeys={setKeys}
        title="Añadir / quitar 4 Factores"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono tabular-nums text-xs">
        {FOUR_FACTORS_CARDS.filter((c) => keys.includes(c.key)).map((c) => (
          <div key={c.key} className="p-3 rounded-lg bg-[#0B1120] border border-[#1E293B] flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 font-sans uppercase font-bold truncate" title={c.label}>
                {c.label}
              </span>
              <span className={`text-sm font-bold shrink-0 ${c.toneClass ? c.toneClass(fourFactors) : 'text-slate-100'}`}>
                {c.value(fourFactors)}
              </span>
            </div>
            <ModuleBenchmarkBar card={c} data={fourFactors} leagueBenchmarks={leagueBenchmarks} />
          </div>
        ))}
      </div>
    </div>
  );
}

const VIOLATIONS_CARDS: StatCardDef<NbaViolationsEntry>[] = [
  { key: 'totalViolations', label: 'Violaciones Totales', value: (v) => `${v.totalViolations}`, toneClass: () => 'text-orange-400', benchKey: 'vl_total', numeric: (v) => v.totalViolations, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'pf', label: 'Faltas Personales (PF)', value: (v) => v.pf.toFixed(1), benchKey: 'vl_pf', numeric: (v) => v.pf, decimals: 1, lowerIsBetter: true },
  { key: 'pfd', label: 'Faltas Recibidas (PFD)', value: (v) => v.pfd.toFixed(1), toneClass: () => 'text-emerald-400', benchKey: 'vl_pfd', numeric: (v) => v.pfd, decimals: 1 },
  { key: 'blka', label: 'Tapones Recibidos (BLKA)', value: (v) => v.blka.toFixed(1), benchKey: 'vl_blka', numeric: (v) => v.blka, decimals: 2, lowerIsBetter: true },
  { key: 'tov', label: 'Pérdidas Totales (TOV)', value: (v) => v.tov.toFixed(1), benchKey: 'vl_tov', numeric: (v) => v.tov, decimals: 1, lowerIsBetter: true },
  { key: 'travel', label: 'Pasos (Travels)', value: (v) => `${v.travel}`, benchKey: 'vl_travel', numeric: (v) => v.travel, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'doubleDribble', label: 'Dobles', value: (v) => `${v.doubleDribble}`, benchKey: 'vl_doubleDribble', numeric: (v) => v.doubleDribble, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'discontinuedDribble', label: 'Acompañar Balón', value: (v) => `${v.discontinuedDribble}`, benchKey: 'vl_discontinuedDribble', numeric: (v) => v.discontinuedDribble, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'palming', label: 'Palming (Retener Balón)', value: (v) => `${v.palming}`, benchKey: 'vl_palming', numeric: (v) => v.palming, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'offThreeSec', label: '3 Segundos Ofensivos', value: (v) => `${v.offThreeSec}`, benchKey: 'vl_offThreeSec', numeric: (v) => v.offThreeSec, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'defThreeSec', label: '3 Segundos Defensivos', value: (v) => `${v.defThreeSec}`, benchKey: 'vl_defThreeSec', numeric: (v) => v.defThreeSec, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'shotClock', label: 'Reloj de 24s', value: (v) => `${v.shotClock}`, benchKey: 'vl_shotClock', numeric: (v) => v.shotClock, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'fiveSec', label: '5 Segundos', value: (v) => `${v.fiveSec}`, benchKey: 'vl_fiveSec', numeric: (v) => v.fiveSec, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'eightSec', label: '8 Segundos', value: (v) => `${v.eightSec}`, benchKey: 'vl_eightSec', numeric: (v) => v.eightSec, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'backcourt', label: 'Campo Atrás', value: (v) => `${v.backcourt}`, benchKey: 'vl_backcourt', numeric: (v) => v.backcourt, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'offFoul', label: 'Falta en Ataque', value: (v) => `${v.offFoul}`, benchKey: 'vl_offFoul', numeric: (v) => v.offFoul, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'charge', label: 'Carga Ofensiva', value: (v) => `${v.charge}`, benchKey: 'vl_charge', numeric: (v) => v.charge, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'kickedBall', label: 'Pie (Kick Ball)', value: (v) => `${v.kickedBall}`, benchKey: 'vl_kickedBall', numeric: (v) => v.kickedBall, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'lane', label: 'Invasión Tiro Libre', value: (v) => `${v.lane}`, benchKey: 'vl_lane', numeric: (v) => v.lane, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'offGoaltending', label: 'Interferencia Of.', value: (v) => `${v.offGoaltending}`, benchKey: 'vl_offGoaltending', numeric: (v) => v.offGoaltending, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'defGoaltending', label: 'Interferencia Def.', value: (v) => `${v.defGoaltending}`, benchKey: 'vl_defGoaltending', numeric: (v) => v.defGoaltending, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'inbound', label: 'Violación de Saque', value: (v) => `${v.inbound}`, benchKey: 'vl_inbound', numeric: (v) => v.inbound, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'jumpBall', label: 'Violación Salto Entre 2', value: (v) => `${v.jumpBall}`, benchKey: 'vl_jumpBall', numeric: (v) => v.jumpBall, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'delayOfGame', label: 'Retraso de Juego', value: (v) => `${v.delayOfGame}`, benchKey: 'vl_delayOfGame', numeric: (v) => v.delayOfGame, decimals: 1, lowerIsBetter: true, scaleBenchByGp: (v) => v.gp },
  { key: 'ptsPaint', label: 'PTS Pintura', value: (v) => (v.ptsPaint ?? 0).toFixed(1), benchKey: 'hu_ptsPaint', numeric: (v) => v.ptsPaint ?? 0, decimals: 1 },
  { key: 'pts2ndChance', label: 'PTS 2ª Jugada', value: (v) => (v.pts2ndChance ?? 0).toFixed(1), benchKey: 'hu_pts2ndChance', numeric: (v) => v.pts2ndChance ?? 0, decimals: 1 },
  { key: 'ptsFb', label: 'PTS Contraataque', value: (v) => (v.ptsFb ?? 0).toFixed(1), benchKey: 'hu_ptsFb', numeric: (v) => v.ptsFb ?? 0, decimals: 1 },
  { key: 'ptsOffTov', label: 'PTS tras Pérdida', value: (v) => (v.ptsOffTov ?? 0).toFixed(1), benchKey: 'hu_ptsOffTov', numeric: (v) => v.ptsOffTov ?? 0, decimals: 1 },
  { key: 'oppPtsPaint', label: 'Opp Pintura', value: (v) => (v.oppPtsPaint ?? 0).toFixed(1), benchKey: 'def_oppPtsPaint', numeric: (v) => v.oppPtsPaint ?? 0, decimals: 1, lowerIsBetter: true },
  { key: 'oppPts2ndChance', label: 'Opp 2ª Jugada', value: (v) => (v.oppPts2ndChance ?? 0).toFixed(1), benchKey: 'def_oppPts2ndChance', numeric: (v) => v.oppPts2ndChance ?? 0, decimals: 1, lowerIsBetter: true },
  { key: 'oppPtsFb', label: 'Opp Contraataque', value: (v) => (v.oppPtsFb ?? 0).toFixed(1), benchKey: 'def_oppPtsFb', numeric: (v) => v.oppPtsFb ?? 0, decimals: 1, lowerIsBetter: true },
  { key: 'oppPtsOffTov', label: 'Opp tras Pérdida', value: (v) => (v.oppPtsOffTov ?? 0).toFixed(1), benchKey: 'def_oppPtsOffTov', numeric: (v) => v.oppPtsOffTov ?? 0, decimals: 1, lowerIsBetter: true },
  { key: 'dd2', label: 'Dobles-Dobles (DD2)', value: (v) => `${v.dd2}`, benchKey: 'vl_dd2', numeric: (v) => v.dd2, decimals: 1 },
  { key: 'td3', label: 'Triples-Dobles (TD3)', value: (v) => `${v.td3}`, benchKey: 'vl_td3', numeric: (v) => v.td3, decimals: 1 },
  { key: 'nbaFantasyPts', label: 'NBA Fantasy PTS', value: (v) => v.nbaFantasyPts.toFixed(1), benchKey: 'vl_nbaFantasyPts', numeric: (v) => v.nbaFantasyPts, decimals: 1 },
];

const DEFAULT_VIOLATIONS_KEYS = ['totalViolations', 'pf', 'pfd', 'blka', 'tov', 'travel', 'doubleDribble', 'offThreeSec', 'defThreeSec', 'backcourt', 'kickedBall', 'dd2', 'td3', 'nbaFantasyPts'];

export function ViolationsPanel({
  violations,
  entityName,
  leagueBenchmarks,
}: {
  violations: NbaViolationsEntry;
  entityName: string;
  leagueBenchmarks?: Record<string, NbaAdvancedBenchmarkStat>;
}) {
  const [keys, setKeys] = usePersistentModuleKeys(
    'radarnba_mod_violations_v1',
    VIOLATIONS_CARDS.map((c) => c.key),
    DEFAULT_VIOLATIONS_KEYS
  );

  return (
    <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 sm:p-5 space-y-4">
      <div className="border-b border-[#1E293B] pb-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-orange-400 shrink-0" />
          <span>Infracciones Oficiales, Faltas y Hitos (Violations · {entityName})</span>
          <MetricInfoTooltip helpKey="violationsTotal" />
        </h3>
        <p className="text-xs text-slate-400">
          Violaciones oficiales en totales de temporada (comparadas con el ritmo NBA en {Math.max(1, violations.gp || 1)} PJ) + PF/PFD/BLKA por partido, DD2, TD3 y NBA Fantasy
        </p>
      </div>

      <LayerColumnCustomizer
        columns={VIOLATIONS_CARDS.map((c) => ({ key: c.key, label: c.label }))}
        visibleKeys={keys}
        defaultKeys={DEFAULT_VIOLATIONS_KEYS}
        onChangeVisibleKeys={setKeys}
        title="Añadir / quitar infracciones y faltas"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 font-mono tabular-nums text-xs">
        {VIOLATIONS_CARDS.filter((c) => keys.includes(c.key)).map((c) => (
          <div key={c.key} className="p-3 rounded-lg bg-[#0B1120] border border-[#1E293B] flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 font-sans uppercase font-bold truncate" title={c.label}>
                {c.label}
              </span>
              <span className={`text-sm font-bold shrink-0 ${c.toneClass ? c.toneClass(violations) : 'text-slate-100'}`}>
                {c.value(violations)}
              </span>
            </div>
            <ModuleBenchmarkBar card={c} data={violations} leagueBenchmarks={leagueBenchmarks} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface OnOffSplitsPanelProps {
  splits: NbaOnOffSplitEntry[];
  title?: string;
  leagueBenchmarks?: Record<string, NbaAdvancedBenchmarkStat>;
}

export function OnOffSplitsPanel({ splits, title, leagueBenchmarks }: OnOffSplitsPanelProps) {
  const swingBench = leagueBenchmarks?.adv_onOffNetDiff || { mean: 0.0, sd: 6.2 };
  const netOnBench = leagueBenchmarks?.adv_onOffNetOn || { mean: -0.4, sd: 8.5 };
  const offRtgBench = leagueBenchmarks?.adv_offRtg || { mean: 114.6, sd: 4.2 };
  const defRtgBench = leagueBenchmarks?.adv_defRtg || { mean: 114.6, sd: 3.9 };

  return (
    <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#1E293B] pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-orange-400 shrink-0" />
            <span>{title || 'Impacto On / Off Court (Diferencial Colectivo)'}</span>
            <MetricInfoTooltip helpKey="onOffSwing" />
          </h3>
          <p className="text-xs text-slate-400">
            Rendimiento del equipo con cada jugador en pista (ON) vs banquillo (OFF) comparado con la Media NBA
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
          <span className="px-2 py-1 rounded bg-[#0B1120] border border-[#1E293B] text-slate-400">
            Media NBA Swing: <strong className="text-slate-200">{formatSigned(swingBench.mean)}</strong>
          </span>
          <span className="px-2 py-1 rounded bg-[#0B1120] border border-[#1E293B] text-slate-400">
            OffRtg: <strong className="text-slate-200">{offRtgBench.mean.toFixed(1)}</strong> · DefRtg:{' '}
            <strong className="text-slate-200">{defRtgBench.mean.toFixed(1)}</strong>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#1E293B] text-[11px] text-slate-400 uppercase font-mono">
              <th className="py-2 px-3">Jugador</th>
              <th className="py-2 px-3 text-right">Min ON</th>
              <th className="py-2 px-3 text-right">OffRtg ON</th>
              <th className="py-2 px-3 text-right">DefRtg ON</th>
              <th className="py-2 px-3 text-right">NetRtg ON</th>
              <th className="py-2 px-3 text-right">NetRtg OFF</th>
              <th className="py-2 px-3 text-right font-bold text-orange-400">Net Swing vs NBA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] font-mono tabular-nums">
            {splits.map((row) => {
              const isPositive = row.netDiff >= 0;
              const swingEv = evaluateReferenceComparison(
                row.netDiff,
                swingBench.mean,
                swingBench.sd,
                'nba',
                { decimals: 1, suffix: '', signed: true, hasRefData: true }
              );
              const onEv = evaluateReferenceComparison(
                row.netRtgOn,
                netOnBench.mean,
                netOnBench.sd,
                'nba',
                { decimals: 1, suffix: '', signed: true, hasRefData: true }
              );
              return (
                <tr key={row.playerId} className="hover:bg-[#182338] transition-colors">
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                    {row.playerName}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{row.minOn.toFixed(1)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-300">{row.offRtgOn.toFixed(1)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-300">{row.defRtgOn.toFixed(1)}</td>
                  <td
                    className={`py-2.5 px-3 text-right font-semibold ${
                      row.netRtgOn >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                    title={`Media NBA NetRtg ON: ${onEv.refFormatted}`}
                  >
                    {formatSigned(row.netRtgOn)}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right ${
                      row.netRtgOff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatSigned(row.netRtgOff)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="inline-flex flex-col items-end">
                      <span
                        className={`font-bold ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatSigned(row.netDiff)}
                      </span>
                      <span className={`text-[10px] font-sans ${swingEv.textClass}`}>
                        {swingEv.statusLabel} ({swingEv.deltaFormatted})
                      </span>
                    </div>
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
