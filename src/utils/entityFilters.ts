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

export interface UnifiedTableFiltersState {
  conference: 'all' | NbaConferenceEs;
  division: 'all' | NbaDivisionEs;
  team: string;
  country: string;
  birthYear: string;
  position: UnifiedPositionFilter;
}

export const DEFAULT_UNIFIED_FILTERS: UnifiedTableFiltersState = {
  conference: 'all',
  division: 'all',
  team: 'all',
  country: 'all',
  birthYear: 'all',
  position: 'all',
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
  scope: 'player' | 'team' | 'mixed' = 'player'
): number {
  let count = 0;
  if (filters.conference !== 'all') count++;
  if (filters.division !== 'all') count++;
  if (filters.team !== 'all') count++;
  if (scope !== 'team') {
    if (filters.country !== 'all') count++;
    if (filters.birthYear !== 'all') count++;
    if (filters.position !== 'all') count++;
  }
  return count;
}

export function hasActiveUnifiedFilters(
  filters: UnifiedTableFiltersState,
  scope: 'player' | 'team' | 'mixed' = 'player'
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
  value: string
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

  return true;
}

export function matchesTeamUnifiedFilters(
  candidate: { abbreviation?: string; teamAbbr?: string; entityId?: string; conference?: string },
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
    // When a player-only filter is active, hide pure team rows if appropriate or keep team matching on team filters
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
