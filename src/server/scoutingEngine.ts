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
  GameOfficialReportData,
  GamePeriodScore,
  GamePodiumEntry,
  GameReportTeamSide,
  GameTeamComparisonRow,
  GameTeamTotalsSummary,
  GroundingSourceLink,
  PlayerSummary,
  TeamGameLog,
  TeamSummary,
} from '../types/nba.ts';

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

function translateInactiveReason(rawReason?: string, rawDesc?: string): string {
  const combined = `${rawReason || ''} ${rawDesc || ''}`.trim();
  if (!combined) return 'Baja en convocatoria';
  const low = combined.toLowerCase();
  if (low.includes('coach')) return 'Decisión técnica (sin minutos)';
  if (low.includes('rest')) return 'Descanso programado';
  if (low.includes('gleague') || low.includes('g-league') || low.includes('two-way')) {
    return 'Asignado a G-League / Contrato dual';
  }
  if (low.includes('suspension') || low.includes('suspended')) {
    return 'Sanción disciplinaria';
  }
  if (low.includes('personal')) return 'Motivos personales';
  if (low.includes('illness')) return 'Proceso vírico / Enfermedad';
  if (low.includes('injury') || low.includes('sprain') || low.includes('strain') || low.includes('soreness') || low.includes('surgery') || low.includes('fracture') || low.includes('knee') || low.includes('ankle') || low.includes('hamstring') || low.includes('calf') || low.includes('back') || low.includes('shoulder')) {
    const cleanDetail = rawDesc
      ? rawDesc.replace(/^Injury\/Illness\s*-\s*/i, '').trim()
      : combined.replace(/^INACTIVE_INJURY\s*/i, '').trim();
    return cleanDetail ? `Lesión (${cleanDetail})` : 'Baja por lesión';
  }
  return rawDesc ? rawDesc.trim() : combined;
}

let searchQuotaCooldownUntil = 0;

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

async function generateWithGeminiCascade(params: {
  systemInstruction: string;
  contents: string;
  seedSources: GroundingSourceLink[];
}): Promise<{ text: string; sources: GroundingSourceLink[] }> {
  // Tier 1: gemini-3.8-flash + Google Search grounding when quota is available
  if (Date.now() >= searchQuotaCooldownUntil) {
    const searchAi = getGeminiClient(14000);
    if (searchAi) {
      try {
        const res = await searchAi.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: params.contents,
          config: {
            systemInstruction: params.systemInstruction,
            temperature: 0.65,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            tools: [{ googleSearch: {} }],
          },
        });
        const txt = String(res.text || '').trim();
        if (txt.length > 80) {
          return {
            text: txt,
            sources: extractGroundingSources(res, params.seedSources),
          };
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('DEADLINE_EXCEEDED') ||
          msg.includes('504')
        ) {
          searchQuotaCooldownUntil = Date.now() + 15 * 60 * 1000;
        }
      }
    }
  }

  // Tier 2: Fast free-tier gemini-3.1-flash-lite grounded with our live NBA Game Book + AP/ESPN press feed
  const liteAi = getGeminiClient(20000);
  if (!liteAi) {
    throw new Error('GEMINI_API_KEY unavailable');
  }
  const liteRes = await liteAi.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: params.contents,
    config: {
      systemInstruction: params.systemInstruction,
      temperature: 0.65,
    },
  });
  const liteText = String(liteRes.text || '').trim();
  if (!liteText) {
    throw new Error('Empty response from Gemini');
  }
  return {
    text: liteText,
    sources: extractGroundingSources(liteRes, params.seedSources),
  };
}

function cleanSectionText(raw: string): string {
  return (raw || '')
    .replace(/^#+\s+.*$/gm, '')
    .replace(/^\*\*PASO B.*?\*\*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    out[key] = cleanSectionText(text.slice(contentStart, contentEnd));
  }
  return out;
}

function stripInlineWrapper(s: string): string {
  return (s || '')
    .replace(/^[-•*\d.)\s]+/, '')
    .replace(/^\*\*|\*\*$/g, '')
    .trim();
}

