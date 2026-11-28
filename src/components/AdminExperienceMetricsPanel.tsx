import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Layers,
  Loader2,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Users,
  Shield,
} from 'lucide-react';
import type {
  ExperienceMetricCategoryId,
  ExperienceMetricsConfig,
} from '../types/nba';
import {
  DEFAULT_SIMPLE_METRIC_IDS,
  EXPERIENCE_METRICS_CATALOG,
  EXPERIENCE_METRIC_CATEGORIES,
} from '../utils/experienceMetricsCatalog';
import {
  fetchAdminExperienceMetricsConfig,
  resetAdminExperienceMetricsConfigDefaults,
  updateAdminExperienceMetricsConfig,
} from '../utils/adminAuthClient';

interface AdminExperienceMetricsPanelProps {
  currentConfig: ExperienceMetricsConfig;
  onConfigSaved: (saved: ExperienceMetricsConfig) => void;
  onLockSession: () => void;
}

export const AdminExperienceMetricsPanel: React.FC<
  AdminExperienceMetricsPanelProps
> = ({ currentConfig, onConfigSaved, onLockSession }) => {
  const [savedIds, setSavedIds] = useState<string[]>(() => [
    ...currentConfig.simpleMetricIds,
  ]);
  const [draftIds, setDraftIds] = useState<string[]>(() => [
    ...currentConfig.simpleMetricIds,
  ]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | ExperienceMetricCategoryId
  >('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'simple' | 'advanced'>(
    'all'
  );
  const [scopeFilter, setScopeFilter] = useState<'all' | 'player' | 'team' | 'both'>(
    'all'
  );
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const onConfigSavedRef = useRef(onConfigSaved);
  const onLockSessionRef = useRef(onLockSession);
  onConfigSavedRef.current = onConfigSaved;
  onLockSessionRef.current = onLockSession;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminExperienceMetricsConfig()
      .then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (res.unauthorized) {
          onLockSessionRef.current();
          return;
        }
        if (res.ok && res.config) {
          setSavedIds([...res.config.simpleMetricIds]);
          setDraftIds([...res.config.simpleMetricIds]);
          onConfigSavedRef.current(res.config);
        } else if (res.error) {
          setFeedback({ kind: 'error', text: res.error });
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);

  const isDirty = useMemo(() => {
    if (draftSet.size !== savedSet.size) return true;
    for (const id of draftSet) {
      if (!savedSet.has(id)) return true;
    }
    return false;
  }, [draftSet, savedSet]);

  const diffCounts = useMemo(() => {
    let addedToSimple = 0;
    let movedToAdvanced = 0;
    for (const id of draftSet) {
      if (!savedSet.has(id)) addedToSimple++;
    }
    for (const id of savedSet) {
      if (!draftSet.has(id)) movedToAdvanced++;
    }
    return { addedToSimple, movedToAdvanced, total: addedToSimple + movedToAdvanced };
  }, [draftSet, savedSet]);

  const setMetricMode = (metricId: string, target: 'simple' | 'advanced') => {
    setFeedback(null);
    setDraftIds((prev) => {
      const has = prev.includes(metricId);
      if (target === 'simple') {
        return has ? prev : [...prev, metricId];
      }
      // Keep at least 1 metric in Modo Sencillo
      if (has && prev.length <= 1) return prev;
      return prev.filter((id) => id !== metricId);
    });
  };

  const setCategoryMode = (
    catId: ExperienceMetricCategoryId,
    target: 'simple' | 'advanced'
  ) => {
    setFeedback(null);
    const catMetricIds = EXPERIENCE_METRICS_CATALOG.filter(
      (m) => m.category === catId
    ).map((m) => m.id);
    const catSet = new Set(catMetricIds);

    setDraftIds((prev) => {
      if (target === 'simple') {
        const merged = new Set(prev);
        for (const id of catMetricIds) merged.add(id);
        return Array.from(merged);
      }
      const next = prev.filter((id) => !catSet.has(id));
      return next.length > 0 ? next : [DEFAULT_SIMPLE_METRIC_IDS[0] || 'points'];
    });
  };

  const handleSave = async () => {
    if (saving || draftIds.length === 0) return;
    setSaving(true);
    setFeedback(null);
    const res = await updateAdminExperienceMetricsConfig({
      simpleMetricIds: draftIds,
    });
    setSaving(false);
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      setSavedIds([...res.config.simpleMetricIds]);
      setDraftIds([...res.config.simpleMetricIds]);
      onConfigSaved(res.config);
      setFeedback({
        kind: 'success',
        text: `Organización guardada y aplicada en toda la web: ${res.config.simpleMetricIds.length} estadísticas en Modo Sencillo y ${
          EXPERIENCE_METRICS_CATALOG.length - res.config.simpleMetricIds.length
        } exclusivas de Modo Avanzado.`,
      });
    } else {
      setFeedback({
        kind: 'error',
        text:
          res.error ||
          'No se pudo guardar la distribución de estadísticas Sencillo / Avanzado.',
      });
    }
  };

  const handleResetDefaults = async () => {
    if (resetting) return;
    setResetting(true);
    setFeedback(null);
    const res = await resetAdminExperienceMetricsConfigDefaults();
    setResetting(false);
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      setSavedIds([...res.config.simpleMetricIds]);
      setDraftIds([...res.config.simpleMetricIds]);
      onConfigSaved(res.config);
      setFeedback({
        kind: 'success',
        text: `Distribución restablecida a valores recomendados (${res.config.simpleMetricIds.length} básicas en Sencillo).`,
      });
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'No se pudo restablecer la configuración por defecto.',
      });
    }
  };

  const handleDiscard = () => {
    setDraftIds([...savedIds]);
    setFeedback(null);
  };

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return EXPERIENCE_METRICS_CATALOG.filter((m) => {
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (scopeFilter !== 'all' && m.entityScope !== scopeFilter) return false;
      const inSimple = draftSet.has(m.id);
      if (modeFilter === 'simple' && !inSimple) return false;
      if (modeFilter === 'advanced' && inSimple) return false;
      if (!q) return true;
      const hay = `${m.label} ${m.shortLabel} ${m.description} ${m.id} ${m.aliases.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [search, categoryFilter, scopeFilter, modeFilter, draftSet]);

  const groupedVisible = useMemo(() => {
    const map = new Map<
      ExperienceMetricCategoryId,
      typeof EXPERIENCE_METRICS_CATALOG
    >();
    for (const m of filteredCatalog) {
      const list = map.get(m.category);
      if (list) list.push(m);
      else map.set(m.category, [m]);
    }
    return EXPERIENCE_METRIC_CATEGORIES.filter((c) => map.has(c.id)).map((c) => ({
      meta: c,
      items: map.get(c.id)!,
    }));
  }, [filteredCatalog]);

  const simpleCount = draftSet.size;
  const advancedOnlyCount = EXPERIENCE_METRICS_CATALOG.length - simpleCount;

  return (
    <div className="space-y-4">
      {/* Header + Primary Action Bar */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1E293B]">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Layers className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm sm:text-base font-bold text-slate-100">
                Organizador de Estadísticas: Modo Sencillo vs Modo Avanzado
              </h2>
              {isDirty && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {diffCounts.total}{' '}
                  {diffCounts.total === 1 ? 'cambio pendiente' : 'cambios pendientes'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Define exactamente qué estadísticas forman parte del{' '}
              <strong className="text-emerald-300">Modo Sencillo</strong>. Cuando un
              usuario selecciona Sencillo, el resto de métricas desaparecen por
              completo de Rachas, Radar de Anomalías, Hitos de Temporada, Resumen del
              Día, Comparadores, Gráficos y Filtros. En{' '}
              <strong className="text-sky-300">Modo Avanzado</strong> se muestran
              siempre todas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isDirty && (
              <button
                type="button"
                disabled={saving}
                onClick={handleDiscard}
                className="min-h-[38px] px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] text-slate-300 border border-[#1E293B] rounded-lg transition-colors whitespace-nowrap"
              >
                Descartar
              </button>
            )}
            <button
              type="button"
              disabled={saving || resetting}
              onClick={() => void handleResetDefaults()}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-[#182338] text-slate-300 hover:text-orange-300 border border-[#1E293B] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{resetting ? 'Restaurando...' : 'Restaurar básicas'}</span>
            </button>
            <button
              type="button"
              disabled={saving || !isDirty}
              onClick={() => void handleSave()}
              className={`min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap disabled:opacity-45 ${
                isDirty
                  ? 'bg-orange-500 hover:bg-orange-400 text-slate-950 shadow-sm'
                  : 'bg-[#1E293B] text-slate-400'
              }`}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{saving ? 'Guardando...' : 'Guardar y aplicar'}</span>
            </button>
          </div>
        </div>

        {/* Summary Counters Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#1E293B] bg-[#0B1120]/50">
          <div className="p-3.5 sm:px-5">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">
              Catálogo total gestionado
            </p>
            <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-slate-100">
              {EXPERIENCE_METRICS_CATALOG.length}{' '}
              <span className="text-xs font-sans font-normal text-slate-400">
                estadísticas
              </span>
            </p>
          </div>
          <div className="p-3.5 sm:px-5">
            <p className="text-[11px] uppercase tracking-wider text-emerald-400/90">
              Visibles en Modo Sencillo
            </p>
            <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-emerald-400">
              {simpleCount}{' '}
              <span className="text-xs font-sans font-normal text-slate-400">
                estadísticas básicas activas
              </span>
            </p>
          </div>
          <div className="p-3.5 sm:px-5">
            <p className="text-[11px] uppercase tracking-wider text-sky-400/90">
              Exclusivas de Modo Avanzado
            </p>
            <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-sky-400">
              {advancedOnlyCount}{' '}
              <span className="text-xs font-sans font-normal text-slate-400">
                ocultas en Sencillo
              </span>
            </p>
          </div>
        </div>

        {/* Inline Feedback Banner */}
        {feedback && (
          <div
            className={`px-4 py-3 text-xs font-medium flex items-center gap-2 border-t ${
              feedback.kind === 'success'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
            }`}
          >
            {feedback.kind === 'success' ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Filters Row */}
        <div className="p-3.5 sm:px-5 border-t border-[#1E293B] flex flex-wrap items-center gap-2.5 bg-[#0B1120]/30">
          <div className="relative flex-1 min-w-[210px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar estadística (ej. TS%, Doble-Doble, Pace, Robos...)"
              className="w-full h-9 pl-8 pr-3 bg-[#0B1120] border border-[#1E293B] focus:border-orange-500/70 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(
                e.target.value as 'all' | ExperienceMetricCategoryId
              )
            }
            className="h-9 px-2.5 bg-[#0B1120] border border-[#1E293B] focus:border-orange-500/70 rounded-lg text-xs text-slate-200 focus:outline-none"
          >
            <option value="all">Todas las familias ({EXPERIENCE_METRIC_CATEGORIES.length})</option>
            {EXPERIENCE_METRIC_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs">
            {(
              [
                { id: 'all', label: 'Todas' },
                { id: 'simple', label: `Sencillo (${simpleCount})` },
                { id: 'advanced', label: `Solo Avanzado (${advancedOnlyCount})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setModeFilter(opt.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                  modeFilter === opt.id
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs">
            {(
              [
                { id: 'all', label: 'Todo ámbito' },
                { id: 'player', label: 'Jugador' },
                { id: 'team', label: 'Equipo' },
                { id: 'both', label: 'Ambos' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScopeFilter(opt.id)}
                className={`px-2 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                  scopeFilter === opt.id
                    ? 'bg-[#1E293B] text-orange-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Grouped Catalog */}
      {loading ? (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
          <span>Cargando catálogo completo de estadísticas...</span>
        </div>
      ) : groupedVisible.length === 0 ? (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-8 text-center text-xs text-slate-400">
          No hay estadísticas que coincidan con el filtro de búsqueda actual.
        </div>
      ) : (
        <div className="space-y-4">
          {groupedVisible.map(({ meta, items }) => {
            const catSimpleCount = items.filter((m) => draftSet.has(m.id)).length;
            return (
              <section
                key={meta.id}
                className="bg-[#131C2E] border border-[#1E293B] rounded-xl overflow-hidden"
              >
                <div className="px-4 py-3 bg-[#0B1120]/60 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-100">
                        {meta.label}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#131C2E] text-slate-300 border border-[#1E293B]">
                        {catSimpleCount}/{items.length} en Sencillo
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {meta.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCategoryMode(meta.id, 'simple')}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors whitespace-nowrap"
                    >
                      Todas a Sencillo
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryMode(meta.id, 'advanced')}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 transition-colors whitespace-nowrap"
                    >
                      Todas a Avanzado
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-[#1E293B]">
                  {items.map((m) => {
                    const isSimple = draftSet.has(m.id);
                    const wasSimple = savedSet.has(m.id);
                    const changed = isSimple !== wasSimple;
                    return (
                      <div
                        key={m.id}
                        className={`px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                          changed ? 'bg-amber-500/[0.04]' : 'hover:bg-[#182338]/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#0B1120] text-orange-300 border border-[#1E293B] shrink-0">
                              {m.shortLabel}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold text-slate-100">
                              {m.label}
                            </span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0B1120] text-slate-400 border border-[#1E293B]">
                              {m.entityScope === 'player' ? (
                                <>
                                  <Users className="w-2.5 h-2.5" />
                                  Jugador
                                </>
                              ) : m.entityScope === 'team' ? (
                                <>
                                  <Shield className="w-2.5 h-2.5" />
                                  Equipo
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-2.5 h-2.5" />
                                  Jugador y Equipo
                                </>
                              )}
                            </span>
                            {changed && (
                              <span className="text-[10px] font-mono font-semibold text-amber-300">
                                · modificado
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {m.description}
                          </p>
                        </div>

                        <div className="inline-flex items-center p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg shrink-0 self-start sm:self-center">
                          <button
                            type="button"
                            onClick={() => setMetricMode(m.id, 'simple')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                              isSimple
                                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Sencillo
                          </button>
                          <button
                            type="button"
                            onClick={() => setMetricMode(m.id, 'advanced')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                              !isSimple
                                ? 'bg-sky-500 text-slate-950 shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Solo Avanzado
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Bottom Sticky Save Reminder Bar when dirty */}
      {isDirty && (
        <div className="sticky bottom-3 z-20 bg-[#0D1526]/95 backdrop-blur-md border border-orange-500/50 rounded-xl p-3.5 shadow-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-200">
            Tienes <strong className="text-orange-400">{diffCounts.total}</strong>{' '}
            {diffCounts.total === 1 ? 'cambio pendiente' : 'cambios pendientes'} en la
            distribución de estadísticas ({simpleCount} en Sencillo ·{' '}
            {advancedOnlyCount} solo en Avanzado).
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleDiscard}
              className="px-3 py-1.5 text-xs font-medium bg-[#131C2E] hover:bg-[#182338] text-slate-300 border border-[#1E293B] rounded-lg transition-colors"
            >
              Descartar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors shadow-sm"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{saving ? 'Guardando...' : 'Guardar y aplicar cambios'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminExperienceMetricsPanel;
