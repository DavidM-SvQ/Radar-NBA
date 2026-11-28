import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  HeartPulse,
  RefreshCw,
  Search,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import type {
  ActiveSection,
  InjuriesRotationPayload,
  InjuryPlayerReportItem,
  InjuryStatusCode,
  TeamInjuryRotationImpact,
} from '../types/nba';
import { formatSigned, normalizeSearchText } from '../utils/analytics';
import {
  getImpactTierMeta,
  getInjuryStatusVisualMeta,
} from '../utils/injuriesClient';
import { InjuryStatusBadge } from './InjuryStatusBadge';
import { PlayerAvatar, TeamLogo, getTeamBrandColors } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import {
  buildTableSnapshotBlob,
  type TableSnapshotCell,
} from '../utils/exportImageCard';
import { SortableTh } from './MetricUiHelpers';
import { STICKY_THEAD_CLASS, compareSortValues } from '../utils/tableSort';
import { useThemeStyle } from '../context/ThemeStyleContext';

interface InjuriesRotationViewProps {
  injuriesData: InjuriesRotationPayload | null;
  loading: boolean;
  errorMsg: string | null;
  watchlistIds: Set<string>;
  onlyWatchlist: boolean;
  onToggleWatchlist: (entityKey: string) => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onNavigateSection: (section: ActiveSection) => void;
  onRefresh: () => void;
}

type InjuriesTab = 'teams' | 'beneficiaries' | 'report';
type StatusFilter = 'all' | 'out_ir' | 'questionable' | 'probable';

const STATUS_PRIORITY: Record<InjuryStatusCode, number> = {
  out: 0,
  ir: 1,
  suspended: 2,
  doubtful: 3,
  questionable: 4,
  dtd: 5,
  probable: 6,
};

function matchesStatusFilter(
  code: InjuryStatusCode,
  filter: StatusFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'out_ir') {
    return code === 'out' || code === 'ir' || code === 'suspended';
  }
  if (filter === 'questionable') {
    return code === 'doubtful' || code === 'questionable' || code === 'dtd';
  }
  return code === 'probable';
}

