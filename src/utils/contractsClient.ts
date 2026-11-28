import type {
  CbaTeamTier,
  ContractEfficiencyTier,
  LeagueContractsPayload,
  PlayerContractRecord,
  TeamCapSheet,
} from '../types/nba';

let cachedPayload: { data: LeagueContractsPayload; fetchedAt: number } | null = null;
let inFlightPromise: Promise<LeagueContractsPayload> | null = null;
const CLIENT_TTL_MS = 15 * 60 * 1000;

export function peekCachedContractsClient(): LeagueContractsPayload | null {
  if (!cachedPayload) return null;
  if (Date.now() - cachedPayload.fetchedAt > CLIENT_TTL_MS) return null;
  return cachedPayload.data;
}

export async function fetchLeagueContractsClient(
  forceRefresh = false
): Promise<LeagueContractsPayload> {
  if (!forceRefresh) {
    const peek = peekCachedContractsClient();
    if (peek) return peek;
    if (inFlightPromise) return inFlightPromise;
  }

  const url = forceRefresh ? '/api/nba/contracts?refresh=1' : '/api/nba/contracts';
  const req = fetch(url)
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error || 'No se pudieron cargar las nóminas y contratos NBA.'
        );
      }
      const data = (await res.json()) as LeagueContractsPayload;
      cachedPayload = { data, fetchedAt: Date.now() };
      return data;
    })
    .finally(() => {
      inFlightPromise = null;
    });

  inFlightPromise = req;
  return req;
}

export function formatSalaryShort(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return '—';
  const sign = usd < 0 ? '-' : '';
  const abs = Math.abs(usd);
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(abs >= 100_000_000 ? 1 : 2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${Math.round(abs / 1_000)}K`;
  }
  return `${sign}$${Math.round(abs)}`;
}

export function formatSalaryCompact(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return '—';
  const sign = usd < 0 ? '-' : '';
  const abs = Math.abs(usd);
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  return formatSalaryShort(usd);
}

export function formatSignedSalaryShort(usd: number): string {
  if (!Number.isFinite(usd) || Math.abs(usd) < 500) return '$0';
  const prefix = usd > 0 ? '+' : '-';
  const abs = Math.abs(usd);
  if (abs >= 1_000_000) {
    return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  return `${prefix}$${Math.round(abs / 1_000)}K`;
}

export function formatSalaryExact(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(usd);
}

export interface CbaTierVisualMeta {
  tier: CbaTeamTier;
  shortLabel: string;
  labelEs: string;
  textClass: string;
  barClass: string;
  borderClass: string;
  accentHex: string;
  summaryEs: string;
}

export function getCbaTierVisualMeta(tier: CbaTeamTier): CbaTierVisualMeta {
  switch (tier) {
    case 'second_apron':
      return {
        tier,
        shortLabel: '2º Apron',
        labelEs: 'Sobre 2º Apron',
        textClass: 'text-rose-400',
        barClass: 'bg-rose-500',
        borderClass: 'border-rose-500/40',
        accentHex: '#FB7185',
        summaryEs:
          'Nivel máximo de restricción CBA: emparejamiento 100%, sin agregación de contratos ni MLE.',
      };
    case 'first_apron':
      return {
        tier,
        shortLabel: '1er Apron',
        labelEs: 'Sobre 1er Apron',
        textClass: 'text-orange-400',
        barClass: 'bg-orange-500',
        borderClass: 'border-orange-500/40',
        accentHex: '#FB923C',
        summaryEs:
          'Bloqueo al 100% en traspasos entrantes, sin Sign-and-Trade recibidos ni TPE previas.',
      };
    case 'luxury_tax':
      return {
        tier,
        shortLabel: 'Luxury Tax',
        labelEs: 'Impuesto de Lujo',
        textClass: 'text-amber-300',
        barClass: 'bg-amber-400',
        borderClass: 'border-amber-400/35',
        accentHex: '#FBBF24',
        summaryEs:
          'Paga impuesto de lujo progresivo; aún conserva margen antes de las trabas del 1er Apron.',
      };
    case 'over_cap':
      return {
        tier,
        shortLabel: 'Sobre el Cap',
        labelEs: 'Sobre el Cap (No Tax)',
        textClass: 'text-sky-300',
        barClass: 'bg-sky-400',
        borderClass: 'border-sky-400/35',
        accentHex: '#38BDF8',
        summaryEs:
          'Por encima del tope salarial pero fuera del impuesto; acceso pleno a Non-Tax MLE y BAE.',
      };
    case 'under_cap':
      return {
        tier,
        shortLabel: 'Cap Space',
        labelEs: 'Bajo el Salary Cap',
        textClass: 'text-emerald-400',
        barClass: 'bg-emerald-400',
        borderClass: 'border-emerald-400/35',
        accentHex: '#34D399',
        summaryEs:
          'Espacio salarial directo para absorber contratos en traspasos o firmar agentes libres.',
      };
    case 'under_floor':
    default:
      return {
        tier: 'under_floor',
        shortLabel: 'Bajo Suelo',
        labelEs: 'Bajo Suelo Salarial (90%)',
        textClass: 'text-teal-300',
        barClass: 'bg-teal-400',
        borderClass: 'border-teal-400/35',
        accentHex: '#2DD4BF',
        summaryEs:
          'Amplio espacio bajo el tope; debe alcanzar el 90% del Cap al cierre para cobrar reparto fiscal.',
      };
  }
}

export function getEfficiencyTierMeta(tier: ContractEfficiencyTier): {
  label: string;
  textClass: string;
} {
  switch (tier) {
    case 'ganga':
      return { label: 'Ganga', textClass: 'text-emerald-400' };
    case 'alto_valor':
      return { label: 'Alto valor', textClass: 'text-sky-300' };
    case 'acorde':
      return { label: 'Acorde', textClass: 'text-slate-300' };
    case 'sobrecoste':
      return { label: 'Sobrecoste', textClass: 'text-rose-400' };
    case 'muestra_baja':
    default:
      return { label: 'Muestra baja', textClass: 'text-slate-500' };
  }
}

export interface ContractsLookupIndex {
  byPlayerId: Map<string, PlayerContractRecord>;
  byTeamAbbr: Map<string, TeamCapSheet>;
}

export function buildContractsLookupIndex(
  payload: LeagueContractsPayload | null | undefined
): ContractsLookupIndex {
  const byPlayerId = new Map<string, PlayerContractRecord>();
  const byTeamAbbr = new Map<string, TeamCapSheet>();
  if (!payload) return { byPlayerId, byTeamAbbr };
  for (const team of payload.teams || []) {
    byTeamAbbr.set(team.teamAbbr.toUpperCase(), team);
    for (const p of team.players || []) {
      if (p.playerId) byPlayerId.set(p.playerId, p);
    }
  }
  return { byPlayerId, byTeamAbbr };
}
