import type {
  AutoStreakRuleCategory,
  AutoStreakRuleConfig,
  AutoStreakRuleOperator,
  AutoStreaksConfig,
  AutoStreaksConfigValues,
  TeamGameLog,
} from '../types/nba';

export interface TeamStreakMetricDefinition {
  id: string;
  shortLabel: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultThreshold: number;
  defaultOperator: AutoStreakRuleOperator;
  isBinary?: boolean;
  isPercentage?: boolean;
  getValue: (g: TeamGameLog) => number;
  sliceAvg?: (arr: TeamGameLog[]) => number | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const TEAM_STREAK_METRIC_OPTIONS: TeamStreakMetricDefinition[] = [
  {
    id: 'team_win',
    shortLabel: 'Victorias',
    label: 'Victorias consecutivas (W)',
    unit: '',
    min: 1,
    max: 1,
    step: 1,
    defaultThreshold: 1,
    defaultOperator: 'gte',
    isBinary: true,
    getValue: (g) => (g.result === 'W' ? 1 : 0),
    sliceAvg: (arr) =>
      arr.length > 0
        ? round1(arr.reduce((s, g) => s + (Number(g.netRtg) || 0), 0) / arr.length)
        : null,
  },
  {
    id: 'team_loss',
    shortLabel: 'Derrotas',
    label: 'Derrotas consecutivas (L)',
    unit: '',
    min: 1,
    max: 1,
    step: 1,
    defaultThreshold: 1,
    defaultOperator: 'gte',
    isBinary: true,
    getValue: (g) => (g.result === 'L' ? 1 : 0),
    sliceAvg: (arr) =>
      arr.length > 0
        ? round1(arr.reduce((s, g) => s + (Number(g.netRtg) || 0), 0) / arr.length)
        : null,
  },
  {
    id: 'team_pts_for',
    shortLabel: 'PTS Fav',
    label: 'Puntos anotados por partido',
    unit: ' PTS',
    min: 80,
    max: 150,
    step: 1,
    defaultThreshold: 110,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.pointsFor) || 0,
  },
  {
    id: 'team_pts_against',
    shortLabel: 'PTS Enc',
    label: 'Puntos encajados por partido',
    unit: ' PTS',
    min: 80,
    max: 145,
    step: 1,
    defaultThreshold: 110,
    defaultOperator: 'lte',
    getValue: (g) => Number(g.pointsAgainst) || 0,
  },
  {
    id: 'team_diff',
    shortLabel: 'Margen',
    label: 'Diferencia de puntos (+/-)',
    unit: ' PTS',
    min: -35,
    max: 35,
    step: 1,
    defaultThreshold: 5,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.differential) || 0,
  },
  {
    id: 'team_off_rtg',
    shortLabel: 'OffRtg',
    label: 'Rating Ofensivo (OffRtg)',
    unit: '',
    min: 90,
    max: 140,
    step: 1,
    defaultThreshold: 112,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.offRtg) || 0,
  },
  {
    id: 'team_def_rtg',
    shortLabel: 'DefRtg',
    label: 'Rating Defensivo (DefRtg)',
    unit: '',
    min: 90,
    max: 140,
    step: 1,
    defaultThreshold: 112,
    defaultOperator: 'lte',
    getValue: (g) => Number(g.defRtg) || 0,
  },
  {
    id: 'team_net_rtg',
    shortLabel: 'NetRtg',
    label: 'Net Rating colectivo',
    unit: '',
    min: -30,
    max: 30,
    step: 1,
    defaultThreshold: 5,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.netRtg) || 0,
  },
  {
    id: 'team_pace',
    shortLabel: 'Ritmo',
    label: 'Ritmo de juego (Pace)',
    unit: ' pos',
    min: 90,
    max: 112,
    step: 0.5,
    defaultThreshold: 99,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.pace) || 0,
  },
  {
    id: 'team_fg3m',
    shortLabel: '3PM Eq.',
    label: 'Triples anotados de equipo',
    unit: ' 3PM',
    min: 4,
    max: 25,
    step: 1,
    defaultThreshold: 12,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.fg3m) || 0,
  },
  {
    id: 'team_fgPct',
    shortLabel: 'TC% Eq.',
    label: '% Tiros de campo de equipo',
    unit: '%',
    min: 35,
    max: 62,
    step: 1,
    defaultThreshold: 47,
    defaultOperator: 'gte',
    isPercentage: true,
    getValue: (g) =>
      g.fgPct ?? (g.fga > 0 ? round1((g.fgm / g.fga) * 100) : 0),
    sliceAvg: (arr) => {
      const fga = arr.reduce((s, g) => s + (Number(g.fga) || 0), 0);
      const fgm = arr.reduce((s, g) => s + (Number(g.fgm) || 0), 0);
      return fga > 0 ? round1((fgm / fga) * 100) : null;
    },
  },
  {
    id: 'team_fg3Pct',
    shortLabel: '3P% Eq.',
    label: '% Triples de equipo',
    unit: '%',
    min: 20,
    max: 55,
    step: 1,
    defaultThreshold: 36,
    defaultOperator: 'gte',
    isPercentage: true,
    getValue: (g) =>
      g.fg3Pct ?? (g.fg3a > 0 ? round1((g.fg3m / g.fg3a) * 100) : 0),
    sliceAvg: (arr) => {
      const fg3a = arr.reduce((s, g) => s + (Number(g.fg3a) || 0), 0);
      const fg3m = arr.reduce((s, g) => s + (Number(g.fg3m) || 0), 0);
      return fg3a > 0 ? round1((fg3m / fg3a) * 100) : null;
    },
  },
  {
    id: 'team_ast',
    shortLabel: 'AST Eq.',
    label: 'Asistencias de equipo',
    unit: ' AST',
    min: 15,
    max: 40,
    step: 1,
    defaultThreshold: 25,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.ast) || 0,
  },
  {
    id: 'team_reb',
    shortLabel: 'REB Eq.',
    label: 'Rebotes de equipo',
    unit: ' REB',
    min: 30,
    max: 62,
    step: 1,
    defaultThreshold: 44,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.reb) || 0,
  },
  {
    id: 'team_oreb',
    shortLabel: 'OREB Eq.',
    label: 'Rebotes ofensivos de equipo',
    unit: ' OREB',
    min: 4,
    max: 24,
    step: 1,
    defaultThreshold: 11,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.oreb) || 0,
  },
  {
    id: 'team_stl',
    shortLabel: 'ROB Eq.',
    label: 'Robos de equipo',
    unit: ' ROB',
    min: 3,
    max: 18,
    step: 1,
    defaultThreshold: 8,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.stl) || 0,
  },
  {
    id: 'team_blk',
    shortLabel: 'TAP Eq.',
    label: 'Tapones de equipo',
    unit: ' TAP',
    min: 2,
    max: 15,
    step: 1,
    defaultThreshold: 5,
    defaultOperator: 'gte',
    getValue: (g) => Number(g.blk) || 0,
  },
  {
    id: 'team_tov',
    shortLabel: 'PÉR Eq.',
    label: 'Pérdidas de equipo',
    unit: ' PÉR',
    min: 5,
    max: 26,
    step: 1,
    defaultThreshold: 12,
    defaultOperator: 'lte',
    getValue: (g) => Number(g.tov) || 0,
  },
];

