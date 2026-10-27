import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Newspaper,
  RefreshCw,
  Scale,
  Swords,
  X,
} from 'lucide-react';
import type {
  ExperienceMode,
  GameBoxScorePlayerLine,
  GameNarrativePayload,
  GameOfficialReportData,
  GameReportTeamSide,
} from '../types/nba';
import { ColumnHelpHeader, MetricInfoTooltip } from './MetricUiHelpers';

interface GameScoutingReportModalProps {
  eventId: string | null;
  experienceMode: ExperienceMode;
  onClose: () => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onOpenInDuel: (playerId: string) => void;
}

type ModalTabId = 'scouting' | 'headToHead' | 'boxscore';

const EMPIRICAL_TOKEN_REGEX =
  /(#\d{1,2}\b|[+-]\d+(?:[.,]\d+)?%?|\b\d{1,3}-\d{1,3}\b|\b\d{1,2}\/\d{1,2}\b|\b\d+(?:[.,]\d+)?%|\b\d+(?:[.,]\d+)?\s*(?:PTS|REB|AST|MIN|ROB|TAP|PER|OR|T3|TC|TL|PJ|GmSc|TS|eFG|puntos|rebotes|asistencias|triples|minutos|posesiones)\b)/gi;

const EMPIRICAL_TOKEN_SINGLE_REGEX =
  /^(?:#\d{1,2}|[+-]\d+(?:[.,]\d+)?%?|\d{1,3}-\d{1,3}|\d{1,2}\/\d{1,2}|\d+(?:[.,]\d+)?%|\d+(?:[.,]\d+)?\s*(?:PTS|REB|AST|MIN|ROB|TAP|PER|OR|T3|TC|TL|PJ|GmSc|TS|eFG|puntos|rebotes|asistencias|triples|minutos|posesiones))$/i;

export function renderHighlightedInline(text: string) {
  const mdParts = (text || '').split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return mdParts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }

    const tokenParts = part.split(EMPIRICAL_TOKEN_REGEX);
    if (tokenParts.length === 1) {
      return <span key={idx}>{part}</span>;
    }

    return (
      <span key={idx}>
        {tokenParts.map((tok, tIdx) => {
          if (!tok) return null;
          if (/^#\d{1,2}$/.test(tok)) {
            return (
              <span
                key={tIdx}
                className="font-mono tabular-nums font-semibold text-orange-300"
              >
                {tok}
              </span>
            );
          }
          if (EMPIRICAL_TOKEN_SINGLE_REGEX.test(tok)) {
            return (
              <span
                key={tIdx}
                className="font-mono tabular-nums font-medium text-slate-100"
              >
                {tok}
              </span>
            );
          }
          return <span key={tIdx}>{tok}</span>;
        })}
      </span>
    );
  });
}

/**
 * Renders magazine-grade editorial paragraphs supporting inline **bold**,
 * automatic tabular figure/#jersey highlighting, and optional opening drop cap.
 */
export function renderEditorialParagraphs(
  text: string,
  options?: { dropCap?: boolean }
) {
  const blocks = (text || '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-4 text-[14px] sm:text-[15px] leading-[1.78] text-slate-300 max-w-[72ch]">
      {blocks.map((para, pIdx) => (
        <p
          key={pIdx}
          className={
            options?.dropCap && pIdx === 0
              ? 'first-letter:float-left first-letter:font-display first-letter:text-3xl sm:first-letter:text-4xl first-letter:font-bold first-letter:leading-none first-letter:mr-2.5 first-letter:mt-1 first-letter:text-orange-400'
              : undefined
          }
        >
          {renderHighlightedInline(para.replace(/\n/g, ' '))}
        </p>
      ))}
    </div>
  );
}

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

  lines.push('## CARA A CARA: LÍDERES INDIVIDUALES');
  lines.push(
    `| Categoría | ${report.away.abbr} (Visitante) | ${report.home.abbr} (Local) |`
  );
  lines.push('| :--- | :--- | :--- |');
  for (const l of report.leaderComparisonRows) {
    lines.push(`| ${l.categoryLabel} | ${l.awayFormatted} | ${l.homeFormatted} |`);
  }
  lines.push('');

  lines.push('## HITOS, VEREDICTO Y PODIO');
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

  return lines.join('\n');
}

