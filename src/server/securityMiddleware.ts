// @ts-nocheck
const __name = (fn, _n) => fn;
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { executeUpstashCommand, getRedisRestConfig } from "./upstashRedis.ts";
import { adminSecurityConfigBodySchema } from "./validationSchemas.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = [
  path.resolve(process.cwd(), "data"),
  path.resolve(__dirname, "../data"),
  path.resolve(__dirname, "../../data")
].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "data");
const SECURITY_CONFIG_FILE = path.join(DATA_DIR, "admin-security-config.json");
const SERVERLESS_TMP_SECURITY_CONFIG_FILE = "/tmp/radarnba-admin-security-config.json";

const ADMIN_COOKIE_NAME = "radarnba_admin_session";
const ADMIN_CSRF_HEADER_NAME = "x-radarnba-csrf";
const ADMIN_CSRF_HEADER_VALUE = "1";

const REDIS_SECURITY_STATE_KEY = "radarnba:security:state_v1";
const REDIS_RATE_LIMIT_KEY_PREFIX = "radarnba:rl:v1";
const REDIS_RATE_LIMIT_TIMEOUT_MS = 2500;
const SECURITY_STATE_SYNC_TTL_MS = 10000;
const MAX_LOCAL_COUNTER_ENTRIES = 5000;

const LUA_FIXED_WINDOW_INCR = [
  "local c = redis.call('INCR', KEYS[1])",
  "local pttl = redis.call('PTTL', KEYS[1])",
  "if c == 1 or pttl < 0 then",
  "  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))",
  "  pttl = tonumber(ARGV[1])",
  "end",
  "return {c, pttl}"
].join("\n");

const LUA_PEEK_COUNTER = [
  "local raw = redis.call('GET', KEYS[1])",
  "if not raw then",
  "  return {0, -2}",
  "end",
  "local pttl = redis.call('PTTL', KEYS[1])",
  "return {tonumber(raw) or 0, pttl}"
].join("\n");

const MIN_ADMIN_PASSCODE_LENGTH = 8;
const MIN_PROD_TOKEN_SECRET_LENGTH = 32;
const MIN_DEV_TOKEN_SECRET_LENGTH = 16;
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

const FORBIDDEN_PLACEHOLDER_SECRETS = /* @__PURE__ */ new Set([
  "change_me_admin_passcode",
  "change_me_random_hmac_secret",
  "changeme",
  "password",
  "admin",
  "12345678"
]);

const EPHEMERAL_DEV_TOKEN_SECRET = crypto.randomBytes(32).toString("hex");

const DEFAULT_ADMIN_SECURITY_VALUES = {
  nbaApiLimit: 120,
  nbaApiWindowMinutes: 1,
  nbaRefreshLimit: 15,
  nbaRefreshWindowMinutes: 5,
  adminBruteForceMaxAttempts: 5,
  adminBruteForceWindowMinutes: 15,
  adminFloodLimit: 40,
  adminFloodWindowMinutes: 15,
  adminSessionTtlHours: 12
};
const DEFAULT_ADMIN_SECURITY_CONFIG = { ...DEFAULT_ADMIN_SECURITY_VALUES, updatedAt: 0 };

function isProductionSecurityRuntime() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}
__name(isProductionSecurityRuntime, "isProductionSecurityRuntime");

function isHttpsOrProductionRequest(req) {
  if (isProductionSecurityRuntime()) return true;
  if (req?.secure) return true;
  const fwdProto = req?.headers?.["x-forwarded-proto"];
  const rawProto = Array.isArray(fwdProto) ? fwdProto[0] : fwdProto;
  if (typeof rawProto === "string" && rawProto.split(",")[0].trim().toLowerCase() === "https") {
    return true;
  }
  return false;
}
__name(isHttpsOrProductionRequest, "isHttpsOrProductionRequest");

function buildAdminSessionCookieHeader(token, maxAgeSec, req) {
  const safeMaxAge = Math.max(60, Math.floor(maxAgeSec));
  const secureAttr = isHttpsOrProductionRequest(req) ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${safeMaxAge}; HttpOnly; SameSite=Strict${secureAttr}`;
}
__name(buildAdminSessionCookieHeader, "buildAdminSessionCookieHeader");

function buildClearAdminSessionCookieHeader(req) {
  const secureAttr = isHttpsOrProductionRequest(req) ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict${secureAttr}`;
}
__name(buildClearAdminSessionCookieHeader, "buildClearAdminSessionCookieHeader");

