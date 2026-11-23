import type {
  NbaHeroicShotCountSummary,
  NbaHeroicShotEntry,
  NbaHeroicShotsResponse,
} from '../types/nba';
export { translatePlayDescriptionEs } from './heroicPlayEs';

const CLIENT_TTL_MS = 10 * 60 * 1000;

let cachedAllPayload: NbaHeroicShotsResponse | null = null;
let cachedAllExpiresAt = 0;
let inflightAllPromise: Promise<NbaHeroicShotsResponse> | null = null;

function resolveTargetSeasonLabel(seasonToken?: string): string | null {
  if (!seasonToken || seasonToken === 'all' || seasonToken === 'continuous') {
    return null;
  }
  const clean = seasonToken.trim();
  if (clean === '2027' || clean === '2026-27') return '2026-27';
  if (clean === '2026' || clean === '2025-26') return '2025-26';
  if (clean === '2025' || clean === '2024-25') return '2024-25';
  if (clean === '2024' || clean === '2023-24') return '2023-24';
  return clean;
}

function buildCountsFromItems(items: NbaHeroicShotEntry[]): {
  playerCounts: Record<string, NbaHeroicShotCountSummary>;
  teamCounts: Record<string, NbaHeroicShotCountSummary>;
} {
  const playerCounts: Record<string, NbaHeroicShotCountSummary> = {};
  const teamCounts: Record<string, NbaHeroicShotCountSummary> = {};

  const ensure = (
    map: Record<string, NbaHeroicShotCountSummary>,
    key: string
  ) => {
    if (!key) return null;
    if (!map[key]) {
      map[key] = { buzzerBeaters: 0, gameWinners: 0, otTyingBuzzers: 0 };
    }
    return map[key];
  };

  for (const shot of items) {
    const pBucket = ensure(playerCounts, String(shot.playerId || ''));
    const tIdBucket = ensure(teamCounts, String(shot.teamId || ''));
    const tAbbrBucket = ensure(
      teamCounts,
      String(shot.teamAbbr || '').toUpperCase()
    );
    const inc = (b: NbaHeroicShotCountSummary | null) => {
      if (!b) return;
      if (shot.shotType === 'buzzer_beater') {
        b.buzzerBeaters += 1;
        b.gameWinners += 1;
      } else if (shot.shotType === 'game_winner') {
        b.gameWinners += 1;
      } else if (shot.shotType === 'ot_tying_buzzer') {
        b.otTyingBuzzers += 1;
      }
    };
    inc(pBucket);
    inc(tIdBucket);
    inc(tAbbrBucket);
  }

  return { playerCounts, teamCounts };
}

function sliceHeroicResponseForSeason(
  allPayload: NbaHeroicShotsResponse,
  seasonToken?: string
): NbaHeroicShotsResponse {
  const targetLabel = resolveTargetSeasonLabel(seasonToken);
  if (!targetLabel) {
    return allPayload;
  }
  const filteredItems = (allPayload.items || []).filter(
    (item) => item.seasonLabel === targetLabel
  );
  const { playerCounts, teamCounts } = buildCountsFromItems(filteredItems);
  return {
    season: targetLabel,
    generatedAt: allPayload.generatedAt,
    totalEvents: filteredItems.length,
    items: filteredItems,
    playerCounts,
    teamCounts,
  };
}

/**
 * Cliente compartido con caché en memoria y deduplicación en vuelo:
 * consulta el archivo completo (`season=all`) una única vez y filtra cualquier temporada en cliente,
 * evitando peticiones repetidas entre Equipos, Jugadores, Explorador Analítico y Buzzer Beaters.
 */
export async function fetchSharedHeroicShots(
  seasonToken?: string,
  forceRefresh = false
): Promise<NbaHeroicShotsResponse> {
  const now = Date.now();
  if (!forceRefresh && cachedAllPayload && cachedAllExpiresAt > now) {
    return sliceHeroicResponseForSeason(cachedAllPayload, seasonToken);
  }

  if (!forceRefresh && inflightAllPromise) {
    const res = await inflightAllPromise;
    return sliceHeroicResponseForSeason(res, seasonToken);
  }

  const runFetch = async (): Promise<NbaHeroicShotsResponse> => {
    const params = new URLSearchParams({ season: 'all' });
    if (forceRefresh) params.set('refresh', '1');
    const res = await fetch(`/api/nba/advanced/heroic-shots?${params.toString()}`);
    if (!res.ok) {
      throw new Error(
        'No se pudo cargar el archivo histórico de Buzzer Beaters y Game Winners.'
      );
    }
    const json = (await res.json()) as NbaHeroicShotsResponse;
    cachedAllPayload = json;
    cachedAllExpiresAt = Date.now() + CLIENT_TTL_MS;
    return json;
  };

  if (forceRefresh) {
    const fresh = await runFetch();
    return sliceHeroicResponseForSeason(fresh, seasonToken);
  }

  inflightAllPromise = runFetch().finally(() => {
    inflightAllPromise = null;
  });

  const payload = await inflightAllPromise;
  return sliceHeroicResponseForSeason(payload, seasonToken);
}
