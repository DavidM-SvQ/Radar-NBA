import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type {
  InjuriesRotationPayload,
  InjuryPlayerReportItem,
  NbaClutchEntry,
  NbaDefenseHustleEntry,
  NbaFourFactorsEntry,
  NbaLineupEntry,
  NbaPlaytypeEntitySummary,
  NbaScoringSplitsEntry,
  NbaShotZonesEntry,
  NbaTrackingEntry,
  NbaViolationsEntry,
  TeamSummary,
} from '../types/nba';
import {
  DEFAULT_UNIFIED_FILTERS,
  matchesLineupUnifiedFilters,
  type UnifiedTableFiltersState,
} from '../utils/entityFilters';
import { UnifiedEntityFilterBar } from './UnifiedEntityFilterBar';
import { TeamLogo } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import { LayerColumnCustomizer } from './LayerColumnCustomizer';
import { formatSigned, mean, normalizeSearchText, round1 } from '../utils/analytics';
import { MetricInfoTooltip, SortableTh } from './MetricUiHelpers';
import { STICKY_THEAD_CLASS, compareSortValues } from '../utils/tableSort';
import {
  buildTableSnapshotBlob,
  type TableSnapshotCell,
} from '../utils/exportImageCard';

import {
  buildInjuriesLookupIndex,
  normalizeInjuryLookupName,
} from '../utils/injuriesClient';
import { InjuryStatusBadge } from './InjuryStatusBadge';

interface LineupsExplorerViewProps {
  teams: TeamSummary[];
  seasonToken: string;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  injuriesData?: InjuriesRotationPayload | null;
}

type LineupTableView =
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

type StatScaleMode = 'per_game' | 'totals';

interface LineupLayerDef {
  id: LineupTableView;
  label: string;
  defaultSortKey: string;
  defaultCols: string[];
}

interface EnrichedLineupRow extends NbaLineupEntry {
  statMode: StatScaleMode;
  minPg: number;
  wPctPct: number;
  ptsVal: number;
  rebVal: number;
  orebVal: number;
  drebVal: number;
  astVal: number;
  stlVal: number;
  blkVal: number;
  tovVal: number;
  pfVal: number;
  pfdVal: number;
  blkaVal: number;
  fgmVal: number;
  fgaVal: number;
  fg3mVal: number;
  fg3aVal: number;
  ftmVal: number;
  ftaVal: number;
  plusMinusVal: number;
  fgPctVal: number;
  fg3PctVal: number;
  ftPctVal: number;
}

interface LineupColDef {
  key: string;
  label: string;
  helpKey?: string;
  align?: 'left' | 'right';
  isString?: boolean;
  lowerIsBetter?: boolean;
  decimals?: number;
  suffix?: string;
  signed?: boolean;
  getNumValue: (r: EnrichedLineupRow) => number | null;
  getStrValue?: (r: EnrichedLineupRow) => string;
  format: (r: EnrichedLineupRow) => string;
  tone?: (r: EnrichedLineupRow) => 'positive' | 'negative' | 'accent' | 'warning' | 'neutral';
}

const STORAGE_LINEUP_COLS_KEY = 'radarnba_cols_lineups_v2';
const STORAGE_LINEUP_STAT_MODE_KEY = 'radarnba_lineups_stat_mode_v1';

const round2 = (v: number): number => Math.round(v * 100) / 100;

function loadLineupStatMode(): StatScaleMode {
  try {
    const raw = localStorage.getItem(STORAGE_LINEUP_STAT_MODE_KEY);
    return raw === 'totals' ? 'totals' : 'per_game';
  } catch {
    return 'per_game';
  }
}

