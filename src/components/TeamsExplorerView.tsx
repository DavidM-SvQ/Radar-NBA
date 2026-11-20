import { useEffect, useMemo, useState } from 'react';
import { Search, Sliders, Star } from 'lucide-react';
import type {
  ExperienceMode,
  NbaAdvancedCategory,
  NbaClutchEntry,
  NbaDefenseHustleEntry,
  NbaFourFactorsEntry,
  NbaHeroicShotCountSummary,
  NbaHeroicShotsResponse,
  NbaPlaytypeEntitySummary,
  NbaScoringSplitsEntry,
  NbaShotZonesEntry,
  NbaTrackingEntry,
  NbaViolationsEntry,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import {
  DEFAULT_UNIFIED_FILTERS,
  matchesTeamUnifiedFilters,
  type UnifiedTableFiltersState,
} from '../utils/entityFilters';
import { UnifiedEntityFilterBar } from './UnifiedEntityFilterBar';
import {
  formatSigned,
  mean,
  normalizeSearchText,
  round1,
} from '../utils/analytics';
import {
  evaluateVsLeague,
  type LeagueBenchmarks,
  type MetricBenchmark,
} from '../utils/humanize';
import {
  MetricInfoTooltip,
  NbaComparisonBar,
  SortableTh,
} from './MetricUiHelpers';
import {
  STICKY_THEAD_CLASS,
  compareSortValues,
  parseStreakCodeValue,
} from '../utils/tableSort';
import { TeamLogo } from './NbaVisuals';
import { LayerColumnCustomizer } from './LayerColumnCustomizer';
import { ExportImageButton } from './ExportImageButton';
import {
  buildTableSnapshotBlob,
  type TableSnapshotCell,
} from '../utils/exportImageCard';

interface TeamsExplorerViewProps {
  teams: TeamSummary[];
  experienceMode: ExperienceMode;
  benchmarks: LeagueBenchmarks;
  seasonToken?: string;
  onSwitchToAdvanced: () => void;
  windowSize: WindowSize;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  showHeroicBadges?: boolean;
}

type TeamTableView =
  | 'basic'
  | 'advanced'
  | 'scoring'
  | 'zones'
  | 'tracking'
  | 'hustle'
  | 'defense'
  | 'clutch'
  | 'playtypes'
  | 'violations';

interface TeamLayerDef {
  id: TeamTableView;
  label: string;
  categoryToFetch?: NbaAdvancedCategory;
  defaultSortKey: string;
  defaultCols: string[];
}

interface EnrichedTeamRow extends TeamSummary {
  statMode: StatScaleMode;
  windowDiff: number;
  ptsForAvg: number;
  ptsAgainstAvg: number;
  orebAvg: number;
  drebAvg: number;
  rebAvg: number;
  fgmAvg: number;
  fgaAvg: number;
  fgPct: number;
  fg3mAvg: number;
  fg3aAvg: number;
  fg3Pct: number;
  ftmAvg: number;
  ftaAvg: number;
  ftPct: number;
  astAvg: number;
  stlAvg: number;
  blkAvg: number;
  tovAvg: number;
  pfAvg: number;
  pfdAvg: number;
  blkaAvg: number;
  astTovRatio: number;
  pctPts3p: number;
  pctPtsPaint: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  winNetRtg: number;
  pace: number;
  efgPct: number;
  tsPct: number;
  orebPct: number;
  tovPct: number;
  pie: number;
  ptsPaint: number;
  oppPtsPaint: number;
  pts2ndChance: number;
  ptsFastBreak: number;
  ptsOffTov: number;
  contestedShots: number;
  deflections: number;
  boxOuts: number;
  advFourFactors?: NbaFourFactorsEntry;
  advScoring?: NbaScoringSplitsEntry;
  advZones?: NbaShotZonesEntry;
  advTracking?: NbaTrackingEntry;
  advDefHustle?: NbaDefenseHustleEntry;
  advClutch?: NbaClutchEntry;
  advPlaytypes?: NbaPlaytypeEntitySummary;
  advViolations?: NbaViolationsEntry;
  buzzerBeaters: number;
  gameWinners: number;
}

interface TeamColDef {
  key: string;
  label: string;
  helpKey?: string;
  benchmarkKey?: keyof LeagueBenchmarks['team'];
  align?: 'left' | 'right';
  isString?: boolean;
  lowerIsBetter?: boolean;
  decimals?: number;
  suffix?: string;
  getNumValue: (r: EnrichedTeamRow) => number | null;
  getStrValue?: (r: EnrichedTeamRow) => string;
  format: (r: EnrichedTeamRow) => string;
  tone?: (r: EnrichedTeamRow) => 'positive' | 'negative' | 'accent' | 'warning' | 'neutral';
}

type StatScaleMode = 'per_game' | 'totals';

const STORAGE_TEAM_COLS_KEY = 'radarnba_cols_teams_v2';
const STORAGE_TEAM_STAT_MODE_KEY = 'radarnba_teams_stat_mode_v1';

const round2 = (v: number): number => Math.round(v * 100) / 100;

function loadTeamStatMode(): StatScaleMode {
  try {
    const raw = localStorage.getItem(STORAGE_TEAM_STAT_MODE_KEY);
    return raw === 'totals' ? 'totals' : 'per_game';
  } catch {
    return 'per_game';
  }
}

const TEAM_LAYERS: TeamLayerDef[] = [
  {
    id: 'basic',
    label: '1. Balance y Racha',
    defaultSortKey: 'winPct',
    defaultCols: ['winPct', 'avgPointsFor', 'avgPointsAgainst', 'differential', 'windowDiff', 'orebAvg', 'rebAvg', 'fg3mAvg', 'streak'],
  },
  {
    id: 'advanced',
    label: '2. Ratings y 4 Factores',
    categoryToFetch: 'four_factors',
    defaultSortKey: 'netRtg',
    defaultCols: ['offRtg', 'defRtg', 'netRtg', 'winNetRtg', 'pace', 'efgPct', 'tovPct', 'orebPct', 'ftaRate', 'oppEfgPct', 'oppTovPct', 'oppOrebPct', 'pie'],
  },
  {
    id: 'scoring',
    label: '3. Tiro y Scoring Splits',
    categoryToFetch: 'scoring',
    defaultSortKey: 'fg3Pct',
    defaultCols: ['fg3mAvg', 'fg3Pct', 'fgPct', 'ftPct', 'pctFga3pt', 'pctPts2ptMr', 'pctPts3pt', 'pctPtsFb', 'pctPtsFt', 'pctPtsOffTov', 'pctPtsPaint', 'pctAstFgm', 'pctUastFgm'],
  },
  {
    id: 'zones',
    label: '4. Zonas de Tiro (Shot Zones)',
    categoryToFetch: 'zones',
    defaultSortKey: 'raFgPct',
    defaultCols: ['raFgm', 'raFga', 'raFgmTot', 'raFgaTot', 'raFgPct', 'paintNonRaFgPct', 'midFgPct', 'lc3FgPct', 'rc3FgPct', 'corner3FgPct', 'ab3Fga', 'ab3FgPct', 'totalThreeFgaTot', 'threeFgPct'],
  },
  {
    id: 'tracking',
    label: '5. Tracking Óptico Colectivo',
    categoryToFetch: 'tracking',
    defaultSortKey: 'drives',
    defaultCols: ['drives', 'drivePts', 'driveFgPct', 'catchShootPts', 'catchShootFg3Pct', 'pullUpPts', 'pullUpFg3Pct', 'passesMade', 'potentialAst', 'astPtsCreated', 'touches', 'distMiles', 'rebChances'],
  },
  {
    id: 'hustle',
    label: '6. Hustle Completo',
    categoryToFetch: 'defense_hustle',
    defaultSortKey: 'deflections',
    defaultCols: ['contestedShots', 'contestedShots2pt', 'contestedShots3pt', 'deflections', 'chargesDrawn', 'screenAssists', 'screenAstPts', 'looseBalls', 'boxOuts', 'ptsPaint', 'pts2ndChance', 'ptsFastBreak', 'ptsOffTov'],
  },
  {
    id: 'defense',
    label: '7. Defensa y Stats Rival',
    categoryToFetch: 'defense_hustle',
    defaultSortKey: 'defRtg',
    defaultCols: ['defRtg', 'drebPct', 'stlAvg', 'blkAvg', 'dFgPct', 'normalFgPct', 'pctPlusMinus', 'oppPts', 'oppFgPct', 'oppFg3Pct', 'oppReb', 'oppAst', 'oppTov', 'oppPtsPaint', 'oppPtsFb'],
  },
  {
    id: 'clutch',
    label: '8. Clutch (<5m, ±5)',
    categoryToFetch: 'clutch',
    defaultSortKey: 'clNetRtg',
    defaultCols: ['clGp', 'clW', 'clL', 'clWPct', 'clMin', 'clPts', 'clFgPct', 'clFg3Pct', 'clFtPct', 'clOffRtg', 'clDefRtg', 'clNetRtg', 'clTsPct', 'buzzerBeaters', 'gameWinners'],
  },
  {
    id: 'playtypes',
    label: '9. Playtypes (Synergy)',
    categoryToFetch: 'playtypes',
    defaultSortKey: 'ptTopPpp',
    defaultCols: ['ptTotalPoss', 'ptTopLabel', 'ptTopPpp', 'ptSpotupPpp', 'ptPrbhPpp', 'ptTransPpp', 'ptIsoPpp', 'ptPrrPpp', 'ptCutPpp', 'ptPostPpp', 'ptHandoffPpp'],
  },
  {
    id: 'violations',
    label: '10. Infracciones, Faltas y Pintura',
    categoryToFetch: 'violations',
    defaultSortKey: 'totalViolations',
    defaultCols: ['totalViolations', 'pfAvg', 'pfdAvg', 'blkaAvg', 'tovAvg', 'travel', 'offThreeSec', 'defThreeSec', 'shotClock', 'backcourt', 'offFoul', 'kickedBall', 'ptsPaint', 'oppPtsPaint'],
  },
];

function numOrNull(v: number | undefined | null): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fmtNum(v: number | null, decimals = 1, suffix = '', signed = false): string {
  if (v === null) return '—';
  if (signed) return formatSigned(v, decimals, suffix);
  return `${v.toFixed(decimals)}${suffix}`;
}

function matchPlayType(rowType: string, key: string): boolean {
  const a = String(rowType || '').toLowerCase();
  const b = String(key || '').toLowerCase();
  if (a === b) return true;
  if ((a === 'offrebound' || a === 'putback' || a === 'putbacks') && (b === 'offrebound' || b === 'putback' || b === 'putbacks')) return true;
  return false;
}

function findPtPpp(summary: NbaPlaytypeEntitySummary | undefined, playTypeKey: string): number | null {
  if (!summary) return null;
  const row = summary.offensive?.find((x) => matchPlayType(x.playType, playTypeKey));
  return row ? row.ppp : null;
}

function findPtPct(summary: NbaPlaytypeEntitySummary | undefined, playTypeKey: string): number | null {
  if (!summary) return null;
  const row = summary.offensive?.find((x) => matchPlayType(x.playType, playTypeKey));
  return row ? row.possPct : null;
}

function humanStreakCode(code: string): string {
  if (!code) return '—';
  const num = code.replace(/[^0-9]/g, '');
  if (code.startsWith('W')) return `${num} ${num === '1' ? 'victoria' : 'victorias'}`;
  if (code.startsWith('L')) return `${num} ${num === '1' ? 'derrota' : 'derrotas'}`;
  return code;
}

function getHeatmapClass(
  value: number | null,
  benchmark: MetricBenchmark | undefined
): string {
  if (value === null || !benchmark || benchmark.sd === 0) return '';
  const z = (value - benchmark.mean) / benchmark.sd;
  if (Math.abs(z) < 0.5) return '';
  const isPositive = z >= 0.5;
  const isGood = benchmark.lowerIsBetter ? !isPositive : isPositive;
  return isGood ? 'bg-emerald-500/10' : 'bg-rose-500/10';
}

const TEAM_COLUMNS_BY_LAYER: Record<TeamTableView, TeamColDef[]> = {
  basic: [
    { key: 'winPct', label: 'Balance (%V)', helpKey: 'winPct', benchmarkKey: 'winPct', decimals: 1, suffix: '%', getNumValue: (r) => r.winPct * 100, format: (r) => `${r.wins}-${r.losses} (${(r.winPct * 100).toFixed(1)}%)` },
    { key: 'avgPointsFor', label: 'PTS Favor', helpKey: 'avgPointsFor', benchmarkKey: 'avgPointsFor', getNumValue: (r) => r.avgPointsFor, format: (r) => r.avgPointsFor.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'avgPointsAgainst', label: 'PTS Contra', helpKey: 'avgPointsAgainst', benchmarkKey: 'avgPointsAgainst', lowerIsBetter: true, getNumValue: (r) => r.avgPointsAgainst, format: (r) => r.avgPointsAgainst.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'differential', label: 'Dif. Base', helpKey: 'differential', benchmarkKey: 'differential', getNumValue: (r) => r.differential, format: (r) => formatSigned(r.differential, r.statMode === 'totals' ? 0 : 1), tone: (r) => (r.differential >= 0 ? 'positive' : 'negative') },
    { key: 'windowDiff', label: 'Dif. Reciente', helpKey: 'windowDiff', getNumValue: (r) => r.windowDiff, format: (r) => formatSigned(r.windowDiff, r.statMode === 'totals' ? 0 : 1), tone: (r) => (r.windowDiff >= 0 ? 'positive' : 'negative') },
    { key: 'orebAvg', label: 'OR', helpKey: 'orebBase', benchmarkKey: 'orebAvg', getNumValue: (r) => r.orebAvg, format: (r) => r.orebAvg.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'rebAvg', label: 'REB', helpKey: 'rebBase', benchmarkKey: 'rebAvg', getNumValue: (r) => r.rebAvg, format: (r) => r.rebAvg.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'astAvg', label: 'AST', helpKey: 'astBase', benchmarkKey: 'astAvg', getNumValue: (r) => r.astAvg, format: (r) => r.astAvg.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'fg3mAvg', label: '3PM (3P%)', helpKey: 'fg3m', benchmarkKey: 'fg3mAvg', getNumValue: (r) => r.fg3mAvg, format: (r) => `${r.fg3mAvg.toFixed(r.statMode === 'totals' ? 0 : 1)} (${r.fg3Pct.toFixed(1)}%)` },
    { key: 'pfAvg', label: 'Faltas (PF)', helpKey: 'personalFouls', lowerIsBetter: true, getNumValue: (r) => r.pfAvg, format: (r) => r.pfAvg.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'pfdAvg', label: 'Faltas Rec.', helpKey: 'foulsDrawn', getNumValue: (r) => r.pfdAvg, format: (r) => r.pfdAvg.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'blkaAvg', label: 'Tap. Rec.', helpKey: 'blka', lowerIsBetter: true, getNumValue: (r) => r.blkaAvg, format: (r) => r.blkaAvg.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'streak', label: 'Racha / C-F', helpKey: 'streakCurrent', isString: true, getNumValue: (r) => parseStreakCodeValue(r.streakCode), getStrValue: (r) => `${r.streakCode} · ${r.homeRecord}/${r.roadRecord}`, format: (r) => `${r.streakCode} · ${r.homeRecord}/${r.roadRecord}`, tone: (r) => (r.streakCode.startsWith('W') ? 'positive' : 'negative') },
  ],
  advanced: [
    { key: 'offRtg', label: 'OffRtg', helpKey: 'offRtg', benchmarkKey: 'offRtg', getNumValue: (r) => r.advFourFactors?.offRtg ?? r.offRtg, format: (r) => (r.advFourFactors?.offRtg ?? r.offRtg).toFixed(1) },
    { key: 'defRtg', label: 'DefRtg', helpKey: 'defRtg', benchmarkKey: 'defRtg', lowerIsBetter: true, getNumValue: (r) => r.advFourFactors?.defRtg ?? r.defRtg, format: (r) => (r.advFourFactors?.defRtg ?? r.defRtg).toFixed(1) },
    { key: 'netRtg', label: 'NetRtg', helpKey: 'netRtg', benchmarkKey: 'netRtg', getNumValue: (r) => r.advFourFactors?.netRtg ?? r.netRtg, format: (r) => formatSigned(r.advFourFactors?.netRtg ?? r.netRtg), tone: (r) => ((r.advFourFactors?.netRtg ?? r.netRtg) >= 0 ? 'positive' : 'negative') },
    { key: 'winNetRtg', label: 'Net Rec.', helpKey: 'winNetRtg', getNumValue: (r) => r.winNetRtg, format: (r) => formatSigned(r.winNetRtg), tone: () => 'accent' },
    { key: 'pace', label: 'Pace', helpKey: 'paceSimple', benchmarkKey: 'pace', getNumValue: (r) => r.advFourFactors?.pace ?? r.pace, format: (r) => (r.advFourFactors?.pace ?? r.pace).toFixed(1) },
    { key: 'efgPct', label: 'eFG%', helpKey: 'efgPct', benchmarkKey: 'efgPct', suffix: '%', getNumValue: (r) => r.advFourFactors?.efgPct ?? r.efgPct, format: (r) => `${(r.advFourFactors?.efgPct ?? r.efgPct).toFixed(1)}%` },
    { key: 'tsPct', label: 'TS%', helpKey: 'tsPct', benchmarkKey: 'tsPct', suffix: '%', getNumValue: (r) => r.advFourFactors?.tsPct ?? r.tsPct, format: (r) => `${(r.advFourFactors?.tsPct ?? r.tsPct).toFixed(1)}%` },
    { key: 'tovPct', label: 'TOV%', helpKey: 'tovPct', benchmarkKey: 'tovPct', lowerIsBetter: true, suffix: '%', getNumValue: (r) => r.advFourFactors?.tmTovPct ?? r.tovPct, format: (r) => `${(r.advFourFactors?.tmTovPct ?? r.tovPct).toFixed(1)}%` },
    { key: 'orebPct', label: 'OREB%', helpKey: 'orebPct', benchmarkKey: 'orebPct', suffix: '%', getNumValue: (r) => r.advFourFactors?.orebPct ?? r.orebPct, format: (r) => `${(r.advFourFactors?.orebPct ?? r.orebPct).toFixed(1)}%` },
    { key: 'ftaRate', label: 'FTA Rate', helpKey: 'ftRate', decimals: 3, getNumValue: (r) => numOrNull(r.advFourFactors?.ftaRate ?? r.ftRate), format: (r) => fmtNum(numOrNull(r.advFourFactors?.ftaRate ?? r.ftRate), 3) },
    { key: 'oppEfgPct', label: 'Opp eFG%', helpKey: 'oppFourFactors', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advFourFactors?.oppEfgPct), format: (r) => fmtNum(numOrNull(r.advFourFactors?.oppEfgPct), 1, '%') },
    { key: 'oppTovPct', label: 'Opp TOV%', helpKey: 'oppFourFactors', suffix: '%', getNumValue: (r) => numOrNull(r.advFourFactors?.oppTovPct), format: (r) => fmtNum(numOrNull(r.advFourFactors?.oppTovPct), 1, '%') },
    { key: 'oppOrebPct', label: 'Opp OREB%', helpKey: 'oppFourFactors', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advFourFactors?.oppOrebPct), format: (r) => fmtNum(numOrNull(r.advFourFactors?.oppOrebPct), 1, '%') },
    { key: 'oppFtaRate', label: 'Opp FTr', helpKey: 'oppFourFactors', lowerIsBetter: true, decimals: 3, getNumValue: (r) => numOrNull(r.advFourFactors?.oppFtaRate), format: (r) => fmtNum(numOrNull(r.advFourFactors?.oppFtaRate), 3) },
    { key: 'pie', label: 'PIE%', helpKey: 'pie', suffix: '%', getNumValue: (r) => r.advFourFactors?.pie ?? r.pie, format: (r) => `${(r.advFourFactors?.pie ?? r.pie).toFixed(1)}%` },
  ],
  scoring: [
    { key: 'fg3mAvg', label: '3PM / 3PA', helpKey: 'fg3m', benchmarkKey: 'fg3mAvg', getNumValue: (r) => r.fg3mAvg, format: (r) => `${r.fg3mAvg.toFixed(r.statMode === 'totals' ? 0 : 1)} / ${r.fg3aAvg.toFixed(r.statMode === 'totals' ? 0 : 1)}` },
    { key: 'fg3Pct', label: '3P%', helpKey: 'fg3Pct', benchmarkKey: 'fg3Pct', suffix: '%', getNumValue: (r) => r.fg3Pct, format: (r) => `${r.fg3Pct.toFixed(1)}%`, tone: () => 'positive' },
    { key: 'fgPct', label: 'TC% (FG%)', helpKey: 'fgPct', benchmarkKey: 'fgPct', suffix: '%', getNumValue: (r) => r.fgPct, format: (r) => `${r.fgPct.toFixed(1)}%` },
    { key: 'ftPct', label: 'TL% (FT%)', helpKey: 'ftPct', benchmarkKey: 'ftPct', suffix: '%', getNumValue: (r) => r.ftPct, format: (r) => `${r.ftPct.toFixed(1)}%` },
    { key: 'pctFga2pt', label: '%FGA 2P', helpKey: 'pctFga2pt', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctFga2pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctFga2pt), 1, '%') },
    { key: 'pctFga3pt', label: '%FGA 3P', helpKey: 'pctFga3pt', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctFga3pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctFga3pt), 1, '%') },
    { key: 'pctPts2pt', label: '%PTS 2P', helpKey: 'pctPts2pt', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPts2pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPts2pt), 1, '%') },
    { key: 'pctPts2ptMr', label: '%PTS MidR', helpKey: 'pctPts2ptMr', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPts2ptMr), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPts2ptMr), 1, '%') },
    { key: 'pctPts3pt', label: '%PTS 3P', helpKey: 'pctPts3pt', benchmarkKey: 'pctPts3p', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPts3pt) ?? r.pctPts3p, format: (r) => `${(numOrNull(r.advScoring?.pctPts3pt) ?? r.pctPts3p).toFixed(1)}%`, tone: () => 'accent' },
    { key: 'pctPtsFb', label: '%PTS Contraat.', helpKey: 'pctPtsFb', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPtsFb), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsFb), 1, '%') },
    { key: 'pctPtsFt', label: '%PTS Libres', helpKey: 'pctPtsFt', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPtsFt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsFt), 1, '%') },
    { key: 'pctPtsOffTov', label: '%PTS x Pérd.', helpKey: 'pctPtsOffTov', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPtsOffTov), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsOffTov), 1, '%') },
    { key: 'pctPtsPaint', label: '%PTS Pintura', helpKey: 'pctPtsPaint', benchmarkKey: 'pctPtsPaint', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPtsPaint) ?? r.pctPtsPaint, format: (r) => `${(numOrNull(r.advScoring?.pctPtsPaint) ?? r.pctPtsPaint).toFixed(1)}%` },
    { key: 'pctAstFgm', label: '%Canastas Asist.', helpKey: 'pctAstFgm', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctAstFgm), format: (r) => fmtNum(numOrNull(r.advScoring?.pctAstFgm), 1, '%') },
    { key: 'pctUastFgm', label: '%No Asistidas', helpKey: 'pctUastFgm', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctUastFgm), format: (r) => fmtNum(numOrNull(r.advScoring?.pctUastFgm), 1, '%') },
  ],
  zones: [
    { key: 'raFgm', label: 'Aro FGM/PJ', helpKey: 'restrictedArea', decimals: 1, getNumValue: (r) => numOrNull(r.advZones?.restrictedArea?.fgm), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fgm), r.statMode === 'totals' ? 0 : 1) },
    { key: 'raFga', label: 'Aro FGA/PJ', helpKey: 'restrictedArea', decimals: 1, getNumValue: (r) => numOrNull(r.advZones?.restrictedArea?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'raFgmTot', label: 'Aro FGM Tot', helpKey: 'restrictedArea', decimals: 0, getNumValue: (r) => numOrNull(r.advZones?.restrictedArea?.fgmTotal), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fgmTotal), 0) },
    { key: 'raFgaTot', label: 'Aro FGA Tot', helpKey: 'restrictedArea', decimals: 0, getNumValue: (r) => numOrNull(r.advZones?.restrictedArea?.fgaTotal), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fgaTotal), 0) },
    { key: 'raFgPct', label: 'Bajo Aro %', helpKey: 'restrictedArea', suffix: '%', getNumValue: (r) => numOrNull(r.advZones?.restrictedArea?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fgPct), 1, '%'), tone: () => 'positive' },
    { key: 'rimFgPct', label: 'Aro+Pintura FG%', helpKey: 'restrictedArea', suffix: '%', getNumValue: (r) => numOrNull(r.advZones?.rimFgPct), format: (r) => fmtNum(numOrNull(r.advZones?.rimFgPct), 1, '%') },
    { key: 'paintNonRaFgPct', label: 'Pint.(NoRA) %', helpKey: 'ptsPaint', suffix: '%', getNumValue: (r) => numOrNull(r.advZones?.paintNonRa?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.paintNonRa?.fgPct), 1, '%') },
    { key: 'midFgPct', label: 'Media Dist. %', helpKey: 'pctPts2ptMr', suffix: '%', getNumValue: (r) => numOrNull(r.advZones?.midRange?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.midRange?.fgPct), 1, '%') },
    { key: 'lc3Fga', label: 'Esq. Izq FGA/PJ', helpKey: 'corner3', decimals: 1, getNumValue: (r) => numOrNull(r.advZones?.leftCorner3?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.leftCorner3?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'lc3FgPct', label: 'Esq. Izq 3%', helpKey: 'corner3', suffix: '%', getNumValue: (r) => numOrNull(r.advZones?.leftCorner3?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.leftCorner3?.fgPct), 1, '%') },
    { key: 'rc3Fga', label: 'Esq. Der FGA/PJ', helpKey: 'corner3', decimals: 1, getNumValue: (r) => numOrNull(r.advZones?.rightCorner3?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.rightCorner3?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'rc3FgPct', label: 'Esq. Der 3%', helpKey: 'corner3', suffix: '%', getNumValue: (r) => numOrNull(r.advZones?.rightCorner3?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.rightCorner3?.fgPct), 1, '%') },
    { key: 'corner3FgPct', label: 'Esquinas 3%', helpKey: 'corner3', suffix: '%', getNumValue: (r) => numOrNull(r.advZones?.corner3?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.corner3?.fgPct), 1, '%'), tone: () => 'accent' },
    { key: 'ab3Fga', label: 'Cabec. 3PA/PJ', helpKey: 'corner3', decimals: 1, getNumValue: (r) => numOrNull(r.advZones?.aboveBreak3?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.aboveBreak3?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'ab3FgPct', label: 'Cabec. 3%', helpKey: 'corner3', suffix: '%', getNumValue: (r) => numOrNull(r.advZones?.aboveBreak3?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.aboveBreak3?.fgPct), 1, '%') },
    { key: 'totalRimFga', label: 'Vol. Aro/PJ', helpKey: 'restrictedArea', decimals: 1, getNumValue: (r) => numOrNull(r.advZones?.totalRimFga), format: (r) => fmtNum(numOrNull(r.advZones?.totalRimFga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'totalThreeFga', label: 'Vol. 3PA/PJ', helpKey: 'fg3a', decimals: 1, getNumValue: (r) => numOrNull(r.advZones?.totalThreeFga), format: (r) => fmtNum(numOrNull(r.advZones?.totalThreeFga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'totalThreeFgaTot', label: 'Total 3PA Tot', helpKey: 'fg3a', decimals: 0, getNumValue: (r) => numOrNull(r.advZones?.totalThreeFgaTotal), format: (r) => fmtNum(numOrNull(r.advZones?.totalThreeFgaTotal), 0) },
    { key: 'threeFgPct', label: '3P% Zonas', helpKey: 'fg3Pct', suffix: '%', getNumValue: (r) => numOrNull(r.advZones?.threeFgPct), format: (r) => fmtNum(numOrNull(r.advZones?.threeFgPct), 1, '%') },
  ],
  tracking: [
    { key: 'drives', label: 'Drives', helpKey: 'drives', getNumValue: (r) => numOrNull(r.advTracking?.drives), format: (r) => fmtNum(numOrNull(r.advTracking?.drives), r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'driveFgm', label: 'Drive FGM', helpKey: 'drives', getNumValue: (r) => numOrNull(r.advTracking?.driveFgm), format: (r) => fmtNum(numOrNull(r.advTracking?.driveFgm), r.statMode === 'totals' ? 0 : 1) },
    { key: 'driveFga', label: 'Drive FGA', helpKey: 'drives', getNumValue: (r) => numOrNull(r.advTracking?.driveFga), format: (r) => fmtNum(numOrNull(r.advTracking?.driveFga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'drivePts', label: 'Drive PTS', helpKey: 'drives', getNumValue: (r) => numOrNull(r.advTracking?.drivePts), format: (r) => fmtNum(numOrNull(r.advTracking?.drivePts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'driveFgPct', label: 'Drive FG%', helpKey: 'drives', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.driveFgPct), format: (r) => fmtNum(numOrNull(r.advTracking?.driveFgPct), 1, '%') },
    { key: 'driveAstPct', label: 'Drive AST%', helpKey: 'drives', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.driveAstPct), format: (r) => fmtNum(numOrNull(r.advTracking?.driveAstPct), 1, '%') },
    { key: 'drivePassesPct', label: 'Drive Pase%', helpKey: 'drives', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.drivePassesPct), format: (r) => fmtNum(numOrNull(r.advTracking?.drivePassesPct), 1, '%') },
    { key: 'catchShootPts', label: 'C&S PTS', helpKey: 'catchShoot', getNumValue: (r) => numOrNull(r.advTracking?.catchShootPts), format: (r) => fmtNum(numOrNull(r.advTracking?.catchShootPts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'catchShootFg3Pct', label: 'C&S 3P%', helpKey: 'catchShoot', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.catchShootFg3Pct), format: (r) => fmtNum(numOrNull(r.advTracking?.catchShootFg3Pct), 1, '%'), tone: () => 'positive' },
    { key: 'catchShootEfgPct', label: 'C&S eFG%', helpKey: 'catchShoot', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.catchShootEfgPct), format: (r) => fmtNum(numOrNull(r.advTracking?.catchShootEfgPct), 1, '%') },
    { key: 'pullUpPts', label: 'PullUp PTS', helpKey: 'pullUp', getNumValue: (r) => numOrNull(r.advTracking?.pullUpPts), format: (r) => fmtNum(numOrNull(r.advTracking?.pullUpPts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'pullUpFg3Pct', label: 'PullUp 3P%', helpKey: 'pullUp', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.pullUpFg3Pct), format: (r) => fmtNum(numOrNull(r.advTracking?.pullUpFg3Pct), 1, '%') },
    { key: 'pullUpEfgPct', label: 'PullUp eFG%', helpKey: 'pullUp', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.pullUpEfgPct), format: (r) => fmtNum(numOrNull(r.advTracking?.pullUpEfgPct), 1, '%') },
    { key: 'passesMade', label: 'Pases/PJ', helpKey: 'potentialAst', getNumValue: (r) => numOrNull(r.advTracking?.passesMade), format: (r) => fmtNum(numOrNull(r.advTracking?.passesMade), r.statMode === 'totals' ? 0 : 1) },
    { key: 'secondaryAst', label: 'Ast. Sec.', helpKey: 'potentialAst', getNumValue: (r) => numOrNull(r.advTracking?.secondaryAst), format: (r) => fmtNum(numOrNull(r.advTracking?.secondaryAst), r.statMode === 'totals' ? 0 : 1) },
    { key: 'potentialAst', label: 'Ast. Potenc.', helpKey: 'potentialAst', getNumValue: (r) => numOrNull(r.advTracking?.potentialAst), format: (r) => fmtNum(numOrNull(r.advTracking?.potentialAst), r.statMode === 'totals' ? 0 : 1) },
    { key: 'astPtsCreated', label: 'PTS x Pase', helpKey: 'potentialAst', getNumValue: (r) => numOrNull(r.advTracking?.astPtsCreated), format: (r) => fmtNum(numOrNull(r.advTracking?.astPtsCreated), r.statMode === 'totals' ? 0 : 1) },
    { key: 'astToPassPctAdj', label: 'AST/Pase Aj.%', helpKey: 'potentialAst', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.astToPassPctAdj), format: (r) => fmtNum(numOrNull(r.advTracking?.astToPassPctAdj), 1, '%') },
    { key: 'touches', label: 'Toques/PJ', helpKey: 'touches', getNumValue: (r) => numOrNull(r.advTracking?.touches), format: (r) => fmtNum(numOrNull(r.advTracking?.touches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'frontCtTouches', label: 'Toq. Camp.At.', helpKey: 'touches', getNumValue: (r) => numOrNull(r.advTracking?.frontCtTouches), format: (r) => fmtNum(numOrNull(r.advTracking?.frontCtTouches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'avgSecPerTouch', label: 'Seg/Toque', helpKey: 'touches', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.avgSecPerTouch), format: (r) => fmtNum(numOrNull(r.advTracking?.avgSecPerTouch), 2) },
    { key: 'avgDribPerTouch', label: 'Botes/Toque', helpKey: 'touches', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.avgDribPerTouch), format: (r) => fmtNum(numOrNull(r.advTracking?.avgDribPerTouch), 2) },
    { key: 'ptsPerTouch', label: 'PTS/Toque', helpKey: 'touches', decimals: 3, getNumValue: (r) => numOrNull(r.advTracking?.ptsPerTouch), format: (r) => fmtNum(numOrNull(r.advTracking?.ptsPerTouch), 3) },
    { key: 'elbowTouches', label: 'Toq. Codo', helpKey: 'touches', getNumValue: (r) => numOrNull(r.advTracking?.elbowTouches), format: (r) => fmtNum(numOrNull(r.advTracking?.elbowTouches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'postTouches', label: 'Toq. Poste', helpKey: 'touches', getNumValue: (r) => numOrNull(r.advTracking?.postTouches), format: (r) => fmtNum(numOrNull(r.advTracking?.postTouches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'paintTouches', label: 'Toq. Pintura', helpKey: 'touches', getNumValue: (r) => numOrNull(r.advTracking?.paintTouches), format: (r) => fmtNum(numOrNull(r.advTracking?.paintTouches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'distMiles', label: 'Dist. (mi)', helpKey: 'distMiles', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.distMiles), format: (r) => fmtNum(numOrNull(r.advTracking?.distMiles), r.statMode === 'totals' ? 1 : 2) },
    { key: 'distMilesOff', label: 'Dist. Of. (mi)', helpKey: 'distMiles', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.distMilesOff), format: (r) => fmtNum(numOrNull(r.advTracking?.distMilesOff), r.statMode === 'totals' ? 1 : 2) },
    { key: 'distMilesDef', label: 'Dist. Def. (mi)', helpKey: 'distMiles', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.distMilesDef), format: (r) => fmtNum(numOrNull(r.advTracking?.distMilesDef), r.statMode === 'totals' ? 1 : 2) },
    { key: 'avgSpeed', label: 'Vel. (mph)', helpKey: 'avgSpeed', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.avgSpeed), format: (r) => fmtNum(numOrNull(r.advTracking?.avgSpeed), 2) },
    { key: 'avgSpeedOff', label: 'Vel. Of. (mph)', helpKey: 'avgSpeed', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.avgSpeedOff), format: (r) => fmtNum(numOrNull(r.advTracking?.avgSpeedOff), 2) },
    { key: 'avgSpeedDef', label: 'Vel. Def. (mph)', helpKey: 'avgSpeed', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.avgSpeedDef), format: (r) => fmtNum(numOrNull(r.advTracking?.avgSpeedDef), 2) },
    { key: 'rebChances', label: 'Oport. Reb', helpKey: 'rebChances', getNumValue: (r) => numOrNull(r.advTracking?.rebChances), format: (r) => fmtNum(numOrNull(r.advTracking?.rebChances), r.statMode === 'totals' ? 0 : 1) },
    { key: 'rebChancePctAdj', label: 'Reb Aj.%', helpKey: 'rebChances', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.rebChancePctAdj), format: (r) => fmtNum(numOrNull(r.advTracking?.rebChancePctAdj), 1, '%') },
    { key: 'avgRebDist', label: 'Dist. Reb (ft)', helpKey: 'rebChances', decimals: 1, getNumValue: (r) => numOrNull(r.advTracking?.avgRebDist), format: (r) => fmtNum(numOrNull(r.advTracking?.avgRebDist), 1) },
  ],
  hustle: [
    { key: 'contestedShots', label: 'Punteados Tot', helpKey: 'contestedShots', benchmarkKey: 'contestedShots', getNumValue: (r) => r.advDefHustle?.contestedShots ?? r.contestedShots, format: (r) => (r.advDefHustle?.contestedShots ?? r.contestedShots).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'contestedShots2pt', label: 'Punt. 2P', helpKey: 'contestedShots', getNumValue: (r) => numOrNull(r.advDefHustle?.contestedShots2pt ?? r.advanced?.contestedShots2pt), format: (r) => fmtNum(numOrNull(r.advDefHustle?.contestedShots2pt ?? r.advanced?.contestedShots2pt), r.statMode === 'totals' ? 0 : 1) },
    { key: 'contestedShots3pt', label: 'Punt. 3P', helpKey: 'contestedShots', getNumValue: (r) => numOrNull(r.advDefHustle?.contestedShots3pt ?? r.advanced?.contestedShots3pt), format: (r) => fmtNum(numOrNull(r.advDefHustle?.contestedShots3pt ?? r.advanced?.contestedShots3pt), r.statMode === 'totals' ? 0 : 1) },
    { key: 'deflections', label: 'Desvíos', helpKey: 'deflections', benchmarkKey: 'deflections', getNumValue: (r) => r.advDefHustle?.deflections ?? r.deflections, format: (r) => (r.advDefHustle?.deflections ?? r.deflections).toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'positive' },
    { key: 'chargesDrawn', label: 'Cargas Prov.', helpKey: 'chargesDrawn', decimals: 2, getNumValue: (r) => numOrNull(r.advDefHustle?.chargesDrawn ?? r.advanced?.chargesDrawn), format: (r) => fmtNum(numOrNull(r.advDefHustle?.chargesDrawn ?? r.advanced?.chargesDrawn), r.statMode === 'totals' ? 0 : 2) },
    { key: 'screenAssists', label: 'Screen AST', helpKey: 'screenAssists', getNumValue: (r) => numOrNull(r.advDefHustle?.screenAssists ?? r.advanced?.screenAssists), format: (r) => fmtNum(numOrNull(r.advDefHustle?.screenAssists ?? r.advanced?.screenAssists), r.statMode === 'totals' ? 0 : 1) },
    { key: 'screenAstPts', label: 'Scr. AST PTS', helpKey: 'screenAstPts', getNumValue: (r) => numOrNull(r.advDefHustle?.screenAstPts ?? r.advanced?.screenAstPts), format: (r) => fmtNum(numOrNull(r.advDefHustle?.screenAstPts ?? r.advanced?.screenAstPts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'looseBalls', label: 'Bal. Sueltos', helpKey: 'looseBalls', getNumValue: (r) => numOrNull(r.advDefHustle?.looseBalls ?? r.advanced?.looseBalls), format: (r) => fmtNum(numOrNull(r.advDefHustle?.looseBalls ?? r.advanced?.looseBalls), r.statMode === 'totals' ? 0 : 1) },
    { key: 'offLooseBalls', label: 'Sueltos Of.', helpKey: 'looseBalls', getNumValue: (r) => numOrNull(r.advDefHustle?.offLooseBalls ?? r.advanced?.offLooseBalls), format: (r) => fmtNum(numOrNull(r.advDefHustle?.offLooseBalls ?? r.advanced?.offLooseBalls), r.statMode === 'totals' ? 0 : 1) },
    { key: 'defLooseBalls', label: 'Sueltos Def.', helpKey: 'looseBalls', getNumValue: (r) => numOrNull(r.advDefHustle?.defLooseBalls ?? r.advanced?.defLooseBalls), format: (r) => fmtNum(numOrNull(r.advDefHustle?.defLooseBalls ?? r.advanced?.defLooseBalls), r.statMode === 'totals' ? 0 : 1) },
    { key: 'boxOuts', label: 'Box-Outs Tot', helpKey: 'offBoxOuts', benchmarkKey: 'boxOuts', getNumValue: (r) => r.advDefHustle?.boxOuts ?? r.boxOuts, format: (r) => (r.advDefHustle?.boxOuts ?? r.boxOuts).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'offBoxOuts', label: 'Box-Out Of.', helpKey: 'offBoxOuts', getNumValue: (r) => numOrNull(r.advDefHustle?.offBoxOuts ?? r.advanced?.offBoxOuts), format: (r) => fmtNum(numOrNull(r.advDefHustle?.offBoxOuts ?? r.advanced?.offBoxOuts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'defBoxOuts', label: 'Box-Out Def.', helpKey: 'offBoxOuts', getNumValue: (r) => numOrNull(r.advDefHustle?.defBoxOuts ?? r.advanced?.defBoxOuts), format: (r) => fmtNum(numOrNull(r.advDefHustle?.defBoxOuts ?? r.advanced?.defBoxOuts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'boxOutTeamRebs', label: 'BoxOut Eq.Reb', helpKey: 'offBoxOuts', getNumValue: (r) => numOrNull(r.advDefHustle?.boxOutTeamRebs ?? r.advanced?.boxOutTeamRebs), format: (r) => fmtNum(numOrNull(r.advDefHustle?.boxOutTeamRebs ?? r.advanced?.boxOutTeamRebs), r.statMode === 'totals' ? 0 : 1) },
    { key: 'ptsPaint', label: 'PTS Pintura', helpKey: 'ptsPaint', benchmarkKey: 'ptsPaint', getNumValue: (r) => r.advDefHustle?.ptsPaint ?? r.ptsPaint, format: (r) => (r.advDefHustle?.ptsPaint ?? r.ptsPaint).toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'pts2ndChance', label: '2ª Oportun.', helpKey: 'pts2ndChance', benchmarkKey: 'pts2ndChance', getNumValue: (r) => r.advDefHustle?.pts2ndChance ?? r.pts2ndChance, format: (r) => (r.advDefHustle?.pts2ndChance ?? r.pts2ndChance).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'ptsFastBreak', label: 'Contraat.', helpKey: 'ptsFastBreak', benchmarkKey: 'ptsFastBreak', getNumValue: (r) => r.advDefHustle?.ptsFb ?? r.ptsFastBreak, format: (r) => (r.advDefHustle?.ptsFb ?? r.ptsFastBreak).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'ptsOffTov', label: 'PTS x Pérd.', helpKey: 'ptsOffTov', benchmarkKey: 'ptsOffTov', getNumValue: (r) => r.advDefHustle?.ptsOffTov ?? r.ptsOffTov, format: (r) => (r.advDefHustle?.ptsOffTov ?? r.ptsOffTov).toFixed(r.statMode === 'totals' ? 0 : 1) },
  ],
  defense: [
    { key: 'defRtg', label: 'DefRtg', helpKey: 'defRtg', benchmarkKey: 'defRtg', lowerIsBetter: true, getNumValue: (r) => r.advDefHustle?.defRating ?? r.defRtg, format: (r) => (r.advDefHustle?.defRating ?? r.defRtg).toFixed(1) },
    { key: 'drebPct', label: 'DREB%', helpKey: 'drebPct', suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.drebPct ?? r.advanced?.drebPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.drebPct ?? r.advanced?.drebPct), 1, '%') },
    { key: 'stlAvg', label: 'Robos/PJ', helpKey: 'steals', benchmarkKey: 'stlAvg', getNumValue: (r) => r.advDefHustle?.stl ?? r.stlAvg, format: (r) => (r.advDefHustle?.stl ?? r.stlAvg).toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'positive' },
    { key: 'blkAvg', label: 'Tapones/PJ', helpKey: 'blocks', benchmarkKey: 'blkAvg', getNumValue: (r) => r.advDefHustle?.blk ?? r.blkAvg, format: (r) => (r.advDefHustle?.blk ?? r.blkAvg).toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'dFgPct', label: 'DFG% Rival', helpKey: 'dFgPct', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.dFgPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.dFgPct), 1, '%') },
    { key: 'normalFgPct', label: 'FG% Esper.', helpKey: 'dFgPct', suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.normalFgPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.normalFgPct), 1, '%') },
    { key: 'pctPlusMinus', label: 'Diff% (DFG)', helpKey: 'dFgPct', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.pctPlusMinus), format: (r) => fmtNum(numOrNull(r.advDefHustle?.pctPlusMinus), 1, '%', true), tone: (r) => ((r.advDefHustle?.pctPlusMinus ?? 0) <= -1.0 ? 'positive' : (r.advDefHustle?.pctPlusMinus ?? 0) >= 1.5 ? 'negative' : 'neutral') },
    { key: 'oppPts', label: 'Opp PTS', helpKey: 'avgPointsAgainst', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppPts ?? r.avgPointsAgainst), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPts ?? r.avgPointsAgainst), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppFgPct', label: 'Opp FG%', helpKey: 'oppStats', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.oppFgPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppFgPct), 1, '%') },
    { key: 'oppFg3m', label: 'Opp 3PM', helpKey: 'oppStats', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppFg3m), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppFg3m), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppFg3Pct', label: 'Opp 3P%', helpKey: 'oppStats', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.oppFg3Pct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppFg3Pct), 1, '%') },
    { key: 'oppFtPct', label: 'Opp FT%', helpKey: 'oppStats', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.oppFtPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppFtPct), 1, '%') },
    { key: 'oppReb', label: 'Opp REB', helpKey: 'oppStats', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppReb), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppReb), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppAst', label: 'Opp AST', helpKey: 'oppStats', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppAst), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppAst), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppTov', label: 'Opp TOV', helpKey: 'oppStats', getNumValue: (r) => numOrNull(r.advDefHustle?.oppTov), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppTov), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPtsPaint', label: 'Opp Pintura', helpKey: 'oppPtsPaint', benchmarkKey: 'oppPtsPaint', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppPtsPaint ?? r.oppPtsPaint), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPtsPaint ?? r.oppPtsPaint), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPts2ndChance', label: 'Opp 2ª Op.', helpKey: 'oppStats', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppPts2ndChance ?? r.advanced?.oppPts2ndChance), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPts2ndChance ?? r.advanced?.oppPts2ndChance), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPtsFb', label: 'Opp Contraat.', helpKey: 'oppStats', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppPtsFb ?? r.advanced?.oppPtsFb), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPtsFb ?? r.advanced?.oppPtsFb), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPtsOffTov', label: 'Opp x Pérd.', helpKey: 'oppStats', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppPtsOffTov ?? r.advanced?.oppPtsOffTov), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPtsOffTov ?? r.advanced?.oppPtsOffTov), r.statMode === 'totals' ? 0 : 1) },
  ],
  clutch: [
    { key: 'clGp', label: 'PJ Cl.', helpKey: 'clutch', decimals: 0, getNumValue: (r) => numOrNull(r.advClutch?.gp), format: (r) => fmtNum(numOrNull(r.advClutch?.gp), 0) },
    { key: 'clW', label: 'W Cl.', helpKey: 'clutch', decimals: 0, getNumValue: (r) => numOrNull(r.advClutch?.w), format: (r) => fmtNum(numOrNull(r.advClutch?.w), 0) },
    { key: 'clL', label: 'L Cl.', helpKey: 'clutch', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advClutch?.l), format: (r) => fmtNum(numOrNull(r.advClutch?.l), 0) },
    { key: 'clWPct', label: '%V Cl.', helpKey: 'clutch', suffix: '%', getNumValue: (r) => numOrNull(r.advClutch?.wPct), format: (r) => fmtNum(numOrNull(r.advClutch?.wPct), 1, '%') },
    { key: 'clMin', label: 'MIN Cl.', helpKey: 'clutch', getNumValue: (r) => numOrNull(r.advClutch?.min), format: (r) => fmtNum(numOrNull(r.advClutch?.min), 1) },
    { key: 'clPts', label: 'PTS Cl.', helpKey: 'clutch', getNumValue: (r) => numOrNull(r.advClutch?.pts), format: (r) => fmtNum(numOrNull(r.advClutch?.pts), r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'clFgPct', label: 'FG% Cl.', helpKey: 'clutch', suffix: '%', getNumValue: (r) => numOrNull(r.advClutch?.fgPct), format: (r) => fmtNum(numOrNull(r.advClutch?.fgPct), 1, '%') },
    { key: 'clFg3Pct', label: '3P% Cl.', helpKey: 'clutch', suffix: '%', getNumValue: (r) => numOrNull(r.advClutch?.fg3Pct), format: (r) => fmtNum(numOrNull(r.advClutch?.fg3Pct), 1, '%') },
    { key: 'clFtPct', label: 'FT% Cl.', helpKey: 'clutch', suffix: '%', getNumValue: (r) => numOrNull(r.advClutch?.ftPct), format: (r) => fmtNum(numOrNull(r.advClutch?.ftPct), 1, '%') },
    { key: 'clReb', label: 'REB Cl.', helpKey: 'clutch', getNumValue: (r) => numOrNull(r.advClutch?.reb), format: (r) => fmtNum(numOrNull(r.advClutch?.reb), r.statMode === 'totals' ? 0 : 1) },
    { key: 'clAst', label: 'AST Cl.', helpKey: 'clutch', getNumValue: (r) => numOrNull(r.advClutch?.ast), format: (r) => fmtNum(numOrNull(r.advClutch?.ast), r.statMode === 'totals' ? 0 : 1) },
    { key: 'clStl', label: 'ROB Cl.', helpKey: 'clutch', getNumValue: (r) => numOrNull(r.advClutch?.stl), format: (r) => fmtNum(numOrNull(r.advClutch?.stl), r.statMode === 'totals' ? 0 : 1) },
    { key: 'clBlk', label: 'TAP Cl.', helpKey: 'clutch', getNumValue: (r) => numOrNull(r.advClutch?.blk), format: (r) => fmtNum(numOrNull(r.advClutch?.blk), r.statMode === 'totals' ? 0 : 1) },
    { key: 'clTov', label: 'PER Cl.', helpKey: 'clutch', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advClutch?.tov), format: (r) => fmtNum(numOrNull(r.advClutch?.tov), r.statMode === 'totals' ? 0 : 1) },
    { key: 'clOffRtg', label: 'OffRtg Cl.', helpKey: 'clutch', getNumValue: (r) => numOrNull(r.advClutch?.offRtg), format: (r) => fmtNum(numOrNull(r.advClutch?.offRtg), 1) },
    { key: 'clDefRtg', label: 'DefRtg Cl.', helpKey: 'clutch', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advClutch?.defRtg), format: (r) => fmtNum(numOrNull(r.advClutch?.defRtg), 1) },
    { key: 'clNetRtg', label: 'NetRtg Cl.', helpKey: 'clutch', getNumValue: (r) => numOrNull(r.advClutch?.netRtg), format: (r) => fmtNum(numOrNull(r.advClutch?.netRtg), 1, '', true), tone: (r) => ((r.advClutch?.netRtg ?? 0) >= 0 ? 'positive' : 'negative') },
    { key: 'clTsPct', label: 'TS% Cl.', helpKey: 'clutch', suffix: '%', getNumValue: (r) => numOrNull(r.advClutch?.tsPct), format: (r) => fmtNum(numOrNull(r.advClutch?.tsPct), 1, '%') },
    { key: 'clEfgPct', label: 'eFG% Cl.', helpKey: 'clutch', suffix: '%', getNumValue: (r) => numOrNull(r.advClutch?.efgPct), format: (r) => fmtNum(numOrNull(r.advClutch?.efgPct), 1, '%') },
    { key: 'clPie', label: 'PIE% Cl.', helpKey: 'clutch', suffix: '%', getNumValue: (r) => numOrNull(r.advClutch?.pie), format: (r) => fmtNum(numOrNull(r.advClutch?.pie), 1, '%') },
    { key: 'buzzerBeaters', label: 'Buzzer B. (0.0s)', helpKey: 'buzzerBeater', decimals: 0, getNumValue: (r) => r.buzzerBeaters, format: (r) => `${r.buzzerBeaters}`, tone: (r) => (r.buzzerBeaters > 0 ? 'accent' : 'neutral') },
    { key: 'gameWinners', label: 'Game Win. (≤10s)', helpKey: 'gameWinner', decimals: 0, getNumValue: (r) => r.gameWinners, format: (r) => `${r.gameWinners}`, tone: (r) => (r.gameWinners > 0 ? 'positive' : 'neutral') },
  ],
  playtypes: [
    { key: 'ptTotalPoss', label: 'Pos. Ofens./PJ', helpKey: 'ppp', decimals: 1, getNumValue: (r) => numOrNull(r.advPlaytypes?.totalPossOff), format: (r) => fmtNum(numOrNull(r.advPlaytypes?.totalPossOff), r.statMode === 'totals' ? 0 : 1) },
    { key: 'ptTopLabel', label: 'Top Jugada', helpKey: 'ppp', align: 'left', isString: true, getNumValue: (r) => numOrNull(r.advPlaytypes?.topPlayTypeOff?.ppp), getStrValue: (r) => r.advPlaytypes?.topPlayTypeOff?.playTypeLabelEs || '—', format: (r) => r.advPlaytypes?.topPlayTypeOff?.playTypeLabelEs || '—' },
    { key: 'ptTopPpp', label: 'Top PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => numOrNull(r.advPlaytypes?.topPlayTypeOff?.ppp), format: (r) => fmtNum(numOrNull(r.advPlaytypes?.topPlayTypeOff?.ppp), 2), tone: () => 'accent' },
    { key: 'ptSpotupPpp', label: 'SpotUp PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'Spotup'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Spotup'), 2) },
    { key: 'ptSpotupPct', label: 'SpotUp %', helpKey: 'ppp', suffix: '%', getNumValue: (r) => findPtPct(r.advPlaytypes, 'Spotup'), format: (r) => fmtNum(findPtPct(r.advPlaytypes, 'Spotup'), 1, '%') },
    { key: 'ptPrbhPpp', label: 'P&R Man. PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'PRBallHandler'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'PRBallHandler'), 2) },
    { key: 'ptPrbhPct', label: 'P&R Man. %', helpKey: 'ppp', suffix: '%', getNumValue: (r) => findPtPct(r.advPlaytypes, 'PRBallHandler'), format: (r) => fmtNum(findPtPct(r.advPlaytypes, 'PRBallHandler'), 1, '%') },
    { key: 'ptTransPpp', label: 'Transic. PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'Transition'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Transition'), 2) },
    { key: 'ptIsoPpp', label: 'Aislam. PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'Isolation'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Isolation'), 2) },
    { key: 'ptPrrPpp', label: 'P&R Cont. PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'PRRollMan'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'PRRollMan'), 2) },
    { key: 'ptCutPpp', label: 'Corte PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'Cut'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Cut'), 2) },
    { key: 'ptPostPpp', label: 'Poste PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'Postup'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Postup'), 2) },
    { key: 'ptHandoffPpp', label: 'Mano a M. PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'Handoff'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Handoff'), 2) },
    { key: 'ptOffScrPpp', label: 'Sal. Bloq. PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'OffScreen'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'OffScreen'), 2) },
    { key: 'ptPutbackPpp', label: 'Reb. Of. PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'OffRebound'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'OffRebound'), 2) },
    { key: 'ptMiscPpp', label: 'Varios PPP', helpKey: 'ppp', decimals: 2, getNumValue: (r) => findPtPpp(r.advPlaytypes, 'Misc'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Misc'), 2) },
  ],
  violations: [
    { key: 'totalViolations', label: 'Total Violac. (Tot)', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.totalViolations), format: (r) => fmtNum(numOrNull(r.advViolations?.totalViolations), r.statMode === 'totals' ? 0 : 2), tone: () => 'accent' },
    { key: 'pfAvg', label: 'Faltas (PF/PJ)', helpKey: 'personalFouls', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advViolations?.pf ?? r.pfAvg), format: (r) => fmtNum(numOrNull(r.advViolations?.pf ?? r.pfAvg), r.statMode === 'totals' ? 0 : 1) },
    { key: 'pfdAvg', label: 'Faltas Rec. (PFD/PJ)', helpKey: 'foulsDrawn', getNumValue: (r) => numOrNull(r.advViolations?.pfd ?? r.pfdAvg), format: (r) => fmtNum(numOrNull(r.advViolations?.pfd ?? r.pfdAvg), r.statMode === 'totals' ? 0 : 1), tone: () => 'positive' },
    { key: 'blkaAvg', label: 'Tap. Rec. (BLKA/PJ)', helpKey: 'blka', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advViolations?.blka ?? r.blkaAvg), format: (r) => fmtNum(numOrNull(r.advViolations?.blka ?? r.blkaAvg), r.statMode === 'totals' ? 0 : 1) },
    { key: 'tovAvg', label: 'Pérdidas (TOV/PJ)', helpKey: 'tov', benchmarkKey: 'tovAvg', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advViolations?.tov ?? r.tovAvg), format: (r) => fmtNum(numOrNull(r.advViolations?.tov ?? r.tovAvg), r.statMode === 'totals' ? 0 : 1) },
    { key: 'travel', label: 'Pasos (Tot)', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.travel), format: (r) => fmtNum(numOrNull(r.advViolations?.travel), r.statMode === 'totals' ? 0 : 2) },
    { key: 'doubleDribble', label: 'Dobles (Tot)', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.doubleDribble), format: (r) => fmtNum(numOrNull(r.advViolations?.doubleDribble), r.statMode === 'totals' ? 0 : 2) },
    { key: 'discontinuedDribble', label: 'Acompañar Balón', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.discontinuedDribble), format: (r) => fmtNum(numOrNull(r.advViolations?.discontinuedDribble), r.statMode === 'totals' ? 0 : 2) },
    { key: 'offThreeSec', label: '3s Zona Of.', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.offThreeSec), format: (r) => fmtNum(numOrNull(r.advViolations?.offThreeSec), r.statMode === 'totals' ? 0 : 2) },
    { key: 'defThreeSec', label: '3s Zona Def.', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.defThreeSec), format: (r) => fmtNum(numOrNull(r.advViolations?.defThreeSec), r.statMode === 'totals' ? 0 : 2) },
    { key: 'shotClock', label: 'Reloj 24s', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.shotClock), format: (r) => fmtNum(numOrNull(r.advViolations?.shotClock), r.statMode === 'totals' ? 0 : 2) },
    { key: 'fiveSec', label: '5 Seg.', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.fiveSec), format: (r) => fmtNum(numOrNull(r.advViolations?.fiveSec), r.statMode === 'totals' ? 0 : 2) },
    { key: 'eightSec', label: '8 Seg.', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.eightSec), format: (r) => fmtNum(numOrNull(r.advViolations?.eightSec), r.statMode === 'totals' ? 0 : 2) },
    { key: 'palming', label: 'Palming', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.palming), format: (r) => fmtNum(numOrNull(r.advViolations?.palming), r.statMode === 'totals' ? 0 : 2) },
    { key: 'backcourt', label: 'Campo Atrás', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.backcourt), format: (r) => fmtNum(numOrNull(r.advViolations?.backcourt), r.statMode === 'totals' ? 0 : 2) },
    { key: 'offFoul', label: 'Falta Ataque', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.offFoul), format: (r) => fmtNum(numOrNull(r.advViolations?.offFoul), r.statMode === 'totals' ? 0 : 2) },
    { key: 'chargeViol', label: 'Carga Of.', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.charge), format: (r) => fmtNum(numOrNull(r.advViolations?.charge), r.statMode === 'totals' ? 0 : 2) },
    { key: 'kickedBall', label: 'Pie (Kick Ball)', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.kickedBall), format: (r) => fmtNum(numOrNull(r.advViolations?.kickedBall), r.statMode === 'totals' ? 0 : 2) },
    { key: 'delayOfGame', label: 'Retraso Juego', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.delayOfGame), format: (r) => fmtNum(numOrNull(r.advViolations?.delayOfGame), r.statMode === 'totals' ? 0 : 2) },
    { key: 'offGoaltending', label: 'Interf. Of.', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.offGoaltending), format: (r) => fmtNum(numOrNull(r.advViolations?.offGoaltending), r.statMode === 'totals' ? 0 : 2) },
    { key: 'defGoaltending', label: 'Interf. Def.', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.defGoaltending), format: (r) => fmtNum(numOrNull(r.advViolations?.defGoaltending), r.statMode === 'totals' ? 0 : 2) },
    { key: 'inbound', label: 'Saque Fondo', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.inbound), format: (r) => fmtNum(numOrNull(r.advViolations?.inbound), r.statMode === 'totals' ? 0 : 2) },
    { key: 'lane', label: 'Invasión TL', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.lane), format: (r) => fmtNum(numOrNull(r.advViolations?.lane), r.statMode === 'totals' ? 0 : 2) },
    { key: 'jumpBall', label: 'Salto Entre 2', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 0, getNumValue: (r) => numOrNull(r.advViolations?.jumpBall), format: (r) => fmtNum(numOrNull(r.advViolations?.jumpBall), r.statMode === 'totals' ? 0 : 2) },
    { key: 'ptsPaint', label: 'Pintura Fav.', helpKey: 'ptsPaint', benchmarkKey: 'ptsPaint', getNumValue: (r) => numOrNull(r.advViolations?.ptsPaint ?? r.ptsPaint), format: (r) => fmtNum(numOrNull(r.advViolations?.ptsPaint ?? r.ptsPaint), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPtsPaint', label: 'Pintura Riv.', helpKey: 'oppPtsPaint', benchmarkKey: 'oppPtsPaint', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advViolations?.oppPtsPaint ?? r.oppPtsPaint), format: (r) => fmtNum(numOrNull(r.advViolations?.oppPtsPaint ?? r.oppPtsPaint), r.statMode === 'totals' ? 0 : 1) },
  ],
};

