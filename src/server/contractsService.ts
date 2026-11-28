// @ts-nocheck
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import {
  NBA_TEAMS_MAP,
  NBA_TEAM_CONFERENCE_MAP,
  NBA_TEAM_DIVISION_MAP,
} from "../utils/teamLogos.ts";
import { normalizePlayerLookupKey } from "../utils/fantasyScoring.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR =
  [
    path.resolve(process.cwd(), "data"),
    path.resolve(__dirname, "../data"),
    path.resolve(__dirname, "../../data"),
  ].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "data");

const CONTRACTS_SNAPSHOT_FILE = path.join(DATA_DIR, "nba-contracts-snapshot.json.gz");
const SERVERLESS_TMP_CONTRACTS_FILE = "/tmp/radarnba-contracts-snapshot.json.gz";

// Official 2026-27 NBA CBA Financial Thresholds (effective July 1, 2026)
export const CBA_2026_27_THRESHOLDS = {
  seasonLabel: "2026-27",
  salaryFloor: 148_465_000,
  salaryCap: 164_961_000,
  luxuryTax: 200_428_000,
  firstApron: 209_015_000,
  secondApron: 221_686_000,
  nonTaxpayerMle: 15_044_000,
  roomMle: 9_366_000,
  taxpayerMle: 6_064_000,
  biAnnualException: 5_477_000,
  rookieMinimum: 1_272_870,
  veteranMinimum: 2_296_274,
  twoWaySalary: 636_435,
};

const FUTURE_SEASONS = ["2026-27", "2027-28", "2028-29", "2029-30"];
const ANNUAL_RAISE_RATE = 0.05;
const ESPN_ALLOWED_HOST = "site.api.espn.com";
const FANSPO_ALLOWED_HOST = "fanspo.com";
const CONTRACTS_SNAPSHOT_SCHEMA_VERSION = 2;

const FANSPO_TEAM_PAYROLL_MAP = {
  ATL: { id: 1, slug: "hawks" },
  BOS: { id: 2, slug: "celtics" },
  BKN: { id: 3, slug: "nets" },
  CHA: { id: 4, slug: "hornets" },
  CHI: { id: 5, slug: "bulls" },
  CLE: { id: 6, slug: "cavaliers" },
  DAL: { id: 7, slug: "mavericks" },
  DEN: { id: 8, slug: "nuggets" },
  DET: { id: 9, slug: "pistons" },
  GSW: { id: 10, slug: "warriors" },
  HOU: { id: 11, slug: "rockets" },
  IND: { id: 12, slug: "pacers" },
  LAC: { id: 13, slug: "clippers" },
  LAL: { id: 14, slug: "lakers" },
  MEM: { id: 15, slug: "grizzlies" },
  MIA: { id: 16, slug: "heat" },
  MIL: { id: 17, slug: "bucks" },
  MIN: { id: 18, slug: "timberwolves" },
  NOP: { id: 19, slug: "pelicans" },
  NYK: { id: 20, slug: "knicks" },
  OKC: { id: 21, slug: "thunder" },
  ORL: { id: 22, slug: "magic" },
  PHI: { id: 23, slug: "sixers" },
  PHX: { id: 24, slug: "suns" },
  POR: { id: 25, slug: "blazers" },
  SAC: { id: 26, slug: "kings" },
  SAS: { id: 27, slug: "spurs" },
  TOR: { id: 28, slug: "raptors" },
  UTA: { id: 29, slug: "jazz" },
  WAS: { id: 30, slug: "wizards" },
};

function buildFanspoPayrollUrl(abbr) {
  const entry = FANSPO_TEAM_PAYROLL_MAP[String(abbr || "").toUpperCase()];
  if (!entry) return null;
  const u = new URL(
    `https://${FANSPO_ALLOWED_HOST}/nba/teams/${entry.slug}/${entry.id}/payroll`
  );
  if (u.hostname !== FANSPO_ALLOWED_HOST || u.protocol !== "https:") return null;
  return u.toString();
}

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

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function buildEspnRosterUrl(espnSlug) {
  const cleanSlug = String(espnSlug || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!cleanSlug) return null;
  const u = new URL(
    `https://${ESPN_ALLOWED_HOST}/apis/site/v2/sports/basketball/nba/teams/${cleanSlug}/roster`
  );
  if (u.hostname !== ESPN_ALLOWED_HOST || u.protocol !== "https:") return null;
  return u.toString();
}

function mapEspnOptionType(rawOptionType, isTwoWay) {
  if (isTwoWay) return "TWO_WAY";
  const code = Number(rawOptionType) || 0;
  if (code === 1) return "PO";
  if (code === 2) return "TO";
  return "GTD";
}