export const TEAM_STREAK_METRIC_MAP = new Map(
  TEAM_STREAK_METRIC_OPTIONS.map((m) => [m.id, m])
);

export const AUTO_STREAK_CATEGORIES: Array<{
  id: AutoStreakRuleCategory;
  label: string;
}> = [
  { id: 'milestones', label: 'Hitos (DD2 / TD3)' },
  { id: 'scoring', label: 'Anotación y Volumen' },
  { id: 'rebounding', label: 'Rebote (REB/DR/OR)' },
  { id: 'playmaking', label: 'Asistencias' },
  { id: 'defense', label: 'Defensa (ROB/TAP/STK)' },
  { id: 'shooting', label: 'Triples y Tiro' },
  { id: 'combos', label: 'Combos (PRA / P+R / P+A / R+A)' },
  { id: 'efficiency', label: 'Eficiencia, Ratios y /36m' },
  { id: 'slumps', label: 'Baches y Alertas Negativas' },
  { id: 'team', label: 'Equipos' },
];

function pRule(
  id: string,
  metricId: string,
  category: AutoStreakRuleCategory,
  metricLabel: string,
  label: string,
  operator: AutoStreakRuleOperator,
  threshold: number,
  unit: string,
  opts?: {
    groupSingle?: string | null;
    minMinutes?: number | null;
    minAttempts?: number | null;
    breakoutAxis?: 'exterior' | 'minutes_usage' | 'efficiency' | null;
    isPositive?: boolean;
  }
): AutoStreakRuleConfig {
  return {
    id,
    entityType: 'player',
    metricId,
    category,
    metricLabel,
    label,
    operator,
    threshold,
    minGamesOverride: null,
    minMinutes: opts?.minMinutes ?? null,
    minAttempts: opts?.minAttempts ?? null,
    groupSingle: opts?.groupSingle ?? null,
    breakoutAxis: opts?.breakoutAxis ?? null,
    unit,
    isPositive: opts?.isPositive ?? true,
    enabled: true,
  };
}

function tRule(
  id: string,
  metricId: string,
  metricLabel: string,
  label: string,
  operator: AutoStreakRuleOperator,
  threshold: number,
  unit: string,
  opts?: {
    groupSingle?: string | null;
    breakoutAxis?: 'exterior' | 'minutes_usage' | 'efficiency' | null;
    isPositive?: boolean;
  }
): AutoStreakRuleConfig {
  return {
    id,
    entityType: 'team',
    metricId,
    category: 'team',
    metricLabel,
    label,
    operator,
    threshold,
    minGamesOverride: null,
    minMinutes: null,
    minAttempts: null,
    groupSingle: opts?.groupSingle ?? null,
    breakoutAxis: opts?.breakoutAxis ?? null,
    unit,
    isPositive: opts?.isPositive ?? true,
    enabled: true,
  };
}

/**
 * Cobertura integral dinámica por defecto: 1 único mínimo base por estadística
 * (separando dirección positiva y bache negativo cuando aplica).
 * Cubre las 49 métricas de jugador y las 18 métricas de equipo del catálogo.
 * El motor O(N) calcula automáticamente el valor exacto real mantenido (ej. 11+ REB, 23+ PTS).
 */
