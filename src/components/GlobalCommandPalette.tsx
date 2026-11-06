import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  Award,
  BookOpen,
  CalendarDays,
  Compass,
  CornerDownLeft,
  Flame,
  Loader2,
  Lock,
  Search,
  Shield,
  Sliders,
  Star,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import type {
  ActiveSection,
  AwardCategoryId,
  ExperienceMode,
  PlayerSummary,
  SearchPlayerResult,
  TeamSummary,
} from '../types/nba';
import { mean, normalizeSearchText, round1 } from '../utils/analytics';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';

interface GlobalCommandPaletteProps {
  open: boolean;
  onClose: () => void;
  players: PlayerSummary[];
  teams: TeamSummary[];
  watchlistIds: Set<string>;
  activeSection: ActiveSection;
  experienceMode: ExperienceMode;
  onNavigateSection: (section: ActiveSection) => void;
  onNavigateAward: (category: AwardCategoryId) => void;
  onToggleExperienceMode: () => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onOpenInComparator: (entityType: 'player' | 'team', entityId: string) => void;
  onOpenInDuel: (playerAId: string, playerBId?: string) => void;
  onImportExternalPlayer: (
    item: SearchPlayerResult
  ) => Promise<PlayerSummary | null>;
}

interface CandidatePlayerRef {
  id: string;
  name: string;
  teamAbbr: string;
  position: string;
  ptsAvg: number | null;
  rebAvg: number | null;
  astAvg: number | null;
  isExternal: boolean;
  rawExternal?: SearchPlayerResult;
}

type PaletteEntry =
  | {
      key: string;
      kind: 'vs_duel';
      playerA: CandidatePlayerRef;
      playerB: CandidatePlayerRef;
    }
  | {
      key: string;
      kind: 'section';
      sectionId: ActiveSection;
      label: string;
      subtitle: string;
      keywords: string;
      icon: typeof Compass;
    }
  | {
      key: string;
      kind: 'award';
      awardId: AwardCategoryId;
      label: string;
      subtitle: string;
      keywords: string;
    }
  | {
      key: string;
      kind: 'action_mode';
      label: string;
      subtitle: string;
      keywords: string;
    }
  | {
      key: string;
      kind: 'team';
      team: TeamSummary;
      watched: boolean;
    }
  | {
      key: string;
      kind: 'player';
      player: CandidatePlayerRef;
      watched: boolean;
    };