const LINEUP_LAYERS: LineupLayerDef[] = [
  {
    id: 'basic',
    label: '1. Básicas & Caja',
    defaultSortKey: 'min',
    defaultCols: ['gp', 'wPctPct', 'min', 'ptsVal', 'rebVal', 'orebVal', 'astVal', 'stlVal', 'blkVal', 'tovVal', 'fgPctVal', 'fg3PctVal', 'plusMinusVal'],
  },
  {
    id: 'advanced',
    label: '2. Ratings y 4 Factores',
    defaultSortKey: 'netRtg',
    defaultCols: ['gp', 'min', 'offRtg', 'defRtg', 'netRtg', 'pace', 'efgPct', 'tsPct', 'tovPct', 'orebPct', 'ftaRate', 'oppEfgPct', 'oppTovPct', 'pie'],
  },
  {
    id: 'scoring',
    label: '3. Tiro y Scoring Splits',
    defaultSortKey: 'pctPts3pt',
    defaultCols: ['fgPctVal', 'fg3PctVal', 'ftPctVal', 'pctFga2pt', 'pctFga3pt', 'pctPts2pt', 'pctPts2ptMr', 'pctPts3pt', 'pctPtsFb', 'pctPtsFt', 'pctPtsOffTov', 'pctPtsPaint', 'pctAstFgm', 'pctUastFgm'],
  },
  {
    id: 'zones',
    label: '4. Zonas de Tiro (Shot Zones)',
    defaultSortKey: 'raFgPct',
    defaultCols: ['raFgm', 'raFga', 'raFgPct', 'paintNonRaFgPct', 'midFgPct', 'lc3FgPct', 'rc3FgPct', 'corner3FgPct', 'ab3Fga', 'ab3FgPct', 'totalThreeFga', 'threeFgPct'],
  },
  {
    id: 'tracking',
    label: '5. Tracking Óptico Colectivo',
    defaultSortKey: 'drives',
    defaultCols: ['drives', 'drivePts', 'driveFgPct', 'catchShootPts', 'catchShootFg3Pct', 'pullUpPts', 'pullUpFg3Pct', 'passesMade', 'potentialAst', 'astPtsCreated', 'touches', 'distMiles', 'rebChances'],
  },
  {
    id: 'hustle',
    label: '6. Hustle y Pintura',
    defaultSortKey: 'ptsPaint',
    defaultCols: ['ptsPaint', 'pts2ndChance', 'ptsFastBreak', 'ptsOffTov', 'contestedShots', 'contestedShots2pt', 'contestedShots3pt', 'deflections', 'chargesDrawn', 'screenAssists', 'screenAstPts', 'looseBalls', 'boxOuts'],
  },
  {
    id: 'defense',
    label: '7. Defensa y Stats Rival',
    defaultSortKey: 'defRtg',
    defaultCols: ['defRtg', 'drebPct', 'stlVal', 'blkVal', 'dFgPct', 'normalFgPct', 'pctPlusMinus', 'oppPts', 'oppFgPct', 'oppFg3Pct', 'oppReb', 'oppAst', 'oppTov', 'oppPtsPaint', 'oppPtsFb'],
  },
  {
    id: 'clutch',
    label: '8. Clutch (<5m, ±5)',
    defaultSortKey: 'clNetRtg',
    defaultCols: ['clGp', 'clW', 'clL', 'clWPct', 'clMin', 'clPts', 'clFgPct', 'clFg3Pct', 'clFtPct', 'clOffRtg', 'clDefRtg', 'clNetRtg', 'clTsPct'],
  },
  {
    id: 'playtypes',
    label: '9. Playtypes (Synergy)',
    defaultSortKey: 'ptTopPpp',
    defaultCols: ['ptTotalPoss', 'ptTopLabel', 'ptTopPpp', 'ptSpotupPpp', 'ptSpotupPct', 'ptPrbhPpp', 'ptPrbhPct', 'ptTransPpp', 'ptIsoPpp', 'ptPrrPpp', 'ptCutPpp', 'ptPostPpp', 'ptHandoffPpp'],
  },
  {
    id: 'violations',
    label: '10. Infracciones y Faltas',
    defaultSortKey: 'totalViolations',
    defaultCols: ['totalViolations', 'pfVal', 'pfdVal', 'blkaVal', 'tovVal', 'travel', 'doubleDribble', 'offThreeSec', 'defThreeSec', 'shotClock', 'backcourt', 'offFoul', 'chargeViol', 'kickedBall', 'ptsPaint', 'oppPtsPaint'],
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
  if (
    (a === 'offrebound' || a === 'putback' || a === 'putbacks') &&
    (b === 'offrebound' || b === 'putback' || b === 'putbacks')
  ) {
    return true;
  }
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

const LINEUP_COLUMNS_BY_LAYER: Record<LineupTableView, LineupColDef[]> = {
  basic: [
    { key: 'gp', label: 'PJ', helpKey: 'gamesPlayed', decimals: 0, getNumValue: (r) => r.gp, format: (r) => String(r.gp) },
    { key: 'w', label: 'V', helpKey: 'winPct', decimals: 0, getNumValue: (r) => r.w, format: (r) => String(r.w), tone: () => 'positive' },
    { key: 'l', label: 'D', helpKey: 'winPct', lowerIsBetter: true, decimals: 0, getNumValue: (r) => r.l, format: (r) => String(r.l), tone: () => 'negative' },
    { key: 'wPctPct', label: 'Balance (%V)', helpKey: 'winPct', suffix: '%', getNumValue: (r) => r.wPctPct, format: (r) => `${r.w}-${r.l} (${r.wPctPct.toFixed(1)}%)` },
    { key: 'min', label: 'MIN/PJ', helpKey: 'minutesPerGame', decimals: 1, getNumValue: (r) => r.min, format: (r) => r.min.toFixed(1) },
    { key: 'poss', label: 'Posesiones', helpKey: 'paceSimple', decimals: 0, getNumValue: (r) => numOrNull(r.poss), format: (r) => fmtNum(numOrNull(r.poss), 0) },
    { key: 'ptsVal', label: 'PTS/PJ', helpKey: 'ptsPerGame', getNumValue: (r) => r.ptsVal, format: (r) => r.ptsVal.toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'rebVal', label: 'REB/PJ', helpKey: 'rebBase', getNumValue: (r) => r.rebVal, format: (r) => r.rebVal.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'orebVal', label: 'OR/PJ', helpKey: 'orebBase', getNumValue: (r) => r.orebVal, format: (r) => r.orebVal.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'drebVal', label: 'DR/PJ', helpKey: 'drebBase', getNumValue: (r) => r.drebVal, format: (r) => r.drebVal.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'astVal', label: 'AST/PJ', helpKey: 'astBase', getNumValue: (r) => r.astVal, format: (r) => r.astVal.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'stlVal', label: 'ROB/PJ', helpKey: 'steals', getNumValue: (r) => r.stlVal, format: (r) => r.stlVal.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'blkVal', label: 'TAP/PJ', helpKey: 'blocks', getNumValue: (r) => r.blkVal, format: (r) => r.blkVal.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'tovVal', label: 'PER/PJ', helpKey: 'tov', lowerIsBetter: true, getNumValue: (r) => r.tovVal, format: (r) => r.tovVal.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'fgPctVal', label: 'TC%', helpKey: 'fgPct', suffix: '%', getNumValue: (r) => r.fgPctVal, format: (r) => `${r.fgPctVal.toFixed(1)}%` },
    { key: 'fg3PctVal', label: '3P%', helpKey: 'fg3Pct', suffix: '%', getNumValue: (r) => r.fg3PctVal, format: (r) => `${r.fg3PctVal.toFixed(1)}%` },
    { key: 'ftPctVal', label: 'TL%', helpKey: 'ftPct', suffix: '%', getNumValue: (r) => r.ftPctVal, format: (r) => `${r.ftPctVal.toFixed(1)}%` },
    { key: 'plusMinusVal', label: '+/-', helpKey: 'plusMinus', signed: true, getNumValue: (r) => r.plusMinusVal, format: (r) => formatSigned(r.plusMinusVal, r.statMode === 'totals' ? 0 : 1), tone: (r) => (r.plusMinusVal >= 0 ? 'positive' : 'negative') },
  ],
  advanced: [
    { key: 'gp', label: 'PJ', helpKey: 'gamesPlayed', decimals: 0, getNumValue: (r) => r.gp, format: (r) => String(r.gp) },
    { key: 'min', label: 'MIN/PJ', helpKey: 'minutesPerGame', decimals: 1, getNumValue: (r) => r.min, format: (r) => r.min.toFixed(1) },
    { key: 'offRtg', label: 'OffRtg', helpKey: 'offRtg', getNumValue: (r) => r.advFourFactors?.offRtg ?? r.offRtg, format: (r) => (r.advFourFactors?.offRtg ?? r.offRtg).toFixed(1) },
    { key: 'defRtg', label: 'DefRtg', helpKey: 'defRtg', lowerIsBetter: true, getNumValue: (r) => r.advFourFactors?.defRtg ?? r.defRtg, format: (r) => (r.advFourFactors?.defRtg ?? r.defRtg).toFixed(1) },
    { key: 'netRtg', label: 'NetRtg', helpKey: 'netRtg', signed: true, getNumValue: (r) => r.advFourFactors?.netRtg ?? r.netRtg, format: (r) => formatSigned(r.advFourFactors?.netRtg ?? r.netRtg), tone: (r) => ((r.advFourFactors?.netRtg ?? r.netRtg) >= 0 ? 'positive' : 'negative') },
    { key: 'pace', label: 'Pace', helpKey: 'paceSimple', getNumValue: (r) => r.advFourFactors?.pace ?? r.pace, format: (r) => (r.advFourFactors?.pace ?? r.pace).toFixed(1) },
    { key: 'efgPct', label: 'eFG%', helpKey: 'efgPct', suffix: '%', getNumValue: (r) => r.advFourFactors?.efgPct ?? r.efgPct, format: (r) => `${(r.advFourFactors?.efgPct ?? r.efgPct).toFixed(1)}%` },
    { key: 'tsPct', label: 'TS%', helpKey: 'tsPct', suffix: '%', getNumValue: (r) => r.advFourFactors?.tsPct ?? r.tsPct, format: (r) => `${(r.advFourFactors?.tsPct ?? r.tsPct).toFixed(1)}%`, tone: () => 'accent' },
    { key: 'tovPct', label: 'TOV%', helpKey: 'tovPct', lowerIsBetter: true, suffix: '%', getNumValue: (r) => r.advFourFactors?.tmTovPct ?? r.tovPct, format: (r) => `${(r.advFourFactors?.tmTovPct ?? r.tovPct).toFixed(1)}%` },
    { key: 'orebPct', label: 'OREB%', helpKey: 'orebPct', suffix: '%', getNumValue: (r) => r.advFourFactors?.orebPct ?? r.orebPct, format: (r) => `${(r.advFourFactors?.orebPct ?? r.orebPct).toFixed(1)}%` },
    { key: 'drebPct', label: 'DREB%', helpKey: 'drebPct', suffix: '%', getNumValue: (r) => r.advFourFactors?.drebPct ?? r.drebPct, format: (r) => `${(r.advFourFactors?.drebPct ?? r.drebPct).toFixed(1)}%` },
    { key: 'rebPct', label: 'REB%', helpKey: 'rebPct', suffix: '%', getNumValue: (r) => r.advFourFactors?.rebPct ?? r.rebPct, format: (r) => `${(r.advFourFactors?.rebPct ?? r.rebPct).toFixed(1)}%` },
    { key: 'ftaRate', label: 'FTA Rate', helpKey: 'ftRate', decimals: 3, getNumValue: (r) => numOrNull(r.advFourFactors?.ftaRate ?? r.ftaRate), format: (r) => fmtNum(numOrNull(r.advFourFactors?.ftaRate ?? r.ftaRate), 3) },
    { key: 'oppEfgPct', label: 'Opp eFG%', helpKey: 'oppFourFactors', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advFourFactors?.oppEfgPct ?? r.oppEfgPct), format: (r) => fmtNum(numOrNull(r.advFourFactors?.oppEfgPct ?? r.oppEfgPct), 1, '%') },
    { key: 'oppTovPct', label: 'Opp TOV%', helpKey: 'oppFourFactors', suffix: '%', getNumValue: (r) => numOrNull(r.advFourFactors?.oppTovPct ?? r.oppTovPct), format: (r) => fmtNum(numOrNull(r.advFourFactors?.oppTovPct ?? r.oppTovPct), 1, '%') },
    { key: 'oppOrebPct', label: 'Opp OREB%', helpKey: 'oppFourFactors', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advFourFactors?.oppOrebPct ?? r.oppOrebPct), format: (r) => fmtNum(numOrNull(r.advFourFactors?.oppOrebPct ?? r.oppOrebPct), 1, '%') },
    { key: 'oppFtaRate', label: 'Opp FTr', helpKey: 'oppFourFactors', lowerIsBetter: true, decimals: 3, getNumValue: (r) => numOrNull(r.advFourFactors?.oppFtaRate ?? r.oppFtaRate), format: (r) => fmtNum(numOrNull(r.advFourFactors?.oppFtaRate ?? r.oppFtaRate), 3) },
    { key: 'astPct', label: 'AST%', helpKey: 'astPct', suffix: '%', getNumValue: (r) => r.astPct, format: (r) => `${r.astPct.toFixed(1)}%` },
    { key: 'astRatio', label: 'AST Ratio', helpKey: 'astRatio', getNumValue: (r) => numOrNull(r.astRatio), format: (r) => fmtNum(numOrNull(r.astRatio), 1) },
    { key: 'astTo', label: 'AST/TO', helpKey: 'astTo', decimals: 2, getNumValue: (r) => r.astTo, format: (r) => r.astTo.toFixed(2) },
    { key: 'pie', label: 'PIE%', helpKey: 'pie', suffix: '%', getNumValue: (r) => r.advFourFactors?.pie ?? r.pie, format: (r) => `${(r.advFourFactors?.pie ?? r.pie).toFixed(1)}%`, tone: () => 'positive' },
  ],
  scoring: [
    { key: 'fgPctVal', label: 'TC% (FG%)', helpKey: 'fgPct', suffix: '%', getNumValue: (r) => r.fgPctVal, format: (r) => `${r.fgPctVal.toFixed(1)}%` },
    { key: 'fg3PctVal', label: '3P%', helpKey: 'fg3Pct', suffix: '%', getNumValue: (r) => r.fg3PctVal, format: (r) => `${r.fg3PctVal.toFixed(1)}%`, tone: () => 'positive' },
    { key: 'ftPctVal', label: 'TL% (FT%)', helpKey: 'ftPct', suffix: '%', getNumValue: (r) => r.ftPctVal, format: (r) => `${r.ftPctVal.toFixed(1)}%` },
    { key: 'pctFga2pt', label: '%FGA 2P', helpKey: 'pctFga2pt', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctFga2pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctFga2pt), 1, '%') },
    { key: 'pctFga3pt', label: '%FGA 3P', helpKey: 'pctFga3pt', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctFga3pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctFga3pt), 1, '%') },
    { key: 'pctPts2pt', label: '%PTS 2P', helpKey: 'pctPts2pt', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPts2pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPts2pt), 1, '%') },
    { key: 'pctPts2ptMr', label: '%PTS MidR', helpKey: 'pctPts2ptMr', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPts2ptMr), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPts2ptMr), 1, '%') },
    { key: 'pctPts3pt', label: '%PTS 3P', helpKey: 'pctPts3pt', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPts3pt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPts3pt), 1, '%'), tone: () => 'accent' },
    { key: 'pctPtsFb', label: '%PTS Contraat.', helpKey: 'pctPtsFb', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPtsFb), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsFb), 1, '%') },
    { key: 'pctPtsFt', label: '%PTS Libres', helpKey: 'pctPtsFt', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPtsFt), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsFt), 1, '%') },
    { key: 'pctPtsOffTov', label: '%PTS x Pérd.', helpKey: 'pctPtsOffTov', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPtsOffTov), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsOffTov), 1, '%') },
    { key: 'pctPtsPaint', label: '%PTS Pintura', helpKey: 'pctPtsPaint', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctPtsPaint), format: (r) => fmtNum(numOrNull(r.advScoring?.pctPtsPaint), 1, '%') },
    { key: 'pctAstFgm', label: '%Canastas Asist.', helpKey: 'pctAstFgm', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctAstFgm), format: (r) => fmtNum(numOrNull(r.advScoring?.pctAstFgm), 1, '%') },
    { key: 'pctUastFgm', label: '%No Asistidas', helpKey: 'pctUastFgm', suffix: '%', getNumValue: (r) => numOrNull(r.advScoring?.pctUastFgm), format: (r) => fmtNum(numOrNull(r.advScoring?.pctUastFgm), 1, '%') },
  ],
  zones: [
    { key: 'raFgm', label: 'Aro FGM/PJ', helpKey: 'restrictedArea', decimals: 1, getNumValue: (r) => numOrNull(r.advZones?.restrictedArea?.fgm), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fgm), r.statMode === 'totals' ? 0 : 1) },
    { key: 'raFga', label: 'Aro FGA/PJ', helpKey: 'restrictedArea', decimals: 1, getNumValue: (r) => numOrNull(r.advZones?.restrictedArea?.fga), format: (r) => fmtNum(numOrNull(r.advZones?.restrictedArea?.fga), r.statMode === 'totals' ? 0 : 1) },
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
    { key: 'totalThreeFga', label: 'Vol. 3PA/PJ', helpKey: 'fg3a', decimals: 1, getNumValue: (r) => numOrNull(r.advZones?.totalThreeFga), format: (r) => fmtNum(numOrNull(r.advZones?.totalThreeFga), r.statMode === 'totals' ? 0 : 1) },
    { key: 'threeFgPct', label: '3P% Zonas', helpKey: 'fg3Pct', suffix: '%', getNumValue: (r) => numOrNull(r.advZones?.threeFgPct), format: (r) => fmtNum(numOrNull(r.advZones?.threeFgPct), 1, '%') },
  ],
  tracking: [
    { key: 'drives', label: 'Drives', helpKey: 'drives', getNumValue: (r) => numOrNull(r.advTracking?.drives), format: (r) => fmtNum(numOrNull(r.advTracking?.drives), r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'drivePts', label: 'Drive PTS', helpKey: 'drives', getNumValue: (r) => numOrNull(r.advTracking?.drivePts), format: (r) => fmtNum(numOrNull(r.advTracking?.drivePts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'driveFgPct', label: 'Drive FG%', helpKey: 'drives', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.driveFgPct), format: (r) => fmtNum(numOrNull(r.advTracking?.driveFgPct), 1, '%') },
    { key: 'driveAstPct', label: 'Drive AST%', helpKey: 'drives', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.driveAstPct), format: (r) => fmtNum(numOrNull(r.advTracking?.driveAstPct), 1, '%') },
    { key: 'drivePassesPct', label: 'Drive Pase%', helpKey: 'drives', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.drivePassesPct), format: (r) => fmtNum(numOrNull(r.advTracking?.drivePassesPct), 1, '%') },
    { key: 'catchShootPts', label: 'C&S PTS', helpKey: 'catchShoot', getNumValue: (r) => numOrNull(r.advTracking?.catchShootPts), format: (r) => fmtNum(numOrNull(r.advTracking?.catchShootPts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'catchShootFg3Pct', label: 'C&S 3P%', helpKey: 'catchShoot', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.catchShootFg3Pct), format: (r) => fmtNum(numOrNull(r.advTracking?.catchShootFg3Pct), 1, '%'), tone: () => 'positive' },
    { key: 'pullUpPts', label: 'PullUp PTS', helpKey: 'pullUp', getNumValue: (r) => numOrNull(r.advTracking?.pullUpPts), format: (r) => fmtNum(numOrNull(r.advTracking?.pullUpPts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'pullUpFg3Pct', label: 'PullUp 3P%', helpKey: 'pullUp', suffix: '%', getNumValue: (r) => numOrNull(r.advTracking?.pullUpFg3Pct), format: (r) => fmtNum(numOrNull(r.advTracking?.pullUpFg3Pct), 1, '%') },
    { key: 'passesMade', label: 'Pases/PJ', helpKey: 'potentialAst', getNumValue: (r) => numOrNull(r.advTracking?.passesMade), format: (r) => fmtNum(numOrNull(r.advTracking?.passesMade), r.statMode === 'totals' ? 0 : 1) },
    { key: 'potentialAst', label: 'Ast. Potenc.', helpKey: 'potentialAst', getNumValue: (r) => numOrNull(r.advTracking?.potentialAst), format: (r) => fmtNum(numOrNull(r.advTracking?.potentialAst), r.statMode === 'totals' ? 0 : 1) },
    { key: 'astPtsCreated', label: 'PTS x Pase', helpKey: 'potentialAst', getNumValue: (r) => numOrNull(r.advTracking?.astPtsCreated), format: (r) => fmtNum(numOrNull(r.advTracking?.astPtsCreated), r.statMode === 'totals' ? 0 : 1) },
    { key: 'touches', label: 'Toques/PJ', helpKey: 'touches', getNumValue: (r) => numOrNull(r.advTracking?.touches), format: (r) => fmtNum(numOrNull(r.advTracking?.touches), r.statMode === 'totals' ? 0 : 1) },
    { key: 'avgSecPerTouch', label: 'Seg/Toque', helpKey: 'touches', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.avgSecPerTouch), format: (r) => fmtNum(numOrNull(r.advTracking?.avgSecPerTouch), 2) },
    { key: 'avgDribPerTouch', label: 'Botes/Toque', helpKey: 'touches', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.avgDribPerTouch), format: (r) => fmtNum(numOrNull(r.advTracking?.avgDribPerTouch), 2) },
    { key: 'distMiles', label: 'Dist. (mi)', helpKey: 'distMiles', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.distMiles), format: (r) => fmtNum(numOrNull(r.advTracking?.distMiles), r.statMode === 'totals' ? 1 : 2) },
    { key: 'avgSpeed', label: 'Vel. (mph)', helpKey: 'avgSpeed', decimals: 2, getNumValue: (r) => numOrNull(r.advTracking?.avgSpeed), format: (r) => fmtNum(numOrNull(r.advTracking?.avgSpeed), 2) },
    { key: 'rebChances', label: 'Oport. Reb', helpKey: 'rebChances', getNumValue: (r) => numOrNull(r.advTracking?.rebChances), format: (r) => fmtNum(numOrNull(r.advTracking?.rebChances), r.statMode === 'totals' ? 0 : 1) },
  ],
  hustle: [
    { key: 'ptsPaint', label: 'PTS Pintura', helpKey: 'ptsPaint', getNumValue: (r) => numOrNull(r.advDefHustle?.ptsPaint), format: (r) => fmtNum(numOrNull(r.advDefHustle?.ptsPaint), r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'pts2ndChance', label: '2ª Oportun.', helpKey: 'pts2ndChance', getNumValue: (r) => numOrNull(r.advDefHustle?.pts2ndChance), format: (r) => fmtNum(numOrNull(r.advDefHustle?.pts2ndChance), r.statMode === 'totals' ? 0 : 1) },
    { key: 'ptsFastBreak', label: 'Contraat.', helpKey: 'ptsFastBreak', getNumValue: (r) => numOrNull(r.advDefHustle?.ptsFb), format: (r) => fmtNum(numOrNull(r.advDefHustle?.ptsFb), r.statMode === 'totals' ? 0 : 1) },
    { key: 'ptsOffTov', label: 'PTS x Pérd.', helpKey: 'ptsOffTov', getNumValue: (r) => numOrNull(r.advDefHustle?.ptsOffTov), format: (r) => fmtNum(numOrNull(r.advDefHustle?.ptsOffTov), r.statMode === 'totals' ? 0 : 1) },
    { key: 'contestedShots', label: 'Punteados Tot', helpKey: 'contestedShots', getNumValue: (r) => numOrNull(r.advDefHustle?.contestedShots), format: (r) => fmtNum(numOrNull(r.advDefHustle?.contestedShots), r.statMode === 'totals' ? 0 : 1) },
    { key: 'contestedShots2pt', label: 'Punt. 2P', helpKey: 'contestedShots', getNumValue: (r) => numOrNull(r.advDefHustle?.contestedShots2pt), format: (r) => fmtNum(numOrNull(r.advDefHustle?.contestedShots2pt), r.statMode === 'totals' ? 0 : 1) },
    { key: 'contestedShots3pt', label: 'Punt. 3P', helpKey: 'contestedShots', getNumValue: (r) => numOrNull(r.advDefHustle?.contestedShots3pt), format: (r) => fmtNum(numOrNull(r.advDefHustle?.contestedShots3pt), r.statMode === 'totals' ? 0 : 1) },
    { key: 'deflections', label: 'Desvíos', helpKey: 'deflections', getNumValue: (r) => numOrNull(r.advDefHustle?.deflections), format: (r) => fmtNum(numOrNull(r.advDefHustle?.deflections), r.statMode === 'totals' ? 0 : 1), tone: () => 'positive' },
    { key: 'chargesDrawn', label: 'Cargas Prov.', helpKey: 'chargesDrawn', decimals: 2, getNumValue: (r) => numOrNull(r.advDefHustle?.chargesDrawn), format: (r) => fmtNum(numOrNull(r.advDefHustle?.chargesDrawn), r.statMode === 'totals' ? 0 : 2) },
    { key: 'screenAssists', label: 'Screen AST', helpKey: 'screenAssists', getNumValue: (r) => numOrNull(r.advDefHustle?.screenAssists), format: (r) => fmtNum(numOrNull(r.advDefHustle?.screenAssists), r.statMode === 'totals' ? 0 : 1) },
    { key: 'screenAstPts', label: 'Scr. AST PTS', helpKey: 'screenAstPts', getNumValue: (r) => numOrNull(r.advDefHustle?.screenAstPts), format: (r) => fmtNum(numOrNull(r.advDefHustle?.screenAstPts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'looseBalls', label: 'Bal. Sueltos', helpKey: 'looseBalls', getNumValue: (r) => numOrNull(r.advDefHustle?.looseBalls), format: (r) => fmtNum(numOrNull(r.advDefHustle?.looseBalls), r.statMode === 'totals' ? 0 : 1) },
    { key: 'boxOuts', label: 'Box-Outs Tot', helpKey: 'offBoxOuts', getNumValue: (r) => numOrNull(r.advDefHustle?.boxOuts), format: (r) => fmtNum(numOrNull(r.advDefHustle?.boxOuts), r.statMode === 'totals' ? 0 : 1) },
  ],
  defense: [
    { key: 'defRtg', label: 'DefRtg', helpKey: 'defRtg', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.defRating ?? r.defRtg), format: (r) => fmtNum(numOrNull(r.advDefHustle?.defRating ?? r.defRtg), 1) },
    { key: 'drebPct', label: 'DREB%', helpKey: 'drebPct', suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.drebPct ?? r.drebPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.drebPct ?? r.drebPct), 1, '%') },
    { key: 'stlVal', label: 'Robos/PJ', helpKey: 'steals', getNumValue: (r) => r.stlVal, format: (r) => r.stlVal.toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'positive' },
    { key: 'blkVal', label: 'Tapones/PJ', helpKey: 'blocks', getNumValue: (r) => r.blkVal, format: (r) => r.blkVal.toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'accent' },
    { key: 'dFgPct', label: 'DFG% Rival', helpKey: 'dFgPct', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.dFgPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.dFgPct), 1, '%') },
    { key: 'normalFgPct', label: 'FG% Esper.', helpKey: 'dFgPct', suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.normalFgPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.normalFgPct), 1, '%') },
    { key: 'pctPlusMinus', label: 'Diff% (DFG)', helpKey: 'dFgPct', lowerIsBetter: true, suffix: '%', signed: true, getNumValue: (r) => numOrNull(r.advDefHustle?.pctPlusMinus), format: (r) => fmtNum(numOrNull(r.advDefHustle?.pctPlusMinus), 1, '%', true), tone: (r) => ((r.advDefHustle?.pctPlusMinus ?? 0) <= -1.0 ? 'positive' : (r.advDefHustle?.pctPlusMinus ?? 0) >= 1.5 ? 'negative' : 'neutral') },
    { key: 'oppPts', label: 'Opp PTS', helpKey: 'avgPointsAgainst', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppPts), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPts), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppFgPct', label: 'Opp FG%', helpKey: 'oppStats', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.oppFgPct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppFgPct), 1, '%') },
    { key: 'oppFg3Pct', label: 'Opp 3P%', helpKey: 'oppStats', lowerIsBetter: true, suffix: '%', getNumValue: (r) => numOrNull(r.advDefHustle?.oppFg3Pct), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppFg3Pct), 1, '%') },
    { key: 'oppReb', label: 'Opp REB', helpKey: 'oppStats', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppReb), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppReb), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppAst', label: 'Opp AST', helpKey: 'oppStats', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppAst), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppAst), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppTov', label: 'Opp TOV', helpKey: 'oppStats', getNumValue: (r) => numOrNull(r.advDefHustle?.oppTov), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppTov), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPtsPaint', label: 'Opp Pintura', helpKey: 'oppPtsPaint', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppPtsPaint), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPtsPaint), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPtsFb', label: 'Opp Contraat.', helpKey: 'oppStats', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advDefHustle?.oppPtsFb), format: (r) => fmtNum(numOrNull(r.advDefHustle?.oppPtsFb), r.statMode === 'totals' ? 0 : 1) },
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
    { key: 'clOffRtg', label: 'OffRtg Cl.', helpKey: 'clutch', getNumValue: (r) => numOrNull(r.advClutch?.offRtg), format: (r) => fmtNum(numOrNull(r.advClutch?.offRtg), 1) },
    { key: 'clDefRtg', label: 'DefRtg Cl.', helpKey: 'clutch', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advClutch?.defRtg), format: (r) => fmtNum(numOrNull(r.advClutch?.defRtg), 1) },
    { key: 'clNetRtg', label: 'NetRtg Cl.', helpKey: 'clutch', signed: true, getNumValue: (r) => numOrNull(r.advClutch?.netRtg), format: (r) => fmtNum(numOrNull(r.advClutch?.netRtg), 1, '', true), tone: (r) => ((r.advClutch?.netRtg ?? 0) >= 0 ? 'positive' : 'negative') },
    { key: 'clTsPct', label: 'TS% Cl.', helpKey: 'clutch', suffix: '%', getNumValue: (r) => numOrNull(r.advClutch?.tsPct), format: (r) => fmtNum(numOrNull(r.advClutch?.tsPct), 1, '%') },
    { key: 'clEfgPct', label: 'eFG% Cl.', helpKey: 'clutch', suffix: '%', getNumValue: (r) => numOrNull(r.advClutch?.efgPct), format: (r) => fmtNum(numOrNull(r.advClutch?.efgPct), 1, '%') },
    { key: 'clPie', label: 'PIE% Cl.', helpKey: 'clutch', suffix: '%', getNumValue: (r) => numOrNull(r.advClutch?.pie), format: (r) => fmtNum(numOrNull(r.advClutch?.pie), 1, '%') },
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
  ],
  violations: [
    { key: 'totalViolations', label: 'Total Violac. (Tot)', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 2, getNumValue: (r) => numOrNull(r.advViolations?.totalViolations), format: (r) => fmtNum(numOrNull(r.advViolations?.totalViolations), r.statMode === 'totals' ? 0 : 2), tone: () => 'accent' },
    { key: 'pfVal', label: 'Faltas (PF/PJ)', helpKey: 'personalFouls', lowerIsBetter: true, getNumValue: (r) => r.pfVal, format: (r) => r.pfVal.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'pfdVal', label: 'Faltas Rec. (PFD/PJ)', helpKey: 'foulsDrawn', getNumValue: (r) => r.pfdVal, format: (r) => r.pfdVal.toFixed(r.statMode === 'totals' ? 0 : 1), tone: () => 'positive' },
    { key: 'blkaVal', label: 'Tap. Rec. (BLKA/PJ)', helpKey: 'blka', lowerIsBetter: true, getNumValue: (r) => r.blkaVal, format: (r) => r.blkaVal.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'tovVal', label: 'Pérdidas (TOV/PJ)', helpKey: 'tov', lowerIsBetter: true, getNumValue: (r) => r.tovVal, format: (r) => r.tovVal.toFixed(r.statMode === 'totals' ? 0 : 1) },
    { key: 'travel', label: 'Pasos (Tot)', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 2, getNumValue: (r) => numOrNull(r.advViolations?.travel), format: (r) => fmtNum(numOrNull(r.advViolations?.travel), r.statMode === 'totals' ? 0 : 2) },
    { key: 'doubleDribble', label: 'Dobles (Tot)', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 2, getNumValue: (r) => numOrNull(r.advViolations?.doubleDribble), format: (r) => fmtNum(numOrNull(r.advViolations?.doubleDribble), r.statMode === 'totals' ? 0 : 2) },
    { key: 'offThreeSec', label: '3s Zona Of.', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 2, getNumValue: (r) => numOrNull(r.advViolations?.offThreeSec), format: (r) => fmtNum(numOrNull(r.advViolations?.offThreeSec), r.statMode === 'totals' ? 0 : 2) },
    { key: 'defThreeSec', label: '3s Zona Def.', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 2, getNumValue: (r) => numOrNull(r.advViolations?.defThreeSec), format: (r) => fmtNum(numOrNull(r.advViolations?.defThreeSec), r.statMode === 'totals' ? 0 : 2) },
    { key: 'shotClock', label: 'Reloj 24s', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 2, getNumValue: (r) => numOrNull(r.advViolations?.shotClock), format: (r) => fmtNum(numOrNull(r.advViolations?.shotClock), r.statMode === 'totals' ? 0 : 2) },
    { key: 'backcourt', label: 'Campo Atrás', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 2, getNumValue: (r) => numOrNull(r.advViolations?.backcourt), format: (r) => fmtNum(numOrNull(r.advViolations?.backcourt), r.statMode === 'totals' ? 0 : 2) },
    { key: 'offFoul', label: 'Falta Ataque', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 2, getNumValue: (r) => numOrNull(r.advViolations?.offFoul), format: (r) => fmtNum(numOrNull(r.advViolations?.offFoul), r.statMode === 'totals' ? 0 : 2) },
    { key: 'chargeViol', label: 'Carga Of.', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 2, getNumValue: (r) => numOrNull(r.advViolations?.charge), format: (r) => fmtNum(numOrNull(r.advViolations?.charge), r.statMode === 'totals' ? 0 : 2) },
    { key: 'kickedBall', label: 'Pie (Kick Ball)', helpKey: 'violationsTotal', lowerIsBetter: true, decimals: 2, getNumValue: (r) => numOrNull(r.advViolations?.kickedBall), format: (r) => fmtNum(numOrNull(r.advViolations?.kickedBall), r.statMode === 'totals' ? 0 : 2) },
    { key: 'ptsPaint', label: 'Pintura Fav.', helpKey: 'ptsPaint', getNumValue: (r) => numOrNull(r.advViolations?.ptsPaint ?? r.advDefHustle?.ptsPaint), format: (r) => fmtNum(numOrNull(r.advViolations?.ptsPaint ?? r.advDefHustle?.ptsPaint), r.statMode === 'totals' ? 0 : 1) },
    { key: 'oppPtsPaint', label: 'Pintura Riv.', helpKey: 'oppPtsPaint', lowerIsBetter: true, getNumValue: (r) => numOrNull(r.advViolations?.oppPtsPaint ?? r.advDefHustle?.oppPtsPaint), format: (r) => fmtNum(numOrNull(r.advViolations?.oppPtsPaint ?? r.advDefHustle?.oppPtsPaint), r.statMode === 'totals' ? 0 : 1) },
  ],
};