export const DEFAULT_AUTO_STREAK_RULES: AutoStreakRuleConfig[] = [
  // ── 1. Hitos Clásicos (Binarios) ──
  pRule('dd2', 'doubleDouble', 'milestones', 'Doble-Doble', 'Doble-Doble (DD2) consecutivo', 'gte', 1, ' DD2', { groupSingle: 'dd2' }),
  pRule('td3', 'tripleDouble', 'milestones', 'Triple-Doble', 'Triple-Doble (TD3) consecutivo', 'gte', 1, ' TD3', { groupSingle: 'td3' }),

  // ── 2. Anotación & Volumen de Tiro (1 mínimo base dinámico por métrica) ──
  pRule('pts_dyn', 'points', 'scoring', 'Puntos', 'Puntos · desde 15+ PTS', 'gte', 15, ' PTS', { groupSingle: 'pts' }),
  pRule('fgm_dyn', 'fgm', 'scoring', 'TCM (Tiros Anotados)', 'TCM · desde 8+ TCM', 'gte', 8, ' TCM', { groupSingle: 'fgm' }),
  pRule('fga_dyn', 'fga', 'scoring', 'TCI (Tiros Intentados)', 'TCI · desde 16+ TCI', 'gte', 16, ' TCI', { groupSingle: 'fga' }),
  pRule('fg2m_dyn', 'fg2m', 'scoring', 'T2M (Canastas de 2)', 'Tiros de 2 · desde 6+ T2M', 'gte', 6, ' T2M', { groupSingle: 'fg2m' }),
  pRule('fg2a_dyn', 'fg2a', 'scoring', 'T2I (Intentos de 2)', 'Intentos de 2 · desde 10+ T2I', 'gte', 10, ' T2I', { groupSingle: 'fg2a' }),
  pRule('tsa_dyn', 'tsa', 'scoring', 'TSA (Vol. Tiros)', 'Volumen TSA · desde 18+ TSA', 'gte', 18, ' TSA', { groupSingle: 'tsa' }),

  // ── 3. Rebote Total, Defensivo y Ofensivo ──
  pRule('reb_dyn', 'rebounds', 'rebounding', 'Rebotes', 'Rebotes · desde 8+ REB', 'gte', 8, ' REB', { groupSingle: 'reb' }),
  pRule('dreb_dyn', 'dreb', 'rebounding', 'Reb. Defensivos', 'Reb. Defensivos · desde 6+ DR', 'gte', 6, ' DR', { groupSingle: 'dreb' }),
  pRule('oreb_dyn', 'oreb', 'rebounding', 'Reb. Ofensivos', 'Reb. Ofensivos · desde 2+ OR', 'gte', 2, ' OR', { groupSingle: 'oreb' }),

  // ── 4. Asistencias ──
  pRule('ast_dyn', 'assists', 'playmaking', 'Asistencias', 'Asistencias · desde 6+ AST', 'gte', 6, ' AST', { groupSingle: 'ast' }),

  // ── 5. Defensa ──
  pRule('stl_dyn', 'steals', 'defense', 'Robos', 'Robos · desde 1+ ROB', 'gte', 1, ' ROB', { groupSingle: 'stl' }),
  pRule('blk_dyn', 'blocks', 'defense', 'Tapones', 'Tapones · desde 1+ TAP', 'gte', 1, ' TAP', { groupSingle: 'blk' }),
  pRule('stocks_dyn', 'stocks', 'defense', 'Stocks (ROB+TAP)', 'Stocks · desde 2+ STK', 'gte', 2, ' STK', { groupSingle: 'stocks' }),

  // ── 6. Triples, Libres y Porcentajes de Tiro ──
  pRule('3pm_dyn', 'fg3m', 'shooting', 'Triples (3PM)', 'Triples · desde 2+ 3PM', 'gte', 2, ' 3PM', { groupSingle: '3pm', breakoutAxis: 'exterior' }),
  pRule('fg3a_dyn', 'fg3a', 'shooting', 'Intentos 3P (3PA)', 'Intentos 3P · desde 7+ 3PA', 'gte', 7, ' 3PA', { groupSingle: '3pa', breakoutAxis: 'exterior' }),
  pRule('ftm_dyn', 'ftm', 'shooting', 'Tiros Libres (TLM)', 'Tiros Libres · desde 6+ TLM', 'gte', 6, ' TLM', { groupSingle: 'ftm' }),
  pRule('fta_dyn', 'fta', 'shooting', 'Libres Intentados (TLI)', 'Libres Intentados · desde 7+ TLI', 'gte', 7, ' TLI', { groupSingle: 'fta' }),
  pRule('hot_3pct', 'fg3Pct', 'shooting', 'Acierto 3P%', 'Acierto 3P% · desde ≥42% (≥5 3PA)', 'gte', 42, '%', { minAttempts: 5, breakoutAxis: 'exterior', groupSingle: 'fg3_pos' }),
  pRule('fgpct_dyn', 'fgPct', 'shooting', 'Tiro de Campo (TC%)', 'Acierto TC% · desde ≥50% (≥5 TCI)', 'gte', 50, '%', { minAttempts: 5, breakoutAxis: 'efficiency', groupSingle: 'fg_pos' }),
  pRule('fg2pct_dyn', 'fg2Pct', 'shooting', 'Tiro de 2 (T2%)', 'Acierto T2% · desde ≥58% (≥4 T2I)', 'gte', 58, '%', { minAttempts: 4, breakoutAxis: 'efficiency', groupSingle: 'fg2_pos' }),
  pRule('ftpct_dyn', 'ftPct', 'shooting', 'Tiros Libres (TL%)', 'Acierto TL% · desde ≥80% (≥2 TLI)', 'gte', 80, '%', { minAttempts: 2, breakoutAxis: 'efficiency', groupSingle: 'ft_pos' }),
  pRule('efgpct_dyn', 'efgPct', 'shooting', 'Tiro Efectivo (eFG%)', 'Tiro Efectivo · desde ≥58% eFG (≥5 TCI)', 'gte', 58, '%', { minAttempts: 5, breakoutAxis: 'efficiency', groupSingle: 'efg_pos' }),
  pRule('three_rate_dyn', 'threeRate', 'shooting', 'Volumen Triple (3PAr)', 'Volumen Triple · desde ≥50% 3PAr (≥5 TCI)', 'gte', 50, '%', { minAttempts: 5, breakoutAxis: 'exterior' }),
  pRule('ft_rate_dyn', 'ftRate', 'shooting', 'Ratio Libres (FTr)', 'Ratio Libres · desde ≥35% FTr (≥5 TCI)', 'gte', 35, '%', { minAttempts: 5 }),

  // ── 7. Combinadas ──
  pRule('pra_dyn', 'pra', 'combos', 'PTS+REB+AST', 'PRA · desde 30+ PRA', 'gte', 30, ' PRA', { groupSingle: 'pra' }),
  pRule('pts_reb_dyn', 'ptsReb', 'combos', 'PTS+REB', 'PTS+REB · desde 25+ P+R', 'gte', 25, ' P+R', { groupSingle: 'pts_reb' }),
  pRule('pts_ast_dyn', 'ptsAst', 'combos', 'PTS+AST', 'PTS+AST · desde 20+ P+A', 'gte', 20, ' P+A', { groupSingle: 'pts_ast' }),
  pRule('reb_ast_dyn', 'rebAst', 'combos', 'REB+AST', 'REB+AST · desde 12+ R+A', 'gte', 12, ' R+A', { groupSingle: 'reb_ast' }),

  // ── 8. Eficiencia, Ratios, Seguridad, Rol y Por 36 Minutos ──
  pRule('hot_ts', 'tsPct', 'efficiency', 'Acierto Real (TS%)', 'True Shooting · desde ≥64% TS (≥10 TCI)', 'gte', 64, '%', { minAttempts: 10, breakoutAxis: 'efficiency' }),
  pRule('pts_per_shot_dyn', 'ptsPerShot', 'efficiency', 'PTS/TCI', 'Rentabilidad tiro · desde ≥1.35 PTS/TCI (≥5 TCI)', 'gte', 1.35, ' PTS/TCI', { minAttempts: 5, breakoutAxis: 'efficiency' }),
  pRule('gmsc_dyn', 'gameScore', 'efficiency', 'Game Score', 'Game Score · desde 22+ GmSc', 'gte', 22, ' GmSc', { breakoutAxis: 'efficiency' }),
  pRule('min_dyn', 'minutes', 'efficiency', 'Minutos', 'Minutos · desde 35+ MIN', 'gte', 35, ' MIN', { breakoutAxis: 'minutes_usage' }),
  pRule('usg_dyn', 'usgEst', 'efficiency', 'Uso Ofensivo (USG%)', 'Uso Ofensivo · desde ≥28% USG (≥20 MIN)', 'gte', 28, '%', { minMinutes: 20, breakoutAxis: 'minutes_usage' }),
  pRule('pos_pm_dyn', 'plusMinus', 'efficiency', 'Plus/Minus (+/-)', 'Plus/Minus positivo · desde +5 (+/-) (≥20 MIN)', 'gte', 5, ' +/-', { minMinutes: 20, breakoutAxis: 'efficiency', groupSingle: 'pos_pm' }),
  pRule('ast_to_dyn', 'astTo', 'efficiency', 'AST/PER', 'Ratio AST/PER · desde ≥3x (≥15 MIN)', 'gte', 3, 'x', { minMinutes: 15, breakoutAxis: 'efficiency' }),
  pRule('tov_pct_low', 'tovPctEst', 'efficiency', 'TOV%', 'Seguridad balón · desde ≤10% TOV%', 'lte', 10, '%', { breakoutAxis: 'efficiency' }),
  pRule('ast_ratio_dyn', 'astRatioEst', 'efficiency', 'AST Ratio', 'AST Ratio · desde ≥25% (≥12 MIN)', 'gte', 25, '%', { minMinutes: 12 }),
  pRule('tov_low_dyn', 'turnovers', 'efficiency', 'Pérdidas (Control)', 'Manos seguras · desde ≤1 PER (≥20 MIN)', 'lte', 1, ' PER', { minMinutes: 20, groupSingle: 'to_pos' }),
  pRule('fouls_low_dyn', 'fouls', 'efficiency', 'Faltas (Disciplina)', 'Disciplina · desde ≤1 FP (≥20 MIN)', 'lte', 1, ' FP', { minMinutes: 20, groupSingle: 'fouls_pos' }),
  pRule('pts_per_min_dyn', 'ptsPerMin', 'efficiency', 'PTS/MIN', 'PTS/MIN · desde ≥0.75 (≥12 MIN)', 'gte', 0.75, ' PTS/m', { minMinutes: 12 }),
  pRule('pts_per36_dyn', 'ptsPer36', 'efficiency', 'PTS/36', 'PTS/36m · desde ≥26 (≥12 MIN)', 'gte', 26, ' PTS/36', { minMinutes: 12 }),
  pRule('reb_per36_dyn', 'rebPer36', 'efficiency', 'REB/36', 'REB/36m · desde ≥11 (≥12 MIN)', 'gte', 11, ' REB/36', { minMinutes: 12 }),
  pRule('dreb_per36_dyn', 'drebPer36', 'efficiency', 'DR/36', 'DR/36m · desde ≥8.5 (≥12 MIN)', 'gte', 8.5, ' DR/36', { minMinutes: 12 }),
  pRule('oreb_per36_dyn', 'orebPer36', 'efficiency', 'OR/36', 'OR/36m · desde ≥3.5 (≥12 MIN)', 'gte', 3.5, ' OR/36', { minMinutes: 12 }),
  pRule('ast_per36_dyn', 'astPer36', 'efficiency', 'AST/36', 'AST/36m · desde ≥8 (≥12 MIN)', 'gte', 8, ' AST/36', { minMinutes: 12 }),
  pRule('stk_per36_dyn', 'stocksPer36', 'efficiency', 'STK/36', 'STK/36m · desde ≥2.5 (≥12 MIN)', 'gte', 2.5, ' STK/36', { minMinutes: 12 }),
  pRule('pra_per36_dyn', 'praPer36', 'efficiency', 'PRA/36', 'PRA/36m · desde ≥38 (≥12 MIN)', 'gte', 38, ' PRA/36', { minMinutes: 12 }),

  // ── 9. Baches y Alertas Negativas (Jugadores — 1 techo/suelo base por métrica) ──
  pRule('slump_pts_dyn', 'points', 'slumps', 'Sequía Anotadora', 'Bache anotador · desde ≤10 PTS (≥24 MIN)', 'lte', 10, ' PTS', { minMinutes: 24, groupSingle: 'slump_pts', isPositive: false }),
  pRule('cold_3pm_zero', 'fg3m', 'slumps', 'Sequía Triple', 'Sequía triple · 0 3PM (≥3 3PA)', 'lte', 0, ' 3PM', { minAttempts: 3, breakoutAxis: 'exterior', isPositive: false }),
  pRule('cold_3pct', 'fg3Pct', 'slumps', 'Bache 3P%', 'Bache exterior · desde <25% 3P (≥4 3PA)', 'lt', 25, '%', { minAttempts: 4, breakoutAxis: 'exterior', isPositive: false }),
  pRule('cold_ts', 'tsPct', 'slumps', 'Acierto Real (TS%)', 'Bache eficiencia · desde <46% TS (≥10 TCI)', 'lt', 46, '%', { minAttempts: 10, breakoutAxis: 'efficiency', isPositive: false }),
  pRule('cold_fg', 'fgPct', 'slumps', 'Tiro de Campo (TC%)', 'Desacierto tiro · desde <38% TC (≥8 TCI)', 'lt', 38, '%', { minAttempts: 8, breakoutAxis: 'efficiency', isPositive: false }),
  pRule('cold_ft', 'ftPct', 'slumps', 'Tiros Libres (TL%)', 'Bache libres · desde <50% TL (≥4 TLI)', 'lt', 50, '%', { minAttempts: 4, breakoutAxis: 'efficiency', isPositive: false }),
  pRule('to_slump_dyn', 'turnovers', 'slumps', 'Pérdidas', 'Riesgo balón · desde 3+ PER', 'gte', 3, ' PER', { groupSingle: 'to', isPositive: false }),
  pRule('foul_trouble_dyn', 'fouls', 'slumps', 'Faltas', 'Problemas faltas · desde 4+ FP (≥16 MIN)', 'gte', 4, ' FP', { minMinutes: 16, groupSingle: 'fouls', breakoutAxis: 'minutes_usage', isPositive: false }),
  pRule('neg_pm_dyn', 'plusMinus', 'slumps', 'Plus/Minus', 'Impacto negativo · desde ≤-10 (+/-) (≥20 MIN)', 'lte', -10, ' +/-', { minMinutes: 20, groupSingle: 'neg_pm', breakoutAxis: 'efficiency', isPositive: false }),

  // ── 10. Equipos: 1 mínimo base dinámico por cada una de las 18 métricas ──
  tRule('t_wins', 'team_win', 'Net Rating', 'Victorias consecutivas', 'gte', 1, '', { isPositive: true }),
  tRule('t_losses', 'team_loss', 'Net Rating', 'Derrotas consecutivas', 'gte', 1, '', { isPositive: false }),
  tRule('t_pts_dyn', 'team_pts_for', 'Puntos de Equipo', 'Puntos anotados · desde 110+ PTS', 'gte', 110, ' PTS', { groupSingle: 't_pts' }),
  tRule('t_def_dyn', 'team_pts_against', 'Defensa de Equipo', 'Defensa sólida · desde ≤110 PTS recibidos', 'lte', 110, ' PTS', { groupSingle: 't_def' }),
  tRule('t_diff_dyn', 'team_diff', 'Margen de Equipo', 'Margen ganador · desde +5 PTS', 'gte', 5, ' PTS', { groupSingle: 't_diff' }),
  tRule('t_off_rtg_dyn', 'team_off_rtg', 'Rating Ofensivo', 'OffRtg · desde 112+', 'gte', 112, ' OffRtg', { groupSingle: 't_offrtg', breakoutAxis: 'efficiency' }),
  tRule('t_def_rtg_dyn', 'team_def_rtg', 'Rating Defensivo', 'DefRtg · desde ≤112', 'lte', 112, ' DefRtg', { groupSingle: 't_defrtg', breakoutAxis: 'efficiency' }),
  tRule('t_net_rtg_dyn', 'team_net_rtg', 'Net Rating', 'Net Rating · desde +5.0', 'gte', 5, ' NetRtg', { groupSingle: 't_netrtg', breakoutAxis: 'minutes_usage' }),
  tRule('t_pace_dyn', 'team_pace', 'Ritmo de Juego', 'Ritmo alto · desde ≥99 pos', 'gte', 99, ' pos', { breakoutAxis: 'minutes_usage' }),
  tRule('t3_dyn', 'team_fg3m', 'Triples de Equipo', 'Triples equipo · desde 12+ 3PM', 'gte', 12, ' 3PM', { groupSingle: 't_3pm', breakoutAxis: 'exterior' }),
  tRule('t_fgpct_dyn', 'team_fgPct', 'Acierto Colectivo', 'TC% equipo · desde ≥47%', 'gte', 47, '%', { groupSingle: 't_fgpct', breakoutAxis: 'efficiency' }),
  tRule('t_fg3pct_dyn', 'team_fg3Pct', 'Acierto Triples Eq.', '3P% equipo · desde ≥36%', 'gte', 36, '%', { groupSingle: 't_3pct', breakoutAxis: 'exterior' }),
  tRule('t_ast_dyn', 'team_ast', 'Asistencias de Equipo', 'Asistencias equipo · desde 25+ AST', 'gte', 25, ' AST', { groupSingle: 't_ast' }),
  tRule('t_reb_dyn', 'team_reb', 'Rebotes de Equipo', 'Rebotes equipo · desde 44+ REB', 'gte', 44, ' REB', { groupSingle: 't_reb' }),
  tRule('t_oreb_dyn', 'team_oreb', 'Reb. Ofensivos Eq.', 'Reb. ofensivos eq. · desde 11+ OREB', 'gte', 11, ' OREB', { groupSingle: 't_oreb' }),
  tRule('t_stl_dyn', 'team_stl', 'Robos de Equipo', 'Robos equipo · desde 8+ ROB', 'gte', 8, ' ROB', { groupSingle: 't_stl' }),
  tRule('t_blk_dyn', 'team_blk', 'Tapones de Equipo', 'Tapones equipo · desde 5+ TAP', 'gte', 5, ' TAP', { groupSingle: 't_blk' }),
  tRule('t_tov_low_dyn', 'team_tov', 'Cuidado del Balón', 'Cuidado balón eq. · desde ≤12 PER', 'lte', 12, ' PER', { groupSingle: 't_tov_low' }),

  // Negativas de Equipo
  tRule('t_pts_cold_dyn', 'team_pts_for', 'Ataque Seco', 'Ataque espeso · desde ≤105 PTS', 'lte', 105, ' PTS', { groupSingle: 't_cold_pts', isPositive: false }),
  tRule('t_def_bad_dyn', 'team_pts_against', 'Defensa Frágil', 'Defensa frágil · desde 115+ PTS recibidos', 'gte', 115, ' PTS', { groupSingle: 't_bad_def', isPositive: false }),
  tRule('t_net_neg_dyn', 'team_net_rtg', 'Net Rating Negativo', 'NetRtg negativo · desde ≤-5.0', 'lte', -5, ' NetRtg', { groupSingle: 't_netrtg_neg', breakoutAxis: 'minutes_usage', isPositive: false }),
  tRule('t_tov_high_dyn', 'team_tov', 'Pérdidas de Equipo', 'Descontrol eq. · desde 15+ PER', 'gte', 15, ' PER', { groupSingle: 't_tov_high', isPositive: false }),
  tRule('t_cold_fg_dyn', 'team_fgPct', 'Acierto en Tiro Eq.', 'Mal tiro eq. · desde <44% TC', 'lt', 44, '%', { groupSingle: 't_cold_fg', breakoutAxis: 'efficiency', isPositive: false }),
  tRule('t_cold_3p_dyn', 'team_fg3Pct', 'Acierto Triples Eq.', 'Sequía exterior eq. · desde <32% 3P', 'lt', 32, '%', { groupSingle: 't_cold_3p', breakoutAxis: 'exterior', isPositive: false }),
  tRule('t_low_ast_dyn', 'team_ast', 'Circulación Balón', 'Juego trabado · desde ≤22 AST', 'lte', 22, ' AST', { groupSingle: 't_low_ast', isPositive: false }),
];

