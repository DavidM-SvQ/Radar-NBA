import { useEffect, useMemo, useState } from 'react';
import { Columns3, Filter, Search, Sliders, Users, Check } from 'lucide-react';
import type { NbaLineupEntry, TeamSummary } from '../types/nba';
import { TeamLogo } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import { formatSigned, round1 } from '../utils/analytics';
import { SortableTh } from './MetricUiHelpers';
import { STICKY_THEAD_CLASS, compareSortValues } from '../utils/tableSort';
import { buildTableSnapshotBlob } from '../utils/exportImageCard';
import { getTeamConference, getTeamDivision, NBA_DIVISIONS_LIST } from '../utils/teamLogos';

interface LineupsExplorerViewProps {
  teams: TeamSummary[];
  seasonToken: string;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
}

type LineupSortKey =
  | 'groupName'
  | 'teamAbbr'
  | 'gp'
  | 'w'
  | 'l'
  | 'min'
  | 'wPct'
  | 'offRtg'
  | 'defRtg'
  | 'netRtg'
  | 'pace'
  | 'efgPct'
  | 'tsPct'
  | 'orebPct'
  | 'drebPct'
  | 'rebPct'
  | 'astPct'
  | 'astTo'
  | 'tovPct'
  | 'poss'
  | 'pie';

type LineupViewMode = 'efficiency' | 'four_factors' | 'volume';

