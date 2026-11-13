import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Copy,
  FileSpreadsheet,
  FileText,
  MapPin,
  Newspaper,
  RefreshCw,
  Scale,
  X,
  Zap,
} from 'lucide-react';
import type {
  ExperienceMode,
  GameBoxScorePlayerLine,
  GameInactiveOrDnpItem,
  GameNarrativePayload,
  GameOfficialReportData,
  GameReportTeamSide,
  PlayerSeasonHighEntry,
} from '../types/nba';
import { hexToRgba, resolveTeamMatchupColors } from '../utils/teamLogos';
import {
  STICKY_THEAD_CLASS,
  sortRows,
  useTableSort,
  type SortPrimitive,
} from '../utils/tableSort';
import { MetricInfoTooltip, SortableTh } from './MetricUiHelpers';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';

type TeamStatsSortCol = 'label' | 'away' | 'home' | 'diff' | 'pulse';

function resolveBoxscorePlayerSortValue(
  p: GameBoxScorePlayerLine,
  colKey: string
): SortPrimitive {
  switch (colKey) {
    case 'name':
      return p.name;
    case 'min':
      return p.minutes;
    case 'pts':
      return p.points;
    case 'fgm':
      return p.fgm;
    case 'fga':
      return p.fga;
    case 'fgPct':
      return p.fgPct;
    case 'fg3m':
      return p.fg3m;
    case 'fg3a':
      return p.fg3a;
    case 'fg3Pct':
      return p.fg3Pct;
    case 'ftm':
      return p.ftm;
    case 'fta':
      return p.fta;
    case 'ftPct':
      return p.ftPct;
    case 'oreb':
      return p.oreb;
    case 'dreb':
      return p.dreb;
    case 'reb':
      return p.rebounds;
    case 'ast':
      return p.assists;
    case 'stl':
      return p.steals;
    case 'blk':
      return p.blocks;
    case 'tov':
      return p.turnovers;
    case 'pf':
      return p.fouls;
    case 'plusMinus':
      return p.plusMinus;
    case 'gameScore':
      return p.gameScore;
    case 'tsPct':
      return p.tsPct;
    case 'usgEst':
      return p.usgEst || 0;
    default:
      return p.points;
  }
}

interface GameScoutingReportModalProps {
  eventId: string | null;
  experienceMode: ExperienceMode;
  onClose: () => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
}

type ModalTabId = 'scouting' | 'headToHead' | 'boxscore';

import {
  renderEditorialParagraphs,
  renderHighlightedInline,
} from './editorialTextRenderers';

export { renderEditorialParagraphs, renderHighlightedInline };

function buildCompletePasoBMarkdown(
  report: GameOfficialReportData,
  narrative: GameNarrativePayload | null
): string {
  const lines: string[] = [];
  lines.push(`# ${report.pasoBTitle}`);
  if (narrative?.pressHeadline) {
    lines.push(`**${narrative.pressHeadline}**`);
  }
  if (narrative?.pressLead) {
    lines.push(`_${narrative.pressLead}_`);
  }
  lines.push('');

  if (report.periods.length > 0) {
    const qHeaders = report.periods.map((p) => p.label).join(' | ');
    const awayQs = report.periods.map((p) => p.awayScore).join(' | ');
    const homeQs = report.periods.map((p) => p.homeScore).join(' | ');
    lines.push(`| Equipo | ${qHeaders} | FINAL |`);
    lines.push(
      `| :--- | ${report.periods.map(() => ':---:').join(' | ')} | :---: |`
    );
    lines.push(
      `| **${report.away.abbr}** | ${awayQs} | **${report.away.score}** |`
    );
    lines.push(
      `| **${report.home.abbr}** | ${homeQs} | **${report.home.score}** |`
    );
    lines.push('');
  }

  lines.push('## GUION Y PUNTO DE QUIEBRE');
  lines.push(
    narrative?.gameFlowSection ||
      `Encuentro decidido con marcador ${report.away.score}-${report.home.score} y tramo clave en ${report.decisivePeriodLabel}.`
  );
  lines.push('');

  lines.push('## PIZARRA, AJUSTES Y ROTACIÓN');
  lines.push(
    narrative?.chalkboardSection ||
      `Eficiencia ofensiva: ${report.away.abbr} ${report.away.totals.offRtg.toFixed(1)} vs ${report.home.abbr} ${report.home.totals.offRtg.toFixed(1)}.`
  );
  lines.push('');

  if (narrative?.dynamicSpotlight) {
    lines.push(`## ${narrative.dynamicSpotlight.title.toUpperCase()}`);
    lines.push(narrative.dynamicSpotlight.body);
    lines.push('');
  }

  lines.push('## FACTOR X Y DUELO DE LÍDERES');
  if (narrative?.xFactorSection) {
    lines.push(narrative.xFactorSection);
    lines.push('');
  }

  lines.push('## ESPAÑOLES');
  lines.push(
    narrative?.spanishSection || report.spanishPlayersReport.summaryLine
  );
  lines.push('');

  lines.push('## CARA A CARA: EQUIPOS');
  lines.push(
    `| Métrica | ${report.away.name} (${report.away.abbr}) | ${report.home.name} (${report.home.abbr}) | Ventaja |`
  );
  lines.push('| :--- | :---: | :---: | :---: |');
  for (const r of report.teamComparisonRows) {
    lines.push(
      `| ${r.label} | ${r.awayDisplay} | ${r.homeDisplay} | ${r.diffDisplay} |`
    );
  }
  lines.push('');

  lines.push('## PARTE DE BAJAS E INCIDENCIAS');
  for (const side of [report.away, report.home]) {
    if (side.absencesAndDnp.length === 0) {
      lines.push(`- **${side.name} (${side.abbr})**: Sin bajas ni ausencias registradas.`);
    } else {
      const formattedAbs = side.absencesAndDnp
        .map(
          (a) =>
            `#${a.jersey} ${a.name} [${a.statusLabel || 'Baja'} — ${a.note}]`
        )
        .join('; ');
      lines.push(`- **${side.name} (${side.abbr})**: ${formattedAbs}`);
    }
  }
  lines.push('');

  lines.push('## CARA A CARA: LÍDERES INDIVIDUALES (17 CATEGORÍAS)');
  lines.push(
    `| Categoría | ${report.away.abbr} (Visitante) | ${report.home.abbr} (Local) | Ventaja |`
  );
  lines.push('| :--- | :--- | :--- | :---: |');
  for (const l of report.leaderComparisonRows) {
    lines.push(
      `| ${l.categoryLabel} | ${l.awayFormatted} | ${l.homeFormatted} | ${l.diffDisplay || '—'} |`
    );
  }
  lines.push('');

  lines.push('## 05. HITOS, VEREDICTO Y PODIO');
  if (narrative?.verdictSection) {
    lines.push(narrative.verdictSection);
    lines.push('');
  }

  const formatPodiumLine = (side: GameReportTeamSide) =>
    side.podium
      .map(
        (p) =>
          `${'⭐'.repeat(p.stars)} #${p.jersey} ${p.name} (${p.points}P/${p.rebounds}R/${p.assists}A)`
      )
      .join(' | ');

  lines.push('**Podio del Partido:**');
  lines.push(`- **${report.away.name}**: ${formatPodiumLine(report.away)}`);
  lines.push(`- **${report.home.name}**: ${formatPodiumLine(report.home)}`);
  lines.push('');

  lines.push('## 06. PRÓXIMOS PARTIDOS');
  for (const side of [report.away, report.home]) {
    const ng = side.nextGame;
    const rivalStr = ng.hasScheduledGame
      ? `${ng.isHome ? 'vs' : '@'} ${ng.opponentName} (${ng.opponentAbbr})`
      : ng.opponentName;
    const arenaStr = ng.arenaName
      ? `${ng.arenaName}${ng.arenaCity ? `, ${ng.arenaCity}` : ''}`
      : 'Por confirmar';
    const fatigueStr = ng.fatigueDetail ? ` · Descanso: ${ng.fatigueDetail}` : '';
    lines.push(
      `- **${side.name} (${side.abbr})**: Balance ${ng.record} · ${ng.conferenceRank}º Conf. ${ng.conference} · Racha ${ng.streakCode} | Próximo rival: ${rivalStr} · ${ng.dateFormatted} (${ng.timeFormatted}) · Estadio: ${arenaStr}${fatigueStr}`
    );
  }

  return lines.join('\n');
}

function computeLeaderBarSplit(
  awayVal: number,
  homeVal: number,
  lowerIsBetter?: boolean
): { awayPct: number; homePct: number } {
  if (Math.abs(awayVal - homeVal) < 0.04) {
    return { awayPct: 50, homePct: 50 };
  }
  let effAway = awayVal;
  let effHome = homeVal;

  if (awayVal < 0 || homeVal < 0) {
    const shift = Math.abs(Math.min(awayVal, homeVal)) + 2;
    effAway = awayVal + shift;
    effHome = homeVal + shift;
  }

  if (lowerIsBetter) {
    const invAway = Math.max(0.5, effHome + 0.5);
    const invHome = Math.max(0.5, effAway + 0.5);
    effAway = invAway;
    effHome = invHome;
  }

  const sum = effAway + effHome;
  if (sum <= 0) return { awayPct: 50, homePct: 50 };
  let awayPct = Math.min(88, Math.max(12, Math.round((effAway / sum) * 1000) / 10));
  if (effAway > effHome && awayPct < 52) awayPct = 52;
  if (effHome > effAway && awayPct > 48) awayPct = 48;
  return { awayPct, homePct: Math.round((100 - awayPct) * 10) / 10 };
}

function MatchupPulseBar({
  awayPct,
  homePct,
  awayColor,
  homeColor,
  betterSide,
  size = 'sm',
  className = '',
  title,
}: {
  awayPct: number;
  homePct: number;
  awayColor: string;
  homeColor: string;
  betterSide: 'away' | 'home' | 'tie';
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  title?: string;
}) {
  const heightClass =
    size === 'md' ? 'h-3' : size === 'sm' ? 'h-2.5' : 'h-2';
  const tickClass =
    size === 'md'
      ? 'top-[-3px] bottom-[-3px] w-[2px]'
      : size === 'sm'
      ? 'top-[-2.5px] bottom-[-2.5px] w-[2px]'
      : 'top-[-2px] bottom-[-2px] w-[1.5px]';

  return (
    <div
      title={title}
      className={`relative w-full ${heightClass} ${className}`}
    >
      <div className="w-full h-full rounded-full overflow-hidden flex bg-[#0B1120] ring-1 ring-white/10">
        <div
          className="h-full transition-opacity"
          style={{
            width: `${awayPct}%`,
            backgroundColor: awayColor,
            opacity: betterSide === 'home' ? 0.78 : 1,
          }}
        />
        <div
          className="h-full transition-opacity"
          style={{
            width: `${homePct}%`,
            backgroundColor: homeColor,
            opacity: betterSide === 'away' ? 0.78 : 1,
          }}
        />
      </div>
      {/* Exact 50% equilibrium marker line */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(11,17,32,0.95)] z-10 ${tickClass}`}
      />
    </div>
  );
}

function getAbsenceStatusMeta(item: GameInactiveOrDnpItem): {
  label: string;
  textClass: string;
  cardClass: string;
  isTechnical: boolean;
} {
  const st = item.statusType;
  if (st === 'coach_decision' || st === 'gleague') {
    return {
      label:
        item.statusLabel ||
        (st === 'gleague' ? 'Decisión técnica · G-League' : 'Decisión técnica'),
      textClass: 'text-slate-400',
      cardClass: 'bg-[#131C2E]/80 border-[#1E293B] text-slate-200',
      isTechnical: true,
    };
  }
  if (st === 'foul_out') {
    return {
      label: item.statusLabel || 'Expulsado (6 faltas)',
      textClass: 'text-orange-400',
      cardClass: 'bg-orange-950/20 border-orange-500/35 text-slate-100',
      isTechnical: false,
    };
  }
  if (st === 'in_game_setback') {
    return {
      label: item.statusLabel || 'Percance en pista',
      textClass: 'text-amber-300',
      cardClass: 'bg-amber-950/20 border-amber-500/35 text-slate-100',
      isTechnical: false,
    };
  }
  if (st === 'rest' || st === 'suspension_personal') {
    return {
      label: item.statusLabel || (st === 'rest' ? 'Descanso' : 'Baja oficial'),
      textClass: 'text-amber-300',
      cardClass: 'bg-[#131C2E] border-amber-500/30 text-slate-100',
      isTechnical: false,
    };
  }
  return {
    label: item.statusLabel || 'Lesionado',
    textClass: 'text-rose-400',
    cardClass: 'bg-rose-950/15 border-rose-500/30 text-slate-100',
    isTechnical: false,
  };
}

function sanitizeClientAbsenceNoteEs(raw: string, statusType?: string): string {
  let cleaned = (raw || '').trim();
  if (!cleaned) return '';
  if (statusType === 'foul_out') {
    cleaned = cleaned
      .replace(/^Expulsado por 6 faltas(?:\s+personales)?\s*(?:·\s*)?/i, '')
      .trim();
  } else if (statusType === 'injury') {
    cleaned = cleaned.replace(/^Baja por lesión\s+/i, 'Baja ').trim();
  }
  // Client-side safety net against any cached English words
  const englishGuard: Array<[RegExp, string]> = [
    [/\bNot\s+Specified\b/gi, ''],
    [/\bOut\s+for\s+season\b/gi, 'baja para el resto de la temporada'],
    [/\bDay-To-Day\b/gi, 'evolución diaria'],
    [/\bQuestionable\b/gi, 'duda médica'],
    [/\bDoubtful\b/gi, 'seria duda médica'],
    [/\bLeft\b/gi, 'izquierdo'],
    [/\bRight\b/gi, 'derecho'],
    [/\bSprain\b/gi, 'esguince'],
    [/\bStrain\b/gi, 'distensión'],
    [/\bSoreness\b/gi, 'molestias'],
    [/\bTightness\b/gi, 'sobrecarga'],
    [/\bFracture\b/gi, 'fractura'],
    [/\bContusion\b/gi, 'contusión'],
    [/\bIllness\b/gi, 'proceso vírico'],
    [/\bInflammation\b/gi, 'inflamación'],
    [/\bTendinopathy\b/gi, 'tendinopatía'],
    [/\bTendinitis\b/gi, 'tendinitis'],
    [/\bSurgery\b/gi, 'recuperación quirúrgica'],
    [/\bTorn\b|\bTear\b/gi, 'rotura'],
  ];
  for (const [rx, rep] of englishGuard) {
    cleaned = cleaned.replace(rx, rep);
  }
  if (
    /\b(?:has been ruled out|will not play|against the|expected to miss|game against)\b/i.test(
      cleaned
    )
  ) {
    const tailMatch = cleaned.match(/·\s*(Media\s+[\d.]+\s+PTS.*)$/i);
    cleaned = tailMatch
      ? `Baja por lesión confirmada en acta oficial · ${tailMatch[1]}`
      : 'Baja por lesión confirmada en acta oficial NBA';
  }
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatAbsenceDetailNote(item: GameInactiveOrDnpItem): string {
  if (item.statusType === 'foul_out') {
    const cleaned = sanitizeClientAbsenceNoteEs(item.note || '', item.statusType);
    const statsMatch = cleaned.match(/(\d+\s*PTS\s*·\s*\d+\s*REB.*)$/i);
    const statsTail = statsMatch ? ` · ${statsMatch[1]}` : '';
    const minPart =
      item.minutesPlayed !== undefined && item.minutesPlayed !== null
        ? `${item.minutesPlayed}'`
        : '';
    if (item.foulOutPeriod && item.foulOutClock) {
      return `${minPart ? `${minPart} · ` : ''}En el ${item.foulOutPeriod} faltando ${item.foulOutClock}${statsTail}`;
    }
    if (minPart) {
      return `${minPart}${statsTail}`;
    }
    return cleaned;
  }
  return sanitizeClientAbsenceNoteEs(item.note || '', item.statusType);
}

interface HoveredSeasonHighTooltip {
  left: number;
  top: number;
  showBelow: boolean;
  playerName: string;
  teamAbbr: string;
  colLabel: string;
  displayValue: string;
  mode: 'sole' | 'tied';
  prevBestText: string | null;
  gamesPlayed: number;
  seasonLabel: string;
}