export const DEFAULT_AUTO_STREAKS_CONFIG_VALUES: AutoStreaksConfigValues = {
  minStreakGames: 5,
  rules: DEFAULT_AUTO_STREAK_RULES.map((r) => ({ ...r })),
};

export const DEFAULT_AUTO_STREAKS_CONFIG: AutoStreaksConfig = {
  minStreakGames: 5,
  rules: DEFAULT_AUTO_STREAK_RULES.map((r) => ({ ...r })),
  updatedAt: 0,
};

export function formatRuleOperatorSymbol(op: AutoStreakRuleOperator): string {
  switch (op) {
    case 'gte':
      return '≥';
    case 'gt':
      return '>';
    case 'lte':
      return '≤';
    case 'lt':
      return '<';
    default:
      return '≥';
  }
}

export function compareRuleThreshold(
  value: number,
  operator: AutoStreakRuleOperator,
  threshold: number
): boolean {
  switch (operator) {
    case 'gte':
      return value >= threshold;
    case 'gt':
      return value > threshold;
    case 'lte':
      return value <= threshold;
    case 'lt':
      return value < threshold;
    default:
      return value >= threshold;
  }
}

const INTEGER_STREAK_METRICS = new Set<string>([
  'points',
  'rebounds',
  'dreb',
  'oreb',
  'assists',
  'steals',
  'blocks',
  'stocks',
  'turnovers',
  'fouls',
  'plusMinus',
  'minutes',
  'fg3m',
  'fg3a',
  'fgm',
  'fga',
  'fg2m',
  'fg2a',
  'ftm',
  'fta',
  'pra',
  'ptsReb',
  'ptsAst',
  'rebAst',
  'doubleDouble',
  'tripleDouble',
  'team_win',
  'team_loss',
  'team_pts_for',
  'team_pts_against',
  'team_diff',
  'team_fg3m',
  'team_ast',
  'team_reb',
  'team_oreb',
  'team_stl',
  'team_blk',
  'team_tov',
]);