export function GameScoutingReportModal({
  eventId,
  experienceMode,
  onClose,
  onInspectEntity,
  onOpenInDuel,
}: GameScoutingReportModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTabId>('scouting');
  const [boxTeamFilter, setBoxTeamFilter] = useState<'both' | 'away' | 'home'>('both');
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
  const [copied, setCopied] = useState<boolean>(false);

  const loadFullGameReport = useCallback(
    async (targetEventId: string, forceRefresh = false) => {
      setLoadingBox(true);
      setLoadingNarrative(true);
      setErrorMsg(null);
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
          setReport(data);
        })
        .catch((err) => {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Error al recuperar los datos del partido.'
          );
        })
        .finally(() => {
          setLoadingBox(false);
        });

      // Stage 2: Parallel Gemini + Google Search Scouting & Journalistic Chronicle
      fetch(`/api/nba/game/${encodeURIComponent(targetEventId)}/narrative${qs}`)
        .then(async (res) => {
          if (!res.ok) {
            throw new Error('No se pudo redactar la crónica del encuentro.');
          }
          const nar = (await res.json()) as GameNarrativePayload;
          setNarrative(nar);
        })
        .catch((err) => {
          console.warn('Narrative warning:', err);
        })
        .finally(() => {
          setLoadingNarrative(false);
        });
    },
    []
  );

  useEffect(() => {
    if (!eventId) return;
    setActiveTab('scouting');
    setBoxTeamFilter('both');
    setCopied(false);
    void loadFullGameReport(eventId, false);
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

  // Combine all absences and in-game setbacks across both sides
  const allIncidencesAndAbsences = useMemo(() => {
    if (!report) return [];
    const list: Array<{ teamAbbr: string; item: any }> = [];
    for (const item of report.away.absencesAndDnp) {
      list.push({ teamAbbr: report.away.abbr, item });
    }
    for (const item of report.home.absencesAndDnp) {
      list.push({ teamAbbr: report.home.abbr, item });
    }
    return list;
  }, [report]);

  if (!eventId) return null;

  const formatDurationHuman = (mins: number | null) => {
    if (!mins || mins <= 0) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  const renderTeamBoxscoreTable = (side: GameReportTeamSide, roleLabel: string) => {
    const renderPlayerRow = (p: GameBoxScorePlayerLine) => (
      <tr
        key={p.playerId}
        onClick={() => {
          onClose();
          onInspectEntity('player', p.playerId);
        }}
        className="hover:bg-[#182338] cursor-pointer transition-colors"
      >
        <td className="py-2 pl-3 pr-2 whitespace-nowrap sticky left-0 bg-[#131C2E] z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-1.5">
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
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.minutesFormatted}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs font-bold text-slate-100 whitespace-nowrap">
          {p.points}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.fgm}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.fga}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.fgPct.toFixed(0)}%
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.fg3m}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.fg3a}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.fg3Pct.toFixed(0)}%
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.ftm}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.fta}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.ftPct.toFixed(0)}%
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.oreb}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.dreb}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs font-semibold text-slate-100 whitespace-nowrap">
          {p.rebounds}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-200 whitespace-nowrap">
          {p.assists}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.steals}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
          {p.blocks}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-400 whitespace-nowrap">
          {p.turnovers}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-400 whitespace-nowrap">
          {p.fouls}
        </td>
        <td
          className={`py-2 px-2 text-right font-mono tabular-nums text-xs font-semibold whitespace-nowrap ${
            p.plusMinus > 0
              ? 'text-emerald-400'
              : p.plusMinus < 0
              ? 'text-rose-400'
              : 'text-slate-400'
          }`}
        >
          {p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}
        </td>
        <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-orange-300 font-semibold whitespace-nowrap">
          {p.gameScore.toFixed(1)}
        </td>
        {boxscoreColsMode === 'all' && (
          <>
            <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
              {p.tsPct.toFixed(1)}%
            </td>
            <td className="py-2 px-2 text-right font-mono tabular-nums text-xs text-amber-300 whitespace-nowrap">
              {(p.usgEst || 0).toFixed(1)}%
            </td>
          </>
        )}
        <td className="py-2 pl-1 pr-3 text-right whitespace-nowrap">
          <button
            type="button"
            title="Enviar a Duelo 1v1"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              onOpenInDuel(p.playerId);
            }}
            className="min-w-[30px] min-h-[30px] inline-flex items-center justify-center rounded border border-[#1E293B] bg-[#0B1120] text-slate-400 hover:text-orange-400 hover:border-orange-500/40 transition-colors"
          >
            <Swords className="w-3 h-3" />
          </button>
        </td>
      </tr>
    );

    const t = side.totals;
    const colCount = boxscoreColsMode === 'all' ? 25 : 23;

    return (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1E293B] bg-[#0F172A]/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
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
          <span className="text-xs font-mono tabular-nums text-slate-400">
            OffRtg {t.offRtg.toFixed(1)} · {t.efgPct.toFixed(1)}% eFG · Banquillo{' '}
            {t.benchPoints} PTS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-[11px] text-slate-400 bg-[#0B1120]/60">
                <th className="py-2 pl-3 pr-2 font-medium sticky left-0 bg-[#0B1120] z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">Jugador</th>
                <th className="py-2 px-2 font-medium text-right">MIN</th>
                <th className="py-2 px-2 font-medium text-right">PTOS</th>
                <th className="py-2 px-2 font-medium text-right">FGM</th>
                <th className="py-2 px-2 font-medium text-right">FGA</th>
                <th className="py-2 px-2 font-medium text-right">FG%</th>
                <th className="py-2 px-2 font-medium text-right">3PM</th>
                <th className="py-2 px-2 font-medium text-right">3PA</th>
                <th className="py-2 px-2 font-medium text-right">3P%</th>
                <th className="py-2 px-2 font-medium text-right">FTM</th>
                <th className="py-2 px-2 font-medium text-right">FTA</th>
                <th className="py-2 px-2 font-medium text-right">FT%</th>
                <th className="py-2 px-2 font-medium text-right">OREB</th>
                <th className="py-2 px-2 font-medium text-right">DREB</th>
                <th className="py-2 px-2 font-medium text-right">REB</th>
                <th className="py-2 px-2 font-medium text-right">AST</th>
                <th className="py-2 px-2 font-medium text-right">STL</th>
                <th className="py-2 px-2 font-medium text-right">BLK</th>
                <th className="py-2 px-2 font-medium text-right">TO</th>
                <th className="py-2 px-2 font-medium text-right">PF</th>
                <th className="py-2 px-2 font-medium text-right">+/-</th>
                <th className="py-2 px-2 font-medium text-right">
                  <ColumnHelpHeader label="GmSc" helpKey="gmSc" />
                </th>
                {boxscoreColsMode === 'all' && (
                  <>
                    <th className="py-2 px-2 font-medium text-right">TS%</th>
                    <th className="py-2 px-2 font-medium text-right">USG%</th>
                  </>
                )}
                <th className="py-2 pl-1 pr-3 font-medium text-right">1v1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/80">
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
                    <td className="py-2.5 px-2 text-right text-amber-300">100.0%</td>
                  </>
                )}
                <td className="py-2.5 pl-1 pr-3" />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Inactive / Rotation Absences / DNP Footer */}
        {side.absencesAndDnp.length > 0 && (
          <div className="px-4 py-3 border-t border-[#1E293B] bg-[#0B1120]/45 text-xs text-slate-400 space-y-1">
            <span className="font-semibold text-slate-300">
              Bajas, ausencias e incidencias ({side.abbr}):{' '}
            </span>
            <span>
              {side.absencesAndDnp
                .map((item) => `#${item.jersey} ${item.name} (${item.note})`)
                .join(' · ')}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderTeamStatsSection = (
    title: string,
    rows: typeof report extends null ? never : GameOfficialReportData['teamComparisonRows']
  ) => {
    if (!report || rows.length === 0) return null;

    if (statsViewStyle === 'bars_tv') {
      return (
        <section className="space-y-3">
          <h4 className="text-xs font-bold text-orange-400 tracking-wider uppercase border-b border-[#1E293B] pb-1.5">
            {title}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rows.map((row) => {
              const maxVal = Math.max(0.1, row.awayNumeric + row.homeNumeric);
              const awayPct = Math.round((row.awayNumeric / maxVal) * 100);
              const homePct = 100 - awayPct;

              return (
                <div
                  key={row.key}
                  className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                    <span
                      className={
                        row.betterSide === 'away' ? 'text-emerald-400 font-bold' : 'text-slate-300'
                      }
                    >
                      {report.away.abbr} {row.awayDisplay}
                    </span>
                    <span className="text-slate-400 font-medium text-center truncate px-2">
                      {row.label}
                    </span>
                    <span
                      className={
                        row.betterSide === 'home' ? 'text-emerald-400 font-bold' : 'text-slate-300'
                      }
                    >
                      {row.homeDisplay} {report.home.abbr}
                    </span>
                  </div>

                  <div className="h-2 w-full bg-[#0B1120] rounded-full overflow-hidden flex">
                    <div
                      className={
                        row.betterSide === 'away'
                          ? 'bg-orange-500'
                          : row.betterSide === 'tie'
                          ? 'bg-slate-500'
                          : 'bg-slate-700'
                      }
                      style={{ width: `${awayPct}%` }}
                    />
                    <div
                      className={
                        row.betterSide === 'home'
                          ? 'bg-orange-500'
                          : row.betterSide === 'tie'
                          ? 'bg-slate-500'
                          : 'bg-slate-700'
                      }
                      style={{ width: `${homePct}%` }}
                    />
                  </div>

                  <div className="text-[11px] text-right font-mono tabular-nums text-orange-300">
                    {row.diffDisplay}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    return (
      <section className="space-y-2">
        <h4 className="text-xs font-bold text-orange-400 tracking-wider uppercase border-b border-[#1E293B] pb-1.5">
          {title}
        </h4>
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/70">
                <th className="py-2.5 pl-4 pr-3 font-medium">Categoría</th>
                <th className="py-2.5 px-3 font-semibold text-right text-slate-200">
                  {report.away.abbr} (Visitante)
                </th>
                <th className="py-2.5 px-3 font-semibold text-right text-slate-200">
                  {report.home.abbr} (Local)
                </th>
                <th className="py-2.5 pl-3 pr-4 font-medium text-right">Ventaja (Δ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {rows.map((row) => {
                const total = Math.max(1, row.awayNumeric + row.homeNumeric);
                const awayPct = Math.round((row.awayNumeric / total) * 100);

                return (
                  <tr
                    key={row.key}
                    className="hover:bg-[#182338]/60 transition-colors"
                  >
                    <td className="py-2.5 pl-4 pr-3 text-slate-200">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5">
                          <span>{row.label}</span>
                          {row.helpKey && (
                            <MetricInfoTooltip
                              helpKey={row.helpKey}
                              align="left"
                              iconClassName="w-3 h-3"
                            />
                          )}
                        </div>
                        {statsViewStyle === 'table_bars' && (
                          <div className="h-1 w-32 bg-[#0B1120] rounded-full overflow-hidden flex">
                            <div
                              className={
                                row.betterSide === 'away' ? 'bg-orange-500' : 'bg-slate-600'
                              }
                              style={{ width: `${awayPct}%` }}
                            />
                            <div
                              className={
                                row.betterSide === 'home' ? 'bg-orange-500' : 'bg-slate-700'
                              }
                              style={{ width: `${100 - awayPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        row.betterSide === 'away'
                          ? 'font-bold text-emerald-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {row.awayDisplay}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        row.betterSide === 'home'
                          ? 'font-bold text-emerald-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {row.homeDisplay}
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums text-xs text-orange-300 whitespace-nowrap">
                      {row.diffDisplay}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
              <h2 className="mt-1 text-sm sm:text-lg font-bold text-slate-100 leading-snug">
                {report.pasoBTitle}
              </h2>
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

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse font-mono tabular-nums text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-[#1E293B] text-[11px] text-slate-400 bg-[#0B1120]/45">
                        <th className="py-2 pl-4 pr-3 font-sans font-medium">
                          Equipo (Récord)
                        </th>
                        {report.periods.map((p) => (
                          <th
                            key={p.period}
                            className="py-2 px-2.5 text-center font-medium"
                          >
                            {p.label}
                          </th>
                        ))}
                        <th className="py-2 px-3 text-right font-semibold text-slate-200">
                          FINAL
                        </th>
                        {experienceMode === 'advanced' && (
                          <th className="py-2 pl-2 pr-4 text-right font-medium hidden md:table-cell">
                            OffRtg · eFG%
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]">
                      {[
                        { side: report.away, isAway: true },
                        { side: report.home, isAway: false },
                      ].map(({ side, isAway }) => (
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
                      {/* EDITORIAL FRONT-PAGE MASTHEAD */}
                      {narrative && (
                        <header className="space-y-3 border-b border-[#1E293B] pb-5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                            <span className="font-semibold text-orange-400">
                              Crónica y Scouting Táctico
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {report.arenaName}, {report.arenaCity}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {report.attendanceFormatted}
                            </span>
                          </div>

                          <h3 className="font-display text-xl sm:text-2xl lg:text-[26px] font-bold text-slate-100 leading-tight text-balance max-w-4xl">
                            {narrative.pressHeadline}
                          </h3>

                          <p className="text-sm sm:text-base text-slate-200 leading-relaxed max-w-4xl font-medium">
                            {renderHighlightedInline(narrative.pressLead)}
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
                          <div className="lg:col-span-8 space-y-2.5">
                            <p className="text-[11px] font-medium text-orange-400 tracking-wide">
                              02 · Lectura Táctica del Scout
                            </p>
                            <h4 className="font-display text-base sm:text-lg font-bold text-slate-100">
                              Pizarra, Ajustes y Rotación
                            </h4>
                            {renderEditorialParagraphs(narrative.chalkboardSection)}
                          </div>

                          {/* Dedicated Side Card: Parte de Bajas, Lesiones e Incidencias en Pistas */}
                          <aside className="lg:col-span-4 bg-[#0B1120]/80 border border-[#1E293B] rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
                              <span className="text-xs font-semibold text-slate-200">
                                Parte de Bajas e Incidencias
                              </span>
                              <span className="text-[10px] text-amber-300 font-mono">
                                Previa + Partido
                              </span>
                            </div>

                            {allIncidencesAndAbsences.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">
                                Sin ausencias previas ni incidencias por lesión/expulsión registradas en este encuentro.
                              </p>
                            ) : (
                              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                {allIncidencesAndAbsences.map(({ teamAbbr, item }, idx) => {
                                  const isSetback = item.category === 'in_game_setback';
                                  return (
                                    <div
                                      key={`${teamAbbr}-${item.jersey}-${idx}`}
                                      className={`p-2.5 rounded border text-xs space-y-1 ${
                                        isSetback
                                          ? 'bg-rose-950/25 border-rose-500/40 text-rose-200'
                                          : 'bg-[#131C2E] border-[#1E293B] text-slate-200'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between font-semibold">
                                        <span className="truncate">
                                          <strong className="text-orange-400 mr-1 font-mono">
                                            [{teamAbbr}]
                                          </strong>
                                          #{item.jersey} {item.name}
                                        </span>
                                        {isSetback && (
                                          <span className="text-[10px] uppercase font-bold text-rose-400 shrink-0">
                                            Percance
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-slate-300 leading-snug">
                                        {item.note}
                                      </p>
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
                            {renderEditorialParagraphs(narrative.xFactorSection)}
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
                                  entry: report.away.podium[0],
                                },
                                {
                                  role: `Líder ${report.home.abbr}`,
                                  entry: report.home.podium[0],
                                },
                              ]
                                .filter((item) => Boolean(item.entry))
                                .map(({ role, entry }) => (
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
                                      className="min-w-0 text-left hover:text-orange-300 transition-colors"
                                    >
                                      <p className="text-[11px] text-slate-400">{role}</p>
                                      <p className="text-xs font-semibold text-slate-100 truncate">
                                        <span className="font-mono text-orange-300 mr-1">
                                          #{entry.jersey}
                                        </span>
                                        {entry.name}
                                      </p>
                                      <p className="font-mono tabular-nums text-[11px] text-slate-300">
                                        {entry.points} PTS · {entry.rebounds} REB · {entry.assists} AST
                                      </p>
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
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold text-slate-100">
                                    <span className="font-mono text-orange-300 mr-1">
                                      #{sp.jersey}
                                    </span>
                                    {sp.name} ({sp.teamAbbr})
                                  </p>
                                  <span className="text-[10px] font-semibold text-amber-300">
                                    {sp.played ? 'Participó' : 'Sin MIN'}
                                  </span>
                                </div>
                                <p className="font-mono tabular-nums text-xs text-slate-300 leading-relaxed">
                                  {sp.lineSummary}
                                </p>
                              </button>
                            ))}
                          </div>
                        ) : (
                          renderEditorialParagraphs(
                            narrative?.spanishSection || report.spanishPlayersReport.summaryLine
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

                    {narrative && renderEditorialParagraphs(narrative.verdictSection)}

                    {/* VISUAL 3-COLUMN STAR PODIUM */}
                    <div className="space-y-4 pt-1">
                      {[report.away, report.home].map((side) => (
                        <div key={side.abbr} className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-100">
                              Podio {side.name} ({side.abbr})
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {side.podium.map((p) => (
                              <div
                                key={p.playerId}
                                className="rounded-lg border p-3.5 bg-[#0F172A] border-[#1E293B] flex flex-col justify-between gap-2"
                              >
                                <div className="space-y-1">
                                  <span className="text-[11px] font-medium text-amber-300">
                                    {'⭐'.repeat(p.stars)} Estrella
                                  </span>
                                  <p className="text-sm font-bold text-slate-100">
                                    #{p.jersey} {p.name}
                                  </p>
                                </div>
                                <p className="font-mono tabular-nums text-xs text-slate-200">
                                  {p.points}P · {p.rebounds}R · {p.assists}A ({p.gameScore.toFixed(1)} GmSc)
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </article>
              )}

              {/* TAB 2: ESTADÍSTICAS (3-WAY VIEW TOGGLE + 23 METRICS IN 3 SECTIONS + 16 LEADERS) */}
              {activeTab === 'headToHead' && (
                <div className="space-y-6">
                  {/* Style Mode Switcher Header */}
                  <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">
                        04. Estadísticas del Partido (23 métricas colectivas)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Cambia de estilo visual para comparar equipos según tu preferencia
                      </p>
                    </div>

                    <div className="flex items-center gap-1 bg-[#0B1120] p-1 rounded-lg border border-[#1E293B]">
                      <button
                        type="button"
                        onClick={() => handleSetStatsViewStyle('table_bars')}
                        className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded transition-colors ${
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
                        className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded transition-colors ${
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
                        className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded transition-colors ${
                          statsViewStyle === 'bars_tv'
                            ? 'bg-orange-500 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Barras TV
                      </button>
                    </div>
                  </div>

                  {/* 3 Grouped Sections */}
                  {renderTeamStatsSection('01. Anotación y Tiro', scoringShootingRows)}
                  {renderTeamStatsSection('02. Eficiencia y Pizarra Táctica', efficiencyTacticsRows)}
                  {renderTeamStatsSection('03. Rebote, Creación, Defensa y Disciplina', rebDefenseRows)}

                  {/* Punto 5: CARA A CARA LÍDERES INDIVIDUALES (16 CATEGORÍAS) */}
                  <section className="space-y-2.5 pt-4 border-t border-[#1E293B]">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">
                        05. Cara a Cara: Líderes Individuales (16 categorías)
                      </h3>
                      <span className="text-xs text-slate-400 font-mono">
                        #Dorsal I. Apellido (Dato)
                      </span>
                    </div>

                    <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/70">
                            <th className="py-2.5 pl-4 pr-3 font-medium">Categoría</th>
                            <th className="py-2.5 px-3 font-semibold text-slate-200">
                              Líder {report.away.name} ({report.away.abbr})
                            </th>
                            <th className="py-2.5 pl-3 pr-4 font-semibold text-slate-200">
                              Líder {report.home.name} ({report.home.abbr})
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E293B]">
                          {report.leaderComparisonRows.map((row) => (
                            <tr
                              key={row.categoryKey}
                              className="hover:bg-[#182338]/60 transition-colors"
                            >
                              <td className="py-2.5 pl-4 pr-3 text-slate-200 whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <span>{row.categoryLabel}</span>
                                  {row.helpKey && (
                                    <MetricInfoTooltip
                                      helpKey={row.helpKey}
                                      align="left"
                                      iconClassName="w-3 h-3"
                                    />
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onInspectEntity('player', row.awayPlayerId);
                                  }}
                                  className={`hover:underline text-left ${
                                    row.betterSide === 'away'
                                      ? 'font-bold text-orange-300'
                                      : 'text-slate-200'
                                  }`}
                                >
                                  {row.awayFormatted}
                                </button>
                              </td>
                              <td className="py-2.5 pl-3 pr-4 font-mono tabular-nums whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onInspectEntity('player', row.homePlayerId);
                                  }}
                                  className={`hover:underline text-left ${
                                    row.betterSide === 'home'
                                      ? 'font-bold text-orange-300'
                                      : 'text-slate-200'
                                  }`}
                                >
                                  {row.homeFormatted}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 3: HOJA OFICIAL NBA.COM (FIXED 21 COLUMNS + STICKY PLAYER NAME + TOGGLE) */}
              {activeTab === 'boxscore' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-[#131C2E] border border-[#1E293B] rounded-xl p-3">
                    <p className="text-xs text-slate-300 font-medium">
                      Planilla oficial con 21 columnas fijas y columna de jugador adherida (sticky)
                    </p>

                    <div className="flex items-center gap-3">
                      {/* Boxscore Cols Toggle */}
                      <div className="flex items-center gap-1 bg-[#0B1120] p-1 rounded-lg border border-[#1E293B]">
                        <button
                          type="button"
                          onClick={() => handleSetBoxscoreColsMode('basic')}
                          className={`min-h-[30px] px-2.5 py-0.5 text-xs font-semibold rounded transition-colors ${
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
                          className={`min-h-[30px] px-2.5 py-0.5 text-xs font-semibold rounded transition-colors ${
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
                            className={`min-h-[30px] px-2.5 py-0.5 text-xs font-medium rounded transition-colors ${
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
      </div>
    </div>
  );
}
