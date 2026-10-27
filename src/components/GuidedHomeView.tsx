import { useMemo } from 'react';
import {
  ArrowRight,
  Compass,
  Flame,
  Shield,
  Star,
  TrendingUp,
} from 'lucide-react';
import type {
  ActiveSection,
  AnomalySignal,
  ExperienceMode,
  PlayerSummary,
  StreakEntry,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import { formatShortDate, formatSigned, mean, round1 } from '../utils/analytics';
import {
  describeZScoreHuman,
  plainAnomalyExplanation,
  plainMetricName,
  type LeagueBenchmarks,
} from '../utils/humanize';
import {
  ColumnHelpHeader,
  MetricInfoTooltip,
  NbaComparisonBar,
} from './MetricUiHelpers';

interface GuidedHomeViewProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
  anomalies: AnomalySignal[];
  streaks: StreakEntry[];
  benchmarks: LeagueBenchmarks;
  windowSize: WindowSize;
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onNavigateSection: (section: ActiveSection) => void;
}

export function GuidedHomeView({
  players,
  teams,
  anomalies,
  streaks,
  benchmarks,
  windowSize,
  experienceMode,
  watchlistIds,
  onlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  onNavigateSection,
}: GuidedHomeViewProps) {
  // 1. Top surging players (deduplicated by entityId)
  const surgingPlayers = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{
      sig: AnomalySignal;
      ptsBase: number;
    }> = [];

    for (const s of anomalies) {
      if (s.entityType !== 'player') continue;
      if (onlyWatchlist && !watchlistIds.has(`player:${s.entityId}`)) continue;
      if (s.absDelta <= 0) continue;
      if (seen.has(s.entityId)) continue;
      seen.add(s.entityId);

      const pObj = players.find((p) => p.id === s.entityId);
      const ptsBase = pObj
        ? round1(mean(pObj.games.map((g) => g.points)))
        : s.baselineAvg;
      list.push({ sig: s, ptsBase });
      if (list.length >= 5) break;
    }

    return list;
  }, [anomalies, players, onlyWatchlist, watchlistIds]);

  // 2. Top dominant teams in recent window
  const hottestTeams = useMemo(() => {
    return teams
      .filter((t) => {
        if (onlyWatchlist && !watchlistIds.has(`team:${t.id}`)) return false;
        return t.games.length > 0;
      })
      .map((t) => {
        const slice = t.games.slice(0, Math.min(windowSize, t.games.length));
        const recWins = slice.filter((g) => g.result === 'W').length;
        const recDiff = round1(mean(slice.map((g) => g.differential)));
        const recNet = round1(mean(slice.map((g) => g.netRtg)));
        return {
          team: t,
          recWins,
          recGames: slice.length,
          recDiff,
          recNet,
        };
      })
      .sort((a, b) => b.recDiff - a.recDiff)
      .slice(0, 4);
  }, [teams, windowSize, onlyWatchlist, watchlistIds]);

  // 3. Best recent single-game performance across loaded games
  const bestRecentNight = useMemo(() => {
    let best: {
      playerId: string;
      playerName: string;
      teamAbbr: string;
      pts: number;
      reb: number;
      ast: number;
      opp: string;
      date: string;
      score: number;
    } | null = null;

    for (const p of players) {
      const recentGames = p.games.slice(0, Math.min(5, p.games.length));
      for (const g of recentGames) {
        if (!best || g.gameScore > best.score) {
          best = {
            playerId: p.id,
            playerName: p.name,
            teamAbbr: p.teamAbbr,
            pts: g.points,
            reb: g.rebounds,
            ast: g.assists,
            opp: g.opponentAbbr,
            date: g.date,
            score: g.gameScore,
          };
        }
      }
    }
    return best;
  }, [players]);

  const topActiveStreaks = useMemo(() => {
    return streaks
      .filter((s) => {
        if (!s.isPositive) return false;
        if (onlyWatchlist && !watchlistIds.has(`${s.entityType}:${s.entityId}`))
          return false;
        return true;
      })
      .slice(0, 4);
  }, [streaks, onlyWatchlist, watchlistIds]);

  const topPlayerHero = surgingPlayers[0]?.sig;
  const topTeamHero = hottestTeams[0];

  const guidedQuestions: Array<{
    question: string;
    answerDesc: string;
    ctaLabel: string;
    target: ActiveSection;
  }> = [
    {
      question: '¿Qué pasó anoche sin mirar 12 partidos?',
      answerDesc:
        'Resumen completo de la jornada con quinteto ideal, claves de cada marcador, explosiones, picos de minutos y rachas rotas.',
      ctaLabel: 'Analizar Jornada NBA',
      target: 'gameday',
    },
    {
      question: '¿Quién gana en un duelo directo 1 contra 1?',
      answerDesc:
        'Enfrenta dos jugadores cualesquiera con radar superpuesto de 6 ejes y marcador de categorías ganadas.',
      ctaLabel: 'Abrir Duelo Directo 1v1',
      target: 'duel',
    },
    {
      question: '¿Quién tiene los mayores récords del año?',
      answerDesc:
        'Consulta la máxima anotación en una noche, triples, rebotes y compara esta temporada con la pasada.',
      ctaLabel: 'Ir a Hitos de Temporada',
      target: 'milestones',
    },
    {
      question: '¿Quiero ver toda la liga (+580 jugadores)?',
      answerDesc:
        'Explora todos los jugadores NBA en 3 capas estadísticas con barra visual frente a la media.',
      ctaLabel: 'Explorar Jugadores NBA',
      target: 'players',
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Row 1: Homogeneous 4-Column Flat Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div
          onClick={() =>
            topPlayerHero && onInspectEntity('player', topPlayerHero.entityId)
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            topPlayerHero ? 'hover:bg-[#182338] active:bg-[#182338] cursor-pointer' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Más en forma hoy</span>
            <MetricInfoTooltip
              helpKey={topPlayerHero?.metricKey || 'zScore'}
            />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {topPlayerHero ? topPlayerHero.entityName : '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
            {topPlayerHero
              ? `▲ ${formatSigned(topPlayerHero.pctDelta, 0, '%')} · ${
                  topPlayerHero.windowAvg
                } (${topPlayerHero.sampleGames} PJ)`
              : 'Sin alertas con filtro actual'}
          </p>
        </div>

        <div
          onClick={() =>
            topTeamHero && onInspectEntity('team', topTeamHero.team.id)
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            topTeamHero ? 'hover:bg-[#182338] active:bg-[#182338] cursor-pointer' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Equipo más dominante</span>
            <MetricInfoTooltip helpKey="windowDiff" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {topTeamHero ? topTeamHero.team.name : '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
            {topTeamHero
              ? `${topTeamHero.recWins}-${
                  topTeamHero.recGames - topTeamHero.recWins
                } · ${formatSigned(topTeamHero.recDiff)} PTS`
              : '—'}
          </p>
        </div>

        <div
          onClick={() =>
            bestRecentNight &&
            onInspectEntity('player', bestRecentNight.playerId)
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            bestRecentNight ? 'hover:bg-[#182338] active:bg-[#182338] cursor-pointer' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Mayor exhibición</span>
            <MetricInfoTooltip helpKey="gmSc" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {bestRecentNight ? bestRecentNight.playerName : '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-slate-200 truncate">
            {bestRecentNight
              ? `${bestRecentNight.pts}P · ${bestRecentNight.reb}R · ${
                  bestRecentNight.ast
                }A (${formatShortDate(bestRecentNight.date)})`
              : '—'}
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Media de la NBA</span>
            <MetricInfoTooltip helpKey="avgPointsFor" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100 truncate">
            {benchmarks.team.avgPointsFor.mean.toFixed(1)}{' '}
            <span className="text-[11px] sm:text-xs font-sans font-normal text-slate-400">
              PTS/eq
            </span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Rotación: {benchmarks.player.pts.mean.toFixed(1)} PTS ·{' '}
            {benchmarks.player.tsPct.mean.toFixed(0)}% TS
          </p>
        </div>
      </div>

      {/* BLOCK 01: Protagonistas en Racha Explosiva */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">
              01. Protagonistas del Día: ¿Quién está rindiendo muy por encima de lo habitual?
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigateSection('anomalies')}
            className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
          >
            <span>Ver radar completo ({anomalies.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden">
          {surgingPlayers.length === 0 ? (
            <div className="py-10 px-6 text-center">
              <p className="text-sm font-medium text-slate-200">
                No hay explosiones individuales con el filtro actual.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Elige el modo de filtro "Amplio (Ver más)" arriba o desactiva "Solo seguimiento".
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Cards (< md) */}
              <div className="md:hidden divide-y divide-[#1E293B]">
                {surgingPlayers.map(({ sig, ptsBase }) => {
                  const wKey = `player:${sig.entityId}`;
                  const watched = watchlistIds.has(wKey);
                  const humanMag = describeZScoreHuman(sig.zScore, true);
                  const plainExp = plainAnomalyExplanation(sig);
                  return (
                    <div
                      key={sig.id}
                      onClick={() => onInspectEntity('player', sig.entityId)}
                      className="p-3.5 space-y-2.5 active:bg-[#182338] cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-100 truncate">
                            {sig.entityName}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {sig.subtitle}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Alternar seguimiento"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleWatchlist(wKey);
                          }}
                          className="min-w-[40px] min-h-[40px] -m-1.5 flex items-center justify-center rounded-lg text-slate-400 active:text-orange-400 shrink-0"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              watched ? 'fill-orange-400 text-orange-400' : ''
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-[#0B1120]/70 border border-[#1E293B] rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200">
                            <span className="truncate">
                              {experienceMode === 'simple'
                                ? plainMetricName(sig.metricKey, sig.metricLabel)
                                : sig.metricLabel}
                            </span>
                            <MetricInfoTooltip
                              helpKey={sig.metricKey}
                              fallbackTitle={sig.metricLabel}
                              align="left"
                            />
                          </div>
                          <div className={`text-[11px] ${humanMag.textClass}`}>
                            {humanMag.label}
                            {experienceMode === 'advanced'
                              ? ` · Z ${formatSigned(sig.zScore, 2, 'σ')}`
                              : ''}
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div className="text-sm font-semibold text-slate-100">
                            {sig.windowAvg.toFixed(1)}{' '}
                            <span className="text-[11px] font-normal text-slate-400">
                              (era {sig.baselineAvg.toFixed(1)})
                            </span>
                          </div>
                          <div className="text-xs text-emerald-400 font-semibold">
                            ▲ {formatSigned(sig.pctDelta, 0, '%')}
                          </div>
                        </div>
                      </div>

                      <NbaComparisonBar
                        value={ptsBase}
                        benchmark={benchmarks.player.pts}
                        showValueLabel={`${ptsBase.toFixed(1)} PTS`}
                      />

                      <div className="text-xs leading-relaxed">
                        <span className="font-medium text-slate-100">
                          {plainExp.headline}
                        </span>
                        <span className="text-slate-400">
                          {' · '}
                          {experienceMode === 'simple'
                            ? plainExp.detail
                            : sig.contextNote || plainExp.detail}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                    <th className="py-3 pl-4 pr-2 w-10 font-medium">Seg.</th>
                    <th className="py-3 px-3 font-medium">Jugador</th>
                    <th className="py-3 px-3 font-medium">
                      <ColumnHelpHeader
                        label="Qué ha disparado"
                        helpKey="zScore"
                        align="left"
                      />
                    </th>
                    <th className="py-3 px-3 font-medium text-right">
                      <ColumnHelpHeader
                        label={`Últ. ${windowSize} vs Habitual`}
                        helpKey="windowAvg"
                        align="right"
                      />
                    </th>
                    <th className="py-3 px-3 font-medium w-56">
                      <ColumnHelpHeader
                        label="Nivel anotador vs Media NBA"
                        helpKey="vsLeagueBar"
                        align="left"
                      />
                    </th>
                    <th className="py-3 pl-3 pr-4 font-medium min-w-[270px]">
                      Explicación en lenguaje claro
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] text-sm">
                  {surgingPlayers.map(({ sig, ptsBase }) => {
                    const wKey = `player:${sig.entityId}`;
                    const watched = watchlistIds.has(wKey);
                    const humanMag = describeZScoreHuman(sig.zScore, true);
                    const plainExp = plainAnomalyExplanation(sig);

                    return (
                      <tr
                        key={sig.id}
                        onClick={() => onInspectEntity('player', sig.entityId)}
                        className="hover:bg-[#182338] cursor-pointer transition-colors"
                      >
                        <td
                          className="py-3 pl-4 pr-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleWatchlist(wKey);
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Alternar seguimiento"
                            className="p-1 rounded text-slate-400 hover:text-orange-400"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                watched ? 'fill-orange-400 text-orange-400' : ''
                              }`}
                            />
                          </button>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-100 whitespace-nowrap">
                            {sig.entityName}
                          </div>
                          <div className="text-xs text-slate-400 whitespace-nowrap">
                            {sig.subtitle}
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                            <span>
                              {experienceMode === 'simple'
                                ? plainMetricName(sig.metricKey, sig.metricLabel)
                                : sig.metricLabel}
                            </span>
                            <MetricInfoTooltip
                              helpKey={sig.metricKey}
                              fallbackTitle={sig.metricLabel}
                              align="left"
                            />
                          </div>
                          <div className={`text-xs ${humanMag.textClass}`}>
                            {humanMag.label}
                            {experienceMode === 'advanced'
                              ? ` · Z ${formatSigned(sig.zScore, 2, 'σ')}`
                              : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-slate-100">
                            {sig.windowAvg.toFixed(1)}{' '}
                            <span className="text-xs font-normal text-slate-400">
                              (era {sig.baselineAvg.toFixed(1)})
                            </span>
                          </div>
                          <div className="text-xs text-emerald-400 font-medium">
                            ▲ {formatSigned(sig.pctDelta, 0, '%')}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <NbaComparisonBar
                            value={ptsBase}
                            benchmark={benchmarks.player.pts}
                            compact
                            showValueLabel={`${ptsBase.toFixed(1)} PTS`}
                          />
                        </td>
                        <td className="py-3 pl-3 pr-4 max-w-md">
                          <div className="text-xs font-medium text-slate-100">
                            {plainExp.headline}
                          </div>
                          <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                            {experienceMode === 'simple'
                              ? plainExp.detail
                              : sig.contextNote || plainExp.detail}
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
      </section>

      {/* BLOCK 02: Dominant Teams & Active Streaks Side-by-Side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        {/* Left: Dominant Teams */}
        <section className="space-y-3 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100">
                02. Equipos más Fuertes Ahora (Últimos {windowSize} PJ)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('teams')}
              className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Ver los 30 equipos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden flex-1">
            {/* Mobile Cards (< sm) */}
            <div className="sm:hidden divide-y divide-[#1E293B]">
              {hottestTeams.map(({ team, recWins, recGames, recDiff, recNet }) => (
                <div
                  key={team.id}
                  onClick={() => onInspectEntity('team', team.id)}
                  className="p-3.5 space-y-2 active:bg-[#182338] cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-100 truncate">
                        {team.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {team.wins}-{team.losses} global · Conf. {team.conference}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-sm font-semibold text-emerald-400">
                        {recWins}-{recGames - recWins} ({formatSigned(recDiff)})
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {experienceMode === 'advanced'
                          ? `NetRtg ${formatSigned(recNet)}`
                          : `Racha ${team.streakCode}`}
                      </div>
                    </div>
                  </div>
                  <NbaComparisonBar
                    value={team.avgPointsFor}
                    benchmark={benchmarks.team.avgPointsFor}
                    showValueLabel={`${team.avgPointsFor.toFixed(1)} PTS`}
                  />
                </div>
              ))}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                    <th className="py-2.5 pl-4 pr-3 font-medium">Franquicia</th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      <ColumnHelpHeader
                        label={`Últ. ${windowSize} PJ`}
                        helpKey="differential"
                      />
                    </th>
                    <th className="py-2.5 pl-3 pr-4 font-medium w-52">
                      <ColumnHelpHeader
                        label="Ataque vs Media NBA"
                        helpKey="vsLeagueBar"
                        align="left"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] text-sm">
                  {hottestTeams.map(({ team, recWins, recGames, recDiff, recNet }) => (
                    <tr
                      key={team.id}
                      onClick={() => onInspectEntity('team', team.id)}
                      className="hover:bg-[#182338] cursor-pointer transition-colors"
                    >
                      <td className="py-3 pl-4 pr-3">
                        <div className="font-medium text-slate-100 whitespace-nowrap">
                          {team.name}
                        </div>
                        <div className="text-xs text-slate-400 whitespace-nowrap">
                          {team.wins}-{team.losses} global · Conf. {team.conference}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-emerald-400">
                          {recWins}-{recGames - recWins} ({formatSigned(recDiff)} PTS)
                        </div>
                        <div className="text-xs text-slate-400">
                          {experienceMode === 'advanced'
                            ? `NetRtg ${formatSigned(recNet)}`
                            : `Racha ${team.streakCode}`}
                        </div>
                      </td>
                      <td className="py-3 pl-3 pr-4">
                        <NbaComparisonBar
                          value={team.avgPointsFor}
                          benchmark={benchmarks.team.avgPointsFor}
                          compact
                          showValueLabel={`${team.avgPointsFor.toFixed(1)}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Right: Active Streaks */}
        <section className="space-y-3 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Flame className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                03. Rachas Seguidas sin Fallar Activas Hoy
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('streaks')}
              className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Ver todas ({streaks.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden flex-1">
            {topActiveStreaks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Sin rachas activas con el corte actual de partidos seguidos.
              </div>
            ) : (
              <>
                {/* Mobile Cards (< sm) */}
                <div className="sm:hidden divide-y divide-[#1E293B]">
                  {topActiveStreaks.map((st) => (
                    <div
                      key={st.id}
                      onClick={() => onInspectEntity(st.entityType, st.entityId)}
                      className="p-3.5 flex items-center justify-between gap-3 active:bg-[#182338] cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-sm text-slate-100 truncate">
                          {st.entityName}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {st.subtitle}
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 pt-0.5">
                          <span>▲ {st.thresholdLabel}</span>
                          <MetricInfoTooltip
                            helpKey="consecutiveStreak"
                            align="left"
                            iconClassName="w-3 h-3"
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono tabular-nums text-sm font-bold text-orange-400">
                          {st.count} PJ
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-400">
                          Media {st.windowAvgDuringStreak.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                        <th className="py-2.5 pl-4 pr-3 font-medium">Protagonista</th>
                        <th className="py-2.5 px-3 font-medium">
                          <ColumnHelpHeader
                            label="Qué encadena"
                            helpKey="consecutiveStreak"
                            align="left"
                          />
                        </th>
                        <th className="py-2.5 pl-3 pr-4 font-medium text-right">
                          <ColumnHelpHeader
                            label="Partidos seguidos"
                            helpKey="consecutiveStreak"
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B] text-sm">
                      {topActiveStreaks.map((st) => (
                        <tr
                          key={st.id}
                          onClick={() => onInspectEntity(st.entityType, st.entityId)}
                          className="hover:bg-[#182338] cursor-pointer transition-colors"
                        >
                          <td className="py-3 pl-4 pr-3">
                            <div className="font-medium text-slate-100 whitespace-nowrap">
                              {st.entityName}
                            </div>
                            <div className="text-xs text-slate-400 whitespace-nowrap">
                              {st.subtitle}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 whitespace-nowrap">
                              <span>▲ {st.thresholdLabel}</span>
                              <MetricInfoTooltip
                                helpKey="consecutiveStreak"
                                align="left"
                                iconClassName="w-3 h-3"
                              />
                            </div>
                            <div className="text-xs text-slate-400 whitespace-nowrap">
                              Promedia {st.windowAvgDuringStreak.toFixed(1)} en la racha
                            </div>
                          </td>
                          <td className="py-3 pl-3 pr-4 text-right font-mono tabular-nums font-semibold text-orange-400 whitespace-nowrap">
                            {st.count} seguidos
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* BLOCK 03: Guided Exploration by Everyday Questions */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-orange-400 shrink-0" />
          <h2 className="text-sm font-semibold text-slate-100">
            04. ¿Qué te apetece descubrir ahora? Elige una pregunta para ir directo
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y md:divide-y-0 md:divide-x divide-[#1E293B]">
          {guidedQuestions.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onNavigateSection(item.target)}
              className="p-4 text-left hover:bg-[#182338] transition-colors flex flex-col justify-between gap-3 group"
            >
              <div>
                <p className="text-sm font-semibold text-slate-100 group-hover:text-orange-300 transition-colors">
                  {item.question}
                </p>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  {item.answerDesc}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400 whitespace-nowrap">
                <span>{item.ctaLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
