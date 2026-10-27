import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Flame,
  RefreshCw,
  Star,
  Swords,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type {
  ExperienceMode,
  GameDayChroniclePayload,
  GameDayMatchupCard,
  GameDayPayload,
  GameDayPlayerLine,
} from '../types/nba';
import { formatSigned } from '../utils/analytics';
import {
  GameScoutingReportModal,
  renderEditorialParagraphs,
  renderHighlightedInline,
} from './GameScoutingReportModal';
import { ColumnHelpHeader, MetricInfoTooltip } from './MetricUiHelpers';

interface GameDayAnalyzerViewProps {
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onOpenInDuel: (playerId: string) => void;
  externalRefreshCounter: number;
}

const SHORT_WEEKDAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const SHORT_MONTHS_ES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function formatCalendarChipDate(isoDate: string): {
  weekday: string;
  dayMonth: string;
  fullLabel: string;
} {
  const clean = (isoDate || '').slice(0, 10);
  const parts = clean.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return { weekday: '', dayMonth: clean, fullLabel: clean };
  }
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = SHORT_WEEKDAYS_ES[dt.getUTCDay()] || '';
  const month = SHORT_MONTHS_ES[dt.getUTCMonth()] || '';
  return {
    weekday,
    dayMonth: `${d} ${month}`,
    fullLabel: `${weekday} ${d} ${month} ${y}`,
  };
}

