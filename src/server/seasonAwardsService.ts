// @ts-nocheck
import { NBA_TEAMS_MAP } from '../utils/teamLogos.ts';

const NBA_ABBR_TO_ESPN_SLUG = {
  ATL: 'atl',
  BOS: 'bos',
  BKN: 'bkn',
  CHA: 'cha',
  CHI: 'chi',
  CLE: 'cle',
  DAL: 'dal',
  DEN: 'den',
  DET: 'det',
  GSW: 'gs',
  HOU: 'hou',
  IND: 'ind',
  LAC: 'lac',
  LAL: 'lal',
  MEM: 'mem',
  MIA: 'mia',
  MIL: 'mil',
  MIN: 'min',
  NOP: 'no',
  NYK: 'ny',
  OKC: 'okc',
  ORL: 'orl',
  PHI: 'phi',
  PHX: 'phx',
  POR: 'por',
  SAC: 'sac',
  SAS: 'sa',
  TOR: 'tor',
  UTA: 'utah',
  WAS: 'wsh',
};

function round1(val) {
  return Math.round((Number(val) || 0) * 10) / 10;
}

function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function meanNums(arr) {
  if (!arr || arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function normalizeLookupName(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatSigned1(val) {
  const r = round1(val);
  return r > 0 ? `+${r.toFixed(1)}` : r.toFixed(1);
}

let espnRosterExperienceCache = null;
let espnRosterInflight = null;

async function fetchJsonShortTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function getEspnRosterExperienceMap(forceRefresh = false, timeoutMs = 2400) {
  if (
    !forceRefresh &&
    espnRosterExperienceCache &&
    espnRosterExperienceCache.expiresAt > Date.now()
  ) {
    return espnRosterExperienceCache.byNormName;
  }
  if (!forceRefresh && espnRosterInflight) {
    return espnRosterInflight;
  }

  const run = (async () => {
    const byNormName = new Map();
    const entries = Object.entries(NBA_ABBR_TO_ESPN_SLUG);
    const settled = await Promise.allSettled(
      entries.map(async ([nbaAbbr, espnSlug]) => {
        const data = await fetchJsonShortTimeout(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnSlug}/roster`,
          timeoutMs
        );
        const rawAthletes = Array.isArray(data?.athletes) ? data.athletes : [];
        const flatAthletes = [];
        for (const item of rawAthletes) {
          if (Array.isArray(item?.items)) {
            flatAthletes.push(...item.items);
          } else if (item && typeof item === 'object') {
            flatAthletes.push(item);
          }
        }
        return { nbaAbbr, flatAthletes };
      })
    );

    let teamsResolved = 0;
    for (const s of settled) {
      if (s.status !== 'fulfilled') continue;
      teamsResolved++;
      const { nbaAbbr, flatAthletes } = s.value;
      for (const ath of flatAthletes) {
        const displayName = String(ath?.fullName || ath?.displayName || '').trim();
        const norm = normalizeLookupName(displayName);
        if (!norm) continue;
        const expRaw = ath?.experience?.years;
        const experienceYears =
          typeof expRaw === 'number' && Number.isFinite(expRaw) ? expRaw : null;
        const debutYear = Number(ath?.debutYear) || null;
        const jersey = String(ath?.jersey ?? '').trim();
        const position = String(ath?.position?.abbreviation || '').trim();
        const dobRaw = String(ath?.dateOfBirth || '').trim();
        const dobYearMatch = dobRaw.match(/^(\d{4})-/);
        const birthYear = dobYearMatch ? Number(dobYearMatch[1]) : null;
        const country = String(ath?.birthPlace?.country || '').trim();
        byNormName.set(norm, {
          displayName,
          teamAbbr: nbaAbbr,
          experienceYears,
          debutYear,
          jersey,
          position,
          birthYear,
          country,
        });
      }
    }

    if (teamsResolved >= 15) {
      espnRosterExperienceCache = {
        expiresAt: Date.now() + 6 * 60 * 60 * 1000,
        byNormName,
      };
    } else if (espnRosterExperienceCache) {
      return espnRosterExperienceCache.byNormName;
    }
    return byNormName;
  })();

  espnRosterInflight = run;
  try {
    return await run;
  } finally {
    espnRosterInflight = null;
  }
}

export async function enrichBiosWithEspnRosters(biosMap, options = {}) {
  try {
    const expMap = await getEspnRosterExperienceMap(
      Boolean(options.forceRefresh),
      options.timeoutMs ?? 4500
    );
    if (!expMap || expMap.size === 0) return 0;
    let updatedCount = 0;
    for (const bio of biosMap.values()) {
      const norm = normalizeLookupName(bio.name);
      const hit = expMap.get(norm);
      if (!hit) continue;
      if (typeof hit.experienceYears === 'number') {
        bio.experienceYears = hit.experienceYears;
        if (!bio.fromYear) {
          bio.fromYear = 2026 - hit.experienceYears;
        }
      }
      if (hit.debutYear && !bio.fromYear) {
        bio.fromYear = hit.debutYear;
      }
      if (hit.birthYear && !bio.birthYear) {
        bio.birthYear = hit.birthYear;
      }
      if (hit.country && !bio.country) {
        bio.country = hit.country;
      }
      if (options.updateActiveTeams && hit.teamAbbr && NBA_TEAMS_MAP[hit.teamAbbr]) {
        bio.teamAbbr = hit.teamAbbr;
        bio.teamId = NBA_TEAMS_MAP[hit.teamAbbr].id;
        if (hit.jersey) bio.jersey = hit.jersey;
        if (hit.position) bio.position = hit.position;
      }
      updatedCount++;
    }
    return updatedCount;
  } catch {
    return 0;
  }
}

function detectPlayerActiveStreak(games) {
  if (!games || games.length < 3) {
    return { label: null, count: 0 };
  }
  const rules = [
    { label: '30+ PTS', min: 3, check: (g) => g.points >= 30 },
    { label: '25+ PTS', min: 3, check: (g) => g.points >= 25 },
    {
      label: 'Doble-Doble',
      min: 3,
      check: (g) => {
        const cats =
          (g.points >= 10 ? 1 : 0) +
          (g.rebounds >= 10 ? 1 : 0) +
          (g.assists >= 10 ? 1 : 0) +
          (g.steals >= 10 ? 1 : 0) +
          (g.blocks >= 10 ? 1 : 0);
        return cats >= 2;
      },
    },
    { label: '20+ PTS', min: 4, check: (g) => g.points >= 20 },
    { label: '10+ AST', min: 3, check: (g) => g.assists >= 10 },
    { label: '10+ REB', min: 4, check: (g) => g.rebounds >= 10 },
    { label: '3+ ROB+TAP', min: 3, check: (g) => g.stocks >= 3 },
    { label: 'GmSc 20+', min: 3, check: (g) => g.gameScore >= 20 },
    { label: '15+ PTS', min: 5, check: (g) => g.points >= 15 },
    { label: '2+ ROB+TAP', min: 4, check: (g) => g.stocks >= 2 },
  ];

  let best = { label: null, count: 0, priorityScore: 0 };
  rules.forEach((rule, idx) => {
    let c = 0;
    for (const g of games) {
      if (rule.check(g)) c++;
      else break;
    }
    if (c >= rule.min) {
      const score = c * 10 - idx * 1.4;
      if (score > best.priorityScore) {
        best = { label: `${c} PJ · ${rule.label}`, count: c, priorityScore: score };
      }
    }
  });

  return { label: best.label, count: best.count };
}

function inferSeasonGamesStartedMap(playersList) {
  // Reconstruye titularidades (GS) combinando banderas reales isStarter de CDN/ESPN
  // con reconstrucción de quintetos por partido (5 titulares por equipo y encuentro)
  // para actas históricas sin campo explícito.
  const seasonAvgMinsByPlayerTeam = new Map();
  const gameSideEntries = new Map();

  for (const p of playersList) {
    const minsByTeam = new Map();
    for (const g of p.games || []) {
      const tAbbr = g.teamAbbr || p.teamAbbr;
      const arr = minsByTeam.get(tAbbr) || [];
      arr.push(g.minutes);
      minsByTeam.set(tAbbr, arr);

      const sideKey = `${g.eventId}:${tAbbr}`;
      const bucket = gameSideEntries.get(sideKey) || [];
      bucket.push({ playerId: p.id, game: g });
      gameSideEntries.set(sideKey, bucket);
    }
    for (const [tAbbr, arr] of minsByTeam.entries()) {
      seasonAvgMinsByPlayerTeam.set(`${p.id}:${tAbbr}`, meanNums(arr));
    }
  }

  const startedCounts = new Map();
  for (const [sideKey, entries] of gameSideEntries.entries()) {
    const tAbbr = sideKey.split(':')[1] || '';
    const explicitStarters = entries.filter((e) => e.game.isStarter === true);
    const explicitBench = new Set(
      entries.filter((e) => e.game.isStarter === false).map((e) => e.playerId)
    );

    const chosenStarterIds = new Set(explicitStarters.map((e) => e.playerId));
    if (chosenStarterIds.size < 5) {
      const candidates = entries
        .filter((e) => !chosenStarterIds.has(e.playerId) && !explicitBench.has(e.playerId))
        .sort((a, b) => {
          const baseA = seasonAvgMinsByPlayerTeam.get(`${a.playerId}:${tAbbr}`) || a.game.minutes;
          const baseB = seasonAvgMinsByPlayerTeam.get(`${b.playerId}:${tAbbr}`) || b.game.minutes;
          const scoreA = baseA * 0.65 + a.game.minutes * 0.35;
          const scoreB = baseB * 0.65 + b.game.minutes * 0.35;
          return scoreB - scoreA;
        });

      for (const cand of candidates) {
        if (chosenStarterIds.size >= 5) break;
        chosenStarterIds.add(cand.playerId);
      }
    }

    for (const pid of chosenStarterIds) {
      startedCounts.set(pid, (startedCounts.get(pid) || 0) + 1);
    }
  }

  const result = new Map();
  for (const p of playersList) {
    const gp = p.games?.length || 0;
    const explicitGs = p.advanced?.gamesStarted;
    const inferredGs = startedCounts.get(p.id) || 0;
    const gs =
      typeof explicitGs === 'number' && Number.isFinite(explicitGs)
        ? clamp(Math.round(explicitGs), 0, gp)
        : clamp(inferredGs, 0, gp);
    result.set(p.id, gs);
  }
  return result;
}

function parseScoreMargin(scoreDisplay) {
  const m = String(scoreDisplay || '').match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  return Math.abs(Number(m[1]) - Number(m[2]));
}

function isPlayerEligibleRookie({
  player,
  seasonScope,
  s2026PlayersById,
  biosMap,
  espnExpMap,
}) {
  const pid = String(player.id || '');
  const bio = biosMap.get(pid);
  const normName = normalizeLookupName(player.name);
  const espnHit = espnExpMap?.get(normName);

  if (seasonScope === '2027') {
    const prev26 = s2026PlayersById.get(pid);
    if (prev26 && Array.isArray(prev26.games) && prev26.games.length > 0) {
      return false;
    }
    if (typeof bio?.fromYear === 'number' && bio.fromYear > 0) {
      return bio.fromYear >= 2026;
    }
    if (typeof bio?.experienceYears === 'number' && bio.experienceYears >= 0) {
      return bio.experienceYears === 0;
    }
    if (espnHit && typeof espnHit.experienceYears === 'number' && espnHit.experienceYears >= 0) {
      return espnHit.experienceYears === 0;
    }
    if (espnHit && espnHit.debutYear) {
      return espnHit.debutYear >= 2026;
    }
    // Guardia numérica sobre ID oficial NBA.com para descartar veteranos lesionados el año previo
    const numId = Number(pid);
    if (Number.isFinite(numId) && numId > 0) {
      return numId >= 1642600;
    }
    return pid.startsWith('espn_');
  }

  // Temporada 2025-26
  if (typeof bio?.fromYear === 'number' && bio.fromYear > 0) {
    return bio.fromYear === 2025;
  }
  if (typeof bio?.experienceYears === 'number' && bio.experienceYears >= 0) {
    return bio.experienceYears === 1;
  }
  if (espnHit && espnHit.debutYear) {
    return espnHit.debutYear === 2025;
  }
  if (espnHit && typeof espnHit.experienceYears === 'number' && espnHit.experienceYears >= 0) {
    return espnHit.experienceYears === 1;
  }
  const numId = Number(pid);
  return Number.isFinite(numId) && numId >= 1642200 && numId < 1643100;
}

const awardsCache = new Map();

export async function buildSeasonAwardsPayload({
  full,
  biosMap,
  seasonScope = '2027',
  forceRefresh = false,
}) {
  const cacheKey = seasonScope === '2026' ? '2026' : '2027';
  const hit = awardsCache.get(cacheKey);
  if (!forceRefresh && hit && hit.expiresAt > Date.now()) {
    return hit.payload;
  }

  const espnExpMap = await getEspnRosterExperienceMap(forceRefresh, 2400);

  const activeDs = seasonScope === '2026' ? full.s2026 : full.s2027;
  const seasonLabel = seasonScope === '2026' ? '2025-26' : '2026-27';
  const teamsMap = activeDs.teamsByAbbr;
  const playersList = [...activeDs.playersById.values()].filter(
    (p) => Array.isArray(p.games) && p.games.length > 0 && NBA_TEAMS_MAP[p.teamAbbr]
  );

  const teamsList = [...teamsMap.values()];
  const avgTeamGamesPlayed = Math.max(
    1,
    Math.round(meanNums(teamsList.map((t) => t.games?.length || 0)))
  );

  // Mapa rápido de márgenes por partido para cálculo exacto de Clutch (finales <= 5 pts)
  const closeEventMarginMap = new Map();
  const teamClutchGamesCount = new Map();
  for (const tm of teamsList) {
    let cCount = 0;
    for (const tg of tm.games || []) {
      const margin = Math.abs(Number(tg.differential) || 0);
      closeEventMarginMap.set(tg.eventId, margin);
      if (margin <= 5) cCount++;
    }
    teamClutchGamesCount.set(tm.abbreviation, cCount);
  }

  // Ranking defensivo de equipos para contextualizar DPOY
  const teamDefRtgByAbbr = new Map();
  for (const tm of teamsList) {
    const drtg =
      tm.advanced?.defRtg && tm.advanced.defRtg > 0
        ? tm.advanced.defRtg
        : tm.games?.length > 0
        ? round1(meanNums(tm.games.map((g) => g.defRtg)))
        : 114.0;
    teamDefRtgByAbbr.set(tm.abbreviation, drtg);
  }

  const gsByPlayerId = inferSeasonGamesStartedMap(playersList);

  const profiles = [];

  for (const p of playersList) {
    const games = p.games;
    const gp = games.length;
    const tm = teamsMap.get(p.teamAbbr);
    const teamGp = Math.max(1, tm?.games?.length || avgTeamGamesPlayed);
    const isCompletedSeason = teamGp >= 80;
    const projectedGames82 = isCompletedSeason
      ? gp
      : clamp(Math.round((gp / teamGp) * 82), gp, 82);

    const gs = gsByPlayerId.get(p.id) ?? 0;
    const benchGames = Math.max(0, gp - gs);

    const minutesAvg = round1(meanNums(games.map((g) => g.minutes)));
    if (minutesAvg < 10) continue;

    const ptsAvg = round1(meanNums(games.map((g) => g.points)));
    const rebAvg = round1(meanNums(games.map((g) => g.rebounds)));
    const orebAvg = round1(meanNums(games.map((g) => g.oreb)));
    const drebAvg = round1(meanNums(games.map((g) => g.dreb)));
    const astAvg = round1(meanNums(games.map((g) => g.assists)));
    const stlAvg = round1(meanNums(games.map((g) => g.steals)));
    const blkAvg = round1(meanNums(games.map((g) => g.blocks)));
    const stocksAvg = round1(stlAvg + blkAvg);
    const tovAvg = round1(meanNums(games.map((g) => g.turnovers)));
    const praAvg = round1(ptsAvg + rebAvg + astAvg);
    const gmScAvg = round1(meanNums(games.map((g) => g.gameScore)));
    const plusMinusAvg = round1(meanNums(games.map((g) => g.plusMinus)));

    const totalPts = games.reduce((s, g) => s + g.points, 0);
    const totalFgm = games.reduce((s, g) => s + g.fgm, 0);
    const totalFg3m = games.reduce((s, g) => s + g.fg3m, 0);
    const totalFga = games.reduce((s, g) => s + g.fga, 0);
    const totalFta = games.reduce((s, g) => s + g.fta, 0);
    const tsDenom = 2 * (totalFga + 0.44 * totalFta);
    const tsPct = tsDenom > 0 ? round1((totalPts / tsDenom) * 100) : round1(meanNums(games.map((g) => g.tsPct)));
    const efgPct = totalFga > 0 ? round1(((totalFgm + 0.5 * totalFg3m) / totalFga) * 100) : round1(meanNums(games.map((g) => g.efgPct)));

    const netRtg =
      p.advanced?.netRtg !== undefined
        ? round1(p.advanced.netRtg)
        : round1(plusMinusAvg * 2.1);

    // Desviación reciente (Últ. 5 partidos vs media de temporada)
    const recentSlice = games.slice(0, Math.min(5, gp));
    const recentWindowGames = recentSlice.length;
    const recentPtsAvg = round1(meanNums(recentSlice.map((g) => g.points)));
    const recentPtsDelta = round1(recentPtsAvg - ptsAvg);
    const recentGmScAvg = round1(meanNums(recentSlice.map((g) => g.gameScore)));
    const recentGmScDelta = round1(recentGmScAvg - gmScAvg);
    const recentStocksAvg = round1(meanNums(recentSlice.map((g) => g.stocks)));
    const recentStocksDelta = round1(recentStocksAvg - stocksAvg);

    let momentumTone = 'neutral';
    let momentumLabel = 'Ritmo estable';
    if (gp >= 4 && (recentGmScDelta >= 1.8 || recentPtsDelta >= 2.8)) {
      momentumTone = 'positive';
      momentumLabel = `En alza (${formatSigned1(recentPtsDelta)} PTS últ. ${recentWindowGames})`;
    } else if (gp >= 4 && (recentGmScDelta <= -1.8 || recentPtsDelta <= -2.8)) {
      momentumTone = 'negative';
      momentumLabel = `En bache (${formatSigned1(recentPtsDelta)} PTS últ. ${recentWindowGames})`;
    }

    const streak = detectPlayerActiveStreak(games);

    // Partidos Clutch (decididos por <= 5 puntos)
    const clutchLogs = games.filter((g) => {
      const m = closeEventMarginMap.get(g.eventId) ?? parseScoreMargin(g.scoreDisplay);
      return m !== null && m <= 5;
    });
    const clutchGames = clutchLogs.length;
    const clutchWins = clutchLogs.filter((g) => g.result === 'W').length;
    const clutchLosses = clutchGames - clutchWins;
    const clutchPtsAvg = clutchGames > 0 ? round1(meanNums(clutchLogs.map((g) => g.points))) : 0;
    const clutchAstAvg = clutchGames > 0 ? round1(meanNums(clutchLogs.map((g) => g.assists))) : 0;
    const clutchGmScAvg = clutchGames > 0 ? round1(meanNums(clutchLogs.map((g) => g.gameScore))) : 0;
    const clutchPlusMinusAvg =
      clutchGames > 0 ? round1(meanNums(clutchLogs.map((g) => g.plusMinus))) : 0;
    const cPtsSum = clutchLogs.reduce((s, g) => s + g.points, 0);
    const cFgaSum = clutchLogs.reduce((s, g) => s + g.fga, 0);
    const cFtaSum = clutchLogs.reduce((s, g) => s + g.fta, 0);
    const cTsDenom = 2 * (cFgaSum + 0.44 * cFtaSum);
    const clutchTsPct = cTsDenom > 0 ? round1((cPtsSum / cTsDenom) * 100) : 0;

    // Métricas Hustle (oficiales NBA.com cuando disponibles + respaldo proporcional desde boxscore)
    const adv = p.advanced;
    const hasOfficialHustle =
      adv &&
      (adv.deflections > 0 || adv.contestedShots > 0 || adv.looseBalls > 0 || adv.boxOuts > 0);
    const deflectionsAvg = hasOfficialHustle
      ? round1(adv.deflections)
      : round1(stlAvg * 1.85 + blkAvg * 0.25);
    const contestedShotsAvg = hasOfficialHustle
      ? round1(adv.contestedShots)
      : round1(blkAvg * 3.4 + drebAvg * 0.55 + stlAvg * 0.7);
    const looseBallsAvg = hasOfficialHustle
      ? round1(adv.looseBalls)
      : round1(stlAvg * 0.55 + orebAvg * 0.28);
    const screenAssistsAvg = hasOfficialHustle
      ? round1(adv.screenAssists)
      : round1(orebAvg * 0.85 + blkAvg * 0.45);
    const boxOutsAvg = hasOfficialHustle
      ? round1(adv.boxOuts)
      : round1(orebAvg * 0.75 + drebAvg * 0.28);
    const foulsDrawnAvg =
      adv && adv.foulsDrawn > 0
        ? round1(adv.foulsDrawn)
        : round1((totalFta / Math.max(1, gp)) * 0.78);

    const teamWins = tm?.wins ?? 0;
    const teamLosses = tm?.losses ?? 0;
    const teamWinPct = tm?.winPct ?? 0.5;
    const conference = tm?.conference ?? 'Oeste';
    const conferenceSeed = tm?.playoffSeed ?? 8;
    const teamDefRtg = teamDefRtgByAbbr.get(p.teamAbbr) ?? 114.0;
    const playerDefRtg = adv?.defRtg && adv.defRtg > 0 ? round1(adv.defRtg) : round1(teamDefRtg - stocksAvg * 0.7);

    const isRookie = isPlayerEligibleRookie({
      player: p,
      seasonScope,
      s2026PlayersById: full.s2026.playersById,
      biosMap,
      espnExpMap,
    });

    profiles.push({
      p,
      gp,
      teamGp,
      projectedGames82,
      gs,
      benchGames,
      minutesAvg,
      ptsAvg,
      rebAvg,
      orebAvg,
      drebAvg,
      astAvg,
      stlAvg,
      blkAvg,
      stocksAvg,
      tovAvg,
      praAvg,
      gmScAvg,
      plusMinusAvg,
      tsPct,
      efgPct,
      netRtg,
      pie: adv?.pie || 0,
      recentWindowGames,
      recentPtsAvg,
      recentPtsDelta,
      recentGmScAvg,
      recentGmScDelta,
      recentStocksDelta,
      momentumTone,
      momentumLabel,
      streak,
      clutchGames,
      clutchWins,
      clutchLosses,
      clutchPtsAvg,
      clutchAstAvg,
      clutchGmScAvg,
      clutchPlusMinusAvg,
      clutchTsPct,
      deflectionsAvg,
      contestedShotsAvg,
      looseBallsAvg,
      screenAssistsAvg,
      boxOutsAvg,
      foulsDrawnAvg,
      hasOfficialHustle: Boolean(hasOfficialHustle),
      teamWins,
      teamLosses,
      teamWinPct,
      conference,
      conferenceSeed,
      teamDefRtg,
      playerDefRtg,
      isRookie,
    });
  }

  const makeEntry = (prof, scoreParts, extras) => {
    const production = round1(clamp(scoreParts.production, 0, 48));
    const efficiencyImpact = round1(clamp(scoreParts.efficiencyImpact, 0, 26));
    const teamContext = round1(clamp(scoreParts.teamContext, 0, 18));
    const momentum = round1(clamp(scoreParts.momentum, 0, 14));
    const awardScore = round1(clamp(production + efficiencyImpact + teamContext + momentum, 1, 99.8));

    return {
      playerId: prof.p.id,
      playerName: prof.p.name,
      teamId: prof.p.teamId,
      teamAbbr: prof.p.teamAbbr,
      teamName: prof.p.teamName,
      position: prof.p.position || 'G-F',
      teamWins: prof.teamWins,
      teamLosses: prof.teamLosses,
      teamWinPct: prof.teamWinPct,
      conference: prof.conference,
      conferenceSeed: prof.conferenceSeed,
      gamesPlayed: prof.gp,
      teamGamesPlayed: prof.teamGp,
      gamesStarted: prof.gs,
      benchGames: prof.benchGames,
      projectedGames82: prof.projectedGames82,
      awardScore,
      scoreBreakdown: {
        production,
        efficiencyImpact,
        teamContext,
        momentum,
      },
      minutesAvg: prof.minutesAvg,
      ptsAvg: prof.ptsAvg,
      rebAvg: prof.rebAvg,
      astAvg: prof.astAvg,
      stlAvg: prof.stlAvg,
      blkAvg: prof.blkAvg,
      stocksAvg: prof.stocksAvg,
      tsPct: prof.tsPct,
      efgPct: prof.efgPct,
      gmScAvg: prof.gmScAvg,
      plusMinusAvg: prof.plusMinusAvg,
      netRtg: prof.netRtg,
      recentWindowGames: prof.recentWindowGames,
      recentPtsAvg: prof.recentPtsAvg,
      recentPtsDelta: prof.recentPtsDelta,
      recentGmScAvg: prof.recentGmScAvg,
      recentGmScDelta: prof.recentGmScDelta,
      momentumLabel: prof.momentumLabel,
      momentumTone: prof.momentumTone,
      activeStreakLabel: prof.streak.label,
      activeStreakCount: prof.streak.count,
      ...extras,
    };
  };

  const minQualifyGames =
    avgTeamGamesPlayed >= 50
      ? 22
      : Math.max(2, Math.floor(avgTeamGamesPlayed * 0.35));

  // 1. MVP (Jugador Más Valioso)
  const mvpCandidates = profiles
    .filter((pr) => pr.gp >= minQualifyGames && pr.minutesAvg >= 26 && (pr.ptsAvg >= 18 || pr.gmScAvg >= 16.5))
    .map((pr) => {
      const production = clamp((pr.gmScAvg - 11) * 2.15 + Math.max(0, pr.ptsAvg - 20) * 0.65, 6, 46);
      const efficiencyImpact = clamp(
        (pr.tsPct - 53) * 0.85 + clamp(pr.plusMinusAvg + 2, 0, 14) * 0.95 + (pr.pie > 0 ? Math.max(0, pr.pie - 13) * 0.6 : 0),
        2,
        24
      );
      const seedBonus = pr.conferenceSeed <= 3 ? 4.2 : pr.conferenceSeed <= 6 ? 2.2 : 0;
      const teamContext = clamp((pr.teamWinPct - 0.38) * 32 + seedBonus, 0, 18);
      const momentum = clamp(
        5.5 + pr.recentGmScDelta * 0.65 + Math.min(3.5, pr.streak.count * 0.45),
        1,
        12
      );
      return makeEntry(
        pr,
        { production, efficiencyImpact, teamContext, momentum },
        {
          metricsSimple: [
            { key: 'pts', label: 'PTS / PJ', valueDisplay: pr.ptsAvg.toFixed(1), tone: 'accent' },
            { key: 'reb_ast', label: 'REB · AST', valueDisplay: `${pr.rebAvg.toFixed(1)} · ${pr.astAvg.toFixed(1)}` },
            { key: 'record', label: 'Balance equipo', valueDisplay: `${pr.teamWins}-${pr.teamLosses} (#${pr.conferenceSeed})` },
          ],
          metricsAdvanced: [
            { key: 'gmsc', label: 'GmSc / PJ', valueDisplay: pr.gmScAvg.toFixed(1), tone: 'accent' },
            { key: 'ts', label: 'TS% Real', valueDisplay: `${pr.tsPct.toFixed(1)}%` },
            { key: 'pm', label: '+/- · NetRtg', valueDisplay: `${formatSigned1(pr.plusMinusAvg)} · ${formatSigned1(pr.netRtg)}` },
          ],
          summarySimple: `Promedia ${pr.ptsAvg.toFixed(1)} PTS, ${pr.rebAvg.toFixed(1)} REB y ${pr.astAvg.toFixed(1)} AST liderando el ${pr.teamWins}-${pr.teamLosses} de ${pr.p.teamAbbr}.`,
          summaryAdvanced: `${pr.gmScAvg.toFixed(1)} GmSc al ${pr.tsPct.toFixed(1)}% TS (${formatSigned1(pr.netRtg)} NetRtg) en el #${pr.conferenceSeed} del ${pr.conference}.`,
        }
      );
    })
    .sort((a, b) => b.awardScore - a.awardScore)
    .slice(0, 25);

  // 2. ROY (Rookie del Año)
  const royCandidates = profiles
    .filter((pr) => pr.isRookie && pr.gp >= Math.max(1, minQualifyGames - 1) && pr.minutesAvg >= 12)
    .map((pr) => {
      const production = clamp(pr.gmScAvg * 2.55 + pr.ptsAvg * 0.72 + (pr.rebAvg + pr.astAvg) * 0.45, 5, 47);
      const efficiencyImpact = clamp(
        (pr.tsPct - 46) * 0.75 + pr.stocksAvg * 2.8 + clamp(pr.minutesAvg - 14, 0, 22) * 0.35,
        2,
        24
      );
      const teamContext = clamp(4 + (pr.minutesAvg / 36) * 8 + pr.teamWinPct * 5, 2, 16);
      const momentum = clamp(
        5.5 + pr.recentPtsDelta * 0.65 + Math.min(3.5, pr.streak.count * 0.5),
        1,
        13
      );
      return makeEntry(
        pr,
        { production, efficiencyImpact, teamContext, momentum },
        {
          metricsSimple: [
            { key: 'pts', label: 'PTS / PJ', valueDisplay: pr.ptsAvg.toFixed(1), tone: 'accent' },
            { key: 'reb_ast', label: 'REB · AST', valueDisplay: `${pr.rebAvg.toFixed(1)} · ${pr.astAvg.toFixed(1)}` },
            { key: 'min', label: 'Minutos', valueDisplay: `${pr.minutesAvg.toFixed(1)} MIN` },
          ],
          metricsAdvanced: [
            { key: 'gmsc', label: 'GmSc / PJ', valueDisplay: pr.gmScAvg.toFixed(1), tone: 'accent' },
            { key: 'ts', label: 'TS% · STK', valueDisplay: `${pr.tsPct.toFixed(1)}% · ${pr.stocksAvg.toFixed(1)}` },
            { key: 'min_pm', label: 'MIN · +/-', valueDisplay: `${pr.minutesAvg.toFixed(1)}m · ${formatSigned1(pr.plusMinusAvg)}` },
          ],
          summarySimple: `Novato con rol de ${pr.minutesAvg.toFixed(1)} MIN aportando ${pr.ptsAvg.toFixed(1)} PTS, ${pr.rebAvg.toFixed(1)} REB y ${pr.astAvg.toFixed(1)} AST.`,
          summaryAdvanced: `Impacto rookie de ${pr.gmScAvg.toFixed(1)} GmSc (${pr.tsPct.toFixed(1)}% TS · ${pr.stocksAvg.toFixed(1)} STK) en ${pr.minutesAvg.toFixed(1)} MIN/PJ.`,
        }
      );
    })
    .sort((a, b) => b.awardScore - a.awardScore)
    .slice(0, 25);

  // 3. MIP (Jugador Más Mejorado — salto interanual 2026-27 vs 2025-26, o eclosión interna en 2025-26)
  const mipCandidates = [];
  for (const pr of profiles) {
    if (pr.isRookie || pr.gp < minQualifyGames || pr.minutesAvg < 20 || pr.ptsAvg < 12.5) continue;

    let basePts = 0;
    let basePra = 0;
    let baseGmSc = 0;
    let baseTs = 0;
    let baseLabel = '2025-26';

    let targetPts = pr.ptsAvg;
    let targetPra = pr.praAvg;
    let targetGmSc = pr.gmScAvg;
    let targetTs = pr.tsPct;

    if (seasonScope === '2027') {
      const p26 = full.s2026.playersById.get(pr.p.id);
      if (!p26 || !Array.isArray(p26.games) || p26.games.length < 15) continue;
      basePts = round1(meanNums(p26.games.map((g) => g.points)));
      // Excluir superestrellas ya establecidas en élite anotadora (>23.5 PTS el curso anterior)
      if (basePts > 23.5) continue;
      const baseReb = meanNums(p26.games.map((g) => g.rebounds));
      const baseAst = meanNums(p26.games.map((g) => g.assists));
      basePra = round1(basePts + baseReb + baseAst);
      baseGmSc = round1(meanNums(p26.games.map((g) => g.gameScore)));
      const pts26Sum = p26.games.reduce((s, g) => s + g.points, 0);
      const fga26Sum = p26.games.reduce((s, g) => s + g.fga, 0);
      const fta26Sum = p26.games.reduce((s, g) => s + g.fta, 0);
      const denom26 = 2 * (fga26Sum + 0.44 * fta26Sum);
      baseTs = denom26 > 0 ? round1((pts26Sum / denom26) * 100) : 55;
    } else {
      // En 2025-26 comparamos tramo consolidado (último 60%) vs primer tramo (primer 40%)
      if (pr.gp < 35) continue;
      const bio = biosMap.get(String(pr.p.id));
      const expYrs = bio?.experienceYears ?? (bio?.fromYear ? 2025 - bio.fromYear : 3);
      const chrono = [...pr.p.games].reverse();
      const splitIdx = Math.max(10, Math.floor(chrono.length * 0.4));
      const early = chrono.slice(0, splitIdx);
      const late = chrono.slice(splitIdx);
      basePts = round1(meanNums(early.map((g) => g.points)));
      // Excluir estrellas consolidadas o veteranos de >19 PTS que vuelven de restricción de minutos
      if (basePts > 19.5 || (expYrs >= 7 && basePts >= 16.5)) continue;
      targetPts = round1(meanNums(late.map((g) => g.points)));
      targetPra = round1(meanNums(late.map((g) => g.pra)));
      targetGmSc = round1(meanNums(late.map((g) => g.gameScore)));
      targetTs = round1(meanNums(late.map((g) => g.tsPct)));
      basePra = round1(meanNums(early.map((g) => g.pra)));
      baseGmSc = round1(meanNums(early.map((g) => g.gameScore)));
      baseTs = round1(meanNums(early.map((g) => g.tsPct)));
      baseLabel = '1ª mitad 25-26';
    }

    const yoyPtsDelta = round1(targetPts - basePts);
    const yoyPraDelta = round1(targetPra - basePra);
    const yoyGmScDelta = round1(targetGmSc - baseGmSc);
    const yoyTsDelta = round1(targetTs - baseTs);

    if (yoyPtsDelta < 2.2 && yoyPraDelta < 3.5 && yoyGmScDelta < 2.0) continue;

    const production = clamp(
      yoyPtsDelta * 3.4 + Math.max(0, yoyPraDelta) * 1.15 + Math.max(0, pr.ptsAvg - 14) * 0.75,
      8,
      47
    );
    const efficiencyImpact = clamp(
      yoyGmScDelta * 2.1 + clamp(yoyTsDelta + 3, 0, 12) * 0.85 + Math.max(0, pr.tsPct - 55) * 0.5,
      2,
      24
    );
    const teamContext = clamp(pr.teamWinPct * 15 + (pr.gs / Math.max(1, pr.gp)) * 3, 2, 16);
    const momentum = clamp(
      5.5 + pr.recentPtsDelta * 0.55 + Math.min(3.5, pr.streak.count * 0.45),
      1,
      13
    );

    mipCandidates.push(
      makeEntry(
        pr,
        { production, efficiencyImpact, teamContext, momentum },
        {
          yoyPtsDelta,
          yoyPraDelta,
          yoyTsDelta,
          prevPtsAvg: basePts,
          metricsSimple: [
            {
              key: 'yoy_pts',
              label: `Salto vs ${baseLabel}`,
              valueDisplay: `${formatSigned1(yoyPtsDelta)} PTS`,
              tone: 'positive',
            },
            {
              key: 'pts_now',
              label: 'Antes → Ahora',
              valueDisplay: `${basePts.toFixed(1)} → ${targetPts.toFixed(1)}`,
            },
            {
              key: 'pra_jump',
              label: 'Salto PRA',
              valueDisplay: `${formatSigned1(yoyPraDelta)} PRA`,
            },
          ],
          metricsAdvanced: [
            {
              key: 'yoy_gmsc',
              label: 'Salto GmSc',
              valueDisplay: `${formatSigned1(yoyGmScDelta)} GmSc`,
              tone: 'positive',
            },
            {
              key: 'pts_now',
              label: 'PTS (Ant → Act)',
              valueDisplay: `${basePts.toFixed(1)} → ${targetPts.toFixed(1)}`,
            },
            {
              key: 'ts_jump',
              label: 'TS% (Δ)',
              valueDisplay: `${targetTs.toFixed(1)}% (${formatSigned1(yoyTsDelta)})`,
            },
          ],
          summarySimple: `Crece ${formatSigned1(yoyPtsDelta)} puntos por noche (de ${basePts.toFixed(1)} en ${baseLabel} a ${targetPts.toFixed(1)}) y ${formatSigned1(yoyPraDelta)} en PRA.`,
          summaryAdvanced: `Expansión de ${formatSigned1(yoyGmScDelta)} GmSc y ${formatSigned1(yoyPtsDelta)} PTS/PJ sosteniendo ${targetTs.toFixed(1)}% TS (${formatSigned1(yoyTsDelta)} pp).`,
        }
      )
    );
  }
  mipCandidates.sort((a, b) => b.awardScore - a.awardScore);
  const mipTop = mipCandidates.slice(0, 25);

  // 4. DPOY (Defensor del Año)
  const dpoyCandidates = profiles
    .filter((pr) => pr.gp >= minQualifyGames && pr.minutesAvg >= 22 && (pr.stocksAvg >= 1.7 || (pr.contestedShotsAvg >= 7.5 && pr.teamDefRtg <= 112.5)))
    .map((pr) => {
      const production = clamp(
        pr.blkAvg * 9.2 + pr.stlAvg * 8.6 + pr.drebAvg * 1.45,
        8,
        46
      );
      const efficiencyImpact = clamp(
        pr.contestedShotsAvg * 0.95 + pr.deflectionsAvg * 1.85 + Math.max(0, 115 - pr.playerDefRtg) * 0.9,
        3,
        25
      );
      // Anclar una defensa colectiva élite pesa mucho en DPOY
      const teamContext = clamp((116.5 - pr.teamDefRtg) * 1.65 + pr.teamWinPct * 5, 1, 18);
      const momentum = clamp(
        5.5 + pr.recentStocksDelta * 2.2 + (pr.streak.label?.includes('ROB+TAP') ? pr.streak.count * 0.8 : 0),
        1,
        11
      );
      return makeEntry(
        pr,
        { production, efficiencyImpact, teamContext, momentum },
        {
          deflectionsAvg: pr.deflectionsAvg,
          contestedShotsAvg: pr.contestedShotsAvg,
          metricsSimple: [
            { key: 'stocks', label: 'Robos + Tapones', valueDisplay: `${pr.stocksAvg.toFixed(1)} STK`, tone: 'accent' },
            { key: 'stl_blk', label: 'ROB · TAP', valueDisplay: `${pr.stlAvg.toFixed(1)} · ${pr.blkAvg.toFixed(1)}` },
            { key: 'dreb', label: 'Reb. Defensivos', valueDisplay: `${pr.drebAvg.toFixed(1)} DREB` },
          ],
          metricsAdvanced: [
            { key: 'stocks', label: 'STK (ROB/TAP)', valueDisplay: `${pr.stocksAvg.toFixed(1)} (${pr.stlAvg.toFixed(1)}/${pr.blkAvg.toFixed(1)})`, tone: 'accent' },
            { key: 'hustle_def', label: 'Punteos · Desvíos', valueDisplay: `${pr.contestedShotsAvg.toFixed(1)} · ${pr.deflectionsAvg.toFixed(1)}` },
            { key: 'drtg', label: 'DefRtg (Eq / Ind)', valueDisplay: `${pr.teamDefRtg.toFixed(1)} / ${pr.playerDefRtg.toFixed(1)}` },
          ],
          summarySimple: `Intimida con ${pr.stocksAvg.toFixed(1)} robos+tapones por noche (${pr.stlAvg.toFixed(1)} ROB, ${pr.blkAvg.toFixed(1)} TAP) y ${pr.drebAvg.toFixed(1)} rebotes defensivos.`,
          summaryAdvanced: `Ancla defensiva (${pr.teamDefRtg.toFixed(1)} DefRtg equipo) con ${pr.stocksAvg.toFixed(1)} STK, ${pr.contestedShotsAvg.toFixed(1)} tiros punteados y ${pr.deflectionsAvg.toFixed(1)} desvíos.`,
        }
      );
    })
    .sort((a, b) => b.awardScore - a.awardScore)
    .slice(0, 25);

  // 5. 6MOY (Sexto Hombre del Año — más partidos desde el banquillo que como titular y volumen real de rotación)
  const minBenchSample =
    avgTeamGamesPlayed >= 50
      ? 24
      : Math.max(3, Math.ceil(avgTeamGamesPlayed * 0.45));
  const sixthManCandidates = profiles
    .filter(
      (pr) =>
        pr.gp >= minQualifyGames &&
        pr.benchGames >= minBenchSample &&
        pr.benchGames > pr.gs &&
        pr.minutesAvg >= 16 &&
        pr.minutesAvg <= 31.5 &&
        pr.ptsAvg >= 10
    )
    .map((pr) => {
      const production = clamp(pr.ptsAvg * 1.75 + (pr.astAvg + pr.rebAvg) * 1.15 + pr.gmScAvg * 0.85, 8, 46);
      const efficiencyImpact = clamp(
        (pr.tsPct - 50) * 0.9 + clamp(pr.plusMinusAvg + 3, 0, 12) * 1.15,
        2,
        24
      );
      const benchRatio = pr.benchGames / Math.max(1, pr.gp);
      const teamContext = clamp(pr.teamWinPct * 13 + benchRatio * 4.5, 2, 17);
      const momentum = clamp(
        5.5 + pr.recentPtsDelta * 0.65 + Math.min(3.5, pr.streak.count * 0.45),
        1,
        13
      );
      return makeEntry(
        pr,
        { production, efficiencyImpact, teamContext, momentum },
        {
          metricsSimple: [
            { key: 'pts', label: 'PTS suplente', valueDisplay: pr.ptsAvg.toFixed(1), tone: 'accent' },
            { key: 'bench_gp', label: 'Salidas banquillo', valueDisplay: `${pr.benchGames}/${pr.gp} PJ` },
            { key: 'min_pra', label: 'MIN · PRA', valueDisplay: `${pr.minutesAvg.toFixed(1)}m · ${pr.praAvg.toFixed(1)}` },
          ],
          metricsAdvanced: [
            { key: 'gmsc', label: 'GmSc · PTS', valueDisplay: `${pr.gmScAvg.toFixed(1)} · ${pr.ptsAvg.toFixed(1)}`, tone: 'accent' },
            { key: 'bench_gp', label: 'Suplente / Titular', valueDisplay: `${pr.benchGames} SUP · ${pr.gs} TIT` },
            { key: 'ts_pm', label: 'TS% · +/-', valueDisplay: `${pr.tsPct.toFixed(1)}% · ${formatSigned1(pr.plusMinusAvg)}` },
          ],
          summarySimple: `Revoluciona la segunda unidad en ${pr.benchGames} de ${pr.gp} noches con ${pr.ptsAvg.toFixed(1)} PTS en ${pr.minutesAvg.toFixed(1)} minutos.`,
          summaryAdvanced: `Microondas de rotación (${pr.benchGames}/${pr.gp} desde banco): ${pr.ptsAvg.toFixed(1)} PTS y ${pr.gmScAvg.toFixed(1)} GmSc al ${pr.tsPct.toFixed(1)}% TS (${formatSigned1(pr.plusMinusAvg)} +/-).`,
        }
      );
    })
    .sort((a, b) => b.awardScore - a.awardScore)
    .slice(0, 25);

  // 6. CLUTCH (Jugador Clutch del Año — rendimiento en partidos decididos por <= 5 puntos)
  const clutchCandidates = profiles
    .filter((pr) => {
      const teamCg = teamClutchGamesCount.get(pr.p.teamAbbr) || 1;
      const minCg = Math.max(2, Math.min(5, Math.floor(teamCg * 0.4)));
      return pr.clutchGames >= minCg && pr.minutesAvg >= 24 && pr.clutchPtsAvg >= 17;
    })
    .map((pr) => {
      const clutchWinPct = pr.clutchWins / Math.max(1, pr.clutchGames);
      const production = clamp(
        (pr.clutchPtsAvg - 14) * 1.9 + pr.clutchGmScAvg * 0.95 + pr.clutchAstAvg * 0.85,
        8,
        46
      );
      const efficiencyImpact = clamp(
        (pr.clutchTsPct - 50) * 0.9 + clamp(pr.clutchPlusMinusAvg + 4, 0, 16) * 0.95,
        2,
        24
      );
      const teamContext = clamp(clutchWinPct * 14 + Math.min(4, pr.clutchGames * 0.22), 2, 18);
      const momentum = clamp(5.5 + pr.recentGmScDelta * 0.55 + Math.min(3, pr.streak.count * 0.4), 1, 12);
      return makeEntry(
        pr,
        { production, efficiencyImpact, teamContext, momentum },
        {
          clutchGames: pr.clutchGames,
          clutchWins: pr.clutchWins,
          clutchLosses: pr.clutchLosses,
          clutchPtsAvg: pr.clutchPtsAvg,
          clutchTsPct: pr.clutchTsPct,
          clutchPlusMinusAvg: pr.clutchPlusMinusAvg,
          metricsSimple: [
            { key: 'c_pts', label: 'PTS en finales ≤5p', valueDisplay: pr.clutchPtsAvg.toFixed(1), tone: 'accent' },
            { key: 'c_wl', label: 'Balance finales', valueDisplay: `${pr.clutchWins}-${pr.clutchLosses} (${pr.clutchGames} PJ)` },
            { key: 'c_pm', label: 'Impacto +/- final', valueDisplay: formatSigned1(pr.clutchPlusMinusAvg) },
          ],
          metricsAdvanced: [
            { key: 'c_gmsc', label: 'GmSc finales ≤5p', valueDisplay: pr.clutchGmScAvg.toFixed(1), tone: 'accent' },
            { key: 'c_ts', label: 'TS% · PTS Clutch', valueDisplay: `${pr.clutchTsPct.toFixed(1)}% · ${pr.clutchPtsAvg.toFixed(1)}` },
            { key: 'c_wl', label: 'Récord ≤5 pts', valueDisplay: `${pr.clutchWins}-${pr.clutchLosses} (${Math.round(clutchWinPct * 100)}%V)` },
          ],
          summarySimple: `En ${pr.clutchGames} partidos decididos por 5 puntos o menos promedia ${pr.clutchPtsAvg.toFixed(1)} PTS con balance de ${pr.clutchWins}-${pr.clutchLosses}.`,
          summaryAdvanced: `Sangre fría en finales apretados (≤5 pts): ${pr.clutchGmScAvg.toFixed(1)} GmSc al ${pr.clutchTsPct.toFixed(1)}% TS (${pr.clutchWins}-${pr.clutchLosses}, ${formatSigned1(pr.clutchPlusMinusAvg)} +/-).`,
        }
      );
    })
    .sort((a, b) => b.awardScore - a.awardScore)
    .slice(0, 25);

  // 7. HUSTLE (Jugador Hustle del Año — esfuerzo, intangibles, desvíos, balones sueltos, punteos y pantallas)
  const hustleCandidates = profiles
    .filter((pr) => pr.gp >= minQualifyGames && pr.minutesAvg >= 18)
    .map((pr) => {
      const rawEffortPerGame =
        pr.deflectionsAvg * 2.4 +
        pr.looseBallsAvg * 3.8 +
        pr.contestedShotsAvg * 0.85 +
        pr.screenAssistsAvg * 1.45 +
        pr.boxOutsAvg * 1.2 +
        pr.orebAvg * 1.65 +
        pr.stocksAvg * 2.2;
      const effortPer36 = (rawEffortPerGame / Math.max(18, pr.minutesAvg)) * 32;

      const production = clamp(rawEffortPerGame * 1.65, 6, 46);
      const efficiencyImpact = clamp(
        effortPer36 * 0.72 + clamp(pr.plusMinusAvg + 3, 0, 12) * 0.65 + pr.foulsDrawnAvg * 0.7,
        3,
        25
      );
      const teamContext = clamp(pr.teamWinPct * 12 + (115.5 - pr.teamDefRtg) * 0.8, 2, 16);
      const momentum = clamp(5.5 + pr.recentStocksDelta * 1.8 + pr.recentGmScDelta * 0.35, 1, 13);

      return makeEntry(
        pr,
        { production, efficiencyImpact, teamContext, momentum },
        {
          deflectionsAvg: pr.deflectionsAvg,
          contestedShotsAvg: pr.contestedShotsAvg,
          looseBallsAvg: pr.looseBallsAvg,
          screenAssistsAvg: pr.screenAssistsAvg,
          boxOutsAvg: pr.boxOutsAvg,
          orebAvg: pr.orebAvg,
          metricsSimple: [
            { key: 'defl_loose', label: 'Desvíos · Bal. sueltos', valueDisplay: `${pr.deflectionsAvg.toFixed(1)} · ${pr.looseBallsAvg.toFixed(1)}`, tone: 'accent' },
            { key: 'contest', label: 'Tiros punteados', valueDisplay: `${pr.contestedShotsAvg.toFixed(1)} / PJ` },
            { key: 'oreb_stk', label: 'OREB · ROB+TAP', valueDisplay: `${pr.orebAvg.toFixed(1)} · ${pr.stocksAvg.toFixed(1)}` },
          ],
          metricsAdvanced: [
            { key: 'defl_loose', label: 'Desvíos · Recuperac.', valueDisplay: `${pr.deflectionsAvg.toFixed(1)} · ${pr.looseBallsAvg.toFixed(1)}`, tone: 'accent' },
            { key: 'scr_box', label: 'Pantallas · BoxOuts', valueDisplay: `${pr.screenAssistsAvg.toFixed(1)} · ${pr.boxOutsAvg.toFixed(1)}` },
            { key: 'contest_oreb', label: 'Punteos · OREB', valueDisplay: `${pr.contestedShotsAvg.toFixed(1)} · ${pr.orebAvg.toFixed(1)}` },
          ],
          summarySimple: `Motor incansable: ${pr.deflectionsAvg.toFixed(1)} desvíos, ${pr.contestedShotsAvg.toFixed(1)} tiros punteados, ${pr.looseBallsAvg.toFixed(1)} balones divididos y ${pr.orebAvg.toFixed(1)} rebotes ofensivos.`,
          summaryAdvanced: `Intangibles élite por noche: ${pr.deflectionsAvg.toFixed(1)} DESV · ${pr.looseBallsAvg.toFixed(1)} REC · ${pr.contestedShotsAvg.toFixed(1)} PUNT · ${pr.screenAssistsAvg.toFixed(1)} PANT · ${pr.boxOutsAvg.toFixed(1)} BOX.`,
        }
      );
    })
    .sort((a, b) => b.awardScore - a.awardScore)
    .slice(0, 25);

  // 8. ALL-NBA POOL (Top 40 global sin posiciones para recalcular Quintetos 1º, 2º, 3º y Menciones en vivo con el slider)
  const allNbaPool = profiles
    .filter((pr) => pr.gp >= minQualifyGames && pr.minutesAvg >= 24 && (pr.ptsAvg >= 15 || pr.gmScAvg >= 14.5))
    .map((pr) => {
      // En All-NBA el nivel individual pesa ligeramente más que el balance de equipo frente al MVP
      const production = clamp((pr.gmScAvg - 10) * 2.25 + Math.max(0, pr.ptsAvg - 18) * 0.65, 6, 47);
      const efficiencyImpact = clamp(
        (pr.tsPct - 52) * 0.85 + pr.stocksAvg * 1.4 + clamp(pr.plusMinusAvg + 3, 0, 14) * 0.85,
        2,
        25
      );
      const teamContext = clamp((pr.teamWinPct - 0.32) * 24 + (pr.conferenceSeed <= 6 ? 2.5 : 0), 1, 15);
      const momentum = clamp(5.5 + pr.recentGmScDelta * 0.55 + Math.min(3, pr.streak.count * 0.4), 1, 13);

      return makeEntry(
        pr,
        { production, efficiencyImpact, teamContext, momentum },
        {
          metricsSimple: [
            { key: 'pts', label: 'PTS / PJ', valueDisplay: pr.ptsAvg.toFixed(1), tone: 'accent' },
            { key: 'reb_ast', label: 'REB · AST', valueDisplay: `${pr.rebAvg.toFixed(1)} · ${pr.astAvg.toFixed(1)}` },
            { key: 'record', label: 'Equipo', valueDisplay: `${pr.p.teamAbbr} (${pr.teamWins}-${pr.teamLosses})` },
          ],
          metricsAdvanced: [
            { key: 'gmsc', label: 'GmSc · TS%', valueDisplay: `${pr.gmScAvg.toFixed(1)} · ${pr.tsPct.toFixed(1)}%`, tone: 'accent' },
            { key: 'line', label: 'PTS · REB · AST', valueDisplay: `${pr.ptsAvg.toFixed(1)} · ${pr.rebAvg.toFixed(1)} · ${pr.astAvg.toFixed(1)}` },
            { key: 'net', label: 'NetRtg · +/-', valueDisplay: `${formatSigned1(pr.netRtg)} · ${formatSigned1(pr.plusMinusAvg)}` },
          ],
          summarySimple: `${pr.ptsAvg.toFixed(1)} PTS · ${pr.rebAvg.toFixed(1)} REB · ${pr.astAvg.toFixed(1)} AST (${pr.teamWins}-${pr.teamLosses})`,
          summaryAdvanced: `${pr.gmScAvg.toFixed(1)} GmSc · ${pr.tsPct.toFixed(1)}% TS · ${formatSigned1(pr.netRtg)} NetRtg`,
        }
      );
    })
    .sort((a, b) => b.awardScore - a.awardScore)
    .slice(0, 42);

  const payload = {
    generatedAt: new Date().toISOString(),
    dataSource: activeDs.dataSource,
    seasonScope: cacheKey,
    seasonLabel,
    avgTeamGamesPlayed,
    defaultMinProjectedGames: 65,
    categories: {
      mvp: mvpCandidates,
      roy: royCandidates,
      mip: mipTop,
      dpoy: dpoyCandidates,
      '6moy': sixthManCandidates,
      clutch: clutchCandidates,
      hustle: hustleCandidates,
    },
    allNbaPool,
  };

  awardsCache.set(cacheKey, {
    expiresAt: Date.now() + 8 * 60 * 1000,
    payload,
  });

  return payload;
}
