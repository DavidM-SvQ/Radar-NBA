import type { ActiveSection } from '../types/nba';

export type FantasyUrlTab =
  | 'lineup'
  | 'waivers'
  | 'trades'
  | 'injuries_rules'
  | 'rules';

export interface AppRouteState {
  section: ActiveSection;
  inspectedType: 'player' | 'team' | null;
  inspectedId: string | null;
  gamedayDate: string | null;
  gamedayReportId: string | null;
  duelPlayerAId: string | null;
  duelPlayerBId: string | null;
  comparatorType: 'player' | 'team';
  comparatorId: string | null;
  fantasyTab: FantasyUrlTab;
}

export interface RadarHistoryMeta {
  __radarNba: true;
  depth: number;
  openedOverlay?: 'inspector' | 'game_report' | null;
}

const VALID_SECTIONS = new Set<ActiveSection>([
  'home',
  'gameday',
  'anomalies',
  'streaks',
  'duel',
  'milestones',
  'comparator',
  'teams',
  'players',
  'fantasy_espn',
  'glossary',
]);

const VALID_FANTASY_TABS = new Set<FantasyUrlTab>([
  'lineup',
  'waivers',
  'trades',
  'injuries_rules',
  'rules',
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRouteFromSearch(search: string): AppRouteState {
  const params = new URLSearchParams(search || '');

  const rawView = (params.get('view') || '').trim();
  const rawDate = (params.get('date') || '').trim();
  const gamedayDate = ISO_DATE_RE.test(rawDate) ? rawDate : null;
  const gamedayReportId = (params.get('game') || '').trim() || null;

  const duelPlayerAId = (params.get('pA') || '').trim() || null;
  const duelPlayerBId = (params.get('pB') || '').trim() || null;

  const rawCType = (params.get('cType') || '').trim();
  const comparatorType: 'player' | 'team' =
    rawCType === 'team' ? 'team' : 'player';
  const comparatorId = (params.get('cId') || '').trim() || null;

  const rawFTab = (params.get('fTab') || '').trim() as FantasyUrlTab;
  const fantasyTab: FantasyUrlTab = VALID_FANTASY_TABS.has(rawFTab)
    ? rawFTab
    : 'lineup';

  // Smart section resolution if user shares a link with specific view params
  let section: ActiveSection = 'home';
  if (rawView === 'admin') {
    section = 'fantasy_espn';
  } else if (VALID_SECTIONS.has(rawView as ActiveSection)) {
    section = rawView as ActiveSection;
  } else if (gamedayDate || gamedayReportId) {
    section = 'gameday';
  } else if (duelPlayerAId || duelPlayerBId) {
    section = 'duel';
  } else if (comparatorId) {
    section = 'comparator';
  } else if (params.has('fTab')) {
    section = 'fantasy_espn';
  }

  const rawPlayer = (params.get('player') || '').trim();
  const rawTeam = (params.get('team') || '').trim();

  let inspectedType: 'player' | 'team' | null = null;
  let inspectedId: string | null = null;
  if (rawPlayer) {
    inspectedType = 'player';
    inspectedId = rawPlayer;
  } else if (rawTeam) {
    inspectedType = 'team';
    inspectedId = rawTeam;
  }

  return {
    section,
    inspectedType,
    inspectedId,
    gamedayDate,
    gamedayReportId,
    duelPlayerAId,
    duelPlayerBId,
    comparatorType,
    comparatorId,
    fantasyTab,
  };
}

export function buildSearchFromRoute(state: AppRouteState): string {
  const params = new URLSearchParams();

  if (state.section === 'fantasy_espn') {
    params.set('view', 'admin');
  } else if (state.section !== 'home') {
    params.set('view', state.section);
  }

  if (state.section === 'gameday') {
    if (state.gamedayDate && ISO_DATE_RE.test(state.gamedayDate)) {
      params.set('date', state.gamedayDate);
    }
    if (state.gamedayReportId) {
      params.set('game', state.gamedayReportId);
    }
  } else if (state.section === 'duel') {
    if (state.duelPlayerAId) {
      params.set('pA', state.duelPlayerAId);
    }
    if (state.duelPlayerBId) {
      params.set('pB', state.duelPlayerBId);
    }
  } else if (state.section === 'comparator') {
    if (state.comparatorType === 'team') {
      params.set('cType', 'team');
    }
    if (state.comparatorId) {
      params.set('cId', state.comparatorId);
    }
  } else if (state.section === 'fantasy_espn') {
    if (state.fantasyTab && state.fantasyTab !== 'lineup') {
      params.set('fTab', state.fantasyTab);
    }
  }

  if (state.inspectedType === 'player' && state.inspectedId) {
    params.set('player', state.inspectedId);
  } else if (state.inspectedType === 'team' && state.inspectedId) {
    params.set('team', state.inspectedId);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function readRadarHistoryMeta(): RadarHistoryMeta {
  if (typeof window === 'undefined') {
    return { __radarNba: true, depth: 0, openedOverlay: null };
  }
  const st = window.history.state as Partial<RadarHistoryMeta> | null;
  if (st && st.__radarNba === true && typeof st.depth === 'number') {
    return {
      __radarNba: true,
      depth: st.depth,
      openedOverlay: st.openedOverlay ?? null,
    };
  }
  return { __radarNba: true, depth: 0, openedOverlay: null };
}

export function syncBrowserUrl(
  nextRoute: AppRouteState,
  mode: 'push' | 'replace',
  openedOverlay: 'inspector' | 'game_report' | null = null
): void {
  if (typeof window === 'undefined') return;

  const nextSearch = buildSearchFromRoute(nextRoute);
  const currentSearch = window.location.search || '';
  const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash || ''}`;
  const prevMeta = readRadarHistoryMeta();

  if (nextSearch === currentSearch) {
    return;
  }

  if (mode === 'push') {
    const meta: RadarHistoryMeta = {
      __radarNba: true,
      depth: prevMeta.depth + 1,
      openedOverlay,
    };
    window.history.pushState(meta, '', nextUrl);
  } else {
    const meta: RadarHistoryMeta = {
      __radarNba: true,
      depth: prevMeta.depth,
      openedOverlay: openedOverlay ?? prevMeta.openedOverlay ?? null,
    };
    window.history.replaceState(meta, '', nextUrl);
  }
}
