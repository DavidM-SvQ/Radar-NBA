import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Crown,
  Database,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  NbaPlayerDossierAdvancedResponse,
  NbaTeamDossierAdvancedResponse,
  PlayerGameLog,
  PlayerSummary,
  TeamSummary,
} from '../types/nba';
import {
  computeClientLeagueBenchmarks,
  getEntityScaleGp,
  getKpiMeta,
  getKpiNumericValue,
  NBA_ALL_KPIS_CATALOG,
  NBA_ALL_KPIS_MAP,
  NBA_KPI_LAYERS,
  resolveKpiGameSeries,
  type InspectorKpiContext,
  type InspectorNbaKpiDef,
  type InspectorStatScale,
  type NbaKpiLayerId,
} from '../utils/nbaInspectorAllKpis';
import { stdDev } from '../utils/analytics';
import { evaluateReferenceComparison } from '../utils/playerInspectorAnalytics';
import { MetricInfoTooltip } from './MetricUiHelpers';
import type { CareerHighKpiBadge } from './CareerHistoryPanel';
import { useExperienceMetrics } from '../context/ExperienceMetricsContext';

interface InspectorAllNbaKpisPanelProps {
  entityType: 'player' | 'team';
  statScale: InspectorStatScale;
  onChangeStatScale: (scale: InspectorStatScale) => void;
  player?: PlayerSummary;
  team?: TeamSummary;
  players?: PlayerSummary[];
  teams?: TeamSummary[];
  playerDossier?: NbaPlayerDossierAdvancedResponse | null;
  teamDossier?: NbaTeamDossierAdvancedResponse | null;
  loadingAdvanced?: boolean;
  activeKeys: string[];
  onChangeActiveKeys: (next: string[]) => void;
  defaultKeys: string[];
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  sectionId?: string;
  title?: string;
  subtitle?: string;
  headerExtra?: React.ReactNode;
  sampleGames?: PlayerGameLog[];
  referenceMode?: 'nba' | 'own';
  ownBaselineGames?: PlayerGameLog[];
  ownBaselineShortLabel?: string;
  careerHighKpis?: Record<string, CareerHighKpiBadge>;
  onOpenCareerTab?: () => void;
}

