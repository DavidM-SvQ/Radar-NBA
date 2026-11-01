export interface NbaTeamMeta {
  id: string;
  nbaId: number;
  espnId: string;
  espnSlug: string;
  abbr: string;
  name: string;
  city: string;
  primaryColor: string;
  secondaryColor: string;
  fallbackBgClass: string;
}

export const NBA_TEAMS_MAP: Record<string, NbaTeamMeta> = {
  ATL: {
    id: '1610612737',
    nbaId: 1610612737,
    espnId: '1',
    espnSlug: 'atl',
    abbr: 'ATL',
    name: 'Atlanta Hawks',
    city: 'Atlanta',
    primaryColor: '#C8102E',
    secondaryColor: '#FDB927',
    fallbackBgClass: 'bg-red-700',
  },
  BOS: {
    id: '1610612738',
    nbaId: 1610612738,
    espnId: '2',
    espnSlug: 'bos',
    abbr: 'BOS',
    name: 'Boston Celtics',
    city: 'Boston',
    primaryColor: '#007A33',
    secondaryColor: '#BA9653',
    fallbackBgClass: 'bg-emerald-700',
  },
  BKN: {
    id: '1610612751',
    nbaId: 1610612751,
    espnId: '17',
    espnSlug: 'bkn',
    abbr: 'BKN',
    name: 'Brooklyn Nets',
    city: 'Brooklyn',
    primaryColor: '#18181B',
    secondaryColor: '#FFFFFF',
    fallbackBgClass: 'bg-zinc-800',
  },
  CHA: {
    id: '1610612766',
    nbaId: 1610612766,
    espnId: '30',
    espnSlug: 'cha',
    abbr: 'CHA',
    name: 'Charlotte Hornets',
    city: 'Charlotte',
    primaryColor: '#1D1160',
    secondaryColor: '#00788C',
    fallbackBgClass: 'bg-cyan-700',
  },
  CHI: {
    id: '1610612741',
    nbaId: 1610612741,
    espnId: '4',
    espnSlug: 'chi',
    abbr: 'CHI',
    name: 'Chicago Bulls',
    city: 'Chicago',
    primaryColor: '#CE1141',
    secondaryColor: '#000000',
    fallbackBgClass: 'bg-rose-700',
  },
  CLE: {
    id: '1610612739',
    nbaId: 1610612739,
    espnId: '5',
    espnSlug: 'cle',
    abbr: 'CLE',
    name: 'Cleveland Cavaliers',
    city: 'Cleveland',
    primaryColor: '#860038',
    secondaryColor: '#041E42',
    fallbackBgClass: 'bg-rose-900',
  },
  DAL: {
    id: '1610612742',
    nbaId: 1610612742,
    espnId: '6',
    espnSlug: 'dal',
    abbr: 'DAL',
    name: 'Dallas Mavericks',
    city: 'Dallas',
    primaryColor: '#00538C',
    secondaryColor: '#002B5E',
    fallbackBgClass: 'bg-sky-700',
  },
  DEN: {
    id: '1610612743',
    nbaId: 1610612743,
    espnId: '7',
    espnSlug: 'den',
    abbr: 'DEN',
    name: 'Denver Nuggets',
    city: 'Denver',
    primaryColor: '#0E2240',
    secondaryColor: '#FEC524',
    fallbackBgClass: 'bg-blue-900',
  },
  DET: {
    id: '1610612765',
    nbaId: 1610612765,
    espnId: '8',
    espnSlug: 'det',
    abbr: 'DET',
    name: 'Detroit Pistons',
    city: 'Detroit',
    primaryColor: '#C8102E',
    secondaryColor: '#1D428A',
    fallbackBgClass: 'bg-blue-700',
  },
  GSW: {
    id: '1610612744',
    nbaId: 1610612744,
    espnId: '9',
    espnSlug: 'gs',
    abbr: 'GSW',
    name: 'Golden State Warriors',
    city: 'Golden State',
    primaryColor: '#1D428A',
    secondaryColor: '#FFC72C',
    fallbackBgClass: 'bg-blue-700',
  },
  HOU: {
    id: '1610612745',
    nbaId: 1610612745,
    espnId: '10',
    espnSlug: 'hou',
    abbr: 'HOU',
    name: 'Houston Rockets',
    city: 'Houston',
    primaryColor: '#CE1141',
    secondaryColor: '#000000',
    fallbackBgClass: 'bg-red-700',
  },
  IND: {
    id: '1610612754',
    nbaId: 1610612754,
    espnId: '11',
    espnSlug: 'ind',
    abbr: 'IND',
    name: 'Indiana Pacers',
    city: 'Indiana',
    primaryColor: '#002D62',
    secondaryColor: '#FDBB30',
    fallbackBgClass: 'bg-amber-600',
  },
  LAC: {
    id: '1610612746',
    nbaId: 1610612746,
    espnId: '12',
    espnSlug: 'lac',
    abbr: 'LAC',
    name: 'LA Clippers',
    city: 'Los Angeles',
    primaryColor: '#C8102E',
    secondaryColor: '#1D428A',
    fallbackBgClass: 'bg-red-700',
  },
  LAL: {
    id: '1610612747',
    nbaId: 1610612747,
    espnId: '13',
    espnSlug: 'lal',
    abbr: 'LAL',
    name: 'Los Angeles Lakers',
    city: 'Los Angeles',
    primaryColor: '#552583',
    secondaryColor: '#FDB927',
    fallbackBgClass: 'bg-purple-800',
  },
  MEM: {
    id: '1610612763',
    nbaId: 1610612763,
    espnId: '29',
    espnSlug: 'mem',
    abbr: 'MEM',
    name: 'Memphis Grizzlies',
    city: 'Memphis',
    primaryColor: '#5D76A9',
    secondaryColor: '#12173F',
    fallbackBgClass: 'bg-slate-600',
  },
  MIA: {
    id: '1610612748',
    nbaId: 1610612748,
    espnId: '14',
    espnSlug: 'mia',
    abbr: 'MIA',
    name: 'Miami Heat',
    city: 'Miami',
    primaryColor: '#98002E',
    secondaryColor: '#F9A01B',
    fallbackBgClass: 'bg-rose-800',
  },
  MIL: {
    id: '1610612749',
    nbaId: 1610612749,
    espnId: '15',
    espnSlug: 'mil',
    abbr: 'MIL',
    name: 'Milwaukee Bucks',
    city: 'Milwaukee',
    primaryColor: '#00471B',
    secondaryColor: '#EEE1C6',
    fallbackBgClass: 'bg-emerald-800',
  },
  MIN: {
    id: '1610612750',
    nbaId: 1610612750,
    espnId: '16',
    espnSlug: 'min',
    abbr: 'MIN',
    name: 'Minnesota Timberwolves',
    city: 'Minnesota',
    primaryColor: '#0C2340',
    secondaryColor: '#236192',
    fallbackBgClass: 'bg-sky-800',
  },
  NOP: {
    id: '1610612740',
    nbaId: 1610612740,
    espnId: '3',
    espnSlug: 'no',
    abbr: 'NOP',
    name: 'New Orleans Pelicans',
    city: 'New Orleans',
    primaryColor: '#0C2340',
    secondaryColor: '#C8102E',
    fallbackBgClass: 'bg-blue-900',
  },
  NYK: {
    id: '1610612752',
    nbaId: 1610612752,
    espnId: '18',
    espnSlug: 'ny',
    abbr: 'NYK',
    name: 'New York Knicks',
    city: 'New York',
    primaryColor: '#006BB6',
    secondaryColor: '#F58426',
    fallbackBgClass: 'bg-orange-600',
  },
  OKC: {
    id: '1610612760',
    nbaId: 1610612760,
    espnId: '25',
    espnSlug: 'okc',
    abbr: 'OKC',
    name: 'Oklahoma City Thunder',
    city: 'Oklahoma City',
    primaryColor: '#007AC1',
    secondaryColor: '#EF3B24',
    fallbackBgClass: 'bg-sky-600',
  },
  ORL: {
    id: '1610612753',
    nbaId: 1610612753,
    espnId: '19',
    espnSlug: 'orl',
    abbr: 'ORL',
    name: 'Orlando Magic',
    city: 'Orlando',
    primaryColor: '#0077C0',
    secondaryColor: '#C4CED4',
    fallbackBgClass: 'bg-blue-600',
  },
  PHI: {
    id: '1610612755',
    nbaId: 1610612755,
    espnId: '20',
    espnSlug: 'phi',
    abbr: 'PHI',
    name: 'Philadelphia 76ers',
    city: 'Philadelphia',
    primaryColor: '#006BB6',
    secondaryColor: '#ED174C',
    fallbackBgClass: 'bg-blue-700',
  },
  PHX: {
    id: '1610612756',
    nbaId: 1610612756,
    espnId: '21',
    espnSlug: 'phx',
    abbr: 'PHX',
    name: 'Phoenix Suns',
    city: 'Phoenix',
    primaryColor: '#1D1160',
    secondaryColor: '#E56020',
    fallbackBgClass: 'bg-orange-700',
  },
  POR: {
    id: '1610612757',
    nbaId: 1610612757,
    espnId: '22',
    espnSlug: 'por',
    abbr: 'POR',
    name: 'Portland Trail Blazers',
    city: 'Portland',
    primaryColor: '#E03A3E',
    secondaryColor: '#000000',
    fallbackBgClass: 'bg-red-600',
  },
  SAC: {
    id: '1610612758',
    nbaId: 1610612758,
    espnId: '23',
    espnSlug: 'sac',
    abbr: 'SAC',
    name: 'Sacramento Kings',
    city: 'Sacramento',
    primaryColor: '#5A2D81',
    secondaryColor: '#63727A',
    fallbackBgClass: 'bg-purple-700',
  },
  SAS: {
    id: '1610612759',
    nbaId: 1610612759,
    espnId: '24',
    espnSlug: 'sa',
    abbr: 'SAS',
    name: 'San Antonio Spurs',
    city: 'San Antonio',
    primaryColor: '#475569',
    secondaryColor: '#000000',
    fallbackBgClass: 'bg-slate-600',
  },
  TOR: {
    id: '1610612761',
    nbaId: 1610612761,
    espnId: '28',
    espnSlug: 'tor',
    abbr: 'TOR',
    name: 'Toronto Raptors',
    city: 'Toronto',
    primaryColor: '#CE1141',
    secondaryColor: '#000000',
    fallbackBgClass: 'bg-red-700',
  },
  UTA: {
    id: '1610612762',
    nbaId: 1610612762,
    espnId: '26',
    espnSlug: 'utah',
    abbr: 'UTA',
    name: 'Utah Jazz',
    city: 'Utah',
    primaryColor: '#002B5C',
    secondaryColor: '#F9A01B',
    fallbackBgClass: 'bg-indigo-900',
  },
  WAS: {
    id: '1610612764',
    nbaId: 1610612764,
    espnId: '27',
    espnSlug: 'wsh',
    abbr: 'WAS',
    name: 'Washington Wizards',
    city: 'Washington',
    primaryColor: '#002B5C',
    secondaryColor: '#E31837',
    fallbackBgClass: 'bg-red-800',
  },
};

