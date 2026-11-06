import type {
  AdminSecurityConfig,
  AdminSecurityConfigValues,
} from '../types/nba';

const LEGACY_TOKEN_V2_STORAGE_KEY = 'radarnba_admin_token_v2';
const LEGACY_TOKEN_V1_STORAGE_KEY = 'radarnba_admin_token_v1';
const LEGACY_UNLOCKED_STORAGE_KEY = 'radarnba_private_unlocked';
const ADMIN_SECURITY_BACKUP_KEY = 'radarnba_admin_security_config_v1';
const ADMIN_CSRF_HEADER_NAME = 'X-RadarNBA-CSRF';
const ADMIN_CSRF_HEADER_VALUE = '1';

export type RateLimitBackendKind = 'upstash-redis' | 'memory';

export const CLIENT_DEFAULT_SECURITY_VALUES: AdminSecurityConfigValues = {
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

export const CLIENT_SECURITY_BOUNDS: Record<
  keyof AdminSecurityConfigValues,
  { min: number; max: number }
> = {
  nbaApiLimit: { min: 20, max: 2000 },
  nbaApiWindowMinutes: { min: 1, max: 60 },
  nbaRefreshLimit: { min: 2, max: 200 },
  nbaRefreshWindowMinutes: { min: 1, max: 60 },
  adminBruteForceMaxAttempts: { min: 2, max: 25 },
  adminBruteForceWindowMinutes: { min: 1, max: 180 },
  adminFloodLimit: { min: 10, max: 500 },
  adminFloodWindowMinutes: { min: 1, max: 180 },
  adminSessionTtlHours: { min: 1, max: 168 },
};

export interface AdminLoginResult {
  ok: boolean;
  error?: string;
  lockedOut?: boolean;
  notConfigured?: boolean;
  retryAfterSeconds?: number;
  expiresAt?: number;
}

export interface CircuitMetricsClient {
  provider: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  failureThreshold: number;
  totalFailures: number;
  totalSuccesses: number;
  totalShortCircuits: number;
  trippedCount: number;
  lastFailureTime: string | null;
  lastFailureReason: string | null;
  lastSuccessTime: string | null;
  cooldownMs: number;
  openRemainingMs: number;
}

export interface AdminSecurityConfigResponse {
  ok: boolean;
  config?: AdminSecurityConfig;
  defaults?: AdminSecurityConfigValues;
  rateLimitBackend?: RateLimitBackendKind;
  circuits?: Record<string, CircuitMetricsClient>;
  error?: string;
  unauthorized?: boolean;
}

/**
 * Purges any legacy session tokens previously stored in Web Storage.
 * Active admin sessions live exclusively in an HttpOnly; Secure; SameSite=Strict cookie
 * inaccessible to JavaScript (XSS-proof).
 */
export function purgeLegacyAdminBrowserStorage(): void {
  if (typeof window === 'undefined') return;
  const legacyKeys = [
    LEGACY_TOKEN_V2_STORAGE_KEY,
    LEGACY_TOKEN_V1_STORAGE_KEY,
    LEGACY_UNLOCKED_STORAGE_KEY,
  ];
  for (const key of legacyKeys) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  }
}

purgeLegacyAdminBrowserStorage();

export function buildAdminAuthHeaders(
  extraHeaders?: Record<string, string>
): Record<string, string> {
  return {
    [ADMIN_CSRF_HEADER_NAME]: ADMIN_CSRF_HEADER_VALUE,
    ...(extraHeaders || {}),
  };
}

