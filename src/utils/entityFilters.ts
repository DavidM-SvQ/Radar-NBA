import type { PlayerSummary, TeamSummary } from '../types/nba';
import {
  NBA_DIVISIONS_BY_CONFERENCE,
  NBA_DIVISIONS_LIST,
  NBA_TEAMS_MAP,
  getTeamConference,
  getTeamDivision,
  normalizeConferenceEs,
  type NbaConferenceEs,
  type NbaDivisionEs,
} from './teamLogos';

export type UnifiedPositionFilter = 'all' | 'G' | 'F' | 'C';
export type UnifiedRatioMetric = 'all' | 'tsPct' | 'efgPct' | 'netRtg' | 'offRtg' | 'defRtg' | 'usgPct' | 'astTo' | 'pie' | 'winPct';
export type UnifiedRatioOperator = 'gte' | 'lte';

export interface SingleStatFilter {
  metric: string;
  operator: 'gte' | 'lte';
  value: number | '';
}

export interface UnifiedTableFiltersState {
  conference: 'all' | NbaConferenceEs;
  division: 'all' | NbaDivisionEs;
  team: string;
  country: string;
  birthYear: string;
  position: UnifiedPositionFilter;
  minGp: number | '' | 'all';
  minMinutes: number | '' | 'all';
  statFilter1: SingleStatFilter;
  statFilter2: SingleStatFilter;
  // Compatibilidad hacia atrás
  ratioMetric?: UnifiedRatioMetric;
  ratioOperator?: UnifiedRatioOperator;
  ratioValue?: number | '';
}

export const DEFAULT_STAT_FILTER: SingleStatFilter = {
  metric: 'all',
  operator: 'gte',
  value: '',
};

export const DEFAULT_UNIFIED_FILTERS: UnifiedTableFiltersState = {
  conference: 'all',
  division: 'all',
  team: 'all',
  country: 'all',
  birthYear: 'all',
  position: 'all',
  minGp: '',
  minMinutes: '',
  statFilter1: { metric: 'all', operator: 'gte', value: '' },
  statFilter2: { metric: 'all', operator: 'gte', value: '' },
  ratioMetric: 'all',
  ratioOperator: 'gte',
  ratioValue: '',
};

export interface UnifiedFilterOptions {
  conferences: NbaConferenceEs[];
  divisions: NbaDivisionEs[];
  teams: Array<{ abbr: string; name: string }>;
  countries: string[];
  birthYears: number[];
}

export function countActiveUnifiedFilters(
  filters: UnifiedTableFiltersState,
  scope: 'player' | 'team' | 'lineup' | 'mixed' = 'player'
): number {
  let count = 0;
  if (filters.conference !== 'all') count++;
  if (filters.division !== 'all') count++;
  if (filters.team !== 'all') count++;
  if (filters.minGp !== '' && filters.minGp !== 'all' && Number(filters.minGp) > 0) count++;
  if (scope !== 'team' && filters.minMinutes !== '' && filters.minMinutes !== 'all' && Number(filters.minMinutes) > 0) count++;

  // Filtro Estadístico 1
  if (
    filters.statFilter1 &&
    filters.statFilter1.metric !== 'all' &&
    filters.statFilter1.value !== '' &&
    !Number.isNaN(Number(filters.statFilter1.value))
  ) {
    count++;
  }

  // Filtro Estadístico 2
  if (
    filters.statFilter2 &&
    filters.statFilter2.metric !== 'all' &&
    filters.statFilter2.value !== '' &&
    !Number.isNaN(Number(filters.statFilter2.value))
  ) {
    count++;
  }

  // Compatibilidad con ratioMetric legado si se usó
  if (
    (!filters.statFilter1 || filters.statFilter1.metric === 'all') &&
    filters.ratioMetric &&
    filters.ratioMetric !== 'all' &&
    filters.ratioValue !== '' &&
    !Number.isNaN(Number(filters.ratioValue))
  ) {
    count++;
  }

  if (scope !== 'team' && scope !== 'lineup') {
    if (filters.country !== 'all') count++;
    if (filters.birthYear !== 'all') count++;
    if (filters.position !== 'all') count++;
  }
  return count;
}

export function hasActiveUnifiedFilters(
  filters: UnifiedTableFiltersState,
  scope: 'player' | 'team' | 'lineup' | 'mixed' = 'player'
): boolean {
  return countActiveUnifiedFilters(filters, scope) > 0;
}

/**
 * Updates a single filter key and enforces cascading consistency across
 * Conference -> Division -> Team.
 */
export function updateUnifiedFiltersWithCascade(
  prev: UnifiedTableFiltersState,
  key: keyof UnifiedTableFiltersState,
  value: any
): UnifiedTableFiltersState {
  const next: UnifiedTableFiltersState = { ...prev, [key]: value } as UnifiedTableFiltersState;

  if (key === 'conference') {
    const conf = value as 'all' | NbaConferenceEs;
    if (conf !== 'all') {
      const allowedDivs = NBA_DIVISIONS_BY_CONFERENCE[conf];
      if (next.division !== 'all' && !allowedDivs.includes(next.division as NbaDivisionEs)) {
        next.division = 'all';
      }
      if (next.team !== 'all' && getTeamConference(next.team) !== conf) {
        next.team = 'all';
      }
    }
  } else if (key === 'division') {
    if (value !== 'all' && next.team !== 'all' && getTeamDivision(next.team) !== value) {
      next.team = 'all';
    }
  }

  return next;
}

export function matchesPositionCategory(
  rawPosition: string | undefined | null,
  filterPos: UnifiedPositionFilter
): boolean {
  if (filterPos === 'all') return true;
  const pos = String(rawPosition || '').toUpperCase().trim();
  if (!pos) return false;
  if (filterPos === 'G') {
    return pos.includes('G');
  }
  if (filterPos === 'F') {
    return pos.includes('F');
  }
  if (filterPos === 'C') {
    return pos.includes('C');
  }
  return true;
}

export interface PlayerLookupContext {
  playerById: Map<string, PlayerSummary>;
  teamByAbbr: Map<string, TeamSummary>;
}

export function buildEntityLookupContext(
  players: PlayerSummary[] = [],
  teams: TeamSummary[] = []
): PlayerLookupContext {
  const playerById = new Map<string, PlayerSummary>();
  for (const p of players) {
    if (p?.id) playerById.set(p.id, p);
  }
  const teamByAbbr = new Map<string, TeamSummary>();
  for (const t of teams) {
    if (t?.abbreviation) teamByAbbr.set(t.abbreviation.toUpperCase().trim(), t);
  }
  return { playerById, teamByAbbr };
}

export function extractUnifiedFilterOptions(
  players: PlayerSummary[] = [],
  teams: TeamSummary[] = [],
  currentFilters: UnifiedTableFiltersState = DEFAULT_UNIFIED_FILTERS
): UnifiedFilterOptions {
  const divisions: NbaDivisionEs[] =
    currentFilters.conference !== 'all'
      ? NBA_DIVISIONS_BY_CONFERENCE[currentFilters.conference]
      : NBA_DIVISIONS_LIST;

  const teamMap = new Map<string, string>();
  for (const [abbr, meta] of Object.entries(NBA_TEAMS_MAP)) {
    teamMap.set(abbr, meta.name);
  }
  for (const t of teams) {
    if (t?.abbreviation && t?.name) {
      teamMap.set(t.abbreviation.toUpperCase().trim(), t.name);
    }
  }

  const scopedTeams = [...teamMap.entries()]
    .filter(([abbr]) => {
      if (currentFilters.conference !== 'all' && getTeamConference(abbr) !== currentFilters.conference) {
        return false;
      }
      if (currentFilters.division !== 'all' && getTeamDivision(abbr) !== currentFilters.division) {
        return false;
      }
      return true;
    })
    .map(([abbr, name]) => ({ abbr, name }))
    .sort((a, b) => a.abbr.localeCompare(b.abbr));

  const countrySet = new Set<string>();
  const yearSet = new Set<number>();

  for (const p of players) {
    const c = String(p?.country || '').trim();
    if (c) countrySet.add(c);
    if (typeof p?.birthYear === 'number' && Number.isFinite(p.birthYear) && p.birthYear > 1950) {
      yearSet.add(p.birthYear);
    }
  }

  const countries = [...countrySet].sort((a, b) => {
    if (a === 'USA' && b !== 'USA') return -1;
    if (b === 'USA' && a !== 'USA') return 1;
    if (a === 'Spain' && b !== 'Spain') return -1;
    if (b === 'Spain' && a !== 'Spain') return 1;
    return a.localeCompare(b, 'es');
  });

  const birthYears = [...yearSet].sort((a, b) => b - a);

  return {
    conferences: ['Este', 'Oeste'],
    divisions,
    teams: scopedTeams,
    countries,
    birthYears,
  };
}

export interface PlayerFilterableCandidate {
  id?: string;
  playerId?: string;
  entityId?: string;
  teamAbbr?: string;
  position?: string;
  country?: string;
  birthYear?: number;
  conference?: string;
  gp?: number;
  min?: number;
  games?: any[];
  advanced?: any;
  tsPct?: number;
  efgPct?: number;
  netRtg?: number;
  offRtg?: number;
  defRtg?: number;
  usgPct?: number;
  astTo?: number;
  pie?: number;
  [key: string]: any;
}

export type StatLayerCategory =
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

export interface FilterableMetricDef {
  id: string;
  label: string;
  category: StatLayerCategory;
  categoryLabel: string;
  scope?: 'player' | 'team' | 'both';
  placeholder?: string;
  step?: string;
}

export interface FilterableMetricCategory {
  id: StatLayerCategory;
  label: string;
  metrics: FilterableMetricDef[];
}