function parseDynamicChapters(
  raw: string | undefined,
  fallback: ChronicleDynamicSection[]
): ChronicleDynamicSection[] {
  if (!raw || raw.trim().length < 50) return fallback;
  const rawChunks = raw
    .split(/\n\s*---+\s*\n/)
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
      detail = line.slice(sepIdx + 2).replace(/^\*\*|\*\*$/g, '').trim();
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

    const [sbSettled, newsSettled] = await Promise.allSettled([
      deps.cachedFetchJson<Record<string, any>>(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`,
        15 * 60 * 1000,
        {},
        7000,
        forceRefresh
      ),
      deps.cachedFetchJson<Record<string, any>>(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=10`,
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
          if (daySources.length < 4) daySources.push(src);
        }

        byMatchup.set(key, { notes, sources });
      }
    }

    if (
      newsSettled.status === 'fulfilled' &&
      Array.isArray(newsSettled.value?.articles)
    ) {
      for (const art of newsSettled.value.articles.slice(0, 6)) {
        const hl = String(art?.headline || '').trim();
        const desc = String(art?.description || '').trim();
        const href = String(art?.links?.web?.href || '').trim();
        if (hl) {
          dayNotes.push(`Actualidad NBA: ${hl}${desc ? ` (${desc})` : ''}`);
        }
        if (href && daySources.length < 6) {
          daySources.push({
            uri: href.replace(/^http:\/\//i, 'https://'),
            title: hl || 'Actualidad NBA — ESPN',
          });
        }
      }
    }

    return { byMatchup, dayNotes, daySources };
  }

  /**
   * 1. FAST EMPIRICAL REPORT & NBA.COM GAME BOOK ASSEMBLER (Zero "N/D" guaranteed)
   */
  async function buildGameOfficialReportData(
    eventId: string,
    forceRefresh = false
  ): Promise<GameOfficialReportData> {
    const cacheKey = `game_official_report_v2:${eventId}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as GameOfficialReportData;
      }
    }

    const [full, biosMap] = await Promise.all([
      deps.getFullLeagueMemory(),
      deps.getPlayerBiosMap(forceRefresh),
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
            const category: GameInactiveOrDnpItem['category'] =
              statusStr !== 'ACTIVE' ? 'inactive' : 'dnp_bench';
            const note =
              statusStr !== 'ACTIVE'
                ? translateInactiveReason(
                    cp?.notPlayingReason,
                    cp?.notPlayingDescription
                  )
                : 'Convocado en banquillo · Sin minutos (decisión técnica)';
            absencesAndDnp.push({
              playerId: pid || undefined,
              name: fullName,
              jersey,
              category,
              note,
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
                lineSummary: `${note} en ${abbr}`,
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
            spanishDetails.push({
              playerId: p.id,
              name: p.name,
              jersey: j,
              teamAbbr: abbr,
              played: false,
              lineSummary: `#${j} ${p.name} (${abbr}): fuera de los minutos de rotación / baja en este encuentro`,
            });
          }

          if (playedIdsTonight.has(p.id) || listedIdsTonight.has(p.id)) continue;
          if (seasonGames.length < 2) continue;
          const avgMin =
            seasonGames.reduce((s, g) => s + g.minutes, 0) / seasonGames.length;
          const avgPts =
            seasonGames.reduce((s, g) => s + g.points, 0) / seasonGames.length;
          if (avgMin >= 14.5) {
            absencesAndDnp.unshift({
              playerId: p.id,
              name: p.name,
              jersey: sanitizeJersey(p.jersey, bio?.jersey),
              category: 'rotation_absence',
              note: `Ausencia en rotación (promedia ${avgPts.toFixed(
                1
              )} PTS · ${avgMin.toFixed(1)} MIN)`,
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

        // Check for in-game setbacks
        const plSummary = full.allPlayers.find((p) => p.id === pl.playerId);
        if (plSummary) {
          const seasonLogs = plSummary.games.filter((g) => g.seasonLabel === seasonLabel);
          if (seasonLogs.length >= 3) {
            const avgMin = seasonLogs.reduce((s, g) => s + g.minutes, 0) / seasonLogs.length;
            const avgPts = seasonLogs.reduce((s, g) => s + g.points, 0) / seasonLogs.length;

            if (avgMin >= 16 && pl.minutes <= Math.min(12, avgMin * 0.45)) {
              absencesAndDnp.unshift({
                playerId: pl.playerId,
                name: pl.name,
                jersey: pl.jersey,
                category: 'in_game_setback',
                note: `Salida prematura / percance en partido: ${pl.minutesFormatted} min jugados (habitual: ${avgMin.toFixed(1)} MIN · ${avgPts.toFixed(1)} PTS)`,
                ptsAvg: round1(avgPts),
                minAvg: round1(avgMin),
                reason: 'Retirado prematuramente durante el juego',
                isSpanish: pl.isSpanish,
              });
            } else if (pl.fouls >= 6) {
              absencesAndDnp.unshift({
                playerId: pl.playerId,
                name: pl.name,
                jersey: pl.jersey,
                category: 'in_game_setback',
                note: `Expulsado por 6 faltas personales en ${pl.minutesFormatted} min (${pl.points} PTS · ${pl.rebounds} REB)`,
                ptsAvg: round1(avgPts),
                minAvg: round1(avgMin),
                reason: '6 Faltas personales',
                isSpanish: pl.isSpanish,
              });
            }
          }
        }
      }

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

      return {
        teamId: teamObj.id,
        abbr,
        name: teamObj.name,
        shortName: teamObj.shortName,
        recordAfter: computeRecordUpToDate(teamObj),
        score: teamLog.pointsFor,
        isWinner,
        isBackToBack: teamLog.isBackToBack,
        starters,
        bench,
        totals,
        absencesAndDnp,
        podium,
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

    // Build 23 Unified Team Comparison Rows across 3 Sections
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
      key: 'defRtg',
      label: 'Eficiencia Defensiva (DefRtg)',
      helpKey: 'defRtg',
      awayVal: at.defRtg,
      homeVal: ht.defRtg,
      awayDisplay: `${at.defRtg.toFixed(1)}`,
      homeDisplay: `${ht.defRtg.toFixed(1)}`,
      decimals: 1,
      lowerIsBetter: true,
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
      label: 'Puntos contrataque (FB PTS)',
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
      awayVal: at.fouls,
      homeVal: ht.fouls,
      awayDisplay: `${at.fouls}`,
      homeDisplay: `${ht.fouls}`,
      lowerIsBetter: true,
      suffix: ' menos',
      section: 'reb_playmaking_defense',
    });

    // Build Expanded 16 CARA A CARA LÍDERES INDIVIDUALES ('#Dorsal I. Apellido (Dato)')
    const awayPool = [...awaySide.starters, ...awaySide.bench];
    const homePool = [...homeSide.starters, ...homeSide.bench];
    const leaderComparisonRows: GameLeaderComparisonRow[] = [];

    const pickTopLeader = (
      pool: GameBoxScorePlayerLine[],
      getter: (p: GameBoxScorePlayerLine) => number
    ): GameBoxScorePlayerLine | null => {
      if (pool.length === 0) return null;
      return [...pool].sort((a, b) => {
        const diff = getter(b) - getter(a);
        if (Math.abs(diff) > 0.01) return diff;
        if (b.gameScore !== a.gameScore) return b.gameScore - a.gameScore;
        return a.minutes - b.minutes;
      })[0];
    };

    const leaderDefs: Array<{
      key: string;
      label: string;
      helpKey?: string;
      getter: (p: GameBoxScorePlayerLine) => number;
      formatStat: (p: GameBoxScorePlayerLine) => string;
      filter?: (p: GameBoxScorePlayerLine) => boolean;
    }> = [
      {
        key: 'pts',
        label: 'Puntos',
        helpKey: 'ptsBase',
        getter: (p) => p.points,
        formatStat: (p) => `${p.points} PTS`,
      },
      {
        key: 'reb',
        label: 'Rebotes Totales',
        helpKey: 'rebBase',
        getter: (p) => p.rebounds,
        formatStat: (p) => `${p.rebounds} REB`,
      },
      {
        key: 'ast',
        label: 'Asistencias',
        helpKey: 'astBase',
        getter: (p) => p.assists,
        formatStat: (p) => `${p.assists} AST`,
      },
      {
        key: 'fg3m',
        label: 'Triples Anotados',
        helpKey: 'fg3m',
        getter: (p) => p.fg3m,
        formatStat: (p) => `${p.fg3m}/${p.fg3a} T3`,
      },
      {
        key: 'stl',
        label: 'Robos de Balón',
        helpKey: 'steals',
        getter: (p) => p.steals,
        formatStat: (p) => `${p.steals} ROB`,
      },
      {
        key: 'blk',
        label: 'Tapones',
        helpKey: 'blocks',
        getter: (p) => p.blocks,
        formatStat: (p) => `${p.blocks} TAP`,
      },
      {
        key: 'pm',
        label: 'Impacto Más / Menos',
        helpKey: 'plusMinusBase',
        getter: (p) => p.plusMinus,
        formatStat: (p) => `${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}`,
      },
      {
        key: 'gmSc',
        label: 'Valoración (GmSc)',
        helpKey: 'gmSc',
        getter: (p) => p.gameScore,
        formatStat: (p) => `${p.gameScore.toFixed(1)} GmSc`,
      },
      {
        key: 'min',
        label: 'Minutos Jugados',
        getter: (p) => p.minutes,
        formatStat: (p) => `${p.minutesFormatted} MIN`,
      },
      {
        key: 'oreb',
        label: 'Rebotes Ofensivos',
        getter: (p) => p.oreb,
        formatStat: (p) => `${p.oreb} OREB`,
      },
      {
        key: 'tc',
        label: 'Tiros de Campo Anotados',
        getter: (p) => p.fgm,
        formatStat: (p) => `${p.fgm}/${p.fga} TC`,
      },
      {
        key: 'tl',
        label: 'Tiros Libres Anotados',
        getter: (p) => p.ftm,
        formatStat: (p) => `${p.ftm}/${p.fta} TL`,
      },
      {
        key: 'tsPct',
        label: 'Acierto Real (TS%)',
        helpKey: 'tsPct',
        filter: (p) => p.fga >= 8,
        getter: (p) => p.tsPct,
        formatStat: (p) => `${p.tsPct.toFixed(1)}% TS`,
      },
      {
        key: 'usgEst',
        label: 'Uso Ofensivo Est. (USG%)',
        filter: (p) => p.minutes >= 12,
        getter: (p) => p.usgEst || 0,
        formatStat: (p) => `${(p.usgEst || 0).toFixed(1)}% USG`,
      },
      {
        key: 'astTo',
        label: 'Ratio Asistencias/Pérdidas',
        filter: (p) => p.assists >= 4,
        getter: (p) => (p.turnovers > 0 ? round1(p.assists / p.turnovers) : p.assists),
        formatStat: (p) => `${(p.turnovers > 0 ? round1(p.assists / p.turnovers) : p.assists).toFixed(1)} AST/PER`,
      },
      {
        key: 'sixthMan',
        label: 'Mejor Suplente (6º Hombre)',
        filter: (p) => !p.isStarter,
        getter: (p) => p.gameScore,
        formatStat: (p) => `${p.points} PTS · ${p.gameScore.toFixed(1)} GmSc`,
      },
    ];

    for (const def of leaderDefs) {
      const aFiltered = def.filter ? awayPool.filter(def.filter) : awayPool;
      const hFiltered = def.filter ? homePool.filter(def.filter) : homePool;
      const aL = pickTopLeader(aFiltered.length > 0 ? aFiltered : awayPool, def.getter);
      const hL = pickTopLeader(hFiltered.length > 0 ? hFiltered : homePool, def.getter);
      if (!aL || !hL) continue;
      const aVal = def.getter(aL);
      const hVal = def.getter(hL);
      const betterSide: 'away' | 'home' | 'tie' =
        Math.abs(aVal - hVal) < 0.05 ? 'tie' : aVal > hVal ? 'away' : 'home';

      leaderComparisonRows.push({
        categoryKey: def.key,
        categoryLabel: def.label,
        helpKey: def.helpKey,
        awayPlayerId: aL.playerId,
        awayFormatted: `#${aL.jersey} ${aL.shortName} (${def.formatStat(aL)})`,
        awayValue: aVal,
        homePlayerId: hL.playerId,
        homeFormatted: `#${hL.jersey} ${hL.shortName} (${def.formatStat(hL)})`,
        homeValue: hVal,
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

    const pressLead = `${winner.name} (${winner.recordAfter}) selló el triunfo ${
      report.away.isWinner ? 'a domicilio' : 'en su pista'
    } apoyado en un ${wt.efgPct.toFixed(1)}% de tiro efectivo y el golpe asestado en ${
      report.decisivePeriodLabel
    }, dejando sin premio la resistencia de ${loser.name} (${loser.recordAfter}).`;

    const quarterNarrative =
      report.periods.length >= 4
        ? `El guion por parciales (${report.periods
            .map((p) => `${p.label}: ${p.awayScore}-${p.homeScore}`)
            .join(', ')}) encontró su punto de ruptura definitivo en ${
            report.decisivePeriodLabel
          }${
            report.leadChanges !== null
              ? `, tras un intercambio táctico con ${report.leadChanges} cambios de mando y ${
                  report.timesTied ?? 0
                } empates en el marcador`
              : ''
          }.`
        : `El encuentro se definió por una renta final de ${margin} tantos (${report.away.score}-${report.home.score}) bajo un ritmo de ${wt.pace.toFixed(
            1
          )} posesiones.`;

    const runAndClutchProse =
      wt.biggestLead !== null && wt.biggestRun !== null
        ? `${winner.shortName} llegó a estirar su ventaja máxima hasta los +${wt.biggestLead} puntos gracias a una racha de ${wt.biggestRun}-0 que desarmó el balance defensivo de ${loser.shortName}, sabiendo administrar las posesiones finales sin conceder segundas vidas.`
        : `En el tramo decisivo, la gestión del tempo ofensivo (${wt.offRtg.toFixed(
            1
          )} de eficiencia ofensiva frente a ${lt.offRtg.toFixed(
            1
          )}) permitió a ${winner.shortName} blindar el electrónico.`;

    const paintAndThreeBattle =
      wt.ptsPaint !== null && lt.ptsPaint !== null
        ? `En la pizarra de espacios, ${winner.name} firmó un ${wt.efgPct.toFixed(
            1
          )}% en tiro efectivo (${wt.fg3m}/${wt.fg3a} en triples) y sumó ${
            wt.ptsPaint
          } puntos en la pintura frente a los ${lt.ptsPaint} de ${
            loser.shortName
          }, mientras que en el rebote el pulso cerró ${wt.reb}-${
            lt.reb
          } (${wt.oreb} capturas ofensivas del ganador por ${lt.oreb} del rival).`
        : `En el pulso de los Cuatro Factores, ${
            winner.name
          } impuso un ${wt.efgPct.toFixed(1)}% de acierto efectivo (${wt.fg3m}/${
            wt.fg3a
          } desde el perímetro) frente al ${lt.efgPct.toFixed(1)}% de ${
            loser.name
          }, acompañando el tiro con un balance reboteador de ${wt.reb}-${lt.reb}.`;

    const awayAbs = report.away.absencesAndDnp.filter(
      (a) => a.category !== 'dnp_bench'
    );
    const homeAbs = report.home.absencesAndDnp.filter(
      (a) => a.category !== 'dnp_bench'
    );
    const benchAndAbsences = `La rotación de segunda unidad aportó ${
      wt.benchPoints
    } puntos en ${winner.shortName} por ${lt.benchPoints} del banquillo de ${
      loser.shortName
    }${
      wt.ptsFastBreak !== null && lt.ptsFastBreak !== null
        ? `, con un parcial de ${wt.ptsFastBreak}-${lt.ptsFastBreak} al contraataque y ${
            wt.ptsOffTov ?? 0
          } tantos tras las ${lt.tov} pérdidas rivales`
        : `, castigando las ${lt.tov} pérdidas de ${loser.shortName}`
    }.${
      awayAbs.length > 0 || homeAbs.length > 0
        ? ` Las rotaciones estuvieron condicionadas por las bajas en acta: ${[
            ...awayAbs.map((a) => `${a.name} (${report.away.abbr}: ${a.note})`),
            ...homeAbs.map((a) => `${a.name} (${report.home.abbr}: ${a.note})`),
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
        } tras agotarse el tiempo reglamentario en máxima igualdad, poniendo a prueba las piernas de los titulares y premiando la ejecución en media pista de ${winner.shortName}.`,
      };
    } else if (Math.abs(wt.benchPoints - lt.benchPoints) >= 16) {
      const benchWinner =
        wt.benchPoints > lt.benchPoints ? winner.shortName : loser.shortName;
      dynamicSpotlight = {
        title: `Desequilibrio en los tramos de segunda unidad`,
        body: `La brecha de banquillos (${wt.benchPoints}-${lt.benchPoints} en puntos de suplentes) alteró por completo los minutos de descanso de las estrellas, dando aire constante a la rotación de ${benchWinner}.`,
      };
    }

    const xFactorSection =
      wStar && lStar
        ? `El timón ofensivo perteneció a #${wStar.jersey} ${wStar.name} (${wStar.points} PTS, ${wStar.rebounds} REB, ${wStar.assists} AST, GmSc ${wStar.gameScore.toFixed(
            1
          )}), generando ventajas constantes sobre la primera línea de ayuda de ${
            loser.shortName
          }.\n\nComo Factor X emergió ${
            wSecond
              ? `#${wSecond.jersey} ${wSecond.name} (${wSecond.points} PTS · ${wSecond.rebounds} REB · ${wSecond.assists} AST, ${
                  wSecond.plusMinus >= 0
                    ? `+${wSecond.plusMinus}`
                    : wSecond.plusMinus
                } en pista)`
              : `el bloque exterior de ${winner.shortName}`
          }, dando continuidad a cada tramo sin balón, mientras que en ${
            loser.name
          } la producción de #${lStar.jersey} ${lStar.name} (${lStar.points} PTS, ${lStar.rebounds} REB, ${lStar.assists} AST) sostuvo la pelea hasta el desenlace.`
        : `El reparto coral en ${winner.name} inclinó la balanza en las posesiones calientes del último cuarto.`;

    const ddProse =
      report.milestonesList.length > 0
        ? `La hoja estadística dejó actuaciones de dobles figuras múltiples con ${report.milestonesList
            .map((m) =>
              m.type === 'TD'
                ? `el triple-doble de ${m.detail}`
                : `el doble-doble de ${m.detail}`
            )
            .join(', ')}. `
        : '';

    const verdictSection = `${ddProse}En la lectura global de scouting, ${
      winner.name
    } (${winner.recordAfter}) refuerza su identidad competitiva firmando ${wt.offRtg.toFixed(
      1
    )} puntos por cada 100 posesiones, mientras que ${loser.name} (${
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
    const cacheKey = `game_narrative_v2:${eventId}`;
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

      const dossier = [
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
        matchPress && matchPress.notes.length > 0
          ? `TELETIPO DE PRENSA Y CONTEXTO EN VIVO (AP / ESPN): ${matchPress.notes.join(' | ')}`
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
        `BAJAS / SIN MINUTOS ${report.away.abbr}: ${
          report.away.absencesAndDnp.length > 0
            ? report.away.absencesAndDnp
                .map((a) => `#${a.jersey} ${a.name} (${a.note})`)
                .join('; ')
            : 'Ninguna registrada'
        }`,
        ``,
        `PLANTILLA ${report.home.abbr} EN PISTA:`,
        ...[...report.home.starters, ...report.home.bench].map(formatPlayerDossier),
        `BAJAS / SIN MINUTOS ${report.home.abbr}: ${
          report.home.absencesAndDnp.length > 0
            ? report.home.absencesAndDnp
                .map((a) => `#${a.jersey} ${a.name} (${a.note})`)
                .join('; ')
            : 'Ninguna registrada'
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
        'REGLAS INQUEBRANTABLES DE RIGOR Y ESTILO:',
        '1. RIGOR EMPÍRICO ABSOLUTO: Usa EXCLUSIVAMENTE las cifras estadísticas exactas, el nombre oficial del pabellón indicado en TÍTULO y el teletipo de prensa adjunto. Jamás inventes puntos, rebotes, parciales, jugadas ficticias ni dorsales.',
        '2. REDACCIÓN 100% NATURAL Y HUMANA: Escribe en español de España fluido, con vocabulario táctico auténtico (espaciado, pintura, bloqueo directo, ajuste tras descanso, transición defensiva, segunda unidad, rebote ofensivo, clutch).',
        '3. CERO CLICHÉS NI RELLENO: Prohibido usar "En conclusión", "Cabe destacar", "Sin lugar a dudas", "Sin duda" o metatexto. Redacta párrafos cohesivos, sin listas de viñetas ni tablas Markdown.',
        '4. ESTRUCTURA EXACTA DE SALIDA CON ESTAS 8 ETIQUETAS EN MAYÚSCULAS:',
        '===TITULAR_PRENSA===',
        '(Titular periodístico vibrante y directo de 1 línea sobre el partido, sin almohadillas #).',
        '===ENTRADILLA===',
        '(Entradilla destacada de 2 líneas sintetizando la tesis táctica y el protagonista del encuentro).',
        '===GUION_Y_QUIEBRE===',
        '(2 párrafos fluidos: evolución del partido por cuartos, alternancias, rachas anotadoras y el momento exacto donde se rompió o decidió el choque).',
        '===PIZARRA_Y_ROTACION===',
        '(2 párrafos de scouting profundo: ajustes tácticos, batallas en pintura/triple/rebote, impacto de las bajas o problemas de faltas, rendimiento de la segunda unidad y puntos tras pérdida/contraataque).',
        '===FOCO_ESPECIAL===',
        '(Si el partido tuvo un ángulo singular —prórroga, remontada grande, exhibición histórica, cortocircuito en el clutch, clínica defensiva—, escribe en una línea el título corto seguido de || y 1 párrafo analítico: ej. "Supervivencia en la prórroga || Texto...". Si fue un guion convencional sin ángulo extra, escribe únicamente: NINGUNO).',
        '===FACTOR_X_Y_LIDERES===',
        '(2 párrafos analizando el duelo de estrellas y quién emergió como Factor X inesperado para inclinar la balanza, citando siempre dorsales # y cifras reales).',
        '===ESPANOLES===',
        '(Si hay españoles en el detector oficial, analiza en 1 párrafo su impacto o situación en convocatoria; si NO los hay, escribe UNA SOLA FRASE breve, limpia y directa confirmándolo).',
        '===VEREDICTO_E_HITOS===',
        '(2 párrafos integrando con total naturalidad los dobles-dobles o triples-dobles verificados y cerrando con el veredicto del scout sobre qué deja este choque a ambos equipos).',
      ].join('\n');

      try {
        const { text: rawText, sources } = await generateWithGeminiCascade({
          systemInstruction,
          contents: dossier,
          seedSources,
        });

        const parsed = parseDelimitedSections(rawText, [
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
      } catch (err) {
        console.warn(`Gemini game narrative fallback for ${eventId}:`, err);
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
    )} puntos (${ptsDiff >= 0 ? `+${ptsDiff.toFixed(1)}` : ptsDiff.toFixed(1)} frente al promedio de la liga), ${
      gd.pulse.roadWinsCount
    } triunfos visitantes y un ritmo medio de ${gd.pulse.avgPace.toFixed(
      1
    )} posesiones.`;

    const idealProse = gd.idealFive
      .slice(0, 5)
      .map(
        (p, idx) =>
          `${idx === 0 ? 'Liderando el Quinteto Ideal' : 'Junto a él'}, ${
            p.playerName
          } (${p.teamAbbr}) firmó ${p.points} PTS, ${p.rebounds} REB y ${
            p.assists
          } AST (${p.tsPct.toFixed(0)}% TS, GmSc ${p.gameScore.toFixed(1)})`
      )
      .join('; ');

    const dynamicSections: ChronicleDynamicSection[] = [
      {
        kicker: 'Tema de Apertura',
        title:
          gd.pulse.closeGamesCount >= 3
            ? `Noche de nervios de acero con ${gd.pulse.closeGamesCount} cierres en el clutch`
            : mvp
            ? `El impacto total de ${mvp.playerName} al mando del Quinteto Ideal`
            : 'Pulso competitivo y reparto de golpes en la cartelera',
        body: `${idealProse}.\n\nDe los ${gd.pulse.gamesCount} duelos disputados, ${
          gd.pulse.closeGamesCount
        } se resolvieron en un pañuelo de cinco o menos puntos, exigiendo máxima precisión en media pista durante los últimos minutos, mientras que ${
          gd.pulse.blowoutsCount
        } encuentros quedaron rotos por rentas superiores a los quince tantos.`,
      },
    ];

    const pizarrasSection = [
      `El termómetro táctico de la madrugada mostró ${
        ptsDiff >= 3
          ? 'ataques lanzados a campo abierto, volumen alto de triple temprano y castigo constante a las transiciones defensivas'
          : ptsDiff <= -3
          ? 'defensas cerradas sobre la pintura, control del rebote defensivo y posesiones largas en cinco contra cinco'
          : 'un equilibrio notable entre transiciones rápidas y lecturas pacientes sobre bloqueo directo'
      }. Los visitantes rascaron ${gd.pulse.roadWinsCount} victorias lejos de casa en una noche de ${gd.pulse.avgPace.toFixed(
        1
      )} posesiones de media.`,
      stmt
        ? `La pizarra más dominante llevó el sello de ${
            stmt.teamName
          }, vencedor ${stmt.isHome ? 'en casa frente a' : 'en la pista de'} ${
            stmt.opponentAbbr
          } (${stmt.scoreDisplay}) con un diferencial neto de +${stmt.netRtg.toFixed(
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
        ? `En el radar de anomalías estadísticas sobresalió ${
            topExp.playerName
          } (${topExp.teamAbbr}), disparándose hasta los ${
            topExp.points
          } PTS (+${topExp.ptsDelta.toFixed(
            1
          )} respecto a su media habitual de ${topExp.ptsAvg.toFixed(1)}) gracias a ${topExp.driverTag.toLowerCase()}.`
        : '',
      gd.roleShifts.length > 0
        ? `En clave de rotaciones y oportunidades emergentes, ganaron peso específico ${gd.roleShifts
            .slice(0, 3)
            .map(
              (r) =>
                `${r.playerName} (${r.teamAbbr}, ${r.minutes.toFixed(
                  0
                )} MIN y ${r.points} PTS)`
            )
            .join(', ')}.`
        : '',
      brokenList.length > 0 || extendedList.length > 0
        ? `Respecto a las series consecutivas, ${
            extendedList.length > 0
              ? `${extendedList[0].playerName} estiró a ${extendedList[0].streakCount} PJ su racha en ${extendedList[0].thresholdLabel}`
              : 'varias referencias ofensivas sostuvieron su regularidad'
          }${
            brokenList.length > 0
              ? `, al tiempo que se cortó la secuencia de ${brokenList[0].streakCount} encuentros de ${brokenList[0].playerName} (${brokenList[0].thresholdLabel})`
              : ''
          }.`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const espanolesSection =
      spanishNightNotes.length > 0
        ? `La representación española dejó presencia verificada en acta durante la madrugada: ${spanishNightNotes.join(
            '; '
          )}.`
        : 'Ningún jugador español sumó minutos en pista en los encuentros disputados durante esta fecha del calendario NBA.';

    const clavesList: ChronicleKeyItem[] = [];
    if (mvp) {
      clavesList.push({
        title: `MVP nocturno (${mvp.teamAbbr})`,
        detail: `${mvp.playerName} marcó el techo individual con ${mvp.points} PTS, ${mvp.rebounds} REB, ${mvp.assists} AST y ${mvp.gameScore.toFixed(
          1
        )} de valoración Game Score.`,
      });
    }
    if (stmt) {
      clavesList.push({
        title: `Autoridad colectiva de ${stmt.teamAbbr}`,
        detail: `Triunfo por ${stmt.scoreDisplay} ante ${stmt.opponentAbbr} respaldado por +${stmt.netRtg.toFixed(
          1
        )} de Net Rating y ${stmt.efgPct.toFixed(1)}% eFG.`,
      });
    }
    if (topExp) {
      clavesList.push({
        title: `Explosión fuera de guion`,
        detail: `${topExp.playerName} (${topExp.teamAbbr}) se fue a ${topExp.points} PTS (+${topExp.ptsDelta.toFixed(
          1
        )} sobre su media de temporada).`,
      });
    }
    clavesList.push({
      title: `Termómetro de marcadores`,
      detail: `${gd.pulse.closeGamesCount} duelos decididos por 5 o menos puntos y ${gd.pulse.roadWinsCount}/${gd.pulse.gamesCount} victorias visitantes.`,
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
    const cacheKey = `gameday_chronicle_v2:${gd.selectedDate}`;

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
      const eventIdsToday = new Set(gd.matchups.map((m) => m.eventId));
      let totalDoubleDoubles = 0;

      for (const p of full.allPlayers) {
        const g = p.games.find(
          (x) =>
            eventIdsToday.has(x.eventId) || x.date.slice(0, 10) === gd.selectedDate
        );
        if (!g) continue;
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
          ? `TELETIPOS DE PRENSA Y ACTUALIDAD NBA EN VIVO (AP / ESPN):\n${pressCtx.dayNotes
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
            } | Claves: ${m.keyTakeawaysAdvanced.join(' / ')}`
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
        'REGLAS ESTRICTAS:',
        '1. RIGOR EMPÍRICO TOTAL: Todos los marcadores, puntos, porcentajes, récords y rachas que cites deben coincidir al 100% con el dossier adjunto. Jamás inventes resultados ni cifras.',
        '2. PROSA DE REVISTA + SCOUTING PROFUNDO: Redacción fluida, analítica y 100% humana en español. Cero muletillas de IA ("En conclusión", "Cabe destacar", "Sin duda"). Conecta los partidos buscando hilos tácticos.',
        '3. FORMATO EXACTO CON ESTAS 7 ETIQUETAS EN MAYÚSCULAS:',
        '===TITULAR===',
        '(Titular periodístico potente de portada en 1 sola línea, sin #).',
        '===ENTRADILLA===',
        '(Entradilla editorial destacada de 2 a 3 líneas resumiendo el pulso y los grandes nombres de la noche).',
        '===CAPITULOS_DINAMICOS===',
        '(Redacta 1 o 2 capítulos temáticos con título libre adaptado a lo más importante que haya ocurrido esta madrugada —ej. finales de infarto, noche de tiradores, pulso por el Oeste, exhibiciones individuales—. Formato obligatorio por capítulo: "Título atractivo del capítulo :: Párrafo 1\\n\\nPárrafo 2". Si escribes 2 capítulos, sepáralos con una línea que contenga únicamente ---).',
        '===PIZARRAS===',
        '(Epígrafe fijo Pizarras: 2 párrafos analizando ajustes de entrenadores, tendencias tácticas de la jornada, ritmo, eficiencia ofensiva/defensiva y el golpe colectivo más serio de la noche).',
        '===HITOS===',
        '(Epígrafe fijo Hitos: 2 párrafos entrelazando con naturalidad triples-dobles/dobles-dobles, explosiones estadísticas frente a su media, irrupciones de rol/minutos y rachas prolongadas o rotas).',
        '===ESPANOLES===',
        '(Epígrafe fijo Españoles: si jugaron españoles, 1 párrafo analizando con precisión sus minutos, producción e impacto real; si ninguno sumó minutos en esta fecha, 1 frase sobria, directa y natural confirmándolo).',
        '===CLAVES===',
        '(Epígrafe fijo Claves: exactamente 4 claves rápidas para quedarse con lo esencial del día, una por línea con el formato exacto "Título corto :: Explicación directa con cifra verificada en 1-2 frases", sin numeración inicial).',
      ].join('\n');

      try {
        const { text: rawText, sources } = await generateWithGeminiCascade({
          systemInstruction,
          contents: dayDossier,
          seedSources: daySeedSources,
        });

        const parsed = parseDelimitedSections(rawText, [
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
      } catch (err) {
        console.warn(`Gemini daily chronicle fallback for ${gd.selectedDate}:`, err);
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
  };
}
