import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { NextFunction, Request, Response } from 'express';
import {
  ipKeyGenerator,
  rateLimit,
  type RateLimitRequestHandler,
} from 'express-rate-limit';
import type {
  AdminSecurityConfig,
  AdminSecurityConfigValues,
} from '../types/nba.ts';
import { adminSecurityConfigBodySchema } from './validationSchemas.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const SECURITY_CONFIG_FILE = path.join(DATA_DIR, 'admin-security-config.json');
const SERVERLESS_TMP_SECURITY_CONFIG_FILE =
  '/tmp/radarnba-admin-security-config.json';

const DEFAULT_ADMIN_PASSCODE = '19.Sirio.85';
export const ADMIN_COOKIE_NAME = 'radarnba_admin_session';

export const DEFAULT_ADMIN_SECURITY_VALUES: AdminSecurityConfigValues = {
  nbaApiLimit: 120,
  nbaApiWindowMinutes: 1,
  nbaRefreshLimit: 15,
  nbaRefreshWindowMinutes: 5,
  adminBruteForceMaxAttempts: 5,
  adminBruteForceWindowMinutes: 15,
  adminFloodLimit: 40,
  adminFloodWindowMinutes: 15,
  adminSessionTtlHours: 12,
};

export const DEFAULT_ADMIN_SECURITY_CONFIG: AdminSecurityConfig = {
  ...DEFAULT_ADMIN_SECURITY_VALUES,
  updatedAt: 0,
};

interface AdminTokenPayload {
  sub: 'radarnba_admin';
  iat: number;
  exp: number;
}

interface AugmentedRateLimitRequest extends Request {
  rateLimit?: {
    limit: number;
    current: number;
    remaining: number;
    resetTime?: Date;
  };
}

interface ActiveRateLimitersBundle {
  nbaApi: RateLimitRequestHandler;
  nbaRefresh: RateLimitRequestHandler;
  adminFlood: RateLimitRequestHandler;
  adminBruteForce: RateLimitRequestHandler;
}

function readSecurityConfigFromDisk(): AdminSecurityConfig {
  const candidates = process.env.VERCEL
    ? [SERVERLESS_TMP_SECURITY_CONFIG_FILE, SECURITY_CONFIG_FILE]
    : [SECURITY_CONFIG_FILE];

  for (const target of candidates) {
    try {
      if (!fs.existsSync(target)) continue;
      const rawContent = fs.readFileSync(target, 'utf8');
      const parsed = JSON.parse(rawContent) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') continue;
      const { updatedAt: rawUpdatedAt, ...rest } = parsed;
      const check = adminSecurityConfigBodySchema.safeParse(rest);
      if (check.success) {
        const updatedAt =
          typeof rawUpdatedAt === 'number' &&
          Number.isFinite(rawUpdatedAt) &&
          rawUpdatedAt >= 0
            ? rawUpdatedAt
            : Date.now();
        return {
          ...check.data,
          updatedAt,
        };
      }
    } catch {
      // Fall through to next candidate or factory defaults
    }
  }

  return { ...DEFAULT_ADMIN_SECURITY_CONFIG };
}

