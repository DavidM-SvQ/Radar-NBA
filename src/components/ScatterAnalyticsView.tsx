import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutGrid,
  Search,
  Users,
  RotateCcw,
  TrendingUp,
  Filter,
  Shield,
  Activity,
  Layers,
  Sparkles,
  BarChart2,
  X,
  ExternalLink,
  Loader2,
  ArrowLeftRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type {
  ExperienceMode,
  NbaAdvancedCategory,
  NbaHeroicShotCountSummary,
  PlayerSummary,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import {
  mean,
  normalizeSearchText,
  round1,
  stdDev,
} from '../utils/analytics';
import { NBA_TEAMS_MAP } from '../utils/teamLogos';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import { buildTableSnapshotBlob } from '../utils/exportImageCard';
import { fetchSharedHeroicShots } from '../utils/heroicShotsClient';
import { type LeagueBenchmarks } from '../utils/humanize';
import { extractUnifiedFilterOptions } from '../utils/entityFilters';
import {
  GaussianDistributionChart,
  formatSignedZ,
  getSigmaZoneTextClass,
  type GaussianEntityPoint,
} from './GaussianDistributionChart';
import {
  findScatterMetric,
  formatScatterMetricValue,
  getGroupedScatterMetrics,
  getScatterMetricsForScope,
  resolvePlayerScatterMetricValue,
  resolveTeamScatterMetricValue,
  type PlayerWithSnapshot,
  type TeamWithSnapshot,
} from '../utils/scatterMetricsCatalog';
import {
  TEAM_PRESETS,
  PLAYER_PRESETS,
  PRESET_THEMES,
  TEAM_CORRELATION_PACKS,
  PLAYER_CORRELATION_PACKS,
  interpretPearsonCorrelation,
  type PresetThemeId,
  type CorrelationPackId,
} from '../utils/scatterPresets';

export { TEAM_PRESETS };

function isPlayerRookie(p: PlayerSummary): boolean {
  if (typeof p.fromYear === 'number' && p.fromYear > 0) {
    return p.fromYear >= 2026;
  }
  if (typeof p.experienceYears === 'number' && p.experienceYears >= 0) {
    return p.experienceYears === 0;
  }
  return false;
}

const TEAM_TO_DIV: Record<string, string> = {
  BOS: 'Atlantic', BKN: 'Atlantic', NYK: 'Atlantic', PHI: 'Atlantic', TOR: 'Atlantic',
  CHI: 'Central', CLE: 'Central', DET: 'Central', IND: 'Central', MIL: 'Central',
  ATL: 'Southeast', CHA: 'Southeast', MIA: 'Southeast', ORL: 'Southeast', WAS: 'Southeast',
  DEN: 'Northwest', MIN: 'Northwest', OKC: 'Northwest', POR: 'Northwest', UTA: 'Northwest',
  GSW: 'Pacific', LAC: 'Pacific', LAL: 'Pacific', PHX: 'Pacific', SAC: 'Pacific',
  DAL: 'Southwest', HOU: 'Southwest', MEM: 'Southwest', NOP: 'Southwest', SAS: 'Southwest',
};

const DIVISIONS = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'];

function getTeamScatterLogoUrl(abbr: string): string {
  const cleanAbbr = (abbr || 'NBA').toUpperCase().trim();
  const meta = NBA_TEAMS_MAP[cleanAbbr];
  if (meta?.espnSlug) {
    return `https://a.espncdn.com/i/teamlogos/nba/500/${meta.espnSlug}.png`;
  }
  return `https://a.espncdn.com/i/teamlogos/nba/500/${cleanAbbr.toLowerCase()}.png`;
}

interface EnrichedTeamMetricData {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  conference: 'Este' | 'Oeste';
  division: string;
  wins: number;
  losses: number;
  winPct: number;
  streakCode: string;
  stats: Record<string, number | null>;
}

const SCATTER_ADVANCED_CATEGORIES: NbaAdvancedCategory[] = [
  'four_factors',
  'scoring',
  'zones',
  'tracking',
  'defense_hustle',
  'clutch',
  'playtypes',
  'violations',
];

interface ScatterAnalyticsViewProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
  currentSeasonPlayers?: PlayerSummary[];
  currentSeasonTeams?: TeamSummary[];
  seasonToken?: string;
  benchmarks: LeagueBenchmarks;
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onToggleWatchlist: (key: string) => void;
  onInspectEntity: (type: 'player' | 'team', id: string) => void;
  windowSize: WindowSize;
}

// Pearson correlation helper (exact 2 decimal places)
function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3 || y.length !== n) return 0;
  const meanX = mean(x);
  const meanY = mean(y);

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return Math.round((num / den) * 100) / 100;
}

function roundToMetricDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, Math.max(0, decimals));
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

const ADV_SNAPSHOT_FETCH_VERSION = '20261119b';

function renderMeanReferenceLabel(
  axis: 'x' | 'y',
  text: string,
  color: string,
  textColor: string
) {
  return (props: any) => {
    const vb = props?.viewBox;
    if (!vb || typeof vb.x !== 'number' || typeof vb.y !== 'number') return null;
    const pillW = Math.max(102, Math.round(text.length * 6.05 + 14));
    const pillH = 18;
    if (axis === 'x') {
      const pillX = Math.max(52, vb.x - pillW / 2);
      const pillY = vb.y + 4;
      return (
        <g pointerEvents="none">
          <rect
            x={pillX}
            y={pillY}
            width={pillW}
            height={pillH}
            rx={4}
            fill="#0B1120"
            fillOpacity={0.92}
            stroke={color}
            strokeOpacity={0.8}
            strokeWidth={1}
          />
          <text
            x={pillX + pillW / 2}
            y={pillY + 12.5}
            textAnchor="middle"
            fill={textColor}
            fontSize={10}
            fontWeight={700}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {text}
          </text>
        </g>
      );
    }
    const rightEdge = vb.x + (typeof vb.width === 'number' ? vb.width : 0);
    const pillX = Math.max(vb.x + 6, rightEdge - pillW - 6);
    const pillY = Math.max(28, vb.y - pillH - 3);
    return (
      <g pointerEvents="none">
        <rect
          x={pillX}
          y={pillY}
          width={pillW}
          height={pillH}
          rx={4}
          fill="#0B1120"
          fillOpacity={0.92}
          stroke={color}
          strokeOpacity={0.8}
          strokeWidth={1}
        />
        <text
          x={pillX + pillW / 2}
          y={pillY + 12.5}
          textAnchor="middle"
          fill={textColor}
          fontSize={10}
          fontWeight={700}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {text}
        </text>
      </g>
    );
  };
}

/**
 * Reusable Metric Info Tooltip (i)
 */
