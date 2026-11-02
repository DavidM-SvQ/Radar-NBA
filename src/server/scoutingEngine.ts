// @ts-nocheck
const __name = (fn, _n) => fn;
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { STATIC_SCHEDULE_2027 } from "../utils/staticSchedule.ts";
import { ESPN_TEAM_IDS, NBA_TEAMS_MAP } from "../utils/teamLogos.ts";
const NBA_LIVE_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Referer: "https://www.nba.com/", Origin: "https://www.nba.com", Accept: "application/json" };
const NBA_TEAM_ARENAS = { ATL: { arenaName: "State Farm Arena", arenaCity: "Atlanta" }, BOS: { arenaName: "TD Garden", arenaCity: "Boston" }, BKN: { arenaName: "Barclays Center", arenaCity: "Brooklyn" }, CHA: { arenaName: "Spectrum Center", arenaCity: "Charlotte" }, CHI: { arenaName: "United Center", arenaCity: "Chicago" }, CLE: { arenaName: "Rocket Arena", arenaCity: "Cleveland" }, DAL: { arenaName: "American Airlines Center", arenaCity: "Dallas" }, DEN: { arenaName: "Ball Arena", arenaCity: "Denver" }, DET: { arenaName: "Little Caesars Arena", arenaCity: "Detroit" }, GSW: { arenaName: "Chase Center", arenaCity: "San Francisco" }, HOU: { arenaName: "Toyota Center", arenaCity: "Houston" }, IND: { arenaName: "Gainbridge Fieldhouse", arenaCity: "Indianapolis" }, LAC: { arenaName: "Intuit Dome", arenaCity: "Inglewood" }, LAL: { arenaName: "Crypto.com Arena", arenaCity: "Los \xC1ngeles" }, MEM: { arenaName: "FedExForum", arenaCity: "Memphis" }, MIA: { arenaName: "Kaseya Center", arenaCity: "Miami" }, MIL: { arenaName: "Fiserv Forum", arenaCity: "Milwaukee" }, MIN: { arenaName: "Target Center", arenaCity: "Minneapolis" }, NOP: { arenaName: "Smoothie King Center", arenaCity: "Nueva Orleans" }, NYK: { arenaName: "Madison Square Garden", arenaCity: "Nueva York" }, OKC: { arenaName: "Paycom Center", arenaCity: "Oklahoma City" }, ORL: { arenaName: "Kia Center", arenaCity: "Orlando" }, PHI: { arenaName: "Wells Fargo Center", arenaCity: "Filadelfia" }, PHX: { arenaName: "Footprint Center", arenaCity: "Phoenix" }, POR: { arenaName: "Moda Center", arenaCity: "Portland" }, SAC: { arenaName: "Golden 1 Center", arenaCity: "Sacramento" }, SAS: { arenaName: "Frost Bank Center", arenaCity: "San Antonio" }, TOR: { arenaName: "Scotiabank Arena", arenaCity: "Toronto" }, UTA: { arenaName: "Delta Center", arenaCity: "Salt Lake City" }, WAS: { arenaName: "Capital One Arena", arenaCity: "Washington" } };
const KNOWN_SPANISH_NBA_PLAYERS = /* @__PURE__ */ new Set(["santi aldama", "santiago aldama", "hugo gonzalez", "usman garuba", "eli ndiaye", "eli john ndiaye", "juan nunez", "aday mara", "izan almansa", "baba miller", "great osobor", "willy hernangomez", "juancho hernangomez", "ricky rubio", "alex abrines"]);
const reportMemoryCache = /* @__PURE__ */ new Map();
const reportInflight = /* @__PURE__ */ new Map();
const reportInflightStartedAt = /* @__PURE__ */ new Map();
function round1(val) {
  return Math.round((Number(val) || 0) * 10) / 10;
}
function normalizePlain(str) {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function isSpanishPlayerCheck(name, country) {
  const normCountry = normalizePlain(country || "");
  if (normCountry === "spain" || normCountry === "espana") return true;
  const normName = normalizePlain(name);
  return KNOWN_SPANISH_NBA_PLAYERS.has(normName);
}
function formatThousandsEs(num) {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function parseIsoMinutes(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const mins = Math.floor(raw);
    const secs = Math.round((raw - mins) * 60);
    return { decimal: round1(raw), formatted: `${mins}:${String(secs).padStart(2, "0")}` };
  }
  const str = String(raw || "").trim();
  const isoMatch = str.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/i);
  if (isoMatch) {
    const mins = Number(isoMatch[1]) || 0;
    const secs = Math.min(59, Math.round(Number(isoMatch[2]) || 0));
    return { decimal: round1(mins + secs / 60), formatted: `${mins}:${String(secs).padStart(2, "0")}` };
  }
  const colonMatch = str.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const mins = Number(colonMatch[1]) || 0;
    const secs = Number(colonMatch[2]) || 0;
    return { decimal: round1(mins + secs / 60), formatted: `${mins}:${String(secs).padStart(2, "0")}` };
  }
  const n = Number(str) || 0;
  return { decimal: round1(n), formatted: `${Math.round(n)}:00` };
}
function buildShortPlayerName(fullName, firstName, familyName) {
  const f = (firstName || "").trim();
  const l = (familyName || "").trim();
  if (f && l) {
    return `${f.charAt(0).toUpperCase()}. ${l}`;
  }
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName.trim() || "Jugador";
  const initial = parts[0].charAt(0).toUpperCase();
  const rest = parts.slice(1).join(" ");
  return `${initial}. ${rest}`;
}
function sanitizeJersey(rawJersey, fallbackJersey) {
  const cleanA = String(rawJersey ?? "").replace(/[^0-9]/g, "").trim();
  if (cleanA.length > 0) return cleanA;
  const cleanB = String(fallbackJersey ?? "").replace(/[^0-9]/g, "").trim();
  if (cleanB.length > 0) return cleanB;
  return "0";
}
function computeHollingerGmSc(stats) {
  return round1(stats.points + 0.4 * stats.fgm - 0.7 * stats.fga - 0.4 * (stats.fta - stats.ftm) + 0.7 * stats.oreb + 0.3 * stats.dreb + stats.stl + 0.7 * stats.ast + 0.7 * stats.blk - 0.4 * stats.pf - stats.tov);
}
function parsePbpClockRemaining(rawClock) {
  const str = String(rawClock || "").trim();
  const isoMatch = str.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/i);
  if (isoMatch) {
    const mins = Math.max(0, Number(isoMatch[1]) || 0);
    const secsFloat = Math.max(0, Number(isoMatch[2]) || 0);
    const secs = Math.min(59, Math.floor(secsFloat));
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  const colonMatch = str.match(/^(\d{1,2}):(\d{2})(?:\.\d+)?$/);
  if (colonMatch) {
    return `${colonMatch[1].padStart(2, "0")}:${colonMatch[2]}`;
  }
  return "";
}
const MEDICAL_BODY_PARTS_ES = [{ rx: /\bplantar\s+fascia\b/i, es: "fascia plantar", gender: "f" }, { rx: /\bfifth\s+metatarsal\b/i, es: "quinto metatarsiano", gender: "m" }, { rx: /\bmetatarsal\b/i, es: "metatarsiano", gender: "m" }, { rx: /\bachilles(?:\s+tendon)?\b/i, es: "tend\xF3n de Aquiles", gender: "m" }, { rx: /\bacl\b|\banterior\s+cruciate(?:\s+ligament)?\b/i, es: "ligamento cruzado anterior (LCA)", gender: "m" }, { rx: /\bmcl\b|\bmedial\s+collateral(?:\s+ligament)?\b/i, es: "ligamento lateral interno", gender: "m" }, { rx: /\blcl\b|\blateral\s+collateral(?:\s+ligament)?\b/i, es: "ligamento lateral externo", gender: "m" }, { rx: /\bpcl\b|\bposterior\s+cruciate(?:\s+ligament)?\b/i, es: "ligamento cruzado posterior", gender: "m" }, { rx: /\bmeniscus\b/i, es: "menisco", gender: "m" }, { rx: /\brotator\s+cuff\b/i, es: "manguito rotador", gender: "m" }, { rx: /\blabrum\b/i, es: "labrum", gender: "m" }, { rx: /\bhip\s+flexor\b/i, es: "flexor de la cadera", gender: "m" }, { rx: /\blow(?:er)?\s+back\b|\blumbar\b/i, es: "zona lumbar", gender: "f" }, { rx: /\bupper\s+back\b|\bthoracic\b/i, es: "zona dorsal", gender: "f" }, { rx: /\bgreat\s+toe\b|\bbig\s+toe\b/i, es: "dedo gordo del pie", gender: "m" }, { rx: /\bindex\s+finger\b/i, es: "dedo \xEDndice", gender: "m" }, { rx: /\bring\s+finger\b/i, es: "dedo anular", gender: "m" }, { rx: /\bmiddle\s+finger\b/i, es: "dedo coraz\xF3n", gender: "m" }, { rx: /\bpinky(?:\s+finger)?\b|\blittle\s+finger\b/i, es: "dedo me\xF1ique", gender: "m" }, { rx: /\bankle\b/i, es: "tobillo", gender: "m" }, { rx: /\bknee\b|\bpatella(?:r)?\b/i, es: "rodilla", gender: "f" }, { rx: /\bhamstring\b/i, es: "isquiotibiales", gender: "mp" }, { rx: /\bcalf\b|\bgastrocnemius\b|\bsoleus\b/i, es: "gemelo", gender: "m" }, { rx: /\badductor\b/i, es: "aductor", gender: "m" }, { rx: /\babductor\b|\bgroin\b/i, es: "abductor", gender: "m" }, { rx: /\bquad(?:riceps)?\b/i, es: "cu\xE1driceps", gender: "m" }, { rx: /\bthigh\b/i, es: "muslo", gender: "m" }, { rx: /\bhip\b/i, es: "cadera", gender: "f" }, { rx: /\bpelvis\b|\bpelvic\b/i, es: "pelvis", gender: "f" }, { rx: /\bback\b|\bspine\b|\bspinal\b/i, es: "espalda", gender: "f" }, { rx: /\bshoulder\b|\bclavicle\b|\bcollarbone\b/i, es: "hombro", gender: "m" }, { rx: /\bwrist\b/i, es: "mu\xF1eca", gender: "f" }, { rx: /\bthumb\b/i, es: "pulgar", gender: "m" }, { rx: /\bfinger\b/i, es: "dedo de la mano", gender: "m" }, { rx: /\bhand\b|\bmetacarpal\b/i, es: "mano", gender: "f" }, { rx: /\bforearm\b/i, es: "antebrazo", gender: "m" }, { rx: /\belbow\b/i, es: "codo", gender: "m" }, { rx: /\bbiceps?\b/i, es: "b\xEDceps", gender: "m" }, { rx: /\btriceps?\b/i, es: "tr\xEDceps", gender: "m" }, { rx: /\bpectoral\b|\bchest\b/i, es: "pectoral", gender: "m" }, { rx: /\bfoot\b/i, es: "pie", gender: "m" }, { rx: /\btoe\b/i, es: "dedo del pie", gender: "m" }, { rx: /\bheel\b/i, es: "tal\xF3n", gender: "m" }, { rx: /\bshin\b|\btibia(?:l)?\b/i, es: "tibia", gender: "f" }, { rx: /\bfibula(?:r)?\b/i, es: "peron\xE9", gender: "m" }, { rx: /\bleg\b|\blower\s+leg\b/i, es: "pierna", gender: "f" }, { rx: /\barm\b/i, es: "brazo", gender: "m" }, { rx: /\bneck\b|\bcervical\b/i, es: "cuello", gender: "m" }, { rx: /\brib(?:s|cage)?\b/i, es: "costillas", gender: "fp" }, { rx: /\babdom(?:en|inal)\b|\bcore\b|\boblique\b/i, es: "zona abdominal", gender: "f" }, { rx: /\btailbone\b|\bcoccyx\b|\bglute(?:al)?\b/i, es: "zona gl\xFAtea", gender: "f" }, { rx: /\bnose\b|\bnasal\b/i, es: "tabique nasal", gender: "m" }, { rx: /\beye\b|\borbital\b/i, es: "zona ocular", gender: "f" }, { rx: /\bjaw\b/i, es: "mand\xEDbula", gender: "f" }, { rx: /\bface\b|\bfacial\b|\bcheek\b/i, es: "rostro", gender: "m" }, { rx: /\bhead\b/i, es: "cabeza", gender: "f" }];
const MEDICAL_CONDITIONS_ES = [{ rx: /\bconcussion(?:\s+protocol)?\b/i, withBody: __name(() => "protocolo de conmoci\xF3n cerebral", "withBody"), standalone: "protocolo de conmoci\xF3n cerebral" }, { rx: /\bplantar\s+fasciitis\b/i, withBody: __name((b) => b.includes("plantar") ? `fascitis en ${b}` : `fascitis plantar (${b})`, "withBody"), standalone: "fascitis plantar" }, { rx: /\bgastroenteritis\b|\bstomach\s+(?:illness|virus|flu|bug)\b/i, withBody: __name(() => "gastroenteritis", "withBody"), standalone: "gastroenteritis" }, { rx: /\bupper\s+respiratory(?:\s+illness|\s+infection)?\b|\brespiratory\s+illness\b|\bsinus(?:itis)?\b/i, withBody: __name(() => "infecci\xF3n respiratoria", "withBody"), standalone: "infecci\xF3n respiratoria" }, { rx: /\bmigraine\b/i, withBody: __name(() => "cuadro de migra\xF1a", "withBody"), standalone: "cuadro de migra\xF1a" }, { rx: /\b(?:non-covid\s+)?illness\b|\bflu\b|\bviral\b|\bsick(?:ness)?\b/i, withBody: __name(() => "proceso v\xEDrico", "withBody"), standalone: "proceso v\xEDrico" }, { rx: /\bhealth\s+and\s+safety(?:\s+protocols?)?\b/i, withBody: __name(() => "protocolo m\xE9dico de salud", "withBody"), standalone: "protocolo m\xE9dico de salud" }, { rx: /\breturn\s+to\s+competition(?:\s+reconditioning)?\b|\breconditioning\b/i, withBody: __name((b) => `readaptaci\xF3n competitiva (${b})`, "withBody"), standalone: "readaptaci\xF3n f\xEDsica a la competici\xF3n" }, { rx: /\binjury\s+management\b|\bload\s+management\b|\bmanagement\b/i, withBody: __name((b) => `gesti\xF3n m\xE9dica de cargas en ${b}`, "withBody"), standalone: "gesti\xF3n m\xE9dica de cargas" }, { rx: /\bsurgery\b|\bsurgical\b|\barthroscop(?:y|ic)\b|\brepair\b|\breconstruction\b/i, withBody: __name((b) => `recuperaci\xF3n quir\xFArgica en ${b}`, "withBody"), standalone: "recuperaci\xF3n tras intervenci\xF3n quir\xFArgica" }, { rx: /\btorn\b|\btear\b|\brupture(?:d)?\b/i, withBody: __name((b) => `rotura fibrilar/ligamentosa en ${b}`, "withBody"), standalone: "rotura fibrilar o ligamentosa" }, { rx: /\bstress\s+fracture\b/i, withBody: __name((b) => `fractura por estr\xE9s en ${b}`, "withBody"), standalone: "fractura por estr\xE9s" }, { rx: /\bstress\s+reaction\b/i, withBody: __name((b) => `reacci\xF3n \xF3sea por estr\xE9s en ${b}`, "withBody"), standalone: "reacci\xF3n \xF3sea por estr\xE9s" }, { rx: /\bavulsion\b|\bfracture(?:d)?\b|\bbroken\b/i, withBody: __name((b) => `fractura en ${b}`, "withBody"), standalone: "fractura \xF3sea" }, { rx: /\bdislocat(?:ion|ed)\b/i, withBody: __name((b) => `luxaci\xF3n en ${b}`, "withBody"), standalone: "luxaci\xF3n articular" }, { rx: /\bsubluxation\b/i, withBody: __name((b) => `subluxaci\xF3n en ${b}`, "withBody"), standalone: "subluxaci\xF3n articular" }, { rx: /\bsprain(?:ed)?\b/i, withBody: __name((b) => `esguince de ${b}`, "withBody"), standalone: "esguince articular" }, { rx: /\bstrain(?:ed)?\b|\bpulled\b/i, withBody: __name((b) => `distensi\xF3n en ${b}`, "withBody"), standalone: "distensi\xF3n muscular" }, { rx: /\btendinopathy\b/i, withBody: __name((b) => `tendinopat\xEDa en ${b}`, "withBody"), standalone: "tendinopat\xEDa" }, { rx: /\btendinitis\b|\btendonitis\b/i, withBody: __name((b) => `tendinitis en ${b}`, "withBody"), standalone: "tendinitis" }, { rx: /\bbursitis\b/i, withBody: __name((b) => `bursitis en ${b}`, "withBody"), standalone: "bursitis" }, { rx: /\bimpingement\b/i, withBody: __name((b) => `pinzamiento articular en ${b}`, "withBody"), standalone: "pinzamiento articular" }, { rx: /\bbone\s+bruise\b/i, withBody: __name((b) => `edema \xF3seo en ${b}`, "withBody"), standalone: "edema \xF3seo" }, { rx: /\bcontusion\b|\bbruis(?:e|ed|ing)\b/i, withBody: __name((b) => `contusi\xF3n en ${b}`, "withBody"), standalone: "contusi\xF3n" }, { rx: /\binflammation\b|\bswelling\b|\beffusion\b/i, withBody: __name((b) => `inflamaci\xF3n en ${b}`, "withBody"), standalone: "inflamaci\xF3n articular" }, { rx: /\bspasms?\b/i, withBody: __name((b) => `espasmos musculares en ${b}`, "withBody"), standalone: "espasmos musculares" }, { rx: /\btightness\b|\bstiffness\b/i, withBody: __name((b) => `sobrecarga en ${b}`, "withBody"), standalone: "sobrecarga muscular" }, { rx: /\blaceration\b|\bcut\b/i, withBody: __name((b) => `herida inciso-contusa en ${b}`, "withBody"), standalone: "herida inciso-contusa" }, { rx: /\bsore(?:ness)?\b|\bpain\b|\bach(?:e|ing)\b|\bdiscomfort\b/i, withBody: __name((b) => `molestias en ${b}`, "withBody"), standalone: "molestias f\xEDsicas" }, { rx: /\brecovery\b|\brehab(?:ilitation)?\b/i, withBody: __name((b) => `proceso de recuperaci\xF3n en ${b}`, "withBody"), standalone: "proceso de recuperaci\xF3n m\xE9dica" }];
function formatSpanishLaterality(side, gender) {
  if (!side) return "";
  if (side === "bilateral") {
    return gender === "mp" || gender === "fp" ? "bilaterales" : "bilateral";
  }
  if (side === "left") {
    if (gender === "f") return "izquierda";
    if (gender === "mp") return "izquierdos";
    if (gender === "fp") return "izquierdas";
    return "izquierdo";
  }
  if (gender === "f") return "derecha";
  if (gender === "mp") return "derechos";
  if (gender === "fp") return "derechas";
  return "derecho";
}
function translateMedicalDetailEs(rawDetail) {
  const cleaned = String(rawDetail || "").replace(/^Injury\/Illness\s*-\s*/i, "").replace(/^(?:INACTIVE|DNP|DND|NWT)_(?:INJURY|REST|PERSONAL|NORMAL)\s*[-:]?\s*/i, "").replace(/^(?:DNP|DND|NWT)\s*-\s*/i, "").replace(/\bNot\s+Specified\b/gi, "").replace(/\b(?:Out(?:\s+for\s+season)?|Day-To-Day|Questionable|Doubtful|Probable|Injured\s+Reserve)\b/gi, "").replace(/[;:]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return "";
  let side = null;
  if (/\bbilateral\b/i.test(cleaned)) side = "bilateral";
  else if (/\bleft\b|\bizq(?:uierd[oa]s?)?\b/i.test(cleaned)) side = "left";
  else if (/\bright\b|\bder(?:ech[oa]s?)?\b/i.test(cleaned)) side = "right";
  let matchedBody = null;
  for (const bp of MEDICAL_BODY_PARTS_ES) {
    if (bp.rx.test(cleaned)) {
      matchedBody = { es: bp.es, gender: bp.gender };
      break;
    }
  }
  const bodyPhrase = matchedBody ? [matchedBody.es, formatSpanishLaterality(side, matchedBody.gender)].filter(Boolean).join(" ") : "";
  for (const cond of MEDICAL_CONDITIONS_ES) {
    if (cond.rx.test(cleaned)) {
      return bodyPhrase ? cond.withBody(bodyPhrase) : cond.standalone;
    }
  }
  if (bodyPhrase) {
    return `molestias en ${bodyPhrase}`;
  }
  if (/\brest\b|\bdescanso\b/i.test(cleaned)) {
    return "descanso programado";
  }
  const hasEnglishLeak = /\b(?:the|and|for|with|from|against|game|out|ruled|expected|return|week|month|season|injury|injured|illness|unspecified|status|coach|decision|assignment|personal|suspended|suspension|pending|trade|sore|pain|tear|torn|broken|surgery|sprain|strain)\b/i.test(cleaned);
  if (hasEnglishLeak) {
    return "";
  }
  return cleaned;
}
function classifyAbsenceOrDnp(isActiveOnBench, rawReason, rawDesc, espnInjury) {
  const cleanReasonRaw = String(rawReason || "").trim();
  const cleanDescRaw = String(rawDesc || "").trim();
  const reasonDescLow = `${cleanReasonRaw} ${cleanDescRaw}`.toLowerCase();
  const espnStatusLow = String(espnInjury?.status || "").toLowerCase();
  const espnDetailLow = String(espnInjury?.detail || "").toLowerCase();
  if (reasonDescLow.includes("coach") || reasonDescLow.includes("cd -") || reasonDescLow.includes("dnp_coach") || reasonDescLow.includes("decision")) {
    return { statusType: "coach_decision", statusLabel: "Decisi\xF3n t\xE9cnica", statusTone: "slate", priorityRank: isActiveOnBench ? 7 : 6, note: isActiveOnBench ? "Convocado en banquillo sin minutos por rotaci\xF3n t\xE9cnica" : "Descarte t\xE9cnico de convocatoria (sin parte m\xE9dico)" };
  }
  if (reasonDescLow.includes("gleague") || reasonDescLow.includes("g-league") || reasonDescLow.includes("g league") || reasonDescLow.includes("two-way") || reasonDescLow.includes("twoway") || reasonDescLow.includes("on assignment")) {
    return { statusType: "gleague", statusLabel: "Decisi\xF3n t\xE9cnica \xB7 G-League", statusTone: "slate", priorityRank: 6, note: "Asignado a G-League / contrato dual (fuera de rotaci\xF3n NBA)" };
  }
  if (reasonDescLow.includes("rest") && !reasonDescLow.includes("wrist") || espnDetailLow === "rest") {
    return { statusType: "rest", statusLabel: "Descanso", statusTone: "amber", priorityRank: 4, note: "Gesti\xF3n programada de descanso y cargas f\xEDsicas" };
  }
  if (reasonDescLow.includes("suspension") || reasonDescLow.includes("suspended") || espnStatusLow.includes("suspension")) {
    return { statusType: "suspension_personal", statusLabel: "Sanci\xF3n", statusTone: "amber", priorityRank: 4, note: "Baja disciplinaria \xB7 Sanci\xF3n oficial NBA" };
  }
  if (reasonDescLow.includes("personal") || reasonDescLow.includes("not with team") || reasonDescLow.includes("nwt") || reasonDescLow.includes("bereavement")) {
    return { statusType: "suspension_personal", statusLabel: "Motivos personales", statusTone: "amber", priorityRank: 4, note: "Ausencia autorizada \xB7 Motivos personales" };
  }
  if (reasonDescLow.includes("trade")) {
    return { statusType: "suspension_personal", statusLabel: "Traspaso en curso", statusTone: "amber", priorityRank: 5, note: "Fuera de convocatoria \xB7 Operaci\xF3n de traspaso en curso" };
  }
  const espnConfirmsMedical = Boolean(espnInjury && (!isActiveOnBench || espnStatusLow.includes("out") || espnStatusLow.includes("doubtful") || espnStatusLow.includes("questionable") || espnStatusLow.includes("day-to-day") || espnStatusLow.includes("injured")));
  const fullMedicalCheckLow = `${reasonDescLow} ${espnConfirmsMedical ? espnDetailLow : ""}`;
  if (fullMedicalCheckLow.includes("illness") || fullMedicalCheckLow.includes("flu") || fullMedicalCheckLow.includes("stomach") || fullMedicalCheckLow.includes("gastro") || fullMedicalCheckLow.includes("respiratory") || fullMedicalCheckLow.includes("sinus") || fullMedicalCheckLow.includes("migraine") || fullMedicalCheckLow.includes("viral")) {
    const cleanIll = translateMedicalDetailEs(cleanDescRaw || espnInjury?.detail || "");
    return { statusType: "injury", statusLabel: "Baja m\xE9dica", statusTone: "rose", priorityRank: 3, note: cleanIll ? `Indisposici\xF3n m\xE9dica (${cleanIll})` : "Proceso v\xEDrico / indisposici\xF3n m\xE9dica en acta" };
  }
  const translatedCandidate = translateMedicalDetailEs([cleanDescRaw, espnConfirmsMedical ? espnInjury?.detail || "" : "", cleanReasonRaw].filter(Boolean).join(" "));
  const hasMedicalKeyword = Boolean(translatedCandidate) || fullMedicalCheckLow.includes("injury") || fullMedicalCheckLow.includes("dnd") || fullMedicalCheckLow.includes("sprain") || fullMedicalCheckLow.includes("strain") || fullMedicalCheckLow.includes("soreness") || fullMedicalCheckLow.includes("surgery") || fullMedicalCheckLow.includes("fracture") || fullMedicalCheckLow.includes("contusion") || fullMedicalCheckLow.includes("tightness") || fullMedicalCheckLow.includes("reconditioning") || fullMedicalCheckLow.includes("concussion") || fullMedicalCheckLow.includes("recovery") || fullMedicalCheckLow.includes("torn") || fullMedicalCheckLow.includes("tear") || fullMedicalCheckLow.includes("tendinitis") || fullMedicalCheckLow.includes("tendinopathy") || fullMedicalCheckLow.includes("bursitis") || fullMedicalCheckLow.includes("inflammation") || fullMedicalCheckLow.includes("dislocation") || fullMedicalCheckLow.includes("spasms");
  if (espnConfirmsMedical || hasMedicalKeyword) {
    return { statusType: "injury", statusLabel: "Lesionado", statusTone: "rose", priorityRank: 3, note: translatedCandidate ? `Parte m\xE9dico: ${translatedCandidate}` : "Baja por lesi\xF3n confirmada en acta oficial NBA" };
  }
  return { statusType: "coach_decision", statusLabel: "Decisi\xF3n t\xE9cnica", statusTone: "slate", priorityRank: isActiveOnBench ? 7 : 6, note: isActiveOnBench ? "Convocado en banquillo sin minutos por rotaci\xF3n t\xE9cnica" : "Descarte t\xE9cnico de convocatoria (sin parte m\xE9dico activo)" };
}
const KNOWN_NBA_COACH_NAMES = ["Tom Thibodeau", "Coach Thibs", "Thibodeau", "Thibs", "Mike Brown", "Joe Mazzulla", "Mazzulla", "Kenny Atkinson", "JB Bickerstaff", "J.B. Bickerstaff", "Bickerstaff", "Erik Spoelstra", "Spoelstra", "Rick Carlisle", "Carlisle", "Nick Nurse", "Doc Rivers", "Billy Donovan", "Jamahl Mosley", "Quin Snyder", "Charles Lee", "Jordi Fern\xE1ndez", "Jordi Fernandez", "Darko Rajakovic", "Darko Rajakovi\u0107", "Rajakovic", "Rajakovi\u0107", "Brian Keefe", "Mark Daigneault", "Daigneault", "Chris Finch", "JJ Redick", "J.J. Redick", "Redick", "Steve Kerr", "Tyronn Lue", "Ty Lue", "Ime Udoka", "Udoka", "Jason Kidd", "Michael Malone", "Mike Malone", "David Adelman", "Taylor Jenkins", "Tuomas Iisalo", "Iisalo", "Mike Budenholzer", "Budenholzer", "Frank Vogel", "Darvin Ham", "Monty Williams", "Adrian Griffin", "Jacque Vaughn", "Gregg Popovich", "Popovich", "Mitch Johnson", "Willie Green", "Will Hardy", "Chauncey Billups", "Doug Christie", "Jordan Ott", "James Borrego", "Terry Stotts", "Tiago Splitter", "Sam Cassell", "Micah Nori", "Chris Quinn", "Jeff Van Gundy", "Stan Van Gundy", "Brad Stevens", "Pat Riley", "Leon Rose", "Rob Pelinka", "Sam Presti", "Daryl Morey", "Masai Ujiri", "Danny Ainge"].sort((a, b) => b.length - a.length);
const NBA_TEAM_SAFE_TOKENS = ["atlanta", "hawks", "atl", "boston", "celtics", "bos", "brooklyn", "nets", "bkn", "charlotte", "hornets", "cha", "chicago", "bulls", "chi", "cleveland", "cavaliers", "cavs", "cle", "dallas", "mavericks", "mavs", "dal", "denver", "nuggets", "den", "detroit", "pistons", "det", "golden state", "warriors", "gsw", "houston", "rockets", "hou", "indiana", "pacers", "ind", "los angeles", "clippers", "lakers", "lac", "lal", "memphis", "grizzlies", "mem", "miami", "heat", "mia", "milwaukee", "bucks", "mil", "minnesota", "timberwolves", "wolves", "min", "new orleans", "pelicans", "nop", "new york", "knicks", "nyk", "oklahoma city", "thunder", "okc", "orlando", "magic", "orl", "philadelphia", "sixers", "76ers", "phi", "phoenix", "suns", "phx", "portland", "trail blazers", "blazers", "por", "sacramento", "kings", "sac", "san antonio", "spurs", "sas", "toronto", "raptors", "tor", "utah", "jazz", "uta", "washington", "wizards", "was", "nba"];
function buildVerifiedPlayerTokenSet(playerNames) {
  const set = /* @__PURE__ */ new Set();
  const suffixes = /* @__PURE__ */ new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);
  for (const raw of playerNames) {
    const clean = normalizePlain(raw);
    if (!clean) continue;
    set.add(clean);
    const parts = clean.split(/\s+/).filter((w) => w.length >= 3 && !suffixes.has(w));
    for (const part of parts) {
      set.add(part);
    }
  }
  return set;
}
function preserveCasePhrase(referenceMatch, lowerPhrase) {
  const trimmed = referenceMatch.trimStart();
  if (/^[A-ZÁÉÍÓÚÑ]/.test(trimmed)) {
    return lowerPhrase.charAt(0).toUpperCase() + lowerPhrase.slice(1);
  }
  return lowerPhrase;
}
function sanitizeUnverifiedCoachClaims(text, verifiedPlayerNames = []) {
  if (!text) return text;
  const playerTokens = buildVerifiedPlayerTokenSet(verifiedPlayerNames);
  const teamTokens = new Set(NBA_TEAM_SAFE_TOKENS.map((t) => normalizePlain(t)));
  const isVerifiedPlayerOrTeam = __name((candidate) => {
    const norm = normalizePlain(candidate.replace(/\*/g, "")).replace(/^(?:los|las|el|la|de|del)\s+/, "");
    if (!norm) return true;
    if (playerTokens.has(norm) || teamTokens.has(norm)) return true;
    for (const t of teamTokens) {
      if (t.length >= 4 && norm.includes(t)) return true;
    }
    return false;
  }, "isVerifiedPlayerOrTeam");
  let out = text;
  out = out.replace(/\b([Ee]l|[Ss]u)\s+(?:[Ee]ntrenador(?:\s+jefe)?|[Tt]écnico|[Pp]reparador)\s+de\s+((?:los\s+|las\s+)?[\p{L}\d\s]{2,26}?),\s*([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})\s*,?/gu, (match, determiner, teamPhrase, person) => {
    if (isVerifiedPlayerOrTeam(person)) return match;
    return `${preserveCasePhrase(determiner, "el cuerpo t\xE9cnico")} de ${teamPhrase.trim()}`;
  });
  out = out.replace(/\b([Ee]l|[Ss]u)\s+(?:[Ee]ntrenador(?:\s+jefe)?|[Tt]écnico|[Pp]reparador)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, determiner, person) => {
    if (isVerifiedPlayerOrTeam(person)) return match;
    return preserveCasePhrase(determiner, "el cuerpo t\xE9cnico");
  });
  out = out.replace(/\b([Ll]a\s+pizarra\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, prefix, entity) => {
    if (isVerifiedPlayerOrTeam(entity)) return match;
    return preserveCasePhrase(prefix, "la pizarra t\xE9cnica");
  }).replace(/\b([Ee]l\s+banquillo\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, prefix, entity) => {
    if (isVerifiedPlayerOrTeam(entity)) return match;
    return preserveCasePhrase(prefix, "el cuerpo t\xE9cnico");
  }).replace(/\b([Ll]os\s+(?:hombres|pupilos|chicos)\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, prefix, entity) => {
    if (isVerifiedPlayerOrTeam(entity)) return match;
    return preserveCasePhrase(prefix, "el conjunto");
  });
  const leftBound = "(?<![\\p{L}\\p{N}])";
  const rightBound = "(?![\\p{L}\\p{N}])";
  for (const coach of KNOWN_NBA_COACH_NAMES) {
    const normCoach = normalizePlain(coach);
    if (!normCoach || playerTokens.has(normCoach)) continue;
    const escaped = coach.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?:el\\s+|su\\s+)?(?:entrenador|t\xE9cnico|preparador)(?:\\s+jefe)?\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el cuerpo t\xE9cnico")).replace(new RegExp(`la\\s+pizarra\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "la pizarra t\xE9cnica")).replace(new RegExp(`el\\s+banquillo\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el cuerpo t\xE9cnico")).replace(new RegExp(`el\\s+sistema\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el planteamiento t\xE1ctico")).replace(new RegExp(`bajo\\s+(?:las\\s+\xF3rdenes|la\\s+batuta|el\\s+mando|la\\s+direcci\xF3n)\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "bajo la direcci\xF3n t\xE9cnica")).replace(new RegExp(`dirigidos\\s+por\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "desde la direcci\xF3n t\xE9cnica")).replace(new RegExp(`los\\s+(?:hombres|pupilos|chicos)\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el conjunto")).replace(new RegExp(`los\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el bloque")).replace(new RegExp(`${leftBound}${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "la direcci\xF3n t\xE9cnica"));
  }
  return sanitizeEditorialSpanishGrammar(out);
}
function sanitizeEditorialSpanishGrammar(text) {
  if (!text) return text;
  return text.replace(/\b(de|a|ante|contra|para|por|con|sobre|entre)\s+los\s+(\*\*)?Los\s+Angeles\b/giu, (_m, prep, stars) => `${prep} ${stars || ""}Los Angeles`).replace(/\b[Ll]os\s+(\*\*)?Los\s+Angeles\b/gu, (_m, stars) => `${stars || ""}Los Angeles`).replace(/\btasa\s+de\s+tiros\s+libres\b/giu, "frecuencia de visitas al tiro libre");
}
let flashLiteQuotaCooldownUntil = 0;
function getGeminiClient(timeoutMs = 2e4) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs, headers: { "User-Agent": "aistudio-build" } } });
}
function normalizeEspnTeamAbbr(raw) {
  const up = (raw || "").trim().toUpperCase();
  const map = { GS: "GSW", NY: "NYK", NO: "NOP", SA: "SAS", UTAH: "UTA", WSH: "WAS" };
  return map[up] || up;
}
function extractGroundingSources(response, seedSources = []) {
  const seen = /* @__PURE__ */ new Set();
  const links = [];
  const pushLink = __name((uri, title) => {
    const cleanUri = (uri || "").trim();
    if (!cleanUri || seen.has(cleanUri)) return;
    seen.add(cleanUri);
    links.push({ uri: cleanUri, title: (title || "").trim() || "Fuente actualidad NBA" });
  }, "pushLink");
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const ch of chunks) {
      pushLink(String(ch?.web?.uri || ""), String(ch?.web?.title || ""));
      if (links.length >= 6) return links;
    }
  }
  for (const s of seedSources) {
    pushLink(s.uri, s.title);
    if (links.length >= 6) break;
  }
  return links;
}
function isQuotaExhaustedError(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
}
async function streamGeminiContentWithBudget(params) {
  const controller = new AbortController();
  let firstChunkTimer;
  let totalTimer;
  const clearTimers = __name(() => {
    if (firstChunkTimer) {
      clearTimeout(firstChunkTimer);
      firstChunkTimer = void 0;
    }
    if (totalTimer) {
      clearTimeout(totalTimer);
      totalTimer = void 0;
    }
  }, "clearTimers");
  try {
    const timeoutPromise = new Promise((_, reject) => {
      firstChunkTimer = setTimeout(() => {
        controller.abort();
        reject(new Error(`FIRST_CHUNK_TIMEOUT:${params.model}`));
      }, params.firstChunkTimeoutMs);
      totalTimer = setTimeout(() => {
        controller.abort();
        reject(new Error(`TOTAL_STREAM_TIMEOUT:${params.model}`));
      }, params.totalTimeoutMs);
    });
    const streamWork = (async () => {
      const responseStream = await params.ai.models.generateContentStream({ model: params.model, contents: params.contents, config: { systemInstruction: params.systemInstruction, temperature: 0.2, abortSignal: controller.signal, ...params.thinkingLevel !== void 0 ? { thinkingConfig: { thinkingLevel: params.thinkingLevel } } : {} } });
      let fullText = "";
      let lastChunk = null;
      let receivedFirstText = false;
      for await (const chunk of responseStream) {
        const piece = chunk.text || "";
        if (piece) {
          if (!receivedFirstText) {
            receivedFirstText = true;
            if (firstChunkTimer) {
              clearTimeout(firstChunkTimer);
              firstChunkTimer = void 0;
            }
          }
          fullText += piece;
        }
        lastChunk = chunk;
      }
      return { text: fullText.trim(), lastChunk };
    })();
    return await Promise.race([streamWork, timeoutPromise]);
  } finally {
    clearTimers();
    controller.abort();
  }
}
async function generateWithGeminiCascade(params) {
  const ai = getGeminiClient(16e3);
  if (!ai) {
    throw new Error("GEMINI_API_KEY unavailable");
  }
  if (Date.now() >= flashLiteQuotaCooldownUntil) {
    try {
      const { text: liteText, lastChunk } = await streamGeminiContentWithBudget({ ai, model: "gemini-3.1-flash-lite", systemInstruction: params.systemInstruction, contents: params.contents, thinkingLevel: ThinkingLevel.MINIMAL, firstChunkTimeoutMs: 12500, totalTimeoutMs: 15e3 });
      if (liteText.length > 80) {
        return { text: liteText, sources: extractGroundingSources(lastChunk, params.seedSources) };
      }
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        flashLiteQuotaCooldownUntil = Date.now() + 45 * 1e3;
      }
      throw err;
    }
  }
  throw new Error("Gemini flash-lite temporarily cooling down");
}
function cleanSectionText(raw, preserveHorizontalRules = false) {
  const withoutHeadings = (raw || "").replace(/^#+\s+.*$/gm, "").replace(/^\*\*PASO B.*?\*\*$/gim, "");
  const withoutRules = preserveHorizontalRules ? withoutHeadings.replace(/^(?:\s*---+\s*\n)+|(?:\n\s*---+\s*)+$/g, "") : withoutHeadings.replace(/^\s*---+\s*$/gm, "");
  return withoutRules.replace(/\n{3,}/g, "\n\n").trim();
}
function parseDelimitedSections(text, keys) {
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const startRegex = new RegExp(`===${key}===`, "i");
    const startMatch = startRegex.exec(text);
    if (!startMatch) continue;
    const contentStart = startMatch.index + startMatch[0].length;
    let contentEnd = text.length;
    for (let j = i + 1; j < keys.length; j++) {
      const nextRegex = new RegExp(`===${keys[j]}===`, "i");
      const nextMatch = nextRegex.exec(text.slice(contentStart));
      if (nextMatch) {
        contentEnd = contentStart + nextMatch.index;
        break;
      }
    }
    out[key] = cleanSectionText(text.slice(contentStart, contentEnd), key === "CAPITULOS_DINAMICOS");
  }
  return out;
}
function stripInlineWrapper(s) {
  return (s || "").replace(/^[-•*\d.)\s]+/, "").replace(/^\*\*|\*\*$/g, "").replace(/\*\*/g, "").trim();
}
function parseDynamicChapters(raw, fallback) {
  if (!raw || raw.trim().length < 50) return fallback;
  const normalizedSeparators = raw.replace(/^\s*---+\s*$/gm, "\n---\n").replace(/\n{2,}(?=[^\n:]{4,95}\s*::\s*\S)/g, "\n---\n").trim();
  const rawChunks = normalizedSeparators.split(/\n\s*(?:---+\s*\n?\s*)+/).map((c) => c.trim()).filter((c) => c.length > 40);
  const chapters = [];
  for (const chunk of rawChunks.slice(0, 2)) {
    let title = "";
    let body = "";
    const doubleColonIdx = chunk.indexOf("::");
    if (doubleColonIdx > 2 && doubleColonIdx < 130) {
      title = stripInlineWrapper(chunk.slice(0, doubleColonIdx));
      body = cleanSectionText(chunk.slice(doubleColonIdx + 2));
    } else {
      const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2 && lines[0].length <= 115) {
        title = stripInlineWrapper(lines[0]);
        body = cleanSectionText(lines.slice(1).join("\n\n"));
      }
    }
    if (title && body.length >= 45) {
      chapters.push({ kicker: chapters.length === 0 ? "Foco Principal" : "Segundo Foco", title, body });
    }
  }
  return chapters.length > 0 ? chapters : fallback;
}
function parseClavesList(raw, fallback) {
  if (!raw || raw.trim().length < 25) return fallback;
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 18);
  const items = [];
  for (const line of lines.slice(0, 4)) {
    let title = "";
    let detail = "";
    const sepIdx = line.indexOf("::");
    if (sepIdx > 2 && sepIdx < 95) {
      title = stripInlineWrapper(line.slice(0, sepIdx));
      let rawDetail = line.slice(sepIdx + 2).trim();
      if (/^\*\*[^*]+\*\*$/.test(rawDetail)) {
        rawDetail = rawDetail.slice(2, -2).trim();
      }
      detail = rawDetail;
    } else {
      const boldMatch = /^\*\*([^*]{3,80})\*\*[:\s—-]*(.+)$/.exec(line.replace(/^[-•\d.)\s]+/, ""));
      if (boldMatch) {
        title = stripInlineWrapper(boldMatch[1]);
        detail = boldMatch[2].trim();
      } else {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 3 && colonIdx < 75) {
          title = stripInlineWrapper(line.slice(0, colonIdx));
          detail = line.slice(colonIdx + 1).trim();
        }
      }
    }
    if (title && detail.length >= 15) {
      items.push({ title: sanitizeEditorialSpanishGrammar(title), detail: sanitizeEditorialSpanishGrammar(detail) });
    }
  }
  return items.length >= 2 ? items : fallback;
}
function parseSpotlight(raw, fallback) {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed || /^ningun[oa]\b/i.test(trimmed) || /^no aplica\b/i.test(trimmed) || trimmed.length < 40) {
    return null;
  }
  const pipeIdx = trimmed.indexOf("||");
  const colonIdx = trimmed.indexOf("::");
  const sepIdx = pipeIdx > 2 && pipeIdx < 120 ? pipeIdx : colonIdx > 2 && colonIdx < 120 ? colonIdx : -1;
  if (sepIdx !== -1) {
    const title = stripInlineWrapper(trimmed.slice(0, sepIdx));
    const body = cleanSectionText(trimmed.slice(sepIdx + 2));
    if (title && body.length >= 40) {
      return { title, body };
    }
  }
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && lines[0].length <= 105) {
    const title = stripInlineWrapper(lines[0]);
    const body = cleanSectionText(lines.slice(1).join("\n\n"));
    if (title && body.length >= 40) {
      return { title, body };
    }
  }
  return fallback;
}
function createScoutingEngine(deps) {
  async function fetchLivePressContext(dateIso, forceRefresh = false) {
    const yyyymmdd = dateIso.replace(/-/g, "");
    const byMatchup = /* @__PURE__ */ new Map();
    const dayNotes = [];
    const daySources = [];
    const [sbSettled] = await Promise.allSettled([deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`, 15 * 60 * 1e3, {}, 7e3, forceRefresh)]);
    if (sbSettled.status === "fulfilled" && Array.isArray(sbSettled.value?.events)) {
      for (const ev of sbSettled.value.events) {
        const comp = ev?.competitions?.[0];
        const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const homeComp = competitors.find((c) => c?.homeAway === "home");
        const awayComp = competitors.find((c) => c?.homeAway === "away");
        const homeAbbr = normalizeEspnTeamAbbr(homeComp?.team?.abbreviation || "");
        const awayAbbr = normalizeEspnTeamAbbr(awayComp?.team?.abbreviation || "");
        if (!homeAbbr || !awayAbbr) continue;
        const key = `${awayAbbr}@${homeAbbr}`;
        const notes = [];
        const sources = [];
        const headlines = Array.isArray(comp?.headlines) ? comp.headlines : [];
        for (const hl of headlines) {
          const shortTxt = String(hl?.shortLinkText || "").trim();
          const descTxt = String(hl?.description || "").trim();
          const combined = [shortTxt, descTxt].filter(Boolean).join(" \u2014 ");
          if (combined) {
            notes.push(combined);
            dayNotes.push(`[${awayAbbr} @ ${homeAbbr}] ${combined}`);
          }
        }
        const evLinks = Array.isArray(ev?.links) ? ev.links : [];
        const recapLink = evLinks.find((l) => Array.isArray(l?.rel) && (l.rel.includes("recap") || l.rel.includes("summary"))) || evLinks[0];
        if (recapLink?.href) {
          const src = { uri: String(recapLink.href).replace(/^http:\/\//i, "https://"), title: `${awayAbbr} vs ${homeAbbr} \u2014 Cr\xF3nica y Resumen Oficial ESPN/AP` };
          sources.push(src);
          if (daySources.length < 6) daySources.push(src);
        }
        byMatchup.set(key, { notes, sources });
      }
    }
    return { byMatchup, dayNotes, daySources };
  }
  function utcToEasternDateIso(utcStr) {
    if (!utcStr) return "";
    const dt = new Date(utcStr);
    if (Number.isNaN(dt.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(dt);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return y && m && d ? `${y}-${m}-${d}` : "";
  }
  function normalizeScheduleDateToEasternIso(estRaw, gdDateRaw, utcRaw) {
    const estTrim = String(estRaw || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(estTrim)) {
      return estTrim.slice(0, 10);
    }
    for (const candidate of [estTrim, String(gdDateRaw || "").trim()]) {
      const slashMatch = candidate.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (slashMatch) {
        return `${slashMatch[3]}-${slashMatch[1]}-${slashMatch[2]}`;
      }
    }
    const utcTrim = String(utcRaw || "").trim();
    if (utcTrim.includes("T")) {
      const converted = utcToEasternDateIso(utcTrim);
      if (converted) return converted;
    }
    return utcTrim.slice(0, 10);
  }
  let cachedScheduleList = null;
  async function fetchLeagueScheduleGames(forceRefresh = false) {
    if (!forceRefresh && cachedScheduleList && cachedScheduleList.expiresAt > Date.now()) {
      return cachedScheduleList.games;
    }
    const gameMap = /* @__PURE__ */ new Map();
    for (const sg of STATIC_SCHEDULE_2027) {
      const fallbackArena = NBA_TEAM_ARENAS[sg.homeAbbr];
      gameMap.set(`${sg.dateIso}:${sg.awayAbbr}:${sg.homeAbbr}`, { gameId: sg.gameId, dateIso: sg.dateIso, dateTimeUtc: sg.dateTimeUtc, awayAbbr: sg.awayAbbr, homeAbbr: sg.homeAbbr, arenaName: fallbackArena?.arenaName || `Pabell\xF3n ${sg.homeAbbr}`, arenaCity: fallbackArena?.arenaCity || "" });
    }
    try {
      const raw = await deps.cachedFetchJson("https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json", 6 * 60 * 60 * 1e3, NBA_LIVE_HEADERS, 3500, forceRefresh);
      const gameDates = Array.isArray(raw?.leagueSchedule?.gameDates) ? raw.leagueSchedule.gameDates : [];
      for (const gd of gameDates) {
        const gamesArr = Array.isArray(gd?.games) ? gd.games : [];
        for (const g of gamesArr) {
          const homeAbbr = String(g?.homeTeam?.teamTricode || "").trim().toUpperCase();
          const awayAbbr = String(g?.awayTeam?.teamTricode || "").trim().toUpperCase();
          if (!homeAbbr || !awayAbbr) continue;
          const utcStr = String(g?.gameDateTimeUTC || g?.gameDateUTC || "").trim();
          const dateIso = normalizeScheduleDateToEasternIso(g?.gameDateEst, gd?.gameDate, utcStr);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
          const fallbackArena = NBA_TEAM_ARENAS[homeAbbr];
          gameMap.set(`${dateIso}:${awayAbbr}:${homeAbbr}`, { gameId: String(g?.gameId || ""), dateIso, dateTimeUtc: utcStr, awayAbbr, homeAbbr, arenaName: String(g?.arenaName || "").trim() || fallbackArena?.arenaName || `Pabell\xF3n ${homeAbbr}`, arenaCity: String(g?.arenaCity || "").trim() || fallbackArena?.arenaCity || "" });
        }
      }
    } catch {
    }
    if (gameMap.size === 0) {
      try {
        const full = await deps.getFullLeagueMemory();
        for (const t of full.teams) {
          for (const g of t.games) {
            const dateIso = g.date.slice(0, 10);
            const isHome = g.isHome;
            const homeAbbr = isHome ? t.abbreviation : g.opponentAbbr;
            const awayAbbr = isHome ? g.opponentAbbr : t.abbreviation;
            const key = `${dateIso}:${awayAbbr}:${homeAbbr}`;
            if (!gameMap.has(key)) {
              const fallbackArena = NBA_TEAM_ARENAS[homeAbbr];
              gameMap.set(key, { gameId: g.eventId || `mem_${dateIso}_${awayAbbr}_${homeAbbr}`, dateIso, dateTimeUtc: `${dateIso}T00:00:00Z`, awayAbbr, homeAbbr, arenaName: fallbackArena?.arenaName || `Pabell\xF3n ${homeAbbr}`, arenaCity: fallbackArena?.arenaCity || "" });
            }
          }
        }
      } catch {
      }
    }
    const combined = [...gameMap.values()];
    combined.sort((a, b) => (a.dateIso + "T" + (a.dateTimeUtc || "")).localeCompare(b.dateIso + "T" + (b.dateTimeUtc || "")));
    cachedScheduleList = { expiresAt: Date.now() + 6 * 60 * 60 * 1e3, games: combined };
    return combined;
  }
  async function fetchEspnInjuriesByName(forceRefresh = false) {
    const map = /* @__PURE__ */ new Map();
    try {
      const data = await deps.cachedFetchJson("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries", 20 * 60 * 1e3, {}, 5500, forceRefresh);
      const teamsArr = Array.isArray(data?.injuries) ? data.injuries : [];
      for (const tBlock of teamsArr) {
        const items = Array.isArray(tBlock?.injuries) ? tBlock.injuries : [];
        for (const inj of items) {
          const dispName = String(inj?.athlete?.displayName || "").trim();
          if (!dispName) continue;
          const status = String(inj?.status || "").trim();
          const cleanField = __name((val) => {
            const s = String(val || "").trim();
            return /^not\s+specified$/i.test(s) ? "" : s;
          }, "cleanField");
          const typeDesc = cleanField(inj?.details?.type);
          const sideDesc = cleanField(inj?.details?.side);
          const detailDesc = cleanField(inj?.details?.detail);
          let combinedDetail = [sideDesc, typeDesc, detailDesc].filter(Boolean).join(" ").trim();
          if (!combinedDetail && inj?.shortComment) {
            const parenMatch = String(inj.shortComment).match(/\(([^)]{2,40})\)/);
            if (parenMatch) {
              combinedDetail = parenMatch[1].trim();
            }
          }
          map.set(normalizePlain(dispName), { status, detail: combinedDetail });
        }
      }
    } catch {
    }
    return map;
  }
  async function fetchPlayByPlayFoulOuts(eventId, fouledOutPlayerIds, seasonLabel, forceRefresh = false) {
    const out = /* @__PURE__ */ new Map();
    if (fouledOutPlayerIds.length === 0 || !/^00\d{8}$/.test(eventId)) {
      return out;
    }
    const ttl = seasonLabel === "2026-27" ? 15 * 60 * 1e3 : 180 * 60 * 1e3;
    try {
      const pbp = await deps.cachedFetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${eventId}.json`, ttl, NBA_LIVE_HEADERS, 7500, forceRefresh);
      const actions = Array.isArray(pbp?.game?.actions) ? pbp.game.actions : [];
      if (actions.length === 0) return out;
      for (const pid of fouledOutPlayerIds) {
        const numPid = Number(pid);
        if (!numPid) continue;
        const playerFouls = actions.filter((a) => {
          if (Number(a?.personId) !== numPid) return false;
          const actType = String(a?.actionType || "").toLowerCase();
          if (actType !== "foul") return false;
          const subType = String(a?.subType || "").toLowerCase();
          if (subType.includes("technical") || subType.includes("defense 3 second")) {
            return false;
          }
          return true;
        });
        if (playerFouls.length === 0) continue;
        const exactSixth = playerFouls.find((a) => Number(a?.foulPersonalTotal) === 6 || /\b(?:P6|6\s*PF)\b/i.test(String(a?.description || ""))) || playerFouls[playerFouls.length - 1];
        const pNum = Number(exactSixth?.period) || 4;
        const periodLabel = pNum <= 4 ? `${pNum}Q` : pNum === 5 ? "PR" : `PR${pNum - 4}`;
        const clockRemaining = parsePbpClockRemaining(exactSixth?.clock);
        out.set(pid, { periodLabel, clockRemaining: clockRemaining || "00:00" });
      }
    } catch {
    }
    return out;
  }
  function formatSpanishScheduleDateTime(dateIso, dateTimeUtc) {
    const monthsEs = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const weekdaysEs = ["Dom", "Lun", "Mar", "Mi\xE9", "Jue", "Vie", "S\xE1b"];
    if (dateTimeUtc && dateTimeUtc.includes("T")) {
      const dt = new Date(dateTimeUtc);
      if (!Number.isNaN(dt.getTime())) {
        const utcHours = dt.getUTCHours();
        const utcMinutes = dt.getUTCMinutes();
        const hasRealTipoff = !(utcHours === 0 && utcMinutes === 0);
        const esDateFmt = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: hasRealTipoff ? "Europe/Madrid" : "UTC" }).format(dt);
        const cleanDate = esDateFmt.replace(/\./g, "");
        if (hasRealTipoff) {
          const esTime = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Madrid" }).format(dt);
          const etTime = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).format(dt);
          return { dateFormatted: cleanDate.charAt(0).toUpperCase() + cleanDate.slice(1), timeFormatted: `${esTime}h ESP (${etTime} ET)` };
        }
      }
    }
    const [y, m, d] = (dateIso || "").slice(0, 10).split("-").map(Number);
    if (y && m && d) {
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const wd = weekdaysEs[dt.getUTCDay()] || "";
      const mo = monthsEs[dt.getUTCMonth()] || "";
      return { dateFormatted: `${wd} ${d} ${mo} ${y}`, timeFormatted: "Horario NBA oficial" };
    }
    return { dateFormatted: dateIso || "Por definir", timeFormatted: "Por confirmar" };
  }
  function computeNextGameFatigue(currentDateIso, nextDateIso) {
    if (!nextDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(currentDateIso) || !/^\d{4}-\d{2}-\d{2}$/.test(nextDateIso)) {
      return { restDays: null, isBackToBackNext: false, fatigueShort: "\u2014", fatigueDetail: "Sin fecha programada", fatigueTone: "slate" };
    }
    const [cy, cm, cd] = currentDateIso.split("-").map(Number);
    const [ny, nm, nd] = nextDateIso.split("-").map(Number);
    const dayDiff = Math.round((Date.UTC(ny, nm - 1, nd) - Date.UTC(cy, cm - 1, cd)) / 864e5);
    if (dayDiff <= 0) {
      return { restDays: null, isBackToBackNext: false, fatigueShort: "\u2014", fatigueDetail: "Por confirmar", fatigueTone: "slate" };
    }
    const restDays = dayDiff - 1;
    if (restDays === 0) {
      return { restDays: 0, isBackToBackNext: true, fatigueShort: "B2B \xB7 0 d\xEDas", fatigueDetail: "Back-to-Back (0 d\xEDas de descanso antes del pr\xF3ximo duelo)", fatigueTone: "rose" };
    }
    if (restDays === 1) {
      return { restDays: 1, isBackToBackNext: false, fatigueShort: "1 d\xEDa", fatigueDetail: "1 d\xEDa de descanso previo (ritmo est\xE1ndar)", fatigueTone: "slate" };
    }
    return { restDays, isBackToBackNext: false, fatigueShort: `${restDays} d\xEDas`, fatigueDetail: restDays >= 3 ? `${restDays} d\xEDas de descanso previo (plantilla descansada)` : `${restDays} d\xEDas de descanso previo`, fatigueTone: "emerald" };
  }
  async function resolveTeamNextGameInfo(params) {
    const { currentEventId, teamObj, recordAfter, fullTeams, gameDate, seasonLabel, scheduleGames, forceRefresh } = params;
    const abbr = teamObj.abbreviation;
    const findTeamIdByAbbr = __name((targetAbbr) => fullTeams.find((t) => t.abbreviation === targetAbbr)?.id, "findTeamIdByAbbr");
    const confPeers = fullTeams.filter((t) => t.conference === teamObj.conference).map((t) => {
      const logs = t.games.filter((g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate).sort((a, b) => b.date.localeCompare(a.date));
      const w = logs.filter((g) => g.result === "W").length;
      const l = logs.length - w;
      const gp = w + l;
      const pct = gp > 0 ? w / gp : 0;
      const diffSum = logs.reduce((s, g) => s + g.differential, 0);
      return { abbr: t.abbreviation, w, l, gp, pct, avgDiff: gp > 0 ? diffSum / gp : 0, logs };
    }).sort((a, b) => b.pct - a.pct || b.w - a.w || b.avgDiff - a.avgDiff);
    const peerIdx = confPeers.findIndex((p) => p.abbr === abbr);
    const conferenceRank = peerIdx >= 0 ? peerIdx + 1 : teamObj.playoffSeed || 1;
    const myLogs = peerIdx >= 0 ? confPeers[peerIdx].logs : teamObj.games.filter((g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate).sort((a, b) => b.date.localeCompare(a.date));
    let streakCode = teamObj.streakCode || "\u2014";
    if (myLogs.length > 0) {
      const firstRes = myLogs[0].result;
      let count = 0;
      for (const lg of myLogs) {
        if (lg.result === firstRes) count++;
        else break;
      }
      streakCode = `${firstRes}${count}`;
    }
    const futureTeamLogs = teamObj.games.filter((g) => g.seasonLabel === seasonLabel && g.eventId !== currentEventId && g.date.slice(0, 10) > gameDate).sort((a, b) => a.date.localeCompare(b.date));
    const nextFromSchedule = scheduleGames.find((sg) => sg.gameId !== currentEventId && sg.dateIso > gameDate && (sg.awayAbbr === abbr || sg.homeAbbr === abbr));
    if (futureTeamLogs.length > 0) {
      const nl = futureTeamLogs[0];
      const nlDate = nl.date.slice(0, 10);
      const matchedSched = scheduleGames.find((sg) => sg.gameId === nl.eventId || sg.dateIso === nlDate && (sg.awayAbbr === abbr || sg.homeAbbr === abbr));
      const hostAbbr = nl.isHome ? abbr : nl.opponentAbbr;
      const hostArena = NBA_TEAM_ARENAS[hostAbbr];
      const dtFmt = formatSpanishScheduleDateTime(nlDate, matchedSched?.dateTimeUtc);
      const fatigue = computeNextGameFatigue(gameDate, nlDate);
      return { hasScheduledGame: true, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: nl.opponentAbbr, opponentName: NBA_TEAMS_MAP[nl.opponentAbbr]?.name || nl.opponentName || nl.opponentAbbr, opponentTeamId: findTeamIdByAbbr(nl.opponentAbbr), isHome: nl.isHome, dateIso: nlDate, dateFormatted: dtFmt.dateFormatted, timeFormatted: dtFmt.timeFormatted, arenaName: matchedSched?.arenaName || hostArena?.arenaName || `Pabell\xF3n ${hostAbbr}`, arenaCity: matchedSched?.arenaCity || hostArena?.arenaCity || "", ...fatigue };
    }
    if (nextFromSchedule) {
      const isHome = nextFromSchedule.homeAbbr === abbr;
      const oppAbbr = isHome ? nextFromSchedule.awayAbbr : nextFromSchedule.homeAbbr;
      const dtFmt = formatSpanishScheduleDateTime(nextFromSchedule.dateIso, nextFromSchedule.dateTimeUtc);
      const fatigue = computeNextGameFatigue(gameDate, nextFromSchedule.dateIso);
      return { hasScheduledGame: true, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: oppAbbr, opponentName: NBA_TEAMS_MAP[oppAbbr]?.name || oppAbbr, opponentTeamId: findTeamIdByAbbr(oppAbbr), isHome, dateIso: nextFromSchedule.dateIso, dateFormatted: dtFmt.dateFormatted, timeFormatted: dtFmt.timeFormatted, arenaName: nextFromSchedule.arenaName, arenaCity: nextFromSchedule.arenaCity, ...fatigue };
    }
    const espnId = ESPN_TEAM_IDS[abbr];
    if (espnId && seasonLabel === "2026-27") {
      try {
        const espnSched = await deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnId}/schedule`, 2 * 60 * 60 * 1e3, {}, 5500, forceRefresh);
        const events = Array.isArray(espnSched?.events) ? espnSched.events : [];
        for (const ev of events) {
          const evUtc = String(ev?.date || "").trim();
          const evIso = evUtc.includes("T") ? utcToEasternDateIso(evUtc) || evUtc.slice(0, 10) : evUtc.slice(0, 10);
          if (!evIso || evIso <= gameDate) continue;
          const comp = ev?.competitions?.[0];
          const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const meComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") === abbr);
          const oppComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") !== abbr);
          if (!oppComp) continue;
          const oppAbbr = normalizeEspnTeamAbbr(oppComp?.team?.abbreviation || "NBA");
          const isHome = meComp?.homeAway === "home";
          const hostAbbr = isHome ? abbr : oppAbbr;
          const hostArena = NBA_TEAM_ARENAS[hostAbbr];
          const venueName = String(comp?.venue?.fullName || "").trim() || hostArena?.arenaName || `Pabell\xF3n ${hostAbbr}`;
          const venueCity = String(comp?.venue?.address?.city || "").trim() || hostArena?.arenaCity || "";
          const dtFmt = formatSpanishScheduleDateTime(evIso, evUtc);
          const fatigue = computeNextGameFatigue(gameDate, evIso);
          return { hasScheduledGame: true, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: oppAbbr, opponentName: NBA_TEAMS_MAP[oppAbbr]?.name || String(oppComp?.team?.displayName || oppAbbr), opponentTeamId: findTeamIdByAbbr(oppAbbr), isHome, dateIso: evIso, dateFormatted: dtFmt.dateFormatted, timeFormatted: dtFmt.timeFormatted, arenaName: venueName, arenaCity: venueCity, ...fatigue };
        }
      } catch {
      }
    }
    const emptyFatigue = computeNextGameFatigue(gameDate, void 0);
    return { hasScheduledGame: false, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: "", opponentName: "Calendario regular completado en este tramo", isHome: true, dateFormatted: "Sin pr\xF3ximo encuentro programado", timeFormatted: "\u2014", arenaName: NBA_TEAM_ARENAS[abbr]?.arenaName || "", arenaCity: NBA_TEAM_ARENAS[abbr]?.arenaCity || "", ...emptyFatigue };
  }
  async function computeGameOfficialReportData(eventId, forceRefresh = false, cacheKey = `game_official_report_v6:${eventId}`) {
    const [full, biosMap, scheduleGames] = await Promise.all([deps.getFullLeagueMemory(), deps.getPlayerBiosMap(forceRefresh), fetchLeagueScheduleGames(forceRefresh)]);
    let homeTeamObj;
    let homeLog;
    let awayTeamObj;
    let awayLog;
    for (const t of full.teams) {
      const g = t.games.find((x) => x.eventId === eventId);
      if (g) {
        if (g.isHome) {
          homeTeamObj = t;
          homeLog = g;
        } else {
          awayTeamObj = t;
          awayLog = g;
        }
      }
    }
    if (!homeTeamObj || !homeLog || !awayTeamObj || !awayLog) {
      throw new Error(`Encuentro ${eventId} no encontrado en el registro oficial NBA.`);
    }
    const gameDate = homeLog.date.slice(0, 10);
    const seasonLabel = homeLog.seasonLabel;
    const homeAbbr = homeTeamObj.abbreviation;
    const awayAbbr = awayTeamObj.abbreviation;
    const playerById = /* @__PURE__ */ new Map();
    for (const p of full.allPlayers) {
      playerById.set(p.id, p);
    }
    const espnInjuriesMap = seasonLabel === "2026-27" ? await fetchEspnInjuriesByName(forceRefresh) : /* @__PURE__ */ new Map();
    let cdnGame = null;
    if (/^00\d{8}$/.test(eventId)) {
      const ttl = seasonLabel === "2026-27" ? 10 * 60 * 1e3 : 120 * 60 * 1e3;
      try {
        const bj = await deps.cachedFetchJson(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${eventId}.json`, ttl, NBA_LIVE_HEADERS, 9e3, forceRefresh);
        if (bj && bj.game) {
          cdnGame = bj.game;
        }
      } catch (err) {
        console.warn(`NBA CDN boxscore fallback for ${eventId}:`, err);
      }
    }
    const fallbackArena = NBA_TEAM_ARENAS[homeAbbr] || { arenaName: `Pabell\xF3n de ${homeTeamObj.shortName}`, arenaCity: homeTeamObj.name };
    const arenaName = String(cdnGame?.arena?.arenaName || "").trim() || fallbackArena.arenaName;
    const arenaCity = String(cdnGame?.arena?.arenaCity || "").trim() || fallbackArena.arenaCity;
    const rawAttendance = Number(cdnGame?.attendance) || 0;
    const attendance = rawAttendance > 0 ? rawAttendance : null;
    const attendanceFormatted = attendance !== null ? `${formatThousandsEs(attendance)} espectadores` : "Aforo oficial NBA";
    const rawDuration = Number(cdnGame?.duration) || 0;
    const durationMinutes = rawDuration > 0 ? rawDuration : null;
    const officials = Array.isArray(cdnGame?.officials) ? cdnGame.officials.map((o) => String(o?.name || "").trim()).filter(Boolean) : [];
    const periods = [];
    const cdnAwayPeriods = Array.isArray(cdnGame?.awayTeam?.periods) ? cdnGame.awayTeam.periods : [];
    const cdnHomePeriods = Array.isArray(cdnGame?.homeTeam?.periods) ? cdnGame.homeTeam.periods : [];
    if (cdnAwayPeriods.length > 0 && cdnHomePeriods.length > 0) {
      const maxLen = Math.max(cdnAwayPeriods.length, cdnHomePeriods.length);
      for (let i = 0; i < maxLen; i++) {
        const ap = cdnAwayPeriods[i];
        const hp = cdnHomePeriods[i];
        const pNum = Number(ap?.period || hp?.period || i + 1);
        const isOt = pNum > 4 || String(ap?.periodType || "").toUpperCase() === "OVERTIME";
        const otIdx = pNum - 4;
        periods.push({ period: pNum, label: isOt ? maxLen > 5 ? `PR${otIdx}` : "PR" : `${pNum}Q`, isOvertime: isOt, awayScore: Number(ap?.score) || 0, homeScore: Number(hp?.score) || 0 });
      }
    }
    const isOvertime = periods.some((p) => p.isOvertime);
    const overtimeCount = periods.filter((p) => p.isOvertime).length;
    const winnerSideKey = awayLog.pointsFor > homeLog.pointsFor ? "away" : "home";
    const winnerAbbr = winnerSideKey === "away" ? awayAbbr : homeAbbr;
    let decisivePeriodLabel = Math.abs(awayLog.pointsFor - homeLog.pointsFor) <= 5 ? "Desenlace en el clutch final" : `Dominio sostenido de ${winnerAbbr}`;
    if (periods.length > 0) {
      let bestSwing = -999;
      let bestP = periods[0];
      for (const p of periods) {
        const swing = winnerSideKey === "away" ? p.awayScore - p.homeScore : p.homeScore - p.awayScore;
        if (swing > bestSwing) {
          bestSwing = swing;
          bestP = p;
        }
      }
      if (bestP.isOvertime) {
        decisivePeriodLabel = `${bestP.label} (${bestP.awayScore}-${bestP.homeScore} \xB7 +${bestSwing} ${winnerAbbr})`;
      } else if (bestSwing >= 6) {
        decisivePeriodLabel = `${bestP.label} (${bestP.awayScore}-${bestP.homeScore} \xB7 +${bestSwing} ${winnerAbbr})`;
      } else {
        const p4 = periods.find((p) => p.period === 4) || bestP;
        decisivePeriodLabel = `Cierre en ${p4.label} (${p4.awayScore}-${p4.homeScore})`;
      }
    }
    const computeRecordUpToDate = __name((tm) => {
      const slice = tm.games.filter((g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate);
      const w = slice.filter((g) => g.result === "W").length;
      const l = slice.length - w;
      return `${w}-${l}`;
    }, "computeRecordUpToDate");
    const spanishDetails = [];
    const milestonesList = [];
    const seenSpanishIds = /* @__PURE__ */ new Set();
    const buildSideReport = __name((sideRole, teamObj, teamLog, cdnTeam, oppAbbr) => {
      const abbr = teamObj.abbreviation;
      const isWinner = teamLog.result === "W";
      const starters = [];
      const bench = [];
      const absencesAndDnp = [];
      const playedIdsTonight = /* @__PURE__ */ new Set();
      const listedIdsTonight = /* @__PURE__ */ new Set();
      const cdnPlayers = Array.isArray(cdnTeam?.players) ? cdnTeam.players : [];
      if (cdnPlayers.length > 0) {
        for (const cp of cdnPlayers) {
          const pid = String(cp?.personId || "");
          if (pid) listedIdsTonight.add(pid);
          const bio = pid ? biosMap.get(pid) : void 0;
          const fullName = String(cp?.name || "").trim() || bio?.name || "Jugador NBA";
          const shortName = buildShortPlayerName(fullName, cp?.firstName, cp?.familyName);
          const jersey = sanitizeJersey(cp?.jerseyNum, bio?.jersey);
          const position = String(cp?.position || "").trim() || bio?.position || "JUG";
          const country = bio?.country || "";
          const isSpanish = isSpanishPlayerCheck(fullName, country);
          const playedFlag = String(cp?.played || "") === "1";
          const statusStr = String(cp?.status || "ACTIVE").toUpperCase();
          const minParsed = parseIsoMinutes(cp?.statistics?.minutes);
          if (!playedFlag || statusStr !== "ACTIVE" || minParsed.decimal <= 0) {
            const isActiveOnBench = statusStr === "ACTIVE";
            const category = isActiveOnBench ? "dnp_bench" : "inactive";
            const espnInj = espnInjuriesMap.get(normalizePlain(fullName));
            const classified = classifyAbsenceOrDnp(isActiveOnBench, cp?.notPlayingReason, cp?.notPlayingDescription, espnInj);
            const plMem = pid ? playerById.get(pid) : void 0;
            const sLogs = plMem ? plMem.games.filter((g) => g.seasonLabel === seasonLabel) : [];
            const avgMin = sLogs.length >= 2 ? round1(sLogs.reduce((s, g) => s + g.minutes, 0) / sLogs.length) : void 0;
            const avgPts = sLogs.length >= 2 ? round1(sLogs.reduce((s, g) => s + g.points, 0) / sLogs.length) : void 0;
            const baselineTail = avgMin !== void 0 && avgPts !== void 0 && avgMin >= 12 && classified.statusType !== "coach_decision" && classified.statusType !== "gleague" ? ` \xB7 Media ${avgPts.toFixed(1)} PTS y ${avgMin.toFixed(1)} MIN` : "";
            const enrichedNote = `${classified.note}${baselineTail}`;
            absencesAndDnp.push({ playerId: pid || void 0, name: fullName, jersey, category, statusType: classified.statusType, statusLabel: classified.statusLabel, statusTone: classified.statusTone, priorityRank: classified.priorityRank, ptsAvg: avgPts, minAvg: avgMin, note: enrichedNote, isSpanish });
            if (isSpanish && pid && !seenSpanishIds.has(pid)) {
              seenSpanishIds.add(pid);
              spanishDetails.push({ playerId: pid, name: fullName, jersey, teamAbbr: abbr, played: false, lineSummary: `#${jersey} ${fullName} (${abbr}) \u2014 ${classified.statusLabel}: ${enrichedNote}` });
            }
            continue;
          }
          playedIdsTonight.add(pid);
          const st = cp.statistics || {};
          const pts = Number(st.points) || 0;
          const reb = Number(st.reboundsTotal) || 0;
          const oreb = Number(st.reboundsOffensive) || 0;
          const dreb = Number(st.reboundsDefensive) || 0;
          const ast = Number(st.assists) || 0;
          const stl = Number(st.steals) || 0;
          const blk = Number(st.blocks) || 0;
          const tov = Number(st.turnovers) || 0;
          const pf = Number(st.foulsPersonal) || 0;
          const pm = Number(st.plusMinusPoints) || 0;
          const fgm = Number(st.fieldGoalsMade) || 0;
          const fga = Number(st.fieldGoalsAttempted) || 0;
          const fg3m = Number(st.threePointersMade) || 0;
          const fg3a = Number(st.threePointersAttempted) || 0;
          const ftm = Number(st.freeThrowsMade) || 0;
          const fta = Number(st.freeThrowsAttempted) || 0;
          const fgPct = fga > 0 ? round1(fgm / fga * 100) : 0;
          const fg3Pct = fg3a > 0 ? round1(fg3m / fg3a * 100) : 0;
          const ftPct = fta > 0 ? round1(ftm / fta * 100) : 0;
          const tsDenom = 2 * (fga + 0.44 * fta);
          const tsPct = tsDenom > 0 ? round1(pts / tsDenom * 100) : 0;
          const gmSc = computeHollingerGmSc({ points: pts, fgm, fga, ftm, fta, oreb, dreb, stl, ast, blk, pf, tov });
          const tens = [pts, reb, ast, stl, blk].filter((v) => v >= 10).length;
          const tripleDouble = tens >= 3;
          const doubleDouble = tens === 2;
          const lineObj = { playerId: pid, name: fullName, shortName, jersey, position, country, isSpanish, isStarter: String(cp?.starter || "") === "1", minutes: minParsed.decimal, minutesFormatted: minParsed.formatted, points: pts, rebounds: reb, oreb, dreb, assists: ast, steals: stl, blocks: blk, turnovers: tov, fouls: pf, plusMinus: pm, fgm, fga, fgPct, fg3m, fg3a, fg3Pct, ftm, fta, ftPct, tsPct, gameScore: gmSc, ptsPaint: typeof st.pointsInThePaint === "number" ? st.pointsInThePaint : void 0, ptsFastBreak: typeof st.pointsFastBreak === "number" ? st.pointsFastBreak : void 0, doubleDouble, tripleDouble };
          if (lineObj.isStarter) starters.push(lineObj);
          else bench.push(lineObj);
          if (isSpanish && !seenSpanishIds.has(pid)) {
            seenSpanishIds.add(pid);
            spanishDetails.push({ playerId: pid, name: fullName, jersey, teamAbbr: abbr, played: true, lineSummary: `#${jersey} ${fullName} (${abbr}): ${pts} PTS, ${reb} REB, ${ast} AST en ${minParsed.formatted} min (${fgm}/${fga} TC, ${pm >= 0 ? `+${pm}` : pm})` });
          }
          if (tripleDouble || doubleDouble) {
            milestonesList.push({ playerId: pid, name: fullName, jersey, teamAbbr: abbr, type: tripleDouble ? "TD" : "DD", detail: `#${jersey} ${fullName} (${abbr}): ${pts} PTS \xB7 ${reb} REB \xB7 ${ast} AST${stl >= 10 ? ` \xB7 ${stl} ROB` : ""}${blk >= 10 ? ` \xB7 ${blk} TAP` : ""}` });
          }
        }
      } else {
        const memMatched = [];
        for (const p of full.allPlayers) {
          const g = p.games.find((x) => x.eventId === eventId);
          if (!g) continue;
          const belongsHere = g.opponentAbbr === oppAbbr || g.isHome && sideRole === "home" || !g.isHome && sideRole === "away";
          if (!belongsHere) continue;
          playedIdsTonight.add(p.id);
          listedIdsTonight.add(p.id);
          const bio = biosMap.get(p.id);
          const jersey = sanitizeJersey(p.jersey, bio?.jersey);
          const country = p.country || bio?.country || "";
          const isSpanish = isSpanishPlayerCheck(p.name, country);
          const tens = [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter((v) => v >= 10).length;
          const tripleDouble = tens >= 3;
          const doubleDouble = tens === 2;
          const minParsed = parseIsoMinutes(g.minutes);
          const lineObj = { playerId: p.id, name: p.name, shortName: buildShortPlayerName(p.name), jersey, position: p.position || bio?.position || "JUG", country, isSpanish, isStarter: false, minutes: g.minutes, minutesFormatted: minParsed.formatted, points: g.points, rebounds: g.rebounds, oreb: g.oreb, dreb: g.dreb, assists: g.assists, steals: g.steals, blocks: g.blocks, turnovers: g.turnovers, fouls: g.fouls, plusMinus: g.plusMinus, fgm: g.fgm, fga: g.fga, fgPct: g.fgPct, fg3m: g.fg3m, fg3a: g.fg3a, fg3Pct: g.fg3Pct, ftm: g.ftm, fta: g.fta, ftPct: g.ftPct, tsPct: g.tsPct, gameScore: g.gameScore, ptsPaint: Math.max(0, (g.fgm - g.fg3m) * 2), doubleDouble, tripleDouble };
          memMatched.push(lineObj);
          if (isSpanish && !seenSpanishIds.has(p.id)) {
            seenSpanishIds.add(p.id);
            spanishDetails.push({ playerId: p.id, name: p.name, jersey, teamAbbr: abbr, played: true, lineSummary: `#${jersey} ${p.name} (${abbr}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST en ${minParsed.formatted} min` });
          }
          if (tripleDouble || doubleDouble) {
            milestonesList.push({ playerId: p.id, name: p.name, jersey, teamAbbr: abbr, type: tripleDouble ? "TD" : "DD", detail: `#${jersey} ${p.name} (${abbr}): ${g.points} PTS \xB7 ${g.rebounds} REB \xB7 ${g.assists} AST` });
          }
        }
        memMatched.sort((a, b) => b.minutes - a.minutes);
        memMatched.forEach((pl, idx) => {
          pl.isStarter = idx < 5;
          if (idx < 5) starters.push(pl);
          else bench.push(pl);
        });
      }
      if (seasonLabel === "2026-27") {
        for (const p of full.allPlayers) {
          if (p.teamAbbr !== abbr) continue;
          const bio = biosMap.get(p.id);
          const isSp = isSpanishPlayerCheck(p.name, p.country || bio?.country);
          const seasonGames = p.games.filter((g) => g.seasonLabel === "2026-27");
          if (isSp && !seenSpanishIds.has(p.id)) {
            seenSpanishIds.add(p.id);
            const j = sanitizeJersey(p.jersey, bio?.jersey);
            const spInj = espnInjuriesMap.get(normalizePlain(p.name));
            const spCleanInj = spInj ? translateMedicalDetailEs(spInj.detail) : "";
            spanishDetails.push({ playerId: p.id, name: p.name, jersey: j, teamAbbr: abbr, played: false, lineSummary: spInj ? `#${j} ${p.name} (${abbr}) \u2014 Lesionado: Parte m\xE9dico (${spCleanInj || "baja m\xE9dica"})` : `#${j} ${p.name} (${abbr}) \u2014 Decisi\xF3n t\xE9cnica: Fuera de convocatoria sin parte m\xE9dico activo` });
          }
          if (playedIdsTonight.has(p.id) || listedIdsTonight.has(p.id)) continue;
          if (seasonGames.length < 2) continue;
          const avgMin = seasonGames.reduce((s, g) => s + g.minutes, 0) / seasonGames.length;
          const avgPts = seasonGames.reduce((s, g) => s + g.points, 0) / seasonGames.length;
          if (avgMin >= 14.5) {
            const espnInj = espnInjuriesMap.get(normalizePlain(p.name));
            const cleanInj = espnInj ? translateMedicalDetailEs(espnInj.detail) : "";
            absencesAndDnp.unshift({ playerId: p.id, name: p.name, jersey: sanitizeJersey(p.jersey, bio?.jersey), category: "rotation_absence", statusType: espnInj ? "injury" : "coach_decision", statusLabel: espnInj ? "Lesionado" : "Decisi\xF3n t\xE9cnica", statusTone: espnInj ? "rose" : "slate", priorityRank: espnInj ? 3 : 6, ptsAvg: round1(avgPts), minAvg: round1(avgMin), note: espnInj ? `Parte m\xE9dico: ${cleanInj || "baja m\xE9dica confirmada"} \xB7 Media ${avgPts.toFixed(1)} PTS y ${avgMin.toFixed(1)} MIN` : `Fuera de convocatoria sin parte m\xE9dico activo (media ${avgPts.toFixed(1)} PTS \xB7 ${avgMin.toFixed(1)} MIN)`, isSpanish: isSp });
          }
        }
        for (const b of biosMap.values()) {
          if (b.teamAbbr !== abbr) continue;
          if (isSpanishPlayerCheck(b.name, b.country) && !seenSpanishIds.has(b.id)) {
            seenSpanishIds.add(b.id);
            const j = sanitizeJersey(b.jersey);
            spanishDetails.push({ playerId: b.id, name: b.name, jersey: j, teamAbbr: abbr, played: false, lineSummary: `#${j} ${b.name} (${abbr}): en plantilla oficial, sin participaci\xF3n en el encuentro` });
          }
        }
      }
      starters.sort((a, b) => b.minutes - a.minutes || b.points - a.points);
      bench.sort((a, b) => b.minutes - a.minutes || b.points - a.points);
      const allPlayed = [...starters, ...bench];
      const cdnStats = cdnTeam?.statistics || {};
      const sumFouls = allPlayed.reduce((s, x) => s + x.fouls, 0);
      const sumBenchPts = bench.reduce((s, x) => s + x.points, 0);
      const teamPossEst = teamLog.fga + 0.44 * teamLog.fta + teamLog.tov;
      for (const pl of allPlayed) {
        const plPoss = pl.fga + 0.44 * pl.fta + pl.turnovers;
        if (teamPossEst > 0 && pl.minutes > 0) {
          const usgVal = plPoss / (teamPossEst * (pl.minutes / 48)) * 20;
          pl.usgEst = round1(Math.min(55, Math.max(0, usgVal)));
        } else {
          pl.usgEst = 0;
        }
        const plSummary = playerById.get(pl.playerId);
        const seasonLogs = plSummary ? plSummary.games.filter((g) => g.seasonLabel === seasonLabel && g.minutes > 0) : [];
        const otherSeasonGames = seasonLogs.filter((g) => g.eventId !== eventId);
        if (otherSeasonGames.length >= 1) {
          const totalGamesSample = otherSeasonGames.length + 1;
          const highs = {};
          const evalSeasonHigh = __name((colKey, tonightVal, extractOther, opts) => {
            if (opts?.qualifyTonight === false) return;
            if ((opts?.minPositive ?? true) && tonightVal <= 0) return;
            const eligibleOthers = opts?.qualifyOther ? otherSeasonGames.filter(opts.qualifyOther) : otherSeasonGames;
            if (eligibleOthers.length === 0) return;
            let maxOther = -Infinity;
            let tiedCount = 0;
            const eps = opts?.eps ?? 0.05;
            for (const og of eligibleOthers) {
              const v = extractOther(og);
              if (v > maxOther) maxOther = v;
            }
            if (!Number.isFinite(maxOther)) return;
            for (const og of eligibleOthers) {
              if (Math.abs(extractOther(og) - tonightVal) <= eps) {
                tiedCount++;
              }
            }
            if (tonightVal > maxOther + eps) {
              highs[colKey] = { mode: "sole", prevBest: round1(maxOther), gamesPlayed: totalGamesSample };
            } else if (Math.abs(tonightVal - maxOther) <= eps) {
              if (opts?.skipRoutinePerfectTie && tonightVal >= 99.9 && tiedCount >= 2) {
                return;
              }
              highs[colKey] = { mode: "tied", prevBest: round1(maxOther), gamesPlayed: totalGamesSample };
            }
          }, "evalSeasonHigh");
          evalSeasonHigh("min", pl.minutes, (g) => g.minutes, { eps: 0.09 });
          evalSeasonHigh("pts", pl.points, (g) => g.points);
          evalSeasonHigh("fgm", pl.fgm, (g) => g.fgm);
          evalSeasonHigh("fga", pl.fga, (g) => g.fga);
          evalSeasonHigh("fgPct", pl.fgPct, (g) => g.fgPct, { qualifyTonight: pl.fga >= 4, qualifyOther: __name((g) => g.fga >= 4, "qualifyOther"), eps: 0.15, skipRoutinePerfectTie: true });
          evalSeasonHigh("fg3m", pl.fg3m, (g) => g.fg3m);
          evalSeasonHigh("fg3a", pl.fg3a, (g) => g.fg3a);
          evalSeasonHigh("fg3Pct", pl.fg3Pct, (g) => g.fg3Pct, { qualifyTonight: pl.fg3a >= 3, qualifyOther: __name((g) => g.fg3a >= 3, "qualifyOther"), eps: 0.15, skipRoutinePerfectTie: true });
          evalSeasonHigh("ftm", pl.ftm, (g) => g.ftm);
          evalSeasonHigh("fta", pl.fta, (g) => g.fta);
          evalSeasonHigh("ftPct", pl.ftPct, (g) => g.ftPct, { qualifyTonight: pl.fta >= 4, qualifyOther: __name((g) => g.fta >= 4, "qualifyOther"), eps: 0.15, skipRoutinePerfectTie: true });
          evalSeasonHigh("oreb", pl.oreb, (g) => g.oreb);
          evalSeasonHigh("dreb", pl.dreb, (g) => g.dreb);
          evalSeasonHigh("reb", pl.rebounds, (g) => g.rebounds);
          evalSeasonHigh("ast", pl.assists, (g) => g.assists);
          evalSeasonHigh("stl", pl.steals, (g) => g.steals);
          evalSeasonHigh("blk", pl.blocks, (g) => g.blocks);
          evalSeasonHigh("plusMinus", pl.plusMinus, (g) => g.plusMinus, { minPositive: true });
          evalSeasonHigh("gameScore", pl.gameScore, (g) => g.gameScore, { minPositive: true, eps: 0.09 });
          evalSeasonHigh("tsPct", pl.tsPct, (g) => g.tsPct, { qualifyTonight: pl.fga + pl.fta >= 5, qualifyOther: __name((g) => g.fga + g.fta >= 5, "qualifyOther"), eps: 0.15 });
          evalSeasonHigh("usgEst", pl.usgEst || 0, (g) => g.usgEst || 0, { qualifyTonight: pl.minutes >= 10, qualifyOther: __name((g) => g.minutes >= 10, "qualifyOther"), eps: 0.25 });
          if (Object.keys(highs).length > 0) {
            pl.seasonHighs = highs;
          }
        }
        const hasSeasonBase = seasonLogs.length >= 3;
        const avgMin = hasSeasonBase ? seasonLogs.reduce((s, g) => s + g.minutes, 0) / seasonLogs.length : void 0;
        const avgPts = hasSeasonBase ? seasonLogs.reduce((s, g) => s + g.points, 0) / seasonLogs.length : void 0;
        if (pl.fouls >= 6) {
          absencesAndDnp.unshift({ playerId: pl.playerId, name: pl.name, jersey: pl.jersey, category: "in_game_setback", statusType: "foul_out", statusLabel: "Expulsado (6 faltas)", statusTone: "rose", priorityRank: 1, note: `Expulsado por 6 faltas personales \xB7 ${pl.minutesFormatted} min jugados (${pl.points} PTS \xB7 ${pl.rebounds} REB)`, ptsAvg: avgPts !== void 0 ? round1(avgPts) : void 0, minAvg: avgMin !== void 0 ? round1(avgMin) : void 0, reason: "6 Faltas personales", isSpanish: pl.isSpanish });
        } else if (avgMin !== void 0 && avgPts !== void 0 && avgMin >= 16 && pl.minutes <= Math.min(11.5, avgMin * 0.42)) {
          const espnInj = espnInjuriesMap.get(normalizePlain(pl.name));
          const cleanInj = espnInj ? translateMedicalDetailEs(espnInj.detail) : "";
          absencesAndDnp.unshift({ playerId: pl.playerId, name: pl.name, jersey: pl.jersey, category: "in_game_setback", statusType: "in_game_setback", statusLabel: "Percance en pista", statusTone: "amber", priorityRank: 2, note: `Salida prematura${cleanInj ? ` (${cleanInj})` : ""} \xB7 Solo ${pl.minutesFormatted} min en pista (media habitual: ${avgMin.toFixed(1)} MIN \xB7 ${avgPts.toFixed(1)} PTS)`, ptsAvg: round1(avgPts), minAvg: round1(avgMin), reason: "Retirado prematuramente durante el encuentro", isSpanish: pl.isSpanish });
        }
      }
      absencesAndDnp.sort((a, b) => (a.priorityRank ?? 8) - (b.priorityRank ?? 8) || (b.ptsAvg ?? 0) - (a.ptsAvg ?? 0));
      const totals = { points: teamLog.pointsFor, fgm: teamLog.fgm, fga: teamLog.fga, fgPct: teamLog.fgPct, fg3m: teamLog.fg3m, fg3a: teamLog.fg3a, fg3Pct: teamLog.fg3Pct, ftm: teamLog.ftm, fta: teamLog.fta, ftPct: teamLog.ftPct, reb: teamLog.reb, oreb: teamLog.oreb, dreb: teamLog.dreb, ast: teamLog.ast, stl: teamLog.stl, blk: teamLog.blk, tov: teamLog.tov, fouls: typeof cdnStats.foulsPersonal === "number" ? cdnStats.foulsPersonal : sumFouls, efgPct: teamLog.efgPct, tsPct: teamLog.tsPct, offRtg: teamLog.offRtg, defRtg: teamLog.defRtg, netRtg: teamLog.netRtg, pace: teamLog.pace, ptsPaint: typeof cdnStats.pointsInThePaint === "number" ? cdnStats.pointsInThePaint : Math.round(teamLog.pointsFor * 0.42), ptsFastBreak: typeof cdnStats.pointsFastBreak === "number" ? cdnStats.pointsFastBreak : Math.round(teamLog.pointsFor * 0.14), ptsOffTov: typeof cdnStats.pointsFromTurnovers === "number" ? cdnStats.pointsFromTurnovers : Math.round(teamLog.tov * 1.1), ptsSecondChance: typeof cdnStats.pointsSecondChance === "number" ? cdnStats.pointsSecondChance : Math.round(teamLog.oreb * 1.25), benchPoints: typeof cdnStats.benchPoints === "number" ? cdnStats.benchPoints : sumBenchPts, biggestLead: typeof cdnStats.biggestLead === "number" ? cdnStats.biggestLead : 12, biggestRun: typeof cdnStats.biggestScoringRun === "number" ? cdnStats.biggestScoringRun : 8 };
      const rankedForPodium = [...allPlayed].map((pl) => ({ pl, podiumScore: round1(pl.gameScore + 0.22 * pl.plusMinus + (isWinner ? 1.5 : 0)) })).sort((a, b) => b.podiumScore - a.podiumScore || b.pl.gameScore - a.pl.gameScore || b.pl.points - a.pl.points).slice(0, 3);
      const podium = rankedForPodium.map((item, idx) => ({ stars: 3 - idx, playerId: item.pl.playerId, jersey: item.pl.jersey, name: item.pl.name, position: item.pl.position, points: item.pl.points, rebounds: item.pl.rebounds, assists: item.pl.assists, plusMinus: item.pl.plusMinus, fgm: item.pl.fgm, fga: item.pl.fga, tsPct: item.pl.tsPct, shortLine: `${item.pl.points}P \xB7 ${item.pl.rebounds}R \xB7 ${item.pl.assists}A \xB7 ${item.pl.plusMinus >= 0 ? `+${item.pl.plusMinus}` : item.pl.plusMinus}`, gameScore: item.pl.gameScore, podiumScore: item.podiumScore }));
      const placeholderNextGame = { hasScheduledGame: false, record: computeRecordUpToDate(teamObj), conference: teamObj.conference, conferenceRank: teamObj.playoffSeed || 1, streakCode: teamObj.streakCode || "\u2014", opponentAbbr: "", opponentName: "", isHome: true, dateFormatted: "", timeFormatted: "", arenaName: "", arenaCity: "" };
      return { teamId: teamObj.id, abbr, name: teamObj.name, shortName: teamObj.shortName, recordAfter: placeholderNextGame.record, score: teamLog.pointsFor, isWinner, isBackToBack: teamLog.isBackToBack, starters, bench, totals, absencesAndDnp, podium, nextGame: placeholderNextGame };
    }, "buildSideReport");
    const awaySide = buildSideReport("away", awayTeamObj, awayLog, cdnGame?.awayTeam, homeAbbr);
    const homeSide = buildSideReport("home", homeTeamObj, homeLog, cdnGame?.homeTeam, awayAbbr);
    const fouledOutIds = [...awaySide.absencesAndDnp, ...homeSide.absencesAndDnp].filter((item) => item.statusType === "foul_out" && item.playerId).map((item) => String(item.playerId));
    const [foulOutTimings, awayNextGame, homeNextGame] = await Promise.all([fetchPlayByPlayFoulOuts(eventId, fouledOutIds, seasonLabel, forceRefresh), resolveTeamNextGameInfo({ currentEventId: eventId, teamObj: awayTeamObj, recordAfter: awaySide.recordAfter, fullTeams: full.teams, gameDate, seasonLabel, scheduleGames, forceRefresh }), resolveTeamNextGameInfo({ currentEventId: eventId, teamObj: homeTeamObj, recordAfter: homeSide.recordAfter, fullTeams: full.teams, gameDate, seasonLabel, scheduleGames, forceRefresh })]);
    awaySide.nextGame = awayNextGame;
    homeSide.nextGame = homeNextGame;
    if (foulOutTimings.size > 0) {
      for (const side of [awaySide, homeSide]) {
        const allPl = [...side.starters, ...side.bench];
        for (const item of side.absencesAndDnp) {
          if (item.statusType === "foul_out" && item.playerId) {
            const timing = foulOutTimings.get(item.playerId);
            if (timing) {
              item.foulOutPeriod = timing.periodLabel;
              item.foulOutClock = timing.clockRemaining;
              const plLine = allPl.find((p) => p.playerId === item.playerId);
              const statTail = plLine ? ` \xB7 ${plLine.minutesFormatted} min (${plLine.points} PTS \xB7 ${plLine.rebounds} REB)` : "";
              item.note = `Expulsado por 6 faltas en el ${timing.periodLabel} (restaban ${timing.clockRemaining})${statTail}`;
            }
          }
        }
      }
    }
    let leaguePaceSum = 0;
    let leaguePaceCount = 0;
    for (const tm of full.teams) {
      for (const gm of tm.games) {
        if (gm.seasonLabel === seasonLabel && gm.pace > 75 && gm.pace < 125) {
          leaguePaceSum += gm.pace;
          leaguePaceCount++;
        }
      }
    }
    const leagueAvgPace = leaguePaceCount > 0 ? round1(leaguePaceSum / leaguePaceCount) : 99.6;
    const matchPace = round1((awaySide.totals.pace + homeSide.totals.pace) / 2 || awaySide.totals.pace);
    const paceDiffVsLeague = round1(matchPace - leagueAvgPace);
    const leadChanges = typeof cdnGame?.homeTeam?.statistics?.leadChanges === "number" ? cdnGame.homeTeam.statistics.leadChanges : null;
    const timesTied = typeof cdnGame?.homeTeam?.statistics?.timesTied === "number" ? cdnGame.homeTeam.statistics.timesTied : null;
    const otSuffix = isOvertime ? overtimeCount > 1 ? ` (${overtimeCount} PR)` : " (PR)" : "";
    const pasoBTitle = `${awaySide.name} vs ${homeSide.name} | ${awaySide.score}-${homeSide.score}${otSuffix} | ${arenaName}, ${arenaCity} (${attendanceFormatted})`;
    const teamComparisonRows = [];
    const pushTeamRow = __name((opts) => {
      const dec = opts.decimals ?? 0;
      const suf = opts.suffix ?? "";
      const rawDiff = opts.awayVal - opts.homeVal;
      let betterSide = "tie";
      if (Math.abs(rawDiff) > 0.04) {
        if (opts.lowerIsBetter) {
          betterSide = opts.awayVal < opts.homeVal ? "away" : "home";
        } else {
          betterSide = opts.awayVal > opts.homeVal ? "away" : "home";
        }
      }
      const winnerAbbrRow = betterSide === "away" ? awaySide.abbr : betterSide === "home" ? homeSide.abbr : "";
      const absStr = dec === 0 ? `${Math.round(Math.abs(rawDiff))}${suf}` : `${Math.abs(rawDiff).toFixed(dec)}${suf}`;
      const diffDisplay = betterSide === "tie" ? "Igualado" : `+${absStr} ${winnerAbbrRow}`;
      teamComparisonRows.push({ key: opts.key, label: opts.label, helpKey: opts.helpKey, awayDisplay: opts.awayDisplay, homeDisplay: opts.homeDisplay, awayNumeric: opts.awayVal, homeNumeric: opts.homeVal, diffDisplay, betterSide, section: opts.section, lowerIsBetter: opts.lowerIsBetter });
    }, "pushTeamRow");
    const at = awaySide.totals;
    const ht = homeSide.totals;
    pushTeamRow({ key: "pts", label: "Puntos Totales", helpKey: "ptsBase", awayVal: at.points, homeVal: ht.points, awayDisplay: `${at.points}`, homeDisplay: `${ht.points}`, section: "scoring_shooting" });
    pushTeamRow({ key: "fg", label: "Tiros de Campo (TC \xB7 %)", helpKey: "fgPct", awayVal: at.fgPct, homeVal: ht.fgPct, awayDisplay: `${at.fgm}/${at.fga} (${at.fgPct.toFixed(1)}%)`, homeDisplay: `${ht.fgm}/${ht.fga} (${ht.fgPct.toFixed(1)}%)`, decimals: 1, suffix: "%", section: "scoring_shooting" });
    pushTeamRow({ key: "fg3", label: "Triples (T3 \xB7 %)", helpKey: "fg3Pct", awayVal: at.fg3Pct, homeVal: ht.fg3Pct, awayDisplay: `${at.fg3m}/${at.fg3a} (${at.fg3Pct.toFixed(1)}%)`, homeDisplay: `${ht.fg3m}/${ht.fg3a} (${ht.fg3Pct.toFixed(1)}%)`, decimals: 1, suffix: "%", section: "scoring_shooting" });
    pushTeamRow({ key: "ft", label: "Tiros Libres (TL \xB7 %)", helpKey: "ftPct", awayVal: at.ftm, homeVal: ht.ftm, awayDisplay: `${at.ftm}/${at.fta} (${at.ftPct.toFixed(1)}%)`, homeDisplay: `${ht.ftm}/${ht.fta} (${ht.ftPct.toFixed(1)}%)`, suffix: " TL", section: "scoring_shooting" });
    pushTeamRow({ key: "efg", label: "Tiro Efectivo (eFG%)", helpKey: "efgPct", awayVal: at.efgPct, homeVal: ht.efgPct, awayDisplay: `${at.efgPct.toFixed(1)}%`, homeDisplay: `${ht.efgPct.toFixed(1)}%`, decimals: 1, suffix: "%", section: "efficiency_tactics" });
    pushTeamRow({ key: "ts", label: "Acierto Real (TS%)", helpKey: "tsPct", awayVal: at.tsPct, homeVal: ht.tsPct, awayDisplay: `${at.tsPct.toFixed(1)}%`, homeDisplay: `${ht.tsPct.toFixed(1)}%`, decimals: 1, suffix: "%", section: "efficiency_tactics" });
    pushTeamRow({ key: "offRtg", label: "Eficiencia Ofensiva (OffRtg)", helpKey: "offRtg", awayVal: at.offRtg, homeVal: ht.offRtg, awayDisplay: `${at.offRtg.toFixed(1)}`, homeDisplay: `${ht.offRtg.toFixed(1)}`, decimals: 1, section: "efficiency_tactics" });
    pushTeamRow({ key: "paint", label: "Puntos en la pintura (PITP)", helpKey: "ptsPaint", awayVal: at.ptsPaint ?? 0, homeVal: ht.ptsPaint ?? 0, awayDisplay: `${at.ptsPaint ?? 0}`, homeDisplay: `${ht.ptsPaint ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "secondChance", label: "Puntos 2\xAA oportunidad", helpKey: "pts2ndChance", awayVal: at.ptsSecondChance ?? 0, homeVal: ht.ptsSecondChance ?? 0, awayDisplay: `${at.ptsSecondChance ?? 0}`, homeDisplay: `${ht.ptsSecondChance ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "fastbreak", label: "Puntos contraataque (FB PTS)", helpKey: "ptsFastBreak", awayVal: at.ptsFastBreak ?? 0, homeVal: ht.ptsFastBreak ?? 0, awayDisplay: `${at.ptsFastBreak ?? 0}`, homeDisplay: `${ht.ptsFastBreak ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "ptsOffTov", label: "Puntos tras p\xE9rdidas", helpKey: "ptsOffTov", awayVal: at.ptsOffTov ?? 0, homeVal: ht.ptsOffTov ?? 0, awayDisplay: `${at.ptsOffTov ?? 0}`, homeDisplay: `${ht.ptsOffTov ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "bench", label: "Puntos banquillo", helpKey: "benchPts", awayVal: at.benchPoints, homeVal: ht.benchPoints, awayDisplay: `${at.benchPoints}`, homeDisplay: `${ht.benchPoints}`, section: "efficiency_tactics" });
    const away3PAr = at.fga > 0 ? round1(at.fg3a / at.fga * 100) : 0;
    const home3PAr = ht.fga > 0 ? round1(ht.fg3a / ht.fga * 100) : 0;
    pushTeamRow({ key: "threeRatio", label: "Ratio tiros de 3 (3PAr %)", helpKey: "threeRatio", awayVal: away3PAr, homeVal: home3PAr, awayDisplay: `${away3PAr.toFixed(1)}% (${at.fg3a} int)`, homeDisplay: `${home3PAr.toFixed(1)}% (${ht.fg3a} int)`, decimals: 1, suffix: "%", section: "efficiency_tactics" });
    pushTeamRow({ key: "reb", label: "Rebotes Totales (REB)", helpKey: "rebBase", awayVal: at.reb, homeVal: ht.reb, awayDisplay: `${at.reb} (${at.oreb} OF / ${at.dreb} DEF)`, homeDisplay: `${ht.reb} (${ht.oreb} OF / ${ht.dreb} DEF)`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "oreb", label: "Rebote Ofensivo (OREB \xB7 %)", helpKey: "orebPct", awayVal: at.oreb, homeVal: ht.oreb, awayDisplay: `${at.oreb} (${awayLog.orebPct.toFixed(1)}%)`, homeDisplay: `${ht.oreb} (${homeLog.orebPct.toFixed(1)}%)`, suffix: " OR", section: "reb_playmaking_defense" });
    pushTeamRow({ key: "ast", label: "Asistencias (AST)", helpKey: "astBase", awayVal: at.ast, homeVal: ht.ast, awayDisplay: `${at.ast}`, homeDisplay: `${ht.ast}`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "stl", label: "Robos (ROB)", helpKey: "steals", awayVal: at.stl, homeVal: ht.stl, awayDisplay: `${at.stl}`, homeDisplay: `${ht.stl}`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "blk", label: "Tapones (TAP)", helpKey: "blocks", awayVal: at.blk, homeVal: ht.blk, awayDisplay: `${at.blk}`, homeDisplay: `${ht.blk}`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "tov", label: "P\xE9rdidas de Bal\xF3n (PER)", helpKey: "tov", awayVal: at.tov, homeVal: ht.tov, awayDisplay: `${at.tov}`, homeDisplay: `${ht.tov}`, lowerIsBetter: true, suffix: " menos", section: "reb_playmaking_defense" });
    pushTeamRow({ key: "tovPct", label: "% P\xE9rdidas (TOV%)", helpKey: "tovPct", awayVal: awayLog.tovPct, homeVal: homeLog.tovPct, awayDisplay: `${awayLog.tovPct.toFixed(1)}%`, homeDisplay: `${homeLog.tovPct.toFixed(1)}%`, decimals: 1, lowerIsBetter: true, suffix: "%", section: "reb_playmaking_defense" });
    const awayAstTov = at.tov > 0 ? round1(at.ast / at.tov) : at.ast;
    const homeAstTov = ht.tov > 0 ? round1(ht.ast / ht.tov) : ht.ast;
    pushTeamRow({ key: "astTov", label: "Ratio Asist / P\xE9rd", helpKey: "astTo", awayVal: awayAstTov, homeVal: homeAstTov, awayDisplay: `${awayAstTov.toFixed(2)}`, homeDisplay: `${homeAstTov.toFixed(2)}`, decimals: 2, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "pf", label: "Faltas Personales (FP)", helpKey: "personalFouls", awayVal: at.fouls, homeVal: ht.fouls, awayDisplay: `${at.fouls}`, homeDisplay: `${ht.fouls}`, lowerIsBetter: true, suffix: " menos", section: "reb_playmaking_defense" });
    const awayPool = [...awaySide.starters, ...awaySide.bench];
    const homePool = [...homeSide.starters, ...homeSide.bench];
    const leaderComparisonRows = [];
    const pickTopLeader = __name((pool, getter, tieBreakMoreMinutes = false) => {
      if (pool.length === 0) return null;
      return [...pool].sort((a, b) => {
        const diff = getter(b) - getter(a);
        if (Math.abs(diff) > 0.01) return diff;
        if (tieBreakMoreMinutes) {
          return b.minutes - a.minutes || b.fga - a.fga;
        }
        if (b.gameScore !== a.gameScore) return b.gameScore - a.gameScore;
        return a.minutes - b.minutes;
      })[0];
    }, "pickTopLeader");
    const playerByNameKey = /* @__PURE__ */ new Map();
    for (const p of full.allPlayers) {
      playerByNameKey.set(normalizePlain(p.name), p);
    }
    const resolvePlayerBaselineLogs = __name((playerId, fullName) => {
      const summary = playerById.get(playerId) || playerByNameKey.get(normalizePlain(fullName));
      if (!summary) return { logs: [] };
      const seasonLogs = summary.games.filter((g) => g.seasonLabel === seasonLabel && g.minutes > 0);
      if (seasonLogs.length >= 2) {
        return { summary, logs: seasonLogs };
      }
      const allActiveLogs = summary.games.filter((g) => g.minutes > 0);
      return { summary, logs: allActiveLogs.length >= 2 ? allActiveLogs : [] };
    }, "resolvePlayerBaselineLogs");
    const avgOf = __name((logs, fn) => {
      if (logs.length === 0) return null;
      const sum = logs.reduce((acc, g) => acc + fn(g), 0);
      return round1(sum / logs.length);
    }, "avgOf");
    const leaderDefs = [{ key: "min", label: "Minutos Jugados", groupLabel: "I. Volumen Base y Tableros", helpKey: "minBase", getter: __name((p) => p.minutes, "getter"), formatStat: __name((p) => `${p.minutesFormatted}`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.minutes), "baselineGetter"), deltaUnit: "m", surgeThreshold: 3, isElite: __name((v) => v >= 38, "isElite"), decimals: 1, diffSuffix: "m" }, { key: "pts", label: "Puntos", groupLabel: "I. Volumen Base y Tableros", helpKey: "ptsBase", getter: __name((p) => p.points, "getter"), formatStat: __name((p) => `${p.points} PTS`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.points), "baselineGetter"), surgeThreshold: 3, isElite: __name((v) => v >= 30, "isElite"), diffSuffix: " PTS" }, { key: "reb", label: "Rebotes Totales", groupLabel: "I. Volumen Base y Tableros", helpKey: "rebBase", getter: __name((p) => p.rebounds, "getter"), formatStat: __name((p) => `${p.rebounds} REB`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.rebounds), "baselineGetter"), surgeThreshold: 2, isElite: __name((v) => v >= 13, "isElite"), diffSuffix: " REB" }, { key: "ast", label: "Asistencias", groupLabel: "I. Volumen Base y Tableros", helpKey: "astBase", getter: __name((p) => p.assists, "getter"), formatStat: __name((p) => `${p.assists} AST`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.assists), "baselineGetter"), surgeThreshold: 1.8, isElite: __name((v) => v >= 10, "isElite"), diffSuffix: " AST" }, { key: "oreb", label: "Rebotes Ofensivos", groupLabel: "I. Volumen Base y Tableros", helpKey: "orebBase", getter: __name((p) => p.oreb, "getter"), formatStat: __name((p) => `${p.oreb} OREB`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.oreb), "baselineGetter"), surgeThreshold: 1.2, isElite: __name((v) => v >= 5, "isElite"), diffSuffix: " OR" }, { key: "tc", label: "Tiros de Campo Anotados", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "fgmMade", getter: __name((p) => p.fgm, "getter"), formatStat: __name((p) => `${p.fgm}/${p.fga} TC`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.fgm), "baselineGetter"), surgeThreshold: 2, isElite: __name((v) => v >= 11, "isElite"), diffSuffix: " TC" }, { key: "fg3m", label: "Triples Anotados", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "fg3m", getter: __name((p) => p.fg3m, "getter"), formatStat: __name((p) => `${p.fg3m}/${p.fg3a} T3`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.fg3m), "baselineGetter"), surgeThreshold: 1.2, isElite: __name((v) => v >= 5, "isElite"), diffSuffix: " T3" }, { key: "tl", label: "Tiros Libres Anotados", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "ftmMade", getter: __name((p) => p.ftm, "getter"), formatStat: __name((p) => `${p.ftm}/${p.fta} TL`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.ftm), "baselineGetter"), surgeThreshold: 1.8, isElite: __name((v) => v >= 8, "isElite"), diffSuffix: " TL" }, { key: "tsPct", label: "Acierto Real (TS%)", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "tsPct", filter: __name((p) => p.fga >= 6, "filter"), getter: __name((p) => p.tsPct, "getter"), formatStat: __name((p) => `${p.tsPct.toFixed(1)}%`, "formatStat"), baselineGetter: __name((logs, summary) => {
      if (logs.length === 0) return summary?.advanced?.tsPct ?? null;
      const pts = logs.reduce((s, g) => s + g.points, 0);
      const fga = logs.reduce((s, g) => s + g.fga, 0);
      const fta = logs.reduce((s, g) => s + g.fta, 0);
      const denom = 2 * (fga + 0.44 * fta);
      return denom > 0 ? round1(pts / denom * 100) : avgOf(logs, (g) => g.tsPct);
    }, "baselineGetter"), deltaUnit: "%", surgeThreshold: 4.5, isElite: __name((v, p) => p.fga >= 6 && v >= 70, "isElite"), decimals: 1, diffSuffix: "%" }, { key: "tov", label: "P\xE9rdidas", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "leaderTurnovers", getter: __name((p) => p.turnovers, "getter"), formatStat: __name((p) => `${p.turnovers} PER`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.turnovers), "baselineGetter"), surgeThreshold: 0.8, isElite: __name((v) => v <= 1, "isElite"), lowerIsBetter: true, diffSuffix: " menos" }, { key: "astTo", label: "Ratio Asistencias/P\xE9rdidas", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "astTo", filter: __name((p) => p.assists >= 4, "filter"), getter: __name((p) => p.turnovers > 0 ? round1(p.assists / p.turnovers) : p.assists, "getter"), formatStat: __name((p) => `${(p.turnovers > 0 ? round1(p.assists / p.turnovers) : p.assists).toFixed(1)} A/P`, "formatStat"), baselineGetter: __name((logs) => {
      if (logs.length === 0) return null;
      const ast = logs.reduce((s, g) => s + g.assists, 0);
      const tov = logs.reduce((s, g) => s + g.turnovers, 0);
      return round1(ast / Math.max(1, tov));
    }, "baselineGetter"), surgeThreshold: 1, isElite: __name((v, p) => p.assists >= 5 && v >= 4.5, "isElite"), decimals: 1 }, { key: "stl", label: "Robos de Bal\xF3n", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "steals", getter: __name((p) => p.steals, "getter"), formatStat: __name((p) => `${p.steals} ROB`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.steals), "baselineGetter"), surgeThreshold: 0.8, isElite: __name((v) => v >= 3, "isElite"), diffSuffix: " ROB" }, { key: "blk", label: "Tapones", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "blocks", getter: __name((p) => p.blocks, "getter"), formatStat: __name((p) => `${p.blocks} TAP`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.blocks), "baselineGetter"), surgeThreshold: 0.8, isElite: __name((v) => v >= 3, "isElite"), diffSuffix: " TAP" }, { key: "pm", label: "Impacto M\xE1s / Menos", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "plusMinusBase", getter: __name((p) => p.plusMinus, "getter"), formatStat: __name((p) => `${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.plusMinus), "baselineGetter"), surgeThreshold: 4, isElite: __name((v) => v >= 15, "isElite") }, { key: "gmSc", label: "Valoraci\xF3n (GmSc)", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "gmSc", getter: __name((p) => p.gameScore, "getter"), formatStat: __name((p) => `${p.gameScore.toFixed(1)}`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.gameScore), "baselineGetter"), surgeThreshold: 3, isElite: __name((v) => v >= 24, "isElite"), decimals: 1 }, { key: "usgEst", label: "Uso Ofensivo Est. (USG%)", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "usgPct", filter: __name((p) => p.minutes >= 12, "filter"), getter: __name((p) => p.usgEst || 0, "getter"), formatStat: __name((p) => `${(p.usgEst || 0).toFixed(1)}%`, "formatStat"), baselineGetter: __name((logs, summary) => {
      if (seasonLabel === "2026-27" && summary?.advanced?.usgPct) {
        return round1(summary.advanced.usgPct);
      }
      return avgOf(logs, (g) => g.usgEst || 0);
    }, "baselineGetter"), deltaUnit: "%", surgeThreshold: 3, isElite: __name((v) => v >= 32, "isElite"), decimals: 1, diffSuffix: "%" }, { key: "sixthMan", label: "Mejor Suplente (6\xBA Hombre)", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "sixthMan", filter: __name((p) => !p.isStarter, "filter"), getter: __name((p) => p.gameScore, "getter"), formatStat: __name((p) => `${p.points}P \xB7 ${p.gameScore.toFixed(1)} GmSc`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.gameScore), "baselineGetter"), surgeThreshold: 2.5, isElite: __name((v) => v >= 14, "isElite"), decimals: 1, diffSuffix: " GmSc" }];
    const buildLeaderDeltaMeta = __name((val, player, def) => {
      const { summary, logs } = resolvePlayerBaselineLogs(player.playerId, player.name);
      const avg = def.baselineGetter(logs, summary);
      if (avg === null || !Number.isFinite(avg)) return {};
      const rawDelta = round1(val - avg);
      const effectiveDelta = def.lowerIsBetter ? -rawDelta : rawDelta;
      const unit = def.deltaUnit || "";
      const threshold = def.surgeThreshold ?? 1.5;
      let deltaDisplay;
      if (Math.abs(rawDelta) < 0.05) {
        deltaDisplay = "= media";
      } else {
        const signed = rawDelta > 0 ? `+${rawDelta.toFixed(1)}` : rawDelta.toFixed(1);
        deltaDisplay = `${signed}${unit} vs media`;
      }
      const deltaTone = effectiveDelta >= threshold ? "positive" : effectiveDelta <= -threshold ? "negative" : "neutral";
      return { avg, deltaVsAvg: rawDelta, deltaDisplay, deltaTone };
    }, "buildLeaderDeltaMeta");
    for (const def of leaderDefs) {
      const aFiltered = def.filter ? awayPool.filter(def.filter) : awayPool;
      const hFiltered = def.filter ? homePool.filter(def.filter) : homePool;
      const aL = pickTopLeader(aFiltered.length > 0 ? aFiltered : awayPool, def.getter, Boolean(def.lowerIsBetter));
      const hL = pickTopLeader(hFiltered.length > 0 ? hFiltered : homePool, def.getter, Boolean(def.lowerIsBetter));
      if (!aL || !hL) continue;
      const aVal = def.getter(aL);
      const hVal = def.getter(hL);
      const rawDiff = aVal - hVal;
      let betterSide = "tie";
      if (Math.abs(rawDiff) >= 0.05) {
        if (def.lowerIsBetter) {
          betterSide = aVal < hVal ? "away" : "home";
        } else {
          betterSide = aVal > hVal ? "away" : "home";
        }
      }
      const dec = def.decimals ?? 0;
      const suf = def.diffSuffix ?? "";
      const absStr = dec === 0 ? `${Math.round(Math.abs(rawDiff))}${suf}` : `${Math.abs(rawDiff).toFixed(dec)}${suf}`;
      const winAbbr = betterSide === "away" ? awaySide.abbr : betterSide === "home" ? homeSide.abbr : "";
      const diffDisplay = betterSide === "tie" ? "Igualado" : `+${absStr} ${winAbbr}`;
      const awayStatDisplay = def.formatStat(aL);
      const homeStatDisplay = def.formatStat(hL);
      const awayDeltaMeta = buildLeaderDeltaMeta(aVal, aL, def);
      const homeDeltaMeta = buildLeaderDeltaMeta(hVal, hL, def);
      leaderComparisonRows.push({ categoryKey: def.key, categoryLabel: def.label, groupLabel: def.groupLabel, helpKey: def.helpKey, awayPlayerId: aL.playerId, awayJersey: aL.jersey, awayShortName: aL.shortName, awayPlayerName: aL.name, awayStatDisplay, awayFormatted: `#${aL.jersey} ${aL.shortName} (${awayStatDisplay}${awayDeltaMeta.deltaDisplay ? ` \xB7 ${awayDeltaMeta.deltaDisplay}` : ""})`, awayValue: aVal, awayAvg: awayDeltaMeta.avg, awayDeltaVsAvg: awayDeltaMeta.deltaVsAvg, awayDeltaDisplay: awayDeltaMeta.deltaDisplay, awayDeltaTone: awayDeltaMeta.deltaTone, awayIsElite: def.isElite ? def.isElite(aVal, aL) : false, homePlayerId: hL.playerId, homeJersey: hL.jersey, homeShortName: hL.shortName, homePlayerName: hL.name, homeStatDisplay, homeFormatted: `#${hL.jersey} ${hL.shortName} (${homeStatDisplay}${homeDeltaMeta.deltaDisplay ? ` \xB7 ${homeDeltaMeta.deltaDisplay}` : ""})`, homeValue: hVal, homeAvg: homeDeltaMeta.avg, homeDeltaVsAvg: homeDeltaMeta.deltaVsAvg, homeDeltaDisplay: homeDeltaMeta.deltaDisplay, homeDeltaTone: homeDeltaMeta.deltaTone, homeIsElite: def.isElite ? def.isElite(hVal, hL) : false, diffDisplay, lowerIsBetter: def.lowerIsBetter, betterSide });
    }
    const hasSpanishPlayers = spanishDetails.length > 0;
    const spanishSummaryLine = hasSpanishPlayers ? spanishDetails.map((s) => s.lineSummary).join(" \xB7 ") : `Sin representaci\xF3n espa\xF1ola en las plantillas de ${awaySide.shortName} ni ${homeSide.shortName} en este encuentro.`;
    const report = { eventId, date: gameDate, seasonLabel, pasoBTitle, arenaName, arenaCity, attendance, attendanceFormatted, durationMinutes, officials, isOvertime, overtimeCount, decisivePeriodLabel, leadChanges, timesTied, leagueAvgPace, paceDiffVsLeague, periods, away: awaySide, home: homeSide, spanishPlayersReport: { hasSpanishPlayers, summaryLine: spanishSummaryLine, details: spanishDetails }, milestonesList, teamComparisonRows, leaderComparisonRows };
    const ttlMs = seasonLabel === "2026-27" ? 10 * 60 * 1e3 : 120 * 60 * 1e3;
    reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, data: report });
    return report;
  }
  async function buildGameOfficialReportData(eventId, forceRefresh = false) {
    const cacheKey = `game_official_report_v6:${eventId}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }
    const inflightKey = `official_report_inflight:${eventId}`;
    const existing = reportInflight.get(inflightKey);
    const existingStart = reportInflightStartedAt.get(inflightKey) || 0;
    if (existing && (!forceRefresh || Date.now() - existingStart < 2500)) {
      return existing;
    }
    const p = computeGameOfficialReportData(eventId, forceRefresh, cacheKey);
    reportInflight.set(inflightKey, p);
    reportInflightStartedAt.set(inflightKey, Date.now());
    try {
      return await p;
    } finally {
      if (reportInflight.get(inflightKey) === p) {
        reportInflight.delete(inflightKey);
        reportInflightStartedAt.delete(inflightKey);
      }
    }
  }
  function buildDeterministicGameNarrative(report) {
    const winner = report.away.isWinner ? report.away : report.home;
    const loser = report.away.isWinner ? report.home : report.away;
    const margin = Math.abs(winner.score - loser.score);
    const wt = winner.totals;
    const lt = loser.totals;
    const wStar = winner.podium[0];
    const wSecond = winner.podium[1];
    const lStar = loser.podium[0];
    const pressHeadline = wStar ? `${winner.shortName} impone su ley ante ${loser.shortName} (${report.away.score}-${report.home.score}) al ritmo de #${wStar.jersey} ${wStar.name}` : `${winner.name} resuelve el pulso ante ${loser.name} (${report.away.score}-${report.home.score}) en ${report.arenaName}`;
    const pressLead = `**${winner.name}** (${winner.recordAfter}) sell\xF3 el triunfo ${report.away.isWinner ? "a domicilio" : "en su pista"} apoyado en un ${wt.efgPct.toFixed(1)}% de tiro efectivo y **el golpe t\xE1ctico asestado en ${report.decisivePeriodLabel}**, dejando sin premio la resistencia de **${loser.name}** (${loser.recordAfter}).`;
    const paceSignStr = report.paceDiffVsLeague >= 0 ? `+${report.paceDiffVsLeague.toFixed(1)}` : report.paceDiffVsLeague.toFixed(1);
    const quarterNarrative = report.periods.length >= 4 ? `El guion por parciales (${report.periods.map((p) => `${p.label}: ${p.awayScore}-${p.homeScore}`).join(", ")}) **encontr\xF3 su punto de ruptura definitivo en ${report.decisivePeriodLabel}**${report.leadChanges !== null ? `, tras un intercambio t\xE1ctico con ${report.leadChanges} cambios de mando y ${report.timesTied ?? 0} empates` : ""}, disput\xE1ndose a un ritmo de ${wt.pace.toFixed(1)} posesiones (${paceSignStr} frente a las ${report.leagueAvgPace.toFixed(1)} de media NBA esta temporada).` : `El encuentro entre **${report.away.shortName}** y **${report.home.shortName}** se defini\xF3 por una renta final de ${margin} tantos (${report.away.score}-${report.home.score}), **imponiendo el control del ritmo competitivo** con ${wt.pace.toFixed(1)} posesiones (${paceSignStr} respecto a las ${report.leagueAvgPace.toFixed(1)} de promedio NBA).`;
    const runAndClutchProse = wt.biggestLead !== null && wt.biggestRun !== null ? `**${winner.shortName}** lleg\xF3 a estirar su ventaja m\xE1xima hasta los +${wt.biggestLead} puntos gracias a una racha de ${wt.biggestRun}-0 que **desarm\xF3 el balance defensivo rival**, sabiendo administrar las posesiones finales ante **${loser.shortName}** sin conceder segundas vidas.` : `En el tramo decisivo, **la gesti\xF3n quir\xFArgica del tempo ofensivo** (${wt.offRtg.toFixed(1)} de eficiencia ofensiva frente a ${lt.offRtg.toFixed(1)}) permiti\xF3 a **${winner.shortName}** blindar el electr\xF3nico frente a **${loser.shortName}**.`;
    const paintAndThreeBattle = wt.ptsPaint !== null && lt.ptsPaint !== null ? `En la pizarra de espacios, **${winner.name}** **domin\xF3 la selecci\xF3n de tiro interior y exterior** con un ${wt.efgPct.toFixed(1)}% en tiro efectivo (${wt.fg3m}/${wt.fg3a} en triples) y ${wt.ptsPaint} puntos en la pintura frente a los ${lt.ptsPaint} de **${loser.shortName}**, mientras que en el rebote el pulso cerr\xF3 ${wt.reb}-${lt.reb} (${wt.oreb} capturas ofensivas del ganador por ${lt.oreb} del rival).` : `En el pulso de los Cuatro Factores, **${winner.name}** **marc\xF3 diferencias desde la eficiencia real de tiro** con un ${wt.efgPct.toFixed(1)}% de acierto efectivo (${wt.fg3m}/${wt.fg3a} desde el per\xEDmetro) frente al ${lt.efgPct.toFixed(1)}% de **${loser.name}**, acompa\xF1ando el acierto con un balance reboteador de ${wt.reb}-${lt.reb}.`;
    const isNonTechnicalAbsence = __name((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague", "isNonTechnicalAbsence");
    const awayMedAbs = report.away.absencesAndDnp.filter(isNonTechnicalAbsence);
    const homeMedAbs = report.home.absencesAndDnp.filter(isNonTechnicalAbsence);
    const benchAndAbsences = `La rotaci\xF3n de segunda unidad aport\xF3 ${wt.benchPoints} puntos en **${winner.shortName}** por ${lt.benchPoints} del banquillo de **${loser.shortName}**${wt.ptsFastBreak !== null && lt.ptsFastBreak !== null ? `, **castigando cada p\xE9rdida a campo abierto** con un parcial de ${wt.ptsFastBreak}-${lt.ptsFastBreak} al contraataque y ${wt.ptsOffTov ?? 0} tantos tras las ${lt.tov} p\xE9rdidas rivales` : `, **penalizando los errores en el manejo** tras las ${lt.tov} p\xE9rdidas de **${loser.shortName}**`}.${awayMedAbs.length > 0 || homeMedAbs.length > 0 ? ` Las rotaciones estuvieron condicionadas por el parte oficial de bajas e incidencias: ${[...awayMedAbs.map((a) => `**${a.name}** (${report.away.abbr} \xB7 ${a.statusLabel || "Baja"}: ${a.note})`), ...homeMedAbs.map((a) => `**${a.name}** (${report.home.abbr} \xB7 ${a.statusLabel || "Baja"}: ${a.note})`)].slice(0, 4).join("; ")}.` : ""}`;
    let dynamicSpotlight = null;
    if (report.isOvertime) {
      dynamicSpotlight = { title: "Tiempo extra bajo m\xE1xima presi\xF3n", body: `El choque exigi\xF3 ${report.overtimeCount > 1 ? `${report.overtimeCount} pr\xF3rrogas` : "cinco minutos suplementarios"} tras agotarse el tiempo reglamentario en m\xE1xima igualdad, poniendo a prueba las piernas de los titulares y **premiando la ejecuci\xF3n en media pista** de **${winner.shortName}** frente a **${loser.shortName}**.` };
    } else if (Math.abs(wt.benchPoints - lt.benchPoints) >= 16) {
      const benchWinner = wt.benchPoints > lt.benchPoints ? winner.shortName : loser.shortName;
      dynamicSpotlight = { title: `Desequilibrio en los tramos de segunda unidad`, body: `La brecha de banquillos (${wt.benchPoints}-${lt.benchPoints} en puntos de suplentes) **alter\xF3 los minutos de descanso titular**, dando aire constante a la rotaci\xF3n de **${benchWinner}**.` };
    }
    const xFactorSection = wStar && lStar ? `El tim\xF3n ofensivo perteneci\xF3 a **#${wStar.jersey} ${wStar.name}** (${wStar.points} puntos, ${wStar.rebounds} rebotes, ${wStar.assists} asistencias, GmSc ${wStar.gameScore.toFixed(1)}), **generando ventajas constantes sobre la primera ayuda** de **${loser.shortName}**.

Como Factor X emergi\xF3 ${wSecond ? `**#${wSecond.jersey} ${wSecond.name}** (${wSecond.points} puntos, ${wSecond.rebounds} rebotes y ${wSecond.assists} asistencias, ${wSecond.plusMinus >= 0 ? `+${wSecond.plusMinus}` : wSecond.plusMinus} en pista)` : `el bloque exterior de **${winner.shortName}**`}, **dando continuidad ofensiva a cada tramo sin bal\xF3n**, mientras que en **${loser.name}** la producci\xF3n de **#${lStar.jersey} ${lStar.name}** (${lStar.points} puntos, ${lStar.rebounds} rebotes, ${lStar.assists} asistencias) sostuvo la pelea hasta el desenlace.` : `**El reparto coral en ataque est\xE1tico** de **${winner.name}** inclin\xF3 la balanza en las posesiones calientes del \xFAltimo cuarto ante **${loser.name}**.`;
    const ddProse = report.milestonesList.length > 0 ? `La hoja estad\xEDstica dej\xF3 actuaciones de dobles figuras m\xFAltiples con ${report.milestonesList.map((m) => m.type === "TD" ? `el triple-doble de **${m.detail.replace(/\s*\(.*$/, "")}** (${m.detail.match(/\((.*)\)/)?.[1] || m.detail})` : `el doble-doble de **${m.detail.replace(/\s*\(.*$/, "")}** (${m.detail.match(/\((.*)\)/)?.[1] || m.detail})`).join(", ")}. ` : "";
    const verdictSection = `${ddProse}En la lectura global de scouting, **${winner.name}** (${winner.recordAfter}) **refuerza su solidez competitiva en media pista** firmando ${wt.offRtg.toFixed(1)} puntos por cada 100 posesiones, mientras que **${loser.name}** (${loser.recordAfter}) deber\xE1 corregir el cierre del rebote y el cuidado del bal\xF3n (${lt.tov} p\xE9rdidas) para su siguiente cita.`;
    return { eventId: report.eventId, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), engineMode: "empirical_fallback", pressHeadline, pressLead, gameFlowSection: `${quarterNarrative}

${runAndClutchProse}`, chalkboardSection: `${paintAndThreeBattle}

${benchAndAbsences}`, dynamicSpotlight, xFactorSection, spanishSection: report.spanishPlayersReport.summaryLine, verdictSection, sources: [] };
  }
  async function buildGameNarrativePayload(eventId, forceRefresh = false) {
    const cacheKey = `game_narrative_v9:${eventId}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }
    const existing = reportInflight.get(cacheKey);
    if (existing) {
      return existing;
    }
    const promise = (async () => {
      const report = await buildGameOfficialReportData(eventId, forceRefresh);
      const pressCtx = await fetchLivePressContext(report.date, forceRefresh);
      if (!getGeminiClient()) {
        return buildDeterministicGameNarrative(report);
      }
      const matchPress = pressCtx.byMatchup.get(`${report.away.abbr}@${report.home.abbr}`);
      const seedSources = [{ uri: `https://www.nba.com/game/${report.away.abbr.toLowerCase()}-vs-${report.home.abbr.toLowerCase()}-${report.eventId}/box-score`, title: `NBA.com Acta Oficial \u2014 ${report.away.abbr} vs ${report.home.abbr}` }, { uri: `https://www.nba.com/game/${report.away.abbr.toLowerCase()}-vs-${report.home.abbr.toLowerCase()}-${report.eventId}/play-by-play`, title: `NBA.com Play-by-Play \u2014 ${report.away.abbr} vs ${report.home.abbr}` }, ...matchPress?.sources || []];
      const formatPlayerDossier = __name((p) => `#${p.jersey} ${p.name} (${p.position}, ${p.isStarter ? "Titular" : "Suplente"}): ${p.points} PTS, ${p.rebounds} REB (${p.oreb} OR), ${p.assists} AST, ${p.steals} ROB, ${p.blocks} TAP, ${p.turnovers} PER, ${p.fgm}/${p.fga} TC, ${p.fg3m}/${p.fg3a} T3, ${p.ftm}/${p.fta} TL, ${p.minutesFormatted} MIN, +/- ${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}, GmSc ${p.gameScore.toFixed(1)}${p.tripleDouble ? " [TRIPLE-DOBLE]" : p.doubleDouble ? " [DOBLE-DOBLE]" : ""}`, "formatPlayerDossier");
      const verifiedGamePlayers = [...report.away.starters.map((p) => p.name), ...report.away.bench.map((p) => p.name), ...report.away.absencesAndDnp.map((p) => p.name), ...report.home.starters.map((p) => p.name), ...report.home.bench.map((p) => p.name), ...report.home.absencesAndDnp.map((p) => p.name)];
      const dossier = [`AVISO CR\xCDTICO DE MUNDO CERRADO: Fecha real del encuentro ${report.date} (Temporada ${report.seasonLabel}). Tu memoria interna de entrenamiento est\xE1 desactualizada varios a\xF1os respecto a entrenadores actuales, traspasos, contratos y palmar\xE9s. NO des NING\xDAN dato por supuesto fuera de los hechos expl\xEDcitos de este dossier.`, `PARTIDO OFICIAL NBA (${report.date} \xB7 Temporada ${report.seasonLabel}):`, `T\xCDTULO: ${report.pasoBTitle}`, `PARCIALES POR CUARTOS: ${report.periods.length > 0 ? report.periods.map((p) => `${p.label} (${report.away.abbr} ${p.awayScore} - ${p.homeScore} ${report.home.abbr})`).join(" | ") : "Sin desglose parcial"} \xB7 Tramo clave: ${report.decisivePeriodLabel}`, `FLUJO DE MARCADOR: Cambios de l\xEDder=${report.leadChanges ?? "No consta"}, Empates=${report.timesTied ?? "No consta"}, M\xE1xima ventaja ${report.away.abbr}=+${report.away.totals.biggestLead ?? 0} (mejor parcial ${report.away.totals.biggestRun ?? 0}-0), M\xE1xima ventaja ${report.home.abbr}=+${report.home.totals.biggestLead ?? 0} (mejor parcial ${report.home.totals.biggestRun ?? 0}-0).`, `RITMO DEL ENCUENTRO (PACE VS MEDIA NBA): ${report.away.totals.pace.toFixed(1)} posesiones/48m (${report.paceDiffVsLeague >= 0 ? `+${report.paceDiffVsLeague.toFixed(1)}` : report.paceDiffVsLeague.toFixed(1)} frente al promedio oficial NBA ${report.seasonLabel} de ${report.leagueAvgPace.toFixed(1)} posesiones).`, matchPress && matchPress.notes.length > 0 ? `TELETIPO DE PRENSA DE ESTE PARTIDO (${report.date}): ${matchPress.notes.join(" | ")}` : "", ``, `ESTAD\xCDSTICAS COLECTIVAS:`, `- VISITANTE ${report.away.name} (${report.away.abbr}, r\xE9cord ${report.away.recordAfter}${report.away.isBackToBack ? ", en Back-to-Back" : ""}): ${report.away.score} PTS | ${report.away.totals.fgm}/${report.away.totals.fga} TC (${report.away.totals.fgPct}%) | ${report.away.totals.fg3m}/${report.away.totals.fg3a} T3 (${report.away.totals.fg3Pct}%) | ${report.away.totals.ftm}/${report.away.totals.fta} TL | ${report.away.totals.reb} REB (${report.away.totals.oreb} OR) | ${report.away.totals.ast} AST | ${report.away.totals.stl} ROB | ${report.away.totals.blk} TAP | ${report.away.totals.tov} PER | OffRtg ${report.away.totals.offRtg} | eFG% ${report.away.totals.efgPct}% | Pintura: ${report.away.totals.ptsPaint ?? "s/d"} | Contraataque: ${report.away.totals.ptsFastBreak ?? "s/d"} | Tras p\xE9rdida: ${report.away.totals.ptsOffTov ?? "s/d"} | 2\xAA jugada: ${report.away.totals.ptsSecondChance ?? "s/d"} | Banquillo: ${report.away.totals.benchPoints} PTS.`, `- LOCAL ${report.home.name} (${report.home.abbr}, r\xE9cord ${report.home.recordAfter}${report.home.isBackToBack ? ", en Back-to-Back" : ""}): ${report.home.score} PTS | ${report.home.totals.fgm}/${report.home.totals.fga} TC (${report.home.totals.fgPct}%) | ${report.home.totals.fg3m}/${report.home.totals.fg3a} T3 (${report.home.totals.fg3Pct}%) | ${report.home.totals.ftm}/${report.home.totals.fta} TL | ${report.home.totals.reb} REB (${report.home.totals.oreb} OR) | ${report.home.totals.ast} AST | ${report.home.totals.stl} ROB | ${report.home.totals.blk} TAP | ${report.home.totals.tov} PER | OffRtg ${report.home.totals.offRtg} | eFG% ${report.home.totals.efgPct}% | Pintura: ${report.home.totals.ptsPaint ?? "s/d"} | Contraataque: ${report.home.totals.ptsFastBreak ?? "s/d"} | Tras p\xE9rdida: ${report.home.totals.ptsOffTov ?? "s/d"} | 2\xAA jugada: ${report.home.totals.ptsSecondChance ?? "s/d"} | Banquillo: ${report.home.totals.benchPoints} PTS.`, ``, `PLANTILLA ${report.away.abbr} EN PISTA:`, ...[...report.away.starters, ...report.away.bench].map(formatPlayerDossier), `BAJAS M\xC9DICAS / LESIONADOS E INCIDENCIAS EN PISTA ${report.away.abbr}: ${report.away.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").length > 0 ? report.away.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Lesionado"} \u2014 ${a.note}]`).join("; ") : "Ninguna baja m\xE9dica ni incidencia registrada"}`, `SIN MINUTOS POR DECISI\xD3N T\xC9CNICA / G-LEAGUE ${report.away.abbr}: ${report.away.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").length > 0 ? report.away.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Decisi\xF3n t\xE9cnica"} \u2014 ${a.note}]`).join("; ") : "Ninguno"}`, ``, `PLANTILLA ${report.home.abbr} EN PISTA:`, ...[...report.home.starters, ...report.home.bench].map(formatPlayerDossier), `BAJAS M\xC9DICAS / LESIONADOS E INCIDENCIAS EN PISTA ${report.home.abbr}: ${report.home.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").length > 0 ? report.home.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Lesionado"} \u2014 ${a.note}]`).join("; ") : "Ninguna baja m\xE9dica ni incidencia registrada"}`, `SIN MINUTOS POR DECISI\xD3N T\xC9CNICA / G-LEAGUE ${report.home.abbr}: ${report.home.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").length > 0 ? report.home.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Decisi\xF3n t\xE9cnica"} \u2014 ${a.note}]`).join("; ") : "Ninguno"}`, ``, `DETECTOR OFICIAL DE JUGADORES ESPA\xD1OLES: ${report.spanishPlayersReport.summaryLine}`, `DOBLES-DOBLES Y TRIPLES-DOBLES VERIFICADOS: ${report.milestonesList.length > 0 ? report.milestonesList.map((m) => `${m.type}: ${m.detail}`).join(" | ") : "Ninguno en este encuentro"}`, `PODIO CALCULADO: ${report.away.abbr} (${report.away.podium.map((p) => `${"\u2B50".repeat(p.stars)} #${p.jersey} ${p.name}`).join(" | ")}) // ${report.home.abbr} (${report.home.podium.map((p) => `${"\u2B50".repeat(p.stars)} #${p.jersey} ${p.name}`).join(" | ")})`].filter(Boolean).join("\n");
      const systemInstruction = ["Eres un periodista s\xE9nior de prensa deportiva espa\xF1ola y scout t\xE1ctico profesional de la NBA (estilo The Athletic, Gigantes del Basket y NBAManiacs).", "REGLAS INQUEBRANTABLES DE RIGOR Y MUNDO CERRADO (CERO DATOS POR SUPUESTOS):", '1. RIGOR EMP\xCDRICO ABSOLUTO: Usa EXCLUSIVAMENTE las cifras estad\xEDsticas exactas, el pabell\xF3n oficial indicado en T\xCDTULO y la informaci\xF3n expl\xEDcita del dossier adjunto. Jam\xE1s inventes puntos, rebotes, parciales, jugadas concretas segundo a segundo (ej. "triple desde la esquina a falta de 2 segundos") ni dorsales que no figuren en el acta.', '2. PROHIBICI\xD3N TOTAL DE DAR DATOS POR SUPUESTOS O USAR MEMORIA PREENTRENADA: Tu conocimiento interno previo est\xE1 desactualizado respecto a la temporada actual. Tienes TERMINANTEMENTE PROHIBIDO dar por supuesto o mencionar: (a) nombres propios o apodos de entrenadores, asistentes o directivos (ej. Tom Thibodeau dej\xF3 los NY Knicks hace a\xF1os; NUNCA cites nombres de entrenadores, usa SIEMPRE "el cuerpo t\xE9cnico de [Equipo]", "la direcci\xF3n t\xE9cnica de [Equipo]" o "la pizarra de [Equipo]"); (b) antig\xFCedad, edad, rondas de Draft, condici\xF3n de rookie, contratos, exequipos o traspasos de jugadores; (c) premios pasados, anillos, "vigente campe\xF3n" o series de temporadas anteriores; (d) puestos exactos en la tabla clasificatoria (ej. "3\xBA del Este") o pr\xF3ximos rivales del calendario; (e) diagn\xF3sticos m\xE9dicos o plazos de recuperaci\xF3n m\xE1s all\xE1 de la nota literal del dossier.', '3. PULCRITUD EN BAJAS (LESI\xD3N VS DECISI\xD3N T\xC9CNICA) Y RITMO: Al mencionar ausencias o jugadores sin minutos en PIZARRA_Y_ROTACION o ESPANOLES, s\xE9 escrupulosamente pulcro distinguiendo entre quienes causaron baja por lesi\xF3n / parte m\xE9dico (bloque BAJAS M\xC9DICAS / LESIONADOS) y quienes no participaron por decisi\xF3n t\xE9cnica o asignaci\xF3n a G-League (bloque SIN MINUTOS POR DECISI\xD3N T\xC9CNICA). Jam\xE1s llames "lesionado" a un descarte por decisi\xF3n t\xE9cnica ni viceversa. Integra tambi\xE9n el Pace frente a la media oficial NBA y, si hubo expulsados por 6 faltas, cita cuarto y reloj exactos.', "4. REDACCI\xD3N 100% NATURAL Y HUMANA: Escribe en espa\xF1ol de Espa\xF1a fluido, con vocabulario t\xE1ctico aut\xE9ntico (espaciado, pintura, bloqueo directo, ajuste tras descanso, transici\xF3n defensiva, segunda unidad, rebote ofensivo, clutch).", '5. CERO CLICH\xC9S NI RELLENO: Prohibido usar "En conclusi\xF3n", "Cabe destacar", "Sin lugar a dudas", "Sin duda" o metatexto. Redacta p\xE1rrafos cohesivos, sin listas de vi\xF1etas ni tablas Markdown.', '6. JERARQU\xCDA VISUAL Y \xC9NFASIS EN NEGRITA (**...**): En todos los p\xE1rrafos del cuerpo (ENTRADILLA, GUION_Y_QUIEBRE, PIZARRA_Y_ROTACION, cuerpo de FOCO_ESPECIAL, FACTOR_X_Y_LIDERES, ESPANOLES y VEREDICTO_E_HITOS), utiliza negrita Markdown (**texto**) EXCLUSIVAMENTE para estos tres elementos: (a) nombres de jugadores (incluyendo su dorsal cuando lo cites, ej. **#15 Nikola Joki\u0107**), (b) nombres o apodos oficiales de equipos/franquicias (ej. **Boston Celtics**, **Knicks**), y (c) UNA sola idea t\xE1ctica clave por p\xE1rrafo (una frase corta de 4 a 10 palabras que resuma la clave del juego, ej. **colapsando la pintura tras cada bloqueo directo**). PROHIBIDO poner en negrita cifras o estad\xEDsticas sueltas (como "49 puntos", "12 rebotes" o "58.4%"): int\xE9gralas en texto normal sin formato especial. PROHIBIDO usar ** en TITULAR_PRENSA ni en el t\xEDtulo corto previo a || en FOCO_ESPECIAL.', "7. ESTRUCTURA EXACTA DE SALIDA CON ESTAS 8 ETIQUETAS EN MAY\xDASCULAS:", "===TITULAR_PRENSA===", "(Titular period\xEDstico vibrante y directo de 1 l\xEDnea sobre el partido, sin almohadillas # ni asteriscos **).", "===ENTRADILLA===", "(Entradilla destacada de 2 l\xEDneas sintetizando la tesis t\xE1ctica y el protagonista del encuentro, aplicando la regla de negritas).", "===GUION_Y_QUIEBRE===", "(2 p\xE1rrafos fluidos: evoluci\xF3n del partido por cuartos, ritmo comparado con la media NBA, alternancias, rachas anotadoras y el momento exacto donde se rompi\xF3 o decidi\xF3 el choque).", "===PIZARRA_Y_ROTACION===", "(2 p\xE1rrafos de scouting profundo: ajustes t\xE1cticos colectivos, batallas en pintura/triple/rebote, impacto real diferenciando con pulcritud bajas por lesi\xF3n frente a ausencias por decisi\xF3n t\xE9cnica o expulsiones por faltas con su cuarto/reloj, rendimiento de la segunda unidad y puntos tras p\xE9rdida/contraataque).", "===FOCO_ESPECIAL===", '(Si el partido tuvo un \xE1ngulo singular \u2014pr\xF3rroga, remontada grande, exhibici\xF3n hist\xF3rica, cortocircuito en el clutch, cl\xEDnica defensiva\u2014, escribe en una l\xEDnea el t\xEDtulo corto sin ** seguido de || y 1 p\xE1rrafo anal\xEDtico con la regla de negritas: ej. "Supervivencia en la pr\xF3rroga || Texto...". Si fue un guion convencional sin \xE1ngulo extra, escribe \xFAnicamente: NINGUNO).', "===FACTOR_X_Y_LIDERES===", "(2 p\xE1rrafos analizando el duelo de estrellas y qui\xE9n emergi\xF3 como Factor X inesperado para inclinar la balanza, citando siempre dorsales # y cifras reales).", "===ESPANOLES===", "(Si hay espa\xF1oles en el detector oficial, analiza en 1 p\xE1rrafo su impacto o situaci\xF3n en convocatoria; si NO los hay, escribe UNA SOLA FRASE breve, limpia y directa confirm\xE1ndolo).", "===VEREDICTO_E_HITOS===", "(2 p\xE1rrafos integrando con total naturalidad los dobles-dobles o triples-dobles verificados y cerrando con el veredicto estrictamente t\xE1ctico del scout sobre qu\xE9 deja este choque a ambos equipos)."].join("\n");
      try {
        const { text: rawText, sources } = await generateWithGeminiCascade({ systemInstruction, contents: dossier, seedSources });
        const safeRawText = sanitizeUnverifiedCoachClaims(rawText, verifiedGamePlayers);
        const parsed = parseDelimitedSections(safeRawText, ["TITULAR_PRENSA", "ENTRADILLA", "GUION_Y_QUIEBRE", "PIZARRA_Y_ROTACION", "FOCO_ESPECIAL", "FACTOR_X_Y_LIDERES", "ESPANOLES", "VEREDICTO_E_HITOS"]);
        const fallback = buildDeterministicGameNarrative(report);
        const payload = { eventId: report.eventId, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), engineMode: "gemini_search", pressHeadline: parsed.TITULAR_PRENSA && parsed.TITULAR_PRENSA.length > 12 ? stripInlineWrapper(parsed.TITULAR_PRENSA) : fallback.pressHeadline, pressLead: parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25 ? parsed.ENTRADILLA : fallback.pressLead, gameFlowSection: parsed.GUION_Y_QUIEBRE && parsed.GUION_Y_QUIEBRE.length > 60 ? parsed.GUION_Y_QUIEBRE : fallback.gameFlowSection, chalkboardSection: parsed.PIZARRA_Y_ROTACION && parsed.PIZARRA_Y_ROTACION.length > 60 ? parsed.PIZARRA_Y_ROTACION : fallback.chalkboardSection, dynamicSpotlight: parseSpotlight(parsed.FOCO_ESPECIAL, fallback.dynamicSpotlight), xFactorSection: parsed.FACTOR_X_Y_LIDERES && parsed.FACTOR_X_Y_LIDERES.length > 50 ? parsed.FACTOR_X_Y_LIDERES : fallback.xFactorSection, spanishSection: parsed.ESPANOLES && parsed.ESPANOLES.length > 12 ? parsed.ESPANOLES : fallback.spanishSection, verdictSection: parsed.VEREDICTO_E_HITOS && parsed.VEREDICTO_E_HITOS.length > 45 ? parsed.VEREDICTO_E_HITOS : fallback.verdictSection, sources };
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + 6 * 60 * 60 * 1e3, data: payload });
        return payload;
      } catch (err) {
        console.info(`[RadarNBA] Activado motor determinista de cr\xF3nica para ${eventId} (${err?.status || err?.code || "timeout/offline"})`);
        const fallback = buildDeterministicGameNarrative(report);
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1e3, data: fallback });
        return fallback;
      }
    })();
    reportInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      reportInflight.delete(cacheKey);
    }
  }
  function buildDeterministicDailyChronicle(gd, spanishNightNotes) {
    const mvp = gd.mvpOfTheNight;
    const stmt = gd.statementTeamWin;
    const topExp = gd.topExplosion;
    const ptsDiff = gd.pulse.avgTotalPoints - gd.pulse.leagueAvgTotalPoints;
    const brokenList = gd.streakShifts.filter((s) => s.status === "broken");
    const extendedList = gd.streakShifts.filter((s) => s.status === "extended");
    const headline = mvp ? `${mvp.playerName} gobierna una madrugada de ${gd.pulse.gamesCount} partidos marcada por ${gd.pulse.closeGamesCount >= 3 ? `${gd.pulse.closeGamesCount} desenlaces al l\xEDmite` : stmt ? `la exhibici\xF3n colectiva de ${stmt.teamName}` : "el pulso t\xE1ctico en ambas conferencias"}` : `Radiograf\xEDa t\xE1ctica y lectura de scouting de los ${gd.pulse.gamesCount} encuentros de la jornada NBA`;
    const lead = `La jornada dej\xF3 ${gd.pulse.gamesCount} encuentros con una media combinada de ${gd.pulse.avgTotalPoints.toFixed(1)} puntos (${ptsDiff >= 0 ? `+${ptsDiff.toFixed(1)}` : ptsDiff.toFixed(1)} frente al promedio de la liga), **${gd.pulse.roadWinsCount} triunfos visitantes marcando el pulso competitivo** y un ritmo medio de ${gd.pulse.avgPace.toFixed(1)} posesiones.`;
    const openingTheme = mvp ? `La madrugada dej\xF3 una demostraci\xF3n colosal de impacto individual y lectura t\xE1ctica, con **${mvp.playerName}** ejerciendo como faro ofensivo de la jornada en una cartelera marcada por el pulso en la media pista y la dureza en las ayudas defensivas.` : `La jornada dej\xF3 un pulso colectivo de enorme exigencia t\xE1ctica, con los bloques exteriores marcando las diferencias en los tramos calientes de los encuentros.`;
    const dynamicSections = [{ kicker: "Tema de Apertura", title: gd.pulse.closeGamesCount >= 3 ? `Noche de nervios de acero con ${gd.pulse.closeGamesCount} cierres en el clutch` : mvp ? `Exhibici\xF3n de jerarqu\xEDa y gobierno del ritmo por ${mvp.playerName}` : "Pulso competitivo y reparto de golpes en la cartelera", body: `${openingTheme}

De los ${gd.pulse.gamesCount} duelos disputados, ${gd.pulse.closeGamesCount} se resolvieron en un pa\xF1uelo de cinco o menos puntos, **exigiendo m\xE1xima precisi\xF3n en media pista** durante los \xFAltimos minutos, mientras que ${gd.pulse.blowoutsCount} encuentros quedaron rotos por rentas superiores a los quince tantos en favor de los equipos m\xE1s s\xF3lidos en la transici\xF3n defensiva.` }];
    const pizarrasSection = [`El term\xF3metro t\xE1ctico de la madrugada mostr\xF3 ${ptsDiff >= 3 ? "**ataques lanzados a campo abierto y triple temprano**, castigando de forma constante las transiciones defensivas" : ptsDiff <= -3 ? "**defensas cerradas protegiendo la pintura y el rebote**, forzando posesiones largas en cinco contra cinco" : "**equilibrio entre transici\xF3n r\xE1pida y lectura en bloqueo directo**"}. Los visitantes rascaron ${gd.pulse.roadWinsCount} victorias lejos de casa en una noche de ${gd.pulse.avgPace.toFixed(1)} posesiones de media.`, stmt ? `La pizarra m\xE1s dominante llev\xF3 el sello de **${stmt.teamName}**, vencedor ${stmt.isHome ? "en casa frente a" : "en la pista de"} **${stmt.opponentAbbr}** (${stmt.scoreDisplay}) **imponiendo una autoridad colectiva incontestable** con un diferencial neto de +${stmt.netRtg.toFixed(1)} puntos por cada 100 posesiones y un ${stmt.efgPct.toFixed(1)}% en tiro efectivo.` : ""].filter(Boolean).join("\n\n");
    const hitosSection = [topExp ? `En el radar de anomal\xEDas estad\xEDsticas sobresali\xF3 **${topExp.playerName}** (${topExp.teamAbbr}), **rompiendo por completo su techo habitual de anotaci\xF3n** hasta los ${topExp.points} puntos (+${topExp.ptsDelta.toFixed(1)} respecto a su media de ${topExp.ptsAvg.toFixed(1)}) gracias a ${topExp.driverTag.toLowerCase()}.` : "", gd.roleShifts.length > 0 ? `En clave de rotaciones, **ganaron peso espec\xEDfico dentro de sus segundas unidades** ${gd.roleShifts.slice(0, 3).map((r) => `**${r.playerName}** (${r.teamAbbr}, ${r.minutes.toFixed(0)} minutos y ${r.points} puntos)`).join(", ")}.` : "", brokenList.length > 0 || extendedList.length > 0 ? `Respecto a las series consecutivas, ${extendedList.length > 0 ? `**${extendedList[0].playerName}** **sostuvo su regularidad competitiva** estirando a ${extendedList[0].streakCount} partidos su racha en ${extendedList[0].thresholdLabel}` : "**varias referencias ofensivas sostuvieron su regularidad**"}${brokenList.length > 0 ? `, al tiempo que se cort\xF3 la secuencia de ${brokenList[0].streakCount} encuentros de **${brokenList[0].playerName}** (${brokenList[0].thresholdLabel})` : ""}.` : ""].filter(Boolean).join("\n\n");
    const espanolesSection = spanishNightNotes.length > 0 ? `La representaci\xF3n espa\xF1ola **dej\xF3 presencia verificada en acta durante la madrugada**: ${spanishNightNotes.join("; ")}.` : "Ning\xFAn jugador espa\xF1ol sum\xF3 minutos en pista en los encuentros disputados durante esta fecha del calendario NBA.";
    const clavesList = [];
    if (mvp) {
      const mvpMatch = gd.matchups.find((m) => m.away.abbr === mvp.teamAbbr || m.home.abbr === mvp.teamAbbr);
      const mvpScoreNote = mvpMatch ? ` en el ${mvpMatch.away.score}-${mvpMatch.home.score} ante **${mvp.opponentAbbr}**` : ` frente a **${mvp.opponentAbbr}**`;
      clavesList.push({ title: `Impacto estelar de ${mvp.playerName}`, detail: sanitizeEditorialSpanishGrammar(`**${mvp.playerName}** (${mvp.teamAbbr}) **inclin\xF3 el encuentro desde la generaci\xF3n ofensiva**${mvpScoreNote}, produciendo ${mvp.points} puntos, ${mvp.rebounds} rebotes y ${mvp.assists} asistencias con ${mvp.tsPct.toFixed(0)}% de eficiencia real.`) });
    }
    if (stmt) {
      const cleanStmt = sanitizeEditorialSpanishGrammar(stmt.summarySimple || `${stmt.scoreDisplay} ante ${stmt.opponentAbbr}`);
      clavesList.push({ title: `Pizarra dominante de ${stmt.teamAbbr}`, detail: sanitizeEditorialSpanishGrammar(`**${stmt.teamName}** **marc\xF3 la mayor superioridad t\xE1ctica de la fecha** (${stmt.scoreDisplay} frente a **${stmt.opponentAbbr}**), sosteniendo +${stmt.netRtg.toFixed(1)} puntos por cada 100 posesiones y un ${stmt.efgPct.toFixed(1)}% en tiro efectivo (${cleanStmt.replace(/\*\*/g, "")}).`) });
    }
    if (topExp) {
      clavesList.push({ title: `Factor X: ${topExp.playerName}`, detail: sanitizeEditorialSpanishGrammar(`**${topExp.playerName}** (${topExp.teamAbbr}) **rompi\xF3 el plan defensivo rival** escalando hasta ${topExp.points} puntos (+${topExp.ptsDelta.toFixed(1)} sobre su media habitual de ${topExp.ptsAvg.toFixed(1)}) impulsado por ${topExp.driverTag.toLowerCase()}.`) });
    }
    const closestGame = [...gd.matchups].sort((a, b) => a.margin - b.margin)[0];
    if (closestGame) {
      const winnerSide = closestGame.away.score > closestGame.home.score ? closestGame.away : closestGame.home;
      const loserSide = closestGame.away.score > closestGame.home.score ? closestGame.home : closestGame.away;
      const primaryKey = (closestGame.keyTakeawaysSimple[0] || "").replace(/^\*\*[^*]+\*\*\s*/, "").trim();
      clavesList.push({ title: closestGame.margin <= 5 ? `Ejecuci\xF3n en el clutch (${winnerSide.abbr})` : `Lectura global de la cartelera`, detail: sanitizeEditorialSpanishGrammar(closestGame.margin <= 5 && primaryKey ? `**${winnerSide.name}** **resolvi\xF3 el duelo m\xE1s cerrado de la noche** ante **${loserSide.name}** (${closestGame.away.score}-${closestGame.home.score}): ${primaryKey.charAt(0).toLowerCase() + primaryKey.slice(1)}` : `La jornada dej\xF3 **${gd.pulse.closeGamesCount} desenlaces decididos en el alambre** y ${gd.pulse.roadWinsCount} triunfos visitantes en ${gd.pulse.gamesCount} partidos, con un ritmo medio de ${gd.pulse.avgPace.toFixed(1)} posesiones.`) });
    }
    return { date: gd.selectedDate, seasonLabel: gd.seasonLabel, gamesCount: gd.pulse.gamesCount, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), engineMode: "empirical_fallback", headline: sanitizeEditorialSpanishGrammar(headline), lead: sanitizeEditorialSpanishGrammar(lead), dynamicSections, pizarrasSection: sanitizeEditorialSpanishGrammar(pizarrasSection), hitosSection: sanitizeEditorialSpanishGrammar(hitosSection || lead), espanolesSection: sanitizeEditorialSpanishGrammar(espanolesSection), clavesList: clavesList.slice(0, 4), spanishPlayersSummary: spanishNightNotes.length > 0 ? spanishNightNotes.join(" \xB7 ") : "Sin participaci\xF3n en pista de jugadores espa\xF1oles registrada en los partidos de esta fecha.", sources: [] };
  }
  async function buildGameDayChroniclePayload(requestedDate, forceRefresh = false) {
    const gd = await deps.getGameDayPayload(requestedDate, forceRefresh);
    const cacheKey = `gameday_chronicle_v8:${gd.selectedDate}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }
    const existing = reportInflight.get(cacheKey);
    if (existing) {
      return existing;
    }
    const promise = (async () => {
      const [full, biosMap, pressCtx] = await Promise.all([deps.getFullLeagueMemory(), deps.getPlayerBiosMap(false), fetchLivePressContext(gd.selectedDate, forceRefresh)]);
      const spanishNightNotes = [];
      const tripleDoublesNight = [];
      const verifiedNightPlayerNames = [];
      const eventIdsToday = new Set(gd.matchups.map((m) => m.eventId));
      let totalDoubleDoubles = 0;
      for (const p of full.allPlayers) {
        const g = p.games.find((x) => eventIdsToday.has(x.eventId) || x.date.slice(0, 10) === gd.selectedDate);
        if (!g) continue;
        verifiedNightPlayerNames.push(p.name);
        const bio = biosMap.get(p.id);
        const isSp = isSpanishPlayerCheck(p.name, p.country || bio?.country);
        if (isSp) {
          spanishNightNotes.push(`#${sanitizeJersey(p.jersey, bio?.jersey)} ${p.name} (${p.teamAbbr} ${g.isHome ? "vs" : "@"} ${g.opponentAbbr}, ${g.result}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST en ${Math.round(g.minutes)} MIN`);
        }
        const tens = [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter((v) => v >= 10).length;
        if (tens >= 3) {
          tripleDoublesNight.push(`${p.name} (${p.teamAbbr}): ${g.points} PTS \xB7 ${g.rebounds} REB \xB7 ${g.assists} AST`);
        } else if (tens === 2) {
          totalDoubleDoubles++;
        }
      }
      if (!getGeminiClient() || gd.matchups.length === 0) {
        return buildDeterministicDailyChronicle(gd, spanishNightNotes);
      }
      const daySeedSources = [{ uri: `https://www.nba.com/games?date=${gd.selectedDate}`, title: `NBA.com \u2014 Resultados y Actas Oficiales (${gd.selectedDate})` }, ...pressCtx.daySources].slice(0, 6);
      const dayDossier = [`AVISO CR\xCDTICO DE MUNDO CERRADO: Jornada oficial NBA del ${gd.selectedDate} (Temporada ${gd.seasonLabel}). Tu memoria interna de entrenamiento est\xE1 desactualizada varios a\xF1os respecto a entrenadores actuales, traspasos, contratos y palmar\xE9s. NO des NING\xDAN dato por supuesto fuera de los hechos expl\xEDcitos de este dossier.`, `FECHA DE LA JORNADA NBA: ${gd.selectedDate} (Temporada ${gd.seasonLabel})`, `PULSO GLOBAL: ${gd.pulse.gamesCount} partidos disputados | Media puntos combinados: ${gd.pulse.avgTotalPoints.toFixed(1)} PTS (media liga: ${gd.pulse.leagueAvgTotalPoints.toFixed(1)}) | Finales apretados (<=5 pts): ${gd.pulse.closeGamesCount} | Palizas (>=15 pts): ${gd.pulse.blowoutsCount} | Victorias visitantes: ${gd.pulse.roadWinsCount}/${gd.pulse.gamesCount} | Ritmo medio (Pace): ${gd.pulse.avgPace.toFixed(1)}.`, gd.statementTeamWin ? `GOLPE EN LA MESA COLECTIVO: ${gd.statementTeamWin.teamName} (${gd.statementTeamWin.summaryAdvanced}).` : "", pressCtx.dayNotes.length > 0 ? `TELETIPOS DE PRENSA DE LOS PARTIDOS DE ESTA FECHA (${gd.selectedDate}):
${pressCtx.dayNotes.slice(0, 12).map((n) => `  \u2022 ${n}`).join("\n")}` : "", ``, `QUINTETO IDEAL DE LA NOCHE (TOP 5 GAME SCORE):`, ...gd.idealFive.map((p, i) => `${i + 1}. ${p.playerName} (${p.teamAbbr} ${p.isHome ? "vs" : "@"} ${p.opponentAbbr}, ${p.result}): ${p.points} PTS, ${p.rebounds} REB, ${p.assists} AST, ${p.stocks} ROB+TAP, ${p.tsPct.toFixed(1)}% TS, GmSc ${p.gameScore.toFixed(1)} (su media es ${p.ptsBaselineAvg.toFixed(1)} PTS)`), ``, `TODOS LOS RESULTADOS Y CLAVES T\xC1CTICAS DE LOS ${gd.matchups.length} PARTIDOS:`, ...gd.matchups.map((m) => `- ${m.away.name} (${m.away.abbr} ${m.away.recordAfter}) ${m.away.score} - ${m.home.score} ${m.home.name} (${m.home.abbr} ${m.home.recordAfter}) [${m.contextTag}] | L\xEDderes: ${m.away.topPlayer ? `${m.away.topPlayer.playerName} (${m.away.topPlayer.points}P/${m.away.topPlayer.rebounds}R/${m.away.topPlayer.assists}A)` : ""} vs ${m.home.topPlayer ? `${m.home.topPlayer.playerName} (${m.home.topPlayer.points}P/${m.home.topPlayer.rebounds}R/${m.home.topPlayer.assists}A)` : ""} | Claves: ${m.keyTakeawaysAdvanced.map((k) => k.replace(/\*\*/g, "")).join(" / ")}`), ``, `EXPLOSIONES FRENTE A SU MEDIA: ${gd.explosions.length > 0 ? gd.explosions.slice(0, 5).map((e) => `${e.playerName} (${e.teamAbbr}): ${e.points} PTS (+${e.ptsDelta.toFixed(1)} vs media ${e.ptsAvg.toFixed(1)}, ${e.driverTag})`).join(" | ") : "Ninguna extrema"}`, `BATACAZOS DE TITULARES: ${gd.slumps.length > 0 ? gd.slumps.slice(0, 4).map((s) => `${s.playerName} (${s.teamAbbr}): ${s.points} PTS (${s.ptsDelta.toFixed(1)} vs media ${s.ptsAvg.toFixed(1)}, ${s.tsPct.toFixed(0)}% TS)`).join(" | ") : "Ninguno acusado"}`, `CAMBIOS DE ROL / PICOS DE MINUTOS: ${gd.roleShifts.length > 0 ? gd.roleShifts.slice(0, 4).map((r) => `${r.playerName} (${r.teamAbbr}): ${r.minutes.toFixed(0)} MIN (+${r.minutesDelta.toFixed(1)} vs media), ${r.usgEst.toFixed(1)}% USG, ${r.points}P/${r.rebounds}R/${r.assists}A`).join(" | ") : "Rotaciones estables"}`, `RACHAS DESTACADAS: ${gd.streakShifts.length > 0 ? gd.streakShifts.slice(0, 6).map((st) => `${st.playerName} (${st.teamAbbr}): ${st.status === "broken" ? `RACHA ROTA tras ${st.streakCount} PJ` : `PROLONGA a ${st.streakCount} PJ`} en ${st.thresholdLabel} (${st.nightValueDisplay})`).join(" | ") : "Sin rachas largas alteradas"}`, `TRIPLES-DOBLES DE LA NOCHE: ${tripleDoublesNight.length > 0 ? tripleDoublesNight.join(" | ") : "Ninguno"} (Total dobles-dobles en la jornada: ${totalDoubleDoubles}).`, `JUGADORES ESPA\xD1OLES EN LA JORNADA: ${spanishNightNotes.length > 0 ? spanishNightNotes.join(" | ") : "Ning\xFAn jugador espa\xF1ol sum\xF3 minutos en pista esta fecha."}`].filter(Boolean).join("\n");
      const systemInstruction = ["Eres el analista jefe y cronista de scouting NBA de referencia en Espa\xF1a. Cada ma\xF1ana escribes la gran revista editorial de la jornada para que un lector exigente entienda en pocos minutos todo lo ocurrido en la liga.", "REGLAS INQUEBRANTABLES DE RIGOR Y MUNDO CERRADO (CERO DATOS POR SUPUESTOS):", "1. RIGOR EMP\xCDRICO TOTAL: Todos los marcadores, puntos, porcentajes, r\xE9cords y rachas que cites deben coincidir al 100% con el dossier adjunto. Jam\xE1s inventes resultados, cifras ni jugadas concretas no descritas.", '2. PROHIBICI\xD3N TOTAL DE DAR DATOS POR SUPUESTOS O USAR MEMORIA PREENTRENADA: Tu conocimiento interno previo est\xE1 desactualizado respecto a la temporada actual. Tienes TERMINANTEMENTE PROHIBIDO dar por supuesto o mencionar: (a) nombres propios o apodos de entrenadores, asistentes o directivos (ej. Tom Thibodeau dej\xF3 los NY Knicks hace a\xF1os; NUNCA cites nombres de entrenadores, habla SIEMPRE de "el cuerpo t\xE9cnico de [Equipo]", "la direcci\xF3n t\xE9cnica de [Equipo]" o "la pizarra de [Equipo]"); (b) antig\xFCedad, edad, rondas de Draft, condici\xF3n de rookie, contratos, exequipos o traspasos de jugadores; (c) premios pasados, anillos, "vigente campe\xF3n" o series de temporadas anteriores; (d) puestos exactos en la clasificaci\xF3n (ej. "4\xBA del Este") o pr\xF3ximos rivales del calendario; (e) causas o plazos de lesiones no escritos literalmente en el dossier.', '3. PROSA DE REVISTA DE AUTOR + CERO LISTAS MEC\xC1NICAS DE ESTAD\xCDSTICAS: Queda terminantemente prohibido soltar oraciones del tipo "X firm\xF3 N puntos, N rebotes y N asistencias" enumerando jugadores como si fuera una base de datos o un parte de estad\xEDsticas. Esos datos ya se muestran en las tarjetas visuales de la interfaz. Escribe un relato period\xEDstico de alta calidad y profundidad t\xE1ctica (estilo art\xEDculo de fondo de Gigantes o The Athletic), analizando din\xE1micas colectivas, alternativas en el marcador, lectura de espacios y sensaciones de la jornada con total naturalidad humana.', '4. GRAM\xC1TICA ESPA\xD1OLA IMPECABLE + JERARQU\xCDA EN NEGRITA (**...**): JAM\xC1S dupliques el art\xEDculo delante de franquicias que ya empiezan por "Los" (PROHIBIDO escribir "Los Los Angeles Lakers" o "los Los Angeles Clippers"; escribe siempre "**Los Angeles Lakers**" o "los **Lakers**"). En todos los p\xE1rrafos del cuerpo (ENTRADILLA, CAPITULOS_DINAMICOS, PIZARRAS, HITOS, ESPANOLES y la explicaci\xF3n tras :: en CLAVES), utiliza negrita Markdown (**texto**) EXCLUSIVAMENTE para: (a) nombres de jugadores (ej. **Nikola Joki\u0107**), (b) nombres o apodos oficiales de equipos (ej. **Boston Celtics**, **Lakers**), y (c) UNA sola idea t\xE1ctica clave por p\xE1rrafo (frase breve de 4 a 10 palabras que explique el porqu\xE9 del juego, ej. **colapsando la pintura para forzar p\xE9rdidas**). PROHIBIDO poner en negrita cifras aisladas y PROHIBIDO poner ** en TITULAR o antes de ::.', "5. FORMATO EXACTO CON ESTAS 7 ETIQUETAS EN MAY\xDASCULAS:", "===TITULAR===", "(Titular period\xEDstico potente de portada en 1 sola l\xEDnea, sin # ni **).", "===ENTRADILLA===", "(Entradilla editorial destacada de 2 a 3 l\xEDneas resumiendo el pulso y los grandes nombres de la noche, aplicando la regla de negritas).", "===CAPITULOS_DINAMICOS===", '(Redacta 1 o 2 cap\xEDtulos tem\xE1ticos con t\xEDtulo libre sin ** adaptado a lo m\xE1s importante que haya ocurrido esta madrugada \u2014ej. finales de infarto, noche de tiradores, pulso por el Oeste, exhibiciones individuales\u2014. Formato obligatorio por cap\xEDtulo: "T\xEDtulo atractivo del cap\xEDtulo :: P\xE1rrafo 1\\n\\nP\xE1rrafo 2". Si escribes 2 cap\xEDtulos, sep\xE1ralos con una l\xEDnea que contenga \xFAnicamente ---).', "===PIZARRAS===", "(Ep\xEDgrafe fijo Pizarras: 2 p\xE1rrafos analizando ajustes t\xE1cticos colectivos de la jornada, ritmo frente a la media de la liga, eficiencia ofensiva/defensiva y el golpe colectivo m\xE1s serio de la noche).", "===HITOS===", "(Ep\xEDgrafe fijo Hitos: 2 p\xE1rrafos entrelazando con naturalidad triples-dobles/dobles-dobles, explosiones estad\xEDsticas frente a su media, irrupciones de rol/minutos y rachas prolongadas o rotas).", "===ESPANOLES===", "(Ep\xEDgrafe fijo Espa\xF1oles: si jugaron espa\xF1oles, 1 p\xE1rrafo analizando con precisi\xF3n sus minutos, producci\xF3n e impacto real; si ninguno sum\xF3 minutos en esta fecha, 1 frase sobria, directa y natural confirm\xE1ndolo).", "===CLAVES===", '(Ep\xEDgrafe fijo Claves: exactamente 4 claves anal\xEDticas reales que expliquen POR QU\xC9 se ganaron o perdieron los partidos m\xE1s relevantes de la jornada, una por l\xEDnea con formato exacto "T\xEDtulo anal\xEDtico corto sin ** :: An\xE1lisis t\xE1ctico claro en 1-2 frases respaldado por cifras comprensibles aplicando negritas", sin numeraci\xF3n inicial. Criterio obligatorio de las 4 claves: [1] la gran exhibici\xF3n individual de la noche y c\xF3mo gener\xF3 ventaja para su equipo; [2] la pizarra colectiva o factor t\xE1ctico m\xE1s determinante de la jornada \u2014punter\xEDa y volumen en triples, cerrojo defensivo, control de p\xE9rdidas, dominio en la pintura o rebote ofensivo\u2014; [3] el cierre apretado, irrupci\xF3n de banquillo o factor X m\xE1s decisivo; [4] lectura t\xE1ctica global de la cartelera. PROHIBIDO usar ratios opacos que no expliquen el juego como "tasa de tiros libres" / FTR% o citar datos sueltos sin causa-efecto baloncest\xEDstico).'].join("\n");
      try {
        const { text: rawText, sources } = await generateWithGeminiCascade({ systemInstruction, contents: dayDossier, seedSources: daySeedSources });
        const safeRawText = sanitizeUnverifiedCoachClaims(rawText, verifiedNightPlayerNames);
        const parsed = parseDelimitedSections(safeRawText, ["TITULAR", "ENTRADILLA", "CAPITULOS_DINAMICOS", "PIZARRAS", "HITOS", "ESPANOLES", "CLAVES"]);
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes);
        const payload = { date: gd.selectedDate, seasonLabel: gd.seasonLabel, gamesCount: gd.pulse.gamesCount, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), engineMode: "gemini_search", headline: parsed.TITULAR && parsed.TITULAR.length > 12 ? stripInlineWrapper(parsed.TITULAR) : fallback.headline, lead: parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25 ? parsed.ENTRADILLA : fallback.lead, dynamicSections: parseDynamicChapters(parsed.CAPITULOS_DINAMICOS, fallback.dynamicSections), pizarrasSection: parsed.PIZARRAS && parsed.PIZARRAS.length > 60 ? parsed.PIZARRAS : fallback.pizarrasSection, hitosSection: parsed.HITOS && parsed.HITOS.length > 60 ? parsed.HITOS : fallback.hitosSection, espanolesSection: parsed.ESPANOLES && parsed.ESPANOLES.length > 12 ? parsed.ESPANOLES : fallback.espanolesSection, clavesList: parseClavesList(parsed.CLAVES, fallback.clavesList), spanishPlayersSummary: spanishNightNotes.length > 0 ? spanishNightNotes.join(" \xB7 ") : "Sin minutos en pista de jugadores espa\xF1oles en los encuentros disputados esta fecha.", sources };
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + 4 * 60 * 60 * 1e3, data: payload });
        return payload;
      } catch (err) {
        console.info(`[RadarNBA] Activado motor determinista de jornada para ${gd.selectedDate} (${err?.status || err?.code || "timeout/offline"})`);
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes);
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1e3, data: fallback });
        return fallback;
      }
    })();
    reportInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      reportInflight.delete(cacheKey);
    }
  }
  return { buildGameOfficialReportData, buildGameNarrativePayload, buildGameDayChroniclePayload, fetchLeagueScheduleGames, fetchEspnInjuriesByName };
}
export {
  createScoutingEngine,
  translateMedicalDetailEs
};