function formatLineupColHeader(col: LineupColDef, statMode: StatScaleMode): string {
  if (statMode === 'totals') {
    if (col.label.includes('/PJ')) return col.label.replace(/\/PJ/g, ' Tot');
    if (col.key === 'pfVal') return 'Faltas (PF)';
    if (col.key === 'pfdVal') return 'Faltas Rec.';
    if (col.key === 'blkaVal') return 'Tap. Rec.';
    if (col.key === 'tovVal') return 'Pérdidas Tot';
    return col.label;
  }
  if (col.label.includes(' (Tot)')) return col.label.replace(' (Tot)', '/PJ');
  return col.label;
}

function loadSavedLineupCols(): Record<LineupTableView, string[]> {
  const defaults = {} as Record<LineupTableView, string[]>;
  for (const l of LINEUP_LAYERS) defaults[l.id] = [...l.defaultCols];
  try {
    const raw = localStorage.getItem(STORAGE_LINEUP_COLS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    for (const l of LINEUP_LAYERS) {
      if (Array.isArray(parsed[l.id])) {
        const validKeys = new Set(LINEUP_COLUMNS_BY_LAYER[l.id].map((c) => c.key));
        const filtered = parsed[l.id].map(String).filter((k: string) => validKeys.has(k));
        if (filtered.length > 0) defaults[l.id] = filtered;
      }
    }
    return defaults;
  } catch {
    return defaults;
  }
}

function parseLineupPlayers(groupId: string, groupName: string): Array<{ id: string | null; name: string }> {
  const names = String(groupName || '')
    .split(' - ')
    .map((s) => s.trim())
    .filter(Boolean);
  const ids = String(groupId || '')
    .split('-')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));

  if (names.length > 0 && ids.length === names.length) {
    return names.map((name, i) => ({ id: ids[i], name }));
  }
  return names.length > 0 ? names.map((name) => ({ id: null, name })) : [{ id: null, name: groupName }];
}

