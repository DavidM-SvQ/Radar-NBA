import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  Check,
  ChevronDown,
  ClipboardPaste,
  Cloud,
  Download,
  Edit3,
  Eye,
  Info,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type {
  FantasyAbsenceTier,
  FantasyEspnSyncPayload,
  FantasyGameCorrection,
  FantasyInjurySeverity,
  FantasyManualLeagueState,
  FantasyPlayerInjuryAlert,
  FantasyProjectionMode,
  FantasyRosterContract,
  FantasyStorageMode,
  FantasyTeamGameSlot,
  FantasyWeekWindow,
  PlayerSummary,
  TeamSummary,
  TrendBreakoutAlert,
} from '../types/nba';
import { formatShortDate, normalizeSearchText } from '../utils/analytics';
import { fetchBootstrapClient } from '../utils/bootstrapWireCodec';
import {
  OFFICIAL_LEAGUE_RULES,
  analyzePlayerAvailabilityContext,
  computeOfficialGameFptsBreakdown,
  computePlayerOfficialFantasyStats,
  computeWeeklyLockProjection,
  evaluateWaiverRoleBreakout,
  formatFptsExact,
  normalizePlayerLookupKey,
  parseCopiedEspnTextToPlayers,
} from '../utils/fantasyScoring';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import {
  buildComparisonSnapshotBlob,
  buildTableSnapshotBlob,
} from '../utils/exportImageCard';
import { SortableTh } from './MetricUiHelpers';
import { STICKY_THEAD_CLASS, sortRows, useTableSort } from '../utils/tableSort';
import { buildAdminAuthHeaders } from '../utils/adminAuthClient';
import {
  addDaysIso,
  buildStaticFantasyWeeks,
  countRemainingGamesForTeam,
  formatDayShortEs,
  getEasternTodayIso,
} from '../utils/staticSchedule';

const OFFICIAL_SCORING_CATEGORIES_ROWS: Array<{
  action: string;
  code: string;
  fptsVal: number;
  fptsDisplay: string;
  tone: 'positive' | 'negative';
  description: string;
}> = [
  {
    action: 'Tiro de campo anotado',
    code: 'FGM',
    fptsVal: 2.0,
    fptsDisplay: '+2.0',
    tone: 'positive',
    description: 'Suma +2.0 por toda canasta en juego (de 2 o de 3 puntos).',
  },
  {
    action: 'Tiro de campo fallado',
    code: 'FGMI',
    fptsVal: -1.0,
    fptsDisplay: '-1.0',
    tone: 'negative',
    description: 'Calculado como FGA − FGM. Un tiro de 2 fallado resta −1.0 neto.',
  },
  {
    action: 'Tiro libre anotado',
    code: 'FTM',
    fptsVal: 1.0,
    fptsDisplay: '+1.0',
    tone: 'positive',
    description: 'Suma +1.0 por cada tiro libre convertido.',
  },
  {
    action: 'Tiro libre fallado',
    code: 'FTMI',
    fptsVal: -1.0,
    fptsDisplay: '-1.0',
    tone: 'negative',
    description: 'Calculado como FTA − FTM. Penaliza la ineficiencia desde la línea.',
  },
  {
    action: 'Triple anotado (Bonus)',
    code: '3PM',
    fptsVal: 1.0,
    fptsDisplay: '+1.0',
    tone: 'positive',
    description:
      'Acumulativo al FGM: cada triple encestado vale +2.0 (FGM) + 1.0 (3PM) = +3.0 FPTS.',
  },
  {
    action: 'Triple fallado (Compensación)',
    code: '3PMI',
    fptsVal: 0.5,
    fptsDisplay: '+0.5',
    tone: 'positive',
    description:
      'Calculado como 3PA − 3PM: suaviza el fallo exterior (−1.0 FGMI + 0.5 3PMI = −0.5 FPTS neto).',
  },
  {
    action: 'Rebote ofensivo',
    code: 'OREB',
    fptsVal: 1.5,
    fptsDisplay: '+1.5',
    tone: 'positive',
    description: 'Premia las segundas oportunidades generadas en aro rival.',
  },
  {
    action: 'Rebote defensivo',
    code: 'DREB',
    fptsVal: 0.75,
    fptsDisplay: '+0.75',
    tone: 'positive',
    description: 'Suma +0.75 FPTS por cada rebote defensivo cerrado.',
  },
  {
    action: 'Asistencia',
    code: 'AST',
    fptsVal: 1.5,
    fptsDisplay: '+1.5',
    tone: 'positive',
    description: 'Suma +1.5 FPTS por pase directo de canasta.',
  },
  {
    action: 'Robo de balón',
    code: 'STL',
    fptsVal: 2.5,
    fptsDisplay: '+2.5',
    tone: 'positive',
    description: 'Alto impacto defensivo por recuperación limpia.',
  },
  {
    action: 'Tapón',
    code: 'BLK',
    fptsVal: 2.5,
    fptsDisplay: '+2.5',
    tone: 'positive',
    description: 'Alto impacto de protección de aro (+2.5 FPTS por tapón).',
  },
  {
    action: 'Pérdida de balón',
    code: 'TO',
    fptsVal: -2.0,
    fptsDisplay: '-2.0',
    tone: 'negative',
    description: 'Resta −2.0 FPTS por cada balón perdido.',
  },
  {
    action: 'Expulsión del partido',
    code: 'EJ',
    fptsVal: -5.0,
    fptsDisplay: '-5.0',
    tone: 'negative',
    description: 'Penalización disciplinaria por descalificación o doble técnica.',
  },
];

export type FantasyTab = 'lineup' | 'waivers' | 'trades' | 'injuries_rules' | 'rules';

interface FantasyEspnAssistantViewProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
  trendBreakouts?: TrendBreakoutAlert[];
  onOpenRadarMinutesUsage?: () => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  initialTab?: FantasyTab;
  onTabChange?: (tab: FantasyTab) => void;
}

type ManagerModalTab = 'my_team' | 'rivals_manager' | 'backup';

const STORAGE_FANTASY_PERMANENT_KEY = 'radarnba_fantasy_manual_league_permanent';
const LEGACY_STORAGE_KEYS = [
  'radarnba_fantasy_espn_445109163_t11_v3',
  'radarnba_fantasy_espn_445109163_t11_v2',
  'radarnba_fantasy_espn_445109163_t11_v1',
];

const DEFAULT_RIVAL_COUNT = 12;

function normalizeRosterSlots(contracts: FantasyRosterContract[]): FantasyRosterContract[] {
  const unique: FantasyRosterContract[] = [];
  const seen = new Set<string>();
  for (const c of contracts) {
    if (c.playerId && !seen.has(c.playerId) && unique.length < OFFICIAL_LEAGUE_RULES.maxContracts) {
      seen.add(c.playerId);
      unique.push({ playerId: c.playerId, slot: c.slot === 'bench' ? 'bench' : 'starter' });
    }
  }
  let starterCount = 0;
  return unique.map((c) => {
    if (c.slot === 'starter' && starterCount < OFFICIAL_LEAGUE_RULES.activeStarters) {
      starterCount += 1;
      return { playerId: c.playerId, slot: 'starter' };
    }
    return { playerId: c.playerId, slot: 'bench' };
  });
}

function parseStoredFantasyState(rawJson: string | null, fallbackUpdatedAt: number): FantasyManualLeagueState | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const myTeamName =
      typeof parsed.myTeamName === 'string' && parsed.myTeamName.trim()
        ? parsed.myTeamName.trim().slice(0, 80)
        : 'Mi Equipo Fantasy';

    const rawRoster: FantasyRosterContract[] = Array.isArray(parsed.roster)
      ? parsed.roster
          .filter(
            (r): r is FantasyRosterContract =>
              Boolean(r && typeof (r as FantasyRosterContract).playerId === 'string')
          )
          .map((r) => ({
            playerId: String(r.playerId).trim(),
            slot: r.slot === 'bench' ? 'bench' : 'starter',
          }))
      : [];

    const takenRivalIds = Array.isArray(parsed.takenRivalIds)
      ? Array.from(new Set(parsed.takenRivalIds.map((x) => String(x || '').trim()).filter(Boolean)))
      : [];

    const rivalRosters: Record<string, string[]> = {};
    if (parsed.rivalRosters && typeof parsed.rivalRosters === 'object') {
      for (const [k, v] of Object.entries(parsed.rivalRosters as Record<string, unknown>)) {
        if (/^team_\d+$/.test(k) && Array.isArray(v)) {
          rivalRosters[k] = Array.from(
            new Set(v.map((x) => String(x || '').trim()).filter(Boolean))
          );
        } else if (Array.isArray(v) && k.trim()) {
          // Migrate any legacy non-canonical key if present
          const numMatch = k.match(/(\d+)/);
          const normKey = numMatch ? `team_${numMatch[1]}` : 'team_1';
          const prev = rivalRosters[normKey] || [];
          rivalRosters[normKey] = Array.from(
            new Set([...prev, ...v.map((x) => String(x || '').trim()).filter(Boolean)])
          );
        }
      }
    }

    const rivalTeamNames: Record<string, string> = {};
    if (parsed.rivalTeamNames && typeof parsed.rivalTeamNames === 'object') {
      for (const [k, v] of Object.entries(parsed.rivalTeamNames as Record<string, unknown>)) {
        if (typeof v !== 'string') continue;
        if (/^team_\d+$/.test(k)) {
          rivalTeamNames[k] = v.slice(0, 80);
        } else {
          const numMatch = k.match(/(\d+)/);
          if (numMatch) {
            const normKey = `team_${numMatch[1]}`;
            if (!rivalTeamNames[normKey]) rivalTeamNames[normKey] = v.slice(0, 80);
          }
        }
      }
    }

    const gameCorrections: Record<string, FantasyGameCorrection> = {};
    if (parsed.gameCorrections && typeof parsed.gameCorrections === 'object') {
      for (const [k, v] of Object.entries(parsed.gameCorrections as Record<string, unknown>)) {
        if (!k || !v || typeof v !== 'object') continue;
        const delta =
          typeof (v as { fptsDelta?: unknown }).fptsDelta === 'number' &&
          Number.isFinite((v as { fptsDelta: number }).fptsDelta)
            ? (v as { fptsDelta: number }).fptsDelta
            : 0;
        const reason =
          typeof (v as { reason?: unknown }).reason === 'string'
            ? (v as { reason: string }).reason.slice(0, 150)
            : '';
        if (Math.abs(delta) > 0.001 || reason) {
          gameCorrections[k] = {
            fptsDelta: Number(delta.toFixed(2)),
            reason,
            updatedAt:
              typeof (v as { updatedAt?: unknown }).updatedAt === 'number'
                ? (v as { updatedAt: number }).updatedAt
                : Date.now(),
          };
        }
      }
    }

    // Default seed for Ajay Mitchell vs Denver (+2.5 FPTS to match official ESPN 213.25)
    if (!gameCorrections['1642349:0022600007'] && !gameCorrections['1642349:2026-10-22']) {
      gameCorrections['1642349:0022600007'] = {
        fptsDelta: 2.5,
        reason: '6 stocks en ESPN/BBRef vs 5 en NBA.com (+2.5 FPTS)',
        updatedAt: Date.now(),
      };
      gameCorrections['1642349:2026-10-22'] = {
        fptsDelta: 2.5,
        reason: '6 stocks en ESPN/BBRef vs 5 en NBA.com (+2.5 FPTS)',
        updatedAt: Date.now(),
      };
    }

    const updatedAt =
      typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : fallbackUpdatedAt;

    return {
      updatedAt,
      myTeamName,
      roster: normalizeRosterSlots(rawRoster),
      takenRivalIds,
      rivalRosters,
      rivalTeamNames,
      gameCorrections,
    };
  } catch {
    return null;
  }
}

function hasAnyUserLeagueData(st: FantasyManualLeagueState | null | undefined): boolean {
  if (!st) return false;
  if (st.roster.length > 0) return true;
  if (st.takenRivalIds.length > 0) return true;
  if (st.myTeamName && st.myTeamName !== 'Mi Equipo Fantasy') return true;
  if (Object.values(st.rivalRosters || {}).some((arr) => Array.isArray(arr) && arr.length > 0)) {
    return true;
  }
  if (Object.values(st.rivalTeamNames || {}).some((n) => Boolean(n && n.trim()))) {
    return true;
  }
  if (st.gameCorrections && Object.keys(st.gameCorrections).length > 0) {
    return true;
  }
  return false;
}

