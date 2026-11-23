import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  CalendarDays,
  Filter,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type {
  ExperienceMode,
  NbaHeroicShotEntry,
  NbaHeroicShotsResponse,
  NbaHeroicShotType,
  PlayerSummary,
  TeamSummary,
} from '../types/nba';
import {
  fetchSharedHeroicShots,
  translatePlayDescriptionEs,
} from '../utils/heroicShotsClient';
import { formatShortDate, normalizeSearchText } from '../utils/analytics';
import { MetricInfoTooltip, SortableTh } from './MetricUiHelpers';
import { STICKY_THEAD_CLASS, sortRows, useTableSort } from '../utils/tableSort';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import { buildTableSnapshotBlob } from '../utils/exportImageCard';

interface HeroicShotsViewProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleOnlyWatchlist: () => void;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onOpenGamedayDate?: (date: string) => void;
  refreshCounter?: number;
}

type HeroicTab = 'archive' | 'players' | 'teams' | 'history';
type ShotTypeFilter = 'all' | NbaHeroicShotType;
type ShotPointsFilter = 'all' | '3' | '2' | '1';
type SeasonFilter = 'all' | '2026-27' | '2025-26';

interface EnrichedHeroicShot extends NbaHeroicShotEntry {
  fullPlayerName: string;
  playerPosition: string;
  teamFullName: string;
  opponentTeamId: string | null;
  opponentFullName: string;
  pointsCategoryLabel: 'Triple (3P)' | 'Canasta 2P' | 'Tiro Libre';
  distanceFt: number | null;
  translatedDescription: string;
  watched: boolean;
}

interface PlayerHeroicLeaderboardRow {
  playerId: string;
  name: string;
  teamId: string;
  teamAbbr: string;
  position: string;
  buzzerBeaters: number;
  gameWinnersOnly: number;
  totalGameWinners: number;
  otTyingBuzzers: number;
  totalHeroic: number;
  maxDistanceFt: number;
  avgDistanceFt: number | null;
  threePointers: number;
  lastDate: string;
  lastSummary: string;
  watched: boolean;
}

interface TeamHeroicLeaderboardRow {
  teamId: string;
  teamAbbr: string;
  teamName: string;
  conference: string;
  buzzerBeatersFor: number;
  gameWinnersFor: number;
  otTyingFor: number;
  totalFor: number;
  shotsAgainst: number;
  buzzerAgainst: number;
  netBalance: number;
  lastForDate: string;
  watched: boolean;
}

const NBA_HISTORICAL_BENCHMARKS: Array<{
  rank: number;
  player: string;
  era: string;
  buzzerBeaters: string;
  milestoneNote: string;
}> = [
  {
    rank: 1,
    player: 'Michael Jordan',
    era: '1984–2003 (CHI / WAS)',
    buzzerBeaters: '9 BB',
    milestoneNote: 'Máximo histórico oficial NBA (incluye «The Shot» vs CLE 1989 y Utah 1997)',
  },
  {
    rank: 2,
    player: 'Joe Johnson',
    era: '2001–2022 (BKN / ATL / PHX)',
    buzzerBeaters: '8 BB',
    milestoneNote: 'Líder de la era moderna en temporada regular (7) + playoffs (1)',
  },
  {
    rank: 2,
    player: 'Kobe Bryant',
    era: '1996–2016 (LAL)',
    buzzerBeaters: '8 BB',
    milestoneNote: 'Empatado en el 2º puesto histórico; icónicos tiros ante PHX, MIA y SAC',
  },
  {
    rank: 2,
    player: 'LeBron James',
    era: '2003–Actualidad',
    buzzerBeaters: '8 BB',
    milestoneNote: 'Líder histórico absoluto en Buzzer Beaters de Playoffs (5 sobre la bocina)',
  },
  {
    rank: 5,
    player: 'Paul Pierce',
    era: '1998–2017 (BOS / WAS)',
    buzzerBeaters: '7 BB',
    milestoneNote: 'Especialista histórico en últimos segundos tanto en Boston como en Washington',
  },
  {
    rank: 6,
    player: 'Devonte’ Graham · Max Strus',
    era: 'Récords de Distancia (0.0s)',
    buzzerBeaters: '61 ft / 59 ft',
    milestoneNote: 'Los dos Buzzer Beaters ganadores más lejanos registrados desde medio campo en NBA',
  },
];

function getShotBadgeMeta(shotType: NbaHeroicShotType) {
  if (shotType === 'buzzer_beater') {
    return {
      shortLabel: 'BB 0.0s',
      label: 'Buzzer Beater (0.0s)',
      textCls: 'text-orange-300',
      surfaceCls: 'bg-orange-500/15 border-orange-500/40 text-orange-300',
    };
  }
  if (shotType === 'ot_tying_buzzer') {
    return {
      shortLabel: 'Empate OT',
      label: 'Empate Bocina (OT)',
      textCls: 'text-sky-300',
      surfaceCls: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
    };
  }
  return {
    shortLabel: 'GW ≤10s',
    label: 'Game Winner (≤10s)',
    textCls: 'text-emerald-300',
    surfaceCls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  };
}

function formatClockLabel(clockSeconds: number, rawClock: string): string {
  if (Number.isFinite(clockSeconds) && clockSeconds <= 0.15) return '0.0s';
  if (Number.isFinite(clockSeconds)) return `${clockSeconds.toFixed(1)}s`;
  return rawClock || '—';
}

