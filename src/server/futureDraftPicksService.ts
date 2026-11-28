// @ts-nocheck
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { NBA_TEAMS_MAP } from "../utils/teamLogos.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR =
  [
    path.resolve(process.cwd(), "data"),
    path.resolve(__dirname, "../data"),
    path.resolve(__dirname, "../../data"),
  ].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "data");

const FUTURE_PICKS_SNAPSHOT_FILE = path.join(DATA_DIR, "nba-future-picks.json.gz");
const SERVERLESS_TMP_FUTURE_PICKS_FILE = "/tmp/radarnba-future-picks.json.gz";

const FANSPO_ALLOWED_HOST = "fanspo.com";
const FUTURE_PICKS_SCHEMA_VERSION = 4;
const FUTURE_YEARS = [2027, 2028, 2029, 2030, 2031, 2032, 2033];
const FUTURE_MIN_YEAR = 2027;
const FUTURE_MAX_YEAR = 2033;

const VALID_TEAM_ABBR_SET = new Set([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
  "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
  "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
]);

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const FANSPO_TEAM_MAP = {
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

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function buildFanspoDraftPicksUrl(abbr) {
  const entry = FANSPO_TEAM_MAP[String(abbr || "").toUpperCase()];
  if (!entry) return null;
  const u = new URL(
    `https://${FANSPO_ALLOWED_HOST}/nba/teams/${entry.slug}/${entry.id}/draft-picks`
  );
  if (u.hostname !== FANSPO_ALLOWED_HOST || u.protocol !== "https:") return null;
  return u.toString();
}

function cleanText(val) {
  return String(val || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractProtectionLabelEs(details) {
  const txt = cleanText(details);
  if (!txt || /^no protections$/i.test(txt)) return null;
  const topMatch = txt.match(/protected(?:\s+for\s+selections?)?\s+1\s*[-–]\s*(\d+)/i);
  if (topMatch) {
    return `Prot. Top ${topMatch[1]}`;
  }
  const singleMatch = txt.match(/protected\s+for\s+selection\s+(\d+)\b/i);
  if (singleMatch) {
    return singleMatch[1] === "1" ? "Prot. Top 1" : `Prot. #${singleMatch[1]}`;
  }
  const rangeMatch = txt.match(/protected(?:\s+for\s+selections?)?\s+(\d+)\s*[-–]\s*(\d+)/i);
  if (rangeMatch) {
    return `Prot. ${rangeMatch[1]}–${rangeMatch[2]}`;
  }
  if (/protect/i.test(txt)) {
    return "Con protección";
  }
  return null;
}

function extractTeamAbbrsFromText(text) {
  const matches = String(text || "").match(/\b[A-Z]{3}\b/g) || [];
  const seen = new Set();
  const out = [];
  for (const m of matches) {
    if (VALID_TEAM_ABBR_SET.has(m) && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

function teamDisplayName(abbr) {
  return NBA_TEAMS_MAP[abbr]?.name || abbr;
}

function formatTeamListEs(abbrs) {
  if (!abbrs || abbrs.length === 0) return "otra franquicia";
  if (abbrs.length === 1) return `${teamDisplayName(abbrs[0])} (${abbrs[0]})`;
  if (abbrs.length === 2) return `${abbrs[0]} o ${abbrs[1]}`;
  return `${abbrs.slice(0, -1).join(", ")} o ${abbrs[abbrs.length - 1]}`;
}

function formatTradeDateEs(usDate) {
  const m = String(usDate || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return usDate;
  const monthIdx = Number(m[1]) - 1;
  const day = Number(m[2]);
  const year = m[3];
  const monthLabel = MONTHS_ES[monthIdx] || m[1];
  return `${day} ${monthLabel} ${year}`;
}

const KNOWN_NBA_TRADES_ES = {
  "CHA-DAL, 2/8/2024": "Traspaso de P.J. Washington",
  "CHA-MIA, 1/23/2024": "Traspaso de Terry Rozier",
  "BKN-CHA-CHI-MIN, 7/10/2026": "Megatraspaso de LaMelo Ball, Naz Reid, Julius Randle y Nic Claxton",
  "CHA-PHX, 6/30/2025": "Traspaso de Mark Williams",
  "CHA-PHX, 7/13/2026": "Traspaso de Miles Bridges por Grayson Allen y Royce O'Neale",
  "BOS-CHA, 2/5/2026": "Traspaso de Xavier Tillman Sr.",
  "LAL-UTA, 7/8/2026": "Sign-and-trade de Walker Kessler",
  "MEM-UTA, 2/3/2026": "Traspaso de Jaren Jackson Jr.",
  "MIA-MIL, 7/6/2026": "Megatraspaso de Giannis Antetokounmpo a Miami",
  "BOS-PHI, 7/6/2026": "Traspaso de Jaylen Brown por Paul George",
  "LAC-TOR, 9/14/2026": "Traspaso de Kawhi Leonard por Brandon Ingram",
  "ATL-DAL-OKC, 7/19/2026": "Traspaso a 3 bandas de Zaccharie Risacher y Lu Dort",
  "DAL-DET-LAC-MEM-MIL-WAS, 7/8/2026": "Megatraspaso a 6 bandas (John Collins, Santi Aldama, Khris Middleton)",
  "DAL-WAS, 2/5/2026": "Traspaso de Anthony Davis a Washington",
  "CHI-MIN, 2/5/2026": "Traspaso de Ayo Dosunmu y Rob Dillingham",
  "CHI-IND, 6/24/2026": "Traspaso en noche de Draft 2026 (Kam Jones / pick #38)",
  "ATL-BKN-GSW-HOU-LAL-MIN-PHX, 7/6/2025": "Megatraspaso histórico a 7 bandas de Kevin Durant a Houston",
  "MEM-ORL, 6/15/2025": "Traspaso de Desmond Bane a Orlando",
  "DET-GSW-MIA-UTA, 2/6/2025": "Megatraspaso de Jimmy Butler a Golden State",
  "DET-GSW-MIA-TOR-UTA, 2/6/2025": "Megatraspaso de Jimmy Butler a Golden State",
  "CHI-SAC-SAS, 2/3/2025": "Traspaso a 3 bandas de De'Aaron Fox y Zach LaVine",
  "ATL-CLE, 2/6/2025": "Traspaso de De'Andre Hunter a Cleveland",
  "PHX-UTA, 1/21/2025": "Traspaso de 3 rondas futuras (PHX–UTA)",
  "BKN-NYK, 7/6/2024": "Traspaso de Mikal Bridges a los Knicks",
  "BKN-HOU, 6/26/2024": "Acuerdo de recuperación de rondas BKN–HOU",
  "ATL-NOP, 7/6/2024": "Traspaso de Dejounte Murray a New Orleans",
  "CHI-SAC-SAS, 7/8/2024": "Sign-and-trade de DeMar DeRozan y Harrison Barnes",
  "MIN-SAS, 6/26/2024": "Traspaso en Draft 2024 por Rob Dillingham (#8)",
  "DAL-OKC, 2/8/2024": "Traspaso de Daniel Gafford (acuerdo de swap con OKC)",
  "LAC-OKC-PHI, 11/1/2023": "Traspaso de James Harden a los Clippers",
  "MIL-PHX-POR, 9/27/2023": "Traspaso a 3 bandas de Damian Lillard a Milwaukee",
  "IND-PHX-WAS, 6/23/2023": "Traspaso de Bradley Beal a Phoenix",
  "BOS-DAL-SAS, 7/12/2023": "Traspaso de Grant Williams a Dallas",
  "GSW-WAS, 7/6/2023": "Traspaso de Chris Paul por Jordan Poole",
  "LAL-MIN-UTA, 2/9/2023": "Traspaso de Russell Westbrook y D'Angelo Russell",
  "BKN-IND-MIL-PHX, 2/9/2023": "Traspaso de Kevin Durant a Phoenix",
  "BKN-DAL, 2/6/2023": "Traspaso de Kyrie Irving a Dallas",
  "CLE-UTA, 9/3/2022": "Traspaso de Donovan Mitchell a Cleveland",
  "MIN-UTA, 7/6/2022": "Traspaso de Rudy Gobert a Minnesota",
  "DEN-OKC, 6/23/2022": "Traspaso de JaMychal Green (Draft 2022)",
  "BKN-PHI, 2/10/2022": "Traspaso de James Harden por Ben Simmons",
  "BOS-SAS, 2/10/2022": "Traspaso de Derrick White a Boston",
  "BKN-CLE-HOU-IND, 1/16/2021": "Megatraspaso de James Harden a Brooklyn",
  "DEN-MIL-NOP-OKC, 11/23/2020": "Traspaso de Jrue Holiday a Milwaukee",
  "NOP-POR, 2/8/2022": "Traspaso de CJ McCollum a New Orleans",
  "IND-NYK, 7/7/2023": "Traspaso de Obi Toppin a Indiana",
  "DET-NYK, 2/8/2024": "Traspaso de Bojan Bogdanović y Alec Burks",
  "DAL-DET, 7/6/2024": "Traspaso de Tim Hardaway Jr. por Quentin Grimes",
  "CHA-DAL-DEN-GSW-MIN-PHI, 7/6/2024": "Megatraspaso a 6 bandas de Klay Thompson a Dallas",
  "MIL-NYK-WAS, 2/6/2025": "Traspaso de Kyle Kuzma y Khris Middleton",
  "SAC-WAS, 2/5/2025": "Traspaso de Jonas Valančiūnas a Sacramento",
  "UTA-WAS, 6/25/2025": "Traspaso en noche de Draft 2025 (UTA–WAS)",
  "OKC-SAC, 6/25/2025": "Traspaso en noche de Draft 2025 (OKC–SAC)",
};

// Verified origins for major unprotected 1st-round picks where Fanspo omits the [TEAMS, DATE] tag
const KNOWN_UNPROTECTED_R1_ORIGINS_ES = {
  // Mikal Bridges (BKN-NYK)
  "BKN:NYK:2027": "Traspaso de Mikal Bridges a los Knicks · BKN–NYK (6 jul 2024)",
  "BKN:NYK:2029": "Traspaso de Mikal Bridges a los Knicks · BKN–NYK (6 jul 2024)",
  "BKN:NYK:2031": "Traspaso de Mikal Bridges a los Knicks · BKN–NYK (6 jul 2024)",
  "NYK->BKN:2027": "Traspaso de Mikal Bridges a los Knicks · BKN–NYK (6 jul 2024)",
  "NYK->BKN:2029": "Traspaso de Mikal Bridges a los Knicks · BKN–NYK (6 jul 2024)",
  "NYK->BKN:2031": "Traspaso de Mikal Bridges a los Knicks · BKN–NYK (6 jul 2024)",
  // Michael Porter Jr. / Cam Johnson (BKN-DEN)
  "BKN:DEN:2032": "Traspaso de Michael Porter Jr. por Cam Johnson · BKN–DEN (jul 2025)",
  "DEN->BKN:2032": "Traspaso de Michael Porter Jr. por Cam Johnson · BKN–DEN (jul 2025)",
  // Dejounte Murray to Atlanta (ATL-SAS, 2022)
  "SAS:ATL:2027": "Traspaso de Dejounte Murray a Atlanta · ATL–SAS (30 jun 2022)",
  "ATL->SAS:2027": "Traspaso de Dejounte Murray a Atlanta · ATL–SAS (30 jun 2022)",
  // Luka Doncic / Anthony Davis (DAL-LAL-UTA, Feb 2025)
  "DAL:LAL:2029": "Megatraspaso de Luka Dončić y Anthony Davis · DAL–LAL–UTA (2 feb 2025)",
  "LAL->DAL:2029": "Megatraspaso de Luka Dončić y Anthony Davis · DAL–LAL–UTA (2 feb 2025)",
  // Walker Kessler sign-and-trade (LAL-UTA, Jul 2026)
  "UTA:LAL:2031": "Sign-and-trade de Walker Kessler · LAL–UTA (8 jul 2026)",
  "UTA:LAL:2033": "Sign-and-trade de Walker Kessler · LAL–UTA (8 jul 2026)",
  "LAL->UTA:2031": "Sign-and-trade de Walker Kessler · LAL–UTA (8 jul 2026)",
  "LAL->UTA:2033": "Sign-and-trade de Walker Kessler · LAL–UTA (8 jul 2026)",
  // LaMelo Ball 4-team trade (BKN-CHA-CHI-MIN, Jul 2026)
  "CHA:MIN:2033": "Megatraspaso de LaMelo Ball, Naz Reid y Julius Randle · BKN–CHA–CHI–MIN (10 jul 2026)",
  "MIN->CHA:2033": "Megatraspaso de LaMelo Ball, Naz Reid y Julius Randle · BKN–CHA–CHI–MIN (10 jul 2026)",
  // Miles Bridges trade (CHA-PHX, Jul 2026)
  "CHA:PHX:2033": "Traspaso de Miles Bridges por Grayson Allen y Royce O'Neale · CHA–PHX (13 jul 2026)",
  "PHX->CHA:2033": "Traspaso de Miles Bridges por Grayson Allen y Royce O'Neale · CHA–PHX (13 jul 2026)",
  // Kawhi Leonard / Brandon Ingram (LAC-TOR, Sep 2026)
  "LAC:TOR:2031": "Traspaso de Kawhi Leonard por Brandon Ingram · LAC–TOR (14 sep 2026)",
  "LAC:TOR:2033": "Traspaso de Kawhi Leonard por Brandon Ingram · LAC–TOR (14 sep 2026)",
  "TOR->LAC:2031": "Traspaso de Kawhi Leonard por Brandon Ingram · LAC–TOR (14 sep 2026)",
  "TOR->LAC:2033": "Traspaso de Kawhi Leonard por Brandon Ingram · LAC–TOR (14 sep 2026)",
  // Jaylen Brown / Paul George (BOS-PHI, Jul 2026)
  "BOS:PHI:2031": "Traspaso de Jaylen Brown por Paul George · BOS–PHI (6 jul 2026)",
  "PHI->BOS:2031": "Traspaso de Jaylen Brown por Paul George · BOS–PHI (6 jul 2026)",
  // Jaren Jackson Jr. (MEM-UTA, Feb 2026)
  "MEM:PHX:2031": "Traspaso de Jaren Jackson Jr. (vía UTA–PHX) · MEM–UTA (3 feb 2026)",
  // Rudy Gobert (MIN-UTA, Jul 2022)
  "UTA:MIN:2027": "Traspaso de Rudy Gobert a Minnesota · MIN–UTA (6 jul 2022)",
  "MIN->UTA:2027": "Traspaso de Rudy Gobert a Minnesota · MIN–UTA (6 jul 2022)",
  // Donovan Mitchell (CLE-UTA, Sep 2022)
  "UTA:CLE:2027": "Traspaso de Donovan Mitchell a Cleveland · CLE–UTA (3 sep 2022)",
  "CLE->UTA:2027": "Traspaso de Donovan Mitchell a Cleveland · CLE–UTA (3 sep 2022)",
  // Desmond Bane (MEM-ORL, Jun 2025)
  "MEM:ORL:2028": "Traspaso de Desmond Bane a Orlando · MEM–ORL (15 jun 2025)",
  "MEM:ORL:2030": "Traspaso de Desmond Bane a Orlando · MEM–ORL (15 jun 2025)",
  "ORL->MEM:2028": "Traspaso de Desmond Bane a Orlando · MEM–ORL (15 jun 2025)",
  "ORL->MEM:2030": "Traspaso de Desmond Bane a Orlando · MEM–ORL (15 jun 2025)",
  // Damian Lillard (MIL-PHX-POR, Sep 2023)
  "POR:MIL:2029": "Traspaso de Damian Lillard a Milwaukee · MIL–PHX–POR (27 sep 2023)",
  "MIL->POR:2029": "Traspaso de Damian Lillard a Milwaukee · MIL–PHX–POR (27 sep 2023)",
  // Kevin Durant to Phoenix / Houston
  "HOU:PHX:2027": "Traspaso de Kevin Durant (vía BKN–HOU) · BKN–HOU (26 jun 2024)",
  "PHX->HOU:2027": "Traspaso de Kevin Durant (vía BKN–HOU) · BKN–HOU (26 jun 2024)",
  // James Harden to Clippers (LAC-PHI, Nov 2023)
  "PHI:LAC:2028": "Traspaso de James Harden a los Clippers · LAC–OKC–PHI (1 nov 2023)",
  "LAC->PHI:2028": "Traspaso de James Harden a los Clippers · LAC–OKC–PHI (1 nov 2023)",
  // Desmond Bane (ORL-MEM) -> Draft 2025 (MEM-POR)
  "POR:ORL:2028": "Traspaso de Desmond Bane (ORL→MEM) y traspaso en Draft 2025 (MEM→POR) · ORL–MEM–POR (jun 2025)",
  "ORL->POR:2028": "Traspaso de Desmond Bane (ORL→MEM) y traspaso en Draft 2025 (MEM→POR) · ORL–MEM–POR (jun 2025)",
  // Giannis Antetokounmpo to Miami (MIA-MIL, Jul 2026)
  "MIL:MIA:2031": "Megatraspaso de Giannis Antetokounmpo a Miami · MIA–MIL (6 jul 2026)",
  "MIL:MIA:2033": "Megatraspaso de Giannis Antetokounmpo a Miami · MIA–MIL (6 jul 2026)",
  "MIA->MIL:2031": "Megatraspaso de Giannis Antetokounmpo a Miami · MIA–MIL (6 jul 2026)",
  "MIA->MIL:2033": "Megatraspaso de Giannis Antetokounmpo a Miami · MIA–MIL (6 jul 2026)",
  // Rob Dillingham / De'Aaron Fox / Zach LaVine (MIN -> SAS -> SAC)
  "SAC:MIN:2031": "Traspaso de Rob Dillingham (MIN→SAS) y de De'Aaron Fox / Zach LaVine (SAS→SAC) · MIN–SAS–SAC (2024–2025)",
  "MIN->SAC:2031": "Traspaso de Rob Dillingham (MIN→SAS) y de De'Aaron Fox / Zach LaVine (SAS→SAC) · MIN–SAS–SAC (2024–2025)",
  // Peyton Watson sign-and-trade (CLE-DEN-LAC, Aug 2026)
  "DEN:CLE:2031": "Sign-and-trade de Peyton Watson a Cleveland · CLE–DEN–LAC (ago 2026)",
  "CLE->DEN:2031": "Sign-and-trade de Peyton Watson a Cleveland · CLE–DEN–LAC (ago 2026)",
  // Deni Avdija / Jrue Holiday / Damian Lillard 2029 pool (WAS / POR / BOS / MIL)
  "WAS:BOS,MIL,POR:2029": "Traspaso de Deni Avdija a Portland (con rondas de Jrue Holiday y Damian Lillard) · BOS–MIL–POR–WAS (2023–2024)",
  "BOS->POR,WAS:2029": "Traspaso de Jrue Holiday (BOS–POR) y de Deni Avdija (POR–WAS) · BOS–POR–WAS (2023–2024)",
  "MIL->POR,WAS:2029": "Traspaso de Damian Lillard (MIL–POR) y de Deni Avdija (POR–WAS) · MIL–POR–WAS (2023–2024)",
  // 2027 UTA / CLE / MIN pool -> MEM (JJJ), UTA (Mitchell/Gobert), PHX (3-pick swap)
  "MEM:UTA,CLE,MIN:2027": "Traspaso de Jaren Jackson Jr. (MEM–UTA) con rondas de Donovan Mitchell y Rudy Gobert · CLE–MIN–UTA–MEM (3 feb 2026)",
  "UTA:CLE,MIN:2027": "Traspasos de Donovan Mitchell (CLE–UTA) y Rudy Gobert (MIN–UTA) · CLE–MIN–UTA (2022)",
  "PHX:UTA,CLE,MIN:2027": "Traspaso de 3 rondas futuras (PHX–UTA) con picks de Donovan Mitchell y Rudy Gobert · PHX–UTA (21 ene 2025)",
  "CLE->MEM,UTA,PHX:2027": "Traspaso de Donovan Mitchell a Cleveland (repartido entre MEM, UTA y PHX) · CLE–UTA (3 sep 2022)",
  "MIN->MEM,UTA,PHX:2027": "Traspaso de Rudy Gobert a Minnesota (repartido entre MEM, UTA y PHX) · MIN–UTA (6 jul 2022)",
};

function parseTradeTrailEs(detailsEn, pick) {
  const txt = cleanText(detailsEn);
  const bracketMatches = txt.match(/\[([^\]]+)\]/g);
  const entries = [];

  if (bracketMatches && bracketMatches.length > 0) {
    for (const bm of bracketMatches) {
      const inner = bm.slice(1, -1).trim();
      const parts = inner.split(";").map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const m = part.match(/^([A-Z]{3}(?:-[A-Z]{3})+)\s*,\s*(\d{1,2}\/\d{1,2}\/\d{4})$/);
        if (m) {
          const rawKey = `${m[1]}, ${m[2]}`;
          const teams = m[1].split("-");
          const dateEs = formatTradeDateEs(m[2]);
          const title = KNOWN_NBA_TRADES_ES[rawKey] || null;
          entries.push({
            teams,
            dateEs,
            title,
            shortLabel: `${teams.join("–")} (${dateEs})`,
          });
        }
      }
    }
  }

  if (entries.length === 1) {
    const e = entries[0];
    if (e.title) {
      return `${e.title} · ${e.shortLabel}`;
    }
    const prefix = e.teams.length >= 3 ? `Traspaso a ${e.teams.length} bandas` : "Traspaso";
    return `${prefix} ${e.shortLabel}`;
  }

  if (entries.length > 1) {
    // Highlight the most recent / motivating trade for this franchise when available
    const last = entries[entries.length - 1];
    const first = entries[0];
    if (last.title) {
      const originNote = first.title && first.title !== last.title ? ` (origen inicial: ${first.title})` : "";
      return `${last.title} · ${last.shortLabel}${originNote}`;
    }
    if (first.title) {
      return `${first.title} · ${first.shortLabel} → ${last.shortLabel}`;
    }
    if (entries.length <= 3) {
      return `Cadena de traspasos: ${entries.map((e) => e.shortLabel).join(" → ")}`;
    }
    return `Cadena de ${entries.length} traspasos: ${first.shortLabel} → … → ${last.shortLabel}`;
  }

  // Fallback for unprotected 1st-round picks without bracket tag
  if (pick && pick.round === 1) {
    const fromAbbrs = extractTeamAbbrsFromText(pick.fromText);
    const toAbbrs = extractTeamAbbrsFromText(pick.toText);
    if (pick.category === "incoming" && fromAbbrs.length >= 1) {
      const key = `${pick.teamAbbr}:${fromAbbrs.join(",")}:${pick.year}`;
      if (KNOWN_UNPROTECTED_R1_ORIGINS_ES[key]) return KNOWN_UNPROTECTED_R1_ORIGINS_ES[key];
    }
    if (pick.category === "outgoing" && toAbbrs.length >= 1) {
      const key = `${pick.teamAbbr}->${toAbbrs.join(",")}:${pick.year}`;
      if (KNOWN_UNPROTECTED_R1_ORIGINS_ES[key]) return KNOWN_UNPROTECTED_R1_ORIGINS_ES[key];
    }
  }

  return null;
}

function translateOfficialClauseEs(detailsEn) {
  const raw = cleanText(detailsEn);
  if (!raw || /^no protections$/i.test(raw)) return null;

  // Remove trailing [TEAM-TEAM, DATE] block because we display it separately in tradeTrailEs
  let s = raw.replace(/\s*\[[^\]]+\]\s*$/g, "").trim();
  if (!s) return null;

  const replacements = [
    [/\b1st round pick\b/gi, "elección de 1ª ronda"],
    [/\b2nd round pick\b/gi, "elección de 2ª ronda"],
    [/\bhas the right to swap its\b/gi, "tiene derecho a intercambiar su"],
    [/\bhave the right to swap their\b/gi, "tienen derecho a intercambiar su"],
    [/\bhas the right to swap\b/gi, "tiene derecho a intercambiar"],
    [/\bhave the right to swap\b/gi, "tienen derecho a intercambiar"],
    [/\bthen have the right to swap\b/gi, "tendrá después derecho a intercambiar"],
    [/\bwill receive the two most favorable of\b/gi, "recibirá las dos mejores elecciones entre"],
    [/\bwill receive the most \/ two most favorable of\b/gi, "recibirá la mejor (o dos mejores) elecciones entre"],
    [/\bwill receive the most favorable of\b/gi, "recibirá la mejor elección entre"],
    [/\bwill receive the more favorable of\b/gi, "recibirá la mejor elección entre"],
    [/\bwill receive the least \/ less favorable of these\b/gi, "recibirá la menos favorable de ellas"],
    [/\bwill receive the least \/ less favorable of\b/gi, "recibirá la menos favorable entre"],
    [/\bwill receive the least favorable of the three\b/gi, "recibirá la menos favorable de las tres"],
    [/\bwill receive the least favorable of\b/gi, "recibirá la menos favorable entre"],
    [/\bwill receive the less favorable of\b/gi, "recibirá la menos favorable entre"],
    [/\bthe most favorable of\b/gi, "la mejor entre"],
    [/\bthe more favorable of\b/gi, "la mejor entre"],
    [/\bthe least favorable of\b/gi, "la menos favorable entre"],
    [/\bthe less favorable of\b/gi, "la menos favorable entre"],
    [/\bprotected for selections?\s+(\d+)\s*[-–]\s*(\d+)\b/gi, "protegida para los puestos $1–$2"],
    [/\bprotected for selection\s+(\d+)\b/gi, "protegida para el puesto #$1"],
    [/\bProtected\s+(\d+)\s*[-–]\s*(\d+)\b/g, "Protegida en los puestos $1–$2"],
    [/\band unprotected in (\d{4})\b/gi, "y sin protección en $1"],
    [/\bif this pick falls within its protected range and is therefore not conveyable(?: as part of this conveyance)?,\s*then\b/gi, "si cae dentro del rango protegido y no puede entregarse, entonces"],
    [/\bif this pick falls within its protected range and is therefore not conveyed,\s*then\b/gi, "si cae dentro del rango protegido y no se entrega, entonces"],
    [/\bif the ([A-Z]{3}) pick falls within the protected range of (\d+-\d+) and is therefore not conveyable(?: as part of this conveyance)?,\s*then\b/gi, "si la ronda de $1 cae en el rango protegido ($2) y no puede entregarse, entonces"],
    [/\bif this pick falls on its protected selection and is therefore not conveyable,\s*then\b/gi, "si cae en su puesto protegido y no puede entregarse, entonces"],
    [/\bwill instead convey its\b/gi, "entregará en su lugar su"],
    [/\bwill instead convey\b/gi, "entregará en su lugar"],
    [/\bcommitment(?: of [A-Z]{3}'?s)? to ([A-Z]{3}) and this swap right of ([A-Z]{3})'?s will be lifted\b/gi, "el compromiso con $1 y este derecho de swap de $2 quedarán anulados"],
    [/\bcommitment to ([A-Z]{3}) will be lifted\b/gi, "el compromiso con $1 quedará saldado/anulado"],
    [/\bin accordance with complex conditions\b/gi, "según condiciones complejas de otros traspasos previos"],
    [/\bmay convey the pick it receives to\b/gi, "podría reenviar la ronda recibida a"],
    [/\bconveyable if\b/gi, "entregable si"],
    [/\bconveys a\b/gi, "entrega una"],
    [/\bpick to\b/gi, "ronda hacia"],
    [/\bfor a\b/gi, "por una"],
    [/\bheld by\b/gi, "en poder de"],
    [/\bincluding the\b/gi, "incluyendo la"],
    [/\bright to swap for\b/gi, "derecho de swap sobre"],
    [/\bfor ([A-Z]{3})'?s\b/g, "por la de $1"],
    [/\bfor the ([A-Z]{3})'?\b/g, "por la de $1"],
    [/\b([A-Z]{3})'?s? (\d{4}) elección de (1ª|2ª) ronda\b/g, "elección de $3 ronda de $1 ($2)"],
    [/\b([A-Z]{3})'?s elección de (1ª|2ª) ronda\b/g, "elección de $2 ronda de $1"],
    [/\b([A-Z]{3})'?s (\d{4})\b/g, "la de $1 ($2)"],
    [/\bthe ([A-Z]{3}) pick\b/g, "la ronda de $1"],
    [/\bto ([A-Z]{3})\b/g, "para $1"],
    [/\bin (\d{4})\b/g, "en $1"],
    [/\bvia\b/gi, "vía"],
    [/\bits (\d{4}) elección de (1ª|2ª) ronda\b/gi, "su elección de $2 ronda de $1"],
    [/\bits pick\b/gi, "su propia ronda"],
    [/\band\b/gi, "y"],
    [/\bor\b/gi, "o"],
  ];

  for (const [regex, rep] of replacements) {
    s = s.replace(regex, rep);
  }
  s = cleanText(s);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildPickExplanationEs(pick) {
  const teamName = teamDisplayName(pick.teamAbbr);
  const roundLabel = pick.round === 1 ? "1ª ronda" : "2ª ronda";
  const fromAbbrs = extractTeamAbbrsFromText(pick.fromText);
  const toAbbrs = extractTeamAbbrsFromText(pick.toText);
  const details = cleanText(pick.detailsEn);
  const topMatch = details.match(/protected(?:\s+for\s+selections?)?\s+1\s*[-–]\s*(\d+)/i);
  const rangeMatch = details.match(/protected(?:\s+for\s+selections?)?\s+(\d+)\s*[-–]\s*(\d+)/i);
  const singleMatch = details.match(/protected\s+for\s+selection\s+(\d+)\b/i);
  const fallbackSecondMatch = details.match(/will instead convey\s+((?:[A-Z]{3}'?s\s+|its\s+)?\d{4}\s+2nd round pick)/i);
  const unprotectedNextMatch = details.match(/unprotected in (\d{4})/i);

  let protectionExplain = "";
  if (topMatch) {
    const n = Number(topMatch[1]);
    const sender = fromAbbrs[0] || pick.teamAbbr;
    protectionExplain = ` Si el pick de ${sender} cae entre los puestos #1 y #${n} (Top ${n}), ${sender} lo conserva; si cae del #${n + 1} en adelante, pasa a ${pick.category === "outgoing" ? (toAbbrs[0] || "el rival") : pick.teamAbbr}.`;
    if (unprotectedNextMatch) {
      protectionExplain += ` Si no se entrega en ${pick.year}, pasa sin protección en ${unprotectedNextMatch[1]}.`;
    } else if (fallbackSecondMatch) {
      const fbClean = fallbackSecondMatch[1]
        .replace(/2nd round pick/i, "2ª ronda")
        .replace(/its /i, `su `)
        .replace(/'s/i, "");
      protectionExplain += ` Si se activa la protección, se compensa con la ${fbClean}.`;
    }
  } else if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    protectionExplain = ` Solo se transfiere si cae fuera del rango protegido (#${a}–#${b}).`;
  } else if (singleMatch) {
    protectionExplain = ` Protegida únicamente si cae en el puesto #${singleMatch[1]}.`;
  }

  if (pick.category === "own") {
    return `Elección original de ${teamName} para el Draft ${pick.year} (${roundLabel}). Pertenece íntegramente a ${pick.teamAbbr} sin condiciones externas.`;
  }

  if (pick.category === "incoming") {
    const srcText = fromAbbrs.length > 0 ? formatTeamListEs(fromAbbrs) : (pick.fromText || "otra franquicia");
    if (fromAbbrs.length >= 2 && /least|less favorable/i.test(details)) {
      return `Procede de ${srcText}: ${pick.teamAbbr} recibirá la elección menos favorable del grupo según el orden final del Draft ${pick.year}.${protectionExplain}`;
    }
    if (fromAbbrs.length >= 2 && /most|more favorable/i.test(details)) {
      return `Procede de ${srcText}: ${pick.teamAbbr} recibirá la mejor elección del grupo en el Draft ${pick.year}.${protectionExplain}`;
    }
    if (fromAbbrs.length >= 2) {
      return `Procede de ${srcText} (según cómo se resuelvan los acuerdos entre esos equipos en el Draft ${pick.year}).${protectionExplain}`;
    }
    if (pick.isProtected) {
      return `Ronda original de ${srcText} adquirida por ${pick.teamAbbr}.${protectionExplain}`;
    }
    return `Ronda original de ${srcText} adquirida por ${pick.teamAbbr} sin protecciones: sea cual sea el puesto en el sorteo de ${pick.year}, elige ${pick.teamAbbr}.`;
  }

  if (pick.category === "swap_favorable") {
    const partnerText = fromAbbrs.length > 0 ? formatTeamListEs(fromAbbrs) : "el rival";
    const extraSwapNote =
      pick.round === 1
        ? ` No suma una 1ª ronda extra, sino el derecho a mejorar posición eligiendo el mejor pick entre el de ${pick.teamAbbr} y el de ${fromAbbrs.join(" / ") || "el rival"}.`
        : ` Permite intercambiar la 2ª ronda propia por la de ${fromAbbrs.join(" / ") || "el rival"} si sale más alta.`;
    return `Derecho de intercambio favorable (Swap +) con ${partnerText}.${extraSwapNote}${protectionExplain}`;
  }

  if (pick.category === "swap_encumbered") {
    const holderText = toAbbrs.length > 0 ? formatTeamListEs(toAbbrs) : "otro equipo";
    return `Ronda controlada por ${pick.teamAbbr}, pero ${holderText} tiene derecho a intercambiarla (Swap −) si sale más alta en el Draft ${pick.year}. ${pick.teamAbbr} conserva una elección, pero se quedará con la menos favorable.`;
  }

  // outgoing
  const destText = toAbbrs.length > 0 ? formatTeamListEs(toAbbrs) : (pick.toText || "otra franquicia");
  return `Ronda original de ${pick.teamAbbr} traspasada hacia ${destText}.${protectionExplain}`;
}

function buildOriginFields(pick) {
  const fromAbbrs = extractTeamAbbrsFromText(pick.fromText);
  const toAbbrs = extractTeamAbbrsFromText(pick.toText);

  if (pick.category === "own") {
    return {
      originTeams: [pick.teamAbbr],
      originLabelEs: `Propia · ${teamDisplayName(pick.teamAbbr)}`,
    };
  }
  if (pick.category === "incoming") {
    return {
      originTeams: fromAbbrs.length > 0 ? fromAbbrs : [pick.teamAbbr],
      originLabelEs:
        fromAbbrs.length === 1
          ? `Procedencia: ${teamDisplayName(fromAbbrs[0])} (${fromAbbrs[0]})`
          : fromAbbrs.length > 1
          ? `Procedencia condicional: ${fromAbbrs.join(" / ")}`
          : `Procedencia: ${pick.fromText || "Externa"}`,
    };
  }
  if (pick.category === "swap_favorable") {
    return {
      originTeams: fromAbbrs.length > 0 ? fromAbbrs : [pick.teamAbbr],
      originLabelEs:
        fromAbbrs.length === 1
          ? `Intercambio con ${teamDisplayName(fromAbbrs[0])} (${fromAbbrs[0]})`
          : fromAbbrs.length > 1
          ? `Intercambio múltiple con ${fromAbbrs.join(" / ")}`
          : `Derecho de intercambio (Swap +)`,
    };
  }
  if (pick.category === "swap_encumbered") {
    return {
      originTeams: toAbbrs.length > 0 ? toAbbrs : [pick.teamAbbr],
      originLabelEs:
        toAbbrs.length > 0
          ? `Sujeta a swap de ${toAbbrs.join(" / ")}`
          : `Sujeta a swap rival`,
    };
  }
  return {
    originTeams: toAbbrs.length > 0 ? toAbbrs : [pick.teamAbbr],
    originLabelEs:
      toAbbrs.length === 1
        ? `Cedida a ${teamDisplayName(toAbbrs[0])} (${toAbbrs[0]})`
        : toAbbrs.length > 1
        ? `Cedida hacia ${toAbbrs.join(" / ")}`
        : `Cedida a ${pick.toText || "otro equipo"}`,
  };
}

function enrichPickNarrative(pick) {
  const { originTeams, originLabelEs } = buildOriginFields(pick);
  pick.originTeams = originTeams;
  pick.originLabelEs = originLabelEs;
  pick.tradeTrailEs = parseTradeTrailEs(pick.detailsEn, pick);
  pick.clauseEs = translateOfficialClauseEs(pick.detailsEn);
  pick.explanationEs = buildPickExplanationEs(pick);
  return pick;
}

function crossEnrichTeamsPicks(teams) {
  const allPicks = [];
  for (const t of teams) {
    for (const p of t.picks) allPicks.push(p);
  }

  // Enrich short incoming/swap picks with full official clause & trade date from counterpart team's record
  for (const p of allPicks) {
    const hasRichDetails = Boolean(p.detailsEn && /\[[^\]]+\]/.test(p.detailsEn));
    if (hasRichDetails) continue;

    if (p.category === "incoming") {
      const fromAbbrs = extractTeamAbbrsFromText(p.fromText);
      const counterpart = allPicks.find(
        (o) =>
          o.teamAbbr !== p.teamAbbr &&
          o.year === p.year &&
          o.round === p.round &&
          !o.isControlled &&
          fromAbbrs.includes(o.teamAbbr) &&
          (extractTeamAbbrsFromText(o.toText).includes(p.teamAbbr) ||
            o.detailsEn.includes(p.teamAbbr)) &&
          o.detailsEn.length > (p.detailsEn || "").length
      );
      if (counterpart) {
        p.detailsEn = counterpart.detailsEn;
        const prot = extractProtectionLabelEs(p.detailsEn);
        if (prot) {
          p.protectionLabelEs = prot;
          p.isProtected = true;
        }
      }
    } else if (p.category === "swap_favorable" || p.category === "swap_encumbered") {
      const partnerAbbrs = extractTeamAbbrsFromText(
        p.category === "swap_favorable" ? p.fromText : p.toText
      );
      const counterpart = allPicks.find(
        (o) =>
          o.teamAbbr !== p.teamAbbr &&
          o.year === p.year &&
          o.round === p.round &&
          o.isSwap &&
          partnerAbbrs.includes(o.teamAbbr) &&
          o.detailsEn.includes(p.teamAbbr) &&
          o.detailsEn.length > (p.detailsEn || "").length
      );
      if (counterpart) {
        p.detailsEn = counterpart.detailsEn;
      }
    }
  }

  // Generate final Spanish narrative, origin, trade trail & translated clause for every pick
  for (const p of allPicks) {
    enrichPickNarrative(p);
  }
}

function classifyRawPick(teamAbbr, raw) {
  const from = cleanText(raw.from);
  const to = cleanText(raw.to);
  const details = cleanText(raw.details);
  const lowerTo = to.toLowerCase();
  const lowerFrom = from.toLowerCase();
  const lowerDetails = details.toLowerCase();

  const isSwap =
    lowerTo.includes("swap") ||
    lowerFrom.includes("swap") ||
    lowerDetails.includes("right to swap") ||
    lowerDetails.includes("more favorable") ||
    lowerDetails.includes("most favorable");

  const teamHoldsSwap =
    isSwap &&
    (to.toUpperCase().startsWith(`${teamAbbr} `) ||
      to.toUpperCase().includes(`${teamAbbr} HOLDS`) ||
      lowerDetails.startsWith(`${teamAbbr.toLowerCase()} has the right to swap`) ||
      lowerDetails.startsWith(`${teamAbbr.toLowerCase()} will receive the more favorable`) ||
      lowerDetails.startsWith(`${teamAbbr.toLowerCase()} will receive the most favorable`) ||
      lowerFrom.includes("swap rights"));

  let category = "own";
  if (!from && !to) {
    category = "own";
  } else if (isSwap) {
    if (teamHoldsSwap) {
      category = "swap_favorable";
    } else if (from && !lowerTo.includes("holds")) {
      category = "incoming";
    } else if (from && lowerTo.includes("holds")) {
      // Another team holds swap over a pick this team receives (still controlled)
      category = "swap_encumbered";
    } else {
      // Own pick encumbered by another team's swap right (team still keeps a pick that year)
      category = "swap_encumbered";
    }
  } else if (from && !to) {
    category = "incoming";
  } else if (!from && to) {
    category = "outgoing";
  } else if (from && to) {
    // Conveyed incoming right or multi-team routing
    category = to.toUpperCase().includes(teamAbbr) ? "incoming" : "outgoing";
  }

  const isControlled = category !== "outgoing";
  const protectionLabelEs = extractProtectionLabelEs(details);
  const isProtected = Boolean(protectionLabelEs);
  const round = Number(raw.round) === 2 ? 2 : 1;
  const year = Number(raw.year) || FUTURE_MIN_YEAR;

  const cleanFrom = from.replace(/swap rights/i, "").trim();
  const cleanTo = to.replace(/holds rights to swap/i, "").trim();

  let summaryEs = "";
  let shortTradeLabel = "";
  const roundShort = round === 1 ? "1ªR" : "2ªR";

  if (category === "own") {
    summaryEs = protectionLabelEs ? `Propia (${protectionLabelEs})` : "Propia sin protección";
    shortTradeLabel = `${year} ${roundShort} Propia (${teamAbbr})`;
  } else if (category === "incoming") {
    const via = cleanFrom || "otra franquicia";
    summaryEs = protectionLabelEs ? `Vía ${via} · ${protectionLabelEs}` : `Vía ${via} (sin protección)`;
    shortTradeLabel = `${year} ${roundShort} vía ${via}${protectionLabelEs ? ` (${protectionLabelEs})` : ""}`;
  } else if (category === "swap_favorable") {
    const partner = cleanFrom || "rival";
    summaryEs = `Swap favorable con ${partner}${protectionLabelEs ? ` · ${protectionLabelEs}` : ""}`;
    shortTradeLabel = `${year} ${roundShort} Swap (${partner})`;
  } else if (category === "swap_encumbered") {
    const holder = cleanTo || "otra franquicia";
    summaryEs = cleanFrom
      ? `Vía ${cleanFrom} (sujeta a swap de ${holder})`
      : `Propia sujeta a swap de ${holder}`;
    shortTradeLabel = `${year} ${roundShort} (${teamAbbr}, swap ${holder})`;
  } else {
    const dest = cleanTo || "otra franquicia";
    summaryEs = protectionLabelEs ? `Enviada a ${dest} (${protectionLabelEs})` : `Enviada a ${dest}`;
    shortTradeLabel = `${year} ${roundShort} → ${dest}`;
  }

  return {
    id: `${teamAbbr}-${year}-R${round}-${String(raw.id || Math.random().toString(36).slice(2, 8))}`,
    teamAbbr,
    year,
    round,
    category,
    isControlled,
    isSwap,
    isProtected,
    protectionLabelEs,
    fromText: from,
    toText: to,
    summaryEs,
    detailsEn: details,
    stepienLocked: false,
    tradable: isControlled,
    shortTradeLabel,
  };
}

function applyStepienAndScore(teamAbbr, rawPicks) {
  const picks = rawPicks
    .map((rp) => classifyRawPick(teamAbbr, rp))
    .filter((p) => p.year >= FUTURE_MIN_YEAR && p.year <= FUTURE_MAX_YEAR)
    .sort((a, b) => a.year - b.year || a.round - b.round || (a.isControlled === b.isControlled ? 0 : a.isControlled ? -1 : 1));

  const firstsByYear = {};
  const secondsByYear = {};
  for (const yr of FUTURE_YEARS) {
    firstsByYear[yr] = 0;
    secondsByYear[yr] = 0;
  }

  for (const p of picks) {
    if (!p.isControlled) continue;
    // Do not double-count a favorable swap as a second independent 1st-round pick when the team already has its own 1st-round pick in that same year
    if (p.category === "swap_favorable") continue;
    if (p.round === 1) firstsByYear[p.year] = (firstsByYear[p.year] || 0) + 1;
    else secondsByYear[p.year] = (secondsByYear[p.year] || 0) + 1;
  }

  // Fallback: if a team ONLY has a swap_favorable in year Y and no base own pick listed, ensure at least 1 controlled
  for (const p of picks) {
    if (p.category === "swap_favorable") {
      if (p.round === 1 && firstsByYear[p.year] === 0) firstsByYear[p.year] = 1;
      if (p.round === 2 && secondsByYear[p.year] === 0) secondsByYear[p.year] = 1;
    }
  }

  // NBA Ted Stepien Rule evaluation across 2027-2033:
  // A team cannot be left without a 1st-round pick in two consecutive future drafts.
  const stepienLockedYearsSet = new Set();
  for (const p of picks) {
    if (!p.isControlled) {
      p.tradable = false;
      p.stepienLocked = false;
      continue;
    }
    if (p.round === 2) {
      p.stepienLocked = false;
      p.tradable = true;
      continue;
    }
    if (p.category === "swap_favorable") {
      // Swap rights can be traded/re-routed without violating Stepien if the base pick stays
      p.stepienLocked = false;
      p.tradable = true;
      continue;
    }
    const countThisYear = firstsByYear[p.year] || 0;
    if (countThisYear >= 2) {
      p.stepienLocked = false;
      p.tradable = true;
    } else {
      const prevYearHasFirst = p.year > FUTURE_MIN_YEAR ? (firstsByYear[p.year - 1] || 0) > 0 : true;
      const nextYearHasFirst = p.year < FUTURE_MAX_YEAR ? (firstsByYear[p.year + 1] || 0) > 0 : true;
      const locked = !prevYearHasFirst || !nextYearHasFirst;
      p.stepienLocked = locked;
      p.tradable = !locked;
      if (locked) stepienLockedYearsSet.add(p.year);
    }
  }

  const controlledFirsts = FUTURE_YEARS.reduce((sum, y) => sum + (firstsByYear[y] || 0), 0);
  const controlledSeconds = FUTURE_YEARS.reduce((sum, y) => sum + (secondsByYear[y] || 0), 0);

  // Count tradable 1st-round picks respecting Stepien ceiling (max consecutive removals)
  let tradableFirsts = 0;
  let stepienLockedFirsts = 0;
  for (const p of picks) {
    if (p.round === 1 && p.isControlled && p.category !== "swap_favorable") {
      if (p.stepienLocked) stepienLockedFirsts += 1;
      else tradableFirsts += 1;
    }
  }

  const incomingFirsts = picks.filter((p) => p.round === 1 && p.category === "incoming").length;
  const incomingSeconds = picks.filter((p) => p.round === 2 && p.category === "incoming").length;
  const outgoingFirsts = picks.filter((p) => p.round === 1 && p.category === "outgoing").length;
  const outgoingSeconds = picks.filter((p) => p.round === 2 && p.category === "outgoing").length;
  const favorableSwaps = picks.filter((p) => p.category === "swap_favorable").length;
  const encumberedSwaps = picks.filter((p) => p.category === "swap_encumbered").length;

  // Transparent Draft Capital Score (points):
  // Own/Incoming 1st = 10 pts (+2 if unprotected incoming, -1.5 if swap-encumbered, +1.5 if tradable),
  // Favorable 1st swap = 4.5 pts, Controlled 2nd = 2 pts.
  let capitalRaw = 0;
  for (const p of picks) {
    if (!p.isControlled) continue;
    if (p.round === 1) {
      if (p.category === "swap_favorable") {
        capitalRaw += 4.5;
      } else {
        let base = 10;
        if (p.category === "incoming" && !p.isProtected) base += 2;
        if (p.category === "swap_encumbered") base -= 1.5;
        if (p.tradable) base += 1.5;
        capitalRaw += base;
      }
    } else {
      capitalRaw += p.category === "swap_favorable" ? 1 : 2;
    }
  }

  return {
    teamAbbr,
    teamName: NBA_TEAMS_MAP[teamAbbr]?.name || teamAbbr,
    controlledFirsts,
    tradableFirsts,
    stepienLockedFirsts,
    controlledSeconds,
    incomingFirsts,
    incomingSeconds,
    outgoingFirsts,
    outgoingSeconds,
    favorableSwaps,
    encumberedSwaps,
    draftCapitalScore: round1(capitalRaw),
    firstsByYear,
    secondsByYear,
    stepienLockedYears: Array.from(stepienLockedYearsSet).sort((a, b) => a - b),
    picks,
  };
}

async function fetchTeamFuturePicksFromFanspo(teamAbbr) {
  const url = buildFanspoDraftPicksUrl(teamAbbr);
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RadarNBA/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match) return null;
    const parsed = JSON.parse(match[1]);
    const apollo = parsed?.props?.pageProps?.apolloState || {};

    const rawPicks = Object.entries(apollo)
      .filter(([key, val]) => key.startsWith("nba_DraftPick:") && val && val.isActive !== false)
      .map(([, val]) => ({
        id: String(val.id || ""),
        year: Number(val.year) || 0,
        round: Number(val.round) === 2 ? 2 : 1,
        from: cleanText(val.from),
        to: cleanText(val.to),
        details: cleanText(val.details),
      }))
      .filter((p) => p.year >= FUTURE_MIN_YEAR && p.year <= FUTURE_MAX_YEAR);

    if (rawPicks.length === 0) return null;
    return applyStepienAndScore(teamAbbr, rawPicks);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPayloadFromTeams(teams, source, generatedAt) {
  const sorted = [...teams].sort((a, b) => {
    if (b.draftCapitalScore !== a.draftCapitalScore) {
      return b.draftCapitalScore - a.draftCapitalScore;
    }
    return b.controlledFirsts - a.controlledFirsts;
  });

  const totalControlledFirsts = sorted.reduce((s, t) => s + t.controlledFirsts, 0);
  const totalTradableFirsts = sorted.reduce((s, t) => s + t.tradableFirsts, 0);
  const totalControlledSeconds = sorted.reduce((s, t) => s + t.controlledSeconds, 0);
  const totalStepienLocks = sorted.reduce((s, t) => s + t.stepienLockedFirsts, 0);

  const topFirsts = [...sorted].sort((a, b) => b.controlledFirsts - a.controlledFirsts)[0];
  const topCapital = sorted[0];

  return {
    generatedAt: generatedAt || new Date().toISOString(),
    source,
    years: FUTURE_YEARS,
    summary: {
      teamsCount: sorted.length,
      totalControlledFirsts,
      totalTradableFirsts,
      totalControlledSeconds,
      totalStepienLocks,
      topFirstsTeamAbbr: topFirsts?.teamAbbr || "OKC",
      topFirstsCount: topFirsts?.controlledFirsts || 0,
      topCapitalTeamAbbr: topCapital?.teamAbbr || "OKC",
      topCapitalScore: topCapital?.draftCapitalScore || 0,
    },
    teams: sorted,
  };
}

function readFuturePicksFromDisk() {
  for (const candidate of [FUTURE_PICKS_SNAPSHOT_FILE, SERVERLESS_TMP_FUTURE_PICKS_FILE]) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = zlib.gunzipSync(fs.readFileSync(candidate)).toString("utf-8");
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.schemaVersion === FUTURE_PICKS_SCHEMA_VERSION &&
        Array.isArray(parsed.teams) &&
        parsed.teams.length >= 25
      ) {
        return parsed;
      }
    } catch {
      // Try fallback path
    }
  }
  return null;
}

function writeFuturePicksToDisk(snapshot) {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(snapshot), "utf-8"));
  for (const target of [FUTURE_PICKS_SNAPSHOT_FILE, SERVERLESS_TMP_FUTURE_PICKS_FILE]) {
    try {
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target, gz);
      return true;
    } catch {
      // Fallback to /tmp in read-only environments
    }
  }
  return false;
}

async function fetchAllTeamsFuturePicksFromFanspo() {
  const abbrs = Object.keys(FANSPO_TEAM_MAP);
  const teams = [];
  const batchSize = 5;

  for (let i = 0; i < abbrs.length; i += batchSize) {
    const batch = abbrs.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((abbr) => fetchTeamFuturePicksFromFanspo(abbr)));
    for (const item of results) {
      if (item) teams.push(item);
    }
  }

  if (teams.length < 20) return null;
  crossEnrichTeamsPicks(teams);
  return {
    schemaVersion: FUTURE_PICKS_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    teams,
  };
}

let inMemorySnapshot = null;
let inFlightPromise = null;

export async function buildFutureDraftPicksPayload({ forceRefresh = false } = {}) {
  let snapshot = !forceRefresh ? inMemorySnapshot : null;
  let source = "disk_cache";

  if (!snapshot && !forceRefresh) {
    snapshot = readFuturePicksFromDisk();
    if (snapshot) {
      inMemorySnapshot = snapshot;
      source = "disk_cache";
    }
  }

  if (!snapshot || forceRefresh) {
    if (!inFlightPromise) {
      inFlightPromise = fetchAllTeamsFuturePicksFromFanspo()
        .then((fetched) => {
          if (fetched && fetched.teams.length >= 20) {
            inMemorySnapshot = fetched;
            writeFuturePicksToDisk(fetched);
            return fetched;
          }
          return null;
        })
        .finally(() => {
          inFlightPromise = null;
        });
    }
    const fetched = await inFlightPromise;
    if (fetched) {
      snapshot = fetched;
      source = "fanspo_live";
    } else if (!snapshot) {
      snapshot = readFuturePicksFromDisk();
      source = "disk_cache";
    }
  }

  if (!snapshot || !Array.isArray(snapshot.teams) || snapshot.teams.length === 0) {
    throw new Error("No se pudo cargar el inventario de rondas futuras del Draft NBA.");
  }

  return buildPayloadFromTeams(snapshot.teams, source, snapshot.generatedAt);
}