function classifyTeamCbaTier(activePayroll) {
  if (activePayroll >= CBA_2026_27_THRESHOLDS.secondApron) return "second_apron";
  if (activePayroll >= CBA_2026_27_THRESHOLDS.firstApron) return "first_apron";
  if (activePayroll >= CBA_2026_27_THRESHOLDS.luxuryTax) return "luxury_tax";
  if (activePayroll >= CBA_2026_27_THRESHOLDS.salaryCap) return "over_cap";
  if (activePayroll >= CBA_2026_27_THRESHOLDS.salaryFloor) return "under_cap";
  return "under_floor";
}

function getAvailableExceptionsForTier(tier) {
  const t = CBA_2026_27_THRESHOLDS;
  if (tier === "under_floor" || tier === "under_cap") {
    return [
      {
        code: "room_mle",
        labelEs: "Room MLE",
        amount: t.roomMle,
        noteEs: "Excepción disponible tras gastar el espacio bajo el Salary Cap.",
      },
    ];
  }
  if (tier === "over_cap") {
    return [
      {
        code: "non_tax_mle",
        labelEs: "Non-Taxpayer MLE",
        amount: t.nonTaxpayerMle,
        noteEs: "Usarla por encima de la Taxpayer MLE activa un Hard Cap en el 1er Apron.",
      },
      {
        code: "bae",
        labelEs: "Bi-Annual Exception",
        amount: t.biAnnualException,
        noteEs: "Disponible cada dos temporadas; su uso fija Hard Cap en el 1er Apron.",
      },
    ];
  }
  if (tier === "luxury_tax" || tier === "first_apron") {
    return [
      {
        code: "taxpayer_mle",
        labelEs: "Taxpayer MLE",
        amount: t.taxpayerMle,
        noteEs: "Excepción reducida para equipos en Impuesto/1er Apron; usarla fija Hard Cap en el 2º Apron.",
      },
    ];
  }
  return [
    {
      code: "min_only",
      labelEs: "Solo Contratos Mínimos",
      amount: t.veteranMinimum,
      noteEs: "En el 2º Apron se pierde el acceso a la Taxpayer MLE y a excepciones comerciales previas.",
    },
  ];
}

function computePlayerSeasonStats(player) {
  const games = Array.isArray(player?.games) ? player.games : [];
  const gp = games.length;
  if (gp === 0) {
    return {
      gp: 0,
      minutesPg: 0,
      pointsPg: 0,
      reboundsPg: 0,
      assistsPg: 0,
      usgPct: round1(player?.advanced?.usgPct || 0),
      tsPct: round1(player?.advanced?.tsPct || 0),
    };
  }
  let minSum = 0;
  let ptsSum = 0;
  let rebSum = 0;
  let astSum = 0;
  let usgSum = 0;
  let fgaSum = 0;
  let ftaSum = 0;
  for (const g of games) {
    minSum += Number(g.minutes) || 0;
    ptsSum += Number(g.points) || 0;
    rebSum += Number(g.rebounds) || 0;
    astSum += Number(g.assists) || 0;
    usgSum += Number(g.usgEst) || 0;
    fgaSum += Number(g.fga) || 0;
    ftaSum += Number(g.fta) || 0;
  }
  const tsDenom = 2 * (fgaSum + 0.44 * ftaSum);
  const tsCalc = tsDenom > 0 ? (ptsSum / tsDenom) * 100 : 0;
  return {
    gp,
    minutesPg: round1(minSum / gp),
    pointsPg: round1(ptsSum / gp),
    reboundsPg: round1(rebSum / gp),
    assistsPg: round1(astSum / gp),
    usgPct: round1(player?.advanced?.usgPct || usgSum / gp),
    tsPct: round1(player?.advanced?.tsPct || tsCalc),
  };
}

/**
 * Pure basketball contract efficiency score (no Fantasy/FPTS):
 * Evaluates on-court production (PTS, REB, AST, MIN, TS% efficiency) relative to annual cap hit.
 */
function computeSportingEfficiency(stats, salary, isTwoWay) {
  const impactScore = round1(
    stats.pointsPg +
      stats.reboundsPg * 1.15 +
      stats.assistsPg * 1.45 +
      stats.minutesPg * 0.32 +
      (stats.gp >= 5 && stats.tsPct > 0 ? Math.max(-4, Math.min(5, (stats.tsPct - 57) * 0.35)) : 0)
  );
  const salaryM = Math.max(salary / 1_000_000, 1.0);
  const valuePerMillion = round2(impactScore / salaryM);

  if (stats.gp < 5 || stats.minutesPg < 8) {
    return {
      sportingImpactScore: impactScore,
      valuePerMillion,
      efficiencyTier: "muestra_baja",
    };
  }
  if (isTwoWay && impactScore >= 18) {
    return {
      sportingImpactScore: impactScore,
      valuePerMillion,
      efficiencyTier: "ganga",
    };
  }
  // Calibrated across NBA salary bands:
  // Superstars on $50M producing ~55-65 impact (~1.2/M) are "acorde" or "alto_valor", not penalized unfairly for max deals.
  const expectedImpactForSalary = Math.min(56, 12 + Math.pow(salaryM, 0.72) * 2.55);
  const ratio = impactScore / Math.max(10, expectedImpactForSalary);

  let efficiencyTier = "acorde";
  if (ratio >= 1.38 || (salaryM <= 12 && impactScore >= 28)) {
    efficiencyTier = "ganga";
  } else if (ratio >= 1.12) {
    efficiencyTier = "alto_valor";
  } else if (ratio < 0.72 && salaryM >= 14) {
    efficiencyTier = "sobrecoste";
  }
  return {
    sportingImpactScore: impactScore,
    valuePerMillion,
    efficiencyTier,
  };
}