const INVARIANT_TEAM_COL_KEYS = new Set<string>([
  'winPct', 'streak', 'offRtg', 'defRtg', 'netRtg', 'winNetRtg', 'pace', 'efgPct', 'tsPct',
  'tovPct', 'orebPct', 'ftaRate', 'oppEfgPct', 'oppTovPct', 'oppOrebPct', 'oppFtaRate', 'pie',
  'fg3Pct', 'fgPct', 'ftPct', 'pctFga2pt', 'pctFga3pt', 'pctPts2pt', 'pctPts2ptMr', 'pctPts3pt',
  'pctPtsFb', 'pctPtsFt', 'pctPtsOffTov', 'pctPtsPaint', 'pctAstFgm', 'pctUastFgm',
  'raFgPct', 'rimFgPct', 'paintNonRaFgPct', 'midFgPct', 'lc3FgPct', 'rc3FgPct', 'corner3FgPct', 'ab3FgPct', 'threeFgPct',
  'driveFgPct', 'driveAstPct', 'drivePassesPct', 'catchShootFg3Pct', 'catchShootEfgPct', 'pullUpFg3Pct', 'pullUpEfgPct',
  'astToPassPctAdj', 'avgSecPerTouch', 'avgDribPerTouch', 'ptsPerTouch', 'avgSpeed', 'avgSpeedOff', 'avgSpeedDef', 'rebChancePctAdj', 'avgRebDist',
  'drebPct', 'dFgPct', 'normalFgPct', 'pctPlusMinus', 'oppFgPct', 'oppFg3Pct', 'oppFtPct',
  'clGp', 'clW', 'clL', 'clWPct', 'clFgPct', 'clFg3Pct', 'clFtPct', 'clOffRtg', 'clDefRtg', 'clNetRtg', 'clTsPct', 'clEfgPct', 'clPie',
  'buzzerBeaters', 'gameWinners',
  'ptTopLabel', 'ptTopPpp', 'ptSpotupPpp', 'ptSpotupPct', 'ptPrbhPpp', 'ptPrbhPct', 'ptTransPpp',
  'ptIsoPpp', 'ptPrrPpp', 'ptCutPpp', 'ptPostPpp', 'ptHandoffPpp', 'ptOffScrPpp', 'ptPutbackPpp', 'ptMiscPpp',
  'raFgmTot', 'raFgaTot', 'totalThreeFgaTot',
]);

