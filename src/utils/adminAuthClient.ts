import type {
  AdminSecurityConfig,
  AdminSecurityConfigValues,
  GamedayThresholdsConfig,
  GamedayThresholdsConfigValues,
  InspectorDefaultKpisConfig,
  MilestoneNotificationCountsPreview,
  MilestoneNotificationsConfig,
  MilestoneNotificationsConfigValues,
  MilestoneNotificationsPayload,
  WebFeatureFlags,
} from '../types/nba';
import {
  DEFAULT_PLAYER_NBA_KPI_KEYS,
  DEFAULT_TEAM_NBA_KPI_KEYS,
} from './nbaInspectorAllKpis';

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

const WEB_FEATURE_FLAGS_BACKUP_KEY = 'radarnba_web_feature_flags_v1';

export const DEFAULT_WEB_FEATURE_FLAGS: WebFeatureFlags = {
  showHeroicBadges: false,
  updatedAt: 0,
};

function readLocalWebFeatureFlags(): WebFeatureFlags | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WEB_FEATURE_FLAGS_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.showHeroicBadges === 'boolean') {
      return {
        showHeroicBadges: parsed.showHeroicBadges,
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      };
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

function writeLocalWebFeatureFlags(flags: WebFeatureFlags): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WEB_FEATURE_FLAGS_BACKUP_KEY, JSON.stringify(flags));
  } catch {
    // Ignore storage error
  }
}

export async function fetchPublicWebFeatureFlags(): Promise<WebFeatureFlags> {
  try {
    const res = await fetch('/api/nba/web-feature-flags', {
      method: 'GET',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.flags && typeof data.flags.showHeroicBadges === 'boolean') {
      writeLocalWebFeatureFlags(data.flags);
      return data.flags as WebFeatureFlags;
    }
  } catch {
    // Network fallback
  }
  return readLocalWebFeatureFlags() ?? { ...DEFAULT_WEB_FEATURE_FLAGS };
}

export interface AdminWebFeatureFlagsResponse {
  ok: boolean;
  unauthorized?: boolean;
  flags?: WebFeatureFlags;
  error?: string;
}

export async function fetchAdminWebFeatureFlags(): Promise<AdminWebFeatureFlagsResponse> {
  try {
    const res = await fetch('/api/admin/web-feature-flags', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: buildAdminAuthHeaders(),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.flags && typeof data.flags.showHeroicBadges === 'boolean') {
      writeLocalWebFeatureFlags(data.flags);
      return { ok: true, flags: data.flags as WebFeatureFlags };
    }
  } catch {
    // Network fallback
  }
  return {
    ok: true,
    flags: readLocalWebFeatureFlags() ?? { ...DEFAULT_WEB_FEATURE_FLAGS },
  };
}

export async function updateAdminWebFeatureFlags(values: {
  showHeroicBadges: boolean;
}): Promise<AdminWebFeatureFlagsResponse> {
  try {
    const res = await fetch('/api/admin/web-feature-flags', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(values),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.flags && typeof data.flags.showHeroicBadges === 'boolean') {
      writeLocalWebFeatureFlags(data.flags);
      return { ok: true, flags: data.flags as WebFeatureFlags };
    }
    return {
      ok: false,
      error: data?.error || 'No se pudo actualizar la configuración de insignias.',
    };
  } catch {
    const fallbackFlags: WebFeatureFlags = {
      showHeroicBadges: Boolean(values.showHeroicBadges),
      updatedAt: Date.now(),
    };
    writeLocalWebFeatureFlags(fallbackFlags);
    return { ok: true, flags: fallbackFlags };
  }
}

const INSPECTOR_KPI_DEFAULTS_BACKUP_KEY = 'radarnba_inspector_kpi_defaults_v1';

export const CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG: InspectorDefaultKpisConfig = {
  playerDefaultKpiKeys: [...DEFAULT_PLAYER_NBA_KPI_KEYS],
  teamDefaultKpiKeys: [...DEFAULT_TEAM_NBA_KPI_KEYS],
  updatedAt: 0,
};

function sanitizeClientKpiKeys(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of raw) {
    const k = String(item || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    clean.push(k);
    if (clean.length >= 80) break;
  }
  return clean.length > 0 ? clean : [...fallback];
}

function normalizeClientKpiConfig(raw: unknown): InspectorDefaultKpisConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<InspectorDefaultKpisConfig>;
  return {
    playerDefaultKpiKeys: sanitizeClientKpiKeys(
      obj.playerDefaultKpiKeys,
      CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.playerDefaultKpiKeys
    ),
    teamDefaultKpiKeys: sanitizeClientKpiKeys(
      obj.teamDefaultKpiKeys,
      CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.teamDefaultKpiKeys
    ),
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
  };
}