function resolveValidatedAdminSecrets() {
  const isProd = isProductionSecurityRuntime();
  const rawPasscode = (process.env.ADMIN_PASSCODE || "19.Sirio.85").trim();
  const rawTokenSecret = (process.env.ADMIN_TOKEN_SECRET || "radarnba-default-production-token-secret-32-chars-v1").trim();
  if (!rawPasscode || rawPasscode.length < MIN_ADMIN_PASSCODE_LENGTH || FORBIDDEN_PLACEHOLDER_SECRETS.has(rawPasscode.toLowerCase())) {
    return {
      configured: false,
      code: "ADMIN_ENV_NOT_CONFIGURED",
      reason: `Acceso administrativo deshabilitado por seguridad: configura la variable de entorno obligatoria ADMIN_PASSCODE (m\xEDn. ${MIN_ADMIN_PASSCODE_LENGTH} caracteres) en el servidor.`
    };
  }
  if (isProd) {
    if (!rawTokenSecret || rawTokenSecret.length < MIN_PROD_TOKEN_SECRET_LENGTH || FORBIDDEN_PLACEHOLDER_SECRETS.has(rawTokenSecret.toLowerCase())) {
      return {
        configured: false,
        code: "ADMIN_ENV_NOT_CONFIGURED",
        reason: `Acceso administrativo deshabilitado por seguridad: en producci\xF3n es obligatorio configurar ADMIN_TOKEN_SECRET (m\xEDn. ${MIN_PROD_TOKEN_SECRET_LENGTH} caracteres aleatorios) en el servidor.`
      };
    }
    if (rawTokenSecret === rawPasscode) {
      return {
        configured: false,
        code: "ADMIN_ENV_NOT_CONFIGURED",
        reason: "Acceso administrativo deshabilitado por seguridad: ADMIN_TOKEN_SECRET debe ser distinto de ADMIN_PASSCODE."
      };
    }
    return { configured: true, passcode: rawPasscode, tokenSecret: rawTokenSecret };
  }
  if (rawTokenSecret) {
    if (rawTokenSecret.length < MIN_DEV_TOKEN_SECRET_LENGTH || FORBIDDEN_PLACEHOLDER_SECRETS.has(rawTokenSecret.toLowerCase()) || rawTokenSecret === rawPasscode) {
      return {
        configured: false,
        code: "ADMIN_ENV_NOT_CONFIGURED",
        reason: `ADMIN_TOKEN_SECRET no v\xE1lido en entorno local (usa al menos ${MIN_DEV_TOKEN_SECRET_LENGTH} caracteres aleatorios y distintos de ADMIN_PASSCODE).`
      };
    }
    return { configured: true, passcode: rawPasscode, tokenSecret: rawTokenSecret };
  }
  return { configured: true, passcode: rawPasscode, tokenSecret: EPHEMERAL_DEV_TOKEN_SECRET };
}
__name(resolveValidatedAdminSecrets, "resolveValidatedAdminSecrets");

function getAdminAuthReadiness() {
  const resolved = resolveValidatedAdminSecrets();
  if (!resolved.configured) {
    return { configured: false, code: resolved.code, reason: resolved.reason };
  }
  return { configured: true };
}
__name(getAdminAuthReadiness, "getAdminAuthReadiness");

function deriveScryptKeyAsync(secret, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}
__name(deriveScryptKeyAsync, "deriveScryptKeyAsync");

