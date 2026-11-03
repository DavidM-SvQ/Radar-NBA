import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  Check,
  ClipboardPaste,
  Cloud,
  Download,
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
  FantasyEspnSyncPayload,
  FantasyInjurySeverity,
  FantasyManualLeagueState,
  FantasyPlayerInjuryAlert,
  FantasyRosterContract,
  FantasyStorageMode,
  FantasyTeamGameSlot,
  FantasyWeekWindow,
  PlayerSummary,
  TeamSummary,
} from '../types/nba';
import { formatShortDate, normalizeSearchText } from '../utils/analytics';
import { fetchBootstrapClient } from '../utils/bootstrapWireCodec';
import {
  OFFICIAL_LEAGUE_RULES,
  computeOfficialGameFptsBreakdown,
  computePlayerOfficialFantasyStats,
  computeWeeklyLockProjection,
  formatFptsExact,
  normalizePlayerLookupKey,
  parseCopiedEspnTextToPlayers,
} from '../utils/fantasyScoring';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';
import { buildAdminAuthHeaders } from '../utils/adminAuthClient';
import { buildStaticFantasyWeeks } from '../utils/staticSchedule';

export type FantasyTab = 'lineup' | 'waivers' | 'trades' | 'injuries_rules' | 'rules';

interface FantasyEspnAssistantViewProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
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
  };
}

function ColumnSortHeader({
  label,
  active,
  asc,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-1 font-semibold hover:text-orange-400 transition-colors select-none ${
        align === 'right' ? 'ml-auto justify-end' : align === 'center' ? 'mx-auto justify-center' : ''
      } ${active ? 'text-orange-400 font-bold' : 'text-slate-400'}`}
    >
      <span>{label}</span>
      <span className="text-[10px] font-mono text-orange-400">
        {active ? (asc ? '▲' : '▼') : '↕'}
      </span>
    </button>
  );
}

function renderScheduleBadges(teamSched: { gamesCount: number; b2bCount: number; games: FantasyTeamGameSlot[] }) {
  if (!teamSched || !teamSched.games || teamSched.games.length === 0) {
    return <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Sin partidos</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {teamSched.games.map((g, idx) => (
        <span
          key={`${g.gameId || idx}-${g.dateIso}-${g.opponentAbbr}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#182338] border border-[#1E293B] text-[10px] font-mono whitespace-nowrap"
          title={`${g.dateIso}: ${g.isHome ? 'En casa vs' : 'A domicilio @'} ${g.opponentAbbr}`}
        >
          <span className="text-slate-400 font-normal">{g.dayShortEs}</span>
          <span className={g.isHome ? 'text-emerald-400 font-semibold' : 'text-slate-200 font-medium'}>
            {g.isHome ? 'vs' : '@'}{g.opponentAbbr}
          </span>
        </span>
      ))}
    </div>
  );
}

