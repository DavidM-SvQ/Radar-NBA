// @ts-nocheck
/**
 * RadarNBA Circuit Breaker & Multilevel Fallback Service
 * 
 * Provides fault isolation, fast failure recovery, and graceful degradation
 * across external data providers (stats.nba.com, cdn.nba.com, site.api.espn.com).
 * 
 * States:
 * - CLOSED: Normal operating condition. Requests flow to the provider.
 * - OPEN: Provider failure threshold reached. Requests fail fast without network latency.
 * - HALF_OPEN: Cooldown has passed. Canary requests probe provider recovery.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export type ExternalProvider = "nba_stats" | "nba_cdn" | "espn_api" | "general";

export interface CircuitConfig {
  failureThreshold: number;
  baseCooldownMs: number;
  maxCooldownMs: number;
  canaryTarget: number;
}

export interface CircuitMetrics {
  provider: ExternalProvider;
  state: CircuitState;
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
  openUntil: number | null;
  openRemainingMs: number;
}

const DEFAULT_CONFIGS: Record<ExternalProvider, CircuitConfig> = {
  nba_stats: {
    failureThreshold: 3,
    baseCooldownMs: 35 * 1e3,
    maxCooldownMs: 300 * 1e3,
    canaryTarget: 2,
  },
  nba_cdn: {
    failureThreshold: 4,
    baseCooldownMs: 25 * 1e3,
    maxCooldownMs: 180 * 1e3,
    canaryTarget: 2,
  },
  espn_api: {
    failureThreshold: 3,
    baseCooldownMs: 30 * 1e3,
    maxCooldownMs: 240 * 1e3,
    canaryTarget: 2,
  },
  general: {
    failureThreshold: 3,
    baseCooldownMs: 30 * 1e3,
    maxCooldownMs: 240 * 1e3,
    canaryTarget: 2,
  },
};

class ProviderCircuit {
  provider: ExternalProvider;
  state: CircuitState = "CLOSED";
  consecutiveFailures = 0;
  totalFailures = 0;
  totalSuccesses = 0;
  totalShortCircuits = 0;
  trippedCount = 0;
  lastFailureTime: number | null = null;
  lastFailureReason: string | null = null;
  lastSuccessTime: number | null = null;
  openUntil: number | null = null;
  halfOpenCanaryRemaining = 0;
  config: CircuitConfig;

  constructor(provider: ExternalProvider) {
    this.provider = provider;
    this.config = DEFAULT_CONFIGS[provider] || DEFAULT_CONFIGS.general;
  }

  getCurrentCooldownMs(): number {
    const exponent = Math.max(0, this.trippedCount - 1);
    const ms = this.config.baseCooldownMs * Math.pow(1.6, exponent);
    return Math.min(this.config.maxCooldownMs, Math.round(ms));
  }

  recordSuccess() {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    if (this.state === "HALF_OPEN") {
      this.halfOpenCanaryRemaining--;
      if (this.halfOpenCanaryRemaining <= 0) {
        this.state = "CLOSED";
        this.consecutiveFailures = 0;
        this.openUntil = null;
        console.log(`[CircuitBreaker] ${this.provider} recuperado -> CLOSED`);
      }
    } else if (this.state === "CLOSED") {
      this.consecutiveFailures = 0;
    }
  }

  recordFailure(reason: string) {
    this.totalFailures++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.lastFailureReason = reason.slice(0, 160);

    if (this.state === "HALF_OPEN" || this.consecutiveFailures >= this.config.failureThreshold) {
      this.trippedCount++;
      const cooldown = this.getCurrentCooldownMs();
      this.state = "OPEN";
      this.openUntil = Date.now() + cooldown;
      console.warn(
        `[CircuitBreaker] ${this.provider} ha disparado OPEN por ${Math.round(cooldown / 1e3)}s tras error: ${reason}`
      );
    }
  }

  canExecute(): boolean {
    const now = Date.now();
    if (this.state === "CLOSED") {
      return true;
    }
    if (this.state === "OPEN") {
      if (this.openUntil && now >= this.openUntil) {
        this.state = "HALF_OPEN";
        this.halfOpenCanaryRemaining = this.config.canaryTarget;
        console.log(`[CircuitBreaker] ${this.provider} cooldown cumplido -> HALF_OPEN (enviando canario)`);
        return true;
      }
      this.totalShortCircuits++;
      return false;
    }
    if (this.state === "HALF_OPEN") {
      return true;
    }
    return true;
  }

  reset() {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.openUntil = null;
    this.halfOpenCanaryRemaining = 0;
    this.trippedCount = 0;
  }

  toMetrics(): CircuitMetrics {
    const now = Date.now();
    const openRemaining = this.openUntil && this.openUntil > now ? this.openUntil - now : 0;
    return {
      provider: this.provider,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.config.failureThreshold,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalShortCircuits: this.totalShortCircuits,
      trippedCount: this.trippedCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      lastFailureReason: this.lastFailureReason,
      lastSuccessTime: this.lastSuccessTime ? new Date(this.lastSuccessTime).toISOString() : null,
      cooldownMs: this.getCurrentCooldownMs(),
      openUntil: this.openUntil,
      openRemainingMs: openRemaining,
    };
  }
}

const circuits: Record<ExternalProvider, ProviderCircuit> = {
  nba_stats: new ProviderCircuit("nba_stats"),
  nba_cdn: new ProviderCircuit("nba_cdn"),
  espn_api: new ProviderCircuit("espn_api"),
  general: new ProviderCircuit("general"),
};

export function identifyProviderFromUrl(url: string): ExternalProvider {
  if (url.includes("stats.nba.com")) return "nba_stats";
  if (url.includes("cdn.nba.com")) return "nba_cdn";
  if (url.includes("espn.com") || url.includes("espncdn.com")) return "espn_api";
  return "general";
}

export class CircuitBreakerOpenError extends Error {
  provider: ExternalProvider;
  openRemainingMs: number;

  constructor(provider: ExternalProvider, openRemainingMs: number) {
    super(`Circuit breaker OPEN para el proveedor ${provider}. Petición abortada de inmediato.`);
    this.name = "CircuitBreakerOpenError";
    this.provider = provider;
    this.openRemainingMs = openRemainingMs;
  }
}

/**
 * Execute an operation protected by the provider's Circuit Breaker.
 * If the circuit is OPEN, fails fast or invokes the optional fallback function immediately.
 */