export function InspectorAllNbaKpisPanel({
  entityType,
  statScale,
  onChangeStatScale,
  player,
  team,
  players = [],
  teams = [],
  playerDossier,
  teamDossier,
  loadingAdvanced = false,
  activeKeys,
  onChangeActiveKeys,
  defaultKeys,
  externalOpen,
  onExternalOpenChange,
  sectionId,
  title,
  subtitle,
  headerExtra,
  sampleGames,
  referenceMode = 'nba',
  ownBaselineGames = [],
  ownBaselineShortLabel = 'Datos propios',
  careerHighKpis,
  onOpenCareerTab,
}: InspectorAllNbaKpisPanelProps) {
  const { isMetricAllowed } = useExperienceMetrics();
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<'all' | NbaKpiLayerId>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const activeCareerHighList = useMemo(
    () => Object.values(careerHighKpis || {}),
    [careerHighKpis]
  );

  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setIsOpen = (val: boolean) => {
    if (onExternalOpenChange) onExternalOpenChange(val);
    setInternalOpen(val);
  };

  useEffect(() => {
    setSelectedLayer('all');
    setSearchQuery('');
  }, [entityType, player?.id, team?.id]);

  const scopedCatalog = useMemo<InspectorNbaKpiDef[]>(
    () =>
      NBA_ALL_KPIS_CATALOG.filter(
        (k) => (k.scope === 'both' || k.scope === entityType) && isMetricAllowed(k.key)
      ),
    [entityType, isMetricAllowed]
  );

  const activeSet = useMemo(() => new Set(activeKeys), [activeKeys]);

  const activeDefs = useMemo<InspectorNbaKpiDef[]>(() => {
    const ordered: InspectorNbaKpiDef[] = [];
    const seen = new Set<string>();
    for (const key of activeKeys) {
      if (seen.has(key)) continue;
      const def = NBA_ALL_KPIS_MAP[key];
      if (
        def &&
        (def.scope === 'both' || def.scope === entityType) &&
        isMetricAllowed(def.key)
      ) {
        seen.add(key);
        ordered.push(def);
      }
    }
    if (ordered.length === 0 && scopedCatalog.length > 0) {
      return scopedCatalog.slice(0, 8);
    }
    return ordered;
  }, [activeKeys, entityType, isMetricAllowed, scopedCatalog]);

  const layerShortMap = useMemo(
    () =>
      Object.fromEntries(NBA_KPI_LAYERS.map((l) => [l.id, l.shortLabel])) as Record<
        NbaKpiLayerId,
        string
      >,
    []
  );

  // Detect if current activeKeys exactly matches all KPIs of a single layer
  const exactActiveLayerId = useMemo<NbaKpiLayerId | null>(() => {
    for (const l of NBA_KPI_LAYERS) {
      const layerKeys = scopedCatalog
        .filter((k) => k.layer === l.id)
        .map((k) => k.key);
      if (
        layerKeys.length > 0 &&
        activeKeys.length === layerKeys.length &&
        layerKeys.every((k) => activeSet.has(k))
      ) {
        return l.id;
      }
    }
    return null;
  }, [scopedCatalog, activeKeys.length, activeSet]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedCatalog.filter((k) => {
      if (selectedLayer !== 'all' && k.layer !== selectedLayer) return false;
      if (!q) return true;
      const hay = `${k.label} ${k.shortLabel} ${k.keywords || ''} ${layerShortMap[k.layer]}`.toLowerCase();
      return hay.includes(q);
    });
  }, [scopedCatalog, selectedLayer, searchQuery, layerShortMap]);

  const layerCounts = useMemo(() => {
    const counts: Record<string, { active: number; total: number }> = {
      all: { active: activeDefs.length, total: scopedCatalog.length },
    };
    for (const l of NBA_KPI_LAYERS) {
      const items = scopedCatalog.filter((k) => k.layer === l.id);
      counts[l.id] = {
        active: items.filter((k) => activeSet.has(k.key)).length,
        total: items.length,
      };
    }
    return counts;
  }, [scopedCatalog, activeDefs.length, activeSet]);

  const ctx: InspectorKpiContext = useMemo(
    () => ({
      entityType,
      statScale,
      player,
      team,
      playerDossier,
      teamDossier,
      sampleGames,
    }),
    [entityType, statScale, player, team, playerDossier, teamDossier, sampleGames]
  );

  const teamPercentileMap = useMemo(() => {
    const map: Record<string, { label: string; badgeClass: string }> = {};
    if (entityType !== 'team' || !team || teams.length < 10) return map;

    for (const def of activeDefs) {
      const val = getKpiNumericValue(def, ctx);
      if (val === null || !Number.isFinite(val)) continue;
      const meta = getKpiMeta(def, statScale);
      const allVals: number[] = [];
      for (const t of teams) {
        const v = getKpiNumericValue(def, {
          entityType: 'team',
          statScale,
          team: t,
        });
        if (v !== null && Number.isFinite(v)) allVals.push(v);
      }
      if (allVals.length < 10) continue;

      let lowerCount = 0;
      for (let i = 0; i < allVals.length; i++) {
        if (allVals[i] < val) lowerCount++;
      }
      let pct = Math.round((lowerCount / allVals.length) * 100);
      pct = Math.max(1, Math.min(99, pct));
      if (meta.lowerIsBetter) pct = 100 - pct;

      let label = `P${pct}`;
      let badgeClass = 'text-sky-300';
      if (pct >= 95) {
        label = 'Top 5%';
        badgeClass = 'text-emerald-300';
      } else if (pct >= 80) {
        label = `Top ${100 - pct}%`;
        badgeClass = 'text-emerald-400';
      } else if (pct >= 60) {
        label = `P${pct}`;
        badgeClass = 'text-sky-300';
      } else if (pct >= 40) {
        label = `P${pct}`;
        badgeClass = 'text-amber-300';
      } else if (pct >= 20) {
        label = `P${pct}`;
        badgeClass = 'text-orange-300';
      } else {
        label = `Inf ${pct}%`;
        badgeClass = 'text-rose-300';
      }
      map[def.key] = { label, badgeClass };
    }
    return map;
  }, [entityType, team, teams, activeDefs, ctx, statScale]);

  const dossierBenchmarks =
    entityType === 'player'
      ? playerDossier?.leagueBenchmarks
      : teamDossier?.leagueBenchmarks;

  const leagueBenchmarks = useMemo(
    () =>
      computeClientLeagueBenchmarks(
        entityType,
        players,
        teams,
        dossierBenchmarks
      ),
    [entityType, players, teams, dossierBenchmarks]
  );

  const selectExclusiveLayer = (layerId: NbaKpiLayerId) => {
    const layerKeys = scopedCatalog
      .filter((k) => k.layer === layerId)
      .map((k) => k.key);
    if (layerKeys.length === 0) return;
    setSelectedLayer(layerId);
    onChangeActiveKeys(layerKeys);
  };

  const toggleKpi = (key: string) => {
    if (activeSet.has(key)) {
      if (activeKeys.length <= 1) return;
      onChangeActiveKeys(activeKeys.filter((k) => k !== key));
    } else {
      onChangeActiveKeys([...activeKeys, key]);
    }
  };

  const addCurrentFilterLayer = () => {
    const targetKeys = filteredCatalog.map((k) => k.key);
    const merged = Array.from(new Set([...activeKeys, ...targetKeys]));
    onChangeActiveKeys(merged);
  };

  const removeCurrentLayer = () => {
    if (selectedLayer === 'all') {
      const firstDef = defaultKeys.slice(0, 6);
      onChangeActiveKeys(firstDef.length > 0 ? firstDef : [scopedCatalog[0].key]);
      return;
    }
    const toRemove = new Set(
      scopedCatalog.filter((k) => k.layer === selectedLayer).map((k) => k.key)
    );
    const next = activeKeys.filter((k) => !toRemove.has(k));
    if (next.length === 0) {
      const fallback = defaultKeys.find((k) => !toRemove.has(k)) || scopedCatalog[0].key;
      onChangeActiveKeys([fallback]);
      return;
    }
    onChangeActiveKeys(next);
  };

  const hasDossier =
    entityType === 'player' ? Boolean(playerDossier) : Boolean(teamDossier);

  return (
    <section id={sectionId} className="space-y-3">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-orange-400 shrink-0" />
              <span>
                {title || 'Todos los KPIs Oficiales NBA.com (10 Capas Personalizables)'}
              </span>
            </h3>
            {loadingAdvanced && !hasDossier && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-orange-500/10 border border-orange-500/30 rounded text-orange-300">
                Sincronizando NBA.com...
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {subtitle ||
              `Selecciona cualquier capa para mostrar sus estadísticas exclusivas, o personaliza entre los ${scopedCatalog.length} KPIs oficiales con media NBA y desviación.`}
          </p>
        </div>

        {headerExtra}

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Por Partido (Priorizado) | Totales */}
          <div className="inline-flex items-center bg-[#0B1120] border border-[#1E293B] rounded-lg p-1 text-[11px]">
            <button
              type="button"
              onClick={() => onChangeStatScale('per_game')}
              className={`min-h-[28px] px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                statScale === 'per_game'
                  ? 'bg-orange-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Por Partido
            </button>
            <button
              type="button"
              onClick={() => onChangeStatScale('totals')}
              className={`min-h-[28px] px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                statScale === 'totals'
                  ? 'bg-orange-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Totales
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
              isOpen
                ? 'bg-orange-500 text-slate-950 border-orange-500'
                : 'bg-orange-500/15 border-orange-500/40 text-orange-300 hover:bg-orange-500/25'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              Añadir / quitar KPIs ({activeDefs.length}/{scopedCatalog.length})
            </span>
          </button>
        </div>
      </div>

      {/* Always-Visible 10-Layer Exclusive Switcher Bar */}
      <div className="bg-[#0B1120]/70 border border-[#1E293B] rounded-lg p-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setSelectedLayer('all');
            onChangeActiveKeys([...defaultKeys]);
          }}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap ${
            exactActiveLayerId === null
              ? 'bg-orange-500/20 text-orange-300 border-orange-500/50 font-semibold'
              : 'bg-[#131C2E] border-[#1E293B] text-slate-300 hover:text-white'
          }`}
        >
          <RotateCcw className="w-3 h-3" />
          <span>Por defecto</span>
        </button>

        {NBA_KPI_LAYERS.map((layer) => {
          const lc = layerCounts[layer.id];
          if (!lc || lc.total === 0) return null;
          const isExact = exactActiveLayerId === layer.id;
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => selectExclusiveLayer(layer.id)}
              title={`Mostrar solo todas las estadísticas de ${layer.label} (${lc.total})`}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap ${
                isExact
                  ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold shadow-sm'
                  : 'bg-[#131C2E] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
              }`}
            >
              {layer.shortLabel}{' '}
              <span className={isExact ? 'text-slate-900/80' : 'text-slate-500'}>
                ({lc.total})
              </span>
            </button>
          );
        })}
      </div>

      {/* Expandable Individual KPI Selector Drawer */}
      {isOpen && (
        <div className="bg-[#131C2E] border border-[#283548] rounded-lg p-3.5 sm:p-4 space-y-3 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
              <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span>Personalizar KPIs individuales (10 capas NBA.com)</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addCurrentFilterLayer}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] rounded-md text-emerald-300 transition-colors whitespace-nowrap"
              >
                <Plus className="w-3 h-3" />
                <span>
                  {selectedLayer === 'all' && !searchQuery.trim()
                    ? 'Añadir todos'
                    : 'Añadir mostrados'}
                </span>
              </button>

              {selectedLayer !== 'all' && (
                <button
                  type="button"
                  onClick={removeCurrentLayer}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] rounded-md text-rose-300 transition-colors whitespace-nowrap"
                >
                  <X className="w-3 h-3" />
                  <span>Quitar capa</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onChangeActiveKeys([...defaultKeys])}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] rounded-md text-slate-300 hover:text-orange-300 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Por defecto</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white"
              >
                Cerrar
              </button>
            </div>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cualquier métrica NBA.com: pasos, aro, drives, catch & shoot, deflections, clutch, ppp, dfg%, on/off, dd2..."
              className="w-full h-9 pl-8 pr-8 text-xs bg-[#0B1120] border border-[#1E293B] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Layer Tabs inside personalizer (filters list without wiping mix) */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedLayer('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                selectedLayer === 'all'
                  ? 'bg-orange-500 text-slate-950 border-orange-500'
                  : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white'
              }`}
            >
              Todas ({layerCounts.all.active}/{layerCounts.all.total})
            </button>
            {NBA_KPI_LAYERS.map((layer) => {
              const lc = layerCounts[layer.id];
              if (!lc || lc.total === 0) return null;
              const isSelected = selectedLayer === layer.id;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setSelectedLayer(layer.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                      : lc.active > 0
                      ? 'bg-[#0B1120] border-orange-500/35 text-slate-200 hover:text-white'
                      : 'bg-[#0B1120] border-[#1E293B] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {layer.shortLabel}{' '}
                  <span className={isSelected ? 'text-slate-900' : 'text-slate-500'}>
                    ({lc.active}/{lc.total})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Clickable KPI chips */}
          <div className="max-h-72 overflow-y-auto pr-1 flex flex-wrap gap-1.5">
            {filteredCatalog.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                No se encontraron KPIs con "{searchQuery}".
              </p>
            ) : (
              filteredCatalog.map((def) => {
                const isSelected = activeSet.has(def.key);
                return (
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => toggleKpi(def.key)}
                    title={def.label}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                        : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 shrink-0" />}
                    <span>{def.label}</span>
                    {selectedLayer === 'all' && (
                      <span
                        className={`text-[10px] ${
                          isSelected ? 'text-slate-900/75' : 'text-slate-500'
                        }`}
                      >
                        · {layerShortMap[def.layer].replace(/^\d+\.\s*/, '')}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Active Career High / Franchise Record Pace Banner */}
      {activeCareerHighList.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/35 rounded-lg px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 whitespace-nowrap">
              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {entityType === 'player'
                  ? 'En ritmo de Career High (2026-27):'
                  : 'En ritmo de Récord Histórico (2026-27):'}
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {activeCareerHighList.map((ch) => (
                <span
                  key={ch.key}
                  title={ch.tooltip}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0B1120]/90 border border-amber-500/35 text-[11px] font-mono tabular-nums text-amber-200"
                >
                  <strong className="text-amber-300">{ch.shortLabel}</strong>
                  <span>{ch.currentFormatted}</span>
                </span>
              ))}
            </div>
          </div>
          {onOpenCareerTab && (
            <button
              type="button"
              onClick={onOpenCareerTab}
              className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2 whitespace-nowrap shrink-0"
            >
              {entityType === 'player' ? 'Ver Trayectoria & Highs →' : 'Ver Historia Franquicia →'}
            </button>
          )}
        </div>
      )}

      {/* Active KPIs Grid with NBA Mean + Deviation Bar (and Own Baseline or Team Percentile) on every card */}
      {entityType === 'player' && sampleGames && sampleGames.length === 0 ? (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-6 text-center text-xs text-slate-400">
          No hay partidos disputados dentro del filtro seleccionado. Prueba otro rango o ajusta el deslizador.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {activeDefs.map((def) => {
            const disp = def.getDisplay(ctx);
            const meta = getKpiMeta(def, statScale);
            const numericVal = getKpiNumericValue(def, ctx);
            const rawBench = leagueBenchmarks[def.key];

            let refModeForCard: 'nba' | 'own' = 'nba';
            let refLabel = 'Media NBA';
            let refMean = rawBench ? rawBench.mean : NaN;
            let refSd = rawBench ? rawBench.sd : NaN;
            let hasRefData = numericVal !== null && Boolean(rawBench);

            if (statScale === 'totals' && meta.scalable && rawBench) {
              const scaleGp = getEntityScaleGp(def, ctx);
              refMean = rawBench.mean * scaleGp;
              refSd = rawBench.sd * scaleGp;
            }

            if (entityType === 'player' && referenceMode === 'own') {
              const series = resolveKpiGameSeries(def.key, 'player');
              if (series?.playerSliceValue) {
                refModeForCard = 'own';
                refLabel = ownBaselineShortLabel;
                if (ownBaselineGames.length > 0) {
                  const rawOwnMean = series.playerSliceValue(ownBaselineGames);
                  const scaleMult =
                    statScale === 'totals' && meta.scalable
                      ? getEntityScaleGp(def, ctx)
                      : 1;
                  refMean = rawOwnMean * scaleMult;
                  const perGameArr =
                    series.playerGameValue && ownBaselineGames.length >= 2
                      ? ownBaselineGames.map((g) => series.playerGameValue!(g))
                      : [];
                  const ownSd = perGameArr.length >= 2 ? stdDev(perGameArr) : 0;
                  const fallbackSd = rawBench?.sd || Math.max(0.5, Math.abs(rawOwnMean) * 0.2);
                  refSd = Math.max(fallbackSd * 0.35, ownSd) * scaleMult;
                  hasRefData = numericVal !== null;
                } else {
                  refMean = NaN;
                  refSd = NaN;
                  hasRefData = false;
                }
              }
            }

            const ev = evaluateReferenceComparison(
              numericVal ?? 0,
              refMean,
              refSd,
              refModeForCard,
              {
                decimals: meta.decimals,
                suffix: meta.suffix,
                lowerIsBetter: meta.lowerIsBetter,
                signed: meta.signed,
                hasRefData,
              }
            );

            const pctBadge = entityType === 'team' ? teamPercentileMap[def.key] : undefined;
            const chBadge =
              statScale === 'per_game' || !meta.scalable
                ? careerHighKpis?.[def.key]
                : undefined;

            const valTone =
              disp.tone === 'positive'
                ? 'text-emerald-400'
                : disp.tone === 'negative'
                ? 'text-rose-400'
                : disp.tone === 'accent'
                ? 'text-orange-400'
                : 'text-slate-100';

            return (
              <div
                key={def.key}
                className={`p-3.5 border-b border-r border-[#1E293B] flex flex-col justify-between gap-2 transition-colors ${
                  chBadge
                    ? 'bg-amber-500/[0.06] ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/[0.11]'
                    : 'hover:bg-[#182338]/40'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 min-w-0">
                    <span className="truncate font-medium text-slate-300" title={def.label}>
                      {def.label}
                    </span>
                    <MetricInfoTooltip
                      helpKey={def.helpKey}
                      fallbackTitle={def.label}
                      align="left"
                      iconClassName="w-3 h-3"
                    />
                  </span>

                  <div className="inline-flex items-center gap-1.5 shrink-0">
                    {pctBadge && (
                      <span
                        className={`text-[10px] font-mono font-semibold whitespace-nowrap ${pctBadge.badgeClass}`}
                      >
                        {pctBadge.label}
                      </span>
                    )}
                    <span className={`text-sm font-bold font-mono tabular-nums ${valTone}`}>
                      {disp.text}
                    </span>
                    {activeDefs.length > 1 && (
                      <button
                        type="button"
                        title="Quitar este KPI"
                        onClick={() => toggleKpi(def.key)}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-0.5 shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {chBadge && (
                  <span
                    title={chBadge.tooltip}
                    className="inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-[10px] font-semibold text-amber-300 -mt-0.5"
                  >
                    <Crown className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                    <span>{chBadge.badgeText} 26-27</span>
                    <span className="text-amber-200/75 font-mono font-normal">
                      (ant. {chBadge.prevBestFormatted})
                    </span>
                  </span>
                )}

                {disp.subtext && (
                  <p className="text-[10px] text-slate-400 font-mono truncate -mt-1">
                    {disp.subtext}
                  </p>
                )}

                {/* Mean + Deviation Bar */}
                <div className="w-full pt-0.5">
                  <div className="flex items-center justify-between gap-2 text-[10.5px] mb-1 whitespace-nowrap">
                    <span className={`font-medium truncate ${ev.textClass}`}>
                      {ev.statusLabel}
                      {ev.hasRef ? ` (${ev.deltaFormatted})` : ''}
                    </span>
                    <span className="font-mono tabular-nums text-slate-400 shrink-0">
                      {ev.hasRef ? `${refLabel}: ${ev.refFormatted}` : ev.refFormatted}
                    </span>
                  </div>
                  <div className="relative h-1.5 bg-[#0B1120] border border-[#1E293B] rounded overflow-hidden">
                    <div
                      className={`h-full rounded-l transition-transform duration-150 ${ev.barClass}`}
                      style={{ width: `${ev.pct}%` }}
                    />
                    <div
                      title={`${refLabel}: ${ev.refFormatted}`}
                      className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-slate-100/80"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick shortcut footer */}
      {activeDefs.length === 0 && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-6 text-center text-xs text-slate-400">
          No hay KPIs seleccionados.{' '}
          <button
            type="button"
            onClick={() => onChangeActiveKeys([...defaultKeys])}
            className="text-orange-400 hover:underline font-semibold"
          >
            Restaurar KPIs por defecto
          </button>
        </div>
      )}
    </section>
  );
}