const TWO_DECIMAL_STREAK_METRICS = new Set<string>([
  'ptsPerShot',
  'ptsPerMin',
  'astTo',
]);

const BINARY_STREAK_METRICS = new Set<string>([
  'doubleDouble',
  'tripleDouble',
  'team_win',
  'team_loss',
]);

export function isBinaryStreakMetric(metricId: string): boolean {
  return BINARY_STREAK_METRICS.has(metricId);
}

/**
 * Cuantiza de forma conservadora (hacia afuera) el extremo acumulado real
 * para garantizar matemáticamente que TODOS los partidos de la racha
 * cumplen el umbral exacto mostrado.
 */
export function quantizeDynamicThreshold(
  rawValue: number,
  metricId: string,
  operator: AutoStreakRuleOperator
): number {
  const isUpperBound = operator === 'lte' || operator === 'lt';
  const eps = 1e-9;
  if (INTEGER_STREAK_METRICS.has(metricId)) {
    return isUpperBound
      ? Math.ceil(rawValue - eps)
      : Math.floor(rawValue + eps);
  }
  const factor = TWO_DECIMAL_STREAK_METRICS.has(metricId) ? 100 : 10;
  return isUpperBound
    ? Math.ceil(rawValue * factor - eps) / factor
    : Math.floor(rawValue * factor + eps) / factor;
}