export function getStatLayerCategoryLabel(
  categoryId: StatLayerCategory,
  scope: 'player' | 'team' | 'lineup' | 'mixed' = 'player'
): string {
  if (scope === 'lineup') {
    switch (categoryId) {
      case 'basic':
        return '1. Básicas & Caja';
      case 'advanced':
        return '2. Ratings y 4 Factores';
      case 'scoring':
        return '3. Tiro y Scoring Splits';
      case 'zones':
        return '4. Zonas de Tiro (Shot Zones)';
      case 'tracking':
        return '5. Tracking Óptico Colectivo';
      case 'hustle':
        return '6. Hustle y Pintura';
      case 'defense':
        return '7. Defensa y Stats Rival';
      case 'clutch':
        return '8. Clutch (<5m, ±5)';
      case 'playtypes':
        return '9. Playtypes (Synergy)';
      case 'violations':
        return '10. Infracciones y Faltas';
      default:
        return categoryId;
    }
  }

  if (scope === 'team') {
    switch (categoryId) {
      case 'basic':
        return '1. Balance y Racha';
      case 'advanced':
        return '2. Ratings y 4 Factores';
      case 'scoring':
        return '3. Tiro y Scoring Splits';
      case 'zones':
        return '4. Zonas de Tiro (Shot Zones)';
      case 'tracking':
        return '5. Tracking Óptico Colectivo';
      case 'hustle':
        return '6. Hustle Completo';
      case 'defense':
        return '7. Defensa y Stats Rival';
      case 'clutch':
        return '8. Clutch (<5m, ±5)';
      case 'playtypes':
        return '9. Playtypes (Synergy)';
      case 'violations':
        return '10. Infracciones, Faltas y Pintura';
      default:
        return categoryId;
    }
  }

  // player or default
  switch (categoryId) {
    case 'basic':
      return '1. Básicas & Caja';
    case 'advanced':
      return '2. Avanzadas e Impacto';
    case 'scoring':
      return '3. Tiro y Scoring Splits';
    case 'zones':
      return '4. Zonas de Tiro (Shot Zones)';
    case 'tracking':
      return '5. Tracking Óptico';
    case 'hustle':
      return '6. Hustle y Pintura';
    case 'defense':
      return '7. Defensa y DFG%';
    case 'clutch':
      return '8. Clutch (<5m, ±5)';
    case 'playtypes':
      return '9. Playtypes (Synergy)';
    case 'violations':
      return '10. Infracciones y Faltas';
    default:
      return categoryId;
  }
}

