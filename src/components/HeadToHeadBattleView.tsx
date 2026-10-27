import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Plus,
  Search,
  Shuffle,
  Sliders,
  Star,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import type {
  ExperienceMode,
  PlayerGameLog,
  PlayerSummary,
  SearchPlayerResult,
  SeasonMode,
  WindowSize,
} from '../types/nba';
import {
  formatSigned,
  mean,
  normalizeSearchText,
  round1,
} from '../utils/analytics';
import {
  qualifyUsageRole,
  type LeagueBenchmarks,
} from '../utils/humanize';
import { ColumnHelpHeader, MetricInfoTooltip } from './MetricUiHelpers';

interface HeadToHeadBattleViewProps {
  players: PlayerSummary[];
  experienceMode: ExperienceMode;
  benchmarks: LeagueBenchmarks;
  seasonMode: SeasonMode;
  onChangeSeasonMode: (mode: SeasonMode) => void;
  windowSize: WindowSize;
  onChangeWindowSize: (size: WindowSize) => void;
  watchlistIds: Set<string>;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onAddExternalPlayer: (item: SearchPlayerResult) => Promise<PlayerSummary | null>;
  onSwitchToAdvanced: () => void;
  initialPlayerAId?: string;
  initialPlayerBId?: string;
  allPlayersLoaded: boolean;
  loadingAllPlayers: boolean;
  totalLeaguePlayersAvailable: number;
  onLoadAllPlayers: () => void;
}

type BattleSampleScope = 'season' | 'recent' | 'home' | 'away';
type CategoryFilterTab = 'all' | 'basic' | 'advanced';

interface ComputedPlayerBattleStats {
  gamesCount: number;
  min: number;
  pts: number;
  reb: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  stocks: number;
  fg3m: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
  tov: number;
  pra: number;
  plusMinus: number;
  tsPct: number;
  efgPct: number;
  usgPct: number;
  astTo: number;
  gmSc: number;
  pie: number | null;
  defRtg: number | null;
  ptsPaint: number | null;
  deflections: number | null;
  contestedShots: number | null;
  hustleActions: number | null;
}

interface RadarAxisResult {
  key:
    | 'scoring'
    | 'efficiency'
    | 'playmaking'
    | 'impact'
    | 'defense'
    | 'rebounding';
  label: string;
  shortLabel: string;
  helpKey: string;
  scoreA: number;
  scoreB: number;
  rawTextA: string;
  rawTextB: string;
  winner: 'A' | 'B' | 'tie';
}

interface BattleCategoryRow {
  id: string;
  label: string;
  simpleLabel: string;
  shortUnit: string;
  helpKey: string;
  group: 'basic' | 'advanced';
  valA: number;
  valB: number;
  decimals: number;
  suffix?: string;
  signed?: boolean;
  lowerIsBetter?: boolean;
  tieEpsilon: number;
  winner: 'A' | 'B' | 'tie';
  advantageAbs: number;
  shareA: number; // 8..92 percentage visual share for Player A
}

// Empirical NBA Rotation Baselines (349 rotation players >= 15 MIN, >= 20 GP)
// so radar scores have exact mean = 50 and unit variance (SD = 1) across the league.
const NBA_ROTATION_RADAR_BASELINES = {
  pts: { mean: 12.2, sd: 5.9 },
  ppm: { mean: 0.47, sd: 0.14 },
  tsPct: { mean: 58.0, sd: 4.5 },
  usgPct: { mean: 19.1, sd: 5.3 },
  ast: { mean: 2.82, sd: 1.78 },
  astTo: { mean: 1.98, sd: 0.74 },
  gmSc: { mean: 9.88, sd: 4.6 },
  pm: { mean: 0.0, sd: 3.71 },
  pie: { mean: 9.91, sd: 3.0 },
  stocks: { mean: 1.35, sd: 0.56 },
  stocks36: { mean: 1.92, sd: 0.76 },
  defRtg: { mean: 113.4, sd: 4.3 },
  deflections: { mean: 1.82, sd: 0.73 },
  contested: { mean: 4.18, sd: 2.0 },
  reb: { mean: 4.46, sd: 2.2 },
  oreb: { mean: 1.14, sd: 0.82 },
} as const;

function clampNum(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

function zToBattleRating(z: number): number {
  return Math.round(Math.max(25, Math.min(99, 50 + z * 18)));
}

// Position-fair Overall Radar Rating (0-99):
// 55% Top 3 archetype axes (22% + 18% + 15%) + 25% Impact axis + 20% remaining 3 axes.
// Preserves 50 = exact NBA rotation average while preventing a guard's rebounding
// (or a center's perimeter steals) from artificially dragging an MVP down to the 60s.
function computeOverallRadarRating(
  axisScores: number[],
  impactScore: number
): number {
  if (axisScores.length < 6) return 25;
  const sorted = [...axisScores].sort((a, b) => b - a);
  const top3Part =
    0.22 * sorted[0] + 0.18 * sorted[1] + 0.15 * sorted[2];
  const impactPart = 0.25 * impactScore;
  const restAvg = (sorted[3] + sorted[4] + sorted[5]) / 3;
  const restPart = 0.2 * restAvg;
  return Math.round(
    Math.max(25, Math.min(99, top3Part + impactPart + restPart))
  );
}

function ratingTierLabel(score: number): {
  label: string;
  textClass: string;
} {
  if (score >= 90) return { label: 'Superestrella / MVP', textClass: 'text-emerald-400' };
  if (score >= 78) return { label: 'All-Star / Titular Top', textClass: 'text-orange-300' };
  if (score >= 50) return { label: 'Rotación sólida NBA', textClass: 'text-slate-300' };
  return { label: 'Rotación / Apoyo', textClass: 'text-slate-400' };
}

function sliceGamesForBattle(
  games: PlayerGameLog[],
  scope: BattleSampleScope,
  windowSize: WindowSize
): PlayerGameLog[] {
  if (scope === 'recent') {
    return games.slice(0, Math.min(windowSize, games.length));
  }
  if (scope === 'home') {
    return games.filter((g) => g.isHome);
  }
  if (scope === 'away') {
    return games.filter((g) => !g.isHome);
  }
  return games;
}

function computeBattleStats(
  player: PlayerSummary | undefined,
  scope: BattleSampleScope,
  windowSize: WindowSize
): ComputedPlayerBattleStats {
  if (!player) {
    return {
      gamesCount: 0,
      min: 0,
      pts: 0,
      reb: 0,
      oreb: 0,
      dreb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      stocks: 0,
      fg3m: 0,
      fgPct: 0,
      fg3Pct: 0,
      ftPct: 0,
      tov: 0,
      pra: 0,
      plusMinus: 0,
      tsPct: 0,
      efgPct: 0,
      usgPct: 0,
      astTo: 0,
      gmSc: 0,
      pie: null,
      defRtg: null,
      ptsPaint: null,
      deflections: null,
      contestedShots: null,
      hustleActions: null,
    };
  }

  const slice = sliceGamesForBattle(player.games, scope, windowSize);
  if (slice.length === 0) {
    return {
      gamesCount: 0,
      min: 0,
      pts: 0,
      reb: 0,
      oreb: 0,
      dreb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      stocks: 0,
      fg3m: 0,
      fgPct: 0,
      fg3Pct: 0,
      ftPct: 0,
      tov: 0,
      pra: 0,
      plusMinus: 0,
      tsPct: 0,
      efgPct: 0,
      usgPct: 0,
      astTo: 0,
      gmSc: 0,
      pie: null,
      defRtg: null,
      ptsPaint: null,
      deflections: null,
      contestedShots: null,
      hustleActions: null,
    };
  }

  const totalPts = slice.reduce((s, g) => s + g.points, 0);
  const totalFgm = slice.reduce((s, g) => s + g.fgm, 0);
  const totalFga = slice.reduce((s, g) => s + g.fga, 0);
  const totalFg3m = slice.reduce((s, g) => s + g.fg3m, 0);
  const totalFg3a = slice.reduce((s, g) => s + g.fg3a, 0);
  const totalFtm = slice.reduce((s, g) => s + g.ftm, 0);
  const totalFta = slice.reduce((s, g) => s + g.fta, 0);
  const totalAst = slice.reduce((s, g) => s + g.assists, 0);
  const totalTov = slice.reduce((s, g) => s + g.turnovers, 0);

  const fgPct = totalFga > 0 ? (totalFgm / totalFga) * 100 : 0;
  const fg3Pct = totalFg3a > 0 ? (totalFg3m / totalFg3a) * 100 : 0;
  const ftPct = totalFta > 0 ? (totalFtm / totalFta) * 100 : 0;
  const tsDenom = 2 * (totalFga + 0.44 * totalFta);
  const calcTs = tsDenom > 0 ? (totalPts / tsDenom) * 100 : mean(slice.map((g) => g.tsPct));
  const calcEfg =
    totalFga > 0 ? ((totalFgm + 0.5 * totalFg3m) / totalFga) * 100 : mean(slice.map((g) => g.efgPct));
  const calcAstTo = totalTov > 0 ? totalAst / totalTov : totalAst;

  const useSeasonAdv = scope === 'season' && Boolean(player.advanced);
  const adv = player.advanced;

  return {
    gamesCount: slice.length,
    min: round1(mean(slice.map((g) => g.minutes))),
    pts: round1(mean(slice.map((g) => g.points))),
    reb: round1(mean(slice.map((g) => g.rebounds))),
    oreb: round1(mean(slice.map((g) => g.oreb))),
    dreb: round1(mean(slice.map((g) => g.dreb))),
    ast: round1(mean(slice.map((g) => g.assists))),
    stl: round1(mean(slice.map((g) => g.steals))),
    blk: round1(mean(slice.map((g) => g.blocks))),
    stocks: round1(mean(slice.map((g) => g.stocks))),
    fg3m: round1(mean(slice.map((g) => g.fg3m))),
    fgPct: round1(fgPct),
    fg3Pct: round1(fg3Pct),
    ftPct: round1(ftPct),
    tov: round1(mean(slice.map((g) => g.turnovers))),
    pra: round1(mean(slice.map((g) => g.pra))),
    plusMinus: round1(mean(slice.map((g) => g.plusMinus))),
    tsPct: round1(useSeasonAdv && adv?.tsPct ? adv.tsPct : calcTs),
    efgPct: round1(useSeasonAdv && adv?.efgPct ? adv.efgPct : calcEfg),
    usgPct: round1(
      useSeasonAdv && adv?.usgPct ? adv.usgPct : mean(slice.map((g) => g.usgEst))
    ),
    astTo: Math.round((useSeasonAdv && adv?.astTo ? adv.astTo : calcAstTo) * 100) / 100,
    gmSc: round1(mean(slice.map((g) => g.gameScore))),
    pie: useSeasonAdv && adv && adv.pie > 0 ? round1(adv.pie) : null,
    defRtg: useSeasonAdv && adv && adv.defRtg > 70 ? round1(adv.defRtg) : null,
    ptsPaint: useSeasonAdv && adv && adv.ptsPaint > 0 ? round1(adv.ptsPaint) : null,
    deflections:
      useSeasonAdv && adv && (adv.deflections > 0 || adv.contestedShots > 0)
        ? round1(adv.deflections)
        : null,
    contestedShots:
      useSeasonAdv && adv && (adv.deflections > 0 || adv.contestedShots > 0)
        ? round1(adv.contestedShots)
        : null,
    hustleActions:
      useSeasonAdv && adv && (adv.deflections > 0 || adv.contestedShots > 0)
        ? round1(adv.deflections + adv.contestedShots)
        : null,
  };
}

function formatMetricVal(
  val: number,
  decimals: number,
  suffix = '',
  signed = false
): string {
  if (signed) return formatSigned(val, decimals, suffix);
  return `${val.toFixed(decimals)}${suffix}`;
}

function shortSurname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  const last = parts[parts.length - 1];
  if (/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(last) && parts.length >= 3) {
    return `${parts[parts.length - 2]} ${last}`;
  }
  return last;
}