export function formatDynamicNumericValue(value: number, signed = false): string {
  const clean = Number.isInteger(value)
    ? String(value)
    : Number(value.toFixed(2)).toString();
  if (signed && value > 0) return `+${clean}`;
  return clean;
}

/**
 * Construye la etiqueta exacta y natural de una racha detectada dinámicamente
 * (p. ej. "11+ REB seguidos", "23+ PTS seguidos", "≥67.4% TS (≥10 TCI)", "≤102 PTS recibidos").
 */
export function formatDynamicStreakLabel(
  rule: AutoStreakRuleConfig,
  exactThreshold: number
): string {
  if (BINARY_STREAK_METRICS.has(rule.metricId)) {
    return rule.label;
  }

  const isUpperBound = rule.operator === 'lte' || rule.operator === 'lt';
  const isSignedMetric =
    rule.metricId === 'plusMinus' ||
    rule.metricId === 'team_diff' ||
    rule.metricId === 'team_net_rtg';
  const valStr = formatDynamicNumericValue(exactThreshold, isSignedMetric);
  const cleanUnit = (rule.unit || '').trim();

  const attLabel =
    rule.metricId === 'fg3Pct' || rule.metricId === 'fg3m'
      ? '3PA'
      : rule.metricId === 'ftPct' || rule.metricId === 'ftm'
      ? 'TLI'
      : rule.metricId === 'fg2Pct' || rule.metricId === 'fg2m'
      ? 'T2I'
      : 'TCI';

  const guards: string[] = [];
  if (rule.minMinutes && rule.minMinutes > 0) guards.push(`≥${rule.minMinutes} MIN`);
  if (rule.minAttempts && rule.minAttempts > 0) guards.push(`≥${rule.minAttempts} ${attLabel}`);
  const guardSuffix = guards.length > 0 ? ` (${guards.join(', ')})` : '';

  // Specific clean editorial phrasing for key metrics
  if (rule.metricId === 'team_pts_against') {
    const core = isUpperBound
      ? `≤${valStr} PTS recibidos seguidos`
      : `${valStr}+ PTS recibidos seguidos`;
    return `${core}${guardSuffix}`;
  }
  if (rule.metricId === 'team_pts_for') {
    const core = isUpperBound
      ? `≤${valStr} PTS anotados seguidos`
      : `${valStr}+ PTS anotados seguidos`;
    return `${core}${guardSuffix}`;
  }
  if (rule.metricId === 'plusMinus') {
    const core = isUpperBound
      ? `≤${valStr} (+/-) seguidos`
      : `${valStr} o más (+/-) seguidos`;
    return `${core}${guardSuffix}`;
  }
  if (rule.metricId === 'team_diff') {
    const core = isUpperBound
      ? `≤${valStr} Margen seguidos`
      : `${valStr} o más Margen seguidos`;
    return `${core}${guardSuffix}`;
  }
  if (rule.metricId === 'fg3m' && isUpperBound && exactThreshold === 0) {
    return `0 Triples anotados${guardSuffix}`;
  }
  if (cleanUnit === '%') {
    const sym = isUpperBound ? '≤' : '≥';
    return `${sym}${valStr}% ${rule.metricLabel}${guardSuffix}`;
  }
  if (cleanUnit === 'x') {
    const sym = isUpperBound ? '≤' : '≥';
    return `${sym}${valStr}x ${rule.metricLabel}${guardSuffix}`;
  }
  if (isUpperBound) {
    const labelUnit = cleanUnit || rule.metricLabel;
    if (exactThreshold === 0 && (rule.metricId === 'turnovers' || rule.metricId === 'fouls')) {
      return `0 ${labelUnit} seguidos${guardSuffix}`;
    }
    return `≤${valStr} ${labelUnit} seguidos${guardSuffix}`;
  }

  const labelUnit = cleanUnit || rule.metricLabel;
  return `${valStr}+ ${labelUnit} seguidos${guardSuffix}`;
}

