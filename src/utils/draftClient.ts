import type {
  DraftHistoryPayload,
  DraftPickTier,
  FutureDraftPickCategory,
  FutureDraftPicksPayload,
} from '../types/nba';

let cachedPayload: { data: DraftHistoryPayload; fetchedAt: number } | null = null;
let inFlightPromise: Promise<DraftHistoryPayload> | null = null;
let cachedFuturePayload: { data: FutureDraftPicksPayload; fetchedAt: number } | null = null;
let inFlightFuturePromise: Promise<FutureDraftPicksPayload> | null = null;
const CLIENT_TTL_MS = 15 * 60 * 1000;

export function peekCachedDraftHistoryClient(): DraftHistoryPayload | null {
  if (!cachedPayload) return null;
  if (Date.now() - cachedPayload.fetchedAt > CLIENT_TTL_MS) return null;
  return cachedPayload.data;
}

export async function fetchDraftHistoryClient(
  forceRefresh = false
): Promise<DraftHistoryPayload> {
  if (!forceRefresh) {
    const peek = peekCachedDraftHistoryClient();
    if (peek) return peek;
    if (inFlightPromise) return inFlightPromise;
  }

  const url = forceRefresh
    ? '/api/nba/draft/history?refresh=1'
    : '/api/nba/draft/history';
  const req = fetch(url)
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error || 'No se pudo cargar el archivo histórico del Draft NBA.'
        );
      }
      const data = (await res.json()) as DraftHistoryPayload;
      cachedPayload = { data, fetchedAt: Date.now() };
      return data;
    })
    .finally(() => {
      inFlightPromise = null;
    });

  inFlightPromise = req;
  return req;
}

export function peekCachedFutureDraftPicksClient(): FutureDraftPicksPayload | null {
  if (!cachedFuturePayload) return null;
  if (Date.now() - cachedFuturePayload.fetchedAt > CLIENT_TTL_MS) return null;
  const samplePick = cachedFuturePayload.data.teams?.[0]?.picks?.[0];
  if (samplePick && !samplePick.explanationEs) return null;
  return cachedFuturePayload.data;
}

export async function fetchFutureDraftPicksClient(
  forceRefresh = false
): Promise<FutureDraftPicksPayload> {
  if (!forceRefresh) {
    const peek = peekCachedFutureDraftPicksClient();
    if (peek) return peek;
    if (inFlightFuturePromise) return inFlightFuturePromise;
  }

  const url = forceRefresh
    ? '/api/nba/draft/future-picks?refresh=1'
    : '/api/nba/draft/future-picks';
  const req = fetch(url)
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error || 'No se pudo cargar el inventario de rondas futuras.'
        );
      }
      const data = (await res.json()) as FutureDraftPicksPayload;
      cachedFuturePayload = { data, fetchedAt: Date.now() };
      return data;
    })
    .finally(() => {
      inFlightFuturePromise = null;
    });

  inFlightFuturePromise = req;
  return req;
}

export function getFuturePickCategoryMeta(category: FutureDraftPickCategory): {
  label: string;
  shortLabel: string;
  textClass: string;
  bgClass: string;
} {
  switch (category) {
    case 'own':
      return {
        label: 'Propia sin cargas',
        shortLabel: 'Propia',
        textClass: 'text-emerald-300',
        bgClass: 'bg-emerald-500/15 border-emerald-500/35',
      };
    case 'incoming':
      return {
        label: 'Recibida de otra franquicia',
        shortLabel: 'Recibida',
        textClass: 'text-sky-300',
        bgClass: 'bg-sky-500/15 border-sky-500/35',
      };
    case 'swap_favorable':
      return {
        label: 'Derecho de Swap favorable',
        shortLabel: 'Swap +',
        textClass: 'text-amber-300',
        bgClass: 'bg-amber-500/15 border-amber-500/35',
      };
    case 'swap_encumbered':
      return {
        label: 'Sujeta a intercambio (Swap −) de otro equipo',
        shortLabel: 'Swap −',
        textClass: 'text-orange-300',
        bgClass: 'bg-orange-500/15 border-orange-500/35',
      };
    case 'outgoing':
    default:
      return {
        label: 'Traspasada / Cedida',
        shortLabel: 'Cedida',
        textClass: 'text-rose-300',
        bgClass: 'bg-rose-500/15 border-rose-500/30',
      };
  }
}

export function getDraftTierMeta(tier: DraftPickTier): {
  labelEs: string;
  shortLabel: string;
  textClass: string;
  borderClass: string;
} {
  switch (tier) {
    case 'lottery':
      return {
        labelEs: 'Lotería (Top 14)',
        shortLabel: 'Lotería',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-400/35',
      };
    case 'first_round':
      return {
        labelEs: '1ª Ronda (15–30)',
        shortLabel: '1ª Ronda',
        textClass: 'text-sky-300',
        borderClass: 'border-sky-400/35',
      };
    case 'second_round':
    default:
      return {
        labelEs: '2ª Ronda (31+)',
        shortLabel: '2ª Ronda',
        textClass: 'text-emerald-400',
        borderClass: 'border-emerald-400/35',
      };
  }
}

export function formatDraftTradeNoteEs(note: string | null | undefined): string {
  const raw = String(note || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^Rights traded to /i, 'Derechos traspasados a ')
    .replace(/^Traded to /i, 'Traspasado a ')
    .replace(/^Draft rights traded to /i, 'Derechos traspasados a ')
    .replace(/^From /i, 'Vía ');
}

