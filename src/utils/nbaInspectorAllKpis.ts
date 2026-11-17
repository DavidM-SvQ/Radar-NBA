import type {
  NbaAdvancedBenchmarkStat,
  NbaClutchEntry,
  NbaDefenseHustleEntry,
  NbaFourFactorsEntry,
  NbaPlayerDossierAdvancedResponse,
  NbaPlaytypeRow,
  NbaScoringSplitsEntry,
  NbaShotZonesEntry,
  NbaTeamDossierAdvancedResponse,
  NbaTrackingEntry,
  NbaViolationsEntry,
  PlayerGameLog,
  PlayerSummary,
  TeamGameLog,
  TeamSummary,
} from '../types/nba';
import { formatSigned, mean, round1 } from './analytics';

export type InspectorStatScale = 'per_game' | 'totals';

export type NbaKpiLayerId =
  | 'basic'
  | 'advanced'
  | 'scoring'
  | 'zones'
  | 'tracking'
  | 'hustle'
  | 'defense'
  | 'clutch'
  | 'playtypes'
  | 'violations';

export interface NbaKpiLayerMeta {
  id: NbaKpiLayerId;
  label: string;
  shortLabel: string;
}

export const NBA_KPI_LAYERS: NbaKpiLayerMeta[] = [
  { id: 'basic', label: '1. Básicas & Caja', shortLabel: '1. Básicas' },
  { id: 'advanced', label: '2. Avanzadas, 4 Factores & On/Off', shortLabel: '2. Avanzadas' },
  { id: 'scoring', label: '3. Tiro y Scoring Splits', shortLabel: '3. Scoring' },
  { id: 'zones', label: '4. Zonas de Tiro (Shot Zones)', shortLabel: '4. Zonas' },
  { id: 'tracking', label: '5. Tracking Óptico', shortLabel: '5. Tracking' },
  { id: 'hustle', label: '6. Hustle y Pintura', shortLabel: '6. Hustle' },
  { id: 'defense', label: '7. Defensa, DFG% y Rival', shortLabel: '7. Defensa' },
  { id: 'clutch', label: '8. Clutch (<5m, ±5)', shortLabel: '8. Clutch' },
  { id: 'playtypes', label: '9. Playtypes (Synergy)', shortLabel: '9. Playtypes' },
  { id: 'violations', label: '10. Infracciones, Faltas y Hitos', shortLabel: '10. Infracciones' },
];

export interface InspectorKpiContext {
  entityType: 'player' | 'team';
  statScale: InspectorStatScale;
  player?: PlayerSummary;
  team?: TeamSummary;
  playerDossier?: NbaPlayerDossierAdvancedResponse | null;
  teamDossier?: NbaTeamDossierAdvancedResponse | null;
}

export interface InspectorNbaKpiDef {
  key: string;
  layer: NbaKpiLayerId;
  label: string;
  shortLabel: string;
  helpKey: string;
  scope: 'both' | 'player' | 'team';
  keywords?: string;
  isDefaultPlayer?: boolean;
  isDefaultTeam?: boolean;
  getDisplay: (ctx: InspectorKpiContext) => {
    text: string;
    subtext?: string;
    tone?: 'positive' | 'negative' | 'accent' | 'neutral';
  };
}

function getGp(ctx: InspectorKpiContext): number {
  if (ctx.entityType === 'player' && ctx.player) {
    const s27 = ctx.player.games.filter((g) => g.seasonLabel === '2026-27').length;
    return Math.max(
      1,
      ctx.playerDossier?.tracking?.gp ||
        ctx.playerDossier?.defenseHustle?.gp ||
        ctx.player.gamesPlayed ||
        s27 ||
        ctx.player.games.length ||
        1
    );
  }
  if (ctx.entityType === 'team' && ctx.team) {
    return Math.max(
      1,
      ctx.teamDossier?.tracking?.gp ||
        ctx.teamDossier?.defenseHustle?.gp ||
        ctx.team.wins + ctx.team.losses ||
        ctx.team.games.length ||
        1
    );
  }
  return 1;
}

function getZones(ctx: InspectorKpiContext): NbaShotZonesEntry | null | undefined {
  return ctx.entityType === 'player'
    ? ctx.playerDossier?.shotZones
    : ctx.teamDossier?.shotZones;
}
function getClutch(ctx: InspectorKpiContext): NbaClutchEntry | null | undefined {
  return ctx.entityType === 'player'
    ? ctx.playerDossier?.clutch
    : ctx.teamDossier?.clutch;
}
function getDefHustle(ctx: InspectorKpiContext): NbaDefenseHustleEntry | null | undefined {
  return ctx.entityType === 'player'
    ? ctx.playerDossier?.defenseHustle
    : ctx.teamDossier?.defenseHustle;
}
function getTracking(ctx: InspectorKpiContext): NbaTrackingEntry | null | undefined {
  return ctx.entityType === 'player'
    ? ctx.playerDossier?.tracking
    : ctx.teamDossier?.tracking;
}
function getScoring(ctx: InspectorKpiContext): NbaScoringSplitsEntry | null | undefined {
  return ctx.entityType === 'player'
    ? ctx.playerDossier?.scoring
    : ctx.teamDossier?.scoring;
}
function getFourFactors(ctx: InspectorKpiContext): NbaFourFactorsEntry | null | undefined {
  return ctx.entityType === 'player'
    ? ctx.playerDossier?.fourFactors
    : ctx.teamDossier?.fourFactors;
}
function getViolations(ctx: InspectorKpiContext): NbaViolationsEntry | null | undefined {
  return ctx.entityType === 'player'
    ? ctx.playerDossier?.violations
    : ctx.teamDossier?.violations;
}
function getPlaytypesOff(ctx: InspectorKpiContext): NbaPlaytypeRow[] {
  return (
    (ctx.entityType === 'player'
      ? ctx.playerDossier?.playtypesOff
      : ctx.teamDossier?.playtypesOff) || []
  );
}
function getPlaytypesDef(ctx: InspectorKpiContext): NbaPlaytypeRow[] {
  return (
    (ctx.entityType === 'player'
      ? ctx.playerDossier?.playtypesDef
      : ctx.teamDossier?.playtypesDef) || []
  );
}

function fmtPerOrTot(
  perGameVal: number | undefined | null,
  ctx: InspectorKpiContext,
  decimalsPer = 1,
  decimalsTot = 0,
  suffix = '',
  signed = false
): string {
  if (typeof perGameVal !== 'number' || !Number.isFinite(perGameVal)) return '—';
  const gp = getGp(ctx);
  const v = ctx.statScale === 'totals' ? perGameVal * gp : perGameVal;
  const dec = ctx.statScale === 'totals' ? decimalsTot : decimalsPer;
  if (signed) return formatSigned(v, dec, suffix);
  return `${v.toFixed(dec)}${suffix}`;
}

function fmtTotOrPerFromTotals(
  totalVal: number | undefined | null,
  ctx: InspectorKpiContext,
  decimalsPer = 2
): string {
  if (typeof totalVal !== 'number' || !Number.isFinite(totalVal)) return '—';
  const gp = getGp(ctx);
  if (ctx.statScale === 'totals') return `${Math.round(totalVal)}`;
  return (totalVal / gp).toFixed(decimalsPer);
}

function fmtPctOrRaw(
  val: number | undefined | null,
  decimals = 1,
  suffix = '',
  signed = false
): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
  if (signed) return formatSigned(val, decimals, suffix);
  return `${val.toFixed(decimals)}${suffix}`;
}

function getTeamAvgOrTot(
  ctx: InspectorKpiContext,
  extractor: (g: TeamSummary['games'][number]) => number,
  decimalsPer = 1
): number | null {
  const t = ctx.team;
  if (!t || !t.games.length) return null;
  return mean(t.games.map(extractor));
}

function getPlayerSeasonGames(p?: PlayerSummary) {
  if (!p) return [];
  const s27 = p.games.filter((g) => g.seasonLabel === '2026-27');
  return s27.length > 0 ? s27 : p.games;
}

function matchPlayType(rowType: string, key: string): boolean {
  const a = String(rowType || '').toLowerCase();
  const b = String(key || '').toLowerCase();
  if (a === b) return true;
  if (
    (a === 'offrebound' || a === 'putback' || a === 'putbacks') &&
    (b === 'offrebound' || b === 'putback' || b === 'putbacks')
  ) {
    return true;
  }
  return false;
}

function playtypeCard(
  key: string,
  label: string,
  shortLabel: string,
  playTypeKey: string,
  grouping: 'offensive' | 'defensive'
): InspectorNbaKpiDef {
  return {
    key,
    layer: 'playtypes',
    label,
    shortLabel,
    helpKey: 'ppp',
    scope: 'both',
    keywords: `${playTypeKey} synergy playtype ppp`,
    getDisplay: (ctx) => {
      const list = grouping === 'offensive' ? getPlaytypesOff(ctx) : getPlaytypesDef(ctx);
      const row = list.find((r) => matchPlayType(r.playType, playTypeKey));
      if (!row) return { text: '—' };
      const possVal =
        ctx.statScale === 'totals'
          ? `${Math.round(row.poss)} pos · ${Math.round(row.pts)} pts`
          : `${row.possPct.toFixed(1)}% pos · P${Math.round(row.percentile)}`;
      const good =
        grouping === 'offensive' ? row.percentile >= 70 : row.percentile >= 70;
      const bad =
        grouping === 'offensive' ? row.percentile <= 25 : row.percentile <= 25;
      return {
        text: `${row.ppp.toFixed(2)} PPP`,
        subtext: possVal,
        tone: good ? 'positive' : bad ? 'negative' : 'accent',
      };
    },
  };
}

function violationCard(
  key: string,
  field: keyof NbaViolationsEntry,
  label: string,
  shortLabel: string,
  keywords = '',
  isDefault = false
): InspectorNbaKpiDef {
  return {
    key,
    layer: 'violations',
    label,
    shortLabel,
    helpKey: 'violationsTotal',
    scope: 'both',
    keywords: `infraccion violacion ${keywords}`,
    isDefaultPlayer: isDefault,
    isDefaultTeam: isDefault,
    getDisplay: (ctx) => {
      const v = getViolations(ctx);
      if (!v) return { text: '—' };
      const raw = Number(v[field]);
      if (!Number.isFinite(raw)) return { text: '—' };
      return {
        text: fmtTotOrPerFromTotals(raw, ctx, 2),
        subtext:
          ctx.statScale === 'per_game'
            ? `Total temp.: ${Math.round(raw)}`
            : `${(raw / getGp(ctx)).toFixed(2)} / PJ`,
      };
    },
  };
}

function shotZoneCards(
  prefix: string,
  zoneKey:
    | 'restrictedArea'
    | 'paintNonRa'
    | 'midRange'
    | 'leftCorner3'
    | 'rightCorner3'
    | 'corner3'
    | 'aboveBreak3'
    | 'backcourt',
  zoneLabel: string,
  helpKey: string,
  defaults?: { pct?: boolean; fga?: boolean }
): InspectorNbaKpiDef[] {
  return [
    {
      key: `${prefix}FgPct`,
      layer: 'zones',
      label: `${zoneLabel} % (FG%)`,
      shortLabel: `${zoneLabel} %`,
      helpKey,
      scope: 'both',
      keywords: `zona tiro ${zoneLabel}`,
      isDefaultPlayer: defaults?.pct,
      isDefaultTeam: defaults?.pct,
      getDisplay: (ctx) => {
        const z = getZones(ctx)?.[zoneKey];
        if (!z) return { text: '—' };
        const vol =
          ctx.statScale === 'totals'
            ? `${z.fgmTotal ?? Math.round(z.fgm * getGp(ctx))}/${z.fgaTotal ?? Math.round(z.fga * getGp(ctx))} tot.`
            : `${z.fgm.toFixed(1)}/${z.fga.toFixed(1)} PJ`;
        return { text: `${z.fgPct.toFixed(1)}%`, subtext: vol, tone: 'accent' };
      },
    },
    {
      key: `${prefix}Fga`,
      layer: 'zones',
      label: `${zoneLabel} Intentados (FGA)`,
      shortLabel: `${zoneLabel} FGA`,
      helpKey,
      scope: 'both',
      keywords: `zona tiro fga ${zoneLabel}`,
      isDefaultPlayer: defaults?.fga,
      isDefaultTeam: defaults?.fga,
      getDisplay: (ctx) => {
        const z = getZones(ctx)?.[zoneKey];
        if (!z) return { text: '—' };
        const gp = getGp(ctx);
        const text =
          ctx.statScale === 'totals'
            ? `${z.fgaTotal ?? Math.round(z.fga * gp)}`
            : z.fga.toFixed(1);
        const sub =
          ctx.statScale === 'totals'
            ? `${z.fga.toFixed(1)} / PJ · ${z.fgPct.toFixed(1)}%`
            : `Total: ${z.fgaTotal ?? Math.round(z.fga * gp)} · ${z.fgPct.toFixed(1)}%`;
        return { text, subtext: sub };
      },
    },
    {
      key: `${prefix}Fgm`,
      layer: 'zones',
      label: `${zoneLabel} Anotados (FGM)`,
      shortLabel: `${zoneLabel} FGM`,
      helpKey,
      scope: 'both',
      keywords: `zona tiro fgm ${zoneLabel}`,
      getDisplay: (ctx) => {
        const z = getZones(ctx)?.[zoneKey];
        if (!z) return { text: '—' };
        const gp = getGp(ctx);
        const text =
          ctx.statScale === 'totals'
            ? `${z.fgmTotal ?? Math.round(z.fgm * gp)}`
            : z.fgm.toFixed(1);
        const sub =
          ctx.statScale === 'totals'
            ? `${z.fgm.toFixed(1)} / PJ`
            : `Total: ${z.fgmTotal ?? Math.round(z.fgm * gp)}`;
        return { text, subtext: sub };
      },
    },
  ];
}