export const FILTERABLE_METRIC_CATEGORIES: FilterableMetricCategory[] = [
  {
    id: 'basic',
    label: '1. Básicas & Caja / Balance',
    metrics: [
      { id: 'pts', label: 'PTS — Puntos por partido', category: 'basic', categoryLabel: 'Básicas', placeholder: '20.0', step: '0.1' },
      { id: 'reb', label: 'REB — Rebotes por partido', category: 'basic', categoryLabel: 'Básicas', placeholder: '8.0', step: '0.1' },
      { id: 'oreb', label: 'OR — Rebotes Ofensivos / PJ', category: 'basic', categoryLabel: 'Básicas', placeholder: '2.5', step: '0.1' },
      { id: 'dreb', label: 'DR — Rebotes Defensivos / PJ', category: 'basic', categoryLabel: 'Básicas', placeholder: '5.5', step: '0.1' },
      { id: 'ast', label: 'AST — Asistencias por partido', category: 'basic', categoryLabel: 'Básicas', placeholder: '5.0', step: '0.1' },
      { id: 'stl', label: 'ROB — Robos de balón por partido', category: 'basic', categoryLabel: 'Básicas', placeholder: '1.2', step: '0.1' },
      { id: 'blk', label: 'TAP — Tapones colocados por partido', category: 'basic', categoryLabel: 'Básicas', placeholder: '1.0', step: '0.1' },
      { id: 'stocks', label: 'STK — Stocks (Robos + Tapones)', category: 'basic', categoryLabel: 'Básicas', placeholder: '2.0', step: '0.1' },
      { id: 'fgPct', label: 'TC% — % Tiros de Campo', category: 'basic', categoryLabel: 'Básicas', placeholder: '48.0', step: '0.5' },
      { id: 'fgm', label: 'FGM — Tiros de Campo Anotados', category: 'basic', categoryLabel: 'Básicas', placeholder: '7.5', step: '0.1' },
      { id: 'fga', label: 'FGA — Tiros de Campo Intentados', category: 'basic', categoryLabel: 'Básicas', placeholder: '16.0', step: '0.1' },
      { id: 'fg3Pct', label: '3P% — % Triples', category: 'basic', categoryLabel: 'Básicas', placeholder: '36.5', step: '0.5' },
      { id: 'fg3m', label: '3PM — Triples Anotados / PJ', category: 'basic', categoryLabel: 'Básicas', placeholder: '2.5', step: '0.1' },
      { id: 'fg3a', label: '3PA — Triples Intentados / PJ', category: 'basic', categoryLabel: 'Básicas', placeholder: '7.0', step: '0.1' },
      { id: 'ftPct', label: 'TL% — % Tiros Libres', category: 'basic', categoryLabel: 'Básicas', placeholder: '80.0', step: '0.5' },
      { id: 'ftm', label: 'FTM — Tiros Libres Anotados', category: 'basic', categoryLabel: 'Básicas', placeholder: '4.0', step: '0.1' },
      { id: 'fta', label: 'FTA — Tiros Libres Intentados', category: 'basic', categoryLabel: 'Básicas', placeholder: '5.0', step: '0.1' },
      { id: 'plusMinus', label: '+/- — Impacto Más/Menos medio', category: 'basic', categoryLabel: 'Básicas', placeholder: '3.0', step: '0.1' },
      { id: 'pctDelta', label: 'Delta % — Mejora en victorias vs global', category: 'basic', categoryLabel: 'Básicas', placeholder: '5.0', step: '0.5' },
      { id: 'winPct', label: '%V — % Victorias (0-100%)', category: 'basic', categoryLabel: 'Básicas', scope: 'team', placeholder: '50.0', step: '0.5' },
      { id: 'ptsAgainst', label: 'PTS Contra — Puntos recibidos / PJ', category: 'basic', categoryLabel: 'Básicas', scope: 'team', placeholder: '112.0', step: '0.5' },
      { id: 'diff', label: 'DIF — Diferencial medio de puntos', category: 'basic', categoryLabel: 'Básicas', scope: 'team', placeholder: '2.5', step: '0.5' },
    ],
  },
  {
    id: 'advanced',
    label: '2. Avanzadas e Impacto / 4 Factores',
    metrics: [
      { id: 'netRtg', label: 'NetRtg — Diferencial Neto / 100 pos', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '4.5', step: '0.5' },
      { id: 'offRtg', label: 'OffRtg — Rating Ofensivo / 100 pos', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '115.0', step: '0.5' },
      { id: 'defRtg', label: 'DefRtg — Rating Defensivo / 100 pos', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '112.0', step: '0.5' },
      { id: 'pace', label: 'Pace — Ritmo posesiones / 48m', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '99.5', step: '0.5' },
      { id: 'tsPct', label: 'TS% — True Shooting %', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '58.0', step: '0.5' },
      { id: 'efgPct', label: 'eFG% — Tiro Efectivo %', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '54.0', step: '0.5' },
      { id: 'usgPct', label: 'USG% — Tasa de Uso Ofensivo %', category: 'advanced', categoryLabel: 'Avanzadas', scope: 'player', placeholder: '24.0', step: '0.5' },
      { id: 'pie', label: 'PIE% — Impacto Global NBA.com', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '12.0', step: '0.5' },
      { id: 'gmSc', label: 'GmSc — Valoración media Hollinger', category: 'advanced', categoryLabel: 'Avanzadas', scope: 'player', placeholder: '15.0', step: '0.5' },
      { id: 'astTo', label: 'AST/TO — Ratio Asistencias/Pérdidas', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '2.5', step: '0.1' },
      { id: 'astPct', label: 'AST% — % Asistencias de canastas equipo', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '22.0', step: '0.5' },
      { id: 'astRatio', label: 'AST Ratio — Asistencias por 100 pos', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '18.0', step: '0.5' },
      { id: 'orebPct', label: 'OREB% — % Rebote Ofensivo', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '28.0', step: '0.5' },
      { id: 'drebPct', label: 'DREB% — % Rebote Defensivo', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '72.0', step: '0.5' },
      { id: 'rebPct', label: 'REB% — % Rebote Total', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '50.0', step: '0.5' },
      { id: 'tovPct', label: 'TOV% — % Pérdidas por posesión', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '12.5', step: '0.5' },
      { id: 'ftaRate', label: 'FTA Rate — Ratio Tiros Libres / FGA', category: 'advanced', categoryLabel: 'Avanzadas', placeholder: '0.24', step: '0.02' },
      { id: 'oppEfgPct', label: 'Opp eFG% — Tiro Efectivo % permitido rivales', category: 'advanced', categoryLabel: 'Avanzadas', scope: 'team', placeholder: '52.0', step: '0.5' },
      { id: 'oppTovPct', label: 'Opp TOV% — % Pérdidas forzadas a rivales', category: 'advanced', categoryLabel: 'Avanzadas', scope: 'team', placeholder: '14.0', step: '0.5' },
      { id: 'oppOrebPct', label: 'Opp OREB% — % Rebote ofensivo concedido', category: 'advanced', categoryLabel: 'Avanzadas', scope: 'team', placeholder: '26.0', step: '0.5' },
      { id: 'oppFtaRate', label: 'Opp FTr — Ratio tiros libres rival / FGA', category: 'advanced', categoryLabel: 'Avanzadas', scope: 'team', placeholder: '0.22', step: '0.02' },
    ],
  },
  {
    id: 'scoring',
    label: '3. Tiro y Scoring Splits',
    metrics: [
      { id: 'pctFga2pt', label: '%FGA 2P — % Tiros intentados de 2', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '60.0', step: '0.5' },
      { id: 'pctFga3pt', label: '%FGA 3P — % Tiros intentados de 3', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '40.0', step: '0.5' },
      { id: 'pctPts2pt', label: '%PTS 2P — % Puntos anotados de 2', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '50.0', step: '0.5' },
      { id: 'pctPts2ptMr', label: '%PTS MidRange — % Puntos media distancia', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '12.0', step: '0.5' },
      { id: 'pctPts3pt', label: '%PTS 3P — % Puntos anotados de triple', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '35.0', step: '0.5' },
      { id: 'pctPtsFb', label: '%PTS Contraat. — % Puntos al contraataque', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '14.0', step: '0.5' },
      { id: 'pctPtsFt', label: '%PTS Libres — % Puntos desde tiros libres', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '15.0', step: '0.5' },
      { id: 'pctPtsOffTov', label: '%PTS x Pérd. — % Puntos tras pérdida rival', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '16.0', step: '0.5' },
      { id: 'pctPtsPaint', label: '%PTS Pintura — % Puntos dentro de la pintura', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '45.0', step: '0.5' },
      { id: 'pctAstFgm', label: '%AST FGM — % Canastas asistidas', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '60.0', step: '0.5' },
      { id: 'pctUastFgm', label: '%UAST FGM — % Canastas individuales no asistidas', category: 'scoring', categoryLabel: 'Tiro/Splits', placeholder: '40.0', step: '0.5' },
    ],
  },
  {
    id: 'zones',
    label: '4. Zonas de Tiro (Shot Zones)',
    metrics: [
      { id: 'raFga', label: 'Aro FGA/PJ — Intentos en Zona Restringida', category: 'zones', categoryLabel: 'Zonas', placeholder: '6.0', step: '0.5' },
      { id: 'raFgPct', label: 'Aro FG% — % Acierto Zona Restringida (<4ft)', category: 'zones', categoryLabel: 'Zonas', placeholder: '65.0', step: '0.5' },
      { id: 'paintNonRaFga', label: 'Pintura(No-RA) FGA/PJ — Intentos pintura no-RA', category: 'zones', categoryLabel: 'Zonas', placeholder: '3.0', step: '0.5' },
      { id: 'paintNonRaFgPct', label: 'Pintura(No-RA) FG% — % Acierto pintura no-RA', category: 'zones', categoryLabel: 'Zonas', placeholder: '42.0', step: '0.5' },
      { id: 'midFga', label: 'Media Dist. FGA/PJ — Intentos media distancia', category: 'zones', categoryLabel: 'Zonas', placeholder: '4.0', step: '0.5' },
      { id: 'midFgPct', label: 'Media Dist. FG% — % Acierto media distancia', category: 'zones', categoryLabel: 'Zonas', placeholder: '42.0', step: '0.5' },
      { id: 'corner3Fga', label: 'Triple Esquina FGA/PJ — Intentos desde esquinas', category: 'zones', categoryLabel: 'Zonas', placeholder: '1.8', step: '0.2' },
      { id: 'corner3FgPct', label: 'Triple Esquina FG% — % Acierto triples esquina', category: 'zones', categoryLabel: 'Zonas', placeholder: '38.0', step: '0.5' },
      { id: 'ab3Fga', label: 'Triple Frontal FGA/PJ — Intentos frontal/cabecera', category: 'zones', categoryLabel: 'Zonas', placeholder: '5.0', step: '0.5' },
      { id: 'ab3FgPct', label: 'Triple Frontal FG% — % Acierto triples frontales', category: 'zones', categoryLabel: 'Zonas', placeholder: '35.0', step: '0.5' },
      { id: 'totalThreeFga', label: 'Total Triples FGA/PJ — Volumen total de triples', category: 'zones', categoryLabel: 'Zonas', placeholder: '7.5', step: '0.5' },
      { id: 'threeFgPct', label: 'Total Triples FG% — % Acierto global en triples', category: 'zones', categoryLabel: 'Zonas', placeholder: '36.0', step: '0.5' },
    ],
  },
  {
    id: 'tracking',
    label: '5. Tracking Óptico',
    metrics: [
      { id: 'drives', label: 'Drives — Penetraciones a canasta / PJ', category: 'tracking', categoryLabel: 'Tracking', placeholder: '10.0', step: '0.5' },
      { id: 'drivePts', label: 'Drive PTS — Puntos en penetración', category: 'tracking', categoryLabel: 'Tracking', placeholder: '7.0', step: '0.5' },
      { id: 'driveFgPct', label: 'Drive FG% — % Acierto en penetración', category: 'tracking', categoryLabel: 'Tracking', placeholder: '50.0', step: '0.5' },
      { id: 'driveAstPct', label: 'Drive AST% — % Asistencias en penetración', category: 'tracking', categoryLabel: 'Tracking', placeholder: '10.0', step: '0.5' },
      { id: 'drivePassesPct', label: 'Drive Pase% — % Pases en penetración', category: 'tracking', categoryLabel: 'Tracking', placeholder: '35.0', step: '0.5' },
      { id: 'catchShootPts', label: 'C&S PTS — Puntos Catch & Shoot', category: 'tracking', categoryLabel: 'Tracking', placeholder: '6.0', step: '0.5' },
      { id: 'catchShootFg3Pct', label: 'C&S 3P% — % Triples Catch & Shoot', category: 'tracking', categoryLabel: 'Tracking', placeholder: '38.0', step: '0.5' },
      { id: 'pullUpPts', label: 'Pull-Up PTS — Puntos tras bote', category: 'tracking', categoryLabel: 'Tracking', placeholder: '5.0', step: '0.5' },
      { id: 'pullUpFg3Pct', label: 'Pull-Up 3P% — % Triples tras bote', category: 'tracking', categoryLabel: 'Tracking', placeholder: '33.0', step: '0.5' },
      { id: 'passesMade', label: 'Pases Dados — Pases completados / PJ', category: 'tracking', categoryLabel: 'Tracking', placeholder: '45.0', step: '1.0' },
      { id: 'passesReceived', label: 'Pases Rec. — Pases recibidos / PJ', category: 'tracking', categoryLabel: 'Tracking', placeholder: '45.0', step: '1.0' },
      { id: 'potentialAst', label: 'Ast. Potenc. — Asistencias potenciales / PJ', category: 'tracking', categoryLabel: 'Tracking', placeholder: '10.0', step: '0.5' },
      { id: 'astPtsCreated', label: 'PTS x Pase — Puntos creados por asistencia', category: 'tracking', categoryLabel: 'Tracking', placeholder: '14.0', step: '0.5' },
      { id: 'touches', label: 'Toques/PJ — Toques totales de balón', category: 'tracking', categoryLabel: 'Tracking', placeholder: '60.0', step: '1.0' },
      { id: 'timeOfPoss', label: 'T. Posesión — Minutos acumulados con balón', category: 'tracking', categoryLabel: 'Tracking', placeholder: '4.5', step: '0.5' },
      { id: 'distMiles', label: 'Distancia — Millas recorridas en pista', category: 'tracking', categoryLabel: 'Tracking', placeholder: '2.3', step: '0.1' },
      { id: 'avgSpeed', label: 'Velocidad — Velocidad media de carrera (mph)', category: 'tracking', categoryLabel: 'Tracking', placeholder: '4.2', step: '0.1' },
      { id: 'rebChances', label: 'Oport. Reb — Ocasiones reales de rebote / PJ', category: 'tracking', categoryLabel: 'Tracking', placeholder: '12.0', step: '0.5' },
    ],
  },
  {
    id: 'hustle',
    label: '6. Hustle y Pintura',
    metrics: [
      { id: 'ptsPaint', label: 'PTS Pintura — Puntos en la pintura por partido', category: 'hustle', categoryLabel: 'Hustle', placeholder: '12.0', step: '0.5' },
      { id: 'pts2ndChance', label: 'PTS 2ª Op. — Puntos de 2ª oportunidad', category: 'hustle', categoryLabel: 'Hustle', placeholder: '3.5', step: '0.5' },
      { id: 'ptsFastBreak', label: 'PTS Contraat. — Puntos al contraataque', category: 'hustle', categoryLabel: 'Hustle', placeholder: '4.0', step: '0.5' },
      { id: 'ptsOffTov', label: 'PTS x Pérd. — Puntos tras pérdida rival', category: 'hustle', categoryLabel: 'Hustle', placeholder: '4.5', step: '0.5' },
      { id: 'contestedShots', label: 'Punteados Tot — Tiros rivales punteados / PJ', category: 'hustle', categoryLabel: 'Hustle', placeholder: '8.0', step: '0.5' },
      { id: 'contestedShots2pt', label: 'Punt. 2P — Tiros de 2 rivales punteados', category: 'hustle', categoryLabel: 'Hustle', placeholder: '5.0', step: '0.5' },
      { id: 'contestedShots3pt', label: 'Punt. 3P — Triples rivales punteados', category: 'hustle', categoryLabel: 'Hustle', placeholder: '3.0', step: '0.5' },
      { id: 'deflections', label: 'Desvíos — Balones desviados (Deflections)', category: 'hustle', categoryLabel: 'Hustle', placeholder: '3.0', step: '0.1' },
      { id: 'chargesDrawn', label: 'Cargas Prov. — Cargas de ataque forzadas', category: 'hustle', categoryLabel: 'Hustle', placeholder: '0.5', step: '0.1' },
      { id: 'screenAssists', label: 'Screen AST — Bloqueos directos con canasta', category: 'hustle', categoryLabel: 'Hustle', placeholder: '2.0', step: '0.1' },
      { id: 'screenAstPts', label: 'Scr. AST PTS — Puntos generados por pantallas', category: 'hustle', categoryLabel: 'Hustle', placeholder: '5.0', step: '0.5' },
      { id: 'looseBalls', label: 'Bal. Sueltos — Balones divididos recuperados', category: 'hustle', categoryLabel: 'Hustle', placeholder: '1.0', step: '0.1' },
      { id: 'boxOuts', label: 'Box-Outs — Cierres de rebote totales', category: 'hustle', categoryLabel: 'Hustle', placeholder: '2.5', step: '0.1' },
    ],
  },
  {
    id: 'defense',
    label: '7. Defensa y DFG%',
    metrics: [
      { id: 'defRating', label: 'DefRtg — Eficiencia defensiva individual/equipo', category: 'defense', categoryLabel: 'Defensa', placeholder: '110.0', step: '0.5' },
      { id: 'dFga', label: 'DFGA/PJ — Tiros rivales defendidos / PJ', category: 'defense', categoryLabel: 'Defensa', placeholder: '10.0', step: '0.5' },
      { id: 'dFgm', label: 'DFGM/PJ — Tiros rivales encajados / PJ', category: 'defense', categoryLabel: 'Defensa', placeholder: '4.5', step: '0.5' },
      { id: 'dFgPct', label: 'DFG% — % Acierto permitido al tirador defendido', category: 'defense', categoryLabel: 'Defensa', placeholder: '44.0', step: '0.5' },
      { id: 'normalFgPct', label: 'FG% Normal — % Acierto esperado del tirador', category: 'defense', categoryLabel: 'Defensa', placeholder: '46.0', step: '0.5' },
      { id: 'pctPlusMinus', label: 'Diff% (DFG) — Reducción del % tiro rival (negativo = mejor)', category: 'defense', categoryLabel: 'Defensa', placeholder: '-2.0', step: '0.5' },
      { id: 'defFreq', label: 'Frec. Def. — Frecuencia defendiendo tiros', category: 'defense', categoryLabel: 'Defensa', placeholder: '25.0', step: '0.5' },
      { id: 'oppPts', label: 'Opp PTS — Puntos rivales recibidos / PJ', category: 'defense', categoryLabel: 'Defensa', scope: 'team', placeholder: '112.0', step: '0.5' },
      { id: 'oppFgPct', label: 'Opp FG% — % Acierto en tiro de campo rival', category: 'defense', categoryLabel: 'Defensa', scope: 'team', placeholder: '46.0', step: '0.5' },
      { id: 'oppFg3Pct', label: 'Opp 3P% — % Acierto en triples rival', category: 'defense', categoryLabel: 'Defensa', scope: 'team', placeholder: '35.5', step: '0.5' },
      { id: 'oppReb', label: 'Opp REB — Rebotes rivales concedidos / PJ', category: 'defense', categoryLabel: 'Defensa', scope: 'team', placeholder: '43.0', step: '0.5' },
      { id: 'oppAst', label: 'Opp AST — Asistencias rivales concedidas / PJ', category: 'defense', categoryLabel: 'Defensa', scope: 'team', placeholder: '25.0', step: '0.5' },
      { id: 'oppTov', label: 'Opp TOV — Pérdidas rivales provocadas / PJ', category: 'defense', categoryLabel: 'Defensa', scope: 'team', placeholder: '14.0', step: '0.5' },
      { id: 'oppPtsPaint', label: 'Opp Pintura — Puntos rivales recibidos en pintura', category: 'defense', categoryLabel: 'Defensa', placeholder: '46.0', step: '0.5' },
      { id: 'oppPtsFb', label: 'Opp Contraat. — Puntos rivales en contraataque', category: 'defense', categoryLabel: 'Defensa', placeholder: '14.0', step: '0.5' },
      { id: 'oppPtsOffTov', label: 'Opp x Pérd. — Puntos rivales tras pérdida', category: 'defense', categoryLabel: 'Defensa', placeholder: '15.0', step: '0.5' },
      { id: 'oppPts2ndChance', label: 'Opp 2ª Op. — Puntos rivales en 2ª oportunidad', category: 'defense', categoryLabel: 'Defensa', scope: 'team', placeholder: '13.0', step: '0.5' },
    ],
  },
  {
    id: 'clutch',
    label: '8. Clutch (<5m, ±5)',
    metrics: [
      { id: 'clPts', label: 'PTS Clutch — Puntos en momentos clutch', category: 'clutch', categoryLabel: 'Clutch', placeholder: '3.0', step: '0.5' },
      { id: 'clMin', label: 'MIN Clutch — Minutos disputados en clutch', category: 'clutch', categoryLabel: 'Clutch', placeholder: '3.5', step: '0.5' },
      { id: 'clWPct', label: '%V Clutch — % Victorias en finales apretados', category: 'clutch', categoryLabel: 'Clutch', placeholder: '55.0', step: '0.5' },
      { id: 'clFgPct', label: 'FG% Clutch — % Tiros de campo en clutch', category: 'clutch', categoryLabel: 'Clutch', placeholder: '45.0', step: '0.5' },
      { id: 'clFg3Pct', label: '3P% Clutch — % Triples en clutch', category: 'clutch', categoryLabel: 'Clutch', placeholder: '35.0', step: '0.5' },
      { id: 'clFtPct', label: 'FT% Clutch — % Tiros libres en clutch', category: 'clutch', categoryLabel: 'Clutch', placeholder: '80.0', step: '0.5' },
      { id: 'clNetRtg', label: 'NetRtg Clutch — Diferencial / 100 pos en clutch', category: 'clutch', categoryLabel: 'Clutch', placeholder: '5.0', step: '1.0' },
      { id: 'clPlusMinus', label: '+/- Clutch — Impacto Más/Menos en clutch', category: 'clutch', categoryLabel: 'Clutch', placeholder: '1.5', step: '0.5' },
      { id: 'clOffRtg', label: 'OffRtg Clutch — Rating ofensivo en clutch', category: 'clutch', categoryLabel: 'Clutch', placeholder: '112.0', step: '0.5' },
      { id: 'clDefRtg', label: 'DefRtg Clutch — Rating defensivo en clutch', category: 'clutch', categoryLabel: 'Clutch', placeholder: '108.0', step: '0.5' },
      { id: 'clTsPct', label: 'TS% Clutch — True Shooting % en clutch', category: 'clutch', categoryLabel: 'Clutch', placeholder: '56.0', step: '0.5' },
      { id: 'buzzerBeaters', label: 'Buzzer Beaters (BB) — Tiros ganadores sobre la bocina (0.0s)', category: 'clutch', categoryLabel: 'Clutch', placeholder: '1', step: '1' },
      { id: 'gameWinners', label: 'Game Winners (GW) — Tiros ganadores definitivos (≤10s)', category: 'clutch', categoryLabel: 'Clutch', placeholder: '1', step: '1' },
    ],
  },
  {
    id: 'playtypes',
    label: '9. Playtypes (Synergy)',
    metrics: [
      { id: 'ptTopPpp', label: 'Top PPP — Puntos por posesión en jugada más usada', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '1.15', step: '0.05' },
      { id: 'ptSpotupPpp', label: 'SpotUp PPP — PPP en tiros estáticos tras pase', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '1.05', step: '0.05' },
      { id: 'ptSpotupPct', label: 'SpotUp % — % Frecuencia en tiros estáticos', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '20.0', step: '0.5' },
      { id: 'ptPrbhPpp', label: 'P&R Man. PPP — PPP en Pick & Roll como manejador', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '0.92', step: '0.05' },
      { id: 'ptPrbhPct', label: 'P&R Man. % — % Frecuencia Pick & Roll manejador', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '25.0', step: '0.5' },
      { id: 'ptTransPpp', label: 'Transic. PPP — PPP al contraataque / transición', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '1.20', step: '0.05' },
      { id: 'ptIsoPpp', label: 'Aislam. PPP — PPP en aclarados 1 contra 1 (ISO)', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '0.95', step: '0.05' },
      { id: 'ptPrrPpp', label: 'P&R Cont. PPP — PPP en Pick & Roll continuador (Roll Man)', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '1.25', step: '0.05' },
      { id: 'ptCutPpp', label: 'Corte PPP — PPP en cortes directos a canasta', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '1.30', step: '0.05' },
      { id: 'ptPostPpp', label: 'Poste PPP — PPP jugando al poste bajo', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '0.95', step: '0.05' },
      { id: 'ptHandoffPpp', label: 'Mano a Mano PPP — PPP en entrega mano a mano', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '0.95', step: '0.05' },
      { id: 'ptOffScrPpp', label: 'Sal. Bloq. PPP — PPP saliendo de bloqueos indirectos', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '1.00', step: '0.05' },
      { id: 'ptPutbackPpp', label: 'Reb. Of. PPP — PPP en palmeo tras rebote ofensivo', category: 'playtypes', categoryLabel: 'Playtypes', placeholder: '1.20', step: '0.05' },
    ],
  },
  {
    id: 'violations',
    label: '10. Infracciones y Faltas',
    metrics: [
      { id: 'totalViolations', label: 'Total Infracciones — Faltas e infracciones totales', category: 'violations', categoryLabel: 'Infracciones', placeholder: '5', step: '1' },
      { id: 'pf', label: 'FP — Faltas personales cometidas / PJ', category: 'violations', categoryLabel: 'Infracciones', placeholder: '2.5', step: '0.1' },
      { id: 'pfd', label: 'PFD — Faltas recibidas / provocadas / PJ', category: 'violations', categoryLabel: 'Infracciones', placeholder: '4.0', step: '0.1' },
      { id: 'blka', label: 'BLKA — Tapones recibidos de rivales / PJ', category: 'violations', categoryLabel: 'Infracciones', placeholder: '0.8', step: '0.1' },
      { id: 'tov', label: 'PER — Pérdidas de balón cometidas / PJ', category: 'violations', categoryLabel: 'Infracciones', placeholder: '2.5', step: '0.1' },
      { id: 'travel', label: 'Pasos — Infracciones de pasos cometidas', category: 'violations', categoryLabel: 'Infracciones', placeholder: '3', step: '1' },
      { id: 'doubleDribble', label: 'Dobles — Infracciones por doblar bote', category: 'violations', categoryLabel: 'Infracciones', placeholder: '1', step: '1' },
      { id: 'offThreeSec', label: '3s Ataque — Violaciones de 3 segundos en zona ofensiva', category: 'violations', categoryLabel: 'Infracciones', placeholder: '1', step: '1' },
      { id: 'defThreeSec', label: '3s Defensa — Infracciones de 3 segundos defensivos', category: 'violations', categoryLabel: 'Infracciones', placeholder: '1', step: '1' },
      { id: 'shotClock', label: 'Reloj 24s — Pérdidas por agotamiento de posesión', category: 'violations', categoryLabel: 'Infracciones', placeholder: '3', step: '1' },
      { id: 'backcourt', label: 'Campo Atrás — Violaciones de campo atrás', category: 'violations', categoryLabel: 'Infracciones', placeholder: '1', step: '1' },
      { id: 'offFoul', label: 'Falta Ataque — Faltas en ataque cometidas', category: 'violations', categoryLabel: 'Infracciones', placeholder: '3', step: '1' },
      { id: 'chargeViol', label: 'Carga Of. — Cargas de ataque cometidas', category: 'violations', categoryLabel: 'Infracciones', placeholder: '2', step: '1' },
      { id: 'kickedBall', label: 'Pie (Kick Ball) — Balones tocados con el pie', category: 'violations', categoryLabel: 'Infracciones', placeholder: '1', step: '1' },
      { id: 'dd2', label: 'DD2 — Dobles-Dobles logrados en temporada', category: 'violations', categoryLabel: 'Infracciones', scope: 'player', placeholder: '10', step: '1' },
      { id: 'td3', label: 'TD3 — Triples-Dobles logrados en temporada', category: 'violations', categoryLabel: 'Infracciones', scope: 'player', placeholder: '2', step: '1' },
      { id: 'fantasyPts', label: 'NBA FPTS — Puntos Fantasy NBA por partido', category: 'violations', categoryLabel: 'Infracciones', placeholder: '35.0', step: '0.5' },
    ],
  },
];

