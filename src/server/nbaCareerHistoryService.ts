// @ts-nocheck
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { NBA_TEAMS_MAP } from "../utils/teamLogos.ts";
import {
  readNbaBiosSnapshotFromDisk,
  readNbaSeasonSnapshotFromDisk,
} from "./nbaSnapshotStore.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CAREER_HISTORY_FILENAME = "nba-career-history.json.gz";

const NBA_STATS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

const HISTORICAL_SEASONS_CLOSED = [
  "2003-04",
  "2004-05",
  "2005-06",
  "2006-07",
  "2007-08",
  "2008-09",
  "2009-10",
  "2010-11",
  "2011-12",
  "2012-13",
  "2013-14",
  "2014-15",
  "2015-16",
  "2016-17",
  "2017-18",
  "2018-19",
  "2019-20",
  "2020-21",
  "2021-22",
  "2022-23",
  "2023-24",
  "2024-25",
  "2025-26",
];

function round1(val) {
  return Math.round((Number(val) || 0) * 10) / 10;
}

function round3(val) {
  return Math.round((Number(val) || 0) * 1000) / 1000;
}

function getCandidatePaths(fileName) {
  return Array.from(
    new Set([
      path.resolve(process.cwd(), "data", fileName),
      path.resolve(__dirname, "data", fileName),
      path.resolve(__dirname, "..", "data", fileName),
      path.resolve(__dirname, "..", "..", "data", fileName),
      path.resolve(__dirname, "..", "..", "..", "data", fileName),
    ])
  );
}

function getWritePath(fileName) {
  const cwdData = path.resolve(process.cwd(), "data");
  if (fs.existsSync(cwdData)) return path.join(cwdData, fileName);
  return path.resolve(__dirname, "../../data", fileName);
}

function writeGzipJsonAtomic(targetPath, payload, level = 9) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const jsonBuf = Buffer.from(JSON.stringify(payload), "utf8");
  const gzBuf = zlib.gzipSync(jsonBuf, { level });
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, gzBuf);
  fs.renameSync(tmpPath, targetPath);
  const stat = fs.statSync(targetPath);
  return {
    filePath: targetPath,
    mtimeMs: stat.mtimeMs,
    bytesCompressed: gzBuf.byteLength,
    bytesUncompressed: jsonBuf.byteLength,
  };
}

let memoryCareerHistoryCache = null;

export function readCareerHistorySnapshotFromDisk() {
  for (const filePath of getCandidatePaths(CAREER_HISTORY_FILENAME)) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      if (
        memoryCareerHistoryCache &&
        memoryCareerHistoryCache.filePath === filePath &&
        memoryCareerHistoryCache.mtimeMs === stat.mtimeMs
      ) {
        return memoryCareerHistoryCache.data;
      }
      const compressed = fs.readFileSync(filePath);
      const parsed = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
      if (!parsed || typeof parsed !== "object" || !parsed.players) continue;
      memoryCareerHistoryCache = {
        filePath,
        mtimeMs: stat.mtimeMs,
        data: parsed,
      };
      return parsed;
    } catch (err) {
      console.warn(`[RadarNBA CareerHistory] Error leyendo ${filePath}:`, err?.message || err);
    }
  }
  return null;
}

function normalizeAbbr(raw) {
  const up = String(raw || "").toUpperCase().trim();
  const alias = {
    NJN: "BKN",
    SEA: "OKC",
    NOK: "NOP",
    NOH: "NOP",
    CHH: "CHA",
    CHA: "CHA",
    VAN: "MEM",
    SDC: "LAC",
    KCK: "SAC",
    WSB: "WAS",
    UTH: "UTA",
    UTAH: "UTA",
    GS: "GSW",
    SA: "SAS",
    NY: "NYK",
    NO: "NOP",
    WSH: "WAS",
    PHO: "PHX",
  };
  return alias[up] || up;
}

function parseOpponentFromMatchup(matchup, teamAbbr) {
  const m = String(matchup || "").trim();
  const parts = m.split(/\s+(?:vs\.|@)\s+/i);
  if (parts.length === 2) {
    const a = parts[0].trim().toUpperCase();
    const b = parts[1].trim().toUpperCase();
    if (a === String(teamAbbr || "").toUpperCase()) return b;
    return b || a;
  }
  return "";
}

function computeGameScoreRaw(g) {
  return round1(
    g.pts +
      0.4 * g.fgm -
      0.7 * g.fga -
      0.4 * (g.fta - g.ftm) +
      0.7 * g.oreb +
      0.3 * g.dreb +
      g.stl +
      0.7 * g.ast +
      0.7 * g.blk -
      0.4 * g.pf -
      g.tov
  );
}

function createEmptyHighs() {
  return {
    pts: null,
    reb: null,
    ast: null,
    fg3m: null,
    stl: null,
    blk: null,
    min: null,
    fgm: null,
    ftm: null,
    pra: null,
    gameScore: null,
  };
}

function maybeUpdateHigh(highs, key, val, meta) {
  const num = Number(val) || 0;
  if (num <= 0) return;
  const cur = highs[key];
  if (!cur || num > cur.value || (num === cur.value && meta.date > (cur.date || ""))) {
    highs[key] = {
      value: key === "gameScore" || key === "min" ? round1(num) : Math.round(num),
      date: meta.date,
      season: meta.season,
      teamAbbr: meta.teamAbbr,
      opponentAbbr: meta.opponentAbbr,
      result: meta.result || "",
      isCurrentSeason: meta.season === "2026-27",
    };
  }
}

