// @ts-nocheck
/**
 * RadarNBA Telemetry Logger & Alerting Engine
 * 
 * Provides structured, JSON-formatted telemetry, log scrubbing for PII and secrets,
 * latency percentiles (p50, p90, p95), error rate tracking, and real-time alerts.
 */

import crypto from "crypto";

export type LogLevel = "info" | "warn" | "error" | "alert";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  event: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  ipHash?: string;
  provider?: string;
  circuitState?: string;
  message?: string;
  meta?: Record<string, any>;
}

export interface TelemetryAlert {
  id: string;
  triggeredAt: string;
  type: "HIGH_ERROR_RATE" | "HIGH_LATENCY" | "RATE_LIMIT_FLOOD" | "CIRCUIT_BREAKER_OPEN";
  severity: "medium" | "high" | "critical";
  title: string;
  description: string;
  metrics: Record<string, any>;
}

export interface TelemetrySummary {
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
  activeAlerts: TelemetryAlert[];
  circuitBreakerStatus: Record<string, any>;
  recentLogs: LogEntry[];
}

const SERVER_START_TIME = Date.now();
const MAX_RING_BUFFER_SIZE = 500;
const logRingBuffer: LogEntry[] = [];
const requestLatenciesMs: number[] = [];
const MAX_LATENCY_SAMPLES = 1000;

let totalRequestsCount = 0;
let s2xxCount = 0;
let s3xxCount = 0;
let s4xxCount = 0;
let s5xxCount = 0;
let rateLimit429Count = 0;

const ACTIVE_ALERTS = new Map<string, TelemetryAlert>();

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passcode/i,
  /secret/i,
  /token/i,
  /auth/i,
  /cookie/i,
  /session/i,
  /bearer/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
];

const ANONYMIZATION_SALT = process.env.LOG_ANONYMIZATION_SALT || "radarnba_telemetry_salt_v1";

/**
 * Anonymizes client IP addresses using SHA-256 with a fixed salt.
 */
export function hashClientIp(ipRaw?: string): string {
  if (!ipRaw) return "ip_unknown";
  const cleanIp = String(ipRaw).split(",")[0].trim();
  const hash = crypto.createHash("sha256").update(`${cleanIp}:${ANONYMIZATION_SALT}`).digest("hex");
  return `ip_${hash.slice(0, 10)}`;
}

/**
 * Recursively scrubs PII, secrets, and credentials from log objects.
 */
export function sanitizeLogData(data: any, depth = 0): any {
  if (depth > 4 || data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    let clean = data;
    clean = clean.replace(/(bearer\s+)[a-zA-Z0-9._~+/-]+=*/gi, "$1[REDACTED_TOKEN]");
    clean = clean.replace(/(passcode=)[^&]+/gi, "$1[REDACTED]");
    clean = clean.replace(/(radarnba_admin_session=)[^;]+/gi, "$1[REDACTED_COOKIE]");
    return clean;
  }

  if (Array.isArray(data)) {
    return data.slice(0, 50).map((item) => sanitizeLogData(item, depth + 1));
  }

  if (typeof data === "object") {
    const cleanObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        cleanObj[key] = "[REDACTED]";
      } else {
        cleanObj[key] = sanitizeLogData(value, depth + 1);
      }
    }
    return cleanObj;
  }

  return data;
}

function pushToRingBuffer(entry: LogEntry) {
  logRingBuffer.unshift(entry);
  if (logRingBuffer.length > MAX_RING_BUFFER_SIZE) {
    logRingBuffer.pop();
  }
}

function recordLatency(durationMs: number) {
  requestLatenciesMs.push(durationMs);
  if (requestLatenciesMs.length > MAX_LATENCY_SAMPLES) {
    requestLatenciesMs.shift();
  }
}

function calculatePercentile(p: number): number {
  if (requestLatenciesMs.length === 0) return 0;
  const sorted = [...requestLatenciesMs].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[index]);
}

/**
 * Emit structured telemetry log entry.
 */
export function logTelemetry(
  level: LogLevel,
  event: string,
  meta: Partial<LogEntry> = {}
): LogEntry {
  const entry: LogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    event,
    ...meta,
  };

  if (entry.message) entry.message = sanitizeLogData(entry.message);
  if (entry.meta) entry.meta = sanitizeLogData(entry.meta);

  pushToRingBuffer(entry);

  const jsonStr = JSON.stringify(entry);
  if (level === "error" || level === "alert") {
    console.error(`[RadarNBA Telemetry] ${jsonStr}`);
  } else if (level === "warn") {
    console.warn(`[RadarNBA Telemetry] ${jsonStr}`);
  } else {
    console.log(`[RadarNBA Telemetry] ${jsonStr}`);
  }

  evaluateAlertConditions();
  return entry;
}

/**
 * Express middleware to record telemetry for all incoming requests.
 */
