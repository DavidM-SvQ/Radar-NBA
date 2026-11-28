import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  BarChart3,
  Briefcase,
  Calendar,
  Crown,
  Filter,
  Flame,
  GraduationCap,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import type {
  DraftHistoryPayload,
  DraftPickRecord,
  DraftPickTier,
  FutureDraftPicksPayload,
} from '../types/nba';
import { formatDraftTradeNoteEs, getDraftTierMeta } from '../utils/draftClient';
import {
  evaluateAllClasses,
  getGlobalStealsRanking,
  getRedraftModeMeta,
  type RedraftMode,
} from '../utils/draftEvaluator';
import { NBA_TEAMS_MAP } from '../utils/teamLogos';
import { ExportImageButton } from './ExportImageButton';
import {
  buildTableSnapshotBlob,
  type TableSnapshotCell,
} from '../utils/exportImageCard';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';
import {
  DraftComparePanel,
  DraftRedraftPanel,
  DraftStealsPanel,
} from './DraftEvaluatorTabs';
import { DraftFuturePicksTab } from './DraftFuturePicksTab';

interface DraftHubViewProps {
  draftData: DraftHistoryPayload | null;
  loading: boolean;
  errorMsg: string | null;
  futurePicksData?: FutureDraftPicksPayload | null;
  futurePicksLoading?: boolean;
  futurePicksError?: string | null;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onRefresh: () => void;
  onRefreshFuturePicks?: () => void;
  onOpenTradeMachine?: (teamAbbr: string) => void;
}

type DraftTab = 'class' | 'redraft' | 'steals' | 'compare' | 'explorer' | 'future';
type TierFilter = 'all' | DraftPickTier;
type ClassSortKey = 'overall' | 'careerPpg' | 'season27PtsPg' | 'careerGp' | 'careerPtsTotal';

const ALL_NBA_TEAM_ABBRS = Object.keys(NBA_TEAMS_MAP).sort((a, b) =>
  (NBA_TEAMS_MAP[a]?.name || a).localeCompare(NBA_TEAMS_MAP[b]?.name || b, 'es')
);

function formatOptStat(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return val.toFixed(decimals);
}

function formatOptInt(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return Math.round(val).toLocaleString('es-ES');
}