function buildYearlySalaries(baseSalary, yearsRemaining, optionType, isTwoWay, isEstimated) {
  const yrs = Math.max(1, Math.min(4, Number(yearsRemaining) || 1));
  return FUTURE_SEASONS.map((season, idx) => {
    if (idx >= yrs) {
      return {
        season,
        salary: null,
        option: null,
        isProjected: false,
      };
    }
    const projSalary =
      idx === 0
        ? Math.round(baseSalary)
        : Math.round(baseSalary * Math.pow(1 + ANNUAL_RAISE_RATE, idx));
    const isFinalYear = idx === yrs - 1;
    const slotOption = isTwoWay
      ? "TWO_WAY"
      : isFinalYear && (optionType === "PO" || optionType === "TO")
      ? optionType
      : "GTD";
    return {
      season,
      salary: projSalary,
      option: slotOption,
      isProjected: idx > 0 || isEstimated,
    };
  });
}

function readRawContractsDiskCache() {
  const candidates = process.env.VERCEL
    ? [SERVERLESS_TMP_CONTRACTS_FILE, CONTRACTS_SNAPSHOT_FILE]
    : [CONTRACTS_SNAPSHOT_FILE];
  for (const target of candidates) {
    try {
      if (!fs.existsSync(target)) continue;
      const gz = fs.readFileSync(target);
      const parsed = JSON.parse(zlib.gunzipSync(gz).toString("utf8"));
      if (
        parsed &&
        parsed.schemaVersion === CONTRACTS_SNAPSHOT_SCHEMA_VERSION &&
        parsed.teamsByAbbr &&
        Object.keys(parsed.teamsByAbbr).length >= 20
      ) {
        return parsed;
      }
    } catch {
      // ignore corrupted cache
    }
  }
  return null;
}

