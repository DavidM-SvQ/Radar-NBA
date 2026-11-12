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
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ""
  ).trim();
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
const modelCooldownMap = new Map<string, number>();
const deprecatedModelsSet = new Set<string>();

function isQuotaExhaustedError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || "");
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("Quota exceeded") ||
    msg.includes("high demand") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("overloaded")
  );
}

function isModelDeprecatedError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || "");
  return (
    msg.includes("404") ||
    msg.includes("NOT_FOUND") ||
    msg.includes("no longer available") ||
    msg.includes("is not found")
  );
}

async function generateWithGeminiCascade(params: {
  systemInstruction: string;
  contents: string;
  seedSources?: Array<{ uri: string; title: string }>;
  isServerless?: boolean;
}) {
  const isServerless =
    Boolean(params.isServerless) ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.NBA_SNAPSHOT_ONLY === "1";

  const ai = getGeminiClient(isServerless ? 30000 : 35000);
  if (!ai) {
    throw new Error("GEMINI_API_KEY unavailable");
  }

  const modelTimeout = isServerless ? 25000 : 25000;
  
  // Environment variable overrides take top priority, followed by stable models and floating aliases
  const primaryModel = process.env.GEMINI_MODEL_PRIMARY || "gemini-3.1-flash-lite";
  const secondaryModel = process.env.GEMINI_MODEL_SECONDARY || "gemini-3.8-flash";
  const tertiaryModel = process.env.GEMINI_MODEL_TERTIARY || "gemini-flash-latest";

  const rawCandidateModels = [
    { name: primaryModel, timeoutMs: modelTimeout },
    { name: secondaryModel, timeoutMs: modelTimeout },
    { name: tertiaryModel, timeoutMs: modelTimeout },
    { name: "gemini-flash-latest", timeoutMs: modelTimeout },
  ];

  // Remove duplicates and permanently skip models detected as deprecated (404) by Google API
  const uniqueModels: Array<{ name: string; timeoutMs: number }> = [];
  const seenNames = new Set<string>();
  for (const item of rawCandidateModels) {
    if (!seenNames.has(item.name) && !deprecatedModelsSet.has(item.name)) {
      seenNames.add(item.name);
      uniqueModels.push(item);
    }
  }

  const now = Date.now();
  const activeModels = uniqueModels.filter(
    (m) => (modelCooldownMap.get(m.name) || 0) < now
  );
  const modelsToTry = activeModels.length > 0 ? activeModels : uniqueModels;
  let lastErr: unknown = null;

  for (const { name: model, timeoutMs } of modelsToTry) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms for ${model}`)), timeoutMs)
      );
      const callPromise = ai.models.generateContent({
        model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
        },
      });

      const response = (await Promise.race([callPromise, timeoutPromise])) as any;

      const text = (response?.text || "").trim();
      if (text && text.length > 80) {
        modelCooldownMap.delete(model);
        return {
          text,
          sources: extractGroundingSources(response, params.seedSources),
        };
      }
    } catch (err) {
      lastErr = err;
      if (isModelDeprecatedError(err)) {
        deprecatedModelsSet.add(model);
      } else if (isQuotaExhaustedError(err)) {
        modelCooldownMap.set(model, Date.now() + 5 * 60 * 1000);
      }
      const rawMsg = err instanceof Error ? err.message : String(err || "");
      const cleanMsg = rawMsg.replace(/[\{\}\"\:]/g, " ").replace(/\s+/g, " ").slice(0, 100);
      console.info(`[RadarNBA] Transición de modelo ${model} -> ${cleanMsg}`);
    }
  }

  throw lastErr || new Error("All Gemini cascade models failed");
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
          const returnDate = cleanField(inj?.details?.returnDate);
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
          if (returnDate) {
            combinedDetail = combinedDetail ? `${combinedDetail} [Regreso est: ${returnDate}]` : `Regreso est: ${returnDate}`;
          }
          map.set(normalizePlain(dispName), { status, detail: combinedDetail });
        }
      }
    } catch {
    }
    return map;
  }
  function computeGameTimeRemaining(periodNum, clockStr) {
    const [mStr, sStr] = (clockStr || "00:00").split(":");
    const m = Number(mStr) || 0;
    const s = Number(sStr) || 0;
    if (periodNum <= 4) {
      const totalRegSecs = (4 - periodNum) * 720 + (m * 60 + s);
      const remMins = Math.floor(totalRegSecs / 60);
      const remSecs = totalRegSecs % 60;
      return `${remMins} min y ${String(remSecs).padStart(2, "0")}s de encuentro`;
    }
    return `${m} min y ${String(s).padStart(2, "0")}s de prórroga`;
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
        const fifthFoul = playerFouls.find((a) => Number(a?.foulPersonalTotal) === 5);
        const pNum = Number(exactSixth?.period) || 4;
        const periodLabel = pNum <= 4 ? `${pNum}Q` : pNum === 5 ? "PR" : `PR${pNum - 4}`;
        const clockRemaining = parsePbpClockRemaining(exactSixth?.clock) || "00:00";
        const gameTimeLeft = computeGameTimeRemaining(pNum, clockRemaining);

        let fifthFoulDetail = "";
        if (fifthFoul) {
          const p5 = Number(fifthFoul?.period) || 3;
          const p5Label = p5 <= 4 ? `${p5}Q` : "PR";
          const p5Clock = parsePbpClockRemaining(fifthFoul?.clock) || "00:00";
          fifthFoulDetail = `; 5ª falta en el ${p5Label} a falta de ${p5Clock}`;
        }

        out.set(pid, { periodLabel, clockRemaining, gameTimeLeft, fifthFoulDetail });
      }
    } catch {
    }
    return out;
  }
  async function fetchPlayByPlayHighlights(eventId, awayAbbr, homeAbbr, winnerAbbr, seasonLabel, forceRefresh = false) {
    const emptyRes = { keyRun: null, breakpoint: null, clutchPlays: [], playerHotSpurts: [], formattedDossierBlock: "" };
    if (!eventId) return emptyRes;
    let actions = [];
    const ttl = seasonLabel === "2026-27" ? 15 * 60 * 1000 : 180 * 60 * 1000;
    if (/^00\d{8}$/.test(eventId)) {
      try {
        const pbp = await deps.cachedFetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${eventId}.json`, ttl, NBA_LIVE_HEADERS, 7500, forceRefresh);
        if (Array.isArray(pbp?.game?.actions)) {
          actions = pbp.game.actions;
        }
      } catch {
      }
    }
    if (actions.length === 0) {
      try {
        const espnSummary = await deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`, ttl, {}, 7500, forceRefresh);
        const espnPlays = Array.isArray(espnSummary?.plays) ? espnSummary.plays : [];
        if (espnPlays.length > 0) {
          actions = espnPlays.map((p) => {
            const rawTextLow = String(p?.text || "").toLowerCase();
            const isMiss = rawTextLow.includes("misses") || rawTextLow.includes("falla");
            const isScoring = Boolean(p?.scoringPlay);
            return {
              period: Number(p?.period?.number) || 1,
              clock: p?.clock?.displayValue || "00:00",
              teamTricode: normalizeEspnTeamAbbr(p?.team?.abbreviation || ""),
              playerNameI: p?.athlete?.displayName || String(p?.text || "").split(" ")[0] || "",
              description: String(p?.text || "").trim(),
              scoreHome: String(p?.homeScore ?? 0),
              scoreAway: String(p?.awayScore ?? 0),
              actionType: p?.type?.text?.toLowerCase() || (isScoring ? "made" : "play"),
              pointsTotal: isScoring ? (p?.scoreValue || 2) : 0,
              subType: p?.type?.text || "",
              shotResult: isScoring ? "made" : isMiss ? "missed" : "",
            };
          });
        }
      } catch {
      }
    }
    if (actions.length === 0) return emptyRes;

    const clockToSec = (clockStr) => {
      const parts = String(clockStr || "00:00").split(":");
      const m = Number(parts[0]) || 0;
      const s = Number(parts[1]) || 0;
      return m * 60 + s;
    };

    // Index all tactical timeouts called during the game
    const timeoutEvents = [];
    for (const a of actions) {
      const actType = String(a?.actionType || "").toLowerCase();
      const subType = String(a?.subType || "").toLowerCase();
      const desc = String(a?.description || "").toLowerCase();
      const isTimeout = actType.includes("timeout") || subType.includes("timeout") || desc.includes("timeout") || desc.includes("tiempo muerto");
      if (!isTimeout) continue;
      const pNum = Number(a?.period) || 1;
      const periodLabel = pNum <= 4 ? `${pNum}Q` : pNum === 5 ? "PR" : `PR${pNum - 4}`;
      const clock = parsePbpClockRemaining(a?.clock) || String(a?.clock || "00:00");
      const clockSec = clockToSec(clock);
      let teamAbbr = String(a?.teamTricode || "").toUpperCase();
      if (!teamAbbr || (teamAbbr !== awayAbbr && teamAbbr !== homeAbbr)) {
        if (desc.includes(awayAbbr.toLowerCase())) teamAbbr = awayAbbr;
        else if (desc.includes(homeAbbr.toLowerCase())) teamAbbr = homeAbbr;
      }
      timeoutEvents.push({
        period: pNum,
        periodLabel,
        clock,
        clockSec,
        teamAbbr,
        description: String(a?.description || "").trim(),
      });
    }

    const scoringEvents = [];
    let currentAway = 0;
    let currentHome = 0;

    for (const a of actions) {
      const pNum = Number(a?.period) || 1;
      const periodLabel = pNum <= 4 ? `${pNum}Q` : pNum === 5 ? "PR" : `PR${pNum - 4}`;
      const clockRemaining = parsePbpClockRemaining(a?.clock) || String(a?.clock || "00:00");
      const teamAbbr = String(a?.teamTricode || "").toUpperCase();
      const desc = String(a?.description || "").trim();
      const playerName = String(a?.playerNameI || a?.playerName || "").trim();
      const parsedAway = Number(a?.scoreAway);
      const parsedHome = Number(a?.scoreHome);
      let ptsAdded = 0;
      if (Number.isFinite(parsedAway) && Number.isFinite(parsedHome) && (parsedAway > currentAway || parsedHome > currentHome)) {
        ptsAdded = (parsedAway - currentAway) + (parsedHome - currentHome);
        currentAway = Math.max(currentAway, parsedAway);
        currentHome = Math.max(currentHome, parsedHome);
      } else {
        const actType = String(a?.actionType || "").toLowerCase();
        const shotRes = String(a?.shotResult || "").toLowerCase();
        if (actType === "made" || shotRes === "made" || Number(a?.pointsTotal) > 0) {
          ptsAdded = Number(a?.pointsTotal) || 2;
          if (teamAbbr === awayAbbr) currentAway += ptsAdded;
          else if (teamAbbr === homeAbbr) currentHome += ptsAdded;
        }
      }

      if (ptsAdded > 0 && desc) {
        scoringEvents.push({
          period: pNum,
          periodLabel,
          clock: clockRemaining,
          teamAbbr,
          description: desc,
          playerName,
          points: ptsAdded,
          awayScore: currentAway,
          homeScore: currentHome,
        });
      }
    }

    if (scoringEvents.length === 0) return emptyRes;

    let bestRun = { scoringTeamAbbr: "", defendingTeamAbbr: "", runPoints: 0, opponentPoints: 0, periodLabel: "", startClock: "", endClock: "", summary: "", timeoutCalled: null };
    for (const team of [awayAbbr, homeAbbr]) {
      const oppTeam = team === awayAbbr ? homeAbbr : awayAbbr;
      let runPts = 0;
      let oppPts = 0;
      let startEv = scoringEvents[0];
      let endEv = scoringEvents[0];
      for (const ev of scoringEvents) {
        if (ev.teamAbbr === team) {
          if (runPts === 0) startEv = ev;
          runPts += ev.points;
          endEv = ev;
        } else if (ev.teamAbbr === oppTeam) {
          if (runPts > bestRun.runPoints && runPts >= 7) {
            bestRun = {
              scoringTeamAbbr: team,
              defendingTeamAbbr: oppTeam,
              runPoints: runPts,
              opponentPoints: oppPts,
              periodLabel: startEv.periodLabel,
              startClock: startEv.clock,
              endClock: endEv.clock,
              summary: `Parcial de ${runPts}-${oppPts} para ${team} en el ${startEv.periodLabel} (reloj ${startEv.clock} a ${endEv.clock})`,
              timeoutCalled: null,
            };
          }
          oppPts += ev.points;
          if (oppPts > 4) {
            runPts = 0;
            oppPts = 0;
          }
        }
      }
      if (runPts > bestRun.runPoints && runPts >= 7) {
        bestRun = {
          scoringTeamAbbr: team,
          defendingTeamAbbr: oppTeam,
          runPoints: runPts,
          opponentPoints: oppPts,
          periodLabel: startEv.periodLabel,
          startClock: startEv.clock,
          endClock: endEv.clock,
          summary: `Parcial de ${runPts}-${oppPts} para ${team} en el ${startEv.periodLabel} (reloj ${startEv.clock} a ${endEv.clock})`,
          timeoutCalled: null,
        };
      }
    }

    // Check if defending coach called a timeout during or immediately after the key run
    if (bestRun.runPoints >= 7) {
      const runStartSec = clockToSec(bestRun.startClock);
      const runEndSec = clockToSec(bestRun.endClock);
      const provokedTimeout = timeoutEvents.find((t) =>
        t.periodLabel === bestRun.periodLabel &&
        (t.teamAbbr === bestRun.defendingTeamAbbr || (!t.teamAbbr && t.clockSec <= runStartSec && t.clockSec >= runEndSec - 35)) &&
        t.clockSec <= runStartSec &&
        t.clockSec >= (runEndSec - 40)
      );
      if (provokedTimeout) {
        bestRun.timeoutCalled = {
          teamAbbr: bestRun.defendingTeamAbbr,
          periodLabel: provokedTimeout.periodLabel,
          clock: provokedTimeout.clock,
        };
        bestRun.summary = `Parcial de ${bestRun.runPoints}-${bestRun.opponentPoints} para ${bestRun.scoringTeamAbbr} en el ${bestRun.periodLabel} (reloj ${bestRun.startClock} a ${bestRun.endClock}) que obligó a parar el partido con tiempo muerto de ${bestRun.defendingTeamAbbr} (reloj ${provokedTimeout.clock})`;
      }
    }

    let lastLeadChange = null;
    const isWinningTeamHome = winnerAbbr === homeAbbr;
    for (let i = 0; i < scoringEvents.length; i++) {
      const ev = scoringEvents[i];
      const prevAway = i > 0 ? scoringEvents[i - 1].awayScore : 0;
      const prevHome = i > 0 ? scoringEvents[i - 1].homeScore : 0;
      const wasWinnerAhead = isWinningTeamHome ? prevHome > prevAway : prevAway > prevHome;
      const isWinnerAhead = isWinningTeamHome ? ev.homeScore > ev.awayScore : ev.awayScore > ev.homeScore;
      if (!wasWinnerAhead && isWinnerAhead) {
        let stayedAhead = true;
        for (let j = i + 1; j < scoringEvents.length; j++) {
          const futureEv = scoringEvents[j];
          const futureWinnerAhead = isWinningTeamHome ? futureEv.homeScore > futureEv.awayScore : futureEv.awayScore > futureEv.homeScore;
          if (!futureWinnerAhead) {
            stayedAhead = false;
            break;
          }
        }
        if (stayedAhead) {
          lastLeadChange = {
            winningTeamAbbr: winnerAbbr,
            periodLabel: ev.periodLabel,
            clock: ev.clock,
            playerScoreName: ev.playerName || ev.description,
            awayScore: ev.awayScore,
            homeScore: ev.homeScore,
            summary: `Canasta decisiva (${ev.playerName || ev.description}) a falta de ${ev.clock} del ${ev.periodLabel} (${ev.awayScore}-${ev.homeScore}) que dio a ${winnerAbbr} el liderazgo definitivo`,
          };
          break;
        }
      }
    }

    // Clutch = Last 5 minutes (300s) of 4Q or Overtime with margin <= 5
    const clutchPlays = [];
    for (const ev of scoringEvents) {
      if (ev.period >= 4) {
        const secsRemaining = clockToSec(ev.clock);
        const margin = Math.abs(ev.awayScore - ev.homeScore);
        if (secsRemaining <= 300 && margin <= 5) {
          clutchPlays.push({
            periodLabel: ev.periodLabel,
            clock: ev.clock,
            teamAbbr: ev.teamAbbr,
            description: ev.description,
            scoreMargin: margin,
          });
          if (clutchPlays.length >= 6) break;
        }
      }
    }

    // Individual consecutive player hot spurts
    const playerHotSpurts = [];
    let currentStreakPlayer = "";
    let currentStreak3PCount = 0;
    let currentStreakPts = 0;
    for (const ev of scoringEvents) {
      const is3P = /\b3pt\b|\btriple\b|\b3-pt\b/i.test(ev.description) || ev.points === 3;
      if (ev.playerName && ev.playerName === currentStreakPlayer) {
        if (is3P) currentStreak3PCount++;
        currentStreakPts += ev.points;
        if (currentStreak3PCount >= 3 || currentStreakPts >= 8) {
          playerHotSpurts.push({
            playerName: ev.playerName,
            teamAbbr: ev.teamAbbr,
            periodLabel: ev.periodLabel,
            clock: ev.clock,
            count3P: currentStreak3PCount,
            points: currentStreakPts,
            summary: currentStreak3PCount >= 3
              ? `${ev.playerName} (${ev.teamAbbr}) encadenó ${currentStreak3PCount} triples consecutivos en el ${ev.periodLabel} (reloj ${ev.clock})`
              : `${ev.playerName} (${ev.teamAbbr}) firmó una racha personal de ${currentStreakPts} puntos seguidos en el ${ev.periodLabel} (reloj ${ev.clock})`,
          });
          currentStreakPlayer = "";
          currentStreak3PCount = 0;
          currentStreakPts = 0;
        }
      } else {
        currentStreakPlayer = ev.playerName || "";
        currentStreak3PCount = is3P ? 1 : 0;
        currentStreakPts = ev.points;
      }
    }

    // Early foul trouble tracking (3rd foul in 1Q, 4th foul in 2Q / 1st half)
    const earlyFoulTroubles = [];
    const playerFoulMap = new Map();
    for (const a of actions) {
      const actType = String(a?.actionType || "").toLowerCase();
      const desc = String(a?.description || "").toLowerCase();
      const isFoul = actType === "foul" || desc.includes("foul") || desc.includes("falta");
      if (!isFoul) continue;
      const subType = String(a?.subType || "").toLowerCase();
      if (subType.includes("technical") || subType.includes("defense 3 second")) continue;

      const pid = String(a?.personId || a?.playerNameI || a?.playerName || "").trim();
      if (!pid) continue;
      const pName = String(a?.playerNameI || a?.playerName || pid).trim();
      const teamAbbr = String(a?.teamTricode || "").toUpperCase();
      const pNum = Number(a?.period) || 1;
      const clock = parsePbpClockRemaining(a?.clock) || String(a?.clock || "00:00");

      const entry = playerFoulMap.get(pid) || { fouls: 0, logged1Q: false, logged2Q: false };
      const explicitTotal = Number(a?.foulPersonalTotal);
      entry.fouls = Number.isFinite(explicitTotal) && explicitTotal > 0 ? explicitTotal : entry.fouls + 1;
      playerFoulMap.set(pid, entry);

      if (pNum === 1 && entry.fouls >= 3 && !entry.logged1Q) {
        entry.logged1Q = true;
        earlyFoulTroubles.push({
          playerName: pName,
          teamAbbr,
          periodLabel: "1Q",
          clock,
          foulCount: entry.fouls,
          summary: `${pName} (${teamAbbr}) cometió su 3ª falta en el 1er cuarto (reloj ${clock}) y tuvo que ir al banquillo tempranamente por acumulación de faltas`,
        });
      } else if (pNum === 2 && entry.fouls >= 4 && !entry.logged2Q) {
        entry.logged2Q = true;
        earlyFoulTroubles.push({
          playerName: pName,
          teamAbbr,
          periodLabel: "2Q",
          clock,
          foulCount: entry.fouls,
          summary: `${pName} (${teamAbbr}) cargó con su 4ª falta en el 2º cuarto (reloj ${clock}) condicionando su presencia antes del descanso`,
        });
      }
    }

    // Clutch Execution in the final 2 minutes (120s) of 4Q or Overtime when margin <= 5 pts
    let isClutchGame = false;
    for (const ev of scoringEvents) {
      if (ev.period >= 4) {
        const sec = clockToSec(ev.clock);
        const margin = Math.abs(ev.awayScore - ev.homeScore);
        if (sec <= 120 && margin <= 5) {
          isClutchGame = true;
          break;
        }
      }
    }
    if (!isClutchGame && scoringEvents.length > 0) {
      const lastEv = scoringEvents[scoringEvents.length - 1];
      if (Math.abs(lastEv.awayScore - lastEv.homeScore) <= 5) {
        isClutchGame = true;
      }
    }

    let clutchExecution = null;
    if (isClutchGame) {
      const clutchStats = {
        [awayAbbr]: { teamAbbr: awayAbbr, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, points: 0, turnovers: 0, playerShots: new Map() },
        [homeAbbr]: { teamAbbr: homeAbbr, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, points: 0, turnovers: 0, playerShots: new Map() },
      };

      for (const a of actions) {
        const pNum = Number(a?.period) || 1;
        if (pNum < 4) continue;
        const clock = parsePbpClockRemaining(a?.clock) || String(a?.clock || "00:00");
        const sec = clockToSec(clock);
        if (sec > 120) continue;

        const actType = String(a?.actionType || "").toLowerCase();
        const subType = String(a?.subType || "").toLowerCase();
        const shotResult = String(a?.shotResult || "").toLowerCase();
        const desc = String(a?.description || "").trim();
        const descLow = desc.toLowerCase();
        let teamAbbr = String(a?.teamTricode || "").toUpperCase();
        if (!teamAbbr || (teamAbbr !== awayAbbr && teamAbbr !== homeAbbr)) {
          if (descLow.includes(awayAbbr.toLowerCase())) teamAbbr = awayAbbr;
          else if (descLow.includes(homeAbbr.toLowerCase())) teamAbbr = homeAbbr;
        }
        if (teamAbbr !== awayAbbr && teamAbbr !== homeAbbr) continue;

        const teamObj = clutchStats[teamAbbr];
        const rawPlayer = String(a?.playerNameI || a?.playerName || "").trim();
        const pName = rawPlayer || (desc.split(" ")[0] || "Equipo");
        const pEntry = teamObj.playerShots.get(pName) || { name: pName, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, points: 0, turnovers: 0 };

        const is3P = actType === "3pt" || subType.includes("3pt") || descLow.includes("3pt") || descLow.includes("triple") || descLow.includes("3-pt");
        const isFT = actType.includes("freethrow") || descLow.includes("free throw") || descLow.includes("tiro libre");
        const isTurnover = actType.includes("turnover") || descLow.includes("turnover") || descLow.includes("pérdida") || descLow.includes("bad pass") || descLow.includes("lost ball") || descLow.includes("traveling") || descLow.includes("offensive foul");
        const isMade = shotResult === "made" || descLow.includes("makes") || actType === "made" || Number(a?.pointsTotal) > 0;
        const isMissed = shotResult === "missed" || descLow.includes("misses") || descLow.includes("falla");

        if (isTurnover) {
          teamObj.turnovers++;
          pEntry.turnovers++;
        } else if (isFT) {
          teamObj.fta++;
          pEntry.fta++;
          if (isMade) {
            teamObj.ftm++;
            teamObj.points += 1;
            pEntry.ftm++;
            pEntry.points += 1;
          }
        } else if (isMade || isMissed || actType === "2pt" || actType === "3pt" || actType === "shot") {
          teamObj.fga++;
          pEntry.fga++;
          if (is3P) {
            teamObj.fg3a++;
            pEntry.fg3a++;
          }
          if (isMade) {
            const pts = is3P ? 3 : 2;
            teamObj.fgm++;
            teamObj.points += pts;
            pEntry.fgm++;
            pEntry.points += pts;
            if (is3P) {
              teamObj.fg3m++;
              pEntry.fg3m++;
            }
          }
        }
        teamObj.playerShots.set(pName, pEntry);
      }

      const totalClutchFga = clutchStats[awayAbbr].fga + clutchStats[homeAbbr].fga;
      const totalClutchTov = clutchStats[awayAbbr].turnovers + clutchStats[homeAbbr].turnovers;

      if (totalClutchFga > 0 || totalClutchTov > 0) {
        const winnerStats = clutchStats[winnerAbbr] || { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, points: 0, turnovers: 0, playerShots: new Map() };
        const loserStats = clutchStats[loserAbbr] || { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, points: 0, turnovers: 0, playerShots: new Map() };

        const winnerPlayers = Array.from(winnerStats.playerShots.values())
          .filter((p) => p.fga > 0 || p.points > 0 || p.turnovers > 0)
          .sort((a, b) => (b.points * 2 + b.fgm) - (a.points * 2 + a.fgm));

        const loserPlayers = Array.from(loserStats.playerShots.values())
          .filter((p) => p.fga > 0 || p.points > 0 || p.turnovers > 0)
          .sort((a, b) => (b.points * 2 + b.fgm + b.turnovers) - (a.points * 2 + a.fgm + a.turnovers));

        const winnerDetail = winnerPlayers.slice(0, 2).map((p) =>
          `${p.name} (${p.fgm}/${p.fga} TC${p.fg3m > 0 ? `, ${p.fg3m} T3` : ""}${p.points > 0 ? `, ${p.points} pts` : ""})`
        ).join(" y ");

        const loserDetail = loserPlayers.slice(0, 2).map((p) =>
          `${p.name} (${p.fgm}/${p.fga} TC${p.turnovers > 0 ? `, ${p.turnovers} PER` : ""}${p.points > 0 ? `, ${p.points} pts` : ""})`
        ).join(" y ");

        const finalTimeout = timeoutEvents.find((t) => t.period >= 4 && t.clockSec <= 35);

        const winnerLine = `${winnerAbbr} ejecutó con ${winnerStats.fgm}/${winnerStats.fga} en tiros de campo (${winnerStats.points} pts${winnerStats.fg3m > 0 ? `, ${winnerStats.fg3m} triple(s)` : ""}) y ${winnerStats.turnovers === 0 ? "cero pérdidas" : `${winnerStats.turnovers} pérdida(s)`}${winnerDetail ? ` liderado por ${winnerDetail}` : ""}`;
        const loserLine = `${loserAbbr} firmó ${loserStats.fgm}/${loserStats.fga} TC (${loserStats.points} pts) y ${loserStats.turnovers > 0 ? `${loserStats.turnovers} pérdida(s) crítica(s)` : "cero pérdidas"}${loserDetail ? ` (${loserDetail})` : ""}`;

        let summaryNarrative = `En los dos minutos finales con el partido en el alambre (margen ≤5 pts), ${winnerLine}, mientras que ${loserLine}`;
        if (finalTimeout) {
          summaryNarrative += `, tras un tiempo muerto solicitado por ${finalTimeout.teamAbbr} a falta de ${finalTimeout.clock} para diseñar la posesión definitiva`;
        }

        clutchExecution = {
          isClutchGame: true,
          summaryNarrative,
          breakdownLine: `${winnerAbbr}: ${winnerStats.fgm}/${winnerStats.fga} TC, ${winnerStats.points} PTS, ${winnerStats.turnovers} PER (${winnerDetail || "sin tiros"}) | ${loserAbbr}: ${loserStats.fgm}/${loserStats.fga} TC, ${loserStats.points} PTS, ${loserStats.turnovers} PER (${loserDetail || "sin tiros"})`,
          winner: { teamAbbr: winnerAbbr, ...winnerStats },
          loser: { teamAbbr: loserAbbr, ...loserStats },
          finalTimeout: finalTimeout ? { teamAbbr: finalTimeout.teamAbbr, clock: finalTimeout.clock } : null,
        };
      }
    }

    const keyRun = bestRun.runPoints >= 7 ? bestRun : null;
    const lines = [];
    if (keyRun) lines.push(`- PARCIAL MÁXIMO INDEXADO E INTERVENCIÓN TÁCTICA: ${keyRun.summary}`);
    if (lastLeadChange) lines.push(`- PUNTO DE QUIEBRE Y VENTAJA DEFINITIVA: ${lastLeadChange.summary}`);
    if (clutchExecution && clutchExecution.isClutchGame && clutchExecution.summaryNarrative) {
      lines.push(`- EJECUCIÓN CLUTCH EN LOS 2 MINUTOS FINALES (MARGEN ≤5 PTS): ${clutchExecution.summaryNarrative}`);
      if (clutchExecution.breakdownLine) lines.push(`  * Reparto de tiros y pérdidas: ${clutchExecution.breakdownLine}`);
    }
    if (playerHotSpurts.length > 0) lines.push(`- RÁFAGAS Y TRIPLES CONSECUTIVOS DE JUGADOR: ${playerHotSpurts.map((s) => s.summary).join("; ")}`);
    if (earlyFoulTroubles.length > 0) lines.push(`- PROBLEMAS DE FALTAS TEMPRANAS EN TITULARES/ROTACIÓN (1Q/2Q): ${earlyFoulTroubles.map((e) => e.summary).join("; ")}`);
    if (clutchPlays.length > 0 && (!clutchExecution || !clutchExecution.isClutchGame)) {
      lines.push(`- ACCIONES CLUTCH (ÚLTIMOS 5 MIN ≤5 PTS): ${clutchPlays.map((c) => `[${c.periodLabel} ${c.clock}] ${c.teamAbbr}: ${c.description} (margen ${c.scoreMargin} pts)`).join("; ")}`);
    }

    return {
      keyRun,
      breakpoint: lastLeadChange,
      clutchPlays,
      clutchExecution,
      playerHotSpurts,
      earlyFoulTroubles,
      formattedDossierBlock: lines.join("\n"),
    };
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
    const staticSched = STATIC_SCHEDULE_2027.find((s) => s.gameId === eventId) || scheduleGames.find((s) => s.gameId === eventId);
    for (const t of full.teams) {
      const g = t.games.find((x) => x.eventId === eventId);
      if (g) {
        const isHome = staticSched ? t.abbreviation === staticSched.homeAbbr : g.isHome;
        if (isHome) {
          homeTeamObj = t;
          homeLog = { ...g, isHome: true };
        } else {
          awayTeamObj = t;
          awayLog = { ...g, isHome: false };
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

    const cdnAwayPeriods = Array.isArray(cdnGame?.awayTeam?.periods) ? cdnGame.awayTeam.periods : [];
    const cdnHomePeriods = Array.isArray(cdnGame?.homeTeam?.periods) ? cdnGame.homeTeam.periods : [];

    let espnEventData = null;
    if (cdnAwayPeriods.length === 0 || cdnHomePeriods.length === 0 || !cdnGame?.attendance || !cdnGame?.officials?.length) {
      try {
        const yyyymmdd = gameDate.replace(/-/g, "");
        const sbData = await deps.cachedFetchJson(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`,
          15 * 60 * 1000,
          {},
          6500,
          forceRefresh
        );
        const events = Array.isArray(sbData?.events) ? sbData.events : [];
        for (const ev of events) {
          const comp = ev?.competitions?.[0];
          const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const awayComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") === awayAbbr);
          const homeComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") === homeAbbr);
          if (awayComp && homeComp) {
            espnEventData = {
              evId: String(ev?.id || ""),
              awayLinescores: Array.isArray(awayComp.linescores) ? awayComp.linescores : [],
              homeLinescores: Array.isArray(homeComp.linescores) ? homeComp.linescores : [],
              attendance: Number(comp?.attendance) || 0,
              officials: Array.isArray(comp?.officials)
                ? comp.officials.map((o) => String(o?.fullName || o?.displayName || o?.name || "").trim()).filter(Boolean)
                : [],
              venueName: String(comp?.venue?.fullName || "").trim(),
              venueCity: String(comp?.venue?.address?.city || "").trim(),
            };
            break;
          }
        }
      } catch (err) {
        console.warn(`ESPN Scoreboard fallback for ${gameDate} ${awayAbbr}@${homeAbbr}:`, err);
      }
    }

    const fallbackArena = NBA_TEAM_ARENAS[homeAbbr] || { arenaName: `Pabellón de ${homeTeamObj.shortName}`, arenaCity: homeTeamObj.name };
    const arenaName = String(cdnGame?.arena?.arenaName || "").trim() || String(espnEventData?.venueName || "").trim() || fallbackArena.arenaName;
    const arenaCity = String(cdnGame?.arena?.arenaCity || "").trim() || String(espnEventData?.venueCity || "").trim() || fallbackArena.arenaCity;
    const rawAttendance = Number(cdnGame?.attendance) || Number(espnEventData?.attendance) || 0;
    const attendance = rawAttendance > 0 ? rawAttendance : null;
    const attendanceFormatted = attendance !== null ? `${formatThousandsEs(attendance)} espectadores` : "Aforo oficial NBA";
    const rawDuration = Number(cdnGame?.duration) || 0;
    const durationMinutes = rawDuration > 0 ? rawDuration : 135;
    const cdnOfficials = Array.isArray(cdnGame?.officials) ? cdnGame.officials.map((o) => String(o?.name || "").trim()).filter(Boolean) : [];
    const officials = cdnOfficials.length > 0 ? cdnOfficials : (espnEventData?.officials || []);

    const periods = [];
    if (cdnAwayPeriods.length > 0 && cdnHomePeriods.length > 0) {
      const maxLen = Math.max(cdnAwayPeriods.length, cdnHomePeriods.length);
      for (let i = 0; i < maxLen; i++) {
        const ap = cdnAwayPeriods[i];
        const hp = cdnHomePeriods[i];
        const pNum = Number(ap?.period || hp?.period || i + 1);
        const isOt = pNum > 4 || String(ap?.periodType || "").toUpperCase() === "OVERTIME";
        const otIdx = pNum - 4;
        periods.push({ period: pNum, label: isOt ? (maxLen > 5 ? `PR${otIdx}` : "PR") : `${pNum}Q`, isOvertime: isOt, awayScore: Number(ap?.score) || 0, homeScore: Number(hp?.score) || 0 });
      }
    } else if (espnEventData && espnEventData.awayLinescores.length > 0 && espnEventData.homeLinescores.length > 0) {
      const maxLen = Math.max(espnEventData.awayLinescores.length, espnEventData.homeLinescores.length);
      for (let i = 0; i < maxLen; i++) {
        const ap = espnEventData.awayLinescores[i];
        const hp = espnEventData.homeLinescores[i];
        const pNum = i + 1;
        const isOt = pNum > 4;
        const otIdx = pNum - 4;
        periods.push({ period: pNum, label: isOt ? (maxLen > 5 ? `PR${otIdx}` : "PR") : `${pNum}Q`, isOvertime: isOt, awayScore: Number(ap?.value) || 0, homeScore: Number(hp?.value) || 0 });
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
    const [foulOutTimings, awayNextGame, homeNextGame, pbpHighlights] = await Promise.all([
      fetchPlayByPlayFoulOuts(eventId, fouledOutIds, seasonLabel, forceRefresh),
      resolveTeamNextGameInfo({ currentEventId: eventId, teamObj: awayTeamObj, recordAfter: awaySide.recordAfter, fullTeams: full.teams, gameDate, seasonLabel, scheduleGames, forceRefresh }),
      resolveTeamNextGameInfo({ currentEventId: eventId, teamObj: homeTeamObj, recordAfter: homeSide.recordAfter, fullTeams: full.teams, gameDate, seasonLabel, scheduleGames, forceRefresh }),
      fetchPlayByPlayHighlights(eventId, awayAbbr, homeAbbr, winnerAbbr, seasonLabel, forceRefresh),
    ]);
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
              item.note = `Expulsado por 6 faltas en el ${timing.periodLabel} a falta de ${timing.clockRemaining} (${timing.gameTimeLeft}${timing.fifthFoulDetail})${statTail}`;
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
    const report = { eventId, date: gameDate, seasonLabel, pasoBTitle, arenaName, arenaCity, attendance, attendanceFormatted, durationMinutes, officials, isOvertime, overtimeCount, decisivePeriodLabel, leadChanges, timesTied, leagueAvgPace, paceDiffVsLeague, periods, away: awaySide, home: homeSide, spanishPlayersReport: { hasSpanishPlayers, summaryLine: spanishSummaryLine, details: spanishDetails }, milestonesList, teamComparisonRows, leaderComparisonRows, pbpHighlights };
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
    let quarterNarrative = report.periods.length >= 4 ? `El guion por parciales (${report.periods.map((p) => `${p.label}: ${p.awayScore}-${p.homeScore}`).join(", ")}) **encontr\xF3 su punto de ruptura definitivo en ${report.decisivePeriodLabel}**${report.leadChanges !== null ? `, tras un intercambio t\xE1ctico con ${report.leadChanges} cambios de mando y ${report.timesTied ?? 0} empates` : ""}, disput\xE1ndose a un ritmo de ${wt.pace.toFixed(1)} posesiones (${paceSignStr} frente a las ${report.leagueAvgPace.toFixed(1)} de media NBA esta temporada).` : `El encuentro entre **${report.away.shortName}** y **${report.home.shortName}** se defini\xF3 por una renta final de ${margin} tantos (${report.away.score}-${report.home.score}), **imponiendo el control del ritmo competitivo** con ${wt.pace.toFixed(1)} posesiones (${paceSignStr} respecto a las ${report.leagueAvgPace.toFixed(1)} de promedio NBA).`;
    if (report.pbpHighlights?.breakpoint?.summary) {
      quarterNarrative += ` ${report.pbpHighlights.breakpoint.summary}.`;
    }

    let dynamicSpotlight = null;
    if (report.isOvertime) {
      dynamicSpotlight = { title: "Tiempo extra bajo máxima presión", body: `El choque exigió ${report.overtimeCount > 1 ? `${report.overtimeCount} prórrogas` : "cinco minutos suplementarios"} tras agotarse el tiempo reglamentario en máxima igualdad, poniendo a prueba las piernas de los titulares y **premiando la ejecución en media pista** de **${winner.shortName}** frente a **${loser.shortName}**.` };
    } else if (report.pbpHighlights?.clutchExecution?.isClutchGame && margin <= 4) {
      dynamicSpotlight = {
        title: "Duelo táctico en los dos minutos finales",
        body: `Con el electrónico comprimido en una o dos posesiones, **la lucidez en la toma de decisiones al límite** dictó sentencia entre **${winner.shortName}** y **${loser.shortName}**. ${report.pbpHighlights.clutchExecution.summaryNarrative}.`,
      };
    } else if (Math.abs(wt.benchPoints - lt.benchPoints) >= 16) {
      const benchWinner = wt.benchPoints > lt.benchPoints ? winner.shortName : loser.shortName;
      dynamicSpotlight = { title: `Desequilibrio en los tramos de segunda unidad`, body: `La brecha de banquillos (${wt.benchPoints}-${lt.benchPoints} en puntos de suplentes) **alteró los minutos de descanso titular**, dando aire constante a la rotación de **${benchWinner}**.` };
    }

    let runAndClutchProse = wt.biggestLead !== null && wt.biggestRun !== null ? `**${winner.shortName}** llegó a estirar su ventaja máxima hasta los +${wt.biggestLead} puntos gracias a una racha de ${wt.biggestRun}-0 que **desarmó el balance defensivo rival**, sabiendo administrar las posesiones finales ante **${loser.shortName}** sin conceder segundas vidas.` : `En el tramo decisivo, **la gestión quirúrgica del tempo ofensivo** (${wt.offRtg.toFixed(1)} de eficiencia ofensiva frente a ${lt.offRtg.toFixed(1)}) permitió a **${winner.shortName}** blindar el electrónico frente a **${loser.shortName}**.`;
    if (report.pbpHighlights?.keyRun?.summary) {
      runAndClutchProse += ` El flujo anotador quedó marcado por el ${report.pbpHighlights.keyRun.summary}.`;
    }
    if (dynamicSpotlight?.title?.includes("dos minutos finales")) {
      runAndClutchProse += ` En los compases finales con el marcador en un puño, **${winner.shortName}** impuso su temple en cada posesión para no ceder el liderato ante el empuje de **${loser.shortName}**.`;
    } else if (report.pbpHighlights?.clutchExecution?.isClutchGame && report.pbpHighlights.clutchExecution.summaryNarrative) {
      runAndClutchProse += ` ${report.pbpHighlights.clutchExecution.summaryNarrative}.`;
    } else if (report.pbpHighlights?.clutchPlays && report.pbpHighlights.clutchPlays.length > 0) {
      const clutchSummary = report.pbpHighlights.clutchPlays.slice(0, 3).map((c) => `[${c.periodLabel} ${c.clock}] ${c.description}`).join("; ");
      runAndClutchProse += ` En los minutos calientes del clutch, destacaron estas acciones clave: ${clutchSummary}.`;
    }

    const paintAndThreeBattle = wt.ptsPaint !== null && lt.ptsPaint !== null ? `En la pizarra de espacios, **${winner.name}** **dominó la selección de tiro interior y exterior** con un ${wt.efgPct.toFixed(1)}% en tiro efectivo (${wt.fg3m}/${wt.fg3a} en triples) y ${wt.ptsPaint} puntos en la pintura frente a los ${lt.ptsPaint} de **${loser.shortName}**, mientras que en el rebote el pulso cerró ${wt.reb}-${lt.reb} (${wt.oreb} capturas ofensivas del ganador por ${lt.oreb} del rival).` : `En el pulso de los Cuatro Factores, **${winner.name}** **marcó diferencias desde la eficiencia real de tiro** con un ${wt.efgPct.toFixed(1)}% de acierto efectivo (${wt.fg3m}/${wt.fg3a} desde el perímetro) frente al ${lt.efgPct.toFixed(1)}% de **${loser.name}**, acompañando el acierto con un balance reboteador de ${wt.reb}-${lt.reb}.`;
    const isNonTechnicalAbsence = __name((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague", "isNonTechnicalAbsence");
    const awayMedAbs = report.away.absencesAndDnp.filter(isNonTechnicalAbsence);
    const homeMedAbs = report.home.absencesAndDnp.filter(isNonTechnicalAbsence);
    const benchAndAbsences = `La rotación de segunda unidad aportó ${wt.benchPoints} puntos en **${winner.shortName}** por ${lt.benchPoints} del banquillo de **${loser.shortName}**${wt.ptsFastBreak !== null && lt.ptsFastBreak !== null ? `, **castigando cada pérdida a campo abierto** con un parcial de ${wt.ptsFastBreak}-${lt.ptsFastBreak} al contraataque y ${wt.ptsOffTov ?? 0} tantos tras las ${lt.tov} pérdidas rivales` : `, **penalizando los errores en el manejo** tras las ${lt.tov} pérdidas de **${loser.shortName}**`}.${awayMedAbs.length > 0 || homeMedAbs.length > 0 ? ` Las rotaciones estuvieron condicionadas por el parte oficial de bajas e incidencias: ${[...awayMedAbs.map((a) => `**${a.name}** (${report.away.abbr} · ${a.statusLabel || "Baja"}: ${a.note})`), ...homeMedAbs.map((a) => `**${a.name}** (${report.home.abbr} · ${a.statusLabel || "Baja"}: ${a.note})`)].slice(0, 4).join("; ")}.` : ""}`;
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
        if (!(cached.data.engineMode === 'empirical_fallback' && getGeminiClient())) {
          return cached.data;
        }
      }
    }
    const existing = reportInflight.get(cacheKey);
    if (existing) {
      return existing;
    }
    const startTime = Date.now();
    const promise = (async () => {
      const isServerless =
        Boolean(process.env.VERCEL) ||
        Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
        process.env.NBA_SNAPSHOT_ONLY === "1";
      const report = await buildGameOfficialReportData(eventId, forceRefresh);
      if (!getGeminiClient()) {
        const fallback = buildDeterministicGameNarrative(report);
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = true;
        return fallback;
      }
      let pressCtx = { byMatchup: new Map(), globalNotes: [] };
      try {
        const pressTimeoutMs = isServerless ? 4000 : 7000;
        pressCtx = (await Promise.race([
          fetchLivePressContext(report.date, forceRefresh),
          new Promise((resolve) =>
            setTimeout(() => resolve({ byMatchup: new Map(), globalNotes: [] }), pressTimeoutMs)
          ),
        ])) as any;
      } catch {
        pressCtx = { byMatchup: new Map(), globalNotes: [] };
      }
      const matchPress = pressCtx.byMatchup.get(`${report.away.abbr}@${report.home.abbr}`);
      const seedSources = [{ uri: `https://www.nba.com/game/${report.away.abbr.toLowerCase()}-vs-${report.home.abbr.toLowerCase()}-${report.eventId}/box-score`, title: `NBA.com Acta Oficial \u2014 ${report.away.abbr} vs ${report.home.abbr}` }, { uri: `https://www.nba.com/game/${report.away.abbr.toLowerCase()}-vs-${report.home.abbr.toLowerCase()}-${report.eventId}/play-by-play`, title: `NBA.com Play-by-Play \u2014 ${report.away.abbr} vs ${report.home.abbr}` }, ...matchPress?.sources || []];
      const formatPlayerDossier = __name((p) => `#${p.jersey} ${p.name} (${p.position}, ${p.isStarter ? "Titular" : "Suplente"}): ${p.points} PTS, ${p.rebounds} REB (${p.oreb} OR), ${p.assists} AST, ${p.steals} ROB, ${p.blocks} TAP, ${p.turnovers} PER, ${p.fgm}/${p.fga} TC, ${p.fg3m}/${p.fg3a} T3, ${p.ftm}/${p.fta} TL, ${p.minutesFormatted} MIN, +/- ${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}, GmSc ${p.gameScore.toFixed(1)}${p.tripleDouble ? " [TRIPLE-DOBLE]" : p.doubleDouble ? " [DOBLE-DOBLE]" : ""}`, "formatPlayerDossier");
      const verifiedGamePlayers = [...report.away.starters.map((p) => p.name), ...report.away.bench.map((p) => p.name), ...report.away.absencesAndDnp.map((p) => p.name), ...report.home.starters.map((p) => p.name), ...report.home.bench.map((p) => p.name), ...report.home.absencesAndDnp.map((p) => p.name)];
      const dossier = [`AVISO CR\xCDTICO DE MUNDO CERRADO: Fecha real del encuentro ${report.date} (Temporada ${report.seasonLabel}). Tu memoria interna de entrenamiento est\xE1 desactualizada varios a\xF1os respecto a entrenadores actuales, traspasos, contratos y palmar\xE9s. NO des NING\xDAN dato por supuesto fuera de los hechos expl\xEDcitos de este dossier.`, `PARTIDO OFICIAL NBA (${report.date} \xB7 Temporada ${report.seasonLabel}):`, `T\xCDTULO: ${report.pasoBTitle}`, `PARCIALES POR CUARTOS: ${report.periods.length > 0 ? report.periods.map((p) => `${p.label} (${report.away.abbr} ${p.awayScore} - ${p.homeScore} ${report.home.abbr})`).join(" | ") : "Sin desglose parcial"} \xB7 Tramo clave: ${report.decisivePeriodLabel}`, `FLUJO DE MARCADOR: Cambios de l\xEDder=${report.leadChanges ?? "No consta"}, Empates=${report.timesTied ?? "No consta"}, M\xE1xima ventaja ${report.away.abbr}=+${report.away.totals.biggestLead ?? 0} (mejor parcial ${report.away.totals.biggestRun ?? 0}-0), M\xE1xima ventaja ${report.home.abbr}=+${report.home.totals.biggestLead ?? 0} (mejor parcial ${report.home.totals.biggestRun ?? 0}-0).`, `RITMO DEL ENCUENTRO (PACE VS MEDIA NBA): ${report.away.totals.pace.toFixed(1)} posesiones/48m (${report.paceDiffVsLeague >= 0 ? `+${report.paceDiffVsLeague.toFixed(1)}` : report.paceDiffVsLeague.toFixed(1)} frente al promedio oficial NBA ${report.seasonLabel} de ${report.leagueAvgPace.toFixed(1)} posesiones).`, matchPress && matchPress.notes.length > 0 ? `TELETIPO DE PRENSA DE ESTE PARTIDO (${report.date}): ${matchPress.notes.join(" | ")}` : "", report.pbpHighlights?.formattedDossierBlock ? `HITOS PLAY-BY-PLAY (DATOS INDEXADOS EN VIVO EN PISTA):\n${report.pbpHighlights.formattedDossierBlock}` : "", ``, `ESTAD\xCDSTICAS COLECTIVAS:`, `- VISITANTE ${report.away.name} (${report.away.abbr}, r\xE9cord ${report.away.recordAfter}${report.away.isBackToBack ? ", en Back-to-Back" : ""}): ${report.away.score} PTS | ${report.away.totals.fgm}/${report.away.totals.fga} TC (${report.away.totals.fgPct}%) | ${report.away.totals.fg3m}/${report.away.totals.fg3a} T3 (${report.away.totals.fg3Pct}%) | ${report.away.totals.ftm}/${report.away.totals.fta} TL | ${report.away.totals.reb} REB (${report.away.totals.oreb} OR) | ${report.away.totals.ast} AST | ${report.away.totals.stl} ROB | ${report.away.totals.blk} TAP | ${report.away.totals.tov} PER | OffRtg ${report.away.totals.offRtg} | eFG% ${report.away.totals.efgPct}% | Pintura: ${report.away.totals.ptsPaint ?? "s/d"} | Contraataque: ${report.away.totals.ptsFastBreak ?? "s/d"} | Tras p\xE9rdida: ${report.away.totals.ptsOffTov ?? "s/d"} | 2\xAA jugada: ${report.away.totals.ptsSecondChance ?? "s/d"} | Banquillo: ${report.away.totals.benchPoints} PTS.`, `- LOCAL ${report.home.name} (${report.home.abbr}, r\xE9cord ${report.home.recordAfter}${report.home.isBackToBack ? ", en Back-to-Back" : ""}): ${report.home.score} PTS | ${report.home.totals.fgm}/${report.home.totals.fga} TC (${report.home.totals.fgPct}%) | ${report.home.totals.fg3m}/${report.home.totals.fg3a} T3 (${report.home.totals.fg3Pct}%) | ${report.home.totals.ftm}/${report.home.totals.fta} TL | ${report.home.totals.reb} REB (${report.home.totals.oreb} OR) | ${report.home.totals.ast} AST | ${report.home.totals.stl} ROB | ${report.home.totals.blk} TAP | ${report.home.totals.tov} PER | OffRtg ${report.home.totals.offRtg} | eFG% ${report.home.totals.efgPct}% | Pintura: ${report.home.totals.ptsPaint ?? "s/d"} | Contraataque: ${report.home.totals.ptsFastBreak ?? "s/d"} | Tras p\xE9rdida: ${report.home.totals.ptsOffTov ?? "s/d"} | 2\xAA jugada: ${report.home.totals.ptsSecondChance ?? "s/d"} | Banquillo: ${report.home.totals.benchPoints} PTS.`, ``, `PLANTILLA ${report.away.abbr} EN PISTA:`, ...[...report.away.starters, ...report.away.bench].map(formatPlayerDossier), `BAJAS M\xC9DICAS / LESIONADOS E INCIDENCIAS EN PISTA ${report.away.abbr}: ${report.away.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").length > 0 ? report.away.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Lesionado"} \u2014 ${a.note}]`).join("; ") : "Ninguna baja m\xE9dica ni incidencia registrada"}`, `SIN MINUTOS POR DECISI\xD3N T\xC9CNICA / G-LEAGUE ${report.away.abbr}: ${report.away.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").length > 0 ? report.away.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Decisi\xF3n t\xE9cnica"} \u2014 ${a.note}]`).join("; ") : "Ninguno"}`, ``, `PLANTILLA ${report.home.abbr} EN PISTA:`, ...[...report.home.starters, ...report.home.bench].map(formatPlayerDossier), `BAJAS M\xC9DICAS / LESIONADOS E INCIDENCIAS EN PISTA ${report.home.abbr}: ${report.home.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").length > 0 ? report.home.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Lesionado"} \u2014 ${a.note}]`).join("; ") : "Ninguna baja m\xE9dica ni incidencia registrada"}`, `SIN MINUTOS POR DECISI\xD3N T\xC9CNICA / G-LEAGUE ${report.home.abbr}: ${report.home.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").length > 0 ? report.home.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Decisi\xF3n t\xE9cnica"} \u2014 ${a.note}]`).join("; ") : "Ninguno"}`, ``, `DETECTOR OFICIAL DE JUGADORES ESPA\xD1OLES: ${report.spanishPlayersReport.summaryLine}`, `DOBLES-DOBLES Y TRIPLES-DOBLES VERIFICADOS: ${report.milestonesList.length > 0 ? report.milestonesList.map((m) => `${m.type}: ${m.detail}`).join(" | ") : "Ninguno en este encuentro"}`, `PODIO CALCULADO: ${report.away.abbr} (${report.away.podium.map((p) => `${"\u2B50".repeat(p.stars)} #${p.jersey} ${p.name}`).join(" | ")}) // ${report.home.abbr} (${report.home.podium.map((p) => `${"\u2B50".repeat(p.stars)} #${p.jersey} ${p.name}`).join(" | ")})`].filter(Boolean).join("\n");
      const systemInstruction = [
        "Eres un periodista sénior de prensa deportiva española y scout táctico profesional de la NBA (estilo The Athletic, Gigantes del Basket y NBAManiacs).",
        "REGLAS INQUEBRANTABLES DE RIGOR Y MUNDO CERRADO (CERO DATOS POR SUPUESTOS):",
        '1. RIGOR EMPÍRICO ABSOLUTO: Usa EXCLUSIVAMENTE las cifras estadísticas exactas, el pabellón oficial indicado en TÍTULO y la información explícita del dossier adjunto. Jamás inventes puntos, rebotes, parciales, jugadas concretas segundo a segundo (ej. "triple desde la esquina a falta de 2 segundos") ni dorsales que no figuren en el acta.',
        '2. PROHIBICI\xD3N TOTAL DE DAR DATOS POR SUPUESTOS O USAR MEMORIA PREENTRENADA: Tu conocimiento interno previo está desactualizado respecto a la temporada actual. Tienes TERMINANTEMENTE PROHIBIDO dar por supuesto o mencionar: (a) nombres propios o apodos de entrenadores, asistentes o directivos (ej. Tom Thibodeau dejó los NY Knicks hace años; NUNCA cites nombres de entrenadores, usa SIEMPRE "el cuerpo técnico de [Equipo]", "la dirección técnica de [Equipo]" o "la pizarra de [Equipo]"); (b) antigüedad, edad, rondas de Draft, condición de rookie, contratos, exequipos o traspasos de jugadores; (c) premios pasados, anillos, "vigente campeón" o series de temporadas anteriores; (d) puestos exactos en la tabla clasificatoria (ej. "3º del Este") o próximos rivales del calendario; (e) diagnósticos médicos o plazos de recuperación más allá de la nota literal del dossier.',
        '3. PULCRITUD EN BAJAS (LESIÓN VS DECISIÓN TÉCNICA) Y RITMO: Al mencionar ausencias o jugadores sin minutos en PIZARRA_Y_ROTACION o ESPANOLES, sé escrupulosamente pulcro distinguiendo entre quienes causaron baja por lesión / parte médico (bloque BAJAS MÉDICAS / LESIONADOS) y quienes no participaron por decisión técnica o asignación a G-League (bloque SIN MINUTOS POR DECISIÓN TÉCNICA). Jamás llames "lesionado" a un descarte por decisión técnica ni viceversa. Integra también el Pace frente a la media oficial NBA y, si hubo expulsados por 6 faltas, cita cuarto y reloj exactos.',
        "4. REDACCIÓN 100% NATURAL Y HUMANA: Escribe en español de España fluido, con vocabulario táctico auténtico (espaciado, pintura, bloqueo directo, ajuste tras descanso, transición defensiva, segunda unidad, rebote ofensivo, clutch).",
        '5. CERO CLICHÉS NI RELLENO: Prohibido usar "En conclusión", "Cabe destacar", "Sin lugar a dudas", "Sin duda" o metatexto. Redacta párrafos cohesivos, sin listas de viñetas ni tablas Markdown.',
        '6. JERARQUÍA VISUAL Y ÉNFASIS EN NEGRITA (**...**): En todos los párrafos del cuerpo (ENTRADILLA, GUION_Y_QUIEBRE, PIZARRA_Y_ROTACION, cuerpo de FOCO_ESPECIAL, FACTOR_X_Y_LIDERES, ESPANOLES y VEREDICTO_E_HITOS), utiliza negrita Markdown (**texto**) EXCLUSIVAMENTE para estos tres elementos: (a) nombres de jugadores (incluyendo su dorsal cuando lo cites, ej. **#15 Nikola Jokić**), (b) nombres o apodos oficiales de equipos/franquicias (ej. **Boston Celtics**, **Knicks**), y (c) UNA sola idea táctica clave por párrafo (una frase corta de 4 a 10 palabras que resuma la clave del juego, ej. **colapsando la pintura tras cada bloqueo directo**). PROHIBIDO poner en negrita cifras o estadísticas sueltas (como "49 puntos", "12 rebotes" o "58.4%"): intégralas en texto normal sin formato especial. PROHIBIDO usar ** en TITULAR_PRENSA ni en el título corto previo a || en FOCO_ESPECIAL.',
        '7. ESTRUCTURA EXACTA DE SALIDA CON ESTAS 8 ETIQUETAS EN MAYÚSCULAS:',
        "===TITULAR_PRENSA===",
        "(Titular periodístico vibrante y directo de 1 línea sobre el partido, sin almohadillas # ni asteriscos **).",
        "===ENTRADILLA===",
        "(Entradilla destacada de 2 líneas sintetizando la tesis táctica y el protagonista del encuentro, aplicando la regla de negritas).",
        "===GUION_Y_QUIEBRE===",
        "(2 párrafos fluidos: evolución del partido por cuartos, ritmo comparado con la media NBA, alternancias, rachas anotadoras y el momento exacto donde se rompió o decidió el choque).",
        "===PIZARRA_Y_ROTACION===",
        "(2 párrafos de scouting profundo: ajustes tácticos colectivos, batallas en pintura/triple/rebote, impacto real diferenciando con pulcritud bajas por lesión frente a ausencias por decisión técnica o expulsiones por faltas con su cuarto/reloj, rendimiento de la segunda unidad y puntos tras pérdida/contraataque).",
        "===FOCO_ESPECIAL===",
        '(Si el partido tuvo un ángulo singular —prórroga, remontada grande, exhibición histórica, cortocircuito en el clutch, clínica defensiva—, escribe en una línea el título corto sin ** seguido de || y 1 párrafo analítico con la regla de negritas: ej. "Supervivencia en la prórroga || Texto...". Si fue un guion convencional sin ángulo extra, escribe únicamente: NINGUNO).',
        "===FACTOR_X_Y_LIDERES===",
        "(2 párrafos analizando el duelo de estrellas y quién emergió como Factor X inesperado para inclinar la balanza, citando siempre dorsales # y cifras reales).",
        "===ESPANOLES===",
        "(Si hay españoles en el detector oficial, analiza en 1 párrafo su impacto o situación en convocatoria; si NO los hay, escribe UNA SOLA FRASE breve, limpia y directa confirmándolo).",
        "===VEREDICTO_E_HITOS===",
        "(2 párrafos integrando con total naturalidad los dobles-dobles o triples-dobles verificados y cerrando con el veredicto strictly táctico del scout sobre qué deja este choque a ambos equipos).",
        '8. INTEGRACIÓN FLUIDA DEL PLAY-BY-PLAY (SIN REPETICIONES NI LISTAS ARTIFICIALES): (a) TIEMPOS MUERTOS TRAS PARCIAL: Si el dossier detalla un parcial demoledor que forzó un tiempo muerto técnico (ej. "parcial de 11-0 que obligó a parar el partido con tiempo muerto"), intégralo con soltura en GUION_Y_QUIEBRE sin inventar nombres propios de entrenadores (usa siempre "el cuerpo técnico de [Equipo rival]" o "la dirección técnica de [Equipo rival]"). (b) REPARTO DE TIROS Y PÉRDIDAS EN CLUTCH: Si el dossier incluye el bloque de ejecución clutch (últimos 2 minutos con margen ≤5 pts), sintetiza con solvencia táctica cómo se repartieron los tiros decisivos, quién asumió la responsabilidad y qué pérdidas de balón castigaron al derrotado en GUION_Y_QUIEBRE o FOCO_ESPECIAL, sin enumerar viñetas mecánicas. (c) CERO REPETICIÓN ENTRE SECCIONES: Distribuye la información armónicamente para no repetir el mismo hecho o cifra exacta en GUION_Y_QUIEBRE y de nuevo en PIZARRA_Y_ROTACION o FOCO_ESPECIAL.',
      ].join("\n");
      try {
        const cascadeBudgetMs = isServerless ? 28000 : 28000;
        const geminiCall = generateWithGeminiCascade({
          systemInstruction,
          contents: dossier,
          seedSources,
          isServerless,
        });
        const cascadeTimer = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ${cascadeBudgetMs}ms en Vercel/serverless`)), cascadeBudgetMs)
        );
        const { text: rawText, sources } = (await Promise.race([geminiCall, cascadeTimer])) as any;
        const safeRawText = sanitizeUnverifiedCoachClaims(rawText, verifiedGamePlayers);
        const parsed = parseDelimitedSections(safeRawText, ["TITULAR_PRENSA", "ENTRADILLA", "GUION_Y_QUIEBRE", "PIZARRA_Y_ROTACION", "FOCO_ESPECIAL", "FACTOR_X_Y_LIDERES", "ESPANOLES", "VEREDICTO_E_HITOS"]);
        const fallback = buildDeterministicGameNarrative(report);
        const payload = { eventId: report.eventId, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), engineMode: "gemini_search", generationTimeMs: Date.now() - startTime, pressHeadline: parsed.TITULAR_PRENSA && parsed.TITULAR_PRENSA.length > 12 ? stripInlineWrapper(parsed.TITULAR_PRENSA) : fallback.pressHeadline, pressLead: parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25 ? parsed.ENTRADILLA : fallback.pressLead, gameFlowSection: parsed.GUION_Y_QUIEBRE && parsed.GUION_Y_QUIEBRE.length > 60 ? parsed.GUION_Y_QUIEBRE : fallback.gameFlowSection, chalkboardSection: parsed.PIZARRA_Y_ROTACION && parsed.PIZARRA_Y_ROTACION.length > 60 ? parsed.PIZARRA_Y_ROTACION : fallback.chalkboardSection, dynamicSpotlight: parseSpotlight(parsed.FOCO_ESPECIAL, fallback.dynamicSpotlight), xFactorSection: parsed.FACTOR_X_Y_LIDERES && parsed.FACTOR_X_Y_LIDERES.length > 50 ? parsed.FACTOR_X_Y_LIDERES : fallback.xFactorSection, spanishSection: parsed.ESPANOLES && parsed.ESPANOLES.length > 12 ? parsed.ESPANOLES : fallback.spanishSection, verdictSection: parsed.VEREDICTO_E_HITOS && parsed.VEREDICTO_E_HITOS.length > 45 ? parsed.VEREDICTO_E_HITOS : fallback.verdictSection, sources };
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + 6 * 60 * 60 * 1e3, data: payload });
        return payload;
      } catch (err) {
        const rawErrStr = String(err instanceof Error ? err.message : err || "timeout/offline");
        const cleanReason = rawErrStr.replace(/[\{\}\"\:]/g, " ").replace(/\s+/g, " ").slice(0, 90);
        console.info(`[RadarNBA] Motor determinista activo para ${eventId} -> ${cleanReason}`);
        const isQuota = isQuotaExhaustedError(err);
        const fallback = buildDeterministicGameNarrative(report);
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = false;
        fallback.quotaExhausted = isQuota;
        fallback.fallbackReason = isQuota
          ? "quota_exhausted_429"
          : err instanceof Error ? err.message : String(err);
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

    const headline = mvp
      ? `${mvp.playerName} gobierna una jornada de ${gd.pulse.gamesCount} partidos con exhibición estelar`
      : stmt
      ? `${stmt.teamName} impone su jerarquía colectiva en una cartelera de ${gd.pulse.gamesCount} encuentros`
      : `Radiografía táctica y scouting completo de los ${gd.pulse.gamesCount} partidos de la jornada NBA`;

    const lead = `La jornada NBA del ${gd.selectedDate} dejó ${gd.pulse.gamesCount} duelos con un promedio de ${gd.pulse.avgTotalPoints.toFixed(1)} puntos por partido (${ptsDiff >= 0 ? `+${ptsDiff.toFixed(1)}` : ptsDiff.toFixed(1)} vs media liga). **${gd.pulse.roadWinsCount} victorias visitantes y ${gd.pulse.gamesCount - gd.pulse.roadWinsCount} triunfos locales marcaron el pulso competitivo**, en una noche con ${gd.pulse.avgPace.toFixed(1)} posesiones de media y ${gd.pulse.closeGamesCount} finales apretados.`;

    const matchSummaryNames = (gd.matchups || []).slice(0, 3).map((m) => {
      const winner = m.away.score > m.home.score ? m.away : m.home;
      const loser = m.away.score > m.home.score ? m.home : m.away;
      return `**${winner.name}** ante **${loser.name}** (${m.away.score}-${m.home.score})`;
    }).join(", ");

    const dynamicSections = [
      {
        kicker: "Análisis Editorial de la Cartelera",
        title: "Pulso Competitivo, Tendencias Colectivas y Ritmo de Juego :: Panorama General",
        body: `La jornada NBA del ${gd.selectedDate} ofreció una síntesis táctica dominada por la solidez en media pista y el control de las transiciones defensivas. Con un promedio global de ${gd.pulse.avgTotalPoints.toFixed(1)} puntos combinados por encuentro y un ritmo medio de ${gd.pulse.avgPace.toFixed(1)} posesiones, la cartelera dejó ${gd.pulse.roadWinsCount} triunfos visitantes y ${gd.pulse.closeGamesCount} desenlaces resueltos en los últimos minutos. Entre los choques más destacados figuraron las victorias de ${matchSummaryNames || "los conjuntos más firmes en la rotación"}.\n\nDesde la perspectiva analítica, las plantillas ganadoras marcaron la diferencia maximizando el rebote defensivo e imponiendo esquemas defensivos agresivos sobre la primera ayuda. El ritmo de la noche confirmó la tendencia de la liga hacia un ritmo controlado en el cinco contra cinco, donde la eficiencia en tiros de campo y la contención de pérdidas resultaron determinantes para asegurar ventajas.`,
      },
      {
        kicker: "Scouting y Protagonismos",
        title: "Lectura de Espacios, Impacto de Rotaciones y Ejecución en el Clutch :: Claves de Autor",
        body: `En el plano individual, la jornada volvió a evidenciar cómo la generación de ventajas a partir del bloqueo directo inclina balanzas. ${mvp ? `Sobresalió la exhibición de **${mvp.playerName}** (${mvp.teamAbbr}), ejerciendo de faro anotador y distribuidor con ${mvp.points} puntos, ${mvp.rebounds} rebotes y ${mvp.assists} asistencias.` : "Los principales referentes de la liga asumieron el liderazgo anotador en los tramos calientes de partido."}\n\nLas segundas unidades jugaron un papel crucial absorbiendo minutos de descanso titular sin perder efectividad. ${gd.roleShifts.length > 0 ? `Destacaron por su impacto desde el banquillo ${gd.roleShifts.slice(0, 3).map((r) => `**${r.playerName}** (${r.teamAbbr})`).join(", ")}.` : "Las rotaciones mantuvieron la disciplina defensiva protegiendo la pintura."}`,
      },
    ];

    const pizarrasParagraphs = (gd.matchups || []).slice(0, 3).map((m) => {
      const winner = m.away.score > m.home.score ? m.away : m.home;
      const loser = m.away.score > m.home.score ? m.home : m.away;
      return `En el triunfo de **${winner.name}** ante **${loser.name}** (${m.away.score}-${m.home.score}), el cuerpo técnico de **${winner.shortName}** forzó pérdidas tras balón suelto y dominó la transición defensiva.`;
    });

    const pizarrasSection =
      pizarrasParagraphs.join("\n\n") ||
      `El análisis colectivo registró un ritmo medio de ${gd.pulse.avgPace.toFixed(1)} posesiones por 48 minutos.`;

    const hitosSection = [
      mvp
        ? `**Exhibición de la Noche**: **${mvp.playerName}** (${mvp.teamAbbr}) firmó la actuación más completa con ${mvp.points} puntos, ${mvp.rebounds} rebotes y ${mvp.assists} asistencias (${mvp.tsPct.toFixed(0)}% TS).`
        : "",
      topExp
        ? `**Anomalía Anotadora**: **${topExp.playerName}** (${topExp.teamAbbr}) superó su proyección habitual alcanzando los ${topExp.points} puntos (+${topExp.ptsDelta.toFixed(1)} respecto a su media).`
        : "",
      gd.roleShifts.length > 0
        ? `**Sumas de Segunda Unidad**: Destacaron en la rotación ${gd.roleShifts.slice(0, 4).map((r) => `**${r.playerName}** (${r.teamAbbr}, ${r.minutes.toFixed(0)} min, ${r.points} pts)`).join(", ")}.`
        : "",
      brokenList.length > 0 || extendedList.length > 0
        ? `**Rachas**: ${extendedList.length > 0 ? `**${extendedList[0].playerName}** extendió su racha a ${extendedList[0].streakCount} encuentros en ${extendedList[0].thresholdLabel}.` : ""}${brokenList.length > 0 ? ` Se cortó la racha de ${brokenList[0].streakCount} partidos de **${brokenList[0].playerName}**.` : ""}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const espanolesSection =
      spanishNightNotes.length > 0
        ? `Acta de jugadores españoles: ${spanishNightNotes.join("; ")}.`
        : "Ningún jugador español sumó minutos en pista durante los encuentros disputados en esta fecha del calendario NBA.";

    const clavesList = (gd.matchups || []).slice(0, 4).map((m, idx) => {
      const winner = m.away.score > m.home.score ? m.away : m.home;
      const loser = m.away.score > m.home.score ? m.home : m.away;
      const topP = winner.topPlayer;
      const titles = [
        `Exhibición estelar en ${winner.abbr}`,
        `Pizarra colectiva de ${winner.name}`,
        `Factor decisivo en ${winner.abbr} vs ${loser.abbr}`,
        `Lectura global de la jornada`,
      ];
      return {
        title: titles[idx] || `${winner.abbr} ${m.away.score}-${m.home.score} ${loser.abbr}`,
        detail: topP
          ? `**${winner.name}** se impuso a **${loser.name}** (${m.away.score}-${m.home.score}) de la mano de **${topP.playerName}** (${topP.points} PTS, ${topP.rebounds} REB, ${topP.assists} AST).`
          : `**${winner.name}** marcó diferencias frente a **${loser.name}** en la rotación de media pista.`,
      };
    });

    return {
      date: gd.selectedDate,
      seasonLabel: gd.seasonLabel,
      gamesCount: gd.pulse.gamesCount,
      generatedAt: new Date().toISOString(),
      engineMode: "empirical_fallback",
      missingApiKey: !getGeminiClient(),
      headline: sanitizeEditorialSpanishGrammar(headline),
      lead: sanitizeEditorialSpanishGrammar(lead),
      dynamicSections,
      pizarrasSection: sanitizeEditorialSpanishGrammar(pizarrasSection),
      hitosSection: sanitizeEditorialSpanishGrammar(hitosSection || lead),
      espanolesSection: sanitizeEditorialSpanishGrammar(espanolesSection),
      clavesList,
      spanishPlayersSummary:
        spanishNightNotes.length > 0
          ? spanishNightNotes.join(" · ")
          : "Sin participación en pista de jugadores españoles registrada en los partidos de esta fecha.",
      sources: [],
    };
  }
  async function buildGameDayChroniclePayload(requestedDate, forceRefresh = false) {
    const gd = await deps.getGameDayPayload(requestedDate, forceRefresh);
    const cacheKey = `gameday_chronicle_v8:${gd.selectedDate}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        if (cached.data.engineMode === 'gemini_search' || !getGeminiClient()) {
          return cached.data;
        }
      }
    }
    const existing = reportInflight.get(cacheKey);
    if (existing) {
      return existing;
    }
    const promise = (async () => {
      const startTime = Date.now();
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
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes);
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = !getGeminiClient();
        fallback.fallbackReason = !getGeminiClient() ? "missing_api_key" : "no_matchups";
        return fallback;
      }
      const daySeedSources = [{ uri: `https://www.nba.com/games?date=${gd.selectedDate}`, title: `NBA.com \u2014 Resultados y Actas Oficiales (${gd.selectedDate})` }, ...pressCtx.daySources].slice(0, 6);
      const dayDossier = [`AVISO CR\xCDTICO DE MUNDO CERRADO: Jornada oficial NBA del ${gd.selectedDate} (Temporada ${gd.seasonLabel}). Tu memoria interna de entrenamiento est\xE1 desactualizada varios a\xF1os respecto a entrenadores actuales, traspasos, contratos y palmar\xE9s. NO des NING\xDAN dato por supuesto fuera de los hechos expl\xEDcitos de este dossier.`, `FECHA DE LA JORNADA NBA: ${gd.selectedDate} (Temporada ${gd.seasonLabel})`, `PULSO GLOBAL: ${gd.pulse.gamesCount} partidos disputados | Media puntos combinados: ${gd.pulse.avgTotalPoints.toFixed(1)} PTS (media liga: ${gd.pulse.leagueAvgTotalPoints.toFixed(1)}) | Finales apretados (<=5 pts): ${gd.pulse.closeGamesCount} | Palizas (>=15 pts): ${gd.pulse.blowoutsCount} | Victorias visitantes: ${gd.pulse.roadWinsCount}/${gd.pulse.gamesCount} | Ritmo medio (Pace): ${gd.pulse.avgPace.toFixed(1)}.`, gd.statementTeamWin ? `GOLPE EN LA MESA COLECTIVO: ${gd.statementTeamWin.teamName} (${gd.statementTeamWin.summaryAdvanced}).` : "", pressCtx.dayNotes.length > 0 ? `TELETIPOS DE PRENSA DE LOS PARTIDOS DE ESTA FECHA (${gd.selectedDate}):
${pressCtx.dayNotes.slice(0, 12).map((n) => `  \u2022 ${n}`).join("\n")}` : "", ``, `QUINTETO IDEAL DE LA NOCHE (TOP 5 GAME SCORE):`, ...gd.idealFive.map((p, i) => `${i + 1}. ${p.playerName} (${p.teamAbbr} ${p.isHome ? "vs" : "@"} ${p.opponentAbbr}, ${p.result}): ${p.points} PTS, ${p.rebounds} REB, ${p.assists} AST, ${p.stocks} ROB+TAP, ${p.tsPct.toFixed(1)}% TS, GmSc ${p.gameScore.toFixed(1)} (su media es ${p.ptsBaselineAvg.toFixed(1)} PTS)`), ``, `TODOS LOS RESULTADOS Y CLAVES T\xC1CTICAS DE LOS ${gd.matchups.length} PARTIDOS:`, ...gd.matchups.map((m) => `- ${m.away.name} (${m.away.abbr} ${m.away.recordAfter}) ${m.away.score} - ${m.home.score} ${m.home.name} (${m.home.abbr} ${m.home.recordAfter}) [${m.contextTag}] | L\xEDderes: ${m.away.topPlayer ? `${m.away.topPlayer.playerName} (${m.away.topPlayer.points}P/${m.away.topPlayer.rebounds}R/${m.away.topPlayer.assists}A)` : ""} vs ${m.home.topPlayer ? `${m.home.topPlayer.playerName} (${m.home.topPlayer.points}P/${m.home.topPlayer.rebounds}R/${m.home.topPlayer.assists}A)` : ""} | Claves: ${m.keyTakeawaysAdvanced.map((k) => k.replace(/\*\*/g, "")).join(" / ")}`), ``, `EXPLOSIONES FRENTE A SU MEDIA: ${gd.explosions.length > 0 ? gd.explosions.slice(0, 5).map((e) => `${e.playerName} (${e.teamAbbr}): ${e.points} PTS (+${e.ptsDelta.toFixed(1)} vs media ${e.ptsAvg.toFixed(1)}, ${e.driverTag})`).join(" | ") : "Ninguna extrema"}`, `BATACAZOS DE TITULARES: ${gd.slumps.length > 0 ? gd.slumps.slice(0, 4).map((s) => `${s.playerName} (${s.teamAbbr}): ${s.points} PTS (${s.ptsDelta.toFixed(1)} vs media ${s.ptsAvg.toFixed(1)}, ${s.tsPct.toFixed(0)}% TS)`).join(" | ") : "Ninguno acusado"}`, `CAMBIOS DE ROL / PICOS DE MINUTOS: ${gd.roleShifts.length > 0 ? gd.roleShifts.slice(0, 4).map((r) => `${r.playerName} (${r.teamAbbr}): ${r.minutes.toFixed(0)} MIN (+${r.minutesDelta.toFixed(1)} vs media), ${r.usgEst.toFixed(1)}% USG, ${r.points}P/${r.rebounds}R/${r.assists}A`).join(" | ") : "Rotaciones estables"}`, `RACHAS DESTACADAS: ${gd.streakShifts.length > 0 ? gd.streakShifts.slice(0, 6).map((st) => `${st.playerName} (${st.teamAbbr}): ${st.status === "broken" ? `RACHA ROTA tras ${st.streakCount} PJ` : `PROLONGA a ${st.streakCount} PJ`} en ${st.thresholdLabel} (${st.nightValueDisplay})`).join(" | ") : "Sin rachas largas alteradas"}`, `TRIPLES-DOBLES DE LA NOCHE: ${tripleDoublesNight.length > 0 ? tripleDoublesNight.join(" | ") : "Ninguno"} (Total dobles-dobles en la jornada: ${totalDoubleDoubles}).`, `JUGADORES ESPA\xD1OLES EN LA JORNADA: ${spanishNightNotes.length > 0 ? spanishNightNotes.join(" | ") : "Ning\xFAn jugador espa\xF1ol sum\xF3 minutos en pista esta fecha."}`].filter(Boolean).join("\n");
      const systemInstruction = ["Eres el analista jefe y cronista de scouting NBA de referencia en Espa\xF1a. Cada ma\xF1ana escribes la gran revista editorial de la jornada para que un lector exigente entienda en pocos minutos todo lo ocurrido en la liga.", "REGLAS INQUEBRANTABLES DE RIGOR Y MUNDO CERRADO (CERO DATOS POR SUPUESTOS):", "1. RIGOR EMP\xCDRICO TOTAL: Todos los marcadores, puntos, porcentajes, r\xE9cords y rachas que cites deben coincidir al 100% con el dossier adjunto. Jam\xE1s inventes resultados, cifras ni jugadas concretas no descritas.", '2. PROHIBICI\xD3N TOTAL DE DAR DATOS POR SUPUESTOS O USAR MEMORIA PREENTRENADA: Tu conocimiento interno previo est\xE1 desactualizado respecto a la temporada actual. Tienes TERMINANTEMENTE PROHIBIDO dar por supuesto o mencionar: (a) nombres propios o apodos de entrenadores, asistentes o directivos (ej. Tom Thibodeau dej\xF3 los NY Knicks hace a\xF1os; NUNCA cites nombres de entrenadores, habla SIEMPRE de "el cuerpo t\xE9cnico de [Equipo]", "la direcci\xF3n t\xE9cnica de [Equipo]" o "la pizarra de [Equipo]"); (b) antig\xFCedad, edad, rondas de Draft, condici\xF3n de rookie, contratos, exequipos o traspasos de jugadores; (c) premios pasados, anillos, "vigente campe\xF3n" o series de temporadas anteriores; (d) puestos exactos en la clasificaci\xF3n (ej. "4\xBA del Este") o pr\xF3ximos rivales del calendario; (e) causas o plazos de lesiones no escritos literalmente en el dossier.', '3. PROSA PERIOD\xCDSTICA DE AUTOR Y EXPERTO EN SCOUTING (CERO REPASO GAME-BY-GAME): Tienes terminantemente prohibido enumerar los partidos uno a uno o estructurar el texto como un repaso secuencial encuentro por encuentro ("En el partido 1...", "En el partido 2..."). Escribe un gran informe editorial period\xEDstico de autor que analice el panorama global de la jornada. Examina las grandes tendencias colectivas, el ritmo de juego (Pace), la efectividad ofensiva y la lectura t\xE1ctica de la cartelera en su conjunto, citando datos y n\xFAmeros clave solo cuando sirvan para explicar el porqu\xE9 del juego con total fluidez de revista deportiva (estilo The Athletic o Gigantes).', '4. GRAM\xC1TICA ESPA\xD1OLA IMPECABLE + JERARQU\xCDA EN NEGRITA (**...**): JAM\xC1S dupliques el art\xEDculo delante de franquicias que ya empiezan por "Los" (PROHIBIDO escribir "Los Los Angeles Lakers" or "los Los Angeles Clippers"; escribe siempre "**Los Angeles Lakers**" o "los **Lakers**"). En todos los p\xE1rrafos del cuerpo (ENTRADILLA, CAPITULOS_DINAMICOS, PIZARRAS, HITOS, ESPANOLES y la explicaci\xF3n tras :: en CLAVES), utiliza negrita Markdown (**texto**) EXCLUSIVAMENTE para: (a) nombres de jugadores (ej. **Nikola Joki\u0107**), (b) nombres o apodos oficiales de equipos (ej. **Boston Celtics**, **Lakers**), y (c) UNA sola idea t\xE1ctica clave por p\xE1rrafo (frase breve de 4 a 10 palabras que explique el porqu\xE9 del juego, ej. **colapsando la pintura para forzar p\xE9rdidas**). PROHIBIDO poner en negrita cifras aisladas y PROHIBIDO poner ** en TITULAR o antes de ::.', "5. FORMATO EXACTO CON ESTAS 7 ETIQUETAS EN MAY\xDASCULAS:", "===TITULAR===", "(Titular period\xEDstico potente de portada en 1 sola l\xEDnea, sin # ni **).", "===ENTRADILLA===", "(Entradilla editorial destacada de 2 a 3 l\xEDneas resumiendo el pulso y los grandes nombres de la noche, aplicando la regla de negritas).", "===CAPITULOS_DINAMICOS===", '(Redacta exactamente 2 grandes cap\xEDtulos tem\xE1ticos de fondo que engloben el pulso general de la noche en lugar de repasar partido a partido. Formato obligatorio por cap\xEDtulo: "T\xEDtulo atractivo del cap\xEDtulo :: P\xE1rrafo 1\\n\\nP\xE1rrafo 2". Separa ambos cap\xEDtulos con una l\xEDnea que contenga \xFAnicamente ---).', "===PIZARRAS===", "(Ep\xEDgrafe fijo Pizarras: 2 p\xE1rrafos analizando ajustes t\xE1cticos colectivos de la jornada, ritmo frente a la media de la liga, eficiencia ofensiva/defensiva y el golpe colectivo m\xE1s serio de la noche).", "===HITOS===", "(Ep\xEDgrafe fijo Hitos: 2 p\xE1rrafos entrelazando con naturalidad triples-dobles/dobles-dobles, explosiones estad\xEDsticas frente a su media, irrupciones de rol/minutos y rachas prolongadas o rotas).", "===ESPANOLES===", "(Ep\xEDgrafe fijo Espa\xF1oles: si jugaron espa\xF1oles, 1 p\xE1rrafo analizando con precisi\xF3n sus minutos, producci\xF3n e impacto real; si ninguno sum\xF3 minutos en esta fecha, 1 frase sobria, directa y natural confirm\xE1ndolo).", "===CLAVES===", '(Ep\xEDgrafe fijo Claves: exactamente 4 claves anal\xEDticas reales que expliquen POR QU\xC9 se ganaron o perdieron los partidos m\xE1s relevantes de la jornada, una por l\xEDnea con formato exacto "T\xEDtulo anal\xEDtico corto sin ** :: An\xE1lisis t\xE1ctico claro en 1-2 frases respaldado por cifras comprensibles aplicando negritas", sin numeraci\xF3n inicial. Criterio obligatorio de las 4 claves: [1] la gran exhibici\xF3n individual de la noche y c\xF3mo gener\xF3 ventaja para su equipo; [2] la pizarra colectiva o factor t\xE1ctico m\xE1s determinante de la jornada \u2014punter\xEDa y volumen en triples, cerrojo defensivo, control de p\xE9rdidas, dominio en la pintura o rebote ofensivo\u2014; [3] el cierre apretado, irrupci\xF3n de banquillo o factor X m\xE1s decisivo; [4] lectura t\xE1ctica global de la cartelera. PROHIBIDO usar ratios opacos que no expliquen el juego como "tasa de tiros libres" / FTR% o citar datos sueltos sin causa-efecto baloncest\xEDstico).'].join("\n");
      try {
        const { text: rawText, sources } = await generateWithGeminiCascade({ systemInstruction, contents: dayDossier, seedSources: daySeedSources });
        const safeRawText = sanitizeUnverifiedCoachClaims(rawText, verifiedNightPlayerNames);
        const parsed = parseDelimitedSections(safeRawText, ["TITULAR", "ENTRADILLA", "CAPITULOS_DINAMICOS", "PIZARRAS", "HITOS", "ESPANOLES", "CLAVES"]);
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes);
        const payload = { date: gd.selectedDate, seasonLabel: gd.seasonLabel, gamesCount: gd.pulse.gamesCount, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), generationTimeMs: Date.now() - startTime, engineMode: "gemini_search", headline: parsed.TITULAR && parsed.TITULAR.length > 12 ? stripInlineWrapper(parsed.TITULAR) : fallback.headline, lead: parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25 ? parsed.ENTRADILLA : fallback.lead, dynamicSections: parseDynamicChapters(parsed.CAPITULOS_DINAMICOS, fallback.dynamicSections), pizarrasSection: parsed.PIZARRAS && parsed.PIZARRAS.length > 60 ? parsed.PIZARRAS : fallback.pizarrasSection, hitosSection: parsed.HITOS && parsed.HITOS.length > 60 ? parsed.HITOS : fallback.hitosSection, espanolesSection: parsed.ESPANOLES && parsed.ESPANOLES.length > 12 ? parsed.ESPANOLES : fallback.espanolesSection, clavesList: parseClavesList(parsed.CLAVES, fallback.clavesList), spanishPlayersSummary: spanishNightNotes.length > 0 ? spanishNightNotes.join(" \xB7 ") : "Sin minutos en pista de jugadores espa\xF1oles en los encuentros disputados esta fecha.", sources };
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + 4 * 60 * 60 * 1e3, data: payload });
        return payload;
      } catch (err) {
        const isQuota = isQuotaExhaustedError(err);
        console.info(
          `[RadarNBA] Activado motor determinista de jornada para ${gd.selectedDate} (${
            isQuota ? "cuota_diaria_429_agotada" : err?.status || err?.code || "timeout/offline"
          })`
        );
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes);
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = !getGeminiClient();
        fallback.quotaExhausted = isQuota;
        fallback.fallbackReason = isQuota
          ? "quota_exhausted_429"
          : err instanceof Error ? err.message : String(err);
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + (isQuota ? 5 * 60 * 1e3 : 30 * 1e3), data: fallback });
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
  return { buildGameOfficialReportData, buildGameNarrativePayload, buildDeterministicGameNarrative, buildGameDayChroniclePayload, fetchLeagueScheduleGames, fetchEspnInjuriesByName };
}
export {
  createScoutingEngine,
  translateMedicalDetailEs
};
