import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  Calendar,
  Crown,
  Flame,
  Loader2,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type {
  CareerHighEntry,
  CareerScope,
  CareerSeasonLine,
  PlayerCareerBucket,
  PlayerCareerProfile,
  TeamCareerHistory,
  TeamHistoricalSeason,
} from '../types/nba';
import { STICKY_THEAD_CLASS, sortRows, useTableSort } from '../utils/tableSort';
import { SortableTh } from './MetricUiHelpers';
import { TeamLogo } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import {
  buildSvgChartSnapshotBlob,
  buildTableSnapshotBlob,
  sanitizeExportFilename,
} from '../utils/exportImageCard';

interface CareerHistoryPanelProps {
  entityType: 'player' | 'team';
  entityId: string;
  entityName: string;
  teamAbbr?: string;
}

const playerCareerCache = new Map<string, PlayerCareerProfile>();
const teamCareerCache = new Map<string, TeamCareerHistory>();
const playerCareerInflight = new Map<string, Promise<PlayerCareerProfile | null>>();
const teamCareerInflight = new Map<string, Promise<TeamCareerHistory | null>>();

export interface CareerHighKpiBadge {
  key: string;
  shortLabel: string;
  badgeText: string;
  tooltip: string;
  currentFormatted: string;
  prevBestFormatted: string;
  prevBestSeason: string;
}

export async function fetchPlayerCareerProfileCached(
  playerId: string
): Promise<PlayerCareerProfile | null> {
  if (!playerId) return null;
  const cached = playerCareerCache.get(playerId);
  if (cached) return cached;
  const inflight = playerCareerInflight.get(playerId);
  if (inflight) return inflight;

  const req = fetch(`/api/nba/history/player/${encodeURIComponent(playerId)}`)
    .then(async (res) => {
      if (!res.ok) return null;
      const profile = (await res.json()) as PlayerCareerProfile;
      playerCareerCache.set(playerId, profile);
      return profile;
    })
    .catch(() => null)
    .finally(() => {
      playerCareerInflight.delete(playerId);
    });

  playerCareerInflight.set(playerId, req);
  return req;
}

export async function fetchTeamCareerHistoryCached(
  teamKey: string
): Promise<TeamCareerHistory | null> {
  if (!teamKey) return null;
  const cached = teamCareerCache.get(teamKey);
  if (cached) return cached;
  const inflight = teamCareerInflight.get(teamKey);
  if (inflight) return inflight;

  const req = fetch(`/api/nba/history/team/${encodeURIComponent(teamKey)}`)
    .then(async (res) => {
      if (!res.ok) return null;
      const hist = (await res.json()) as TeamCareerHistory;
      teamCareerCache.set(teamKey, hist);
      return hist;
    })
    .catch(() => null)
    .finally(() => {
      teamCareerInflight.delete(teamKey);
    });

  teamCareerInflight.set(teamKey, req);
  return req;
}

export function computeActivePlayerCareerHighKpis(
  profile: PlayerCareerProfile | null
): Record<string, CareerHighKpiBadge> {
  const out: Record<string, CareerHighKpiBadge> = {};
  if (!profile) return out;
  const seasons = profile.regular?.seasons || [];
  const current = seasons.find((s) => s.season === '2026-27');
  const priorAll = seasons.filter((s) => s.season !== '2026-27');
  if (!current || current.gp < 5 || priorAll.length === 0) return out;

  const priorQualified = priorAll.filter((s) => s.gp >= 10);
  const priorBase = priorQualified.length > 0 ? priorQualified : priorAll;

  const specs: Array<{
    key: string;
    shortLabel: string;
    decimals: number;
    suffix?: string;
    getVal: (s: CareerSeasonLine) => number;
    minCurOk?: (s: CareerSeasonLine) => boolean;
    priorFilter?: (s: CareerSeasonLine) => boolean;
  }> = [
    { key: 'basic_pts', shortLabel: 'PTS', decimals: 1, getVal: (s) => s.ptsPg },
    { key: 'basic_reb', shortLabel: 'REB', decimals: 1, getVal: (s) => s.rebPg },
    { key: 'basic_ast', shortLabel: 'AST', decimals: 1, getVal: (s) => s.astPg },
    { key: 'basic_stl', shortLabel: 'ROB', decimals: 1, getVal: (s) => s.stlPg },
    { key: 'basic_blk', shortLabel: 'TAP', decimals: 1, getVal: (s) => s.blkPg },
    {
      key: 'basic_fg3m',
      shortLabel: '3PM',
      decimals: 1,
      getVal: (s) => (s.gp > 0 ? s.fg3m / s.gp : 0),
    },
    { key: 'basic_min', shortLabel: 'MIN', decimals: 1, getVal: (s) => s.minPg },
    {
      key: 'basic_pra',
      shortLabel: 'PRA',
      decimals: 1,
      getVal: (s) => s.ptsPg + s.rebPg + s.astPg,
    },
    {
      key: 'basic_stocks',
      shortLabel: 'ROB+TAP',
      decimals: 1,
      getVal: (s) => s.stlPg + s.blkPg,
    },
    {
      key: 'basic_fgPct',
      shortLabel: 'TC%',
      decimals: 1,
      suffix: '%',
      getVal: (s) => s.fgPct,
      minCurOk: (s) => s.fga >= 30,
      priorFilter: (s) => s.fga >= 30,
    },
    {
      key: 'basic_fg3Pct',
      shortLabel: 'T3%',
      decimals: 1,
      suffix: '%',
      getVal: (s) => s.fg3Pct,
      minCurOk: (s) => s.fg3a >= 15,
      priorFilter: (s) => s.fg3a >= 15,
    },
    {
      key: 'basic_ftPct',
      shortLabel: 'TL%',
      decimals: 1,
      suffix: '%',
      getVal: (s) => s.ftPct,
      minCurOk: (s) => s.fta >= 15,
      priorFilter: (s) => s.fta >= 15,
    },
    {
      key: 'adv_tsPct',
      shortLabel: 'TS%',
      decimals: 1,
      suffix: '%',
      getVal: (s) => s.tsPct,
      minCurOk: (s) => s.fga >= 30,
      priorFilter: (s) => s.fga >= 30,
    },
    {
      key: 'adv_efgPct',
      shortLabel: 'eFG%',
      decimals: 1,
      suffix: '%',
      getVal: (s) => s.efgPct,
      minCurOk: (s) => s.fga >= 30,
      priorFilter: (s) => s.fga >= 30,
    },
    { key: 'adv_gmSc', shortLabel: 'GmSc', decimals: 1, getVal: (s) => s.gmScPg },
  ];

  for (const sp of specs) {
    if (sp.minCurOk && !sp.minCurOk(current)) continue;
    const curVal = sp.getVal(current);
    if (!Number.isFinite(curVal) || curVal <= 0) continue;

    const pool = sp.priorFilter ? priorBase.filter(sp.priorFilter) : priorBase;
    if (pool.length === 0) continue;

    let bestPrior: CareerSeasonLine | null = null;
    let bestPriorVal = -Infinity;
    for (const s of pool) {
      const v = sp.getVal(s);
      if (Number.isFinite(v) && v > bestPriorVal) {
        bestPriorVal = v;
        bestPrior = s;
      }
    }
    if (!bestPrior || bestPriorVal <= 0) continue;

    const curRounded = Number(curVal.toFixed(sp.decimals));
    const prevRounded = Number(bestPriorVal.toFixed(sp.decimals));
    if (curRounded >= prevRounded && curVal >= bestPriorVal - 0.005) {
      const suf = sp.suffix || '';
      const currentFormatted = `${curVal.toFixed(sp.decimals)}${suf}`;
      const prevBestFormatted = `${bestPriorVal.toFixed(sp.decimals)}${suf}`;
      const verb = curRounded > prevRounded ? 'Supera' : 'Iguala';
      out[sp.key] = {
        key: sp.key,
        shortLabel: sp.shortLabel,
        badgeText: 'Career High',
        currentFormatted,
        prevBestFormatted,
        prevBestSeason: bestPrior.season,
        tooltip: `En ritmo de Career High 2026-27 (${currentFormatted}). ${verb} su anterior mejor curso: ${prevBestFormatted} en ${bestPrior.season} (${bestPrior.gp} PJ).`,
      };
    }
  }

  return out;
}

export function computeActiveTeamCareerHighKpis(
  history: TeamCareerHistory | null
): Record<string, CareerHighKpiBadge> {
  const out: Record<string, CareerHighKpiBadge> = {};
  if (!history) return out;
  const seasons = history.regularSeasons || [];
  const current = seasons.find((s) => s.season === '2026-27');
  const priorAll = seasons.filter((s) => s.season !== '2026-27');
  if (!current || current.gp < 5 || priorAll.length === 0) return out;

  const specs: Array<{
    key: string;
    shortLabel: string;
    decimals: number;
    suffix?: string;
    getVal: (s: TeamHistoricalSeason) => number;
  }> = [
    { key: 'basic_winPct', shortLabel: '%V', decimals: 1, suffix: '%', getVal: (s) => s.winPct * 100 },
    { key: 'basic_pts', shortLabel: 'PTS', decimals: 1, getVal: (s) => s.ptsPg },
    { key: 'basic_reb', shortLabel: 'REB', decimals: 1, getVal: (s) => s.rebPg },
    { key: 'basic_ast', shortLabel: 'AST', decimals: 1, getVal: (s) => s.astPg },
    { key: 'basic_stl', shortLabel: 'ROB', decimals: 1, getVal: (s) => s.stlPg },
    { key: 'basic_blk', shortLabel: 'TAP', decimals: 1, getVal: (s) => s.blkPg },
    { key: 'basic_fgPct', shortLabel: 'TC%', decimals: 1, suffix: '%', getVal: (s) => s.fgPct },
    { key: 'basic_fg3Pct', shortLabel: 'T3%', decimals: 1, suffix: '%', getVal: (s) => s.fg3Pct },
    { key: 'basic_ftPct', shortLabel: 'TL%', decimals: 1, suffix: '%', getVal: (s) => s.ftPct },
  ];

  for (const sp of specs) {
    const curVal = sp.getVal(current);
    if (!Number.isFinite(curVal) || curVal <= 0) continue;

    let bestPrior: TeamHistoricalSeason | null = null;
    let bestPriorVal = -Infinity;
    for (const s of priorAll) {
      const v = sp.getVal(s);
      if (Number.isFinite(v) && v > 0 && v > bestPriorVal) {
        bestPriorVal = v;
        bestPrior = s;
      }
    }
    if (!bestPrior || bestPriorVal <= 0) continue;

    const curRounded = Number(curVal.toFixed(sp.decimals));
    const prevRounded = Number(bestPriorVal.toFixed(sp.decimals));
    if (curRounded >= prevRounded && curVal >= bestPriorVal - 0.005) {
      const suf = sp.suffix || '';
      const currentFormatted = `${curVal.toFixed(sp.decimals)}${suf}`;
      const prevBestFormatted = `${bestPriorVal.toFixed(sp.decimals)}${suf}`;
      const verb = curRounded > prevRounded ? 'Supera' : 'Iguala';
      out[sp.key] = {
        key: sp.key,
        shortLabel: sp.shortLabel,
        badgeText: 'Récord Hist.',
        currentFormatted,
        prevBestFormatted,
        prevBestSeason: bestPrior.season,
        tooltip: `En ritmo de récord histórico de franquicia en 2026-27 (${currentFormatted}). ${verb} la anterior mejor marca: ${prevBestFormatted} en ${bestPrior.season}.`,
      };
    }
  }

  return out;
}

type PlayerChartMetricKey =
  | 'ptsPg'
  | 'rebPg'
  | 'astPg'
  | 'praPg'
  | 'fg3mPg'
  | 'stlPg'
  | 'blkPg'
  | 'tovPg'
  | 'minPg'
  | 'tsPct'
  | 'efgPct'
  | 'fgPct'
  | 'fg3Pct'
  | 'ftPct'
  | 'gmScPg'
  | 'astToRatio'
  | 'winPct'
  | 'gp'
  | 'dd2'
  | 'td3'
  | 'ptsTotal';

type TeamChartMetricKey =
  | 'winPct'
  | 'wins'
  | 'losses'
  | 'poWins'
  | 'confRank'
  | 'ptsPg'
  | 'rebPg'
  | 'astPg'
  | 'stlPg'
  | 'blkPg'
  | 'fgPct'
  | 'fg3Pct'
  | 'ftPct'
  | 'ptsTotal';

interface PlayerChartMetricSpec {
  key: PlayerChartMetricKey;
  label: string;
  fullLabel: string;
  group: 'Producción (PJ)' | 'Tiro y Eficiencia' | 'Impacto y Volumen';
  unit: string;
  decimals: number;
  quick?: boolean;
  refLabel: string;
  getSeasonValue: (s: CareerSeasonLine) => number;
  getCareerRefValue: (b: PlayerCareerBucket) => number;
}

interface TeamChartMetricSpec {
  key: TeamChartMetricKey;
  label: string;
  fullLabel: string;
  group: 'Resultados y Playoffs' | 'Ataque y Producción' | 'Defensa y Tiro';
  unit: string;
  decimals: number;
  quick?: boolean;
  invertAxis?: boolean;
  skipZeroHistory?: boolean;
  getSeasonValue: (s: TeamHistoricalSeason) => number | null;
}