export const ESPN_TEAM_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) => [abbr, meta.espnId])
);

export function getTeamLogoUrls(abbr: string): {
  primarySvg: string;
  espnPng: string;
  fallbackText: string;
  primaryColor: string;
  fallbackBgClass: string;
} {
  const cleanAbbr = (abbr || 'NBA').toUpperCase().trim();
  const meta = NBA_TEAMS_MAP[cleanAbbr];
  if (meta) {
    return {
      primarySvg: `https://cdn.nba.com/logos/nba/${meta.nbaId}/primary/L/logo.svg`,
      espnPng: `https://a.espncdn.com/i/teamlogos/nba/500/${meta.espnSlug}.png`,
      fallbackText: cleanAbbr,
      primaryColor: meta.primaryColor,
      fallbackBgClass: meta.fallbackBgClass,
    };
  }
  return {
    primarySvg: `https://a.espncdn.com/i/teamlogos/nba/500/${cleanAbbr.toLowerCase()}.png`,
    espnPng: `https://a.espncdn.com/i/teamlogos/nba/500/${cleanAbbr.toLowerCase()}.png`,
    fallbackText: cleanAbbr,
    primaryColor: '#F97316',
    fallbackBgClass: 'bg-orange-600',
  };
}

export function getPlayerHeadshotUrl(playerId?: string): string | null {
  const raw = String(playerId || '').trim();
  if (!raw) return null;
  if (raw.startsWith('espn-')) {
    const espnNumeric = raw.replace(/^espn-/, '').trim();
    if (/^\d+$/.test(espnNumeric)) {
      return `https://a.espncdn.com/i/headshots/nba/players/full/${espnNumeric}.png`;
    }
    return null;
  }
  if (/^\d+$/.test(raw)) {
    return `https://cdn.nba.com/headshots/nba/latest/260x190/${raw}.png`;
  }
  return null;
}

