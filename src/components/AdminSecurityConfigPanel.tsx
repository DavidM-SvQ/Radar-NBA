import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  AdminSecurityConfig,
  AdminSecurityConfigValues,
} from '../types/nba';
import {
  CLIENT_DEFAULT_SECURITY_VALUES,
  CLIENT_SECURITY_BOUNDS,
  fetchAdminSecurityConfig,
  resetAdminRateLimitCounters,
  resetAdminSecurityConfigDefaults,
  updateAdminSecurityConfig,
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

  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

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
      setDraft(valuesToDraft(extractValues(res.config)));
    } else if (res.error) {
      setFeedback({ kind: 'error', text: res.error });
    }
  }, [onLockSession]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

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
                      Cabeceras Helmet + Validación Zod activas
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
