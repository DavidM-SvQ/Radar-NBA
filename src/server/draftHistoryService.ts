// @ts-nocheck
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { NBA_TEAMS_MAP } from "../utils/teamLogos.ts";
import { normalizePlayerLookupKey } from "../utils/fantasyScoring.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR =
  [
    path.resolve(process.cwd(), "data"),
    path.resolve(__dirname, "../data"),
    path.resolve(__dirname, "../../data"),
  ].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "data");

const DRAFT_HISTORY_SNAPSHOT_FILE = path.join(DATA_DIR, "nba-draft-history.json.gz");
const SERVERLESS_TMP_DRAFT_FILE = "/tmp/radarnba-draft-history.json.gz";
const CAREER_HISTORY_SNAPSHOT_FILE = path.join(DATA_DIR, "nba-career-history.json.gz");

const ESPN_ALLOWED_HOST = "site.api.espn.com";
const DRAFT_SNAPSHOT_SCHEMA_VERSION = 1;
const DRAFT_MIN_YEAR = 2001;
const DRAFT_MAX_YEAR = 2026;

const ESPN_ABBR_NORMALIZE = {
  GS: "GSW",
  NY: "NYK",
  SA: "SAS",
  NO: "NOP",
  NOH: "NOP",
  NOK: "NOP",
  UTAH: "UTA",
  WSH: "WAS",
  NJN: "BKN",
  NJ: "BKN",
  SEA: "OKC",
  VAN: "MEM",
  CHH: "CHA",
  PHO: "PHX",
  PHX: "PHX",
  BRK: "BKN",
  CHO: "CHA",
};

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function buildEspnDraftUrl(year) {
  const yr = Number(year);
  if (!Number.isInteger(yr) || yr < DRAFT_MIN_YEAR || yr > DRAFT_MAX_YEAR) return null;
  const u = new URL(
    `https://${ESPN_ALLOWED_HOST}/apis/site/v2/sports/basketball/nba/draft?season=${yr}`
  );
  if (u.hostname !== ESPN_ALLOWED_HOST || u.protocol !== "https:") return null;
  return u.toString();
}

function normalizeTeamAbbr(rawAbbr, rawName) {
  const upper = String(rawAbbr || "").trim().toUpperCase();
  if (ESPN_ABBR_NORMALIZE[upper]) return ESPN_ABBR_NORMALIZE[upper];
  if (NBA_TEAMS_MAP[upper]) return upper;

  const lowerName = String(rawName || "").toLowerCase();
  if (lowerName.includes("sonics") || lowerName.includes("thunder")) return "OKC";
  if (lowerName.includes("nets")) return "BKN";
  if (lowerName.includes("hornets") || lowerName.includes("bobcats")) return "CHA";
  if (lowerName.includes("pelicans")) return "NOP";
  if (lowerName.includes("grizzlies")) return "MEM";
  if (lowerName.includes("wizards")) return "WAS";
  if (lowerName.includes("warriors")) return "GSW";
  if (lowerName.includes("spurs")) return "SAS";
  if (lowerName.includes("knicks")) return "NYK";
  if (lowerName.includes("jazz")) return "UTA";
  return upper || "NBA";
}

function classifyDraftTier(round, overall) {
  if (round === 1 && overall <= 14) return "lottery";
  if (round === 1) return "first_round";
  return "second_round";
}

function readRawDraftArchiveFromDisk() {
  for (const candidate of [DRAFT_HISTORY_SNAPSHOT_FILE, SERVERLESS_TMP_DRAFT_FILE]) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = zlib.gunzipSync(fs.readFileSync(candidate)).toString("utf-8");
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.schemaVersion === DRAFT_SNAPSHOT_SCHEMA_VERSION &&
        Array.isArray(parsed.classes) &&
        parsed.classes.length >= 20
      ) {
        return parsed;
      }
    } catch {
      // Try next path
    }
  }
  return null;
}