export function LineupsExplorerView({
  teams,
  seasonToken,
  onInspectEntity,
}: LineupsExplorerViewProps) {
  const [groupQuantity, setGroupQuantity] = useState<2 | 3 | 5>(5);
  const [selectedConference, setSelectedConference] = useState<string>('all');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('0');
  
  // Dynamic filters
  const [minMinutes, setMinMinutes] = useState<number>(10);
  const [minGames, setMinGames] = useState<number>(1);
  const [query, setQuery] = useState<string>('');

  const [viewMode, setViewMode] = useState<LineupViewMode>('efficiency');
  const [visibleMetricKeys, setVisibleMetricKeys] = useState<Record<string, boolean>>({
    gp: true,
    w: false,
    l: false,
    wPct: false,
    min: true,
    poss: false,
    offRtg: true,
    defRtg: true,
    netRtg: true,
    pace: true,
    tsPct: true,
    efgPct: true,
    orebPct: false,
    drebPct: false,
    rebPct: false,
    astPct: false,
    astTo: false,
    tovPct: false,
    pie: false,
  });
  const [showColumnPicker, setShowColumnPicker] = useState<boolean>(false);

  const [items, setItems] = useState<NbaLineupEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<LineupSortKey>('netRtg');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    void (async () => {
      try {
        const params = new URLSearchParams({
          season: seasonToken,
          group: String(groupQuantity),
          teamId: selectedTeamId,
        });
        const res = await fetch(`/api/nba/advanced/lineups?${params.toString()}`);
        if (!res.ok) {
          throw new Error('No se pudieron cargar las alineaciones y quintetos.');
        }
        const data = await res.json();
        if (!cancelled) {
          setItems(data.items || []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Error al conectar con el servidor.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [seasonToken, groupQuantity, selectedTeamId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (item.min < minMinutes) return false;
        if (item.gp < minGames) return false;

        // Conference / Division filtering
        const teamMeta = teams.find((t) => t.abbreviation === item.teamAbbr);
        if (selectedConference !== 'all') {
          const conf = teamMeta ? teamMeta.conference : getTeamConference(item.teamAbbr);
          if (String(conf).toLowerCase() !== selectedConference.toLowerCase()) return false;
        }
        if (selectedDivision !== 'all') {
          const div = getTeamDivision(item.teamAbbr);
          if (div !== selectedDivision) return false;
        }

        if (q) {
          const hay = `${item.groupName} ${item.teamAbbr}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'groupName' || sortKey === 'teamAbbr') {
          return compareSortValues(a[sortKey], b[sortKey], sortAsc);
        }
        return sortAsc ? (a[sortKey] || 0) - (b[sortKey] || 0) : (b[sortKey] || 0) - (a[sortKey] || 0);
      });
  }, [items, minMinutes, minGames, selectedConference, selectedDivision, teams, query, sortKey, sortAsc]);

  const handleSort = (key: LineupSortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === 'groupName' || key === 'teamAbbr' || key === 'defRtg');
    }
  };

  const handleApplyViewMode = (mode: LineupViewMode) => {
    setViewMode(mode);
    if (mode === 'efficiency') {
      setVisibleMetricKeys({
        gp: true,
        w: false,
        l: false,
        wPct: false,
        min: true,
        poss: false,
        offRtg: true,
        defRtg: true,
        netRtg: true,
        pace: true,
        tsPct: true,
        efgPct: false,
        orebPct: false,
        drebPct: false,
        rebPct: false,
        astPct: false,
        astTo: false,
        tovPct: false,
        pie: true,
      });
    } else if (mode === 'four_factors') {
      setVisibleMetricKeys({
        gp: true,
        w: false,
        l: false,
        wPct: false,
        min: true,
        poss: false,
        offRtg: false,
        defRtg: false,
        netRtg: true,
        pace: false,
        tsPct: true,
        efgPct: true,
        orebPct: true,
        drebPct: true,
        rebPct: true,
        astPct: true,
        astTo: true,
        tovPct: true,
        pie: false,
      });
    } else {
      setVisibleMetricKeys({
        gp: true,
        w: true,
        l: true,
        wPct: true,
        min: true,
        poss: true,
        offRtg: true,
        defRtg: true,
        netRtg: true,
        pace: true,
        tsPct: false,
        efgPct: false,
        orebPct: false,
        drebPct: false,
        rebPct: false,
        astPct: false,
        astTo: false,
        tovPct: false,
        pie: false,
      });
    }
  };

  const handleBuildLineupsSnapshot = async () => {
    const topRows = filtered.slice(0, 30);
    return buildTableSnapshotBlob({
      filename: `radarnba-alineaciones-${groupQuantity}man-${seasonToken}.png`,
      categoryTag: `NBA.com Lineups · ${groupQuantity}-Man`,
      title: `Alineaciones de ${groupQuantity} Jugadores · ${seasonToken}`,
      subtitle: `Filtradas (Mín. ${minMinutes} min, ${minGames} PJ) · ${filtered.length} combinaciones`,
      entityColumnLabel: 'Alineación',
      entityColumnWeight: 2.2,
      showRank: true,
      columns: [
        { key: 'gp', label: 'PJ', align: 'right', widthWeight: 0.7 },
        { key: 'min', label: 'MIN', align: 'right', widthWeight: 0.8 },
        { key: 'off', label: 'OffRtg', align: 'right', widthWeight: 0.9 },
        { key: 'def', label: 'DefRtg', align: 'right', widthWeight: 0.9 },
        { key: 'net', label: 'NetRtg', align: 'right', widthWeight: 1.0 },
        { key: 'ts', label: 'TS%', align: 'right', widthWeight: 0.8 },
      ],
      rows: topRows.map((l, idx) => ({
        rank: idx + 1,
        teamAbbr: l.teamAbbr,
        entityName: l.groupName,
        entitySubtext: `${l.teamAbbr} · ${l.gp} PJ`,
        cells: {
          gp: { text: String(l.gp) },
          min: { text: round1(l.min).toFixed(1) },
          off: { text: l.offRtg.toFixed(1) },
          def: { text: l.defRtg.toFixed(1) },
          net: {
            text: formatSigned(l.netRtg),
            tone: l.netRtg >= 5 ? 'positive' : l.netRtg <= -5 ? 'negative' : 'neutral',
          },
          ts: { text: `${l.tsPct.toFixed(1)}%` },
        },
      })),
      footerNote: `Mostrando top ${topRows.length} de ${filtered.length} alineaciones según orden actual`,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-100">
              Alineaciones (Lineups Analyzer)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Rendimiento en pista de asociaciones de 5, 3 y 2 jugadores en la temporada oficial.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowColumnPicker((prev) => !prev)}
              className="px-3 py-1.5 text-xs font-semibold bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] rounded-lg text-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Columns3 className="w-3.5 h-3.5 text-orange-400" />
              <span>Personalizar Métricas</span>
            </button>
            <ExportImageButton
              onBuildImage={handleBuildLineupsSnapshot}
              disabled={filtered.length === 0}
            />
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1E293B]">
          <div className="flex items-center gap-1 bg-[#0B1120] p-1 rounded-lg border border-[#1E293B]">
            <button
              type="button"
              onClick={() => handleApplyViewMode('efficiency')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'efficiency'
                  ? 'bg-orange-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Eficiencia & Net Rating
            </button>
            <button
              type="button"
              onClick={() => handleApplyViewMode('four_factors')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'four_factors'
                  ? 'bg-orange-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cuatro Factores & Rebote
            </button>
            <button
              type="button"
              onClick={() => handleApplyViewMode('volume')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'volume'
                  ? 'bg-orange-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Volumen & Récord (V-D)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Tamaño:</span>
            <div className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg">
              {([5, 3, 2] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupQuantity(g)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    groupQuantity === g
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {g === 5 ? '5-Man (Quintetos)' : g === 3 ? '3-Man (Tríos)' : '2-Man (Duplas)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Unified Filter Block */}
        <div className="pt-3 border-t border-[#1E293B] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Conference Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              Conferencia
            </label>
            <select
              value={selectedConference}
              onChange={(e) => setSelectedConference(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value="all">Ambas Conferencias</option>
              <option value="Este">Conferencia Este</option>
              <option value="Oeste">Conferencia Oeste</option>
            </select>
          </div>

          {/* Division Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              División
            </label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value="all">Todas las Divisiones</option>
              {NBA_DIVISIONS_LIST.map((div) => (
                <option key={div} value={div}>
                  {div}
                </option>
              ))}
            </select>
          </div>

          {/* Team Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              Franquicia
            </label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value="0">Toda la NBA (30 equipos)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.abbreviation})
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic Min Minutes Filter */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase">
                Mín. Minutos
              </label>
              <span className="text-xs font-mono font-bold text-orange-400 tabular-nums">
                ≥ {minMinutes} min
              </span>
            </div>
            <div className="flex items-center gap-1 bg-[#0B1120] border border-[#1E293B] rounded-lg px-2 py-1">
              <input
                type="range"
                min="0"
                max="150"
                step="5"
                value={minMinutes}
                onChange={(e) => setMinMinutes(Number(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Dynamic Min Games Filter */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase">
                Mín. Partidos (PJ)
              </label>
              <span className="text-xs font-mono font-bold text-orange-400 tabular-nums">
                ≥ {minGames} PJ
              </span>
            </div>
            <div className="flex items-center gap-1 bg-[#0B1120] border border-[#1E293B] rounded-lg px-2 py-1">
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={minGames}
                onChange={(e) => setMinGames(Number(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por jugador o franquicia en la alineación..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>

        {/* Column Customizer Panel */}
        {showColumnPicker && (
          <div className="p-3 bg-[#0B1120] border border-[#1E293B] rounded-xl space-y-2">
            <div className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span>Seleccionar métricas visibles en la tabla:</span>
              <button
                type="button"
                onClick={() => setShowColumnPicker(false)}
                className="text-[11px] text-orange-400 hover:underline"
              >
                Cerrar
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { key: 'gp', label: 'Partidos (PJ)' },
                { key: 'w', label: 'Victorias (V)' },
                { key: 'l', label: 'Derrotas (D)' },
                { key: 'wPct', label: '% Victorias' },
                { key: 'min', label: 'Minutos' },
                { key: 'poss', label: 'Posesiones' },
                { key: 'offRtg', label: 'OffRtg' },
                { key: 'defRtg', label: 'DefRtg' },
                { key: 'netRtg', label: 'NetRtg' },
                { key: 'pace', label: 'Pace (Ritmo)' },
                { key: 'tsPct', label: 'TS% Verdadero' },
                { key: 'efgPct', label: 'eFG% Efectivo' },
                { key: 'orebPct', label: 'OREB%' },
                { key: 'drebPct', label: 'DREB%' },
                { key: 'rebPct', label: 'REB% Total' },
                { key: 'astPct', label: 'AST%' },
                { key: 'astTo', label: 'AST/TO' },
                { key: 'tovPct', label: 'TOV%' },
                { key: 'pie', label: 'PIE' },
              ].map((col) => {
                const isActive = visibleMetricKeys[col.key];
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() =>
                      setVisibleMetricKeys((prev) => ({
                        ...prev,
                        [col.key]: !prev[col.key],
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                        : 'bg-[#131C2E] text-slate-400 border-[#1E293B] hover:text-slate-200'
                    }`}
                  >
                    {isActive && <Check className="w-3 h-3 text-orange-400" />}
                    <span>{col.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-12 text-center text-xs text-slate-400">
          Cargando alineaciones de la NBA...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-12 text-center text-xs text-slate-400">
          No hay alineaciones que cumplan los filtros actuales (Mín. {minMinutes} min, Mín. {minGames} PJ).
        </div>
      ) : (
        <div
          id="lineups-table-container"
          className="bg-[#131C2E] border border-[#1E293B] rounded-xl overflow-hidden"
        >
          <div className="overflow-x-auto max-h-[72vh]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className={STICKY_THEAD_CLASS}>
                <tr className="text-slate-400">
                  <SortableTh
                    label="Equipo"
                    active={sortKey === 'teamAbbr'}
                    asc={sortAsc}
                    onSort={() => handleSort('teamAbbr')}
                    align="left"
                    className="py-3 pl-4 pr-2 w-24"
                  />
                  <SortableTh
                    label="Alineación / Jugadores en Pista"
                    active={sortKey === 'groupName'}
                    asc={sortAsc}
                    onSort={() => handleSort('groupName')}
                    align="left"
                    className="py-3 px-3"
                  />
                  {visibleMetricKeys.gp && (
                    <SortableTh
                      label="PJ"
                      active={sortKey === 'gp'}
                      asc={sortAsc}
                      onSort={() => handleSort('gp')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.w && (
                    <SortableTh
                      label="V"
                      active={sortKey === 'w'}
                      asc={sortAsc}
                      onSort={() => handleSort('w')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.l && (
                    <SortableTh
                      label="D"
                      active={sortKey === 'l'}
                      asc={sortAsc}
                      onSort={() => handleSort('l')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.wPct && (
                    <SortableTh
                      label="% Vic."
                      active={sortKey === 'wPct'}
                      asc={sortAsc}
                      onSort={() => handleSort('wPct')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.min && (
                    <SortableTh
                      label="Minutos"
                      active={sortKey === 'min'}
                      asc={sortAsc}
                      onSort={() => handleSort('min')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.poss && (
                    <SortableTh
                      label="Poses."
                      active={sortKey === 'poss'}
                      asc={sortAsc}
                      onSort={() => handleSort('poss')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.offRtg && (
                    <SortableTh
                      label="OffRtg"
                      active={sortKey === 'offRtg'}
                      asc={sortAsc}
                      onSort={() => handleSort('offRtg')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.defRtg && (
                    <SortableTh
                      label="DefRtg"
                      active={sortKey === 'defRtg'}
                      asc={sortAsc}
                      onSort={() => handleSort('defRtg')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.netRtg && (
                    <SortableTh
                      label="NetRtg"
                      active={sortKey === 'netRtg'}
                      asc={sortAsc}
                      onSort={() => handleSort('netRtg')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.pace && (
                    <SortableTh
                      label="Pace"
                      active={sortKey === 'pace'}
                      asc={sortAsc}
                      onSort={() => handleSort('pace')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.tsPct && (
                    <SortableTh
                      label="TS%"
                      active={sortKey === 'tsPct'}
                      asc={sortAsc}
                      onSort={() => handleSort('tsPct')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.efgPct && (
                    <SortableTh
                      label="eFG%"
                      active={sortKey === 'efgPct'}
                      asc={sortAsc}
                      onSort={() => handleSort('efgPct')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.orebPct && (
                    <SortableTh
                      label="OREB%"
                      active={sortKey === 'orebPct'}
                      asc={sortAsc}
                      onSort={() => handleSort('orebPct')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.drebPct && (
                    <SortableTh
                      label="DREB%"
                      active={sortKey === 'drebPct'}
                      asc={sortAsc}
                      onSort={() => handleSort('drebPct')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.rebPct && (
                    <SortableTh
                      label="REB%"
                      active={sortKey === 'rebPct'}
                      asc={sortAsc}
                      onSort={() => handleSort('rebPct')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.astPct && (
                    <SortableTh
                      label="AST%"
                      active={sortKey === 'astPct'}
                      asc={sortAsc}
                      onSort={() => handleSort('astPct')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.astTo && (
                    <SortableTh
                      label="AST/TO"
                      active={sortKey === 'astTo'}
                      asc={sortAsc}
                      onSort={() => handleSort('astTo')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.tovPct && (
                    <SortableTh
                      label="TOV%"
                      active={sortKey === 'tovPct'}
                      asc={sortAsc}
                      onSort={() => handleSort('tovPct')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                  )}
                  {visibleMetricKeys.pie && (
                    <SortableTh
                      label="PIE"
                      active={sortKey === 'pie'}
                      asc={sortAsc}
                      onSort={() => handleSort('pie')}
                      align="right"
                      className="py-3 pl-2.5 pr-4"
                    />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] font-mono tabular-nums">
                {filtered.map((l, idx) => (
                  <tr key={idx} className="hover:bg-[#182338]/50 transition-colors">
                    <td
                      className="py-2.5 pl-4 pr-2 font-sans cursor-pointer"
                      onClick={() => {
                        const matchTeam = teams.find((t) => t.abbreviation === l.teamAbbr);
                        if (matchTeam) onInspectEntity('team', matchTeam.id);
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200 hover:text-orange-400">
                        <TeamLogo abbr={l.teamAbbr} size="xs" />
                        <span>{l.teamAbbr}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-100">
                      {l.groupName}
                    </td>
                    {visibleMetricKeys.gp && (
                      <td className="py-2.5 px-2.5 text-right text-slate-300">{l.gp}</td>
                    )}
                    {visibleMetricKeys.w && (
                      <td className="py-2.5 px-2.5 text-right text-emerald-400">{l.w}</td>
                    )}
                    {visibleMetricKeys.l && (
                      <td className="py-2.5 px-2.5 text-right text-rose-400">{l.l}</td>
                    )}
                    {visibleMetricKeys.wPct && (
                      <td className="py-2.5 px-2.5 text-right text-slate-300">
                        {(l.wPct * 100).toFixed(1)}%
                      </td>
                    )}
                    {visibleMetricKeys.min && (
                      <td className="py-2.5 px-2.5 text-right text-slate-300">
                        {round1(l.min)}
                      </td>
                    )}
                    {visibleMetricKeys.poss && (
                      <td className="py-2.5 px-2.5 text-right text-slate-300">
                        {Math.round(l.poss || 0)}
                      </td>
                    )}
                    {visibleMetricKeys.offRtg && (
                      <td className="py-2.5 px-2.5 text-right text-slate-200">
                        {l.offRtg.toFixed(1)}
                      </td>
                    )}
                    {visibleMetricKeys.defRtg && (
                      <td className="py-2.5 px-2.5 text-right text-slate-200">
                        {l.defRtg.toFixed(1)}
                      </td>
                    )}
                    {visibleMetricKeys.netRtg && (
                      <td
                        className={`py-2.5 px-2.5 text-right font-bold ${
                          l.netRtg >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatSigned(l.netRtg)}
                      </td>
                    )}
                    {visibleMetricKeys.pace && (
                      <td className="py-2.5 px-2.5 text-right text-slate-300">
                        {l.pace.toFixed(1)}
                      </td>
                    )}
                    {visibleMetricKeys.tsPct && (
                      <td className="py-2.5 px-2.5 text-right text-orange-300">
                        {l.tsPct.toFixed(1)}%
                      </td>
                    )}
                    {visibleMetricKeys.efgPct && (
                      <td className="py-2.5 px-2.5 text-right text-slate-200">
                        {l.efgPct.toFixed(1)}%
                      </td>
                    )}
                    {visibleMetricKeys.orebPct && (
                      <td className="py-2.5 px-2.5 text-right text-slate-300">
                        {l.orebPct.toFixed(1)}%
                      </td>
                    )}
                    {visibleMetricKeys.drebPct && (
                      <td className="py-2.5 px-2.5 text-right text-slate-300">
                        {l.drebPct.toFixed(1)}%
                      </td>
                    )}
                    {visibleMetricKeys.rebPct && (
                      <td className="py-2.5 px-2.5 text-right text-slate-300">
                        {l.rebPct.toFixed(1)}%
                      </td>
                    )}
                    {visibleMetricKeys.astPct && (
                      <td className="py-2.5 px-2.5 text-right text-slate-300">
                        {l.astPct.toFixed(1)}%
                      </td>
                    )}
                    {visibleMetricKeys.astTo && (
                      <td className="py-2.5 px-2.5 text-right text-slate-200">
                        {l.astTo.toFixed(2)}
                      </td>
                    )}
                    {visibleMetricKeys.tovPct && (
                      <td className="py-2.5 px-2.5 text-right text-slate-300">
                        {l.tovPct.toFixed(1)}%
                      </td>
                    )}
                    {visibleMetricKeys.pie && (
                      <td className="py-2.5 pl-2.5 pr-4 text-right text-emerald-300">
                        {l.pie.toFixed(1)}%
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