export function expressTelemetryMiddleware(req: any, res: any, next: any) {
  const startTime = Date.now();
  const ipHash = hashClientIp(req.headers["x-forwarded-for"] || req.socket?.remoteAddress);

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;

    totalRequestsCount++;
    recordLatency(durationMs);

    if (statusCode >= 200 && statusCode < 300) s2xxCount++;
    else if (statusCode >= 300 && statusCode < 400) s3xxCount++;
    else if (statusCode >= 400 && statusCode < 500) {
      s4xxCount++;
      if (statusCode === 429) rateLimit429Count++;
    } else if (statusCode >= 500) {
      s5xxCount++;
    }

    const level: LogLevel = statusCode >= 500 ? "error" : statusCode === 429 ? "warn" : "info";

    logTelemetry(level, "http_request", {
      method: req.method,
      path: req.path || req.url,
      statusCode,
      durationMs,
      ipHash,
      meta: {
        queryKeys: Object.keys(req.query || {}),
        contentLength: res.getHeader("content-length") || 0,
        cacheControl: res.getHeader("cache-control") || "none",
      },
    });
  });

  next();
}

/**
 * Evaluates operational conditions and fires / clears alerts.
 */
export function evaluateAlertConditions() {
  const nowStr = new Date().toISOString();
  const recentWindow = logRingBuffer.slice(0, 100);
  const totalRecent = recentWindow.length;

  if (totalRecent >= 20) {
    const recent5xx = recentWindow.filter((l) => l.statusCode && l.statusCode >= 500).length;
    const errorRate5xx = (recent5xx / totalRecent) * 100;

    if (errorRate5xx >= 12) {
      ACTIVE_ALERTS.set("HIGH_ERROR_RATE", {
        id: "alert_5xx_rate",
        triggeredAt: nowStr,
        type: "HIGH_ERROR_RATE",
        severity: "high",
        title: "Tasa elevada de errores HTTP 5xx",
        description: `Un ${errorRate5xx.toFixed(1)}% de las últimas 100 peticiones respondieron con error de servidor (>= 500).`,
        metrics: { recent5xx, totalRecent, errorRate5xx: Math.round(errorRate5xx) },
      });
    } else {
      ACTIVE_ALERTS.delete("HIGH_ERROR_RATE");
    }
  }

  const p95 = calculatePercentile(95);
  if (p95 >= 3000 && requestLatenciesMs.length >= 25) {
    ACTIVE_ALERTS.set("HIGH_LATENCY", {
      id: "alert_latency_p95",
      triggeredAt: nowStr,
      type: "HIGH_LATENCY",
      severity: "medium",
      title: "Latencia p95 elevada en respuestas de servidor",
      description: `El percentil 95 de latencia ha alcanzado ${p95}ms en las muestras recientes.`,
      metrics: { p95Ms: p95, samples: requestLatenciesMs.length },
    });
  } else {
    ACTIVE_ALERTS.delete("HIGH_LATENCY");
  }

  if (rateLimit429Count >= 15) {
    ACTIVE_ALERTS.set("RATE_LIMIT_FLOOD", {
      id: "alert_429_flood",
      triggeredAt: nowStr,
      type: "RATE_LIMIT_FLOOD",
      severity: "medium",
      title: "Pico de bloqueos por Rate Limit (HTTP 429)",
      description: `Se han registrado ${rateLimit429Count} peticiones bloqueadas por rate-limiting.`,
      metrics: { rateLimit429Count },
    });
  } else {
    ACTIVE_ALERTS.delete("RATE_LIMIT_FLOOD");
  }
}

/**
 * Returns aggregated telemetry summary for administration dashboard.
 */
export function getTelemetrySummary(circuitsMetrics?: Record<string, any>): TelemetrySummary {
  const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
  const recentOneMinLogs = logRingBuffer.filter(
    (l) => Date.now() - new Date(l.timestamp).getTime() <= 60000
  );

  const avgMs =
    requestLatenciesMs.length > 0
      ? Math.round(requestLatenciesMs.reduce((a, b) => a + b, 0) / requestLatenciesMs.length)
      : 0;

  const totalErrors = s4xxCount + s5xxCount;
  const errorRatePct =
    totalRequestsCount > 0 ? Math.round((totalErrors / totalRequestsCount) * 1000) / 10 : 0;

  return {
    uptimeSeconds,
    totalRequests: totalRequestsCount,
    requestsLastMinute: recentOneMinLogs.length,
    statusDistribution: {
      s2xx: s2xxCount,
      s3xx: s3xxCount,
      s4xx: s4xxCount,
      s5xx: s5xxCount,
    },
    latency: {
      avgMs,
      p50Ms: calculatePercentile(50),
      p90Ms: calculatePercentile(90),
      p95Ms: calculatePercentile(95),
    },
    errorRatePct,
    activeAlerts: Array.from(ACTIVE_ALERTS.values()),
    circuitBreakerStatus: circuitsMetrics || {},
    recentLogs: logRingBuffer.slice(0, 50),
  };
}