function writeRawDraftArchiveToDisk(archive) {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(archive), "utf-8"));
  for (const target of [DRAFT_HISTORY_SNAPSHOT_FILE, SERVERLESS_TMP_DRAFT_FILE]) {
    try {
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target, gz);
      return true;
    } catch {
      // Fallback to /tmp in read-only serverless environments
    }
  }
  return false;
}

async function fetchSingleDraftYearFromEspn(year) {
  const url = buildEspnDraftUrl(year);
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RadarNBA/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const picksRaw = Array.isArray(data?.picks) ? data.picks : [];
    if (picksRaw.length === 0) return null;

    const teamMap = new Map();
    for (const t of Array.isArray(data?.teams) ? data.teams : []) {
      if (t?.id) {
        teamMap.set(String(t.id), {
          abbr: String(t.abbreviation || "").toUpperCase(),
          name: String(t.displayName || t.shortDisplayName || t.abbreviation || ""),
          logo: t.darkLogo || t.logo || "",
        });
      }
    }

    const posMap = new Map();
    for (const pos of Array.isArray(data?.positions) ? data.positions : []) {
      if (pos?.id) {
        posMap.set(String(pos.id), String(pos.abbreviation || pos.displayName || ""));
      }
    }

    const picks = picksRaw
      .map((p) => {
        const athlete = p?.athlete || {};
        const name = String(athlete.displayName || athlete.fullName || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!name) return null;
        const round = Number(p.round) || 1;
        const overall = Number(p.overall) || 0;
        const roundPick = Number(p.pick) || overall;
        const rawTeam = teamMap.get(String(p.teamId || "")) || {};
        const teamAbbr = normalizeTeamAbbr(rawTeam.abbr, rawTeam.name);
        const canonicalTeam = NBA_TEAMS_MAP[teamAbbr];
        const teamName = rawTeam.name || canonicalTeam?.name || teamAbbr;
        const originTeam = athlete.team || {};
        const origin = String(
          originTeam.shortDisplayName ||
            originTeam.location ||
            originTeam.displayName ||
            originTeam.name ||
            "Internacional / Sin datos"
        ).trim();

        const posId = athlete?.position?.id ? String(athlete.position.id) : "";
        const position =
          String(athlete?.position?.abbreviation || posMap.get(posId) || "—").trim() || "—";

        return {
          id: `${year}-${overall || roundPick}-${normalizePlayerLookupKey(name)}`,
          year,
          round,
          roundPick,
          overall,
          tier: classifyDraftTier(round, overall),
          playerName: name,
          espnId: athlete.alternativeId ? String(athlete.alternativeId) : null,
          espnHeadshotUrl: athlete?.headshot?.href || undefined,
          position,
          height: String(athlete.displayHeight || "—"),
          weight: String(athlete.displayWeight || "—"),
          origin,
          draftedByTeamAbbr: teamAbbr,
          draftedByTeamName: teamName,
          draftedByLogoUrl: rawTeam.logo || undefined,
          traded: Boolean(p.traded),
          tradeNote: String(p.tradeNote || "").trim(),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.overall - b.overall);

    return {
      year,
      displayName: `Draft NBA ${year}`,
      picks,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFullDraftArchiveFromEspn() {
  const years = [];
  for (let y = DRAFT_MAX_YEAR; y >= DRAFT_MIN_YEAR; y--) {
    years.push(y);
  }

  const classes = [];
  const batchSize = 6;
  for (let i = 0; i < years.length; i += batchSize) {
    const batch = years.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((y) => fetchSingleDraftYearFromEspn(y)));
    for (const item of results) {
      if (item && item.picks.length > 0) {
        classes.push(item);
      }
    }
  }

  classes.sort((a, b) => b.year - a.year);
  return {
    schemaVersion: DRAFT_SNAPSHOT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    minYear: classes.length > 0 ? classes[classes.length - 1].year : DRAFT_MIN_YEAR,
    maxYear: classes.length > 0 ? classes[0].year : DRAFT_MAX_YEAR,
    classes,
  };
}

let cachedCareerIndex = null;
function loadCareerHistoryIndex() {
  if (cachedCareerIndex) return cachedCareerIndex;
  const byNormName = new Map();
  try {
    if (fs.existsSync(CAREER_HISTORY_SNAPSHOT_FILE)) {
      const raw = zlib.gunzipSync(fs.readFileSync(CAREER_HISTORY_SNAPSHOT_FILE)).toString("utf-8");
      const parsed = JSON.parse(raw);
      const playersMap = parsed?.players || {};
      for (const [playerId, entry] of Object.entries(playersMap)) {
        if (!entry || !entry.name) continue;
        const normKey = normalizePlayerLookupKey(entry.name);
        if (!normKey) continue;
        const seasons = Array.isArray(entry?.regular?.seasons) ? entry.regular.seasons : [];
        const playoffSeasons = Array.isArray(entry?.playoffs?.seasons) ? entry.playoffs.seasons : [];

        let gp = 0;
        let pts = 0;
        let reb = 0;
        let ast = 0;
        let stl = 0;
        let blk = 0;
        let gmScWeightedSum = 0;
        let gmScGp = 0;
        let peakPpg = 0;
        let peakGmSc = 0;
        for (const s of seasons) {
          const sGp = Number(s.gp) || 0;
          const sPts = Number(s.pts) || 0;
          gp += sGp;
          pts += sPts;
          reb += Number(s.reb) || 0;
          ast += Number(s.ast) || 0;
          stl += Number(s.stl) || 0;
          blk += Number(s.blk) || 0;
          const sGmSc = Number(s.gmScPg);
          if (Number.isFinite(sGmSc) && sGp > 0) {
            gmScWeightedSum += sGmSc * sGp;
            gmScGp += sGp;
          }
          if (sGp >= 20) {
            const ppg = sPts / sGp;
            if (ppg > peakPpg) peakPpg = ppg;
            if (Number.isFinite(sGmSc) && sGmSc > peakGmSc) peakGmSc = sGmSc;
          }
        }
        const careerGmScPg =
          gmScGp > 0
            ? round1(gmScWeightedSum / gmScGp)
            : gp > 0
            ? round1((pts + reb * 0.5 + ast * 0.7 + stl + blk * 0.7) / gp)
            : 0;
        if (peakPpg === 0 && gp > 0) peakPpg = pts / gp;
        if (peakGmSc === 0 && careerGmScPg > 0) peakGmSc = careerGmScPg;

        let playoffGp = 0;
        for (const ps of playoffSeasons) {
          playoffGp += Number(ps.gp) || 0;
        }

        const candidate = {
          playerId: String(entry.playerId || playerId),
          name: String(entry.name),
          currentTeamAbbr: entry.currentTeamAbbr ? String(entry.currentTeamAbbr) : null,
          rookieYear: entry.rookieSeason ? Number(String(entry.rookieSeason).slice(0, 4)) : null,
          careerSeasons: seasons.length,
          careerGp: gp,
          careerPtsTotal: Math.round(pts),
          careerPpg: gp > 0 ? round1(pts / gp) : 0,
          careerRpg: gp > 0 ? round1(reb / gp) : 0,
          careerApg: gp > 0 ? round1(ast / gp) : 0,
          careerStlPg: gp > 0 ? round1(stl / gp) : 0,
          careerBlkPg: gp > 0 ? round1(blk / gp) : 0,
          careerGmScPg,
          careerPeakPpg: round1(peakPpg),
          careerPeakGmSc: round1(peakGmSc),
          careerPlayoffGp: playoffGp,
        };

        const existing = byNormName.get(normKey);
        if (!existing) {
          byNormName.set(normKey, [candidate]);
        } else {
          existing.push(candidate);
        }
      }
    }
  } catch {
    // Non-fatal if career snapshot missing
  }
  cachedCareerIndex = byNormName;
  return byNormName;
}

function buildActive2027Index(players) {
  const byNormName = new Map();
  const byId = new Map();
  for (const p of Array.isArray(players) ? players : []) {
    if (!p?.name) continue;
    const normKey = normalizePlayerLookupKey(p.name);
    const games = Array.isArray(p.games) ? p.games : [];
    const gp = games.length;
    let minSum = 0;
    let ptsSum = 0;
    let rebSum = 0;
    let astSum = 0;
    let stlSum = 0;
    let blkSum = 0;
    let gmScSum = 0;
    for (const g of games) {
      const pts = Number(g.points ?? g.pts) || 0;
      const reb = Number(g.rebounds ?? g.reb) || 0;
      const ast = Number(g.assists ?? g.ast) || 0;
      const stl = Number(g.steals ?? g.stl) || 0;
      const blk = Number(g.blocks ?? g.blk) || 0;
      const tov = Number(g.turnovers ?? g.tov) || 0;
      const fgm = Number(g.fgm) || 0;
      const fga = Number(g.fga) || 0;
      const ftm = Number(g.ftm) || 0;
      const fta = Number(g.fta) || 0;
      const pf = Number(g.pf) || 0;
      minSum += Number(g.minutes ?? g.min) || 0;
      ptsSum += pts;
      rebSum += reb;
      astSum += ast;
      stlSum += stl;
      blkSum += blk;
      const gameGmSc = Number(g.gameScore ?? g.gmSc);
      if (Number.isFinite(gameGmSc)) {
        gmScSum += gameGmSc;
      } else {
        // Official John Hollinger Game Score formula
        const oreb = Number(g.oreb) || reb * 0.25;
        const dreb = Number(g.dreb) || reb * 0.75;
        gmScSum +=
          pts +
          0.4 * fgm -
          0.7 * fga -
          0.4 * (fta - ftm) +
          0.7 * oreb +
          0.3 * dreb +
          stl +
          0.7 * ast +
          0.7 * blk -
          0.4 * pf -
          tov;
      }
    }
    const entry = {
      playerId: String(p.id),
      teamAbbr: String(p.teamAbbr || ""),
      headshotUrl: p.headshotUrl || undefined,
      gp,
      minPg: gp > 0 ? round1(minSum / gp) : 0,
      ptsPg: gp > 0 ? round1(ptsSum / gp) : 0,
      rebPg: gp > 0 ? round1(rebSum / gp) : 0,
      astPg: gp > 0 ? round1(astSum / gp) : 0,
      stlPg: gp > 0 ? round1(stlSum / gp) : 0,
      blkPg: gp > 0 ? round1(blkSum / gp) : 0,
      gmScPg: gp > 0 ? round1(gmScSum / gp) : 0,
    };
    if (normKey) byNormName.set(normKey, entry);
    if (entry.playerId) byId.set(entry.playerId, entry);
  }
  return { byNormName, byId };
}

function pickBestCareerMatch(candidates, draftYear) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) {
    const c = candidates[0];
    // Avoid matching a 2026 rookie to a completely different 2004 veteran with same name
    if (c.rookieYear && Math.abs(c.rookieYear - draftYear) > 5) return null;
    return c;
  }
  return (
    candidates.find((c) => c.rookieYear && Math.abs(c.rookieYear - draftYear) <= 3) ||
    candidates[0]
  );
}

let inMemoryArchive = null;
let inFlightArchivePromise = null;

export async function buildDraftHistoryPayload({ players = [], forceRefresh = false } = {}) {
  let archive = !forceRefresh ? inMemoryArchive : null;
  let source = "disk_cache";

  if (!archive && !forceRefresh) {
    archive = readRawDraftArchiveFromDisk();
    if (archive) {
      inMemoryArchive = archive;
      source = "disk_cache";
    }
  }

  if (!archive || forceRefresh) {
    if (!inFlightArchivePromise) {
      inFlightArchivePromise = fetchFullDraftArchiveFromEspn()
        .then((fetched) => {
          if (fetched && fetched.classes.length > 0) {
            inMemoryArchive = fetched;
            writeRawDraftArchiveToDisk(fetched);
            return fetched;
          }
          return null;
        })
        .finally(() => {
          inFlightArchivePromise = null;
        });
    }
    const fetched = await inFlightArchivePromise;
    if (fetched) {
      archive = fetched;
      source = "espn_live";
    } else if (!archive) {
      archive = readRawDraftArchiveFromDisk();
      source = "disk_cache";
    }
  }

  if (!archive || !Array.isArray(archive.classes) || archive.classes.length === 0) {
    throw new Error("No se pudo cargar el archivo histórico del Draft NBA.");
  }

  const careerByNorm = loadCareerHistoryIndex();
  const { byNormName: activeByNorm, byId: activeById } = buildActive2027Index(players);

  let totalPicks = 0;
  let activeIn2027Count = 0;
  let trackedCareerCount = 0;
  let lotteryPicksCount = 0;
  let secondRoundActiveCount = 0;

  const enrichedClasses = archive.classes.map((cls) => {
    let clsActive = 0;
    let clsTracked = 0;
    let clsLottery = 0;
    let clsFirst = 0;
    let clsSecond = 0;
    let topActiveScorerName = null;
    let topActiveScorerPpg = null;

    const picks = cls.picks.map((rawPick) => {
      const cleanPlayerName = String(rawPick.playerName || "")
        .replace(/\s+/g, " ")
        .trim();
      const normName = normalizePlayerLookupKey(cleanPlayerName);
      const career = pickBestCareerMatch(careerByNorm.get(normName), cls.year);
      const active27 =
        (career?.playerId ? activeById.get(String(career.playerId)) : null) ||
        activeByNorm.get(normName) ||
        null;

      // Guard against rare father/son or same-name collision across distant eras
      const validActive27 =
        active27 && (!career || cls.year >= 2003)
          ? career || cls.year >= 2018
            ? active27
            : null
          : null;

      const playerId = validActive27?.playerId || career?.playerId || null;
      const isActive2027 = Boolean(validActive27);
      const currentTeamAbbr = validActive27?.teamAbbr || career?.currentTeamAbbr || null;

      // Use career history when it has played games; otherwise fall back to 2026-27 rookie games
      const hasCareerGames = Boolean(career && career.careerGp > 0);
      const hasActive27Games = Boolean(validActive27 && validActive27.gp > 0);

      const careerGp = hasCareerGames ? career.careerGp : hasActive27Games ? validActive27.gp : null;
      const careerPpg = hasCareerGames
        ? career.careerPpg
        : hasActive27Games
        ? validActive27.ptsPg
        : null;
      const careerRpg = hasCareerGames
        ? career.careerRpg
        : hasActive27Games
        ? validActive27.rebPg
        : null;
      const careerApg = hasCareerGames
        ? career.careerApg
        : hasActive27Games
        ? validActive27.astPg
        : null;
      const careerStlPg = hasCareerGames
        ? career.careerStlPg
        : hasActive27Games
        ? validActive27.stlPg
        : null;
      const careerBlkPg = hasCareerGames
        ? career.careerBlkPg
        : hasActive27Games
        ? validActive27.blkPg
        : null;
      const careerGmScPg = hasCareerGames
        ? career.careerGmScPg
        : hasActive27Games
        ? validActive27.gmScPg
        : null;
      const careerPeakPpg = hasCareerGames
        ? career.careerPeakPpg
        : hasActive27Games
        ? validActive27.ptsPg
        : null;
      const careerPeakGmSc = hasCareerGames
        ? career.careerPeakGmSc
        : hasActive27Games
        ? validActive27.gmScPg
        : null;
      const careerPtsTotal = hasCareerGames
        ? career.careerPtsTotal
        : hasActive27Games
        ? Math.round(validActive27.ptsPg * validActive27.gp)
        : null;
      const careerSeasons = hasCareerGames
        ? career.careerSeasons
        : hasActive27Games
        ? 1
        : null;
      const careerPlayoffGp = hasCareerGames ? career.careerPlayoffGp : null;

      totalPicks += 1;
      if (rawPick.tier === "lottery") {
        clsLottery += 1;
        lotteryPicksCount += 1;
      } else if (rawPick.tier === "first_round") {
        clsFirst += 1;
      } else {
        clsSecond += 1;
      }

      if (isActive2027) {
        clsActive += 1;
        activeIn2027Count += 1;
        if (rawPick.tier === "second_round") secondRoundActiveCount += 1;
        if (
          validActive27 &&
          validActive27.gp >= 5 &&
          (topActiveScorerPpg === null || validActive27.ptsPg > topActiveScorerPpg)
        ) {
          topActiveScorerPpg = validActive27.ptsPg;
          topActiveScorerName = cleanPlayerName;
        }
      }
      if (careerGp !== null && careerGp > 0) {
        clsTracked += 1;
        trackedCareerCount += 1;
      }

      const nbaHeadshot = playerId
        ? `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`
        : rawPick.espnHeadshotUrl;

      return {
        id: rawPick.id,
        year: cls.year,
        round: rawPick.round,
        roundPick: rawPick.roundPick,
        overall: rawPick.overall,
        tier: rawPick.tier,
        playerName: cleanPlayerName,
        playerId,
        espnId: rawPick.espnId,
        headshotUrl: validActive27?.headshotUrl || nbaHeadshot,
        position: rawPick.position,
        height: rawPick.height,
        weight: rawPick.weight,
        origin: rawPick.origin,
        draftedByTeamAbbr: rawPick.draftedByTeamAbbr,
        draftedByTeamName: rawPick.draftedByTeamName,
        draftedByLogoUrl: rawPick.draftedByLogoUrl,
        traded: rawPick.traded,
        tradeNote: rawPick.tradeNote,
        isActive2027,
        currentTeamAbbr,
        season27Gp: validActive27 ? validActive27.gp : null,
        season27MinPg: validActive27 ? validActive27.minPg : null,
        season27PtsPg: validActive27 ? validActive27.ptsPg : null,
        season27RebPg: validActive27 ? validActive27.rebPg : null,
        season27AstPg: validActive27 ? validActive27.astPg : null,
        careerSeasons,
        careerGp,
        careerPtsTotal,
        careerPpg,
        careerRpg,
        careerApg,
        careerStlPg,
        careerBlkPg,
        careerGmScPg,
        careerPeakPpg,
        careerPeakGmSc,
        careerPlayoffGp,
      };
    });

    const firstPick = picks.find((p) => p.overall === 1) || picks[0];

    return {
      year: cls.year,
      displayName: `Draft NBA ${cls.year}`,
      pickCount: picks.length,
      lotteryCount: clsLottery,
      firstRoundCount: clsFirst,
      secondRoundCount: clsSecond,
      activeIn2027Count: clsActive,
      trackedCareerCount: clsTracked,
      numberOnePickName: firstPick?.playerName || "—",
      numberOneTeamAbbr: firstPick?.draftedByTeamAbbr || "NBA",
      numberOnePlayerId: firstPick?.playerId || null,
      topActiveScorerName,
      topActiveScorerPpg,
      picks,
    };
  });

  return {
    generatedAt: archive.generatedAt || new Date().toISOString(),
    source,
    minYear: archive.minYear || DRAFT_MIN_YEAR,
    maxYear: archive.maxYear || DRAFT_MAX_YEAR,
    availableYears: enrichedClasses.map((c) => c.year),
    summary: {
      totalClasses: enrichedClasses.length,
      totalPicks,
      activeIn2027Count,
      trackedCareerCount,
      lotteryPicksCount,
      secondRoundActiveCount,
    },
    classes: enrichedClasses,
  };
}
