import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Plus,
  Search,
  Sliders,
} from 'lucide-react';
import type {
  ExperienceMode,
  PlayerSummary,
  RangePreset,
  RangeSelection,
  SearchPlayerResult,
  TeamSummary,
} from '../types/nba';
import {
  comparePlayerSlices,
  compareTeamSlices,
  formatShortDate,
  formatSigned,
  normalizeSearchText,
  sliceGamesByRange,
} from '../utils/analytics';
import {
  computePlainComparisonInsights,
  evaluateVsLeague,
  type LeagueBenchmarks,
  type MetricBenchmark,
} from '../utils/humanize';
import { ColumnHelpHeader, MetricInfoTooltip } from './MetricUiHelpers';

interface RangeComparatorViewProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
  experienceMode: ExperienceMode;
  benchmarks: LeagueBenchmarks;
  onSwitchToAdvanced: () => void;
  initialEntityType?: 'player' | 'team';
  initialEntityId?: string;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onAddExternalPlayer: (item: SearchPlayerResult) => Promise<PlayerSummary | null>;
}

const PRESET_OPTIONS: Array<{ value: RangePreset; label: string }> = [
  { value: 'last_5', label: 'Últimos 5 partidos' },
  { value: 'last_10', label: 'Últimos 10 partidos' },
  { value: 'last_3', label: 'Últimos 3 partidos' },
  { value: 'prev_5', label: '5 partidos anteriores (del 6º al 10º)' },
  { value: 'prev_10', label: '10 partidos anteriores (del 11º al 20º)' },
  { value: 'season_all', label: 'Toda la temporada disponible' },
  { value: 'home_only', label: 'Solo partidos en Casa (Local)' },
  { value: 'away_only', label: 'Solo partidos Fuera (Visitante)' },
  { value: 'b2b_only', label: 'Sin días de descanso (Back-to-Back)' },
  { value: 'rested_only', label: 'Con descanso (1 o más días libres)' },
  { value: 'custom_dates', label: 'Rango de fechas personalizado' },
];

const SIMPLE_ROW_LABELS: Record<string, string> = {
  min: 'Minutos jugados por partido',
  pts: 'Puntos por partido',
  reb: 'Rebotes totales',
  oreb: 'Rebotes en ataque (2ª jugada)',
  dreb: 'Rebotes en defensa',
  ast: 'Asistencias (pases de canasta)',
  pra: 'Producción total (Puntos + Reb + Asist)',
  stocks: 'Robos + Tapones (defensa)',
  fg3m: 'Triples anotados por partido',
  fgPct: 'Acierto en tiros de campo (%)',
  fg3Pct: 'Acierto en triples (%)',
  ftPct: 'Acierto en tiros libres (%)',
  tov: 'Balones perdidos por partido',
  plusMinus: 'Más / Menos con él en pista',
  usgEst: 'Protagonismo con balón (Uso %)',
  tsPct: 'Acierto real de tiro (TS%)',
  efgPct: 'Tiro de campo efectivo (eFG%)',
  gmSc: 'Valoración global del partido',
  fga: 'Tiros intentados por noche',
  winPct: 'Porcentaje de victorias (%)',
  pf: 'Puntos anotados a favor',
  pa: 'Puntos recibidos en contra',
  diff: 'Margen medio de puntos',
  offRtg: 'Ataque cada 100 jugadas (OffRtg)',
  defRtg: 'Defensa cada 100 jugadas (DefRtg)',
  netRtg: 'Dominio neto cada 100 jugadas',
  pace: 'Velocidad del partido (posesiones)',
  orebPct: '% de rebotes ofensivos capturados',
  tovPct: '% de jugadas con pérdida',
};