export const FILTERABLE_METRICS: FilterableMetricDef[] = FILTERABLE_METRIC_CATEGORIES.flatMap(
  (c) => c.metrics
);

function matchPlayTypeInternal(rowType: string, key: string): boolean {
  const a = String(rowType || '').toLowerCase();
  const b = String(key || '').toLowerCase();
  if (a === b) return true;
  if (
    (a === 'offrebound' || a === 'putback' || a === 'putbacks') &&
    (b === 'offrebound' || b === 'putback' || b === 'putbacks')
  ) {
    return true;
  }
  return a.includes(b) || b.includes(a);
}

function findPlaytypePpp(summary: any, playTypeKey: string): number | null {
  if (!summary) return null;
  const arr = Array.isArray(summary.offensive)
    ? summary.offensive
    : Array.isArray(summary)
    ? summary
    : [];
  const row = arr.find((x: any) => matchPlayTypeInternal(x?.playType, playTypeKey));
  return typeof row?.ppp === 'number' && Number.isFinite(row.ppp) ? row.ppp : null;
}

function findPlaytypePct(summary: any, playTypeKey: string): number | null {
  if (!summary) return null;
  const arr = Array.isArray(summary.offensive)
    ? summary.offensive
    : Array.isArray(summary)
    ? summary
    : [];
  const row = arr.find((x: any) => matchPlayTypeInternal(x?.playType, playTypeKey));
  return typeof row?.possPct === 'number' && Number.isFinite(row.possPct) ? row.possPct : null;
}