interface TeamDarkUiPalette {
  primary: string;
  secondary: string;
  alt: string;
}

/**
 * Official franchise primary & secondary colors calibrated for dark slate (#0B1120 / #131C2E)
 * so near-black primaries remain unmistakably recognizable and black secondaries use official road silver/white/trim.
 */
const TEAM_DARK_UI_PALETTES: Record<string, TeamDarkUiPalette> = {
  ATL: { primary: '#E03A3E', secondary: '#FDB927', alt: '#F1F5F9' },
  BOS: { primary: '#008C45', secondary: '#BA9653', alt: '#F1F5F9' },
  BKN: { primary: '#94A3B8', secondary: '#F8FAFC', alt: '#38BDF8' },
  CHA: { primary: '#008CA8', secondary: '#7C3AED', alt: '#A5F3FC' },
  CHI: { primary: '#CE1141', secondary: '#F1F5F9', alt: '#F59E0B' },
  CLE: { primary: '#9E1B32', secondary: '#FDBB30', alt: '#38BDF8' },
  DAL: { primary: '#006BB6', secondary: '#C4CED4', alt: '#38BDF8' },
  DEN: { primary: '#2563EB', secondary: '#FEC524', alt: '#93C5FD' },
  DET: { primary: '#C8102E', secondary: '#1D428A', alt: '#60A5FA' },
  GSW: { primary: '#1D428A', secondary: '#FFC72C', alt: '#60A5FA' },
  HOU: { primary: '#CE1141', secondary: '#CBD5E1', alt: '#F59E0B' },
  IND: { primary: '#004B9B', secondary: '#FDBB30', alt: '#60A5FA' },
  LAC: { primary: '#C8102E', secondary: '#2563EB', alt: '#E2E8F0' },
  LAL: { primary: '#6D28D9', secondary: '#FDB927', alt: '#C4B5FD' },
  MEM: { primary: '#5D76A9', secondary: '#F5B112', alt: '#93C5FD' },
  MIA: { primary: '#BE123C', secondary: '#F9A01B', alt: '#FDA4AF' },
  MIL: { primary: '#006837', secondary: '#EEE1C6', alt: '#34D399' },
  MIN: { primary: '#236192', secondary: '#78BE20', alt: '#7DD3FC' },
  NOP: { primary: '#1E40AF', secondary: '#C8102E', alt: '#D4AF37' },
  NYK: { primary: '#006BB6', secondary: '#F58426', alt: '#60A5FA' },
  OKC: { primary: '#007AC1', secondary: '#EF3B24', alt: '#FBBF24' },
  ORL: { primary: '#0077C0', secondary: '#C4CED4', alt: '#60A5FA' },
  PHI: { primary: '#006BB6', secondary: '#ED174C', alt: '#E2E8F0' },
  PHX: { primary: '#6D28D9', secondary: '#E56020', alt: '#FBBF24' },
  POR: { primary: '#E03A3E', secondary: '#E2E8F0', alt: '#94A3B8' },
  SAC: { primary: '#7E22CE', secondary: '#CBD5E1', alt: '#C084FC' },
  SAS: { primary: '#94A3B8', secondary: '#00B2A9', alt: '#F8FAFC' },
  TOR: { primary: '#CE1141', secondary: '#CBD5E1', alt: '#A855F7' },
  UTA: { primary: '#3B4CCA', secondary: '#F9A01B', alt: '#93C5FD' },
  WAS: { primary: '#00529B', secondary: '#E31837', alt: '#CBD5E1' },
};

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#38BDF8').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 56, g: 189, b: 248 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function areTeamColorsTooSimilar(hexA: string, hexB: string): boolean {
  const a = parseHexRgb(hexA);
  const b = parseHexRgb(hexB);
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const rgbDist = Math.sqrt(dr * dr + dg * dg + db * db);
  if (rgbDist < 110) return true;

  const hslA = rgbToHsl(a.r, a.g, a.b);
  const hslB = rgbToHsl(b.r, b.g, b.b);
  if (hslA.s > 0.25 && hslB.s > 0.25) {
    const rawHueDiff = Math.abs(hslA.h - hslB.h);
    const hueDiff = Math.min(rawHueDiff, 360 - rawHueDiff);
    if (hueDiff < 28 && Math.abs(hslA.l - hslB.l) < 0.26) {
      return true;
    }
  }
  return false;
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHexRgb(hex);
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

