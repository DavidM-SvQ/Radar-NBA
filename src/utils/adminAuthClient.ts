import type {
  AdminSecurityConfig,
  AdminSecurityConfigValues,
} from '../types/nba';

const ADMIN_TOKEN_STORAGE_KEY = 'radarnba_admin_token_v1';
const LEGACY_UNLOCKED_STORAGE_KEY = 'radarnba_private_unlocked';
const ADMIN_SECURITY_BACKUP_KEY = 'radarnba_admin_security_config_v1';

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
  retryAfterSeconds?: number;
  expiresAt?: number;
}

export interface AdminSecurityConfigResponse {
  ok: boolean;
  config?: AdminSecurityConfig;
  defaults?: AdminSecurityConfigValues;
  error?: string;
  unauthorized?: boolean;
}

export function getStoredAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    sessionStorage.removeItem(LEGACY_UNLOCKED_STORAGE_KEY);
    const raw = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function storeAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(LEGACY_UNLOCKED_STORAGE_KEY);
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage quota errors
  }
}

export function clearStoredAdminToken(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_UNLOCKED_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function buildAdminAuthHeaders(
  extraHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = { ...(extraHeaders || {}) };
  const token = getStoredAdminToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
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
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      token?: string;
      expiresAt?: number;
      error?: string;
      code?: string;
      retryAfterSeconds?: number;
    };

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

    if (!res.ok || !data.ok || !data.token) {
      return {
        ok: false,
        error: data.error || 'Clave incorrecta. Inténtalo de nuevo.',
      };
    }

    storeAdminToken(data.token);
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
  const token = getStoredAdminToken();
  if (!token) return false;

  try {
    const res = await fetch('/api/admin/session', {
      method: 'GET',
      headers: buildAdminAuthHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        clearStoredAdminToken();
      }
      return false;
    }
    const data = (await res.json()) as { authenticated?: boolean };
    if (!data.authenticated) {
      clearStoredAdminToken();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function logoutAdminSession(): Promise<void> {
  const headers = buildAdminAuthHeaders();
  clearStoredAdminToken();
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers,
    });
  } catch {
    // Ignore network errors on logout
  }
}

export async function fetchAdminSecurityConfig(): Promise<AdminSecurityConfigResponse> {
  try {
    const res = await fetch('/api/admin/security-config', {
      method: 'GET',
      headers: buildAdminAuthHeaders(),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, unauthorized: true, error: 'Sesión expirada.' };
    }

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      config?: AdminSecurityConfig;
      defaults?: AdminSecurityConfigValues;
      error?: string;
    };

    if (!res.ok || !data.config) {
      return {
        ok: false,
        error: data.error || 'No se pudo leer la configuración de seguridad.',
      };
    }

    // Reconcile if serverless cold-start booted at updatedAt=0 while browser backup holds saved settings
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
    };
  } catch {
    return {
      ok: false,
      error: 'Error de conexión al consultar los límites del servidor.',
    };
  }
}

export async function updateAdminSecurityConfig(
  values: AdminSecurityConfigValues
): Promise<AdminSecurityConfigResponse> {
  try {
    const res = await fetch('/api/admin/security-config', {
      method: 'PUT',
      headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(values),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, unauthorized: true, error: 'Sesión expirada.' };
    }

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      config?: AdminSecurityConfig;
      defaults?: AdminSecurityConfigValues;
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
      headers: buildAdminAuthHeaders(),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, unauthorized: true, error: 'Sesión expirada.' };
    }

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      config?: AdminSecurityConfig;
      defaults?: AdminSecurityConfigValues;
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
      headers: buildAdminAuthHeaders(),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, unauthorized: true, error: 'Sesión expirada.' };
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