const SECTION_COMMANDS: Array<{
  sectionId: ActiveSection;
  label: string;
  subtitle: string;
  keywords: string;
  icon: typeof Compass;
}> = [
  {
    sectionId: 'home',
    label: 'Resumen del Día',
    subtitle: 'Portada con explosiones positivas, bajones y rupturas de hoy',
    keywords: 'inicio home portada protagonistas resumen hoy',
    icon: Compass,
  },
  {
    sectionId: 'gameday',
    label: 'Analizador de Jornadas',
    subtitle: 'Marcadores NBA, quinteto ideal de la noche e informe de partido',
    keywords: 'partidos jornada calendario resultados marcadores anoche scouting',
    icon: CalendarDays,
  },
  {
    sectionId: 'anomalies',
    label: 'Radar de Anomalías',
    subtitle: 'Rupturas de tiro exterior, minutos/uso y desviaciones Z-Score',
    keywords: 'anomalias rupturas tendencias zscore explosiones bajones',
    icon: Activity,
  },
  {
    sectionId: 'streaks',
    label: 'Rachas y Consistencia',
    subtitle: 'Buscador a medida en 38 métricas, parlays e historial 2 temporadas',
    keywords: 'rachas seguidas consistencia regularidad parlay grafico historial',
    icon: Flame,
  },
  {
    sectionId: 'duel',
    label: 'Duelo Directo 1v1',
    subtitle: 'Batalla cara a cara entre 2 jugadores con radar superpuesto de 6 ejes',
    keywords: 'duelo 1v1 batalla versus comparar jugadores cara a cara',
    icon: Swords,
  },
  {
    sectionId: 'comparator',
    label: 'Comparador de Tramos',
    subtitle: 'Enfrenta últimos 5/10 PJ, local/visitante, B2B o fechas a medida',
    keywords: 'comparador tramos ventanas fechas casa visitante b2b',
    icon: ArrowLeftRight,
  },
  {
    sectionId: 'awards',
    label: 'Premios de Temporada',
    subtitle: 'Carrera en vivo por el MVP, ROY, DPOY, MIP, 6MOY, Clutch y All-NBA',
    keywords: 'premios mvp roy dpoy mip 6moy clutch hustle quintetos all nba',
    icon: Award,
  },
  {
    sectionId: 'milestones',
    label: 'Hitos de Temporada',
    subtitle: 'Récords en un partido, dobles-dobles, triples-dobles y líderes',
    keywords: 'hitos records lideres triples dobles anotacion topes',
    icon: Trophy,
  },
  {
    sectionId: 'teams',
    label: 'Equipos NBA',
    subtitle: 'Las 30 franquicias con OffRtg, DefRtg, NetRtg, Pace y 4 Factores',
    keywords: 'equipos franquicias clasificacion conferencias ratings',
    icon: Shield,
  },
  {
    sectionId: 'players',
    label: 'Jugadores NBA',
    subtitle: 'Explorador completo con estadísticas básicas, impacto PIE y Hustle',
    keywords: 'jugadores estadisticas puntos rebotes asistencias censo',
    icon: Users,
  },
  {
    sectionId: 'glossary',
    label: 'Glosario y Guía',
    subtitle: 'Explicación clara de TS%, eFG%, USG%, NetRtg, PIE y Game Score',
    keywords: 'glosario ayuda guia formulas definiciones diccionario',
    icon: BookOpen,
  },
  {
    sectionId: 'fantasy_espn',
    label: 'Zona Privada · Asistente Fantasy',
    subtitle: 'Alineación semanal, mercado de waivers, analizador de traspasos y seguridad',
    keywords: 'admin fantasy espn traspasos trades waivers plantilla privada',
    icon: Lock,
  },
];

const AWARD_SHORTCUTS: Array<{
  awardId: AwardCategoryId;
  label: string;
  subtitle: string;
  keywords: string;
}> = [
  {
    awardId: 'mvp',
    label: 'Carrera por el MVP',
    subtitle: 'Premios de Temporada · Candidatos al Jugador Más Valioso',
    keywords: 'mvp most valuable player premio',
  },
  {
    awardId: 'roy',
    label: 'Carrera por el Rookie del Año (ROY)',
    subtitle: 'Premios de Temporada · Mejores novatos NBA',
    keywords: 'roy rookie novato año',
  },
  {
    awardId: 'dpoy',
    label: 'Carrera por el Defensor del Año (DPOY)',
    subtitle: 'Premios de Temporada · Impacto defensivo, robos y tapones',
    keywords: 'dpoy defensor año defensa',
  },
  {
    awardId: 'all_nba',
    label: 'Quintetos Ideales All-NBA (1º, 2º y 3º)',
    subtitle: 'Premios de Temporada · Corte proyectado de 65 partidos',
    keywords: 'all nba quintetos ideales equipos',
  },
];

function scorePlayerMatch(p: CandidatePlayerRef, normQuery: string): number {
  if (!normQuery) return 0;
  const normName = normalizeSearchText(p.name);
  const normTeam = normalizeSearchText(p.teamAbbr);
  if (normName === normQuery) return 120;
  if (normName.startsWith(normQuery)) return 95;
  const parts = normName.split(/\s+/);
  if (parts.some((part) => part === normQuery)) return 90;
  if (parts.some((part) => part.startsWith(normQuery))) return 80;
  if (normName.includes(normQuery)) return 65;
  if (normTeam === normQuery) return 55;
  return 0;
}

