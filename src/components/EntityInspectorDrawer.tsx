import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Sliders, Star, Swords, X } from 'lucide-react';
import type {
  ExperienceMode,
  PlayerSummary,
  RosterPlayerItem,
  SearchPlayerResult,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import {
  computePlayerTakeaways,
  computeTeamTakeaways,
  formatShortDate,
  formatSigned,
  mean,
  round1,
} from '../utils/analytics';
import {
  computePlainPlayerTakeaways,
  computePlainTeamTakeaways,
  qualifyUsageRole,
  type LeagueBenchmarks,
} from '../utils/humanize';
import {
  ColumnHelpHeader,
  MetricInfoTooltip,
  NbaComparisonBar,
} from './MetricUiHelpers';

interface EntityInspectorDrawerProps {
  entityType: 'player' | 'team' | null;
  entityId: string | null;
  players: PlayerSummary[];
  teams: TeamSummary[];
  experienceMode: ExperienceMode;
  benchmarks: LeagueBenchmarks;
  onSwitchToAdvanced: () => void;
  windowSize: WindowSize;
  watchlistIds: Set<string>;
  onToggleWatchlist: (entityKey: string) => void;
  onClose: () => void;
  onOpenInComparator: (entityType: 'player' | 'team', entityId: string) => void;
  onOpenInDuel?: (playerId: string) => void;
  onSelectRosterPlayer: (item: SearchPlayerResult) => Promise<void>;
}

type PlayerChartMetric =
  | 'points'
  | 'rebounds'
  | 'assists'
  | 'usgEst'
  | 'tsPct'
  | 'gameScore'
  | 'plusMinus';

type TeamChartMetric =
  | 'netRtg'
  | 'offRtg'
  | 'defRtg'
  | 'pace'
  | 'differential';

export function EntityInspectorDrawer({
  entityType,
  entityId,
  players,
  teams,
  experienceMode,
  benchmarks,
  onSwitchToAdvanced,
  windowSize,
  watchlistIds,
  onToggleWatchlist,
  onClose,
  onOpenInComparator,
  onOpenInDuel,
  onSelectRosterPlayer,
}: EntityInspectorDrawerProps) {
  const [pMetric, setPMetric] = useState<PlayerChartMetric>('points');
  const [tMetric, setTMetric] = useState<TeamChartMetric>(
    experienceMode === 'simple' ? 'differential' : 'netRtg'
  );
  const [logMode, setLogMode] = useState<'basic' | 'advanced'>('basic');
  const [teamTab, setTeamTab] = useState<'games' | 'roster'>('games');
  const [roster, setRoster] = useState<RosterPlayerItem[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [loadingPlayerId, setLoadingPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (experienceMode === 'simple') {
      setLogMode('basic');
      if (pMetric === 'usgEst' || pMetric === 'tsPct' || pMetric === 'gameScore') {
        setPMetric('points');
      }
      if (tMetric === 'netRtg') {
        setTMetric('differential');
      }
    }
  }, [experienceMode]);

  const player = useMemo(
    () =>
      entityType === 'player'
        ? players.find((p) => p.id === entityId)
        : undefined,
    [entityType, entityId, players]
  );

  const team = useMemo(
    () =>
      entityType === 'team' ? teams.find((t) => t.id === entityId) : undefined,
    [entityType, entityId, teams]
  );

  useEffect(() => {
    setTeamTab('games');
    setRoster([]);
  }, [entityType, entityId]);

  useEffect(() => {
    if (entityType !== 'team' || !team || teamTab !== 'roster') return;
    let active = true;
    setLoadingRoster(true);
    fetch(`/api/nba/team/${team.id}/roster`)
      .then((r) => r.json())
      .then((json) => {
        if (active) setRoster(json.roster || []);
      })
      .catch(() => {
        if (active) setRoster([]);
      })
      .finally(() => {
        if (active) setLoadingRoster(false);
      });
    return () => {
      active = false;
    };
  }, [entityType, team, teamTab]);

  const isOpen = Boolean(entityType && entityId && (player || team));

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!entityType || !entityId || (!player && !team)) {
    return null;
  }

  const wKey = `${entityType}:${entityId}`;
  const isWatched = watchlistIds.has(wKey);

  // Build SVG Trend Chart data (last 18 games ordered oldest -> newest left-to-right)
  const chartData = (() => {
    if (player) {
      const recentChrono = [...player.games.slice(0, 18)].reverse();
      const values = recentChrono.map((g) => round1(g[pMetric]));
      const base = round1(mean(player.games.map((g) => g[pMetric])));
      const labels = recentChrono.map(
        (g) =>
          `${formatShortDate(g.date)} ${g.isHome ? 'vs' : '@'} ${g.opponentAbbr}`
      );
      return { values, base, labels };
    }
    if (team) {
      const recentChrono = [...team.games.slice(0, 18)].reverse();
      const values = recentChrono.map((g) => round1(g[tMetric]));
      const base = round1(mean(team.games.map((g) => g[tMetric])));
      const labels = recentChrono.map(
        (g) =>
          `${formatShortDate(g.date)} ${g.isHome ? 'vs' : '@'} ${g.opponentAbbr}`
      );
      return { values, base, labels };
    }
    return { values: [], base: 0, labels: [] };
  })();

  const takeaways = player
    ? experienceMode === 'simple'
      ? computePlainPlayerTakeaways(player, windowSize, benchmarks)
      : computePlayerTakeaways(player, windowSize)
    : team
    ? experienceMode === 'simple'
      ? computePlainTeamTakeaways(team, windowSize, benchmarks)
      : computeTeamTakeaways(team, windowSize)
    : [];

  const nbaGaugeItems = (() => {
    if (player) {
      const g = player.games;
      const pts = round1(mean(g.map((x) => x.points)));
      const reb = round1(mean(g.map((x) => x.rebounds)));
      const ast = round1(mean(g.map((x) => x.assists)));
      const ts = player.advanced?.tsPct ?? round1(mean(g.map((x) => x.tsPct)));
      return [
        {
          title: 'Anotación por partido',
          helpKey: 'ptsBase',
          valueLabel: `${pts.toFixed(1)} PTS`,
          value: pts,
          benchmark: benchmarks.player.pts,
        },
        {
          title: 'Rebotes totales',
          helpKey: 'rebBase',
          valueLabel: `${reb.toFixed(1)} REB`,
          value: reb,
          benchmark: benchmarks.player.reb,
        },
        {
          title: 'Creación (Asistencias)',
          helpKey: 'astBase',
          valueLabel: `${ast.toFixed(1)} AST`,
          value: ast,
          benchmark: benchmarks.player.ast,
        },
        {
          title: 'Acierto real de tiro',
          helpKey: 'tsPct',
          valueLabel: `${ts.toFixed(1)}%`,
          value: ts,
          benchmark: benchmarks.player.tsPct,
        },
      ];
    }
    if (team) {
      const g = team.games;
      const pace = team.advanced?.pace ?? round1(mean(g.map((x) => x.pace)));
      if (experienceMode === 'simple') {
        return [
          {
            title: 'Puntos anotados (Ataque)',
            helpKey: 'avgPointsFor',
            valueLabel: `${team.avgPointsFor.toFixed(1)} PTS`,
            value: team.avgPointsFor,
            benchmark: benchmarks.team.avgPointsFor,
          },
          {
            title: 'Puntos recibidos (Defensa)',
            helpKey: 'avgPointsAgainst',
            valueLabel: `${team.avgPointsAgainst.toFixed(1)} PTS`,
            value: team.avgPointsAgainst,
            benchmark: benchmarks.team.avgPointsAgainst,
          },
          {
            title: 'Margen medio de puntos',
            helpKey: 'differential',
            valueLabel: `${formatSigned(team.differential)} PTS`,
            value: team.differential,
            benchmark: benchmarks.team.differential,
          },
          {
            title: 'Velocidad de partido',
            helpKey: 'paceSimple',
            valueLabel: `${pace.toFixed(1)} pos`,
            value: pace,
            benchmark: benchmarks.team.pace,
          },
        ];
      }
      const off = team.advanced?.offRtg ?? round1(mean(g.map((x) => x.offRtg)));
      const def = team.advanced?.defRtg ?? round1(mean(g.map((x) => x.defRtg)));
      const net = team.advanced?.netRtg ?? round1(off - def);
      return [
        {
          title: 'Ataque cada 100 pos. (OffRtg)',
          helpKey: 'offRtg',
          valueLabel: off.toFixed(1),
          value: off,
          benchmark: benchmarks.team.offRtg,
        },
        {
          title: 'Defensa cada 100 pos. (DefRtg)',
          helpKey: 'defRtg',
          valueLabel: def.toFixed(1),
          value: def,
          benchmark: benchmarks.team.defRtg,
        },
        {
          title: 'Dominio Neto (NetRtg)',
          helpKey: 'netRtg',
          valueLabel: formatSigned(net),
          value: net,
          benchmark: benchmarks.team.netRtg,
        },
        {
          title: 'Ritmo (Pace pos/48m)',
          helpKey: 'paceSimple',
          valueLabel: pace.toFixed(1),
          value: pace,
          benchmark: benchmarks.team.pace,
        },
      ];
    }
    return [];
  })();

  const simpleSummaryCells = (() => {
    if (player) {
      const g = player.games;
      const min = round1(mean(g.map((x) => x.minutes)));
      const pts = round1(mean(g.map((x) => x.points)));
      const reb = round1(mean(g.map((x) => x.rebounds)));
      const ast = round1(mean(g.map((x) => x.assists)));
      const usg = player.advanced?.usgPct ?? round1(mean(g.map((x) => x.usgEst)));
      const role = qualifyUsageRole(usg);
      return [
        {
          label: 'Puntos y Minutos / noche',
          helpKey: 'ptsBase',
          val: `${pts.toFixed(1)} PTS · ${min.toFixed(1)} MIN`,
        },
        {
          label: 'Rebotes y Asistencias',
          helpKey: 'pra',
          val: `${reb.toFixed(1)} REB · ${ast.toFixed(1)} AST`,
        },
        { label: 'Peso dentro de su equipo', helpKey: 'usgPct', val: role.label },
        {
          label: 'Robos + Tapones / noche',
          helpKey: 'stocksBase',
          val: `${mean(g.map((x) => x.stocks)).toFixed(1)} defensas`,
        },
      ];
    }
    if (team) {
      return [
        {
          label: 'Balance Victorias - Derrotas',
          helpKey: 'winPct',
          val: `${team.wins}-${team.losses} (${(team.winPct * 100).toFixed(0)}%)`,
        },
        {
          label: 'Ataque vs Defensa / PJ',
          helpKey: 'avgPointsFor',
          val: `${team.avgPointsFor.toFixed(1)} / ${team.avgPointsAgainst.toFixed(1)}`,
        },
        {
          label: 'Margen medio de puntos',
          helpKey: 'differential',
          val: `${formatSigned(team.differential)} PTS`,
        },
        { label: 'Racha actual', helpKey: 'streakCurrent', val: team.streakCode },
      ];
    }
    return [];
  })();

  // Deep Profile Cards (Advanced + Zones + Hustle from NBA.com)
  const profileCells = (() => {
    if (player) {
      const g = player.games;
      const adv = player.advanced;
      const usg = adv?.usgPct ?? round1(mean(g.map((x) => x.usgEst)));
      const ts = adv?.tsPct ?? round1(mean(g.map((x) => x.tsPct)));
      const efg = adv?.efgPct ?? round1(mean(g.map((x) => x.efgPct)));
      const gmsc = round1(mean(g.map((x) => x.gameScore)));
      return [
        { label: 'Uso (USG%)', helpKey: 'usgPct', val: `${usg.toFixed(1)}%` },
        { label: 'Tiro Verdadero (TS%)', helpKey: 'tsPct', val: `${ts.toFixed(1)}%` },
        { label: 'Tiro Efectivo (eFG%)', helpKey: 'efgPct', val: `${efg.toFixed(1)}%` },
        { label: 'Game Score medio', helpKey: 'gmSc', val: `${gmsc.toFixed(1)}` },
        {
          label: 'OffRtg / DefRtg',
          helpKey: 'offRtg',
          val: adv ? `${adv.offRtg.toFixed(1)} / ${adv.defRtg.toFixed(1)}` : '—',
        },
        {
          label: 'NetRtg / PIE%',
          helpKey: 'pie',
          val: adv
            ? `${formatSigned(adv.netRtg)} · ${adv.pie.toFixed(1)}%`
            : '—',
        },
        {
          label: 'AST% / OREB%',
          helpKey: 'astPct',
          val: adv ? `${adv.astPct.toFixed(1)}% / ${adv.orebPct.toFixed(1)}%` : '—',
        },
        {
          label: 'PTS Pintura / 2ª Jug.',
          helpKey: 'ptsPaint',
          val: adv
            ? `${adv.ptsPaint.toFixed(1)} / ${adv.pts2ndChance.toFixed(1)}`
            : '—',
        },
        {
          label: 'Contraat. / Pérd. Rival',
          helpKey: 'ptsFastBreak',
          val: adv
            ? `${adv.ptsFastBreak.toFixed(1)} / ${adv.ptsOffTov.toFixed(1)}`
            : '—',
        },
        {
          label: 'Punteados / Desvíos',
          helpKey: 'contestedShots',
          val: adv
            ? `${adv.contestedShots.toFixed(1)} / ${adv.deflections.toFixed(1)}`
            : '—',
        },
        {
          label: 'Screen AST / Box-Outs',
          helpKey: 'screenAssists',
          val: adv
            ? `${adv.screenAssists.toFixed(1)} / ${adv.boxOuts.toFixed(1)}`
            : '—',
        },
        {
          label: 'Faltas recibidas / PJ',
          helpKey: 'foulsDrawn',
          val: adv ? `${adv.foulsDrawn.toFixed(1)}` : '—',
        },
      ];
    }

    if (team) {
      const g = team.games;
      const adv = team.advanced;
      const off = adv?.offRtg ?? round1(mean(g.map((x) => x.offRtg)));
      const def = adv?.defRtg ?? round1(mean(g.map((x) => x.defRtg)));
      const net = adv?.netRtg ?? round1(off - def);
      const pace = adv?.pace ?? round1(mean(g.map((x) => x.pace)));
      const efg = adv?.efgPct ?? round1(mean(g.map((x) => x.efgPct)));
      const ts = adv?.tsPct ?? round1(mean(g.map((x) => x.tsPct)));
      const orebP = adv?.orebPct ?? round1(mean(g.map((x) => x.orebPct)));
      const tovP = adv?.tovPct ?? round1(mean(g.map((x) => x.tovPct)));

      return [
        { label: 'Offensive Rating', helpKey: 'offRtg', val: `${off.toFixed(1)}` },
        { label: 'Defensive Rating', helpKey: 'defRtg', val: `${def.toFixed(1)}` },
        { label: 'Net Rating', helpKey: 'netRtg', val: formatSigned(net) },
        { label: 'Pace (Pos/48m)', helpKey: 'paceSimple', val: `${pace.toFixed(1)}` },
        {
          label: '4F: eFG% / TS%',
          helpKey: 'efgPct',
          val: `${efg.toFixed(1)}% / ${ts.toFixed(1)}%`,
        },
        {
          label: '4F: OREB% / TOV%',
          helpKey: 'orebPct',
          val: `${orebP.toFixed(1)}% / ${tovP.toFixed(1)}%`,
        },
        {
          label: 'PTS Pintura (Fav/Riv)',
          helpKey: 'ptsPaint',
          val: adv
            ? `${adv.ptsPaint.toFixed(1)} / ${adv.oppPtsPaint.toFixed(1)}`
            : '—',
        },
        {
          label: 'PTS 2ª Oportunidad',
          helpKey: 'pts2ndChance',
          val: adv ? `${adv.pts2ndChance.toFixed(1)} PTS/PJ` : '—',
        },
        {
          label: 'Contraataque / Tras Pérd.',
          helpKey: 'ptsFastBreak',
          val: adv
            ? `${adv.ptsFastBreak.toFixed(1)} / ${adv.ptsOffTov.toFixed(1)}`
            : '—',
        },
        {
          label: 'Tiros Punteados / PJ',
          helpKey: 'contestedShots',
          val: adv ? `${adv.contestedShots.toFixed(1)}` : '—',
        },
        {
          label: 'Desvíos (Deflections)',
          helpKey: 'deflections',
          val: adv ? `${adv.deflections.toFixed(1)}` : '—',
        },
        {
          label: 'Screen AST / Box-Outs',
          helpKey: 'screenAssists',
          val: adv
            ? `${adv.screenAssists.toFixed(1)} / ${adv.boxOuts.toFixed(1)}`
            : '—',
        },
      ];
    }

    return [];
  })();

  // Splits summary
  const splits = (() => {
    if (player) {
      const home = player.games.filter((g) => g.isHome);
      const away = player.games.filter((g) => !g.isHome);
      const b2b = player.games.filter((g) => g.isBackToBack);
      const rest = player.games.filter((g) => !g.isBackToBack);
      if (experienceMode === 'simple') {
        return [
          {
            label: `En Casa (${home.length} PJ)`,
            value: home.length
              ? `${mean(home.map((g) => g.points)).toFixed(1)} PTS · ${mean(
                  home.map((g) => g.rebounds)
                ).toFixed(1)} REB`
              : '—',
          },
          {
            label: `Fuera (${away.length} PJ)`,
            value: away.length
              ? `${mean(away.map((g) => g.points)).toFixed(1)} PTS · ${mean(
                  away.map((g) => g.rebounds)
                ).toFixed(1)} REB`
              : '—',
          },
          {
            label: `Con descanso (${rest.length} PJ)`,
            value: rest.length
              ? `${mean(rest.map((g) => g.points)).toFixed(1)} PTS · ${mean(
                  rest.map((g) => g.minutes)
                ).toFixed(0)} MIN`
              : '—',
          },
          {
            label: `Sin descanso (${b2b.length} PJ)`,
            value: b2b.length
              ? `${mean(b2b.map((g) => g.points)).toFixed(1)} PTS · ${mean(
                  b2b.map((g) => g.minutes)
                ).toFixed(0)} MIN`
              : '—',
          },
        ];
      }
      return [
        {
          label: `Local (${home.length} PJ)`,
          value: home.length
            ? `${mean(home.map((g) => g.points)).toFixed(1)} PTS · ${mean(
                home.map((g) => g.tsPct)
              ).toFixed(0)}% TS`
            : '—',
        },
        {
          label: `Visitante (${away.length} PJ)`,
          value: away.length
            ? `${mean(away.map((g) => g.points)).toFixed(1)} PTS · ${mean(
                away.map((g) => g.tsPct)
              ).toFixed(0)}% TS`
            : '—',
        },
        {
          label: `Con descanso (${rest.length} PJ)`,
          value: rest.length
            ? `${mean(rest.map((g) => g.points)).toFixed(1)} PTS · ${mean(
                rest.map((g) => g.usgEst)
              ).toFixed(0)}% USG`
            : '—',
        },
        {
          label: `Back-to-Back (${b2b.length} PJ)`,
          value: b2b.length
            ? `${mean(b2b.map((g) => g.points)).toFixed(1)} PTS · ${mean(
                b2b.map((g) => g.usgEst)
              ).toFixed(0)}% USG`
            : '—',
        },
      ];
    }
    if (team) {
      const home = team.games.filter((g) => g.isHome);
      const away = team.games.filter((g) => !g.isHome);
      const b2b = team.games.filter((g) => g.isBackToBack);
      const rest = team.games.filter((g) => !g.isBackToBack);
      if (experienceMode === 'simple') {
        return [
          {
            label: `En Casa (${team.homeRecord})`,
            value: home.length
              ? `${formatSigned(mean(home.map((g) => g.differential)))} pts margen`
              : '—',
          },
          {
            label: `Fuera (${team.roadRecord})`,
            value: away.length
              ? `${formatSigned(mean(away.map((g) => g.differential)))} pts margen`
              : '—',
          },
          {
            label: `Con descanso (${rest.length} PJ)`,
            value: rest.length
              ? `${formatSigned(mean(rest.map((g) => g.differential)))} pts margen`
              : '—',
          },
          {
            label: `Sin descanso (${b2b.length} PJ)`,
            value: b2b.length
              ? `${formatSigned(mean(b2b.map((g) => g.differential)))} pts margen`
              : '—',
          },
        ];
      }
      return [
        {
          label: `Casa (${team.homeRecord})`,
          value: home.length
            ? `${formatSigned(mean(home.map((g) => g.netRtg)))} NetRtg`
            : '—',
        },
        {
          label: `Fuera (${team.roadRecord})`,
          value: away.length
            ? `${formatSigned(mean(away.map((g) => g.netRtg)))} NetRtg`
            : '—',
        },
        {
          label: `Descansado (${rest.length} PJ)`,
          value: rest.length
            ? `${formatSigned(mean(rest.map((g) => g.netRtg)))} NetRtg`
            : '—',
        },
        {
          label: `Back-to-Back (${b2b.length} PJ)`,
          value: b2b.length
            ? `${formatSigned(mean(b2b.map((g) => g.netRtg)))} NetRtg`
            : '—',
        },
      ];
    }
    return [];
  })();

  // SVG Geometry
  const svgW = 520;
  const svgH = 148;
  const padX = 24;
  const padY = 20;
  const vals = chartData.values;
  const minVal = vals.length ? Math.min(...vals, chartData.base) : 0;
  const maxVal = vals.length ? Math.max(...vals, chartData.base) : 10;
  const span = Math.max(4, maxVal - minVal);

  const toX = (i: number) =>
    vals.length <= 1
      ? svgW / 2
      : padX + (i / (vals.length - 1)) * (svgW - padX * 2);
  const toY = (v: number) =>
    svgH - padY - ((v - minVal) / span) * (svgH - padY * 2);

  const polylinePoints = vals.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const baseLineY = toY(chartData.base);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch justify-end bg-black/65 backdrop-blur-[2px]">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <aside className="relative z-10 w-full sm:max-w-2xl bg-[#0F172A] border-t sm:border-t-0 sm:border-l border-[#1E293B] rounded-t-3xl sm:rounded-none h-[92dvh] sm:h-full overflow-y-auto overscroll-contain flex flex-col pb-safe">
        {/* Sticky Header with Mobile Sheet Grab Handle */}
        <div className="sticky top-0 z-20 bg-[#0F172A]/95 backdrop-blur-md border-b border-[#1E293B] px-4 sm:px-6 pt-2.5 sm:pt-4 pb-3.5 sm:pb-4 space-y-2.5 sm:space-y-0">
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-2 sm:hidden" />

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-lg bg-[#131C2E] border border-[#1E293B] flex items-center justify-center font-display font-bold text-xs sm:text-sm text-orange-400 shrink-0">
                {player ? player.teamAbbr : team?.abbreviation}
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 truncate">
                  {player ? player.name : team?.name}
                </h2>
                <p className="text-xs text-slate-400 truncate">
                  {player
                    ? `${player.teamName} · ${player.position}${
                        player.height ? ` · ${player.height}` : ''
                      }${player.country ? ` · ${player.country}` : ''} · ${
                        player.games.length
                      } PJ`
                    : `Conf. ${team?.conference} · Balance ${team?.wins}-${team?.losses} · Racha ${team?.streakCode}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onToggleWatchlist(wKey)}
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isWatched
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                    : 'bg-[#131C2E] border-[#1E293B] text-slate-300 hover:text-white'
                }`}
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    isWatched ? 'fill-orange-400 text-orange-400' : ''
                  }`}
                />
                <span>{isWatched ? 'En seguimiento' : 'Seguir'}</span>
              </button>

              {player && onOpenInDuel && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenInDuel(player.id);
                    onClose();
                  }}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] border border-[#1E293B] text-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Swords className="w-3.5 h-3.5 text-orange-400" />
                  <span>Duelo 1v1</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onOpenInComparator(entityType, entityId);
                  onClose();
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Comparar tramos</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar inspector"
                className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 -mr-1.5 sm:mr-0 p-2 sm:p-1.5 flex items-center justify-center rounded-lg text-slate-400 hover:text-white active:bg-[#131C2E] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Mobile Action Row (< sm) so player/team name never gets crushed */}
          <div
            className={`grid ${
              player && onOpenInDuel ? 'grid-cols-3' : 'grid-cols-2'
            } gap-1.5 sm:hidden pt-1`}
          >
            <button
              type="button"
              onClick={() => onToggleWatchlist(wKey)}
              className={`min-h-[40px] inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                isWatched
                  ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                  : 'bg-[#131C2E] border-[#1E293B] text-slate-200'
              }`}
            >
              <Star
                className={`w-3.5 h-3.5 shrink-0 ${
                  isWatched ? 'fill-orange-400 text-orange-400' : ''
                }`}
              />
              <span>{isWatched ? 'Favorito' : 'Seguir'}</span>
            </button>

            {player && onOpenInDuel && (
              <button
                type="button"
                onClick={() => {
                  onOpenInDuel(player.id);
                  onClose();
                }}
                className="min-h-[40px] inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-[#131C2E] border border-[#1E293B] text-slate-100 rounded-lg active:bg-[#182338] transition-colors whitespace-nowrap"
              >
                <Swords className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span>Duelo 1v1</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onOpenInComparator(entityType, entityId);
                onClose();
              }}
              className="min-h-[40px] inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg active:scale-[0.98] transition-all whitespace-nowrap"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
              <span>Tramos</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
          {/* Section 0: Visual Thermometer vs NBA League Average */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Nivel comparado frente a la Media de la NBA
              </h3>
              <span className="text-[11px] text-slate-400">
                Marca blanca central = promedio NBA
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-[#1E293B]">
              {nbaGaugeItems.slice(0, 2).map((item, idx) => (
                <div key={idx} className="p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
                      <span>{item.title}</span>
                      <MetricInfoTooltip
                        helpKey={item.helpKey}
                        align="left"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-100">
                      {item.valueLabel}
                    </span>
                  </div>
                  <NbaComparisonBar value={item.value} benchmark={item.benchmark} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-[#1E293B]">
              {nbaGaugeItems.slice(2, 4).map((item, idx) => (
                <div key={idx} className="p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
                      <span>{item.title}</span>
                      <MetricInfoTooltip
                        helpKey={item.helpKey}
                        align="left"
                        iconClassName="w-3 h-3"
                      />
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-100">
                      {item.valueLabel}
                    </span>
                  </div>
                  <NbaComparisonBar value={item.value} benchmark={item.benchmark} />
                </div>
              ))}
            </div>
          </section>

          {/* Section 1: Essential Summary (Simple Mode) or Deep 12-Cell NBA.com Profile (Advanced Mode) */}
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                {experienceMode === 'simple'
                  ? 'Resumen de su aportación habitual'
                  : 'Radiografía Avanzada, Cuatro Factores, Pintura y Hustle (NBA.com)'}
              </h3>
              {experienceMode === 'simple' && (
                <button
                  type="button"
                  onClick={onSwitchToAdvanced}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] border border-[#1E293B] rounded-md text-orange-400 transition-colors whitespace-nowrap shrink-0"
                >
                  <Sliders className="w-3 h-3" />
                  <span>Ver 12 métricas avanzadas NBA.com</span>
                </button>
              )}
            </div>

            {experienceMode === 'simple' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-[#1E293B]">
                {simpleSummaryCells.map((cell, idx) => (
                  <div key={idx} className="p-3">
                    <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
                      <span className="truncate">{cell.label}</span>
                      <MetricInfoTooltip
                        helpKey={cell.helpKey}
                        iconClassName="w-3 h-3"
                      />
                    </div>
                    <p className="mt-0.5 text-sm font-semibold font-mono tabular-nums text-slate-100 truncate">
                      {cell.val}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y divide-x divide-[#1E293B]">
                {profileCells.map((cell, idx) => (
                  <div key={idx} className="p-3">
                    <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
                      <span className="truncate">{cell.label}</span>
                      <MetricInfoTooltip
                        helpKey={cell.helpKey}
                        iconClassName="w-3 h-3"
                      />
                    </div>
                    <p className="mt-0.5 text-sm font-semibold font-mono tabular-nums text-slate-100 truncate">
                      {cell.val}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Trend Chart (Basic & Advanced per-game metrics) */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                  <span>Evolución en sus últimos {vals.length} partidos</span>
                  <MetricInfoTooltip
                    helpKey={player ? pMetric : tMetric}
                    align="left"
                  />
                </h3>
                <p className="text-xs text-slate-400">
                  Línea punteada: su media habitual ({chartData.base.toFixed(1)}) · Puntos naranjas: últimos {windowSize} partidos
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
                {player
                  ? (experienceMode === 'simple'
                      ? ([
                          { id: 'points', label: 'Puntos' },
                          { id: 'rebounds', label: 'Rebotes' },
                          { id: 'assists', label: 'Pases' },
                          { id: 'plusMinus', label: '+/-' },
                        ] as const)
                      : ([
                          { id: 'points', label: 'PTS' },
                          { id: 'rebounds', label: 'REB' },
                          { id: 'assists', label: 'AST' },
                          { id: 'usgEst', label: 'USG%' },
                          { id: 'tsPct', label: 'TS%' },
                          { id: 'gameScore', label: 'GmSc' },
                          { id: 'plusMinus', label: '+/-' },
                        ] as const)
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPMetric(m.id)}
                        className={`px-2 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                          pMetric === m.id
                            ? 'bg-orange-500 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))
                  : (experienceMode === 'simple'
                      ? ([
                          { id: 'differential', label: 'Margen PTS' },
                          { id: 'offRtg', label: 'Ataque' },
                          { id: 'defRtg', label: 'Defensa' },
                          { id: 'pace', label: 'Velocidad' },
                        ] as const)
                      : ([
                          { id: 'netRtg', label: 'NetRtg' },
                          { id: 'offRtg', label: 'OffRtg' },
                          { id: 'defRtg', label: 'DefRtg' },
                          { id: 'pace', label: 'Pace' },
                          { id: 'differential', label: 'DIF' },
                        ] as const)
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setTMetric(m.id)}
                        className={`px-2 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                          tMetric === m.id
                            ? 'bg-orange-500 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
              </div>
            </div>

            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3">
              {vals.length > 1 ? (
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="w-full h-36 overflow-visible"
                >
                  <line
                    x1={padX}
                    y1={baseLineY}
                    x2={svgW - padX}
                    y2={baseLineY}
                    stroke="#64748B"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <polyline
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="2"
                    points={polylinePoints}
                  />
                  {vals.map((v, i) => {
                    const isRecentWindow = i >= vals.length - windowSize;
                    return (
                      <g key={i}>
                        <circle
                          cx={toX(i)}
                          cy={toY(v)}
                          r={isRecentWindow ? 4.5 : 3}
                          fill={isRecentWindow ? '#F97316' : '#0F172A'}
                          stroke={isRecentWindow ? '#FDBA74' : '#38BDF8'}
                          strokeWidth="1.5"
                        >
                          <title>{`${chartData.labels[i]}: ${v}`}</title>
                        </circle>
                        {(i === vals.length - 1 ||
                          i === 0 ||
                          i === vals.length - windowSize) && (
                          <text
                            x={toX(i)}
                            y={Math.max(12, toY(v) - 8)}
                            textAnchor="middle"
                            className="fill-slate-300 text-[10px] font-mono"
                          >
                            {v}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <p className="text-xs text-slate-400 py-8 text-center">
                  Muestra insuficiente para trazar serie temporal.
                </p>
              )}
            </div>
          </section>

          {/* Section 3: Datos a tener en cuenta */}
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-100">
              {experienceMode === 'simple'
                ? 'Claves rápidas en lenguaje claro'
                : 'Datos a tener en cuenta y contexto analítico'}
            </h3>
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y divide-[#1E293B]">
              {takeaways.map((note, idx) => (
                <div
                  key={idx}
                  className="px-4 py-3 text-xs text-slate-200 leading-relaxed"
                >
                  {note}
                </div>
              ))}
            </div>
          </section>

          {/* Section 4: Situational Splits */}
          <section className="space-y-2.5">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100">
              <span>Desglose por contexto (Localía y Descanso)</span>
              <MetricInfoTooltip helpKey="splitContext" align="left" />
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-[#1E293B]">
              {splits.map((sp, idx) => (
                <div key={idx} className="p-3">
                  <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
                    <span className="truncate">{sp.label}</span>
                    <MetricInfoTooltip
                      helpKey="splitContext"
                      iconClassName="w-3 h-3"
                    />
                  </div>
                  <p className="mt-1 text-xs font-semibold font-mono tabular-nums text-slate-100">
                    {sp.value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Section 5: Game-by-Game Log (Basic & Advanced toggle) or Team Roster */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                {team
                  ? 'Registro del equipo y plantilla oficial'
                  : 'Registro partido a partido'}
              </h3>

              <div className="flex items-center gap-2">
                {(player || (team && teamTab === 'games')) && (
                  <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                    {(
                      [
                        { id: 'basic', label: 'Básicas' },
                        { id: 'advanced', label: 'Avanzadas' },
                      ] as const
                    ).map((lm) => (
                      <button
                        key={lm.id}
                        type="button"
                        onClick={() => setLogMode(lm.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded ${
                          logMode === lm.id
                            ? 'bg-[#1E293B] text-orange-400 font-semibold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {lm.label}
                      </button>
                    ))}
                  </div>
                )}

                {team && (
                  <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setTeamTab('games')}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        teamTab === 'games'
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Partidos ({team.games.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeamTab('roster')}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        teamTab === 'roster'
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Plantilla activa
                    </button>
                  </div>
                )}
              </div>
            </div>

            {player && (
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-slate-400 bg-[#0B1120]/60">
                      <th className="py-2.5 pl-3 pr-2 font-medium">Fecha</th>
                      <th className="py-2.5 px-2 font-medium">Rival</th>
                      {logMode === 'basic' ? (
                        <>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="MIN" helpKey="minBase" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="PTS" helpKey="ptsBase" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="REB (OR)" helpKey="rebBase" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="AST" helpKey="astBase" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="TC" helpKey="fgPct" />
                          </th>
                          <th className="py-2.5 pr-3 pl-2 font-medium text-right">
                            <ColumnHelpHeader label="+/-" helpKey="plusMinusBase" />
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="MIN" helpKey="minBase" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="USG%" helpKey="usgPct" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="TS%" helpKey="tsPct" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="eFG%" helpKey="efgPct" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="GmSc" helpKey="gmSc" />
                          </th>
                          <th className="py-2.5 pr-3 pl-2 font-medium text-right">
                            <ColumnHelpHeader label="STK / PER" helpKey="stocksBase" />
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] font-mono tabular-nums">
                    {player.games.slice(0, 28).map((g, idx) => (
                      <tr
                        key={g.eventId}
                        className={
                          idx < windowSize ? 'bg-orange-500/[0.04]' : undefined
                        }
                      >
                        <td className="py-2 pl-3 pr-2 text-slate-300 whitespace-nowrap">
                          {formatShortDate(g.date)}
                        </td>
                        <td className="py-2 px-2 font-sans text-slate-200 whitespace-nowrap">
                          <span
                            className={
                              g.result === 'W'
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }
                          >
                            {g.result}
                          </span>
                          {' · '}
                          {g.isHome ? 'vs' : '@'} {g.opponentAbbr}
                          {g.isBackToBack && (
                            <span className="text-amber-400"> · B2B</span>
                          )}
                        </td>
                        {logMode === 'basic' ? (
                          <>
                            <td className="py-2 px-2 text-right text-slate-300">
                              {g.minutes}
                            </td>
                            <td className="py-2 px-2 text-right font-semibold text-slate-100">
                              {g.points}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-300 whitespace-nowrap">
                              {g.rebounds}{' '}
                              <span className="text-slate-500">({g.oreb})</span>
                            </td>
                            <td className="py-2 px-2 text-right text-slate-300">
                              {g.assists}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-400 whitespace-nowrap">
                              {g.fgm}-{g.fga}
                            </td>
                            <td
                              className={`py-2 pr-3 pl-2 text-right ${
                                g.plusMinus > 0
                                  ? 'text-emerald-400'
                                  : g.plusMinus < 0
                                  ? 'text-rose-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {formatSigned(g.plusMinus, 0)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 px-2 text-right text-slate-300">
                              {g.minutes}
                            </td>
                            <td className="py-2 px-2 text-right text-orange-300 font-medium">
                              {g.usgEst.toFixed(1)}%
                            </td>
                            <td className="py-2 px-2 text-right text-emerald-300">
                              {g.tsPct.toFixed(1)}%
                            </td>
                            <td className="py-2 px-2 text-right text-slate-300">
                              {g.efgPct.toFixed(1)}%
                            </td>
                            <td className="py-2 px-2 text-right font-semibold text-slate-100">
                              {g.gameScore.toFixed(1)}
                            </td>
                            <td className="py-2 pr-3 pl-2 text-right text-slate-400 whitespace-nowrap">
                              {g.stocks} / {g.turnovers}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {team && teamTab === 'games' && (
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-slate-400 bg-[#0B1120]/60">
                      <th className="py-2.5 pl-3 pr-2 font-medium">Fecha</th>
                      <th className="py-2.5 px-2 font-medium">Partido</th>
                      {logMode === 'basic' ? (
                        <>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="Marcador" helpKey="avgPointsFor" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="Dif." helpKey="differential" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="OR/REB" helpKey="orebBase" />
                          </th>
                          <th className="py-2.5 pr-3 pl-2 font-medium text-right">
                            <ColumnHelpHeader label="3PM" helpKey="fg3m" />
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="OffRtg" helpKey="offRtg" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="DefRtg" helpKey="defRtg" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="NetRtg" helpKey="netRtg" />
                          </th>
                          <th className="py-2.5 px-2 font-medium text-right">
                            <ColumnHelpHeader label="Pace" helpKey="paceSimple" />
                          </th>
                          <th className="py-2.5 pr-3 pl-2 font-medium text-right">
                            <ColumnHelpHeader label="eFG%" helpKey="efgPct" />
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] font-mono tabular-nums">
                    {team.games.slice(0, 28).map((g, idx) => (
                      <tr
                        key={g.eventId}
                        className={
                          idx < windowSize ? 'bg-orange-500/[0.04]' : undefined
                        }
                      >
                        <td className="py-2 pl-3 pr-2 text-slate-300 whitespace-nowrap">
                          {formatShortDate(g.date)}
                        </td>
                        <td className="py-2 px-2 font-sans text-slate-200 whitespace-nowrap">
                          <span
                            className={
                              g.result === 'W'
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }
                          >
                            {g.result}
                          </span>
                          {' · '}
                          {g.isHome ? 'vs' : '@'} {g.opponentAbbr}
                          {g.isBackToBack && (
                            <span className="text-amber-400"> · B2B</span>
                          )}
                        </td>
                        {logMode === 'basic' ? (
                          <>
                            <td className="py-2 px-2 text-right text-slate-100 whitespace-nowrap">
                              {g.pointsFor}-{g.pointsAgainst}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-semibold ${
                                g.differential >= 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {formatSigned(g.differential, 0)}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-300 whitespace-nowrap">
                              {g.oreb}/{g.reb}
                            </td>
                            <td className="py-2 pr-3 pl-2 text-right text-slate-400 whitespace-nowrap">
                              {g.fg3m}-{g.fg3a}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 px-2 text-right text-slate-200">
                              {g.offRtg.toFixed(1)}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-300">
                              {g.defRtg.toFixed(1)}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-semibold ${
                                g.netRtg >= 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {formatSigned(g.netRtg, 1)}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-300">
                              {g.pace.toFixed(1)}
                            </td>
                            <td className="py-2 pr-3 pl-2 text-right text-orange-300">
                              {g.efgPct.toFixed(1)}%
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {team && teamTab === 'roster' && (
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
                {loadingRoster ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Cargando plantilla oficial NBA.com de {team.name}...
                  </div>
                ) : roster.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No se pudo cargar la plantilla en este momento.
                  </div>
                ) : (
                  <div className="divide-y divide-[#1E293B]">
                    {roster.map((rp) => (
                      <div
                        key={rp.id}
                        className="px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#182338] transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-100 truncate">
                            {rp.name}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            #{rp.jersey} · {rp.position}
                            {rp.height ? ` · ${rp.height}` : ''}
                            {rp.country ? ` · ${rp.country}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={loadingPlayerId === rp.id}
                          onClick={async () => {
                            setLoadingPlayerId(rp.id);
                            try {
                              await onSelectRosterPlayer({
                                id: rp.id,
                                name: rp.name,
                                teamAbbr: team.abbreviation,
                                position: rp.position,
                              });
                            } finally {
                              setLoadingPlayerId(null);
                            }
                          }}
                          className="min-h-[38px] sm:min-h-0 px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-orange-500 hover:text-slate-950 border border-[#283548] rounded-lg sm:rounded-md text-slate-200 transition-colors whitespace-nowrap shrink-0"
                        >
                          {loadingPlayerId === rp.id
                            ? 'Cargando...'
                            : 'Analizar'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
