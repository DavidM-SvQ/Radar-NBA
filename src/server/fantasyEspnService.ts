import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  FantasyInjurySeverity,
  FantasyManualLeagueState,
  FantasyNbaContextPayload,
  FantasyPlayerInjuryAlert,
  FantasyRosterContract,
  FantasyTeamGameSlot,
  FantasyWeekWindow,
  PlayerSummary,
} from '../types/nba.ts';
import {
  OFFICIAL_LEAGUE_RULES,
  normalizePlayerLookupKey,
} from '../utils/fantasyScoring.ts';
import {
  STATIC_SCHEDULE_2027,
  buildWeeklyWindowsFromSchedule,
  getEasternTodayIso,
  type StaticScheduledGame,
} from '../utils/staticSchedule.ts';
import { translateMedicalDetailEs } from './scoutingEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = [
  path.resolve(process.cwd(), 'data'),
  path.resolve(__dirname, '../data'),
  path.resolve(__dirname, '../../data'),
].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), 'data');
const MANUAL_STATE_FILE = path.join(DATA_DIR, 'fantasy-manual-league.json');
const SERVERLESS_TMP_STATE_FILE = '/tmp/radarnba-fantasy-manual-league.json';

type ScheduledGameLite = StaticScheduledGame;

export function sanitizeManualFantasyState(
  raw: unknown
): FantasyManualLeagueState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const updatedAt =
    typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt)
      ? obj.updatedAt
      : Date.now();
  const myTeamName =
    typeof obj.myTeamName === 'string' && obj.myTeamName.trim()
      ? obj.myTeamName.trim().slice(0, 80)
      : 'Mi Equipo Fantasy';

  const roster: FantasyRosterContract[] = [];
  const seenRoster = new Set<string>();
  if (Array.isArray(obj.roster)) {
    for (const item of obj.roster) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const pid = String(r.playerId || '').trim();
      const slot = r.slot === 'bench' ? 'bench' : 'starter';
      if (pid && !seenRoster.has(pid) && roster.length < OFFICIAL_LEAGUE_RULES.maxContracts) {
        seenRoster.add(pid);
        roster.push({ playerId: pid, slot });
      }
    }
  }

  const takenRivalIds = Array.isArray(obj.takenRivalIds)
    ? Array.from(
        new Set(
          obj.takenRivalIds
            .map((x) => String(x || '').trim())
            .filter(Boolean)
        )
      )
    : [];

  const rivalRosters: Record<string, string[]> = {};
  if (obj.rivalRosters && typeof obj.rivalRosters === 'object') {
    for (const [k, v] of Object.entries(obj.rivalRosters as Record<string, unknown>)) {
      const cleanKey = String(k || '').trim().slice(0, 40);
      if (!cleanKey || !Array.isArray(v)) continue;
      rivalRosters[cleanKey] = Array.from(
        new Set(v.map((x) => String(x || '').trim()).filter(Boolean))
      );
    }
  }

  const rivalTeamNames: Record<string, string> = {};
  if (obj.rivalTeamNames && typeof obj.rivalTeamNames === 'object') {
    for (const [k, v] of Object.entries(obj.rivalTeamNames as Record<string, unknown>)) {
      const cleanKey = String(k || '').trim().slice(0, 40);
      if (!cleanKey || typeof v !== 'string') continue;
      rivalTeamNames[cleanKey] = v.slice(0, 80);
    }
  }

  return {
    updatedAt,
    myTeamName,
    roster,
    takenRivalIds,
    rivalRosters,
    rivalTeamNames,
  };
}

