// @ts-nocheck
import fs from "fs";
import path from "path";
import { executeUpstashCommand, getRedisRestConfig } from "./upstashRedis.ts";

export type EditorialLengthProfile = "concise" | "standard" | "deep";
export type EditorialTacticalFocus =
  | "balanced"
  | "tactical_chalkboard"
  | "narrative_storytelling"
  | "advanced_metrics";

export type GameChronicleVersion = "v1_classic" | "v2_tactical";
export type DailyChronicleVersion = "v1_classic" | "v2_tactical";

export interface EditorialConfigValues {
  gameChronicleVersion: GameChronicleVersion;
  dailyChronicleVersion: DailyChronicleVersion;
  lengthProfile: EditorialLengthProfile;
  tacticalFocus: EditorialTacticalFocus;
  customStyleDirectives: string;
  extraForbiddenCliches: string[];
  applyToGameChronicles: boolean;
  applyToDailyChronicles: boolean;
}

export interface EditorialConfigStored extends EditorialConfigValues {
  cacheEpoch: number;
  updatedAt: number;
}

const EDITORIAL_REDIS_KEY = "radarnba:editorial:config:v1";
const EDITORIAL_DISK_FILE = process.env.VERCEL
  ? "/tmp/radarnba-editorial-config.json"
  : path.resolve(process.cwd(), "data", "editorial-chronicles-config.json");

export const DEFAULT_EDITORIAL_CONFIG_VALUES: EditorialConfigValues = {
  gameChronicleVersion: "v2_tactical",
  dailyChronicleVersion: "v2_tactical",
  lengthProfile: "standard",
  tacticalFocus: "balanced",
  customStyleDirectives: "",
  extraForbiddenCliches: [],
  applyToGameChronicles: true,
  applyToDailyChronicles: true,
};

const VALID_GAME_CHRONICLE_VERSIONS = new Set<GameChronicleVersion>(["v1_classic", "v2_tactical"]);
const VALID_DAILY_CHRONICLE_VERSIONS = new Set<DailyChronicleVersion>(["v1_classic", "v2_tactical"]);
const VALID_LENGTH_PROFILES = new Set<EditorialLengthProfile>(["concise", "standard", "deep"]);
const VALID_TACTICAL_FOCUSES = new Set<EditorialTacticalFocus>([
  "balanced",
  "tactical_chalkboard",
  "narrative_storytelling",
  "advanced_metrics",
]);

function sanitizePromptSnippet(raw: string, maxLen: number): string {
  return String(raw || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/={3,}/g, "-")
    .replace(/\|\|/g, "/")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLen);
}

export function sanitizeEditorialConfigValues(input: Partial<EditorialConfigValues> | null | undefined): EditorialConfigValues {
  const src = input && typeof input === "object" ? input : {};
  const gameChronicleVersion = VALID_GAME_CHRONICLE_VERSIONS.has(src.gameChronicleVersion as GameChronicleVersion)
    ? (src.gameChronicleVersion as GameChronicleVersion)
    : DEFAULT_EDITORIAL_CONFIG_VALUES.gameChronicleVersion;
  const dailyChronicleVersion = VALID_DAILY_CHRONICLE_VERSIONS.has(src.dailyChronicleVersion as DailyChronicleVersion)
    ? (src.dailyChronicleVersion as DailyChronicleVersion)
    : DEFAULT_EDITORIAL_CONFIG_VALUES.dailyChronicleVersion;
  const lengthProfile = VALID_LENGTH_PROFILES.has(src.lengthProfile as EditorialLengthProfile)
    ? (src.lengthProfile as EditorialLengthProfile)
    : DEFAULT_EDITORIAL_CONFIG_VALUES.lengthProfile;
  const tacticalFocus = VALID_TACTICAL_FOCUSES.has(src.tacticalFocus as EditorialTacticalFocus)
    ? (src.tacticalFocus as EditorialTacticalFocus)
    : DEFAULT_EDITORIAL_CONFIG_VALUES.tacticalFocus;
  const customStyleDirectives = sanitizePromptSnippet(src.customStyleDirectives ?? "", 900);

  const rawCliches = Array.isArray(src.extraForbiddenCliches) ? src.extraForbiddenCliches : [];
  const seen = new Set<string>();
  const extraForbiddenCliches: string[] = [];
  for (const item of rawCliches) {
    const clean = sanitizePromptSnippet(String(item || ""), 60).replace(/\n+/g, " ");
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extraForbiddenCliches.push(clean);
    if (extraForbiddenCliches.length >= 30) break;
  }

  return {
    gameChronicleVersion,
    dailyChronicleVersion,
    lengthProfile,
    tacticalFocus,
    customStyleDirectives,
    extraForbiddenCliches,
    applyToGameChronicles:
      typeof src.applyToGameChronicles === "boolean"
        ? src.applyToGameChronicles
        : DEFAULT_EDITORIAL_CONFIG_VALUES.applyToGameChronicles,
    applyToDailyChronicles:
      typeof src.applyToDailyChronicles === "boolean"
        ? src.applyToDailyChronicles
        : DEFAULT_EDITORIAL_CONFIG_VALUES.applyToDailyChronicles,
  };
}