export function getMetricPlaceholder(metricId?: string): string {
  if (!metricId || metricId === 'all') return 'Valor';
  const found = FILTERABLE_METRICS.find((m) => m.id === metricId);
  return found?.placeholder || 'Valor';
}

export function getMetricStep(metricId?: string): string {
  if (!metricId || metricId === 'all') return '0.1';
  const found = FILTERABLE_METRICS.find((m) => m.id === metricId);
  return found?.step || '0.1';
}

export function getFilterMetricValue(
  candidate: any,
  metricId: string,
  isTeam: boolean,
  basePlayer?: any
): number | null {
  if (!candidate && !basePlayer) return null;
  const p = candidate || {};
  const bp = basePlayer || {};
  const adv = p.advanced || bp.advanced || {};
  const games: any[] = Array.isArray(p.games) && p.games.length > 0 ? p.games : (Array.isArray(bp.games) ? bp.games : []);

  const numVal = (v: any): number | null => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const meanOf = (fn: (g: any) => number): number | null => {
    if (games.length === 0) return null;
    const s = games.reduce((acc, g) => acc + (fn(g) || 0), 0);
    return Math.round((s / games.length) * 10) / 10;
  };

  switch (metricId) {
    // 1. Básicas & Caja / Balance
    case 'pts': {
      if (isTeam) return numVal(p.ptsAvg ?? p.avgPointsFor ?? p.ppg ?? p.pts ?? meanOf((g) => g.pointsFor));
      return numVal(p.ptsBase ?? p.points ?? meanOf((g) => g.points));
    }
    case 'reb': {
      if (isTeam) return numVal(p.rebAvg ?? p.rebPerGame ?? p.reb ?? meanOf((g) => g.reb));
      return numVal(p.rebBase ?? p.rebounds ?? meanOf((g) => g.rebounds));
    }
    case 'oreb': {
      if (isTeam) return numVal(p.orebAvg ?? p.oreb ?? meanOf((g) => g.oreb));
      return numVal(p.orebBase ?? p.oreb ?? meanOf((g) => g.oreb));
    }
    case 'dreb': {
      if (isTeam) return numVal(p.drebAvg ?? p.dreb ?? meanOf((g) => g.dreb));
      return numVal(p.drebBase ?? p.dreb ?? meanOf((g) => g.dreb));
    }
    case 'ast': {
      if (isTeam) return numVal(p.astAvg ?? p.astPerGame ?? p.ast ?? meanOf((g) => g.ast));
      return numVal(p.astBase ?? p.assists ?? meanOf((g) => g.assists));
    }
    case 'stl': {
      if (isTeam) return numVal(p.stlAvg ?? p.stl ?? meanOf((g) => g.stl));
      return numVal(p.stlBase ?? p.steals ?? meanOf((g) => g.steals));
    }
    case 'blk': {
      if (isTeam) return numVal(p.blkAvg ?? p.blk ?? meanOf((g) => g.blk));
      return numVal(p.blkBase ?? p.blocks ?? meanOf((g) => g.blocks));
    }
    case 'stocks': {
      const sVal = p.stocksBase ?? (p.stlBase !== undefined && p.blkBase !== undefined ? p.stlBase + p.blkBase : (p.stl !== undefined && p.blk !== undefined ? p.stl + p.blk : null));
      return numVal(sVal ?? meanOf((g) => g.stocks ?? (g.steals + g.blocks)));
    }
    case 'fgPct': {
      return numVal(p.fgPct ?? adv.fgPct);
    }
    case 'fgm': {
      if (isTeam) return numVal(p.fgmAvg ?? p.fgm ?? meanOf((g) => g.fgm));
      return numVal(p.fgmBase ?? p.fgm ?? meanOf((g) => g.fgm));
    }
    case 'fga': {
      if (isTeam) return numVal(p.fgaAvg ?? p.fga ?? meanOf((g) => g.fga));
      return numVal(p.fgaBase ?? p.fga ?? meanOf((g) => g.fga));
    }
    case 'fg3Pct': {
      return numVal(p.fg3Pct ?? adv.fg3Pct);
    }
    case 'fg3m': {
      if (isTeam) return numVal(p.fg3mAvg ?? p.fg3m ?? meanOf((g) => g.fg3m));
      return numVal(p.fg3mBase ?? p.fg3m ?? meanOf((g) => g.fg3m));
    }
    case 'fg3a': {
      if (isTeam) return numVal(p.fg3aAvg ?? p.fg3a ?? meanOf((g) => g.fg3a));
      return numVal(p.fg3aBase ?? p.fg3a ?? meanOf((g) => g.fg3a));
    }
    case 'ftPct': {
      return numVal(p.ftPct ?? adv.ftPct);
    }
    case 'ftm': {
      if (isTeam) return numVal(p.ftmAvg ?? p.ftm ?? meanOf((g) => g.ftm));
      return numVal(p.ftmBase ?? p.ftm ?? meanOf((g) => g.ftm));
    }
    case 'fta': {
      if (isTeam) return numVal(p.ftaAvg ?? p.fta ?? meanOf((g) => g.fta));
      return numVal(p.ftaBase ?? p.fta ?? meanOf((g) => g.fta));
    }
    case 'plusMinus': {
      if (isTeam) return numVal(p.differentialAvg ?? p.differential ?? p.diffPpg ?? p.plusMinus ?? meanOf((g) => g.differential));
      return numVal(p.plusMinusBase ?? p.plusMinusAvg ?? p.plusMinus ?? meanOf((g) => g.plusMinus));
    }
    case 'pctDelta': {
      return numVal(p.pctDelta);
    }
    case 'winPct': {
      const rawW = p.winPct ?? p.wPct ?? (p.wins !== undefined && p.losses !== undefined && (p.wins + p.losses > 0) ? p.wins / (p.wins + p.losses) : (p.w !== undefined && p.l !== undefined && (p.w + p.l > 0) ? p.w / (p.w + p.l) : null));
      if (rawW === null) return null;
      return rawW > 0 && rawW <= 1 ? Math.round(rawW * 1000) / 10 : Math.round(rawW * 10) / 10;
    }
    case 'ptsAgainst': {
      return numVal(p.ptsAgainstAvg ?? p.avgPointsAgainst ?? p.oppPpg ?? meanOf((g) => g.pointsAgainst));
    }
    case 'diff': {
      return numVal(p.differentialAvg ?? p.differential ?? p.diffPpg ?? p.plusMinus ?? meanOf((g) => g.differential));
    }

    // 2. Avanzadas e Impacto / 4 Factores
    case 'netRtg': {
      return numVal(p.netRtg ?? adv.netRtg ?? p.advFourFactors?.netRtg);
    }
    case 'offRtg': {
      return numVal(p.offRtg ?? adv.offRtg ?? p.advFourFactors?.offRtg);
    }
    case 'defRtg': {
      return numVal(p.defRtg ?? adv.defRtg ?? p.advFourFactors?.defRtg);
    }
    case 'pace': {
      return numVal(p.pace ?? adv.pace ?? p.advFourFactors?.pace);
    }
    case 'tsPct': {
      return numVal(p.tsPct ?? p.calcTs ?? adv.tsPct ?? p.advFourFactors?.tsPct);
    }
    case 'efgPct': {
      return numVal(p.efgPct ?? p.calcEfg ?? adv.efgPct ?? p.advFourFactors?.efgPct);
    }
    case 'usgPct': {
      return numVal(p.usgPct ?? p.usgAvg ?? adv.usgPct ?? p.advFourFactors?.usgPct ?? meanOf((g) => g.usgEst));
    }
    case 'pie': {
      return numVal(p.pie ?? adv.pie ?? p.advFourFactors?.pie);
    }
    case 'gmSc': {
      return numVal(p.gmSc ?? meanOf((g) => g.gameScore));
    }
    case 'astTo': {
      return numVal(p.astTo ?? p.astTovRatio ?? adv.astTo ?? p.advFourFactors?.astTo);
    }
    case 'astPct': {
      return numVal(p.astPct ?? adv.astPct ?? p.advFourFactors?.astPct);
    }
    case 'astRatio': {
      return numVal(p.astRatio ?? adv.astRatio ?? p.advFourFactors?.astRatio);
    }
    case 'orebPct': {
      return numVal(p.orebPct ?? adv.orebPct ?? p.advFourFactors?.orebPct);
    }
    case 'drebPct': {
      return numVal(p.drebPct ?? adv.drebPct ?? p.advFourFactors?.drebPct);
    }
    case 'rebPct': {
      return numVal(p.rebPct ?? adv.rebPct ?? p.advFourFactors?.rebPct);
    }
    case 'tovPct': {
      return numVal(p.tovPct ?? p.tmTovPct ?? adv.tovPct ?? p.advFourFactors?.tmTovPct);
    }
    case 'ftaRate': {
      return numVal(p.ftaRate ?? p.advFourFactors?.ftaRate);
    }
    case 'oppEfgPct': {
      return numVal(p.advFourFactors?.oppEfgPct);
    }
    case 'oppTovPct': {
      return numVal(p.advFourFactors?.oppTovPct);
    }
    case 'oppOrebPct': {
      return numVal(p.advFourFactors?.oppOrebPct);
    }
    case 'oppFtaRate': {
      return numVal(p.advFourFactors?.oppFtaRate);
    }

    // 3. Tiro y Scoring Splits
    case 'pctFga2pt': {
      return numVal(p.advScoring?.pctFga2pt ?? p.pctFga2pt);
    }
    case 'pctFga3pt': {
      return numVal(p.advScoring?.pctFga3pt ?? p.pctFga3pt);
    }
    case 'pctPts2pt': {
      return numVal(p.advScoring?.pctPts2pt ?? p.pctPts2pt);
    }
    case 'pctPts2ptMr': {
      return numVal(p.advScoring?.pctPts2ptMr ?? p.pctPts2ptMr);
    }
    case 'pctPts3pt': {
      return numVal(p.advScoring?.pctPts3pt ?? p.pctPts3pt ?? p.pctPts3p);
    }
    case 'pctPtsFb': {
      return numVal(p.advScoring?.pctPtsFb ?? p.pctPtsFb);
    }
    case 'pctPtsFt': {
      return numVal(p.advScoring?.pctPtsFt ?? p.pctPtsFt);
    }
    case 'pctPtsOffTov': {
      return numVal(p.advScoring?.pctPtsOffTov ?? p.pctPtsOffTov);
    }
    case 'pctPtsPaint': {
      return numVal(p.advScoring?.pctPtsPaint ?? p.pctPtsPaint);
    }
    case 'pctAstFgm': {
      return numVal(p.advScoring?.pctAstFgm ?? p.pctAstFgm);
    }
    case 'pctUastFgm': {
      return numVal(p.advScoring?.pctUastFgm ?? p.pctUastFgm);
    }

    // 4. Zonas de Tiro (Shot Zones)
    case 'raFga': {
      return numVal(p.advZones?.restrictedArea?.fga ?? p.raFga);
    }
    case 'raFgPct': {
      return numVal(p.advZones?.restrictedArea?.fgPct ?? p.advZones?.raFgPct ?? p.raFgPct);
    }
    case 'paintNonRaFga': {
      return numVal(p.advZones?.paintNonRa?.fga ?? p.paintNonRaFga);
    }
    case 'paintNonRaFgPct': {
      return numVal(p.advZones?.paintNonRa?.fgPct ?? p.advZones?.paintFgPct ?? p.paintNonRaFgPct);
    }
    case 'midFga': {
      return numVal(p.advZones?.midRange?.fga ?? p.midFga);
    }
    case 'midFgPct': {
      return numVal(p.advZones?.midRange?.fgPct ?? p.advZones?.midFgPct ?? p.midFgPct);
    }
    case 'corner3Fga': {
      return numVal(p.advZones?.corner3?.fga ?? p.corner3Fga);
    }
    case 'corner3FgPct': {
      return numVal(p.advZones?.corner3?.fgPct ?? p.advZones?.corner3FgPct ?? p.corner3FgPct);
    }
    case 'ab3Fga': {
      return numVal(p.advZones?.aboveBreak3?.fga ?? p.ab3Fga);
    }
    case 'ab3FgPct': {
      return numVal(p.advZones?.aboveBreak3?.fgPct ?? p.advZones?.above3FgPct ?? p.ab3FgPct);
    }
    case 'totalThreeFga': {
      return numVal(p.advZones?.totalThreeFga ?? p.totalThreeFga);
    }
    case 'threeFgPct': {
      return numVal(p.advZones?.threeFgPct ?? p.threeFgPct);
    }

    // 5. Tracking Óptico
    case 'drives': {
      return numVal(p.advTracking?.drives ?? p.drives);
    }
    case 'drivePts': {
      return numVal(p.advTracking?.drivePts ?? p.drivePts);
    }
    case 'driveFgPct': {
      return numVal(p.advTracking?.driveFgPct ?? p.driveFgPct);
    }
    case 'driveAstPct': {
      return numVal(p.advTracking?.driveAstPct ?? p.driveAstPct);
    }
    case 'drivePassesPct': {
      return numVal(p.advTracking?.drivePassesPct ?? p.drivePassesPct);
    }
    case 'catchShootPts': {
      return numVal(p.advTracking?.catchShootPts ?? p.catchShootPts);
    }
    case 'catchShootFg3Pct': {
      return numVal(p.advTracking?.catchShootFg3Pct ?? p.catchShootFg3Pct);
    }
    case 'pullUpPts': {
      return numVal(p.advTracking?.pullUpPts ?? p.pullUpPts);
    }
    case 'pullUpFg3Pct': {
      return numVal(p.advTracking?.pullUpFg3Pct ?? p.pullUpFg3Pct);
    }
    case 'passesMade': {
      return numVal(p.advTracking?.passesMade ?? p.passesMade);
    }
    case 'passesReceived': {
      return numVal(p.advTracking?.passesReceived ?? p.passesReceived);
    }
    case 'potentialAst': {
      return numVal(p.advTracking?.potentialAst ?? p.potentialAst);
    }
    case 'astPtsCreated': {
      return numVal(p.advTracking?.astPtsCreated ?? p.astPtsCreated);
    }
    case 'touches': {
      return numVal(p.advTracking?.touches ?? p.touches);
    }
    case 'timeOfPoss': {
      return numVal(p.advTracking?.timeOfPoss ?? p.timeOfPoss);
    }
    case 'distMiles': {
      return numVal(p.advTracking?.distMiles ?? p.distMiles);
    }
    case 'avgSpeed': {
      return numVal(p.advTracking?.avgSpeed ?? p.avgSpeed);
    }
    case 'rebChances': {
      return numVal(p.advTracking?.rebChances ?? p.rebChances);
    }

    // 6. Hustle y Pintura
    case 'ptsPaint': {
      return numVal(p.advDefHustle?.ptsPaint ?? p.ptsPaint ?? adv.ptsPaint ?? p.advViolations?.ptsPaint);
    }
    case 'pts2ndChance': {
      return numVal(p.advDefHustle?.pts2ndChance ?? p.pts2ndChance ?? adv.pts2ndChance ?? p.advViolations?.pts2ndChance);
    }
    case 'ptsFastBreak':
    case 'ptsFb': {
      return numVal(p.advDefHustle?.ptsFb ?? p.ptsFastBreak ?? p.ptsFb ?? adv.ptsFastBreak ?? p.advViolations?.ptsFb);
    }
    case 'ptsOffTov': {
      return numVal(p.advDefHustle?.ptsOffTov ?? p.ptsOffTov ?? adv.ptsOffTov ?? p.advViolations?.ptsOffTov);
    }
    case 'contestedShots': {
      return numVal(p.advDefHustle?.contestedShots ?? p.contestedShots ?? adv.contestedShots);
    }
    case 'contestedShots2pt': {
      return numVal(p.advDefHustle?.contestedShots2pt ?? p.contestedShots2pt);
    }
    case 'contestedShots3pt': {
      return numVal(p.advDefHustle?.contestedShots3pt ?? p.contestedShots3pt);
    }
    case 'deflections': {
      return numVal(p.advDefHustle?.deflections ?? p.deflections ?? adv.deflections);
    }
    case 'chargesDrawn': {
      return numVal(p.advDefHustle?.chargesDrawn ?? p.chargesDrawn ?? adv.chargesDrawn);
    }
    case 'screenAssists': {
      return numVal(p.advDefHustle?.screenAssists ?? p.screenAssists ?? adv.screenAssists);
    }
    case 'screenAstPts': {
      return numVal(p.advDefHustle?.screenAstPts ?? p.screenAstPts);
    }
    case 'looseBalls': {
      return numVal(p.advDefHustle?.looseBalls ?? p.looseBalls ?? adv.looseBalls);
    }
    case 'boxOuts': {
      return numVal(p.advDefHustle?.boxOuts ?? p.boxOuts ?? adv.boxOuts);
    }

    // 7. Defensa y DFG%
    case 'defRating': {
      return numVal(p.advDefHustle?.defRating ?? (p.defRtg > 0 ? p.defRtg : null) ?? adv.defRtg);
    }
    case 'dFga': {
      return numVal(p.advDefHustle?.dFga ?? p.dFga);
    }
    case 'dFgm': {
      return numVal(p.advDefHustle?.dFgm ?? p.dFgm);
    }
    case 'dFgPct': {
      return numVal(p.advDefHustle?.dFgPct ?? p.dFgPct);
    }
    case 'normalFgPct': {
      return numVal(p.advDefHustle?.normalFgPct ?? p.normalFgPct);
    }
    case 'pctPlusMinus': {
      return numVal(p.advDefHustle?.pctPlusMinus ?? p.pctPlusMinus);
    }
    case 'defFreq': {
      return numVal(p.advDefHustle?.defFreq ?? p.defFreq);
    }
    case 'oppPtsPaint': {
      return numVal(p.advDefHustle?.oppPtsPaint ?? p.oppPtsPaint ?? adv.oppPtsPaint ?? p.advViolations?.oppPtsPaint);
    }
    case 'oppPtsFb': {
      return numVal(p.advDefHustle?.oppPtsFb ?? p.oppPtsFb ?? p.advViolations?.oppPtsFb);
    }
    case 'oppPtsOffTov': {
      return numVal(p.advDefHustle?.oppPtsOffTov ?? p.oppPtsOffTov ?? p.advViolations?.oppPtsOffTov);
    }
    case 'oppPts': {
      return numVal(p.advDefHustle?.oppPts ?? p.avgPointsAgainst ?? p.ptsAgainstAvg);
    }
    case 'oppFgPct': {
      return numVal(p.advDefHustle?.oppFgPct);
    }
    case 'oppFg3Pct': {
      return numVal(p.advDefHustle?.oppFg3Pct);
    }
    case 'oppReb': {
      return numVal(p.advDefHustle?.oppReb);
    }
    case 'oppAst': {
      return numVal(p.advDefHustle?.oppAst);
    }
    case 'oppTov': {
      return numVal(p.advDefHustle?.oppTov);
    }
    case 'oppPts2ndChance': {
      return numVal(p.advDefHustle?.oppPts2ndChance ?? p.advanced?.oppPts2ndChance);
    }

    // 8. Clutch (<5m, ±5)
    case 'clPts':
    case 'clutchPts': {
      return numVal(p.advClutch?.pts ?? p.clPts ?? p.clutchPts);
    }
    case 'clMin':
    case 'clutchMin': {
      return numVal(p.advClutch?.min ?? p.clMin ?? p.clutchMin);
    }
    case 'clWPct': {
      return numVal(p.advClutch?.wPct ?? p.clWPct);
    }
    case 'clFgPct':
    case 'clutchFgPct': {
      return numVal(p.advClutch?.fgPct ?? p.clFgPct ?? p.clutchFgPct);
    }
    case 'clFg3Pct':
    case 'clutchFg3Pct': {
      return numVal(p.advClutch?.fg3Pct ?? p.clFg3Pct ?? p.clutchFg3Pct);
    }
    case 'clFtPct':
    case 'clutchFtPct': {
      return numVal(p.advClutch?.ftPct ?? p.clFtPct ?? p.clutchFtPct);
    }
    case 'clNetRtg':
    case 'clutchNetRtg': {
      return numVal(p.advClutch?.netRtg ?? p.clNetRtg ?? p.clutchNetRtg);
    }
    case 'clPlusMinus':
    case 'clutchPlusMinus': {
      return numVal(p.advClutch?.plusMinus ?? p.clPlusMinus ?? p.clutchPlusMinus);
    }
    case 'clOffRtg': {
      return numVal(p.advClutch?.offRtg ?? p.clOffRtg);
    }
    case 'clDefRtg': {
      return numVal(p.advClutch?.defRtg ?? p.clDefRtg);
    }
    case 'clTsPct': {
      return numVal(p.advClutch?.tsPct ?? p.clTsPct);
    }
    case 'buzzerBeaters': {
      return numVal(p.buzzerBeaters ?? p.advClutch?.buzzerBeaters);
    }
    case 'gameWinners': {
      return numVal(p.gameWinners ?? p.advClutch?.gameWinners);
    }

    // 9. Playtypes (Synergy)
    case 'ptTopPpp': {
      return numVal(p.advPlaytypes?.topPlayTypeOff?.ppp);
    }
    case 'ptSpotupPpp': {
      return numVal(findPlaytypePpp(p.advPlaytypes, 'Spotup'));
    }
    case 'ptSpotupPct': {
      return numVal(findPlaytypePct(p.advPlaytypes, 'Spotup'));
    }
    case 'ptPrbhPpp': {
      return numVal(findPlaytypePpp(p.advPlaytypes, 'PRBallHandler'));
    }
    case 'ptPrbhPct': {
      return numVal(findPlaytypePct(p.advPlaytypes, 'PRBallHandler'));
    }
    case 'ptTransPpp': {
      return numVal(findPlaytypePpp(p.advPlaytypes, 'Transition'));
    }
    case 'ptIsoPpp': {
      return numVal(findPlaytypePpp(p.advPlaytypes, 'Isolation'));
    }
    case 'ptPrrPpp': {
      return numVal(findPlaytypePpp(p.advPlaytypes, 'PRRollMan'));
    }
    case 'ptCutPpp': {
      return numVal(findPlaytypePpp(p.advPlaytypes, 'Cut'));
    }
    case 'ptPostPpp': {
      return numVal(findPlaytypePpp(p.advPlaytypes, 'Postup'));
    }
    case 'ptHandoffPpp': {
      return numVal(findPlaytypePpp(p.advPlaytypes, 'Handoff'));
    }
    case 'ptOffScrPpp': {
      return numVal(findPlaytypePpp(p.advPlaytypes, 'OffScreen'));
    }
    case 'ptPutbackPpp': {
      return numVal(findPlaytypePpp(p.advPlaytypes, 'OffRebound'));
    }

    // 10. Infracciones y Faltas
    case 'totalViolations': {
      return numVal(p.advViolations?.totalViolations ?? p.totalViolations);
    }
    case 'pf': {
      return numVal(p.advViolations?.pf ?? p.pfBase ?? p.pfAvg ?? p.pf ?? p.fouls ?? meanOf((g) => g.fouls));
    }
    case 'pfd': {
      return numVal(p.advViolations?.pfd ?? p.pfdBase ?? p.pfdAvg ?? p.pfd ?? p.foulsDrawn ?? adv.foulsDrawn);
    }
    case 'blka': {
      return numVal(p.advViolations?.blka ?? p.blkaBase ?? p.blkaAvg ?? p.blka ?? adv.blka);
    }
    case 'tov': {
      return numVal(p.advViolations?.tov ?? p.tovBase ?? p.tovAvg ?? p.tov ?? p.turnovers ?? meanOf((g) => g.turnovers));
    }
    case 'travel': {
      return numVal(p.advViolations?.travel ?? p.travel);
    }
    case 'doubleDribble': {
      return numVal(p.advViolations?.doubleDribble ?? p.doubleDribble);
    }
    case 'offThreeSec': {
      return numVal(p.advViolations?.offThreeSec ?? p.offThreeSec);
    }
    case 'defThreeSec': {
      return numVal(p.advViolations?.defThreeSec ?? p.defThreeSec);
    }
    case 'shotClock': {
      return numVal(p.advViolations?.shotClock ?? p.shotClock);
    }
    case 'backcourt': {
      return numVal(p.advViolations?.backcourt ?? p.backcourt);
    }
    case 'offFoul': {
      return numVal(p.advViolations?.offFoul ?? p.offFoul);
    }
    case 'chargeViol': {
      return numVal(p.advViolations?.charge ?? p.chargeViol);
    }
    case 'kickedBall': {
      return numVal(p.advViolations?.kickedBall ?? p.kickedBall);
    }
    case 'dd2': {
      return numVal(p.dd2 ?? p.advViolations?.dd2);
    }
    case 'td3': {
      return numVal(p.td3 ?? p.advViolations?.td3);
    }
    case 'fantasyPts': {
      return numVal(p.fantasyPts ?? p.advViolations?.nbaFantasyPts);
    }

    default: {
      return numVal(p[metricId] ?? adv[metricId]);
    }
  }
}