export function GameScoutingReportModal({
  eventId,
  experienceMode,
  onClose,
  onInspectEntity,
}: GameScoutingReportModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTabId>('scouting');
  const [boxTeamFilter, setBoxTeamFilter] = useState<'both' | 'away' | 'home'>('both');
  const [absenceFilter, setAbsenceFilter] = useState<
    'all' | 'injury' | 'in_game' | 'technical'
  >('all');
  const [leaderFilter, setLeaderFilter] = useState<
    'all' | 'away' | 'home' | 'elite'
  >('all');
  const [statsViewStyle, setStatsViewStyle] = useState<'table_bars' | 'table_clean' | 'bars_tv'>(() => {
    try {
      const saved = localStorage.getItem('radar_nba_stats_view_mode');
      return (saved as any) || 'table_bars';
    } catch {
      return 'table_bars';
    }
  });
  const [boxscoreColsMode, setBoxscoreColsMode] = useState<'basic' | 'all'>(() => {
    try {
      const saved = localStorage.getItem('radar_nba_boxscore_mode');
      return (saved as any) || 'basic';
    } catch {
      return 'basic';
    }
  });

  const handleSetStatsViewStyle = (mode: 'table_bars' | 'table_clean' | 'bars_tv') => {
    setStatsViewStyle(mode);
    try {
      localStorage.setItem('radar_nba_stats_view_mode', mode);
    } catch {
      // ignore
    }
  };

  const handleSetBoxscoreColsMode = (mode: 'basic' | 'all') => {
    setBoxscoreColsMode(mode);
    try {
      localStorage.setItem('radar_nba_boxscore_mode', mode);
    } catch {
      // ignore
    }
  };

  const [report, setReport] = useState<GameOfficialReportData | null>(null);
  const [narrative, setNarrative] = useState<GameNarrativePayload | null>(null);
  const [loadingBox, setLoadingBox] = useState<boolean>(false);
  const [loadingNarrative, setLoadingNarrative] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [hoveredSeasonHigh, setHoveredSeasonHigh] =
    useState<HoveredSeasonHighTooltip | null>(null);
  const activeRequestIdRef = useRef<number>(0);
  const narrativeAbortRef = useRef<AbortController | null>(null);

  const {
    sortKey: quarterSortKey,
    sortAsc: quarterSortAsc,
    toggleSort: toggleQuarterSort,
    setSortKey: setQuarterSortKey,
  } = useTableSort<string>(null, false, ['team']);

  const [teamStatsSorts, setTeamStatsSorts] = useState<
    Record<string, { key: TeamStatsSortCol | null; asc: boolean }>
  >({});

  const toggleTeamSectionSort = (sectionId: string, col: TeamStatsSortCol) => {
    setTeamStatsSorts((prev) => {
      const curr = prev[sectionId];
      if (curr?.key === col) {
        return { ...prev, [sectionId]: { key: col, asc: !curr.asc } };
      }
      return {
        ...prev,
        [sectionId]: { key: col, asc: col === 'label' },
      };
    });
  };

  const {
    sortKey: leaderSortKey,
    sortAsc: leaderSortAsc,
    toggleSort: toggleLeaderSort,
    setSortKey: setLeaderSortKey,
  } = useTableSort<'category' | 'away' | 'diff' | 'home'>(null, false, [
    'category',
  ]);

  const [boxSorts, setBoxSorts] = useState<
    Record<'away' | 'home', { key: string | null; asc: boolean }>
  >({
    away: { key: null, asc: false },
    home: { key: null, asc: false },
  });

  const toggleBoxSort = (sideKey: 'away' | 'home', colKey: string) => {
    setBoxSorts((prev) => {
      const curr = prev[sideKey];
      if (curr.key === colKey) {
        return { ...prev, [sideKey]: { key: colKey, asc: !curr.asc } };
      }
      return {
        ...prev,
        [sideKey]: {
          key: colKey,
          asc: colKey === 'name' || colKey === 'tov' || colKey === 'pf',
        },
      };
    });
  };

  const matchupColors = useMemo(() => {
    if (!report) {
      return {
        awayColor: '#38BDF8',
        homeColor: '#F97316',
        awayUsedSecondary: false,
      };
    }
    return resolveTeamMatchupColors(report.away.abbr, report.home.abbr);
  }, [report]);

  const fetchGameNarrativeOnly = useCallback(
    (targetEventId: string, forceRefresh: boolean, reqId: number) => {
      if (narrativeAbortRef.current) {
        narrativeAbortRef.current.abort();
      }
      const controller = new AbortController();
      narrativeAbortRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 30000);

      setLoadingNarrative(true);
      setNarrativeError(null);
      const qs = forceRefresh ? '?refresh=1' : '';

      fetch(`/api/nba/game/${encodeURIComponent(targetEventId)}/narrative${qs}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error('No se pudo redactar la crónica del encuentro.');
          }
          const nar = (await res.json()) as GameNarrativePayload;
          if (activeRequestIdRef.current === reqId) {
            setNarrative(nar);
            setNarrativeError(null);
          }
        })
        .catch((err) => {
          if (activeRequestIdRef.current !== reqId) return;
          console.warn('Narrative warning:', err);
          setNarrativeError(
            'La redacción automática tardó más de lo previsto. Puedes reintentarla al instante.'
          );
        })
        .finally(() => {
          window.clearTimeout(timeoutId);
          if (activeRequestIdRef.current === reqId) {
            setLoadingNarrative(false);
          }
        });
    },
    []
  );

  const loadFullGameReport = useCallback(
    async (targetEventId: string, forceRefresh = false) => {
      const reqId = ++activeRequestIdRef.current;
      setLoadingBox(true);
      setErrorMsg(null);
      setNarrativeError(null);
      if (!forceRefresh) {
        setReport(null);
        setNarrative(null);
      }

      const qs = forceRefresh ? '?refresh=1' : '';

      // Stage 1: Fast Official Boxscore, Quarters, Podium & Zero-N/D Tables
      fetch(`/api/nba/game/${encodeURIComponent(targetEventId)}/boxscore${qs}`)
        .then(async (res) => {
          if (!res.ok) {
            throw new Error('No se pudo cargar el acta oficial del encuentro.');
          }
          const data = (await res.json()) as GameOfficialReportData;
          if (activeRequestIdRef.current === reqId) {
            setReport(data);
          }
        })
        .catch((err) => {
          if (activeRequestIdRef.current !== reqId) return;
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Error al recuperar los datos del partido.'
          );
        })
        .finally(() => {
          if (activeRequestIdRef.current === reqId) {
            setLoadingBox(false);
          }
        });

      // Stage 2: Parallel Gemini Scouting & Journalistic Chronicle
      fetchGameNarrativeOnly(targetEventId, forceRefresh, reqId);
    },
    [fetchGameNarrativeOnly]
  );

  useEffect(() => {
    if (!eventId) {
      activeRequestIdRef.current += 1;
      if (narrativeAbortRef.current) {
        narrativeAbortRef.current.abort();
        narrativeAbortRef.current = null;
      }
      setHoveredSeasonHigh(null);
      return;
    }
    setActiveTab('scouting');
    setBoxTeamFilter('both');
    setAbsenceFilter('all');
    setLeaderFilter('all');
    setQuarterSortKey(null);
    setTeamStatsSorts({});
    setLeaderSortKey(null);
    setBoxSorts({
      away: { key: null, asc: false },
      home: { key: null, asc: false },
    });
    setHoveredSeasonHigh(null);
    setCopied(false);
    void loadFullGameReport(eventId, false);
    return () => {
      if (narrativeAbortRef.current) {
        narrativeAbortRef.current.abort();
      }
    };
  }, [eventId, loadFullGameReport]);

  useEffect(() => {
    if (!eventId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [eventId, onClose]);

  const handleCopyPasoB = useCallback(async () => {
    if (!report) return;
    const md = buildCompletePasoBMarkdown(report, narrative);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback textarea copy
      const ta = document.createElement('textarea');
      ta.value = md;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  }, [report, narrative]);

  // Group 23 Team Stats into 3 Sections
  const scoringShootingRows = useMemo(
    () => (report ? report.teamComparisonRows.filter((r) => r.section === 'scoring_shooting' || r.key === 'pts' || r.key === 'fg' || r.key === 'fg3' || r.key === 'ft') : []),
    [report]
  );
  const efficiencyTacticsRows = useMemo(
    () => (report ? report.teamComparisonRows.filter((r) => r.section === 'efficiency_tactics' || ['efg', 'ts', 'offRtg', 'defRtg', 'paint', 'secondChance', 'fastbreak', 'ptsOffTov', 'bench', 'threeRatio'].includes(r.key)) : []),
    [report]
  );
  const rebDefenseRows = useMemo(
    () => (report ? report.teamComparisonRows.filter((r) => r.section === 'reb_playmaking_defense' || ['reb', 'oreb', 'ast', 'stl', 'blk', 'tov', 'tovPct', 'astTov', 'pf'].includes(r.key)) : []),
    [report]
  );

  // Combine all absences and in-game setbacks across both sides with explicit classification counts
  const allIncidencesAndAbsences = useMemo(() => {
    if (!report) return [];
    const list: Array<{ teamAbbr: string; item: GameInactiveOrDnpItem }> = [];
    for (const item of report.away.absencesAndDnp) {
      list.push({ teamAbbr: report.away.abbr, item });
    }
    for (const item of report.home.absencesAndDnp) {
      list.push({ teamAbbr: report.home.abbr, item });
    }
    list.sort(
      (a, b) =>
        (a.item.priorityRank ?? 8) - (b.item.priorityRank ?? 8) ||
        (b.item.ptsAvg ?? 0) - (a.item.ptsAvg ?? 0)
    );
    return list;
  }, [report]);

  const absenceSummary = useMemo(() => {
    let injuredOrMedicalCount = 0;
    let foulOutCount = 0;
    let inGameSetbackCount = 0;
    let technicalCount = 0;
    let restOrOtherCount = 0;

    for (const { item } of allIncidencesAndAbsences) {
      if (item.statusType === 'coach_decision' || item.statusType === 'gleague') {
        technicalCount++;
      } else if (item.statusType === 'foul_out') {
        foulOutCount++;
      } else if (item.statusType === 'in_game_setback') {
        inGameSetbackCount++;
      } else if (item.statusType === 'injury' || !item.statusType) {
        injuredOrMedicalCount++;
      } else {
        restOrOtherCount++;
      }
    }

    const inGameCount = foulOutCount + inGameSetbackCount;
    const medicalOnlyTotal = injuredOrMedicalCount + restOrOtherCount;

    const filtered = allIncidencesAndAbsences.filter(({ item }) => {
      if (absenceFilter === 'injury') {
        return (
          item.statusType === 'injury' ||
          item.statusType === 'rest' ||
          item.statusType === 'suspension_personal' ||
          !item.statusType
        );
      }
      if (absenceFilter === 'in_game') {
        return (
          item.statusType === 'foul_out' ||
          item.statusType === 'in_game_setback'
        );
      }
      if (absenceFilter === 'technical') {
        return (
          item.statusType === 'coach_decision' ||
          item.statusType === 'gleague'
        );
      }
      return true;
    });

    return {
      injuredOrMedicalCount,
      foulOutCount,
      inGameSetbackCount,
      inGameCount,
      technicalCount,
      restOrOtherCount,
      medicalOnlyTotal,
      filtered,
    };
  }, [allIncidencesAndAbsences, absenceFilter]);

  // Individual Leaders Summary (Category Scoreboard + Multi-Category Leaders + Elite Outliers)
  const leaderSummary = useMemo(() => {
    if (!report) {
      return {
        awayWins: 0,
        homeWins: 0,
        ties: 0,
        eliteRowsCount: 0,
        awayEliteCount: 0,
        homeEliteCount: 0,
        topAwayCollector: null as {
          playerId: string;
          jersey: string;
          shortName: string;
          name: string;
          count: number;
          categories: string[];
        } | null,
        topHomeCollector: null as {
          playerId: string;
          jersey: string;
          shortName: string;
          name: string;
          count: number;
          categories: string[];
        } | null,
      };
    }

    let awayWins = 0;
    let homeWins = 0;
    let ties = 0;
    let eliteRowsCount = 0;
    let awayEliteCount = 0;
    let homeEliteCount = 0;

    const awayTally = new Map<
      string,
      {
        playerId: string;
        jersey: string;
        shortName: string;
        name: string;
        count: number;
        categories: string[];
      }
    >();
    const homeTally = new Map<
      string,
      {
        playerId: string;
        jersey: string;
        shortName: string;
        name: string;
        count: number;
        categories: string[];
      }
    >();

    for (const row of report.leaderComparisonRows) {
      if (row.betterSide === 'away') awayWins++;
      else if (row.betterSide === 'home') homeWins++;
      else ties++;

      if (row.awayIsElite) awayEliteCount++;
      if (row.homeIsElite) homeEliteCount++;
      if (row.awayIsElite || row.homeIsElite) eliteRowsCount++;

      // Count positive category leaderships per player (excluding max turnovers 'tov')
      if (row.categoryKey !== 'tov') {
        if (row.awayPlayerId) {
          const prevA = awayTally.get(row.awayPlayerId);
          if (prevA) {
            prevA.count++;
            prevA.categories.push(row.categoryLabel);
          } else {
            awayTally.set(row.awayPlayerId, {
              playerId: row.awayPlayerId,
              jersey: row.awayJersey || '0',
              shortName:
                row.awayShortName ||
                row.awayFormatted.replace(/^#\d+\s*/, '').replace(/\s*\(.*\)$/, ''),
              name: row.awayPlayerName || row.awayShortName || 'Jugador',
              count: 1,
              categories: [row.categoryLabel],
            });
          }
        }
        if (row.homePlayerId) {
          const prevH = homeTally.get(row.homePlayerId);
          if (prevH) {
            prevH.count++;
            prevH.categories.push(row.categoryLabel);
          } else {
            homeTally.set(row.homePlayerId, {
              playerId: row.homePlayerId,
              jersey: row.homeJersey || '0',
              shortName:
                row.homeShortName ||
                row.homeFormatted.replace(/^#\d+\s*/, '').replace(/\s*\(.*\)$/, ''),
              name: row.homePlayerName || row.homeShortName || 'Jugador',
              count: 1,
              categories: [row.categoryLabel],
            });
          }
        }
      }
    }

    const topAwayCollector =
      [...awayTally.values()].sort((a, b) => b.count - a.count)[0] || null;
    const topHomeCollector =
      [...homeTally.values()].sort((a, b) => b.count - a.count)[0] || null;

    return {
      awayWins,
      homeWins,
      ties,
      eliteRowsCount,
      awayEliteCount,
      homeEliteCount,
      topAwayCollector,
      topHomeCollector,
    };
  }, [report]);

  const filteredLeaderRows = useMemo(() => {
    if (!report) return [];
    const base = report.leaderComparisonRows
      .map((row, index) => ({ row, ordinal: index + 1 }))
      .filter(({ row }) => {
        if (leaderFilter === 'away') return row.betterSide === 'away';
        if (leaderFilter === 'home') return row.betterSide === 'home';
        if (leaderFilter === 'elite')
          return Boolean(row.awayIsElite || row.homeIsElite);
        return true;
      });
    if (!leaderSortKey) return base;
    return sortRows(
      base,
      ({ row }) => {
        switch (leaderSortKey) {
          case 'category':
            return row.categoryLabel;
          case 'away':
            return row.awayValue;
          case 'home':
            return row.homeValue;
          case 'diff':
            return Math.abs(row.awayValue - row.homeValue);
          default:
            return row.categoryLabel;
        }
      },
      leaderSortAsc
    );
  }, [report, leaderFilter, leaderSortKey, leaderSortAsc]);

  const gameHighlightEntities = useMemo(() => {
    if (!report) return [];
    const set = new Set<string>();
    for (const side of [report.away, report.home]) {
      if (side.name) set.add(side.name);
      if (side.shortName) set.add(side.shortName);
      for (const p of [...side.starters, ...side.bench]) {
        if (p.name) {
          set.add(p.name);
          if (p.jersey) set.add(`#${p.jersey} ${p.name}`);
        }
        if (p.shortName && p.shortName.length >= 5) {
          set.add(p.shortName);
        }
      }
      for (const a of side.absencesAndDnp) {
        if (a.name) {
          set.add(a.name);
          if (a.jersey) set.add(`#${a.jersey} ${a.name}`);
        }
      }
    }
    return Array.from(set);
  }, [report]);

  if (!eventId) return null;

  const formatDurationHuman = (mins: number | null) => {
    if (!mins || mins <= 0) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  const renderTeamBoxscoreTable = (side: GameReportTeamSide, roleLabel: string) => {
    const isAwaySide = report ? side.abbr === report.away.abbr : roleLabel === 'Visitante';
    const sideKey: 'away' | 'home' = isAwaySide ? 'away' : 'home';
    const sideSort = boxSorts[sideKey];
    const sideColor = isAwaySide
      ? matchupColors.awayColor
      : matchupColors.homeColor;
    const leaderCellBg = hexToRgba(sideColor, 0.24);
    const leaderCellBorder = hexToRgba(sideColor, 0.48);

    const allSidePlayers = [...side.starters, ...side.bench];
    const sortedSidePlayers = sideSort.key
      ? sortRows(
          allSidePlayers,
          (pl) => resolveBoxscorePlayerSortValue(pl, sideSort.key!),
          sideSort.asc
        )
      : null;

    // Precompute team-leading maximum value in EVERY column (including TO and PF per user choice)
    const computeMaxForCol = (
      getter: (pl: GameBoxScorePlayerLine) => number,
      opts?: {
        eligible?: (pl: GameBoxScorePlayerLine) => boolean;
        allowZeroOrNegative?: boolean;
      }
    ): number | null => {
      const pool = opts?.eligible
        ? allSidePlayers.filter(opts.eligible)
        : allSidePlayers;
      if (pool.length === 0) return null;
      let maxVal = -Infinity;
      for (const pl of pool) {
        const v = getter(pl);
        if (v > maxVal) maxVal = v;
      }
      if (!Number.isFinite(maxVal)) return null;
      if (!opts?.allowZeroOrNegative && maxVal <= 0) return null;
      return maxVal;
    };

    const teamMaxMap: Record<string, number | null> = {
      min: computeMaxForCol((x) => x.minutes),
      pts: computeMaxForCol((x) => x.points),
      fgm: computeMaxForCol((x) => x.fgm),
      fga: computeMaxForCol((x) => x.fga),
      fgPct: computeMaxForCol((x) => x.fgPct, { eligible: (x) => x.fga > 0 }),
      fg3m: computeMaxForCol((x) => x.fg3m),
      fg3a: computeMaxForCol((x) => x.fg3a),
      fg3Pct: computeMaxForCol((x) => x.fg3Pct, { eligible: (x) => x.fg3a > 0 }),
      ftm: computeMaxForCol((x) => x.ftm),
      fta: computeMaxForCol((x) => x.fta),
      ftPct: computeMaxForCol((x) => x.ftPct, { eligible: (x) => x.fta > 0 }),
      oreb: computeMaxForCol((x) => x.oreb),
      dreb: computeMaxForCol((x) => x.dreb),
      reb: computeMaxForCol((x) => x.rebounds),
      ast: computeMaxForCol((x) => x.assists),
      stl: computeMaxForCol((x) => x.steals),
      blk: computeMaxForCol((x) => x.blocks),
      tov: computeMaxForCol((x) => x.turnovers),
      pf: computeMaxForCol((x) => x.fouls),
      plusMinus: computeMaxForCol((x) => x.plusMinus, {
        allowZeroOrNegative: true,
      }),
      gameScore: computeMaxForCol((x) => x.gameScore, {
        allowZeroOrNegative: true,
      }),
      tsPct: computeMaxForCol((x) => x.tsPct, {
        eligible: (x) => x.fga + x.fta > 0,
      }),
      usgEst: computeMaxForCol((x) => x.usgEst || 0),
    };

    const formatPrevBestText = (
      colKey: string,
      prevBest: number | null
    ): string | null => {
      if (prevBest === null || !Number.isFinite(prevBest)) return null;
      if (colKey === 'min') {
        const mins = Math.floor(prevBest);
        const secs = Math.min(59, Math.round((prevBest - mins) * 60));
        return `${mins}:${String(secs).padStart(2, '0')} min`;
      }
      if (
        colKey === 'fgPct' ||
        colKey === 'fg3Pct' ||
        colKey === 'ftPct'
      ) {
        return `${prevBest.toFixed(0)}%`;
      }
      if (colKey === 'tsPct' || colKey === 'usgEst') {
        return `${prevBest.toFixed(1)}%`;
      }
      if (colKey === 'gameScore') {
        return prevBest.toFixed(1);
      }
      if (colKey === 'plusMinus') {
        const rounded = Math.round(prevBest);
        return rounded > 0 ? `+${rounded}` : `${rounded}`;
      }
      return `${Math.round(prevBest)}`;
    };

    const openSeasonHighPopover = (
      el: HTMLElement,
      pl: GameBoxScorePlayerLine,
      colKey: string,
      colLabel: string,
      displayVal: string,
      sh: PlayerSeasonHighEntry
    ) => {
      const rect = el.getBoundingClientRect();
      const clampedCenter = Math.max(
        136,
        Math.min(window.innerWidth - 136, rect.left + rect.width / 2)
      );
      const showBelow = rect.top < 110;
      setHoveredSeasonHigh({
        left: clampedCenter,
        top: showBelow ? rect.bottom + 8 : rect.top - 8,
        showBelow,
        playerName: pl.name,
        teamAbbr: side.abbr,
        colLabel,
        displayValue: displayVal,
        mode: sh.mode,
        prevBestText: formatPrevBestText(colKey, sh.prevBest),
        gamesPlayed: sh.gamesPlayed,
        seasonLabel: report?.seasonLabel || 'Temporada',
      });
    };

    const renderBoxscoreStatCell = (params: {
      pl: GameBoxScorePlayerLine;
      colKey: string;
      colLabel: string;
      rawVal: number;
      displayVal: string;
      defaultTextClass: string;
      eligibleForMax?: boolean;
      eps?: number;
    }) => {
      const {
        pl,
        colKey,
        colLabel,
        rawVal,
        displayVal,
        defaultTextClass,
        eligibleForMax = true,
        eps = 0.04,
      } = params;

      const colMax = teamMaxMap[colKey];
      const isTeamLeader =
        eligibleForMax &&
        colMax !== null &&
        Math.abs(rawVal - colMax) <= eps;

      const sh = pl.seasonHighs?.[colKey];
      const isSeasonHigh = Boolean(sh);

      const textColorClass = isSeasonHigh
        ? 'text-[#FDE047] font-extrabold drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]'
        : isTeamLeader
        ? colKey === 'plusMinus' && rawVal < 0
          ? 'text-rose-200 font-bold'
          : 'text-white font-bold'
        : defaultTextClass;

      const prevStr = sh ? formatPrevBestText(colKey, sh.prevBest) : null;
      const nativeTitle = sh
        ? sh.mode === 'sole'
          ? `Tope de temporada (${report?.seasonLabel || ''}) de ${pl.name}: ${displayVal} en ${colLabel}${
              prevStr ? ` · Supera su anterior mejor marca (${prevStr})` : ''
            } en ${sh.gamesPlayed} PJ`
          : `Tope de temporada igualado (${report?.seasonLabel || ''}) de ${pl.name}: ${displayVal} en ${colLabel} (${sh.gamesPlayed} PJ)`
        : isTeamLeader
        ? `Líder de ${side.abbr} en ${colLabel}: ${displayVal}`
        : undefined;

      return (
        <td
          title={nativeTitle}
          onMouseEnter={
            sh
              ? (e) =>
                  openSeasonHighPopover(
                    e.currentTarget,
                    pl,
                    colKey,
                    colLabel,
                    displayVal,
                    sh
                  )
              : undefined
          }
          onMouseLeave={sh ? () => setHoveredSeasonHigh(null) : undefined}
          style={
            isTeamLeader
              ? {
                  backgroundColor: leaderCellBg,
                  boxShadow: `inset 0 0 0 1px ${leaderCellBorder}`,
                }
              : undefined
          }
          className={`py-1 px-1.5 text-center font-mono tabular-nums text-xs whitespace-nowrap transition-colors ${textColorClass}`}
        >
          {displayVal}
        </td>
      );
    };

    const renderPlayerRow = (p: GameBoxScorePlayerLine) => (
      <tr
        key={p.playerId}
        onClick={() => {
          setHoveredSeasonHigh(null);
          onClose();
          onInspectEntity('player', p.playerId);
        }}
        className="hover:bg-[#182338] cursor-pointer transition-colors"
      >
        <td className="py-2 pl-3 pr-2 whitespace-nowrap sticky left-0 bg-[#131C2E] z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2">
            <PlayerAvatar
              playerId={p.playerId}
              name={p.name}
              teamAbbr={side.abbr}
              size="xs"
            />
            <span className="font-mono tabular-nums text-[11px] text-slate-400 w-6 shrink-0">
              #{p.jersey}
            </span>
            <span className="font-medium text-slate-100 text-xs sm:text-sm">
              {p.name}
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              {p.position}
            </span>
            {p.isSpanish && (
              <span className="text-[10px] font-semibold text-amber-300">
                ESP
              </span>
            )}
          </div>
        </td>
        {/* Fixed 21 columns in exact order: MIN PTOS FGM FGA FG% 3PM 3PA 3P% FTM FTA FT% OREB DREB REB AST STL BLK TO PF +/- GmSc */}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'min',
          colLabel: 'Minutos (MIN)',
          rawVal: p.minutes,
          displayVal: p.minutesFormatted,
          defaultTextClass: 'text-slate-300',
          eps: 0.08,
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'pts',
          colLabel: 'Puntos (PTOS)',
          rawVal: p.points,
          displayVal: `${p.points}`,
          defaultTextClass: 'font-bold text-slate-100',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'fgm',
          colLabel: 'Tiros de campo anotados (FGM)',
          rawVal: p.fgm,
          displayVal: `${p.fgm}`,
          defaultTextClass: 'text-slate-300',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'fga',
          colLabel: 'Tiros de campo intentados (FGA)',
          rawVal: p.fga,
          displayVal: `${p.fga}`,
          defaultTextClass: 'text-slate-300',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'fgPct',
          colLabel: '% Tiros de campo (FG%)',
          rawVal: p.fgPct,
          displayVal: `${p.fgPct.toFixed(0)}%`,
          defaultTextClass: 'text-slate-300',
          eligibleForMax: p.fga > 0,
          eps: 0.12,
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'fg3m',
          colLabel: 'Triples anotados (3PM)',
          rawVal: p.fg3m,
          displayVal: `${p.fg3m}`,
          defaultTextClass: 'text-slate-300',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'fg3a',
          colLabel: 'Triples intentados (3PA)',
          rawVal: p.fg3a,
          displayVal: `${p.fg3a}`,
          defaultTextClass: 'text-slate-300',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'fg3Pct',
          colLabel: '% Triples (3P%)',
          rawVal: p.fg3Pct,
          displayVal: `${p.fg3Pct.toFixed(0)}%`,
          defaultTextClass: 'text-slate-300',
          eligibleForMax: p.fg3a > 0,
          eps: 0.12,
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'ftm',
          colLabel: 'Tiros libres anotados (FTM)',
          rawVal: p.ftm,
          displayVal: `${p.ftm}`,
          defaultTextClass: 'text-slate-300',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'fta',
          colLabel: 'Tiros libres intentados (FTA)',
          rawVal: p.fta,
          displayVal: `${p.fta}`,
          defaultTextClass: 'text-slate-300',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'ftPct',
          colLabel: '% Tiros libres (FT%)',
          rawVal: p.ftPct,
          displayVal: `${p.ftPct.toFixed(0)}%`,
          defaultTextClass: 'text-slate-300',
          eligibleForMax: p.fta > 0,
          eps: 0.12,
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'oreb',
          colLabel: 'Rebotes ofensivos (OREB)',
          rawVal: p.oreb,
          displayVal: `${p.oreb}`,
          defaultTextClass: 'text-slate-300',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'dreb',
          colLabel: 'Rebotes defensivos (DREB)',
          rawVal: p.dreb,
          displayVal: `${p.dreb}`,
          defaultTextClass: 'text-slate-300',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'reb',
          colLabel: 'Rebotes totales (REB)',
          rawVal: p.rebounds,
          displayVal: `${p.rebounds}`,
          defaultTextClass: 'font-semibold text-slate-100',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'ast',
          colLabel: 'Asistencias (AST)',
          rawVal: p.assists,
          displayVal: `${p.assists}`,
          defaultTextClass: 'text-slate-200',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'stl',
          colLabel: 'Robos (STL)',
          rawVal: p.steals,
          displayVal: `${p.steals}`,
          defaultTextClass: 'text-slate-300',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'blk',
          colLabel: 'Tapones (BLK)',
          rawVal: p.blocks,
          displayVal: `${p.blocks}`,
          defaultTextClass: 'text-slate-300',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'tov',
          colLabel: 'Pérdidas (TO)',
          rawVal: p.turnovers,
          displayVal: `${p.turnovers}`,
          defaultTextClass: 'text-slate-400',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'pf',
          colLabel: 'Faltas personales (PF)',
          rawVal: p.fouls,
          displayVal: `${p.fouls}`,
          defaultTextClass: 'text-slate-400',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'plusMinus',
          colLabel: 'Más/Menos (+/-)',
          rawVal: p.plusMinus,
          displayVal: p.plusMinus > 0 ? `+${p.plusMinus}` : `${p.plusMinus}`,
          defaultTextClass:
            p.plusMinus > 0
              ? 'font-semibold text-emerald-400'
              : p.plusMinus < 0
              ? 'font-semibold text-rose-400'
              : 'font-semibold text-slate-400',
        })}
        {renderBoxscoreStatCell({
          pl: p,
          colKey: 'gameScore',
          colLabel: 'Valoración Hollinger (GmSc)',
          rawVal: p.gameScore,
          displayVal: p.gameScore.toFixed(1),
          defaultTextClass: 'font-semibold text-slate-200',
          eps: 0.08,
        })}
        {boxscoreColsMode === 'all' && (
          <>
            {renderBoxscoreStatCell({
              pl: p,
              colKey: 'tsPct',
              colLabel: 'Acierto real (TS%)',
              rawVal: p.tsPct,
              displayVal: `${p.tsPct.toFixed(1)}%`,
              defaultTextClass: 'text-slate-300',
              eligibleForMax: p.fga + p.fta > 0,
              eps: 0.12,
            })}
            {renderBoxscoreStatCell({
              pl: p,
              colKey: 'usgEst',
              colLabel: 'Uso ofensivo (USG%)',
              rawVal: p.usgEst || 0,
              displayVal: `${(p.usgEst || 0).toFixed(1)}%`,
              defaultTextClass: 'text-slate-300',
              eps: 0.12,
            })}
          </>
        )}
      </tr>
    );

    const t = side.totals;
    const colCount = boxscoreColsMode === 'all' ? 24 : 22;

    return (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1E293B] bg-[#0F172A]/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-white/20"
              style={{ backgroundColor: sideColor }}
            />
            <TeamLogo
              abbr={side.abbr}
              teamId={side.teamId}
              size="sm"
              framed
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span
                className={`font-mono text-xs font-bold ${
                  side.isWinner ? 'text-orange-400' : 'text-slate-400'
                }`}
              >
                {side.abbr}
              </span>
              <h4 className="text-sm font-semibold text-slate-100">
                {side.name} ({side.score} PTS)
              </h4>
              <span className="text-xs text-slate-400">
                · {roleLabel} · Récord {side.recordAfter}
              </span>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            OffRtg {t.offRtg.toFixed(1)} · {t.efgPct.toFixed(1)}% eFG · Banquillo{' '}
            {t.benchPoints} PTS
          </span>
        </div>

        <div
          className="max-h-[520px] overflow-auto"
          onScroll={() => {
            if (hoveredSeasonHigh) setHoveredSeasonHigh(null);
          }}
        >
          <table className="w-full text-left border-collapse">
            <thead className={STICKY_THEAD_CLASS}>
              <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                <SortableTh
                  label="Jugador"
                  align="left"
                  compact
                  active={sideSort.key === 'name'}
                  asc={sideSort.asc}
                  onSort={() => toggleBoxSort(sideKey, 'name')}
                  className="py-1.5 pl-3 pr-2 sticky left-0 bg-[#0F172A] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.3)]"
                />
                {(
                  [
                    { key: 'min', label: 'MIN' },
                    { key: 'pts', label: 'PTOS' },
                    { key: 'fgm', label: 'FGM' },
                    { key: 'fga', label: 'FGA' },
                    { key: 'fgPct', label: 'FG%' },
                    { key: 'fg3m', label: '3PM' },
                    { key: 'fg3a', label: '3PA' },
                    { key: 'fg3Pct', label: '3P%' },
                    { key: 'ftm', label: 'FTM' },
                    { key: 'fta', label: 'FTA' },
                    { key: 'ftPct', label: 'FT%' },
                    { key: 'oreb', label: 'OREB' },
                    { key: 'dreb', label: 'DREB' },
                    { key: 'reb', label: 'REB' },
                    { key: 'ast', label: 'AST' },
                    { key: 'stl', label: 'STL' },
                    { key: 'blk', label: 'BLK' },
                    { key: 'tov', label: 'TO' },
                    { key: 'pf', label: 'PF' },
                    { key: 'plusMinus', label: '+/-' },
                    { key: 'gameScore', label: 'GmSc', helpKey: 'gmSc' },
                    ...(boxscoreColsMode === 'all'
                      ? [
                          { key: 'tsPct', label: 'TS%' },
                          { key: 'usgEst', label: 'USG%' },
                        ]
                      : []),
                  ] as Array<{ key: string; label: string; helpKey?: string }>
                ).map((col) => (
                  <SortableTh
                    key={col.key}
                    label={col.label}
                    helpKey={col.helpKey}
                    align="center"
                    compact
                    active={sideSort.key === col.key}
                    asc={sideSort.asc}
                    onSort={() => toggleBoxSort(sideKey, col.key)}
                    className="py-1.5 px-1.5 align-middle"
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/80">
              {sortedSidePlayers ? (
                sortedSidePlayers.map(renderPlayerRow)
              ) : (
                <>
                  {side.starters.map(renderPlayerRow)}

                  {side.bench.length > 0 && (
                    <>
                      <tr className="bg-[#0B1120]/70 border-y border-[#1E293B]">
                        <td
                          colSpan={colCount}
                          className="py-1.5 px-3 text-[11px] font-semibold text-slate-400 sticky left-0 bg-[#0B1120]/90 z-10"
                        >
                          Segunda Unidad / Banquillo ({side.bench.length} jugadores ·{' '}
                          {t.benchPoints} PTS)
                        </td>
                      </tr>
                      {side.bench.map(renderPlayerRow)}
                    </>
                  )}
                </>
              )}

              {/* Team Totals Row */}
              <tr className="bg-[#0F172A] border-t border-[#1E293B] font-mono tabular-nums text-xs font-semibold text-slate-100">
                <td className="py-2.5 pl-3 pr-2 font-sans sticky left-0 bg-[#0F172A] z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">Totales {side.abbr}</td>
                <td className="py-2.5 px-2 text-right text-slate-400">240:00</td>
                <td className="py-2.5 px-2 text-right text-orange-400 font-bold">{t.points}</td>
                <td className="py-2.5 px-2 text-right">{t.fgm}</td>
                <td className="py-2.5 px-2 text-right">{t.fga}</td>
                <td className="py-2.5 px-2 text-right">{t.fgPct.toFixed(0)}%</td>
                <td className="py-2.5 px-2 text-right">{t.fg3m}</td>
                <td className="py-2.5 px-2 text-right">{t.fg3a}</td>
                <td className="py-2.5 px-2 text-right">{t.fg3Pct.toFixed(0)}%</td>
                <td className="py-2.5 px-2 text-right">{t.ftm}</td>
                <td className="py-2.5 px-2 text-right">{t.fta}</td>
                <td className="py-2.5 px-2 text-right">{t.ftPct.toFixed(0)}%</td>
                <td className="py-2.5 px-2 text-right">{t.oreb}</td>
                <td className="py-2.5 px-2 text-right">{t.dreb}</td>
                <td className="py-2.5 px-2 text-right font-bold text-orange-300">{t.reb}</td>
                <td className="py-2.5 px-2 text-right">{t.ast}</td>
                <td className="py-2.5 px-2 text-right">{t.stl}</td>
                <td className="py-2.5 px-2 text-right">{t.blk}</td>
                <td className="py-2.5 px-2 text-right">{t.tov}</td>
                <td className="py-2.5 px-2 text-right">{t.fouls}</td>
                <td className="py-2.5 px-2 text-right text-slate-400">—</td>
                <td className="py-2.5 px-2 text-right text-slate-300">{t.tsPct.toFixed(1)}%</td>
                {boxscoreColsMode === 'all' && (
                  <>
                    <td className="py-2.5 px-2 text-right text-slate-300">{t.tsPct.toFixed(1)}%</td>
                    <td className="py-2.5 px-2 text-right text-slate-300">100.0%</td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Inactive / Rotation Absences / DNP Footer split cleanly between In-Game Incidents, Medical Absences, and Technical Decisions */}
        {side.absencesAndDnp.length > 0 && (() => {
          const inGameIncidents = side.absencesAndDnp.filter(
            (item) =>
              item.statusType === 'foul_out' ||
              item.statusType === 'in_game_setback'
          );
          const medicalAbsences = side.absencesAndDnp.filter(
            (item) =>
              item.statusType !== 'coach_decision' &&
              item.statusType !== 'gleague' &&
              item.statusType !== 'foul_out' &&
              item.statusType !== 'in_game_setback'
          );
          const techDnp = side.absencesAndDnp.filter(
            (item) =>
              item.statusType === 'coach_decision' || item.statusType === 'gleague'
          );
          return (
            <div className="px-4 py-3 border-t border-[#1E293B] bg-[#0B1120]/45 text-xs text-slate-400 space-y-1.5">
              {inGameIncidents.length > 0 && (
                <div>
                  <span className="font-semibold text-orange-400">
                    Incidencias en pista ({side.abbr}):{' '}
                  </span>
                  <span className="text-slate-300">
                    {inGameIncidents
                      .map((item) => {
                        const meta = getAbsenceStatusMeta(item);
                        const cleanN = formatAbsenceDetailNote(item);
                        return `#${item.jersey} ${item.name} — ${meta.label}${cleanN ? ` (${cleanN})` : ''}`;
                      })
                      .join(' · ')}
                  </span>
                </div>
              )}
              {medicalAbsences.length > 0 && (
                <div>
                  <span className="font-semibold text-rose-300">
                    Bajas médicas ({side.abbr}):{' '}
                  </span>
                  <span className="text-slate-300">
                    {medicalAbsences
                      .map((item) => {
                        const meta = getAbsenceStatusMeta(item);
                        const cleanN = formatAbsenceDetailNote(item);
                        return `#${item.jersey} ${item.name} — ${meta.label}${cleanN ? ` (${cleanN})` : ''}`;
                      })
                      .join(' · ')}
                  </span>
                </div>
              )}
              {techDnp.length > 0 && (
                <div>
                  <span className="font-semibold text-slate-300">
                    Sin minutos por decisión técnica ({side.abbr}):{' '}
                  </span>
                  <span className="text-slate-400">
                    {techDnp
                      .map((item) => {
                        const meta = getAbsenceStatusMeta(item);
                        const cleanN = formatAbsenceDetailNote(item);
                        return `#${item.jersey} ${item.name} — ${meta.label}${cleanN ? ` (${cleanN})` : ''}`;
                      })
                      .join(' · ')}
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  const renderTeamStatsSection = (
    sectionId: string,
    title: string,
    rows: typeof report extends null ? never : GameOfficialReportData['teamComparisonRows']
  ) => {
    if (!report || rows.length === 0) return null;

    const secSort = teamStatsSorts[sectionId] || { key: null, asc: false };
    const sortedSecRows = secSort.key
      ? sortRows(
          rows,
          (r) => {
            switch (secSort.key) {
              case 'label':
                return r.label;
              case 'away':
                return r.awayNumeric;
              case 'home':
                return r.homeNumeric;
              case 'diff':
                return Math.abs(r.awayNumeric - r.homeNumeric);
              case 'pulse':
                return computeLeaderBarSplit(
                  r.awayNumeric,
                  r.homeNumeric,
                  r.lowerIsBetter
                ).awayPct;
              default:
                return r.label;
            }
          },
          secSort.asc
        )
      : rows;

    if (statsViewStyle === 'bars_tv') {
      return (
        <section className="space-y-3">
          <h4 className="text-xs font-bold text-orange-400 tracking-wider uppercase border-b border-[#1E293B] pb-1.5">
            {title}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rows.map((row) => {
              const split = computeLeaderBarSplit(
                row.awayNumeric,
                row.homeNumeric,
                row.lowerIsBetter
              );

              return (
                <div
                  key={row.key}
                  className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                    <span
                      className={`inline-flex items-center gap-1.5 ${
                        row.betterSide === 'away' ? 'text-emerald-400 font-bold' : 'text-slate-300'
                      }`}
                    >
                      <TeamLogo abbr={report.away.abbr} teamId={report.away.teamId} size="xs" />
                      <span>
                        {report.away.abbr} {row.awayDisplay}
                      </span>
                    </span>
                    <span className="text-slate-400 font-medium text-center truncate px-2">
                      {row.label}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 ${
                        row.betterSide === 'home' ? 'text-emerald-400 font-bold' : 'text-slate-300'
                      }`}
                    >
                      <span>
                        {row.homeDisplay} {report.home.abbr}
                      </span>
                      <TeamLogo abbr={report.home.abbr} teamId={report.home.teamId} size="xs" />
                    </span>
                  </div>

                  <MatchupPulseBar
                    awayPct={split.awayPct}
                    homePct={split.homePct}
                    awayColor={matchupColors.awayColor}
                    homeColor={matchupColors.homeColor}
                    betterSide={row.betterSide}
                    size="sm"
                    title={`${report.away.abbr} ${row.awayDisplay} (${split.awayPct}%) vs ${report.home.abbr} ${row.homeDisplay} (${split.homePct}%) · Línea central: 50%`}
                  />

                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span className="text-slate-500">Eje central: 50%</span>
                    <span className="text-orange-300">{row.diffDisplay}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    return (
      <section className="space-y-1.5">
        <h4 className="text-xs font-bold text-orange-400 tracking-wider uppercase border-b border-[#1E293B] pb-1">
          {title}
        </h4>
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden">
          {/* Compact Mobile Stack (<sm) */}
          <div className="sm:hidden divide-y divide-[#1E293B]/80">
            {rows.map((row) => {
              const split = computeLeaderBarSplit(
                row.awayNumeric,
                row.homeNumeric,
                row.lowerIsBetter
              );
              return (
                <div key={row.key} className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 font-medium text-slate-200 min-w-0 truncate">
                      <span className="truncate">{row.label}</span>
                      {row.helpKey && (
                        <MetricInfoTooltip
                          helpKey={row.helpKey}
                          align="left"
                          iconClassName="w-3 h-3 shrink-0"
                        />
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-orange-300 shrink-0">
                      {row.diffDisplay}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                    <span
                      className={
                        row.betterSide === 'away'
                          ? 'font-bold text-emerald-400'
                          : 'text-slate-300'
                      }
                    >
                      {report.away.abbr}: {row.awayDisplay}
                    </span>
                    {statsViewStyle === 'table_bars' && (
                      <div className="flex-1 max-w-[96px]">
                        <MatchupPulseBar
                          awayPct={split.awayPct}
                          homePct={split.homePct}
                          awayColor={matchupColors.awayColor}
                          homeColor={matchupColors.homeColor}
                          betterSide={row.betterSide}
                          size="xs"
                          title={`${report.away.abbr} ${split.awayPct}% vs ${report.home.abbr} ${split.homePct}% · Mitad: 50%`}
                        />
                      </div>
                    )}
                    <span
                      className={
                        row.betterSide === 'home'
                          ? 'font-bold text-emerald-400'
                          : 'text-slate-300'
                      }
                    >
                      {row.homeDisplay} :{report.home.abbr}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full-Width Fixed Table (sm+) with Sticky Sortable Headers */}
          <div className="hidden sm:block overflow-auto max-h-[52vh]">
            <table className="w-full table-fixed text-left border-collapse text-xs">
              <colgroup>
                <col
                  className={
                    statsViewStyle === 'table_bars' ? 'w-[33%]' : 'w-[42%]'
                  }
                />
                <col
                  className={
                    statsViewStyle === 'table_bars' ? 'w-[18%]' : 'w-[21%]'
                  }
                />
                <col
                  className={
                    statsViewStyle === 'table_bars' ? 'w-[18%]' : 'w-[21%]'
                  }
                />
                <col
                  className={
                    statsViewStyle === 'table_bars' ? 'w-[14%]' : 'w-[16%]'
                  }
                />
                {statsViewStyle === 'table_bars' && <col className="w-[17%]" />}
              </colgroup>
              <thead className={STICKY_THEAD_CLASS}>
                <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                  <SortableTh
                    label="Categoría"
                    align="left"
                    compact
                    active={secSort.key === 'label'}
                    asc={secSort.asc}
                    onSort={() => toggleTeamSectionSort(sectionId, 'label')}
                    className="py-1.5 pl-3 pr-2"
                  />
                  <SortableTh
                    label={
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span
                          aria-hidden="true"
                          className="w-2 h-2 rounded-xs shrink-0 ring-1 ring-white/20"
                          style={{ backgroundColor: matchupColors.awayColor }}
                        />
                        <TeamLogo
                          abbr={report.away.abbr}
                          teamId={report.away.teamId}
                          size="xs"
                        />
                        <span>{report.away.abbr}</span>
                        <span className="hidden lg:inline text-[10px] font-normal text-slate-400">
                          (Visitante)
                        </span>
                      </span>
                    }
                    align="right"
                    compact
                    active={secSort.key === 'away'}
                    asc={secSort.asc}
                    onSort={() => toggleTeamSectionSort(sectionId, 'away')}
                    className="py-1.5 px-2"
                  />
                  <SortableTh
                    label={
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span
                          aria-hidden="true"
                          className="w-2 h-2 rounded-xs shrink-0 ring-1 ring-white/20"
                          style={{ backgroundColor: matchupColors.homeColor }}
                        />
                        <TeamLogo
                          abbr={report.home.abbr}
                          teamId={report.home.teamId}
                          size="xs"
                        />
                        <span>{report.home.abbr}</span>
                        <span className="hidden lg:inline text-[10px] font-normal text-slate-400">
                          (Local)
                        </span>
                      </span>
                    }
                    align="right"
                    compact
                    active={secSort.key === 'home'}
                    asc={secSort.asc}
                    onSort={() => toggleTeamSectionSort(sectionId, 'home')}
                    className="py-1.5 px-2"
                  />
                  <SortableTh
                    label="Ventaja (Δ)"
                    align="right"
                    compact
                    active={secSort.key === 'diff'}
                    asc={secSort.asc}
                    onSort={() => toggleTeamSectionSort(sectionId, 'diff')}
                    className="py-1.5 px-2"
                  />
                  {statsViewStyle === 'table_bars' && (
                    <SortableTh
                      label={
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="w-2 h-2 rounded-xs shrink-0"
                            style={{ backgroundColor: matchupColors.awayColor }}
                          />
                          <span>Pulso · 50%</span>
                          <span
                            aria-hidden="true"
                            className="w-2 h-2 rounded-xs shrink-0"
                            style={{ backgroundColor: matchupColors.homeColor }}
                          />
                        </span>
                      }
                      align="center"
                      compact
                      active={secSort.key === 'pulse'}
                      asc={secSort.asc}
                      onSort={() => toggleTeamSectionSort(sectionId, 'pulse')}
                      className="py-1.5 pl-2 pr-3"
                    />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]/80">
                {sortedSecRows.map((row) => {
                const split = computeLeaderBarSplit(
                  row.awayNumeric,
                  row.homeNumeric,
                  row.lowerIsBetter
                );

                return (
                  <tr
                    key={row.key}
                    className="hover:bg-[#182338]/60 transition-colors"
                  >
                    <td className="py-1.5 pl-3 pr-2 text-slate-200 leading-tight">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate" title={row.label}>
                          {row.label}
                        </span>
                        {row.helpKey && (
                          <MetricInfoTooltip
                            helpKey={row.helpKey}
                            align="left"
                            iconClassName="w-3 h-3 shrink-0"
                          />
                        )}
                      </div>
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                        row.betterSide === 'away'
                          ? 'font-bold text-emerald-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {row.awayDisplay}
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                        row.betterSide === 'home'
                          ? 'font-bold text-emerald-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {row.homeDisplay}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono tabular-nums text-[11px] text-orange-300 whitespace-nowrap truncate">
                      {row.diffDisplay}
                    </td>
                    {statsViewStyle === 'table_bars' && (
                      <td className="py-1.5 pl-2 pr-3 align-middle">
                        <MatchupPulseBar
                          awayPct={split.awayPct}
                          homePct={split.homePct}
                          awayColor={matchupColors.awayColor}
                          homeColor={matchupColors.homeColor}
                          betterSide={row.betterSide}
                          size="xs"
                          title={`${report.away.abbr} ${row.awayDisplay} (${split.awayPct}%) vs ${report.home.abbr} ${row.homeDisplay} (${split.homePct}%) · Línea central: 50%`}
                        />
                      </td>
                    )}
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 lg:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Informe de scouting y crónica del partido"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl h-[94vh] sm:h-auto sm:max-h-[92vh] bg-[#0B1120] border border-[#1E293B] rounded-t-2xl sm:rounded-xl overflow-hidden flex flex-col"
      >
        {/* TOP STICKY BAR: Official Match Header + Copy + Close */}
        <div className="px-4 sm:px-6 py-3.5 bg-[#131C2E] border-b border-[#1E293B] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-1.5">
              <span className="font-semibold text-orange-400">
                RadarNBA · Informe de Scouting
              </span>
              {report && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{report.date}</span>
                  <span aria-hidden="true">·</span>
                  <span>Temporada {report.seasonLabel}</span>
                  {formatDurationHuman(report.durationMinutes) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Duración {formatDurationHuman(report.durationMinutes)}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>

            {loadingBox && !report ? (
              <div className="mt-1.5 h-6 w-72 sm:w-[460px] bg-[#1E293B] rounded animate-pulse" />
            ) : report ? (
              <div className="mt-1 flex items-center gap-2.5 min-w-0">
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <TeamLogo
                    abbr={report.away.abbr}
                    teamId={report.away.teamId}
                    size="sm"
                    framed
                  />
                  <TeamLogo
                    abbr={report.home.abbr}
                    teamId={report.home.teamId}
                    size="sm"
                    framed
                  />
                </div>
                <h2 className="text-sm sm:text-lg font-bold text-slate-100 leading-snug">
                  {report.pasoBTitle}
                </h2>
              </div>
            ) : (
              <h2 className="mt-1 text-sm sm:text-base font-semibold text-slate-200">
                Informe táctico del encuentro
              </h2>
            )}

            {report && report.officials.length > 0 && (
              <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                Árbitros en acta: {report.officials.join(', ')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {report && (
              <button
                type="button"
                onClick={() => void handleCopyPasoB()}
                className="min-h-[42px] sm:min-h-[36px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-[#1E293B] bg-[#0B1120] text-slate-200 hover:border-orange-500/50 hover:text-orange-300 transition-colors whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-orange-400" />
                    <span className="hidden sm:inline">Copiar informe</span>
                    <span className="sm:hidden">Copiar</span>
                  </>
                )}
              </button>
            )}

            {eventId && (
              <button
                type="button"
                title="Actualizar acta y regenerar crónica"
                disabled={loadingNarrative || loadingBox}
                onClick={() => void loadFullGameReport(eventId, true)}
                className="min-h-[42px] min-w-[42px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center rounded-lg border border-[#1E293B] bg-[#0B1120] text-slate-300 hover:text-orange-400 disabled:opacity-40 transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    loadingNarrative || loadingBox ? 'animate-spin text-orange-400' : ''
                  }`}
                />
              </button>
            )}

            <button
              type="button"
              aria-label="Cerrar informe"
              onClick={onClose}
              className="min-h-[42px] min-w-[42px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center rounded-lg border border-[#1E293B] bg-[#0B1120] text-slate-300 hover:text-white hover:bg-[#182338] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {errorMsg && !report ? (
            <div className="bg-[#131C2E] border border-rose-500/40 rounded-lg p-6 text-center space-y-3">
              <p className="text-sm font-semibold text-rose-300">{errorMsg}</p>
              <button
                type="button"
                onClick={() => eventId && void loadFullGameReport(eventId, true)}
                className="min-h-[40px] px-4 py-2 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors"
              >
                Reintentar carga
              </button>
            </div>
          ) : loadingBox && !report ? (
            <div className="space-y-4">
              <div className="h-28 bg-[#131C2E] border border-[#1E293B] rounded-lg animate-pulse" />
              <div className="h-64 bg-[#131C2E] border border-[#1E293B] rounded-lg animate-pulse" />
            </div>
          ) : report ? (
            <>
              {/* ALWAYS-VISIBLE QUARTER-BY-QUARTER SCOREBOARD & GAME FLOW STRIP */}
              <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#1E293B] bg-[#0F172A]/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-200">
                      Marcador por Cuartos y Flujo de Partido
                    </span>
                    <MetricInfoTooltip helpKey="gameReportQuarters" align="left" />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400 font-mono tabular-nums">
                    <span>
                      Tramo clave:{' '}
                      <strong className="text-orange-300 font-semibold">
                        {report.decisivePeriodLabel}
                      </strong>
                    </span>
                    {report.leadChanges !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{report.leadChanges} cambios de líder</span>
                      </>
                    )}
                    {report.timesTied !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{report.timesTied} empates</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="overflow-auto max-h-[36vh]">
                  <table className="w-full text-left border-collapse font-mono tabular-nums text-xs sm:text-sm">
                    <thead className={STICKY_THEAD_CLASS}>
                      <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                        <SortableTh
                          label="Equipo (Récord)"
                          align="left"
                          compact
                          active={quarterSortKey === 'team'}
                          asc={quarterSortAsc}
                          onSort={() => toggleQuarterSort('team')}
                          className="py-2 pl-4 pr-3 font-sans"
                        />
                        {report.periods.map((p) => {
                          const pKey = `period_${p.period}`;
                          return (
                            <SortableTh
                              key={p.period}
                              label={p.label}
                              align="center"
                              compact
                              active={quarterSortKey === pKey}
                              asc={quarterSortAsc}
                              onSort={() => toggleQuarterSort(pKey)}
                              className="py-2 px-2.5"
                            />
                          );
                        })}
                        <SortableTh
                          label="FINAL"
                          align="right"
                          compact
                          active={quarterSortKey === 'final'}
                          asc={quarterSortAsc}
                          onSort={() => toggleQuarterSort('final')}
                          className="py-2 px-3 font-semibold text-slate-200"
                        />
                        {experienceMode === 'advanced' && (
                          <SortableTh
                            label="OffRtg · eFG%"
                            align="right"
                            compact
                            active={quarterSortKey === 'adv'}
                            asc={quarterSortAsc}
                            onSort={() => toggleQuarterSort('adv')}
                            className="py-2 pl-2 pr-4 hidden md:table-cell"
                          />
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]">
                      {(() => {
                        const baseSides = [
                          { side: report.away, isAway: true },
                          { side: report.home, isAway: false },
                        ];
                        const quarterSides = quarterSortKey
                          ? sortRows(
                              baseSides,
                              ({ side, isAway }) => {
                                if (quarterSortKey === 'team') return side.name;
                                if (quarterSortKey === 'final') return side.score;
                                if (quarterSortKey === 'adv')
                                  return side.totals.offRtg;
                                if (quarterSortKey.startsWith('period_')) {
                                  const pNum = Number(
                                    quarterSortKey.replace('period_', '')
                                  );
                                  const found = report.periods.find(
                                    (x) => x.period === pNum
                                  );
                                  if (!found) return 0;
                                  return isAway ? found.awayScore : found.homeScore;
                                }
                                return side.score;
                              },
                              quarterSortAsc
                            )
                          : baseSides;
                        return quarterSides;
                      })().map(({ side, isAway }) => (
                        <tr key={side.abbr} className="hover:bg-[#182338]/60">
                          <td className="py-2.5 pl-4 pr-3 font-sans whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onInspectEntity('team', side.teamId);
                              }}
                              className="inline-flex items-center gap-2 text-left hover:text-orange-300 transition-colors"
                            >
                              <TeamLogo
                                abbr={side.abbr}
                                teamId={side.teamId}
                                size="xs"
                              />
                              <span
                                className={`font-mono text-xs font-bold ${
                                  side.isWinner
                                    ? 'text-orange-400'
                                    : 'text-slate-400'
                                }`}
                              >
                                {side.abbr}
                              </span>
                              <span
                                className={
                                  side.isWinner
                                    ? 'font-semibold text-slate-100'
                                    : 'text-slate-300'
                                }
                              >
                                {side.name}
                              </span>
                              <span className="font-mono text-[11px] text-slate-400">
                                ({side.recordAfter})
                              </span>
                            </button>
                          </td>
                          {report.periods.map((p) => {
                            const myQ = isAway ? p.awayScore : p.homeScore;
                            const oppQ = isAway ? p.homeScore : p.awayScore;
                            const wonQ = myQ > oppQ;
                            return (
                              <td
                                key={p.period}
                                className={`py-2.5 px-2.5 text-center ${
                                  wonQ
                                    ? 'font-semibold text-slate-100'
                                    : 'text-slate-400'
                                }`}
                              >
                                {myQ}
                              </td>
                            );
                          })}
                          <td
                            className={`py-2.5 px-3 text-right text-base sm:text-lg ${
                              side.isWinner
                                ? 'font-bold text-orange-400'
                                : 'font-semibold text-slate-300'
                            }`}
                          >
                            {side.score}
                          </td>
                          {experienceMode === 'advanced' && (
                            <td className="py-2.5 pl-2 pr-4 text-right text-xs text-slate-400 hidden md:table-cell whitespace-nowrap">
                              {side.totals.offRtg.toFixed(1)} ·{' '}
                              {side.totals.efgPct.toFixed(1)}%
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 3-TAB INTERACTIVE SWITCHER */}
              <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-xl overflow-x-auto no-scrollbar">
                {(
                  [
                    {
                      id: 'scouting',
                      label: '1. Crónica y Scouting',
                      icon: Newspaper,
                    },
                    {
                      id: 'headToHead',
                      label: '2. Estadísticas',
                      icon: Scale,
                    },
                    {
                      id: 'boxscore',
                      label: '3. Acta Oficial (Box Score)',
                      icon: FileSpreadsheet,
                    },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`min-h-[42px] sm:min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 flex-1 ${
                        active
                          ? 'bg-orange-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* TAB 1: EDITORIAL MAGAZINE LAYOUT */}
              {activeTab === 'scouting' && (
                <article className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg p-5 sm:p-7 space-y-7">
                  {loadingNarrative && !narrative ? (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2 text-xs text-orange-400">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>
                          Redactando crónica periodística e informe táctico de scouting...
                        </span>
                      </div>
                      <div className="space-y-2.5 animate-pulse max-w-3xl">
                        <div className="h-7 w-4/5 bg-[#1E293B] rounded" />
                        <div className="h-4 w-full bg-[#1E293B] rounded" />
                        <div className="h-4 w-10/12 bg-[#1E293B] rounded" />
                      </div>
                    </div>
                  ) : (
                    <>
                      {narrativeError && !narrative && (
                        <div className="bg-[#0B1120]/80 border border-rose-500/35 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <span className="text-rose-300">{narrativeError}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (!eventId) return;
                              const reqId = ++activeRequestIdRef.current;
                              fetchGameNarrativeOnly(eventId, true, reqId);
                            }}
                            className="min-h-[34px] px-3.5 py-1.5 font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap"
                          >
                            Reintentar crónica
                          </button>
                        </div>
                      )}

                      {/* EDITORIAL FRONT-PAGE MASTHEAD */}
                      {narrative && (
                        <header className="space-y-2.5 border-b border-[#1E293B] pb-4 sm:pb-5">
                          {/* Compact Mobile-Friendly Metadata Bar: Tipo, Hora y Tiempo */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs text-slate-300 font-mono">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30 font-sans">
                              <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-orange-400 shrink-0" />
                              <span className="hidden sm:inline">
                                {narrative.engineMode === 'gemini_search'
                                  ? 'Crónica Periodística con IA (Gemini)'
                                  : 'Crónica Determinista de Partido'}
                              </span>
                              <span className="sm:hidden">
                                {narrative.engineMode === 'gemini_search' ? 'Crónica IA' : 'Crónica Determinista'}
                              </span>

                              {narrative.engineMode !== 'gemini_search' && (
                                <span
                                  className="group/diag relative inline-flex items-center ml-0.5 cursor-help"
                                  tabIndex={0}
                                  aria-label="Motivo de la crónica determinista"
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-400 hover:text-amber-200 transition-colors shrink-0" />
                                  <span
                                    role="tooltip"
                                    className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 sm:w-80 p-2.5 rounded-lg bg-slate-900/95 text-slate-200 border border-amber-500/40 shadow-2xl text-[11px] leading-relaxed font-normal opacity-0 group-hover/diag:opacity-100 group-focus-within/diag:opacity-100 transition-opacity z-50 backdrop-blur-md"
                                  >
                                    <span className="block font-semibold text-amber-300 mb-1">
                                      {narrative.missingApiKey
                                        ? 'Falta GEMINI_API_KEY en el entorno'
                                        : narrative.quotaExhausted || narrative.fallbackReason === 'quota_exhausted_429'
                                        ? 'Límite de cuota diaria alcanzado (Free Tier)'
                                        : 'Agotado tiempo de respuesta de IA'}
                                    </span>
                                    {narrative.missingApiKey
                                      ? 'El backend no detecta la variable GEMINI_API_KEY en este entorno de ejecución.'
                                      : narrative.quotaExhausted || narrative.fallbackReason === 'quota_exhausted_429'
                                      ? 'Se alcanzó el límite diario de peticiones para este modelo Gemini en el Free Tier de Google AI Studio.'
                                      : 'La llamada a los modelos de Gemini agotó el tiempo de espera o la API no respondió a tiempo. Se muestra esta crónica determinista de respaldo sin pérdida de datos.'}
                                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900/95" />
                                  </span>
                                </span>
                              )}
                            </span>

                            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60">
                              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="hidden sm:inline">Hora: </span>
                              <span>
                                {new Date(narrative.generatedAt || Date.now()).toLocaleTimeString('es-ES', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </span>

                            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60">
                              <Zap className="w-3 h-3 text-orange-400 shrink-0" />
                              <span className="hidden sm:inline">Tiempo: </span>
                              <span>{narrative.generationTimeMs ? `${(narrative.generationTimeMs / 1000).toFixed(1)}s` : '0.9s'}</span>
                            </span>

                            <span className="hidden md:inline text-slate-400 font-mono text-[11px] ml-auto">
                              {report.arenaName}, {report.arenaCity} · {report.attendanceFormatted}
                            </span>
                          </div>

                          <h3 className="font-display text-xl sm:text-2xl lg:text-[26px] font-bold text-slate-100 leading-tight text-balance max-w-4xl">
                            {narrative.pressHeadline}
                          </h3>

                          <p className="text-sm sm:text-base text-slate-200 leading-relaxed w-full font-medium text-justify hyphens-auto">
                            {renderHighlightedInline(
                              narrative.pressLead,
                              gameHighlightEntities
                            )}
                          </p>
                        </header>
                      )}

                      {/* SECTION 01: GUION Y PUNTO DE QUIEBRE */}
                      {narrative && (
                        <section
                          id="match-sec-flow"
                          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                        >
                          <div className="lg:col-span-8 space-y-2.5">
                            <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                              01 · Desarrollo del Encuentro
                            </p>
                            <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                              Guion y Punto de Quiebre
                            </h4>
                            {renderEditorialParagraphs(narrative.gameFlowSection, {
                              dropCap: true,
                              highlightEntities: gameHighlightEntities,
                            })}
                          </div>

                          <aside className="lg:col-span-4 bg-[#0B1120]/80 border border-[#1E293B] rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
                              <span className="text-xs font-semibold text-slate-200">
                                Radiografía del Guion
                              </span>
                              <span className="font-mono tabular-nums text-[11px] text-orange-300">
                                {report.away.score}-{report.home.score}
                              </span>
                            </div>

                            <dl className="divide-y divide-[#1E293B]/70 text-xs">
                              <div className="py-2 flex items-center justify-between gap-2">
                                <dt className="text-slate-400">Tramo decisivo</dt>
                                <dd className="font-mono tabular-nums font-semibold text-orange-300 text-right">
                                  {report.decisivePeriodLabel}
                                </dd>
                              </div>
                              {report.leadChanges !== null && (
                                <div className="py-2 flex items-center justify-between gap-2">
                                  <dt className="text-slate-400">Cambios / Empates</dt>
                                  <dd className="font-mono tabular-nums text-slate-200">
                                    {report.leadChanges} líd. · {report.timesTied ?? 0} emp.
                                  </dd>
                                </div>
                              )}
                              <div className="pt-2 flex items-center justify-between gap-2">
                                <dt className="text-slate-400">Ritmo (Pace)</dt>
                                <dd className="font-mono tabular-nums text-slate-200">
                                  {report.away.totals.pace.toFixed(1)} pos.
                                </dd>
                              </div>
                            </dl>
                          </aside>
                        </section>
                      )}

                      {/* SECTION 02: PIZARRA, AJUSTES Y DEDICATED PARTE DE BAJAS E INCIDENCIAS CARD */}
                      {narrative && (
                        <section
                          id="match-sec-chalkboard"
                          className="pt-6 border-t border-[#1E293B] grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                        >
                          <div className="lg:col-span-8 space-y-3">
                            <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                              02 · Lectura Táctica del Scout
                            </p>
                            <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                              Pizarra, Ajustes y Rotación
                            </h4>
                            {renderEditorialParagraphs(narrative.chalkboardSection, {
                              highlightEntities: gameHighlightEntities,
                            })}
                            {narrative.dynamicSpotlight && (
                              <div className="pt-3 border-t border-[#1E293B]/70 space-y-1.5">
                                <h5 className="text-sm font-semibold text-orange-300">
                                  Foco Especial · {narrative.dynamicSpotlight.title}
                                </h5>
                                {renderEditorialParagraphs(
                                  narrative.dynamicSpotlight.body,
                                  {
                                    highlightEntities: gameHighlightEntities,
                                  }
                                )}
                              </div>
                            )}
                          </div>

                          {/* Dedicated Side Card: Parte de Bajas, Lesiones vs Decisión Técnica e Incidencias */}
                          <aside className="lg:col-span-4 bg-[#0B1120]/80 border border-[#1E293B] rounded-lg p-4 space-y-3">
                            <div className="space-y-1.5 border-b border-[#1E293B] pb-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-100">
                                  Parte de Bajas e Incidencias
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                                  Acta NBA oficial
                                </span>
                              </div>

                              {allIncidencesAndAbsences.length > 0 && (
                                <p className="text-[11px] font-mono tabular-nums text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                  {absenceSummary.injuredOrMedicalCount > 0 && (
                                    <span className="text-rose-400 font-medium">
                                      {absenceSummary.injuredOrMedicalCount}{' '}
                                      {absenceSummary.injuredOrMedicalCount === 1
                                        ? 'lesionado'
                                        : 'lesionados'}
                                    </span>
                                  )}
                                  {absenceSummary.foulOutCount > 0 && (
                                    <>
                                      {absenceSummary.injuredOrMedicalCount > 0 && (
                                        <span aria-hidden="true">·</span>
                                      )}
                                      <span className="text-orange-400 font-medium">
                                        {absenceSummary.foulOutCount}{' '}
                                        {absenceSummary.foulOutCount === 1
                                          ? 'expulsado'
                                          : 'expulsados'}
                                      </span>
                                    </>
                                  )}
                                  {absenceSummary.inGameSetbackCount > 0 && (
                                    <>
                                      {(absenceSummary.injuredOrMedicalCount > 0 ||
                                        absenceSummary.foulOutCount > 0) && (
                                        <span aria-hidden="true">·</span>
                                      )}
                                      <span className="text-amber-300 font-medium">
                                        {absenceSummary.inGameSetbackCount}{' '}
                                        {absenceSummary.inGameSetbackCount === 1
                                          ? 'percance en pista'
                                          : 'percances en pista'}
                                      </span>
                                    </>
                                  )}
                                  {absenceSummary.restOrOtherCount > 0 && (
                                    <>
                                      {(absenceSummary.injuredOrMedicalCount > 0 ||
                                        absenceSummary.inGameCount > 0) && (
                                        <span aria-hidden="true">·</span>
                                      )}
                                      <span className="text-amber-300">
                                        {absenceSummary.restOrOtherCount} descanso/otros
                                      </span>
                                    </>
                                  )}
                                  {absenceSummary.technicalCount > 0 && (
                                    <>
                                      {(absenceSummary.injuredOrMedicalCount > 0 ||
                                        absenceSummary.inGameCount > 0 ||
                                        absenceSummary.restOrOtherCount > 0) && (
                                        <span aria-hidden="true">·</span>
                                      )}
                                      <span className="text-slate-400">
                                        {absenceSummary.technicalCount} decisión técnica
                                      </span>
                                    </>
                                  )}
                                </p>
                              )}
                            </div>

                            {allIncidencesAndAbsences.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg">
                                {(
                                  [
                                    {
                                      id: 'all',
                                      label: `Todas (${allIncidencesAndAbsences.length})`,
                                    },
                                    {
                                      id: 'injury',
                                      label: `Lesión (${absenceSummary.medicalOnlyTotal})`,
                                    },
                                    {
                                      id: 'in_game',
                                      label: `${
                                        absenceSummary.inGameSetbackCount === 0 &&
                                        absenceSummary.foulOutCount > 0
                                          ? 'Expulsados'
                                          : 'En pista'
                                      } (${absenceSummary.inGameCount})`,
                                    },
                                    {
                                      id: 'technical',
                                      label: `Dec. técnica (${absenceSummary.technicalCount})`,
                                    },
                                  ] as const
                                ).map((tab) => (
                                  <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setAbsenceFilter(tab.id)}
                                    className={`flex-1 min-h-[28px] px-1.5 py-0.5 text-[10.5px] sm:text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                                      absenceFilter === tab.id
                                        ? 'bg-orange-500 text-slate-950 font-semibold'
                                        : 'text-slate-300 hover:text-white'
                                    }`}
                                  >
                                    {tab.label}
                                  </button>
                                ))}
                              </div>
                            )}

                            {allIncidencesAndAbsences.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">
                                Sin bajas médicas, descartes técnicos ni incidencias en pista registrados en este encuentro.
                              </p>
                            ) : absenceSummary.filtered.length === 0 ? (
                              <div className="space-y-1.5 text-xs text-slate-400">
                                <p className="italic">
                                  {absenceFilter === 'injury'
                                    ? 'Sin bajas médicas ni descansos registrados en este encuentro.'
                                    : absenceFilter === 'in_game'
                                      ? 'Sin expulsados por faltas ni percances físicos en pista en este encuentro.'
                                      : 'Sin jugadores en esta categoría para este partido.'}
                                </p>
                                {absenceFilter !== 'all' && (
                                  <button
                                    type="button"
                                    onClick={() => setAbsenceFilter('all')}
                                    className="text-[11px] font-medium text-orange-400 hover:text-orange-300 underline underline-offset-2 transition-colors"
                                  >
                                    Ver todas las incidencias ({allIncidencesAndAbsences.length})
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                                {absenceSummary.filtered.map(({ teamAbbr, item }, idx) => {
                                  const meta = getAbsenceStatusMeta(item);
                                  const detailNote = formatAbsenceDetailNote(item);
                                  return (
                                    <div
                                      key={`${teamAbbr}-${item.jersey}-${item.name}-${idx}`}
                                      onClick={() => {
                                        if (item.playerId) {
                                          onClose();
                                          onInspectEntity('player', item.playerId);
                                        }
                                      }}
                                      className={`p-2.5 rounded border text-xs transition-colors ${
                                        meta.cardClass
                                      } ${
                                        item.playerId
                                          ? 'cursor-pointer hover:border-orange-500/40'
                                          : ''
                                      }`}
                                    >
                                      <div className="flex items-start gap-2.5">
                                        <div className="mt-0.5 shrink-0">
                                          <PlayerAvatar
                                            playerId={item.playerId}
                                            name={item.name}
                                            teamAbbr={teamAbbr}
                                            size="xs"
                                          />
                                        </div>

                                        <div className="min-w-0 flex-1 space-y-1">
                                          <div className="flex items-baseline justify-between gap-2">
                                            <p className="min-w-0 text-xs font-semibold text-slate-100 leading-snug break-words">
                                              <span className="font-mono tabular-nums text-slate-400 mr-1">
                                                #{item.jersey}
                                              </span>
                                              <span>{item.name}</span>
                                            </p>
                                            <span className="font-mono text-[10px] font-bold text-orange-400 shrink-0">
                                              {teamAbbr}
                                            </span>
                                          </div>

                                          <p className="text-[11px] leading-snug">
                                            <span
                                              className={`font-semibold ${meta.textClass}`}
                                            >
                                              {meta.label}
                                            </span>
                                            {detailNote && (
                                              <>
                                                <span
                                                  className="text-slate-500 mx-1.5"
                                                  aria-hidden="true"
                                                >
                                                  ·
                                                </span>
                                                <span
                                                  className={
                                                    meta.isTechnical
                                                      ? 'text-slate-400'
                                                      : 'text-slate-300'
                                                  }
                                                >
                                                  {detailNote}
                                                </span>
                                              </>
                                            )}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </aside>
                        </section>
                      )}

                      {/* SECTION 03: FACTOR X Y DUELO DE LÍDERES */}
                      {narrative && (
                        <section
                          id="match-sec-xfactor"
                          className="pt-6 border-t border-[#1E293B] grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                        >
                          <div className="lg:col-span-8 space-y-2.5">
                            <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                              03 · Protagonistas en Pista
                            </p>
                            <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                              Factor X y Duelo de Líderes
                            </h4>
                            {renderEditorialParagraphs(narrative.xFactorSection, {
                              highlightEntities: gameHighlightEntities,
                            })}
                          </div>

                          <aside className="lg:col-span-4 bg-[#0B1120]/80 border border-[#1E293B] rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
                              <span className="text-xs font-semibold text-slate-200">
                                Referencias del Partido
                              </span>
                            </div>

                            <div className="divide-y divide-[#1E293B]/70">
                              {[
                                {
                                  role: `Líder ${report.away.abbr}`,
                                  teamAbbr: report.away.abbr,
                                  entry: report.away.podium[0],
                                },
                                {
                                  role: `Líder ${report.home.abbr}`,
                                  teamAbbr: report.home.abbr,
                                  entry: report.home.podium[0],
                                },
                              ]
                                .filter((item) => Boolean(item.entry))
                                .map(({ role, teamAbbr, entry }) => (
                                  <div
                                    key={`${role}-${entry.playerId}`}
                                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onClose();
                                        onInspectEntity('player', entry.playerId);
                                      }}
                                      className="flex items-center gap-2.5 min-w-0 text-left hover:text-orange-300 transition-colors"
                                    >
                                      <PlayerAvatar
                                        playerId={entry.playerId}
                                        name={entry.name}
                                        teamAbbr={teamAbbr}
                                        showTeamBadge
                                        size="sm"
                                      />
                                      <div className="min-w-0">
                                        <p className="text-[11px] text-slate-400">{role}</p>
                                        <p className="text-xs font-semibold text-slate-100 leading-snug break-words">
                                          <span className="font-mono text-orange-300 mr-1">
                                            #{entry.jersey}
                                          </span>
                                          {entry.name}
                                        </p>
                                        <p className="font-mono tabular-nums text-[11px] text-slate-300">
                                          {entry.points} PTS · {entry.rebounds} REB · {entry.assists} AST
                                        </p>
                                      </div>
                                    </button>
                                  </div>
                                ))}
                            </div>
                          </aside>
                        </section>
                      )}

                      {/* SECTION 04: ESPAÑOLES (Clean Paragraphs/Cards per Player) */}
                      <section
                        id="match-sec-spanish"
                        className="pt-6 border-t border-[#1E293B] space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                              04 · Radar Español
                            </p>
                            <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                              Españoles
                            </h4>
                          </div>
                          {report.spanishPlayersReport.hasSpanishPlayers && (
                            <span className="text-xs font-medium text-amber-300">
                              Presencia española registrada en acta
                            </span>
                          )}
                        </div>

                        {report.spanishPlayersReport.details.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {report.spanishPlayersReport.details.map((sp) => (
                              <button
                                key={sp.playerId}
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onInspectEntity('player', sp.playerId);
                                }}
                                className="p-3.5 rounded-lg border border-[#1E293B] bg-[#0B1120]/80 hover:border-orange-500/50 text-left transition-colors space-y-1 block w-full"
                              >
                                <div className="flex items-start gap-2.5">
                                  <PlayerAvatar
                                    playerId={sp.playerId}
                                    name={sp.name}
                                    teamAbbr={sp.teamAbbr}
                                    showTeamBadge
                                    size="sm"
                                  />
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <p className="min-w-0 text-xs font-bold text-slate-100 leading-snug break-words">
                                        <span className="font-mono text-orange-300 mr-1">
                                          #{sp.jersey}
                                        </span>
                                        {sp.name} ({sp.teamAbbr})
                                      </p>
                                      <span className="text-[10px] font-semibold text-amber-300 shrink-0">
                                        {sp.played ? 'Participó' : 'Sin MIN'}
                                      </span>
                                    </div>
                                    <p className="font-mono tabular-nums text-xs text-slate-300 leading-relaxed">
                                      {sp.lineSummary}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          renderEditorialParagraphs(
                            narrative?.spanishSection || report.spanishPlayersReport.summaryLine,
                            { highlightEntities: gameHighlightEntities }
                          )
                        )}
                      </section>
                    </>
                  )}

                  {/* SECTION 05: HITOS, VEREDICTO Y PODIO */}
                  <section
                    id="match-sec-podium"
                    className="pt-6 border-t border-[#1E293B] space-y-5"
                  >
                    <div>
                      <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                        05 · Cierre y Valoraciones Oficiales
                      </p>
                      <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                        Hitos, Veredicto del Scout y Podio del Partido
                      </h4>
                    </div>

                    {narrative &&
                      renderEditorialParagraphs(narrative.verdictSection, {
                        highlightEntities: gameHighlightEntities,
                      })}

                    {/* VISUAL 3-COLUMN STAR PODIUM */}
                    <div className="space-y-4 pt-1">
                      {[report.away, report.home].map((side) => (
                        <div key={side.abbr} className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="inline-flex items-center gap-2 font-semibold text-slate-100">
                              <TeamLogo
                                abbr={side.abbr}
                                teamId={side.teamId}
                                size="xs"
                              />
                              <span>
                                Podio {side.name} ({side.abbr})
                              </span>
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {side.podium.map((p) => (
                              <button
                                key={p.playerId}
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onInspectEntity('player', p.playerId);
                                }}
                                className="rounded-lg border p-3.5 bg-[#0F172A] hover:bg-[#182338] border-[#1E293B] hover:border-orange-500/40 text-left transition-colors flex flex-col justify-between gap-2.5"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <PlayerAvatar
                                    playerId={p.playerId}
                                    name={p.name}
                                    teamAbbr={side.abbr}
                                    showTeamBadge
                                    size="sm"
                                  />
                                  <div className="min-w-0">
                                    <span className="block text-[11px] font-medium text-amber-300">
                                      {'⭐'.repeat(p.stars)} Estrella
                                    </span>
                                    <p className="text-sm font-bold text-slate-100 truncate">
                                      #{p.jersey} {p.name}
                                    </p>
                                  </div>
                                </div>
                                <p className="font-mono tabular-nums text-xs text-slate-200">
                                  {p.points}P · {p.rebounds}R · {p.assists}A ({p.gameScore.toFixed(1)} GmSc)
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* SECTION 06: PRÓXIMOS PARTIDOS (Balance, Posición Conferencia, Racha W-L, Rival, Día/Hora y Estadio) */}
                  <section
                    id="match-sec-next-games"
                    className="pt-6 border-t border-[#1E293B] space-y-4"
                  >
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                          06 · Próximos partidos
                        </p>
                        <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                          Clasificación tras el Encuentro y Siguiente Cita Oficial
                        </h4>
                      </div>
                      <span className="text-xs text-slate-400 font-mono tabular-nums">
                        Balance · Conferencia · Racha · Calendario NBA
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {(
                        [
                          { side: report.away, role: 'Visitante' },
                          { side: report.home, role: 'Local' },
                        ] as const
                      ).map(({ side, role }) => {
                        const ng = side.nextGame;
                        const isWinStreak = ng.streakCode.startsWith('W');
                        const isLossStreak = ng.streakCode.startsWith('L');
                        const arenaFull = ng.arenaName
                          ? `${ng.arenaName}${ng.arenaCity ? `, ${ng.arenaCity}` : ''}`
                          : 'Pabellón oficial por confirmar';

                        return (
                          <div
                            key={`next-${side.abbr}`}
                            className="bg-[#0F172A] border border-[#1E293B] rounded-lg overflow-hidden flex flex-col justify-between"
                          >
                            {/* Team Header */}
                            <div className="px-4 py-3 flex items-center justify-between gap-2 bg-[#0B1120]/65 border-b border-[#1E293B]">
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onInspectEntity('team', side.teamId);
                                }}
                                className="inline-flex items-center gap-2.5 min-w-0 text-left hover:text-orange-300 transition-colors"
                              >
                                <TeamLogo
                                  abbr={side.abbr}
                                  teamId={side.teamId}
                                  size="sm"
                                  framed
                                />
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-100 truncate">
                                    {side.name}
                                  </p>
                                  <p className="text-[11px] text-slate-400 font-mono">
                                    {side.abbr} · {role}
                                  </p>
                                </div>
                              </button>

                              <span
                                className={`text-xs font-semibold ${
                                  side.isWinner
                                    ? 'text-emerald-400'
                                    : 'text-slate-400'
                                }`}
                              >
                                {side.isWinner ? 'Victoria hoy' : 'Derrota hoy'}
                              </span>
                            </div>

                            {/* 4-Metric Standings, Streak & Rest/Fatigue Strip */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[#1E293B] border-b border-[#1E293B] bg-[#131C2E]/60">
                              <div className="px-2.5 py-2.5 text-center">
                                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                                  Balance V-D
                                </p>
                                <p className="mt-0.5 font-mono tabular-nums text-sm font-bold text-slate-100">
                                  {ng.record}
                                </p>
                              </div>
                              <div className="px-2.5 py-2.5 text-center">
                                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                                  Tabla Conf.
                                </p>
                                <p className="mt-0.5 font-mono tabular-nums text-sm font-bold text-orange-300">
                                  {ng.conferenceRank}º {ng.conference}
                                </p>
                              </div>
                              <div className="px-2.5 py-2.5 text-center">
                                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                                  Racha W-L
                                </p>
                                <p
                                  className={`mt-0.5 font-mono tabular-nums text-sm font-bold ${
                                    isWinStreak
                                      ? 'text-emerald-400'
                                      : isLossStreak
                                      ? 'text-rose-400'
                                      : 'text-slate-200'
                                  }`}
                                >
                                  {ng.streakCode}
                                </p>
                              </div>
                              <div className="px-2.5 py-2.5 text-center">
                                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                                  Descanso
                                </p>
                                <p
                                  className={`mt-0.5 font-mono tabular-nums text-sm font-bold whitespace-nowrap ${
                                    ng.fatigueTone === 'rose'
                                      ? 'text-rose-400'
                                      : ng.fatigueTone === 'emerald'
                                      ? 'text-emerald-400'
                                      : 'text-slate-200'
                                  }`}
                                >
                                  {ng.fatigueShort || '—'}
                                </p>
                              </div>
                            </div>

                            {/* Next Opponent, Date/Time, Arena & Fatigue */}
                            <div className="p-4 space-y-2.5 text-xs">
                              {ng.hasScheduledGame ? (
                                <>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">
                                      Próximo rival
                                    </span>
                                    <span
                                      className={`text-[11px] font-semibold ${
                                        ng.isHome
                                          ? 'text-emerald-400'
                                          : 'text-sky-300'
                                      }`}
                                    >
                                      {ng.isHome
                                        ? 'Factor cancha (Local)'
                                        : 'Gira exterior (Visitante)'}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-3 py-1">
                                    {ng.opponentTeamId ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onClose();
                                          onInspectEntity(
                                            'team',
                                            ng.opponentTeamId!
                                          );
                                        }}
                                        className="inline-flex items-center gap-2.5 min-w-0 text-left hover:text-orange-300 transition-colors"
                                      >
                                        <TeamLogo
                                          abbr={ng.opponentAbbr}
                                          teamId={ng.opponentTeamId}
                                          size="sm"
                                          framed
                                        />
                                        <div className="min-w-0">
                                          <p className="text-sm font-bold text-slate-100 truncate">
                                            <span className="font-mono text-orange-400 mr-1.5">
                                              {ng.isHome ? 'vs' : '@'}
                                            </span>
                                            {ng.opponentName}
                                          </p>
                                          <p className="text-[11px] font-mono text-slate-400">
                                            {side.abbr} {ng.isHome ? 'vs' : '@'}{' '}
                                            {ng.opponentAbbr}
                                          </p>
                                        </div>
                                      </button>
                                    ) : (
                                      <div className="inline-flex items-center gap-2.5 min-w-0">
                                        {ng.opponentAbbr && (
                                          <TeamLogo
                                            abbr={ng.opponentAbbr}
                                            size="sm"
                                            framed
                                          />
                                        )}
                                        <div className="min-w-0">
                                          <p className="text-sm font-bold text-slate-100 truncate">
                                            <span className="font-mono text-orange-400 mr-1.5">
                                              {ng.isHome ? 'vs' : '@'}
                                            </span>
                                            {ng.opponentName}
                                          </p>
                                          <p className="text-[11px] font-mono text-slate-400">
                                            {side.abbr} {ng.isHome ? 'vs' : '@'}{' '}
                                            {ng.opponentAbbr}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className="pt-2 border-t border-[#1E293B]/80 space-y-1.5 text-xs text-slate-300">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                      <span className="font-medium text-slate-200">
                                        {ng.dateFormatted}
                                      </span>
                                      <span aria-hidden="true" className="text-slate-500">
                                        ·
                                      </span>
                                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span className="font-mono tabular-nums text-slate-300">
                                        {ng.timeFormatted}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-300">
                                      <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                      <span className="truncate">{arenaFull}</span>
                                    </div>
                                    {ng.fatigueDetail && (
                                      <div className="flex items-center gap-2">
                                        <Activity
                                          className={`w-3.5 h-3.5 shrink-0 ${
                                            ng.isBackToBackNext
                                              ? 'text-rose-400'
                                              : ng.fatigueTone === 'emerald'
                                              ? 'text-emerald-400'
                                              : 'text-slate-400'
                                          }`}
                                        />
                                        <span
                                          className={
                                            ng.isBackToBackNext
                                              ? 'font-semibold text-rose-400'
                                              : ng.fatigueTone === 'emerald'
                                              ? 'text-emerald-400 font-medium'
                                              : 'text-slate-300'
                                          }
                                        >
                                          {ng.isBackToBackNext
                                            ? `Fatiga: ${ng.fatigueDetail}`
                                            : `Descanso: ${ng.fatigueDetail}`}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className="py-2 space-y-1.5 text-slate-400">
                                  <p className="font-semibold text-slate-300">
                                    {ng.opponentName}
                                  </p>
                                  <p className="text-[11px]">
                                    {ng.dateFormatted}
                                    {arenaFull ? ` · Sede base: ${arenaFull}` : ''}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </article>
              )}

              {/* TAB 2: ESTADÍSTICAS (3-WAY VIEW TOGGLE + 23 METRICS IN 3 SECTIONS + 16 LEADERS) */}
              {activeTab === 'headToHead' && (
                <div className="space-y-6">
                  {/* Style Mode Switcher Header + Team Color Pulse Legend */}
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-100">
                        04. Estadísticas del Partido (23 métricas colectivas)
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
                        <span>Pulso por colores oficiales y línea central de equilibrio (50%)</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-200">
                          <span
                            aria-hidden="true"
                            className="w-2.5 h-2.5 rounded-xs ring-1 ring-white/20"
                            style={{ backgroundColor: matchupColors.awayColor }}
                          />
                          <span>{report.away.abbr}</span>
                          <span className="text-slate-500">| 50% |</span>
                          <span
                            aria-hidden="true"
                            className="w-2.5 h-2.5 rounded-xs ring-1 ring-white/20"
                            style={{ backgroundColor: matchupColors.homeColor }}
                          />
                          <span>{report.home.abbr}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-[#0B1120] p-1 rounded-lg border border-[#1E293B]">
                      <button
                        type="button"
                        onClick={() => handleSetStatsViewStyle('table_bars')}
                        className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                          statsViewStyle === 'table_bars'
                            ? 'bg-orange-500 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Tabla + Barras
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetStatsViewStyle('table_clean')}
                        className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                          statsViewStyle === 'table_clean'
                            ? 'bg-orange-500 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Tabla limpia
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetStatsViewStyle('bars_tv')}
                        className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                          statsViewStyle === 'bars_tv'
                            ? 'bg-orange-500 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Barras TV
                      </button>
                    </div>
                  </div>

                  {/* 3 Grouped Sections (Concentrated spacing) */}
                  <div className="space-y-4">
                    {renderTeamStatsSection('scoring', '01. Anotación y Tiro', scoringShootingRows)}
                    {renderTeamStatsSection('efficiency', '02. Eficiencia y Pizarra Táctica', efficiencyTacticsRows)}
                    {renderTeamStatsSection('rebDef', '03. Rebote, Creación, Defensa y Disciplina', rebDefenseRows)}
                  </div>

                  {/* Punto 5: CARA A CARA LÍDERES INDIVIDUALES (17 CATEGORÍAS ORDENADAS + DUELO VISUAL) */}
                  <section className="space-y-3.5 pt-4 border-t border-[#1E293B]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm sm:text-base font-bold text-slate-100">
                            05. Cara a Cara: Líderes Individuales (17 categorías)
                          </h3>
                          <MetricInfoTooltip
                            helpKey="matchAdvantageDelta"
                            align="left"
                            iconClassName="w-3.5 h-3.5"
                          />
                        </div>
                        <p className="text-xs text-slate-400">
                          Duelo directo entre el mejor registro individual de cada plantilla categoría a categoría
                        </p>
                      </div>

                      {/* Interactive Filter Controls */}
                      <div className="flex flex-wrap items-center gap-1 bg-[#131C2E] p-1 rounded-lg border border-[#1E293B]">
                        {(
                          [
                            {
                              id: 'all',
                              label: `Todas (${report.leaderComparisonRows.length})`,
                            },
                            {
                              id: 'away',
                              label: `Domina ${report.away.abbr} (${leaderSummary.awayWins})`,
                            },
                            {
                              id: 'home',
                              label: `Domina ${report.home.abbr} (${leaderSummary.homeWins})`,
                            },
                            ...(leaderSummary.eliteRowsCount > 0
                              ? [
                                  {
                                    id: 'elite' as const,
                                    label: `★ Élite (${leaderSummary.eliteRowsCount})`,
                                  },
                                ]
                              : []),
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setLeaderFilter(f.id)}
                            className={`min-h-[30px] px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                              leaderFilter === f.id
                                ? 'bg-orange-500 text-slate-950 font-semibold'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tactical Value-Add Strip: Category Scoreboard + Multi-Category Leaders + Elite Count */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
                      {/* Card 1: Category Duel Scoreboard */}
                      <div className="lg:col-span-5 bg-[#131C2E] border border-[#1E293B] rounded-lg p-2.5 sm:p-3 flex flex-col justify-between gap-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-200 uppercase tracking-wide">
                            Pulso de Categorías Ganadas
                          </span>
                          {leaderSummary.ties > 0 && (
                            <span className="font-mono tabular-nums">
                              {leaderSummary.ties}{' '}
                              {leaderSummary.ties === 1 ? 'empate' : 'empates'}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2">
                            <TeamLogo
                              abbr={report.away.abbr}
                              teamId={report.away.teamId}
                              size="sm"
                            />
                            <span className="font-mono text-xs font-semibold text-slate-300">
                              {report.away.abbr}
                            </span>
                            <span
                              className={`font-mono tabular-nums text-base sm:text-lg font-bold ${
                                leaderSummary.awayWins > leaderSummary.homeWins
                                  ? 'text-emerald-400'
                                  : 'text-slate-200'
                              }`}
                            >
                              {leaderSummary.awayWins}
                            </span>
                          </div>

                          <div className="flex-1">
                            {(() => {
                              const split = computeLeaderBarSplit(
                                leaderSummary.awayWins,
                                leaderSummary.homeWins
                              );
                              const catBetter: 'away' | 'home' | 'tie' =
                                leaderSummary.awayWins > leaderSummary.homeWins
                                  ? 'away'
                                  : leaderSummary.homeWins > leaderSummary.awayWins
                                  ? 'home'
                                  : 'tie';
                              return (
                                <MatchupPulseBar
                                  awayPct={split.awayPct}
                                  homePct={split.homePct}
                                  awayColor={matchupColors.awayColor}
                                  homeColor={matchupColors.homeColor}
                                  betterSide={catBetter}
                                  size="sm"
                                  title={`${report.away.abbr} ${leaderSummary.awayWins} cat. (${split.awayPct}%) vs ${report.home.abbr} ${leaderSummary.homeWins} cat. (${split.homePct}%) · Línea central: 50%`}
                                />
                              );
                            })()}
                          </div>

                          <div className="inline-flex items-center gap-2">
                            <span
                              className={`font-mono tabular-nums text-base sm:text-lg font-bold ${
                                leaderSummary.homeWins > leaderSummary.awayWins
                                  ? 'text-emerald-400'
                                  : 'text-slate-200'
                              }`}
                            >
                              {leaderSummary.homeWins}
                            </span>
                            <span className="font-mono text-xs font-semibold text-slate-300">
                              {report.home.abbr}
                            </span>
                            <TeamLogo
                              abbr={report.home.abbr}
                              teamId={report.home.teamId}
                              size="sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Card 2: Multi-Category Monopolizers ("Acaparadores de Categorías") */}
                      <div className="lg:col-span-7 bg-[#131C2E] border border-[#1E293B] rounded-lg p-2.5 sm:p-3 flex flex-col justify-between gap-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-200 uppercase tracking-wide">
                            Acaparadores de Liderazgos por Plantilla
                          </span>
                          <span className="font-mono tabular-nums text-amber-300">
                            ★ Élite: {leaderSummary.awayEliteCount}{' '}
                            {report.away.abbr} · {leaderSummary.homeEliteCount}{' '}
                            {report.home.abbr}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {[
                            {
                              abbr: report.away.abbr,
                              collector: leaderSummary.topAwayCollector,
                            },
                            {
                              abbr: report.home.abbr,
                              collector: leaderSummary.topHomeCollector,
                            },
                          ].map(({ abbr, collector }) =>
                            collector ? (
                              <button
                                key={`col-${abbr}-${collector.playerId}`}
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onInspectEntity('player', collector.playerId);
                                }}
                                className="px-2.5 py-1.5 rounded border border-[#1E293B] bg-[#0B1120]/70 hover:border-orange-500/40 flex items-center justify-between gap-2 text-left transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <PlayerAvatar
                                    playerId={collector.playerId}
                                    name={collector.name}
                                    teamAbbr={abbr}
                                    size="xs"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-100 truncate">
                                      <span className="font-mono text-orange-300 mr-1">
                                        #{collector.jersey}
                                      </span>
                                      {collector.shortName}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate">
                                      {abbr} · {collector.categories.slice(0, 3).join(', ')}
                                    </p>
                                  </div>
                                </div>
                                <span className="font-mono tabular-nums text-xs font-bold text-orange-400 shrink-0">
                                  Líder en {collector.count} cat.
                                </span>
                              </button>
                            ) : null
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Full-Width Zero-Horizontal-Scroll 4-Column Duel Table (Stacked Stat + Average, Concentrated Height) */}
                    <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden">
                      {/* Compact Mobile View (<md) */}
                      <div className="md:hidden divide-y divide-[#1E293B]">
                        {filteredLeaderRows.map(({ row, ordinal }, idx) => {
                          const prevGroup =
                            idx > 0
                              ? filteredLeaderRows[idx - 1].row.groupLabel
                              : null;
                          const showGroupDivider =
                            leaderFilter === 'all' &&
                            Boolean(row.groupLabel) &&
                            row.groupLabel !== prevGroup;

                          const awayWon = row.betterSide === 'away';
                          const homeWon = row.betterSide === 'home';
                          const split = computeLeaderBarSplit(
                            row.awayValue,
                            row.homeValue,
                            row.lowerIsBetter
                          );

                          const awayNameDisplay =
                            row.awayShortName ||
                            row.awayFormatted
                              .replace(/^#\d+\s*/, '')
                              .replace(/\s*\(.*\)$/, '');
                          const homeNameDisplay =
                            row.homeShortName ||
                            row.homeFormatted
                              .replace(/^#\d+\s*/, '')
                              .replace(/\s*\(.*\)$/, '');
                          const awayStatText =
                            row.awayStatDisplay ||
                            (row.awayFormatted.match(/\(([^)]+)\)/)?.[1] ??
                              `${row.awayValue}`);
                          const homeStatText =
                            row.homeStatDisplay ||
                            (row.homeFormatted.match(/\(([^)]+)\)/)?.[1] ??
                              `${row.homeValue}`);

                          return (
                            <Fragment key={`mob-${row.categoryKey}`}>
                              {showGroupDivider && (
                                <div className="bg-[#0B1120]/85 px-3 py-1 text-[10px] font-bold tracking-wider uppercase text-orange-400">
                                  {row.groupLabel}
                                </div>
                              )}
                              <div className="px-3 py-2 space-y-1.5">
                                <div className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="inline-flex items-center gap-1.5 min-w-0">
                                    <span className="font-mono tabular-nums text-[10px] text-slate-500">
                                      {String(ordinal).padStart(2, '0')}
                                    </span>
                                    <span className="font-medium text-slate-100 truncate">
                                      {row.categoryLabel}
                                    </span>
                                    {row.helpKey && (
                                      <MetricInfoTooltip
                                        helpKey={row.helpKey}
                                        align="left"
                                        iconClassName="w-3 h-3 shrink-0"
                                      />
                                    )}
                                  </span>
                                  <span
                                    className={`font-mono tabular-nums text-[10px] shrink-0 ${
                                      row.betterSide === 'tie'
                                        ? 'text-slate-400'
                                        : 'font-semibold text-orange-300'
                                    }`}
                                  >
                                    {row.diffDisplay || 'Igualado'}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      onInspectEntity('player', row.awayPlayerId);
                                    }}
                                    className={`px-2 py-1 rounded border border-[#1E293B] flex items-center justify-between gap-1.5 text-left min-w-0 ${
                                      awayWon
                                        ? 'bg-orange-500/[0.08]'
                                        : 'bg-[#0B1120]/45'
                                    }`}
                                  >
                                    <span className="inline-flex items-center gap-1.5 min-w-0">
                                      <PlayerAvatar
                                        playerId={row.awayPlayerId}
                                        name={row.awayPlayerName || awayNameDisplay}
                                        teamAbbr={report.away.abbr}
                                        size="xs"
                                      />
                                      <span className="truncate text-[11px] font-medium text-slate-200">
                                        {awayNameDisplay}
                                      </span>
                                    </span>
                                    <span className="flex flex-col items-end leading-none shrink-0">
                                      <span
                                        className={`font-mono tabular-nums text-xs ${
                                          awayWon
                                            ? 'font-bold text-emerald-400'
                                            : 'text-slate-300'
                                        }`}
                                      >
                                        {row.awayIsElite ? '★ ' : ''}
                                        {awayStatText}
                                      </span>
                                      {row.awayDeltaDisplay && (
                                        <span className="mt-0.5 font-mono tabular-nums text-[9px] text-slate-400">
                                          {row.awayDeltaDisplay}
                                        </span>
                                      )}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      onInspectEntity('player', row.homePlayerId);
                                    }}
                                    className={`px-2 py-1 rounded border border-[#1E293B] flex items-center justify-between gap-1.5 text-left min-w-0 ${
                                      homeWon
                                        ? 'bg-orange-500/[0.08]'
                                        : 'bg-[#0B1120]/45'
                                    }`}
                                  >
                                    <span className="inline-flex items-center gap-1.5 min-w-0">
                                      <PlayerAvatar
                                        playerId={row.homePlayerId}
                                        name={row.homePlayerName || homeNameDisplay}
                                        teamAbbr={report.home.abbr}
                                        size="xs"
                                      />
                                      <span className="truncate text-[11px] font-medium text-slate-200">
                                        {homeNameDisplay}
                                      </span>
                                    </span>
                                    <span className="flex flex-col items-end leading-none shrink-0">
                                      <span
                                        className={`font-mono tabular-nums text-xs ${
                                          homeWon
                                            ? 'font-bold text-emerald-400'
                                            : 'text-slate-300'
                                        }`}
                                      >
                                        {row.homeIsElite ? '★ ' : ''}
                                        {homeStatText}
                                      </span>
                                      {row.homeDeltaDisplay && (
                                        <span className="mt-0.5 font-mono tabular-nums text-[9px] text-slate-400">
                                          {row.homeDeltaDisplay}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                </div>

                                {statsViewStyle !== 'table_clean' && (
                                  <MatchupPulseBar
                                    awayPct={split.awayPct}
                                    homePct={split.homePct}
                                    awayColor={matchupColors.awayColor}
                                    homeColor={matchupColors.homeColor}
                                    betterSide={row.betterSide}
                                    size="xs"
                                    title={`${report.away.abbr} ${awayStatText} (${split.awayPct}%) vs ${report.home.abbr} ${homeStatText} (${split.homePct}%) · Línea central: 50%`}
                                  />
                                )}
                              </div>
                            </Fragment>
                          );
                        })}
                      </div>

                      {/* Desktop & Tablet Full-Width Table (md+) */}
                      <div className="hidden md:block overflow-auto max-h-[62vh]">
                        <table className="w-full table-fixed text-left border-collapse text-xs">
                          <colgroup>
                            <col className="w-[22%]" />
                            <col className="w-[32.5%]" />
                            <col className="w-[13%]" />
                            <col className="w-[32.5%]" />
                          </colgroup>
                          <thead className={STICKY_THEAD_CLASS}>
                            <tr className="border-b border-[#1E293B] text-[11px] text-slate-400">
                              <SortableTh
                                label="Categoría"
                                align="left"
                                compact
                                active={leaderSortKey === 'category'}
                                asc={leaderSortAsc}
                                onSort={() => toggleLeaderSort('category')}
                                className="py-1.5 pl-3 pr-2"
                              />
                              <SortableTh
                                label={
                                  <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                                    <TeamLogo
                                      abbr={report.away.abbr}
                                      teamId={report.away.teamId}
                                      size="xs"
                                    />
                                    <span className="truncate">
                                      Líder {report.away.abbr}
                                    </span>
                                    <span className="hidden xl:inline text-[10px] font-normal text-slate-400">
                                      (Visitante)
                                    </span>
                                  </span>
                                }
                                align="left"
                                compact
                                active={leaderSortKey === 'away'}
                                asc={leaderSortAsc}
                                onSort={() => toggleLeaderSort('away')}
                                className="py-1.5 px-2.5"
                              />
                              <SortableTh
                                label="Ventaja (Δ)"
                                helpKey="comparisonPulse"
                                align="center"
                                compact
                                active={leaderSortKey === 'diff'}
                                asc={leaderSortAsc}
                                onSort={() => toggleLeaderSort('diff')}
                                className="py-1.5 px-2"
                              />
                              <SortableTh
                                label={
                                  <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                                    <TeamLogo
                                      abbr={report.home.abbr}
                                      teamId={report.home.teamId}
                                      size="xs"
                                    />
                                    <span className="truncate">
                                      Líder {report.home.abbr}
                                    </span>
                                    <span className="hidden xl:inline text-[10px] font-normal text-slate-400">
                                      (Local)
                                    </span>
                                  </span>
                                }
                                align="left"
                                compact
                                active={leaderSortKey === 'home'}
                                asc={leaderSortAsc}
                                onSort={() => toggleLeaderSort('home')}
                                className="py-1.5 pl-2.5 pr-3"
                              />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1E293B]">
                            {filteredLeaderRows.map(({ row, ordinal }, idx) => {
                              const prevGroup =
                                idx > 0
                                  ? filteredLeaderRows[idx - 1].row.groupLabel
                                  : null;
                              const showGroupDivider =
                                leaderSortKey === null &&
                                leaderFilter === 'all' &&
                                Boolean(row.groupLabel) &&
                                row.groupLabel !== prevGroup;

                            const awayWon = row.betterSide === 'away';
                            const homeWon = row.betterSide === 'home';
                            const split = computeLeaderBarSplit(
                              row.awayValue,
                              row.homeValue,
                              row.lowerIsBetter
                            );

                            const awayNameDisplay =
                              row.awayShortName ||
                              row.awayFormatted
                                .replace(/^#\d+\s*/, '')
                                .replace(/\s*\(.*\)$/, '');
                            const homeNameDisplay =
                              row.homeShortName ||
                              row.homeFormatted
                                .replace(/^#\d+\s*/, '')
                                .replace(/\s*\(.*\)$/, '');
                            const awayStatText =
                              row.awayStatDisplay ||
                              (row.awayFormatted.match(/\(([^)]+)\)/)?.[1] ??
                                `${row.awayValue}`);
                            const homeStatText =
                              row.homeStatDisplay ||
                              (row.homeFormatted.match(/\(([^)]+)\)/)?.[1] ??
                                `${row.homeValue}`);

                            return (
                              <Fragment key={row.categoryKey}>
                                {showGroupDivider && (
                                  <tr className="bg-[#0B1120]/85 border-y border-[#1E293B]">
                                    <td
                                      colSpan={4}
                                      className="py-1 px-3 text-[10px] font-bold tracking-wider uppercase text-orange-400"
                                    >
                                      {row.groupLabel}
                                    </td>
                                  </tr>
                                )}

                                <tr className="hover:bg-[#182338]/55 transition-colors">
                                  {/* Col 1: Ordinal + Category Label */}
                                  <td className="py-1 pl-3 pr-2 text-slate-200">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="font-mono tabular-nums text-[10px] text-slate-500 w-3.5 shrink-0">
                                        {String(ordinal).padStart(2, '0')}
                                      </span>
                                      <span
                                        className="font-medium text-slate-100 truncate"
                                        title={row.categoryLabel}
                                      >
                                        {row.categoryLabel}
                                      </span>
                                      {row.helpKey && (
                                        <MetricInfoTooltip
                                          helpKey={row.helpKey}
                                          align="left"
                                          iconClassName="w-3 h-3 shrink-0"
                                        />
                                      )}
                                    </div>
                                  </td>

                                  {/* Col 2: Away Individual Leader (Stacked Stat + Personal Average Delta) */}
                                  <td
                                    className={`py-1 px-2.5 transition-colors ${
                                      awayWon ? 'bg-orange-500/[0.07]' : ''
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            onClose();
                                            onInspectEntity(
                                              'player',
                                              row.awayPlayerId
                                            );
                                          }}
                                          title={row.awayPlayerName || awayNameDisplay}
                                          className="inline-flex items-center gap-1.5 min-w-0 text-left hover:text-orange-300 transition-colors"
                                        >
                                          <PlayerAvatar
                                            playerId={row.awayPlayerId}
                                            name={
                                              row.awayPlayerName || awayNameDisplay
                                            }
                                            teamAbbr={report.away.abbr}
                                            size="xs"
                                          />
                                          <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
                                            #{row.awayJersey || '0'}
                                          </span>
                                          <span
                                            className={`truncate ${
                                              awayWon
                                                ? 'font-bold text-slate-100'
                                                : 'font-medium text-slate-300'
                                            }`}
                                          >
                                            {awayNameDisplay}
                                          </span>
                                        </button>
                                      </div>

                                      <div className="flex flex-col items-end justify-center leading-none shrink-0">
                                        <div className="inline-flex items-center gap-1 leading-none">
                                          {row.awayIsElite && (
                                            <span
                                              title="Marca de nivel Élite NBA en este partido"
                                              className="text-[10px] font-semibold text-amber-300"
                                            >
                                              ★<span className="hidden xl:inline ml-0.5">Élite</span>
                                            </span>
                                          )}
                                          <span
                                            className={`font-mono tabular-nums text-xs leading-none ${
                                              awayWon
                                                ? 'font-bold text-emerald-400'
                                                : 'font-medium text-slate-200'
                                            }`}
                                          >
                                            {awayStatText}
                                          </span>
                                        </div>
                                        {row.awayDeltaDisplay && (
                                          <span
                                            title={
                                              row.awayAvg !== undefined
                                                ? `Media personal en temporada: ${row.awayAvg.toFixed(1)}`
                                                : undefined
                                            }
                                            className={`mt-0.5 font-mono tabular-nums text-[10px] leading-none ${
                                              row.awayDeltaTone === 'positive'
                                                ? 'text-emerald-400/90 font-medium'
                                                : row.awayDeltaTone === 'negative'
                                                ? 'text-rose-400/90'
                                                : 'text-slate-400'
                                            }`}
                                          >
                                            {row.awayDeltaDisplay}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Col 3: Compact Visual Duel Bar + Advantage Delta */}
                                  <td className="py-1 px-2 text-center align-middle">
                                    <div className="flex flex-col items-center justify-center gap-1 w-full">
                                      {statsViewStyle !== 'table_clean' && (
                                        <MatchupPulseBar
                                          awayPct={split.awayPct}
                                          homePct={split.homePct}
                                          awayColor={matchupColors.awayColor}
                                          homeColor={matchupColors.homeColor}
                                          betterSide={row.betterSide}
                                          size="xs"
                                          className="max-w-[84px]"
                                          title={`${report.away.abbr} ${awayStatText} (${split.awayPct}%) vs ${report.home.abbr} ${homeStatText} (${split.homePct}%) · Línea central: 50%`}
                                        />
                                      )}
                                      <span
                                        className={`font-mono tabular-nums text-[10px] leading-tight truncate max-w-full ${
                                          row.betterSide === 'tie'
                                            ? 'text-slate-400'
                                            : 'font-semibold text-orange-300'
                                        }`}
                                        title={row.diffDisplay || 'Igualado'}
                                      >
                                        {row.diffDisplay || 'Igualado'}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Col 4: Home Individual Leader (Stacked Stat + Personal Average Delta) */}
                                  <td
                                    className={`py-1 pl-2.5 pr-3 transition-colors ${
                                      homeWon ? 'bg-orange-500/[0.07]' : ''
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            onClose();
                                            onInspectEntity(
                                              'player',
                                              row.homePlayerId
                                            );
                                          }}
                                          title={row.homePlayerName || homeNameDisplay}
                                          className="inline-flex items-center gap-1.5 min-w-0 text-left hover:text-orange-300 transition-colors"
                                        >
                                          <PlayerAvatar
                                            playerId={row.homePlayerId}
                                            name={
                                              row.homePlayerName || homeNameDisplay
                                            }
                                            teamAbbr={report.home.abbr}
                                            size="xs"
                                          />
                                          <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
                                            #{row.homeJersey || '0'}
                                          </span>
                                          <span
                                            className={`truncate ${
                                              homeWon
                                                ? 'font-bold text-slate-100'
                                                : 'font-medium text-slate-300'
                                            }`}
                                          >
                                            {homeNameDisplay}
                                          </span>
                                        </button>
                                      </div>

                                      <div className="flex flex-col items-end justify-center leading-none shrink-0">
                                        <div className="inline-flex items-center gap-1 leading-none">
                                          {row.homeIsElite && (
                                            <span
                                              title="Marca de nivel Élite NBA en este partido"
                                              className="text-[10px] font-semibold text-amber-300"
                                            >
                                              ★<span className="hidden xl:inline ml-0.5">Élite</span>
                                            </span>
                                          )}
                                          <span
                                            className={`font-mono tabular-nums text-xs leading-none ${
                                              homeWon
                                                ? 'font-bold text-emerald-400'
                                                : 'font-medium text-slate-200'
                                            }`}
                                          >
                                            {homeStatText}
                                          </span>
                                        </div>
                                        {row.homeDeltaDisplay && (
                                          <span
                                            title={
                                              row.homeAvg !== undefined
                                                ? `Media personal en temporada: ${row.homeAvg.toFixed(1)}`
                                                : undefined
                                            }
                                            className={`mt-0.5 font-mono tabular-nums text-[10px] leading-none ${
                                              row.homeDeltaTone === 'positive'
                                                ? 'text-emerald-400/90 font-medium'
                                                : row.homeDeltaTone === 'negative'
                                                ? 'text-rose-400/90'
                                                : 'text-slate-400'
                                            }`}
                                          >
                                            {row.homeDeltaDisplay}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 3: HOJA OFICIAL NBA.COM (FIXED 21 COLUMNS + STICKY PLAYER NAME + TOGGLE) */}
              {activeTab === 'boxscore' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-[#131C2E] border border-[#1E293B] rounded-xl p-3">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-200 font-medium">
                        Planilla oficial con 21 columnas fijas y columna de jugador adherida (sticky)
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="w-3 h-3 rounded-xs border"
                            style={{
                              backgroundColor: hexToRgba(matchupColors.awayColor, 0.28),
                              borderColor: hexToRgba(matchupColors.awayColor, 0.55),
                            }}
                          />
                          <span
                            aria-hidden="true"
                            className="w-3 h-3 rounded-xs border"
                            style={{
                              backgroundColor: hexToRgba(matchupColors.homeColor, 0.28),
                              borderColor: hexToRgba(matchupColors.homeColor, 0.55),
                            }}
                          />
                          <span>Celda sombreada = Líder del equipo en la columna</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono tabular-nums font-extrabold text-[#FDE047]">
                            28
                          </span>
                          <span>
                            Cifra dorada = Mejor marca de la temporada del jugador (pasa el cursor para detalle)
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      {/* Boxscore Cols Toggle */}
                      <div className="flex items-center gap-1 bg-[#0B1120] p-1 rounded-lg border border-[#1E293B]">
                        <button
                          type="button"
                          onClick={() => handleSetBoxscoreColsMode('basic')}
                          className={`min-h-[30px] px-2.5 py-0.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                            boxscoreColsMode === 'basic'
                              ? 'bg-orange-500 text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          Básicas (21)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetBoxscoreColsMode('all')}
                          className={`min-h-[30px] px-2.5 py-0.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                            boxscoreColsMode === 'all'
                              ? 'bg-orange-500 text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          Todas (+ TS% · USG%)
                        </button>
                      </div>

                      {/* Team Filter */}
                      <div className="flex items-center gap-1 bg-[#0B1120] p-1 rounded-lg border border-[#1E293B]">
                        {(
                          [
                            { id: 'both', label: 'Ambos' },
                            { id: 'away', label: report.away.abbr },
                            { id: 'home', label: report.home.abbr },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setBoxTeamFilter(opt.id)}
                            className={`min-h-[30px] px-2.5 py-0.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                              boxTeamFilter === opt.id
                                ? 'bg-orange-500 text-slate-950 font-semibold'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {(boxTeamFilter === 'both' || boxTeamFilter === 'away') &&
                    renderTeamBoxscoreTable(report.away, 'Visitante')}
                  {(boxTeamFilter === 'both' || boxTeamFilter === 'home') &&
                    renderTeamBoxscoreTable(report.home, 'Local')}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Unclipped Floating Popover for Player Season Highs in Acta Oficial */}
        {hoveredSeasonHigh && (
          <div
            role="tooltip"
            style={{
              left: `${hoveredSeasonHigh.left}px`,
              top: `${hoveredSeasonHigh.top}px`,
            }}
            className={`pointer-events-none fixed z-[80] w-64 -translate-x-1/2 ${
              hoveredSeasonHigh.showBelow ? 'translate-y-0' : '-translate-y-full'
            } rounded-lg border border-amber-400/40 bg-[#0B1120]/95 px-3 py-2 text-left shadow-xl backdrop-blur-md`}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-[#FDE047]">
              <span>
                {hoveredSeasonHigh.mode === 'sole'
                  ? 'Récord de temporada'
                  : 'Tope igualado'}
              </span>
              <span className="font-mono text-slate-400">
                {hoveredSeasonHigh.seasonLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-slate-100">
              {hoveredSeasonHigh.playerName}{' '}
              <span className="font-mono text-[11px] text-slate-400">
                ({hoveredSeasonHigh.teamAbbr})
              </span>
            </p>
            <p className="mt-1 text-[11px] text-slate-200 leading-snug">
              <span className="font-mono tabular-nums font-bold text-[#FDE047]">
                {hoveredSeasonHigh.displayValue}
              </span>{' '}
              en <span className="text-slate-300">{hoveredSeasonHigh.colLabel}</span>
            </p>
            <p className="mt-0.5 text-[10.5px] text-slate-400 leading-snug">
              {hoveredSeasonHigh.mode === 'sole'
                ? hoveredSeasonHigh.prevBestText
                  ? `Supera su anterior tope (${hoveredSeasonHigh.prevBestText}) en ${hoveredSeasonHigh.gamesPlayed} PJ disputados.`
                  : `Mejor registro personal en ${hoveredSeasonHigh.gamesPlayed} PJ disputados.`
                : `Iguala su mejor marca personal de la campaña (${hoveredSeasonHigh.gamesPlayed} PJ).`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
