// @ts-nocheck
const __name = (fn, _n) => fn;
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { adminSecurityConfigBodySchema } from "./validationSchemas.ts";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = [path.resolve(process.cwd(), "data"), path.resolve(__dirname, "../data"), path.resolve(__dirname, "../../data")].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "data");
const SECURITY_CONFIG_FILE = path.join(DATA_DIR, "admin-security-config.json");
const SERVERLESS_TMP_SECURITY_CONFIG_FILE = "/tmp/radarnba-admin-security-config.json";
const DEFAULT_ADMIN_PASSCODE = "19.Sirio.85";
const ADMIN_COOKIE_NAME = "radarnba_admin_session";
const DEFAULT_ADMIN_SECURITY_VALUES = { nbaApiLimit: 120, nbaApiWindowMinutes: 1, nbaRefreshLimit: 15, nbaRefreshWindowMinutes: 5, adminBruteForceMaxAttempts: 5, adminBruteForceWindowMinutes: 15, adminFloodLimit: 40, adminFloodWindowMinutes: 15, adminSessionTtlHours: 12 };
const DEFAULT_ADMIN_SECURITY_CONFIG = { ...DEFAULT_ADMIN_SECURITY_VALUES, updatedAt: 0 };
function readSecurityConfigFromDisk() {
  const candidates = process.env.VERCEL ? [SERVERLESS_TMP_SECURITY_CONFIG_FILE, SECURITY_CONFIG_FILE] : [SECURITY_CONFIG_FILE];
  for (const target of candidates) {
    try {
      if (!fs.existsSync(target)) continue;
      const rawContent = fs.readFileSync(target, "utf8");
      const parsed = JSON.parse(rawContent);
      if (!parsed || typeof parsed !== "object") continue;
      const { updatedAt: rawUpdatedAt, ...rest } = parsed;
      const check = adminSecurityConfigBodySchema.safeParse(rest);
      if (check.success) {
        const updatedAt = typeof rawUpdatedAt === "number" && Number.isFinite(rawUpdatedAt) && rawUpdatedAt >= 0 ? rawUpdatedAt : Date.now();
        return { ...check.data, updatedAt };
      }
    } catch {
    }
  }
  return { ...DEFAULT_ADMIN_SECURITY_CONFIG };
}
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
function getConfiguredAdminPasscode() {
  const fromEnv = (process.env.ADMIN_PASSCODE || "").trim();
  return fromEnv || DEFAULT_ADMIN_PASSCODE;
}
function getTokenSigningSecret() {
  const passcode = getConfiguredAdminPasscode();
  const extraSalt = (process.env.ADMIN_TOKEN_SECRET || "radarnba-admin-hmac-v1").trim();
  return crypto.createHmac("sha256", "radarnba-signing-key-derivation").update(`${passcode}|${extraSalt}`).digest();
}
function resolveClientRateLimitKey(req) {
  const vercelFwd = req.headers["x-vercel-forwarded-for"];
  const stdFwd = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  const rawHeader = (Array.isArray(vercelFwd) ? vercelFwd[0] : vercelFwd) || (Array.isArray(stdFwd) ? stdFwd[0] : stdFwd) || (Array.isArray(realIp) ? realIp[0] : realIp) || "";
  let candidate = rawHeader.split(",")[0]?.trim() || req.ip || req.socket?.remoteAddress || "127.0.0.1";
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
function computeRetryAfterSeconds(req, fallbackWindowMs) {
  const resetTime = req.rateLimit?.resetTime;
  if (resetTime instanceof Date) {
    const diffSec = Math.ceil((resetTime.getTime() - Date.now()) / 1e3);
    if (diffSec > 0) return diffSec;
  }
  return Math.ceil(fallbackWindowMs / 1e3);
}
function buildRateLimitersBundle(cfg) {
  const nbaApiWindowMs = cfg.nbaApiWindowMinutes * 60 * 1e3;
  const nbaRefreshWindowMs = cfg.nbaRefreshWindowMinutes * 60 * 1e3;
  const adminFloodWindowMs = cfg.adminFloodWindowMinutes * 60 * 1e3;
  const adminBruteForceWindowMs = cfg.adminBruteForceWindowMinutes * 60 * 1e3;
  const nbaApi = rateLimit({ windowMs: nbaApiWindowMs, limit: cfg.nbaApiLimit, standardHeaders: "draft-7", legacyHeaders: false, validate: false, keyGenerator: __name((req) => `nba_api:${resolveClientRateLimitKey(req)}`, "keyGenerator"), handler: __name((req, res) => {
    const retryAfterSeconds = computeRetryAfterSeconds(req, nbaApiWindowMs);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: `Has superado el l\xEDmite de peticiones en la API (${cfg.nbaApiLimit} cada ${cfg.nbaApiWindowMinutes} min). Espera unos segundos antes de continuar.`, code: "NBA_API_RATE_LIMIT", retryAfterSeconds });
  }, "handler") });
  const nbaRefresh = rateLimit({ windowMs: nbaRefreshWindowMs, limit: cfg.nbaRefreshLimit, skip: __name((req) => {
    const flag = String(req.query.refresh || "").toLowerCase();
    return flag !== "1" && flag !== "true";
  }, "skip"), standardHeaders: "draft-7", legacyHeaders: false, validate: false, keyGenerator: __name((req) => `nba_refresh:${resolveClientRateLimitKey(req)}`, "keyGenerator"), handler: __name((req, res) => {
    const retryAfterSeconds = computeRetryAfterSeconds(req, nbaRefreshWindowMs);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: `Demasiadas actualizaciones forzadas seguidas (m\xE1x. ${cfg.nbaRefreshLimit} cada ${cfg.nbaRefreshWindowMinutes} min). Espera unos instantes antes de volver a actualizar.`, code: "NBA_REFRESH_RATE_LIMIT", retryAfterSeconds });
  }, "handler") });
  const adminFlood = rateLimit({ windowMs: adminFloodWindowMs, limit: cfg.adminFloodLimit, standardHeaders: "draft-7", legacyHeaders: false, validate: false, keyGenerator: __name((req) => `admin_flood:${resolveClientRateLimitKey(req)}`, "keyGenerator"), handler: __name((req, res) => {
    const retryAfterSeconds = computeRetryAfterSeconds(req, adminFloodWindowMs);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: "Demasiadas solicitudes sobre la zona privada. Acceso pausado temporalmente por seguridad.", code: "ADMIN_FLOOD_RATE_LIMIT", retryAfterSeconds });
  }, "handler") });
  const adminBruteForce = rateLimit({ windowMs: adminBruteForceWindowMs, limit: cfg.adminBruteForceMaxAttempts, skipSuccessfulRequests: true, standardHeaders: "draft-7", legacyHeaders: false, validate: false, keyGenerator: __name((req) => `admin_login:${resolveClientRateLimitKey(req)}`, "keyGenerator"), handler: __name((req, res) => {
    const retryAfterSeconds = computeRetryAfterSeconds(req, adminBruteForceWindowMs);
    const retryMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ ok: false, error: `Demasiados intentos fallidos (m\xE1x. ${cfg.adminBruteForceMaxAttempts}). Acceso bloqueado temporalmente por seguridad (${retryMinutes} min).`, code: "ADMIN_BRUTE_FORCE_LOCKED", retryAfterSeconds });
  }, "handler") });
  return { nbaApi, nbaRefresh, adminFlood, adminBruteForce };
}
let currentSecurityConfig = readSecurityConfigFromDisk();
let activeLimiters = buildRateLimitersBundle(currentSecurityConfig);
function getAdminSecurityConfig() {
  return { ...currentSecurityConfig };
}
function saveAdminSecurityConfig(nextValues) {
  const updated = { ...nextValues, updatedAt: Date.now() };
  currentSecurityConfig = updated;
  writeSecurityConfigToDisk(updated);
  activeLimiters = buildRateLimitersBundle(updated);
  return { ...updated };
}
function resetAdminSecurityConfigToDefaults() {
  const restored = { ...DEFAULT_ADMIN_SECURITY_VALUES, updatedAt: Date.now() };
  currentSecurityConfig = restored;
  writeSecurityConfigToDisk(restored);
  activeLimiters = buildRateLimitersBundle(restored);
  return { ...restored };
}
function resetAllRateLimitCounters() {
  activeLimiters = buildRateLimitersBundle(currentSecurityConfig);
}
function resetAdminBruteForceForRequest(req) {
  activeLimiters.adminBruteForce.resetKey(`admin_login:${resolveClientRateLimitKey(req)}`);
}
function nbaApiRateLimiter(req, res, next) {
  void activeLimiters.nbaApi(req, res, next);
}
function nbaHeavyRefreshLimiter(req, res, next) {
  void activeLimiters.nbaRefresh(req, res, next);
}
function adminEndpointFloodLimiter(req, res, next) {
  void activeLimiters.adminFlood(req, res, next);
}
function adminBruteForceLimiter(req, res, next) {
  void activeLimiters.adminBruteForce(req, res, next);
}
function verifyAdminPasscodeConstantTime(candidateRaw) {
  if (typeof candidateRaw !== "string") return false;
  const candidate = candidateRaw.trim();
  if (!candidate || candidate.length > 128) return false;
  const expected = getConfiguredAdminPasscode();
  const candidateHash = crypto.createHash("sha256").update(candidate, "utf8").digest();
  const expectedHash = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(candidateHash, expectedHash);
}
function issueAdminSessionToken() {
  const now = Date.now();
  const ttlMs = currentSecurityConfig.adminSessionTtlHours * 60 * 60 * 1e3;
  const expiresAt = now + ttlMs;
  const payload = { sub: "radarnba_admin", iat: now, exp: expiresAt };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sigB64 = crypto.createHmac("sha256", getTokenSigningSecret()).update(`v1.${payloadB64}`, "utf8").digest("base64url");
  return { token: `v1.${payloadB64}.${sigB64}`, expiresAt };
}
function verifyAdminSessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return { valid: false };
  const parts = rawToken.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { valid: false };
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return { valid: false };
  const expectedSigB64 = crypto.createHmac("sha256", getTokenSigningSecret()).update(`v1.${payloadB64}`, "utf8").digest("base64url");
  const sigBuf = Buffer.from(sigB64, "utf8");
  const expectedBuf = Buffer.from(expectedSigB64, "utf8");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false };
  }
  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (decoded.sub !== "radarnba_admin" || typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp) || decoded.exp <= Date.now()) {
      return { valid: false };
    }
    return { valid: true, expiresAt: decoded.exp };
  } catch {
    return { valid: false };
  }
}
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
function extractAdminTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const customHeader = req.headers["x-admin-token"];
  if (typeof customHeader === "string" && customHeader.trim()) {
    return customHeader.trim();
  }
  return parseCookieValue(req.headers.cookie, ADMIN_COOKIE_NAME);
}
function requireAdminAuth(req, res, next) {
  const token = extractAdminTokenFromRequest(req);
  const check = verifyAdminSessionToken(token);
  if (!check.valid) {
    res.status(401).json({ error: "No autorizado. Inicia sesi\xF3n en la zona privada /admin.", code: "ADMIN_AUTH_REQUIRED" });
    return;
  }
  next();
}
export {
  ADMIN_COOKIE_NAME,
  DEFAULT_ADMIN_SECURITY_CONFIG,
  DEFAULT_ADMIN_SECURITY_VALUES,
  adminBruteForceLimiter,
  adminEndpointFloodLimiter,
  extractAdminTokenFromRequest,
  getAdminSecurityConfig,
  issueAdminSessionToken,
  nbaApiRateLimiter,
  nbaHeavyRefreshLimiter,
  requireAdminAuth,
  resetAdminBruteForceForRequest,
  resetAdminSecurityConfigToDefaults,
  resetAllRateLimitCounters,
  resolveClientRateLimitKey,
  saveAdminSecurityConfig,
  verifyAdminPasscodeConstantTime,
  verifyAdminSessionToken
};