export function evaluateSingleStatFilter(
  candidate: any,
  filter: SingleStatFilter | undefined,
  isTeam: boolean,
  basePlayer?: any
): boolean {
  if (
    !filter ||
    filter.metric === 'all' ||
    filter.value === '' ||
    Number.isNaN(Number(filter.value))
  ) {
    return true;
  }
  const targetVal = Number(filter.value);
  const val = getFilterMetricValue(candidate, filter.metric, isTeam, basePlayer);
  if (val === null || val === undefined || Number.isNaN(val)) {
    // Si la métrica no existe para esta entidad, no supera el filtro
    return false;
  }
  if (filter.operator === 'gte') {
    return val >= targetVal;
  }
  if (filter.operator === 'lte') {
    return val <= targetVal;
  }
  return true;
}

export function matchesPlayerUnifiedFilters(
  candidate: PlayerFilterableCandidate,
  filters: UnifiedTableFiltersState,
  lookup?: PlayerLookupContext
): boolean {
  const pid = String(candidate.id || candidate.playerId || candidate.entityId || '').trim();
  const basePlayer = pid && lookup ? lookup.playerById.get(pid) : undefined;

  const teamAbbr = String(
    candidate.teamAbbr || basePlayer?.teamAbbr || ''
  )
    .toUpperCase()
    .trim();

  if (filters.team !== 'all' && teamAbbr !== filters.team) {
    return false;
  }

  const conf =
    getTeamConference(teamAbbr) ||
    normalizeConferenceEs(candidate.conference) ||
    (teamAbbr && lookup ? normalizeConferenceEs(lookup.teamByAbbr.get(teamAbbr)?.conference) : null) ||
    '';

  if (filters.conference !== 'all' && conf !== filters.conference) {
    return false;
  }

  const div = getTeamDivision(teamAbbr);
  if (filters.division !== 'all' && div !== filters.division) {
    return false;
  }

  const country = String(candidate.country || basePlayer?.country || '').trim();
  if (filters.country !== 'all' && country !== filters.country) {
    return false;
  }

  const birthYear = candidate.birthYear ?? basePlayer?.birthYear;
  if (filters.birthYear !== 'all' && String(birthYear ?? '') !== filters.birthYear) {
    return false;
  }

  const position = candidate.position || basePlayer?.position;
  if (!matchesPositionCategory(position, filters.position)) {
    return false;
  }

  // Selección Libre de Partidos Jugados (PJ mín.)
  if (filters.minGp !== '' && filters.minGp !== 'all' && Number(filters.minGp) > 0) {
    const gp =
      candidate.gp ??
      (Array.isArray(candidate.games) ? candidate.games.length : (basePlayer?.games?.length ?? 0));
    if (gp < Number(filters.minGp)) {
      return false;
    }
  }

  // Selección Libre de Minutos por Partido (MIN mín.)
  if (filters.minMinutes !== '' && filters.minMinutes !== 'all' && Number(filters.minMinutes) > 0) {
    let minAvg = candidate.minBase ?? candidate.min;
    if (minAvg === undefined || minAvg === null) {
      const gList = Array.isArray(candidate.games) && candidate.games.length > 0 ? candidate.games : basePlayer?.games;
      if (Array.isArray(gList) && gList.length > 0) {
        minAvg = gList.reduce((acc: number, g: any) => acc + (Number(g.minutes ?? g.min) || 0), 0) / gList.length;
      } else {
        minAvg = 0;
      }
    }
    if (minAvg < Number(filters.minMinutes)) {
      return false;
    }
  }

  // Doble Filtro Estadístico Universal
  if (!evaluateSingleStatFilter(candidate, filters.statFilter1, false, basePlayer)) {
    return false;
  }
  if (!evaluateSingleStatFilter(candidate, filters.statFilter2, false, basePlayer)) {
    return false;
  }

  // Compatibilidad hacia atrás con ratioMetric si se usó
  if (
    (!filters.statFilter1 || filters.statFilter1.metric === 'all') &&
    filters.ratioMetric &&
    filters.ratioMetric !== 'all' &&
    filters.ratioValue !== '' &&
    !Number.isNaN(Number(filters.ratioValue))
  ) {
    const targetVal = Number(filters.ratioValue);
    const adv = candidate.advanced || basePlayer?.advanced || {};
    let playerVal: number | null = null;
    switch (filters.ratioMetric) {
      case 'tsPct':
        playerVal = Number(candidate.tsPct ?? adv.tsPct);
        break;
      case 'efgPct':
        playerVal = Number(candidate.efgPct ?? adv.efgPct);
        break;
      case 'netRtg':
        playerVal = Number(candidate.netRtg ?? adv.netRtg);
        break;
      case 'offRtg':
        playerVal = Number(candidate.offRtg ?? adv.offRtg);
        break;
      case 'defRtg':
        playerVal = Number(candidate.defRtg ?? adv.defRtg);
        break;
      case 'usgPct':
        playerVal = Number(candidate.usgPct ?? adv.usgPct);
        break;
      case 'astTo':
        playerVal = Number(candidate.astTo ?? adv.astTo);
        break;
      case 'pie':
        playerVal = Number(candidate.pie ?? adv.pie);
        break;
    }
    if (playerVal !== null && !Number.isNaN(playerVal)) {
      if (filters.ratioOperator === 'gte' && playerVal < targetVal) return false;
      if (filters.ratioOperator === 'lte' && playerVal > targetVal) return false;
    }
  }

  return true;
}

