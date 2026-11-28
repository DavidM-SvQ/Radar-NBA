import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Crown,
  Flame,
  HelpCircle,
  Info,
  Scale,
  Search,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type {
  EvaluatedDraftClass,
  EvaluatedDraftPick,
  FranchiseDraftEfficiency,
  RedraftMode,
} from '../utils/draftEvaluator';
import {
  DRAFT_GRADE_SCALE,
  evaluateFranchiseDraftEfficiency,
  getClassGradeMeta,
  getClassGradeStyle,
  getGlobalLotteryMissesRanking,
  getGlobalStealsRanking,
  getRedraftModeMeta,
  getVerdictMeta,
} from '../utils/draftEvaluator';
import { formatDraftTradeNoteEs } from '../utils/draftClient';
import { NBA_TEAMS_MAP } from '../utils/teamLogos';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';

const ALL_NBA_TEAM_ABBRS = Object.keys(NBA_TEAMS_MAP).sort((a, b) =>
  (NBA_TEAMS_MAP[a]?.name || a).localeCompare(NBA_TEAMS_MAP[b]?.name || b, 'es')
);

const ICONIC_CLASS_YEARS = [2018, 2020, 2021, 2022, 2023, 2014, 2017, 2025];

function fmtStat(val: number | null | undefined, digits = 1): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return val.toFixed(digits);
}

function fmtSigned(val: number, digits = 1): string {
  if (!Number.isFinite(val)) return '—';
  if (val > 0) return `+${val.toFixed(digits)}`;
  return val.toFixed(digits);
}

function fmtDeltaInt(delta: number, hasStats: boolean): { text: string; className: string } {
  if (!hasStats) return { text: '—', className: 'text-slate-600' };
  if (delta > 0) return { text: `+${delta}`, className: 'text-emerald-400 font-bold' };
  if (delta < 0) return { text: `${delta}`, className: 'text-rose-400 font-bold' };
  return { text: '=', className: 'text-slate-400 font-semibold' };
}