function finalizeSeasonLine(acc) {
  const gp = Math.max(1, acc.gp || 0);
  const fgPct = acc.fga > 0 ? round1((acc.fgm / acc.fga) * 100) : 0;
  const fg3Pct = acc.fg3a > 0 ? round1((acc.fg3m / acc.fg3a) * 100) : 0;
  const ftPct = acc.fta > 0 ? round1((acc.ftm / acc.fta) * 100) : 0;
  const tsDenom = 2 * (acc.fga + 0.44 * acc.fta);
  const tsPct = tsDenom > 0 ? round1((acc.pts / tsDenom) * 100) : 0;
  const efgPct = acc.fga > 0 ? round1(((acc.fgm + 0.5 * acc.fg3m) / acc.fga) * 100) : 0;
  const gmScTotal =
    acc.pts +
    0.4 * acc.fgm -
    0.7 * acc.fga -
    0.4 * (acc.fta - acc.ftm) +
    0.7 * acc.oreb +
    0.3 * acc.dreb +
    acc.stl +
    0.7 * acc.ast +
    0.7 * acc.blk -
    0.4 * acc.pf -
    acc.tov;

  return {
    season: acc.season,
    teamAbbr: acc.teamAbbr,
    gp: acc.gp,
    wins: acc.wins,
    losses: acc.losses,
    min: Math.round(acc.min),
    pts: Math.round(acc.pts),
    reb: Math.round(acc.reb),
    oreb: Math.round(acc.oreb),
    dreb: Math.round(acc.dreb),
    ast: Math.round(acc.ast),
    stl: Math.round(acc.stl),
    blk: Math.round(acc.blk),
    tov: Math.round(acc.tov),
    pf: Math.round(acc.pf),
    fgm: Math.round(acc.fgm),
    fga: Math.round(acc.fga),
    fg3m: Math.round(acc.fg3m),
    fg3a: Math.round(acc.fg3a),
    ftm: Math.round(acc.ftm),
    fta: Math.round(acc.fta),
    plusMinus: Math.round(acc.plusMinus || 0),
    dd2: acc.dd2 || 0,
    td3: acc.td3 || 0,
    minPg: round1(acc.min / gp),
    ptsPg: round1(acc.pts / gp),
    rebPg: round1(acc.reb / gp),
    astPg: round1(acc.ast / gp),
    stlPg: round1(acc.stl / gp),
    blkPg: round1(acc.blk / gp),
    tovPg: round1(acc.tov / gp),
    fgPct,
    fg3Pct,
    ftPct,
    tsPct,
    efgPct,
    gmScPg: round1(gmScTotal / gp),
  };
}

function buildCareerBucketFromSeasonsAndHighs(seasons, highs, isPlayoffs = false) {
  const sorted = [...(seasons || [])].sort((a, b) => a.season.localeCompare(b.season));
  const totals = {
    seasonsCount: sorted.length,
    gp: 0,
    wins: 0,
    losses: 0,
    min: 0,
    pts: 0,
    reb: 0,
    oreb: 0,
    dreb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    fgm: 0,
    fga: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
    dd2: 0,
    td3: 0,
  };
  let pfTotal = 0;

  for (const s of sorted) {
    totals.gp += s.gp || 0;
    totals.wins += s.wins || 0;
    totals.losses += s.losses || 0;
    totals.min += s.min || 0;
    totals.pts += s.pts || 0;
    totals.reb += s.reb || 0;
    totals.oreb += s.oreb || 0;
    totals.dreb += s.dreb || 0;
    totals.ast += s.ast || 0;
    totals.stl += s.stl || 0;
    totals.blk += s.blk || 0;
    totals.tov += s.tov || 0;
    totals.fgm += s.fgm || 0;
    totals.fga += s.fga || 0;
    totals.fg3m += s.fg3m || 0;
    totals.fg3a += s.fg3a || 0;
    totals.ftm += s.ftm || 0;
    totals.fta += s.fta || 0;
    totals.dd2 += s.dd2 || 0;
    totals.td3 += s.td3 || 0;
    pfTotal += s.pf || 0;
  }

  const gpDiv = Math.max(1, totals.gp);
  const fgPct = totals.fga > 0 ? round1((totals.fgm / totals.fga) * 100) : 0;
  const fg3Pct = totals.fg3a > 0 ? round1((totals.fg3m / totals.fg3a) * 100) : 0;
  const ftPct = totals.fta > 0 ? round1((totals.ftm / totals.fta) * 100) : 0;
  const tsDenom = 2 * (totals.fga + 0.44 * totals.fta);
  const tsPct = tsDenom > 0 ? round1((totals.pts / tsDenom) * 100) : 0;
  const efgPct =
    totals.fga > 0 ? round1(((totals.fgm + 0.5 * totals.fg3m) / totals.fga) * 100) : 0;
  const gmScTotal =
    totals.pts +
    0.4 * totals.fgm -
    0.7 * totals.fga -
    0.4 * (totals.fta - totals.ftm) +
    0.7 * totals.oreb +
    0.3 * totals.dreb +
    totals.stl +
    0.7 * totals.ast +
    0.7 * totals.blk -
    0.4 * pfTotal -
    totals.tov;

  const averages = {
    minPg: totals.gp > 0 ? round1(totals.min / gpDiv) : 0,
    ptsPg: totals.gp > 0 ? round1(totals.pts / gpDiv) : 0,
    rebPg: totals.gp > 0 ? round1(totals.reb / gpDiv) : 0,
    astPg: totals.gp > 0 ? round1(totals.ast / gpDiv) : 0,
    stlPg: totals.gp > 0 ? round1(totals.stl / gpDiv) : 0,
    blkPg: totals.gp > 0 ? round1(totals.blk / gpDiv) : 0,
    tovPg: totals.gp > 0 ? round1(totals.tov / gpDiv) : 0,
    fgPct,
    fg3Pct,
    ftPct,
    tsPct,
    efgPct,
    gmScPg: totals.gp > 0 ? round1(gmScTotal / gpDiv) : 0,
    winPct: totals.gp > 0 ? round1((totals.wins / gpDiv) * 100) : 0,
  };

  // Peak season: highest GameScore per game among qualifying seasons (fallback to all)
  const minPeakGp = isPlayoffs ? 4 : 25;
  const qualifying = sorted.filter((s) => s.gp >= minPeakGp);
  const pool = qualifying.length > 0 ? qualifying : sorted;
  let peakSeason = null;
  for (const s of pool) {
    if (!peakSeason || s.gmScPg > peakSeason.gmScPg || (s.gmScPg === peakSeason.gmScPg && s.ptsPg > peakSeason.ptsPg)) {
      peakSeason = s;
    }
  }

  return {
    seasons: sorted,
    totals,
    averages,
    peakSeason,
    careerHighs: highs || createEmptyHighs(),
  };
}