export function matchesTeamUnifiedFilters(
  candidate: {
    abbreviation?: string;
    teamAbbr?: string;
    entityId?: string;
    conference?: string;
    gp?: number;
    wins?: number;
    losses?: number;
    winPct?: number;
    games?: any[];
    advanced?: any;
    tsPct?: number;
    efgPct?: number;
    netRtg?: number;
    offRtg?: number;
    defRtg?: number;
    pie?: number;
    astTo?: number;
    [key: string]: any;
  },
  filters: UnifiedTableFiltersState
): boolean {
  const abbr = String(
    candidate.abbreviation || candidate.teamAbbr || candidate.entityId || ''
  )
    .toUpperCase()
    .trim();

  if (filters.team !== 'all' && abbr !== filters.team) {
    return false;
  }

  const conf = getTeamConference(abbr) || normalizeConferenceEs(candidate.conference) || '';
  if (filters.conference !== 'all' && conf !== filters.conference) {
    return false;
  }

  const div = getTeamDivision(abbr);
  if (filters.division !== 'all' && div !== filters.division) {
    return false;
  }

  // Selección Libre de Partidos Jugados (PJ mín.) en Equipos
  if (filters.minGp !== '' && filters.minGp !== 'all' && Number(filters.minGp) > 0) {
    const gp =
      candidate.gp ??
      (Array.isArray(candidate.games)
        ? candidate.games.length
        : candidate.wins !== undefined && candidate.losses !== undefined
        ? candidate.wins + candidate.losses
        : 0);
    if (gp < Number(filters.minGp)) {
      return false;
    }
  }

  // Doble Filtro Estadístico Universal
  if (!evaluateSingleStatFilter(candidate, filters.statFilter1, true)) {
    return false;
  }
  if (!evaluateSingleStatFilter(candidate, filters.statFilter2, true)) {
    return false;
  }

  // Compatibilidad hacia atrás con ratioMetric en equipos si se usó
  if (
    (!filters.statFilter1 || filters.statFilter1.metric === 'all') &&
    filters.ratioMetric &&
    filters.ratioMetric !== 'all' &&
    filters.ratioValue !== '' &&
    !Number.isNaN(Number(filters.ratioValue))
  ) {
    const targetVal = Number(filters.ratioValue);
    let teamVal: number | null = null;
    const adv = candidate.advanced || {};

    switch (filters.ratioMetric) {
      case 'winPct': {
        const rawW =
          candidate.winPct !== undefined
            ? candidate.winPct
            : candidate.wins !== undefined &&
              candidate.losses !== undefined &&
              candidate.wins + candidate.losses > 0
            ? candidate.wins / (candidate.wins + candidate.losses)
            : 0;
        teamVal = rawW > 0 && rawW <= 1 ? rawW * 100 : rawW;
        break;
      }
      case 'tsPct':
        teamVal = Number(candidate.tsPct ?? adv.tsPct);
        break;
      case 'efgPct':
        teamVal = Number(candidate.efgPct ?? adv.efgPct);
        break;
      case 'netRtg':
        teamVal = Number(candidate.netRtg ?? adv.netRtg);
        break;
      case 'offRtg':
        teamVal = Number(candidate.offRtg ?? adv.offRtg);
        break;
      case 'defRtg':
        teamVal = Number(candidate.defRtg ?? adv.defRtg);
        break;
      case 'pie':
        teamVal = Number(candidate.pie ?? adv.pie);
        break;
      case 'astTo':
        teamVal = Number(candidate.astTo ?? adv.astTo);
        break;
    }

    if (teamVal !== null && !Number.isNaN(teamVal)) {
      if (filters.ratioOperator === 'gte' && teamVal < targetVal) return false;
      if (filters.ratioOperator === 'lte' && teamVal > targetVal) return false;
    }
  }

  return true;
}