const PLAYER_CHART_METRICS: PlayerChartMetricSpec[] = [
  {
    key: 'ptsPg',
    label: 'PTS/PJ',
    fullLabel: 'Puntos por partido (PTS/PJ)',
    group: 'Producción (PJ)',
    unit: 'PTS',
    decimals: 1,
    quick: true,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.ptsPg,
    getCareerRefValue: (b) => b.averages.ptsPg,
  },
  {
    key: 'rebPg',
    label: 'REB/PJ',
    fullLabel: 'Rebotes por partido (REB/PJ)',
    group: 'Producción (PJ)',
    unit: 'REB',
    decimals: 1,
    quick: true,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.rebPg,
    getCareerRefValue: (b) => b.averages.rebPg,
  },
  {
    key: 'astPg',
    label: 'AST/PJ',
    fullLabel: 'Asistencias por partido (AST/PJ)',
    group: 'Producción (PJ)',
    unit: 'AST',
    decimals: 1,
    quick: true,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.astPg,
    getCareerRefValue: (b) => b.averages.astPg,
  },
  {
    key: 'praPg',
    label: 'PRA/PJ',
    fullLabel: 'Combo PTS + REB + AST por partido',
    group: 'Producción (PJ)',
    unit: 'PRA',
    decimals: 1,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.ptsPg + s.rebPg + s.astPg,
    getCareerRefValue: (b) => b.averages.ptsPg + b.averages.rebPg + b.averages.astPg,
  },
  {
    key: 'fg3mPg',
    label: '3PM/PJ',
    fullLabel: 'Triples anotados por partido (3PM/PJ)',
    group: 'Producción (PJ)',
    unit: '3PM',
    decimals: 1,
    quick: true,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => (s.gp > 0 ? s.fg3m / s.gp : 0),
    getCareerRefValue: (b) => (b.totals.gp > 0 ? b.totals.fg3m / b.totals.gp : 0),
  },
  {
    key: 'stlPg',
    label: 'ROB/PJ',
    fullLabel: 'Robos por partido (ROB/PJ)',
    group: 'Producción (PJ)',
    unit: 'ROB',
    decimals: 1,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.stlPg,
    getCareerRefValue: (b) => b.averages.stlPg,
  },
  {
    key: 'blkPg',
    label: 'TAP/PJ',
    fullLabel: 'Tapones por partido (TAP/PJ)',
    group: 'Producción (PJ)',
    unit: 'TAP',
    decimals: 1,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.blkPg,
    getCareerRefValue: (b) => b.averages.blkPg,
  },
  {
    key: 'tovPg',
    label: 'PER/PJ',
    fullLabel: 'Pérdidas por partido (PER/PJ)',
    group: 'Producción (PJ)',
    unit: 'PER',
    decimals: 1,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.tovPg,
    getCareerRefValue: (b) => b.averages.tovPg,
  },
  {
    key: 'minPg',
    label: 'MIN/PJ',
    fullLabel: 'Minutos por partido (MIN/PJ)',
    group: 'Producción (PJ)',
    unit: 'MIN',
    decimals: 1,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.minPg,
    getCareerRefValue: (b) => b.averages.minPg,
  },
  {
    key: 'tsPct',
    label: 'TS%',
    fullLabel: 'True Shooting % (TS%)',
    group: 'Tiro y Eficiencia',
    unit: '%',
    decimals: 1,
    quick: true,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.tsPct,
    getCareerRefValue: (b) => b.averages.tsPct,
  },
  {
    key: 'efgPct',
    label: 'eFG%',
    fullLabel: 'Tiros de Campo Efectivos % (eFG%)',
    group: 'Tiro y Eficiencia',
    unit: '%',
    decimals: 1,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.efgPct,
    getCareerRefValue: (b) => b.averages.efgPct,
  },
  {
    key: 'fgPct',
    label: 'TC%',
    fullLabel: 'Porcentaje Tiros de Campo (TC%)',
    group: 'Tiro y Eficiencia',
    unit: '%',
    decimals: 1,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.fgPct,
    getCareerRefValue: (b) => b.averages.fgPct,
  },
  {
    key: 'fg3Pct',
    label: 'T3%',
    fullLabel: 'Porcentaje de Triples (T3%)',
    group: 'Tiro y Eficiencia',
    unit: '%',
    decimals: 1,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.fg3Pct,
    getCareerRefValue: (b) => b.averages.fg3Pct,
  },
  {
    key: 'ftPct',
    label: 'TL%',
    fullLabel: 'Porcentaje Tiros Libres (TL%)',
    group: 'Tiro y Eficiencia',
    unit: '%',
    decimals: 1,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.ftPct,
    getCareerRefValue: (b) => b.averages.ftPct,
  },
  {
    key: 'gmScPg',
    label: 'GmSc',
    fullLabel: 'Game Score medio por partido',
    group: 'Impacto y Volumen',
    unit: 'GmSc',
    decimals: 1,
    quick: true,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => s.gmScPg,
    getCareerRefValue: (b) => b.averages.gmScPg,
  },
  {
    key: 'astToRatio',
    label: 'AST/PER',
    fullLabel: 'Ratio Asistencias / Pérdidas (AST/PER)',
    group: 'Impacto y Volumen',
    unit: 'x',
    decimals: 2,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => (s.tov > 0 ? s.ast / s.tov : s.astPg),
    getCareerRefValue: (b) => (b.totals.tov > 0 ? b.totals.ast / b.totals.tov : b.averages.astPg),
  },
  {
    key: 'winPct',
    label: '% Vict.',
    fullLabel: '% Victorias en partidos disputados',
    group: 'Impacto y Volumen',
    unit: '%',
    decimals: 1,
    refLabel: 'Media carrera',
    getSeasonValue: (s) => (s.gp > 0 ? (s.wins / s.gp) * 100 : 0),
    getCareerRefValue: (b) => b.averages.winPct * 100,
  },
  {
    key: 'gp',
    label: 'PJ',
    fullLabel: 'Partidos Jugados por temporada (PJ)',
    group: 'Impacto y Volumen',
    unit: 'PJ',
    decimals: 0,
    refLabel: 'Media/temp.',
    getSeasonValue: (s) => s.gp,
    getCareerRefValue: (b) => (b.seasons.length > 0 ? b.totals.gp / b.seasons.length : 0),
  },
  {
    key: 'dd2',
    label: 'DD',
    fullLabel: 'Dobles-Dobles por temporada (DD)',
    group: 'Impacto y Volumen',
    unit: 'DD',
    decimals: 0,
    refLabel: 'Media/temp.',
    getSeasonValue: (s) => s.dd2,
    getCareerRefValue: (b) => (b.seasons.length > 0 ? b.totals.dd2 / b.seasons.length : 0),
  },
  {
    key: 'td3',
    label: 'TD',
    fullLabel: 'Triples-Dobles por temporada (TD)',
    group: 'Impacto y Volumen',
    unit: 'TD',
    decimals: 0,
    refLabel: 'Media/temp.',
    getSeasonValue: (s) => s.td3,
    getCareerRefValue: (b) => (b.seasons.length > 0 ? b.totals.td3 / b.seasons.length : 0),
  },
  {
    key: 'ptsTotal',
    label: 'PTS Tot.',
    fullLabel: 'Puntos Totales acumulados en el curso',
    group: 'Impacto y Volumen',
    unit: 'PTS',
    decimals: 0,
    refLabel: 'Media/temp.',
    getSeasonValue: (s) => s.pts,
    getCareerRefValue: (b) => (b.seasons.length > 0 ? b.totals.pts / b.seasons.length : 0),
  },
];

const TEAM_CHART_METRICS: TeamChartMetricSpec[] = [
  {
    key: 'winPct',
    label: '% Victorias',
    fullLabel: 'Porcentaje de Victorias (%V)',
    group: 'Resultados y Playoffs',
    unit: '%',
    decimals: 1,
    quick: true,
    getSeasonValue: (s) => s.winPct * 100,
  },
  {
    key: 'wins',
    label: 'Victorias',
    fullLabel: 'Victorias en Temporada Regular (V)',
    group: 'Resultados y Playoffs',
    unit: 'V',
    decimals: 0,
    quick: true,
    getSeasonValue: (s) => s.wins,
  },
  {
    key: 'losses',
    label: 'Derrotas',
    fullLabel: 'Derrotas en Temporada Regular (D)',
    group: 'Resultados y Playoffs',
    unit: 'D',
    decimals: 0,
    getSeasonValue: (s) => s.losses,
  },
  {
    key: 'poWins',
    label: 'Vict. PO',
    fullLabel: 'Victorias en Playoffs por curso',
    group: 'Resultados y Playoffs',
    unit: 'V PO',
    decimals: 0,
    quick: true,
    getSeasonValue: (s) => s.poWins,
  },
  {
    key: 'confRank',
    label: 'Pos. Conf.',
    fullLabel: 'Posición en Conferencia (1º arriba)',
    group: 'Resultados y Playoffs',
    unit: 'º',
    decimals: 0,
    invertAxis: true,
    getSeasonValue: (s) => (s.confRank && s.confRank > 0 ? s.confRank : null),
  },
  {
    key: 'ptsPg',
    label: 'PTS/PJ',
    fullLabel: 'Puntos por partido (PTS/PJ)',
    group: 'Ataque y Producción',
    unit: 'PTS',
    decimals: 1,
    quick: true,
    skipZeroHistory: true,
    getSeasonValue: (s) => (s.ptsPg > 0 ? s.ptsPg : null),
  },
  {
    key: 'rebPg',
    label: 'REB/PJ',
    fullLabel: 'Rebotes por partido (REB/PJ)',
    group: 'Ataque y Producción',
    unit: 'REB',
    decimals: 1,
    skipZeroHistory: true,
    getSeasonValue: (s) => (s.rebPg > 0 ? s.rebPg : null),
  },
  {
    key: 'astPg',
    label: 'AST/PJ',
    fullLabel: 'Asistencias por partido (AST/PJ)',
    group: 'Ataque y Producción',
    unit: 'AST',
    decimals: 1,
    skipZeroHistory: true,
    getSeasonValue: (s) => (s.astPg > 0 ? s.astPg : null),
  },
  {
    key: 'ptsTotal',
    label: 'PTS Tot.',
    fullLabel: 'Puntos Totales de la Temporada',
    group: 'Ataque y Producción',
    unit: 'PTS',
    decimals: 0,
    skipZeroHistory: true,
    getSeasonValue: (s) => (s.ptsTotal > 0 ? s.ptsTotal : null),
  },
  {
    key: 'stlPg',
    label: 'ROB/PJ',
    fullLabel: 'Robos por partido (ROB/PJ)',
    group: 'Defensa y Tiro',
    unit: 'ROB',
    decimals: 1,
    skipZeroHistory: true,
    getSeasonValue: (s) => (s.stlPg > 0 ? s.stlPg : null),
  },
  {
    key: 'blkPg',
    label: 'TAP/PJ',
    fullLabel: 'Tapones por partido (TAP/PJ)',
    group: 'Defensa y Tiro',
    unit: 'TAP',
    decimals: 1,
    skipZeroHistory: true,
    getSeasonValue: (s) => (s.blkPg > 0 ? s.blkPg : null),
  },
  {
    key: 'fgPct',
    label: 'TC%',
    fullLabel: 'Porcentaje Tiros de Campo (TC%)',
    group: 'Defensa y Tiro',
    unit: '%',
    decimals: 1,
    skipZeroHistory: true,
    getSeasonValue: (s) => (s.fgPct > 0 ? s.fgPct : null),
  },
  {
    key: 'fg3Pct',
    label: 'T3%',
    fullLabel: 'Porcentaje de Triples (T3%)',
    group: 'Defensa y Tiro',
    unit: '%',
    decimals: 1,
    quick: true,
    skipZeroHistory: true,
    getSeasonValue: (s) => (s.fg3Pct > 0 ? s.fg3Pct : null),
  },
  {
    key: 'ftPct',
    label: 'TL%',
    fullLabel: 'Porcentaje Tiros Libres (TL%)',
    group: 'Defensa y Tiro',
    unit: '%',
    decimals: 1,
    skipZeroHistory: true,
    getSeasonValue: (s) => (s.ftPct > 0 ? s.ftPct : null),
  },
];

const PLAYER_CHART_GROUPS: Array<PlayerChartMetricSpec['group']> = [
  'Producción (PJ)',
  'Tiro y Eficiencia',
  'Impacto y Volumen',
];

const TEAM_CHART_GROUPS: Array<TeamChartMetricSpec['group']> = [
  'Resultados y Playoffs',
  'Ataque y Producción',
  'Defensa y Tiro',
];

function formatMetricValue(val: number, decimals: number, unit: string): string {
  if (unit === 'º') return `${Math.round(val)}º`;
  if (decimals === 0) return Math.round(val).toLocaleString('es-ES');
  return val.toFixed(decimals);
}

function formatInt(val: number): string {
  return Math.round(val || 0).toLocaleString('es-ES');
}

function formatDateEs(iso: string): string {
  if (!iso || iso.length < 10) return iso || '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatFinalsTag(raw: string): { text: string; isChamp: boolean; isFinals: boolean } {
  const up = String(raw || '').toUpperCase().trim();
  if (!up || up === 'N/A') return { text: '—', isChamp: false, isFinals: false };
  if (up.includes('CHAMPION')) return { text: 'Campeón NBA', isChamp: true, isFinals: true };
  if (up.includes('FINALS') || up.includes('APPEARANCE')) {
    return { text: 'Finales NBA', isChamp: false, isFinals: true };
  }
  return { text: raw, isChamp: false, isFinals: false };
}