function writeRawContractsDiskCache(teamsByAbbr) {
  const payload = {
    schemaVersion: CONTRACTS_SNAPSHOT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    teamsByAbbr,
  };
  try {
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 6 });
    if (process.env.VERCEL) {
      const tmp = `${SERVERLESS_TMP_CONTRACTS_FILE}.tmp`;
      fs.writeFileSync(tmp, gz);
      fs.renameSync(tmp, SERVERLESS_TMP_CONTRACTS_FILE);
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${CONTRACTS_SNAPSHOT_FILE}.tmp`;
      fs.writeFileSync(tmp, gz);
      fs.renameSync(tmp, CONTRACTS_SNAPSHOT_FILE);
    }
  } catch {
    // non-fatal on read-only fs
  }
}

async function fetchSingleTeamFanspoContracts(abbr) {
  const url = buildFanspoPayrollUrl(abbr);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match || !match[1]) return null;
    const nextData = JSON.parse(match[1]);
    const apollo = nextData?.props?.pageProps?.apolloState;
    if (!apollo || typeof apollo !== "object") return null;

    // 1. Collect multi-year schedules (merging both "current" and "upcoming" extensions) by NBA playerId
    const rootQuery = apollo.ROOT_QUERY || {};
    const tmKey = Object.keys(rootQuery).find((k) =>
      k.startsWith("nba_tradeMachineTeam(")
    );
    const rawContracts = tmKey && Array.isArray(rootQuery[tmKey]?.contracts)
      ? rootQuery[tmKey].contracts
      : [];

    const yearsByPlayerId = new Map();
    for (const contract of rawContracts) {
      const pid = contract?.playerId ? String(contract.playerId).trim() : "";
      if (!pid || !Array.isArray(contract.years)) continue;
      let seasonMap = yearsByPlayerId.get(pid);
      if (!seasonMap) {
        seasonMap = new Map();
        yearsByPlayerId.set(pid, seasonMap);
      }
      for (const yr of contract.years) {
        const fromYear = Number(yr?.fromYear);
        if (!Number.isFinite(fromYear) || fromYear < 2026 || fromYear > 2029) continue;
        if (yr?.deadYear) continue;
        const seasonLabel = `${fromYear}-${String((fromYear + 1) % 100).padStart(2, "0")}`;
        const capHit = Number(yr?.capHit) || 0;
        const baseSalary = Number(yr?.baseSalary) || 0;
        const effectiveSalary = capHit > 0 ? capHit : baseSalary;
        if (effectiveSalary <= 0) continue;
        const option = yr?.playerOption
          ? "PO"
          : yr?.teamOption
            ? "TO"
            : "GTD";
        seasonMap.set(seasonLabel, {
          salary: Math.round(effectiveSalary),
          baseSalary: Math.round(baseSalary || effectiveSalary),
          option,
          noTradeClause: Boolean(yr?.noTradeClause),
        });
      }
    }

    // 2. Collect headshots by nba_Player:<id>
    const headshotByPlayerId = new Map();
    for (const [k, v] of Object.entries(apollo)) {
      if (k.startsWith("nba_Player:") && v && v.id && v.headshotURL) {
        headshotByPlayerId.set(String(v.id), String(v.headshotURL));
      }
    }

    // 3. Parse all activeRoster & twoWay players (exclude waived deadCap entries)
    const payrollPlayers = Object.entries(apollo)
      .filter(([k]) => k.startsWith("nba_TeamPayrollPlayer:"))
      .map(([, v]) => v)
      .filter((p) => p && (p.payrollType === "activeRoster" || p.payrollType === "twoWay"));

    if (payrollPlayers.length === 0) return null;

    const parsed = payrollPlayers
      .map((p) => {
        const fullName = String(p.name || "").trim();
        if (!fullName) return null;
        const nbaPlayerId = p.playerId ? String(p.playerId).trim() : null;
        const isTwoWay = p.payrollType === "twoWay";
        const capHit = Number(p.capHit) || 0;
        const baseSalary = Number(p.baseSalary) || 0;
        const seasonMap = nbaPlayerId ? yearsByPlayerId.get(nbaPlayerId) : null;
        const season2627 = seasonMap?.get("2026-27") || null;

        let salary = capHit > 0 ? capHit : baseSalary > 0 ? baseSalary : season2627?.salary || 0;
        if (isTwoWay && salary <= 0) {
          salary = CBA_2026_27_THRESHOLDS.twoWaySalary;
        }
        const hasOfficialContract = isTwoWay || salary > 0;

        // Build exact official yearlySalaries from Fanspo contract schedule when available
        let exactYearlySalaries = null;
        let yearsRemaining = 1;
        let optionTypeCode = 0;

        if (!isTwoWay && seasonMap && seasonMap.size > 0) {
          exactYearlySalaries = FUTURE_SEASONS.map((season) => {
            const slot = seasonMap.get(season);
            if (!slot) {
              return { season, salary: null, option: null, isProjected: false };
            }
            return {
              season,
              salary: slot.salary,
              option: slot.option,
              isProjected: false,
            };
          });
          // Ensure 2026-27 is populated if salary came from payrollPlayer
          if (!exactYearlySalaries[0].salary && salary > 0) {
            exactYearlySalaries[0] = {
              season: "2026-27",
              salary: Math.round(salary),
              option: "GTD",
              isProjected: false,
            };
          }
          const contractedSlots = exactYearlySalaries.filter((s) => s.salary && s.salary > 0);
          yearsRemaining = Math.max(1, contractedSlots.length);
          const lastSlot = contractedSlots[contractedSlots.length - 1];
          if (lastSlot?.option === "PO") optionTypeCode = 1;
          else if (lastSlot?.option === "TO") optionTypeCode = 2;
        }

        const ageNum = p.age !== null && p.age !== undefined && p.age !== "" ? Number(p.age) : null;
        const tradeKickerPct = Number(p.tradeKickerPct) || 0;
        const signedUsing = String(p.signedUsing || "").toLowerCase();

        return {
          nbaPlayerId,
          espnId: null,
          name: fullName,
          position: String(p.position || "").trim() || "G-F",
          age: Number.isFinite(ageNum) ? ageNum : null,
          experienceYears: null,
          headshotUrl: (nbaPlayerId && headshotByPlayerId.get(nbaPlayerId)) || undefined,
          hasOfficialContract,
          salary: Math.round(salary),
          incomingTradeValue: Math.round(salary),
          outgoingTradeValue: Math.round(salary),
          yearsRemaining,
          exactYearlySalaries,
          optionTypeCode,
          tradeKickerPct,
          tradeRestriction: Boolean(p.noTradeClause || season2627?.noTradeClause),
          poisonPill: false,
          baseYearCompensation: false,
          minimumSalaryException: signedUsing.includes("minimum"),
          isTwoWay,
        };
      })
      .filter(Boolean);

    return { abbr, athletes: parsed };
  } catch {
    return null;
  }
}

async function fetchSingleTeamEspnRosterContracts(abbr, espnSlug, cachedFetchJson, forceRefresh) {
  const url = buildEspnRosterUrl(espnSlug);
  if (!url) return null;
  try {
    const data = await cachedFetchJson(url, 30 * 60 * 1000, {}, 6500, forceRefresh);
    const athletes = Array.isArray(data?.athletes) ? data.athletes : [];
    const parsed = athletes
      .map((a) => {
        const fullName = String(a?.fullName || a?.displayName || "").trim();
        if (!fullName) return null;
        const c = a?.contract && typeof a.contract === "object" ? a.contract : null;
        const salary = Number(c?.salary) || 0;
        const incomingTradeValue = Number(c?.incomingTradeValue) || salary;
        const outgoingTradeValue = Number(c?.outgoingTradeValue) || salary;
        const yearsRemaining = Math.max(1, Number(c?.yearsRemaining) || 1);
        const expYears =
          typeof a?.experience?.years === "number" ? a.experience.years : null;
        const age = typeof a?.age === "number" ? a.age : null;
        const statusName = String(a?.status?.name || "").toLowerCase();
        const isTwoWay =
          statusName.includes("two-way") ||
          (salary > 0 && salary < 950_000);
        return {
          nbaPlayerId: null,
          espnId: a?.id ? String(a.id) : null,
          name: fullName,
          position: String(a?.position?.abbreviation || "").trim() || "G-F",
          age,
          experienceYears: expYears,
          headshotUrl: String(a?.headshot?.href || "").trim() || undefined,
          hasOfficialContract: Boolean(c && salary > 0),
          salary,
          incomingTradeValue,
          outgoingTradeValue,
          yearsRemaining,
          exactYearlySalaries: null,
          optionTypeCode: Number(c?.optionType) || 0,
          tradeKickerPct: c?.tradeKicker?.active ? Number(c.tradeKicker.percentage) || 0 : 0,
          tradeRestriction: Boolean(c?.tradeRestriction),
          poisonPill: Boolean(c?.poisonPillProvision?.active),
          baseYearCompensation: Boolean(c?.baseYearCompensation?.active),
          minimumSalaryException: Boolean(c?.minimumSalaryException),
          isTwoWay,
        };
      })
      .filter(Boolean);
    return { abbr, athletes: parsed };
  } catch {
    return null;
  }
}

async function fetchAllTeamsLiveContracts(cachedFetchJson, forceRefresh = false) {
  const allMeta = Object.values(NBA_TEAMS_MAP);
  const teamsByAbbr = {};
  const BATCH_SIZE = 6;

  // 1. Primary: Official 2026-27 cap hits & multi-year schedules from Fanspo
  for (let i = 0; i < allMeta.length; i += BATCH_SIZE) {
    const batch = allMeta.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((m) => fetchSingleTeamFanspoContracts(m.abbr))
    );
    for (const res of results) {
      if (res && res.athletes.length > 0) {
        teamsByAbbr[res.abbr] = res.athletes;
      }
    }
  }

  // 2. Fallback for any missing team via ESPN Roster API
  const missingMeta = allMeta.filter((m) => !teamsByAbbr[m.abbr]);
  if (missingMeta.length > 0) {
    for (let i = 0; i < missingMeta.length; i += BATCH_SIZE) {
      const batch = missingMeta.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((m) =>
          fetchSingleTeamEspnRosterContracts(m.abbr, m.espnSlug, cachedFetchJson, forceRefresh)
        )
      );
      for (const res of results) {
        if (res && res.athletes.length > 0) {
          teamsByAbbr[res.abbr] = res.athletes;
        }
      }
    }
  }

  const fetchedTeamsCount = Object.keys(teamsByAbbr).length;
  if (fetchedTeamsCount >= 20) {
    if (fetchedTeamsCount < 30) {
      const prev = readRawContractsDiskCache();
      if (prev?.teamsByAbbr) {
        for (const [abbr, list] of Object.entries(prev.teamsByAbbr)) {
          if (!teamsByAbbr[abbr]) teamsByAbbr[abbr] = list;
        }
      }
    }
    writeRawContractsDiskCache(teamsByAbbr);
    return { teamsByAbbr, source: "espn_live" };
  }

  const disk = readRawContractsDiskCache();
  if (disk?.teamsByAbbr) {
    return { teamsByAbbr: disk.teamsByAbbr, source: "disk_cache" };
  }
  return { teamsByAbbr, source: "fallback_estimated" };
}

let cachedContractsResponse = null;

export async function buildLeagueContractsPayload(params) {
  const { s27, biosById, cachedFetchJson, forceRefresh = false } = params;
  if (
    !forceRefresh &&
    cachedContractsResponse &&
    cachedContractsResponse.expiresAt > Date.now()
  ) {
    return cachedContractsResponse.payload;
  }

  // Prefer fast disk snapshot if fresh (< 6h) and not forceRefresh, otherwise fetch live
  let teamsRawByAbbr = null;
  let source = "espn_live";
  if (!forceRefresh) {
    const disk = readRawContractsDiskCache();
    if (disk?.savedAt && disk?.teamsByAbbr) {
      const ageMs = Date.now() - Date.parse(disk.savedAt);
      if (Number.isFinite(ageMs) && ageMs < 6 * 60 * 60 * 1000 && Object.keys(disk.teamsByAbbr).length >= 28) {
        teamsRawByAbbr = disk.teamsByAbbr;
        source = "disk_cache";
      }
    }
  }

  if (!teamsRawByAbbr) {
    const fetched = await fetchAllTeamsLiveContracts(cachedFetchJson, forceRefresh);
    teamsRawByAbbr = fetched.teamsByAbbr;
    source = fetched.source;
  }

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

  const teamsObjByAbbr = new Map();
  for (const t of teamsList) {
    if (t?.abbreviation) {
      teamsObjByAbbr.set(String(t.abbreviation).toUpperCase(), t);
    }
  }

  // Build player lookup indexes from 2026-27 season dataset + bios
  const statsByPlayerId = new Map();
  const playersByPlainName = new Map();
  const playersByLookupKey = new Map();
  const activePlayersByTeam = new Map();

  for (const p of playersList) {
    const stats = computePlayerSeasonStats(p);
    statsByPlayerId.set(p.id, { player: p, stats });
    const abbr = String(p.teamAbbr || "").toUpperCase();
    if (abbr) {
      const arr = activePlayersByTeam.get(abbr) || [];
      arr.push({ player: p, stats });
      activePlayersByTeam.set(abbr, arr);
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

  const resolvePlayer = (name, hintAbbr, nbaPlayerId) => {
    if (nbaPlayerId) {
      const byId = statsByPlayerId.get(String(nbaPlayerId))?.player;
      if (byId) return { player: byId, bio: null };
      const bioById = biosById && typeof biosById.get === "function" ? biosById.get(String(nbaPlayerId)) : null;
      if (bioById) return { player: null, bio: bioById };
    }
    let clean = String(name || "").trim();
    if (/chet\s+holmgrem/i.test(clean)) clean = "Chet Holmgren";
    const kPlain = normalizePlain(clean);
    const kLook = normalizePlayerLookupKey(clean);
    const cands = playersByPlainName.get(kPlain) || playersByLookupKey.get(kLook) || [];
    if (cands.length === 1) return { player: cands[0], bio: null };
    if (cands.length > 1) {
      const match = cands.find((c) => String(c.teamAbbr || "").toUpperCase() === hintAbbr);
      return { player: match || cands[0], bio: null };
    }
    const bio = biosByPlainName.get(kPlain) || biosByLookupKey.get(kLook) || null;
    return { player: null, bio };
  };

  const teamCapSheets = [];
  const tierCounts = {
    under_floor: 0,
    under_cap: 0,
    over_cap: 0,
    luxury_tax: 0,
    first_apron: 0,
    second_apron: 0,
  };
  let totalPlayers = 0;
  let totalOfficialContracts = 0;
  let totalEstimatedContracts = 0;
  let totalTwoWay = 0;

  for (const meta of Object.values(NBA_TEAMS_MAP)) {
    const abbr = meta.abbr;
    const teamObj = teamsObjByAbbr.get(abbr);
    const conf = NBA_TEAM_CONFERENCE_MAP[abbr] === "Este" ? "East" : "West";
    const division = NBA_TEAM_DIVISION_MAP[abbr] || "";
    const rawRoster = Array.isArray(teamsRawByAbbr[abbr]) ? teamsRawByAbbr[abbr] : [];

    const teamPlayers = [];
    const seenPlayerIds = new Set();
    const seenPlainNames = new Set();

    for (const r of rawRoster) {
      const resolved = resolvePlayer(r.name, abbr, r.nbaPlayerId);
      const pObj = resolved.player;
      const bioObj = resolved.bio;
      const playerId = pObj?.id || bioObj?.id || r.nbaPlayerId || null;
      const displayName = pObj?.name || bioObj?.name || r.name;
      const nameNorm = normalizePlain(displayName);
      if (playerId && seenPlayerIds.has(playerId)) continue;
      if (seenPlainNames.has(nameNorm)) continue;
      if (playerId) seenPlayerIds.add(playerId);
      seenPlainNames.add(nameNorm);

      const statsBundle = playerId ? statsByPlayerId.get(playerId)?.stats : null;
      const stats = statsBundle || {
        gp: 0,
        minutesPg: 0,
        pointsPg: 0,
        reboundsPg: 0,
        assistsPg: 0,
        usgPct: 0,
        tsPct: 0,
      };

      let salary = r.salary;
      let isTwoWay = Boolean(r.isTwoWay);
      let dataQuality = "official_espn";
      let yearsRemaining = Math.max(1, Math.min(5, Number(r.yearsRemaining) || 1));

      if (!r.hasOfficialContract || salary <= 0) {
        const isLikelyTwoWay =
          isTwoWay ||
          ((r.experienceYears ?? 0) <= 2 && stats.gp > 0 && stats.minutesPg < 10 && stats.gp < 25) ||
          ((r.experienceYears ?? 0) <= 1 && stats.gp === 0);
        if (isLikelyTwoWay) {
          isTwoWay = true;
          salary = CBA_2026_27_THRESHOLDS.twoWaySalary;
          dataQuality = "estimated_two_way";
          yearsRemaining = 1;
        } else {
          salary =
            (r.experienceYears ?? 2) === 0
              ? CBA_2026_27_THRESHOLDS.rookieMinimum
              : CBA_2026_27_THRESHOLDS.veteranMinimum;
          dataQuality = "estimated_minimum";
          yearsRemaining = 1;
        }
      }

      const countsAgainstCap = !isTwoWay;
      const optionType = mapEspnOptionType(r.optionTypeCode, isTwoWay);
      const yearlySalaries =
        Array.isArray(r.exactYearlySalaries) && r.exactYearlySalaries.length === FUTURE_SEASONS.length
          ? r.exactYearlySalaries
          : buildYearlySalaries(
              salary,
              yearsRemaining,
              optionType,
              isTwoWay,
              dataQuality !== "official_espn"
            );
      const eff = computeSportingEfficiency(stats, salary, isTwoWay);

      teamPlayers.push({
        id: playerId ? `p:${playerId}` : `espn:${r.espnId || nameNorm}:${abbr}`,
        playerId,
        espnId: r.espnId,
        name: displayName,
        nameNorm,
        teamId: teamObj?.id || meta.id,
        teamAbbr: abbr,
        teamName: teamObj?.name || meta.name,
        conference: conf,
        position: pObj?.position || bioObj?.position || r.position || "G-F",
        age: r.age ?? bioObj?.age ?? null,
        experienceYears: r.experienceYears,
        headshotUrl: pObj?.headshotUrl || r.headshotUrl,
        salary: Math.round(salary),
        capPct: round2((salary / CBA_2026_27_THRESHOLDS.salaryCap) * 100),
        incomingTradeValue: Math.round(r.incomingTradeValue || salary),
        outgoingTradeValue: Math.round(r.outgoingTradeValue || salary),
        yearsRemaining,
        yearlySalaries,
        optionType,
        isTwoWay,
        countsAgainstCap,
        tradeKickerPct: round1(r.tradeKickerPct || 0),
        tradeRestriction: Boolean(r.tradeRestriction),
        poisonPill: Boolean(r.poisonPill),
        baseYearCompensation: Boolean(r.baseYearCompensation),
        minimumSalaryException: Boolean(r.minimumSalaryException),
        dataQuality,
        gamesPlayed: stats.gp,
        minutesPg: stats.minutesPg,
        pointsPg: stats.pointsPg,
        reboundsPg: stats.reboundsPg,
        assistsPg: stats.assistsPg,
        usgPct: stats.usgPct,
        tsPct: stats.tsPct,
        sportingImpactScore: eff.sportingImpactScore,
        valuePerMillion: eff.valuePerMillion,
        efficiencyTier: eff.efficiencyTier,
      });
    }

    // Ensure key active 2026-27 RadarNBA players on this team not returned by ESPN roster still appear cleanly
    const teamActiveS27 = activePlayersByTeam.get(abbr) || [];
    for (const { player: pObj, stats } of teamActiveS27) {
      if (seenPlayerIds.has(pObj.id)) continue;
      const nameNorm = normalizePlain(pObj.name);
      if (seenPlainNames.has(nameNorm)) continue;
      if (stats.gp < 3 && teamPlayers.length >= 15) continue;
      seenPlayerIds.add(pObj.id);
      seenPlainNames.add(nameNorm);

      const isTwoWay = stats.minutesPg < 10 && stats.gp < 20;
      const salary = isTwoWay
        ? CBA_2026_27_THRESHOLDS.twoWaySalary
        : CBA_2026_27_THRESHOLDS.veteranMinimum;
      const dataQuality = isTwoWay ? "estimated_two_way" : "estimated_minimum";
      const optionType = isTwoWay ? "TWO_WAY" : "GTD";
      const yearlySalaries = buildYearlySalaries(salary, 1, optionType, isTwoWay, true);
      const eff = computeSportingEfficiency(stats, salary, isTwoWay);

      teamPlayers.push({
        id: `p:${pObj.id}`,
        playerId: pObj.id,
        espnId: null,
        name: pObj.name,
        nameNorm,
        teamId: teamObj?.id || meta.id,
        teamAbbr: abbr,
        teamName: teamObj?.name || meta.name,
        conference: conf,
        position: pObj.position || "G-F",
        age: null,
        experienceYears: null,
        headshotUrl: pObj.headshotUrl,
        salary,
        capPct: round2((salary / CBA_2026_27_THRESHOLDS.salaryCap) * 100),
        incomingTradeValue: salary,
        outgoingTradeValue: salary,
        yearsRemaining: 1,
        yearlySalaries,
        optionType,
        isTwoWay,
        countsAgainstCap: !isTwoWay,
        tradeKickerPct: 0,
        tradeRestriction: false,
        poisonPill: false,
        baseYearCompensation: false,
        minimumSalaryException: !isTwoWay,
        dataQuality,
        gamesPlayed: stats.gp,
        minutesPg: stats.minutesPg,
        pointsPg: stats.pointsPg,
        reboundsPg: stats.reboundsPg,
        assistsPg: stats.assistsPg,
        usgPct: stats.usgPct,
        tsPct: stats.tsPct,
        sportingImpactScore: eff.sportingImpactScore,
        valuePerMillion: eff.valuePerMillion,
        efficiencyTier: eff.efficiencyTier,
      });
    }

    // Sort players by salary descending, then minutes descending
    teamPlayers.sort((a, b) => {
      if (b.salary !== a.salary) return b.salary - a.salary;
      return b.minutesPg - a.minutesPg;
    });

    const capCountingPlayers = teamPlayers.filter((p) => p.countsAgainstCap);
    const activePayroll = capCountingPlayers.reduce((sum, p) => sum + p.salary, 0);
    const cbaTier = classifyTeamCbaTier(activePayroll);
    tierCounts[cbaTier] += 1;

    const futurePayroll = {
      "2026-27": activePayroll,
      "2027-28": 0,
      "2028-29": 0,
      "2029-30": 0,
    };
    for (const p of capCountingPlayers) {
      for (const slot of p.yearlySalaries) {
        if (slot.season !== "2026-27" && slot.salary) {
          futurePayroll[slot.season] += slot.salary;
        }
      }
    }

    const officialCount = teamPlayers.filter((p) => p.dataQuality === "official_espn").length;
    const estimatedCount = teamPlayers.length - officialCount;
    const twoWayCount = teamPlayers.filter((p) => p.isTwoWay).length;
    const expiringCount = capCountingPlayers.filter((p) => p.yearsRemaining === 1).length;
    const restrictedTradeCount = teamPlayers.filter((p) => p.tradeRestriction).length;
    const topPlayer = teamPlayers[0] || null;

    totalPlayers += teamPlayers.length;
    totalOfficialContracts += officialCount;
    totalEstimatedContracts += estimatedCount;
    totalTwoWay += twoWayCount;

    teamCapSheets.push({
      teamId: teamObj?.id || meta.id,
      teamAbbr: abbr,
      teamName: teamObj?.name || meta.name,
      conference: conf,
      division,
      logoUrl: teamObj?.logoUrl,
      wins: teamObj?.wins ?? 0,
      losses: teamObj?.losses ?? 0,
      activePayroll,
      capPct: round1((activePayroll / CBA_2026_27_THRESHOLDS.salaryCap) * 100),
      capSpace: Math.max(0, CBA_2026_27_THRESHOLDS.salaryCap - activePayroll),
      overCapBy: Math.max(0, activePayroll - CBA_2026_27_THRESHOLDS.salaryCap),
      distanceToFloor: CBA_2026_27_THRESHOLDS.salaryFloor - activePayroll,
      distanceToTax: CBA_2026_27_THRESHOLDS.luxuryTax - activePayroll,
      distanceToFirstApron: CBA_2026_27_THRESHOLDS.firstApron - activePayroll,
      distanceToSecondApron: CBA_2026_27_THRESHOLDS.secondApron - activePayroll,
      cbaTier,
      rosterCount: teamPlayers.length,
      standardContractsCount: capCountingPlayers.length,
      twoWayCount,
      officialContractsCount: officialCount,
      estimatedContractsCount: estimatedCount,
      expiringCount,
      restrictedTradeCount,
      topContractPlayerId: topPlayer?.playerId || null,
      topContractPlayerName: topPlayer?.name || null,
      topContractSalary: topPlayer?.salary || 0,
      futurePayroll,
      availableExceptions: getAvailableExceptionsForTier(cbaTier),
      players: teamPlayers,
    });
  }

  teamCapSheets.sort((a, b) => b.activePayroll - a.activePayroll);

  const avgTeamPayroll =
    teamCapSheets.length > 0
      ? Math.round(
          teamCapSheets.reduce((s, t) => s + t.activePayroll, 0) / teamCapSheets.length
        )
      : 0;

  const payload = {
    generatedAt: new Date().toISOString(),
    source,
    thresholds: CBA_2026_27_THRESHOLDS,
    summary: {
      totalTeams: teamCapSheets.length,
      totalPlayers,
      officialContractsCount: totalOfficialContracts,
      estimatedContractsCount: totalEstimatedContracts,
      twoWayCount: totalTwoWay,
      avgTeamPayroll,
      highestPayrollTeamAbbr: teamCapSheets[0]?.teamAbbr || null,
      lowestPayrollTeamAbbr:
        teamCapSheets[teamCapSheets.length - 1]?.teamAbbr || null,
      tierCounts,
    },
    teams: teamCapSheets,
  };

  cachedContractsResponse = {
    expiresAt: Date.now() + 20 * 60 * 1000,
    payload,
  };
  return payload;
}
