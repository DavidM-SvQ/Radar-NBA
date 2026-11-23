import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  Check,
  Edit3,
  Plus,
  Search,
  Sparkles,
  Swords,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import type {
  FantasyAbsenceTier,
  FantasyInjurySeverity,
  FantasyManualLeagueState,
  FantasyPlayerInjuryAlert,
  FantasyProjectionMode,
  FantasyTeamGameSlot,
  FantasyWeekWindow,
  PlayerSummary,
  TeamSummary,
} from '../types/nba';
import {
  OFFICIAL_LEAGUE_RULES,
  computeOfficialGameFptsBreakdown,
  computeWeeklyLockProjection,
  formatFptsExact,
  type PlayerAvailabilityContext,
  type PlayerOfficialFantasyStats,
  type WeeklyLockProjectionResult,
} from '../utils/fantasyScoring';
import { normalizeSearchText } from '../utils/analytics';
import { buildAllSeasonFantasyWeeks } from '../utils/staticSchedule';
import { PlayerAvatar } from './NbaVisuals';
import { SortableTh } from './MetricUiHelpers';
import { ExportImageButton } from './ExportImageButton';
import { buildComparisonSnapshotBlob } from '../utils/exportImageCard';
import { STICKY_THEAD_CLASS } from '../utils/tableSort';

export const MY_TEAM_KEY = '__MY_TEAM__';
const CUSTOM_TEAM_A_KEY = '__CUSTOM_A__';
const CUSTOM_TEAM_B_KEY = '__CUSTOM_B__';
const STORAGE_MATCHUP_10V10_KEY = 'radarnba_fantasy_matchup_10v10_v1';

export interface FantasyEnrichedPlayerItem {
  player: PlayerSummary;
  stats: PlayerOfficialFantasyStats;
  teamSched: { gamesCount: number; b2bCount: number; games: FantasyTeamGameSlot[] };
  injury: FantasyPlayerInjuryAlert | null;
  severity: FantasyInjurySeverity;
  availabilityContext: PlayerAvailabilityContext;
  weekly: WeeklyLockProjectionResult;
}

const round1 = (val: number): number => Math.round(val * 10) / 10;
const round2 = (val: number): number => Math.round(val * 100) / 100;

function countPlayerCorrections(
  playerId: string,
  gameCorrections?: FantasyManualLeagueState['gameCorrections']
): number {
  if (!gameCorrections) return 0;
  let count = 0;
  for (const [k, v] of Object.entries(gameCorrections)) {
    if (k.startsWith(`${playerId}:`) && v && Math.abs(v.fptsDelta || 0) > 0.001) {
      count += 1;
    }
  }
  return count;
}

function renderMiniSeverityLabel(
  severity: FantasyInjurySeverity,
  absenceTier?: FantasyAbsenceTier,
  statusLabelEs?: string
) {
  if (absenceTier === 'long_term' || severity === 'ir' || severity === 'suspended') {
    return (
      <span className="text-rose-400 font-semibold">
        {statusLabelEs || 'Baja larga'}
      </span>
    );
  }
  if (absenceTier === 'b2b_rest') {
    return (
      <span className="text-sky-300 font-medium">
        {statusLabelEs || 'Riesgo B2B'}
      </span>
    );
  }
  if (severity !== 'healthy') {
    return (
      <span className="text-amber-300 font-medium">
        {statusLabelEs || 'DTD / Duda'}
      </span>
    );
  }
  return <span className="text-emerald-400 font-medium">Sano</span>;
}

// ============================================================================
// 1. TAB: EQUIPOS DE LA LIGA (VER TODOS LOS EQUIPOS, PUNTOS Y RECTIFICAR)
// ============================================================================

interface FantasyLeagueTeamsTabProps {
  leagueState: FantasyManualLeagueState;
  rivalSlotKeys: string[];
  getRivalDisplayName: (teamKey: string) => string;
  enrichedById: Map<string, FantasyEnrichedPlayerItem>;
  activeWeek: FantasyWeekWindow | null;
  onInspectEntity: (type: 'player' | 'team', id: string) => void;
  onInspectPlayerLogs: (playerId: string) => void;
  onOpenTeamManager: (teamKey: string) => void;
  onCompareTeams: (teamAKey: string, teamBKey?: string) => void;
}

type LeagueRosterSortKey =
  | 'rank'
  | 'name'
  | 'severity'
  | 'gamesCount'
  | 'seasonTotalFpts'
  | 'seasonAvgFpts'
  | 'last5AvgFpts'
  | 'lockAdjustedFpts';