export function InjuriesRotationView({
  injuriesData,
  loading,
  errorMsg,
  watchlistIds,
  onlyWatchlist,
  onToggleWatchlist,
  onInspectEntity,
  onNavigateSection,
  onRefresh,
}: InjuriesRotationViewProps) {
  const { isV2, isV3 } = useThemeStyle();
  const [activeTab, setActiveTab] = useState<InjuriesTab>('teams');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [confFilter, setConfFilter] = useState<'all' | 'East' | 'West'>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [onlyKeyRotation, setOnlyKeyRotation] = useState(false);

  // Sorting for Full Report table
  const [reportSortKey, setReportSortKey] = useState<string>('impactWeight');
  const [reportSortAsc, setReportSortAsc] = useState<boolean>(false);

  // Sorting for Beneficiaries table
  const [benSortKey, setBenSortKey] = useState<string>('projectedMinDelta');
  const [benSortAsc, setBenSortAsc] = useState<boolean>(false);

  const toggleReportSort = (key: string) => {
    if (reportSortKey === key) {
      setReportSortAsc((p) => !p);
    } else {
      setReportSortKey(key);
      setReportSortAsc(key === 'name' || key === 'teamAbbr' || key === 'status');
    }
  };

  const toggleBenSort = (key: string) => {
    if (benSortKey === key) {
      setBenSortAsc((p) => !p);
    } else {
      setBenSortKey(key);
      setBenSortAsc(key === 'name' || key === 'teamAbbr');
    }
  };

  const teamOptions = useMemo(() => {
    if (!injuriesData?.teams) return [];
    return [...injuriesData.teams]
      .sort((a, b) => a.teamName.localeCompare(b.teamName))
      .map((t) => ({ abbr: t.teamAbbr, name: t.teamName, count: t.totalInjured }));
  }, [injuriesData]);

  const normQuery = useMemo(() => normalizeSearchText(query.trim()), [query]);

  const filteredEntries = useMemo(() => {
    const list = injuriesData?.entries || [];
    const out = list.filter((e) => {
      if (!matchesStatusFilter(e.statusCode, statusFilter)) return false;
      if (confFilter !== 'all' && e.conference !== confFilter) return false;
      if (teamFilter !== 'all' && e.teamAbbr !== teamFilter) return false;
      if (onlyKeyRotation && !e.isKeyRotation) return false;
      if (onlyWatchlist) {
        const pWatched = e.playerId ? watchlistIds.has(`player:${e.playerId}`) : false;
        const tWatched = e.teamId ? watchlistIds.has(`team:${e.teamId}`) : false;
        if (!pWatched && !tWatched) return false;
      }
      if (normQuery) {
        const hay = normalizeSearchText(
          `${e.name} ${e.teamAbbr} ${e.teamName} ${e.detailEs} ${e.statusLabelEs}`
        );
        if (!hay.includes(normQuery)) return false;
      }
      return true;
    });

    return [...out].sort((a, b) => {
      if (reportSortKey === 'name') {
        return compareSortValues(a.name, b.name, reportSortAsc);
      }
      if (reportSortKey === 'teamAbbr') {
        return compareSortValues(a.teamAbbr, b.teamAbbr, reportSortAsc);
      }
      if (reportSortKey === 'status') {
        return compareSortValues(
          STATUS_PRIORITY[a.statusCode] ?? 9,
          STATUS_PRIORITY[b.statusCode] ?? 9,
          reportSortAsc
        );
      }
      const va = (a as unknown as Record<string, number>)[reportSortKey] ?? 0;
      const vb = (b as unknown as Record<string, number>)[reportSortKey] ?? 0;
      return compareSortValues(va, vb, reportSortAsc);
    });
  }, [
    injuriesData,
    statusFilter,
    confFilter,
    teamFilter,
    onlyKeyRotation,
    onlyWatchlist,
    watchlistIds,
    normQuery,
    reportSortKey,
    reportSortAsc,
  ]);

  const filteredTeams = useMemo(() => {
    const list = injuriesData?.teams || [];
    return list
      .map((t): TeamInjuryRotationImpact | null => {
        if (confFilter !== 'all' && t.conference !== confFilter) return null;
        if (teamFilter !== 'all' && t.teamAbbr !== teamFilter) return null;
        const matchingInjs = t.injuries.filter((e) => {
          if (!matchesStatusFilter(e.statusCode, statusFilter)) return false;
          if (onlyKeyRotation && !e.isKeyRotation) return false;
          return true;
        });
        if (matchingInjs.length === 0) return null;

        if (onlyWatchlist) {
          const teamW = watchlistIds.has(`team:${t.teamId}`);
          const anyPlayerW =
            matchingInjs.some((e) => e.playerId && watchlistIds.has(`player:${e.playerId}`)) ||
            t.beneficiaries.some((b) => watchlistIds.has(`player:${b.playerId}`));
          if (!teamW && !anyPlayerW) return null;
        }

        if (normQuery) {
          const hay = normalizeSearchText(
            `${t.teamName} ${t.teamAbbr} ${matchingInjs.map((x) => `${x.name} ${x.detailEs}`).join(' ')} ${t.beneficiaries.map((b) => b.name).join(' ')}`
          );
          if (!hay.includes(normQuery)) return null;
        }
        return { ...t, injuries: matchingInjs };
      })
      .filter((t): t is TeamInjuryRotationImpact => t !== null);
  }, [
    injuriesData,
    confFilter,
    teamFilter,
    statusFilter,
    onlyKeyRotation,
    onlyWatchlist,
    watchlistIds,
    normQuery,
  ]);

  const filteredBeneficiaries = useMemo(() => {
    const raw = (injuriesData?.teams || []).flatMap((t) =>
      t.beneficiaries.map((b) => ({ ...b, conference: t.conference }))
    );
    const out = raw.filter((b) => {
      if (confFilter !== 'all' && b.conference !== confFilter) return false;
      if (teamFilter !== 'all' && b.teamAbbr !== teamFilter) return false;
      if (onlyWatchlist) {
        const pW = watchlistIds.has(`player:${b.playerId}`);
        const tW = watchlistIds.has(`team:${b.teamId}`);
        if (!pW && !tW) return false;
      }
      if (normQuery) {
        const hay = normalizeSearchText(
          `${b.name} ${b.teamAbbr} ${b.teamName} ${b.roleShiftLabel} ${b.triggeredBy.map((x) => x.name).join(' ')}`
        );
        if (!hay.includes(normQuery)) return false;
      }
      return true;
    });

    return [...out].sort((a, b) => {
      if (benSortKey === 'name') {
        return compareSortValues(a.name, b.name, benSortAsc);
      }
      if (benSortKey === 'teamAbbr') {
        return compareSortValues(a.teamAbbr, b.teamAbbr, benSortAsc);
      }
      const va = (a as unknown as Record<string, number>)[benSortKey] ?? 0;
      const vb = (b as unknown as Record<string, number>)[benSortKey] ?? 0;
      return compareSortValues(va, vb, benSortAsc);
    });
  }, [
    injuriesData,
    confFilter,
    teamFilter,
    onlyWatchlist,
    watchlistIds,
    normQuery,
    benSortKey,
    benSortAsc,
  ]);

  const handleExportSnapshot = async () => {
    const dateSlug = new Date().toISOString().slice(0, 10);
    if (activeTab === 'beneficiaries') {
      const top = filteredBeneficiaries.slice(0, 18);
      return buildTableSnapshotBlob({
        filename: `radarnba-oportunidades-rotacion-${dateSlug}.png`,
        categoryTag: 'IMPACTO EN ROTACIONES NBA',
        title: 'Beneficiarios por Bajas NBA (Absorción de Minutos y Uso)',
        subtitle: `Top ${top.length} compañeros con mayor subida proyectada de minutos, Usage % y anotación`,
        entityColumnLabel: 'JUGADOR',
        entityColumnWeight: 2.2,
        kpis: [
          {
            label: 'BAJAS OFICIALES',
            value: `${injuriesData?.summary.outOrIrCount ?? 0} Out/IR`,
            sublabel: `${injuriesData?.summary.questionableOrDtdCount ?? 0} dudas activas`,
            tone: 'negative',
          },
          {
            label: 'MINUTOS VACANTES',
            value: `${(injuriesData?.summary.totalVacatedMinutes ?? 0).toFixed(0)} MIN`,
            sublabel: `${injuriesData?.summary.teamsAffected ?? 0} franquicias`,
            tone: 'accent',
          },
          {
            label: 'LÍDER OPORTUNIDAD',
            value: top[0] ? top[0].name : '—',
            sublabel: top[0]
              ? `+${top[0].projectedMinDelta.toFixed(1)} MIN · +${top[0].projectedPtsDelta.toFixed(1)} PTS`
              : undefined,
            tone: 'positive',
          },
        ],
        columns: [
          { key: 'baseMin', label: 'MIN BASE', align: 'right', widthWeight: 0.9 },
          { key: 'dMin', label: '+MIN', align: 'right', widthWeight: 0.85 },
          { key: 'dUsg', label: '+USG%', align: 'right', widthWeight: 0.85 },
          { key: 'basePts', label: 'PTS BASE', align: 'right', widthWeight: 0.9 },
          { key: 'dPts', label: '+PTS', align: 'right', widthWeight: 0.85 },
        ],
        rows: top.map((b, idx) => {
          const cells: Record<string, TableSnapshotCell> = {
            baseMin: { text: `${b.baseMinutesPg.toFixed(1)}` },
            dMin: { text: `+${b.projectedMinDelta.toFixed(1)}`, tone: 'positive' },
            dUsg: { text: `+${b.projectedUsgDelta.toFixed(1)}%`, tone: 'accent' },
            basePts: { text: `${b.basePointsPg.toFixed(1)}` },
            dPts: { text: `+${b.projectedPtsDelta.toFixed(1)}`, tone: 'positive' },
          };
          return {
            rank: idx + 1,
            teamAbbr: b.teamAbbr,
            entityName: b.name,
            entitySubtext: `${b.teamAbbr} · ${b.roleShiftLabel}`,
            cells,
          };
        }),
        editorialVerdict: top[0]
          ? `Mayor oportunidad de rotación: ${top[0].name} (${top[0].teamAbbr}, +${top[0].projectedMinDelta.toFixed(1)} MIN y +${top[0].projectedPtsDelta.toFixed(1)} PTS proyectados).`
          : undefined,
      });
    }

    const topInjs = filteredEntries.slice(0, 20);
    return buildTableSnapshotBlob({
      filename: `radarnba-parte-lesiones-${dateSlug}.png`,
      categoryTag: 'PARTE MÉDICO OFICIAL NBA',
      title: 'Parte Diario de Lesiones y Bajas NBA',
      subtitle: `${filteredEntries.length} jugadores en seguimiento · ${injuriesData?.summary.outOrIrCount ?? 0} Out/IR · ${injuriesData?.summary.questionableOrDtdCount ?? 0} dudas`,
      entityColumnLabel: 'JUGADOR',
      entityColumnWeight: 2.3,
      kpis: [
        {
          label: 'OUT / IR',
          value: `${injuriesData?.summary.outOrIrCount ?? 0}`,
          sublabel: 'Bajas confirmadas',
          tone: 'negative',
        },
        {
          label: 'DUDAS (GTD/DTD)',
          value: `${(injuriesData?.summary.doubtfulCount ?? 0) + (injuriesData?.summary.questionableOrDtdCount ?? 0)}`,
          sublabel: 'Evaluación previa al partido',
          tone: 'accent',
        },
        {
          label: 'EQUIPO MÁS MERMADO',
          value: injuriesData?.summary.mostImpactedTeamAbbr || '—',
          sublabel: injuriesData?.teams[0]
            ? `-${injuriesData.teams[0].vacatedMinutes.toFixed(0)} MIN vacantes`
            : undefined,
          tone: 'negative',
        },
      ],
      columns: [
        { key: 'status', label: 'ESTADO', align: 'left', widthWeight: 1.0 },
        { key: 'min', label: 'MIN', align: 'right', widthWeight: 0.75 },
        { key: 'pts', label: 'PTS', align: 'right', widthWeight: 0.75 },
        { key: 'usg', label: 'USG%', align: 'right', widthWeight: 0.85 },
        { key: 'detail', label: 'PARTE MÉDICO', align: 'left', widthWeight: 2.1 },
      ],
      rows: topInjs.map((e, idx) => {
        const meta = getInjuryStatusVisualMeta(e.statusCode);
        const cells: Record<string, TableSnapshotCell> = {
          status: {
            text: meta.shortLabel,
            tone: meta.isUnavailable ? 'negative' : 'accent',
          },
          min: { text: e.minutesPg > 0 ? e.minutesPg.toFixed(1) : '—' },
          pts: { text: e.pointsPg > 0 ? e.pointsPg.toFixed(1) : '—' },
          usg: { text: e.usgPct > 0 ? `${e.usgPct.toFixed(1)}%` : '—' },
          detail: { text: e.detailEs.slice(0, 46) },
        };
        return {
          rank: idx + 1,
          teamAbbr: e.teamAbbr,
          entityName: e.name,
          entitySubtext: `${e.teamAbbr} · ${e.position}`,
          cells,
        };
      }),
      editorialVerdict: injuriesData?.teams[0]
        ? `${injuriesData.teams[0].teamName} lidera el impacto de bajas hoy (-${injuriesData.teams[0].vacatedMinutes.toFixed(1)} MIN y -${injuriesData.teams[0].vacatedPoints.toFixed(1)} PTS vacantes).`
        : undefined,
    });
  };

  if (loading && !injuriesData) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-4 space-y-2 animate-pulse">
              <div className="h-3 w-28 bg-[#1E293B] rounded" />
              <div className="h-7 w-16 bg-[#1E293B] rounded" />
              <div className="h-3 w-36 bg-[#1E293B] rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 animate-pulse space-y-3"
            >
              <div className="h-5 w-48 bg-[#1E293B] rounded" />
              <div className="h-24 w-full bg-[#1E293B]/60 rounded" />
              <div className="h-20 w-full bg-[#1E293B]/40 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg && !injuriesData) {
    return (
      <div className="bg-[#131C2E] border border-rose-500/30 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              No se pudo cargar el parte médico NBA
            </h2>
            <p className="text-xs text-slate-400 mt-1">{errorMsg}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reintentar
        </button>
      </div>
    );
  }

  const summary = injuriesData?.summary;
  const mostImpactedTeam = injuriesData?.teams[0] || null;
  const updatedTimeLabel = injuriesData?.generatedAt
    ? new Date(injuriesData.generatedAt).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <HeartPulse className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Parte oficial diario NBA</span>
            <span aria-hidden="true">·</span>
            <span>Modelo empírico + posicional de absorción</span>
            {updatedTimeLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Act. {updatedTimeLabel}</span>
              </>
            )}
          </div>
          <h2 className="font-display text-xl md:text-2xl font-bold text-slate-100 mt-1">
            Lesiones y Bajas con Impacto en Rotaciones
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Estado físico verificado (Out, IR, Doubtful, Questionable, DTD y Probable) cruzado con el reparto real de minutos, Usage % y producción de cada franquicia.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => onNavigateSection('lineups')}
            className="h-9 px-3 rounded-lg bg-[#131C2E] border border-[#1E293B] hover:border-slate-500 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Users className="w-3.5 h-3.5 text-sky-400" />
            Ver Alineaciones
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="h-9 px-3 rounded-lg bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/50 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar parte
          </button>
          <ExportImageButton
            onBuildImage={handleExportSnapshot}
          />
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
        <div className="p-4">
          <div className="text-xs text-slate-400">Bajas confirmadas (Out / IR)</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-rose-400">
              {summary?.outOrIrCount ?? 0}
            </span>
            <span className="text-xs text-slate-400">
              de {summary?.totalReported ?? 0} en parte
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Incluye lesionados de larga duración y sancionados
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Dudas del día (Dud / GTD / DTD)</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-amber-300">
              {(summary?.doubtfulCount ?? 0) + (summary?.questionableOrDtdCount ?? 0)}
            </span>
            <span className="text-xs text-slate-400">
              +{summary?.probableCount ?? 0} probables
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Ponderados por probabilidad real de ausencia
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Minutos vacantes en la liga</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-orange-300">
              {(summary?.totalVacatedMinutes ?? 0).toFixed(0)}
            </span>
            <span className="text-xs text-slate-400">MIN / partido</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            En {summary?.teamsAffected ?? 0} franquicias con parte activo
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Franquicia más mermada hoy</div>
          {mostImpactedTeam ? (
            <button
              type="button"
              onClick={() => onInspectEntity('team', mostImpactedTeam.teamId)}
              className="mt-1 flex items-center gap-2 text-left group w-full"
            >
              <TeamLogo
                abbr={mostImpactedTeam.teamAbbr}
                teamId={mostImpactedTeam.teamId}
                logoUrl={mostImpactedTeam.logoUrl}
                size="sm"
                framed
              />
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-100 group-hover:text-orange-300 transition-colors truncate">
                  {mostImpactedTeam.teamName}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-rose-300">
                  -{mostImpactedTeam.vacatedMinutes.toFixed(0)} MIN · -{mostImpactedTeam.vacatedPoints.toFixed(1)} PTS
                </div>
              </div>
            </button>
          ) : (
            <div className="mt-1 text-sm text-slate-500">Sin bajas registradas</div>
          )}
        </div>
      </div>

      {/* Mode Tabs + Unified Filter Bar */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Segmented View Tabs */}
          <div className="inline-flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg self-start overflow-x-auto max-w-full">
            {(
              [
                { id: 'teams', label: 'Impacto por Equipo', count: filteredTeams.length },
                {
                  id: 'beneficiaries',
                  label: 'Oportunidades en Rotación',
                  count: filteredBeneficiaries.length,
                },
                {
                  id: 'report',
                  label: 'Parte Médico Completo',
                  count: filteredEntries.length,
                },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-8 px-3 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      active ? 'text-slate-950/75' : 'text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-none sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar jugador, equipo o lesión..."
                className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/60"
              />
            </div>

            <select
              aria-label="Filtrar por conferencia"
              value={confFilter}
              onChange={(e) => setConfFilter(e.target.value as 'all' | 'East' | 'West')}
              className="h-9 px-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
            >
              <option value="all">Todas las conf.</option>
              <option value="East">Conferencia Este</option>
              <option value="West">Conferencia Oeste</option>
            </select>

            <select
              aria-label="Filtrar por equipo"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
            >
              <option value="all">Todos los equipos ({teamOptions.length})</option>
              {teamOptions.map((t) => (
                <option key={t.abbr} value={t.abbr}>
                  {t.abbr} · {t.name} ({t.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status filter pills (interactive buttons) + Key Rotation toggle */}
        {activeTab !== 'beneficiaries' && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1E293B]/80">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'Todos los estados' },
                  { id: 'out_ir', label: 'Out / IR / Sanc.' },
                  { id: 'questionable', label: 'Dudas (Dud / GTD / DTD)' },
                  { id: 'probable', label: 'Probable' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === st.id
                      ? 'bg-slate-200 text-slate-950 font-semibold'
                      : 'bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div
              className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs"
              role="group"
              aria-label="Filtro de peso en rotación"
            >
              <button
                type="button"
                onClick={() => setOnlyKeyRotation(false)}
                aria-pressed={!onlyKeyRotation}
                className={`h-7 px-2.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  !onlyKeyRotation
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Toda la plantilla
              </button>
              <button
                type="button"
                onClick={() => setOnlyKeyRotation(true)}
                aria-pressed={onlyKeyRotation}
                className={`h-7 px-2.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  onlyKeyRotation
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Solo piezas de rotación (≥14 MIN)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: IMPACT BY TEAM */}
      {activeTab === 'teams' && (
        filteredTeams.length === 0 ? (
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-200">
              No hay equipos con bajas que coincidan con estos filtros.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setStatusFilter('all');
                setConfFilter('all');
                setTeamFilter('all');
                setOnlyKeyRotation(false);
              }}
              className="text-xs text-orange-400 hover:text-orange-300 font-medium"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredTeams.map((team) => {
              const tierMeta = getImpactTierMeta(team.impactTier);
              const brand = getTeamBrandColors(team.teamAbbr);
              const teamWatched = watchlistIds.has(`team:${team.teamId}`);

              return (
                <section
                  key={team.teamAbbr}
                  className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden flex flex-col"
                >
                  {/* Team Card Header */}
                  <div
                    className="px-4 py-3.5 border-b border-[#1E293B] flex items-center justify-between gap-3"
                    style={
                      isV2 || isV3
                        ? {
                            backgroundImage: `radial-gradient(ellipse at left top, ${brand.primary}${isV3 ? '24' : '1A'}, transparent 65%)`,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => onInspectEntity('team', team.teamId)}
                        className="flex items-center gap-2.5 text-left group min-w-0"
                      >
                        <TeamLogo
                          abbr={team.teamAbbr}
                          teamId={team.teamId}
                          logoUrl={team.logoUrl}
                          size="md"
                          framed
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-bold text-slate-100 group-hover:text-orange-300 transition-colors truncate">
                              {team.teamName}
                            </h3>
                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-orange-300 shrink-0" />
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono tabular-nums">
                              {team.wins}-{team.losses}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className={`font-medium ${tierMeta.textClass}`}>
                              {tierMeta.label}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {team.outOrIrCount > 0 ? `${team.outOrIrCount} Out/IR` : `${team.totalInjured} en parte`}
                              {team.questionableOrDtdCount + team.doubtfulCount > 0
                                ? ` · ${team.questionableOrDtdCount + team.doubtfulCount} dudas`
                                : ''}
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="font-mono tabular-nums text-xs font-bold text-rose-300">
                          -{team.vacatedMinutes.toFixed(0)} MIN
                        </div>
                        <div className="font-mono tabular-nums text-[11px] text-slate-400">
                          -{team.vacatedPoints.toFixed(1)} PTS · -{team.vacatedUsage.toFixed(0)}% USG
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Seguir franquicia"
                        onClick={() => onToggleWatchlist(`team:${team.teamId}`)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-orange-400"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            teamWatched ? 'fill-orange-400 text-orange-400' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Injured Players List */}
                  <div className="divide-y divide-[#1E293B]/70">
                    {team.injuries.map((inj) => (
                      <div
                        key={inj.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[#182338]/60 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <InjuryStatusBadge injury={inj} compact />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {inj.playerId ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    inj.playerId &&
                                    onInspectEntity('player', inj.playerId)
                                  }
                                  className="text-xs font-semibold text-slate-100 hover:text-orange-300 truncate text-left"
                                >
                                  {inj.name}
                                </button>
                              ) : (
                                <span className="text-xs font-semibold text-slate-200 truncate">
                                  {inj.name}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-500 shrink-0">
                                {inj.position}
                              </span>
                              {inj.isStarter && (
                                <span className="text-[10px] font-medium text-amber-300/90 shrink-0">
                                  · Titular
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {inj.detailEs}
                              {inj.returnDate ? ` · Regreso est.: ${inj.returnDate}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="text-right font-mono tabular-nums text-[11px] text-slate-300 shrink-0 whitespace-nowrap">
                          {inj.minutesPg > 0 ? (
                            <>
                              <div>{inj.minutesPg.toFixed(1)} MIN</div>
                              <div className="text-slate-400">
                                {inj.pointsPg.toFixed(1)} PTS · {inj.usgPct.toFixed(0)}% USG
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-500">Sin PJ 26-27</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Beneficiaries / Rotation Absorption Footer */}
                  {team.beneficiaries.length > 0 && (
                    <div className="mt-auto px-4 py-3 bg-[#0B1120]/55 border-t border-[#1E293B]">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                        <span className="font-semibold text-emerald-300 inline-flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5" />
                          Absorción estimada en rotación
                        </span>
                        <span>+MIN · +USG% · +PTS</span>
                      </div>
                      <div className="space-y-1.5">
                        {team.beneficiaries.slice(0, 3).map((b) => (
                          <button
                            key={b.playerId}
                            type="button"
                            onClick={() => onInspectEntity('player', b.playerId)}
                            className="w-full flex items-center justify-between gap-2 py-1 px-2 -mx-2 rounded-md hover:bg-[#182338] transition-colors text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <PlayerAvatar
                                playerId={b.playerId}
                                name={b.name}
                                headshotUrl={b.headshotUrl}
                                teamAbbr={b.teamAbbr}
                                size="xs"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-100 truncate">
                                  {b.name}
                                  <span className="ml-1.5 text-[11px] text-slate-400 font-normal">
                                    {b.roleShiftLabel}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  Base {b.baseMinutesPg.toFixed(1)} MIN · {b.basePointsPg.toFixed(1)} PTS
                                  {b.empiricalGamesWithout >= 2 && b.empiricalPtsDelta !== null
                                    ? ` · Verificado sin bajas (${b.empiricalGamesWithout} PJ: ${formatSigned(b.empiricalPtsDelta, 1)} PTS)`
                                    : ''}
                                </div>
                              </div>
                            </div>
                            <div className="font-mono tabular-nums text-[11px] text-right shrink-0 whitespace-nowrap">
                              <span className="text-emerald-400 font-semibold">
                                +{b.projectedMinDelta.toFixed(1)}m
                              </span>
                              <span className="text-slate-500 mx-1">·</span>
                              <span className="text-orange-300">
                                +{b.projectedUsgDelta.toFixed(1)}%
                              </span>
                              <span className="text-slate-500 mx-1">·</span>
                              <span className="text-sky-300 font-semibold">
                                +{b.projectedPtsDelta.toFixed(1)} PTS
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )
      )}

      {/* TAB 2: TOP ROTATION OPPORTUNITIES */}
      {activeTab === 'beneficiaries' && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Radar de Absorción de Minutos, Usage % y Anotación
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Compañeros sanos mejor posicionados para ganar protagonismo ante las bajas actuales, combinando splits empíricos de 2026-27 y afinidad posicional.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap">
              {filteredBeneficiaries.length} oportunidades
            </span>
          </div>

          {filteredBeneficiaries.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              No se detectan oportunidades de rotación con los filtros actuales.
            </div>
          ) : (
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-left border-collapse">
                <thead className={STICKY_THEAD_CLASS}>
                  <tr className="text-xs text-slate-400">
                    <SortableTh
                      label="Jugador"
                      active={benSortKey === 'name'}
                      asc={benSortAsc}
                      onSort={() => toggleBenSort('name')}
                      align="left"
                      className="py-3 pl-4 pr-3"
                    />
                    <th className="py-3 px-2.5 text-left font-medium text-slate-400 whitespace-nowrap">
                      Baja que abre hueco
                    </th>
                    <SortableTh
                      label="MIN Base"
                      active={benSortKey === 'baseMinutesPg'}
                      asc={benSortAsc}
                      onSort={() => toggleBenSort('baseMinutesPg')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                    <SortableTh
                      label="+MIN Proy."
                      active={benSortKey === 'projectedMinDelta'}
                      asc={benSortAsc}
                      onSort={() => toggleBenSort('projectedMinDelta')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                    <SortableTh
                      label="+USG%"
                      active={benSortKey === 'projectedUsgDelta'}
                      asc={benSortAsc}
                      onSort={() => toggleBenSort('projectedUsgDelta')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                    <SortableTh
                      label="PTS Base"
                      active={benSortKey === 'basePointsPg'}
                      asc={benSortAsc}
                      onSort={() => toggleBenSort('basePointsPg')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                    <SortableTh
                      label="+PTS"
                      active={benSortKey === 'projectedPtsDelta'}
                      asc={benSortAsc}
                      onSort={() => toggleBenSort('projectedPtsDelta')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                    <th className="py-3 pl-2.5 pr-4 text-right font-medium text-slate-400 whitespace-nowrap">
                      Evidencia 26-27 sin bajas
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] text-sm">
                  {filteredBeneficiaries.map((b) => (
                    <tr
                      key={`${b.teamAbbr}:${b.playerId}`}
                      onClick={() => onInspectEntity('player', b.playerId)}
                      className="hover:bg-[#182338] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="flex items-center gap-2.5">
                          <PlayerAvatar
                            playerId={b.playerId}
                            name={b.name}
                            headshotUrl={b.headshotUrl}
                            teamAbbr={b.teamAbbr}
                            showTeamBadge
                            size="sm"
                          />
                          <div>
                            <div className="font-medium text-slate-100 whitespace-nowrap">
                              {b.name}
                            </div>
                            <div className="text-xs text-slate-400 whitespace-nowrap">
                              {b.teamAbbr} · {b.position} · {b.roleShiftLabel}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-xs text-slate-300">
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 max-w-[220px]">
                          {b.triggeredBy.map((tr, idx) => (
                            <span key={`${tr.name}-${idx}`} className="whitespace-nowrap">
                              {tr.name}{' '}
                              <span className="font-mono text-[10px] text-rose-300">
                                ({tr.shortTag})
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {b.baseMinutesPg.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-emerald-400 whitespace-nowrap">
                        +{b.projectedMinDelta.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-orange-300 whitespace-nowrap">
                        +{b.projectedUsgDelta.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {b.basePointsPg.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-sky-300 whitespace-nowrap">
                        +{b.projectedPtsDelta.toFixed(1)}
                      </td>
                      <td className="py-2.5 pl-2.5 pr-4 text-right text-xs font-mono tabular-nums whitespace-nowrap">
                        {b.empiricalGamesWithout >= 2 && b.empiricalMinDelta !== null ? (
                          <span className="text-emerald-300">
                            {b.empiricalGamesWithout} PJ ({formatSigned(b.empiricalMinDelta, 1)}m / {formatSigned(b.empiricalPtsDelta ?? 0, 1)} pts)
                          </span>
                        ) : (
                          <span className="text-slate-500">Modelo posicional</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FULL LEAGUE MEDICAL REPORT TABLE */}
      {activeTab === 'report' && (
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
          {filteredEntries.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              No hay jugadores en el parte médico con los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-auto max-h-[72vh]">
              <table className="w-full text-left border-collapse">
                <thead className={STICKY_THEAD_CLASS}>
                  <tr className="text-xs text-slate-400">
                    <th className="py-3 pl-4 pr-2 w-10 text-left font-medium">Seg.</th>
                    <SortableTh
                      label="Jugador"
                      active={reportSortKey === 'name'}
                      asc={reportSortAsc}
                      onSort={() => toggleReportSort('name')}
                      align="left"
                      className="py-3 px-3"
                    />
                    <SortableTh
                      label="Equipo"
                      active={reportSortKey === 'teamAbbr'}
                      asc={reportSortAsc}
                      onSort={() => toggleReportSort('teamAbbr')}
                      align="left"
                      className="py-3 px-2.5"
                    />
                    <SortableTh
                      label="Estado"
                      active={reportSortKey === 'status'}
                      asc={reportSortAsc}
                      onSort={() => toggleReportSort('status')}
                      align="left"
                      className="py-3 px-2.5"
                    />
                    <th className="py-3 px-2.5 text-left font-medium text-slate-400">
                      Detalle Médico y Regreso
                    </th>
                    <SortableTh
                      label="MIN"
                      active={reportSortKey === 'minutesPg'}
                      asc={reportSortAsc}
                      onSort={() => toggleReportSort('minutesPg')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                    <SortableTh
                      label="PTS"
                      active={reportSortKey === 'pointsPg'}
                      asc={reportSortAsc}
                      onSort={() => toggleReportSort('pointsPg')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                    <SortableTh
                      label="USG%"
                      active={reportSortKey === 'usgPct'}
                      asc={reportSortAsc}
                      onSort={() => toggleReportSort('usgPct')}
                      align="right"
                      className="py-3 px-2.5"
                    />
                    <SortableTh
                      label="Impacto"
                      active={reportSortKey === 'impactWeight'}
                      asc={reportSortAsc}
                      onSort={() => toggleReportSort('impactWeight')}
                      align="right"
                      className="py-3 pl-2.5 pr-4"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] text-sm">
                  {filteredEntries.map((item: InjuryPlayerReportItem) => {
                    const pKey = item.playerId ? `player:${item.playerId}` : null;
                    const watched = pKey ? watchlistIds.has(pKey) : false;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => {
                          if (item.playerId) onInspectEntity('player', item.playerId);
                          else if (item.teamId) onInspectEntity('team', item.teamId);
                        }}
                        className="hover:bg-[#182338] cursor-pointer transition-colors"
                      >
                        <td
                          className="py-2.5 pl-4 pr-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (pKey) onToggleWatchlist(pKey);
                          }}
                        >
                          {pKey ? (
                            <button
                              type="button"
                              aria-label="Alternar seguimiento"
                              className="p-1 rounded text-slate-400 hover:text-orange-400"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  watched ? 'fill-orange-400 text-orange-400' : ''
                                }`}
                              />
                            </button>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <PlayerAvatar
                              playerId={item.playerId || item.id}
                              name={item.name}
                              headshotUrl={item.headshotUrl}
                              teamAbbr={item.teamAbbr}
                              size="sm"
                            />
                            <div>
                              <div className="font-medium text-slate-100 whitespace-nowrap">
                                {item.name}
                              </div>
                              <div className="text-xs text-slate-400 whitespace-nowrap">
                                {item.position} · {item.gamesPlayed} PJ
                                {item.isStarter ? ' · Titular' : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200">
                            <TeamLogo abbr={item.teamAbbr} size="xs" />
                            <span>{item.teamAbbr}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <InjuryStatusBadge injury={item} />
                        </td>
                        <td className="py-2.5 px-2.5 text-xs text-slate-300 max-w-xs">
                          <div className="line-clamp-2">{item.detailEs}</div>
                          {item.returnDate && (
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                              Regreso est.: {item.returnDate}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                          {item.minutesPg > 0 ? item.minutesPg.toFixed(1) : '—'}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap">
                          {item.pointsPg > 0 ? item.pointsPg.toFixed(1) : '—'}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {item.usgPct > 0 ? `${item.usgPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2.5 pl-2.5 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={
                              item.impactWeight >= 45
                                ? 'text-rose-400 font-semibold'
                                : item.impactWeight >= 22
                                ? 'text-amber-300 font-semibold'
                                : 'text-slate-400'
                            }
                          >
                            {item.impactWeight.toFixed(0)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