function buildActive2027OverlayForPlayer(activePlayer) {
  if (!activePlayer || !Array.isArray(activePlayer.games) || activePlayer.games.length === 0) {
    return { seasonLine: null, highs: createEmptyHighs() };
  }
  const games = activePlayer.games.filter((g) => !g.seasonLabel || g.seasonLabel === "2026-27");
  if (games.length === 0) {
    return { seasonLine: null, highs: createEmptyHighs() };
  }
  const teamSet = new Set();
  const acc = {
    season: "2026-27",
    teamAbbr: activePlayer.teamAbbr || "NBA",
    gp: 0,
    wins: 0,
    losses: 0,
    min: 0,
    pts: 0,
    reb: 0,
    oreb: 0,
    dreb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
    fgm: 0,
    fga: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
    plusMinus: 0,
    dd2: 0,
    td3: 0,
  };
  const highs = createEmptyHighs();

  for (const g of games) {
    const tAbbr = g.teamAbbr || activePlayer.teamAbbr || "NBA";
    teamSet.add(tAbbr);
    const pts = Number(g.points) || 0;
    const reb = Number(g.rebounds) || 0;
    const oreb = Number(g.oreb) || 0;
    const dreb = Number(g.dreb) || Math.max(0, reb - oreb);
    const ast = Number(g.assists) || 0;
    const stl = Number(g.steals) || 0;
    const blk = Number(g.blocks) || 0;
    const tov = Number(g.turnovers) || 0;
    const pf = Number(g.fouls) || 0;
    const min = Number(g.minutes) || 0;
    const fgm = Number(g.fgm) || 0;
    const fga = Number(g.fga) || 0;
    const fg3m = Number(g.fg3m) || 0;
    const fg3a = Number(g.fg3a) || 0;
    const ftm = Number(g.ftm) || 0;
    const fta = Number(g.fta) || 0;
    const pm = Number(g.plusMinus) || 0;
    const gmSc =
      typeof g.gameScore === "number"
        ? round1(g.gameScore)
        : computeGameScoreRaw({ pts, fgm, fga, ftm, fta, oreb, dreb, stl, ast, blk, pf, tov });

    acc.gp += 1;
    if (g.result === "W") acc.wins += 1;
    else acc.losses += 1;
    acc.min += min;
    acc.pts += pts;
    acc.reb += reb;
    acc.oreb += oreb;
    acc.dreb += dreb;
    acc.ast += ast;
    acc.stl += stl;
    acc.blk += blk;
    acc.tov += tov;
    acc.pf += pf;
    acc.fgm += fgm;
    acc.fga += fga;
    acc.fg3m += fg3m;
    acc.fg3a += fg3a;
    acc.ftm += ftm;
    acc.fta += fta;
    acc.plusMinus += pm;

    const tenCats = [pts, reb, ast, stl, blk].filter((v) => v >= 10).length;
    if (tenCats >= 2) acc.dd2 += 1;
    if (tenCats >= 3) acc.td3 += 1;

    const meta = {
      date: String(g.date || "").slice(0, 10),
      season: "2026-27",
      teamAbbr: tAbbr,
      opponentAbbr: g.opponentAbbr || "",
      result: g.result || "",
    };
    maybeUpdateHigh(highs, "pts", pts, meta);
    maybeUpdateHigh(highs, "reb", reb, meta);
    maybeUpdateHigh(highs, "ast", ast, meta);
    maybeUpdateHigh(highs, "fg3m", fg3m, meta);
    maybeUpdateHigh(highs, "stl", stl, meta);
    maybeUpdateHigh(highs, "blk", blk, meta);
    maybeUpdateHigh(highs, "min", min, meta);
    maybeUpdateHigh(highs, "fgm", fgm, meta);
    maybeUpdateHigh(highs, "ftm", ftm, meta);
    maybeUpdateHigh(highs, "pra", pts + reb + ast, meta);
    maybeUpdateHigh(highs, "gameScore", gmSc, meta);
  }

  acc.teamAbbr = Array.from(teamSet).join("/");
  return {
    seasonLine: finalizeSeasonLine(acc),
    highs,
  };
}

function mergeHighs(baseHighs, overlayHighs) {
  const merged = createEmptyHighs();
  for (const key of Object.keys(merged)) {
    const a = baseHighs?.[key] || null;
    const b = overlayHighs?.[key] || null;
    if (a && !b) {
      merged[key] = { ...a, isCurrentSeason: a.season === "2026-27" };
    } else if (!a && b) {
      merged[key] = { ...b, isCurrentSeason: b.season === "2026-27" };
    } else if (a && b) {
      if (b.value > a.value || (b.value === a.value && (b.date || "") > (a.date || ""))) {
        merged[key] = { ...b, isCurrentSeason: b.season === "2026-27" };
      } else {
        merged[key] = { ...a, isCurrentSeason: a.season === "2026-27" };
      }
    }
  }
  return merged;
}

export function getPlayerCareerProfile(playerId, activeDataset2027 = null, biosById = null) {
  const pid = String(playerId || "").trim();
  if (!pid) return null;

  const snap = readCareerHistorySnapshotFromDisk();
  const stored = snap?.players?.[pid] || null;
  const activePlayer = activeDataset2027?.playersById?.get(pid) || null;
  const bio = biosById?.get(pid) || null;

  if (!stored && !activePlayer) return null;

  const baseRegSeasons = (stored?.regular?.seasons || []).filter((s) => s.season !== "2026-27");
  const overlay2027 = buildActive2027OverlayForPlayer(activePlayer);
  const regSeasons = overlay2027.seasonLine
    ? [...baseRegSeasons, overlay2027.seasonLine]
    : baseRegSeasons;
  const regHighs = mergeHighs(stored?.regular?.careerHighs, overlay2027.highs);
  const regular = buildCareerBucketFromSeasonsAndHighs(regSeasons, regHighs, false);

  const poSeasons = stored?.playoffs?.seasons || [];
  const poHighs = mergeHighs(stored?.playoffs?.careerHighs, null);
  const playoffs = buildCareerBucketFromSeasonsAndHighs(poSeasons, poHighs, true);

  const allSeasons = regular.seasons.map((s) => s.season);
  const rookieSeason = allSeasons[0] || stored?.rookieSeason || "2026-27";
  const latestSeason = allSeasons[allSeasons.length - 1] || "2026-27";

  return {
    playerId: pid,
    name: activePlayer?.name || stored?.name || bio?.name || `Jugador #${pid}`,
    currentTeamAbbr: activePlayer?.teamAbbr || stored?.currentTeamAbbr || bio?.teamAbbr || "NBA",
    position: activePlayer?.position || stored?.position || bio?.position || "—",
    headshotUrl:
      activePlayer?.headshotUrl ||
      bio?.headshotUrl ||
      `https://cdn.nba.com/headshots/nba/latest/260x190/${pid}.png`,
    rookieSeason,
    latestSeason,
    seasonsPlayed: regular.seasons.length,
    generatedAt: snap?.generatedAt || new Date().toISOString(),
    regular,
    playoffs,
  };
}

