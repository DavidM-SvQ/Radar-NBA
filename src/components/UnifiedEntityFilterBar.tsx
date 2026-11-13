import React, { useMemo, useState } from 'react';
import { ChevronDown, Filter, RotateCcw } from 'lucide-react';
import type { PlayerSummary, TeamSummary } from '../types/nba';
import {
  DEFAULT_UNIFIED_FILTERS,
  countActiveUnifiedFilters,
  extractUnifiedFilterOptions,
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
  /** 'player' = all 6 filters active; 'team' = Conferencia/División/Equipo active, player-only filters disabled consistently; 'mixed' = all 6 active */
  entityScope?: 'player' | 'team' | 'mixed';
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
            title="Restablecer los 6 filtros de tabla"
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
            value={isTeamOnly ? 'all' : filters.country}
            disabled={isTeamOnly || options.countries.length === 0}
            onChange={(e) => handleFieldChange('country', e.target.value)}
            title={
              isTeamOnly
                ? 'Filtro exclusivo de jugadores'
                : 'Filtrar por país de origen'
            }
            className={
              isTeamOnly || options.countries.length === 0
                ? disabledSelectCls
                : baseSelectCls
            }
          >
            <option value="all">
              {isTeamOnly ? 'Solo jugadores' : `Todos (${options.countries.length})`}
            </option>
            {!isTeamOnly &&
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
            value={isTeamOnly ? 'all' : filters.birthYear}
            disabled={isTeamOnly || options.birthYears.length === 0}
            onChange={(e) => handleFieldChange('birthYear', e.target.value)}
            title={
              isTeamOnly
                ? 'Filtro exclusivo de jugadores'
                : 'Filtrar por año de nacimiento'
            }
            className={
              isTeamOnly || options.birthYears.length === 0
                ? disabledSelectCls
                : baseSelectCls
            }
          >
            <option value="all">
              {isTeamOnly ? 'Solo jugadores' : 'Todos'}
            </option>
            {!isTeamOnly &&
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
            value={isTeamOnly ? 'all' : filters.position}
            disabled={isTeamOnly}
            onChange={(e) =>
              handleFieldChange(
                'position',
                e.target.value as UnifiedPositionFilter
              )
            }
            title={
              isTeamOnly
                ? 'Filtro exclusivo de jugadores'
                : 'Filtrar por posición principal'
            }
            className={isTeamOnly ? disabledSelectCls : baseSelectCls}
          >
            <option value="all">
              {isTeamOnly ? 'Solo jugadores' : 'Todas'}
            </option>
            {!isTeamOnly && (
              <>
                <option value="G">Base / Escolta (G)</option>
                <option value="F">Alero / Ala-Pívot (F)</option>
                <option value="C">Pívot (C)</option>
              </>
            )}
          </select>
        </label>
          </div>
        </div>
      )}
    </div>
  );
};
