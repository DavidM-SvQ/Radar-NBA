import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Minus,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  GamedayThresholdsConfig,
  GamedayThresholdsConfigValues,
} from '../types/nba';
import {
  DEFAULT_GAMEDAY_THRESHOLDS_VALUES,
  GAMEDAY_THRESHOLDS_BOUNDS,
  fetchAdminGamedayThresholds,
  resetAdminGamedayThresholdsDefaults,
  updateAdminGamedayThresholds,
} from '../utils/adminAuthClient';

interface AdminGamedayThresholdsPanelProps {
  onLockSession?: () => void;
}

type DraftValues = Record<keyof GamedayThresholdsConfigValues, string>;

function valuesToDraft(values: GamedayThresholdsConfigValues): DraftValues {
  const result: Partial<DraftValues> = {};
  for (const key of Object.keys(DEFAULT_GAMEDAY_THRESHOLDS_VALUES) as Array<
    keyof GamedayThresholdsConfigValues
  >) {
    result[key] = String(values[key] ?? DEFAULT_GAMEDAY_THRESHOLDS_VALUES[key]);
  }
  return result as DraftValues;
}

export function AdminGamedayThresholdsPanel({
  onLockSession,
}: AdminGamedayThresholdsPanelProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [activeGroup, setActiveGroup] = useState<'all' | '03A' | '03B'>('all');

  const [savedConfig, setSavedConfig] = useState<GamedayThresholdsConfig>({
    ...DEFAULT_GAMEDAY_THRESHOLDS_VALUES,
    updatedAt: 0,
  });
  const [defaults, setDefaults] = useState<GamedayThresholdsConfigValues>(
    DEFAULT_GAMEDAY_THRESHOLDS_VALUES
  );
  const [draft, setDraft] = useState<DraftValues>(() =>
    valuesToDraft(DEFAULT_GAMEDAY_THRESHOLDS_VALUES)
  );

  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    const res = await fetchAdminGamedayThresholds();
    setLoading(false);
    if (res.unauthorized && onLockSession) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      setSavedConfig(res.config);
      if (res.defaults) setDefaults(res.defaults);
      setDraft(valuesToDraft(res.config));
    } else if (res.error) {
      setFeedback({ kind: 'error', text: res.error });
    }
  }, [onLockSession]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Validation
  const fieldValidation = useMemo(() => {
    const errors: Partial<Record<keyof GamedayThresholdsConfigValues, string>> =
      {};
    const parsedValues: Partial<GamedayThresholdsConfigValues> = {};
    let hasErrors = false;

    for (const key of Object.keys(DEFAULT_GAMEDAY_THRESHOLDS_VALUES) as Array<
      keyof GamedayThresholdsConfigValues
    >) {
      const bound = GAMEDAY_THRESHOLDS_BOUNDS[key];
      const rawStr = draft[key]?.trim();
      const num = Number(rawStr);

      if (!rawStr || Number.isNaN(num)) {
        errors[key] = 'Debe ser un número válido.';
        hasErrors = true;
      } else if (num < bound.min || num > bound.max) {
        errors[key] = `Rango permitido: ${bound.min} a ${bound.max} ${bound.unit}.`;
        hasErrors = true;
      } else {
        parsedValues[key] = Math.round(num * 100) / 100;
      }
    }

    return { errors, parsedValues: parsedValues as GamedayThresholdsConfigValues, hasErrors };
  }, [draft]);

  const hasDirtyFields = useMemo(() => {
    for (const key of Object.keys(DEFAULT_GAMEDAY_THRESHOLDS_VALUES) as Array<
      keyof GamedayThresholdsConfigValues
    >) {
      const currentParsed = Number(draft[key]);
      const saved = savedConfig[key];
      if (Number.isNaN(currentParsed) || Math.abs(currentParsed - saved) > 0.001) {
        return true;
      }
    }
    return false;
  }, [draft, savedConfig]);

  const handleFieldChange = (
    key: keyof GamedayThresholdsConfigValues,
    value: string
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFeedback(null);
  };

  const handleStep = (
    key: keyof GamedayThresholdsConfigValues,
    delta: number
  ) => {
    const bound = GAMEDAY_THRESHOLDS_BOUNDS[key];
    const current = Number(draft[key]) || defaults[key];
    const nextVal = Math.min(
      bound.max,
      Math.max(bound.min, Math.round((current + delta) * 10) / 10)
    );
    handleFieldChange(key, String(nextVal));
  };

  const handleSave = async () => {
    if (fieldValidation.hasErrors) {
      setFeedback({
        kind: 'error',
        text: 'Corrige los valores fuera de rango antes de guardar.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    const res = await updateAdminGamedayThresholds(fieldValidation.parsedValues);
    setSaving(false);

    if (res.unauthorized && onLockSession) {
      onLockSession();
      return;
    }

    if (res.ok && res.config) {
      setSavedConfig(res.config);
      setDraft(valuesToDraft(res.config));
      setFeedback({
        kind: 'success',
        text: 'Criterios analíticos actualizados. Se aplicarán de inmediato en los cálculos de jornada.',
      });
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'Error al guardar los criterios en el servidor.',
      });
    }
  };

  const handleResetDefaults = async () => {
    setResetting(true);
    setFeedback(null);
    const res = await resetAdminGamedayThresholdsDefaults();
    setResetting(false);

    if (res.unauthorized && onLockSession) {
      onLockSession();
      return;
    }

    if (res.ok && res.config) {
      setSavedConfig(res.config);
      setDraft(valuesToDraft(res.config));
      setFeedback({
        kind: 'success',
        text: 'Criterios restablecidos a los valores base recomendados de RadarNBA.',
      });
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'Error al restaurar los criterios recomendados.',
      });
    }
  };

  const keys03A = (
    Object.keys(DEFAULT_GAMEDAY_THRESHOLDS_VALUES) as Array<
      keyof GamedayThresholdsConfigValues
    >
  ).filter((k) => GAMEDAY_THRESHOLDS_BOUNDS[k].group === '03A');

  const keys03B = (
    Object.keys(DEFAULT_GAMEDAY_THRESHOLDS_VALUES) as Array<
      keyof GamedayThresholdsConfigValues
    >
  ).filter((k) => GAMEDAY_THRESHOLDS_BOUNDS[k].group === '03B');

  const renderThresholdControl = (key: keyof GamedayThresholdsConfigValues) => {
    const bound = GAMEDAY_THRESHOLDS_BOUNDS[key];
    const error = fieldValidation.errors[key];
    const rawVal = draft[key] ?? '';
    const numVal = Number(rawVal);
    const isDefault =
      !Number.isNaN(numVal) && Math.abs(numVal - defaults[key]) < 0.001;
    const isDirty =
      !Number.isNaN(numVal) && Math.abs(numVal - savedConfig[key]) > 0.001;

    return (
      <div
        key={key}
        className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 space-y-2 hover:border-slate-700 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5 flex-wrap">
              <span>{bound.label}</span>
              {isDirty && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  Modificado
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              {bound.description}
            </p>
          </div>
          <span className="font-mono text-[11px] text-slate-400 shrink-0 tabular-nums">
            Base: {defaults[key]} {bound.unit}
          </span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleStep(key, -bound.step)}
            className="w-8 h-8 rounded-lg bg-[#131C2E] hover:bg-[#1E293B] text-slate-300 hover:text-white border border-[#1E293B] flex items-center justify-center transition-colors shrink-0 disabled:opacity-40"
            disabled={!Number.isNaN(numVal) && numVal <= bound.min}
            title="Reducir umbral"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <div className="relative flex-1">
            <input
              type="text"
              value={rawVal}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              className={`w-full px-3 py-1.5 bg-[#131C2E] border rounded-lg text-xs font-mono font-semibold text-slate-100 text-center focus:outline-none focus:ring-1 transition-all ${
                error
                  ? 'border-rose-500/80 focus:ring-rose-500 text-rose-300'
                  : isDirty
                  ? 'border-orange-500/80 focus:ring-orange-500'
                  : 'border-[#1E293B] focus:border-slate-600 focus:ring-slate-500'
              }`}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 pointer-events-none">
              {bound.unit}
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleStep(key, bound.step)}
            className="w-8 h-8 rounded-lg bg-[#131C2E] hover:bg-[#1E293B] text-slate-300 hover:text-white border border-[#1E293B] flex items-center justify-center transition-colors shrink-0 disabled:opacity-40"
            disabled={!Number.isNaN(numVal) && numVal >= bound.max}
            title="Aumentar umbral"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {!isDefault && (
            <button
              type="button"
              onClick={() => handleFieldChange(key, String(defaults[key]))}
              className="px-2 py-1.5 text-[10px] font-mono text-slate-400 hover:text-orange-300 hover:bg-[#131C2E] rounded border border-[#1E293B] transition-colors whitespace-nowrap shrink-0"
              title="Restablecer este campo al valor recomendado"
            >
              Restaurar
            </button>
          )}
        </div>

        {error && (
          <p className="text-[11px] font-mono text-rose-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl overflow-hidden shadow-xl">
      {/* Top Header Bar */}
      <div className="p-4 sm:px-5 sm:py-4 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">
              Criterios Analíticos de Detección: 03A Explosiones y 03B Batacazos
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Ajusta los umbrales mínimos, deltas estadísticos y filtros de titular para los 8 arquetipos positivos y 8 negativos.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={resetting || loading}
            onClick={() => void handleResetDefaults()}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] disabled:opacity-50 text-slate-300 hover:text-white border border-[#1E293B] rounded-lg transition-colors whitespace-nowrap"
            title="Volver a los valores analíticos por defecto"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 text-slate-400 ${
                resetting ? 'animate-spin' : ''
              }`}
            />
            <span>Valores recomendados</span>
          </button>

          <button
            type="button"
            disabled={saving || loading || !hasDirtyFields || fieldValidation.hasErrors}
            onClick={() => void handleSave()}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50 disabled:hover:bg-emerald-500 rounded-lg shadow-sm transition-colors whitespace-nowrap"
          >
            {saving ? (
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saving ? 'Guardando...' : 'Guardar criterios'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`px-4 py-2.5 text-xs flex items-center justify-between gap-2 border-b border-[#1E293B] ${
            feedback.kind === 'success'
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'bg-rose-500/10 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.kind === 'success' ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white text-xs font-mono"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Switcher by Section */}
      <div className="px-4 py-3 bg-[#0B1120]/40 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#0B1120] border border-[#1E293B] p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveGroup('all')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              activeGroup === 'all'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos los criterios (16)
          </button>
          <button
            type="button"
            onClick={() => setActiveGroup('03A')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 ${
              activeGroup === '03A'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-emerald-400'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            <span>03A. Explosiones (▲)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveGroup('03B')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 ${
              activeGroup === '03B'
                ? 'bg-rose-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-rose-400'
            }`}
          >
            <TrendingDown className="w-3 h-3" />
            <span>03B. Batacazos (▼)</span>
          </button>
        </div>

        <div className="text-xs text-slate-400 font-mono tabular-nums">
          {hasDirtyFields ? (
            <span className="text-orange-400 font-semibold">
              ● Tienes cambios pendientes de guardar
            </span>
          ) : (
            <span className="text-slate-400">
              Sincronizado con el motor analítico
            </span>
          )}
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 bg-[#0B1120] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="p-4 sm:p-5 space-y-6">
          {/* Section 03A: Explosiones */}
          {(activeGroup === 'all' || activeGroup === '03A') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-100 uppercase tracking-wider">
                    03A. Noches de Explosión vs Media 2026-27 (▲) — Los 8 Arquetipos
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-emerald-400">
                  8 etiquetas activas
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {keys03A.map(renderThresholdControl)}
              </div>
            </div>
          )}

          {/* Section 03B: Batacazos */}
          {(activeGroup === 'all' || activeGroup === '03B') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-100 uppercase tracking-wider">
                    03B. Batacazos de Titulares vs Media 2026-27 (▼) — Los 8 Arquetipos y Filtro de Titular
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-rose-400">
                  8 etiquetas activas
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {keys03B.map(renderThresholdControl)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