export const NBA_ALL_KPIS_CATALOG: InspectorNbaKpiDef[] = [
  // =========================================================================
  // 1. BÁSICAS & CAJA
  // =========================================================================
  {
    key: 'basic_gp',
    layer: 'basic',
    label: 'Partidos Jugados (PJ)',
    shortLabel: 'PJ',
    helpKey: 'gp',
    scope: 'both',
    getDisplay: (ctx) => ({ text: `${getGp(ctx)}` }),
  },
  {
    key: 'basic_min',
    layer: 'basic',
    label: 'Minutos',
    shortLabel: 'MIN',
    helpKey: 'minBase',
    scope: 'player',
    getDisplay: (ctx) => {
      const m = getViolations(ctx)?.min ?? ctx.player?.minutesAvg;
      return { text: fmtPerOrTot(m, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_pts',
    layer: 'basic',
    label: 'Puntos',
    shortLabel: 'PTS',
    helpKey: 'ptsBase',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? ctx.player?.ptsAvg
          : ctx.team?.avgPointsFor;
      return { text: fmtPerOrTot(v, ctx, 1, 0), tone: 'accent' };
    },
  },
  {
    key: 'basic_opp_pts',
    layer: 'basic',
    label: 'Puntos Contra (Rival)',
    shortLabel: 'PTS Contra',
    helpKey: 'avgPointsAgainst',
    scope: 'team',
    getDisplay: (ctx) => ({
      text: fmtPerOrTot(ctx.team?.avgPointsAgainst, ctx, 1, 0),
    }),
  },
  {
    key: 'basic_diff',
    layer: 'basic',
    label: 'Diferencial de Puntos',
    shortLabel: 'DIF',
    helpKey: 'differential',
    scope: 'team',
    getDisplay: (ctx) => {
      const d = ctx.team?.differential ?? 0;
      return {
        text: fmtPerOrTot(d, ctx, 1, 0, '', true),
        tone: d >= 0 ? 'positive' : 'negative',
      };
    },
  },
  {
    key: 'basic_reb',
    layer: 'basic',
    label: 'Rebotes Totales (REB)',
    shortLabel: 'REB',
    helpKey: 'rebBase',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? ctx.player?.rebAvg
          : getTeamAvgOrTot(ctx, (g) => (g.oreb || 0) + (g.dreb || 0));
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_oreb',
    layer: 'basic',
    label: 'Rebotes Ofensivos (OREB)',
    shortLabel: 'OREB',
    helpKey: 'orebBase',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => g.oreb))
          : getTeamAvgOrTot(ctx, (g) => g.oreb || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_dreb',
    layer: 'basic',
    label: 'Rebotes Defensivos (DREB)',
    shortLabel: 'DREB',
    helpKey: 'drebBase',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => g.dreb))
          : getTeamAvgOrTot(ctx, (g) => g.dreb || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_ast',
    layer: 'basic',
    label: 'Asistencias (AST)',
    shortLabel: 'AST',
    helpKey: 'astBase',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? ctx.player?.astAvg
          : getTeamAvgOrTot(ctx, (g) => g.ast || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_stl',
    layer: 'basic',
    label: 'Robos (STL)',
    shortLabel: 'ROB',
    helpKey: 'steals',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? ctx.player?.stlAvg
          : getDefHustle(ctx)?.stl ?? getTeamAvgOrTot(ctx, (g) => g.stl || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_blk',
    layer: 'basic',
    label: 'Tapones (BLK)',
    shortLabel: 'TAP',
    helpKey: 'blocks',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? ctx.player?.blkAvg
          : getDefHustle(ctx)?.blk ?? getTeamAvgOrTot(ctx, (g) => g.blk || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_stocks',
    layer: 'basic',
    label: 'Robos + Tapones (STK)',
    shortLabel: 'STK',
    helpKey: 'stocksBase',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? (ctx.player?.stlAvg || 0) + (ctx.player?.blkAvg || 0)
          : (getDefHustle(ctx)?.stl ?? getTeamAvgOrTot(ctx, (g) => g.stl || 0) ?? 0) +
            (getDefHustle(ctx)?.blk ?? getTeamAvgOrTot(ctx, (g) => g.blk || 0) ?? 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_fgPct',
    layer: 'basic',
    label: '% Tiros de Campo (FG%)',
    shortLabel: 'FG%',
    helpKey: 'fgPct',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? ctx.player?.fgPct
          : (() => {
              const g = ctx.team?.games || [];
              const fgm = g.reduce((s, x) => s + (x.fgm || 0), 0);
              const fga = g.reduce((s, x) => s + (x.fga || 0), 0);
              return fga > 0 ? round1((fgm / fga) * 100) : 0;
            })();
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'basic_fg3m',
    layer: 'basic',
    label: 'Triples Anotados (3PM)',
    shortLabel: '3PM',
    helpKey: 'fg3m',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => g.fg3m))
          : getTeamAvgOrTot(ctx, (g) => g.fg3m || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_fg3a',
    layer: 'basic',
    label: 'Triples Intentados (3PA)',
    shortLabel: '3PA',
    helpKey: 'fg3a',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => g.fg3a))
          : getTeamAvgOrTot(ctx, (g) => g.fg3a || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_fg3Pct',
    layer: 'basic',
    label: '% Triples (3P%)',
    shortLabel: '3P%',
    helpKey: 'fg3Pct',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player' ? ctx.player?.fg3Pct : ctx.team?.fg3Pct;
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'basic_ftPct',
    layer: 'basic',
    label: '% Tiros Libres (FT%)',
    shortLabel: 'FT%',
    helpKey: 'ftPct',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player' ? ctx.player?.ftPct : ctx.team?.ftPct;
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'basic_plusMinus',
    layer: 'basic',
    label: 'Más / Menos (+/-)',
    shortLabel: '+/-',
    helpKey: 'plusMinusBase',
    scope: 'player',
    getDisplay: (ctx) => {
      const v = mean(getPlayerSeasonGames(ctx.player).map((g) => g.plusMinus));
      return {
        text: fmtPerOrTot(v, ctx, 1, 0, '', true),
        tone: v >= 0 ? 'positive' : 'negative',
      };
    },
  },
  {
    key: 'basic_pra',
    layer: 'basic',
    label: 'Producción PRA (PTS+REB+AST)',
    shortLabel: 'PRA',
    helpKey: 'pra',
    scope: 'player',
    getDisplay: (ctx) => {
      const v = mean(getPlayerSeasonGames(ctx.player).map((g) => g.pra));
      return { text: fmtPerOrTot(v, ctx, 1, 0), tone: 'accent' };
    },
  },
  {
    key: 'basic_fgm',
    layer: 'basic',
    label: 'Tiros de Campo Anotados (FGM)',
    shortLabel: 'FGM',
    helpKey: 'fgmMade',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => g.fgm))
          : getTeamAvgOrTot(ctx, (g) => g.fgm || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_fga',
    layer: 'basic',
    label: 'Tiros de Campo Intentados (FGA)',
    shortLabel: 'FGA',
    helpKey: 'fga',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => g.fga))
          : getTeamAvgOrTot(ctx, (g) => g.fga || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_fg2m',
    layer: 'basic',
    label: 'Tiros de 2 Anotados (2PM)',
    shortLabel: '2PM',
    helpKey: 'fg2m',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => Math.max(0, g.fgm - g.fg3m)))
          : getTeamAvgOrTot(ctx, (g) => Math.max(0, (g.fgm || 0) - (g.fg3m || 0)));
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_fg2a',
    layer: 'basic',
    label: 'Tiros de 2 Intentados (2PA)',
    shortLabel: '2PA',
    helpKey: 'fg2a',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => Math.max(0, g.fga - g.fg3a)))
          : getTeamAvgOrTot(ctx, (g) => Math.max(0, (g.fga || 0) - (g.fg3a || 0)));
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_fg2Pct',
    layer: 'basic',
    label: '% Tiros de 2 (2P%)',
    shortLabel: '2P%',
    helpKey: 'fg2Pct',
    scope: 'both',
    getDisplay: (ctx) => {
      const gs =
        ctx.entityType === 'player'
          ? getPlayerSeasonGames(ctx.player)
          : ctx.team?.games || [];
      const m2 = gs.reduce((s, g) => s + Math.max(0, (g.fgm || 0) - (g.fg3m || 0)), 0);
      const a2 = gs.reduce((s, g) => s + Math.max(0, (g.fga || 0) - (g.fg3a || 0)), 0);
      const v = a2 > 0 ? round1((m2 / a2) * 100) : 0;
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'basic_ftm',
    layer: 'basic',
    label: 'Tiros Libres Anotados (FTM)',
    shortLabel: 'FTM',
    helpKey: 'ftmMade',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => g.ftm))
          : getTeamAvgOrTot(ctx, (g) => g.ftm || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'basic_fta',
    layer: 'basic',
    label: 'Tiros Libres Intentados (FTA)',
    shortLabel: 'FTA',
    helpKey: 'fta',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => g.fta))
          : getTeamAvgOrTot(ctx, (g) => g.fta || 0);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },

  // =========================================================================
  // 2. AVANZADAS, 4 FACTORES & ON/OFF
  // =========================================================================
  {
    key: 'adv_offRtg',
    layer: 'advanced',
    label: 'Offensive Rating (OffRtg)',
    shortLabel: 'OffRtg',
    helpKey: 'offRtg',
    scope: 'both',
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const ff = getFourFactors(ctx);
      const v =
        ff?.offRtg ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.offRtg
          : ctx.team?.offRtg);
      return { text: fmtPctOrRaw(v, 1) };
    },
  },
  {
    key: 'adv_defRtg',
    layer: 'advanced',
    label: 'Defensive Rating (DefRtg)',
    shortLabel: 'DefRtg',
    helpKey: 'defRtg',
    scope: 'both',
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const ff = getFourFactors(ctx);
      const v =
        ff?.defRtg ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.defRtg
          : ctx.team?.defRtg);
      return { text: fmtPctOrRaw(v, 1) };
    },
  },
  {
    key: 'adv_netRtg',
    layer: 'advanced',
    label: 'Net Rating (NetRtg)',
    shortLabel: 'NetRtg',
    helpKey: 'netRtg',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const ff = getFourFactors(ctx);
      const v =
        ff?.netRtg ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.netRtg
          : ctx.team?.netRtg);
      return {
        text: fmtPctOrRaw(v, 1, '', true),
        tone: (v ?? 0) >= 0 ? 'positive' : 'negative',
      };
    },
  },
  {
    key: 'adv_pace',
    layer: 'advanced',
    label: 'Ritmo (Pace)',
    shortLabel: 'Pace',
    helpKey: 'paceSimple',
    scope: 'both',
    getDisplay: (ctx) => {
      const ff = getFourFactors(ctx);
      const v =
        ff?.pace ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.pace
          : ctx.team?.pace);
      return { text: fmtPctOrRaw(v, 1) };
    },
  },
  {
    key: 'adv_efgPct',
    layer: 'advanced',
    label: 'Tiro Efectivo (eFG%)',
    shortLabel: 'eFG%',
    helpKey: 'efgPct',
    scope: 'both',
    getDisplay: (ctx) => {
      const ff = getFourFactors(ctx);
      const v =
        ff?.efgPct ??
        (ctx.entityType === 'player' ? ctx.player?.efgPct : ctx.team?.efgPct);
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'adv_tsPct',
    layer: 'advanced',
    label: 'Acierto Real (TS%)',
    shortLabel: 'TS%',
    helpKey: 'tsPct',
    scope: 'both',
    getDisplay: (ctx) => {
      const ff = getFourFactors(ctx);
      const v =
        ff?.tsPct ??
        (ctx.entityType === 'player' ? ctx.player?.tsPct : ctx.team?.tsPct);
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'adv_usgPct',
    layer: 'advanced',
    label: 'Uso Ofensivo (USG%)',
    shortLabel: 'USG%',
    helpKey: 'usgPct',
    scope: 'player',
    getDisplay: (ctx) => {
      const v = getFourFactors(ctx)?.usgPct ?? ctx.player?.usgAvg;
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'adv_pie',
    layer: 'advanced',
    label: 'Impacto Global NBA.com (PIE%)',
    shortLabel: 'PIE%',
    helpKey: 'pie',
    scope: 'both',
    isDefaultPlayer: true,
    getDisplay: (ctx) => {
      const ff = getFourFactors(ctx);
      const v =
        ff?.pie ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.pie
          : ctx.team?.advanced?.pie);
      return { text: fmtPctOrRaw(v, 1, '%'), tone: 'accent' };
    },
  },
  {
    key: 'adv_astPct',
    layer: 'advanced',
    label: '% Asistencias (AST%)',
    shortLabel: 'AST%',
    helpKey: 'astPct',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getFourFactors(ctx)?.astPct ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.astPct
          : ctx.team?.advanced?.astPct);
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'adv_astRatio',
    layer: 'advanced',
    label: 'Ratio Asistencias (AST Ratio)',
    shortLabel: 'AST Ratio',
    helpKey: 'astRatio',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getFourFactors(ctx)?.astRatio ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.astRatio
          : ctx.team?.advanced?.astRatio);
      return { text: fmtPctOrRaw(v, 1) };
    },
  },
  {
    key: 'adv_astTo',
    layer: 'advanced',
    label: 'Ratio Asist./Pérdidas (AST/TO)',
    shortLabel: 'AST/TO',
    helpKey: 'astTo',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getFourFactors(ctx)?.astTo ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.astTo
          : ctx.team?.advanced?.astTo);
      return { text: fmtPctOrRaw(v, 2) };
    },
  },
  {
    key: 'adv_orebPct',
    layer: 'advanced',
    label: '% Rebote Ofensivo (OREB%)',
    shortLabel: 'OREB%',
    helpKey: 'orebPct',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getFourFactors(ctx)?.orebPct ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.orebPct
          : ctx.team?.orebPct);
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'adv_drebPct',
    layer: 'advanced',
    label: '% Rebote Defensivo (DREB%)',
    shortLabel: 'DREB%',
    helpKey: 'drebPct',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getFourFactors(ctx)?.drebPct ??
        getDefHustle(ctx)?.drebPct ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.drebPct
          : ctx.team?.advanced?.drebPct);
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'adv_rebPct',
    layer: 'advanced',
    label: '% Rebote Total (REB%)',
    shortLabel: 'REB%',
    helpKey: 'rebPct',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getFourFactors(ctx)?.rebPct ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.rebPct
          : ctx.team?.advanced?.rebPct);
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'adv_tovPct',
    layer: 'advanced',
    label: '% Pérdidas (TOV%)',
    shortLabel: 'TOV%',
    helpKey: 'tovPct',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getFourFactors(ctx)?.tmTovPct ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.tovPct
          : ctx.team?.tovPct);
      return { text: fmtPctOrRaw(v, 1, '%') };
    },
  },
  {
    key: 'adv_ftaRate',
    layer: 'advanced',
    label: '4F: Tasa Tiros Libres (FTA Rate)',
    shortLabel: 'FTA Rate',
    helpKey: 'ftRate',
    scope: 'both',
    getDisplay: (ctx) => {
      const v = getFourFactors(ctx)?.ftaRate ?? ctx.team?.ftRate;
      return { text: fmtPctOrRaw(v, 3) };
    },
  },
  {
    key: 'adv_oppEfgPct',
    layer: 'advanced',
    label: '4F Rival: Opp eFG%',
    shortLabel: 'Opp eFG%',
    helpKey: 'oppFourFactors',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getFourFactors(ctx)?.oppEfgPct, 1, '%'),
    }),
  },
  {
    key: 'adv_oppTovPct',
    layer: 'advanced',
    label: '4F Rival: Opp TOV%',
    shortLabel: 'Opp TOV%',
    helpKey: 'oppFourFactors',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getFourFactors(ctx)?.oppTovPct, 1, '%'),
    }),
  },
  {
    key: 'adv_oppOrebPct',
    layer: 'advanced',
    label: '4F Rival: Opp OREB%',
    shortLabel: 'Opp OREB%',
    helpKey: 'oppFourFactors',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getFourFactors(ctx)?.oppOrebPct, 1, '%'),
    }),
  },
  {
    key: 'adv_oppFtaRate',
    layer: 'advanced',
    label: '4F Rival: Opp FTA Rate',
    shortLabel: 'Opp FTr',
    helpKey: 'oppFourFactors',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getFourFactors(ctx)?.oppFtaRate, 3),
    }),
  },
  {
    key: 'adv_onOffNetDiff',
    layer: 'advanced',
    label: 'On/Off Net Swing (+/-)',
    shortLabel: 'On/Off Swing',
    helpKey: 'onOffSwing',
    scope: 'player',
    keywords: 'on off court impacto',
    isDefaultPlayer: true,
    getDisplay: (ctx) => {
      const o = ctx.playerDossier?.onOffSplit;
      if (!o) return { text: '—' };
      return {
        text: formatSigned(o.netDiff, 1),
        subtext: `ON ${formatSigned(o.netRtgOn)} / OFF ${formatSigned(o.netRtgOff)}`,
        tone: o.netDiff >= 0 ? 'positive' : 'negative',
      };
    },
  },
  {
    key: 'adv_onOffNetOn',
    layer: 'advanced',
    label: 'On-Court NetRtg (en pista)',
    shortLabel: 'NetRtg ON',
    helpKey: 'onOffSwing',
    scope: 'player',
    getDisplay: (ctx) => {
      const o = ctx.playerDossier?.onOffSplit;
      if (!o) return { text: '—' };
      return {
        text: formatSigned(o.netRtgOn, 1),
        subtext: `${o.minOn.toFixed(1)} min/PJ ON`,
        tone: o.netRtgOn >= 0 ? 'positive' : 'negative',
      };
    },
  },
  {
    key: 'adv_onOffNetOff',
    layer: 'advanced',
    label: 'Off-Court NetRtg (banquillo)',
    shortLabel: 'NetRtg OFF',
    helpKey: 'onOffSwing',
    scope: 'player',
    getDisplay: (ctx) => {
      const o = ctx.playerDossier?.onOffSplit;
      if (!o) return { text: '—' };
      return {
        text: formatSigned(o.netRtgOff, 1),
        subtext: `${o.minOff.toFixed(1)} min/PJ OFF`,
      };
    },
  },
  {
    key: 'adv_gmSc',
    layer: 'advanced',
    label: 'Valoración Game Score (GmSc)',
    shortLabel: 'GmSc',
    helpKey: 'gmSc',
    scope: 'player',
    getDisplay: (ctx) => {
      const v = mean(getPlayerSeasonGames(ctx.player).map((g) => g.gameScore));
      return { text: fmtPctOrRaw(v, 1) };
    },
  },
  {
    key: 'adv_ptsPerShot',
    layer: 'advanced',
    label: 'Puntos por Tiro (PTS/FGA)',
    shortLabel: 'PTS/TCI',
    helpKey: 'ptsPerShot',
    scope: 'both',
    getDisplay: (ctx) => {
      if (ctx.entityType === 'player') {
        const gs = getPlayerSeasonGames(ctx.player);
        const pts = gs.reduce((s, g) => s + g.points, 0);
        const fga = gs.reduce((s, g) => s + g.fga, 0);
        return { text: fga > 0 ? (pts / fga).toFixed(2) : '—' };
      }
      const gs = ctx.team?.games || [];
      const pts = gs.reduce((s, g) => s + g.pointsFor, 0);
      const fga = gs.reduce((s, g) => s + g.fga, 0);
      return { text: fga > 0 ? (pts / fga).toFixed(2) : '—' };
    },
  },
  {
    key: 'adv_ptsPer36',
    layer: 'advanced',
    label: 'Puntos por 36 min',
    shortLabel: 'PTS/36',
    helpKey: 'ptsPer36',
    scope: 'player',
    getDisplay: (ctx) => {
      const gs = getPlayerSeasonGames(ctx.player);
      const pts = gs.reduce((s, g) => s + g.points, 0);
      const min = gs.reduce((s, g) => s + g.minutes, 0);
      return { text: min > 0 ? ((pts / min) * 36).toFixed(1) : '—' };
    },
  },
  {
    key: 'adv_rebPer36',
    layer: 'advanced',
    label: 'Rebotes por 36 min',
    shortLabel: 'REB/36',
    helpKey: 'rebPer36',
    scope: 'player',
    getDisplay: (ctx) => {
      const gs = getPlayerSeasonGames(ctx.player);
      const reb = gs.reduce((s, g) => s + g.rebounds, 0);
      const min = gs.reduce((s, g) => s + g.minutes, 0);
      return { text: min > 0 ? ((reb / min) * 36).toFixed(1) : '—' };
    },
  },
  {
    key: 'adv_astPer36',
    layer: 'advanced',
    label: 'Asistencias por 36 min',
    shortLabel: 'AST/36',
    helpKey: 'astPer36',
    scope: 'player',
    getDisplay: (ctx) => {
      const gs = getPlayerSeasonGames(ctx.player);
      const ast = gs.reduce((s, g) => s + g.assists, 0);
      const min = gs.reduce((s, g) => s + g.minutes, 0);
      return { text: min > 0 ? ((ast / min) * 36).toFixed(1) : '—' };
    },
  },
  {
    key: 'adv_praPer36',
    layer: 'advanced',
    label: 'PRA por 36 min',
    shortLabel: 'PRA/36',
    helpKey: 'praPer36',
    scope: 'player',
    getDisplay: (ctx) => {
      const gs = getPlayerSeasonGames(ctx.player);
      const pra = gs.reduce((s, g) => s + g.pra, 0);
      const min = gs.reduce((s, g) => s + g.minutes, 0);
      return { text: min > 0 ? ((pra / min) * 36).toFixed(1) : '—' };
    },
  },
  {
    key: 'adv_stocksPer36',
    layer: 'advanced',
    label: 'Robos + Tapones por 36 min',
    shortLabel: 'STK/36',
    helpKey: 'stocksPer36',
    scope: 'player',
    getDisplay: (ctx) => {
      const gs = getPlayerSeasonGames(ctx.player);
      const stk = gs.reduce((s, g) => s + g.stocks, 0);
      const min = gs.reduce((s, g) => s + g.minutes, 0);
      return { text: min > 0 ? ((stk / min) * 36).toFixed(1) : '—' };
    },
  },

  // =========================================================================
  // 3. TIRO Y SCORING SPLITS (15 estadísticas oficiales)
  // =========================================================================
  {
    key: 'sc_pctFga2pt',
    layer: 'scoring',
    label: '%FGA de 2 Puntos',
    shortLabel: '%FGA 2P',
    helpKey: 'pctFga2pt',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctFga2pt, 1, '%') }),
  },
  {
    key: 'sc_pctFga3pt',
    layer: 'scoring',
    label: '%FGA de 3 Puntos',
    shortLabel: '%FGA 3P',
    helpKey: 'pctFga3pt',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getScoring(ctx)?.pctFga3pt, 1, '%'),
      tone: 'accent',
    }),
  },
  {
    key: 'sc_pctPts2pt',
    layer: 'scoring',
    label: '%PTS de 2 Puntos',
    shortLabel: '%PTS 2P',
    helpKey: 'pctPts2pt',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctPts2pt, 1, '%') }),
  },
  {
    key: 'sc_pctPts2ptMr',
    layer: 'scoring',
    label: '%PTS Media Distancia',
    shortLabel: '%PTS MidR',
    helpKey: 'pctPts2ptMr',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctPts2ptMr, 1, '%') }),
  },
  {
    key: 'sc_pctPts3pt',
    layer: 'scoring',
    label: '%PTS en Triples',
    shortLabel: '%PTS 3P',
    helpKey: 'pctPts3pt',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctPts3pt, 1, '%') }),
  },
  {
    key: 'sc_pctPtsFb',
    layer: 'scoring',
    label: '%PTS Contraataque',
    shortLabel: '%PTS FB',
    helpKey: 'pctPtsFb',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctPtsFb, 1, '%') }),
  },
  {
    key: 'sc_pctPtsFt',
    layer: 'scoring',
    label: '%PTS Tiros Libres',
    shortLabel: '%PTS TL',
    helpKey: 'pctPtsFt',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctPtsFt, 1, '%') }),
  },
  {
    key: 'sc_pctPtsOffTov',
    layer: 'scoring',
    label: '%PTS tras Pérdida Rival',
    shortLabel: '%PTS OffTOV',
    helpKey: 'pctPtsOffTov',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctPtsOffTov, 1, '%') }),
  },
  {
    key: 'sc_pctPtsPaint',
    layer: 'scoring',
    label: '%PTS en Pintura',
    shortLabel: '%PTS Pintura',
    helpKey: 'pctPtsPaint',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getScoring(ctx)?.pctPtsPaint, 1, '%'),
      tone: 'positive',
    }),
  },
  {
    key: 'sc_pctAst2pm',
    layer: 'scoring',
    label: '% 2PM Asistidos',
    shortLabel: '%AST 2P',
    helpKey: 'pctAstFgm',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctAst2pm, 1, '%') }),
  },
  {
    key: 'sc_pctUast2pm',
    layer: 'scoring',
    label: '% 2PM Sin Asistir',
    shortLabel: '%UAST 2P',
    helpKey: 'pctUastFgm',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctUast2pm, 1, '%') }),
  },
  {
    key: 'sc_pctAst3pm',
    layer: 'scoring',
    label: '% 3PM Asistidos',
    shortLabel: '%AST 3P',
    helpKey: 'pctAstFgm',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctAst3pm, 1, '%') }),
  },
  {
    key: 'sc_pctUast3pm',
    layer: 'scoring',
    label: '% 3PM Sin Asistir',
    shortLabel: '%UAST 3P',
    helpKey: 'pctUastFgm',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctUast3pm, 1, '%') }),
  },
  {
    key: 'sc_pctAstFgm',
    layer: 'scoring',
    label: '% Canastas Asistidas',
    shortLabel: '%AST FGM',
    helpKey: 'pctAstFgm',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctAstFgm, 1, '%') }),
  },
  {
    key: 'sc_pctUastFgm',
    layer: 'scoring',
    label: '% Canastas Autogeneradas',
    shortLabel: '%UAST FGM',
    helpKey: 'pctUastFgm',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getScoring(ctx)?.pctUastFgm, 1, '%') }),
  },

  // =========================================================================
  // 4. ZONAS DE TIRO (SHOT ZONES OFICIALES)
  // =========================================================================
  ...shotZoneCards('zn_ra', 'restrictedArea', 'Bajo Aro (RA)', 'restrictedArea', {
    pct: true,
    fga: true,
  }),
  ...shotZoneCards('zn_paintNonRa', 'paintNonRa', 'Pintura (No RA)', 'ptsPaint', {
    pct: false,
  }),
  ...shotZoneCards('zn_mid', 'midRange', 'Media Distancia', 'pctPts2ptMr'),
  ...shotZoneCards('zn_lc3', 'leftCorner3', 'Triple Esq. Izq.', 'corner3'),
  ...shotZoneCards('zn_rc3', 'rightCorner3', 'Triple Esq. Der.', 'corner3'),
  ...shotZoneCards('zn_corner3', 'corner3', 'Triples Esquina (Tot)', 'corner3', {
    pct: true,
  }),
  ...shotZoneCards('zn_ab3', 'aboveBreak3', 'Triple Cabecera / Alas', 'corner3', {
    pct: true,
  }),
  ...shotZoneCards('zn_bc', 'backcourt', 'Campo Propio (Backcourt)', 'fg3a'),
  {
    key: 'zn_totalRimFga',
    layer: 'zones',
    label: 'Aro Intentados (Total Rim FGA)',
    shortLabel: 'Vol. Aro FGA',
    helpKey: 'restrictedArea',
    scope: 'both',
    getDisplay: (ctx) => {
      const z = getZones(ctx);
      if (!z) return { text: '—' };
      const text =
        ctx.statScale === 'totals'
          ? `${z.totalRimFgaTotal ?? Math.round(z.totalRimFga * getGp(ctx))}`
          : z.totalRimFga.toFixed(1);
      return { text, subtext: `${z.rimFgPct.toFixed(1)}% acierto` };
    },
  },
  {
    key: 'zn_rimFgPct',
    layer: 'zones',
    label: 'Aro % Global (Rim FG%)',
    shortLabel: 'Aro FG% Tot',
    helpKey: 'restrictedArea',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getZones(ctx)?.rimFgPct, 1, '%'),
    }),
  },
  {
    key: 'zn_totalThreeFga',
    layer: 'zones',
    label: 'Triples Zonas Intentados (3PA)',
    shortLabel: 'Zonas 3PA',
    helpKey: 'fg3a',
    scope: 'both',
    getDisplay: (ctx) => {
      const z = getZones(ctx);
      if (!z) return { text: '—' };
      const text =
        ctx.statScale === 'totals'
          ? `${z.totalThreeFgaTotal ?? Math.round(z.totalThreeFga * getGp(ctx))}`
          : z.totalThreeFga.toFixed(1);
      return { text, subtext: `${z.threeFgPct.toFixed(1)}% 3P` };
    },
  },
  {
    key: 'zn_threeFgPct',
    layer: 'zones',
    label: 'Triple % Global Zonas',
    shortLabel: 'Zonas 3P%',
    helpKey: 'fg3Pct',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getZones(ctx)?.threeFgPct, 1, '%'),
    }),
  },

  // =========================================================================
  // 5. TRACKING ÓPTICO (SECOND SPECTRUM)
  // =========================================================================
  {
    key: 'tr_drives',
    layer: 'tracking',
    label: 'Penetraciones (Drives)',
    shortLabel: 'Drives',
    helpKey: 'drives',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const t = getTracking(ctx);
      if (!t) return { text: '—' };
      return {
        text: fmtPerOrTot(t.drives, ctx, 1, 0),
        subtext: `${t.drivePts.toFixed(1)} pts/PJ · ${t.driveFgPct.toFixed(1)}% FG`,
        tone: 'accent',
      };
    },
  },
  {
    key: 'tr_driveFgm',
    layer: 'tracking',
    label: 'Drives Tiros Anotados (FGM)',
    shortLabel: 'Drive FGM',
    helpKey: 'drives',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.driveFgm, ctx, 1, 0) }),
  },
  {
    key: 'tr_driveFga',
    layer: 'tracking',
    label: 'Drives Tiros Intentados (FGA)',
    shortLabel: 'Drive FGA',
    helpKey: 'drives',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.driveFga, ctx, 1, 0) }),
  },
  {
    key: 'tr_drivePts',
    layer: 'tracking',
    label: 'Puntos en Penetraciones (Drive PTS)',
    shortLabel: 'Drive PTS',
    helpKey: 'drives',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.drivePts, ctx, 1, 0) }),
  },
  {
    key: 'tr_driveFgPct',
    layer: 'tracking',
    label: 'Drives FG%',
    shortLabel: 'Drive FG%',
    helpKey: 'drives',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.driveFgPct, 1, '%') }),
  },
  {
    key: 'tr_driveAstPct',
    layer: 'tracking',
    label: 'Drives % Asistencia (AST%)',
    shortLabel: 'Drive AST%',
    helpKey: 'drives',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.driveAstPct, 1, '%') }),
  },
  {
    key: 'tr_driveTovPct',
    layer: 'tracking',
    label: 'Drives % Pérdida (TOV%)',
    shortLabel: 'Drive TOV%',
    helpKey: 'drives',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.driveTovPct, 1, '%') }),
  },
  {
    key: 'tr_drivePassesPct',
    layer: 'tracking',
    label: 'Drives % Pase (PASS%)',
    shortLabel: 'Drive Pass%',
    helpKey: 'drives',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.drivePassesPct, 1, '%') }),
  },
  {
    key: 'tr_csPts',
    layer: 'tracking',
    label: 'Catch & Shoot Puntos',
    shortLabel: 'C&S PTS',
    helpKey: 'catchShoot',
    scope: 'both',
    isDefaultPlayer: true,
    getDisplay: (ctx) => {
      const t = getTracking(ctx);
      if (!t) return { text: '—' };
      return {
        text: fmtPerOrTot(t.catchShootPts, ctx, 1, 0),
        subtext: `${t.catchShootFg3Pct.toFixed(1)}% 3P · ${t.catchShootEfgPct.toFixed(1)}% eFG`,
        tone: 'positive',
      };
    },
  },
  {
    key: 'tr_csFgm',
    layer: 'tracking',
    label: 'Catch & Shoot FGM',
    shortLabel: 'C&S FGM',
    helpKey: 'catchShoot',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.catchShootFgm, ctx, 1, 0) }),
  },
  {
    key: 'tr_csFga',
    layer: 'tracking',
    label: 'Catch & Shoot FGA',
    shortLabel: 'C&S FGA',
    helpKey: 'catchShoot',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.catchShootFga, ctx, 1, 0) }),
  },
  {
    key: 'tr_csFgPct',
    layer: 'tracking',
    label: 'Catch & Shoot FG%',
    shortLabel: 'C&S FG%',
    helpKey: 'catchShoot',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.catchShootFgPct, 1, '%') }),
  },
  {
    key: 'tr_csFg3Pct',
    layer: 'tracking',
    label: 'Catch & Shoot 3P%',
    shortLabel: 'C&S 3P%',
    helpKey: 'catchShoot',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.catchShootFg3Pct, 1, '%') }),
  },
  {
    key: 'tr_csEfgPct',
    layer: 'tracking',
    label: 'Catch & Shoot eFG%',
    shortLabel: 'C&S eFG%',
    helpKey: 'catchShoot',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.catchShootEfgPct, 1, '%') }),
  },
  {
    key: 'tr_puPts',
    layer: 'tracking',
    label: 'Pull-Up Puntos (Tras bote)',
    shortLabel: 'PullUp PTS',
    helpKey: 'pullUp',
    scope: 'both',
    getDisplay: (ctx) => {
      const t = getTracking(ctx);
      if (!t) return { text: '—' };
      return {
        text: fmtPerOrTot(t.pullUpPts, ctx, 1, 0),
        subtext: `${t.pullUpFg3Pct.toFixed(1)}% 3P · ${t.pullUpEfgPct.toFixed(1)}% eFG`,
      };
    },
  },
  {
    key: 'tr_puFgm',
    layer: 'tracking',
    label: 'Pull-Up FGM',
    shortLabel: 'PullUp FGM',
    helpKey: 'pullUp',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.pullUpFgm, ctx, 1, 0) }),
  },
  {
    key: 'tr_puFga',
    layer: 'tracking',
    label: 'Pull-Up FGA',
    shortLabel: 'PullUp FGA',
    helpKey: 'pullUp',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.pullUpFga, ctx, 1, 0) }),
  },
  {
    key: 'tr_puFgPct',
    layer: 'tracking',
    label: 'Pull-Up FG%',
    shortLabel: 'PullUp FG%',
    helpKey: 'pullUp',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.pullUpFgPct, 1, '%') }),
  },
  {
    key: 'tr_puFg3Pct',
    layer: 'tracking',
    label: 'Pull-Up 3P%',
    shortLabel: 'PullUp 3P%',
    helpKey: 'pullUp',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.pullUpFg3Pct, 1, '%') }),
  },
  {
    key: 'tr_puEfgPct',
    layer: 'tracking',
    label: 'Pull-Up eFG%',
    shortLabel: 'PullUp eFG%',
    helpKey: 'pullUp',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.pullUpEfgPct, 1, '%') }),
  },
  {
    key: 'tr_passesMade',
    layer: 'tracking',
    label: 'Pases Dados',
    shortLabel: 'Pases Dados',
    helpKey: 'potentialAst',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.passesMade, ctx, 1, 0) }),
  },
  {
    key: 'tr_passesRec',
    layer: 'tracking',
    label: 'Pases Recibidos',
    shortLabel: 'Pases Rec.',
    helpKey: 'potentialAst',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.passesReceived, ctx, 1, 0) }),
  },
  {
    key: 'tr_secAst',
    layer: 'tracking',
    label: 'Asistencias Secundarias (Hockey)',
    shortLabel: 'Ast. Sec.',
    helpKey: 'potentialAst',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.secondaryAst, ctx, 1, 0) }),
  },
  {
    key: 'tr_potAst',
    layer: 'tracking',
    label: 'Asistencias Potenciales',
    shortLabel: 'Ast. Potenc.',
    helpKey: 'potentialAst',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.potentialAst, ctx, 1, 0) }),
  },
  {
    key: 'tr_astPtsCreated',
    layer: 'tracking',
    label: 'Puntos Creados por Pase',
    shortLabel: 'PTS x Pase',
    helpKey: 'potentialAst',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.astPtsCreated, ctx, 1, 0) }),
  },
  {
    key: 'tr_astToPassAdj',
    layer: 'tracking',
    label: '% Asist./Pase Ajustado',
    shortLabel: 'AST/Pass%',
    helpKey: 'potentialAst',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.astToPassPctAdj, 1, '%') }),
  },
  {
    key: 'tr_touches',
    layer: 'tracking',
    label: 'Toques Totales (Touches)',
    shortLabel: 'Toques',
    helpKey: 'touches',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.touches, ctx, 1, 0) }),
  },
  {
    key: 'tr_frontCtTouches',
    layer: 'tracking',
    label: 'Toques en Campo Ofensivo',
    shortLabel: 'Toq. Camp.At.',
    helpKey: 'touches',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.frontCtTouches, ctx, 1, 0) }),
  },
  {
    key: 'tr_timeOfPoss',
    layer: 'tracking',
    label: 'Tiempo de Posesión (min)',
    shortLabel: 'T. Posesión',
    helpKey: 'timeOfPoss',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.timeOfPoss, ctx, 1, 1, 'm') }),
  },
  {
    key: 'tr_secPerTouch',
    layer: 'tracking',
    label: 'Segundos por Toque',
    shortLabel: 'Seg/Toque',
    helpKey: 'timeOfPoss',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.avgSecPerTouch, 2, 's') }),
  },
  {
    key: 'tr_dribPerTouch',
    layer: 'tracking',
    label: 'Botes por Toque',
    shortLabel: 'Botes/Toque',
    helpKey: 'touches',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.avgDribPerTouch, 2) }),
  },
  {
    key: 'tr_ptsPerTouch',
    layer: 'tracking',
    label: 'Puntos por Toque',
    shortLabel: 'PTS/Toque',
    helpKey: 'touches',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.ptsPerTouch, 3) }),
  },
  {
    key: 'tr_paintTouches',
    layer: 'tracking',
    label: 'Toques en la Pintura',
    shortLabel: 'Toq. Pintura',
    helpKey: 'touches',
    scope: 'both',
    getDisplay: (ctx) => {
      const t = getTracking(ctx);
      if (!t) return { text: '—' };
      return {
        text: fmtPerOrTot(t.paintTouches, ctx, 1, 0),
        subtext: `${t.paintTouchFgPct.toFixed(1)}% FG · ${t.paintTouchPts.toFixed(1)} pts/PJ`,
      };
    },
  },
  {
    key: 'tr_paintTouchFgPct',
    layer: 'tracking',
    label: 'Toques en Pintura FG%',
    shortLabel: 'Pintura Toq FG%',
    helpKey: 'touches',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.paintTouchFgPct, 1, '%') }),
  },
  {
    key: 'tr_postTouches',
    layer: 'tracking',
    label: 'Toques al Poste (Post-Up)',
    shortLabel: 'Toq. Poste',
    helpKey: 'touches',
    scope: 'both',
    getDisplay: (ctx) => {
      const t = getTracking(ctx);
      if (!t) return { text: '—' };
      return {
        text: fmtPerOrTot(t.postTouches, ctx, 1, 0),
        subtext: `${t.postTouchFgPct.toFixed(1)}% FG · ${t.postTouchPts.toFixed(1)} pts/PJ`,
      };
    },
  },
  {
    key: 'tr_postTouchFgPct',
    layer: 'tracking',
    label: 'Poste FG% (Post Touch FG%)',
    shortLabel: 'Poste Toq FG%',
    helpKey: 'touches',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getTracking(ctx)?.postTouchFgPct, 1, '%') }),
  },
  {
    key: 'tr_elbowTouches',
    layer: 'tracking',
    label: 'Toques en el Codo (Elbow)',
    shortLabel: 'Toq. Codo',
    helpKey: 'touches',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getTracking(ctx)?.elbowTouches, ctx, 1, 0) }),
  },
  {
    key: 'tr_distMiles',
    layer: 'tracking',
    label: 'Distancia Recorrida (millas)',
    shortLabel: 'Dist. (mi)',
    helpKey: 'distMiles',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPerOrTot(getTracking(ctx)?.distMiles, ctx, 2, 1, ' mi'),
    }),
  },
  {
    key: 'tr_distMilesOff',
    layer: 'tracking',
    label: 'Distancia en Ataque (millas)',
    shortLabel: 'Dist. Of.',
    helpKey: 'distMiles',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPerOrTot(getTracking(ctx)?.distMilesOff, ctx, 2, 1, ' mi'),
    }),
  },
  {
    key: 'tr_distMilesDef',
    layer: 'tracking',
    label: 'Distancia en Defensa (millas)',
    shortLabel: 'Dist. Def.',
    helpKey: 'distMiles',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPerOrTot(getTracking(ctx)?.distMilesDef, ctx, 2, 1, ' mi'),
    }),
  },
  {
    key: 'tr_avgSpeed',
    layer: 'tracking',
    label: 'Velocidad Media (mph)',
    shortLabel: 'Vel. (mph)',
    helpKey: 'avgSpeed',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getTracking(ctx)?.avgSpeed, 2, ' mph'),
    }),
  },
  {
    key: 'tr_avgSpeedOff',
    layer: 'tracking',
    label: 'Velocidad en Ataque (mph)',
    shortLabel: 'Vel. Of.',
    helpKey: 'avgSpeed',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getTracking(ctx)?.avgSpeedOff, 2, ' mph'),
    }),
  },
  {
    key: 'tr_avgSpeedDef',
    layer: 'tracking',
    label: 'Velocidad en Defensa (mph)',
    shortLabel: 'Vel. Def.',
    helpKey: 'avgSpeed',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getTracking(ctx)?.avgSpeedDef, 2, ' mph'),
    }),
  },
  {
    key: 'tr_rebChances',
    layer: 'tracking',
    label: 'Oportunidades de Rebote',
    shortLabel: 'Oport. Reb.',
    helpKey: 'rebChances',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPerOrTot(getTracking(ctx)?.rebChances, ctx, 1, 0),
    }),
  },
  {
    key: 'tr_rebChanceAdj',
    layer: 'tracking',
    label: '% Oport. Rebote Ajustado',
    shortLabel: 'Reb Chance%',
    helpKey: 'rebChances',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getTracking(ctx)?.rebChancePctAdj, 1, '%'),
    }),
  },
  {
    key: 'tr_orebContestPct',
    layer: 'tracking',
    label: '% Reb. Ofensivos Punteados',
    shortLabel: '%OR Cont.',
    helpKey: 'rebChances',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getTracking(ctx)?.orebContestPct, 1, '%'),
    }),
  },
  {
    key: 'tr_drebContestPct',
    layer: 'tracking',
    label: '% Reb. Defensivos Punteados',
    shortLabel: '%DR Cont.',
    helpKey: 'rebChances',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getTracking(ctx)?.drebContestPct, 1, '%'),
    }),
  },
  {
    key: 'tr_avgRebDist',
    layer: 'tracking',
    label: 'Distancia Media del Rebote (ft)',
    shortLabel: 'Dist. Reb.',
    helpKey: 'rebChances',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPctOrRaw(getTracking(ctx)?.avgRebDist, 1, ' ft'),
    }),
  },

  // =========================================================================
  // 6. HUSTLE Y PINTURA
  // =========================================================================
  {
    key: 'hu_ptsPaint',
    layer: 'hustle',
    label: 'Puntos en la Pintura',
    shortLabel: 'PTS Pintura',
    helpKey: 'ptsPaint',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.ptsPaint ??
        getViolations(ctx)?.ptsPaint ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.ptsPaint
          : ctx.team?.advanced?.ptsPaint);
      return { text: fmtPerOrTot(v, ctx, 1, 0), tone: 'accent' };
    },
  },
  {
    key: 'hu_pts2ndChance',
    layer: 'hustle',
    label: 'Puntos 2ª Oportunidad',
    shortLabel: '2ª Jugada',
    helpKey: 'pts2ndChance',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.pts2ndChance ??
        getViolations(ctx)?.pts2ndChance ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.pts2ndChance
          : ctx.team?.advanced?.pts2ndChance);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'hu_ptsFb',
    layer: 'hustle',
    label: 'Puntos al Contraataque',
    shortLabel: 'Contraat.',
    helpKey: 'ptsFastBreak',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.ptsFb ??
        getViolations(ctx)?.ptsFb ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.ptsFastBreak
          : ctx.team?.advanced?.ptsFastBreak);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'hu_ptsOffTov',
    layer: 'hustle',
    label: 'Puntos tras Pérdida',
    shortLabel: 'PTS x Pérd.',
    helpKey: 'ptsOffTov',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.ptsOffTov ??
        getViolations(ctx)?.ptsOffTov ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.ptsOffTov
          : ctx.team?.advanced?.ptsOffTov);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'hu_contestedShots',
    layer: 'hustle',
    label: 'Tiros Punteados Totales',
    shortLabel: 'Punteados',
    helpKey: 'contestedShots',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const d = getDefHustle(ctx);
      const v =
        d?.contestedShots ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.contestedShots
          : ctx.team?.advanced?.contestedShots);
      const v2 = d?.contestedShots2pt ?? ctx.player?.advanced?.contestedShots2pt ?? ctx.team?.advanced?.contestedShots2pt;
      const v3 = d?.contestedShots3pt ?? ctx.player?.advanced?.contestedShots3pt ?? ctx.team?.advanced?.contestedShots3pt;
      return {
        text: fmtPerOrTot(v, ctx, 1, 0),
        subtext:
          v2 !== undefined && v3 !== undefined
            ? `${v2.toFixed(1)} 2P · ${v3.toFixed(1)} 3P`
            : undefined,
      };
    },
  },
  {
    key: 'hu_contestedShots2pt',
    layer: 'hustle',
    label: 'Tiros Punteados de 2P',
    shortLabel: 'Punt. 2P',
    helpKey: 'contestedShots',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.contestedShots2pt ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.contestedShots2pt
          : ctx.team?.advanced?.contestedShots2pt);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'hu_contestedShots3pt',
    layer: 'hustle',
    label: 'Tiros Punteados de 3P',
    shortLabel: 'Punt. 3P',
    helpKey: 'contestedShots',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.contestedShots3pt ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.contestedShots3pt
          : ctx.team?.advanced?.contestedShots3pt);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'hu_deflections',
    layer: 'hustle',
    label: 'Desvíos de Balón (Deflections)',
    shortLabel: 'Desvíos',
    helpKey: 'deflections',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.deflections ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.deflections
          : ctx.team?.advanced?.deflections);
      return { text: fmtPerOrTot(v, ctx, 1, 0), tone: 'positive' };
    },
  },
  {
    key: 'hu_chargesDrawn',
    layer: 'hustle',
    label: 'Cargas Ofensivas Provocadas',
    shortLabel: 'Cargas Prov.',
    helpKey: 'chargesDrawn',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.chargesDrawn ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.chargesDrawn
          : ctx.team?.advanced?.chargesDrawn);
      return { text: fmtPerOrTot(v, ctx, 2, 0) };
    },
  },
  {
    key: 'hu_screenAssists',
    layer: 'hustle',
    label: 'Asistencias de Pantalla (Screen AST)',
    shortLabel: 'Screen AST',
    helpKey: 'screenAssists',
    scope: 'both',
    getDisplay: (ctx) => {
      const d = getDefHustle(ctx);
      const v =
        d?.screenAssists ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.screenAssists
          : ctx.team?.advanced?.screenAssists);
      const pts =
        d?.screenAstPts ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.screenAstPts
          : ctx.team?.advanced?.screenAstPts);
      return {
        text: fmtPerOrTot(v, ctx, 1, 0),
        subtext: pts !== undefined ? `${pts.toFixed(1)} pts/PJ generados` : undefined,
      };
    },
  },
  {
    key: 'hu_screenAstPts',
    layer: 'hustle',
    label: 'Puntos tras Pantallas (Screen AST PTS)',
    shortLabel: 'Scr. AST PTS',
    helpKey: 'screenAstPts',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.screenAstPts ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.screenAstPts
          : ctx.team?.advanced?.screenAstPts);
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'hu_looseBalls',
    layer: 'hustle',
    label: 'Balones Sueltos Recuperados',
    shortLabel: 'Bal. Sueltos',
    helpKey: 'looseBalls',
    scope: 'both',
    getDisplay: (ctx) => {
      const d = getDefHustle(ctx);
      const v =
        d?.looseBalls ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.looseBalls
          : ctx.team?.advanced?.looseBalls);
      const of = d?.offLooseBalls ?? ctx.team?.advanced?.offLooseBalls;
      const df = d?.defLooseBalls ?? ctx.team?.advanced?.defLooseBalls;
      return {
        text: fmtPerOrTot(v, ctx, 1, 0),
        subtext:
          of !== undefined && df !== undefined
            ? `${of.toFixed(1)} Of · ${df.toFixed(1)} Def`
            : undefined,
      };
    },
  },
  {
    key: 'hu_offLooseBalls',
    layer: 'hustle',
    label: 'Balones Sueltos Ofensivos',
    shortLabel: 'Sueltos Of.',
    helpKey: 'looseBalls',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPerOrTot(
        getDefHustle(ctx)?.offLooseBalls ?? ctx.team?.advanced?.offLooseBalls,
        ctx,
        1,
        0
      ),
    }),
  },
  {
    key: 'hu_defLooseBalls',
    layer: 'hustle',
    label: 'Balones Sueltos Defensivos',
    shortLabel: 'Sueltos Def.',
    helpKey: 'looseBalls',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPerOrTot(
        getDefHustle(ctx)?.defLooseBalls ?? ctx.team?.advanced?.defLooseBalls,
        ctx,
        1,
        0
      ),
    }),
  },
  {
    key: 'hu_boxOuts',
    layer: 'hustle',
    label: 'Cierres de Rebote (Box-Outs)',
    shortLabel: 'Box-Outs',
    helpKey: 'offBoxOuts',
    scope: 'both',
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const d = getDefHustle(ctx);
      const v =
        d?.boxOuts ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.boxOuts
          : ctx.team?.advanced?.boxOuts);
      const of = d?.offBoxOuts ?? ctx.player?.advanced?.offBoxOuts ?? ctx.team?.advanced?.offBoxOuts;
      const df = d?.defBoxOuts ?? ctx.player?.advanced?.defBoxOuts ?? ctx.team?.advanced?.defBoxOuts;
      return {
        text: fmtPerOrTot(v, ctx, 1, 0),
        subtext:
          of !== undefined && df !== undefined
            ? `${of.toFixed(1)} Of · ${df.toFixed(1)} Def`
            : undefined,
      };
    },
  },
  {
    key: 'hu_offBoxOuts',
    layer: 'hustle',
    label: 'Box-Outs Ofensivos',
    shortLabel: 'Box-Out Of.',
    helpKey: 'offBoxOuts',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPerOrTot(
        getDefHustle(ctx)?.offBoxOuts ??
          ctx.player?.advanced?.offBoxOuts ??
          ctx.team?.advanced?.offBoxOuts,
        ctx,
        1,
        0
      ),
    }),
  },
  {
    key: 'hu_defBoxOuts',
    layer: 'hustle',
    label: 'Box-Outs Defensivos',
    shortLabel: 'Box-Out Def.',
    helpKey: 'offBoxOuts',
    scope: 'both',
    getDisplay: (ctx) => ({
      text: fmtPerOrTot(
        getDefHustle(ctx)?.defBoxOuts ??
          ctx.player?.advanced?.defBoxOuts ??
          ctx.team?.advanced?.defBoxOuts,
        ctx,
        1,
        0
      ),
    }),
  },
  {
    key: 'hu_boxOutRebs',
    layer: 'hustle',
    label: 'Rebotes Tras Box-Out (Eq. / Jug.)',
    shortLabel: 'BoxOut Rebs',
    helpKey: 'offBoxOuts',
    scope: 'both',
    getDisplay: (ctx) => {
      const d = getDefHustle(ctx);
      if (!d) return { text: '—' };
      return {
        text: `${fmtPerOrTot(d.boxOutTeamRebs, ctx, 1, 0)} / ${fmtPerOrTot(d.boxOutPlayerRebs, ctx, 1, 0)}`,
        subtext: 'Equipo / Jugador',
      };
    },
  },

  // =========================================================================
  // 7. DEFENSA, DFG% Y STATS DEL RIVAL
  // =========================================================================
  {
    key: 'def_dFgPct',
    layer: 'defense',
    label: 'DFG% (Acierto Rival Defendido)',
    shortLabel: 'DFG%',
    helpKey: 'dFgPct',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const d = getDefHustle(ctx);
      if (!d) return { text: '—' };
      return {
        text: `${d.dFgPct.toFixed(1)}%`,
        subtext: `Esp. ${d.normalFgPct.toFixed(1)}% (${formatSigned(d.pctPlusMinus, 1, '%')})`,
        tone: d.pctPlusMinus <= -1 ? 'positive' : d.pctPlusMinus >= 1.5 ? 'negative' : 'neutral',
      };
    },
  },
  {
    key: 'def_pctPlusMinus',
    layer: 'defense',
    label: 'Diff% DFG (Impacto en Tiro Rival)',
    shortLabel: 'Diff% DFG',
    helpKey: 'dFgPct',
    scope: 'both',
    getDisplay: (ctx) => {
      const d = getDefHustle(ctx);
      if (!d) return { text: '—' };
      return {
        text: formatSigned(d.pctPlusMinus, 1, '%'),
        tone: d.pctPlusMinus <= -0.5 ? 'positive' : d.pctPlusMinus >= 1 ? 'negative' : 'neutral',
      };
    },
  },
  {
    key: 'def_dFgm',
    layer: 'defense',
    label: 'Tiros Defendidos Encajados (DFGM)',
    shortLabel: 'DFGM',
    helpKey: 'dFgPct',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getDefHustle(ctx)?.dFgm, ctx, 1, 0) }),
  },
  {
    key: 'def_dFga',
    layer: 'defense',
    label: 'Tiros Defendidos (DFGA)',
    shortLabel: 'DFGA',
    helpKey: 'dFgPct',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getDefHustle(ctx)?.dFga, ctx, 1, 0) }),
  },
  {
    key: 'def_normalFgPct',
    layer: 'defense',
    label: 'FG% Esperado del Rival',
    shortLabel: 'FG% Esp.',
    helpKey: 'dFgPct',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getDefHustle(ctx)?.normalFgPct, 1, '%') }),
  },
  {
    key: 'def_freq',
    layer: 'defense',
    label: 'Frecuencia Defensiva (FREQ%)',
    shortLabel: 'Frec. Def.',
    helpKey: 'dFgPct',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getDefHustle(ctx)?.defFreq, 1, '%') }),
  },
  {
    key: 'def_ws',
    layer: 'defense',
    label: 'Defensive Win Shares',
    shortLabel: 'Def WS',
    helpKey: 'defWs',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getDefHustle(ctx)?.defWs, 3) }),
  },
  {
    key: 'def_pctStl',
    layer: 'defense',
    label: '% Robos del Equipo (%STL)',
    shortLabel: '%STL Eq.',
    helpKey: 'steals',
    scope: 'player',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getDefHustle(ctx)?.pctStl, 1, '%') }),
  },
  {
    key: 'def_pctBlk',
    layer: 'defense',
    label: '% Tapones del Equipo (%BLK)',
    shortLabel: '%BLK Eq.',
    helpKey: 'blocks',
    scope: 'player',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getDefHustle(ctx)?.pctBlk, 1, '%') }),
  },
  {
    key: 'def_oppPtsPaint',
    layer: 'defense',
    label: 'PTS Rival en Pintura',
    shortLabel: 'Opp Pintura',
    helpKey: 'oppPtsPaint',
    scope: 'both',
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.oppPtsPaint ??
        getViolations(ctx)?.oppPtsPaint ??
        ctx.team?.advanced?.oppPtsPaint;
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'def_oppPts2ndChance',
    layer: 'defense',
    label: 'PTS Rival 2ª Oportunidad',
    shortLabel: 'Opp 2ª Op.',
    helpKey: 'oppStats',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.oppPts2ndChance ??
        getViolations(ctx)?.oppPts2ndChance ??
        ctx.team?.advanced?.oppPts2ndChance;
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'def_oppPtsFb',
    layer: 'defense',
    label: 'PTS Rival Contraataque',
    shortLabel: 'Opp FB',
    helpKey: 'oppStats',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.oppPtsFb ??
        getViolations(ctx)?.oppPtsFb ??
        ctx.team?.advanced?.oppPtsFb;
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'def_oppPtsOffTov',
    layer: 'defense',
    label: 'PTS Rival tras Pérdida',
    shortLabel: 'Opp x Pérd.',
    helpKey: 'oppStats',
    scope: 'both',
    getDisplay: (ctx) => {
      const v =
        getDefHustle(ctx)?.oppPtsOffTov ??
        getViolations(ctx)?.oppPtsOffTov ??
        ctx.team?.advanced?.oppPtsOffTov;
      return { text: fmtPerOrTot(v, ctx, 1, 0) };
    },
  },
  {
    key: 'def_oppFgPct',
    layer: 'defense',
    label: 'Opp FG% Permitido al Rival',
    shortLabel: 'Opp FG%',
    helpKey: 'oppStats',
    scope: 'team',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getDefHustle(ctx)?.oppFgPct, 1, '%') }),
  },
  {
    key: 'def_oppFg3Pct',
    layer: 'defense',
    label: 'Opp 3P% Permitido al Rival',
    shortLabel: 'Opp 3P%',
    helpKey: 'oppStats',
    scope: 'team',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getDefHustle(ctx)?.oppFg3Pct, 1, '%') }),
  },
  {
    key: 'def_oppFg3m',
    layer: 'defense',
    label: 'Opp 3PM Recibidos',
    shortLabel: 'Opp 3PM',
    helpKey: 'oppStats',
    scope: 'team',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getDefHustle(ctx)?.oppFg3m, ctx, 1, 0) }),
  },
  {
    key: 'def_oppFtPct',
    layer: 'defense',
    label: 'Opp FT% del Rival',
    shortLabel: 'Opp FT%',
    helpKey: 'oppStats',
    scope: 'team',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getDefHustle(ctx)?.oppFtPct, 1, '%') }),
  },
  {
    key: 'def_oppReb',
    layer: 'defense',
    label: 'Opp REB del Rival',
    shortLabel: 'Opp REB',
    helpKey: 'oppStats',
    scope: 'team',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getDefHustle(ctx)?.oppReb, ctx, 1, 0) }),
  },
  {
    key: 'def_oppAst',
    layer: 'defense',
    label: 'Opp AST del Rival',
    shortLabel: 'Opp AST',
    helpKey: 'oppStats',
    scope: 'team',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getDefHustle(ctx)?.oppAst, ctx, 1, 0) }),
  },
  {
    key: 'def_oppTov',
    layer: 'defense',
    label: 'Opp TOV Provocadas al Rival',
    shortLabel: 'Opp TOV',
    helpKey: 'oppStats',
    scope: 'team',
    getDisplay: (ctx) => ({ text: fmtPerOrTot(getDefHustle(ctx)?.oppTov, ctx, 1, 0) }),
  },

  // =========================================================================
  // 8. CLUTCH (< 5 MIN, ±5 PTS)
  // =========================================================================
  {
    key: 'cl_gp',
    layer: 'clutch',
    label: 'Partidos Clutch (PJ / Balance)',
    shortLabel: 'PJ Clutch',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => {
      const c = getClutch(ctx);
      if (!c) return { text: '—' };
      return {
        text: `${c.gp}`,
        subtext: `${c.w}V-${c.l}D (${c.wPct.toFixed(1)}%)`,
      };
    },
  },
  {
    key: 'cl_pts',
    layer: 'clutch',
    label: 'Puntos Clutch',
    shortLabel: 'PTS Clutch',
    helpKey: 'clutch',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const c = getClutch(ctx);
      if (!c) return { text: '—' };
      const val = ctx.statScale === 'totals' ? c.pts * c.gp : c.pts;
      return {
        text: val.toFixed(ctx.statScale === 'totals' ? 0 : 1),
        subtext: `${c.gp} PJ · ${c.min.toFixed(1)} min`,
        tone: 'accent',
      };
    },
  },
  {
    key: 'cl_netRtg',
    layer: 'clutch',
    label: 'Net Rating Clutch',
    shortLabel: 'NetRtg Clutch',
    helpKey: 'clutch',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const c = getClutch(ctx);
      if (!c) return { text: '—' };
      return {
        text: formatSigned(c.netRtg, 1),
        subtext: `Off ${c.offRtg.toFixed(1)} / Def ${c.defRtg.toFixed(1)}`,
        tone: c.netRtg >= 0 ? 'positive' : 'negative',
      };
    },
  },
  {
    key: 'cl_offRtg',
    layer: 'clutch',
    label: 'OffRtg Clutch',
    shortLabel: 'OffRtg Cl.',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getClutch(ctx)?.offRtg, 1) }),
  },
  {
    key: 'cl_defRtg',
    layer: 'clutch',
    label: 'DefRtg Clutch',
    shortLabel: 'DefRtg Cl.',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getClutch(ctx)?.defRtg, 1) }),
  },
  {
    key: 'cl_fgPct',
    layer: 'clutch',
    label: 'FG% Clutch',
    shortLabel: 'FG% Cl.',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => {
      const c = getClutch(ctx);
      if (!c) return { text: '—' };
      return {
        text: `${c.fgPct.toFixed(1)}%`,
        subtext: `${c.fgm.toFixed(1)}/${c.fga.toFixed(1)} PJ`,
      };
    },
  },
  {
    key: 'cl_fg3Pct',
    layer: 'clutch',
    label: '3P% Clutch',
    shortLabel: '3P% Cl.',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => {
      const c = getClutch(ctx);
      if (!c) return { text: '—' };
      return {
        text: `${c.fg3Pct.toFixed(1)}%`,
        subtext: `${c.fg3m.toFixed(1)}/${c.fg3a.toFixed(1)} PJ`,
      };
    },
  },
  {
    key: 'cl_ftPct',
    layer: 'clutch',
    label: 'FT% Clutch',
    shortLabel: 'FT% Cl.',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => {
      const c = getClutch(ctx);
      if (!c) return { text: '—' };
      return {
        text: `${c.ftPct.toFixed(1)}%`,
        subtext: `${c.ftm.toFixed(1)}/${c.fta.toFixed(1)} PJ`,
      };
    },
  },
  {
    key: 'cl_tsPct',
    layer: 'clutch',
    label: 'TS% Clutch',
    shortLabel: 'TS% Cl.',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getClutch(ctx)?.tsPct, 1, '%') }),
  },
  {
    key: 'cl_efgPct',
    layer: 'clutch',
    label: 'eFG% Clutch',
    shortLabel: 'eFG% Cl.',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getClutch(ctx)?.efgPct, 1, '%') }),
  },
  {
    key: 'cl_usgPct',
    layer: 'clutch',
    label: 'USG% Clutch',
    shortLabel: 'USG% Cl.',
    helpKey: 'clutch',
    scope: 'player',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getClutch(ctx)?.usgPct, 1, '%') }),
  },
  {
    key: 'cl_pie',
    layer: 'clutch',
    label: 'PIE% Clutch',
    shortLabel: 'PIE% Cl.',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => ({ text: fmtPctOrRaw(getClutch(ctx)?.pie, 1, '%') }),
  },
  {
    key: 'cl_rebAst',
    layer: 'clutch',
    label: 'Rebotes / Asist. Clutch',
    shortLabel: 'REB/AST Cl.',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => {
      const c = getClutch(ctx);
      if (!c) return { text: '—' };
      const r = ctx.statScale === 'totals' ? c.reb * c.gp : c.reb;
      const a = ctx.statScale === 'totals' ? c.ast * c.gp : c.ast;
      const dec = ctx.statScale === 'totals' ? 0 : 1;
      return { text: `${r.toFixed(dec)} / ${a.toFixed(dec)}` };
    },
  },
  {
    key: 'cl_plusMinus',
    layer: 'clutch',
    label: '+/- Clutch',
    shortLabel: '+/- Cl.',
    helpKey: 'clutch',
    scope: 'both',
    getDisplay: (ctx) => {
      const c = getClutch(ctx);
      if (!c) return { text: '—' };
      const v = ctx.statScale === 'totals' ? c.plusMinus * c.gp : c.plusMinus;
      return {
        text: formatSigned(v, ctx.statScale === 'totals' ? 0 : 1),
        tone: v >= 0 ? 'positive' : 'negative',
      };
    },
  },

  // =========================================================================
  // 9. PLAYTYPES (SYNERGY OFENSIVO Y DEFENSIVO)
  // =========================================================================
  {
    key: 'pt_top_off',
    layer: 'playtypes',
    label: 'Principal Jugada Ofensiva (Top PPP)',
    shortLabel: 'Top Playtype',
    helpKey: 'ppp',
    scope: 'both',
    isDefaultPlayer: true,
    isDefaultTeam: true,
    getDisplay: (ctx) => {
      const list = getPlaytypesOff(ctx);
      if (!list.length) return { text: '—' };
      const top = [...list].sort((a, b) => b.possPct - a.possPct)[0];
      return {
        text: `${top.playTypeLabelEs}`,
        subtext: `${top.ppp.toFixed(2)} PPP · ${top.possPct.toFixed(1)}% pos (P${Math.round(top.percentile)})`,
        tone: 'accent',
      };
    },
  },
  playtypeCard('pt_spotup', 'Spot-Up (Anotar a pies quietos)', 'SpotUp PPP', 'Spotup', 'offensive'),
  playtypeCard('pt_prbh', 'Pick & Roll Manejador', 'P&R Man. PPP', 'PRBallHandler', 'offensive'),
  playtypeCard('pt_trans', 'Transición / Contraataque', 'Transic. PPP', 'Transition', 'offensive'),
  playtypeCard('pt_iso', 'Aislamiento (1vs1 Isolation)', 'Aislam. PPP', 'Isolation', 'offensive'),
  playtypeCard('pt_prr', 'Pick & Roll Continuador', 'P&R Cont. PPP', 'PRRollMan', 'offensive'),
  playtypeCard('pt_cut', 'Cortes sin balón (Cut)', 'Corte PPP', 'Cut', 'offensive'),
  playtypeCard('pt_post', 'Poste Bajo (Post-Up)', 'Poste PPP', 'Postup', 'offensive'),
  playtypeCard('pt_handoff', 'Mano a Mano (Handoff)', 'Handoff PPP', 'Handoff', 'offensive'),
  playtypeCard('pt_offscr', 'Salida de Bloqueos (OffScreen)', 'Sal. Bloq. PPP', 'OffScreen', 'offensive'),
  playtypeCard('pt_putback', 'Rebote Ofensivo (Putback)', 'Reb. Of. PPP', 'OffRebound', 'offensive'),
  playtypeCard('pt_misc', 'Otras Jugadas (Misc)', 'Misc PPP', 'Misc', 'offensive'),
  playtypeCard('pt_def_spotup', 'Defensa vs Spot-Up (PPP Rec.)', 'Def SpotUp', 'Spotup', 'defensive'),
  playtypeCard('pt_def_prbh', 'Defensa vs P&R Manejador', 'Def P&R Man.', 'PRBallHandler', 'defensive'),
  playtypeCard('pt_def_iso', 'Defensa vs Aislamiento (Iso)', 'Def Iso', 'Isolation', 'defensive'),
  playtypeCard('pt_def_post', 'Defensa vs Poste Bajo', 'Def Poste', 'Postup', 'defensive'),
  playtypeCard('pt_def_prr', 'Defensa vs P&R Continuador', 'Def P&R Cont.', 'PRRollMan', 'defensive'),
  playtypeCard('pt_def_trans', 'Defensa vs Transición', 'Def Transic.', 'Transition', 'defensive'),

  // =========================================================================
  // 10. INFRACCIONES, FALTAS Y HITOS (TODAS LAS 19 VIOLATIONS + BOX)
  // =========================================================================
  violationCard('vl_total', 'totalViolations', 'Total Infracciones (Violations)', 'Tot. Violac.', 'total', true),
  {
    key: 'vl_pf',
    layer: 'violations',
    label: 'Faltas Personales (PF)',
    shortLabel: 'PF',
    helpKey: 'personalFouls',
    scope: 'both',
    getDisplay: (ctx) => {
      const val =
        getViolations(ctx)?.pf ??
        getDefHustle(ctx)?.pf ??
        (ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => g.fouls))
          : ctx.team?.advanced?.pf);
      return { text: fmtPerOrTot(val, ctx, 1, 0) };
    },
  },
  {
    key: 'vl_pfd',
    layer: 'violations',
    label: 'Faltas Recibidas (PFD)',
    shortLabel: 'PFD',
    helpKey: 'foulsDrawn',
    scope: 'both',
    isDefaultPlayer: true,
    getDisplay: (ctx) => {
      const val =
        getViolations(ctx)?.pfd ??
        getDefHustle(ctx)?.pfd ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.foulsDrawn
          : ctx.team?.advanced?.pfd);
      return { text: fmtPerOrTot(val, ctx, 1, 0), tone: 'positive' };
    },
  },
  {
    key: 'vl_blka',
    layer: 'violations',
    label: 'Tapones Recibidos (BLKA)',
    shortLabel: 'BLKA',
    helpKey: 'blka',
    scope: 'both',
    getDisplay: (ctx) => {
      const val =
        getViolations(ctx)?.blka ??
        getDefHustle(ctx)?.blka ??
        (ctx.entityType === 'player'
          ? ctx.player?.advanced?.blka
          : ctx.team?.advanced?.blka);
      return { text: fmtPerOrTot(val, ctx, 1, 0) };
    },
  },
  {
    key: 'vl_tov',
    layer: 'violations',
    label: 'Pérdidas de Balón (TOV)',
    shortLabel: 'TOV',
    helpKey: 'tov',
    scope: 'both',
    getDisplay: (ctx) => {
      const val =
        getViolations(ctx)?.tov ??
        (ctx.entityType === 'player'
          ? mean(getPlayerSeasonGames(ctx.player).map((g) => g.turnovers))
          : getTeamAvgOrTot(ctx, (g) => g.tov || 0));
      return { text: fmtPerOrTot(val, ctx, 1, 0) };
    },
  },
  violationCard('vl_travel', 'travel', 'Pasos (Travels)', 'Pasos', 'pasos traveling', true),
  violationCard('vl_doubleDribble', 'doubleDribble', 'Dobles (Double Dribble)', 'Dobles', 'dobles'),
  violationCard('vl_discontinuedDribble', 'discontinuedDribble', 'Acompañar Balón (Carry)', 'Acomp. Balón', 'carry'),
  violationCard('vl_palming', 'palming', 'Palming (Retener Balón)', 'Palming', 'palming'),
  violationCard('vl_offThreeSec', 'offThreeSec', '3 Segundos Ofensivos', '3s Ofens.', '3 segundos'),
  violationCard('vl_defThreeSec', 'defThreeSec', '3 Segundos Defensivos', '3s Defens.', '3 segundos'),
  violationCard('vl_shotClock', 'shotClock', 'Violación Reloj 24s', 'Reloj 24s', 'posesion'),
  violationCard('vl_fiveSec', 'fiveSec', 'Violación 5 Segundos', '5 Seg.', 'saque'),
  violationCard('vl_eightSec', 'eightSec', 'Violación 8 Segundos', '8 Seg.', 'campo'),
  violationCard('vl_backcourt', 'backcourt', 'Campo Atrás (Backcourt)', 'Campo Atrás', 'campo atras'),
  violationCard('vl_offFoul', 'offFoul', 'Falta en Ataque', 'Falta Ataque', 'ataque'),
  violationCard('vl_charge', 'charge', 'Carga Ofensiva', 'Carga Of.', 'carga'),
  violationCard('vl_kickedBall', 'kickedBall', 'Pie Intencionado (Kick Ball)', 'Kick Ball', 'pie'),
  violationCard('vl_lane', 'lane', 'Invasión Tiro Libre (Lane)', 'Invasión TL', 'tl'),
  violationCard('vl_offGoaltending', 'offGoaltending', 'Interferencia Ofensiva', 'Interf. Of.', 'goaltending'),
  violationCard('vl_defGoaltending', 'defGoaltending', 'Interferencia Defensiva', 'Interf. Def.', 'goaltending'),
  violationCard('vl_inbound', 'inbound', 'Violación de Saque', 'Saque', 'inbound'),
  violationCard('vl_jumpBall', 'jumpBall', 'Violación Salto Entre 2', 'Salto 2', 'jump'),
  violationCard('vl_delayOfGame', 'delayOfGame', 'Retraso de Juego', 'Retraso Juego', 'delay'),
  {
    key: 'vl_dd2',
    layer: 'violations',
    label: 'Dobles-Dobles (DD2)',
    shortLabel: 'DD2',
    helpKey: 'doubleDoubles',
    scope: 'player',
    getDisplay: (ctx) => {
      const dd2 =
        getViolations(ctx)?.dd2 ??
        getPlayerSeasonGames(ctx.player).filter(
          (gm) =>
            [gm.points, gm.rebounds, gm.assists, gm.steals, gm.blocks].filter(
              (x) => x >= 10
            ).length >= 2
        ).length;
      return { text: `${dd2}` };
    },
  },
  {
    key: 'vl_td3',
    layer: 'violations',
    label: 'Triples-Dobles (TD3)',
    shortLabel: 'TD3',
    helpKey: 'tripleDoubles',
    scope: 'player',
    getDisplay: (ctx) => {
      const td3 =
        getViolations(ctx)?.td3 ??
        getPlayerSeasonGames(ctx.player).filter(
          (gm) =>
            [gm.points, gm.rebounds, gm.assists, gm.steals, gm.blocks].filter(
              (x) => x >= 10
            ).length >= 3
        ).length;
      return { text: `${td3}` };
    },
  },
  {
    key: 'vl_nbaFantasyPts',
    layer: 'violations',
    label: 'NBA Fantasy PTS',
    shortLabel: 'NBA FPTS',
    helpKey: 'nbaFantasyPts',
    scope: 'player',
    isDefaultPlayer: true,
    getDisplay: (ctx) => {
      const v = getViolations(ctx)?.nbaFantasyPts;
      if (typeof v === 'number' && Number.isFinite(v)) {
        return { text: fmtPerOrTot(v, ctx, 1, 0), tone: 'accent' };
      }
      const gamesRef = getPlayerSeasonGames(ctx.player);
      const calc = gamesRef.length
        ? mean(
            gamesRef.map(
              (gm) =>
                gm.points +
                1.2 * gm.rebounds +
                1.5 * gm.assists +
                3 * gm.steals +
                3 * gm.blocks -
                gm.turnovers
            )
          )
        : 0;
      return { text: fmtPerOrTot(calc, ctx, 1, 0), tone: 'accent' };
    },
  },
];