/**
 * Returns the exact prior Regular Season Career Highs strictly BEFORE a specific 2026-27 game.
 * Used by Milestone Notifications & Gameday Chronicle to detect authentic new Career Highs!
 */
export function getPlayerPriorCareerBaseline(playerId, activePlayerGames, gameIndexInChrono) {
  const pid = String(playerId || "").trim();
  const snap = readCareerHistorySnapshotFromDisk();
  const stored = snap?.players?.[pid] || null;

  const priorGpHistorical = (stored?.regular?.seasons || [])
    .filter((s) => s.season !== "2026-27")
    .reduce((acc, s) => acc + (s.gp || 0), 0);

  const priorHighs = {
    pts: stored?.regular?.careerHighs?.pts?.value ?? 0,
    reb: stored?.regular?.careerHighs?.reb?.value ?? 0,
    ast: stored?.regular?.careerHighs?.ast?.value ?? 0,
    fg3m: stored?.regular?.careerHighs?.fg3m?.value ?? 0,
    stl: stored?.regular?.careerHighs?.stl?.value ?? 0,
    blk: stored?.regular?.careerHighs?.blk?.value ?? 0,
    ptsMeta: stored?.regular?.careerHighs?.pts || null,
    rebMeta: stored?.regular?.careerHighs?.reb || null,
    astMeta: stored?.regular?.careerHighs?.ast || null,
    fg3mMeta: stored?.regular?.careerHighs?.fg3m || null,
    stlMeta: stored?.regular?.careerHighs?.stl || null,
    blkMeta: stored?.regular?.careerHighs?.blk || null,
  };

  let prior2027Gp = 0;
  for (let i = 0; i < gameIndexInChrono; i++) {
    const g = activePlayerGames[i];
    if (!g) continue;
    prior2027Gp += 1;
    if ((g.points || 0) > priorHighs.pts) priorHighs.pts = g.points || 0;
    if ((g.rebounds || 0) > priorHighs.reb) priorHighs.reb = g.rebounds || 0;
    if ((g.assists || 0) > priorHighs.ast) priorHighs.ast = g.assists || 0;
    if ((g.fg3m || 0) > priorHighs.fg3m) priorHighs.fg3m = g.fg3m || 0;
    if ((g.steals || 0) > priorHighs.stl) priorHighs.stl = g.steals || 0;
    if ((g.blocks || 0) > priorHighs.blk) priorHighs.blk = g.blocks || 0;
  }

  return {
    hasHistoricalSnapshot: Boolean(snap),
    priorCareerGp: priorGpHistorical + prior2027Gp,
    priorHighs,
  };
}

export function getTeamCareerHistory(teamIdOrAbbr, activeDataset2027 = null) {
  const raw = String(teamIdOrAbbr || "").trim();
  if (!raw) return null;

  const snap = readCareerHistorySnapshotFromDisk();
  const teamsMap = snap?.teams || {};

  // Resolve by NBA teamId or abbreviation
  let abbr = raw.toUpperCase();
  if (!NBA_TEAMS_MAP[abbr]) {
    const foundMeta = Object.values(NBA_TEAMS_MAP).find(
      (m) => String(m.nbaId) === raw || String(m.id) === raw
    );
    if (foundMeta) abbr = foundMeta.abbr;
  }

  const stored =
    teamsMap[abbr] ||
    Object.values(teamsMap).find(
      (t) => String(t.teamId) === raw || String(t.teamAbbr).toUpperCase() === abbr
    ) ||
    null;

  const activeTeam =
    activeDataset2027?.teamsByAbbr?.get(abbr) ||
    Array.from(activeDataset2027?.teamsByAbbr?.values() || []).find(
      (t) => String(t.id) === raw || String(t.abbreviation).toUpperCase() === abbr
    ) ||
    null;

  if (!stored && !activeTeam) return null;

  // Overlay live 2026-27 regular season stats onto stored regularSeasons
  const baseRegular = (stored?.regularSeasons || []).filter((s) => s.season !== "2026-27");
  const liveGames = (activeTeam?.games || []).filter(
    (g) => !g.seasonLabel || g.seasonLabel === "2026-27"
  );

  let mergedRegular = [...baseRegular];
  if (liveGames.length > 0) {
    const gp = liveGames.length;
    const wins = liveGames.filter((g) => g.result === "W").length;
    const losses = gp - wins;
    const ptsTotal = liveGames.reduce((s, g) => s + (g.pointsFor || 0), 0);
    const rebTotal = liveGames.reduce((s, g) => s + (g.reb || 0), 0);
    const astTotal = liveGames.reduce((s, g) => s + (g.ast || 0), 0);
    const stlTotal = liveGames.reduce((s, g) => s + (g.stl || 0), 0);
    const blkTotal = liveGames.reduce((s, g) => s + (g.blk || 0), 0);
    const fgm = liveGames.reduce((s, g) => s + (g.fgm || 0), 0);
    const fga = liveGames.reduce((s, g) => s + (g.fga || 0), 0);
    const fg3m = liveGames.reduce((s, g) => s + (g.fg3m || 0), 0);
    const fg3a = liveGames.reduce((s, g) => s + (g.fg3a || 0), 0);
    const ftm = liveGames.reduce((s, g) => s + (g.ftm || 0), 0);
    const fta = liveGames.reduce((s, g) => s + (g.fta || 0), 0);

    const existing2027 = (stored?.regularSeasons || []).find((s) => s.season === "2026-27");
    mergedRegular.push({
      season: "2026-27",
      gp,
      wins,
      losses,
      winPct: round3(wins / gp),
      confRank: existing2027?.confRank ?? null,
      divRank: existing2027?.divRank ?? null,
      poWins: 0,
      poLosses: 0,
      finalsAppearance: "N/A",
      ptsPg: round1(ptsTotal / gp),
      rebPg: round1(rebTotal / gp),
      astPg: round1(astTotal / gp),
      stlPg: round1(stlTotal / gp),
      blkPg: round1(blkTotal / gp),
      fgPct: fga > 0 ? round1((fgm / fga) * 100) : 0,
      fg3Pct: fg3a > 0 ? round1((fg3m / fg3a) * 100) : 0,
      ftPct: fta > 0 ? round1((ftm / fta) * 100) : 0,
      ptsTotal: Math.round(ptsTotal),
    });
  }

  mergedRegular.sort((a, b) => a.season.localeCompare(b.season));
  const playoffSeasons = mergedRegular.filter((s) => (s.poWins || 0) + (s.poLosses || 0) > 0);

  let bestSeason = null;
  for (const s of mergedRegular) {
    if (s.gp < 40) continue;
    if (!bestSeason || s.winPct > bestSeason.winPct || (s.winPct === bestSeason.winPct && s.wins > bestSeason.wins)) {
      bestSeason = s;
    }
  }
  if (!bestSeason && mergedRegular.length > 0) bestSeason = mergedRegular[mergedRegular.length - 1];

  const meta = NBA_TEAMS_MAP[abbr];
  const allTimeWins =
    stored?.allTimeWins != null
      ? stored.allTimeWins -
        ((stored?.regularSeasons || []).find((s) => s.season === "2026-27")?.wins || 0) +
        (mergedRegular.find((s) => s.season === "2026-27")?.wins || 0)
      : mergedRegular.reduce((acc, s) => acc + s.wins, 0);
  const allTimeLosses =
    stored?.allTimeLosses != null
      ? stored.allTimeLosses -
        ((stored?.regularSeasons || []).find((s) => s.season === "2026-27")?.losses || 0) +
        (mergedRegular.find((s) => s.season === "2026-27")?.losses || 0)
      : mergedRegular.reduce((acc, s) => acc + s.losses, 0);
  const allTimeGames = allTimeWins + allTimeLosses;

  return {
    teamId: String(stored?.teamId || meta?.nbaId || activeTeam?.id || raw),
    teamAbbr: abbr,
    teamName: stored?.teamName || meta?.name || activeTeam?.name || abbr,
    startYear: stored?.startYear || mergedRegular[0]?.season?.slice(0, 4) || "2026",
    endYear: "2027",
    totalYears: stored?.totalYears || mergedRegular.length,
    allTimeGames,
    allTimeWins,
    allTimeLosses,
    allTimeWinPct: allTimeGames > 0 ? round3(allTimeWins / allTimeGames) : 0,
    playoffAppearances: stored?.playoffAppearances ?? playoffSeasons.length,
    divTitles: stored?.divTitles ?? 0,
    confTitles: stored?.confTitles ?? 0,
    championships:
      stored?.championships ??
      mergedRegular.filter((s) => String(s.finalsAppearance).toUpperCase().includes("CHAMPION")).length,
    bestSeason,
    regularSeasons: mergedRegular,
    playoffSeasons,
    generatedAt: snap?.generatedAt || new Date().toISOString(),
  };
}