export async function executeWithCircuitBreaker<T>(
  provider: ExternalProvider,
  action: () => Promise<T>,
  fallback?: (err: Error) => Promise<T> | T
): Promise<T> {
  const circuit = circuits[provider] || circuits.general;
  if (!circuit.canExecute()) {
    const metrics = circuit.toMetrics();
    const cbErr = new CircuitBreakerOpenError(provider, metrics.openRemainingMs);
    if (fallback) {
      return await fallback(cbErr);
    }
    throw cbErr;
  }

  try {
    const result = await action();
    circuit.recordSuccess();
    return result;
  } catch (err: any) {
    const reason = err?.message || String(err);
    circuit.recordFailure(reason);
    if (fallback) {
      return await fallback(err);
    }
    throw err;
  }
}

/**
 * Multilevel execution pipeline:
 * Level 1: Primary fetch protected by circuit breaker.
 * Level 2: Stale in-memory cache lookup.
 * Level 3: Secondary provider fetch (optional).
 * Level 4: Snapshot disk fallback (optional).
 */
export async function executeMultilevelFallback<T>(opts: {
  provider: ExternalProvider;
  primaryAction: () => Promise<T>;
  staleCacheLookup?: () => T | null;
  secondaryAction?: () => Promise<T>;
  diskSnapshotFallback?: () => T | null;
  onDegradedState?: (level: number, reason: string) => void;
}): Promise<T> {
  // Level 1: Primary with Circuit Breaker
  try {
    return await executeWithCircuitBreaker(opts.provider, opts.primaryAction);
  } catch (primaryErr: any) {
    const reason = primaryErr?.message || "Primary provider unavailable";
    opts.onDegradedState?.(1, reason);

    // Level 2: Stale In-Memory Cache
    if (opts.staleCacheLookup) {
      const stale = opts.staleCacheLookup();
      if (stale !== null && stale !== undefined) {
        opts.onDegradedState?.(2, "Serving stale memory cache");
        return stale;
      }
    }

    // Level 3: Secondary live provider (e.g., ESPN if NBA Stats fails)
    if (opts.secondaryAction) {
      try {
        const secondary = await opts.secondaryAction();
        opts.onDegradedState?.(3, "Recovered via secondary provider");
        return secondary;
      } catch (secondaryErr: any) {
        opts.onDegradedState?.(3, `Secondary provider failed: ${secondaryErr?.message}`);
      }
    }

    // Level 4: Disk Snapshot Fallback
    if (opts.diskSnapshotFallback) {
      const snap = opts.diskSnapshotFallback();
      if (snap !== null && snap !== undefined) {
        opts.onDegradedState?.(4, "Recovered via persistent disk snapshot");
        return snap;
      }
    }

    throw primaryErr;
  }
}

export function getAllCircuitMetrics(): Record<ExternalProvider, CircuitMetrics> {
  return {
    nba_stats: circuits.nba_stats.toMetrics(),
    nba_cdn: circuits.nba_cdn.toMetrics(),
    espn_api: circuits.espn_api.toMetrics(),
    general: circuits.general.toMetrics(),
  };
}

export function resetCircuit(provider?: ExternalProvider) {
  if (provider && circuits[provider]) {
    circuits[provider].reset();
  } else {
    for (const c of Object.values(circuits)) {
      c.reset();
    }
  }
}