export function getTeamDarkUiPalette(abbr: string): TeamDarkUiPalette {
  const clean = (abbr || '').toUpperCase().trim();
  if (TEAM_DARK_UI_PALETTES[clean]) {
    return TEAM_DARK_UI_PALETTES[clean];
  }
  const meta = NBA_TEAMS_MAP[clean];
  if (meta) {
    return {
      primary: meta.primaryColor,
      secondary: meta.secondaryColor || '#F97316',
      alt: '#38BDF8',
    };
  }
  return { primary: '#38BDF8', secondary: '#F97316', alt: '#E2E8F0' };
}

/**
 * Resolves the two franchise colors for a game matchup on dark slate surfaces.
 * When both teams share a very similar primary color, the away (visitor) team
 * switches to its official secondary color.
 */
export function resolveTeamMatchupColors(
  awayAbbr: string,
  homeAbbr: string
): {
  awayColor: string;
  homeColor: string;
  awayUsedSecondary: boolean;
} {
  const awayPal = getTeamDarkUiPalette(awayAbbr);
  const homePal = getTeamDarkUiPalette(homeAbbr);
  const homeColor = homePal.primary;

  if (!areTeamColorsTooSimilar(awayPal.primary, homeColor)) {
    return {
      awayColor: awayPal.primary,
      homeColor,
      awayUsedSecondary: false,
    };
  }

  if (!areTeamColorsTooSimilar(awayPal.secondary, homeColor)) {
    return {
      awayColor: awayPal.secondary,
      homeColor,
      awayUsedSecondary: true,
    };
  }

  return {
    awayColor: awayPal.alt,
    homeColor,
    awayUsedSecondary: true,
  };
}

