import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {
  ChronicleDynamicSection,
  ChronicleKeyItem,
  GameBoxScorePlayerLine,
  GameDayChroniclePayload,
  GameDayPayload,
  GameInactiveOrDnpItem,
  GameLeaderComparisonRow,
  GameNarrativePayload,
  GameNextMatchInfo,
  GameOfficialReportData,
  GamePeriodScore,
  GamePodiumEntry,
  GameReportTeamSide,
  GameTeamComparisonRow,
  GameTeamTotalsSummary,
  GroundingSourceLink,
  PlayerGameLog,
  PlayerSeasonHighEntry,
  PlayerSummary,
  TeamGameLog,
  TeamSummary,
} from '../types/nba.ts';
import { ESPN_TEAM_IDS, NBA_TEAMS_MAP } from '../utils/teamLogos.ts';

export interface PlayerBioRecord {
  id: string;
  name: string;
  teamId: string;
  teamAbbr: string;
  position: string;
  jersey: string;
  height: string;
  country: string;
}

export interface ScoutingEngineDeps {
  getFullLeagueMemory: () => Promise<{
    teams: TeamSummary[];
    allPlayers: PlayerSummary[];
  }>;
  getPlayerBiosMap: (forceRefresh?: boolean) => Promise<Map<string, PlayerBioRecord>>;
  getGameDayPayload: (
    requestedDate?: string,
    forceRefresh?: boolean
  ) => Promise<GameDayPayload>;
  cachedFetchJson: <T>(
    url: string,
    ttlMs?: number,
    headers?: Record<string, string>,
    timeoutMs?: number,
    forceRefresh?: boolean
  ) => Promise<T>;
}

const NBA_LIVE_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  Accept: 'application/json',
};

const NBA_TEAM_ARENAS: Record<string, { arenaName: string; arenaCity: string }> = {
  ATL: { arenaName: 'State Farm Arena', arenaCity: 'Atlanta' },
  BOS: { arenaName: 'TD Garden', arenaCity: 'Boston' },
  BKN: { arenaName: 'Barclays Center', arenaCity: 'Brooklyn' },
  CHA: { arenaName: 'Spectrum Center', arenaCity: 'Charlotte' },
  CHI: { arenaName: 'United Center', arenaCity: 'Chicago' },
  CLE: { arenaName: 'Rocket Arena', arenaCity: 'Cleveland' },
  DAL: { arenaName: 'American Airlines Center', arenaCity: 'Dallas' },
  DEN: { arenaName: 'Ball Arena', arenaCity: 'Denver' },
  DET: { arenaName: 'Little Caesars Arena', arenaCity: 'Detroit' },
  GSW: { arenaName: 'Chase Center', arenaCity: 'San Francisco' },
  HOU: { arenaName: 'Toyota Center', arenaCity: 'Houston' },
  IND: { arenaName: 'Gainbridge Fieldhouse', arenaCity: 'Indianapolis' },
  LAC: { arenaName: 'Intuit Dome', arenaCity: 'Inglewood' },
  LAL: { arenaName: 'Crypto.com Arena', arenaCity: 'Los Ángeles' },
  MEM: { arenaName: 'FedExForum', arenaCity: 'Memphis' },
  MIA: { arenaName: 'Kaseya Center', arenaCity: 'Miami' },
  MIL: { arenaName: 'Fiserv Forum', arenaCity: 'Milwaukee' },
  MIN: { arenaName: 'Target Center', arenaCity: 'Minneapolis' },
  NOP: { arenaName: 'Smoothie King Center', arenaCity: 'Nueva Orleans' },
  NYK: { arenaName: 'Madison Square Garden', arenaCity: 'Nueva York' },
  OKC: { arenaName: 'Paycom Center', arenaCity: 'Oklahoma City' },
  ORL: { arenaName: 'Kia Center', arenaCity: 'Orlando' },
  PHI: { arenaName: 'Wells Fargo Center', arenaCity: 'Filadelfia' },
  PHX: { arenaName: 'Footprint Center', arenaCity: 'Phoenix' },
  POR: { arenaName: 'Moda Center', arenaCity: 'Portland' },
  SAC: { arenaName: 'Golden 1 Center', arenaCity: 'Sacramento' },
  SAS: { arenaName: 'Frost Bank Center', arenaCity: 'San Antonio' },
  TOR: { arenaName: 'Scotiabank Arena', arenaCity: 'Toronto' },
  UTA: { arenaName: 'Delta Center', arenaCity: 'Salt Lake City' },
  WAS: { arenaName: 'Capital One Arena', arenaCity: 'Washington' },
};

const KNOWN_SPANISH_NBA_PLAYERS = new Set([
  'santi aldama',
  'santiago aldama',
  'hugo gonzalez',
  'usman garuba',
  'eli ndiaye',
  'eli john ndiaye',
  'juan nunez',
  'aday mara',
  'izan almansa',
  'baba miller',
  'great osobor',
  'willy hernangomez',
  'juancho hernangomez',
  'ricky rubio',
  'alex abrines',
]);

interface ReportCacheEntry<T> {
  expiresAt: number;
  data: T;
}

const reportMemoryCache = new Map<string, ReportCacheEntry<unknown>>();
const reportInflight = new Map<string, Promise<unknown>>();
const reportInflightStartedAt = new Map<string, number>();

function round1(val: number): number {
  return Math.round((Number(val) || 0) * 10) / 10;
}

function normalizePlain(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isSpanishPlayerCheck(name: string, country?: string): boolean {
  const normCountry = normalizePlain(country || '');
  if (normCountry === 'spain' || normCountry === 'espana') return true;
  const normName = normalizePlain(name);
  return KNOWN_SPANISH_NBA_PLAYERS.has(normName);
}

function formatThousandsEs(num: number): string {
  return Math.round(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseIsoMinutes(raw: unknown): { decimal: number; formatted: string } {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const mins = Math.floor(raw);
    const secs = Math.round((raw - mins) * 60);
    return {
      decimal: round1(raw),
      formatted: `${mins}:${String(secs).padStart(2, '0')}`,
    };
  }
  const str = String(raw || '').trim();
  const isoMatch = str.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/i);
  if (isoMatch) {
    const mins = Number(isoMatch[1]) || 0;
    const secs = Math.min(59, Math.round(Number(isoMatch[2]) || 0));
    return {
      decimal: round1(mins + secs / 60),
      formatted: `${mins}:${String(secs).padStart(2, '0')}`,
    };
  }
  const colonMatch = str.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const mins = Number(colonMatch[1]) || 0;
    const secs = Number(colonMatch[2]) || 0;
    return {
      decimal: round1(mins + secs / 60),
      formatted: `${mins}:${String(secs).padStart(2, '0')}`,
    };
  }
  const n = Number(str) || 0;
  return {
    decimal: round1(n),
    formatted: `${Math.round(n)}:00`,
  };
}

function buildShortPlayerName(
  fullName: string,
  firstName?: string,
  familyName?: string
): string {
  const f = (firstName || '').trim();
  const l = (familyName || '').trim();
  if (f && l) {
    return `${f.charAt(0).toUpperCase()}. ${l}`;
  }
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName.trim() || 'Jugador';
  const initial = parts[0].charAt(0).toUpperCase();
  const rest = parts.slice(1).join(' ');
  return `${initial}. ${rest}`;
}

function sanitizeJersey(rawJersey?: string, fallbackJersey?: string): string {
  const cleanA = String(rawJersey ?? '').replace(/[^0-9]/g, '').trim();
  if (cleanA.length > 0) return cleanA;
  const cleanB = String(fallbackJersey ?? '').replace(/[^0-9]/g, '').trim();
  if (cleanB.length > 0) return cleanB;
  return '0';
}

function computeHollingerGmSc(stats: {
  points: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  stl: number;
  ast: number;
  blk: number;
  pf: number;
  tov: number;
}): number {
  return round1(
    stats.points +
      0.4 * stats.fgm -
      0.7 * stats.fga -
      0.4 * (stats.fta - stats.ftm) +
      0.7 * stats.oreb +
      0.3 * stats.dreb +
      stats.stl +
      0.7 * stats.ast +
      0.7 * stats.blk -
      0.4 * stats.pf -
      stats.tov
  );
}

function parsePbpClockRemaining(rawClock: unknown): string {
  const str = String(rawClock || '').trim();
  const isoMatch = str.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/i);
  if (isoMatch) {
    const mins = Math.max(0, Number(isoMatch[1]) || 0);
    const secsFloat = Math.max(0, Number(isoMatch[2]) || 0);
    const secs = Math.min(59, Math.floor(secsFloat));
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  const colonMatch = str.match(/^(\d{1,2}):(\d{2})(?:\.\d+)?$/);
  if (colonMatch) {
    return `${colonMatch[1].padStart(2, '0')}:${colonMatch[2]}`;
  }
  return '';
}

type BodyGender = 'm' | 'f' | 'mp' | 'fp';

const MEDICAL_BODY_PARTS_ES: Array<{
  rx: RegExp;
  es: string;
  gender: BodyGender;
}> = [
  { rx: /\bplantar\s+fascia\b/i, es: 'fascia plantar', gender: 'f' },
  { rx: /\bfifth\s+metatarsal\b/i, es: 'quinto metatarsiano', gender: 'm' },
  { rx: /\bmetatarsal\b/i, es: 'metatarsiano', gender: 'm' },
  { rx: /\bachilles(?:\s+tendon)?\b/i, es: 'tendón de Aquiles', gender: 'm' },
  { rx: /\bacl\b|\banterior\s+cruciate(?:\s+ligament)?\b/i, es: 'ligamento cruzado anterior (LCA)', gender: 'm' },
  { rx: /\bmcl\b|\bmedial\s+collateral(?:\s+ligament)?\b/i, es: 'ligamento lateral interno', gender: 'm' },
  { rx: /\blcl\b|\blateral\s+collateral(?:\s+ligament)?\b/i, es: 'ligamento lateral externo', gender: 'm' },
  { rx: /\bpcl\b|\bposterior\s+cruciate(?:\s+ligament)?\b/i, es: 'ligamento cruzado posterior', gender: 'm' },
  { rx: /\bmeniscus\b/i, es: 'menisco', gender: 'm' },
  { rx: /\brotator\s+cuff\b/i, es: 'manguito rotador', gender: 'm' },
  { rx: /\blabrum\b/i, es: 'labrum', gender: 'm' },
  { rx: /\bhip\s+flexor\b/i, es: 'flexor de la cadera', gender: 'm' },
  { rx: /\blow(?:er)?\s+back\b|\blumbar\b/i, es: 'zona lumbar', gender: 'f' },
  { rx: /\bupper\s+back\b|\bthoracic\b/i, es: 'zona dorsal', gender: 'f' },
  { rx: /\bgreat\s+toe\b|\bbig\s+toe\b/i, es: 'dedo gordo del pie', gender: 'm' },
  { rx: /\bindex\s+finger\b/i, es: 'dedo índice', gender: 'm' },
  { rx: /\bring\s+finger\b/i, es: 'dedo anular', gender: 'm' },
  { rx: /\bmiddle\s+finger\b/i, es: 'dedo corazón', gender: 'm' },
  { rx: /\bpinky(?:\s+finger)?\b|\blittle\s+finger\b/i, es: 'dedo meñique', gender: 'm' },
  { rx: /\bankle\b/i, es: 'tobillo', gender: 'm' },
  { rx: /\bknee\b|\bpatella(?:r)?\b/i, es: 'rodilla', gender: 'f' },
  { rx: /\bhamstring\b/i, es: 'isquiotibiales', gender: 'mp' },
  { rx: /\bcalf\b|\bgastrocnemius\b|\bsoleus\b/i, es: 'gemelo', gender: 'm' },
  { rx: /\badductor\b/i, es: 'aductor', gender: 'm' },
  { rx: /\babductor\b|\bgroin\b/i, es: 'abductor', gender: 'm' },
  { rx: /\bquad(?:riceps)?\b/i, es: 'cuádriceps', gender: 'm' },
  { rx: /\bthigh\b/i, es: 'muslo', gender: 'm' },
  { rx: /\bhip\b/i, es: 'cadera', gender: 'f' },
  { rx: /\bpelvis\b|\bpelvic\b/i, es: 'pelvis', gender: 'f' },
  { rx: /\bback\b|\bspine\b|\bspinal\b/i, es: 'espalda', gender: 'f' },
  { rx: /\bshoulder\b|\bclavicle\b|\bcollarbone\b/i, es: 'hombro', gender: 'm' },
  { rx: /\bwrist\b/i, es: 'muñeca', gender: 'f' },
  { rx: /\bthumb\b/i, es: 'pulgar', gender: 'm' },
  { rx: /\bfinger\b/i, es: 'dedo de la mano', gender: 'm' },
  { rx: /\bhand\b|\bmetacarpal\b/i, es: 'mano', gender: 'f' },
  { rx: /\bforearm\b/i, es: 'antebrazo', gender: 'm' },
  { rx: /\belbow\b/i, es: 'codo', gender: 'm' },
  { rx: /\bbiceps?\b/i, es: 'bíceps', gender: 'm' },
  { rx: /\btriceps?\b/i, es: 'tríceps', gender: 'm' },
  { rx: /\bpectoral\b|\bchest\b/i, es: 'pectoral', gender: 'm' },
  { rx: /\bfoot\b/i, es: 'pie', gender: 'm' },
  { rx: /\btoe\b/i, es: 'dedo del pie', gender: 'm' },
  { rx: /\bheel\b/i, es: 'talón', gender: 'm' },
  { rx: /\bshin\b|\btibia(?:l)?\b/i, es: 'tibia', gender: 'f' },
  { rx: /\bfibula(?:r)?\b/i, es: 'peroné', gender: 'm' },
  { rx: /\bleg\b|\blower\s+leg\b/i, es: 'pierna', gender: 'f' },
  { rx: /\barm\b/i, es: 'brazo', gender: 'm' },
  { rx: /\bneck\b|\bcervical\b/i, es: 'cuello', gender: 'm' },
  { rx: /\brib(?:s|cage)?\b/i, es: 'costillas', gender: 'fp' },
  { rx: /\babdom(?:en|inal)\b|\bcore\b|\boblique\b/i, es: 'zona abdominal', gender: 'f' },
  { rx: /\btailbone\b|\bcoccyx\b|\bglute(?:al)?\b/i, es: 'zona glútea', gender: 'f' },
  { rx: /\bnose\b|\bnasal\b/i, es: 'tabique nasal', gender: 'm' },
  { rx: /\beye\b|\borbital\b/i, es: 'zona ocular', gender: 'f' },
  { rx: /\bjaw\b/i, es: 'mandíbula', gender: 'f' },
  { rx: /\bface\b|\bfacial\b|\bcheek\b/i, es: 'rostro', gender: 'm' },
  { rx: /\bhead\b/i, es: 'cabeza', gender: 'f' },
];

const MEDICAL_CONDITIONS_ES: Array<{
  rx: RegExp;
  withBody: (bodyPhrase: string) => string;
  standalone: string;
}> = [
  {
    rx: /\bconcussion(?:\s+protocol)?\b/i,
    withBody: () => 'protocolo de conmoción cerebral',
    standalone: 'protocolo de conmoción cerebral',
  },
  {
    rx: /\bplantar\s+fasciitis\b/i,
    withBody: (b) => (b.includes('plantar') ? `fascitis en ${b}` : `fascitis plantar (${b})`),
    standalone: 'fascitis plantar',
  },
  {
    rx: /\bgastroenteritis\b|\bstomach\s+(?:illness|virus|flu|bug)\b/i,
    withBody: () => 'gastroenteritis',
    standalone: 'gastroenteritis',
  },
  {
    rx: /\bupper\s+respiratory(?:\s+illness|\s+infection)?\b|\brespiratory\s+illness\b|\bsinus(?:itis)?\b/i,
    withBody: () => 'infección respiratoria',
    standalone: 'infección respiratoria',
  },
  {
    rx: /\bmigraine\b/i,
    withBody: () => 'cuadro de migraña',
    standalone: 'cuadro de migraña',
  },
  {
    rx: /\b(?:non-covid\s+)?illness\b|\bflu\b|\bviral\b|\bsick(?:ness)?\b/i,
    withBody: () => 'proceso vírico',
    standalone: 'proceso vírico',
  },
  {
    rx: /\bhealth\s+and\s+safety(?:\s+protocols?)?\b/i,
    withBody: () => 'protocolo médico de salud',
    standalone: 'protocolo médico de salud',
  },
  {
    rx: /\breturn\s+to\s+competition(?:\s+reconditioning)?\b|\breconditioning\b/i,
    withBody: (b) => `readaptación competitiva (${b})`,
    standalone: 'readaptación física a la competición',
  },
  {
    rx: /\binjury\s+management\b|\bload\s+management\b|\bmanagement\b/i,
    withBody: (b) => `gestión médica de cargas en ${b}`,
    standalone: 'gestión médica de cargas',
  },
  {
    rx: /\bsurgery\b|\bsurgical\b|\barthroscop(?:y|ic)\b|\brepair\b|\breconstruction\b/i,
    withBody: (b) => `recuperación quirúrgica en ${b}`,
    standalone: 'recuperación tras intervención quirúrgica',
  },
  {
    rx: /\btorn\b|\btear\b|\brupture(?:d)?\b/i,
    withBody: (b) => `rotura fibrilar/ligamentosa en ${b}`,
    standalone: 'rotura fibrilar o ligamentosa',
  },
  {
    rx: /\bstress\s+fracture\b/i,
    withBody: (b) => `fractura por estrés en ${b}`,
    standalone: 'fractura por estrés',
  },
  {
    rx: /\bstress\s+reaction\b/i,
    withBody: (b) => `reacción ósea por estrés en ${b}`,
    standalone: 'reacción ósea por estrés',
  },
  {
    rx: /\bavulsion\b|\bfracture(?:d)?\b|\bbroken\b/i,
    withBody: (b) => `fractura en ${b}`,
    standalone: 'fractura ósea',
  },
  {
    rx: /\bdislocat(?:ion|ed)\b/i,
    withBody: (b) => `luxación en ${b}`,
    standalone: 'luxación articular',
  },
  {
    rx: /\bsubluxation\b/i,
    withBody: (b) => `subluxación en ${b}`,
    standalone: 'subluxación articular',
  },
  {
    rx: /\bsprain(?:ed)?\b/i,
    withBody: (b) => `esguince de ${b}`,
    standalone: 'esguince articular',
  },
  {
    rx: /\bstrain(?:ed)?\b|\bpulled\b/i,
    withBody: (b) => `distensión en ${b}`,
    standalone: 'distensión muscular',
  },
  {
    rx: /\btendinopathy\b/i,
    withBody: (b) => `tendinopatía en ${b}`,
    standalone: 'tendinopatía',
  },
  {
    rx: /\btendinitis\b|\btendonitis\b/i,
    withBody: (b) => `tendinitis en ${b}`,
    standalone: 'tendinitis',
  },
  {
    rx: /\bbursitis\b/i,
    withBody: (b) => `bursitis en ${b}`,
    standalone: 'bursitis',
  },
  {
    rx: /\bimpingement\b/i,
    withBody: (b) => `pinzamiento articular en ${b}`,
    standalone: 'pinzamiento articular',
  },
  {
    rx: /\bbone\s+bruise\b/i,
    withBody: (b) => `edema óseo en ${b}`,
    standalone: 'edema óseo',
  },
  {
    rx: /\bcontusion\b|\bbruis(?:e|ed|ing)\b/i,
    withBody: (b) => `contusión en ${b}`,
    standalone: 'contusión',
  },
  {
    rx: /\binflammation\b|\bswelling\b|\beffusion\b/i,
    withBody: (b) => `inflamación en ${b}`,
    standalone: 'inflamación articular',
  },
  {
    rx: /\bspasms?\b/i,
    withBody: (b) => `espasmos musculares en ${b}`,
    standalone: 'espasmos musculares',
  },
  {
    rx: /\btightness\b|\bstiffness\b/i,
    withBody: (b) => `sobrecarga en ${b}`,
    standalone: 'sobrecarga muscular',
  },
  {
    rx: /\blaceration\b|\bcut\b/i,
    withBody: (b) => `herida inciso-contusa en ${b}`,
    standalone: 'herida inciso-contusa',
  },
  {
    rx: /\bsore(?:ness)?\b|\bpain\b|\bach(?:e|ing)\b|\bdiscomfort\b/i,
    withBody: (b) => `molestias en ${b}`,
    standalone: 'molestias físicas',
  },
  {
    rx: /\brecovery\b|\brehab(?:ilitation)?\b/i,
    withBody: (b) => `proceso de recuperación en ${b}`,
    standalone: 'proceso de recuperación médica',
  },
];

function formatSpanishLaterality(
  side: 'left' | 'right' | 'bilateral' | null,
  gender: BodyGender
): string {
  if (!side) return '';
  if (side === 'bilateral') {
    return gender === 'mp' || gender === 'fp' ? 'bilaterales' : 'bilateral';
  }
  if (side === 'left') {
    if (gender === 'f') return 'izquierda';
    if (gender === 'mp') return 'izquierdos';
    if (gender === 'fp') return 'izquierdas';
    return 'izquierdo';
  }
  if (gender === 'f') return 'derecha';
  if (gender === 'mp') return 'derechos';
  if (gender === 'fp') return 'derechas';
  return 'derecho';
}

export function translateMedicalDetailEs(rawDetail: string): string {
  const cleaned = String(rawDetail || '')
    .replace(/^Injury\/Illness\s*-\s*/i, '')
    .replace(/^(?:INACTIVE|DNP|DND|NWT)_(?:INJURY|REST|PERSONAL|NORMAL)\s*[-:]?\s*/i, '')
    .replace(/^(?:DNP|DND|NWT)\s*-\s*/i, '')
    .replace(/\bNot\s+Specified\b/gi, '')
    .replace(/\b(?:Out(?:\s+for\s+season)?|Day-To-Day|Questionable|Doubtful|Probable|Injured\s+Reserve)\b/gi, '')
    .replace(/[;:]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) return '';

  // Detect laterality
  let side: 'left' | 'right' | 'bilateral' | null = null;
  if (/\bbilateral\b/i.test(cleaned)) side = 'bilateral';
  else if (/\bleft\b|\bizq(?:uierd[oa]s?)?\b/i.test(cleaned)) side = 'left';
  else if (/\bright\b|\bder(?:ech[oa]s?)?\b/i.test(cleaned)) side = 'right';

  // Detect body part
  let matchedBody: { es: string; gender: BodyGender } | null = null;
  for (const bp of MEDICAL_BODY_PARTS_ES) {
    if (bp.rx.test(cleaned)) {
      matchedBody = { es: bp.es, gender: bp.gender };
      break;
    }
  }

  const bodyPhrase = matchedBody
    ? [matchedBody.es, formatSpanishLaterality(side, matchedBody.gender)]
        .filter(Boolean)
        .join(' ')
    : '';

  // Detect medical condition
  for (const cond of MEDICAL_CONDITIONS_ES) {
    if (cond.rx.test(cleaned)) {
      return bodyPhrase ? cond.withBody(bodyPhrase) : cond.standalone;
    }
  }

  // Only body part detected (e.g. ESPN type: "Shoulder", side: "Left")
  if (bodyPhrase) {
    return `molestias en ${bodyPhrase}`;
  }

  if (/\brest\b|\bdescanso\b/i.test(cleaned)) {
    return 'descanso programado';
  }

  // If the string is already in clean Spanish (no common English injury/news tokens), preserve it; otherwise return empty so caller uses clean Spanish fallback
  const hasEnglishLeak =
    /\b(?:the|and|for|with|from|against|game|out|ruled|expected|return|week|month|season|injury|injured|illness|unspecified|status|coach|decision|assignment|personal|suspended|suspension|pending|trade|sore|pain|tear|torn|broken|surgery|sprain|strain)\b/i.test(
      cleaned
    );
  if (hasEnglishLeak) {
    return '';
  }

  return cleaned;
}

