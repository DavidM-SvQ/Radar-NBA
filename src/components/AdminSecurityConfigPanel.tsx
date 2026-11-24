import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  Database,
  Lock,
  Minus,
  Plus,
  Radio,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import { useThemeStyle } from '../context/ThemeStyleContext';
import type {
  AdminSecurityConfig,
  AdminSecurityConfigValues,
  InspectorDefaultKpisConfig,
  SeasonMode,
  ThresholdSettings,
  WindowSize,
} from '../types/nba';
import {
  CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG,
  CLIENT_DEFAULT_SECURITY_VALUES,
  CLIENT_SECURITY_BOUNDS,
  fetchAdminInspectorKpiDefaults,
  fetchAdminSecurityConfig,
  fetchAdminTelemetry,
  fetchAdminWebFeatureFlags,
  resetAdminCircuitBreakers,
  resetAdminInspectorKpiDefaults,
  resetAdminRateLimitCounters,
  resetAdminSecurityConfigDefaults,
  updateAdminInspectorKpiDefaults,
  updateAdminSecurityConfig,
  updateAdminWebFeatureFlags,
  type CircuitMetricsClient,
  type RateLimitBackendKind,
  type TelemetrySummaryClient,
} from '../utils/adminAuthClient';
import {
  NBA_ALL_KPIS_CATALOG,
  NBA_ALL_KPIS_MAP,
  NBA_KPI_LAYERS,
  type NbaKpiLayerId,
} from '../utils/nbaInspectorAllKpis';

