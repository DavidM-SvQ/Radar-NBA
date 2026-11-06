import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  Lock,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Zap,
} from 'lucide-react';
import type {
  AdminSecurityConfig,
  AdminSecurityConfigValues,
} from '../types/nba';
import {
  CLIENT_DEFAULT_SECURITY_VALUES,
  CLIENT_SECURITY_BOUNDS,
  fetchAdminSecurityConfig,
  fetchAdminTelemetry,
  resetAdminCircuitBreakers,
  resetAdminRateLimitCounters,
  resetAdminSecurityConfigDefaults,
  updateAdminSecurityConfig,
  type CircuitMetricsClient,
  type RateLimitBackendKind,
  type TelemetrySummaryClient,
} from '../utils/adminAuthClient';

interface AdminSecurityConfigPanelProps {
  onLockSession: () => void;
}

type DraftValues = Record<keyof AdminSecurityConfigValues, string>;

function valuesToDraft(values: AdminSecurityConfigValues): DraftValues {
  return {
    nbaApiLimit: String(values.nbaApiLimit),
    nbaApiWindowMinutes: String(values.nbaApiWindowMinutes),
    nbaRefreshLimit: String(values.nbaRefreshLimit),
    nbaRefreshWindowMinutes: String(values.nbaRefreshWindowMinutes),
    adminBruteForceMaxAttempts: String(values.adminBruteForceMaxAttempts),
    adminBruteForceWindowMinutes: String(values.adminBruteForceWindowMinutes),
    adminFloodLimit: String(values.adminFloodLimit),
    adminFloodWindowMinutes: String(values.adminFloodWindowMinutes),
    adminSessionTtlHours: String(values.adminSessionTtlHours),
  };
}

function extractValues(cfg: AdminSecurityConfig): AdminSecurityConfigValues {
  return {
    nbaApiLimit: cfg.nbaApiLimit,
    nbaApiWindowMinutes: cfg.nbaApiWindowMinutes,
    nbaRefreshLimit: cfg.nbaRefreshLimit,
    nbaRefreshWindowMinutes: cfg.nbaRefreshWindowMinutes,
    adminBruteForceMaxAttempts: cfg.adminBruteForceMaxAttempts,
    adminBruteForceWindowMinutes: cfg.adminBruteForceWindowMinutes,
    adminFloodLimit: cfg.adminFloodLimit,
    adminFloodWindowMinutes: cfg.adminFloodWindowMinutes,
    adminSessionTtlHours: cfg.adminSessionTtlHours,
  };
}

