import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Flame,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import type {
  AwardCandidateEntry,
  AwardCategoryId,
  AwardSeasonScope,
  ExperienceMode,
  SeasonAwardsPayload,
} from '../types/nba';
import { formatSigned, normalizeSearchText } from '../utils/analytics';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';

interface SeasonAwardsViewProps {
  data: SeasonAwardsPayload | null;
  loading: boolean;
  errorMsg: string | null;
  seasonScope: AwardSeasonScope;
  onChangeSeasonScope: (next: AwardSeasonScope) => void;
  activeCategory: AwardCategoryId;
  onChangeCategory: (next: AwardCategoryId) => void;
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleOnlyWatchlist: () => void;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onRetry: () => void;
}

interface AwardTabMeta {
  id: AwardCategoryId;
  shortLabel: string;
  fullTitle: string;
  simpleDesc: string;
  advancedDesc: string;
  usesGamesRuleByDefault: boolean;
}

const AWARD_TABS: AwardTabMeta[] = [
  {
    id: 'mvp',
    shortLabel: 'MVP',
    fullTitle: 'Jugador Más Valioso (MVP)',
    simpleDesc:
      'Combina dominio individual, victorias de su franquicia, desviación en los últimos 5 partidos y rachas activas.',
    advancedDesc:
      'Índice ponderado de producción Hollinger (GmSc), eficiencia real (TS%, +/-, NetRtg/PIE), semilla de conferencia y delta reciente.',
    usesGamesRuleByDefault: true,
  },
  {
    id: 'roy',
    shortLabel: 'Rookie (ROY)',
    fullTitle: 'Rookie del Año (ROY)',
    simpleDesc:
      'Seguimiento exclusivo de debutantes de primer año según impacto real en cancha, volumen, minutos y tendencia reciente.',
    advancedDesc:
      'Validación estricta de año de debut oficial (sin veteranos inéditos por lesión) ponderando GmSc, TS%, stocks, rol y evolución últ. 5 PJ.',
    usesGamesRuleByDefault: false,
  },
  {
    id: 'mip',
    shortLabel: 'Más Mejorado (MIP)',
    fullTitle: 'Jugador Más Mejorado (MIP)',
    simpleDesc:
      'Premia el mayor salto estadístico real respecto al curso anterior en anotación, creación y peso en el equipo.',
    advancedDesc:
      'Delta interanual real (2026-27 vs 2025-26) en PTS, PRA, GmSc y TS% excluyendo superestrellas consolidadas (>24.5 PTS previos).',
    usesGamesRuleByDefault: true,
  },
  {
    id: 'dpoy',
    shortLabel: 'Defensor (DPOY)',
    fullTitle: 'Jugador Defensivo del Año (DPOY)',
    simpleDesc:
      'Evalúa robos, tapones, rebotes defensivos, intimidación de tiros y la solidez defensiva colectiva de su equipo.',
    advancedDesc:
      'Integra stocks por noche, tiros punteados, desvíos de balón y anclaje sobre el DefRtg colectivo e individual.',
    usesGamesRuleByDefault: true,
  },
  {
    id: '6moy',
    shortLabel: 'Sexto Hombre',
    fullTitle: 'Mejor Sexto Hombre del Año (6MOY)',
    simpleDesc:
      'Jugadores que salen más partidos desde el banquillo que como titulares y revolucionan el marcador con la segunda unidad.',
    advancedDesc:
      'Filtro reglamentario NBA (salidas de suplente > titularidades) ponderando PTS, GmSc, TS%, impacto +/- y victorias de equipo.',
    usesGamesRuleByDefault: false,
  },
  {
    id: 'clutch',
    shortLabel: 'Jugador Clutch',
    fullTitle: 'Jugador Clutch del Año (CPOY)',
    simpleDesc:
      'Rendimiento y victorias en partidos apretados decididos por 5 puntos o menos de diferencia.',
    advancedDesc:
      'Calculado sobre encuentros reales con margen final ≤ 5 puntos: producción anotadora, TS% clutch, +/- y porcentaje de victorias.',
    usesGamesRuleByDefault: false,
  },
  {
    id: 'hustle',
    shortLabel: 'Jugador Hustle',
    fullTitle: 'Jugador Hustle del Año (Esfuerzo e Intangibles)',
    simpleDesc:
      'Reconoce a los especialistas del trabajo sucio: desvíos de balón, balones divididos, tiros punteados y rebotes de ataque.',
    advancedDesc:
      ' Métricas oficiales NBA Hustle por partido y por 36 min: deflections, loose balls, contested shots, screen assists, box-outs y OREB.',
    usesGamesRuleByDefault: false,
  },
  {
    id: 'all_nba',
    shortLabel: 'Quintetos All-NBA',
    fullTitle: 'Proyección de Quintetos All-NBA (1.º, 2.º y 3.º)',
    simpleDesc:
      'Los 15 mejores jugadores de la liga repartidos en tres quintetos sin restricción de posición y sujetos al mínimo de partidos.',
    advancedDesc:
      'Formato CBA actual positionless (Top 15 elegibles). Ajusta el slider de partidos proyectados para simular quién entra o cae del corte.',
    usesGamesRuleByDefault: true,
  },
];