function MetricInfoButton({
  title,
  desc,
  interpretation,
  unit,
  lowerIsBetter,
  align = 'center',
  placement = 'bottom',
}: {
  title: string;
  desc: string;
  interpretation?: string;
  unit?: string;
  lowerIsBetter?: boolean;
  align?: 'left' | 'right' | 'center';
  placement?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);

  const alignClasses =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2';

  const placementClasses =
    placement === 'top'
      ? 'bottom-full mb-2'
      : 'top-full mt-2';

  return (
    <div className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-4 h-4 rounded-full bg-slate-800 hover:bg-orange-500/20 text-slate-400 hover:text-orange-400 border border-slate-700/80 hover:border-orange-500/40 inline-flex items-center justify-center transition-colors text-[10px] font-bold"
        aria-label={`Información sobre ${title}`}
      >
        i
      </button>

      {open && (
        <div
          className={`absolute z-50 ${alignClasses} ${placementClasses} w-72 max-w-[min(288px,calc(100vw-36px))] p-3 bg-[#0B1120] border border-orange-500/60 rounded-lg shadow-2xl text-left pointer-events-none animate-in fade-in zoom-in-95 duration-150`}
          style={{ filter: 'drop-shadow(0 15px 25px rgba(0,0,0,0.75))' }}
        >
          <div className="flex items-center justify-between gap-1 border-b border-[#1E293B] pb-1.5 mb-1.5">
            <span className="font-bold text-xs text-orange-300 truncate">{title}</span>
            {unit && <span className="text-[10px] font-mono text-slate-400">Unidad: {unit}</span>}
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">{desc}</p>
          {interpretation && (
            <div className={`mt-2 p-1.5 rounded text-[10px] leading-snug border ${
              lowerIsBetter
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
            }`}>
              {interpretation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ScatterAnalyticsView({
  players,
  teams,
  currentSeasonPlayers,
  currentSeasonTeams,
  seasonToken = '2027',
  onInspectEntity,
}: ScatterAnalyticsViewProps) {
  // Main view segment: 'teams' | 'players' | 'correlation'
  const [activeTab, setActiveTab] = useState<'teams' | 'players' | 'correlation'>('teams');

  // Snapshot advanced data caches (key = `${seasonToken}:${category}`)
  const [teamAdvCache, setTeamAdvCache] = useState<Record<string, Record<string, any>>>({});
  const [playerAdvCache, setPlayerAdvCache] = useState<Record<string, Record<string, any>>>({});
  const [heroicCache, setHeroicCache] = useState<
    Record<
      string,
      {
        playerCounts: Record<string, NbaHeroicShotCountSummary>;
        teamCounts: Record<string, NbaHeroicShotCountSummary>;
      }
    >
  >({});
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const inFlightKeysRef = useRef<Set<string>>(new Set());

  // Teams view state
  const [teamChartMode, setTeamChartMode] = useState<'scatter' | 'gaussian'>('scatter');
  const [teamPresetId, setTeamPresetId] = useState<string>('contenders');
  const [teamPresetTheme, setTeamPresetTheme] = useState<PresetThemeId>('all');
  const [teamMetricXId, setTeamMetricXId] = useState<string>('offRtg');
  const [teamMetricYId, setTeamMetricYId] = useState<string>('defRtg');
  const [teamMetricSizeId, setTeamMetricSizeId] = useState<string>('winPct');
  const [teamConfFilter, setTeamConfFilter] = useState<'all' | 'Este' | 'Oeste'>('all');
  const [teamDivFilter, setTeamDivFilter] = useState<string>('all');
  const [teamQuery, setTeamQuery] = useState('');
  const [teamMeanScope, setTeamMeanScope] = useState<'league' | 'filtered'>('league');

  // Players view state
  const [playerChartMode, setPlayerChartMode] = useState<'scatter' | 'gaussian'>('scatter');
  const [playerPresetId, setPlayerPresetId] = useState<string>('usage_efficiency');
  const [playerPresetTheme, setPlayerPresetTheme] = useState<PresetThemeId>('all');
  const [playerMetricXId, setPlayerMetricXId] = useState<string>('usgEst');
  const [playerMetricYId, setPlayerMetricYId] = useState<string>('tsPct');
  const [playerMetricSizeId, setPlayerMetricSizeId] = useState<string>('points');
  const [playerPosFilter, setPlayerPosFilter] = useState<'all' | 'G' | 'F' | 'C'>('all');
  const [playerConfFilter, setPlayerConfFilter] = useState<'all' | 'East' | 'West'>('all');
  const [playerDivFilter, setPlayerDivFilter] = useState<string>('all');
  const [playerTeamFilter, setPlayerTeamFilter] = useState<string>('all');
  const [playerCountryFilter, setPlayerCountryFilter] = useState<string>('all');
  const [playerBirthYearFilter, setPlayerBirthYearFilter] = useState<string>('all');
  const [onlyRookies, setOnlyRookies] = useState<boolean>(false);
  const [playerQuery, setPlayerQuery] = useState('');
  const { recommendedMinGames, avgTeamGp, maxObservedGames } = useMemo(() => {
    const teamGps = teams
      .map((t) => {
        const wl = (Number(t.wins) || 0) + (Number(t.losses) || 0);
        return wl > 0 ? wl : Array.isArray(t.games) ? t.games.length : 0;
      })
      .filter((n) => n > 0);
    const playerMaxGp = players.reduce((mx, p) => Math.max(mx, p.games.length), 0);
    const avgGp =
      teamGps.length > 0
        ? teamGps.reduce((a, b) => a + b, 0) / teamGps.length
        : playerMaxGp;
    const maxGp = Math.max(82, teamGps.length > 0 ? Math.max(...teamGps) : 0, playerMaxGp);
    const rec = avgGp > 0 ? Math.max(1, Math.round(avgGp * 0.6)) : 1;
    return {
      recommendedMinGames: rec,
      avgTeamGp: avgGp,
      maxObservedGames: maxGp,
    };
  }, [teams, players]);

  const [minGames, setMinGames] = useState<number>(() => recommendedMinGames);
  const [hasCustomMinGames, setHasCustomMinGames] = useState(false);

  useEffect(() => {
    if (!hasCustomMinGames) {
      setMinGames(recommendedMinGames);
    }
  }, [recommendedMinGames, hasCustomMinGames]);

  const [minMpg, setMinMpg] = useState(20);
  const [playerMeanScope, setPlayerMeanScope] = useState<'league' | 'filtered'>('league');

  // Correlation matrix view state
  const [corrScope, setCorrScope] = useState<'teams' | 'players'>('teams');
  const [corrPackId, setCorrPackId] = useState<CorrelationPackId>('overview');
  const [corrTargetMetricId, setCorrTargetMetricId] = useState<string>('winPct');

  // Hover & selection states for tooltips and bubble mark/unmark
  const [hoveredEntity, setHoveredEntity] = useState<any>(null);
  const [hoveredGaussianId, setHoveredGaussianId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);

  // Grouped 10-layer catalogs for dropdown <optgroup>
  const groupedTeamMetrics = useMemo(() => getGroupedScatterMetrics('team'), []);
  const groupedPlayerMetrics = useMemo(() => getGroupedScatterMetrics('player'), []);
  const teamCatalogMetrics = useMemo(() => getScatterMetricsForScope('team'), []);
  const playerCatalogMetrics = useMemo(() => getScatterMetricsForScope('player'), []);

  // Fetch Heroic Shots (BB / GW) for active seasonToken via shared deduplicated client cache
  useEffect(() => {
    if (heroicCache[seasonToken]) return;
    const reqKey = `heroic:${seasonToken}`;
    if (inFlightKeysRef.current.has(reqKey)) return;
    inFlightKeysRef.current.add(reqKey);

    let cancelled = false;
    fetchSharedHeroicShots(seasonToken)
      .then((json) => {
        if (cancelled || !json) return;
        setHeroicCache((prev) => ({
          ...prev,
          [seasonToken]: {
            playerCounts: json.playerCounts || {},
            teamCounts: json.teamCounts || {},
          },
        }));
      })
      .catch(() => {
        // Ignore transient failure
      })
      .finally(() => {
        inFlightKeysRef.current.delete(reqKey);
      });

    return () => {
      cancelled = true;
    };
  }, [seasonToken, heroicCache]);

  // Fetch all 8 NBA.com snapshot categories for the active entity scope (instantaneous from server gzip cache)
  useEffect(() => {
    const scope: 'teams' | 'players' =
      activeTab === 'players' || (activeTab === 'correlation' && corrScope === 'players')
        ? 'players'
        : 'teams';
    const currentCache = scope === 'players' ? playerAdvCache : teamAdvCache;
    const missingCats = SCATTER_ADVANCED_CATEGORIES.filter(
      (cat) => !currentCache[`${seasonToken}:${cat}`]
    );
    if (missingCats.length === 0) return;

    const catsToFetch = missingCats.filter(
      (cat) => !inFlightKeysRef.current.has(`${scope}:${seasonToken}:${cat}`)
    );
    if (catsToFetch.length === 0) return;

    for (const cat of catsToFetch) {
      inFlightKeysRef.current.add(`${scope}:${seasonToken}:${cat}`);
    }

    let cancelled = false;
    setLoadingSnapshot(true);

    Promise.all(
      catsToFetch.map(async (cat) => {
        try {
          const res = await fetch(
            `/api/nba/advanced/${scope}?category=${encodeURIComponent(cat)}&season=${encodeURIComponent(seasonToken)}&v=${ADV_SNAPSHOT_FETCH_VERSION}`
          );
          if (!res.ok) return { cat, map: {} as Record<string, any> };
          const json = await res.json();
          const map: Record<string, any> = {};
          const items = Array.isArray(json?.items) ? json.items : [];
          for (const item of items) {
            const id = String(
              item.entityId || (scope === 'players' ? item.playerId : item.teamId) || ''
            );
            const abbr = String(item.teamAbbr || '').toUpperCase();
            if (id) map[id] = item;
            if (scope === 'teams' && abbr) map[`abbr:${abbr}`] = item;
          }
          return { cat, map };
        } catch {
          return { cat, map: {} as Record<string, any> };
        } finally {
          inFlightKeysRef.current.delete(`${scope}:${seasonToken}:${cat}`);
        }
      })
    )
      .then((results) => {
        if (cancelled) return;
        const setter = scope === 'players' ? setPlayerAdvCache : setTeamAdvCache;
        setter((prev) => {
          const next = { ...prev };
          for (const { cat, map } of results) {
            next[`${seasonToken}:${cat}`] = map;
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingSnapshot(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, corrScope, seasonToken, teamAdvCache, playerAdvCache]);

  const leagueTeams2027 = useMemo(() => {
    if (currentSeasonTeams && currentSeasonTeams.length > 0) {
      return currentSeasonTeams;
    }
    return teams;
  }, [currentSeasonTeams, teams]);

  const leaguePlayers2027 = useMemo(() => {
    if (currentSeasonPlayers && currentSeasonPlayers.length > 0) {
      return currentSeasonPlayers;
    }
    const has2027Games = players.some((p) => p.games.some((g) => g.seasonLabel === '2026-27'));
    if (has2027Games) {
      return players
        .map((p) => {
          const games2027 = p.games.filter((g) => g.seasonLabel === '2026-27');
          return games2027.length === p.games.length ? p : { ...p, games: games2027 };
        })
        .filter((p) => p.games.length > 0);
    }
    return players;
  }, [currentSeasonPlayers, players]);

  const playerFilterOptions = useMemo(
    () => extractUnifiedFilterOptions(players, teams),
    [players, teams]
  );

  const availablePlayerDivisions = useMemo(() => {
    if (playerConfFilter === 'East') return ['Atlantic', 'Central', 'Southeast'];
    if (playerConfFilter === 'West') return ['Northwest', 'Pacific', 'Southwest'];
    return DIVISIONS;
  }, [playerConfFilter]);

  const availablePlayerTeams = useMemo(() => {
    return playerFilterOptions.teams.filter((t) => {
      const div = TEAM_TO_DIV[t.abbr];
      if (playerDivFilter !== 'all' && div !== playerDivFilter) return false;
      if (playerConfFilter === 'East' && !['Atlantic', 'Central', 'Southeast'].includes(div)) {
        return false;
      }
      if (playerConfFilter === 'West' && !['Northwest', 'Pacific', 'Southwest'].includes(div)) {
        return false;
      }
      return true;
    });
  }, [playerFilterOptions.teams, playerConfFilter, playerDivFilter]);

  // Helper to attach all 10-layer snapshot objects to a TeamSummary
  const attachTeamSnapshot = (t: TeamSummary, tok: string): TeamWithSnapshot => {
    const lookup = <T,>(map: Record<string, T> | undefined): T | undefined => {
      if (!map) return undefined;
      return map[t.id] || map[`abbr:${String(t.abbreviation || '').toUpperCase()}`];
    };
    const heroicEntry = heroicCache[tok]?.teamCounts;
    const heroicCount = heroicEntry
      ? heroicEntry[t.id] || heroicEntry[String(t.abbreviation || '').toUpperCase()]
      : undefined;

    return {
      ...t,
      advFourFactors: lookup(teamAdvCache[`${tok}:four_factors`]),
      advScoring: lookup(teamAdvCache[`${tok}:scoring`]),
      advZones: lookup(teamAdvCache[`${tok}:zones`]),
      advTracking: lookup(teamAdvCache[`${tok}:tracking`]),
      advDefHustle: lookup(teamAdvCache[`${tok}:defense_hustle`]),
      advClutch: lookup(teamAdvCache[`${tok}:clutch`]),
      advPlaytypes: lookup(teamAdvCache[`${tok}:playtypes`]),
      advViolations: lookup(teamAdvCache[`${tok}:violations`]),
      buzzerBeaters: heroicCount?.buzzerBeaters ?? 0,
      gameWinners: heroicCount?.gameWinners ?? 0,
      heroicLoaded: Boolean(heroicEntry),
    };
  };

  // Helper to attach all 10-layer snapshot objects to a PlayerSummary
  const attachPlayerSnapshot = (p: PlayerSummary, tok: string): PlayerWithSnapshot => {
    const heroicEntry = heroicCache[tok]?.playerCounts;
    const heroicCount = heroicEntry ? heroicEntry[p.id] : undefined;
    return {
      ...p,
      advFourFactors: playerAdvCache[`${tok}:four_factors`]?.[p.id],
      advScoring: playerAdvCache[`${tok}:scoring`]?.[p.id],
      advZones: playerAdvCache[`${tok}:zones`]?.[p.id],
      advTracking: playerAdvCache[`${tok}:tracking`]?.[p.id],
      advDefHustle: playerAdvCache[`${tok}:defense_hustle`]?.[p.id],
      advClutch: playerAdvCache[`${tok}:clutch`]?.[p.id],
      advPlaytypes: playerAdvCache[`${tok}:playtypes`]?.[p.id],
      advViolations: playerAdvCache[`${tok}:violations`]?.[p.id],
      buzzerBeaters: heroicCount?.buzzerBeaters ?? 0,
      gameWinners: heroicCount?.gameWinners ?? 0,
      heroicLoaded: Boolean(heroicEntry),
    };
  };

  // Enriched Teams Data with real official CDN logos, franchise colors & 10-layer snapshot metrics
  const enrichedTeams = useMemo<EnrichedTeamMetricData[]>(() => {
    return teams.map((t) => {
      const tSnap = attachTeamSnapshot(t, seasonToken);
      const division = TEAM_TO_DIV[t.abbreviation] || 'General';
      const conf = t.conference === 'East' || t.conference === 'Este' ? 'Este' : 'Oeste';
      const meta = NBA_TEAMS_MAP[t.abbreviation];
      const logoUrl = t.logoUrl || getTeamScatterLogoUrl(t.abbreviation);
      const primaryColor = meta?.primaryColor || '#F97316';
      const secondaryColor = meta?.secondaryColor || '#FFFFFF';

      const stats: Record<string, number | null> = {};
      teamCatalogMetrics.forEach((def) => {
        stats[def.id] = resolveTeamScatterMetricValue(tSnap, def.id, def.decimals);
      });

      return {
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        abbreviation: t.abbreviation,
        logoUrl,
        primaryColor,
        secondaryColor,
        conference: conf,
        division,
        wins: t.wins,
        losses: t.losses,
        winPct: round1(t.winPct * 100),
        streakCode: t.streakCode,
        stats,
      };
    });
  }, [teams, teamCatalogMetrics, teamAdvCache, heroicCache, seasonToken]);

  // Active Team Metric Objects
  const teamMetricX = useMemo(
    () => findScatterMetric(teamMetricXId, 'team'),
    [teamMetricXId]
  );
  const teamMetricY = useMemo(
    () => findScatterMetric(teamMetricYId, 'team'),
    [teamMetricYId]
  );
  const teamMetricSize = useMemo(
    () => (teamMetricSizeId === 'none' ? null : findScatterMetric(teamMetricSizeId, 'team')),
    [teamMetricSizeId]
  );

  // Filtered Teams for Scatter Plot (with normalized bubble radius)
  const filteredTeams = useMemo(() => {
    const q = normalizeSearchText(teamQuery);
    const matching = enrichedTeams.filter((t) => {
      if (teamConfFilter !== 'all' && t.conference !== teamConfFilter) return false;
      if (teamDivFilter !== 'all' && t.division !== teamDivFilter) return false;
      if (q) {
        const hay = normalizeSearchText(`${t.name} ${t.shortName} ${t.abbreviation}`);
        if (!hay.includes(q)) return false;
      }
      const xVal = t.stats[teamMetricX.id];
      const yVal = t.stats[teamMetricY.id];
      if (xVal === null || xVal === undefined || Number.isNaN(xVal)) return false;
      if (yVal === null || yVal === undefined || Number.isNaN(yVal)) return false;
      return true;
    });

    if (!teamMetricSize || matching.length === 0) {
      return matching.map((t) => ({ ...t, bubbleRadius: 15 }));
    }

    const vals = matching
      .map((t) => t.stats[teamMetricSize.id])
      .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    if (vals.length === 0) {
      return matching.map((t) => ({ ...t, bubbleRadius: 15 }));
    }
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const span = maxVal - minVal;

    return matching.map((t) => {
      const val = t.stats[teamMetricSize.id];
      if (val === null || val === undefined || Number.isNaN(val)) {
        return { ...t, bubbleRadius: 15 };
      }
      const rawNorm = span > 0 ? (val - minVal) / span : 0.5;
      const norm = teamMetricSize.lowerIsBetter ? 1 - rawNorm : rawNorm;
      const bubbleRadius = round1(9 + norm * 16);
      return { ...t, bubbleRadius };
    });
  }, [enrichedTeams, teamConfFilter, teamDivFilter, teamQuery, teamMetricX.id, teamMetricY.id, teamMetricSize]);

  const selectedTeam = useMemo(
    () => filteredTeams.find((t) => t.id === selectedTeamId) || null,
    [filteredTeams, selectedTeamId]
  );

  const hasTeamFilterSelection =
    teamConfFilter !== 'all' || teamDivFilter !== 'all' || teamQuery.trim() !== '';

  const effectiveTeamMeanScope: 'league' | 'filtered' =
    hasTeamFilterSelection && filteredTeams.length > 0 ? teamMeanScope : 'league';

  const leagueMeanToken = teamAdvCache[`2027:four_factors`] ? '2027' : seasonToken;

  const leagueTeamMeanX = useMemo(() => {
    if (leagueTeams2027.length === 0) return 0;
    const vals = leagueTeams2027
      .map((t) =>
        resolveTeamScatterMetricValue(
          attachTeamSnapshot(t, leagueMeanToken),
          teamMetricX.id,
          teamMetricX.decimals
        )
      )
      .filter((v): v is number => v !== null && !Number.isNaN(v));
    return vals.length > 0 ? roundToMetricDecimals(mean(vals), teamMetricX.decimals) : 0;
  }, [leagueTeams2027, teamMetricX, teamAdvCache, heroicCache, leagueMeanToken]);

  const leagueTeamMeanY = useMemo(() => {
    if (leagueTeams2027.length === 0) return 0;
    const vals = leagueTeams2027
      .map((t) =>
        resolveTeamScatterMetricValue(
          attachTeamSnapshot(t, leagueMeanToken),
          teamMetricY.id,
          teamMetricY.decimals
        )
      )
      .filter((v): v is number => v !== null && !Number.isNaN(v));
    return vals.length > 0 ? roundToMetricDecimals(mean(vals), teamMetricY.decimals) : 0;
  }, [leagueTeams2027, teamMetricY, teamAdvCache, heroicCache, leagueMeanToken]);

  const filteredTeamMeanX = useMemo(() => {
    const vals = filteredTeams
      .map((t) => t.stats[teamMetricX.id])
      .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    return vals.length > 0 ? roundToMetricDecimals(mean(vals), teamMetricX.decimals) : 0;
  }, [filteredTeams, teamMetricX.id, teamMetricX.decimals]);

  const filteredTeamMeanY = useMemo(() => {
    const vals = filteredTeams
      .map((t) => t.stats[teamMetricY.id])
      .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    return vals.length > 0 ? roundToMetricDecimals(mean(vals), teamMetricY.decimals) : 0;
  }, [filteredTeams, teamMetricY.id, teamMetricY.decimals]);

  // Active benchmark means for current team axes
  const teamMeanX =
    effectiveTeamMeanScope === 'filtered' ? filteredTeamMeanX : leagueTeamMeanX;
  const teamMeanY =
    effectiveTeamMeanScope === 'filtered' ? filteredTeamMeanY : leagueTeamMeanY;

  // Gaussian Distribution dataset for Teams (single-metric, unaffected by Y metric nulls)
  const gaussianTeams = useMemo(() => {
    const q = normalizeSearchText(teamQuery);
    return enrichedTeams.filter((t) => {
      if (teamConfFilter !== 'all' && t.conference !== teamConfFilter) return false;
      if (teamDivFilter !== 'all' && t.division !== teamDivFilter) return false;
      const val = t.stats[teamMetricX.id];
      return val !== null && val !== undefined && !Number.isNaN(val);
    }).map((t) => {
      const isMatch =
        Boolean(q) &&
        normalizeSearchText(`${t.name} ${t.shortName} ${t.abbreviation}`).includes(q);
      return {
        ...t,
        gaussianValue: t.stats[teamMetricX.id] as number,
        isQueryMatch: isMatch,
      };
    });
  }, [enrichedTeams, teamConfFilter, teamDivFilter, teamQuery, teamMetricX.id]);

  const leagueTeamGaussianValues = useMemo(() => {
    return leagueTeams2027
      .map((t) =>
        resolveTeamScatterMetricValue(
          attachTeamSnapshot(t, leagueMeanToken),
          teamMetricX.id,
          teamMetricX.decimals
        )
      )
      .filter((v): v is number => v !== null && !Number.isNaN(v));
  }, [leagueTeams2027, teamMetricX, teamAdvCache, heroicCache, leagueMeanToken]);

  const teamGaussianReferenceValues = useMemo(() => {
    if (effectiveTeamMeanScope === 'filtered' && gaussianTeams.length >= 3) {
      return gaussianTeams.map((t) => t.gaussianValue);
    }
    return leagueTeamGaussianValues;
  }, [effectiveTeamMeanScope, gaussianTeams, leagueTeamGaussianValues]);

  const teamGaussianSummary = useMemo(() => {
    const ref = teamGaussianReferenceValues.length >= 3
      ? teamGaussianReferenceValues
      : gaussianTeams.map((t) => t.gaussianValue);
    const mu = mean(ref);
    const sigma = Math.max(stdDev(ref), Math.abs(mu) * 0.01, 0.05);
    const sortedRef = [...ref].sort((a, b) => a - b);

    const points: GaussianEntityPoint[] = gaussianTeams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      subtitle: `${t.conference} · ${t.wins}-${t.losses} (${t.winPct}%)`,
      abbreviation: t.abbreviation,
      logoUrl: t.logoUrl,
      primaryColor: t.primaryColor,
      value: t.gaussianValue,
      isHighlighted: t.isQueryMatch,
    }));

    const ranked = gaussianTeams
      .map((t) => {
        const rawZ = (t.gaussianValue - mu) / sigma;
        const perfZ = teamMetricX.lowerIsBetter ? -rawZ : rawZ;
        let worse = 0;
        let eq = 0;
        for (const rv of sortedRef) {
          if (rv === t.gaussianValue) eq++;
          else if (teamMetricX.lowerIsBetter ? rv > t.gaussianValue : rv < t.gaussianValue) worse++;
        }
        const percentile = sortedRef.length > 0
          ? Math.max(1, Math.min(99, Math.round(((worse + 0.5 * eq) / sortedRef.length) * 100)))
          : 50;
        return { team: t, value: t.gaussianValue, perfZ, percentile };
      })
      .sort((a, b) => (teamMetricX.lowerIsBetter ? a.value - b.value : b.value - a.value));

    return { mu, sigma, points, ranked };
  }, [gaussianTeams, teamGaussianReferenceValues, teamMetricX.lowerIsBetter]);

  // Handle Team Preset Select
  const handleSelectTeamPreset = (presetId: string) => {
    setTeamPresetId(presetId);
    const p = TEAM_PRESETS.find((pr) => pr.id === presetId);
    if (p) {
      setTeamMetricXId(p.xMetric);
      setTeamMetricYId(p.yMetric);
      setTeamMetricSizeId(p.sizeMetric);
    }
  };

  // Active Player Metric Objects
  const playerMetricX = useMemo(
    () => findScatterMetric(playerMetricXId, 'player'),
    [playerMetricXId]
  );
  const playerMetricY = useMemo(
    () => findScatterMetric(playerMetricYId, 'player'),
    [playerMetricYId]
  );
  const playerMetricSize = useMemo(
    () =>
      playerMetricSizeId === 'none'
        ? null
        : findScatterMetric(playerMetricSizeId, 'player'),
    [playerMetricSizeId]
  );

  // Filtered Players for Scatter Plot with team colors & normalized bubble radius
  const filteredPlayers = useMemo(() => {
    const q = normalizeSearchText(playerQuery);
    const rows = players
      .filter((p) => {
        if (p.games.length < minGames) return false;
        const avgMin = mean(p.games.map((g) => g.minutes));
        if (avgMin < minMpg) return false;

        if (playerPosFilter !== 'all' && !p.position.toUpperCase().includes(playerPosFilter)) return false;

        const teamInfo = teams.find((t) => t.abbreviation === p.teamAbbr);
        if (playerConfFilter !== 'all') {
          const pConf = teamInfo?.conference === 'Este' || teamInfo?.conference === 'East' ? 'East' : 'West';
          if (pConf !== playerConfFilter) return false;
        }
        if (playerDivFilter !== 'all' && TEAM_TO_DIV[p.teamAbbr] !== playerDivFilter) return false;
        if (playerTeamFilter !== 'all' && p.teamAbbr !== playerTeamFilter) return false;
        if (playerCountryFilter !== 'all' && (p.country || '').trim() !== playerCountryFilter) return false;
        if (playerBirthYearFilter !== 'all' && String(p.birthYear ?? '') !== playerBirthYearFilter) return false;
        if (onlyRookies && !isPlayerRookie(p)) return false;

        if (q) {
          const hay = normalizeSearchText(`${p.name} ${p.teamAbbr}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((p) => {
        const pSnap = attachPlayerSnapshot(p, seasonToken);
        const xVal = resolvePlayerScatterMetricValue(
          pSnap,
          playerMetricX.id,
          playerMetricX.decimals
        );
        const yVal = resolvePlayerScatterMetricValue(
          pSnap,
          playerMetricY.id,
          playerMetricY.decimals
        );
        if (xVal === null || yVal === null || Number.isNaN(xVal) || Number.isNaN(yVal)) {
          return null;
        }
        const sVal = playerMetricSize
          ? resolvePlayerScatterMetricValue(
              pSnap,
              playerMetricSize.id,
              playerMetricSize.decimals
            )
          : null;
        const avgMin = round1(mean(p.games.map((g) => g.minutes)));
        const meta = NBA_TEAMS_MAP[p.teamAbbr?.toUpperCase()];
        const teamPrimaryColor = meta?.primaryColor || '#38BDF8';
        const teamSecondaryColor = meta?.secondaryColor || '#FFFFFF';

        return {
          id: p.id,
          name: p.name,
          teamAbbr: p.teamAbbr,
          position: p.position,
          teamPrimaryColor,
          teamSecondaryColor,
          x: xVal,
          y: yVal,
          size: sVal,
          minAvg: avgMin,
          item: p,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (!playerMetricSize || rows.length === 0) {
      return rows.map((p) => ({ ...p, bubbleRadius: 6 }));
    }

    const vals = rows
      .map((p) => p.size)
      .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    if (vals.length === 0) {
      return rows.map((p) => ({ ...p, bubbleRadius: 6 }));
    }
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const span = maxVal - minVal;

    return rows.map((p) => {
      if (p.size === null || p.size === undefined || Number.isNaN(p.size)) {
        return { ...p, bubbleRadius: 6 };
      }
      const rawNorm = span > 0 ? (p.size - minVal) / span : 0.5;
      const norm = playerMetricSize.lowerIsBetter ? 1 - rawNorm : rawNorm;
      const bubbleRadius = round1(3.5 + norm * 10);
      return { ...p, bubbleRadius };
    });
  }, [
    players,
    teams,
    minGames,
    minMpg,
    playerPosFilter,
    playerConfFilter,
    playerDivFilter,
    playerTeamFilter,
    playerCountryFilter,
    playerBirthYearFilter,
    onlyRookies,
    playerQuery,
    playerMetricX,
    playerMetricY,
    playerMetricSize,
    playerAdvCache,
    heroicCache,
    seasonToken,
  ]);

  const selectedPlayer = useMemo(
    () => filteredPlayers.find((p) => p.id === selectedPlayerId) || null,
    [filteredPlayers, selectedPlayerId]
  );

  const hasPlayerFilterSelection =
    playerPosFilter !== 'all' ||
    playerConfFilter !== 'all' ||
    playerDivFilter !== 'all' ||
    playerTeamFilter !== 'all' ||
    playerCountryFilter !== 'all' ||
    playerBirthYearFilter !== 'all' ||
    onlyRookies ||
    playerQuery.trim() !== '' ||
    minGames !== recommendedMinGames ||
    minMpg !== 20;

  const effectivePlayerMeanScope: 'league' | 'filtered' =
    hasPlayerFilterSelection && filteredPlayers.length > 0 ? playerMeanScope : 'league';

  const leaguePlayerMeanToken = playerAdvCache[`2027:four_factors`] ? '2027' : seasonToken;

  const league2027MinGames = useMemo(() => {
    const teamGps = leagueTeams2027
      .map((t) => {
        const wl = (Number(t.wins) || 0) + (Number(t.losses) || 0);
        return wl > 0 ? wl : Array.isArray(t.games) ? t.games.length : 0;
      })
      .filter((n) => n > 0);
    const avgGp =
      teamGps.length > 0
        ? teamGps.reduce((a, b) => a + b, 0) / teamGps.length
        : leaguePlayers2027.reduce((mx, p) => Math.max(mx, p.games.length), 0);
    return avgGp > 0 ? Math.max(1, Math.round(avgGp * 0.6)) : 1;
  }, [leagueTeams2027, leaguePlayers2027]);

  const leagueQualifiedPlayers2027 = useMemo(() => {
    const computeQualified = (gamesThreshold: number, mpgThreshold: number) =>
      leaguePlayers2027
        .filter((p) => {
          if (p.games.length < gamesThreshold) return false;
          const avgMin = mean(p.games.map((g) => g.minutes));
          return avgMin >= mpgThreshold;
        })
        .map((p) => {
          const pSnap = attachPlayerSnapshot(p, leaguePlayerMeanToken);
          const x = resolvePlayerScatterMetricValue(
            pSnap,
            playerMetricX.id,
            playerMetricX.decimals
          );
          const y = resolvePlayerScatterMetricValue(
            pSnap,
            playerMetricY.id,
            playerMetricY.decimals
          );
          return x !== null && y !== null && !Number.isNaN(x) && !Number.isNaN(y)
            ? { x, y }
            : null;
        })
        .filter((p): p is { x: number; y: number } => p !== null);

    const primary = computeQualified(league2027MinGames, 20);
    if (primary.length >= 15) return primary;
    const secondary = computeQualified(Math.max(1, Math.floor(league2027MinGames * 0.7)), 15);
    if (secondary.length > 0) return secondary;
    return computeQualified(1, 0);
  }, [leaguePlayers2027, league2027MinGames, playerMetricX, playerMetricY, playerAdvCache, heroicCache, leaguePlayerMeanToken]);

  const leaguePlayerMeanX = useMemo(() => {
    if (leagueQualifiedPlayers2027.length === 0) return 0;
    return roundToMetricDecimals(
      mean(leagueQualifiedPlayers2027.map((p) => p.x)),
      playerMetricX.decimals
    );
  }, [leagueQualifiedPlayers2027, playerMetricX.decimals]);

  const leaguePlayerMeanY = useMemo(() => {
    if (leagueQualifiedPlayers2027.length === 0) return 0;
    return roundToMetricDecimals(
      mean(leagueQualifiedPlayers2027.map((p) => p.y)),
      playerMetricY.decimals
    );
  }, [leagueQualifiedPlayers2027, playerMetricY.decimals]);

  const filteredPlayerMeanX = useMemo(() => {
    if (filteredPlayers.length === 0) return 0;
    return roundToMetricDecimals(
      mean(filteredPlayers.map((p) => p.x)),
      playerMetricX.decimals
    );
  }, [filteredPlayers, playerMetricX.decimals]);

  const filteredPlayerMeanY = useMemo(() => {
    if (filteredPlayers.length === 0) return 0;
    return roundToMetricDecimals(
      mean(filteredPlayers.map((p) => p.y)),
      playerMetricY.decimals
    );
  }, [filteredPlayers, playerMetricY.decimals]);

  const playerMeanX =
    effectivePlayerMeanScope === 'filtered' ? filteredPlayerMeanX : leaguePlayerMeanX;
  const playerMeanY =
    effectivePlayerMeanScope === 'filtered' ? filteredPlayerMeanY : leaguePlayerMeanY;

  // Gaussian Distribution dataset for Players (single-metric, unaffected by Y metric nulls)
  const gaussianPlayers = useMemo(() => {
    const q = normalizeSearchText(playerQuery);
    return players
      .filter((p) => {
        if (p.games.length < minGames) return false;
        const avgMin = mean(p.games.map((g) => g.minutes));
        if (avgMin < minMpg) return false;
        if (playerPosFilter !== 'all' && !p.position.toUpperCase().includes(playerPosFilter)) return false;

        const teamInfo = teams.find((t) => t.abbreviation === p.teamAbbr);
        if (playerConfFilter !== 'all') {
          const pConf = teamInfo?.conference === 'Este' || teamInfo?.conference === 'East' ? 'East' : 'West';
          if (pConf !== playerConfFilter) return false;
        }
        if (playerDivFilter !== 'all' && TEAM_TO_DIV[p.teamAbbr] !== playerDivFilter) return false;
        if (playerTeamFilter !== 'all' && p.teamAbbr !== playerTeamFilter) return false;
        if (playerCountryFilter !== 'all' && (p.country || '').trim() !== playerCountryFilter) return false;
        if (playerBirthYearFilter !== 'all' && String(p.birthYear ?? '') !== playerBirthYearFilter) return false;
        if (onlyRookies && !isPlayerRookie(p)) return false;
        return true;
      })
      .map((p) => {
        const pSnap = attachPlayerSnapshot(p, seasonToken);
        const val = resolvePlayerScatterMetricValue(
          pSnap,
          playerMetricX.id,
          playerMetricX.decimals
        );
        if (val === null || Number.isNaN(val)) return null;
        const avgMin = round1(mean(p.games.map((g) => g.minutes)));
        const meta = NBA_TEAMS_MAP[p.teamAbbr?.toUpperCase()];
        const isQueryMatch =
          Boolean(q) && normalizeSearchText(`${p.name} ${p.teamAbbr}`).includes(q);
        return {
          id: p.id,
          name: p.name,
          headshotUrl: p.headshotUrl,
          teamAbbr: p.teamAbbr,
          position: p.position,
          minAvg: avgMin,
          primaryColor: meta?.primaryColor || '#38BDF8',
          value: val,
          isQueryMatch,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [
    players,
    teams,
    minGames,
    minMpg,
    playerPosFilter,
    playerConfFilter,
    playerDivFilter,
    playerTeamFilter,
    playerCountryFilter,
    playerBirthYearFilter,
    onlyRookies,
    playerQuery,
    playerMetricX,
    playerAdvCache,
    heroicCache,
    seasonToken,
  ]);

  const leaguePlayerGaussianValues = useMemo(() => {
    const computeVals = (gamesThreshold: number, mpgThreshold: number) =>
      leaguePlayers2027
        .filter((p) => {
          if (p.games.length < gamesThreshold) return false;
          const avgMin = mean(p.games.map((g) => g.minutes));
          return avgMin >= mpgThreshold;
        })
        .map((p) =>
          resolvePlayerScatterMetricValue(
            attachPlayerSnapshot(p, leaguePlayerMeanToken),
            playerMetricX.id,
            playerMetricX.decimals
          )
        )
        .filter((v): v is number => v !== null && !Number.isNaN(v));

    const primary = computeVals(league2027MinGames, 20);
    if (primary.length >= 15) return primary;
    const secondary = computeVals(Math.max(1, Math.floor(league2027MinGames * 0.7)), 15);
    return secondary.length >= 3 ? secondary : computeVals(1, 0);
  }, [leaguePlayers2027, league2027MinGames, playerMetricX, playerAdvCache, heroicCache, leaguePlayerMeanToken]);

  const playerGaussianReferenceValues = useMemo(() => {
    if (effectivePlayerMeanScope === 'filtered' && gaussianPlayers.length >= 3) {
      return gaussianPlayers.map((p) => p.value);
    }
    return leaguePlayerGaussianValues;
  }, [effectivePlayerMeanScope, gaussianPlayers, leaguePlayerGaussianValues]);

  const playerGaussianSummary = useMemo(() => {
    const ref =
      playerGaussianReferenceValues.length >= 3
        ? playerGaussianReferenceValues
        : gaussianPlayers.map((p) => p.value);
    const mu = mean(ref);
    const sigma = Math.max(stdDev(ref), Math.abs(mu) * 0.01, 0.05);
    const sortedRef = [...ref].sort((a, b) => a - b);

    const points: GaussianEntityPoint[] = gaussianPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      subtitle: `${p.teamAbbr} · ${p.position} · ${p.minAvg} min`,
      teamAbbr: p.teamAbbr,
      primaryColor: p.primaryColor,
      value: p.value,
      isHighlighted: p.isQueryMatch,
    }));

    const ranked = gaussianPlayers
      .map((p) => {
        const rawZ = (p.value - mu) / sigma;
        const perfZ = playerMetricX.lowerIsBetter ? -rawZ : rawZ;
        let worse = 0;
        let eq = 0;
        for (const rv of sortedRef) {
          if (rv === p.value) eq++;
          else if (playerMetricX.lowerIsBetter ? rv > p.value : rv < p.value) worse++;
        }
        const percentile =
          sortedRef.length > 0
            ? Math.max(
                1,
                Math.min(
                  99,
                  Math.round(((worse + 0.5 * eq) / sortedRef.length) * 100)
                )
              )
            : 50;
        return { player: p, value: p.value, perfZ, percentile };
      })
      .sort((a, b) =>
        playerMetricX.lowerIsBetter ? a.value - b.value : b.value - a.value
      );

    return { mu, sigma, points, ranked };
  }, [gaussianPlayers, playerGaussianReferenceValues, playerMetricX.lowerIsBetter]);

  // Handle Player Preset Select
  const handleSelectPlayerPreset = (presetId: string) => {
    setPlayerPresetId(presetId);
    const p = PLAYER_PRESETS.find((pr) => pr.id === presetId);
    if (p) {
      setPlayerMetricXId(p.xMetric);
      setPlayerMetricYId(p.yMetric);
      setPlayerMetricSizeId(p.sizeMetric);
    }
  };

  const activeTeamPreset = useMemo(
    () => TEAM_PRESETS.find((p) => p.id === teamPresetId) || null,
    [teamPresetId]
  );

  const visibleTeamPresets = useMemo(
    () =>
      teamPresetTheme === 'all'
        ? TEAM_PRESETS
        : TEAM_PRESETS.filter((p) => p.theme === teamPresetTheme),
    [teamPresetTheme]
  );

  const activePlayerPreset = useMemo(
    () => PLAYER_PRESETS.find((p) => p.id === playerPresetId) || null,
    [playerPresetId]
  );

  const visiblePlayerPresets = useMemo(
    () =>
      playerPresetTheme === 'all'
        ? PLAYER_PRESETS
        : PLAYER_PRESETS.filter((p) => p.theme === playerPresetTheme),
    [playerPresetTheme]
  );

  // Live Pearson r for Teams scatter
  const teamLivePearson = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const t of filteredTeams) {
      const vx = t.stats[teamMetricX.id];
      const vy = t.stats[teamMetricY.id];
      if (
        vx !== null &&
        vx !== undefined &&
        vy !== null &&
        vy !== undefined &&
        !Number.isNaN(vx) &&
        !Number.isNaN(vy)
      ) {
        xs.push(vx);
        ys.push(vy);
      }
    }
    const r = calculatePearsonCorrelation(xs, ys);
    return { r, n: xs.length, info: interpretPearsonCorrelation(r, xs.length) };
  }, [filteredTeams, teamMetricX.id, teamMetricY.id]);

  // Live Pearson r for Players scatter
  const playerLivePearson = useMemo(() => {
    const xs = filteredPlayers.map((p) => p.x);
    const ys = filteredPlayers.map((p) => p.y);
    const r = calculatePearsonCorrelation(xs, ys);
    return { r, n: xs.length, info: interpretPearsonCorrelation(r, xs.length) };
  }, [filteredPlayers]);

  // Qualified players snapshot matrix rows (computed on demand when Correlation tab uses Players)
  const correlationPlayersStats = useMemo(() => {
    if (activeTab !== 'correlation' || corrScope !== 'players') return [];
    const neededIds = Array.from(
      new Set([...playerCatalogMetrics.map((m) => m.id), corrTargetMetricId])
    );

    const qualified = players.filter((p) => {
      if (p.games.length < Math.max(5, minGames)) return false;
      const avgMin = mean(p.games.map((g) => g.minutes));
      return avgMin >= Math.max(12, minMpg);
    });
    const sourcePlayers =
      qualified.length >= 15
        ? qualified
        : players.filter((p) => p.games.length >= 1);

    return sourcePlayers.map((p) => {
      const pSnap = attachPlayerSnapshot(p, seasonToken);
      const stats: Record<string, number | null> = {};
      for (const id of neededIds) {
        const def = findScatterMetric(id, 'player');
        stats[id] = resolvePlayerScatterMetricValue(pSnap, def.id, def.decimals);
      }
      return { id: p.id, stats };
    });
  }, [
    activeTab,
    corrScope,
    corrTargetMetricId,
    playerCatalogMetrics,
    players,
    minGames,
    minMpg,
    playerAdvCache,
    heroicCache,
    seasonToken,
  ]);

  // Multi-Scope, Multi-Pack 10-Layer Correlation Matrix Calculations
  const correlationData = useMemo(() => {
    const isPlayers = corrScope === 'players';
    const packs = isPlayers ? PLAYER_CORRELATION_PACKS : TEAM_CORRELATION_PACKS;
    const activePack = packs.find((p) => p.id === corrPackId) || packs[0];
    const entityStatsRows = isPlayers
      ? correlationPlayersStats
      : enrichedTeams.map((t) => ({ id: t.id, stats: t.stats }));

    if (entityStatsRows.length < 3) return null;

    const metricDefs = activePack.metricIds.map((id) => {
      const def = findScatterMetric(id, isPlayers ? 'player' : 'team');
      return {
        id: def.id,
        label: def.shortLabel,
        fullLabel: def.label,
        desc: def.description,
        lowerIsBetter: def.lowerIsBetter,
      };
    });

    const targetDef = findScatterMetric(
      corrTargetMetricId,
      isPlayers ? 'player' : 'team'
    );

    const pairedCorr = (idA: string, idB: string): { r: number; n: number } => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const row of entityStatsRows) {
        const va = row.stats[idA];
        const vb = row.stats[idB];
        if (
          va !== null &&
          va !== undefined &&
          vb !== null &&
          vb !== undefined &&
          !Number.isNaN(va) &&
          !Number.isNaN(vb)
        ) {
          xs.push(va);
          ys.push(vb);
        }
      }
      return { r: calculatePearsonCorrelation(xs, ys), n: xs.length };
    };

    const matrix: Array<{
      metricA: { id: string; label: string; fullLabel: string; lowerIsBetter?: boolean };
      correlations: Record<string, number>;
    }> = [];

    const pairCandidates: Array<{
      idA: string;
      labelA: string;
      idB: string;
      labelB: string;
      r: number;
      absR: number;
      n: number;
    }> = [];

    metricDefs.forEach((mA, idxA) => {
      const row: Record<string, number> = {};
      metricDefs.forEach((mB, idxB) => {
        if (mA.id === mB.id) {
          row[mB.id] = 1.0;
        } else {
          const { r, n } = pairedCorr(mA.id, mB.id);
          row[mB.id] = r;
          if (idxB > idxA && n >= 5) {
            pairCandidates.push({
              idA: mA.id,
              labelA: mA.label,
              idB: mB.id,
              labelB: mB.label,
              r,
              absR: Math.abs(r),
              n,
            });
          }
        }
      });

      matrix.push({
        metricA: {
          id: mA.id,
          label: mA.label,
          fullLabel: mA.fullLabel,
          lowerIsBetter: mA.lowerIsBetter,
        },
        correlations: row,
      });
    });

    const topStrongestPairs = pairCandidates
      .sort((a, b) => b.absR - a.absR)
      .slice(0, 3);

    // Correlation against chosen Target Metric across the entire scoped catalog (or active pack metrics)
    const rankingSourceDefs = (
      isPlayers ? playerCatalogMetrics : teamCatalogMetrics
    ).filter((m) => m.id !== targetDef.id);

    const targetRanking = rankingSourceDefs
      .map((m) => {
        const xs: number[] = [];
        const ys: number[] = [];
        if (isPlayers) {
          // For full-catalog ranking in players we compute on the fly from correlationPlayersStats when in pack,
          // or fall back to active pack metrics for instant rendering
          for (const row of entityStatsRows) {
            const va = row.stats[m.id];
            const vb = row.stats[targetDef.id];
            if (
              va !== null &&
              va !== undefined &&
              vb !== null &&
              vb !== undefined &&
              !Number.isNaN(va) &&
              !Number.isNaN(vb)
            ) {
              xs.push(va);
              ys.push(vb);
            }
          }
        } else {
          for (const row of entityStatsRows) {
            const va = row.stats[m.id];
            const vb = row.stats[targetDef.id];
            if (
              va !== null &&
              va !== undefined &&
              vb !== null &&
              vb !== undefined &&
              !Number.isNaN(va) &&
              !Number.isNaN(vb)
            ) {
              xs.push(va);
              ys.push(vb);
            }
          }
        }
        if (xs.length < 5) return null;
        const rawR = calculatePearsonCorrelation(xs, ys);
        const signFlip = (m.lowerIsBetter ? -1 : 1) * (targetDef.lowerIsBetter ? -1 : 1);
        const effectiveImpact = rawR * signFlip;
        return {
          id: m.id,
          label: m.shortLabel,
          fullLabel: m.label,
          desc: m.description,
          lowerIsBetter: m.lowerIsBetter,
          rawR,
          effectiveImpact,
          absR: Math.abs(rawR),
          n: xs.length,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.absR - a.absR)
      .slice(0, 14);

    return {
      isPlayers,
      sampleCount: entityStatsRows.length,
      activePack,
      packs,
      targetDef,
      keyMetrics: metricDefs,
      matrix,
      topStrongestPairs,
      targetRanking,
    };
  }, [
    corrScope,
    corrPackId,
    corrTargetMetricId,
    enrichedTeams,
    correlationPlayersStats,
    teamCatalogMetrics,
    playerCatalogMetrics,
  ]);

  // Reset helper
  const handleResetFilters = () => {
    setHoveredEntity(null);
    setHoveredGaussianId(null);
    setTooltipDismissed(true);
    if (activeTab === 'teams') {
      setTeamConfFilter('all');
      setTeamDivFilter('all');
      setTeamQuery('');
      setTeamMeanScope('league');
      setSelectedTeamId(null);
      setTeamPresetTheme('all');
      handleSelectTeamPreset('contenders');
    } else {
      setPlayerPosFilter('all');
      setPlayerConfFilter('all');
      setPlayerDivFilter('all');
      setPlayerTeamFilter('all');
      setPlayerCountryFilter('all');
      setPlayerBirthYearFilter('all');
      setOnlyRookies(false);
      setPlayerQuery('');
      setHasCustomMinGames(false);
      setMinGames(recommendedMinGames);
      setMinMpg(20);
      setPlayerMeanScope('league');
      setSelectedPlayerId(null);
      setPlayerPresetTheme('all');
      handleSelectPlayerPreset('usage_efficiency');
    }
  };

  // Custom Point Shape for Teams: Renders Official Franchise Logos via SVG <image>
  const renderTeamScatterShape = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || isNaN(cx) || isNaN(cy)) return null;

    const isHighlighted =
      teamQuery &&
      normalizeSearchText(payload.name + ' ' + payload.abbreviation).includes(
        normalizeSearchText(teamQuery)
      );
    const isSelected = selectedTeamId === payload.id;
    const isHovered = hoveredEntity?.id === payload.id;
    const baseRadius = Number(payload.bubbleRadius) || 15;
    const radius = isSelected
      ? Math.max(baseRadius + 4, 18)
      : isHovered
        ? Math.max(baseRadius + 3, 17)
        : isHighlighted
          ? Math.max(baseRadius + 2, 17)
          : baseRadius;
    const imgSize = Math.max(12, (radius - 2) * 2);

    return (
      <g
        className="cursor-pointer transition-transform duration-150 select-none"
        onMouseEnter={() => {
          setTooltipDismissed(false);
          setHoveredEntity(payload);
        }}
        onMouseLeave={() => {
          setHoveredEntity((prev: any) => (prev?.id === payload.id ? null : prev));
        }}
        onClick={(e) => {
          e.stopPropagation();
          setHoveredEntity(null);
          setTooltipDismissed(true);
          setSelectedTeamId((prev) => (prev === payload.id ? null : payload.id));
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setHoveredEntity(null);
          setTooltipDismissed(true);
          onInspectEntity('team', payload.id);
        }}
      >
        {/* Glow / Highlight ring */}
        {(isHighlighted || isHovered || isSelected) && (
          <circle
            cx={cx}
            cy={cy}
            r={radius + 4}
            fill="none"
            stroke="#F97316"
            strokeWidth={isSelected ? 3 : 2.5}
            strokeDasharray={isHovered || isSelected ? 'none' : '3 3'}
            className={isSelected ? '' : 'animate-pulse'}
          />
        )}

        {/* Circular backing with team primary color stroke */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="#0B1120"
          stroke={isSelected || isHovered ? '#F97316' : payload.primaryColor || '#1E293B'}
          strokeWidth={isSelected || isHovered ? 2.2 : 1.5}
          className="shadow-md"
        />

        {/* Embedded Official NBA Team Logo */}
        {payload.logoUrl ? (
          <image
            href={payload.logoUrl}
            xlinkHref={payload.logoUrl}
            x={cx - imgSize / 2}
            y={cy - imgSize / 2}
            width={imgSize}
            height={imgSize}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            fontSize="10"
            fontWeight="bold"
            fill="#CBD5E1"
            className="font-mono"
          >
            {payload.abbreviation}
          </text>
        )}
      </g>
    );
  };

  // Custom Point Shape for Players: Colored with Official Franchise Primary Colors
  const renderPlayerScatterShape = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || isNaN(cx) || isNaN(cy)) return null;

    const isHighlighted =
      playerQuery &&
      normalizeSearchText(payload.name).includes(normalizeSearchText(playerQuery));
    const isSelected = selectedPlayerId === payload.id;
    const isHovered = hoveredEntity?.id === payload.id;
    const baseR = Number(payload.bubbleRadius) || 6;
    const r = isSelected
      ? baseR + 3
      : isHovered
        ? baseR + 2.5
        : isHighlighted
          ? baseR + 2
          : baseR;
    const dotColor = isHighlighted || isSelected ? '#F97316' : payload.teamPrimaryColor || '#38BDF8';

    return (
      <g
        className="cursor-pointer select-none"
        onMouseEnter={() => {
          setTooltipDismissed(false);
          setHoveredEntity(payload);
        }}
        onMouseLeave={() => {
          setHoveredEntity((prev: any) => (prev?.id === payload.id ? null : prev));
        }}
        onClick={(e) => {
          e.stopPropagation();
          setHoveredEntity(null);
          setTooltipDismissed(true);
          setSelectedPlayerId((prev) => (prev === payload.id ? null : payload.id));
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setHoveredEntity(null);
          setTooltipDismissed(true);
          onInspectEntity('player', payload.id);
        }}
      >
        {(isHovered || isSelected) && (
          <circle
            cx={cx}
            cy={cy}
            r={r + 4}
            fill="none"
            stroke={isSelected ? '#F97316' : '#FFFFFF'}
            strokeWidth={isSelected ? 2 : 1.5}
            className={isSelected ? '' : 'animate-pulse'}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={dotColor}
          fillOpacity={isHovered || isSelected ? 1 : 0.85}
          stroke={isHovered || isSelected ? '#FFFFFF' : '#0B1120'}
          strokeWidth={isHovered || isSelected ? 2 : 1}
          className="transition-all duration-150"
        />
      </g>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Header with View Mode Switcher (Equipos | Jugadores | Matriz Correlación) */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center text-orange-400 shrink-0">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-100 truncate">
                  Explorador Analítico Avanzado
                </h2>
                <span className="text-[11px] font-mono font-semibold text-orange-400 pl-2 border-l border-[#283548]">
                  10 Capas NBA
                </span>
                {loadingSnapshot && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 pl-2 border-l border-[#283548]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Sincronizando métricas...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                Matrices multidimensionales con las 10 capas oficiales NBA.com, escudos oficiales e indicadores explicados
              </p>
            </div>
          </div>

          {/* Primary View Segment Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg self-start lg:self-auto overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => {
                setActiveTab('teams');
                setHoveredEntity(null);
                setTooltipDismissed(true);
              }}
              className={`min-h-[28px] flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'teams'
                  ? 'bg-orange-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Equipos NBA (30)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('players');
                setHoveredEntity(null);
                setTooltipDismissed(true);
              }}
              className={`min-h-[28px] flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'players'
                  ? 'bg-orange-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Jugadores NBA</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('correlation');
                setHoveredEntity(null);
                setTooltipDismissed(true);
              }}
              className={`min-h-[28px] flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'correlation'
                  ? 'bg-orange-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Matriz de Correlación</span>
            </button>
          </div>
        </div>

        {/* 2. 18 High-Correlation Presets Carousel (Teams & Players) */}
        {activeTab === 'teams' && (
          <div className="space-y-2.5 pt-2 border-t border-[#1E293B]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-orange-400" /> Presets Tácticos (18 · 10 Capas)
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {PRESET_THEMES.map((th) => (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => setTeamPresetTheme(th.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                        teamPresetTheme === th.id
                          ? 'bg-orange-500/20 border-orange-500/60 text-orange-300'
                          : 'bg-[#0B1120] border-[#1E293B] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {th.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] text-slate-400 hover:text-orange-400 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Restaurar filtros
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
              {visibleTeamPresets.map((p) => {
                const isActive = teamPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectTeamPreset(p.id)}
                    title={p.desc}
                    className={`p-2 text-left rounded-lg border transition-all text-xs flex flex-col justify-between gap-1 ${
                      isActive
                        ? 'bg-orange-500/15 border-orange-500/60 text-orange-200 shadow-sm'
                        : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:bg-[#182338] hover:border-slate-700'
                    }`}
                  >
                    <span className="font-semibold text-[11px] block truncate text-slate-100">
                      {p.label}
                    </span>
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="font-mono text-slate-400 truncate">{p.axesHint}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-400 shrink-0">
                        {p.layerBadge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#0B1120]/80 border border-[#1E293B] text-[11px]">
              <p className="text-slate-300 leading-snug">
                <span className="font-semibold text-orange-300 mr-1.5">
                  {activeTeamPreset ? activeTeamPreset.label : 'Ejes personalizados'}:
                </span>
                {activeTeamPreset
                  ? activeTeamPreset.desc
                  : `${teamMetricX.label} frente a ${teamMetricY.label}.`}
              </p>
              <span
                className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${teamLivePearson.info.badgeColorClass}`}
              >
                r = {teamLivePearson.r >= 0 ? `+${teamLivePearson.r.toFixed(2)}` : teamLivePearson.r.toFixed(2)} · {teamLivePearson.info.strengthLabel}
              </span>
            </div>
          </div>
        )}

        {activeTab === 'players' && (
          <div className="space-y-2.5 pt-2 border-t border-[#1E293B]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-sky-400" /> Presets Analíticos (18 · 10 Capas)
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {PRESET_THEMES.map((th) => (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => setPlayerPresetTheme(th.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                        playerPresetTheme === th.id
                          ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                          : 'bg-[#0B1120] border-[#1E293B] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {th.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] text-slate-400 hover:text-orange-400 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Restaurar filtros
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
              {visiblePlayerPresets.map((p) => {
                const isActive = playerPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPlayerPreset(p.id)}
                    title={p.desc}
                    className={`p-2 text-left rounded-lg border transition-all text-xs flex flex-col justify-between gap-1 ${
                      isActive
                        ? 'bg-sky-500/15 border-sky-500/60 text-sky-200 shadow-sm'
                        : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:bg-[#182338] hover:border-slate-700'
                    }`}
                  >
                    <span className="font-semibold text-[11px] block truncate text-slate-100">
                      {p.label}
                    </span>
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="font-mono text-slate-400 truncate">{p.axesHint}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-400 shrink-0">
                        {p.layerBadge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#0B1120]/80 border border-[#1E293B] text-[11px]">
              <p className="text-slate-300 leading-snug">
                <span className="font-semibold text-sky-300 mr-1.5">
                  {activePlayerPreset ? activePlayerPreset.label : 'Ejes personalizados'}:
                </span>
                {activePlayerPreset
                  ? activePlayerPreset.desc
                  : `${playerMetricX.label} frente a ${playerMetricY.label}.`}
              </p>
              <span
                className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${playerLivePearson.info.badgeColorClass}`}
              >
                r = {playerLivePearson.r >= 0 ? `+${playerLivePearson.r.toFixed(2)}` : playerLivePearson.r.toFixed(2)} · {playerLivePearson.info.strengthLabel} (n={playerLivePearson.n})
              </span>
            </div>
          </div>
        )}

        {/* 3. Dropdown Controls Bar with (i) Information Tooltips */}
        {activeTab === 'teams' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-[#1E293B]">
            {/* Eje X Selector with (i) */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1 text-orange-400">
                  <Filter className="w-3 h-3" />{' '}
                  {teamChartMode === 'gaussian' ? 'Métrica en Campana' : 'Eje X (Horizontal)'}
                </span>
                <MetricInfoButton
                  title={teamMetricX.label}
                  desc={teamMetricX.description}
                  interpretation={teamMetricX.interpretation}
                  unit={teamMetricX.unit}
                  lowerIsBetter={teamMetricX.lowerIsBetter}
                  align="left"
                  placement="bottom"
                />
              </label>
              <select
                value={teamMetricXId}
                onChange={(e) => {
                  setTeamMetricXId(e.target.value);
                  setTeamPresetId('custom');
                }}
                className="w-full h-9 px-2.5 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500"
              >
                {groupedTeamMetrics.map((group) => (
                  <optgroup key={group.id} label={group.label}>
                    {group.metrics.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} {m.lowerIsBetter ? '⬇ (Menor mejor)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Eje Y Selector with (i) */}
            <div className={`space-y-1 transition-opacity ${teamChartMode === 'gaussian' ? 'opacity-45' : ''}`}>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1 text-sky-400">
                  <Filter className="w-3 h-3" />{' '}
                  {teamChartMode === 'gaussian' ? 'Eje Y (Solo 2D)' : 'Eje Y (Vertical)'}
                </span>
                <MetricInfoButton
                  title={teamMetricY.label}
                  desc={teamMetricY.description}
                  interpretation={teamMetricY.interpretation}
                  unit={teamMetricY.unit}
                  lowerIsBetter={teamMetricY.lowerIsBetter}
                  align="left"
                  placement="bottom"
                />
              </label>
              <select
                value={teamMetricYId}
                disabled={teamChartMode === 'gaussian'}
                onChange={(e) => {
                  setTeamMetricYId(e.target.value);
                  setTeamPresetId('custom');
                }}
                className="w-full h-9 px-2.5 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500 disabled:cursor-not-allowed"
              >
                {groupedTeamMetrics.map((group) => (
                  <optgroup key={group.id} label={group.label}>
                    {group.metrics.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} {m.lowerIsBetter ? '⬇ (Menor mejor)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Conference & Division Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-emerald-400" /> Conf. y División
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={teamConfFilter}
                  onChange={(e) => setTeamConfFilter(e.target.value as any)}
                  className="w-full h-9 px-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200"
                >
                  <option value="all">Todas Conf.</option>
                  <option value="Este">Este (15)</option>
                  <option value="Oeste">Oeste (15)</option>
                </select>
                <select
                  value={teamDivFilter}
                  onChange={(e) => setTeamDivFilter(e.target.value)}
                  className="w-full h-9 px-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200"
                >
                  <option value="all">Div: Todas</option>
                  {DIVISIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Size Metric Selector with (i) */}
            <div className={`space-y-1 transition-opacity ${teamChartMode === 'gaussian' ? 'opacity-45' : ''}`}>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1 text-purple-400">
                  <Activity className="w-3 h-3" />{' '}
                  {teamChartMode === 'gaussian' ? 'Burbuja (Solo 2D)' : 'Tamaño Burbuja'}
                </span>
                <MetricInfoButton
                  title={teamMetricSize ? teamMetricSize.label : 'Tamaño Burbuja uniforme (---)'}
                  desc={
                    teamMetricSize
                      ? teamMetricSize.description
                      : 'Todas las burbujas mantienen el mismo tamaño estándar sin ponderación.'
                  }
                  interpretation={teamMetricSize?.interpretation}
                  unit={teamMetricSize?.unit}
                  lowerIsBetter={teamMetricSize?.lowerIsBetter}
                  align="right"
                  placement="bottom"
                />
              </label>
              <select
                value={teamMetricSizeId}
                disabled={teamChartMode === 'gaussian'}
                onChange={(e) => setTeamMetricSizeId(e.target.value)}
                className="w-full h-9 px-2.5 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500 disabled:cursor-not-allowed"
              >
                <option value="none">---</option>
                {groupedTeamMetrics.map((group) => (
                  <optgroup key={group.id} label={group.label}>
                    {group.metrics.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Live Search */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-3 h-3 text-slate-400" /> Resaltar Franquicia
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={teamQuery}
                  onChange={(e) => setTeamQuery(e.target.value)}
                  placeholder="Buscar franquicia o abreviatura..."
                  className="w-full h-9 pl-8 pr-3 text-xs bg-[#0B1120] border border-[#1E293B] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'players' && (
          <div className="space-y-3 pt-3 border-t border-[#1E293B]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Player X Metric Selector with (i) */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1 text-orange-400">
                    <Filter className="w-3 h-3" />{' '}
                    {playerChartMode === 'gaussian' ? 'Métrica en Campana' : 'Eje Horizontal (X)'}
                  </span>
                  <MetricInfoButton
                    title={playerMetricX.label}
                    desc={playerMetricX.description}
                    interpretation={playerMetricX.interpretation}
                    unit={playerMetricX.unit}
                    lowerIsBetter={playerMetricX.lowerIsBetter}
                    align="left"
                    placement="bottom"
                  />
                </label>
                <select
                  value={playerMetricXId}
                  onChange={(e) => {
                    setPlayerMetricXId(e.target.value);
                    setPlayerPresetId('custom');
                  }}
                  className="w-full h-9 px-2.5 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  {groupedPlayerMetrics.map((group) => (
                    <optgroup key={group.id} label={group.label}>
                      {group.metrics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} {m.lowerIsBetter ? '⬇ (Menor mejor)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Player Y Metric Selector with (i) */}
              <div className={`space-y-1 transition-opacity ${playerChartMode === 'gaussian' ? 'opacity-45' : ''}`}>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1 text-sky-400">
                    <Filter className="w-3 h-3" />{' '}
                    {playerChartMode === 'gaussian' ? 'Eje Y (Solo 2D)' : 'Eje Vertical (Y)'}
                  </span>
                  <MetricInfoButton
                    title={playerMetricY.label}
                    desc={playerMetricY.description}
                    interpretation={playerMetricY.interpretation}
                    unit={playerMetricY.unit}
                    lowerIsBetter={playerMetricY.lowerIsBetter}
                    align="left"
                    placement="bottom"
                  />
                </label>
                <select
                  value={playerMetricYId}
                  disabled={playerChartMode === 'gaussian'}
                  onChange={(e) => {
                    setPlayerMetricYId(e.target.value);
                    setPlayerPresetId('custom');
                  }}
                  className="w-full h-9 px-2.5 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500 disabled:cursor-not-allowed"
                >
                  {groupedPlayerMetrics.map((group) => (
                    <optgroup key={group.id} label={group.label}>
                      {group.metrics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} {m.lowerIsBetter ? '⬇ (Menor mejor)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Player Size Metric Selector with (i) */}
              <div className={`space-y-1 transition-opacity ${playerChartMode === 'gaussian' ? 'opacity-45' : ''}`}>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1 text-purple-400">
                    <Activity className="w-3 h-3" />{' '}
                    {playerChartMode === 'gaussian' ? 'Burbuja (Solo 2D)' : 'Tamaño Burbuja'}
                  </span>
                  <MetricInfoButton
                    title={playerMetricSize ? playerMetricSize.label : 'Tamaño Burbuja uniforme (---)'}
                    desc={
                      playerMetricSize
                        ? playerMetricSize.description
                        : 'Todas las burbujas mantienen el mismo tamaño estándar sin ponderación.'
                    }
                    interpretation={playerMetricSize?.interpretation}
                    unit={playerMetricSize?.unit}
                    lowerIsBetter={playerMetricSize?.lowerIsBetter}
                    align="right"
                    placement="bottom"
                  />
                </label>
                <select
                  value={playerMetricSizeId}
                  disabled={playerChartMode === 'gaussian'}
                  onChange={(e) => setPlayerMetricSizeId(e.target.value)}
                  className="w-full h-9 px-2.5 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500 disabled:cursor-not-allowed"
                >
                  <option value="none">---</option>
                  {groupedPlayerMetrics.map((group) => (
                    <optgroup key={group.id} label={group.label}>
                      {group.metrics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Live Search */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Search className="w-3 h-3 text-slate-400" /> Resaltar Jugador
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={playerQuery}
                    onChange={(e) => setPlayerQuery(e.target.value)}
                    placeholder="Buscar jugador..."
                    className="w-full h-9 pl-8 pr-3 text-xs bg-[#0B1120] border border-[#1E293B] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2.5">
              {/* Conference */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Shield className="w-3 h-3 text-emerald-400" /> Conferencia
                </label>
                <select
                  value={playerConfFilter}
                  onChange={(e) => {
                    const conf = e.target.value as 'all' | 'East' | 'West';
                    setPlayerConfFilter(conf);
                    if (
                      conf === 'East' &&
                      playerDivFilter !== 'all' &&
                      !['Atlantic', 'Central', 'Southeast'].includes(playerDivFilter)
                    ) {
                      setPlayerDivFilter('all');
                    }
                    if (
                      conf === 'West' &&
                      playerDivFilter !== 'all' &&
                      !['Northwest', 'Pacific', 'Southwest'].includes(playerDivFilter)
                    ) {
                      setPlayerDivFilter('all');
                    }
                    if (playerTeamFilter !== 'all') {
                      const div = TEAM_TO_DIV[playerTeamFilter];
                      if (
                        (conf === 'East' && !['Atlantic', 'Central', 'Southeast'].includes(div)) ||
                        (conf === 'West' && !['Northwest', 'Pacific', 'Southwest'].includes(div))
                      ) {
                        setPlayerTeamFilter('all');
                      }
                    }
                  }}
                  className="w-full h-9 px-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">Todas (NBA)</option>
                  <option value="East">Este</option>
                  <option value="West">Oeste</option>
                </select>
              </div>

              {/* Division */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3 h-3 text-emerald-400" /> División
                </label>
                <select
                  value={playerDivFilter}
                  onChange={(e) => {
                    const nextDiv = e.target.value;
                    setPlayerDivFilter(nextDiv);
                    if (
                      nextDiv !== 'all' &&
                      playerTeamFilter !== 'all' &&
                      TEAM_TO_DIV[playerTeamFilter] !== nextDiv
                    ) {
                      setPlayerTeamFilter('all');
                    }
                  }}
                  className="w-full h-9 px-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">Todas</option>
                  {availablePlayerDivisions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Team */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Shield className="w-3 h-3 text-orange-400" /> Equipo
                </label>
                <select
                  value={playerTeamFilter}
                  onChange={(e) => setPlayerTeamFilter(e.target.value)}
                  className="w-full h-9 px-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">Todos</option>
                  {availablePlayerTeams.map((t) => (
                    <option key={t.abbr} value={t.abbr}>
                      {t.abbr} — {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Position */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Users className="w-3 h-3 text-emerald-400" /> Posición
                </label>
                <select
                  value={playerPosFilter}
                  onChange={(e) => setPlayerPosFilter(e.target.value as any)}
                  className="w-full h-9 px-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">Todas</option>
                  <option value="G">G - Bases</option>
                  <option value="F">F - Aleros</option>
                  <option value="C">C - Pívots</option>
                </select>
              </div>

              {/* Nationality */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3 h-3 text-sky-400" /> País
                </label>
                <select
                  value={playerCountryFilter}
                  onChange={(e) => setPlayerCountryFilter(e.target.value)}
                  className="w-full h-9 px-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">Todos</option>
                  {playerFilterOptions.countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Birth Year */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <BarChart2 className="w-3 h-3 text-amber-400" /> Año nac.
                </label>
                <select
                  value={playerBirthYearFilter}
                  onChange={(e) => setPlayerBirthYearFilter(e.target.value)}
                  className="w-full h-9 px-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">Todos</option>
                  {playerFilterOptions.birthYears.map((yr) => (
                    <option key={yr} value={String(yr)}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Free numeric Min GP (recalculates dynamically with games played) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <label
                    className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate"
                    title={`Umbral dinámico (~60% de ${Math.round(avgTeamGp)} PJ jugados por equipo = ${recommendedMinGames} PJ)`}
                  >
                    PJ mín.
                  </label>
                  {hasCustomMinGames && minGames !== recommendedMinGames && (
                    <button
                      type="button"
                      onClick={() => {
                        setHasCustomMinGames(false);
                        setMinGames(recommendedMinGames);
                      }}
                      title={`Restaurar umbral dinámico (${recommendedMinGames} PJ)`}
                      className="text-[9px] font-mono text-orange-400 hover:text-orange-300 underline shrink-0"
                    >
                      Auto ({recommendedMinGames})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  max={maxObservedGames}
                  step={1}
                  value={minGames}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setHasCustomMinGames(true);
                    setMinGames(Number.isFinite(n) && n >= 1 ? n : 1);
                  }}
                  title={`Umbral base dinámico: ${recommendedMinGames} PJ (60% de ~${Math.round(avgTeamGp)} PJ jugados)`}
                  aria-label="Partidos jugados mínimos"
                  className="w-full h-9 px-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs font-mono text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Free numeric Min MPG */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                  MIN/p mín.
                </label>
                <input
                  type="number"
                  min={0}
                  max={48}
                  step={0.5}
                  value={minMpg}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    setMinMpg(Number.isFinite(n) && n >= 0 ? n : 0);
                  }}
                  aria-label="Minutos por partido mínimos"
                  className="w-full h-9 px-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-xs font-mono text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Solo rookies toggle button */}
              <div className="space-y-1 col-span-2 sm:col-span-1 flex flex-col justify-end">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-orange-400" /> Experiencia
                </span>
                <button
                  type="button"
                  onClick={() => setOnlyRookies((prev) => !prev)}
                  aria-pressed={onlyRookies}
                  className={`w-full h-9 px-2.5 rounded-md border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                    onlyRookies
                      ? 'bg-orange-500 text-slate-950 border-orange-400 shadow-sm'
                      : 'bg-[#0B1120] text-slate-300 border-[#1E293B] hover:border-orange-500/50 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Rookies</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 4. Tab 1: Teams Scatter Plot & Gaussian Bell Curve View */}
      {activeTab === 'teams' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Chart Area */}
          <div className="lg:col-span-3 space-y-3">
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 min-h-[560px] flex flex-col justify-between relative">
              {/* Dual Axes / Gaussian Header Indicators Bar with Mode Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2 pb-2.5 border-b border-[#1E293B]">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Chart Mode Switcher: Dispersión 2D vs Campana de Gauss */}
                  <div
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0B1120] border border-[#1E293B] p-1 text-[11px]"
                    role="group"
                    aria-label="Tipo de gráfico para Equipos"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setTeamChartMode('scatter');
                        setHoveredGaussianId(null);
                      }}
                      className={`min-h-[28px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 font-medium ${
                        teamChartMode === 'scatter'
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Dispersión 2D
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTeamChartMode('gaussian');
                        setHoveredEntity(null);
                        setTooltipDismissed(true);
                      }}
                      className={`min-h-[28px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 font-medium ${
                        teamChartMode === 'gaussian'
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Campana de Gauss
                    </button>
                  </div>

                  {teamChartMode === 'scatter' ? (
                    <>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1120] border border-sky-500/30 text-xs">
                        <span className="text-sky-400 font-bold uppercase text-[10px]">Eje Y:</span>
                        <span className="font-semibold text-slate-200">{teamMetricY.label}</span>
                        {teamMetricY.lowerIsBetter && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-semibold border border-emerald-500/30">
                            ⬆ Escala invertida (Menor es mejor)
                          </span>
                        )}
                        <MetricInfoButton
                          title={teamMetricY.label}
                          desc={teamMetricY.description}
                          interpretation={teamMetricY.interpretation}
                          unit={teamMetricY.unit}
                          lowerIsBetter={teamMetricY.lowerIsBetter}
                          align="left"
                          placement="bottom"
                        />
                      </div>

                      <span className="text-slate-500 text-xs font-bold">vs</span>

                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1120] border border-orange-500/30 text-xs">
                        <span className="text-orange-400 font-bold uppercase text-[10px]">Eje X:</span>
                        <span className="font-semibold text-slate-200">{teamMetricX.label}</span>
                        {teamMetricX.lowerIsBetter && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-semibold border border-emerald-500/30">
                            ➡ Invertido (Menor mejor)
                          </span>
                        )}
                        <MetricInfoButton
                          title={teamMetricX.label}
                          desc={teamMetricX.description}
                          interpretation={teamMetricX.interpretation}
                          unit={teamMetricX.unit}
                          lowerIsBetter={teamMetricX.lowerIsBetter}
                          align="left"
                          placement="bottom"
                        />
                      </div>

                      {/* Live Pearson r pill */}
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono font-semibold ${teamLivePearson.info.badgeColorClass}`}
                      >
                        <TrendingUp className="w-3 h-3" />
                        <span>
                          r = {teamLivePearson.r >= 0 ? `+${teamLivePearson.r.toFixed(2)}` : teamLivePearson.r.toFixed(2)}
                        </span>
                        <span className="font-sans text-[10px] opacity-90">
                          ({teamLivePearson.info.strengthLabel} · n={teamLivePearson.n})
                        </span>
                        <MetricInfoButton
                          title={`Correlación de Pearson (r = ${teamLivePearson.r.toFixed(2)})`}
                          desc="Mide la fuerza y dirección de la relación lineal entre los dos ejes (-1.00 a +1.00). Valores cercanos a +1 o -1 indican relación estrecha; cerca de 0 indica independencia."
                          interpretation={teamLivePearson.info.summaryText}
                          align="left"
                          placement="bottom"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1120] border border-orange-500/30 text-xs">
                        <span className="text-orange-400 font-bold uppercase text-[10px]">Distribución:</span>
                        <span className="font-semibold text-slate-200">{teamMetricX.label}</span>
                        {teamMetricX.lowerIsBetter && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-semibold border border-emerald-500/30">
                            Menor es mejor
                          </span>
                        )}
                        <MetricInfoButton
                          title={`Campana de Gauss · ${teamMetricX.label}`}
                          desc={teamMetricX.description}
                          interpretation="La curva muestra la distribución normal teórica (μ y desviaciones ±1σ, ±2σ), el histograma real y la posición exacta de cada franquicia."
                          unit={teamMetricX.unit}
                          lowerIsBetter={teamMetricX.lowerIsBetter}
                          align="left"
                          placement="bottom"
                        />
                      </div>
                      {teamMetricX.id !== teamMetricY.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setTeamMetricXId(teamMetricY.id);
                            setTeamMetricYId(teamMetricX.id);
                            setHoveredGaussianId(null);
                          }}
                          title={`Ver ${teamMetricY.shortLabel} en la Campana de Gauss`}
                          className="min-h-[28px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] hover:border-orange-500/40 text-[11px] text-slate-300 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
                        >
                          <ArrowLeftRight className="w-3 h-3 text-orange-400" />
                          <span>Ver {teamMetricY.shortLabel}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {hasTeamFilterSelection && (
                    <div
                      className="inline-flex items-center gap-1 rounded-lg bg-[#0B1120] border border-[#1E293B] p-1 text-[11px]"
                      role="group"
                      aria-label="Ámbito de la media de los ejes (Equipos)"
                    >
                      <button
                        type="button"
                        onClick={() => setTeamMeanScope('league')}
                        className={`min-h-[28px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                          effectiveTeamMeanScope === 'league'
                            ? 'bg-orange-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Toda la liga (26-27)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTeamMeanScope('filtered')}
                        disabled={filteredTeams.length === 0}
                        className={`min-h-[28px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                          effectiveTeamMeanScope === 'filtered'
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Seleccionados ({teamChartMode === 'gaussian' ? gaussianTeams.length : filteredTeams.length})
                      </button>
                    </div>
                  )}
                  {teamChartMode === 'scatter' && (
                    <span className="text-[11px] font-mono text-slate-400">
                      {effectiveTeamMeanScope === 'filtered'
                        ? `Media Sel. (${filteredTeams.length})`
                        : 'Media NBA (26-27)'}
                      : X={formatScatterMetricValue(teamMeanX, teamMetricX)}
                      {teamMetricX.unit} · Y={formatScatterMetricValue(teamMeanY, teamMetricY)}
                      {teamMetricY.unit}
                    </span>
                  )}
                  <ExportImageButton
                    onBuildImage={() =>
                      teamChartMode === 'gaussian'
                        ? buildTableSnapshotBlob({
                            filename: `RadarNBA-Equipos-Gauss-${teamMetricX.shortLabel}`,
                            categoryTag: 'CAMPANA DE GAUSS · EQUIPOS NBA',
                            title: `Distribución Normal: ${teamMetricX.shortLabel}`,
                            subtitle: `${teamGaussianSummary.ranked.length} franquicias · Media μ=${formatScatterMetricValue(teamGaussianSummary.mu, teamMetricX)}${teamMetricX.unit} · σ=±${formatScatterMetricValue(teamGaussianSummary.sigma, teamMetricX)}`,
                            entityColumnLabel: 'FRANQUICIA',
                            columns: [
                              { key: 'val', label: teamMetricX.shortLabel, align: 'right', widthWeight: 1.2 },
                              { key: 'z', label: 'Z-SCORE', align: 'right', widthWeight: 1.1 },
                              { key: 'pct', label: 'PERCENTIL', align: 'right', widthWeight: 1.1 },
                              { key: 'record', label: 'BALANCE', align: 'right', widthWeight: 1.1 },
                            ],
                            rows: teamGaussianSummary.ranked.slice(0, 15).map((row, idx) => ({
                              rank: idx + 1,
                              teamAbbr: row.team.abbreviation,
                              entityName: row.team.name,
                              entitySubtext: `${row.team.division} · ${row.team.conference}`,
                              cells: {
                                val: `${formatScatterMetricValue(row.value, teamMetricX)}${teamMetricX.unit}`,
                                z: formatSignedZ(row.perfZ),
                                pct: `P${row.percentile}`,
                                record: `${row.team.wins}-${row.team.losses}`,
                              },
                            })),
                          })
                        : buildTableSnapshotBlob({
                            filename: `RadarNBA-Equipos-${teamMetricY.shortLabel}-vs-${teamMetricX.shortLabel}`,
                            categoryTag: 'EXPLORADOR ANALÍTICO · EQUIPOS NBA',
                            title: `${teamMetricY.shortLabel} vs ${teamMetricX.shortLabel}`,
                            subtitle: `${filteredTeams.length} franquicias analizadas · Ejes: ${teamMetricY.label} vs ${teamMetricX.label}`,
                            entityColumnLabel: 'FRANQUICIA',
                            columns: [
                              { key: 'conf', label: 'CONF', align: 'left', widthWeight: 1 },
                              { key: 'valX', label: teamMetricX.shortLabel, align: 'right', widthWeight: 1.2 },
                              { key: 'valY', label: teamMetricY.shortLabel, align: 'right', widthWeight: 1.2 },
                              { key: 'net', label: 'NET RTG', align: 'right', widthWeight: 1 },
                              { key: 'record', label: 'BALANCE', align: 'right', widthWeight: 1.1 },
                            ],
                            rows: filteredTeams.slice(0, 15).map((t, idx) => {
                              const netVal = t.stats.netRtg ?? 0;
                              return {
                                rank: idx + 1,
                                teamAbbr: t.abbreviation,
                                entityName: t.name,
                                entitySubtext: `${t.division} · ${t.conference}`,
                                cells: {
                                  conf: t.conference,
                                  valX: formatScatterMetricValue(t.stats[teamMetricX.id], teamMetricX),
                                  valY: formatScatterMetricValue(t.stats[teamMetricY.id], teamMetricY),
                                  net: `${netVal >= 0 ? '+' : ''}${netVal.toFixed(1)}`,
                                  record: `${t.wins}-${t.losses}`,
                                },
                              };
                            }),
                          })
                    }
                    label="Exportar PNG"
                  />
                </div>
              </div>

              {teamChartMode === 'gaussian' ? (
                <GaussianDistributionChart
                  scope="teams"
                  metric={teamMetricX}
                  entities={teamGaussianSummary.points}
                  referenceValues={teamGaussianReferenceValues}
                  meanScope={effectiveTeamMeanScope}
                  selectedId={selectedTeamId}
                  hoveredId={hoveredGaussianId}
                  onSelectId={setSelectedTeamId}
                  onHoverId={setHoveredGaussianId}
                  onInspectEntity={(id) => onInspectEntity('team', id)}
                />
              ) : (
                <>
                  {/* Selected Team Bar (Mark / Unmark / Open) */}
                  {selectedTeam && (
                    <div className="mb-2.5 px-3 py-2 bg-[#0B1120] border border-orange-500/40 rounded-lg flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TeamLogo
                          abbr={selectedTeam.abbreviation}
                          teamId={selectedTeam.id}
                          logoUrl={selectedTeam.logoUrl}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-100 truncate block">
                            {selectedTeam.name} ({selectedTeam.wins}-{selectedTeam.losses})
                          </span>
                          <span className="text-[11px] font-mono text-slate-300">
                            {teamMetricX.shortLabel}:{' '}
                            <strong className="text-orange-400">
                              {formatScatterMetricValue(selectedTeam.stats[teamMetricX.id], teamMetricX)}
                              {teamMetricX.unit}
                            </strong>
                            {' · '}
                            {teamMetricY.shortLabel}:{' '}
                            <strong className="text-sky-400">
                              {formatScatterMetricValue(selectedTeam.stats[teamMetricY.id], teamMetricY)}
                              {teamMetricY.unit}
                            </strong>
                            {teamMetricSize && selectedTeam.stats[teamMetricSize.id] !== null && (
                              <>
                                {' · '}
                                {teamMetricSize.shortLabel}:{' '}
                                <strong className="text-purple-400">
                                  {formatScatterMetricValue(selectedTeam.stats[teamMetricSize.id], teamMetricSize)}
                                  {teamMetricSize.unit}
                                </strong>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onInspectEntity('team', selectedTeam.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-md hover:bg-orange-400 transition-colors whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Abrir ficha</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTeamId(null);
                            setHoveredEntity(null);
                            setTooltipDismissed(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors whitespace-nowrap"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Desmarcar</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Recharts Scatter Chart with Official Team Badges */}
                  <div
                    id="teams-scatter-container"
                    className="w-full h-[460px] bg-[#0E1626]/40 rounded-lg p-2"
                    onClick={() => {
                      setSelectedTeamId(null);
                      setHoveredEntity(null);
                      setTooltipDismissed(true);
                    }}
                    onMouseMove={() => {
                      if (tooltipDismissed) setTooltipDismissed(false);
                    }}
                    onMouseLeave={() => setHoveredEntity(null)}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 28, right: 24, bottom: 45, left: 45 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.7} />

                        <XAxis
                          type="number"
                          dataKey={(d: EnrichedTeamMetricData) => d.stats[teamMetricX.id]}
                          name={teamMetricX.shortLabel}
                          unit={teamMetricX.unit}
                          stroke="#94A3B8"
                          fontSize={11}
                          tickLine={false}
                          domain={['auto', 'auto']}
                          reversed={Boolean(teamMetricX.lowerIsBetter)}
                          label={{
                            value: `${teamMetricX.label} ${teamMetricX.lowerIsBetter ? '(Menor = Mejor)' : ''}`,
                            position: 'insideBottom',
                            offset: -12,
                            fill: '#CBD5E1',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        />

                        <YAxis
                          type="number"
                          dataKey={(d: EnrichedTeamMetricData) => d.stats[teamMetricY.id]}
                          name={teamMetricY.shortLabel}
                          unit={teamMetricY.unit}
                          stroke="#94A3B8"
                          fontSize={11}
                          tickLine={false}
                          domain={['auto', 'auto']}
                          reversed={Boolean(teamMetricY.lowerIsBetter)}
                          label={{
                            value: `${teamMetricY.shortLabel}${teamMetricY.unit ? ` (${teamMetricY.unit.trim()})` : ''} ${teamMetricY.lowerIsBetter ? '⬇' : ''}`,
                            angle: -90,
                            position: 'insideLeft',
                            offset: 15,
                            fill: '#CBD5E1',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        />

                        <ZAxis type="number" dataKey="bubbleRadius" range={[120, 900]} />

                        {/* League / Selection Mean Reference Lines */}
                        <ReferenceLine
                          x={teamMeanX}
                          ifOverflow="extendDomain"
                          stroke="#F97316"
                          strokeDasharray="4 4"
                          strokeOpacity={0.7}
                          strokeWidth={1.5}
                          label={renderMeanReferenceLabel(
                            'x',
                            effectiveTeamMeanScope === 'filtered'
                              ? `Media Sel. X: ${formatScatterMetricValue(teamMeanX, teamMetricX)}${teamMetricX.unit}`
                              : `Media NBA X: ${formatScatterMetricValue(teamMeanX, teamMetricX)}${teamMetricX.unit}`,
                            '#F97316',
                            '#FDBA74'
                          )}
                        />
                        <ReferenceLine
                          y={teamMeanY}
                          ifOverflow="extendDomain"
                          stroke="#38BDF8"
                          strokeDasharray="4 4"
                          strokeOpacity={0.7}
                          strokeWidth={1.5}
                          label={renderMeanReferenceLabel(
                            'y',
                            effectiveTeamMeanScope === 'filtered'
                              ? `Media Sel. Y: ${formatScatterMetricValue(teamMeanY, teamMetricY)}${teamMetricY.unit}`
                              : `Media NBA Y: ${formatScatterMetricValue(teamMeanY, teamMetricY)}${teamMetricY.unit}`,
                            '#38BDF8',
                            '#7DD3FC'
                          )}
                        />

                        <Tooltip
                          active={tooltipDismissed ? false : undefined}
                          content={({ payload }) => {
                            if (!payload || payload.length === 0) return null;
                            const data: EnrichedTeamMetricData = payload[0].payload;
                            return (
                              <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 shadow-2xl z-30 min-w-56 space-y-2.5">
                                <div className="flex items-center gap-2.5">
                                  <TeamLogo
                                    abbr={data.abbreviation}
                                    teamId={data.id}
                                    logoUrl={data.logoUrl}
                                    size="sm"
                                  />
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-100 leading-tight">
                                      {data.name}
                                    </h4>
                                    <span className="text-[10px] text-slate-400">
                                      {data.conference} · {data.division} · {data.wins}-{data.losses} ({data.winPct}%)
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-1.5 pt-1.5 border-t border-[#1E293B] text-[11px]">
                                  <div className="flex items-center justify-between text-slate-300">
                                    <span className="text-slate-400">{teamMetricX.shortLabel}:</span>
                                    <span className="font-mono font-bold text-orange-400">
                                      {formatScatterMetricValue(data.stats[teamMetricX.id], teamMetricX)}
                                      {teamMetricX.unit}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-slate-300">
                                    <span className="text-slate-400">{teamMetricY.shortLabel}:</span>
                                    <span className="font-mono font-bold text-sky-400">
                                      {formatScatterMetricValue(data.stats[teamMetricY.id], teamMetricY)}
                                      {teamMetricY.unit}
                                    </span>
                                  </div>
                                  {teamMetricSize && data.stats[teamMetricSize.id] !== null && (
                                    <div className="flex items-center justify-between text-slate-300">
                                      <span className="text-slate-400">Tamaño ({teamMetricSize.shortLabel}):</span>
                                      <span className="font-mono font-bold text-purple-400">
                                        {formatScatterMetricValue(data.stats[teamMetricSize.id], teamMetricSize)}
                                        {teamMetricSize.unit}
                                      </span>
                                    </div>
                                  )}
                                  {data.stats.netRtg !== null && data.stats.netRtg !== undefined && (
                                    <div className="flex items-center justify-between text-slate-300">
                                      <span className="text-slate-400">Net Rating:</span>
                                      <span className={`font-mono font-bold ${data.stats.netRtg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {data.stats.netRtg >= 0 ? `+${data.stats.netRtg.toFixed(1)}` : data.stats.netRtg.toFixed(1)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <p className="text-[10px] text-orange-400 font-sans italic pt-1 border-t border-[#1E293B]/60 text-center">
                                  Click para marcar/desmarcar · Doble click para abrir ficha
                                </p>
                              </div>
                            );
                          }}
                        />

                        <Scatter
                          data={filteredTeams}
                          shape={renderTeamScatterShape}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Quadrant Legend / Interpretive Guide */}
                  {TEAM_PRESETS.find((p) => p.id === teamPresetId)?.quadrants && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-[#1E293B] text-[11px]">
                      <div className="bg-[#0B1120]/70 border border-emerald-500/20 rounded-md p-2">
                        <span className="text-[10px] uppercase font-bold text-emerald-400 block truncate">
                          ↗ Cuadrante Superior Derecho
                        </span>
                        <span className="text-slate-300 font-medium line-clamp-2">
                          {TEAM_PRESETS.find((p) => p.id === teamPresetId)?.quadrants.tr}
                        </span>
                      </div>
                      <div className="bg-[#0B1120]/70 border border-sky-500/20 rounded-md p-2">
                        <span className="text-[10px] uppercase font-bold text-sky-400 block truncate">
                          ↖ Cuadrante Superior Izquierdo
                        </span>
                        <span className="text-slate-300 font-medium line-clamp-2">
                          {TEAM_PRESETS.find((p) => p.id === teamPresetId)?.quadrants.tl}
                        </span>
                      </div>
                      <div className="bg-[#0B1120]/70 border border-amber-500/20 rounded-md p-2">
                        <span className="text-[10px] uppercase font-bold text-amber-400 block truncate">
                          ↘ Cuadrante Inferior Derecho
                        </span>
                        <span className="text-slate-300 font-medium line-clamp-2">
                          {TEAM_PRESETS.find((p) => p.id === teamPresetId)?.quadrants.br}
                        </span>
                      </div>
                      <div className="bg-[#0B1120]/70 border border-rose-500/20 rounded-md p-2">
                        <span className="text-[10px] uppercase font-bold text-rose-400 block truncate">
                          ↙ Cuadrante Inferior Izquierdo
                        </span>
                        <span className="text-slate-300 font-medium line-clamp-2">
                          {TEAM_PRESETS.find((p) => p.id === teamPresetId)?.quadrants.bl}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Teams Table Sidebar */}
          <div className="space-y-3">
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3 flex flex-col h-full max-h-[640px]">
              <div className="flex items-center justify-between pb-2 border-b border-[#1E293B]">
                <span className="text-xs font-bold text-slate-200">
                  Franquicias ({teamChartMode === 'gaussian' ? teamGaussianSummary.ranked.length : filteredTeams.length})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {teamChartMode === 'gaussian' ? 'Z-Score · Percentil' : `Orden: ${teamMetricX.shortLabel}`}
                </span>
              </div>

              <div className="overflow-y-auto divide-y divide-[#1E293B]/60 flex-1 pr-1 mt-2">
                {teamChartMode === 'gaussian'
                  ? teamGaussianSummary.ranked.map((row, idx) => {
                      const t = row.team;
                      const isSelected = selectedTeamId === t.id;
                      const isHovered = hoveredGaussianId === t.id || isSelected;
                      return (
                        <div
                          key={t.id}
                          onMouseEnter={() => setHoveredGaussianId(t.id)}
                          onMouseLeave={() => setHoveredGaussianId(null)}
                          onClick={() => setSelectedTeamId((prev) => (prev === t.id ? null : t.id))}
                          onDoubleClick={() => onInspectEntity('team', t.id)}
                          title="Click para situar en la campana · Doble click para abrir ficha"
                          className={`flex items-center justify-between py-2 px-1.5 rounded-md cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-orange-500/15 ring-1 ring-orange-500/40'
                              : isHovered
                                ? 'bg-[#1E293B]'
                                : 'hover:bg-[#182338]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono tabular-nums text-slate-500 w-4 text-center">
                              {idx + 1}
                            </span>
                            <TeamLogo
                              abbr={t.abbreviation}
                              teamId={t.id}
                              logoUrl={t.logoUrl}
                              size="xs"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-slate-200 block truncate">
                                {t.shortName}
                              </span>
                              <span className="text-[10px] font-mono tabular-nums text-slate-400">
                                P{row.percentile} · {t.wins}-{t.losses}
                              </span>
                            </div>
                          </div>

                          <div className="text-right font-mono tabular-nums text-xs shrink-0 pl-2">
                            <div className="text-orange-400 font-bold">
                              {formatScatterMetricValue(row.value, teamMetricX)}
                              <span className="text-[9px] text-slate-400 font-sans ml-0.5">
                                {teamMetricX.unit}
                              </span>
                            </div>
                            <div className={`text-[11px] font-semibold ${getSigmaZoneTextClass(row.perfZ)}`}>
                              {formatSignedZ(row.perfZ)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  : filteredTeams
                      .slice()
                      .sort((a, b) => {
                        const valA = a.stats[teamMetricX.id] ?? 0;
                        const valB = b.stats[teamMetricX.id] ?? 0;
                        return teamMetricX.lowerIsBetter ? valA - valB : valB - valA;
                      })
                      .map((t, idx) => {
                        const isSelected = selectedTeamId === t.id;
                        const isHovered = hoveredEntity?.id === t.id || isSelected;
                        const valX = t.stats[teamMetricX.id];
                        const valY = t.stats[teamMetricY.id];

                        return (
                          <div
                            key={t.id}
                            onMouseEnter={() => {
                              setTooltipDismissed(false);
                              setHoveredEntity(t);
                            }}
                            onMouseLeave={() => setHoveredEntity(null)}
                            onClick={() => onInspectEntity('team', t.id)}
                            className={`flex items-center justify-between py-2 px-1.5 rounded-md cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-orange-500/15 ring-1 ring-orange-500/40'
                                : isHovered
                                  ? 'bg-[#1E293B]'
                                  : 'hover:bg-[#182338]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-mono text-slate-500 w-4 text-center">
                                {idx + 1}
                              </span>
                              <TeamLogo
                                abbr={t.abbreviation}
                                teamId={t.id}
                                logoUrl={t.logoUrl}
                                size="xs"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-semibold text-slate-200 block truncate">
                                  {t.shortName}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {t.wins}-{t.losses} ({t.winPct}%)
                                </span>
                              </div>
                            </div>

                            <div className="text-right font-mono text-xs shrink-0 pl-2">
                              <div className="text-orange-400 font-bold">
                                {formatScatterMetricValue(valX, teamMetricX)}
                                <span className="text-[9px] text-slate-400 font-sans ml-0.5">
                                  {teamMetricX.shortLabel}
                                </span>
                              </div>
                              <div className="text-sky-400 text-[11px]">
                                {formatScatterMetricValue(valY, teamMetricY)}
                                <span className="text-[9px] text-slate-400 font-sans ml-0.5">
                                  {teamMetricY.shortLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Players Scatter Plot & Gaussian Bell Curve View */}
      {activeTab === 'players' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-3">
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 min-h-[560px] flex flex-col justify-between relative">
              {/* Dual Axes / Gaussian Header Indicators Bar with Mode Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2 pb-2.5 border-b border-[#1E293B]">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Chart Mode Switcher: Dispersión 2D vs Campana de Gauss */}
                  <div
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0B1120] border border-[#1E293B] p-1 text-[11px]"
                    role="group"
                    aria-label="Tipo de gráfico para Jugadores"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPlayerChartMode('scatter');
                        setHoveredGaussianId(null);
                      }}
                      className={`min-h-[28px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 font-medium ${
                        playerChartMode === 'scatter'
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Dispersión 2D
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlayerChartMode('gaussian');
                        setHoveredEntity(null);
                        setTooltipDismissed(true);
                      }}
                      className={`min-h-[28px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 font-medium ${
                        playerChartMode === 'gaussian'
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Campana de Gauss
                    </button>
                  </div>

                  {playerChartMode === 'scatter' ? (
                    <>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1120] border border-sky-500/30 text-xs">
                        <span className="text-sky-400 font-bold uppercase text-[10px]">Eje Y:</span>
                        <span className="font-semibold text-slate-200">{playerMetricY.label}</span>
                        {playerMetricY.lowerIsBetter && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-semibold border border-emerald-500/30">
                            ⬆ Escala invertida (Menor es mejor)
                          </span>
                        )}
                        <MetricInfoButton
                          title={playerMetricY.label}
                          desc={playerMetricY.description}
                          interpretation={playerMetricY.interpretation}
                          unit={playerMetricY.unit}
                          lowerIsBetter={playerMetricY.lowerIsBetter}
                          align="left"
                          placement="bottom"
                        />
                      </div>

                      <span className="text-slate-500 text-xs font-bold">vs</span>

                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1120] border border-orange-500/30 text-xs">
                        <span className="text-orange-400 font-bold uppercase text-[10px]">Eje X:</span>
                        <span className="font-semibold text-slate-200">{playerMetricX.label}</span>
                        {playerMetricX.lowerIsBetter && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-semibold border border-emerald-500/30">
                            ➡ Invertido (Menor mejor)
                          </span>
                        )}
                        <MetricInfoButton
                          title={playerMetricX.label}
                          desc={playerMetricX.description}
                          interpretation={playerMetricX.interpretation}
                          unit={playerMetricX.unit}
                          lowerIsBetter={playerMetricX.lowerIsBetter}
                          align="left"
                          placement="bottom"
                        />
                      </div>

                      {/* Live Pearson r pill */}
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono font-semibold ${playerLivePearson.info.badgeColorClass}`}
                      >
                        <TrendingUp className="w-3 h-3" />
                        <span>
                          r = {playerLivePearson.r >= 0 ? `+${playerLivePearson.r.toFixed(2)}` : playerLivePearson.r.toFixed(2)}
                        </span>
                        <span className="font-sans text-[10px] opacity-90">
                          ({playerLivePearson.info.strengthLabel} · n={playerLivePearson.n})
                        </span>
                        <MetricInfoButton
                          title={`Correlación de Pearson (r = ${playerLivePearson.r.toFixed(2)})`}
                          desc="Mide la fuerza y dirección de la relación lineal entre los dos ejes (-1.00 a +1.00) sobre los jugadores visibles en pantalla."
                          interpretation={playerLivePearson.info.summaryText}
                          align="left"
                          placement="bottom"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1120] border border-sky-500/30 text-xs">
                        <span className="text-sky-400 font-bold uppercase text-[10px]">Distribución:</span>
                        <span className="font-semibold text-slate-200">{playerMetricX.label}</span>
                        {playerMetricX.lowerIsBetter && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-semibold border border-emerald-500/30">
                            Menor es mejor
                          </span>
                        )}
                        <MetricInfoButton
                          title={`Campana de Gauss · ${playerMetricX.label}`}
                          desc={playerMetricX.description}
                          interpretation="Muestra la distribución normal de los jugadores cualificados (media μ, ±1σ, ±2σ), el histograma empírico y el Z-Score individual."
                          unit={playerMetricX.unit}
                          lowerIsBetter={playerMetricX.lowerIsBetter}
                          align="left"
                          placement="bottom"
                        />
                      </div>
                      {playerMetricX.id !== playerMetricY.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setPlayerMetricXId(playerMetricY.id);
                            setPlayerMetricYId(playerMetricX.id);
                            setHoveredGaussianId(null);
                          }}
                          title={`Ver ${playerMetricY.shortLabel} en la Campana de Gauss`}
                          className="min-h-[28px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] hover:border-sky-500/40 text-[11px] text-slate-300 hover:text-sky-300 transition-colors whitespace-nowrap shrink-0"
                        >
                          <ArrowLeftRight className="w-3 h-3 text-sky-400" />
                          <span>Ver {playerMetricY.shortLabel}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {hasPlayerFilterSelection && (
                    <div
                      className="inline-flex items-center gap-1 rounded-lg bg-[#0B1120] border border-[#1E293B] p-1 text-[11px]"
                      role="group"
                      aria-label="Ámbito de la media de los ejes (Jugadores)"
                    >
                      <button
                        type="button"
                        onClick={() => setPlayerMeanScope('league')}
                        className={`min-h-[28px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                          effectivePlayerMeanScope === 'league'
                            ? 'bg-orange-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Toda la liga (26-27)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlayerMeanScope('filtered')}
                        disabled={(playerChartMode === 'gaussian' ? gaussianPlayers.length : filteredPlayers.length) === 0}
                        className={`min-h-[28px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                          effectivePlayerMeanScope === 'filtered'
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Seleccionados ({playerChartMode === 'gaussian' ? gaussianPlayers.length : filteredPlayers.length})
                      </button>
                    </div>
                  )}
                  {playerChartMode === 'scatter' && (
                    <span className="text-[11px] font-mono text-slate-400">
                      Muestra: {filteredPlayers.length} jugadores ·{' '}
                      {effectivePlayerMeanScope === 'filtered'
                        ? 'Media Sel.'
                        : 'Media NBA (26-27)'}
                      : X={formatScatterMetricValue(playerMeanX, playerMetricX)}
                      {playerMetricX.unit} · Y={formatScatterMetricValue(playerMeanY, playerMetricY)}
                      {playerMetricY.unit}
                    </span>
                  )}
                  <ExportImageButton
                    onBuildImage={() =>
                      playerChartMode === 'gaussian'
                        ? buildTableSnapshotBlob({
                            filename: `RadarNBA-Jugadores-Gauss-${playerMetricX.shortLabel}`,
                            categoryTag: 'CAMPANA DE GAUSS · JUGADORES NBA',
                            title: `Distribución Normal: ${playerMetricX.shortLabel}`,
                            subtitle: `${playerGaussianSummary.ranked.length} jugadores · Media μ=${formatScatterMetricValue(playerGaussianSummary.mu, playerMetricX)}${playerMetricX.unit} · σ=±${formatScatterMetricValue(playerGaussianSummary.sigma, playerMetricX)}`,
                            entityColumnLabel: 'JUGADOR',
                            columns: [
                              { key: 'team', label: 'EQUIPO', align: 'left', widthWeight: 1 },
                              { key: 'val', label: playerMetricX.shortLabel, align: 'right', widthWeight: 1.2 },
                              { key: 'z', label: 'Z-SCORE', align: 'right', widthWeight: 1.1 },
                              { key: 'pct', label: 'PERCENTIL', align: 'right', widthWeight: 1.1 },
                              { key: 'min', label: 'MIN/PJ', align: 'right', widthWeight: 0.9 },
                            ],
                            rows: playerGaussianSummary.ranked.slice(0, 15).map((row, idx) => ({
                              rank: idx + 1,
                              teamAbbr: row.player.teamAbbr,
                              entityName: row.player.name,
                              entitySubtext: `${row.player.teamAbbr} · ${row.player.position}`,
                              cells: {
                                team: row.player.teamAbbr,
                                val: `${formatScatterMetricValue(row.value, playerMetricX)}${playerMetricX.unit}`,
                                z: formatSignedZ(row.perfZ),
                                pct: `P${row.percentile}`,
                                min: String(row.player.minAvg),
                              },
                            })),
                          })
                        : buildTableSnapshotBlob({
                            filename: `RadarNBA-Jugadores-${playerMetricY.shortLabel}-vs-${playerMetricX.shortLabel}`,
                            categoryTag: 'EXPLORADOR ANALÍTICO · JUGADORES NBA',
                            title: `${playerMetricY.shortLabel} vs ${playerMetricX.shortLabel}`,
                            subtitle: `${filteredPlayers.length} jugadores · Ejes: ${playerMetricY.label} vs ${playerMetricX.label}`,
                            entityColumnLabel: 'JUGADOR',
                            columns: [
                              { key: 'team', label: 'EQUIPO', align: 'left', widthWeight: 1 },
                              { key: 'pos', label: 'POS', align: 'left', widthWeight: 0.8 },
                              { key: 'valX', label: playerMetricX.shortLabel, align: 'right', widthWeight: 1.2 },
                              { key: 'valY', label: playerMetricY.shortLabel, align: 'right', widthWeight: 1.2 },
                              { key: 'min', label: 'MIN/PJ', align: 'right', widthWeight: 1 },
                            ],
                            rows: filteredPlayers.slice(0, 15).map((p, idx) => ({
                              rank: idx + 1,
                              teamAbbr: p.teamAbbr,
                              entityName: p.name,
                              entitySubtext: `${p.teamAbbr} · ${p.position}`,
                              cells: {
                                team: p.teamAbbr,
                                pos: p.position,
                                valX: formatScatterMetricValue(p.x, playerMetricX),
                                valY: formatScatterMetricValue(p.y, playerMetricY),
                                min: String(p.minAvg),
                              },
                            })),
                          })
                    }
                    label="Exportar PNG"
                  />
                </div>
              </div>

              {playerChartMode === 'gaussian' ? (
                <GaussianDistributionChart
                  scope="players"
                  metric={playerMetricX}
                  entities={playerGaussianSummary.points}
                  referenceValues={playerGaussianReferenceValues}
                  meanScope={effectivePlayerMeanScope}
                  selectedId={selectedPlayerId}
                  hoveredId={hoveredGaussianId}
                  onSelectId={setSelectedPlayerId}
                  onHoverId={setHoveredGaussianId}
                  onInspectEntity={(id) => onInspectEntity('player', id)}
                />
              ) : (
                <>
                  {/* Selected Player Bar (Mark / Unmark / Open) */}
                  {selectedPlayer && (
                    <div className="mb-2.5 px-3 py-2 bg-[#0B1120] border border-orange-500/40 rounded-lg flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatar
                          playerId={selectedPlayer.id}
                          name={selectedPlayer.name}
                          teamAbbr={selectedPlayer.teamAbbr}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-100 truncate block">
                            {selectedPlayer.name} · {selectedPlayer.teamAbbr} ({selectedPlayer.position})
                          </span>
                          <span className="text-[11px] font-mono text-slate-300">
                            {playerMetricX.shortLabel}:{' '}
                            <strong className="text-orange-400">
                              {formatScatterMetricValue(selectedPlayer.x, playerMetricX)}
                              {playerMetricX.unit}
                            </strong>
                            {' · '}
                            {playerMetricY.shortLabel}:{' '}
                            <strong className="text-sky-400">
                              {formatScatterMetricValue(selectedPlayer.y, playerMetricY)}
                              {playerMetricY.unit}
                            </strong>
                            {playerMetricSize && selectedPlayer.size !== null && (
                              <>
                                {' · '}
                                {playerMetricSize.shortLabel}:{' '}
                                <strong className="text-purple-400">
                                  {formatScatterMetricValue(selectedPlayer.size, playerMetricSize)}
                                  {playerMetricSize.unit}
                                </strong>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onInspectEntity('player', selectedPlayer.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-md hover:bg-orange-400 transition-colors whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Abrir ficha</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlayerId(null);
                            setHoveredEntity(null);
                            setTooltipDismissed(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors whitespace-nowrap"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Desmarcar</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Recharts Scatter Chart with Official Franchise Colors */}
                  <div
                    id="players-scatter-container"
                    className="w-full h-[460px] bg-[#0E1626]/40 rounded-lg p-2"
                    onClick={() => {
                      setSelectedPlayerId(null);
                      setHoveredEntity(null);
                      setTooltipDismissed(true);
                    }}
                    onMouseMove={() => {
                      if (tooltipDismissed) setTooltipDismissed(false);
                    }}
                    onMouseLeave={() => setHoveredEntity(null)}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 28, right: 24, bottom: 45, left: 45 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.7} />

                        <XAxis
                          type="number"
                          dataKey="x"
                          name={playerMetricX.shortLabel}
                          unit={playerMetricX.unit}
                          stroke="#94A3B8"
                          fontSize={11}
                          tickLine={false}
                          domain={['auto', 'auto']}
                          reversed={Boolean(playerMetricX.lowerIsBetter)}
                          label={{
                            value: `${playerMetricX.label} ${playerMetricX.lowerIsBetter ? '(Menor = Mejor)' : ''}`,
                            position: 'insideBottom',
                            offset: -12,
                            fill: '#CBD5E1',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        />

                        <YAxis
                          type="number"
                          dataKey="y"
                          name={playerMetricY.shortLabel}
                          unit={playerMetricY.unit}
                          stroke="#94A3B8"
                          fontSize={11}
                          tickLine={false}
                          domain={['auto', 'auto']}
                          reversed={Boolean(playerMetricY.lowerIsBetter)}
                          label={{
                            value: `${playerMetricY.shortLabel}${playerMetricY.unit ? ` (${playerMetricY.unit.trim()})` : ''} ${playerMetricY.lowerIsBetter ? '⬇' : ''}`,
                            angle: -90,
                            position: 'insideLeft',
                            offset: 15,
                            fill: '#CBD5E1',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        />

                        <ZAxis type="number" dataKey="bubbleRadius" range={[40, 560]} />

                        <ReferenceLine
                          x={playerMeanX}
                          ifOverflow="extendDomain"
                          stroke="#F97316"
                          strokeDasharray="4 4"
                          strokeOpacity={0.7}
                          strokeWidth={1.5}
                          label={renderMeanReferenceLabel(
                            'x',
                            effectivePlayerMeanScope === 'filtered'
                              ? `Media Sel. X: ${formatScatterMetricValue(playerMeanX, playerMetricX)}${playerMetricX.unit}`
                              : `Media NBA X: ${formatScatterMetricValue(playerMeanX, playerMetricX)}${playerMetricX.unit}`,
                            '#F97316',
                            '#FDBA74'
                          )}
                        />
                        <ReferenceLine
                          y={playerMeanY}
                          ifOverflow="extendDomain"
                          stroke="#38BDF8"
                          strokeDasharray="4 4"
                          strokeOpacity={0.7}
                          strokeWidth={1.5}
                          label={renderMeanReferenceLabel(
                            'y',
                            effectivePlayerMeanScope === 'filtered'
                              ? `Media Sel. Y: ${formatScatterMetricValue(playerMeanY, playerMetricY)}${playerMetricY.unit}`
                              : `Media NBA Y: ${formatScatterMetricValue(playerMeanY, playerMetricY)}${playerMetricY.unit}`,
                            '#38BDF8',
                            '#7DD3FC'
                          )}
                        />

                        <Tooltip
                          active={tooltipDismissed ? false : undefined}
                          content={({ payload }) => {
                            if (!payload || payload.length === 0) return null;
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 shadow-2xl z-30 min-w-56 space-y-2">
                                <div className="flex items-center gap-2.5">
                                  <PlayerAvatar
                                    playerId={data.id}
                                    name={data.name}
                                    teamAbbr={data.teamAbbr}
                                    size="sm"
                                  />
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-100 leading-tight">
                                      {data.name}
                                    </h4>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <TeamLogo abbr={data.teamAbbr} size="xs" />
                                      <span className="text-[10px] text-slate-400">
                                        {data.teamAbbr} · {data.position} · {data.minAvg} min
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-1.5 pt-1.5 border-t border-[#1E293B] text-[11px]">
                                  <div className="flex items-center justify-between text-slate-300">
                                    <span className="text-slate-400">{playerMetricX.shortLabel}:</span>
                                    <span className="font-mono font-bold text-orange-400">
                                      {formatScatterMetricValue(data.x, playerMetricX)}
                                      {playerMetricX.unit}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-slate-300">
                                    <span className="text-slate-400">{playerMetricY.shortLabel}:</span>
                                    <span className="font-mono font-bold text-sky-400">
                                      {formatScatterMetricValue(data.y, playerMetricY)}
                                      {playerMetricY.unit}
                                    </span>
                                  </div>
                                  {playerMetricSize && data.size !== null && (
                                    <div className="flex items-center justify-between text-slate-300">
                                      <span className="text-slate-400">Tamaño ({playerMetricSize.shortLabel}):</span>
                                      <span className="font-mono font-bold text-purple-400">
                                        {formatScatterMetricValue(data.size, playerMetricSize)}
                                        {playerMetricSize.unit}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <p className="text-[10px] text-orange-400 font-sans italic pt-1 border-t border-[#1E293B]/60 text-center">
                                  Click para marcar/desmarcar · Doble click para abrir ficha
                                </p>
                              </div>
                            );
                          }}
                        />

                        <Scatter
                          data={filteredPlayers}
                          shape={renderPlayerScatterShape}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Player Quadrants Guide */}
                  {PLAYER_PRESETS.find((p) => p.id === playerPresetId)?.quadrants && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-[#1E293B] text-[11px]">
                      <div className="bg-[#0B1120]/70 border border-emerald-500/20 rounded-md p-2">
                        <span className="text-[10px] uppercase font-bold text-emerald-400 block truncate">
                          ↗ Cuadrante Superior
                        </span>
                        <span className="text-slate-300 font-medium line-clamp-1">
                          {PLAYER_PRESETS.find((p) => p.id === playerPresetId)?.quadrants.tr}
                        </span>
                      </div>
                      <div className="bg-[#0B1120]/70 border border-sky-500/20 rounded-md p-2">
                        <span className="text-[10px] uppercase font-bold text-sky-400 block truncate">
                          ↖ Cuadrante Superior Izq.
                        </span>
                        <span className="text-slate-300 font-medium line-clamp-1">
                          {PLAYER_PRESETS.find((p) => p.id === playerPresetId)?.quadrants.tl}
                        </span>
                      </div>
                      <div className="bg-[#0B1120]/70 border border-amber-500/20 rounded-md p-2">
                        <span className="text-[10px] uppercase font-bold text-amber-400 block truncate">
                          ↘ Cuadrante Inferior Der.
                        </span>
                        <span className="text-slate-300 font-medium line-clamp-1">
                          {PLAYER_PRESETS.find((p) => p.id === playerPresetId)?.quadrants.br}
                        </span>
                      </div>
                      <div className="bg-[#0B1120]/70 border border-rose-500/20 rounded-md p-2">
                        <span className="text-[10px] uppercase font-bold text-rose-400 block truncate">
                          ↙ Cuadrante Inferior Izq.
                        </span>
                        <span className="text-slate-300 font-medium line-clamp-1">
                          {PLAYER_PRESETS.find((p) => p.id === playerPresetId)?.quadrants.bl}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Players Table Sidebar */}
          <div className="space-y-3">
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3 flex flex-col h-full max-h-[640px]">
              <div className="flex items-center justify-between pb-2 border-b border-[#1E293B]">
                <span className="text-xs font-bold text-slate-200">
                  Líderes ({playerChartMode === 'gaussian' ? playerGaussianSummary.ranked.length : filteredPlayers.length})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {playerChartMode === 'gaussian' ? 'Z-Score · Percentil' : `Orden: ${playerMetricX.shortLabel}`}
                </span>
              </div>

              <div className="overflow-y-auto divide-y divide-[#1E293B]/60 flex-1 pr-1 mt-2">
                {playerChartMode === 'gaussian'
                  ? playerGaussianSummary.ranked.slice(0, 60).map((row, idx) => {
                      const p = row.player;
                      const isSelected = selectedPlayerId === p.id;
                      const isHovered = hoveredGaussianId === p.id || isSelected;
                      return (
                        <div
                          key={p.id}
                          onMouseEnter={() => setHoveredGaussianId(p.id)}
                          onMouseLeave={() => setHoveredGaussianId(null)}
                          onClick={() => setSelectedPlayerId((prev) => (prev === p.id ? null : p.id))}
                          onDoubleClick={() => onInspectEntity('player', p.id)}
                          title="Click para situar en la campana · Doble click para abrir ficha"
                          className={`flex items-center justify-between py-2 px-1.5 rounded-md cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-orange-500/15 ring-1 ring-orange-500/40'
                              : isHovered
                                ? 'bg-[#1E293B]'
                                : 'hover:bg-[#182338]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono tabular-nums text-slate-500 w-4 text-center">
                              {idx + 1}
                            </span>
                            <PlayerAvatar
                              playerId={p.id}
                              name={p.name}
                              headshotUrl={p.headshotUrl}
                              teamAbbr={p.teamAbbr}
                              size="xs"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-slate-200 block truncate">
                                {p.name}
                              </span>
                              <span className="text-[10px] font-mono tabular-nums text-slate-400">
                                P{row.percentile} · {p.teamAbbr} · {p.position}
                              </span>
                            </div>
                          </div>

                          <div className="text-right font-mono tabular-nums text-xs shrink-0 pl-2">
                            <div className="text-orange-400 font-bold">
                              {formatScatterMetricValue(row.value, playerMetricX)}
                              <span className="text-[9px] text-slate-400 font-sans ml-0.5">
                                {playerMetricX.unit}
                              </span>
                            </div>
                            <div className={`text-[11px] font-semibold ${getSigmaZoneTextClass(row.perfZ)}`}>
                              {formatSignedZ(row.perfZ)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  : filteredPlayers
                      .slice()
                      .sort((a, b) => (playerMetricX.lowerIsBetter ? a.x - b.x : b.x - a.x))
                      .slice(0, 50)
                      .map((p, idx) => {
                        const isSelected = selectedPlayerId === p.id;
                        const isHovered = hoveredEntity?.id === p.id || isSelected;
                        return (
                          <div
                            key={p.id}
                            onMouseEnter={() => {
                              setTooltipDismissed(false);
                              setHoveredEntity(p);
                            }}
                            onMouseLeave={() => setHoveredEntity(null)}
                            onClick={() => onInspectEntity('player', p.id)}
                            className={`flex items-center justify-between py-2 px-1.5 rounded-md cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-orange-500/15 ring-1 ring-orange-500/40'
                                : isHovered
                                  ? 'bg-[#1E293B]'
                                  : 'hover:bg-[#182338]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-mono text-slate-500 w-4 text-center">
                                {idx + 1}
                              </span>
                              <PlayerAvatar
                                playerId={p.id}
                                name={p.name}
                                headshotUrl={p.item.headshotUrl}
                                teamAbbr={p.teamAbbr}
                                size="xs"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-semibold text-slate-200 block truncate">
                                  {p.name}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {p.teamAbbr} · {p.position}
                                </span>
                              </div>
                            </div>

                            <div className="text-right font-mono text-xs shrink-0 pl-2">
                              <div className="text-orange-400 font-bold">
                                {formatScatterMetricValue(p.x, playerMetricX)}
                                <span className="text-[9px] text-slate-400 font-sans ml-0.5">
                                  {playerMetricX.shortLabel}
                                </span>
                              </div>
                              <div className="text-sky-400 text-[11px]">
                                {formatScatterMetricValue(p.y, playerMetricY)}
                                <span className="text-[9px] text-slate-400 font-sans ml-0.5">
                                  {playerMetricY.shortLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Tab 3: Expanded Multi-Scope 10-Layer Correlation Matrix View */}
      {activeTab === 'correlation' && correlationData && (
        <div className="space-y-4">
          {/* Controls Header: Scope (Teams vs Players) + Pack Selector (10 Layers) + Target Metric */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-400" />
                  Matriz de Correlaciones Multicapa (10 Capas NBA.com)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Explora qué estadísticas están más conectadas matemáticamente entre sí. Haz click en cualquier celda o pareja destacada para abrirla en el gráfico 2D.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Scope switcher: Teams vs Players */}
                <div className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setCorrScope('teams');
                      setCorrTargetMetricId('winPct');
                    }}
                    className={`min-h-[28px] px-3 py-1 rounded-md font-semibold transition-colors ${
                      corrScope === 'teams'
                        ? 'bg-orange-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Equipos NBA (30)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCorrScope('players');
                      setCorrTargetMetricId('gameScore');
                    }}
                    className={`min-h-[28px] px-3 py-1 rounded-md font-semibold transition-colors ${
                      corrScope === 'players'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Jugadores NBA
                  </button>
                </div>

                {/* Target metric selector for ranking */}
                <div className="h-9 flex items-center gap-1.5 bg-[#0B1120] border border-[#1E293B] rounded-md px-2.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Comparar vs:
                  </span>
                  <select
                    value={corrTargetMetricId}
                    onChange={(e) => setCorrTargetMetricId(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-orange-300 focus:outline-none"
                  >
                    {(corrScope === 'teams'
                      ? [
                          { id: 'winPct', label: '% Victorias' },
                          { id: 'netRtg', label: 'NetRtg' },
                          { id: 'offRtg', label: 'OffRtg' },
                          { id: 'defRtg', label: 'DefRtg' },
                          { id: 'clWPct', label: '%V Clutch' },
                        ]
                      : [
                          { id: 'gameScore', label: 'Game Score (GmSc)' },
                          { id: 'points', label: 'Puntos (PTS)' },
                          { id: 'pie', label: 'PIE% Impacto' },
                          { id: 'tsPct', label: 'TS% Eficiencia' },
                          { id: 'netRtg', label: 'NetRtg (Impacto Neto)' },
                          { id: 'plusMinus', label: '+/- en pista' },
                        ]
                    ).map((opt) => (
                      <option key={opt.id} value={opt.id} className="bg-[#0B1120] text-slate-200">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 4 Thematic Matrix Packs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-[#1E293B]">
              {correlationData.packs.map((pack) => {
                const isActive = correlationData.activePack.id === pack.id;
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setCorrPackId(pack.id)}
                    className={`p-2.5 text-left rounded-lg border transition-all text-xs ${
                      isActive
                        ? 'bg-orange-500/15 border-orange-500/60 text-orange-200'
                        : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:bg-[#182338]'
                    }`}
                  >
                    <span className="font-bold block truncate text-slate-100">{pack.label}</span>
                    <span className="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-tight">
                      {pack.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top 3 Auto-Discovered High-Correlation Pairs in Active Pack */}
          {correlationData.topStrongestPairs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {correlationData.topStrongestPairs.map((pair, idx) => (
                <button
                  key={`${pair.idA}-${pair.idB}`}
                  type="button"
                  onClick={() => {
                    if (correlationData.isPlayers) {
                      setPlayerMetricXId(pair.idA);
                      setPlayerMetricYId(pair.idB);
                      setPlayerPresetId('custom');
                      setPlayerChartMode('scatter');
                      setActiveTab('players');
                    } else {
                      setTeamMetricXId(pair.idA);
                      setTeamMetricYId(pair.idB);
                      setTeamPresetId('custom');
                      setTeamChartMode('scatter');
                      setActiveTab('teams');
                    }
                  }}
                  className="bg-[#131C2E] hover:bg-[#182338] border border-emerald-500/30 hover:border-emerald-400/60 rounded-lg p-3.5 text-left transition-all space-y-1.5 group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                      #{idx + 1} Correlación más fuerte del bloque
                    </span>
                    <span
                      className={`font-mono text-xs font-bold ${
                        pair.r >= 0 ? 'text-emerald-300' : 'text-sky-300'
                      }`}
                    >
                      r = {pair.r >= 0 ? `+${pair.r.toFixed(2)}` : pair.r.toFixed(2)}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-100 group-hover:text-orange-300 transition-colors">
                    {pair.labelA} vs {pair.labelB}
                  </h4>
                  <p className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Click para abrir dispersión 2D</span>
                    <span className="font-mono">n = {pair.n}</span>
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Ranking of Factors Most Correlated with Target Metric */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Métricas Más Correlacionadas con {correlationData.targetDef.shortLabel}
                </h3>
                <p className="text-xs text-slate-400">
                  Coeficiente de Pearson (r) · Haz click en cualquier barra para graficar esa métrica vs {correlationData.targetDef.shortLabel}
                </p>
              </div>
              <span className="text-[11px] font-mono text-orange-400">
                Muestra: {correlationData.sampleCount}{' '}
                {correlationData.isPlayers ? 'jugadores cualificados' : 'franquicias'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {correlationData.targetRanking.map((factor) => {
                const isPositiveEffect = factor.effectiveImpact >= 0;
                const barWidth = Math.min(100, Math.round(factor.absR * 100));

                return (
                  <button
                    key={factor.id}
                    type="button"
                    onClick={() => {
                      if (correlationData.isPlayers) {
                        setPlayerMetricXId(factor.id);
                        setPlayerMetricYId(correlationData.targetDef.id);
                        setPlayerPresetId('custom');
                        setPlayerChartMode('scatter');
                        setActiveTab('players');
                      } else {
                        setTeamMetricXId(factor.id);
                        setTeamMetricYId(correlationData.targetDef.id);
                        setTeamPresetId('custom');
                        setTeamChartMode('scatter');
                        setActiveTab('teams');
                      }
                    }}
                    className="p-2.5 bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] hover:border-orange-500/40 rounded-lg space-y-1.5 text-left transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-slate-200 truncate">{factor.label}</span>
                        {factor.lowerIsBetter && (
                          <span className="text-[10px] text-emerald-400 font-mono shrink-0">
                            (Menor mejor)
                          </span>
                        )}
                      </div>
                      <span
                        className={`font-mono font-bold shrink-0 ${
                          isPositiveEffect ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        r = {factor.rawR >= 0 ? `+${factor.rawR.toFixed(2)}` : factor.rawR.toFixed(2)}
                      </span>
                    </div>

                    <div className="w-full bg-[#1E293B] h-1.5 rounded overflow-hidden">
                      <div
                        className={`h-full rounded transition-all duration-300 ${
                          isPositiveEffect ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 gap-2">
                      <span className="truncate">{factor.desc}</span>
                      <span className="font-mono shrink-0">Fuerza: {barWidth}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Full N x N Pearson Correlation Heatmap Matrix */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Matriz Cruzada de Correlaciones ({correlationData.keyMetrics.length}×{correlationData.keyMetrics.length}) · {correlationData.activePack.label}
                </h3>
                <p className="text-xs text-slate-400">
                  Haz click en cualquier celda para cargar automáticamente ese par de métricas en el gráfico de{' '}
                  {correlationData.isPlayers ? 'jugadores' : 'equipos'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Positiva (+1.0)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-slate-700 inline-block" /> Neutra (0.0)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" /> Negativa (-1.0)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono text-center border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B]">
                    <th className="p-2 text-left text-slate-400 font-sans sticky left-0 bg-[#131C2E] z-10">
                      Métrica
                    </th>
                    {correlationData.keyMetrics.map((m) => (
                      <th
                        key={m.id}
                        title={m.fullLabel}
                        className="p-1.5 text-slate-300 font-semibold whitespace-nowrap"
                      >
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/50">
                  {correlationData.matrix.map((row) => (
                    <tr key={row.metricA.id} className="hover:bg-[#182338]/40">
                      <td
                        title={row.metricA.fullLabel}
                        className="p-1.5 text-left font-sans font-bold text-slate-300 whitespace-nowrap sticky left-0 bg-[#131C2E] z-10 border-r border-[#1E293B]/60"
                      >
                        {row.metricA.label}
                        {row.metricA.lowerIsBetter && (
                          <span className="text-[10px] text-emerald-400 font-normal ml-1">⬇</span>
                        )}
                      </td>
                      {correlationData.keyMetrics.map((col) => {
                        const r = row.correlations[col.id] ?? 0;
                        const isSelf = row.metricA.id === col.id;

                        let bgClass = 'bg-slate-800/30 text-slate-400';
                        if (!isSelf) {
                          if (r >= 0.6) bgClass = 'bg-emerald-500/30 text-emerald-300 font-bold';
                          else if (r >= 0.3) bgClass = 'bg-emerald-500/15 text-emerald-400';
                          else if (r <= -0.6) bgClass = 'bg-rose-500/30 text-rose-300 font-bold';
                          else if (r <= -0.3) bgClass = 'bg-rose-500/15 text-rose-400';
                          else bgClass = 'bg-[#0B1120] text-slate-400';
                        } else {
                          bgClass = 'bg-orange-500/20 text-orange-400 font-bold';
                        }

                        return (
                          <td
                            key={col.id}
                            onClick={() => {
                              if (!isSelf) {
                                if (correlationData.isPlayers) {
                                  setPlayerMetricXId(col.id);
                                  setPlayerMetricYId(row.metricA.id);
                                  setPlayerPresetId('custom');
                                  setPlayerChartMode('scatter');
                                  setActiveTab('players');
                                } else {
                                  setTeamMetricXId(col.id);
                                  setTeamMetricYId(row.metricA.id);
                                  setTeamPresetId('custom');
                                  setTeamChartMode('scatter');
                                  setActiveTab('teams');
                                }
                              }
                            }}
                            title={`Graficar ${row.metricA.label} vs ${col.label} (r = ${r.toFixed(2)})`}
                            className={`p-1.5 transition-transform cursor-pointer hover:scale-105 border border-[#1E293B]/30 ${bgClass}`}
                          >
                            {isSelf ? '1.0' : r.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