interface BattleFighterSelectorProps {
  cornerLabel: string;
  accentTone: 'orange' | 'sky';
  selectedPlayer: PlayerSummary | undefined;
  otherPlayerId: string;
  players: PlayerSummary[];
  onSelectPlayerId: (id: string) => void;
  onSwapPlayers: () => void;
  onAddExternalPlayer: (item: SearchPlayerResult) => Promise<PlayerSummary | null>;
}

function BattleFighterSelector({
  cornerLabel,
  accentTone,
  selectedPlayer,
  otherPlayerId,
  players,
  onSelectPlayerId,
  onSwapPlayers,
  onAddExternalPlayer,
}: BattleFighterSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remotePlayers, setRemotePlayers] = useState<SearchPlayerResult[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 25);
      return () => clearTimeout(t);
    }
    setQuery('');
    setRemotePlayers([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
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
  }, [open, query]);

  const filteredLocal = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return players.slice(0, 80);
    return players
      .filter((p) =>
        normalizeSearchText(`${p.name} ${p.teamAbbr} ${p.teamName} ${p.position}`).includes(
          q
        )
      )
      .slice(0, 60);
  }, [players, query]);

  const loadedIds = useMemo(() => new Set(players.map((p) => p.id)), [players]);
  const extraRemote = useMemo(
    () => remotePlayers.filter((r) => !loadedIds.has(r.id)),
    [remotePlayers, loadedIds]
  );

  const isOrange = accentTone === 'orange';
  const badgeClasses = isOrange
    ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
    : 'bg-sky-500/15 border-sky-400/40 text-sky-300';
  const labelTextClass = isOrange ? 'text-orange-400' : 'text-sky-400';

  return (
    <div className="relative min-w-0" ref={containerRef}>
      <p className={`text-[11px] font-semibold mb-1.5 ${labelTextClass}`}>
        {cornerLabel}
      </p>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full min-h-[44px] bg-[#0B1120] hover:bg-[#162033] border rounded-lg px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
          open
            ? isOrange
              ? 'border-orange-500/60'
              : 'border-sky-400/60'
            : 'border-[#1E293B]'
        }`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-8 h-8 rounded-md border flex items-center justify-center font-mono text-xs font-bold shrink-0 ${badgeClasses}`}
          >
            {selectedPlayer?.teamAbbr || 'NBA'}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-100 truncate">
              {selectedPlayer?.name || 'Seleccionar jugador'}
            </span>
            <span className="block text-[11px] text-slate-400 truncate">
              {selectedPlayer
                ? `${selectedPlayer.teamName} · ${selectedPlayer.position} · ${selectedPlayer.games.length} PJ`
                : 'Pulsa para elegir'}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 z-40 bg-[#0F172A] border border-[#283548] rounded-lg shadow-2xl overflow-hidden">
          <div className="p-2.5 border-b border-[#1E293B] bg-[#0B1120]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar entre los +580 jugadores NBA..."
                className="w-full bg-[#131C2E] border border-[#1E293B] focus:border-orange-500/60 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-[#1E293B]/60">
            {filteredLocal.map((p) => {
              const isSelected = p.id === selectedPlayer?.id;
              const isOtherSide = p.id === otherPlayerId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (isOtherSide) {
                      onSwapPlayers();
                    } else {
                      onSelectPlayerId(p.id);
                    }
                    setOpen(false);
                  }}
                  className={`w-full min-h-[42px] px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-[#182338] transition-colors ${
                    isSelected
                      ? isOrange
                        ? 'bg-orange-500/10 text-orange-300 font-semibold'
                        : 'bg-sky-500/10 text-sky-300 font-semibold'
                      : 'text-slate-200'
                  }`}
                >
                  <span className="truncate">
                    {p.name}{' '}
                    <span className="text-slate-400 font-normal">
                      · {p.teamAbbr} · {p.position}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] text-slate-400">
                    {isOtherSide ? (
                      <span className="text-slate-300">Intercambiar ⇄</span>
                    ) : (
                      <span>{p.games.length} PJ</span>
                    )}
                    {isSelected && (
                      <Check
                        className={`w-3.5 h-3.5 ${
                          isOrange ? 'text-orange-400' : 'text-sky-400'
                        }`}
                      />
                    )}
                  </span>
                </button>
              );
            })}

            {query.trim().length >= 2 && (
              <>
                {searchingRemote && (
                  <div className="px-3 py-2 text-xs text-slate-400">
                    Buscando en el directorio oficial NBA...
                  </div>
                )}
                {extraRemote.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={importingId === r.id}
                    onClick={async () => {
                      setImportingId(r.id);
                      const imported = await onAddExternalPlayer(r);
                      setImportingId(null);
                      if (imported) {
                        onSelectPlayerId(imported.id);
                        setOpen(false);
                      }
                    }}
                    className="w-full min-h-[42px] px-3 py-2 text-left text-xs flex items-center justify-between gap-2 bg-[#131C2E]/60 hover:bg-[#182338] text-slate-200 transition-colors disabled:opacity-60"
                  >
                    <span className="truncate">
                      {r.name}{' '}
                      <span className="text-slate-400">
                        · {r.teamAbbr} · {r.position}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-orange-400 font-medium whitespace-nowrap shrink-0">
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        {importingId === r.id ? 'Cargando...' : 'Importar al duelo'}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}

            {filteredLocal.length === 0 &&
              !searchingRemote &&
              extraRemote.length === 0 && (
                <div className="px-3 py-4 text-xs text-slate-400 text-center">
                  No se encontraron jugadores con "{query}".
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

export function HeadToHeadBattleView({
  players,
  experienceMode,
  benchmarks: _benchmarks,
  seasonMode,
  onChangeSeasonMode,
  windowSize,
  onChangeWindowSize,
  watchlistIds,
  onToggleWatchlist,
  onInspectEntity,
  onAddExternalPlayer,
  onSwitchToAdvanced,
  initialPlayerAId,
  initialPlayerBId,
  allPlayersLoaded,
  loadingAllPlayers,
  totalLeaguePlayersAvailable,
  onLoadAllPlayers,
}: HeadToHeadBattleViewProps) {
  const defaultPair = useMemo(() => {
    const findStar = (ids: string[], fallbackIdx: number) => {
      for (const id of ids) {
        const found = players.find((p) => p.id === id);
        if (found) return found.id;
      }
      return players[fallbackIdx]?.id || '';
    };
    const idA = findStar(['203999', '1628983', '1629029'], 0);
    const idB =
      players.find(
        (p) =>
          p.id !== idA &&
          ['1641705', '1629029', '1628983', '203507', '1628369'].includes(p.id)
      )?.id ||
      players.find((p) => p.id !== idA)?.id ||
      '';
    return { idA, idB };
  }, [players]);

  const [playerAId, setPlayerAId] = useState<string>(
    () => initialPlayerAId || defaultPair.idA
  );
  const [playerBId, setPlayerBId] = useState<string>(() => {
    if (initialPlayerBId && initialPlayerBId !== (initialPlayerAId || defaultPair.idA)) {
      return initialPlayerBId;
    }
    return defaultPair.idB;
  });

  const [scope, setScope] = useState<BattleSampleScope>('season');
  const [showNbaRing, setShowNbaRing] = useState(true);
  const [selectedAxisIndex, setSelectedAxisIndex] = useState<number | null>(null);
  const [categoryTab, setCategoryTab] = useState<CategoryFilterTab>(
    experienceMode === 'simple' ? 'basic' : 'all'
  );

  useEffect(() => {
    setCategoryTab(experienceMode === 'simple' ? 'basic' : 'all');
  }, [experienceMode]);

  useEffect(() => {
    if (!playerAId && defaultPair.idA) setPlayerAId(defaultPair.idA);
    if (!playerBId && defaultPair.idB) setPlayerBId(defaultPair.idB);
  }, [defaultPair, playerAId, playerBId]);

  useEffect(() => {
    if (!initialPlayerAId) return;
    setPlayerAId((prevA) => {
      if (prevA === initialPlayerAId) return prevA;
      setPlayerBId((prevB) =>
        prevB === initialPlayerAId ? prevA || defaultPair.idB : prevB
      );
      return initialPlayerAId;
    });
  }, [initialPlayerAId, defaultPair.idB]);

  useEffect(() => {
    if (!initialPlayerBId) return;
    if (initialPlayerBId !== playerAId) {
      setPlayerBId(initialPlayerBId);
    }
  }, [initialPlayerBId, playerAId]);

  const playerA = useMemo(
    () => players.find((p) => p.id === playerAId) || players[0],
    [players, playerAId]
  );

  const playerB = useMemo(() => {
    const found = players.find((p) => p.id === playerBId);
    if (found && found.id !== playerA?.id) return found;
    return players.find((p) => p.id !== playerA?.id) || players[1] || players[0];
  }, [players, playerBId, playerA]);

  // Curated 1-click marquee duels built dynamically from loaded NBA roster
  const quickMatchups = useMemo(() => {
    if (players.length < 2) return [];
    const rot = players.filter((p) => p.games.length >= 2);
    const pool = rot.length >= 6 ? rot : players;

    const byGmSc = [...pool].sort(
      (a, b) =>
        mean(b.games.map((g) => g.gameScore)) - mean(a.games.map((g) => g.gameScore))
    );
    const byStocksReb = [...pool].sort(
      (a, b) =>
        mean(b.games.map((g) => g.rebounds + g.stocks * 2.5)) -
        mean(a.games.map((g) => g.rebounds + g.stocks * 2.5))
    );
    const byPlaymaking = [...pool].sort(
      (a, b) =>
        mean(b.games.map((g) => g.assists + g.fg3m)) -
        mean(a.games.map((g) => g.assists + g.fg3m))
    );
    const byRecentPts = [...pool].sort((a, b) => {
      const sA = a.games.slice(0, Math.min(windowSize, a.games.length));
      const sB = b.games.slice(0, Math.min(windowSize, b.games.length));
      return mean(sB.map((g) => g.points)) - mean(sA.map((g) => g.points));
    });

    const list: Array<{ label: string; idA: string; idB: string }> = [];
    const pushUnique = (label: string, a?: PlayerSummary, b?: PlayerSummary) => {
      if (!a || !b || a.id === b.id) return;
      if (
        list.some(
          (m) =>
            (m.idA === a.id && m.idB === b.id) || (m.idA === b.id && m.idB === a.id)
        )
      ) {
        return;
      }
      list.push({
        label: `${label}: ${shortSurname(a.name)} vs ${shortSurname(b.name)}`,
        idA: a.id,
        idB: b.id,
      });
    };

    pushUnique('Duelo MVP', byGmSc[0], byGmSc[1]);
    pushUnique('Pintura', byStocksReb[0], byStocksReb[1]);
    pushUnique('Creadores', byPlaymaking[0], byPlaymaking[1]);
    pushUnique(`Calientes (${windowSize}PJ)`, byRecentPts[0], byRecentPts[1]);

    return list.slice(0, 4);
  }, [players, windowSize]);

  const handleSwapPlayers = () => {
    if (!playerA || !playerB) return;
    const prevA = playerA.id;
    setPlayerAId(playerB.id);
    setPlayerBId(prevA);
  };

  const handleRandomBattle = () => {
    const eligible = players.filter(
      (p) => p.games.length >= 3 && mean(p.games.map((g) => g.minutes)) >= 20
    );
    const pool = eligible.length >= 4 ? eligible : players;
    if (pool.length < 2) return;

    const idxA = Math.floor(Math.random() * pool.length);
    let idxB = Math.floor(Math.random() * (pool.length - 1));
    if (idxB >= idxA) idxB += 1;

    setPlayerAId(pool[idxA].id);
    setPlayerBId(pool[idxB].id);
  };

  const statsA = useMemo(
    () => computeBattleStats(playerA, scope, windowSize),
    [playerA, scope, windowSize]
  );
  const statsB = useMemo(
    () => computeBattleStats(playerB, scope, windowSize),
    [playerB, scope, windowSize]
  );

  // 6 Radar Axes Calculation (Normalized 25..99 where 50 = Empirical NBA Rotation Mean, SD = 1)
  const radarAxes = useMemo<RadarAxisResult[]>(() => {
    const b = NBA_ROTATION_RADAR_BASELINES;

    const calcScoring = (st: ComputedPlayerBattleStats) => {
      if (st.gamesCount === 0) return 25;
      const zPts = (st.pts - b.pts.mean) / b.pts.sd;
      const ppm = st.min > 0 ? st.pts / st.min : 0;
      const zPpm = (ppm - b.ppm.mean) / b.ppm.sd;
      return zToBattleRating(0.72 * zPts + 0.28 * zPpm);
    };

    const calcEfficiency = (st: ComputedPlayerBattleStats) => {
      if (st.gamesCount === 0) return 25;
      // Pure True Shooting Z-score (includes 2P, 1.5x 3P, and FT so elite FT-drawers like Shai aren't penalized)
      // plus Volume-Creation Bonus when maintaining above-average TS% under heavy USG% load.
      const zTs = (st.tsPct - b.tsPct.mean) / b.tsPct.sd;
      const loadBonus =
        st.tsPct > 57.5
          ? 0.38 *
            clampNum((st.usgPct - b.usgPct.mean) / 8.5, 0, 1.6) *
            Math.max(0, zTs)
          : 0;
      return zToBattleRating(zTs + loadBonus);
    };

    const calcPlaymaking = (st: ComputedPlayerBattleStats) => {
      if (st.gamesCount === 0) return 25;
      const zAst = (st.ast - b.ast.mean) / b.ast.sd;
      const zRatio = (Math.min(5.2, st.astTo) - b.astTo.mean) / b.astTo.sd;
      return zToBattleRating(1.12 * (0.74 * zAst + 0.26 * zRatio));
    };

    const calcImpact = (st: ComputedPlayerBattleStats) => {
      if (st.gamesCount === 0) return 25;
      const zGmSc = (st.gmSc - b.gmSc.mean) / b.gmSc.sd;
      const zPm = clampNum((st.plusMinus - b.pm.mean) / b.pm.sd, -2.5, 2.8);
      if (st.pie !== null) {
        const zPie = (st.pie - b.pie.mean) / b.pie.sd;
        return zToBattleRating(1.15 * (0.5 * zGmSc + 0.22 * zPm + 0.28 * zPie));
      }
      return zToBattleRating(1.15 * (0.68 * zGmSc + 0.32 * zPm));
    };

    const calcDefense = (st: ComputedPlayerBattleStats) => {
      if (st.gamesCount === 0) return 25;
      // Sample-size stabilization prevents a 3-game block spike from faking a 99 DPOY rating
      const confDef =
        scope === 'season'
          ? Math.sqrt(st.gamesCount / (st.gamesCount + 5))
          : 0.88;

      const stocks36 = st.min >= 12 ? (st.stocks / st.min) * 36 : st.stocks * 1.4;
      const zStk = (st.stocks - b.stocks.mean) / b.stocks.sd;
      const zStk36 = (stocks36 - b.stocks36.mean) / b.stocks36.sd;
      const zDisrupt = 0.58 * zStk + 0.42 * zStk36;

      if (
        st.defRtg !== null &&
        st.deflections !== null &&
        st.contestedShots !== null
      ) {
        // Inverted DefRtg: fewer points allowed per 100 possessions = positive defensive Z-score
        const zDefRtg = clampNum(
          (b.defRtg.mean - st.defRtg) / b.defRtg.sd,
          -2.2,
          2.5
        );
        const zHustle =
          0.55 * ((st.deflections - b.deflections.mean) / b.deflections.sd) +
          0.45 * ((st.contestedShots - b.contested.mean) / b.contested.sd);
        const compositeZ =
          1.38 * (0.42 * zDisrupt + 0.35 * zDefRtg + 0.23 * zHustle) * confDef;
        return zToBattleRating(compositeZ);
      }

      return zToBattleRating(1.05 * zDisrupt * confDef);
    };

    const calcRebounding = (st: ComputedPlayerBattleStats) => {
      if (st.gamesCount === 0) return 25;
      const zReb = (st.reb - b.reb.mean) / b.reb.sd;
      const zOreb = (st.oreb - b.oreb.mean) / b.oreb.sd;
      return zToBattleRating(1.03 * (0.72 * zReb + 0.28 * zOreb));
    };

    const rawAxes: Array<Omit<RadarAxisResult, 'winner'>> = [
      {
        key: 'scoring',
        label: 'Anotación',
        shortLabel: 'Anotación',
        helpKey: 'duelAxisScoring',
        scoreA: calcScoring(statsA),
        scoreB: calcScoring(statsB),
        rawTextA: `${statsA.pts.toFixed(1)} PTS`,
        rawTextB: `${statsB.pts.toFixed(1)} PTS`,
      },
      {
        key: 'efficiency',
        label: 'Eficiencia',
        shortLabel: 'Eficiencia',
        helpKey: 'duelAxisEfficiency',
        scoreA: calcEfficiency(statsA),
        scoreB: calcEfficiency(statsB),
        rawTextA: `${statsA.tsPct.toFixed(1)}% TS · ${statsA.usgPct.toFixed(0)}% USG`,
        rawTextB: `${statsB.tsPct.toFixed(1)}% TS · ${statsB.usgPct.toFixed(0)}% USG`,
      },
      {
        key: 'playmaking',
        label: 'Creación',
        shortLabel: 'Creación',
        helpKey: 'duelAxisPlaymaking',
        scoreA: calcPlaymaking(statsA),
        scoreB: calcPlaymaking(statsB),
        rawTextA: `${statsA.ast.toFixed(1)} AST`,
        rawTextB: `${statsB.ast.toFixed(1)} AST`,
      },
      {
        key: 'impact',
        label: 'Impacto',
        shortLabel: 'Impacto',
        helpKey: 'duelAxisImpact',
        scoreA: calcImpact(statsA),
        scoreB: calcImpact(statsB),
        rawTextA: `${statsA.gmSc.toFixed(1)} GmSc`,
        rawTextB: `${statsB.gmSc.toFixed(1)} GmSc`,
      },
      {
        key: 'defense',
        label: 'Defensa',
        shortLabel: 'Defensa',
        helpKey: 'duelAxisDefense',
        scoreA: calcDefense(statsA),
        scoreB: calcDefense(statsB),
        rawTextA:
          statsA.defRtg !== null
            ? `${statsA.stocks.toFixed(1)} STK · ${statsA.defRtg.toFixed(1)} DefRtg`
            : `${statsA.stocks.toFixed(1)} STK`,
        rawTextB:
          statsB.defRtg !== null
            ? `${statsB.stocks.toFixed(1)} STK · ${statsB.defRtg.toFixed(1)} DefRtg`
            : `${statsB.stocks.toFixed(1)} STK`,
      },
      {
        key: 'rebounding',
        label: 'Rebote',
        shortLabel: 'Rebote',
        helpKey: 'duelAxisRebounding',
        scoreA: calcRebounding(statsA),
        scoreB: calcRebounding(statsB),
        rawTextA: `${statsA.reb.toFixed(1)} REB`,
        rawTextB: `${statsB.reb.toFixed(1)} REB`,
      },
    ];

    return rawAxes.map((ax) => ({
      ...ax,
      winner:
        Math.abs(ax.scoreA - ax.scoreB) <= 1
          ? 'tie'
          : ax.scoreA > ax.scoreB
          ? 'A'
          : 'B',
    }));
  }, [statsA, statsB, scope]);

  const simpleAvgA = useMemo(
    () => Math.round(mean(radarAxes.map((a) => a.scoreA))),
    [radarAxes]
  );
  const simpleAvgB = useMemo(
    () => Math.round(mean(radarAxes.map((a) => a.scoreB))),
    [radarAxes]
  );

  const ovrA = useMemo(() => {
    if (statsA.gamesCount === 0) return 25;
    const impactAxis = radarAxes.find((a) => a.key === 'impact')?.scoreA ?? 50;
    return computeOverallRadarRating(
      radarAxes.map((a) => a.scoreA),
      impactAxis
    );
  }, [radarAxes, statsA.gamesCount]);

  const ovrB = useMemo(() => {
    if (statsB.gamesCount === 0) return 25;
    const impactAxis = radarAxes.find((a) => a.key === 'impact')?.scoreB ?? 50;
    return computeOverallRadarRating(
      radarAxes.map((a) => a.scoreB),
      impactAxis
    );
  }, [radarAxes, statsB.gamesCount]);

  // Full Head-to-Head Category Scoreboard (14–16 categories)
  const allCategories = useMemo<BattleCategoryRow[]>(() => {
    const buildRow = (cfg: {
      id: string;
      label: string;
      simpleLabel: string;
      shortUnit: string;
      helpKey: string;
      group: 'basic' | 'advanced';
      valA: number;
      valB: number;
      decimals: number;
      suffix?: string;
      signed?: boolean;
      lowerIsBetter?: boolean;
      tieEpsilon: number;
    }): BattleCategoryRow => {
      const rawDiff = cfg.valA - cfg.valB;
      const effectiveDiff = cfg.lowerIsBetter ? -rawDiff : rawDiff;
      const winner: 'A' | 'B' | 'tie' =
        Math.abs(rawDiff) <= cfg.tieEpsilon
          ? 'tie'
          : effectiveDiff > 0
          ? 'A'
          : 'B';

      // Compute clean 8..92 visual tug-of-war share so better side always gets wider bar
      let shareA = 50;
      if (cfg.signed) {
        const floor = Math.min(cfg.valA, cfg.valB, -12) - 4;
        const posA = Math.max(1, cfg.valA - floor);
        const posB = Math.max(1, cfg.valB - floor);
        shareA = (posA / (posA + posB)) * 100;
      } else if (cfg.lowerIsBetter) {
        if (cfg.id === 'defRtg') {
          const posA = Math.max(2, 128 - cfg.valA);
          const posB = Math.max(2, 128 - cfg.valB);
          shareA = (posA / (posA + posB)) * 100;
        } else {
          const sum = cfg.valA + cfg.valB;
          if (sum > 0.05) {
            // Invert share so lower value (fewer turnovers) earns larger bar
            shareA = (cfg.valB / sum) * 100;
          }
        }
      } else {
        const sum = Math.max(0, cfg.valA) + Math.max(0, cfg.valB);
        if (sum > 0.05) {
          shareA = (Math.max(0, cfg.valA) / sum) * 100;
        }
      }
      shareA = Math.max(10, Math.min(90, Math.round(shareA)));

      return {
        ...cfg,
        winner,
        advantageAbs: Math.abs(rawDiff),
        shareA,
      };
    };

    const rows: BattleCategoryRow[] = [
      buildRow({
        id: 'pts',
        label: 'Puntos por partido (PTS)',
        simpleLabel: 'Puntos anotados por noche',
        shortUnit: 'PTS',
        helpKey: 'ptsBase',
        group: 'basic',
        valA: statsA.pts,
        valB: statsB.pts,
        decimals: 1,
        tieEpsilon: 0.25,
      }),
      buildRow({
        id: 'reb',
        label: 'Rebotes totales (REB)',
        simpleLabel: 'Rebotes capturados',
        shortUnit: 'REB',
        helpKey: 'rebBase',
        group: 'basic',
        valA: statsA.reb,
        valB: statsB.reb,
        decimals: 1,
        tieEpsilon: 0.2,
      }),
      buildRow({
        id: 'oreb',
        label: 'Rebotes ofensivos (OR)',
        simpleLabel: 'Rebotes en ataque (2ª jugada)',
        shortUnit: 'OR',
        helpKey: 'orebBase',
        group: 'basic',
        valA: statsA.oreb,
        valB: statsB.oreb,
        decimals: 1,
        tieEpsilon: 0.15,
      }),
      buildRow({
        id: 'ast',
        label: 'Asistencias (AST)',
        simpleLabel: 'Pases de canasta (Asistencias)',
        shortUnit: 'AST',
        helpKey: 'astBase',
        group: 'basic',
        valA: statsA.ast,
        valB: statsB.ast,
        decimals: 1,
        tieEpsilon: 0.2,
      }),
      buildRow({
        id: 'pra',
        label: 'Producción combinada (PRA)',
        simpleLabel: 'Suma Puntos + Rebotes + Asistencias',
        shortUnit: 'PRA',
        helpKey: 'pra',
        group: 'basic',
        valA: statsA.pra,
        valB: statsB.pra,
        decimals: 1,
        tieEpsilon: 0.4,
      }),
      buildRow({
        id: 'fg3m',
        label: 'Triples anotados (3PM)',
        simpleLabel: 'Triples encestados por partido',
        shortUnit: '3PM',
        helpKey: 'fg3m',
        group: 'basic',
        valA: statsA.fg3m,
        valB: statsB.fg3m,
        decimals: 1,
        tieEpsilon: 0.15,
      }),
      buildRow({
        id: 'stocks',
        label: 'Robos + Tapones (Stocks)',
        simpleLabel: 'Defensas directas (Robos + Tapones)',
        shortUnit: 'STK',
        helpKey: 'stocksBase',
        group: 'basic',
        valA: statsA.stocks,
        valB: statsB.stocks,
        decimals: 1,
        tieEpsilon: 0.15,
      }),
      buildRow({
        id: 'tov',
        label: 'Cuidado de balón (Pérdidas)',
        simpleLabel: 'Balones perdidos (menos es mejor)',
        shortUnit: 'PER',
        helpKey: 'tov',
        group: 'basic',
        valA: statsA.tov,
        valB: statsB.tov,
        decimals: 1,
        lowerIsBetter: true,
        tieEpsilon: 0.15,
      }),
      buildRow({
        id: 'tsPct',
        label: 'Acierto Real True Shooting (TS%)',
        simpleLabel: 'Acierto real de tiro (TS%)',
        shortUnit: '%',
        helpKey: 'tsPct',
        group: 'advanced',
        valA: statsA.tsPct,
        valB: statsB.tsPct,
        decimals: 1,
        suffix: '%',
        tieEpsilon: 0.4,
      }),
      buildRow({
        id: 'efgPct',
        label: 'Tiro de Campo Efectivo (eFG%)',
        simpleLabel: 'Puntería efectiva en juego (eFG%)',
        shortUnit: '%',
        helpKey: 'efgPct',
        group: 'advanced',
        valA: statsA.efgPct,
        valB: statsB.efgPct,
        decimals: 1,
        suffix: '%',
        tieEpsilon: 0.4,
      }),
      buildRow({
        id: 'usgPct',
        label: 'Uso Ofensivo (USG%)',
        simpleLabel: 'Protagonismo con balón (Uso %)',
        shortUnit: '%',
        helpKey: 'usgPct',
        group: 'advanced',
        valA: statsA.usgPct,
        valB: statsB.usgPct,
        decimals: 1,
        suffix: '%',
        tieEpsilon: 0.5,
      }),
      buildRow({
        id: 'astTo',
        label: 'Ratio Asistencias / Pérdida (AST/PER)',
        simpleLabel: 'Seguridad al pasar (Asist. por pérdida)',
        shortUnit: 'A/P',
        helpKey: 'astTo',
        group: 'advanced',
        valA: statsA.astTo,
        valB: statsB.astTo,
        decimals: 2,
        tieEpsilon: 0.12,
      }),
      buildRow({
        id: 'gmSc',
        label: 'Valoración Hollinger (Game Score)',
        simpleLabel: 'Nota global del partido (Game Score)',
        shortUnit: 'GmSc',
        helpKey: 'gmSc',
        group: 'advanced',
        valA: statsA.gmSc,
        valB: statsB.gmSc,
        decimals: 1,
        tieEpsilon: 0.3,
      }),
      buildRow({
        id: 'plusMinus',
        label: 'Impacto Más / Menos (+/-)',
        simpleLabel: 'Diferencia con él en pista (+/-)',
        shortUnit: '+/-',
        helpKey: 'plusMinusBase',
        group: 'advanced',
        valA: statsA.plusMinus,
        valB: statsB.plusMinus,
        decimals: 1,
        signed: true,
        tieEpsilon: 0.3,
      }),
    ];

    if (statsA.defRtg !== null && statsB.defRtg !== null) {
      rows.push(
        buildRow({
          id: 'defRtg',
          label: 'Eficiencia Defensiva (DefRtg · menos es mejor)',
          simpleLabel: 'Puntos recibidos c/100 pos. (menos es mejor)',
          shortUnit: 'DefRtg',
          helpKey: 'defRtg',
          group: 'advanced',
          valA: statsA.defRtg,
          valB: statsB.defRtg,
          decimals: 1,
          lowerIsBetter: true,
          tieEpsilon: 0.4,
        })
      );
    }

    if (statsA.ptsPaint !== null && statsB.ptsPaint !== null) {
      rows.push(
        buildRow({
          id: 'ptsPaint',
          label: 'Puntos en la Pintura (NBA.com)',
          simpleLabel: 'Puntos cerca del aro (Pintura)',
          shortUnit: 'PTS',
          helpKey: 'ptsPaint',
          group: 'advanced',
          valA: statsA.ptsPaint,
          valB: statsB.ptsPaint,
          decimals: 1,
          tieEpsilon: 0.3,
        })
      );
    }

    if (statsA.hustleActions !== null && statsB.hustleActions !== null) {
      rows.push(
        buildRow({
          id: 'hustle',
          label: 'Esfuerzo Defensivo (Desvíos + Punteados)',
          simpleLabel: 'Intangibles defensivos (Punteos + Desvíos)',
          shortUnit: 'ACC',
          helpKey: 'duelHustleActions',
          group: 'advanced',
          valA: statsA.hustleActions,
          valB: statsB.hustleActions,
          decimals: 1,
          tieEpsilon: 0.3,
        })
      );
    }

    return rows;
  }, [statsA, statsB]);

  const visibleCategories = useMemo(() => {
    if (categoryTab === 'all') return allCategories;
    return allCategories.filter((r) => r.group === categoryTab);
  }, [allCategories, categoryTab]);

  // Scoreboard Summary Counts across all active categories
  const scoreboard = useMemo(() => {
    let winsA = 0;
    let winsB = 0;
    let ties = 0;
    for (const c of allCategories) {
      if (c.winner === 'A') winsA += 1;
      else if (c.winner === 'B') winsB += 1;
      else ties += 1;
    }

    const bestForA = [...allCategories]
      .filter((c) => c.winner === 'A')
      .sort((x, y) => y.shareA - x.shareA)[0];

    const bestForB = [...allCategories]
      .filter((c) => c.winner === 'B')
      .sort((x, y) => x.shareA - y.shareA)[0];

    return { winsA, winsB, ties, total: allCategories.length, bestForA, bestForB };
  }, [allCategories]);

  // Automated Duel Verdict in Everyday / Analytical Spanish
  const verdictNotes = useMemo(() => {
    if (!playerA || !playerB || statsA.gamesCount === 0 || statsB.gamesCount === 0) {
      return ['Selecciona dos jugadores con partidos registrados en este tramo para generar el veredicto del duelo.'];
    }

    const nameA = shortSurname(playerA.name);
    const nameB = shortSurname(playerB.name);
    const notes: string[] = [];

    if (scoreboard.winsA > scoreboard.winsB) {
      notes.push(
        `${playerA.name} se impone en el marcador global ganando ${scoreboard.winsA} de las ${scoreboard.total} categorías evaluadas (${scoreboard.winsA}-${scoreboard.winsB}${
          scoreboard.ties > 0 ? ` con ${scoreboard.ties} empate${scoreboard.ties > 1 ? 's' : ''}` : ''
        }).`
      );
    } else if (scoreboard.winsB > scoreboard.winsA) {
      notes.push(
        `${playerB.name} conquista el duelo estadístico llevándose ${scoreboard.winsB} de las ${scoreboard.total} categorías (${scoreboard.winsB}-${scoreboard.winsA}${
          scoreboard.ties > 0 ? ` y ${scoreboard.ties} empate${scoreboard.ties > 1 ? 's' : ''}` : ''
        }).`
      );
    } else {
      notes.push(
        `Máxima igualdad en la cancha: empate exacto ${scoreboard.winsA}-${scoreboard.winsB} en categorías ganadas entre ${nameA} y ${nameB}.`
      );
    }

    // Stylistic radar clash
    const biggestGapForA = [...radarAxes].sort(
      (x, y) => y.scoreA - y.scoreB - (x.scoreA - x.scoreB)
    )[0];
    const biggestGapForB = [...radarAxes].sort(
      (x, y) => y.scoreB - y.scoreA - (x.scoreB - x.scoreA)
    )[0];

    if (biggestGapForA && biggestGapForA.scoreA - biggestGapForA.scoreB >= 5) {
      notes.push(
        ` Ventaja diferencial de ${nameA} en ${biggestGapForA.label}: marca ${biggestGapForA.scoreA}/99 en el radar (${biggestGapForA.rawTextA}) frente a ${biggestGapForA.scoreB}/99 de ${nameB} (${biggestGapForA.rawTextB}).`
      );
    }
    if (biggestGapForB && biggestGapForB.scoreB - biggestGapForB.scoreA >= 5) {
      notes.push(
        `Territorio de ${nameB} en ${biggestGapForB.label}: alcanza ${biggestGapForB.scoreB}/99 (${biggestGapForB.rawTextB}) superando los ${biggestGapForB.scoreA}/99 de ${nameA} (${biggestGapForB.rawTextA}).`
      );
    }

    if (experienceMode === 'simple') {
      const effWinner =
        statsA.tsPct >= statsB.tsPct + 1
          ? `${nameA} aprovecha mejor cada tiro que lanza (${statsA.tsPct.toFixed(1)}% frente a ${statsB.tsPct.toFixed(1)}%)`
          : statsB.tsPct >= statsA.tsPct + 1
          ? `${nameB} es más certero aprovechando sus tiros (${statsB.tsPct.toFixed(1)}% frente a ${statsA.tsPct.toFixed(1)}%)`
          : `ambos calcan su puntería real alrededor del ${statsA.tsPct.toFixed(1)}%`;
      notes.push(`En eficacia anotadora, ${effWinner}.`);
    } else {
      notes.push(
        `Balance volumen vs. eficiencia: ${nameA} absorbe un ${statsA.usgPct.toFixed(
          1
        )}% USG con ${statsA.tsPct.toFixed(1)}% TS (${statsA.gmSc.toFixed(
          1
        )} GmSc), mientras que ${nameB} registra ${statsB.usgPct.toFixed(
          1
        )}% USG con ${statsB.tsPct.toFixed(1)}% TS (${statsB.gmSc.toFixed(1)} GmSc).`
      );
    }

    return notes;
  }, [playerA, playerB, statsA, statsB, scoreboard, radarAxes, experienceMode]);

  // SVG Radar Geometry
  const svgW = 440;
  const svgH = 356;
  const cx = 220;
  const cy = 180;
  const maxR = 110;

  const axisPoint = (index: number, value0to100: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 6;
    const clamped = Math.max(0, Math.min(100, value0to100));
    const r = (clamped / 100) * maxR;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const polygonPointsFor = (scores: number[]) =>
    scores
      .map((sc, i) => {
        const pt = axisPoint(i, sc);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      })
      .join(' ');

  const polyA = polygonPointsFor(radarAxes.map((a) => a.scoreA));
  const polyB = polygonPointsFor(radarAxes.map((a) => a.scoreB));
  const polyLeague50 = polygonPointsFor([50, 50, 50, 50, 50, 50]);

  const activeAxis =
    selectedAxisIndex !== null ? radarAxes[selectedAxisIndex] : null;

  const shortA = playerA ? shortSurname(playerA.name) : 'Jugador A';
  const shortB = playerB ? shortSurname(playerB.name) : 'Jugador B';

  const watchedA = playerA ? watchlistIds.has(`player:${playerA.id}`) : false;
  const watchedB = playerB ? watchlistIds.has(`player:${playerB.id}`) : false;
  const tierA = ratingTierLabel(ovrA);
  const tierB = ratingTierLabel(ovrB);
  const roleA = qualifyUsageRole(statsA.usgPct);
  const roleB = qualifyUsageRole(statsB.usgPct);

  const scopeLabel =
    scope === 'season'
      ? 'Temporada completa'
      : scope === 'recent'
      ? `Últimos ${windowSize} PJ`
      : scope === 'home'
      ? 'Partidos en Casa'
      : 'Partidos Fuera';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Row 1: Homogeneous 4-Cell Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Marcador de categorías</span>
            <MetricInfoTooltip helpKey="duelCategoryScore" align="left" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-100">
            <span className="text-orange-400">{scoreboard.winsA}</span>
            <span className="text-slate-500 mx-1.5">-</span>
            <span className="text-sky-400">{scoreboard.winsB}</span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {scoreboard.winsA > scoreboard.winsB
              ? `Domina ${shortA} (${scoreboard.total} apartados)`
              : scoreboard.winsB > scoreboard.winsA
              ? `Domina ${shortB} (${scoreboard.total} apartados)`
              : `Empate técnico (${scoreboard.total} apartados)`}
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Valoración Radar (0–99)</span>
            <MetricInfoTooltip helpKey="duelRadarRating" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-100">
            <span className="text-orange-400">{ovrA}</span>
            <span className="text-slate-500 text-sm mx-1.5">vs</span>
            <span className="text-sky-400">{ovrB}</span>
          </p>
          <div className="mt-1 flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="font-mono tabular-nums truncate">
              Media 6 ejes: {simpleAvgA} vs {simpleAvgB}
            </span>
            <MetricInfoTooltip helpKey="duelSimpleAxisAvg" />
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate text-orange-300">Mejor baza · {shortA}</span>
            <MetricInfoTooltip
              helpKey={scoreboard.bestForA?.helpKey || 'ptsBase'}
            />
          </div>
          <p className="mt-1 text-sm sm:text-base font-semibold text-slate-100 truncate">
            {scoreboard.bestForA
              ? experienceMode === 'simple'
                ? scoreboard.bestForA.simpleLabel
                : scoreboard.bestForA.label
              : 'Sin ventaja'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
            {scoreboard.bestForA
              ? `+${scoreboard.bestForA.advantageAbs.toFixed(
                  scoreboard.bestForA.decimals
                )} ${scoreboard.bestForA.shortUnit} sobre ${shortB}`
              : 'Duelo equilibrado'}
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate text-sky-300">Mejor baza · {shortB}</span>
            <MetricInfoTooltip
              helpKey={scoreboard.bestForB?.helpKey || 'ptsBase'}
              align="right"
            />
          </div>
          <p className="mt-1 text-sm sm:text-base font-semibold text-slate-100 truncate">
            {scoreboard.bestForB
              ? experienceMode === 'simple'
                ? scoreboard.bestForB.simpleLabel
                : scoreboard.bestForB.label
              : 'Sin ventaja'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-sky-400 truncate">
            {scoreboard.bestForB
              ? `+${scoreboard.bestForB.advantageAbs.toFixed(
                  scoreboard.bestForB.decimals
                )} ${scoreboard.bestForB.shortUnit} sobre ${shortA}`
              : 'Duelo equilibrado'}
          </p>
        </div>
      </div>

      {/* Row 2: Unified Matchup Setup Deck (Season + Sample Scope + Conditional N PJ + Players) */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-3.5 sm:p-4 space-y-3.5">
        {/* Top Row: Unified Season + Sample Scope + Conditional Window + Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 max-w-full">
            {/* Season Dataset Selector (integrated cleanly inside Duel) */}
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
                  onClick={() => onChangeSeasonMode(m.id)}
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

            {/* Matchup Sample Scope */}
            <div className="flex items-center gap-1.5 max-w-full">
              <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
                {(
                  [
                    { id: 'season', label: 'Temporada completa' },
                    { id: 'recent', label: `Últimos ${windowSize} PJ` },
                    { id: 'home', label: 'En Casa' },
                    { id: 'away', label: 'Visitante' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setScope(opt.id)}
                    className={`min-h-[32px] sm:min-h-0 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      scope === opt.id
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <MetricInfoTooltip helpKey="duelSampleScope" align="left" />
            </div>

            {/* Conditional 3 / 5 / 10 PJ Sub-Selector (shown ONLY when 'recent' is active!) */}
            {scope === 'recent' && (
              <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-orange-500/35 rounded-lg shrink-0">
                {([3, 5, 10] as WindowSize[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onChangeWindowSize(w)}
                    className={`min-h-[30px] sm:min-h-0 px-2 py-0.5 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                      windowSize === w
                        ? 'bg-orange-500/20 text-orange-300 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {w} PJ
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={handleSwapPlayers}
              className="min-h-[36px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] text-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-orange-400" />
              <span>Intercambiar lados</span>
            </button>

            <button
              type="button"
              onClick={handleRandomBattle}
              className="min-h-[36px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] text-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Shuffle className="w-3.5 h-3.5 text-sky-400" />
              <span>Duelo aleatorio</span>
            </button>

            {!allPlayersLoaded && totalLeaguePlayersAvailable > players.length && (
              <div className="inline-flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={loadingAllPlayers}
                  onClick={onLoadAllPlayers}
                  className="min-h-[36px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] text-orange-300 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {loadingAllPlayers
                      ? 'Cargando censo...'
                      : `Ampliar censo (+${
                          totalLeaguePlayersAvailable - players.length
                        } → ${totalLeaguePlayersAvailable} NBA)`}
                  </span>
                </button>
                <MetricInfoTooltip helpKey="loadFullLeagueCensus" align="right" />
              </div>
            )}
          </div>
        </div>

        {/* Contextual Small-Sample Banner when 'Solo 2026-27' has very few games played */}
        {seasonMode === '2027' &&
          scope === 'season' &&
          statsA.gamesCount > 0 &&
          statsB.gamesCount > 0 &&
          Math.min(statsA.gamesCount, statsB.gamesCount) <= 8 && (
            <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-amber-200/95">
                Muestra inicial corta en <strong>Solo 2026-27</strong> ({statsA.gamesCount} y{' '}
                {statsB.gamesCount} PJ disputados): un arranque frío de tiro reduce
                temporalmente ejes como Eficiencia ({statsA.tsPct.toFixed(1)}% y{' '}
                {statsB.tsPct.toFixed(1)}% TS).
              </span>
              <button
                type="button"
                onClick={() => onChangeSeasonMode('continuous')}
                className="px-2.5 py-1 font-semibold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 rounded transition-colors whitespace-nowrap shrink-0"
              >
                Ver nivel consolidado (Actual + Pasada) →
              </button>
            </div>
          )}

        {/* Dual Searchable Player Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#1E293B]">
          <BattleFighterSelector
            cornerLabel="Esquina Naranja · Jugador 1"
            accentTone="orange"
            selectedPlayer={playerA}
            otherPlayerId={playerB?.id || ''}
            players={players}
            onSelectPlayerId={setPlayerAId}
            onSwapPlayers={handleSwapPlayers}
            onAddExternalPlayer={onAddExternalPlayer}
          />

          <BattleFighterSelector
            cornerLabel="Esquina Azul · Jugador 2"
            accentTone="sky"
            selectedPlayer={playerB}
            otherPlayerId={playerA?.id || ''}
            players={players}
            onSelectPlayerId={setPlayerBId}
            onSwapPlayers={handleSwapPlayers}
            onAddExternalPlayer={onAddExternalPlayer}
          />
        </div>

        {/* Quick Featured Matchup Chips */}
        {quickMatchups.length > 0 && (
          <div className="flex items-center gap-1.5 pt-2 border-t border-[#1E293B] overflow-x-auto no-scrollbar">
            <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0 mr-1">
              Duelos rápidos:
            </span>
            {quickMatchups.map((m, i) => {
              const isCurrent =
                (playerA?.id === m.idA && playerB?.id === m.idB) ||
                (playerA?.id === m.idB && playerB?.id === m.idA);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setPlayerAId(m.idA);
                    setPlayerBId(m.idB);
                  }}
                  className={`min-h-[32px] sm:min-h-0 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    isCurrent
                      ? 'bg-orange-500/15 border-orange-500/40 text-orange-300 font-semibold'
                      : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:bg-[#182338]'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Row 3: 1v1 Battle Arena (Fighter Cards + Superimposed 6-Axis Radar Chart) */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">
              01. Batalla de Cartas y Radar Superpuesto (6 Ejes NBA · {scopeLabel})
            </h2>
            <MetricInfoTooltip helpKey="duelRadarRating" align="left" />
          </div>

          <button
            type="button"
            onClick={() => setShowNbaRing((prev) => !prev)}
            className={`min-h-[34px] sm:min-h-0 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              showNbaRing
                ? 'bg-[#182338] border-[#283548] text-slate-200'
                : 'bg-[#131C2E] border-[#1E293B] text-slate-400 hover:text-slate-200'
            }`}
          >
            {showNbaRing ? 'Ocultar anillo Media NBA (50)' : 'Mostrar anillo Media NBA (50)'}
          </button>
        </div>

        {/* Single-Elevation Arena Container */}
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden">
          {/* Mobile Compact Side-by-Side Fighter Banner (< xl) so smartphone sees both cards + radar immediately */}
          <div className="grid grid-cols-2 divide-x divide-[#1E293B] border-b border-[#1E293B] xl:hidden">
            {/* Mobile Fighter A */}
            <div className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-1.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-orange-400 truncate">
                    {playerA?.teamAbbr || '—'} · {playerA?.position || '—'}
                  </div>
                  <button
                    type="button"
                    onClick={() => playerA && onInspectEntity('player', playerA.id)}
                    className="text-sm font-bold text-slate-100 hover:text-orange-300 text-left truncate block max-w-full"
                  >
                    {playerA?.name || '—'}
                  </button>
                </div>
                <div className="text-right shrink-0">
                  <div className="inline-flex items-center gap-1">
                    <span className="font-mono tabular-nums text-lg font-bold text-orange-400 leading-none">
                      {ovrA}
                    </span>
                    <MetricInfoTooltip helpKey="duelRadarRating" />
                  </div>
                  <span className="block text-[10px] text-slate-400">VALOR.</span>
                </div>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-300 truncate">
                {statsA.pts.toFixed(1)} PTS · {statsA.reb.toFixed(1)} REB ·{' '}
                {statsA.ast.toFixed(1)} AST
              </div>
            </div>

            {/* Mobile Fighter B */}
            <div className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-1.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-sky-400 truncate">
                    {playerB?.teamAbbr || '—'} · {playerB?.position || '—'}
                  </div>
                  <button
                    type="button"
                    onClick={() => playerB && onInspectEntity('player', playerB.id)}
                    className="text-sm font-bold text-slate-100 hover:text-sky-300 text-left truncate block max-w-full"
                  >
                    {playerB?.name || '—'}
                  </button>
                </div>
                <div className="text-right shrink-0">
                  <div className="inline-flex items-center gap-1">
                    <span className="font-mono tabular-nums text-lg font-bold text-sky-400 leading-none">
                      {ovrB}
                    </span>
                    <MetricInfoTooltip helpKey="duelRadarRating" align="right" />
                  </div>
                  <span className="block text-[10px] text-slate-400">VALOR.</span>
                </div>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-300 truncate">
                {statsB.pts.toFixed(1)} PTS · {statsB.reb.toFixed(1)} REB ·{' '}
                {statsB.ast.toFixed(1)} AST
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-[#1E293B]">
            {/* Desktop Left Column: Player A Battle Card (xl:col-span-3) */}
            <div className="hidden xl:flex xl:col-span-3 p-5 flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-orange-400">
                      Esquina Naranja · {playerA?.teamAbbr}
                    </p>
                    <h3 className="mt-0.5 text-lg font-bold text-slate-100 leading-snug">
                      {playerA?.name || '—'}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {playerA
                        ? `${playerA.position}${
                            playerA.height ? ` · ${playerA.height}` : ''
                          } · ${statsA.gamesCount} PJ`
                        : '—'}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono tabular-nums text-3xl font-bold text-orange-400 leading-none">
                      {ovrA}
                    </div>
                    <div className="mt-1 inline-flex items-center justify-end gap-1 text-[11px] text-slate-400">
                      <span>Valoración</span>
                      <MetricInfoTooltip helpKey="duelRadarRating" align="left" />
                    </div>
                    <div className="mt-0.5 inline-flex items-center justify-end gap-1 text-[10px] font-mono tabular-nums text-slate-500">
                      <span>6 ejes: {simpleAvgA}</span>
                      <MetricInfoTooltip
                        helpKey="duelSimpleAxisAvg"
                        align="left"
                        iconClassName="w-3 h-3"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#1E293B] text-xs text-slate-300 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    <span className={tierA.textClass}>{tierA.label}</span>
                    <span className="text-slate-500">·</span>
                    <span className={`${roleA.textClass} truncate`}>{roleA.label}</span>
                  </div>
                  <MetricInfoTooltip helpKey="duelPlayerRole" align="left" />
                </div>

                <div className="grid grid-cols-2 gap-y-3 gap-x-4 pt-3 border-t border-[#1E293B]">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Puntos / PJ</span>
                      <MetricInfoTooltip
                        helpKey="ptsBase"
                        align="left"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-base font-bold text-slate-100">
                      {statsA.pts.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Rebotes / PJ</span>
                      <MetricInfoTooltip
                        helpKey="rebBase"
                        align="left"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-base font-bold text-slate-100">
                      {statsA.reb.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Asistencias</span>
                      <MetricInfoTooltip
                        helpKey="astBase"
                        align="left"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-base font-bold text-slate-100">
                      {statsA.ast.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Acierto TS%</span>
                      <MetricInfoTooltip
                        helpKey="tsPct"
                        align="left"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-base font-bold text-slate-100">
                      {statsA.tsPct.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Game Score</span>
                      <MetricInfoTooltip
                        helpKey="gmSc"
                        align="left"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-sm font-semibold text-slate-200">
                      {statsA.gmSc.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Minutos / PJ</span>
                      <MetricInfoTooltip
                        helpKey="minBase"
                        align="left"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-sm font-semibold text-slate-200">
                      {statsA.min.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              {playerA && (
                <div className="pt-3 border-t border-[#1E293B] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onInspectEntity('player', playerA.id)}
                    className="flex-1 py-2 px-3 text-xs font-semibold bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] text-slate-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Abrir ficha completa
                  </button>
                  <button
                    type="button"
                    aria-label="Seguir jugador 1"
                    onClick={() => onToggleWatchlist(`player:${playerA.id}`)}
                    className={`p-2 rounded-lg border transition-colors ${
                      watchedA
                        ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                        : 'bg-[#0B1120] border-[#1E293B] text-slate-400 hover:text-white'
                    }`}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        watchedA ? 'fill-orange-400 text-orange-400' : ''
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Center Arena: Superimposed 6-Axis Radar Chart + Interactive Pillar Selector (xl:col-span-6) */}
            <div className="xl:col-span-6 p-3.5 sm:p-5 flex flex-col items-center justify-between">
              {/* Legend Row */}
              <div className="w-full flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs">
                <span className="inline-flex items-center gap-2 font-semibold text-orange-300">
                  <span className="w-3 h-0.5 bg-orange-500 inline-block" />
                  <span>
                    {playerA?.name || 'Jugador 1'} ({ovrA})
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 font-semibold text-sky-300">
                  <span className="w-3 h-0.5 bg-sky-400 inline-block" />
                  <span>
                    {playerB?.name || 'Jugador 2'} ({ovrB})
                  </span>
                </span>
                {showNbaRing && (
                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                    <span className="w-3 border-t border-dashed border-slate-400 inline-block" />
                    <span>Media NBA (50)</span>
                  </span>
                )}
              </div>

              {/* Responsive SVG Spider/Radar Chart */}
              <div className="w-full max-w-[440px] mx-auto my-1">
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="w-full h-auto select-none overflow-visible"
                  role="img"
                  aria-label="Gráfico radar superpuesto de 6 ejes NBA"
                >
                  {/* Concentric Hexagon Grid Rings (25, 50, 75, 99) */}
                  {[25, 50, 75, 99].map((ringVal) => {
                    if (ringVal === 50 && showNbaRing) return null;
                    const pts = polygonPointsFor(Array(6).fill(ringVal));
                    return (
                      <polygon
                        key={ringVal}
                        points={pts}
                        fill="none"
                        stroke="#1E293B"
                        strokeWidth={ringVal === 99 ? 1.25 : 1}
                      />
                    );
                  })}

                  {/* NBA Rotation Average Reference Hexagon (50) */}
                  {showNbaRing && (
                    <polygon
                      points={polyLeague50}
                      fill="rgba(148, 163, 184, 0.04)"
                      stroke="#64748B"
                      strokeWidth="1.2"
                      strokeDasharray="4 3"
                    />
                  )}

                  {/* Radial Spokes */}
                  {radarAxes.map((ax, i) => {
                    const outer = axisPoint(i, 99);
                    const isFocused = selectedAxisIndex === i;
                    return (
                      <line
                        key={ax.key}
                        x1={cx}
                        y1={cy}
                        x2={outer.x}
                        y2={outer.y}
                        stroke={isFocused ? '#94A3B8' : '#1E293B'}
                        strokeWidth={isFocused ? 1.6 : 1}
                      />
                    );
                  })}

                  {/* Player B Polygon (Sky/Blue) */}
                  <polygon
                    points={polyB}
                    fill="rgba(56, 189, 248, 0.18)"
                    stroke="#38BDF8"
                    strokeWidth="2.4"
                    strokeLinejoin="round"
                  />

                  {/* Player A Polygon (Orange) */}
                  <polygon
                    points={polyA}
                    fill="rgba(249, 115, 22, 0.22)"
                    stroke="#F97316"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />

                  {/* Vertex Markers for Player B & Player A */}
                  {radarAxes.map((ax, i) => {
                    const ptB = axisPoint(i, ax.scoreB);
                    const ptA = axisPoint(i, ax.scoreA);
                    const isFocused = selectedAxisIndex === i;
                    return (
                      <g
                        key={ax.key}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedAxisIndex((prev) => (prev === i ? null : i))
                        }
                      >
                        <circle
                          cx={ptB.x}
                          cy={ptB.y}
                          r={isFocused ? 5.5 : 4}
                          fill="#0F172A"
                          stroke="#38BDF8"
                          strokeWidth="2.2"
                        />
                        <circle
                          cx={ptA.x}
                          cy={ptA.y}
                          r={isFocused ? 5.5 : 4}
                          fill="#F97316"
                          stroke="#0F172A"
                          strokeWidth="1.5"
                        />
                      </g>
                    );
                  })}

                  {/* Axis Labels + Live Scores Around Perimeter */}
                  {radarAxes.map((ax, i) => {
                    const labelPos = (() => {
                      if (i === 0) return { x: cx, y: 30, anchor: 'middle' as const };
                      if (i === 1) return { x: cx + 108, y: 112, anchor: 'start' as const };
                      if (i === 2) return { x: cx + 108, y: 246, anchor: 'start' as const };
                      if (i === 3) return { x: cx, y: 322, anchor: 'middle' as const };
                      if (i === 4) return { x: cx - 108, y: 246, anchor: 'end' as const };
                      return { x: cx - 108, y: 112, anchor: 'end' as const };
                    })();

                    const isFocused = selectedAxisIndex === i;

                    return (
                      <g
                        key={`lbl-${ax.key}`}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedAxisIndex((prev) => (prev === i ? null : i))
                        }
                      >
                        <text
                          x={labelPos.x}
                          y={labelPos.y}
                          textAnchor={labelPos.anchor}
                          className={`text-[12px] font-semibold fill-current ${
                            isFocused ? 'text-white' : 'text-slate-200'
                          }`}
                        >
                          {ax.shortLabel}
                        </text>
                        <text
                          x={labelPos.x}
                          y={labelPos.y + 15}
                          textAnchor={labelPos.anchor}
                          className="text-[11px] font-mono"
                        >
                          <tspan
                            fill="#FB923C"
                            fontWeight={ax.winner === 'A' ? '700' : '500'}
                          >
                            {ax.scoreA}
                          </tspan>
                          <tspan fill="#64748B"> · </tspan>
                          <tspan
                            fill="#38BDF8"
                            fontWeight={ax.winner === 'B' ? '700' : '500'}
                          >
                            {ax.scoreB}
                          </tspan>
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* 6-Pillar Interactive Breakdown Strip below Radar (each with its own (i) tooltip) */}
              <div className="w-full pt-3 border-t border-[#1E293B] space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {radarAxes.map((ax, idx) => {
                    const isSelected = selectedAxisIndex === idx;
                    return (
                      <div
                        key={ax.key}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setSelectedAxisIndex((prev) => (prev === idx ? null : idx))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedAxisIndex((prev) =>
                              prev === idx ? null : idx
                            );
                          }
                        }}
                        className={`min-h-[44px] px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between gap-1.5 ${
                          isSelected
                            ? 'bg-[#182338] border-orange-500/40'
                            : 'bg-[#0B1120] border-[#1E293B] hover:bg-[#162033]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <span className="text-xs font-medium text-slate-200 truncate">
                            {ax.label}
                          </span>
                          <MetricInfoTooltip
                            helpKey={ax.helpKey}
                            align="left"
                            iconClassName="w-3 h-3"
                          />
                        </span>
                        <span className="font-mono tabular-nums text-xs shrink-0">
                          <span
                            className={
                              ax.winner === 'A'
                                ? 'text-orange-400 font-bold'
                                : 'text-orange-300/80'
                            }
                          >
                            {ax.scoreA}
                          </span>
                          <span className="text-slate-600 mx-0.5">:</span>
                          <span
                            className={
                              ax.winner === 'B'
                                ? 'text-sky-400 font-bold'
                                : 'text-sky-300/80'
                            }
                          >
                            {ax.scoreB}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>

                {activeAxis && (
                  <div className="pt-2 border-t border-[#1E293B]/70 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-100">
                      <span>Detalle {activeAxis.label}</span>
                      <MetricInfoTooltip helpKey={activeAxis.helpKey} align="left" />
                    </span>
                    <span className="font-mono tabular-nums">
                      <span className="text-orange-300">
                        {shortA}: {activeAxis.rawTextA} ({activeAxis.scoreA}/99)
                      </span>
                      <span className="text-slate-500 mx-2">·</span>
                      <span className="text-sky-300">
                        {shortB}: {activeAxis.rawTextB} ({activeAxis.scoreB}/99)
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Desktop Right Column: Player B Battle Card (xl:col-span-3) */}
            <div className="hidden xl:flex xl:col-span-3 p-5 flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-sky-400">
                      Esquina Azul · {playerB?.teamAbbr}
                    </p>
                    <h3 className="mt-0.5 text-lg font-bold text-slate-100 leading-snug">
                      {playerB?.name || '—'}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {playerB
                        ? `${playerB.position}${
                            playerB.height ? ` · ${playerB.height}` : ''
                          } · ${statsB.gamesCount} PJ`
                        : '—'}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono tabular-nums text-3xl font-bold text-sky-400 leading-none">
                      {ovrB}
                    </div>
                    <div className="mt-1 inline-flex items-center justify-end gap-1 text-[11px] text-slate-400">
                      <span>Valoración</span>
                      <MetricInfoTooltip helpKey="duelRadarRating" align="right" />
                    </div>
                    <div className="mt-0.5 inline-flex items-center justify-end gap-1 text-[10px] font-mono tabular-nums text-slate-500">
                      <span>6 ejes: {simpleAvgB}</span>
                      <MetricInfoTooltip
                        helpKey="duelSimpleAxisAvg"
                        align="right"
                        iconClassName="w-3 h-3"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#1E293B] text-xs text-slate-300 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    <span className={tierB.textClass}>{tierB.label}</span>
                    <span className="text-slate-500">·</span>
                    <span className={`${roleB.textClass} truncate`}>{roleB.label}</span>
                  </div>
                  <MetricInfoTooltip helpKey="duelPlayerRole" align="right" />
                </div>

                <div className="grid grid-cols-2 gap-y-3 gap-x-4 pt-3 border-t border-[#1E293B]">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Puntos / PJ</span>
                      <MetricInfoTooltip
                        helpKey="ptsBase"
                        align="right"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-base font-bold text-slate-100">
                      {statsB.pts.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Rebotes / PJ</span>
                      <MetricInfoTooltip
                        helpKey="rebBase"
                        align="right"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-base font-bold text-slate-100">
                      {statsB.reb.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Asistencias</span>
                      <MetricInfoTooltip
                        helpKey="astBase"
                        align="right"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-base font-bold text-slate-100">
                      {statsB.ast.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Acierto TS%</span>
                      <MetricInfoTooltip
                        helpKey="tsPct"
                        align="right"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-base font-bold text-slate-100">
                      {statsB.tsPct.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Game Score</span>
                      <MetricInfoTooltip
                        helpKey="gmSc"
                        align="right"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-sm font-semibold text-slate-200">
                      {statsB.gmSc.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Minutos / PJ</span>
                      <MetricInfoTooltip
                        helpKey="minBase"
                        align="right"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="block font-mono tabular-nums text-sm font-semibold text-slate-200">
                      {statsB.min.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              {playerB && (
                <div className="pt-3 border-t border-[#1E293B] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onInspectEntity('player', playerB.id)}
                    className="flex-1 py-2 px-3 text-xs font-semibold bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] text-slate-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Abrir ficha completa
                  </button>
                  <button
                    type="button"
                    aria-label="Seguir jugador 2"
                    onClick={() => onToggleWatchlist(`player:${playerB.id}`)}
                    className={`p-2 rounded-lg border transition-colors ${
                      watchedB
                        ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                        : 'bg-[#0B1120] border-[#1E293B] text-slate-400 hover:text-white'
                    }`}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        watchedB ? 'fill-orange-400 text-orange-400' : ''
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Row 4: Sports Video-Game Category Scoreboard (Tug-of-War Breakdown) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">
              02. Marcador de Categorías Ganadas ({scoreboard.winsA} - {scoreboard.winsB}
              {scoreboard.ties > 0 ? ` · ${scoreboard.ties} emp.` : ''})
            </h2>
            <MetricInfoTooltip helpKey="duelCategoryScore" align="left" />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
            {(
              [
                { id: 'all', label: `Todas (${allCategories.length})` },
                {
                  id: 'basic',
                  label: `Básicas (${
                    allCategories.filter((c) => c.group === 'basic').length
                  })`,
                },
                {
                  id: 'advanced',
                  label: `Avanzadas (${
                    allCategories.filter((c) => c.group === 'advanced').length
                  })`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCategoryTab(tab.id);
                  if (tab.id === 'advanced' && experienceMode === 'simple') {
                    onSwitchToAdvanced();
                  }
                }}
                className={`min-h-[32px] sm:min-h-0 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  categoryTab === tab.id
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden">
          {/* Arcade Scoreboard Dominance Bar */}
          <div className="p-3.5 sm:p-4 bg-[#0F172A]/70 border-b border-[#1E293B] space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono tabular-nums text-lg sm:text-xl font-bold text-orange-400">
                  {scoreboard.winsA}
                </span>
                <span className="font-semibold text-slate-100 truncate">
                  {playerA?.name || 'Jugador 1'}
                </span>
              </div>

              <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap shrink-0">
                {scoreboard.ties > 0
                  ? `${scoreboard.ties} empate${scoreboard.ties > 1 ? 's' : ''}`
                  : 'Cara a Cara'}
              </span>

              <div className="flex items-center gap-2 min-w-0 justify-end">
                <span className="font-semibold text-slate-100 truncate text-right">
                  {playerB?.name || 'Jugador 2'}
                </span>
                <span className="font-mono tabular-nums text-lg sm:text-xl font-bold text-sky-400">
                  {scoreboard.winsB}
                </span>
              </div>
            </div>

            {/* Proportional 3-Segment Scoreboard Meter */}
            <div className="h-2.5 w-full rounded-full bg-[#0B1120] overflow-hidden flex border border-[#1E293B]">
              <div
                className="h-full bg-orange-500 transition-all duration-150"
                style={{
                  width: `${
                    scoreboard.total > 0
                      ? (scoreboard.winsA / scoreboard.total) * 100
                      : 50
                  }%`,
                }}
              />
              {scoreboard.ties > 0 && (
                <div
                  className="h-full bg-slate-600 transition-all duration-150"
                  style={{
                    width: `${(scoreboard.ties / scoreboard.total) * 100}%`,
                  }}
                />
              )}
              <div
                className="h-full bg-sky-400 transition-all duration-150"
                style={{
                  width: `${
                    scoreboard.total > 0
                      ? (scoreboard.winsB / scoreboard.total) * 100
                      : 50
                  }%`,
                }}
              />
            </div>
          </div>

          {statsA.gamesCount === 0 || statsB.gamesCount === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-sm font-medium text-slate-200">
                Sin partidos suficientes en el filtro "{scopeLabel}"
              </p>
              <p className="text-xs text-slate-400">
                Cambia a "Temporada completa" para comparar todos los registros disponibles de ambos jugadores.
              </p>
              <button
                type="button"
                onClick={() => setScope('season')}
                className="mt-2 px-3.5 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors"
              >
                Ver temporada completa
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Scannable Tug-of-War Cards (< md) */}
              <div className="md:hidden divide-y divide-[#1E293B]">
                {visibleCategories.map((row) => {
                  const rowTitle =
                    experienceMode === 'simple' ? row.simpleLabel : row.label;
                  return (
                    <div key={row.id} className="p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200 min-w-0">
                          <span className="truncate">{rowTitle}</span>
                          <MetricInfoTooltip helpKey={row.helpKey} align="left" />
                        </span>
                        <span
                          className={`text-[11px] font-mono tabular-nums font-semibold whitespace-nowrap shrink-0 ${
                            row.winner === 'A'
                              ? 'text-orange-400'
                              : row.winner === 'B'
                              ? 'text-sky-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {row.winner === 'A'
                            ? `★ +${row.advantageAbs.toFixed(row.decimals)} ${shortA}`
                            : row.winner === 'B'
                            ? `★ +${row.advantageAbs.toFixed(row.decimals)} ${shortB}`
                            : 'Empate'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-14 font-mono tabular-nums text-xs text-left shrink-0 ${
                            row.winner === 'A'
                              ? 'text-orange-300 font-bold'
                              : 'text-slate-300'
                          }`}
                        >
                          {formatMetricVal(
                            row.valA,
                            row.decimals,
                            row.suffix,
                            row.signed
                          )}
                        </span>

                        <div className="flex-1 h-2 rounded-full bg-[#0B1120] border border-[#1E293B] overflow-hidden flex">
                          <div
                            className={`h-full transition-all duration-150 ${
                              row.winner === 'A'
                                ? 'bg-orange-500'
                                : 'bg-orange-500/45'
                            }`}
                            style={{ width: `${row.shareA}%` }}
                          />
                          <div
                            className={`h-full transition-all duration-150 ${
                              row.winner === 'B' ? 'bg-sky-400' : 'bg-sky-400/45'
                            }`}
                            style={{ width: `${100 - row.shareA}%` }}
                          />
                        </div>

                        <span
                          className={`w-14 font-mono tabular-nums text-xs text-right shrink-0 ${
                            row.winner === 'B'
                              ? 'text-sky-300 font-bold'
                              : 'text-slate-300'
                          }`}
                        >
                          {formatMetricVal(
                            row.valB,
                            row.decimals,
                            row.suffix,
                            row.signed
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Symmetrical Tale-of-the-Tape Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                      <th className="py-2.5 pl-4 pr-3 font-medium">Categoría NBA</th>
                      <th className="py-2.5 px-3 font-medium text-right text-orange-300 whitespace-nowrap">
                        {playerA?.name || 'Jugador 1'}
                      </th>
                      <th className="py-2.5 px-4 font-medium text-center w-56">
                        <div className="inline-flex items-center justify-center">
                          <ColumnHelpHeader
                            label="Pulso directo"
                            helpKey="duelTugOfWar"
                          />
                        </div>
                      </th>
                      <th className="py-2.5 px-3 font-medium text-left text-sky-300 whitespace-nowrap">
                        {playerB?.name || 'Jugador 2'}
                      </th>
                      <th className="py-2.5 pl-3 pr-4 font-medium text-right">
                        <ColumnHelpHeader
                          label="Punto de categoría"
                          helpKey="duelCategoryScore"
                          align="right"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] text-sm">
                    {visibleCategories.map((row) => {
                      const rowTitle =
                        experienceMode === 'simple' ? row.simpleLabel : row.label;
                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-[#182338] transition-colors"
                        >
                          <td className="py-2.5 pl-4 pr-3">
                            <span className="inline-flex items-center gap-1.5 font-medium text-slate-200 whitespace-nowrap">
                              <span>{rowTitle}</span>
                              <MetricInfoTooltip
                                helpKey={row.helpKey}
                                align="left"
                              />
                            </span>
                          </td>

                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                              row.winner === 'A'
                                ? 'text-orange-400 font-bold'
                                : 'text-slate-300'
                            }`}
                          >
                            {row.winner === 'A' ? '★ ' : ''}
                            {formatMetricVal(
                              row.valA,
                              row.decimals,
                              row.suffix,
                              row.signed
                            )}
                          </td>

                          <td className="py-2.5 px-4">
                            <div className="h-2.5 w-full rounded-full bg-[#0B1120] border border-[#1E293B] overflow-hidden flex">
                              <div
                                className={`h-full transition-all duration-150 ${
                                  row.winner === 'A'
                                    ? 'bg-orange-500'
                                    : 'bg-orange-500/40'
                                }`}
                                style={{ width: `${row.shareA}%` }}
                              />
                              <div
                                className={`h-full transition-all duration-150 ${
                                  row.winner === 'B'
                                    ? 'bg-sky-400'
                                    : 'bg-sky-400/40'
                                }`}
                                style={{ width: `${100 - row.shareA}%` }}
                              />
                            </div>
                          </td>

                          <td
                            className={`py-2.5 px-3 text-left font-mono tabular-nums whitespace-nowrap ${
                              row.winner === 'B'
                                ? 'text-sky-400 font-bold'
                                : 'text-slate-300'
                            }`}
                          >
                            {formatMetricVal(
                              row.valB,
                              row.decimals,
                              row.suffix,
                              row.signed
                            )}
                            {row.winner === 'B' ? ' ★' : ''}
                          </td>

                          <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                            {row.winner === 'A' ? (
                              <span className="text-orange-400 font-semibold">
                                +{row.advantageAbs.toFixed(row.decimals)}{' '}
                                {row.shortUnit} · {shortA}
                              </span>
                            ) : row.winner === 'B' ? (
                              <span className="text-sky-400 font-semibold">
                                +{row.advantageAbs.toFixed(row.decimals)}{' '}
                                {row.shortUnit} · {shortB}
                              </span>
                            ) : (
                              <span className="text-slate-400">Empate técnico</span>
                            )}
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
      </section>

      {/* Row 5: Automated Duel Verdict & Matchup Keys */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-orange-400 shrink-0" />
          <h2 className="text-sm font-semibold text-slate-100">
            03. Veredicto del Duelo ({scopeLabel})
          </h2>
          <MetricInfoTooltip helpKey="duelVerdictCalc" align="left" />
        </div>

        <ul className="space-y-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
          {verdictNotes.map((note, idx) => (
            <li
              key={idx}
              className="pb-2 border-b border-[#1E293B]/70 last:border-b-0 last:pb-0"
            >
              {note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
