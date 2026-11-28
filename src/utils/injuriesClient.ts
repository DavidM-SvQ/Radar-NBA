import type {
  InjuriesRotationPayload,
  InjuryPlayerReportItem,
  InjuryStatusCode,
  RotationBeneficiaryItem,
  TeamInjuryRotationImpact,
} from '../types/nba';

let cachedPayload: { data: InjuriesRotationPayload; fetchedAt: number } | null = null;
let inFlightPromise: Promise<InjuriesRotationPayload> | null = null;
const CLIENT_TTL_MS = 5 * 60 * 1000;

export function peekCachedInjuriesReportClient(): InjuriesRotationPayload | null {
  if (!cachedPayload) return null;
  if (Date.now() - cachedPayload.fetchedAt > CLIENT_TTL_MS) return null;
  return cachedPayload.data;
}

export async function fetchInjuriesReportClient(
  forceRefresh = false
): Promise<InjuriesRotationPayload> {
  if (!forceRefresh) {
    const peek = peekCachedInjuriesReportClient();
    if (peek) return peek;
    if (inFlightPromise) return inFlightPromise;
  }

  const url = forceRefresh ? '/api/nba/injuries?refresh=1' : '/api/nba/injuries';
  const req = fetch(url)
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error || 'No se pudo cargar el parte médico de la NBA.'
        );
      }
      const data = (await res.json()) as InjuriesRotationPayload;
      cachedPayload = { data, fetchedAt: Date.now() };
      return data;
    })
    .finally(() => {
      inFlightPromise = null;
    });

  inFlightPromise = req;
  return req;
}

export function normalizeInjuryLookupName(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface InjuriesLookupIndex {
  byPlayerId: Map<string, InjuryPlayerReportItem>;
  byNormName: Map<string, InjuryPlayerReportItem>;
  byTeamAbbr: Map<string, TeamInjuryRotationImpact>;
  beneficiaryByPlayerId: Map<string, RotationBeneficiaryItem>;
}

const EMPTY_INDEX: InjuriesLookupIndex = {
  byPlayerId: new Map(),
  byNormName: new Map(),
  byTeamAbbr: new Map(),
  beneficiaryByPlayerId: new Map(),
};

export function buildInjuriesLookupIndex(
  payload: InjuriesRotationPayload | null | undefined
): InjuriesLookupIndex {
  if (!payload) return EMPTY_INDEX;
  const byPlayerId = new Map<string, InjuryPlayerReportItem>();
  const byNormName = new Map<string, InjuryPlayerReportItem>();
  const byTeamAbbr = new Map<string, TeamInjuryRotationImpact>();
  const beneficiaryByPlayerId = new Map<string, RotationBeneficiaryItem>();

  for (const item of payload.entries || []) {
    if (item.playerId) byPlayerId.set(item.playerId, item);
    if (item.nameNorm) byNormName.set(item.nameNorm, item);
  }
  for (const team of payload.teams || []) {
    byTeamAbbr.set(team.teamAbbr.toUpperCase(), team);
    for (const ben of team.beneficiaries || []) {
      const prev = beneficiaryByPlayerId.get(ben.playerId);
      if (!prev || ben.projectedFptsDelta > prev.projectedFptsDelta) {
        beneficiaryByPlayerId.set(ben.playerId, ben);
      }
    }
  }
  return { byPlayerId, byNormName, byTeamAbbr, beneficiaryByPlayerId };
}

export function findPlayerInjury(
  index: InjuriesLookupIndex,
  playerId?: string | null,
  playerName?: string | null
): InjuryPlayerReportItem | null {
  if (playerId && index.byPlayerId.has(playerId)) {
    return index.byPlayerId.get(playerId) || null;
  }
  if (playerName) {
    const norm = normalizeInjuryLookupName(playerName);
    if (norm && index.byNormName.has(norm)) {
      return index.byNormName.get(norm) || null;
    }
  }
  return null;
}

export interface InjuryStatusVisualMeta {
  shortLabel: string;
  fullLabel: string;
  textClass: string;
  surfaceClass: string;
  borderClass: string;
  isUnavailable: boolean;
}

export function getInjuryStatusVisualMeta(
  statusCode: InjuryStatusCode
): InjuryStatusVisualMeta {
  switch (statusCode) {
    case 'out':
      return {
        shortLabel: 'OUT',
        fullLabel: 'Baja (Out)',
        textClass: 'text-rose-300',
        surfaceClass: 'bg-rose-500/12',
        borderClass: 'border-rose-500/35',
        isUnavailable: true,
      };
    case 'ir':
      return {
        shortLabel: 'IR',
        fullLabel: 'Larga duración (IR)',
        textClass: 'text-red-300',
        surfaceClass: 'bg-red-500/15',
        borderClass: 'border-red-500/40',
        isUnavailable: true,
      };
    case 'suspended':
      return {
        shortLabel: 'SUSP',
        fullLabel: 'Sancionado',
        textClass: 'text-fuchsia-300',
        surfaceClass: 'bg-fuchsia-500/12',
        borderClass: 'border-fuchsia-500/35',
        isUnavailable: true,
      };
    case 'doubtful':
      return {
        shortLabel: 'DUD',
        fullLabel: 'Dudoso (Doubtful)',
        textClass: 'text-orange-300',
        surfaceClass: 'bg-orange-500/12',
        borderClass: 'border-orange-500/35',
        isUnavailable: true,
      };
    case 'questionable':
      return {
        shortLabel: 'GTD',
        fullLabel: 'Cuestionable',
        textClass: 'text-amber-300',
        surfaceClass: 'bg-amber-500/12',
        borderClass: 'border-amber-500/35',
        isUnavailable: false,
      };
    case 'dtd':
      return {
        shortLabel: 'DTD',
        fullLabel: 'Día a día (DTD)',
        textClass: 'text-amber-200',
        surfaceClass: 'bg-amber-500/10',
        borderClass: 'border-amber-400/30',
        isUnavailable: false,
      };
    case 'probable':
    default:
      return {
        shortLabel: 'PROB',
        fullLabel: 'Probable',
        textClass: 'text-sky-300',
        surfaceClass: 'bg-sky-500/10',
        borderClass: 'border-sky-400/30',
        isUnavailable: false,
      };
  }
}

export function getImpactTierMeta(tier: TeamInjuryRotationImpact['impactTier']): {
  label: string;
  textClass: string;
} {
  switch (tier) {
    case 'critico':
      return { label: 'Impacto crítico', textClass: 'text-rose-400' };
    case 'alto':
      return { label: 'Impacto alto', textClass: 'text-orange-400' };
    case 'moderado':
      return { label: 'Impacto moderado', textClass: 'text-amber-300' };
    default:
      return { label: 'Impacto leve', textClass: 'text-slate-400' };
  }
}