function RedraftModeSwitcher({
  mode,
  onChange,
}: {
  mode: RedraftMode;
  onChange: (m: RedraftMode) => void;
}) {
  const meta = getRedraftModeMeta(mode);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#0B1120] border border-[#1E293B] rounded-lg px-3.5 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-slate-400 inline-flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5 text-orange-400" />
          Criterio de evaluación:
        </span>
        <div
          className="inline-flex items-center gap-1 p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-md"
          role="group"
          aria-label="Criterio de evaluación Re-Draft"
        >
          {(
            [
              ['balanced', 'Integral'],
              ['peak', 'Techo / Estrellas'],
              ['volume', 'Volumen Carrera'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`h-7 px-2.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ${
                mode === id
                  ? 'bg-orange-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span>{meta.description}</span>
      </div>
    </div>
  );
}

function ClassGradeLegend({
  currentGrade,
  onClose,
}: {
  currentGrade?: EvaluatedDraftClass['classGrade'];
  onClose: () => void;
}) {
  return (
    <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-orange-400" />
            ¿Qué significan las notas de camada (S, A+, A, B+, B, C+, C)?
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Es una escala de calificación tipo ojeo deportivo (donde <strong className="text-amber-300">S</strong> es el nivel superior a <strong className="text-emerald-300">A+</strong>, reservado para camadas históricas). Se asigna según el <strong className="text-slate-200">Poder de Camada (0–100)</strong>: 42% media Top 5 Re-Draft + 28% media Top 10 + 18% nº de estrellas (≥20 PTS o ≥16,5 GmSc) + 12% profundidad de titulares.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-7 px-2.5 rounded bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/60 text-[11px] font-medium text-slate-300 whitespace-nowrap self-start sm:self-center shrink-0"
        >
          Ocultar guía
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2">
        {DRAFT_GRADE_SCALE.map((item) => {
          const isCurrent = currentGrade === item.grade;
          return (
            <div
              key={item.grade}
              className={`rounded-md border p-2.5 space-y-1 transition-colors ${
                isCurrent
                  ? 'bg-[#131C2E] border-orange-500/60'
                  : 'bg-[#131C2E]/60 border-[#1E293B]'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className={`inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded border font-display text-xs font-bold ${getClassGradeStyle(
                    item.grade
                  )}`}
                >
                  {item.grade}
                </span>
                <span className="font-mono tabular-nums text-[10px] text-slate-400">
                  {item.rangeLabel}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-100 leading-tight">
                {item.title}
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
 * TAB 2: RE-DRAFT & CLASS EVALUATOR (SINGLE CLASS)
 * ============================================================================ */

interface DraftRedraftPanelProps {
  evaluatedClasses: EvaluatedDraftClass[];
  selectedYear: number;
  onSelectYear: (year: number) => void;
  redraftMode: RedraftMode;
  onChangeRedraftMode: (mode: RedraftMode) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
}

export function DraftRedraftPanel({
  evaluatedClasses,
  selectedYear,
  onSelectYear,
  redraftMode,
  onChangeRedraftMode,
  onInspectEntity,
}: DraftRedraftPanelProps) {
  const [orderBy, setOrderBy] = useState<'redraft' | 'original'>('redraft');
  const [verdictFilter, setVerdictFilter] = useState<
    'tracked' | 'all' | 'steal' | 'underperform'
  >('tracked');
  const [search, setSearch] = useState<string>('');
  const [showGradeLegend, setShowGradeLegend] = useState<boolean>(false);

  const selectableClasses = useMemo(
    () => evaluatedClasses.filter((c) => c.trackedCount > 0),
    [evaluatedClasses]
  );

  const activeEval = useMemo(() => {
    return (
      evaluatedClasses.find((c) => c.year === selectedYear && c.trackedCount > 0) ||
      evaluatedClasses.find((c) => c.year === 2018) ||
      selectableClasses[0] ||
      null
    );
  }, [evaluatedClasses, selectableClasses, selectedYear]);

  const rows = useMemo(() => {
    if (!activeEval) return [];
    const base =
      orderBy === 'redraft' ? activeEval.picksByRedraft : activeEval.picksByOriginal;
    const q = search.trim().toLowerCase();
    return base.filter((p) => {
      if (verdictFilter === 'tracked' && !p.hasStats) return false;
      if (verdictFilter === 'steal' && p.verdict !== 'steal') return false;
      if (verdictFilter === 'underperform' && p.verdict !== 'underperform') return false;
      if (q) {
        const hay = `${p.playerName} ${p.origin} ${p.draftedByTeamAbbr} ${p.draftedByTeamName} #${p.overall}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeEval, orderBy, verdictFilter, search]);

  if (!activeEval) {
    return (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-8 text-center text-xs text-slate-400">
        No hay suficientes datos de rendimiento para generar el Re-Draft.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Year selector & iconic classes bar */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400" />
            <span>Re-Draft por Camada — ¿Cómo se elegiría hoy?</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400">Camadas icónicas:</span>
            {ICONIC_CLASS_YEARS.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => onSelectYear(yr)}
                className={`h-6 px-2 rounded font-mono tabular-nums text-[11px] font-semibold transition-colors ${
                  activeEval.year === yr
                    ? 'bg-orange-500 text-slate-950'
                    : 'bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:border-orange-500/50 hover:text-white'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {selectableClasses.map((cls) => {
            const isSel = cls.year === activeEval.year;
            return (
              <button
                key={cls.year}
                type="button"
                onClick={() => onSelectYear(cls.year)}
                className={`h-8 px-2.5 rounded-md font-mono tabular-nums text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                  isSel
                    ? 'bg-orange-500 text-slate-950 shadow-sm'
                    : 'bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:border-orange-500/50 hover:text-white'
                }`}
              >
                <span>{cls.year}</span>
                <span
                  className={`text-[10px] ${
                    isSel ? 'text-slate-900/80' : 'text-slate-500'
                  }`}
                >
                  {cls.classGrade}
                </span>
              </button>
            );
          })}
        </div>

        <RedraftModeSwitcher mode={redraftMode} onChange={onChangeRedraftMode} />

        {activeEval.isPartialLegacyCoverage && (
          <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-md px-3 py-2 flex items-center gap-2">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>
              Camada clásica ({activeEval.year}): la base de carreras de RadarNBA cubre jugadores activos y retirados recientes ({activeEval.trackedCount} de {activeEval.pickCount} picks con historial). Para evaluación completa de las 60 elecciones consulta las camadas 2014–2026.
            </span>
          </div>
        )}
      </div>

      {/* 4 Editorial Verdict Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Card 1: #1 Original vs #1 Re-Draft */}
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-amber-300 inline-flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5" />
              #1 en el Re-Draft {activeEval.year}
            </span>
            <span className="text-[10px] font-mono tabular-nums text-slate-400">
              {activeEval.numberOneHeld
                ? 'Mantiene el #1'
                : activeEval.redraftNumberOne
                ? `Pick real #${activeEval.redraftNumberOne.overall}`
                : '—'}
            </span>
          </div>
          {activeEval.redraftNumberOne ? (
            <div className="flex items-center gap-3">
              <PlayerAvatar
                playerId={activeEval.redraftNumberOne.playerId}
                name={activeEval.redraftNumberOne.playerName}
                headshotUrl={activeEval.redraftNumberOne.headshotUrl}
                teamAbbr={
                  activeEval.redraftNumberOne.currentTeamAbbr ||
                  activeEval.redraftNumberOne.draftedByTeamAbbr
                }
                size="md"
              />
              <div className="min-w-0">
                {activeEval.redraftNumberOne.playerId ? (
                  <button
                    type="button"
                    onClick={() =>
                      onInspectEntity('player', activeEval.redraftNumberOne!.playerId!)
                    }
                    className="font-display text-sm font-bold text-slate-100 hover:text-orange-300 truncate block text-left"
                  >
                    {activeEval.redraftNumberOne.playerName}
                  </button>
                ) : (
                  <div className="font-display text-sm font-bold text-slate-100 truncate">
                    {activeEval.redraftNumberOne.playerName}
                  </div>
                )}
                <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                  Índice{' '}
                  <span className="text-orange-400 font-bold">
                    {activeEval.redraftNumberOne.redraftScore.toFixed(1)}
                  </span>{' '}
                  · {fmtStat(activeEval.redraftNumberOne.careerPpg)} PTS
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                  #1 original: {activeEval.originalNumberOne?.playerName || '—'}
                  {activeEval.originalNumberOne && !activeEval.numberOneHeld
                    ? ` (hoy #${activeEval.originalNumberOne.redraftRank})`
                    : ''}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Sin datos</div>
          )}
        </div>

        {/* Card 2: Mayor Robo */}
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-emerald-400 inline-flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Mayor Robo de la Camada
            </span>
            {activeEval.biggestSteal && (
              <span className="text-[10px] font-mono tabular-nums text-emerald-400 font-bold">
                #{activeEval.biggestSteal.overall} → #{activeEval.biggestSteal.redraftRank} (+
                {activeEval.biggestSteal.rankDelta})
              </span>
            )}
          </div>
          {activeEval.biggestSteal ? (
            <div className="flex items-center gap-3">
              <PlayerAvatar
                playerId={activeEval.biggestSteal.playerId}
                name={activeEval.biggestSteal.playerName}
                headshotUrl={activeEval.biggestSteal.headshotUrl}
                teamAbbr={
                  activeEval.biggestSteal.currentTeamAbbr ||
                  activeEval.biggestSteal.draftedByTeamAbbr
                }
                size="md"
              />
              <div className="min-w-0">
                {activeEval.biggestSteal.playerId ? (
                  <button
                    type="button"
                    onClick={() =>
                      onInspectEntity('player', activeEval.biggestSteal!.playerId!)
                    }
                    className="font-display text-sm font-bold text-slate-100 hover:text-emerald-300 truncate block text-left"
                  >
                    {activeEval.biggestSteal.playerName}
                  </button>
                ) : (
                  <div className="font-display text-sm font-bold text-slate-100 truncate">
                    {activeEval.biggestSteal.playerName}
                  </div>
                )}
                <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                  {activeEval.biggestSteal.draftedByTeamAbbr} ·{' '}
                  {fmtStat(activeEval.biggestSteal.careerPpg)} PTS · GmSc{' '}
                  {fmtStat(activeEval.biggestSteal.careerGmScPg)}
                </div>
                <div className="text-[10px] font-mono tabular-nums text-emerald-400/90 mt-0.5">
                  Valor sobre expectativa: {fmtSigned(activeEval.biggestSteal.valueOverExpected)}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Sin robos destacados en muestra</div>
          )}
        </div>

        {/* Card 3: Acierto Lotería y Estrellas */}
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 flex flex-col justify-between">
          <div className="text-[11px] font-semibold text-sky-300 inline-flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Acierto de Lotería y Profundidad
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2 font-mono tabular-nums">
            <div className="bg-[#0B1120] border border-[#1E293B] rounded-md p-2 text-center">
              <div className="text-[10px] text-slate-400">Lotería</div>
              <div className="text-base font-bold text-sky-300 mt-0.5">
                {activeEval.lotteryHitRatePct}%
              </div>
            </div>
            <div className="bg-[#0B1120] border border-[#1E293B] rounded-md p-2 text-center">
              <div className="text-[10px] text-slate-400">Estrellas</div>
              <div className="text-base font-bold text-amber-300 mt-0.5">
                {activeEval.starsCount}
              </div>
            </div>
            <div className="bg-[#0B1120] border border-[#1E293B] rounded-md p-2 text-center">
              <div className="text-[10px] text-slate-400">Robos</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {activeEval.stealsCount}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 font-mono tabular-nums">
            {activeEval.trackedCount} evaluados · {activeEval.activeIn2027Count} activos en 2026–27
          </div>
        </div>

        {/* Card 4: Nota de la Camada */}
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 flex items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-300 inline-flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-orange-400" />
                Nota Camada {activeEval.year}
              </span>
              <button
                type="button"
                onClick={() => setShowGradeLegend((prev) => !prev)}
                className="text-[10px] font-semibold text-orange-300 hover:text-orange-200 inline-flex items-center gap-1 underline decoration-orange-500/40 underline-offset-2"
                title="Ver qué significa cada nota (S, A+, A, B+, B, C+, C)"
              >
                <HelpCircle className="w-3 h-3" />
                <span>¿Qué es {activeEval.classGrade}?</span>
              </button>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular-nums text-2xl font-bold text-slate-100">
                {activeEval.classPowerIndex.toFixed(1)}
                <span className="text-xs font-normal text-slate-400"> / 100</span>
              </span>
              <span className="text-[11px] font-medium text-slate-300 truncate">
                · {getClassGradeMeta(activeEval.classGrade).title}
              </span>
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400">
              Top 5: {activeEval.top5AvgScore.toFixed(1)} · Top 10:{' '}
              {activeEval.top10AvgScore.toFixed(1)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGradeLegend((prev) => !prev)}
            title={`${activeEval.classGrade}: ${getClassGradeMeta(activeEval.classGrade).title} (${getClassGradeMeta(activeEval.classGrade).rangeLabel}). Pulsa para ver la escala completa S–C.`}
            className={`w-14 h-14 rounded-lg border flex items-center justify-center font-display text-2xl font-bold shrink-0 cursor-pointer hover:brightness-110 transition-all ${getClassGradeStyle(
              activeEval.classGrade
            )}`}
          >
            {activeEval.classGrade}
          </button>
        </div>
      </div>

      {showGradeLegend && (
        <ClassGradeLegend
          currentGrade={activeEval.classGrade}
          onClose={() => setShowGradeLegend(false)}
        />
      )}

      {/* Main Re-Draft Table */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar jugador, equipo o pick..."
                className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/60"
              />
            </div>

            <div className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
              {(
                [
                  ['tracked', `Evaluados (${activeEval.trackedCount})`],
                  ['all', `Todos (${activeEval.pickCount})`],
                  ['steal', `Robos (${activeEval.stealsCount})`],
                  ['underperform', 'Por debajo'],
                ] as const
              ).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setVerdictFilter(val)}
                  className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    verdictFilter === val
                      ? 'bg-orange-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400">Orden:</span>
            <div className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
              <button
                type="button"
                onClick={() => setOrderBy('redraft')}
                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  orderBy === 'redraft'
                    ? 'bg-orange-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Re-Draft #
              </button>
              <button
                type="button"
                onClick={() => setOrderBy('original')}
                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  orderBy === 'original'
                    ? 'bg-orange-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Pick Original
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-[#1E293B]">
                <th className="py-2.5 px-2.5 font-medium whitespace-nowrap">Re-Draft</th>
                <th className="py-2.5 px-2 font-medium whitespace-nowrap">Real</th>
                <th className="py-2.5 px-2 text-center font-medium whitespace-nowrap">Δ Pos.</th>
                <th className="py-2.5 px-3 font-medium">Jugador y franquicia</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Índice Re-Draft</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">±Esp.</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Carrera</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">GmSc / Peak</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">26–27</th>
                <th className="py-2.5 px-2.5 font-medium whitespace-nowrap">Veredicto</th>
                <th className="py-2.5 px-2.5 text-right font-medium">Ficha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/60 text-xs">
              {rows.map((p) => {
                const delta = fmtDeltaInt(p.rankDelta, p.hasStats);
                const vMeta = getVerdictMeta(p.verdict);
                const rankBadgeColor =
                  p.hasStats && p.redraftRank === 1
                    ? 'text-amber-300 font-bold'
                    : p.hasStats && p.redraftRank <= 3
                    ? 'text-orange-400 font-bold'
                    : p.hasStats && p.redraftRank <= 14
                    ? 'text-sky-300 font-semibold'
                    : 'text-slate-400';

                return (
                  <tr key={p.id} className="hover:bg-[#182338]/60 transition-colors">
                    <td className={`py-2.5 px-2.5 font-mono tabular-nums whitespace-nowrap ${rankBadgeColor}`}>
                      {p.hasStats ? `#${p.redraftRank}` : '—'}
                    </td>
                    <td className="py-2.5 px-2 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      #{p.overall}
                      <span className="text-[10px] text-slate-500 ml-1">R{p.round}</span>
                    </td>
                    <td className={`py-2.5 px-2 text-center font-mono tabular-nums whitespace-nowrap ${delta.className}`}>
                      <span className="inline-flex items-center gap-0.5">
                        {p.hasStats && p.rankDelta > 0 && <ArrowUpRight className="w-3 h-3" />}
                        {p.hasStats && p.rankDelta < 0 && <ArrowDownRight className="w-3 h-3" />}
                        {delta.text}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar
                          playerId={p.playerId}
                          name={p.playerName}
                          headshotUrl={p.headshotUrl}
                          teamAbbr={p.currentTeamAbbr || p.draftedByTeamAbbr}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {p.playerId ? (
                              <button
                                type="button"
                                onClick={() => onInspectEntity('player', p.playerId!)}
                                className="font-semibold text-slate-100 hover:text-orange-300 text-left"
                              >
                                {p.playerName}
                              </button>
                            ) : (
                              <span className="font-semibold text-slate-300">{p.playerName}</span>
                            )}
                            <TeamLogo
                              abbr={p.draftedByTeamAbbr}
                              teamId=""
                              logoUrl={p.draftedByLogoUrl}
                              size="xs"
                            />
                            <span
                              className="font-mono text-[10px] text-slate-400"
                              title={
                                p.tradeNote
                                  ? `Elegido oficialmente por ${p.draftedByTeamAbbr} (${formatDraftTradeNoteEs(p.tradeNote)})`
                                  : `Elegido en el Draft por ${p.draftedByTeamAbbr}`
                              }
                            >
                              Draft: {p.draftedByTeamAbbr}
                            </span>
                            {p.isActive2027 && p.currentTeamAbbr && (
                              <span
                                className="font-mono text-[10px] text-emerald-400 font-semibold"
                                title={`Equipo actual en la temporada 2026–27: ${p.currentTeamAbbr}`}
                              >
                                · Hoy: {p.currentTeamAbbr}
                              </span>
                            )}
                            {!p.isActive2027 &&
                              p.currentTeamAbbr &&
                              p.currentTeamAbbr !== p.draftedByTeamAbbr && (
                                <span
                                  className="font-mono text-[10px] text-slate-500"
                                  title={`Último equipo registrado en NBA: ${p.currentTeamAbbr}`}
                                >
                                  · Últ.: {p.currentTeamAbbr}
                                </span>
                              )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[270px]">
                            {p.position} · {p.origin}
                            {p.tradeNote ? ` · ${formatDraftTradeNoteEs(p.tradeNote)}` : ''}
                            {p.careerGp ? ` · ${p.careerGp.toLocaleString('es-ES')} PJ` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {p.hasStats ? (
                        <div className="w-28 space-y-1">
                          <div className="flex items-center justify-between font-mono tabular-nums text-[11px]">
                            <span className="font-bold text-slate-100">
                              {p.redraftScore.toFixed(1)}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Esp. {p.expectedScore.toFixed(0)}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-[#0B1120] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                p.redraftScore >= 65
                                  ? 'bg-amber-400'
                                  : p.redraftScore >= 45
                                  ? 'bg-emerald-400'
                                  : p.redraftScore >= 30
                                  ? 'bg-sky-400'
                                  : 'bg-slate-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(4, p.redraftScore))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600 font-mono">—</span>
                      )}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold ${
                        !p.hasStats
                          ? 'text-slate-600'
                          : p.valueOverExpected >= 10
                          ? 'text-emerald-400'
                          : p.valueOverExpected <= -10
                          ? 'text-rose-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {p.hasStats ? fmtSigned(p.valueOverExpected) : '—'}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {p.careerPpg != null ? (
                        <div>
                          <div className="font-semibold text-slate-100">
                            {fmtStat(p.careerPpg)} PTS
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {fmtStat(p.careerRpg)}r · {fmtStat(p.careerApg)}a
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {p.careerGmScPg != null ? (
                        <div>
                          <div className="font-semibold text-sky-300">
                            {fmtStat(p.careerGmScPg)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Peak {fmtStat(p.careerPeakGmSc)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {p.season27PtsPg != null ? (
                        <span className="font-semibold text-emerald-400">
                          {fmtStat(p.season27PtsPg)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${vMeta.bgClass} ${vMeta.textClass}`}
                      >
                        {vMeta.shortLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                      {p.playerId ? (
                        <button
                          type="button"
                          onClick={() => onInspectEntity('player', p.playerId!)}
                          className="h-7 px-2.5 rounded bg-[#0B1120] border border-[#1E293B] hover:border-orange-500 text-[11px] font-medium text-slate-200 transition-colors"
                        >
                          Ficha
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-xs text-slate-400">
                    No hay elecciones que coincidan con este filtro en la camada {activeEval.year}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * TAB 3: GLOBAL STEALS & LOTTERY MISSES RANKING
 * ============================================================================ */

interface DraftStealsPanelProps {
  evaluatedClasses: EvaluatedDraftClass[];
  redraftMode: RedraftMode;
  onChangeRedraftMode: (mode: RedraftMode) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onJumpToClassRedraft: (year: number) => void;
}

export function DraftStealsPanel({
  evaluatedClasses,
  redraftMode,
  onChangeRedraftMode,
  onInspectEntity,
  onJumpToClassRedraft,
}: DraftStealsPanelProps) {
  const [viewMode, setViewMode] = useState<'steals' | 'misses'>('steals');
  const [eraFilter, setEraFilter] = useState<'all' | 'modern' | 'recent'>('all');
  const [minPickFilter, setMinPickFilter] = useState<number>(10);
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [onlyActive, setOnlyActive] = useState<boolean>(false);
  const [limit, setLimit] = useState<number>(40);

  const eraBounds = useMemo(() => {
    if (eraFilter === 'recent') return { minYear: 2020, maxYear: 2025 };
    if (eraFilter === 'modern') return { minYear: 2014, maxYear: 2025 };
    return { minYear: 2003, maxYear: 2026 };
  }, [eraFilter]);

  const rankedList = useMemo<EvaluatedDraftPick[]>(() => {
    if (viewMode === 'steals') {
      return getGlobalStealsRanking(evaluatedClasses, {
        minYear: eraBounds.minYear,
        maxYear: eraBounds.maxYear,
        minPickOverall: minPickFilter,
        teamAbbr: teamFilter,
        onlyActive,
      });
    }
    return getGlobalLotteryMissesRanking(evaluatedClasses, {
      minYear: Math.max(2014, eraBounds.minYear),
      maxYear: Math.min(2024, eraBounds.maxYear),
      teamAbbr: teamFilter,
    });
  }, [evaluatedClasses, viewMode, eraBounds, minPickFilter, teamFilter, onlyActive]);

  const podium = rankedList.slice(0, 3);
  const visibleRows = rankedList.slice(0, limit);

  return (
    <div className="space-y-5">
      {/* Controls Card */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg w-fit">
            <button
              type="button"
              onClick={() => {
                setViewMode('steals');
                setLimit(40);
              }}
              className={`h-8 px-3.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewMode === 'steals'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              Mayores Robos del Draft
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('misses');
                setLimit(40);
              }}
              className={`h-8 px-3.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewMode === 'misses'
                  ? 'bg-rose-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Lotería por Debajo de Expectativa
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filtrar por periodo de camadas"
              value={eraFilter}
              onChange={(e) => setEraFilter(e.target.value as 'all' | 'modern' | 'recent')}
              className="h-8 px-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
            >
              <option value="all">
                {viewMode === 'steals' ? 'Todas las camadas (2003–2026)' : 'Camadas maduras (2014–2024)'}
              </option>
              <option value="modern">Era moderna (2014–2025)</option>
              <option value="recent">Camadas recientes (2020–2025)</option>
            </select>

            {viewMode === 'steals' && (
              <select
                aria-label="Filtrar por posición mínima de pick"
                value={minPickFilter}
                onChange={(e) => setMinPickFilter(Number(e.target.value))}
                className="h-8 px-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
              >
                <option value={10}>Desde Pick #10+</option>
                <option value={15}>Fuera de Lotería (#15+)</option>
                <option value={31}>Solo 2ª Ronda (#31+)</option>
              </select>
            )}

            <select
              aria-label="Filtrar por franquicia"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="h-8 px-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
            >
              <option value="all">Todas las franquicias</option>
              {ALL_NBA_TEAM_ABBRS.map((abbr) => (
                <option key={abbr} value={abbr}>
                  {abbr} · {NBA_TEAMS_MAP[abbr]?.name}
                </option>
              ))}
            </select>

            {viewMode === 'steals' && (
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none whitespace-nowrap pl-1">
                <input
                  type="checkbox"
                  checked={onlyActive}
                  onChange={(e) => setOnlyActive(e.target.checked)}
                  className="rounded border-slate-600 text-orange-500 focus:ring-0"
                />
                <span>Activos 26–27</span>
              </label>
            )}
          </div>
        </div>

        <RedraftModeSwitcher mode={redraftMode} onChange={onChangeRedraftMode} />
      </div>

      {/* Top 3 Podium Cards */}
      {podium.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {podium.map((p, idx) => (
            <div
              key={p.id}
              className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono tabular-nums text-xs font-bold ${
                    idx === 0
                      ? 'text-amber-300'
                      : idx === 1
                      ? 'text-slate-200'
                      : 'text-orange-400'
                  }`}
                >
                  #{idx + 1}{' '}
                  {viewMode === 'steals' ? 'ROBO HISTÓRICO' : 'BRECHA DE LOTERÍA'}
                </span>
                <button
                  type="button"
                  onClick={() => onJumpToClassRedraft(p.year)}
                  className="text-[11px] font-mono tabular-nums text-slate-400 hover:text-orange-300"
                >
                  Draft {p.year} →
                </button>
              </div>

              <div className="flex items-center gap-3">
                <PlayerAvatar
                  playerId={p.playerId}
                  name={p.playerName}
                  headshotUrl={p.headshotUrl}
                  teamAbbr={p.currentTeamAbbr || p.draftedByTeamAbbr}
                  size="md"
                />
                <div className="min-w-0">
                  {p.playerId ? (
                    <button
                      type="button"
                      onClick={() => onInspectEntity('player', p.playerId!)}
                      className="font-display text-base font-bold text-slate-100 hover:text-orange-300 truncate block text-left"
                    >
                      {p.playerName}
                    </button>
                  ) : (
                    <div className="font-display text-base font-bold text-slate-100 truncate">
                      {p.playerName}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                    <TeamLogo
                      abbr={p.draftedByTeamAbbr}
                      teamId=""
                      logoUrl={p.draftedByLogoUrl}
                      size="xs"
                    />
                    <span className="font-mono font-semibold text-slate-200">
                      Pick #{p.overall}
                    </span>
                    <span aria-hidden="true">→</span>
                    <span
                      className={`font-mono font-bold ${
                        viewMode === 'steals' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {p.hasStats ? `Re-Draft #${p.redraftRank}` : 'Sin muestra NBA'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1E293B] font-mono tabular-nums text-center">
                <div>
                  <div className="text-[10px] text-slate-500">Índice</div>
                  <div className="text-xs font-bold text-slate-100">
                    {p.hasStats ? p.redraftScore.toFixed(1) : '0.0'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">±Esperado</div>
                  <div
                    className={`text-xs font-bold ${
                      p.valueOverExpected >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {fmtSigned(p.valueOverExpected)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Carrera</div>
                  <div className="text-xs font-bold text-sky-300">
                    {p.careerPpg != null ? `${fmtStat(p.careerPpg)} PTS` : '—'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Ranked Table */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-200">
            {viewMode === 'steals'
              ? `Ranking de Mayores Robos del Draft (${rankedList.length} hallazgos)`
              : `Ranking de Elecciones de Lotería por Debajo de Expectativa (${rankedList.length} picks 2014–2024)`}
          </div>
          <span className="text-[11px] text-slate-400">
            Comparado contra la curva histórica de rendimiento esperado por pick
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-[#1E293B]">
                <th className="py-2.5 px-2.5 font-medium">#</th>
                <th className="py-2.5 px-2.5 font-medium whitespace-nowrap">Año / Pick</th>
                <th className="py-2.5 px-2 font-medium whitespace-nowrap">Re-Draft</th>
                <th className="py-2.5 px-3 font-medium">Jugador</th>
                <th className="py-2.5 px-2 font-medium">Eq.</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Índice</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Esp.</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">±Val.</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Carrera</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">26–27</th>
                <th className="py-2.5 px-2.5 text-right font-medium">Camada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/60 text-xs">
              {visibleRows.map((p, idx) => (
                <tr key={p.id} className="hover:bg-[#182338]/60 transition-colors">
                  <td className="py-2.5 px-2.5 font-mono tabular-nums text-slate-400 font-semibold">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono tabular-nums whitespace-nowrap">
                    <span className="font-bold text-slate-100">{p.year}</span>
                    <span className="text-slate-500 mx-1">·</span>
                    <span className="font-semibold text-orange-400">#{p.overall}</span>
                  </td>
                  <td className="py-2.5 px-2 font-mono tabular-nums whitespace-nowrap">
                    {p.hasStats ? (
                      <span
                        className={
                          p.rankDelta > 0
                            ? 'text-emerald-400 font-bold'
                            : p.rankDelta < 0
                            ? 'text-rose-400 font-bold'
                            : 'text-slate-300'
                        }
                      >
                        #{p.redraftRank} ({p.rankDelta > 0 ? `+${p.rankDelta}` : p.rankDelta})
                      </span>
                    ) : (
                      <span className="text-slate-500">Sin muestra</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar
                        playerId={p.playerId}
                        name={p.playerName}
                        headshotUrl={p.headshotUrl}
                        teamAbbr={p.currentTeamAbbr || p.draftedByTeamAbbr}
                        size="sm"
                      />
                      <div className="min-w-0">
                        {p.playerId ? (
                          <button
                            type="button"
                            onClick={() => onInspectEntity('player', p.playerId!)}
                            className="font-semibold text-slate-100 hover:text-orange-300 text-left truncate block"
                          >
                            {p.playerName}
                          </button>
                        ) : (
                          <span className="font-semibold text-slate-300 truncate block">
                            {p.playerName}
                          </span>
                        )}
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                          {p.position} · {p.origin}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <TeamLogo
                        abbr={p.draftedByTeamAbbr}
                        teamId=""
                        logoUrl={p.draftedByLogoUrl}
                        size="xs"
                      />
                      <span className="font-mono font-bold text-slate-200">
                        {p.draftedByTeamAbbr}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-slate-100 whitespace-nowrap">
                    {p.hasStats ? p.redraftScore.toFixed(1) : '0.0'}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                    {p.expectedScore.toFixed(1)}
                  </td>
                  <td
                    className={`py-2.5 px-2 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                      p.valueOverExpected >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {fmtSigned(p.valueOverExpected)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {p.careerPpg != null ? (
                      <div>
                        <div className="text-slate-100 font-semibold">
                          {fmtStat(p.careerPpg)} PTS
                        </div>
                        <div className="text-[10px] text-slate-400">
                          GmSc {fmtStat(p.careerGmScPg)} · {p.careerGp ?? 0} PJ
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {p.season27PtsPg != null ? (
                      <span className="text-emerald-400 font-semibold">
                        {fmtStat(p.season27PtsPg)}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onJumpToClassRedraft(p.year)}
                      className="h-7 px-2.5 rounded bg-[#0B1120] border border-[#1E293B] hover:border-orange-500 text-[11px] font-medium text-slate-200 transition-colors"
                    >
                      Re-Draft {p.year}
                    </button>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-xs text-slate-400">
                    No se encontraron registros con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {rankedList.length > limit && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setLimit((prev) => prev + 40)}
              className="h-9 px-4 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-xs font-semibold text-slate-200 transition-colors"
            >
              Mostrar 40 más ({rankedList.length - limit} restantes)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * TAB 4: CLASS-VS-CLASS COMPARATOR & FRANCHISE DRAFT EFFICIENCY
 * ============================================================================ */

interface DraftComparePanelProps {
  evaluatedClasses: EvaluatedDraftClass[];
  redraftMode: RedraftMode;
  onChangeRedraftMode: (mode: RedraftMode) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onJumpToClassRedraft: (year: number) => void;
}

export function DraftComparePanel({
  evaluatedClasses,
  redraftMode,
  onChangeRedraftMode,
  onInspectEntity,
  onJumpToClassRedraft,
}: DraftComparePanelProps) {
  const [yearA, setYearA] = useState<number>(2018);
  const [yearB, setYearB] = useState<number>(2021);
  const [classesRange, setClassesRange] = useState<'modern' | 'all'>('modern');
  const [showCompareGradeLegend, setShowCompareGradeLegend] = useState<boolean>(false);
  const [franchiseWindow, setFranchiseWindow] = useState<'2014_2026' | '2014_2024' | '2020_2026'>(
    '2014_2026'
  );
  const [franchiseSort, setFranchiseSort] = useState<
    'avgValueOverExpected' | 'totalValueOverExpected' | 'stealsCount' | 'starsCount' | 'active2027Picks'
  >('avgValueOverExpected');

  const selectableClasses = useMemo(
    () => evaluatedClasses.filter((c) => c.trackedCount >= 4),
    [evaluatedClasses]
  );

  const classA = useMemo(
    () => selectableClasses.find((c) => c.year === yearA) || selectableClasses[0] || null,
    [selectableClasses, yearA]
  );
  const classB = useMemo(
    () =>
      selectableClasses.find((c) => c.year === yearB) ||
      selectableClasses[1] ||
      selectableClasses[0] ||
      null,
    [selectableClasses, yearB]
  );

  const rankedClasses = useMemo(() => {
    const subset =
      classesRange === 'modern'
        ? evaluatedClasses.filter((c) => c.year >= 2014)
        : evaluatedClasses.filter((c) => c.trackedCount > 0);
    return [...subset].sort((a, b) => b.classPowerIndex - a.classPowerIndex);
  }, [evaluatedClasses, classesRange]);

  const franchiseRows = useMemo<FranchiseDraftEfficiency[]>(() => {
    const [minY, maxY] =
      franchiseWindow === '2014_2024'
        ? [2014, 2024]
        : franchiseWindow === '2020_2026'
        ? [2020, 2026]
        : [2014, 2026];
    const base = evaluateFranchiseDraftEfficiency(evaluatedClasses, minY, maxY);
    return [...base].sort((a, b) => b[franchiseSort] - a[franchiseSort]);
  }, [evaluatedClasses, franchiseWindow, franchiseSort]);

  return (
    <div className="space-y-5">
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4">
        <RedraftModeSwitcher mode={redraftMode} onChange={onChangeRedraftMode} />
      </div>

      {/* SECTION A: HEAD-TO-HEAD CLASS DUEL */}
      {classA && classB && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-orange-400" />
                Comparativa Directa entre Camadas (Cara a Cara)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Enfrenta dos generaciones del Draft por calidad de su Top 5 Re-Draft, profundidad, estrellas y acierto en lotería.
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Duelos rápidos:
              </span>
              {[
                [2018, 2020],
                [2018, 2021],
                [2014, 2018],
                [2022, 2023],
                [2017, 2021],
              ].map(([a, b]) => (
                <button
                  key={`${a}-${b}`}
                  type="button"
                  onClick={() => {
                    setYearA(a);
                    setYearB(b);
                  }}
                  className="h-7 px-2.5 rounded-md bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/50 text-[11px] font-mono font-semibold text-slate-200 transition-colors"
                >
                  {a} vs {b}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { side: 'A', cls: classA, other: classB, onSelect: setYearA, accent: 'text-orange-400' },
              { side: 'B', cls: classB, other: classA, onSelect: setYearB, accent: 'text-sky-400' },
            ].map(({ side, cls, other, onSelect, accent }) => (
              <div
                key={side}
                className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-4 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${accent}`}>
                      CAMADA {side}
                    </span>
                    <select
                      aria-label={`Seleccionar Camada ${side}`}
                      value={cls.year}
                      onChange={(e) => onSelect(Number(e.target.value))}
                      className="h-8 px-2.5 rounded-md bg-[#131C2E] border border-[#1E293B] font-mono text-xs font-bold text-slate-100 focus:outline-none focus:border-orange-500"
                    >
                      {selectableClasses.map((opt) => (
                        <option key={opt.year} value={opt.year}>
                          Draft {opt.year} (Nota {opt.classGrade})
                        </option>
                      ))}
                    </select>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded border font-display text-sm font-bold ${getClassGradeStyle(
                      cls.classGrade
                    )}`}
                  >
                    {cls.classGrade} · {cls.classPowerIndex.toFixed(1)}
                  </span>
                </div>

                {/* Comparison KPI Grid */}
                <div className="grid grid-cols-4 gap-2 font-mono tabular-nums text-center">
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded p-2">
                    <div className="text-[10px] text-slate-400">Top 5</div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        cls.top5AvgScore >= other.top5AvgScore
                          ? 'text-emerald-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {cls.top5AvgScore.toFixed(1)}
                    </div>
                  </div>
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded p-2">
                    <div className="text-[10px] text-slate-400">Estrellas</div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        cls.starsCount >= other.starsCount
                          ? 'text-amber-300'
                          : 'text-slate-200'
                      }`}
                    >
                      {cls.starsCount}
                    </div>
                  </div>
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded p-2">
                    <div className="text-[10px] text-slate-400">Lotería</div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        cls.lotteryHitRatePct >= other.lotteryHitRatePct
                          ? 'text-sky-300'
                          : 'text-slate-200'
                      }`}
                    >
                      {cls.lotteryHitRatePct}%
                    </div>
                  </div>
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded p-2">
                    <div className="text-[10px] text-slate-400">Activos</div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        cls.activeIn2027Count >= other.activeIn2027Count
                          ? 'text-emerald-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {cls.activeIn2027Count}
                    </div>
                  </div>
                </div>

                {/* Top 5 Re-Draft List */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400">
                    Quinteto Top 5 del Re-Draft {cls.year}
                  </div>
                  {cls.picksByRedraft
                    .filter((p) => p.hasStats)
                    .slice(0, 5)
                    .map((p, idx) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 bg-[#131C2E]/80 border border-[#1E293B] rounded-md px-2.5 py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] font-bold text-orange-400 w-5 shrink-0">
                            #{idx + 1}
                          </span>
                          <PlayerAvatar
                            playerId={p.playerId}
                            name={p.playerName}
                            headshotUrl={p.headshotUrl}
                            teamAbbr={p.currentTeamAbbr || p.draftedByTeamAbbr}
                            size="xs"
                          />
                          {p.playerId ? (
                            <button
                              type="button"
                              onClick={() => onInspectEntity('player', p.playerId!)}
                              className="text-xs font-semibold text-slate-100 hover:text-orange-300 truncate text-left"
                            >
                              {p.playerName}
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {p.playerName}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            (Pick #{p.overall})
                          </span>
                        </div>
                        <div className="font-mono tabular-nums text-[11px] text-right shrink-0">
                          <span className="font-bold text-slate-100">
                            {p.redraftScore.toFixed(1)}
                          </span>
                          <span className="text-slate-500 ml-1.5">
                            {fmtStat(p.careerPpg)}p
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION B: ALL CLASSES POWER RANKING */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-orange-400" />
              Ranking de Camadas del Draft NBA
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ordenadas por Poder de Camada (calidad del Top 5/Top 10, estrellas ≥20 PTS y profundidad real).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowCompareGradeLegend((prev) => !prev)}
              className="h-8 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-[11px] font-semibold text-orange-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{showCompareGradeLegend ? 'Ocultar escala S–C' : '¿Qué significan S, A, B, C?'}</span>
            </button>
            <div className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setClassesRange('modern')}
                className={`h-7 px-3 rounded-md text-[11px] font-semibold transition-colors ${
                  classesRange === 'modern'
                    ? 'bg-orange-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Era Moderna (2014–2026)
              </button>
              <button
                type="button"
                onClick={() => setClassesRange('all')}
                className={`h-7 px-3 rounded-md text-[11px] font-semibold transition-colors ${
                  classesRange === 'all'
                    ? 'bg-orange-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Todas con datos
              </button>
            </div>
          </div>
        </div>

        {showCompareGradeLegend && (
          <ClassGradeLegend onClose={() => setShowCompareGradeLegend(false)} />
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-[#1E293B]">
                <th className="py-2.5 px-2.5 font-medium">#</th>
                <th className="py-2.5 px-2.5 font-medium">Camada</th>
                <th className="py-2.5 px-2 text-center font-medium">Nota</th>
                <th className="py-2.5 px-2 text-right font-medium">Poder</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Top 5</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Estrellas</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Lotería %</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Activos</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">#1 Re-Draft (Real)</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Mayor Robo</th>
                <th className="py-2.5 px-2.5 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/60 text-xs">
              {rankedClasses.map((cls, idx) => (
                <tr key={cls.year} className="hover:bg-[#182338]/60 transition-colors">
                  <td className="py-2.5 px-2.5 font-mono tabular-nums text-slate-400 font-semibold">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-2.5 font-mono tabular-nums font-bold text-slate-100 whitespace-nowrap">
                    Draft {cls.year}
                    {cls.isPartialLegacyCoverage && (
                      <span className="text-[10px] font-normal text-amber-400/80 ml-1.5">
                        (parcial)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center whitespace-nowrap">
                    <span
                      title={`${cls.classGrade} · ${getClassGradeMeta(cls.classGrade).title} (${getClassGradeMeta(cls.classGrade).rangeLabel})`}
                      className={`inline-block min-w-[30px] px-1.5 py-0.5 rounded border font-display text-xs font-bold cursor-help ${getClassGradeStyle(
                        cls.classGrade
                      )}`}
                    >
                      {cls.classGrade}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-orange-400 whitespace-nowrap">
                    {cls.classPowerIndex.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                    {cls.top5AvgScore.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-amber-300 font-semibold whitespace-nowrap">
                    {cls.starsCount}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-sky-300 whitespace-nowrap">
                    {cls.lotteryHitRatePct}%
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-400 whitespace-nowrap">
                    {cls.activeIn2027Count}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {cls.redraftNumberOne ? (
                      <div className="flex items-center gap-1.5">
                        {cls.redraftNumberOne.playerId ? (
                          <button
                            type="button"
                            onClick={() => onInspectEntity('player', cls.redraftNumberOne!.playerId!)}
                            className="font-semibold text-slate-100 hover:text-orange-300"
                          >
                            {cls.redraftNumberOne.playerName}
                          </button>
                        ) : (
                          <span className="font-semibold text-slate-200">
                            {cls.redraftNumberOne.playerName}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-slate-400">
                          (#{cls.redraftNumberOne.overall})
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {cls.biggestSteal ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-300 font-medium">
                          {cls.biggestSteal.playerName}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          (#{cls.biggestSteal.overall} → #{cls.biggestSteal.redraftRank})
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onJumpToClassRedraft(cls.year)}
                      className="h-7 px-2.5 rounded bg-[#0B1120] border border-[#1E293B] hover:border-orange-500 text-[11px] font-medium text-slate-200 transition-colors"
                    >
                      Ver Re-Draft
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION C: FRANCHISE DRAFTING EFFICIENCY (30 TEAMS) */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              Ojo Clínico en el Draft por Franquicia (30 Equipos)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Mide cuánto talento genera cada franquicia respecto a la expectativa matemática de sus elecciones originales (Valor Sobre Expectativa).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Ventana histórica para franquicias"
              value={franchiseWindow}
              onChange={(e) =>
                setFranchiseWindow(
                  e.target.value as '2014_2026' | '2014_2024' | '2020_2026'
                )
              }
              className="h-8 px-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
            >
              <option value="2014_2026">Era moderna (2014–2026)</option>
              <option value="2014_2024">Camadas maduras (2014–2024)</option>
              <option value="2020_2026">Último ciclo (2020–2026)</option>
            </select>

            <select
              aria-label="Ordenar franquicias por métrica"
              value={franchiseSort}
              onChange={(e) =>
                setFranchiseSort(
                  e.target.value as
                    | 'avgValueOverExpected'
                    | 'totalValueOverExpected'
                    | 'stealsCount'
                    | 'starsCount'
                    | 'active2027Picks'
                )
              }
              className="h-8 px-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
            >
              <option value="avgValueOverExpected">Orden: ±Valor Medio / Pick</option>
              <option value="totalValueOverExpected">Orden: ±Valor Acumulado</option>
              <option value="stealsCount">Orden: Nº de Robos</option>
              <option value="starsCount">Orden: Estrellas (≥20 PTS)</option>
              <option value="active2027Picks">Orden: Activos en 2026–27</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-[#1E293B]">
                <th className="py-2.5 px-2.5 font-medium">#</th>
                <th className="py-2.5 px-3 font-medium">Franquicia</th>
                <th className="py-2.5 px-2 text-right font-medium">Picks</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Pick Medio</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Activos</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Estrellas</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">Robos</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">±Val / Pick</th>
                <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">±Val Total</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Mejor Elección</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/60 text-xs">
              {franchiseRows.map((row, idx) => (
                <tr key={row.teamAbbr} className="hover:bg-[#182338]/60 transition-colors">
                  <td className="py-2.5 px-2.5 font-mono tabular-nums text-slate-400 font-semibold">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onInspectEntity('team', row.teamAbbr)}
                      className="inline-flex items-center gap-2 hover:text-orange-300 text-left"
                    >
                      <TeamLogo abbr={row.teamAbbr} teamId="" size="sm" />
                      <span className="font-mono font-bold text-slate-100">{row.teamAbbr}</span>
                      <span className="text-slate-400 hidden sm:inline">{row.teamName}</span>
                    </button>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                    {row.totalPicks}
                    <span className="text-[10px] text-slate-500 ml-1">
                      ({row.lotteryPicks}L)
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                    #{row.avgPickOverall.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-400 whitespace-nowrap">
                    {row.active2027Picks}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-amber-300 font-semibold whitespace-nowrap">
                    {row.starsCount}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-sky-300 font-semibold whitespace-nowrap">
                    {row.stealsCount}
                  </td>
                  <td
                    className={`py-2.5 px-2 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                      row.avgValueOverExpected >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {fmtSigned(row.avgValueOverExpected)}
                  </td>
                  <td
                    className={`py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                      row.totalValueOverExpected >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {fmtSigned(row.totalValueOverExpected, 0)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {row.bestPick ? (
                      <div className="flex items-center gap-1.5">
                        {row.bestPick.playerId ? (
                          <button
                            type="button"
                            onClick={() => onInspectEntity('player', row.bestPick!.playerId!)}
                            className="font-semibold text-slate-100 hover:text-orange-300"
                          >
                            {row.bestPick.playerName}
                          </button>
                        ) : (
                          <span className="font-semibold text-slate-200">
                            {row.bestPick.playerName}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-slate-400">
                          ({row.bestPick.year} · #{row.bestPick.overall})
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