function readLocalInspectorKpiDefaults(): InspectorDefaultKpisConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(INSPECTOR_KPI_DEFAULTS_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (Array.isArray(parsed.playerDefaultKpiKeys) || Array.isArray(parsed.teamDefaultKpiKeys))) {
      return normalizeClientKpiConfig(parsed);
    }
  } catch {
    // Ignore storage error
  }
  return null;
}

function writeLocalInspectorKpiDefaults(cfg: InspectorDefaultKpisConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INSPECTOR_KPI_DEFAULTS_BACKUP_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore storage error
  }
}

export async function fetchPublicInspectorKpiDefaults(): Promise<InspectorDefaultKpisConfig> {
  try {
    const res = await fetch('/api/nba/inspector-kpi-defaults', {
      method: 'GET',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.config) {
      const normalized = normalizeClientKpiConfig(data.config);
      writeLocalInspectorKpiDefaults(normalized);
      return normalized;
    }
  } catch {
    // Network fallback
  }
  return readLocalInspectorKpiDefaults() ?? {
    playerDefaultKpiKeys: [...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.playerDefaultKpiKeys],
    teamDefaultKpiKeys: [...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.teamDefaultKpiKeys],
    updatedAt: 0,
  };
}

export interface AdminInspectorKpiDefaultsResponse {
  ok: boolean;
  unauthorized?: boolean;
  config?: InspectorDefaultKpisConfig;
  defaults?: { playerDefaultKpiKeys: string[]; teamDefaultKpiKeys: string[] };
  error?: string;
}

export async function fetchAdminInspectorKpiDefaults(): Promise<AdminInspectorKpiDefaultsResponse> {
  try {
    const res = await fetch('/api/admin/inspector-kpi-defaults', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: buildAdminAuthHeaders(),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.config) {
      const normalized = normalizeClientKpiConfig(data.config);
      writeLocalInspectorKpiDefaults(normalized);
      return { ok: true, config: normalized, defaults: data.defaults };
    }
  } catch {
    // Network fallback
  }
  return {
    ok: true,
    config: readLocalInspectorKpiDefaults() ?? {
      playerDefaultKpiKeys: [...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.playerDefaultKpiKeys],
      teamDefaultKpiKeys: [...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.teamDefaultKpiKeys],
      updatedAt: 0,
    },
    defaults: {
      playerDefaultKpiKeys: [...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.playerDefaultKpiKeys],
      teamDefaultKpiKeys: [...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.teamDefaultKpiKeys],
    },
  };
}

export async function updateAdminInspectorKpiDefaults(values: {
  playerDefaultKpiKeys: string[];
  teamDefaultKpiKeys: string[];
}): Promise<AdminInspectorKpiDefaultsResponse> {
  try {
    const res = await fetch('/api/admin/inspector-kpi-defaults', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(values),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.config) {
      const normalized = normalizeClientKpiConfig(data.config);
      writeLocalInspectorKpiDefaults(normalized);
      return { ok: true, config: normalized, defaults: data.defaults };
    }
    return {
      ok: false,
      error: data?.error || 'No se pudieron guardar los KPIs por defecto.',
    };
  } catch {
    const fallbackCfg: InspectorDefaultKpisConfig = {
      playerDefaultKpiKeys: sanitizeClientKpiKeys(
        values.playerDefaultKpiKeys,
        CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.playerDefaultKpiKeys
      ),
      teamDefaultKpiKeys: sanitizeClientKpiKeys(
        values.teamDefaultKpiKeys,
        CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.teamDefaultKpiKeys
      ),
      updatedAt: Date.now(),
    };
    writeLocalInspectorKpiDefaults(fallbackCfg);
    return { ok: true, config: fallbackCfg };
  }
}

export async function resetAdminInspectorKpiDefaults(): Promise<AdminInspectorKpiDefaultsResponse> {
  try {
    const res = await fetch('/api/admin/inspector-kpi-defaults/reset-defaults', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.config) {
      const normalized = normalizeClientKpiConfig(data.config);
      writeLocalInspectorKpiDefaults(normalized);
      return { ok: true, config: normalized, defaults: data.defaults };
    }
    return {
      ok: false,
      error: data?.error || 'No se pudieron restablecer los KPIs por defecto.',
    };
  } catch {
    const fallbackCfg: InspectorDefaultKpisConfig = {
      playerDefaultKpiKeys: [...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.playerDefaultKpiKeys],
      teamDefaultKpiKeys: [...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.teamDefaultKpiKeys],
      updatedAt: Date.now(),
    };
    writeLocalInspectorKpiDefaults(fallbackCfg);
    return { ok: true, config: fallbackCfg };
  }
}

const MILESTONE_NOTIFICATIONS_BACKUP_KEY = 'radarnba_milestone_notifications_cfg_v2';

export const DEFAULT_MILESTONE_NOTIFICATIONS_VALUES: MilestoneNotificationsConfigValues = {
  enabled: true,
  lookbackDays: 3,
  maxNotifications: 40,

  scoringMilestoneEnabled: true,
  scoringThreshold: 40,
  seasonHighPtsEnabled: true,
  seasonHighMinPts: 26,
  seasonHighMinGames: 4,
  threePointExplosionEnabled: true,
  threePointThreshold: 8,
  assistExplosionEnabled: true,
  assistExplosionThreshold: 14,
  reboundExplosionEnabled: true,
  reboundExplosionThreshold: 18,
  orebExplosionEnabled: true,
  orebExplosionThreshold: 7,
  tripleDoubleEnabled: true,
  tripleDoubleMinStat: 10,
  twentyTwentyEnabled: true,
  twentyTwentyPtsMin: 20,
  twentyTwentySecMin: 15,
  doubleDoubleEnabled: false,
  doubleDoubleMinPts: 15,
  efficiencySniperEnabled: true,
  efficiencyMinPts: 25,
  efficiencyMinFgPct: 75,
  cleanPlaymakerEnabled: true,
  cleanPlaymakerMinAst: 8,
  cleanPlaymakerMinPts: 15,

  defenseMilestoneEnabled: true,
  defenseMinBlk: 5,
  defenseMinStl: 5,
  defenseComboMinEach: 3,
  gameScoreMilestoneEnabled: true,
  gameScoreThreshold: 38,
  plusMinusMilestoneEnabled: false,
  plusMinusThreshold: 25,
  teamBlowoutEnabled: true,
  teamMarginThreshold: 25,
  teamPointsThreshold: 135,

  heroicBuzzerEnabled: true,
  heroicOtTieEnabled: true,
  heroicGameWinnerEnabled: true,
  heroicGameWinnerMaxSec: 10,
  heroicLongRangeEnabled: true,
  heroicLongRangeMinFt: 38,

  cumPointsEnabled: true,
  seasonPointsStep: 500,
  cum3pmEnabled: true,
  season3pmStep: 100,
  cumRebEnabled: true,
  seasonRebStep: 200,
  cumOrebEnabled: true,
  seasonOrebStep: 50,
  cumAstEnabled: true,
  seasonAstStep: 150,
  cumStlEnabled: true,
  seasonStlStep: 30,
  cumBlkEnabled: true,
  seasonBlkStep: 30,
  teamSeasonWinsMilestoneEnabled: true,
  teamSeasonWinsStep: 10,

  imminentMilestonesEnabled: true,
  imminentPtsWithin: 25,
  imminentOtherWithin: 5,
  streakMilestoneEnabled: true,
  streakMinGames: 7,
  streakPtsThreshold: 20,
  teamWinStreakEnabled: true,
  teamWinStreakMin: 5,
};

export const MILESTONE_NOTIFICATIONS_BOUNDS = {
  lookbackDays: { min: 1, max: 14, step: 1, unit: 'días' },
  maxNotifications: { min: 5, max: 100, step: 5, unit: 'alertas' },

  scoringThreshold: { min: 20, max: 80, step: 5, unit: 'PTS' },
  seasonHighMinPts: { min: 15, max: 60, step: 1, unit: 'PTS' },
  seasonHighMinGames: { min: 2, max: 20, step: 1, unit: 'PJ' },
  threePointThreshold: { min: 4, max: 16, step: 1, unit: '3PM' },
  assistExplosionThreshold: { min: 8, max: 25, step: 1, unit: 'AST' },
  reboundExplosionThreshold: { min: 10, max: 30, step: 1, unit: 'REB' },
  orebExplosionThreshold: { min: 4, max: 15, step: 1, unit: 'OREB' },
  tripleDoubleMinStat: { min: 8, max: 15, step: 1, unit: 'mín.' },
  twentyTwentyPtsMin: { min: 15, max: 40, step: 5, unit: 'PTS' },
  twentyTwentySecMin: { min: 10, max: 25, step: 1, unit: 'R/A' },
  doubleDoubleMinPts: { min: 10, max: 35, step: 5, unit: 'PTS' },
  efficiencyMinPts: { min: 15, max: 45, step: 5, unit: 'PTS' },
  efficiencyMinFgPct: { min: 60, max: 95, step: 5, unit: '% TC' },
  cleanPlaymakerMinAst: { min: 5, max: 18, step: 1, unit: 'AST' },
  cleanPlaymakerMinPts: { min: 10, max: 35, step: 5, unit: 'PTS' },

  defenseMinBlk: { min: 3, max: 12, step: 1, unit: 'TAP' },
  defenseMinStl: { min: 3, max: 12, step: 1, unit: 'ROB' },
  defenseComboMinEach: { min: 2, max: 6, step: 1, unit: 'R+T' },
  gameScoreThreshold: { min: 25, max: 60, step: 1, unit: 'GmSc' },
  plusMinusThreshold: { min: 15, max: 45, step: 5, unit: '+/-' },
  teamMarginThreshold: { min: 15, max: 50, step: 5, unit: 'DIF' },
  teamPointsThreshold: { min: 120, max: 165, step: 5, unit: 'PTS' },

  heroicGameWinnerMaxSec: { min: 1, max: 24, step: 1, unit: 'seg.' },
  heroicLongRangeMinFt: { min: 20, max: 75, step: 1, unit: 'ft' },

  seasonPointsStep: { min: 200, max: 1000, step: 50, unit: 'PTS' },
  season3pmStep: { min: 25, max: 200, step: 25, unit: '3PM' },
  seasonRebStep: { min: 100, max: 500, step: 50, unit: 'REB' },
  seasonOrebStep: { min: 25, max: 200, step: 25, unit: 'OREB' },
  seasonAstStep: { min: 100, max: 500, step: 25, unit: 'AST' },
  seasonStlStep: { min: 15, max: 100, step: 5, unit: 'STL' },
  seasonBlkStep: { min: 15, max: 100, step: 5, unit: 'BLK' },
  teamSeasonWinsStep: { min: 5, max: 25, step: 5, unit: 'V' },

  imminentPtsWithin: { min: 5, max: 60, step: 5, unit: 'PTS' },
  imminentOtherWithin: { min: 1, max: 15, step: 1, unit: 'ud.' },
  streakMinGames: { min: 3, max: 20, step: 1, unit: 'PJ' },
  streakPtsThreshold: { min: 15, max: 35, step: 5, unit: 'PTS' },
  teamWinStreakMin: { min: 2, max: 20, step: 1, unit: 'V seg.' },
} as const;

function sanitizeClientMilestoneNotificationsConfig(
  raw: unknown
): MilestoneNotificationsConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<MilestoneNotificationsConfig>;
  const clampInt = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  const b = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const d = DEFAULT_MILESTONE_NOTIFICATIONS_VALUES;
  return {
    enabled: b(obj.enabled, d.enabled),
    lookbackDays: clampInt(obj.lookbackDays, d.lookbackDays, 1, 14),
    maxNotifications: clampInt(obj.maxNotifications, d.maxNotifications, 5, 100),

    scoringMilestoneEnabled: b(obj.scoringMilestoneEnabled, d.scoringMilestoneEnabled),
    scoringThreshold: clampInt(obj.scoringThreshold, d.scoringThreshold, 20, 80),
    seasonHighPtsEnabled: b(obj.seasonHighPtsEnabled, d.seasonHighPtsEnabled),
    seasonHighMinPts: clampInt(obj.seasonHighMinPts, d.seasonHighMinPts, 15, 60),
    seasonHighMinGames: clampInt(obj.seasonHighMinGames, d.seasonHighMinGames, 2, 20),
    threePointExplosionEnabled: b(obj.threePointExplosionEnabled, d.threePointExplosionEnabled),
    threePointThreshold: clampInt(obj.threePointThreshold, d.threePointThreshold, 4, 16),
    assistExplosionEnabled: b(obj.assistExplosionEnabled, d.assistExplosionEnabled),
    assistExplosionThreshold: clampInt(obj.assistExplosionThreshold, d.assistExplosionThreshold, 8, 25),
    reboundExplosionEnabled: b(obj.reboundExplosionEnabled, d.reboundExplosionEnabled),
    reboundExplosionThreshold: clampInt(obj.reboundExplosionThreshold, d.reboundExplosionThreshold, 10, 30),
    orebExplosionEnabled: b(obj.orebExplosionEnabled, d.orebExplosionEnabled),
    orebExplosionThreshold: clampInt(obj.orebExplosionThreshold, d.orebExplosionThreshold, 4, 15),
    tripleDoubleEnabled: b(obj.tripleDoubleEnabled, d.tripleDoubleEnabled),
    tripleDoubleMinStat: clampInt(obj.tripleDoubleMinStat, d.tripleDoubleMinStat, 8, 15),
    twentyTwentyEnabled: b(obj.twentyTwentyEnabled, d.twentyTwentyEnabled),
    twentyTwentyPtsMin: clampInt(obj.twentyTwentyPtsMin, d.twentyTwentyPtsMin, 15, 40),
    twentyTwentySecMin: clampInt(obj.twentyTwentySecMin, d.twentyTwentySecMin, 10, 25),
    doubleDoubleEnabled: b(obj.doubleDoubleEnabled, d.doubleDoubleEnabled),
    doubleDoubleMinPts: clampInt(obj.doubleDoubleMinPts, d.doubleDoubleMinPts, 10, 35),
    efficiencySniperEnabled: b(obj.efficiencySniperEnabled, d.efficiencySniperEnabled),
    efficiencyMinPts: clampInt(obj.efficiencyMinPts, d.efficiencyMinPts, 15, 45),
    efficiencyMinFgPct: clampInt(obj.efficiencyMinFgPct, d.efficiencyMinFgPct, 60, 95),
    cleanPlaymakerEnabled: b(obj.cleanPlaymakerEnabled, d.cleanPlaymakerEnabled),
    cleanPlaymakerMinAst: clampInt(obj.cleanPlaymakerMinAst, d.cleanPlaymakerMinAst, 5, 18),
    cleanPlaymakerMinPts: clampInt(obj.cleanPlaymakerMinPts, d.cleanPlaymakerMinPts, 10, 35),

    defenseMilestoneEnabled: b(obj.defenseMilestoneEnabled, d.defenseMilestoneEnabled),
    defenseMinBlk: clampInt(obj.defenseMinBlk, d.defenseMinBlk, 3, 12),
    defenseMinStl: clampInt(obj.defenseMinStl, d.defenseMinStl, 3, 12),
    defenseComboMinEach: clampInt(obj.defenseComboMinEach, d.defenseComboMinEach, 2, 6),
    gameScoreMilestoneEnabled: b(obj.gameScoreMilestoneEnabled, d.gameScoreMilestoneEnabled),
    gameScoreThreshold: clampInt(obj.gameScoreThreshold, d.gameScoreThreshold, 25, 60),
    plusMinusMilestoneEnabled: b(obj.plusMinusMilestoneEnabled, d.plusMinusMilestoneEnabled),
    plusMinusThreshold: clampInt(obj.plusMinusThreshold, d.plusMinusThreshold, 15, 45),
    teamBlowoutEnabled: b(obj.teamBlowoutEnabled, d.teamBlowoutEnabled),
    teamMarginThreshold: clampInt(obj.teamMarginThreshold, d.teamMarginThreshold, 15, 50),
    teamPointsThreshold: clampInt(obj.teamPointsThreshold, d.teamPointsThreshold, 120, 165),

    heroicBuzzerEnabled: b(obj.heroicBuzzerEnabled, d.heroicBuzzerEnabled),
    heroicOtTieEnabled: b(obj.heroicOtTieEnabled, d.heroicOtTieEnabled),
    heroicGameWinnerEnabled: b(obj.heroicGameWinnerEnabled, d.heroicGameWinnerEnabled),
    heroicGameWinnerMaxSec: clampInt(obj.heroicGameWinnerMaxSec, d.heroicGameWinnerMaxSec, 1, 24),
    heroicLongRangeEnabled: b(obj.heroicLongRangeEnabled, d.heroicLongRangeEnabled),
    heroicLongRangeMinFt: clampInt(obj.heroicLongRangeMinFt, d.heroicLongRangeMinFt, 20, 75),

    cumPointsEnabled: b(obj.cumPointsEnabled, d.cumPointsEnabled),
    seasonPointsStep: clampInt(obj.seasonPointsStep, d.seasonPointsStep, 200, 1000),
    cum3pmEnabled: b(obj.cum3pmEnabled, d.cum3pmEnabled),
    season3pmStep: clampInt(obj.season3pmStep, d.season3pmStep, 25, 200),
    cumRebEnabled: b(obj.cumRebEnabled, d.cumRebEnabled),
    seasonRebStep: clampInt(obj.seasonRebStep, d.seasonRebStep, 100, 500),
    cumOrebEnabled: b(obj.cumOrebEnabled, d.cumOrebEnabled),
    seasonOrebStep: clampInt(obj.seasonOrebStep, d.seasonOrebStep, 25, 200),
    cumAstEnabled: b(obj.cumAstEnabled, d.cumAstEnabled),
    seasonAstStep: clampInt(obj.seasonAstStep, d.seasonAstStep, 100, 500),
    cumStlEnabled: b(obj.cumStlEnabled, d.cumStlEnabled),
    seasonStlStep: clampInt(obj.seasonStlStep, d.seasonStlStep, 15, 100),
    cumBlkEnabled: b(obj.cumBlkEnabled, d.cumBlkEnabled),
    seasonBlkStep: clampInt(obj.seasonBlkStep, d.seasonBlkStep, 15, 100),
    teamSeasonWinsMilestoneEnabled: b(obj.teamSeasonWinsMilestoneEnabled, d.teamSeasonWinsMilestoneEnabled),
    teamSeasonWinsStep: clampInt(obj.teamSeasonWinsStep, d.teamSeasonWinsStep, 5, 25),

    imminentMilestonesEnabled: b(obj.imminentMilestonesEnabled, d.imminentMilestonesEnabled),
    imminentPtsWithin: clampInt(obj.imminentPtsWithin, d.imminentPtsWithin, 5, 60),
    imminentOtherWithin: clampInt(obj.imminentOtherWithin, d.imminentOtherWithin, 1, 15),
    streakMilestoneEnabled: b(obj.streakMilestoneEnabled, d.streakMilestoneEnabled),
    streakMinGames: clampInt(obj.streakMinGames, d.streakMinGames, 3, 20),
    streakPtsThreshold: clampInt(obj.streakPtsThreshold, d.streakPtsThreshold, 15, 35),
    teamWinStreakEnabled: b(obj.teamWinStreakEnabled, d.teamWinStreakEnabled),
    teamWinStreakMin: clampInt(obj.teamWinStreakMin, d.teamWinStreakMin, 2, 20),
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
  };
}