function CourtDistanceMeter({
  distanceFt,
  points,
  shotType,
}: {
  distanceFt: number | null;
  points: number;
  shotType: NbaHeroicShotType;
}) {
  const cappedDist =
    distanceFt !== null && Number.isFinite(distanceFt)
      ? Math.max(0, Math.min(47, distanceFt))
      : null;
  const pct = cappedDist !== null ? (cappedDist / 47) * 100 : null;
  const threePtLinePct = (23.75 / 47) * 100;
  const dotColor =
    shotType === 'buzzer_beater'
      ? '#f97316'
      : shotType === 'ot_tying_buzzer'
      ? '#38bdf8'
      : '#10b981';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
        <span>Distancia relativa al aro</span>
        <span className="text-slate-200 font-semibold">
          {distanceFt !== null && distanceFt > 0
            ? `${distanceFt.toFixed(1)} ft (${(distanceFt * 0.3048).toFixed(1)} m)`
            : points === 1
            ? 'Tiro Libre (15.0 ft)'
            : 'Distancia no medida'}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-[#0B1120] border border-[#1E293B] overflow-hidden">
        {/* NBA 3-Point Arc Marker (23.75 ft) */}
        <div
          title="Línea de triple NBA (23.75 ft)"
          style={{ left: `${threePtLinePct}%` }}
          className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-amber-400/75 z-10"
        />
        {pct !== null ? (
          <>
            <div
              style={{
                width: `${pct}%`,
                backgroundColor: `${dotColor}30`,
              }}
              className="absolute inset-y-0 left-0 rounded-l-full"
            />
            <div
              style={{
                left: `calc(${pct}% - 5px)`,
                backgroundColor: dotColor,
              }}
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-[#0B1120] z-20"
            />
          </>
        ) : points === 1 ? (
          <div
            style={{
              left: `calc(${(15 / 47) * 100}% - 4px)`,
              backgroundColor: dotColor,
            }}
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-[#0B1120] z-20"
          />
        ) : null}
      </div>
      <div className="relative h-3.5 text-[9.5px] sm:text-[10px] font-mono tabular-nums text-slate-400">
        <span className="absolute left-0 top-0">Aro (0 ft)</span>
        <span
          style={{ left: `${threePtLinePct}%` }}
          className="absolute top-0 -translate-x-1/2 text-amber-300/90 font-medium whitespace-nowrap"
        >
          Triple (23.75 ft)
        </span>
        <span className="absolute right-0 top-0">
          <span className="sm:hidden">M. campo (47 ft)</span>
          <span className="hidden sm:inline">Medio campo (47 ft)</span>
        </span>
      </div>
    </div>
  );
}

function HeroicCourtSvgVisualizer({
  shot,
}: {
  shot: EnrichedHeroicShot;
}) {
  // Exact uniform-scale NBA half-court geometry (1 ft = 4.2 SVG units)
  // Regulation NBA half court: 47 ft long x 50 ft wide; Hoop center at (5.25 ft, 0) from baseline center
  const S = 4.2;
  const X0 = 29;
  const CY = 116;
  const X_HALF = X0 + 47 * S; // 226.4
  const Y_TOP = CY - 25 * S; // 11
  const Y_BOT = CY + 25 * S; // 221
  const X_BB = X0 + 4 * S; // 45.8 (backboard)
  const HX = X0 + 5.25 * S; // 51.05 (hoop center)
  const HY = CY; // 116
  const X_FT = X0 + 19 * S; // 108.8 (free throw line)
  const R_FT = 6 * S; // 25.2 (free throw / center circle radius)
  const R_RA = 4 * S; // 16.8 (restricted area arc)
  const R_3PT = 23.75 * S; // 99.75 (3PT arc centered on hoop!)
  const Y_3PT_TOP = CY - 22 * S; // 23.6 (corner 3 top)
  const Y_3PT_BOT = CY + 22 * S; // 208.4 (corner 3 bottom)
  // Where corner 3 (y = ±22 ft) meets 23.75 ft circle around (5.25 ft, 0): 5.25 + sqrt(23.75^2 - 22^2) = 14.1978 ft
  const X_3PT_BREAK = X0 + 14.1978 * S; // 88.63

  const rawDist =
    shot.distanceFt !== null && shot.distanceFt > 0
      ? Math.min(45.5, shot.distanceFt)
      : shot.points === 1
      ? 15
      : shot.points === 3
      ? 25.5
      : 9;

  let shotX = HX;
  let shotY = HY;

  if (shot.points === 1) {
    shotX = X_FT;
    shotY = HY;
  } else if (shot.points === 3) {
    if (rawDist < 23.75) {
      // Corner 3 pointer (22–23.7 ft): place cleanly behind the top corner 3-point line
      const cornerYFt = 22.8;
      const cornerXFt = Math.sqrt(Math.max(0, rawDist * rawDist - cornerYFt * cornerYFt));
      shotX = Math.max(X0 + 1.5 * S, HX + cornerXFt * S);
      shotY = HY - cornerYFt * S;
    } else {
      // Wing / top-of-key 3 pointer: exact radial distance from hoop center (HX, HY)
      const angle = -0.42; // -24 deg keeps even 45 ft heaves well inside sidelines
      shotX = Math.min(X_HALF - 4, HX + rawDist * S * Math.cos(angle));
      shotY = HY + rawDist * S * Math.sin(angle);
    }
  } else {
    // 2-point field goal strictly inside the 2PT perimeter
    const r2 = Math.min(22.4, rawDist);
    const angle = rawDist <= 4 ? -0.18 : -0.35;
    shotX = HX + r2 * S * Math.cos(angle);
    shotY = HY + r2 * S * Math.sin(angle);
  }

  const accent =
    shot.shotType === 'buzzer_beater'
      ? '#f97316'
      : shot.shotType === 'ot_tying_buzzer'
      ? '#38bdf8'
      : '#10b981';

  const labelX = Math.min(X_HALF - 20, Math.max(X0 + 24, shotX));
  const labelY = shotY < 42 ? shotY + 18 : shotY - 12;

  return (
    <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
        <span>POSICIÓN APROX. EN CANCHA NBA</span>
        <span className="text-slate-200 font-semibold">
          {shot.distanceFt !== null && shot.distanceFt > 0
            ? `${shot.distanceFt.toFixed(1)} ft (${(shot.distanceFt * 0.3048).toFixed(1)} m)`
            : shot.points === 1
            ? '15.0 ft · Personal'
            : shot.pointsCategoryLabel}
        </span>
      </div>
      <svg
        viewBox="0 0 256 232"
        className="w-full h-44 rounded-md bg-[#0F172A] border border-[#1E293B]"
        role="img"
        aria-label={`Diagrama a escala de media cancha NBA del tiro de ${shot.fullPlayerName}`}
      >
        {/* Half-Court Perimeter (47 ft x 50 ft) */}
        <rect
          x={X0}
          y={Y_TOP}
          width={47 * S}
          height={50 * S}
          fill="none"
          stroke="#283548"
          strokeWidth="1.5"
        />
        {/* Paint / Key (19 ft x 16 ft) */}
        <rect
          x={X0}
          y={CY - 8 * S}
          width={19 * S}
          height={16 * S}
          fill="#131C2E"
          stroke="#334155"
          strokeWidth="1.2"
        />
        {/* Free Throw Circle (Solid outside paint, dashed inside) */}
        <path
          d={`M ${X_FT} ${CY - R_FT} A ${R_FT} ${R_FT} 0 0 1 ${X_FT} ${CY + R_FT}`}
          fill="none"
          stroke="#334155"
          strokeWidth="1.2"
        />
        <path
          d={`M ${X_FT} ${CY - R_FT} A ${R_FT} ${R_FT} 0 0 0 ${X_FT} ${CY + R_FT}`}
          fill="none"
          stroke="#334155"
          strokeWidth="1.1"
          strokeDasharray="3 3"
        />
        {/* Restricted Area Arc (4 ft radius from hoop) */}
        <path
          d={`M ${X_BB} ${HY - R_RA} L ${HX} ${HY - R_RA} A ${R_RA} ${R_RA} 0 0 1 ${HX} ${HY + R_RA} L ${X_BB} ${HY + R_RA}`}
          fill="none"
          stroke="#334155"
          strokeWidth="1.1"
        />
        {/* Authentic NBA 3-Point Line: 22 ft corners + 23.75 ft circular arc centered on hoop */}
        <path
          d={`M ${X0} ${Y_3PT_TOP} L ${X_3PT_BREAK} ${Y_3PT_TOP} A ${R_3PT} ${R_3PT} 0 0 1 ${X_3PT_BREAK} ${Y_3PT_BOT} L ${X0} ${Y_3PT_BOT}`}
          fill="none"
          stroke="#475569"
          strokeWidth="1.6"
        />
        {/* Half-Court Center Circle */}
        <path
          d={`M ${X_HALF} ${CY - R_FT} A ${R_FT} ${R_FT} 0 0 0 ${X_HALF} ${CY + R_FT}`}
          fill="none"
          stroke="#334155"
          strokeWidth="1.2"
        />
        {/* Backboard, Neck & Rim */}
        <line x1={X_BB} y1={CY - 3 * S} x2={X_BB} y2={CY + 3 * S} stroke="#94a3b8" strokeWidth="2" />
        <line x1={X_BB} y1={HY} x2={HX - 3.6} y2={HY} stroke="#94a3b8" strokeWidth="1.4" />
        <circle cx={HX} cy={HY} r="3.6" fill="none" stroke="#f97316" strokeWidth="2" />

        {/* Subtle Scale Reference Markers */}
        <text
          x={X_FT - 2}
          y={Y_BOT - 6}
          textAnchor="middle"
          fill="#475569"
          fontSize="7.5"
          fontFamily="monospace"
        >
          19&apos; TL
        </text>
        <text
          x={HX + R_3PT + 2}
          y={Y_BOT - 6}
          textAnchor="middle"
          fill="#64748b"
          fontSize="7.5"
          fontFamily="monospace"
        >
          23.75&apos; 3P
        </text>
        <text
          x={X_HALF - 4}
          y={Y_BOT - 6}
          textAnchor="end"
          fill="#475569"
          fontSize="7.5"
          fontFamily="monospace"
        >
          47&apos;
        </text>

        {/* Trajectory Arc from Shot Origin to Rim */}
        <path
          d={`M ${shotX} ${shotY} Q ${(shotX + HX) / 2} ${Math.min(shotY, HY) - 24} ${HX} ${HY}`}
          fill="none"
          stroke={accent}
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        {/* Shot Origin Marker */}
        <circle cx={shotX} cy={shotY} r="8" fill={accent} fillOpacity="0.22" />
        <circle cx={shotX} cy={shotY} r="4.5" fill={accent} stroke="#0B1120" strokeWidth="1.5" />
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize="9.5"
          fontFamily="monospace"
          fontWeight="700"
        >
          {shot.clockSeconds <= 0.15 ? '0.0s' : `${shot.clockSeconds.toFixed(1)}s`}
        </text>
      </svg>
    </div>
  );
}

export function HeroicShotsView({
  players,
  teams,
  experienceMode,
  watchlistIds,
  onlyWatchlist,
  onToggleOnlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  onOpenGamedayDate,
  refreshCounter = 0,
}: HeroicShotsViewProps) {
  const [data, setData] = useState<NbaHeroicShotsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<HeroicTab>('archive');
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('2026-27');
  const [shotTypeFilter, setShotTypeFilter] = useState<ShotTypeFilter>('all');
  const [pointsFilter, setPointsFilter] = useState<ShotPointsFilter>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [archiveDisplayMode, setArchiveDisplayMode] = useState<'cards' | 'table'>('cards');
  const [playerFilterId, setPlayerFilterId] = useState<string | null>(null);

  const {
    sortKey: archiveSortKey,
    sortAsc: archiveSortAsc,
    toggleSort: toggleArchiveSort,
  } = useTableSort<
    'date' | 'shotType' | 'player' | 'team' | 'clock' | 'distance' | 'points' | 'score'
  >('date', false, ['player', 'team', 'shotType']);

  const {
    sortKey: playerSortKey,
    sortAsc: playerSortAsc,
    toggleSort: togglePlayerSort,
    setSortKey: setPlayerSortKey,
    setSortAsc: setPlayerSortAsc,
  } = useTableSort<
    | 'name'
    | 'buzzerBeaters'
    | 'totalGameWinners'
    | 'otTyingBuzzers'
    | 'totalHeroic'
    | 'maxDistanceFt'
    | 'lastDate'
  >('totalHeroic', false, ['name', 'lastDate']);

  const {
    sortKey: teamSortKey,
    sortAsc: teamSortAsc,
    toggleSort: toggleTeamSort,
    setSortKey: setTeamSortKey,
    setSortAsc: setTeamSortAsc,
  } = useTableSort<
    | 'teamName'
    | 'buzzerBeatersFor'
    | 'gameWinnersFor'
    | 'otTyingFor'
    | 'totalFor'
    | 'shotsAgainst'
    | 'netBalance'
  >('netBalance', false, ['teamName']);

  const fetchHeroicShots = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg(null);
    try {
      const json = await fetchSharedHeroicShots('all', forceRefresh);
      setData(json);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Error al consultar los tiros decisivos NBA.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchHeroicShots(false);
  }, [fetchHeroicShots]);

  useEffect(() => {
    if (refreshCounter > 0) {
      void fetchHeroicShots(true);
    }
  }, [refreshCounter, fetchHeroicShots]);

  // Lookup maps from bootstrap entities to enrich abbreviated CDN play-by-play names
  const playerById = useMemo(() => {
    const m = new Map<string, PlayerSummary>();
    for (const p of players) m.set(String(p.id), p);
    return m;
  }, [players]);

  const teamById = useMemo(() => {
    const m = new Map<string, TeamSummary>();
    for (const t of teams) m.set(String(t.id), t);
    return m;
  }, [teams]);

  const teamByAbbr = useMemo(() => {
    const m = new Map<string, TeamSummary>();
    for (const t of teams) m.set(t.abbreviation.toUpperCase(), t);
    return m;
  }, [teams]);

  const enrichedAllShots = useMemo<EnrichedHeroicShot[]>(() => {
    const rawItems = data?.items || [];
    return rawItems.map((s) => {
      const pMatch = playerById.get(String(s.playerId));
      const tMatch =
        teamById.get(String(s.teamId)) ||
        teamByAbbr.get(String(s.teamAbbr || '').toUpperCase());
      const oppMatch = teamByAbbr.get(String(s.opponentAbbr || '').toUpperCase());
      const ptsCat: EnrichedHeroicShot['pointsCategoryLabel'] =
        s.points === 3 ? 'Triple (3P)' : s.points === 1 ? 'Tiro Libre' : 'Canasta 2P';
      const dist =
        typeof s.shotDistance === 'number' && Number.isFinite(s.shotDistance) && s.shotDistance > 0
          ? s.shotDistance
          : null;
      const watched =
        watchlistIds.has(`player:${s.playerId}`) ||
        watchlistIds.has(`team:${s.teamId}`);

      return {
        ...s,
        fullPlayerName: pMatch?.name || s.playerName || 'Jugador NBA',
        playerPosition: pMatch?.position || '',
        teamFullName: tMatch?.name || s.teamAbbr,
        opponentTeamId: oppMatch?.id || null,
        opponentFullName: oppMatch?.name || s.opponentAbbr,
        pointsCategoryLabel: ptsCat,
        distanceFt: dist,
        translatedDescription: translatePlayDescriptionEs(s.description),
        watched,
      };
    });
  }, [data, playerById, teamById, teamByAbbr, watchlistIds]);

  // Base season-scoped pool (drives KPIs, rankings & filtered archive consistently)
  const seasonScopedShots = useMemo(() => {
    return enrichedAllShots.filter((s) => {
      if (seasonFilter !== 'all' && s.seasonLabel !== seasonFilter) return false;
      if (onlyWatchlist && !s.watched) return false;
      return true;
    });
  }, [enrichedAllShots, seasonFilter, onlyWatchlist]);

  // Full filtered pool for Archivo de Tiros
  const filteredShots = useMemo(() => {
    const q = normalizeSearchText(searchQuery.trim());
    return seasonScopedShots.filter((s) => {
      if (playerFilterId && s.playerId !== playerFilterId) return false;
      if (shotTypeFilter !== 'all' && s.shotType !== shotTypeFilter) return false;
      if (pointsFilter !== 'all' && String(s.points) !== pointsFilter) return false;
      if (
        teamFilter !== 'all' &&
        s.teamAbbr.toUpperCase() !== teamFilter &&
        s.opponentAbbr.toUpperCase() !== teamFilter
      ) {
        return false;
      }
      if (q) {
        const hay = normalizeSearchText(
          `${s.fullPlayerName} ${s.playerName} ${s.teamAbbr} ${s.teamFullName} ${s.opponentAbbr} ${s.opponentFullName} ${s.translatedDescription} ${s.description} ${s.date}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    seasonScopedShots,
    playerFilterId,
    shotTypeFilter,
    pointsFilter,
    teamFilter,
    searchQuery,
  ]);

  const sortedArchiveShots = useMemo(() => {
    if (!archiveSortKey) return filteredShots;
    return sortRows(
      filteredShots,
      (s) => {
        switch (archiveSortKey) {
          case 'date':
            return s.date;
          case 'shotType':
            return s.shotType === 'buzzer_beater' ? 3 : s.shotType === 'ot_tying_buzzer' ? 2 : 1;
          case 'player':
            return s.fullPlayerName;
          case 'team':
            return s.teamAbbr;
          case 'clock':
            return s.clockSeconds;
          case 'distance':
            return s.distanceFt ?? (s.points === 1 ? 15 : 0);
          case 'points':
            return s.points;
          case 'score':
            return s.finalScoreTeam - s.finalScoreOpp;
        }
      },
      archiveSortAsc
    );
  }, [filteredShots, archiveSortKey, archiveSortAsc]);

  // Spotlight shot: most recent Buzzer Beater (0.0s) in the active filter, or top filtered shot
  const spotlightShot = useMemo(() => {
    if (filteredShots.length === 0) return null;
    const latestBuzzer = filteredShots.find((s) => s.shotType === 'buzzer_beater');
    return latestBuzzer || filteredShots[0];
  }, [filteredShots]);

  // KPI strip metrics
  const kpiStats = useMemo(() => {
    const bb = filteredShots.filter((s) => s.shotType === 'buzzer_beater').length;
    const gwOnly = filteredShots.filter((s) => s.shotType === 'game_winner').length;
    const ot = filteredShots.filter((s) => s.shotType === 'ot_tying_buzzer').length;
    const threes = filteredShots.filter((s) => s.points === 3).length;
    const twos = filteredShots.filter((s) => s.points === 2).length;
    const fts = filteredShots.filter((s) => s.points === 1).length;
    const withDist = filteredShots
      .filter((s) => s.distanceFt !== null && s.distanceFt > 0)
      .sort((a, b) => (b.distanceFt || 0) - (a.distanceFt || 0));
    const longestShot = withDist[0] || null;
    return {
      total: filteredShots.length,
      bb,
      gwOnly,
      gwTotal: bb + gwOnly,
      ot,
      threes,
      twos,
      fts,
      longestShot,
    };
  }, [filteredShots]);

  // Player Leaderboard derived cleanly from seasonScopedShots
  const playerLeaderboard = useMemo<PlayerHeroicLeaderboardRow[]>(() => {
    const byPlayer = new Map<string, PlayerHeroicLeaderboardRow & { distSum: number; distCount: number }>();

    for (const s of seasonScopedShots) {
      if (
        teamFilter !== 'all' &&
        s.teamAbbr.toUpperCase() !== teamFilter
      ) {
        continue;
      }
      const existing = byPlayer.get(s.playerId);
      const isBB = s.shotType === 'buzzer_beater' ? 1 : 0;
      const isGWOnly = s.shotType === 'game_winner' ? 1 : 0;
      const isOT = s.shotType === 'ot_tying_buzzer' ? 1 : 0;
      const dist = s.distanceFt || 0;

      if (!existing) {
        byPlayer.set(s.playerId, {
          playerId: s.playerId,
          name: s.fullPlayerName,
          teamId: s.teamId,
          teamAbbr: s.teamAbbr,
          position: s.playerPosition || '—',
          buzzerBeaters: isBB,
          gameWinnersOnly: isGWOnly,
          totalGameWinners: isBB + isGWOnly,
          otTyingBuzzers: isOT,
          totalHeroic: 1,
          maxDistanceFt: dist,
          avgDistanceFt: dist > 0 ? dist : null,
          distSum: dist,
          distCount: dist > 0 ? 1 : 0,
          threePointers: s.points === 3 ? 1 : 0,
          lastDate: s.date,
          lastSummary: `${s.teamAbbr} ${s.isHome ? 'vs' : '@'} ${s.opponentAbbr} (${formatClockLabel(s.clockSeconds, s.clock)})`,
          watched: watchlistIds.has(`player:${s.playerId}`),
        });
      } else {
        existing.buzzerBeaters += isBB;
        existing.gameWinnersOnly += isGWOnly;
        existing.totalGameWinners += isBB + isGWOnly;
        existing.otTyingBuzzers += isOT;
        existing.totalHeroic += 1;
        existing.threePointers += s.points === 3 ? 1 : 0;
        if (dist > existing.maxDistanceFt) existing.maxDistanceFt = dist;
        if (dist > 0) {
          existing.distSum += dist;
          existing.distCount += 1;
          existing.avgDistanceFt = existing.distSum / existing.distCount;
        }
        if (s.date > existing.lastDate) {
          existing.lastDate = s.date;
          existing.teamAbbr = s.teamAbbr;
          existing.teamId = s.teamId;
          existing.lastSummary = `${s.teamAbbr} ${s.isHome ? 'vs' : '@'} ${s.opponentAbbr} (${formatClockLabel(s.clockSeconds, s.clock)})`;
        }
      }
    }

    const q = normalizeSearchText(searchQuery.trim());
    const rows = Array.from(byPlayer.values()).filter((r) => {
      if (shotTypeFilter === 'buzzer_beater' && r.buzzerBeaters <= 0) return false;
      if (shotTypeFilter === 'game_winner' && r.totalGameWinners <= 0) return false;
      if (shotTypeFilter === 'ot_tying_buzzer' && r.otTyingBuzzers <= 0) return false;
      if (!q) return true;
      return normalizeSearchText(`${r.name} ${r.teamAbbr} ${r.position}`).includes(q);
    });

    if (!playerSortKey) return rows;
    return sortRows(
      rows,
      (r) => {
        switch (playerSortKey) {
          case 'name':
            return r.name;
          case 'buzzerBeaters':
            return r.buzzerBeaters * 100 + r.totalHeroic;
          case 'totalGameWinners':
            return r.totalGameWinners * 100 + r.buzzerBeaters;
          case 'otTyingBuzzers':
            return r.otTyingBuzzers * 100 + r.totalHeroic;
          case 'totalHeroic':
            return r.totalHeroic * 1000 + r.buzzerBeaters * 10 + r.maxDistanceFt;
          case 'maxDistanceFt':
            return r.maxDistanceFt;
          case 'lastDate':
            return r.lastDate;
        }
      },
      playerSortAsc
    );
  }, [seasonScopedShots, teamFilter, shotTypeFilter, searchQuery, watchlistIds, playerSortKey, playerSortAsc]);

  // Team Leaderboard (For vs Against + Net Balance)
  const teamLeaderboard = useMemo<TeamHeroicLeaderboardRow[]>(() => {
    const byTeam = new Map<string, TeamHeroicLeaderboardRow>();

    for (const t of teams) {
      const abbr = t.abbreviation.toUpperCase();
      if (onlyWatchlist && !watchlistIds.has(`team:${t.id}`)) continue;
      byTeam.set(abbr, {
        teamId: t.id,
        teamAbbr: abbr,
        teamName: t.name,
        conference: t.conference || '—',
        buzzerBeatersFor: 0,
        gameWinnersFor: 0,
        otTyingFor: 0,
        totalFor: 0,
        shotsAgainst: 0,
        buzzerAgainst: 0,
        netBalance: 0,
        lastForDate: '',
        watched: watchlistIds.has(`team:${t.id}`),
      });
    }

    for (const s of seasonScopedShots) {
      const abbr = (s.teamAbbr || '').toUpperCase();
      const oppAbbr = (s.opponentAbbr || '').toUpperCase();

      if (abbr) {
        const entry = byTeam.get(abbr);
        if (entry) {
          if (s.shotType === 'buzzer_beater') {
            entry.buzzerBeatersFor += 1;
            entry.gameWinnersFor += 1;
          } else if (s.shotType === 'game_winner') {
            entry.gameWinnersFor += 1;
          } else if (s.shotType === 'ot_tying_buzzer') {
            entry.otTyingFor += 1;
          }
          entry.totalFor += 1;
          if (s.date > entry.lastForDate) entry.lastForDate = s.date;
        }
      }

      if (oppAbbr) {
        const oppEntry = byTeam.get(oppAbbr);
        if (oppEntry) {
          oppEntry.shotsAgainst += 1;
          if (s.shotType === 'buzzer_beater') {
            oppEntry.buzzerAgainst += 1;
          }
        }
      }
    }

    const q = normalizeSearchText(searchQuery.trim());
    const rows = Array.from(byTeam.values())
      .map((r) => ({ ...r, netBalance: r.totalFor - r.shotsAgainst }))
      .filter((r) => {
        if (teamFilter !== 'all' && r.teamAbbr !== teamFilter) return false;
        if (shotTypeFilter === 'buzzer_beater' && r.buzzerBeatersFor <= 0) return false;
        if (shotTypeFilter === 'game_winner' && r.gameWinnersFor <= 0) return false;
        if (shotTypeFilter === 'ot_tying_buzzer' && r.otTyingFor <= 0) return false;
        if (!q) return true;
        return normalizeSearchText(`${r.teamName} ${r.teamAbbr} ${r.conference}`).includes(q);
      });

    if (!teamSortKey) return rows;
    return sortRows(
      rows,
      (r) => {
        switch (teamSortKey) {
          case 'teamName':
            return r.teamName;
          case 'buzzerBeatersFor':
            return r.buzzerBeatersFor * 100 + r.totalFor;
          case 'gameWinnersFor':
            return r.gameWinnersFor * 100 + r.buzzerBeatersFor;
          case 'otTyingFor':
            return r.otTyingFor * 100 + r.totalFor;
          case 'totalFor':
            return r.totalFor * 100 + r.netBalance;
          case 'shotsAgainst':
            return r.shotsAgainst;
          case 'netBalance':
            return r.netBalance * 100 + r.totalFor;
        }
      },
      teamSortAsc
    );
  }, [teams, seasonScopedShots, onlyWatchlist, watchlistIds, teamFilter, shotTypeFilter, searchQuery, teamSortKey, teamSortAsc]);

  const handleShotTypeFilterChange = (nextType: ShotTypeFilter) => {
    setShotTypeFilter(nextType);
    if (nextType === 'buzzer_beater') {
      setPlayerSortKey('buzzerBeaters');
      setPlayerSortAsc(false);
      setTeamSortKey('buzzerBeatersFor');
      setTeamSortAsc(false);
    } else if (nextType === 'game_winner') {
      setPlayerSortKey('totalGameWinners');
      setPlayerSortAsc(false);
      setTeamSortKey('gameWinnersFor');
      setTeamSortAsc(false);
    } else if (nextType === 'ot_tying_buzzer') {
      setPlayerSortKey('otTyingBuzzers');
      setPlayerSortAsc(false);
      setTeamSortKey('otTyingFor');
      setTeamSortAsc(false);
    } else {
      setPlayerSortKey('totalHeroic');
      setPlayerSortAsc(false);
      setTeamSortKey('netBalance');
      setTeamSortAsc(false);
    }
  };

  const hasActiveSubFilters =
    seasonFilter !== '2026-27' ||
    shotTypeFilter !== 'all' ||
    pointsFilter !== 'all' ||
    teamFilter !== 'all' ||
    searchQuery.trim() !== '' ||
    playerFilterId !== null;

  const clearAllFilters = () => {
    setSeasonFilter('2026-27');
    handleShotTypeFilterChange('all');
    setPointsFilter('all');
    setTeamFilter('all');
    setSearchQuery('');
    setPlayerFilterId(null);
  };

  const activePlayerFilterName = playerFilterId
    ? playerById.get(playerFilterId)?.name ||
      enrichedAllShots.find((s) => s.playerId === playerFilterId)?.fullPlayerName ||
      playerFilterId
    : null;

  const sortedTeamsList = useMemo(
    () => [...teams].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation)),
    [teams]
  );

  if (loading && !data) {
    return (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-8 flex flex-col items-center justify-center gap-3 text-center">
        <RefreshCw className="w-6 h-6 text-orange-400 animate-spin" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-100">
            Cargando archivo oficial de Buzzer Beaters y Game Winners...
          </p>
          <p className="text-xs text-slate-400">
            Analizando posesiones finales del Play-by-Play NBA (0.0s y ≤10s)
          </p>
        </div>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="bg-[#131C2E] border border-rose-500/40 rounded-lg p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-rose-300">
            Incidencia al cargar el módulo de Tiros Decisivos
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{errorMsg}</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchHeroicShots(false)}
          className="px-4 py-2 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap shrink-0"
        >
          Reintentar carga
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header + Season Scope + View Switcher */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Zap className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-100">
                Buzzer Beaters y Game Winners
              </h2>
              <MetricInfoTooltip helpKey="buzzerBeater" align="left" />
              <span className="text-xs font-mono tabular-nums text-slate-400">
                · {data?.totalEvents ?? enrichedAllShots.length} hitos oficiales (2025-27)
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {experienceMode === 'simple'
                ? 'Archivo interactivo con las canastas que decidieron partidos sobre la bocina (0.0s) o en los últimos 10 segundos, quiénes anotan más y cómo entender cada jugada.'
                : 'Registro Play-by-Play oficial NBA CDN (últimos ≤10.0s de 4Q/OT y 0.0s sobre la bocina) con distancia óptica de tiro, rankings por jugador, balance neto por franquicia y benchmarks históricos.'}
            </p>
          </div>

          {/* Season Scope + Watchlist Toggle */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
              {(
                [
                  { id: '2026-27', label: '2026-27' },
                  { id: '2025-26', label: '2025-26' },
                  { id: 'all', label: 'Todas (2025-27)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSeasonFilter(opt.id)}
                  className={`min-h-[28px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    seasonFilter === opt.id
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#131C2E]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleOnlyWatchlist}
              className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                onlyWatchlist
                  ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                  : 'bg-[#0B1120] hover:bg-[#182338] border-[#1E293B] text-slate-300 hover:text-white'
              }`}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  onlyWatchlist ? 'fill-orange-400 text-orange-400' : ''
                }`}
              />
              <span>Favoritos</span>
            </button>

            <button
              type="button"
              disabled={refreshing}
              onClick={() => void fetchHeroicShots(true)}
              title="Reescanear nuevos finales cerrados recientes"
              className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border bg-[#0B1120] hover:bg-[#182338] border-[#1E293B] text-slate-300 hover:text-white disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{refreshing ? 'Actualizando...' : 'Actualizar'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Sub-tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[#1E293B]">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg max-w-full">
            {(
              [
                { id: 'archive', label: 'Archivo de Tiros', icon: Target, count: filteredShots.length },
                { id: 'players', label: 'Ranking Jugadores', icon: Users, count: playerLeaderboard.length },
                { id: 'teams', label: 'Ranking Franquicias', icon: Shield, count: teamLeaderboard.length },
                { id: 'history', label: 'Guía y Contexto Histórico', icon: BookOpen },
              ] as Array<{
                id: HeroicTab;
                label: string;
                icon: typeof Target;
                count?: number;
              }>
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#131C2E]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span
                      className={`font-mono tabular-nums text-[11px] ${
                        isActive ? 'text-slate-950/80' : 'text-slate-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeTab === 'archive' && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                <button
                  type="button"
                  onClick={() => setArchiveDisplayMode('cards')}
                  className={`min-h-[28px] px-2.5 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                    archiveDisplayMode === 'cards'
                      ? 'bg-[#1E293B] text-orange-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Tarjetas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setArchiveDisplayMode('table')}
                  className={`min-h-[28px] px-2.5 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                    archiveDisplayMode === 'table'
                      ? 'bg-[#1E293B] text-orange-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Tabla</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Homogeneous 4-Column KPI Summary Strip (click cards to quick-filter!) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div
          onClick={() => {
            handleShotTypeFilterChange('all');
            if (activeTab === 'history') setActiveTab('archive');
          }}
          className="p-3.5 sm:p-4 hover:bg-[#182338] cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Tiros decisivos filtrados</span>
            <span onClick={(e) => e.stopPropagation()}>
              <MetricInfoTooltip helpKey="gameWinner" />
            </span>
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {kpiStats.total}
          </p>
          <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400 truncate">
            {kpiStats.threes} 3PT · {kpiStats.twos} 2PT · {kpiStats.fts} TL
          </p>
        </div>

        <div
          onClick={() => {
            handleShotTypeFilterChange(
              shotTypeFilter === 'buzzer_beater' ? 'all' : 'buzzer_beater'
            );
            if (activeTab === 'history') setActiveTab('archive');
          }}
          className="p-3.5 sm:p-4 hover:bg-[#182338] cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Buzzer Beaters (0.0s)</span>
            <span onClick={(e) => e.stopPropagation()}>
              <MetricInfoTooltip helpKey="buzzerBeater" />
            </span>
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-orange-400">
            {kpiStats.bb}
          </p>
          <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400 truncate">
            {kpiStats.gwOnly} Game Winners (0.1–10s)
          </p>
        </div>

        <div
          onClick={() => {
            handleShotTypeFilterChange(
              shotTypeFilter === 'ot_tying_buzzer' ? 'all' : 'ot_tying_buzzer'
            );
            if (activeTab === 'history') setActiveTab('archive');
          }}
          className="p-3.5 sm:p-4 hover:bg-[#182338] cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Empates bocina (OT)</span>
            <span onClick={(e) => e.stopPropagation()}>
              <MetricInfoTooltip helpKey="otTyingBuzzer" />
            </span>
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-sky-400">
            {kpiStats.ot}
          </p>
          <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400 truncate">
            {kpiStats.gwTotal} victorias definitivas
          </p>
        </div>

        <div
          onClick={() =>
            kpiStats.longestShot &&
            onInspectEntity('player', kpiStats.longestShot.playerId)
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            kpiStats.longestShot ? 'hover:bg-[#182338] cursor-pointer' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Tiro más lejano medido</span>
            <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          </div>
          {kpiStats.longestShot ? (
            <>
              <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-emerald-400 truncate">
                {kpiStats.longestShot.distanceFt?.toFixed(1)} ft
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                {kpiStats.longestShot.fullPlayerName} ({kpiStats.longestShot.teamAbbr})
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono text-slate-500">—</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Sin distancia medida</p>
            </>
          )}
        </div>
      </div>

      {/* Unified Filter Bar for Archive, Players & Teams tabs */}
      {activeTab !== 'history' && (
        <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3.5 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    activeTab === 'teams'
                      ? 'Buscar franquicia (BOS, Lakers...)'
                      : 'Buscar jugador, franquicia, jugada...'
                  }
                  className="w-full h-9 pl-8 pr-8 bg-[#0B1120] border border-[#1E293B] focus:border-orange-500 rounded-md text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                aria-label="Filtrar por franquicia NBA"
                className="h-9 px-2.5 bg-[#0B1120] border border-[#1E293B] focus:border-orange-500 rounded-md text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">Todas las franquicias (30)</option>
                {sortedTeamsList.map((t) => (
                  <option key={t.id} value={t.abbreviation.toUpperCase()}>
                    {t.abbreviation} · {t.name}
                  </option>
                ))}
              </select>

              <div className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                {(
                  [
                    { id: 'all', label: 'Todos los tipos' },
                    { id: 'buzzer_beater', label: '⚡ BB (0.0s)' },
                    { id: 'game_winner', label: '🎯 GW (≤10s)' },
                    { id: 'ot_tying_buzzer', label: '⏱️ Empate OT' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleShotTypeFilterChange(opt.id)}
                    className={`min-h-[28px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      shotTypeFilter === opt.id
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {activeTab === 'archive' && (
                <div className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                  {(
                    [
                      { id: 'all', label: '3P/2P/TL' },
                      { id: '3', label: 'Triples (3P)' },
                      { id: '2', label: '2 Puntos' },
                      { id: '1', label: 'Tiros Libres' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPointsFilter(opt.id)}
                      className={`min-h-[28px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        pointsFilter === opt.id
                          ? 'bg-[#1E293B] text-orange-300 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activePlayerFilterName && (
                <button
                  type="button"
                  onClick={() => setPlayerFilterId(null)}
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/40 text-xs font-semibold text-orange-300 hover:bg-orange-500/25 transition-colors whitespace-nowrap"
                >
                  <Filter className="w-3 h-3" />
                  <span>Jugador: {activePlayerFilterName}</span>
                  <X className="w-3 h-3" />
                </button>
              )}

              {hasActiveSubFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-[#0B1120] border border-[#1E293B] rounded-lg transition-colors whitespace-nowrap"
                >
                  Restablecer
                </button>
              )}

              {activeTab === 'archive' && (
                <ExportImageButton
                  disabled={sortedArchiveShots.length === 0}
                  onBuildImage={async () => {
                    const slug = seasonFilter === 'all' ? '2025-27' : seasonFilter;
                    return buildTableSnapshotBlob({
                      filename: `radarnba-buzzer-beaters-${slug}.png`,
                      categoryTag: `ARCHIVO PLAY-BY-PLAY · ${slug.toUpperCase()}`,
                      title: 'Buzzer Beaters y Game Winners NBA',
                      subtitle: `${sortedArchiveShots.length} canastas decisivas oficiales verificadas en los últimos 10 segundos`,
                      entityColumnLabel: 'JUGADOR',
                      entityColumnWeight: 2.1,
                      kpis: [
                        {
                          label: 'TIROS DECISIVOS',
                          value: `${kpiStats.total}`,
                          tone: 'accent',
                        },
                        {
                          label: 'BUZZER BEATERS (0.0s)',
                          value: `${kpiStats.bb}`,
                          tone: 'positive',
                        },
                        {
                          label: 'EMPATES OT (0.0s)',
                          value: `${kpiStats.ot}`,
                          tone: 'neutral',
                        },
                      ],
                      columns: [
                        { key: 'date', label: 'FECHA', align: 'left', widthWeight: 0.9 },
                        { key: 'type', label: 'TIPO', align: 'left', widthWeight: 1.05 },
                        { key: 'matchup', label: 'PARTIDO', align: 'left', widthWeight: 1.0 },
                        { key: 'clock', label: 'RELOJ', align: 'right', widthWeight: 0.8 },
                        { key: 'dist', label: 'DIST.', align: 'right', widthWeight: 0.8 },
                        { key: 'score', label: 'FINAL', align: 'right', widthWeight: 0.95 },
                      ],
                      rows: sortedArchiveShots.slice(0, 15).map((s, idx) => ({
                        rank: idx + 1,
                        teamAbbr: s.teamAbbr,
                        entityName: s.fullPlayerName,
                        entitySubtext: `${s.teamAbbr} · ${s.pointsCategoryLabel}`,
                        cells: {
                          date: { text: formatShortDate(s.date) },
                          type: {
                            text: getShotBadgeMeta(s.shotType).shortLabel,
                            tone: s.shotType === 'buzzer_beater' ? 'accent' : s.shotType === 'game_winner' ? 'positive' : 'neutral',
                          },
                          matchup: {
                            text: `${s.teamAbbr} ${s.isHome ? 'vs' : '@'} ${s.opponentAbbr}`,
                            subtext: s.periodLabel,
                          },
                          clock: { text: formatClockLabel(s.clockSeconds, s.clock) },
                          dist: {
                            text: s.distanceFt ? `${s.distanceFt.toFixed(1)} ft` : s.points === 1 ? '15 ft' : '—',
                          },
                          score: {
                            text: `${s.finalScoreTeam}-${s.finalScoreOpp}`,
                            tone: s.wonGame ? 'positive' : 'neutral',
                          },
                        },
                      })),
                      footerNote: 'Play-by-Play Oficial NBA CDN · Últimos ≤10.0s de 4Q/OT y 0.0s sobre la bocina',
                    });
                  }}
                />
              )}

              {activeTab === 'players' && (
                <ExportImageButton
                  disabled={playerLeaderboard.length === 0}
                  onBuildImage={async () => {
                    const slug = seasonFilter === 'all' ? '2025-27' : seasonFilter;
                    const modeTag =
                      shotTypeFilter === 'buzzer_beater'
                        ? 'BUZZER BEATERS (0.0s)'
                        : shotTypeFilter === 'game_winner'
                        ? 'GAME WINNERS (≤10s)'
                        : shotTypeFilter === 'ot_tying_buzzer'
                        ? 'EMPATES SOBRE BOCINA (OT)'
                        : 'BB, GW & OT';
                    return buildTableSnapshotBlob({
                      filename: `radarnba-ranking-${shotTypeFilter}-${slug}.png`,
                      categoryTag: `RANKING JUGADORES · ${modeTag} · ${slug.toUpperCase()}`,
                      title:
                        shotTypeFilter === 'buzzer_beater'
                          ? 'Líderes en Buzzer Beaters NBA (0.0s)'
                          : shotTypeFilter === 'game_winner'
                          ? 'Líderes en Game Winners NBA (≤10s)'
                          : shotTypeFilter === 'ot_tying_buzzer'
                          ? 'Especialistas en Empates sobre la Bocina (OT)'
                          : 'Jugadores Más Decisivos NBA (BB & GW)',
                      subtitle:
                        'Clasificación oficial Play-by-Play por tiros decisivos en finales apretados',
                      entityColumnLabel: 'JUGADOR',
                      entityColumnWeight: 2.2,
                      columns: [
                        { key: 'bb', label: 'BB (0.0s)', align: 'right', widthWeight: 0.9 },
                        { key: 'gw', label: 'GW (≤10s)', align: 'right', widthWeight: 0.9 },
                        { key: 'ot', label: 'OT (0.0s)', align: 'right', widthWeight: 0.9 },
                        { key: 'total', label: 'TOTAL', align: 'right', widthWeight: 0.85 },
                        { key: 'dist', label: 'DIST. MÁX', align: 'right', widthWeight: 0.95 },
                      ],
                      rows: playerLeaderboard.slice(0, 15).map((r, idx) => ({
                        rank: idx + 1,
                        teamAbbr: r.teamAbbr,
                        entityName: r.name,
                        entitySubtext: `${r.teamAbbr} · ${r.position}`,
                        cells: {
                          bb: { text: `${r.buzzerBeaters}`, tone: r.buzzerBeaters > 0 ? 'accent' : 'neutral' },
                          gw: { text: `${r.totalGameWinners}`, tone: 'positive' },
                          ot: { text: `${r.otTyingBuzzers}` },
                          total: { text: `${r.totalHeroic}`, tone: 'accent' },
                          dist: { text: r.maxDistanceFt > 0 ? `${r.maxDistanceFt.toFixed(1)} ft` : '—' },
                        },
                      })),
                      footerNote: 'Play-by-Play Oficial NBA CDN · Incluye BB ganadores dentro de GW totales',
                    });
                  }}
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* TAB 1: ARCHIVO DE TIROS */}
      {activeTab === 'archive' && (
        <div className="space-y-4">
          {/* Spotlight Card of Latest / Top Buzzer Beater */}
          {spotlightShot && archiveDisplayMode === 'cards' && (
            <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-orange-400 shrink-0" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    {spotlightShot.shotType === 'buzzer_beater'
                      ? 'Último Buzzer Beater Destacado (0.0s)'
                      : 'Tiro Decisivo Destacado'}
                  </h3>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {spotlightShot.seasonLabel} · {formatShortDate(spotlightShot.date)} · {spotlightShot.periodLabel} ·{' '}
                  {formatClockLabel(spotlightShot.clockSeconds, spotlightShot.clock)}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                <div className="lg:col-span-7 space-y-3 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      onClick={() => onInspectEntity('player', spotlightShot.playerId)}
                      className="flex items-center gap-3 min-w-0 cursor-pointer group"
                    >
                      <PlayerAvatar
                        playerId={spotlightShot.playerId}
                        name={spotlightShot.fullPlayerName}
                        teamAbbr={spotlightShot.teamAbbr}
                        showTeamBadge
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-base sm:text-lg font-bold text-slate-100 group-hover:text-orange-300 transition-colors truncate">
                            {spotlightShot.fullPlayerName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${
                              getShotBadgeMeta(spotlightShot.shotType).surfaceCls
                            }`}
                          >
                            {getShotBadgeMeta(spotlightShot.shotType).label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">
                          {spotlightShot.teamFullName}
                          {spotlightShot.playerPosition ? ` · ${spotlightShot.playerPosition}` : ''}
                          {' · '}
                          {spotlightShot.pointsCategoryLabel}
                        </p>
                      </div>
                    </div>

                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div
                        className={`text-base sm:text-lg font-bold ${
                          spotlightShot.wonGame ? 'text-emerald-400' : 'text-sky-400'
                        }`}
                      >
                        {spotlightShot.finalScoreTeam}-{spotlightShot.finalScoreOpp}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {spotlightShot.wonGame ? 'Victoria' : 'Forzó Prórroga'}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#0B1120] border border-[#1E293B] space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-200">
                        <TeamLogo abbr={spotlightShot.teamAbbr} size="xs" />
                        <span>{spotlightShot.teamAbbr}</span>
                        <span className="text-slate-500">
                          {spotlightShot.isHome ? 'vs' : '@'}
                        </span>
                        <TeamLogo abbr={spotlightShot.opponentAbbr} size="xs" />
                        <span>{spotlightShot.opponentAbbr}</span>
                      </span>
                      <span className="font-mono text-orange-300 font-semibold">
                        +{spotlightShot.points} pts · {spotlightShot.periodLabel} ({formatClockLabel(spotlightShot.clockSeconds, spotlightShot.clock)})
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed" title={spotlightShot.description}>
                      {spotlightShot.translatedDescription}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onInspectEntity('player', spotlightShot.playerId)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 transition-colors whitespace-nowrap"
                    >
                      Abrir ficha de {spotlightShot.fullPlayerName}
                    </button>
                    {onOpenGamedayDate && (
                      <button
                        type="button"
                        onClick={() => onOpenGamedayDate(spotlightShot.date)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <CalendarDays className="w-3.5 h-3.5 text-orange-400" />
                        <span>Ver jornada ({formatShortDate(spotlightShot.date)})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleWatchlist(`player:${spotlightShot.playerId}`)}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] text-slate-300 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          watchlistIds.has(`player:${spotlightShot.playerId}`)
                            ? 'fill-orange-400 text-orange-400'
                            : ''
                        }`}
                      />
                      <span>Favorito</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <HeroicCourtSvgVisualizer shot={spotlightShot} />
                </div>
              </div>
            </section>
          )}

          {sortedArchiveShots.length === 0 ? (
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-8 text-center space-y-2.5">
              <p className="text-sm font-semibold text-slate-200">
                Sin tiros decisivos con los filtros seleccionados
              </p>
              <p className="text-xs text-slate-400">
                {seasonFilter === '2026-27'
                  ? 'La temporada 2026-27 aún acumula pocos finales sobre la bocina; puedes ampliar a 2025-27 o ajustar los filtros.'
                  : 'Prueba a ampliar a todas las temporadas (2025-27) o limpiar los filtros de equipo y tipo de tiro.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {seasonFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSeasonFilter('all')}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors"
                  >
                    Ver todas las temporadas ({enrichedAllShots.length})
                  </button>
                )}
                {hasActiveSubFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="px-3.5 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] text-slate-200 rounded-lg hover:bg-[#182338] transition-colors"
                  >
                    Restablecer filtros
                  </button>
                )}
              </div>
            </div>
          ) : archiveDisplayMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {sortedArchiveShots.map((shot) => {
                const badge = getShotBadgeMeta(shot.shotType);
                const playerWatched = watchlistIds.has(`player:${shot.playerId}`);
                return (
                  <article
                    key={shot.id}
                    className="bg-[#131C2E] border border-[#1E293B] hover:border-[#283548] rounded-lg p-4 space-y-3 transition-colors flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Card Top Meta Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => onInspectEntity('player', shot.playerId)}
                            className="shrink-0"
                            title={`Ver ficha de ${shot.fullPlayerName}`}
                          >
                            <PlayerAvatar
                              playerId={shot.playerId}
                              name={shot.fullPlayerName}
                              teamAbbr={shot.teamAbbr}
                              showTeamBadge
                              size="sm"
                            />
                          </button>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onInspectEntity('player', shot.playerId)}
                                className="text-sm font-semibold text-slate-100 hover:text-orange-300 transition-colors truncate text-left"
                              >
                                {shot.fullPlayerName}
                              </button>
                              <button
                                type="button"
                                aria-label="Alternar favorito"
                                onClick={() => onToggleWatchlist(`player:${shot.playerId}`)}
                                className="text-slate-500 hover:text-orange-400 shrink-0"
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    playerWatched ? 'fill-orange-400 text-orange-400' : ''
                                  }`}
                                />
                              </button>
                            </div>
                            <p className="text-[11px] font-mono tabular-nums text-slate-400 truncate">
                              {shot.seasonLabel} · {formatShortDate(shot.date)} · {shot.periodLabel} ·{' '}
                              {formatClockLabel(shot.clockSeconds, shot.clock)}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-semibold whitespace-nowrap shrink-0 ${badge.surfaceCls}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      {/* Matchup & Description */}
                      <div className="p-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-200">
                            <button
                              type="button"
                              onClick={() => onInspectEntity('team', shot.teamId)}
                              className="inline-flex items-center gap-1 hover:text-orange-300 transition-colors"
                            >
                              <TeamLogo abbr={shot.teamAbbr} size="xs" />
                              <span>{shot.teamAbbr}</span>
                            </button>
                            <span className="text-slate-500">{shot.isHome ? 'vs' : '@'}</span>
                            <button
                              type="button"
                              disabled={!shot.opponentTeamId}
                              onClick={() =>
                                shot.opponentTeamId && onInspectEntity('team', shot.opponentTeamId)
                              }
                              className="inline-flex items-center gap-1 hover:text-orange-300 disabled:hover:text-slate-200 transition-colors"
                            >
                              <TeamLogo abbr={shot.opponentAbbr} size="xs" />
                              <span>{shot.opponentAbbr}</span>
                            </button>
                          </div>

                          <span
                            className={`font-mono tabular-nums font-bold ${
                              shot.wonGame ? 'text-emerald-400' : 'text-sky-400'
                            }`}
                          >
                            {shot.wonGame ? 'GANÓ' : 'EMPATE OT'} {shot.finalScoreTeam}-{shot.finalScoreOpp}
                          </span>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed" title={shot.description}>
                          {shot.translatedDescription}
                        </p>
                      </div>

                      <CourtDistanceMeter
                        distanceFt={shot.distanceFt}
                        points={shot.points}
                        shotType={shot.shotType}
                      />
                    </div>

                    {/* Footer Links */}
                    <div className="pt-2 border-t border-[#1E293B]/70 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono text-slate-400">
                        +{shot.points} pts · {shot.pointsCategoryLabel}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setPlayerFilterId(shot.playerId)}
                          className="text-slate-400 hover:text-slate-200 font-medium transition-colors whitespace-nowrap"
                        >
                          Sus tiros
                        </button>
                        {onOpenGamedayDate && (
                          <button
                            type="button"
                            onClick={() => onOpenGamedayDate(shot.date)}
                            className="text-orange-400 hover:text-orange-300 font-semibold transition-colors whitespace-nowrap"
                          >
                            Ver jornada →
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            /* Table Mode for Archive */
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[680px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className={STICKY_THEAD_CLASS}>
                    <tr className="border-b border-[#1E293B] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <SortableTh
                        label="Fecha"
                        active={archiveSortKey === 'date'}
                        asc={archiveSortAsc}
                        onSort={() => toggleArchiveSort('date')}
                        align="left"
                        className="px-3.5 py-2.5 whitespace-nowrap"
                      />
                      <SortableTh
                        label="Tipo"
                        active={archiveSortKey === 'shotType'}
                        asc={archiveSortAsc}
                        onSort={() => toggleArchiveSort('shotType')}
                        align="left"
                        className="px-3 py-2.5 whitespace-nowrap"
                      />
                      <SortableTh
                        label="Jugador"
                        active={archiveSortKey === 'player'}
                        asc={archiveSortAsc}
                        onSort={() => toggleArchiveSort('player')}
                        align="left"
                        className="px-3 py-2.5 whitespace-nowrap"
                      />
                      <SortableTh
                        label="Partido"
                        active={archiveSortKey === 'team'}
                        asc={archiveSortAsc}
                        onSort={() => toggleArchiveSort('team')}
                        align="left"
                        className="px-3 py-2.5 whitespace-nowrap"
                      />
                      <SortableTh
                        label="Reloj"
                        active={archiveSortKey === 'clock'}
                        asc={archiveSortAsc}
                        onSort={() => toggleArchiveSort('clock')}
                        align="right"
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      />
                      <SortableTh
                        label="Dist."
                        active={archiveSortKey === 'distance'}
                        asc={archiveSortAsc}
                        onSort={() => toggleArchiveSort('distance')}
                        align="right"
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      />
                      <SortableTh
                        label="Valor"
                        active={archiveSortKey === 'points'}
                        asc={archiveSortAsc}
                        onSort={() => toggleArchiveSort('points')}
                        align="right"
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      />
                      <SortableTh
                        label="Marcador"
                        active={archiveSortKey === 'score'}
                        asc={archiveSortAsc}
                        onSort={() => toggleArchiveSort('score')}
                        align="right"
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      />
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Jugada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {sortedArchiveShots.map((shot) => {
                      const badge = getShotBadgeMeta(shot.shotType);
                      return (
                        <tr
                          key={shot.id}
                          className="hover:bg-[#182338] transition-colors"
                        >
                          <td className="px-3.5 py-2.5 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                            <div>{formatShortDate(shot.date)}</div>
                            <div className="text-[10px] text-slate-500">{shot.seasonLabel}</div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${badge.surfaceCls}`}
                            >
                              {badge.shortLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => onInspectEntity('player', shot.playerId)}
                              className="inline-flex items-center gap-2 text-left group"
                            >
                              <PlayerAvatar
                                playerId={shot.playerId}
                                name={shot.fullPlayerName}
                                teamAbbr={shot.teamAbbr}
                                size="xs"
                              />
                              <span className="font-semibold text-slate-100 group-hover:text-orange-300 transition-colors whitespace-nowrap">
                                {shot.fullPlayerName}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-slate-200">
                              <TeamLogo abbr={shot.teamAbbr} size="xs" />
                              <span>{shot.teamAbbr}</span>
                              <span className="text-slate-500">{shot.isHome ? 'vs' : '@'}</span>
                              <TeamLogo abbr={shot.opponentAbbr} size="xs" />
                              <span>{shot.opponentAbbr}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-right whitespace-nowrap">
                            <span className={badge.textCls}>
                              {shot.periodLabel} · {formatClockLabel(shot.clockSeconds, shot.clock)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-right text-slate-300 whitespace-nowrap">
                            {shot.distanceFt ? `${shot.distanceFt.toFixed(1)} ft` : shot.points === 1 ? '15.0 ft' : '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-right text-slate-200 whitespace-nowrap">
                            +{shot.points} pts
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-right whitespace-nowrap">
                            <span
                              className={`font-semibold ${
                                shot.wonGame ? 'text-emerald-400' : 'text-sky-400'
                              }`}
                            >
                              {shot.finalScoreTeam}-{shot.finalScoreOpp}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-right max-w-xs">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-slate-300 truncate max-w-[230px]" title={shot.translatedDescription}>
                                {shot.translatedDescription}
                              </span>
                              {onOpenGamedayDate && (
                                <button
                                  type="button"
                                  onClick={() => onOpenGamedayDate(shot.date)}
                                  className="text-orange-400 hover:text-orange-300 font-semibold whitespace-nowrap shrink-0"
                                >
                                  Jornada →
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RANKING DE JUGADORES MÁS DECISIVOS */}
      {activeTab === 'players' && (
        <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Ranking de Jugadores ·{' '}
                {shotTypeFilter === 'buzzer_beater'
                  ? 'Buzzer Beaters (0.0s)'
                  : shotTypeFilter === 'game_winner'
                  ? 'Game Winners (≤10s)'
                  : shotTypeFilter === 'ot_tying_buzzer'
                  ? 'Empates sobre Bocina (OT)'
                  : 'Todos los Tiros Decisivos'}{' '}
                ({seasonFilter === 'all' ? '2025-27' : seasonFilter})
              </h3>
              <p className="text-xs text-slate-400">
                {shotTypeFilter === 'buzzer_beater'
                  ? 'Mostrando únicamente jugadores con al menos 1 Buzzer Beater ganador a 0.0s.'
                  : shotTypeFilter === 'game_winner'
                  ? 'Mostrando jugadores con Game Winners en los últimos ≤10s (incluye Buzzer Beaters ganadores).'
                  : shotTypeFilter === 'ot_tying_buzzer'
                  ? 'Mostrando jugadores que forzaron prórroga anotando sobre la bocina (0.0s).'
                  : 'Nota: Los Game Winners totales incluyen los Buzzer Beaters (0.0s) más canastas ganadoras en los últimos ≤10s.'}
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {playerLeaderboard.length} cerradores
            </span>
          </div>

          {playerLeaderboard.length === 0 ? (
            <div className="p-8 text-center space-y-2.5">
              <p className="text-xs text-slate-300 font-medium">
                No hay jugadores en el ranking con los filtros actuales.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {seasonFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSeasonFilter('all')}
                    className="px-3 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors"
                  >
                    Ampliar a todas (2025-27)
                  </button>
                )}
                {shotTypeFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => handleShotTypeFilterChange('all')}
                    className="px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] text-slate-200 rounded-lg hover:bg-[#182338] transition-colors"
                  >
                    Ver todos los tipos
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Mobile Cards (< md) */}
              <div className="md:hidden divide-y divide-[#1E293B]">
                {playerLeaderboard.map((row, idx) => {
                  const primaryCount =
                    shotTypeFilter === 'buzzer_beater'
                      ? row.buzzerBeaters
                      : shotTypeFilter === 'game_winner'
                      ? row.totalGameWinners
                      : shotTypeFilter === 'ot_tying_buzzer'
                      ? row.otTyingBuzzers
                      : row.totalHeroic;
                  const primaryTone =
                    shotTypeFilter === 'game_winner'
                      ? 'text-emerald-400'
                      : shotTypeFilter === 'ot_tying_buzzer'
                      ? 'text-sky-400'
                      : 'text-orange-400';
                  return (
                  <div
                    key={row.playerId}
                    onClick={() => onInspectEntity('player', row.playerId)}
                    className="p-3.5 space-y-2 hover:bg-[#182338] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs font-mono tabular-nums text-slate-500 w-5 shrink-0">
                          {idx + 1}
                        </span>
                        <PlayerAvatar
                          playerId={row.playerId}
                          name={row.name}
                          teamAbbr={row.teamAbbr}
                          showTeamBadge
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">
                            {row.name}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {row.teamAbbr} · {row.position} · Últ. {formatShortDate(row.lastDate)}
                          </p>
                        </div>
                      </div>
                      <span className={`text-base font-bold font-mono tabular-nums shrink-0 ${primaryTone}`}>
                        {primaryCount}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-center font-mono tabular-nums text-[11px] bg-[#0B1120] border border-[#1E293B] rounded-lg p-2">
                      <div>
                        <div className="text-slate-500 text-[10px]">BB 0.0s</div>
                        <div className="text-orange-300 font-semibold">{row.buzzerBeaters}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">GW ≤10s</div>
                        <div className="text-emerald-400 font-semibold">{row.totalGameWinners}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">Emp. OT</div>
                        <div className="text-sky-400 font-semibold">{row.otTyingBuzzers}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">Dist. Máx</div>
                        <div className="text-slate-200 font-semibold">
                          {row.maxDistanceFt > 0 ? `${row.maxDistanceFt.toFixed(0)} ft` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block overflow-x-auto max-h-[640px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className={STICKY_THEAD_CLASS}>
                    <tr className="border-b border-[#1E293B] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-3.5 py-2.5 w-10">#</th>
                      <SortableTh
                        label="Jugador"
                        active={playerSortKey === 'name'}
                        asc={playerSortAsc}
                        onSort={() => togglePlayerSort('name')}
                        align="left"
                        className="px-3 py-2.5 whitespace-nowrap"
                      />
                      <SortableTh
                        label="BB (0.0s)"
                        active={playerSortKey === 'buzzerBeaters'}
                        asc={playerSortAsc}
                        onSort={() => togglePlayerSort('buzzerBeaters')}
                        align="right"
                        helpKey="buzzerBeater"
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      />
                      <SortableTh
                        label="GW (≤10s)"
                        active={playerSortKey === 'totalGameWinners'}
                        asc={playerSortAsc}
                        onSort={() => togglePlayerSort('totalGameWinners')}
                        align="right"
                        helpKey="gameWinner"
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      />
                      <SortableTh
                        label="Empates OT"
                        active={playerSortKey === 'otTyingBuzzers'}
                        asc={playerSortAsc}
                        onSort={() => togglePlayerSort('otTyingBuzzers')}
                        align="right"
                        helpKey="otTyingBuzzer"
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      />
                      <SortableTh
                        label="Total Heroicos"
                        active={playerSortKey === 'totalHeroic'}
                        asc={playerSortAsc}
                        onSort={() => togglePlayerSort('totalHeroic')}
                        align="right"
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      />
                      <SortableTh
                        label="Dist. Máx"
                        active={playerSortKey === 'maxDistanceFt'}
                        asc={playerSortAsc}
                        onSort={() => togglePlayerSort('maxDistanceFt')}
                        align="right"
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      />
                      <SortableTh
                        label="Último Hito"
                        active={playerSortKey === 'lastDate'}
                        asc={playerSortAsc}
                        onSort={() => togglePlayerSort('lastDate')}
                        align="right"
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      />
                      <th className="px-3.5 py-2.5 text-right whitespace-nowrap">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {playerLeaderboard.map((row, idx) => (
                      <tr
                        key={row.playerId}
                        onClick={() => onInspectEntity('player', row.playerId)}
                        className="hover:bg-[#182338] cursor-pointer transition-colors"
                      >
                        <td className="px-3.5 py-2.5 font-mono tabular-nums text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <PlayerAvatar
                              playerId={row.playerId}
                              name={row.name}
                              teamAbbr={row.teamAbbr}
                              showTeamBadge
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-100 truncate">
                                {row.name}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {row.teamAbbr} · {row.position} · {row.threePointers} triples decisivos
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-orange-300">
                          {row.buzzerBeaters}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-400">
                          {row.totalGameWinners}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-sky-400">
                          {row.otTyingBuzzers}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-slate-100">
                          {row.totalHeroic}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300">
                          {row.maxDistanceFt > 0 ? `${row.maxDistanceFt.toFixed(1)} ft` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                          <div>{formatShortDate(row.lastDate)}</div>
                          <div className="text-[10px] text-slate-500">{row.lastSummary}</div>
                        </td>
                        <td
                          className="px-3.5 py-2.5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (shotTypeFilter === 'game_winner' && row.gameWinnersOnly === 0) {
                                setShotTypeFilter('all');
                              }
                              setPlayerFilterId(row.playerId);
                              setActiveTab('archive');
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-[#0B1120] hover:bg-[#1E293B] border border-[#1E293B] text-orange-300 transition-colors"
                          >
                            Ver tiros ({row.totalHeroic})
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* TAB 3: RANKING DE FRANQUICIAS (A FAVOR VS EN CONTRA) */}
      {activeTab === 'teams' && (
        <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                <span>Balance de Cierres por Franquicia ({seasonFilter === 'all' ? '2025-27' : seasonFilter})</span>
                <MetricInfoTooltip helpKey="heroicBalance" align="left" />
              </h3>
              <p className="text-xs text-slate-400">
                Compara los tiros ganadores anotados a favor frente a los encajados en contra en los últimos 10 segundos.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {teamLeaderboard.length} franquicias
            </span>
          </div>

          {teamLeaderboard.length === 0 ? (
            <div className="p-8 text-center space-y-2.5">
              <p className="text-xs text-slate-300 font-medium">
                No hay franquicias con registros en esta combinación de filtros.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {seasonFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSeasonFilter('all')}
                    className="px-3 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors"
                  >
                    Ampliar a todas (2025-27)
                  </button>
                )}
                {shotTypeFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => handleShotTypeFilterChange('all')}
                    className="px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] text-slate-200 rounded-lg hover:bg-[#182338] transition-colors"
                  >
                    Ver todos los tipos
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[640px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className={STICKY_THEAD_CLASS}>
                  <tr className="border-b border-[#1E293B] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-3.5 py-2.5 w-10">#</th>
                    <SortableTh
                      label="Franquicia"
                      active={teamSortKey === 'teamName'}
                      asc={teamSortAsc}
                      onSort={() => toggleTeamSort('teamName')}
                      align="left"
                      className="px-3 py-2.5 whitespace-nowrap"
                    />
                    <SortableTh
                      label="BB (0.0s)"
                      active={teamSortKey === 'buzzerBeatersFor'}
                      asc={teamSortAsc}
                      onSort={() => toggleTeamSort('buzzerBeatersFor')}
                      align="right"
                      helpKey="buzzerBeater"
                      className="px-3 py-2.5 whitespace-nowrap text-right"
                    />
                    <SortableTh
                      label="GW (≤10s)"
                      active={teamSortKey === 'gameWinnersFor'}
                      asc={teamSortAsc}
                      onSort={() => toggleTeamSort('gameWinnersFor')}
                      align="right"
                      helpKey="gameWinner"
                      className="px-3 py-2.5 whitespace-nowrap text-right"
                    />
                    <SortableTh
                      label="Empates OT"
                      active={teamSortKey === 'otTyingFor'}
                      asc={teamSortAsc}
                      onSort={() => toggleTeamSort('otTyingFor')}
                      align="right"
                      helpKey="otTyingBuzzer"
                      className="px-3 py-2.5 whitespace-nowrap text-right"
                    />
                    <SortableTh
                      label="A Favor"
                      active={teamSortKey === 'totalFor'}
                      asc={teamSortAsc}
                      onSort={() => toggleTeamSort('totalFor')}
                      align="right"
                      className="px-3 py-2.5 whitespace-nowrap text-right"
                    />
                    <SortableTh
                      label="Recibidos"
                      active={teamSortKey === 'shotsAgainst'}
                      asc={teamSortAsc}
                      onSort={() => toggleTeamSort('shotsAgainst')}
                      align="right"
                      className="px-3 py-2.5 whitespace-nowrap text-right"
                    />
                    <SortableTh
                      label="Balance Neto"
                      active={teamSortKey === 'netBalance'}
                      asc={teamSortAsc}
                      onSort={() => toggleTeamSort('netBalance')}
                      align="right"
                      helpKey="heroicBalance"
                      className="px-3.5 py-2.5 whitespace-nowrap text-right"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {teamLeaderboard.map((row, idx) => (
                    <tr
                      key={row.teamId}
                      onClick={() => onInspectEntity('team', row.teamId)}
                      className="hover:bg-[#182338] cursor-pointer transition-colors"
                    >
                      <td className="px-3.5 py-2.5 font-mono tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <TeamLogo abbr={row.teamAbbr} size="sm" />
                          <div>
                            <div className="font-semibold text-slate-100 whitespace-nowrap">
                              {row.teamName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {row.teamAbbr} · Conf. {row.conference}
                              {row.lastForDate ? ` · Últ. a favor ${formatShortDate(row.lastForDate)}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-orange-300">
                        {row.buzzerBeatersFor}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-400">
                        {row.gameWinnersFor}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-sky-400">
                        {row.otTyingFor}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-slate-100">
                        {row.totalFor}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-rose-300">
                        {row.shotsAgainst}
                        {row.buzzerAgainst > 0 && (
                          <span className="ml-1 text-[10px] text-rose-400">
                            ({row.buzzerAgainst} BB)
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-bold">
                        <span
                          className={
                            row.netBalance > 0
                              ? 'text-emerald-400'
                              : row.netBalance < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }
                        >
                          {row.netBalance > 0 ? `+${row.netBalance}` : row.netBalance}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: GUÍA DIDÁCTICA Y CONTEXTO HISTÓRICO NBA */}
      {activeTab === 'history' && (
        <div className="space-y-5">
          {/* 3-Column Educational Taxonomy */}
          <section className="grid grid-cols-1 md:grid-cols-3 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y md:divide-y-0 md:divide-x divide-[#1E293B]">
            <div className="p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-orange-300">
                  <Zap className="w-4 h-4 shrink-0" />
                  <span>Buzzer Beater (0.0s)</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">Reloj = 0.0s</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                El balón sale de la mano del atacante antes de que se encienda la luz roja del tablero y entra con el reloj ya a cero. Da la victoria directa sin dejar tiempo al rival para sacar.
              </p>
              <p className="text-[11px] font-mono text-slate-400">
                Regla: Si pasa por el aro antes de 0.1s pero deja algo de reloj, es un Game Winner, no un Buzzer Beater puro.
              </p>
            </div>

            <div className="p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-300">
                  <Target className="w-4 h-4 shrink-0" />
                  <span>Game Winner (≤10s)</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">Reloj ≤ 10.0s</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Canasta o tiro libre anotado en los últimos 10 segundos del 4º cuarto o prórroga que pone por delante al equipo ganador hasta el bocinazo final.
              </p>
              <p className="text-[11px] font-mono text-slate-400">
                Nota: Todos los Buzzer Beaters ganadores cuentan dentro de los Game Winners totales, pero no al revés.
              </p>
            </div>

            <div className="p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-300">
                  <Timer className="w-4 h-4 shrink-0" />
                  <span>Empate sobre Bocina (OT)</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">4Q / OT = 0.0s</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Lanzamiento imposible a 0.0s cuando el equipo perdía por 2 o 3 puntos, que empata exactamente el marcador y obliga a jugar una prórroga de 5 minutos extra.
              </p>
              <p className="text-[11px] font-mono text-slate-400">
                Curiosidad: Un equipo puede anotar un empate sobre la bocina y después acabar ganando o perdiendo en la prórroga.
              </p>
            </div>
          </section>

          {/* Historical NBA Benchmarks + Live Leaders Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <section className="lg:col-span-7 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1E293B] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-orange-400 shrink-0" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    Referencias Históricas Oficiales de la NBA
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Archivo histórico NBA
                </span>
              </div>
              <div className="divide-y divide-[#1E293B]">
                {NBA_HISTORICAL_BENCHMARKS.map((item) => (
                  <div
                    key={item.player}
                    className="px-4 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono tabular-nums text-slate-500">
                          #{item.rank}
                        </span>
                        <span className="text-sm font-semibold text-slate-100">
                          {item.player}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          · {item.era}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {item.milestoneNote}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-bold text-orange-300 whitespace-nowrap shrink-0">
                      {item.buzzerBeaters}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-5 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-[#1E293B] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-emerald-400 shrink-0" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    Top Actual de RadarNBA (2025-27)
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Snapshot en vivo
                </span>
              </div>

              <div className="divide-y divide-[#1E293B] flex-1">
                {playerLeaderboard.slice(0, 6).map((row, idx) => (
                  <div
                    key={row.playerId}
                    onClick={() => onInspectEntity('player', row.playerId)}
                    className="px-4 py-2.5 hover:bg-[#182338] cursor-pointer transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-mono tabular-nums text-slate-500 w-4">
                        {idx + 1}
                      </span>
                      <PlayerAvatar
                        playerId={row.playerId}
                        name={row.name}
                        teamAbbr={row.teamAbbr}
                        size="xs"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-100 truncate">
                          {row.name}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {row.teamAbbr} · {row.buzzerBeaters} BB · {row.totalGameWinners} GW
                        </p>
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-bold text-emerald-400 shrink-0">
                      {row.totalHeroic} hitos
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-3.5 bg-[#0B1120] border-t border-[#1E293B] flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">
                  Ver todos los cierres jugada a jugada
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('archive')}
                  className="text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap"
                >
                  Ir al Archivo →
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