export function buildAutoRuleLabel(
  metricShortLabel: string,
  operator: AutoStreakRuleOperator,
  threshold: number,
  unit = '',
  minMinutes?: number | null,
  minAttempts?: number | null,
  attemptsLabel = 'int.'
): string {
  const opStr =
    operator === 'gte'
      ? `${threshold}+`
      : `${formatRuleOperatorSymbol(operator)}${threshold}`;
  const cleanUnit = unit.trim();
  const base =
    cleanUnit === '%'
      ? `${metricShortLabel} · desde ${formatRuleOperatorSymbol(operator)}${threshold}%`
      : `${metricShortLabel} · desde ${opStr}${cleanUnit ? ` ${cleanUnit}` : ''}`;
  const guards: string[] = [];
  if (minMinutes && minMinutes > 0) guards.push(`≥${minMinutes} MIN`);
  if (minAttempts && minAttempts > 0) guards.push(`≥${minAttempts} ${attemptsLabel}`);
  return guards.length > 0 ? `${base} (${guards.join(', ')})` : base;
}

const VALID_CATEGORIES = new Set<AutoStreakRuleCategory>([
  'milestones',
  'scoring',
  'rebounding',
  'playmaking',
  'defense',
  'shooting',
  'combos',
  'efficiency',
  'slumps',
  'team',
]);

const VALID_OPERATORS = new Set<AutoStreakRuleOperator>(['gte', 'gt', 'lte', 'lt']);

