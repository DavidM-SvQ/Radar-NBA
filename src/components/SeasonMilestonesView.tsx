import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Flame, Search, Sliders, Trophy } from 'lucide-react';
import type {
  ExperienceMode,
  MilestoneComparisonMode,
  MilestonesPayload,
  SeasonLeaderHolder,
  SingleGamePerformance,
} from '../types/nba';
import { formatShortDate, formatSigned, normalizeSearchText } from '../utils/analytics';
import { ColumnHelpHeader, MetricInfoTooltip } from './MetricUiHelpers';

interface SeasonMilestonesViewProps {
  data: MilestonesPayload | null;
  loading: boolean;
  errorMsg: string | null;
  experienceMode: ExperienceMode;
  onSwitchToAdvanced: () => void;
  onRetry: () => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
}

type SeasonFocus = 'compare' | '2027' | '2026';

export function SeasonMilestonesView({
  data,
  loading,
  errorMsg,
  experienceMode,
  onSwitchToAdvanced,
  onRetry,
  onInspectEntity,
}: SeasonMilestonesViewProps) {
  const [compMode, setCompMode] = useState<MilestoneComparisonMode>('full_season');
  const [seasonFocus, setSeasonFocus] = useState<SeasonFocus>('compare');
  const [globalLayer, setGlobalLayer] = useState<'all' | 'basic' | 'advanced'>(
    experienceMode === 'simple' ? 'basic' : 'all'
  );
  const [sgCategory, setSgCategory] = useState<'all' | 'player' | 'team'>('all');
  const [leaderGroup, setLeaderGroup] = useState<
    'all' | 'rebounding' | 'shooting_scoring' | 'playmaking_allaround' | 'advanced_hustle'
  >('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setGlobalLayer(experienceMode === 'simple' ? 'basic' : 'all');
  }, [experienceMode]);

  const qNorm = normalizeSearchText(query);

  const filteredSingleGame = useMemo(() => {
    const records = data?.singleGameRecords ?? [];
    return records.filter((item) => {
      if (sgCategory !== 'all' && item.category !== sgCategory) return false;
      if (!qNorm) return true;
      const refPerf =
        compMode === 'same_opening' ? item.prev2026Opening : item.prev2026Full;
      const hay = normalizeSearchText(
        `${item.metricLabel} ${item.current2027?.entityName || ''} ${
          item.current2027?.teamAbbr || ''
        } ${refPerf?.entityName || ''} ${refPerf?.teamAbbr || ''}`
      );
      return hay.includes(qNorm);
    });
  }, [data?.singleGameRecords, sgCategory, qNorm, compMode]);

  const filteredSeasonLeaders = useMemo(() => {
    const leaders = data?.seasonLeaders ?? [];
    const baseList =
      compMode === 'head_to_head'
        ? leaders.filter((x) => !x.isCumulativeTotal)
        : leaders;

    return baseList.filter((item) => {
      if (leaderGroup !== 'all' && item.group !== leaderGroup) return false;
      if (!qNorm) return true;
      const refHold =
        compMode === 'same_opening' ? item.prev2026Opening : item.prev2026Full;
      const hay = normalizeSearchText(
        `${item.metricLabel} ${item.current2027?.entityName || ''} ${
          item.current2027?.teamAbbr || ''
        } ${refHold?.entityName || ''} ${refHold?.teamAbbr || ''}`
      );
      return hay.includes(qNorm);
    });
  }, [data?.seasonLeaders, leaderGroup, qNorm, compMode]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-3.5 sm:p-4 space-y-2 animate-pulse">
              <div className="h-3 w-28 sm:w-32 bg-[#1E293B] rounded" />
              <div className="h-6 sm:h-7 w-16 sm:w-20 bg-[#1E293B] rounded" />
              <div className="h-3 w-32 sm:w-40 bg-[#1E293B] rounded" />
            </div>
          ))}
        </div>
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y divide-[#1E293B]">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-12 px-4 flex items-center justify-between gap-4 animate-pulse"
            >
              <div className="h-3.5 w-48 bg-[#1E293B] rounded" />
              <div className="h-3.5 w-32 bg-[#1E293B] rounded" />
              <div className="h-3.5 w-32 bg-[#1E293B] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="bg-[#131C2E] border border-rose-500/40 rounded-lg p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-rose-300">
            No se pudieron cargar los hitos comparativos de ambas temporadas
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {errorMsg || 'Intenta actualizar de nuevo en unos segundos.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap shrink-0"
        >
          Reintentar carga
        </button>
      </div>
    );
  }

  const refGlobal =
    compMode === 'same_opening' ? data.global2026Opening : data.global2026Full;
  const curGlobal = data.global2027;

  const refHeaderTitle =
    compMode === 'same_opening'
      ? `2025-26 (Primeros ${data.openingGamesPerTeam} PJ)`
      : '2025-26 (Completa 82 PJ)';

  const globalRows: Array<{
    id: string;
    label: string;
    cur: number;
    prev: number;
    unit: string;
    layer: 'basic' | 'advanced';
    lowerIsBetter?: boolean;
  }> = [
    {
      id: 'ppg',
      label: 'Puntos por equipo y partido',
      cur: curGlobal.avgTeamPoints,
      prev: refGlobal.avgTeamPoints,
      unit: 'PTS',
      layer: 'basic',
    },
    {
      id: 'tot',
      label: 'Marcador combinado medio por encuentro',
      cur: curGlobal.avgTotalGamePoints,
      prev: refGlobal.avgTotalGamePoints,
      unit: 'PTS',
      layer: 'basic',
    },
    {
      id: 'pace',
      label: 'Ritmo medio de juego NBA (Pace — posesiones/48m)',
      cur: curGlobal.avgPace,
      prev: refGlobal.avgPace,
      unit: 'POS',
      layer: 'advanced',
    },
    {
      id: 'offrtg',
      label: 'Eficiencia Ofensiva media NBA (OffRtg — PTS/100 pos)',
      cur: curGlobal.avgOffRtg,
      prev: refGlobal.avgOffRtg,
      unit: 'RTG',
      layer: 'advanced',
    },
    {
      id: 'efg',
      label: 'Tiro de Campo Efectivo medio NBA (eFG%)',
      cur: curGlobal.avgEfgPct,
      prev: refGlobal.avgEfgPct,
      unit: '%',
      layer: 'advanced',
    },
    {
      id: 'ts',
      label: 'Tiro Verdadero medio NBA (True Shooting TS%)',
      cur: curGlobal.avgTsPct,
      prev: refGlobal.avgTsPct,
      unit: '%',
      layer: 'advanced',
    },
    {
      id: '3pm',
      label: 'Triples anotados por equipo / PJ',
      cur: curGlobal.avgTeam3PM,
      prev: refGlobal.avgTeam3PM,
      unit: '3PM',
      layer: 'basic',
    },
    {
      id: '3pct',
      label: 'Acierto medio en triples de la liga',
      cur: curGlobal.avgTeam3Pct,
      prev: refGlobal.avgTeam3Pct,
      unit: '%',
      layer: 'basic',
    },
    {
      id: 'orb',
      label: 'Rebotes ofensivos medios por equipo / PJ',
      cur: curGlobal.avgTeamORB,
      prev: refGlobal.avgTeamORB,
      unit: 'OR',
      layer: 'basic',
    },
    {
      id: 'orebpct',
      label: 'Porcentaje de Rebote Ofensivo capturado (OREB%)',
      cur: curGlobal.avgOrebPct,
      prev: refGlobal.avgOrebPct,
      unit: '%',
      layer: 'advanced',
    },
    {
      id: 'tovpct',
      label: 'Ratio de Pérdidas por cada 100 posesiones (TOV%)',
      cur: curGlobal.avgTovPct,
      prev: refGlobal.avgTovPct,
      unit: '%',
      layer: 'advanced',
      lowerIsBetter: true,
    },
    {
      id: 'paint',
      label: 'Puntos medios en la Pintura por equipo (NBA.com)',
      cur: curGlobal.avgPtsPaint,
      prev: refGlobal.avgPtsPaint,
      unit: 'PTS',
      layer: 'advanced',
    },
    {
      id: 'second',
      label: 'Puntos tras 2ª Oportunidad por equipo (NBA.com)',
      cur: curGlobal.avgPts2ndChance,
      prev: refGlobal.avgPts2ndChance,
      unit: 'PTS',
      layer: 'advanced',
    },
    {
      id: 'fb',
      label: 'Puntos al Contraataque por equipo (NBA.com)',
      cur: curGlobal.avgPtsFastBreak,
      prev: refGlobal.avgPtsFastBreak,
      unit: 'PTS',
      layer: 'advanced',
    },
    {
      id: 'reb',
      label: 'Rebotes totales medios por equipo / PJ',
      cur: curGlobal.avgTeamREB,
      prev: refGlobal.avgTeamREB,
      unit: 'REB',
      layer: 'basic',
    },
    {
      id: 'ast',
      label: 'Asistencias medias por equipo / PJ',
      cur: curGlobal.avgTeamAST,
      prev: refGlobal.avgTeamAST,
      unit: 'AST',
      layer: 'basic',
    },
    {
      id: 'homew',
      label: 'Porcentaje de victorias locales',
      cur: curGlobal.homeWinPct,
      prev: refGlobal.homeWinPct,
      unit: '%',
      layer: 'basic',
    },
    {
      id: 'close',
      label: 'Partidos decididos por final apretado (≤ 5 pts)',
      cur: curGlobal.closeGamesPct,
      prev: refGlobal.closeGamesPct,
      unit: '%',
      layer: 'basic',
    },
    {
      id: 'blowout',
      label: 'Partidos decididos por amplio margen (≥ 15 pts)',
      cur: curGlobal.blowoutGamesPct,
      prev: refGlobal.blowoutGamesPct,
      unit: '%',
      layer: 'basic',
    },
  ];

  const visibleGlobalRows = globalRows.filter(
    (r) => globalLayer === 'all' || r.layer === globalLayer
  );

  const maxPtsPlayer = data.singleGameRecords.find(
    (r) => r.metricId === 'sg-player-pts'
  );
  const maxPtsTeam = data.singleGameRecords.find(
    (r) => r.metricId === 'sg-team-pts'
  );
  const ppgDiff = curGlobal.avgTeamPoints - refGlobal.avgTeamPoints;

  const renderPerfCell = (
    perf: SingleGamePerformance | null,
    entityType: 'player' | 'team',
    unit: string,
    decimals = 0,
    highlightOrange = false
  ) => {
    if (!perf) return <span className="text-xs text-slate-500">Sin registros</span>;
    return (
      <button
        type="button"
        onClick={() => onInspectEntity(entityType, perf.entityId)}
        className="text-left group focus:outline-none"
      >
        <div className="flex items-baseline gap-2">
          <span
            className={`font-mono tabular-nums font-bold text-base ${
              highlightOrange ? 'text-orange-400' : 'text-slate-100'
            }`}
          >
            {perf.value.toFixed(decimals)} {unit}
          </span>
          <span className="font-medium text-slate-100 group-hover:text-orange-300 transition-colors whitespace-nowrap">
            {perf.entityName}
          </span>
        </div>
        <div className="text-xs text-slate-400 whitespace-nowrap">
          {perf.teamAbbr} · {perf.context} · {formatShortDate(perf.date)}
        </div>
      </button>
    );
  };

  const renderLeaderCell = (
    holder: SeasonLeaderHolder | null,
    entityType: 'player' | 'team',
    unit: string,
    decimals: number,
    highlightOrange = false
  ) => {
    if (!holder) return <span className="text-xs text-slate-500">Sin registros</span>;
    return (
      <button
        type="button"
        onClick={() => onInspectEntity(entityType, holder.entityId)}
        className="text-left group focus:outline-none"
      >
        <div className="flex items-baseline gap-2">
          <span
            className={`font-mono tabular-nums font-bold text-base ${
              highlightOrange ? 'text-orange-400' : 'text-slate-100'
            }`}
          >
            {holder.value.toFixed(decimals)} {unit}
          </span>
          <span className="font-medium text-slate-100 group-hover:text-orange-300 transition-colors whitespace-nowrap">
            {holder.entityName}
          </span>
        </div>
        <div className="text-xs text-slate-400 whitespace-nowrap">
          {holder.teamAbbr} · {holder.secondaryLabel}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Row 1: Homogeneous 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Partidos comparados</span>
            <MetricInfoTooltip
              customHelp={{
                title: 'Muestra oficial de partidos NBA',
                simpleDesc:
                  'Cantidad total de partidos oficiales disputados que entran en cada lado de la comparativa interanual.',
                calculation:
                  'Conteo total de actas oficiales finalizadas en 2026-27 frente al corte seleccionado de 2025-26.',
              }}
            />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {curGlobal.gamesCount} <span className="text-slate-500 text-sm sm:text-base">vs</span>{' '}
            {refGlobal.gamesCount}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            2026-27 vs {compMode === 'same_opening' ? 'mismo inicio' : '2025-26'}
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Tope individual</span>
            <MetricInfoTooltip helpKey="singleGamePeak" align="right" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-orange-400">
            {maxPtsPlayer?.current2027?.value ?? '—'}
            <span className="mx-1 text-slate-600 text-sm sm:text-base">/</span>
            <span className="text-slate-200">
              {(compMode === 'same_opening'
                ? maxPtsPlayer?.prev2026Opening?.value
                : maxPtsPlayer?.prev2026Full?.value) ?? '—'}
            </span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {maxPtsPlayer?.current2027?.entityName || '—'} ·{' '}
            {(compMode === 'same_opening'
              ? maxPtsPlayer?.prev2026Opening?.entityName
              : maxPtsPlayer?.prev2026Full?.entityName) || '—'}
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Tope equipo</span>
            <MetricInfoTooltip helpKey="singleGamePeak" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-emerald-400">
            {maxPtsTeam?.current2027?.value ?? '—'}
            <span className="mx-1 text-slate-600 text-sm sm:text-base">/</span>
            <span className="text-slate-200">
              {(compMode === 'same_opening'
                ? maxPtsTeam?.prev2026Opening?.value
                : maxPtsTeam?.prev2026Full?.value) ?? '—'}
            </span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {maxPtsTeam?.current2027?.teamAbbr || '—'} vs{' '}
            {(compMode === 'same_opening'
              ? maxPtsTeam?.prev2026Opening?.teamAbbr
              : maxPtsTeam?.prev2026Full?.teamAbbr) || '—'}
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Evolución PTS/eq.</span>
            <MetricInfoTooltip helpKey="avgPointsFor" align="right" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            <span className={ppgDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {ppgDiff >= 0 ? '▲ ' : '▼ '}
              {formatSigned(ppgDiff, 1)}
            </span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-slate-400 truncate">
            {curGlobal.avgTeamPoints.toFixed(1)} vs {refGlobal.avgTeamPoints.toFixed(1)} PTS
          </p>
        </div>
      </div>

      {/* Row 2: 3-Mode Inter-Season Switcher + Season Focus + Search */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3.5 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {experienceMode === 'simple'
                ? 'Cómo comparar con el año pasado:'
                : 'Modo comparador interanual:'}
            </span>
            <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
              {(
                [
                  {
                    id: 'full_season',
                    label:
                      experienceMode === 'simple'
                        ? '1. Contra 25-26 completo'
                        : '1. Vs. 2025-26 Completa',
                  },
                  {
                    id: 'same_opening',
                    label:
                      experienceMode === 'simple'
                        ? `2. Mismo inicio (${data.openingGamesPerTeam} PJ)`
                        : `2. Mismo Tramo (${data.openingGamesPerTeam} PJ)`,
                  },
                  {
                    id: 'head_to_head',
                    label:
                      experienceMode === 'simple'
                        ? '3. Medias y topes 1 noche'
                        : '3. Promedios Cara a Cara',
                  },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCompMode(m.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    compMode === m.id
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
              {(
                [
                  { id: 'compare', label: 'Comparar Ambas' },
                  { id: '2027', label: 'Solo 2026-27' },
                  { id: '2026', label: 'Solo 2025-26' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSeasonFocus(f.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    seasonFocus === f.id
                      ? 'bg-[#1E293B] text-orange-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar hito, jugador o equipo..."
                className="w-full pl-8 pr-3 py-2 sm:py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400 border-t border-[#1E293B] pt-2.5">
          {compMode === 'full_season' &&
            'Comparando los registros actuales de 2026-27 contra el listón final completo de los 82 partidos de 2025-26 (incluye % del récord alcanzado).'}
          {compMode === 'same_opening' &&
            `Comparando manzana con manzana el arranque actual de 2026-27 frente a exactamente los primeros ${data.openingGamesPerTeam} partidos inaugurales de cada franquicia/jugador en 2025-26.`}
          {compMode === 'head_to_head' &&
            'Enfrentando únicamente tasas por partido y topes máximos homologables cara a cara (excluyendo totales acumulados asimétricos) para medir ritmo neto.'}
        </p>
      </div>

      {/* BLOCK 1: Global Macro NBA Comparison */}
      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">
              {experienceMode === 'simple'
                ? '01. ¿Cómo se juega este año en la NBA vs el pasado?'
                : '01. Datos Globales Comparativos NBA (Pace, 4 Factores y Pintura)'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
              {(
                [
                  { id: 'basic', label: 'Esenciales' },
                  { id: 'advanced', label: 'Ritmo, Puntería y Pintura' },
                  { id: 'all', label: `Todos (${globalRows.length})` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setGlobalLayer(opt.id)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    globalLayer === opt.id
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {experienceMode === 'simple' && (
              <button
                type="button"
                onClick={onSwitchToAdvanced}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] border border-[#1E293B] rounded-lg text-orange-400 transition-colors whitespace-nowrap shrink-0"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Ver todo en Modo Avanzado</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {/* Mobile Global Indicators Cards (< md) */}
          <div className="md:hidden divide-y divide-[#1E293B]">
            {visibleGlobalRows.map((r) => {
              const diff = r.cur - r.prev;
              const pct = r.prev !== 0 ? (diff / Math.abs(r.prev)) * 100 : 0;
              const isGood = r.lowerIsBetter ? diff <= 0 : diff >= 0;

              return (
                <div key={r.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 font-medium text-xs sm:text-sm text-slate-100 min-w-0">
                      <span className="leading-snug">{r.label}</span>
                      <MetricInfoTooltip
                        helpKey={r.id}
                        fallbackTitle={r.label}
                        align="left"
                      />
                    </div>
                    {seasonFocus === 'compare' && (
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <span
                          className={`text-xs font-semibold ${
                            Math.abs(pct) < 0.4
                              ? 'text-slate-400'
                              : isGood
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {diff > 0.1 ? '▲ ' : diff < -0.1 ? '▼ ' : ''}
                          {formatSigned(pct, 1, '%')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-3 py-2 text-xs">
                    {seasonFocus !== '2026' && (
                      <div>
                        <span className="text-[10px] text-slate-400">2026-27</span>
                        <div className="font-mono tabular-nums font-semibold text-orange-300 mt-0.5">
                          {r.cur.toFixed(1)}
                          {r.unit === '%' ? '%' : ` ${r.unit}`}
                        </div>
                      </div>
                    )}
                    {seasonFocus !== '2027' && (
                      <div className={seasonFocus === 'compare' ? 'text-right' : ''}>
                        <span className="text-[10px] text-slate-400">
                          {compMode === 'same_opening'
                            ? `25-26 (${data.openingGamesPerTeam} PJ)`
                            : '2025-26'}
                        </span>
                        <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                          {r.prev.toFixed(1)}
                          {r.unit === '%' ? '%' : ` ${r.unit}`}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Global Macro Table (md+) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                  <th className="py-3 pl-4 pr-3 font-medium">
                    <ColumnHelpHeader
                      label="Indicador Global NBA"
                      align="left"
                      customHelp={{
                        title: 'Promedios globales de toda la liga',
                        simpleDesc:
                          'Mide el estilo de juego medio sumando todos los partidos disputados por los 30 equipos de la NBA.',
                        calculation:
                          'Pasa el ratón sobre el icono (i) a la derecha de cada métrica para ver su significado y fórmula exacta.',
                      }}
                    />
                  </th>
                  {seasonFocus !== '2026' && (
                    <th className="py-3 px-3 font-medium text-right">
                      <ColumnHelpHeader
                        label="Temporada 2026-27"
                        customHelp={{
                          title: 'Promedio actual 2026-27',
                          simpleDesc: 'Dato medio registrado en lo que llevamos de temporada actual.',
                          calculation: 'Agregación oficial de todos los partidos de liga disputados en 2026-27.',
                        }}
                      />
                    </th>
                  )}
                  {seasonFocus !== '2027' && (
                    <th className="py-3 px-3 font-medium text-right">
                      <ColumnHelpHeader
                        label={refHeaderTitle}
                        customHelp={{
                          title: 'Temporada pasada de referencia',
                          simpleDesc:
                            'Valor registrado la temporada 2025-26 según el modo de comparación elegido arriba.',
                          calculation: 'Agregación oficial de los partidos de 2025-26 (curso completo o mismo tramo inicial).',
                        }}
                      />
                    </th>
                  )}
                  {seasonFocus === 'compare' && (
                    <>
                      <th className="py-3 px-3 font-medium text-right">
                        <ColumnHelpHeader
                          label="Diferencia"
                          customHelp={{
                            title: 'Cambio respecto al año pasado',
                            simpleDesc:
                              'Cuántos puntos o puntos porcentuales ha subido o bajado la media de la liga este curso.',
                            calculation: 'Resta directa: Valor medio 2026-27 − Valor de referencia 2025-26.',
                          }}
                        />
                      </th>
                      <th className="py-3 pl-3 pr-4 font-medium text-right">
                        <ColumnHelpHeader label="Variación %" helpKey="pctDelta" />
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-sm">
                {visibleGlobalRows.map((r) => {
                  const diff = r.cur - r.prev;
                  const pct = r.prev !== 0 ? (diff / Math.abs(r.prev)) * 100 : 0;
                  const isGood = r.lowerIsBetter ? diff <= 0 : diff >= 0;

                  return (
                    <tr key={r.id} className="hover:bg-[#182338] transition-colors">
                      <td className="py-2.5 pl-4 pr-3 font-medium text-slate-100 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{r.label}</span>
                          <MetricInfoTooltip
                            helpKey={r.id}
                            fallbackTitle={r.label}
                            align="left"
                          />
                        </span>
                      </td>
                      {seasonFocus !== '2026' && (
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-orange-300 whitespace-nowrap">
                          {r.cur.toFixed(1)}
                          {r.unit === '%' ? '%' : ` ${r.unit}`}
                        </td>
                      )}
                      {seasonFocus !== '2027' && (
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {r.prev.toFixed(1)}
                          {r.unit === '%' ? '%' : ` ${r.unit}`}
                        </td>
                      )}
                      {seasonFocus === 'compare' && (
                        <>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <span
                              className={
                                Math.abs(diff) < 0.15
                                  ? 'text-slate-400'
                                  : isGood
                                  ? 'text-emerald-400 font-medium'
                                  : 'text-rose-400 font-medium'
                              }
                            >
                              {formatSigned(diff, 1, r.unit === '%' ? ' pp' : '')}
                            </span>
                          </td>
                          <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                            <span
                              className={
                                Math.abs(pct) < 0.4
                                  ? 'text-slate-400'
                                  : isGood
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }
                            >
                              {diff > 0.1 ? '▲ ' : diff < -0.1 ? '▼ ' : ''}
                              {formatSigned(pct, 1, '%')}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* BLOCK 2: Single-Game Records (Topes en un partido) */}
      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">
              02. Hitos Explosivos en un Único Partido (Topes de una Noche)
            </h2>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg self-start overflow-x-auto no-scrollbar max-w-full">
            {(
              [
                { id: 'all', label: 'Todos los topes' },
                { id: 'player', label: 'Jugadores' },
                { id: 'team', label: 'Equipos' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSgCategory(opt.id)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  sgCategory === opt.id
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {/* Mobile Single-Game Records Cards (< md) */}
          <div className="md:hidden divide-y divide-[#1E293B]">
            {filteredSingleGame.map((rec) => {
              const refPerf =
                compMode === 'same_opening'
                  ? rec.prev2026Opening
                  : rec.prev2026Full;
              const curVal = rec.current2027?.value ?? 0;
              const prevVal = refPerf?.value ?? 0;
              const diff = curVal - prevVal;
              const ratioPct =
                prevVal > 0 ? Math.round((curVal / prevVal) * 100) : 0;

              return (
                <div key={rec.metricId} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 font-semibold text-xs sm:text-sm text-slate-100 min-w-0">
                      <span className="truncate">{rec.metricLabel}</span>
                      <MetricInfoTooltip
                        helpKey={rec.metricId}
                        fallbackTitle={rec.metricLabel}
                        align="left"
                      />
                    </div>
                    {seasonFocus === 'compare' && (
                      <div className="font-mono tabular-nums text-xs shrink-0">
                        {compMode === 'full_season' ? (
                          <span
                            className={
                              ratioPct >= 100
                                ? 'text-emerald-400 font-semibold'
                                : 'text-slate-300'
                            }
                          >
                            {ratioPct}% tope
                          </span>
                        ) : (
                          <span
                            className={
                              diff > 0
                                ? 'text-emerald-400 font-semibold'
                                : diff < 0
                                ? 'text-rose-400'
                                : 'text-slate-300'
                            }
                          >
                            {formatSigned(diff, rec.decimals ?? 0)} {rec.unit}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg p-2.5">
                    {seasonFocus !== '2026' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-orange-400 shrink-0">
                          26-27
                        </span>
                        <div className="min-w-0 flex-1 flex justify-end">
                          {renderPerfCell(
                            rec.current2027,
                            rec.category,
                            rec.unit,
                            rec.decimals ?? 0,
                            true
                          )}
                        </div>
                      </div>
                    )}
                    {seasonFocus === 'compare' && (
                      <div className="border-t border-[#1E293B]/70" />
                    )}
                    {seasonFocus !== '2027' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          25-26
                        </span>
                        <div className="min-w-0 flex-1 flex justify-end">
                          {renderPerfCell(
                            refPerf,
                            rec.category,
                            rec.unit,
                            rec.decimals ?? 0,
                            false
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Single-Game Records Table (md+) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                  <th className="py-3 pl-4 pr-3 font-medium">
                    <ColumnHelpHeader
                      label="Récord en un Partido"
                      align="left"
                      customHelp={{
                        title: 'Mejor marca lograda en una sola noche',
                        simpleDesc:
                          'Muestra la actuación individual o colectiva más alta registrada en un único partido.',
                        calculation:
                          'Máximo absoluto máx(x) escaneando todas las hojas de partido oficiales de jugadores y equipos.',
                      }}
                    />
                  </th>
                  {seasonFocus !== '2026' && (
                    <th className="py-3 px-3 font-medium">
                      <ColumnHelpHeader
                        label="Tope Temporada 2026-27"
                        align="left"
                        customHelp={{
                          title: 'Récord actual 2026-27',
                          simpleDesc:
                            'Pulsa sobre el nombre del jugador o equipo para abrir su ficha completa.',
                          calculation: 'Mayor registro logrado en una sola noche durante la temporada 2026-27.',
                        }}
                      />
                    </th>
                  )}
                  {seasonFocus !== '2027' && (
                    <th className="py-3 px-3 font-medium">
                      <ColumnHelpHeader
                        label={`Tope ${refHeaderTitle}`}
                        align="left"
                        customHelp={{
                          title: 'Récord de la temporada pasada',
                          simpleDesc:
                            'Mejor actuación en una sola noche durante el tramo comparado de 2025-26.',
                          calculation: 'Mayor registro logrado en un partido durante el periodo seleccionado de 2025-26.',
                        }}
                      />
                    </th>
                  )}
                  {seasonFocus === 'compare' && (
                    <th className="py-3 pl-3 pr-4 font-medium text-right">
                      <ColumnHelpHeader
                        label={
                          compMode === 'full_season'
                            ? '% del récord 25-26'
                            : 'Comparativa Tope'
                        }
                        customHelp={{
                          title: 'Comparativa frente al tope anterior',
                          simpleDesc:
                            'Indica cómo de cerca está el récord de este año respecto al techo del curso pasado (si llega o supera el 100%, ya lo ha batido).',
                          calculation:
                            '(Tope 2026-27 / Tope 2025-26) × 100 y diferencia neta (Tope 26-27 − Tope 25-26).',
                        }}
                      />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-sm">
                {filteredSingleGame.map((rec) => {
                  const refPerf =
                    compMode === 'same_opening'
                      ? rec.prev2026Opening
                      : rec.prev2026Full;
                  const curVal = rec.current2027?.value ?? 0;
                  const prevVal = refPerf?.value ?? 0;
                  const diff = curVal - prevVal;
                  const ratioPct =
                    prevVal > 0 ? Math.round((curVal / prevVal) * 100) : 0;

                  return (
                    <tr key={rec.metricId} className="hover:bg-[#182338] transition-colors">
                      <td className="py-3 pl-4 pr-3">
                        <div className="inline-flex items-center gap-1.5 font-medium text-slate-100 whitespace-nowrap">
                          <span>{rec.metricLabel}</span>
                          <MetricInfoTooltip
                            helpKey={rec.metricId}
                            fallbackTitle={rec.metricLabel}
                            align="left"
                          />
                        </div>
                        <div className="text-xs text-slate-400">
                          {rec.category === 'player' ? 'Hito individual' : 'Hito colectivo'}
                        </div>
                      </td>

                      {seasonFocus !== '2026' && (
                        <td className="py-3 px-3">
                          {renderPerfCell(
                            rec.current2027,
                            rec.category,
                            rec.unit,
                            rec.decimals ?? 0,
                            true
                          )}
                        </td>
                      )}

                      {seasonFocus !== '2027' && (
                        <td className="py-3 px-3">
                          {renderPerfCell(
                            refPerf,
                            rec.category,
                            rec.unit,
                            rec.decimals ?? 0,
                            false
                          )}
                        </td>
                      )}

                      {seasonFocus === 'compare' && (
                        <td className="py-3 pl-3 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                          {compMode === 'full_season' ? (
                            <div>
                              <span
                                className={
                                  ratioPct >= 100
                                    ? 'text-emerald-400 font-semibold'
                                    : 'text-slate-200 font-medium'
                                }
                              >
                                {ratioPct}% del tope
                              </span>
                              <div className="text-xs text-slate-400">
                                {formatSigned(diff, rec.decimals ?? 0)} {rec.unit}
                              </div>
                            </div>
                          ) : (
                            <span
                              className={
                                diff > 0
                                  ? 'text-emerald-400 font-semibold'
                                  : diff < 0
                                  ? 'text-rose-400 font-medium'
                                  : 'text-slate-300'
                              }
                            >
                              {diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : ''}
                              {formatSigned(diff, rec.decimals ?? 0)} {rec.unit}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* BLOCK 3: Season Leaders (Basic, Offensive Rebounds, 3PM, TD3, Advanced, Zone & Hustle) */}
      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">
              {experienceMode === 'simple'
                ? '03. Líderes de la NBA en cada categoría'
                : '03. Líderes de Temporada (Básicas, Avanzadas, Zona y Hustle)'}
            </h2>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'shooting_scoring', label: 'Triples y Anotación' },
                { id: 'rebounding', label: 'Rebotes' },
                { id: 'playmaking_allaround', label: 'Pases y Defensa' },
                {
                  id: 'advanced_hustle',
                  label:
                    experienceMode === 'simple'
                      ? 'Pintura y Esfuerzo'
                      : 'Avanzadas y Hustle',
                },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setLeaderGroup(g.id)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  leaderGroup === g.id
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {/* Mobile Season Leaders Cards (< md) */}
          <div className="md:hidden divide-y divide-[#1E293B]">
            {filteredSeasonLeaders.map((item) => {
              const refHold =
                compMode === 'same_opening'
                  ? item.prev2026Opening
                  : item.prev2026Full;
              const curVal = item.current2027?.value ?? 0;
              const prevVal = refHold?.value ?? 0;
              const diff = curVal - prevVal;

              return (
                <div key={item.metricId} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 font-semibold text-xs sm:text-sm text-slate-100 min-w-0">
                      <span className="truncate">{item.metricLabel}</span>
                      <MetricInfoTooltip
                        helpKey={item.metricId}
                        fallbackTitle={item.metricLabel}
                        align="left"
                      />
                    </div>
                    {seasonFocus === 'compare' && (
                      <div className="font-mono tabular-nums text-xs shrink-0">
                        {item.isCumulativeTotal && compMode === 'full_season' ? (
                          <span className="text-slate-300">
                            {prevVal > 0
                              ? `${Math.round((curVal / prevVal) * 100)}% acum.`
                              : '—'}
                          </span>
                        ) : (
                          <span
                            className={
                              Math.abs(diff) < 0.05
                                ? 'text-slate-400'
                                : (item.lowerIsBetter ? diff < 0 : diff > 0)
                                ? 'text-emerald-400 font-semibold'
                                : 'text-rose-400'
                            }
                          >
                            {formatSigned(diff, item.decimals)} {item.unit}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg p-2.5">
                    {seasonFocus !== '2026' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-orange-400 shrink-0">
                          26-27
                        </span>
                        <div className="min-w-0 flex-1 flex justify-end">
                          {renderLeaderCell(
                            item.current2027,
                            item.entityType,
                            item.unit,
                            item.decimals,
                            true
                          )}
                        </div>
                      </div>
                    )}
                    {seasonFocus === 'compare' && (
                      <div className="border-t border-[#1E293B]/70" />
                    )}
                    {seasonFocus !== '2027' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          25-26
                        </span>
                        <div className="min-w-0 flex-1 flex justify-end">
                          {renderLeaderCell(
                            refHold,
                            item.entityType,
                            item.unit,
                            item.decimals,
                            false
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Season Leaders Table (md+) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                  <th className="py-3 pl-4 pr-3 font-medium">
                    <ColumnHelpHeader
                      label="Categoría Estadística"
                      align="left"
                      customHelp={{
                        title: 'Apartado estadístico liderado',
                        simpleDesc:
                          'Quién encabeza toda la NBA en promedios por partido o totales acumulados.',
                        calculation:
                          'Ordenación descendente (o ascendente en DefRtg) entre los jugadores/equipos que cumplen el mínimo oficial de partidos.',
                      }}
                    />
                  </th>
                  {seasonFocus !== '2026' && (
                    <th className="py-3 px-3 font-medium">
                      <ColumnHelpHeader
                        label="Líder 2026-27"
                        align="left"
                        customHelp={{
                          title: 'Número 1 actual en 2026-27',
                          simpleDesc: 'Pulsa sobre el líder para inspeccionar todos sus partidos.',
                          calculation: 'Mejor promedio o total acumulado registrado en la temporada 2026-27.',
                        }}
                      />
                    </th>
                  )}
                  {seasonFocus !== '2027' && (
                    <th className="py-3 px-3 font-medium">
                      <ColumnHelpHeader
                        label={`Líder ${refHeaderTitle}`}
                        align="left"
                        customHelp={{
                          title: 'Número 1 en 2025-26',
                          simpleDesc: 'Líder de la temporada anterior en este mismo apartado.',
                          calculation: 'Mejor promedio o total registrado en el corte seleccionado de 2025-26.',
                        }}
                      />
                    </th>
                  )}
                  {seasonFocus === 'compare' && (
                    <th className="py-3 pl-3 pr-4 font-medium text-right">
                      <ColumnHelpHeader
                        label="Diferencial Líder"
                        customHelp={{
                          title: 'Diferencia entre ambos líderes',
                          simpleDesc:
                            'Compara la marca del líder actual frente a la del líder del curso pasado.',
                          calculation: 'Resta directa: Marca del líder 2026-27 − Marca del líder 2025-26.',
                        }}
                      />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-sm">
                {filteredSeasonLeaders.map((item) => {
                  const refHold =
                    compMode === 'same_opening'
                      ? item.prev2026Opening
                      : item.prev2026Full;
                  const curVal = item.current2027?.value ?? 0;
                  const prevVal = refHold?.value ?? 0;
                  const diff = curVal - prevVal;

                  return (
                    <tr key={item.metricId} className="hover:bg-[#182338] transition-colors">
                      <td className="py-3 pl-4 pr-3">
                        <div className="inline-flex items-center gap-1.5 font-medium text-slate-100 whitespace-nowrap">
                          <span>{item.metricLabel}</span>
                          <MetricInfoTooltip
                            helpKey={item.metricId}
                            fallbackTitle={item.metricLabel}
                            align="left"
                          />
                        </div>
                        <div className="text-xs text-slate-400">
                          {item.entityType === 'player'
                            ? 'Especialista individual'
                            : 'Líder colectivo'}
                        </div>
                      </td>

                      {seasonFocus !== '2026' && (
                        <td className="py-3 px-3">
                          {renderLeaderCell(
                            item.current2027,
                            item.entityType,
                            item.unit,
                            item.decimals,
                            true
                          )}
                        </td>
                      )}

                      {seasonFocus !== '2027' && (
                        <td className="py-3 px-3">
                          {renderLeaderCell(
                            refHold,
                            item.entityType,
                            item.unit,
                            item.decimals,
                            false
                          )}
                        </td>
                      )}

                      {seasonFocus === 'compare' && (
                        <td className="py-3 pl-3 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                          {item.isCumulativeTotal && compMode === 'full_season' ? (
                            <span className="text-xs text-slate-300">
                              {prevVal > 0
                                ? `${Math.round((curVal / prevVal) * 100)}% acumulado`
                                : '—'}
                            </span>
                          ) : (
                            <span
                              className={
                                Math.abs(diff) < 0.05
                                  ? 'text-slate-400'
                                  : (item.lowerIsBetter ? diff < 0 : diff > 0)
                                  ? 'text-emerald-400 font-medium'
                                  : 'text-rose-400 font-medium'
                              }
                            >
                              {diff > 0.05 ? '▲ ' : diff < -0.05 ? '▼ ' : ''}
                              {formatSigned(diff, item.decimals)} {item.unit}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
