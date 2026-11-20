import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Sliders, Star, Users } from 'lucide-react';
import type {
  ExperienceMode,
  NbaAdvancedCategory,
  NbaClutchEntry,
  NbaDefenseHustleEntry,
  NbaHeroicShotCountSummary,
  NbaHeroicShotsResponse,
  NbaPlaytypeEntitySummary,
  NbaScoringSplitsEntry,
  NbaShotZonesEntry,
  NbaTrackingEntry,
  NbaViolationsEntry,
  PlayerSummary,
  SearchPlayerResult,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import {
  DEFAULT_UNIFIED_FILTERS,
  buildEntityLookupContext,
  matchesPlayerUnifiedFilters,
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
  qualifyRecentDelta,
  qualifyUsageRole,
  type LeagueBenchmarks,
  type MetricBenchmark,
} from '../utils/humanize';
import {
  MetricInfoTooltip,
  NbaComparisonBar,
  SortableTh,
} from './MetricUiHelpers';
import { STICKY_THEAD_CLASS, compareSortValues } from '../utils/tableSort';
import { PlayerAvatar } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import {
  buildTableSnapshotBlob,
  type TableSnapshotCell,
} from '../utils/exportImageCard';
import { LayerColumnCustomizer } from './LayerColumnCustomizer';

interface PlayersExplorerViewProps {
  players: PlayerSummary[];
  teams?: TeamSummary[];
  experienceMode: ExperienceMode;
  benchmarks: LeagueBenchmarks;
  seasonToken?: string;
  onSwitchToAdvanced: () => void;
  totalLeaguePlayersAvailable: number;
  allPlayersLoaded: boolean;
  loadingAllPlayers: boolean;
  onLoadAllPlayers: () => void;
  windowSize: WindowSize;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onAddExternalPlayer: (item: SearchPlayerResult) => Promise<void>;
  addingPlayerId: string | null;
  showHeroicBadges?: boolean;
}

type TableViewMode =
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

interface PlayerLayerDef {
  id: TableViewMode;
  label: string;
  categoryToFetch?: NbaAdvancedCategory;
  defaultSortKey: string;
  defaultCols: string[];
}

interface PlayerColDef {
  key: string;
  label: string;
  helpKey?: string;
  align?: 'left' | 'right';
  isString?: boolean;
  lowerIsBetter?: boolean;
  getValue: (r: EnrichedPlayerRow) => number | string | null;
  format: (r: EnrichedPlayerRow) => string;
  tone?: (r: EnrichedPlayerRow) => 'positive' | 'negative' | 'accent' | 'warning' | 'neutral';
}

type StatScaleMode = 'per_game' | 'totals';

const STORAGE_PLAYER_COLS_KEY = 'radarnba_cols_players_v2';
const STORAGE_PLAYER_STAT_MODE_KEY = 'radarnba_players_stat_mode_v1';

const round2 = (v: number): number => Math.round(v * 100) / 100;

function loadPlayerStatMode(): StatScaleMode {
  try {
    const raw = localStorage.getItem(STORAGE_PLAYER_STAT_MODE_KEY);
    return raw === 'totals' ? 'totals' : 'per_game';
  } catch {
    return 'per_game';
  }
}

const PLAYER_LAYERS: PlayerLayerDef[] = [
  {
    id: 'basic',
    label: '1. Básicas & Caja',
    defaultSortKey: 'ptsBase',
    defaultCols: ['minBase', 'ptsBase', 'ptsWin', 'pctDelta', 'rebBase', 'orebBase', 'astBase', 'stocksBase', 'fgPct', 'plusMinusBase'],
  },
  {
    id: 'advanced',
    label: '2. Avanzadas e Impacto',
    categoryToFetch: 'four_factors',
    defaultSortKey: 'pie',
    defaultCols: ['minBase', 'usgPct', 'usgWin', 'tsPct', 'efgPct', 'offRtg', 'defRtg', 'netRtg', 'pie', 'gmSc'],
  },
  {
    id: 'scoring',
    label: '3. Tiro y Scoring Splits',
    categoryToFetch: 'scoring',
    defaultSortKey: 'pctPtsPaint',
    defaultCols: ['pctFga2pt', 'pctFga3pt', 'pctPts2pt', 'pctPts2ptMr', 'pctPts3pt', 'pctPtsFb', 'pctPtsFt', 'pctPtsOffTov', 'pctPtsPaint', 'pctAstFgm', 'pctUastFgm'],
  },
  {
    id: 'zones',
    label: '4. Zonas de Tiro (Shot Zones)',
    categoryToFetch: 'zones',
    defaultSortKey: 'raFgaTot',
    defaultCols: ['raFgm', 'raFga', 'raFgmTot', 'raFgaTot', 'raFgPct', 'paintNonRaFga', 'paintNonRaFgPct', 'midFga', 'midFgPct', 'corner3Fga', 'corner3FgPct', 'ab3Fga', 'ab3FgPct', 'totalThreeFgaTot', 'threeFgPct'],
  },
  {
    id: 'tracking',
    label: '5. Tracking Óptico',
    categoryToFetch: 'tracking',
    defaultSortKey: 'drives',
    defaultCols: ['drives', 'drivePts', 'driveFgPct', 'catchShootPts', 'catchShootFg3Pct', 'pullUpPts', 'pullUpFg3Pct', 'potentialAst', 'astPtsCreated', 'touches', 'timeOfPoss', 'distMiles', 'rebChances'],
  },
  {
    id: 'hustle',
    label: '6. Hustle y Pintura',
    categoryToFetch: 'defense_hustle',
    defaultSortKey: 'ptsPaint',
    defaultCols: ['ptsPaint', 'pts2ndChance', 'ptsFastBreak', 'ptsOffTov', 'contestedShots', 'deflections', 'chargesDrawn', 'screenAssists', 'screenAstPts', 'looseBalls', 'boxOuts'],
  },
  {
    id: 'defense',
    label: '7. Defensa y DFG%',
    categoryToFetch: 'defense_hustle',
    defaultSortKey: 'dFga',
    defaultCols: ['defRating', 'defWs', 'drebPct', 'pctStl', 'pctBlk', 'dFgm', 'dFga', 'dFgPct', 'normalFgPct', 'pctPlusMinus', 'defFreq', 'oppPtsPaint'],
  },
  {
    id: 'clutch',
    label: '8. Clutch (<5m, ±5)',
    categoryToFetch: 'clutch',
    defaultSortKey: 'clPts',
    defaultCols: ['clGp', 'clW', 'clWPct', 'clMin', 'clPts', 'clFgPct', 'clFg3Pct', 'clFtPct', 'clNetRtg', 'clTsPct', 'clUsgPct', 'clPlusMinus', 'buzzerBeaters', 'gameWinners'],
  },
  {
    id: 'playtypes',
    label: '9. Playtypes (Synergy)',
    categoryToFetch: 'playtypes',
    defaultSortKey: 'ptTotalPoss',
    defaultCols: ['ptTotalPoss', 'ptTopLabel', 'ptTopPpp', 'ptSpotupPpp', 'ptPrbhPpp', 'ptTransPpp', 'ptIsoPpp', 'ptPrrPpp', 'ptCutPpp', 'ptPostPpp', 'ptHandoffPpp'],
  },
  {
    id: 'violations',
    label: '10. Infracciones y Faltas',
    categoryToFetch: 'violations',
    defaultSortKey: 'totalViolations',
    defaultCols: ['totalViolations', 'pfBase', 'pfdBase', 'blkaBase', 'tovBase', 'travel', 'doubleDribble', 'offFoul', 'chargeViol', 'kickedBall', 'dd2', 'td3', 'fantasyPts'],
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

function findPtPpp(summary: NbaPlaytypeEntitySummary | undefined, playTypeKey: string, group: 'offensive' | 'defensive' = 'offensive'): number | null {
  if (!summary) return null;
  const arr = group === 'offensive' ? summary.offensive : summary.defensive;
  const row = arr?.find((x) => matchPlayType(x.playType, playTypeKey));
  return row ? row.ppp : null;
}

function findPtPct(summary: NbaPlaytypeEntitySummary | undefined, playTypeKey: string): number | null {
  if (!summary) return null;
  const row = summary.offensive?.find((x) => matchPlayType(x.playType, playTypeKey));
  return row ? row.possPct : null;
}

interface EnrichedPlayerRow extends PlayerSummary {
  statMode: StatScaleMode;
  minBase: number;
  ptsBase: number;
  ptsWin: number;
  pctDelta: number;
  rebBase: number;
  orebBase: number;
  drebBase: number;
  astBase: number;
  stlBase: number;
  blkBase: number;
  stocksBase: number;
  tovBase: number;
  pfBase: number;
  pfdBase: number;
  blkaBase: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
  dd2: number;
  td3: number;
  fantasyPts: number;
  plusMinusBase: number;
  usgPct: number;
  usgWin: number;
  tsPct: number;
  efgPct: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pie: number;
  gmSc: number;
  pace: number;
  astPct: number;
  astRatio: number;
  astTo: number;
  orebPct: number;
  drebPct: number;
  rebPct: number;
  tovPct: number;
  ptsPaint: number;
  pts2ndChance: number;
  ptsFastBreak: number;
  ptsOffTov: number;
  contestedShots: number;
  contestedShots2pt: number;
  contestedShots3pt: number;
  deflections: number;
  chargesDrawn: number;
  screenAssists: number;
  screenAstPts: number;
  looseBalls: number;
  offLooseBalls: number;
  defLooseBalls: number;
  boxOuts: number;
  offBoxOuts: number;
  defBoxOuts: number;
  boxOutTeamRebs: number;
  boxOutPlayerRebs: number;
  foulsDrawn: number;
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

const PLAYER_COLUMNS_BY_LAYER: Record<TableViewMode, PlayerColDef[]> = {
  basic: [
    { key: 'minBase', label: 'MIN', helpKey: 'minBase', getValue: (r) => r.minBase, format: (r) => r.minBase.toFixed(1) },
    { key: 'ptsBase', label: 'PTS Base', helpKey: 'ptsBase', getValue: (r) => r.ptsBase, format: (r) => r.ptsBase.toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'ptsWin', label: 'PTS Rec.', helpKey: 'ptsWin', getValue: (r) => r.ptsWin, format: (r) => r.ptsWin.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'pctDelta', label: 'Delta %', helpKey: 'pctDelta', getValue: (r) => r.pctDelta, format: (r) => `${r.pctDelta > 2 ? '▲ ' : r.pctDelta < -2 ? '▼ ' : ''}${formatSigned(r.pctDelta, 1, '%')}`, tone: (r) => (r.pctDelta >= 4 ? 'positive' : r.pctDelta <= -4 ? 'negative' : 'neutral') },
    { key: 'rebBase', label: 'REB', helpKey: 'rebBase', getValue: (r) => r.rebBase, format: (r) => r.rebBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'orebBase', label: 'OR', helpKey: 'orebBase', getValue: (r) => r.orebBase, format: (r) => r.orebBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'drebBase', label: 'DR', helpKey: 'drebBase', getValue: (r) => r.drebBase, format: (r) => r.drebBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'astBase', label: 'AST', helpKey: 'astBase', getValue: (r) => r.astBase, format: (r) => r.astBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'stlBase', label: 'ROB', helpKey: 'steals', getValue: (r) => r.stlBase, format: (r) => r.stlBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'blkBase', label: 'TAP', helpKey: 'blocks', getValue: (r) => r.blkBase, format: (r) => r.blkBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'stocksBase', label: 'STK', helpKey: 'stocksBase', getValue: (r) => r.stocksBase, format: (r) => r.stocksBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'tovBase', label: 'PER', helpKey: 'tov', lowerIsBetter: true, getValue: (r) => r.tovBase, format: (r) => r.tovBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'fgPct', label: 'TC%', helpKey: 'fgPct', getValue: (r) => r.fgPct, format: (r) => `${r.fgPct.toFixed(1)}%` },
    { key: 'fg3Pct', label: '3P%', helpKey: 'fg3Pct', getValue: (r) => r.fg3Pct, format: (r) => `${r.fg3Pct.toFixed(1)}%` },
    { key: 'ftPct', label: 'TL%', helpKey: 'ftPct', getValue: (r) => r.ftPct, format: (r) => `${r.ftPct.toFixed(1)}%` },
    { key: 'pfBase', label: 'FP', helpKey: 'personalFouls', lowerIsBetter: true, getValue: (r) => r.pfBase, format: (r) => r.pfBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'pfdBase', label: 'PFD', helpKey: 'foulsDrawn', getValue: (r) => r.pfdBase, format: (r) => r.pfdBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'blkaBase', label: 'TAP Rec.', helpKey: 'blka', lowerIsBetter: true, getValue: (r) => r.blkaBase, format: (r) => r.blkaBase.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'dd2', label: 'DD2', helpKey: 'doubleDoubles', getValue: (r) => r.dd2, format: (r) => `${r.dd2}` },
    { key: 'td3', label: 'TD3', helpKey: 'tripleDoubles', getValue: (r) => r.td3, format: (r) => `${r.td3}` },
    { key: 'fantasyPts', label: 'NBA FPTS', helpKey: 'nbaFantasyPts', getValue: (r) => r.fantasyPts, format: (r) => r.fantasyPts.toFixed(1) },
    { key: 'plusMinusBase', label: '+/-', helpKey: 'plusMinusBase', getValue: (r) => r.plusMinusBase, format: (r) => formatSigned(r.plusMinusBase, r.statMode === 'totals' ? 0 : 1), tone: (r) => (r.plusMinusBase > 0.2 ? 'positive' : r.plusMinusBase < -0.2 ? 'negative' : 'neutral') },
  ],
  advanced: [
    { key: 'minBase', label: 'MIN', helpKey: 'minBase', getValue: (r) => r.minBase, format: (r) => r.minBase.toFixed(1) },
    { key: 'usgPct', label: 'USG% Base', helpKey: 'usgPct', getValue: (r) => r.usgPct, format: (r) => `${r.usgPct.toFixed(1)}%` },
    { key: 'usgWin', label: 'USG Rec.', helpKey: 'usgWin', getValue: (r) => r.usgWin, format: (r) => `${r.usgWin.toFixed(1)}%`, tone: () => 'accent' },
    { key: 'tsPct', label: 'TS%', helpKey: 'tsPct', getValue: (r) => r.tsPct, format: (r) => `${r.tsPct.toFixed(1)}%`, tone: (r) => (r.tsPct >= 60 ? 'positive' : r.tsPct < 53 ? 'warning' : 'neutral') },
    { key: 'efgPct', label: 'eFG%', helpKey: 'efgPct', getValue: (r) => r.efgPct, format: (r) => `${r.efgPct.toFixed(1)}%` },
    { key: 'offRtg', label: 'OffRtg', helpKey: 'offRtg', getValue: (r) => r.offRtg, format: (r) => (r.offRtg > 0 ? r.offRtg.toFixed(1) : '—') },
    { key: 'defRtg', label: 'DefRtg', helpKey: 'defRtg', lowerIsBetter: true, getValue: (r) => r.defRtg, format: (r) => (r.defRtg > 0 ? r.defRtg.toFixed(1) : '—') },
    { key: 'netRtg', label: 'NetRtg', helpKey: 'netRtg', getValue: (r) => r.netRtg, format: (r) => formatSigned(r.netRtg, 1), tone: (r) => (r.netRtg > 0.2 ? 'positive' : r.netRtg < -0.2 ? 'negative' : 'neutral') },
    { key: 'pie', label: 'PIE%', helpKey: 'pie', getValue: (r) => r.pie, format: (r) => (r.pie > 0 ? `${r.pie.toFixed(1)}%` : '—'), tone: () => 'accent' },
    { key: 'gmSc', label: 'GmSc', helpKey: 'gmSc', getValue: (r) => r.gmSc, format: (r) => r.gmSc.toFixed(1) },
    { key: 'pace', label: 'Pace', helpKey: 'paceSimple', getValue: (r) => r.pace, format: (r) => (r.pace > 0 ? r.pace.toFixed(1) : '—') },
    { key: 'astPct', label: 'AST%', helpKey: 'astPct', getValue: (r) => r.astPct, format: (r) => (r.astPct > 0 ? `${r.astPct.toFixed(1)}%` : '—') },
    { key: 'astRatio', label: 'AST Ratio', helpKey: 'astRatio', getValue: (r) => r.astRatio, format: (r) => (r.astRatio > 0 ? r.astRatio.toFixed(1) : '—') },
    { key: 'astTo', label: 'AST/PER', helpKey: 'astTo', getValue: (r) => r.astTo, format: (r) => r.astTo.toFixed(2) },
    { key: 'orebPct', label: 'OREB%', helpKey: 'orebPct', getValue: (r) => r.orebPct, format: (r) => (r.orebPct > 0 ? `${r.orebPct.toFixed(1)}%` : '—') },
    { key: 'drebPct', label: 'DREB%', helpKey: 'drebPct', getValue: (r) => r.drebPct, format: (r) => (r.drebPct > 0 ? `${r.drebPct.toFixed(1)}%` : '—') },
    { key: 'rebPct', label: 'REB%', helpKey: 'rebPct', getValue: (r) => r.rebPct, format: (r) => (r.rebPct > 0 ? `${r.rebPct.toFixed(1)}%` : '—') },
    { key: 'tovPct', label: 'TOV%', helpKey: 'tovPct', lowerIsBetter: true, getValue: (r) => r.tovPct, format: (r) => (r.tovPct > 0 ? `${r.tovPct.toFixed(1)}%` : '—') },
  ],
  scoring: [
    { key: 'pctFga2pt', label: '%FGA 2P', helpKey: 'pctFga2pt', getValue: (r) => numOrNull(r.advScoring?.pctFga2pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctFga2pt), 1, '%') },
    { key: 'pctFga3pt', label: '%FGA 3P', helpKey: 'pctFga3pt', getValue: (r) => numOrNull(r.advScoring?.pctFga3pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctFga3pt), 1, '%') },
    { key: 'pctPts2pt', label: '%PTS 2P', helpKey: 'pctPts2pt', getValue: (r) => numOrNull(r.advScoring?.pctPts2pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPts2pt), 1, '%') },
    { key: 'pctPts2ptMr', label: '%PTS MidRange', helpKey: 'pctPts2ptMr', getValue: (r) => numOrNull(r.advScoring?.pctPts2ptMr), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPts2ptMr), 1, '%') },
    { key: 'pctPts3pt', label: '%PTS 3P', helpKey: 'pctPts3pt', getValue: (r) => numOrNull(r.advScoring?.pctPts3pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPts3pt), 1, '%'), tone: () => 'accent' },
    { key: 'pctPtsFb', label: '%PTS Contraat.', helpKey: 'pctPtsFb', getValue: (r) => numOrNull(r.advScoring?.pctPtsFb), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsFb), 1, '%') },
    { key: 'pctPtsFt', label: '%PTS Libres', helpKey: 'pctPtsFt', getValue: (r) => numOrNull(r.advScoring?.pctPtsFt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsFt), 1, '%') },
    { key: 'pctPtsOffTov', label: '%PTS x Pérd.', helpKey: 'pctPtsOffTov', getValue: (r) => numOrNull(r.advScoring?.pctPtsOffTov), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsOffTov), 1, '%') },
    { key: 'pctPtsPaint', label: '%PTS Pintura', helpKey: 'pctPtsPaint', getValue: (r) => numOrNull(r.advScoring?.pctPtsPaint), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsPaint), 1, '%'), tone: () => 'positive' },
    { key: 'pctAst2pm', label: '%AST 2PM', helpKey: 'pctAstFgm', getValue: (r) => numOrNull(r.advScoring?.pctAst2pm), format: (r) => fmtNum(numOrNull(r.advScoring?.pctAst2pm), 1, '%') },
    { key: 'pctUast2pm', label: '%UAST 2PM', helpKey: 'pctUastFgm', getValue: (r) => numOrNull(r.advScoring?.pctUast2pm), format: (r) => fmtNum(numOrNull(r.advScoring?.pctUast2pm), 1, '%') },
    { key: 'pctAst3pm', label: '%AST 3PM', helpKey: 'pctAstFgm', getValue: (r) => numOrNull(r.advScoring?.pctAst3pm), format: (r) => fmtNum(numOrNull(r.advScoring?.pctAst3pm), 1, '%') },
    { key: 'pctUast3pm', label: '%UAST 3PM', helpKey: 'pctUastFgm', getValue: (r) => numOrNull(r.advScoring?.pctUast3pm), format: (r) => fmtNum(numOrNull(r.advScoring?.pctUast3pm), 1, '%') },
    { key: 'pctAstFgm', label: '%AST FGM', helpKey: 'pctAstFgm', getValue: (r) => numOrNull(r.advScoring?.pctAstFgm), format: (r) => fmtNum(numOrNull(r.advScoring?.pctAstFgm), 1, '%') },
    { key: 'pctUastFgm', label: '%UAST FGM', helpKey: 'pctUastFgm', getValue: (r) => numOrNull(r.advScoring?.pctUastFgm), format: (r) => fmtNum(numOrNull(r.advScoring?.pctUastFgm), 1, '%') },
  ],
  zones: [
    { key: 'raFgm', label: 'Aro FGM/PJ', helpKey: 'restrictedArea', getValue: (r) => numOrNull(r.advZones?.restrictedArea?.fgm), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fgm), r.statMode === 'totals' ? 0 : 1) },
    { key: 'raFga', label: 'Aro FGA/PJ', helpKey: 'restrictedArea', getValue: (r) => numOrNull(r.advZones?.restrictedArea?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'raFgmTot', label: 'Aro FGM Tot', helpKey: 'restrictedArea', getValue: (r) => numOrNull(r.advZones?.restrictedArea?.fgmTotal), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fgmTotal), 0) },
    { key: 'raFgaTot', label: 'Aro FGA Tot', helpKey: 'restrictedArea', getValue: (r) => numOrNull(r.advZones?.restrictedArea?.fgaTotal), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fgaTotal), 0) },
    { key: 'raFgPct', label: 'Aro FG%', helpKey: 'restrictedArea', getValue: (r) => numOrNull(r.advZones?.restrictedArea?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fgPct), 1, '%'), tone: (r) => ((r.advZones?.restrictedArea?.fgPct ?? 0) >= 68 ? 'positive' : 'neutral') },
    { key: 'totalRimFga', label: 'Vol. Aro/PJ', helpKey: 'restrictedArea', getValue: (r) => numOrNull(r.advZones?.totalRimFga), format: (r) => fmtNum(numOrNull(r.advZones?.totalRimFga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'rimFgPct', label: 'Aro+Pintura FG%', helpKey: 'restrictedArea', getValue: (r) => numOrNull(r.advZones?.rimFgPct), format: (r) => fmtNum(numOrNull(r.advZones?.rimFgPct), 1, '%') },
    { key: 'paintNonRaFgm', label: 'Pint.(NoRA) FGM/PJ', helpKey: 'ptsPaint', getValue: (r) => numOrNull(r.advZones?.paintNonRa?.fgm), format: (r) => fmtNum(numOrNull(r.advZones?.paintNonRa?.fgm), r.statMode === 'totals' ? 0 : 1) },
    { key: 'paintNonRaFga', label: 'Pint.(NoRA) FGA/PJ', helpKey: 'ptsPaint', getValue: (r) => numOrNull(r.advZones?.paintNonRa?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.paintNonRa?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'paintNonRaFgaTot', label: 'Pint. FGA Tot', helpKey: 'ptsPaint', getValue: (r) => numOrNull(r.advZones?.paintNonRa?.fgaTotal), format: (r) => fmtNum(numOrNull(r.advZones?.paintNonRa?.fgaTotal), 0) },
    { key: 'paintNonRaFgPct', label: 'Pint.(NoRA) %', helpKey: 'ptsPaint', getValue: (r) => numOrNull(r.advZones?.paintNonRa?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.paintNonRa?.fgPct), 1, '%') },
    { key: 'midFgm', label: 'Mid FGM/PJ', helpKey: 'pctPts2ptMr', getValue: (r) => numOrNull(r.advZones?.midRange?.fgm), format: (r) => fmtNum(numOrNull(r.advZones?.midRange?.fgm), r.statMode === 'totals' ? 0 : 1) },
    { key: 'midFga', label: 'Mid FGA/PJ', helpKey: 'pctPts2ptMr', getValue: (r) => numOrNull(r.advZones?.midRange?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.midRange?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'midFgaTot', label: 'Mid FGA Tot', helpKey: 'pctPts2ptMr', getValue: (r) => numOrNull(r.advZones?.midRange?.fgaTotal), format: (r) => fmtNum(numOrNull(r.advZones?.midRange?.fgaTotal), 0) },
    { key: 'midFgPct', label: 'Mid FG%', helpKey: 'pctPts2ptMr', getValue: (r) => numOrNull(r.advZones?.midRange?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.midRange?.fgPct), 1, '%') },
    { key: 'corner3Fga', label: 'Esq.3 FGA/PJ', helpKey: 'corner3', getValue: (r) => numOrNull(r.advZones?.corner3?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.corner3?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'corner3FgaTot', label: 'Esq.3 FGA Tot', helpKey: 'corner3', getValue: (r) => numOrNull(r.advZones?.corner3?.fgaTotal), format: (r) => fmtNum(numOrNull(r.advZones?.corner3?.fgaTotal), 0) },
    { key: 'corner3FgPct', label: 'Esq.3 %', helpKey: 'corner3', getValue: (r) => numOrNull(r.advZones?.corner3?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.corner3?.fgPct), 1, '%'), tone: () => 'accent' },
    { key: 'lc3Fga', label: 'Esq.Izq FGA/PJ', helpKey: 'corner3', getValue: (r) => numOrNull(r.advZones?.leftCorner3?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.leftCorner3?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'lc3FgPct', label: 'Esq.Izq 3%', helpKey: 'corner3', getValue: (r) => numOrNull(r.advZones?.leftCorner3?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.leftCorner3?.fgPct), 1, '%') },
    { key: 'rc3Fga', label: 'Esq.Der FGA/PJ', helpKey: 'corner3', getValue: (r) => numOrNull(r.advZones?.rightCorner3?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.rightCorner3?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'rc3FgPct', label: 'Esq.Der 3%', helpKey: 'corner3', getValue: (r) => numOrNull(r.advZones?.rightCorner3?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.rightCorner3?.fgPct), 1, '%') },
    { key: 'ab3Fga', label: 'Cab.3 FGA/PJ', helpKey: 'corner3', getValue: (r) => numOrNull(r.advZones?.aboveBreak3?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.aboveBreak3?.fga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'ab3FgaTot', label: 'Cab.3 FGA Tot', helpKey: 'corner3', getValue: (r) => numOrNull(r.advZones?.aboveBreak3?.fgaTotal), format: (r) => fmtNum(numOrNull(r.advZones?.aboveBreak3?.fgaTotal), 0) },
    { key: 'ab3FgPct', label: 'Cabecera 3%', helpKey: 'corner3', getValue: (r) => numOrNull(r.advZones?.aboveBreak3?.fgPct), format: (r) => fmtNum(numOrNull(r.advZones?.aboveBreak3?.fgPct), 1, '%') },
    { key: 'totalThreeFga', label: 'Total 3PA/PJ', helpKey: 'fg3a', getValue: (r) => numOrNull(r.advZones?.totalThreeFga), format: (r) => fmtNum(numOrNull(r.advZones?.totalThreeFga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'totalThreeFgaTot', label: 'Total 3PA Tot', helpKey: 'fg3a', getValue: (r) => numOrNull(r.advZones?.totalThreeFgaTotal), format: (r) => fmtNum(numOrNull(r.advZones?.totalThreeFgaTotal), 0) },
    { key: 'threeFgPct', label: 'Total 3P%', helpKey: 'fg3Pct', getValue: (r) => numOrNull(r.advZones?.threeFgPct), format: (r) => fmtNum(numOrNull(r.advZones?.threeFgPct), 1, '%') },
  ],
  tracking: [
    { key: 'drives', label: 'Drives', helpKey: 'drives', getValue: (r) => numOrNull(r.advTracking?.drives), format: (r) => fmtNum(numOrNull(r.advTracking?.drives), r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'driveFgm', label: 'Drive FGM', helpKey: 'drives', getValue: (r) => numOrNull(r.advTracking?.driveFgm), format: (r) => fmtNum(numOrNull(r.advTracking?.driveFgm), r.statMode === 'totals' ? 0 : 1) },
    { key: 'driveFga', label: 'Drive FGA', helpKey: 'drives', getValue: (r) => numOrNull(r.advTracking?.driveFga), format: (r) => fmtNum(numOrNull(r.advTracking?.driveFga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'drivePts', label: 'Drive PTS', helpKey: 'drives', getValue: (r) => numOrNull(r.advTracking?.drivePts), format: (r) => fmtNum(numOrNull(r.advTracking?.drivePts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'driveFgPct', label: 'Drive FG%', helpKey: 'drives', getValue: (r) => numOrNull(r.advTracking?.driveFgPct), format: (r) => fmtNum(numOrNull(r.advTracking?.driveFgPct), 1, '%') },
    { key: 'driveAstPct', label: 'Drive AST%', helpKey: 'drives', getValue: (r) => numOrNull(r.advTracking?.driveAstPct), format: (r) => fmtNum(numOrNull(r.advTracking?.driveAstPct), 1, '%') },
    { key: 'driveTovPct', label: 'Drive TOV%', helpKey: 'drives', lowerIsBetter: true, getValue: (r) => numOrNull(r.advTracking?.driveTovPct), format: (r) => fmtNum(numOrNull(r.advTracking?.driveTovPct), 1, '%') },
    { key: 'drivePassesPct', label: 'Drive Pase%', helpKey: 'drives', getValue: (r) => numOrNull(r.advTracking?.drivePassesPct), format: (r) => fmtNum(numOrNull(r.advTracking?.drivePassesPct), 1, '%') },
    { key: 'catchShootPts', label: 'C&S PTS', helpKey: 'catchShoot', getValue: (r) => numOrNull(r.advTracking?.catchShootPts), format: (r) => fmtNum(numOrNull(r.advTracking?.catchShootPts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'catchShootFg3Pct', label: 'C&S 3P%', helpKey: 'catchShoot', getValue: (r) => numOrNull(r.advTracking?.catchShootFg3Pct), format: (r) => fmtNum(numOrNull(r.advTracking?.catchShootFg3Pct), 1, '%'), tone: () => 'positive' },
    { key: 'catchShootEfgPct', label: 'C&S eFG%', helpKey: 'catchShoot', getValue: (r) => numOrNull(r.advTracking?.catchShootEfgPct), format: (r) => fmtNum(numOrNull(r.advTracking?.catchShootEfgPct), 1, '%') },
    { key: 'pullUpPts', label: 'PullUp PTS', helpKey: 'pullUp', getValue: (r) => numOrNull(r.advTracking?.pullUpPts), format: (r) => fmtNum(numOrNull(r.advTracking?.pullUpPts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'pullUpFg3Pct', label: 'PullUp 3P%', helpKey: 'pullUp', getValue: (r) => numOrNull(r.advTracking?.pullUpFg3Pct), format: (r) => fmtNum(numOrNull(r.advTracking?.pullUpFg3Pct), 1, '%') },
    { key: 'pullUpEfgPct', label: 'PullUp eFG%', helpKey: 'pullUp', getValue: (r) => numOrNull(r.advTracking?.pullUpEfgPct), format: (r) => fmtNum(numOrNull(r.advTracking?.pullUpEfgPct), 1, '%') },
    { key: 'passesMade', label: 'Pases Dados', helpKey: 'potentialAst', getValue: (r) => numOrNull(r.advTracking?.passesMade), format: (r) => fmtNum(numOrNull(r.advTracking?.passesMade), r.statMode === 'totals' ? 0 : 1) },
    { key: 'passesReceived', label: 'Pases Rec.', helpKey: 'potentialAst', getValue: (r) => numOrNull(r.advTracking?.passesReceived), format: (r) => fmtNum(numOrNull(r.advTracking?.passesReceived), r.statMode === 'totals' ? 0 : 1) },
    { key: 'secondaryAst', label: 'Ast. Sec.', helpKey: 'potentialAst', getValue: (r) => numOrNull(r.advTracking?.secondaryAst), format: (r) => fmtNum(numOrNull(r.advTracking?.secondaryAst), r.statMode === 'totals' ? 0 : 1) },
    { key: 'potentialAst', label: 'Ast. Potenc.', helpKey: 'potentialAst', getValue: (r) => numOrNull(r.advTracking?.potentialAst), format: (r) => fmtNum(numOrNull(r.advTracking?.potentialAst), r.statMode === 'totals' ? 0 : 1) },
    { key: 'astPtsCreated', label: 'PTS x Pase', helpKey: 'potentialAst', getValue: (r) => numOrNull(r.advTracking?.astPtsCreated), format: (r) => fmtNum(numOrNull(r.advTracking?.astPtsCreated), r.statMode === 'totals' ? 0 : 1) },
    { key: 'astToPassPctAdj', label: 'AST/Pase Aj.%', helpKey: 'potentialAst', getValue: (r) => numOrNull(r.advTracking?.astToPassPctAdj), format: (r) => fmtNum(numOrNull(r.advTracking?.astToPassPctAdj), 1, '%') },
    { key: 'touches', label: 'Toques/PJ', helpKey: 'touches', getValue: (r) => numOrNull(r.advTracking?.touches), format: (r) => fmtNum(numOrNull(r.advTracking?.touches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'frontCtTouches', label: 'Toq. Camp.At.', helpKey: 'touches', getValue: (r) => numOrNull(r.advTracking?.frontCtTouches), format: (r) => fmtNum(numOrNull(r.advTracking?.frontCtTouches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'timeOfPoss', label: 'T. Posesión(m)', helpKey: 'timeOfPoss', getValue: (r) => numOrNull(r.advTracking?.timeOfPoss), format: (r) => fmtNum(numOrNull(r.advTracking?.timeOfPoss), 1) },
    { key: 'avgSecPerTouch', label: 'Seg/Toque', helpKey: 'touches', getValue: (r) => numOrNull(r.advTracking?.avgSecPerTouch), format: (r) => fmtNum(numOrNull(r.advTracking?.avgSecPerTouch), 2) },
    { key: 'avgDribPerTouch', label: 'Botes/Toque', helpKey: 'touches', getValue: (r) => numOrNull(r.advTracking?.avgDribPerTouch), format: (r) => fmtNum(numOrNull(r.advTracking?.avgDribPerTouch), 2) },
    { key: 'ptsPerTouch', label: 'PTS/Toque', helpKey: 'touches', getValue: (r) => numOrNull(r.advTracking?.ptsPerTouch), format: (r) => fmtNum(numOrNull(r.advTracking?.ptsPerTouch), 3) },
    { key: 'elbowTouches', label: 'Toq. Codo', helpKey: 'touches', getValue: (r) => numOrNull(r.advTracking?.elbowTouches), format: (r) => fmtNum(numOrNull(r.advTracking?.elbowTouches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'postTouches', label: 'Toq. Poste', helpKey: 'touches', getValue: (r) => numOrNull(r.advTracking?.postTouches), format: (r) => fmtNum(numOrNull(r.advTracking?.postTouches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'paintTouches', label: 'Toq. Pintura', helpKey: 'touches', getValue: (r) => numOrNull(r.advTracking?.paintTouches), format: (r) => fmtNum(numOrNull(r.advTracking?.paintTouches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'distMiles', label: 'Dist. (mi)', helpKey: 'distMiles', getValue: (r) => numOrNull(r.advTracking?.distMiles), format: (r) => fmtNum(numOrNull(r.advTracking?.distMiles), r.statMode === 'totals' ? 1 : 2) },
    { key: 'distMilesOff', label: 'Dist. Of. (mi)', helpKey: 'distMiles', getValue: (r) => numOrNull(r.advTracking?.distMilesOff), format: (r) => fmtNum(numOrNull(r.advTracking?.distMilesOff), r.statMode === 'totals' ? 1 : 2) },
    { key: 'distMilesDef', label: 'Dist. Def. (mi)', helpKey: 'distMiles', getValue: (r) => numOrNull(r.advTracking?.distMilesDef), format: (r) => fmtNum(numOrNull(r.advTracking?.distMilesDef), r.statMode === 'totals' ? 1 : 2) },
    { key: 'avgSpeed', label: 'Vel. (mph)', helpKey: 'avgSpeed', getValue: (r) => numOrNull(r.advTracking?.avgSpeed), format: (r) => fmtNum(numOrNull(r.advTracking?.avgSpeed), 2) },
    { key: 'avgSpeedOff', label: 'Vel. Of. (mph)', helpKey: 'avgSpeed', getValue: (r) => numOrNull(r.advTracking?.avgSpeedOff), format: (r) => fmtNum(numOrNull(r.advTracking?.avgSpeedOff), 2) },
    { key: 'avgSpeedDef', label: 'Vel. Def. (mph)', helpKey: 'avgSpeed', getValue: (r) => numOrNull(r.advTracking?.avgSpeedDef), format: (r) => fmtNum(numOrNull(r.advTracking?.avgSpeedDef), 2) },
    { key: 'rebChances', label: 'Oport. Reb', helpKey: 'rebChances', getValue: (r) => numOrNull(r.advTracking?.rebChances), format: (r) => fmtNum(numOrNull(r.advTracking?.rebChances), r.statMode === 'totals' ? 0 : 1) },
    { key: 'rebChancePctAdj', label: 'Reb Aj.%', helpKey: 'rebChances', getValue: (r) => numOrNull(r.advTracking?.rebChancePctAdj), format: (r) => fmtNum(numOrNull(r.advTracking?.rebChancePctAdj), 1, '%') },
    { key: 'avgRebDist', label: 'Dist. Reb (ft)', helpKey: 'rebChances', getValue: (r) => numOrNull(r.advTracking?.avgRebDist), format: (r) => fmtNum(numOrNull(r.advTracking?.avgRebDist), 1) },
    { key: 'orebContestPct', label: '%OR Cont.', helpKey: 'rebChances', getValue: (r) => numOrNull(r.advTracking?.orebContestPct), format: (r) => fmtNum(numOrNull(r.advTracking?.orebContestPct), 1, '%') },
    { key: 'drebContestPct', label: '%DR Cont.', helpKey: 'rebChances', getValue: (r) => numOrNull(r.advTracking?.drebContestPct), format: (r) => fmtNum(numOrNull(r.advTracking?.drebContestPct), 1, '%') },
  ],
  hustle: [
    { key: 'ptsPaint', label: 'PTS Pintura', helpKey: 'ptsPaint', getValue: (r) => r.advDefHustle?.ptsPaint ?? r.ptsPaint, format: (r) => (r.advDefHustle?.ptsPaint ?? r.ptsPaint).toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'pts2ndChance', label: '2ª Jugada', helpKey: 'pts2ndChance', getValue: (r) => r.advDefHustle?.pts2ndChance ?? r.pts2ndChance, format: (r) => (r.advDefHustle?.pts2ndChance ?? r.pts2ndChance).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'ptsFastBreak', label: 'Contraat.', helpKey: 'ptsFastBreak', getValue: (r) => r.advDefHustle?.ptsFb ?? r.ptsFastBreak, format: (r) => (r.advDefHustle?.ptsFb ?? r.ptsFastBreak).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'ptsOffTov', label: 'PTS x Pérd.', helpKey: 'ptsOffTov', getValue: (r) => r.advDefHustle?.ptsOffTov ?? r.ptsOffTov, format: (r) => (r.advDefHustle?.ptsOffTov ?? r.ptsOffTov).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'contestedShots', label: 'Punteados Tot', helpKey: 'contestedShots', getValue: (r) => r.advDefHustle?.contestedShots ?? r.contestedShots, format: (r) => (r.advDefHustle?.contestedShots ?? r.contestedShots).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'contestedShots2pt', label: 'Punt. 2P', helpKey: 'contestedShots', getValue: (r) => r.advDefHustle?.contestedShots2pt ?? r.contestedShots2pt, format: (r) => (r.advDefHustle?.contestedShots2pt ?? r.contestedShots2pt).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'contestedShots3pt', label: 'Punt. 3P', helpKey: 'contestedShots', getValue: (r) => r.advDefHustle?.contestedShots3pt ?? r.contestedShots3pt, format: (r) => (r.advDefHustle?.contestedShots3pt ?? r.contestedShots3pt).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'deflections', label: 'Desvíos', helpKey: 'deflections', getValue: (r) => r.advDefHustle?.deflections ?? r.deflections, format: (r) => (r.advDefHustle?.deflections ?? r.deflections).toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'positive' },
    { key: 'chargesDrawn', label: 'Cargas Prov.', helpKey: 'chargesDrawn', getValue: (r) => r.advDefHustle?.chargesDrawn ?? r.chargesDrawn, format: (r) => (r.advDefHustle?.chargesDrawn ?? r.chargesDrawn).toFixed(r.statMode === 'totals' ? 0 : 2) },
    { key: 'screenAssists', label: 'Screen AST', helpKey: 'screenAssists', getValue: (r) => r.advDefHustle?.screenAssists ?? r.screenAssists, format: (r) => (r.advDefHustle?.screenAssists ?? r.screenAssists).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'screenAstPts', label: 'Scr. AST PTS', helpKey: 'screenAstPts', getValue: (r) => r.advDefHustle?.screenAstPts ?? r.screenAstPts, format: (r) => (r.advDefHustle?.screenAstPts ?? r.screenAstPts).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'looseBalls', label: 'Bal. Sueltos', helpKey: 'looseBalls', getValue: (r) => r.advDefHustle?.looseBalls ?? r.looseBalls, format: (r) => (r.advDefHustle?.looseBalls ?? r.looseBalls).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'offLooseBalls', label: 'Sueltos Of.', helpKey: 'looseBalls', getValue: (r) => r.advDefHustle?.offLooseBalls ?? r.offLooseBalls, format: (r) => (r.advDefHustle?.offLooseBalls ?? r.offLooseBalls).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'defLooseBalls', label: 'Sueltos Def.', helpKey: 'looseBalls', getValue: (r) => r.advDefHustle?.defLooseBalls ?? r.defLooseBalls, format: (r) => (r.advDefHustle?.defLooseBalls ?? r.defLooseBalls).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'boxOuts', label: 'Box-Outs Tot', helpKey: 'offBoxOuts', getValue: (r) => r.advDefHustle?.boxOuts ?? r.boxOuts, format: (r) => (r.advDefHustle?.boxOuts ?? r.boxOuts).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'offBoxOuts', label: 'Box-Out Of.', helpKey: 'offBoxOuts', getValue: (r) => r.advDefHustle?.offBoxOuts ?? r.offBoxOuts, format: (r) => (r.advDefHustle?.offBoxOuts ?? r.offBoxOuts).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'defBoxOuts', label: 'Box-Out Def.', helpKey: 'offBoxOuts', getValue: (r) => r.advDefHustle?.defBoxOuts ?? r.defBoxOuts, format: (r) => (r.advDefHustle?.defBoxOuts ?? r.defBoxOuts).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'boxOutTeamRebs', label: 'BoxOut Eq.Reb', helpKey: 'offBoxOuts', getValue: (r) => r.advDefHustle?.boxOutTeamRebs ?? r.boxOutTeamRebs, format: (r) => (r.advDefHustle?.boxOutTeamRebs ?? r.boxOutTeamRebs).toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'boxOutPlayerRebs', label: 'BoxOut Jug.Reb', helpKey: 'offBoxOuts', getValue: (r) => r.advDefHustle?.boxOutPlayerRebs ?? r.boxOutPlayerRebs, format: (r) => (r.advDefHustle?.boxOutPlayerRebs ?? r.boxOutPlayerRebs).toFixed(r.statMode === 'totals' ? 0 : 1) },
  ],
  defense: [
    { key: 'defRating', label: 'DefRtg', helpKey: 'defRtg', lowerIsBetter: true, getValue: (r) => numOrNull(r.advDefHustle?.defRating ?? (r.defRtg > 0 ? r.defRtg : null)), format: (r) => fmtNum(numOrNull(r.advDefHustle?.defRating ?? (r.defRtg > 0 ? r.defRtg : null)), 1) },
    { key: 'defWs', label: 'Def Win Shares', helpKey: 'defWs', getValue: (r) => numOrNull(r.advDefHustle?.defWs), format: (r) => fmtNum(numOrNull(r.advDefHustle?.defWs), 3) },
    { key: 'drebPct', label: 'DREB%', helpKey: 'drebPct', getValue: (r) => numOrNull(r.advDefHustle?.drebPct ?? (r.drebPct > 0 ? r.drebPct : null)), format: (r) => fmtNum(numOrNull(r.advDefHustle?.drebPct ?? (r.drebPct > 0 ? r.drebPct : null)), 1, '%') },
    { key: 'pctStl', label: '%STL Equipo', helpKey: 'steals', getValue: (r) => numOrNull(r.advDefHustle?.pctStl), format: (r) => fmtNum(numOrNull(r.advDefHustle?.pctStl), 1, '%') },
    { key: 'pctBlk', label: '%BLK Equipo', helpKey: 'blocks', getValue: (r) => numOrNull(r.advDefHustle?.pctBlk), format: (r) => fmtNum(numOrNull(r.advDefHustle?.pctBlk), 1, '%') },
    { key: 'dFgm', label: 'DFGM/PJ', helpKey: 'dFgPct', lowerIsBetter: true, getValue: (r) => numOrNull(r.advDefHustle?.dFgm), format: (r) => fmtNum(numOrNull(r.advDefHustle?.dFgm), r.statMode === 'totals' ? 0 : 1) },
    { key: 'dFga', label: 'DFGA/PJ', helpKey: 'dFgPct', getValue: (r) => numOrNull(r.advDefHustle?.dFga), format: (r) => fmtNum(numOrNull(r.advDefHustle?.dFga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'dFgPct', label: 'DFG%', helpKey: 'dFgPct', lowerIsBetter: true, getValue: (r) => numOrNull(r.advDefHustle?.dFgPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.dFgPct), 1, '%') },
    { key: 'normalFgPct', label: 'FG% Esperado', helpKey: 'dFgPct', getValue: (r) => numOrNull(r.advDefHustle?.normalFgPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.normalFgPct), 1, '%') },
    { key: 'pctPlusMinus', label: 'Diff% (DFG)', helpKey: 'dFgPct', lowerIsBetter: true, getValue: (r) => numOrNull(r.advDefHustle?.pctPlusMinus), format: (r) => fmtNum(numOrNull(r.advDefHustle?.pctPlusMinus), 1, '%', true), tone: (r) => ((r.advDefHustle?.pctPlusMinus ?? 0) <= -1.5 ? 'positive' : (r.advDefHustle?.pctPlusMinus ?? 0) >= 2.0 ? 'negative' : 'neutral') },
    { key: 'defFreq', label: 'Frec. Def.', helpKey: 'dFgPct', getValue: (r) => numOrNull(r.advDefHustle?.defFreq), format: (r) => fmtNum(numOrNull(r.advDefHustle?.defFreq), 1, '%') },
    { key: 'oppPtsPaint', label: 'Opp Pintura', helpKey: 'oppPtsPaint', lowerIsBetter: true, getValue: (r) => numOrNull(r.advDefHustle?.oppPtsPaint), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPtsPaint), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPts2ndChance', label: 'Opp 2ª Op.', helpKey: 'pts2ndChance', lowerIsBetter: true, getValue: (r) => numOrNull(r.advDefHustle?.oppPts2ndChance), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPts2ndChance), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPtsFb', label: 'Opp Contraat.', helpKey: 'ptsFastBreak', lowerIsBetter: true, getValue: (r) => numOrNull(r.advDefHustle?.oppPtsFb), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPtsFb), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPtsOffTov', label: 'Opp x Pérd.', helpKey: 'ptsOffTov', lowerIsBetter: true, getValue: (r) => numOrNull(r.advDefHustle?.oppPtsOffTov), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPtsOffTov), r.statMode === 'totals' ? 0 : 1) },
  ],
  clutch: [
    { key: 'clGp', label: 'PJ Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.gp), format: (r) => fmtNum(numOrNull(r.advClutch?.gp), 0) },
    { key: 'clW', label: 'W Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.w), format: (r) => fmtNum(numOrNull(r.advClutch?.w), 0) },
    { key: 'clL', label: 'L Cl.', helpKey: 'clutch', lowerIsBetter: true, getValue: (r) => numOrNull(r.advClutch?.l), format: (r) => fmtNum(numOrNull(r.advClutch?.l), 0) },
    { key: 'clWPct', label: '%V Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.wPct), format: (r) => fmtNum(numOrNull(r.advClutch?.wPct), 1, '%') },
    { key: 'clMin', label: 'MIN Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.min), format: (r) => fmtNum(numOrNull(r.advClutch?.min), 1) },
    { key: 'clPts', label: 'PTS Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.pts), format: (r) => fmtNum(numOrNull(r.advClutch?.pts), r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'clFgPct', label: 'FG% Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.fgPct), format: (r) => fmtNum(numOrNull(r.advClutch?.fgPct), 1, '%') },
    { key: 'clFg3Pct', label: '3P% Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.fg3Pct), format: (r) => fmtNum(numOrNull(r.advClutch?.fg3Pct), 1, '%') },
    { key: 'clFtPct', label: 'FT% Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.ftPct), format: (r) => fmtNum(numOrNull(r.advClutch?.ftPct), 1, '%') },
    { key: 'clReb', label: 'REB Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.reb), format: (r) => fmtNum(numOrNull(r.advClutch?.reb), r.statMode === 'totals' ? 0 : 1) },
    { key: 'clAst', label: 'AST Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.ast), format: (r) => fmtNum(numOrNull(r.advClutch?.ast), r.statMode === 'totals' ? 0 : 1) },
    { key: 'clStl', label: 'ROB Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.stl), format: (r) => fmtNum(numOrNull(r.advClutch?.stl), r.statMode === 'totals' ? 0 : 1) },
    { key: 'clBlk', label: 'TAP Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.blk), format: (r) => fmtNum(numOrNull(r.advClutch?.blk), r.statMode === 'totals' ? 0 : 1) },
    { key: 'clTov', label: 'PER Cl.', helpKey: 'clutch', lowerIsBetter: true, getValue: (r) => numOrNull(r.advClutch?.tov), format: (r) => fmtNum(numOrNull(r.advClutch?.tov), r.statMode === 'totals' ? 0 : 1) },
    { key: 'clPlusMinus', label: '+/- Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.plusMinus), format: (r) => fmtNum(numOrNull(r.advClutch?.plusMinus), r.statMode === 'totals' ? 0 : 1, '', true), tone: (r) => ((r.advClutch?.plusMinus ?? 0) >= 0 ? 'positive' : 'negative') },
    { key: 'clOffRtg', label: 'OffRtg Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.offRtg), format: (r) => fmtNum(numOrNull(r.advClutch?.offRtg), 1) },
    { key: 'clDefRtg', label: 'DefRtg Cl.', helpKey: 'clutch', lowerIsBetter: true, getValue: (r) => numOrNull(r.advClutch?.defRtg), format: (r) => fmtNum(numOrNull(r.advClutch?.defRtg), 1) },
    { key: 'clNetRtg', label: 'NetRtg Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.netRtg), format: (r) => fmtNum(numOrNull(r.advClutch?.netRtg), 1, '', true), tone: (r) => ((r.advClutch?.netRtg ?? 0) >= 0 ? 'positive' : 'negative') },
    { key: 'clTsPct', label: 'TS% Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.tsPct), format: (r) => fmtNum(numOrNull(r.advClutch?.tsPct), 1, '%') },
    { key: 'clEfgPct', label: 'eFG% Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.efgPct), format: (r) => fmtNum(numOrNull(r.advClutch?.efgPct), 1, '%') },
    { key: 'clUsgPct', label: 'USG% Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.usgPct), format: (r) => fmtNum(numOrNull(r.advClutch?.usgPct), 1, '%') },
    { key: 'clPie', label: 'PIE% Cl.', helpKey: 'clutch', getValue: (r) => numOrNull(r.advClutch?.pie), format: (r) => fmtNum(numOrNull(r.advClutch?.pie), 1, '%') },
    { key: 'buzzerBeaters', label: 'Buzzer B. (0.0s)', helpKey: 'buzzerBeater', getValue: (r) => r.buzzerBeaters, format: (r) => `${r.buzzerBeaters}`, tone: (r) => (r.buzzerBeaters > 0 ? 'accent' : 'neutral') },
    { key: 'gameWinners', label: 'Game Win. (≤10s)', helpKey: 'gameWinner', getValue: (r) => r.gameWinners, format: (r) => `${r.gameWinners}`, tone: (r) => (r.gameWinners > 0 ? 'positive' : 'neutral') },
  ],
  playtypes: [
    { key: 'ptTotalPoss', label: 'Pos. Ofens./PJ', helpKey: 'ppp', getValue: (r) => numOrNull(r.advPlaytypes?.totalPossOff), format: (r) => fmtNum(numOrNull(r.advPlaytypes?.totalPossOff), r.statMode === 'totals' ? 0 : 1) },
    { key: 'ptTopLabel', label: 'Top Jugada', helpKey: 'ppp', align: 'left', isString: true, getValue: (r) => r.advPlaytypes?.topPlayTypeOff?.playTypeLabelEs || '—', format: (r) => r.advPlaytypes?.topPlayTypeOff?.playTypeLabelEs || '—' },
    { key: 'ptTopPpp', label: 'Top PPP', helpKey: 'ppp', getValue: (r) => numOrNull(r.advPlaytypes?.topPlayTypeOff?.ppp), format: (r) => fmtNum(numOrNull(r.advPlaytypes?.topPlayTypeOff?.ppp), 2), tone: () => 'accent' },
    { key: 'ptSpotupPpp', label: 'SpotUp PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'Spotup'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Spotup'), 2) },
    { key: 'ptSpotupPct', label: 'SpotUp %', helpKey: 'ppp', getValue: (r) => findPtPct(r.advPlaytypes, 'Spotup'), format: (r) => fmtNum(findPtPct(r.advPlaytypes, 'Spotup'), 1, '%') },
    { key: 'ptPrbhPpp', label: 'P&R Man. PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'PRBallHandler'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'PRBallHandler'), 2) },
    { key: 'ptPrbhPct', label: 'P&R Man. %', helpKey: 'ppp', getValue: (r) => findPtPct(r.advPlaytypes, 'PRBallHandler'), format: (r) => fmtNum(findPtPct(r.advPlaytypes, 'PRBallHandler'), 1, '%') },
    { key: 'ptTransPpp', label: 'Transic. PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'Transition'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Transition'), 2) },
    { key: 'ptIsoPpp', label: 'Aislam. PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'Isolation'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Isolation'), 2) },
    { key: 'ptPrrPpp', label: 'P&R Cont. PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'PRRollMan'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'PRRollMan'), 2) },
    { key: 'ptCutPpp', label: 'Corte PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'Cut'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Cut'), 2) },
    { key: 'ptPostPpp', label: 'Poste PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'Postup'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Postup'), 2) },
    { key: 'ptHandoffPpp', label: 'Mano a M. PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'Handoff'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Handoff'), 2) },
    { key: 'ptOffScrPpp', label: 'Sal. Bloq. PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'OffScreen'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'OffScreen'), 2) },
    { key: 'ptPutbackPpp', label: 'Reb. Of. PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'OffRebound'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'OffRebound'), 2) },
    { key: 'ptMiscPpp', label: 'Varios PPP', helpKey: 'ppp', getValue: (r) => findPtPpp(r.advPlaytypes, 'Misc'), format: (r) => fmtNum(findPtPpp(r.advPlaytypes, 'Misc'), 2) },
  ],
  violations: [
    { key: 'totalViolations', label: 'Total Violac. (Tot)', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.totalViolations), format: (r) => fmtNum(numOrNull(r.advViolations?.totalViolations), r.statMode === 'totals' ? 0 : 2), tone: () => 'accent' },
    { key: 'pfBase', label: 'Faltas (PF/PJ)', helpKey: 'personalFouls', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.pf ?? r.pfBase), format: (r) => fmtNum(numOrNull(r.advViolations?.pf ?? r.pfBase), r.statMode === 'totals' ? 0 : 1) },
    { key: 'pfdBase', label: 'Faltas Rec. (PFD/PJ)', helpKey: 'foulsDrawn', getValue: (r) => numOrNull(r.advViolations?.pfd ?? r.pfdBase), format: (r) => fmtNum(numOrNull(r.advViolations?.pfd ?? r.pfdBase), r.statMode === 'totals' ? 0 : 1), tone: () => 'positive' },
    { key: 'blkaBase', label: 'Tap. Rec. (BLKA/PJ)', helpKey: 'blka', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.blka ?? r.blkaBase), format: (r) => fmtNum(numOrNull(r.advViolations?.blka ?? r.blkaBase), r.statMode === 'totals' ? 0 : 1) },
    { key: 'tovBase', label: 'Pérdidas (TOV/PJ)', helpKey: 'tov', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.tov ?? r.tovBase), format: (r) => fmtNum(numOrNull(r.advViolations?.tov ?? r.tovBase), r.statMode === 'totals' ? 0 : 1) },
    { key: 'travel', label: 'Pasos (Tot)', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.travel), format: (r) => fmtNum(numOrNull(r.advViolations?.travel), r.statMode === 'totals' ? 0 : 2) },
    { key: 'doubleDribble', label: 'Dobles (Tot)', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.doubleDribble), format: (r) => fmtNum(numOrNull(r.advViolations?.doubleDribble), r.statMode === 'totals' ? 0 : 2) },
    { key: 'discontinuedDribble', label: 'Acompañar Balón', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.discontinuedDribble), format: (r) => fmtNum(numOrNull(r.advViolations?.discontinuedDribble), r.statMode === 'totals' ? 0 : 2) },
    { key: 'offThreeSec', label: '3s Zona Of.', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.offThreeSec), format: (r) => fmtNum(numOrNull(r.advViolations?.offThreeSec), r.statMode === 'totals' ? 0 : 2) },
    { key: 'defThreeSec', label: '3s Zona Def.', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.defThreeSec), format: (r) => fmtNum(numOrNull(r.advViolations?.defThreeSec), r.statMode === 'totals' ? 0 : 2) },
    { key: 'shotClock', label: 'Reloj 24s', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.shotClock), format: (r) => fmtNum(numOrNull(r.advViolations?.shotClock), r.statMode === 'totals' ? 0 : 2) },
    { key: 'fiveSec', label: '5 Seg.', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.fiveSec), format: (r) => fmtNum(numOrNull(r.advViolations?.fiveSec), r.statMode === 'totals' ? 0 : 2) },
    { key: 'eightSec', label: '8 Seg.', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.eightSec), format: (r) => fmtNum(numOrNull(r.advViolations?.eightSec), r.statMode === 'totals' ? 0 : 2) },
    { key: 'palming', label: 'Palming', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.palming), format: (r) => fmtNum(numOrNull(r.advViolations?.palming), r.statMode === 'totals' ? 0 : 2) },
    { key: 'offFoul', label: 'Falta Ataque', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.offFoul), format: (r) => fmtNum(numOrNull(r.advViolations?.offFoul), r.statMode === 'totals' ? 0 : 2) },
    { key: 'chargeViol', label: 'Carga Of.', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.charge), format: (r) => fmtNum(numOrNull(r.advViolations?.charge), r.statMode === 'totals' ? 0 : 2) },
    { key: 'backcourt', label: 'Campo Atrás', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.backcourt), format: (r) => fmtNum(numOrNull(r.advViolations?.backcourt), r.statMode === 'totals' ? 0 : 2) },
    { key: 'lane', label: 'Invasión TL', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.lane), format: (r) => fmtNum(numOrNull(r.advViolations?.lane), r.statMode === 'totals' ? 0 : 2) },
    { key: 'kickedBall', label: 'Pie (Kick Ball)', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.kickedBall), format: (r) => fmtNum(numOrNull(r.advViolations?.kickedBall), r.statMode === 'totals' ? 0 : 2) },
    { key: 'delayOfGame', label: 'Retraso Juego', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.delayOfGame), format: (r) => fmtNum(numOrNull(r.advViolations?.delayOfGame), r.statMode === 'totals' ? 0 : 2) },
    { key: 'offGoaltending', label: 'Interf. Of.', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.offGoaltending), format: (r) => fmtNum(numOrNull(r.advViolations?.offGoaltending), r.statMode === 'totals' ? 0 : 2) },
    { key: 'defGoaltending', label: 'Interf. Def.', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.defGoaltending), format: (r) => fmtNum(numOrNull(r.advViolations?.defGoaltending), r.statMode === 'totals' ? 0 : 2) },
    { key: 'inbound', label: 'Saque Fondo', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.inbound), format: (r) => fmtNum(numOrNull(r.advViolations?.inbound), r.statMode === 'totals' ? 0 : 2) },
    { key: 'jumpBall', label: 'Salto Entre 2', helpKey: 'violationsTotal', lowerIsBetter: true, getValue: (r) => numOrNull(r.advViolations?.jumpBall), format: (r) => fmtNum(numOrNull(r.advViolations?.jumpBall), r.statMode === 'totals' ? 0 : 2) },
    { key: 'dd2', label: 'DD2', helpKey: 'doubleDoubles', getValue: (r) => numOrNull(r.advViolations?.dd2 ?? r.dd2), format: (r) => fmtNum(numOrNull(r.advViolations?.dd2 ?? r.dd2), 0) },
    { key: 'td3', label: 'TD3', helpKey: 'tripleDoubles', getValue: (r) => numOrNull(r.advViolations?.td3 ?? r.td3), format: (r) => fmtNum(numOrNull(r.advViolations?.td3 ?? r.td3), 0) },
    { key: 'fantasyPts', label: 'NBA FPTS', helpKey: 'nbaFantasyPts', getValue: (r) => numOrNull(r.advViolations?.nbaFantasyPts ?? r.fantasyPts), format: (r) => fmtNum(numOrNull(r.advViolations?.nbaFantasyPts ?? r.fantasyPts), 1) },
  ],
};

function formatPlayerColHeader(col: PlayerColDef, statMode: StatScaleMode, windowSize: number): string {
  if (col.key === 'ptsWin') return statMode === 'totals' ? `PTS Últ.${windowSize}` : `Últ. ${windowSize}`;
  if (col.key === 'usgWin') return `USG Últ.${windowSize}`;
  if (statMode === 'totals') {
    if (col.label.includes('/PJ')) return col.label.replace(/\/PJ/g, ' Tot');
    if (col.label === 'Faltas (PF/PJ)') return 'Faltas (PF)';
    return col.label;
  }
  if (col.label.includes(' (Tot)')) return col.label.replace(' (Tot)', '/PJ');
  return col.label;
}

function loadSavedPlayerCols(): Record<TableViewMode, string[]> {
  const defaults = {} as Record<TableViewMode, string[]>;
  for (const l of PLAYER_LAYERS) defaults[l.id] = [...l.defaultCols];
  try {
    const raw = localStorage.getItem(STORAGE_PLAYER_COLS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    for (const l of PLAYER_LAYERS) {
      if (Array.isArray(parsed[l.id])) {
        const validKeys = new Set(PLAYER_COLUMNS_BY_LAYER[l.id].map((c) => c.key));
        const filtered = parsed[l.id].map(String).filter((k: string) => validKeys.has(k));
        if (filtered.length > 0) defaults[l.id] = filtered;
      }
    }
    return defaults;
  } catch {
    return defaults;
  }
}

export function PlayersExplorerView({
  players,
  teams = [],
  experienceMode,
  benchmarks,
  seasonToken = '2027',
  onSwitchToAdvanced,
  totalLeaguePlayersAvailable,
  allPlayersLoaded,
  loadingAllPlayers,
  onLoadAllPlayers,
  windowSize,
  watchlistIds,
  onlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  onAddExternalPlayer,
  addingPlayerId,
  showHeroicBadges = false,
}: PlayersExplorerViewProps) {
  const [viewMode, setViewMode] = useState<TableViewMode>('basic');
  const [statMode, setStatMode] = useState<StatScaleMode>(loadPlayerStatMode);
  const [visibleColsByLayer, setVisibleColsByLayer] = useState<Record<TableViewMode, string[]>>(loadSavedPlayerCols);
  const [unifiedFilters, setUnifiedFilters] = useState<UnifiedTableFiltersState>(DEFAULT_UNIFIED_FILTERS);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('ptsBase');
  const [sortAsc, setSortAsc] = useState(false);

  // Lazy cache for NBA.com advanced categories: key = `${seasonToken}:${category}` -> Record<playerId, entry>
  const [advCache, setAdvCache] = useState<Record<string, Record<string, any>>>({});
  const [heroicCache, setHeroicCache] = useState<Record<string, Record<string, NbaHeroicShotCountSummary>>>({});
  const [loadingCategory, setLoadingCategory] = useState<NbaAdvancedCategory | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const entityLookup = useMemo(() => buildEntityLookupContext(players, teams), [players, teams]);

  const [remoteResults, setRemoteResults] = useState<SearchPlayerResult[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [mobileScrollTop, setMobileScrollTop] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PLAYER_COLS_KEY, JSON.stringify(visibleColsByLayer));
    } catch {
      // ignore quota errors
    }
  }, [visibleColsByLayer]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PLAYER_STAT_MODE_KEY, statMode);
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
        sortKey !== 'ptsVsNba' &&
        sortKey !== 'minBase' &&
        sortKey !== 'ptsBase' &&
        sortKey !== 'ptsWin' &&
        sortKey !== 'rebBase' &&
        sortKey !== 'astBase' &&
        sortKey !== 'tsPct'
      ) {
        setSortKey('ptsBase');
        setSortAsc(false);
      }
    }
  }, [experienceMode, sortKey]);

  const activeLayerMeta = useMemo(
    () => PLAYER_LAYERS.find((l) => l.id === viewMode) || PLAYER_LAYERS[0],
    [viewMode]
  );

  // Fetch NBA.com advanced category on demand when entering a layer that requires it
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

    fetch(`/api/nba/advanced/players?category=${encodeURIComponent(cat)}&season=${encodeURIComponent(seasonToken)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const map: Record<string, any> = {};
        const items = Array.isArray(json?.items) ? json.items : [];
        for (const item of items) {
          const id = String(item.entityId || item.playerId || '');
          if (id) map[id] = item;
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

  // Fetch Buzzer Beaters & Game Winners counts from offline-safe snapshot
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
          [seasonToken]: json.playerCounts || {},
        }));
      })
      .catch(() => {
        // Ignore transient heroic fetch failure
      });
    return () => {
      cancelled = true;
    };
  }, [seasonToken, heroicCache, showHeroicBadges]);

  const handleQueryChange = async (val: string) => {
    setQuery(val);
    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setRemoteResults([]);
      return;
    }
    setSearchingRemote(true);
    try {
      const res = await fetch(`/api/nba/search?q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const json = await res.json();
        setRemoteResults(json.results || []);
      }
    } catch {
      // Ignore transient search errors
    } finally {
      setSearchingRemote(false);
    }
  };

  const rows: EnrichedPlayerRow[] = useMemo(() => {
    const scoringMap = advCache[`${seasonToken}:scoring`] || {};
    const zonesMap = advCache[`${seasonToken}:zones`] || {};
    const trackingMap = advCache[`${seasonToken}:tracking`] || {};
    const defHustleMap = advCache[`${seasonToken}:defense_hustle`] || {};
    const clutchMap = advCache[`${seasonToken}:clutch`] || {};
    const playtypesMap = advCache[`${seasonToken}:playtypes`] || {};
    const violationsMap = advCache[`${seasonToken}:violations`] || {};
    const fourFactorsMap = advCache[`${seasonToken}:four_factors`] || {};
    const heroicMap = heroicCache[seasonToken] || {};

    return players.map((p) => {
      const games = p.games;
      const gp = Math.max(1, games.length);
      const winSlice = games.slice(0, Math.min(windowSize, games.length));
      const isTotals = statMode === 'totals';

      const minAvg = round1(mean(games.map((g) => g.minutes)));
      const minTot = round1(games.reduce((s, g) => s + g.minutes, 0));
      const ptsAvg = round1(mean(games.map((g) => g.points)));
      const ptsWinAvg = round1(mean(winSlice.map((g) => g.points)));
      const ptsWinTot = Math.round(winSlice.reduce((s, g) => s + g.points, 0));
      const pctDelta = ptsAvg > 0 ? round1(((ptsWinAvg - ptsAvg) / ptsAvg) * 100) : 0;

      const rebAvg = round1(mean(games.map((g) => g.rebounds)));
      const rebTot = Math.round(games.reduce((s, g) => s + g.rebounds, 0));
      const orebAvg = round1(mean(games.map((g) => g.oreb)));
      const orebTot = Math.round(games.reduce((s, g) => s + g.oreb, 0));
      const drebAvg = round1(mean(games.map((g) => g.dreb)));
      const drebTot = Math.round(games.reduce((s, g) => s + g.dreb, 0));
      const astAvg = round1(mean(games.map((g) => g.assists)));
      const stlAvg = round1(mean(games.map((g) => g.steals)));
      const stlTot = Math.round(games.reduce((s, g) => s + g.steals, 0));
      const blkAvg = round1(mean(games.map((g) => g.blocks)));
      const blkTot = Math.round(games.reduce((s, g) => s + g.blocks, 0));
      const stocksAvg = round1(mean(games.map((g) => g.stocks)));
      const stocksTot = Math.round(games.reduce((s, g) => s + g.stocks, 0));
      const tovAvg = round1(mean(games.map((g) => g.turnovers)));
      const pfAvg = round1(mean(games.map((g) => g.fouls)));
      const pfTotCalc = Math.round(games.reduce((s, g) => s + g.fouls, 0));
      const plusMinusAvg = round1(mean(games.map((g) => g.plusMinus)));
      const plusMinusTot = Math.round(games.reduce((s, g) => s + g.plusMinus, 0));

      const fgm = games.reduce((s, g) => s + g.fgm, 0);
      const fga = games.reduce((s, g) => s + g.fga, 0);
      const fg3m = games.reduce((s, g) => s + g.fg3m, 0);
      const fg3a = games.reduce((s, g) => s + g.fg3a, 0);
      const ftm = games.reduce((s, g) => s + g.ftm, 0);
      const fta = games.reduce((s, g) => s + g.fta, 0);
      const ptsTot = Math.round(games.reduce((s, g) => s + g.points, 0));
      const tovTot = Math.round(games.reduce((s, g) => s + g.turnovers, 0));
      const astTot = Math.round(games.reduce((s, g) => s + g.assists, 0));

      const fgPct = fga > 0 ? round1((fgm / fga) * 100) : 0;
      const fg3Pct = fg3a > 0 ? round1((fg3m / fg3a) * 100) : 0;
      const ftPct = fta > 0 ? round1((ftm / fta) * 100) : 0;
      const calcEfg = fga > 0 ? round1(((fgm + 0.5 * fg3m) / fga) * 100) : 0;
      const tsDenom = 2 * (fga + 0.44 * fta);
      const calcTs = tsDenom > 0 ? round1((ptsTot / tsDenom) * 100) : 0;

      // Compute DD2 / TD3 / NBA Fantasy Pts from boxscores
      let dd2Calc = 0;
      let td3Calc = 0;
      let fantasySum = 0;
      for (const g of games) {
        const cats = [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter((v) => v >= 10).length;
        if (cats >= 2) dd2Calc++;
        if (cats >= 3) td3Calc++;
        fantasySum += g.points + g.rebounds * 1.2 + g.assists * 1.5 + g.steals * 3 + g.blocks * 3 - g.turnovers;
      }
      const fantasyAvg = games.length > 0 ? round1(fantasySum / games.length) : 0;

      const adv = p.advanced;
      const ff = fourFactorsMap[p.id];
      const rawViol: NbaViolationsEntry | undefined = violationsMap[p.id];
      const violGp = rawViol?.gp && rawViol.gp > 0 ? rawViol.gp : gp;

      const usgPct = ff?.usgPct ?? adv?.usgPct ?? round1(mean(games.map((g) => g.usgEst)));
      const usgWin = round1(mean(winSlice.map((g) => g.usgEst)));
      const tsPct = ff?.tsPct || adv?.tsPct || calcTs;
      const efgPct = ff?.efgPct || adv?.efgPct || calcEfg;
      const offRtg = ff?.offRtg ?? adv?.offRtg ?? 0;
      const defRtg = ff?.defRtg ?? adv?.defRtg ?? 0;
      const netRtg = ff?.netRtg ?? adv?.netRtg ?? plusMinusAvg;
      const pie = ff?.pie ?? adv?.pie ?? 0;
      const pace = ff?.pace ?? adv?.pace ?? 0;
      const gmSc = round1(mean(games.map((g) => g.gameScore)));

      const astPct = ff?.astPct ?? adv?.astPct ?? 0;
      const astRatio = ff?.astRatio ?? adv?.astRatio ?? 0;
      const astTo = ff?.astTo ?? adv?.astTo ?? (tovTot > 0 ? round1(astTot / tovTot) : round1(astAvg));
      const orebPct = ff?.orebPct ?? adv?.orebPct ?? 0;
      const drebPct = ff?.drebPct ?? adv?.drebPct ?? 0;
      const rebPct = ff?.rebPct ?? adv?.rebPct ?? 0;
      const tovPct = ff?.tmTovPct ?? adv?.tovPct ?? 0;

      const pfdPg = adv?.foulsDrawn ?? rawViol?.pfd ?? 0;
      const blkaPg = adv?.blka ?? rawViol?.blka ?? 0;
      const pfPg = rawViol?.pf ?? adv?.pf ?? pfAvg;

      const scaleInt = (v: number, gCount: number) => Math.round(v * gCount);
      const scaleDec = (v: number, gCount: number) => round1(v * gCount);

      // Transform Zones (backend provides both PerGame and *Total)
      const rawZone: NbaShotZonesEntry | undefined = zonesMap[p.id];
      const zoneGp = rawViol?.gp && rawViol.gp > 0 ? rawViol.gp : gp;
      const advZones: NbaShotZonesEntry | undefined = rawZone
        ? isTotals
          ? {
              ...rawZone,
              restrictedArea: {
                ...rawZone.restrictedArea,
                fgm: rawZone.restrictedArea.fgmTotal ?? scaleInt(rawZone.restrictedArea.fgm, zoneGp),
                fga: rawZone.restrictedArea.fgaTotal ?? scaleInt(rawZone.restrictedArea.fga, zoneGp),
              },
              paintNonRa: {
                ...rawZone.paintNonRa,
                fgm: rawZone.paintNonRa.fgmTotal ?? scaleInt(rawZone.paintNonRa.fgm, zoneGp),
                fga: rawZone.paintNonRa.fgaTotal ?? scaleInt(rawZone.paintNonRa.fga, zoneGp),
              },
              midRange: {
                ...rawZone.midRange,
                fgm: rawZone.midRange.fgmTotal ?? scaleInt(rawZone.midRange.fgm, zoneGp),
                fga: rawZone.midRange.fgaTotal ?? scaleInt(rawZone.midRange.fga, zoneGp),
              },
              leftCorner3: {
                ...rawZone.leftCorner3,
                fgm: rawZone.leftCorner3.fgmTotal ?? scaleInt(rawZone.leftCorner3.fgm, zoneGp),
                fga: rawZone.leftCorner3.fgaTotal ?? scaleInt(rawZone.leftCorner3.fga, zoneGp),
              },
              rightCorner3: {
                ...rawZone.rightCorner3,
                fgm: rawZone.rightCorner3.fgmTotal ?? scaleInt(rawZone.rightCorner3.fgm, zoneGp),
                fga: rawZone.rightCorner3.fgaTotal ?? scaleInt(rawZone.rightCorner3.fga, zoneGp),
              },
              corner3: {
                ...rawZone.corner3,
                fgm: rawZone.corner3.fgmTotal ?? scaleInt(rawZone.corner3.fgm, zoneGp),
                fga: rawZone.corner3.fgaTotal ?? scaleInt(rawZone.corner3.fga, zoneGp),
              },
              aboveBreak3: {
                ...rawZone.aboveBreak3,
                fgm: rawZone.aboveBreak3.fgmTotal ?? scaleInt(rawZone.aboveBreak3.fgm, zoneGp),
                fga: rawZone.aboveBreak3.fgaTotal ?? scaleInt(rawZone.aboveBreak3.fga, zoneGp),
              },
              totalRimFga: rawZone.totalRimFgaTotal ?? scaleInt(rawZone.totalRimFga, zoneGp),
              totalThreeFga: rawZone.totalThreeFgaTotal ?? scaleInt(rawZone.totalThreeFga, zoneGp),
            }
          : rawZone
        : undefined;

      // Transform Tracking (backend provides PerGame)
      const rawTrack: NbaTrackingEntry | undefined = trackingMap[p.id];
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

      // Transform Defense & Hustle (backend provides PerGame)
      const rawDef: NbaDefenseHustleEntry | undefined = defHustleMap[p.id];
      const defGp = rawDef?.gp && rawDef.gp > 0 ? rawDef.gp : gp;
      const advDefHustle: NbaDefenseHustleEntry | undefined = rawDef
        ? isTotals
          ? {
              ...rawDef,
              ptsPaint: scaleInt(rawDef.ptsPaint ?? 0, defGp),
              pts2ndChance: scaleInt(rawDef.pts2ndChance ?? 0, defGp),
              ptsFb: scaleInt(rawDef.ptsFb ?? 0, defGp),
              ptsOffTov: scaleInt(rawDef.ptsOffTov ?? 0, defGp),
              oppPtsPaint: scaleInt(rawDef.oppPtsPaint ?? 0, defGp),
              oppPts2ndChance: scaleInt(rawDef.oppPts2ndChance ?? 0, defGp),
              oppPtsFb: scaleInt(rawDef.oppPtsFb ?? 0, defGp),
              oppPtsOffTov: scaleInt(rawDef.oppPtsOffTov ?? 0, defGp),
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

      // Transform Clutch (backend provides PerGame)
      const rawCl: NbaClutchEntry | undefined = clutchMap[p.id];
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

      // Transform Playtypes (backend provides PerGame totalPossOff)
      const rawPt: NbaPlaytypeEntitySummary | undefined = playtypesMap[p.id];
      const ptGp = rawViol?.gp && rawViol.gp > 0 ? rawViol.gp : gp;
      const advPlaytypes: NbaPlaytypeEntitySummary | undefined = rawPt
        ? isTotals
          ? {
              ...rawPt,
              totalPossOff: scaleInt(rawPt.totalPossOff, ptGp),
            }
          : rawPt
        : undefined;

      // Transform Violations: backend stores the 19 violation counts as Totals, and pf/pfd/blka/tov/nbaFantasyPts as PerGame
      const advViolations: NbaViolationsEntry | undefined = rawViol
        ? isTotals
          ? {
              ...rawViol,
              min: scaleDec(rawViol.min, violGp),
              pf: scaleInt(rawViol.pf, violGp),
              pfd: scaleInt(rawViol.pfd, violGp),
              blka: scaleInt(rawViol.blka, violGp),
              tov: scaleInt(rawViol.tov, violGp),
              nbaFantasyPts: scaleDec(rawViol.nbaFantasyPts, violGp),
              ptsPaint: scaleInt(rawViol.ptsPaint ?? 0, violGp),
              pts2ndChance: scaleInt(rawViol.pts2ndChance ?? 0, violGp),
              ptsFb: scaleInt(rawViol.ptsFb ?? 0, violGp),
              ptsOffTov: scaleInt(rawViol.ptsOffTov ?? 0, violGp),
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

      const scaleBase = (pgVal: number, exactTot: number) => (isTotals ? exactTot : pgVal);

      return {
        ...p,
        statMode,
        minBase: isTotals ? minTot : minAvg,
        ptsBase: isTotals ? ptsTot : ptsAvg,
        ptsWin: isTotals ? ptsWinTot : ptsWinAvg,
        pctDelta,
        rebBase: scaleBase(rebAvg, rebTot),
        orebBase: scaleBase(orebAvg, orebTot),
        drebBase: scaleBase(drebAvg, drebTot),
        astBase: scaleBase(astAvg, astTot),
        stlBase: scaleBase(stlAvg, stlTot),
        blkBase: scaleBase(blkAvg, blkTot),
        stocksBase: scaleBase(stocksAvg, stocksTot),
        tovBase: scaleBase(tovAvg, tovTot),
        pfBase: isTotals ? (rawViol?.pf ? scaleInt(rawViol.pf, violGp) : pfTotCalc) : pfPg,
        pfdBase: isTotals ? scaleInt(pfdPg, violGp) : pfdPg,
        blkaBase: isTotals ? scaleInt(blkaPg, violGp) : blkaPg,
        fgPct,
        fg3Pct,
        ftPct,
        dd2: rawViol?.dd2 ?? dd2Calc,
        td3: rawViol?.td3 ?? td3Calc,
        fantasyPts: isTotals
          ? round1((rawViol?.nbaFantasyPts ?? fantasyAvg) * violGp)
          : (rawViol?.nbaFantasyPts ?? fantasyAvg),
        plusMinusBase: scaleBase(plusMinusAvg, plusMinusTot),
        usgPct,
        usgWin,
        tsPct,
        efgPct,
        offRtg,
        defRtg,
        netRtg,
        pie,
        gmSc,
        pace,
        astPct,
        astRatio,
        astTo,
        orebPct,
        drebPct,
        rebPct,
        tovPct,
        ptsPaint: isTotals ? scaleInt(adv?.ptsPaint ?? 0, defGp) : (adv?.ptsPaint ?? 0),
        pts2ndChance: isTotals ? scaleInt(adv?.pts2ndChance ?? 0, defGp) : (adv?.pts2ndChance ?? 0),
        ptsFastBreak: isTotals ? scaleInt(adv?.ptsFastBreak ?? 0, defGp) : (adv?.ptsFastBreak ?? 0),
        ptsOffTov: isTotals ? scaleInt(adv?.ptsOffTov ?? 0, defGp) : (adv?.ptsOffTov ?? 0),
        contestedShots: isTotals ? scaleInt(adv?.contestedShots ?? 0, defGp) : (adv?.contestedShots ?? 0),
        contestedShots2pt: isTotals ? scaleInt(adv?.contestedShots2pt ?? 0, defGp) : (adv?.contestedShots2pt ?? 0),
        contestedShots3pt: isTotals ? scaleInt(adv?.contestedShots3pt ?? 0, defGp) : (adv?.contestedShots3pt ?? 0),
        deflections: isTotals ? scaleInt(adv?.deflections ?? 0, defGp) : (adv?.deflections ?? 0),
        chargesDrawn: isTotals ? scaleInt(adv?.chargesDrawn ?? 0, defGp) : (adv?.chargesDrawn ?? 0),
        screenAssists: isTotals ? scaleInt(adv?.screenAssists ?? 0, defGp) : (adv?.screenAssists ?? 0),
        screenAstPts: isTotals ? scaleInt(adv?.screenAstPts ?? 0, defGp) : (adv?.screenAstPts ?? 0),
        looseBalls: isTotals ? scaleInt(adv?.looseBalls ?? 0, defGp) : (adv?.looseBalls ?? 0),
        offLooseBalls: isTotals ? scaleInt(adv?.offLooseBalls ?? 0, defGp) : (adv?.offLooseBalls ?? 0),
        defLooseBalls: isTotals ? scaleInt(adv?.defLooseBalls ?? 0, defGp) : (adv?.defLooseBalls ?? 0),
        boxOuts: isTotals ? scaleInt(adv?.boxOuts ?? 0, defGp) : (adv?.boxOuts ?? 0),
        offBoxOuts: isTotals ? scaleInt(adv?.offBoxOuts ?? 0, defGp) : (adv?.offBoxOuts ?? 0),
        defBoxOuts: isTotals ? scaleInt(adv?.defBoxOuts ?? 0, defGp) : (adv?.defBoxOuts ?? 0),
        boxOutTeamRebs: isTotals ? scaleInt(adv?.boxOutTeamRebs ?? 0, defGp) : (adv?.boxOutTeamRebs ?? 0),
        boxOutPlayerRebs: isTotals ? scaleInt(adv?.boxOutPlayerRebs ?? 0, defGp) : (adv?.boxOutPlayerRebs ?? 0),
        foulsDrawn: isTotals ? scaleInt(adv?.foulsDrawn ?? pfdPg, violGp) : (adv?.foulsDrawn ?? pfdPg),
        advScoring: scoringMap[p.id],
        advZones,
        advTracking,
        advDefHustle,
        advClutch,
        advPlaytypes,
        advViolations,
        buzzerBeaters: heroicMap[p.id]?.buzzerBeaters ?? 0,
        gameWinners: heroicMap[p.id]?.gameWinners ?? 0,
      };
    });
  }, [players, windowSize, advCache, heroicCache, seasonToken, statMode]);

  const activePtsBenchmark: MetricBenchmark = useMemo(() => {
    if (statMode === 'per_game' || rows.length === 0) return benchmarks.player.pts;
    const vals = rows.map((r) => r.ptsBase);
    const m = mean(vals);
    const variance = vals.reduce((acc, v) => acc + (v - m) ** 2, 0) / vals.length;
    return {
      ...benchmarks.player.pts,
      mean: m,
      sd: Math.max(1, Math.sqrt(variance)),
      decimals: 0,
    };
  }, [statMode, rows, benchmarks.player.pts]);

  const activeLayerColumns = useMemo(() => {
    const allDefs = PLAYER_COLUMNS_BY_LAYER[viewMode].filter(
      (c) => showHeroicBadges || (c.key !== 'buzzerBeaters' && c.key !== 'gameWinners')
    );
    const visibleSet = new Set(visibleColsByLayer[viewMode] || activeLayerMeta.defaultCols);
    const active = allDefs.filter((c) => visibleSet.has(c.key));
    return active.length > 0 ? active : allDefs.slice(0, 6);
  }, [viewMode, visibleColsByLayer, activeLayerMeta, showHeroicBadges]);

  const activeSortColDef = useMemo(
    () => PLAYER_COLUMNS_BY_LAYER[viewMode].find((c) => c.key === sortKey),
    [viewMode, sortKey]
  );

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query.trim());
    return rows
      .filter((r) => {
        if (onlyWatchlist && !watchlistIds.has(`player:${r.id}`)) return false;
        if (!matchesPlayerUnifiedFilters(r, unifiedFilters, entityLookup)) return false;
        if (q) {
          const hay = normalizeSearchText(
            `${r.name} ${r.teamAbbr} ${r.teamName} ${r.position} ${r.country || ''}`
          );
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'watched') {
          const wa = watchlistIds.has(`player:${a.id}`);
          const wb = watchlistIds.has(`player:${b.id}`);
          return compareSortValues(wa, wb, sortAsc) || b.ptsBase - a.ptsBase;
        }
        if (sortKey === 'name') {
          return compareSortValues(a.name, b.name, sortAsc);
        }
        if (sortKey === 'ptsVsNba') {
          return sortAsc ? a.ptsBase - b.ptsBase : b.ptsBase - a.ptsBase;
        }
        if (activeSortColDef) {
          const va = activeSortColDef.getValue(a);
          const vb = activeSortColDef.getValue(b);
          if (va === null && vb === null) return b.ptsBase - a.ptsBase;
          if (va === null) return 1;
          if (vb === null) return -1;
          return compareSortValues(va, vb, sortAsc) || b.ptsBase - a.ptsBase;
        }
        const va = (a as any)[sortKey];
        const vb = (b as any)[sortKey];
        if (typeof va === 'number' && typeof vb === 'number') {
          return sortAsc ? va - vb : vb - va;
        }
        return b.ptsBase - a.ptsBase;
      });
  }, [rows, onlyWatchlist, watchlistIds, unifiedFilters, entityLookup, query, sortKey, sortAsc, activeSortColDef]);

  const existingIds = useMemo(() => new Set(players.map((p) => p.id)), [players]);
  const unaddedRemote = useMemo(
    () => remoteResults.filter((r) => !existingIds.has(r.id)),
    [remoteResults, existingIds]
  );

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const qualified = rows.filter((r) => (r.games.length > 0 ? r.minBase / (statMode === 'totals' ? r.games.length : 1) >= 20 : false));
    const pool = qualified.length > 0 ? qualified : rows;
    const topScorer = [...pool].sort((a, b) => b.ptsBase - a.ptsBase)[0];
    const topUsage = [...pool].sort((a, b) => b.usgPct - a.usgPct)[0];
    const topPie = [...pool].sort((a, b) => b.pie - a.pie)[0];
    return { topScorer, topUsage, topPie };
  }, [rows, statMode]);

  const handleBuildPlayersSnapshot = async () => {
    const dateSlug = new Date().toISOString().slice(0, 10);
    const topRows = filtered.slice(0, 20);
    const modeSlug = experienceMode === 'simple' ? 'esencial' : viewMode;
    const filename = `radarnba-jugadores-${modeSlug}-${statMode === 'totals' ? 'totales' : 'pj'}-${dateSlug}.png`;

    const posLabel =
      unifiedFilters.position === 'all'
        ? 'Todas las posiciones'
        : unifiedFilters.position === 'G'
        ? 'Bases / Escoltas (G)'
        : unifiedFilters.position === 'F'
        ? 'Aleros (F)'
        : 'Pívots (C)';

    const snapshotCols =
      experienceMode === 'simple'
        ? [
            { key: 'min', label: 'MIN', align: 'right' as const, widthWeight: 0.8 },
            { key: 'pts', label: 'PTS', align: 'right' as const, widthWeight: 0.9 },
            { key: 'win', label: `ÚLT. ${windowSize} PJ`, align: 'right' as const, widthWeight: 1.05 },
            { key: 'reb', label: 'REB', align: 'right' as const, widthWeight: 0.85 },
            { key: 'ast', label: 'AST', align: 'right' as const, widthWeight: 0.85 },
            { key: 'ts', label: 'TS%', align: 'right' as const, widthWeight: 0.95 },
          ]
        : activeLayerColumns.slice(0, 7).map((col) => ({
            key: col.key,
            label: formatPlayerColHeader(col, statMode, windowSize).toUpperCase(),
            align: (col.align || 'right') as 'left' | 'right',
            widthWeight: col.isString ? 1.3 : 0.95,
          }));

    return buildTableSnapshotBlob({
      filename,
      categoryTag: 'EXPLORADOR DE JUGADORES NBA',
      title:
        experienceMode === 'simple'
          ? `Ranking Estadístico de Jugadores NBA (${statMode === 'totals' ? 'Totales' : 'Por Partido'})`
          : `Jugadores NBA · ${activeLayerMeta.label} (${statMode === 'totals' ? 'Totales' : 'Por Partido'})`,
      subtitle: `${posLabel} · ${filtered.length} jugadores · ${statMode === 'totals' ? 'Acumulado temporada' : 'Promedios por partido'} · Últ. ${windowSize} PJ`,
      entityColumnLabel: 'JUGADOR',
      entityColumnWeight: 2.3,
      kpis: [
        {
          label: 'MUESTRA FILTRADA',
          value: `${filtered.length} jug.`,
          sublabel: query.trim() ? `Búsqueda: "${query.trim()}"` : posLabel,
        },
        {
          label: 'LÍDER ANOTACIÓN',
          value: summary?.topScorer ? summary.topScorer.name : '—',
          sublabel: summary?.topScorer
            ? `${summary.topScorer.ptsBase.toFixed(statMode === 'totals' ? 0 : 1)} PTS (${summary.topScorer.teamAbbr})`
            : undefined,
          tone: 'accent',
        },
        {
          label: 'MAYOR IMPACTO PIE',
          value: summary?.topPie ? summary.topPie.name : '—',
          sublabel: summary?.topPie
            ? `${summary.topPie.pie.toFixed(1)}% PIE (${summary.topPie.teamAbbr})`
            : undefined,
          tone: 'positive',
        },
      ],
      columns: snapshotCols,
      rows: topRows.map((r, idx) => {
        const cells: Record<string, TableSnapshotCell | string> = {};
        const dec = statMode === 'totals' ? 0 : 1;
        if (experienceMode === 'simple') {
          cells.min = { text: r.minBase.toFixed(1) };
          cells.pts = { text: r.ptsBase.toFixed(dec), tone: 'accent' };
          cells.win = {
            text: r.ptsWin.toFixed(dec),
            subtext: `${formatSigned(r.pctDelta, 0)}%`,
            tone: r.pctDelta >= 12 ? 'positive' : r.pctDelta <= -12 ? 'negative' : 'neutral',
          };
          cells.reb = { text: r.rebBase.toFixed(dec) };
          cells.ast = { text: r.astBase.toFixed(dec) };
          cells.ts = { text: `${r.tsPct.toFixed(1)}%` };
        } else {
          for (const col of activeLayerColumns.slice(0, 7)) {
            const t = col.tone ? col.tone(r) : 'neutral';
            cells[col.key] = { text: col.format(r), tone: t };
          }
        }
        return {
          rank: idx + 1,
          teamAbbr: r.teamAbbr,
          entityName: r.name,
          entitySubtext: `${r.position} · ${r.games.length} PJ`,
          cells,
        };
      }),
      footerNote: `Mostrando top ${topRows.length} de ${filtered.length} jugadores según el orden actual de la tabla`,
    });
  };

  const handleModeSwitch = (mode: TableViewMode) => {
    setViewMode(mode);
    const meta = PLAYER_LAYERS.find((l) => l.id === mode);
    const nextSort = meta?.defaultSortKey || 'ptsBase';
    setSortKey(nextSort);
    const def = PLAYER_COLUMNS_BY_LAYER[mode].find((c) => c.key === nextSort);
    setSortAsc(Boolean(def?.lowerIsBetter));
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      const def = PLAYER_COLUMNS_BY_LAYER[viewMode].find((c) => c.key === key);
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
      onSort={() => toggleSort(k)}
      align={align}
      className={className}
    />
  );

  const mobileSortOptions: Array<{ id: string; label: string }> =
    experienceMode === 'simple'
      ? [
          { id: 'ptsBase', label: 'Puntos' },
          { id: 'ptsWin', label: `Últ. ${windowSize} PJ` },
          { id: 'rebBase', label: 'Rebotes' },
          { id: 'astBase', label: 'Asistencias' },
          { id: 'tsPct', label: 'Acierto TS%' },
          { id: 'minBase', label: 'Minutos' },
        ]
      : activeLayerColumns.slice(0, 7).map((col) => ({
          id: col.key,
          label: formatPlayerColHeader(col, statMode, windowSize),
        }));

  const mobileCardHeight = experienceMode === 'simple' ? 152 : 124;
  const mobileContainerHeight = 580;
  const mobileStartIndex = Math.max(0, Math.floor(mobileScrollTop / mobileCardHeight) - 4);
  const mobileVisibleCount = Math.ceil(mobileContainerHeight / mobileCardHeight) + 8;
  const mobileEndIndex = Math.min(filtered.length, mobileStartIndex + mobileVisibleCount);
  const mobileTopSpacer = mobileStartIndex * mobileCardHeight;
  const mobileBottomSpacer = Math.max(0, (filtered.length - mobileEndIndex) * mobileCardHeight);
  const mobileVisiblePlayers = useMemo(
    () => filtered.slice(mobileStartIndex, mobileEndIndex),
    [filtered, mobileStartIndex, mobileEndIndex]
  );

  const getToneTextClass = (col: PlayerColDef, r: EnrichedPlayerRow): string => {
    const t = col.tone ? col.tone(r) : 'neutral';
    if (t === 'positive') return 'text-emerald-400 font-medium';
    if (t === 'negative') return 'text-rose-400 font-medium';
    if (t === 'accent') return 'text-orange-300 font-semibold';
    if (t === 'warning') return 'text-amber-300';
    return 'text-slate-200';
  };

  return (
    <div className="space-y-5">
      {/* Row 1: Homogeneous 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Jugadores (NBA.com)</span>
            <MetricInfoTooltip helpKey="ptsBase" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {players.length}
            <span className="text-xs sm:text-sm text-slate-500 font-normal">
              {' '}
              / {Math.max(players.length, totalLeaguePlayersAvailable)}
            </span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {statMode === 'totals'
              ? `Media NBA: ${activePtsBenchmark.mean.toFixed(0)} PTS totales`
              : `Media NBA: ${benchmarks.player.pts.mean.toFixed(1)} PTS/PJ`}
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Máximo anotador</span>
            <MetricInfoTooltip helpKey="ptsBase" align="right" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.topScorer && (
              <PlayerAvatar
                playerId={summary.topScorer.id}
                name={summary.topScorer.name}
                headshotUrl={summary.topScorer.headshotUrl}
                teamAbbr={summary.topScorer.teamAbbr}
                showTeamBadge
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.topScorer?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
                {summary?.topScorer
                  ? `${summary.topScorer.ptsBase.toFixed(statMode === 'totals' ? 0 : 1)} PTS${statMode === 'totals' ? ' tot.' : '/PJ'} · Élite NBA`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple' ? 'Más jugadas asume' : 'Mayor Uso (USG%)'}
            </span>
            <MetricInfoTooltip helpKey="usgPct" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.topUsage && (
              <PlayerAvatar
                playerId={summary.topUsage.id}
                name={summary.topUsage.name}
                headshotUrl={summary.topUsage.headshotUrl}
                teamAbbr={summary.topUsage.teamAbbr}
                showTeamBadge
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.topUsage?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
                {summary?.topUsage
                  ? experienceMode === 'simple'
                    ? `${summary.topUsage.usgPct.toFixed(1)}% ataques · 1ª Estrella`
                    : `${summary.topUsage.usgPct.toFixed(1)}% USG · ${summary.topUsage.gmSc.toFixed(1)} GmSc`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">
              {experienceMode === 'simple' ? 'Impacto total' : 'Mayor Impacto (PIE)'}
            </span>
            <MetricInfoTooltip helpKey="pie" align="right" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.topPie && (
              <PlayerAvatar
                playerId={summary.topPie.id}
                name={summary.topPie.name}
                headshotUrl={summary.topPie.headshotUrl}
                teamAbbr={summary.topPie.teamAbbr}
                showTeamBadge
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-slate-100 truncate leading-tight">
                {summary?.topPie?.name || '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-slate-300 truncate">
                {summary?.topPie
                  ? experienceMode === 'simple'
                    ? `Impacto ${summary.topPie.pie.toFixed(1)}% · Nivel MVP`
                    : `${summary.topPie.pie.toFixed(1)}% PIE · Net ${formatSigned(summary.topPie.netRtg)}`
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Layer Switcher (10 Capas) + Metric Customizer + Search */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3.5 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
          {experienceMode === 'simple' ? (
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <span className="text-xs text-slate-300">
                Vista clara con traducción humana y barra frente a la Media de la NBA.
              </span>
              <button
                type="button"
                onClick={onSwitchToAdvanced}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap shrink-0"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Ver las 10 capas estadísticas oficiales NBA.com</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1.5 flex-1 min-w-0">
              <span className="text-xs text-slate-400 block">
                Capas estadísticas NBA.com (10 módulos · personaliza columnas en cada capa):
              </span>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                {PLAYER_LAYERS.map((m) => (
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

          {!allPlayersLoaded && totalLeaguePlayersAvailable > players.length && (
            <div className="inline-flex items-center gap-1.5 self-start shrink-0">
              <button
                type="button"
                disabled={loadingAllPlayers}
                onClick={onLoadAllPlayers}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#283548] rounded-lg text-orange-300 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <Users className="w-3.5 h-3.5 text-orange-400" />
                <span>
                  {loadingAllPlayers
                    ? 'Cargando censo...'
                    : `Ampliar censo (+${totalLeaguePlayersAvailable - players.length} → ${totalLeaguePlayersAvailable} NBA)`}
                </span>
              </button>
              <MetricInfoTooltip helpKey="loadFullLeagueCensus" align="right" />
            </div>
          )}
        </div>

        {/* Per-Layer Metric Customizer (Poner/Quitar estadísticas) */}
        {experienceMode === 'advanced' && (
          <div className="pt-2 border-t border-[#1E293B]">
            <LayerColumnCustomizer
              columns={PLAYER_COLUMNS_BY_LAYER[viewMode]
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

        <div className="pt-2.5 border-t border-[#1E293B] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => void handleQueryChange(e.target.value)}
              placeholder="Buscar jugador (Jokic, Doncic, Aldama)..."
              className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
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
              onBuildImage={handleBuildPlayersSnapshot}
              disabled={filtered.length === 0}
            />
          </div>
        </div>
      </div>

      <UnifiedEntityFilterBar
        filters={unifiedFilters}
        onChange={setUnifiedFilters}
        players={players}
        teams={teams}
        entityScope="player"
        shownCount={filtered.length}
        totalCount={rows.length}
        unitLabel="jugadores"
      />

      {/* On-demand NBA Player Loader Banner */}
      {query.trim().length >= 2 && (unaddedRemote.length > 0 || searchingRemote) && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-300">
            {searchingRemote
              ? 'Buscando en la base oficial NBA.com...'
              : 'Añadir jugador adicional a la sesión actual:'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {unaddedRemote.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={addingPlayerId === item.id}
                onClick={() => void onAddExternalPlayer(item)}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#283548] rounded-md text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                <PlayerAvatar
                  playerId={item.id}
                  name={item.name}
                  teamAbbr={item.teamAbbr}
                  size="xs"
                />
                <span>
                  {addingPlayerId === item.id
                    ? `Cargando ${item.name}...`
                    : `${item.name} · ${item.teamAbbr}`}
                </span>
                <Plus className="w-3.5 h-3.5 text-orange-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Row 3: Homogeneous Player Data Table */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-200">
              Ningún jugador en tabla coincide con el filtro actual.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Usa el buscador superior o pulsa en cargar toda la liga para incluir jugadores de rotación profunda.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Sort Strip + Virtualized Player Cards (< md) */}
            <div className="md:hidden">
              <div className="px-3.5 py-2 bg-[#0F172A]/70 border-b border-[#1E293B] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                  Ordenar ({filtered.length}):
                </span>
                {mobileSortOptions.map((opt) => {
                  const active = sortKey === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleSort(opt.id)}
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

              <div
                className="max-h-[580px] overflow-y-auto divide-y divide-[#1E293B]"
                onScroll={(e) => setMobileScrollTop(e.currentTarget.scrollTop)}
              >
                {mobileTopSpacer > 0 && (
                  <div style={{ height: `${mobileTopSpacer}px` }} aria-hidden="true" />
                )}
                {mobileVisiblePlayers.map((p) => {
                  const wKey = `player:${p.id}`;
                  const watched = watchlistIds.has(wKey);
                  const roleHint = qualifyUsageRole(p.usgPct);
                  const formHint = qualifyRecentDelta(p.pctDelta);
                  const topMobileCols = activeLayerColumns.slice(0, 4);
                  const highlightCol =
                    activeLayerColumns.find((c) => c.key === sortKey) || activeLayerColumns[0];

                  return (
                    <div
                      key={p.id}
                      onClick={() => onInspectEntity('player', p.id)}
                      style={{ height: `${mobileCardHeight}px` }}
                      className="px-3.5 py-2.5 hover:bg-[#182338] active:bg-[#182338] cursor-pointer transition-colors flex flex-col justify-between overflow-hidden"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            aria-label="Alternar seguimiento"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleWatchlist(wKey);
                            }}
                            className="p-2 -m-1.5 rounded text-slate-400 hover:text-orange-400 shrink-0 touch-manipulation"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                watched ? 'fill-orange-400 text-orange-400' : ''
                              }`}
                            />
                          </button>
                          <PlayerAvatar
                            playerId={p.id}
                            name={p.name}
                            headshotUrl={p.headshotUrl}
                            teamAbbr={p.teamAbbr}
                            showTeamBadge
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-100 truncate flex items-center gap-1.5">
                              <span className="truncate">{p.name}</span>
                              {showHeroicBadges && p.buzzerBeaters > 0 && (
                                <span
                                  title={`${p.buzzerBeaters} Buzzer Beater(s) oficiales (0.0s)`}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30 shrink-0"
                                >
                                  ⚡ {p.buzzerBeaters} BB
                                </span>
                              )}
                              {showHeroicBadges && p.gameWinners > 0 && (
                                <span
                                  title={`${p.gameWinners} Game Winner(s) oficiales (≤10s)`}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0"
                                >
                                  🎯 {p.gameWinners} GW
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              <span>
                                {p.teamAbbr} · {p.position} · {p.games.length} PJ
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span className={roleHint.textClass}>{roleHint.label}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono tabular-nums shrink-0">
                          {experienceMode === 'simple' || viewMode === 'basic' ? (
                            <>
                              <div className="text-sm font-bold text-slate-100">
                                {p.ptsBase.toFixed(statMode === 'totals' ? 0 : 1)} PTS
                              </div>
                              <div className={`text-[11px] ${formHint.textClass}`}>
                                Últ.{windowSize}: {p.ptsWin.toFixed(statMode === 'totals' ? 0 : 1)}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-sm font-bold text-orange-300">
                                {highlightCol ? highlightCol.format(p) : p.ptsBase.toFixed(statMode === 'totals' ? 0 : 1)}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[90px]">
                                {highlightCol ? formatPlayerColHeader(highlightCol, statMode, windowSize) : 'PTS'}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {experienceMode === 'simple' ? (
                        <>
                          <div className="grid grid-cols-4 gap-1.5 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-1.5 text-xs">
                            <div>
                              <div className="text-[10px] text-slate-400">MIN</div>
                              <div className="font-mono tabular-nums text-slate-200">
                                {p.minBase.toFixed(1)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">REB</div>
                              <div className="font-mono tabular-nums text-slate-200">
                                {p.rebBase.toFixed(statMode === 'totals' ? 0 : 1)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">AST</div>
                              <div className="font-mono tabular-nums text-slate-200">
                                {p.astBase.toFixed(statMode === 'totals' ? 0 : 1)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400">TS%</div>
                              <div className="font-mono tabular-nums text-emerald-300">
                                {p.tsPct.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                          <NbaComparisonBar
                            value={p.ptsBase}
                            benchmark={activePtsBenchmark}
                            compact
                          />
                        </>
                      ) : (
                        <div className="grid grid-cols-4 gap-1.5 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-1.5 text-xs">
                          {topMobileCols.map((col, idx) => (
                            <div key={col.key} className={idx === 3 ? 'text-right' : undefined}>
                              <div className="text-[10px] text-slate-400 truncate">
                                {formatPlayerColHeader(col, statMode, windowSize)}
                              </div>
                              <div className={`font-mono tabular-nums truncate ${getToneTextClass(col, p)}`}>
                                {col.format(p)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {mobileBottomSpacer > 0 && (
                  <div style={{ height: `${mobileBottomSpacer}px` }} aria-hidden="true" />
                )}
              </div>
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
                      onSort={() => toggleSort('watched')}
                      align="left"
                      className="py-3 pl-4 pr-2 w-12"
                      compact
                    />
                    <SortableTh
                      label="Jugador y Rol"
                      active={sortKey === 'name'}
                      asc={sortAsc}
                      onSort={() => toggleSort('name')}
                      align="left"
                      className="py-3 px-3"
                    />

                    {experienceMode === 'simple' ? (
                      <>
                        <SH label="Minutos" k="minBase" />
                        <SH label="Puntos" k="ptsBase" />
                        <SH label={`Últ. ${windowSize} PJ`} k="ptsWin" />
                        <SH label="Rebotes" k="rebBase" />
                        <SH label="Asistencias" k="astBase" />
                        <SH label="Acierto Real" k="tsPct" />
                        <SH
                          label="Nivel anotador vs Media NBA"
                          k="ptsVsNba"
                          helpKey="vsLeagueBar"
                          align="left"
                          className="py-3 pl-3 pr-4 w-56"
                        />
                      </>
                    ) : (
                      activeLayerColumns.map((col, idx) => (
                        <SH
                          key={col.key}
                          label={formatPlayerColHeader(col, statMode, windowSize)}
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
                </thead>
                <tbody className="divide-y divide-[#1E293B] text-sm">
                  {filtered.map((p) => {
                    const wKey = `player:${p.id}`;
                    const watched = watchlistIds.has(wKey);
                    const roleHint = qualifyUsageRole(p.usgPct);
                    const formHint = qualifyRecentDelta(p.pctDelta);
                    const tsEval = evaluateVsLeague(p.tsPct, benchmarks.player.tsPct);

                    return (
                      <tr
                        key={p.id}
                        onClick={() => onInspectEntity('player', p.id)}
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
                            <PlayerAvatar
                              playerId={p.id}
                              name={p.name}
                              headshotUrl={p.headshotUrl}
                              teamAbbr={p.teamAbbr}
                              showTeamBadge
                              size="sm"
                            />
                            <div>
                              <div className="font-medium text-slate-100 whitespace-nowrap flex items-center gap-1.5">
                                <span>{p.name}</span>
                                {showHeroicBadges && p.buzzerBeaters > 0 && (
                                  <span
                                    title={`${p.buzzerBeaters} Buzzer Beater(s) oficiales (0.0s)`}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30"
                                  >
                                    ⚡ {p.buzzerBeaters} BB
                                  </span>
                                )}
                                {showHeroicBadges && p.gameWinners > 0 && (
                                  <span
                                    title={`${p.gameWinners} Game Winner(s) oficiales (≤10s)`}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                  >
                                    🎯 {p.gameWinners} GW
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 whitespace-nowrap">
                                <span>
                                  {p.teamAbbr} · {p.position} · {p.games.length} PJ
                                </span>
                                <span aria-hidden="true"> · </span>
                                <span className={roleHint.textClass}>{roleHint.label}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {experienceMode === 'simple' ? (
                          <>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              {p.minBase.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                              {p.ptsBase.toFixed(statMode === 'totals' ? 0 : 1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                              <div className="font-mono tabular-nums font-semibold text-slate-100">
                                {p.ptsWin.toFixed(statMode === 'totals' ? 0 : 1)}
                              </div>
                              <div className={`text-[11px] ${formHint.textClass}`}>
                                {p.pctDelta > 2 ? '▲ ' : p.pctDelta < -2 ? '▼ ' : ''}
                                {formHint.label}
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                              {p.rebBase.toFixed(statMode === 'totals' ? 0 : 1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                              {p.astBase.toFixed(statMode === 'totals' ? 0 : 1)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                              <div className="font-mono tabular-nums text-slate-100">
                                {p.tsPct.toFixed(1)}%
                              </div>
                              <div className={`text-[11px] ${tsEval.textClass}`}>
                                {tsEval.tierLabel}
                              </div>
                            </td>
                            <td className="py-2.5 pl-3 pr-4">
                              <NbaComparisonBar
                                value={p.ptsBase}
                                benchmark={activePtsBenchmark}
                                compact
                              />
                            </td>
                          </>
                        ) : (
                          activeLayerColumns.map((col, idx) => (
                            <td
                              key={col.key}
                              className={`${
                                idx === activeLayerColumns.length - 1
                                  ? 'py-2.5 pl-2.5 pr-4'
                                  : 'py-2.5 px-2.5'
                              } ${col.align === 'left' ? 'text-left font-sans' : 'text-right font-mono tabular-nums'} whitespace-nowrap ${getToneTextClass(col, p)}`}
                            >
                              {col.format(p)}
                            </td>
                          ))
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