export function FantasyEspnAssistantView({
  players,
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

  // Waiver Wire Filters & Add/Drop Simulator State
  const [waiverQuery, setWaiverQuery] = useState<string>('');
  const [waiverPosFilter, setWaiverPosFilter] = useState<'ALL' | 'G' | 'F' | 'C'>('ALL');
  const [waiverMinGames, setWaiverMinGames] = useState<number>(0);
  const [waiverSortBy, setWaiverSortBy] = useState<'netGainWeek' | 'formDelta' | 'seasonAvg'>(
    'netGainWeek'
  );
  const [selectedDropPlayerId, setSelectedDropPlayerId] = useState<string>('');
  const [actionBannerMsg, setActionBannerMsg] = useState<string | null>(null);

  // Table Column Interactive Sorting State
  type RosterSortKey =
    | 'name'
    | 'severity'
    | 'gamesCount'
    | 'seasonTotalFpts'
    | 'seasonAvgFpts'
    | 'last5AvgFpts'
    | 'rawFormulaFpts'
    | 'lockAdjustedFpts';
  const [rosterSortKey, setRosterSortKey] = useState<RosterSortKey>('lockAdjustedFpts');
  const [rosterSortAsc, setRosterSortAsc] = useState<boolean>(false);

  const handleRosterSort = (key: RosterSortKey) => {
    if (rosterSortKey === key) {
      setRosterSortAsc(!rosterSortAsc);
    } else {
      setRosterSortKey(key);
      setRosterSortAsc(key === 'name' || key === 'severity');
    }
  };

  type WaiverSortKey =
    | 'name'
    | 'severity'
    | 'gamesCount'
    | 'seasonTotalFpts'
    | 'seasonAvgFpts'
    | 'last5AvgFpts'
    | 'lockAdjustedFpts'
    | 'netWeekGain';
  const [waiverTableSortKey, setWaiverTableSortKey] = useState<WaiverSortKey>('lockAdjustedFpts');
  const [waiverTableSortAsc, setWaiverTableSortAsc] = useState<boolean>(false);

  const handleWaiverTableSort = (key: WaiverSortKey) => {
    if (waiverTableSortKey === key) {
      setWaiverTableSortAsc(!waiverTableSortAsc);
    } else {
      setWaiverTableSortKey(key);
      setWaiverTableSortAsc(key === 'name' || key === 'severity');
    }
  };

  // Player Game Logs Breakdown Modal State
  const [inspectedPlayerForLogsId, setInspectedPlayerForLogsId] = useState<string | null>(null);

  // Trade Analyzer State
  const [tradeSendIds, setTradeSendIds] = useState<string[]>([]);
  const [tradeReceiveIds, setTradeReceiveIds] = useState<string[]>([]);
  const [tradePickerSide, setTradePickerSide] = useState<'send' | 'receive' | null>(null);
  const [tradeSearchQuery, setTradeSearchQuery] = useState<string>('');
  const [includeWaiverStreamSlotInTrade, setIncludeWaiverStreamSlotInTrade] =
    useState<boolean>(true);

  // Scoring Audit Player Selector (Tab 4)
  const [auditPlayerId, setAuditPlayerId] = useState<string>('');
  const [auditSearch, setAuditSearch] = useState<string>('');

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
      if (!nbaContext) return null;
      const byId = nbaContext.injuriesByPlayerId[p.id];
      if (byId) return byId;
      const norm = normalizePlayerLookupKey(p.name);
      return nbaContext.injuriesByNormName[norm] || null;
    },
    [nbaContext]
  );

  // Precompute official Fantasy profile + weekly schedule projection for all NBA players
  const enrichedCatalog = useMemo(() => {
    return effectivePlayers.map((p) => {
      const stats = computePlayerOfficialFantasyStats(p, 0);
      const teamSched = activeWeek?.teamSchedules?.[p.teamAbbr] || {
        gamesCount: 0,
        b2bCount: 0,
        games: [],
      };
      const injury = getPlayerInjury(p);
      const severity: FantasyInjurySeverity = injury?.severity || 'healthy';
      const weekly = computeWeeklyLockProjection({
        scheduledGames: teamSched.gamesCount,
        stats,
        injurySeverity: severity,
        injuryDetailEs: injury?.detailEs || injury?.statusLabelEs || '',
      });

      return {
        player: p,
        stats,
        teamSched,
        injury,
        severity,
        weekly,
      };
    });
  }, [effectivePlayers, activeWeek, getPlayerInjury]);

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
      copy.sort((a, b) => {
        let cmp = 0;
        switch (rosterSortKey) {
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
          case 'lockAdjustedFpts':
          default:
            cmp = a.weekly.lockAdjustedFpts - b.weekly.lockAdjustedFpts;
            break;
        }
        return rosterSortAsc ? cmp : -cmp;
      });
      return copy;
    },
    [rosterSortKey, rosterSortAsc]
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
    let rawFormulaSum = 0;
    let adjustedLockSum = 0;
    let seasonAccumulatedFpts = 0;
    let injuredStartersCount = 0;

    for (const member of myRosterEnriched) {
      seasonAccumulatedFpts += member.stats.seasonTotalFpts;
    }

    for (const st of myStarters) {
      totalGames += st.teamSched.gamesCount;
      rawFormulaSum += st.weekly.rawFormulaFpts;
      adjustedLockSum += st.weekly.lockAdjustedFpts;
      if (
        st.severity === 'out' ||
        st.severity === 'suspended' ||
        st.severity === 'doubtful'
      ) {
        injuredStartersCount += 1;
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
      seasonAccumulatedFpts: Math.round(seasonAccumulatedFpts * 100) / 100,
      rawFormulaSum: Math.round(rawFormulaSum * 10) / 10,
      adjustedLockSum: Math.round(adjustedLockSum * 10) / 10,
      optimalAdjustedSum: Math.round(optimalAdjustedSum * 10) / 10,
      potentialGainFromOptimization:
        Math.round((optimalAdjustedSum - adjustedLockSum) * 10) / 10,
      injuredStartersCount,
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

  // Available Waiver / Free Agent Pool
  const availableWaiverPool = useMemo(() => {
    const q = normalizeSearchText(waiverQuery);
    const dropWeekFpts = effectiveDropMember?.weekly.lockAdjustedFpts ?? 0;
    const dropPerGame = effectiveDropMember?.stats.weightedFptsPerGame ?? 0;

    const filtered = enrichedCatalog.filter((item) => {
      if (unavailableIds.has(item.player.id)) return false;
      if (item.stats.gamesPlayed === 0) return false;
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

    const withDeltas = filtered.map((item) => ({
      ...item,
      netWeekGain: Math.round((item.weekly.lockAdjustedFpts - dropWeekFpts) * 10) / 10,
      netPerGameGain: Math.round((item.stats.weightedFptsPerGame - dropPerGame) * 10) / 10,
    }));

    withDeltas.sort((a, b) => {
      let cmp = 0;
      switch (waiverTableSortKey) {
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
        case 'netWeekGain':
          cmp = a.netWeekGain - b.netWeekGain;
          break;
        case 'lockAdjustedFpts':
        default:
          if (waiverSortBy === 'formDelta') {
            cmp = a.stats.formDeltaLast5 - b.stats.formDeltaLast5;
          } else if (waiverSortBy === 'seasonAvg') {
            cmp = a.stats.seasonAvgFpts - b.stats.seasonAvgFpts;
          } else {
            cmp =
              a.netWeekGain - b.netWeekGain ||
              a.weekly.lockAdjustedFpts - b.weekly.lockAdjustedFpts;
          }
          break;
      }
      return waiverTableSortAsc ? cmp : -cmp;
    });

    return withDeltas;
  }, [
    enrichedCatalog,
    unavailableIds,
    waiverQuery,
    waiverMinGames,
    waiverPosFilter,
    waiverSortBy,
    waiverTableSortKey,
    waiverTableSortAsc,
    effectiveDropMember,
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

  // Trade Analyzer Evaluation
  const tradeEvaluation = useMemo(() => {
    const sendItems = tradeSendIds
      .map((id) => enrichedById.get(id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const receiveItems = tradeReceiveIds
      .map((id) => enrichedById.get(id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const sumMetrics = (arr: typeof sendItems) =>
      arr.reduce(
        (acc, x) => ({
          seasonFpts: acc.seasonFpts + x.stats.seasonAvgFpts,
          weightedFpts: acc.weightedFpts + x.stats.weightedFptsPerGame,
          weekFpts: acc.weekFpts + x.weekly.lockAdjustedFpts,
          weekGames: acc.weekGames + x.teamSched.gamesCount,
          makePts: acc.makePts + x.stats.avgShootingMakePts,
          missPenaltyPts: acc.missPenaltyPts + x.stats.avgShootingMissPenaltyPts,
          rebPts: acc.rebPts + x.stats.avgReboundPts,
          playDefPts: acc.playDefPts + x.stats.avgPlaymakingDefensePts,
          negPts: acc.negPts + x.stats.avgNegativeDisciplinePts,
        }),
        {
          seasonFpts: 0,
          weightedFpts: 0,
          weekFpts: 0,
          weekGames: 0,
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

    const effectiveOutPerGame =
      sendSum.weightedFpts + (forcedDropItem?.stats.weightedFptsPerGame || 0);
    const effectiveInPerGame =
      receiveSum.weightedFpts + (addedStreamItem?.stats.weightedFptsPerGame || 0);

    const effectiveOutWeek =
      sendSum.weekFpts + (forcedDropItem?.weekly.lockAdjustedFpts || 0);
    const effectiveInWeek =
      receiveSum.weekFpts + (addedStreamItem?.weekly.lockAdjustedFpts || 0);

    return {
      sendItems,
      receiveItems,
      sendSum,
      receiveSum,
      forcedDropItem,
      addedStreamItem,
      netPerGame: Math.round((effectiveInPerGame - effectiveOutPerGame) * 10) / 10,
      netWeek: Math.round((effectiveInWeek - effectiveOutWeek) * 10) / 10,
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

  // Injured Players & Same-Team Rotation Streamers (Tab 4)
  const injuryRotationCards = useMemo(() => {
    const injuredItems = enrichedCatalog
      .filter(
        (x) =>
          x.injury &&
          (x.severity === 'out' ||
            x.severity === 'doubtful' ||
            x.severity === 'questionable' ||
            x.severity === 'suspended')
      )
      .sort((a, b) => {
        const aMine = leagueState.roster.some((c) => c.playerId === a.player.id) ? 1 : 0;
        const bMine = leagueState.roster.some((c) => c.playerId === b.player.id) ? 1 : 0;
        if (aMine !== bMine) return bMine - aMine;
        return b.stats.seasonAvgFpts - a.stats.seasonAvgFpts;
      })
      .slice(0, 14);

    return injuredItems.map((injItem) => {
      const isOnMyRoster = leagueState.roster.some(
        (c) => c.playerId === injItem.player.id
      );
      const beneficiaries = enrichedCatalog
        .filter(
          (cand) =>
            cand.player.teamAbbr === injItem.player.teamAbbr &&
            cand.player.id !== injItem.player.id &&
            cand.severity === 'healthy' &&
            cand.stats.gamesPlayed >= 2
        )
        .sort((a, b) => {
          const aFree = !unavailableIds.has(a.player.id) ? 1 : 0;
          const bFree = !unavailableIds.has(b.player.id) ? 1 : 0;
          if (aFree !== bFree) return bFree - aFree;
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
  }, [enrichedCatalog, leagueState.roster, unavailableIds]);

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

  const renderSeverityText = (severity: FantasyInjurySeverity, labelEs?: string) => {
    if (severity === 'healthy') {
      return <span className="text-emerald-400 font-medium">Sano</span>;
    }
    if (severity === 'out' || severity === 'suspended') {
      return (
        <span className="text-rose-400 font-semibold">
          {labelEs || 'Baja (0 FPTS)'}
        </span>
      );
    }
    if (severity === 'doubtful') {
      return (
        <span className="text-rose-300 font-semibold">
          {labelEs || 'Muy dudoso'}
        </span>
      );
    }
    return <span className="text-amber-300 font-medium">{labelEs || 'Duda'}</span>;
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

            {activeWeek && (
              <div className="text-xs text-slate-400 font-mono tabular-nums">
                Cierre alineación: {activeWeek.lockDeadlineLabel} ·{' '}
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

      {/* 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
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
          <p className="text-xs text-slate-400">Puntos acumulados 2026-27 (Plantilla)</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-100">
            {formatFptsExact(lineupTotals.seasonAccumulatedFpts)} FPTS
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Suma oficial acumulada de tus {myRosterEnriched.length} jugadores
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs text-slate-400">
            Fórmula semana ({lineupTotals.totalGames} PJ × Media)
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-bold font-mono tabular-nums text-orange-400">
            {lineupTotals.rawFormulaSum.toFixed(1)} FPTS
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Volumen bruto de tus 10 titulares ({activeWeek?.label || 'Semana'})
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs text-slate-400">Proyección real cierre lunes</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-400">
            {lineupTotals.adjustedLockSum.toFixed(1)} FPTS
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {lineupTotals.potentialGainFromOptimization > 0.5
              ? `+${lineupTotals.potentialGainFromOptimization.toFixed(
                  1
                )} FPTS posibles optimizando titulares`
              : lineupTotals.injuredStartersCount > 0
              ? `${lineupTotals.injuredStartersCount} titular(es) con alerta médica`
              : 'Quinteto y rotación optimizados'}
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

              {/* Roster Table (Starters + Bench Split) */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[11px] text-slate-400 bg-[#0B1120]/60">
                      <th className="py-2.5 pl-4 pr-2 font-medium">Puesto</th>
                      <th className="py-2.5 px-3 font-medium">
                        <ColumnSortHeader
                          label="Jugador"
                          active={rosterSortKey === 'name'}
                          asc={rosterSortAsc}
                          onClick={() => handleRosterSort('name')}
                        />
                      </th>
                      <th className="py-2.5 px-3 font-medium">
                        <ColumnSortHeader
                          label="Salud / Parte"
                          active={rosterSortKey === 'severity'}
                          asc={rosterSortAsc}
                          onClick={() => handleRosterSort('severity')}
                        />
                      </th>
                      <th className="py-2.5 px-3 font-medium">
                        <ColumnSortHeader
                          label={`Calendario (${activeWeek?.label || 'Semana'})`}
                          active={rosterSortKey === 'gamesCount'}
                          asc={rosterSortAsc}
                          onClick={() => handleRosterSort('gamesCount')}
                        />
                      </th>
                      <th className="py-2.5 px-3 font-medium text-right">
                        <ColumnSortHeader
                          label="Total FPTS"
                          active={rosterSortKey === 'seasonTotalFpts'}
                          asc={rosterSortAsc}
                          onClick={() => handleRosterSort('seasonTotalFpts')}
                          align="right"
                        />
                      </th>
                      <th className="py-2.5 px-3 font-medium text-right">
                        <ColumnSortHeader
                          label="Media FPTS"
                          active={rosterSortKey === 'seasonAvgFpts'}
                          asc={rosterSortAsc}
                          onClick={() => handleRosterSort('seasonAvgFpts')}
                          align="right"
                        />
                      </th>
                      <th className="py-2.5 px-3 font-medium text-right">
                        <ColumnSortHeader
                          label="Últ. 5 PJ"
                          active={rosterSortKey === 'last5AvgFpts'}
                          asc={rosterSortAsc}
                          onClick={() => handleRosterSort('last5AvgFpts')}
                          align="right"
                        />
                      </th>
                      <th className="py-2.5 px-3 font-medium text-right">
                        <ColumnSortHeader
                          label="PJ × Media"
                          active={rosterSortKey === 'rawFormulaFpts'}
                          asc={rosterSortAsc}
                          onClick={() => handleRosterSort('rawFormulaFpts')}
                          align="right"
                        />
                      </th>
                      <th className="py-2.5 px-3 font-medium text-right">
                        <ColumnSortHeader
                          label="Proy. Cierre"
                          active={rosterSortKey === 'lockAdjustedFpts'}
                          asc={rosterSortAsc}
                          onClick={() => handleRosterSort('lockAdjustedFpts')}
                          align="right"
                        />
                      </th>
                      <th className="py-2.5 pl-2 pr-4 font-medium text-right">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]/80 text-xs">
                    {/* 10 Active Starters */}
                    <tr className="bg-[#0B1120]/50">
                      <td
                        colSpan={10}
                        className="py-2 px-4 text-[11px] font-semibold text-emerald-400"
                      >
                        Titulares Activos que Puntúan ({myStarters.length}/10)
                      </td>
                    </tr>
                    {myStarters.map((item, idx) => {
                      const shouldBench = !optimalStarterIds.has(item.player.id);
                      return (
                        <tr
                          key={item.player.id}
                          className="hover:bg-[#182338] transition-colors"
                        >
                          <td className="py-2.5 pl-4 pr-2 font-mono tabular-nums whitespace-nowrap">
                            <span className="font-semibold text-emerald-400">
                              TIT #{idx + 1}
                            </span>
                            {shouldBench && (
                              <span className="block text-[10px] text-amber-300 font-sans">
                                Mejor sentar
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar
                                playerId={item.player.id}
                                name={item.player.name}
                                teamAbbr={item.player.teamAbbr}
                                size="xs"
                              />
                              <div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onInspectEntity('player', item.player.id)
                                  }
                                  className="font-semibold text-slate-100 hover:text-orange-400 transition-colors"
                                >
                                  {item.player.name}
                                </button>
                                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                                  <span>{item.player.teamAbbr} · {item.player.position}</span>
                                  <span>·</span>
                                  <button
                                    type="button"
                                    onClick={() => setInspectedPlayerForLogsId(item.player.id)}
                                    className="text-orange-400 hover:text-orange-300 font-semibold hover:underline"
                                    title="Ver desglose de partidos y FPTS obtenidas"
                                  >
                                    {item.stats.currentSeasonGamesPlayed} PJ (Ver partidos)
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 max-w-[190px]">
                            <div>
                              {renderSeverityText(
                                item.severity,
                                item.injury?.statusLabelEs
                              )}
                            </div>
                            {item.injury?.detailEs && (
                              <div className="text-[11px] text-slate-400 truncate">
                                {item.injury.detailEs}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 min-w-[210px]">
                            <div className="font-mono tabular-nums font-semibold text-slate-200">
                              {item.teamSched.gamesCount} PJ
                              {item.teamSched.b2bCount > 0
                                ? ` · ${item.teamSched.b2bCount} B2B`
                                : ''}
                            </div>
                            {renderScheduleBadges(item.teamSched)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-100">
                            {formatFptsExact(item.stats.seasonTotalFpts)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                            {item.stats.seasonAvgFpts.toFixed(1)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums font-medium ${
                              item.stats.formDeltaLast5 >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {item.stats.last5AvgFpts.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                            {item.weekly.rawFormulaFpts.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-orange-400">
                            {item.weekly.lockAdjustedFpts.toFixed(1)}
                          </td>
                          <td className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleTogglePlayerSlot(item.player.id)}
                              className="px-2.5 py-1 rounded bg-[#0B1120] border border-[#1E293B] hover:border-slate-500 text-slate-300 hover:text-white transition-colors"
                            >
                              Al banquillo
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* 2 Bench Reserves */}
                    <tr className="bg-[#0B1120]/50 border-t border-[#1E293B]">
                      <td
                        colSpan={10}
                        className="py-2 px-4 text-[11px] font-semibold text-slate-400"
                      >
                        Reservas en Banquillo — No Puntúan ({myBench.length}/2)
                      </td>
                    </tr>
                    {myBench.map((item, idx) => {
                      const shouldStart = optimalStarterIds.has(item.player.id);
                      return (
                        <tr
                          key={item.player.id}
                          className="bg-[#0B1120]/25 hover:bg-[#182338] transition-colors"
                        >
                          <td className="py-2.5 pl-4 pr-2 font-mono tabular-nums whitespace-nowrap">
                            <span className="text-slate-400">RES #{idx + 1}</span>
                            {shouldStart && (
                              <span className="block text-[10px] text-emerald-400 font-sans font-semibold">
                                Subir a titular
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar
                                playerId={item.player.id}
                                name={item.player.name}
                                teamAbbr={item.player.teamAbbr}
                                size="xs"
                              />
                              <div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onInspectEntity('player', item.player.id)
                                  }
                                  className="font-semibold text-slate-200 hover:text-orange-400 transition-colors"
                                >
                                  {item.player.name}
                                </button>
                                <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                                  <span>{item.player.teamAbbr} · {item.player.position}</span>
                                  <span>·</span>
                                  <button
                                    type="button"
                                    onClick={() => setInspectedPlayerForLogsId(item.player.id)}
                                    className="text-orange-400 hover:text-orange-300 font-semibold hover:underline"
                                    title="Ver desglose de partidos y FPTS obtenidas"
                                  >
                                    {item.stats.currentSeasonGamesPlayed} PJ (Ver partidos)
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 max-w-[190px]">
                            <div>
                              {renderSeverityText(
                                item.severity,
                                item.injury?.statusLabelEs
                              )}
                            </div>
                            {item.injury?.detailEs && (
                              <div className="text-[11px] text-slate-400 truncate">
                                {item.injury.detailEs}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 min-w-[210px]">
                            <div className="font-mono tabular-nums text-slate-300 font-semibold">
                              {item.teamSched.gamesCount} PJ
                            </div>
                            {renderScheduleBadges(item.teamSched)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                            {formatFptsExact(item.stats.seasonTotalFpts)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                            {item.stats.seasonAvgFpts.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                            {item.stats.last5AvgFpts.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400">
                            {item.weekly.rawFormulaFpts.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-300">
                            {item.weekly.lockAdjustedFpts.toFixed(1)}
                          </td>
                          <td className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleTogglePlayerSlot(item.player.id)}
                              className="px-2.5 py-1 rounded bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold transition-colors"
                            >
                              Subir a titular
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

                {/* Sort Mode */}
                <div className="flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                  {(
                    [
                      { id: 'netGainWeek', label: 'Ganancia Semanal' },
                      { id: 'formDelta', label: 'Explosión Últ. 5 PJ' },
                      { id: 'seasonAvg', label: 'Media FPTS/PJ' },
                    ] as const
                  ).map((sOpt) => (
                    <button
                      key={sOpt.id}
                      type="button"
                      onClick={() => setWaiverSortBy(sOpt.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        waiverSortBy === sOpt.id
                          ? 'bg-[#1E293B] text-orange-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {sOpt.label}
                    </button>
                  ))}
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
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] text-[11px] text-slate-400 bg-[#0B1120]/60">
                    <th className="py-2.5 pl-4 pr-3 font-medium">
                      <ColumnSortHeader
                        label="Agente Libre Disponible"
                        active={waiverTableSortKey === 'name'}
                        asc={waiverTableSortAsc}
                        onClick={() => handleWaiverTableSort('name')}
                      />
                    </th>
                    <th className="py-2.5 px-3 font-medium">
                      <ColumnSortHeader
                        label="Salud"
                        active={waiverTableSortKey === 'severity'}
                        asc={waiverTableSortAsc}
                        onClick={() => handleWaiverTableSort('severity')}
                      />
                    </th>
                    <th className="py-2.5 px-3 font-medium">
                      <ColumnSortHeader
                        label={`Partidos (${activeWeek?.label || 'Semana'})`}
                        active={waiverTableSortKey === 'gamesCount'}
                        asc={waiverTableSortAsc}
                        onClick={() => handleWaiverTableSort('gamesCount')}
                      />
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      <ColumnSortHeader
                        label="Total FPTS"
                        active={waiverTableSortKey === 'seasonTotalFpts'}
                        asc={waiverTableSortAsc}
                        onClick={() => handleWaiverTableSort('seasonTotalFpts')}
                        align="right"
                      />
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      <ColumnSortHeader
                        label="Media FPTS"
                        active={waiverTableSortKey === 'seasonAvgFpts'}
                        asc={waiverTableSortAsc}
                        onClick={() => handleWaiverTableSort('seasonAvgFpts')}
                        align="right"
                      />
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      <ColumnSortHeader
                        label="Últ. 5 PJ"
                        active={waiverTableSortKey === 'last5AvgFpts'}
                        asc={waiverTableSortAsc}
                        onClick={() => handleWaiverTableSort('last5AvgFpts')}
                        align="right"
                      />
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      <ColumnSortHeader
                        label="Proy. Semana"
                        active={waiverTableSortKey === 'lockAdjustedFpts'}
                        asc={waiverTableSortAsc}
                        onClick={() => handleWaiverTableSort('lockAdjustedFpts')}
                        align="right"
                      />
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      <ColumnSortHeader
                        label="Ganancia vs Corte"
                        active={waiverTableSortKey === 'netWeekGain'}
                        asc={waiverTableSortAsc}
                        onClick={() => handleWaiverTableSort('netWeekGain')}
                        align="right"
                      />
                    </th>
                    <th className="py-2.5 pl-2 pr-4 font-medium text-right">
                      Acciones de Mercado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/80 text-xs">
                  {availableWaiverPool.slice(0, 40).map((item) => (
                    <tr
                      key={item.player.id}
                      className="hover:bg-[#182338] transition-colors"
                    >
                      <td className="py-2.5 pl-4 pr-3 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <PlayerAvatar
                            playerId={item.player.id}
                            name={item.player.name}
                            teamAbbr={item.player.teamAbbr}
                            size="xs"
                          />
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                onInspectEntity('player', item.player.id)
                              }
                              className="font-semibold text-slate-100 hover:text-orange-400 text-left transition-colors"
                            >
                              {item.player.name}
                            </button>
                            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                              <span>{item.player.teamAbbr} · {item.player.position} · {item.stats.minutesAvg.toFixed(1)} MIN</span>
                              <span>·</span>
                              <button
                                type="button"
                                onClick={() => setInspectedPlayerForLogsId(item.player.id)}
                                className="text-orange-400 hover:text-orange-300 font-semibold hover:underline"
                                title="Ver desglose de partidos y FPTS obtenidas"
                              >
                                Ver partidos ({item.stats.currentSeasonGamesPlayed})
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {renderSeverityText(
                          item.severity,
                          item.injury?.statusLabelEs
                        )}
                      </td>

                      <td className="py-2.5 px-3 min-w-[210px]">
                        <div className="font-mono tabular-nums font-semibold text-slate-200">
                          {item.teamSched.gamesCount} PJ
                          {item.teamSched.b2bCount > 0
                            ? ` · ${item.teamSched.b2bCount} B2B`
                            : ''}
                        </div>
                        {renderScheduleBadges(item.teamSched)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                        {formatFptsExact(item.stats.seasonTotalFpts)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                        {item.stats.seasonAvgFpts.toFixed(1)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        <span className="text-slate-100 font-medium">
                          {item.stats.last5AvgFpts.toFixed(1)}
                        </span>
                        <span
                          className={`ml-1 text-[11px] ${
                            item.stats.formDeltaLast5 >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          ({item.stats.formDeltaLast5 >= 0 ? '+' : ''}
                          {item.stats.formDeltaLast5.toFixed(1)})
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-orange-400">
                        {item.weekly.lockAdjustedFpts.toFixed(1)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {effectiveDropMember ? (
                          <div>
                            <span
                              className={`font-bold ${
                                item.netWeekGain >= 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {item.netWeekGain >= 0 ? '+' : ''}
                              {item.netWeekGain.toFixed(1)} sem.
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              ({item.netPerGameGain >= 0 ? '+' : ''}
                              {item.netPerGameGain.toFixed(1)} / PJ)
                            </span>
                          </div>
                        ) : (
                          <span className="text-emerald-400 font-semibold">
                            +{item.weekly.lockAdjustedFpts.toFixed(1)} sem.
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <select
                            aria-label={`Asignar ${item.player.name} a un equipo rival`}
                            value=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val) handleAssignPlayerToRival(item.player.id, val);
                            }}
                            className="px-2 py-1 rounded bg-[#0B1120] border border-[#1E293B] hover:border-slate-600 text-slate-300 text-xs max-w-[125px] focus:outline-none focus:border-orange-500"
                          >
                            <option value="">Asignar rival...</option>
                            {rivalSlotKeys.map((tKey) => (
                              <option key={tKey} value={tKey}>
                                {getRivalDisplayName(tKey)}
                              </option>
                            ))}
                            <option value="__generic__">Ocupado (sin equipo)</option>
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              handleExecuteWaiverSwap(
                                item.player.id,
                                effectiveDropMember?.player.id
                              )
                            }
                            className="px-2.5 py-1 rounded bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold transition-colors"
                          >
                            {myRosterEnriched.length >=
                            OFFICIAL_LEAGUE_RULES.maxContracts
                              ? 'Alta × Corte'
                              : 'Fichar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: OFFICIAL RULES TRADE ANALYZER */}
      {activeTab === 'trades' && (
        <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 sm:p-5 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Analizador y Ejecutor de Traspasos (Fórmula Oficial + Tope de 12 Contratos)
              </h3>
              <p className="text-xs text-slate-400">
                Evalúa intercambios 1x1, 2x2 o 2x1 descontando el corte obligatorio si superas 12 contratos o sumando el hueco libre de streaming, y aplica el traspaso en tus plantillas guardadas cuando se cierre.
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
                  {tradeEvaluation.sendItems.map((item) => (
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
                            {item.player.teamAbbr} ·{' '}
                            {formatFptsExact(item.stats.seasonTotalFpts)} tot ·{' '}
                            {item.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ ·{' '}
                            {item.teamSched.gamesCount} PJ sem.
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
                  ))}
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
                              {item.player.teamAbbr} ·{' '}
                              {formatFptsExact(item.stats.seasonTotalFpts)} tot ·{' '}
                              {item.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ
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
                <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-xs sm:text-sm font-bold">
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
                </div>

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

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                      <th className="py-2 px-4 font-medium">
                        Bloque del Reglamento Oficial
                      </th>
                      <th className="py-2 px-3 font-medium text-right">
                        Entregas / PJ
                      </th>
                      <th className="py-2 px-3 font-medium text-right">
                        Recibes / PJ
                      </th>
                      <th className="py-2 px-4 font-medium text-right">
                        Diferencia
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]/60 font-mono tabular-nums">
                    {[
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
                    ].map((row) => {
                      const diff = row.b - row.a;
                      return (
                        <tr key={row.label}>
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
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Alertas Médicas en Español & Relevos de Rotación (Riesgo de 0 FPTS)
              </h3>
              <p className="text-xs text-slate-400">
                Al no existir sustituciones entre semana tras el bloqueo del lunes, revisa aquí las bajas confirmadas o dudas y qué compañeros sanos están libres en tu liga.
              </p>
            </div>

            {injuryRotationCards.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No se registran partes médicos críticos en este momento.
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
                            <div className="text-xs text-slate-400 font-mono">
                              {injItem.player.teamAbbr} · {injItem.player.position} ·{' '}
                              {injItem.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ
                            </div>
                          </div>
                        </div>

                        <div className="text-right text-xs shrink-0">
                          {renderSeverityText(
                            injItem.severity,
                            injItem.injury?.statusLabelEs
                          )}
                          <div className="text-[11px] text-slate-400 font-mono">
                            {injItem.teamSched.gamesCount} PJ sem.
                          </div>
                        </div>
                      </div>

                      {injItem.injury?.detailEs && (
                        <p className="text-xs text-slate-300">
                          Parte médico: {injItem.injury.detailEs}
                        </p>
                      )}

                      {beneficiaries.length > 0 && (
                        <div className="pt-2 border-t border-[#1E293B] space-y-1.5">
                          <p className="text-[11px] text-slate-400">
                            Compañeros sanos que suben rotación ({injItem.player.teamAbbr}):
                          </p>
                          {beneficiaries.map((ben) => (
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
                              </button>
                              <span className="font-mono tabular-nums text-slate-300 shrink-0">
                                {ben.stats.last5AvgFpts.toFixed(1)} FPTS (5P) ·{' '}
                                {ben.teamSched.gamesCount} PJ
                              </span>
                            </div>
                          ))}
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

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#1E293B] text-[11px] text-slate-400 bg-[#0B1120]/60">
                        <th className="py-2.5 pl-4 pr-2 font-medium">Fecha / Rival</th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          FGM (+2)
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          FGMI (-1)
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          3PM (+1)
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          3PMI (+0.5)
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          FTM (+1)
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          FTMI (-1)
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          OREB (+1.5)
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          DREB (+0.75)
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          AST (+1.5)
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          STL/BLK (+2.5)
                        </th>
                        <th className="py-2.5 px-2 font-medium text-right">
                          TO (-2)
                        </th>
                        <th className="py-2.5 pl-2 pr-4 font-medium text-right">
                          Total FPTS
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]/70 font-mono tabular-nums">
                      {auditedPlayerItem.player.games
                        .filter((g) =>
                          auditedPlayerItem.stats.currentSeasonGamesPlayed > 0
                            ? g.seasonLabel === '2026-27'
                            : true
                        )
                        .slice(0, 15)
                        .map((g) => {
                          const b = computeOfficialGameFptsBreakdown(g, 0);
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
            <div className="overflow-x-auto border border-[#1E293B] rounded-lg bg-[#0B1120]">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-[#1E293B] bg-[#0F172A] text-slate-400">
                    <th className="py-2.5 px-3.5 font-sans font-medium">Acción Estadística</th>
                    <th className="py-2.5 px-3 font-sans font-medium">Código</th>
                    <th className="py-2.5 px-3 text-right font-sans font-medium">Valor FPTS</th>
                    <th className="py-2.5 px-3.5 font-sans font-medium">Aplicación Exacta en el Cálculo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/80">
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Tiro de campo anotado</td>
                    <td className="py-2 px-3 text-orange-400">FGM</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">+2.0</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Suma +2.0 por toda canasta en juego (de 2 o de 3 puntos).</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Tiro de campo fallado</td>
                    <td className="py-2 px-3 text-orange-400">FGMI</td>
                    <td className="py-2 px-3 text-right text-rose-400 font-bold">-1.0</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Calculado como FGA − FGM. Un tiro de 2 fallado resta −1.0 neto.</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Tiro libre anotado</td>
                    <td className="py-2 px-3 text-orange-400">FTM</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">+1.0</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Suma +1.0 por cada tiro libre convertido.</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Tiro libre fallado</td>
                    <td className="py-2 px-3 text-orange-400">FTMI</td>
                    <td className="py-2 px-3 text-right text-rose-400 font-bold">-1.0</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Calculado como FTA − FTM. Penaliza la ineficiencia desde la línea.</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Triple anotado (Bonus)</td>
                    <td className="py-2 px-3 text-orange-400">3PM</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">+1.0</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Acumulativo al FGM: cada triple encestado vale +2.0 (FGM) + 1.0 (3PM) = +3.0 FPTS.</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Triple fallado (Compensación)</td>
                    <td className="py-2 px-3 text-orange-400">3PMI</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">+0.5</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Calculado como 3PA − 3PM: suaviza el fallo exterior (−1.0 FGMI + 0.5 3PMI = −0.5 FPTS neto).</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Rebote ofensivo</td>
                    <td className="py-2 px-3 text-orange-400">OREB</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">+1.5</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Premia las segundas oportunidades generadas en aro rival.</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Rebote defensivo</td>
                    <td className="py-2 px-3 text-orange-400">DREB</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">+0.75</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Suma +0.75 FPTS por cada rebote defensivo cerrado.</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Asistencia</td>
                    <td className="py-2 px-3 text-orange-400">AST</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">+1.5</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Suma +1.5 FPTS por pase directo de canasta.</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Robo de balón</td>
                    <td className="py-2 px-3 text-orange-400">STL</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">+2.5</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Alto impacto defensivo por recuperación limpia.</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Tapón</td>
                    <td className="py-2 px-3 text-orange-400">BLK</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">+2.5</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Alto impacto de protección de aro (+2.5 FPTS por tapón).</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Pérdida de balón</td>
                    <td className="py-2 px-3 text-orange-400">TO</td>
                    <td className="py-2 px-3 text-right text-rose-400 font-bold">-2.0</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Resta −2.0 FPTS por cada balón perdido.</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3.5 font-sans font-semibold text-slate-200">Expulsión del partido</td>
                    <td className="py-2 px-3 text-orange-400">EJ</td>
                    <td className="py-2 px-3 text-right text-rose-400 font-bold">-5.0</td>
                    <td className="py-2 px-3.5 text-slate-400 font-sans">Penalización disciplinaria por descalificación o doble técnica.</td>
                  </tr>
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
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {g2027.length} PJ disputados en 2026-27 · Total Acumulado:{' '}
                      <span className="font-bold text-emerald-400">
                        {formatFptsExact(item.stats.seasonTotalFpts)} FPTS
                      </span>{' '}
                      · Media:{' '}
                      <span className="font-bold text-orange-400">
                        {item.stats.seasonAvgFpts.toFixed(1)} FPTS/PJ
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

              {/* Game Log Table */}
              <div className="overflow-y-auto flex-1 pr-1 space-y-2">
                {g2027.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No hay partidos oficiales registrados para {item.player.name} en la temporada 2026-27.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#1E293B] text-[11px] text-slate-400 bg-[#0B1120]/80 sticky top-0 z-10">
                        <th className="py-2.5 pl-3 pr-2 font-medium">Fecha</th>
                        <th className="py-2.5 px-2 font-medium">Rival</th>
                        <th className="py-2.5 px-2 font-medium">Min</th>
                        <th className="py-2.5 px-2 font-medium">PTS</th>
                        <th className="py-2.5 px-2 font-medium">TC (FGM/A)</th>
                        <th className="py-2.5 px-2 font-medium">3P (3PM/A)</th>
                        <th className="py-2.5 px-2 font-medium">TL (FTM/A)</th>
                        <th className="py-2.5 px-2 font-medium">REB (O/D)</th>
                        <th className="py-2.5 px-2 font-medium">AST</th>
                        <th className="py-2.5 px-2 font-medium">ROB</th>
                        <th className="py-2.5 px-2 font-medium">TAP</th>
                        <th className="py-2.5 px-2 font-medium">PER</th>
                        <th className="py-2.5 pr-3 font-medium text-right">FPTS Obtenidos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]/70 font-mono text-[11px]">
                      {g2027.map((g) => {
                        const breakdown = computeOfficialGameFptsBreakdown(g, 0);
                        return (
                          <tr key={`${g.eventId}-${g.date}`} className="hover:bg-[#182338] transition-colors">
                            <td className="py-2.5 pl-3 pr-2 whitespace-nowrap text-slate-300 font-sans font-medium">
                              {g.date}
                            </td>
                            <td className="py-2.5 px-2 whitespace-nowrap">
                              <span className={g.isHome ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
                                {g.isHome ? 'vs' : '@'}{g.opponentAbbr}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-slate-300">{g.minutes}m</td>
                            <td className="py-2.5 px-2 font-bold text-slate-100">{g.points}</td>
                            <td className="py-2.5 px-2 text-slate-400">
                              {g.fgm}/{g.fga}
                            </td>
                            <td className="py-2.5 px-2 text-slate-400">
                              {g.fg3m}/{g.fg3a}
                            </td>
                            <td className="py-2.5 px-2 text-slate-400">
                              {g.ftm}/{g.fta}
                            </td>
                            <td className="py-2.5 px-2 text-slate-300">
                              {g.rebounds} ({g.oreb}/{g.dreb})
                            </td>
                            <td className="py-2.5 px-2 text-slate-300">{g.assists}</td>
                            <td className="py-2.5 px-2 text-emerald-400 font-semibold">{g.steals}</td>
                            <td className="py-2.5 px-2 text-emerald-400 font-semibold">{g.blocks}</td>
                            <td className="py-2.5 px-2 text-rose-400">{g.turnovers}</td>
                            <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-orange-400 text-xs">
                              {formatFptsExact(breakdown.totalFpts)} FPTS
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
                  Desglose exacto de regla ESPN: FGM +2, FGMI -1, FTM +1, FTMI -1, 3PM +1, 3PMI +0.5, OREB +1.5, DREB +0.75, AST +1.5, STL +2.5, BLK +2.5, TO -2.0.
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
