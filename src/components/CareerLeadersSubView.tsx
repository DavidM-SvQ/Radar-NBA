import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Crown,
  Flame,
  Loader2,
  Search,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import type {
  CareerHighEntry,
  CareerLeaderEntry,
  CareerLeadersResponse,
  CareerScope,
} from '../types/nba';
import { normalizeSearchText } from '../utils/analytics';
import { STICKY_THEAD_CLASS } from '../utils/tableSort';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import { buildTableSnapshotBlob } from '../utils/exportImageCard';

interface CareerLeadersSubViewProps {
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
}

type LeaderViewMode = 'totals' | 'averages' | 'highs';

interface LeaderMetricSpec {
  id: string;
  label: string;
  shortLabel: string;
  modes: LeaderViewMode[];
  getValue: (e: CareerLeaderEntry, mode: LeaderViewMode) => number;
  getHighMeta?: (e: CareerLeaderEntry) => CareerHighEntry | null;
  format: (val: number, mode: LeaderViewMode) => string;
  minGpForAvg?: number;
}

const LEADER_METRICS: LeaderMetricSpec[] = [
  {
    id: 'pts',
    label: 'Puntos',
    shortLabel: 'PTS',
    modes: ['totals', 'averages', 'highs'],
    getValue: (e, m) => (m === 'totals' ? e.pts : m === 'averages' ? e.ptsPg : e.highPts?.value ?? 0),
    getHighMeta: (e) => e.highPts,
    format: (v, m) => (m === 'averages' ? v.toFixed(1) : Math.round(v).toLocaleString('es-ES')),
    minGpForAvg: 100,
  },
  {
    id: 'reb',
    label: 'Rebotes',
    shortLabel: 'REB',
    modes: ['totals', 'averages', 'highs'],
    getValue: (e, m) => (m === 'totals' ? e.reb : m === 'averages' ? e.rebPg : e.highReb?.value ?? 0),
    getHighMeta: (e) => e.highReb,
    format: (v, m) => (m === 'averages' ? v.toFixed(1) : Math.round(v).toLocaleString('es-ES')),
    minGpForAvg: 100,
  },
  {
    id: 'ast',
    label: 'Asistencias',
    shortLabel: 'AST',
    modes: ['totals', 'averages', 'highs'],
    getValue: (e, m) => (m === 'totals' ? e.ast : m === 'averages' ? e.astPg : e.highAst?.value ?? 0),
    getHighMeta: (e) => e.highAst,
    format: (v, m) => (m === 'averages' ? v.toFixed(1) : Math.round(v).toLocaleString('es-ES')),
    minGpForAvg: 100,
  },
  {
    id: 'fg3m',
    label: 'Triples',
    shortLabel: '3PM',
    modes: ['totals', 'averages', 'highs'],
    getValue: (e, m) => (m === 'totals' ? e.fg3m : m === 'averages' ? e.fg3mPg : e.high3pm?.value ?? 0),
    getHighMeta: (e) => e.high3pm,
    format: (v, m) => (m === 'averages' ? v.toFixed(1) : Math.round(v).toLocaleString('es-ES')),
    minGpForAvg: 100,
  },
  {
    id: 'stl',
    label: 'Robos',
    shortLabel: 'ROB',
    modes: ['totals', 'averages', 'highs'],
    getValue: (e, m) => (m === 'totals' ? e.stl : m === 'averages' ? e.stlPg : e.highStl?.value ?? 0),
    getHighMeta: (e) => e.highStl,
    format: (v, m) => (m === 'averages' ? v.toFixed(1) : Math.round(v).toLocaleString('es-ES')),
    minGpForAvg: 100,
  },
  {
    id: 'blk',
    label: 'Tapones',
    shortLabel: 'TAP',
    modes: ['totals', 'averages', 'highs'],
    getValue: (e, m) => (m === 'totals' ? e.blk : m === 'averages' ? e.blkPg : e.highBlk?.value ?? 0),
    getHighMeta: (e) => e.highBlk,
    format: (v, m) => (m === 'averages' ? v.toFixed(1) : Math.round(v).toLocaleString('es-ES')),
    minGpForAvg: 100,
  },
  {
    id: 'gmsc',
    label: 'Game Score',
    shortLabel: 'GmSc',
    modes: ['averages', 'highs'],
    getValue: (e, m) => (m === 'averages' ? e.gmScPg : e.highGmSc?.value ?? 0),
    getHighMeta: (e) => e.highGmSc,
    format: (v) => v.toFixed(1),
    minGpForAvg: 100,
  },
  {
    id: 'pra',
    label: 'PTS+REB+AST',
    shortLabel: 'PRA',
    modes: ['highs'],
    getValue: (e) => e.highPra?.value ?? 0,
    getHighMeta: (e) => e.highPra,
    format: (v) => String(Math.round(v)),
  },
  {
    id: 'gp',
    label: 'Partidos',
    shortLabel: 'PJ',
    modes: ['totals'],
    getValue: (e) => e.gp,
    format: (v) => Math.round(v).toLocaleString('es-ES'),
  },
  {
    id: 'min',
    label: 'Minutos',
    shortLabel: 'MIN',
    modes: ['totals', 'averages'],
    getValue: (e, m) => (m === 'totals' ? e.min : e.minPg),
    format: (v, m) => (m === 'averages' ? v.toFixed(1) : Math.round(v).toLocaleString('es-ES')),
    minGpForAvg: 100,
  },
  {
    id: 'dd2',
    label: 'Dobles-Dobles',
    shortLabel: 'DD',
    modes: ['totals'],
    getValue: (e) => e.dd2,
    format: (v) => Math.round(v).toLocaleString('es-ES'),
  },
  {
    id: 'td3',
    label: 'Triples-Dobles',
    shortLabel: 'TD',
    modes: ['totals'],
    getValue: (e) => e.td3,
    format: (v) => Math.round(v).toLocaleString('es-ES'),
  },
  {
    id: 'tsPct',
    label: 'True Shooting %',
    shortLabel: 'TS%',
    modes: ['averages'],
    getValue: (e) => e.tsPct,
    format: (v) => `${v.toFixed(1)}%`,
    minGpForAvg: 150,
  },
];