interface AdminSecurityConfigPanelProps {
  onLockSession: () => void;
  seasonMode?: SeasonMode;
  onSeasonModeChange?: (mode: SeasonMode) => void;
  settings?: ThresholdSettings;
  onSettingsChange?: (updater: (prev: ThresholdSettings) => ThresholdSettings) => void;
  showHeroicBadges?: boolean;
  onHeroicBadgesChange?: (enabled: boolean) => void;
  inspectorDefaultKpis?: InspectorDefaultKpisConfig;
  onInspectorDefaultKpisChange?: (cfg: InspectorDefaultKpisConfig) => void;
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
  seasonMode,
  onSeasonModeChange,
  settings,
  onSettingsChange,
  showHeroicBadges = false,
  onHeroicBadgesChange,
  inspectorDefaultKpis,
  onInspectorDefaultKpisChange,
}: AdminSecurityConfigPanelProps) {
  const { themeStyle, setThemeStyle } = useThemeStyle();
  const [expanded, setExpanded] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savingHeroicFlag, setSavingHeroicFlag] = useState<boolean>(false);
  const [savingKpis, setSavingKpis] = useState<boolean>(false);
  const [clearingCounters, setClearingCounters] = useState<boolean>(false);

  const [kpiTab, setKpiTab] = useState<'player' | 'team'>('player');
  const [kpiSearch, setKpiSearch] = useState<string>('');
  const [kpiLayerFilter, setKpiLayerFilter] = useState<'all' | NbaKpiLayerId>('all');
  const [savedKpisConfig, setSavedKpisConfig] = useState<InspectorDefaultKpisConfig>(
    () =>
      inspectorDefaultKpis ?? {
        playerDefaultKpiKeys: [...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.playerDefaultKpiKeys],
        teamDefaultKpiKeys: [...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.teamDefaultKpiKeys],
        updatedAt: 0,
      }
  );
  const [draftPlayerKpiKeys, setDraftPlayerKpiKeys] = useState<string[]>(
    () =>
      inspectorDefaultKpis?.playerDefaultKpiKeys ?? [
        ...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.playerDefaultKpiKeys,
      ]
  );
  const [draftTeamKpiKeys, setDraftTeamKpiKeys] = useState<string[]>(
    () =>
      inspectorDefaultKpis?.teamDefaultKpiKeys ?? [
        ...CLIENT_DEFAULT_INSPECTOR_KPI_CONFIG.teamDefaultKpiKeys,
      ]
  );

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
    const [flagsRes, kpisRes] = await Promise.all([
      fetchAdminWebFeatureFlags(),
      fetchAdminInspectorKpiDefaults(),
    ]);
    if (flagsRes.unauthorized || kpisRes.unauthorized) {
      onLockSession();
      return;
    }
    if (flagsRes.ok && flagsRes.flags) {
      onHeroicBadgesChange?.(Boolean(flagsRes.flags.showHeroicBadges));
    }
    if (kpisRes.ok && kpisRes.config) {
      setSavedKpisConfig(kpisRes.config);
      setDraftPlayerKpiKeys([...kpisRes.config.playerDefaultKpiKeys]);
      setDraftTeamKpiKeys([...kpisRes.config.teamDefaultKpiKeys]);
      onInspectorDefaultKpisChange?.(kpisRes.config);
    }
    void loadTelemetry();
  }, [onLockSession, loadTelemetry, onHeroicBadgesChange, onInspectorDefaultKpisChange]);

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

  const handleToggleHeroicBadges = async () => {
    if (savingHeroicFlag) return;
    const prevVal = Boolean(showHeroicBadges);
    const nextVal = !prevVal;
    setSavingHeroicFlag(true);
    setFeedback(null);
    onHeroicBadgesChange?.(nextVal);
    const res = await updateAdminWebFeatureFlags({ showHeroicBadges: nextVal });
    setSavingHeroicFlag(false);
    if (res.unauthorized) {
      onHeroicBadgesChange?.(prevVal);
      onLockSession();
      return;
    }
    if (res.ok && res.flags) {
      onHeroicBadgesChange?.(Boolean(res.flags.showHeroicBadges));
      setFeedback({
        kind: 'success',
        text: res.flags.showHeroicBadges
          ? 'Insignias ⚡ Buzzer Beater y 🎯 Game Winner activadas en toda la web.'
          : 'Insignias ⚡ Buzzer Beater y 🎯 Game Winner desactivadas en la web pública.',
      });
    } else {
      onHeroicBadgesChange?.(prevVal);
      setFeedback({
        kind: 'error',
        text: res.error || 'No se pudo actualizar el estado de las insignias BB/GW.',
      });
    }
  };

  const activeDraftKpiKeys = kpiTab === 'player' ? draftPlayerKpiKeys : draftTeamKpiKeys;
  const setActiveDraftKpiKeys = (updater: (prev: string[]) => string[]) => {
    if (kpiTab === 'player') {
      setDraftPlayerKpiKeys(updater);
    } else {
      setDraftTeamKpiKeys(updater);
    }
    if (feedback) setFeedback(null);
  };

  const kpiLayerShortMap = useMemo(
    () =>
      Object.fromEntries(NBA_KPI_LAYERS.map((l) => [l.id, l.shortLabel])) as Record<
        NbaKpiLayerId,
        string
      >,
    []
  );

  const scopedAdminKpiCatalog = useMemo(
    () => NBA_ALL_KPIS_CATALOG.filter((k) => k.scope === 'both' || k.scope === kpiTab),
    [kpiTab]
  );

  const filteredAdminKpiCatalog = useMemo(() => {
    const q = kpiSearch.trim().toLowerCase();
    return scopedAdminKpiCatalog.filter((k) => {
      if (kpiLayerFilter !== 'all' && k.layer !== kpiLayerFilter) return false;
      if (!q) return true;
      const hay = `${k.label} ${k.shortLabel} ${k.keywords || ''} ${kpiLayerShortMap[k.layer]}`.toLowerCase();
      return hay.includes(q);
    });
  }, [scopedAdminKpiCatalog, kpiLayerFilter, kpiSearch, kpiLayerShortMap]);

  const kpisDirty = useMemo(() => {
    const sameList = (a: string[], b: string[]) =>
      a.length === b.length && a.every((v, idx) => v === b[idx]);
    return (
      !sameList(draftPlayerKpiKeys, savedKpisConfig.playerDefaultKpiKeys) ||
      !sameList(draftTeamKpiKeys, savedKpisConfig.teamDefaultKpiKeys)
    );
  }, [draftPlayerKpiKeys, draftTeamKpiKeys, savedKpisConfig]);

  const moveDraftKpi = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    setActiveDraftKpiKeys((prev) => {
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const toggleDraftKpi = (key: string) => {
    setActiveDraftKpiKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev;
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= 80) return prev;
      return [...prev, key];
    });
  };

  const handleSaveInspectorKpis = async () => {
    if (savingKpis || draftPlayerKpiKeys.length === 0 || draftTeamKpiKeys.length === 0) return;
    setSavingKpis(true);
    setFeedback(null);
    const res = await updateAdminInspectorKpiDefaults({
      playerDefaultKpiKeys: draftPlayerKpiKeys,
      teamDefaultKpiKeys: draftTeamKpiKeys,
    });
    setSavingKpis(false);
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      setSavedKpisConfig(res.config);
      setDraftPlayerKpiKeys([...res.config.playerDefaultKpiKeys]);
      setDraftTeamKpiKeys([...res.config.teamDefaultKpiKeys]);
      onInspectorDefaultKpisChange?.(res.config);
      setFeedback({
        kind: 'success',
        text: `KPIs por defecto y orden guardados (${res.config.playerDefaultKpiKeys.length} Jugador · ${res.config.teamDefaultKpiKeys.length} Equipo).`,
      });
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'No se pudieron guardar los KPIs por defecto.',
      });
    }
  };

  const handleResetInspectorKpis = async () => {
    if (savingKpis) return;
    setSavingKpis(true);
    setFeedback(null);
    const res = await resetAdminInspectorKpiDefaults();
    setSavingKpis(false);
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      setSavedKpisConfig(res.config);
      setDraftPlayerKpiKeys([...res.config.playerDefaultKpiKeys]);
      setDraftTeamKpiKeys([...res.config.teamDefaultKpiKeys]);
      onInspectorDefaultKpisChange?.(res.config);
      setFeedback({
        kind: 'success',
        text: 'Restaurados los 20 KPIs por defecto y orden recomendado para Jugador y Equipo.',
      });
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'No se pudieron restablecer los KPIs por defecto.',
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
              {/* Row 00: Web Config - Default Season, Sensitivity & Deltas */}
              <div className="p-4 sm:p-5 space-y-4 bg-[#0B1120]/40">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-orange-400 shrink-0" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-100 uppercase tracking-wider">
                      00. Configuración de la Web: Muestra de Años, Sensibilidad y Deltas
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-orange-400 font-medium">
                    Sincronizado en tiempo real
                  </span>
                </div>

                {/* Visual Style Switcher: Editorial Pro 2.0 vs Clásico v1 */}
                <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-100">
                          Estilo Visual de la Plataforma (Modo Dual)
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Alterna al instante entre el rediseño Editorial Deportivo 2.0 y el formato Clásico original v1 sin perder ninguna función.
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-amber-300 font-medium">
                      {themeStyle === 'v2_editorial' ? 'Pro 2.0 activo' : 'Clásico v1 activo'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setThemeStyle('v2_editorial')}
                      className={`text-left p-3 rounded-lg border transition-all flex flex-col justify-between gap-2.5 ${
                        themeStyle === 'v2_editorial'
                          ? 'bg-[#142138] border-amber-400/70 shadow-md ring-1 ring-amber-400/30'
                          : 'bg-[#131C2E]/60 hover:bg-[#131C2E] border-[#1E293B]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-100">
                          Modo Pro 2.0 — Editorial Deportivo Ilustrado
                        </span>
                        {themeStyle === 'v2_editorial' && (
                          <Check className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Lienzo medianoche profundo, tarjetas satinadas con relieve deportivo, tipografía Outfit y acentos vivos de cancha para un uso más atractivo y didáctico.
                      </p>
                      <div className="flex items-center gap-1.5 pt-0.5" aria-hidden="true">
                        <span className="w-4 h-4 rounded bg-[#070B14] border border-slate-700" title="Lienzo #070B14" />
                        <span className="w-4 h-4 rounded bg-[#0E1726] border border-slate-600" title="Tarjeta #0E1726" />
                        <span className="w-4 h-4 rounded bg-amber-400" title="Oro NBA" />
                        <span className="w-4 h-4 rounded bg-emerald-400" title="Esmeralda" />
                        <span className="w-4 h-4 rounded bg-sky-400" title="Cian táctico" />
                        <span className="w-4 h-4 rounded bg-rose-400" title="Rubí alerta" />
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setThemeStyle('classic')}
                      className={`text-left p-3 rounded-lg border transition-all flex flex-col justify-between gap-2.5 ${
                        themeStyle === 'classic'
                          ? 'bg-[#182338] border-orange-400/70 shadow-md ring-1 ring-orange-400/30'
                          : 'bg-[#131C2E]/60 hover:bg-[#131C2E] border-[#1E293B]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-100">
                          Modo Clásico — RadarNBA v1 Original
                        </span>
                        {themeStyle === 'classic' && (
                          <Check className="w-4 h-4 text-orange-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Preserva íntegramente la estética analítica original en tonos slate (#0B1120 / #131C2E) y tipografía estándar Plus Jakarta Sans.
                      </p>
                      <div className="flex items-center gap-1.5 pt-0.5" aria-hidden="true">
                        <span className="w-4 h-4 rounded bg-[#0B1120] border border-slate-700" title="Lienzo #0B1120" />
                        <span className="w-4 h-4 rounded bg-[#131C2E] border border-slate-600" title="Tarjeta #131C2E" />
                        <span className="w-4 h-4 rounded bg-[#1E293B]" title="Borde #1E293B" />
                        <span className="w-4 h-4 rounded bg-orange-500" title="Naranja clásico" />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Default Season Selector */}
                  <div className="space-y-2 bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5">
                    <label className="block text-xs font-semibold text-slate-200">
                      Muestra Temporal de Temporadas por Defecto
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Selecciona la temporada que se cargará por defecto al acceder a las secciones principales de la app.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {[
                        { id: '2027', label: '2026-27 (Actual)' },
                        { id: '2026', label: '2025-26' },
                        { id: '2025', label: '2024-25' },
                        { id: '2024', label: '2023-24' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onSeasonModeChange?.(opt.id as SeasonMode)}
                          className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border text-center ${
                            seasonMode === opt.id
                              ? 'bg-orange-500 text-slate-950 border-orange-400 shadow-md font-bold'
                              : 'bg-[#131C2E] hover:bg-[#182338] text-slate-300 border-[#1E293B]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Thresholds & Sensitivity Controls */}
                  {settings && onSettingsChange ? (
                    <div className="space-y-3 bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-200">
                          Sensibilidad y Deltas de Detección
                        </label>
                        <span className="text-[10px] font-mono text-slate-400">
                          Ventana: {settings.windowSize} PJ
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                        {/* Player Match Sample Window Slider Setting */}
                        <div className="space-y-1 col-span-2 sm:col-span-1">
                          <span className="block text-[11px] text-slate-400">
                            Muestra Ficha Jugador
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onSettingsChange((prev) => ({
                                  ...prev,
                                  defaultPlayerMatchWindow: Math.max(
                                    3,
                                    (prev.defaultPlayerMatchWindow || 18) - 1
                                  ),
                                }))
                              }
                              className="w-7 h-7 rounded bg-[#131C2E] text-slate-300 hover:text-white border border-[#1E293B] flex items-center justify-center text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="flex-1 text-center font-mono text-xs font-bold text-orange-400">
                              {settings.defaultPlayerMatchWindow || 18} PJ
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onSettingsChange((prev) => ({
                                  ...prev,
                                  defaultPlayerMatchWindow: Math.min(
                                    82,
                                    (prev.defaultPlayerMatchWindow || 18) + 1
                                  ),
                                }))
                              }
                              className="w-7 h-7 rounded bg-[#131C2E] text-slate-300 hover:text-white border border-[#1E293B] flex items-center justify-center text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Z-Score */}
                        <div className="space-y-1">
                          <span className="block text-[11px] text-slate-400">
                            Sensibilidad Z-Score
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onSettingsChange((prev) => ({
                                  ...prev,
                                  minZScore: Math.max(0.5, Math.round((prev.minZScore - 0.1) * 10) / 10),
                                }))
                              }
                              className="w-7 h-7 rounded bg-[#131C2E] text-slate-300 hover:text-white border border-[#1E293B] flex items-center justify-center text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="flex-1 text-center font-mono text-xs font-bold text-orange-400">
                              {settings.minZScore} σ
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onSettingsChange((prev) => ({
                                  ...prev,
                                  minZScore: Math.min(3.0, Math.round((prev.minZScore + 0.1) * 10) / 10),
                                }))
                              }
                              className="w-7 h-7 rounded bg-[#131C2E] text-slate-300 hover:text-white border border-[#1E293B] flex items-center justify-center text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Delta % */}
                        <div className="space-y-1">
                          <span className="block text-[11px] text-slate-400">
                            Delta Mínimo %
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onSettingsChange((prev) => ({
                                  ...prev,
                                  minPctDelta: Math.max(5, prev.minPctDelta - 1),
                                }))
                              }
                              className="w-7 h-7 rounded bg-[#131C2E] text-slate-300 hover:text-white border border-[#1E293B] flex items-center justify-center text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="flex-1 text-center font-mono text-xs font-bold text-orange-400">
                              {settings.minPctDelta}%
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onSettingsChange((prev) => ({
                                  ...prev,
                                  minPctDelta: Math.min(50, prev.minPctDelta + 1),
                                }))
                              }
                              className="w-7 h-7 rounded bg-[#131C2E] text-slate-300 hover:text-white border border-[#1E293B] flex items-center justify-center text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Min Minutes */}
                        <div className="space-y-1">
                          <span className="block text-[11px] text-slate-400">
                            Minutos Mínimos
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onSettingsChange((prev) => ({
                                  ...prev,
                                  minMinutes: Math.max(5, prev.minMinutes - 1),
                                }))
                              }
                              className="w-7 h-7 rounded bg-[#131C2E] text-slate-300 hover:text-white border border-[#1E293B] flex items-center justify-center text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="flex-1 text-center font-mono text-xs font-bold text-orange-400">
                              {settings.minMinutes} m
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onSettingsChange((prev) => ({
                                  ...prev,
                                  minMinutes: Math.min(35, prev.minMinutes + 1),
                                }))
                              }
                              className="w-7 h-7 rounded bg-[#131C2E] text-slate-300 hover:text-white border border-[#1E293B] flex items-center justify-center text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Public Feature Toggle: Buzzer Beater & Game Winner Badges */}
                <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      <span className="text-xs font-semibold text-slate-100">
                        Insignias de Buzzer Beater (⚡ BB) y Game Winner (🎯 GW)
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          showHeroicBadges
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {showHeroicBadges ? 'ACTIVADAS' : 'DESACTIVADAS'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Controla la visibilidad pública de las etiquetas ⚡ BB / 🎯 GW, columnas de clutch y paneles de tiros decisivos en Jugadores, Equipos y Fichas.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(showHeroicBadges)}
                    disabled={savingHeroicFlag}
                    onClick={() => void handleToggleHeroicBadges()}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold border inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                      showHeroicBadges
                        ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-500/40'
                        : 'bg-[#131C2E] hover:bg-[#182338] text-slate-200 border-[#283548]'
                    }`}
                  >
                    <span
                      className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center ${
                        showHeroicBadges ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
                    </span>
                    <span>
                      {savingHeroicFlag
                        ? 'Guardando...'
                        : showHeroicBadges
                        ? 'Desactivar insignias'
                        : 'Activar insignias'}
                    </span>
                  </button>
                </div>

                {/* Public Feature: Default Inspector KPIs & Order (Jugador / Equipo) */}
                <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Database className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                        <span className="text-xs font-semibold text-slate-100">
                          KPIs por Defecto y Orden (Fichas de Jugador y Equipo)
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/10 text-orange-300 border border-orange-500/30">
                          {draftPlayerKpiKeys.length} Jugador · {draftTeamKpiKeys.length} Equipo
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Configura qué KPIs salen seleccionados de serie en las fichas públicas y el orden exacto (#1, #2…) en que aparecen en la cuadrícula.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <div className="inline-flex items-center bg-[#131C2E] border border-[#1E293B] rounded-lg p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setKpiTab('player');
                            setKpiLayerFilter('all');
                            setKpiSearch('');
                          }}
                          className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                            kpiTab === 'player'
                              ? 'bg-orange-500 text-slate-950'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Jugador ({draftPlayerKpiKeys.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setKpiTab('team');
                            setKpiLayerFilter('all');
                            setKpiSearch('');
                          }}
                          className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                            kpiTab === 'team'
                              ? 'bg-orange-500 text-slate-950'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Equipo ({draftTeamKpiKeys.length})
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={savingKpis}
                        onClick={() => void handleResetInspectorKpis()}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] border border-[#1E293B] rounded-lg text-slate-300 hover:text-orange-300 transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restaurar 20 por defecto</span>
                      </button>

                      <button
                        type="button"
                        disabled={savingKpis || !kpisDirty}
                        onClick={() => void handleSaveInspectorKpis()}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap disabled:opacity-50 ${
                          kpisDirty
                            ? 'bg-orange-500 hover:bg-orange-400 text-slate-950 border-orange-500'
                            : 'bg-[#131C2E] text-slate-400 border-[#1E293B]'
                        }`}
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingKpis ? 'Guardando...' : 'Guardar KPIs y orden'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {/* Left: Ordered active KPIs list */}
                    <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-200">
                          Orden activo en {kpiTab === 'player' ? 'Ficha de Jugador' : 'Ficha de Equipo'} ({activeDraftKpiKeys.length})
                        </span>
                        <span className="text-slate-500">Usa ▲ / ▼ para reordenar</span>
                      </div>

                      <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
                        {activeDraftKpiKeys.map((key, idx) => {
                          const def = NBA_ALL_KPIS_MAP[key];
                          const label = def?.label || key;
                          const layerLabel = def ? kpiLayerShortMap[def.layer] : '';
                          return (
                            <div
                              key={key}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#0B1120] border border-[#1E293B] text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono tabular-nums text-[10px] font-bold text-orange-400 w-5 shrink-0">
                                  #{idx + 1}
                                </span>
                                <span className="truncate text-slate-200 font-medium" title={label}>
                                  {label}
                                </span>
                                {layerLabel && (
                                  <span className="text-[10px] text-slate-500 hidden sm:inline shrink-0">
                                    · {layerLabel.replace(/^\d+\.\s*/, '')}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => moveDraftKpi(idx, -1)}
                                  title="Subir posición"
                                  className="p-1 rounded bg-[#131C2E] border border-[#1E293B] text-slate-300 hover:text-white disabled:opacity-30"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === activeDraftKpiKeys.length - 1}
                                  onClick={() => moveDraftKpi(idx, 1)}
                                  title="Bajar posición"
                                  className="p-1 rounded bg-[#131C2E] border border-[#1E293B] text-slate-300 hover:text-white disabled:opacity-30"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={activeDraftKpiKeys.length <= 1}
                                  onClick={() => toggleDraftKpi(key)}
                                  title="Quitar de los KPIs por defecto"
                                  className="p-1 rounded bg-[#131C2E] border border-[#1E293B] text-slate-400 hover:text-rose-400 disabled:opacity-30"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right: Searchable 10-layer KPI catalog */}
                    <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3 space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={kpiSearch}
                          onChange={(e) => setKpiSearch(e.target.value)}
                          placeholder="Buscar KPI para añadir o quitar (eFG%, PACE, DRIVES, WIN%, CLUTCH...)"
                          className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                        />
                        {kpiSearch && (
                          <button
                            type="button"
                            onClick={() => setKpiSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setKpiLayerFilter('all')}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors whitespace-nowrap ${
                            kpiLayerFilter === 'all'
                              ? 'bg-orange-500 text-slate-950 border-orange-500'
                              : 'bg-[#0B1120] border-[#1E293B] text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Todas ({scopedAdminKpiCatalog.length})
                        </button>
                        {NBA_KPI_LAYERS.map((l) => {
                          const hasLayerItems = scopedAdminKpiCatalog.some((k) => k.layer === l.id);
                          if (!hasLayerItems) return null;
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => setKpiLayerFilter(l.id)}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors whitespace-nowrap ${
                                kpiLayerFilter === l.id
                                  ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                                  : 'bg-[#0B1120] border-[#1E293B] text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {l.shortLabel}
                            </button>
                          );
                        })}
                      </div>

                      <div className="max-h-44 overflow-y-auto pr-1 flex flex-wrap gap-1.5">
                        {filteredAdminKpiCatalog.map((def) => {
                          const selected = activeDraftKpiKeys.includes(def.key);
                          return (
                            <button
                              key={def.key}
                              type="button"
                              onClick={() => toggleDraftKpi(def.key)}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors whitespace-nowrap ${
                                selected
                                  ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                                  : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                              }`}
                            >
                              {selected ? (
                                <Check className="w-3 h-3 shrink-0" />
                              ) : (
                                <Plus className="w-3 h-3 shrink-0 text-slate-500" />
                              )}
                              <span>{def.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

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