export const NBA_ALL_KPIS_MAP: Record<string, InspectorNbaKpiDef> = Object.fromEntries(
  NBA_ALL_KPIS_CATALOG.map((k) => [k.key, k])
);

export const DEFAULT_PLAYER_NBA_KPI_KEYS = NBA_ALL_KPIS_CATALOG.filter(
  (k) => (k.scope === 'both' || k.scope === 'player') && k.isDefaultPlayer
).map((k) => k.key);

export const DEFAULT_TEAM_NBA_KPI_KEYS = NBA_ALL_KPIS_CATALOG.filter(
  (k) => (k.scope === 'both' || k.scope === 'team') && k.isDefaultTeam
).map((k) => k.key);

// ============================================================================
// METADATA & LEAGUE BENCHMARKS FOR ALL 10 LAYERS (Mean + SD Comparison & Charts)
// ============================================================================
export interface KpiComparisonMeta {
  decimals: number;
  suffix: string;
  signed: boolean;
  lowerIsBetter: boolean;
  scalable: boolean;
  scaleSource?: 'gp' | 'clutch_gp';
}

const LOWER_IS_BETTER_KEYS = new Set<string>([
  'basic_opp_pts',
  'adv_defRtg',
  'adv_tovPct',
  'adv_oppEfgPct',
  'adv_oppOrebPct',
  'adv_oppFtaRate',
  'adv_onOffNetOff',
  'tr_driveTovPct',
  'def_dFgPct',
  'def_pctPlusMinus',
  'def_dFgm',
  'def_normalFgPct',
  'def_oppPtsPaint',
  'def_oppPts2ndChance',
  'def_oppPtsFb',
  'def_oppPtsOffTov',
  'def_oppFgPct',
  'def_oppFg3Pct',
  'def_oppFg3m',
  'def_oppFtPct',
  'def_oppReb',
  'def_oppAst',
  'cl_defRtg',
  'pt_def_spotup',
  'pt_def_prbh',
  'pt_def_iso',
  'pt_def_post',
  'pt_def_prr',
  'pt_def_trans',
  'vl_total',
  'vl_pf',
  'vl_blka',
  'vl_tov',
  'vl_travel',
  'vl_doubleDribble',
  'vl_discontinuedDribble',
  'vl_palming',
  'vl_offThreeSec',
  'vl_defThreeSec',
  'vl_shotClock',
  'vl_fiveSec',
  'vl_eightSec',
  'vl_backcourt',
  'vl_offFoul',
  'vl_charge',
  'vl_kickedBall',
  'vl_lane',
  'vl_offGoaltending',
  'vl_defGoaltending',
  'vl_inbound',
  'vl_jumpBall',
  'vl_delayOfGame',
]);

