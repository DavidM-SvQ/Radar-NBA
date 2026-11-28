import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Info,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unlock,
} from 'lucide-react';
import type {
  FutureDraftPickItem,
  FutureDraftPicksPayload,
  TeamFutureDraftInventory,
} from '../types/nba';
import { getFuturePickCategoryMeta } from '../utils/draftClient';
import { TeamLogo } from './NbaVisuals';

interface DraftFuturePicksTabProps {
  futurePicksData: FutureDraftPicksPayload | null;
  loading: boolean;
  errorMsg: string | null;
  onRefresh: () => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onOpenTradeMachine?: (teamAbbr: string) => void;
}

const FEATURED_WAR_CHEST_TEAMS = ['OKC', 'BKN', 'UTA', 'SAS', 'HOU', 'LAL', 'BOS', 'NYK'];

export function DraftFuturePicksTab({
  futurePicksData,
  loading,
  errorMsg,
  onRefresh,
  onInspectEntity,
  onOpenTradeMachine,
}: DraftFuturePicksTabProps) {
  const [subView, setSubView] = useState<'matrix' | 'team'>('matrix');
  const [selectedTeamAbbr, setSelectedTeamAbbr] = useState<string>('OKC');
  const [matrixSort, setMatrixSort] = useState<
    'draftCapitalScore' | 'controlledFirsts' | 'tradableFirsts' | 'controlledSeconds' | 'favorableSwaps'
  >('draftCapitalScore');
  const [roundFilter, setRoundFilter] = useState<'all' | 1 | 2>('all');
  const [showOutgoing, setShowOutgoing] = useState<boolean>(true);
  const [expandedClauseIds, setExpandedClauseIds] = useState<Record<string, boolean>>({});
  const [showStepienGuide, setShowStepienGuide] = useState<boolean>(true);

  const teams = futurePicksData?.teams || [];
  const years = futurePicksData?.years || [2027, 2028, 2029, 2030, 2031, 2032, 2033];
  const summary = futurePicksData?.summary;

  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      if (b[matrixSort] !== a[matrixSort]) return b[matrixSort] - a[matrixSort];
      return b.draftCapitalScore - a.draftCapitalScore;
    });
  }, [teams, matrixSort]);

  const activeTeam: TeamFutureDraftInventory | null = useMemo(() => {
    return (
      teams.find((t) => t.teamAbbr === selectedTeamAbbr) ||
      sortedTeams[0] ||
      null
    );
  }, [teams, sortedTeams, selectedTeamAbbr]);

  const toggleClause = (pickId: string) => {
    setExpandedClauseIds((prev) => ({ ...prev, [pickId]: !prev[pickId] }));
  };

  const handleSelectTeamDetail = (abbr: string) => {
    setSelectedTeamAbbr(abbr);
    setSubView('team');
  };

  if (loading && !futurePicksData) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-4 space-y-2 animate-pulse">
              <div className="h-3 w-28 bg-[#1E293B] rounded" />
              <div className="h-7 w-20 bg-[#1E293B] rounded" />
              <div className="h-3 w-36 bg-[#1E293B] rounded" />
            </div>
          ))}
        </div>
        <div className="h-80 bg-[#131C2E] border border-[#1E293B] rounded-lg animate-pulse" />
      </div>
    );
  }

  if (errorMsg && !futurePicksData) {
    return (
      <div className="bg-[#131C2E] border border-rose-500/30 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              No se pudo cargar el inventario de rondas futuras (2027–2033)
            </h3>
            <p className="text-xs text-slate-400 mt-1">{errorMsg}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
        <div className="p-4">
          <div className="text-xs text-slate-400">Líder en Capital de Draft</div>
          <div className="mt-1 flex items-center gap-2">
            <TeamLogo abbr={summary?.topCapitalTeamAbbr || 'OKC'} teamId="" size="sm" />
            <span className="font-mono tabular-nums text-xl font-bold text-orange-400">
              {summary?.topCapitalTeamAbbr || '—'}
            </span>
            <span className="font-mono tabular-nums text-xs text-slate-400">
              {summary?.topCapitalScore?.toFixed(1) || '0'} pts
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            Horizonte oficial NBA 2027–2033 (7 años)
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Más 1ª Rondas Controladas</div>
          <div className="mt-1 flex items-center gap-2">
            <TeamLogo abbr={summary?.topFirstsTeamAbbr || 'OKC'} teamId="" size="sm" />
            <span className="font-mono tabular-nums text-xl font-bold text-emerald-400">
              {summary?.topFirstsTeamAbbr || '—'}
            </span>
            <span className="font-mono tabular-nums text-xs text-slate-300 font-semibold">
              {summary?.topFirstsCount || 0} × 1ªR
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {summary?.totalControlledFirsts || 0} primeras rondas activas en la liga
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">1ª Rondas Traspasables Hoy</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-sky-300">
              {summary?.totalTradableFirsts || 0}
            </span>
            <span className="text-xs text-slate-400">libres de Stepien</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {summary?.totalStepienLocks || 0} bloqueadas por Regla Ted Stepien
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">2ª Rondas Controladas</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-slate-100">
              {summary?.totalControlledSeconds || 0}
            </span>
            <span className="text-xs text-slate-400">activos 2ªR</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Siempre traspasables (exentas de Stepien)
          </div>
        </div>
      </div>

      {/* Sub-view Bar + Stepien Rule Helper */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setSubView('matrix')}
              className={`h-8 px-3.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                subView === 'matrix'
                  ? 'bg-orange-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Matriz 30 Franquicias (2027–2033)
            </button>
            <button
              type="button"
              onClick={() => setSubView('team')}
              className={`h-8 px-3.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                subView === 'team'
                  ? 'bg-orange-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Cartera por Franquicia y Stepien
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowStepienGuide((prev) => !prev)}
              className="h-8 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-xs font-semibold text-orange-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {showStepienGuide
                  ? 'Ocultar guía de rondas'
                  : '¿Cómo leer rondas, Swaps y Stepien?'}
              </span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="h-8 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sincronizar picks</span>
            </button>
          </div>
        </div>

        {showStepienGuide && (
          <div className="bg-[#0B1120] border border-orange-500/30 rounded-lg p-4 text-xs text-slate-300 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-semibold text-orange-300 flex items-center gap-1.5">
                <Info className="w-4 h-4 shrink-0" />
                Guía para todos los públicos: cómo entender las Rondas Futuras, Swaps y la Regla Stepien
              </div>
              <button
                type="button"
                onClick={() => setShowStepienGuide(false)}
                className="text-[11px] text-slate-400 hover:text-slate-200 underline"
              >
                Ocultar guía
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-[11px] leading-relaxed">
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-md p-3 space-y-1">
                <div className="font-semibold text-emerald-400">1. Propia sin protección</div>
                <p className="text-slate-300">
                  Es el turno original del equipo en ese Draft. Nadie se la puede quitar ni cambiar: si la franquicia hace mala temporada, elegirá en los puestos altos.
                </p>
              </div>
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-md p-3 space-y-1">
                <div className="font-semibold text-sky-300">2. Recibida (Vía X, sin o con protección)</div>
                <p className="text-slate-300">
                  Turno original de <strong className="text-slate-100">otro equipo</strong> conseguido en un traspaso. Si es <strong className="text-slate-100">sin protección</strong>, te la quedas pase lo que pase. Si lleva <strong className="text-amber-300">Prot. Top 2 o Top 14</strong>, es un seguro: si el sorteo da un puesto dentro de ese Top, el dueño original la retiene y entrega otra compensación pactada.
                </p>
              </div>
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-md p-3 space-y-1">
                <div className="font-semibold text-amber-300">3. ¿Qué es un Swap? (Swap + vs Swap −)</div>
                <p className="text-slate-300">
                  <strong className="text-slate-100">NO es una ronda extra</strong>, sino el derecho a <strong className="text-slate-100">intercambiar turnos</strong>. Con <strong className="text-amber-300">Swap +</strong> te quedas siempre el mejor puesto de los dos (ej. si el tuyo es #18 y el rival es #5, eliges #5). Con <strong className="text-orange-300">Swap −</strong> decide el rival y tú te quedas el puesto más bajo.
                </p>
              </div>
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-md p-3 space-y-1">
                <div className="font-semibold text-rose-300">4. ¿Qué significa «Cedida» (Enviada a…)?</div>
                <p className="text-slate-300">
                  Era una ronda original de esta franquicia, pero <strong className="text-slate-100">ya la traspasó</strong> en un acuerdo anterior. Aparece atenuada para que sepas adónde fue (y si tiene protección, cuándo podría volver).
                </p>
              </div>
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-md p-3 space-y-1">
                <div className="font-semibold text-emerald-300">5. ¿Por qué hay rondas «Traspasables»?</div>
                <p className="text-slate-300">
                  Indica que la NBA permite incluir esa ronda en un traspaso <strong className="text-slate-100">hoy mismo</strong> porque la franquicia seguirá cumpliendo las reglas (las 2ª rondas y los derechos de swap son siempre traspasables).
                </p>
              </div>
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-md p-3 space-y-1">
                <div className="font-semibold text-orange-300">6. Bloqueada por Regla Ted Stepien</div>
                <p className="text-slate-300">
                  La NBA prohíbe quedarse <strong className="text-slate-100">sin ninguna 1ª ronda en dos años seguidos</strong>. Si un equipo ya cedió su 1ª de 2029, las de 2028 y 2030 aparecen con candado <strong className="text-amber-300">Stepien</strong> hasta que reciba otra 1ª ronda de ese año.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* SUBVIEW 1: 30-TEAM MATRIX (2027-2033) */}
      {/* ===================================================================== */}
      {subView === 'matrix' && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Capital de Draft NBA — Matriz de las 30 Franquicias (2027–2033)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Pulsa en cualquier franquicia para inspeccionar cada ronda, protecciones exactas, derechos de swap y traspasarla en la Trade Machine.
              </p>
            </div>

            <select
              aria-label="Ordenar matriz de capital de Draft"
              value={matrixSort}
              onChange={(e) =>
                setMatrixSort(
                  e.target.value as
                    | 'draftCapitalScore'
                    | 'controlledFirsts'
                    | 'tradableFirsts'
                    | 'controlledSeconds'
                    | 'favorableSwaps'
                )
              }
              className="h-9 px-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
            >
              <option value="draftCapitalScore">Orden: Índice Capital Draft</option>
              <option value="controlledFirsts">Orden: 1ª Rondas Controladas</option>
              <option value="tradableFirsts">Orden: 1ª Rondas Traspasables</option>
              <option value="controlledSeconds">Orden: 2ª Rondas Controladas</option>
              <option value="favorableSwaps">Orden: Swaps Favorables</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-[#1E293B]">
                  <th className="py-2.5 px-2 font-medium">#</th>
                  <th className="py-2.5 px-2.5 font-medium">Franquicia</th>
                  <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Capital</th>
                  <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">1ªR (Trasp.)</th>
                  <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">2ªR</th>
                  {years.map((yr) => (
                    <th
                      key={yr}
                      className="py-2.5 px-1.5 text-center font-mono font-medium whitespace-nowrap"
                    >
                      {yr}
                    </th>
                  ))}
                  <th className="py-2.5 px-2.5 text-right font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]/60 text-xs">
                {sortedTeams.map((t, idx) => (
                  <tr key={t.teamAbbr} className="hover:bg-[#182338]/60 transition-colors">
                    <td className="py-2.5 px-2 font-mono tabular-nums text-slate-400 font-semibold">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSelectTeamDetail(t.teamAbbr)}
                        className="inline-flex items-center gap-2 hover:text-orange-300 text-left"
                      >
                        <TeamLogo abbr={t.teamAbbr} teamId="" size="sm" />
                        <span className="font-mono font-bold text-slate-100">{t.teamAbbr}</span>
                        <span className="text-slate-400 hidden xl:inline">{t.teamName}</span>
                      </button>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-orange-400 whitespace-nowrap">
                      {t.draftCapitalScore.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className="font-bold text-emerald-400">{t.controlledFirsts}</span>
                      <span className="text-[10px] text-slate-400 ml-1">
                        ({t.tradableFirsts})
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {t.controlledSeconds}
                    </td>
                    {years.map((yr) => {
                      const c1 = t.firstsByYear[yr] || 0;
                      const c2 = t.secondsByYear[yr] || 0;
                      const locked = t.stepienLockedYears.includes(yr);
                      return (
                        <td
                          key={yr}
                          className="py-2 px-1 text-center font-mono tabular-nums whitespace-nowrap"
                          title={`${t.teamAbbr} ${yr}: ${c1} × 1ª ronda${locked ? ' (bloqueada por Stepien)' : ''}, ${c2} × 2ª ronda`}
                        >
                          <div className="inline-flex flex-col items-center leading-tight">
                            {c1 >= 2 ? (
                              <span className="text-[11px] font-bold text-amber-300">
                                {c1}×1R
                              </span>
                            ) : c1 === 1 ? (
                              <span
                                className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${
                                  locked ? 'text-slate-400' : 'text-emerald-400'
                                }`}
                              >
                                1R
                                {locked && <Lock className="w-2.5 h-2.5 text-amber-400" />}
                              </span>
                            ) : (
                              <span className="text-[11px] text-rose-400/70">0</span>
                            )}
                            <span className="text-[9px] text-slate-500">
                              {c2 > 0 ? `${c2}×2R` : '—'}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSelectTeamDetail(t.teamAbbr)}
                        className="h-7 px-2.5 rounded bg-[#0B1120] border border-[#1E293B] hover:border-orange-500 text-[11px] font-medium text-slate-200 transition-colors"
                      >
                        Ver cartera
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUBVIEW 2: SINGLE FRANCHISE PORTFOLIO + STEPIEN TIMELINE */}
      {/* ===================================================================== */}
      {subView === 'team' && activeTeam && (
        <div className="space-y-4">
          {/* Team Selector Strip */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <TeamLogo abbr={activeTeam.teamAbbr} teamId="" size="md" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      aria-label="Seleccionar franquicia para ver cartera de rondas"
                      value={activeTeam.teamAbbr}
                      onChange={(e) => setSelectedTeamAbbr(e.target.value)}
                      className="h-9 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] font-display text-sm font-bold text-slate-100 focus:outline-none focus:border-orange-500"
                    >
                      {[...teams]
                        .sort((a, b) => a.teamName.localeCompare(b.teamName, 'es'))
                        .map((t) => (
                          <option key={t.teamAbbr} value={t.teamAbbr}>
                            {t.teamAbbr} · {t.teamName} ({t.controlledFirsts}×1ªR / {t.controlledSeconds}×2ªR)
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onInspectEntity('team', activeTeam.teamAbbr)}
                      className="h-9 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-xs font-medium text-slate-200 transition-colors"
                    >
                      Ficha Equipo
                    </button>
                    {onOpenTradeMachine && (
                      <button
                        type="button"
                        onClick={() => onOpenTradeMachine(activeTeam.teamAbbr)}
                        className="h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span>Traspasar rondas en Trade Machine</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Featured Teams */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Destacados:
                </span>
                {FEATURED_WAR_CHEST_TEAMS.map((abbr) => (
                  <button
                    key={abbr}
                    type="button"
                    onClick={() => setSelectedTeamAbbr(abbr)}
                    className={`h-7 px-2 rounded font-mono text-[11px] font-semibold transition-colors ${
                      activeTeam.teamAbbr === abbr
                        ? 'bg-orange-500 text-slate-950'
                        : 'bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:border-orange-500/50'
                    }`}
                  >
                    {abbr}
                  </button>
                ))}
              </div>
            </div>

            {/* Franchise Portfolio KPI Mini-bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-[#1E293B] font-mono tabular-nums text-center">
              <div className="bg-[#0B1120] border border-[#1E293B] rounded-md p-2">
                <div className="text-[10px] text-slate-400">Capital Draft</div>
                <div className="text-sm font-bold text-orange-400 mt-0.5">
                  {activeTeam.draftCapitalScore.toFixed(1)}
                </div>
              </div>
              <div className="bg-[#0B1120] border border-[#1E293B] rounded-md p-2">
                <div className="text-[10px] text-slate-400">1ª Rondas</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">
                  {activeTeam.controlledFirsts}
                </div>
              </div>
              <div className="bg-[#0B1120] border border-[#1E293B] rounded-md p-2">
                <div className="text-[10px] text-slate-400">1ª Traspasables</div>
                <div className="text-sm font-bold text-sky-300 mt-0.5">
                  {activeTeam.tradableFirsts}
                </div>
              </div>
              <div className="bg-[#0B1120] border border-[#1E293B] rounded-md p-2">
                <div className="text-[10px] text-slate-400">Bloq. Stepien</div>
                <div className="text-sm font-bold text-amber-300 mt-0.5">
                  {activeTeam.stepienLockedFirsts}
                </div>
              </div>
              <div className="bg-[#0B1120] border border-[#1E293B] rounded-md p-2">
                <div className="text-[10px] text-slate-400">2ª Rondas</div>
                <div className="text-sm font-bold text-slate-100 mt-0.5">
                  {activeTeam.controlledSeconds}
                </div>
              </div>
              <div className="bg-[#0B1120] border border-[#1E293B] rounded-md p-2">
                <div className="text-[10px] text-slate-400">Cedidas (1ª/2ª)</div>
                <div className="text-sm font-bold text-rose-300 mt-0.5">
                  {activeTeam.outgoingFirsts} / {activeTeam.outgoingSeconds}
                </div>
              </div>
            </div>

            {/* Filters for team picks */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                {(
                  [
                    ['all', 'Todas las rondas'],
                    [1, 'Solo 1ª Ronda'],
                    [2, 'Solo 2ª Ronda'],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setRoundFilter(val)}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${
                      roundFilter === val
                        ? 'bg-orange-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOutgoing}
                  onChange={(e) => setShowOutgoing(e.target.checked)}
                  className="rounded border-slate-600 text-orange-500 focus:ring-0"
                />
                <span>Mostrar también rondas cedidas a otros equipos</span>
              </label>
            </div>
          </div>

          {/* 7-Year Chronological Timeline (2027-2033) */}
          <div className="space-y-3">
            {years.map((yr) => {
              const yearPicks = activeTeam.picks.filter((p) => {
                if (p.year !== yr) return false;
                if (roundFilter !== 'all' && p.round !== roundFilter) return false;
                if (!showOutgoing && !p.isControlled) return false;
                return true;
              });
              const count1st = activeTeam.firstsByYear[yr] || 0;
              const count2nd = activeTeam.secondsByYear[yr] || 0;
              const isYearStepienLocked = activeTeam.stepienLockedYears.includes(yr);

              return (
                <div
                  key={yr}
                  className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1E293B]">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono tabular-nums text-base font-bold text-slate-100">
                        Draft {yr}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-400">
                        {count1st} × 1ªR · {count2nd} × 2ªR controladas
                      </span>
                    </div>
                    {isYearStepienLocked ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                        <Lock className="w-3 h-3" />
                        1ª ronda bloqueada por Regla Stepien
                      </span>
                    ) : count1st > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                        <Unlock className="w-3 h-3" />
                        1ª ronda disponible para traspaso
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-rose-400">
                        Sin 1ª ronda propia controlada este año
                      </span>
                    )}
                  </div>

                  {yearPicks.length === 0 ? (
                    <div className="text-xs text-slate-500 py-1">
                      Sin rondas registradas bajo el filtro actual para {yr}.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {yearPicks.map((p: FutureDraftPickItem) => {
                        const catMeta = getFuturePickCategoryMeta(p.category);
                        const hasDetails = Boolean(
                          p.detailsEn &&
                            p.detailsEn.length > 0 &&
                            !/^no protections$/i.test(p.detailsEn)
                        );
                        const isExpanded = Boolean(expandedClauseIds[p.id]);

                        return (
                          <div
                            key={p.id}
                            className={`rounded-lg border p-3 space-y-1.5 ${
                              p.isControlled
                                ? 'bg-[#0B1120] border-[#1E293B]'
                                : 'bg-[#0B1120]/50 border-rose-500/20 opacity-85'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-mono text-xs font-bold ${
                                    p.round === 1 ? 'text-orange-400' : 'text-slate-300'
                                  }`}
                                >
                                  {p.round === 1 ? '1ª Ronda' : '2ª Ronda'}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${catMeta.bgClass} ${catMeta.textClass}`}
                                >
                                  {catMeta.shortLabel}
                                </span>
                                {p.protectionLabelEs && (
                                  <span className="text-[10px] font-mono font-semibold text-amber-300">
                                    · {p.protectionLabelEs}
                                  </span>
                                )}
                              </div>

                              {p.isControlled && (
                                <span
                                  className={`text-[10px] font-mono font-semibold inline-flex items-center gap-1 ${
                                    p.stepienLocked ? 'text-amber-300' : 'text-emerald-400'
                                  }`}
                                >
                                  {p.stepienLocked ? (
                                    <>
                                      <Lock className="w-3 h-3" /> Stepien
                                    </>
                                  ) : (
                                    <>
                                      <Unlock className="w-3 h-3" /> Traspasable
                                    </>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Origin logos & concise summary */}
                            <div className="flex items-center gap-2 flex-wrap pt-0.5">
                              {p.originTeams && p.originTeams.length > 0 && (
                                <div className="inline-flex items-center -space-x-1 shrink-0">
                                  {p.originTeams.slice(0, 3).map((abbr) => (
                                    <TeamLogo
                                      key={abbr}
                                      abbr={abbr}
                                      teamId=""
                                      size="sm"
                                    />
                                  ))}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-xs text-slate-100 font-semibold leading-snug">
                                  {p.summaryEs}
                                </div>
                                {p.originLabelEs && (
                                  <div className="text-[11px] text-slate-400 leading-snug">
                                    {p.originLabelEs}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Plain-Spanish explanation always visible (with client fallback) */}
                            <p className="text-[11px] text-slate-300 leading-relaxed">
                              {p.explanationEs ||
                                (p.category === 'own'
                                  ? `Elección original de ${activeTeam.teamName} para el Draft ${p.year} sin condiciones externas.`
                                  : p.category === 'swap_favorable'
                                  ? `Derecho de intercambio favorable (Swap +): no suma una ronda extra, sino la opción de cambiar tu pick por el rival para quedarte el mejor puesto de los dos.`
                                  : p.category === 'swap_encumbered'
                                  ? `Ronda sujeta a intercambio rival (Swap −): el otro equipo puede cambiar su pick por el tuyo si sale más alto.`
                                  : p.category === 'outgoing'
                                  ? `Ronda original de ${activeTeam.teamAbbr} cedida a otra franquicia en un traspaso anterior.`
                                  : `Ronda adquirida de otra franquicia (${p.fromText || 'externa'}) para el Draft ${p.year}.`)}
                            </p>

                            {/* Motivating NBA Trade Origin */}
                            {p.tradeTrailEs ? (
                              <div className="text-[11px] text-orange-200 bg-[#131C2E] border border-orange-500/25 rounded px-2.5 py-1.5 flex items-start gap-1.5">
                                <ArrowLeftRight className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                                <span>
                                  <strong className="text-orange-300">Traspaso de origen:</strong>{' '}
                                  {p.tradeTrailEs}
                                </span>
                              </div>
                            ) : (
                              (p.category === 'incoming' || p.category === 'swap_favorable') && (
                                <div className="text-[11px] text-slate-400 bg-[#131C2E]/70 border border-[#1E293B] rounded px-2.5 py-1.5 flex items-start gap-1.5">
                                  <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                                  <span>
                                    <strong className="text-slate-300">Origen:</strong>{' '}
                                    Ronda simple de {p.round === 1 ? '1ª ronda' : '2ª ronda'} adquirida vía {p.fromText || 'otra franquicia'} (la fuente oficial no desglosa la fecha/jugadores en rondas simples sin protecciones).
                                  </span>
                                </div>
                              )
                            )}

                            {hasDetails && (
                              <div className="pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => toggleClause(p.id)}
                                  className="text-[11px] text-slate-400 hover:text-orange-300 inline-flex items-center gap-1"
                                >
                                  <span>
                                    {isExpanded
                                      ? 'Ocultar cláusula oficial'
                                      : 'Ver cláusula oficial completa'}
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                                {isExpanded && (
                                  <div className="mt-1.5 text-[11px] bg-[#131C2E] border border-[#1E293B] rounded p-2.5 space-y-1.5 leading-relaxed">
                                    {p.clauseEs && (
                                      <p className="text-slate-200">
                                        <span className="font-semibold text-orange-300">Resumen legal (ES): </span>
                                        {p.clauseEs}
                                      </p>
                                    )}
                                    <p className="text-[10px] text-slate-400 font-mono">
                                      Original NBA: {p.detailsEn}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