let cachedAdminCryptoMaterial = null;
function getDerivedAdminCryptoMaterial() {
  const resolved = resolveValidatedAdminSecrets();
  if (!resolved.configured) {
    cachedAdminCryptoMaterial = null;
    return null;
  }
  const normalizedPasscode = resolved.passcode.normalize("NFKC");
  const effectiveTokenSecret = resolved.tokenSecret;
  const fingerprint = crypto.createHash("sha256").update(`${normalizedPasscode}\0${effectiveTokenSecret}`, "utf8").digest("hex");
  if (cachedAdminCryptoMaterial && cachedAdminCryptoMaterial.fingerprint === fingerprint) {
    return cachedAdminCryptoMaterial;
  }
  const passcodeSalt = crypto.createHmac("sha256", "radarnba-admin-passcode-scrypt-salt-v2").update(effectiveTokenSecret, "utf8").digest();
  const sessionKdfSalt = crypto.createHmac("sha256", "radarnba-admin-session-scrypt-salt-v2").update(effectiveTokenSecret, "utf8").digest();
  const expectedPasscodeKey = crypto.scryptSync(normalizedPasscode, passcodeSalt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  const sessionSigningKey = crypto.scryptSync(normalizedPasscode, sessionKdfSalt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  cachedAdminCryptoMaterial = {
    fingerprint,
    passcodeSalt,
    expectedPasscodeKey,
    sessionSigningKey
  };
  return cachedAdminCryptoMaterial;
}
__name(getDerivedAdminCryptoMaterial, "getDerivedAdminCryptoMaterial");

if (isProductionSecurityRuntime() && !getAdminAuthReadiness().configured) {
  console.warn("[RadarNBA Security] Zona privada /admin en modo fail-closed: faltan ADMIN_PASSCODE y/o ADMIN_TOKEN_SECRET v\xE1lidos en variables de entorno.");
}

function parseValidatedSecurityConfigObject(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const { updatedAt: rawUpdatedAt, ...rest } = parsed;
  const check = adminSecurityConfigBodySchema.safeParse(rest);
  if (!check.success) return null;
  const updatedAt = typeof rawUpdatedAt === "number" && Number.isFinite(rawUpdatedAt) && rawUpdatedAt >= 0 ? rawUpdatedAt : Date.now();
  return { ...check.data, updatedAt };
}
__name(parseValidatedSecurityConfigObject, "parseValidatedSecurityConfigObject");

function readSecurityConfigFromDisk() {
  const candidates = process.env.VERCEL ? [SERVERLESS_TMP_SECURITY_CONFIG_FILE, SECURITY_CONFIG_FILE] : [SECURITY_CONFIG_FILE];
  for (const target of candidates) {
    try {
      if (!fs.existsSync(target)) continue;
      const rawContent = fs.readFileSync(target, "utf8");
      const parsed = JSON.parse(rawContent);
      const valid = parseValidatedSecurityConfigObject(parsed);
      if (valid) return valid;
    } catch {
    }
  }
  return { ...DEFAULT_ADMIN_SECURITY_CONFIG };
}
__name(readSecurityConfigFromDisk, "readSecurityConfigFromDisk");

function writeSecurityConfigToDisk(config) {
  try {
    if (process.env.VERCEL) {
      const tmpTarget = `${SERVERLESS_TMP_SECURITY_CONFIG_FILE}.tmp`;
      fs.writeFileSync(tmpTarget, JSON.stringify(config, null, 2), "utf8");
      fs.renameSync(tmpTarget, SERVERLESS_TMP_SECURITY_CONFIG_FILE);
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmpFile = `${SECURITY_CONFIG_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), "utf8");
      fs.renameSync(tmpFile, SECURITY_CONFIG_FILE);
    }
  } catch (err) {
    console.error("Error writing admin-security-config.json:", err);
  }
}
__name(writeSecurityConfigToDisk, "writeSecurityConfigToDisk");

function extractFirstHeaderToken(raw) {
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (typeof val !== "string" || !val.trim()) return "";
  return val.split(",")[0].trim();
}
__name(extractFirstHeaderToken, "extractFirstHeaderToken");

function resolveClientRateLimitKey(req) {
  let candidate = "";
  if (Boolean(process.env.VERCEL)) {
    // On Vercel Serverless, prioritize Edge-injected unspoofable client IP headers
    candidate = extractFirstHeaderToken(req.headers["x-vercel-forwarded-for"]) || extractFirstHeaderToken(req.headers["x-real-ip"]);
  }
  if (!candidate) {
    candidate = req.ip || req.socket?.remoteAddress || "127.0.0.1";
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.split(":")[0];
  }
  if (candidate.startsWith("::ffff:")) {
    candidate = candidate.slice(7);
  }
  try {
    return ipKeyGenerator(candidate || "127.0.0.1");
  } catch {
    return candidate || "127.0.0.1";
  }
}
__name(resolveClientRateLimitKey, "resolveClientRateLimitKey");

function computeRetryAfterSecondsFromRateLimit(req, fallbackWindowMs) {
  const resetTime = req.rateLimit?.resetTime;
  if (resetTime instanceof Date) {
    const diffSec = Math.ceil((resetTime.getTime() - Date.now()) / 1e3);
    if (diffSec > 0) return diffSec;
  }
  return Math.ceil(fallbackWindowMs / 1e3);
}
__name(computeRetryAfterSecondsFromRateLimit, "computeRetryAfterSecondsFromRateLimit");

function buildNbaApiInMemoryLimiter(cfg) {
  const nbaApiWindowMs = cfg.nbaApiWindowMinutes * 60 * 1e3;
  return rateLimit({
    windowMs: nbaApiWindowMs,
    limit: cfg.nbaApiLimit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    validate: false,
    keyGenerator: __name((req) => `nba_api:${resolveClientRateLimitKey(req)}`, "keyGenerator"),
    handler: __name((req, res) => {
      const retryAfterSeconds = computeRetryAfterSecondsFromRateLimit(req, nbaApiWindowMs);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: `Has superado el l\xEDmite de peticiones en la API (${cfg.nbaApiLimit} cada ${cfg.nbaApiWindowMinutes} min). Espera unos segundos antes de continuar.`,
        code: "NBA_API_RATE_LIMIT",
        retryAfterSeconds
      });
    }, "handler")
  });
}
__name(buildNbaApiInMemoryLimiter, "buildNbaApiInMemoryLimiter");

let currentSecurityConfig = readSecurityConfigFromDisk();
let activeNbaApiLimiter = buildNbaApiInMemoryLimiter(currentSecurityConfig);
let rateLimitEpoch = 1;
let lastRedisSecuritySyncAt = 0;
let inflightRedisSecuritySync = null;

const localFixedWindowCounters = /* @__PURE__ */ new Map();

function pruneLocalCountersIfNeeded(now) {
  if (localFixedWindowCounters.size <= MAX_LOCAL_COUNTER_ENTRIES) return;
  for (const [k, entry] of localFixedWindowCounters.entries()) {
    if (entry.expiresAt <= now) {
      localFixedWindowCounters.delete(k);
    }
  }
  if (localFixedWindowCounters.size > MAX_LOCAL_COUNTER_ENTRIES) {
    const overflow = localFixedWindowCounters.size - MAX_LOCAL_COUNTER_ENTRIES;
    let deleted = 0;
    for (const k of localFixedWindowCounters.keys()) {
      localFixedWindowCounters.delete(k);
      deleted += 1;
      if (deleted >= overflow) break;
    }
  }
}
__name(pruneLocalCountersIfNeeded, "pruneLocalCountersIfNeeded");

function buildDistributedRateLimitKey(scope, ipKey) {
  return `${REDIS_RATE_LIMIT_KEY_PREFIX}:e${rateLimitEpoch}:${scope}:${ipKey}`;
}
__name(buildDistributedRateLimitKey, "buildDistributedRateLimitKey");

function applyDraft7RateLimitHeaders(res, limit, remaining, resetSeconds, windowMs) {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1e3));
  const safeRemaining = Math.max(0, remaining);
  const safeReset = Math.max(1, resetSeconds);
  res.setHeader("RateLimit-Policy", `${limit};w=${windowSec}`);
  res.setHeader("RateLimit", `limit=${limit}, remaining=${safeRemaining}, reset=${safeReset}`);
}
__name(applyDraft7RateLimitHeaders, "applyDraft7RateLimitHeaders");

async function syncSecurityStateFromRedisIfStale(force = false) {
  const redisCfg = getRedisRestConfig();
  if (!redisCfg) return;
  const now = Date.now();
  if (!force && now - lastRedisSecuritySyncAt < SECURITY_STATE_SYNC_TTL_MS) {
    return;
  }
  if (inflightRedisSecuritySync) {
    await inflightRedisSecuritySync;
    return;
  }
  inflightRedisSecuritySync = (async () => {
    try {
      const raw = await executeUpstashCommand(redisCfg, ["GET", REDIS_SECURITY_STATE_KEY], REDIS_RATE_LIMIT_TIMEOUT_MS);
      lastRedisSecuritySyncAt = Date.now();
      if (!raw || typeof raw !== "string") return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.epoch === "number" && Number.isFinite(parsed.epoch) && parsed.epoch > rateLimitEpoch) {
        rateLimitEpoch = Math.floor(parsed.epoch);
        localFixedWindowCounters.clear();
      }
      const validCfg = parseValidatedSecurityConfigObject(parsed.config);
      if (validCfg && validCfg.updatedAt > currentSecurityConfig.updatedAt) {
        currentSecurityConfig = validCfg;
        activeNbaApiLimiter = buildNbaApiInMemoryLimiter(validCfg);
      }
    } catch {
      // Fail-open to local state if Upstash is temporarily unreachable
      lastRedisSecuritySyncAt = Date.now();
    } finally {
      inflightRedisSecuritySync = null;
    }
  })();
  await inflightRedisSecuritySync;
}
__name(syncSecurityStateFromRedisIfStale, "syncSecurityStateFromRedisIfStale");

async function persistSecurityStateToRedis(config, epoch) {
  const redisCfg = getRedisRestConfig();
  if (!redisCfg) return;
  try {
    const payload = JSON.stringify({ config, epoch });
    await executeUpstashCommand(redisCfg, ["SET", REDIS_SECURITY_STATE_KEY, payload], REDIS_RATE_LIMIT_TIMEOUT_MS);
    lastRedisSecuritySyncAt = Date.now();
  } catch (err) {
    console.error("[RadarNBA Security] Error persisting security state to Upstash Redis:", err);
  }
}
__name(persistSecurityStateToRedis, "persistSecurityStateToRedis");

async function incrementDistributedCounter(scope, ipKey, windowMs) {
  await syncSecurityStateFromRedisIfStale(false);
  const fullKey = buildDistributedRateLimitKey(scope, ipKey);
  const now = Date.now();
  pruneLocalCountersIfNeeded(now);

  // Mirror in local memory so fallback remains coherent on transient network blips
  const existingLocal = localFixedWindowCounters.get(fullKey);
  let localEntry;
  if (!existingLocal || existingLocal.expiresAt <= now) {
    localEntry = { count: 1, expiresAt: now + windowMs };
  } else {
    localEntry = { count: existingLocal.count + 1, expiresAt: existingLocal.expiresAt };
  }
  localFixedWindowCounters.set(fullKey, localEntry);

  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      const result = await executeUpstashCommand(
        redisCfg,
        ["EVAL", LUA_FIXED_WINDOW_INCR, "1", fullKey, String(windowMs)],
        REDIS_RATE_LIMIT_TIMEOUT_MS
      );
      if (Array.isArray(result) && result.length >= 2) {
        const count = Number(result[0]) || 1;
        const pttlMs = Number(result[1]) > 0 ? Number(result[1]) : windowMs;
        localFixedWindowCounters.set(fullKey, { count, expiresAt: Date.now() + pttlMs });
        return { count, pttlMs, backend: "upstash-redis" };
      }
    } catch (err) {
      console.warn("[RadarNBA Security] Upstash rate-limit increment fallback to memory:", err?.message || err);
    }
  }

  return {
    count: localEntry.count,
    pttlMs: Math.max(1e3, localEntry.expiresAt - now),
    backend: "memory"
  };
}
__name(incrementDistributedCounter, "incrementDistributedCounter");

async function peekDistributedCounter(scope, ipKey, windowMs) {
  await syncSecurityStateFromRedisIfStale(false);
  const fullKey = buildDistributedRateLimitKey(scope, ipKey);
  const now = Date.now();

  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      const result = await executeUpstashCommand(
        redisCfg,
        ["EVAL", LUA_PEEK_COUNTER, "1", fullKey],
        REDIS_RATE_LIMIT_TIMEOUT_MS
      );
      if (Array.isArray(result) && result.length >= 2) {
        const count = Math.max(0, Number(result[0]) || 0);
        const rawPttl = Number(result[1]);
        const pttlMs = count > 0 && rawPttl > 0 ? rawPttl : windowMs;
        if (count > 0 && rawPttl > 0) {
          localFixedWindowCounters.set(fullKey, { count, expiresAt: Date.now() + rawPttl });
        } else {
          localFixedWindowCounters.delete(fullKey);
        }
        return { count, pttlMs, backend: "upstash-redis" };
      }
    } catch (err) {
      console.warn("[RadarNBA Security] Upstash rate-limit peek fallback to memory:", err?.message || err);
    }
  }

  const existingLocal = localFixedWindowCounters.get(fullKey);
  if (!existingLocal || existingLocal.expiresAt <= now) {
    if (existingLocal) localFixedWindowCounters.delete(fullKey);
    return { count: 0, pttlMs: windowMs, backend: "memory" };
  }
  return {
    count: existingLocal.count,
    pttlMs: Math.max(1e3, existingLocal.expiresAt - now),
    backend: "memory"
  };
}
__name(peekDistributedCounter, "peekDistributedCounter");

async function deleteDistributedCounter(scope, ipKey) {
  const fullKey = buildDistributedRateLimitKey(scope, ipKey);
  localFixedWindowCounters.delete(fullKey);
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      await executeUpstashCommand(redisCfg, ["DEL", fullKey], REDIS_RATE_LIMIT_TIMEOUT_MS);
    } catch {
      // Ignore transient Redis error on cleanup
    }
  }
}
__name(deleteDistributedCounter, "deleteDistributedCounter");

function getRateLimitBackendInfo() {
  const configured = getRedisRestConfig() !== null;
  return {
    rateLimitBackend: configured ? "upstash-redis" : "memory",
    distributedRateLimit: configured
  };
}
__name(getRateLimitBackendInfo, "getRateLimitBackendInfo");

async function getAdminSecurityConfig() {
  await syncSecurityStateFromRedisIfStale(true);
  return { ...currentSecurityConfig };
}
__name(getAdminSecurityConfig, "getAdminSecurityConfig");

async function saveAdminSecurityConfig(nextValues) {
  await syncSecurityStateFromRedisIfStale(true);
  const updated = { ...nextValues, updatedAt: Date.now() };
  currentSecurityConfig = updated;
  writeSecurityConfigToDisk(updated);
  activeNbaApiLimiter = buildNbaApiInMemoryLimiter(updated);
  await persistSecurityStateToRedis(updated, rateLimitEpoch);
  return { ...updated };
}
__name(saveAdminSecurityConfig, "saveAdminSecurityConfig");

async function resetAdminSecurityConfigToDefaults() {
  await syncSecurityStateFromRedisIfStale(true);
  const restored = { ...DEFAULT_ADMIN_SECURITY_VALUES, updatedAt: Date.now() };
  currentSecurityConfig = restored;
  writeSecurityConfigToDisk(restored);
  activeNbaApiLimiter = buildNbaApiInMemoryLimiter(restored);
  await persistSecurityStateToRedis(restored, rateLimitEpoch);
  return { ...restored };
}
__name(resetAdminSecurityConfigToDefaults, "resetAdminSecurityConfigToDefaults");

async function resetAllRateLimitCounters() {
  await syncSecurityStateFromRedisIfStale(true);
  rateLimitEpoch = Math.max(rateLimitEpoch + 1, Date.now());
  localFixedWindowCounters.clear();
  activeNbaApiLimiter = buildNbaApiInMemoryLimiter(currentSecurityConfig);
  await persistSecurityStateToRedis(currentSecurityConfig, rateLimitEpoch);
}
__name(resetAllRateLimitCounters, "resetAllRateLimitCounters");

async function recordAdminLoginFailure(req) {
  const windowMs = currentSecurityConfig.adminBruteForceWindowMinutes * 60 * 1e3;
  const ipKey = resolveClientRateLimitKey(req);
  return incrementDistributedCounter("admin_login", ipKey, windowMs);
}
__name(recordAdminLoginFailure, "recordAdminLoginFailure");

async function resetAdminBruteForceForRequest(req) {
  const ipKey = resolveClientRateLimitKey(req);
  await deleteDistributedCounter("admin_login", ipKey);
}
__name(resetAdminBruteForceForRequest, "resetAdminBruteForceForRequest");

function nbaApiRateLimiter(req, res, next) {
  void activeNbaApiLimiter(req, res, next);
}
__name(nbaApiRateLimiter, "nbaApiRateLimiter");

async function nbaHeavyRefreshLimiter(req, res, next) {
  const flag = String(req.query.refresh || "").toLowerCase();
  if (flag !== "1" && flag !== "true") {
    next();
    return;
  }
  try {
    const cfg = currentSecurityConfig;
    const windowMs = cfg.nbaRefreshWindowMinutes * 60 * 1e3;
    const ipKey = resolveClientRateLimitKey(req);
    const { count, pttlMs } = await incrementDistributedCounter("nba_refresh", ipKey, windowMs);
    const retryAfterSeconds = Math.max(1, Math.ceil(pttlMs / 1e3));
    applyDraft7RateLimitHeaders(res, cfg.nbaRefreshLimit, cfg.nbaRefreshLimit - count, retryAfterSeconds, windowMs);
    if (count > cfg.nbaRefreshLimit) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: `Demasiadas actualizaciones forzadas seguidas (m\xE1x. ${cfg.nbaRefreshLimit} cada ${cfg.nbaRefreshWindowMinutes} min). Espera unos instantes antes de volver a actualizar.`,
        code: "NBA_REFRESH_RATE_LIMIT",
        retryAfterSeconds
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
__name(nbaHeavyRefreshLimiter, "nbaHeavyRefreshLimiter");

async function adminEndpointFloodLimiter(req, res, next) {
  try {
    const cfg = currentSecurityConfig;
    const windowMs = cfg.adminFloodWindowMinutes * 60 * 1e3;
    const ipKey = resolveClientRateLimitKey(req);
    const { count, pttlMs } = await incrementDistributedCounter("admin_flood", ipKey, windowMs);
    const retryAfterSeconds = Math.max(1, Math.ceil(pttlMs / 1e3));
    applyDraft7RateLimitHeaders(res, cfg.adminFloodLimit, cfg.adminFloodLimit - count, retryAfterSeconds, windowMs);
    if (count > cfg.adminFloodLimit) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: "Demasiadas solicitudes sobre la zona privada. Acceso pausado temporalmente por seguridad.",
        code: "ADMIN_FLOOD_RATE_LIMIT",
        retryAfterSeconds
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
__name(adminEndpointFloodLimiter, "adminEndpointFloodLimiter");

async function adminBruteForceLimiter(req, res, next) {
  try {
    const cfg = currentSecurityConfig;
    const windowMs = cfg.adminBruteForceWindowMinutes * 60 * 1e3;
    const ipKey = resolveClientRateLimitKey(req);
    const { count, pttlMs } = await peekDistributedCounter("admin_login", ipKey, windowMs);
    const retryAfterSeconds = Math.max(1, Math.ceil(pttlMs / 1e3));
    applyDraft7RateLimitHeaders(
      res,
      cfg.adminBruteForceMaxAttempts,
      cfg.adminBruteForceMaxAttempts - count,
      retryAfterSeconds,
      windowMs
    );
    if (count >= cfg.adminBruteForceMaxAttempts) {
      const retryMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        ok: false,
        error: `Demasiados intentos fallidos (m\xE1x. ${cfg.adminBruteForceMaxAttempts}). Acceso bloqueado temporalmente por seguridad (${retryMinutes} min).`,
        code: "ADMIN_BRUTE_FORCE_LOCKED",
        retryAfterSeconds
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
__name(adminBruteForceLimiter, "adminBruteForceLimiter");

async function verifyAdminPasscodeConstantTime(candidateRaw) {
  if (typeof candidateRaw !== "string") return false;
  const candidate = candidateRaw.trim();
  if (!candidate || candidate.length > 128) return false;
  const material = getDerivedAdminCryptoMaterial();
  if (!material) return false;
  const candidateKey = await deriveScryptKeyAsync(candidate.normalize("NFKC"), material.passcodeSalt);
  if (candidateKey.length !== material.expectedPasscodeKey.length) return false;
  return crypto.timingSafeEqual(candidateKey, material.expectedPasscodeKey);
}
__name(verifyAdminPasscodeConstantTime, "verifyAdminPasscodeConstantTime");

function issueAdminSessionToken() {
  const material = getDerivedAdminCryptoMaterial();
  if (!material) {
    throw new Error("ADMIN_ENV_NOT_CONFIGURED");
  }
  const now = Date.now();
  const ttlMs = currentSecurityConfig.adminSessionTtlHours * 60 * 60 * 1e3;
  const expiresAt = now + ttlMs;
  const payload = { sub: "radarnba_admin", iat: now, exp: expiresAt, jti: crypto.randomBytes(8).toString("hex") };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sigB64 = crypto.createHmac("sha256", material.sessionSigningKey).update(`v2.${payloadB64}`, "utf8").digest("base64url");
  return { token: `v2.${payloadB64}.${sigB64}`, expiresAt };
}
__name(issueAdminSessionToken, "issueAdminSessionToken");

function verifyAdminSessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return { valid: false };
  const material = getDerivedAdminCryptoMaterial();
  if (!material) return { valid: false };
  const parts = rawToken.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "v2") return { valid: false };
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64 || payloadB64.length > 512 || sigB64.length > 128) return { valid: false };
  let sigBuf;
  try {
    sigBuf = Buffer.from(sigB64, "base64url");
  } catch {
    return { valid: false };
  }
  const expectedBuf = crypto.createHmac("sha256", material.sessionSigningKey).update(`v2.${payloadB64}`, "utf8").digest();
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false };
  }
  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!decoded || decoded.sub !== "radarnba_admin" || typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp) || decoded.exp <= Date.now()) {
      return { valid: false };
    }
    return { valid: true, expiresAt: decoded.exp };
  } catch {
    return { valid: false };
  }
}
__name(verifyAdminSessionToken, "verifyAdminSessionToken");

function parseCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    if (k === name) {
      try {
        return decodeURIComponent(pair.slice(idx + 1).trim());
      } catch {
        return pair.slice(idx + 1).trim();
      }
    }
  }
  return null;
}
__name(parseCookieValue, "parseCookieValue");

function extractAdminTokenFromRequest(req) {
  // Exclusive HttpOnly cookie session extraction (no JS-accessible Bearer/custom headers)
  return parseCookieValue(req.headers.cookie, ADMIN_COOKIE_NAME);
}
__name(extractAdminTokenFromRequest, "extractAdminTokenFromRequest");

function getTrustedExpectedHosts(req) {
  const hosts = /* @__PURE__ */ new Set();
  const hostHdr = extractFirstHeaderToken(req.headers.host);
  if (hostHdr) {
    hosts.add(hostHdr.toLowerCase());
  }
  if (Boolean(process.env.VERCEL)) {
    const fwdHost = extractFirstHeaderToken(req.headers["x-forwarded-host"]);
    if (fwdHost) {
      hosts.add(fwdHost.toLowerCase());
    }
    const vercelUrl = (process.env.VERCEL_URL || "").trim();
    if (vercelUrl) {
      hosts.add(vercelUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase());
    }
  }
  const appUrl = (process.env.APP_URL || "").trim();
  if (appUrl && /^https?:\/\//i.test(appUrl)) {
    try {
      hosts.add(new URL(appUrl).host.toLowerCase());
    } catch {
    }
  }
  return hosts;
}
__name(getTrustedExpectedHosts, "getTrustedExpectedHosts");

function extractUrlHostSafe(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === "null") return null;
  try {
    return new URL(trimmed).host.toLowerCase();
  } catch {
    return null;
  }
}
__name(extractUrlHostSafe, "extractUrlHostSafe");

function requireAdminCsrfProtection(req, res, next) {
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }

  const csrfTokenHeader = extractFirstHeaderToken(req.headers[ADMIN_CSRF_HEADER_NAME]);
  if (csrfTokenHeader !== ADMIN_CSRF_HEADER_VALUE) {
    res.setHeader("Cache-Control", "no-store");
    res.status(403).json({
      ok: false,
      error: "Solicitud bloqueada por protecci\xF3n CSRF (cabecera de verificaci\xF3n ausente).",
      code: "ADMIN_CSRF_REJECTED"
    });
    return;
  }

  const trustedHosts = getTrustedExpectedHosts(req);
  if (trustedHosts.size === 0) {
    res.setHeader("Cache-Control", "no-store");
    res.status(403).json({
      ok: false,
      error: "Solicitud bloqueada por protecci\xF3n CSRF (Host de destino no verificable).",
      code: "ADMIN_CSRF_REJECTED"
    });
    return;
  }

  const rawOrigin = extractFirstHeaderToken(req.headers.origin);
  const rawReferer = extractFirstHeaderToken(req.headers.referer);
  if (!rawOrigin && !rawReferer) {
    res.setHeader("Cache-Control", "no-store");
    res.status(403).json({
      ok: false,
      error: "Solicitud bloqueada por protecci\xF3n CSRF (cabecera Origin/Referer obligatoria).",
      code: "ADMIN_CSRF_REJECTED"
    });
    return;
  }

  if (rawOrigin) {
    const originHost = extractUrlHostSafe(rawOrigin);
    if (!originHost || !trustedHosts.has(originHost)) {
      res.setHeader("Cache-Control", "no-store");
      res.status(403).json({
        ok: false,
        error: "Solicitud bloqueada por protecci\xF3n CSRF (origen cruzado no autorizado).",
        code: "ADMIN_CSRF_REJECTED"
      });
      return;
    }
  } else if (rawReferer) {
    const refererHost = extractUrlHostSafe(rawReferer);
    if (!refererHost || !trustedHosts.has(refererHost)) {
      res.setHeader("Cache-Control", "no-store");
      res.status(403).json({
        ok: false,
        error: "Solicitud bloqueada por protecci\xF3n CSRF (referencia cruzada no autorizada).",
        code: "ADMIN_CSRF_REJECTED"
      });
      return;
    }
  }

  next();
}
__name(requireAdminCsrfProtection, "requireAdminCsrfProtection");

function requireAdminAuth(req, res, next) {
  const readiness = getAdminAuthReadiness();
  if (!readiness.configured) {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      error: readiness.reason || "Acceso administrativo deshabilitado por seguridad.",
      code: readiness.code || "ADMIN_ENV_NOT_CONFIGURED"
    });
    return;
  }
  const token = extractAdminTokenFromRequest(req);
  const check = verifyAdminSessionToken(token);
  if (!check.valid) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json({ error: "No autorizado. Inicia sesi\xF3n en la zona privada /admin.", code: "ADMIN_AUTH_REQUIRED" });
    return;
  }
  next();
}
__name(requireAdminAuth, "requireAdminAuth");

export {
  ADMIN_COOKIE_NAME,
  ADMIN_CSRF_HEADER_NAME,
  ADMIN_CSRF_HEADER_VALUE,
  DEFAULT_ADMIN_SECURITY_CONFIG,
  DEFAULT_ADMIN_SECURITY_VALUES,
  adminBruteForceLimiter,
  adminEndpointFloodLimiter,
  buildAdminSessionCookieHeader,
  buildClearAdminSessionCookieHeader,
  extractAdminTokenFromRequest,
  getAdminAuthReadiness,
  getAdminSecurityConfig,
  getRateLimitBackendInfo,
  issueAdminSessionToken,
  nbaApiRateLimiter,
  nbaHeavyRefreshLimiter,
  recordAdminLoginFailure,
  requireAdminAuth,
  requireAdminCsrfProtection,
  resetAdminBruteForceForRequest,
  resetAdminSecurityConfigToDefaults,
  resetAllRateLimitCounters,
  resolveClientRateLimitKey,
  saveAdminSecurityConfig,
  verifyAdminPasscodeConstantTime,
  verifyAdminSessionToken
};