export function readManualFantasyStateFromDisk(): FantasyManualLeagueState | null {
  const candidates = process.env.VERCEL
    ? [SERVERLESS_TMP_STATE_FILE, MANUAL_STATE_FILE]
    : [MANUAL_STATE_FILE];

  for (const target of candidates) {
    try {
      if (!fs.existsSync(target)) continue;
      const content = fs.readFileSync(target, 'utf8');
      const parsed = JSON.parse(content);
      const valid = sanitizeManualFantasyState(parsed);
      if (valid) return valid;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

export function writeManualFantasyStateToDisk(
  rawState: unknown
): FantasyManualLeagueState | null {
  const sanitized = sanitizeManualFantasyState(rawState);
  if (!sanitized) return null;
  const toSave: FantasyManualLeagueState = {
    ...sanitized,
    updatedAt: Math.max(sanitized.updatedAt, Date.now()),
  };
  try {
    if (process.env.VERCEL) {
      const tmpTarget = `${SERVERLESS_TMP_STATE_FILE}.tmp`;
      fs.writeFileSync(tmpTarget, JSON.stringify(toSave, null, 2), 'utf8');
      fs.renameSync(tmpTarget, SERVERLESS_TMP_STATE_FILE);
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmpFile = `${MANUAL_STATE_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(toSave, null, 2), 'utf8');
      fs.renameSync(tmpFile, MANUAL_STATE_FILE);
    }
  } catch (err) {
    console.error('Error writing fantasy-manual-league.json:', err);
  }
  return toSave;
}

function buildWeeklyWindows(
  scheduleGames: ScheduledGameLite[],
  referenceTodayIso: string
): FantasyWeekWindow[] {
  const effectiveGames =
    scheduleGames.length >= 200 ? scheduleGames : STATIC_SCHEDULE_2027;
  return buildWeeklyWindowsFromSchedule(effectiveGames, referenceTodayIso);
}

function mapInjuryStatusToSpanish(
  rawStatus: string,
  rawDetail: string
): {
  severity: FantasyInjurySeverity;
  statusLabelEs: string;
  detailEs: string;
} {
  const stLow = (rawStatus || '').toLowerCase();
  const detLow = (rawDetail || '').toLowerCase();
  const translated = translateMedicalDetailEs(rawDetail);

  if (stLow.includes('suspension') || detLow.includes('suspension')) {
    return {
      severity: 'suspended',
      statusLabelEs: 'Sancionado',
      detailEs: translated || 'Sanción disciplinaria oficial NBA',
    };
  }
  if (
    stLow.includes('out') ||
    stLow.includes('injured reserve') ||
    stLow === 'ir'
  ) {
    return {
      severity: 'out',
      statusLabelEs: 'Baja confirmada',
      detailEs: translated || 'Baja médica confirmada en parte oficial',
    };
  }
  if (stLow.includes('doubtful')) {
    return {
      severity: 'doubtful',
      statusLabelEs: 'Muy dudoso',
      detailEs: translated || 'Participación muy improbable por molestias',
    };
  }
  if (stLow.includes('probable')) {
    return {
      severity: 'probable',
      statusLabelEs: 'Probable',
      detailEs: translated || 'Molestias leves, previsto disponible',
    };
  }
  if (
    stLow.includes('questionable') ||
    stLow.includes('day-to-day') ||
    stLow.includes('dtd')
  ) {
    return {
      severity: 'questionable',
      statusLabelEs: 'Duda (Día a día)',
      detailEs: translated || 'En evaluación médica previa al partido',
    };
  }

  return {
    severity: 'questionable',
    statusLabelEs: 'Seguimiento médico',
    detailEs: translated || 'Observación médica en parte de equipo',
  };
}

let cachedNbaContext: {
  expiresAt: number;
  payloadBase: Omit<FantasyNbaContextPayload, 'savedState'>;
} | null = null;

export async function buildFantasyEspnSyncPayload(params: {
  allPlayers: PlayerSummary[];
  fetchLeagueScheduleGames: (forceRefresh?: boolean) => Promise<ScheduledGameLite[]>;
  fetchEspnInjuriesByName: (
    forceRefresh?: boolean
  ) => Promise<Map<string, { status: string; detail: string }>>;
  forceRefresh?: boolean;
}): Promise<FantasyNbaContextPayload> {
  const {
    allPlayers,
    fetchLeagueScheduleGames,
    fetchEspnInjuriesByName,
    forceRefresh = false,
  } = params;

  const savedState = readManualFantasyStateFromDisk();

  if (!forceRefresh && cachedNbaContext && cachedNbaContext.expiresAt > Date.now()) {
    return {
      ...cachedNbaContext.payloadBase,
      savedState,
    };
  }

  const playersByNorm = new Map<string, PlayerSummary[]>();
  const playersByRawNorm = new Map<string, PlayerSummary[]>();
  for (const p of allPlayers) {
    const k1 = normalizePlayerLookupKey(p.name);
    const k2 = (p.name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (k1) {
      const arr = playersByNorm.get(k1) || [];
      arr.push(p);
      playersByNorm.set(k1, arr);
    }
    if (k2) {
      const arr = playersByRawNorm.get(k2) || [];
      arr.push(p);
      playersByRawNorm.set(k2, arr);
    }
  }

  const resolveNbaPlayerId = (fullName: string): string | null => {
    const kRaw = (fullName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const kClean = normalizePlayerLookupKey(fullName);
    const cands = playersByRawNorm.get(kRaw) || playersByNorm.get(kClean) || [];
    return cands.length > 0 ? cands[0].id : null;
  };

  const [scheduleGames, rawInjuriesMap] = await Promise.all([
    fetchLeagueScheduleGames(forceRefresh),
    fetchEspnInjuriesByName(forceRefresh),
  ]);

  const todayIso = getEasternTodayIso();
  const weeks = buildWeeklyWindows(scheduleGames, todayIso);

  const injuriesByNormName: Record<string, FantasyPlayerInjuryAlert> = {};
  const injuriesByPlayerId: Record<string, FantasyPlayerInjuryAlert> = {};

  for (const [normKey, rawInj] of rawInjuriesMap.entries()) {
    const mapped = mapInjuryStatusToSpanish(rawInj.status, rawInj.detail);
    const alert: FantasyPlayerInjuryAlert = {
      playerNameNorm: normKey,
      displayName: normKey,
      severity: mapped.severity,
      statusLabelEs: mapped.statusLabelEs,
      detailEs: mapped.detailEs,
    };
    injuriesByNormName[normKey] = alert;

    const matchedNbaId = resolveNbaPlayerId(normKey);
    if (matchedNbaId) {
      const pObj = allPlayers.find((p) => p.id === matchedNbaId);
      if (pObj) {
        alert.displayName = pObj.name;
      }
      injuriesByPlayerId[matchedNbaId] = alert;
    }
  }

  const payloadBase: Omit<FantasyNbaContextPayload, 'savedState'> = {
    generatedAt: new Date().toISOString(),
    injuriesByNormName,
    injuriesByPlayerId,
    weeks,
    defaultWeekId: 'current',
  };

  cachedNbaContext = {
    expiresAt: Date.now() + 5 * 60 * 1000,
    payloadBase,
  };

  return {
    ...payloadBase,
    savedState,
  };
}