function writeSecurityConfigToDisk(config: AdminSecurityConfig): void {
  try {
    if (process.env.VERCEL) {
      const tmpTarget = `${SERVERLESS_TMP_SECURITY_CONFIG_FILE}.tmp`;
      fs.writeFileSync(tmpTarget, JSON.stringify(config, null, 2), 'utf8');
      fs.renameSync(tmpTarget, SERVERLESS_TMP_SECURITY_CONFIG_FILE);
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmpFile = `${SECURITY_CONFIG_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf8');
      fs.renameSync(tmpFile, SECURITY_CONFIG_FILE);
    }
  } catch (err) {
    console.error('Error writing admin-security-config.json:', err);
  }
}

function getConfiguredAdminPasscode(): string {
  const fromEnv = (process.env.ADMIN_PASSCODE || '').trim();
  return fromEnv || DEFAULT_ADMIN_PASSCODE;
}

function getTokenSigningSecret(): Buffer {
  const passcode = getConfiguredAdminPasscode();
  const extraSalt = (
    process.env.ADMIN_TOKEN_SECRET || 'radarnba-admin-hmac-v1'
  ).trim();
  return crypto
    .createHmac('sha256', 'radarnba-signing-key-derivation')
    .update(`${passcode}|${extraSalt}`)
    .digest();
}

/**
 * Extracts and normalizes the client IP behind Vercel, Cloud Run, or local dev,
 * passing it through express-rate-limit's ipKeyGenerator for IPv6 subnet safety.
 */
export function resolveClientRateLimitKey(req: Request): string {
  const vercelFwd = req.headers['x-vercel-forwarded-for'];
  const stdFwd = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];

  const rawHeader =
    (Array.isArray(vercelFwd) ? vercelFwd[0] : vercelFwd) ||
    (Array.isArray(stdFwd) ? stdFwd[0] : stdFwd) ||
    (Array.isArray(realIp) ? realIp[0] : realIp) ||
    '';

  let candidate =
    rawHeader.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    '127.0.0.1';

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.split(':')[0];
  }
  if (candidate.startsWith('::ffff:')) {
    candidate = candidate.slice(7);
  }

  try {
    return ipKeyGenerator(candidate || '127.0.0.1');
  } catch {
    return candidate || '127.0.0.1';
  }
}

function computeRetryAfterSeconds(req: Request, fallbackWindowMs: number): number {
  const resetTime = (req as AugmentedRateLimitRequest).rateLimit?.resetTime;
  if (resetTime instanceof Date) {
    const diffSec = Math.ceil((resetTime.getTime() - Date.now()) / 1000);
    if (diffSec > 0) return diffSec;
  }
  return Math.ceil(fallbackWindowMs / 1000);
}

function buildRateLimitersBundle(
  cfg: AdminSecurityConfig
): ActiveRateLimitersBundle {
  const nbaApiWindowMs = cfg.nbaApiWindowMinutes * 60 * 1000;
  const nbaRefreshWindowMs = cfg.nbaRefreshWindowMinutes * 60 * 1000;
  const adminFloodWindowMs = cfg.adminFloodWindowMinutes * 60 * 1000;
  const adminBruteForceWindowMs = cfg.adminBruteForceWindowMinutes * 60 * 1000;

  const nbaApi = rateLimit({
    windowMs: nbaApiWindowMs,
    limit: cfg.nbaApiLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => `nba_api:${resolveClientRateLimitKey(req)}`,
    handler: (req, res) => {
      const retryAfterSeconds = computeRetryAfterSeconds(req, nbaApiWindowMs);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: `Has superado el límite de peticiones en la API (${cfg.nbaApiLimit} cada ${cfg.nbaApiWindowMinutes} min). Espera unos segundos antes de continuar.`,
        code: 'NBA_API_RATE_LIMIT',
        retryAfterSeconds,
      });
    },
  });

  const nbaRefresh = rateLimit({
    windowMs: nbaRefreshWindowMs,
    limit: cfg.nbaRefreshLimit,
    skip: (req) => {
      const flag = String(req.query.refresh || '').toLowerCase();
      return flag !== '1' && flag !== 'true';
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => `nba_refresh:${resolveClientRateLimitKey(req)}`,
    handler: (req, res) => {
      const retryAfterSeconds = computeRetryAfterSeconds(
        req,
        nbaRefreshWindowMs
      );
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: `Demasiadas actualizaciones forzadas seguidas (máx. ${cfg.nbaRefreshLimit} cada ${cfg.nbaRefreshWindowMinutes} min). Espera unos instantes antes de volver a actualizar.`,
        code: 'NBA_REFRESH_RATE_LIMIT',
        retryAfterSeconds,
      });
    },
  });

  const adminFlood = rateLimit({
    windowMs: adminFloodWindowMs,
    limit: cfg.adminFloodLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => `admin_flood:${resolveClientRateLimitKey(req)}`,
    handler: (req, res) => {
      const retryAfterSeconds = computeRetryAfterSeconds(
        req,
        adminFloodWindowMs
      );
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error:
          'Demasiadas solicitudes sobre la zona privada. Acceso pausado temporalmente por seguridad.',
        code: 'ADMIN_FLOOD_RATE_LIMIT',
        retryAfterSeconds,
      });
    },
  });

  const adminBruteForce = rateLimit({
    windowMs: adminBruteForceWindowMs,
    limit: cfg.adminBruteForceMaxAttempts,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => `admin_login:${resolveClientRateLimitKey(req)}`,
    handler: (req, res) => {
      const retryAfterSeconds = computeRetryAfterSeconds(
        req,
        adminBruteForceWindowMs
      );
      const retryMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        ok: false,
        error: `Demasiados intentos fallidos (máx. ${cfg.adminBruteForceMaxAttempts}). Acceso bloqueado temporalmente por seguridad (${retryMinutes} min).`,
        code: 'ADMIN_BRUTE_FORCE_LOCKED',
        retryAfterSeconds,
      });
    },
  });

  return {
    nbaApi,
    nbaRefresh,
    adminFlood,
    adminBruteForce,
  };
}

let currentSecurityConfig: AdminSecurityConfig = readSecurityConfigFromDisk();
let activeLimiters: ActiveRateLimitersBundle = buildRateLimitersBundle(
  currentSecurityConfig
);

export function getAdminSecurityConfig(): AdminSecurityConfig {
  return { ...currentSecurityConfig };
}

export function saveAdminSecurityConfig(
  nextValues: AdminSecurityConfigValues
): AdminSecurityConfig {
  const updated: AdminSecurityConfig = {
    ...nextValues,
    updatedAt: Date.now(),
  };
  currentSecurityConfig = updated;
  writeSecurityConfigToDisk(updated);
  activeLimiters = buildRateLimitersBundle(updated);
  return { ...updated };
}

export function resetAdminSecurityConfigToDefaults(): AdminSecurityConfig {
  const restored: AdminSecurityConfig = {
    ...DEFAULT_ADMIN_SECURITY_VALUES,
    updatedAt: Date.now(),
  };
  currentSecurityConfig = restored;
  writeSecurityConfigToDisk(restored);
  activeLimiters = buildRateLimitersBundle(restored);
  return { ...restored };
}

export function resetAllRateLimitCounters(): void {
  activeLimiters = buildRateLimitersBundle(currentSecurityConfig);
}

export function resetAdminBruteForceForRequest(req: Request): void {
  activeLimiters.adminBruteForce.resetKey(
    `admin_login:${resolveClientRateLimitKey(req)}`
  );
}

/**
 * Dynamic delegating middlewares so updates saved in /admin apply immediately
 * to both request caps and time windows without restarting the Node server.
 */
export function nbaApiRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  void activeLimiters.nbaApi(req, res, next);
}

export function nbaHeavyRefreshLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  void activeLimiters.nbaRefresh(req, res, next);
}

export function adminEndpointFloodLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  void activeLimiters.adminFlood(req, res, next);
}

export function adminBruteForceLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  void activeLimiters.adminBruteForce(req, res, next);
}

/**
 * Constant-time password comparison using SHA-256 digests so timing side-channels
 * cannot leak password length or character prefixes.
 */
export function verifyAdminPasscodeConstantTime(candidateRaw: unknown): boolean {
  if (typeof candidateRaw !== 'string') return false;
  const candidate = candidateRaw.trim();
  if (!candidate || candidate.length > 128) return false;

  const expected = getConfiguredAdminPasscode();
  const candidateHash = crypto
    .createHash('sha256')
    .update(candidate, 'utf8')
    .digest();
  const expectedHash = crypto
    .createHash('sha256')
    .update(expected, 'utf8')
    .digest();

  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

/**
 * Issues a stateless HMAC-SHA256 signed session token using the admin-configured
 * session duration (adminSessionTtlHours).
 */
export function issueAdminSessionToken(): { token: string; expiresAt: number } {
  const now = Date.now();
  const ttlMs = currentSecurityConfig.adminSessionTtlHours * 60 * 60 * 1000;
  const expiresAt = now + ttlMs;
  const payload: AdminTokenPayload = {
    sub: 'radarnba_admin',
    iat: now,
    exp: expiresAt,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const sigB64 = crypto
    .createHmac('sha256', getTokenSigningSecret())
    .update(`v1.${payloadB64}`, 'utf8')
    .digest('base64url');

  return {
    token: `v1.${payloadB64}.${sigB64}`,
    expiresAt,
  };
}

export function verifyAdminSessionToken(
  rawToken: string | null | undefined
): { valid: boolean; expiresAt?: number } {
  if (!rawToken || typeof rawToken !== 'string') return { valid: false };
  const parts = rawToken.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return { valid: false };

  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return { valid: false };

  const expectedSigB64 = crypto
    .createHmac('sha256', getTokenSigningSecret())
    .update(`v1.${payloadB64}`, 'utf8')
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSigB64, 'utf8');
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return { valid: false };
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as Partial<AdminTokenPayload>;

    if (
      decoded.sub !== 'radarnba_admin' ||
      typeof decoded.exp !== 'number' ||
      !Number.isFinite(decoded.exp) ||
      decoded.exp <= Date.now()
    ) {
      return { valid: false };
    }

    return { valid: true, expiresAt: decoded.exp };
  } catch {
    return { valid: false };
  }
}

function parseCookieValue(
  cookieHeader: string | undefined,
  name: string
): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
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

export function extractAdminTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (
    typeof authHeader === 'string' &&
    authHeader.toLowerCase().startsWith('bearer ')
  ) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const customHeader = req.headers['x-admin-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }

  return parseCookieValue(req.headers.cookie, ADMIN_COOKIE_NAME);
}

export function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractAdminTokenFromRequest(req);
  const check = verifyAdminSessionToken(token);
  if (!check.valid) {
    res.status(401).json({
      error: 'No autorizado. Inicia sesión en la zona privada /admin.',
      code: 'ADMIN_AUTH_REQUIRED',
    });
    return;
  }
  next();
}