const STORAGE_MIN_GAMES_KEY = 'radarnba_awards_min_games_v1';
const STORAGE_SHOW_INELIGIBLE_KEY = 'radarnba_awards_show_ineligible_v1';

export function SeasonAwardsView({
  data,
  loading,
  errorMsg,
  seasonScope,
  onChangeSeasonScope,
  activeCategory,
  onChangeCategory,
  experienceMode,
  watchlistIds,
  onlyWatchlist,
  onToggleOnlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  onRetry,
}: SeasonAwardsViewProps) {
  const [minProjectedGames, setMinProjectedGames] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_MIN_GAMES_KEY));
      if (Number.isFinite(saved) && saved >= 0 && saved <= 82) {
        return Math.round(saved);
      }
    } catch {
      // Ignore storage error
    }
    return 65;
  });

  const [showIneligible, setShowIneligible] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_SHOW_INELIGIBLE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const [searchQuery, setSearchQuery] = useState('');

  const handleMinGamesChange = (val: number) => {
    const clean = Math.max(0, Math.min(82, Math.round(val)));
    setMinProjectedGames(clean);
    try {
      localStorage.setItem(STORAGE_MIN_GAMES_KEY, String(clean));
    } catch {
      // Ignore storage error
    }
  };

  const handleToggleShowIneligible = (next: boolean) => {
    setShowIneligible(next);
    try {
      localStorage.setItem(STORAGE_SHOW_INELIGIBLE_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage error
    }
  };

  const activeMeta =
    AWARD_TABS.find((t) => t.id === activeCategory) || AWARD_TABS[0];

  const qNorm = normalizeSearchText(searchQuery);

  const matchesFilters = useMemo(() => {
    return (entry: AwardCandidateEntry) => {
      if (onlyWatchlist && !watchlistIds.has(`player:${entry.playerId}`)) {
        return false;
      }
      if (!qNorm) return true;
      const hay = normalizeSearchText(
        `${entry.playerName} ${entry.teamAbbr} ${entry.teamName} ${entry.position}`
      );
      return hay.includes(qNorm);
    };
  }, [onlyWatchlist, watchlistIds, qNorm]);

  const individualRows = useMemo(() => {
    if (!data || activeCategory === 'all_nba') return [];
    const raw = data.categories[activeCategory] || [];
    const searched = raw.filter(matchesFilters);
    if (showIneligible) {
      return searched;
    }
    return searched.filter((c) => c.projectedGames82 >= minProjectedGames);
  }, [data, activeCategory, matchesFilters, showIneligible, minProjectedGames]);

  const excludedTopIndividualCount = useMemo(() => {
    if (!data || activeCategory === 'all_nba') return 0;
    const raw = data.categories[activeCategory] || [];
    return raw.filter(
      (c) => matchesFilters(c) && c.projectedGames82 < minProjectedGames
    ).length;
  }, [data, activeCategory, matchesFilters, minProjectedGames]);

  const allNbaComputed = useMemo(() => {
    if (!data) {
      return {
        firstTeam: [] as AwardCandidateEntry[],
        secondTeam: [] as AwardCandidateEntry[],
        thirdTeam: [] as AwardCandidateEntry[],
        honorableMentions: [] as AwardCandidateEntry[],
        ineligibleStars: [] as AwardCandidateEntry[],
      };
    }
    const pool = (data.allNbaPool || []).filter(matchesFilters);
    const eligible = pool.filter((c) => c.projectedGames82 >= minProjectedGames);
    const cutoffScore = eligible[14]?.awardScore ?? 0;
    const ineligibleStars = pool.filter(
      (c) =>
        c.projectedGames82 < minProjectedGames &&
        (eligible.length < 15 || c.awardScore >= cutoffScore)
    );

    return {
      firstTeam: eligible.slice(0, 5),
      secondTeam: eligible.slice(5, 10),
      thirdTeam: eligible.slice(10, 15),
      honorableMentions: eligible.slice(15, 20),
      ineligibleStars: ineligibleStars.slice(0, 8),
    };
  }, [data, matchesFilters, minProjectedGames]);

  const isCompletedSeasonView = seasonScope === '2026' || (data?.avgTeamGamesPlayed ?? 0) >= 80;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Control Header Panel */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-3.5 sm:p-4 space-y-3.5">
        {/* Top Row: Title + Season Scope + Watchlist */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-100">
                Carrera por los Premios de Temporada NBA
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              {experienceMode === 'simple'
                ? 'Seguimiento estadístico en tiempo real con rachas, subidas y bajadas recientes y control de mínimo de partidos.'
                : 'Índice propio (0–100) combinando impacto individual, contexto colectivo, desviaciones (Últ. 5 PJ) y proyección CBA sobre 82 encuentros.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
              {(
                [
                  { id: '2027', label: '2026-27 Actual' },
                  { id: '2026', label: '2025-26 Completa' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChangeSeasonScope(s.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    seasonScope === s.id
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleOnlyWatchlist}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                onlyWatchlist
                  ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                  : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white'
              }`}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  onlyWatchlist ? 'fill-orange-400 text-orange-400' : ''
                }`}
              />
              <span>Solo favoritos ({watchlistIds.size})</span>
            </button>
          </div>
        </div>

        {/* 8 Award Category Tabs */}
        <div className="pt-3 border-t border-[#1E293B]">
          <div
            role="tablist"
            aria-label="Categorías de premios NBA"
            className="flex items-center gap-1.5 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar"
          >
            {AWARD_TABS.map((tab) => {
              const isActive = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => onChangeCategory(tab.id)}
                  className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#131C2E]'
                  }`}
                >
                  {tab.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Configurable Minimum Games Rule Slider + Search */}
        <div className="pt-3 border-t border-[#1E293B] grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-center">
          <div className="lg:col-span-5 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium">
                <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span>
                  {isCompletedSeasonView
                    ? 'Mínimo de partidos jugados:'
                    : 'Mínimo proyectado (sobre 82 PJ):'}
                </span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono tabular-nums font-semibold text-orange-400">
                  ≥ {minProjectedGames} / 82 PJ
                </span>
                {minProjectedGames !== 65 && (
                  <button
                    type="button"
                    onClick={() => handleMinGamesChange(65)}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-orange-300 transition-colors whitespace-nowrap"
                    title="Restaurar mínimo reglamentario NBA (65 partidos)"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>65 NBA</span>
                  </button>
                )}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={82}
              step={1}
              value={minProjectedGames}
              onChange={(e) => handleMinGamesChange(Number(e.target.value))}
              aria-label="Mínimo de partidos proyectados sobre 82"
              className="w-full accent-orange-500"
            />
          </div>

          <div className="lg:col-span-4 flex items-center gap-2">
            {activeCategory !== 'all_nba' ? (
              <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleToggleShowIneligible(false)}
                  className={`flex-1 sm:flex-initial px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    !showIneligible
                      ? 'bg-[#1E293B] text-orange-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Solo elegibles
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleShowIneligible(true)}
                  className={`flex-1 sm:flex-initial px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    showIneligible
                      ? 'bg-[#1E293B] text-orange-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Mostrar con aviso
                  {excludedTopIndividualCount > 0 ? ` (+${excludedTopIndividualCount})` : ''}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Los 3 quintetos recalculan su corte automáticamente según el mínimo de{' '}
                <span className="font-mono tabular-nums text-slate-200">
                  {minProjectedGames} PJ
                </span>
                .
              </p>
            )}
          </div>

          <div className="lg:col-span-3 relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar jugador o equipo..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
      </section>

      {/* Error State */}
      {errorMsg && (
        <div className="bg-[#131C2E] border border-rose-500/40 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-rose-300">
              No se pudieron cargar las carreras por los premios NBA
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{errorMsg}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap shrink-0"
          >
            Reintentar carga
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-[#1E293B]" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-36 bg-[#1E293B] rounded" />
                    <div className="h-3 w-24 bg-[#1E293B] rounded" />
                  </div>
                </div>
                <div className="h-8 bg-[#0B1120] rounded" />
                <div className="h-3 w-full bg-[#1E293B] rounded" />
              </div>
            ))}
          </div>
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y divide-[#1E293B]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-12 px-4 flex items-center justify-between gap-4 animate-pulse"
              >
                <div className="h-3.5 w-44 bg-[#1E293B] rounded" />
                <div className="h-3.5 w-24 bg-[#1E293B] rounded" />
                <div className="h-3.5 w-28 bg-[#1E293B] rounded hidden sm:block" />
                <div className="h-3.5 w-20 bg-[#1E293B] rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : data ? (
        <>
          {/* Active Award Context Banner */}
          <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <h3 className="font-display text-sm sm:text-base font-semibold text-slate-100">
                {activeMeta.fullTitle}
              </h3>
              <p className="text-xs text-slate-400">
                {experienceMode === 'simple'
                  ? activeMeta.simpleDesc
                  : activeMeta.advancedDesc}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums shrink-0">
              <span>Temporada {data.seasonLabel}</span>
              <span aria-hidden="true">·</span>
              <span>Media equipos: {data.avgTeamGamesPlayed} PJ</span>
              <span aria-hidden="true">·</span>
              <span className="text-orange-300">Corte: ≥{minProjectedGames} PJ</span>
            </div>
          </section>

          {activeCategory === 'all_nba' ? (
            <AllNbaQuintetsSection
              firstTeam={allNbaComputed.firstTeam}
              secondTeam={allNbaComputed.secondTeam}
              thirdTeam={allNbaComputed.thirdTeam}
              honorableMentions={allNbaComputed.honorableMentions}
              ineligibleStars={allNbaComputed.ineligibleStars}
              minProjectedGames={minProjectedGames}
              isCompletedSeasonView={isCompletedSeasonView}
              experienceMode={experienceMode}
              watchlistIds={watchlistIds}
              onToggleWatchlist={onToggleWatchlist}
              onInspectEntity={onInspectEntity}
              onLowerSlider={() => handleMinGamesChange(Math.max(0, minProjectedGames - 15))}
            />
          ) : individualRows.length === 0 ? (
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-8 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-200">
                Ningún candidato supera los filtros actuales en {activeMeta.shortLabel}
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Prueba a reducir el mínimo de partidos proyectados ({minProjectedGames} PJ),
                activar «Mostrar con aviso» o limpiar la búsqueda.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {minProjectedGames > 40 && (
                  <button
                    type="button"
                    onClick={() => handleMinGamesChange(50)}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors"
                  >
                    Bajar mínimo a 50 PJ
                  </button>
                )}
                {!showIneligible && excludedTopIndividualCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleToggleShowIneligible(true)}
                    className="px-3.5 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] text-slate-200 rounded-lg hover:bg-[#182338] transition-colors"
                  >
                    Mostrar no elegibles ({excludedTopIndividualCount})
                  </button>
                )}
                {(searchQuery || onlyWatchlist) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      if (onlyWatchlist) onToggleOnlyWatchlist();
                    }}
                    className="px-3.5 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] text-slate-200 rounded-lg hover:bg-[#182338] transition-colors"
                  >
                    Limpiar búsqueda y favoritos
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              {/* Top 3 Podium Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                {individualRows.slice(0, 3).map((cand, idx) => {
                  const isEligible = cand.projectedGames82 >= minProjectedGames;
                  const rankLabel =
                    idx === 0
                      ? '01. Favorito actual'
                      : idx === 1
                      ? '02. Segundo clasificado'
                      : '03. Tercer clasificado';
                  const metrics =
                    experienceMode === 'simple'
                      ? cand.metricsSimple
                      : cand.metricsAdvanced;
                  const isStarred = watchlistIds.has(`player:${cand.playerId}`);

                  return (
                    <div
                      key={cand.playerId}
                      onClick={() => onInspectEntity('player', cand.playerId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onInspectEntity('player', cand.playerId);
                        }
                      }}
                      className={`bg-[#131C2E] border rounded-lg p-4 flex flex-col justify-between gap-3.5 cursor-pointer transition-colors hover:bg-[#182338] ${
                        idx === 0
                          ? 'border-orange-500/45'
                          : 'border-[#1E293B]'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Kicker + Score */}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span
                            className={`font-medium ${
                              idx === 0 ? 'text-orange-400' : 'text-slate-400'
                            }`}
                          >
                            {rankLabel}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400">Índice Radar</span>
                            <span className="font-mono tabular-nums text-sm font-bold text-slate-100">
                              {cand.awardScore.toFixed(1)}
                            </span>
                            <button
                              type="button"
                              aria-label={
                                isStarred ? 'Quitar de favoritos' : 'Añadir a favoritos'
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleWatchlist(`player:${cand.playerId}`);
                              }}
                              className="p-1 text-slate-400 hover:text-orange-400 transition-colors"
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${
                                  isStarred ? 'fill-orange-400 text-orange-400' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Player Identity */}
                        <div className="flex items-center gap-3">
                          <PlayerAvatar
                            playerId={cand.playerId}
                            name={cand.playerName}
                            teamAbbr={cand.teamAbbr}
                            size="lg"
                            accentTone={idx === 0 ? 'orange' : 'default'}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-display text-base font-semibold text-slate-100 truncate">
                              {cand.playerName}
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
                                <TeamLogo abbr={cand.teamAbbr} size="xs" />
                                <span>{cand.teamAbbr}</span>
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{cand.position}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {cand.teamWins}-{cand.teamLosses} (#{cand.conferenceSeed}{' '}
                                {cand.conference})
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 3 Key Award Metrics */}
                        <div className="grid grid-cols-3 divide-x divide-[#1E293B] border-y border-[#1E293B] py-2.5">
                          {metrics.slice(0, 3).map((m) => (
                            <div key={m.key} className="px-2 first:pl-0 last:pr-0">
                              <p className="text-[11px] text-slate-400 truncate">{m.label}</p>
                              <p
                                className={`font-mono tabular-nums text-xs sm:text-sm font-semibold mt-0.5 truncate ${
                                  m.tone === 'positive'
                                    ? 'text-emerald-400'
                                    : m.tone === 'accent'
                                    ? 'text-orange-300'
                                    : 'text-slate-100'
                                }`}
                              >
                                {m.valueDisplay}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Summary Prose */}
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {experienceMode === 'simple'
                            ? cand.summarySimple
                            : cand.summaryAdvanced}
                        </p>
                      </div>

                      {/* Bottom Footer: Recent Deviation + Streak + 82G Eligibility */}
                      <div className="pt-2.5 border-t border-[#1E293B]/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <DeviationInlineText entry={cand} />
                          {cand.activeStreakLabel && (
                            <>
                              <span className="text-slate-600" aria-hidden="true">
                                ·
                              </span>
                              <span className="inline-flex items-center gap-1 text-orange-300 font-mono tabular-nums whitespace-nowrap">
                                <Flame className="w-3 h-3 shrink-0" />
                                <span>{cand.activeStreakLabel}</span>
                              </span>
                            </>
                          )}
                        </div>

                        <EligibilityInlineText
                          projectedGames82={cand.projectedGames82}
                          gamesPlayed={cand.gamesPlayed}
                          minProjectedGames={minProjectedGames}
                          isEligible={isEligible}
                          isCompletedSeasonView={isCompletedSeasonView}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Full Candidates Table */}
              <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-display text-sm font-semibold text-slate-100">
                    Clasificación completa · {activeMeta.shortLabel} ({individualRows.length}{' '}
                    candidatos)
                  </h4>
                  <span className="text-xs text-slate-400">
                    Pulsa en cualquier jugador para abrir su expediente completo
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#1E293B] text-[11px] font-medium text-slate-400 bg-[#0B1120]/55">
                        <th className="py-2.5 pl-4 pr-2 w-10">#</th>
                        <th className="py-2.5 px-3">Jugador y equipo</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">
                          Índice Radar
                        </th>
                        {(experienceMode === 'simple'
                          ? individualRows[0]?.metricsSimple
                          : individualRows[0]?.metricsAdvanced
                        )
                          ?.slice(0, 3)
                          .map((col) => (
                            <th
                              key={col.key}
                              className="py-2.5 px-3 text-right whitespace-nowrap"
                            >
                              {col.label}
                            </th>
                          ))}
                        <th className="py-2.5 px-3 whitespace-nowrap">
                          Desviación (Últ. 5) y Racha
                        </th>
                        <th className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                          {isCompletedSeasonView ? 'PJ Jugados' : 'PJ · Proy. 82'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B] text-xs">
                      {individualRows.map((cand, idx) => {
                        const isEligible = cand.projectedGames82 >= minProjectedGames;
                        const rowMetrics =
                          experienceMode === 'simple'
                            ? cand.metricsSimple
                            : cand.metricsAdvanced;
                        const isStarred = watchlistIds.has(`player:${cand.playerId}`);

                        return (
                          <tr
                            key={cand.playerId}
                            onClick={() => onInspectEntity('player', cand.playerId)}
                            className={`hover:bg-[#182338] transition-colors cursor-pointer ${
                              !isEligible ? 'opacity-70' : ''
                            }`}
                          >
                            <td className="py-2.5 pl-4 pr-2 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  aria-label="Favorito"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleWatchlist(`player:${cand.playerId}`);
                                  }}
                                  className="text-slate-500 hover:text-orange-400 transition-colors"
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      isStarred
                                        ? 'fill-orange-400 text-orange-400'
                                        : ''
                                    }`}
                                  />
                                </button>
                                <span
                                  className={
                                    idx < 3 ? 'text-orange-400 font-semibold' : ''
                                  }
                                >
                                  {idx + 1}
                                </span>
                              </div>
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2.5 min-w-[180px]">
                                <PlayerAvatar
                                  playerId={cand.playerId}
                                  name={cand.playerName}
                                  teamAbbr={cand.teamAbbr}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-100 truncate">
                                    {cand.playerName}
                                  </p>
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 whitespace-nowrap">
                                    <TeamLogo abbr={cand.teamAbbr} size="xs" />
                                    <span>{cand.teamAbbr}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>{cand.position}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono tabular-nums">
                                      {cand.teamWins}-{cand.teamLosses}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              <span className="font-bold text-slate-100">
                                {cand.awardScore.toFixed(1)}
                              </span>
                              {experienceMode === 'advanced' && (
                                <span
                                  className="block text-[10px] text-slate-500"
                                  title="Desglose: Producción + Eficiencia + Equipo + Momento"
                                >
                                  {cand.scoreBreakdown.production.toFixed(0)}+
                                  {cand.scoreBreakdown.efficiencyImpact.toFixed(0)}+
                                  {cand.scoreBreakdown.teamContext.toFixed(0)}+
                                  {cand.scoreBreakdown.momentum.toFixed(0)}
                                </span>
                              )}
                            </td>

                            {rowMetrics.slice(0, 3).map((m) => (
                              <td
                                key={m.key}
                                className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                                  m.tone === 'positive'
                                    ? 'text-emerald-400 font-semibold'
                                    : m.tone === 'accent'
                                    ? 'text-orange-300 font-semibold'
                                    : 'text-slate-200'
                                }`}
                              >
                                {m.valueDisplay}
                              </td>
                            ))}

                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <DeviationInlineText entry={cand} />
                                {cand.activeStreakLabel && (
                                  <>
                                    <span className="text-slate-600" aria-hidden="true">
                                      ·
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-orange-300 font-mono tabular-nums">
                                      <Flame className="w-3 h-3 shrink-0" />
                                      <span>{cand.activeStreakLabel}</span>
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>

                            <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                              <EligibilityInlineText
                                projectedGames82={cand.projectedGames82}
                                gamesPlayed={cand.gamesPlayed}
                                minProjectedGames={minProjectedGames}
                                isEligible={isEligible}
                                isCompletedSeasonView={isCompletedSeasonView}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function DeviationInlineText({ entry }: { entry: AwardCandidateEntry }) {
  const delta = entry.recentPtsDelta;
  if (entry.momentumTone === 'positive') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400 font-mono tabular-nums whitespace-nowrap">
        <TrendingUp className="w-3.5 h-3.5 shrink-0" />
        <span>{formatSigned(delta, 1)} PTS</span>
      </span>
    );
  }
  if (entry.momentumTone === 'negative') {
    return (
      <span className="inline-flex items-center gap-1 text-rose-400 font-mono tabular-nums whitespace-nowrap">
        <TrendingDown className="w-3.5 h-3.5 shrink-0" />
        <span>{formatSigned(delta, 1)} PTS</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-400 font-mono tabular-nums whitespace-nowrap">
      <span>{formatSigned(delta, 1)} PTS</span>
    </span>
  );
}

function EligibilityInlineText({
  projectedGames82,
  gamesPlayed,
  minProjectedGames,
  isEligible,
  isCompletedSeasonView,
}: {
  projectedGames82: number;
  gamesPlayed: number;
  minProjectedGames: number;
  isEligible: boolean;
  isCompletedSeasonView: boolean;
}) {
  if (isEligible) {
    return (
      <span
        className="inline-flex items-center justify-end gap-1 text-emerald-400 font-mono tabular-nums whitespace-nowrap"
        title={`Cumple el corte actual de ${minProjectedGames} partidos`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>
          {isCompletedSeasonView
            ? `${gamesPlayed} PJ`
            : `${gamesPlayed} PJ · Proy. ${projectedGames82}/82`}
        </span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-end gap-1 text-amber-400 font-mono tabular-nums whitespace-nowrap"
      title={`Por debajo del mínimo configurado (${minProjectedGames}/82 PJ)`}
    >
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <span>
        {isCompletedSeasonView
          ? `${gamesPlayed} PJ (Corte ${minProjectedGames})`
          : `${gamesPlayed} PJ · Proy. ${projectedGames82}/82`}
      </span>
    </span>
  );
}

interface AllNbaQuintetsSectionProps {
  firstTeam: AwardCandidateEntry[];
  secondTeam: AwardCandidateEntry[];
  thirdTeam: AwardCandidateEntry[];
  honorableMentions: AwardCandidateEntry[];
  ineligibleStars: AwardCandidateEntry[];
  minProjectedGames: number;
  isCompletedSeasonView: boolean;
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onLowerSlider: () => void;
}

function AllNbaQuintetsSection({
  firstTeam,
  secondTeam,
  thirdTeam,
  honorableMentions,
  ineligibleStars,
  minProjectedGames,
  isCompletedSeasonView,
  experienceMode,
  watchlistIds,
  onToggleWatchlist,
  onInspectEntity,
  onLowerSlider,
}: AllNbaQuintetsSectionProps) {
  const quintets = [
    {
      id: 'first',
      title: '01. Primer Quinteto All-NBA',
      subtitle: 'Puestos #1 al #5 de la liga · Sin restricción de posición',
      accentHeader: 'text-orange-400',
      players: firstTeam,
      rankOffset: 1,
    },
    {
      id: 'second',
      title: '02. Segundo Quinteto All-NBA',
      subtitle: 'Puestos #6 al #10 de la liga · Sin restricción de posición',
      accentHeader: 'text-slate-200',
      players: secondTeam,
      rankOffset: 6,
    },
    {
      id: 'third',
      title: '03. Tercer Quinteto All-NBA',
      subtitle: 'Puestos #11 al #15 de la liga · Sin restricción de posición',
      accentHeader: 'text-slate-300',
      players: thirdTeam,
      rankOffset: 11,
    },
  ];

  if (firstTeam.length === 0) {
    return (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-slate-200">
          Ningún jugador alcanza todavía la proyección de {minProjectedGames} partidos con el filtro actual
        </p>
        <button
          type="button"
          onClick={onLowerSlider}
          className="px-4 py-2 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors"
        >
          Reducir corte de partidos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Three All-NBA Quintet Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
        {quintets.map((q) => (
          <section
            key={q.id}
            className={`bg-[#131C2E] border rounded-lg overflow-hidden flex flex-col ${
              q.id === 'first' ? 'border-orange-500/45' : 'border-[#1E293B]'
            }`}
          >
            <div className="px-4 py-3 border-b border-[#1E293B] bg-[#0B1120]/45">
              <div className="flex items-center justify-between gap-2">
                <h4 className={`font-display text-sm font-semibold ${q.accentHeader}`}>
                  {q.title}
                </h4>
                <Trophy
                  className={`w-4 h-4 shrink-0 ${
                    q.id === 'first' ? 'text-orange-400' : 'text-slate-500'
                  }`}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{q.subtitle}</p>
            </div>

            <div className="divide-y divide-[#1E293B] flex-1">
              {q.players.length === 0 ? (
                <p className="p-4 text-xs text-slate-500">
                  Sin suficientes candidatos elegibles en este escalón.
                </p>
              ) : (
                q.players.map((cand, idx) => {
                  const isStarred = watchlistIds.has(`player:${cand.playerId}`);
                  return (
                    <div
                      key={cand.playerId}
                      onClick={() => onInspectEntity('player', cand.playerId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onInspectEntity('player', cand.playerId);
                        }
                      }}
                      className="px-3.5 py-3 hover:bg-[#182338] transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono tabular-nums text-xs text-slate-400 w-5 shrink-0">
                            #{q.rankOffset + idx}
                          </span>
                          <PlayerAvatar
                            playerId={cand.playerId}
                            name={cand.playerName}
                            teamAbbr={cand.teamAbbr}
                            size="sm"
                            accentTone={q.id === 'first' ? 'orange' : 'default'}
                          />
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                              {cand.playerName}
                            </p>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 whitespace-nowrap">
                              <TeamLogo abbr={cand.teamAbbr} size="xs" />
                              <span>{cand.teamAbbr}</span>
                              <span aria-hidden="true">·</span>
                              <span>{cand.position}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {cand.teamWins}-{cand.teamLosses}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="text-right font-mono tabular-nums">
                            <p className="text-xs font-bold text-slate-100">
                              {cand.awardScore.toFixed(1)}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {isCompletedSeasonView
                                ? `${cand.gamesPlayed} PJ`
                                : `Proy. ${cand.projectedGames82}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="Favorito"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleWatchlist(`player:${cand.playerId}`);
                            }}
                            className="p-1 text-slate-500 hover:text-orange-400"
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                isStarred ? 'fill-orange-400 text-orange-400' : ''
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      <div className="pl-7 flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono tabular-nums text-slate-300 truncate">
                          {experienceMode === 'simple'
                            ? `${cand.ptsAvg.toFixed(1)} PTS · ${cand.rebAvg.toFixed(1)} REB · ${cand.astAvg.toFixed(1)} AST`
                            : `${cand.gmScAvg.toFixed(1)} GmSc · ${cand.tsPct.toFixed(1)}% TS · ${formatSigned(cand.netRtg, 1)} Net`}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <DeviationInlineText entry={cand} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        ))}
      </div>

      {/* Bottom Split: Honorable Mentions (#16-#20) & Ineligible Stars (< Min Games) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Honorable Mentions */}
        <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E293B] flex items-center justify-between gap-2">
            <div>
              <h4 className="font-display text-sm font-semibold text-slate-100">
                Al corte del 3.er Quinteto (Puestos #16–#20)
              </h4>
              <p className="text-xs text-slate-400">
                Siguientes jugadores elegibles llamando a la puerta del All-NBA
              </p>
            </div>
            <Users className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          {honorableMentions.length === 0 ? (
            <p className="p-4 text-xs text-slate-500">Sin aspirantes adicionales en lista.</p>
          ) : (
            <div className="divide-y divide-[#1E293B]">
              {honorableMentions.map((cand, idx) => (
                <div
                  key={cand.playerId}
                  onClick={() => onInspectEntity('player', cand.playerId)}
                  className="px-4 py-2.5 hover:bg-[#182338] transition-colors cursor-pointer flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono tabular-nums text-slate-400 w-6">
                      #{16 + idx}
                    </span>
                    <PlayerAvatar
                      playerId={cand.playerId}
                      name={cand.playerName}
                      teamAbbr={cand.teamAbbr}
                      size="xs"
                    />
                    <span className="font-semibold text-slate-100 truncate">
                      {cand.playerName}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400">{cand.teamAbbr}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                    <span className="text-slate-300 hidden sm:inline">
                      {cand.ptsAvg.toFixed(1)}P · {cand.rebAvg.toFixed(1)}R ·{' '}
                      {cand.astAvg.toFixed(1)}A
                    </span>
                    <DeviationInlineText entry={cand} />
                    <span className="font-bold text-slate-100">
                      {cand.awardScore.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Stars Excluded by Minimum Games Rule */}
        <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E293B] flex items-center justify-between gap-2">
            <div>
              <h4 className="font-display text-sm font-semibold text-amber-300">
                Fuera por mínimo de partidos (&lt; {minProjectedGames} PJ)
              </h4>
              <p className="text-xs text-slate-400">
                Estrellas con nivel Top-15 penalizadas por ausencias según el corte activo
              </p>
            </div>
            <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          {ineligibleStars.length === 0 ? (
            <div className="p-4 text-xs text-slate-400 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Ninguna estrella de nivel Top-15 queda excluida actualmente con el corte de{' '}
                {minProjectedGames} partidos.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-[#1E293B]">
              {ineligibleStars.map((cand) => (
                <div
                  key={cand.playerId}
                  onClick={() => onInspectEntity('player', cand.playerId)}
                  className="px-4 py-2.5 hover:bg-[#182338] transition-colors cursor-pointer flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PlayerAvatar
                      playerId={cand.playerId}
                      name={cand.playerName}
                      teamAbbr={cand.teamAbbr}
                      size="xs"
                    />
                    <span className="font-semibold text-slate-100 truncate">
                      {cand.playerName}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400">{cand.teamAbbr}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                    <span className="text-amber-400 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isCompletedSeasonView
                          ? `${cand.gamesPlayed} PJ`
                          : `Proy. ${cand.projectedGames82}/82`}
                      </span>
                    </span>
                    <span className="font-bold text-slate-200">
                      Índice {cand.awardScore.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