export function GameDayAnalyzerView({
  experienceMode,
  watchlistIds,
  onToggleWatchlist,
  onInspectEntity,
  onOpenInDuel,
  externalRefreshCounter,
}: GameDayAnalyzerViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [data, setData] = useState<GameDayPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [switchingDate, setSwitchingDate] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Interactive UI filters & expanded states
  const [mobileSectionTab, setMobileSectionTab] = useState<
    'all' | 'games' | 'outliers' | 'rotation'
  >('all');
  const [matchupFilter, setMatchupFilter] = useState<'all' | 'close' | 'watchlist'>(
    'all'
  );
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [mobileOutlierTab, setMobileOutlierTab] = useState<'explosions' | 'slumps'>(
    'explosions'
  );
  const [streakFilter, setStreakFilter] = useState<'all' | 'broken' | 'extended'>(
    'all'
  );

  // Global Daily Chronicle (folded by default every morning) + Match Report Modal state
  const [chronicleOpen, setChronicleOpen] = useState<boolean>(false);
  const [chronicleByDate, setChronicleByDate] = useState<
    Record<string, GameDayChroniclePayload>
  >({});
  const [loadingChronicle, setLoadingChronicle] = useState<boolean>(false);
  const [chronicleError, setChronicleError] = useState<string | null>(null);
  const [copiedChronicle, setCopiedChronicle] = useState<boolean>(false);
  const [selectedReportEventId, setSelectedReportEventId] = useState<string | null>(
    null
  );

  const fetchGameDay = useCallback(
    async (targetDate?: string, forceRefresh = false) => {
      if (!data) {
        setLoading(true);
      } else {
        setSwitchingDate(true);
      }
      setErrorMsg(null);

      try {
        const params = new URLSearchParams();
        if (targetDate) params.set('date', targetDate);
        if (forceRefresh) params.set('refresh', '1');
        const qs = params.toString();
        const res = await fetch(`/api/nba/gameday${qs ? `?${qs}` : ''}`);
        if (!res.ok) {
          throw new Error(
            'No se pudo obtener la radiografía de la jornada seleccionada.'
          );
        }
        const payload = (await res.json()) as GameDayPayload;
        setData(payload);
        setSelectedDate(payload.selectedDate);
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Error de conexión al consultar la jornada NBA.'
        );
      } finally {
        setLoading(false);
        setSwitchingDate(false);
      }
    },
    [data]
  );

  const fetchDailyChronicle = useCallback(
    async (targetDate: string, forceRefresh = false) => {
      if (!targetDate) return;
      if (!forceRefresh && chronicleByDate[targetDate]) {
        return;
      }
      setLoadingChronicle(true);
      setChronicleError(null);
      try {
        const params = new URLSearchParams({ date: targetDate });
        if (forceRefresh) params.set('refresh', '1');
        const res = await fetch(`/api/nba/gameday/chronicle?${params.toString()}`);
        if (!res.ok) {
          throw new Error(
            'No se pudo redactar la crónica global de esta jornada.'
          );
        }
        const payload = (await res.json()) as GameDayChroniclePayload;
        setChronicleByDate((prev) => ({
          ...prev,
          [payload.date]: payload,
        }));
      } catch (err) {
        setChronicleError(
          err instanceof Error
            ? err.message
            : 'Error al consultar la crónica de la jornada.'
        );
      } finally {
        setLoadingChronicle(false);
      }
    },
    [chronicleByDate]
  );

  const handleToggleChronicle = useCallback(() => {
    const activeDate = data?.selectedDate || selectedDate;
    if (!chronicleOpen) {
      setChronicleOpen(true);
      if (activeDate) {
        void fetchDailyChronicle(activeDate, false);
      }
    } else {
      setChronicleOpen(false);
    }
  }, [chronicleOpen, data?.selectedDate, selectedDate, fetchDailyChronicle]);

  const handleCopyChronicle = useCallback(async () => {
    const activeDate = data?.selectedDate || selectedDate;
    const ch = activeDate ? chronicleByDate[activeDate] : undefined;
    if (!ch) return;

    const dynamicMd = ch.dynamicSections
      .map((sec) => `## ${sec.title}\n${sec.body}`)
      .join('\n\n');
    const clavesMd = ch.clavesList
      .map((item, idx) => `${idx + 1}. **${item.title}**: ${item.detail}`)
      .join('\n');

    const text = [
      `# ${ch.headline}`,
      `_${ch.lead}_`,
      '',
      dynamicMd,
      '',
      '## Pizarras',
      ch.pizarrasSection,
      '',
      '## Hitos',
      ch.hitosSection,
      '',
      '## Españoles',
      ch.espanolesSection,
      '',
      '## Claves',
      clavesMd,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedChronicle(true);
    setTimeout(() => setCopiedChronicle(false), 2200);
  }, [chronicleByDate, data?.selectedDate, selectedDate]);

  useEffect(() => {
    void fetchGameDay(undefined, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (externalRefreshCounter > 0) {
      void fetchGameDay(selectedDate || undefined, true);
      if (chronicleOpen && selectedDate) {
        void fetchDailyChronicle(selectedDate, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRefreshCounter]);

  const handleSelectDate = useCallback(
    (nextDate: string) => {
      if (!nextDate || nextDate === selectedDate) return;
      setSelectedDate(nextDate);
      setExpandedEventIds(new Set());
      setChronicleOpen(false);
      setChronicleError(null);
      void fetchGameDay(nextDate, false);
    },
    [selectedDate, fetchGameDay]
  );

  const toggleExpandMatchup = useCallback((eventId: string) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const availableDates = data?.availableDates || [];
  const currentIndex = useMemo(() => {
    if (!data) return -1;
    return availableDates.findIndex((d) => d.date === data.selectedDate);
  }, [availableDates, data]);

  // Descending order: index + 1 is older (anterior), index - 1 is newer (siguiente)
  const prevOlderDate =
    currentIndex >= 0 && currentIndex + 1 < availableDates.length
      ? availableDates[currentIndex + 1]
      : null;
  const nextNewerDate =
    currentIndex > 0 ? availableDates[currentIndex - 1] : null;
  const latestDateOption = availableDates[0] || null;

  // 7-date quick strip centered around selectedDate so user always sees adjacent days
  const quickStripDates = useMemo(() => {
    if (availableDates.length <= 7) return [...availableDates].reverse();
    const idx = Math.max(0, currentIndex);
    const start = Math.max(0, Math.min(idx - 3, availableDates.length - 7));
    return availableDates.slice(start, start + 7).reverse();
  }, [availableDates, currentIndex]);

  const datesBySeason = useMemo(() => {
    const s2027 = availableDates.filter((d) => d.seasonLabel === '2026-27');
    const s2026 = availableDates.filter((d) => d.seasonLabel !== '2026-27');
    return { s2027, s2026 };
  }, [availableDates]);

  const filteredMatchups = useMemo(() => {
    if (!data) return [];
    return data.matchups.filter((m) => {
      if (matchupFilter === 'close') return m.margin <= 5;
      if (matchupFilter === 'watchlist') {
        const teamWatched =
          watchlistIds.has(`team:${m.away.teamId}`) ||
          watchlistIds.has(`team:${m.home.teamId}`);
        if (teamWatched) return true;
        const playerWatched =
          m.away.rotationPlayers.some((p) =>
            watchlistIds.has(`player:${p.playerId}`)
          ) ||
          m.home.rotationPlayers.some((p) =>
            watchlistIds.has(`player:${p.playerId}`)
          );
        return playerWatched;
      }
      return true;
    });
  }, [data, matchupFilter, watchlistIds]);

  const filteredStreaks = useMemo(() => {
    if (!data) return [];
    if (streakFilter === 'broken') {
      return data.streakShifts.filter((s) => s.status === 'broken');
    }
    if (streakFilter === 'extended') {
      return data.streakShifts.filter((s) => s.status === 'extended');
    }
    return data.streakShifts;
  }, [data, streakFilter]);

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 space-y-3 animate-pulse">
          <div className="h-5 w-64 bg-[#1E293B] rounded" />
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, idx) => (
              <div key={idx} className="h-11 bg-[#1E293B] rounded-lg" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-4 space-y-2 animate-pulse">
              <div className="h-3 w-28 bg-[#1E293B] rounded" />
              <div className="h-6 w-36 bg-[#1E293B] rounded" />
              <div className="h-3 w-40 bg-[#1E293B] rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-4 animate-pulse space-y-3"
            >
              <div className="h-4 w-48 bg-[#1E293B] rounded" />
              <div className="h-8 w-full bg-[#1E293B] rounded" />
              <div className="h-12 w-full bg-[#1E293B] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="bg-[#131C2E] border border-rose-500/40 rounded-xl sm:rounded-lg p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-rose-300">
            No se pudo cargar el Analizador de Jornadas
          </p>
          <p className="text-xs text-slate-400 mt-1">{errorMsg}</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchGameDay(selectedDate || undefined, false)}
          className="min-h-[40px] px-4 py-2 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap"
        >
          Reintentar carga
        </button>
      </div>
    );
  }

  if (!data) return null;

  const activeDateFormatted = formatCalendarChipDate(data.selectedDate);
  const ptsDiffVsLeague =
    data.pulse.avgTotalPoints - data.pulse.leagueAvgTotalPoints;
  const brokenCount = data.streakShifts.filter((s) => s.status === 'broken').length;
  const extendedCount = data.streakShifts.filter(
    (s) => s.status === 'extended'
  ).length;

  const showGamesBlock =
    mobileSectionTab === 'all' || mobileSectionTab === 'games';
  const showOutliersBlock =
    mobileSectionTab === 'all' || mobileSectionTab === 'outliers';
  const showRotationBlock =
    mobileSectionTab === 'all' || mobileSectionTab === 'rotation';

  const renderPlayerQuickRow = (p: GameDayPlayerLine) => {
    const watched = watchlistIds.has(`player:${p.playerId}`);
    return (
      <div
        key={p.playerId}
        onClick={() => onInspectEntity('player', p.playerId)}
        className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-[#182338] active:bg-[#182338] cursor-pointer transition-colors text-xs"
      >
        <div className="min-w-0 flex items-center gap-2">
          <button
            type="button"
            aria-label="Alternar favorito"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(`player:${p.playerId}`);
            }}
            className="min-w-[32px] min-h-[32px] -ml-1 flex items-center justify-center rounded text-slate-500 hover:text-orange-400 shrink-0"
          >
            <Star
              className={`w-3.5 h-3.5 ${
                watched ? 'fill-orange-400 text-orange-400' : ''
              }`}
            />
          </button>
          <div className="min-w-0">
            <p className="font-medium text-slate-100 truncate">{p.playerName}</p>
            <p className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap">
              {p.minutes.toFixed(0)}m · {p.fgm}/{p.fga} TC
              {p.fg3m > 0 ? ` · ${p.fg3m} T3` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right font-mono tabular-nums whitespace-nowrap">
            <p className="font-semibold text-slate-100">
              {p.points}P · {p.rebounds}R · {p.assists}A
            </p>
            <p className="text-[11px] text-slate-400">
              {experienceMode === 'advanced'
                ? `GmSc ${p.gameScore.toFixed(1)} · ${p.tsPct.toFixed(0)}% TS`
                : `${p.plusMinus >= 0 ? '+' : ''}${p.plusMinus} en pista${
                    p.stocks >= 2 ? ` · ${p.stocks} ROB+TAP` : ''
                  }`}
            </p>
          </div>
          <button
            type="button"
            title="Comparar en Duelo 1v1"
            aria-label={`Enviar a ${p.playerName} al Duelo 1v1`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenInDuel(p.playerId);
            }}
            className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-md border border-[#1E293B] bg-[#0B1120] text-slate-300 hover:text-orange-400 hover:border-orange-500/40 transition-colors shrink-0"
          >
            <Swords className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderMatchupCard = (m: GameDayMatchupCard) => {
    const isExpanded = expandedEventIds.has(m.eventId);
    const takeaways =
      experienceMode === 'simple'
        ? m.keyTakeawaysSimple
        : m.keyTakeawaysAdvanced;
    const contextColorClass =
      m.contextTone === 'amber'
        ? 'text-amber-300'
        : m.contextTone === 'emerald'
        ? 'text-emerald-400'
        : 'text-slate-400';

    return (
      <article
        key={m.eventId}
        className="bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/40 rounded-xl sm:rounded-lg overflow-hidden flex flex-col justify-between transition-colors"
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedReportEventId(m.eventId)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedReportEventId(m.eventId);
            }
          }}
          className="cursor-pointer focus:outline-none"
        >
          {/* Top Metadata Line (Zero-Pill clean inline typography) */}
          <div className="px-4 py-2.5 border-b border-[#1E293B] bg-[#0F172A]/60 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span className={`font-semibold whitespace-nowrap ${contextColorClass}`}>
                {m.contextTag}
              </span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="font-mono tabular-nums text-slate-400 whitespace-nowrap">
                Dif. {m.margin} pts
              </span>
              {experienceMode === 'advanced' && (
                <>
                  <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono tabular-nums text-slate-400 hidden sm:inline whitespace-nowrap">
                    Pace {m.pace.toFixed(1)}
                  </span>
                </>
              )}
            </div>
            <span className="font-mono tabular-nums text-[11px] text-orange-300/90 whitespace-nowrap shrink-0">
              Total {m.totalPoints} PTS · Ver crónica →
            </span>
          </div>

          {/* Scoreboard Rows (Visitor & Home) */}
          <div className="p-4 space-y-2.5 border-b border-[#1E293B]">
            {[
              { side: m.away, roleLabel: 'Visitante' },
              { side: m.home, roleLabel: 'Local' },
            ].map(({ side, roleLabel }) => {
              const teamWatched = watchlistIds.has(`team:${side.teamId}`);
              return (
                <div
                  key={side.abbr}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Alternar seguimiento ${side.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWatchlist(`team:${side.teamId}`);
                      }}
                      className="min-w-[32px] min-h-[32px] -ml-1.5 flex items-center justify-center rounded text-slate-500 hover:text-orange-400 shrink-0"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          teamWatched ? 'fill-orange-400 text-orange-400' : ''
                        }`}
                      />
                    </button>
                    <div className="text-left min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`font-mono text-xs font-bold whitespace-nowrap ${
                            side.isWinner
                              ? 'text-orange-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {side.abbr}
                        </span>
                        <span
                          className={`text-sm truncate ${
                            side.isWinner
                              ? 'font-semibold text-slate-100'
                              : 'font-normal text-slate-300'
                          }`}
                        >
                          {side.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-x-1.5">
                        <span>{side.recordAfter}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans">{roleLabel}</span>
                        {side.isBackToBack && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-300 font-sans">
                              Sin descanso (B2B)
                            </span>
                          </>
                        )}
                        {experienceMode === 'advanced' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{side.efgPct.toFixed(1)}% eFG</span>
                            <span aria-hidden="true">·</span>
                            <span>{side.fg3m} T3</span>
                            <span aria-hidden="true">·</span>
                            <span>{side.tov} PER</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`font-mono tabular-nums text-xl sm:text-2xl shrink-0 ${
                      side.isWinner
                        ? 'font-bold text-slate-100'
                        : 'font-medium text-slate-400'
                    }`}
                  >
                    {side.score}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Star Matchup Strip */}
          {(m.away.topPlayer || m.home.topPlayer) && (
            <div className="px-4 py-2.5 border-b border-[#1E293B] bg-[#0B1120]/45 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs">
              {[m.away.topPlayer, m.home.topPlayer].map((tp, idx) =>
                tp ? (
                  <button
                    key={tp.playerId}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectEntity('player', tp.playerId);
                    }}
                    className="flex items-center justify-between gap-2 text-left hover:text-orange-300 transition-colors min-w-0"
                  >
                    <span className="truncate font-medium text-slate-200">
                      <span className="font-mono text-slate-400 mr-1.5">
                        {tp.teamAbbr}
                      </span>
                      {tp.playerName}
                    </span>
                    <span className="font-mono tabular-nums text-slate-300 whitespace-nowrap shrink-0">
                      {tp.points}P · {tp.rebounds}R · {tp.assists}A
                    </span>
                  </button>
                ) : (
                  <div key={idx} className="text-slate-500">
                    —
                  </div>
                )
              )}
            </div>
          )}

          {/* 2 Automatic Tactical Game Keys */}
          <div className="px-4 py-3 space-y-1.5">
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-between text-[11px] text-slate-400"
            >
              <span className="font-medium text-slate-300">
                Claves del partido
              </span>
              <MetricInfoTooltip
                helpKey="gamedayMatchKeys"
                align="right"
                iconClassName="w-3 h-3"
              />
            </div>
            <ul className="space-y-1.5 text-xs text-slate-300 leading-relaxed">
              {takeaways.map((sentence, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-mono text-orange-400 shrink-0 mt-0.5">
                    {idx + 1}.
                  </span>
                  <span>{sentence}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Action Bar: Full Scouting Report Modal + Quick Inline Players Drawer */}
        <div className="border-t border-[#1E293B]">
          <div className="grid grid-cols-2 divide-x divide-[#1E293B]">
            <button
              type="button"
              onClick={() => setSelectedReportEventId(m.eventId)}
              className="min-h-[44px] px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-orange-400 hover:bg-[#182338] active:bg-[#182338] transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Informe y crónica</span>
            </button>

            <button
              type="button"
              onClick={() => toggleExpandMatchup(m.eventId)}
              className="min-h-[44px] px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-[#182338] active:bg-[#182338] transition-colors whitespace-nowrap"
            >
              <span>
                {isExpanded
                  ? 'Ocultar quintetos'
                  : `Protagonistas (${
                      m.away.rotationPlayers.length +
                      m.home.rotationPlayers.length
                    })`}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform shrink-0 ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {isExpanded && (
            <div className="border-t border-[#1E293B] bg-[#0B1120]/60 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#1E293B]">
              {[m.away, m.home].map((side) => (
                <div key={side.abbr} className="divide-y divide-[#1E293B]/70">
                  <div className="px-3 py-2 bg-[#0F172A]/80 flex items-center justify-between text-[11px] text-slate-300">
                    <button
                      type="button"
                      onClick={() => onInspectEntity('team', side.teamId)}
                      className="font-semibold hover:text-orange-300 transition-colors"
                    >
                      {side.name} ({side.score})
                    </button>
                    <span className="font-mono tabular-nums text-slate-400">
                      {experienceMode === 'advanced'
                        ? `OffRtg ${side.offRtg.toFixed(1)}`
                        : `${side.ast} AST · ${side.reb} REB`}
                    </span>
                  </div>
                  {side.rotationPlayers.length === 0 ? (
                    <p className="p-3 text-xs text-slate-500">
                      Sin desglose individual registrado en esta fecha.
                    </p>
                  ) : (
                    side.rotationPlayers.slice(0, 6).map(renderPlayerQuickRow)
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* BLOCK 0: Smart Calendar Navigation Bar */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm sm:text-base font-semibold text-slate-100 truncate">
                Jornada del {activeDateFormatted.fullLabel}
              </h2>
              {switchingDate && (
                <RefreshCw className="w-3.5 h-3.5 text-orange-400 animate-spin shrink-0" />
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Temporada {data.seasonLabel} · {data.pulse.gamesCount}{' '}
              {data.pulse.gamesCount === 1
                ? 'partido disputado'
                : 'partidos disputados'}{' '}
              · Resumen integral sin abrir hojas individuales
            </p>
          </div>

          {/* Prev / Calendar Select / Next Controls */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={!prevOlderDate || switchingDate}
              onClick={() => prevOlderDate && handleSelectDate(prevOlderDate.date)}
              className="min-h-[42px] sm:min-h-[36px] px-2.5 sm:px-3 py-1.5 inline-flex items-center gap-1 text-xs font-medium rounded-lg border border-[#1E293B] bg-[#0B1120] text-slate-200 hover:bg-[#182338] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <ChevronLeft className="w-4 h-4 text-orange-400" />
              <span>Anterior</span>
            </button>

            <div className="relative flex-1 sm:flex-initial min-w-[175px]">
              <select
                aria-label="Seleccionar fecha del calendario NBA"
                value={data.selectedDate}
                onChange={(e) => handleSelectDate(e.target.value)}
                className="w-full min-h-[42px] sm:min-h-[36px] px-3 py-1.5 text-xs font-mono tabular-nums bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 focus:outline-none focus:border-orange-500"
              >
                {datesBySeason.s2027.length > 0 && (
                  <optgroup label="Temporada 2026-27 (Actual)">
                    {datesBySeason.s2027.map((d) => {
                      const fmt = formatCalendarChipDate(d.date);
                      return (
                        <option key={d.date} value={d.date}>
                          {fmt.fullLabel} ({d.gamesCount} PJ)
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {datesBySeason.s2026.length > 0 && (
                  <optgroup label="Temporada 2025-26 (Histórico)">
                    {datesBySeason.s2026.map((d) => {
                      const fmt = formatCalendarChipDate(d.date);
                      return (
                        <option key={d.date} value={d.date}>
                          {fmt.fullLabel} ({d.gamesCount} PJ)
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>
            </div>

            <button
              type="button"
              disabled={!nextNewerDate || switchingDate}
              onClick={() => nextNewerDate && handleSelectDate(nextNewerDate.date)}
              className="min-h-[42px] sm:min-h-[36px] px-2.5 sm:px-3 py-1.5 inline-flex items-center gap-1 text-xs font-medium rounded-lg border border-[#1E293B] bg-[#0B1120] text-slate-200 hover:bg-[#182338] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4 text-orange-400" />
            </button>

            {latestDateOption && latestDateOption.date !== data.selectedDate && (
              <button
                type="button"
                onClick={() => handleSelectDate(latestDateOption.date)}
                className="min-h-[42px] sm:min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
              >
                Última jornada
              </button>
            )}
          </div>
        </div>

        {/* Horizontal 7-Day Quick Scroller */}
        {quickStripDates.length > 0 && (
          <div className="pt-2.5 border-t border-[#1E293B] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickStripDates.map((d) => {
              const active = d.date === data.selectedDate;
              const fmt = formatCalendarChipDate(d.date);
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => handleSelectDate(d.date)}
                  className={`min-h-[44px] px-3 py-1.5 rounded-lg border text-left transition-colors whitespace-nowrap shrink-0 flex-1 min-w-[104px] ${
                    active
                      ? 'bg-orange-500 border-orange-500 text-slate-950 font-semibold'
                      : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:bg-[#182338] hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span>{fmt.weekday}</span>
                    <span
                      className={`font-mono tabular-nums ${
                        active ? 'text-slate-950/85' : 'text-slate-400'
                      }`}
                    >
                      {d.gamesCount} PJ
                    </span>
                  </div>
                  <div className="text-xs font-mono tabular-nums mt-0.5">
                    {fmt.dayMonth}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ROW 1: Homogeneous 4-Column KPI Summary Strip (with (i) Info Tooltips) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        {/* KPI 1: Pulso de la Jornada */}
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Pulso de la jornada</span>
            <MetricInfoTooltip helpKey="gamedayPulse" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold font-mono tabular-nums text-slate-100 truncate">
            {data.pulse.gamesCount} PJ · {data.pulse.avgTotalPoints.toFixed(1)}{' '}
            <span className="text-[11px] font-sans font-normal text-slate-400">
              PTS
            </span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-slate-400 truncate">
            {data.pulse.closeGamesCount} apretados (≤5) ·{' '}
            {formatSigned(ptsDiffVsLeague, 1)} vs media NBA
          </p>
        </div>

        {/* KPI 2: MVP de la Noche */}
        <div
          onClick={() =>
            data.mvpOfTheNight &&
            onInspectEntity('player', data.mvpOfTheNight.playerId)
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            data.mvpOfTheNight
              ? 'hover:bg-[#182338] active:bg-[#182338] cursor-pointer'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">MVP de la noche</span>
            <MetricInfoTooltip helpKey="gamedayMvp" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {data.mvpOfTheNight ? data.mvpOfTheNight.playerName : '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
            {data.mvpOfTheNight
              ? `${data.mvpOfTheNight.points}P · ${data.mvpOfTheNight.rebounds}R · ${
                  data.mvpOfTheNight.assists
                }A · GmSc ${data.mvpOfTheNight.gameScore.toFixed(1)}`
              : 'Sin registros'}
          </p>
        </div>

        {/* KPI 3: Mayor Explosión Individual */}
        <div
          onClick={() =>
            data.topExplosion &&
            onInspectEntity('player', data.topExplosion.playerId)
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            data.topExplosion
              ? 'hover:bg-[#182338] active:bg-[#182338] cursor-pointer'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Mayor explosión vs media</span>
            <MetricInfoTooltip helpKey="gamedaySingleZ" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {data.topExplosion ? data.topExplosion.playerName : '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
            {data.topExplosion
              ? `▲ ${data.topExplosion.points} PTS (${formatSigned(
                  data.topExplosion.ptsDelta,
                  1
                )} vs ${data.topExplosion.ptsAvg.toFixed(1)})`
              : 'Sin explosiones atípicas'}
          </p>
        </div>

        {/* KPI 4: Golpe en la Mesa Colectivo */}
        <div
          onClick={() =>
            data.statementTeamWin &&
            onInspectEntity('team', data.statementTeamWin.teamId)
          }
          className={`p-3.5 sm:p-4 transition-colors ${
            data.statementTeamWin
              ? 'hover:bg-[#182338] active:bg-[#182338] cursor-pointer'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400">
            <span className="truncate">Golpe en la mesa</span>
            <MetricInfoTooltip helpKey="gamedayTeamStatement" />
          </div>
          <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100 truncate">
            {data.statementTeamWin ? data.statementTeamWin.teamName : '—'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-mono tabular-nums text-slate-300 truncate">
            {data.statementTeamWin
              ? experienceMode === 'advanced'
                ? data.statementTeamWin.summaryAdvanced
                : `${
                    data.statementTeamWin.isHome ? 'vs' : '@'
                  } ${data.statementTeamWin.opponentAbbr} (${
                    data.statementTeamWin.scoreDisplay
                  } · +${data.statementTeamWin.margin})`
              : '—'}
          </p>
        </div>
      </div>

      {/* COLLAPSIBLE GLOBAL DAILY CHRONICLE (Folded by default every morning) */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                Crónica Global y Scouting de la Jornada
              </h2>
              <MetricInfoTooltip
                helpKey="gamedayGlobalChronicle"
                align="left"
              />
            </div>
            <p className="mt-0.5 text-xs text-slate-400 truncate">
              {chronicleByDate[data.selectedDate]
                ? chronicleByDate[data.selectedDate].headline
                : `Lectura periodística y táctica integral de los ${data.pulse.gamesCount} partidos del ${activeDateFormatted.dayMonth} (tendencias, figuras, hitos y actualidad NBA)`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            {chronicleOpen && chronicleByDate[data.selectedDate] && (
              <>
                <button
                  type="button"
                  onClick={() => void handleCopyChronicle()}
                  className="min-h-[42px] sm:min-h-[36px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border border-[#1E293B] bg-[#0B1120] text-slate-200 hover:border-orange-500/40 hover:text-orange-300 transition-colors whitespace-nowrap"
                >
                  {copiedChronicle ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiada</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-orange-400" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  title="Actualizar crónica con búsqueda de actualidad NBA"
                  disabled={loadingChronicle}
                  onClick={() => void fetchDailyChronicle(data.selectedDate, true)}
                  className="min-h-[42px] min-w-[42px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center rounded-lg border border-[#1E293B] bg-[#0B1120] text-slate-300 hover:text-orange-400 disabled:opacity-40 transition-colors"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      loadingChronicle ? 'animate-spin text-orange-400' : ''
                    }`}
                  />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleToggleChronicle}
              className={`min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap flex-1 sm:flex-initial ${
                chronicleOpen
                  ? 'border border-[#1E293B] bg-[#0B1120] text-slate-200 hover:bg-[#182338]'
                  : 'bg-orange-500 hover:bg-orange-400 text-slate-950'
              }`}
            >
              <span>
                {chronicleOpen
                  ? 'Plegar crónica'
                  : 'Leer crónica de la jornada'}
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  chronicleOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {chronicleOpen && (
          <div className="border-t border-[#1E293B] bg-[#0B1120]/50 p-4 sm:p-6">
            {loadingChronicle && !chronicleByDate[data.selectedDate] ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs text-orange-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Analizando los {data.pulse.gamesCount} encuentros y contrastando actualidad NBA...
                  </span>
                </div>
                <div className="space-y-2.5 animate-pulse max-w-3xl">
                  <div className="h-6 w-4/5 bg-[#1E293B] rounded" />
                  <div className="h-4 w-full bg-[#1E293B] rounded" />
                  <div className="h-4 w-11/12 bg-[#1E293B] rounded" />
                </div>
                <div className="pt-2 space-y-2.5 animate-pulse max-w-3xl">
                  <div className="h-4 w-full bg-[#1E293B] rounded" />
                  <div className="h-4 w-5/6 bg-[#1E293B] rounded" />
                  <div className="h-4 w-3/4 bg-[#1E293B] rounded" />
                </div>
              </div>
            ) : chronicleError && !chronicleByDate[data.selectedDate] ? (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-rose-300">{chronicleError}</span>
                <button
                  type="button"
                  onClick={() => void fetchDailyChronicle(data.selectedDate, true)}
                  className="px-3.5 py-1.5 font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors"
                >
                  Reintentar redacción
                </button>
              </div>
            ) : chronicleByDate[data.selectedDate] ? (
              (() => {
                const ch = chronicleByDate[data.selectedDate];
                const topChalkboardMatchups = [...data.matchups]
                  .map((m) => {
                    const winner = m.away.isWinner ? m.away : m.home;
                    const loser = m.away.isWinner ? m.home : m.away;
                    return { m, winner, loser };
                  })
                  .sort(
                    (a, b) =>
                      b.winner.efgPct - a.winner.efgPct || b.m.margin - a.m.margin
                  )
                  .slice(0, 3);

                const jumpAnchors = [
                  ...ch.dynamicSections.map((sec, i) => ({
                    id: `chron-dyn-${i}`,
                    label: sec.title,
                  })),
                  { id: 'chron-sec-pizarras', label: 'Pizarras' },
                  { id: 'chron-sec-hitos', label: 'Hitos' },
                  { id: 'chron-sec-espanoles', label: 'Españoles' },
                  { id: 'chron-sec-claves', label: 'Claves' },
                ];

                return (
                  <article className="space-y-7">
                    {/* EDITORIAL FRONT-PAGE MASTHEAD */}
                    <header className="space-y-3 border-b border-[#1E293B] pb-5">
                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-orange-400">
                          RadarNBA · Revista Matinal de Scouting
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {activeDateFormatted.fullLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {ch.gamesCount} partidos analizados
                        </span>
                      </div>

                      <h3 className="font-display text-xl sm:text-2xl lg:text-[28px] font-bold text-slate-100 leading-tight text-balance max-w-4xl">
                        {ch.headline}
                      </h3>

                      <p className="text-sm sm:text-base text-slate-200 font-medium leading-relaxed max-w-4xl">
                        {renderHighlightedInline(ch.lead)}
                      </p>

                      {/* Quick Section Jump Index */}
                      <nav
                        aria-label="Índice de la crónica de la jornada"
                        className="pt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400"
                      >
                        <span className="text-slate-500">Apartados:</span>
                        {jumpAnchors.map((anc, aIdx) => (
                          <span
                            key={anc.id}
                            className="inline-flex items-center gap-2.5"
                          >
                            {aIdx > 0 && (
                              <span className="text-slate-600" aria-hidden="true">
                                ·
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                document
                                  .getElementById(anc.id)
                                  ?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'start',
                                  })
                              }
                              className="hover:text-orange-300 transition-colors text-left truncate max-w-[220px]"
                            >
                              {anc.label}
                            </button>
                          </span>
                        ))}
                      </nav>
                    </header>

                    {/* DYNAMIC CHAPTERS (1-2 AI-Curated Chapters for Tonight's Slate) */}
                    {ch.dynamicSections.map((sec, idx) => (
                      <section
                        key={idx}
                        id={`chron-dyn-${idx}`}
                        className={
                          idx === 0
                            ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'
                            : 'pt-6 border-t border-[#1E293B] space-y-2.5'
                        }
                      >
                        <div
                          className={
                            idx === 0
                              ? 'lg:col-span-8 space-y-2.5'
                              : 'space-y-2.5'
                          }
                        >
                          <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                            0{idx + 1} · {sec.kicker || 'Tema de Apertura'}
                          </p>
                          <h4 className="font-display text-base sm:text-lg font-bold text-slate-100 text-balance">
                            {sec.title}
                          </h4>
                          {renderEditorialParagraphs(sec.body, {
                            dropCap: idx === 0,
                          })}
                        </div>

                        {/* Embedded Proof Card on Chapter 1: Quinteto Ideal de la Noche */}
                        {idx === 0 && data.idealFive.length > 0 && (
                          <aside className="lg:col-span-4 bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
                              <span className="text-xs font-semibold text-slate-200">
                                Quinteto Ideal del Día
                              </span>
                              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                                Top 5 GmSc
                              </span>
                            </div>

                            <div className="divide-y divide-[#1E293B]/80">
                              {data.idealFive.slice(0, 5).map((p, pIdx) => (
                                <button
                                  key={p.playerId}
                                  type="button"
                                  onClick={() =>
                                    onInspectEntity('player', p.playerId)
                                  }
                                  className="w-full py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-left hover:text-orange-300 transition-colors"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-100 truncate">
                                      <span className="font-mono text-orange-400 mr-1.5">
                                        {pIdx + 1}.
                                      </span>
                                      {p.playerName}{' '}
                                      <span className="font-mono font-normal text-slate-400">
                                        ({p.teamAbbr})
                                      </span>
                                    </p>
                                    <p className="font-mono tabular-nums text-[11px] text-slate-400">
                                      {p.points}P · {p.rebounds}R · {p.assists}A
                                    </p>
                                  </div>
                                  <span className="font-mono tabular-nums text-xs font-semibold text-orange-300 shrink-0">
                                    {p.gameScore.toFixed(1)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </aside>
                        )}
                      </section>
                    ))}

                    {/* FIXED SECTION: PIZARRAS (70% Prose / 30% Top Team Chalkboards) */}
                    <section
                      id="chron-sec-pizarras"
                      className="pt-6 border-t border-[#1E293B] grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                    >
                      <div className="lg:col-span-8 space-y-2.5">
                        <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                          0{ch.dynamicSections.length + 1} · Lectura Táctica Colectiva
                        </p>
                        <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                          Pizarras
                        </h4>
                        {renderEditorialParagraphs(ch.pizarrasSection)}
                      </div>

                      <aside className="lg:col-span-4 bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
                          <span className="text-xs font-semibold text-slate-200">
                            Pizarras Dominantes
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-slate-400">
                            Pace {data.pulse.avgPace.toFixed(1)}
                          </span>
                        </div>

                        <div className="divide-y divide-[#1E293B]/80">
                          {topChalkboardMatchups.map(({ m, winner, loser }) => (
                            <button
                              key={m.eventId}
                              type="button"
                              onClick={() => setSelectedReportEventId(m.eventId)}
                              className="w-full py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-left hover:text-orange-300 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-100 truncate">
                                  <span className="font-mono text-orange-400 mr-1">
                                    {winner.abbr}
                                  </span>
                                  {winner.score}-{loser.score} vs {loser.abbr}
                                </p>
                                <p className="font-mono tabular-nums text-[11px] text-slate-400">
                                  OffRtg {winner.offRtg.toFixed(1)} ·{' '}
                                  {winner.efgPct.toFixed(1)}% eFG · {winner.fg3m} T3
                                </p>
                              </div>
                              <span className="text-[11px] text-orange-400 font-medium shrink-0">
                                Informe →
                              </span>
                            </button>
                          ))}
                        </div>
                      </aside>
                    </section>

                    {/* FIXED SECTION: HITOS (70% Prose / 30% Explosions & Streaks Card) */}
                    <section
                      id="chron-sec-hitos"
                      className="pt-6 border-t border-[#1E293B] grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                    >
                      <div className="lg:col-span-8 space-y-2.5">
                        <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                          0{ch.dynamicSections.length + 2} · Récords, Explosiones y Rachas
                        </p>
                        <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                          Hitos
                        </h4>
                        {renderEditorialParagraphs(ch.hitosSection)}
                      </div>

                      <aside className="lg:col-span-4 bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
                          <span className="text-xs font-semibold text-slate-200">
                            Radar de Picos y Rachas
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-slate-400">
                            {extendedCount} seg. · {brokenCount} rot.
                          </span>
                        </div>

                        <div className="divide-y divide-[#1E293B]/80 text-xs">
                          {data.explosions.slice(0, 2).map((exp) => (
                            <button
                              key={`exp-${exp.playerId}`}
                              type="button"
                              onClick={() =>
                                onInspectEntity('player', exp.playerId)
                              }
                              className="w-full py-2 first:pt-0 flex items-center justify-between gap-2 text-left hover:text-orange-300 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-100 truncate">
                                  {exp.playerName}{' '}
                                  <span className="font-mono font-normal text-slate-400">
                                    ({exp.teamAbbr})
                                  </span>
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">
                                  Explosión · Media {exp.ptsAvg.toFixed(1)} PTS
                                </p>
                              </div>
                              <span className="font-mono tabular-nums font-semibold text-emerald-400 shrink-0">
                                {exp.points} PTS (+{exp.ptsDelta.toFixed(1)})
                              </span>
                            </button>
                          ))}

                          {data.streakShifts.slice(0, 2).map((st, idx) => (
                            <button
                              key={`st-${st.playerId}-${idx}`}
                              type="button"
                              onClick={() =>
                                onInspectEntity('player', st.playerId)
                              }
                              className="w-full py-2 last:pb-0 flex items-center justify-between gap-2 text-left hover:text-orange-300 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-100 truncate">
                                  {st.playerName}{' '}
                                  <span className="font-mono font-normal text-slate-400">
                                    ({st.teamAbbr})
                                  </span>
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">
                                  {st.thresholdLabel}
                                </p>
                              </div>
                              <span
                                className={`font-mono tabular-nums text-[11px] font-semibold shrink-0 ${
                                  st.status === 'broken'
                                    ? 'text-rose-400'
                                    : 'text-amber-300'
                                }`}
                              >
                                {st.status === 'broken'
                                  ? `Fin (${st.streakCount} PJ)`
                                  : `${st.streakCount} PJ`}
                              </span>
                            </button>
                          ))}
                        </div>
                      </aside>
                    </section>

                    {/* FIXED SECTION: ESPAÑOLES (70% Prose / 30% Radar Español Card) */}
                    <section
                      id="chron-sec-espanoles"
                      className="pt-6 border-t border-[#1E293B] grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                    >
                      <div className="lg:col-span-8 space-y-2.5">
                        <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                          0{ch.dynamicSections.length + 3} · Seguimiento Especial
                        </p>
                        <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                          Españoles
                        </h4>
                        {renderEditorialParagraphs(ch.espanolesSection)}
                      </div>

                      <aside className="lg:col-span-4 bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
                          <span className="text-xs font-semibold text-slate-200">
                            Acta de Españoles
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-slate-400">
                            {data.selectedDate}
                          </span>
                        </div>
                        {(() => {
                          const rawText =
                            ch.spanishPlayersSummary ||
                            'Sin minutos registrados en los encuentros de esta fecha.';
                          const items = rawText
                            .split(/\s*·\s*|\n+/)
                            .map((p) => p.trim())
                            .filter(Boolean);
                          return (
                            <div className="space-y-2 pt-1">
                              {items.map((itemText, idx) => (
                                <div
                                  key={idx}
                                  className="p-2.5 rounded-lg border border-[#1E293B] bg-[#0B1120] text-xs font-mono tabular-nums text-slate-200 leading-relaxed"
                                >
                                  {renderHighlightedInline(itemText)}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </aside>
                    </section>

                    {/* FIXED SECTION: CLAVES (Numbered Visual Takeaway Grid) */}
                    {ch.clavesList.length > 0 && (
                      <section
                        id="chron-sec-claves"
                        className="pt-6 border-t border-[#1E293B] space-y-3.5"
                      >
                        <div>
                          <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                            0{ch.dynamicSections.length + 4} · Síntesis Ejecutiva
                          </p>
                          <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                            Claves
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {ch.clavesList.map((item, cIdx) => (
                            <div
                              key={cIdx}
                              className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-1.5"
                            >
                              <div className="flex items-baseline gap-2">
                                <span className="font-mono tabular-nums text-xs font-bold text-orange-400">
                                  0{cIdx + 1}.
                                </span>
                                <h5 className="text-sm font-semibold text-slate-100">
                                  {item.title}
                                </h5>
                              </div>
                              <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed">
                                {renderHighlightedInline(item.detail)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Grounding News Sources */}
                    {ch.sources.length > 0 && (
                      <footer className="pt-4 border-t border-[#1E293B] space-y-1.5">
                        <p className="text-[11px] text-slate-400">
                          Fuentes oficiales y referencias de actualidad NBA consultadas:
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                          {ch.sources.map((src, idx) => (
                            <a
                              key={idx}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 hover:underline"
                            >
                              <span className="truncate max-w-[240px]">
                                {src.title}
                              </span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </footer>
                    )}
                  </article>
                );
              })()
            ) : null}
          </div>
        )}
      </section>

      {/* Mobile Ergonomic Sub-Tab Bar (avoids endless scrolling on smartphone) */}
      <div className="lg:hidden grid grid-cols-4 gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-xl">
        {(
          [
            { id: 'all', label: 'Todo' },
            { id: 'games', label: `Partidos (${data.matchups.length})` },
            { id: 'outliers', label: 'Explosiones' },
            { id: 'rotation', label: 'Rol y Rachas' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileSectionTab(tab.id)}
            className={`min-h-[38px] px-2 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap truncate ${
              mobileSectionTab === tab.id
                ? 'bg-orange-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECTION 01: Quinteto Ideal de la Jornada (Top 5 GmSc) */}
      {mobileSectionTab === 'all' && data.idealFive.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Trophy className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                01. Quinteto Ideal de la Noche (Los 5 Reyes de la Jornada)
              </h2>
              <MetricInfoTooltip helpKey="gamedayIdealFive" align="left" />
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline whitespace-nowrap">
              Ordenados por valoración integral Game Score
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-[#1E293B]">
            {data.idealFive.map((p, idx) => {
              const watched = watchlistIds.has(`player:${p.playerId}`);
              return (
                <div
                  key={p.playerId}
                  onClick={() => onInspectEntity('player', p.playerId)}
                  className="p-3.5 sm:p-4 hover:bg-[#182338] active:bg-[#182338] cursor-pointer transition-colors flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-orange-400 font-semibold">
                          #{idx + 1}{' '}
                          {idx === 0 ? '· MVP de la Noche' : '· Quinteto Ideal'}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-100 truncate">
                          {p.playerName}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {p.teamAbbr} · {p.position} ·{' '}
                          {p.isHome ? 'vs' : '@'} {p.opponentAbbr} ({p.result})
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Alternar seguimiento ${p.playerName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWatchlist(`player:${p.playerId}`);
                        }}
                        className="min-w-[38px] min-h-[38px] -m-1.5 flex items-center justify-center rounded-lg text-slate-400 hover:text-orange-400 shrink-0"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            watched ? 'fill-orange-400 text-orange-400' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-[#1E293B] font-mono tabular-nums">
                      <p className="text-base font-bold text-slate-100 whitespace-nowrap">
                        {p.points}P · {p.rebounds}R · {p.assists}A
                      </p>
                      <p className="mt-1 text-[11px] text-slate-300 whitespace-nowrap">
                        GmSc {p.gameScore.toFixed(1)} · {p.tsPct.toFixed(0)}% TS ·{' '}
                        {p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}
                      </p>
                      <p className="mt-0.5 text-[11px] text-emerald-400 whitespace-nowrap">
                        {p.ptsDelta >= 0
                          ? `▲ +${p.ptsDelta.toFixed(1)} vs su media (${p.ptsBaselineAvg.toFixed(
                              1
                            )})`
                          : `Media habitual: ${p.ptsBaselineAvg.toFixed(1)} PTS`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                    <span className="text-slate-400">Ver ficha →</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenInDuel(p.playerId);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#1E293B] bg-[#0B1120] text-slate-300 hover:text-orange-400 hover:border-orange-500/40 transition-colors whitespace-nowrap"
                    >
                      <Swords className="w-3 h-3" />
                      <span>Duelo 1v1</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 02: Marcadores Rápidos con Radiografía de Claves por Partido */}
      {showGamesBlock && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100">
                02. Radiografía de los {data.matchups.length} Partidos y Claves del Resultado
              </h2>
              <MetricInfoTooltip helpKey="gamedayMatchKeys" align="left" />
            </div>

            {/* Interactive Matchup Filter Buttons */}
            <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: `Todos (${data.matchups.length})` },
                  {
                    id: 'close',
                    label: `Apretados (${data.pulse.closeGamesCount})`,
                  },
                  { id: 'watchlist', label: 'Mis favoritos' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMatchupFilter(f.id)}
                  className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    matchupFilter === f.id
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredMatchups.length === 0 ? (
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg py-10 px-6 text-center">
              <p className="text-sm font-medium text-slate-200">
                No hay partidos en esta fecha que coincidan con el filtro seleccionado.
              </p>
              <button
                type="button"
                onClick={() => setMatchupFilter('all')}
                className="mt-3 px-3.5 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors"
              >
                Mostrar todos los partidos ({data.matchups.length})
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              {filteredMatchups.map(renderMatchupCard)}
            </div>
          )}
        </section>
      )}

      {/* SECTION 03: Explosiones (▲) y Batacazos (▼) frente a su Media Habitual */}
      {showOutliersBlock && (
        <section className="space-y-3">
          {/* Mobile Switcher between Explosions & Slumps */}
          <div className="xl:hidden flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              03. Explosiones y Batacazos vs Media
            </h2>
            <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg">
              <button
                type="button"
                onClick={() => setMobileOutlierTab('explosions')}
                className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  mobileOutlierTab === 'explosions'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300'
                }`}
              >
                Explosiones ({data.explosions.length})
              </button>
              <button
                type="button"
                onClick={() => setMobileOutlierTab('slumps')}
                className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  mobileOutlierTab === 'slumps'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-300'
                }`}
              >
                Batacazos ({data.slumps.length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
            {/* 03A: Explosions */}
            <div
              className={`space-y-3 flex flex-col ${
                mobileOutlierTab !== 'explosions' ? 'hidden xl:flex' : 'flex'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                  <h3 className="text-sm font-semibold text-slate-100 truncate">
                    03A. Noches de Explosión frente a su Media (▲)
                  </h3>
                  <MetricInfoTooltip helpKey="gamedayExplosions" align="left" />
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                  {data.explosions.length} casos
                </span>
              </div>

              <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden flex-1 divide-y divide-[#1E293B]">
                {data.explosions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Ningún jugador superó el umbral de explosión atípica en esta jornada.
                  </div>
                ) : (
                  data.explosions.map((item) => {
                    const watched = watchlistIds.has(`player:${item.playerId}`);
                    return (
                      <div
                        key={item.playerId}
                        onClick={() => onInspectEntity('player', item.playerId)}
                        className="p-3.5 sm:px-4 sm:py-3.5 hover:bg-[#182338] active:bg-[#182338] cursor-pointer transition-colors space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-slate-100 truncate">
                                {item.playerName}
                              </span>
                              <button
                                type="button"
                                aria-label="Alternar favorito"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleWatchlist(`player:${item.playerId}`);
                                }}
                                className="p-1 -m-1 text-slate-500 hover:text-orange-400 shrink-0"
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    watched
                                      ? 'fill-orange-400 text-orange-400'
                                      : ''
                                  }`}
                                />
                              </button>
                            </div>
                            <div className="text-xs text-slate-400">
                              {item.teamAbbr} · {item.position} ·{' '}
                              {item.isHome ? 'vs' : '@'} {item.opponentAbbr} (
                              {item.result}) ·{' '}
                              <span className="text-emerald-400 font-medium">
                                {item.driverTag}
                              </span>
                            </div>
                          </div>

                          <div className="text-right font-mono tabular-nums shrink-0">
                            <div className="text-sm font-bold text-slate-100 whitespace-nowrap">
                              {item.points}P · {item.rebounds}R · {item.assists}A
                            </div>
                            <div className="text-xs font-semibold text-emerald-400 whitespace-nowrap">
                              ▲ {formatSigned(item.ptsDelta, 1)} PTS (media{' '}
                              {item.ptsAvg.toFixed(1)})
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">
                          {experienceMode === 'simple'
                            ? item.driverDetailSimple
                            : item.driverDetailAdvanced}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 03B: Slumps / Batacazos */}
            <div
              className={`space-y-3 flex flex-col ${
                mobileOutlierTab !== 'slumps' ? 'hidden xl:flex' : 'flex'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
                  <h3 className="text-sm font-semibold text-slate-100 truncate">
                    03B. Batacazos de Titulares frente a su Media (▼)
                  </h3>
                  <MetricInfoTooltip helpKey="gamedaySlumps" align="left" />
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                  {data.slumps.length} casos
                </span>
              </div>

              <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden flex-1 divide-y divide-[#1E293B]">
                {data.slumps.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Los titulares principales cumplieron con su suelo estadístico en esta fecha.
                  </div>
                ) : (
                  data.slumps.map((item) => {
                    const watched = watchlistIds.has(`player:${item.playerId}`);
                    return (
                      <div
                        key={item.playerId}
                        onClick={() => onInspectEntity('player', item.playerId)}
                        className="p-3.5 sm:px-4 sm:py-3.5 hover:bg-[#182338] active:bg-[#182338] cursor-pointer transition-colors space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-slate-100 truncate">
                                {item.playerName}
                              </span>
                              <button
                                type="button"
                                aria-label="Alternar favorito"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleWatchlist(`player:${item.playerId}`);
                                }}
                                className="p-1 -m-1 text-slate-500 hover:text-orange-400 shrink-0"
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    watched
                                      ? 'fill-orange-400 text-orange-400'
                                      : ''
                                  }`}
                                />
                              </button>
                            </div>
                            <div className="text-xs text-slate-400">
                              {item.teamAbbr} · {item.position} ·{' '}
                              {item.isHome ? 'vs' : '@'} {item.opponentAbbr} (
                              {item.result}) ·{' '}
                              <span className="text-rose-400 font-medium">
                                {item.driverTag}
                              </span>
                            </div>
                          </div>

                          <div className="text-right font-mono tabular-nums shrink-0">
                            <div className="text-sm font-bold text-slate-100 whitespace-nowrap">
                              {item.points}P · {item.rebounds}R · {item.assists}A
                            </div>
                            <div className="text-xs font-semibold text-rose-400 whitespace-nowrap">
                              ▼ {formatSigned(item.ptsDelta, 1)} PTS (media{' '}
                              {item.ptsAvg.toFixed(1)})
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">
                          {experienceMode === 'simple'
                            ? item.driverDetailSimple
                            : item.driverDetailAdvanced}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 04: Radar de Rotación (Picos de Minutos / Rol) & Termómetro de Rachas */}
      {showRotationBlock && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
          {/* 04A: Cambios de Rol y Minutos Inusuales */}
          <section className="space-y-3 flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp className="w-4 h-4 text-orange-400 shrink-0" />
                <h2 className="text-sm font-semibold text-slate-100 truncate">
                  04A. Picos de Minutos y Nuevos Roles en Pista
                </h2>
                <MetricInfoTooltip helpKey="gamedayRoleShift" align="left" />
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                {data.roleShifts.length} alertas
              </span>
            </div>

            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden flex-1">
              {data.roleShifts.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Sin saltos bruscos de minutos (+6.5 MIN) ni uso ofensivo (+6% USG) en esta jornada.
                </div>
              ) : (
                <>
                  {/* Mobile list */}
                  <div className="sm:hidden divide-y divide-[#1E293B]">
                    {data.roleShifts.map((r) => (
                      <div
                        key={r.playerId}
                        onClick={() => onInspectEntity('player', r.playerId)}
                        className="p-3.5 space-y-1.5 active:bg-[#182338] cursor-pointer transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-100 truncate">
                              {r.playerName}
                            </p>
                            <p className="text-xs text-slate-400">
                              {r.teamAbbr} · {r.position} ·{' '}
                              {r.isHome ? 'vs' : '@'} {r.opponentAbbr}
                            </p>
                          </div>
                          <div className="text-right font-mono tabular-nums shrink-0">
                            <p className="text-sm font-bold text-emerald-400">
                              {r.minutes.toFixed(0)} MIN (▲{' '}
                              {formatSigned(r.minutesDelta, 0)})
                            </p>
                            <p className="text-[11px] text-slate-300">
                              {r.points}P · {r.rebounds}R · {r.assists}A
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-slate-300">
                          {experienceMode === 'simple'
                            ? r.headlineSimple
                            : r.headlineAdvanced}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Desktop compact table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                          <th className="py-2.5 pl-4 pr-3 font-medium">Jugador</th>
                          <th className="py-2.5 px-3 font-medium text-right">
                            <ColumnHelpHeader
                              label="Minutos vs Media"
                              helpKey="minBase"
                            />
                          </th>
                          <th className="py-2.5 px-3 font-medium text-right">
                            <ColumnHelpHeader
                              label={
                                experienceMode === 'advanced'
                                  ? 'USG% Noche'
                                  : 'Tiros (TCI)'
                              }
                              helpKey={
                                experienceMode === 'advanced' ? 'usgPct' : 'fga'
                              }
                            />
                          </th>
                          <th className="py-2.5 pl-3 pr-4 font-medium text-right">
                            Línea
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E293B] text-sm">
                        {data.roleShifts.map((r) => (
                          <tr
                            key={r.playerId}
                            onClick={() => onInspectEntity('player', r.playerId)}
                            className="hover:bg-[#182338] cursor-pointer transition-colors"
                          >
                            <td className="py-3 pl-4 pr-3">
                              <div className="font-medium text-slate-100 whitespace-nowrap">
                                {r.playerName}
                              </div>
                              <div className="text-xs text-slate-400 whitespace-nowrap">
                                {r.teamAbbr} · {r.isHome ? 'vs' : '@'}{' '}
                                {r.opponentAbbr} ({r.result})
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              <div className="font-semibold text-emerald-400">
                                {r.minutes.toFixed(0)}m (▲{' '}
                                {formatSigned(r.minutesDelta, 1)})
                              </div>
                              <div className="text-xs text-slate-400">
                                Media {r.minutesAvg.toFixed(1)}m
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              {experienceMode === 'advanced' ? (
                                <>
                                  <div className="font-semibold text-slate-100">
                                    {r.usgEst.toFixed(1)}%
                                  </div>
                                  <div className="text-xs text-orange-300">
                                    {formatSigned(r.usgDelta, 1)}% vs base
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="font-semibold text-slate-100">
                                    {r.fga} tiros
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    Media {r.fgaAvg.toFixed(1)}
                                  </div>
                                </>
                              )}
                            </td>
                            <td className="py-3 pl-3 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                              <div className="font-semibold text-slate-100">
                                {r.points}P · {r.rebounds}R · {r.assists}A
                              </div>
                              <div className="text-xs text-slate-400">
                                GmSc {r.gameScore.toFixed(1)}
                              </div>
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

          {/* 04B: Rachas Prolongadas y Rachas Rotas en la Jornada */}
          <section className="space-y-3 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Flame className="w-4 h-4 text-orange-400 shrink-0" />
                <h2 className="text-sm font-semibold text-slate-100 truncate">
                  04B. Rachas Rotas y Prolongadas en la Noche
                </h2>
                <MetricInfoTooltip helpKey="gamedayStreakShift" align="left" />
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                {(
                  [
                    {
                      id: 'all',
                      label: `Todas (${data.streakShifts.length})`,
                    },
                    { id: 'broken', label: `Rotas (${brokenCount})` },
                    { id: 'extended', label: `Vivas (${extendedCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStreakFilter(tab.id)}
                    className={`min-h-[28px] px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                      streakFilter === tab.id
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden flex-1 divide-y divide-[#1E293B]">
              {filteredStreaks.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Sin rachas de 4+ partidos seguidos alteradas con este filtro en la jornada seleccionada.
                </div>
              ) : (
                filteredStreaks.map((st) => {
                  const isBroken = st.status === 'broken';
                  return (
                    <div
                      key={st.id}
                      onClick={() => onInspectEntity('player', st.playerId)}
                      className="p-3.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3 hover:bg-[#182338] active:bg-[#182338] cursor-pointer transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-sm text-slate-100 truncate">
                            {st.playerName}
                          </span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {st.teamAbbr} · {st.isHome ? 'vs' : '@'}{' '}
                            {st.opponentAbbr}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs flex flex-wrap items-center gap-x-1.5">
                          <span
                            className={`font-semibold ${
                              isBroken ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            {isBroken
                              ? `▼ Racha rota (${st.thresholdLabel})`
                              : `▲ Racha activa (${st.thresholdLabel})`}
                          </span>
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-300 font-mono tabular-nums">
                            {st.nightValueDisplay}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div
                          className={`text-sm font-bold whitespace-nowrap ${
                            isBroken ? 'text-rose-400' : 'text-orange-400'
                          }`}
                        >
                          {isBroken
                            ? `Fin a ${st.streakCount} PJ`
                            : `${st.streakCount} seguidos`}
                        </div>
                        <div className="text-[11px] text-slate-400 whitespace-nowrap">
                          Media racha: {st.avgDuringStreak.toFixed(1)} {st.unit}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}

      {/* FULL PASO B + NBA.COM GAME BOOK SCOUTING REPORT MODAL */}
      <GameScoutingReportModal
        eventId={selectedReportEventId}
        experienceMode={experienceMode}
        onClose={() => setSelectedReportEventId(null)}
        onInspectEntity={onInspectEntity}
        onOpenInDuel={onOpenInDuel}
      />
    </div>
  );
}