let cachedConfig: EditorialConfigStored | null = null;
let cachedAtMs = 0;
const MEMORY_CACHE_TTL_MS = 15_000;

function readEditorialConfigFromDisk(): EditorialConfigStored | null {
  try {
    if (fs.existsSync(EDITORIAL_DISK_FILE)) {
      const raw = fs.readFileSync(EDITORIAL_DISK_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          ...sanitizeEditorialConfigValues(parsed),
          cacheEpoch:
            typeof parsed.cacheEpoch === "number" && Number.isFinite(parsed.cacheEpoch) && parsed.cacheEpoch >= 1
              ? Math.floor(parsed.cacheEpoch)
              : 1,
          updatedAt:
            typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
              ? parsed.updatedAt
              : 0,
        };
      }
    }
  } catch {
    // Ignore disk read errors
  }
  return null;
}

function writeEditorialConfigToDisk(cfg: EditorialConfigStored): void {
  try {
    const dir = path.dirname(EDITORIAL_DISK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${EDITORIAL_DISK_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf-8");
    fs.renameSync(tmp, EDITORIAL_DISK_FILE);
  } catch {
    // Ignore read-only disk errors in serverless environments
  }
}

export function getEditorialStorageInfo(): {
  storageMode: "upstash-redis" | "local-disk";
  cloudConfigured: boolean;
} {
  const redisCfg = getRedisRestConfig();
  return redisCfg
    ? { storageMode: "upstash-redis", cloudConfigured: true }
    : { storageMode: "local-disk", cloudConfigured: false };
}

export async function loadEditorialConfig(forceRefresh = false): Promise<EditorialConfigStored> {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now - cachedAtMs < MEMORY_CACHE_TTL_MS) {
    return { ...cachedConfig, extraForbiddenCliches: [...cachedConfig.extraForbiddenCliches] };
  }

  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      const raw = await executeUpstashCommand(redisCfg, ["GET", EDITORIAL_REDIS_KEY], 2500);
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === "object") {
          const normalized: EditorialConfigStored = {
            ...sanitizeEditorialConfigValues(parsed),
            cacheEpoch:
              typeof parsed.cacheEpoch === "number" && Number.isFinite(parsed.cacheEpoch) && parsed.cacheEpoch >= 1
                ? Math.floor(parsed.cacheEpoch)
                : 1,
            updatedAt:
              typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
                ? parsed.updatedAt
                : 0,
          };
          cachedConfig = normalized;
          cachedAtMs = now;
          writeEditorialConfigToDisk(normalized);
          return { ...normalized, extraForbiddenCliches: [...normalized.extraForbiddenCliches] };
        }
      }
    } catch {
      // Fall back to disk or defaults
    }
  }

  const fromDisk = readEditorialConfigFromDisk();
  const resolved: EditorialConfigStored = fromDisk ?? {
    ...DEFAULT_EDITORIAL_CONFIG_VALUES,
    cacheEpoch: 1,
    updatedAt: 0,
  };
  cachedConfig = resolved;
  cachedAtMs = now;
  return { ...resolved, extraForbiddenCliches: [...resolved.extraForbiddenCliches] };
}

async function persistEditorialConfig(next: EditorialConfigStored): Promise<EditorialConfigStored> {
  cachedConfig = next;
  cachedAtMs = Date.now();
  writeEditorialConfigToDisk(next);

  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    await executeUpstashCommand(
      redisCfg,
      ["SET", EDITORIAL_REDIS_KEY, JSON.stringify(next)],
      3500
    );
  }
  return { ...next, extraForbiddenCliches: [...next.extraForbiddenCliches] };
}

