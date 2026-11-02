import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Compass,
  Flame,
  LayoutGrid,
  Link2,
  Lock,
  Menu,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Star,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import type {
  ActiveSection,
  BootstrapPayload,
  ExperienceMode,
  MilestonesPayload,
  PlayerSummary,
  ScoreboardGame,
  SearchPlayerResult,
  SeasonMode,
  TeamSummary,
  ThresholdSettings,
  WindowSize,
} from './types/nba';
import {
  computeConsistencyTable,
  detectActiveStreaks,
  detectAnomalies,
} from './utils/analytics';
import {
  FILTER_PRESETS,
  computeLeagueBenchmarks,
  describeSliderSurpriseLevel,
  detectActivePreset,
} from './utils/humanize';
import { GuidedHomeView } from './components/GuidedHomeView';
import { GameDayAnalyzerView } from './components/GameDayAnalyzerView';
import { AnomalyRadarView } from './components/AnomalyRadarView';
import { StreaksConsistencyView } from './components/StreaksConsistencyView';
import { HeadToHeadBattleView } from './components/HeadToHeadBattleView';
import { RangeComparatorView } from './components/RangeComparatorView';
import { TeamsExplorerView } from './components/TeamsExplorerView';
import { PlayersExplorerView } from './components/PlayersExplorerView';
import { SeasonMilestonesView } from './components/SeasonMilestonesView';
import { GlossaryView } from './components/GlossaryView';
import { FantasyEspnAssistantView } from './components/FantasyEspnAssistantView';
import { AdminSecurityConfigPanel } from './components/AdminSecurityConfigPanel';
import { EntityInspectorDrawer } from './components/EntityInspectorDrawer';
import { MetricInfoTooltip } from './components/MetricUiHelpers';
import { TeamLogo } from './components/NbaVisuals';
import {
  parseRouteFromSearch,
  readRadarHistoryMeta,
  syncBrowserUrl,
  type AppRouteState,
  type FantasyUrlTab,
} from './utils/urlRouting';
import {
  fetchBootstrapClient,
  peekCachedBootstrapClient,
} from './utils/bootstrapWireCodec';
import {
  getStoredAdminToken,
  loginAdminWithPasscode,
  logoutAdminSession,
  verifyStoredAdminSession,
} from './utils/adminAuthClient';

const STORAGE_THRESHOLDS_KEY = 'courtpulse_nba_thresholds_v1';
const STORAGE_WATCHLIST_KEY = 'courtpulse_nba_watchlist_v2';
const STORAGE_SEASON_KEY = 'courtpulse_nba_season_v1';
const STORAGE_EXP_MODE_KEY = 'courtpulse_nba_exp_mode_v1';

const DEFAULT_THRESHOLDS: ThresholdSettings = {
  windowSize: 5,
  minZScore: 1.2,
  minPctDelta: 16,
  minMinutes: 22,
  minStreakGames: 3,
};

