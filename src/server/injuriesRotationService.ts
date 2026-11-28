// @ts-nocheck
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { NBA_TEAMS_MAP } from "../utils/teamLogos.ts";
import { normalizePlayerLookupKey, computeOfficialGameFptsBreakdown } from "../utils/fantasyScoring.ts";
import { translateMedicalDetailEs } from "./scoutingEngine.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR =
  [
    path.resolve(process.cwd(), "data"),
    path.resolve(__dirname, "../data"),
    path.resolve(__dirname, "../../data"),
  ].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "data");

const INJURIES_SNAPSHOT_FILE = path.join(DATA_DIR, "nba-injuries-snapshot.json");
const SERVERLESS_TMP_INJURIES_FILE = "/tmp/radarnba-injuries-snapshot.json";
const ESPN_NBA_INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";

const ESPN_ABBR_NORMALIZE = {
  GS: "GSW",
  NY: "NYK",
  NO: "NOP",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
  PHO: "PHX",
  BKN: "BKN",
  BRK: "BKN",
  CHA: "CHA",
  CHO: "CHA",
};

const TEAM_NAME_TO_ABBR = Object.values(NBA_TEAMS_MAP).reduce((acc, t) => {
  acc[normalizePlain(t.name)] = t.abbr;
  acc[normalizePlain(t.city)] = t.abbr;
  return acc;
}, {});