export async function saveEditorialConfig(
  values: EditorialConfigValues,
  options?: { invalidateCache?: boolean }
): Promise<EditorialConfigStored> {
  const current = await loadEditorialConfig(true);
  const clean = sanitizeEditorialConfigValues(values);
  const nextEpoch = options?.invalidateCache ? Math.max(current.cacheEpoch + 1, Date.now()) : current.cacheEpoch;
  const next: EditorialConfigStored = {
    ...clean,
    cacheEpoch: nextEpoch,
    updatedAt: Date.now(),
  };
  return persistEditorialConfig(next);
}

export async function resetEditorialConfigToDefaults(
  options?: { invalidateCache?: boolean }
): Promise<EditorialConfigStored> {
  const current = await loadEditorialConfig(true);
  const nextEpoch = options?.invalidateCache ? Math.max(current.cacheEpoch + 1, Date.now()) : current.cacheEpoch;
  const next: EditorialConfigStored = {
    ...DEFAULT_EDITORIAL_CONFIG_VALUES,
    cacheEpoch: nextEpoch,
    updatedAt: Date.now(),
  };
  return persistEditorialConfig(next);
}

export async function bumpEditorialCacheEpoch(): Promise<EditorialConfigStored> {
  const current = await loadEditorialConfig(true);
  const next: EditorialConfigStored = {
    ...current,
    cacheEpoch: Math.max(current.cacheEpoch + 1, Date.now()),
    updatedAt: Date.now(),
  };
  return persistEditorialConfig(next);
}

export function buildEditorialDirectivesPromptBlock(
  cfg: EditorialConfigValues | null | undefined,
  target: "game" | "daily"
): string {
  if (!cfg) return "";
  if (target === "game" && !cfg.applyToGameChronicles) return "";
  if (target === "daily" && !cfg.applyToDailyChronicles) return "";

  const lines: string[] = [];

  if (cfg.lengthProfile === "concise") {
    lines.push(
      "- EXTENSIÓN CONCISA: Redacta párrafos más ágiles y directos (3 a 4 líneas por párrafo) priorizando síntesis y ritmo de lectura rápida sin sacrificar el rigor estadístico."
    );
  } else if (cfg.lengthProfile === "deep") {
    lines.push(
      "- ANÁLISIS PROFUNDO: Desarrolla con mayor detalle causal las secuencias tácticas, los ajustes entre cuartos y la lectura comparada de cada duelo, manteniendo párrafos cohesivos y cero relleno."
    );
  }

  if (cfg.tacticalFocus === "tactical_chalkboard") {
    lines.push(
      "- FOCO PIZARRA Y TÁCTICA: Pon especial énfasis en emparejamientos, protección de pintura, espaciado, gestión de pérdidas, rebote ofensivo y respuestas defensivas tras parciales."
    );
  } else if (cfg.tacticalFocus === "narrative_storytelling") {
    lines.push(
      "- FOCO NARRATIVO Y PULSO PERIODÍSTICO: Da mayor protagonismo al hilo dramático del encuentro, los puntos de inflexión emocionales y el duelo de líderes, integrando las métricas con máxima fluidez literaria."
    );
  } else if (cfg.tacticalFocus === "advanced_metrics") {
    lines.push(
      "- FOCO ANALÍTICO Y EFICIENCIA: Prioriza métricas de eficiencia (OffRtg, eFG%, TS%, Pace, puntos por posesión, puntos en pintura y tras pérdida) para explicar cada ventaja competitiva."
    );
  }

  if (Array.isArray(cfg.extraForbiddenCliches) && cfg.extraForbiddenCliches.length > 0) {
    const quoted = cfg.extraForbiddenCliches.map((c) => `"${c}"`).join(", ");
    lines.push(`- EXPRESIONES Y CLICHÉS ADICIONALES PROHIBIDOS: Evita absolutamente escribir ${quoted}.`);
  }

  if (cfg.customStyleDirectives && cfg.customStyleDirectives.trim().length > 0) {
    lines.push(`- DIRECTRIZ DE REDACCIÓN ADICIONAL DEL EDITOR: ${cfg.customStyleDirectives.trim()}`);
  }

  if (lines.length === 0) return "";

  return [
    "PREFERENCIAS EDITORIALES CONFIGURADAS (siempre subordinadas a las reglas de mundo cerrado y a las etiquetas exactas de salida):",
    ...lines,
  ].join("\n");
}