function formatUpdatedTimestamp(ts: number): string {
  if (!ts || ts <= 0) return 'Valores base recomendados activos';
  try {
    const dt = new Date(ts);
    return `Última modificación: ${dt.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    })} · ${dt.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch {
    return 'Configuración personalizada activa';
  }
}

export function AdminSecurityConfigPanel({
  onLockSession,
}: AdminSecurityConfigPanelProps) {
  const [expanded, setExpanded] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [clearingCounters, setClearingCounters] = useState<boolean>(false);

  const [savedConfig, setSavedConfig] = useState<AdminSecurityConfig>({
    ...CLIENT_DEFAULT_SECURITY_VALUES,
    updatedAt: 0,
  });
  const [defaults, setDefaults] = useState<AdminSecurityConfigValues>(
    CLIENT_DEFAULT_SECURITY_VALUES
  );
  const [draft, setDraft] = useState<DraftValues>(() =>
    valuesToDraft(CLIENT_DEFAULT_SECURITY_VALUES)
  );
  const [rateLimitBackend, setRateLimitBackend] =
    useState<RateLimitBackendKind>('memory');
  const [circuits, setCircuits] = useState<Record<
    string,
    CircuitMetricsClient
  > | null>(null);
  const [resettingCircuits, setResettingCircuits] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetrySummaryClient | null>(null);

  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadTelemetry = useCallback(async () => {
    const res = await fetchAdminTelemetry();
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok && res.telemetry) {
      setTelemetry(res.telemetry);
    }
  }, [onLockSession]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    const res = await fetchAdminSecurityConfig();
    setLoading(false);
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      setSavedConfig(res.config);
      if (res.defaults) setDefaults(res.defaults);
      if (res.rateLimitBackend) setRateLimitBackend(res.rateLimitBackend);
      if (res.circuits) setCircuits(res.circuits);
      setDraft(valuesToDraft(extractValues(res.config)));
    } else if (res.error) {
      setFeedback({ kind: 'error', text: res.error });
    }
    void loadTelemetry();
  }, [onLockSession, loadTelemetry]);

  useEffect(() => {
    void loadConfig();
    const timer = setInterval(() => {
      void loadTelemetry();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadConfig, loadTelemetry]);

  const fieldValidation = useMemo(() => {
    const errors: Partial<Record<keyof AdminSecurityConfigValues, string>> = {};
    const parsedValues = { ...CLIENT_DEFAULT_SECURITY_VALUES };

    for (const key of Object.keys(CLIENT_SECURITY_BOUNDS) as Array<
      keyof AdminSecurityConfigValues
    >) {
      const raw = (draft[key] ?? '').trim();
      const bounds = CLIENT_SECURITY_BOUNDS[key];
      const num = Number(raw);
      if (!raw || Number.isNaN(num) || !Number.isInteger(num)) {
        errors[key] = `Introduce un entero (${bounds.min}–${bounds.max})`;
      } else if (num < bounds.min || num > bounds.max) {
        errors[key] = `Rango permitido: ${bounds.min}–${bounds.max}`;
      } else {
        parsedValues[key] = num;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      parsedValues,
    };
  }, [draft]);

  const isDirty = useMemo(() => {
    return (
      Object.keys(CLIENT_SECURITY_BOUNDS) as Array<
        keyof AdminSecurityConfigValues
      >
    ).some((k) => draft[k]?.trim() !== String(savedConfig[k]));
  }, [draft, savedConfig]);

  const isAtFactoryDefaults = useMemo(() => {
    return (
      Object.keys(CLIENT_SECURITY_BOUNDS) as Array<
        keyof AdminSecurityConfigValues
      >
    ).every((k) => savedConfig[k] === defaults[k]) && !isDirty;
  }, [savedConfig, defaults, isDirty]);

  const handleFieldChange = (
    key: keyof AdminSecurityConfigValues,
    raw: string
  ) => {
    // Allow empty string while editing or digits only
    const cleaned = raw.replace(/[^\d]/g, '').slice(0, 5);
    setDraft((prev) => ({ ...prev, [key]: cleaned }));
    if (feedback) setFeedback(null);
  };

  const handleSave = async () => {
    if (!fieldValidation.isValid || saving) return;
    setSaving(true);
    setFeedback(null);
    const res = await updateAdminSecurityConfig(fieldValidation.parsedValues);
    setSaving(false);
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      setSavedConfig(res.config);
      if (res.rateLimitBackend) setRateLimitBackend(res.rateLimitBackend);
      setDraft(valuesToDraft(extractValues(res.config)));
      setFeedback({
        kind: 'success',
        text: 'Límites guardados y aplicados en caliente en el servidor.',
      });
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'No se pudieron guardar los cambios.',
      });
    }
  };

  const handleRestoreDefaults = async () => {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    const res = await resetAdminSecurityConfigDefaults();
    setSaving(false);
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      setSavedConfig(res.config);
      if (res.defaults) setDefaults(res.defaults);
      if (res.rateLimitBackend) setRateLimitBackend(res.rateLimitBackend);
      setDraft(valuesToDraft(extractValues(res.config)));
      setFeedback({
        kind: 'success',
        text: 'Valores base recomendados restaurados en el servidor.',
      });
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'Error al restaurar valores base.',
      });
    }
  };

  const handleClearIpCounters = async () => {
    if (clearingCounters) return;
    setClearingCounters(true);
    setFeedback(null);
    const res = await resetAdminRateLimitCounters();
    setClearingCounters(false);
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok) {
      setFeedback({
        kind: 'success',
        text: 'Contadores de peticiones y bloqueos temporales por IP reiniciados.',
      });
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'No se pudieron limpiar los contadores IP.',
      });
    }
  };

  const handleResetCircuits = async () => {
    if (resettingCircuits) return;
    setResettingCircuits(true);
    setFeedback(null);
    const ok = await resetAdminCircuitBreakers();
    setResettingCircuits(false);
    if (ok) {
      await loadConfig();
      setFeedback({
        kind: 'success',
        text: 'Circuit breakers de proveedores externos reseteados a CLOSED (tráfico normal restablecido).',
      });
    } else {
      setFeedback({
        kind: 'error',
        text: 'No se pudieron reiniciar los circuit breakers.',
      });
    }
  };

  const renderNumberControl = (params: {
    fieldKey: keyof AdminSecurityConfigValues;
    label: string;
    unit: string;
  }) => {
    const { fieldKey, label, unit } = params;
    const bounds = CLIENT_SECURITY_BOUNDS[fieldKey];
    const baseVal = defaults[fieldKey];
    const err = fieldValidation.errors[fieldKey];
    const changed = draft[fieldKey]?.trim() !== String(savedConfig[fieldKey]);

    return (
      <div className="space-y-1">
        <label
          htmlFor={`sec-${fieldKey}`}
          className="block text-xs font-medium text-slate-300"
        >
          {label}
        </label>
        <div className="relative flex items-center">
          <input
            id={`sec-${fieldKey}`}
            type="text"
            inputMode="numeric"
            value={draft[fieldKey]}
            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
            className={`w-full min-h-[40px] pl-3 pr-14 py-1.5 bg-[#0B1120] rounded-lg font-mono tabular-nums text-sm text-slate-100 border transition-colors focus:outline-none ${
              err
                ? 'border-rose-500/70 focus:border-rose-400'
                : changed
                ? 'border-orange-500/60 focus:border-orange-400'
                : 'border-[#1E293B] focus:border-orange-500'
            }`}
          />
          <span className="pointer-events-none absolute right-3 text-xs font-mono text-slate-500">
            {unit}
          </span>
        </div>
        {err ? (
          <p className="text-[11px] text-rose-400">{err}</p>
        ) : (
          <p className="text-[11px] text-slate-500 font-mono tabular-nums">
            Rango {bounds.min}–{bounds.max} · Base {baseVal}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl overflow-hidden">
      {/* Top Admin Header Bar */}
      <div className="p-4 sm:px-5 sm:py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">
              Panel de Configuración General y Seguridad
            </h2>
          </div>
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            API {savedConfig.nbaApiLimit} req/{savedConfig.nbaApiWindowMinutes}m
            <span className="mx-1.5 text-slate-600">·</span>
            Refresh {savedConfig.nbaRefreshLimit}/
            {savedConfig.nbaRefreshWindowMinutes}m
            <span className="mx-1.5 text-slate-600">·</span>
            Login máx. {savedConfig.adminBruteForceMaxAttempts} intentos/
            {savedConfig.adminBruteForceWindowMinutes}m
            <span className="mx-1.5 text-slate-600">·</span>
            Sesión {savedConfig.adminSessionTtlHours}h
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] text-slate-200 border border-[#1E293B] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400" />
            <span>{expanded ? 'Contraer límites' : 'Editar límites'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          <button
            type="button"
            onClick={onLockSession}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0B1120] hover:bg-[#182338] text-slate-300 hover:text-white border border-[#1E293B] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Bloquear sesión</span>
          </button>
        </div>
      </div>

      {/* Expandable Rate-Limit & Security Controls */}
      {expanded && (
        <div className="border-t border-[#1E293B] divide-y divide-[#1E293B]">
          {loading ? (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className="space-y-2 animate-pulse">
                  <div className="h-3.5 w-48 bg-[#1E293B] rounded" />
                  <div className="h-10 w-full bg-[#0B1120] rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Row 1 & 2: NBA API General + Heavy Refresh */}
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
                <div className="p-4 sm:p-5 space-y-3">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-100">
                      01. Límite General API de Datos (/api/nba/*)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tope de peticiones por IP para navegación de tablas, fichas,
                      jornadas y buscador.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {renderNumberControl({
                      fieldKey: 'nbaApiLimit',
                      label: 'Máx. peticiones',
                      unit: 'req',
                    })}
                    {renderNumberControl({
                      fieldKey: 'nbaApiWindowMinutes',
                      label: 'Ventana temporal',
                      unit: 'min',
                    })}
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-3">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-100">
                      02. Límite de Actualizaciones Forzadas (?refresh=1)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Protege las cuotas de crónicas y llamadas directas en vivo a
                      fuentes externas NBA.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {renderNumberControl({
                      fieldKey: 'nbaRefreshLimit',
                      label: 'Máx. recargas',
                      unit: 'req',
                    })}
                    {renderNumberControl({
                      fieldKey: 'nbaRefreshWindowMinutes',
                      label: 'Ventana temporal',
                      unit: 'min',
                    })}
                  </div>
                </div>
              </div>

              {/* Row 3 & 4: Brute-Force Login + Admin Flood */}
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
                <div className="p-4 sm:p-5 space-y-3">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-100">
                      03. Escudo Fuerza Bruta en Clave Privada (/api/admin/login)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Intentos erróneos permitidos por IP antes de bloquear el
                      acceso temporalmente.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {renderNumberControl({
                      fieldKey: 'adminBruteForceMaxAttempts',
                      label: 'Intentos fallidos',
                      unit: 'máx',
                    })}
                    {renderNumberControl({
                      fieldKey: 'adminBruteForceWindowMinutes',
                      label: 'Tiempo bloqueo',
                      unit: 'min',
                    })}
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-3">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-100">
                      04. Tráfico Zona Admin y Caducidad de Sesión
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tope de peticiones sobre rutas privadas y horas de validez
                      del token firmado.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {renderNumberControl({
                      fieldKey: 'adminFloodLimit',
                      label: 'Solicitudes admin',
                      unit: 'req',
                    })}
                    {renderNumberControl({
                      fieldKey: 'adminFloodWindowMinutes',
                      label: 'Ventana admin',
                      unit: 'min',
                    })}
                    {renderNumberControl({
                      fieldKey: 'adminSessionTtlHours',
                      label: 'Duración sesión',
                      unit: 'horas',
                    })}
                  </div>
                </div>

                {/* 04. Circuit Breakers & External Providers Multilevel Fallback */}
                <div className="p-4 sm:p-5 space-y-3 bg-[#0B1120]/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-200">
                          04. Circuit Breakers y Fallback Multinivel de Proveedores
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Aislamiento de fallos y degradación suave ante caídas de stats.nba.com, CDN y ESPN (estados CLOSED / OPEN / HALF-OPEN).
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={resettingCircuits}
                      onClick={() => void handleResetCircuits()}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] disabled:opacity-50 text-slate-300 hover:text-white border border-[#1E293B] rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <RotateCcw
                        className={`w-3.5 h-3.5 text-slate-400 ${
                          resettingCircuits ? 'animate-spin' : ''
                        }`}
                      />
                      <span>Restablecer circuitos</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    {[
                      {
                        key: 'nba_stats',
                        name: 'NBA Stats API',
                        domain: 'stats.nba.com',
                        desc: 'Partidos, estadísticas avanzadas y rankings oficiales',
                      },
                      {
                        key: 'nba_cdn',
                        name: 'NBA CDN Live',
                        domain: 'cdn.nba.com',
                        desc: 'Boxscores en tiempo real y deltas de calendario',
                      },
                      {
                        key: 'espn_api',
                        name: 'ESPN API Fallback',
                        domain: 'site.api.espn.com',
                        desc: 'Marcadores en vivo, rotaciones y lesiones de plantilla',
                      },
                    ].map((prov) => {
                      const metric = circuits ? circuits[prov.key] : null;
                      const state = metric?.state || 'CLOSED';
                      const isClosed = state === 'CLOSED';
                      const isHalfOpen = state === 'HALF_OPEN';
                      return (
                        <div
                          key={prov.key}
                          className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {prov.name}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider ${
                                isClosed
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : isHalfOpen
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {state}
                            </span>
                          </div>

                          <div className="space-y-1 text-[11px] font-mono text-slate-400">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Dominio:</span>
                              <span className="text-slate-300 truncate max-w-[140px]">{prov.domain}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Peticiones OK / Fallos:</span>
                              <span className="text-slate-300">
                                {metric ? `${metric.totalSuccesses} / ${metric.totalFailures}` : '0 / 0'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Fast-fails evitados:</span>
                              <span className="text-orange-400 font-semibold">
                                {metric ? metric.totalShortCircuits : 0}
                              </span>
                            </div>
                            {metric?.openRemainingMs ? (
                              <div className="flex justify-between text-rose-400 font-semibold">
                                <span>Cooldown activo:</span>
                                <span>{Math.round(metric.openRemainingMs / 1000)}s</span>
                              </div>
                            ) : null}
                          </div>

                          <p className="text-[10px] text-slate-500 leading-tight">
                            {prov.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 05. Structured Telemetry & Anonymized Operations Log */}
                <div className="p-4 sm:p-5 space-y-4 bg-[#0B1120]/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-cyan-400" />
                      <div>
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-200">
                          05. Telemetría de Rendimiento y Registro Sanitizado (Punto 9)
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Monitorización de latencias (p50/p90/p95), distribución HTTP, tasa de errores y encriptación de IPs/secretos sin PII.
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      <Zap className="w-3 h-3 animate-pulse" />
                      <span>Sondeo cada 10s</span>
                    </span>
                  </div>

                  {telemetry ? (
                    <div className="space-y-4">
                      {/* Active Alerts List */}
                      {telemetry.activeAlerts.length > 0 ? (
                        <div className="space-y-2">
                          {telemetry.activeAlerts.map((alert) => (
                            <div
                              key={alert.id}
                              className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-start gap-2.5"
                            >
                              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                              <div className="space-y-0.5 min-w-0">
                                <h4 className="text-xs font-bold text-rose-300">
                                  {alert.title}
                                </h4>
                                <p className="text-[11px] text-rose-200/80">
                                  {alert.description}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {/* KPI Cards Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 space-y-1">
                          <span className="text-[10px] font-mono text-slate-500 uppercase">
                            Latencia p50 / p95
                          </span>
                          <div className="text-sm sm:text-base font-bold font-mono text-slate-100">
                            {telemetry.latency.p50Ms}ms{' '}
                            <span className="text-xs text-orange-400 font-normal">
                              / {telemetry.latency.p95Ms}ms
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500">Avg {telemetry.latency.avgMs}ms</p>
                        </div>

                        <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 space-y-1">
                          <span className="text-[10px] font-mono text-slate-500 uppercase">
                            Tasa Errores HTTP
                          </span>
                          <div
                            className={`text-sm sm:text-base font-bold font-mono ${
                              telemetry.errorRatePct > 5 ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            {telemetry.errorRatePct}%
                          </div>
                          <p className="text-[10px] text-slate-500">
                            {telemetry.statusDistribution.s4xx + telemetry.statusDistribution.s5xx} fallos acumulados
                          </p>
                        </div>

                        <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 space-y-1">
                          <span className="text-[10px] font-mono text-slate-500 uppercase">
                            Carga Peticiones
                          </span>
                          <div className="text-sm sm:text-base font-bold font-mono text-cyan-400">
                            {telemetry.requestsLastMinute}{' '}
                            <span className="text-xs text-slate-400 font-normal">req/min</span>
                          </div>
                          <p className="text-[10px] text-slate-500">Total {telemetry.totalRequests} reqs</p>
                        </div>

                        <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 space-y-1">
                          <span className="text-[10px] font-mono text-slate-500 uppercase">
                            Distribución Respuestas
                          </span>
                          <div className="text-xs font-mono text-slate-300 space-x-1.5 pt-0.5">
                            <span className="text-emerald-400">2xx:{telemetry.statusDistribution.s2xx}</span>
                            <span className="text-amber-400">3xx:{telemetry.statusDistribution.s3xx}</span>
                            <span className="text-rose-400">5xx:{telemetry.statusDistribution.s5xx}</span>
                          </div>
                          <p className="text-[10px] text-slate-500">Uptime: {Math.floor(telemetry.uptimeSeconds / 60)}m</p>
                        </div>
                      </div>

                      {/* Recent Logs Table Preview */}
                      {telemetry.recentLogs.length > 0 ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                            <Terminal className="w-3.5 h-3.5 text-slate-500" />
                            <span>Últimos registros HTTP en buffer (IPs anonimizadas, sin tokens)</span>
                          </div>

                          <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto max-h-44 font-mono text-[11px]">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-[#1E293B] text-slate-500 text-[10px] uppercase">
                                  <th className="p-2">Hora</th>
                                  <th className="p-2">Método</th>
                                  <th className="p-2">Ruta</th>
                                  <th className="p-2">Status</th>
                                  <th className="p-2">Duración</th>
                                  <th className="p-2">IP Hash</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#1E293B]/50">
                                {telemetry.recentLogs.slice(0, 8).map((log) => (
                                  <tr key={log.id} className="hover:bg-[#131C2E]/50 text-slate-300">
                                    <td className="p-2 text-slate-500 whitespace-nowrap">
                                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                                    </td>
                                    <td className="p-2 font-bold text-slate-200">{log.method || 'GET'}</td>
                                    <td className="p-2 text-cyan-300 truncate max-w-[200px]">{log.path || '/'}</td>
                                    <td className="p-2">
                                      <span
                                        className={`px-1 rounded text-[10px] ${
                                          (log.statusCode || 200) >= 500
                                            ? 'bg-rose-500/20 text-rose-400'
                                            : (log.statusCode || 200) >= 400
                                            ? 'bg-amber-500/20 text-amber-400'
                                            : (log.statusCode || 200) >= 300
                                            ? 'bg-sky-500/20 text-sky-400'
                                            : 'bg-emerald-500/20 text-emerald-400'
                                        }`}
                                      >
                                        {log.statusCode || 200}
                                      </span>
                                    </td>
                                    <td className="p-2 text-slate-400">{log.durationMs || 0}ms</td>
                                    <td className="p-2 text-slate-500 text-[10px]">{log.ipHash || 'ip_anon'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="p-4 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs font-mono text-slate-500 animate-pulse">
                      Cargando telemetría del servidor...
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Action Strip */}
              <div className="px-4 py-3.5 sm:px-5 bg-[#0B1120]/60 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs min-w-0">
                  {feedback ? (
                    <span
                      className={`inline-flex items-center gap-1.5 font-medium ${
                        feedback.kind === 'success'
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {feedback.kind === 'success' && (
                        <Check className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{feedback.text}</span>
                    </span>
                  ) : isDirty ? (
                    <span className="text-orange-300 font-medium">
                      Tienes cambios pendientes de guardar en el servidor.
                    </span>
                  ) : (
                    <span className="text-slate-400 font-mono tabular-nums">
                      {formatUpdatedTimestamp(savedConfig.updatedAt)}
                      <span className="mx-1.5 text-slate-600">·</span>
                      Cookie HttpOnly Strict + CSRF
                      <span className="mx-1.5 text-slate-600">·</span>
                      {rateLimitBackend === 'upstash-redis'
                        ? 'Rate Limit distribuido (Upstash Redis)'
                        : 'Rate Limit en memoria local'}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={clearingCounters || saving}
                    onClick={() => void handleClearIpCounters()}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] disabled:opacity-50 text-slate-300 hover:text-white border border-[#1E293B] rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-slate-400 ${
                        clearingCounters ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Limpiar bloqueos IP</span>
                  </button>

                  <button
                    type="button"
                    disabled={saving || isAtFactoryDefaults}
                    onClick={() => void handleRestoreDefaults()}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] disabled:opacity-50 text-slate-300 hover:text-white border border-[#1E293B] rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Restaurar valores base</span>
                  </button>

                  <button
                    type="button"
                    disabled={!isDirty || !fieldValidation.isValid || saving}
                    onClick={() => void handleSave()}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {saving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>{saving ? 'Guardando...' : 'Guardar cambios'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