export function normalizeAutoStreaksConfig(raw: unknown): AutoStreaksConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      minStreakGames: DEFAULT_AUTO_STREAKS_CONFIG.minStreakGames,
      rules: DEFAULT_AUTO_STREAK_RULES.map((r) => ({ ...r })),
      updatedAt: 0,
    };
  }
  const obj = raw as Record<string, unknown>;
  const rawMinGames = Number(obj.minStreakGames);
  const minStreakGames =
    Number.isInteger(rawMinGames) && rawMinGames >= 2 && rawMinGames <= 25
      ? rawMinGames
      : DEFAULT_AUTO_STREAKS_CONFIG.minStreakGames;

  const rawRules = Array.isArray(obj.rules) ? obj.rules : null;
  let rules: AutoStreakRuleConfig[] = [];
  if (rawRules && rawRules.length > 0) {
    const seen = new Set<string>();
    for (const item of rawRules) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const id = String(r.id || '').trim().slice(0, 64);
      const metricId = String(r.metricId || '').trim().slice(0, 48);
      if (!id || !metricId || seen.has(id)) continue;
      seen.add(id);

      const entityType = r.entityType === 'team' ? 'team' : 'player';
      const category = VALID_CATEGORIES.has(r.category as AutoStreakRuleCategory)
        ? (r.category as AutoStreakRuleCategory)
        : entityType === 'team'
        ? 'team'
        : 'scoring';
      const operator = VALID_OPERATORS.has(r.operator as AutoStreakRuleOperator)
        ? (r.operator as AutoStreakRuleOperator)
        : 'gte';
      const threshold = Number(r.threshold);
      if (!Number.isFinite(threshold)) continue;

      const rawOverride =
        r.minGamesOverride === null || r.minGamesOverride === undefined || r.minGamesOverride === ''
          ? null
          : Number(r.minGamesOverride);
      const minGamesOverride =
        rawOverride !== null && Number.isInteger(rawOverride) && rawOverride >= 2 && rawOverride <= 25
          ? rawOverride
          : null;

      const rawMinMin =
        r.minMinutes === null || r.minMinutes === undefined || r.minMinutes === ''
          ? null
          : Number(r.minMinutes);
      const minMinutes =
        rawMinMin !== null && Number.isFinite(rawMinMin) && rawMinMin >= 0 && rawMinMin <= 48
          ? rawMinMin
          : null;

      const rawMinAtt =
        r.minAttempts === null || r.minAttempts === undefined || r.minAttempts === ''
          ? null
          : Number(r.minAttempts);
      const minAttempts =
        rawMinAtt !== null && Number.isFinite(rawMinAtt) && rawMinAtt >= 0 && rawMinAtt <= 40
          ? rawMinAtt
          : null;

      const breakoutAxis =
        r.breakoutAxis === 'exterior' ||
        r.breakoutAxis === 'minutes_usage' ||
        r.breakoutAxis === 'efficiency'
          ? r.breakoutAxis
          : null;

      rules.push({
        id,
        entityType,
        metricId,
        category,
        metricLabel: String(r.metricLabel || metricId).trim().slice(0, 48),
        label: String(r.label || `${metricId} ${operator} ${threshold}`).trim().slice(0, 96),
        operator,
        threshold,
        minGamesOverride,
        minMinutes,
        minAttempts,
        groupSingle: r.groupSingle ? String(r.groupSingle).trim().slice(0, 32) : null,
        breakoutAxis,
        unit: typeof r.unit === 'string' ? r.unit.slice(0, 16) : '',
        isPositive: typeof r.isPositive === 'boolean' ? r.isPositive : true,
        enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
        isCustom: Boolean(r.isCustom),
      });
      if (rules.length >= 200) break;
    }
  }

  if (rules.length === 0) {
    rules = DEFAULT_AUTO_STREAK_RULES.map((r) => ({ ...r }));
  } else {
    // Compactación automática a 1 único mínimo base dinámico por (entidad, métrica, dirección).
    // Si existían reglas escalonadas heredadas (ej. 12+ REB, 10+ REB, 8+ REB), se unifican
    // conservando el mínimo base más amplio porque el motor dinámico detecta todos los valores superiores.
    const defaultByKey = new Map<string, AutoStreakRuleConfig>();
    for (const def of DEFAULT_AUTO_STREAK_RULES) {
      const k = `${def.entityType}:${def.metricId}:${def.isPositive ? 'pos' : 'neg'}`;
      defaultByKey.set(k, def);
    }

    const compacted = new Map<string, AutoStreakRuleConfig>();
    const orderKeys: string[] = [];

    for (const rule of rules) {
      const key = `${rule.entityType}:${rule.metricId}:${rule.isPositive ? 'pos' : 'neg'}`;
      const existing = compacted.get(key);
      if (!existing) {
        compacted.set(key, { ...rule });
        orderKeys.push(key);
      } else {
        const isUpperBound = rule.operator === 'lte' || rule.operator === 'lt';
        const ruleIsWider = isUpperBound
          ? rule.threshold > existing.threshold
          : rule.threshold < existing.threshold;
        const winner = ruleIsWider ? { ...rule } : { ...existing };
        winner.enabled = existing.enabled || rule.enabled;
        winner.isCustom = existing.isCustom || rule.isCustom;
        compacted.set(key, winner);
      }
    }

    // Refresh canonical labels on all non-custom rules so legacy static titles
    // (e.g. "8+ Tiros de campo anotados") never linger after upgrading to the unified engine.
    for (const key of orderKeys) {
      const entry = compacted.get(key);
      if (!entry) continue;
      const def = defaultByKey.get(key);
      if (def && !entry.isCustom) {
        entry.id = def.id;
        entry.metricLabel = def.metricLabel;
        entry.unit = def.unit;
        entry.groupSingle = def.groupSingle;
        entry.category = def.category;
        entry.label = isBinaryStreakMetric(entry.metricId)
          ? def.label
          : entry.threshold === def.threshold &&
              entry.minMinutes === def.minMinutes &&
              entry.minAttempts === def.minAttempts
            ? def.label
            : buildAutoRuleLabel(
                entry.metricLabel,
                entry.operator,
                entry.threshold,
                entry.unit,
                entry.minMinutes,
                entry.minAttempts
              );
      }
    }

    // Ensure every default NBA metric exists in the unified master table
    for (const def of DEFAULT_AUTO_STREAK_RULES) {
      const k = `${def.entityType}:${def.metricId}:${def.isPositive ? 'pos' : 'neg'}`;
      if (!compacted.has(k)) {
        compacted.set(k, { ...def });
        orderKeys.push(k);
      }
    }

    rules = orderKeys
      .map((k) => compacted.get(k))
      .filter((r): r is AutoStreakRuleConfig => Boolean(r));
  }

  return {
    minStreakGames,
    rules,
    updatedAt:
      typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt)
        ? obj.updatedAt
        : 0,
  };
}

export function getDefaultAutoStreakRuleForKey(
  entityType: 'player' | 'team',
  metricId: string,
  isPositive: boolean
): AutoStreakRuleConfig | null {
  const found = DEFAULT_AUTO_STREAK_RULES.find(
    (r) =>
      r.entityType === entityType &&
      r.metricId === metricId &&
      r.isPositive === isPositive
  );
  return found ? { ...found } : null;
}