const SIGNED_KEYS = new Set<string>([
  'basic_diff',
  'basic_plusMinus',
  'adv_netRtg',
  'adv_onOffNetDiff',
  'adv_onOffNetOn',
  'adv_onOffNetOff',
  'def_pctPlusMinus',
  'cl_netRtg',
  'cl_plusMinus',
]);

const NON_SCALABLE_KEYS = new Set<string>([
  'basic_gp',
  'basic_fgPct',
  'basic_fg2Pct',
  'basic_fg3Pct',
  'basic_ftPct',
  'cl_gp',
  'vl_dd2',
  'vl_td3',
  'tr_secPerTouch',
  'tr_dribPerTouch',
  'tr_ptsPerTouch',
  'tr_avgSpeed',
  'tr_avgSpeedOff',
  'tr_avgSpeedDef',
  'tr_avgRebDist',
]);

export function getKpiMeta(
  def: InspectorNbaKpiDef,
  statScale: InspectorStatScale
): KpiComparisonMeta {
  const k = def.key;
  const label = def.label;
  const isPct =
    k.includes('Pct') ||
    k.startsWith('sc_') ||
    k.endsWith('Adj') ||
    k === 'def_freq' ||
    k === 'def_pctPlusMinus' ||
    label.includes('%');
  const isPlaytype = def.layer === 'playtypes';
  const isViolationCount =
    def.layer === 'violations' &&
    !['vl_pf', 'vl_pfd', 'vl_blka', 'vl_tov', 'vl_dd2', 'vl_td3', 'vl_nbaFantasyPts'].includes(k);

  const scalable =
    !NON_SCALABLE_KEYS.has(k) &&
    !isPct &&
    !isPlaytype &&
    def.layer !== 'advanced' &&
    def.layer !== 'scoring' &&
    !['def_ws', 'def_pctPlusMinus'].includes(k);

  const scaleSource: 'gp' | 'clutch_gp' =
    def.layer === 'clutch' ? 'clutch_gp' : 'gp';

  let suffix = '';
  if (isPct) suffix = '%';
  else if (isPlaytype) suffix = ' PPP';
  else if (k.startsWith('tr_distMiles')) suffix = ' mi';
  else if (k.startsWith('tr_avgSpeed')) suffix = ' mph';
  else if (k === 'tr_secPerTouch') suffix = 's';
  else if (k === 'tr_timeOfPoss') suffix = 'm';
  else if (k === 'tr_avgRebDist') suffix = ' ft';

  let decimals = 1;
  if (k === 'basic_gp' || k === 'cl_gp' || k === 'vl_dd2' || k === 'vl_td3') {
    decimals = 0;
  } else if (
    isPlaytype ||
    k === 'adv_astTo' ||
    k === 'adv_ptsPerShot' ||
    k === 'tr_secPerTouch' ||
    k === 'tr_dribPerTouch' ||
    k.startsWith('tr_avgSpeed') ||
    (statScale === 'per_game' && (k.startsWith('tr_distMiles') || k === 'hu_chargesDrawn' || isViolationCount))
  ) {
    decimals = 2;
  } else if (k === 'adv_ftaRate' || k === 'adv_oppFtaRate' || k === 'tr_ptsPerTouch' || k === 'def_ws') {
    decimals = 3;
  } else if (statScale === 'totals' && scalable) {
    decimals = k.startsWith('tr_distMiles') ? 1 : 0;
  }

  return {
    decimals,
    suffix,
    signed: SIGNED_KEYS.has(k),
    lowerIsBetter: LOWER_IS_BETTER_KEYS.has(k),
    scalable,
    scaleSource,
  };
}