function readLocalMilestoneNotificationsBackup(): MilestoneNotificationsConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MILESTONE_NOTIFICATIONS_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return sanitizeClientMilestoneNotificationsConfig(parsed);
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

function writeLocalMilestoneNotificationsBackup(cfg: MilestoneNotificationsConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MILESTONE_NOTIFICATIONS_BACKUP_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore storage error
  }
}

export async function fetchPublicMilestoneNotifications(
  forceRefresh = false
): Promise<MilestoneNotificationsPayload | null> {
  try {
    const url = forceRefresh ? '/api/nba/notifications?refresh=1' : '/api/nba/notifications';
    const res = await fetch(url, {
      method: 'GET',
      cache: forceRefresh ? 'no-store' : 'default',
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data && typeof data.enabled === 'boolean' && Array.isArray(data.notifications)) {
      return data as MilestoneNotificationsPayload;
    }
  } catch {
    // Non-blocking fallback
  }
  return null;
}

export interface AdminMilestoneNotificationsResponse {
  ok: boolean;
  unauthorized?: boolean;
  config?: MilestoneNotificationsConfig;
  defaults?: MilestoneNotificationsConfigValues;
  error?: string;
}

export async function fetchAdminMilestoneNotificationsConfig(): Promise<AdminMilestoneNotificationsResponse> {
  try {
    const res = await fetch('/api/admin/milestone-notifications', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: buildAdminAuthHeaders(),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.config) {
      const normalized = sanitizeClientMilestoneNotificationsConfig(data.config);
      writeLocalMilestoneNotificationsBackup(normalized);
      return {
        ok: true,
        config: normalized,
        defaults: data.defaults || DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
      };
    }
  } catch {
    // Network fallback
  }
  return {
    ok: true,
    config: readLocalMilestoneNotificationsBackup() ?? {
      ...DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
      updatedAt: 0,
    },
    defaults: DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
  };
}

export async function updateAdminMilestoneNotificationsConfig(
  values: MilestoneNotificationsConfigValues
): Promise<AdminMilestoneNotificationsResponse> {
  try {
    const res = await fetch('/api/admin/milestone-notifications', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(values),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.config) {
      const normalized = sanitizeClientMilestoneNotificationsConfig(data.config);
      writeLocalMilestoneNotificationsBackup(normalized);
      return {
        ok: true,
        config: normalized,
        defaults: data.defaults || DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
      };
    }
    return {
      ok: false,
      error: data?.error || 'No se pudo guardar la configuración de notificaciones.',
    };
  } catch {
    const fallbackCfg: MilestoneNotificationsConfig = {
      ...sanitizeClientMilestoneNotificationsConfig(values),
      updatedAt: Date.now(),
    };
    writeLocalMilestoneNotificationsBackup(fallbackCfg);
    return {
      ok: true,
      config: fallbackCfg,
      defaults: DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
    };
  }
}

export async function resetAdminMilestoneNotificationsDefaults(): Promise<AdminMilestoneNotificationsResponse> {
  try {
    const res = await fetch('/api/admin/milestone-notifications/reset-defaults', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.config) {
      const normalized = sanitizeClientMilestoneNotificationsConfig(data.config);
      writeLocalMilestoneNotificationsBackup(normalized);
      return {
        ok: true,
        config: normalized,
        defaults: data.defaults || DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
      };
    }
    return {
      ok: false,
      error: data?.error || 'No se pudieron restablecer las notificaciones por defecto.',
    };
  } catch {
    const fallbackCfg: MilestoneNotificationsConfig = {
      ...DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
      updatedAt: Date.now(),
    };
    writeLocalMilestoneNotificationsBackup(fallbackCfg);
    return {
      ok: true,
      config: fallbackCfg,
      defaults: DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
    };
  }
}

export interface AdminMilestoneNotificationsPreviewResponse {
  ok: boolean;
  unauthorized?: boolean;
  preview?: MilestoneNotificationCountsPreview;
  error?: string;
}

export async function previewAdminMilestoneNotificationsCounts(
  values: MilestoneNotificationsConfigValues,
  signal?: AbortSignal
): Promise<AdminMilestoneNotificationsPreviewResponse> {
  try {
    const res = await fetch('/api/admin/milestone-notifications/preview-counts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(values),
      signal,
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      return { ok: false, unauthorized: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.seasonCounts && data?.recentCounts) {
      return {
        ok: true,
        preview: {
          seasonCounts: data.seasonCounts,
          recentCounts: data.recentCounts,
          totalDates: Number(data.totalDates || 0),
          totalEnabledRecentAlerts: Number(data.totalEnabledRecentAlerts || 0),
        },
      };
    }
    return {
      ok: false,
      error: data?.error || 'No se pudo calcular la simulación de conteos.',
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false };
    }
    return { ok: false, error: 'Error al consultar la simulación.' };
  }
}