const leadersClientCache = new Map<CareerScope, CareerLeadersResponse>();

function formatDateShort(iso: string): string {
  if (!iso || iso.length < 10) return iso || '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function CareerLeadersSubView({ onInspectEntity }: CareerLeadersSubViewProps) {
  const [scope, setScope] = useState<CareerScope>('regular');
  const [viewMode, setViewMode] = useState<LeaderViewMode>('totals');
  const [metricId, setMetricId] = useState<string>('pts');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [minSeasons, setMinSeasons] = useState<number>(1);
  const [visibleLimit, setVisibleLimit] = useState<number>(50);

  const [data, setData] = useState<CareerLeadersResponse | null>(
    () => leadersClientCache.get('regular') ?? null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = leadersClientCache.get(scope);
    if (cached) {
      setData(cached);
      setErrorMsg(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    fetch(`/api/nba/history/leaders?scope=${scope}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'No se pudieron cargar los líderes históricos.');
        }
        return res.json() as Promise<CareerLeadersResponse>;
      })
      .then((payload) => {
        if (cancelled) return;
        leadersClientCache.set(scope, payload);
        setData(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err?.message || 'Error al cargar líderes de carrera.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const availableMetrics = useMemo(
    () => LEADER_METRICS.filter((m) => m.modes.includes(viewMode)),
    [viewMode]
  );

  useEffect(() => {
    if (!availableMetrics.some((m) => m.id === metricId)) {
      setMetricId(availableMetrics[0]?.id || 'pts');
    }
  }, [availableMetrics, metricId]);

  const activeMetric = useMemo(
    () => availableMetrics.find((m) => m.id === metricId) || availableMetrics[0],
    [availableMetrics, metricId]
  );

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of data?.leaders || []) {
      if (l.teamAbbr && l.teamAbbr !== 'NBA') set.add(l.teamAbbr);
    }
    return [...set].sort();
  }, [data]);

  const filteredLeaders = useMemo(() => {
    const list = data?.leaders || [];
    const q = normalizeSearchText(searchQuery);
    const minGpThreshold =
      viewMode === 'averages'
        ? scope === 'playoffs'
          ? 20
          : activeMetric.minGpForAvg || 80
        : 1;

    return list
      .filter((e) => {
        if (teamFilter !== 'ALL' && e.teamAbbr !== teamFilter) return false;
        if (e.seasonsCount < minSeasons) return false;
        if (e.gp < minGpThreshold) return false;
        const val = activeMetric.getValue(e, viewMode);
        if (val <= 0) return false;
        if (q) {
          const hay = normalizeSearchText(`${e.name} ${e.teamAbbr} ${e.position} ${e.rookieSeason}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const va = activeMetric.getValue(a, viewMode);
        const vb = activeMetric.getValue(b, viewMode);
        if (vb !== va) return vb - va;
        return b.gp - a.gp;
      });
  }, [data, searchQuery, teamFilter, minSeasons, viewMode, scope, activeMetric]);

  const handleExportLeaders = async () => {
    const top20 = filteredLeaders.slice(0, 20);
    if (top20.length === 0) throw new Error('Sin datos para exportar');
    const scopeLabel = scope === 'playoffs' ? 'Playoffs' : 'Temporada Regular';
    const modeLabel =
      viewMode === 'totals'
        ? 'Totales Acumulados de Carrera'
        : viewMode === 'averages'
        ? 'Promedios de Carrera'
        : 'Career Highs en 1 Partido';

    const leader1 = top20[0];
    const leader2 = top20[1];
    const v1 = activeMetric.format(activeMetric.getValue(leader1, viewMode), viewMode);
    const v2 = leader2 ? activeMetric.format(activeMetric.getValue(leader2, viewMode), viewMode) : '';
    const verdict = `${leader1.name} (${leader1.teamAbbr}) lidera a todos los jugadores NBA en activo en ${activeMetric.label} (${modeLabel} · ${scopeLabel}) con ${v1} ${activeMetric.shortLabel}${
      leader2 ? `, por delante de ${leader2.name} (${v2}).` : '.'
    }`;

    return buildTableSnapshotBlob({
      filename: `radarnba_lideres_carrera_${activeMetric.id}_${viewMode}_${scope}.png`,
      categoryTag: `HISTÓRICO NBA EN ACTIVO · ${scopeLabel.toUpperCase()}`,
      title: `Líderes de Carrera — ${activeMetric.label} (${modeLabel})`,
      subtitle: `${filteredLeaders.length} jugadores clasificados · Cobertura 2003-04 a 2026-27`,
      entityColumnLabel: 'Jugador',
      showRank: true,
      columns: [
        { key: 'seasons', label: 'Temp.', align: 'right', widthWeight: 0.7 },
        { key: 'gp', label: 'PJ', align: 'right', widthWeight: 0.8 },
        { key: 'main', label: activeMetric.shortLabel, align: 'right', widthWeight: 1.1 },
        { key: 'context', label: viewMode === 'highs' ? 'Partido / Fecha' : 'PTS/PJ', align: 'right', widthWeight: 1.4 },
        { key: 'ts', label: 'TS%', align: 'right', widthWeight: 0.8 },
      ],
      rows: top20.map((e, i) => {
        const highMeta = viewMode === 'highs' ? activeMetric.getHighMeta?.(e) : null;
        return {
          rank: i + 1,
          teamAbbr: e.teamAbbr,
          entityName: e.name,
          entitySubtext: `${e.teamAbbr} · desde ${e.rookieSeason}`,
          cells: {
            seasons: String(e.seasonsCount),
            gp: e.gp.toLocaleString('es-ES'),
            main: {
              text: activeMetric.format(activeMetric.getValue(e, viewMode), viewMode),
              tone: i === 0 ? 'accent' : 'neutral',
            },
            context:
              viewMode === 'highs' && highMeta
                ? `${highMeta.season} · vs ${highMeta.opponentAbbr}`
                : `${e.ptsPg.toFixed(1)} PTS`,
            ts: `${e.tsPct.toFixed(1)}%`,
          },
        };
      }),
      editorialVerdict: verdict,
      editorialVerdictTone: 'accent',
    });
  };

  if (loading && !data) {
    return (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-10 flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
        <p className="text-sm font-medium text-white">
          Cargando buscador global de líderes y récords acumulados...
        </p>
        <p className="text-xs text-slate-400">
          Indexando carreras completas NBA (2003-04 a 2026-27)
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="bg-[#131C2E] border border-rose-500/30 rounded-xl p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">Error al cargar líderes históricos</p>
          <p className="text-xs text-slate-400 mt-1">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Control Header */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Regular / Playoffs Switcher */}
            <div className="inline-flex rounded-lg bg-[#0B1120] border border-[#1E293B] p-0.5">
              <button
                type="button"
                onClick={() => setScope('regular')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  scope === 'regular'
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Temporada Regular
              </button>
              <button
                type="button"
                onClick={() => setScope('playoffs')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  scope === 'playoffs'
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Playoffs
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="inline-flex rounded-lg bg-[#0B1120] border border-[#1E293B] p-0.5">
              {(
                [
                  { id: 'totals', label: 'Totales Acumulados' },
                  { id: 'averages', label: 'Promedios Carrera' },
                  { id: 'highs', label: 'Career Highs (1 Partido)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setViewMode(tab.id);
                    setVisibleLimit(50);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    viewMode === tab.id
                      ? 'bg-[#1E293B] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <ExportImageButton
            onBuildImage={handleExportLeaders}
            label="Exportar Top 20 PNG"
            disabled={filteredLeaders.length === 0}
          />
        </div>

        {/* Metric Selector Strip */}
        <div className="flex flex-wrap items-center gap-1.5">
          {availableMetrics.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMetricId(m.id);
                setVisibleLimit(50);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                metricId === m.id
                  ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                  : 'bg-[#0B1120] border-[#1E293B] text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Search & Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar jugador activo, equipo o año de debut (ej. LeBron, Curry, Jokic, LAL)..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>
          <div className="sm:col-span-3">
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">Todos los equipos ({teamOptions.length})</option>
              {teamOptions.map((abbr) => (
                <option key={abbr} value={abbr}>
                  {abbr}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <select
              value={minSeasons}
              onChange={(e) => setMinSeasons(Number(e.target.value))}
              className="w-full h-9 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value={1}>Experiencia: Todas</option>
              <option value={3}>3+ temporadas NBA</option>
              <option value={5}>5+ temporadas NBA</option>
              <option value={10}>10+ temporadas (Veteranos)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Imminent Career Round-Number Milestones Strip */}
      {scope === 'regular' && data && data.imminentMilestones.length > 0 && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">
                Barreras Históricas de Carrera Inminentes
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              Jugadores en activo a las puertas de una cifra redonda en su carrera NBA
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {data.imminentMilestones.slice(0, 8).map((m) => (
              <button
                key={`${m.playerId}-${m.metricKey}-${m.targetValue}`}
                type="button"
                onClick={() => onInspectEntity('player', m.playerId)}
                className="text-left bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/40 rounded-lg p-3 transition-colors group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlayerAvatar
                      playerId={m.playerId}
                      name={m.name}
                      teamAbbr={m.teamAbbr}
                      size="xs"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate group-hover:text-orange-300">
                        {m.name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {m.teamAbbr} · {m.metricLabel}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold font-mono tabular-nums text-amber-300 shrink-0">
                    -{m.remaining.toLocaleString('es-ES')}
                  </span>
                </div>

                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-300 mb-1">
                    <span>{m.currentValue.toLocaleString('es-ES')}</span>
                    <span className="text-orange-300 font-semibold">
                      Meta: {m.targetValue.toLocaleString('es-ES')}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#1E293B] overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full"
                      style={{ width: `${Math.min(100, m.progressPct)}%` }}
                    />
                  </div>
                  {m.estGamesToReach !== null && (
                    <p className="text-[10px] text-slate-400 mt-1 font-mono tabular-nums">
                      Est. ~{m.estGamesToReach} {m.estGamesToReach === 1 ? 'partido' : 'partidos'}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Leaders Table */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {viewMode === 'highs' ? (
              <Flame className="w-4 h-4 text-orange-400" />
            ) : (
              <Trophy className="w-4 h-4 text-orange-400" />
            )}
            <h3 className="text-sm font-semibold text-white">
              Ranking Histórico en Activo — {activeMetric.label}
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            Mostrando {Math.min(visibleLimit, filteredLeaders.length)} de {filteredLeaders.length}{' '}
            jugadores · {scope === 'playoffs' ? 'Playoffs' : 'Temporada Regular'}
            {viewMode === 'averages' &&
              ` · mín. ${scope === 'playoffs' ? 20 : activeMetric.minGpForAvg || 80} PJ`}
          </span>
        </div>

        {filteredLeaders.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No se encontraron jugadores con los filtros actuales.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className={STICKY_THEAD_CLASS}>
                  <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
                    <th className="px-3 py-2.5 text-left w-10">#</th>
                    <th className="px-3 py-2.5 text-left">Jugador</th>
                    <th className="px-2 py-2.5 text-left">Eq.</th>
                    <th className="px-2 py-2.5 text-right">Temp.</th>
                    <th className="px-2 py-2.5 text-right">PJ</th>
                    <th className="px-3 py-2.5 text-right text-orange-300">
                      {activeMetric.shortLabel}{' '}
                      {viewMode === 'totals'
                        ? '(Tot.)'
                        : viewMode === 'averages'
                        ? '(Med.)'
                        : '(Récord)'}
                    </th>
                    {viewMode === 'highs' ? (
                      <>
                        <th className="px-3 py-2.5 text-left">Fecha y Rival</th>
                        <th className="px-2 py-2.5 text-right">Temporada</th>
                      </>
                    ) : (
                      <>
                        <th className="px-2 py-2.5 text-right">PTS/PJ</th>
                        <th className="px-2 py-2.5 text-right">REB/PJ</th>
                        <th className="px-2 py-2.5 text-right">AST/PJ</th>
                        <th className="px-2 py-2.5 text-right">TS%</th>
                        <th className="px-3 py-2.5 text-right">GmSc</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {filteredLeaders.slice(0, visibleLimit).map((entry, idx) => {
                    const mainVal = activeMetric.getValue(entry, viewMode);
                    const highMeta =
                      viewMode === 'highs' ? activeMetric.getHighMeta?.(entry) : null;
                    return (
                      <tr
                        key={entry.playerId}
                        onClick={() => onInspectEntity('player', entry.playerId)}
                        className="cursor-pointer transition-colors hover:bg-[#182338]"
                      >
                        <td className="px-3 py-2.5 font-mono tabular-nums text-slate-400 font-semibold">
                          {idx === 0 ? (
                            <Crown className="w-4 h-4 text-amber-400" />
                          ) : (
                            idx + 1
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-[180px]">
                            <PlayerAvatar
                              playerId={entry.playerId}
                              name={entry.name}
                              teamAbbr={entry.teamAbbr}
                              size="sm"
                            />
                            <div>
                              <p className="font-semibold text-white">{entry.name}</p>
                              <p className="text-[11px] text-slate-400 font-mono">
                                {entry.position} · desde {entry.rookieSeason}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <TeamLogo abbr={entry.teamAbbr} size="xs" />
                            <span className="font-mono text-slate-300">{entry.teamAbbr}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-300">
                          {entry.seasonsCount}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-300">
                          {entry.gp.toLocaleString('es-ES')}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-orange-300 text-sm">
                          {activeMetric.format(mainVal, viewMode)}
                        </td>
                        {viewMode === 'highs' ? (
                          <>
                            <td className="px-3 py-2.5 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              {highMeta ? (
                                <span>
                                  {formatDateShort(highMeta.date)} · vs {highMeta.opponentAbbr}
                                  {highMeta.result ? ` (${highMeta.result})` : ''}
                                  {highMeta.isCurrentSeason && (
                                    <span className="ml-2 text-amber-300 font-sans font-semibold inline-flex items-center gap-0.5">
                                      <Sparkles className="w-3 h-3" /> 26-27
                                    </span>
                                  )}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-400">
                              {highMeta?.season || '—'}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-200">
                              {entry.ptsPg.toFixed(1)}
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-300">
                              {entry.rebPg.toFixed(1)}
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-300">
                              {entry.astPg.toFixed(1)}
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono tabular-nums text-emerald-300">
                              {entry.tsPct.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">
                              {entry.gmScPg.toFixed(1)}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredLeaders.length > visibleLimit && (
              <div className="p-3 border-t border-[#1E293B] text-center">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + 50)}
                  className="px-4 py-1.5 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/50 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
                >
                  Mostrar 50 jugadores más ({filteredLeaders.length - visibleLimit} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