function classifyAbsenceOrDnp(
  isActiveOnBench: boolean,
  rawReason?: string,
  rawDesc?: string,
  espnInjury?: { status: string; detail: string }
): {
  statusType: NonNullable<GameInactiveOrDnpItem['statusType']>;
  statusLabel: string;
  statusTone: NonNullable<GameInactiveOrDnpItem['statusTone']>;
  priorityRank: number;
  note: string;
} {
  const cleanReasonRaw = String(rawReason || '').trim();
  const cleanDescRaw = String(rawDesc || '').trim();
  const reasonDescLow = `${cleanReasonRaw} ${cleanDescRaw}`.toLowerCase();
  const espnStatusLow = String(espnInjury?.status || '').toLowerCase();
  const espnDetailLow = String(espnInjury?.detail || '').toLowerCase();

  // 1. Explicit Coach's Decision / Technical DNP
  if (
    reasonDescLow.includes('coach') ||
    reasonDescLow.includes('cd -') ||
    reasonDescLow.includes('dnp_coach') ||
    reasonDescLow.includes('decision')
  ) {
    return {
      statusType: 'coach_decision',
      statusLabel: 'Decisión técnica',
      statusTone: 'slate',
      priorityRank: isActiveOnBench ? 7 : 6,
      note: isActiveOnBench
        ? 'Convocado en banquillo sin minutos por rotación técnica'
        : 'Descarte técnico de convocatoria (sin parte médico)',
    };
  }

  // 2. G-League / Two-Way roster assignment (technical/roster decision, not injured)
  if (
    reasonDescLow.includes('gleague') ||
    reasonDescLow.includes('g-league') ||
    reasonDescLow.includes('g league') ||
    reasonDescLow.includes('two-way') ||
    reasonDescLow.includes('twoway') ||
    reasonDescLow.includes('on assignment')
  ) {
    return {
      statusType: 'gleague',
      statusLabel: 'Decisión técnica · G-League',
      statusTone: 'slate',
      priorityRank: 6,
      note: 'Asignado a G-League / contrato dual (fuera de rotación NBA)',
    };
  }

  // 3. Rest / Load Management
  if (
    (reasonDescLow.includes('rest') && !reasonDescLow.includes('wrist')) ||
    espnDetailLow === 'rest'
  ) {
    return {
      statusType: 'rest',
      statusLabel: 'Descanso',
      statusTone: 'amber',
      priorityRank: 4,
      note: 'Gestión programada de descanso y cargas físicas',
    };
  }

  // 4. Disciplinary Suspension / Personal / Trade Pending
  if (
    reasonDescLow.includes('suspension') ||
    reasonDescLow.includes('suspended') ||
    espnStatusLow.includes('suspension')
  ) {
    return {
      statusType: 'suspension_personal',
      statusLabel: 'Sanción',
      statusTone: 'amber',
      priorityRank: 4,
      note: 'Baja disciplinaria · Sanción oficial NBA',
    };
  }
  if (
    reasonDescLow.includes('personal') ||
    reasonDescLow.includes('not with team') ||
    reasonDescLow.includes('nwt') ||
    reasonDescLow.includes('bereavement')
  ) {
    return {
      statusType: 'suspension_personal',
      statusLabel: 'Motivos personales',
      statusTone: 'amber',
      priorityRank: 4,
      note: 'Ausencia autorizada · Motivos personales',
    };
  }
  if (reasonDescLow.includes('trade')) {
    return {
      statusType: 'suspension_personal',
      statusLabel: 'Traspaso en curso',
      statusTone: 'amber',
      priorityRank: 5,
      note: 'Fuera de convocatoria · Operación de traspaso en curso',
    };
  }

  // Determine whether ESPN injury feed confirms an active medical out/doubtful status
  const espnConfirmsMedical = Boolean(
    espnInjury &&
      (!isActiveOnBench ||
        espnStatusLow.includes('out') ||
        espnStatusLow.includes('doubtful') ||
        espnStatusLow.includes('questionable') ||
        espnStatusLow.includes('day-to-day') ||
        espnStatusLow.includes('injured'))
  );
  const fullMedicalCheckLow = `${reasonDescLow} ${espnConfirmsMedical ? espnDetailLow : ''}`;

  // 5. Medical Illness
  if (
    fullMedicalCheckLow.includes('illness') ||
    fullMedicalCheckLow.includes('flu') ||
    fullMedicalCheckLow.includes('stomach') ||
    fullMedicalCheckLow.includes('gastro') ||
    fullMedicalCheckLow.includes('respiratory') ||
    fullMedicalCheckLow.includes('sinus') ||
    fullMedicalCheckLow.includes('migraine') ||
    fullMedicalCheckLow.includes('viral')
  ) {
    const cleanIll = translateMedicalDetailEs(cleanDescRaw || espnInjury?.detail || '');
    return {
      statusType: 'injury',
      statusLabel: 'Baja médica',
      statusTone: 'rose',
      priorityRank: 3,
      note: cleanIll
        ? `Indisposición médica (${cleanIll})`
        : 'Proceso vírico / indisposición médica en acta',
    };
  }

  // 6. Physical Injury (Lesionado)
  const translatedCandidate = translateMedicalDetailEs(
    [cleanDescRaw, espnConfirmsMedical ? espnInjury?.detail || '' : '', cleanReasonRaw]
      .filter(Boolean)
      .join(' ')
  );
  const hasMedicalKeyword =
    Boolean(translatedCandidate) ||
    fullMedicalCheckLow.includes('injury') ||
    fullMedicalCheckLow.includes('dnd') ||
    fullMedicalCheckLow.includes('sprain') ||
    fullMedicalCheckLow.includes('strain') ||
    fullMedicalCheckLow.includes('soreness') ||
    fullMedicalCheckLow.includes('surgery') ||
    fullMedicalCheckLow.includes('fracture') ||
    fullMedicalCheckLow.includes('contusion') ||
    fullMedicalCheckLow.includes('tightness') ||
    fullMedicalCheckLow.includes('reconditioning') ||
    fullMedicalCheckLow.includes('concussion') ||
    fullMedicalCheckLow.includes('recovery') ||
    fullMedicalCheckLow.includes('torn') ||
    fullMedicalCheckLow.includes('tear') ||
    fullMedicalCheckLow.includes('tendinitis') ||
    fullMedicalCheckLow.includes('tendinopathy') ||
    fullMedicalCheckLow.includes('bursitis') ||
    fullMedicalCheckLow.includes('inflammation') ||
    fullMedicalCheckLow.includes('dislocation') ||
    fullMedicalCheckLow.includes('spasms');

  if (espnConfirmsMedical || hasMedicalKeyword) {
    return {
      statusType: 'injury',
      statusLabel: 'Lesionado',
      statusTone: 'rose',
      priorityRank: 3,
      note: translatedCandidate
        ? `Parte médico: ${translatedCandidate}`
        : 'Baja por lesión confirmada en acta oficial NBA',
    };
  }

  // 7. Default for healthy INACTIVE_NORMAL, empty reason, or dressed 0-minute bench players: Coach's Decision
  return {
    statusType: 'coach_decision',
    statusLabel: 'Decisión técnica',
    statusTone: 'slate',
    priorityRank: isActiveOnBench ? 7 : 6,
    note: isActiveOnBench
      ? 'Convocado en banquillo sin minutos por rotación técnica'
      : 'Descarte técnico de convocatoria (sin parte médico activo)',
  };
}

const KNOWN_NBA_COACH_NAMES = [
  'Tom Thibodeau',
  'Coach Thibs',
  'Thibodeau',
  'Thibs',
  'Mike Brown',
  'Joe Mazzulla',
  'Mazzulla',
  'Kenny Atkinson',
  'JB Bickerstaff',
  'J.B. Bickerstaff',
  'Bickerstaff',
  'Erik Spoelstra',
  'Spoelstra',
  'Rick Carlisle',
  'Carlisle',
  'Nick Nurse',
  'Doc Rivers',
  'Billy Donovan',
  'Jamahl Mosley',
  'Quin Snyder',
  'Charles Lee',
  'Jordi Fernández',
  'Jordi Fernandez',
  'Darko Rajakovic',
  'Darko Rajaković',
  'Rajakovic',
  'Rajaković',
  'Brian Keefe',
  'Mark Daigneault',
  'Daigneault',
  'Chris Finch',
  'JJ Redick',
  'J.J. Redick',
  'Redick',
  'Steve Kerr',
  'Tyronn Lue',
  'Ty Lue',
  'Ime Udoka',
  'Udoka',
  'Jason Kidd',
  'Michael Malone',
  'Mike Malone',
  'David Adelman',
  'Taylor Jenkins',
  'Tuomas Iisalo',
  'Iisalo',
  'Mike Budenholzer',
  'Budenholzer',
  'Frank Vogel',
  'Darvin Ham',
  'Monty Williams',
  'Adrian Griffin',
  'Jacque Vaughn',
  'Gregg Popovich',
  'Popovich',
  'Mitch Johnson',
  'Willie Green',
  'Will Hardy',
  'Chauncey Billups',
  'Doug Christie',
  'Jordan Ott',
  'James Borrego',
  'Terry Stotts',
  'Tiago Splitter',
  'Sam Cassell',
  'Micah Nori',
  'Chris Quinn',
  'Jeff Van Gundy',
  'Stan Van Gundy',
  'Brad Stevens',
  'Pat Riley',
  'Leon Rose',
  'Rob Pelinka',
  'Sam Presti',
  'Daryl Morey',
  'Masai Ujiri',
  'Danny Ainge',
].sort((a, b) => b.length - a.length);

const NBA_TEAM_SAFE_TOKENS = [
  'atlanta', 'hawks', 'atl',
  'boston', 'celtics', 'bos',
  'brooklyn', 'nets', 'bkn',
  'charlotte', 'hornets', 'cha',
  'chicago', 'bulls', 'chi',
  'cleveland', 'cavaliers', 'cavs', 'cle',
  'dallas', 'mavericks', 'mavs', 'dal',
  'denver', 'nuggets', 'den',
  'detroit', 'pistons', 'det',
  'golden state', 'warriors', 'gsw',
  'houston', 'rockets', 'hou',
  'indiana', 'pacers', 'ind',
  'los angeles', 'clippers', 'lakers', 'lac', 'lal',
  'memphis', 'grizzlies', 'mem',
  'miami', 'heat', 'mia',
  'milwaukee', 'bucks', 'mil',
  'minnesota', 'timberwolves', 'wolves', 'min',
  'new orleans', 'pelicans', 'nop',
  'new york', 'knicks', 'nyk',
  'oklahoma city', 'thunder', 'okc',
  'orlando', 'magic', 'orl',
  'philadelphia', 'sixers', '76ers', 'phi',
  'phoenix', 'suns', 'phx',
  'portland', 'trail blazers', 'blazers', 'por',
  'sacramento', 'kings', 'sac',
  'san antonio', 'spurs', 'sas',
  'toronto', 'raptors', 'tor',
  'utah', 'jazz', 'uta',
  'washington', 'wizards', 'was',
  'nba',
];

function buildVerifiedPlayerTokenSet(playerNames: string[]): Set<string> {
  const set = new Set<string>();
  const suffixes = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);
  for (const raw of playerNames) {
    const clean = normalizePlain(raw);
    if (!clean) continue;
    set.add(clean);
    const parts = clean
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !suffixes.has(w));
    for (const part of parts) {
      set.add(part);
    }
  }
  return set;
}

function preserveCasePhrase(referenceMatch: string, lowerPhrase: string): string {
  const trimmed = referenceMatch.trimStart();
  if (/^[A-ZÁÉÍÓÚÑ]/.test(trimmed)) {
    return lowerPhrase.charAt(0).toUpperCase() + lowerPhrase.slice(1);
  }
  return lowerPhrase;
}

function sanitizeUnverifiedCoachClaims(
  text: string,
  verifiedPlayerNames: string[] = []
): string {
  if (!text) return text;
  const playerTokens = buildVerifiedPlayerTokenSet(verifiedPlayerNames);
  const teamTokens = new Set(NBA_TEAM_SAFE_TOKENS.map((t) => normalizePlain(t)));

  const isVerifiedPlayerOrTeam = (candidate: string): boolean => {
    const norm = normalizePlain(candidate.replace(/\*/g, '')).replace(
      /^(?:los|las|el|la|de|del)\s+/,
      ''
    );
    if (!norm) return true;
    if (playerTokens.has(norm) || teamTokens.has(norm)) return true;
    for (const t of teamTokens) {
      if (t.length >= 4 && norm.includes(t)) return true;
    }
    return false;
  };

  let out = text;

  // 1. Strip appositive coach attributions ("El entrenador de los Knicks, Tom Thibodeau,")
  out = out.replace(
    /\b([Ee]l|[Ss]u)\s+(?:[Ee]ntrenador(?:\s+jefe)?|[Tt]écnico|[Pp]reparador)\s+de\s+((?:los\s+|las\s+)?[\p{L}\d\s]{2,26}?),\s*([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})\s*,?/gu,
    (match, determiner: string, teamPhrase: string, person: string) => {
      if (isVerifiedPlayerOrTeam(person)) return match;
      return `${preserveCasePhrase(determiner, 'el cuerpo técnico')} de ${teamPhrase.trim()}`;
    }
  );

  // 2. Strip direct coach title + Proper Name ("El técnico Nombre Apellido", "el entrenador Nombre Apellido")
  out = out.replace(
    /\b([Ee]l|[Ss]u)\s+(?:[Ee]ntrenador(?:\s+jefe)?|[Tt]écnico|[Pp]reparador)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu,
    (match, determiner: string, person: string) => {
      if (isVerifiedPlayerOrTeam(person)) return match;
      return preserveCasePhrase(determiner, 'el cuerpo técnico');
    }
  );

  // 3. Strip "la pizarra de [Coach]", "el banquillo de [Coach]", "los pupilos/hombres de [Coach]" when [Coach] is neither a team nor a player
  out = out
    .replace(
      /\b([Ll]a\s+pizarra\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu,
      (match, prefix: string, entity: string) => {
        if (isVerifiedPlayerOrTeam(entity)) return match;
        return preserveCasePhrase(prefix, 'la pizarra técnica');
      }
    )
    .replace(
      /\b([Ee]l\s+banquillo\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu,
      (match, prefix: string, entity: string) => {
        if (isVerifiedPlayerOrTeam(entity)) return match;
        return preserveCasePhrase(prefix, 'el cuerpo técnico');
      }
    )
    .replace(
      /\b([Ll]os\s+(?:hombres|pupilos|chicos)\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu,
      (match, prefix: string, entity: string) => {
        if (isVerifiedPlayerOrTeam(entity)) return match;
        return preserveCasePhrase(prefix, 'el conjunto');
      }
    );

  // 4. Strip known NBA coach names & nicknames with Unicode-safe boundaries and case preservation
  const leftBound = '(?<![\\p{L}\\p{N}])';
  const rightBound = '(?![\\p{L}\\p{N}])';
  for (const coach of KNOWN_NBA_COACH_NAMES) {
    const normCoach = normalizePlain(coach);
    if (!normCoach || playerTokens.has(normCoach)) continue;

    const escaped = coach.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(
        new RegExp(
          `(?:el\\s+|su\\s+)?(?:entrenador|técnico|preparador)(?:\\s+jefe)?\\s+${escaped}${rightBound}`,
          'giu'
        ),
        (m) => preserveCasePhrase(m, 'el cuerpo técnico')
      )
      .replace(
        new RegExp(`la\\s+pizarra\\s+de\\s+${escaped}${rightBound}`, 'giu'),
        (m) => preserveCasePhrase(m, 'la pizarra técnica')
      )
      .replace(
        new RegExp(`el\\s+banquillo\\s+de\\s+${escaped}${rightBound}`, 'giu'),
        (m) => preserveCasePhrase(m, 'el cuerpo técnico')
      )
      .replace(
        new RegExp(`el\\s+sistema\\s+de\\s+${escaped}${rightBound}`, 'giu'),
        (m) => preserveCasePhrase(m, 'el planteamiento táctico')
      )
      .replace(
        new RegExp(
          `bajo\\s+(?:las\\s+órdenes|la\\s+batuta|el\\s+mando|la\\s+dirección)\\s+de\\s+${escaped}${rightBound}`,
          'giu'
        ),
        (m) => preserveCasePhrase(m, 'bajo la dirección técnica')
      )
      .replace(
        new RegExp(`dirigidos\\s+por\\s+${escaped}${rightBound}`, 'giu'),
        (m) => preserveCasePhrase(m, 'desde la dirección técnica')
      )
      .replace(
        new RegExp(
          `los\\s+(?:hombres|pupilos|chicos)\\s+de\\s+${escaped}${rightBound}`,
          'giu'
        ),
        (m) => preserveCasePhrase(m, 'el conjunto')
      )
      .replace(
        new RegExp(`los\\s+de\\s+${escaped}${rightBound}`, 'giu'),
        (m) => preserveCasePhrase(m, 'el bloque')
      )
      .replace(
        new RegExp(`${leftBound}${escaped}${rightBound}`, 'giu'),
        (m) => preserveCasePhrase(m, 'la dirección técnica')
      );
  }

  return out;
}

let flashLiteQuotaCooldownUntil = 0;

function getGeminiClient(timeoutMs = 20000): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeEspnTeamAbbr(raw: string): string {
  const up = (raw || '').trim().toUpperCase();
  const map: Record<string, string> = {
    GS: 'GSW',
    NY: 'NYK',
    NO: 'NOP',
    SA: 'SAS',
    UTAH: 'UTA',
    WSH: 'WAS',
  };
  return map[up] || up;
}

function extractGroundingSources(
  response: any,
  seedSources: GroundingSourceLink[] = []
): GroundingSourceLink[] {
  const seen = new Set<string>();
  const links: GroundingSourceLink[] = [];
  const pushLink = (uri: string, title: string) => {
    const cleanUri = (uri || '').trim();
    if (!cleanUri || seen.has(cleanUri)) return;
    seen.add(cleanUri);
    links.push({
      uri: cleanUri,
      title: (title || '').trim() || 'Fuente actualidad NBA',
    });
  };

  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const ch of chunks) {
      pushLink(String(ch?.web?.uri || ''), String(ch?.web?.title || ''));
      if (links.length >= 6) return links;
    }
  }

  for (const s of seedSources) {
    pushLink(s.uri, s.title);
    if (links.length >= 6) break;
  }
  return links;
}

function isQuotaExhaustedError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
}

async function streamGeminiContentWithBudget(params: {
  ai: GoogleGenAI;
  model: string;
  systemInstruction: string;
  contents: string;
  thinkingLevel?: ThinkingLevel;
  firstChunkTimeoutMs: number;
  totalTimeoutMs: number;
}): Promise<{ text: string; lastChunk: any }> {
  const controller = new AbortController();
  let firstChunkTimer: ReturnType<typeof setTimeout> | undefined;
  let totalTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => {
    if (firstChunkTimer) {
      clearTimeout(firstChunkTimer);
      firstChunkTimer = undefined;
    }
    if (totalTimer) {
      clearTimeout(totalTimer);
      totalTimer = undefined;
    }
  };

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      firstChunkTimer = setTimeout(() => {
        controller.abort();
        reject(new Error(`FIRST_CHUNK_TIMEOUT:${params.model}`));
      }, params.firstChunkTimeoutMs);

      totalTimer = setTimeout(() => {
        controller.abort();
        reject(new Error(`TOTAL_STREAM_TIMEOUT:${params.model}`));
      }, params.totalTimeoutMs);
    });

    const streamWork = (async () => {
      const responseStream = await params.ai.models.generateContentStream({
        model: params.model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          temperature: 0.2,
          abortSignal: controller.signal,
          ...(params.thinkingLevel !== undefined
            ? { thinkingConfig: { thinkingLevel: params.thinkingLevel } }
            : {}),
        },
      });

      let fullText = '';
      let lastChunk: any = null;
      let receivedFirstText = false;

      for await (const chunk of responseStream) {
        const piece = chunk.text || '';
        if (piece) {
          if (!receivedFirstText) {
            receivedFirstText = true;
            if (firstChunkTimer) {
              clearTimeout(firstChunkTimer);
              firstChunkTimer = undefined;
            }
          }
          fullText += piece;
        }
        lastChunk = chunk;
      }

      return { text: fullText.trim(), lastChunk };
    })();

    return await Promise.race([streamWork, timeoutPromise]);
  } finally {
    clearTimers();
    controller.abort();
  }
}

async function generateWithGeminiCascade(params: {
  systemInstruction: string;
  contents: string;
  seedSources: GroundingSourceLink[];
}): Promise<{ text: string; sources: GroundingSourceLink[] }> {
  const ai = getGeminiClient(16000);
  if (!ai) {
    throw new Error('GEMINI_API_KEY unavailable');
  }

  // Fast streaming call on gemini-3.1-flash-lite (avoids unary 10.5s gateway deadline; zero multi-tier hang)
  if (Date.now() >= flashLiteQuotaCooldownUntil) {
    try {
      const { text: liteText, lastChunk } = await streamGeminiContentWithBudget({
        ai,
        model: 'gemini-3.1-flash-lite',
        systemInstruction: params.systemInstruction,
        contents: params.contents,
        thinkingLevel: ThinkingLevel.MINIMAL,
        firstChunkTimeoutMs: 12500,
        totalTimeoutMs: 15000,
      });
      if (liteText.length > 80) {
        return {
          text: liteText,
          sources: extractGroundingSources(lastChunk, params.seedSources),
        };
      }
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        flashLiteQuotaCooldownUntil = Date.now() + 45 * 1000;
      }
      throw err;
    }
  }

  throw new Error('Gemini flash-lite temporarily cooling down');
}

function cleanSectionText(raw: string, preserveHorizontalRules = false): string {
  const withoutHeadings = (raw || '')
    .replace(/^#+\s+.*$/gm, '')
    .replace(/^\*\*PASO B.*?\*\*$/gim, '');
  const withoutRules = preserveHorizontalRules
    ? withoutHeadings.replace(/^(?:\s*---+\s*\n)+|(?:\n\s*---+\s*)+$/g, '')
    : withoutHeadings.replace(/^\s*---+\s*$/gm, '');
  return withoutRules.replace(/\n{3,}/g, '\n\n').trim();
}

function parseDelimitedSections(
  text: string,
  keys: string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const startRegex = new RegExp(`===${key}===`, 'i');
    const startMatch = startRegex.exec(text);
    if (!startMatch) continue;
    const contentStart = startMatch.index + startMatch[0].length;
    let contentEnd = text.length;
    for (let j = i + 1; j < keys.length; j++) {
      const nextRegex = new RegExp(`===${keys[j]}===`, 'i');
      const nextMatch = nextRegex.exec(text.slice(contentStart));
      if (nextMatch) {
        contentEnd = contentStart + nextMatch.index;
        break;
      }
    }
    out[key] = cleanSectionText(
      text.slice(contentStart, contentEnd),
      key === 'CAPITULOS_DINAMICOS'
    );
  }
  return out;
}

function stripInlineWrapper(s: string): string {
  return (s || '')
    .replace(/^[-•*\d.)\s]+/, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/\*\*/g, '')
    .trim();
}

function parseDynamicChapters(
  raw: string | undefined,
  fallback: ChronicleDynamicSection[]
): ChronicleDynamicSection[] {
  if (!raw || raw.trim().length < 50) return fallback;
  const normalizedSeparators = raw
    .replace(/^\s*---+\s*$/gm, '\n---\n')
    .replace(/\n{2,}(?=[^\n:]{4,95}\s*::\s*\S)/g, '\n---\n')
    .trim();

  const rawChunks = normalizedSeparators
    .split(/\n\s*(?:---+\s*\n?\s*)+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 40);

  const chapters: ChronicleDynamicSection[] = [];
  for (const chunk of rawChunks.slice(0, 2)) {
    let title = '';
    let body = '';

    const doubleColonIdx = chunk.indexOf('::');
    if (doubleColonIdx > 2 && doubleColonIdx < 130) {
      title = stripInlineWrapper(chunk.slice(0, doubleColonIdx));
      body = cleanSectionText(chunk.slice(doubleColonIdx + 2));
    } else {
      const lines = chunk
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length >= 2 && lines[0].length <= 115) {
        title = stripInlineWrapper(lines[0]);
        body = cleanSectionText(lines.slice(1).join('\n\n'));
      }
    }

    if (title && body.length >= 45) {
      chapters.push({
        kicker: chapters.length === 0 ? 'Foco Principal' : 'Segundo Foco',
        title,
        body,
      });
    }
  }

  return chapters.length > 0 ? chapters : fallback;
}

function parseClavesList(
  raw: string | undefined,
  fallback: ChronicleKeyItem[]
): ChronicleKeyItem[] {
  if (!raw || raw.trim().length < 25) return fallback;
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 18);

  const items: ChronicleKeyItem[] = [];
  for (const line of lines.slice(0, 4)) {
    let title = '';
    let detail = '';
    const sepIdx = line.indexOf('::');
    if (sepIdx > 2 && sepIdx < 95) {
      title = stripInlineWrapper(line.slice(0, sepIdx));
      let rawDetail = line.slice(sepIdx + 2).trim();
      if (/^\*\*[^*]+\*\*$/.test(rawDetail)) {
        rawDetail = rawDetail.slice(2, -2).trim();
      }
      detail = rawDetail;
    } else {
      const boldMatch = /^\*\*([^*]{3,80})\*\*[:\s—-]*(.+)$/.exec(
        line.replace(/^[-•\d.)\s]+/, '')
      );
      if (boldMatch) {
        title = stripInlineWrapper(boldMatch[1]);
        detail = boldMatch[2].trim();
      } else {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 3 && colonIdx < 75) {
          title = stripInlineWrapper(line.slice(0, colonIdx));
          detail = line.slice(colonIdx + 1).trim();
        }
      }
    }
    if (title && detail.length >= 15) {
      items.push({ title, detail });
    }
  }

  return items.length >= 2 ? items : fallback;
}

