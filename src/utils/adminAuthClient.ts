import type {
  AdminSecurityConfig,
  AdminSecurityConfigValues,
  GamedayThresholdsConfig,
  GamedayThresholdsConfigValues,
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

const ADMIN_SESSION_TOKEN_KEY = 'radarnba_admin_session_token_v3';

let memoryAdminToken: string | null = null;

export function setAdminSessionToken(token: string | null): void {
  memoryAdminToken = token;
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      sessionStorage.setItem(ADMIN_SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(ADMIN_SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getAdminSessionToken(): string | null {
  if (memoryAdminToken) return memoryAdminToken;
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(ADMIN_SESSION_TOKEN_KEY);
    if (stored) {
      memoryAdminToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function buildAdminAuthHeaders(
  extraHeaders?: Record<string, string>
): Record<string, string> {
  const token = getAdminSessionToken();
  const headers: Record<string, string> = {
    [ADMIN_CSRF_HEADER_NAME]: ADMIN_CSRF_HEADER_VALUE,
    ...(extraHeaders || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
      setAdminSessionToken(null);
      return {
        ok: false,
        error: data.error || 'Clave incorrecta. Inténtalo de nuevo.',
      };
    }

    if ((data as any).token) {
      setAdminSessionToken((data as any).token);
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
  setAdminSessionToken(null);
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

const GAMEDAY_THRESHOLDS_BACKUP_KEY = 'radarnba_gameday_thresholds_v1';

export const DEFAULT_GAMEDAY_THRESHOLDS_VALUES: GamedayThresholdsConfigValues = {
  // 03A. Noches de Explosión
  explosionShootingTsDiff: 10.0,
  explosion3pMinMade: 4,
  explosion3pDelta: 3.0,
  explosionRebMinTotal: 10,
  explosionRebDelta: 4.0,
  explosionAstMinTotal: 8,
  explosionAstDelta: 4.0,
  explosionStocksMinTotal: 5,
  explosionStocksDelta: 2.5,
  explosionMinutesDelta: 5.0,
  explosionScoringPtsDelta: 8.0,
  explosionZScoreThreshold: 1.8,

  // 03B. Batacazos de Titulares
  starterMinMinutesAvg: 24.0,
  starterMinPointsAvg: 14.0,
  slumpScoringDropPts: 7.5,
  slumpShootingMaxTsPct: 42.0,
  slumpShootingTsDrop: 12.0,
  slumpFoulsTroubleCount: 5,
  slumpFoulsMinutesCut: 6.0,
  slumpTurnoversCount: 5,
  slumpTurnoversDelta: 2.5,
  slump3pSpecialistAvg: 2.0,
  slump3pDropDelta: 2.0,
  slumpAstFacilitatorAvg: 6.0,
  slumpAstDropDelta: 3.5,
  slumpRebInteriorAvg: 8.5,
  slumpRebDropDelta: 4.5,
  slumpMinutesCutDelta: 8.0,
};

export const GAMEDAY_THRESHOLDS_BOUNDS: Record<
  keyof GamedayThresholdsConfigValues,
  { min: number; max: number; step: number; label: string; group: '03A' | '03B'; unit: string; description: string }
> = {
  // 03A Explosiones
  explosionShootingTsDiff: {
    min: 4.0,
    max: 25.0,
    step: 0.5,
    label: 'Salto Mínimo en Puntería (TS%)',
    group: '03A',
    unit: 'pp',
    description: 'Puntos porcentuales de mejora en True Shooting respecto a la media de la temporada 2026-27.',
  },
  explosion3pMinMade: {
    min: 2,
    max: 10,
    step: 1,
    label: 'Mínimo Triples Convertidos',
    group: '03A',
    unit: '3PM',
    description: 'Cantidad mínima de triples anotados en el partido para calificar explosión exterior.',
  },
  explosion3pDelta: {
    min: 1.0,
    max: 6.0,
    step: 0.5,
    label: 'Salto sobre Media de Triples',
    group: '03A',
    unit: '3PM',
    description: 'Diferencia mínima de triples anotados sobre el promedio de temporada.',
  },
  explosionRebMinTotal: {
    min: 6,
    max: 18,
    step: 1,
    label: 'Mínimo Rebotes Capturados',
    group: '03A',
    unit: 'REB',
    description: 'Suelo de rebotes totales en la noche para la etiqueta de Dominio en el Rebote.',
  },
  explosionRebDelta: {
    min: 2.0,
    max: 8.0,
    step: 0.5,
    label: 'Salto sobre Media de Rebotes',
    group: '03A',
    unit: 'REB',
    description: 'Incremento neto de rebotes frente al estándar del jugador en la temporada.',
  },
  explosionAstMinTotal: {
    min: 5,
    max: 16,
    step: 1,
    label: 'Mínimo Asistencias Repartidas',
    group: '03A',
    unit: 'AST',
    description: 'Suelo de pases de canasta para activar la etiqueta Recital en la Dirección.',
  },
  explosionAstDelta: {
    min: 2.0,
    max: 8.0,
    step: 0.5,
    label: 'Salto sobre Media de Asistencias',
    group: '03A',
    unit: 'AST',
    description: 'Diferencia positiva de asistencias sobre el promedio del jugador.',
  },
  explosionStocksMinTotal: {
    min: 3,
    max: 8,
    step: 1,
    label: 'Mínimo Stocks Totales (Robos+Tapones)',
    group: '03A',
    unit: 'Stocks',
    description: 'Suelo de robos + tapones en el partido para Muralla Defensiva en Stocks.',
  },
  explosionStocksDelta: {
    min: 1.5,
    max: 5.0,
    step: 0.5,
    label: 'Salto sobre Media de Stocks',
    group: '03A',
    unit: 'Stocks',
    description: 'Superávit de stocks en la noche respecto a su media habitual.',
  },
  explosionMinutesDelta: {
    min: 2.0,
    max: 12.0,
    step: 0.5,
    label: 'Salto de Minutos en Pista (Expansión)',
    group: '03A',
    unit: 'MIN',
    description: 'Minutos adicionales jugados respecto a la media para calificar Expansión de Rol.',
  },
  explosionScoringPtsDelta: {
    min: 4.0,
    max: 16.0,
    step: 0.5,
    label: 'Salto Anotador Despliegue (PTS)',
    group: '03A',
    unit: 'PTS',
    description: 'Puntos por encima de su media para Despliegue Estadístico Sobresaliente.',
  },
  explosionZScoreThreshold: {
    min: 1.2,
    max: 2.6,
    step: 0.1,
    label: 'Umbral Estadístico Z-Score (σ)',
    group: '03A',
    unit: 'σ',
    description: 'Desviaciones estándar respecto a la distribución habitual del jugador.',
  },

  // 03B Batacazos
  starterMinMinutesAvg: {
    min: 18.0,
    max: 32.0,
    step: 0.5,
    label: 'Filtro: Minutos Medios de Titular',
    group: '03B',
    unit: 'MIN',
    description: 'Minutaje promedio requerido para ser considerado titular consolidado.',
  },
  starterMinPointsAvg: {
    min: 8.0,
    max: 22.0,
    step: 0.5,
    label: 'Filtro: Puntos Medios de Referente',
    group: '03B',
    unit: 'PTS',
    description: 'Promedio anotador habitual exigido para evaluar batacazos ofensivos.',
  },
  slumpScoringDropPts: {
    min: 4.0,
    max: 14.0,
    step: 0.5,
    label: 'Caída de Puntos para Frenado Defensivo',
    group: '03B',
    unit: 'PTS',
    description: 'Déficit de anotación frente a su promedio habitual para marcar batacazo por puntos.',
  },
  slumpShootingMaxTsPct: {
    min: 35.0,
    max: 50.0,
    step: 0.5,
    label: 'Techo de TS% para Atasco en el Tiro',
    group: '03B',
    unit: '% TS',
    description: 'Porcentaje True Shooting máximo en la noche para diagnosticar atasco de efectividad.',
  },
  slumpShootingTsDrop: {
    min: 6.0,
    max: 20.0,
    step: 0.5,
    label: 'Caída Porcentual de TS% vs Media',
    group: '03B',
    unit: 'pp',
    description: 'Desplome mínimo en puntos porcentuales respecto a su TS% habitual.',
  },
  slumpFoulsTroubleCount: {
    min: 4,
    max: 6,
    step: 1,
    label: 'Faltas para Lastrado por Faltas',
    group: '03B',
    unit: 'Faltas',
    description: 'Infracciones personales acumuladas que limitan el minutaje del titular.',
  },
  slumpFoulsMinutesCut: {
    min: 3.0,
    max: 10.0,
    step: 0.5,
    label: 'Corte de Minutos por 4 Faltas',
    group: '03B',
    unit: 'MIN',
    description: 'Minutos perdidos frente a su media si comete 4 faltas tempranas.',
  },
  slumpTurnoversCount: {
    min: 3,
    max: 8,
    step: 1,
    label: 'Pérdidas para Sangría de Balón',
    group: '03B',
    unit: 'TOV',
    description: 'Cantidad mínima de pérdidas cometidas en la noche.',
  },
  slumpTurnoversDelta: {
    min: 1.0,
    max: 5.0,
    step: 0.5,
    label: 'Salto sobre Media de Pérdidas',
    group: '03B',
    unit: 'TOV',
    description: 'Pérdidas cometidas por encima de su estándar habitual.',
  },
  slump3pSpecialistAvg: {
    min: 1.2,
    max: 3.5,
    step: 0.1,
    label: 'Triples Medios de Especialista',
    group: '03B',
    unit: '3PM',
    description: 'Promedio de triples exigido para considerar al jugador triplista habitual.',
  },
  slump3pDropDelta: {
    min: 1.0,
    max: 4.0,
    step: 0.5,
    label: 'Caída de Triples Anotados',
    group: '03B',
    unit: '3PM',
    description: 'Déficit de triples en la noche (con $\\le 1$ anotado en $\\ge 5$ intentos).',
  },
  slumpAstFacilitatorAvg: {
    min: 4.0,
    max: 9.0,
    step: 0.5,
    label: 'Asistencias Medias de Generador',
    group: '03B',
    unit: 'AST',
    description: 'Promedio habitual exigido para evaluar Apagón en la Dirección.',
  },
  slumpAstDropDelta: {
    min: 2.0,
    max: 6.0,
    step: 0.5,
    label: 'Caída de Asistencias Repartidas',
    group: '03B',
    unit: 'AST',
    description: 'Déficit de pases de canasta frente a su promedio habitual.',
  },
  slumpRebInteriorAvg: {
    min: 6.0,
    max: 12.0,
    step: 0.5,
    label: 'Rebotes Medios de Interior / Pívot',
    group: '03B',
    unit: 'REB',
    description: 'Promedio de rebotes exigido para evaluar Superado en el Cristal.',
  },
  slumpRebDropDelta: {
    min: 2.5,
    max: 7.0,
    step: 0.5,
    label: 'Caída de Rebotes Capturados',
    group: '03B',
    unit: 'REB',
    description: 'Déficit de rebotes en la noche frente a su estándar habitual.',
  },
  slumpMinutesCutDelta: {
    min: 4.0,
    max: 14.0,
    step: 0.5,
    label: 'Recorte de Minutos en Rotación',
    group: '03B',
    unit: 'MIN',
    description: 'Minutos perdidos en pista por decisión técnica o descarte táctico.',
  },
};

export interface AdminGamedayThresholdsResponse {
  ok: boolean;
  config?: GamedayThresholdsConfig;
  defaults?: GamedayThresholdsConfigValues;
  error?: string;
  unauthorized?: boolean;
}

function readLocalThresholdsBackup(): GamedayThresholdsConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GAMEDAY_THRESHOLDS_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.explosionShootingTsDiff === 'number') {
      return parsed as GamedayThresholdsConfig;
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

function writeLocalThresholdsBackup(cfg: GamedayThresholdsConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GAMEDAY_THRESHOLDS_BACKUP_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore storage error
  }
}

export async function fetchAdminGamedayThresholds(): Promise<AdminGamedayThresholdsResponse> {
  try {
    const res = await fetch('/api/admin/gameday-thresholds', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: buildAdminAuthHeaders(),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.config) {
      writeLocalThresholdsBackup(data.config);
      return {
        ok: true,
        config: data.config,
        defaults: data.defaults || DEFAULT_GAMEDAY_THRESHOLDS_VALUES,
      };
    }
  } catch {
    // Network fallback
  }

  const local = readLocalThresholdsBackup();
  if (local) {
    return {
      ok: true,
      config: local,
      defaults: DEFAULT_GAMEDAY_THRESHOLDS_VALUES,
    };
  }

  return {
    ok: true,
    config: { ...DEFAULT_GAMEDAY_THRESHOLDS_VALUES, updatedAt: 0 },
    defaults: DEFAULT_GAMEDAY_THRESHOLDS_VALUES,
  };
}

export async function updateAdminGamedayThresholds(
  values: GamedayThresholdsConfigValues
): Promise<AdminGamedayThresholdsResponse> {
  try {
    const res = await fetch('/api/admin/gameday-thresholds', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(values),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.config) {
      writeLocalThresholdsBackup(data.config);
      return {
        ok: true,
        config: data.config,
        defaults: data.defaults || DEFAULT_GAMEDAY_THRESHOLDS_VALUES,
      };
    }
    return {
      ok: false,
      error: data.error || 'No se pudieron guardar los criterios de jornada.',
    };
  } catch {
    const fallbackConfig: GamedayThresholdsConfig = { ...values, updatedAt: Date.now() };
    writeLocalThresholdsBackup(fallbackConfig);
    return {
      ok: true,
      config: fallbackConfig,
      defaults: DEFAULT_GAMEDAY_THRESHOLDS_VALUES,
    };
  }
}

export async function resetAdminGamedayThresholdsDefaults(): Promise<AdminGamedayThresholdsResponse> {
  try {
    const res = await fetch('/api/admin/gameday-thresholds/reset-defaults', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders(),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.config) {
      writeLocalThresholdsBackup(data.config);
      return {
        ok: true,
        config: data.config,
        defaults: DEFAULT_GAMEDAY_THRESHOLDS_VALUES,
      };
    }
  } catch {
    // Network fallback
  }

  const resetConfig: GamedayThresholdsConfig = {
    ...DEFAULT_GAMEDAY_THRESHOLDS_VALUES,
    updatedAt: Date.now(),
  };
  writeLocalThresholdsBackup(resetConfig);
  return {
    ok: true,
    config: resetConfig,
    defaults: DEFAULT_GAMEDAY_THRESHOLDS_VALUES,
  };
}