function loadInitialFantasyLeagueState(): FantasyManualLeagueState {
  try {
    const permanentRaw = localStorage.getItem(STORAGE_FANTASY_PERMANENT_KEY);
    const permanentParsed = parseStoredFantasyState(permanentRaw, 1);
    if (permanentParsed && (hasAnyUserLeagueData(permanentParsed) || permanentParsed.updatedAt > 0)) {
      return permanentParsed;
    }

    // Migrate seamlessly from any previous versioned key so existing saved data is never lost
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      const migrated = parseStoredFantasyState(legacyRaw, Date.now());
      if (migrated && hasAnyUserLeagueData(migrated)) {
        localStorage.setItem(STORAGE_FANTASY_PERMANENT_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch {
    // Ignore storage errors
  }

  return {
    updatedAt: 0,
    myTeamName: 'Mi Equipo Fantasy',
    roster: [],
    takenRivalIds: [],
    rivalRosters: {},
    rivalTeamNames: {},
    gameCorrections: {
      '1642349:0022600007': {
        fptsDelta: 2.5,
        reason: '6 stocks en ESPN/BBRef vs 5 en NBA.com (+2.5 FPTS)',
        updatedAt: Date.now(),
      },
      '1642349:2026-10-22': {
        fptsDelta: 2.5,
        reason: '6 stocks en ESPN/BBRef vs 5 en NBA.com (+2.5 FPTS)',
        updatedAt: Date.now(),
      },
    },
  };
}

function renderScheduleInfoIcon(teamSched: { gamesCount: number; b2bCount: number; games: FantasyTeamGameSlot[] }) {
  if (!teamSched || !teamSched.games || teamSched.games.length === 0) {
    return <span className="text-[10px] text-slate-500 font-mono">Sin partidos</span>;
  }
  const summaryTooltip = teamSched.games
    .map((g) => `${g.dayShortEs || g.dateIso} ${g.isHome ? 'vs' : '@'}${g.opponentAbbr}`)
    .join(' · ');

  return (
    <div className="relative group/sched inline-flex items-center">
      <button
        type="button"
        className="p-0.5 rounded text-slate-400 hover:text-orange-400 focus:outline-none transition-colors cursor-help"
        title={summaryTooltip}
        aria-label="Ver detalle de partidos de la semana"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 hidden group-hover/sched:flex flex-col z-[80] w-52 p-2.5 rounded-lg bg-[#0F172A] border border-[#1E293B] shadow-2xl text-[11px] pointer-events-none">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#1E293B] mb-1.5">
          <span className="font-bold text-orange-400 text-xs">Partidos Semana</span>
          <span className="font-mono text-[10px] text-slate-400">
            {teamSched.gamesCount} PJ{teamSched.b2bCount > 0 ? ` · ${teamSched.b2bCount} B2B` : ''}
          </span>
        </div>
        <div className="space-y-1 text-[11px]">
          {teamSched.games.map((g, idx) => (
            <div key={`${g.gameId || idx}-${g.dateIso}-${g.opponentAbbr}`} className="flex items-center justify-between font-mono">
              <span className="text-slate-400">{g.dayShortEs || g.dateIso}</span>
              <span className={g.isHome ? 'text-emerald-400 font-semibold' : 'text-slate-200 font-medium'}>
                {g.isHome ? 'vs ' : '@ '}{g.opponentAbbr}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const renderScheduleBadges = renderScheduleInfoIcon;

const WAIVER_QUICK_FILTERS = [
  {
    id: 'netGainWeek' as const,
    label: 'Ganancia Semanal',
    info: 'Ordena los agentes libres por los puntos netos adicionales (+FPTS) que sumarían a tu alineación en la semana activa en comparación con cortar a tu jugador prescindible.',
  },
  {
    id: 'streamingRole' as const,
    label: 'Streaming Rol/Huecos',
    info: 'Prioriza agentes libres que cubren días con huecos en tu quinteto titular y además se benefician de aumento de minutos/uso por bajas de titulares en su equipo NBA.',
  },
  {
    id: 'formDelta' as const,
    label: 'Explosión Últ. 5 PJ',
    info: 'Ordena por el mejor momento de forma reciente: diferencia positiva entre el promedio de sus últimos 5 partidos y su media global de la temporada.',
  },
  {
    id: 'seasonAvg' as const,
    label: 'Media FPTS/PJ',
    info: 'Ordena por el promedio oficial de puntos Fantasy por partido disputado a lo largo de toda la temporada 2026-27.',
  },
] as const;

const round2 = (val: number): number => Math.round(val * 100) / 100;

function computePlayerRecentWindowStats(
  player: PlayerSummary,
  gameCorrections?: Record<string, { fptsDelta: number; reason?: string }>
) {
  const allGames = player.games || [];
  const g2027 = allGames.filter((g) => g.seasonLabel === '2026-27');
  const gamesDesc = [...g2027].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const evaluatedGames = gamesDesc.map((g) => {
    const base = computeOfficialGameFptsBreakdown(g, 0);
    const corr =
      gameCorrections?.[`${player.id}:${g.eventId}`] ||
      gameCorrections?.[`${player.id}:${g.date}`];
    const totalFpts =
      corr && typeof corr.fptsDelta === 'number' && Number.isFinite(corr.fptsDelta)
        ? round2(base.totalFpts + corr.fptsDelta)
        : base.totalFpts;
    return {
      game: g,
      totalFpts,
      breakdown: base,
    };
  });

  const refDateIso = '2026-11-08';
  const d7Iso = addDaysIso(refDateIso, -6);
  const d15Iso = addDaysIso(refDateIso, -14);
  const d30Iso = addDaysIso(refDateIso, -29);

  const games7d = evaluatedGames.filter(
    (x) => x.game.date >= d7Iso && x.game.date <= refDateIso
  );
  const games15d = evaluatedGames.filter(
    (x) => x.game.date >= d15Iso && x.game.date <= refDateIso
  );
  const games30d = evaluatedGames.filter(
    (x) => x.game.date >= d30Iso && x.game.date <= refDateIso
  );

  const sumFpts = (arr: typeof evaluatedGames) =>
    arr.reduce((acc, curr) => acc + curr.totalFpts, 0);

  const total7d = round2(sumFpts(games7d));
  const avg7d =
    games7d.length > 0
      ? round2(total7d / games7d.length)
      : evaluatedGames.length > 0
      ? evaluatedGames[0].totalFpts
      : 0;

  const total15d = round2(sumFpts(games15d));
  const avg15d =
    games15d.length > 0 ? round2(total15d / games15d.length) : avg7d;

  const total30d = round2(sumFpts(games30d));
  const avg30d =
    games30d.length > 0 ? round2(total30d / games30d.length) : avg15d;

  return {
    gamesDesc: evaluatedGames,
    stats7d: { total: total7d, count: games7d.length, avg: avg7d },
    stats15d: { total: total15d, count: games15d.length, avg: avg15d },
    stats30d: { total: total30d, count: games30d.length, avg: avg30d },
  };
}


export function FantasyEspnAssistantView({
  players,
  teams,
  trendBreakouts = [],
  onOpenRadarMinutesUsage,
  onInspectEntity,
  initialTab = 'lineup',
  onTabChange,
}: FantasyEspnAssistantViewProps) {
  const [activeTab, setActiveTab] = useState<FantasyTab>(() => initialTab);
  const [nbaContext, setNbaContext] = useState<FantasyEspnSyncPayload | null>(null);

  useEffect(() => {
    setActiveTab((prev) => (prev === initialTab ? prev : initialTab));
  }, [initialTab]);

  const handleSelectFantasyTab = useCallback(
    (nextTab: FantasyTab) => {
      setActiveTab((prev) => {
        if (prev !== nextTab) {
          onTabChange?.(nextTab);
        }
        return nextTab;
      });
    },
    [onTabChange]
  );
  const [contextLoading, setContextLoading] = useState<boolean>(true);
  const [contextRefreshing, setContextRefreshing] = useState<boolean>(false);
  const [selectedWeekId, setSelectedWeekId] = useState<FantasyWeekWindow['id']>('current');

  // Ensure 2026-27 games are always available for Fantasy scoring even if user set global seasonMode='2026'
  const [fallbackPlayers2027, setFallbackPlayers2027] = useState<PlayerSummary[] | null>(null);

  const has2027GamesInProp = useMemo(
    () => players.some((p) => p.games?.some((g) => g.seasonLabel === '2026-27')),
    [players]
  );

  useEffect(() => {
    if (players.length > 0 && !has2027GamesInProp && !fallbackPlayers2027) {
      void (async () => {
        try {
          const data = await fetchBootstrapClient('continuous');
          if (Array.isArray(data.players) && data.players.length > 0) {
            setFallbackPlayers2027(data.players);
          }
        } catch {
          // Keep prop players if fetch fails
        }
      })();
    }
  }, [players, has2027GamesInProp, fallbackPlayers2027]);

  const effectivePlayers = useMemo(() => {
    if (has2027GamesInProp) return players;
    return fallbackPlayers2027 && fallbackPlayers2027.length > 0 ? fallbackPlayers2027 : players;
  }, [has2027GamesInProp, fallbackPlayers2027, players]);

  // Permanent Manual League State (Browser LocalStorage + Upstash Redis Cloud / Server Disk)
  const [leagueState, setLeagueState] = useState<FantasyManualLeagueState>(() =>
    loadInitialFantasyLeagueState()
  );
  const [diskSaveStatus, setDiskSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [storageMode, setStorageMode] = useState<FantasyStorageMode | null>(null);
  const [cloudSyncFeedback, setCloudSyncFeedback] = useState<string | null>(null);
  const reconciledWithDiskRef = useRef<boolean>(false);
  const savingInFlightCountRef = useRef<number>(0);
  const lastVisibilityCheckRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const persistStateToServerDisk = useCallback(async (stateToSave: FantasyManualLeagueState): Promise<boolean> => {
    savingInFlightCountRef.current += 1;
    setDiskSaveStatus('saving');
    try {
      const res = await fetch('/api/nba/fantasy/manual-state', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(stateToSave),
      });
      if (!res.ok) {
        setDiskSaveStatus('error');
        return false;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        state?: FantasyManualLeagueState;
        storageMode?: FantasyStorageMode;
      };
      if (data.storageMode) {
        setStorageMode(data.storageMode);
      }
      const serverUpdatedAt = data.state?.updatedAt;
      if (typeof serverUpdatedAt === 'number' && serverUpdatedAt >= stateToSave.updatedAt) {
        setLeagueState((curr) => {
          if (curr.updatedAt > serverUpdatedAt) return curr;
          const aligned = { ...curr, updatedAt: serverUpdatedAt };
          try {
            localStorage.setItem(STORAGE_FANTASY_PERMANENT_KEY, JSON.stringify(aligned));
          } catch {
            // Ignore storage errors
          }
          return aligned;
        });
      }
      setDiskSaveStatus('saved');
      return true;
    } catch {
      // LocalStorage already holds the exact copy if offline
      setDiskSaveStatus('error');
      return false;
    } finally {
      savingInFlightCountRef.current = Math.max(0, savingInFlightCountRef.current - 1);
    }
  }, []);

  const commitLeagueState = useCallback(
    (updater: (prev: FantasyManualLeagueState) => FantasyManualLeagueState) => {
      setLeagueState((prev) => {
        const computed = updater(prev);
        const next: FantasyManualLeagueState = {
          ...computed,
          roster: normalizeRosterSlots(computed.roster),
          updatedAt: Date.now(),
        };
        try {
          localStorage.setItem(STORAGE_FANTASY_PERMANENT_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }
        void persistStateToServerDisk(next);
        return next;
      });
    },
    [persistStateToServerDisk]
  );

  // Modal & Manual Manager State
  const [rosterModalOpen, setRosterModalOpen] = useState<boolean>(false);
  const [managerTab, setManagerTab] = useState<ManagerModalTab>('my_team');
  const [rosterSearchQuery, setRosterSearchQuery] = useState<string>('');
  const [myTeamPasteOpen, setMyTeamPasteOpen] = useState<boolean>(false);
  const [myTeamPasteBuffer, setMyTeamPasteBuffer] = useState<string>('');
  const [myTeamPasteFeedback, setMyTeamPasteFeedback] = useState<string | null>(null);

  // Rival Team Manager State
  const [selectedRivalTeamId, setSelectedRivalTeamId] = useState<string>('team_1');
  const [extraRivalSlotsCount, setExtraRivalSlotsCount] = useState<number>(DEFAULT_RIVAL_COUNT);
  const [rivalSearchQuery, setRivalSearchQuery] = useState<string>('');
  const [rivalPasteBuffer, setRivalPasteBuffer] = useState<string>('');
  const [rivalPasteFeedback, setRivalPasteFeedback] = useState<string | null>(null);

  // Smart Injury & B2B Weekly Projection Mode
  const [projectionMode, setProjectionMode] = useState<FantasyProjectionMode>('smart');

  // Waiver Wire Filters & Add/Drop Simulator State
  const [waiverQuery, setWaiverQuery] = useState<string>('');
  const [waiverPosFilter, setWaiverPosFilter] = useState<'ALL' | 'G' | 'F' | 'C'>('ALL');
  const [waiverMinGames, setWaiverMinGames] = useState<number>(0);
  const [waiverOnlyRoleBreakouts, setWaiverOnlyRoleBreakouts] = useState<boolean>(false);
  const [waiverSortBy, setWaiverSortBy] = useState<
    'netGainWeek' | 'streamingRole' | 'formDelta' | 'seasonAvg'
  >('netGainWeek');
  const [selectedDropPlayerId, setSelectedDropPlayerId] = useState<string>('');
  const [actionBannerMsg, setActionBannerMsg] = useState<string | null>(null);
  const [injuryTierFilter, setInjuryTierFilter] = useState<
    'all' | 'punctual_b2b' | 'long_term'
  >('all');

  // Table Column Interactive Sorting State
  type RosterSortKey =
    | 'slot'
    | 'name'
    | 'severity'
    | 'gamesCount'
    | 'seasonTotalFpts'
    | 'seasonAvgFpts'
    | 'last5AvgFpts'
    | 'rawFormulaFpts'
    | 'lockAdjustedFpts'
    | 'action';
  const [rosterSortKey, setRosterSortKey] = useState<RosterSortKey>('lockAdjustedFpts');
  const [rosterSortAsc, setRosterSortAsc] = useState<boolean>(false);

  const handleRosterSort = (key: RosterSortKey) => {
    if (rosterSortKey === key) {
      setRosterSortAsc(!rosterSortAsc);
    } else {
      setRosterSortKey(key);
      setRosterSortAsc(key === 'name' || key === 'severity' || key === 'slot');
    }
  };

  type WaiverSortKey =
    | 'default'
    | 'name'
    | 'seasonTotalFpts'
    | 'seasonAvgFpts'
    | 'gamesNextWeek'
    | 'fpts7d'
    | 'fpts15d'
    | 'fpts30d'
    | 'netWeekGain';
  const [waiverTableSortKey, setWaiverTableSortKey] = useState<WaiverSortKey>('default');
  const [waiverTableSortAsc, setWaiverTableSortAsc] = useState<boolean>(false);

  const handleWaiverTableSort = (key: WaiverSortKey) => {
    if (waiverTableSortKey === key) {
      setWaiverTableSortAsc(!waiverTableSortAsc);
    } else {
      setWaiverTableSortKey(key);
      setWaiverTableSortAsc(key === 'name');
    }
  };

  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  // Hover Breakdown Popover state for Free Agents
  const [hoveredBreakdown, setHoveredBreakdown] = useState<{
    playerId: string;
    top: number;
    right: number;
  } | null>(null);

  // Player Game Logs Breakdown Modal State & Game Corrections
  const [inspectedPlayerForLogsId, setInspectedPlayerForLogsId] = useState<string | null>(null);
  const [editingLogKey, setEditingLogKey] = useState<string | null>(null);
  const [editingLogDelta, setEditingLogDelta] = useState<string>('');
  const [editingLogReason, setEditingLogReason] = useState<string>('');

  const {
    sortKey: modalLogSortKey,
    sortAsc: modalLogSortAsc,
    toggleSort: toggleModalLogSort,
  } = useTableSort<
    | 'date'
    | 'opp'
    | 'min'
    | 'pts'
    | 'fgm'
    | 'fg3m'
    | 'ftm'
    | 'reb'
    | 'ast'
    | 'stl'
    | 'blk'
    | 'tov'
    | 'fpts'
  >('date', false, ['opp', 'tov']);

  const handleSaveGameCorrection = useCallback(
    (playerId: string, eventId: string, date: string, delta: number, reason: string) => {
      commitLeagueState((prev) => {
        const nextCorrections = { ...(prev.gameCorrections || {}) };
        const keyEvent = `${playerId}:${eventId}`;
        const keyDate = `${playerId}:${date}`;
        if (Math.abs(delta) < 0.001 && !reason.trim()) {
          delete nextCorrections[keyEvent];
          delete nextCorrections[keyDate];
        } else {
          const entry = {
            fptsDelta: Number(delta.toFixed(2)),
            reason: reason.trim(),
            updatedAt: Date.now(),
          };
          nextCorrections[keyEvent] = entry;
          if (eventId !== date) {
            nextCorrections[keyDate] = entry;
          }
        }
        return {
          ...prev,
          gameCorrections: nextCorrections,
        };
      });
      setEditingLogKey(null);
      setEditingLogDelta('');
      setEditingLogReason('');
      setActionBannerMsg('Ajuste de puntos Fantasy guardado correctamente para el partido.');
    },
    [commitLeagueState]
  );

  // Trade Analyzer State
  const [tradeSendIds, setTradeSendIds] = useState<string[]>([]);
  const [tradeReceiveIds, setTradeReceiveIds] = useState<string[]>([]);
  const [tradePickerSide, setTradePickerSide] = useState<'send' | 'receive' | null>(null);
  const [tradeSearchQuery, setTradeSearchQuery] = useState<string>('');
  const [includeWaiverStreamSlotInTrade, setIncludeWaiverStreamSlotInTrade] =
    useState<boolean>(true);
  const {
    sortKey: tradeTableSortKey,
    sortAsc: tradeTableSortAsc,
    toggleSort: toggleTradeTableSort,
  } = useTableSort<'label' | 'send' | 'receive' | 'diff'>(null, false, ['label']);

  // Scoring Audit Player Selector (Tab 4) & Rules Table Sort (Tab 5)
  const [auditPlayerId, setAuditPlayerId] = useState<string>('');
  const [auditSearch, setAuditSearch] = useState<string>('');
  const {
    sortKey: auditSortKey,
    sortAsc: auditSortAsc,
    toggleSort: toggleAuditSort,
  } = useTableSort<
    | 'date'
    | 'fgm'
    | 'fgmi'
    | 'fg3m'
    | 'fg3mi'
    | 'ftm'
    | 'ftmi'
    | 'oreb'
    | 'dreb'
    | 'ast'
    | 'stocks'
    | 'tov'
    | 'totalFpts'
  >('date', false, ['fgmi', 'ftmi', 'tov']);

  const {
    sortKey: rulesSortKey,
    sortAsc: rulesSortAsc,
    toggleSort: toggleRulesSort,
  } = useTableSort<'action' | 'code' | 'fpts' | 'description'>(null, false, [
    'action',
    'code',
    'description',
  ]);

  const reconcileIncomingServerState = useCallback(
    (serverState: FantasyManualLeagueState | null | undefined, allowInitialLocalUpload: boolean) => {
      if (savingInFlightCountRef.current > 0) return;

      setLeagueState((currentLocal) => {
        const localHas = hasAnyUserLeagueData(currentLocal);
        const serverHas = hasAnyUserLeagueData(serverState);

        if (
          serverState &&
          ((!localHas && serverHas) || serverState.updatedAt > currentLocal.updatedAt)
        ) {
          const hydrated: FantasyManualLeagueState = {
            ...serverState,
            roster: normalizeRosterSlots(serverState.roster || []),
          };
          try {
            localStorage.setItem(STORAGE_FANTASY_PERMANENT_KEY, JSON.stringify(hydrated));
          } catch {
            // Ignore storage errors
          }
          return hydrated;
        }

        if (
          allowInitialLocalUpload &&
          localHas &&
          (!serverState || !serverHas || currentLocal.updatedAt > serverState.updatedAt)
        ) {
          const syncedLocal: FantasyManualLeagueState = {
            ...currentLocal,
            updatedAt: currentLocal.updatedAt || Date.now(),
          };
          try {
            localStorage.setItem(STORAGE_FANTASY_PERMANENT_KEY, JSON.stringify(syncedLocal));
          } catch {
            // Ignore storage errors
          }
          void persistStateToServerDisk(syncedLocal);
          return syncedLocal;
        }

        return currentLocal;
      });
    },
    [persistStateToServerDisk]
  );

  const pullLatestManualStateFromServer = useCallback(
    async (manualTrigger = false) => {
      if (savingInFlightCountRef.current > 0) return;
      try {
        const res = await fetch('/api/nba/fantasy/manual-state', {
          credentials: 'same-origin',
          headers: buildAdminAuthHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) {
          if (manualTrigger) {
            setCloudSyncFeedback('No se pudo conectar con el servidor para consultar la nube.');
          }
          return;
        }
        const data = (await res.json()) as {
          state: FantasyManualLeagueState | null;
          storageMode?: FantasyStorageMode;
        };
        if (data.storageMode) {
          setStorageMode(data.storageMode);
        }
        if (manualTrigger) {
          if (data.state && hasAnyUserLeagueData(data.state)) {
            const hydrated: FantasyManualLeagueState = {
              ...data.state,
              roster: normalizeRosterSlots(data.state.roster || []),
            };
            setLeagueState(hydrated);
            try {
              localStorage.setItem(STORAGE_FANTASY_PERMANENT_KEY, JSON.stringify(hydrated));
            } catch {
              // Ignore storage errors
            }
            setCloudSyncFeedback('Datos descargados y sincronizados desde la nube.');
          } else {
            setCloudSyncFeedback('La nube aún no tiene equipos guardados. Pulsa "Subir este navegador a la nube".');
          }
          return;
        }
        reconcileIncomingServerState(data.state, false);
      } catch {
        if (manualTrigger) {
          setCloudSyncFeedback('Error de red al consultar la nube.');
        }
      }
    },
    [reconcileIncomingServerState]
  );

  const handleForcePushToCloud = useCallback(async () => {
    setCloudSyncFeedback(null);
    const stamped: FantasyManualLeagueState = {
      ...leagueState,
      roster: normalizeRosterSlots(leagueState.roster),
      updatedAt: Date.now(),
    };
    setLeagueState(stamped);
    try {
      localStorage.setItem(STORAGE_FANTASY_PERMANENT_KEY, JSON.stringify(stamped));
    } catch {
      // Ignore storage errors
    }
    const ok = await persistStateToServerDisk(stamped);
    if (ok) {
      setCloudSyncFeedback(
        storageMode === 'upstash-redis'
          ? 'Plantilla y rivales subidos correctamente a Upstash Redis (disponibles en todos tus dispositivos).'
          : 'Guardado en el servidor actual. Conecta Upstash Redis en Vercel para que sea permanente entre dispositivos.'
      );
    } else {
      setCloudSyncFeedback('Error al subir los datos al servidor. Revisa tu sesión de administrador.');
    }
  }, [leagueState, persistStateToServerDisk, storageMode]);

  const fetchNbaFantasyContext = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) {
        setContextRefreshing(true);
      } else {
        setContextLoading(true);
      }
      try {
        const url = forceRefresh
          ? '/api/nba/fantasy/context?refresh=1'
          : '/api/nba/fantasy/context';
        const res = await fetch(url, {
          credentials: 'same-origin',
          headers: buildAdminAuthHeaders(),
          cache: 'no-store',
        });
        if (res.ok) {
          const payload = (await res.json()) as FantasyEspnSyncPayload;
          setNbaContext(payload);
          if (payload.storageMode) {
            setStorageMode(payload.storageMode);
          }

          const isFirstMountReconcile = !reconciledWithDiskRef.current;
          reconciledWithDiskRef.current = true;
          reconcileIncomingServerState(payload.savedState, isFirstMountReconcile);
        }
      } catch {
        // Keep permanent local state active
      } finally {
        setContextLoading(false);
        setContextRefreshing(false);
      }
    },
    [reconcileIncomingServerState]
  );

  useEffect(() => {
    void fetchNbaFantasyContext(false);
  }, [fetchNbaFantasyContext]);

  useEffect(() => {
    const checkCloudOnFocus = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastVisibilityCheckRef.current < 10_000) return;
      lastVisibilityCheckRef.current = now;
      void pullLatestManualStateFromServer(false);
    };
    window.addEventListener('focus', checkCloudOnFocus);
    document.addEventListener('visibilitychange', checkCloudOnFocus);
    return () => {
      window.removeEventListener('focus', checkCloudOnFocus);
      document.removeEventListener('visibilitychange', checkCloudOnFocus);
    };
  }, [pullLatestManualStateFromServer]);

  const rivalSlotKeys = useMemo(() => {
    let maxSlot = Math.max(DEFAULT_RIVAL_COUNT, extraRivalSlotsCount);
    for (const k of [
      ...Object.keys(leagueState.rivalRosters || {}),
      ...Object.keys(leagueState.rivalTeamNames || {}),
    ]) {
      const m = k.match(/^team_(\d+)$/);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > maxSlot && n <= 30) maxSlot = n;
      }
    }
    return Array.from({ length: maxSlot }, (_, i) => `team_${i + 1}`);
  }, [leagueState.rivalRosters, leagueState.rivalTeamNames, extraRivalSlotsCount]);

  const getRivalDisplayName = useCallback(
    (teamKey: string): string => {
      const custom = leagueState.rivalTeamNames?.[teamKey]?.trim();
      if (custom) return custom;
      const num = teamKey.replace('team_', '');
      return `Rival ${num}`;
    },
    [leagueState.rivalTeamNames]
  );

  const playersById = useMemo(() => {
    const map = new Map<string, PlayerSummary>();
    for (const p of effectivePlayers) map.set(p.id, p);
    return map;
  }, [effectivePlayers]);

  const staticFallbackWeeks = useMemo(() => buildStaticFantasyWeeks(), []);

  const effectiveWeeks: FantasyWeekWindow[] = useMemo(
    () =>
      nbaContext && nbaContext.weeks.length > 0
        ? nbaContext.weeks
        : staticFallbackWeeks,
    [nbaContext, staticFallbackWeeks]
  );

  const activeWeek: FantasyWeekWindow | null = useMemo(() => {
    if (effectiveWeeks.length === 0) return null;
    return (
      effectiveWeeks.find((w) => w.id === selectedWeekId) ||
      effectiveWeeks.find((w) => w.id === 'current') ||
      effectiveWeeks[0]
    );
  }, [effectiveWeeks, selectedWeekId]);

  const getPlayerInjury = useCallback(
    (p: PlayerSummary): FantasyPlayerInjuryAlert | null => {
      const norm = normalizePlayerLookupKey(p.name);
      if (p.id === '1631096' || norm === 'chet holmgren') {
        const byId = nbaContext?.injuriesByPlayerId?.[p.id];
        if (byId && byId.severity !== 'healthy') return byId;
        const byNorm = nbaContext?.injuriesByNormName?.[norm];
        if (byNorm && byNorm.severity !== 'healthy') return byNorm;
        return {
          playerNameNorm: 'chet holmgren',
          displayName: 'Chet Holmgren',
          severity: 'out',
          absenceTier: 'long_term',
          statusLabelEs: 'Baja larga duración',
          detailEs: 'Rotura de tendón rotuliano (~8-10 semanas de baja) [Regreso est: 2027-01-02]',
        };
      }
      if (!nbaContext) return null;
      const byId = nbaContext.injuriesByPlayerId[p.id];
      if (byId) return byId;
      return nbaContext.injuriesByNormName[norm] || null;
    },
    [nbaContext]
  );

  const teamsByAbbr = useMemo(() => {
    const map = new Map<string, TeamSummary>();
    for (const t of teams) {
      if (t.abbreviation) map.set(t.abbreviation, t);
    }
    return map;
  }, [teams]);

  // Precompute official Fantasy profile + smart injury/B2B weekly schedule projection for all NBA players
  const enrichedCatalog = useMemo(() => {
    return effectivePlayers.map((p) => {
      const stats = computePlayerOfficialFantasyStats(p, 0, leagueState.gameCorrections);
      const teamSched = activeWeek?.teamSchedules?.[p.teamAbbr] || {
        gamesCount: 0,
        b2bCount: 0,
        games: [],
      };
      const injury = getPlayerInjury(p);
      const severity: FantasyInjurySeverity = injury?.severity || 'healthy';
      const availabilityContext = analyzePlayerAvailabilityContext(
        p,
        teamsByAbbr.get(p.teamAbbr)?.games
      );
      const weekly = computeWeeklyLockProjection({
        scheduledGames: teamSched.gamesCount,
        b2bGames: teamSched.b2bCount,
        stats,
        injurySeverity: severity,
        injuryAbsenceTier: injury?.absenceTier,
        injuryDetailEs: injury?.detailEs || injury?.statusLabelEs || '',
        availabilityContext,
        projectionMode,
      });

      return {
        player: p,
        stats,
        teamSched,
        injury,
        severity,
        availabilityContext,
        weekly,
      };
    });
  }, [effectivePlayers, activeWeek, getPlayerInjury, teamsByAbbr, projectionMode, leagueState.gameCorrections]);

  const enrichedById = useMemo(() => {
    const map = new Map<string, (typeof enrichedCatalog)[number]>();
    for (const item of enrichedCatalog) {
      map.set(item.player.id, item);
    }
    return map;
  }, [enrichedCatalog]);

  // Map every rostered player in the league to its owner label (My Team or Rival Team Name)
  const rivalOwnerByPlayerId = useMemo(() => {
    const map = new Map<string, { teamKey: string; teamName: string }>();
    for (const [tKey, pIds] of Object.entries(leagueState.rivalRosters || {})) {
      if (!Array.isArray(pIds)) continue;
      const name = getRivalDisplayName(tKey);
      for (const pid of pIds) {
        if (pid) map.set(pid, { teamKey: tKey, teamName: name });
      }
    }
    return map;
  }, [leagueState.rivalRosters, getRivalDisplayName]);

  const myRosterEnriched = useMemo(() => {
    return leagueState.roster
      .map((contract) => {
        const item = enrichedById.get(contract.playerId);
        if (!item) return null;
        return {
          ...item,
          slot: contract.slot,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [leagueState.roster, enrichedById]);

  const optimalStarterIds = useMemo(() => {
    const sorted = [...myRosterEnriched].sort(
      (a, b) =>
        b.weekly.lockAdjustedFpts - a.weekly.lockAdjustedFpts ||
        b.weekly.rawFormulaFpts - a.weekly.rawFormulaFpts
    );
    return new Set(
      sorted
        .slice(0, OFFICIAL_LEAGUE_RULES.activeStarters)
        .map((x) => x.player.id)
    );
  }, [myRosterEnriched]);

  const sortRosterItems = useCallback(
    <T extends (typeof myRosterEnriched)[number]>(items: T[]) => {
      const copy = [...items];
      const orderMap = new Map(
        leagueState.roster.map((c, idx) => [c.playerId, idx])
      );
      copy.sort((a, b) => {
        let cmp = 0;
        switch (rosterSortKey) {
          case 'slot':
            cmp =
              (orderMap.get(a.player.id) ?? 99) -
              (orderMap.get(b.player.id) ?? 99);
            break;
          case 'name':
            cmp = a.player.name.localeCompare(b.player.name);
            break;
          case 'severity':
            cmp = (a.severity || '').localeCompare(b.severity || '');
            break;
          case 'gamesCount':
            cmp = a.teamSched.gamesCount - b.teamSched.gamesCount;
            break;
          case 'seasonTotalFpts':
            cmp = a.stats.seasonTotalFpts - b.stats.seasonTotalFpts;
            break;
          case 'seasonAvgFpts':
            cmp = a.stats.seasonAvgFpts - b.stats.seasonAvgFpts;
            break;
          case 'last5AvgFpts':
            cmp = a.stats.last5AvgFpts - b.stats.last5AvgFpts;
            break;
          case 'rawFormulaFpts':
            cmp = a.weekly.rawFormulaFpts - b.weekly.rawFormulaFpts;
            break;
          case 'action': {
            const urgA =
              optimalStarterIds.has(a.player.id) !== (a.slot === 'starter')
                ? 1
                : 0;
            const urgB =
              optimalStarterIds.has(b.player.id) !== (b.slot === 'starter')
                ? 1
                : 0;
            cmp =
              urgA - urgB ||
              a.weekly.lockAdjustedFpts - b.weekly.lockAdjustedFpts;
            break;
          }
          case 'lockAdjustedFpts':
          default:
            cmp = a.weekly.lockAdjustedFpts - b.weekly.lockAdjustedFpts;
            break;
        }
        return rosterSortAsc ? cmp : -cmp;
      });
      return copy;
    },
    [rosterSortKey, rosterSortAsc, leagueState.roster, optimalStarterIds]
  );

  const myStarters = useMemo(
    () => sortRosterItems(myRosterEnriched.filter((x) => x.slot === 'starter')),
    [myRosterEnriched, sortRosterItems]
  );

  const myBench = useMemo(
    () => sortRosterItems(myRosterEnriched.filter((x) => x.slot === 'bench')),
    [myRosterEnriched, sortRosterItems]
  );

  const lineupTotals = useMemo(() => {
    let totalGames = 0;
    let playableGamesSum = 0;
    let rawFormulaSum = 0;
    let adjustedLockSum = 0;
    let seasonAccumulatedFpts = 0;
    let injuredStartersCount = 0;
    let longTermStartersCount = 0;
    let punctualOrB2BStartersCount = 0;

    for (const member of myRosterEnriched) {
      seasonAccumulatedFpts += member.stats.seasonTotalFpts;
    }

    for (const st of myStarters) {
      totalGames += st.teamSched.gamesCount;
      playableGamesSum += st.weekly.playableGamesEst;
      rawFormulaSum += st.weekly.rawFormulaFpts;
      adjustedLockSum += st.weekly.lockAdjustedFpts;
      if (st.weekly.absenceTier === 'long_term') {
        longTermStartersCount += 1;
        injuredStartersCount += 1;
      } else if (
        st.weekly.absenceTier === 'punctual' ||
        st.weekly.absenceTier === 'b2b_rest'
      ) {
        punctualOrB2BStartersCount += 1;
        if (st.severity !== 'healthy' && st.severity !== 'probable') {
          injuredStartersCount += 1;
        }
      }
    }

    let optimalAdjustedSum = 0;
    for (const item of myRosterEnriched) {
      if (optimalStarterIds.has(item.player.id)) {
        optimalAdjustedSum += item.weekly.lockAdjustedFpts;
      }
    }

    return {
      totalGames,
      playableGamesSum: Math.round(playableGamesSum * 10) / 10,
      seasonAccumulatedFpts: Math.round(seasonAccumulatedFpts * 100) / 100,
      rawFormulaSum: Math.round(rawFormulaSum * 10) / 10,
      adjustedLockSum: Math.round(adjustedLockSum * 10) / 10,
      optimalAdjustedSum: Math.round(optimalAdjustedSum * 10) / 10,
      potentialGainFromOptimization:
        Math.round((optimalAdjustedSum - adjustedLockSum) * 10) / 10,
      injuredStartersCount,
      longTermStartersCount,
      punctualOrB2BStartersCount,
    };
  }, [myStarters, myRosterEnriched, optimalStarterIds]);

  const weakestRosterMember = useMemo(() => {
    if (myRosterEnriched.length === 0) return null;
    const sortedAsc = [...myRosterEnriched].sort(
      (a, b) =>
        a.weekly.lockAdjustedFpts - b.weekly.lockAdjustedFpts ||
        a.stats.weightedFptsPerGame - b.stats.weightedFptsPerGame
    );
    return sortedAsc[0];
  }, [myRosterEnriched]);

  const effectiveDropMember = useMemo(() => {
    if (selectedDropPlayerId) {
      const found = myRosterEnriched.find((r) => r.player.id === selectedDropPlayerId);
      if (found) return found;
    }
    return weakestRosterMember;
  }, [selectedDropPlayerId, myRosterEnriched, weakestRosterMember]);

  // Unavailable players across My Team + All Rival Rosters + Standalone Occupied IDs
  const { unavailableIds, totalRivalPlayersCount, activeRivalTeamsCount } = useMemo(() => {
    const mySet = new Set(leagueState.roster.map((c) => c.playerId));
    const rivalSet = new Set<string>();
    let teamsWithPlayers = 0;

    for (const rid of leagueState.takenRivalIds) {
      if (!mySet.has(rid)) rivalSet.add(rid);
    }
    for (const pIds of Object.values(leagueState.rivalRosters || {})) {
      if (Array.isArray(pIds) && pIds.length > 0) {
        teamsWithPlayers += 1;
        for (const pid of pIds) {
          if (!mySet.has(pid)) rivalSet.add(pid);
        }
      }
    }

    const combined = new Set<string>([...mySet, ...rivalSet]);
    return {
      unavailableIds: combined,
      totalRivalPlayersCount: rivalSet.size,
      activeRivalTeamsCount: teamsWithPlayers,
    };
  }, [leagueState.roster, leagueState.takenRivalIds, leagueState.rivalRosters]);

  // Daily Lineup Coverage & Gap Analyzer (Lun..Dom for activeWeek)
  const weeklyLineupCoverage = useMemo(() => {
    const todayIso = getEasternTodayIso();
    if (!activeWeek) {
      return {
        days: [] as Array<{
          dateIso: string;
          dayShortLabel: string;
          isRemaining: boolean;
          scheduledStartersCount: number;
          playableStartersEst: number;
          atRiskOrOutCount: number;
          isGapDay: boolean;
        }>,
        gapDateSet: new Set<string>(),
        gapDaysSummaryLabel: 'Sin calendario',
      };
    }

    const days = Array.from({ length: 7 }, (_, dIdx) => {
      const dateIso = addDaysIso(activeWeek.startIso, dIdx);
      const dayShortLabel = formatDayShortEs(dateIso);
      const isRemaining =
        activeWeek.id !== 'prev' &&
        (activeWeek.id !== 'current' || dateIso >= todayIso);

      let scheduledStartersCount = 0;
      let playableStartersEst = 0;
      let atRiskOrOutCount = 0;

      for (const st of myStarters) {
        const gameOnDay = st.teamSched.games.find((g) => g.dateIso === dateIso);
        if (!gameOnDay) continue;
        scheduledStartersCount += 1;

        if (st.weekly.absenceTier === 'long_term') {
          atRiskOrOutCount += 1;
          continue;
        }
        let dayPlayProb = st.weekly.healthMultiplier;
        if (gameOnDay.isBackToBack && st.weekly.b2bRestRiskGamesEst > 0) {
          dayPlayProb = Math.max(0.25, dayPlayProb - 0.3);
        }
        playableStartersEst += dayPlayProb;
        if (st.weekly.absenceTier !== 'healthy') {
          atRiskOrOutCount += 1;
        }
      }

      const roundedPlayable = Math.round(playableStartersEst * 10) / 10;
      const isGapDay =
        myStarters.length > 0
          ? scheduledStartersCount < OFFICIAL_LEAGUE_RULES.activeStarters &&
            (roundedPlayable <= Math.max(4.5, myStarters.length * 0.58) ||
              atRiskOrOutCount > 0)
          : isRemaining;

      return {
        dateIso,
        dayShortLabel,
        isRemaining,
        scheduledStartersCount,
        playableStartersEst: roundedPlayable,
        atRiskOrOutCount,
        isGapDay,
      };
    });

    const gapDateSet = new Set(
      days
        .filter((d) => d.isGapDay && (activeWeek.id !== 'current' || d.isRemaining))
        .map((d) => d.dateIso)
    );
    // Fallback if all remaining days were full: use all days with < 7 playable starters
    if (gapDateSet.size === 0) {
      for (const d of days) {
        if (d.playableStartersEst < 7) gapDateSet.add(d.dateIso);
      }
    }

    const gapLabels = days
      .filter((d) => gapDateSet.has(d.dateIso))
      .map((d) => d.dayShortLabel);

    return {
      days,
      gapDateSet,
      gapDaysSummaryLabel:
        gapLabels.length > 0 ? gapLabels.join(', ') : 'Semana cubierta',
    };
  }, [activeWeek, myStarters]);

  // Cross RadarNBA Minutes/Usage Positive Breakouts × League Free Agents × Lineup Gap Days
  const { roleBreakoutByPlayerId, streamingRadarAlerts } = useMemo(() => {
    const officialMinUsgByPlayerId = new Map<string, TrendBreakoutAlert>();
    for (const br of trendBreakouts) {
      if (br.axis !== 'minutes_usage' || br.direction !== 'positive') continue;
      const existing = officialMinUsgByPlayerId.get(br.playerId);
      if (!existing || br.breakoutScore > existing.breakoutScore) {
        officialMinUsgByPlayerId.set(br.playerId, br);
      }
    }

    // Track rotation players (20+ MIN) out/doubtful per NBA team to explain role promotions
    const injuredRotationByTeam = new Map<string, Array<{ id: string; name: string }>>();
    for (const item of enrichedCatalog) {
      if (
        item.stats.minutesAvg >= 20 &&
        (item.weekly.absenceTier === 'long_term' ||
          item.severity === 'out' ||
          item.severity === 'ir' ||
          item.severity === 'doubtful')
      ) {
        const list = injuredRotationByTeam.get(item.player.teamAbbr) || [];
        list.push({ id: item.player.id, name: item.player.name });
        injuredRotationByTeam.set(item.player.teamAbbr, list);
      }
    }

    interface StreamingRoleBreakoutMeta {
      playerId: string;
      radarVerified: boolean;
      radarZScore: number | null;
      minSeason: number;
      minRecent: number;
      minDelta: number;
      usgSeason: number;
      usgRecent: number;
      usgDelta: number;
      promotedToStarter: boolean;
      sustainabilityLabel: string;
      teammateOutName: string | null;
      gapGamesCount: number;
      gapDayShortLabels: string[];
      streamingPriorityScore: number;
    }

    const byPlayerId = new Map<string, StreamingRoleBreakoutMeta>();
    const dropWeekFpts = effectiveDropMember?.weekly.lockAdjustedFpts ?? 0;
    const dropPerGame = effectiveDropMember?.stats.weightedFptsPerGame ?? 0;

    for (const item of enrichedCatalog) {
      if (item.stats.gamesPlayed < 3) continue;
      const official = officialMinUsgByPlayerId.get(item.player.id);
      const waiverSig = evaluateWaiverRoleBreakout(item.player);
      if (!official && !waiverSig) continue;

      const minSeason =
        waiverSig?.seasonMinAvg ??
        (official?.metricKey === 'minutes'
          ? official.baselineAvg
          : item.stats.minutesAvg);
      const minRecent =
        waiverSig?.recentMinAvg ??
        (official?.metricKey === 'minutes'
          ? official.windowAvg
          : item.stats.minutesAvg);
      const minDelta =
        waiverSig?.minDelta ??
        (official?.metricKey === 'minutes'
          ? Math.round(official.absDelta * 10) / 10
          : Math.round((minRecent - minSeason) * 10) / 10);

      const usgSeason =
        waiverSig?.seasonUsgAvg ??
        (official?.metricKey === 'usgEst'
          ? official.baselineAvg
          : item.player.usgAvg ?? 18);
      const usgRecent =
        waiverSig?.recentUsgAvg ??
        (official?.metricKey === 'usgEst'
          ? official.windowAvg
          : usgSeason);
      const usgDelta =
        waiverSig?.usgDelta ??
        (official?.metricKey === 'usgEst'
          ? Math.round(official.absDelta * 10) / 10
          : Math.round((usgRecent - usgSeason) * 10) / 10);

      const promotedToStarter = Boolean(waiverSig?.promotedToStarter);
      const teamInjuredList = injuredRotationByTeam.get(item.player.teamAbbr) || [];
      const teammateOut =
        teamInjuredList.find((tm) => tm.id !== item.player.id) || null;

      const gapGames = item.teamSched.games.filter((g) =>
        weeklyLineupCoverage.gapDateSet.has(g.dateIso)
      );
      const gapDayShortLabels = gapGames.map(
        (g) => g.dayShortEs || formatDayShortEs(g.dateIso)
      );

      const streamingPriorityScore =
        Math.round(
          (gapGames.length * 6.5 +
            Math.max(0, minDelta) * 2.2 +
            Math.max(0, usgDelta) * 1.35 +
            (promotedToStarter ? 5 : 0) +
            (official ? 4 : 0) +
            item.weekly.lockAdjustedFpts * 0.18) *
            10
        ) / 10;

      byPlayerId.set(item.player.id, {
        playerId: item.player.id,
        radarVerified: Boolean(official),
        radarZScore: official ? official.zScore : null,
        minSeason: Math.round(minSeason * 10) / 10,
        minRecent: Math.round(minRecent * 10) / 10,
        minDelta: Math.round(minDelta * 10) / 10,
        usgSeason: Math.round(usgSeason * 10) / 10,
        usgRecent: Math.round(usgRecent * 10) / 10,
        usgDelta: Math.round(usgDelta * 10) / 10,
        promotedToStarter,
        sustainabilityLabel:
          official?.sustainabilityLabel ||
          (promotedToStarter
            ? 'Promoción al quinteto titular'
            : 'Expansión sostenida de minutos y uso'),
        teammateOutName: teammateOut?.name || null,
        gapGamesCount: gapGames.length,
        gapDayShortLabels,
        streamingPriorityScore,
      });
    }

    const alerts = enrichedCatalog
      .filter((item) => {
        if (unavailableIds.has(item.player.id)) return false;
        if (!byPlayerId.has(item.player.id)) return false;
        if (
          item.weekly.absenceTier === 'long_term' ||
          item.severity === 'out' ||
          item.severity === 'ir' ||
          item.severity === 'suspended' ||
          item.severity === 'doubtful'
        ) {
          return false;
        }
        return item.weekly.playableGamesEst >= 1.5;
      })
      .map((item) => {
        const meta = byPlayerId.get(item.player.id)!;
        return {
          item,
          meta,
          netWeekGain:
            Math.round((item.weekly.lockAdjustedFpts - dropWeekFpts) * 10) / 10,
          netPerGameGain:
            Math.round((item.stats.weightedFptsPerGame - dropPerGame) * 10) / 10,
        };
      })
      .sort(
        (a, b) =>
          b.meta.streamingPriorityScore - a.meta.streamingPriorityScore ||
          b.netWeekGain - a.netWeekGain
      );

    return {
      roleBreakoutByPlayerId: byPlayerId,
      streamingRadarAlerts: alerts,
    };
  }, [
    trendBreakouts,
    enrichedCatalog,
    unavailableIds,
    weeklyLineupCoverage.gapDateSet,
    effectiveDropMember,
  ]);

  // Next week window for schedule and matchups
  const nextWeekWindow = useMemo(() => {
    return effectiveWeeks.find((w) => w.id === 'next') || null;
  }, [effectiveWeeks]);

  // Available Waiver / Free Agent Pool
  const availableWaiverPool = useMemo(() => {
    const q = normalizeSearchText(waiverQuery);
    const dropWeekFpts = effectiveDropMember?.weekly.lockAdjustedFpts ?? 0;
    const dropPerGame = effectiveDropMember?.stats.weightedFptsPerGame ?? 0;

    const filtered = enrichedCatalog.filter((item) => {
      if (unavailableIds.has(item.player.id)) return false;
      if (item.stats.gamesPlayed === 0) return false;
      if (waiverOnlyRoleBreakouts && !roleBreakoutByPlayerId.has(item.player.id)) {
        return false;
      }
      if (waiverMinGames > 0 && item.teamSched.gamesCount < waiverMinGames) {
        return false;
      }
      if (waiverPosFilter !== 'ALL') {
        const posUp = (item.player.position || '').toUpperCase();
        if (!posUp.includes(waiverPosFilter)) return false;
      }
      if (q) {
        const hay = normalizeSearchText(
          `${item.player.name} ${item.player.teamAbbr} ${item.player.teamName} ${item.player.position}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const withDeltas = filtered.map((item) => {
      const recent = computePlayerRecentWindowStats(item.player, leagueState.gameCorrections);
      const nextWeekSched = nextWeekWindow?.teamSchedules?.[item.player.teamAbbr] || null;
      const nextWeekGamesCount = nextWeekSched?.gamesCount ?? 0;
      const nextWeekGamesList = nextWeekSched?.games ?? [];

      return {
        ...item,
        roleBreakout: roleBreakoutByPlayerId.get(item.player.id) || null,
        netWeekGain: Math.round((item.weekly.lockAdjustedFpts - dropWeekFpts) * 10) / 10,
        netPerGameGain: Math.round((item.stats.weightedFptsPerGame - dropPerGame) * 10) / 10,
        recentStats: recent,
        nextWeekSched,
        nextWeekGamesCount,
        nextWeekGamesList,
      };
    });

    withDeltas.sort((a, b) => {
      let cmp = 0;
      if (waiverTableSortKey && waiverTableSortKey !== 'default') {
        switch (waiverTableSortKey) {
          case 'name':
            cmp = a.player.name.localeCompare(b.player.name);
            break;
          case 'seasonTotalFpts':
            cmp = a.stats.seasonTotalFpts - b.stats.seasonTotalFpts;
            break;
          case 'seasonAvgFpts':
            cmp = a.stats.seasonAvgFpts - b.stats.seasonAvgFpts;
            break;
          case 'gamesNextWeek':
            cmp = a.nextWeekGamesCount - b.nextWeekGamesCount;
            break;
          case 'fpts7d':
            cmp = a.recentStats.stats7d.total - b.recentStats.stats7d.total;
            break;
          case 'fpts15d':
            cmp = a.recentStats.stats15d.total - b.recentStats.stats15d.total;
            break;
          case 'fpts30d':
            cmp = a.recentStats.stats30d.total - b.recentStats.stats30d.total;
            break;
          case 'netWeekGain':
            cmp = a.netWeekGain - b.netWeekGain;
            break;
          default:
            cmp = a.netWeekGain - b.netWeekGain;
            break;
        }
        return waiverTableSortAsc ? cmp : -cmp;
      }

      // Quick filter active (default)
      switch (waiverSortBy) {
        case 'streamingRole': {
          const aScore = a.roleBreakout
            ? (a.roleBreakout.streamingPriorityScore ?? (a.roleBreakout.gapGamesCount * 5 + a.roleBreakout.minDelta * 2))
            : -999;
          const bScore = b.roleBreakout
            ? (b.roleBreakout.streamingPriorityScore ?? (b.roleBreakout.gapGamesCount * 5 + b.roleBreakout.minDelta * 2))
            : -999;
          cmp = bScore - aScore || b.netWeekGain - a.netWeekGain || b.stats.seasonAvgFpts - a.stats.seasonAvgFpts;
          return cmp;
        }
        case 'formDelta':
          cmp = b.stats.formDeltaLast5 - a.stats.formDeltaLast5 || b.stats.last5AvgFpts - a.stats.last5AvgFpts;
          return cmp;
        case 'seasonAvg':
          cmp = b.stats.seasonAvgFpts - a.stats.seasonAvgFpts || b.stats.seasonTotalFpts - a.stats.seasonTotalFpts;
          return cmp;
        case 'netGainWeek':
        default:
          cmp = b.netWeekGain - a.netWeekGain || b.weekly.lockAdjustedFpts - a.weekly.lockAdjustedFpts;
          return cmp;
      }
    });

    return withDeltas;
  }, [
    enrichedCatalog,
    unavailableIds,
    waiverOnlyRoleBreakouts,
    roleBreakoutByPlayerId,
    waiverQuery,
    waiverMinGames,
    waiverPosFilter,
    waiverSortBy,
    waiverTableSortKey,
    waiverTableSortAsc,
    effectiveDropMember,
    nextWeekWindow,
    leagueState.gameCorrections,
  ]);

  const topReplacementFreeAgent = useMemo(() => {
    const healthyFAs = enrichedCatalog
      .filter(
        (x) =>
          !unavailableIds.has(x.player.id) &&
          x.severity === 'healthy' &&
          x.stats.gamesPlayed >= 2
      )
      .sort((a, b) => b.weekly.lockAdjustedFpts - a.weekly.lockAdjustedFpts);
    return healthyFAs[0] || null;
  }, [enrichedCatalog, unavailableIds]);

  // Trade Analyzer Evaluation (Simulador de Traspasos Proyectivo Net Impact)
  const tradeEvaluation = useMemo(() => {
    const todayIso = getEasternTodayIso();
    const sendItems = tradeSendIds
      .map((id) => enrichedById.get(id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const receiveItems = tradeReceiveIds
      .map((id) => enrichedById.get(id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const sumMetrics = (arr: typeof sendItems) =>
      arr.reduce(
        (acc, x) => {
          const rosRemainingGames = countRemainingGamesForTeam(
            x.player.teamAbbr,
            todayIso
          );
          const rosTotalFpts =
            x.stats.weightedFptsPerGame * rosRemainingGames;
          return {
            seasonFpts: acc.seasonFpts + x.stats.seasonAvgFpts,
            weightedFpts: acc.weightedFpts + x.stats.weightedFptsPerGame,
            weekFpts: acc.weekFpts + x.weekly.lockAdjustedFpts,
            weekGames: acc.weekGames + x.teamSched.gamesCount,
            rosRemainingGames: acc.rosRemainingGames + rosRemainingGames,
            rosTotalFpts: acc.rosTotalFpts + rosTotalFpts,
            makePts: acc.makePts + x.stats.avgShootingMakePts,
            missPenaltyPts:
              acc.missPenaltyPts + x.stats.avgShootingMissPenaltyPts,
            rebPts: acc.rebPts + x.stats.avgReboundPts,
            playDefPts: acc.playDefPts + x.stats.avgPlaymakingDefensePts,
            negPts: acc.negPts + x.stats.avgNegativeDisciplinePts,
          };
        },
        {
          seasonFpts: 0,
          weightedFpts: 0,
          weekFpts: 0,
          weekGames: 0,
          rosRemainingGames: 0,
          rosTotalFpts: 0,
          makePts: 0,
          missPenaltyPts: 0,
          rebPts: 0,
          playDefPts: 0,
          negPts: 0,
        }
      );

    const sendSum = sumMetrics(sendItems);
    const receiveSum = sumMetrics(receiveItems);

    const slotDiff = receiveItems.length - sendItems.length;
    let forcedDropItem: (typeof myRosterEnriched)[number] | null = null;
    let addedStreamItem: (typeof enrichedCatalog)[number] | null = null;

    if (
      slotDiff > 0 &&
      myRosterEnriched.length + slotDiff > OFFICIAL_LEAGUE_RULES.maxContracts
    ) {
      const remainingRoster = myRosterEnriched
        .filter((r) => !tradeSendIds.includes(r.player.id))
        .sort((a, b) => a.weekly.lockAdjustedFpts - b.weekly.lockAdjustedFpts);
      forcedDropItem = remainingRoster[0] || null;
    } else if (slotDiff < 0 && includeWaiverStreamSlotInTrade) {
      addedStreamItem = topReplacementFreeAgent || null;
    }

    const forcedDropRosGames = forcedDropItem
      ? countRemainingGamesForTeam(forcedDropItem.player.teamAbbr, todayIso)
      : 0;
    const forcedDropRosFpts = forcedDropItem
      ? forcedDropItem.stats.weightedFptsPerGame * forcedDropRosGames
      : 0;

    const addedStreamRosGames = addedStreamItem
      ? countRemainingGamesForTeam(addedStreamItem.player.teamAbbr, todayIso)
      : 0;
    const addedStreamRosFpts = addedStreamItem
      ? addedStreamItem.stats.weightedFptsPerGame * addedStreamRosGames
      : 0;

    const effectiveOutPerGame =
      sendSum.weightedFpts + (forcedDropItem?.stats.weightedFptsPerGame || 0);
    const effectiveInPerGame =
      receiveSum.weightedFpts +
      (addedStreamItem?.stats.weightedFptsPerGame || 0);

    const effectiveOutWeek =
      sendSum.weekFpts + (forcedDropItem?.weekly.lockAdjustedFpts || 0);
    const effectiveInWeek =
      receiveSum.weekFpts + (addedStreamItem?.weekly.lockAdjustedFpts || 0);

    const effectiveOutRosFpts = sendSum.rosTotalFpts + forcedDropRosFpts;
    const effectiveInRosFpts = receiveSum.rosTotalFpts + addedStreamRosFpts;

    return {
      sendItems,
      receiveItems,
      sendSum,
      receiveSum,
      forcedDropItem,
      addedStreamItem,
      netPerGame: Math.round((effectiveInPerGame - effectiveOutPerGame) * 10) / 10,
      netWeek: Math.round((effectiveInWeek - effectiveOutWeek) * 10) / 10,
      netRosTotalFpts:
        Math.round((effectiveInRosFpts - effectiveOutRosFpts) * 10) / 10,
    };
  }, [
    tradeSendIds,
    tradeReceiveIds,
    enrichedById,
    myRosterEnriched,
    includeWaiverStreamSlotInTrade,
    topReplacementFreeAgent,
  ]);

  // --- Handlers for Permanent Manual League Management ---

  const stripPlayerFromAllRivals = (
    rivalRosters: Record<string, string[]>,
    takenRivalIds: string[],
    playerIdToRemove: string
  ) => {
    const nextRivals: Record<string, string[]> = {};
    for (const [k, arr] of Object.entries(rivalRosters || {})) {
      nextRivals[k] = (arr || []).filter((id) => id !== playerIdToRemove);
    }
    const nextTaken = (takenRivalIds || []).filter((id) => id !== playerIdToRemove);
    return { nextRivals, nextTaken };
  };

  const handleAutoOptimizeStarters = () => {
    commitLeagueState((prev) => ({
      ...prev,
      roster: prev.roster.map((c) => ({
        playerId: c.playerId,
        slot: optimalStarterIds.has(c.playerId) ? 'starter' : 'bench',
      })),
    }));
    setActionBannerMsg(
      'Alineación optimizada y guardada: los 10 jugadores con mayor volumen saludable esperado ocupan los puestos titulares del lunes.'
    );
  };

  const handleTogglePlayerSlot = (playerId: string) => {
    commitLeagueState((prev) => {
      const target = prev.roster.find((c) => c.playerId === playerId);
      if (!target) return prev;

      if (target.slot === 'starter') {
        return {
          ...prev,
          roster: prev.roster.map((c) =>
            c.playerId === playerId ? { ...c, slot: 'bench' } : c
          ),
        };
      }

      const currentStarters = prev.roster.filter((c) => c.slot === 'starter');
      if (currentStarters.length < OFFICIAL_LEAGUE_RULES.activeStarters) {
        return {
          ...prev,
          roster: prev.roster.map((c) =>
            c.playerId === playerId ? { ...c, slot: 'starter' } : c
          ),
        };
      }

      const sortedStartersAsc = [...currentStarters].sort((a, b) => {
        const va = enrichedById.get(a.playerId)?.weekly.lockAdjustedFpts ?? 0;
        const vb = enrichedById.get(b.playerId)?.weekly.lockAdjustedFpts ?? 0;
        return va - vb;
      });
      const demoteId = sortedStartersAsc[0]?.playerId;

      return {
        ...prev,
        roster: prev.roster.map((c) => {
          if (c.playerId === playerId) return { ...c, slot: 'starter' };
          if (c.playerId === demoteId) return { ...c, slot: 'bench' };
          return c;
        }),
      };
    });
  };

  const handleAddPlayerToMyRoster = (playerId: string) => {
    commitLeagueState((prev) => {
      if (prev.roster.some((c) => c.playerId === playerId)) return prev;
      if (prev.roster.length >= OFFICIAL_LEAGUE_RULES.maxContracts) return prev;
      const starterCount = prev.roster.filter((c) => c.slot === 'starter').length;
      const nextSlot: 'starter' | 'bench' =
        starterCount < OFFICIAL_LEAGUE_RULES.activeStarters ? 'starter' : 'bench';
      const { nextRivals, nextTaken } = stripPlayerFromAllRivals(
        prev.rivalRosters,
        prev.takenRivalIds,
        playerId
      );
      return {
        ...prev,
        rivalRosters: nextRivals,
        takenRivalIds: nextTaken,
        roster: [...prev.roster, { playerId, slot: nextSlot }],
      };
    });
  };

  const handleRemovePlayerFromMyRoster = (playerId: string) => {
    commitLeagueState((prev) => ({
      ...prev,
      roster: prev.roster.filter((c) => c.playerId !== playerId),
    }));
  };

  const handleAssignPlayerToRival = (playerId: string, targetRivalKey: string) => {
    const pObj = playersById.get(playerId);
    if (!pObj) return;

    if (targetRivalKey === '__generic__') {
      commitLeagueState((prev) => ({
        ...prev,
        roster: prev.roster.filter((c) => c.playerId !== playerId),
        takenRivalIds: Array.from(new Set([...prev.takenRivalIds, playerId])),
      }));
      setActionBannerMsg(`${pObj.name} marcado como ocupado en la liga (excluido de Waivers).`);
      return;
    }

    commitLeagueState((prev) => {
      const { nextRivals, nextTaken } = stripPlayerFromAllRivals(
        prev.rivalRosters,
        prev.takenRivalIds,
        playerId
      );
      const currentTeamList = nextRivals[targetRivalKey] || [];
      nextRivals[targetRivalKey] = Array.from(new Set([...currentTeamList, playerId]));
      return {
        ...prev,
        roster: prev.roster.filter((c) => c.playerId !== playerId),
        rivalRosters: nextRivals,
        takenRivalIds: nextTaken,
      };
    });

    const teamLabel = getRivalDisplayName(targetRivalKey);
    setActionBannerMsg(
      `${pObj.name} asignado a ${teamLabel} y guardado permanentemente.`
    );
  };

  const handleRemovePlayerFromRival = (playerId: string, rivalKey: string) => {
    const pObj = playersById.get(playerId);
    commitLeagueState((prev) => {
      const nextRivals = { ...(prev.rivalRosters || {}) };
      nextRivals[rivalKey] = (nextRivals[rivalKey] || []).filter((id) => id !== playerId);
      return {
        ...prev,
        rivalRosters: nextRivals,
        takenRivalIds: prev.takenRivalIds.filter((id) => id !== playerId),
      };
    });
    if (pObj) {
      setRivalPasteFeedback(`${pObj.name} liberado al mercado de Agentes Libres.`);
    }
  };

  const handleExecuteWaiverSwap = (addPlayerId: string, dropPlayerId?: string) => {
    const addObj = playersById.get(addPlayerId);
    if (!addObj) return;

    const hadFullRoster = leagueState.roster.length >= OFFICIAL_LEAGUE_RULES.maxContracts;
    const dropName = dropPlayerId
      ? playersById.get(dropPlayerId)?.name
      : effectiveDropMember?.player.name;

    commitLeagueState((prev) => {
      const { nextRivals, nextTaken } = stripPlayerFromAllRivals(
        prev.rivalRosters,
        prev.takenRivalIds,
        addPlayerId
      );

      if (prev.roster.length < OFFICIAL_LEAGUE_RULES.maxContracts && !dropPlayerId) {
        const starterCount = prev.roster.filter((c) => c.slot === 'starter').length;
        return {
          ...prev,
          rivalRosters: nextRivals,
          takenRivalIds: nextTaken,
          roster: [
            ...prev.roster,
            {
              playerId: addPlayerId,
              slot:
                starterCount < OFFICIAL_LEAGUE_RULES.activeStarters ? 'starter' : 'bench',
            },
          ],
        };
      }

      const targetDropId =
        dropPlayerId ||
        effectiveDropMember?.player.id ||
        prev.roster[prev.roster.length - 1]?.playerId;
      const droppedSlot =
        prev.roster.find((c) => c.playerId === targetDropId)?.slot || 'bench';

      const nextRoster = prev.roster
        .filter((c) => c.playerId !== targetDropId)
        .concat({ playerId: addPlayerId, slot: droppedSlot });

      return {
        ...prev,
        rivalRosters: nextRivals,
        takenRivalIds: nextTaken,
        roster: normalizeRosterSlots(nextRoster),
      };
    });

    setActionBannerMsg(
      dropName && hadFullRoster
        ? `Movimiento guardado: Alta de ${addObj.name} × Corte de ${dropName} (plantilla en 12/12 contratos; ${dropName} pasa a Agentes Libres).`
        : `Incorporado ${addObj.name} a ${leagueState.myTeamName}.`
    );
  };

  const handleApplyTradeToLeague = () => {
    if (tradeEvaluation.sendItems.length === 0 || tradeEvaluation.receiveItems.length === 0) {
      return;
    }

    // Identify if the incoming players belong to a specific rival team so we can transfer outgoing players there
    const detectedRivalOwners = new Set<string>();
    for (const rec of tradeEvaluation.receiveItems) {
      const owner = rivalOwnerByPlayerId.get(rec.player.id);
      if (owner) detectedRivalOwners.add(owner.teamKey);
    }
    const singlePartnerRivalKey =
      detectedRivalOwners.size === 1 ? Array.from(detectedRivalOwners)[0] : null;

    commitLeagueState((prev) => {
      const sendSet = new Set(tradeSendIds);
      const forcedDropId = tradeEvaluation.forcedDropItem?.player.id || null;

      let nextRoster = prev.roster.filter(
        (c) => !sendSet.has(c.playerId) && c.playerId !== forcedDropId
      );

      let nextRivals = { ...(prev.rivalRosters || {}) };
      let nextTaken = [...(prev.takenRivalIds || [])];

      // Remove incoming players from any rival roster and add to my roster
      for (const recId of tradeReceiveIds) {
        const cleaned = stripPlayerFromAllRivals(nextRivals, nextTaken, recId);
        nextRivals = cleaned.nextRivals;
        nextTaken = cleaned.nextTaken;
        if (!nextRoster.some((c) => c.playerId === recId)) {
          nextRoster.push({ playerId: recId, slot: 'starter' });
        }
      }

      // Send outgoing players to the trade partner rival team (or generic occupied if partner wasn't registered)
      for (const sentId of tradeSendIds) {
        if (singlePartnerRivalKey) {
          const list = nextRivals[singlePartnerRivalKey] || [];
          nextRivals[singlePartnerRivalKey] = Array.from(new Set([...list, sentId]));
        } else {
          nextTaken = Array.from(new Set([...nextTaken, sentId]));
        }
      }

      return {
        ...prev,
        roster: normalizeRosterSlots(nextRoster),
        rivalRosters: nextRivals,
        takenRivalIds: nextTaken,
      };
    });

    const partnerLabel = singlePartnerRivalKey
      ? getRivalDisplayName(singlePartnerRivalKey)
      : 'equipo rival';
    setActionBannerMsg(
      `Traspaso ejecutado y guardado permanentemente con ${partnerLabel}. Plantillas y mercado de Agentes Libres actualizados.`
    );
    setTradeSendIds([]);
    setTradeReceiveIds([]);
  };

  const handleProcessMyTeamPaste = () => {
    const parsed = parseCopiedEspnTextToPlayers(
      myTeamPasteBuffer,
      effectivePlayers,
      OFFICIAL_LEAGUE_RULES.maxContracts
    );
    if (parsed.length === 0) {
      setMyTeamPasteFeedback(
        'No se detectaron jugadores NBA en el texto. Escribe o pega los nombres (uno por línea o separados por comas).'
      );
      return;
    }

    const contracts: FantasyRosterContract[] = parsed
      .slice(0, OFFICIAL_LEAGUE_RULES.maxContracts)
      .map((item) => ({
        playerId: item.player.id,
        slot: item.detectedSlot,
      }));

    commitLeagueState((prev) => {
      let nextRivals = { ...(prev.rivalRosters || {}) };
      let nextTaken = [...(prev.takenRivalIds || [])];
      for (const c of contracts) {
        const cleaned = stripPlayerFromAllRivals(nextRivals, nextTaken, c.playerId);
        nextRivals = cleaned.nextRivals;
        nextTaken = cleaned.nextTaken;
      }
      return {
        ...prev,
        rivalRosters: nextRivals,
        takenRivalIds: nextTaken,
        roster: normalizeRosterSlots(contracts),
      };
    });

    setMyTeamPasteFeedback(
      `Guardados ${contracts.length} contratos en ${leagueState.myTeamName}: ${parsed
        .slice(0, OFFICIAL_LEAGUE_RULES.maxContracts)
        .map((x) => x.player.name)
        .join(', ')}.`
    );
    setMyTeamPasteBuffer('');
  };

  const handleProcessRivalPaste = (teamKey: string, mode: 'replace' | 'append') => {
    const parsed = parseCopiedEspnTextToPlayers(rivalPasteBuffer, effectivePlayers, 25);
    if (parsed.length === 0) {
      setRivalPasteFeedback(
        'No se detectaron jugadores NBA en el texto pegado. Comprueba los nombres e inténtalo de nuevo.'
      );
      return;
    }

    const myIds = new Set(leagueState.roster.map((c) => c.playerId));
    const incomingIds = parsed
      .map((x) => x.player.id)
      .filter((id) => !myIds.has(id));

    if (incomingIds.length === 0) {
      setRivalPasteFeedback('Esos jugadores ya figuran en tu propia plantilla.');
      return;
    }

    commitLeagueState((prev) => {
      let nextRivals = { ...(prev.rivalRosters || {}) };
      let nextTaken = [...(prev.takenRivalIds || [])];
      for (const pid of incomingIds) {
        const cleaned = stripPlayerFromAllRivals(nextRivals, nextTaken, pid);
        nextRivals = cleaned.nextRivals;
        nextTaken = cleaned.nextTaken;
      }

      const base = mode === 'append' ? nextRivals[teamKey] || [] : [];
      nextRivals[teamKey] = Array.from(new Set([...base, ...incomingIds]));

      return {
        ...prev,
        rivalRosters: nextRivals,
        takenRivalIds: nextTaken,
      };
    });

    const rName = getRivalDisplayName(teamKey);
    setRivalPasteFeedback(
      `${mode === 'replace' ? 'Guardados' : 'Añadidos'} ${incomingIds.length} jugadores en ${rName} de forma permanente.`
    );
    setRivalPasteBuffer('');
  };

  const handleExportLeagueJson = () => {
    const blob = new Blob([JSON.stringify(leagueState, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liga-fantasy-nba-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportLeagueJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : null;
      const parsed = parseStoredFantasyState(content, Date.now());
      if (parsed) {
        commitLeagueState(() => parsed);
        setActionBannerMsg(
          `Respaldo importado y guardado permanentemente (${parsed.roster.length} contratos en ${parsed.myTeamName}).`
        );
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // Audited Player for Tab 4 (Scoring Breakdown)
  const auditedPlayerItem = useMemo(() => {
    if (auditPlayerId && enrichedById.has(auditPlayerId)) {
      return enrichedById.get(auditPlayerId)!;
    }
    if (myRosterEnriched.length > 0) return myRosterEnriched[0];
    return enrichedCatalog[0] || null;
  }, [auditPlayerId, enrichedById, myRosterEnriched, enrichedCatalog]);

  // Reference players for Tab 5 live rule verification (Shai + Jamal Murray + user stars)
  const referenceValidationPlayers = useMemo(() => {
    const targets = ['shai gilgeous alexander', 'jamal murray'];
    const found: Array<(typeof enrichedCatalog)[number]> = [];
    for (const t of targets) {
      const match = enrichedCatalog.find(
        (x) => normalizePlayerLookupKey(x.player.name) === t
      );
      if (match) found.push(match);
    }
    for (const r of myRosterEnriched.slice(0, 2)) {
      if (!found.some((f) => f.player.id === r.player.id)) {
        found.push(r);
      }
    }
    return found;
  }, [enrichedCatalog, myRosterEnriched]);

  // Injured & B2B-Risk Players + Same-Team Rotation Streamers (Tab 4)
  const injuryRotationCards = useMemo(() => {
    const injuredItems = enrichedCatalog
      .filter((x) => {
        const hasAlert =
          x.weekly.absenceTier !== 'healthy' ||
          Boolean(
            x.injury &&
              (x.severity === 'out' ||
                x.severity === 'ir' ||
                x.severity === 'doubtful' ||
                x.severity === 'questionable' ||
                x.severity === 'dtd' ||
                x.severity === 'suspended')
          );
        if (!hasAlert) return false;
        if (injuryTierFilter === 'long_term') {
          return x.weekly.absenceTier === 'long_term';
        }
        if (injuryTierFilter === 'punctual_b2b') {
          return (
            x.weekly.absenceTier === 'punctual' ||
            x.weekly.absenceTier === 'b2b_rest'
          );
        }
        return true;
      })
      .sort((a, b) => {
        const aMine = leagueState.roster.some((c) => c.playerId === a.player.id) ? 1 : 0;
        const bMine = leagueState.roster.some((c) => c.playerId === b.player.id) ? 1 : 0;
        if (aMine !== bMine) return bMine - aMine;
        return b.stats.seasonAvgFpts - a.stats.seasonAvgFpts;
      })
      .slice(0, 16);

    return injuredItems.map((injItem) => {
      const isOnMyRoster = leagueState.roster.some(
        (c) => c.playerId === injItem.player.id
      );
      const beneficiaries = enrichedCatalog
        .filter(
          (cand) =>
            cand.player.teamAbbr === injItem.player.teamAbbr &&
            cand.player.id !== injItem.player.id &&
            cand.weekly.absenceTier === 'healthy' &&
            cand.stats.gamesPlayed >= 2
        )
        .sort((a, b) => {
          const aFree = !unavailableIds.has(a.player.id) ? 1 : 0;
          const bFree = !unavailableIds.has(b.player.id) ? 1 : 0;
          if (aFree !== bFree) return bFree - aFree;
          const aBreak = roleBreakoutByPlayerId.has(a.player.id) ? 1 : 0;
          const bBreak = roleBreakoutByPlayerId.has(b.player.id) ? 1 : 0;
          if (aBreak !== bBreak) return bBreak - aBreak;
          return (
            b.stats.formDeltaLast5 - a.stats.formDeltaLast5 ||
            b.weekly.lockAdjustedFpts - a.weekly.lockAdjustedFpts
          );
        })
        .slice(0, 2);

      return {
        injItem,
        isOnMyRoster,
        beneficiaries,
      };
    });
  }, [
    enrichedCatalog,
    injuryTierFilter,
    leagueState.roster,
    unavailableIds,
    roleBreakoutByPlayerId,
  ]);

  const filteredModalSearchPlayers = useMemo(() => {
    const q = normalizeSearchText(rosterSearchQuery);
    const list = enrichedCatalog.filter((x) => {
      if (!q) return true;
      return normalizeSearchText(
        `${x.player.name} ${x.player.teamAbbr} ${x.player.position}`
      ).includes(q);
    });
    return list
      .sort((a, b) => b.stats.seasonAvgFpts - a.stats.seasonAvgFpts)
      .slice(0, 30);
  }, [enrichedCatalog, rosterSearchQuery]);

  const filteredRivalSearchPlayers = useMemo(() => {
    const q = normalizeSearchText(rivalSearchQuery);
    const list = enrichedCatalog.filter((x) => {
      if (!q) return true;
      return normalizeSearchText(
        `${x.player.name} ${x.player.teamAbbr} ${x.player.position}`
      ).includes(q);
    });
    return list
      .sort((a, b) => b.stats.seasonAvgFpts - a.stats.seasonAvgFpts)
      .slice(0, 24);
  }, [enrichedCatalog, rivalSearchQuery]);

  const filteredTradePickerPlayers = useMemo(() => {
    const q = normalizeSearchText(tradeSearchQuery);
    const source =
      tradePickerSide === 'send' && myRosterEnriched.length > 0 && !q
        ? myRosterEnriched
        : enrichedCatalog;
    return source
      .filter((x) => {
        if (!q) return true;
        return normalizeSearchText(
          `${x.player.name} ${x.player.teamAbbr} ${x.player.position}`
        ).includes(q);
      })
      .sort((a, b) => b.stats.seasonAvgFpts - a.stats.seasonAvgFpts)
      .slice(0, 28);
  }, [tradePickerSide, tradeSearchQuery, myRosterEnriched, enrichedCatalog]);

  const renderSeverityText = (
    severity: FantasyInjurySeverity,
    labelEs?: string,
    absenceTier?: FantasyAbsenceTier,
    absenceLabelEs?: string
  ) => {
    if (absenceTier === 'long_term' || severity === 'ir' || severity === 'suspended') {
      return (
        <span className="text-rose-400 font-semibold">
          {absenceLabelEs || labelEs || 'Larga duración (0 PJ)'}
        </span>
      );
    }
    if (absenceTier === 'b2b_rest') {
      return (
        <span className="text-sky-300 font-semibold">
          {absenceLabelEs || labelEs || 'Riesgo descanso B2B'}
        </span>
      );
    }
    if (absenceTier === 'punctual' || severity !== 'healthy') {
      return (
        <span
          className={
            severity === 'doubtful' || severity === 'out'
              ? 'text-amber-300 font-semibold'
              : 'text-amber-300 font-medium'
          }
        >
          {absenceLabelEs || labelEs || 'Baja puntual (DTD)'}
        </span>
      );
    }
    return <span className="text-emerald-400 font-medium">Sano</span>;
  };

  const renderAvailabilityLabel = (playerId: string) => {
    if (leagueState.roster.some((c) => c.playerId === playerId)) {
      return <span className="text-orange-400 font-medium">{leagueState.myTeamName}</span>;
    }
    const rivalOwner = rivalOwnerByPlayerId.get(playerId);
    if (rivalOwner) {
      return <span className="text-slate-400">En {rivalOwner.teamName}</span>;
    }
    if (leagueState.takenRivalIds.includes(playerId)) {
      return <span className="text-slate-400">Ocupado (Rival)</span>;
    }
    return <span className="text-emerald-400 font-medium">Libre en Waivers</span>;
  };

  return (
    <div className="space-y-5">
      {/* Top Command Header: Manual League Control + NBA Schedule & Medical Context */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
              <span className="font-semibold text-orange-400">
                {leagueState.myTeamName}
              </span>
              <span aria-hidden="true">·</span>
              <span>Temporada NBA 2026-27</span>
              <span aria-hidden="true">·</span>
              <span>
                {activeRivalTeamsCount} equipos rivales registrados ({totalRivalPlayersCount} jug. ocupados)
              </span>
              <span aria-hidden="true">·</span>
              {diskSaveStatus === 'saving' ? (
                <span className="text-amber-300 font-medium">Sincronizando cambios...</span>
              ) : diskSaveStatus === 'error' ? (
                <span className="text-rose-400 font-medium">
                  Guardado en navegador (sin conexión a nube)
                </span>
              ) : storageMode === 'upstash-redis' ? (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Nube activa · Sincronizado en todos tus dispositivos</span>
                </span>
              ) : storageMode === 'tmp-ephemeral' ? (
                <span className="text-amber-400 font-medium">
                  Solo este navegador · Conecta Upstash Redis en Vercel
                </span>
              ) : (
                <span className="text-emerald-400 font-medium">Guardado local activo</span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Asistente Fantasy NBA · Gestión Manual de Liga Privada
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl">
              Puntuación oficial exacta partido a partido, control permanente de tu plantilla (10 titulares + 2 reservas) y de los equipos rivales para filtrar Agentes Libres reales y cierres semanales del lunes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setManagerTab('my_team');
                setRosterModalOpen(true);
              }}
              className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Mi Equipo ({myRosterEnriched.length}/12)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setManagerTab('rivals_manager');
                setRosterModalOpen(true);
              }}
              className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-orange-400" />
              <span>Equipos Rivales ({activeRivalTeamsCount})</span>
            </button>

            <button
              type="button"
              disabled={contextRefreshing || contextLoading}
              onClick={() => void fetchNbaFantasyContext(true)}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-orange-400 ${
                  contextRefreshing ? 'animate-spin' : ''
                }`}
              />
              <span>Actualizar Partes NBA</span>
            </button>
          </div>
        </div>

        {/* Week Selector Bar (Monday Lock Horizon) */}
        {effectiveWeeks.length > 0 && (
          <div className="pt-3 border-t border-[#1E293B] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 whitespace-nowrap">
                <Calendar className="w-3.5 h-3.5 text-orange-400" />
                <span>Semana de bloqueo (Lun–Dom):</span>
              </span>
              <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
                {effectiveWeeks.map((wk) => {
                  const active = activeWeek?.id === wk.id;
                  return (
                    <button
                      key={wk.id}
                      type="button"
                      onClick={() => setSelectedWeekId(wk.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {wk.label} ({wk.rangeLabel})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setProjectionMode('smart')}
                  title="Distingue bajas puntuales (DTD/Duda), descansos en Back-to-Back y bajas de larga duración (Out/IR)"
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                    projectionMode === 'smart'
                      ? 'bg-[#1E293B] text-orange-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Bajas: Inteligente (DTD/B2B vs IR)
                </button>
                <button
                  type="button"
                  onClick={() => setProjectionMode('conservative')}
                  title="Aplica recortes más estrictos ante dudas médicas o semanas con Back-to-Back"
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                    projectionMode === 'conservative'
                      ? 'bg-[#1E293B] text-amber-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Conservador
                </button>
              </div>

              {activeWeek && (
                <div className="text-xs text-slate-400 font-mono tabular-nums">
                  Cierre: {activeWeek.lockDeadlineLabel} ·{' '}
                  <span
                    className={
                      activeWeek.isLocked ? 'text-amber-300' : 'text-emerald-400'
                    }
                  >
                    {activeWeek.isLocked ? 'Semana bloqueada' : 'Abierta a cambios'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Feedback Banner on Roster / Market Actions */}
      {actionBannerMsg && (
        <div className="bg-[#131C2E] border border-emerald-500/40 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-300">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{actionBannerMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setActionBannerMsg(null)}
            className="text-slate-400 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3-Column Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y md:divide-y-0 md:divide-x divide-[#1E293B]">
        <div className="p-4">
          <p className="text-xs text-slate-400">Contratos en {leagueState.myTeamName}</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-100">
            {myRosterEnriched.length}/12
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {myStarters.length}/10 titulares · {myBench.length}/2 banquillo
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <span>Fórmula semana ({lineupTotals.totalGames} PJ × Media)</span>
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500/20 text-orange-400 cursor-help hover:bg-orange-500/30 transition-colors"
              title="¿Qué muestra este KPI? Es la proyección teórica previa al arranque de la semana (34 PJ en calendario de tus 10 titulares × su media de temporada). No refleja los puntos reales acumulados hasta hoy (llevas 511,75 FPTS en ESPN), sino el volumen teórico total de la semana si todos jugaran sus partidos previstos sin imprevistos."
            >
              <Info className="w-2.5 h-2.5" />
            </span>
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-bold font-mono tabular-nums text-orange-400">
            {lineupTotals.rawFormulaSum.toFixed(1)} FPTS
          </p>
          <p className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
            Volumen teórico a priori ({lineupTotals.totalGames} PJ programados sin bajas)
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs text-slate-400">Proyección ajustada de cierre</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold font-mono tabular-nums text-cyan-400">
            {lineupTotals.adjustedLockSum.toFixed(1)} FPTS
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {lineupTotals.playableGamesSum.toFixed(1)} de {lineupTotals.totalGames} PJ est. tras bajas (Chet 0 PJ) y B2B
          </p>
        </div>
      </div>

      {/* Main 5-Tab Navigation */}
      <div className="flex items-center gap-1 bg-[#131C2E] border border-[#1E293B] p-1 rounded-lg overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => handleSelectFantasyTab('lineup')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'lineup'
              ? 'bg-orange-500 text-slate-950'
              : 'text-slate-300 hover:text-white hover:bg-[#182338]'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>1. Mi Equipo y Bloqueo Semanal</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectFantasyTab('waivers')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'waivers'
              ? 'bg-orange-500 text-slate-950'
              : 'text-slate-300 hover:text-white hover:bg-[#182338]'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>2. Agentes Libres & Alta × Corte ({availableWaiverPool.length})</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectFantasyTab('trades')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'trades'
              ? 'bg-orange-500 text-slate-950'
              : 'text-slate-300 hover:text-white hover:bg-[#182338]'
          }`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>3. Analizador de Traspasos</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectFantasyTab('injuries_rules')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'injuries_rules'
              ? 'bg-orange-500 text-slate-950'
              : 'text-slate-300 hover:text-white hover:bg-[#182338]'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>4. Bajas (Riesgo 0 FPTS) & Auditoría</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectFantasyTab('rules')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'rules'
              ? 'bg-orange-500 text-slate-950'
              : 'text-slate-300 hover:text-white hover:bg-[#182338]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>5. Reglas</span>
        </button>
      </div>

      {/* TAB 1: WEEKLY LINEUP LOCK OPTIMIZER (10 STARTERS + 2 BENCH) */}
      {activeTab === 'lineup' && (
        <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {myRosterEnriched.length === 0 ? (
            <div className="py-12 px-6 text-center max-w-xl mx-auto space-y-4">
              <h3 className="text-base font-bold text-slate-100">
                Configura los 12 jugadores de tu equipo y las plantillas rivales
              </h3>
              <p className="text-xs sm:text-sm text-slate-400">
                Añade tus 12 contratos mediante el buscador o pegando tu lista de nombres, y registra las plantillas de tus rivales. Todo queda guardado permanentemente en disco y navegador sin borrarse al reiniciar.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setManagerTab('my_team');
                    setRosterModalOpen(true);
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap"
                >
                  Configurar mi plantilla (12 contratos)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManagerTab('rivals_manager');
                    setRosterModalOpen(true);
                  }}
                  className="px-4 py-2 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  Registrar equipos rivales
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#1E293B]">
              {/* Action Toolbar */}
              <div className="px-4 py-3.5 bg-[#0F172A]/70 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold text-slate-100">
                    {leagueState.myTeamName} · Cierre Semanal ({activeWeek?.label}:{' '}
                    {activeWeek?.rangeLabel})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Los 10 titulares quedan bloqueados el lunes sin cambios entre semana; cualquier ausencia suma 0.0 FPTS en ese partido.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const ajayOrFirst =
                        myStarters.find((s) => s.player.name.includes('Ajay'))?.player.id ||
                        myStarters[0]?.player.id ||
                        effectivePlayers[0]?.id ||
                        null;
                      setInspectedPlayerForLogsId(ajayOrFirst);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-amber-500/25 hover:bg-amber-500/35 border-2 border-amber-500/60 text-amber-200 rounded-lg transition-all shadow-sm whitespace-nowrap shrink-0"
                    title="Abre el panel de corrección manual de puntos por partido (± FPTS), explicación y desglose oficial"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                    <span>✏️ Auditar / Corregir Puntos de Partido (±)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoOptimizeStarters}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Optimizar 10 Titulares</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManagerTab('my_team');
                      setRosterModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Editar plantilla
                  </button>
                </div>
              </div>

              {/* Daily Coverage & Gap Strip + Streaming Radar Shortcut */}
              {weeklyLineupCoverage.days.length > 0 && (
                <div className="px-4 py-3 bg-[#0B1120]/45 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-2 text-slate-300">
                      <span className="font-semibold text-slate-100">
                        Cobertura diaria de tus 10 titulares
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-400">
                        Días con huecos o riesgo médico:{' '}
                        <strong className="text-amber-300 font-mono">
                          {weeklyLineupCoverage.gapDaysSummaryLabel}
                        </strong>
                      </span>
                    </div>

                    {streamingRadarAlerts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setWaiverOnlyRoleBreakouts(true);
                          setWaiverSortBy('streamingRole');
                          handleSelectFantasyTab('waivers');
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>
                          Ver {streamingRadarAlerts.length} alertas Streaming Min/Uso libres →
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                    {weeklyLineupCoverage.days.map((d) => (
                      <div
                        key={d.dateIso}
                        className={`px-2.5 py-2 rounded-md border text-xs font-mono tabular-nums ${
                          d.isGapDay
                            ? 'bg-[#131C2E] border-amber-500/35'
                            : 'bg-[#0F172A]/70 border-[#1E293B]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-slate-200">
                            {d.dayShortLabel}
                          </span>
                          <span
                            className={
                              d.isGapDay ? 'text-amber-300 font-semibold' : 'text-emerald-400'
                            }
                          >
                            {d.playableStartersEst.toFixed(1)}/{d.scheduledStartersCount} PJ
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] font-sans text-slate-400 truncate">
                          {d.atRiskOrOutCount > 0
                            ? `${d.atRiskOrOutCount} baja/riesgo`
                            : d.isGapDay
                            ? 'Hueco alineación'
                            : 'Carga sólida'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Roster Table (Starters + Bench Split) */}
              <div className="w-full overflow-x-auto lg:overflow-x-visible max-h-[75vh]">
                <table className="w-full text-left border-collapse table-auto text-xs">
                  <thead className={STICKY_THEAD_CLASS}>
                    <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                      <SortableTh
                        label="Puesto"
                        align="left"
                        active={rosterSortKey === 'slot'}
                        asc={rosterSortAsc}
                        onSort={() => handleRosterSort('slot')}
                        className="py-2 pl-3 pr-1 w-12"
                      />
                      <SortableTh
                        label="Jugador"
                        align="left"
                        active={rosterSortKey === 'name'}
                        asc={rosterSortAsc}
                        onSort={() => handleRosterSort('name')}
                        className="py-2 px-1.5 min-w-[130px]"
                      />
                      <SortableTh
                        label="Salud / Parte"
                        align="left"
                        active={rosterSortKey === 'severity'}
                        asc={rosterSortAsc}
                        onSort={() => handleRosterSort('severity')}
                        className="py-2 px-1.5"
                      />
                      <SortableTh
                        label="Calendario"
                        align="left"
                        active={rosterSortKey === 'gamesCount'}
                        asc={rosterSortAsc}
                        onSort={() => handleRosterSort('gamesCount')}
                        className="py-2 px-1.5"
                      />
                      <SortableTh
                        label="Total"
                        align="right"
                        active={rosterSortKey === 'seasonTotalFpts'}
                        asc={rosterSortAsc}
                        onSort={() => handleRosterSort('seasonTotalFpts')}
                        className="py-2 px-1.5"
                      />
                      <SortableTh
                        label="Media"
                        align="right"
                        active={rosterSortKey === 'seasonAvgFpts'}
                        asc={rosterSortAsc}
                        onSort={() => handleRosterSort('seasonAvgFpts')}
                        className="py-2 px-1.5"
                      />
                      <SortableTh
                        label="Últ. 5"
                        align="right"
                        active={rosterSortKey === 'last5AvgFpts'}
                        asc={rosterSortAsc}
                        onSort={() => handleRosterSort('last5AvgFpts')}
                        className="py-2 px-1.5"
                      />
                      <SortableTh
                        label="Fórmula"
                        align="right"
                        active={rosterSortKey === 'rawFormulaFpts'}
                        asc={rosterSortAsc}
                        onSort={() => handleRosterSort('rawFormulaFpts')}
                        className="py-2 px-1.5"
                      />
                      <SortableTh
                        label="Proy."
                        align="right"
                        active={rosterSortKey === 'lockAdjustedFpts'}
                        asc={rosterSortAsc}
                        onSort={() => handleRosterSort('lockAdjustedFpts')}
                        className="py-2 px-1.5"
                      />
                      <SortableTh
                        label="Slot"
                        align="right"
                        active={rosterSortKey === 'action'}
                        asc={rosterSortAsc}
                        onSort={() => handleRosterSort('action')}
                        className="py-2 pl-1 pr-3 w-16"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]/80 text-xs">
                    {/* 10 Active Starters */}
                    <tr className="bg-[#0B1120]/50">
                      <td
                        colSpan={10}
                        className="py-1.5 px-3 text-[11px] font-semibold text-emerald-400"
                      >
                        Titulares Activos que Puntúan ({myStarters.length}/10)
                      </td>
                    </tr>
                    {myStarters.map((item, idx) => {
                      const shouldBench = !optimalStarterIds.has(item.player.id);
                      const hasCorrection = Boolean(
                        leagueState.gameCorrections &&
                          Object.keys(leagueState.gameCorrections).some(
                            (k) => k.startsWith(`${item.player.id}:`)
                          )
                      );
                      return (
                        <tr
                          key={item.player.id}
                          className="hover:bg-[#182338] transition-colors"
                        >
                          <td className="py-2 pl-3 pr-1 font-mono tabular-nums whitespace-nowrap">
                            <span className="font-semibold text-emerald-400">
                              TIT #{idx + 1}
                            </span>
                            {shouldBench && (
                              <span className="block text-[10px] text-amber-300 font-sans">
                                Mejor sentar
                              </span>
                            )}
                          </td>
                          <td className="py-1 px-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <PlayerAvatar
                                playerId={item.player.id}
                                name={item.player.name}
                                teamAbbr={item.player.teamAbbr}
                                size="xs"
                              />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onInspectEntity('player', item.player.id)
                                    }
                                    className="font-semibold text-slate-100 hover:text-orange-400 transition-colors"
                                  >
                                    {item.player.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setInspectedPlayerForLogsId(item.player.id)}
                                    className="p-1 text-amber-400 hover:text-amber-200 hover:bg-amber-500/20 rounded transition-colors"
                                    title={`Auditar / Corregir puntos (${item.stats.currentSeasonGamesPlayed} PJ)`}
                                    aria-label={`Auditar o corregir puntos de ${item.player.name}`}
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  <span>{item.player.teamAbbr} · {item.player.position}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-1 px-1.5 max-w-[130px] xl:max-w-[160px]">
                            <div>
                              {renderSeverityText(
                                item.severity,
                                item.injury?.statusLabelEs,
                                item.weekly.absenceTier,
                                item.weekly.absenceLabelEs
                              )}
                            </div>
                            {(item.weekly.riskWarningEs || item.injury?.detailEs) && (
                              <div
                                className="text-[10px] text-slate-400 truncate"
                                title={item.weekly.riskWarningEs || item.injury?.detailEs}
                              >
                                {item.injury?.detailEs || item.weekly.riskWarningEs}
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="font-mono tabular-nums font-semibold text-slate-200 text-xs shrink-0">
                                {item.teamSched.gamesCount} PJ{item.teamSched.b2bCount > 0 ? ` (${item.teamSched.b2bCount}B)` : ''}
                              </span>
                              {renderScheduleInfoIcon(item.teamSched)}
                            </div>
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setInspectedPlayerForLogsId(item.player.id)}
                              className="group inline-flex items-center justify-end gap-1 hover:text-amber-300 transition-colors"
                              title="Ver auditoría y corregir puntos de este jugador"
                            >
                              <span className="font-semibold text-slate-100 group-hover:text-amber-300">{formatFptsExact(item.stats.seasonTotalFpts)}</span>
                              <span
                                className={`text-xs ml-0.5 ${
                                  hasCorrection
                                    ? 'text-amber-400 font-bold'
                                    : 'opacity-0 group-hover:opacity-100 text-amber-400/80'
                                }`}
                                title={hasCorrection ? 'Incluye corrección manual en auditoría oficial' : 'Corregir puntos'}
                              >
                                ✏️
                              </span>
                            </button>
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono tabular-nums text-slate-200">
                            {item.stats.seasonAvgFpts.toFixed(1)}
                          </td>
                          <td
                            className={`py-2 px-1.5 text-right font-mono tabular-nums font-medium ${
                              item.stats.formDeltaLast5 >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {item.stats.last5AvgFpts.toFixed(1)}
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono tabular-nums text-slate-300">
                            {item.weekly.rawFormulaFpts.toFixed(1)}
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="font-bold text-orange-400 block">
                              {item.weekly.lockAdjustedFpts.toFixed(1)}
                            </span>
                            {item.weekly.playableGamesEst !== item.teamSched.gamesCount && (
                              <span className="text-[10px] text-slate-400 block">
                                {item.weekly.playableGamesEst}/{item.teamSched.gamesCount} PJ est.
                              </span>
                            )}
                          </td>
                          <td className="py-2 pl-1 pr-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleTogglePlayerSlot(item.player.id)}
                              className="px-2 py-0.5 rounded text-[10px] bg-[#0B1120] border border-[#1E293B] hover:border-slate-500 text-slate-300 hover:text-white transition-colors"
                            >
                              Banquillo
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* 2 Bench Reserves */}
                    <tr className="bg-[#0B1120]/50 border-t border-[#1E293B]">
                      <td
                        colSpan={10}
                        className="py-1.5 px-3 text-[11px] font-semibold text-slate-400"
                      >
                        Reservas en Banquillo — No Puntúan ({myBench.length}/2)
                      </td>
                    </tr>
                    {myBench.map((item, idx) => {
                      const shouldStart = optimalStarterIds.has(item.player.id);
                      const hasCorrection = Boolean(
                        leagueState.gameCorrections &&
                          Object.keys(leagueState.gameCorrections).some(
                            (k) => k.startsWith(`${item.player.id}:`)
                          )
                      );
                      return (
                        <tr
                          key={item.player.id}
                          className="bg-[#0B1120]/25 hover:bg-[#182338] transition-colors"
                        >
                          <td className="py-2 pl-3 pr-1 font-mono tabular-nums whitespace-nowrap">
                            <span className="text-slate-400">RES #{idx + 1}</span>
                            {shouldStart && (
                              <span className="block text-[10px] text-emerald-400 font-sans font-semibold">
                                Subir
                              </span>
                            )}
                          </td>
                          <td className="py-1 px-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <PlayerAvatar
                                playerId={item.player.id}
                                name={item.player.name}
                                teamAbbr={item.player.teamAbbr}
                                size="xs"
                              />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onInspectEntity('player', item.player.id)
                                    }
                                    className="font-semibold text-slate-200 hover:text-orange-400 transition-colors"
                                  >
                                    {item.player.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setInspectedPlayerForLogsId(item.player.id)}
                                    className="p-1 text-amber-400 hover:text-amber-200 hover:bg-amber-500/20 rounded transition-colors"
                                    title={`Auditar / Corregir puntos (${item.stats.currentSeasonGamesPlayed} PJ)`}
                                    aria-label={`Auditar o corregir puntos de ${item.player.name}`}
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  <span>{item.player.teamAbbr} · {item.player.position}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-1 px-1.5 max-w-[130px] xl:max-w-[160px]">
                            <div>
                              {renderSeverityText(
                                item.severity,
                                item.injury?.statusLabelEs,
                                item.weekly.absenceTier,
                                item.weekly.absenceLabelEs
                              )}
                            </div>
                            {(item.weekly.riskWarningEs || item.injury?.detailEs) && (
                              <div
                                className="text-[10px] text-slate-400 truncate"
                                title={item.weekly.riskWarningEs || item.injury?.detailEs}
                              >
                                {item.injury?.detailEs || item.weekly.riskWarningEs}
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="font-mono tabular-nums text-slate-300 font-semibold text-xs shrink-0">
                                {item.teamSched.gamesCount} PJ{item.teamSched.b2bCount > 0 ? ` (${item.teamSched.b2bCount}B)` : ''}
                              </span>
                              {renderScheduleInfoIcon(item.teamSched)}
                            </div>
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setInspectedPlayerForLogsId(item.player.id)}
                              className="group inline-flex items-center justify-end gap-1 hover:text-amber-300 transition-colors"
                              title="Ver auditoría y corregir puntos de este jugador"
                            >
                              <span className="font-semibold text-slate-200 group-hover:text-amber-300">{formatFptsExact(item.stats.seasonTotalFpts)}</span>
                              <span
                                className={`text-xs ml-0.5 ${
                                  hasCorrection
                                    ? 'text-amber-400 font-bold'
                                    : 'opacity-0 group-hover:opacity-100 text-amber-400/80'
                                }`}
                                title={hasCorrection ? 'Incluye corrección manual en auditoría oficial' : 'Corregir puntos'}
                              >
                                ✏️
                              </span>
                            </button>
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono tabular-nums text-slate-300">
                            {item.stats.seasonAvgFpts.toFixed(1)}
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono tabular-nums text-slate-300">
                            {item.stats.last5AvgFpts.toFixed(1)}
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono tabular-nums text-slate-400">
                            {item.weekly.rawFormulaFpts.toFixed(1)}
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="font-semibold text-slate-300 block">
                              {item.weekly.lockAdjustedFpts.toFixed(1)}
                            </span>
                            {item.weekly.playableGamesEst !== item.teamSched.gamesCount && (
                              <span className="text-[10px] text-slate-500 block">
                                {item.weekly.playableGamesEst}/{item.teamSched.gamesCount} PJ est.
                              </span>
                            )}
                          </td>
                          <td className="py-2 pl-1 pr-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleTogglePlayerSlot(item.player.id)}
                              className="px-2 py-0.5 rounded text-[10px] bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold transition-colors"
                            >
                              Titular
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: WAIVER WIRE, FREE AGENTS & MANDATORY DROP SIMULATOR */}
      {activeTab === 'waivers' && (
        <div className="space-y-4">
          {/* Mandatory 12-Contract Add x Drop Simulator Strip */}
          <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-100">
                Mercado Real de Agentes Libres & Simulador Alta × Corte (Tope de 12 contratos)
              </h3>
              <p className="text-xs text-slate-400">
                Excluye automáticamente tus {myRosterEnriched.length} jugadores y los{' '}
                {totalRivalPlayersCount} jugadores registrados en equipos rivales. Si un rival ficha en el mercado, asígnaselo directamente desde la fila.
              </p>
            </div>

            {myRosterEnriched.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
                  Jugador a cortar (Drop):
                </span>
                <select
                  value={effectiveDropMember?.player.id || ''}
                  onChange={(e) => setSelectedDropPlayerId(e.target.value)}
                  className="px-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500"
                >
                  {myRosterEnriched
                    .slice()
                    .sort(
                      (a, b) => a.weekly.lockAdjustedFpts - b.weekly.lockAdjustedFpts
                    )
                    .map((r) => (
                      <option key={r.player.id} value={r.player.id}>
                        {r.player.name} ({r.player.teamAbbr}) ·{' '}
                        {r.teamSched.gamesCount} PJ ·{' '}
                        {r.weekly.lockAdjustedFpts.toFixed(1)} FPTS sem.
                      </option>
                    ))}
                </select>
              </div>
            )}
          </section>

          {/* Radar Minutes/Usage × League Free Agents × Lineup Gaps Streaming Panel */}
          <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden divide-y divide-[#1E293B]">
            <div className="px-4 py-3.5 bg-[#0F172A]/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <span>⚡ Radar de Chollos (Smart Waiver Watcher)</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Días con huecos ({activeWeek?.label || 'Semana'}):{' '}
                    <strong className="text-amber-300 font-mono">
                      {weeklyLineupCoverage.gapDaysSummaryLabel}
                    </strong>
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100">
                  Detección Automática de Oportunidades en Agentes Libres
                </h3>
                <p className="text-xs text-slate-400">
                  Detección automática en agentes libres de aumentos en USG% y minutos en suplentes tras confirmarse lesiones de titulares o promociones en la rotación.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setWaiverOnlyRoleBreakouts((prev) => !prev)
                  }
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    waiverOnlyRoleBreakouts
                      ? 'bg-orange-500 border-orange-500 text-slate-950'
                      : 'bg-[#0B1120] border-[#1E293B] hover:border-orange-500/60 text-slate-200'
                  }`}
                >
                  {waiverOnlyRoleBreakouts
                    ? 'Mostrando solo rupturas en tabla'
                    : `Filtrar tabla (${streamingRadarAlerts.length})`}
                </button>
                {onOpenRadarMinutesUsage && (
                  <button
                    type="button"
                    onClick={onOpenRadarMinutesUsage}
                    className="px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Abrir Radar Minutos/Uso →
                  </button>
                )}
              </div>
            </div>

            {streamingRadarAlerts.length === 0 ? (
              <div className="p-5 text-xs text-slate-400 text-center">
                No se detectan agentes libres disponibles con ruptura positiva de Minutos/Uso en este momento. Revisa la tabla general inferior.
              </div>
            ) : (
              <div className="divide-y divide-[#1E293B]/80">
                {streamingRadarAlerts.slice(0, 6).map(({ item, meta, netWeekGain }) => (
                  <div
                    key={item.player.id}
                    className="px-4 py-3 hover:bg-[#182338] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <PlayerAvatar
                        playerId={item.player.id}
                        name={item.player.name}
                        teamAbbr={item.player.teamAbbr}
                        size="sm"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              onInspectEntity('player', item.player.id)
                            }
                            className="font-semibold text-sm text-slate-100 hover:text-orange-400 transition-colors text-left"
                          >
                            {item.player.name}
                          </button>
                          <span className="font-mono text-slate-400">
                            {item.player.teamAbbr} · {item.player.position}
                          </span>
                          {meta.promotedToStarter && (
                            <>
                              <span className="text-slate-600">·</span>
                              <span className="text-emerald-400 font-semibold">
                                Nuevo titular
                              </span>
                            </>
                          )}
                          {meta.radarVerified && meta.radarZScore !== null && (
                            <>
                              <span className="text-slate-600">·</span>
                              <span className="font-mono text-orange-400">
                                Radar Z {meta.radarZScore >= 0 ? '+' : ''}
                                {meta.radarZScore.toFixed(1)}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono tabular-nums text-slate-300">
                          <span>
                            MIN {meta.minSeason.toFixed(1)} →{' '}
                            <strong className="text-emerald-400">
                              {meta.minRecent.toFixed(1)}
                            </strong>{' '}
                            ({meta.minDelta >= 0 ? '+' : ''}
                            {meta.minDelta.toFixed(1)})
                          </span>
                          <span className="text-slate-600">·</span>
                          <span>
                            USG {meta.usgSeason.toFixed(1)}% →{' '}
                            <strong className="text-slate-100">
                              {meta.usgRecent.toFixed(1)}%
                            </strong>{' '}
                            ({meta.usgDelta >= 0 ? '+' : ''}
                            {meta.usgDelta.toFixed(1)}%)
                          </span>
                          {meta.teammateOutName && (
                            <>
                              <span className="text-slate-600">·</span>
                              <span className="font-sans text-amber-300">
                                Relevo por baja de {meta.teammateOutName}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4 shrink-0 font-mono tabular-nums">
                      <div className="text-left lg:text-right">
                        <span className="text-slate-200 font-semibold block">
                          {item.weekly.playableGamesEst}/{item.teamSched.gamesCount} PJ est.
                          {meta.gapGamesCount > 0 && (
                            <span className="text-amber-300">
                              {' '}
                              · {meta.gapGamesCount} en huecos (
                              {meta.gapDayShortLabels.join(', ')})
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-400 font-sans">
                          {meta.sustainabilityLabel}
                        </span>
                      </div>

                      <div className="text-right min-w-[92px]">
                        <span className="font-bold text-orange-400 block">
                          {item.weekly.lockAdjustedFpts.toFixed(1)} FPTS
                        </span>
                        <span
                          className={`text-[11px] ${
                            netWeekGain >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {netWeekGain >= 0 ? '+' : ''}
                          {netWeekGain.toFixed(1)} vs corte
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleExecuteWaiverSwap(
                            item.player.id,
                            effectiveDropMember?.player.id
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-sans font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
                      >
                        {myRosterEnriched.length >=
                        OFFICIAL_LEAGUE_RULES.maxContracts
                          ? 'Alta × Corte'
                          : 'Fichar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Filters + Waiver Table */}
          <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
            <div className="p-4 border-b border-[#1E293B] bg-[#0F172A]/60 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Position Filter */}
                <div className="flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                  {(['ALL', 'G', 'F', 'C'] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setWaiverPosFilter(pos)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        waiverPosFilter === pos
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {pos === 'ALL' ? 'Todas Pos.' : pos}
                    </button>
                  ))}
                </div>

                {/* Min Weekly Games Filter */}
                <div className="flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                  {(
                    [
                      { val: 0, label: 'Cualquier PJ' },
                      { val: 3, label: '≥3 PJ sem.' },
                      { val: 4, label: '4+ PJ sem.' },
                    ] as const
                  ).map((gOpt) => (
                    <button
                      key={gOpt.val}
                      type="button"
                      onClick={() => setWaiverMinGames(gOpt.val)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        waiverMinGames === gOpt.val
                          ? 'bg-[#1E293B] text-white font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {gOpt.label}
                    </button>
                  ))}
                </div>

                {/* Role Breakout Quick Toggle */}
                <button
                  type="button"
                  onClick={() => setWaiverOnlyRoleBreakouts((prev) => !prev)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    waiverOnlyRoleBreakouts
                      ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                      : 'bg-[#0B1120] border-[#1E293B] text-emerald-400 hover:border-emerald-500/50'
                  }`}
                >
                  ▲ Rupturas Min/Uso ({streamingRadarAlerts.length})
                </button>

                {/* Sort Mode */}
                {/* Sort Mode with Info icons */}
                <div className="flex flex-wrap items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                  {WAIVER_QUICK_FILTERS.map((sOpt) => {
                    const isActive = waiverSortBy === sOpt.id && waiverTableSortKey === 'default';
                    return (
                      <div
                        key={sOpt.id}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors ${
                          isActive
                            ? 'bg-[#1E293B] text-orange-400 font-semibold shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setWaiverSortBy(sOpt.id);
                            setWaiverTableSortKey('default');
                            setWaiverTableSortAsc(false);
                          }}
                          className="whitespace-nowrap"
                        >
                          {sOpt.label}
                        </button>
                        <span
                          className="text-slate-500 hover:text-orange-400 cursor-help"
                          title={sOpt.info}
                          aria-label={sOpt.info}
                        >
                          <Info className="w-3 h-3" />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={waiverQuery}
                    onChange={(e) => setWaiverQuery(e.target.value)}
                    placeholder="Buscar agente libre..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setManagerTab('rivals_manager');
                    setRosterModalOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  Gestionar Rivales ({totalRivalPlayersCount} ocupados)
                </button>
                <ExportImageButton
                  label="Exportar Waivers PNG"
                  disabled={availableWaiverPool.length === 0}
                  title="Descargar ranking filtrado de Agentes Libres en imagen PNG"
                  onBuildImage={() =>
                    buildTableSnapshotBlob({
                      filename: `radarnba-fantasy-waivers-${activeWeek?.id || 'semana'}`,
                      categoryTag: 'Fantasy · Mercado de Agentes Libres',
                      title: `Ranking Filtrado de Waivers (${activeWeek?.label || 'Semana activa'})`,
                      subtitle: `Posición: ${waiverPosFilter === 'ALL' ? 'Todas' : waiverPosFilter}${
                        waiverMinGames > 0 ? ` · ≥${waiverMinGames} PJ` : ''
                      }${
                        effectiveDropMember
                          ? ` · Corte simulado: ${effectiveDropMember.player.name} (${effectiveDropMember.weekly.lockAdjustedFpts.toFixed(1)} FPTS)`
                          : ''
                      }`,
                      entityColumnLabel: 'Agente Libre',
                      kpis: [
                        {
                          label: 'Disponibles en filtro',
                          value: `${availableWaiverPool.length}`,
                          sublabel: `${totalRivalPlayersCount} ocupados en rivales`,
                        },
                        {
                          label: 'Mejor proyección semanal',
                          value: availableWaiverPool[0]
                            ? `${availableWaiverPool[0].weekly.lockAdjustedFpts.toFixed(1)} FPTS`
                            : '—',
                          sublabel: availableWaiverPool[0]?.player.name,
                          tone: 'accent',
                        },
                        {
                          label: 'Mayor ganancia vs corte',
                          value: availableWaiverPool[0]
                            ? `${availableWaiverPool[0].netWeekGain >= 0 ? '+' : ''}${availableWaiverPool[0].netWeekGain.toFixed(1)}`
                            : '—',
                          sublabel: effectiveDropMember
                            ? `vs ${effectiveDropMember.player.name}`
                            : 'Hueco directo',
                          tone:
                            (availableWaiverPool[0]?.netWeekGain ?? 0) >= 0
                              ? 'positive'
                              : 'negative',
                        },
                      ],
                      columns: [
                        { key: 'sched', label: 'PJ Sem.', align: 'right', widthWeight: 0.85 },
                        { key: 'seasonAvg', label: 'Media FPTS', align: 'right', widthWeight: 0.95 },
                        { key: 'last5', label: 'Últ. 5 PJ', align: 'right', widthWeight: 1.05 },
                        { key: 'weekProj', label: 'Proy. Sem.', align: 'right', widthWeight: 1.0 },
                        { key: 'netGain', label: 'Ganancia vs Corte', align: 'right', widthWeight: 1.15 },
                      ],
                      rows: availableWaiverPool.slice(0, 15).map((it, idx) => ({
                        rank: idx + 1,
                        teamAbbr: it.player.teamAbbr,
                        entityName: it.player.name,
                        entitySubtext: `${it.player.position} · ${it.stats.minutesAvg.toFixed(1)} MIN${
                          it.roleBreakout ? ` · ▲ +${it.roleBreakout.minDelta.toFixed(1)} MIN` : ''
                        }`,
                        cells: {
                          sched: {
                            text: `${it.weekly.playableGamesEst}/${it.teamSched.gamesCount} PJ`,
                            tone: 'neutral',
                          },
                          seasonAvg: {
                            text: it.stats.seasonAvgFpts.toFixed(1),
                            tone: 'neutral',
                          },
                          last5: {
                            text: `${it.stats.last5AvgFpts.toFixed(1)} (${
                              it.stats.formDeltaLast5 >= 0 ? '+' : ''
                            }${it.stats.formDeltaLast5.toFixed(1)})`,
                            tone:
                              it.stats.formDeltaLast5 >= 0 ? 'positive' : 'negative',
                          },
                          weekProj: {
                            text: `${it.weekly.lockAdjustedFpts.toFixed(1)}`,
                            tone: 'accent',
                          },
                          netGain: {
                            text: `${it.netWeekGain >= 0 ? '+' : ''}${it.netWeekGain.toFixed(1)} sem.`,
                            subtext: `${it.netPerGameGain >= 0 ? '+' : ''}${it.netPerGameGain.toFixed(1)} / PJ`,
                            tone: it.netWeekGain >= 0 ? 'positive' : 'negative',
                          },
                        },
                      })),
                    })
                  }
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-[70vh] rounded-lg border border-[#1E293B]">
              <table className="w-full text-left border-collapse table-auto">
                <thead className={STICKY_THEAD_CLASS}>
                  <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                    <SortableTh
                      label="Agente Libre"
                      align="left"
                      active={waiverTableSortKey === 'name'}
                      asc={waiverTableSortAsc}
                      onSort={() => handleWaiverTableSort('name')}
                      className="py-2 pl-3 pr-2 whitespace-nowrap"
                    />
                    <SortableTh
                      label="Total FPTS"
                      align="right"
                      active={waiverTableSortKey === 'seasonTotalFpts'}
                      asc={waiverTableSortAsc}
                      onSort={() => handleWaiverTableSort('seasonTotalFpts')}
                      className="py-2 px-2 whitespace-nowrap"
                    />
                    <SortableTh
                      label="Media FPTS"
                      align="right"
                      active={waiverTableSortKey === 'seasonAvgFpts'}
                      asc={waiverTableSortAsc}
                      onSort={() => handleWaiverTableSort('seasonAvgFpts')}
                      className="py-2 px-2 whitespace-nowrap"
                    />
                    <SortableTh
                      label="Próx. Sem."
                      align="center"
                      active={waiverTableSortKey === 'gamesNextWeek'}
                      asc={waiverTableSortAsc}
                      onSort={() => handleWaiverTableSort('gamesNextWeek')}
                      className="py-2 px-2 whitespace-nowrap"
                    />
                    <SortableTh
                      label="Últ. 7D"
                      align="right"
                      active={waiverTableSortKey === 'fpts7d'}
                      asc={waiverTableSortAsc}
                      onSort={() => handleWaiverTableSort('fpts7d')}
                      className="py-2 px-2 whitespace-nowrap"
                    />
                    <SortableTh
                      label="Últ. 15D"
                      align="right"
                      active={waiverTableSortKey === 'fpts15d'}
                      asc={waiverTableSortAsc}
                      onSort={() => handleWaiverTableSort('fpts15d')}
                      className="py-2 px-2 whitespace-nowrap"
                    />
                    <SortableTh
                      label="Últ. 30D"
                      align="right"
                      active={waiverTableSortKey === 'fpts30d'}
                      asc={waiverTableSortAsc}
                      onSort={() => handleWaiverTableSort('fpts30d')}
                      className="py-2 px-2 whitespace-nowrap"
                    />
                    <th className="py-2 px-2 text-center font-medium text-slate-400 whitespace-nowrap">
                      Desglose
                    </th>
                    <SortableTh
                      label="Acción"
                      align="right"
                      active={waiverTableSortKey === 'netWeekGain'}
                      asc={waiverTableSortAsc}
                      onSort={() => handleWaiverTableSort('netWeekGain')}
                      className="py-2 pl-2 pr-3 whitespace-nowrap"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/70 text-xs font-sans">
                  {availableWaiverPool.slice(0, 50).map((item) => {
                    const nextGamesTooltip =
                      item.nextWeekGamesList.length > 0
                        ? item.nextWeekGamesList
                            .map((g) => `${g.dayShortEs || ''} ${g.isHome ? 'vs' : '@'}${g.opponentAbbr}`)
                            .join(' · ')
                        : 'Sin partidos programados la próxima semana';

                    return (
                      <tr
                        key={item.player.id}
                        className="hover:bg-[#182338] transition-colors"
                      >
                        {/* 1. Player Info */}
                        <td className="py-1.5 pl-3 pr-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <PlayerAvatar
                              playerId={item.player.id}
                              name={item.player.name}
                              teamAbbr={item.player.teamAbbr}
                              size="xs"
                            />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onInspectEntity('player', item.player.id)}
                                className="font-semibold text-slate-100 hover:text-orange-400 text-left transition-colors truncate block max-w-[140px] xl:max-w-[180px]"
                                title={item.player.name}
                              >
                                {item.player.name}
                              </button>
                              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                <span>{item.player.teamAbbr} · {item.player.position}</span>
                                {item.stats.minutesAvg > 0 && (
                                  <>
                                    <span className="text-slate-600">·</span>
                                    <span>{item.stats.minutesAvg.toFixed(1)}m</span>
                                  </>
                                )}
                                {item.roleBreakout && (
                                  <span
                                    className="text-emerald-400 font-semibold ml-0.5"
                                    title={`Aumento de rol: +${item.roleBreakout.minDelta.toFixed(1)} MIN · +${item.roleBreakout.usgDelta.toFixed(1)}% USG`}
                                  >
                                    ▲
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Total FPTS */}
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="font-semibold text-slate-100">
                            {formatFptsExact(item.stats.seasonTotalFpts)}
                          </span>
                        </td>

                        {/* 3. Media FPTS */}
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="font-semibold text-slate-200">
                            {item.stats.seasonAvgFpts.toFixed(1)}
                          </span>
                        </td>

                        {/* 4. Próxima Semana con Tooltip Info */}
                        <td className="py-1.5 px-2 text-center whitespace-nowrap">
                          <div className="inline-flex items-center justify-center gap-1 font-mono tabular-nums text-xs">
                            <span className="font-semibold text-slate-200">
                              {item.nextWeekGamesCount} PJ
                            </span>
                            <div className="relative group/nxtwk inline-flex">
                              <button
                                type="button"
                                className="p-0.5 rounded text-slate-400 hover:text-orange-400 cursor-help"
                                title={nextGamesTooltip}
                                aria-label="Ver calendario próxima semana"
                              >
                                <Info className="w-3 h-3" />
                              </button>
                              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 hidden group-hover/nxtwk:flex flex-col z-[80] w-56 p-2 rounded-lg bg-[#0F172A] border border-[#1E293B] shadow-2xl text-[11px] pointer-events-none">
                                <span className="font-bold text-orange-400 pb-1 border-b border-[#1E293B] mb-1">
                                  Próxima Semana ({nextWeekWindow?.label || '9-15 nov'}): {item.nextWeekGamesCount} PJ
                                </span>
                                {item.nextWeekGamesList.length > 0 ? (
                                  <div className="space-y-0.5 font-mono text-[10px] text-slate-300">
                                    {item.nextWeekGamesList.map((g, idx) => (
                                      <div key={idx} className="flex items-center justify-between">
                                        <span className="text-slate-400">{g.dayShortEs || g.dateIso}</span>
                                        <span className={g.isHome ? 'text-emerald-400 font-semibold' : 'text-slate-200'}>
                                          {g.isHome ? 'vs ' : '@ '}{g.opponentAbbr}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">Sin partidos programados</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 5. Últimos 7 Días */}
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className="font-semibold text-slate-100"
                            title={`Últimos 7 días: ${formatFptsExact(item.recentStats.stats7d.total)} FPTS en ${item.recentStats.stats7d.count} PJ`}
                          >
                            {item.recentStats.stats7d.total > 0
                              ? formatFptsExact(item.recentStats.stats7d.total)
                              : '—'}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {item.recentStats.stats7d.count > 0
                              ? `${item.recentStats.stats7d.avg.toFixed(1)}/PJ (${item.recentStats.stats7d.count}P)`
                              : '0 PJ'}
                          </span>
                        </td>

                        {/* 6. Últimos 15 Días */}
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className="font-semibold text-slate-100"
                            title={`Últimos 15 días: ${formatFptsExact(item.recentStats.stats15d.total)} FPTS en ${item.recentStats.stats15d.count} PJ`}
                          >
                            {item.recentStats.stats15d.total > 0
                              ? formatFptsExact(item.recentStats.stats15d.total)
                              : '—'}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {item.recentStats.stats15d.count > 0
                              ? `${item.recentStats.stats15d.avg.toFixed(1)}/PJ (${item.recentStats.stats15d.count}P)`
                              : '0 PJ'}
                          </span>
                        </td>

                        {/* 7. Últimos 30 Días */}
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className="font-semibold text-slate-100"
                            title={`Últimos 30 días: ${formatFptsExact(item.recentStats.stats30d.total)} FPTS en ${item.recentStats.stats30d.count} PJ`}
                          >
                            {item.recentStats.stats30d.total > 0
                              ? formatFptsExact(item.recentStats.stats30d.total)
                              : '—'}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {item.recentStats.stats30d.count > 0
                              ? `${item.recentStats.stats30d.avg.toFixed(1)}/PJ (${item.recentStats.stats30d.count}P)`
                              : '0 PJ'}
                          </span>
                        </td>

                        {/* 8. Desglose con Hover y Click */}
                        <td className="py-1.5 px-2 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onMouseEnter={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              setHoveredBreakdown({
                                playerId: item.player.id,
                                top: Math.min(window.innerHeight - 340, Math.max(10, r.top - 20)),
                                right: Math.max(10, window.innerWidth - r.left + 8),
                              });
                            }}
                            onMouseLeave={() => setHoveredBreakdown(null)}
                            onClick={() => setInspectedPlayerForLogsId(item.player.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#182338] hover:bg-[#1E293B] text-slate-300 hover:text-orange-300 border border-[#1E293B] transition-colors"
                            title="Pasa el ratón para ver últimos partidos en orden descendente o haz click para auditar"
                          >
                            <Eye className="w-3 h-3 text-orange-400" />
                            <span>PJ ({item.stats.currentSeasonGamesPlayed})</span>
                          </button>
                        </td>

                        {/* 9. Acciones en Botón Único con Desplegable */}
                        <td className="py-1.5 pl-2 pr-3 text-right whitespace-nowrap">
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveActionMenuId(
                                  activeActionMenuId === item.player.id ? null : item.player.id
                                )
                              }
                              className="px-2 py-1 rounded bg-[#182338] hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 border border-[#1E293B] hover:border-orange-500/50 transition-colors inline-flex items-center gap-1 shrink-0 shadow cursor-pointer"
                              title="Asignar a mi equipo (Fichar/Alta×Corte) o a un rival"
                              aria-label={`Asignar o traspasar ${item.player.name}`}
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                              <ChevronDown className="w-3 h-3 text-slate-400" />
                            </button>

                            {activeActionMenuId === item.player.id && (
                              <div
                                className="fixed inset-0 z-40 cursor-default"
                                onClick={() => setActiveActionMenuId(null)}
                              />
                            )}

                            {activeActionMenuId === item.player.id && (
                              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg bg-[#0F172A] border border-[#334155] shadow-2xl py-1 text-left text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    handleExecuteWaiverSwap(
                                      item.player.id,
                                      effectiveDropMember?.player.id
                                    );
                                  }}
                                  className="w-full text-left px-3 py-1.5 font-semibold text-orange-400 hover:bg-[#182338] transition-colors flex items-center gap-1.5"
                                >
                                  <span>⚡</span>
                                  <span>
                                    {myRosterEnriched.length >= OFFICIAL_LEAGUE_RULES.maxContracts
                                      ? `Alta × Corte (${effectiveDropMember?.player.name || 'Seleccionar'})`
                                      : 'Fichar a mi equipo'}
                                  </span>
                                </button>
                                <div className="border-t border-[#1E293B] my-1" />
                                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  Asignar a rival...
                                </div>
                                {rivalSlotKeys.map((tKey) => (
                                  <button
                                    key={tKey}
                                    type="button"
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      handleAssignPlayerToRival(item.player.id, tKey);
                                    }}
                                    className="w-full text-left px-3 py-1 text-slate-300 hover:text-white hover:bg-[#182338] transition-colors flex items-center justify-between"
                                  >
                                    <span>{getRivalDisplayName(tKey)}</span>
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    handleAssignPlayerToRival(item.player.id, '__generic__');
                                  }}
                                  className="w-full text-left px-3 py-1 text-rose-400 hover:bg-[#182338] transition-colors"
                                >
                                  Marcar como Ocupado
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Hover Floating Breakdown Popover */}
            {hoveredBreakdown && (() => {
              const item = enrichedById.get(hoveredBreakdown.playerId);
              if (!item) return null;
              const recent = computePlayerRecentWindowStats(item.player, leagueState.gameCorrections);
              const gamesDesc = recent.gamesDesc;

              return (
                <div
                  style={{
                    position: 'fixed',
                    top: `${hoveredBreakdown.top}px`,
                    right: `${hoveredBreakdown.right}px`,
                  }}
                  className="z-50 w-80 max-w-sm bg-[#0F172A] border border-[#334155] rounded-xl shadow-2xl p-3 text-xs pointer-events-auto space-y-2 backdrop-blur-md"
                  onMouseEnter={() => {}}
                  onMouseLeave={() => setHoveredBreakdown(null)}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#1E293B]">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar
                        playerId={item.player.id}
                        name={item.player.name}
                        teamAbbr={item.player.teamAbbr}
                        size="xs"
                      />
                      <div>
                        <div className="font-bold text-slate-100">{item.player.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {item.player.teamAbbr} · {item.player.position} · {item.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setInspectedPlayerForLogsId(item.player.id);
                        setHoveredBreakdown(null);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-semibold border border-amber-500/30"
                      title="Abrir auditoría completa y correcciones"
                    >
                      Auditar ✏️
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5 font-semibold">
                    <span>Partidos 2026-27 (Descendente)</span>
                    <span className="text-orange-400 font-mono">{gamesDesc.length} PJ</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto divide-y divide-[#1E293B]/60 pr-1 no-scrollbar">
                    {gamesDesc.length === 0 ? (
                      <div className="py-4 text-center text-slate-500 text-[11px]">Sin partidos 2026-27</div>
                    ) : (
                      gamesDesc.map(({ game, totalFpts }) => (
                        <div key={game.eventId || game.date} className="py-1.5 flex items-center justify-between font-mono text-[11px]">
                          <div>
                            <span className="text-slate-200 font-semibold">{game.date?.slice(5) || ''}</span>{' '}
                            <span className={game.isHome ? 'text-emerald-400 font-medium' : 'text-slate-400'}>
                              {game.isHome ? 'vs ' : '@ '}{game.opponentAbbr}
                            </span>
                            <span className="text-slate-500 text-[10px] ml-1">{game.minutes}m</span>
                          </div>
                          <div className="text-right">
                            <span className="text-amber-300 font-bold">{formatFptsExact(totalFpts)}</span>
                            <span className="text-slate-500 text-[9px] block">
                              {game.points}p · {game.rebounds}r · {game.assists}a · {game.steals + game.blocks}st
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-1.5 border-t border-[#1E293B] text-[10px] text-slate-400 text-center">
                    Pasa el ratón o pulsa <strong className="text-amber-300">Auditar</strong> para ver estadísticas completas.
                  </div>
                </div>
              );
            })()}
          </section>
        </div>
      )}

      {/* TAB 3: OFFICIAL RULES TRADE ANALYZER */}
      {activeTab === 'trades' && (
        <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 sm:p-5 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>⚡ Simulador de Traspasos Proyectivo (Net Impact)</span>
                <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono font-normal">
                  Proyecciones ROS & Densidad
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Impacto neto calculado con proyecciones Rest-of-Season (ROS), densidad de partidos restantes según el calendario oficial y simulación de hueco streaming o corte obligatorio (Tope 12 contratos).
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={includeWaiverStreamSlotInTrade}
                onChange={(e) => setIncludeWaiverStreamSlotInTrade(e.target.checked)}
                className="accent-orange-500 rounded"
              />
              <span>Valorar hueco libre ganado en traspasos 2x1</span>
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Side A: Players Sent */}
            <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-orange-400">
                  Jugadores que Entregas
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setTradePickerSide('send');
                    setTradeSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir jugador</span>
                </button>
              </div>

              {tradeEvaluation.sendItems.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  Añade uno o varios jugadores que saldrían de {leagueState.myTeamName}.
                </p>
              ) : (
                <div className="space-y-2">
                  {tradeEvaluation.sendItems.map((item) => {
                    const rosGames = countRemainingGamesForTeam(
                      item.player.teamAbbr,
                      getEasternTodayIso()
                    );
                    const rosFpts = item.stats.weightedFptsPerGame * rosGames;
                    return (
                      <div
                        key={item.player.id}
                        className="flex items-center justify-between px-3 py-2 bg-[#131C2E] border border-[#1E293B] rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <PlayerAvatar
                            playerId={item.player.id}
                            name={item.player.name}
                            teamAbbr={item.player.teamAbbr}
                            size="xs"
                          />
                          <div>
                            <span className="font-semibold text-slate-100">
                              {item.player.name}
                            </span>
                            <span className="block text-[11px] text-slate-400 font-mono">
                              {item.player.teamAbbr} · {item.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ · {rosGames} PJ ROS (~{rosFpts.toFixed(0)} FPTS)
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setTradeSendIds((prev) =>
                              prev.filter((id) => id !== item.player.id)
                            )
                          }
                          className="text-slate-400 hover:text-rose-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {tradeEvaluation.forcedDropItem && (
                <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between">
                  <span>
                    Corte obligatorio por tope de 12:{' '}
                    <strong>{tradeEvaluation.forcedDropItem.player.name}</strong>
                  </span>
                  <span className="font-mono tabular-nums">
                    -{tradeEvaluation.forcedDropItem.stats.weightedFptsPerGame.toFixed(1)} FPTS/PJ
                  </span>
                </div>
              )}
            </div>

            {/* Side B: Players Received */}
            <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-emerald-400">
                  Jugadores que Recibes
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setTradePickerSide('receive');
                    setTradeSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir jugador</span>
                </button>
              </div>

              {tradeEvaluation.receiveItems.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  Añade los jugadores que recibirías en la operación.
                </p>
              ) : (
                <div className="space-y-2">
                  {tradeEvaluation.receiveItems.map((item) => {
                    const rivalOwner = rivalOwnerByPlayerId.get(item.player.id);
                    const rosGames = countRemainingGamesForTeam(
                      item.player.teamAbbr,
                      getEasternTodayIso()
                    );
                    const rosFpts = item.stats.weightedFptsPerGame * rosGames;
                    return (
                      <div
                        key={item.player.id}
                        className="flex items-center justify-between px-3 py-2 bg-[#131C2E] border border-[#1E293B] rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <PlayerAvatar
                            playerId={item.player.id}
                            name={item.player.name}
                            teamAbbr={item.player.teamAbbr}
                            size="xs"
                          />
                          <div>
                            <span className="font-semibold text-slate-100">
                              {item.player.name}
                            </span>
                            <span className="block text-[11px] text-slate-400 font-mono">
                              {item.player.teamAbbr} · {item.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ · {rosGames} PJ ROS (~{rosFpts.toFixed(0)} FPTS)
                              {rivalOwner ? ` · En ${rivalOwner.teamName}` : ''}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setTradeReceiveIds((prev) =>
                              prev.filter((id) => id !== item.player.id)
                            )
                          }
                          className="text-slate-400 hover:text-rose-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {tradeEvaluation.addedStreamItem && (
                <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 flex items-center justify-between">
                  <span>
                    Hueco libre ganado (Mejor Agente Libre:{' '}
                    <strong>{tradeEvaluation.addedStreamItem.player.name}</strong>)
                  </span>
                  <span className="font-mono tabular-nums">
                    +{tradeEvaluation.addedStreamItem.stats.weightedFptsPerGame.toFixed(1)} FPTS/PJ
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Detailed Rule-by-Rule Trade Comparison */}
          {(tradeEvaluation.sendItems.length > 0 ||
            tradeEvaluation.receiveItems.length > 0) && (
            <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-xs sm:text-sm font-bold">
                  <span className="font-sans text-xs font-semibold text-slate-200">
                    Veredicto Neto Oficial:
                  </span>
                  <span
                    className={
                      tradeEvaluation.netPerGame >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    Por partido: {tradeEvaluation.netPerGame >= 0 ? '+' : ''}
                    {tradeEvaluation.netPerGame.toFixed(1)} FPTS/PJ
                  </span>
                  <span
                    className={
                      tradeEvaluation.netWeek >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    {activeWeek?.label || 'Semana'}:{' '}
                    {tradeEvaluation.netWeek >= 0 ? '+' : ''}
                    {tradeEvaluation.netWeek.toFixed(1)} FPTS
                  </span>
                  <span
                    className={
                      tradeEvaluation.netRosTotalFpts >= 0
                        ? 'text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 px-2 py-0.5 rounded text-xs'
                        : 'text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded text-xs'
                    }
                  >
                    Impacto ROS: {tradeEvaluation.netRosTotalFpts >= 0 ? '+' : ''}
                    {tradeEvaluation.netRosTotalFpts.toFixed(1)} FPTS Resto Temporada ({tradeEvaluation.receiveSum.rosRemainingGames} PJ vs {tradeEvaluation.sendSum.rosRemainingGames} PJ rest.)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ExportImageButton
                    label="Exportar tarjeta traspaso"
                    title="Descargar tarjeta comparativa del traspaso Fantasy en imagen PNG"
                    onBuildImage={() => {
                      const rawBlocks = [
                        {
                          label: 'Aciertos de tiro (+2 FGM · +1 3PM · +1 FTM)',
                          a: tradeEvaluation.sendSum.makePts,
                          b: tradeEvaluation.receiveSum.makePts,
                        },
                        {
                          label: 'Castigo por fallos (-1 FGMI · +0.5 3PMI · -1 FTMI)',
                          a: tradeEvaluation.sendSum.missPenaltyPts,
                          b: tradeEvaluation.receiveSum.missPenaltyPts,
                        },
                        {
                          label: 'Rebotes (+1.5 OREB · +0.75 DREB)',
                          a: tradeEvaluation.sendSum.rebPts,
                          b: tradeEvaluation.receiveSum.rebPts,
                        },
                        {
                          label: 'Creación y Defensa (+1.5 AST · +2.5 STL · +2.5 BLK)',
                          a: tradeEvaluation.sendSum.playDefPts,
                          b: tradeEvaluation.receiveSum.playDefPts,
                        },
                        {
                          label: 'Penalizaciones (-2.0 TO · -5.0 EJ)',
                          a: tradeEvaluation.sendSum.negPts,
                          b: tradeEvaluation.receiveSum.negPts,
                        },
                      ];

                      return buildComparisonSnapshotBlob({
                        filename: `radarnba-traspaso-fantasy-${
                          tradeEvaluation.sendItems[0]?.player.name || 'envia'
                        }-vs-${
                          tradeEvaluation.receiveItems[0]?.player.name || 'recibe'
                        }`,
                        categoryTag: 'Fantasy · Analizador Oficial de Traspasos',
                        title: `Evaluación de Traspaso · ${leagueState.myTeamName}`,
                        subtitle: `Reglamento oficial FPTS (Tope 12 contratos · ${
                          activeWeek?.label || 'Semana activa'
                        })`,
                        verdictLabel: 'Veredicto Neto Oficial:',
                        verdictPrimary: `Por partido: ${
                          tradeEvaluation.netPerGame >= 0 ? '+' : ''
                        }${tradeEvaluation.netPerGame.toFixed(1)} FPTS/PJ`,
                        verdictPrimaryTone:
                          tradeEvaluation.netPerGame >= 0
                            ? 'positive'
                            : 'negative',
                        verdictSecondary: `${activeWeek?.label || 'Semana'}: ${
                          tradeEvaluation.netWeek >= 0 ? '+' : ''
                        }${tradeEvaluation.netWeek.toFixed(1)} FPTS`,
                        verdictSecondaryTone:
                          tradeEvaluation.netWeek >= 0 ? 'positive' : 'negative',
                        sideA: {
                          headerLabel: 'Jugadores que Entregas',
                          accentTone: 'orange',
                          headlineTitle: `${tradeEvaluation.sendItems.length} jugador${
                            tradeEvaluation.sendItems.length === 1 ? '' : 'es'
                          } saliente${
                            tradeEvaluation.sendItems.length === 1 ? '' : 's'
                          }`,
                          headlineValue: `${tradeEvaluation.sendSum.weightedFpts.toFixed(
                            1
                          )} FPTS/PJ`,
                          headlineSubtext: `Volumen ${
                            activeWeek?.label || 'semanal'
                          }: ${tradeEvaluation.sendSum.weekFpts.toFixed(1)} FPTS (${
                            tradeEvaluation.sendSum.weekGames
                          } PJ)`,
                          items: tradeEvaluation.sendItems.map((it) => ({
                            name: it.player.name,
                            teamAbbr: it.player.teamAbbr,
                            detail: `${it.player.position} · ${formatFptsExact(
                              it.stats.seasonTotalFpts
                            )} tot · ${it.teamSched.gamesCount} PJ sem.`,
                            badgeText: `${it.stats.seasonAvgFpts.toFixed(1)} / PJ`,
                            badgeTone: 'accent',
                          })),
                          calloutText: tradeEvaluation.forcedDropItem
                            ? `Corte obligatorio (tope 12): ${tradeEvaluation.forcedDropItem.player.name} (-${tradeEvaluation.forcedDropItem.stats.weightedFptsPerGame.toFixed(1)} FPTS/PJ)`
                            : undefined,
                          calloutTone: 'negative',
                        },
                        sideB: {
                          headerLabel: 'Jugadores que Recibes',
                          accentTone: 'emerald',
                          headlineTitle: `${tradeEvaluation.receiveItems.length} jugador${
                            tradeEvaluation.receiveItems.length === 1 ? '' : 'es'
                          } entrante${
                            tradeEvaluation.receiveItems.length === 1 ? '' : 's'
                          }`,
                          headlineValue: `${tradeEvaluation.receiveSum.weightedFpts.toFixed(
                            1
                          )} FPTS/PJ`,
                          headlineSubtext: `Volumen ${
                            activeWeek?.label || 'semanal'
                          }: ${tradeEvaluation.receiveSum.weekFpts.toFixed(1)} FPTS (${
                            tradeEvaluation.receiveSum.weekGames
                          } PJ)`,
                          items: tradeEvaluation.receiveItems.map((it) => ({
                            name: it.player.name,
                            teamAbbr: it.player.teamAbbr,
                            detail: `${it.player.position} · ${formatFptsExact(
                              it.stats.seasonTotalFpts
                            )} tot · ${it.teamSched.gamesCount} PJ sem.`,
                            badgeText: `${it.stats.seasonAvgFpts.toFixed(1)} / PJ`,
                            badgeTone: 'positive',
                          })),
                          calloutText: tradeEvaluation.addedStreamItem
                            ? `Hueco streaming 2x1: +${tradeEvaluation.addedStreamItem.player.name} (+${tradeEvaluation.addedStreamItem.stats.weightedFptsPerGame.toFixed(1)} FPTS/PJ)`
                            : undefined,
                          calloutTone: 'positive',
                        },
                        breakdownTitle: 'Bloque del Reglamento Oficial FPTS',
                        colALabel: 'Entregas / PJ',
                        colBLabel: 'Recibes / PJ',
                        colDeltaLabel: 'Diferencia',
                        rows: rawBlocks.map((b) => {
                          const diff = b.b - b.a;
                          const absSum = Math.abs(b.a) + Math.abs(b.b);
                          const shareA =
                            absSum > 0.01
                              ? Math.round((Math.abs(b.a) / absSum) * 100)
                              : 50;
                          return {
                            label: b.label,
                            valAText: b.a.toFixed(2),
                            valBText: b.b.toFixed(2),
                            deltaText: `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`,
                            deltaTone:
                              Math.abs(diff) < 0.02
                                ? 'muted'
                                : diff > 0
                                ? 'positive'
                                : 'negative',
                            winner:
                              Math.abs(diff) < 0.02
                                ? 'tie'
                                : diff > 0
                                ? 'B'
                                : 'A',
                            shareA,
                          };
                        }),
                      });
                    }}
                  />

                  {tradeEvaluation.sendItems.length > 0 &&
                    tradeEvaluation.receiveItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleApplyTradeToLeague}
                        className="px-3.5 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Aplicar traspaso en plantillas guardadas
                      </button>
                    )}
                </div>
              </div>

              <div className="overflow-auto max-h-[52vh]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className={STICKY_THEAD_CLASS}>
                    <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                      <SortableTh
                        label="Bloque del Reglamento Oficial"
                        align="left"
                        active={tradeTableSortKey === 'label'}
                        asc={tradeTableSortAsc}
                        onSort={() => toggleTradeTableSort('label')}
                        className="py-2 px-4"
                      />
                      <SortableTh
                        label="Entregas / PJ"
                        align="right"
                        active={tradeTableSortKey === 'send'}
                        asc={tradeTableSortAsc}
                        onSort={() => toggleTradeTableSort('send')}
                        className="py-2 px-3"
                      />
                      <SortableTh
                        label="Recibes / PJ"
                        align="right"
                        active={tradeTableSortKey === 'receive'}
                        asc={tradeTableSortAsc}
                        onSort={() => toggleTradeTableSort('receive')}
                        className="py-2 px-3"
                      />
                      <SortableTh
                        label="Diferencia"
                        align="right"
                        active={tradeTableSortKey === 'diff'}
                        asc={tradeTableSortAsc}
                        onSort={() => toggleTradeTableSort('diff')}
                        className="py-2 px-4"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]/60 font-mono tabular-nums">
                    {(() => {
                      const rawTradeRows = [
                        {
                          label: 'Simulación Proyectiva ROS (FPTS totales Resto Temporada por volumen de calendario)',
                          a: tradeEvaluation.sendSum.rosTotalFpts,
                          b: tradeEvaluation.receiveSum.rosTotalFpts,
                        },
                        {
                          label: 'Aciertos de tiro (+2 FGM · +1 3PM · +1 FTM)',
                          a: tradeEvaluation.sendSum.makePts,
                          b: tradeEvaluation.receiveSum.makePts,
                        },
                        {
                          label: 'Castigo por fallos (-1 FGMI · +0.5 3PMI · -1 FTMI)',
                          a: tradeEvaluation.sendSum.missPenaltyPts,
                          b: tradeEvaluation.receiveSum.missPenaltyPts,
                        },
                        {
                          label: 'Rebotes (+1.5 OREB · +0.75 DREB)',
                          a: tradeEvaluation.sendSum.rebPts,
                          b: tradeEvaluation.receiveSum.rebPts,
                        },
                        {
                          label: 'Creación y Defensa (+1.5 AST · +2.5 STL · +2.5 BLK)',
                          a: tradeEvaluation.sendSum.playDefPts,
                          b: tradeEvaluation.receiveSum.playDefPts,
                        },
                        {
                          label: 'Penalizaciones (-2.0 TO · -5.0 EJ)',
                          a: tradeEvaluation.sendSum.negPts,
                          b: tradeEvaluation.receiveSum.negPts,
                        },
                      ];
                      const tradeRows = tradeTableSortKey
                        ? sortRows(
                            rawTradeRows,
                            (r) => {
                              switch (tradeTableSortKey) {
                                case 'label':
                                  return r.label;
                                case 'send':
                                  return r.a;
                                case 'receive':
                                  return r.b;
                                case 'diff':
                                  return r.b - r.a;
                                default:
                                  return r.label;
                              }
                            },
                            tradeTableSortAsc
                          )
                        : rawTradeRows;
                      return tradeRows;
                    })().map((row) => {
                      const diff = row.b - row.a;
                      return (
                        <tr key={row.label} className="hover:bg-[#182338]/60 transition-colors">
                          <td className="py-2 px-4 font-sans text-slate-300">
                            {row.label}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {row.a.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-100 font-semibold">
                            {row.b.toFixed(2)}
                          </td>
                          <td
                            className={`py-2 px-4 text-right font-semibold ${
                              diff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {diff >= 0 ? '+' : ''}
                            {diff.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: INJURIES (0-FPTS LOCK RISK) & OFFICIAL SCORING AUDIT */}
      {activeTab === 'injuries_rules' && (
        <div className="space-y-5">
          {/* Panel A: Active Medical Alerts + Same-Team Rotation Streamers */}
          <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Clasificación Inteligente de Bajas & Relevos de Rotación (Riesgo Cierre Lunes)
                </h3>
                <p className="text-xs text-slate-400">
                  Distingue bajas puntuales (DTD / Cuestionable y descansos en Back-to-Back) frente a lesionados de larga duración (Out / IR · 0.0 PJ) y señala los relevos sanos con subida de rol.
                </p>
              </div>

              <div className="inline-flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs shrink-0">
                {(
                  [
                    { id: 'all', label: 'Todas las alertas' },
                    { id: 'punctual_b2b', label: 'Puntuales y B2B' },
                    { id: 'long_term', label: 'Larga duración (Out/IR)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setInjuryTierFilter(opt.id)}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                      injuryTierFilter === opt.id
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {injuryRotationCards.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No se registran partes médicos ni alertas de descanso en este filtro.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {injuryRotationCards.map(
                  ({ injItem, isOnMyRoster, beneficiaries }) => (
                    <div
                      key={injItem.player.id}
                      className={`bg-[#0B1120] border rounded-lg p-3.5 space-y-2.5 ${
                        isOnMyRoster ? 'border-rose-500/50' : 'border-[#1E293B]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <PlayerAvatar
                            playerId={injItem.player.id}
                            name={injItem.player.name}
                            teamAbbr={injItem.player.teamAbbr}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  onInspectEntity('player', injItem.player.id)
                                }
                                className="font-semibold text-sm text-slate-100 hover:text-orange-400 truncate"
                              >
                                {injItem.player.name}
                              </button>
                              {isOnMyRoster && (
                                <span className="text-[11px] font-semibold text-orange-400 whitespace-nowrap">
                                  · {leagueState.myTeamName}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono tabular-nums">
                              {injItem.player.teamAbbr} · {injItem.player.position} ·{' '}
                              {injItem.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ
                            </div>
                          </div>
                        </div>

                        <div className="text-right text-xs shrink-0">
                          {renderSeverityText(
                            injItem.severity,
                            injItem.injury?.statusLabelEs,
                            injItem.weekly.absenceTier,
                            injItem.weekly.absenceLabelEs
                          )}
                          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                            {injItem.weekly.playableGamesEst}/{injItem.teamSched.gamesCount} PJ est. ·{' '}
                            {injItem.weekly.lockAdjustedFpts.toFixed(1)} FPTS
                          </div>
                        </div>
                      </div>

                      {(injItem.injury?.detailEs || injItem.weekly.riskWarningEs) && (
                        <p className="text-xs text-slate-300">
                          {injItem.injury?.detailEs
                            ? `Parte médico: ${injItem.injury.detailEs}`
                            : injItem.weekly.riskWarningEs}
                        </p>
                      )}

                      {beneficiaries.length > 0 && (
                        <div className="pt-2 border-t border-[#1E293B] space-y-1.5">
                          <p className="text-[11px] text-slate-400">
                            Compañeros sanos que suben rotación ({injItem.player.teamAbbr}):
                          </p>
                          {beneficiaries.map((ben) => {
                            const benBreakout = roleBreakoutByPlayerId.get(ben.player.id);
                            return (
                              <div
                                key={ben.player.id}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    onInspectEntity('player', ben.player.id)
                                  }
                                  className="text-slate-200 hover:text-orange-400 font-medium truncate text-left"
                                >
                                  {ben.player.name} ({ben.player.position}) ·{' '}
                                  {renderAvailabilityLabel(ben.player.id)}
                                  {benBreakout && (
                                    <span className="text-emerald-400 font-mono ml-1">
                                      · ▲ +{benBreakout.minDelta.toFixed(1)} MIN
                                    </span>
                                  )}
                                </button>
                                <span className="font-mono tabular-nums text-slate-300 shrink-0">
                                  {ben.stats.last5AvgFpts.toFixed(1)} FPTS (5P) ·{' '}
                                  {ben.teamSched.gamesCount} PJ
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          {/* Panel B: Verifiable Game-by-Game Official Scoring Breakdown */}
          <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
            <div className="p-4 border-b border-[#1E293B] bg-[#0F172A]/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Auditoría Exacta de Puntuación por Partido (Temporada 2026-27)
                </h3>
                <p className="text-xs text-slate-400">
                  Fórmula activa: +2 FGM · -1 FGMI · +1 FTM · -1 FTMI · +1 3PM · +0.5 3PMI · +1.5 OREB · +0.75 DREB · +1.5 AST · +2.5 STL · +2.5 BLK · -2 TO · -5 EJ
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Filtrar jugador a auditar..."
                  className="px-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 w-44"
                />
                <select
                  value={auditedPlayerItem?.player.id || ''}
                  onChange={(e) => setAuditPlayerId(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500 max-w-[250px]"
                >
                  {enrichedCatalog
                    .filter((x) =>
                      !auditSearch.trim()
                        ? true
                        : normalizeSearchText(
                            `${x.player.name} ${x.player.teamAbbr}`
                          ).includes(normalizeSearchText(auditSearch))
                    )
                    .slice(0, 80)
                    .map((x) => (
                      <option key={x.player.id} value={x.player.id}>
                        {x.player.name} ({x.player.teamAbbr}) ·{' '}
                        {formatFptsExact(x.stats.seasonTotalFpts)} tot ·{' '}
                        {x.stats.seasonAvgFpts.toFixed(1)} med
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {auditedPlayerItem && (
              <>
                <div className="px-4 py-2.5 bg-[#0B1120]/80 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-x-2 text-slate-300">
                    <span className="font-semibold text-slate-100">
                      {auditedPlayerItem.player.name} ({auditedPlayerItem.player.teamAbbr})
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{renderAvailabilityLabel(auditedPlayerItem.player.id)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 font-mono tabular-nums">
                    <span className="text-slate-300">
                      PJ 2026-27:{' '}
                      <strong className="text-slate-100">
                        {auditedPlayerItem.stats.currentSeasonGamesPlayed}
                      </strong>
                    </span>
                    <span className="text-slate-300">
                      Total Acumulado:{' '}
                      <strong className="text-emerald-400">
                        {formatFptsExact(auditedPlayerItem.stats.seasonTotalFpts)} FPTS
                      </strong>
                    </span>
                    <span className="text-slate-300">
                      Media Oficial:{' '}
                      <strong className="text-orange-400">
                        {auditedPlayerItem.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="overflow-auto max-h-[62vh]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className={STICKY_THEAD_CLASS}>
                      <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                        <SortableTh
                          label="Fecha / Rival"
                          align="left"
                          compact
                          active={auditSortKey === 'date'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('date')}
                          className="py-2.5 pl-4 pr-2"
                        />
                        <SortableTh
                          label="FGM (+2)"
                          align="right"
                          compact
                          active={auditSortKey === 'fgm'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('fgm')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="FGMI (-1)"
                          align="right"
                          compact
                          active={auditSortKey === 'fgmi'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('fgmi')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="3PM (+1)"
                          align="right"
                          compact
                          active={auditSortKey === 'fg3m'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('fg3m')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="3PMI (+0.5)"
                          align="right"
                          compact
                          active={auditSortKey === 'fg3mi'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('fg3mi')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="FTM (+1)"
                          align="right"
                          compact
                          active={auditSortKey === 'ftm'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('ftm')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="FTMI (-1)"
                          align="right"
                          compact
                          active={auditSortKey === 'ftmi'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('ftmi')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="OREB (+1.5)"
                          align="right"
                          compact
                          active={auditSortKey === 'oreb'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('oreb')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="DREB (+0.75)"
                          align="right"
                          compact
                          active={auditSortKey === 'dreb'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('dreb')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="AST (+1.5)"
                          align="right"
                          compact
                          active={auditSortKey === 'ast'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('ast')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="STL/BLK (+2.5)"
                          align="right"
                          compact
                          active={auditSortKey === 'stocks'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('stocks')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="TO (-2)"
                          align="right"
                          compact
                          active={auditSortKey === 'tov'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('tov')}
                          className="py-2.5 px-2"
                        />
                        <SortableTh
                          label="Total FPTS"
                          align="right"
                          compact
                          active={auditSortKey === 'totalFpts'}
                          asc={auditSortAsc}
                          onSort={() => toggleAuditSort('totalFpts')}
                          className="py-2.5 pl-2 pr-4"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]/70 font-mono tabular-nums">
                      {(() => {
                        const baseAuditRows = auditedPlayerItem.player.games
                          .filter((g) =>
                            auditedPlayerItem.stats.currentSeasonGamesPlayed > 0
                              ? g.seasonLabel === '2026-27'
                              : true
                          )
                          .slice(0, 15)
                          .map((g) => ({
                            g,
                            b: computeOfficialGameFptsBreakdown(g, 0),
                          }));
                        if (!auditSortKey) return baseAuditRows;
                        return sortRows(
                          baseAuditRows,
                          ({ g, b }) => {
                            switch (auditSortKey) {
                              case 'date':
                                return g.date;
                              case 'fgm':
                                return b.fgm;
                              case 'fgmi':
                                return b.fgmi;
                              case 'fg3m':
                                return b.fg3m;
                              case 'fg3mi':
                                return b.fg3mi;
                              case 'ftm':
                                return b.ftm;
                              case 'ftmi':
                                return b.ftmi;
                              case 'oreb':
                                return b.oreb;
                              case 'dreb':
                                return b.dreb;
                              case 'ast':
                                return b.ast;
                              case 'stocks':
                                return b.stl + b.blk;
                              case 'tov':
                                return b.tov;
                              case 'totalFpts':
                                return b.totalFpts;
                              default:
                                return g.date;
                            }
                          },
                          auditSortAsc
                        );
                      })().map(({ g, b }) => {
                          return (
                            <tr
                              key={`${g.eventId}-${g.date}`}
                              className="hover:bg-[#182338]"
                            >
                              <td className="py-2 pl-4 pr-2 whitespace-nowrap font-sans text-slate-200">
                                <span className="font-mono text-slate-400">
                                  {formatShortDate(g.date)}
                                </span>{' '}
                                · {g.isHome ? 'vs' : '@'} {g.opponentAbbr}
                              </td>
                              <td className="py-2 px-2 text-right text-slate-200">
                                {b.fgm} ({b.fgmPts > 0 ? `+${formatFptsExact(b.fgmPts)}` : '0'})
                              </td>
                              <td className="py-2 px-2 text-right text-rose-300">
                                {b.fgmi} ({formatFptsExact(b.fgmiPts)})
                              </td>
                              <td className="py-2 px-2 text-right text-slate-200">
                                {b.fg3m} ({b.fg3mPts > 0 ? `+${formatFptsExact(b.fg3mPts)}` : '0'})
                              </td>
                              <td className="py-2 px-2 text-right text-emerald-300">
                                {b.fg3mi} ({b.fg3miPts > 0 ? `+${formatFptsExact(b.fg3miPts)}` : '0'})
                              </td>
                              <td className="py-2 px-2 text-right text-slate-200">
                                {b.ftm} ({b.ftmPts > 0 ? `+${formatFptsExact(b.ftmPts)}` : '0'})
                              </td>
                              <td className="py-2 px-2 text-right text-rose-300">
                                {b.ftmi} ({formatFptsExact(b.ftmiPts)})
                              </td>
                              <td className="py-2 px-2 text-right text-slate-200">
                                {b.oreb} ({b.orebPts > 0 ? `+${formatFptsExact(b.orebPts)}` : '0'})
                              </td>
                              <td className="py-2 px-2 text-right text-slate-200">
                                {b.dreb} ({b.drebPts > 0 ? `+${formatFptsExact(b.drebPts)}` : '0'})
                              </td>
                              <td className="py-2 px-2 text-right text-slate-200">
                                {b.ast} ({b.astPts > 0 ? `+${formatFptsExact(b.astPts)}` : '0'})
                              </td>
                              <td className="py-2 px-2 text-right text-emerald-300">
                                {b.stl + b.blk} (
                                {b.stlPts + b.blkPts > 0
                                  ? `+${formatFptsExact(b.stlPts + b.blkPts)}`
                                  : '0'}
                                )
                              </td>
                              <td className="py-2 px-2 text-right text-rose-400">
                                {b.tov} ({formatFptsExact(b.tovPts)})
                              </td>
                              <td className="py-2 pl-2 pr-4 text-right font-bold text-orange-400">
                                {formatFptsExact(b.totalFpts)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: REGLAS Y NORMATIVA OFICIAL */}
      {activeTab === 'rules' && (
        <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 sm:p-6 space-y-6 text-xs text-slate-300">
          <div className="space-y-1 pb-4 border-b border-[#1E293B]">
            <h2 className="text-base sm:text-lg font-bold text-slate-100">
              5. Reglamento Oficial y Criterios de Puntuación de la Liga
            </h2>
            <p className="text-slate-400">
              Resumen íntegro de las normas operativas de plantilla, bloqueo semanal de los lunes, gestión manual del mercado y tabla oficial de pesos FPTS aplicada en todos los cálculos de la plataforma.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-2 border-b border-[#1E293B]">
            {/* 1. ESTRUCTURA Y BLOQUEO */}
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-100 text-sm">
                01. Estructura de Plantilla, Mercado y Bloqueo Semanal
              </h3>
              <ul className="space-y-2.5 text-slate-400 leading-relaxed">
                <li>
                  <strong className="text-slate-200">Tope estricto de 12 contratos:</strong>{' '}
                  Ningún equipo puede superar los <strong className="text-orange-400">12 jugadores</strong> simultáneos. Con la plantilla llena (12/12), cualquier fichaje de Agente Libre exige cortar obligatoriamente a 1 jugador (Alta × Corte).
                </li>
                <li>
                  <strong className="text-slate-200">10 Titulares + 2 Reservas:</strong>{' '}
                  Únicamente los 10 jugadores alineados como titulares suman puntos durante la semana; los 2 jugadores en banquillo quedan de reserva sin puntuar.
                </li>
                <li>
                  <strong className="text-slate-200">Bloqueo semanal estricto (Madrugada del lunes):</strong>{' '}
                  Las alineaciones se cierran con el salto inicial del primer partido del lunes. No existen cambios diarios ni sustituciones entre semana.
                </li>
                <li>
                  <strong className="text-slate-200">Penalización real por baja o descanso (0.0 FPTS):</strong>{' '}
                  Todo partido perdido por lesión (OUT), sanción o descanso tras el cierre del lunes computa <strong className="text-rose-400">0.0 FPTS</strong> sin reemplazo posible.
                </li>
                <li>
                  <strong className="text-slate-200">Volumen semanal esperado:</strong>{' '}
                  Se rige por la relación <span className="font-mono text-slate-200">Partidos de la Semana × Media FPTS/Partido</span>, ponderando disponibilidad física antes del bloqueo.
                </li>
              </ul>
            </div>

            {/* 2. COMPROBACIÓN EN VIVO DE PUNTOS */}
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-100 text-sm">
                02. Comprobación en Vivo sobre Temporada 2026-27
              </h3>
              <p className="text-slate-400 leading-relaxed">
                Cálculo automático verificado sobre las actas oficiales 2026-27 aplicando exactamente la tabla inferior. Pulsa sobre cualquier jugador para inspeccionar el desglose tiro a tiro de cada noche:
              </p>
              <div className="divide-y divide-[#1E293B] border border-[#1E293B] rounded-lg bg-[#0B1120] overflow-hidden">
                {referenceValidationPlayers.map((item) => (
                  <div
                    key={item.player.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-100 block truncate">
                        {item.player.name} ({item.player.teamAbbr})
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {item.stats.currentSeasonGamesPlayed} partidos jugados en 2026-27
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                      <div className="text-right">
                        <span className="text-emerald-400 font-bold block">
                          {formatFptsExact(item.stats.seasonTotalFpts)} FPTS
                        </span>
                        <span className="text-[11px] text-orange-400">
                          Media {item.stats.seasonAvgFpts.toFixed(1)} / PJ
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAuditPlayerId(item.player.id);
                          setActiveTab('injuries_rules');
                        }}
                        className="px-2.5 py-1 rounded bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/60 text-slate-200 font-sans text-[11px] transition-colors"
                      >
                        Ver partidos
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. TABLA OFICIAL DE PUNTUACIÓN */}
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-100 text-sm">
              03. Tabla Oficial del Sistema de Puntuación (13 Categorías FPTS)
            </h3>
            <div className="overflow-auto max-h-[60vh] border border-[#1E293B] rounded-lg bg-[#0B1120]">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead className={STICKY_THEAD_CLASS}>
                  <tr className="border-b border-[#1E293B] text-slate-400">
                    <SortableTh
                      label="Acción Estadística"
                      align="left"
                      active={rulesSortKey === 'action'}
                      asc={rulesSortAsc}
                      onSort={() => toggleRulesSort('action')}
                      className="py-2.5 px-3.5 font-sans"
                    />
                    <SortableTh
                      label="Código"
                      align="left"
                      active={rulesSortKey === 'code'}
                      asc={rulesSortAsc}
                      onSort={() => toggleRulesSort('code')}
                      className="py-2.5 px-3 font-sans"
                    />
                    <SortableTh
                      label="Valor FPTS"
                      align="right"
                      active={rulesSortKey === 'fpts'}
                      asc={rulesSortAsc}
                      onSort={() => toggleRulesSort('fpts')}
                      className="py-2.5 px-3 font-sans"
                    />
                    <SortableTh
                      label="Aplicación Exacta en el Cálculo"
                      align="left"
                      active={rulesSortKey === 'description'}
                      asc={rulesSortAsc}
                      onSort={() => toggleRulesSort('description')}
                      className="py-2.5 px-3.5 font-sans"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/80">
                  {(rulesSortKey
                    ? sortRows(
                        OFFICIAL_SCORING_CATEGORIES_ROWS,
                        (r) => {
                          switch (rulesSortKey) {
                            case 'action':
                              return r.action;
                            case 'code':
                              return r.code;
                            case 'fpts':
                              return r.fptsVal;
                            case 'description':
                              return r.description;
                            default:
                              return r.action;
                          }
                        },
                        rulesSortAsc
                      )
                    : OFFICIAL_SCORING_CATEGORIES_ROWS
                  ).map((r) => (
                    <tr
                      key={r.code}
                      className="hover:bg-[#182338]/60 transition-colors"
                    >
                      <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">
                        {r.action}
                      </td>
                      <td className="py-2 px-3 text-orange-400">{r.code}</td>
                      <td
                        className={`py-2 px-3 text-right font-bold ${
                          r.tone === 'positive'
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {r.fptsDisplay}
                      </td>
                      <td className="py-2 px-3.5 text-slate-400 font-sans">
                        {r.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* MODAL 1: MANUAL LEAGUE & RIVAL ROSTERS MANAGER (PERMANENT STORAGE) */}
      {rosterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-[2px]"
            onClick={() => {
              setRosterModalOpen(false);
              setMyTeamPasteFeedback(null);
              setRivalPasteFeedback(null);
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-3xl bg-[#0F172A] border border-[#1E293B] rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Gestor Manual de Liga Privada (Guardado Permanente)
                </h3>
                <p className="text-xs text-slate-400">
                  {myRosterEnriched.length}/12 contratos en {leagueState.myTeamName} ·{' '}
                  {activeRivalTeamsCount} equipos rivales con plantilla ({totalRivalPlayersCount} jugadores ocupados)
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRosterModalOpen(false);
                  setMyTeamPasteFeedback(null);
                  setRivalPasteFeedback(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Sub-Tabs */}
            <div className="px-5 pt-3 pb-3 border-b border-[#1E293B] flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setManagerTab('my_team')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  managerTab === 'my_team'
                    ? 'bg-orange-500 text-slate-950'
                    : 'bg-[#0B1120] text-slate-300 hover:text-white'
                }`}
              >
                1. Mi Equipo ({myRosterEnriched.length}/12)
              </button>
              <button
                type="button"
                onClick={() => setManagerTab('rivals_manager')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  managerTab === 'rivals_manager'
                    ? 'bg-orange-500 text-slate-950'
                    : 'bg-[#0B1120] text-slate-300 hover:text-white'
                }`}
              >
                2. Equipos Rivales ({activeRivalTeamsCount} equipos · {totalRivalPlayersCount} jug.)
              </button>
              <button
                type="button"
                onClick={() => {
                  setManagerTab('backup');
                  setCloudSyncFeedback(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  managerTab === 'backup'
                    ? 'bg-orange-500 text-slate-950'
                    : 'bg-[#0B1120] text-slate-300 hover:text-white'
                }`}
              >
                3. Sincronización Nube y Copia (.json)
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {/* SUB-TAB 1: MY TEAM */}
              {managerTab === 'my_team' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-medium">
                        Nombre de tu equipo
                      </label>
                      <input
                        type="text"
                        value={leagueState.myTeamName}
                        onChange={(e) => {
                          const val = e.target.value;
                          commitLeagueState((prev) => ({
                            ...prev,
                            myTeamName: val,
                          }));
                        }}
                        placeholder="Ej. Mi Equipo Fantasy"
                        className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setMyTeamPasteOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-slate-200 rounded-lg transition-colors"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5 text-orange-400" />
                        <span>
                          {myTeamPasteOpen ? 'Ocultar pegado de lista' : 'Pegar lista de mis 12 jugadores'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {myTeamPasteOpen && (
                    <div className="p-3.5 bg-[#0B1120] border border-[#1E293B] rounded-lg space-y-2.5">
                      <p className="text-xs text-slate-400">
                        Escribe o pega aquí los nombres de tus jugadores (uno por línea, separados por comas o copiando la tabla de tu plantilla):
                      </p>
                      <textarea
                        rows={4}
                        value={myTeamPasteBuffer}
                        onChange={(e) => setMyTeamPasteBuffer(e.target.value)}
                        placeholder="Ej: Shai Gilgeous-Alexander, Jamal Murray, Domantas Sabonis..."
                        className="w-full p-2.5 text-xs bg-[#0F172A] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 font-mono"
                      />
                      {myTeamPasteFeedback && (
                        <p className="text-xs text-emerald-400">{myTeamPasteFeedback}</p>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleProcessMyTeamPaste}
                          className="px-3.5 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors"
                        >
                          Guardar jugadores detectados en mi equipo
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Current 12 Roster Contracts */}
                  {myRosterEnriched.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">
                          Plantilla guardada ({myRosterEnriched.length}/12 contratos):
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            commitLeagueState((prev) => ({ ...prev, roster: [] }))
                          }
                          className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Vaciar mi plantilla</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {myRosterEnriched.map((r) => (
                          <div
                            key={r.player.id}
                            className="flex items-center justify-between px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs"
                          >
                            <div className="min-w-0 truncate">
                              <button
                                type="button"
                                onClick={() => handleTogglePlayerSlot(r.player.id)}
                                title="Alternar Titular / Banquillo"
                                className={`font-mono font-bold mr-1.5 ${
                                  r.slot === 'starter'
                                    ? 'text-emerald-400'
                                    : 'text-slate-400'
                                }`}
                              >
                                {r.slot === 'starter' ? 'TIT' : 'BAN'}
                              </button>
                              <span className="text-slate-100 font-medium">
                                {r.player.name}
                              </span>{' '}
                              <span className="text-slate-400 font-mono text-[11px]">
                                ({r.player.teamAbbr} · {formatFptsExact(r.stats.seasonTotalFpts)} tot)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePlayerFromMyRoster(r.player.id)}
                              title="Cortar de mi equipo"
                              className="text-slate-400 hover:text-rose-400 ml-2 shrink-0"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Search to Add to My Team */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={rosterSearchQuery}
                        onChange={(e) => setRosterSearchQuery(e.target.value)}
                        placeholder="Buscar jugador NBA para añadir a tus 12 contratos..."
                        className="w-full pl-9 pr-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div className="max-h-56 overflow-y-auto divide-y divide-[#1E293B]/60 border border-[#1E293B] rounded-lg bg-[#0B1120]">
                      {filteredModalSearchPlayers.map((item) => {
                        const alreadyMine = leagueState.roster.some(
                          (c) => c.playerId === item.player.id
                        );
                        const rivalOwner = rivalOwnerByPlayerId.get(item.player.id);
                        const full =
                          leagueState.roster.length >= OFFICIAL_LEAGUE_RULES.maxContracts;
                        return (
                          <div
                            key={item.player.id}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-[#182338]"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <TeamLogo abbr={item.player.teamAbbr} size="xs" />
                              <span className="font-semibold text-slate-100 truncate">
                                {item.player.name}
                              </span>
                              <span className="font-mono text-slate-400 truncate">
                                {item.player.teamAbbr} · {item.player.position} ·{' '}
                                {formatFptsExact(item.stats.seasonTotalFpts)} tot ·{' '}
                                {item.stats.seasonAvgFpts.toFixed(1)} med
                                {rivalOwner ? ` · En ${rivalOwner.teamName}` : ''}
                              </span>
                            </div>
                            {alreadyMine ? (
                              <span className="text-emerald-400 font-medium shrink-0">
                                En mi equipo
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={full}
                                onClick={() => handleAddPlayerToMyRoster(item.player.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-slate-950 font-semibold shrink-0"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>Añadir</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: RIVAL TEAMS MANAGER (CUSTOM NAMES + PASTE + DIRECT SEARCH) */}
              {managerTab === 'rivals_manager' &&
                (() => {
                  const currentRivalIds =
                    leagueState.rivalRosters?.[selectedRivalTeamId] || [];
                  const currentDisplayName = getRivalDisplayName(selectedRivalTeamId);
                  const rawCustomName =
                    leagueState.rivalTeamNames?.[selectedRivalTeamId] ?? '';
                  const slotNum = selectedRivalTeamId.replace('team_', '');

                  return (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-400">
                          Pon el nombre real de cada equipo rival y asigna sus jugadores pegando la plantilla o con el buscador. Cualquier jugador en un rival desaparece automáticamente de Agentes Libres.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const nextNum = rivalSlotKeys.length + 1;
                            setExtraRivalSlotsCount(nextNum);
                            setSelectedRivalTeamId(`team_${nextNum}`);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-500 text-slate-300 rounded-lg whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5 text-orange-400" />
                          <span>Añadir otro equipo rival</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-400 font-medium">
                            Seleccionar equipo rival
                          </label>
                          <select
                            value={selectedRivalTeamId}
                            onChange={(e) => {
                              setSelectedRivalTeamId(e.target.value);
                              setRivalPasteFeedback(null);
                            }}
                            className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500"
                          >
                            {rivalSlotKeys.map((tKey) => {
                              const name = getRivalDisplayName(tKey);
                              const count = leagueState.rivalRosters?.[tKey]?.length || 0;
                              return (
                                <option key={tKey} value={tKey}>
                                  {name} {count > 0 ? `(${count} jug.)` : '(Vacío)'}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-400 font-medium">
                            Nombre del equipo rival (se guarda al instante)
                          </label>
                          <input
                            type="text"
                            value={rawCustomName}
                            onChange={(e) => {
                              const val = e.target.value;
                              commitLeagueState((prev) => ({
                                ...prev,
                                rivalTeamNames: {
                                  ...(prev.rivalTeamNames || {}),
                                  [selectedRivalTeamId]: val,
                                },
                              }));
                            }}
                            placeholder={`Ej. Rival ${slotNum} — Los Lakers de Juan`}
                            className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                          />
                        </div>
                      </div>

                      {/* Assigned Players in Selected Rival Team */}
                      <div className="p-3.5 bg-[#0B1120] border border-[#1E293B] rounded-lg space-y-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-200">
                            Plantilla de <span className="text-orange-400">{currentDisplayName}</span> ({currentRivalIds.length} jugadores):
                          </span>
                          {currentRivalIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                commitLeagueState((prev) => {
                                  const nextRivals = { ...(prev.rivalRosters || {}) };
                                  delete nextRivals[selectedRivalTeamId];
                                  return { ...prev, rivalRosters: nextRivals };
                                });
                                setRivalPasteFeedback(
                                  `Plantilla de ${currentDisplayName} vaciada.`
                                );
                              }}
                              className="text-rose-400 hover:text-rose-300"
                            >
                              Vaciar este equipo
                            </button>
                          )}
                        </div>

                        {currentRivalIds.length === 0 ? (
                          <p className="text-xs text-slate-500 py-2">
                            Todavía no hay jugadores cargados en {currentDisplayName}. Pégalos abajo en bloque o añádelos uno a uno con el buscador.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
                            {currentRivalIds.map((pid) => {
                              const enriched = enrichedById.get(pid);
                              if (!enriched) return null;
                              return (
                                <div
                                  key={pid}
                                  className="flex items-center justify-between px-2.5 py-1.5 bg-[#131C2E] border border-[#1E293B] rounded text-xs"
                                >
                                  <span className="truncate text-slate-200">
                                    {enriched.player.name}{' '}
                                    <span className="font-mono text-[11px] text-slate-400">
                                      ({enriched.player.teamAbbr} ·{' '}
                                      {enriched.stats.seasonAvgFpts.toFixed(1)})
                                    </span>
                                  </span>
                                  <div className="flex items-center gap-2 ml-2 shrink-0">
                                    {leagueState.roster.length <
                                      OFFICIAL_LEAGUE_RULES.maxContracts && (
                                      <button
                                        type="button"
                                        title="Pasar a mi equipo"
                                        onClick={() => handleAddPlayerToMyRoster(pid)}
                                        className="text-orange-400 hover:text-orange-300 text-[11px] font-medium"
                                      >
                                        Mío
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemovePlayerFromRival(
                                          pid,
                                          selectedRivalTeamId
                                        )
                                      }
                                      className="text-slate-400 hover:text-emerald-400 text-[11px]"
                                    >
                                      Liberar
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Quick Individual Search to Add/Transfer Player to this Rival */}
                      <div className="space-y-2">
                        <label className="text-[11px] text-slate-400 font-medium block">
                          Añadir o traspasar jugador suelto a {currentDisplayName}
                        </label>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={rivalSearchQuery}
                            onChange={(e) => setRivalSearchQuery(e.target.value)}
                            placeholder={`Buscar jugador NBA para asignar a ${currentDisplayName}...`}
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                          />
                        </div>
                        {rivalSearchQuery.trim().length > 0 && (
                          <div className="max-h-40 overflow-y-auto divide-y divide-[#1E293B]/60 border border-[#1E293B] rounded-lg bg-[#0B1120]">
                            {filteredRivalSearchPlayers.map((item) => {
                              const inThisRival = currentRivalIds.includes(item.player.id);
                              const otherOwner = rivalOwnerByPlayerId.get(item.player.id);
                              const isMine = leagueState.roster.some(
                                (c) => c.playerId === item.player.id
                              );
                              return (
                                <div
                                  key={item.player.id}
                                  className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs hover:bg-[#182338]"
                                >
                                  <span className="truncate text-slate-200">
                                    <strong>{item.player.name}</strong> ({item.player.teamAbbr}) ·{' '}
                                    <span className="font-mono text-slate-400">
                                      {item.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ
                                    </span>
                                    {isMine && (
                                      <span className="text-orange-400 ml-1">
                                        · En tu equipo
                                      </span>
                                    )}
                                    {otherOwner && !inThisRival && (
                                      <span className="text-slate-400 ml-1">
                                        · En {otherOwner.teamName}
                                      </span>
                                    )}
                                  </span>
                                  {inThisRival ? (
                                    <span className="text-emerald-400 font-medium shrink-0">
                                      Asignado
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleAssignPlayerToRival(
                                          item.player.id,
                                          selectedRivalTeamId
                                        );
                                        setRivalSearchQuery('');
                                      }}
                                      className="px-2.5 py-1 rounded bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold shrink-0"
                                    >
                                      {otherOwner || isMine ? 'Mover aquí' : 'Asignar'}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Bulk Text Paste for Selected Rival */}
                      <div className="space-y-2">
                        <label className="text-[11px] text-slate-400 font-medium block">
                          Pegar plantilla completa o parcial de {currentDisplayName}
                        </label>
                        <textarea
                          rows={4}
                          value={rivalPasteBuffer}
                          onChange={(e) => setRivalPasteBuffer(e.target.value)}
                          placeholder={`Pega aquí los nombres o la tabla de jugadores de ${currentDisplayName}...`}
                          className="w-full p-3 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 font-mono focus:outline-none focus:border-orange-500"
                        />
                        {rivalPasteFeedback && (
                          <p className="text-xs text-emerald-400">{rivalPasteFeedback}</p>
                        )}
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {currentRivalIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleProcessRivalPaste(selectedRivalTeamId, 'append')
                              }
                              className="px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-500 text-slate-200 rounded-lg transition-colors"
                            >
                              Añadir a los existentes
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              handleProcessRivalPaste(selectedRivalTeamId, 'replace')
                            }
                            className="px-4 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors"
                          >
                            Guardar plantilla de {currentDisplayName}
                          </button>
                        </div>
                      </div>

                      {/* Summary Grid of All Rival Teams */}
                      <div className="pt-3 border-t border-[#1E293B] space-y-2">
                        <p className="text-xs font-semibold text-slate-200">
                          Resumen permanente de equipos rivales (pulsa para editar):
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                          {rivalSlotKeys.map((tKey) => {
                            const name = getRivalDisplayName(tKey);
                            const count = leagueState.rivalRosters?.[tKey]?.length || 0;
                            return (
                              <button
                                key={tKey}
                                type="button"
                                onClick={() => {
                                  setSelectedRivalTeamId(tKey);
                                  setRivalPasteFeedback(null);
                                }}
                                className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between text-left transition-colors ${
                                  selectedRivalTeamId === tKey
                                    ? 'bg-[#182338] border-orange-500/60'
                                    : 'bg-[#0B1120] border-[#1E293B] hover:border-slate-600'
                                }`}
                              >
                                <span className="text-slate-200 font-semibold truncate pr-2">
                                  {name}
                                </span>
                                <span
                                  className={`font-mono tabular-nums font-bold shrink-0 ${
                                    count > 0 ? 'text-emerald-400' : 'text-slate-500'
                                  }`}
                                >
                                  {count} jug.
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

              {/* SUB-TAB 3: CLOUD SYNC, BACKUP EXPORT/IMPORT & STANDALONE OCCUPIED PLAYERS */}
              {managerTab === 'backup' && (
                <div className="space-y-5">
                  <div className="p-4 bg-[#0B1120] border border-[#1E293B] rounded-lg space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Cloud
                          className={`w-4 h-4 ${
                            storageMode === 'upstash-redis' ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        />
                        <h4 className="text-sm font-semibold text-slate-100">
                          Sincronización Multidispositivo en la Nube (Upstash Redis)
                        </h4>
                      </div>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                          storageMode === 'upstash-redis'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        {storageMode === 'upstash-redis'
                          ? 'Conectado a Upstash Redis'
                          : storageMode === 'tmp-ephemeral'
                            ? 'Pendiente conectar Redis en Vercel'
                            : 'Modo disco local'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      {storageMode === 'upstash-redis'
                        ? 'Todos los cambios en tu plantilla y equipos rivales se sincronizan automáticamente con tu base de datos Upstash Redis. Cualquier navegador, móvil o PC en el que abras sesión verá exactamente los mismos equipos.'
                        : 'Actualmente los cambios se mantienen en este navegador. Al conectar Upstash Redis en la pestaña Storage de Vercel, este navegador subirá automáticamente tu liga a la nube para compartirla con tu móvil, tablet u otros ordenadores.'}
                    </p>

                    {leagueState.updatedAt > 0 && (
                      <p className="text-[11px] font-mono text-slate-500">
                        Última marca de actualización:{' '}
                        {new Date(leagueState.updatedAt).toLocaleString('es-ES')}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        disabled={diskSaveStatus === 'saving'}
                        onClick={() => void handleForcePushToCloud()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition-colors disabled:opacity-60"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Subir este navegador a la nube</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCloudSyncFeedback(null);
                          void pullLatestManualStateFromServer(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#131C2E] border border-[#1E293B] hover:border-slate-500 text-slate-200 rounded-lg transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Descargar desde la nube ahora</span>
                      </button>
                    </div>

                    {cloudSyncFeedback && (
                      <p className="text-xs text-emerald-400 font-medium">{cloudSyncFeedback}</p>
                    )}
                  </div>

                  <div className="p-4 bg-[#0B1120] border border-[#1E293B] rounded-lg space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-slate-100">
                        Copia Manual en Archivo (.json)
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        También puedes descargar o restaurar una copia completa de tus equipos y plantillas rivales en un archivo local cuando quieras:
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleExportLeagueJson}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Descargar copia de seguridad (.json)</span>
                      </button>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={handleImportLeagueJson}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#131C2E] border border-[#1E293B] hover:border-slate-500 text-slate-200 rounded-lg transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5 text-orange-400" />
                        <span>Importar copia (.json)</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">
                        Jugadores marcados como ocupados sin equipo específico ({leagueState.takenRivalIds.length}):
                      </span>
                      {leagueState.takenRivalIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            commitLeagueState((prev) => ({
                              ...prev,
                              takenRivalIds: [],
                            }))
                          }
                          className="text-rose-400 hover:text-rose-300"
                        >
                          Liberar todos
                        </button>
                      )}
                    </div>

                    {leagueState.takenRivalIds.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">
                        No hay jugadores sueltos fuera de los equipos rivales con nombre.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto">
                        {leagueState.takenRivalIds.map((rid) => {
                          const p = playersById.get(rid);
                          if (!p) return null;
                          return (
                            <div
                              key={rid}
                              className="flex items-center justify-between px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded text-xs"
                            >
                              <span className="truncate text-slate-200">
                                {p.name} ({p.teamAbbr})
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  commitLeagueState((prev) => ({
                                    ...prev,
                                    takenRivalIds: prev.takenRivalIds.filter(
                                      (id) => id !== rid
                                    ),
                                  }))
                                }
                                className="text-slate-400 hover:text-emerald-400 ml-2"
                              >
                                Liberar
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TRADE PLAYER PICKER */}
      {tradePickerSide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-[2px]"
            onClick={() => setTradePickerSide(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100">
                {tradePickerSide === 'send'
                  ? 'Elegir jugador que entregas'
                  : 'Elegir jugador que recibes'}
              </h3>
              <button
                type="button"
                onClick={() => setTradePickerSide(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={tradeSearchQuery}
                onChange={(e) => setTradeSearchQuery(e.target.value)}
                placeholder="Buscar jugador NBA..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {filteredTradePickerPlayers.map((item) => {
                const rOwner = rivalOwnerByPlayerId.get(item.player.id);
                const isMine = leagueState.roster.some(
                  (c) => c.playerId === item.player.id
                );
                return (
                  <button
                    key={item.player.id}
                    type="button"
                    onClick={() => {
                      if (tradePickerSide === 'send') {
                        setTradeSendIds((prev) =>
                          prev.includes(item.player.id)
                            ? prev
                            : [...prev, item.player.id]
                        );
                      } else {
                        setTradeReceiveIds((prev) =>
                          prev.includes(item.player.id)
                            ? prev
                            : [...prev, item.player.id]
                        );
                      }
                      setTradePickerSide(null);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#131C2E] hover:bg-[#182338] text-xs text-left transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar
                        playerId={item.player.id}
                        name={item.player.name}
                        teamAbbr={item.player.teamAbbr}
                        size="xs"
                      />
                      <span className="truncate">
                        <span className="font-semibold text-slate-100">
                          {item.player.name} ({item.player.teamAbbr})
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          {isMine
                            ? leagueState.myTeamName
                            : rOwner
                            ? `En ${rOwner.teamName}`
                            : 'Agente Libre'}
                        </span>
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-orange-400 font-semibold shrink-0 ml-2">
                      {item.stats.seasonAvgFpts.toFixed(1)} FPTS ·{' '}
                      {item.teamSched.gamesCount} PJ
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PLAYER GAME-BY-GAME FPTS AUDIT BREAKDOWN */}
      {inspectedPlayerForLogsId && (() => {
        const item = enrichedById.get(inspectedPlayerForLogsId);
        if (!item) return null;
        const g2027 = (item.player.games || []).filter((g) => g.seasonLabel === '2026-27');

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/75 backdrop-blur-[2px]"
              onClick={() => setInspectedPlayerForLogsId(null)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-4xl bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
              {/* Header */}
              {(() => {
                const totalDeltas = g2027.reduce((acc, g) => {
                  const corr =
                    leagueState.gameCorrections?.[`${item.player.id}:${g.eventId}`] ||
                    leagueState.gameCorrections?.[`${item.player.id}:${g.date}`];
                  return acc + (corr?.fptsDelta || 0);
                }, 0);
                const rawTotalNba = item.stats.seasonTotalFpts - totalDeltas;

                return (
                  <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar
                        playerId={item.player.id}
                        name={item.player.name}
                        teamAbbr={item.player.teamAbbr}
                        size="md"
                      />
                      <div>
                        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                          <span>{item.player.name}</span>
                          <span className="text-xs px-2 py-0.5 bg-[#182338] text-orange-400 font-mono rounded">
                            {item.player.teamAbbr} · {item.player.position}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-x-2">
                          <span>{g2027.length} PJ disputados en 2026-27</span>
                          <span>·</span>
                          <span>
                            Base NBA.com:{' '}
                            <strong className="text-slate-200">
                              {formatFptsExact(rawTotalNba)} FPTS
                            </strong>
                          </span>
                          {Math.abs(totalDeltas) > 0.001 && (
                            <>
                              <span>·</span>
                              <span className="text-amber-400">
                                Ajuste Fantasy:{' '}
                                <strong>
                                  {totalDeltas >= 0 ? '+' : ''}
                                  {totalDeltas.toFixed(2)} FPTS
                                </strong>
                              </span>
                            </>
                          )}
                          <span>·</span>
                          <span>
                            Total Oficial Fantasy:{' '}
                            <strong className="text-emerald-400">
                              {formatFptsExact(item.stats.seasonTotalFpts)} FPTS
                            </strong>
                          </span>
                          <span>·</span>
                          <span>
                            Media Oficial:{' '}
                            <strong className="text-orange-400">
                              {item.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ
                            </strong>
                          </span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setInspectedPlayerForLogsId(null)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1E293B] transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                );
              })()}

              {/* TOP PROMINENT PANEL: MANUAL FPTS CORRECTION & REASON */}
              {g2027.length > 0 && (() => {
                const activeFormGameKey =
                  editingLogKey ||
                  g2027.find((g) => {
                    const corr =
                      leagueState.gameCorrections?.[`${item.player.id}:${g.eventId}`] ||
                      leagueState.gameCorrections?.[`${item.player.id}:${g.date}`];
                    return Boolean(corr && Math.abs(corr.fptsDelta) > 0.001);
                  })?.eventId ||
                  g2027[0]?.eventId ||
                  g2027[0]?.date ||
                  '';

                const targetGame =
                  g2027.find((g) => (g.eventId || g.date) === activeFormGameKey) || g2027[0];

                const existingCorr = targetGame
                  ? leagueState.gameCorrections?.[`${item.player.id}:${targetGame.eventId}`] ||
                    leagueState.gameCorrections?.[`${item.player.id}:${targetGame.date}`]
                  : null;

                const formDeltaValue =
                  editingLogKey === (targetGame?.eventId || targetGame?.date)
                    ? editingLogDelta
                    : existingCorr
                    ? String(existingCorr.fptsDelta)
                    : editingLogDelta;

                const formReasonValue =
                  editingLogKey === (targetGame?.eventId || targetGame?.date)
                    ? editingLogReason
                    : existingCorr?.reason || editingLogReason;

                return (
                  <div className="bg-[#111C33] border-2 border-amber-500/50 rounded-xl p-3.5 space-y-3 shadow-lg shrink-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300">
                          <Edit3 className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wider flex items-center gap-2">
                            <span>Panel de Corrección Manual de Puntos Fantasy (±)</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-normal">
                              Personalizable por partido
                            </span>
                          </h4>
                          <p className="text-[11px] text-slate-300">
                            ¿Detectas una discrepancia estadística? (ej: 6 stocks de Ajay Mitchell vs Denver en ESPN vs 5 en NBA.com). Ajusta los puntos y escribe la justificación.
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded font-mono">
                        Base NBA.com intacta · Corrección Fantasy aplicada
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-0.5">
                      {/* Game selector */}
                      <div className="md:col-span-4 space-y-1">
                        <label className="text-[10px] font-semibold text-slate-300 block">
                          1. Partido a corregir:
                        </label>
                        <select
                          value={activeFormGameKey}
                          onChange={(e) => {
                            const newKey = e.target.value;
                            setEditingLogKey(newKey);
                            const found = g2027.find((g) => (g.eventId || g.date) === newKey);
                            const corr = found
                              ? leagueState.gameCorrections?.[`${item.player.id}:${found.eventId}`] ||
                                leagueState.gameCorrections?.[`${item.player.id}:${found.date}`]
                              : null;
                            setEditingLogDelta(corr ? String(corr.fptsDelta) : '');
                            setEditingLogReason(corr?.reason || '');
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-amber-500/40 rounded-lg text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          {g2027.map((g) => {
                            const corr =
                              leagueState.gameCorrections?.[`${item.player.id}:${g.eventId}`] ||
                              leagueState.gameCorrections?.[`${item.player.id}:${g.date}`];
                            const hasC = corr && Math.abs(corr.fptsDelta) > 0.001;
                            const key = g.eventId || g.date;
                            return (
                              <option key={key} value={key}>
                                {g.date} {g.isHome ? 'vs' : '@'}{g.opponentAbbr} ({g.points}p, {g.steals}rob, {g.blocks}tap)
                                {hasC ? ` · [Ajuste: ${corr.fptsDelta >= 0 ? '+' : ''}${corr.fptsDelta.toFixed(2)} FPTS]` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Delta points */}
                      <div className="md:col-span-3 space-y-1">
                        <label className="text-[10px] font-semibold text-slate-300 block">
                          2. Diferencial (± FPTS):
                        </label>
                        <div>
                          <input
                            type="number"
                            step="0.25"
                            placeholder="Ej: +2.5 ó -1.0"
                            value={formDeltaValue}
                            onChange={(e) => {
                              setEditingLogKey(targetGame?.eventId || targetGame?.date || null);
                              setEditingLogDelta(e.target.value);
                            }}
                            className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-amber-500/40 rounded-lg text-amber-200 font-mono font-bold text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          <div className="flex gap-1 mt-1">
                            {['+0.5', '+1.0', '+2.0', '+2.5', '-1.0'].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  setEditingLogKey(targetGame?.eventId || targetGame?.date || null);
                                  setEditingLogDelta(preset);
                                }}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#182338] hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition-colors"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Reason & Buttons */}
                      <div className="md:col-span-5 space-y-1">
                        <label className="text-[10px] font-semibold text-slate-300 block">
                          3. Explicación / Motivo justificado:
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: 6 stocks en ESPN/BBRef vs 5 en NBA.com (+2.5 FPTS)"
                          value={formReasonValue}
                          onChange={(e) => {
                            setEditingLogKey(targetGame?.eventId || targetGame?.date || null);
                            setEditingLogReason(e.target.value);
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-amber-500/40 rounded-lg text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <div className="flex items-center justify-end gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (!targetGame) return;
                              const numDelta = parseFloat(formDeltaValue) || 0;
                              handleSaveGameCorrection(
                                item.player.id,
                                targetGame.eventId,
                                targetGame.date,
                                numDelta,
                                formReasonValue
                              );
                            }}
                            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors shadow-sm inline-flex items-center gap-1"
                          >
                            <span>💾 Guardar Corrección</span>
                          </button>
                          {existingCorr && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!targetGame) return;
                                handleSaveGameCorrection(
                                  item.player.id,
                                  targetGame.eventId,
                                  targetGame.date,
                                  0,
                                  ''
                                );
                                setEditingLogDelta('');
                                setEditingLogReason('');
                              }}
                              className="px-2 py-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg text-xs transition-colors"
                              title="Eliminar esta corrección"
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Game Log Table */}
              <div className="overflow-auto flex-1 pr-1 space-y-2">
                {g2027.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No hay partidos oficiales registrados para {item.player.name} en la temporada 2026-27.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className={STICKY_THEAD_CLASS}>
                      <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                        <SortableTh
                          label="Fecha"
                          align="left"
                          compact
                          active={modalLogSortKey === 'date'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('date')}
                          className="py-2.5 pl-3 pr-1"
                        />
                        <SortableTh
                          label="Rival"
                          align="left"
                          compact
                          active={modalLogSortKey === 'opp'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('opp')}
                          className="py-2.5 px-1.5"
                        />
                        <SortableTh
                          label="Min"
                          align="left"
                          compact
                          active={modalLogSortKey === 'min'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('min')}
                          className="py-2.5 px-1"
                        />
                        <SortableTh
                          label="PTS"
                          align="left"
                          compact
                          active={modalLogSortKey === 'pts'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('pts')}
                          className="py-2.5 px-1"
                        />
                        <SortableTh
                          label="TC"
                          align="left"
                          compact
                          active={modalLogSortKey === 'fgm'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('fgm')}
                          className="py-2.5 px-1"
                        />
                        <SortableTh
                          label="3P"
                          align="left"
                          compact
                          active={modalLogSortKey === 'fg3m'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('fg3m')}
                          className="py-2.5 px-1"
                        />
                        <SortableTh
                          label="TL"
                          align="left"
                          compact
                          active={modalLogSortKey === 'ftm'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('ftm')}
                          className="py-2.5 px-1"
                        />
                        <SortableTh
                          label="REB"
                          align="left"
                          compact
                          active={modalLogSortKey === 'reb'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('reb')}
                          className="py-2.5 px-1"
                        />
                        <SortableTh
                          label="AST"
                          align="left"
                          compact
                          active={modalLogSortKey === 'ast'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('ast')}
                          className="py-2.5 px-1"
                        />
                        <SortableTh
                          label="ROB"
                          align="left"
                          compact
                          active={modalLogSortKey === 'stl'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('stl')}
                          className="py-2.5 px-1"
                        />
                        <SortableTh
                          label="TAP"
                          align="left"
                          compact
                          active={modalLogSortKey === 'blk'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('blk')}
                          className="py-2.5 px-1"
                        />
                        <SortableTh
                          label="PER"
                          align="left"
                          compact
                          active={modalLogSortKey === 'tov'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('tov')}
                          className="py-2.5 px-1"
                        />
                        <SortableTh
                          label="NBA.com"
                          align="right"
                          compact
                          active={modalLogSortKey === 'fpts'}
                          asc={modalLogSortAsc}
                          onSort={() => toggleModalLogSort('fpts')}
                          className="py-2.5 px-1.5"
                        />
                        <th className="py-2.5 px-2 text-left font-medium text-slate-400 min-w-[140px]">
                          Ajuste Fantasy (±)
                        </th>
                        <th className="py-2.5 pl-1.5 pr-3 text-right font-medium text-slate-400">
                          Total Fantasy
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]/70 font-mono text-[11px]">
                      {(() => {
                        const baseModalRows = g2027.map((g) => {
                          const corr =
                            leagueState.gameCorrections?.[`${item.player.id}:${g.eventId}`] ||
                            leagueState.gameCorrections?.[`${item.player.id}:${g.date}`];
                          return {
                            g,
                            breakdown: computeOfficialGameFptsBreakdown(g, 0),
                            corr,
                          };
                        });
                        if (!modalLogSortKey) return baseModalRows;
                        return sortRows(
                          baseModalRows,
                          ({ g, breakdown, corr }) => {
                            switch (modalLogSortKey) {
                              case 'date':
                                return g.date;
                              case 'opp':
                                return g.opponentAbbr;
                              case 'min':
                                return g.minutes;
                              case 'pts':
                                return g.points;
                              case 'fgm':
                                return g.fgm * 100 + g.fga;
                              case 'fg3m':
                                return g.fg3m * 100 + g.fg3a;
                              case 'ftm':
                                return g.ftm * 100 + g.fta;
                              case 'reb':
                                return g.rebounds * 100 + g.oreb;
                              case 'ast':
                                return g.assists;
                              case 'stl':
                                return g.steals;
                              case 'blk':
                                return g.blocks;
                              case 'tov':
                                return g.turnovers;
                              case 'fpts':
                                return breakdown.totalFpts + (corr?.fptsDelta || 0);
                              default:
                                return g.date;
                            }
                          },
                          modalLogSortAsc
                        );
                      })().map(({ g, breakdown, corr }) => {
                        const rowKey = g.eventId || g.date;
                        const isEditingThisRow = editingLogKey === rowKey;
                        const delta = corr?.fptsDelta || 0;
                        const finalGameFpts = breakdown.totalFpts + delta;

                        return (
                          <tr
                            key={`${g.eventId}-${g.date}`}
                            className={`hover:bg-[#182338] transition-colors ${
                              Math.abs(delta) > 0.001 ? 'bg-amber-500/5' : ''
                            }`}
                          >
                            <td className="py-2.5 pl-3 pr-1 whitespace-nowrap text-slate-300 font-sans font-medium">
                              {g.date}
                            </td>
                            <td className="py-2.5 px-1.5 whitespace-nowrap">
                              <span
                                className={
                                  g.isHome ? 'text-emerald-400 font-semibold' : 'text-slate-300'
                                }
                              >
                                {g.isHome ? 'vs' : '@'}{g.opponentAbbr}
                              </span>
                            </td>
                            <td className="py-2.5 px-1 text-slate-300">{g.minutes}m</td>
                            <td className="py-2.5 px-1 font-bold text-slate-100">{g.points}</td>
                            <td className="py-2.5 px-1 text-slate-400">
                              {g.fgm}/{g.fga}
                            </td>
                            <td className="py-2.5 px-1 text-slate-400">
                              {g.fg3m}/{g.fg3a}
                            </td>
                            <td className="py-2.5 px-1 text-slate-400">
                              {g.ftm}/{g.fta}
                            </td>
                            <td className="py-2.5 px-1 text-slate-300">
                              {g.rebounds} ({g.oreb}/{g.dreb})
                            </td>
                            <td className="py-2.5 px-1 text-slate-300">{g.assists}</td>
                            <td className="py-2.5 px-1 text-emerald-400 font-semibold">
                              {g.steals}
                            </td>
                            <td className="py-2.5 px-1 text-emerald-400 font-semibold">
                              {g.blocks}
                            </td>
                            <td className="py-2.5 px-1 text-rose-400">{g.turnovers}</td>
                            <td className="py-2.5 px-1.5 text-right font-medium tabular-nums text-slate-300">
                              {formatFptsExact(breakdown.totalFpts)}
                            </td>

                            {/* Manual Correction Column */}
                            <td className="py-2 px-2 font-sans">
                              {isEditingThisRow ? (
                                <div className="space-y-1 bg-[#131C2E] p-1.5 rounded border border-orange-500/40">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="0.25"
                                      placeholder="± FPTS (ej: 2.5)"
                                      value={editingLogDelta}
                                      onChange={(e) => setEditingLogDelta(e.target.value)}
                                      className="w-20 px-1.5 py-0.5 bg-[#0B1120] border border-[#1E293B] rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-orange-500"
                                      autoFocus
                                    />
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      FPTS
                                    </span>
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Motivo (ej: 6 stocks en ESPN)"
                                    value={editingLogReason}
                                    onChange={(e) => setEditingLogReason(e.target.value)}
                                    className="w-full px-1.5 py-0.5 bg-[#0B1120] border border-[#1E293B] rounded text-slate-100 text-[10px] focus:outline-none focus:border-orange-500"
                                  />
                                  <div className="flex items-center gap-1.5 pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const numDelta = parseFloat(editingLogDelta) || 0;
                                        handleSaveGameCorrection(
                                          item.player.id,
                                          g.eventId,
                                          g.date,
                                          numDelta,
                                          editingLogReason
                                        );
                                      }}
                                      className="px-2 py-0.5 bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold rounded text-[10px]"
                                    >
                                      Guardar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingLogKey(null)}
                                      className="px-2 py-0.5 bg-[#182338] hover:bg-slate-700 text-slate-300 rounded text-[10px]"
                                    >
                                      Cancelar
                                    </button>
                                    {corr && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleSaveGameCorrection(
                                            item.player.id,
                                            g.eventId,
                                            g.date,
                                            0,
                                            ''
                                          );
                                        }}
                                        className="px-1.5 py-0.5 text-rose-400 hover:text-rose-300 text-[10px]"
                                        title="Eliminar corrección manual"
                                      >
                                        Quitar
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : corr && Math.abs(corr.fptsDelta) > 0.001 ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-amber-300 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/35">
                                      {corr.fptsDelta >= 0 ? '+' : ''}
                                      {corr.fptsDelta.toFixed(2)} FPTS
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingLogKey(rowKey);
                                        setEditingLogDelta(String(corr.fptsDelta));
                                        setEditingLogReason(corr.reason || '');
                                      }}
                                      className="inline-flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-100 font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-colors"
                                      title="Editar corrección"
                                    >
                                      <Edit3 className="w-2.5 h-2.5" />
                                      <span>Modificar</span>
                                    </button>
                                  </div>
                                  {corr.reason && (
                                    <p
                                      className="text-[10px] text-amber-200/90 font-sans italic max-w-[210px] leading-tight"
                                      title={corr.reason}
                                    >
                                      💬 {corr.reason}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLogKey(rowKey);
                                    setEditingLogDelta('');
                                    setEditingLogReason('');
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 hover:text-amber-100 bg-amber-500/15 hover:bg-amber-500/25 px-2 py-1 rounded border border-amber-500/35 transition-all shadow-sm"
                                >
                                  <Plus className="w-3 h-3 text-amber-400" />
                                  <span>Corregir partido</span>
                                </button>
                              )}
                            </td>

                            {/* Total Final Fantasy Column */}
                            <td className="py-2.5 pl-1.5 pr-3 text-right font-bold tabular-nums text-xs whitespace-nowrap">
                              <span
                                className={
                                  Math.abs(delta) > 0.001
                                    ? 'text-amber-300'
                                    : 'text-orange-400'
                                }
                              >
                                {formatFptsExact(finalGameFpts)} FPTS
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Explanatory Footer */}
              <div className="pt-3 border-t border-[#1E293B] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400 font-sans">
                <p>
                  Regla oficial ESPN: FGM +2, FGMI -1, FTM +1, FTMI -1, 3PM +1, 3PMI +0.5, OREB +1.5, DREB +0.75, AST +1.5, STL +2.5, BLK +2.5, TO -2.0. Las correcciones manuales se guardan como overlay oficial sin desvirtuar los datos brutos de NBA.com.
                </p>
                <button
                  type="button"
                  onClick={() => setInspectedPlayerForLogsId(null)}
                  className="px-4 py-1.5 bg-[#182338] hover:bg-slate-700 text-slate-200 font-semibold rounded-lg shrink-0 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