const CAREER_BARRIERS = {
  pts: [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000],
  reb: [2000, 3000, 4000, 5000, 6000, 7500, 10000, 12000, 15000],
  ast: [1000, 2000, 3000, 4000, 5000, 6000, 7500, 10000, 12000],
  fg3m: [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500],
  stl: [500, 1000, 1500, 2000, 2500],
  blk: [500, 1000, 1500, 2000, 2500],
  gp: [500, 750, 1000, 1250, 1500, 1600],
};

const BARRIER_LABELS = {
  pts: "Puntos",
  reb: "Rebotes",
  ast: "Asistencias",
  fg3m: "Triples",
  stl: "Robos",
  blk: "Tapones",
  gp: "Partidos",
};

export function getCareerLeadersResponse(scope = "regular", activeDataset2027 = null, biosById = null) {
  const cleanScope = scope === "playoffs" ? "playoffs" : "regular";
  const snap = readCareerHistorySnapshotFromDisk();

  const allPlayerIds = new Set();
  if (snap?.players) {
    for (const pid of Object.keys(snap.players)) allPlayerIds.add(pid);
  }
  if (activeDataset2027?.playersById) {
    for (const pid of activeDataset2027.playersById.keys()) allPlayerIds.add(pid);
  }

  const leaders = [];
  const imminentMilestones = [];

  for (const pid of allPlayerIds) {
    const profile = getPlayerCareerProfile(pid, activeDataset2027, biosById);
    if (!profile) continue;
    const bucket = cleanScope === "playoffs" ? profile.playoffs : profile.regular;
    if (!bucket || bucket.totals.gp <= 0) continue;

    const entry = {
      playerId: profile.playerId,
      name: profile.name,
      teamAbbr: profile.currentTeamAbbr,
      position: profile.position,
      headshotUrl: profile.headshotUrl,
      rookieSeason: profile.rookieSeason,
      seasonsCount: bucket.totals.seasonsCount,
      gp: bucket.totals.gp,
      pts: bucket.totals.pts,
      reb: bucket.totals.reb,
      ast: bucket.totals.ast,
      fg3m: bucket.totals.fg3m,
      stl: bucket.totals.stl,
      blk: bucket.totals.blk,
      min: bucket.totals.min,
      dd2: bucket.totals.dd2,
      td3: bucket.totals.td3,
      ptsPg: bucket.averages.ptsPg,
      rebPg: bucket.averages.rebPg,
      astPg: bucket.averages.astPg,
      fg3mPg: bucket.totals.gp > 0 ? round1(bucket.totals.fg3m / bucket.totals.gp) : 0,
      stlPg: bucket.averages.stlPg,
      blkPg: bucket.averages.blkPg,
      minPg: bucket.averages.minPg,
      fgPct: bucket.averages.fgPct,
      fg3Pct: bucket.averages.fg3Pct,
      ftPct: bucket.averages.ftPct,
      tsPct: bucket.averages.tsPct,
      gmScPg: bucket.averages.gmScPg,
      highPts: bucket.careerHighs.pts,
      highReb: bucket.careerHighs.reb,
      highAst: bucket.careerHighs.ast,
      high3pm: bucket.careerHighs.fg3m,
      highStl: bucket.careerHighs.stl,
      highBlk: bucket.careerHighs.blk,
      highPra: bucket.careerHighs.pra,
      highGmSc: bucket.careerHighs.gameScore,
    };
    leaders.push(entry);

    // Imminent career milestones (for active 2026-27 players in Regular Season)
    if (cleanScope === "regular" && activeDataset2027?.playersById?.has(pid)) {
      const checks = [
        { key: "pts", val: entry.pts, pg: entry.ptsPg, maxRem: 350 },
        { key: "reb", val: entry.reb, pg: entry.rebPg, maxRem: 140 },
        { key: "ast", val: entry.ast, pg: entry.astPg, maxRem: 120 },
        { key: "fg3m", val: entry.fg3m, pg: entry.fg3mPg, maxRem: 50 },
        { key: "stl", val: entry.stl, pg: entry.stlPg, maxRem: 25 },
        { key: "blk", val: entry.blk, pg: entry.blkPg, maxRem: 25 },
        { key: "gp", val: entry.gp, pg: 1, maxRem: 20 },
      ];
      for (const c of checks) {
        const targets = CAREER_BARRIERS[c.key] || [];
        const nextTarget = targets.find((t) => t > c.val);
        if (!nextTarget) continue;
        const remaining = nextTarget - c.val;
        const progressPct = round1((c.val / nextTarget) * 100);
        if (remaining <= c.maxRem && progressPct >= 92) {
          const estGames = c.pg > 0.15 ? Math.ceil(remaining / c.pg) : null;
          if (estGames !== null && estGames <= 30) {
            imminentMilestones.push({
              playerId: entry.playerId,
              name: entry.name,
              teamAbbr: entry.teamAbbr,
              position: entry.position,
              headshotUrl: entry.headshotUrl,
              metricKey: c.key,
              metricLabel: BARRIER_LABELS[c.key],
              currentValue: c.val,
              targetValue: nextTarget,
              remaining,
              progressPct,
              estGamesToReach: estGames,
            });
          }
        }
      }
    }
  }

  leaders.sort((a, b) => b.pts - a.pts);
  imminentMilestones.sort((a, b) => {
    const gA = a.estGamesToReach ?? 999;
    const gB = b.estGamesToReach ?? 999;
    if (gA !== gB) return gA - gB;
    return b.progressPct - a.progressPct;
  });

  return {
    scope: cleanScope,
    generatedAt: snap?.generatedAt || new Date().toISOString(),
    totalPlayers: leaders.length,
    leaders,
    imminentMilestones: imminentMilestones.slice(0, 30),
  };
}