function readLocalSecurityBackup(): AdminSecurityConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_SECURITY_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSecurityConfig>;
    if (!parsed || typeof parsed !== 'object') return null;
    for (const key of Object.keys(
      CLIENT_SECURITY_BOUNDS
    ) as Array<keyof AdminSecurityConfigValues>) {
      const val = Number(parsed[key]);
      const b = CLIENT_SECURITY_BOUNDS[key];
      if (!Number.isInteger(val) || val < b.min || val > b.max) {
        return null;
      }
    }
    return {
      nbaApiLimit: Number(parsed.nbaApiLimit),
      nbaApiWindowMinutes: Number(parsed.nbaApiWindowMinutes),
      nbaRefreshLimit: Number(parsed.nbaRefreshLimit),
      nbaRefreshWindowMinutes: Number(parsed.nbaRefreshWindowMinutes),
      adminBruteForceMaxAttempts: Number(parsed.adminBruteForceMaxAttempts),
      adminBruteForceWindowMinutes: Number(parsed.adminBruteForceWindowMinutes),
      adminFloodLimit: Number(parsed.adminFloodLimit),
      adminFloodWindowMinutes: Number(parsed.adminFloodWindowMinutes),
      adminSessionTtlHours: Number(parsed.adminSessionTtlHours),
      updatedAt:
        typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : 0,
    };
  } catch {
    return null;
  }
}

function writeLocalSecurityBackup(cfg: AdminSecurityConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ADMIN_SECURITY_BACKUP_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore storage quota errors
  }
}

export async function loginAdminWithPasscode(
  passcode: string
): Promise<AdminLoginResult> {
  purgeLegacyAdminBrowserStorage();
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ passcode }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      expiresAt?: number;
      error?: string;
      code?: string;
      retryAfterSeconds?: number;
    };

    if (res.status === 503 || data.code === 'ADMIN_ENV_NOT_CONFIGURED') {
      return {
        ok: false,
        notConfigured: true,
        error:
          data.error ||
          'Acceso administrativo deshabilitado por seguridad: faltan las variables de entorno obligatorias en el servidor.',
      };
    }

    if (res.status === 429) {
      return {
        ok: false,
        lockedOut: true,
        retryAfterSeconds:
          typeof data.retryAfterSeconds === 'number'
            ? data.retryAfterSeconds
            : 900,
        error:
          data.error ||
          'Demasiados intentos fallidos. Acceso bloqueado temporalmente por seguridad.',
      };
    }

    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || 'Clave incorrecta. Inténtalo de nuevo.',
      };
    }

    return {
      ok: true,
      expiresAt: data.expiresAt,
    };
  } catch {
    return {
      ok: false,
      error: 'No se pudo conectar con el servidor para verificar la clave.',
    };
  }
}

export async function verifyStoredAdminSession(): Promise<boolean> {
  purgeLegacyAdminBrowserStorage();
  try {
    const res = await fetch('/api/admin/session', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: buildAdminAuthHeaders(),
    });
    if (!res.ok) {
      return false;
    }
    const data = (await res.json()) as { authenticated?: boolean };
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
}

export async function logoutAdminSession(): Promise<void> {
  purgeLegacyAdminBrowserStorage();
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders(),
    });
  } catch {
    // Ignore network errors on logout
  }
}

export async function fetchAdminSecurityConfig(): Promise<AdminSecurityConfigResponse> {
  try {
    const res = await fetch('/api/admin/security-config', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: buildAdminAuthHeaders(),
    });

    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true, error: 'Sesión expirada o no disponible.' };
    }

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      config?: AdminSecurityConfig;
      defaults?: AdminSecurityConfigValues;
      rateLimitBackend?: RateLimitBackendKind;
      circuits?: Record<string, CircuitMetricsClient>;
      error?: string;
    };

    if (!res.ok || !data.config) {
      return {
        ok: false,
        error: data.error || 'No se pudo leer la configuración de seguridad.',
      };
    }

    // Reconcile if non-Redis cold-start booted at updatedAt=0 while browser backup holds saved settings
    const localBackup = readLocalSecurityBackup();
    if (
      data.config.updatedAt === 0 &&
      localBackup &&
      localBackup.updatedAt > 0
    ) {
      const { updatedAt: _u, ...valuesOnly } = localBackup;
      const synced = await updateAdminSecurityConfig(valuesOnly);
      if (synced.ok && synced.config) {
        return synced;
      }
    }

    writeLocalSecurityBackup(data.config);
    return {
      ok: true,
      config: data.config,
      defaults: data.defaults || CLIENT_DEFAULT_SECURITY_VALUES,
      rateLimitBackend: data.rateLimitBackend || 'memory',
      circuits: data.circuits,
    };
  } catch {
    return {
      ok: false,
      error: 'Error de conexión al consultar los límites del servidor.',
    };
  }
}