function getToneTextClass(col: LineupColDef, row: EnrichedLineupRow): string {
  const tone = col.tone ? col.tone(row) : 'neutral';
  if (tone === 'positive') return 'text-emerald-400 font-semibold';
  if (tone === 'negative') return 'text-rose-400 font-semibold';
  if (tone === 'accent') return 'text-orange-300 font-semibold';
  if (tone === 'warning') return 'text-amber-300 font-semibold';
  return 'text-slate-200';
}

export function LineupsExplorerView({
  teams,
  seasonToken,
  onInspectEntity,
  injuriesData = null,
}: LineupsExplorerViewProps) {
  const injuriesIndex = useMemo(
    () => buildInjuriesLookupIndex(injuriesData),
    [injuriesData]
  );
  const [onlyAvailableLineups, setOnlyAvailableLineups] = useState<boolean>(false);
  const [groupQuantity, setGroupQuantity] = useState<2 | 3 | 5>(5);
  const [viewMode, setViewMode] = useState<LineupTableView>('advanced');
  const [statMode, setStatMode] = useState<StatScaleMode>(loadLineupStatMode);
  const [visibleColsByLayer, setVisibleColsByLayer] =
    useState<Record<LineupTableView, string[]>>(loadSavedLineupCols);
  const [unifiedFilters, setUnifiedFilters] = useState<UnifiedTableFiltersState>({
    ...DEFAULT_UNIFIED_FILTERS,
    minGp: 3,
  });
  const [query, setQuery] = useState<string>('');

  const [items, setItems] = useState<NbaLineupEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<string>('netRtg');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const findLineupMemberInjury = useMemo(() => {
    return (
      part: { id?: string | null; name: string },
      teamAbbr: string
    ): InjuryPlayerReportItem | null => {
      if (part.id) {
        const byId = injuriesIndex.byPlayerId.get(part.id);
        if (byId) return byId;
      }
      const normPart = normalizeInjuryLookupName(part.name);
      if (!normPart) return null;
      const byExact = injuriesIndex.byNormName.get(normPart);
      if (byExact && byExact.teamAbbr.toUpperCase() === teamAbbr.toUpperCase()) {
        return byExact;
      }

      const teamInj = injuriesIndex.byTeamAbbr.get(teamAbbr.toUpperCase());
      if (!teamInj) return null;
      // Match NBA.com abbreviated format "J. Tatum" -> initial "j" + last name "tatum"
      const tokens = normPart.split(' ').filter(Boolean);
      if (tokens.length >= 2) {
        const initial = tokens[0][0];
        const surname = tokens.slice(1).join(' ');
        for (const inj of teamInj.injuries) {
          const injNorm = normalizeInjuryLookupName(inj.name);
          const injTokens = injNorm.split(' ').filter(Boolean);
          if (injTokens.length >= 2) {
            const injInitial = injTokens[0][0];
            const injSurname = injTokens.slice(1).join(' ');
            if (injSurname === surname && injInitial === initial) {
              return inj;
            }
          }
        }
      }
      return null;
    };
  }, [injuriesIndex]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LINEUP_COLS_KEY, JSON.stringify(visibleColsByLayer));
    } catch {
      // ignore quota errors
    }
  }, [visibleColsByLayer]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LINEUP_STAT_MODE_KEY, statMode);
    } catch {
      // ignore quota errors
    }
  }, [statMode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    void (async () => {
      try {
        const params = new URLSearchParams({
          season: seasonToken,
          group: String(groupQuantity),
          teamId: '0',
        });
        const res = await fetch(`/api/nba/advanced/lineups?${params.toString()}`);
        if (!res.ok) {
          throw new Error('No se pudieron cargar las alineaciones y quintetos.');
        }
        const data = await res.json();
        if (!cancelled) {
          setItems(Array.isArray(data?.items) ? data.items : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Error al conectar con el servidor.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [seasonToken, groupQuantity]);

  const enrichedLineups: EnrichedLineupRow[] = useMemo(() => {
    const isTotals = statMode === 'totals';
    const scaleInt = (v: number, gpCount: number) => Math.round(v * gpCount);
    const scaleDec = (v: number, gpCount: number) => round1(v * gpCount);

    return items.map((l) => {
      const gp = Math.max(1, l.gp || 1);
      const scaleNum = (v: number | undefined, isFloat = false) => {
        const n = v || 0;
        if (!isTotals) return n;
        return isFloat ? scaleDec(n, gp) : Math.round(n * gp);
      };

      const rawZone = l.advZones;
      const advZones: NbaShotZonesEntry | undefined = rawZone
        ? isTotals
          ? {
              ...rawZone,
              restrictedArea: {
                ...rawZone.restrictedArea,
                fgm: scaleInt(rawZone.restrictedArea.fgm, gp),
                fga: scaleInt(rawZone.restrictedArea.fga, gp),
              },
              paintNonRa: {
                ...rawZone.paintNonRa,
                fgm: scaleInt(rawZone.paintNonRa.fgm, gp),
                fga: scaleInt(rawZone.paintNonRa.fga, gp),
              },
              midRange: {
                ...rawZone.midRange,
                fgm: scaleInt(rawZone.midRange.fgm, gp),
                fga: scaleInt(rawZone.midRange.fga, gp),
              },
              leftCorner3: {
                ...rawZone.leftCorner3,
                fgm: scaleInt(rawZone.leftCorner3.fgm, gp),
                fga: scaleInt(rawZone.leftCorner3.fga, gp),
              },
              rightCorner3: {
                ...rawZone.rightCorner3,
                fgm: scaleInt(rawZone.rightCorner3.fgm, gp),
                fga: scaleInt(rawZone.rightCorner3.fga, gp),
              },
              corner3: {
                ...rawZone.corner3,
                fgm: scaleInt(rawZone.corner3.fgm, gp),
                fga: scaleInt(rawZone.corner3.fga, gp),
              },
              aboveBreak3: {
                ...rawZone.aboveBreak3,
                fgm: scaleInt(rawZone.aboveBreak3.fgm, gp),
                fga: scaleInt(rawZone.aboveBreak3.fga, gp),
              },
              totalRimFga: scaleInt(rawZone.totalRimFga, gp),
              totalThreeFga: scaleInt(rawZone.totalThreeFga, gp),
            }
          : rawZone
        : undefined;

      const rawTrack = l.advTracking;
      const advTracking: NbaTrackingEntry | undefined = rawTrack
        ? isTotals
          ? {
              ...rawTrack,
              drives: scaleInt(rawTrack.drives, gp),
              drivePts: scaleInt(rawTrack.drivePts, gp),
              catchShootPts: scaleInt(rawTrack.catchShootPts, gp),
              pullUpPts: scaleInt(rawTrack.pullUpPts, gp),
              passesMade: scaleInt(rawTrack.passesMade, gp),
              passesReceived: scaleInt(rawTrack.passesReceived, gp),
              potentialAst: scaleInt(rawTrack.potentialAst, gp),
              astPtsCreated: scaleInt(rawTrack.astPtsCreated, gp),
              touches: scaleInt(rawTrack.touches, gp),
              distMiles: scaleDec(rawTrack.distMiles, gp),
              rebChances: scaleInt(rawTrack.rebChances, gp),
            }
          : rawTrack
        : undefined;

      const rawDef = l.advDefHustle;
      const advDefHustle: NbaDefenseHustleEntry | undefined = rawDef
        ? isTotals
          ? {
              ...rawDef,
              ptsPaint: scaleInt(rawDef.ptsPaint ?? 0, gp),
              pts2ndChance: scaleInt(rawDef.pts2ndChance ?? 0, gp),
              ptsFb: scaleInt(rawDef.ptsFb ?? 0, gp),
              ptsOffTov: scaleInt(rawDef.ptsOffTov ?? 0, gp),
              oppPtsPaint: scaleInt(rawDef.oppPtsPaint ?? 0, gp),
              oppPts2ndChance: scaleInt(rawDef.oppPts2ndChance ?? 0, gp),
              oppPtsFb: scaleInt(rawDef.oppPtsFb ?? 0, gp),
              oppPtsOffTov: scaleInt(rawDef.oppPtsOffTov ?? 0, gp),
              oppPts: scaleInt(rawDef.oppPts ?? 0, gp),
              oppReb: scaleInt(rawDef.oppReb ?? 0, gp),
              oppAst: scaleInt(rawDef.oppAst ?? 0, gp),
              oppTov: scaleInt(rawDef.oppTov ?? 0, gp),
              contestedShots: scaleInt(rawDef.contestedShots, gp),
              contestedShots2pt: scaleInt(rawDef.contestedShots2pt, gp),
              contestedShots3pt: scaleInt(rawDef.contestedShots3pt, gp),
              deflections: scaleInt(rawDef.deflections, gp),
              chargesDrawn: scaleInt(rawDef.chargesDrawn, gp),
              screenAssists: scaleInt(rawDef.screenAssists, gp),
              screenAstPts: scaleInt(rawDef.screenAstPts, gp),
              looseBalls: scaleInt(rawDef.looseBalls, gp),
              boxOuts: scaleInt(rawDef.boxOuts, gp),
            }
          : rawDef
        : undefined;

      const rawCl = l.advClutch;
      const clGp = Math.max(1, rawCl?.gp || 1);
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

      const rawPt = l.advPlaytypes;
      const advPlaytypes: NbaPlaytypeEntitySummary | undefined = rawPt
        ? isTotals
          ? { ...rawPt, totalPossOff: scaleInt(rawPt.totalPossOff, gp) }
          : rawPt
        : undefined;

      const rawViol = l.advViolations;
      const advViolations: NbaViolationsEntry | undefined = rawViol
        ? isTotals
          ? {
              ...rawViol,
              min: scaleDec(rawViol.min, gp),
              pf: scaleInt(rawViol.pf, gp),
              pfd: scaleInt(rawViol.pfd, gp),
              blka: scaleInt(rawViol.blka, gp),
              tov: scaleInt(rawViol.tov, gp),
              ptsPaint: scaleInt(rawViol.ptsPaint ?? 0, gp),
              oppPtsPaint: scaleInt(rawViol.oppPtsPaint ?? 0, gp),
            }
          : {
              ...rawViol,
              travel: round2(rawViol.travel / gp),
              doubleDribble: round2(rawViol.doubleDribble / gp),
              discontinuedDribble: round2(rawViol.discontinuedDribble / gp),
              offThreeSec: round2(rawViol.offThreeSec / gp),
              fiveSec: round2(rawViol.fiveSec / gp),
              eightSec: round2(rawViol.eightSec / gp),
              shotClock: round2(rawViol.shotClock / gp),
              inbound: round2(rawViol.inbound / gp),
              backcourt: round2(rawViol.backcourt / gp),
              offGoaltending: round2(rawViol.offGoaltending / gp),
              palming: round2(rawViol.palming / gp),
              offFoul: round2(rawViol.offFoul / gp),
              defThreeSec: round2(rawViol.defThreeSec / gp),
              charge: round2(rawViol.charge / gp),
              delayOfGame: round2(rawViol.delayOfGame / gp),
              defGoaltending: round2(rawViol.defGoaltending / gp),
              lane: round2(rawViol.lane / gp),
              jumpBall: round2(rawViol.jumpBall / gp),
              kickedBall: round2(rawViol.kickedBall / gp),
              totalViolations: round2(rawViol.totalViolations / gp),
            }
        : undefined;

      return {
        ...l,
        statMode,
        minPg: l.min,
        min: isTotals ? scaleDec(l.min, gp) : round1(l.min),
        wPctPct: round1((l.wPct || 0) <= 1 ? (l.wPct || 0) * 100 : l.wPct || 0),
        ptsVal: scaleNum(l.pts, true),
        rebVal: scaleNum(l.reb, true),
        orebVal: scaleNum(l.oreb, true),
        drebVal: scaleNum(l.dreb, true),
        astVal: scaleNum(l.ast, true),
        stlVal: scaleNum(l.stl, true),
        blkVal: scaleNum(l.blk, true),
        tovVal: scaleNum(l.tov, true),
        pfVal: scaleNum(l.pf ?? rawViol?.pf, true),
        pfdVal: scaleNum(l.pfd ?? rawViol?.pfd, true),
        blkaVal: scaleNum(l.blka ?? rawViol?.blka, true),
        fgmVal: scaleNum(l.fgm, true),
        fgaVal: scaleNum(l.fga, true),
        fg3mVal: scaleNum(l.fg3m, true),
        fg3aVal: scaleNum(l.fg3a, true),
        ftmVal: scaleNum(l.ftm, true),
        ftaVal: scaleNum(l.fta, true),
        plusMinusVal: scaleNum(l.plusMinus, true),
        fgPctVal: round1(l.fgPct || 0),
        fg3PctVal: round1(l.fg3Pct || 0),
        ftPctVal: round1(l.ftPct || 0),
        advFourFactors: l.advFourFactors,
        advScoring: l.advScoring,
        advZones,
        advTracking,
        advDefHustle,
        advClutch,
        advPlaytypes,
        advViolations,
      };
    });
  }, [items, statMode]);

  const activeLayerMeta = useMemo(
    () => LINEUP_LAYERS.find((l) => l.id === viewMode) || LINEUP_LAYERS[0],
    [viewMode]
  );

  const activeLayerColumns = useMemo(() => {
    const allDefs = LINEUP_COLUMNS_BY_LAYER[viewMode];
    const visibleSet = new Set(visibleColsByLayer[viewMode] || activeLayerMeta.defaultCols);
    const active = allDefs.filter((c) => visibleSet.has(c.key));
    return active.length > 0 ? active : allDefs.slice(0, 6);
  }, [viewMode, visibleColsByLayer, activeLayerMeta]);

  const activeSortColDef = useMemo(
    () => LINEUP_COLUMNS_BY_LAYER[viewMode].find((c) => c.key === sortKey),
    [viewMode, sortKey]
  );

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query.trim());
    return enrichedLineups
      .filter((item) => {
        if (!matchesLineupUnifiedFilters(item, unifiedFilters)) return false;
        if (onlyAvailableLineups) {
          const parts = parseLineupPlayers(item.groupId, item.groupName);
          const hasOutMember = parts.some((p) => {
            const inj = findLineupMemberInjury(p, item.teamAbbr);
            return Boolean(
              inj &&
                (inj.statusCode === 'out' ||
                  inj.statusCode === 'ir' ||
                  inj.statusCode === 'suspended')
            );
          });
          if (hasOutMember) return false;
        }
        if (q) {
          const hay = normalizeSearchText(`${item.groupName} ${item.teamAbbr}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'groupName' || sortKey === 'teamAbbr') {
          return compareSortValues(a[sortKey], b[sortKey], sortAsc);
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
          if (va === null && vb === null) return b.minPg - a.minPg;
          if (va === null) return 1;
          if (vb === null) return -1;
          return compareSortValues(va, vb, sortAsc) || b.minPg - a.minPg;
        }
        const va = Number((a as any)[sortKey] ?? 0);
        const vb = Number((b as any)[sortKey] ?? 0);
        return sortAsc ? va - vb : vb - va;
      });
  }, [enrichedLineups, unifiedFilters, query, sortKey, sortAsc, activeSortColDef, onlyAvailableLineups, findLineupMemberInjury]);

  const cohortColStats = useMemo(() => {
    const source = filtered.length > 0 ? filtered : enrichedLineups;
    const map: Record<string, { mean: number; sd: number }> = {};
    for (const col of activeLayerColumns) {
      if (col.isString) continue;
      const vals = source
        .map((r) => col.getNumValue(r))
        .filter((v): v is number => v !== null && Number.isFinite(v));
      if (vals.length === 0) continue;
      const m = mean(vals);
      const variance = vals.reduce((acc, v) => acc + (v - m) ** 2, 0) / vals.length;
      map[col.key] = { mean: m, sd: Math.max(0.001, Math.sqrt(variance)) };
    }
    return map;
  }, [filtered, enrichedLineups, activeLayerColumns]);

  const summary = useMemo(() => {
    const sample = filtered.filter((l) => l.minPg >= 2 && l.gp >= 2);
    const pool = sample.length > 0 ? sample : filtered;
    if (pool.length === 0) return null;
    const bestNet = [...pool].sort((a, b) => b.netRtg - a.netRtg)[0];
    const bestOff = [...pool].sort((a, b) => b.offRtg - a.offRtg)[0];
    const bestDef = [...pool].sort((a, b) => a.defRtg - b.defRtg)[0];
    return { bestNet, bestOff, bestDef };
  }, [filtered]);

  const handleModeSwitch = (mode: LineupTableView) => {
    setViewMode(mode);
    const meta = LINEUP_LAYERS.find((l) => l.id === mode);
    const nextSort = meta?.defaultSortKey || 'netRtg';
    setSortKey(nextSort);
    const def = LINEUP_COLUMNS_BY_LAYER[mode].find((c) => c.key === nextSort);
    setSortAsc(Boolean(def?.lowerIsBetter));
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      const def = LINEUP_COLUMNS_BY_LAYER[viewMode].find((c) => c.key === key);
      setSortAsc(key === 'groupName' || key === 'teamAbbr' || Boolean(def?.lowerIsBetter));
    }
  };

  const getHeatmapClass = (col: LineupColDef, row: EnrichedLineupRow): string => {
    if (col.isString) return '';
    const val = col.getNumValue(row);
    const st = cohortColStats[col.key];
    if (val === null || !st || st.sd <= 0.001) return '';
    const z = (val - st.mean) / st.sd;
    if (Math.abs(z) < 0.65) return '';
    const isGood = col.lowerIsBetter ? z <= -0.65 : z >= 0.65;
    return isGood ? 'bg-emerald-500/10' : 'bg-rose-500/10';
  };

  const handleBuildLineupsSnapshot = async () => {
    const topRows = filtered.slice(0, 30);
    const snapCols = activeLayerColumns.slice(0, 8);
    return buildTableSnapshotBlob({
      filename: `radarnba-alineaciones-${groupQuantity}man-${viewMode}-${seasonToken}.png`,
      categoryTag: `NBA.com Lineups · ${groupQuantity}-Man · ${activeLayerMeta.label}`,
      title: `Alineaciones de ${groupQuantity} Jugadores · ${activeLayerMeta.label}`,
      subtitle: `Temporada ${seasonToken} · ${statMode === 'totals' ? 'Totales' : 'Por Partido'} · ${filtered.length} combinaciones`,
      entityColumnLabel: 'Alineación',
      entityColumnWeight: 2.3,
      showRank: true,
      columns: snapCols.map((c) => ({
        key: c.key,
        label: formatLineupColHeader(c, statMode),
        align: c.align || 'right',
        widthWeight: c.isString ? 1.2 : 0.85,
      })),
      rows: topRows.map((l, idx) => {
        const cells: Record<string, TableSnapshotCell> = {};
        for (const c of snapCols) {
          const toneVal = c.tone ? c.tone(l) : 'neutral';
          cells[c.key] = {
            text: c.format(l),
            tone:
              toneVal === 'positive'
                ? 'positive'
                : toneVal === 'negative'
                ? 'negative'
                : toneVal === 'accent'
                ? 'accent'
                : 'neutral',
          };
        }
        return {
          rank: idx + 1,
          teamAbbr: l.teamAbbr,
          entityName: l.groupName,
          entitySubtext: `${l.teamAbbr} · ${l.gp} PJ · ${l.minPg.toFixed(1)} min/p`,
          cells,
        };
      }),
      footerNote: `RadarNBA · Mostrando top ${topRows.length} de ${filtered.length} alineaciones`,
    });
  };

  const SH = ({
    label,
    k,
    helpKey,
    align = 'right',
    className = 'py-3 px-2.5',
  }: {
    label: string;
    k: string;
    helpKey?: string;
    align?: 'left' | 'right';
    className?: string;
  }) => (
    <SortableTh
      label={label}
      helpKey={helpKey}
      active={sortKey === k}
      asc={sortAsc}
      onSort={() => handleSort(k)}
      align={align}
      className={className}
    />
  );

  const mobileSortOptions = useMemo(
    () => [
      { id: 'netRtg', label: 'NetRtg' },
      ...activeLayerColumns.slice(0, 4).map((c) => ({
        id: c.key,
        label: formatLineupColHeader(c, statMode),
      })),
    ],
    [activeLayerColumns, statMode]
  );

  return (
    <div className="space-y-5">
      {/* Row 1: Homogeneous 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Alineaciones ({groupQuantity}-Man)</span>
            <MetricInfoTooltip helpKey="netRtg" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {filtered.length}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {items.length} totales en snapshot · 10 capas
          </p>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Mejor Net Rating</span>
            <MetricInfoTooltip helpKey="netRtg" align="right" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.bestNet && <TeamLogo abbr={summary.bestNet.teamAbbr} size="sm" framed />}
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate leading-tight">
                {summary?.bestNet ? `${summary.bestNet.teamAbbr} · ${summary.bestNet.groupName}` : '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-emerald-400 truncate">
                {summary?.bestNet
                  ? `${formatSigned(summary.bestNet.netRtg)} (${summary.bestNet.gp} PJ)`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Mejor Ataque (OffRtg)</span>
            <MetricInfoTooltip helpKey="offRtg" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.bestOff && <TeamLogo abbr={summary.bestOff.teamAbbr} size="sm" framed />}
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate leading-tight">
                {summary?.bestOff ? `${summary.bestOff.teamAbbr} · ${summary.bestOff.groupName}` : '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-orange-400 truncate">
                {summary?.bestOff ? `${summary.bestOff.offRtg.toFixed(1)} pts / 100 pos` : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
            <span className="truncate">Mejor Defensa (DefRtg)</span>
            <MetricInfoTooltip helpKey="defRtg" align="right" />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
            {summary?.bestDef && <TeamLogo abbr={summary.bestDef.teamAbbr} size="sm" framed />}
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate leading-tight">
                {summary?.bestDef ? `${summary.bestDef.teamAbbr} · ${summary.bestDef.groupName}` : '—'}
              </p>
              <p className="mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-slate-300 truncate">
                {summary?.bestDef ? `${summary.bestDef.defRtg.toFixed(1)} pts / 100 pos` : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Homogeneous Layer Selector (10 Capas) + Group Size + Customizer + Search */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs text-slate-400 block">
              Capas estadísticas NBA.com en Alineaciones (10 módulos · personaliza columnas en cada capa):
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400">Formato:</span>
            <div className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
              {([5, 3, 2] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupQuantity(g)}
                  className={`min-h-[28px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    groupQuantity === g
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {g === 5 ? '5-Man (Quintetos)' : g === 3 ? '3-Man (Tríos)' : '2-Man (Duplas)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg">
          {LINEUP_LAYERS.map((m) => (
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

        {/* Per-Layer Metric Customizer */}
        <div className="pt-2 border-t border-[#1E293B]">
          <LayerColumnCustomizer
            columns={LINEUP_COLUMNS_BY_LAYER[viewMode].map((c) => ({ key: c.key, label: c.label }))}
            visibleKeys={visibleColsByLayer[viewMode] || activeLayerMeta.defaultCols}
            defaultKeys={activeLayerMeta.defaultCols}
            onChangeVisibleKeys={(next) =>
              setVisibleColsByLayer((prev) => ({ ...prev, [viewMode]: next }))
            }
          />
        </div>

        {/* Search + StatMode + Snapshot */}
        <div className="pt-2.5 border-t border-[#1E293B] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="relative w-full xl:max-w-md shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar jugador o franquicia en la alineación (Jokic, BOS, Doncic)..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-[#0B1120] border border-[#1E293B] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2.5">
            <span className="text-[11px] font-mono text-slate-400">
              {filtered.length} de {enrichedLineups.length} combinaciones visibles
            </span>
            {injuriesData && injuriesData.entries.length > 0 && (
              <button
                type="button"
                onClick={() => setOnlyAvailableLineups((prev) => !prev)}
                className={`min-h-[34px] px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                  onlyAvailableLineups
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 font-semibold'
                    : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                }`}
              >
                Solo disponibles (sin Out/IR)
              </button>
            )}
            <div
              className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs"
              role="group"
              aria-label="Modo de volumen estadístico"
            >
              <button
                type="button"
                onClick={() => setStatMode('per_game')}
                className={`min-h-[28px] px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
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
                className={`min-h-[28px] px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                  statMode === 'totals'
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Totales
              </button>
            </div>
            <ExportImageButton
              onBuildImage={handleBuildLineupsSnapshot}
              disabled={filtered.length === 0}
            />
          </div>
        </div>
      </div>

      {/* Unified Homogeneous Filter Block */}
      <UnifiedEntityFilterBar
        filters={unifiedFilters}
        onChange={setUnifiedFilters}
        teams={teams}
        entityScope="lineup"
        shownCount={filtered.length}
        totalCount={enrichedLineups.length}
        unitLabel="alineaciones"
      />

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Row 3: Homogeneous Data Table & Mobile Cards */}
      <div
        id="lineups-table-container"
        className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden"
      >
        {loading ? (
          <div className="py-12 px-6 text-center text-xs text-slate-400">
            Cargando alineaciones de {groupQuantity} jugadores y sus 10 capas estadísticas...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 px-6 text-center text-xs text-slate-400">
            Ninguna alineación cumple con los filtros activos en este momento.
          </div>
        ) : (
          <>
            {/* Mobile Sort Strip & Cards (< md) */}
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

              <div className="max-h-[580px] overflow-y-auto divide-y divide-[#1E293B]">
                {filtered.slice(0, 80).map((l, idx) => {
                  const topMobileCols = activeLayerColumns.slice(0, 4);
                  const playerParts = parseLineupPlayers(l.groupId, l.groupName);
                  const matchTeam = teams.find((t) => t.abbreviation === l.teamAbbr);
                  return (
                    <div key={`${l.groupId}-${idx}`} className="p-3.5 space-y-2 hover:bg-[#182338]/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => matchTeam && onInspectEntity('team', matchTeam.id)}
                            className="shrink-0 mt-0.5"
                            title={`Inspeccionar ${l.teamAbbr}`}
                          >
                            <TeamLogo abbr={l.teamAbbr} teamId={matchTeam?.id} logoUrl={matchTeam?.logoUrl} size="sm" framed />
                          </button>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-100 leading-snug flex flex-wrap gap-x-1 gap-y-0.5">
                              {playerParts.map((part, pIdx) => {
                                const partInj = findLineupMemberInjury(part, l.teamAbbr);
                                return (
                                  <span key={`${part.name}-${pIdx}`} className="inline-flex items-center gap-1">
                                    {part.id ? (
                                      <button
                                        type="button"
                                        onClick={() => onInspectEntity('player', part.id!)}
                                        className="hover:text-orange-400 hover:underline text-left"
                                      >
                                        {part.name}
                                      </button>
                                    ) : (
                                      <span>{part.name}</span>
                                    )}
                                    {partInj && <InjuryStatusBadge injury={partInj} compact />}
                                    {pIdx < playerParts.length - 1 && <span className="text-slate-600">·</span>}
                                  </span>
                                );
                              })}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                              {l.teamAbbr} · {l.gp} PJ · {l.minPg.toFixed(1)} min/p
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-xs font-mono font-bold shrink-0 ${
                            l.netRtg >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatSigned(l.netRtg)}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 bg-[#0B1120]/70 border border-[#1E293B]/80 rounded-lg px-2.5 py-2 text-xs">
                        {topMobileCols.map((col, cIdx) => (
                          <div
                            key={col.key}
                            className={`${cIdx === 3 ? 'text-right' : ''} ${getHeatmapClass(col, l)}`}
                          >
                            <div className="text-[10px] text-slate-400 truncate">
                              {formatLineupColHeader(col, statMode)}
                            </div>
                            <div className={`font-mono tabular-nums mt-0.5 truncate ${getToneTextClass(col, l)}`}>
                              {col.format(l)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desktop Full Table (md+) */}
            <div className="hidden md:block overflow-auto max-h-[72vh]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className={STICKY_THEAD_CLASS}>
                  <tr className="text-slate-400">
                    <SH label="Equipo" k="teamAbbr" align="left" className="py-3 pl-4 pr-2 w-24" />
                    <SH label="Alineación / Jugadores en Pista" k="groupName" align="left" className="py-3 px-3" />
                    {activeLayerColumns.map((col, idx) => (
                      <SH
                        key={col.key}
                        label={formatLineupColHeader(col, statMode)}
                        k={col.key}
                        helpKey={col.helpKey || col.key}
                        align={col.align || 'right'}
                        className={idx === activeLayerColumns.length - 1 ? 'py-3 pl-2.5 pr-4' : 'py-3 px-2.5'}
                      />
                    ))}
                  </tr>

                  {/* Cohort Average Reference Row */}
                  <tr className="border-b-2 border-[#1E293B] bg-[#1E293B]/30 sticky top-[41px] z-20">
                    <td className="py-2 pl-4 pr-2 bg-slate-800/40 font-mono text-[10px] font-bold text-slate-400">
                      NBA
                    </td>
                    <td className="py-2 px-3 bg-slate-800/40 text-xs font-bold text-slate-300 tracking-wider">
                      PROMEDIO COHORTE ({filtered.length})
                    </td>
                    {activeLayerColumns.map((col, idx) => {
                      const st = cohortColStats[col.key];
                      const pad = idx === activeLayerColumns.length - 1 ? 'py-2 pl-2.5 pr-4' : 'py-2 px-2.5';
                      if (col.isString || !st) {
                        return (
                          <td key={col.key} className={`${pad} text-right font-mono text-slate-500 bg-slate-800/20`}>
                            —
                          </td>
                        );
                      }
                      const dec =
                        statMode === 'totals' && !col.suffix && col.key !== 'offRtg' && col.key !== 'defRtg' && col.key !== 'netRtg' && col.key !== 'pace'
                          ? 0
                          : col.decimals ?? 1;
                      const formatted = col.signed
                        ? formatSigned(st.mean, dec, col.suffix || '')
                        : `${st.mean.toFixed(dec)}${col.suffix || ''}`;
                      return (
                        <td key={col.key} className={`${pad} text-right font-mono tabular-nums text-slate-400 bg-slate-800/20`}>
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] font-mono tabular-nums">
                  {filtered.map((l, idx) => {
                    const matchTeam = teams.find((t) => t.abbreviation === l.teamAbbr);
                    const playerParts = parseLineupPlayers(l.groupId, l.groupName);

                    return (
                      <tr key={`${l.groupId}-${idx}`} className="hover:bg-[#182338] transition-colors">
                        <td className="py-2.5 pl-4 pr-2 font-sans">
                          <button
                            type="button"
                            onClick={() => matchTeam && onInspectEntity('team', matchTeam.id)}
                            className="inline-flex items-center gap-1.5 font-semibold text-slate-200 hover:text-orange-400 transition-colors"
                            title={`Inspeccionar franquicia ${l.teamAbbr}`}
                          >
                            <TeamLogo abbr={l.teamAbbr} teamId={matchTeam?.id} logoUrl={matchTeam?.logoUrl} size="xs" />
                            <span>{l.teamAbbr}</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-100 min-w-[240px]">
                          <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                            {playerParts.map((part, pIdx) => {
                              const partInj = findLineupMemberInjury(part, l.teamAbbr);
                              return (
                                <span key={`${part.name}-${pIdx}`} className="inline-flex items-center gap-1">
                                  {part.id ? (
                                    <button
                                      type="button"
                                      onClick={() => onInspectEntity('player', part.id!)}
                                      className="hover:text-orange-400 hover:underline transition-colors text-left"
                                      title={`Abrir ficha de ${part.name}`}
                                    >
                                      {part.name}
                                    </button>
                                  ) : (
                                    <span>{part.name}</span>
                                  )}
                                  {partInj && <InjuryStatusBadge injury={partInj} compact />}
                                  {pIdx < playerParts.length - 1 && (
                                    <span className="text-slate-600">·</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        {activeLayerColumns.map((col, cIdx) => {
                          const pad = cIdx === activeLayerColumns.length - 1 ? 'py-2.5 pl-2.5 pr-4' : 'py-2.5 px-2.5';
                          return (
                            <td
                              key={col.key}
                              className={`${pad} ${
                                col.align === 'left' ? 'text-left font-sans' : 'text-right font-mono tabular-nums'
                              } whitespace-nowrap ${getHeatmapClass(col, l)} ${getToneTextClass(col, l)}`}
                            >
                              {col.format(l)}
                            </td>
                          );
                        })}
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
