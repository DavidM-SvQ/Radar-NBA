import React, { useMemo, useState } from 'react';
import { ChevronDown, Filter, RotateCcw } from 'lucide-react';
import type { PlayerSummary, TeamSummary } from '../types/nba';
import {
  DEFAULT_UNIFIED_FILTERS,
  FILTERABLE_METRIC_CATEGORIES,
  countActiveUnifiedFilters,
  extractUnifiedFilterOptions,
  getMetricPlaceholder,
  getMetricStep,
  getStatLayerCategoryLabel,
  updateUnifiedFiltersWithCascade,
  type UnifiedPositionFilter,
  type UnifiedTableFiltersState,
} from '../utils/entityFilters';
import type { NbaConferenceEs, NbaDivisionEs } from '../utils/teamLogos';

export interface UnifiedEntityFilterBarProps {
  filters: UnifiedTableFiltersState;
  onChange: (next: UnifiedTableFiltersState) => void;
  players?: PlayerSummary[];
  teams?: TeamSummary[];
  /** 'player' = all 6 filters active; 'team' = Conferencia/División/Equipo active, player-only filters disabled consistently; 'lineup' = Conferencia/División/Equipo + PJ + MIN activos; 'mixed' = all 6 active */
  entityScope?: 'player' | 'team' | 'lineup' | 'mixed';
  /** Optional counters shown in header strip */
  shownCount?: number;
  totalCount?: number;
  unitLabel?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export const UnifiedEntityFilterBar: React.FC<UnifiedEntityFilterBarProps> = ({
  filters,
  onChange,
  players = [],
  teams = [],
  entityScope = 'player',
  shownCount,
  totalCount,
  unitLabel = 'registros',
  defaultExpanded = false,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  const options = useMemo(
    () => extractUnifiedFilterOptions(players, teams, filters),
    [players, teams, filters]
  );

  const activeCount = useMemo(
    () => countActiveUnifiedFilters(filters, entityScope),
    [filters, entityScope]
  );

  const isTeamOnly = entityScope === 'team';
  const isPlayerOnlyDisabled = entityScope === 'team' || entityScope === 'lineup';

  const handleFieldChange = (
    key: keyof UnifiedTableFiltersState,
    value: string
  ) => {
    onChange(updateUnifiedFiltersWithCascade(filters, key, value));
  };

  const handleReset = () => {
    onChange({ ...DEFAULT_UNIFIED_FILTERS });
  };

  const baseSelectCls =
    'w-full h-9 bg-[#0B1120] border border-[#1E293B] hover:border-slate-700 focus:border-orange-500/70 focus:outline-none rounded-md px-2.5 text-xs text-slate-200 transition-colors truncate';

  const disabledSelectCls =
    'w-full h-9 bg-[#0B1120]/50 border border-[#1E293B]/60 rounded-md px-2.5 text-xs text-slate-500 opacity-50 cursor-not-allowed truncate';

  return (
    <div
      className={`bg-[#131C2E] border border-[#1E293B] rounded-lg px-3 py-2 sm:px-3.5 sm:py-2.5 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          title={
            isExpanded
              ? 'Plegar bloque de filtros de tabla'
              : 'Abrir bloque de filtros de tabla'
          }
          className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left group py-0.5 focus:outline-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Filter className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 group-hover:text-white transition-colors truncate">
              Bloque de filtros de tabla
            </span>
            {activeCount > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/30 text-[10px] font-mono font-semibold text-orange-300 shrink-0">
                {activeCount} {activeCount === 1 ? 'activo' : 'activos'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {typeof shownCount === 'number' && typeof totalCount === 'number' && (
              <span className="hidden sm:inline text-[11px] font-mono text-slate-400">
                Mostrando{' '}
                <strong className="text-slate-200">{shownCount}</strong>
                {' de '}
                <strong className="text-slate-300">{totalCount}</strong>{' '}
                {unitLabel}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 group-hover:text-orange-300 transition-colors">
              <span>{isExpanded ? 'Ocultar' : 'Abrir'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isExpanded ? 'rotate-180 text-orange-400' : ''
                }`}
              />
            </span>
          </div>
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0B1120] hover:bg-[#1E293B] border border-[#1E293B] text-[11px] font-medium text-slate-300 hover:text-orange-300 transition-colors shrink-0"
            title="Restablecer todos los filtros de tabla"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Limpiar</span>
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="mt-2.5 pt-2.5 border-t border-[#1E293B]/80 space-y-2.5">
          {typeof shownCount === 'number' && typeof totalCount === 'number' && (
            <div className="sm:hidden text-[11px] font-mono text-slate-400">
              Mostrando <strong className="text-slate-200">{shownCount}</strong> de{' '}
              <strong className="text-slate-300">{totalCount}</strong> {unitLabel}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* 1. Conferencia */}
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Conferencia
          </span>
          <select
            aria-label="Filtrar por conferencia"
            value={filters.conference}
            onChange={(e) =>
              handleFieldChange(
                'conference',
                e.target.value as 'all' | NbaConferenceEs
              )
            }
            className={baseSelectCls}
          >
            <option value="all">Todas (NBA)</option>
            {options.conferences.map((conf) => (
              <option key={conf} value={conf}>
                {conf}
              </option>
            ))}
          </select>
        </label>

        {/* 2. División */}
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            División
          </span>
          <select
            aria-label="Filtrar por división"
            value={filters.division}
            onChange={(e) =>
              handleFieldChange(
                'division',
                e.target.value as 'all' | NbaDivisionEs
              )
            }
            className={baseSelectCls}
          >
            <option value="all">Todas ({options.divisions.length})</option>
            {options.divisions.map((div) => (
              <option key={div} value={div}>
                {div}
              </option>
            ))}
          </select>
        </label>

        {/* 3. Equipo */}
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Equipo
          </span>
          <select
            aria-label="Filtrar por equipo"
            value={filters.team}
            onChange={(e) => handleFieldChange('team', e.target.value)}
            className={baseSelectCls}
          >
            <option value="all">Todos ({options.teams.length})</option>
            {options.teams.map((tm) => (
              <option key={tm.abbr} value={tm.abbr}>
                {tm.abbr} — {tm.name}
              </option>
            ))}
          </select>
        </label>

        {/* 4. País */}
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            País
          </span>
          <select
            aria-label="Filtrar por país"
            value={isPlayerOnlyDisabled ? 'all' : filters.country}
            disabled={isPlayerOnlyDisabled || options.countries.length === 0}
            onChange={(e) => handleFieldChange('country', e.target.value)}
            title={
              isPlayerOnlyDisabled
                ? 'Filtro exclusivo de jugadores'
                : 'Filtrar por país de origen'
            }
            className={
              isPlayerOnlyDisabled || options.countries.length === 0
                ? disabledSelectCls
                : baseSelectCls
            }
          >
            <option value="all">
              {isPlayerOnlyDisabled ? 'Solo jugadores' : `Todos (${options.countries.length})`}
            </option>
            {!isPlayerOnlyDisabled &&
              options.countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        </label>

        {/* 5. Año de nacimiento */}
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Año nac.
          </span>
          <select
            aria-label="Filtrar por año de nacimiento"
            value={isPlayerOnlyDisabled ? 'all' : filters.birthYear}
            disabled={isPlayerOnlyDisabled || options.birthYears.length === 0}
            onChange={(e) => handleFieldChange('birthYear', e.target.value)}
            title={
              isPlayerOnlyDisabled
                ? 'Filtro exclusivo de jugadores'
                : 'Filtrar por año de nacimiento'
            }
            className={
              isPlayerOnlyDisabled || options.birthYears.length === 0
                ? disabledSelectCls
                : baseSelectCls
            }
          >
            <option value="all">
              {isPlayerOnlyDisabled ? 'Solo jugadores' : 'Todos'}
            </option>
            {!isPlayerOnlyDisabled &&
              options.birthYears.map((yr) => (
                <option key={yr} value={String(yr)}>
                  {yr}
                </option>
              ))}
          </select>
        </label>

        {/* 6. Posición */}
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Posición
          </span>
          <select
            aria-label="Filtrar por posición"
            value={isPlayerOnlyDisabled ? 'all' : filters.position}
            disabled={isPlayerOnlyDisabled}
            onChange={(e) =>
              handleFieldChange(
                'position',
                e.target.value as UnifiedPositionFilter
              )
            }
            title={
              isPlayerOnlyDisabled
                ? 'Filtro exclusivo de jugadores'
                : 'Filtrar por posición principal'
            }
            className={isPlayerOnlyDisabled ? disabledSelectCls : baseSelectCls}
          >
            <option value="all">
              {isPlayerOnlyDisabled ? 'Solo jugadores' : 'Todas'}
            </option>
            {!isPlayerOnlyDisabled && (
              <>
                <option value="G">Base / Escolta (G)</option>
                <option value="F">Alero / Ala-Pívot (F)</option>
                <option value="C">Pívot (C)</option>
              </>
            )}
          </select>
        </label>
      </div>

      {/* Fila 2: Filtros de Volumen Libre (PJ, MIN) y Doble Filtro Estadístico Universal */}
      <div className="pt-2.5 border-t border-[#1E293B]/70 space-y-2.5">
        {/* Controles de Volumen Numérico Libre */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* PJ Mínimos Libre */}
          <label className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                Partidos Jugados (PJ mín.)
              </span>
              {filters.minGp !== '' && filters.minGp !== 'all' && Number(filters.minGp) > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, minGp: '' })}
                  className="text-[10px] text-orange-400 hover:text-orange-300 font-normal transition-colors"
                  title="Borrar umbral de partidos jugados"
                >
                  Quitar
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="82"
                placeholder="Ej. 15 (mínimo de PJ)"
                value={filters.minGp === 'all' ? '' : filters.minGp}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  onChange({
                    ...filters,
                    minGp: raw === '' ? '' : Math.max(0, parseInt(raw, 10) || 0),
                  });
                }}
                className={baseSelectCls}
              />
              {filters.minGp !== '' && filters.minGp !== 'all' && Number(filters.minGp) > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-orange-400 font-semibold pointer-events-none">
                  ≥ {filters.minGp} PJ
                </span>
              )}
            </div>
          </label>