function formatTeamColHeader(col: TeamColDef, statMode: StatScaleMode, windowSize: number): string {
  if (col.key === 'windowDiff') return `Dif. Últ.${windowSize}`;
  if (col.key === 'winNetRtg') return `Net Últ.${windowSize}`;
  if (statMode === 'totals') {
    if (col.label.includes('/PJ')) return col.label.replace(/\/PJ/g, ' Tot');
    if (col.label === 'Faltas (PF)') return 'Faltas (PF)';
    return col.label;
  }
  if (col.label.includes(' (Tot)')) return col.label.replace(' (Tot)', '/PJ');
  return col.label;
}

function loadSavedTeamCols(): Record<TeamTableView, string[]> {
  const defaults = {} as Record<TeamTableView, string[]>;
  for (const l of TEAM_LAYERS) defaults[l.id] = [...l.defaultCols];
  try {
    const raw = localStorage.getItem(STORAGE_TEAM_COLS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    for (const l of TEAM_LAYERS) {
      if (Array.isArray(parsed[l.id])) {
        const validKeys = new Set(TEAM_COLUMNS_BY_LAYER[l.id].map((c) => c.key));
        const filtered = parsed[l.id].map(String).filter((k: string) => validKeys.has(k));
        if (filtered.length > 0) defaults[l.id] = filtered;
      }
    }
    return defaults;
  } catch {
    return defaults;
  }
}

export function TeamsExplorerView({
  teams,
  experienceMode,
  benchmarks,
  seasonToken = '2027',
  onSwitchToAdvanced,
  windowSize,
  watchlistIds,
  onlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  showHeroicBadges = false,
}: TeamsExplorerViewProps) {
  const [viewMode, setViewMode] = useState<TeamTableView>('basic');
  const [statMode, setStatMode] = useState<StatScaleMode>(loadTeamStatMode);
  const [visibleColsByLayer, setVisibleColsByLayer] = useState<Record<TeamTableView, string[]>>(loadSavedTeamCols);
  const [unifiedFilters, setUnifiedFilters] = useState<UnifiedTableFiltersState>(DEFAULT_UNIFIED_FILTERS);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('winPct');
  const [sortAsc, setSortAsc] = useState(false);

  const [advCache, setAdvCache] = useState<Record<string, Record<string, any>>>({});
  const [heroicCache, setHeroicCache] = useState<Record<string, Record<string, NbaHeroicShotCountSummary>>>({});
  const [loadingCategory, setLoadingCategory] = useState<NbaAdvancedCategory | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TEAM_COLS_KEY, JSON.stringify(visibleColsByLayer));
    } catch {
      // ignore quota errors
    }
  }, [visibleColsByLayer]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TEAM_STAT_MODE_KEY, statMode);
    } catch {
      // ignore quota errors
    }
  }, [statMode]);

  useEffect(() => {
    if (experienceMode === 'simple') {
      setViewMode('basic');
      if (
        sortKey !== 'watched' &&
        sortKey !== 'name' &&
        sortKey !== 'domVsNba' &&
        sortKey !== 'streak' &&
        sortKey !== 'winPct' &&
        sortKey !== 'avgPointsFor' &&
        sortKey !== 'avgPointsAgainst' &&
        sortKey !== 'differential' &&
        sortKey !== 'windowDiff'
      ) {
        setSortKey('winPct');
        setSortAsc(false);
      }
    }
  }, [experienceMode, sortKey]);

  const activeLayerMeta = useMemo(
    () => TEAM_LAYERS.find((l) => l.id === viewMode) || TEAM_LAYERS[0],
    [viewMode]
  );

  // Lazy fetch team advanced category when layer changes
  useEffect(() => {
    if (experienceMode === 'simple') return;
    const cat = activeLayerMeta.categoryToFetch;
    if (!cat) {
      setCategoryError(null);
      return;
    }
    const cacheKey = `${seasonToken}:${cat}`;
    if (advCache[cacheKey]) {
      setCategoryError(null);
      return;
    }

    let cancelled = false;
    setLoadingCategory(cat);
    setCategoryError(null);

    fetch(`/api/nba/advanced/teams?category=${encodeURIComponent(cat)}&season=${encodeURIComponent(seasonToken)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const map: Record<string, any> = {};
        const items = Array.isArray(json?.items) ? json.items : [];
        for (const item of items) {
          const id = String(item.entityId || item.teamId || '');
          const abbr = String(item.teamAbbr || '').toUpperCase();
          if (id) map[id] = item;
          if (abbr) map[`abbr:${abbr}`] = item;
        }
        setAdvCache((prev) => ({ ...prev, [cacheKey]: map }));
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryError('No se pudo cargar este módulo oficial de NBA.com ahora.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCategory(null);
      });

    return () => {
      cancelled = true;
    };
  }, [experienceMode, activeLayerMeta, seasonToken, advCache]);

  // Fetch Buzzer Beaters & Game Winners team counts from snapshot
  useEffect(() => {
    if (!showHeroicBadges || heroicCache[seasonToken]) return;
    let cancelled = false;
    fetch(`/api/nba/advanced/heroic-shots?season=${encodeURIComponent(seasonToken)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as NbaHeroicShotsResponse;
      })
      .then((json) => {
        if (cancelled || !json) return;
        setHeroicCache((prev) => ({
          ...prev,
          [seasonToken]: json.teamCounts || {},
        }));
      })
      .catch(() => {
        // Ignore transient heroic fetch failure
      });
    return () => {
      cancelled = true;
    };
  }, [seasonToken, heroicCache, showHeroicBadges]);

  const enrichedTeams: EnrichedTeamRow[] = useMemo(() => {
    const ffMap = advCache[`${seasonToken}:four_factors`] || {};
    const scoringMap = advCache[`${seasonToken}:scoring`] || {};
    const zonesMap = advCache[`${seasonToken}:zones`] || {};
    const trackingMap = advCache[`${seasonToken}:tracking`] || {};
    const defHustleMap = advCache[`${seasonToken}:defense_hustle`] || {};
    const clutchMap = advCache[`${seasonToken}:clutch`] || {};
    const playtypesMap = advCache[`${seasonToken}:playtypes`] || {};
    const violationsMap = advCache[`${seasonToken}:violations`] || {};
    const heroicMap = heroicCache[seasonToken] || {};

    const lookup = <T,>(map: Record<string, T>, t: TeamSummary): T | undefined =>
      map[t.id] || map[`abbr:${t.abbreviation.toUpperCase()}`];

    return teams.map((t) => {
      const games = t.games;
      const gp = Math.max(1, t.wins + t.losses || games.length);
      const isTotals = statMode === 'totals';
      const slice = games.slice(0, Math.min(windowSize, games.length));
      const windowDiffAvg =
        slice.length > 0 ? round1(mean(slice.map((g) => g.differential))) : t.differential;
      const windowDiffTot =
        slice.length > 0 ? Math.round(slice.reduce((s, g) => s + g.differential, 0)) : Math.round(t.differential * gp);

      const ptsForPg = t.avgPointsFor || round1(mean(games.map((g) => g.pointsFor)));
      const ptsForTot = Math.round(games.length > 0 ? games.reduce((s, g) => s + g.pointsFor, 0) : ptsForPg * gp);
      const ptsAgainstPg = t.avgPointsAgainst || round1(mean(games.map((g) => g.pointsAgainst)));
      const ptsAgainstTot = Math.round(games.length > 0 ? games.reduce((s, g) => s + g.pointsAgainst, 0) : ptsAgainstPg * gp);
      const diffTot = Math.round(games.length > 0 ? games.reduce((s, g) => s + g.differential, 0) : t.differential * gp);

      const orebPg = round1(mean(games.map((g) => g.oreb)));
      const orebTot = Math.round(games.reduce((s, g) => s + g.oreb, 0));
      const drebPg = round1(mean(games.map((g) => g.dreb)));
      const drebTot = Math.round(games.reduce((s, g) => s + g.dreb, 0));
      const rebPg = round1(mean(games.map((g) => g.reb)));
      const rebTot = Math.round(games.reduce((s, g) => s + g.reb, 0));

      const fgmPg = round1(mean(games.map((g) => g.fgm)));
      const fgaPg = round1(mean(games.map((g) => g.fga)));
      const fgaTot = Math.round(games.reduce((s, g) => s + g.fga, 0));
      const fgmTot = Math.round(games.reduce((s, g) => s + g.fgm, 0));
      const fgPct = fgaTot > 0 ? round1((fgmTot / fgaTot) * 100) : 0;

      const fg3mPg = round1(mean(games.map((g) => g.fg3m)));
      const fg3aPg = round1(mean(games.map((g) => g.fg3a)));
      const fg3aTot = Math.round(games.reduce((s, g) => s + g.fg3a, 0));
      const fg3mTot = Math.round(games.reduce((s, g) => s + g.fg3m, 0));
      const fg3Pct = fg3aTot > 0 ? round1((fg3mTot / fg3aTot) * 100) : 0;

      const ftmPg = round1(mean(games.map((g) => g.ftm)));
      const ftaPg = round1(mean(games.map((g) => g.fta)));
      const ftaTot = Math.round(games.reduce((s, g) => s + g.fta, 0));
      const ftmTot = Math.round(games.reduce((s, g) => s + g.ftm, 0));
      const ftPct = ftaTot > 0 ? round1((ftmTot / ftaTot) * 100) : 0;

      const astPg = round1(mean(games.map((g) => g.ast)));
      const astTot = Math.round(games.reduce((s, g) => s + g.ast, 0));
      const stlPg = round1(mean(games.map((g) => g.stl)));
      const stlTot = Math.round(games.reduce((s, g) => s + g.stl, 0));
      const blkPg = round1(mean(games.map((g) => g.blk)));
      const blkTot = Math.round(games.reduce((s, g) => s + g.blk, 0));
      const tovPg = round1(mean(games.map((g) => g.tov)));
      const tovTot = Math.round(games.reduce((s, g) => s + g.tov, 0));
      const astTovRatio = tovPg > 0 ? round1(astPg / tovPg) : astPg;

      const pctPts3p = ptsForPg > 0 ? round1(((fg3mPg * 3) / ptsForPg) * 100) : 0;

      const adv = t.advanced;
      const offRtg = adv?.offRtg ?? round1(mean(games.map((g) => g.offRtg)));
      const defRtg = adv?.defRtg ?? round1(mean(games.map((g) => g.defRtg)));
      const netRtg = adv?.netRtg ?? round1(offRtg - defRtg);
      const winNetRtg = slice.length > 0 ? round1(mean(slice.map((g) => g.netRtg))) : netRtg;
      const pace = adv?.pace ?? round1(mean(games.map((g) => g.pace)));
      const efgPct = adv?.efgPct ?? round1(mean(games.map((g) => g.efgPct)));
      const tsPct = adv?.tsPct ?? round1(mean(games.map((g) => g.tsPct)));
      const orebPct = adv?.orebPct ?? round1(mean(games.map((g) => g.orebPct)));
      const tovPct = adv?.tovPct ?? round1(mean(games.map((g) => g.tovPct)));
      const pie = adv?.pie ?? 50;

      const ptsPaintPg = adv?.ptsPaint ?? 0;
      const oppPtsPaintPg = adv?.oppPtsPaint ?? 0;
      const pts2ndChancePg = adv?.pts2ndChance ?? 0;
      const ptsFastBreakPg = adv?.ptsFastBreak ?? 0;
      const ptsOffTovPg = adv?.ptsOffTov ?? 0;
      const contestedShotsPg = adv?.contestedShots ?? 0;
      const deflectionsPg = adv?.deflections ?? 0;
      const boxOutsPg = adv?.boxOuts ?? 0;
      const pfPg = adv?.pf ?? 0;
      const pfdPg = adv?.pfd ?? 0;
      const blkaPg = adv?.blka ?? 0;

      const pctPtsPaint = ptsForPg > 0 ? round1((ptsPaintPg / ptsForPg) * 100) : 0;

      const scaleInt = (v: number, gCount: number) => Math.round(v * gCount);
      const scaleDec = (v: number, gCount: number) => round1(v * gCount);

      // Zones
      const rawZone = lookup(zonesMap, t);
      const zGp = rawZone?.gp && rawZone.gp > 0 ? rawZone.gp : gp;
      const advZones: NbaShotZonesEntry | undefined = rawZone
        ? isTotals
          ? {
              ...rawZone,
              restrictedArea: {
                ...rawZone.restrictedArea,
                fgm: rawZone.restrictedArea.fgmTotal ?? scaleInt(rawZone.restrictedArea.fgm, zGp),
                fga: rawZone.restrictedArea.fgaTotal ?? scaleInt(rawZone.restrictedArea.fga, zGp),
              },
              paintNonRa: {
                ...rawZone.paintNonRa,
                fgm: rawZone.paintNonRa.fgmTotal ?? scaleInt(rawZone.paintNonRa.fgm, zGp),
                fga: rawZone.paintNonRa.fgaTotal ?? scaleInt(rawZone.paintNonRa.fga, zGp),
              },
              midRange: {
                ...rawZone.midRange,
                fgm: rawZone.midRange.fgmTotal ?? scaleInt(rawZone.midRange.fgm, zGp),
                fga: rawZone.midRange.fgaTotal ?? scaleInt(rawZone.midRange.fga, zGp),
              },
              leftCorner3: {
                ...rawZone.leftCorner3,
                fgm: rawZone.leftCorner3.fgmTotal ?? scaleInt(rawZone.leftCorner3.fgm, zGp),
                fga: rawZone.leftCorner3.fgaTotal ?? scaleInt(rawZone.leftCorner3.fga, zGp),
              },
              rightCorner3: {
                ...rawZone.rightCorner3,
                fgm: rawZone.rightCorner3.fgmTotal ?? scaleInt(rawZone.rightCorner3.fgm, zGp),
                fga: rawZone.rightCorner3.fgaTotal ?? scaleInt(rawZone.rightCorner3.fga, zGp),
              },
              corner3: {
                ...rawZone.corner3,
                fgm: rawZone.corner3.fgmTotal ?? scaleInt(rawZone.corner3.fgm, zGp),
                fga: rawZone.corner3.fgaTotal ?? scaleInt(rawZone.corner3.fga, zGp),
              },
              aboveBreak3: {
                ...rawZone.aboveBreak3,
                fgm: rawZone.aboveBreak3.fgmTotal ?? scaleInt(rawZone.aboveBreak3.fgm, zGp),
                fga: rawZone.aboveBreak3.fgaTotal ?? scaleInt(rawZone.aboveBreak3.fga, zGp),
              },
              totalRimFga: rawZone.totalRimFgaTotal ?? scaleInt(rawZone.totalRimFga, zGp),
              totalThreeFga: rawZone.totalThreeFgaTotal ?? scaleInt(rawZone.totalThreeFga, zGp),
            }
          : rawZone
        : undefined;

      // Tracking
      const rawTrack = lookup(trackingMap, t);
      const trackGp = rawTrack?.gp && rawTrack.gp > 0 ? rawTrack.gp : gp;
      const advTracking: NbaTrackingEntry | undefined = rawTrack
        ? isTotals
          ? {
              ...rawTrack,
              drives: scaleInt(rawTrack.drives, trackGp),
              driveFgm: scaleInt(rawTrack.driveFgm ?? 0, trackGp),
              driveFga: scaleInt(rawTrack.driveFga ?? 0, trackGp),
              drivePts: scaleInt(rawTrack.drivePts, trackGp),
              catchShootPts: scaleInt(rawTrack.catchShootPts, trackGp),
              pullUpPts: scaleInt(rawTrack.pullUpPts, trackGp),
              passesMade: scaleInt(rawTrack.passesMade, trackGp),
              passesReceived: scaleInt(rawTrack.passesReceived, trackGp),
              secondaryAst: scaleInt(rawTrack.secondaryAst, trackGp),
              potentialAst: scaleInt(rawTrack.potentialAst, trackGp),
              astPtsCreated: scaleInt(rawTrack.astPtsCreated, trackGp),
              touches: scaleInt(rawTrack.touches, trackGp),
              frontCtTouches: scaleInt(rawTrack.frontCtTouches ?? 0, trackGp),
              timeOfPoss: scaleDec(rawTrack.timeOfPoss ?? 0, trackGp),
              elbowTouches: scaleInt(rawTrack.elbowTouches, trackGp),
              postTouches: scaleInt(rawTrack.postTouches, trackGp),
              paintTouches: scaleInt(rawTrack.paintTouches, trackGp),
              distMiles: scaleDec(rawTrack.distMiles, trackGp),
              distMilesOff: scaleDec(rawTrack.distMilesOff ?? 0, trackGp),
              distMilesDef: scaleDec(rawTrack.distMilesDef ?? 0, trackGp),
              rebChances: scaleInt(rawTrack.rebChances, trackGp),
            }
          : rawTrack
        : undefined;

      // Defense & Hustle
      const rawDef = lookup(defHustleMap, t);
      const defGp = rawDef?.gp && rawDef.gp > 0 ? rawDef.gp : gp;
      const advDefHustle: NbaDefenseHustleEntry | undefined = rawDef
        ? isTotals
          ? {
              ...rawDef,
              stl: scaleInt(rawDef.stl ?? stlPg, defGp),
              blk: scaleInt(rawDef.blk ?? blkPg, defGp),
              ptsPaint: scaleInt(rawDef.ptsPaint, defGp),
              pts2ndChance: scaleInt(rawDef.pts2ndChance, defGp),
              ptsFb: scaleInt(rawDef.ptsFb, defGp),
              ptsOffTov: scaleInt(rawDef.ptsOffTov, defGp),
              oppPtsPaint: scaleInt(rawDef.oppPtsPaint, defGp),
              oppPts2ndChance: scaleInt(rawDef.oppPts2ndChance, defGp),
              oppPtsFb: scaleInt(rawDef.oppPtsFb, defGp),
              oppPtsOffTov: scaleInt(rawDef.oppPtsOffTov, defGp),
              oppPts: scaleInt(rawDef.oppPts ?? ptsAgainstPg, defGp),
              oppFg3m: scaleInt(rawDef.oppFg3m ?? 0, defGp),
              oppReb: scaleInt(rawDef.oppReb ?? 0, defGp),
              oppAst: scaleInt(rawDef.oppAst ?? 0, defGp),
              oppTov: scaleInt(rawDef.oppTov ?? 0, defGp),
              contestedShots: scaleInt(rawDef.contestedShots, defGp),
              contestedShots2pt: scaleInt(rawDef.contestedShots2pt, defGp),
              contestedShots3pt: scaleInt(rawDef.contestedShots3pt, defGp),
              deflections: scaleInt(rawDef.deflections, defGp),
              chargesDrawn: scaleInt(rawDef.chargesDrawn, defGp),
              screenAssists: scaleInt(rawDef.screenAssists, defGp),
              screenAstPts: scaleInt(rawDef.screenAstPts, defGp),
              looseBalls: scaleInt(rawDef.looseBalls, defGp),
              offLooseBalls: scaleInt(rawDef.offLooseBalls, defGp),
              defLooseBalls: scaleInt(rawDef.defLooseBalls, defGp),
              boxOuts: scaleInt(rawDef.boxOuts, defGp),
              offBoxOuts: scaleInt(rawDef.offBoxOuts, defGp),
              defBoxOuts: scaleInt(rawDef.defBoxOuts, defGp),
              boxOutTeamRebs: scaleInt(rawDef.boxOutTeamRebs, defGp),
              boxOutPlayerRebs: scaleInt(rawDef.boxOutPlayerRebs, defGp),
              dFgm: scaleInt(rawDef.dFgm, defGp),
              dFga: scaleInt(rawDef.dFga, defGp),
            }
          : rawDef
        : undefined;

      // Clutch
      const rawCl = lookup(clutchMap, t);
      const clGp = rawCl?.gp && rawCl.gp > 0 ? rawCl.gp : 1;
      const advClutch: NbaClutchEntry | undefined = rawCl
        ? isTotals
          ? {
              ...rawCl,
              min: scaleDec(rawCl.min, clGp),
              pts: scaleInt(rawCl.pts, clGp),
              reb: scaleInt(rawCl.reb, clGp),
              ast: scaleInt(rawCl.ast, clGp),
              stl: scaleInt(rawCl.stl, clGp),
              blk: scaleInt(rawCl.blk, clGp),
              tov: scaleInt(rawCl.tov, clGp),
              plusMinus: scaleInt(rawCl.plusMinus, clGp),
            }
          : rawCl
        : undefined;

      // Playtypes
      const rawPt = lookup(playtypesMap, t);
      const advPlaytypes: NbaPlaytypeEntitySummary | undefined = rawPt
        ? isTotals
          ? {
              ...rawPt,
              totalPossOff: scaleInt(rawPt.totalPossOff, zGp),
            }
          : rawPt
        : undefined;

      // Violations (backend returns 19 violation counts in Totals, and pf/pfd/blka/tov/ptsPaint in PerGame)
      const rawViol = lookup(violationsMap, t);
      const violGp = rawViol?.gp && rawViol.gp > 0 ? rawViol.gp : gp;
      const advViolations: NbaViolationsEntry | undefined = rawViol
        ? isTotals
          ? {
              ...rawViol,
              min: scaleDec(rawViol.min, violGp),
              pf: scaleInt(rawViol.pf, violGp),
              pfd: scaleInt(rawViol.pfd, violGp),
              blka: scaleInt(rawViol.blka, violGp),
              tov: scaleInt(rawViol.tov, violGp),
              ptsPaint: scaleInt(rawViol.ptsPaint, violGp),
              pts2ndChance: scaleInt(rawViol.pts2ndChance, violGp),
              ptsFb: scaleInt(rawViol.ptsFb, violGp),
              ptsOffTov: scaleInt(rawViol.ptsOffTov, violGp),
              oppPtsPaint: scaleInt(rawViol.oppPtsPaint, violGp),
              oppPts2ndChance: scaleInt(rawViol.oppPts2ndChance, violGp),
              oppPtsFb: scaleInt(rawViol.oppPtsFb, violGp),
              oppPtsOffTov: scaleInt(rawViol.oppPtsOffTov, violGp),
            }
          : {
              ...rawViol,
              travel: round2(rawViol.travel / violGp),
              doubleDribble: round2(rawViol.doubleDribble / violGp),
              discontinuedDribble: round2(rawViol.discontinuedDribble / violGp),
              offThreeSec: round2(rawViol.offThreeSec / violGp),
              fiveSec: round2(rawViol.fiveSec / violGp),
              eightSec: round2(rawViol.eightSec / violGp),
              shotClock: round2(rawViol.shotClock / violGp),
              inbound: round2(rawViol.inbound / violGp),
              backcourt: round2(rawViol.backcourt / violGp),
              offGoaltending: round2(rawViol.offGoaltending / violGp),
              palming: round2(rawViol.palming / violGp),
              offFoul: round2(rawViol.offFoul / violGp),
              defThreeSec: round2(rawViol.defThreeSec / violGp),
              charge: round2(rawViol.charge / violGp),
              delayOfGame: round2(rawViol.delayOfGame / violGp),
              defGoaltending: round2(rawViol.defGoaltending / violGp),
              lane: round2(rawViol.lane / violGp),
              jumpBall: round2(rawViol.jumpBall / violGp),
              kickedBall: round2(rawViol.kickedBall / violGp),
              totalViolations: round2(rawViol.totalViolations / violGp),
            }
        : undefined;

      return {
        ...t,
        statMode,
        avgPointsFor: isTotals ? ptsForTot : ptsForPg,
        avgPointsAgainst: isTotals ? ptsAgainstTot : ptsAgainstPg,
        differential: isTotals ? diffTot : t.differential,
        windowDiff: isTotals ? windowDiffTot : windowDiffAvg,
        ptsForAvg: isTotals ? ptsForTot : ptsForPg,
        ptsAgainstAvg: isTotals ? ptsAgainstTot : ptsAgainstPg,
        orebAvg: isTotals ? orebTot : orebPg,
        drebAvg: isTotals ? drebTot : drebPg,
        rebAvg: isTotals ? rebTot : rebPg,
        fgmAvg: isTotals ? fgmTot : fgmPg,
        fgaAvg: isTotals ? fgaTot : fgaPg,
        fgPct,
        fg3mAvg: isTotals ? fg3mTot : fg3mPg,
        fg3aAvg: isTotals ? fg3aTot : fg3aPg,
        fg3Pct,
        ftmAvg: isTotals ? ftmTot : ftmPg,
        ftaAvg: isTotals ? ftaTot : ftaPg,
        ftPct,
        astAvg: isTotals ? astTot : astPg,
        stlAvg: isTotals ? stlTot : stlPg,
        blkAvg: isTotals ? blkTot : blkPg,
        tovAvg: isTotals ? tovTot : tovPg,
        pfAvg: isTotals ? scaleInt(pfPg, violGp) : pfPg,
        pfdAvg: isTotals ? scaleInt(pfdPg, violGp) : pfdPg,
        blkaAvg: isTotals ? scaleInt(blkaPg, violGp) : blkaPg,
        astTovRatio,
        pctPts3p,
        pctPtsPaint,
        offRtg,
        defRtg,
        netRtg,
        winNetRtg,
        pace,
        efgPct,
        tsPct,
        orebPct,
        tovPct,
        pie,
        ptsPaint: isTotals ? scaleInt(ptsPaintPg, defGp) : ptsPaintPg,
        oppPtsPaint: isTotals ? scaleInt(oppPtsPaintPg, defGp) : oppPtsPaintPg,
        pts2ndChance: isTotals ? scaleInt(pts2ndChancePg, defGp) : pts2ndChancePg,
        ptsFastBreak: isTotals ? scaleInt(ptsFastBreakPg, defGp) : ptsFastBreakPg,
        ptsOffTov: isTotals ? scaleInt(ptsOffTovPg, defGp) : ptsOffTovPg,
        contestedShots: isTotals ? scaleInt(contestedShotsPg, defGp) : contestedShotsPg,
        deflections: isTotals ? scaleInt(deflectionsPg, defGp) : deflectionsPg,
        boxOuts: isTotals ? scaleInt(boxOutsPg, defGp) : boxOutsPg,
        advFourFactors: lookup(ffMap, t),
        advScoring: lookup(scoringMap, t),
        advZones,
        advTracking,
        advDefHustle,
        advClutch,
        advPlaytypes,
        advViolations,
        buzzerBeaters:
          (heroicMap[t.id] || heroicMap[String(t.abbreviation || '').toUpperCase()])?.buzzerBeaters ?? 0,
        gameWinners:
          (heroicMap[t.id] || heroicMap[String(t.abbreviation || '').toUpperCase()])?.gameWinners ?? 0,
      };
    });
  }, [teams, windowSize, advCache, heroicCache, seasonToken, statMode]);

  const activeLayerColumns = useMemo(() => {
    const allDefs = TEAM_COLUMNS_BY_LAYER[viewMode].filter(
      (c) => showHeroicBadges || (c.key !== 'buzzerBeaters' && c.key !== 'gameWinners')
    );
    const visibleSet = new Set(visibleColsByLayer[viewMode] || activeLayerMeta.defaultCols);
    const active = allDefs.filter((c) => visibleSet.has(c.key));
    return active.length > 0 ? active : allDefs.slice(0, 6);
  }, [viewMode, visibleColsByLayer, activeLayerMeta, showHeroicBadges]);

  const activeSortColDef = useMemo(
    () => TEAM_COLUMNS_BY_LAYER[viewMode].find((c) => c.key === sortKey),
    [viewMode, sortKey]
  );

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query.trim());
    return enrichedTeams
      .filter((t) => {
        if (onlyWatchlist && !watchlistIds.has(`team:${t.id}`)) return false;
        if (!matchesTeamUnifiedFilters(t, unifiedFilters)) return false;
        if (q) {
          const hay = normalizeSearchText(`${t.name} ${t.abbreviation} ${t.conference}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'watched') {
          const wa = watchlistIds.has(`team:${a.id}`);
          const wb = watchlistIds.has(`team:${b.id}`);
          return compareSortValues(wa, wb, sortAsc) || b.winPct - a.winPct;
        }
        if (sortKey === 'name') {
          return compareSortValues(a.name, b.name, sortAsc);
        }
        if (sortKey === 'domVsNba') {
          return sortAsc ? a.netRtg - b.netRtg : b.netRtg - a.netRtg;
        }
        if (sortKey === 'streak') {
          const sa = parseStreakCodeValue(a.streakCode);
          const sb = parseStreakCodeValue(b.streakCode);
          return sortAsc ? sa - sb : sb - sa;
        }
        if (activeSortColDef) {
          if (activeSortColDef.isString && activeSortColDef.getStrValue) {
            return compareSortValues(
              activeSortColDef.getStrValue(a),
              activeSortColDef.getStrValue(b),
              sortAsc
            );
          }
          const va = activeSortColDef.getNumValue(a);
          const vb = activeSortColDef.getNumValue(b);
          if (va === null && vb === null) return b.winPct - a.winPct;
          if (va === null) return 1;
          if (vb === null) return -1;
          return compareSortValues(va, vb, sortAsc) || b.winPct - a.winPct;
        }
        const va = (a as any)[sortKey];
        const vb = (b as any)[sortKey];
        if (typeof va === 'number' && typeof vb === 'number') {
          return sortAsc ? va - vb : vb - va;
        }
        return b.winPct - a.winPct;
      });
  }, [enrichedTeams, onlyWatchlist, watchlistIds, unifiedFilters, query, sortKey, sortAsc, activeSortColDef]);

  const summary = useMemo(() => {
    if (enrichedTeams.length === 0) return null;
    const bestNet = [...enrichedTeams].sort((a, b) => b.netRtg - a.netRtg)[0];
    const bestDef = [...enrichedTeams].sort((a, b) => a.defRtg - b.defRtg)[0];
    const fastest = [...enrichedTeams].sort((a, b) => b.pace - a.pace)[0];
    return { bestNet, bestDef, fastest };
  }, [enrichedTeams]);

  const handleModeSwitch = (mode: TeamTableView) => {
    setViewMode(mode);
    const meta = TEAM_LAYERS.find((l) => l.id === mode);
    const nextSort = meta?.defaultSortKey || 'winPct';
    setSortKey(nextSort);
    const def = TEAM_COLUMNS_BY_LAYER[mode].find((c) => c.key === nextSort);
    setSortAsc(Boolean(def?.lowerIsBetter));
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      const def = TEAM_COLUMNS_BY_LAYER[viewMode].find((c) => c.key === key);
      setSortAsc(key === 'name' || Boolean(def?.lowerIsBetter));
    }
  };

  const SH = ({
    label,
    k,
    helpKey,
    className = 'py-3 px-2.5',
    align = 'right',
  }: {
    label: string;
    k: string;
    helpKey?: string;
    className?: string;
    align?: 'left' | 'right';
  }) => (
    <SortableTh
      label={label}
      helpKey={helpKey ?? k}
      active={sortKey === k}
      asc={sortAsc}
      onSort={() => handleSort(k)}
      align={align}
      className={className}
    />
  );

  const mobileSortOptions: Array<{ id: string; label: string }> =
    experienceMode === 'simple'
      ? [
          { id: 'winPct', label: 'Victorias' },
          { id: 'windowDiff', label: `Margen Últ.${windowSize}` },
          { id: 'avgPointsFor', label: 'Ataque' },
          { id: 'avgPointsAgainst', label: 'Defensa' },
        ]
      : activeLayerColumns.slice(0, 6).map((col) => ({
          id: col.key,
          label: formatTeamColHeader(col, statMode, windowSize),
        }));

  const dynamicTotalsBenchmarks = useMemo(() => {
    const compute = (vals: number[], lowerIsBetter = false): MetricBenchmark | undefined => {
      if (vals.length === 0) return undefined;
      const m = mean(vals);
      const variance = vals.reduce((acc, v) => acc + (v - m) ** 2, 0) / vals.length;
      return { mean: m, sd: Math.max(0.01, Math.sqrt(variance)), lowerIsBetter, decimals: 0 };
    };
    return {
      avgPointsFor: compute(enrichedTeams.map((t) => t.avgPointsFor), false),
      avgPointsAgainst: compute(enrichedTeams.map((t) => t.avgPointsAgainst), true),
      differential: compute(enrichedTeams.map((t) => t.differential), false),
      windowDiffAbsMean: mean(enrichedTeams.map((t) => Math.abs(t.windowDiff))),
    };
  }, [enrichedTeams]);

  const getColBenchmark = (col: TeamColDef): MetricBenchmark | undefined => {
    if (!col.benchmarkKey) return undefined;
    if (statMode === 'per_game' || INVARIANT_TEAM_COL_KEYS.has(col.key)) {
      return benchmarks.team[col.benchmarkKey];
    }
    const vals = enrichedTeams
      .map((t) => col.getNumValue(t))
      .filter((v): v is number => v !== null);
    if (vals.length === 0) return undefined;
    const m = mean(vals);
    const variance = vals.reduce((acc, v) => acc + (v - m) ** 2, 0) / vals.length;
    return {
      mean: m,
      sd: Math.max(0.01, Math.sqrt(variance)),
      lowerIsBetter: col.lowerIsBetter,
      decimals: 0,
    };
  };

  const renderAverageCell = (key: keyof LeagueBenchmarks['team'], suffix = '') => {
    if (statMode === 'totals' && (key === 'avgPointsFor' || key === 'avgPointsAgainst')) {
      const dyn = dynamicTotalsBenchmarks[key];
      if (!dyn) return <td className="py-2.5 px-2.5 text-right font-mono text-slate-500">—</td>;
      return (
        <td className="py-2.5 px-2.5 text-right font-mono text-slate-400 bg-slate-800/20 italic tabular-nums">
          {dyn.mean.toFixed(0)}
        </td>
      );
    }
    const b = benchmarks.team[key];
    if (!b) return <td className="py-2.5 px-2.5 text-right font-mono text-slate-500">—</td>;
    return (
      <td className="py-2.5 px-2.5 text-right font-mono text-slate-400 bg-slate-800/20 italic tabular-nums">
        {b.mean.toFixed(b.decimals ?? 1)}
        {suffix || b.suffix}
      </td>
    );
  };

  const renderDynamicAverageCell = (col: TeamColDef, idx: number) => {
    const padClass = idx === activeLayerColumns.length - 1 ? 'py-2.5 pl-2.5 pr-4' : 'py-2.5 px-2.5';
    if (col.isString) {
      return <td key={col.key} className={`${padClass} bg-slate-800/20`} />;
    }
    if (col.key === 'windowDiff') {
      const val = statMode === 'totals' ? dynamicTotalsBenchmarks.windowDiffAbsMean : (benchmarks.team.differential.spreadMean || 0);
      return (
        <td key={col.key} className={`${padClass} text-right font-mono text-slate-500 bg-slate-800/20 italic tabular-nums`}>
          ±{val.toFixed(statMode === 'totals' ? 0 : 1)}
        </td>
      );
    }
    if (col.key === 'winNetRtg') {
      return (
        <td key={col.key} className={`${padClass} text-right font-mono text-slate-500 bg-slate-800/20 italic tabular-nums`}>
          ±{(benchmarks.team.netRtg.spreadMean || 0).toFixed(1)}
        </td>
      );
    }
    if (col.benchmarkKey && benchmarks.team[col.benchmarkKey] && (statMode === 'per_game' || INVARIANT_TEAM_COL_KEYS.has(col.key))) {
      const b = benchmarks.team[col.benchmarkKey];
      return (
        <td key={col.key} className={`${padClass} text-right font-mono text-slate-400 bg-slate-800/20 italic tabular-nums`}>
          {b.mean.toFixed(b.decimals ?? col.decimals ?? 1)}
          {col.suffix ?? b.suffix}
        </td>
      );
    }
    const vals = enrichedTeams
      .map((t) => col.getNumValue(t))
      .filter((v): v is number => v !== null);
    if (vals.length === 0) {
      return <td key={col.key} className={`${padClass} text-right font-mono text-slate-500 bg-slate-800/20`}>—</td>;
    }
    const avg = mean(vals);
    const isViolRate = viewMode === 'violations' && statMode === 'per_game' && !['pfAvg', 'pfdAvg', 'blkaAvg', 'tovAvg', 'ptsPaint', 'oppPtsPaint'].includes(col.key);
    const dec = isViolRate
      ? 2
      : statMode === 'totals' && !INVARIANT_TEAM_COL_KEYS.has(col.key)
      ? col.key === 'distMiles' || col.key === 'clMin'
        ? 1
        : 0
      : (col.decimals ?? 1);
    return (
      <td key={col.key} className={`${padClass} text-right font-mono text-slate-400 bg-slate-800/20 italic tabular-nums`}>
        {avg.toFixed(dec)}
        {col.suffix || ''}
      </td>
    );
  };

  const getToneTextClass = (col: TeamColDef, r: EnrichedTeamRow): string => {
    const t = col.tone ? col.tone(r) : 'neutral';
    if (t === 'positive') return 'text-emerald-400 font-semibold';
    if (t === 'negative') return 'text-rose-400 font-semibold';
    if (t === 'accent') return 'text-orange-300 font-semibold';
    if (t === 'warning') return 'text-amber-300';
    return 'text-slate-200';
  };

  const handleBuildTeamsSnapshot = async () => {
    const dateSlug = new Date().toISOString().slice(0, 10);
    const topRows = filtered.slice(0, 30);
    const modeSlug = experienceMode === 'simple' ? 'esencial' : viewMode;
    const filename = `radarnba-equipos-${modeSlug}-${statMode === 'totals' ? 'totales' : 'pj'}-${dateSlug}.png`;

    const snapshotCols =
      experienceMode === 'simple'
        ? [
            { key: 'winPct', label: 'BALANCE', align: 'right' as const, widthWeight: 1.0 },
            { key: 'ptsFor', label: 'ATAQUE', align: 'right' as const, widthWeight: 0.9 },
            { key: 'ptsAg', label: 'DEFENSA', align: 'right' as const, widthWeight: 0.9 },
            { key: 'winDiff', label: `ÚLT. ${windowSize}`, align: 'right' as const, widthWeight: 0.95 },
            { key: 'net', label: 'NETRTG', align: 'right' as const, widthWeight: 0.95 },
          ]
        : activeLayerColumns.slice(0, 7).map((col) => ({
            key: col.key,
            label: formatTeamColHeader(col, statMode, windowSize).toUpperCase(),
            align: (col.align || 'right') as 'left' | 'right',
            widthWeight: col.isString ? 1.3 : 0.95,
          }));

    return buildTableSnapshotBlob({
      filename,
      categoryTag: 'EXPLORADOR DE FRANQUICIAS NBA',
      title:
        experienceMode === 'simple'
          ? `Clasificación y Rendimiento de Equipos NBA (${statMode === 'totals' ? 'Totales' : 'Por Partido'})`
          : `Equipos NBA · ${activeLayerMeta.label} (${statMode === 'totals' ? 'Totales' : 'Por Partido'})`,
      subtitle: `${filtered.length} franquicias · ${statMode === 'totals' ? 'Acumulado temporada' : 'Promedios por partido'} · Últ. ${windowSize} PJ`,
      entityColumnLabel: 'FRANQUICIA',
      entityColumnWeight: 2.3,
      kpis: [
        {
          label: 'MUESTRA',
          value: `${filtered.length} eq.`,
          sublabel: activeLayerMeta.label,
        },
        {
          label: 'MEJOR NET RATING',
          value: summary?.bestNet ? summary.bestNet.abbreviation : '—',
          sublabel: summary?.bestNet
            ? `${formatSigned(summary.bestNet.netRtg)} NetRtg`
            : undefined,
          tone: 'positive',
        },
        {
          label: 'MEJOR DEFENSA',
          value: summary?.bestDef ? summary.bestDef.abbreviation : '—',
          sublabel: summary?.bestDef
            ? `${summary.bestDef.defRtg.toFixed(1)} DefRtg`
            : undefined,
          tone: 'accent',
        },
      ],
      columns: snapshotCols,
      rows: topRows.map((t, idx) => {
        const cells: Record<string, TableSnapshotCell | string> = {};
        if (experienceMode === 'simple') {
          const dec = statMode === 'totals' ? 0 : 1;
          cells.winPct = { text: `${t.wins}-${t.losses}` };
          cells.ptsFor = { text: t.avgPointsFor.toFixed(dec) };
          cells.ptsAg = { text: t.avgPointsAgainst.toFixed(dec) };
          cells.winDiff = { text: formatSigned(t.windowDiff, dec), tone: t.windowDiff >= 0 ? 'positive' : 'negative' };
          cells.net = { text: formatSigned(t.netRtg), tone: t.netRtg >= 0 ? 'positive' : 'negative' };
        } else {
          for (const col of activeLayerColumns.slice(0, 7)) {
            cells[col.key] = { text: col.format(t), tone: col.tone ? col.tone(t) : 'neutral' };
          }
        }
        return {
          rank: idx + 1,
          teamAbbr: t.abbreviation,
          entityName: t.name,
          entitySubtext: `Conf. ${t.conference} · ${t.wins}-${t.losses}`,
          cells,
        };
      }),
      footerNote: `RadarNBA · ${topRows.length} franquicias según orden activo`,
    });
  };

  return (
    <div className="space-y-5">
      {/* Row 1: Homogeneous 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Franquicias NBA</span>
            <MetricInfoTooltip helpKey="avgPointsFor" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {teams.length}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {statMode === 'totals'
              ? `Media: ${(dynamicTotalsBenchmarks.avgPointsFor?.mean ?? 0).toFixed(0)} PTS tot.`
              : `Media: ${benchmarks.team.avgPointsFor.mean.toFixed(1)} PTS · Margen ±${(benchmarks.team.differential.spreadMean ?? 4.8).toFixed(1)}`}
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple' ? 'Más dominante' : 'Mejor Net Rating'}
            </span>
            <MetricInfoTooltip helpKey="netRtg" align="right" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.bestNet && (
              <TeamLogo
                abbr={summary.bestNet.abbreviation}
                teamId={summary.bestNet.id}
                logoUrl={summary.bestNet.logoUrl}
                size="sm"
                framed
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.bestNet?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
                {summary?.bestNet
                  ? experienceMode === 'simple'
                    ? `${formatSigned(summary.bestNet.differential, statMode === 'totals' ? 0 : 1)} PTS de ventaja`
                    : `${formatSigned(summary.bestNet.netRtg)} (Off ${summary.bestNet.offRtg.toFixed(1)})`
                  : '—'}
              </p>
            </div>
          </div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple' ? 'Mejor defensa' : 'Mejor DefRtg'}
            </span>
            <MetricInfoTooltip helpKey="defRtg" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.bestDef && (
              <TeamLogo
                abbr={summary.bestDef.abbreviation}
                teamId={summary.bestDef.id}
                logoUrl={summary.bestDef.logoUrl}
                size="sm"
                framed
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.bestDef?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
                {summary?.bestDef
                  ? experienceMode === 'simple'
                    ? `Encaja ${summary.bestDef.avgPointsAgainst.toFixed(statMode === 'totals' ? 0 : 1)} PTS`
                    : `${summary.bestDef.defRtg.toFixed(1)} pts / 100 pos`
                  : '—'}
              </p>
            </div>
          </div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple' ? 'Ritmo más rápido' : 'Mayor Pace real'}
            </span>
            <MetricInfoTooltip helpKey="paceSimple" align="right" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.fastest && (
              <TeamLogo
                abbr={summary.fastest.abbreviation}
                teamId={summary.fastest.id}
                logoUrl={summary.fastest.logoUrl}
                size="sm"
                framed
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.fastest?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-slate-300 truncate">
                {summary?.fastest ? `${summary.fastest.pace.toFixed(1)} pos / partido` : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Homogeneous Layer Selector (10 Capas) + Customizer + Search */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {experienceMode === 'simple' ? (
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <span className="text-xs text-slate-300">
                Vista esencial de las 30 franquicias con comparativa frente a la Media de la NBA.
              </span>
              <button
                type="button"
                onClick={onSwitchToAdvanced}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Ver las 10 Capas Estadísticas NBA.com</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1.5 w-full">
              <span className="text-xs text-slate-400 block">
                Capas estadísticas NBA.com (10 módulos · personaliza columnas en cada capa):
              </span>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                {TEAM_LAYERS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModeSwitch(m.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      viewMode === m.id
                        ? 'bg-orange-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-[#182338]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Per-Layer Metric Customizer (Poner/Quitar estadísticas) */}
        {experienceMode === 'advanced' && (
          <div className="pt-2 border-t border-[#1E293B]">
            <LayerColumnCustomizer
              columns={TEAM_COLUMNS_BY_LAYER[viewMode]
                .filter((c) => showHeroicBadges || (c.key !== 'buzzerBeaters' && c.key !== 'gameWinners'))
                .map((c) => ({ key: c.key, label: c.label }))}
              visibleKeys={(visibleColsByLayer[viewMode] || activeLayerMeta.defaultCols).filter(
                (k) => showHeroicBadges || (k !== 'buzzerBeaters' && k !== 'gameWinners')
              )}
              defaultKeys={activeLayerMeta.defaultCols.filter(
                (k) => showHeroicBadges || (k !== 'buzzerBeaters' && k !== 'gameWinners')
              )}
              onChangeVisibleKeys={(next) =>
                setVisibleColsByLayer((prev) => ({ ...prev, [viewMode]: next }))
              }
              isLoading={loadingCategory !== null && loadingCategory === activeLayerMeta.categoryToFetch}
              loadingLabel={`Descargando ${activeLayerMeta.label} de NBA.com...`}
              errorMessage={categoryError}
            />
          </div>
        )}

        <div className="pt-2.5 border-t border-[#1E293B] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="relative w-full xl:max-w-md shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar equipo o abreviatura..."
              className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2.5">
            <span className="text-[11px] font-mono text-slate-400">
              {filtered.length} de {enrichedTeams.length} franquicias visibles
            </span>
            <div
              className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs"
              role="group"
              aria-label="Modo de volumen estadístico"
            >
              <button
                type="button"
                onClick={() => setStatMode('per_game')}
                className={`px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  statMode === 'per_game'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Por Partido
              </button>
              <button
                type="button"
                onClick={() => setStatMode('totals')}
                className={`px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  statMode === 'totals'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Totales
              </button>
            </div>
            <ExportImageButton
              onBuildImage={handleBuildTeamsSnapshot}
              disabled={filtered.length === 0}
            />
          </div>
        </div>
      </div>

      <UnifiedEntityFilterBar
        filters={unifiedFilters}
        onChange={setUnifiedFilters}
        teams={teams}
        entityScope="team"
        shownCount={filtered.length}
        totalCount={enrichedTeams.length}
        unitLabel="franquicias"
      />

      {/* Row 3: Homogeneous Data Table / Mobile Franchise Cards */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
        {/* Mobile Sort Strip + Franchise Cards (< md) */}
        <div className="md:hidden">
          <div className="px-3.5 py-2 bg-[#0F172A]/70 border-b border-[#1E293B] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
              Ordenar:
            </span>
            {mobileSortOptions.map((opt) => {
              const active = sortKey === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSort(opt.id)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#1E293B] text-orange-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                  {active ? (sortAsc ? ' ↑' : ' ↓') : ''}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="py-10 px-6 text-center text-xs text-slate-400">
              Ninguna franquicia coincide con el filtro actual.
            </div>
          ) : (
            <div className="divide-y divide-[#1E293B]">
              {filtered.map((t) => {
                const wKey = `team:${t.id}`;
                const watched = watchlistIds.has(wKey);
                const topMobileCols = activeLayerColumns.slice(0, 4);

                return (
                  <div
                    key={t.id}
                    onClick={() => onInspectEntity('team', t.id)}
                    className="p-3.5 space-y-2 hover:bg-[#182338]/50 active:bg-[#182338] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TeamLogo
                          abbr={t.abbreviation}
                          teamId={t.id}
                          logoUrl={t.logoUrl}
                          size="md"
                          framed
                        />
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm text-slate-100 truncate flex items-center gap-1.5">
                            <span className="truncate">{t.name}</span>
                            {showHeroicBadges && t.buzzerBeaters > 0 && (
                              <span
                                title={`${t.buzzerBeaters} Buzzer Beater(s) oficiales`}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30 shrink-0"
                              >
                                ⚡ {t.buzzerBeaters} BB
                              </span>
                            )}
                            {showHeroicBadges && t.gameWinners > 0 && (
                              <span
                                title={`${t.gameWinners} Game Winner(s) oficiales`}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0"
                              >
                                🎯 {t.gameWinners} GW
                              </span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-400 truncate">
                            {t.abbreviation} · Conf. {t.conference} · {t.wins}-{t.losses} (
                            {(t.winPct * 100).toFixed(0)}%)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleWatchlist(wKey);
                          }}
                          className="p-1.5 rounded-md text-slate-400 hover:text-orange-400"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              watched ? 'fill-orange-400 text-orange-400' : ''
                            }`}
                          />
                        </button>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            t.streakCode.startsWith('W')
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {t.streakCode}
                        </span>
                      </div>
                    </div>

                    {experienceMode === 'simple' ? (
                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        <div
                          className={getHeatmapClass(
                            t.avgPointsFor,
                            statMode === 'totals' ? dynamicTotalsBenchmarks.avgPointsFor : benchmarks.team.avgPointsFor
                          )}
                        >
                          <div className="text-[10px] text-slate-400">PTS Fav/Con</div>
                          <div className="font-mono tabular-nums text-slate-100 mt-0.5">
                            {t.avgPointsFor.toFixed(0)}/{t.avgPointsAgainst.toFixed(0)}
                          </div>
                        </div>
                        <div
                          className={getHeatmapClass(
                            t.differential,
                            statMode === 'totals' ? dynamicTotalsBenchmarks.differential : benchmarks.team.differential
                          )}
                        >
                          <div className="text-[10px] text-slate-400">Dif. Base</div>
                          <div
                            className={`font-mono tabular-nums font-medium mt-0.5 ${
                              t.differential >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatSigned(t.differential, statMode === 'totals' ? 0 : 1)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Dif. Últ.{windowSize}</div>
                          <div className="font-mono tabular-nums font-semibold text-orange-300 mt-0.5">
                            {formatSigned(t.windowDiff, statMode === 'totals' ? 0 : 1)}
                          </div>
                        </div>
                        <div className={`text-right ${getHeatmapClass(t.fg3Pct, benchmarks.team.fg3Pct)}`}>
                          <div className="text-[10px] text-slate-400">3PM (3P%)</div>
                          <div className="font-mono tabular-nums text-slate-200 mt-0.5">
                            {t.fg3mAvg.toFixed(statMode === 'totals' ? 0 : 1)} ({t.fg3Pct.toFixed(0)}%)
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        {topMobileCols.map((col, idx) => {
                          const numVal = col.getNumValue(t);
                          const bench = getColBenchmark(col);
                          return (
                            <div
                              key={col.key}
                              className={`${idx === 3 ? 'text-right' : ''} ${getHeatmapClass(numVal, bench)}`}
                            >
                              <div className="text-[10px] text-slate-400 truncate">
                                {formatTeamColHeader(col, statMode, windowSize)}
                              </div>
                              <div className={`font-mono tabular-nums mt-0.5 truncate ${getToneTextClass(col, t)}`}>
                                {col.format(t)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Full Table (md+) */}
        <div className="hidden md:block overflow-auto max-h-[72vh]">
          <table className="w-full text-left border-collapse">
            <thead className={STICKY_THEAD_CLASS}>
              <tr className="text-xs text-slate-400">
                <SortableTh
                  label="Seg."
                  active={sortKey === 'watched'}
                  asc={sortAsc}
                  onSort={() => handleSort('watched')}
                  align="left"
                  className="py-3 pl-4 pr-2 w-12"
                  compact
                />
                <SortableTh
                  label="Franquicia"
                  active={sortKey === 'name'}
                  asc={sortAsc}
                  onSort={() => handleSort('name')}
                  align="left"
                  className="py-3 px-3"
                />

                {experienceMode === 'simple' ? (
                  <>
                    <SH label="Victorias" k="winPct" />
                    <SH label="Ataque (Anota)" k="avgPointsFor" />
                    <SH label="Defensa (Recibe)" k="avgPointsAgainst" />
                    <SH label={`Margen Últ.${windowSize}`} k="windowDiff" helpKey="windowDiff" />
                    <SH
                      label="Dominio vs Media NBA"
                      k="domVsNba"
                      helpKey="vsLeagueBar"
                      align="left"
                      className="py-3 px-3 w-56"
                    />
                    <SH
                      label="Racha actual"
                      k="streak"
                      helpKey="streakCurrent"
                      className="py-3 pl-2.5 pr-4"
                    />
                  </>
                ) : (
                  activeLayerColumns.map((col, idx) => (
                    <SH
                      key={col.key}
                      label={formatTeamColHeader(col, statMode, windowSize)}
                      k={col.key}
                      helpKey={col.helpKey || col.key}
                      align={col.align || 'right'}
                      className={
                        idx === activeLayerColumns.length - 1
                          ? 'py-3 pl-2.5 pr-4'
                          : 'py-3 px-2.5'
                      }
                    />
                  ))
                )}
              </tr>

              {/* Reference Row: PROMEDIO NBA */}
              <tr className="border-b-2 border-[#1E293B] bg-[#1E293B]/30 sticky top-[41px] z-20">
                <td className="py-2.5 pl-4 pr-2 bg-slate-800/40" />
                <td className="py-2.5 px-3 bg-slate-800/40">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-slate-700/50 flex items-center justify-center text-[10px] font-bold text-slate-400">
                      NBA
                    </div>
                    <span className="text-xs font-bold text-slate-300 tracking-wider">
                      PROMEDIO NBA
                    </span>
                  </div>
                </td>
                {experienceMode === 'simple' ? (
                  <>
                    {renderAverageCell('winPct')}
                    {renderAverageCell('avgPointsFor')}
                    {renderAverageCell('avgPointsAgainst')}
                    <td className="py-2.5 px-2.5 text-right font-mono text-slate-500 bg-slate-800/20 italic tabular-nums">
                      ±{(statMode === 'totals' ? dynamicTotalsBenchmarks.windowDiffAbsMean : (benchmarks.team.differential.spreadMean || 0)).toFixed(statMode === 'totals' ? 0 : 1)}
                    </td>
                    <td className="py-2.5 px-3 bg-slate-800/20" />
                    <td className="py-2.5 pl-2.5 pr-4 bg-slate-800/20" />
                  </>
                ) : (
                  activeLayerColumns.map((col, idx) => renderDynamicAverageCell(col, idx))
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-sm">
              {filtered.map((t) => {
                const wKey = `team:${t.id}`;
                const watched = watchlistIds.has(wKey);
                const offEval = evaluateVsLeague(
                  t.avgPointsFor,
                  (statMode === 'totals' ? dynamicTotalsBenchmarks.avgPointsFor : undefined) || benchmarks.team.avgPointsFor
                );
                const defEval = evaluateVsLeague(
                  t.avgPointsAgainst,
                  (statMode === 'totals' ? dynamicTotalsBenchmarks.avgPointsAgainst : undefined) || benchmarks.team.avgPointsAgainst
                );

                return (
                  <tr
                    key={t.id}
                    onClick={() => onInspectEntity('team', t.id)}
                    className="hover:bg-[#182338] cursor-pointer transition-colors"
                  >
                    <td
                      className="py-2.5 pl-4 pr-2"
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
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <TeamLogo
                          abbr={t.abbreviation}
                          teamId={t.id}
                          logoUrl={t.logoUrl}
                          size="sm"
                          framed
                        />
                        <div>
                          <div className="font-medium text-slate-100 whitespace-nowrap flex items-center gap-1.5">
                            <span>{t.name}</span>
                            {showHeroicBadges && t.buzzerBeaters > 0 && (
                              <span
                                title={`${t.buzzerBeaters} Buzzer Beater(s) oficiales (0.0s)`}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30"
                              >
                                ⚡ {t.buzzerBeaters} BB
                              </span>
                            )}
                            {showHeroicBadges && t.gameWinners > 0 && (
                              <span
                                title={`${t.gameWinners} Game Winner(s) oficiales (≤10s)`}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                              >
                                🎯 {t.gameWinners} GW
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 whitespace-nowrap">
                            {t.abbreviation} · Conf. {t.conference} · Últ.10: {t.lastTenRecord}
                          </div>
                        </div>
                      </div>
                    </td>

                    {experienceMode === 'simple' ? (
                      <>
                        <td
                          className={`py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap ${getHeatmapClass(
                            t.winPct * 100,
                            benchmarks.team.winPct
                          )}`}
                        >
                          <span className="font-semibold text-slate-100">
                            {t.wins}-{t.losses}
                          </span>
                          <span className="ml-1.5 text-xs text-slate-400">
                            ({(t.winPct * 100).toFixed(0)}%)
                          </span>
                        </td>
                        <td
                          className={`py-2.5 px-2.5 text-right whitespace-nowrap ${getHeatmapClass(
                            t.avgPointsFor,
                            (statMode === 'totals' ? dynamicTotalsBenchmarks.avgPointsFor : undefined) || benchmarks.team.avgPointsFor
                          )}`}
                        >
                          <div className="font-mono tabular-nums text-slate-100">
                            {t.avgPointsFor.toFixed(statMode === 'totals' ? 0 : 1)}
                          </div>
                          <div className={`text-[11px] ${offEval.textClass}`}>
                            {offEval.tierLabel}
                          </div>
                        </td>
                        <td
                          className={`py-2.5 px-2.5 text-right whitespace-nowrap ${getHeatmapClass(
                            t.avgPointsAgainst,
                            (statMode === 'totals' ? dynamicTotalsBenchmarks.avgPointsAgainst : undefined) || benchmarks.team.avgPointsAgainst
                          )}`}
                        >
                          <div className="font-mono tabular-nums text-slate-200">
                            {t.avgPointsAgainst.toFixed(statMode === 'totals' ? 0 : 1)}
                          </div>
                          <div className={`text-[11px] ${defEval.textClass}`}>
                            {defEval.tierLabel}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={
                              t.windowDiff >= 0
                                ? 'text-emerald-400 font-semibold'
                                : 'text-rose-400 font-semibold'
                            }
                          >
                            {formatSigned(t.windowDiff, statMode === 'totals' ? 0 : 1)} PTS
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <NbaComparisonBar
                            value={t.netRtg}
                            benchmark={benchmarks.team.netRtg}
                            compact
                          />
                        </td>
                        <td className="py-2.5 pl-2.5 pr-4 text-right text-xs whitespace-nowrap">
                          <span
                            className={
                              t.streakCode.startsWith('W')
                                ? 'text-emerald-400 font-semibold'
                                : 'text-rose-400 font-semibold'
                            }
                          >
                            {humanStreakCode(t.streakCode)}
                          </span>
                          <div className="font-mono tabular-nums text-slate-400">
                            Casa {t.homeRecord}
                          </div>
                        </td>
                      </>
                    ) : (
                      activeLayerColumns.map((col, idx) => {
                        const numVal = col.getNumValue(t);
                        const bench = getColBenchmark(col);
                        return (
                          <td
                            key={col.key}
                            className={`${
                              idx === activeLayerColumns.length - 1
                                ? 'py-2.5 pl-2.5 pr-4'
                                : 'py-2.5 px-2.5'
                            } ${
                              col.align === 'left'
                                ? 'text-left font-sans'
                                : 'text-right font-mono tabular-nums'
                            } whitespace-nowrap ${getHeatmapClass(numVal, bench)} ${getToneTextClass(
                              col,
                              t
                            )}`}
                          >
                            {col.format(t)}
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