export function RangeComparatorView({
  players,
  teams,
  experienceMode,
  benchmarks,
  onSwitchToAdvanced,
  initialEntityType = 'player',
  initialEntityId,
  onInspectEntity,
  onAddExternalPlayer,
}: RangeComparatorViewProps) {
  const [entityType, setEntityType] = useState<'player' | 'team'>(initialEntityType);
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (initialEntityId) return initialEntityId;
    return players[0]?.id || '';
  });

  // Searchable combobox state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [remotePlayers, setRemotePlayers] = useState<SearchPlayerResult[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [metricLayer, setMetricLayer] = useState<'all' | 'basic' | 'advanced'>(
    experienceMode === 'simple' ? 'basic' : 'all'
  );
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMetricLayer(experienceMode === 'simple' ? 'basic' : 'all');
  }, [experienceMode]);

  useEffect(() => {
    if (initialEntityId) {
      setEntityType(initialEntityType);
      setSelectedId(initialEntityId);
    }
  }, [initialEntityType, initialEntityId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setSearchQuery('');
      setRemotePlayers([]);
    }
  }, [dropdownOpen]);

  // Remote search when in player mode and typing 2+ characters
  useEffect(() => {
    if (entityType !== 'player' || !dropdownOpen) return;
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setRemotePlayers([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingRemote(true);
      try {
        const res = await fetch(`/api/nba/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok && !cancelled) {
          const json = await res.json();
          setRemotePlayers(json.results || []);
        }
      } catch {
        // Ignore transient search errors
      } finally {
        if (!cancelled) setSearchingRemote(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [entityType, dropdownOpen, searchQuery]);

  const handleModeChange = (mode: 'player' | 'team') => {
    setEntityType(mode);
    setDropdownOpen(false);
    if (mode === 'player' && players.length > 0) {
      setSelectedId(players[0].id);
    } else if (mode === 'team' && teams.length > 0) {
      setSelectedId(teams[0].id);
    }
  };

  const activePlayer = useMemo(
    () =>
      entityType === 'player'
        ? players.find((p) => p.id === selectedId) || players[0]
        : undefined,
    [entityType, players, selectedId]
  );

  const activeTeam = useMemo(
    () =>
      entityType === 'team'
        ? teams.find((t) => t.id === selectedId) || teams[0]
        : undefined,
    [entityType, teams, selectedId]
  );

  const filteredLocalPlayers = useMemo(() => {
    const q = normalizeSearchText(searchQuery);
    if (!q) return players;
    return players.filter((p) =>
      normalizeSearchText(`${p.name} ${p.teamAbbr} ${p.teamName} ${p.position}`).includes(
        q
      )
    );
  }, [players, searchQuery]);

  const filteredLocalTeams = useMemo(() => {
    const q = normalizeSearchText(searchQuery);
    if (!q) return teams;
    return teams.filter((t) =>
      normalizeSearchText(`${t.name} ${t.abbreviation} ${t.conference}`).includes(q)
    );
  }, [teams, searchQuery]);

  const loadedPlayerIds = useMemo(() => new Set(players.map((p) => p.id)), [players]);
  const extraRemotePlayers = useMemo(
    () => remotePlayers.filter((r) => !loadedPlayerIds.has(r.id)),
    [remotePlayers, loadedPlayerIds]
  );

  const availableDates = useMemo(() => {
    const games =
      entityType === 'player' ? activePlayer?.games || [] : activeTeam?.games || [];
    if (games.length === 0) {
      return { min: '2025-10-20', max: '2026-10-26', mid: '2026-02-01' };
    }
    const sorted = [...games].map((g) => g.date.slice(0, 10)).sort();
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mid = sorted[Math.floor(sorted.length / 2)];
    return { min, max, mid };
  }, [entityType, activePlayer, activeTeam]);

  const [rangeA, setRangeA] = useState<RangeSelection>({
    preset: 'last_5',
    startDate: '',
    endDate: '',
  });

  const [rangeB, setRangeB] = useState<RangeSelection>({
    preset: 'season_all',
    startDate: '',
    endDate: '',
  });

  const comparison = useMemo(() => {
    if (entityType === 'player' && activePlayer) {
      const sliceA = sliceGamesByRange(activePlayer.games, rangeA);
      const sliceB = sliceGamesByRange(activePlayer.games, rangeB);
      const { rows, insights } = comparePlayerSlices(sliceA, sliceB);
      const plainInsights = computePlainComparisonInsights('player', rows);
      return {
        name: activePlayer.name,
        subtitle: `${activePlayer.teamAbbr} · ${activePlayer.position} · Total ${activePlayer.games.length} PJ`,
        id: activePlayer.id,
        countA: sliceA.length,
        countB: sliceB.length,
        spanA:
          sliceA.length > 0
            ? `${formatShortDate(sliceA[sliceA.length - 1].date)} – ${formatShortDate(sliceA[0].date)}`
            : 'Sin partidos',
        spanB:
          sliceB.length > 0
            ? `${formatShortDate(sliceB[sliceB.length - 1].date)} – ${formatShortDate(sliceB[0].date)}`
            : 'Sin partidos',
        rows,
        insights,
        plainInsights,
      };
    }

    if (entityType === 'team' && activeTeam) {
      const sliceA = sliceGamesByRange(activeTeam.games, rangeA);
      const sliceB = sliceGamesByRange(activeTeam.games, rangeB);
      const { rows, insights } = compareTeamSlices(sliceA, sliceB);
      const plainInsights = computePlainComparisonInsights('team', rows);
      return {
        name: activeTeam.name,
        subtitle: `Conf. ${activeTeam.conference} · Balance ${activeTeam.wins}-${activeTeam.losses}`,
        id: activeTeam.id,
        countA: sliceA.length,
        countB: sliceB.length,
        spanA:
          sliceA.length > 0
            ? `${formatShortDate(sliceA[sliceA.length - 1].date)} – ${formatShortDate(sliceA[0].date)}`
            : 'Sin partidos',
        spanB:
          sliceB.length > 0
            ? `${formatShortDate(sliceB[sliceB.length - 1].date)} – ${formatShortDate(sliceB[0].date)}`
            : 'Sin partidos',
        rows,
        insights,
        plainInsights,
      };
    }

    return null;
  }, [entityType, activePlayer, activeTeam, rangeA, rangeB]);

  const getRowBenchmark = (key: string): MetricBenchmark | undefined => {
    if (entityType === 'player') {
      switch (key) {
        case 'min':
          return benchmarks.player.min;
        case 'pts':
          return benchmarks.player.pts;
        case 'reb':
          return benchmarks.player.reb;
        case 'oreb':
          return benchmarks.player.oreb;
        case 'ast':
          return benchmarks.player.ast;
        case 'stocks':
          return benchmarks.player.stocks;
        case 'usgEst':
          return benchmarks.player.usgPct;
        case 'tsPct':
          return benchmarks.player.tsPct;
        case 'efgPct':
          return benchmarks.player.efgPct;
        case 'gmSc':
          return benchmarks.player.gmSc;
        default:
          return undefined;
      }
    }
    switch (key) {
      case 'pf':
        return benchmarks.team.avgPointsFor;
      case 'pa':
        return benchmarks.team.avgPointsAgainst;
      case 'diff':
        return benchmarks.team.differential;
      case 'offRtg':
        return benchmarks.team.offRtg;
      case 'defRtg':
        return benchmarks.team.defRtg;
      case 'netRtg':
        return benchmarks.team.netRtg;
      case 'pace':
        return benchmarks.team.pace;
      case 'efgPct':
        return benchmarks.team.efgPct;
      case 'tsPct':
        return benchmarks.team.tsPct;
      case 'orebPct':
        return benchmarks.team.orebPct;
      case 'tovPct':
        return benchmarks.team.tovPct;
      default:
        return undefined;
    }
  };

  const swapRanges = () => {
    setRangeA(rangeB);
    setRangeB(rangeA);
  };

  const activeTakeaways =
    experienceMode === 'simple'
      ? comparison?.plainInsights || []
      : comparison?.insights || [];

  return (
    <div className="space-y-5">
      {/* Row 1: Homogeneous 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <p className="text-xs text-slate-400 truncate">
            {experienceMode === 'simple' ? 'Jugador o equipo' : 'Sujeto comparado'}
          </p>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {comparison?.name || '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {comparison?.subtitle || 'Selecciona jugador o equipo'}
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Tramo A (Análisis)'
                : 'Muestra Tramo A'}
            </span>
            <MetricInfoTooltip helpKey="windowAvg" align="right" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-orange-400">
            {comparison?.countA ?? 0} PJ
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-slate-400 truncate">
            {comparison?.spanA}
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple'
                ? 'Tramo B (Referencia)'
                : 'Muestra Tramo B'}
            </span>
            <MetricInfoTooltip helpKey="baselineAvg" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-200">
            {comparison?.countB ?? 0} PJ
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-slate-400 truncate">
            {comparison?.spanB}
          </p>
        </div>
        <div className="p-3.5 sm:p-4 flex flex-col justify-between">
          <p className="text-xs text-slate-400 truncate">Ficha completa</p>
          <button
            type="button"
            disabled={!comparison}
            onClick={() =>
              comparison && onInspectEntity(entityType, comparison.id)
            }
            className="mt-2 px-2.5 sm:px-3 py-2 text-xs font-semibold bg-[#182338] hover:bg-[#1E293B] border border-[#283548] rounded-lg text-slate-100 transition-colors whitespace-nowrap text-center truncate"
          >
            Ver partido a partido
          </button>
        </div>
      </div>

      {/* Row 2: Homogeneous Searchable Selector & Range Configuration Bar */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-[#1E293B]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
            <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg self-start shrink-0">
              <button
                type="button"
                onClick={() => handleModeChange('player')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  entityType === 'player'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Comparar Jugador
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('team')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  entityType === 'team'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Comparar Equipo
              </button>
            </div>

            {/* Searchable Combobox Dropdown */}
            <div ref={pickerRef} className="relative w-full sm:max-w-sm">
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] focus:border-orange-500 rounded-lg text-slate-100 transition-colors"
              >
                <span className="truncate">
                  {entityType === 'player' && activePlayer
                    ? `${activePlayer.name} · ${activePlayer.teamAbbr} (${activePlayer.games.length} PJ)`
                    : entityType === 'team' && activeTeam
                    ? `${activeTeam.name} · ${activeTeam.abbreviation} (${activeTeam.wins}-${activeTeam.losses})`
                    : 'Seleccionar...'}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 right-0 mt-1.5 z-40 bg-[#0B1120] border border-[#283548] rounded-lg shadow-2xl overflow-hidden">
                  <div className="p-2 border-b border-[#1E293B] relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setDropdownOpen(false);
                        } else if (e.key === 'Enter') {
                          if (entityType === 'player' && filteredLocalPlayers[0]) {
                            setSelectedId(filteredLocalPlayers[0].id);
                            setDropdownOpen(false);
                          } else if (entityType === 'team' && filteredLocalTeams[0]) {
                            setSelectedId(filteredLocalTeams[0].id);
                            setDropdownOpen(false);
                          }
                        }
                      }}
                      placeholder={
                        entityType === 'player'
                          ? 'Escribe nombre o equipo (ej. Jokic, Aldama, BOS)...'
                          : 'Escribe nombre o abreviatura del equipo...'
                      }
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#131C2E] border border-[#1E293B] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-[#1E293B]/60">
                    {entityType === 'player' ? (
                      <>
                        {filteredLocalPlayers.map((p) => {
                          const isSelected = p.id === activePlayer?.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedId(p.id);
                                setDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                                isSelected
                                  ? 'bg-orange-500/15 text-orange-300 font-semibold'
                                  : 'text-slate-200 hover:bg-[#131C2E]'
                              }`}
                            >
                              <div className="truncate">
                                <span>{p.name}</span>
                                <span className="text-slate-400 ml-1.5">
                                  · {p.teamAbbr} · {p.position}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-mono text-[11px] text-slate-400">
                                  {p.games.length} PJ
                                </span>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-orange-400" />
                                )}
                              </div>
                            </button>
                          );
                        })}

                        {(searchingRemote || extraRemotePlayers.length > 0) && (
                          <div className="bg-[#0F172A]">
                            <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400 bg-[#131C2E]/70">
                              {searchingRemote
                                ? 'Buscando en toda la NBA...'
                                : 'Más jugadores en la NBA (pulsar para cargar):'}
                            </div>
                            {extraRemotePlayers.map((rp) => (
                              <button
                                key={rp.id}
                                type="button"
                                disabled={importingId === rp.id}
                                onClick={async () => {
                                  setImportingId(rp.id);
                                  try {
                                    const loaded = await onAddExternalPlayer(rp);
                                    if (loaded) {
                                      setSelectedId(loaded.id);
                                      setDropdownOpen(false);
                                    }
                                  } finally {
                                    setImportingId(null);
                                  }
                                }}
                                className="w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 text-slate-200 hover:bg-[#182338] transition-colors"
                              >
                                <span className="truncate">
                                  {rp.name}{' '}
                                  <span className="text-slate-400">
                                    · {rp.teamAbbr} · {rp.position}
                                  </span>
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] text-orange-400 shrink-0">
                                  <Plus className="w-3 h-3" />
                                  {importingId === rp.id ? 'Cargando...' : 'Cargar'}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        {filteredLocalPlayers.length === 0 &&
                          !searchingRemote &&
                          extraRemotePlayers.length === 0 && (
                            <div className="px-3 py-6 text-center text-xs text-slate-400">
                              Sin coincidencias para "{searchQuery}".
                            </div>
                          )}
                      </>
                    ) : (
                      <>
                        {filteredLocalTeams.map((t) => {
                          const isSelected = t.id === activeTeam?.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setSelectedId(t.id);
                                setDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                                isSelected
                                  ? 'bg-orange-500/15 text-orange-300 font-semibold'
                                  : 'text-slate-200 hover:bg-[#131C2E]'
                              }`}
                            >
                              <span className="truncate">
                                {t.name}{' '}
                                <span className="text-slate-400">
                                  · {t.abbreviation} · Conf. {t.conference}
                                </span>
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-mono text-[11px] text-slate-400">
                                  {t.wins}-{t.losses}
                                </span>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-orange-400" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                        {filteredLocalTeams.length === 0 && (
                          <div className="px-3 py-6 text-center text-xs text-slate-400">
                            Ningún equipo coincide con "{searchQuery}".
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={swapRanges}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] rounded-lg text-slate-200 transition-colors whitespace-nowrap shrink-0 self-start lg:self-auto"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-orange-400" />
            <span>Intercambiar Tramo A y Tramo B</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Tramo A */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-orange-400">
              {experienceMode === 'simple'
                ? '1. Elige el Tramo A (ej. sus últimos partidos o jugando en casa)'
                : 'Tramo A (Ventana de análisis)'}
            </label>
            <select
              value={rangeA.preset}
              onChange={(e) => {
                const preset = e.target.value as RangePreset;
                setRangeA({
                  preset,
                  startDate: rangeA.startDate || availableDates.mid,
                  endDate: rangeA.endDate || availableDates.max,
                });
              }}
              className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500"
            >
              {PRESET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {rangeA.preset === 'custom_dates' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="block text-[11px] text-slate-400 mb-1">Desde</span>
                  <input
                    type="date"
                    value={rangeA.startDate}
                    min={availableDates.min}
                    max={availableDates.max}
                    onChange={(e) =>
                      setRangeA((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <span className="block text-[11px] text-slate-400 mb-1">Hasta</span>
                  <input
                    type="date"
                    value={rangeA.endDate}
                    min={availableDates.min}
                    max={availableDates.max}
                    onChange={(e) =>
                      setRangeA((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tramo B */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              {experienceMode === 'simple'
                ? '2. Elige el Tramo B con el que comparar (ej. toda la temporada)'
                : 'Tramo B (Base de comparación)'}
            </label>
            <select
              value={rangeB.preset}
              onChange={(e) => {
                const preset = e.target.value as RangePreset;
                setRangeB({
                  preset,
                  startDate: rangeB.startDate || availableDates.min,
                  endDate: rangeB.endDate || availableDates.mid,
                });
              }}
              className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500"
            >
              {PRESET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {rangeB.preset === 'custom_dates' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="block text-[11px] text-slate-400 mb-1">Desde</span>
                  <input
                    type="date"
                    value={rangeB.startDate}
                    min={availableDates.min}
                    max={availableDates.max}
                    onChange={(e) =>
                      setRangeB((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <span className="block text-[11px] text-slate-400 mb-1">Hasta</span>
                  <input
                    type="date"
                    value={rangeB.endDate}
                    min={availableDates.min}
                    max={availableDates.max}
                    onChange={(e) =>
                      setRangeB((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Automated Takeaways */}
        {comparison && activeTakeaways.length > 0 && (
          <div className="pt-3 border-t border-[#1E293B]">
            <p className="text-xs font-semibold text-slate-200 mb-1.5">
              {experienceMode === 'simple'
                ? 'Resumen en claro de las diferencias entre ambos tramos:'
                : 'Conclusiones estadísticas del cruce:'}
            </p>
            <ul className="space-y-1 text-xs text-slate-300 leading-relaxed">
              {activeTakeaways.map((ins, idx) => (
                <li key={idx}>· {ins}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Row 3: Homogeneous Comparison Table with Basic / Advanced Layer Filter */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
        {comparison && comparison.rows.length > 0 && (
          <div className="px-4 py-3 border-b border-[#1E293B] bg-[#0F172A]/40 flex flex-wrap items-center justify-between gap-3">
            {experienceMode === 'simple' ? (
              <span className="text-xs text-slate-300">
                Mostrando estadísticas fáciles de leer con referencia frente a la{' '}
                <strong className="text-slate-100">Media de la NBA</strong>.
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                Capas estadísticas comparadas:{' '}
                <strong className="text-slate-200 font-mono tabular-nums">
                  {comparison.rows.length}
                </strong>{' '}
                métricas ({comparison.rows.filter((r) => r.group === 'basic').length} básicas ·{' '}
                {comparison.rows.filter((r) => r.group === 'advanced').length} avanzadas y 4 factores)
              </span>
            )}

            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
                {(
                  [
                    {
                      id: 'basic',
                      label:
                        experienceMode === 'simple'
                          ? `Esenciales (${comparison.rows.filter((r) => r.group === 'basic').length})`
                          : `1. Básicas (${comparison.rows.filter((r) => r.group === 'basic').length})`,
                    },
                    {
                      id: 'advanced',
                      label:
                        experienceMode === 'simple'
                          ? `Avanzadas (${comparison.rows.filter((r) => r.group === 'advanced').length})`
                          : `2. Avanzadas y 4 Factores (${comparison.rows.filter((r) => r.group === 'advanced').length})`,
                    },
                    { id: 'all', label: `Todas (${comparison.rows.length})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMetricLayer(tab.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      metricLayer === tab.id
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {experienceMode === 'simple' && (
                <button
                  type="button"
                  onClick={onSwitchToAdvanced}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] rounded-lg text-orange-400 transition-colors whitespace-nowrap shrink-0"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Pasar a Modo Avanzado</span>
                </button>
              )}
            </div>
          </div>
        )}

        {!comparison || comparison.countA === 0 || comparison.countB === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-200">
              Uno de los tramos seleccionados no contiene partidos jugados ({comparison?.countA ?? 0} PJ vs {comparison?.countB ?? 0} PJ).
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Amplía las fechas seleccionadas o cambia la muestra temporal arriba a Continuo o 2025-26 Completa para contar con mayor histórico.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Head-to-Head Comparison Cards (< md) */}
            <div className="md:hidden divide-y divide-[#1E293B]">
              {comparison.rows
                .filter((r) => metricLayer === 'all' || r.group === metricLayer)
                .map((r) => {
                  const isGood = r.inverseGood ? r.absDiff <= 0 : r.absDiff >= 0;
                  const barWidth = Math.min(100, Math.abs(r.pctDiff) * 2.2);
                  const significant =
                    Math.abs(r.pctDiff) >= 8 || Math.abs(r.absDiff) >= 2.5;
                  const bench = getRowBenchmark(r.key);
                  const evalLeague = bench
                    ? evaluateVsLeague(r.rangeAValue, bench)
                    : null;

                  return (
                    <div key={r.key} className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="inline-flex items-center gap-1.5 font-medium text-sm text-slate-100">
                            <span className="truncate">
                              {experienceMode === 'simple'
                                ? SIMPLE_ROW_LABELS[r.key] || r.label
                                : r.label}
                            </span>
                            <MetricInfoTooltip
                              helpKey={r.key}
                              fallbackTitle={r.label}
                              align="left"
                            />
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {evalLeague ? (
                              <>
                                <span className={evalLeague.textClass}>
                                  {evalLeague.tierLabel}
                                </span>
                                <span> · Media NBA {evalLeague.avgFormatted}</span>
                              </>
                            ) : r.group === 'advanced' ? (
                              'Avanzada / Eficiencia'
                            ) : (
                              'Estadística básica'
                            )}
                          </div>
                        </div>

                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div
                            className={`text-xs font-semibold ${
                              Math.abs(r.pctDiff) < 0.5
                                ? 'text-slate-400'
                                : isGood
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {r.absDiff > 0.05 ? '▲ ' : r.absDiff < -0.05 ? '▼ ' : ''}
                            {formatSigned(r.pctDiff, 1, '%')}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {formatSigned(r.absDiff, 1, r.unit === '%' ? ' pp' : '')}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-3 py-2 text-xs">
                        <div>
                          <span className="text-[11px] text-slate-400">
                            Tramo A ({comparison.countA} PJ)
                          </span>
                          <div className="font-mono tabular-nums font-semibold text-sm text-orange-300 mt-0.5">
                            {r.rangeAValue.toFixed(1)}
                            {r.unit === '%' ? '%' : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] text-slate-400">
                            Tramo B ({comparison.countB} PJ)
                          </span>
                          <div className="font-mono tabular-nums text-sm text-slate-200 mt-0.5">
                            {r.rangeBValue.toFixed(1)}
                            {r.unit === '%' ? '%' : ''}
                          </div>
                        </div>
                      </div>

                      <div className="h-1.5 w-full bg-[#0B1120] rounded overflow-hidden">
                        <div
                          className={`h-full rounded transition-transform ${
                            !significant
                              ? 'bg-slate-600'
                              : isGood
                              ? 'bg-emerald-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.max(4, barWidth)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Desktop Full Comparison Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                  <th className="py-3 pl-4 pr-3 font-medium">
                    <ColumnHelpHeader
                      label="Apartado estadístico"
                      align="left"
                      customHelp={{
                        title: 'Qué estamos comparando',
                        simpleDesc:
                          'Cada fila enfrenta el promedio del jugador o equipo en el Tramo A frente al Tramo B y muestra su nivel frente a la media NBA.',
                        calculation:
                          'Pasa el ratón por el icono (i) a la derecha de cada métrica para ver su significado y fórmula exacta.',
                      }}
                    />
                  </th>
                  <th className="py-3 px-3 font-medium text-right">
                    <ColumnHelpHeader
                      label={`Tramo A (${comparison.countA} PJ)`}
                      customHelp={{
                        title: 'Promedio en el Tramo A',
                        simpleDesc:
                          'Sus números medios durante el primer periodo seleccionado arriba (color naranja).',
                        calculation:
                          'Suma o agregación ponderada de las hojas de partido dentro del filtro del Tramo A dividida por sus PJ.',
                      }}
                    />
                  </th>
                  <th className="py-3 px-3 font-medium text-right">
                    <ColumnHelpHeader
                      label={`Tramo B (${comparison.countB} PJ)`}
                      customHelp={{
                        title: 'Promedio en el Tramo B',
                        simpleDesc:
                          'Sus números medios durante el periodo de referencia con el que comparas.',
                        calculation:
                          'Suma o agregación ponderada de las hojas de partido dentro del filtro del Tramo B dividida por sus PJ.',
                      }}
                    />
                  </th>
                  <th className="py-3 px-3 font-medium text-right">
                    <ColumnHelpHeader
                      label="Diferencia"
                      helpKey="absDiff"
                    />
                  </th>
                  <th className="py-3 px-3 font-medium text-right">
                    <ColumnHelpHeader
                      label={experienceMode === 'simple' ? 'Cambio %' : 'Variación %'}
                      helpKey="pctDelta"
                    />
                  </th>
                  <th className="py-3 pl-3 pr-4 font-medium w-56">
                    <ColumnHelpHeader
                      label="Impacto del cambio"
                      align="left"
                      customHelp={{
                        title: 'Tamaño visual del cambio',
                        simpleDesc:
                          'Cuanto más larga es la barra verde o roja, mayor es el salto entre el Tramo A y el Tramo B.',
                        calculation:
                          'Longitud proporcional a |Variación %| × 2.2 (acotada al 100%); verde si mejora y rojo si empeora.',
                      }}
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-sm">
                {comparison.rows
                  .filter((r) => metricLayer === 'all' || r.group === metricLayer)
                  .map((r) => {
                    const isGood = r.inverseGood ? r.absDiff <= 0 : r.absDiff >= 0;
                    const barWidth = Math.min(100, Math.abs(r.pctDiff) * 2.2);
                    const significant =
                      Math.abs(r.pctDiff) >= 8 || Math.abs(r.absDiff) >= 2.5;
                    const bench = getRowBenchmark(r.key);
                    const evalLeague = bench
                      ? evaluateVsLeague(r.rangeAValue, bench)
                      : null;

                    return (
                      <tr key={r.key} className="hover:bg-[#182338] transition-colors">
                        <td className="py-2.5 pl-4 pr-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 font-medium text-slate-100">
                            <span>
                              {experienceMode === 'simple'
                                ? SIMPLE_ROW_LABELS[r.key] || r.label
                                : r.label}
                            </span>
                            <MetricInfoTooltip
                              helpKey={r.key}
                              fallbackTitle={r.label}
                              align="left"
                            />
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {evalLeague ? (
                              <>
                                <span className={evalLeague.textClass}>
                                  {evalLeague.tierLabel}
                                </span>
                                <span> · Media NBA {evalLeague.avgFormatted}</span>
                              </>
                            ) : r.group === 'advanced' ? (
                              'Avanzada / Eficiencia'
                            ) : (
                              'Estadística básica'
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-orange-300 whitespace-nowrap">
                          {r.rangeAValue.toFixed(1)}
                          {r.unit === '%' ? '%' : ''}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {r.rangeBValue.toFixed(1)}
                          {r.unit === '%' ? '%' : ''}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={
                              Math.abs(r.absDiff) < 0.1
                                ? 'text-slate-400'
                                : isGood
                                ? 'text-emerald-400 font-medium'
                                : 'text-rose-400 font-medium'
                            }
                          >
                            {formatSigned(r.absDiff, 1, r.unit === '%' ? ' pp' : '')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={
                              Math.abs(r.pctDiff) < 0.5
                                ? 'text-slate-400'
                                : isGood
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }
                          >
                            {r.absDiff > 0.05 ? '▲ ' : r.absDiff < -0.05 ? '▼ ' : ''}
                            {formatSigned(r.pctDiff, 1, '%')}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 pr-4">
                          <div className="h-2 w-full bg-[#0B1120] rounded overflow-hidden">
                            <div
                              className={`h-full rounded transition-transform ${
                                !significant
                                  ? 'bg-slate-600'
                                  : isGood
                                  ? 'bg-emerald-500'
                                  : 'bg-rose-500'
                              }`}
                              style={{ width: `${Math.max(4, barWidth)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