export async function resetAdminCircuitBreakers(): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/circuit-breaker/reset', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function updateAdminSecurityConfig(
  values: AdminSecurityConfigValues
): Promise<AdminSecurityConfigResponse> {
  try {
    const res = await fetch('/api/admin/security-config', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(values),
    });

    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true, error: 'Sesión expirada o no disponible.' };
    }

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      config?: AdminSecurityConfig;
      defaults?: AdminSecurityConfigValues;
      rateLimitBackend?: RateLimitBackendKind;
      error?: string;
    };

    if (!res.ok || !data.config) {
      return {
        ok: false,
        error: data.error || 'Parámetros fuera de rango permitido.',
      };
    }

    writeLocalSecurityBackup(data.config);
    return {
      ok: true,
      config: data.config,
      defaults: data.defaults || CLIENT_DEFAULT_SECURITY_VALUES,
      rateLimitBackend: data.rateLimitBackend || 'memory',
    };
  } catch {
    return {
      ok: false,
      error: 'Error de conexión al guardar la configuración.',
    };
  }
}

export async function resetAdminSecurityConfigDefaults(): Promise<AdminSecurityConfigResponse> {
  try {
    const res = await fetch('/api/admin/security-config/reset-defaults', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders(),
    });

    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true, error: 'Sesión expirada o no disponible.' };
    }

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      config?: AdminSecurityConfig;
      defaults?: AdminSecurityConfigValues;
      rateLimitBackend?: RateLimitBackendKind;
      error?: string;
    };

    if (!res.ok || !data.config) {
      return {
        ok: false,
        error: data.error || 'No se pudieron restaurar los valores base.',
      };
    }

    writeLocalSecurityBackup(data.config);
    return {
      ok: true,
      config: data.config,
      defaults: data.defaults || CLIENT_DEFAULT_SECURITY_VALUES,
      rateLimitBackend: data.rateLimitBackend || 'memory',
    };
  } catch {
    return {
      ok: false,
      error: 'Error de conexión al restaurar valores base.',
    };
  }
}

export async function resetAdminRateLimitCounters(): Promise<{
  ok: boolean;
  error?: string;
  unauthorized?: boolean;
}> {
  try {
    const res = await fetch('/api/admin/security-config/reset-counters', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders(),
    });

    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true, error: 'Sesión expirada o no disponible.' };
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error: data.error || 'No se pudieron limpiar los contadores IP.',
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'Error de conexión al limpiar contadores IP.',
    };
  }
}

export interface TelemetrySummaryClient {
  uptimeSeconds: number;
  totalRequests: number;
  requestsLastMinute: number;
  statusDistribution: {
    s2xx: number;
    s3xx: number;
    s4xx: number;
    s5xx: number;
  };
  latency: {
    avgMs: number;
    p50Ms: number;
    p90Ms: number;
    p95Ms: number;
  };
  errorRatePct: number;
  activeAlerts: Array<{
    id: string;
    triggeredAt: string;
    type: string;
    severity: 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    metrics: Record<string, any>;
  }>;
  recentLogs: Array<{
    id: string;
    timestamp: string;
    level: string;
    event: string;
    method?: string;
    path?: string;
    statusCode?: number;
    durationMs?: number;
    ipHash?: string;
    meta?: Record<string, any>;
  }>;
}

export async function fetchAdminTelemetry(): Promise<{
  ok: boolean;
  telemetry?: TelemetrySummaryClient;
  error?: string;
  unauthorized?: boolean;
}> {
  try {
    const res = await fetch('/api/admin/telemetry', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: buildAdminAuthHeaders(),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      telemetry?: TelemetrySummaryClient;
      error?: string;
    };
    if (!res.ok || !data.telemetry) {
      return {
        ok: false,
        error: data.error || 'No se pudieron consultar los datos de telemetría.',
      };
    }
    return { ok: true, telemetry: data.telemetry };
  } catch {
    return { ok: false, error: 'Error de red al consultar la telemetría.' };
  }
}