function normalizePlain(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function resolveTeamAbbr(rawAbbr, rawTeamName) {
  const up = String(rawAbbr || "").toUpperCase().trim();
  if (up && NBA_TEAMS_MAP[up]) return up;
  if (up && ESPN_ABBR_NORMALIZE[up]) return ESPN_ABBR_NORMALIZE[up];
  const normName = normalizePlain(rawTeamName);
  if (normName && TEAM_NAME_TO_ABBR[normName]) return TEAM_NAME_TO_ABBR[normName];
  for (const [key, abbr] of Object.entries(TEAM_NAME_TO_ABBR)) {
    if (normName && key.length >= 4 && normName.includes(key)) return abbr;
  }
  return up || "NBA";
}

function classifyInjuryStatus(rawStatus, rawDetail) {
  const stLow = String(rawStatus || "").toLowerCase().trim();
  const detLow = String(rawDetail || "").toLowerCase().trim();
  const translated = translateMedicalDetailEs(rawDetail);
  const combined = `${detLow} ${(translated || "").toLowerCase()}`;

  const hasRestKeywords = /\b(?:rest|load management|injury management|recovery|descanso|dosificaci|gesti[oó]n de cargas)\b/i.test(
    combined
  );
  const hasLongTermKeywords =
    /\b(?:surgery|fracture|torn|acl|mcl|achilles|meniscus|indefinitely|months|season-ending|out for season|re-evaluated|extended|cirug|rotura|cruzado|fractur|meses|indefinid|temporada|prolongad|aquiles|menisco|8-10|6-8|4-6|3-4|2-4)\b/i.test(
      combined
    ) ||
    ((combined.includes("semanas") || combined.includes("weeks")) &&
      !combined.includes("esta semana") &&
      !combined.includes("this week") &&
      !combined.includes("proxima semana") &&
      !combined.includes("next week"));

  if (stLow.includes("suspension") || detLow.includes("suspension")) {
    return {
      statusCode: "suspended",
      shortTag: "SUSP",
      statusLabelEs: "Sancionado",
      absenceTier: "long_term",
      absenceProbability: 1.0,
      detailEs: translated || "Sanción disciplinaria oficial NBA",
    };
  }
  if (
    stLow.includes("injured reserve") ||
    stLow === "ir" ||
    /\b(?:out for season|season-ending)\b/i.test(detLow)
  ) {
    return {
      statusCode: "ir",
      shortTag: "IR",
      statusLabelEs: "Larga duración (IR)",
      absenceTier: "long_term",
      absenceProbability: 1.0,
      detailEs: translated || "Reserva de lesionados de larga duración",
    };
  }
  if (stLow.includes("out")) {
    if (hasLongTermKeywords) {
      return {
        statusCode: "out",
        shortTag: "OUT",
        statusLabelEs: "Baja larga duración",
        absenceTier: "long_term",
        absenceProbability: 1.0,
        detailEs: translated || "Baja médica prolongada confirmada",
      };
    }
    if (hasRestKeywords) {
      return {
        statusCode: "out",
        shortTag: "OUT",
        statusLabelEs: "Baja (Descanso)",
        absenceTier: "b2b_rest",
        absenceProbability: 1.0,
        detailEs: translated || "Descanso puntual / gestión de cargas",
      };
    }
    return {
      statusCode: "out",
      shortTag: "OUT",
      statusLabelEs: "Baja (Out)",
      absenceTier: "punctual",
      absenceProbability: 1.0,
      detailEs: translated || "Descartado en el parte oficial",
    };
  }
  if (stLow.includes("doubtful")) {
    return {
      statusCode: "doubtful",
      shortTag: "DUD",
      statusLabelEs: "Dudoso (Doubtful)",
      absenceTier: "punctual",
      absenceProbability: 0.8,
      detailEs: translated || "Participación muy improbable",
    };
  }
  if (stLow.includes("day-to-day") || stLow.includes("dtd")) {
    return {
      statusCode: "dtd",
      shortTag: "DTD",
      statusLabelEs: "Día a día (DTD)",
      absenceTier: hasRestKeywords ? "b2b_rest" : "punctual",
      absenceProbability: 0.45,
      detailEs: translated || "Seguimiento diario previo al salto inicial",
    };
  }
  if (stLow.includes("probable")) {
    return {
      statusCode: "probable",
      shortTag: "PROB",
      statusLabelEs: "Probable",
      absenceTier: hasRestKeywords ? "b2b_rest" : "punctual",
      absenceProbability: 0.15,
      detailEs: translated || "Molestias leves, previsto disponible",
    };
  }
  return {
    statusCode: "questionable",
    shortTag: "GTD",
    statusLabelEs: "Cuestionable",
    absenceTier: hasRestKeywords ? "b2b_rest" : "punctual",
    absenceProbability: 0.5,
    detailEs: translated || "En evaluación médica previa al partido",
  };
}

function getPositionBuckets(posRaw) {
  const p = String(posRaw || "").toUpperCase();
  const buckets = new Set();
  if (p.includes("G") || p.includes("PG") || p.includes("SG")) buckets.add("G");
  if (p.includes("F") || p.includes("SF") || p.includes("PF")) buckets.add("F");
  if (p.includes("C")) buckets.add("C");
  if (buckets.size === 0) {
    buckets.add("G");
    buckets.add("F");
  }
  return buckets;
}

function positionAffinity(posA, posB) {
  const setA = getPositionBuckets(posA);
  const setB = getPositionBuckets(posB);
  let overlap = 0;
  for (const b of setA) {
    if (setB.has(b)) overlap++;
  }
  if (overlap >= 2) return 1.35;
  if (overlap === 1) return 1.15;
  // Adjacent wing/frontcourt affinity
  if ((setA.has("F") && setB.has("C")) || (setA.has("C") && setB.has("F"))) return 0.78;
  if ((setA.has("G") && setB.has("F")) || (setA.has("F") && setB.has("G"))) return 0.72;
  return 0.42;
}

function computePlayerBaseStats(player) {
  const games = Array.isArray(player?.games) ? player.games : [];
  const gp = games.length;
  if (gp === 0) {
    return {
      gp: 0,
      minutesPg: 0,
      pointsPg: 0,
      reboundsPg: 0,
      assistsPg: 0,
      usgPct: player?.advanced?.usgPct || 0,
      fantasyPtsPg: 0,
      gameByEventId: new Map(),
    };
  }
  let minSum = 0;
  let ptsSum = 0;
  let rebSum = 0;
  let astSum = 0;
  let usgSum = 0;
  let fptsSum = 0;
  const gameByEventId = new Map();
  for (const g of games) {
    const fpts = computeOfficialGameFptsBreakdown(g).totalFpts;
    minSum += Number(g.minutes) || 0;
    ptsSum += Number(g.points) || 0;
    rebSum += Number(g.rebounds) || 0;
    astSum += Number(g.assists) || 0;
    usgSum += Number(g.usgEst) || 0;
    fptsSum += fpts;
    if (g.eventId) {
      gameByEventId.set(String(g.eventId), {
        minutes: Number(g.minutes) || 0,
        points: Number(g.points) || 0,
        usgEst: Number(g.usgEst) || 0,
        fpts,
      });
    }
  }
  const usgCalc = usgSum / gp;
  return {
    gp,
    minutesPg: round1(minSum / gp),
    pointsPg: round1(ptsSum / gp),
    reboundsPg: round1(rebSum / gp),
    assistsPg: round1(astSum / gp),
    usgPct: round1(player?.advanced?.usgPct || usgCalc),
    fantasyPtsPg: round1(fptsSum / gp),
    gameByEventId,
  };
}

function readRawInjuriesDiskCache() {
  const candidates = process.env.VERCEL
    ? [SERVERLESS_TMP_INJURIES_FILE, INJURIES_SNAPSHOT_FILE]
    : [INJURIES_SNAPSHOT_FILE];
  for (const target of candidates) {
    try {
      if (!fs.existsSync(target)) continue;
      const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
      if (parsed && Array.isArray(parsed.records)) {
        return parsed;
      }
    } catch {
      // ignore corrupted cache
    }
  }
  return null;
}

function writeRawInjuriesDiskCache(records) {
  const payload = {
    savedAt: new Date().toISOString(),
    records,
  };
  try {
    if (process.env.VERCEL) {
      const tmp = `${SERVERLESS_TMP_INJURIES_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
      fs.renameSync(tmp, SERVERLESS_TMP_INJURIES_FILE);
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${INJURIES_SNAPSHOT_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
      fs.renameSync(tmp, INJURIES_SNAPSHOT_FILE);
    }
  } catch {
    // non-fatal on read-only fs
  }
}

async function fetchDetailedEspnInjuries(cachedFetchJson, forceRefresh = false) {
  try {
    const data = await cachedFetchJson(
      ESPN_NBA_INJURIES_URL,
      15 * 60 * 1000,
      {},
      6500,
      forceRefresh
    );
    const teamsArr = Array.isArray(data?.injuries) ? data.injuries : [];
    const records = [];
    for (const tBlock of teamsArr) {
      const teamName = String(tBlock?.displayName || tBlock?.team?.displayName || "").trim();
      const teamAbbrRaw = String(tBlock?.team?.abbreviation || "").trim();
      const items = Array.isArray(tBlock?.injuries) ? tBlock.injuries : [];
      for (const inj of items) {
        const dispName = String(inj?.athlete?.displayName || "").trim();
        if (!dispName) continue;
        const status = String(inj?.status || "").trim() || "Questionable";
        const cleanField = (val) => {
          const s = String(val || "").trim();
          return /^not\s+specified$/i.test(s) ? "" : s;
        };
        const typeDesc = cleanField(inj?.details?.type);
        const sideDesc = cleanField(inj?.details?.side);
        const detailDesc = cleanField(inj?.details?.detail);
        const returnDate = cleanField(inj?.details?.returnDate) || null;
        const comment = String(
          inj?.shortComment ||
            inj?.athlete?.notes?.items?.[0]?.headline ||
            inj?.details?.fantasyStatus?.description ||
            ""
        ).trim();
        const baseDetail = [sideDesc, typeDesc, detailDesc].filter(Boolean).join(" ").trim();
        let combinedDetail = baseDetail;
        if (comment) {
          combinedDetail = combinedDetail ? `${combinedDetail} (${comment})` : comment;
        }
        const athleteTeamAbbr = String(
          inj?.athlete?.team?.abbreviation || teamAbbrRaw || ""
        ).trim();
        const athletePos = String(
          inj?.athlete?.position?.abbreviation || ""
        ).trim();
        const headshotUrl = String(inj?.athlete?.headshot?.href || "").trim() || undefined;
        records.push({
          name: dispName,
          teamAbbr: resolveTeamAbbr(athleteTeamAbbr, teamName),
          teamName,
          position: athletePos,
          headshotUrl,
          status,
          detail: combinedDetail,
          returnDate,
        });
      }
    }
    if (records.length > 0) {
      writeRawInjuriesDiskCache(records);
      return { records, source: "espn_live" };
    }
  } catch {
    // fall through to disk cache
  }

  const cached = readRawInjuriesDiskCache();
  if (cached && cached.records.length > 0) {
    return { records: cached.records, source: "disk_cache" };
  }
  return { records: [], source: "fallback_empty" };
}

let cachedInjuriesResponse = null;

export async function buildInjuriesRotationPayload(params) {
  const { s27, biosById, cachedFetchJson, forceRefresh = false } = params;
  if (
    !forceRefresh &&
    cachedInjuriesResponse &&
    cachedInjuriesResponse.expiresAt > Date.now()
  ) {
    return cachedInjuriesResponse.payload;
  }

  const { records, source } = await fetchDetailedEspnInjuries(
    cachedFetchJson,
    forceRefresh
  );

  const playersList =
    s27?.playersById instanceof Map
      ? Array.from(s27.playersById.values())
      : Array.isArray(s27?.players)
      ? s27.players
      : [];
  const teamsList =
    s27?.teamsByAbbr instanceof Map
      ? Array.from(s27.teamsByAbbr.values())
      : Array.isArray(s27?.teams)
      ? s27.teams
      : [];

  const normalizeConference = (rawConf, fallbackAbbr) => {
    const low = String(rawConf || "").toLowerCase();
    if (low.startsWith("e")) return "East";
    if (low.startsWith("w") || low.startsWith("o")) return "West";
    const meta = NBA_TEAMS_MAP[String(fallbackAbbr || "").toUpperCase()];
    return meta?.conference === "East" ? "East" : "West";
  };

  const teamsByAbbr = new Map();
  for (const t of teamsList) {
    if (t?.abbreviation) {
      teamsByAbbr.set(String(t.abbreviation).toUpperCase(), t);
    }
  }

  // Build player lookup indexes (active stats first, then bios fallback)
  const playerStatsById = new Map();
  const playersByTeamAbbr = new Map();
  const playersByPlainName = new Map();
  const playersByLookupKey = new Map();

  for (const p of playersList) {
    const baseStats = computePlayerBaseStats(p);
    playerStatsById.set(p.id, { player: p, stats: baseStats });
    const abbr = String(p.teamAbbr || "").toUpperCase();
    if (abbr) {
      const arr = playersByTeamAbbr.get(abbr) || [];
      arr.push({ player: p, stats: baseStats });
      playersByTeamAbbr.set(abbr, arr);
    }
    const kPlain = normalizePlain(p.name);
    const kLook = normalizePlayerLookupKey(p.name);
    if (kPlain) {
      const arr = playersByPlainName.get(kPlain) || [];
      arr.push(p);
      playersByPlainName.set(kPlain, arr);
    }
    if (kLook) {
      const arr = playersByLookupKey.get(kLook) || [];
      arr.push(p);
      playersByLookupKey.set(kLook, arr);
    }
  }

  const biosByPlainName = new Map();
  const biosByLookupKey = new Map();
  if (biosById && typeof biosById.values === "function") {
    for (const b of biosById.values()) {
      const kPlain = normalizePlain(b.name);
      const kLook = normalizePlayerLookupKey(b.name);
      if (kPlain && !biosByPlainName.has(kPlain)) biosByPlainName.set(kPlain, b);
      if (kLook && !biosByLookupKey.has(kLook)) biosByLookupKey.set(kLook, b);
    }
  }

  const resolvePlayer = (name, hintAbbr) => {
    let cleanName = String(name || "").trim();
    if (/chet\s+holmgrem/i.test(cleanName)) cleanName = "Chet Holmgren";
    const kPlain = normalizePlain(cleanName);
    const kLook = normalizePlayerLookupKey(cleanName);
    const cands = playersByPlainName.get(kPlain) || playersByLookupKey.get(kLook) || [];
    if (cands.length === 1) return { player: cands[0], bio: null };
    if (cands.length > 1) {
      const teamMatch = cands.find((c) => String(c.teamAbbr || "").toUpperCase() === hintAbbr);
      return { player: teamMatch || cands[0], bio: null };
    }
    const bio = biosByPlainName.get(kPlain) || biosByLookupKey.get(kLook) || null;
    return { player: null, bio };
  };

  const entries = [];
  const seenKeys = new Set();

  for (const rec of records) {
    const resolved = resolvePlayer(rec.name, rec.teamAbbr);
    const pObj = resolved.player;
    const bioObj = resolved.bio;

    const teamAbbr =
      (pObj?.teamAbbr && NBA_TEAMS_MAP[pObj.teamAbbr] ? pObj.teamAbbr : null) ||
      (bioObj?.teamAbbr && NBA_TEAMS_MAP[bioObj.teamAbbr] ? bioObj.teamAbbr : null) ||
      (NBA_TEAMS_MAP[rec.teamAbbr] ? rec.teamAbbr : "NBA");

    const teamMeta = NBA_TEAMS_MAP[teamAbbr];
    const teamObj = teamsByAbbr.get(teamAbbr);
    const playerId = pObj?.id || bioObj?.id || null;
    const displayName = pObj?.name || bioObj?.name || rec.name;
    const nameNorm = normalizePlain(displayName);
    const dedupeKey = playerId ? `id:${playerId}` : `nm:${nameNorm}:${teamAbbr}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const statusInfo = classifyInjuryStatus(rec.status, rec.detail);
    const statsBundle = playerId ? playerStatsById.get(playerId)?.stats : null;

    const minutesPg = statsBundle?.minutesPg ?? 0;
    const pointsPg = statsBundle?.pointsPg ?? 0;
    const reboundsPg = statsBundle?.reboundsPg ?? 0;
    const assistsPg = statsBundle?.assistsPg ?? 0;
    const usgPct = statsBundle?.usgPct ?? 0;
    const fantasyPtsPg = statsBundle?.fantasyPtsPg ?? 0;
    const gamesPlayed = statsBundle?.gp ?? 0;

    const isStarter = minutesPg >= 24 || pointsPg >= 13;
    const isKeyRotation = minutesPg >= 14 || pointsPg >= 6 || fantasyPtsPg >= 16;
    const impactWeight = round1(
      (minutesPg * 1.15 + pointsPg * 0.9 + usgPct * 0.55) * statusInfo.absenceProbability
    );

    entries.push({
      id: dedupeKey,
      playerId,
      name: displayName,
      nameNorm,
      teamId: teamObj?.id || teamMeta?.id || null,
      teamAbbr,
      teamName: teamObj?.name || teamMeta?.name || rec.teamName || teamAbbr,
      conference: normalizeConference(teamObj?.conference || teamMeta?.conference, teamAbbr),
      position: pObj?.position || bioObj?.position || rec.position || "G-F",
      headshotUrl: pObj?.headshotUrl || rec.headshotUrl,
      statusCode: statusInfo.statusCode,
      statusRaw: rec.status,
      statusLabelEs: statusInfo.statusLabelEs,
      shortTag: statusInfo.shortTag,
      absenceTier: statusInfo.absenceTier,
      absenceProbability: statusInfo.absenceProbability,
      detailEs: statusInfo.detailEs,
      returnDate: rec.returnDate || null,
      gamesPlayed,
      minutesPg,
      pointsPg,
      reboundsPg,
      assistsPg,
      usgPct,
      fantasyPtsPg,
      isKeyRotation,
      isStarter,
      impactWeight,
    });
  }

  const STATUS_ORDER = {
    out: 0,
    ir: 1,
    suspended: 2,
    doubtful: 3,
    questionable: 4,
    dtd: 5,
    probable: 6,
  };

  entries.sort((a, b) => {
    if (b.impactWeight !== a.impactWeight) return b.impactWeight - a.impactWeight;
    const sa = STATUS_ORDER[a.statusCode] ?? 9;
    const sb = STATUS_ORDER[b.statusCode] ?? 9;
    if (sa !== sb) return sa - sb;
    return b.minutesPg - a.minutesPg;
  });

  // Group by team and compute Rotation Impact + Beneficiaries
  const entriesByTeam = new Map();
  for (const item of entries) {
    if (!item.teamAbbr || item.teamAbbr === "NBA") continue;
    const arr = entriesByTeam.get(item.teamAbbr) || [];
    arr.push(item);
    entriesByTeam.set(item.teamAbbr, arr);
  }

  const teamsImpact = [];
  const allBeneficiaries = [];

  for (const [abbr, teamInjuries] of entriesByTeam.entries()) {
    const teamObj = teamsByAbbr.get(abbr);
    const teamMeta = NBA_TEAMS_MAP[abbr];
    const teamGames = Array.isArray(teamObj?.games) ? teamObj.games : [];
    const teamEventIds = teamGames.map((g) => String(g.eventId || "")).filter(Boolean);

    let outOrIrCount = 0;
    let doubtfulCount = 0;
    let questionableOrDtdCount = 0;
    let probableCount = 0;
    let keyStartersAffected = 0;
    let vacatedMinutes = 0;
    let vacatedPoints = 0;
    let vacatedRebounds = 0;
    let vacatedAssists = 0;
    let vacatedUsage = 0;
    let vacatedFantasyPts = 0;

    for (const inj of teamInjuries) {
      if (inj.statusCode === "out" || inj.statusCode === "ir" || inj.statusCode === "suspended") {
        outOrIrCount++;
      } else if (inj.statusCode === "doubtful") {
        doubtfulCount++;
      } else if (inj.statusCode === "questionable" || inj.statusCode === "dtd") {
        questionableOrDtdCount++;
      } else {
        probableCount++;
      }

      if (inj.isStarter && inj.absenceProbability >= 0.45) {
        keyStartersAffected++;
      }
      const w = inj.absenceProbability;
      vacatedMinutes += inj.minutesPg * w;
      vacatedPoints += inj.pointsPg * w;
      vacatedRebounds += inj.reboundsPg * w;
      vacatedAssists += inj.assistsPg * w;
      vacatedUsage += inj.usgPct * w;
      vacatedFantasyPts += inj.fantasyPtsPg * w;
    }

    vacatedMinutes = round1(vacatedMinutes);
    vacatedPoints = round1(vacatedPoints);
    vacatedRebounds = round1(vacatedRebounds);
    vacatedAssists = round1(vacatedAssists);
    vacatedUsage = round1(vacatedUsage);
    vacatedFantasyPts = round1(vacatedFantasyPts);

    const rawScore =
      vacatedMinutes * 0.72 +
      vacatedPoints * 0.85 +
      vacatedUsage * 0.55 +
      keyStartersAffected * 11;
    const impactScore = Math.min(100, Math.round(rawScore));
    const impactTier =
      impactScore >= 65
        ? "critico"
        : impactScore >= 40
        ? "alto"
        : impactScore >= 18
        ? "moderado"
        : "leve";

    // Compute teammates who absorb minutes & usage
    const injuredIdsSet = new Set(
      teamInjuries
        .filter((x) => x.playerId && x.absenceProbability >= 0.75)
        .map((x) => x.playerId)
    );
    const impactfulInjuries = teamInjuries.filter(
      (x) => x.absenceProbability >= 0.45 && (x.minutesPg >= 12 || x.pointsPg >= 5)
    );

    const rosterEntries = playersByTeamAbbr.get(abbr) || [];
    const healthyCandidates = rosterEntries.filter(
      ({ player, stats }) =>
        !injuredIdsSet.has(player.id) &&
        stats.gp >= 2 &&
        stats.minutesPg >= 8
    );

    const beneficiaries = [];

    if (impactfulInjuries.length > 0 && healthyCandidates.length > 0) {
      // Pre-compute missed game IDs for top impactful injured players (empirical splits)
      const missedEventIdsByInjured = new Map();
      for (const inj of impactfulInjuries.slice(0, 4)) {
        if (!inj.playerId) continue;
        const injBundle = playerStatsById.get(inj.playerId);
        if (!injBundle || teamEventIds.length < 4) continue;
        const playedSet = new Set(injBundle.stats.gameByEventId.keys());
        const missed = teamEventIds.filter((eid) => !playedSet.has(eid));
        if (missed.length >= 2) {
          missedEventIdsByInjured.set(inj.playerId, new Set(missed));
        }
      }

      // Distribute each impactful injury across healthy teammates by positional affinity + headroom
      const accumMap = new Map();
      for (const cand of healthyCandidates) {
        accumMap.set(cand.player.id, {
          cand,
          minDelta: 0,
          usgDelta: 0,
          ptsDelta: 0,
          fptsDelta: 0,
          triggeredBy: [],
          empGames: 0,
          empMinDeltaSum: 0,
          empPtsDeltaSum: 0,
          empFptsDeltaSum: 0,
          empCount: 0,
        });
      }

      for (const inj of impactfulInjuries) {
        const effMinPool = inj.minutesPg * inj.absenceProbability * 0.78;
        const effUsgPool = inj.usgPct * inj.absenceProbability * 0.58;
        const effPtsPool = inj.pointsPg * inj.absenceProbability * 0.72;
        const effFptsPool = inj.fantasyPtsPg * inj.absenceProbability * 0.72;
        const missedSet = inj.playerId ? missedEventIdsByInjured.get(inj.playerId) : null;

        let totalMinWeight = 0;
        let totalUsgWeight = 0;
        const weights = [];

        for (const cand of healthyCandidates) {
          const posAff = positionAffinity(inj.position, cand.player.position);
          // Players around 14-31 MPG have highest minute headroom; 36+ MPG stars absorb usage more than minutes
          const minHeadroom = clamp((38.5 - cand.stats.minutesPg) / 14, 0.12, 1.35);
          const rolePresence = clamp(cand.stats.minutesPg / 24, 0.45, 1.25);
          const minW = posAff * minHeadroom * rolePresence;
          const usgW =
            posAff *
            clamp((cand.stats.usgPct || 16) / 20, 0.65, 1.5) *
            clamp(cand.stats.minutesPg / 22, 0.5, 1.3);
          totalMinWeight += minW;
          totalUsgWeight += usgW;
          weights.push({ cand, minW, usgW });
        }

        if (totalMinWeight <= 0 || totalUsgWeight <= 0) continue;

        for (const { cand, minW, usgW } of weights) {
          const entry = accumMap.get(cand.player.id);
          if (!entry) continue;
          const shareMin = minW / totalMinWeight;
          const shareUsg = usgW / totalUsgWeight;

          let addMin = effMinPool * shareMin;
          let addUsg = effUsgPool * shareUsg;
          let addPts = effPtsPool * (shareUsg * 0.65 + shareMin * 0.35);
          let addFpts = effFptsPool * (shareUsg * 0.5 + shareMin * 0.5);

          // Blend with real empirical "Without Injured Player" game logs if >= 2 games exist
          if (missedSet && cand.stats.gp >= 4) {
            let withoutMin = 0;
            let withoutPts = 0;
            let withoutFpts = 0;
            let withoutCnt = 0;
            let withMin = 0;
            let withPts = 0;
            let withFpts = 0;
            let withCnt = 0;
            for (const [eid, gStats] of cand.stats.gameByEventId.entries()) {
              if (missedSet.has(eid)) {
                withoutMin += gStats.minutes;
                withoutPts += gStats.points;
                withoutFpts += gStats.fpts;
                withoutCnt++;
              } else {
                withMin += gStats.minutes;
                withPts += gStats.points;
                withFpts += gStats.fpts;
                withCnt++;
              }
            }
            if (withoutCnt >= 2 && withCnt >= 2) {
              const empMinD = withoutMin / withoutCnt - withMin / withCnt;
              const empPtsD = withoutPts / withoutCnt - withPts / withCnt;
              const empFptsD = withoutFpts / withoutCnt - withFpts / withCnt;
              const empAlpha = clamp(withoutCnt / 8, 0.25, 0.65);
              addMin = addMin * (1 - empAlpha) + Math.max(0, empMinD * inj.absenceProbability) * empAlpha;
              addPts = addPts * (1 - empAlpha) + Math.max(0, empPtsD * inj.absenceProbability) * empAlpha;
              addFpts = addFpts * (1 - empAlpha) + Math.max(0, empFptsD * inj.absenceProbability) * empAlpha;

              if (withoutCnt > entry.empGames) {
                entry.empGames = withoutCnt;
                entry.empMinDeltaSum = empMinD;
                entry.empPtsDeltaSum = empPtsD;
                entry.empFptsDeltaSum = empFptsD;
                entry.empCount = 1;
              }
            }
          }

          // Cap unrealistic single-player minute spikes
          const maxAddMin = Math.max(0.5, 39 - cand.stats.minutesPg);
          entry.minDelta += Math.min(addMin, maxAddMin);
          entry.usgDelta += addUsg;
          entry.ptsDelta += addPts;
          entry.fptsDelta += addFpts;

          if (shareMin >= 0.14 || shareUsg >= 0.15) {
            entry.triggeredBy.push({
              playerId: inj.playerId,
              name: inj.name,
              statusCode: inj.statusCode,
              shortTag: inj.shortTag,
            });
          }
        }
      }

      const ranked = [...accumMap.values()]
        .map((e) => {
          const cappedMin = round1(
            Math.min(e.minDelta, Math.max(0.5, 40 - e.cand.stats.minutesPg), 11.5)
          );
          const cappedUsg = round1(Math.min(e.usgDelta, 7.5));
          const cappedPts = round1(Math.min(e.ptsDelta, 9.5));
          const cappedFpts = round1(Math.min(e.fptsDelta, 15.0));

          let roleShiftLabel = "Refuerzo de rotación";
          if (e.cand.stats.minutesPg < 24 && cappedMin >= 4.0) {
            roleShiftLabel = "Titular emergente / +Minutos";
          } else if (cappedUsg >= 2.2 || cappedPts >= 2.6) {
            roleShiftLabel = "Mayor volumen ofensivo";
          } else if (cappedFpts >= 4.0) {
            roleShiftLabel = "Salto de producción";
          }

          return {
            playerId: e.cand.player.id,
            name: e.cand.player.name,
            teamId: teamObj?.id || teamMeta?.id || e.cand.player.teamId || abbr,
            teamAbbr: abbr,
            teamName: teamObj?.name || teamMeta?.name || abbr,
            position: e.cand.player.position || "G-F",
            headshotUrl: e.cand.player.headshotUrl,
            baseMinutesPg: e.cand.stats.minutesPg,
            basePointsPg: e.cand.stats.pointsPg,
            baseReboundsPg: e.cand.stats.reboundsPg,
            baseAssistsPg: e.cand.stats.assistsPg,
            baseUsgPct: e.cand.stats.usgPct,
            baseFantasyPtsPg: e.cand.stats.fantasyPtsPg,
            projectedMinDelta: cappedMin,
            projectedUsgDelta: cappedUsg,
            projectedPtsDelta: cappedPts,
            projectedFptsDelta: cappedFpts,
            roleShiftLabel,
            triggeredBy: e.triggeredBy.slice(0, 3),
            empiricalGamesWithout: e.empGames,
            empiricalMinDelta: e.empCount > 0 ? round1(e.empMinDeltaSum) : null,
            empiricalPtsDelta: e.empCount > 0 ? round1(e.empPtsDeltaSum) : null,
            empiricalFptsDelta: e.empCount > 0 ? round1(e.empFptsDeltaSum) : null,
          };
        })
        .filter((b) => b.projectedMinDelta >= 1.2 || b.projectedFptsDelta >= 2.0)
        .sort(
          (a, b) =>
            b.projectedFptsDelta * 1.15 +
            b.projectedMinDelta * 1.3 -
            (a.projectedFptsDelta * 1.15 + a.projectedMinDelta * 1.3)
        )
        .slice(0, 4);

      beneficiaries.push(...ranked);
      allBeneficiaries.push(...ranked);
    }

    teamsImpact.push({
      teamId: teamObj?.id || teamMeta?.id || abbr,
      teamAbbr: abbr,
      teamName: teamObj?.name || teamMeta?.name || abbr,
      conference: normalizeConference(teamObj?.conference || teamMeta?.conference, abbr),
      logoUrl: teamObj?.logoUrl,
      wins: teamObj?.wins ?? 0,
      losses: teamObj?.losses ?? 0,
      totalInjured: teamInjuries.length,
      outOrIrCount,
      doubtfulCount,
      questionableOrDtdCount,
      probableCount,
      keyStartersAffected,
      vacatedMinutes,
      vacatedPoints,
      vacatedRebounds,
      vacatedAssists,
      vacatedUsage,
      vacatedFantasyPts,
      impactScore,
      impactTier,
      injuries: teamInjuries,
      beneficiaries,
    });
  }

  teamsImpact.sort((a, b) => {
    if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
    return b.vacatedMinutes - a.vacatedMinutes;
  });

  allBeneficiaries.sort(
    (a, b) =>
      b.projectedFptsDelta * 1.2 +
      b.projectedMinDelta * 1.25 -
      (a.projectedFptsDelta * 1.2 + a.projectedMinDelta * 1.25)
  );

  const summary = {
    totalReported: entries.length,
    outOrIrCount: entries.filter(
      (e) => e.statusCode === "out" || e.statusCode === "ir" || e.statusCode === "suspended"
    ).length,
    doubtfulCount: entries.filter((e) => e.statusCode === "doubtful").length,
    questionableOrDtdCount: entries.filter(
      (e) => e.statusCode === "questionable" || e.statusCode === "dtd"
    ).length,
    probableCount: entries.filter((e) => e.statusCode === "probable").length,
    teamsAffected: teamsImpact.length,
    totalVacatedMinutes: round1(
      teamsImpact.reduce((acc, t) => acc + t.vacatedMinutes, 0)
    ),
    mostImpactedTeamAbbr: teamsImpact[0]?.teamAbbr || null,
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    source,
    summary,
    entries,
    teams: teamsImpact,
    topBeneficiaries: allBeneficiaries.slice(0, 20),
  };

  cachedInjuriesResponse = {
    expiresAt: Date.now() + 8 * 60 * 1000,
    payload,
  };
  return payload;
}