export function matchesLineupUnifiedFilters(
  candidate: {
    teamAbbr?: string;
    gp?: number;
    min?: number;
    [key: string]: any;
  },
  filters: UnifiedTableFiltersState
): boolean {
  const abbr = String(candidate.teamAbbr || '')
    .toUpperCase()
    .trim();

  if (filters.team !== 'all' && abbr !== filters.team) {
    return false;
  }

  const conf = getTeamConference(abbr) || '';
  if (filters.conference !== 'all' && conf !== filters.conference) {
    return false;
  }

  const div = getTeamDivision(abbr);
  if (filters.division !== 'all' && div !== filters.division) {
    return false;
  }

  if (filters.minGp !== '' && filters.minGp !== 'all' && Number(filters.minGp) > 0) {
    const gp = Number(candidate.gp ?? 0);
    if (gp < Number(filters.minGp)) {
      return false;
    }
  }

  if (filters.minMinutes !== '' && filters.minMinutes !== 'all' && Number(filters.minMinutes) > 0) {
    const min = Number(candidate.minPg ?? candidate.min ?? 0);
    if (min < Number(filters.minMinutes)) {
      return false;
    }
  }

  if (!evaluateSingleStatFilter(candidate, filters.statFilter1, true)) {
    return false;
  }
  if (!evaluateSingleStatFilter(candidate, filters.statFilter2, true)) {
    return false;
  }

  return true;
}

export function matchesEntityUnifiedFilters(
  candidate: PlayerFilterableCandidate & {
    entityType?: 'player' | 'team' | string;
    abbreviation?: string;
  },
  filters: UnifiedTableFiltersState,
  lookup?: PlayerLookupContext
): boolean {
  if (candidate.entityType === 'team') {
    if (
      filters.country !== 'all' ||
      filters.birthYear !== 'all' ||
      filters.position !== 'all'
    ) {
      return false;
    }
    return matchesTeamUnifiedFilters(
      {
        abbreviation: candidate.abbreviation || candidate.teamAbbr || candidate.entityId,
        conference: candidate.conference,
      },
      filters
    );
  }
  return matchesPlayerUnifiedFilters(candidate, filters, lookup);
}