export function FantasyLeagueTeamsTab({
  leagueState,
  rivalSlotKeys,
  getRivalDisplayName,
  enrichedById,
  activeWeek,
  onInspectEntity,
  onInspectPlayerLogs,
  onOpenTeamManager,
  onCompareTeams,
}: FantasyLeagueTeamsTabProps) {
  const [selectedTeamKey, setSelectedTeamKey] = useState<string>(() => {
    const firstPopulatedRival = rivalSlotKeys.find(
      (k) => (leagueState.rivalRosters?.[k]?.length || 0) > 0
    );
    return firstPopulatedRival || MY_TEAM_KEY;
  });
  const [showEmptyRivals, setShowEmptyRivals] = useState<boolean>(false);
  const [playerQuery, setPlayerQuery] = useState<string>('');
  const [sortKey, setSortKey] = useState<LeagueRosterSortKey>('lockAdjustedFpts');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const handleSort = (key: LeagueRosterSortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'name' || key === 'rank' || key === 'severity');
    }
  };

  interface TeamSummaryCard {
    key: string;
    isMyTeam: boolean;
    name: string;
    playerIds: string[];
    items: Array<FantasyEnrichedPlayerItem & { slotTag: string; isTop10: boolean }>;
    seasonTotalFpts: number;
    avgPerPlayer: number;
    top10WeekProjFpts: number;
    correctionsCount: number;
  }

  const allLeagueTeams = useMemo<TeamSummaryCard[]>(() => {
    const buildTeamCard = (
      key: string,
      isMyTeam: boolean,
      name: string,
      rawIds: string[]
    ): TeamSummaryCard => {
      const itemsBase = rawIds
        .map((pid) => enrichedById.get(pid))
        .filter((x): x is FantasyEnrichedPlayerItem => Boolean(x));

      const sortedByProj = [...itemsBase].sort(
        (a, b) =>
          b.weekly.lockAdjustedFpts - a.weekly.lockAdjustedFpts ||
          b.stats.seasonAvgFpts - a.stats.seasonAvgFpts
      );
      const top10Ids = new Set(
        isMyTeam
          ? leagueState.roster
              .filter((c) => c.slot === 'starter')
              .map((c) => c.playerId)
          : sortedByProj.slice(0, OFFICIAL_LEAGUE_RULES.activeStarters).map((x) => x.player.id)
      );

      const items = itemsBase.map((item, idx) => {
        let slotTag = `#${idx + 1}`;
        if (isMyTeam) {
          const contract = leagueState.roster.find((c) => c.playerId === item.player.id);
          slotTag = contract?.slot === 'starter' ? 'TIT' : contract?.slot === 'ir' ? 'IR' : 'RES';
        } else {
          slotTag = top10Ids.has(item.player.id) ? 'TOP 10' : 'RES';
        }
        return {
          ...item,
          slotTag,
          isTop10: top10Ids.has(item.player.id),
        };
      });

      const seasonTotalFpts = round2(
        items.reduce((acc, it) => acc + it.stats.seasonTotalFpts, 0)
      );
      const activeWithGames = items.filter((it) => it.stats.gamesPlayed > 0);
      const avgPerPlayer =
        activeWithGames.length > 0
          ? round1(
              activeWithGames.reduce((acc, it) => acc + it.stats.seasonAvgFpts, 0) /
                activeWithGames.length
            )
          : 0;
      const top10WeekProjFpts = round1(
        items
          .filter((it) => it.isTop10)
          .reduce((acc, it) => acc + it.weekly.lockAdjustedFpts, 0)
      );
      const correctionsCount = items.reduce(
        (acc, it) =>
          acc + countPlayerCorrections(it.player.id, leagueState.gameCorrections),
        0
      );

      return {
        key,
        isMyTeam,
        name,
        playerIds: rawIds,
        items,
        seasonTotalFpts,
        avgPerPlayer,
        top10WeekProjFpts,
        correctionsCount,
      };
    };

    const myTeam = buildTeamCard(
      MY_TEAM_KEY,
      true,
      leagueState.myTeamName || 'Mi Equipo Fantasy',
      leagueState.roster.map((c) => c.playerId)
    );

    const rivals = rivalSlotKeys.map((rKey) =>
      buildTeamCard(
        rKey,
        false,
        getRivalDisplayName(rKey),
        leagueState.rivalRosters?.[rKey] || []
      )
    );

    return [myTeam, ...rivals];
  }, [leagueState, rivalSlotKeys, getRivalDisplayName, enrichedById]);

  const visibleTeams = useMemo(() => {
    const populated = allLeagueTeams.filter(
      (t) => t.isMyTeam || t.items.length > 0
    );
    if (showEmptyRivals || populated.length <= 1) return allLeagueTeams;
    return populated;
  }, [allLeagueTeams, showEmptyRivals]);

  const emptyRivalCount = useMemo(
    () => allLeagueTeams.filter((t) => !t.isMyTeam && t.items.length === 0).length,
    [allLeagueTeams]
  );

  const selectedTeam = useMemo(() => {
    return (
      allLeagueTeams.find((t) => t.key === selectedTeamKey) ||
      allLeagueTeams[0] ||
      null
    );
  }, [allLeagueTeams, selectedTeamKey]);

  const sortedDisplayedRoster = useMemo(() => {
    if (!selectedTeam) return [];
    const q = normalizeSearchText(playerQuery);
    const filtered = selectedTeam.items.filter((item) => {
      if (!q) return true;
      return normalizeSearchText(
        `${item.player.name} ${item.player.teamAbbr} ${item.player.position}`
      ).includes(q);
    });

    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'rank':
          cmp = (a.isTop10 ? 0 : 1) - (b.isTop10 ? 0 : 1) ||
            b.weekly.lockAdjustedFpts - a.weekly.lockAdjustedFpts;
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
        case 'lockAdjustedFpts':
        default:
          cmp = a.weekly.lockAdjustedFpts - b.weekly.lockAdjustedFpts;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [selectedTeam, playerQuery, sortKey, sortAsc]);

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {/* League Teams Grid Selector */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Equipos de la Liga Fantasy ({allLeagueTeams.filter((t) => t.items.length > 0).length} con plantilla)
            </h3>
            <p className="text-xs text-slate-400">
              Pulsa en cualquier equipo para inspeccionar los puntos de todos sus jugadores, auditar sus partidos o rectificar discrepancias (± FPTS).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {emptyRivalCount > 0 && (
              <button
                type="button"
                onClick={() => setShowEmptyRivals((v) => !v)}
                className="px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-500 text-slate-300 rounded-lg transition-colors whitespace-nowrap"
              >
                {showEmptyRivals
                  ? 'Ocultar plazas vacías'
                  : `Mostrar plazas vacías (${emptyRivalCount})`}
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenTeamManager('team_1')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Gestionar Rivales</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {visibleTeams.map((team) => {
            const isSelected = selectedTeam?.key === team.key;
            return (
              <div
                key={team.key}
                className={`rounded-lg border transition-colors p-3 flex flex-col justify-between gap-2 ${
                  isSelected
                    ? 'bg-[#182338] border-orange-500/70'
                    : 'bg-[#0B1120] border-[#1E293B] hover:border-slate-600'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedTeamKey(team.key)}
                  className="text-left w-full space-y-1.5 focus:outline-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-100 truncate">
                      {team.name}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-semibold shrink-0 ${
                        team.isMyTeam
                          ? 'text-orange-400'
                          : team.items.length > 0
                          ? 'text-emerald-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {team.isMyTeam ? 'Tu equipo' : `${team.items.length} jug.`}
                    </span>
                  </div>

                  {team.items.length > 0 ? (
                    <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] font-mono tabular-nums border-t border-[#1E293B]/70">
                      <div>
                        <span className="block text-[10px] font-sans text-slate-400">
                          Temp.
                        </span>
                        <span className="font-semibold text-slate-200">
                          {formatFptsExact(team.seasonTotalFpts)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-sans text-slate-400">
                          Media/PJ
                        </span>
                        <span className="font-semibold text-slate-200">
                          {team.avgPerPlayer.toFixed(1)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] font-sans text-slate-400">
                          Proy. Sem
                        </span>
                        <span className="font-bold text-orange-400">
                          {team.top10WeekProjFpts.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 pt-1 border-t border-[#1E293B]/60">
                      Sin jugadores asignados todavía
                    </p>
                  )}
                </button>

                <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                  <span className="text-slate-400 font-mono">
                    {team.correctionsCount > 0 ? (
                      <span className="text-amber-300">
                        {team.correctionsCount} corr. ±
                      </span>
                    ) : team.isMyTeam ? (
                      `${team.items.length}/12 cont.`
                    ) : (
                      'Sin ajustes ±'
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!team.isMyTeam && team.items.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onCompareTeams(MY_TEAM_KEY, team.key)}
                        className="px-2 py-0.5 rounded bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/60 text-orange-300 hover:text-orange-200 font-medium transition-colors whitespace-nowrap"
                        title={`Comparar Mi Equipo vs ${team.name} (10 vs 10)`}
                      >
                        Comparar 10v10
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedTeamKey(team.key)}
                      className={`px-2 py-0.5 rounded font-medium transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'bg-[#131C2E] text-slate-300 hover:text-white border border-[#1E293B]'
                      }`}
                    >
                      {isSelected ? 'Viendo' : 'Ver puntos'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Selected Team Full Roster & Points Rectification Table */}
      {selectedTeam && (
        <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden min-w-0 max-w-full">
          <div className="px-4 py-3.5 bg-[#0F172A]/70 border-b border-[#1E293B] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100">
                  {selectedTeam.name}
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  · {selectedTeam.items.length} jugadores · Total Temp:{' '}
                  <strong className="text-slate-100">
                    {formatFptsExact(selectedTeam.seasonTotalFpts)} FPTS
                  </strong>{' '}
                  · Proy. {activeWeek?.label || 'Semana'} (Top 10):{' '}
                  <strong className="text-orange-400">
                    {selectedTeam.top10WeekProjFpts.toFixed(1)} FPTS
                  </strong>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Haz clic en <strong className="text-amber-300">Rectificar (±)</strong> o sobre el total de puntos de cualquier jugador para abrir su historial partido a partido y ajustar sus puntos Fantasy.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={playerQuery}
                  onChange={(e) => setPlayerQuery(e.target.value)}
                  placeholder="Filtrar jugador..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 w-44"
                />
              </div>
              {selectedTeam.items.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onCompareTeams(
                      MY_TEAM_KEY,
                      selectedTeam.isMyTeam ? undefined : selectedTeam.key
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0B1120] border border-orange-500/50 hover:bg-orange-500/15 text-orange-300 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Swords className="w-3.5 h-3.5" />
                  <span>Ir a Comparativa 10v10</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenTeamManager(selectedTeam.key)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-500 text-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <Edit3 className="w-3.5 h-3.5 text-orange-400" />
                <span>Editar plantilla</span>
              </button>
            </div>
          </div>

          {selectedTeam.items.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-200">
                {selectedTeam.name} aún no tiene jugadores asignados
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Puedes pegar su lista de ESPN o añadir jugadores uno a uno desde el gestor para ver sus puntos y rectificarlos aquí.
              </p>
              <button
                type="button"
                onClick={() => onOpenTeamManager(selectedTeam.key)}
                className="px-4 py-2 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors"
              >
                Asignar jugadores a {selectedTeam.name}
              </button>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse table-auto text-xs">
                <thead className={STICKY_THEAD_CLASS}>
                  <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                    <SortableTh
                      label="Rol"
                      align="left"
                      active={sortKey === 'rank'}
                      asc={sortAsc}
                      onSort={() => handleSort('rank')}
                      className="py-2.5 pl-3 pr-2 w-16"
                    />
                    <SortableTh
                      label="Jugador"
                      align="left"
                      active={sortKey === 'name'}
                      asc={sortAsc}
                      onSort={() => handleSort('name')}
                      className="py-2.5 px-2 min-w-[160px]"
                    />
                    <SortableTh
                      label="Salud"
                      align="left"
                      active={sortKey === 'severity'}
                      asc={sortAsc}
                      onSort={() => handleSort('severity')}
                      className="py-2.5 px-2"
                    />
                    <SortableTh
                      label="PJ Sem."
                      align="left"
                      active={sortKey === 'gamesCount'}
                      asc={sortAsc}
                      onSort={() => handleSort('gamesCount')}
                      className="py-2.5 px-2"
                    />
                    <SortableTh
                      label="Total Temp."
                      align="right"
                      active={sortKey === 'seasonTotalFpts'}
                      asc={sortAsc}
                      onSort={() => handleSort('seasonTotalFpts')}
                      className="py-2.5 px-2"
                    />
                    <SortableTh
                      label="Media/PJ"
                      align="right"
                      active={sortKey === 'seasonAvgFpts'}
                      asc={sortAsc}
                      onSort={() => handleSort('seasonAvgFpts')}
                      className="py-2.5 px-2"
                    />
                    <SortableTh
                      label="Últ. 5"
                      align="right"
                      active={sortKey === 'last5AvgFpts'}
                      asc={sortAsc}
                      onSort={() => handleSort('last5AvgFpts')}
                      className="py-2.5 px-2"
                    />
                    <SortableTh
                      label="Proy. Sem."
                      align="right"
                      active={sortKey === 'lockAdjustedFpts'}
                      asc={sortAsc}
                      onSort={() => handleSort('lockAdjustedFpts')}
                      className="py-2.5 px-2"
                    />
                    <th className="py-2.5 pl-2 pr-3 text-right font-medium text-slate-400">
                      Rectificar
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/80">
                  {sortedDisplayedRoster.map((item) => {
                    const corrCount = countPlayerCorrections(
                      item.player.id,
                      leagueState.gameCorrections
                    );
                    const schedSummary = item.teamSched.games
                      .map(
                        (g) =>
                          `${g.dayShortEs || g.dateIso} ${g.isHome ? 'vs' : '@'}${g.opponentAbbr}`
                      )
                      .join(' · ');

                    return (
                      <tr
                        key={item.player.id}
                        className="hover:bg-[#182338] transition-colors"
                      >
                        <td className="py-2 pl-3 pr-2 font-mono text-[11px] whitespace-nowrap">
                          <span
                            className={
                              item.isTop10
                                ? 'font-bold text-emerald-400'
                                : 'text-slate-400'
                            }
                          >
                            {item.slotTag}
                          </span>
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
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
                                className="font-semibold text-slate-100 hover:text-orange-400 transition-colors text-left"
                              >
                                {item.player.name}
                              </button>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {item.player.teamAbbr} · {item.player.position} ·{' '}
                                {item.stats.gamesPlayed} PJ
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-xs whitespace-nowrap">
                          {renderMiniSeverityLabel(
                            item.severity,
                            item.weekly.absenceTier,
                            item.injury?.statusLabelEs
                          )}
                        </td>
                        <td
                          className="py-2 px-2 font-mono tabular-nums text-slate-200 whitespace-nowrap"
                          title={schedSummary || 'Sin partidos esta semana'}
                        >
                          {item.teamSched.gamesCount} PJ
                          {item.teamSched.b2bCount > 0 ? ` (${item.teamSched.b2bCount}B)` : ''}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onInspectPlayerLogs(item.player.id)}
                            className="inline-flex items-center justify-end gap-1 hover:text-amber-300 transition-colors"
                            title="Ver partidos y rectificar puntos Fantasy (±)"
                          >
                            <span className="font-semibold text-slate-100">
                              {formatFptsExact(item.stats.seasonTotalFpts)}
                            </span>
                            {corrCount > 0 && (
                              <span className="text-[10px] text-amber-300 font-bold">
                                ({corrCount}±)
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-200">
                          {item.stats.seasonAvgFpts.toFixed(1)}
                        </td>
                        <td
                          className={`py-2 px-2 text-right font-mono tabular-nums font-medium ${
                            item.stats.formDeltaLast5 >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {item.stats.last5AvgFpts.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-orange-400 whitespace-nowrap">
                          {item.weekly.lockAdjustedFpts.toFixed(1)}
                        </td>
                        <td className="py-2 pl-2 pr-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onInspectPlayerLogs(item.player.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                              corrCount > 0
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 hover:bg-amber-500/30'
                                : 'bg-[#0B1120] border-[#1E293B] hover:border-amber-500/50 text-slate-300 hover:text-amber-200'
                            }`}
                          >
                            <Edit3 className="w-3 h-3 text-amber-400" />
                            <span>Rectificar</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ============================================================================
// 2. TAB: COMPARATIVA DE DOS EQUIPOS (10 vs 10 EN LA JORNADA)
// ============================================================================

interface StoredMatchupSetup {
  weekId?: string;
  teamAKey: string;
  teamBKey: string;
  selectedIdsByTeam: Record<string, string[]>;
  customPoolA: string[];
  customPoolB: string[];
}

function loadStoredMatchupSetup(fallbackTeamA: string, fallbackTeamB: string): StoredMatchupSetup {
  try {
    const raw = localStorage.getItem(STORAGE_MATCHUP_10V10_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredMatchupSetup>;
      if (parsed && typeof parsed === 'object') {
        return {
          weekId: typeof parsed.weekId === 'string' ? parsed.weekId : undefined,
          teamAKey: typeof parsed.teamAKey === 'string' ? parsed.teamAKey : fallbackTeamA,
          teamBKey: typeof parsed.teamBKey === 'string' ? parsed.teamBKey : fallbackTeamB,
          selectedIdsByTeam:
            parsed.selectedIdsByTeam && typeof parsed.selectedIdsByTeam === 'object'
              ? parsed.selectedIdsByTeam
              : {},
          customPoolA: Array.isArray(parsed.customPoolA) ? parsed.customPoolA : [],
          customPoolB: Array.isArray(parsed.customPoolB) ? parsed.customPoolB : [],
        };
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return {
    teamAKey: fallbackTeamA,
    teamBKey: fallbackTeamB,
    selectedIdsByTeam: {},
    customPoolA: [],
    customPoolB: [],
  };
}

interface FantasyMatchupComparatorTabProps {
  leagueState: FantasyManualLeagueState;
  rivalSlotKeys: string[];
  getRivalDisplayName: (teamKey: string) => string;
  enrichedCatalog: FantasyEnrichedPlayerItem[];
  enrichedById: Map<string, FantasyEnrichedPlayerItem>;
  teamsByAbbr: Map<string, TeamSummary>;
  effectiveWeeks: FantasyWeekWindow[];
  projectionMode: FantasyProjectionMode;
  onChangeProjectionMode: (mode: FantasyProjectionMode) => void;
  onInspectEntity: (type: 'player' | 'team', id: string) => void;
  onInspectPlayerLogs: (playerId: string) => void;
  requestedPair?: { teamAKey: string; teamBKey?: string; nonce: number } | null;
}

interface PlayerMatchupEvaluation {
  item: FantasyEnrichedPlayerItem;
  playedGames: number;
  teamElapsedGames: number;
  missedElapsedGames: number;
  scheduledTotalGames: number;
  remainingGames: number;
  actualFpts: number;
  expectedSoFar: number;
  deviationVsSeason: number;
  playedAvgFpts: number | null;
  remainingProjectedFpts: number;
  projectedFinalFpts: number;
  correctionsInWeek: number;
  weekGameDetails: Array<{
    date: string;
    opponentAbbr: string;
    isHome: boolean;
    fpts: number;
    hasCorrection: boolean;
  }>;
}

export function FantasyMatchupComparatorTab({
  leagueState,
  rivalSlotKeys,
  getRivalDisplayName,
  enrichedCatalog,
  enrichedById,
  teamsByAbbr,
  effectiveWeeks,
  projectionMode,
  onChangeProjectionMode,
  onInspectEntity,
  onInspectPlayerLogs,
  requestedPair,
}: FantasyMatchupComparatorTabProps) {
  const allMatchupWeeks = useMemo(
    () => buildAllSeasonFantasyWeeks(effectiveWeeks),
    [effectiveWeeks]
  );

  // Latest NBA game date present in the 2026-27 dataset
  const latestLeagueGameDate2027 = useMemo(() => {
    let maxDate = '';
    for (const item of enrichedCatalog) {
      for (const g of item.player.games || []) {
        if (g.seasonLabel === '2026-27' && g.date > maxDate) {
          maxDate = g.date;
        }
      }
    }
    return maxDate || '2026-11-18';
  }, [enrichedCatalog]);

  // Identify weeks that actually contain played 2026-27 games so default isn't an all-zero unstarted week
  const weekPlayedCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const wk of allMatchupWeeks) {
      let cnt = 0;
      for (const item of enrichedCatalog) {
        for (const g of item.player.games || []) {
          if (g.seasonLabel === '2026-27' && g.date >= wk.startIso && g.date <= wk.endIso) {
            cnt += 1;
          }
        }
        if (cnt > 20) break;
      }
      map.set(wk.id, cnt);
    }
    return map;
  }, [allMatchupWeeks, enrichedCatalog]);

  const defaultMatchupWeekId = useMemo(() => {
    const currentWk = allMatchupWeeks.find((w) => w.id === 'current');
    if (currentWk && (weekPlayedCountMap.get(currentWk.id) || 0) > 0) {
      return currentWk.id;
    }
    // Otherwise pick the most recent week with played games (e.g. active in-progress week)
    const withData = allMatchupWeeks.filter((w) => (weekPlayedCountMap.get(w.id) || 0) > 0);
    if (withData.length > 0) {
      return withData[withData.length - 1].id;
    }
    return currentWk?.id || allMatchupWeeks[0]?.id || '';
  }, [allMatchupWeeks, weekPlayedCountMap]);

  const defaultTeamA = MY_TEAM_KEY;
  const defaultTeamB = useMemo(() => {
    const firstRival = rivalSlotKeys.find(
      (k) => (leagueState.rivalRosters?.[k]?.length || 0) > 0
    );
    return firstRival || 'team_1';
  }, [rivalSlotKeys, leagueState.rivalRosters]);

  const [setup, setSetup] = useState<StoredMatchupSetup>(() =>
    loadStoredMatchupSetup(defaultTeamA, defaultTeamB)
  );
  const [selectedWeekId, setSelectedWeekId] = useState<string>(() => setup.weekId || '');
  const [remainingRateMode, setRemainingRateMode] = useState<'smart' | 'season_avg'>('smart');
  const [searchAddA, setSearchAddA] = useState<string>('');
  const [searchAddB, setSearchAddB] = useState<string>('');
  const [pickerWarning, setPickerWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedWeekId && defaultMatchupWeekId) {
      setSelectedWeekId(defaultMatchupWeekId);
    }
  }, [selectedWeekId, defaultMatchupWeekId]);

  // Apply external jump request from "Equipos de la Liga"
  useEffect(() => {
    if (!requestedPair) return;
    setSetup((prev) => ({
      ...prev,
      teamAKey: requestedPair.teamAKey || prev.teamAKey,
      teamBKey: requestedPair.teamBKey || prev.teamBKey,
    }));
  }, [requestedPair]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_MATCHUP_10V10_KEY,
        JSON.stringify({ ...setup, weekId: selectedWeekId })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [setup, selectedWeekId]);

  const chosenWeek = useMemo(() => {
    return (
      allMatchupWeeks.find((w) => w.id === selectedWeekId) ||
      allMatchupWeeks.find((w) => w.id === defaultMatchupWeekId) ||
      allMatchupWeeks[0] ||
      null
    );
  }, [allMatchupWeeks, selectedWeekId, defaultMatchupWeekId]);

  const selectableTeamOptions = useMemo(() => {
    const opts: Array<{ key: string; label: string; count: number }> = [
      {
        key: MY_TEAM_KEY,
        label: `${leagueState.myTeamName || 'Mi Equipo Fantasy'} (Tu equipo)`,
        count: leagueState.roster.length,
      },
    ];
    for (const rKey of rivalSlotKeys) {
      const cnt = leagueState.rivalRosters?.[rKey]?.length || 0;
      opts.push({
        key: rKey,
        label: getRivalDisplayName(rKey),
        count: cnt,
      });
    }
    return opts;
  }, [leagueState, rivalSlotKeys, getRivalDisplayName]);

  const getTeamRosterPool = (teamKey: string, side: 'A' | 'B'): string[] => {
    if (teamKey === CUSTOM_TEAM_A_KEY) return setup.customPoolA;
    if (teamKey === CUSTOM_TEAM_B_KEY) return setup.customPoolB;
    const extraPool = side === 'A' ? setup.customPoolA : setup.customPoolB;
    const baseIds =
      teamKey === MY_TEAM_KEY
        ? leagueState.roster.map((c) => c.playerId)
        : leagueState.rivalRosters?.[teamKey] || [];
    return Array.from(new Set([...baseIds, ...extraPool])).filter((id) =>
      enrichedById.has(id)
    );
  };

  const getDefaultSelected10 = (teamKey: string, poolIds: string[]): string[] => {
    if (teamKey === MY_TEAM_KEY) {
      const starters = leagueState.roster
        .filter((c) => c.slot === 'starter' && poolIds.includes(c.playerId))
        .map((c) => c.playerId);
      if (starters.length >= OFFICIAL_LEAGUE_RULES.activeStarters) {
        return starters.slice(0, OFFICIAL_LEAGUE_RULES.activeStarters);
      }
      const rest = poolIds.filter((id) => !starters.includes(id));
      return [...starters, ...rest].slice(0, OFFICIAL_LEAGUE_RULES.activeStarters);
    }
    // Sort by projected FPTS or season avg so best 10 are preselected for rivals
    const sorted = [...poolIds].sort((a, b) => {
      const ia = enrichedById.get(a);
      const ib = enrichedById.get(b);
      return (
        (ib?.stats.seasonAvgFpts || 0) - (ia?.stats.seasonAvgFpts || 0)
      );
    });
    return sorted.slice(0, OFFICIAL_LEAGUE_RULES.activeStarters);
  };

  const poolA = getTeamRosterPool(setup.teamAKey, 'A');
  const poolB = getTeamRosterPool(setup.teamBKey, 'B');

  const resolveSelectedIds = (teamKey: string, side: 'A' | 'B', pool: string[]): string[] => {
    const mapKey = `${side}:${teamKey}`;
    const saved = setup.selectedIdsByTeam[mapKey];
    if (Array.isArray(saved)) {
      const valid = saved.filter((id) => pool.includes(id));
      return valid.slice(0, OFFICIAL_LEAGUE_RULES.activeStarters);
    }
    return getDefaultSelected10(teamKey, pool);
  };

  const selectedIdsA = resolveSelectedIds(setup.teamAKey, 'A', poolA);
  const selectedIdsB = resolveSelectedIds(setup.teamBKey, 'B', poolB);

  const togglePlayerInLineup = (
    teamKey: string,
    side: 'A' | 'B',
    playerId: string,
    pool: string[]
  ) => {
    setPickerWarning(null);
    const mapKey = `${side}:${teamKey}`;
    const current = resolveSelectedIds(teamKey, side, pool);
    let next: string[];
    if (current.includes(playerId)) {
      next = current.filter((id) => id !== playerId);
    } else {
      if (current.length >= OFFICIAL_LEAGUE_RULES.activeStarters) {
        setPickerWarning(
          `Ya tienes 10 titulares seleccionados en Equipo ${side}. Quita uno antes de añadir a otro.`
        );
        return;
      }
      next = [...current, playerId];
    }
    setSetup((prev) => ({
      ...prev,
      selectedIdsByTeam: {
        ...prev.selectedIdsByTeam,
        [mapKey]: next,
      },
    }));
  };

  const handleAutoPickTop10 = (teamKey: string, side: 'A' | 'B', pool: string[]) => {
    setPickerWarning(null);
    const mapKey = `${side}:${teamKey}`;
    const sorted = [...pool].sort((a, b) => {
      const ia = enrichedById.get(a);
      const ib = enrichedById.get(b);
      if (!ia || !ib) return 0;
      const ga = chosenWeek?.teamSchedules?.[ia.player.teamAbbr]?.gamesCount || 0;
      const gb = chosenWeek?.teamSchedules?.[ib.player.teamAbbr]?.gamesCount || 0;
      return gb * ib.stats.weightedFptsPerGame - ga * ia.stats.weightedFptsPerGame;
    });
    setSetup((prev) => ({
      ...prev,
      selectedIdsByTeam: {
        ...prev.selectedIdsByTeam,
        [mapKey]: sorted.slice(0, OFFICIAL_LEAGUE_RULES.activeStarters),
      },
    }));
  };

  const handleClearLineup = (teamKey: string, side: 'A' | 'B') => {
    setPickerWarning(null);
    const mapKey = `${side}:${teamKey}`;
    setSetup((prev) => ({
      ...prev,
      selectedIdsByTeam: {
        ...prev.selectedIdsByTeam,
        [mapKey]: [],
      },
    }));
  };

  const handleAddExtraPlayerToMatchup = (
    teamKey: string,
    side: 'A' | 'B',
    playerId: string
  ) => {
    setPickerWarning(null);
    const mapKey = `${side}:${teamKey}`;
    const pool = getTeamRosterPool(teamKey, side);
    const current = resolveSelectedIds(teamKey, side, pool);
    if (current.includes(playerId)) return;

    setSetup((prev) => {
      const nextExtraA =
        side === 'A'
          ? Array.from(new Set([...prev.customPoolA, playerId]))
          : prev.customPoolA;
      const nextExtraB =
        side === 'B'
          ? Array.from(new Set([...prev.customPoolB, playerId]))
          : prev.customPoolB;
      const nextSel =
        current.length < OFFICIAL_LEAGUE_RULES.activeStarters
          ? [...current, playerId]
          : current;
      return {
        ...prev,
        customPoolA: nextExtraA,
        customPoolB: nextExtraB,
        selectedIdsByTeam: {
          ...prev.selectedIdsByTeam,
          [mapKey]: nextSel,
        },
      };
    });
    if (side === 'A') setSearchAddA('');
    else setSearchAddB('');
  };

  const evaluateLineupForWeek = (selectedIds: string[]): {
    rows: PlayerMatchupEvaluation[];
    totals: {
      playedGames: number;
      teamElapsedGames: number;
      scheduledTotalGames: number;
      remainingGames: number;
      actualFpts: number;
      expectedSoFar: number;
      deviationVsSeason: number;
      deviationPct: number;
      seasonAvgSum: number;
      projectedFinalFpts: number;
    };
  } => {
    if (!chosenWeek) {
      return {
        rows: [],
        totals: {
          playedGames: 0,
          teamElapsedGames: 0,
          scheduledTotalGames: 0,
          remainingGames: 0,
          actualFpts: 0,
          expectedSoFar: 0,
          deviationVsSeason: 0,
          deviationPct: 0,
          seasonAvgSum: 0,
          projectedFinalFpts: 0,
        },
      };
    }

    const weekStart = chosenWeek.startIso;
    const weekEnd = chosenWeek.endIso;

    const rows: PlayerMatchupEvaluation[] = selectedIds
      .map((pid) => enrichedById.get(pid))
      .filter((x): x is FantasyEnrichedPlayerItem => Boolean(x))
      .map((item) => {
        const g2027 = (item.player.games || []).filter(
          (g) => g.seasonLabel === '2026-27' && g.date >= weekStart && g.date <= weekEnd
        );

        let correctionsInWeek = 0;
        const weekGameDetails = g2027
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((g) => {
            const base = computeOfficialGameFptsBreakdown(g, 0);
            const corr =
              leagueState.gameCorrections?.[`${item.player.id}:${g.eventId}`] ||
              leagueState.gameCorrections?.[`${item.player.id}:${g.date}`];
            const delta =
              corr && typeof corr.fptsDelta === 'number' && Number.isFinite(corr.fptsDelta)
                ? corr.fptsDelta
                : 0;
            if (Math.abs(delta) > 0.001) correctionsInWeek += 1;
            return {
              date: g.date,
              opponentAbbr: g.opponentAbbr,
              isHome: g.isHome,
              fpts: round2(base.totalFpts + delta),
              hasCorrection: Math.abs(delta) > 0.001,
            };
          });

        const actualFpts = round2(
          weekGameDetails.reduce((acc, gd) => acc + gd.fpts, 0)
        );
        const playedGames = weekGameDetails.length;

        const teamElapsedDates = new Set<string>();
        const teamSummary = teamsByAbbr.get(item.player.teamAbbr);
        for (const tg of teamSummary?.games || []) {
          if (tg.seasonLabel === '2026-27' && tg.date >= weekStart && tg.date <= weekEnd) {
            teamElapsedDates.add(tg.date);
          }
        }
        for (const gd of weekGameDetails) {
          teamElapsedDates.add(gd.date);
        }

        const scheduledSlots = chosenWeek.teamSchedules?.[item.player.teamAbbr]?.games || [];
        const remainingSlots = scheduledSlots.filter(
          (slot) =>
            !teamElapsedDates.has(slot.dateIso) &&
            slot.dateIso >= latestLeagueGameDate2027
        );

        const scheduledTotalGames = scheduledSlots.length;
        const remainingGames = remainingSlots.length;
        // Count team elapsed games as max(teamElapsedDates.size, scheduledTotal - remainingGames)
        // when week has started, clamped to scheduledTotalGames
        const teamElapsedGames = Math.max(
          teamElapsedDates.size,
          Math.max(0, scheduledTotalGames - remainingGames)
        );
        const missedElapsedGames = Math.max(0, teamElapsedGames - playedGames);

        const expectedSoFar = round1(teamElapsedGames * item.stats.seasonAvgFpts);
        const deviationVsSeason = round1(actualFpts - expectedSoFar);
        const playedAvgFpts = playedGames > 0 ? round1(actualFpts / playedGames) : null;

        let remainingProjectedFpts = 0;
        if (remainingGames > 0) {
          if (remainingRateMode === 'season_avg') {
            remainingProjectedFpts = round1(remainingGames * item.stats.seasonAvgFpts);
          } else {
            const remB2Bs = remainingSlots.filter((s) => s.isBackToBack).length;
            const remProj = computeWeeklyLockProjection({
              scheduledGames: remainingGames,
              b2bGames: remB2Bs,
              stats: item.stats,
              injurySeverity: item.severity,
              injuryAbsenceTier: item.injury?.absenceTier,
              injuryDetailEs: item.injury?.detailEs || item.injury?.statusLabelEs || '',
              availabilityContext: item.availabilityContext,
              projectionMode,
            });
            remainingProjectedFpts = remProj.lockAdjustedFpts;
          }
        }

        const projectedFinalFpts = round1(actualFpts + remainingProjectedFpts);

        return {
          item,
          playedGames,
          teamElapsedGames,
          missedElapsedGames,
          scheduledTotalGames,
          remainingGames,
          actualFpts,
          expectedSoFar,
          deviationVsSeason,
          playedAvgFpts,
          remainingProjectedFpts,
          projectedFinalFpts,
          correctionsInWeek,
          weekGameDetails,
        };
      });

    const actualFpts = round2(rows.reduce((s, r) => s + r.actualFpts, 0));
    const expectedSoFar = round1(rows.reduce((s, r) => s + r.expectedSoFar, 0));
    const deviationVsSeason = round1(actualFpts - expectedSoFar);
    const deviationPct =
      expectedSoFar > 0 ? round1((deviationVsSeason / expectedSoFar) * 100) : 0;

    return {
      rows,
      totals: {
        playedGames: rows.reduce((s, r) => s + r.playedGames, 0),
        teamElapsedGames: rows.reduce((s, r) => s + r.teamElapsedGames, 0),
        scheduledTotalGames: rows.reduce((s, r) => s + r.scheduledTotalGames, 0),
        remainingGames: rows.reduce((s, r) => s + r.remainingGames, 0),
        actualFpts,
        expectedSoFar,
        deviationVsSeason,
        deviationPct,
        seasonAvgSum: round1(rows.reduce((s, r) => s + r.item.stats.seasonAvgFpts, 0)),
        projectedFinalFpts: round1(rows.reduce((s, r) => s + r.projectedFinalFpts, 0)),
      },
    };
  };

  const evalA = evaluateLineupForWeek(selectedIdsA);
  const evalB = evaluateLineupForWeek(selectedIdsB);

  const getTeamLabel = (teamKey: string) => {
    if (teamKey === MY_TEAM_KEY) return leagueState.myTeamName || 'Mi Equipo Fantasy';
    if (teamKey === CUSTOM_TEAM_A_KEY) return 'Selección A (Personalizada)';
    if (teamKey === CUSTOM_TEAM_B_KEY) return 'Selección B (Personalizada)';
    return getRivalDisplayName(teamKey);
  };

  const teamAName = getTeamLabel(setup.teamAKey);
  const teamBName = getTeamLabel(setup.teamBKey);

  const actualDiff = round2(evalA.totals.actualFpts - evalB.totals.actualFpts);
  const projectedDiff = round1(
    evalA.totals.projectedFinalFpts - evalB.totals.projectedFinalFpts
  );
  const projTotalSum = evalA.totals.projectedFinalFpts + evalB.totals.projectedFinalFpts;
  const pctShareA =
    projTotalSum > 0
      ? Math.max(15, Math.min(85, (evalA.totals.projectedFinalFpts / projTotalSum) * 100))
      : 50;

  const searchResultsA = useMemo(() => {
    const q = normalizeSearchText(searchAddA);
    if (!q) return [];
    return enrichedCatalog
      .filter((x) =>
        normalizeSearchText(`${x.player.name} ${x.player.teamAbbr}`).includes(q)
      )
      .sort((a, b) => b.stats.seasonAvgFpts - a.stats.seasonAvgFpts)
      .slice(0, 8);
  }, [enrichedCatalog, searchAddA]);

  const searchResultsB = useMemo(() => {
    const q = normalizeSearchText(searchAddB);
    if (!q) return [];
    return enrichedCatalog
      .filter((x) =>
        normalizeSearchText(`${x.player.name} ${x.player.teamAbbr}`).includes(q)
      )
      .sort((a, b) => b.stats.seasonAvgFpts - a.stats.seasonAvgFpts)
      .slice(0, 8);
  }, [enrichedCatalog, searchAddB]);

  const renderTeamConfiguratorSide = (
    side: 'A' | 'B',
    teamKey: string,
    poolIds: string[],
    selectedIds: string[],
    searchVal: string,
    setSearchVal: (v: string) => void,
    searchMatches: FantasyEnrichedPlayerItem[]
  ) => {
    const isComplete10 = selectedIds.length === OFFICIAL_LEAGUE_RULES.activeStarters;
    return (
      <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`text-xs font-bold font-mono shrink-0 ${
                side === 'A' ? 'text-orange-400' : 'text-cyan-400'
              }`}
            >
              EQUIPO {side}
            </span>
            <select
              value={teamKey}
              onChange={(e) => {
                const nextKey = e.target.value;
                setPickerWarning(null);
                setSetup((prev) => ({
                  ...prev,
                  teamAKey: side === 'A' ? nextKey : prev.teamAKey,
                  teamBKey: side === 'B' ? nextKey : prev.teamBKey,
                }));
              }}
              className="px-2.5 py-1.5 text-xs bg-[#131C2E] border border-[#1E293B] rounded-lg text-slate-100 font-semibold focus:outline-none focus:border-orange-500 max-w-[240px]"
            >
              {selectableTeamOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label} ({opt.count} jug.)
                </option>
              ))}
              <option
                value={side === 'A' ? CUSTOM_TEAM_A_KEY : CUSTOM_TEAM_B_KEY}
              >
                Selección Libre (Personalizada)
              </option>
            </select>
          </div>

          <span
            className={`text-xs font-mono tabular-nums font-bold ${
              isComplete10 ? 'text-emerald-400' : 'text-amber-300'
            }`}
          >
            {selectedIds.length}/10 titulares
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-400">
            Elige los 10 jugadores que disputan el encuentro:
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleAutoPickTop10(teamKey, side, poolIds)}
              className="px-2 py-1 rounded bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/50 text-orange-300 font-medium transition-colors"
            >
              Auto-elegir 10 mejores
            </button>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => handleClearLineup(teamKey, side)}
                className="px-2 py-1 rounded bg-[#131C2E] border border-[#1E293B] hover:border-slate-500 text-slate-400 hover:text-slate-200 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {poolIds.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">
            Este equipo no tiene jugadores cargados aún. Usa el buscador inferior para añadir hasta 10 jugadores NBA y comparar al instante.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-0.5">
            {poolIds.map((pid) => {
              const item = enrichedById.get(pid);
              if (!item) return null;
              const isPicked = selectedIds.includes(pid);
              const schedCount =
                chosenWeek?.teamSchedules?.[item.player.teamAbbr]?.gamesCount ?? 0;

              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => togglePlayerInLineup(teamKey, side, pid, poolIds)}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-left text-xs transition-colors ${
                    isPicked
                      ? side === 'A'
                        ? 'bg-orange-500/15 border-orange-500/60 text-slate-100'
                        : 'bg-cyan-500/15 border-cyan-500/60 text-slate-100'
                      : 'bg-[#131C2E]/60 border-[#1E293B] text-slate-400 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 ${
                        isPicked
                          ? side === 'A'
                            ? 'bg-orange-500 border-orange-400 text-slate-950'
                            : 'bg-cyan-400 border-cyan-300 text-slate-950'
                          : 'border-slate-600'
                      }`}
                    >
                      {isPicked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                    <span className="truncate font-medium">{item.player.name}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[10px] shrink-0 text-slate-300">
                    {item.stats.seasonAvgFpts.toFixed(1)} · {schedCount}PJ
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Quick add any NBA player to this matchup lineup */}
        <div className="relative pt-1">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-[15px] pointer-events-none" />
          <input
            type="text"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder={`+ Añadir jugador NBA suelto a Equipo ${side}...`}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#131C2E] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
          />
          {searchMatches.length > 0 && (
            <div className="mt-1 max-h-36 overflow-y-auto divide-y divide-[#1E293B]/60 border border-[#1E293B] rounded-lg bg-[#131C2E]">
              {searchMatches.map((m) => (
                <button
                  key={m.player.id}
                  type="button"
                  onClick={() => handleAddExtraPlayerToMatchup(teamKey, side, m.player.id)}
                  className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs hover:bg-[#182338] text-left"
                >
                  <span className="text-slate-200 truncate">
                    <strong>{m.player.name}</strong> ({m.player.teamAbbr})
                  </span>
                  <span className="inline-flex items-center gap-1 text-orange-400 font-mono text-[11px] shrink-0">
                    <Plus className="w-3 h-3" />
                    <span>{m.stats.seasonAvgFpts.toFixed(1)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMatchupLineupTable = (
    side: 'A' | 'B',
    teamName: string,
    evaluation: ReturnType<typeof evaluateLineupForWeek>
  ) => (
    <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden min-w-0">
      <div className="px-4 py-3 bg-[#0F172A]/75 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-100 truncate">
            <span className={side === 'A' ? 'text-orange-400' : 'text-cyan-400'}>
              Equipo {side}:
            </span>{' '}
            {teamName}
          </h4>
          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
            {evaluation.rows.length}/10 jugadores · {evaluation.totals.playedGames}/
            {evaluation.totals.scheduledTotalGames} PJ disputados ·{' '}
            {evaluation.totals.remainingGames} PJ por jugar
          </p>
        </div>
        <div className="text-right font-mono tabular-nums">
          <span className="text-xs text-slate-400 block">Proy. Final</span>
          <span
            className={`text-base font-bold ${
              side === 'A' ? 'text-orange-400' : 'text-cyan-400'
            }`}
          >
            {evaluation.totals.projectedFinalFpts.toFixed(1)} FPTS
          </span>
        </div>
      </div>

      {evaluation.rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400">
          Selecciona hasta 10 jugadores arriba para simular este equipo en la jornada.
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto text-xs">
            <thead>
              <tr className="border-b border-[#1E293B] bg-[#0B1120]/60 text-[11px] text-slate-400">
                <th className="py-2 pl-3 pr-1.5 font-medium">Jugador</th>
                <th className="py-2 px-1.5 text-center font-medium">PJ</th>
                <th className="py-2 px-1.5 text-right font-medium">Media</th>
                <th className="py-2 px-1.5 text-right font-medium">Jornada</th>
                <th className="py-2 px-1.5 text-right font-medium">Desv. Media</th>
                <th className="py-2 pl-1.5 pr-3 text-right font-medium">Proy. Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/75">
              {evaluation.rows.map((row) => {
                const gamesDetailTooltip =
                  row.weekGameDetails.length > 0
                    ? row.weekGameDetails
                        .map(
                          (gd) =>
                            `${gd.date} ${gd.isHome ? 'vs' : '@'}${gd.opponentAbbr}: ${formatFptsExact(gd.fpts)} FPTS`
                        )
                        .join(' | ')
                    : 'Sin partidos disputados todavía en esta jornada';

                return (
                  <tr
                    key={row.item.player.id}
                    className="hover:bg-[#182338] transition-colors"
                  >
                    <td className="py-2 pl-3 pr-1.5 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar
                          playerId={row.item.player.id}
                          name={row.item.player.name}
                          teamAbbr={row.item.player.teamAbbr}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onInspectEntity('player', row.item.player.id)
                              }
                              className="font-semibold text-slate-100 hover:text-orange-400 truncate transition-colors"
                            >
                              {row.item.player.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => onInspectPlayerLogs(row.item.player.id)}
                              className="p-0.5 text-amber-400/80 hover:text-amber-300 shrink-0"
                              title="Rectificar puntos de partido (±)"
                              aria-label={`Rectificar puntos de ${row.item.player.name}`}
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <span>{row.item.player.teamAbbr}</span>
                            {row.item.severity !== 'healthy' && (
                              <>
                                <span>·</span>
                                {renderMiniSeverityLabel(
                                  row.item.severity,
                                  row.item.weekly.absenceTier,
                                  row.item.injury?.statusLabelEs
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      className="py-2 px-1.5 text-center font-mono tabular-nums whitespace-nowrap"
                      title={gamesDetailTooltip}
                    >
                      <span className="text-slate-200 font-semibold">
                        {row.playedGames}/{row.scheduledTotalGames}
                      </span>
                      {row.missedElapsedGames > 0 && (
                        <span className="block text-[9px] text-rose-400">
                          {row.missedElapsedGames} aus.
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-1.5 text-right font-mono tabular-nums text-slate-300">
                      {row.item.stats.seasonAvgFpts.toFixed(1)}
                    </td>
                    <td
                      className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                      title={gamesDetailTooltip}
                    >
                      <button
                        type="button"
                        onClick={() => onInspectPlayerLogs(row.item.player.id)}
                        className="font-bold text-slate-100 hover:text-amber-300 transition-colors"
                      >
                        {formatFptsExact(row.actualFpts)}
                      </button>
                      {row.correctionsInWeek > 0 && (
                        <span className="text-[10px] text-amber-300 ml-0.5">±</span>
                      )}
                    </td>
                    <td className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {row.teamElapsedGames === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <span
                          className={`font-semibold ${
                            row.deviationVsSeason >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                          title={`Esperado en ${row.teamElapsedGames} PJ de equipo: ${row.expectedSoFar.toFixed(1)} FPTS`}
                        >
                          {row.deviationVsSeason >= 0 ? '+' : ''}
                          {row.deviationVsSeason.toFixed(1)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pl-1.5 pr-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span
                        className={`font-bold ${
                          side === 'A' ? 'text-orange-400' : 'text-cyan-400'
                        }`}
                      >
                        {row.projectedFinalFpts.toFixed(1)}
                      </span>
                      {row.remainingGames > 0 && (
                        <span className="block text-[10px] text-slate-400">
                          +{row.remainingProjectedFpts.toFixed(1)} ({row.remainingGames}PJ)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#0B1120] border-t-2 border-[#1E293B] font-mono tabular-nums text-xs font-bold">
                <td className="py-2.5 pl-3 pr-1.5 font-sans text-slate-200">
                  TOTAL ({evaluation.rows.length}/10)
                </td>
                <td className="py-2.5 px-1.5 text-center text-slate-300">
                  {evaluation.totals.playedGames}/{evaluation.totals.scheduledTotalGames}
                </td>
                <td className="py-2.5 px-1.5 text-right text-slate-400">
                  {evaluation.totals.seasonAvgSum.toFixed(1)}
                </td>
                <td className="py-2.5 px-1.5 text-right text-slate-100">
                  {formatFptsExact(evaluation.totals.actualFpts)}
                </td>
                <td
                  className={`py-2.5 px-1.5 text-right ${
                    evaluation.totals.deviationVsSeason >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {evaluation.totals.teamElapsedGames === 0
                    ? '—'
                    : `${evaluation.totals.deviationVsSeason >= 0 ? '+' : ''}${evaluation.totals.deviationVsSeason.toFixed(1)}`}
                </td>
                <td
                  className={`py-2.5 pl-1.5 pr-3 text-right ${
                    side === 'A' ? 'text-orange-400' : 'text-cyan-400'
                  }`}
                >
                  {evaluation.totals.projectedFinalFpts.toFixed(1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {/* Matchup Control & Week Selector Header */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Swords className="w-4 h-4 text-orange-400 shrink-0" />
              <span>Comparativa de Encuentro 10 vs 10 (En Vivo y Proyección Final)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Selecciona dos equipos y sus 10 titulares para comparar puntos reales acumulados en la jornada, desviación frente a su media de temporada y resultado final proyectado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSetup((prev) => ({
                  ...prev,
                  teamAKey: prev.teamBKey,
                  teamBKey: prev.teamAKey,
                }));
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1120] border border-[#1E293B] hover:border-slate-500 text-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-orange-400" />
              <span>Intercambiar A ↔ B</span>
            </button>
            <ExportImageButton
              label="Exportar Duelo"
              onBuildImage={() => {
                const buildSideItems = (
                  rows: PlayerMatchupEvaluation[]
                ) =>
                  [...rows]
                    .sort((a, b) => b.projectedFinalFpts - a.projectedFinalFpts)
                    .slice(0, 5)
                    .map((r) => ({
                      name: r.item.player.name,
                      teamAbbr: r.item.player.teamAbbr,
                      detail: `Actual ${formatFptsExact(r.actualFpts)} · Proy ${r.projectedFinalFpts.toFixed(1)} (${r.playedGames}/${r.scheduledTotalGames} PJ)`,
                      badgeText:
                        r.teamElapsedGames > 0
                          ? `${r.deviationVsSeason >= 0 ? '+' : ''}${r.deviationVsSeason.toFixed(1)}`
                          : undefined,
                      badgeTone:
                        r.deviationVsSeason >= 0
                          ? ('positive' as const)
                          : ('negative' as const),
                    }));

                const shareMetric = (a: number, b: number) =>
                  a + b > 0 ? Math.round((a / (a + b)) * 100) : 50;

                return buildComparisonSnapshotBlob({
                  filename: `radarnba-fantasy-duelo-${chosenWeek?.id || 'jornada'}`,
                  categoryTag: 'FANTASY 10 VS 10',
                  title: `${teamAName} vs ${teamBName}`,
                  subtitle: `${chosenWeek?.label || 'Jornada'} (${chosenWeek?.rangeLabel || ''})`,
                  verdictLabel: 'Proyección de cierre',
                  verdictPrimary:
                    Math.abs(projectedDiff) < 0.5
                      ? 'Encuentro virtualmente empatado en la proyección final'
                      : `Ventaja proyectada para ${
                          projectedDiff >= 0 ? teamAName : teamBName
                        } por +${Math.abs(projectedDiff).toFixed(1)} FPTS`,
                  verdictPrimaryTone:
                    Math.abs(projectedDiff) < 0.5 ? 'neutral' : 'positive',
                  sideA: {
                    headerLabel: 'Equipo A (10 titulares)',
                    accentTone: 'orange',
                    headlineTitle: teamAName,
                    headlineValue: `${evalA.totals.projectedFinalFpts.toFixed(1)} FPTS`,
                    headlineSubtext: `Actual: ${formatFptsExact(evalA.totals.actualFpts)} · ${evalA.totals.playedGames}/${evalA.totals.scheduledTotalGames} PJ`,
                    items: buildSideItems(evalA.rows),
                  },
                  sideB: {
                    headerLabel: 'Equipo B (10 titulares)',
                    accentTone: 'sky',
                    headlineTitle: teamBName,
                    headlineValue: `${evalB.totals.projectedFinalFpts.toFixed(1)} FPTS`,
                    headlineSubtext: `Actual: ${formatFptsExact(evalB.totals.actualFpts)} · ${evalB.totals.playedGames}/${evalB.totals.scheduledTotalGames} PJ`,
                    items: buildSideItems(evalB.rows),
                  },
                  colALabel: teamAName,
                  colBLabel: teamBName,
                  colDeltaLabel: 'Dif.',
                  rows: [
                    {
                      label: 'Puntos actuales jornada',
                      valAText: `${formatFptsExact(evalA.totals.actualFpts)}`,
                      valBText: `${formatFptsExact(evalB.totals.actualFpts)}`,
                      deltaText: `${actualDiff >= 0 ? '+' : ''}${actualDiff.toFixed(1)}`,
                      winner:
                        actualDiff > 0.05 ? 'A' : actualDiff < -0.05 ? 'B' : 'tie',
                      shareA: shareMetric(
                        evalA.totals.actualFpts,
                        evalB.totals.actualFpts
                      ),
                    },
                    {
                      label: 'Partidos disputados / totales',
                      valAText: `${evalA.totals.playedGames}/${evalA.totals.scheduledTotalGames} PJ`,
                      valBText: `${evalB.totals.playedGames}/${evalB.totals.scheduledTotalGames} PJ`,
                      deltaText: `${evalA.totals.playedGames - evalB.totals.playedGames >= 0 ? '+' : ''}${evalA.totals.playedGames - evalB.totals.playedGames} PJ`,
                      winner:
                        evalA.totals.playedGames > evalB.totals.playedGames
                          ? 'A'
                          : evalA.totals.playedGames < evalB.totals.playedGames
                          ? 'B'
                          : 'tie',
                    },
                    {
                      label: 'Desviación vs media temp.',
                      valAText: `${evalA.totals.deviationVsSeason >= 0 ? '+' : ''}${evalA.totals.deviationVsSeason.toFixed(1)}`,
                      valBText: `${evalB.totals.deviationVsSeason >= 0 ? '+' : ''}${evalB.totals.deviationVsSeason.toFixed(1)}`,
                      deltaText: `${evalA.totals.deviationVsSeason - evalB.totals.deviationVsSeason >= 0 ? '+' : ''}${(evalA.totals.deviationVsSeason - evalB.totals.deviationVsSeason).toFixed(1)}`,
                      winner:
                        evalA.totals.deviationVsSeason >
                        evalB.totals.deviationVsSeason + 0.1
                          ? 'A'
                          : evalB.totals.deviationVsSeason >
                            evalA.totals.deviationVsSeason + 0.1
                          ? 'B'
                          : 'tie',
                    },
                    {
                      label: 'Partidos restantes',
                      valAText: `${evalA.totals.remainingGames} PJ`,
                      valBText: `${evalB.totals.remainingGames} PJ`,
                      deltaText: `${evalA.totals.remainingGames - evalB.totals.remainingGames >= 0 ? '+' : ''}${evalA.totals.remainingGames - evalB.totals.remainingGames} PJ`,
                      winner:
                        evalA.totals.remainingGames > evalB.totals.remainingGames
                          ? 'A'
                          : evalA.totals.remainingGames < evalB.totals.remainingGames
                          ? 'B'
                          : 'tie',
                    },
                    {
                      label: 'Proyección final encuentro',
                      valAText: `${evalA.totals.projectedFinalFpts.toFixed(1)}`,
                      valBText: `${evalB.totals.projectedFinalFpts.toFixed(1)}`,
                      deltaText: `${projectedDiff >= 0 ? '+' : ''}${projectedDiff.toFixed(1)}`,
                      winner:
                        projectedDiff > 0.2 ? 'A' : projectedDiff < -0.2 ? 'B' : 'tie',
                      shareA: pctShareA,
                    },
                  ],
                });
              }}
            />
          </div>
        </div>

        {/* Week & Projection Formula Controls */}
        <div className="pt-3 border-t border-[#1E293B] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-orange-400" />
              <span>Jornada del encuentro:</span>
            </span>
            <select
              value={chosenWeek?.id || ''}
              onChange={(e) => setSelectedWeekId(e.target.value)}
              className="px-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 font-medium focus:outline-none focus:border-orange-500"
            >
              {allMatchupWeeks.map((wk) => {
                const playedCnt = weekPlayedCountMap.get(wk.id) || 0;
                const statusTag =
                  playedCnt > 0
                    ? wk.endIso < latestLeagueGameDate2027
                      ? 'Cerrada'
                      : 'Con datos'
                    : 'Sin jugar';
                return (
                  <option key={wk.id} value={wk.id}>
                    {wk.label} ({wk.rangeLabel}) · {statusTag}
                  </option>
                );
              })}
            </select>
            <span className="text-[11px] font-mono text-slate-400">
              Datos hasta {latestLeagueGameDate2027}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">Proyección restantes:</span>
            <div className="inline-flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
              <button
                type="button"
                onClick={() => setRemainingRateMode('smart')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  remainingRateMode === 'smart'
                    ? 'bg-[#1E293B] text-orange-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Inteligente (Bajas/B2B + Forma)
              </button>
              <button
                type="button"
                onClick={() => setRemainingRateMode('season_avg')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  remainingRateMode === 'season_avg'
                    ? 'bg-[#1E293B] text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Media pura temporada
              </button>
            </div>
            {remainingRateMode === 'smart' && (
              <button
                type="button"
                onClick={() =>
                  onChangeProjectionMode(
                    projectionMode === 'smart' ? 'conservative' : 'smart'
                  )
                }
                className="px-2.5 py-1 rounded-md bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white transition-colors"
                title="Cambiar sensibilidad de bajas médicas"
              >
                Bajas: {projectionMode === 'smart' ? 'Estándar' : 'Conservadora'}
              </button>
            )}
          </div>
        </div>

        {/* 10-Player Roster Selectors for Team A & Team B */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
          {renderTeamConfiguratorSide(
            'A',
            setup.teamAKey,
            poolA,
            selectedIdsA,
            searchAddA,
            setSearchAddA,
            searchResultsA
          )}
          {renderTeamConfiguratorSide(
            'B',
            setup.teamBKey,
            poolB,
            selectedIdsB,
            searchAddB,
            setSearchAddB,
            searchResultsB
          )}
        </div>

        {pickerWarning && (
          <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-2">
            <span>{pickerWarning}</span>
            <button
              type="button"
              onClick={() => setPickerWarning(null)}
              className="text-amber-300 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* Matchup Scoreboard Hero Strip (Actual · Desviación vs Media · Proyección Final) */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#1E293B]">
          {/* KPI 1: Puntos que llevan en la jornada */}
          <div className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Puntos que llevan en la jornada</span>
              <span className="font-mono tabular-nums">
                {evalA.totals.playedGames}/{evalA.totals.scheduledTotalGames} vs{' '}
                {evalB.totals.playedGames}/{evalB.totals.scheduledTotalGames} PJ
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
              <div>
                <span className="block text-[11px] font-sans text-orange-400 truncate max-w-[140px]">
                  {teamAName}
                </span>
                <span className="text-xl sm:text-2xl font-bold text-slate-100">
                  {formatFptsExact(evalA.totals.actualFpts)}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-sans">vs</span>
              <div className="text-right">
                <span className="block text-[11px] font-sans text-cyan-400 truncate max-w-[140px]">
                  {teamBName}
                </span>
                <span className="text-xl sm:text-2xl font-bold text-slate-100">
                  {formatFptsExact(evalB.totals.actualFpts)}
                </span>
              </div>
            </div>
            <p className="text-xs font-mono tabular-nums text-slate-400">
              Diferencia actual:{' '}
              <strong
                className={
                  actualDiff > 0
                    ? 'text-orange-400'
                    : actualDiff < 0
                    ? 'text-cyan-400'
                    : 'text-slate-200'
                }
              >
                {actualDiff === 0
                  ? 'Empate (0.0)'
                  : `${actualDiff > 0 ? teamAName : teamBName} +${Math.abs(actualDiff).toFixed(2)} FPTS`}
              </strong>
            </p>
          </div>

          {/* KPI 2: Desviación frente a su media de temporada */}
          <div className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Desviación vs media de temporada</span>
              <span className="font-mono">Ritmo real</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
              <div>
                <span className="block text-[11px] font-sans text-orange-400 truncate max-w-[140px]">
                  {teamAName}
                </span>
                <span
                  className={`text-xl sm:text-2xl font-bold inline-flex items-center gap-1 ${
                    evalA.totals.teamElapsedGames === 0
                      ? 'text-slate-400'
                      : evalA.totals.deviationVsSeason >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {evalA.totals.teamElapsedGames === 0 ? (
                    '0.0'
                  ) : (
                    <>
                      {evalA.totals.deviationVsSeason >= 0 ? (
                        <TrendingUp className="w-4 h-4 shrink-0" />
                      ) : (
                        <TrendingDown className="w-4 h-4 shrink-0" />
                      )}
                      {evalA.totals.deviationVsSeason >= 0 ? '+' : ''}
                      {evalA.totals.deviationVsSeason.toFixed(1)}
                    </>
                  )}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-[11px] font-sans text-cyan-400 truncate max-w-[140px]">
                  {teamBName}
                </span>
                <span
                  className={`text-xl sm:text-2xl font-bold inline-flex items-center gap-1 ${
                    evalB.totals.teamElapsedGames === 0
                      ? 'text-slate-400'
                      : evalB.totals.deviationVsSeason >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {evalB.totals.teamElapsedGames === 0 ? (
                    '0.0'
                  ) : (
                    <>
                      {evalB.totals.deviationVsSeason >= 0 ? '+' : ''}
                      {evalB.totals.deviationVsSeason.toFixed(1)}
                      {evalB.totals.deviationVsSeason >= 0 ? (
                        <TrendingUp className="w-4 h-4 shrink-0" />
                      ) : (
                        <TrendingDown className="w-4 h-4 shrink-0" />
                      )}
                    </>
                  )}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              {evalA.totals.teamElapsedGames === 0 && evalB.totals.teamElapsedGames === 0
                ? 'Aún no se han disputado partidos en esta semana'
                : `Esperado: ${evalA.totals.expectedSoFar.toFixed(1)} (${evalA.totals.deviationPct >= 0 ? '+' : ''}${evalA.totals.deviationPct}%) vs ${evalB.totals.expectedSoFar.toFixed(1)} (${evalB.totals.deviationPct >= 0 ? '+' : ''}${evalB.totals.deviationPct}%)`}
            </p>
          </div>

          {/* KPI 3: Proyección del resultado final del encuentro */}
          <div className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                <span>Proyección resultado final</span>
              </span>
              <span className="font-mono tabular-nums">
                {evalA.totals.remainingGames} vs {evalB.totals.remainingGames} PJ rest.
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
              <div>
                <span className="block text-[11px] font-sans text-orange-400 truncate max-w-[140px]">
                  {teamAName}
                </span>
                <span className="text-xl sm:text-2xl font-bold text-orange-400">
                  {evalA.totals.projectedFinalFpts.toFixed(1)}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-sans">vs</span>
              <div className="text-right">
                <span className="block text-[11px] font-sans text-cyan-400 truncate max-w-[140px]">
                  {teamBName}
                </span>
                <span className="text-xl sm:text-2xl font-bold text-cyan-400">
                  {evalB.totals.projectedFinalFpts.toFixed(1)}
                </span>
              </div>
            </div>
            <p className="text-xs font-mono tabular-nums text-slate-300">
              {Math.abs(projectedDiff) < 0.2 ? (
                'Resultado final proyectado muy parejo'
              ) : (
                <>
                  Gana{' '}
                  <strong
                    className={
                      projectedDiff >= 0 ? 'text-orange-400' : 'text-cyan-400'
                    }
                  >
                    {projectedDiff >= 0 ? teamAName : teamBName}
                  </strong>{' '}
                  por{' '}
                  <strong className="text-emerald-400">
                    +{Math.abs(projectedDiff).toFixed(1)} FPTS
                  </strong>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Visual Projection Share Bar */}
        <div className="px-4 py-2.5 bg-[#0B1120]/70 border-t border-[#1E293B] space-y-1">
          <div className="h-2 w-full rounded-full overflow-hidden bg-[#1E293B] flex">
            <div
              className="h-full bg-orange-500 transition-all duration-300"
              style={{ width: `${pctShareA}%` }}
            />
            <div
              className="h-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${100 - pctShareA}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
            <span>
              {teamAName}: {evalA.totals.projectedFinalFpts.toFixed(1)} FPTS
            </span>
            <span>
              {teamBName}: {evalB.totals.projectedFinalFpts.toFixed(1)} FPTS
            </span>
          </div>
        </div>
      </section>

      {/* Side-by-Side 10-Player Matchup Breakdowns */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderMatchupLineupTable('A', teamAName, evalA)}
        {renderMatchupLineupTable('B', teamBName, evalB)}
      </div>
    </div>
  );
}