export function DraftHubView({
  draftData,
  loading,
  errorMsg,
  futurePicksData = null,
  futurePicksLoading = false,
  futurePicksError = null,
  onInspectEntity,
  onRefresh,
  onRefreshFuturePicks,
  onOpenTradeMachine,
}: DraftHubViewProps) {
  const [activeTab, setActiveTab] = useState<DraftTab>('class');

  // Tab 1: Class Archive (single Draft year)
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [classTierFilter, setClassTierFilter] = useState<TierFilter>('all');
  const [classTeamFilter, setClassTeamFilter] = useState<string>('all');
  const [classOnlyActive, setClassOnlyActive] = useState<boolean>(false);
  const [classSearch, setClassSearch] = useState<string>('');
  const [classSortKey, setClassSortKey] = useState<ClassSortKey>('overall');
  const [classSortDir, setClassSortDir] = useState<'asc' | 'desc'>('asc');

  // Tab 2-4: Fase 17B Evaluator state
  const [redraftYear, setRedraftYear] = useState<number>(2018);
  const [redraftMode, setRedraftMode] = useState<RedraftMode>('balanced');

  // Tab 5: Global Multi-Year Explorer (2001–2026)
  const [globalQuery, setGlobalQuery] = useState<string>('');
  const [globalTeamFilter, setGlobalTeamFilter] = useState<string>('all');
  const [globalTierFilter, setGlobalTierFilter] = useState<TierFilter>('all');
  const [globalPickMin, setGlobalPickMin] = useState<string>('1');
  const [globalPickMax, setGlobalPickMax] = useState<string>('60');
  const [globalOnlyActive, setGlobalOnlyActive] = useState<boolean>(false);
  const [globalSortKey, setGlobalSortKey] = useState<'year_desc' | 'overall' | 'careerPpg' | 'season27PtsPg' | 'careerPtsTotal'>('year_desc');
  const [globalVisibleLimit, setGlobalVisibleLimit] = useState<number>(80);

  const classes = draftData?.classes || [];
  const summary = draftData?.summary;

  const evaluatedClasses = useMemo(
    () => evaluateAllClasses(classes, redraftMode),
    [classes, redraftMode]
  );

  const activeClass = useMemo(() => {
    return classes.find((c) => c.year === selectedYear) || classes[0] || null;
  }, [classes, selectedYear]);

  const handleJumpToClassRedraft = (year: number) => {
    setRedraftYear(year);
    setActiveTab('redraft');
  };

  const classTeamOptions = useMemo(() => {
    if (!activeClass) return [];
    const seen = new Map<string, string>();
    for (const p of activeClass.picks) {
      if (!seen.has(p.draftedByTeamAbbr)) {
        seen.set(p.draftedByTeamAbbr, p.draftedByTeamName);
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeClass]);

  const filteredClassPicks = useMemo(() => {
    if (!activeClass) return [];
    const q = classSearch.trim().toLowerCase();
    const filtered = activeClass.picks.filter((p) => {
      if (classTierFilter !== 'all' && p.tier !== classTierFilter) return false;
      if (classTeamFilter !== 'all' && p.draftedByTeamAbbr !== classTeamFilter) return false;
      if (classOnlyActive && !p.isActive2027) return false;
      if (q) {
        const hay = `${p.playerName} ${p.origin} ${p.draftedByTeamAbbr} ${p.draftedByTeamName} ${p.position} #${p.overall}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const dir = classSortDir === 'asc' ? 1 : -1;
      if (classSortKey === 'overall') {
        return (a.overall - b.overall) * dir;
      }
      const valA = a[classSortKey] ?? -1;
      const valB = b[classSortKey] ?? -1;
      if (valA === valB) return a.overall - b.overall;
      return (valA - valB) * dir;
    });
    return sorted;
  }, [
    activeClass,
    classTierFilter,
    classTeamFilter,
    classOnlyActive,
    classSearch,
    classSortKey,
    classSortDir,
  ]);

  const allPicksFlat = useMemo(() => {
    const out: DraftPickRecord[] = [];
    for (const cls of classes) {
      for (const p of cls.picks) out.push(p);
    }
    return out;
  }, [classes]);

  const filteredGlobalPicks = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    const minP = Math.max(1, Number(globalPickMin) || 1);
    const maxP = Math.max(minP, Number(globalPickMax) || 65);

    const filtered = allPicksFlat.filter((p) => {
      if (p.overall < minP || p.overall > maxP) return false;
      if (globalTeamFilter !== 'all' && p.draftedByTeamAbbr !== globalTeamFilter) return false;
      if (globalTierFilter !== 'all' && p.tier !== globalTierFilter) return false;
      if (globalOnlyActive && !p.isActive2027) return false;
      if (q) {
        const hay = `${p.playerName} ${p.origin} ${p.draftedByTeamAbbr} ${p.draftedByTeamName} ${p.year} #${p.overall}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (globalSortKey === 'year_desc') {
        if (b.year !== a.year) return b.year - a.year;
        return a.overall - b.overall;
      }
      if (globalSortKey === 'overall') {
        if (a.overall !== b.overall) return a.overall - b.overall;
        return b.year - a.year;
      }
      const valA = a[globalSortKey] ?? -1;
      const valB = b[globalSortKey] ?? -1;
      if (valB !== valA) return valB - valA;
      return a.overall - b.overall;
    });
    return sorted;
  }, [
    allPicksFlat,
    globalQuery,
    globalTeamFilter,
    globalTierFilter,
    globalPickMin,
    globalPickMax,
    globalOnlyActive,
    globalSortKey,
  ]);

  const handleToggleClassSort = (key: ClassSortKey) => {
    if (classSortKey === key) {
      setClassSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setClassSortKey(key);
      setClassSortDir(key === 'overall' ? 'asc' : 'desc');
    }
  };

  const handleApplyGlobalPreset = (
    preset: 'number_ones' | 'second_round_gems' | 'lottery_scorers' | 'duke_alumni'
  ) => {
    setGlobalVisibleLimit(80);
    if (preset === 'number_ones') {
      setGlobalQuery('');
      setGlobalTeamFilter('all');
      setGlobalTierFilter('all');
      setGlobalPickMin('1');
      setGlobalPickMax('1');
      setGlobalOnlyActive(false);
      setGlobalSortKey('year_desc');
    } else if (preset === 'second_round_gems') {
      setGlobalQuery('');
      setGlobalTeamFilter('all');
      setGlobalTierFilter('second_round');
      setGlobalPickMin('31');
      setGlobalPickMax('60');
      setGlobalOnlyActive(true);
      setGlobalSortKey('careerPpg');
    } else if (preset === 'lottery_scorers') {
      setGlobalQuery('');
      setGlobalTeamFilter('all');
      setGlobalTierFilter('lottery');
      setGlobalPickMin('1');
      setGlobalPickMax('14');
      setGlobalOnlyActive(true);
      setGlobalSortKey('season27PtsPg');
    } else {
      setGlobalQuery('Duke');
      setGlobalTeamFilter('all');
      setGlobalTierFilter('all');
      setGlobalPickMin('1');
      setGlobalPickMax('60');
      setGlobalOnlyActive(false);
      setGlobalSortKey('year_desc');
    }
  };

  const handleExportSnapshot = async () => {
    const dateSlug = new Date().toISOString().slice(0, 10);

    if (activeTab === 'class' && activeClass) {
      const topRows = filteredClassPicks.slice(0, 20);
      return buildTableSnapshotBlob({
        filename: `radarnba-draft-${activeClass.year}-${dateSlug}.png`,
        categoryTag: `ARCHIVO HISTÓRICO DRAFT NBA · CAMADA ${activeClass.year}`,
        title: `Draft NBA ${activeClass.year} — Cuadro de Elecciones`,
        subtitle: `Pick #1: ${activeClass.numberOnePickName} (${activeClass.numberOneTeamAbbr}) · ${activeClass.pickCount} elecciones oficiales · ${activeClass.activeIn2027Count} activos en 2026–27`,
        entityColumnLabel: 'JUGADOR (PROCEDENCIA)',
        entityColumnWeight: 2.1,
        showRank: false,
        kpis: [
          {
            label: 'NÚMERO 1',
            value: activeClass.numberOnePickName,
            sublabel: `Elegido por ${activeClass.numberOneTeamAbbr}`,
            tone: 'accent',
          },
          {
            label: 'ACTIVOS 2026–27',
            value: `${activeClass.activeIn2027Count} / ${activeClass.pickCount}`,
            sublabel: `${Math.round((activeClass.activeIn2027Count / Math.max(1, activeClass.pickCount)) * 100)}% de la camada`,
            tone: 'positive',
          },
          {
            label: 'LÍDER ANOTADOR 26–27',
            value: activeClass.topActiveScorerName || '—',
            sublabel:
              activeClass.topActiveScorerPpg !== null
                ? `${activeClass.topActiveScorerPpg.toFixed(1)} PTS/P`
                : 'Sin muestra activa',
            tone: 'sky',
          },
        ],
        columns: [
          { key: 'pick', label: 'PICK', align: 'right', widthWeight: 0.65 },
          { key: 'team', label: 'EQ.', align: 'left', widthWeight: 0.65 },
          { key: 's27', label: '26-27 PTS', align: 'right', widthWeight: 0.85 },
          { key: 'cPpg', label: 'CARRERA', align: 'right', widthWeight: 0.9 },
          { key: 'cGp', label: 'PJ CARR.', align: 'right', widthWeight: 0.8 },
        ],
        rows: topRows.map((p) => {
          const cells: Record<string, TableSnapshotCell> = {
            pick: {
              text: `#${p.overall}`,
              subtext: `R${p.round}`,
              tone: p.tier === 'lottery' ? 'accent' : 'neutral',
            },
            team: {
              text: p.draftedByTeamAbbr,
              subtext: p.currentTeamAbbr && p.currentTeamAbbr !== p.draftedByTeamAbbr ? `Hoy ${p.currentTeamAbbr}` : undefined,
            },
            s27: {
              text: p.season27PtsPg != null ? `${formatOptStat(p.season27PtsPg)}` : '—',
              tone: p.season27PtsPg != null && p.season27PtsPg >= 18 ? 'positive' : 'neutral',
            },
            cPpg: {
              text: p.careerPpg != null ? `${formatOptStat(p.careerPpg)} PTS` : '—',
              subtext: p.careerPeakPpg != null ? `Peak ${formatOptStat(p.careerPeakPpg)}` : undefined,
            },
            cGp: {
              text: p.careerGp !== null ? formatOptInt(p.careerGp) : '—',
            },
          };
          return {
            teamAbbr: p.draftedByTeamAbbr,
            entityName: p.playerName,
            entitySubtext: `${p.position} · ${p.origin}`,
            cells,
          };
        }),
        editorialVerdict: `La camada del Draft ${activeClass.year} encabezada por ${activeClass.numberOnePickName} conserva ${activeClass.activeIn2027Count} jugadores activos en la NBA 2026–27${activeClass.topActiveScorerName ? `, liderados en anotación por ${activeClass.topActiveScorerName} (${activeClass.topActiveScorerPpg?.toFixed(1)} PTS/P)` : ''}.`,
      });
    }

    if (activeTab === 'redraft') {
      const ev =
        evaluatedClasses.find((c) => c.year === redraftYear && c.trackedCount > 0) ||
        evaluatedClasses[0];
      if (ev) {
        const modeMeta = getRedraftModeMeta(redraftMode);
        const topRows = ev.picksByRedraft.filter((p) => p.hasStats).slice(0, 18);
        return buildTableSnapshotBlob({
          filename: `radarnba-redraft-${ev.year}-${dateSlug}.png`,
          categoryTag: `RE-DRAFT NBA ${ev.year} · CRITERIO ${modeMeta.shortLabel.toUpperCase()}`,
          title: `Re-Draft NBA ${ev.year} — Nota ${ev.classGrade} (${ev.classPowerIndex.toFixed(1)}/100)`,
          subtitle: `#1 Re-Draft: ${ev.redraftNumberOne?.playerName || '—'} (Pick real #${ev.redraftNumberOne?.overall || 1}) · Acierto Lotería ${ev.lotteryHitRatePct}% · ${ev.starsCount} estrellas`,
          entityColumnLabel: 'JUGADOR (EQUIPO DRAFT)',
          entityColumnWeight: 2.1,
          showRank: false,
          kpis: [
            {
              label: '#1 RE-DRAFT',
              value: ev.redraftNumberOne?.playerName || '—',
              sublabel: ev.redraftNumberOne
                ? `Pick real #${ev.redraftNumberOne.overall} · Índice ${ev.redraftNumberOne.redraftScore.toFixed(1)}`
                : '—',
              tone: 'accent',
            },
            {
              label: 'MAYOR ROBO',
              value: ev.biggestSteal?.playerName || '—',
              sublabel: ev.biggestSteal
                ? `#${ev.biggestSteal.overall} → #${ev.biggestSteal.redraftRank} (+${ev.biggestSteal.rankDelta})`
                : 'Sin robos en muestra',
              tone: 'positive',
            },
            {
              label: 'NOTA CAMADA',
              value: `${ev.classGrade} · ${ev.classPowerIndex.toFixed(1)}`,
              sublabel: `Top 5 medio ${ev.top5AvgScore.toFixed(1)} · ${ev.activeIn2027Count} activos`,
              tone: 'sky',
            },
          ],
          columns: [
            { key: 'rd', label: 'RE-DRAFT', align: 'right', widthWeight: 0.7 },
            { key: 'real', label: 'REAL', align: 'right', widthWeight: 0.6 },
            { key: 'delta', label: 'Δ POS', align: 'right', widthWeight: 0.65 },
            { key: 'idx', label: 'ÍNDICE', align: 'right', widthWeight: 0.75 },
            { key: 'ppg', label: 'CARRERA', align: 'right', widthWeight: 0.85 },
          ],
          rows: topRows.map((p) => ({
            teamAbbr: p.draftedByTeamAbbr,
            entityName: p.playerName,
            entitySubtext: `${p.draftedByTeamAbbr} · ${p.position} · ${p.origin}`,
            cells: {
              rd: { text: `#${p.redraftRank}`, tone: p.redraftRank <= 3 ? 'accent' : 'neutral' },
              real: { text: `#${p.overall}` },
              delta: {
                text: p.rankDelta > 0 ? `+${p.rankDelta}` : `${p.rankDelta}`,
                tone: p.rankDelta >= 5 ? 'positive' : p.rankDelta <= -5 ? 'negative' : 'neutral',
              },
              idx: { text: p.redraftScore.toFixed(1), subtext: `Esp. ${p.expectedScore.toFixed(0)}` },
              ppg: {
                text: p.careerPpg != null ? `${formatOptStat(p.careerPpg)} PTS` : '—',
                subtext: p.careerGmScPg != null ? `GmSc ${formatOptStat(p.careerGmScPg)}` : undefined,
              },
            },
          })),
          editorialVerdict: `En el Re-Draft ${ev.year} (${modeMeta.label}), ${ev.redraftNumberOne?.playerName || 'el líder'} domina con índice ${ev.redraftNumberOne?.redraftScore.toFixed(1) || '—'}${ev.biggestSteal ? ` y ${ev.biggestSteal.playerName} (#${ev.biggestSteal.overall} → #${ev.biggestSteal.redraftRank}) firma el mayor robo de la camada` : ''}.`,
        });
      }
    }

    if (activeTab === 'steals') {
      const topSteals = getGlobalStealsRanking(evaluatedClasses, { minYear: 2003, maxYear: 2026, minPickOverall: 10 }).slice(0, 18);
      return buildTableSnapshotBlob({
        filename: `radarnba-draft-robos-${dateSlug}.png`,
        categoryTag: 'EVALUADOR DRAFT NBA · HALL DE ROBOS',
        title: 'Mayores Robos Históricos del Draft NBA (2003–2026)',
        subtitle: 'Jugadores elegidos fuera del Top 9 cuyo rendimiento NBA pulverizó la expectativa de su pick',
        entityColumnLabel: 'JUGADOR (CAMADA Y EQUIPO)',
        entityColumnWeight: 2.1,
        showRank: true,
        kpis: [
          {
            label: '#1 MAYOR ROBO',
            value: topSteals[0]?.playerName || '—',
            sublabel: topSteals[0]
              ? `Draft ${topSteals[0].year} · Pick #${topSteals[0].overall} → #${topSteals[0].redraftRank}`
              : '—',
            tone: 'positive',
          },
          {
            label: '#2 MAYOR ROBO',
            value: topSteals[1]?.playerName || '—',
            sublabel: topSteals[1]
              ? `Draft ${topSteals[1].year} · Pick #${topSteals[1].overall} → #${topSteals[1].redraftRank}`
              : '—',
            tone: 'accent',
          },
          {
            label: 'CRITERIO',
            value: getRedraftModeMeta(redraftMode).shortLabel,
            sublabel: 'Valor sobre curva de pick',
            tone: 'sky',
          },
        ],
        columns: [
          { key: 'yr', label: 'AÑO / PICK', align: 'right', widthWeight: 0.9 },
          { key: 'rd', label: 'RE-DRAFT', align: 'right', widthWeight: 0.8 },
          { key: 'idx', label: 'ÍNDICE', align: 'right', widthWeight: 0.7 },
          { key: 'voe', label: '±VALOR', align: 'right', widthWeight: 0.75 },
          { key: 'ppg', label: 'CARRERA', align: 'right', widthWeight: 0.85 },
        ],
        rows: topSteals.map((p) => ({
          teamAbbr: p.draftedByTeamAbbr,
          entityName: p.playerName,
          entitySubtext: `${p.draftedByTeamAbbr} · ${p.origin}`,
          cells: {
            yr: { text: `${p.year} · #${p.overall}`, tone: 'accent' },
            rd: { text: `#${p.redraftRank} (+${p.rankDelta})`, tone: 'positive' },
            idx: { text: p.redraftScore.toFixed(1) },
            voe: { text: `+${p.valueOverExpected.toFixed(1)}`, tone: 'positive' },
            ppg: { text: p.careerPpg != null ? `${formatOptStat(p.careerPpg)} PTS` : '—' },
          },
        })),
        editorialVerdict: `${topSteals[0]?.playerName || 'El líder'} (Pick #${topSteals[0]?.overall || '—'} en ${topSteals[0]?.year || '—'}) encabeza el ranking histórico de robos del Draft con +${topSteals[0]?.valueOverExpected.toFixed(1) || '0'} puntos sobre el valor esperado de su elección.`,
      });
    }

    if (activeTab === 'compare') {
      const modernRanked = [...evaluatedClasses]
        .filter((c) => c.year >= 2014)
        .sort((a, b) => b.classPowerIndex - a.classPowerIndex);
      return buildTableSnapshotBlob({
        filename: `radarnba-draft-ranking-camadas-${dateSlug}.png`,
        categoryTag: 'EVALUADOR DRAFT NBA · COMPARATIVA DE CAMADAS',
        title: 'Ranking de Camadas Modernas del Draft NBA (2014–2026)',
        subtitle: 'Clasificación por Poder de Camada, estrellas ≥20 PTS, acierto de lotería y talento activo 2026–27',
        entityColumnLabel: 'CAMADA (#1 RE-DRAFT)',
        entityColumnWeight: 2.1,
        showRank: true,
        kpis: [
          {
            label: 'MEJOR CAMADA',
            value: modernRanked[0] ? `Draft ${modernRanked[0].year}` : '—',
            sublabel: modernRanked[0]
              ? `Nota ${modernRanked[0].classGrade} · Poder ${modernRanked[0].classPowerIndex.toFixed(1)}`
              : '—',
            tone: 'accent',
          },
          {
            label: 'MÁS ESTRELLAS',
            value:
              modernRanked.length > 0
                ? `Draft ${[...modernRanked].sort((a, b) => b.starsCount - a.starsCount)[0].year}`
                : '—',
            sublabel:
              modernRanked.length > 0
                ? `${[...modernRanked].sort((a, b) => b.starsCount - a.starsCount)[0].starsCount} estrellas ≥20 PTS`
                : '—',
            tone: 'positive',
          },
          {
            label: 'CRITERIO',
            value: getRedraftModeMeta(redraftMode).shortLabel,
            sublabel: '13 camadas modernas',
            tone: 'sky',
          },
        ],
        columns: [
          { key: 'grade', label: 'NOTA', align: 'right', widthWeight: 0.6 },
          { key: 'pwr', label: 'PODER', align: 'right', widthWeight: 0.7 },
          { key: 'stars', label: 'ESTR.', align: 'right', widthWeight: 0.65 },
          { key: 'lot', label: 'LOT. %', align: 'right', widthWeight: 0.7 },
          { key: 'act', label: 'ACTIVOS', align: 'right', widthWeight: 0.75 },
        ],
        rows: modernRanked.map((cls) => ({
          teamAbbr: cls.redraftNumberOne?.draftedByTeamAbbr || 'NBA',
          entityName: `Draft NBA ${cls.year}`,
          entitySubtext: `#1 Re-Draft: ${cls.redraftNumberOne?.playerName || '—'} (#${cls.redraftNumberOne?.overall || 1})`,
          cells: {
            grade: { text: cls.classGrade, tone: cls.classGrade === 'S' || cls.classGrade === 'A+' ? 'accent' : 'neutral' },
            pwr: { text: cls.classPowerIndex.toFixed(1), tone: 'positive' },
            stars: { text: `${cls.starsCount}` },
            lot: { text: `${cls.lotteryHitRatePct}%` },
            act: { text: `${cls.activeIn2027Count}` },
          },
        })),
        editorialVerdict: `La camada del Draft ${modernRanked[0]?.year || '—'} lidera la era moderna (2014–2026) con nota ${modernRanked[0]?.classGrade || '—'} (${modernRanked[0]?.classPowerIndex.toFixed(1) || '—'}/100) y ${modernRanked[0]?.starsCount || 0} jugadores de calibre estrella.`,
      });
    }

    if (activeTab === 'future' && futurePicksData) {
      const topTeams = [...futurePicksData.teams]
        .sort((a, b) => b.draftCapitalScore - a.draftCapitalScore)
        .slice(0, 20);
      const leader = topTeams[0];
      const mostFirsts = [...futurePicksData.teams].sort(
        (a, b) => b.controlledFirsts - a.controlledFirsts
      )[0];
      return buildTableSnapshotBlob({
        filename: `radarnba-rondas-futuras-2027-2033-${dateSlug}.png`,
        categoryTag: 'CAPITAL DE DRAFT NBA · INVENTARIO 2027–2033',
        title: 'Ranking de Rondas Futuras NBA (2027–2033)',
        subtitle: `${futurePicksData.summary.totalControlledFirsts} primeras rondas y ${futurePicksData.summary.totalControlledSeconds} segundas rondas controladas · Regla Ted Stepien aplicada`,
        entityColumnLabel: 'FRANQUICIA',
        entityColumnWeight: 2.0,
        showRank: true,
        kpis: [
          {
            label: 'LÍDER CAPITAL',
            value: leader ? `${leader.teamAbbr} · ${leader.draftCapitalScore.toFixed(1)}` : '—',
            sublabel: leader
              ? `${leader.controlledFirsts} 1ªR · ${leader.controlledSeconds} 2ªR`
              : '—',
            tone: 'accent',
          },
          {
            label: 'MÁS PRIMERAS RONDAS',
            value: mostFirsts ? `${mostFirsts.teamAbbr} (${mostFirsts.controlledFirsts})` : '—',
            sublabel: mostFirsts
              ? `${mostFirsts.tradableFirsts} traspasables hoy`
              : '—',
            tone: 'positive',
          },
          {
            label: 'BLOQUEOS STEPIEN',
            value: `${futurePicksData.summary.totalStepienLocks} picks`,
            sublabel: '1ª rondas bloqueadas hoy',
            tone: 'sky',
          },
        ],
        columns: [
          { key: 'r1', label: '1ª RONDAS', align: 'right', widthWeight: 0.8 },
          { key: 'tr', label: 'TRASP.', align: 'right', widthWeight: 0.7 },
          { key: 'r2', label: '2ª RONDAS', align: 'right', widthWeight: 0.8 },
          { key: 'sw', label: 'SWAPS+', align: 'right', widthWeight: 0.7 },
          { key: 'cap', label: 'CAPITAL', align: 'right', widthWeight: 0.85 },
        ],
        rows: topTeams.map((t) => ({
          teamAbbr: t.teamAbbr,
          entityName: t.teamName,
          entitySubtext: `${t.tradableFirsts} 1ªR libres · ${t.stepienLockedFirsts} bloqueadas Stepien`,
          cells: {
            r1: { text: `${t.controlledFirsts}`, tone: t.controlledFirsts >= 9 ? 'accent' : 'neutral' },
            tr: { text: `${t.tradableFirsts}`, tone: t.tradableFirsts >= 6 ? 'positive' : 'neutral' },
            r2: { text: `${t.controlledSeconds}` },
            sw: { text: `${t.favorableSwaps}`, tone: t.favorableSwaps > 0 ? 'sky' : 'neutral' },
            cap: { text: t.draftCapitalScore.toFixed(1), tone: 'positive' },
          },
        })),
        editorialVerdict: `${leader?.teamName || 'El líder'} encabeza el arsenal futuro NBA (2027–2033) con ${leader?.controlledFirsts || 0} primeras rondas (${leader?.tradableFirsts || 0} traspasables bajo la Regla Stepien) y un Capital de Draft de ${leader?.draftCapitalScore.toFixed(1) || '—'}.`,
      });
    }

    const globalRows = filteredGlobalPicks.slice(0, 20);
    return buildTableSnapshotBlob({
      filename: `radarnba-draft-buscador-${dateSlug}.png`,
      categoryTag: `EXPLORADOR HISTÓRICO DRAFT NBA (${draftData?.minYear || 2001}–${draftData?.maxYear || 2026})`,
      title: 'Selección Histórica del Draft NBA',
      subtitle: `${filteredGlobalPicks.length} elecciones encontradas · Rango de picks #${globalPickMin}–#${globalPickMax}${globalTeamFilter !== 'all' ? ` · Franquicia ${globalTeamFilter}` : ''}`,
      entityColumnLabel: 'JUGADOR (CAMADA)',
      entityColumnWeight: 2.1,
      showRank: false,
      kpis: [
        {
          label: 'COINCIDENCIAS',
          value: `${filteredGlobalPicks.length} picks`,
          sublabel: `De ${summary?.totalPicks || 0} históricos`,
          tone: 'accent',
        },
        {
          label: 'ACTIVOS EN 26–27',
          value: `${filteredGlobalPicks.filter((p) => p.isActive2027).length}`,
          sublabel: 'En plantilla esta temporada',
          tone: 'positive',
        },
        {
          label: 'CAMADAS CUBIERTAS',
          value: `${summary?.totalClasses || 26} años`,
          sublabel: `${draftData?.minYear || 2001}–${draftData?.maxYear || 2026}`,
          tone: 'sky',
        },
      ],
      columns: [
        { key: 'yr', label: 'AÑO / PICK', align: 'right', widthWeight: 0.9 },
        { key: 'team', label: 'EQ.', align: 'left', widthWeight: 0.65 },
        { key: 's27', label: '26-27 PTS', align: 'right', widthWeight: 0.85 },
        { key: 'cPpg', label: 'CARRERA', align: 'right', widthWeight: 0.9 },
        { key: 'cPts', label: 'PTS TOT.', align: 'right', widthWeight: 0.9 },
      ],
      rows: globalRows.map((p) => ({
        teamAbbr: p.draftedByTeamAbbr,
        entityName: p.playerName,
        entitySubtext: `${p.position} · ${p.origin}`,
        cells: {
          yr: {
            text: `${p.year} · #${p.overall}`,
            subtext: `R${p.round}`,
            tone: p.overall === 1 ? 'accent' : 'neutral',
          },
          team: { text: p.draftedByTeamAbbr },
          s27: {
            text: p.season27PtsPg != null ? `${formatOptStat(p.season27PtsPg)}` : '—',
            tone: p.season27PtsPg != null && p.season27PtsPg >= 18 ? 'positive' : 'neutral',
          },
          cPpg: { text: p.careerPpg != null ? `${formatOptStat(p.careerPpg)} PTS` : '—' },
          cPts: { text: p.careerPtsTotal !== null ? formatOptInt(p.careerPtsTotal) : '—' },
        },
      })),
      editorialVerdict: `Consulta histórica sobre ${summary?.totalClasses || 26} ediciones del Draft NBA (${draftData?.minYear || 2001}–${draftData?.maxYear || 2026}) con ${filteredGlobalPicks.length} elecciones filtradas.`,
    });
  };

  if (loading && !draftData) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-4 space-y-2 animate-pulse">
              <div className="h-3 w-28 bg-[#1E293B] rounded" />
              <div className="h-7 w-20 bg-[#1E293B] rounded" />
              <div className="h-3 w-36 bg-[#1E293B] rounded" />
            </div>
          ))}
        </div>
        <div className="h-96 bg-[#131C2E] border border-[#1E293B] rounded-lg p-6 animate-pulse" />
      </div>
    );
  }

  if (errorMsg && !draftData) {
    return (
      <div className="bg-[#131C2E] border border-rose-500/30 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              No se pudo cargar el archivo histórico del Draft NBA
            </h2>
            <p className="text-xs text-slate-400 mt-1">{errorMsg}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reintentar
        </button>
      </div>
    );
  }

  const numberOnePick = activeClass?.picks.find((p) => p.overall === 1) || activeClass?.picks[0];

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            <GraduationCap className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span>Archivo Oficial NBA Draft</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {draftData?.minYear || 2001}–{draftData?.maxYear || 2026} ({summary?.totalClasses || 0} ediciones)
            </span>
            <span aria-hidden="true">·</span>
            <span>Cruce en vivo con carrera y temporada 2026–27</span>
          </div>
          <h2 className="font-display text-xl md:text-2xl font-bold text-slate-100 mt-1">
            Draft NBA — Archivo Histórico, Evaluador y Rondas Futuras
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Explora cada camada del Draft NBA (2001–2026), recalcula el Re-Draft por rendimiento real, audita robos y ojo clínico por franquicia, y consulta el inventario oficial de rondas futuras 2027–2033 con la Regla Ted Stepien.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="h-9 px-3 rounded-lg bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/50 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar archivo
          </button>
          <ExportImageButton onBuildImage={handleExportSnapshot} />
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
        <div className="p-4">
          <div className="text-xs text-slate-400">Camadas registradas</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-orange-400">
              {summary?.totalClasses || 0}
            </span>
            <span className="text-xs text-slate-400">ediciones</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            Desde {draftData?.minYear || 2001} hasta {draftData?.maxYear || 2026}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Elecciones totales</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-slate-100">
              {formatOptInt(summary?.totalPicks)}
            </span>
            <span className="text-xs text-slate-400">picks</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {formatOptInt(summary?.lotteryPicksCount)} de Lotería (Top 14)
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Activos en NBA 2026–27</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-emerald-400">
              {formatOptInt(summary?.activeIn2027Count)}
            </span>
            <span className="text-xs text-slate-400">en activo</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {formatOptInt(summary?.secondRoundActiveCount)} elegidos en 2ª ronda
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">
            Pick #1 · Camada {activeClass?.year || selectedYear}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-amber-300 truncate">
              {activeClass?.numberOnePickName || '—'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {activeClass?.numberOneTeamAbbr || '—'} · {activeClass?.activeIn2027Count || 0} activos en 26–27
          </div>
        </div>
      </div>

      {/* Hub Tabs Navigation */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3">
        <div className="inline-flex items-center gap-1.5 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto max-w-full">
          {[
            { id: 'class', label: 'Archivo por Camada', icon: Calendar },
            { id: 'redraft', label: 'Re-Draft y Acierto', icon: Crown },
            { id: 'steals', label: 'Robos y Decepciones', icon: Flame },
            { id: 'compare', label: 'Camadas y Franquicias', icon: BarChart3 },
            { id: 'future', label: 'Rondas Futuras 27–33', icon: Briefcase },
            { id: 'explorer', label: 'Buscador Global', icon: Search },
          ].map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as DraftTab)}
                className={`h-9 px-3.5 rounded-md text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-orange-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SINGLE DRAFT CLASS ARCHIVE (2001-2026) */}
      {/* ========================================================================= */}
      {activeTab === 'class' && activeClass && (
        <div className="space-y-5">
          {/* Year Timeline Strip */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-orange-400" />
                <span>Selecciona una edición del Draft NBA</span>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                Mostrando {activeClass.displayName} ({activeClass.pickCount} elecciones)
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {(draftData?.availableYears || []).map((yr) => {
                const isSelected = yr === activeClass.year;
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => {
                      setSelectedYear(yr);
                      setClassTeamFilter('all');
                    }}
                    className={`h-8 px-3 rounded-md font-mono tabular-nums text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-orange-500 text-slate-950 shadow-sm'
                        : 'bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:border-orange-500/50 hover:text-white'
                    }`}
                  >
                    {yr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Class Spotlight Banner (#1 Pick + Quick Class Breakdown) */}
          {numberOnePick && (
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <PlayerAvatar
                  playerId={numberOnePick.playerId}
                  name={numberOnePick.playerName}
                  headshotUrl={numberOnePick.headshotUrl}
                  teamAbbr={numberOnePick.draftedByTeamAbbr}
                  size="lg"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold">
                    <Trophy className="w-3.5 h-3.5 shrink-0" />
                    <span>Pick #1 · Draft NBA {activeClass.year}</span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {numberOnePick.playerId ? (
                      <button
                        type="button"
                        onClick={() => onInspectEntity('player', numberOnePick.playerId!)}
                        className="font-display text-lg font-bold text-slate-100 hover:text-orange-300 text-left"
                      >
                        {numberOnePick.playerName}
                      </button>
                    ) : (
                      <h3 className="font-display text-lg font-bold text-slate-100">
                        {numberOnePick.playerName}
                      </h3>
                    )}
                    <span className="text-xs text-slate-400">
                      {numberOnePick.position} · {numberOnePick.origin}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                    <TeamLogo
                      abbr={numberOnePick.draftedByTeamAbbr}
                      teamId=""
                      logoUrl={numberOnePick.draftedByLogoUrl}
                      size="sm"
                    />
                    <span>Elegido por {numberOnePick.draftedByTeamName}</span>
                    {numberOnePick.careerPpg !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-200">
                          Carrera: {numberOnePick.careerPpg.toFixed(1)} PTS / {formatOptStat(numberOnePick.careerRpg)} REB / {formatOptStat(numberOnePick.careerApg)} AST
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-[#1E293B] shrink-0">
                <div className="grid grid-cols-3 gap-3 font-mono tabular-nums">
                  <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg px-3 py-2 text-center">
                    <div className="text-[10px] text-slate-400">Lotería</div>
                    <div className="text-sm font-bold text-amber-300 mt-0.5">
                      {activeClass.lotteryCount}
                    </div>
                  </div>
                  <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg px-3 py-2 text-center">
                    <div className="text-[10px] text-slate-400">1ª Ronda</div>
                    <div className="text-sm font-bold text-sky-300 mt-0.5">
                      {activeClass.lotteryCount + activeClass.firstRoundCount}
                    </div>
                  </div>
                  <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg px-3 py-2 text-center">
                    <div className="text-[10px] text-slate-400">Activos 26-27</div>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">
                      {activeClass.activeIn2027Count}
                    </div>
                  </div>
                </div>
                {activeClass.trackedCareerCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleJumpToClassRedraft(activeClass.year)}
                    className="h-8 px-3 rounded-lg bg-[#0B1120] border border-orange-500/40 hover:border-orange-400 text-xs font-semibold text-orange-300 hover:text-orange-200 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>Ver Re-Draft {activeClass.year} →</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Class Filter Bar & Full Draft Board Table */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                    placeholder="Buscar jugador, universidad, equipo..."
                    className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/60"
                  />
                </div>

                <div
                  className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg"
                  role="group"
                  aria-label="Filtrar por ronda"
                >
                  {(
                    [
                      ['all', 'Todos'],
                      ['lottery', 'Lotería (1–14)'],
                      ['first_round', '1ª Ronda (15–30)'],
                      ['second_round', '2ª Ronda (31+)'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setClassTierFilter(val)}
                      className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        classTierFilter === val
                          ? 'bg-orange-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Filtrar por franquicia selectora"
                  value={classTeamFilter}
                  onChange={(e) => setClassTeamFilter(e.target.value)}
                  className="h-9 px-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
                >
                  <option value="all">Todas las franquicias</option>
                  {classTeamOptions.map(([abbr, name]) => (
                    <option key={abbr} value={abbr}>
                      {abbr} · {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 shrink-0 flex-wrap">
                <span className="hidden xl:inline-flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="text-amber-300 font-semibold">● Lotería</span>
                  <span className="text-sky-300 font-semibold">● 1ª R</span>
                  <span className="text-emerald-400 font-semibold">● 2ª R</span>
                </span>
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={classOnlyActive}
                    onChange={(e) => setClassOnlyActive(e.target.checked)}
                    className="rounded border-slate-600 text-orange-500 focus:ring-0"
                  />
                  <span>Solo activos en 2026–27</span>
                </label>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {filteredClassPicks.length} picks
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-[#1E293B]">
                    <th className="py-2.5 px-2.5 font-medium whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleClassSort('overall')}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        <span>Pick</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-medium">Jugador y procedencia</th>
                    <th className="py-2.5 px-2.5 font-medium">Franquicia</th>
                    <th className="py-2.5 px-2 text-center font-medium">Pos / Talla</th>
                    <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleClassSort('season27PtsPg')}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        <span>26–27 PTS</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleClassSort('careerPpg')}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        <span>Carrera PTS</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleClassSort('careerGp')}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        <span>PJ Carr.</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleClassSort('careerPtsTotal')}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        <span>PTS Tot.</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right font-medium">Ficha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/60 text-xs">
                  {filteredClassPicks.map((p) => {
                    const tierMeta = getDraftTierMeta(p.tier);
                    const tradeNoteEs = formatDraftTradeNoteEs(p.tradeNote);
                    return (
                      <tr key={p.id} className="hover:bg-[#182338]/60 transition-colors">
                        <td
                          className="py-2.5 px-2 w-14 font-mono tabular-nums whitespace-nowrap"
                          title={`Ronda ${p.round} · ${tierMeta.labelEs}`}
                        >
                          <div className={`font-bold ${tierMeta.textClass}`}>
                            #{p.overall}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            R{p.round}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <PlayerAvatar
                              playerId={p.playerId}
                              name={p.playerName}
                              headshotUrl={p.headshotUrl}
                              teamAbbr={p.currentTeamAbbr || p.draftedByTeamAbbr}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {p.playerId ? (
                                  <button
                                    type="button"
                                    onClick={() => onInspectEntity('player', p.playerId!)}
                                    className="font-semibold text-slate-100 hover:text-orange-300 text-left"
                                  >
                                    {p.playerName}
                                  </button>
                                ) : (
                                  <span className="font-semibold text-slate-200">
                                    {p.playerName}
                                  </span>
                                )}
                                {p.isActive2027 && (
                                  <span className="text-[10px] font-mono font-semibold text-emerald-400">
                                    · Activo {p.currentTeamAbbr || ''}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate max-w-[260px]">
                                {p.origin}
                                {tradeNoteEs ? ` · ${tradeNoteEs}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <TeamLogo
                              abbr={p.draftedByTeamAbbr}
                              teamId=""
                              logoUrl={p.draftedByLogoUrl}
                              size="sm"
                            />
                            <span className="font-mono font-bold text-slate-200">
                              {p.draftedByTeamAbbr}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          <div>{p.position}</div>
                          <div className="text-[10px] text-slate-500">{p.height}</div>
                        </td>

                        <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                          {p.season27PtsPg !== null ? (
                            <div>
                              <div className="font-bold text-emerald-400">
                                {p.season27PtsPg.toFixed(1)}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {formatOptStat(p.season27RebPg)}r · {formatOptStat(p.season27AstPg)}a
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                          {p.careerPpg !== null ? (
                            <div>
                              <div className="font-bold text-slate-100">
                                {p.careerPpg.toFixed(1)}
                              </div>
                              {p.careerPeakPpg !== null && (
                                <div className="text-[10px] text-slate-400">
                                  Peak {p.careerPeakPpg.toFixed(1)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {formatOptInt(p.careerGp)}
                        </td>

                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                          {formatOptInt(p.careerPtsTotal)}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {p.playerId ? (
                            <button
                              type="button"
                              onClick={() => onInspectEntity('player', p.playerId!)}
                              className="h-7 px-2.5 rounded bg-[#0B1120] border border-[#1E293B] hover:border-orange-500 text-[11px] font-medium text-slate-200 transition-colors"
                            >
                              Inspeccionar
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredClassPicks.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-xs text-slate-400">
                        No hay elecciones en el Draft {activeClass.year} que coincidan con estos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: RE-DRAFT & CLASS EVALUATOR (FASE 17B) */}
      {/* ========================================================================= */}
      {activeTab === 'redraft' && (
        <DraftRedraftPanel
          evaluatedClasses={evaluatedClasses}
          selectedYear={redraftYear}
          onSelectYear={setRedraftYear}
          redraftMode={redraftMode}
          onChangeRedraftMode={setRedraftMode}
          onInspectEntity={onInspectEntity}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 3: GLOBAL STEALS & LOTTERY MISSES (FASE 17B) */}
      {/* ========================================================================= */}
      {activeTab === 'steals' && (
        <DraftStealsPanel
          evaluatedClasses={evaluatedClasses}
          redraftMode={redraftMode}
          onChangeRedraftMode={setRedraftMode}
          onInspectEntity={onInspectEntity}
          onJumpToClassRedraft={handleJumpToClassRedraft}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CLASS-VS-CLASS COMPARATOR & FRANCHISE EFFICIENCY (FASE 17B) */}
      {/* ========================================================================= */}
      {activeTab === 'compare' && (
        <DraftComparePanel
          evaluatedClasses={evaluatedClasses}
          redraftMode={redraftMode}
          onChangeRedraftMode={setRedraftMode}
          onInspectEntity={onInspectEntity}
          onJumpToClassRedraft={handleJumpToClassRedraft}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 5: GLOBAL MULTI-YEAR EXPLORER (2001-2026) */}
      {/* ========================================================================= */}
      {activeTab === 'explorer' && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Filter className="w-4 h-4 text-orange-400" />
                Buscador Histórico Transversal ({draftData?.minYear || 2001}–{draftData?.maxYear || 2026})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Cruza todas las camadas a la vez por jugador, universidad o país, franquicia selectora y horquilla exacta de pick.
              </p>
            </div>

            {/* Quick Explorer Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Consultas rápidas:
              </span>
              {[
                { id: 'number_ones', label: 'Todos los #1' },
                { id: 'second_round_gems', label: '2ª Ronda activos' },
                { id: 'lottery_scorers', label: 'Lotería top 26–27' },
                { id: 'duke_alumni', label: 'Cantera Duke' },
              ].map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() =>
                    handleApplyGlobalPreset(
                      pr.id as 'number_ones' | 'second_round_gems' | 'lottery_scorers' | 'duke_alumni'
                    )
                  }
                  className="h-7 px-2.5 rounded-md bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-[11px] font-medium text-slate-200 transition-colors whitespace-nowrap"
                >
                  {pr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 bg-[#0B1120] border border-[#1E293B] rounded-lg p-3">
            <div className="relative lg:col-span-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={globalQuery}
                onChange={(e) => {
                  setGlobalQuery(e.target.value);
                  setGlobalVisibleLimit(80);
                }}
                placeholder="Jugador, universidad, país o año..."
                className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#131C2E] border border-[#1E293B] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/60"
              />
            </div>

            <select
              aria-label="Filtrar por franquicia"
              value={globalTeamFilter}
              onChange={(e) => {
                setGlobalTeamFilter(e.target.value);
                setGlobalVisibleLimit(80);
              }}
              className="h-9 px-2.5 rounded-lg bg-[#131C2E] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
            >
              <option value="all">Todas las franquicias</option>
              {ALL_NBA_TEAM_ABBRS.map((abbr) => (
                <option key={abbr} value={abbr}>
                  {abbr} · {NBA_TEAMS_MAP[abbr]?.name || abbr}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por tramo del Draft"
              value={globalTierFilter}
              onChange={(e) => {
                setGlobalTierFilter(e.target.value as TierFilter);
                setGlobalVisibleLimit(80);
              }}
              className="h-9 px-2.5 rounded-lg bg-[#131C2E] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
            >
              <option value="all">Todas las rondas</option>
              <option value="lottery">Lotería (1–14)</option>
              <option value="first_round">1ª Ronda (15–30)</option>
              <option value="second_round">2ª Ronda (31+)</option>
            </select>

            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={60}
                value={globalPickMin}
                onChange={(e) => setGlobalPickMin(e.target.value)}
                aria-label="Pick mínimo"
                className="w-full h-9 px-2 rounded-lg bg-[#131C2E] border border-[#1E293B] text-xs font-mono tabular-nums text-slate-100 text-center focus:outline-none focus:border-orange-500/60"
                title="Pick mínimo"
              />
              <span className="text-xs text-slate-500">–</span>
              <input
                type="number"
                min={1}
                max={65}
                value={globalPickMax}
                onChange={(e) => setGlobalPickMax(e.target.value)}
                aria-label="Pick máximo"
                className="w-full h-9 px-2 rounded-lg bg-[#131C2E] border border-[#1E293B] text-xs font-mono tabular-nums text-slate-100 text-center focus:outline-none focus:border-orange-500/60"
                title="Pick máximo"
              />
            </div>

            <select
              aria-label="Ordenar resultados globales"
              value={globalSortKey}
              onChange={(e) =>
                setGlobalSortKey(
                  e.target.value as
                    | 'year_desc'
                    | 'overall'
                    | 'careerPpg'
                    | 'season27PtsPg'
                    | 'careerPtsTotal'
                )
              }
              className="h-9 px-2.5 rounded-lg bg-[#131C2E] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
            >
              <option value="year_desc">Año más reciente</option>
              <option value="overall">Pick más alto</option>
              <option value="careerPpg">Mejor media Carrera PTS</option>
              <option value="season27PtsPg">Mejor 2026–27 PTS</option>
              <option value="careerPtsTotal">Más Puntos Totales</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={globalOnlyActive}
                onChange={(e) => setGlobalOnlyActive(e.target.checked)}
                className="rounded border-slate-600 text-orange-500 focus:ring-0"
              />
              <span>Solo jugadores activos en la NBA 2026–27</span>
            </label>
            <div className="font-mono tabular-nums text-slate-400">
              {filteredGlobalPicks.length} elecciones encontradas
            </div>
          </div>

          {/* Global Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-[#1E293B]">
                  <th className="py-2.5 px-2.5 font-medium">Año / Pick</th>
                  <th className="py-2.5 px-3 font-medium">Jugador y procedencia</th>
                  <th className="py-2.5 px-2.5 font-medium">Elegido por</th>
                  <th className="py-2.5 px-2 text-right font-medium">26–27 PTS</th>
                  <th className="py-2.5 px-2 text-right font-medium">Carrera PTS</th>
                  <th className="py-2.5 px-2 text-right font-medium">PJ Carr.</th>
                  <th className="py-2.5 px-2 text-right font-medium">PTS Tot.</th>
                  <th className="py-2.5 px-3 text-right font-medium">Ficha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]/60 text-xs">
                {filteredGlobalPicks.slice(0, globalVisibleLimit).map((p) => {
                  const tierMeta = getDraftTierMeta(p.tier);
                  return (
                    <tr key={p.id} className="hover:bg-[#182338]/60 transition-colors">
                      <td className="py-2.5 px-2.5 font-mono tabular-nums whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedYear(p.year);
                            setActiveTab('class');
                          }}
                          className="font-bold text-slate-100 hover:text-orange-400"
                          title={`Abrir camada completa ${p.year}`}
                        >
                          {p.year}
                        </button>
                        <span
                          className={`ml-1.5 font-bold ${tierMeta.textClass}`}
                          title={`Ronda ${p.round} · ${tierMeta.labelEs}`}
                        >
                          #{p.overall}
                        </span>
                        <div className="text-[10px] text-slate-500">
                          R{p.round}
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <PlayerAvatar
                            playerId={p.playerId}
                            name={p.playerName}
                            headshotUrl={p.headshotUrl}
                            teamAbbr={p.currentTeamAbbr || p.draftedByTeamAbbr}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {p.playerId ? (
                                <button
                                  type="button"
                                  onClick={() => onInspectEntity('player', p.playerId!)}
                                  className="font-semibold text-slate-100 hover:text-orange-300 text-left"
                                >
                                  {p.playerName}
                                </button>
                              ) : (
                                <span className="font-semibold text-slate-200">
                                  {p.playerName}
                                </span>
                              )}
                              {p.isActive2027 && (
                                <span className="text-[10px] font-mono font-semibold text-emerald-400">
                                  · {p.currentTeamAbbr || 'Activo'}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[260px]">
                              {p.position} · {p.origin}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <TeamLogo
                            abbr={p.draftedByTeamAbbr}
                            teamId=""
                            logoUrl={p.draftedByLogoUrl}
                            size="sm"
                          />
                          <span className="font-mono font-bold text-slate-200">
                            {p.draftedByTeamAbbr}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {p.season27PtsPg !== null ? (
                          <span className="font-bold text-emerald-400">
                            {p.season27PtsPg.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {p.careerPpg !== null ? (
                          <span className="font-bold text-slate-100">
                            {p.careerPpg.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {formatOptInt(p.careerGp)}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {formatOptInt(p.careerPtsTotal)}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {p.playerId ? (
                          <button
                            type="button"
                            onClick={() => onInspectEntity('player', p.playerId!)}
                            className="h-7 px-2.5 rounded bg-[#0B1120] border border-[#1E293B] hover:border-orange-500 text-[11px] font-medium text-slate-200 transition-colors"
                          >
                            Inspeccionar
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredGlobalPicks.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-xs text-slate-400">
                      Ninguna elección del Draft coincide con los filtros actuales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredGlobalPicks.length > globalVisibleLimit && (
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setGlobalVisibleLimit((prev) => prev + 100)}
                className="h-9 px-4 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 transition-colors"
              >
                <Users className="w-3.5 h-3.5 text-orange-400" />
                Mostrar 100 elecciones más ({filteredGlobalPicks.length - globalVisibleLimit} restantes)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: FUTURE DRAFT PICKS INVENTORY (2027-2033) & STEPIEN RULE */}
      {/* ========================================================================= */}
      {activeTab === 'future' && (
        <DraftFuturePicksTab
          futurePicksData={futurePicksData}
          loading={futurePicksLoading}
          errorMsg={futurePicksError}
          onRefresh={() => onRefreshFuturePicks?.()}
          onInspectEntity={onInspectEntity}
          onOpenTradeMachine={onOpenTradeMachine}
        />
      )}
    </div>
  );
}