function parseSpotlight(
  raw: string | undefined,
  fallback: { title: string; body: string } | null
): { title: string; body: string } | null {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (
    !trimmed ||
    /^ningun[oa]\b/i.test(trimmed) ||
    /^no aplica\b/i.test(trimmed) ||
    trimmed.length < 40
  ) {
    return null;
  }

  const pipeIdx = trimmed.indexOf('||');
  const colonIdx = trimmed.indexOf('::');
  const sepIdx =
    pipeIdx > 2 && pipeIdx < 120
      ? pipeIdx
      : colonIdx > 2 && colonIdx < 120
      ? colonIdx
      : -1;

  if (sepIdx !== -1) {
    const title = stripInlineWrapper(trimmed.slice(0, sepIdx));
    const body = cleanSectionText(trimmed.slice(sepIdx + 2));
    if (title && body.length >= 40) {
      return { title, body };
    }
  }

  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 2 && lines[0].length <= 105) {
    const title = stripInlineWrapper(lines[0]);
    const body = cleanSectionText(lines.slice(1).join('\n\n'));
    if (title && body.length >= 40) {
      return { title, body };
    }
  }

  return fallback;
}

export function createScoutingEngine(deps: ScoutingEngineDeps) {
  async function fetchLivePressContext(
    dateIso: string,
    forceRefresh = false
  ): Promise<{
    byMatchup: Map<string, { notes: string[]; sources: GroundingSourceLink[] }>;
    dayNotes: string[];
    daySources: GroundingSourceLink[];
  }> {
    const yyyymmdd = dateIso.replace(/-/g, '');
    const byMatchup = new Map<
      string,
      { notes: string[]; sources: GroundingSourceLink[] }
    >();
    const dayNotes: string[] = [];
    const daySources: GroundingSourceLink[] = [];

    const [sbSettled] = await Promise.allSettled([
      deps.cachedFetchJson<Record<string, any>>(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`,
        15 * 60 * 1000,
        {},
        7000,
        forceRefresh
      ),
    ]);

    if (sbSettled.status === 'fulfilled' && Array.isArray(sbSettled.value?.events)) {
      for (const ev of sbSettled.value.events) {
        const comp = ev?.competitions?.[0];
        const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const homeComp = competitors.find((c: any) => c?.homeAway === 'home');
        const awayComp = competitors.find((c: any) => c?.homeAway === 'away');
        const homeAbbr = normalizeEspnTeamAbbr(homeComp?.team?.abbreviation || '');
        const awayAbbr = normalizeEspnTeamAbbr(awayComp?.team?.abbreviation || '');
        if (!homeAbbr || !awayAbbr) continue;

        const key = `${awayAbbr}@${homeAbbr}`;
        const notes: string[] = [];
        const sources: GroundingSourceLink[] = [];

        const headlines = Array.isArray(comp?.headlines) ? comp.headlines : [];
        for (const hl of headlines) {
          const shortTxt = String(hl?.shortLinkText || '').trim();
          const descTxt = String(hl?.description || '').trim();
          const combined = [shortTxt, descTxt].filter(Boolean).join(' — ');
          if (combined) {
            notes.push(combined);
            dayNotes.push(`[${awayAbbr} @ ${homeAbbr}] ${combined}`);
          }
        }

        const evLinks = Array.isArray(ev?.links) ? ev.links : [];
        const recapLink =
          evLinks.find((l: any) =>
            Array.isArray(l?.rel) && (l.rel.includes('recap') || l.rel.includes('summary'))
          ) || evLinks[0];
        if (recapLink?.href) {
          const src = {
            uri: String(recapLink.href).replace(/^http:\/\//i, 'https://'),
            title: `${awayAbbr} vs ${homeAbbr} — Crónica y Resumen Oficial ESPN/AP`,
          };
          sources.push(src);
          if (daySources.length < 6) daySources.push(src);
        }

        byMatchup.set(key, { notes, sources });
      }
    }

    return { byMatchup, dayNotes, daySources };
  }

  interface ScheduledLeagueGame {
    gameId: string;
    dateIso: string; // YYYY-MM-DD (US Eastern calendar date)
    dateTimeUtc: string; // ISO UTC if available
    awayAbbr: string;
    homeAbbr: string;
    arenaName: string;
    arenaCity: string;
  }

  function utcToEasternDateIso(utcStr: string): string {
    if (!utcStr) return '';
    const dt = new Date(utcStr);
    if (Number.isNaN(dt.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(dt);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    return y && m && d ? `${y}-${m}-${d}` : '';
  }

  function normalizeScheduleDateToEasternIso(
    estRaw?: string,
    gdDateRaw?: string,
    utcRaw?: string
  ): string {
    const estTrim = String(estRaw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(estTrim)) {
      return estTrim.slice(0, 10);
    }
    for (const candidate of [estTrim, String(gdDateRaw || '').trim()]) {
      const slashMatch = candidate.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (slashMatch) {
        return `${slashMatch[3]}-${slashMatch[1]}-${slashMatch[2]}`;
      }
    }
    const utcTrim = String(utcRaw || '').trim();
    if (utcTrim.includes('T')) {
      const converted = utcToEasternDateIso(utcTrim);
      if (converted) return converted;
    }
    return utcTrim.slice(0, 10);
  }

  let cachedScheduleList: { expiresAt: number; games: ScheduledLeagueGame[] } | null =
    null;

  async function fetchLeagueScheduleGames(
    forceRefresh = false
  ): Promise<ScheduledLeagueGame[]> {
    if (!forceRefresh && cachedScheduleList && cachedScheduleList.expiresAt > Date.now()) {
      return cachedScheduleList.games;
    }
    try {
      const raw = await deps.cachedFetchJson<Record<string, any>>(
        'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json',
        6 * 60 * 60 * 1000,
        NBA_LIVE_HEADERS,
        9000,
        forceRefresh
      );
      const gameDates = Array.isArray(raw?.leagueSchedule?.gameDates)
        ? raw.leagueSchedule.gameDates
        : [];
      const parsed: ScheduledLeagueGame[] = [];
      for (const gd of gameDates) {
        const gamesArr = Array.isArray(gd?.games) ? gd.games : [];
        for (const g of gamesArr) {
          const homeAbbr = String(g?.homeTeam?.teamTricode || '')
            .trim()
            .toUpperCase();
          const awayAbbr = String(g?.awayTeam?.teamTricode || '')
            .trim()
            .toUpperCase();
          if (!homeAbbr || !awayAbbr) continue;
          const utcStr = String(g?.gameDateTimeUTC || g?.gameDateUTC || '').trim();
          const dateIso = normalizeScheduleDateToEasternIso(
            g?.gameDateEst,
            gd?.gameDate,
            utcStr
          );
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
          const fallbackArena = NBA_TEAM_ARENAS[homeAbbr];
          parsed.push({
            gameId: String(g?.gameId || ''),
            dateIso,
            dateTimeUtc: utcStr,
            awayAbbr,
            homeAbbr,
            arenaName:
              String(g?.arenaName || '').trim() ||
              fallbackArena?.arenaName ||
              `Pabellón ${homeAbbr}`,
            arenaCity:
              String(g?.arenaCity || '').trim() || fallbackArena?.arenaCity || '',
          });
        }
      }
      parsed.sort((a, b) =>
        (a.dateIso + 'T' + (a.dateTimeUtc || '')).localeCompare(
          b.dateIso + 'T' + (b.dateTimeUtc || '')
        )
      );
      cachedScheduleList = {
        expiresAt: Date.now() + 6 * 60 * 60 * 1000,
        games: parsed,
      };
      return parsed;
    } catch {
      return [];
    }
  }

  async function fetchEspnInjuriesByName(
    forceRefresh = false
  ): Promise<Map<string, { status: string; detail: string }>> {
    const map = new Map<string, { status: string; detail: string }>();
    try {
      const data = await deps.cachedFetchJson<Record<string, any>>(
        'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries',
        20 * 60 * 1000,
        {},
        5500,
        forceRefresh
      );
      const teamsArr = Array.isArray(data?.injuries) ? data.injuries : [];
      for (const tBlock of teamsArr) {
        const items = Array.isArray(tBlock?.injuries) ? tBlock.injuries : [];
        for (const inj of items) {
          const dispName = String(inj?.athlete?.displayName || '').trim();
          if (!dispName) continue;
          const status = String(inj?.status || '').trim();
          const cleanField = (val: unknown) => {
            const s = String(val || '').trim();
            return /^not\s+specified$/i.test(s) ? '' : s;
          };
          const typeDesc = cleanField(inj?.details?.type);
          const sideDesc = cleanField(inj?.details?.side);
          const detailDesc = cleanField(inj?.details?.detail);
          let combinedDetail = [sideDesc, typeDesc, detailDesc]
            .filter(Boolean)
            .join(' ')
            .trim();
          if (!combinedDetail && inj?.shortComment) {
            const parenMatch = String(inj.shortComment).match(/\(([^)]{2,40})\)/);
            if (parenMatch) {
              combinedDetail = parenMatch[1].trim();
            }
          }
          map.set(normalizePlain(dispName), {
            status,
            detail: combinedDetail,
          });
        }
      }
    } catch {
      // Optional live enrichment; ignore network failures gracefully
    }
    return map;
  }

  async function fetchPlayByPlayFoulOuts(
    eventId: string,
    fouledOutPlayerIds: string[],
    seasonLabel: string,
    forceRefresh = false
  ): Promise<Map<string, { periodLabel: string; clockRemaining: string }>> {
    const out = new Map<string, { periodLabel: string; clockRemaining: string }>();
    if (fouledOutPlayerIds.length === 0 || !/^00\d{8}$/.test(eventId)) {
      return out;
    }
    const ttl = seasonLabel === '2026-27' ? 15 * 60 * 1000 : 180 * 60 * 1000;
    try {
      const pbp = await deps.cachedFetchJson<Record<string, any>>(
        `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${eventId}.json`,
        ttl,
        NBA_LIVE_HEADERS,
        7500,
        forceRefresh
      );
      const actions = Array.isArray(pbp?.game?.actions) ? pbp.game.actions : [];
      if (actions.length === 0) return out;

      for (const pid of fouledOutPlayerIds) {
        const numPid = Number(pid);
        if (!numPid) continue;
        const playerFouls = actions.filter((a: any) => {
          if (Number(a?.personId) !== numPid) return false;
          const actType = String(a?.actionType || '').toLowerCase();
          if (actType !== 'foul') return false;
          const subType = String(a?.subType || '').toLowerCase();
          if (subType.includes('technical') || subType.includes('defense 3 second')) {
            return false;
          }
          return true;
        });

        if (playerFouls.length === 0) continue;
        const exactSixth =
          playerFouls.find(
            (a: any) =>
              Number(a?.foulPersonalTotal) === 6 ||
              /\b(?:P6|6\s*PF)\b/i.test(String(a?.description || ''))
          ) || playerFouls[playerFouls.length - 1];

        const pNum = Number(exactSixth?.period) || 4;
        const periodLabel =
          pNum <= 4 ? `${pNum}Q` : pNum === 5 ? 'PR' : `PR${pNum - 4}`;
        const clockRemaining = parsePbpClockRemaining(exactSixth?.clock);
        out.set(pid, {
          periodLabel,
          clockRemaining: clockRemaining || '00:00',
        });
      }
    } catch {
      // Graceful fallback if PBP is unavailable
    }
    return out;
  }

  function formatSpanishScheduleDateTime(
    dateIso: string,
    dateTimeUtc?: string
  ): { dateFormatted: string; timeFormatted: string } {
    const monthsEs = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic',
    ];
    const weekdaysEs = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    if (dateTimeUtc && dateTimeUtc.includes('T')) {
      const dt = new Date(dateTimeUtc);
      if (!Number.isNaN(dt.getTime())) {
        const utcHours = dt.getUTCHours();
        const utcMinutes = dt.getUTCMinutes();
        const hasRealTipoff = !(utcHours === 0 && utcMinutes === 0);

        const esDateFmt = new Intl.DateTimeFormat('es-ES', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: hasRealTipoff ? 'Europe/Madrid' : 'UTC',
        }).format(dt);
        const cleanDate = esDateFmt.replace(/\./g, '');

        if (hasRealTipoff) {
          const esTime = new Intl.DateTimeFormat('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Europe/Madrid',
          }).format(dt);
          const etTime = new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'America/New_York',
          }).format(dt);
          return {
            dateFormatted: cleanDate.charAt(0).toUpperCase() + cleanDate.slice(1),
            timeFormatted: `${esTime}h ESP (${etTime} ET)`,
          };
        }
      }
    }

    const [y, m, d] = (dateIso || '').slice(0, 10).split('-').map(Number);
    if (y && m && d) {
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const wd = weekdaysEs[dt.getUTCDay()] || '';
      const mo = monthsEs[dt.getUTCMonth()] || '';
      return {
        dateFormatted: `${wd} ${d} ${mo} ${y}`,
        timeFormatted: 'Horario NBA oficial',
      };
    }

    return {
      dateFormatted: dateIso || 'Por definir',
      timeFormatted: 'Por confirmar',
    };
  }

  function computeNextGameFatigue(
    currentDateIso: string,
    nextDateIso?: string
  ): {
    restDays: number | null;
    isBackToBackNext: boolean;
    fatigueShort: string;
    fatigueDetail: string;
    fatigueTone: 'rose' | 'emerald' | 'slate';
  } {
    if (
      !nextDateIso ||
      !/^\d{4}-\d{2}-\d{2}$/.test(currentDateIso) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(nextDateIso)
    ) {
      return {
        restDays: null,
        isBackToBackNext: false,
        fatigueShort: '—',
        fatigueDetail: 'Sin fecha programada',
        fatigueTone: 'slate',
      };
    }
    const [cy, cm, cd] = currentDateIso.split('-').map(Number);
    const [ny, nm, nd] = nextDateIso.split('-').map(Number);
    const dayDiff = Math.round(
      (Date.UTC(ny, nm - 1, nd) - Date.UTC(cy, cm - 1, cd)) / 86400000
    );
    if (dayDiff <= 0) {
      return {
        restDays: null,
        isBackToBackNext: false,
        fatigueShort: '—',
        fatigueDetail: 'Por confirmar',
        fatigueTone: 'slate',
      };
    }
    const restDays = dayDiff - 1;
    if (restDays === 0) {
      return {
        restDays: 0,
        isBackToBackNext: true,
        fatigueShort: 'B2B · 0 días',
        fatigueDetail: 'Back-to-Back (0 días de descanso antes del próximo duelo)',
        fatigueTone: 'rose',
      };
    }
    if (restDays === 1) {
      return {
        restDays: 1,
        isBackToBackNext: false,
        fatigueShort: '1 día',
        fatigueDetail: '1 día de descanso previo (ritmo estándar)',
        fatigueTone: 'slate',
      };
    }
    return {
      restDays,
      isBackToBackNext: false,
      fatigueShort: `${restDays} días`,
      fatigueDetail:
        restDays >= 3
          ? `${restDays} días de descanso previo (plantilla descansada)`
          : `${restDays} días de descanso previo`,
      fatigueTone: 'emerald',
    };
  }

  async function resolveTeamNextGameInfo(params: {
    currentEventId: string;
    teamObj: TeamSummary;
    recordAfter: string;
    fullTeams: TeamSummary[];
    gameDate: string;
    seasonLabel: string;
    scheduleGames: ScheduledLeagueGame[];
    forceRefresh: boolean;
  }): Promise<GameNextMatchInfo> {
    const {
      currentEventId,
      teamObj,
      recordAfter,
      fullTeams,
      gameDate,
      seasonLabel,
      scheduleGames,
      forceRefresh,
    } = params;
    const abbr = teamObj.abbreviation;
    const findTeamIdByAbbr = (targetAbbr: string): string | undefined =>
      fullTeams.find((t) => t.abbreviation === targetAbbr)?.id;

    // 1. Compute Conference Rank & Streak as of gameDate in seasonLabel
    const confPeers = fullTeams
      .filter((t) => t.conference === teamObj.conference)
      .map((t) => {
        const logs = t.games
          .filter(
            (g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate
          )
          .sort((a, b) => b.date.localeCompare(a.date));
        const w = logs.filter((g) => g.result === 'W').length;
        const l = logs.length - w;
        const gp = w + l;
        const pct = gp > 0 ? w / gp : 0;
        const diffSum = logs.reduce((s, g) => s + g.differential, 0);
        return {
          abbr: t.abbreviation,
          w,
          l,
          gp,
          pct,
          avgDiff: gp > 0 ? diffSum / gp : 0,
          logs,
        };
      })
      .sort((a, b) => b.pct - a.pct || b.w - a.w || b.avgDiff - a.avgDiff);

    const peerIdx = confPeers.findIndex((p) => p.abbr === abbr);
    const conferenceRank =
      peerIdx >= 0 ? peerIdx + 1 : teamObj.playoffSeed || 1;

    const myLogs =
      peerIdx >= 0
        ? confPeers[peerIdx].logs
        : teamObj.games
            .filter(
              (g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate
            )
            .sort((a, b) => b.date.localeCompare(a.date));

    let streakCode = teamObj.streakCode || '—';
    if (myLogs.length > 0) {
      const firstRes = myLogs[0].result;
      let count = 0;
      for (const lg of myLogs) {
        if (lg.result === firstRes) count++;
        else break;
      }
      streakCode = `${firstRes}${count}`;
    }

    // 2. Locate Next Game strictly after gameDate (and never matching currentEventId)
    const futureTeamLogs = teamObj.games
      .filter(
        (g) =>
          g.seasonLabel === seasonLabel &&
          g.eventId !== currentEventId &&
          g.date.slice(0, 10) > gameDate
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    const nextFromSchedule = scheduleGames.find(
      (sg) =>
        sg.gameId !== currentEventId &&
        sg.dateIso > gameDate &&
        (sg.awayAbbr === abbr || sg.homeAbbr === abbr)
    );

    if (futureTeamLogs.length > 0) {
      const nl = futureTeamLogs[0];
      const nlDate = nl.date.slice(0, 10);
      const matchedSched = scheduleGames.find(
        (sg) =>
          sg.gameId === nl.eventId ||
          (sg.dateIso === nlDate &&
            (sg.awayAbbr === abbr || sg.homeAbbr === abbr))
      );
      const hostAbbr = nl.isHome ? abbr : nl.opponentAbbr;
      const hostArena = NBA_TEAM_ARENAS[hostAbbr];
      const dtFmt = formatSpanishScheduleDateTime(
        nlDate,
        matchedSched?.dateTimeUtc
      );
      const fatigue = computeNextGameFatigue(gameDate, nlDate);
      return {
        hasScheduledGame: true,
        record: recordAfter,
        conference: teamObj.conference,
        conferenceRank,
        streakCode,
        opponentAbbr: nl.opponentAbbr,
        opponentName:
          NBA_TEAMS_MAP[nl.opponentAbbr]?.name || nl.opponentName || nl.opponentAbbr,
        opponentTeamId: findTeamIdByAbbr(nl.opponentAbbr),
        isHome: nl.isHome,
        dateIso: nlDate,
        dateFormatted: dtFmt.dateFormatted,
        timeFormatted: dtFmt.timeFormatted,
        arenaName:
          matchedSched?.arenaName || hostArena?.arenaName || `Pabellón ${hostAbbr}`,
        arenaCity: matchedSched?.arenaCity || hostArena?.arenaCity || '',
        ...fatigue,
      };
    }

    if (nextFromSchedule) {
      const isHome = nextFromSchedule.homeAbbr === abbr;
      const oppAbbr = isHome
        ? nextFromSchedule.awayAbbr
        : nextFromSchedule.homeAbbr;
      const dtFmt = formatSpanishScheduleDateTime(
        nextFromSchedule.dateIso,
        nextFromSchedule.dateTimeUtc
      );
      const fatigue = computeNextGameFatigue(gameDate, nextFromSchedule.dateIso);
      return {
        hasScheduledGame: true,
        record: recordAfter,
        conference: teamObj.conference,
        conferenceRank,
        streakCode,
        opponentAbbr: oppAbbr,
        opponentName: NBA_TEAMS_MAP[oppAbbr]?.name || oppAbbr,
        opponentTeamId: findTeamIdByAbbr(oppAbbr),
        isHome,
        dateIso: nextFromSchedule.dateIso,
        dateFormatted: dtFmt.dateFormatted,
        timeFormatted: dtFmt.timeFormatted,
        arenaName: nextFromSchedule.arenaName,
        arenaCity: nextFromSchedule.arenaCity,
        ...fatigue,
      };
    }

    // Tier C: ESPN Team Schedule fallback for upcoming games (converted to US Eastern date)
    const espnId = ESPN_TEAM_IDS[abbr];
    if (espnId && seasonLabel === '2026-27') {
      try {
        const espnSched = await deps.cachedFetchJson<Record<string, any>>(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnId}/schedule`,
          2 * 60 * 60 * 1000,
          {},
          5500,
          forceRefresh
        );
        const events = Array.isArray(espnSched?.events) ? espnSched.events : [];
        for (const ev of events) {
          const evUtc = String(ev?.date || '').trim();
          const evIso = evUtc.includes('T')
            ? utcToEasternDateIso(evUtc) || evUtc.slice(0, 10)
            : evUtc.slice(0, 10);
          if (!evIso || evIso <= gameDate) continue;
          const comp = ev?.competitions?.[0];
          const competitors = Array.isArray(comp?.competitors)
            ? comp.competitors
            : [];
          const meComp = competitors.find(
            (c: any) =>
              normalizeEspnTeamAbbr(c?.team?.abbreviation || '') === abbr
          );
          const oppComp = competitors.find(
            (c: any) =>
              normalizeEspnTeamAbbr(c?.team?.abbreviation || '') !== abbr
          );
          if (!oppComp) continue;
          const oppAbbr = normalizeEspnTeamAbbr(
            oppComp?.team?.abbreviation || 'NBA'
          );
          const isHome = meComp?.homeAway === 'home';
          const hostAbbr = isHome ? abbr : oppAbbr;
          const hostArena = NBA_TEAM_ARENAS[hostAbbr];
          const venueName =
            String(comp?.venue?.fullName || '').trim() ||
            hostArena?.arenaName ||
            `Pabellón ${hostAbbr}`;
          const venueCity =
            String(comp?.venue?.address?.city || '').trim() ||
            hostArena?.arenaCity ||
            '';
          const dtFmt = formatSpanishScheduleDateTime(evIso, evUtc);
          const fatigue = computeNextGameFatigue(gameDate, evIso);
          return {
            hasScheduledGame: true,
            record: recordAfter,
            conference: teamObj.conference,
            conferenceRank,
            streakCode,
            opponentAbbr: oppAbbr,
            opponentName:
              NBA_TEAMS_MAP[oppAbbr]?.name ||
              String(oppComp?.team?.displayName || oppAbbr),
            opponentTeamId: findTeamIdByAbbr(oppAbbr),
            isHome,
            dateIso: evIso,
            dateFormatted: dtFmt.dateFormatted,
            timeFormatted: dtFmt.timeFormatted,
            arenaName: venueName,
            arenaCity: venueCity,
            ...fatigue,
          };
        }
      } catch {
        // Ignore ESPN schedule fallback failure
      }
    }

    const emptyFatigue = computeNextGameFatigue(gameDate, undefined);
    return {
      hasScheduledGame: false,
      record: recordAfter,
      conference: teamObj.conference,
      conferenceRank,
      streakCode,
      opponentAbbr: '',
      opponentName: 'Calendario regular completado en este tramo',
      isHome: true,
      dateFormatted: 'Sin próximo encuentro programado',
      timeFormatted: '—',
      arenaName: NBA_TEAM_ARENAS[abbr]?.arenaName || '',
      arenaCity: NBA_TEAM_ARENAS[abbr]?.arenaCity || '',
      ...emptyFatigue,
    };
  }

  /**
   * 1. FAST EMPIRICAL REPORT & NBA.COM GAME BOOK ASSEMBLER (Zero "N/D" guaranteed)
   */
  async function computeGameOfficialReportData(
    eventId: string,
    forceRefresh = false,
    cacheKey = `game_official_report_v6:${eventId}`
  ): Promise<GameOfficialReportData> {

    const [full, biosMap, scheduleGames] = await Promise.all([
      deps.getFullLeagueMemory(),
      deps.getPlayerBiosMap(forceRefresh),
      fetchLeagueScheduleGames(forceRefresh),
    ]);

    // Locate away & home TeamGameLog in memory
    let homeTeamObj: TeamSummary | undefined;
    let homeLog: TeamGameLog | undefined;
    let awayTeamObj: TeamSummary | undefined;
    let awayLog: TeamGameLog | undefined;

    for (const t of full.teams) {
      const g = t.games.find((x) => x.eventId === eventId);
      if (g) {
        if (g.isHome) {
          homeTeamObj = t;
          homeLog = g;
        } else {
          awayTeamObj = t;
          awayLog = g;
        }
      }
    }

    if (!homeTeamObj || !homeLog || !awayTeamObj || !awayLog) {
      throw new Error(`Encuentro ${eventId} no encontrado en el registro oficial NBA.`);
    }

    const gameDate = homeLog.date.slice(0, 10);
    const seasonLabel = homeLog.seasonLabel;
    const homeAbbr = homeTeamObj.abbreviation;
    const awayAbbr = awayTeamObj.abbreviation;

    // Map players by id from memory for season baselines & fallback stats
    const playerById = new Map<string, PlayerSummary>();
    for (const p of full.allPlayers) {
      playerById.set(p.id, p);
    }

    // Fetch live ESPN injury directory for 2026-27 to distinguish medical absences from technical decisions
    const espnInjuriesMap =
      seasonLabel === '2026-27'
        ? await fetchEspnInjuriesByName(forceRefresh)
        : new Map<string, { status: string; detail: string }>();

    // Fetch official NBA CDN Live Boxscore (with graceful catch so historical/edge IDs never fail)
    let cdnGame: Record<string, any> | null = null;
    if (/^00\d{8}$/.test(eventId)) {
      const ttl = seasonLabel === '2026-27' ? 10 * 60 * 1000 : 120 * 60 * 1000;
      try {
        const bj = await deps.cachedFetchJson<Record<string, any>>(
          `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${eventId}.json`,
          ttl,
          NBA_LIVE_HEADERS,
          9000,
          forceRefresh
        );
        if (bj && bj.game) {
          cdnGame = bj.game;
        }
      } catch (err) {
        console.warn(`NBA CDN boxscore fallback for ${eventId}:`, err);
      }
    }

    // Arena, City, Attendance, Officials, Duration
    const fallbackArena = NBA_TEAM_ARENAS[homeAbbr] || {
      arenaName: `Pabellón de ${homeTeamObj.shortName}`,
      arenaCity: homeTeamObj.name,
    };
    const arenaName =
      String(cdnGame?.arena?.arenaName || '').trim() || fallbackArena.arenaName;
    const arenaCity =
      String(cdnGame?.arena?.arenaCity || '').trim() || fallbackArena.arenaCity;
    const rawAttendance = Number(cdnGame?.attendance) || 0;
    const attendance = rawAttendance > 0 ? rawAttendance : null;
    const attendanceFormatted =
      attendance !== null
        ? `${formatThousandsEs(attendance)} espectadores`
        : 'Aforo oficial NBA';

    const rawDuration = Number(cdnGame?.duration) || 0;
    const durationMinutes = rawDuration > 0 ? rawDuration : null;
    const officials: string[] = Array.isArray(cdnGame?.officials)
      ? cdnGame.officials
          .map((o: any) => String(o?.name || '').trim())
          .filter(Boolean)
      : [];

    // Quarter-by-Quarter Period Scores
    const periods: GamePeriodScore[] = [];
    const cdnAwayPeriods = Array.isArray(cdnGame?.awayTeam?.periods)
      ? cdnGame.awayTeam.periods
      : [];
    const cdnHomePeriods = Array.isArray(cdnGame?.homeTeam?.periods)
      ? cdnGame.homeTeam.periods
      : [];

    if (cdnAwayPeriods.length > 0 && cdnHomePeriods.length > 0) {
      const maxLen = Math.max(cdnAwayPeriods.length, cdnHomePeriods.length);
      for (let i = 0; i < maxLen; i++) {
        const ap = cdnAwayPeriods[i];
        const hp = cdnHomePeriods[i];
        const pNum = Number(ap?.period || hp?.period || i + 1);
        const isOt = pNum > 4 || String(ap?.periodType || '').toUpperCase() === 'OVERTIME';
        const otIdx = pNum - 4;
        periods.push({
          period: pNum,
          label: isOt ? (maxLen > 5 ? `PR${otIdx}` : 'PR') : `${pNum}Q`,
          isOvertime: isOt,
          awayScore: Number(ap?.score) || 0,
          homeScore: Number(hp?.score) || 0,
        });
      }
    }

    const isOvertime = periods.some((p) => p.isOvertime);
    const overtimeCount = periods.filter((p) => p.isOvertime).length;

    // Identify the decisive quarter / inflection point
    const winnerSideKey: 'away' | 'home' =
      awayLog.pointsFor > homeLog.pointsFor ? 'away' : 'home';
    const winnerAbbr = winnerSideKey === 'away' ? awayAbbr : homeAbbr;
    let decisivePeriodLabel =
      Math.abs(awayLog.pointsFor - homeLog.pointsFor) <= 5
        ? 'Desenlace en el clutch final'
        : `Dominio sostenido de ${winnerAbbr}`;

    if (periods.length > 0) {
      let bestSwing = -999;
      let bestP: GamePeriodScore = periods[0];
      for (const p of periods) {
        const swing =
          winnerSideKey === 'away'
            ? p.awayScore - p.homeScore
            : p.homeScore - p.awayScore;
        if (swing > bestSwing) {
          bestSwing = swing;
          bestP = p;
        }
      }
      if (bestP.isOvertime) {
        decisivePeriodLabel = `${bestP.label} (${bestP.awayScore}-${bestP.homeScore} · +${bestSwing} ${winnerAbbr})`;
      } else if (bestSwing >= 6) {
        decisivePeriodLabel = `${bestP.label} (${bestP.awayScore}-${bestP.homeScore} · +${bestSwing} ${winnerAbbr})`;
      } else {
        const p4 = periods.find((p) => p.period === 4) || bestP;
        decisivePeriodLabel = `Cierre en ${p4.label} (${p4.awayScore}-${p4.homeScore})`;
      }
    }

    const computeRecordUpToDate = (tm: TeamSummary): string => {
      const slice = tm.games.filter(
        (g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate
      );
      const w = slice.filter((g) => g.result === 'W').length;
      const l = slice.length - w;
      return `${w}-${l}`;
    };

    const spanishDetails: GameOfficialReportData['spanishPlayersReport']['details'] = [];
    const milestonesList: GameOfficialReportData['milestonesList'] = [];
    const seenSpanishIds = new Set<string>();

    const buildSideReport = (
      sideRole: 'away' | 'home',
      teamObj: TeamSummary,
      teamLog: TeamGameLog,
      cdnTeam: Record<string, any> | undefined,
      oppAbbr: string
    ): GameReportTeamSide => {
      const abbr = teamObj.abbreviation;
      const isWinner = teamLog.result === 'W';
      const starters: GameBoxScorePlayerLine[] = [];
      const bench: GameBoxScorePlayerLine[] = [];
      const absencesAndDnp: GameInactiveOrDnpItem[] = [];
      const playedIdsTonight = new Set<string>();
      const listedIdsTonight = new Set<string>();

      const cdnPlayers = Array.isArray(cdnTeam?.players) ? cdnTeam.players : [];

      if (cdnPlayers.length > 0) {
        for (const cp of cdnPlayers) {
          const pid = String(cp?.personId || '');
          if (pid) listedIdsTonight.add(pid);
          const bio = pid ? biosMap.get(pid) : undefined;
          const fullName =
            String(cp?.name || '').trim() || bio?.name || 'Jugador NBA';
          const shortName = buildShortPlayerName(
            fullName,
            cp?.firstName,
            cp?.familyName
          );
          const jersey = sanitizeJersey(cp?.jerseyNum, bio?.jersey);
          const position =
            String(cp?.position || '').trim() || bio?.position || 'JUG';
          const country = bio?.country || '';
          const isSpanish = isSpanishPlayerCheck(fullName, country);

          const playedFlag = String(cp?.played || '') === '1';
          const statusStr = String(cp?.status || 'ACTIVE').toUpperCase();
          const minParsed = parseIsoMinutes(cp?.statistics?.minutes);

          if (!playedFlag || statusStr !== 'ACTIVE' || minParsed.decimal <= 0) {
            const isActiveOnBench = statusStr === 'ACTIVE';
            const category: GameInactiveOrDnpItem['category'] = isActiveOnBench
              ? 'dnp_bench'
              : 'inactive';
            const espnInj = espnInjuriesMap.get(normalizePlain(fullName));
            const classified = classifyAbsenceOrDnp(
              isActiveOnBench,
              cp?.notPlayingReason,
              cp?.notPlayingDescription,
              espnInj
            );

            const plMem = pid ? playerById.get(pid) : undefined;
            const sLogs = plMem
              ? plMem.games.filter((g) => g.seasonLabel === seasonLabel)
              : [];
            const avgMin =
              sLogs.length >= 2
                ? round1(sLogs.reduce((s, g) => s + g.minutes, 0) / sLogs.length)
                : undefined;
            const avgPts =
              sLogs.length >= 2
                ? round1(sLogs.reduce((s, g) => s + g.points, 0) / sLogs.length)
                : undefined;
            const baselineTail =
              avgMin !== undefined &&
              avgPts !== undefined &&
              avgMin >= 12 &&
              classified.statusType !== 'coach_decision' &&
              classified.statusType !== 'gleague'
                ? ` · Media ${avgPts.toFixed(1)} PTS y ${avgMin.toFixed(1)} MIN`
                : '';
            const enrichedNote = `${classified.note}${baselineTail}`;

            absencesAndDnp.push({
              playerId: pid || undefined,
              name: fullName,
              jersey,
              category,
              statusType: classified.statusType,
              statusLabel: classified.statusLabel,
              statusTone: classified.statusTone,
              priorityRank: classified.priorityRank,
              ptsAvg: avgPts,
              minAvg: avgMin,
              note: enrichedNote,
              isSpanish,
            });
            if (isSpanish && pid && !seenSpanishIds.has(pid)) {
              seenSpanishIds.add(pid);
              spanishDetails.push({
                playerId: pid,
                name: fullName,
                jersey,
                teamAbbr: abbr,
                played: false,
                lineSummary: `#${jersey} ${fullName} (${abbr}) — ${classified.statusLabel}: ${enrichedNote}`,
              });
            }
            continue;
          }

          playedIdsTonight.add(pid);
          const st = cp.statistics || {};
          const pts = Number(st.points) || 0;
          const reb = Number(st.reboundsTotal) || 0;
          const oreb = Number(st.reboundsOffensive) || 0;
          const dreb = Number(st.reboundsDefensive) || 0;
          const ast = Number(st.assists) || 0;
          const stl = Number(st.steals) || 0;
          const blk = Number(st.blocks) || 0;
          const tov = Number(st.turnovers) || 0;
          const pf = Number(st.foulsPersonal) || 0;
          const pm = Number(st.plusMinusPoints) || 0;
          const fgm = Number(st.fieldGoalsMade) || 0;
          const fga = Number(st.fieldGoalsAttempted) || 0;
          const fg3m = Number(st.threePointersMade) || 0;
          const fg3a = Number(st.threePointersAttempted) || 0;
          const ftm = Number(st.freeThrowsMade) || 0;
          const fta = Number(st.freeThrowsAttempted) || 0;
          const fgPct = fga > 0 ? round1((fgm / fga) * 100) : 0;
          const fg3Pct = fg3a > 0 ? round1((fg3m / fg3a) * 100) : 0;
          const ftPct = fta > 0 ? round1((ftm / fta) * 100) : 0;
          const tsDenom = 2 * (fga + 0.44 * fta);
          const tsPct = tsDenom > 0 ? round1((pts / tsDenom) * 100) : 0;
          const gmSc = computeHollingerGmSc({
            points: pts,
            fgm,
            fga,
            ftm,
            fta,
            oreb,
            dreb,
            stl,
            ast,
            blk,
            pf,
            tov,
          });

          const tens = [pts, reb, ast, stl, blk].filter((v) => v >= 10).length;
          const tripleDouble = tens >= 3;
          const doubleDouble = tens === 2;

          const lineObj: GameBoxScorePlayerLine = {
            playerId: pid,
            name: fullName,
            shortName,
            jersey,
            position,
            country,
            isSpanish,
            isStarter: String(cp?.starter || '') === '1',
            minutes: minParsed.decimal,
            minutesFormatted: minParsed.formatted,
            points: pts,
            rebounds: reb,
            oreb,
            dreb,
            assists: ast,
            steals: stl,
            blocks: blk,
            turnovers: tov,
            fouls: pf,
            plusMinus: pm,
            fgm,
            fga,
            fgPct,
            fg3m,
            fg3a,
            fg3Pct,
            ftm,
            fta,
            ftPct,
            tsPct,
            gameScore: gmSc,
            ptsPaint:
              typeof st.pointsInThePaint === 'number'
                ? st.pointsInThePaint
                : undefined,
            ptsFastBreak:
              typeof st.pointsFastBreak === 'number'
                ? st.pointsFastBreak
                : undefined,
            doubleDouble,
            tripleDouble,
          };

          if (lineObj.isStarter) starters.push(lineObj);
          else bench.push(lineObj);

          if (isSpanish && !seenSpanishIds.has(pid)) {
            seenSpanishIds.add(pid);
            spanishDetails.push({
              playerId: pid,
              name: fullName,
              jersey,
              teamAbbr: abbr,
              played: true,
              lineSummary: `#${jersey} ${fullName} (${abbr}): ${pts} PTS, ${reb} REB, ${ast} AST en ${minParsed.formatted} min (${fgm}/${fga} TC, ${
                pm >= 0 ? `+${pm}` : pm
              })`,
            });
          }

          if (tripleDouble || doubleDouble) {
            milestonesList.push({
              playerId: pid,
              name: fullName,
              jersey,
              teamAbbr: abbr,
              type: tripleDouble ? 'TD' : 'DD',
              detail: `#${jersey} ${fullName} (${abbr}): ${pts} PTS · ${reb} REB · ${ast} AST${
                stl >= 10 ? ` · ${stl} ROB` : ''
              }${blk >= 10 ? ` · ${blk} TAP` : ''}`,
            });
          }
        }
      } else {
        // Memory fallback if CDN was unreachable
        const memMatched: GameBoxScorePlayerLine[] = [];
        for (const p of full.allPlayers) {
          const g = p.games.find((x) => x.eventId === eventId);
          if (!g) continue;
          const belongsHere =
            g.opponentAbbr === oppAbbr ||
            (g.isHome && sideRole === 'home') ||
            (!g.isHome && sideRole === 'away');
          if (!belongsHere) continue;

          playedIdsTonight.add(p.id);
          listedIdsTonight.add(p.id);
          const bio = biosMap.get(p.id);
          const jersey = sanitizeJersey(p.jersey, bio?.jersey);
          const country = p.country || bio?.country || '';
          const isSpanish = isSpanishPlayerCheck(p.name, country);
          const tens = [
            g.points,
            g.rebounds,
            g.assists,
            g.steals,
            g.blocks,
          ].filter((v) => v >= 10).length;
          const tripleDouble = tens >= 3;
          const doubleDouble = tens === 2;
          const minParsed = parseIsoMinutes(g.minutes);

          const lineObj: GameBoxScorePlayerLine = {
            playerId: p.id,
            name: p.name,
            shortName: buildShortPlayerName(p.name),
            jersey,
            position: p.position || bio?.position || 'JUG',
            country,
            isSpanish,
            isStarter: false,
            minutes: g.minutes,
            minutesFormatted: minParsed.formatted,
            points: g.points,
            rebounds: g.rebounds,
            oreb: g.oreb,
            dreb: g.dreb,
            assists: g.assists,
            steals: g.steals,
            blocks: g.blocks,
            turnovers: g.turnovers,
            fouls: g.fouls,
            plusMinus: g.plusMinus,
            fgm: g.fgm,
            fga: g.fga,
            fgPct: g.fgPct,
            fg3m: g.fg3m,
            fg3a: g.fg3a,
            fg3Pct: g.fg3Pct,
            ftm: g.ftm,
            fta: g.fta,
            ftPct: g.ftPct,
            tsPct: g.tsPct,
            gameScore: g.gameScore,
            ptsPaint: Math.max(0, (g.fgm - g.fg3m) * 2),
            doubleDouble,
            tripleDouble,
          };
          memMatched.push(lineObj);

          if (isSpanish && !seenSpanishIds.has(p.id)) {
            seenSpanishIds.add(p.id);
            spanishDetails.push({
              playerId: p.id,
              name: p.name,
              jersey,
              teamAbbr: abbr,
              played: true,
              lineSummary: `#${jersey} ${p.name} (${abbr}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST en ${minParsed.formatted} min`,
            });
          }
          if (tripleDouble || doubleDouble) {
            milestonesList.push({
              playerId: p.id,
              name: p.name,
              jersey,
              teamAbbr: abbr,
              type: tripleDouble ? 'TD' : 'DD',
              detail: `#${jersey} ${p.name} (${abbr}): ${g.points} PTS · ${g.rebounds} REB · ${g.assists} AST`,
            });
          }
        }
        memMatched.sort((a, b) => b.minutes - a.minutes);
        memMatched.forEach((pl, idx) => {
          pl.isStarter = idx < 5;
          if (idx < 5) starters.push(pl);
          else bench.push(pl);
        });
      }

      // Detect regular season rotation absences (players on this team in `seasonLabel` who missed tonight)
      // Also check any Spanish player on this team's current roster who wasn't listed yet
      if (seasonLabel === '2026-27') {
        for (const p of full.allPlayers) {
          if (p.teamAbbr !== abbr) continue;
          const bio = biosMap.get(p.id);
          const isSp = isSpanishPlayerCheck(p.name, p.country || bio?.country);
          const seasonGames = p.games.filter((g) => g.seasonLabel === '2026-27');

          if (isSp && !seenSpanishIds.has(p.id)) {
            seenSpanishIds.add(p.id);
            const j = sanitizeJersey(p.jersey, bio?.jersey);
            const spInj = espnInjuriesMap.get(normalizePlain(p.name));
            const spCleanInj = spInj ? translateMedicalDetailEs(spInj.detail) : '';
            spanishDetails.push({
              playerId: p.id,
              name: p.name,
              jersey: j,
              teamAbbr: abbr,
              played: false,
              lineSummary: spInj
                ? `#${j} ${p.name} (${abbr}) — Lesionado: Parte médico (${spCleanInj || 'baja médica'})`
                : `#${j} ${p.name} (${abbr}) — Decisión técnica: Fuera de convocatoria sin parte médico activo`,
            });
          }

          if (playedIdsTonight.has(p.id) || listedIdsTonight.has(p.id)) continue;
          if (seasonGames.length < 2) continue;
          const avgMin =
            seasonGames.reduce((s, g) => s + g.minutes, 0) / seasonGames.length;
          const avgPts =
            seasonGames.reduce((s, g) => s + g.points, 0) / seasonGames.length;
          if (avgMin >= 14.5) {
            const espnInj = espnInjuriesMap.get(normalizePlain(p.name));
            const cleanInj = espnInj ? translateMedicalDetailEs(espnInj.detail) : '';
            absencesAndDnp.unshift({
              playerId: p.id,
              name: p.name,
              jersey: sanitizeJersey(p.jersey, bio?.jersey),
              category: 'rotation_absence',
              statusType: espnInj ? 'injury' : 'coach_decision',
              statusLabel: espnInj ? 'Lesionado' : 'Decisión técnica',
              statusTone: espnInj ? 'rose' : 'slate',
              priorityRank: espnInj ? 3 : 6,
              ptsAvg: round1(avgPts),
              minAvg: round1(avgMin),
              note: espnInj
                ? `Parte médico: ${cleanInj || 'baja médica confirmada'} · Media ${avgPts.toFixed(1)} PTS y ${avgMin.toFixed(1)} MIN`
                : `Fuera de convocatoria sin parte médico activo (media ${avgPts.toFixed(1)} PTS · ${avgMin.toFixed(1)} MIN)`,
              isSpanish: isSp,
            });
          }
        }

        // Also scan biosMap for Spanish roster members with 0 season games yet
        for (const b of biosMap.values()) {
          if (b.teamAbbr !== abbr) continue;
          if (isSpanishPlayerCheck(b.name, b.country) && !seenSpanishIds.has(b.id)) {
            seenSpanishIds.add(b.id);
            const j = sanitizeJersey(b.jersey);
            spanishDetails.push({
              playerId: b.id,
              name: b.name,
              jersey: j,
              teamAbbr: abbr,
              played: false,
              lineSummary: `#${j} ${b.name} (${abbr}): en plantilla oficial, sin participación en el encuentro`,
            });
          }
        }
      }

      starters.sort((a, b) => b.minutes - a.minutes || b.points - a.points);
      bench.sort((a, b) => b.minutes - a.minutes || b.points - a.points);

      const allPlayed = [...starters, ...bench];
      const cdnStats = cdnTeam?.statistics || {};
      const sumFouls = allPlayed.reduce((s, x) => s + x.fouls, 0);
      const sumBenchPts = bench.reduce((s, x) => s + x.points, 0);

      // Compute estimated USG% and detect in-game setbacks (e.g. premature departure/injury/fouls)
      const teamPossEst = teamLog.fga + 0.44 * teamLog.fta + teamLog.tov;
      for (const pl of allPlayed) {
        const plPoss = pl.fga + 0.44 * pl.fta + pl.turnovers;
        if (teamPossEst > 0 && pl.minutes > 0) {
          const usgVal = (plPoss / (teamPossEst * (pl.minutes / 48))) * 20;
          pl.usgEst = round1(Math.min(55, Math.max(0, usgVal)));
        } else {
          pl.usgEst = 0;
        }

        const plSummary = playerById.get(pl.playerId);
        const seasonLogs = plSummary
          ? plSummary.games.filter(
              (g) => g.seasonLabel === seasonLabel && g.minutes > 0
            )
          : [];
        const otherSeasonGames = seasonLogs.filter((g) => g.eventId !== eventId);

        // Compute personal Season Highs across all games played by this player in `seasonLabel`
        if (otherSeasonGames.length >= 1) {
          const totalGamesSample = otherSeasonGames.length + 1;
          const highs: Record<string, PlayerSeasonHighEntry> = {};

          const evalSeasonHigh = (
            colKey: string,
            tonightVal: number,
            extractOther: (g: PlayerGameLog) => number,
            opts?: {
              qualifyTonight?: boolean;
              qualifyOther?: (g: PlayerGameLog) => boolean;
              minPositive?: boolean;
              eps?: number;
              skipRoutinePerfectTie?: boolean;
            }
          ) => {
            if (opts?.qualifyTonight === false) return;
            if ((opts?.minPositive ?? true) && tonightVal <= 0) return;
            const eligibleOthers = opts?.qualifyOther
              ? otherSeasonGames.filter(opts.qualifyOther)
              : otherSeasonGames;
            if (eligibleOthers.length === 0) return;

            let maxOther = -Infinity;
            let tiedCount = 0;
            const eps = opts?.eps ?? 0.05;
            for (const og of eligibleOthers) {
              const v = extractOther(og);
              if (v > maxOther) maxOther = v;
            }
            if (!Number.isFinite(maxOther)) return;
            for (const og of eligibleOthers) {
              if (Math.abs(extractOther(og) - tonightVal) <= eps) {
                tiedCount++;
              }
            }

            if (tonightVal > maxOther + eps) {
              highs[colKey] = {
                mode: 'sole',
                prevBest: round1(maxOther),
                gamesPlayed: totalGamesSample,
              };
            } else if (Math.abs(tonightVal - maxOther) <= eps) {
              if (opts?.skipRoutinePerfectTie && tonightVal >= 99.9 && tiedCount >= 2) {
                return;
              }
              highs[colKey] = {
                mode: 'tied',
                prevBest: round1(maxOther),
                gamesPlayed: totalGamesSample,
              };
            }
          };

          evalSeasonHigh('min', pl.minutes, (g) => g.minutes, { eps: 0.09 });
          evalSeasonHigh('pts', pl.points, (g) => g.points);
          evalSeasonHigh('fgm', pl.fgm, (g) => g.fgm);
          evalSeasonHigh('fga', pl.fga, (g) => g.fga);
          evalSeasonHigh('fgPct', pl.fgPct, (g) => g.fgPct, {
            qualifyTonight: pl.fga >= 4,
            qualifyOther: (g) => g.fga >= 4,
            eps: 0.15,
            skipRoutinePerfectTie: true,
          });
          evalSeasonHigh('fg3m', pl.fg3m, (g) => g.fg3m);
          evalSeasonHigh('fg3a', pl.fg3a, (g) => g.fg3a);
          evalSeasonHigh('fg3Pct', pl.fg3Pct, (g) => g.fg3Pct, {
            qualifyTonight: pl.fg3a >= 3,
            qualifyOther: (g) => g.fg3a >= 3,
            eps: 0.15,
            skipRoutinePerfectTie: true,
          });
          evalSeasonHigh('ftm', pl.ftm, (g) => g.ftm);
          evalSeasonHigh('fta', pl.fta, (g) => g.fta);
          evalSeasonHigh('ftPct', pl.ftPct, (g) => g.ftPct, {
            qualifyTonight: pl.fta >= 4,
            qualifyOther: (g) => g.fta >= 4,
            eps: 0.15,
            skipRoutinePerfectTie: true,
          });
          evalSeasonHigh('oreb', pl.oreb, (g) => g.oreb);
          evalSeasonHigh('dreb', pl.dreb, (g) => g.dreb);
          evalSeasonHigh('reb', pl.rebounds, (g) => g.rebounds);
          evalSeasonHigh('ast', pl.assists, (g) => g.assists);
          evalSeasonHigh('stl', pl.steals, (g) => g.steals);
          evalSeasonHigh('blk', pl.blocks, (g) => g.blocks);
          evalSeasonHigh('plusMinus', pl.plusMinus, (g) => g.plusMinus, {
            minPositive: true,
          });
          evalSeasonHigh('gameScore', pl.gameScore, (g) => g.gameScore, {
            minPositive: true,
            eps: 0.09,
          });
          evalSeasonHigh('tsPct', pl.tsPct, (g) => g.tsPct, {
            qualifyTonight: pl.fga + pl.fta >= 5,
            qualifyOther: (g) => g.fga + g.fta >= 5,
            eps: 0.15,
          });
          evalSeasonHigh('usgEst', pl.usgEst || 0, (g) => g.usgEst || 0, {
            qualifyTonight: pl.minutes >= 10,
            qualifyOther: (g) => g.minutes >= 10,
            eps: 0.25,
          });

          if (Object.keys(highs).length > 0) {
            pl.seasonHighs = highs;
          }
        }

        const hasSeasonBase = seasonLogs.length >= 3;
        const avgMin = hasSeasonBase
          ? seasonLogs.reduce((s, g) => s + g.minutes, 0) / seasonLogs.length
          : undefined;
        const avgPts = hasSeasonBase
          ? seasonLogs.reduce((s, g) => s + g.points, 0) / seasonLogs.length
          : undefined;

        // 1. Unconditional check for 6 personal fouls (foul-out) for ANY player
        if (pl.fouls >= 6) {
          absencesAndDnp.unshift({
            playerId: pl.playerId,
            name: pl.name,
            jersey: pl.jersey,
            category: 'in_game_setback',
            statusType: 'foul_out',
            statusLabel: 'Expulsado (6 faltas)',
            statusTone: 'rose',
            priorityRank: 1,
            note: `Expulsado por 6 faltas personales · ${pl.minutesFormatted} min jugados (${pl.points} PTS · ${pl.rebounds} REB)`,
            ptsAvg: avgPts !== undefined ? round1(avgPts) : undefined,
            minAvg: avgMin !== undefined ? round1(avgMin) : undefined,
            reason: '6 Faltas personales',
            isSpanish: pl.isSpanish,
          });
        } else if (
          avgMin !== undefined &&
          avgPts !== undefined &&
          avgMin >= 16 &&
          pl.minutes <= Math.min(11.5, avgMin * 0.42)
        ) {
          // 2. Premature departure / in-game setback
          const espnInj = espnInjuriesMap.get(normalizePlain(pl.name));
          const cleanInj = espnInj ? translateMedicalDetailEs(espnInj.detail) : '';
          absencesAndDnp.unshift({
            playerId: pl.playerId,
            name: pl.name,
            jersey: pl.jersey,
            category: 'in_game_setback',
            statusType: 'in_game_setback',
            statusLabel: 'Percance en pista',
            statusTone: 'amber',
            priorityRank: 2,
            note: `Salida prematura${cleanInj ? ` (${cleanInj})` : ''} · Solo ${pl.minutesFormatted} min en pista (media habitual: ${avgMin.toFixed(1)} MIN · ${avgPts.toFixed(1)} PTS)`,
            ptsAvg: round1(avgPts),
            minAvg: round1(avgMin),
            reason: 'Retirado prematuramente durante el encuentro',
            isSpanish: pl.isSpanish,
          });
        }
      }

      // Sort incidences cleanly: ejections & setbacks first, then medical injuries, then coach decisions
      absencesAndDnp.sort(
        (a, b) =>
          (a.priorityRank ?? 8) - (b.priorityRank ?? 8) ||
          (b.ptsAvg ?? 0) - (a.ptsAvg ?? 0)
      );

      const totals: GameTeamTotalsSummary = {
        points: teamLog.pointsFor,
        fgm: teamLog.fgm,
        fga: teamLog.fga,
        fgPct: teamLog.fgPct,
        fg3m: teamLog.fg3m,
        fg3a: teamLog.fg3a,
        fg3Pct: teamLog.fg3Pct,
        ftm: teamLog.ftm,
        fta: teamLog.fta,
        ftPct: teamLog.ftPct,
        reb: teamLog.reb,
        oreb: teamLog.oreb,
        dreb: teamLog.dreb,
        ast: teamLog.ast,
        stl: teamLog.stl,
        blk: teamLog.blk,
        tov: teamLog.tov,
        fouls:
          typeof cdnStats.foulsPersonal === 'number'
            ? cdnStats.foulsPersonal
            : sumFouls,
        efgPct: teamLog.efgPct,
        tsPct: teamLog.tsPct,
        offRtg: teamLog.offRtg,
        defRtg: teamLog.defRtg,
        netRtg: teamLog.netRtg,
        pace: teamLog.pace,
        ptsPaint:
          typeof cdnStats.pointsInThePaint === 'number'
            ? cdnStats.pointsInThePaint
            : Math.round(teamLog.pointsFor * 0.42),
        ptsFastBreak:
          typeof cdnStats.pointsFastBreak === 'number'
            ? cdnStats.pointsFastBreak
            : Math.round(teamLog.pointsFor * 0.14),
        ptsOffTov:
          typeof cdnStats.pointsFromTurnovers === 'number'
            ? cdnStats.pointsFromTurnovers
            : Math.round(teamLog.tov * 1.1),
        ptsSecondChance:
          typeof cdnStats.pointsSecondChance === 'number'
            ? cdnStats.pointsSecondChance
            : Math.round(teamLog.oreb * 1.25),
        benchPoints:
          typeof cdnStats.benchPoints === 'number'
            ? cdnStats.benchPoints
            : sumBenchPts,
        biggestLead:
          typeof cdnStats.biggestLead === 'number' ? cdnStats.biggestLead : 12,
        biggestRun:
          typeof cdnStats.biggestScoringRun === 'number'
            ? cdnStats.biggestScoringRun
            : 8,
      };

      // Compute 3-Star Podium (⭐⭐⭐ / ⭐⭐ / ⭐)
      const rankedForPodium = [...allPlayed]
        .map((pl) => ({
          pl,
          podiumScore: round1(
            pl.gameScore + 0.22 * pl.plusMinus + (isWinner ? 1.5 : 0)
          ),
        }))
        .sort(
          (a, b) =>
            b.podiumScore - a.podiumScore ||
            b.pl.gameScore - a.pl.gameScore ||
            b.pl.points - a.pl.points
        )
        .slice(0, 3);

      const podium: GamePodiumEntry[] = rankedForPodium.map((item, idx) => ({
        stars: (3 - idx) as 3 | 2 | 1,
        playerId: item.pl.playerId,
        jersey: item.pl.jersey,
        name: item.pl.name,
        position: item.pl.position,
        points: item.pl.points,
        rebounds: item.pl.rebounds,
        assists: item.pl.assists,
        plusMinus: item.pl.plusMinus,
        fgm: item.pl.fgm,
        fga: item.pl.fga,
        tsPct: item.pl.tsPct,
        shortLine: `${item.pl.points}P · ${item.pl.rebounds}R · ${
          item.pl.assists
        }A · ${item.pl.plusMinus >= 0 ? `+${item.pl.plusMinus}` : item.pl.plusMinus}`,
        gameScore: item.pl.gameScore,
        podiumScore: item.podiumScore,
      }));

      const placeholderNextGame: GameNextMatchInfo = {
        hasScheduledGame: false,
        record: computeRecordUpToDate(teamObj),
        conference: teamObj.conference,
        conferenceRank: teamObj.playoffSeed || 1,
        streakCode: teamObj.streakCode || '—',
        opponentAbbr: '',
        opponentName: '',
        isHome: true,
        dateFormatted: '',
        timeFormatted: '',
        arenaName: '',
        arenaCity: '',
      };

      return {
        teamId: teamObj.id,
        abbr,
        name: teamObj.name,
        shortName: teamObj.shortName,
        recordAfter: placeholderNextGame.record,
        score: teamLog.pointsFor,
        isWinner,
        isBackToBack: teamLog.isBackToBack,
        starters,
        bench,
        totals,
        absencesAndDnp,
        podium,
        nextGame: placeholderNextGame,
      };
    };

    const awaySide = buildSideReport(
      'away',
      awayTeamObj,
      awayLog,
      cdnGame?.awayTeam,
      homeAbbr
    );
    const homeSide = buildSideReport(
      'home',
      homeTeamObj,
      homeLog,
      cdnGame?.homeTeam,
      awayAbbr
    );

    // Enrich 6-foul ejections with exact Quarter & Remaining Clock from Play-by-Play, plus resolve Next Games
    const fouledOutIds = [
      ...awaySide.absencesAndDnp,
      ...homeSide.absencesAndDnp,
    ]
      .filter((item) => item.statusType === 'foul_out' && item.playerId)
      .map((item) => String(item.playerId));

    const [foulOutTimings, awayNextGame, homeNextGame] = await Promise.all([
      fetchPlayByPlayFoulOuts(eventId, fouledOutIds, seasonLabel, forceRefresh),
      resolveTeamNextGameInfo({
        currentEventId: eventId,
        teamObj: awayTeamObj,
        recordAfter: awaySide.recordAfter,
        fullTeams: full.teams,
        gameDate,
        seasonLabel,
        scheduleGames,
        forceRefresh,
      }),
      resolveTeamNextGameInfo({
        currentEventId: eventId,
        teamObj: homeTeamObj,
        recordAfter: homeSide.recordAfter,
        fullTeams: full.teams,
        gameDate,
        seasonLabel,
        scheduleGames,
        forceRefresh,
      }),
    ]);

    awaySide.nextGame = awayNextGame;
    homeSide.nextGame = homeNextGame;

    if (foulOutTimings.size > 0) {
      for (const side of [awaySide, homeSide]) {
        const allPl = [...side.starters, ...side.bench];
        for (const item of side.absencesAndDnp) {
          if (item.statusType === 'foul_out' && item.playerId) {
            const timing = foulOutTimings.get(item.playerId);
            if (timing) {
              item.foulOutPeriod = timing.periodLabel;
              item.foulOutClock = timing.clockRemaining;
              const plLine = allPl.find((p) => p.playerId === item.playerId);
              const statTail = plLine
                ? ` · ${plLine.minutesFormatted} min (${plLine.points} PTS · ${plLine.rebounds} REB)`
                : '';
              item.note = `Expulsado por 6 faltas en el ${timing.periodLabel} (restaban ${timing.clockRemaining})${statTail}`;
            }
          }
        }
      }
    }

    // Compute NBA Season Average Pace across all 30 franchises in `seasonLabel`
    let leaguePaceSum = 0;
    let leaguePaceCount = 0;
    for (const tm of full.teams) {
      for (const gm of tm.games) {
        if (gm.seasonLabel === seasonLabel && gm.pace > 75 && gm.pace < 125) {
          leaguePaceSum += gm.pace;
          leaguePaceCount++;
        }
      }
    }
    const leagueAvgPace =
      leaguePaceCount > 0 ? round1(leaguePaceSum / leaguePaceCount) : 99.6;
    const matchPace = round1(
      (awaySide.totals.pace + homeSide.totals.pace) / 2 || awaySide.totals.pace
    );
    const paceDiffVsLeague = round1(matchPace - leagueAvgPace);

    const leadChanges =
      typeof cdnGame?.homeTeam?.statistics?.leadChanges === 'number'
        ? cdnGame.homeTeam.statistics.leadChanges
        : null;
    const timesTied =
      typeof cdnGame?.homeTeam?.statistics?.timesTied === 'number'
        ? cdnGame.homeTeam.statistics.timesTied
        : null;

    // Build Paso B Exact Header Title
    const otSuffix = isOvertime
      ? overtimeCount > 1
        ? ` (${overtimeCount} PR)`
        : ' (PR)'
      : '';
    const pasoBTitle = `${awaySide.name} vs ${homeSide.name} | ${awaySide.score}-${homeSide.score}${otSuffix} | ${arenaName}, ${arenaCity} (${attendanceFormatted})`;

    // Build 22 Unified Team Comparison Rows across 3 Sections (DefRtg removed as redundant inverse of opponent OffRtg)
    const teamComparisonRows: GameTeamComparisonRow[] = [];

    const pushTeamRow = (opts: {
      key: string;
      label: string;
      helpKey?: string;
      awayVal: number;
      homeVal: number;
      awayDisplay: string;
      homeDisplay: string;
      decimals?: number;
      suffix?: string;
      lowerIsBetter?: boolean;
      section: 'scoring_shooting' | 'efficiency_tactics' | 'reb_playmaking_defense';
    }) => {
      const dec = opts.decimals ?? 0;
      const suf = opts.suffix ?? '';
      const rawDiff = opts.awayVal - opts.homeVal;
      let betterSide: 'away' | 'home' | 'tie' = 'tie';
      if (Math.abs(rawDiff) > 0.04) {
        if (opts.lowerIsBetter) {
          betterSide = opts.awayVal < opts.homeVal ? 'away' : 'home';
        } else {
          betterSide = opts.awayVal > opts.homeVal ? 'away' : 'home';
        }
      }
      const winnerAbbrRow =
        betterSide === 'away'
          ? awaySide.abbr
          : betterSide === 'home'
          ? homeSide.abbr
          : '';
      const absStr =
        dec === 0
          ? `${Math.round(Math.abs(rawDiff))}${suf}`
          : `${Math.abs(rawDiff).toFixed(dec)}${suf}`;
      const diffDisplay =
        betterSide === 'tie' ? 'Igualado' : `+${absStr} ${winnerAbbrRow}`;

      teamComparisonRows.push({
        key: opts.key,
        label: opts.label,
        helpKey: opts.helpKey,
        awayDisplay: opts.awayDisplay,
        homeDisplay: opts.homeDisplay,
        awayNumeric: opts.awayVal,
        homeNumeric: opts.homeVal,
        diffDisplay,
        betterSide,
        section: opts.section,
        lowerIsBetter: opts.lowerIsBetter,
      });
    };

    const at = awaySide.totals;
    const ht = homeSide.totals;

    // SECTION 1: Anotación y Tiro (1-4)
    pushTeamRow({
      key: 'pts',
      label: 'Puntos Totales',
      helpKey: 'ptsBase',
      awayVal: at.points,
      homeVal: ht.points,
      awayDisplay: `${at.points}`,
      homeDisplay: `${ht.points}`,
      section: 'scoring_shooting',
    });
    pushTeamRow({
      key: 'fg',
      label: 'Tiros de Campo (TC · %)',
      helpKey: 'fgPct',
      awayVal: at.fgPct,
      homeVal: ht.fgPct,
      awayDisplay: `${at.fgm}/${at.fga} (${at.fgPct.toFixed(1)}%)`,
      homeDisplay: `${ht.fgm}/${ht.fga} (${ht.fgPct.toFixed(1)}%)`,
      decimals: 1,
      suffix: '%',
      section: 'scoring_shooting',
    });
    pushTeamRow({
      key: 'fg3',
      label: 'Triples (T3 · %)',
      helpKey: 'fg3Pct',
      awayVal: at.fg3Pct,
      homeVal: ht.fg3Pct,
      awayDisplay: `${at.fg3m}/${at.fg3a} (${at.fg3Pct.toFixed(1)}%)`,
      homeDisplay: `${ht.fg3m}/${ht.fg3a} (${ht.fg3Pct.toFixed(1)}%)`,
      decimals: 1,
      suffix: '%',
      section: 'scoring_shooting',
    });
    pushTeamRow({
      key: 'ft',
      label: 'Tiros Libres (TL · %)',
      helpKey: 'ftPct',
      awayVal: at.ftm,
      homeVal: ht.ftm,
      awayDisplay: `${at.ftm}/${at.fta} (${at.ftPct.toFixed(1)}%)`,
      homeDisplay: `${ht.ftm}/${ht.fta} (${ht.ftPct.toFixed(1)}%)`,
      suffix: ' TL',
      section: 'scoring_shooting',
    });

    // SECTION 2: Eficiencia y Pizarra Táctica (5-14)
    pushTeamRow({
      key: 'efg',
      label: 'Tiro Efectivo (eFG%)',
      helpKey: 'efgPct',
      awayVal: at.efgPct,
      homeVal: ht.efgPct,
      awayDisplay: `${at.efgPct.toFixed(1)}%`,
      homeDisplay: `${ht.efgPct.toFixed(1)}%`,
      decimals: 1,
      suffix: '%',
      section: 'efficiency_tactics',
    });
    pushTeamRow({
      key: 'ts',
      label: 'Acierto Real (TS%)',
      helpKey: 'tsPct',
      awayVal: at.tsPct,
      homeVal: ht.tsPct,
      awayDisplay: `${at.tsPct.toFixed(1)}%`,
      homeDisplay: `${ht.tsPct.toFixed(1)}%`,
      decimals: 1,
      suffix: '%',
      section: 'efficiency_tactics',
    });
    pushTeamRow({
      key: 'offRtg',
      label: 'Eficiencia Ofensiva (OffRtg)',
      helpKey: 'offRtg',
      awayVal: at.offRtg,
      homeVal: ht.offRtg,
      awayDisplay: `${at.offRtg.toFixed(1)}`,
      homeDisplay: `${ht.offRtg.toFixed(1)}`,
      decimals: 1,
      section: 'efficiency_tactics',
    });
    pushTeamRow({
      key: 'paint',
      label: 'Puntos en la pintura (PITP)',
      helpKey: 'ptsPaint',
      awayVal: at.ptsPaint ?? 0,
      homeVal: ht.ptsPaint ?? 0,
      awayDisplay: `${at.ptsPaint ?? 0}`,
      homeDisplay: `${ht.ptsPaint ?? 0}`,
      section: 'efficiency_tactics',
    });
    pushTeamRow({
      key: 'secondChance',
      label: 'Puntos 2ª oportunidad',
      helpKey: 'pts2ndChance',
      awayVal: at.ptsSecondChance ?? 0,
      homeVal: ht.ptsSecondChance ?? 0,
      awayDisplay: `${at.ptsSecondChance ?? 0}`,
      homeDisplay: `${ht.ptsSecondChance ?? 0}`,
      section: 'efficiency_tactics',
    });
    pushTeamRow({
      key: 'fastbreak',
      label: 'Puntos contraataque (FB PTS)',
      helpKey: 'ptsFastBreak',
      awayVal: at.ptsFastBreak ?? 0,
      homeVal: ht.ptsFastBreak ?? 0,
      awayDisplay: `${at.ptsFastBreak ?? 0}`,
      homeDisplay: `${ht.ptsFastBreak ?? 0}`,
      section: 'efficiency_tactics',
    });
    pushTeamRow({
      key: 'ptsOffTov',
      label: 'Puntos tras pérdidas',
      helpKey: 'ptsOffTov',
      awayVal: at.ptsOffTov ?? 0,
      homeVal: ht.ptsOffTov ?? 0,
      awayDisplay: `${at.ptsOffTov ?? 0}`,
      homeDisplay: `${ht.ptsOffTov ?? 0}`,
      section: 'efficiency_tactics',
    });
    pushTeamRow({
      key: 'bench',
      label: 'Puntos banquillo',
      helpKey: 'benchPts',
      awayVal: at.benchPoints,
      homeVal: ht.benchPoints,
      awayDisplay: `${at.benchPoints}`,
      homeDisplay: `${ht.benchPoints}`,
      section: 'efficiency_tactics',
    });
    const away3PAr = at.fga > 0 ? round1((at.fg3a / at.fga) * 100) : 0;
    const home3PAr = ht.fga > 0 ? round1((ht.fg3a / ht.fga) * 100) : 0;
    pushTeamRow({
      key: 'threeRatio',
      label: 'Ratio tiros de 3 (3PAr %)',
      helpKey: 'threeRatio',
      awayVal: away3PAr,
      homeVal: home3PAr,
      awayDisplay: `${away3PAr.toFixed(1)}% (${at.fg3a} int)`,
      homeDisplay: `${home3PAr.toFixed(1)}% (${ht.fg3a} int)`,
      decimals: 1,
      suffix: '%',
      section: 'efficiency_tactics',
    });

    // SECTION 3: Rebote, Creación, Defensa y Disciplina (15-23)
    pushTeamRow({
      key: 'reb',
      label: 'Rebotes Totales (REB)',
      helpKey: 'rebBase',
      awayVal: at.reb,
      homeVal: ht.reb,
      awayDisplay: `${at.reb} (${at.oreb} OF / ${at.dreb} DEF)`,
      homeDisplay: `${ht.reb} (${ht.oreb} OF / ${ht.dreb} DEF)`,
      section: 'reb_playmaking_defense',
    });
    pushTeamRow({
      key: 'oreb',
      label: 'Rebote Ofensivo (OREB · %)',
      helpKey: 'orebPct',
      awayVal: at.oreb,
      homeVal: ht.oreb,
      awayDisplay: `${at.oreb} (${awayLog.orebPct.toFixed(1)}%)`,
      homeDisplay: `${ht.oreb} (${homeLog.orebPct.toFixed(1)}%)`,
      suffix: ' OR',
      section: 'reb_playmaking_defense',
    });
    pushTeamRow({
      key: 'ast',
      label: 'Asistencias (AST)',
      helpKey: 'astBase',
      awayVal: at.ast,
      homeVal: ht.ast,
      awayDisplay: `${at.ast}`,
      homeDisplay: `${ht.ast}`,
      section: 'reb_playmaking_defense',
    });
    pushTeamRow({
      key: 'stl',
      label: 'Robos (ROB)',
      helpKey: 'steals',
      awayVal: at.stl,
      homeVal: ht.stl,
      awayDisplay: `${at.stl}`,
      homeDisplay: `${ht.stl}`,
      section: 'reb_playmaking_defense',
    });
    pushTeamRow({
      key: 'blk',
      label: 'Tapones (TAP)',
      helpKey: 'blocks',
      awayVal: at.blk,
      homeVal: ht.blk,
      awayDisplay: `${at.blk}`,
      homeDisplay: `${ht.blk}`,
      section: 'reb_playmaking_defense',
    });
    pushTeamRow({
      key: 'tov',
      label: 'Pérdidas de Balón (PER)',
      helpKey: 'tov',
      awayVal: at.tov,
      homeVal: ht.tov,
      awayDisplay: `${at.tov}`,
      homeDisplay: `${ht.tov}`,
      lowerIsBetter: true,
      suffix: ' menos',
      section: 'reb_playmaking_defense',
    });
    pushTeamRow({
      key: 'tovPct',
      label: '% Pérdidas (TOV%)',
      helpKey: 'tovPct',
      awayVal: awayLog.tovPct,
      homeVal: homeLog.tovPct,
      awayDisplay: `${awayLog.tovPct.toFixed(1)}%`,
      homeDisplay: `${homeLog.tovPct.toFixed(1)}%`,
      decimals: 1,
      lowerIsBetter: true,
      suffix: '%',
      section: 'reb_playmaking_defense',
    });
    const awayAstTov = at.tov > 0 ? round1(at.ast / at.tov) : at.ast;
    const homeAstTov = ht.tov > 0 ? round1(ht.ast / ht.tov) : ht.ast;
    pushTeamRow({
      key: 'astTov',
      label: 'Ratio Asist / Pérd',
      helpKey: 'astTo',
      awayVal: awayAstTov,
      homeVal: homeAstTov,
      awayDisplay: `${awayAstTov.toFixed(2)}`,
      homeDisplay: `${homeAstTov.toFixed(2)}`,
      decimals: 2,
      section: 'reb_playmaking_defense',
    });
    pushTeamRow({
      key: 'pf',
      label: 'Faltas Personales (FP)',
      helpKey: 'personalFouls',
      awayVal: at.fouls,
      homeVal: ht.fouls,
      awayDisplay: `${at.fouls}`,
      homeDisplay: `${ht.fouls}`,
      lowerIsBetter: true,
      suffix: ' menos',
      section: 'reb_playmaking_defense',
    });

    // Build Exact 17 ORDERED CARA A CARA LÍDERES INDIVIDUALES
    const awayPool = [...awaySide.starters, ...awaySide.bench];
    const homePool = [...homeSide.starters, ...homeSide.bench];
    const leaderComparisonRows: GameLeaderComparisonRow[] = [];

    const pickTopLeader = (
      pool: GameBoxScorePlayerLine[],
      getter: (p: GameBoxScorePlayerLine) => number,
      tieBreakMoreMinutes = false
    ): GameBoxScorePlayerLine | null => {
      if (pool.length === 0) return null;
      return [...pool].sort((a, b) => {
        const diff = getter(b) - getter(a);
        if (Math.abs(diff) > 0.01) return diff;
        if (tieBreakMoreMinutes) {
          return b.minutes - a.minutes || b.fga - a.fga;
        }
        if (b.gameScore !== a.gameScore) return b.gameScore - a.gameScore;
        return a.minutes - b.minutes;
      })[0];
    };

    // Secondary name-key index so personal season baselines always resolve even on fallback IDs
    const playerByNameKey = new Map<string, PlayerSummary>();
    for (const p of full.allPlayers) {
      playerByNameKey.set(normalizePlain(p.name), p);
    }

    const resolvePlayerBaselineLogs = (
      playerId: string,
      fullName: string
    ): { summary?: PlayerSummary; logs: PlayerGameLog[] } => {
      const summary =
        playerById.get(playerId) ||
        playerByNameKey.get(normalizePlain(fullName));
      if (!summary) return { logs: [] };
      const seasonLogs = summary.games.filter(
        (g) => g.seasonLabel === seasonLabel && g.minutes > 0
      );
      if (seasonLogs.length >= 2) {
        return { summary, logs: seasonLogs };
      }
      const allActiveLogs = summary.games.filter((g) => g.minutes > 0);
      return {
        summary,
        logs: allActiveLogs.length >= 2 ? allActiveLogs : [],
      };
    };

    const avgOf = (
      logs: PlayerGameLog[],
      fn: (g: PlayerGameLog) => number
    ): number | null => {
      if (logs.length === 0) return null;
      const sum = logs.reduce((acc, g) => acc + fn(g), 0);
      return round1(sum / logs.length);
    };

    const leaderDefs: Array<{
      key: string;
      label: string;
      groupLabel: string;
      helpKey: string;
      getter: (p: GameBoxScorePlayerLine) => number;
      formatStat: (p: GameBoxScorePlayerLine) => string;
      baselineGetter: (
        logs: PlayerGameLog[],
        summary?: PlayerSummary
      ) => number | null;
      deltaUnit?: string;
      surgeThreshold?: number;
      filter?: (p: GameBoxScorePlayerLine) => boolean;
      isElite?: (val: number, p: GameBoxScorePlayerLine) => boolean;
      lowerIsBetter?: boolean;
      decimals?: number;
      diffSuffix?: string;
    }> = [
      // I. Volumen Base y Tableros (1-5)
      {
        key: 'min',
        label: 'Minutos Jugados',
        groupLabel: 'I. Volumen Base y Tableros',
        helpKey: 'minBase',
        getter: (p) => p.minutes,
        formatStat: (p) => `${p.minutesFormatted}`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.minutes),
        deltaUnit: 'm',
        surgeThreshold: 3.0,
        isElite: (v) => v >= 38,
        decimals: 1,
        diffSuffix: 'm',
      },
      {
        key: 'pts',
        label: 'Puntos',
        groupLabel: 'I. Volumen Base y Tableros',
        helpKey: 'ptsBase',
        getter: (p) => p.points,
        formatStat: (p) => `${p.points} PTS`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.points),
        surgeThreshold: 3.0,
        isElite: (v) => v >= 30,
        diffSuffix: ' PTS',
      },
      {
        key: 'reb',
        label: 'Rebotes Totales',
        groupLabel: 'I. Volumen Base y Tableros',
        helpKey: 'rebBase',
        getter: (p) => p.rebounds,
        formatStat: (p) => `${p.rebounds} REB`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.rebounds),
        surgeThreshold: 2.0,
        isElite: (v) => v >= 13,
        diffSuffix: ' REB',
      },
      {
        key: 'ast',
        label: 'Asistencias',
        groupLabel: 'I. Volumen Base y Tableros',
        helpKey: 'astBase',
        getter: (p) => p.assists,
        formatStat: (p) => `${p.assists} AST`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.assists),
        surgeThreshold: 1.8,
        isElite: (v) => v >= 10,
        diffSuffix: ' AST',
      },
      {
        key: 'oreb',
        label: 'Rebotes Ofensivos',
        groupLabel: 'I. Volumen Base y Tableros',
        helpKey: 'orebBase',
        getter: (p) => p.oreb,
        formatStat: (p) => `${p.oreb} OREB`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.oreb),
        surgeThreshold: 1.2,
        isElite: (v) => v >= 5,
        diffSuffix: ' OR',
      },
      // II. Producción de Tiro y Eficiencia (6-9)
      {
        key: 'tc',
        label: 'Tiros de Campo Anotados',
        groupLabel: 'II. Producción de Tiro y Eficiencia',
        helpKey: 'fgmMade',
        getter: (p) => p.fgm,
        formatStat: (p) => `${p.fgm}/${p.fga} TC`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.fgm),
        surgeThreshold: 2.0,
        isElite: (v) => v >= 11,
        diffSuffix: ' TC',
      },
      {
        key: 'fg3m',
        label: 'Triples Anotados',
        groupLabel: 'II. Producción de Tiro y Eficiencia',
        helpKey: 'fg3m',
        getter: (p) => p.fg3m,
        formatStat: (p) => `${p.fg3m}/${p.fg3a} T3`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.fg3m),
        surgeThreshold: 1.2,
        isElite: (v) => v >= 5,
        diffSuffix: ' T3',
      },
      {
        key: 'tl',
        label: 'Tiros Libres Anotados',
        groupLabel: 'II. Producción de Tiro y Eficiencia',
        helpKey: 'ftmMade',
        getter: (p) => p.ftm,
        formatStat: (p) => `${p.ftm}/${p.fta} TL`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.ftm),
        surgeThreshold: 1.8,
        isElite: (v) => v >= 8,
        diffSuffix: ' TL',
      },
      {
        key: 'tsPct',
        label: 'Acierto Real (TS%)',
        groupLabel: 'II. Producción de Tiro y Eficiencia',
        helpKey: 'tsPct',
        filter: (p) => p.fga >= 6,
        getter: (p) => p.tsPct,
        formatStat: (p) => `${p.tsPct.toFixed(1)}%`,
        baselineGetter: (logs, summary) => {
          if (logs.length === 0) return summary?.advanced?.tsPct ?? null;
          const pts = logs.reduce((s, g) => s + g.points, 0);
          const fga = logs.reduce((s, g) => s + g.fga, 0);
          const fta = logs.reduce((s, g) => s + g.fta, 0);
          const denom = 2 * (fga + 0.44 * fta);
          return denom > 0 ? round1((pts / denom) * 100) : avgOf(logs, (g) => g.tsPct);
        },
        deltaUnit: '%',
        surgeThreshold: 4.5,
        isElite: (v, p) => p.fga >= 6 && v >= 70,
        decimals: 1,
        diffSuffix: '%',
      },
      // III. Control de Balón y Defensa (10-13)
      {
        key: 'tov',
        label: 'Pérdidas',
        groupLabel: 'III. Control de Balón y Defensa',
        helpKey: 'leaderTurnovers',
        getter: (p) => p.turnovers,
        formatStat: (p) => `${p.turnovers} PER`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.turnovers),
        surgeThreshold: 0.8,
        isElite: (v) => v <= 1,
        lowerIsBetter: true,
        diffSuffix: ' menos',
      },
      {
        key: 'astTo',
        label: 'Ratio Asistencias/Pérdidas',
        groupLabel: 'III. Control de Balón y Defensa',
        helpKey: 'astTo',
        filter: (p) => p.assists >= 4,
        getter: (p) => (p.turnovers > 0 ? round1(p.assists / p.turnovers) : p.assists),
        formatStat: (p) =>
          `${(p.turnovers > 0 ? round1(p.assists / p.turnovers) : p.assists).toFixed(1)} A/P`,
        baselineGetter: (logs) => {
          if (logs.length === 0) return null;
          const ast = logs.reduce((s, g) => s + g.assists, 0);
          const tov = logs.reduce((s, g) => s + g.turnovers, 0);
          return round1(ast / Math.max(1, tov));
        },
        surgeThreshold: 1.0,
        isElite: (v, p) => p.assists >= 5 && v >= 4.5,
        decimals: 1,
      },
      {
        key: 'stl',
        label: 'Robos de Balón',
        groupLabel: 'III. Control de Balón y Defensa',
        helpKey: 'steals',
        getter: (p) => p.steals,
        formatStat: (p) => `${p.steals} ROB`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.steals),
        surgeThreshold: 0.8,
        isElite: (v) => v >= 3,
        diffSuffix: ' ROB',
      },
      {
        key: 'blk',
        label: 'Tapones',
        groupLabel: 'III. Control de Balón y Defensa',
        helpKey: 'blocks',
        getter: (p) => p.blocks,
        formatStat: (p) => `${p.blocks} TAP`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.blocks),
        surgeThreshold: 0.8,
        isElite: (v) => v >= 3,
        diffSuffix: ' TAP',
      },
      // IV. Impacto Avanzado y Rotación (14-17)
      {
        key: 'pm',
        label: 'Impacto Más / Menos',
        groupLabel: 'IV. Impacto Avanzado y Rotación',
        helpKey: 'plusMinusBase',
        getter: (p) => p.plusMinus,
        formatStat: (p) => `${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.plusMinus),
        surgeThreshold: 4.0,
        isElite: (v) => v >= 15,
      },
      {
        key: 'gmSc',
        label: 'Valoración (GmSc)',
        groupLabel: 'IV. Impacto Avanzado y Rotación',
        helpKey: 'gmSc',
        getter: (p) => p.gameScore,
        formatStat: (p) => `${p.gameScore.toFixed(1)}`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.gameScore),
        surgeThreshold: 3.0,
        isElite: (v) => v >= 24,
        decimals: 1,
      },
      {
        key: 'usgEst',
        label: 'Uso Ofensivo Est. (USG%)',
        groupLabel: 'IV. Impacto Avanzado y Rotación',
        helpKey: 'usgPct',
        filter: (p) => p.minutes >= 12,
        getter: (p) => p.usgEst || 0,
        formatStat: (p) => `${(p.usgEst || 0).toFixed(1)}%`,
        baselineGetter: (logs, summary) => {
          if (seasonLabel === '2026-27' && summary?.advanced?.usgPct) {
            return round1(summary.advanced.usgPct);
          }
          return avgOf(logs, (g) => g.usgEst || 0);
        },
        deltaUnit: '%',
        surgeThreshold: 3.0,
        isElite: (v) => v >= 32,
        decimals: 1,
        diffSuffix: '%',
      },
      {
        key: 'sixthMan',
        label: 'Mejor Suplente (6º Hombre)',
        groupLabel: 'IV. Impacto Avanzado y Rotación',
        helpKey: 'sixthMan',
        filter: (p) => !p.isStarter,
        getter: (p) => p.gameScore,
        formatStat: (p) => `${p.points}P · ${p.gameScore.toFixed(1)} GmSc`,
        baselineGetter: (logs) => avgOf(logs, (g) => g.gameScore),
        surgeThreshold: 2.5,
        isElite: (v) => v >= 14,
        decimals: 1,
        diffSuffix: ' GmSc',
      },
    ];

    const buildLeaderDeltaMeta = (
      val: number,
      player: GameBoxScorePlayerLine,
      def: (typeof leaderDefs)[number]
    ): {
      avg?: number;
      deltaVsAvg?: number;
      deltaDisplay?: string;
      deltaTone?: 'positive' | 'negative' | 'neutral';
    } => {
      const { summary, logs } = resolvePlayerBaselineLogs(
        player.playerId,
        player.name
      );
      const avg = def.baselineGetter(logs, summary);
      if (avg === null || !Number.isFinite(avg)) return {};
      const rawDelta = round1(val - avg);
      const effectiveDelta = def.lowerIsBetter ? -rawDelta : rawDelta;
      const unit = def.deltaUnit || '';
      const threshold = def.surgeThreshold ?? 1.5;

      let deltaDisplay: string;
      if (Math.abs(rawDelta) < 0.05) {
        deltaDisplay = '= media';
      } else {
        const signed = rawDelta > 0 ? `+${rawDelta.toFixed(1)}` : rawDelta.toFixed(1);
        deltaDisplay = `${signed}${unit} vs media`;
      }

      const deltaTone: 'positive' | 'negative' | 'neutral' =
        effectiveDelta >= threshold
          ? 'positive'
          : effectiveDelta <= -threshold
          ? 'negative'
          : 'neutral';

      return {
        avg,
        deltaVsAvg: rawDelta,
        deltaDisplay,
        deltaTone,
      };
    };

    for (const def of leaderDefs) {
      const aFiltered = def.filter ? awayPool.filter(def.filter) : awayPool;
      const hFiltered = def.filter ? homePool.filter(def.filter) : homePool;
      const aL = pickTopLeader(
        aFiltered.length > 0 ? aFiltered : awayPool,
        def.getter,
        Boolean(def.lowerIsBetter)
      );
      const hL = pickTopLeader(
        hFiltered.length > 0 ? hFiltered : homePool,
        def.getter,
        Boolean(def.lowerIsBetter)
      );
      if (!aL || !hL) continue;
      const aVal = def.getter(aL);
      const hVal = def.getter(hL);
      const rawDiff = aVal - hVal;
      let betterSide: 'away' | 'home' | 'tie' = 'tie';
      if (Math.abs(rawDiff) >= 0.05) {
        if (def.lowerIsBetter) {
          betterSide = aVal < hVal ? 'away' : 'home';
        } else {
          betterSide = aVal > hVal ? 'away' : 'home';
        }
      }
      const dec = def.decimals ?? 0;
      const suf = def.diffSuffix ?? '';
      const absStr =
        dec === 0
          ? `${Math.round(Math.abs(rawDiff))}${suf}`
          : `${Math.abs(rawDiff).toFixed(dec)}${suf}`;
      const winAbbr =
        betterSide === 'away'
          ? awaySide.abbr
          : betterSide === 'home'
          ? homeSide.abbr
          : '';
      const diffDisplay =
        betterSide === 'tie' ? 'Igualado' : `+${absStr} ${winAbbr}`;

      const awayStatDisplay = def.formatStat(aL);
      const homeStatDisplay = def.formatStat(hL);
      const awayDeltaMeta = buildLeaderDeltaMeta(aVal, aL, def);
      const homeDeltaMeta = buildLeaderDeltaMeta(hVal, hL, def);

      leaderComparisonRows.push({
        categoryKey: def.key,
        categoryLabel: def.label,
        groupLabel: def.groupLabel,
        helpKey: def.helpKey,
        awayPlayerId: aL.playerId,
        awayJersey: aL.jersey,
        awayShortName: aL.shortName,
        awayPlayerName: aL.name,
        awayStatDisplay,
        awayFormatted: `#${aL.jersey} ${aL.shortName} (${awayStatDisplay}${
          awayDeltaMeta.deltaDisplay ? ` · ${awayDeltaMeta.deltaDisplay}` : ''
        })`,
        awayValue: aVal,
        awayAvg: awayDeltaMeta.avg,
        awayDeltaVsAvg: awayDeltaMeta.deltaVsAvg,
        awayDeltaDisplay: awayDeltaMeta.deltaDisplay,
        awayDeltaTone: awayDeltaMeta.deltaTone,
        awayIsElite: def.isElite ? def.isElite(aVal, aL) : false,
        homePlayerId: hL.playerId,
        homeJersey: hL.jersey,
        homeShortName: hL.shortName,
        homePlayerName: hL.name,
        homeStatDisplay,
        homeFormatted: `#${hL.jersey} ${hL.shortName} (${homeStatDisplay}${
          homeDeltaMeta.deltaDisplay ? ` · ${homeDeltaMeta.deltaDisplay}` : ''
        })`,
        homeValue: hVal,
        homeAvg: homeDeltaMeta.avg,
        homeDeltaVsAvg: homeDeltaMeta.deltaVsAvg,
        homeDeltaDisplay: homeDeltaMeta.deltaDisplay,
        homeDeltaTone: homeDeltaMeta.deltaTone,
        homeIsElite: def.isElite ? def.isElite(hVal, hL) : false,
        diffDisplay,
        lowerIsBetter: def.lowerIsBetter,
        betterSide,
      });
    }

    // Spanish Players Summary Line
    const hasSpanishPlayers = spanishDetails.length > 0;
    const spanishSummaryLine = hasSpanishPlayers
      ? spanishDetails.map((s) => s.lineSummary).join(' · ')
      : `Sin representación española en las plantillas de ${awaySide.shortName} ni ${homeSide.shortName} en este encuentro.`;

    const report: GameOfficialReportData = {
      eventId,
      date: gameDate,
      seasonLabel,
      pasoBTitle,
      arenaName,
      arenaCity,
      attendance,
      attendanceFormatted,
      durationMinutes,
      officials,
      isOvertime,
      overtimeCount,
      decisivePeriodLabel,
      leadChanges,
      timesTied,
      leagueAvgPace,
      paceDiffVsLeague,
      periods,
      away: awaySide,
      home: homeSide,
      spanishPlayersReport: {
        hasSpanishPlayers,
        summaryLine: spanishSummaryLine,
        details: spanishDetails,
      },
      milestonesList,
      teamComparisonRows,
      leaderComparisonRows,
    };

    const ttlMs = seasonLabel === '2026-27' ? 10 * 60 * 1000 : 120 * 60 * 1000;
    reportMemoryCache.set(cacheKey, {
      expiresAt: Date.now() + ttlMs,
      data: report,
    });

    return report;
  }

  async function buildGameOfficialReportData(
    eventId: string,
    forceRefresh = false
  ): Promise<GameOfficialReportData> {
    const cacheKey = `game_official_report_v6:${eventId}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as GameOfficialReportData;
      }
    }

    const inflightKey = `official_report_inflight:${eventId}`;
    const existing = reportInflight.get(inflightKey);
    const existingStart = reportInflightStartedAt.get(inflightKey) || 0;
    if (existing && (!forceRefresh || Date.now() - existingStart < 2500)) {
      return existing as Promise<GameOfficialReportData>;
    }

    const p = computeGameOfficialReportData(eventId, forceRefresh, cacheKey);
    reportInflight.set(inflightKey, p);
    reportInflightStartedAt.set(inflightKey, Date.now());
    try {
      return await p;
    } finally {
      if (reportInflight.get(inflightKey) === p) {
        reportInflight.delete(inflightKey);
        reportInflightStartedAt.delete(inflightKey);
      }
    }
  }

  /**
   * Deterministic Empirical Scouting Narrative Backup (when Gemini is unavailable)
   */
  function buildDeterministicGameNarrative(
    report: GameOfficialReportData
  ): GameNarrativePayload {
    const winner = report.away.isWinner ? report.away : report.home;
    const loser = report.away.isWinner ? report.home : report.away;
    const margin = Math.abs(winner.score - loser.score);
    const wt = winner.totals;
    const lt = loser.totals;
    const wStar = winner.podium[0];
    const wSecond = winner.podium[1];
    const lStar = loser.podium[0];

    const pressHeadline = wStar
      ? `${winner.shortName} impone su ley ante ${loser.shortName} (${report.away.score}-${report.home.score}) al ritmo de #${wStar.jersey} ${wStar.name}`
      : `${winner.name} resuelve el pulso ante ${loser.name} (${report.away.score}-${report.home.score}) en ${report.arenaName}`;

    const pressLead = `**${winner.name}** (${winner.recordAfter}) selló el triunfo ${
      report.away.isWinner ? 'a domicilio' : 'en su pista'
    } apoyado en un ${wt.efgPct.toFixed(1)}% de tiro efectivo y **el golpe táctico asestado en ${
      report.decisivePeriodLabel
    }**, dejando sin premio la resistencia de **${loser.name}** (${loser.recordAfter}).`;

    const paceSignStr =
      report.paceDiffVsLeague >= 0
        ? `+${report.paceDiffVsLeague.toFixed(1)}`
        : report.paceDiffVsLeague.toFixed(1);
    const quarterNarrative =
      report.periods.length >= 4
        ? `El guion por parciales (${report.periods
            .map((p) => `${p.label}: ${p.awayScore}-${p.homeScore}`)
            .join(', ')}) **encontró su punto de ruptura definitivo en ${
            report.decisivePeriodLabel
          }**${
            report.leadChanges !== null
              ? `, tras un intercambio táctico con ${report.leadChanges} cambios de mando y ${
                  report.timesTied ?? 0
                } empates`
              : ''
          }, disputándose a un ritmo de ${wt.pace.toFixed(
            1
          )} posesiones (${paceSignStr} frente a las ${report.leagueAvgPace.toFixed(
            1
          )} de media NBA esta temporada).`
        : `El encuentro entre **${report.away.shortName}** y **${report.home.shortName}** se definió por una renta final de ${margin} tantos (${report.away.score}-${report.home.score}), **imponiendo el control del ritmo competitivo** con ${wt.pace.toFixed(
            1
          )} posesiones (${paceSignStr} respecto a las ${report.leagueAvgPace.toFixed(
            1
          )} de promedio NBA).`;

    const runAndClutchProse =
      wt.biggestLead !== null && wt.biggestRun !== null
        ? `**${winner.shortName}** llegó a estirar su ventaja máxima hasta los +${wt.biggestLead} puntos gracias a una racha de ${wt.biggestRun}-0 que **desarmó el balance defensivo rival**, sabiendo administrar las posesiones finales ante **${loser.shortName}** sin conceder segundas vidas.`
        : `En el tramo decisivo, **la gestión quirúrgica del tempo ofensivo** (${wt.offRtg.toFixed(
            1
          )} de eficiencia ofensiva frente a ${lt.offRtg.toFixed(
            1
          )}) permitió a **${winner.shortName}** blindar el electrónico frente a **${loser.shortName}**.`;

    const paintAndThreeBattle =
      wt.ptsPaint !== null && lt.ptsPaint !== null
        ? `En la pizarra de espacios, **${winner.name}** **dominó la selección de tiro interior y exterior** con un ${wt.efgPct.toFixed(
            1
          )}% en tiro efectivo (${wt.fg3m}/${wt.fg3a} en triples) y ${
            wt.ptsPaint
          } puntos en la pintura frente a los ${lt.ptsPaint} de **${
            loser.shortName
          }**, mientras que en el rebote el pulso cerró ${wt.reb}-${
            lt.reb
          } (${wt.oreb} capturas ofensivas del ganador por ${lt.oreb} del rival).`
        : `En el pulso de los Cuatro Factores, **${
            winner.name
          }** **marcó diferencias desde la eficiencia real de tiro** con un ${wt.efgPct.toFixed(
            1
          )}% de acierto efectivo (${wt.fg3m}/${
            wt.fg3a
          } desde el perímetro) frente al ${lt.efgPct.toFixed(1)}% de **${
            loser.name
          }**, acompañando el acierto con un balance reboteador de ${wt.reb}-${lt.reb}.`;

    const isNonTechnicalAbsence = (a: GameInactiveOrDnpItem) =>
      a.statusType !== 'coach_decision' && a.statusType !== 'gleague';
    const awayMedAbs = report.away.absencesAndDnp.filter(isNonTechnicalAbsence);
    const homeMedAbs = report.home.absencesAndDnp.filter(isNonTechnicalAbsence);
    const benchAndAbsences = `La rotación de segunda unidad aportó ${
      wt.benchPoints
    } puntos en **${winner.shortName}** por ${lt.benchPoints} del banquillo de **${
      loser.shortName
    }**${
      wt.ptsFastBreak !== null && lt.ptsFastBreak !== null
        ? `, **castigando cada pérdida a campo abierto** con un parcial de ${wt.ptsFastBreak}-${lt.ptsFastBreak} al contraataque y ${
            wt.ptsOffTov ?? 0
          } tantos tras las ${lt.tov} pérdidas rivales`
        : `, **penalizando los errores en el manejo** tras las ${lt.tov} pérdidas de **${loser.shortName}**`
    }.${
      awayMedAbs.length > 0 || homeMedAbs.length > 0
        ? ` Las rotaciones estuvieron condicionadas por el parte oficial de bajas e incidencias: ${[
            ...awayMedAbs.map(
              (a) => `**${a.name}** (${report.away.abbr} · ${a.statusLabel || 'Baja'}: ${a.note})`
            ),
            ...homeMedAbs.map(
              (a) => `**${a.name}** (${report.home.abbr} · ${a.statusLabel || 'Baja'}: ${a.note})`
            ),
          ]
            .slice(0, 4)
            .join('; ')}.`
        : ''
    }`;

    let dynamicSpotlight: { title: string; body: string } | null = null;
    if (report.isOvertime) {
      dynamicSpotlight = {
        title: 'Tiempo extra bajo máxima presión',
        body: `El choque exigió ${
          report.overtimeCount > 1
            ? `${report.overtimeCount} prórrogas`
            : 'cinco minutos suplementarios'
        } tras agotarse el tiempo reglamentario en máxima igualdad, poniendo a prueba las piernas de los titulares y **premiando la ejecución en media pista** de **${winner.shortName}** frente a **${loser.shortName}**.`,
      };
    } else if (Math.abs(wt.benchPoints - lt.benchPoints) >= 16) {
      const benchWinner =
        wt.benchPoints > lt.benchPoints ? winner.shortName : loser.shortName;
      dynamicSpotlight = {
        title: `Desequilibrio en los tramos de segunda unidad`,
        body: `La brecha de banquillos (${wt.benchPoints}-${lt.benchPoints} en puntos de suplentes) **alteró los minutos de descanso titular**, dando aire constante a la rotación de **${benchWinner}**.`,
      };
    }

    const xFactorSection =
      wStar && lStar
        ? `El timón ofensivo perteneció a **#${wStar.jersey} ${wStar.name}** (${wStar.points} puntos, ${wStar.rebounds} rebotes, ${wStar.assists} asistencias, GmSc ${wStar.gameScore.toFixed(
            1
          )}), **generando ventajas constantes sobre la primera ayuda** de **${
            loser.shortName
          }**.\n\nComo Factor X emergió ${
            wSecond
              ? `**#${wSecond.jersey} ${wSecond.name}** (${wSecond.points} puntos, ${wSecond.rebounds} rebotes y ${wSecond.assists} asistencias, ${
                  wSecond.plusMinus >= 0
                    ? `+${wSecond.plusMinus}`
                    : wSecond.plusMinus
                } en pista)`
              : `el bloque exterior de **${winner.shortName}**`
          }, **dando continuidad ofensiva a cada tramo sin balón**, mientras que en **${
            loser.name
          }** la producción de **#${lStar.jersey} ${lStar.name}** (${lStar.points} puntos, ${lStar.rebounds} rebotes, ${lStar.assists} asistencias) sostuvo la pelea hasta el desenlace.`
        : `**El reparto coral en ataque estático** de **${winner.name}** inclinó la balanza en las posesiones calientes del último cuarto ante **${loser.name}**.`;

    const ddProse =
      report.milestonesList.length > 0
        ? `La hoja estadística dejó actuaciones de dobles figuras múltiples con ${report.milestonesList
            .map((m) =>
              m.type === 'TD'
                ? `el triple-doble de **${m.detail.replace(/\s*\(.*$/, '')}** (${m.detail.match(/\((.*)\)/)?.[1] || m.detail})`
                : `el doble-doble de **${m.detail.replace(/\s*\(.*$/, '')}** (${m.detail.match(/\((.*)\)/)?.[1] || m.detail})`
            )
            .join(', ')}. `
        : '';

    const verdictSection = `${ddProse}En la lectura global de scouting, **${
      winner.name
    }** (${winner.recordAfter}) **refuerza su solidez competitiva en media pista** firmando ${wt.offRtg.toFixed(
      1
    )} puntos por cada 100 posesiones, mientras que **${loser.name}** (${
      loser.recordAfter
    }) deberá corregir el cierre del rebote y el cuidado del balón (${lt.tov} pérdidas) para su siguiente cita.`;

    return {
      eventId: report.eventId,
      generatedAt: new Date().toISOString(),
      engineMode: 'empirical_fallback',
      pressHeadline,
      pressLead,
      gameFlowSection: `${quarterNarrative}\n\n${runAndClutchProse}`,
      chalkboardSection: `${paintAndThreeBattle}\n\n${benchAndAbsences}`,
      dynamicSpotlight,
      xFactorSection,
      spanishSection: report.spanishPlayersReport.summaryLine,
      verdictSection,
      sources: [],
    };
  }

  /**
   * 2. GEMINI + GOOGLE SEARCH JOURNALISTIC & SCOUTING MATCH NARRATIVE (Editorial + Paso B)
   */
  async function buildGameNarrativePayload(
    eventId: string,
    forceRefresh = false
  ): Promise<GameNarrativePayload> {
    const cacheKey = `game_narrative_v8:${eventId}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as GameNarrativePayload;
      }
    }

    const existing = reportInflight.get(cacheKey);
    if (existing) {
      return existing as Promise<GameNarrativePayload>;
    }

    const promise = (async (): Promise<GameNarrativePayload> => {
      const report = await buildGameOfficialReportData(eventId, forceRefresh);
      const pressCtx = await fetchLivePressContext(report.date, forceRefresh);

      if (!getGeminiClient()) {
        return buildDeterministicGameNarrative(report);
      }

      const matchPress = pressCtx.byMatchup.get(
        `${report.away.abbr}@${report.home.abbr}`
      );
      const seedSources: GroundingSourceLink[] = [
        {
          uri: `https://www.nba.com/game/${report.away.abbr.toLowerCase()}-vs-${report.home.abbr.toLowerCase()}-${report.eventId}/box-score`,
          title: `NBA.com Acta Oficial — ${report.away.abbr} vs ${report.home.abbr}`,
        },
        {
          uri: `https://www.nba.com/game/${report.away.abbr.toLowerCase()}-vs-${report.home.abbr.toLowerCase()}-${report.eventId}/play-by-play`,
          title: `NBA.com Play-by-Play — ${report.away.abbr} vs ${report.home.abbr}`,
        },
        ...(matchPress?.sources || []),
      ];

      const formatPlayerDossier = (p: GameBoxScorePlayerLine) =>
        `#${p.jersey} ${p.name} (${p.position}, ${
          p.isStarter ? 'Titular' : 'Suplente'
        }): ${p.points} PTS, ${p.rebounds} REB (${p.oreb} OR), ${
          p.assists
        } AST, ${p.steals} ROB, ${p.blocks} TAP, ${p.turnovers} PER, ${
          p.fgm
        }/${p.fga} TC, ${p.fg3m}/${p.fg3a} T3, ${p.ftm}/${p.fta} TL, ${
          p.minutesFormatted
        } MIN, +/- ${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}, GmSc ${p.gameScore.toFixed(
          1
        )}${p.tripleDouble ? ' [TRIPLE-DOBLE]' : p.doubleDouble ? ' [DOBLE-DOBLE]' : ''}`;

      const verifiedGamePlayers = [
        ...report.away.starters.map((p) => p.name),
        ...report.away.bench.map((p) => p.name),
        ...report.away.absencesAndDnp.map((p) => p.name),
        ...report.home.starters.map((p) => p.name),
        ...report.home.bench.map((p) => p.name),
        ...report.home.absencesAndDnp.map((p) => p.name),
      ];

      const dossier = [
        `AVISO CRÍTICO DE MUNDO CERRADO: Fecha real del encuentro ${report.date} (Temporada ${report.seasonLabel}). Tu memoria interna de entrenamiento está desactualizada varios años respecto a entrenadores actuales, traspasos, contratos y palmarés. NO des NINGÚN dato por supuesto fuera de los hechos explícitos de este dossier.`,
        `PARTIDO OFICIAL NBA (${report.date} · Temporada ${report.seasonLabel}):`,
        `TÍTULO: ${report.pasoBTitle}`,
        `PARCIALES POR CUARTOS: ${
          report.periods.length > 0
            ? report.periods
                .map((p) => `${p.label} (${report.away.abbr} ${p.awayScore} - ${p.homeScore} ${report.home.abbr})`)
                .join(' | ')
            : 'Sin desglose parcial'
        } · Tramo clave: ${report.decisivePeriodLabel}`,
        `FLUJO DE MARCADOR: Cambios de líder=${
          report.leadChanges ?? 'No consta'
        }, Empates=${report.timesTied ?? 'No consta'}, Máxima ventaja ${
          report.away.abbr
        }=+${report.away.totals.biggestLead ?? 0} (mejor parcial ${
          report.away.totals.biggestRun ?? 0
        }-0), Máxima ventaja ${report.home.abbr}=+${
          report.home.totals.biggestLead ?? 0
        } (mejor parcial ${report.home.totals.biggestRun ?? 0}-0).`,
        `RITMO DEL ENCUENTRO (PACE VS MEDIA NBA): ${report.away.totals.pace.toFixed(
          1
        )} posesiones/48m (${
          report.paceDiffVsLeague >= 0
            ? `+${report.paceDiffVsLeague.toFixed(1)}`
            : report.paceDiffVsLeague.toFixed(1)
        } frente al promedio oficial NBA ${report.seasonLabel} de ${report.leagueAvgPace.toFixed(
          1
        )} posesiones).`,
        matchPress && matchPress.notes.length > 0
          ? `TELETIPO DE PRENSA DE ESTE PARTIDO (${report.date}): ${matchPress.notes.join(' | ')}`
          : '',
        ``,
        `ESTADÍSTICAS COLECTIVAS:`,
        `- VISITANTE ${report.away.name} (${report.away.abbr}, récord ${
          report.away.recordAfter
        }${report.away.isBackToBack ? ', en Back-to-Back' : ''}): ${
          report.away.score
        } PTS | ${report.away.totals.fgm}/${report.away.totals.fga} TC (${
          report.away.totals.fgPct
        }%) | ${report.away.totals.fg3m}/${report.away.totals.fg3a} T3 (${
          report.away.totals.fg3Pct
        }%) | ${report.away.totals.ftm}/${report.away.totals.fta} TL | ${
          report.away.totals.reb
        } REB (${report.away.totals.oreb} OR) | ${report.away.totals.ast} AST | ${
          report.away.totals.stl
        } ROB | ${report.away.totals.blk} TAP | ${report.away.totals.tov} PER | OffRtg ${
          report.away.totals.offRtg
        } | eFG% ${report.away.totals.efgPct}% | Pintura: ${
          report.away.totals.ptsPaint ?? 's/d'
        } | Contraataque: ${
          report.away.totals.ptsFastBreak ?? 's/d'
        } | Tras pérdida: ${
          report.away.totals.ptsOffTov ?? 's/d'
        } | 2ª jugada: ${
          report.away.totals.ptsSecondChance ?? 's/d'
        } | Banquillo: ${report.away.totals.benchPoints} PTS.`,
        `- LOCAL ${report.home.name} (${report.home.abbr}, récord ${
          report.home.recordAfter
        }${report.home.isBackToBack ? ', en Back-to-Back' : ''}): ${
          report.home.score
        } PTS | ${report.home.totals.fgm}/${report.home.totals.fga} TC (${
          report.home.totals.fgPct
        }%) | ${report.home.totals.fg3m}/${report.home.totals.fg3a} T3 (${
          report.home.totals.fg3Pct
        }%) | ${report.home.totals.ftm}/${report.home.totals.fta} TL | ${
          report.home.totals.reb
        } REB (${report.home.totals.oreb} OR) | ${report.home.totals.ast} AST | ${
          report.home.totals.stl
        } ROB | ${report.home.totals.blk} TAP | ${report.home.totals.tov} PER | OffRtg ${
          report.home.totals.offRtg
        } | eFG% ${report.home.totals.efgPct}% | Pintura: ${
          report.home.totals.ptsPaint ?? 's/d'
        } | Contraataque: ${
          report.home.totals.ptsFastBreak ?? 's/d'
        } | Tras pérdida: ${
          report.home.totals.ptsOffTov ?? 's/d'
        } | 2ª jugada: ${
          report.home.totals.ptsSecondChance ?? 's/d'
        } | Banquillo: ${report.home.totals.benchPoints} PTS.`,
        ``,
        `PLANTILLA ${report.away.abbr} EN PISTA:`,
        ...[...report.away.starters, ...report.away.bench].map(formatPlayerDossier),
        `BAJAS MÉDICAS / LESIONADOS E INCIDENCIAS EN PISTA ${report.away.abbr}: ${
          report.away.absencesAndDnp.filter(
            (a) => a.statusType !== 'coach_decision' && a.statusType !== 'gleague'
          ).length > 0
            ? report.away.absencesAndDnp
                .filter(
                  (a) => a.statusType !== 'coach_decision' && a.statusType !== 'gleague'
                )
                .map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || 'Lesionado'} — ${a.note}]`)
                .join('; ')
            : 'Ninguna baja médica ni incidencia registrada'
        }`,
        `SIN MINUTOS POR DECISIÓN TÉCNICA / G-LEAGUE ${report.away.abbr}: ${
          report.away.absencesAndDnp.filter(
            (a) => a.statusType === 'coach_decision' || a.statusType === 'gleague'
          ).length > 0
            ? report.away.absencesAndDnp
                .filter(
                  (a) => a.statusType === 'coach_decision' || a.statusType === 'gleague'
                )
                .map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || 'Decisión técnica'} — ${a.note}]`)
                .join('; ')
            : 'Ninguno'
        }`,
        ``,
        `PLANTILLA ${report.home.abbr} EN PISTA:`,
        ...[...report.home.starters, ...report.home.bench].map(formatPlayerDossier),
        `BAJAS MÉDICAS / LESIONADOS E INCIDENCIAS EN PISTA ${report.home.abbr}: ${
          report.home.absencesAndDnp.filter(
            (a) => a.statusType !== 'coach_decision' && a.statusType !== 'gleague'
          ).length > 0
            ? report.home.absencesAndDnp
                .filter(
                  (a) => a.statusType !== 'coach_decision' && a.statusType !== 'gleague'
                )
                .map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || 'Lesionado'} — ${a.note}]`)
                .join('; ')
            : 'Ninguna baja médica ni incidencia registrada'
        }`,
        `SIN MINUTOS POR DECISIÓN TÉCNICA / G-LEAGUE ${report.home.abbr}: ${
          report.home.absencesAndDnp.filter(
            (a) => a.statusType === 'coach_decision' || a.statusType === 'gleague'
          ).length > 0
            ? report.home.absencesAndDnp
                .filter(
                  (a) => a.statusType === 'coach_decision' || a.statusType === 'gleague'
                )
                .map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || 'Decisión técnica'} — ${a.note}]`)
                .join('; ')
            : 'Ninguno'
        }`,
        ``,
        `DETECTOR OFICIAL DE JUGADORES ESPAÑOLES: ${report.spanishPlayersReport.summaryLine}`,
        `DOBLES-DOBLES Y TRIPLES-DOBLES VERIFICADOS: ${
          report.milestonesList.length > 0
            ? report.milestonesList.map((m) => `${m.type}: ${m.detail}`).join(' | ')
            : 'Ninguno en este encuentro'
        }`,
        `PODIO CALCULADO: ${report.away.abbr} (${report.away.podium
          .map((p) => `${'⭐'.repeat(p.stars)} #${p.jersey} ${p.name}`)
          .join(' | ')}) // ${report.home.abbr} (${report.home.podium
          .map((p) => `${'⭐'.repeat(p.stars)} #${p.jersey} ${p.name}`)
          .join(' | ')})`,
      ]
        .filter(Boolean)
        .join('\n');

      const systemInstruction = [
        'Eres un periodista sénior de prensa deportiva española y scout táctico profesional de la NBA (estilo The Athletic, Gigantes del Basket y NBAManiacs).',
        'REGLAS INQUEBRANTABLES DE RIGOR Y MUNDO CERRADO (CERO DATOS POR SUPUESTOS):',
        '1. RIGOR EMPÍRICO ABSOLUTO: Usa EXCLUSIVAMENTE las cifras estadísticas exactas, el pabellón oficial indicado en TÍTULO y la información explícita del dossier adjunto. Jamás inventes puntos, rebotes, parciales, jugadas concretas segundo a segundo (ej. "triple desde la esquina a falta de 2 segundos") ni dorsales que no figuren en el acta.',
        '2. PROHIBICIÓN TOTAL DE DAR DATOS POR SUPUESTOS O USAR MEMORIA PREENTRENADA: Tu conocimiento interno previo está desactualizado respecto a la temporada actual. Tienes TERMINANTEMENTE PROHIBIDO dar por supuesto o mencionar: (a) nombres propios o apodos de entrenadores, asistentes o directivos (ej. Tom Thibodeau dejó los NY Knicks hace años; NUNCA cites nombres de entrenadores, usa SIEMPRE "el cuerpo técnico de [Equipo]", "la dirección técnica de [Equipo]" o "la pizarra de [Equipo]"); (b) antigüedad, edad, rondas de Draft, condición de rookie, contratos, exequipos o traspasos de jugadores; (c) premios pasados, anillos, "vigente campeón" o series de temporadas anteriores; (d) puestos exactos en la tabla clasificatoria (ej. "3º del Este") o próximos rivales del calendario; (e) diagnósticos médicos o plazos de recuperación más allá de la nota literal del dossier.',
        '3. PULCRITUD EN BAJAS (LESIÓN VS DECISIÓN TÉCNICA) Y RITMO: Al mencionar ausencias o jugadores sin minutos en PIZARRA_Y_ROTACION o ESPANOLES, sé escrupulosamente pulcro distinguiendo entre quienes causaron baja por lesión / parte médico (bloque BAJAS MÉDICAS / LESIONADOS) y quienes no participaron por decisión técnica o asignación a G-League (bloque SIN MINUTOS POR DECISIÓN TÉCNICA). Jamás llames "lesionado" a un descarte por decisión técnica ni viceversa. Integra también el Pace frente a la media oficial NBA y, si hubo expulsados por 6 faltas, cita cuarto y reloj exactos.',
        '4. REDACCIÓN 100% NATURAL Y HUMANA: Escribe en español de España fluido, con vocabulario táctico auténtico (espaciado, pintura, bloqueo directo, ajuste tras descanso, transición defensiva, segunda unidad, rebote ofensivo, clutch).',
        '5. CERO CLICHÉS NI RELLENO: Prohibido usar "En conclusión", "Cabe destacar", "Sin lugar a dudas", "Sin duda" o metatexto. Redacta párrafos cohesivos, sin listas de viñetas ni tablas Markdown.',
        '6. JERARQUÍA VISUAL Y ÉNFASIS EN NEGRITA (**...**): En todos los párrafos del cuerpo (ENTRADILLA, GUION_Y_QUIEBRE, PIZARRA_Y_ROTACION, cuerpo de FOCO_ESPECIAL, FACTOR_X_Y_LIDERES, ESPANOLES y VEREDICTO_E_HITOS), utiliza negrita Markdown (**texto**) EXCLUSIVAMENTE para estos tres elementos: (a) nombres de jugadores (incluyendo su dorsal cuando lo cites, ej. **#15 Nikola Jokić**), (b) nombres o apodos oficiales de equipos/franquicias (ej. **Boston Celtics**, **Knicks**), y (c) UNA sola idea táctica clave por párrafo (una frase corta de 4 a 10 palabras que resuma la clave del juego, ej. **colapsando la pintura tras cada bloqueo directo**). PROHIBIDO poner en negrita cifras o estadísticas sueltas (como "49 puntos", "12 rebotes" o "58.4%"): intégralas en texto normal sin formato especial. PROHIBIDO usar ** en TITULAR_PRENSA ni en el título corto previo a || en FOCO_ESPECIAL.',
        '7. ESTRUCTURA EXACTA DE SALIDA CON ESTAS 8 ETIQUETAS EN MAYÚSCULAS:',
        '===TITULAR_PRENSA===',
        '(Titular periodístico vibrante y directo de 1 línea sobre el partido, sin almohadillas # ni asteriscos **).',
        '===ENTRADILLA===',
        '(Entradilla destacada de 2 líneas sintetizando la tesis táctica y el protagonista del encuentro, aplicando la regla de negritas).',
        '===GUION_Y_QUIEBRE===',
        '(2 párrafos fluidos: evolución del partido por cuartos, ritmo comparado con la media NBA, alternancias, rachas anotadoras y el momento exacto donde se rompió o decidió el choque).',
        '===PIZARRA_Y_ROTACION===',
        '(2 párrafos de scouting profundo: ajustes tácticos colectivos, batallas en pintura/triple/rebote, impacto real diferenciando con pulcritud bajas por lesión frente a ausencias por decisión técnica o expulsiones por faltas con su cuarto/reloj, rendimiento de la segunda unidad y puntos tras pérdida/contraataque).',
        '===FOCO_ESPECIAL===',
        '(Si el partido tuvo un ángulo singular —prórroga, remontada grande, exhibición histórica, cortocircuito en el clutch, clínica defensiva—, escribe en una línea el título corto sin ** seguido de || y 1 párrafo analítico con la regla de negritas: ej. "Supervivencia en la prórroga || Texto...". Si fue un guion convencional sin ángulo extra, escribe únicamente: NINGUNO).',
        '===FACTOR_X_Y_LIDERES===',
        '(2 párrafos analizando el duelo de estrellas y quién emergió como Factor X inesperado para inclinar la balanza, citando siempre dorsales # y cifras reales).',
        '===ESPANOLES===',
        '(Si hay españoles en el detector oficial, analiza en 1 párrafo su impacto o situación en convocatoria; si NO los hay, escribe UNA SOLA FRASE breve, limpia y directa confirmándolo).',
        '===VEREDICTO_E_HITOS===',
        '(2 párrafos integrando con total naturalidad los dobles-dobles o triples-dobles verificados y cerrando con el veredicto estrictamente táctico del scout sobre qué deja este choque a ambos equipos).',
      ].join('\n');

      try {
        const { text: rawText, sources } = await generateWithGeminiCascade({
          systemInstruction,
          contents: dossier,
          seedSources,
        });

        const safeRawText = sanitizeUnverifiedCoachClaims(
          rawText,
          verifiedGamePlayers
        );

        const parsed = parseDelimitedSections(safeRawText, [
          'TITULAR_PRENSA',
          'ENTRADILLA',
          'GUION_Y_QUIEBRE',
          'PIZARRA_Y_ROTACION',
          'FOCO_ESPECIAL',
          'FACTOR_X_Y_LIDERES',
          'ESPANOLES',
          'VEREDICTO_E_HITOS',
        ]);

        const fallback = buildDeterministicGameNarrative(report);

        const payload: GameNarrativePayload = {
          eventId: report.eventId,
          generatedAt: new Date().toISOString(),
          engineMode: 'gemini_search',
          pressHeadline:
            parsed.TITULAR_PRENSA && parsed.TITULAR_PRENSA.length > 12
              ? stripInlineWrapper(parsed.TITULAR_PRENSA)
              : fallback.pressHeadline,
          pressLead:
            parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25
              ? parsed.ENTRADILLA
              : fallback.pressLead,
          gameFlowSection:
            parsed.GUION_Y_QUIEBRE && parsed.GUION_Y_QUIEBRE.length > 60
              ? parsed.GUION_Y_QUIEBRE
              : fallback.gameFlowSection,
          chalkboardSection:
            parsed.PIZARRA_Y_ROTACION && parsed.PIZARRA_Y_ROTACION.length > 60
              ? parsed.PIZARRA_Y_ROTACION
              : fallback.chalkboardSection,
          dynamicSpotlight: parseSpotlight(
            parsed.FOCO_ESPECIAL,
            fallback.dynamicSpotlight
          ),
          xFactorSection:
            parsed.FACTOR_X_Y_LIDERES && parsed.FACTOR_X_Y_LIDERES.length > 50
              ? parsed.FACTOR_X_Y_LIDERES
              : fallback.xFactorSection,
          spanishSection:
            parsed.ESPANOLES && parsed.ESPANOLES.length > 12
              ? parsed.ESPANOLES
              : fallback.spanishSection,
          verdictSection:
            parsed.VEREDICTO_E_HITOS && parsed.VEREDICTO_E_HITOS.length > 45
              ? parsed.VEREDICTO_E_HITOS
              : fallback.verdictSection,
          sources,
        };

        reportMemoryCache.set(cacheKey, {
          expiresAt: Date.now() + 6 * 60 * 60 * 1000,
          data: payload,
        });
        return payload;
      } catch (err: any) {
        console.info(
          `[RadarNBA] Activado motor determinista de crónica para ${eventId} (${
            err?.status || err?.code || 'timeout/offline'
          })`
        );
        const fallback = buildDeterministicGameNarrative(report);
        reportMemoryCache.set(cacheKey, {
          expiresAt: Date.now() + 10 * 60 * 1000,
          data: fallback,
        });
        return fallback;
      }
    })();

    reportInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      reportInflight.delete(cacheKey);
    }
  }

  /**
   * Deterministic Daily Global Chronicle Backup (Hybrid Dynamic + Fixed Sections)
   */
  function buildDeterministicDailyChronicle(
    gd: GameDayPayload,
    spanishNightNotes: string[]
  ): GameDayChroniclePayload {
    const mvp = gd.mvpOfTheNight;
    const stmt = gd.statementTeamWin;
    const topExp = gd.topExplosion;
    const ptsDiff = gd.pulse.avgTotalPoints - gd.pulse.leagueAvgTotalPoints;
    const brokenList = gd.streakShifts.filter((s) => s.status === 'broken');
    const extendedList = gd.streakShifts.filter((s) => s.status === 'extended');

    const headline = mvp
      ? `${mvp.playerName} gobierna una madrugada de ${gd.pulse.gamesCount} partidos marcada por ${
          gd.pulse.closeGamesCount >= 3
            ? `${gd.pulse.closeGamesCount} desenlaces al límite`
            : stmt
            ? `la exhibición colectiva de ${stmt.teamName}`
            : 'el pulso táctico en ambas conferencias'
        }`
      : `Radiografía táctica y lectura de scouting de los ${gd.pulse.gamesCount} encuentros de la jornada NBA`;

    const lead = `La jornada dejó ${gd.pulse.gamesCount} encuentros con una media combinada de ${gd.pulse.avgTotalPoints.toFixed(
      1
    )} puntos (${ptsDiff >= 0 ? `+${ptsDiff.toFixed(1)}` : ptsDiff.toFixed(1)} frente al promedio de la liga), **${
      gd.pulse.roadWinsCount
    } triunfos visitantes marcando el pulso competitivo** y un ritmo medio de ${gd.pulse.avgPace.toFixed(
      1
    )} posesiones.`;

    const openingTheme = mvp
      ? `La madrugada dejó una demostración colosal de impacto individual y lectura táctica, con **${mvp.playerName}** ejerciendo como faro ofensivo de la jornada en una cartelera marcada por el pulso en la media pista y la dureza en las ayudas defensivas.`
      : `La jornada dejó un pulso colectivo de enorme exigencia táctica, con los bloques exteriores marcando las diferencias en los tramos calientes de los encuentros.`;

    const dynamicSections: ChronicleDynamicSection[] = [
      {
        kicker: 'Tema de Apertura',
        title:
          gd.pulse.closeGamesCount >= 3
            ? `Noche de nervios de acero con ${gd.pulse.closeGamesCount} cierres en el clutch`
            : mvp
            ? `Exhibición de jerarquía y gobierno del ritmo por ${mvp.playerName}`
            : 'Pulso competitivo y reparto de golpes en la cartelera',
        body: `${openingTheme}\n\nDe los ${gd.pulse.gamesCount} duelos disputados, ${
          gd.pulse.closeGamesCount
        } se resolvieron en un pañuelo de cinco o menos puntos, **exigiendo máxima precisión en media pista** durante los últimos minutos, mientras que ${
          gd.pulse.blowoutsCount
        } encuentros quedaron rotos por rentas superiores a los quince tantos en favor de los equipos más sólidos en la transición defensiva.`,
      },
    ];

    const pizarrasSection = [
      `El termómetro táctico de la madrugada mostró ${
        ptsDiff >= 3
          ? '**ataques lanzados a campo abierto y triple temprano**, castigando de forma constante las transiciones defensivas'
          : ptsDiff <= -3
          ? '**defensas cerradas protegiendo la pintura y el rebote**, forzando posesiones largas en cinco contra cinco'
          : '**equilibrio entre transición rápida y lectura en bloqueo directo**'
      }. Los visitantes rascaron ${gd.pulse.roadWinsCount} victorias lejos de casa en una noche de ${gd.pulse.avgPace.toFixed(
        1
      )} posesiones de media.`,
      stmt
        ? `La pizarra más dominante llevó el sello de **${
            stmt.teamName
          }**, vencedor ${stmt.isHome ? 'en casa frente a' : 'en la pista de'} **${
            stmt.opponentAbbr
          }** (${stmt.scoreDisplay}) **imponiendo una autoridad colectiva incontestable** con un diferencial neto de +${stmt.netRtg.toFixed(
            1
          )} puntos por cada 100 posesiones y un ${stmt.efgPct.toFixed(
            1
          )}% en tiro efectivo.`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const hitosSection = [
      topExp
        ? `En el radar de anomalías estadísticas sobresalió **${
            topExp.playerName
          }** (${topExp.teamAbbr}), **rompiendo por completo su techo habitual de anotación** hasta los ${
            topExp.points
          } puntos (+${topExp.ptsDelta.toFixed(
            1
          )} respecto a su media de ${topExp.ptsAvg.toFixed(1)}) gracias a ${topExp.driverTag.toLowerCase()}.`
        : '',
      gd.roleShifts.length > 0
        ? `En clave de rotaciones, **ganaron peso específico dentro de sus segundas unidades** ${gd.roleShifts
            .slice(0, 3)
            .map(
              (r) =>
                `**${r.playerName}** (${r.teamAbbr}, ${r.minutes.toFixed(
                  0
                )} minutos y ${r.points} puntos)`
            )
            .join(', ')}.`
        : '',
      brokenList.length > 0 || extendedList.length > 0
        ? `Respecto a las series consecutivas, ${
            extendedList.length > 0
              ? `**${extendedList[0].playerName}** **sostuvo su regularidad competitiva** estirando a ${extendedList[0].streakCount} partidos su racha en ${extendedList[0].thresholdLabel}`
              : '**varias referencias ofensivas sostuvieron su regularidad**'
          }${
            brokenList.length > 0
              ? `, al tiempo que se cortó la secuencia de ${brokenList[0].streakCount} encuentros de **${brokenList[0].playerName}** (${brokenList[0].thresholdLabel})`
              : ''
          }.`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const espanolesSection =
      spanishNightNotes.length > 0
        ? `La representación española **dejó presencia verificada en acta durante la madrugada**: ${spanishNightNotes.join(
            '; '
          )}.`
        : 'Ningún jugador español sumó minutos en pista en los encuentros disputados durante esta fecha del calendario NBA.';

    const clavesList: ChronicleKeyItem[] = [];
    if (mvp) {
      clavesList.push({
        title: `MVP nocturno (${mvp.teamAbbr})`,
        detail: `**${mvp.playerName}** **marcó el techo individual de la jornada** con ${mvp.points} puntos, ${mvp.rebounds} rebotes, ${mvp.assists} asistencias y ${mvp.gameScore.toFixed(
          1
        )} de valoración Game Score.`,
      });
    }
    if (stmt) {
      clavesList.push({
        title: `Autoridad colectiva de ${stmt.teamAbbr}`,
        detail: `**${stmt.teamName}** **firmó el golpe táctico más contundente** por ${stmt.scoreDisplay} ante **${stmt.opponentAbbr}** respaldado por +${stmt.netRtg.toFixed(
          1
        )} de Net Rating y ${stmt.efgPct.toFixed(1)}% en tiro efectivo.`,
      });
    }
    if (topExp) {
      clavesList.push({
        title: `Explosión fuera de guion`,
        detail: `**${topExp.playerName}** (${topExp.teamAbbr}) **disparó su producción ofensiva** hasta ${topExp.points} puntos (+${topExp.ptsDelta.toFixed(
          1
        )} sobre su media de temporada).`,
      });
    }
    clavesList.push({
      title: `Termómetro de marcadores`,
      detail: `La cartelera dejó **máxima igualdad en los cierres apretados** con ${gd.pulse.closeGamesCount} duelos decididos por 5 o menos puntos y ${gd.pulse.roadWinsCount}/${gd.pulse.gamesCount} victorias visitantes.`,
    });

    return {
      date: gd.selectedDate,
      seasonLabel: gd.seasonLabel,
      gamesCount: gd.pulse.gamesCount,
      generatedAt: new Date().toISOString(),
      engineMode: 'empirical_fallback',
      headline,
      lead,
      dynamicSections,
      pizarrasSection,
      hitosSection: hitosSection || lead,
      espanolesSection,
      clavesList: clavesList.slice(0, 4),
      spanishPlayersSummary:
        spanishNightNotes.length > 0
          ? spanishNightNotes.join(' · ')
          : 'Sin participación en pista de jugadores españoles registrada en los partidos de esta fecha.',
      sources: [],
    };
  }

  /**
   * 3. GEMINI + GOOGLE SEARCH DAILY GLOBAL NBA CHRONICLE (Hybrid Dynamic + Fixed Sections)
   */
  async function buildGameDayChroniclePayload(
    requestedDate?: string,
    forceRefresh = false
  ): Promise<GameDayChroniclePayload> {
    const gd = await deps.getGameDayPayload(requestedDate, forceRefresh);
    const cacheKey = `gameday_chronicle_v7:${gd.selectedDate}`;

    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as GameDayChroniclePayload;
      }
    }

    const existing = reportInflight.get(cacheKey);
    if (existing) {
      return existing as Promise<GameDayChroniclePayload>;
    }

    const promise = (async (): Promise<GameDayChroniclePayload> => {
      const [full, biosMap, pressCtx] = await Promise.all([
        deps.getFullLeagueMemory(),
        deps.getPlayerBiosMap(false),
        fetchLivePressContext(gd.selectedDate, forceRefresh),
      ]);

      const spanishNightNotes: string[] = [];
      const tripleDoublesNight: string[] = [];
      const verifiedNightPlayerNames: string[] = [];
      const eventIdsToday = new Set(gd.matchups.map((m) => m.eventId));
      let totalDoubleDoubles = 0;

      for (const p of full.allPlayers) {
        const g = p.games.find(
          (x) =>
            eventIdsToday.has(x.eventId) || x.date.slice(0, 10) === gd.selectedDate
        );
        if (!g) continue;
        verifiedNightPlayerNames.push(p.name);
        const bio = biosMap.get(p.id);
        const isSp = isSpanishPlayerCheck(p.name, p.country || bio?.country);
        if (isSp) {
          spanishNightNotes.push(
            `#${sanitizeJersey(p.jersey, bio?.jersey)} ${p.name} (${p.teamAbbr} ${
              g.isHome ? 'vs' : '@'
            } ${g.opponentAbbr}, ${g.result}): ${g.points} PTS, ${g.rebounds} REB, ${
              g.assists
            } AST en ${Math.round(g.minutes)} MIN`
          );
        }
        const tens = [
          g.points,
          g.rebounds,
          g.assists,
          g.steals,
          g.blocks,
        ].filter((v) => v >= 10).length;
        if (tens >= 3) {
          tripleDoublesNight.push(
            `${p.name} (${p.teamAbbr}): ${g.points} PTS · ${g.rebounds} REB · ${g.assists} AST`
          );
        } else if (tens === 2) {
          totalDoubleDoubles++;
        }
      }

      if (!getGeminiClient() || gd.matchups.length === 0) {
        return buildDeterministicDailyChronicle(gd, spanishNightNotes);
      }

      const daySeedSources: GroundingSourceLink[] = [
        {
          uri: `https://www.nba.com/games?date=${gd.selectedDate}`,
          title: `NBA.com — Resultados y Actas Oficiales (${gd.selectedDate})`,
        },
        ...pressCtx.daySources,
      ].slice(0, 6);

      const dayDossier = [
        `AVISO CRÍTICO DE MUNDO CERRADO: Jornada oficial NBA del ${gd.selectedDate} (Temporada ${gd.seasonLabel}). Tu memoria interna de entrenamiento está desactualizada varios años respecto a entrenadores actuales, traspasos, contratos y palmarés. NO des NINGÚN dato por supuesto fuera de los hechos explícitos de este dossier.`,
        `FECHA DE LA JORNADA NBA: ${gd.selectedDate} (Temporada ${gd.seasonLabel})`,
        `PULSO GLOBAL: ${gd.pulse.gamesCount} partidos disputados | Media puntos combinados: ${gd.pulse.avgTotalPoints.toFixed(
          1
        )} PTS (media liga: ${gd.pulse.leagueAvgTotalPoints.toFixed(
          1
        )}) | Finales apretados (<=5 pts): ${
          gd.pulse.closeGamesCount
        } | Palizas (>=15 pts): ${gd.pulse.blowoutsCount} | Victorias visitantes: ${
          gd.pulse.roadWinsCount
        }/${gd.pulse.gamesCount} | Ritmo medio (Pace): ${gd.pulse.avgPace.toFixed(1)}.`,
        gd.statementTeamWin
          ? `GOLPE EN LA MESA COLECTIVO: ${gd.statementTeamWin.teamName} (${gd.statementTeamWin.summaryAdvanced}).`
          : '',
        pressCtx.dayNotes.length > 0
          ? `TELETIPOS DE PRENSA DE LOS PARTIDOS DE ESTA FECHA (${gd.selectedDate}):\n${pressCtx.dayNotes
              .slice(0, 12)
              .map((n) => `  • ${n}`)
              .join('\n')}`
          : '',
        ``,
        `QUINTETO IDEAL DE LA NOCHE (TOP 5 GAME SCORE):`,
        ...gd.idealFive.map(
          (p, i) =>
            `${i + 1}. ${p.playerName} (${p.teamAbbr} ${p.isHome ? 'vs' : '@'} ${
              p.opponentAbbr
            }, ${p.result}): ${p.points} PTS, ${p.rebounds} REB, ${
              p.assists
            } AST, ${p.stocks} ROB+TAP, ${p.tsPct.toFixed(
              1
            )}% TS, GmSc ${p.gameScore.toFixed(1)} (su media es ${p.ptsBaselineAvg.toFixed(
              1
            )} PTS)`
        ),
        ``,
        `TODOS LOS RESULTADOS Y CLAVES TÁCTICAS DE LOS ${gd.matchups.length} PARTIDOS:`,
        ...gd.matchups.map(
          (m) =>
            `- ${m.away.name} (${m.away.abbr} ${m.away.recordAfter}) ${
              m.away.score
            } - ${m.home.score} ${m.home.name} (${m.home.abbr} ${
              m.home.recordAfter
            }) [${m.contextTag}] | Líderes: ${
              m.away.topPlayer
                ? `${m.away.topPlayer.playerName} (${m.away.topPlayer.points}P/${m.away.topPlayer.rebounds}R/${m.away.topPlayer.assists}A)`
                : ''
            } vs ${
              m.home.topPlayer
                ? `${m.home.topPlayer.playerName} (${m.home.topPlayer.points}P/${m.home.topPlayer.rebounds}R/${m.home.topPlayer.assists}A)`
                : ''
            } | Claves: ${m.keyTakeawaysAdvanced.map((k) => k.replace(/\*\*/g, '')).join(' / ')}`
        ),
        ``,
        `EXPLOSIONES FRENTE A SU MEDIA: ${
          gd.explosions.length > 0
            ? gd.explosions
                .slice(0, 5)
                .map(
                  (e) =>
                    `${e.playerName} (${e.teamAbbr}): ${e.points} PTS (+${e.ptsDelta.toFixed(
                      1
                    )} vs media ${e.ptsAvg.toFixed(1)}, ${e.driverTag})`
                )
                .join(' | ')
            : 'Ninguna extrema'
        }`,
        `BATACAZOS DE TITULARES: ${
          gd.slumps.length > 0
            ? gd.slumps
                .slice(0, 4)
                .map(
                  (s) =>
                    `${s.playerName} (${s.teamAbbr}): ${s.points} PTS (${s.ptsDelta.toFixed(
                      1
                    )} vs media ${s.ptsAvg.toFixed(1)}, ${s.tsPct.toFixed(0)}% TS)`
                )
                .join(' | ')
            : 'Ninguno acusado'
        }`,
        `CAMBIOS DE ROL / PICOS DE MINUTOS: ${
          gd.roleShifts.length > 0
            ? gd.roleShifts
                .slice(0, 4)
                .map(
                  (r) =>
                    `${r.playerName} (${r.teamAbbr}): ${r.minutes.toFixed(
                      0
                    )} MIN (+${r.minutesDelta.toFixed(1)} vs media), ${r.usgEst.toFixed(
                      1
                    )}% USG, ${r.points}P/${r.rebounds}R/${r.assists}A`
                )
                .join(' | ')
            : 'Rotaciones estables'
        }`,
        `RACHAS DESTACADAS: ${
          gd.streakShifts.length > 0
            ? gd.streakShifts
                .slice(0, 6)
                .map(
                  (st) =>
                    `${st.playerName} (${st.teamAbbr}): ${
                      st.status === 'broken'
                        ? `RACHA ROTA tras ${st.streakCount} PJ`
                        : `PROLONGA a ${st.streakCount} PJ`
                    } en ${st.thresholdLabel} (${st.nightValueDisplay})`
                )
                .join(' | ')
            : 'Sin rachas largas alteradas'
        }`,
        `TRIPLES-DOBLES DE LA NOCHE: ${
          tripleDoublesNight.length > 0
            ? tripleDoublesNight.join(' | ')
            : 'Ninguno'
        } (Total dobles-dobles en la jornada: ${totalDoubleDoubles}).`,
        `JUGADORES ESPAÑOLES EN LA JORNADA: ${
          spanishNightNotes.length > 0
            ? spanishNightNotes.join(' | ')
            : 'Ningún jugador español sumó minutos en pista esta fecha.'
        }`,
      ]
        .filter(Boolean)
        .join('\n');

      const systemInstruction = [
        'Eres el analista jefe y cronista de scouting NBA de referencia en España. Cada mañana escribes la gran revista editorial de la jornada para que un lector exigente entienda en pocos minutos todo lo ocurrido en la liga.',
        'REGLAS INQUEBRANTABLES DE RIGOR Y MUNDO CERRADO (CERO DATOS POR SUPUESTOS):',
        '1. RIGOR EMPÍRICO TOTAL: Todos los marcadores, puntos, porcentajes, récords y rachas que cites deben coincidir al 100% con el dossier adjunto. Jamás inventes resultados, cifras ni jugadas concretas no descritas.',
        '2. PROHIBICIÓN TOTAL DE DAR DATOS POR SUPUESTOS O USAR MEMORIA PREENTRENADA: Tu conocimiento interno previo está desactualizado respecto a la temporada actual. Tienes TERMINANTEMENTE PROHIBIDO dar por supuesto o mencionar: (a) nombres propios o apodos de entrenadores, asistentes o directivos (ej. Tom Thibodeau dejó los NY Knicks hace años; NUNCA cites nombres de entrenadores, habla SIEMPRE de "el cuerpo técnico de [Equipo]", "la dirección técnica de [Equipo]" o "la pizarra de [Equipo]"); (b) antigüedad, edad, rondas de Draft, condición de rookie, contratos, exequipos o traspasos de jugadores; (c) premios pasados, anillos, "vigente campeón" o series de temporadas anteriores; (d) puestos exactos en la clasificación (ej. "4º del Este") o próximos rivales del calendario; (e) causas o plazos de lesiones no escritos literalmente en el dossier.',
        '3. PROSA DE REVISTA DE AUTOR + CERO LISTAS MECÁNICAS DE ESTADÍSTICAS: Queda terminantemente prohibido soltar oraciones del tipo "X firmó N puntos, N rebotes y N asistencias" enumerando jugadores como si fuera una base de datos o un parte de estadísticas. Esos datos ya se muestran en las tarjetas visuales de la interfaz. Escribe un relato periodístico de alta calidad y profundidad táctica (estilo artículo de fondo de Gigantes o The Athletic), analizando dinámicas colectivas, alternativas en el marcador, lectura de espacios y sensaciones de la jornada con total naturalidad humana.',
        '4. JERARQUÍA VISUAL Y ÉNFASIS EN NEGRITA (**...**): En todos los párrafos del cuerpo (ENTRADILLA, párrafos de CAPITULOS_DINAMICOS, PIZARRAS, HITOS, ESPANOLES y la explicación tras :: en CLAVES), utiliza negrita Markdown (**texto**) EXCLUSIVAMENTE para estos tres elementos: (a) nombres de jugadores (ej. **Nikola Jokić**, **#34 Giannis Antetokounmpo**), (b) nombres o apodos oficiales de equipos/franquicias (ej. **Boston Celtics**, **Thunder**, **Lakers**), y (c) UNA sola idea táctica clave por párrafo (frase breve de 4 a 10 palabras que resuma la clave del juego, ej. **castigando la zona desde la esquina débil**). PROHIBIDO poner en negrita cifras o estadísticas aisladas (como "49 puntos", "14 rebotes" o "61.2%"): intégralas en texto normal sin formato especial. PROHIBIDO poner ** en TITULAR, en el título del capítulo previo a :: o en el título corto previo a :: en CLAVES.',
        '5. FORMATO EXACTO CON ESTAS 7 ETIQUETAS EN MAYÚSCULAS:',
        '===TITULAR===',
        '(Titular periodístico potente de portada en 1 sola línea, sin # ni **).',
        '===ENTRADILLA===',
        '(Entradilla editorial destacada de 2 a 3 líneas resumiendo el pulso y los grandes nombres de la noche, aplicando la regla de negritas).',
        '===CAPITULOS_DINAMICOS===',
        '(Redacta 1 o 2 capítulos temáticos con título libre sin ** adaptado a lo más importante que haya ocurrido esta madrugada —ej. finales de infarto, noche de tiradores, pulso por el Oeste, exhibiciones individuales—. Formato obligatorio por capítulo: "Título atractivo del capítulo :: Párrafo 1\\n\\nPárrafo 2". Si escribes 2 capítulos, sepáralos con una línea que contenga únicamente ---).',
        '===PIZARRAS===',
        '(Epígrafe fijo Pizarras: 2 párrafos analizando ajustes tácticos colectivos de la jornada, ritmo frente a la media de la liga, eficiencia ofensiva/defensiva y el golpe colectivo más serio de la noche).',
        '===HITOS===',
        '(Epígrafe fijo Hitos: 2 párrafos entrelazando con naturalidad triples-dobles/dobles-dobles, explosiones estadísticas frente a su media, irrupciones de rol/minutos y rachas prolongadas o rotas).',
        '===ESPANOLES===',
        '(Epígrafe fijo Españoles: si jugaron españoles, 1 párrafo analizando con precisión sus minutos, producción e impacto real; si ninguno sumó minutos en esta fecha, 1 frase sobria, directa y natural confirmándolo).',
        '===CLAVES===',
        '(Epígrafe fijo Claves: exactamente 4 claves rápidas para quedarse con lo esencial del día, una por línea con el formato exacto "Título corto sin ** :: Explicación directa con cifra verificada en 1-2 frases aplicando negritas", sin numeración inicial).',
      ].join('\n');

      try {
        const { text: rawText, sources } = await generateWithGeminiCascade({
          systemInstruction,
          contents: dayDossier,
          seedSources: daySeedSources,
        });

        const safeRawText = sanitizeUnverifiedCoachClaims(
          rawText,
          verifiedNightPlayerNames
        );

        const parsed = parseDelimitedSections(safeRawText, [
          'TITULAR',
          'ENTRADILLA',
          'CAPITULOS_DINAMICOS',
          'PIZARRAS',
          'HITOS',
          'ESPANOLES',
          'CLAVES',
        ]);
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes);

        const payload: GameDayChroniclePayload = {
          date: gd.selectedDate,
          seasonLabel: gd.seasonLabel,
          gamesCount: gd.pulse.gamesCount,
          generatedAt: new Date().toISOString(),
          engineMode: 'gemini_search',
          headline:
            parsed.TITULAR && parsed.TITULAR.length > 12
              ? stripInlineWrapper(parsed.TITULAR)
              : fallback.headline,
          lead:
            parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25
              ? parsed.ENTRADILLA
              : fallback.lead,
          dynamicSections: parseDynamicChapters(
            parsed.CAPITULOS_DINAMICOS,
            fallback.dynamicSections
          ),
          pizarrasSection:
            parsed.PIZARRAS && parsed.PIZARRAS.length > 60
              ? parsed.PIZARRAS
              : fallback.pizarrasSection,
          hitosSection:
            parsed.HITOS && parsed.HITOS.length > 60
              ? parsed.HITOS
              : fallback.hitosSection,
          espanolesSection:
            parsed.ESPANOLES && parsed.ESPANOLES.length > 12
              ? parsed.ESPANOLES
              : fallback.espanolesSection,
          clavesList: parseClavesList(parsed.CLAVES, fallback.clavesList),
          spanishPlayersSummary:
            spanishNightNotes.length > 0
              ? spanishNightNotes.join(' · ')
              : 'Sin minutos en pista de jugadores españoles en los encuentros disputados esta fecha.',
          sources,
        };

        reportMemoryCache.set(cacheKey, {
          expiresAt: Date.now() + 4 * 60 * 60 * 1000,
          data: payload,
        });
        return payload;
      } catch (err: any) {
        console.info(
          `[RadarNBA] Activado motor determinista de jornada para ${gd.selectedDate} (${
            err?.status || err?.code || 'timeout/offline'
          })`
        );
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes);
        reportMemoryCache.set(cacheKey, {
          expiresAt: Date.now() + 10 * 60 * 1000,
          data: fallback,
        });
        return fallback;
      }
    })();

    reportInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      reportInflight.delete(cacheKey);
    }
  }

  return {
    buildGameOfficialReportData,
    buildGameNarrativePayload,
    buildGameDayChroniclePayload,
    fetchLeagueScheduleGames,
    fetchEspnInjuriesByName,
  };
}