// ---------------------------------------------------------------------------
// Offline-Safe Sync Generator (NBA.com Official Stats -> data/nba-career-history.json.gz)
// ---------------------------------------------------------------------------

async function fetchNbaJsonWithRetry(url, retries = 2, timeoutMs = 15000) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: NBA_STATS_HEADERS, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

function collectActivePlayerRosterMap() {
  const map = new Map();
  const addPlayer = (id, name, teamAbbr, position) => {
    const pid = String(id || "").trim();
    if (!pid) return;
    const existing = map.get(pid);
    map.set(pid, {
      id: pid,
      name: name || existing?.name || "",
      teamAbbr: teamAbbr || existing?.teamAbbr || "NBA",
      position: position || existing?.position || "—",
    });
  };

  const bios = readNbaBiosSnapshotFromDisk();
  if (Array.isArray(bios)) {
    for (const b of bios) {
      addPlayer(b.id || b.playerId, b.name, b.teamAbbr, b.position);
    }
  }

  for (const key of ["2025-26", "2026-27"]) {
    const ds = readNbaSeasonSnapshotFromDisk(key);
    if (ds && Array.isArray(ds.players)) {
      for (const p of ds.players) {
        addPlayer(p.id, p.name, p.teamAbbr, p.position);
      }
    }
  }
  return map;
}