export function CareerHistoryPanel({
  entityType,
  entityId,
  entityName,
  teamAbbr,
}: CareerHistoryPanelProps) {
  const [scope, setScope] = useState<CareerScope>('regular');
  const [playerData, setPlayerData] = useState<PlayerCareerProfile | null>(() =>
    entityType === 'player' ? playerCareerCache.get(entityId) ?? null : null
  );
  const [teamData, setTeamData] = useState<TeamCareerHistory | null>(() =>
    entityType === 'team' ? teamCareerCache.get(entityId) ?? null : null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [playerChartMetric, setPlayerChartMetric] = useState<PlayerChartMetricKey>('ptsPg');
  const [teamChartMetric, setTeamChartMetric] = useState<TeamChartMetricKey>('winPct');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [highsMode, setHighsMode] = useState<'absolute' | 'relative'>('absolute');
  const [tableMode, setTableMode] = useState<'relative' | 'absolute'>('relative');

  const chartSvgRef = useRef<SVGSVGElement | null>(null);

  const playerSort = useTableSort<
    | 'season'
    | 'teamAbbr'
    | 'gp'
    | 'minPg'
    | 'ptsPg'
    | 'rebPg'
    | 'astPg'
    | 'stlPg'
    | 'blkPg'
    | 'fgPct'
    | 'fg3Pct'
    | 'ftPct'
    | 'tsPct'
    | 'gmScPg'
  >('season', false, ['season', 'teamAbbr']);

  const teamSort = useTableSort<
    | 'season'
    | 'gp'
    | 'wins'
    | 'winPct'
    | 'confRank'
    | 'ptsPg'
    | 'rebPg'
    | 'astPg'
    | 'fgPct'
    | 'fg3Pct'
    | 'poWins'
  >('season', false, ['season']);

  useEffect(() => {
    setHoveredIdx(null);
    let cancelled = false;

    if (entityType === 'player') {
      const cached = playerCareerCache.get(entityId);
      if (cached) {
        setPlayerData(cached);
        setTeamData(null);
        setErrorMsg(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg(null);
      setPlayerData(null);
      setTeamData(null);
      fetch(`/api/nba/history/player/${encodeURIComponent(entityId)}`)
        .then(async (res) => {
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || 'No se pudo cargar el histórico del jugador.');
          }
          return res.json() as Promise<PlayerCareerProfile>;
        })
        .then((profile) => {
          if (cancelled) return;
          playerCareerCache.set(entityId, profile);
          setPlayerData(profile);
        })
        .catch((err) => {
          if (cancelled) return;
          setErrorMsg(err?.message || 'Error al cargar trayectoria histórica.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      const lookupKey = teamAbbr || entityId;
      const cached = teamCareerCache.get(lookupKey);
      if (cached) {
        setTeamData(cached);
        setPlayerData(null);
        setErrorMsg(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg(null);
      setTeamData(null);
      setPlayerData(null);
      fetch(`/api/nba/history/team/${encodeURIComponent(lookupKey)}`)
        .then(async (res) => {
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || 'No se pudo cargar el historial de la franquicia.');
          }
          return res.json() as Promise<TeamCareerHistory>;
        })
        .then((hist) => {
          if (cancelled) return;
          teamCareerCache.set(lookupKey, hist);
          setTeamData(hist);
        })
        .catch((err) => {
          if (cancelled) return;
          setErrorMsg(err?.message || 'Error al cargar historial de franquicia.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, teamAbbr]);

  // Derived Player data
  const activePlayerBucket = useMemo(() => {
    if (!playerData) return null;
    return scope === 'playoffs' ? playerData.playoffs : playerData.regular;
  }, [playerData, scope]);

  const sortedPlayerSeasons = useMemo(() => {
    const rows = activePlayerBucket?.seasons || [];
    const key = playerSort.sortKey || 'season';
    const isAbs = tableMode === 'absolute';
    return sortRows(
      rows,
      (row) => {
        switch (key) {
          case 'season':
            return row.season;
          case 'teamAbbr':
            return row.teamAbbr;
          case 'gp':
            return row.gp;
          case 'minPg':
            return isAbs ? row.min : row.minPg;
          case 'ptsPg':
            return isAbs ? row.pts : row.ptsPg;
          case 'rebPg':
            return isAbs ? row.reb : row.rebPg;
          case 'astPg':
            return isAbs ? row.ast : row.astPg;
          case 'stlPg':
            return isAbs ? row.stl : row.stlPg;
          case 'blkPg':
            return isAbs ? row.blk : row.blkPg;
          case 'fgPct':
            return isAbs ? row.fgm : row.fgPct;
          case 'fg3Pct':
            return isAbs ? row.fg3m : row.fg3Pct;
          case 'ftPct':
            return isAbs ? row.ftm : row.ftPct;
          case 'tsPct':
            return isAbs ? row.dd2 : row.tsPct;
          case 'gmScPg':
            return isAbs ? row.td3 : row.gmScPg;
          default:
            return row.season;
        }
      },
      playerSort.sortAsc
    );
  }, [activePlayerBucket, playerSort.sortKey, playerSort.sortAsc, tableMode]);

  // Derived Team data
  const activeTeamSeasons = useMemo(() => {
    if (!teamData) return [];
    return scope === 'playoffs' ? teamData.playoffSeasons : teamData.regularSeasons;
  }, [teamData, scope]);

  const sortedTeamSeasons = useMemo(() => {
    const key = teamSort.sortKey || 'season';
    const isAbs = tableMode === 'absolute';
    return sortRows(
      activeTeamSeasons,
      (row) => {
        switch (key) {
          case 'season':
            return row.season;
          case 'gp':
            return row.gp;
          case 'wins':
            return row.wins;
          case 'winPct':
            return row.winPct;
          case 'confRank':
            return row.confRank ?? 99;
          case 'ptsPg':
            return isAbs ? row.ptsTotal : row.ptsPg;
          case 'rebPg':
            return isAbs ? Math.round(row.rebPg * row.gp) : row.rebPg;
          case 'astPg':
            return isAbs ? Math.round(row.astPg * row.gp) : row.astPg;
          case 'fgPct':
            return row.fgPct;
          case 'fg3Pct':
            return row.fg3Pct;
          case 'poWins':
            return row.poWins;
          default:
            return row.season;
        }
      },
      teamSort.sortAsc
    );
  }, [activeTeamSeasons, teamSort.sortKey, teamSort.sortAsc, tableMode]);

  // Export handlers
  const handleExportPlayerTable = async () => {
    if (!playerData || !activePlayerBucket) {
      throw new Error('Sin datos de trayectoria');
    }
    const scopeLabel = scope === 'playoffs' ? 'Playoffs' : 'Temporada Regular';
    const peak = activePlayerBucket.peakSeason;
    const highs = activePlayerBucket.careerHighs;
    const verdictParts: string[] = [];
    verdictParts.push(
      `${playerData.name} acumula ${formatInt(activePlayerBucket.totals.pts)} PTS, ${formatInt(
        activePlayerBucket.totals.reb
      )} REB y ${formatInt(activePlayerBucket.totals.ast)} AST en ${formatInt(
        activePlayerBucket.totals.gp
      )} PJ de ${scopeLabel}`
    );
    if (peak) {
      verdictParts.push(
        `con su pico en ${peak.season} (${peak.ptsPg.toFixed(1)}/${peak.rebPg.toFixed(
          1
        )}/${peak.astPg.toFixed(1)} · ${peak.tsPct.toFixed(1)}% TS)`
      );
    }
    if (highs.pts) {
      verdictParts.push(
        `y tope histórico de ${highs.pts.value} PTS (${highs.pts.season} vs ${highs.pts.opponentAbbr}).`
      );
    }

    return buildTableSnapshotBlob({
      filename: `${sanitizeExportFilename(playerData.name)}_trayectoria_${scope}.png`,
      categoryTag: `TRAYECTORIA NBA · ${scopeLabel.toUpperCase()}`,
      title: `${playerData.name} — Evolución Año a Año`,
      subtitle: `${activePlayerBucket.totals.seasonsCount} temporadas (${playerData.rookieSeason}–${playerData.latestSeason}) · ${formatInt(activePlayerBucket.totals.gp)} PJ`,
      entityColumnLabel: 'Temporada',
      showRank: false,
      kpis: [
        {
          label: 'Puntos Carrera',
          value: formatInt(activePlayerBucket.totals.pts),
          sublabel: `${activePlayerBucket.averages.ptsPg.toFixed(1)} PTS/PJ`,
          tone: 'accent',
        },
        {
          label: 'Career High PTS',
          value: highs.pts ? `${highs.pts.value}` : '—',
          sublabel: highs.pts ? `${highs.pts.season} vs ${highs.pts.opponentAbbr}` : '',
          tone: 'positive',
        },
        {
          label: 'Eficiencia TS%',
          value: `${activePlayerBucket.averages.tsPct.toFixed(1)}%`,
          sublabel: `${activePlayerBucket.averages.fgPct.toFixed(1)}% TC · ${activePlayerBucket.averages.fg3Pct.toFixed(1)}% T3`,
          tone: 'sky',
        },
        {
          label: 'Mejor Curso (Peak)',
          value: peak ? peak.season : '—',
          sublabel: peak ? `${peak.ptsPg.toFixed(1)}P / ${peak.rebPg.toFixed(1)}R / ${peak.astPg.toFixed(1)}A` : '',
          tone: 'warning',
        },
      ],
      columns: [
        { key: 'gp', label: 'PJ', align: 'right', widthWeight: 0.7 },
        { key: 'min', label: 'MIN', align: 'right', widthWeight: 0.8 },
        { key: 'pts', label: 'PTS', align: 'right', widthWeight: 0.9 },
        { key: 'reb', label: 'REB', align: 'right', widthWeight: 0.8 },
        { key: 'ast', label: 'AST', align: 'right', widthWeight: 0.8 },
        { key: 'ts', label: 'TS%', align: 'right', widthWeight: 0.9 },
        { key: 'gmsc', label: 'GmSc', align: 'right', widthWeight: 0.9 },
      ],
      rows: [...activePlayerBucket.seasons].reverse().slice(0, 18).map((s) => ({
        teamAbbr: s.teamAbbr,
        entityName: `${s.season}${peak && peak.season === s.season ? ' ★' : ''}`,
        entitySubtext: `${s.teamAbbr} · ${s.wins}-${s.losses}`,
        cells: {
          gp: String(s.gp),
          min: s.minPg.toFixed(1),
          pts: { text: s.ptsPg.toFixed(1), tone: peak && peak.season === s.season ? 'accent' : 'neutral' },
          reb: s.rebPg.toFixed(1),
          ast: s.astPg.toFixed(1),
          ts: `${s.tsPct.toFixed(1)}%`,
          gmsc: s.gmScPg.toFixed(1),
        },
      })),
      editorialVerdict: verdictParts.join(', '),
      editorialVerdictTone: 'accent',
    });
  };

  const handleExportTeamTable = async () => {
    if (!teamData) throw new Error('Sin datos de franquicia');
    const scopeLabel = scope === 'playoffs' ? 'Playoffs' : 'Temporada Regular';
    const seasonsSlice = [...activeTeamSeasons].reverse().slice(0, 18);
    const verdict = `${teamData.teamName} suma ${formatInt(teamData.allTimeWins)}-${formatInt(
      teamData.allTimeLosses
    )} (${(teamData.allTimeWinPct * 100).toFixed(1)}%) en ${teamData.totalYears} temporadas NBA, con ${
      teamData.championships
    } anillos y ${teamData.playoffAppearances} presencias en Playoffs${
      teamData.bestSeason
        ? ` (mejor campaña: ${teamData.bestSeason.season} con ${teamData.bestSeason.wins}-${teamData.bestSeason.losses}).`
        : '.'
    }`;

    return buildTableSnapshotBlob({
      filename: `${sanitizeExportFilename(teamData.teamAbbr)}_historia_${scope}.png`,
      categoryTag: `HISTORIAL DE FRANQUICIA · ${scopeLabel.toUpperCase()}`,
      title: `${teamData.teamName} — Trayectoria Histórica`,
      subtitle: `${teamData.startYear}–${teamData.endYear} · ${teamData.totalYears} temporadas NBA`,
      entityColumnLabel: 'Temporada',
      showRank: false,
      kpis: [
        {
          label: 'Balance Histórico',
          value: `${formatInt(teamData.allTimeWins)}-${formatInt(teamData.allTimeLosses)}`,
          sublabel: `${(teamData.allTimeWinPct * 100).toFixed(1)}% victorias`,
          tone: 'accent',
        },
        {
          label: 'Anillos NBA',
          value: String(teamData.championships),
          sublabel: `${teamData.confTitles} títulos conferencia`,
          tone: 'warning',
        },
        {
          label: 'Playoffs',
          value: String(teamData.playoffAppearances),
          sublabel: `de ${teamData.totalYears} cursos`,
          tone: 'sky',
        },
        {
          label: 'Mejor Curso',
          value: teamData.bestSeason ? teamData.bestSeason.season : '—',
          sublabel: teamData.bestSeason
            ? `${teamData.bestSeason.wins}-${teamData.bestSeason.losses}`
            : '',
          tone: 'positive',
        },
      ],
      columns: [
        { key: 'rec', label: 'V-D', align: 'right', widthWeight: 1.0 },
        { key: 'pct', label: '%V', align: 'right', widthWeight: 0.85 },
        { key: 'pts', label: 'PTS', align: 'right', widthWeight: 0.85 },
        { key: 'reb', label: 'REB', align: 'right', widthWeight: 0.8 },
        { key: 'ast', label: 'AST', align: 'right', widthWeight: 0.8 },
        { key: 'po', label: 'Playoffs', align: 'right', widthWeight: 1.1 },
      ],
      rows: seasonsSlice.map((s) => {
        const fin = formatFinalsTag(s.finalsAppearance);
        const poStr =
          fin.isChamp
            ? 'Campeón ★'
            : fin.isFinals
            ? 'Finales'
            : s.poWins + s.poLosses > 0
            ? `${s.poWins}-${s.poLosses}`
            : '—';
        return {
          teamAbbr: teamData.teamAbbr,
          entityName: s.season,
          entitySubtext: s.confRank ? `${s.confRank}º Conf.` : `${s.gp} PJ`,
          cells: {
            rec: `${s.wins}-${s.losses}`,
            pct: `${(s.winPct * 100).toFixed(1)}%`,
            pts: s.ptsPg.toFixed(1),
            reb: s.rebPg.toFixed(1),
            ast: s.astPg.toFixed(1),
            po: { text: poStr, tone: fin.isChamp ? 'warning' : s.poWins > 0 ? 'positive' : 'muted' },
          },
        };
      }),
      editorialVerdict: verdict,
      editorialVerdictTone: 'accent',
    });
  };

  const handleExportChartSvg = async () => {
    const scopeLabel = scope === 'playoffs' ? 'Playoffs' : 'Temporada Regular';
    if (entityType === 'player' && playerData && activePlayerBucket) {
      const mDef = PLAYER_CHART_METRICS.find((m) => m.key === playerChartMetric) || PLAYER_CHART_METRICS[0];
      const peak = activePlayerBucket.peakSeason;
      const careerAvg = mDef.getCareerRefValue(activePlayerBucket);
      const formattedAvg = formatMetricValue(careerAvg, mDef.decimals, mDef.unit);
      return buildSvgChartSnapshotBlob({
        containerId: 'career-history-player-curve-container',
        filename: `${sanitizeExportFilename(playerData.name)}_curva_${playerChartMetric}_${scope}.png`,
        categoryTag: `CURVA DE CARRERA · ${scopeLabel.toUpperCase()}`,
        title: `${playerData.name} — Evolución de ${mDef.label}`,
        subtitle: `${activePlayerBucket.seasons.length} temporadas · ${mDef.refLabel}: ${formattedAvg}${mDef.unit === '%' || mDef.unit === 'x' || mDef.unit === 'º' ? mDef.unit : ` ${mDef.unit}`}`,
        editorialVerdict: `${playerData.name} registra ${formattedAvg}${
          mDef.unit === '%' || mDef.unit === 'x' || mDef.unit === 'º' ? mDef.unit : ` ${mDef.unit}`
        } (${mDef.refLabel.toLowerCase()}) en ${activePlayerBucket.totals.gp} PJ de ${scopeLabel}${
          peak ? `, con su curso Peak en ${peak.season} (${peak.ptsPg.toFixed(1)} PTS · ${peak.tsPct.toFixed(1)}% TS).` : '.'
        }`,
        editorialVerdictTone: 'accent',
      });
    }
    if (entityType === 'team' && teamData) {
      const mDef = TEAM_CHART_METRICS.find((m) => m.key === teamChartMetric) || TEAM_CHART_METRICS[0];
      return buildSvgChartSnapshotBlob({
        containerId: 'career-history-team-curve-container',
        filename: `${sanitizeExportFilename(teamData.teamAbbr)}_curva_${teamChartMetric}.png`,
        categoryTag: `EVOLUCIÓN FRANQUICIA · ${scopeLabel.toUpperCase()}`,
        title: `${teamData.teamName} — ${mDef.label} Histórico`,
        subtitle: `${teamData.startYear}–${teamData.endYear} · ${teamData.championships} anillos NBA`,
        editorialVerdict: `${teamData.teamName} registra un ${(teamData.allTimeWinPct * 100).toFixed(
          1
        )}% histórico (${formatInt(teamData.allTimeWins)}-${formatInt(teamData.allTimeLosses)}) a lo largo de ${
          teamData.totalYears
        } temporadas NBA.`,
        editorialVerdictTone: 'accent',
      });
    }
    throw new Error('Sin datos para exportar');
  };

  if (loading) {
    return (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
        <p className="text-sm font-medium text-slate-200">
          Cargando trayectoria histórica de {entityName}...
        </p>
        <p className="text-xs text-slate-400">
          Combinando el archivo histórico NBA con los partidos en curso de 2026-27
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="bg-[#131C2E] border border-rose-500/30 rounded-xl p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">No se pudo cargar el histórico</p>
          <p className="text-xs text-slate-400 mt-1">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // ==================== PLAYER CAREER RENDER ====================
  if (entityType === 'player' && playerData && activePlayerBucket) {
    const bucket = activePlayerBucket;
    const seasonsChrono = bucket.seasons;
    const peakSeasonId = bucket.peakSeason?.season || null;
    const highs = bucket.careerHighs;

    const highCards: Array<{
      key: string;
      label: string;
      entry: CareerHighEntry | null;
      isDecimal?: boolean;
    }> = [
      { key: 'pts', label: 'Puntos', entry: highs.pts },
      { key: 'reb', label: 'Rebotes', entry: highs.reb },
      { key: 'ast', label: 'Asistencias', entry: highs.ast },
      { key: 'fg3m', label: 'Triples', entry: highs.fg3m },
      { key: 'stl', label: 'Robos', entry: highs.stl },
      { key: 'blk', label: 'Tapones', entry: highs.blk },
      { key: 'min', label: 'Minutos', entry: highs.min, isDecimal: true },
      { key: 'gameScore', label: 'Game Score', entry: highs.gameScore, isDecimal: true },
    ];

    // Relative Career Highs (best season per-game average)
    const relEligibleSeasons =
      scope === 'regular'
        ? (() => {
            const qual = seasonsChrono.filter(
              (s) => s.gp >= 10 || (s.season === '2026-27' && s.gp >= 5)
            );
            return qual.length > 0 ? qual : seasonsChrono;
          })()
        : seasonsChrono;

    const findBestSeasonFor = (
      getter: (s: CareerSeasonLine) => number
    ): { value: number; season: CareerSeasonLine } | null => {
      let best: CareerSeasonLine | null = null;
      let bestVal = -Infinity;
      for (const s of relEligibleSeasons) {
        const v = getter(s);
        if (Number.isFinite(v) && v > bestVal) {
          bestVal = v;
          best = s;
        }
      }
      if (!best || bestVal <= 0) return null;
      return { value: bestVal, season: best };
    };

    const relativeHighCards: Array<{
      key: string;
      label: string;
      best: { value: number; season: CareerSeasonLine } | null;
    }> = [
      { key: 'pts', label: 'Puntos / PJ', best: findBestSeasonFor((s) => s.ptsPg) },
      { key: 'reb', label: 'Rebotes / PJ', best: findBestSeasonFor((s) => s.rebPg) },
      { key: 'ast', label: 'Asistencias / PJ', best: findBestSeasonFor((s) => s.astPg) },
      {
        key: 'fg3m',
        label: 'Triples / PJ',
        best: findBestSeasonFor((s) => (s.gp > 0 ? s.fg3m / s.gp : 0)),
      },
      { key: 'stl', label: 'Robos / PJ', best: findBestSeasonFor((s) => s.stlPg) },
      { key: 'blk', label: 'Tapones / PJ', best: findBestSeasonFor((s) => s.blkPg) },
      { key: 'min', label: 'Minutos / PJ', best: findBestSeasonFor((s) => s.minPg) },
      { key: 'gameScore', label: 'Game Score / PJ', best: findBestSeasonFor((s) => s.gmScPg) },
    ];

    // Per-column Career Highs for the Year-by-Year table (Relative & Absolute)
    const maxOf = (
      getter: (s: CareerSeasonLine) => number,
      filter?: (s: CareerSeasonLine) => boolean
    ): number => {
      let m = 0;
      for (const s of seasonsChrono) {
        if (filter && !filter(s)) continue;
        const v = getter(s);
        if (Number.isFinite(v) && v > m) m = v;
      }
      return m;
    };

    const playerColHighs = {
      gp: maxOf((s) => s.gp),
      // Relative (per-game / %)
      minPg: maxOf((s) => s.minPg),
      ptsPg: maxOf((s) => s.ptsPg),
      rebPg: maxOf((s) => s.rebPg),
      astPg: maxOf((s) => s.astPg),
      stlPg: maxOf((s) => s.stlPg),
      blkPg: maxOf((s) => s.blkPg),
      fgPct: maxOf((s) => s.fgPct, (s) => s.fga > 0),
      fg3Pct: maxOf((s) => s.fg3Pct, (s) => s.fg3a > 0),
      ftPct: maxOf((s) => s.ftPct, (s) => s.fta > 0),
      tsPct: maxOf((s) => s.tsPct, (s) => s.fga > 0 || s.fta > 0),
      gmScPg: maxOf((s) => s.gmScPg),
      // Absolute (season totals)
      min: maxOf((s) => s.min),
      pts: maxOf((s) => s.pts),
      reb: maxOf((s) => s.reb),
      ast: maxOf((s) => s.ast),
      stl: maxOf((s) => s.stl),
      blk: maxOf((s) => s.blk),
      fgm: maxOf((s) => s.fgm),
      fg3m: maxOf((s) => s.fg3m),
      ftm: maxOf((s) => s.ftm),
      dd2: maxOf((s) => s.dd2),
      td3: maxOf((s) => s.td3),
    };

    const isColHighDec = (val: number, maxVal: number, valid = true) =>
      valid && maxVal > 0 && Number(val.toFixed(1)) === Number(maxVal.toFixed(1));
    const isColHighInt = (val: number, maxVal: number, valid = true) =>
      valid && maxVal > 0 && Math.round(val) === Math.round(maxVal);
    const chCellCls =
      'bg-amber-500/15 text-amber-300 font-bold ring-1 ring-inset ring-amber-500/30';

    // SVG Chart geometry
    const mDef = PLAYER_CHART_METRICS.find((m) => m.key === playerChartMetric) || PLAYER_CHART_METRICS[0];
    const quickPlayerMetrics = PLAYER_CHART_METRICS.filter((m) => m.quick);
    const svgW = 720;
    const svgH = 220;
    const padL = 48;
    const padR = 20;
    const padT = 22;
    const padB = 34;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;

    const chartVals = seasonsChrono.map((s) => Number(mDef.getSeasonValue(s) || 0));
    const careerRefVal = Number(mDef.getCareerRefValue(bucket) || 0);
    const rawMax = Math.max(0, ...chartVals, careerRefVal);
    const rawMin = Math.min(...chartVals, careerRefVal);
    const maxVal = Math.max(mDef.decimals === 0 ? 1 : 0.5, rawMax * 1.12);
    const minVal = Math.max(0, rawMin * 0.82);
    const span = Math.max(mDef.decimals === 0 ? 1 : 0.5, maxVal - minVal);

    const xFor = (i: number) =>
      seasonsChrono.length <= 1
        ? padL + plotW / 2
        : padL + (i / (seasonsChrono.length - 1)) * plotW;
    const yFor = (v: number) => padT + plotH - ((v - minVal) / span) * plotH;

    const polyPoints = seasonsChrono
      .map((s, i) => `${xFor(i).toFixed(1)},${yFor(Number(mDef.getSeasonValue(s) || 0)).toFixed(1)}`)
      .join(' ');
    const areaPath =
      seasonsChrono.length > 0
        ? `M ${xFor(0).toFixed(1)},${(padT + plotH).toFixed(1)} ` +
          seasonsChrono
            .map((s, i) => `L ${xFor(i).toFixed(1)},${yFor(Number(mDef.getSeasonValue(s) || 0)).toFixed(1)}`)
            .join(' ') +
          ` L ${xFor(seasonsChrono.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
        : '';

    const hoveredSeason: CareerSeasonLine | null =
      hoveredIdx !== null && seasonsChrono[hoveredIdx] ? seasonsChrono[hoveredIdx] : null;

    return (
      <div className="space-y-5">
        {/* Scope switcher & actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#131C2E] border border-[#1E293B] rounded-xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg bg-[#0B1120] border border-[#1E293B] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setScope('regular');
                  setHoveredIdx(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  scope === 'regular'
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Temporada Regular
              </button>
              <button
                type="button"
                onClick={() => {
                  setScope('playoffs');
                  setHoveredIdx(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  scope === 'playoffs'
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Playoffs ({playerData.playoffs.totals.gp} PJ)
              </button>
            </div>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              Debut {playerData.rookieSeason} · {bucket.totals.seasonsCount}{' '}
              {bucket.totals.seasonsCount === 1 ? 'temporada' : 'temporadas'} ·{' '}
              {formatInt(bucket.totals.gp)} PJ
            </span>
          </div>

          {seasonsChrono.length > 0 && (
            <ExportImageButton
              onBuildImage={handleExportPlayerTable}
              label="Exportar Trayectoria"
            />
          )}
        </div>

        {seasonsChrono.length === 0 ? (
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-8 text-center">
            <Trophy className="w-7 h-7 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-200">
              Sin partidos registrados en {scope === 'playoffs' ? 'Playoffs' : 'Temporada Regular'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {playerData.name} aún no acumula apariciones oficiales en este ámbito.
            </p>
          </div>
        ) : (
          <>
            {/* Career Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Puntos Carrera</p>
                <p className="text-xl font-bold font-mono tabular-nums text-white mt-1">
                  {formatInt(bucket.totals.pts)}
                </p>
                <p className="text-xs font-mono tabular-nums text-orange-400 mt-0.5">
                  {bucket.averages.ptsPg.toFixed(1)} PTS/PJ · {formatInt(bucket.totals.gp)} PJ
                </p>
              </div>
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Rebotes y Asist.</p>
                <p className="text-xl font-bold font-mono tabular-nums text-white mt-1">
                  {formatInt(bucket.totals.reb)}{' '}
                  <span className="text-slate-500 text-sm">/</span>{' '}
                  {formatInt(bucket.totals.ast)}
                </p>
                <p className="text-xs font-mono tabular-nums text-sky-400 mt-0.5">
                  {bucket.averages.rebPg.toFixed(1)} REB · {bucket.averages.astPg.toFixed(1)} AST/PJ
                </p>
              </div>
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Triples y Eficiencia</p>
                <p className="text-xl font-bold font-mono tabular-nums text-white mt-1">
                  {formatInt(bucket.totals.fg3m)}{' '}
                  <span className="text-xs font-normal text-slate-400">3PM</span>
                </p>
                <p className="text-xs font-mono tabular-nums text-emerald-400 mt-0.5">
                  {bucket.averages.tsPct.toFixed(1)}% TS · {bucket.averages.fg3Pct.toFixed(1)}% T3
                </p>
              </div>
              <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">
                  Hitos y Peak
                </p>
                <p className="text-xl font-bold font-mono tabular-nums text-white mt-1">
                  {bucket.peakSeason?.season || '—'}
                </p>
                <p className="text-xs font-mono tabular-nums text-amber-400 mt-0.5">
                  {bucket.totals.dd2} DD · {bucket.totals.td3} TD ·{' '}
                  {bucket.averages.gmScPg.toFixed(1)} GmSc
                </p>
              </div>
            </div>

            {/* Career Highs Grid */}
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Flame className="w-4 h-4 text-orange-400 shrink-0" />
                  <h4 className="text-sm font-semibold text-white">
                    {highsMode === 'absolute'
                      ? `Career Highs — Máximos de Carrera en 1 Partido (${scope === 'playoffs' ? 'Playoffs' : 'Temporada Regular'})`
                      : `Career Highs — Mejor Promedio por Temporada (${scope === 'playoffs' ? 'Playoffs' : 'Temporada Regular'})`}
                  </h4>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg bg-[#0B1120] border border-[#1E293B] p-0.5">
                    <button
                      type="button"
                      onClick={() => setHighsMode('absolute')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        highsMode === 'absolute'
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Absolutos (1 Partido)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHighsMode('relative')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        highsMode === 'relative'
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Relativos (Media/PJ)
                    </button>
                  </div>
                </div>
              </div>

              {highsMode === 'absolute' ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {highCards.map(({ key, label, entry, isDecimal }) => (
                    <div
                      key={key}
                      className={`rounded-lg border p-3 ${
                        entry?.isCurrentSeason
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : 'bg-[#0B1120] border-[#1E293B]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] uppercase tracking-wider text-slate-400">
                          {label}
                        </span>
                        {entry?.isCurrentSeason && (
                          <span className="text-[10px] font-semibold text-amber-300 flex items-center gap-0.5">
                            <Sparkles className="w-3 h-3" /> 26-27
                          </span>
                        )}
                      </div>
                      <p className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
                        {entry
                          ? isDecimal
                            ? entry.value.toFixed(1)
                            : entry.value
                          : '—'}
                      </p>
                      {entry ? (
                        <p className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums truncate">
                          {formatDateEs(entry.date)} · vs {entry.opponentAbbr}
                          {entry.result ? ` (${entry.result})` : ''}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500 mt-1">Sin registro</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {relativeHighCards.map(({ key, label, best }) => {
                    const isCurSeason = best?.season.season === '2026-27';
                    return (
                      <div
                        key={key}
                        className={`rounded-lg border p-3 ${
                          isCurSeason
                            ? 'bg-amber-500/10 border-amber-500/40'
                            : 'bg-[#0B1120] border-[#1E293B]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] uppercase tracking-wider text-slate-400">
                            {label}
                          </span>
                          {isCurSeason && (
                            <span className="text-[10px] font-semibold text-amber-300 flex items-center gap-0.5">
                              <Sparkles className="w-3 h-3" /> 26-27
                            </span>
                          )}
                        </div>
                        <p className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
                          {best ? best.value.toFixed(1) : '—'}
                        </p>
                        {best ? (
                          <p className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums truncate">
                            {best.season.season} · {best.season.teamAbbr} ({best.season.gp} PJ)
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-500 mt-1">Sin registro</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Interactive SVG Career Progression Chart */}
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingUp className="w-4 h-4 text-orange-400 shrink-0" />
                  <h4 className="text-sm font-semibold text-white truncate">
                    Curva de Evolución por Temporada
                  </h4>
                  <span className="hidden sm:inline-block text-[11px] font-mono text-orange-300 bg-[#0B1120] border border-[#1E293B] px-2 py-0.5 rounded">
                    {mDef.label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex flex-wrap rounded-lg bg-[#0B1120] border border-[#1E293B] p-0.5">
                    {quickPlayerMetrics.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => {
                          setPlayerChartMetric(m.key);
                          setHoveredIdx(null);
                        }}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          playerChartMetric === m.key
                            ? 'bg-orange-500 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <select
                    aria-label="Seleccionar estadística para la curva de evolución del jugador"
                    value={playerChartMetric}
                    onChange={(e) => {
                      setPlayerChartMetric(e.target.value as PlayerChartMetricKey);
                      setHoveredIdx(null);
                    }}
                    className="h-7 px-2.5 bg-[#0B1120] border border-[#1E293B] hover:border-[#283548] focus:border-orange-500/60 rounded-lg text-[11px] font-medium text-slate-200 focus:outline-none cursor-pointer"
                  >
                    {PLAYER_CHART_GROUPS.map((grp) => (
                      <optgroup key={grp} label={grp} className="bg-[#0F172A] text-slate-300">
                        {PLAYER_CHART_METRICS.filter((m) => m.group === grp).map((m) => (
                          <option key={m.key} value={m.key} className="bg-[#0F172A] text-slate-100">
                            {m.fullLabel}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ExportImageButton
                    onBuildImage={handleExportChartSvg}
                    label="PNG Curva"
                    showEditorialToggle={false}
                  />
                </div>
              </div>

              <div id="career-history-player-curve-container" className="relative w-full overflow-x-auto">
                <svg
                  ref={chartSvgRef}
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="w-full min-w-[500px] h-auto select-none"
                >
                  <defs>
                    <linearGradient id="careerCurveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F97316" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#F97316" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal gridlines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                    const y = padT + plotH * (1 - t);
                    const val = minVal + span * t;
                    return (
                      <g key={t}>
                        <line
                          x1={padL}
                          x2={svgW - padR}
                          y1={y}
                          y2={y}
                          stroke="#1E293B"
                          strokeWidth="1"
                        />
                        <text
                          x={padL - 8}
                          y={y + 4}
                          textAnchor="end"
                          fill="#64748B"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {formatMetricValue(val, mDef.decimals, mDef.unit)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Career Average reference line */}
                  <line
                    x1={padL}
                    x2={svgW - padR}
                    y1={yFor(careerRefVal)}
                    y2={yFor(careerRefVal)}
                    stroke="#38BDF8"
                    strokeWidth="1.25"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={svgW - padR - 4}
                    y={yFor(careerRefVal) - 5}
                    textAnchor="end"
                    fill="#38BDF8"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {mDef.refLabel}: {formatMetricValue(careerRefVal, mDef.decimals, mDef.unit)}
                  </text>

                  {/* Area & Line */}
                  {seasonsChrono.length > 1 && (
                    <>
                      <path d={areaPath} fill="url(#careerCurveGrad)" />
                      <polyline
                        fill="none"
                        stroke="#F97316"
                        strokeWidth="2.4"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        points={polyPoints}
                      />
                    </>
                  )}

                  {/* Data points */}
                  {seasonsChrono.map((s, idx) => {
                    const cx = xFor(idx);
                    const val = Number(mDef.getSeasonValue(s) || 0);
                    const cy = yFor(val);
                    const isPeak = s.season === peakSeasonId;
                    const isHov = hoveredIdx === idx;
                    const showXLabel =
                      seasonsChrono.length <= 10 ||
                      idx === 0 ||
                      idx === seasonsChrono.length - 1 ||
                      idx % Math.ceil(seasonsChrono.length / 8) === 0;

                    return (
                      <g
                        key={`${s.season}-${idx}`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                      >
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHov ? 6 : isPeak ? 5 : 3.8}
                          fill={isPeak ? '#F59E0B' : '#F97316'}
                          stroke="#0B1120"
                          strokeWidth="2"
                        />
                        {(isPeak || isHov) && (
                          <text
                            x={cx}
                            y={cy - 10}
                            textAnchor="middle"
                            fill={isPeak ? '#FCD34D' : '#F8FAFC'}
                            fontSize="10"
                            fontWeight="700"
                            fontFamily="monospace"
                          >
                            {formatMetricValue(val, mDef.decimals, mDef.unit)}
                          </text>
                        )}
                        {showXLabel && (
                          <text
                            x={cx}
                            y={svgH - 10}
                            textAnchor="middle"
                            fill="#94A3B8"
                            fontSize="10"
                            fontFamily="monospace"
                          >
                            {s.season.slice(2)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {hoveredSeason && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-[#0B1120] border border-[#1E293B] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-white font-mono">
                      {hoveredSeason.season} · {hoveredSeason.teamAbbr} ({hoveredSeason.gp} PJ ·{' '}
                      {hoveredSeason.wins}-{hoveredSeason.losses})
                    </span>
                    <span className="font-mono tabular-nums text-slate-300">
                      <strong className="text-orange-300">
                        {mDef.label}: {formatMetricValue(mDef.getSeasonValue(hoveredSeason), mDef.decimals, mDef.unit)}
                        {mDef.unit === '%' || mDef.unit === 'x' ? mDef.unit : ''}
                      </strong>{' '}
                      · {hoveredSeason.ptsPg.toFixed(1)} PTS · {hoveredSeason.rebPg.toFixed(1)} REB ·{' '}
                      {hoveredSeason.astPg.toFixed(1)} AST · {hoveredSeason.tsPct.toFixed(1)}% TS ·{' '}
                      {hoveredSeason.gmScPg.toFixed(1)} GmSc
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Year-by-Year Historical Table */}
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-400 shrink-0" />
                  <h4 className="text-sm font-semibold text-white">
                    Estadísticas Año a Año ({scope === 'playoffs' ? 'Playoffs' : 'Temporada Regular'})
                  </h4>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-lg bg-[#0B1120] border border-[#1E293B] p-0.5">
                    <button
                      type="button"
                      onClick={() => setTableMode('relative')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        tableMode === 'relative'
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Relativos (Por partido)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableMode('absolute')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        tableMode === 'absolute'
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Absolutos (Totales)
                    </button>
                  </div>
                  <span className="text-[11px] text-amber-300 flex items-center gap-1 whitespace-nowrap">
                    <Crown className="w-3.5 h-3.5" /> Career High por columna en dorado
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[460px]">
                <table className="w-full text-xs">
                  <thead className={STICKY_THEAD_CLASS}>
                    <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
                      <SortableTh label="Temp." title="Temporada (curso NBA)" active={playerSort.sortKey === 'season'} asc={playerSort.sortAsc} onSort={() => playerSort.toggleSort('season')} align="left" className="px-3 py-2.5" />
                      <SortableTh label="Eq." title="Equipo o franquicia en esa temporada (incluye traspasos)" active={playerSort.sortKey === 'teamAbbr'} asc={playerSort.sortAsc} onSort={() => playerSort.toggleSort('teamAbbr')} align="left" className="px-2 py-2.5" />
                      <SortableTh label="PJ" helpKey="gp" title="Partidos Jugados oficiales" active={playerSort.sortKey === 'gp'} asc={playerSort.sortAsc} onSort={() => playerSort.toggleSort('gp')} className="px-2 py-2.5" />
                      <SortableTh label="MIN" helpKey="min" title="Minutos disputados (por partido o totales según vista activa)" active={playerSort.sortKey === 'minPg'} asc={playerSort.sortAsc} onSort={() => playerSort.toggleSort('minPg')} className="px-2 py-2.5" />
                      <SortableTh label="PTS" helpKey="pts" title="Puntos anotados" active={playerSort.sortKey === 'ptsPg'} asc={playerSort.sortAsc} onSort={() => playerSort.toggleSort('ptsPg')} className="px-2 py-2.5" />
                      <SortableTh label="REB" helpKey="reb" title="Rebotes capturados (ofensivos + defensivos)" active={playerSort.sortKey === 'rebPg'} asc={playerSort.sortAsc} onSort={() => playerSort.toggleSort('rebPg')} className="px-2 py-2.5" />
                      <SortableTh label="AST" helpKey="ast" title="Asistencias repartidas que derivaron en canasta" active={playerSort.sortKey === 'astPg'} asc={playerSort.sortAsc} onSort={() => playerSort.toggleSort('astPg')} className="px-2 py-2.5" />
                      <SortableTh label="ROB" helpKey="stl" title="Robos de balón logrados" active={playerSort.sortKey === 'stlPg'} asc={playerSort.sortAsc} onSort={() => playerSort.toggleSort('stlPg')} className="px-2 py-2.5" />
                      <SortableTh label="TAP" helpKey="blk" title="Tapones propinados a lanzamientos rivales" active={playerSort.sortKey === 'blkPg'} asc={playerSort.sortAsc} onSort={() => playerSort.toggleSort('blkPg')} className="px-2 py-2.5" />
                      <SortableTh
                        label={tableMode === 'relative' ? 'TC%' : 'TC'}
                        helpKey="fgPct"
                        title={tableMode === 'relative' ? 'Porcentaje de Tiros de Campo anotados' : 'Tiros de Campo totales convertidos'}
                        active={playerSort.sortKey === 'fgPct'}
                        asc={playerSort.sortAsc}
                        onSort={() => playerSort.toggleSort('fgPct')}
                        className="px-2 py-2.5"
                      />
                      <SortableTh
                        label={tableMode === 'relative' ? 'T3%' : '3PM'}
                        helpKey="fg3Pct"
                        title={tableMode === 'relative' ? 'Porcentaje de Triples anotados' : 'Triples totales anotados'}
                        active={playerSort.sortKey === 'fg3Pct'}
                        asc={playerSort.sortAsc}
                        onSort={() => playerSort.toggleSort('fg3Pct')}
                        className="px-2 py-2.5"
                      />
                      <SortableTh
                        label={tableMode === 'relative' ? 'TL%' : 'TL'}
                        helpKey="ftPct"
                        title={tableMode === 'relative' ? 'Porcentaje de Tiros Libres anotados' : 'Tiros Libres totales anotados'}
                        active={playerSort.sortKey === 'ftPct'}
                        asc={playerSort.sortAsc}
                        onSort={() => playerSort.toggleSort('ftPct')}
                        className="px-2 py-2.5"
                      />
                      <SortableTh
                        label={tableMode === 'relative' ? 'TS%' : 'DD'}
                        helpKey="tsPct"
                        title={tableMode === 'relative' ? 'True Shooting % (eficiencia global de tiro)' : 'Dobles-Dobles conseguidos (10+ en dos apartados)'}
                        active={playerSort.sortKey === 'tsPct'}
                        asc={playerSort.sortAsc}
                        onSort={() => playerSort.toggleSort('tsPct')}
                        className="px-2 py-2.5"
                      />
                      <SortableTh
                        label={tableMode === 'relative' ? 'GmSc' : 'TD'}
                        helpKey="gmSc"
                        title={tableMode === 'relative' ? 'Game Score (productividad global por partido de John Hollinger)' : 'Triples-Dobles conseguidos (10+ en tres apartados)'}
                        active={playerSort.sortKey === 'gmScPg'}
                        asc={playerSort.sortAsc}
                        onSort={() => playerSort.toggleSort('gmScPg')}
                        className="px-3 py-2.5"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {sortedPlayerSeasons.map((s) => {
                      const isPeak = s.season === peakSeasonId;
                      const isCurrent = s.season === '2026-27';
                      const isRel = tableMode === 'relative';

                      const hiGp = isColHighInt(s.gp, playerColHighs.gp);
                      const hiMin = isRel
                        ? isColHighDec(s.minPg, playerColHighs.minPg)
                        : isColHighInt(s.min, playerColHighs.min);
                      const hiPts = isRel
                        ? isColHighDec(s.ptsPg, playerColHighs.ptsPg)
                        : isColHighInt(s.pts, playerColHighs.pts);
                      const hiReb = isRel
                        ? isColHighDec(s.rebPg, playerColHighs.rebPg)
                        : isColHighInt(s.reb, playerColHighs.reb);
                      const hiAst = isRel
                        ? isColHighDec(s.astPg, playerColHighs.astPg)
                        : isColHighInt(s.ast, playerColHighs.ast);
                      const hiStl = isRel
                        ? isColHighDec(s.stlPg, playerColHighs.stlPg)
                        : isColHighInt(s.stl, playerColHighs.stl);
                      const hiBlk = isRel
                        ? isColHighDec(s.blkPg, playerColHighs.blkPg)
                        : isColHighInt(s.blk, playerColHighs.blk);
                      const hiCol10 = isRel
                        ? isColHighDec(s.fgPct, playerColHighs.fgPct, s.fga > 0)
                        : isColHighInt(s.fgm, playerColHighs.fgm);
                      const hiCol11 = isRel
                        ? isColHighDec(s.fg3Pct, playerColHighs.fg3Pct, s.fg3a > 0)
                        : isColHighInt(s.fg3m, playerColHighs.fg3m);
                      const hiCol12 = isRel
                        ? isColHighDec(s.ftPct, playerColHighs.ftPct, s.fta > 0)
                        : isColHighInt(s.ftm, playerColHighs.ftm);
                      const hiCol13 = isRel
                        ? isColHighDec(s.tsPct, playerColHighs.tsPct, s.fga > 0 || s.fta > 0)
                        : isColHighInt(s.dd2, playerColHighs.dd2);
                      const hiCol14 = isRel
                        ? isColHighDec(s.gmScPg, playerColHighs.gmScPg)
                        : isColHighInt(s.td3, playerColHighs.td3);

                      return (
                        <tr
                          key={s.season}
                          className={`transition-colors hover:bg-[#182338] ${
                            isPeak ? 'bg-amber-500/8' : ''
                          }`}
                        >
                          <td className="px-3 py-2 font-mono tabular-nums font-semibold text-white whitespace-nowrap">
                            {s.season}
                            {isPeak && (
                              <Crown
                                className="w-3 h-3 text-amber-400 inline ml-1 -mt-0.5"
                                aria-label="Mejor temporada global (Peak)"
                              />
                            )}
                            {isCurrent && (
                              <span className="ml-1.5 text-[10px] text-orange-400 font-sans font-semibold">
                                ACT
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <TeamLogo abbr={s.teamAbbr} size="xs" />
                              <span className="font-mono text-slate-300">{s.teamAbbr}</span>
                            </div>
                          </td>
                          <td
                            title={hiGp ? 'Career High en PJ' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiGp ? chCellCls : 'text-slate-300'
                            }`}
                          >
                            {s.gp}
                          </td>
                          <td
                            title={hiMin ? 'Career High en MIN' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiMin ? chCellCls : 'text-slate-300'
                            }`}
                          >
                            {isRel ? s.minPg.toFixed(1) : formatInt(s.min)}
                          </td>
                          <td
                            title={hiPts ? 'Career High en PTS' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiPts ? chCellCls : 'font-semibold text-white'
                            }`}
                          >
                            {isRel ? s.ptsPg.toFixed(1) : formatInt(s.pts)}
                          </td>
                          <td
                            title={hiReb ? 'Career High en REB' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiReb ? chCellCls : 'text-slate-200'
                            }`}
                          >
                            {isRel ? s.rebPg.toFixed(1) : formatInt(s.reb)}
                          </td>
                          <td
                            title={hiAst ? 'Career High en AST' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiAst ? chCellCls : 'text-slate-200'
                            }`}
                          >
                            {isRel ? s.astPg.toFixed(1) : formatInt(s.ast)}
                          </td>
                          <td
                            title={hiStl ? 'Career High en ROB' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiStl ? chCellCls : 'text-slate-300'
                            }`}
                          >
                            {isRel ? s.stlPg.toFixed(1) : formatInt(s.stl)}
                          </td>
                          <td
                            title={hiBlk ? 'Career High en TAP' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiBlk ? chCellCls : 'text-slate-300'
                            }`}
                          >
                            {isRel ? s.blkPg.toFixed(1) : formatInt(s.blk)}
                          </td>
                          <td
                            title={hiCol10 ? `Career High en ${isRel ? 'TC%' : 'TC anotados'}` : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiCol10 ? chCellCls : 'text-slate-300'
                            }`}
                          >
                            {isRel ? `${s.fgPct.toFixed(1)}%` : formatInt(s.fgm)}
                          </td>
                          <td
                            title={hiCol11 ? `Career High en ${isRel ? 'T3%' : '3PM'}` : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiCol11 ? chCellCls : 'text-slate-300'
                            }`}
                          >
                            {isRel ? `${s.fg3Pct.toFixed(1)}%` : formatInt(s.fg3m)}
                          </td>
                          <td
                            title={hiCol12 ? `Career High en ${isRel ? 'TL%' : 'TL anotados'}` : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiCol12 ? chCellCls : 'text-slate-300'
                            }`}
                          >
                            {isRel ? `${s.ftPct.toFixed(1)}%` : formatInt(s.ftm)}
                          </td>
                          <td
                            title={hiCol13 ? `Career High en ${isRel ? 'TS%' : 'Dobles-Dobles'}` : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiCol13 ? chCellCls : 'text-emerald-300'
                            }`}
                          >
                            {isRel ? `${s.tsPct.toFixed(1)}%` : formatInt(s.dd2)}
                          </td>
                          <td
                            title={hiCol14 ? `Career High en ${isRel ? 'GmSc' : 'Triples-Dobles'}` : undefined}
                            className={`px-3 py-2 text-right font-mono tabular-nums ${
                              hiCol14 ? chCellCls : 'text-orange-300 font-semibold'
                            }`}
                          >
                            {isRel ? s.gmScPg.toFixed(1) : formatInt(s.td3)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-[#0B1120] border-t-2 border-[#1E293B] font-mono tabular-nums">
                    {tableMode === 'relative' && (
                      <tr>
                        <td className="px-3 py-2.5 font-semibold text-orange-300" colSpan={2}>
                          MEDIA CARRERA
                        </td>
                        <td className="px-2 py-2.5 text-right text-slate-200 font-semibold">{formatInt(bucket.totals.gp)}</td>
                        <td className="px-2 py-2.5 text-right text-slate-200">{bucket.averages.minPg.toFixed(1)}</td>
                        <td className="px-2 py-2.5 text-right text-white font-bold">{bucket.averages.ptsPg.toFixed(1)}</td>
                        <td className="px-2 py-2.5 text-right text-slate-200">{bucket.averages.rebPg.toFixed(1)}</td>
                        <td className="px-2 py-2.5 text-right text-slate-200">{bucket.averages.astPg.toFixed(1)}</td>
                        <td className="px-2 py-2.5 text-right text-slate-200">{bucket.averages.stlPg.toFixed(1)}</td>
                        <td className="px-2 py-2.5 text-right text-slate-200">{bucket.averages.blkPg.toFixed(1)}</td>
                        <td className="px-2 py-2.5 text-right text-slate-200">{bucket.averages.fgPct.toFixed(1)}%</td>
                        <td className="px-2 py-2.5 text-right text-slate-200">{bucket.averages.fg3Pct.toFixed(1)}%</td>
                        <td className="px-2 py-2.5 text-right text-slate-200">{bucket.averages.ftPct.toFixed(1)}%</td>
                        <td className="px-2 py-2.5 text-right text-emerald-300 font-semibold">{bucket.averages.tsPct.toFixed(1)}%</td>
                        <td className="px-3 py-2.5 text-right text-orange-300 font-bold">{bucket.averages.gmScPg.toFixed(1)}</td>
                      </tr>
                    )}
                    <tr className={`${tableMode === 'relative' ? 'border-t border-[#1E293B]' : ''} text-slate-400`}>
                      <td className="px-3 py-2 font-semibold text-slate-300" colSpan={2}>
                        TOTALES ACUM.
                      </td>
                      <td className="px-2 py-2 text-right text-slate-200">{formatInt(bucket.totals.gp)}</td>
                      <td className="px-2 py-2 text-right">{formatInt(bucket.totals.min)}</td>
                      <td className="px-2 py-2 text-right text-white font-semibold">{formatInt(bucket.totals.pts)}</td>
                      <td className="px-2 py-2 text-right">{formatInt(bucket.totals.reb)}</td>
                      <td className="px-2 py-2 text-right">{formatInt(bucket.totals.ast)}</td>
                      <td className="px-2 py-2 text-right">{formatInt(bucket.totals.stl)}</td>
                      <td className="px-2 py-2 text-right">{formatInt(bucket.totals.blk)}</td>
                      {tableMode === 'relative' ? (
                        <td className="px-3 py-2 text-right" colSpan={5}>
                          {formatInt(bucket.totals.fg3m)} 3PM · {bucket.totals.dd2} DD · {bucket.totals.td3} TD
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-2 text-right">{formatInt(bucket.totals.fgm)}</td>
                          <td className="px-2 py-2 text-right">{formatInt(bucket.totals.fg3m)}</td>
                          <td className="px-2 py-2 text-right">{formatInt(bucket.totals.ftm)}</td>
                          <td className="px-2 py-2 text-right text-emerald-300">{formatInt(bucket.totals.dd2)}</td>
                          <td className="px-3 py-2 text-right text-orange-300 font-semibold">{formatInt(bucket.totals.td3)}</td>
                        </>
                      )}
                    </tr>
                    <tr className="border-t border-amber-500/35 bg-amber-500/10 text-amber-300 font-bold">
                      <td className="px-3 py-2.5 whitespace-nowrap" colSpan={2}>
                        <span className="inline-flex items-center gap-1.5">
                          <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            CAREER HIGH ({tableMode === 'relative' ? 'REL.' : 'ABS.'})
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right">{formatInt(playerColHighs.gp)}</td>
                      <td className="px-2 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? playerColHighs.minPg.toFixed(1)
                          : formatInt(playerColHighs.min)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? playerColHighs.ptsPg.toFixed(1)
                          : formatInt(playerColHighs.pts)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? playerColHighs.rebPg.toFixed(1)
                          : formatInt(playerColHighs.reb)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? playerColHighs.astPg.toFixed(1)
                          : formatInt(playerColHighs.ast)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? playerColHighs.stlPg.toFixed(1)
                          : formatInt(playerColHighs.stl)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? playerColHighs.blkPg.toFixed(1)
                          : formatInt(playerColHighs.blk)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? `${playerColHighs.fgPct.toFixed(1)}%`
                          : formatInt(playerColHighs.fgm)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? `${playerColHighs.fg3Pct.toFixed(1)}%`
                          : formatInt(playerColHighs.fg3m)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? `${playerColHighs.ftPct.toFixed(1)}%`
                          : formatInt(playerColHighs.ftm)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? `${playerColHighs.tsPct.toFixed(1)}%`
                          : formatInt(playerColHighs.dd2)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {tableMode === 'relative'
                          ? playerColHighs.gmScPg.toFixed(1)
                          : formatInt(playerColHighs.td3)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ==================== TEAM FRANCHISE HISTORY RENDER ====================
  if (entityType === 'team' && teamData) {
    const mDef = TEAM_CHART_METRICS.find((m) => m.key === teamChartMetric) || TEAM_CHART_METRICS[0];
    const quickTeamMetrics = TEAM_CHART_METRICS.filter((m) => m.quick);
    const chartPoints = activeTeamSeasons
      .map((season) => {
        const val = mDef.getSeasonValue(season);
        return val === null || !Number.isFinite(val) ? null : { season, val };
      })
      .filter((entry): entry is { season: TeamHistoricalSeason; val: number } => entry !== null);

    const svgW = 720;
    const svgH = 220;
    const padL = 48;
    const padR = 20;
    const padT = 22;
    const padB = 34;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;

    const vals = chartPoints.map((p) => p.val);
    const histAvgVal =
      vals.length > 0 ? vals.reduce((acc, v) => acc + v, 0) / vals.length : 0;
    const refVal = teamChartMetric === 'winPct' ? 50 : histAvgVal;
    const refLabel = teamChartMetric === 'winPct' ? '50.0% (Equilibrio)' : 'Media histórica';

    const maxV = mDef.invertAxis
      ? Math.max(15, ...vals)
      : Math.max(mDef.decimals === 0 ? 4 : 1, ...vals, refVal) * 1.08;
    const minV = mDef.invertAxis
      ? 1
      : Math.max(0, Math.min(...vals, refVal) * 0.85);
    const span = Math.max(1, maxV - minV);
    const xFor = (i: number) =>
      chartPoints.length <= 1 ? padL + plotW / 2 : padL + (i / (chartPoints.length - 1)) * plotW;
    const yFor = (v: number) =>
      mDef.invertAxis
        ? padT + ((v - minV) / span) * plotH
        : padT + plotH - ((v - minV) / span) * plotH;

    const polyPoints = chartPoints
      .map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.val).toFixed(1)}`)
      .join(' ');
    const teamAreaPath =
      chartPoints.length > 0
        ? `M ${xFor(0).toFixed(1)},${(padT + plotH).toFixed(1)} ` +
          chartPoints.map((p, i) => `L ${xFor(i).toFixed(1)},${yFor(p.val).toFixed(1)}`).join(' ') +
          ` L ${xFor(chartPoints.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
        : '';
    const hoveredTeamEntry =
      hoveredIdx !== null && chartPoints[hoveredIdx] ? chartPoints[hoveredIdx] : null;
    const isTrimmedHistory =
      chartPoints.length > 0 && chartPoints.length < activeTeamSeasons.length;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#131C2E] border border-[#1E293B] rounded-xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg bg-[#0B1120] border border-[#1E293B] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setScope('regular');
                  setHoveredIdx(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  scope === 'regular'
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Temporada Regular ({teamData.regularSeasons.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setScope('playoffs');
                  setHoveredIdx(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  scope === 'playoffs'
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Años de Playoffs ({teamData.playoffSeasons.length})
              </button>
            </div>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              Franquicia {teamData.startYear}–{teamData.endYear} · {teamData.totalYears} temporadas
            </span>
          </div>

          <ExportImageButton
            onBuildImage={handleExportTeamTable}
            label="Exportar Historial"
          />
        </div>

        {/* All-time Franchise KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Balance Histórico</p>
            <p className="text-xl font-bold font-mono tabular-nums text-white mt-1">
              {formatInt(teamData.allTimeWins)}-{formatInt(teamData.allTimeLosses)}
            </p>
            <p className="text-xs font-mono tabular-nums text-orange-400 mt-0.5">
              {(teamData.allTimeWinPct * 100).toFixed(1)}% victorias · {formatInt(teamData.allTimeGames)} PJ
            </p>
          </div>
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Anillos NBA</p>
            <p className="text-xl font-bold font-mono tabular-nums text-amber-300 mt-1 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-400" />
              {teamData.championships}
            </p>
            <p className="text-xs font-mono tabular-nums text-slate-400 mt-0.5">
              {teamData.confTitles} títulos de conferencia · {teamData.divTitles} división
            </p>
          </div>
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Playoffs</p>
            <p className="text-xl font-bold font-mono tabular-nums text-white mt-1">
              {teamData.playoffAppearances}
            </p>
            <p className="text-xs font-mono tabular-nums text-sky-400 mt-0.5">
              {teamData.totalYears > 0
                ? `${((teamData.playoffAppearances / teamData.totalYears) * 100).toFixed(0)}% de sus cursos`
                : '—'}
            </p>
          </div>
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Mejor Temporada</p>
            <p className="text-xl font-bold font-mono tabular-nums text-emerald-300 mt-1">
              {teamData.bestSeason?.season || '—'}
            </p>
            <p className="text-xs font-mono tabular-nums text-slate-400 mt-0.5">
              {teamData.bestSeason
                ? `${teamData.bestSeason.wins}-${teamData.bestSeason.losses} (${(
                    teamData.bestSeason.winPct * 100
                  ).toFixed(1)}%)`
                : '—'}
            </p>
          </div>
        </div>

        {/* Franchise Historical SVG Curve */}
        {activeTeamSeasons.length > 1 && (
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BarChart3 className="w-4 h-4 text-orange-400 shrink-0" />
                <h4 className="text-sm font-semibold text-white truncate">
                  Evolución Histórica de la Franquicia
                </h4>
                <span className="hidden sm:inline-block text-[11px] font-mono text-orange-300 bg-[#0B1120] border border-[#1E293B] px-2 py-0.5 rounded">
                  {mDef.label}
                </span>
                {isTrimmedHistory && (
                  <span className="hidden md:inline-block text-[10px] font-mono text-slate-400">
                    desde {chartPoints[0].season.season} ({chartPoints.length} temp.)
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap rounded-lg bg-[#0B1120] border border-[#1E293B] p-0.5">
                  {quickTeamMetrics.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        setTeamChartMetric(m.key);
                        setHoveredIdx(null);
                      }}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        teamChartMetric === m.key
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Seleccionar estadística para la evolución histórica de la franquicia"
                  value={teamChartMetric}
                  onChange={(e) => {
                    setTeamChartMetric(e.target.value as TeamChartMetricKey);
                    setHoveredIdx(null);
                  }}
                  className="h-7 px-2.5 bg-[#0B1120] border border-[#1E293B] hover:border-[#283548] focus:border-orange-500/60 rounded-lg text-[11px] font-medium text-slate-200 focus:outline-none cursor-pointer"
                >
                  {TEAM_CHART_GROUPS.map((grp) => (
                    <optgroup key={grp} label={grp} className="bg-[#0F172A] text-slate-300">
                      {TEAM_CHART_METRICS.filter((m) => m.group === grp).map((m) => (
                        <option key={m.key} value={m.key} className="bg-[#0F172A] text-slate-100">
                          {m.fullLabel}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ExportImageButton
                  onBuildImage={handleExportChartSvg}
                  label="PNG Curva"
                  showEditorialToggle={false}
                />
              </div>
            </div>

            {chartPoints.length < 2 ? (
              <div className="py-8 text-center text-xs text-slate-400 bg-[#0B1120] border border-[#1E293B] rounded-lg">
                No hay suficientes temporadas con registro oficial de {mDef.label} para trazar la curva.
              </div>
            ) : (
              <div id="career-history-team-curve-container" className="w-full overflow-x-auto">
                <svg
                  ref={chartSvgRef}
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="w-full min-w-[520px] h-auto select-none"
                >
                  <defs>
                    <linearGradient id="teamCareerCurveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F97316" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#F97316" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                    const y = padT + plotH * (1 - t);
                    const val = mDef.invertAxis ? maxV - span * t : minV + span * t;
                    return (
                      <g key={t}>
                        <line x1={padL} x2={svgW - padR} y1={y} y2={y} stroke="#1E293B" strokeWidth="1" />
                        <text
                          x={padL - 8}
                          y={y + 4}
                          textAnchor="end"
                          fill="#64748B"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {formatMetricValue(val, mDef.decimals, mDef.unit)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Reference line */}
                  <line
                    x1={padL}
                    x2={svgW - padR}
                    y1={yFor(refVal)}
                    y2={yFor(refVal)}
                    stroke="#38BDF8"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={svgW - padR - 4}
                    y={yFor(refVal) - 5}
                    textAnchor="end"
                    fill="#38BDF8"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {teamChartMetric === 'winPct'
                      ? refLabel
                      : `${refLabel}: ${formatMetricValue(refVal, mDef.decimals, mDef.unit)}`}
                  </text>

                  <path d={teamAreaPath} fill="url(#teamCareerCurveGrad)" />
                  <polyline
                    fill="none"
                    stroke="#F97316"
                    strokeWidth="2.2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={polyPoints}
                  />
                  {chartPoints.map(({ season: s, val }, idx) => {
                    const cx = xFor(idx);
                    const cy = yFor(val);
                    const fin = formatFinalsTag(s.finalsAppearance);
                    const isHov = hoveredIdx === idx;
                    const showLabel =
                      chartPoints.length <= 10 ||
                      idx === 0 ||
                      idx === chartPoints.length - 1 ||
                      idx % Math.max(1, Math.floor(chartPoints.length / 8)) === 0;
                    return (
                      <g
                        key={s.season}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                      >
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHov ? 5.5 : fin.isChamp ? 4.5 : 2.6}
                          fill={fin.isChamp ? '#F59E0B' : '#F97316'}
                          stroke="#0B1120"
                          strokeWidth={fin.isChamp || isHov ? 1.6 : 0.8}
                        />
                        {isHov && (
                          <text
                            x={cx}
                            y={cy - 10}
                            textAnchor="middle"
                            fill="#F8FAFC"
                            fontSize="10"
                            fontWeight="700"
                            fontFamily="monospace"
                          >
                            {formatMetricValue(val, mDef.decimals, mDef.unit)}
                          </text>
                        )}
                        {showLabel && (
                          <text
                            x={cx}
                            y={svgH - 10}
                            textAnchor="middle"
                            fill="#94A3B8"
                            fontSize="10"
                            fontFamily="monospace"
                          >
                            {s.season.slice(0, 4)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {hoveredTeamEntry && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-[#0B1120] border border-[#1E293B] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-white font-mono">
                      {hoveredTeamEntry.season.season} · {hoveredTeamEntry.season.wins}-
                      {hoveredTeamEntry.season.losses} (
                      {(hoveredTeamEntry.season.winPct * 100).toFixed(1)}%)
                      {formatFinalsTag(hoveredTeamEntry.season.finalsAppearance).isChamp &&
                        ' · Campeón NBA'}
                    </span>
                    <span className="font-mono tabular-nums text-slate-300">
                      <strong className="text-orange-300">
                        {mDef.label}: {formatMetricValue(hoveredTeamEntry.val, mDef.decimals, mDef.unit)}
                        {mDef.unit === '%' ? '%' : ''}
                      </strong>{' '}
                      · {hoveredTeamEntry.season.ptsPg.toFixed(1)} PTS ·{' '}
                      {hoveredTeamEntry.season.rebPg.toFixed(1)} REB ·{' '}
                      {hoveredTeamEntry.season.astPg.toFixed(1)} AST ·{' '}
                      {hoveredTeamEntry.season.fgPct.toFixed(1)}% TC · PO{' '}
                      {hoveredTeamEntry.season.poWins}-{hoveredTeamEntry.season.poLosses}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Team Year-by-Year Table */}
        {(() => {
          const isRel = tableMode === 'relative';
          const teamMax = (getter: (s: TeamHistoricalSeason) => number) => {
            let m = 0;
            for (const s of activeTeamSeasons) {
              const v = getter(s);
              if (Number.isFinite(v) && v > m) m = v;
            }
            return m;
          };
          const bestConfRank = (() => {
            let minR = Infinity;
            for (const s of activeTeamSeasons) {
              if (s.confRank && s.confRank > 0 && s.confRank < minR) minR = s.confRank;
            }
            return Number.isFinite(minR) ? minR : null;
          })();
          const teamColHighs = {
            gp: teamMax((s) => s.gp),
            wins: teamMax((s) => s.wins),
            winPct: teamMax((s) => s.winPct * 100),
            ptsPg: teamMax((s) => s.ptsPg),
            rebPg: teamMax((s) => s.rebPg),
            astPg: teamMax((s) => s.astPg),
            ptsTotal: teamMax((s) => s.ptsTotal),
            rebTotal: teamMax((s) => Math.round(s.rebPg * s.gp)),
            astTotal: teamMax((s) => Math.round(s.astPg * s.gp)),
            fgPct: teamMax((s) => s.fgPct),
            fg3Pct: teamMax((s) => s.fg3Pct),
            poWins: teamMax((s) => s.poWins),
          };
          const teamTotals = activeTeamSeasons.reduce(
            (acc, s) => {
              acc.gp += s.gp;
              acc.wins += s.wins;
              acc.losses += s.losses;
              acc.ptsTotal += s.ptsTotal;
              acc.rebTotal += Math.round(s.rebPg * s.gp);
              acc.astTotal += Math.round(s.astPg * s.gp);
              acc.poWins += s.poWins;
              acc.poLosses += s.poLosses;
              return acc;
            },
            { gp: 0, wins: 0, losses: 0, ptsTotal: 0, rebTotal: 0, astTotal: 0, poWins: 0, poLosses: 0 }
          );
          const isTeamHiDec = (val: number, maxVal: number) =>
            maxVal > 0 && Number(val.toFixed(1)) === Number(maxVal.toFixed(1));
          const isTeamHiInt = (val: number, maxVal: number) =>
            maxVal > 0 && Math.round(val) === Math.round(maxVal);
          const chCellCls =
            'bg-amber-500/15 text-amber-300 font-bold ring-1 ring-inset ring-amber-500/30';

          return (
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-orange-400 shrink-0" />
                  <h4 className="text-sm font-semibold text-white">
                    Historial Temporada a Temporada ({sortedTeamSeasons.length})
                  </h4>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-lg bg-[#0B1120] border border-[#1E293B] p-0.5">
                    <button
                      type="button"
                      onClick={() => setTableMode('relative')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        tableMode === 'relative'
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Relativos (Por partido)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableMode('absolute')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        tableMode === 'absolute'
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Absolutos (Totales)
                    </button>
                  </div>
                  <span className="text-[11px] text-amber-300 flex items-center gap-1 whitespace-nowrap">
                    <Crown className="w-3.5 h-3.5" /> Récord franquicia por columna en dorado
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[460px]">
                <table className="w-full text-xs">
                  <thead className={STICKY_THEAD_CLASS}>
                    <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
                      <SortableTh label="Temp." title="Temporada (curso NBA)" active={teamSort.sortKey === 'season'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('season')} align="left" className="px-3 py-2.5" />
                      <SortableTh label="PJ" helpKey="gp" title="Partidos Jugados en temporada regular" active={teamSort.sortKey === 'gp'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('gp')} className="px-2 py-2.5" />
                      <SortableTh label="V-D" title="Balance de Victorias y Derrotas del equipo" active={teamSort.sortKey === 'wins'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('wins')} className="px-2 py-2.5" />
                      <SortableTh label="%V" helpKey="winPct" title="Porcentaje de Victorias (% de partidos ganados)" active={teamSort.sortKey === 'winPct'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('winPct')} className="px-2 py-2.5" />
                      <SortableTh label="Conf." title="Posición final en la clasificación de su Conferencia (Este / Oeste)" active={teamSort.sortKey === 'confRank'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('confRank')} className="px-2 py-2.5" />
                      <SortableTh label={isRel ? 'PTS' : 'PTS Tot.'} helpKey="pts" title={isRel ? 'Puntos anotados por partido del equipo' : 'Puntos totales anotados en la temporada'} active={teamSort.sortKey === 'ptsPg'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('ptsPg')} className="px-2 py-2.5" />
                      <SortableTh label={isRel ? 'REB' : 'REB Tot.'} helpKey="reb" title={isRel ? 'Rebotes por partido del equipo' : 'Rebotes totales capturados en la temporada'} active={teamSort.sortKey === 'rebPg'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('rebPg')} className="px-2 py-2.5" />
                      <SortableTh label={isRel ? 'AST' : 'AST Tot.'} helpKey="ast" title={isRel ? 'Asistencias por partido del equipo' : 'Asistencias totales repartidas en la temporada'} active={teamSort.sortKey === 'astPg'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('astPg')} className="px-2 py-2.5" />
                      <SortableTh label="TC%" helpKey="fgPct" title="Porcentaje de Tiros de Campo del equipo" active={teamSort.sortKey === 'fgPct'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('fgPct')} className="px-2 py-2.5" />
                      <SortableTh label="T3%" helpKey="fg3Pct" title="Porcentaje de Triples del equipo" active={teamSort.sortKey === 'fg3Pct'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('fg3Pct')} className="px-2 py-2.5" />
                      <SortableTh label="Playoffs" title="Resultado alcanzado en Playoffs (ronda y balance V-D de postemporada)" active={teamSort.sortKey === 'poWins'} asc={teamSort.sortAsc} onSort={() => teamSort.toggleSort('poWins')} className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {sortedTeamSeasons.map((s) => {
                      const fin = formatFinalsTag(s.finalsAppearance);
                      const isCurrent = s.season === '2026-27';
                      const rebTot = Math.round(s.rebPg * s.gp);
                      const astTot = Math.round(s.astPg * s.gp);

                      const hiGp = isTeamHiInt(s.gp, teamColHighs.gp);
                      const hiWins = isTeamHiInt(s.wins, teamColHighs.wins);
                      const hiWinPct = isTeamHiDec(s.winPct * 100, teamColHighs.winPct);
                      const hiConf = bestConfRank !== null && s.confRank === bestConfRank;
                      const hiPts = isRel
                        ? isTeamHiDec(s.ptsPg, teamColHighs.ptsPg)
                        : isTeamHiInt(s.ptsTotal, teamColHighs.ptsTotal);
                      const hiReb = isRel
                        ? isTeamHiDec(s.rebPg, teamColHighs.rebPg)
                        : isTeamHiInt(rebTot, teamColHighs.rebTotal);
                      const hiAst = isRel
                        ? isTeamHiDec(s.astPg, teamColHighs.astPg)
                        : isTeamHiInt(astTot, teamColHighs.astTotal);
                      const hiFg = isTeamHiDec(s.fgPct, teamColHighs.fgPct);
                      const hiFg3 = isTeamHiDec(s.fg3Pct, teamColHighs.fg3Pct);
                      const hiPo = isTeamHiInt(s.poWins, teamColHighs.poWins);

                      return (
                        <tr
                          key={s.season}
                          className={`transition-colors hover:bg-[#182338] ${
                            fin.isChamp ? 'bg-amber-500/8' : ''
                          }`}
                        >
                          <td className="px-3 py-2 font-mono tabular-nums font-semibold text-white whitespace-nowrap">
                            {s.season}
                            {fin.isChamp && (
                              <Trophy className="w-3 h-3 text-amber-400 inline ml-1.5 -mt-0.5" />
                            )}
                            {isCurrent && (
                              <span className="ml-1.5 text-[10px] text-orange-400 font-sans font-semibold">
                                ACT
                              </span>
                            )}
                          </td>
                          <td
                            title={hiGp ? 'Récord histórico de franquicia en PJ' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${hiGp ? chCellCls : 'text-slate-300'}`}
                          >
                            {s.gp}
                          </td>
                          <td
                            title={hiWins ? 'Récord histórico de franquicia en victorias' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${hiWins ? chCellCls : 'font-semibold text-white'}`}
                          >
                            {s.wins}-{s.losses}
                          </td>
                          <td
                            title={hiWinPct ? 'Récord histórico de franquicia en %V' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              hiWinPct
                                ? chCellCls
                                : s.winPct >= 0.6
                                ? 'text-emerald-300 font-semibold'
                                : s.winPct < 0.4
                                ? 'text-rose-300'
                                : 'text-slate-200'
                            }`}
                          >
                            {(s.winPct * 100).toFixed(1)}%
                          </td>
                          <td
                            title={hiConf ? 'Mejor posición de conferencia histórica' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${hiConf ? chCellCls : 'text-slate-300'}`}
                          >
                            {s.confRank ? `${s.confRank}º` : '—'}
                          </td>
                          <td
                            title={hiPts ? 'Récord histórico de franquicia en PTS' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${hiPts ? chCellCls : 'text-slate-200'}`}
                          >
                            {isRel ? s.ptsPg.toFixed(1) : formatInt(s.ptsTotal)}
                          </td>
                          <td
                            title={hiReb ? 'Récord histórico de franquicia en REB' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${hiReb ? chCellCls : 'text-slate-300'}`}
                          >
                            {isRel ? s.rebPg.toFixed(1) : formatInt(rebTot)}
                          </td>
                          <td
                            title={hiAst ? 'Récord histórico de franquicia en AST' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${hiAst ? chCellCls : 'text-slate-300'}`}
                          >
                            {isRel ? s.astPg.toFixed(1) : formatInt(astTot)}
                          </td>
                          <td
                            title={hiFg ? 'Récord histórico de franquicia en TC%' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${hiFg ? chCellCls : 'text-slate-300'}`}
                          >
                            {s.fgPct.toFixed(1)}%
                          </td>
                          <td
                            title={hiFg3 ? 'Récord histórico de franquicia en T3%' : undefined}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${hiFg3 ? chCellCls : 'text-slate-300'}`}
                          >
                            {s.fg3Pct.toFixed(1)}%
                          </td>
                          <td
                            title={hiPo ? 'Récord histórico de victorias en Playoffs' : undefined}
                            className={`px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap ${hiPo ? 'bg-amber-500/15 ring-1 ring-inset ring-amber-500/30' : ''}`}
                          >
                            {fin.isChamp ? (
                              <span className="text-amber-300 font-semibold">Campeón ({s.poWins}-{s.poLosses})</span>
                            ) : fin.isFinals ? (
                              <span className="text-sky-300 font-semibold">Finales ({s.poWins}-{s.poLosses})</span>
                            ) : s.poWins + s.poLosses > 0 ? (
                              <span className={hiPo ? 'text-amber-300 font-bold' : 'text-slate-200'}>
                                {s.poWins}-{s.poLosses}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-[#0B1120] border-t-2 border-[#1E293B] font-mono tabular-nums">
                    <tr className="text-slate-400">
                      <td className="px-3 py-2 font-semibold text-slate-300 whitespace-nowrap">
                        TOTALES ACUM.
                      </td>
                      <td className="px-2 py-2 text-right text-slate-200">{formatInt(teamTotals.gp)}</td>
                      <td className="px-2 py-2 text-right text-white font-semibold">
                        {formatInt(teamTotals.wins)}-{formatInt(teamTotals.losses)}
                      </td>
                      <td className="px-2 py-2 text-right text-slate-200">
                        {teamTotals.wins + teamTotals.losses > 0
                          ? `${((teamTotals.wins / (teamTotals.wins + teamTotals.losses)) * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-right">—</td>
                      <td className="px-2 py-2 text-right text-white font-semibold">
                        {formatInt(teamTotals.ptsTotal)}
                      </td>
                      <td className="px-2 py-2 text-right">{formatInt(teamTotals.rebTotal)}</td>
                      <td className="px-2 py-2 text-right">{formatInt(teamTotals.astTotal)}</td>
                      <td className="px-2 py-2 text-right">—</td>
                      <td className="px-2 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right text-slate-200">
                        {formatInt(teamTotals.poWins)}-{formatInt(teamTotals.poLosses)}
                      </td>
                    </tr>
                    <tr className="border-t border-amber-500/35 bg-amber-500/10 text-amber-300 font-bold">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>CAREER HIGH ({isRel ? 'REL.' : 'ABS.'})</span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right">{formatInt(teamColHighs.gp)}</td>
                      <td className="px-2 py-2.5 text-right">{formatInt(teamColHighs.wins)} V</td>
                      <td className="px-2 py-2.5 text-right">{teamColHighs.winPct.toFixed(1)}%</td>
                      <td className="px-2 py-2.5 text-right">
                        {bestConfRank !== null ? `${bestConfRank}º` : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {isRel ? teamColHighs.ptsPg.toFixed(1) : formatInt(teamColHighs.ptsTotal)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {isRel ? teamColHighs.rebPg.toFixed(1) : formatInt(teamColHighs.rebTotal)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {isRel ? teamColHighs.astPg.toFixed(1) : formatInt(teamColHighs.astTotal)}
                      </td>
                      <td className="px-2 py-2.5 text-right">{teamColHighs.fgPct.toFixed(1)}%</td>
                      <td className="px-2 py-2.5 text-right">{teamColHighs.fg3Pct.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-right">
                        {teamColHighs.poWins > 0 ? `${teamColHighs.poWins} V PO` : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-6 text-center text-sm text-slate-400">
      No hay datos históricos disponibles para esta entidad.
    </div>
  );
}