          {/* Minutos por Partido Mínimos Libre */}
          <label className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                Minutos por Partido (MIN mín.)
              </span>
              {!isTeamOnly && filters.minMinutes !== '' && filters.minMinutes !== 'all' && Number(filters.minMinutes) > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, minMinutes: '' })}
                  className="text-[10px] text-orange-400 hover:text-orange-300 font-normal transition-colors"
                  title="Borrar umbral de minutos por partido"
                >
                  Quitar
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="48"
                step="0.5"
                disabled={isTeamOnly}
                placeholder={
                  isTeamOnly
                    ? 'Solo jugadores'
                    : entityScope === 'lineup'
                    ? 'Ej. 3.0 (mín. min/p)'
                    : 'Ej. 24.0 (mín. min/p)'
                }
                value={isTeamOnly ? '' : filters.minMinutes === 'all' ? '' : filters.minMinutes}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  onChange({
                    ...filters,
                    minMinutes: raw === '' ? '' : Math.max(0, parseFloat(raw) || 0),
                  });
                }}
                className={isTeamOnly ? disabledSelectCls : baseSelectCls}
                title={isTeamOnly ? 'Filtro exclusivo de jugadores' : 'Minutos medios disputados por partido'}
              />
              {!isTeamOnly && filters.minMinutes !== '' && filters.minMinutes !== 'all' && Number(filters.minMinutes) > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-orange-400 font-semibold pointer-events-none">
                  ≥ {filters.minMinutes} m/p
                </span>
              )}
            </div>
          </label>
        </div>

        {/* Doble Filtro Estadístico Universal (Filtro 1 y Filtro 2) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {/* Filtro Estadístico 1 */}
          <div className="flex flex-col gap-1 min-w-0 bg-[#0B1120]/60 border border-[#1E293B] rounded-lg p-2 sm:p-2.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                Filtro Estadístico 1
              </span>
              {filters.statFilter1 && filters.statFilter1.metric !== 'all' && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...filters,
                      statFilter1: { metric: 'all', operator: 'gte', value: '' },
                    })
                  }
                  className="text-[10px] text-orange-400 hover:text-orange-300 font-normal transition-colors"
                  title="Borrar Filtro Estadístico 1"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="grid grid-cols-12 gap-1.5">
              <select
                aria-label="Métrica para Filtro Estadístico 1"
                value={filters.statFilter1?.metric || 'all'}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    statFilter1: {
                      metric: e.target.value,
                      operator: filters.statFilter1?.operator || 'gte',
                      value: filters.statFilter1?.value ?? '',
                    },
                  })
                }
                className={`col-span-7 ${baseSelectCls}`}
              >
                <option value="all">Cualquier métrica (sin filtro)</option>
                {FILTERABLE_METRIC_CATEGORIES.map((cat) => {
                  const available = cat.metrics.filter((m) => !isPlayerOnlyDisabled || m.scope !== 'player');
                  if (available.length === 0) return null;
                  return (
                    <optgroup key={cat.id} label={getStatLayerCategoryLabel(cat.id, entityScope)} className="bg-[#0B1120] text-orange-400 font-semibold">
                      {available.map((m) => (
                        <option key={m.id} value={m.id} className="bg-[#0B1120] text-slate-200 font-normal">
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>

              <select
                aria-label="Operador de comparación Filtro 1"
                value={filters.statFilter1?.operator || 'gte'}
                disabled={!filters.statFilter1 || filters.statFilter1.metric === 'all'}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    statFilter1: {
                      ...(filters.statFilter1 || { metric: 'all', value: '' }),
                      operator: e.target.value as 'gte' | 'lte',
                    },
                  })
                }
                className={`col-span-2 ${
                  !filters.statFilter1 || filters.statFilter1.metric === 'all'
                    ? disabledSelectCls
                    : baseSelectCls
                } text-center font-mono font-bold`}
              >
                <option value="gte">≥</option>
                <option value="lte">≤</option>
              </select>

              <input
                type="number"
                step={getMetricStep(filters.statFilter1?.metric)}
                placeholder={getMetricPlaceholder(filters.statFilter1?.metric)}
                disabled={!filters.statFilter1 || filters.statFilter1.metric === 'all'}
                value={filters.statFilter1?.value ?? ''}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    statFilter1: {
                      ...(filters.statFilter1 || { metric: 'all', operator: 'gte' }),
                      value: e.target.value === '' ? '' : Number(e.target.value),
                    },
                  })
                }
                className={`col-span-3 h-9 bg-[#0B1120] border ${
                  !filters.statFilter1 || filters.statFilter1.metric === 'all'
                    ? 'border-[#1E293B]/60 text-slate-600 opacity-50 cursor-not-allowed'
                    : 'border-[#1E293B] text-slate-200 focus:border-orange-500/70'
                } rounded-md px-2.5 text-xs focus:outline-none transition-colors font-mono`}
              />
            </div>
          </div>

          {/* Filtro Estadístico 2 */}
          <div className="flex flex-col gap-1 min-w-0 bg-[#0B1120]/60 border border-[#1E293B] rounded-lg p-2 sm:p-2.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                Filtro Estadístico 2
              </span>
              {filters.statFilter2 && filters.statFilter2.metric !== 'all' && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...filters,
                      statFilter2: { metric: 'all', operator: 'gte', value: '' },
                    })
                  }
                  className="text-[10px] text-orange-400 hover:text-orange-300 font-normal transition-colors"
                  title="Borrar Filtro Estadístico 2"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="grid grid-cols-12 gap-1.5">
              <select
                aria-label="Métrica para Filtro Estadístico 2"
                value={filters.statFilter2?.metric || 'all'}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    statFilter2: {
                      metric: e.target.value,
                      operator: filters.statFilter2?.operator || 'gte',
                      value: filters.statFilter2?.value ?? '',
                    },
                  })
                }
                className={`col-span-7 ${baseSelectCls}`}
              >
                <option value="all">Cualquier métrica (sin filtro)</option>
                {FILTERABLE_METRIC_CATEGORIES.map((cat) => {
                  const available = cat.metrics.filter((m) => !isPlayerOnlyDisabled || m.scope !== 'player');
                  if (available.length === 0) return null;
                  return (
                    <optgroup key={cat.id} label={getStatLayerCategoryLabel(cat.id, entityScope)} className="bg-[#0B1120] text-blue-400 font-semibold">
                      {available.map((m) => (
                        <option key={m.id} value={m.id} className="bg-[#0B1120] text-slate-200 font-normal">
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>

              <select
                aria-label="Operador de comparación Filtro 2"
                value={filters.statFilter2?.operator || 'gte'}
                disabled={!filters.statFilter2 || filters.statFilter2.metric === 'all'}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    statFilter2: {
                      ...(filters.statFilter2 || { metric: 'all', value: '' }),
                      operator: e.target.value as 'gte' | 'lte',
                    },
                  })
                }
                className={`col-span-2 ${
                  !filters.statFilter2 || filters.statFilter2.metric === 'all'
                    ? disabledSelectCls
                    : baseSelectCls
                } text-center font-mono font-bold`}
              >
                <option value="gte">≥</option>
                <option value="lte">≤</option>
              </select>

              <input
                type="number"
                step={getMetricStep(filters.statFilter2?.metric)}
                placeholder={getMetricPlaceholder(filters.statFilter2?.metric)}
                disabled={!filters.statFilter2 || filters.statFilter2.metric === 'all'}
                value={filters.statFilter2?.value ?? ''}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    statFilter2: {
                      ...(filters.statFilter2 || { metric: 'all', operator: 'gte' }),
                      value: e.target.value === '' ? '' : Number(e.target.value),
                    },
                  })
                }
                className={`col-span-3 h-9 bg-[#0B1120] border ${
                  !filters.statFilter2 || filters.statFilter2.metric === 'all'
                    ? 'border-[#1E293B]/60 text-slate-600 opacity-50 cursor-not-allowed'
                    : 'border-[#1E293B] text-slate-200 focus:border-orange-500/70'
                } rounded-md px-2.5 text-xs focus:outline-none transition-colors font-mono`}
              />
            </div>
          </div>
        </div>
      </div>
        </div>
      )}
    </div>
  );
};