export async function syncCareerHistoryToDisk(options = {}) {
  const verbose = options.verbose !== false;
  const activeRoster = collectActivePlayerRosterMap();
  if (activeRoster.size < 200) {
    throw new Error(
      `No se encontraron suficientes jugadores activos en los snapshots base (${activeRoster.size}).`
    );
  }

  if (verbose) {
    console.log(
      `[RadarNBA CareerSync] Iniciando ingesta histórica para ${activeRoster.size} jugadores activos y 30 franquicias (${HISTORICAL_SEASONS_CLOSED[0]}..${HISTORICAL_SEASONS_CLOSED[HISTORICAL_SEASONS_CLOSED.length - 1]})...`
    );
  }

  // Per-player mutable collectors
  const playersAcc = new Map();
  for (const [pid, meta] of activeRoster.entries()) {
    playersAcc.set(pid, {
      playerId: pid,
      name: meta.name,
      currentTeamAbbr: meta.teamAbbr,
      position: meta.position,
      regularSeasonsMap: new Map(),
      playoffSeasonsMap: new Map(),
      regularHighs: createEmptyHighs(),
      playoffHighs: createEmptyHighs(),
    });
  }

  const processGameLogResultSet = (rs, seasonLabel, isPlayoffs) => {
    if (!rs || !Array.isArray(rs.headers) || !Array.isArray(rs.rowSet)) return 0;
    const idx = {};
    rs.headers.forEach((h, i) => {
      idx[h] = i;
    });
    let matched = 0;

    for (const row of rs.rowSet) {
      const pid = String(row[idx.PLAYER_ID] ?? "");
      const pAcc = playersAcc.get(pid);
      if (!pAcc) continue;
      matched += 1;

      if (!pAcc.name && row[idx.PLAYER_NAME]) {
        pAcc.name = String(row[idx.PLAYER_NAME]);
      }

      const tAbbr = normalizeAbbr(row[idx.TEAM_ABBREVIATION] || "");
      const matchup = String(row[idx.MATCHUP] || "");
      const oppAbbr = normalizeAbbr(parseOpponentFromMatchup(matchup, tAbbr));
      const wl = String(row[idx.WL] || "").toUpperCase() === "W" ? "W" : "L";
      const dateIso = String(row[idx.GAME_DATE] || "").slice(0, 10);

      const min = Number(row[idx.MIN]) || 0;
      const pts = Number(row[idx.PTS]) || 0;
      const reb = Number(row[idx.REB]) || 0;
      const oreb = Number(row[idx.OREB]) || 0;
      const dreb = Number(row[idx.DREB]) || Math.max(0, reb - oreb);
      const ast = Number(row[idx.AST]) || 0;
      const stl = Number(row[idx.STL]) || 0;
      const blk = Number(row[idx.BLK]) || 0;
      const tov = Number(row[idx.TOV]) || 0;
      const pf = Number(row[idx.PF]) || 0;
      const fgm = Number(row[idx.FGM]) || 0;
      const fga = Number(row[idx.FGA]) || 0;
      const fg3m = Number(row[idx.FG3M]) || 0;
      const fg3a = Number(row[idx.FG3A]) || 0;
      const ftm = Number(row[idx.FTM]) || 0;
      const fta = Number(row[idx.FTA]) || 0;
      const pm = Number(row[idx.PLUS_MINUS]) || 0;
      const gmSc = computeGameScoreRaw({
        pts,
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

      const sMap = isPlayoffs ? pAcc.playoffSeasonsMap : pAcc.regularSeasonsMap;
      let sAcc = sMap.get(seasonLabel);
      if (!sAcc) {
        sAcc = {
          season: seasonLabel,
          teams: new Set(),
          gp: 0,
          wins: 0,
          losses: 0,
          min: 0,
          pts: 0,
          reb: 0,
          oreb: 0,
          dreb: 0,
          ast: 0,
          stl: 0,
          blk: 0,
          tov: 0,
          pf: 0,
          fgm: 0,
          fga: 0,
          fg3m: 0,
          fg3a: 0,
          ftm: 0,
          fta: 0,
          plusMinus: 0,
          dd2: 0,
          td3: 0,
        };
        sMap.set(seasonLabel, sAcc);
      }

      if (tAbbr) sAcc.teams.add(tAbbr);
      sAcc.gp += 1;
      if (wl === "W") sAcc.wins += 1;
      else sAcc.losses += 1;
      sAcc.min += min;
      sAcc.pts += pts;
      sAcc.reb += reb;
      sAcc.oreb += oreb;
      sAcc.dreb += dreb;
      sAcc.ast += ast;
      sAcc.stl += stl;
      sAcc.blk += blk;
      sAcc.tov += tov;
      sAcc.pf += pf;
      sAcc.fgm += fgm;
      sAcc.fga += fga;
      sAcc.fg3m += fg3m;
      sAcc.fg3a += fg3a;
      sAcc.ftm += ftm;
      sAcc.fta += fta;
      sAcc.plusMinus += pm;

      const tenCats = [pts, reb, ast, stl, blk].filter((v) => v >= 10).length;
      if (tenCats >= 2) sAcc.dd2 += 1;
      if (tenCats >= 3) sAcc.td3 += 1;

      const highs = isPlayoffs ? pAcc.playoffHighs : pAcc.regularHighs;
      const meta = {
        date: dateIso,
        season: seasonLabel,
        teamAbbr: tAbbr,
        opponentAbbr: oppAbbr,
        result: wl,
      };
      maybeUpdateHigh(highs, "pts", pts, meta);
      maybeUpdateHigh(highs, "reb", reb, meta);
      maybeUpdateHigh(highs, "ast", ast, meta);
      maybeUpdateHigh(highs, "fg3m", fg3m, meta);
      maybeUpdateHigh(highs, "stl", stl, meta);
      maybeUpdateHigh(highs, "blk", blk, meta);
      maybeUpdateHigh(highs, "min", min, meta);
      maybeUpdateHigh(highs, "fgm", fgm, meta);
      maybeUpdateHigh(highs, "ftm", ftm, meta);
      maybeUpdateHigh(highs, "pra", pts + reb + ast, meta);
      maybeUpdateHigh(highs, "gameScore", gmSc, meta);
    }
    return matched;
  };

  // Process historical seasons with gentle concurrency (3 at a time)
  const seasonTasks = [];
  for (const seasonLabel of HISTORICAL_SEASONS_CLOSED) {
    seasonTasks.push({ seasonLabel, isPlayoffs: false });
    seasonTasks.push({ seasonLabel, isPlayoffs: true });
  }

  let seasonsSucceeded = 0;
  const BATCH_SIZE = 3;
  for (let i = 0; i < seasonTasks.length; i += BATCH_SIZE) {
    const batch = seasonTasks.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ seasonLabel, isPlayoffs }) => {
        const sType = isPlayoffs ? "Playoffs" : "Regular%20Season";
        const url = `https://stats.nba.com/stats/leaguegamelog?Counter=0&DateFrom=&DateTo=&Direction=ASC&LeagueID=00&PlayerOrTeam=P&Season=${encodeURIComponent(
          seasonLabel
        )}&SeasonType=${sType}&Sorter=DATE`;
        try {
          const json = await fetchNbaJsonWithRetry(url, 2, 20000);
          const rs = json?.resultSets?.[0];
          const count = processGameLogResultSet(rs, seasonLabel, isPlayoffs);
          seasonsSucceeded += 1;
          if (verbose && !isPlayoffs) {
            console.log(
              `  [CareerSync] ${seasonLabel} Regular OK (${count} partidos de jugadores activos)`
            );
          }
        } catch (err) {
          console.warn(
            `  [CareerSync] Aviso en ${seasonLabel} (${isPlayoffs ? "PO" : "RS"}):`,
            err?.message || err
          );
        }
      })
    );
  }

  // Finalize compact player history dictionary
  const playersOut = {};
  let playersWithHistory = 0;
  for (const [pid, pAcc] of playersAcc.entries()) {
    const regSeasons = Array.from(pAcc.regularSeasonsMap.values())
      .map((s) => finalizeSeasonLine({ ...s, teamAbbr: Array.from(s.teams).join("/") || pAcc.currentTeamAbbr }))
      .sort((a, b) => a.season.localeCompare(b.season));
    const poSeasons = Array.from(pAcc.playoffSeasonsMap.values())
      .map((s) => finalizeSeasonLine({ ...s, teamAbbr: Array.from(s.teams).join("/") || pAcc.currentTeamAbbr }))
      .sort((a, b) => a.season.localeCompare(b.season));

    if (regSeasons.length > 0 || poSeasons.length > 0) {
      playersWithHistory += 1;
    }

    playersOut[pid] = {
      playerId: pid,
      name: pAcc.name,
      currentTeamAbbr: pAcc.currentTeamAbbr,
      position: pAcc.position,
      rookieSeason: regSeasons[0]?.season || "2026-27",
      regular: {
        seasons: regSeasons,
        careerHighs: pAcc.regularHighs,
      },
      playoffs: {
        seasons: poSeasons,
        careerHighs: pAcc.playoffHighs,
      },
    };
  }

  // Fetch Franchise All-Time History + Year-by-Year for all 30 teams
  const teamsOut = {};
  const franchiseMetaById = new Map();
  try {
    const fhJson = await fetchNbaJsonWithRetry(
      "https://stats.nba.com/stats/franchisehistory?LeagueID=00",
      2,
      15000
    );
    const rs = fhJson?.resultSets?.[0];
    if (rs && Array.isArray(rs.headers) && Array.isArray(rs.rowSet)) {
      const idx = {};
      rs.headers.forEach((h, i) => (idx[h] = i));
      for (const row of rs.rowSet) {
        const tid = String(row[idx.TEAM_ID] ?? "");
        const prev = franchiseMetaById.get(tid);
        // Prefer the row with highest GAMES (active full franchise summary)
        const games = Number(row[idx.GAMES]) || 0;
        if (!prev || games > prev.games) {
          franchiseMetaById.set(tid, {
            teamId: tid,
            startYear: String(row[idx.START_YEAR] || ""),
            endYear: String(row[idx.END_YEAR] || ""),
            years: Number(row[idx.YEARS]) || 0,
            games,
            wins: Number(row[idx.WINS]) || 0,
            losses: Number(row[idx.LOSSES]) || 0,
            winPct: Number(row[idx.WIN_PCT]) || 0,
            poAppearances: Number(row[idx.PO_APPEARANCES]) || 0,
            divTitles: Number(row[idx.DIV_TITLES]) || 0,
            confTitles: Number(row[idx.CONF_TITLES]) || 0,
            championships: Number(row[idx.LEAGUE_TITLES]) || 0,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[CareerSync] Aviso franchisehistory:", err?.message || err);
  }

  const allTeamMetas = Object.values(NBA_TEAMS_MAP);
  for (let i = 0; i < allTeamMetas.length; i += 5) {
    const chunk = allTeamMetas.slice(i, i + 5);
    await Promise.all(
      chunk.map(async (meta) => {
        const tid = String(meta.nbaId);
        const fMeta = franchiseMetaById.get(tid);
        const regularSeasons = [];
        try {
          const url = `https://stats.nba.com/stats/teamyearbyyearstats?LeagueID=00&PerMode=Totals&SeasonType=Regular%20Season&TeamID=${tid}`;
          const json = await fetchNbaJsonWithRetry(url, 2, 15000);
          const rs = json?.resultSets?.[0];
          if (rs && Array.isArray(rs.headers) && Array.isArray(rs.rowSet)) {
            const idx = {};
            rs.headers.forEach((h, j) => (idx[h] = j));
            for (const row of rs.rowSet) {
              const gp = Math.max(1, Number(row[idx.GP]) || 0);
              const ptsTotal = Number(row[idx.PTS]) || 0;
              const rebTotal = Number(row[idx.REB]) || 0;
              const astTotal = Number(row[idx.AST]) || 0;
              const stlTotal = Number(row[idx.STL]) || 0;
              const blkTotal = Number(row[idx.BLK]) || 0;
              regularSeasons.push({
                season: String(row[idx.YEAR] || ""),
                gp: Number(row[idx.GP]) || 0,
                wins: Number(row[idx.WINS]) || 0,
                losses: Number(row[idx.LOSSES]) || 0,
                winPct: round3(Number(row[idx.WIN_PCT]) || 0),
                confRank: row[idx.CONF_RANK] != null ? Number(row[idx.CONF_RANK]) : null,
                divRank: row[idx.DIV_RANK] != null ? Number(row[idx.DIV_RANK]) : null,
                poWins: Number(row[idx.PO_WINS]) || 0,
                poLosses: Number(row[idx.PO_LOSSES]) || 0,
                finalsAppearance: String(row[idx.NBA_FINALS_APPEARANCE] || "N/A"),
                ptsPg: round1(ptsTotal / gp),
                rebPg: round1(rebTotal / gp),
                astPg: round1(astTotal / gp),
                stlPg: round1(stlTotal / gp),
                blkPg: round1(blkTotal / gp),
                fgPct: round1((Number(row[idx.FG_PCT]) || 0) * 100),
                fg3Pct: round1((Number(row[idx.FG3_PCT]) || 0) * 100),
                ftPct: round1((Number(row[idx.FT_PCT]) || 0) * 100),
                ptsTotal: Math.round(ptsTotal),
              });
            }
          }
        } catch (err) {
          console.warn(`[CareerSync] Aviso teamyearbyyear ${meta.abbr}:`, err?.message || err);
        }

        teamsOut[meta.abbr] = {
          teamId: tid,
          teamAbbr: meta.abbr,
          teamName: meta.name,
          startYear: fMeta?.startYear || regularSeasons[0]?.season?.slice(0, 4) || "",
          endYear: fMeta?.endYear || "2027",
          totalYears: fMeta?.years || regularSeasons.length,
          allTimeGames: fMeta?.games || regularSeasons.reduce((a, s) => a + s.gp, 0),
          allTimeWins: fMeta?.wins || regularSeasons.reduce((a, s) => a + s.wins, 0),
          allTimeLosses: fMeta?.losses || regularSeasons.reduce((a, s) => a + s.losses, 0),
          allTimeWinPct: fMeta?.winPct || 0,
          playoffAppearances:
            fMeta?.poAppearances ??
            regularSeasons.filter((s) => s.poWins + s.poLosses > 0).length,
          divTitles: fMeta?.divTitles || 0,
          confTitles: fMeta?.confTitles || 0,
          championships: fMeta?.championships || 0,
          regularSeasons,
        };
      })
    );
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    seasonsCovered: HISTORICAL_SEASONS_CLOSED,
    playersCount: Object.keys(playersOut).length,
    playersWithHistory,
    teamsCount: Object.keys(teamsOut).length,
    players: playersOut,
    teams: teamsOut,
  };

  const written = writeGzipJsonAtomic(getWritePath(CAREER_HISTORY_FILENAME), payload, 9);
  memoryCareerHistoryCache = {
    filePath: written.filePath,
    mtimeMs: written.mtimeMs,
    data: payload,
  };

  if (verbose) {
    console.log(
      `[RadarNBA CareerSync] ✅ Micro-snapshot histórico guardado en ${written.filePath} (${Math.round(
        written.bytesCompressed / 1024
      )} KB gzip / ${Math.round(written.bytesUncompressed / 1024)} KB JSON · ${playersWithHistory} jugadores con trayectoria · ${
        Object.keys(teamsOut).length
      } franquicias · ${seasonsSucceeded}/${seasonTasks.length} lotes OK).`
    );
  }

  return {
    ...written,
    playersCount: payload.playersCount,
    playersWithHistory,
    teamsCount: payload.teamsCount,
    seasonsSucceeded,
  };
}