export function GlobalCommandPalette({
  open,
  onClose,
  players,
  teams,
  watchlistIds,
  activeSection,
  experienceMode,
  onNavigateSection,
  onNavigateAward,
  onToggleExperienceMode,
  onInspectEntity,
  onOpenInComparator,
  onOpenInDuel,
  onImportExternalPlayer,
}: GlobalCommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [duelFighterA, setDuelFighterA] = useState<CandidatePlayerRef | null>(
    null
  );
  const [remotePlayers, setRemotePlayers] = useState<SearchPlayerResult[]>([]);
  const [remotePairCandidates, setRemotePairCandidates] = useState<
    SearchPlayerResult[]
  >([]);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setDuelFighterA(null);
      setRemotePlayers([]);
      setRemotePairCandidates([]);
      setBusyKey(null);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 15);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  // Parse "Player A vs Player B" syntax
  const vsSplit = useMemo(() => {
    if (duelFighterA) return null;
    const match = query.match(/^(.+?)\s+(?:vs\.?|contra|v)\s+(.+)$/i);
    if (!match) return null;
    const left = match[1].trim();
    const right = match[2].trim();
    if (!left || !right) return null;
    return { left, right };
  }, [query, duelFighterA]);

  // Remote NBA directory search for standard query or "A vs B" query
  useEffect(() => {
    if (!open) return;

    if (vsSplit) {
      if (vsSplit.left.length < 2 && vsSplit.right.length < 2) {
        setRemotePairCandidates([]);
        return;
      }
      const ctrl = new AbortController();
      const timer = window.setTimeout(async () => {
        setSearchingRemote(true);
        try {
          const [resA, resB] = await Promise.all([
            vsSplit.left.length >= 2
              ? fetch(`/api/nba/search?q=${encodeURIComponent(vsSplit.left)}`, {
                  signal: ctrl.signal,
                })
              : Promise.resolve(null),
            vsSplit.right.length >= 2
              ? fetch(`/api/nba/search?q=${encodeURIComponent(vsSplit.right)}`, {
                  signal: ctrl.signal,
                })
              : Promise.resolve(null),
          ]);
          const jsonA = resA && resA.ok ? await resA.json() : { results: [] };
          const jsonB = resB && resB.ok ? await resB.json() : { results: [] };
          const mergedMap = new Map<string, SearchPlayerResult>();
          for (const item of [
            ...(jsonA.results || []),
            ...(jsonB.results || []),
          ]) {
            mergedMap.set(item.id, item);
          }
          setRemotePairCandidates(Array.from(mergedMap.values()));
        } catch {
          // Ignore aborted/transient network errors
        } finally {
          if (!ctrl.signal.aborted) setSearchingRemote(false);
        }
      }, 190);

      return () => {
        ctrl.abort();
        window.clearTimeout(timer);
      };
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemotePlayers([]);
      setSearchingRemote(false);
      return;
    }

    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingRemote(true);
      try {
        const res = await fetch(
          `/api/nba/search?q=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal }
        );
        if (res.ok) {
          const json = await res.json();
          setRemotePlayers(json.results || []);
        }
      } catch {
        // Ignore aborted or transient search errors
      } finally {
        if (!ctrl.signal.aborted) setSearchingRemote(false);
      }
    }, 190);

    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, vsSplit]);

  const localCandidates = useMemo<CandidatePlayerRef[]>(() => {
    return players.map((p) => {
      const games = p.games;
      const ptsAvg =
        games.length > 0 ? round1(mean(games.map((g) => g.points))) : null;
      const rebAvg =
        games.length > 0 ? round1(mean(games.map((g) => g.rebounds))) : null;
      const astAvg =
        games.length > 0 ? round1(mean(games.map((g) => g.assists))) : null;
      return {
        id: p.id,
        name: p.name,
        teamAbbr: p.teamAbbr,
        position: p.position || '—',
        ptsAvg,
        rebAvg,
        astAvg,
        isExternal: false,
      };
    });
  }, [players]);

  const allCandidatePool = useMemo<CandidatePlayerRef[]>(() => {
    const seen = new Set(localCandidates.map((p) => p.id));
    const extras: CandidatePlayerRef[] = [];
    for (const r of [...remotePlayers, ...remotePairCandidates]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      extras.push({
        id: r.id,
        name: r.name,
        teamAbbr: r.teamAbbr,
        position: r.position || '—',
        ptsAvg: null,
        rebAvg: null,
        astAvg: null,
        isExternal: true,
        rawExternal: r,
      });
    }
    return [...localCandidates, ...extras];
  }, [localCandidates, remotePlayers, remotePairCandidates]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const normQ = normalizeSearchText(query.trim());
    const result: PaletteEntry[] = [];

    // 1. Pinned Fighter 1 Mode: user is picking Rival B for a 1v1 Duel!
    if (duelFighterA) {
      const candidates = allCandidatePool
        .filter((c) => c.id !== duelFighterA.id)
        .map((c) => ({
          c,
          watched: watchlistIds.has(`player:${c.id}`),
          score: normQ
            ? scorePlayerMatch(c, normQ)
            : (watchlistIds.has(`player:${c.id}`) ? 50 : 0) + (c.ptsAvg || 0),
        }))
        .filter((x) => !normQ || x.score > 0)
        .sort((a, b) => b.score - a.score || (b.c.ptsAvg || 0) - (a.c.ptsAvg || 0))
        .slice(0, 14);

      for (const item of candidates) {
        result.push({
          key: `vs-pick:${duelFighterA.id}:${item.c.id}`,
          kind: 'vs_duel',
          playerA: duelFighterA,
          playerB: item.c,
        });
      }
      return result;
    }

    // 2. Direct "A vs B" syntax resolution
    if (vsSplit) {
      const normLeft = normalizeSearchText(vsSplit.left);
      const normRight = normalizeSearchText(vsSplit.right);
      const bestLeft = [...allCandidatePool]
        .map((c) => ({ c, s: scorePlayerMatch(c, normLeft) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || (b.c.ptsAvg || 0) - (a.c.ptsAvg || 0))[0]?.c;

      const bestRight = [...allCandidatePool]
        .filter((c) => c.id !== bestLeft?.id)
        .map((c) => ({ c, s: scorePlayerMatch(c, normRight) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || (b.c.ptsAvg || 0) - (a.c.ptsAvg || 0))[0]?.c;

      if (bestLeft && bestRight) {
        result.push({
          key: `vs:${bestLeft.id}:${bestRight.id}`,
          kind: 'vs_duel',
          playerA: bestLeft,
          playerB: bestRight,
        });
      }
    }

    // 3. Empty query: show Starred Watchlist + Featured Players + Quick Sections
    if (!normQ) {
      const watchedPlayers = localCandidates
        .filter((p) => watchlistIds.has(`player:${p.id}`))
        .slice(0, 5);
      const topScorers = [...localCandidates]
        .filter((p) => !watchlistIds.has(`player:${p.id}`))
        .sort((a, b) => (b.ptsAvg || 0) - (a.ptsAvg || 0))
        .slice(0, Math.max(0, 5 - watchedPlayers.length));

      for (const p of [...watchedPlayers, ...topScorers]) {
        result.push({
          key: `player:${p.id}`,
          kind: 'player',
          player: p,
          watched: watchlistIds.has(`player:${p.id}`),
        });
      }

      const watchedTeams = teams
        .filter((t) => watchlistIds.has(`team:${t.id}`))
        .slice(0, 3);
      for (const t of watchedTeams) {
        result.push({
          key: `team:${t.id}`,
          kind: 'team',
          team: t,
          watched: true,
        });
      }

      for (const sec of SECTION_COMMANDS) {
        if (sec.sectionId === activeSection) continue;
        result.push({
          key: `section:${sec.sectionId}`,
          kind: 'section',
          ...sec,
        });
      }

      result.push({
        key: 'action:toggle-mode',
        kind: 'action_mode',
        label:
          experienceMode === 'simple'
            ? 'Cambiar a Nivel de Detalle Avanzado'
            : 'Cambiar a Nivel de Detalle Sencillo',
        subtitle:
          experienceMode === 'simple'
            ? 'Activa Z-Scores, OffRtg/DefRtg, PIE, eFG% y métricas Hustle'
            : 'Activa explicaciones humanas directas y lectura simplificada',
        keywords: 'modo sencillo avanzado nivel detalle',
      });

      return result;
    }

    // 4. Filtered Query across Players, Teams, Sections & Awards
    const matchingPlayers = allCandidatePool
      .map((p) => ({
        p,
        watched: watchlistIds.has(`player:${p.id}`),
        score: scorePlayerMatch(p, normQ),
      }))
      .filter((x) => x.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.watched) - Number(a.watched) ||
          Number(!b.p.isExternal) - Number(!a.p.isExternal) ||
          (b.p.ptsAvg || 0) - (a.p.ptsAvg || 0)
      )
      .slice(0, 10);

    for (const item of matchingPlayers) {
      result.push({
        key: `player:${item.p.id}`,
        kind: 'player',
        player: item.p,
        watched: item.watched,
      });
    }

    const matchingTeams = teams
      .filter((t) =>
        normalizeSearchText(
          `${t.name} ${t.abbreviation} ${t.conference}`
        ).includes(normQ)
      )
      .slice(0, 5);

    for (const t of matchingTeams) {
      result.push({
        key: `team:${t.id}`,
        kind: 'team',
        team: t,
        watched: watchlistIds.has(`team:${t.id}`),
      });
    }

    for (const sec of SECTION_COMMANDS) {
      if (
        normalizeSearchText(
          `${sec.label} ${sec.subtitle} ${sec.keywords}`
        ).includes(normQ)
      ) {
        result.push({
          key: `section:${sec.sectionId}`,
          kind: 'section',
          ...sec,
        });
      }
    }

    for (const aw of AWARD_SHORTCUTS) {
      if (
        normalizeSearchText(
          `${aw.label} ${aw.subtitle} ${aw.keywords}`
        ).includes(normQ)
      ) {
        result.push({
          key: `award:${aw.awardId}`,
          kind: 'award',
          ...aw,
        });
      }
    }

    if (
      normalizeSearchText(
        'modo sencillo avanzado cambiar nivel detalle metricas'
      ).includes(normQ)
    ) {
      result.push({
        key: 'action:toggle-mode',
        kind: 'action_mode',
        label:
          experienceMode === 'simple'
            ? 'Cambiar a Nivel de Detalle Avanzado'
            : 'Cambiar a Nivel de Detalle Sencillo',
        subtitle: 'Alterna la visualización global de estadísticas',
        keywords: 'modo sencillo avanzado',
      });
    }

    return result;
  }, [
    query,
    duelFighterA,
    vsSplit,
    allCandidatePool,
    localCandidates,
    teams,
    watchlistIds,
    activeSection,
    experienceMode,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, duelFighterA]);

  useEffect(() => {
    if (activeIndex >= entries.length && entries.length > 0) {
      setActiveIndex(entries.length - 1);
    }
  }, [activeIndex, entries.length]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-palette-idx="${activeIndex}"]`
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const ensurePlayerReady = async (
    p: CandidatePlayerRef
  ): Promise<string | null> => {
    if (!p.isExternal || !p.rawExternal) return p.id;
    const imported = await onImportExternalPlayer(p.rawExternal);
    return imported?.id || p.id;
  };

  const executeEntryPrimary = async (
    entry: PaletteEntry,
    modeOverride?: 'inspect' | 'duel' | 'comparator'
  ) => {
    if (busyKey) return;
    setBusyKey(entry.key);
    try {
      if (entry.kind === 'vs_duel') {
        const [idA, idB] = await Promise.all([
          ensurePlayerReady(entry.playerA),
          ensurePlayerReady(entry.playerB),
        ]);
        if (idA && idB) {
          onOpenInDuel(idA, idB);
          onClose();
        }
        return;
      }

      if (entry.kind === 'section') {
        onNavigateSection(entry.sectionId);
        onClose();
        return;
      }

      if (entry.kind === 'award') {
        onNavigateAward(entry.awardId);
        onClose();
        return;
      }

      if (entry.kind === 'action_mode') {
        onToggleExperienceMode();
        onClose();
        return;
      }

      if (entry.kind === 'team') {
        if (modeOverride === 'comparator') {
          onOpenInComparator('team', entry.team.id);
        } else {
          onInspectEntity('team', entry.team.id);
        }
        onClose();
        return;
      }

      if (entry.kind === 'player') {
        const resolvedId = await ensurePlayerReady(entry.player);
        if (!resolvedId) return;
        if (modeOverride === 'duel') {
          onOpenInDuel(resolvedId);
        } else if (modeOverride === 'comparator') {
          onOpenInComparator('player', resolvedId);
        } else {
          onInspectEntity('player', resolvedId);
        }
        onClose();
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (duelFighterA) {
        setDuelFighterA(null);
        setQuery('');
      } else {
        onClose();
      }
      return;
    }

    if (e.key === 'Backspace' && !query && duelFighterA) {
      e.preventDefault();
      setDuelFighterA(null);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (entries.length > 0) {
        setActiveIndex((prev) => (prev + 1) % entries.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (entries.length > 0) {
        setActiveIndex((prev) => (prev - 1 + entries.length) % entries.length);
      }
      return;
    }

    if (e.key === 'Enter' && entries[activeIndex]) {
      e.preventDefault();
      const target = entries[activeIndex];
      if (e.shiftKey && target.kind === 'player') {
        void executeEntryPrimary(target, 'duel');
      } else if (
        e.altKey &&
        (target.kind === 'player' || target.kind === 'team')
      ) {
        void executeEntryPrimary(target, 'comparator');
      } else {
        void executeEntryPrimary(target);
      }
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscador global rápido RadarNBA"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] sm:pt-[11vh] px-3 sm:px-4"
    >
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-2xl bg-[#0F172A] border border-[#283548] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        {/* Search Input Header */}
        <div className="px-3.5 sm:px-4 py-3 bg-[#0B1120] border-b border-[#1E293B] flex items-center gap-2.5">
          {searchingRemote || busyKey ? (
            <Loader2 className="w-4 h-4 text-orange-400 animate-spin shrink-0" />
          ) : duelFighterA ? (
            <Swords className="w-4 h-4 text-orange-400 shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-orange-400 shrink-0" />
          )}

          {duelFighterA && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-500/15 border border-orange-500/40 text-xs font-semibold text-orange-300 whitespace-nowrap shrink-0">
              <span>{duelFighterA.name}</span>
              <span className="text-orange-400/80 font-mono">vs</span>
              <button
                type="button"
                onClick={() => {
                  setDuelFighterA(null);
                  inputRef.current?.focus();
                }}
                aria-label="Quitar primer jugador del duelo"
                className="text-orange-300 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              duelFighterA
                ? `Escribe el rival para enfrentar a ${duelFighterA.name}...`
                : 'Jugador, equipo, apartado o duelo directo (ej. Jokic vs Doncic)...'
            }
            className="flex-1 min-w-0 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className="p-1 text-slate-400 hover:text-white rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-[11px] font-mono text-slate-400 hover:text-white bg-[#131C2E] border border-[#1E293B] rounded-md shrink-0"
          >
            Esc
          </button>
        </div>

        {/* Context Helper Strip for Direct 1v1 Duels */}
        {!duelFighterA && !vsSplit && query.trim().length === 0 && (
          <div className="px-4 py-2 bg-[#131C2E]/70 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              Consejo: escribe{' '}
              <strong className="font-mono text-orange-300">
                Jokic vs Doncic
              </strong>{' '}
              para abrir un Duelo 1v1 al instante.
            </span>
            <span className="hidden sm:inline font-mono text-slate-500">
              Censo oficial NBA activo
            </span>
          </div>
        )}

        {/* Results List */}
        <div
          ref={listRef}
          className="overflow-y-auto divide-y divide-[#1E293B]/60 max-h-[60vh]"
        >
          {entries.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-200">
                {searchingRemote
                  ? 'Consultando directorio oficial NBA.com...'
                  : `Sin coincidencias para "${query}"`}
              </p>
              <p className="text-xs text-slate-400">
                Prueba por apellido, abreviatura de franquicia (BOS, LAL, DEN) o nombre de apartado.
              </p>
            </div>
          ) : (
            entries.map((entry, idx) => {
              const isSelected = idx === activeIndex;
              const isBusy = busyKey === entry.key;

              if (entry.kind === 'vs_duel') {
                return (
                  <div
                    key={entry.key}
                    data-palette-idx={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => void executeEntryPrimary(entry)}
                    className={`px-4 py-3 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#182338] border-l-2 border-l-orange-500'
                        : 'bg-[#131C2E]/50 hover:bg-[#182338]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/40 flex items-center justify-center shrink-0">
                        <Swords className="w-4 h-4 text-orange-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-100">
                          <span className="text-orange-300">
                            {entry.playerA.name}
                          </span>
                          <span className="font-mono text-xs text-slate-500">
                            vs
                          </span>
                          <span className="text-sky-300">
                            {entry.playerB.name}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono truncate">
                          Abrir Duelo Directo 1v1 ({entry.playerA.teamAbbr} vs{' '}
                          {entry.playerB.teamAbbr})
                        </div>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-orange-500 text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0">
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CornerDownLeft className="w-3.5 h-3.5" />
                      )}
                      <span>Iniciar Duelo</span>
                    </span>
                  </div>
                );
              }

              if (entry.kind === 'player') {
                const p = entry.player;
                return (
                  <div
                    key={entry.key}
                    data-palette-idx={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => void executeEntryPrimary(entry, 'inspect')}
                    className={`px-3.5 sm:px-4 py-2.5 cursor-pointer transition-colors flex items-center justify-between gap-2.5 ${
                      isSelected ? 'bg-[#182338]' : 'hover:bg-[#131C2E]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar
                        playerId={p.id}
                        name={p.name}
                        teamAbbr={p.teamAbbr}
                        showTeamBadge
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-100 truncate">
                            {p.name}
                          </span>
                          {entry.watched && (
                            <Star className="w-3.5 h-3.5 fill-orange-400 text-orange-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono tabular-nums truncate">
                          {p.teamAbbr} · {p.position}
                          {p.ptsAvg !== null
                            ? ` · ${p.ptsAvg.toFixed(1)} PTS · ${(
                                p.rebAvg ?? 0
                              ).toFixed(1)} REB · ${(p.astAvg ?? 0).toFixed(
                                1
                              )} AST`
                            : ' · Directorio oficial NBA.com'}
                        </div>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title={`Elegir rival para enfrentar a ${p.name} en Duelo 1v1`}
                        onClick={() => {
                          setDuelFighterA(p);
                          setQuery('');
                          inputRef.current?.focus();
                        }}
                        className="px-2 py-1 text-[11px] font-medium rounded-md bg-[#0B1120] hover:bg-[#1E293B] border border-[#1E293B] hover:border-orange-500/50 text-orange-300 transition-colors whitespace-nowrap"
                      >
                        <span className="inline-flex items-center gap-1">
                          <Swords className="w-3 h-3" />
                          <span className="hidden sm:inline">Duelo vs…</span>
                          <span className="sm:hidden">1v1</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        title={`Comparar tramos de ${p.name}`}
                        onClick={() =>
                          void executeEntryPrimary(entry, 'comparator')
                        }
                        className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-[#0B1120] hover:bg-[#1E293B] border border-[#1E293B] text-slate-300 hover:text-white transition-colors whitespace-nowrap"
                      >
                        <ArrowLeftRight className="w-3 h-3 text-slate-400" />
                        <span>Tramos</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void executeEntryPrimary(entry, 'inspect')
                        }
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                          isSelected
                            ? 'bg-orange-500 text-slate-950'
                            : 'bg-[#131C2E] border border-[#1E293B] text-slate-200 hover:text-white'
                        }`}
                      >
                        {isBusy ? '...' : 'Ficha'}
                      </button>
                    </div>
                  </div>
                );
              }

              if (entry.kind === 'team') {
                const t = entry.team;
                return (
                  <div
                    key={entry.key}
                    data-palette-idx={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => void executeEntryPrimary(entry, 'inspect')}
                    className={`px-3.5 sm:px-4 py-2.5 cursor-pointer transition-colors flex items-center justify-between gap-2.5 ${
                      isSelected ? 'bg-[#182338]' : 'hover:bg-[#131C2E]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <TeamLogo abbr={t.abbreviation} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-100 truncate">
                            {t.name}
                          </span>
                          {entry.watched && (
                            <Star className="w-3.5 h-3.5 fill-orange-400 text-orange-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono tabular-nums truncate">
                          {t.abbreviation} · Conf. {t.conference} · Balance{' '}
                          {t.wins}-{t.losses}
                        </div>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          void executeEntryPrimary(entry, 'comparator')
                        }
                        className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-[#0B1120] hover:bg-[#1E293B] border border-[#1E293B] text-slate-300 hover:text-white transition-colors whitespace-nowrap"
                      >
                        <ArrowLeftRight className="w-3 h-3 text-slate-400" />
                        <span>Tramos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void executeEntryPrimary(entry, 'inspect')
                        }
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                          isSelected
                            ? 'bg-orange-500 text-slate-950'
                            : 'bg-[#131C2E] border border-[#1E293B] text-slate-200 hover:text-white'
                        }`}
                      >
                        Ficha
                      </button>
                    </div>
                  </div>
                );
              }

              if (entry.kind === 'section') {
                const Icon = entry.icon;
                return (
                  <div
                    key={entry.key}
                    data-palette-idx={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => void executeEntryPrimary(entry)}
                    className={`px-3.5 sm:px-4 py-2.5 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                      isSelected ? 'bg-[#182338]' : 'hover:bg-[#131C2E]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#0B1120] border border-[#1E293B] flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-orange-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">
                          {entry.label}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {entry.subtitle}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0">
                      Ir →
                    </span>
                  </div>
                );
              }

              if (entry.kind === 'award') {
                return (
                  <div
                    key={entry.key}
                    data-palette-idx={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => void executeEntryPrimary(entry)}
                    className={`px-3.5 sm:px-4 py-2.5 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                      isSelected ? 'bg-[#182338]' : 'hover:bg-[#131C2E]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#0B1120] border border-[#1E293B] flex items-center justify-center shrink-0">
                        <Award className="w-4 h-4 text-orange-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">
                          {entry.label}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {entry.subtitle}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-orange-400 whitespace-nowrap shrink-0">
                      Premios →
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={entry.key}
                  data-palette-idx={idx}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => void executeEntryPrimary(entry)}
                  className={`px-3.5 sm:px-4 py-2.5 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                    isSelected ? 'bg-[#182338]' : 'hover:bg-[#131C2E]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#0B1120] border border-[#1E293B] flex items-center justify-center shrink-0">
                      <Sliders className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">
                        {entry.label}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {entry.subtitle}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0">
                    Aplicar
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Keyboard Shortcuts Legend Footer */}
        <div className="px-4 py-2 bg-[#0B1120] border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
            <span>
              <strong className="text-slate-300">↑↓</strong> navegar
            </span>
            <span>
              <strong className="text-slate-300">↵</strong> abrir
            </span>
            <span className="hidden sm:inline">
              <strong className="text-slate-300">Shift+↵</strong> duelo 1v1
            </span>
            <span className="hidden md:inline">
              <strong className="text-slate-300">Alt+↵</strong> comparar tramos
            </span>
          </div>
          <span className="font-mono text-slate-400">Ctrl+K / ⌘K</span>
        </div>
      </div>
    </div>
  );
}