function loadSavedThresholds(): ThresholdSettings {
  try {
    const raw = localStorage.getItem(STORAGE_THRESHOLDS_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const parsed = JSON.parse(raw) as Partial<ThresholdSettings>;
    return {
      windowSize:
        parsed.windowSize === 3 || parsed.windowSize === 5 || parsed.windowSize === 10
          ? parsed.windowSize
          : DEFAULT_THRESHOLDS.windowSize,
      minZScore:
        typeof parsed.minZScore === 'number'
          ? parsed.minZScore
          : DEFAULT_THRESHOLDS.minZScore,
      minPctDelta:
        typeof parsed.minPctDelta === 'number'
          ? parsed.minPctDelta
          : DEFAULT_THRESHOLDS.minPctDelta,
      minMinutes:
        typeof parsed.minMinutes === 'number'
          ? parsed.minMinutes
          : DEFAULT_THRESHOLDS.minMinutes,
      minStreakGames:
        typeof parsed.minStreakGames === 'number'
          ? parsed.minStreakGames
          : DEFAULT_THRESHOLDS.minStreakGames,
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function loadSavedWatchlist(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_WATCHLIST_KEY);
    if (!raw) {
      // Official NBA.com IDs: Nikola Jokić, Victor Wembanyama, Luka Dončić
      return new Set(['player:203999', 'player:1641705', 'player:1629029']);
    }
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function loadSavedSeasonMode(): SeasonMode {
  try {
    const raw = localStorage.getItem(STORAGE_SEASON_KEY);
    if (raw === '2027' || raw === '2026' || raw === 'continuous') return raw;
    return 'continuous';
  } catch {
    return 'continuous';
  }
}

function loadSavedExperienceMode(): ExperienceMode {
  try {
    const raw = localStorage.getItem(STORAGE_EXP_MODE_KEY);
    if (raw === 'simple' || raw === 'advanced') return raw;
    return 'simple';
  } catch {
    return 'simple';
  }
}

export default function App() {
  const initialRoute = useMemo(
    () =>
      parseRouteFromSearch(
        typeof window !== 'undefined' ? window.location.search : '',
        typeof window !== 'undefined' ? window.location.pathname : '/'
      ),
    []
  );
  const routeRef = useRef<AppRouteState>(initialRoute);

  const [activeSection, setActiveSection] = useState<ActiveSection>(
    initialRoute.section
  );
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(
    loadSavedExperienceMode
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [seasonMode, setSeasonMode] = useState<SeasonMode>(loadSavedSeasonMode);
  const [settings, setSettings] = useState<ThresholdSettings>(loadSavedThresholds);
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(loadSavedWatchlist);
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);
  const [showThresholdBar, setShowThresholdBar] = useState<boolean>(
    () => loadSavedExperienceMode() === 'advanced'
  );

  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [totalLeaguePlayersAvailable, setTotalLeaguePlayersAvailable] = useState(0);
  const [allPlayersLoaded, setAllPlayersLoaded] = useState(false);
  const [loadingAllPlayers, setLoadingAllPlayers] = useState(false);
  const [scoreboard, setScoreboard] = useState<ScoreboardGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);

  const [milestonesData, setMilestonesData] = useState<MilestonesPayload | null>(null);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [milestonesError, setMilestonesError] = useState<string | null>(null);
  const [gamedayRefreshCounter, setGamedayRefreshCounter] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isPrivateUnlocked, setIsPrivateUnlocked] = useState<boolean>(() =>
    Boolean(getStoredAdminToken())
  );
  const [adminZoneSection, setAdminZoneSection] = useState<'fantasy' | 'web_config'>(
    'fantasy'
  );
  const [passcodeAttempt, setPasscodeAttempt] = useState('');
  const [passcodeErrorMsg, setPasscodeErrorMsg] = useState<string | null>(null);
  const [passcodeLockedOut, setPasscodeLockedOut] = useState(false);
  const [verifyingPasscode, setVerifyingPasscode] = useState(false);

  // URL-synced Inspector, Jornadas, Comparator, Duel & Fantasy sub-routing state
  const [inspected, setInspected] = useState<{
    type: 'player' | 'team' | null;
    id: string | null;
  }>({
    type: initialRoute.inspectedType,
    id: initialRoute.inspectedId,
  });

  const [gamedayDateParam, setGamedayDateParam] = useState<string | null>(
    initialRoute.gamedayDate
  );
  const [gamedayReportId, setGamedayReportId] = useState<string | null>(
    initialRoute.gamedayReportId
  );

  const [comparatorTarget, setComparatorTarget] = useState<{
    type: 'player' | 'team';
    id?: string;
  }>({
    type: initialRoute.comparatorType,
    id: initialRoute.comparatorId || undefined,
  });

  const [duelTarget, setDuelTarget] = useState<{
    playerAId?: string;
    playerBId?: string;
  }>({
    playerAId: initialRoute.duelPlayerAId || undefined,
    playerBId: initialRoute.duelPlayerBId || undefined,
  });

  const [fantasyTab, setFantasyTab] = useState<FantasyUrlTab>(
    initialRoute.fantasyTab
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_THRESHOLDS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage quota errors
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_WATCHLIST_KEY,
        JSON.stringify(Array.from(watchlistIds))
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [watchlistIds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SEASON_KEY, seasonMode);
    } catch {
      // Ignore storage quota errors
    }
  }, [seasonMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_EXP_MODE_KEY, experienceMode);
    } catch {
      // Ignore storage quota errors
    }
  }, [experienceMode]);

  useEffect(() => {
    const timers = new Map<Element, number>();

    const handleScrollActivity = (event: Event) => {
      const rawTarget = event.target;
      const targetEl =
        rawTarget instanceof Element &&
        rawTarget !== document.body &&
        rawTarget !== document.documentElement
          ? rawTarget
          : document.documentElement;

      targetEl.setAttribute('data-scrolling', 'true');
      const prevTimer = timers.get(targetEl);
      if (prevTimer !== undefined) {
        window.clearTimeout(prevTimer);
      }
      const nextTimer = window.setTimeout(() => {
        targetEl.removeAttribute('data-scrolling');
        timers.delete(targetEl);
      }, 850);
      timers.set(targetEl, nextTimer);
    };

    window.addEventListener('scroll', handleScrollActivity, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener('scroll', handleScrollActivity, true);
      timers.forEach((timerId, el) => {
        window.clearTimeout(timerId);
        el.removeAttribute('data-scrolling');
      });
      timers.clear();
    };
  }, []);

  const applyRouteState = useCallback((next: AppRouteState) => {
    routeRef.current = next;
    setActiveSection(next.section);
    setInspected({ type: next.inspectedType, id: next.inspectedId });
    setGamedayDateParam(next.gamedayDate);
    setGamedayReportId(next.gamedayReportId);
    setComparatorTarget({
      type: next.comparatorType,
      id: next.comparatorId || undefined,
    });
    setDuelTarget({
      playerAId: next.duelPlayerAId || undefined,
      playerBId: next.duelPlayerBId || undefined,
    });
    setFantasyTab(next.fantasyTab);
  }, []);

  const commitRoute = useCallback(
    (
      updater: (prev: AppRouteState) => AppRouteState,
      mode: 'push' | 'replace',
      openedOverlay: 'inspector' | 'game_report' | null = null
    ) => {
      const next = updater(routeRef.current);
      applyRouteState(next);
      syncBrowserUrl(next, mode, openedOverlay);
    },
    [applyRouteState]
  );

  // Verify stored admin session token against server on startup
  useEffect(() => {
    if (!getStoredAdminToken()) {
      setIsPrivateUnlocked(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const valid = await verifyStoredAdminSession();
      if (!cancelled) {
        setIsPrivateUnlocked(valid);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync Browser Back / Forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      setMobileMenuOpen(false);
      const parsed = parseRouteFromSearch(
        window.location.search,
        window.location.pathname
      );
      applyRouteState(parsed);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyRouteState]);

  const handleChangeExperienceMode = useCallback((mode: ExperienceMode) => {
    setExperienceMode(mode);
    setShowThresholdBar(mode === 'advanced');
  }, []);

  const handleNavigateSection = useCallback(
    (section: ActiveSection) => {
      setMobileMenuOpen(false);
      commitRoute(
        (prev) => ({
          ...prev,
          section,
          inspectedType: null,
          inspectedId: null,
          gamedayReportId: section === 'gameday' ? prev.gamedayReportId : null,
        }),
        'push',
        null
      );
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [commitRoute]
  );

  const importedDirectoryPlayersRef = useRef<Map<string, PlayerSummary>>(
    new Map()
  );

  const applyBootstrapPayload = useCallback((payload: BootstrapPayload) => {
    const basePlayers = payload.players || [];
    const extraPlayers: PlayerSummary[] = [];
    if (importedDirectoryPlayersRef.current.size > 0) {
      const existingIds = new Set(basePlayers.map((p) => p.id));
      for (const extra of importedDirectoryPlayersRef.current.values()) {
        if (!existingIds.has(extra.id)) {
          extraPlayers.push(extra);
        }
      }
    }

    setTeams(payload.teams || []);
    setPlayers(
      extraPlayers.length > 0 ? [...extraPlayers, ...basePlayers] : basePlayers
    );
    setTotalLeaguePlayersAvailable(
      payload.totalLeaguePlayersAvailable || basePlayers.length
    );
    setAllPlayersLoaded(Boolean(payload.allPlayersLoaded));
    setScoreboard(payload.scoreboard || []);
  }, []);

  const fetchBootstrap = useCallback(
    async (
      mode: SeasonMode,
      isManualRefresh = false,
      requestAllPlayers = false
    ) => {
      setErrorMsg(null);

      // Zero-latency switch when target season dataset is already in client memory
      if (!isManualRefresh && !requestAllPlayers) {
        const cached = peekCachedBootstrapClient(mode);
        if (cached) {
          applyBootstrapPayload(cached);
          setLoading(false);
          return;
        }
      }

      if (requestAllPlayers && !isManualRefresh) {
        setLoadingAllPlayers(true);
      } else if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const payload = await fetchBootstrapClient(mode, {
          forceRefresh: isManualRefresh,
        });
        applyBootstrapPayload(payload);
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'No se pudo conectar con la fuente de datos NBA.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingAllPlayers(false);
      }
    },
    [applyBootstrapPayload]
  );

  const fetchMilestones = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setMilestonesLoading(true);
    }
    setMilestonesError(null);

    try {
      const url = isManualRefresh
        ? '/api/nba/milestones?refresh=1'
        : '/api/nba/milestones';
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('No se pudieron obtener los hitos comparativos de temporada.');
      }
      const payload = (await res.json()) as MilestonesPayload;
      setMilestonesData(payload);
    } catch (err) {
      setMilestonesError(
        err instanceof Error
          ? err.message
          : 'Error al conectar con el servidor de hitos NBA.'
      );
    } finally {
      setMilestonesLoading(false);
      if (isManualRefresh) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchBootstrap(seasonMode, false, false);
  }, [seasonMode, fetchBootstrap]);

  useEffect(() => {
    void fetchMilestones(false);
  }, [fetchMilestones]);

  const handleManualRefresh = useCallback(() => {
    void fetchBootstrap(seasonMode, true, allPlayersLoaded);
    void fetchMilestones(true);
    setGamedayRefreshCounter((c) => c + 1);
  }, [fetchBootstrap, fetchMilestones, seasonMode, allPlayersLoaded]);

  const handleLoadAllPlayers = useCallback(() => {
    void fetchBootstrap(seasonMode, false, true);
  }, [fetchBootstrap, seasonMode]);

  const handleToggleWatchlist = useCallback((entityKey: string) => {
    setWatchlistIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityKey)) next.delete(entityKey);
      else next.add(entityKey);
      return next;
    });
  }, []);

  const ensurePlayerInMemory = useCallback(
    async (playerId: string) => {
      if (!playerId || players.some((p) => p.id === playerId)) return;
      try {
        const res = await fetch(
          `/api/nba/player/${encodeURIComponent(playerId)}?seasonMode=continuous`
        );
        if (res.ok) {
          const json = (await res.json()) as { player?: PlayerSummary };
          if (json.player) {
            importedDirectoryPlayersRef.current.set(json.player.id, json.player);
            setPlayers((prev) =>
              prev.some((p) => p.id === json.player!.id)
                ? prev
                : [json.player!, ...prev]
            );
          }
        }
      } catch {
        // Ignore transient network errors; EntityInspectorDrawer also fetches its own dossier
      }
    },
    [players]
  );

  // Hydrate any external player IDs referenced in deep-linked URLs after initial bootstrap
  useEffect(() => {
    if (loading || players.length === 0) return;
    const candidateIds = [
      inspected.type === 'player' ? inspected.id : null,
      duelTarget.playerAId,
      duelTarget.playerBId,
      comparatorTarget.type === 'player' ? comparatorTarget.id : null,
    ].filter((x): x is string => Boolean(x));

    for (const pid of candidateIds) {
      if (!players.some((p) => p.id === pid)) {
        void ensurePlayerInMemory(pid);
      }
    }
  }, [
    loading,
    players,
    inspected.type,
    inspected.id,
    duelTarget.playerAId,
    duelTarget.playerBId,
    comparatorTarget.type,
    comparatorTarget.id,
    ensurePlayerInMemory,
  ]);

  const handleInspectEntity = useCallback(
    (entityType: 'player' | 'team', entityId: string) => {
      const wasClosed = !routeRef.current.inspectedType;
      if (entityType === 'player') {
        void ensurePlayerInMemory(entityId);
      }
      commitRoute(
        (prev) => ({
          ...prev,
          inspectedType: entityType,
          inspectedId: entityId,
        }),
        'push',
        wasClosed ? 'inspector' : null
      );
    },
    [commitRoute, ensurePlayerInMemory]
  );

  const handleCloseInspector = useCallback(() => {
    const meta = readRadarHistoryMeta();
    if (meta.depth > 0 && meta.openedOverlay === 'inspector') {
      window.history.back();
      return;
    }
    commitRoute(
      (prev) => ({
        ...prev,
        inspectedType: null,
        inspectedId: null,
      }),
      meta.depth > 0 ? 'push' : 'replace',
      null
    );
  }, [commitRoute]);

  const handleGamedayDateChange = useCallback(
    (date: string, mode: 'push' | 'replace') => {
      commitRoute(
        (prev) => ({
          ...prev,
          gamedayDate: date,
          gamedayReportId:
            prev.gamedayDate && prev.gamedayDate !== date
              ? null
              : prev.gamedayReportId,
        }),
        mode,
        null
      );
    },
    [commitRoute]
  );

  const handleGamedayReportChange = useCallback(
    (eventId: string | null) => {
      if (eventId) {
        const wasClosed = !routeRef.current.gamedayReportId;
        commitRoute(
          (prev) => ({
            ...prev,
            gamedayReportId: eventId,
          }),
          'push',
          wasClosed ? 'game_report' : null
        );
        return;
      }

      const meta = readRadarHistoryMeta();
      if (
        meta.depth > 0 &&
        meta.openedOverlay === 'game_report' &&
        !routeRef.current.inspectedType
      ) {
        window.history.back();
        return;
      }

      commitRoute(
        (prev) => ({
          ...prev,
          gamedayReportId: null,
        }),
        'replace',
        null
      );
    },
    [commitRoute]
  );

  const handleOpenInComparator = useCallback(
    (entityType: 'player' | 'team', entityId: string) => {
      setMobileMenuOpen(false);
      commitRoute(
        (prev) => ({
          ...prev,
          section: 'comparator',
          comparatorType: entityType,
          comparatorId: entityId,
          inspectedType: null,
          inspectedId: null,
        }),
        'push',
        null
      );
    },
    [commitRoute]
  );

  const handleComparatorSelectionChange = useCallback(
    (entityType: 'player' | 'team', entityId: string) => {
      if (routeRef.current.section !== 'comparator') return;
      if (
        routeRef.current.comparatorType === entityType &&
        routeRef.current.comparatorId === entityId
      ) {
        return;
      }
      commitRoute(
        (prev) => ({
          ...prev,
          comparatorType: entityType,
          comparatorId: entityId,
        }),
        'replace',
        null
      );
    },
    [commitRoute]
  );

  const handleDuelPairChange = useCallback(
    (playerAId: string, playerBId: string) => {
      if (routeRef.current.section !== 'duel') return;
      if (
        routeRef.current.duelPlayerAId === playerAId &&
        routeRef.current.duelPlayerBId === playerBId
      ) {
        return;
      }
      commitRoute(
        (prev) => ({
          ...prev,
          duelPlayerAId: playerAId,
          duelPlayerBId: playerBId,
        }),
        'replace',
        null
      );
    },
    [commitRoute]
  );

  const handleFantasyTabChange = useCallback(
    (tab: FantasyUrlTab) => {
      commitRoute(
        (prev) => ({
          ...prev,
          fantasyTab: tab,
        }),
        'push',
        null
      );
    },
    [commitRoute]
  );

  const handleCopyShareUrl = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  }, []);

  const importExternalPlayer = useCallback(
    async (
      item: SearchPlayerResult,
      openInspectorAfter = true
    ): Promise<PlayerSummary | null> => {
      const existing = players.find((p) => p.id === item.id);
      if (existing) {
        if (openInspectorAfter) {
          handleInspectEntity('player', existing.id);
        }
        return existing;
      }

      setAddingPlayerId(item.id);
      try {
        const params = new URLSearchParams({
          seasonMode,
          name: item.name,
          teamAbbr: item.teamAbbr,
          position: item.position,
        });
        const res = await fetch(
          `/api/nba/player/${encodeURIComponent(item.id)}?${params.toString()}`
        );
        if (res.ok) {
          const json = (await res.json()) as { player?: PlayerSummary };
          if (json.player) {
            importedDirectoryPlayersRef.current.set(json.player.id, json.player);
            setPlayers((prev) => {
              if (prev.some((p) => p.id === json.player!.id)) return prev;
              return [json.player!, ...prev];
            });
            if (openInspectorAfter) {
              handleInspectEntity('player', json.player.id);
            }
            return json.player;
          }
        }
        return null;
      } finally {
        setAddingPlayerId(null);
      }
    },
    [players, seasonMode, handleInspectEntity]
  );

  const handleAddExternalPlayer = useCallback(
    async (item: SearchPlayerResult) => {
      await importExternalPlayer(item, true);
    },
    [importExternalPlayer]
  );

  const handleAddPlayerForComparator = useCallback(
    async (item: SearchPlayerResult) => {
      return importExternalPlayer(item, false);
    },
    [importExternalPlayer]
  );

  const anomalies = useMemo(
    () => detectAnomalies(players, teams, settings),
    [players, teams, settings]
  );

  const streaks = useMemo(
    () => detectActiveStreaks(players, teams, settings.minStreakGames),
    [players, teams, settings.minStreakGames]
  );

  const consistencyRows = useMemo(
    () => computeConsistencyTable(players, settings.minMinutes),
    [players, settings.minMinutes]
  );

  const benchmarks = useMemo(
    () => computeLeagueBenchmarks(players, teams),
    [players, teams]
  );

  const activePreset = useMemo(() => detectActivePreset(settings), [settings]);

  const navItems: Array<{
    id: ActiveSection;
    label: string;
    count?: number;
    icon: typeof Activity;
  }> = [
    {
      id: 'home',
      label: 'Resumen del Día',
      icon: Compass,
    },
    {
      id: 'gameday',
      label: 'Analizador de Jornadas',
      icon: CalendarDays,
    },
    {
      id: 'anomalies',
      label: 'Radar de Anomalías',
      count: anomalies.length,
      icon: Activity,
    },
    {
      id: 'streaks',
      label: 'Rachas y Consistencia',
      count: streaks.length,
      icon: Flame,
    },
    {
      id: 'duel',
      label: 'Duelo Directo 1v1',
      icon: Swords,
    },
    {
      id: 'comparator',
      label: 'Comparador de Tramos',
      icon: ArrowLeftRight,
    },
    {
      id: 'milestones',
      label: 'Hitos de Temporada',
      count: milestonesData
        ? milestonesData.singleGameRecords.length +
          milestonesData.seasonLeaders.length
        : undefined,
      icon: Trophy,
    },
    {
      id: 'teams',
      label: 'Equipos NBA',
      count: teams.length,
      icon: Shield,
    },
    {
      id: 'players',
      label: 'Jugadores NBA',
      count: players.length,
      icon: Users,
    },
    {
      id: 'glossary',
      label: 'Glosario y Guía',
      icon: BookOpen,
    },
  ];

  const activeNavMeta =
    activeSection === 'fantasy_espn'
      ? { id: 'fantasy_espn' as const, label: 'Zona Privada · Admin', icon: Shield }
      : navItems.find((n) => n.id === activeSection) || navItems[0];

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex">
      {/* Desktop Sidebar (256px homogeneous navigation) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0F172A] border-r border-[#1E293B] z-30">
        <div className="h-14 px-5 flex items-center border-b border-[#1E293B]">
          <span className="font-display text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
            RadarNBA
          </span>
        </div>

        {/* Global Detail Level Switcher in Sidebar */}
        <div className="px-3 py-3 border-b border-[#1E293B] space-y-1.5">
          <div className="px-1 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-slate-400">Nivel de detalle</p>
            {activeSection !== 'glossary' && (
              <button
                type="button"
                onClick={() => handleNavigateSection('glossary')}
                className="text-[11px] text-orange-400 hover:text-orange-300 font-medium transition-colors whitespace-nowrap"
              >
                Guía →
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
            <button
              type="button"
              onClick={() => handleChangeExperienceMode('simple')}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                experienceMode === 'simple'
                  ? 'bg-orange-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Sencillo
            </button>
            <button
              type="button"
              onClick={() => handleChangeExperienceMode('advanced')}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                experienceMode === 'advanced'
                  ? 'bg-orange-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Avanzado
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigateSection(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-[#131C2E]'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && !loading && (
                  <span
                    className={`font-mono tabular-nums text-xs ${
                      active ? 'text-slate-950/80' : 'text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Recent / Live Scoreboard Compact Panel in Sidebar Bottom */}
        <div className="p-4 border-t border-[#1E293B] space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-slate-300">Marcadores recientes</span>
            <button
              type="button"
              onClick={() => handleNavigateSection('gameday')}
              className="text-orange-400 hover:text-orange-300 font-medium transition-colors whitespace-nowrap"
            >
              Analizar →
            </button>
          </div>
          {scoreboard.length === 0 ? (
            <p className="text-xs text-slate-500">Sin partidos recientes en agenda.</p>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {scoreboard.slice(0, 5).map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between text-xs py-1 border-b border-[#1E293B]/60 last:border-b-0"
                >
                  <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium whitespace-nowrap">
                    <TeamLogo abbr={g.awayAbbr} size="xs" />
                    <span>{g.awayAbbr}</span>
                    <span className="text-slate-500">@</span>
                    <TeamLogo abbr={g.homeAbbr} size="xs" />
                    <span>{g.homeAbbr}</span>
                  </span>
                  <span className="font-mono tabular-nums text-slate-400 whitespace-nowrap">
                    {g.isCompleted || g.isLive
                      ? `${g.awayScore}-${g.homeScore}`
                      : g.statusText}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Discreet Admin Footer Button */}
        <div className="px-4 py-2 border-t border-[#1E293B] bg-[#0B1120]/70 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span>RadarNBA</span>
          <button
            type="button"
            onClick={() => handleNavigateSection('fantasy_espn')}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-orange-400 font-mono transition-colors"
            title="Zona Admin / Privada"
          >
            <Lock className="w-3 h-3" />
            <span>Admin</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-72 max-w-[85vw] bg-[#0F172A] border-r border-[#1E293B] h-[100dvh] max-h-[100dvh] flex flex-col pb-safe">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#1E293B] shrink-0">
              <span className="font-display text-base font-bold text-slate-100">
                RadarNBA
              </span>
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMobileMenuOpen(false)}
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-white active:bg-[#131C2E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-3 py-3 border-b border-[#1E293B] shrink-0">
              <p className="px-1 mb-1.5 text-[11px] font-medium text-slate-400">
                Nivel de detalle
              </p>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                <button
                  type="button"
                  onClick={() => handleChangeExperienceMode('simple')}
                  className={`min-h-[38px] px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    experienceMode === 'simple'
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Modo Sencillo
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeExperienceMode('advanced')}
                  className={`min-h-[38px] px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    experienceMode === 'advanced'
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Modo Avanzado
                </button>
              </div>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigateSection(item.id)}
                    className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:bg-[#131C2E] active:bg-[#182338]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {typeof item.count === 'number' && !loading && (
                      <span
                        className={`font-mono tabular-nums text-xs ${
                          active ? 'text-slate-950/80' : 'text-slate-400'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Mobile Scoreboard Summary inside Drawer */}
            <div className="p-3.5 border-t border-[#1E293B] space-y-2 shrink-0 bg-[#0B1120]/40">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-300">Marcadores recientes</span>
                <span className="font-mono tabular-nums">{scoreboard.length} PJ</span>
              </div>
              {scoreboard.length === 0 ? (
                <p className="text-xs text-slate-500">Sin partidos recientes en agenda.</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {scoreboard.slice(0, 5).map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between text-xs py-1 border-b border-[#1E293B]/60 last:border-b-0"
                    >
                      <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium whitespace-nowrap">
                        <TeamLogo abbr={g.awayAbbr} size="xs" />
                        <span>{g.awayAbbr}</span>
                        <span className="text-slate-500">@</span>
                        <TeamLogo abbr={g.homeAbbr} size="xs" />
                        <span>{g.homeAbbr}</span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {g.isCompleted || g.isLive
                          ? `${g.awayScore}-${g.homeScore}`
                          : g.statusText}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Discreet Admin Footer Button (Mobile Drawer) */}
            <div className="px-3.5 py-1.5 border-t border-[#1E293B] bg-[#0B1120]/90 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span>RadarNBA</span>
              <button
                type="button"
                onClick={() => handleNavigateSection('fantasy_espn')}
                className="min-h-[40px] px-2.5 -mr-1.5 inline-flex items-center gap-1.5 text-slate-400 hover:text-orange-400 active:text-orange-300 font-mono transition-colors"
                title="Zona Admin / Privada"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 lg:pl-64 min-w-0 flex flex-col">
        {/* Strict Single-Row Contextual Top Header (48px on mobile + 56px bottom nav <= 13% viewport cap) */}
        <header className="sticky top-0 z-20 h-12 lg:h-14 bg-[#0B1120]/95 backdrop-blur-md border-b border-[#1E293B] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-6">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
              className="lg:hidden min-w-[44px] min-h-[44px] -ml-1.5 flex items-center justify-center rounded-lg text-slate-300 hover:text-white active:bg-[#131C2E]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                RadarNBA
              </span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-100 truncate text-sm sm:text-base">
                {activeNavMeta.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Quick Mobile Detail Level Switcher */}
            <div
              aria-label="Nivel de detalle"
              title="Nivel de detalle"
              className="flex md:hidden items-center p-0.5 bg-[#131C2E] border border-[#1E293B] rounded-lg"
            >
              <button
                type="button"
                onClick={() => handleChangeExperienceMode('simple')}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  experienceMode === 'simple'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300'
                }`}
              >
                Sencillo
              </button>
              <button
                type="button"
                onClick={() => handleChangeExperienceMode('advanced')}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  experienceMode === 'advanced'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300'
                }`}
              >
                Avanzado
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleCopyShareUrl()}
              aria-label="Copiar enlace directo de esta vista"
              title="Copiar enlace directo de esta vista"
              className={`inline-flex items-center justify-center gap-1.5 min-w-[38px] min-h-[36px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                copiedLink
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-[#131C2E] hover:bg-[#182338] border-[#1E293B] text-slate-300 hover:text-white'
              }`}
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Link2 className="w-3.5 h-3.5 text-orange-400" />
              )}
              <span className="hidden md:inline">
                {copiedLink ? 'Enlace copiado' : 'Enlace'}
              </span>
            </button>

            <button
              type="button"
              disabled={loading || refreshing || milestonesLoading}
              onClick={handleManualRefresh}
              aria-label="Actualizar datos"
              className="inline-flex items-center justify-center gap-2 min-w-[40px] min-h-[36px] sm:min-w-0 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 active:scale-[0.98] disabled:opacity-60 text-slate-950 rounded-lg transition-all whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">
                {refreshing ? 'Actualizando...' : 'Actualizar datos'}
              </span>
            </button>
          </div>
        </header>

        {/* Workspace Body */}
        <main className="flex-1 px-3 sm:px-6 pt-3.5 sm:pt-5 pb-24 lg:pb-6 max-w-[1440px] w-full mx-auto space-y-4 sm:space-y-5">

          {/* Homogeneous Global Parameter & Threshold Strip (shown on rolling-window analytical views) */}
          {activeSection !== 'milestones' &&
            activeSection !== 'glossary' &&
            activeSection !== 'fantasy_espn' &&
            activeSection !== 'duel' &&
            activeSection !== 'gameday' && (
            <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-2.5 sm:p-3.5 space-y-2.5 sm:space-y-3">
              {/* Mobile Compact Quick Bar (< md) */}
              <div className="flex md:hidden items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg shrink-0">
                  {([3, 5, 10] as WindowSize[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() =>
                        setSettings((prev) => ({ ...prev, windowSize: w }))
                      }
                      className={`min-h-[34px] px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        settings.windowSize === w
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-300'
                      }`}
                    >
                      {w}PJ
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setOnlyWatchlist((prev) => !prev)}
                    aria-label="Filtrar solo favoritos"
                    className={`min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      onlyWatchlist
                        ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                        : 'bg-[#0B1120] border-[#1E293B] text-slate-300'
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        onlyWatchlist ? 'fill-orange-400 text-orange-400' : ''
                      }`}
                    />
                    <span className="font-mono tabular-nums">{watchlistIds.size}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen((prev) => !prev)}
                    className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      mobileFiltersOpen || activePreset === 'custom'
                        ? 'bg-[#182338] border-orange-500/40 text-orange-300'
                        : 'bg-[#0B1120] border-[#1E293B] text-slate-200'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400" />
                    <span>Filtros</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                        mobileFiltersOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Full Controls (Always visible on md+, collapsible on mobile) */}
              <div
                className={`${
                  mobileFiltersOpen ? 'block pt-2 border-t border-[#1E293B]' : 'hidden'
                } md:block md:pt-0 md:border-t-0 space-y-3`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Season Dataset Selector */}
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {experienceMode === 'simple' ? 'Temporada:' : 'Muestra temporal:'}
                    </span>
                    <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
                      {(
                        [
                          {
                            id: 'continuous',
                            label:
                              experienceMode === 'simple'
                                ? 'Actual + Pasada'
                                : 'Continuo (26-27 + 25-26)',
                          },
                          { id: '2027', label: 'Solo 2026-27' },
                          { id: '2026', label: '2025-26 Completa' },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSeasonMode(m.id)}
                          className={`min-h-[32px] sm:min-h-0 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                            seasonMode === m.id
                              ? 'bg-[#1E293B] text-orange-400 font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Window Size + Watchlist Filter (Desktop/Tablet) */}
                  <div className="hidden md:flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                      {([3, 5, 10] as WindowSize[]).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() =>
                            setSettings((prev) => ({ ...prev, windowSize: w }))
                          }
                          className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                            settings.windowSize === w
                              ? 'bg-orange-500 text-slate-950 font-semibold'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          Últ. {w} PJ
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setOnlyWatchlist((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
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

                {/* Row B: 3 One-Click Sensitivity Presets + "Personalizar filtros" Toggle */}
                <div className="pt-2.5 border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      Sensibilidad de alertas:
                    </span>
                    <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
                      {(['broad', 'balanced', 'blockbusters'] as const).map((presetKey) => {
                        const preset = FILTER_PRESETS[presetKey];
                        const isActive = activePreset === presetKey;
                        return (
                          <button
                            key={presetKey}
                            type="button"
                            title={preset.shortHint}
                            onClick={() =>
                              setSettings((prev) => ({
                                ...prev,
                                ...preset.values,
                              }))
                            }
                            className={`min-h-[32px] sm:min-h-0 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                              isActive
                                ? 'bg-orange-500 text-slate-950 font-semibold'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    {activePreset !== 'custom' ? (
                      <span className="text-xs text-slate-400 hidden xl:inline">
                        · {FILTER_PRESETS[activePreset].shortHint}
                      </span>
                    ) : (
                      <span className="text-xs text-orange-300">
                        · Ajuste manual activo
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between w-full sm:w-auto gap-2">
                    <button
                      type="button"
                      onClick={() => setShowThresholdBar((prev) => !prev)}
                      className={`min-h-[36px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        showThresholdBar
                          ? 'bg-[#182338] border-[#283548] text-orange-300'
                          : 'bg-[#0B1120] hover:bg-[#182338] border-[#1E293B] text-slate-300'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400" />
                      <span>
                        {showThresholdBar ? 'Ocultar ajustes finos' : 'Personalizar filtros'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleNavigateSection('glossary')}
                      className="md:hidden text-xs font-medium text-orange-400 whitespace-nowrap"
                    >
                      Guía (i) →
                    </button>
                  </div>
                </div>

                {/* Row C: 4 Sliders Renamed to Everyday Spanish */}
                {showThresholdBar && (
                  <div className="pt-3 border-t border-[#1E293B] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div>
                    <div className="flex items-center justify-between text-slate-300 mb-1 gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Nivel de sorpresa respecto a su media</span>
                        <MetricInfoTooltip helpKey="zScore" align="left" />
                      </span>
                      <span className="font-mono tabular-nums text-orange-400 font-semibold shrink-0">
                        {experienceMode === 'simple'
                          ? describeSliderSurpriseLevel(settings.minZScore)
                          : `${describeSliderSurpriseLevel(settings.minZScore)} · ${settings.minZScore.toFixed(1)}σ`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.8}
                      max={2.4}
                      step={0.1}
                      value={settings.minZScore}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          minZScore: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-orange-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-slate-300 mb-1 gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Cambio mínimo en sus números</span>
                        <MetricInfoTooltip helpKey="pctDelta" align="left" />
                      </span>
                      <span className="font-mono tabular-nums text-orange-400 font-semibold shrink-0">
                        {settings.minPctDelta}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={35}
                      step={2}
                      value={settings.minPctDelta}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          minPctDelta: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-orange-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-slate-300 mb-1 gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Minutos mínimos por partido</span>
                        <MetricInfoTooltip helpKey="minMinutesFilter" align="right" />
                      </span>
                      <span className="font-mono tabular-nums text-slate-200 font-semibold shrink-0">
                        ≥ {settings.minMinutes} MIN
                      </span>
                    </div>
                    <input
                      type="range"
                      min={12}
                      max={34}
                      step={2}
                      value={settings.minMinutes}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          minMinutes: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-orange-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-slate-300 mb-1 gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Partidos seguidos en racha</span>
                        <MetricInfoTooltip helpKey="consecutiveStreak" align="right" />
                      </span>
                      <span className="font-mono tabular-nums text-slate-200 font-semibold shrink-0">
                        {settings.minStreakGames}+ PJ
                      </span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={7}
                      step={1}
                      value={settings.minStreakGames}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          minStreakGames: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-orange-500"
                    />
                  </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Error Recovery State */}
          {errorMsg && activeSection !== 'milestones' && activeSection !== 'glossary' && (
            <div className="bg-[#131C2E] border border-rose-500/40 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-rose-300">
                  Incidencia al consultar datos NBA en tiempo real
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{errorMsg}</p>
              </div>
              <button
                type="button"
                onClick={() => void fetchBootstrap(seasonMode, false)}
                className="px-4 py-2 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap shrink-0"
              >
                Reintentar conexión
              </button>
            </div>
          )}

          {activeSection === 'glossary' ? (
            <GlossaryView onNavigateSection={handleNavigateSection} />
          ) : activeSection === 'fantasy_espn' ? (
            !isPrivateUnlocked ? (
              <div className="max-w-md mx-auto mt-12 bg-[#131C2E] border border-[#1E293B] rounded-xl p-6 shadow-2xl space-y-5">
                <div className="space-y-1 text-center">
                  <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/30 rounded-full flex items-center justify-center mx-auto text-orange-400 mb-2">
                    <Shield className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-100">Zona Privada · Administración</h3>
                  <p className="text-xs text-slate-400">
                    Introduce la clave de acceso para desbloquear tu panel privado.
                  </p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (verifyingPasscode || !passcodeAttempt.trim()) return;
                    setVerifyingPasscode(true);
                    setPasscodeErrorMsg(null);
                    void (async () => {
                      const result = await loginAdminWithPasscode(passcodeAttempt.trim());
                      setVerifyingPasscode(false);
                      if (result.ok) {
                        setPasscodeAttempt('');
                        setPasscodeLockedOut(false);
                        setPasscodeErrorMsg(null);
                        setIsPrivateUnlocked(true);
                      } else {
                        setPasscodeLockedOut(Boolean(result.lockedOut));
                        setPasscodeErrorMsg(
                          result.error || 'Clave incorrecta. Inténtalo de nuevo.'
                        );
                      }
                    })();
                  }}
                  className="space-y-4"
                >
                  <div>
                    <input
                      type="password"
                      placeholder="Clave de acceso"
                      disabled={verifyingPasscode}
                      value={passcodeAttempt}
                      onChange={(e) => {
                        setPasscodeAttempt(e.target.value);
                        if (passcodeErrorMsg && !passcodeLockedOut) {
                          setPasscodeErrorMsg(null);
                        }
                      }}
                      className="w-full px-3.5 py-2 bg-[#0B1120] border border-[#1E293B] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-orange-500 disabled:opacity-60"
                      autoFocus
                    />
                    {passcodeErrorMsg && (
                      <p
                        className={`mt-2 text-xs leading-relaxed ${
                          passcodeLockedOut
                            ? 'p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium'
                            : 'text-rose-400'
                        }`}
                      >
                        {passcodeErrorMsg}
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={verifyingPasscode || !passcodeAttempt.trim()}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-60 font-semibold text-slate-950 text-xs rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                  >
                    {verifyingPasscode && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>
                      {verifyingPasscode ? 'Verificando acceso...' : 'Desbloquear Zona Privada'}
                    </span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Admin Top-Level Section Switcher */}
                <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-orange-400 px-2">
                      Zona Privada Admin:
                    </span>
                    <div className="inline-flex items-center gap-1 bg-[#0B1120] border border-[#1E293B] p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setAdminZoneSection('fantasy')}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
                          adminZoneSection === 'fantasy'
                            ? 'bg-orange-500 text-slate-950 shadow-sm'
                            : 'text-slate-300 hover:text-white hover:bg-[#1E293B]'
                        }`}
                      >
                        <Trophy className="w-3.5 h-3.5 shrink-0" />
                        <span>Zona Fantasy y Asistente</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminZoneSection('web_config')}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
                          adminZoneSection === 'web_config'
                            ? 'bg-orange-500 text-slate-950 shadow-sm'
                            : 'text-slate-300 hover:text-white hover:bg-[#1E293B]'
                        }`}
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                        <span>Configuración de la Web</span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPrivateUnlocked(false);
                      setPasscodeAttempt('');
                      void logoutAdminSession();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B1120] hover:bg-rose-500/10 border border-[#1E293B] hover:border-rose-500/40 text-rose-400 text-xs font-medium rounded-lg transition-colors"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Bloquear sesión</span>
                  </button>
                </div>

                {/* Active Section Content */}
                {adminZoneSection === 'fantasy' ? (
                  <FantasyEspnAssistantView
                    players={players}
                    teams={teams}
                    onInspectEntity={handleInspectEntity}
                    initialTab={fantasyTab}
                    onTabChange={handleFantasyTabChange}
                  />
                ) : (
                  <AdminSecurityConfigPanel
                    onLockSession={() => {
                      setIsPrivateUnlocked(false);
                      setPasscodeAttempt('');
                      void logoutAdminSession();
                    }}
                  />
                )}
              </div>
            )
          ) : activeSection === 'gameday' ? (
            <GameDayAnalyzerView
              experienceMode={experienceMode}
              watchlistIds={watchlistIds}
              onToggleWatchlist={handleToggleWatchlist}
              onInspectEntity={handleInspectEntity}
              externalRefreshCounter={gamedayRefreshCounter}
              selectedDateParam={gamedayDateParam}
              onChangeDateParam={handleGamedayDateChange}
              selectedReportEventIdProp={gamedayReportId}
              onChangeReportEventId={handleGamedayReportChange}
            />
          ) : activeSection === 'milestones' ? (
            <SeasonMilestonesView
              data={milestonesData}
              loading={milestonesLoading && !milestonesData}
              errorMsg={milestonesError}
              experienceMode={experienceMode}
              onSwitchToAdvanced={() => handleChangeExperienceMode('advanced')}
              onRetry={() => void fetchMilestones(false)}
              onInspectEntity={handleInspectEntity}
            />
          ) : loading ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="p-4 space-y-2 animate-pulse">
                    <div className="h-3 w-28 bg-[#1E293B] rounded" />
                    <div className="h-7 w-16 bg-[#1E293B] rounded" />
                    <div className="h-3 w-36 bg-[#1E293B] rounded" />
                  </div>
                ))}
              </div>
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden divide-y divide-[#1E293B]">
                {Array.from({ length: 9 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-11 px-4 flex items-center justify-between gap-4 animate-pulse"
                  >
                    <div className="h-3.5 w-44 bg-[#1E293B] rounded" />
                    <div className="h-3.5 w-28 bg-[#1E293B] rounded" />
                    <div className="h-3.5 w-16 bg-[#1E293B] rounded" />
                    <div className="h-3.5 w-52 bg-[#1E293B] rounded hidden md:block" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {activeSection === 'home' && (
                <GuidedHomeView
                  players={players}
                  teams={teams}
                  anomalies={anomalies}
                  streaks={streaks}
                  benchmarks={benchmarks}
                  windowSize={settings.windowSize}
                  experienceMode={experienceMode}
                  watchlistIds={watchlistIds}
                  onlyWatchlist={onlyWatchlist}
                  onToggleWatchlist={handleToggleWatchlist}
                  onInspectEntity={handleInspectEntity}
                  onNavigateSection={handleNavigateSection}
                />
              )}

              {activeSection === 'anomalies' && (
                <AnomalyRadarView
                  signals={anomalies}
                  benchmarks={benchmarks}
                  experienceMode={experienceMode}
                  watchlistIds={watchlistIds}
                  onlyWatchlist={onlyWatchlist}
                  onToggleWatchlist={handleToggleWatchlist}
                  onInspectEntity={handleInspectEntity}
                  onResetThresholds={() => {
                    setSettings(DEFAULT_THRESHOLDS);
                    setOnlyWatchlist(false);
                  }}
                  windowSize={settings.windowSize}
                />
              )}

              {activeSection === 'streaks' && (
                <StreaksConsistencyView
                  players={players}
                  streaks={streaks}
                  consistencyRows={consistencyRows}
                  experienceMode={experienceMode}
                  watchlistIds={watchlistIds}
                  onlyWatchlist={onlyWatchlist}
                  onToggleWatchlist={handleToggleWatchlist}
                  onInspectEntity={handleInspectEntity}
                  minStreakGames={settings.minStreakGames}
                  allPlayersLoaded={allPlayersLoaded}
                  loadingAllPlayers={loadingAllPlayers}
                  totalLeaguePlayersAvailable={totalLeaguePlayersAvailable}
                  onLoadAllPlayers={handleLoadAllPlayers}
                />
              )}

              {activeSection === 'duel' && (
                <HeadToHeadBattleView
                  players={players}
                  experienceMode={experienceMode}
                  benchmarks={benchmarks}
                  seasonMode={seasonMode}
                  onChangeSeasonMode={setSeasonMode}
                  windowSize={settings.windowSize}
                  onChangeWindowSize={(w) =>
                    setSettings((prev) => ({ ...prev, windowSize: w }))
                  }
                  watchlistIds={watchlistIds}
                  onToggleWatchlist={handleToggleWatchlist}
                  onInspectEntity={handleInspectEntity}
                  onAddExternalPlayer={handleAddPlayerForComparator}
                  onSwitchToAdvanced={() => handleChangeExperienceMode('advanced')}
                  initialPlayerAId={duelTarget.playerAId}
                  initialPlayerBId={duelTarget.playerBId}
                  onPairChange={handleDuelPairChange}
                  allPlayersLoaded={allPlayersLoaded}
                  loadingAllPlayers={loadingAllPlayers}
                  totalLeaguePlayersAvailable={totalLeaguePlayersAvailable}
                  onLoadAllPlayers={handleLoadAllPlayers}
                />
              )}

              {activeSection === 'comparator' && (
                <RangeComparatorView
                  players={players}
                  teams={teams}
                  experienceMode={experienceMode}
                  benchmarks={benchmarks}
                  onSwitchToAdvanced={() => handleChangeExperienceMode('advanced')}
                  initialEntityType={comparatorTarget.type}
                  initialEntityId={comparatorTarget.id}
                  onSelectionChange={handleComparatorSelectionChange}
                  onInspectEntity={handleInspectEntity}
                  onAddExternalPlayer={handleAddPlayerForComparator}
                />
              )}

              {activeSection === 'teams' && (
                <TeamsExplorerView
                  teams={teams}
                  experienceMode={experienceMode}
                  benchmarks={benchmarks}
                  onSwitchToAdvanced={() => handleChangeExperienceMode('advanced')}
                  windowSize={settings.windowSize}
                  watchlistIds={watchlistIds}
                  onlyWatchlist={onlyWatchlist}
                  onToggleWatchlist={handleToggleWatchlist}
                  onInspectEntity={handleInspectEntity}
                />
              )}

              {activeSection === 'players' && (
                <PlayersExplorerView
                  players={players}
                  experienceMode={experienceMode}
                  benchmarks={benchmarks}
                  onSwitchToAdvanced={() => handleChangeExperienceMode('advanced')}
                  totalLeaguePlayersAvailable={totalLeaguePlayersAvailable}
                  allPlayersLoaded={allPlayersLoaded}
                  loadingAllPlayers={loadingAllPlayers}
                  onLoadAllPlayers={handleLoadAllPlayers}
                  windowSize={settings.windowSize}
                  watchlistIds={watchlistIds}
                  onlyWatchlist={onlyWatchlist}
                  onToggleWatchlist={handleToggleWatchlist}
                  onInspectEntity={handleInspectEntity}
                  onAddExternalPlayer={handleAddExternalPlayer}
                  addingPlayerId={addingPlayerId}
                />
              )}
            </>
          )}

          {/* Discreet Workspace Page Footer (accessible on mobile & desktop) */}
          <footer className="pt-4 mt-6 border-t border-[#1E293B]/70 flex items-center justify-between text-xs text-slate-500">
            <span>RadarNBA · Analítica y Scouting</span>
            <button
              type="button"
              onClick={() => handleNavigateSection('fantasy_espn')}
              className="min-h-[40px] px-2.5 -mr-2 inline-flex items-center gap-1.5 text-slate-500 hover:text-orange-400 active:text-orange-300 font-mono text-xs transition-colors"
              title="Zona Privada Admin"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Admin</span>
            </button>
          </footer>
        </main>
      </div>

      {/* Thumb-Friendly Mobile Bottom Tab Bar (56px height; total sticky <= 13% mobile viewport) */}
      <nav
        aria-label="Navegación principal móvil"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0F172A]/95 backdrop-blur-md border-t border-[#1E293B] pb-safe"
      >
        <div className="grid grid-cols-5 items-center h-14 px-1">
          {(
            [
              { id: 'home', label: 'Inicio', icon: Compass },
              { id: 'gameday', label: 'Jornadas', icon: CalendarDays },
              { id: 'anomalies', label: 'Anomalías', icon: Activity },
              { id: 'players', label: 'Jugadores', icon: Users },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id && !mobileMenuOpen;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleNavigateSection(tab.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'text-orange-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 active:text-white'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-[10px] tracking-tight leading-none">
                  {tab.label}
                </span>
              </button>
            );
          })}

          {(() => {
            const isSecondaryActive =
              mobileMenuOpen ||
              activeSection === 'streaks' ||
              activeSection === 'duel' ||
              activeSection === 'comparator' ||
              activeSection === 'milestones' ||
              activeSection === 'teams' ||
              activeSection === 'fantasy_espn' ||
              activeSection === 'glossary';
            return (
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors whitespace-nowrap ${
                  isSecondaryActive
                    ? 'text-orange-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 active:text-white'
                }`}
              >
                <LayoutGrid className="w-5 h-5 shrink-0" />
                <span className="text-[10px] tracking-tight leading-none">
                  Más vistas
                </span>
              </button>
            );
          })()}
        </div>
      </nav>

      {/* Unified Side Inspector Drawer / Mobile Bottom Sheet */}
      <EntityInspectorDrawer
        entityType={inspected.type}
        entityId={inspected.id}
        players={players}
        teams={teams}
        experienceMode={experienceMode}
        benchmarks={benchmarks}
        onSwitchToAdvanced={() => handleChangeExperienceMode('advanced')}
        windowSize={settings.windowSize}
        watchlistIds={watchlistIds}
        onToggleWatchlist={handleToggleWatchlist}
        onClose={handleCloseInspector}
        onOpenInComparator={handleOpenInComparator}
        onSelectRosterPlayer={handleAddExternalPlayer}
      />
    </div>
  );
}