export function parseKpiNumericValue(text: string): number | null {
  if (!text || text === '—' || text.includes('PPP') === false && text.includes('/') && !text.startsWith('+') && !text.startsWith('-')) {
    // Handle slash compounds like "0.8 / 0.3" only by extracting first token
  }
  const normalized = text.trim();
  if (!normalized || normalized === '—') return null;
  // Special case for pt_top_off where text is playType name and subtext starts with "1.12 PPP..."
  const match = normalized.replace(',', '.').match(/[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function getKpiNumericValue(
  def: InspectorNbaKpiDef,
  ctx: InspectorKpiContext
): number | null {
  if (def.key === 'pt_top_off') {
    const list = getPlaytypesOff(ctx);
    if (!list.length) return null;
    const top = [...list].sort((a, b) => b.possPct - a.possPct)[0];
    return typeof top?.ppp === 'number' ? top.ppp : null;
  }
  const disp = def.getDisplay(ctx);
  if (!disp.text || disp.text === '—') return null;
  return parseKpiNumericValue(disp.text);
}

export function getEntityScaleGp(
  def: InspectorNbaKpiDef,
  ctx: InspectorKpiContext
): number {
  if (def.layer === 'clutch') {
    const cl = getClutch(ctx);
    return Math.max(1, cl?.gp || 1);
  }
  return getGp(ctx);
}

function calcMeanAndSd(vals: number[], decimals = 1): NbaAdvancedBenchmarkStat | null {
  const valid = vals.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (valid.length < 3) return null;
  const m = valid.reduce((a, b) => a + b, 0) / valid.length;
  const v = valid.reduce((s, x) => s + (x - m) ** 2, 0) / valid.length;
  const sd = Math.sqrt(Math.max(0, v));
  const mult = decimals >= 3 ? 1000 : decimals === 2 ? 100 : 10;
  return {
    mean: Math.round(m * mult) / mult,
    sd: Math.round(sd * mult) / mult,
  };
}

const RESILIENT_PLAYER_ADV_BENCHMARKS: Record<string, NbaAdvancedBenchmarkStat> = {
  adv_offRtg: { mean: 111.8, sd: 7.2 },
  adv_defRtg: { mean: 112.2, sd: 6.5 },
  adv_netRtg: { mean: -0.4, sd: 10.2 },
  adv_pace: { mean: 100.4, sd: 2.8 },
  adv_efgPct: { mean: 53.5, sd: 8.4 },
  adv_tsPct: { mean: 57.0, sd: 8.1 },
  adv_usgPct: { mean: 18.4, sd: 5.6 },
  adv_pie: { mean: 9.4, sd: 3.7 },
  adv_astPct: { mean: 15.6, sd: 9.0 },
  adv_astRatio: { mean: 18.4, sd: 7.5 },
  adv_astTo: { mean: 1.95, sd: 0.95 },
  adv_orebPct: { mean: 4.8, sd: 3.6 },
  adv_drebPct: { mean: 13.8, sd: 6.2 },
  adv_rebPct: { mean: 9.3, sd: 4.4 },
  adv_tovPct: { mean: 12.1, sd: 4.5 },
  adv_ftaRate: { mean: 24.8, sd: 13.5 },
  adv_onOffNetDiff: { mean: 0.0, sd: 6.2 },
  adv_onOffNetOn: { mean: -0.4, sd: 8.5 },
  adv_onOffNetOff: { mean: 0.0, sd: 6.5 },
  sc_pctFga2pt: { mean: 58.5, sd: 18.4 },
  sc_pctFga3pt: { mean: 41.5, sd: 18.4 },
  sc_pctPts2pt: { mean: 50.2, sd: 16.5 },
  sc_pctPts2ptMr: { mean: 6.8, sd: 6.5 },
  sc_pctPts3pt: { mean: 34.4, sd: 16.8 },
  sc_pctPtsFb: { mean: 12.4, sd: 6.8 },
  sc_pctPtsFt: { mean: 15.4, sd: 8.2 },
  sc_pctPtsOffTov: { mean: 14.8, sd: 6.5 },
  sc_pctPtsPaint: { mean: 43.4, sd: 16.8 },
  sc_pctAst2pm: { mean: 58.2, sd: 20.5 },
  sc_pctUast2pm: { mean: 41.8, sd: 20.5 },
  sc_pctAst3pm: { mean: 84.5, sd: 16.2 },
  sc_pctUast3pm: { mean: 15.5, sd: 16.2 },
  sc_pctAstFgm: { mean: 66.8, sd: 18.2 },
  sc_pctUastFgm: { mean: 33.2, sd: 18.2 },
  zn_raFga: { mean: 2.85, sd: 1.95 },
  zn_raFgm: { mean: 1.88, sd: 1.32 },
  zn_raFgPct: { mean: 66.0, sd: 9.8 },
  zn_paintNonRaFga: { mean: 1.45, sd: 1.15 },
  zn_paintNonRaFgm: { mean: 0.62, sd: 0.55 },
  zn_paintNonRaFgPct: { mean: 43.2, sd: 11.4 },
  zn_midFga: { mean: 0.88, sd: 0.92 },
  zn_midFgm: { mean: 0.37, sd: 0.44 },
  zn_midFgPct: { mean: 41.8, sd: 13.5 },
  zn_lc3Fga: { mean: 0.55, sd: 0.42 },
  zn_lc3Fgm: { mean: 0.21, sd: 0.18 },
  zn_lc3FgPct: { mean: 38.6, sd: 11.5 },
  zn_rc3Fga: { mean: 0.52, sd: 0.40 },
  zn_rc3Fgm: { mean: 0.20, sd: 0.17 },
  zn_rc3FgPct: { mean: 38.2, sd: 11.5 },
  zn_corner3Fga: { mean: 1.07, sd: 0.72 },
  zn_corner3Fgm: { mean: 0.41, sd: 0.31 },
  zn_corner3FgPct: { mean: 38.4, sd: 9.6 },
  zn_ab3Fga: { mean: 2.75, sd: 2.05 },
  zn_ab3Fgm: { mean: 0.98, sd: 0.78 },
  zn_ab3FgPct: { mean: 35.6, sd: 7.4 },
  zn_bcFga: { mean: 0.03, sd: 0.05 },
  zn_bcFgm: { mean: 0.004, sd: 0.015 },
  zn_bcFgPct: { mean: 12.5, sd: 18.0 },
  zn_totalRimFga: { mean: 2.85, sd: 1.95 },
  zn_rimFgPct: { mean: 66.0, sd: 9.8 },
  zn_totalThreeFga: { mean: 3.82, sd: 2.25 },
  zn_threeFgPct: { mean: 36.2, sd: 6.8 },
  tr_drives: { mean: 4.5, sd: 4.2 },
  tr_driveFgm: { mean: 1.05, sd: 1.08 },
  tr_driveFga: { mean: 2.15, sd: 2.15 },
  tr_drivePts: { mean: 2.7, sd: 2.8 },
  tr_driveFgPct: { mean: 48.2, sd: 11.5 },
  tr_driveAstPct: { mean: 8.6, sd: 5.5 },
  tr_driveTovPct: { mean: 6.4, sd: 4.8 },
  tr_drivePassesPct: { mean: 38.2, sd: 12.4 },
  tr_csPts: { mean: 2.8, sd: 1.9 },
  tr_csFgm: { mean: 0.96, sd: 0.65 },
  tr_csFga: { mean: 2.55, sd: 1.65 },
  tr_csFgPct: { mean: 37.8, sd: 8.6 },
  tr_csFg3Pct: { mean: 37.5, sd: 8.9 },
  tr_csEfgPct: { mean: 56.2, sd: 12.2 },
  tr_puPts: { mean: 2.1, sd: 2.6 },
  tr_puFgm: { mean: 0.80, sd: 0.95 },
  tr_puFga: { mean: 2.05, sd: 2.35 },
  tr_puFgPct: { mean: 38.8, sd: 10.4 },
  tr_puFg3Pct: { mean: 33.4, sd: 11.8 },
  tr_puEfgPct: { mean: 44.5, sd: 11.6 },
  tr_passesMade: { mean: 25.4, sd: 14.2 },
  tr_passesRec: { mean: 24.8, sd: 15.1 },
  tr_secAst: { mean: 0.42, sd: 0.38 },
  tr_potAst: { mean: 4.4, sd: 3.4 },
  tr_astPtsCreated: { mean: 6.4, sd: 4.9 },
  tr_astToPassAdj: { mean: 10.6, sd: 4.2 },
  tr_touches: { mean: 39.2, sd: 20.4 },
  tr_frontCtTouches: { mean: 22.8, sd: 11.2 },
  tr_timeOfPoss: { mean: 2.05, sd: 1.85 },
  tr_secPerTouch: { mean: 2.75, sd: 1.05 },
  tr_dribPerTouch: { mean: 2.02, sd: 1.15 },
  tr_ptsPerTouch: { mean: 0.275, sd: 0.085 },
  tr_paintTouches: { mean: 2.6, sd: 2.2 },
  tr_paintTouchFgPct: { mean: 57.5, sd: 13.5 },
  tr_postTouches: { mean: 0.72, sd: 1.25 },
  tr_postTouchFgPct: { mean: 49.5, sd: 15.0 },
  tr_elbowTouches: { mean: 1.05, sd: 1.15 },
  tr_distMiles: { mean: 1.78, sd: 0.56 },
  tr_distMilesOff: { mean: 0.96, sd: 0.30 },
  tr_distMilesDef: { mean: 0.82, sd: 0.26 },
  tr_avgSpeed: { mean: 4.28, sd: 0.24 },
  tr_avgSpeedOff: { mean: 4.62, sd: 0.32 },
  tr_avgSpeedDef: { mean: 3.92, sd: 0.24 },
  tr_rebChances: { mean: 7.4, sd: 4.6 },
  tr_rebChanceAdj: { mean: 58.2, sd: 10.5 },
  tr_orebContestPct: { mean: 45.2, sd: 18.0 },
  tr_drebContestPct: { mean: 21.8, sd: 11.2 },
  tr_avgRebDist: { mean: 6.4, sd: 1.8 },
  hu_ptsPaint: { mean: 4.8, sd: 3.4 },
  hu_pts2ndChance: { mean: 1.4, sd: 1.1 },
  hu_ptsFb: { mean: 1.5, sd: 1.1 },
  hu_ptsOffTov: { mean: 1.7, sd: 1.1 },
  hu_contestedShots: { mean: 4.6, sd: 2.6 },
  hu_contestedShots2pt: { mean: 2.9, sd: 2.1 },
  hu_contestedShots3pt: { mean: 1.7, sd: 0.9 },
  hu_deflections: { mean: 1.4, sd: 0.8 },
  hu_chargesDrawn: { mean: 0.05, sd: 0.09 },
  hu_screenAssists: { mean: 0.9, sd: 1.1 },
  hu_screenAstPts: { mean: 2.1, sd: 2.5 },
  hu_looseBalls: { mean: 0.56, sd: 0.30 },
  hu_offLooseBalls: { mean: 0.24, sd: 0.16 },
  hu_defLooseBalls: { mean: 0.32, sd: 0.20 },
  hu_boxOuts: { mean: 0.9, sd: 0.9 },
  hu_offBoxOuts: { mean: 0.16, sd: 0.22 },
  hu_defBoxOuts: { mean: 0.74, sd: 0.75 },
  hu_boxOutRebs: { mean: 0.72, sd: 0.75 },
  def_dFgPct: { mean: 46.8, sd: 5.8 },
  def_pctPlusMinus: { mean: -0.4, sd: 5.2 },
  def_dFgm: { mean: 4.1, sd: 1.9 },
  def_dFga: { mean: 8.8, sd: 3.8 },
  def_normalFgPct: { mean: 47.2, sd: 2.4 },
  def_freq: { mean: 100.0, sd: 0.0 },
  def_ws: { mean: 0.062, sd: 0.038 },
  def_pctStl: { mean: 18.5, sd: 9.5 },
  def_pctBlk: { mean: 17.5, sd: 14.5 },
  def_oppPtsPaint: { mean: 24.8, sd: 8.2 },
  def_oppPts2ndChance: { mean: 6.9, sd: 2.5 },
  def_oppPtsFb: { mean: 7.4, sd: 2.7 },
  def_oppPtsOffTov: { mean: 8.3, sd: 3.1 },
  cl_gp: { mean: 16.5, sd: 8.5 },
  cl_min: { mean: 3.1, sd: 1.1 },
  cl_pts: { mean: 1.3, sd: 1.2 },
  cl_netRtg: { mean: 0.2, sd: 28.5 },
  cl_offRtg: { mean: 109.5, sd: 24.5 },
  cl_defRtg: { mean: 109.3, sd: 23.5 },
  cl_fgPct: { mean: 43.2, sd: 18.5 },
  cl_fg3Pct: { mean: 32.8, sd: 21.5 },
  cl_ftPct: { mean: 77.5, sd: 19.5 },
  cl_tsPct: { mean: 54.8, sd: 20.5 },
  cl_efgPct: { mean: 49.5, sd: 20.8 },
  cl_usgPct: { mean: 18.4, sd: 8.8 },
  cl_pie: { mean: 8.5, sd: 11.2 },
  cl_rebAst: { mean: 0.5, sd: 0.4 },
  cl_ast: { mean: 0.3, sd: 0.3 },
  cl_stl: { mean: 0.12, sd: 0.14 },
  cl_blk: { mean: 0.09, sd: 0.12 },
  cl_tov: { mean: 0.15, sd: 0.16 },
  cl_plusMinus: { mean: 0.1, sd: 1.4 },
  pt_top_off: { mean: 1.03, sd: 0.24 },
  pt_spotup: { mean: 1.03, sd: 0.22 },
  pt_prbh: { mean: 0.88, sd: 0.20 },
  pt_trans: { mean: 1.13, sd: 0.22 },
  pt_iso: { mean: 0.89, sd: 0.25 },
  pt_prr: { mean: 1.12, sd: 0.26 },
  pt_cut: { mean: 1.28, sd: 0.25 },
  pt_post: { mean: 0.90, sd: 0.24 },
  pt_handoff: { mean: 0.93, sd: 0.26 },
  pt_offscr: { mean: 0.99, sd: 0.28 },
  pt_putback: { mean: 1.11, sd: 0.24 },
  pt_misc: { mean: 0.58, sd: 0.29 },
  pt_def_spotup: { mean: 1.04, sd: 0.24 },
  pt_def_prbh: { mean: 0.90, sd: 0.18 },
  pt_def_iso: { mean: 0.91, sd: 0.24 },
  pt_def_post: { mean: 0.92, sd: 0.25 },
  pt_def_prr: { mean: 1.09, sd: 0.24 },
  vl_total: { mean: 0.052, sd: 0.036 },
  vl_travel: { mean: 0.011, sd: 0.013 },
  vl_doubleDribble: { mean: 0.002, sd: 0.005 },
  vl_discontinuedDribble: { mean: 0.003, sd: 0.007 },
  vl_palming: { mean: 0.002, sd: 0.006 },
  vl_offThreeSec: { mean: 0.002, sd: 0.006 },
  vl_defThreeSec: { mean: 0.004, sd: 0.008 },
  vl_shotClock: { mean: 0.004, sd: 0.007 },
  vl_fiveSec: { mean: 0.001, sd: 0.003 },
  vl_eightSec: { mean: 0.001, sd: 0.003 },
  vl_backcourt: { mean: 0.002, sd: 0.005 },
  vl_offFoul: { mean: 0.011, sd: 0.014 },
  vl_charge: { mean: 0.004, sd: 0.007 },
  vl_kickedBall: { mean: 0.005, sd: 0.008 },
  vl_lane: { mean: 0.002, sd: 0.005 },
  vl_offGoaltending: { mean: 0.002, sd: 0.005 },
  vl_defGoaltending: { mean: 0.003, sd: 0.006 },
  vl_inbound: { mean: 0.001, sd: 0.003 },
  vl_jumpBall: { mean: 0.001, sd: 0.004 },
  vl_delayOfGame: { mean: 0.004, sd: 0.007 },
  vl_pf: { mean: 1.8, sd: 0.7 },
  vl_pfd: { mean: 1.8, sd: 1.3 },
  vl_blka: { mean: 0.45, sd: 0.32 },
  vl_tov: { mean: 1.3, sd: 0.8 },
  vl_dd2: { mean: 4.2, sd: 8.5 },
  vl_td3: { mean: 0.4, sd: 2.1 },
  vl_nbaFantasyPts: { mean: 22.8, sd: 10.6 },
};

const RESILIENT_TEAM_ADV_BENCHMARKS: Record<string, NbaAdvancedBenchmarkStat> = {
  adv_offRtg: { mean: 114.6, sd: 4.2 },
  adv_defRtg: { mean: 114.6, sd: 3.9 },
  adv_netRtg: { mean: 0.0, sd: 6.4 },
  adv_pace: { mean: 99.6, sd: 2.1 },
  adv_efgPct: { mean: 54.4, sd: 2.2 },
  adv_tsPct: { mean: 57.9, sd: 2.0 },
  adv_pie: { mean: 50.0, sd: 3.4 },
  adv_astPct: { mean: 63.2, sd: 3.6 },
  adv_astRatio: { mean: 18.6, sd: 1.4 },
  adv_astTo: { mean: 1.92, sd: 0.24 },
  adv_orebPct: { mean: 27.8, sd: 2.8 },
  adv_drebPct: { mean: 72.2, sd: 2.4 },
  adv_rebPct: { mean: 50.0, sd: 1.8 },
  adv_tovPct: { mean: 13.8, sd: 1.1 },
  adv_ftaRate: { mean: 25.2, sd: 3.2 },
  adv_oppEfgPct: { mean: 54.4, sd: 2.1 },
  adv_oppTovPct: { mean: 13.8, sd: 1.3 },
  adv_oppOrebPct: { mean: 27.8, sd: 2.2 },
  adv_oppFtaRate: { mean: 25.2, sd: 2.9 },
  sc_pctFga2pt: { mean: 58.2, sd: 4.6 },
  sc_pctFga3pt: { mean: 41.8, sd: 4.6 },
  sc_pctPts2pt: { mean: 49.4, sd: 4.1 },
  sc_pctPts2ptMr: { mean: 6.9, sd: 2.2 },
  sc_pctPts3pt: { mean: 35.1, sd: 3.8 },
  sc_pctPtsFb: { mean: 12.6, sd: 2.1 },
  sc_pctPtsFt: { mean: 15.5, sd: 1.8 },
  sc_pctPtsOffTov: { mean: 14.8, sd: 1.6 },
  sc_pctPtsPaint: { mean: 42.5, sd: 3.9 },
  sc_pctAst2pm: { mean: 56.8, sd: 4.8 },
  sc_pctUast2pm: { mean: 43.2, sd: 4.8 },
  sc_pctAst3pm: { mean: 84.4, sd: 4.5 },
  sc_pctUast3pm: { mean: 15.6, sd: 4.5 },
  sc_pctAstFgm: { mean: 65.2, sd: 4.2 },
  sc_pctUastFgm: { mean: 34.8, sd: 4.2 },
  zn_raFga: { mean: 27.4, sd: 3.4 },
  zn_raFgm: { mean: 18.1, sd: 2.4 },
  zn_raFgPct: { mean: 66.0, sd: 3.1 },
  zn_paintNonRaFga: { mean: 17.5, sd: 2.6 },
  zn_paintNonRaFgm: { mean: 7.5, sd: 1.2 },
  zn_paintNonRaFgPct: { mean: 43.0, sd: 3.2 },
  zn_midFga: { mean: 10.1, sd: 2.8 },
  zn_midFgm: { mean: 4.2, sd: 1.2 },
  zn_midFgPct: { mean: 41.6, sd: 3.6 },
  zn_lc3Fga: { mean: 4.7, sd: 1.1 },
  zn_lc3Fgm: { mean: 1.8, sd: 0.45 },
  zn_lc3FgPct: { mean: 38.6, sd: 3.4 },
  zn_rc3Fga: { mean: 4.6, sd: 1.1 },
  zn_rc3Fgm: { mean: 1.75, sd: 0.44 },
  zn_rc3FgPct: { mean: 38.2, sd: 3.4 },
  zn_corner3Fga: { mean: 9.3, sd: 1.8 },
  zn_corner3Fgm: { mean: 3.55, sd: 0.72 },
  zn_corner3FgPct: { mean: 38.4, sd: 2.8 },
  zn_ab3Fga: { mean: 27.6, sd: 3.9 },
  zn_ab3Fgm: { mean: 9.9, sd: 1.5 },
  zn_ab3FgPct: { mean: 35.8, sd: 2.1 },
  zn_bcFga: { mean: 0.25, sd: 0.14 },
  zn_bcFgm: { mean: 0.02, sd: 0.03 },
  zn_bcFgPct: { mean: 8.5, sd: 11.0 },
  zn_totalRimFga: { mean: 27.4, sd: 3.4 },
  zn_rimFgPct: { mean: 66.0, sd: 3.1 },
  zn_totalThreeFga: { mean: 36.9, sd: 4.2 },
  zn_threeFgPct: { mean: 36.3, sd: 1.9 },
  tr_drives: { mean: 44.5, sd: 5.4 },
  tr_driveFgm: { mean: 11.2, sd: 1.6 },
  tr_driveFga: { mean: 22.8, sd: 3.1 },
  tr_drivePts: { mean: 28.2, sd: 3.8 },
  tr_driveFgPct: { mean: 49.1, sd: 2.8 },
  tr_driveAstPct: { mean: 8.4, sd: 1.4 },
  tr_driveTovPct: { mean: 6.2, sd: 1.1 },
  tr_drivePassesPct: { mean: 38.4, sd: 3.8 },
  tr_csPts: { mean: 29.8, sd: 4.2 },
  tr_csFgm: { mean: 10.4, sd: 1.5 },
  tr_csFga: { mean: 27.8, sd: 3.8 },
  tr_csFgPct: { mean: 37.4, sd: 2.4 },
  tr_csFg3Pct: { mean: 37.4, sd: 2.5 },
  tr_csEfgPct: { mean: 56.1, sd: 3.5 },
  tr_puPts: { mean: 18.2, sd: 3.8 },
  tr_puFgm: { mean: 7.8, sd: 1.6 },
  tr_puFga: { mean: 19.5, sd: 3.7 },
  tr_puFgPct: { mean: 39.8, sd: 2.8 },
  tr_puFg3Pct: { mean: 34.4, sd: 3.2 },
  tr_puEfgPct: { mean: 45.2, sd: 3.1 },
  tr_passesMade: { mean: 282.4, sd: 22.5 },
  tr_passesRec: { mean: 282.4, sd: 22.5 },
  tr_secAst: { mean: 4.2, sd: 0.9 },
  tr_potAst: { mean: 46.8, sd: 5.2 },
  tr_astPtsCreated: { mean: 66.4, sd: 7.4 },
  tr_astToPassAdj: { mean: 10.8, sd: 1.2 },
  tr_touches: { mean: 404.5, sd: 24.2 },
  tr_frontCtTouches: { mean: 234.0, sd: 14.5 },
  tr_timeOfPoss: { mean: 19.8, sd: 1.2 },
  tr_secPerTouch: { mean: 2.88, sd: 0.18 },
  tr_dribPerTouch: { mean: 2.15, sd: 0.22 },
  tr_ptsPerTouch: { mean: 0.278, sd: 0.018 },
  tr_paintTouches: { mean: 24.6, sd: 3.8 },
  tr_paintTouchFgPct: { mean: 58.2, sd: 3.6 },
  tr_postTouches: { mean: 6.4, sd: 2.6 },
  tr_postTouchFgPct: { mean: 51.2, sd: 4.5 },
  tr_elbowTouches: { mean: 9.8, sd: 2.4 },
  tr_distMiles: { mean: 18.4, sd: 0.65 },
  tr_distMilesOff: { mean: 9.85, sd: 0.35 },
  tr_distMilesDef: { mean: 8.55, sd: 0.32 },
  tr_avgSpeed: { mean: 4.26, sd: 0.12 },
  tr_avgSpeedOff: { mean: 4.58, sd: 0.15 },
  tr_avgSpeedDef: { mean: 3.94, sd: 0.11 },
  tr_rebChances: { mean: 74.2, sd: 5.2 },
  tr_rebChanceAdj: { mean: 58.4, sd: 2.8 },
  tr_orebContestPct: { mean: 45.4, sd: 4.2 },
  tr_drebContestPct: { mean: 22.0, sd: 2.4 },
  tr_avgRebDist: { mean: 6.5, sd: 0.5 },
  hu_ptsPaint: { mean: 49.4, sd: 4.6 },
  hu_pts2ndChance: { mean: 13.6, sd: 1.8 },
  hu_ptsFb: { mean: 14.5, sd: 2.4 },
  hu_ptsOffTov: { mean: 16.4, sd: 2.1 },
  hu_contestedShots: { mean: 47.8, sd: 4.2 },
  hu_contestedShots2pt: { mean: 31.4, sd: 3.6 },
  hu_contestedShots3pt: { mean: 16.4, sd: 2.2 },
  hu_deflections: { mean: 14.6, sd: 2.2 },
  hu_chargesDrawn: { mean: 0.42, sd: 0.24 },
  hu_screenAssists: { mean: 8.8, sd: 1.9 },
  hu_screenAstPts: { mean: 20.4, sd: 4.4 },
  hu_looseBalls: { mean: 6.7, sd: 0.95 },
  hu_offLooseBalls: { mean: 2.8, sd: 0.48 },
  hu_defLooseBalls: { mean: 3.9, sd: 0.62 },
  hu_boxOuts: { mean: 10.3, sd: 2.4 },
  hu_offBoxOuts: { mean: 1.4, sd: 0.48 },
  hu_defBoxOuts: { mean: 8.9, sd: 2.1 },
  hu_boxOutRebs: { mean: 8.4, sd: 1.9 },
  def_dFgPct: { mean: 46.6, sd: 1.9 },
  def_pctPlusMinus: { mean: -0.6, sd: 1.8 },
  def_dFgm: { mean: 41.2, sd: 2.2 },
  def_dFga: { mean: 88.5, sd: 3.4 },
  def_normalFgPct: { mean: 47.2, sd: 0.8 },
  def_freq: { mean: 100.0, sd: 0.0 },
  def_ws: { mean: 18.4, sd: 6.2 },
  def_pctStl: { mean: 50.0, sd: 4.5 },
  def_pctBlk: { mean: 50.0, sd: 6.5 },
  def_oppPtsPaint: { mean: 48.2, sd: 4.4 },
  def_oppPts2ndChance: { mean: 13.2, sd: 1.6 },
  def_oppPtsFb: { mean: 14.1, sd: 2.1 },
  def_oppPtsOffTov: { mean: 15.6, sd: 2.0 },
  def_oppFgPct: { mean: 46.6, sd: 1.8 },
  def_oppFg3Pct: { mean: 36.0, sd: 1.7 },
  def_oppFg3m: { mean: 13.1, sd: 1.4 },
  def_oppFtPct: { mean: 78.1, sd: 2.1 },
  def_oppReb: { mean: 42.7, sd: 2.3 },
  def_oppAst: { mean: 26.2, sd: 1.9 },
  def_oppTov: { mean: 14.1, sd: 1.5 },
  def_oppStl: { mean: 7.6, sd: 1.1 },
  cl_gp: { mean: 24.0, sd: 6.5 },
  cl_min: { mean: 4.2, sd: 0.6 },
  cl_pts: { mean: 9.4, sd: 1.6 },
  cl_netRtg: { mean: 0.0, sd: 16.5 },
  cl_offRtg: { mean: 111.5, sd: 12.2 },
  cl_defRtg: { mean: 111.5, sd: 11.4 },
  cl_fgPct: { mean: 44.8, sd: 5.4 },
  cl_fg3Pct: { mean: 34.2, sd: 6.8 },
  cl_ftPct: { mean: 77.8, sd: 6.2 },
  cl_tsPct: { mean: 57.6, sd: 5.8 },
  cl_efgPct: { mean: 51.2, sd: 6.1 },
  cl_usgPct: { mean: 100.0, sd: 0.0 },
  cl_pie: { mean: 50.0, sd: 12.4 },
  cl_rebAst: { mean: 4.1, sd: 0.8 },
  cl_ast: { mean: 1.8, sd: 0.5 },
  cl_stl: { mean: 0.7, sd: 0.3 },
  cl_blk: { mean: 0.5, sd: 0.25 },
  cl_tov: { mean: 0.9, sd: 0.35 },
  cl_plusMinus: { mean: 0.0, sd: 1.5 },
  pt_top_off: { mean: 1.07, sd: 0.07 },
  pt_spotup: { mean: 1.04, sd: 0.06 },
  pt_prbh: { mean: 0.91, sd: 0.06 },
  pt_trans: { mean: 1.15, sd: 0.06 },
  pt_iso: { mean: 0.90, sd: 0.08 },
  pt_prr: { mean: 1.14, sd: 0.08 },
  pt_cut: { mean: 1.30, sd: 0.07 },
  pt_post: { mean: 0.92, sd: 0.09 },
  pt_handoff: { mean: 0.94, sd: 0.07 },
  pt_offscr: { mean: 0.98, sd: 0.08 },
  pt_putback: { mean: 1.12, sd: 0.08 },
  pt_misc: { mean: 0.62, sd: 0.08 },
  pt_def_spotup: { mean: 1.04, sd: 0.05 },
  pt_def_prbh: { mean: 0.91, sd: 0.05 },
  pt_def_iso: { mean: 0.90, sd: 0.07 },
  pt_def_post: { mean: 0.92, sd: 0.08 },
  pt_def_prr: { mean: 1.14, sd: 0.07 },
  pt_def_trans: { mean: 1.15, sd: 0.06 },
  vl_total: { mean: 2.65, sd: 0.42 },
  vl_travel: { mean: 0.44, sd: 0.14 },
  vl_doubleDribble: { mean: 0.06, sd: 0.04 },
  vl_discontinuedDribble: { mean: 0.09, sd: 0.05 },
  vl_palming: { mean: 0.05, sd: 0.04 },
  vl_offThreeSec: { mean: 0.11, sd: 0.05 },
  vl_defThreeSec: { mean: 0.15, sd: 0.06 },
  vl_shotClock: { mean: 0.26, sd: 0.09 },
  vl_fiveSec: { mean: 0.04, sd: 0.03 },
  vl_eightSec: { mean: 0.02, sd: 0.02 },
  vl_backcourt: { mean: 0.06, sd: 0.04 },
  vl_offFoul: { mean: 0.48, sd: 0.12 },
  vl_charge: { mean: 0.15, sd: 0.06 },
  vl_kickedBall: { mean: 0.22, sd: 0.07 },
  vl_lane: { mean: 0.07, sd: 0.04 },
  vl_offGoaltending: { mean: 0.07, sd: 0.04 },
  vl_defGoaltending: { mean: 0.13, sd: 0.05 },
  vl_inbound: { mean: 0.04, sd: 0.03 },
  vl_jumpBall: { mean: 0.06, sd: 0.04 },
  vl_delayOfGame: { mean: 0.16, sd: 0.06 },
  vl_pf: { mean: 19.2, sd: 1.8 },
  vl_pfd: { mean: 19.2, sd: 1.6 },
  vl_blka: { mean: 4.9, sd: 0.7 },
  vl_tov: { mean: 14.1, sd: 1.2 },
};

export function computeClientLeagueBenchmarks(
  entityType: 'player' | 'team',
  players: PlayerSummary[],
  teams: TeamSummary[],
  dossierBenchmarks?: Record<string, NbaAdvancedBenchmarkStat> | null
): Record<string, NbaAdvancedBenchmarkStat> {
  const fallbackMap =
    entityType === 'player'
      ? RESILIENT_PLAYER_ADV_BENCHMARKS
      : RESILIENT_TEAM_ADV_BENCHMARKS;
  const out: Record<string, NbaAdvancedBenchmarkStat> = {
    ...fallbackMap,
    ...(dossierBenchmarks || {}),
  };

  if (entityType === 'player' && players.length > 0) {
    const rot = players.filter((p) => (p.minutesAvg || 0) >= 12 && p.games.length >= 3);
    const pool = rot.length >= 20 ? rot : players;
    const set = (key: string, arr: number[], dec = 1) => {
      const res = calcMeanAndSd(arr, dec);
      if (res) out[key] = res;
    };
    const setIfMissing = (key: string, arr: number[], dec = 1) => {
      if (dossierBenchmarks?.[key]) return;
      const res = calcMeanAndSd(arr, dec);
      if (res) out[key] = res;
    };
    const gsOf = (p: PlayerSummary) => {
      const s27 = p.games.filter((g) => g.seasonLabel === '2026-27');
      return s27.length > 0 ? s27 : p.games;
    };

    set('basic_gp', pool.map((p) => p.gamesPlayed || gsOf(p).length), 1);
    set('basic_min', pool.map((p) => p.minutesAvg ?? mean(gsOf(p).map((g) => g.minutes))), 1);
    set('basic_pts', pool.map((p) => p.ptsAvg ?? mean(gsOf(p).map((g) => g.points))), 1);
    set('basic_reb', pool.map((p) => p.rebAvg ?? mean(gsOf(p).map((g) => g.rebounds))), 1);
    set('basic_oreb', pool.map((p) => mean(gsOf(p).map((g) => g.oreb))), 1);
    set('basic_dreb', pool.map((p) => mean(gsOf(p).map((g) => g.dreb))), 1);
    set('basic_ast', pool.map((p) => p.astAvg ?? mean(gsOf(p).map((g) => g.assists))), 1);
    set('basic_stl', pool.map((p) => p.stlAvg ?? mean(gsOf(p).map((g) => g.steals))), 1);
    set('basic_blk', pool.map((p) => p.blkAvg ?? mean(gsOf(p).map((g) => g.blocks))), 1);
    set('basic_stocks', pool.map((p) => (p.stlAvg || 0) + (p.blkAvg || 0)), 1);
    set('basic_fgPct', pool.map((p) => p.fgPct ?? NaN).filter((v) => Number.isFinite(v) && v > 0), 1);
    set('basic_fg3m', pool.map((p) => mean(gsOf(p).map((g) => g.fg3m))), 1);
    set('basic_fg3a', pool.map((p) => mean(gsOf(p).map((g) => g.fg3a))), 1);
    set('basic_fg3Pct', pool.map((p) => p.fg3Pct ?? NaN).filter((v) => Number.isFinite(v) && v > 0), 1);
    set('basic_ftPct', pool.map((p) => p.ftPct ?? NaN).filter((v) => Number.isFinite(v) && v > 0), 1);
    set('basic_plusMinus', pool.map((p) => mean(gsOf(p).map((g) => g.plusMinus))), 1);
    set('basic_pra', pool.map((p) => mean(gsOf(p).map((g) => g.pra))), 1);
    set('basic_fgm', pool.map((p) => mean(gsOf(p).map((g) => g.fgm))), 1);
    set('basic_fga', pool.map((p) => mean(gsOf(p).map((g) => g.fga))), 1);
    set('basic_fg2m', pool.map((p) => mean(gsOf(p).map((g) => Math.max(0, g.fgm - g.fg3m)))), 1);
    set('basic_fg2a', pool.map((p) => mean(gsOf(p).map((g) => Math.max(0, g.fga - g.fg3a)))), 1);
    set('basic_fg2Pct', pool.map((p) => {
      const gs = gsOf(p);
      const m2 = gs.reduce((s, g) => s + Math.max(0, g.fgm - g.fg3m), 0);
      const a2 = gs.reduce((s, g) => s + Math.max(0, g.fga - g.fg3a), 0);
      return a2 > 0 ? (m2 / a2) * 100 : NaN;
    }), 1);
    set('basic_ftm', pool.map((p) => mean(gsOf(p).map((g) => g.ftm))), 1);
    set('basic_fta', pool.map((p) => mean(gsOf(p).map((g) => g.fta))), 1);
    set('adv_gmSc', pool.map((p) => mean(gsOf(p).map((g) => g.gameScore))), 1);
    set('adv_ptsPerShot', pool.map((p) => {
      const gs = gsOf(p);
      const pts = gs.reduce((s, g) => s + g.points, 0);
      const fga = gs.reduce((s, g) => s + g.fga, 0);
      return fga > 0 ? pts / fga : NaN;
    }), 2);
    set('adv_ptsPer36', pool.map((p) => {
      const gs = gsOf(p);
      const pts = gs.reduce((s, g) => s + g.points, 0);
      const m = gs.reduce((s, g) => s + g.minutes, 0);
      return m > 0 ? (pts / m) * 36 : NaN;
    }), 1);
    set('adv_rebPer36', pool.map((p) => {
      const gs = gsOf(p);
      const reb = gs.reduce((s, g) => s + g.rebounds, 0);
      const m = gs.reduce((s, g) => s + g.minutes, 0);
      return m > 0 ? (reb / m) * 36 : NaN;
    }), 1);
    set('adv_astPer36', pool.map((p) => {
      const gs = gsOf(p);
      const ast = gs.reduce((s, g) => s + g.assists, 0);
      const m = gs.reduce((s, g) => s + g.minutes, 0);
      return m > 0 ? (ast / m) * 36 : NaN;
    }), 1);
    set('adv_praPer36', pool.map((p) => {
      const gs = gsOf(p);
      const pra = gs.reduce((s, g) => s + g.pra, 0);
      const m = gs.reduce((s, g) => s + g.minutes, 0);
      return m > 0 ? (pra / m) * 36 : NaN;
    }), 1);
    set('adv_stocksPer36', pool.map((p) => {
      const gs = gsOf(p);
      const stk = gs.reduce((s, g) => s + g.stocks, 0);
      const m = gs.reduce((s, g) => s + g.minutes, 0);
      return m > 0 ? (stk / m) * 36 : NaN;
    }), 1);

    // Client boxscore-derivable Layer 2 / Layer 10 benchmarks if live NBA.com dossier is missing or partial
    setIfMissing('adv_efgPct', pool.map((p) => {
      const gs = gsOf(p);
      const fgm = gs.reduce((s, g) => s + g.fgm, 0);
      const fg3m = gs.reduce((s, g) => s + g.fg3m, 0);
      const fga = gs.reduce((s, g) => s + g.fga, 0);
      return fga > 0 ? ((fgm + 0.5 * fg3m) / fga) * 100 : NaN;
    }), 1);
    setIfMissing('adv_tsPct', pool.map((p) => {
      const gs = gsOf(p);
      const pts = gs.reduce((s, g) => s + g.points, 0);
      const fga = gs.reduce((s, g) => s + g.fga, 0);
      const fta = gs.reduce((s, g) => s + g.fta, 0);
      const denom = 2 * (fga + 0.44 * fta);
      return denom > 0 ? (pts / denom) * 100 : NaN;
    }), 1);
    setIfMissing('adv_astTo', pool.map((p) => {
      const gs = gsOf(p);
      const ast = gs.reduce((s, g) => s + g.assists, 0);
      const tov = gs.reduce((s, g) => s + g.turnovers, 0);
      return tov > 0 ? ast / tov : ast > 0 ? ast : NaN;
    }), 2);
    setIfMissing('adv_tovPct', pool.map((p) => {
      const gs = gsOf(p);
      const tov = gs.reduce((s, g) => s + g.turnovers, 0);
      const fga = gs.reduce((s, g) => s + g.fga, 0);
      const fta = gs.reduce((s, g) => s + g.fta, 0);
      const denom = fga + 0.44 * fta + tov;
      return denom > 0 ? (tov / denom) * 100 : NaN;
    }), 1);
    setIfMissing('adv_ftaRate', pool.map((p) => {
      const gs = gsOf(p);
      const fta = gs.reduce((s, g) => s + g.fta, 0);
      const fga = gs.reduce((s, g) => s + g.fga, 0);
      return fga > 0 ? (fta / fga) * 100 : NaN;
    }), 1);
    setIfMissing('vl_pf', pool.map((p) => mean(gsOf(p).map((g) => g.fouls))), 1);
    setIfMissing('vl_tov', pool.map((p) => mean(gsOf(p).map((g) => g.turnovers))), 1);
    setIfMissing('vl_dd2', pool.map((p) => gsOf(p).filter((g) => [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter((v) => v >= 10).length >= 2).length), 1);
    setIfMissing('vl_td3', pool.map((p) => gsOf(p).filter((g) => [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter((v) => v >= 10).length >= 3).length), 1);
    setIfMissing('vl_nbaFantasyPts', pool.map((p) => mean(gsOf(p).map((g) => g.points + 1.2 * g.rebounds + 1.5 * g.assists + 3 * g.steals + 3 * g.blocks - g.turnovers))), 1);
  } else if (entityType === 'team' && teams.length > 0) {
    const set = (key: string, arr: number[], dec = 1) => {
      const res = calcMeanAndSd(arr, dec);
      if (res) out[key] = res;
    };
    const setIfMissing = (key: string, arr: number[], dec = 1) => {
      if (dossierBenchmarks?.[key]) return;
      const res = calcMeanAndSd(arr, dec);
      if (res) out[key] = res;
    };
    set('basic_gp', teams.map((t) => (t.wins + t.losses) || t.games.length), 1);
    set('basic_pts', teams.map((t) => t.avgPointsFor), 1);
    set('basic_opp_pts', teams.map((t) => t.avgPointsAgainst), 1);
    set('basic_diff', teams.map((t) => t.differential), 1);
    set('basic_plusMinus', teams.map((t) => t.differential), 1);
    set('basic_reb', teams.map((t) => mean(t.games.map((g) => g.reb))), 1);
    set('basic_oreb', teams.map((t) => mean(t.games.map((g) => g.oreb))), 1);
    set('basic_dreb', teams.map((t) => mean(t.games.map((g) => g.dreb))), 1);
    set('basic_ast', teams.map((t) => mean(t.games.map((g) => g.ast))), 1);
    set('basic_stl', teams.map((t) => mean(t.games.map((g) => g.stl))), 1);
    set('basic_blk', teams.map((t) => mean(t.games.map((g) => g.blk))), 1);
    set('basic_stocks', teams.map((t) => mean(t.games.map((g) => (g.stl || 0) + (g.blk || 0)))), 1);
    set('basic_fgPct', teams.map((t) => {
      const m = t.games.reduce((s, g) => s + g.fgm, 0);
      const a = t.games.reduce((s, g) => s + g.fga, 0);
      return a > 0 ? (m / a) * 100 : NaN;
    }), 1);
    set('basic_fg3m', teams.map((t) => mean(t.games.map((g) => g.fg3m))), 1);
    set('basic_fg3a', teams.map((t) => mean(t.games.map((g) => g.fg3a))), 1);
    set('basic_fg3Pct', teams.filter((t) => (t.fg3Pct || 0) > 0).map((t) => t.fg3Pct || 0), 1);
    set('basic_ftPct', teams.filter((t) => (t.ftPct || 0) > 0).map((t) => t.ftPct || 0), 1);
    set('basic_fgm', teams.map((t) => mean(t.games.map((g) => g.fgm))), 1);
    set('basic_fga', teams.map((t) => mean(t.games.map((g) => g.fga))), 1);
    set('basic_fg2m', teams.map((t) => mean(t.games.map((g) => Math.max(0, g.fgm - g.fg3m)))), 1);
    set('basic_fg2a', teams.map((t) => mean(t.games.map((g) => Math.max(0, g.fga - g.fg3a)))), 1);
    set('basic_fg2Pct', teams.map((t) => {
      const m2 = t.games.reduce((s, g) => s + Math.max(0, g.fgm - g.fg3m), 0);
      const a2 = t.games.reduce((s, g) => s + Math.max(0, g.fga - g.fg3a), 0);
      return a2 > 0 ? (m2 / a2) * 100 : NaN;
    }), 1);
    set('basic_ftm', teams.map((t) => mean(t.games.map((g) => g.ftm))), 1);
    set('basic_fta', teams.map((t) => mean(t.games.map((g) => g.fta))), 1);
    set('adv_ptsPerShot', teams.map((t) => {
      const pts = t.games.reduce((s, g) => s + g.pointsFor, 0);
      const fga = t.games.reduce((s, g) => s + g.fga, 0);
      return fga > 0 ? pts / fga : NaN;
    }), 2);
    setIfMissing('adv_offRtg', teams.map((t) => t.offRtg ?? t.advanced?.offRtg ?? (t.games.length ? mean(t.games.map((g) => g.offRtg)) : NaN)), 1);
    setIfMissing('adv_defRtg', teams.map((t) => t.defRtg ?? t.advanced?.defRtg ?? (t.games.length ? mean(t.games.map((g) => g.defRtg)) : NaN)), 1);
    setIfMissing('adv_netRtg', teams.map((t) => t.netRtg ?? t.advanced?.netRtg ?? (t.games.length ? mean(t.games.map((g) => g.netRtg)) : NaN)), 1);
    setIfMissing('adv_pace', teams.map((t) => t.pace ?? t.advanced?.pace ?? (t.games.length ? mean(t.games.map((g) => g.pace)) : NaN)), 1);
    setIfMissing('adv_efgPct', teams.map((t) => t.efgPct ?? t.advanced?.efgPct ?? (t.games.length ? mean(t.games.map((g) => g.efgPct)) : NaN)), 1);
    setIfMissing('adv_tsPct', teams.map((t) => t.tsPct ?? t.advanced?.tsPct ?? (t.games.length ? mean(t.games.map((g) => g.tsPct)) : NaN)), 1);
    setIfMissing('adv_tovPct', teams.map((t) => t.tovPct ?? t.advanced?.tovPct ?? (t.games.length ? mean(t.games.map((g) => g.tovPct)) : NaN)), 1);
    setIfMissing('adv_orebPct', teams.map((t) => t.orebPct ?? t.advanced?.orebPct ?? (t.games.length ? mean(t.games.map((g) => g.orebPct)) : NaN)), 1);
    setIfMissing('adv_drebPct', teams.map((t) => t.advanced?.drebPct ?? NaN), 1);
    setIfMissing('adv_astTo', teams.map((t) => {
      const ast = t.games.reduce((s, g) => s + g.ast, 0);
      const tov = t.games.reduce((s, g) => s + g.tov, 0);
      return tov > 0 ? ast / tov : NaN;
    }), 2);
    setIfMissing('adv_ftaRate', teams.map((t) => {
      const fta = t.games.reduce((s, g) => s + g.fta, 0);
      const fga = t.games.reduce((s, g) => s + g.fga, 0);
      return fga > 0 ? (fta / fga) * 100 : NaN;
    }), 1);
    setIfMissing('vl_tov', teams.map((t) => mean(t.games.map((g) => g.tov))), 1);
  }

  return out;
}

export function buildInstantPlayerAdvancedDossier(player: any, players: any[] = [], teams: any[] = []): any {
  const pid = player?.id || 'player';
  const tid = player?.teamId || '';
  const leagueBenchmarks = computeClientLeagueBenchmarks('player', players, teams);
  return {
    playerId: pid,
    teamId: tid,
    season: '2026-27',
    seasonLabel: '2026-27',
    generatedAt: new Date().toISOString(),
    shotZones: {
      entityId: pid,
      entityName: player?.name || 'Jugador',
      teamId: tid,
      teamAbbr: player?.teamAbbr || 'NBA',
      restrictedArea: { fgm: 0, fga: 0, fgPct: 0 },
      paintNonRa: { fgm: 0, fga: 0, fgPct: 0 },
      midRange: { fgm: 0, fga: 0, fgPct: 0 },
      leftCorner3: { fgm: 0, fga: 0, fgPct: 0 },
      rightCorner3: { fgm: 0, fga: 0, fgPct: 0 },
      aboveBreak3: { fgm: 0, fga: 0, fgPct: 0 },
      corner3: { fgm: 0, fga: 0, fgPct: 0 },
      backcourt: { fgm: 0, fga: 0, fgPct: 0 },
      totalRimFga: 0,
      rimFgPct: 0,
      totalThreeFga: 0,
      threeFgPct: 0,
    },
    clutch: null,
    defenseHustle: null,
    tracking: null,
    scoring: null,
    fourFactors: null,
    violations: null,
    playtypesOff: [],
    playtypesDef: [],
    onOffSplit: null,
    leagueBenchmarks,
  };
}

export function buildInstantTeamAdvancedDossier(team: any, players: any[] = [], teams: any[] = []): any {
  const tid = team?.id || 'team';
  const leagueBenchmarks = computeClientLeagueBenchmarks('team', players, teams);
  return {
    teamId: tid,
    season: '2026-27',
    seasonLabel: '2026-27',
    generatedAt: new Date().toISOString(),
    shotZones: null,
    clutch: null,
    defenseHustle: null,
    tracking: null,
    scoring: null,
    fourFactors: null,
    violations: null,
    playtypesOff: [],
    playtypesDef: [],
    onOffSplits: [],
    leagueBenchmarks,
  };
}

// ============================================================================
// PER-GAME TIME SERIES RESOLVER FOR CHARTS (All game-log computable KPIs)
// ============================================================================
export interface ResolvedKpiGameSeries {
  playerGameValue?: (g: PlayerGameLog) => number;
  playerSliceValue?: (gs: PlayerGameLog[]) => number;
  teamGameValue?: (g: TeamGameLog) => number;
  teamSliceValue?: (gs: TeamGameLog[]) => number;
}

export function resolveKpiGameSeries(
  key: string,
  entityType: 'player' | 'team'
): ResolvedKpiGameSeries | null {
  if (entityType === 'player') {
    const sumP = (gs: PlayerGameLog[], fn: (g: PlayerGameLog) => number) =>
      gs.reduce((s, g) => s + fn(g), 0);
    const avgP = (gs: PlayerGameLog[], fn: (g: PlayerGameLog) => number) =>
      gs.length ? sumP(gs, fn) / gs.length : 0;

    switch (key) {
      case 'basic_min':
      case 'minutes':
        return { playerGameValue: (g) => g.minutes, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.minutes)) };
      case 'basic_pts':
      case 'points':
        return { playerGameValue: (g) => g.points, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.points)) };
      case 'basic_reb':
      case 'rebounds':
        return { playerGameValue: (g) => g.rebounds, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.rebounds)) };
      case 'basic_oreb':
      case 'oreb':
        return { playerGameValue: (g) => g.oreb, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.oreb)) };
      case 'basic_dreb':
      case 'dreb':
        return { playerGameValue: (g) => g.dreb, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.dreb)) };
      case 'basic_ast':
      case 'assists':
        return { playerGameValue: (g) => g.assists, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.assists)) };
      case 'basic_stl':
      case 'steals':
        return { playerGameValue: (g) => g.steals, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.steals)) };
      case 'basic_blk':
      case 'blocks':
        return { playerGameValue: (g) => g.blocks, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.blocks)) };
      case 'basic_stocks':
      case 'stocks':
        return { playerGameValue: (g) => g.stocks, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.stocks)) };
      case 'basic_fgPct':
      case 'fgPct':
        return {
          playerGameValue: (g) => g.fgPct,
          playerSliceValue: (gs) => {
            const m = sumP(gs, (g) => g.fgm);
            const a = sumP(gs, (g) => g.fga);
            return a > 0 ? round1((m / a) * 100) : 0;
          },
        };
      case 'basic_fgm':
      case 'fgm':
        return { playerGameValue: (g) => g.fgm, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.fgm)) };
      case 'basic_fga':
      case 'fga':
        return { playerGameValue: (g) => g.fga, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.fga)) };
      case 'basic_fg2m':
      case 'fg2m':
        return {
          playerGameValue: (g) => Math.max(0, g.fgm - g.fg3m),
          playerSliceValue: (gs) => round1(avgP(gs, (g) => Math.max(0, g.fgm - g.fg3m))),
        };
      case 'basic_fg2a':
      case 'fg2a':
        return {
          playerGameValue: (g) => Math.max(0, g.fga - g.fg3a),
          playerSliceValue: (gs) => round1(avgP(gs, (g) => Math.max(0, g.fga - g.fg3a))),
        };
      case 'basic_fg2Pct':
      case 'fg2Pct':
        return {
          playerGameValue: (g) => {
            const a2 = Math.max(0, g.fga - g.fg3a);
            return a2 > 0 ? round1((Math.max(0, g.fgm - g.fg3m) / a2) * 100) : 0;
          },
          playerSliceValue: (gs) => {
            const m2 = sumP(gs, (g) => Math.max(0, g.fgm - g.fg3m));
            const a2 = sumP(gs, (g) => Math.max(0, g.fga - g.fg3a));
            return a2 > 0 ? round1((m2 / a2) * 100) : 0;
          },
        };
      case 'basic_fg3m':
      case 'fg3m':
        return { playerGameValue: (g) => g.fg3m, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.fg3m)) };
      case 'basic_fg3a':
      case 'fg3a':
        return { playerGameValue: (g) => g.fg3a, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.fg3a)) };
      case 'basic_fg3Pct':
      case 'fg3Pct':
        return {
          playerGameValue: (g) => g.fg3Pct,
          playerSliceValue: (gs) => {
            const m = sumP(gs, (g) => g.fg3m);
            const a = sumP(gs, (g) => g.fg3a);
            return a > 0 ? round1((m / a) * 100) : 0;
          },
        };
      case 'basic_ftm':
      case 'ftm':
        return { playerGameValue: (g) => g.ftm, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.ftm)) };
      case 'basic_fta':
      case 'fta':
        return { playerGameValue: (g) => g.fta, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.fta)) };
      case 'basic_ftPct':
      case 'ftPct':
        return {
          playerGameValue: (g) => g.ftPct,
          playerSliceValue: (gs) => {
            const m = sumP(gs, (g) => g.ftm);
            const a = sumP(gs, (g) => g.fta);
            return a > 0 ? round1((m / a) * 100) : 0;
          },
        };
      case 'basic_plusMinus':
      case 'plusMinus':
        return { playerGameValue: (g) => g.plusMinus, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.plusMinus)) };
      case 'basic_pra':
      case 'pra':
        return { playerGameValue: (g) => g.pra, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.pra)) };
      case 'adv_efgPct':
      case 'efgPct':
        return {
          playerGameValue: (g) => g.efgPct,
          playerSliceValue: (gs) => {
            const fgm = sumP(gs, (g) => g.fgm);
            const fg3m = sumP(gs, (g) => g.fg3m);
            const fga = sumP(gs, (g) => g.fga);
            return fga > 0 ? round1(((fgm + 0.5 * fg3m) / fga) * 100) : 0;
          },
        };
      case 'adv_tsPct':
      case 'tsPct':
        return {
          playerGameValue: (g) => g.tsPct,
          playerSliceValue: (gs) => {
            const pts = sumP(gs, (g) => g.points);
            const fga = sumP(gs, (g) => g.fga);
            const fta = sumP(gs, (g) => g.fta);
            const den = 2 * (fga + 0.44 * fta);
            return den > 0 ? round1((pts / den) * 100) : 0;
          },
        };
      case 'adv_usgPct':
      case 'usgEst':
        return {
          playerGameValue: (g) => g.usgEst,
          playerSliceValue: (gs) => {
            const m = sumP(gs, (g) => g.minutes);
            return m > 0 ? round1(sumP(gs, (g) => g.usgEst * g.minutes) / m) : round1(avgP(gs, (g) => g.usgEst));
          },
        };
      case 'adv_astTo':
      case 'astTo':
        return {
          playerGameValue: (g) => Math.round((g.turnovers > 0 ? g.assists / g.turnovers : g.assists) * 100) / 100,
          playerSliceValue: (gs) => {
            const a = sumP(gs, (g) => g.assists);
            const t = sumP(gs, (g) => g.turnovers);
            return Math.round((t > 0 ? a / t : a) * 100) / 100;
          },
        };
      case 'adv_tovPct':
      case 'tovRatioEst':
        return {
          playerGameValue: (g) => {
            const pl = g.fga + 0.44 * g.fta + g.turnovers;
            return pl > 0 ? round1((g.turnovers / pl) * 100) : 0;
          },
          playerSliceValue: (gs) => {
            const t = sumP(gs, (g) => g.turnovers);
            const pl = sumP(gs, (g) => g.fga + 0.44 * g.fta + g.turnovers);
            return pl > 0 ? round1((t / pl) * 100) : 0;
          },
        };
      case 'adv_ftaRate':
      case 'ftr':
        return {
          playerGameValue: (g) => (g.fga > 0 ? round1((g.fta / g.fga) * 100) : 0),
          playerSliceValue: (gs) => {
            const fta = sumP(gs, (g) => g.fta);
            const fga = sumP(gs, (g) => g.fga);
            return fga > 0 ? round1((fta / fga) * 100) : 0;
          },
        };
      case 'adv_gmSc':
      case 'gameScore':
        return { playerGameValue: (g) => round1(g.gameScore), playerSliceValue: (gs) => round1(avgP(gs, (g) => g.gameScore)) };
      case 'adv_ptsPerShot':
      case 'ptsPerShot':
        return {
          playerGameValue: (g) => (g.fga > 0 ? Math.round((g.points / g.fga) * 100) / 100 : 0),
          playerSliceValue: (gs) => {
            const p = sumP(gs, (g) => g.points);
            const a = sumP(gs, (g) => g.fga);
            return a > 0 ? Math.round((p / a) * 100) / 100 : 0;
          },
        };
      case 'adv_ptsPer36':
      case 'ptsPer36':
        return {
          playerGameValue: (g) => (g.minutes > 0 ? round1((g.points / g.minutes) * 36) : 0),
          playerSliceValue: (gs) => {
            const m = sumP(gs, (g) => g.minutes);
            return m > 0 ? round1((sumP(gs, (g) => g.points) / m) * 36) : 0;
          },
        };
      case 'adv_rebPer36':
      case 'rebPer36':
        return {
          playerGameValue: (g) => (g.minutes > 0 ? round1((g.rebounds / g.minutes) * 36) : 0),
          playerSliceValue: (gs) => {
            const m = sumP(gs, (g) => g.minutes);
            return m > 0 ? round1((sumP(gs, (g) => g.rebounds) / m) * 36) : 0;
          },
        };
      case 'adv_astPer36':
      case 'astPer36':
        return {
          playerGameValue: (g) => (g.minutes > 0 ? round1((g.assists / g.minutes) * 36) : 0),
          playerSliceValue: (gs) => {
            const m = sumP(gs, (g) => g.minutes);
            return m > 0 ? round1((sumP(gs, (g) => g.assists) / m) * 36) : 0;
          },
        };
      case 'adv_praPer36':
      case 'praPer36':
        return {
          playerGameValue: (g) => (g.minutes > 0 ? round1((g.pra / g.minutes) * 36) : 0),
          playerSliceValue: (gs) => {
            const m = sumP(gs, (g) => g.minutes);
            return m > 0 ? round1((sumP(gs, (g) => g.pra) / m) * 36) : 0;
          },
        };
      case 'adv_stocksPer36':
      case 'stocksPer36':
        return {
          playerGameValue: (g) => (g.minutes > 0 ? round1((g.stocks / g.minutes) * 36) : 0),
          playerSliceValue: (gs) => {
            const m = sumP(gs, (g) => g.minutes);
            return m > 0 ? round1((sumP(gs, (g) => g.stocks) / m) * 36) : 0;
          },
        };
      case 'sc_pctFga2pt':
        return {
          playerGameValue: (g) => (g.fga > 0 ? round1(((g.fga - g.fg3a) / g.fga) * 100) : 0),
          playerSliceValue: (gs) => {
            const a = sumP(gs, (g) => g.fga);
            return a > 0 ? round1((sumP(gs, (g) => Math.max(0, g.fga - g.fg3a)) / a) * 100) : 0;
          },
        };
      case 'sc_pctFga3pt':
        return {
          playerGameValue: (g) => (g.fga > 0 ? round1((g.fg3a / g.fga) * 100) : 0),
          playerSliceValue: (gs) => {
            const a = sumP(gs, (g) => g.fga);
            return a > 0 ? round1((sumP(gs, (g) => g.fg3a) / a) * 100) : 0;
          },
        };
      case 'sc_pctPts2pt':
        return {
          playerGameValue: (g) => (g.points > 0 ? round1(((Math.max(0, g.fgm - g.fg3m) * 2) / g.points) * 100) : 0),
          playerSliceValue: (gs) => {
            const p = sumP(gs, (g) => g.points);
            return p > 0 ? round1((sumP(gs, (g) => Math.max(0, g.fgm - g.fg3m) * 2) / p) * 100) : 0;
          },
        };
      case 'sc_pctPts3pt':
        return {
          playerGameValue: (g) => (g.points > 0 ? round1(((g.fg3m * 3) / g.points) * 100) : 0),
          playerSliceValue: (gs) => {
            const p = sumP(gs, (g) => g.points);
            return p > 0 ? round1((sumP(gs, (g) => g.fg3m * 3) / p) * 100) : 0;
          },
        };
      case 'sc_pctPtsFt':
        return {
          playerGameValue: (g) => (g.points > 0 ? round1((g.ftm / g.points) * 100) : 0),
          playerSliceValue: (gs) => {
            const p = sumP(gs, (g) => g.points);
            return p > 0 ? round1((sumP(gs, (g) => g.ftm) / p) * 100) : 0;
          },
        };
      case 'vl_pf':
      case 'fouls':
        return { playerGameValue: (g) => g.fouls, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.fouls)) };
      case 'vl_tov':
      case 'turnovers':
        return { playerGameValue: (g) => g.turnovers, playerSliceValue: (gs) => round1(avgP(gs, (g) => g.turnovers)) };
      case 'vl_nbaFantasyPts':
        return {
          playerGameValue: (g) =>
            round1(g.points + 1.2 * g.rebounds + 1.5 * g.assists + 3 * g.steals + 3 * g.blocks - g.turnovers),
          playerSliceValue: (gs) =>
            round1(
              avgP(
                gs,
                (g) => g.points + 1.2 * g.rebounds + 1.5 * g.assists + 3 * g.steals + 3 * g.blocks - g.turnovers
              )
            ),
        };
      default:
        return null;
    }
  }

  // Team game log series
  const sumT = (gs: TeamGameLog[], fn: (g: TeamGameLog) => number) =>
    gs.reduce((s, g) => s + fn(g), 0);
  const avgT = (gs: TeamGameLog[], fn: (g: TeamGameLog) => number) =>
    gs.length ? sumT(gs, fn) / gs.length : 0;

  switch (key) {
    case 'basic_pts':
      return { teamGameValue: (g) => g.pointsFor, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.pointsFor)) };
    case 'basic_opp_pts':
      return { teamGameValue: (g) => g.pointsAgainst, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.pointsAgainst)) };
    case 'basic_diff':
      return { teamGameValue: (g) => g.differential, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.differential)) };
    case 'basic_reb':
      return { teamGameValue: (g) => g.reb, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.reb)) };
    case 'basic_oreb':
      return { teamGameValue: (g) => g.oreb, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.oreb)) };
    case 'basic_dreb':
      return { teamGameValue: (g) => g.dreb, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.dreb)) };
    case 'basic_ast':
      return { teamGameValue: (g) => g.ast, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.ast)) };
    case 'basic_stl':
      return { teamGameValue: (g) => g.stl, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.stl)) };
    case 'basic_blk':
      return { teamGameValue: (g) => g.blk, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.blk)) };
    case 'basic_stocks':
      return { teamGameValue: (g) => (g.stl || 0) + (g.blk || 0), teamSliceValue: (gs) => round1(avgT(gs, (g) => (g.stl || 0) + (g.blk || 0))) };
    case 'basic_fgPct':
      return {
        teamGameValue: (g) => (g.fga > 0 ? round1((g.fgm / g.fga) * 100) : g.fgPct ?? 0),
        teamSliceValue: (gs) => {
          const m = sumT(gs, (g) => g.fgm);
          const a = sumT(gs, (g) => g.fga);
          return a > 0 ? round1((m / a) * 100) : 0;
        },
      };
    case 'basic_fgm':
      return { teamGameValue: (g) => g.fgm, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.fgm)) };
    case 'basic_fga':
      return { teamGameValue: (g) => g.fga, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.fga)) };
    case 'basic_fg2m':
      return { teamGameValue: (g) => Math.max(0, g.fgm - g.fg3m), teamSliceValue: (gs) => round1(avgT(gs, (g) => Math.max(0, g.fgm - g.fg3m))) };
    case 'basic_fg2a':
      return { teamGameValue: (g) => Math.max(0, g.fga - g.fg3a), teamSliceValue: (gs) => round1(avgT(gs, (g) => Math.max(0, g.fga - g.fg3a))) };
    case 'basic_fg2Pct':
      return {
        teamGameValue: (g) => {
          const a2 = Math.max(0, g.fga - g.fg3a);
          return a2 > 0 ? round1((Math.max(0, g.fgm - g.fg3m) / a2) * 100) : 0;
        },
        teamSliceValue: (gs) => {
          const m2 = sumT(gs, (g) => Math.max(0, g.fgm - g.fg3m));
          const a2 = sumT(gs, (g) => Math.max(0, g.fga - g.fg3a));
          return a2 > 0 ? round1((m2 / a2) * 100) : 0;
        },
      };
    case 'basic_fg3m':
      return { teamGameValue: (g) => g.fg3m, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.fg3m)) };
    case 'basic_fg3a':
      return { teamGameValue: (g) => g.fg3a, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.fg3a)) };
    case 'basic_fg3Pct':
      return {
        teamGameValue: (g) => (g.fg3a > 0 ? round1((g.fg3m / g.fg3a) * 100) : g.fg3Pct ?? 0),
        teamSliceValue: (gs) => {
          const m = sumT(gs, (g) => g.fg3m);
          const a = sumT(gs, (g) => g.fg3a);
          return a > 0 ? round1((m / a) * 100) : 0;
        },
      };
    case 'basic_ftm':
      return { teamGameValue: (g) => g.ftm, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.ftm)) };
    case 'basic_fta':
      return { teamGameValue: (g) => g.fta, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.fta)) };
    case 'basic_ftPct':
      return {
        teamGameValue: (g) => (g.fta > 0 ? round1((g.ftm / g.fta) * 100) : g.ftPct ?? 0),
        teamSliceValue: (gs) => {
          const m = sumT(gs, (g) => g.ftm);
          const a = sumT(gs, (g) => g.fta);
          return a > 0 ? round1((m / a) * 100) : 0;
        },
      };
    case 'adv_offRtg':
      return { teamGameValue: (g) => g.offRtg, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.offRtg)) };
    case 'adv_defRtg':
      return { teamGameValue: (g) => g.defRtg, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.defRtg)) };
    case 'adv_netRtg':
      return { teamGameValue: (g) => g.netRtg, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.netRtg)) };
    case 'adv_pace':
      return { teamGameValue: (g) => g.pace, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.pace)) };
    case 'adv_efgPct':
      return { teamGameValue: (g) => g.efgPct, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.efgPct)) };
    case 'adv_tsPct':
      return { teamGameValue: (g) => g.tsPct, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.tsPct)) };
    case 'adv_orebPct':
      return { teamGameValue: (g) => g.orebPct, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.orebPct)) };
    case 'adv_tovPct':
      return { teamGameValue: (g) => g.tovPct, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.tovPct)) };
    case 'adv_astTo':
      return {
        teamGameValue: (g) => Math.round((g.tov > 0 ? g.ast / g.tov : g.ast) * 100) / 100,
        teamSliceValue: (gs) => {
          const a = sumT(gs, (g) => g.ast);
          const t = sumT(gs, (g) => g.tov);
          return Math.round((t > 0 ? a / t : a) * 100) / 100;
        },
      };
    case 'adv_ftaRate':
      return {
        teamGameValue: (g) => (g.fga > 0 ? round1((g.fta / g.fga) * 100) : 0),
        teamSliceValue: (gs) => {
          const ft = sumT(gs, (g) => g.fta);
          const a = sumT(gs, (g) => g.fga);
          return a > 0 ? round1((ft / a) * 100) : 0;
        },
      };
    case 'adv_ptsPerShot':
      return {
        teamGameValue: (g) => (g.fga > 0 ? Math.round((g.pointsFor / g.fga) * 100) / 100 : 0),
        teamSliceValue: (gs) => {
          const p = sumT(gs, (g) => g.pointsFor);
          const a = sumT(gs, (g) => g.fga);
          return a > 0 ? Math.round((p / a) * 100) / 100 : 0;
        },
      };
    case 'sc_pctFga2pt':
      return {
        teamGameValue: (g) => (g.fga > 0 ? round1(((g.fga - g.fg3a) / g.fga) * 100) : 0),
        teamSliceValue: (gs) => {
          const a = sumT(gs, (g) => g.fga);
          return a > 0 ? round1((sumT(gs, (g) => Math.max(0, g.fga - g.fg3a)) / a) * 100) : 0;
        },
      };
    case 'sc_pctFga3pt':
      return {
        teamGameValue: (g) => (g.fga > 0 ? round1((g.fg3a / g.fga) * 100) : 0),
        teamSliceValue: (gs) => {
          const a = sumT(gs, (g) => g.fga);
          return a > 0 ? round1((sumT(gs, (g) => g.fg3a) / a) * 100) : 0;
        },
      };
    case 'sc_pctPts2pt':
      return {
        teamGameValue: (g) => (g.pointsFor > 0 ? round1(((Math.max(0, g.fgm - g.fg3m) * 2) / g.pointsFor) * 100) : 0),
        teamSliceValue: (gs) => {
          const p = sumT(gs, (g) => g.pointsFor);
          return p > 0 ? round1((sumT(gs, (g) => Math.max(0, g.fgm - g.fg3m) * 2) / p) * 100) : 0;
        },
      };
    case 'sc_pctPts3pt':
      return {
        teamGameValue: (g) => (g.pointsFor > 0 ? round1(((g.fg3m * 3) / g.pointsFor) * 100) : 0),
        teamSliceValue: (gs) => {
          const p = sumT(gs, (g) => g.pointsFor);
          return p > 0 ? round1((sumT(gs, (g) => g.fg3m * 3) / p) * 100) : 0;
        },
      };
    case 'sc_pctPtsFt':
      return {
        teamGameValue: (g) => (g.pointsFor > 0 ? round1((g.ftm / g.pointsFor) * 100) : 0),
        teamSliceValue: (gs) => {
          const p = sumT(gs, (g) => g.pointsFor);
          return p > 0 ? round1((sumT(gs, (g) => g.ftm) / p) * 100) : 0;
        },
      };
    case 'vl_tov':
      return { teamGameValue: (g) => g.tov, teamSliceValue: (gs) => round1(avgT(gs, (g) => g.tov)) };
    default:
      return null;
  }
}
