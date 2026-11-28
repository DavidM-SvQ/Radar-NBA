import type {
  ExperienceMetricCategoryId,
  ExperienceMode,
  ExperienceMetricsConfig,
  ExperienceMetricsConfigValues,
} from '../types/nba';

export interface ExperienceMetricCatalogEntry {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  category: ExperienceMetricCategoryId;
  entityScope: 'player' | 'team' | 'both';
  defaultMode: 'simple' | 'advanced';
  /** All metric keys/IDs used across views (streaks, anomalies, milestones, gameday, filters, H2H, range, scatter, inspector) */
  aliases: string[];
}

export interface ExperienceMetricCategoryMeta {
  id: ExperienceMetricCategoryId;
  label: string;
  description: string;
  defaultGroup: 'simple' | 'advanced';
}

export const EXPERIENCE_METRIC_CATEGORIES: ExperienceMetricCategoryMeta[] = [
  {
    id: 'scoring_basic',
    label: 'Anotación y Puntos Básicos',
    description: 'Puntos anotados por partido y acumulados (jugador y equipo).',
    defaultGroup: 'simple',
  },
  {
    id: 'shooting_vol',
    label: 'Tiros y Porcentajes Clásicos',
    description: 'Tiros de campo, de 2, triples y tiros libres (anotados, intentados y %).',
    defaultGroup: 'simple',
  },
  {
    id: 'rebounding_playmaking',
    label: 'Rebotes y Asistencias',
    description: 'Rebotes totales, ofensivos, defensivos y asistencias.',
    defaultGroup: 'simple',
  },
  {
    id: 'defense_discipline',
    label: 'Defensa, Disciplina y Minutos',
    description: 'Robos, tapones, pérdidas, faltas personales, minutos y Más/Menos (+/-).',
    defaultGroup: 'simple',
  },
  {
    id: 'milestones_classic',
    label: 'Hitos Clásicos (DD2 / TD3)',
    description: 'Dobles-Dobles y Triples-Dobles conseguidos.',
    defaultGroup: 'simple',
  },
  {
    id: 'team_basic',
    label: 'Resultados y Balance de Equipo',
    description: 'Victorias, derrotas, puntos recibidos y diferencia de marcador.',
    defaultGroup: 'simple',
  },
  {
    id: 'combos_advanced',
    label: 'Combos Estadísticos (PRA / Stocks)',
    description: 'Métricas compuestas como PRA, P+R, P+A, R+A y Stocks (ROB+TAP).',
    defaultGroup: 'advanced',
  },
  {
    id: 'efficiency_advanced',
    label: 'Eficiencia de Tiro Avanzada',
    description: 'True Shooting (TS%), Tiro Efectivo (eFG%), TSA, PTS/Tiro y tasas 3PAr/FTr.',
    defaultGroup: 'advanced',
  },
  {
    id: 'ratings_impact',
    label: 'Ratings, Ritmo e Impacto Global',
    description: 'OffRtg, DefRtg, NetRtg, Pace, USG%, Game Score (GmSc) y PIE%.',
    defaultGroup: 'advanced',
  },
  {
    id: 'per36_ratios',
    label: 'Ratios, Porcentajes de Posesión y Por 36m',
    description: 'AST/PER, AST%, TOV%, OREB%, REB%, PPM y proyecciones por 36 minutos.',
    defaultGroup: 'advanced',
  },
  {
    id: 'hustle_zones',
    label: 'Hustle, Zonas de Cancha y Tracking NBA.com',
    description: 'Pintura, contraataque, 2ª oportunidad, desvíos, punteo, box-outs, bloqueos y tracking.',
    defaultGroup: 'advanced',
  },
];

export const EXPERIENCE_METRICS_CATALOG: ExperienceMetricCatalogEntry[] = [
  // ── 1. Anotación Básica ──
  {
    id: 'points',
    label: 'Puntos (PTS)',
    shortLabel: 'PTS',
    description: 'Puntos anotados por jugador o equipo (media, total y topes).',
    category: 'scoring_basic',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'points',
      'pts',
      'ptsBase',
      'ptsPg',
      'ptsAvg',
      'ppg',
      'tot',
      'pf',
      'ptsFor',
      'pointsFor',
      'team_pts_for',
      'sg-player-pts',
      'sl-player-pts-avg',
      'sl-player-pts-tot',
      'sg-team-pts',
      'sg-team-total',
      'sl-team-pts-avg',
      'basic_pts',
      'basic_ptsFor',
      'pts_for',
      'avgPointsFor',
      'careerTotalPts',
      'careerHighPts',
    ],
  },

  // ── 2. Tiros y Porcentajes Clásicos ──
  {
    id: 'fgm',
    label: 'Tiros de Campo Anotados (FGM / TCM)',
    shortLabel: 'TCM',
    description: 'Canastas de campo convertidas por partido o totales.',
    category: 'shooting_vol',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'fgm',
      'fgmPg',
      'sg-player-fgm',
      'sl-player-fgm-avg',
      'sl-player-fgm-tot',
      'sg-team-fgm',
      'basic_fgm',
    ],
  },
  {
    id: 'fga',
    label: 'Tiros de Campo Intentados (FGA / TCI)',
    shortLabel: 'TCI',
    description: 'Volumen de lanzamientos a canasta intentados.',
    category: 'shooting_vol',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'fga',
      'fgaPg',
      'sg-player-fga',
      'sl-player-fga-avg',
      'basic_fga',
    ],
  },
  {
    id: 'fgPct',
    label: 'Porcentaje de Tiros de Campo (FG%)',
    shortLabel: 'FG%',
    description: 'Acierto global en tiros de campo.',
    category: 'shooting_vol',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'fgPct',
      'fg_pct',
      'team_fgPct',
      'sg-player-fgpct',
      'sl-player-fgpct',
      'sg-team-fgpct',
      'sl-team-fgpct',
      'basic_fgPct',
    ],
  },
  {
    id: 'fg2m',
    label: 'Tiros de 2 Puntos Anotados (2PM)',
    shortLabel: 'T2M',
    description: 'Canastas de dos puntos anotadas.',
    category: 'shooting_vol',
    entityScope: 'player',
    defaultMode: 'simple',
    aliases: ['fg2m', 'sl-player-fg2m-avg', 'basic_fg2m'],
  },
  {
    id: 'fg2a',
    label: 'Tiros de 2 Puntos Intentados (2PA)',
    shortLabel: 'T2I',
    description: 'Intentos de lanzamiento de dos puntos.',
    category: 'shooting_vol',
    entityScope: 'player',
    defaultMode: 'simple',
    aliases: ['fg2a', 'basic_fg2a'],
  },
  {
    id: 'fg2Pct',
    label: 'Porcentaje de Tiros de 2 (2P%)',
    shortLabel: '2P%',
    description: 'Acierto en lanzamientos de dos puntos.',
    category: 'shooting_vol',
    entityScope: 'player',
    defaultMode: 'simple',
    aliases: ['fg2Pct', 'sl-player-fg2pct', 'basic_fg2Pct'],
  },
  {
    id: 'fg3m',
    label: 'Triples Anotados (3PM)',
    shortLabel: '3PM',
    description: 'Canastas de tres puntos convertidas.',
    category: 'shooting_vol',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'fg3m',
      '3pm',
      'fg3mPg',
      'team_fg3m',
      'sg-player-3pm',
      'sl-player-3pm-avg',
      'sl-player-3pm-tot',
      'sg-team-3pm',
      'sl-team-3pm-avg',
      'basic_fg3m',
      'fg3mAvg',
    ],
  },
  {
    id: 'fg3a',
    label: 'Triples Intentados (3PA)',
    shortLabel: '3PA',
    description: 'Volumen de lanzamientos exteriores intentados.',
    category: 'shooting_vol',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'fg3a',
      '3pa',
      'fg3aPg',
      'sg-player-3pa',
      'sl-player-3pa-avg',
      'sg-team-3pa',
      'basic_fg3a',
      'fg3aAvg',
    ],
  },
  {
    id: 'fg3Pct',
    label: 'Porcentaje de Triples (3P%)',
    shortLabel: '3P%',
    description: 'Acierto en tiros de tres puntos.',
    category: 'shooting_vol',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'fg3Pct',
      '3pct',
      'fg3_pct',
      'team_fg3Pct',
      'sg-player-3ppct',
      'sl-player-3ppct',
      'sg-team-3ppct',
      'sl-team-3ppct',
      'basic_fg3Pct',
    ],
  },
  {
    id: 'ftm',
    label: 'Tiros Libres Anotados (FTM / TLM)',
    shortLabel: 'TLM',
    description: 'Tiros libres convertidos desde la línea.',
    category: 'shooting_vol',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'ftm',
      'ftmPg',
      'sg-player-ftm',
      'sg-player-ft-perfect',
      'sl-player-ftm-avg',
      'sl-player-ftm-tot',
      'sg-team-ftm',
      'basic_ftm',
    ],
  },
  {
    id: 'fta',
    label: 'Tiros Libres Intentados (FTA / TLI)',
    shortLabel: 'TLI',
    description: 'Visitas a la línea de tiros libres.',
    category: 'shooting_vol',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'fta',
      'ftaPg',
      'sg-player-fta',
      'sl-player-fta-avg',
      'basic_fta',
    ],
  },
  {
    id: 'ftPct',
    label: 'Porcentaje de Tiros Libres (FT%)',
    shortLabel: 'FT%',
    description: 'Acierto desde la línea de personal.',
    category: 'shooting_vol',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'ftPct',
      'ft_pct',
      'sl-player-ftpct',
      'sl-team-ftpct',
      'basic_ftPct',
    ],
  },

  // ── 3. Rebotes y Asistencias ──
  {
    id: 'rebounds',
    label: 'Rebotes Totales (REB)',
    shortLabel: 'REB',
    description: 'Rebotes totales capturados por jugador o equipo.',
    category: 'rebounding_playmaking',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'rebounds',
      'reb',
      'rebBase',
      'rebPg',
      'rebAvg',
      'team_reb',
      'sg-player-reb',
      'sl-player-reb-avg',
      'sl-player-reb-tot',
      'sg-team-reb',
      'sl-team-reb-avg',
      'basic_reb',
    ],
  },
  {
    id: 'oreb',
    label: 'Rebotes Ofensivos (OREB / OR)',
    shortLabel: 'OREB',
    description: 'Rebotes capturados en ataque para segundas jugadas.',
    category: 'rebounding_playmaking',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'oreb',
      'orb',
      'orebPg',
      'team_oreb',
      'sg-player-oreb',
      'sl-player-orb-avg',
      'sl-player-orb-tot',
      'sg-team-oreb',
      'sl-team-orb-avg',
      'basic_oreb',
      'orebAvg',
    ],
  },
  {
    id: 'dreb',
    label: 'Rebotes Defensivos (DREB / DR)',
    shortLabel: 'DREB',
    description: 'Rebotes capturados cerrando el aro propio.',
    category: 'rebounding_playmaking',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'dreb',
      'drb',
      'drebPg',
      'sg-player-dreb',
      'sl-player-drb-avg',
      'sl-player-drb-tot',
      'sg-team-dreb',
      'basic_dreb',
      'drebAvg',
    ],
  },
  {
    id: 'assists',
    label: 'Asistencias (AST)',
    shortLabel: 'AST',
    description: 'Pases directos de canasta por jugador o equipo.',
    category: 'rebounding_playmaking',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'assists',
      'ast',
      'astBase',
      'astPg',
      'astAvg',
      'team_ast',
      'sg-player-ast',
      'sg-player-ast-notov',
      'sl-player-ast-avg',
      'sl-player-ast-tot',
      'sg-team-ast',
      'sl-team-ast-avg',
      'basic_ast',
    ],
  },

  // ── 4. Defensa, Disciplina y Minutos ──
  {
    id: 'steals',
    label: 'Robos de Balón (STL / ROB)',
    shortLabel: 'ROB',
    description: 'Balones recuperados directamente al rival.',
    category: 'defense_discipline',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'steals',
      'stl',
      'stlPg',
      'team_stl',
      'sg-player-stl',
      'sl-player-stl-avg',
      'sl-player-stl-tot',
      'sg-team-stl',
      'sl-team-stl-avg',
      'basic_stl',
      'stlAvg',
    ],
  },
  {
    id: 'blocks',
    label: 'Tapones (BLK / TAP)',
    shortLabel: 'TAP',
    description: 'Lanzamientos rivales taponados.',
    category: 'defense_discipline',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'blocks',
      'blk',
      'blkPg',
      'team_blk',
      'sg-player-blk',
      'sl-player-blk-avg',
      'sl-player-blk-tot',
      'sg-team-blk',
      'sl-team-blk-avg',
      'basic_blk',
      'blkAvg',
    ],
  },
  {
    id: 'turnovers',
    label: 'Pérdidas de Balón (TOV / PER)',
    shortLabel: 'PER',
    description: 'Balones perdidos por partido.',
    category: 'defense_discipline',
    entityScope: 'both',
    defaultMode: 'simple',
    aliases: [
      'turnovers',
      'tov',
      'tovPg',
      'team_tov',
      'sg-player-tov',
      'sl-player-tov-high',
      'sg-team-tov-low',
      'sl-team-tov-low',
      'basic_tov',
      'tovAvg',
    ],
  },
  {
    id: 'fouls',
    label: 'Faltas Personales (PF / FP)',
    shortLabel: 'FP',
    description: 'Faltas personales cometidas por partido.',
    category: 'defense_discipline',
    entityScope: 'player',
    defaultMode: 'simple',
    aliases: ['fouls', 'pf', 'pfPg', 'sl-player-pf-low', 'basic_pf'],
  },
  {
    id: 'minutes',
    label: 'Minutos Jugados (MIN)',
    shortLabel: 'MIN',
    description: 'Tiempo de juego en pista por partido.',
    category: 'defense_discipline',
    entityScope: 'player',
    defaultMode: 'simple',
    aliases: [
      'minutes',
      'min',
      'minBase',
      'minPg',
      'sg-player-min',
      'sl-player-min-avg',
      'sl-player-min-tot',
      'basic_min',
      'basic_gp',
      'gp',
    ],
  },
  {
    id: 'plusMinus',
    label: 'Más / Menos (+/-)',
    shortLabel: '+/-',
    description: 'Diferencia de puntos mientras el jugador está en pista.',
    category: 'defense_discipline',
    entityScope: 'player',
    defaultMode: 'simple',
    aliases: [
      'plusMinus',
      'pm',
      'sg-player-pm',
      'sl-player-pm-avg',
      'sl-player-pm-tot',
      'basic_plusMinus',
    ],
  },

  // ── 5. Hitos Clásicos ──
  {
    id: 'doubleDouble',
    label: 'Dobles-Dobles (DD2)',
    shortLabel: 'DD2',
    description: 'Partidos con 10+ en al menos dos categorías estadísticas.',
    category: 'milestones_classic',
    entityScope: 'player',
    defaultMode: 'simple',
    aliases: ['doubleDouble', 'dd2', 'sl-player-dd2'],
  },
  {
    id: 'tripleDouble',
    label: 'Triples-Dobles (TD3)',
    shortLabel: 'TD3',
    description: 'Partidos con 10+ en al menos tres categorías estadísticas.',
    category: 'milestones_classic',
    entityScope: 'player',
    defaultMode: 'simple',
    aliases: ['tripleDouble', 'td3', 'sl-player-td3'],
  },

  // ── 6. Resultados y Balance de Equipo ──
  {
    id: 'team_win',
    label: 'Victorias y % de Victorias (%V)',
    shortLabel: 'VIC / %V',
    description: 'Rachas de victorias, balance y porcentaje de triunfos.',
    category: 'team_basic',
    entityScope: 'team',
    defaultMode: 'simple',
    aliases: ['team_win', 'winPct', 'wins', 'homew', 'sl-team-winpct', 'basic_winPct'],
  },
  {
    id: 'team_loss',
    label: 'Derrotas Consecutivas',
    shortLabel: 'DER',
    description: 'Rachas negativas de derrotas de equipo.',
    category: 'team_basic',
    entityScope: 'team',
    defaultMode: 'simple',
    aliases: ['team_loss', 'losses'],
  },
  {
    id: 'team_pts_against',
    label: 'Puntos Recibidos por Partido',
    shortLabel: 'PTS Rec.',
    description: 'Puntos encajados por la defensa del equipo.',
    category: 'team_basic',
    entityScope: 'team',
    defaultMode: 'simple',
    aliases: [
      'team_pts_against',
      'pointsAgainst',
      'ptsAgainst',
      'pa',
      'oppPts',
      'sg-team-opp-pts-low',
      'sl-team-opp-pts',
      'basic_ptsAgainst',
      'basic_opp_pts',
      'avgPointsAgainst',
    ],
  },
  {
    id: 'team_diff',
    label: 'Diferencia de Puntos / Margen (+/-)',
    shortLabel: 'Margen',
    description: 'Diferencial medio de puntos anotados menos recibidos.',
    category: 'team_basic',
    entityScope: 'team',
    defaultMode: 'simple',
    aliases: [
      'team_diff',
      'diff',
      'differential',
      'margin',
      'close',
      'blowout',
      'sg-team-margin',
      'sl-team-diff',
      'basic_diff',
    ],
  },

  // ── 7. Combos Estadísticos (Avanzado por defecto) ──
  {
    id: 'pra',
    label: 'PRA (Puntos + Rebotes + Asistencias)',
    shortLabel: 'PRA',
    description: 'Suma combinada de PTS + REB + AST.',
    category: 'combos_advanced',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['pra', 'sg-player-pra', 'sl-player-pra-avg'],
  },
  {
    id: 'ptsReb',
    label: 'Puntos + Rebotes (P+R)',
    shortLabel: 'P+R',
    description: 'Suma combinada de puntos y rebotes.',
    category: 'combos_advanced',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['ptsReb', 'sl-player-pr-avg'],
  },
  {
    id: 'ptsAst',
    label: 'Puntos + Asistencias (P+A)',
    shortLabel: 'P+A',
    description: 'Suma combinada de puntos y asistencias.',
    category: 'combos_advanced',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['ptsAst', 'sl-player-pa-avg'],
  },
  {
    id: 'rebAst',
    label: 'Rebotes + Asistencias (R+A)',
    shortLabel: 'R+A',
    description: 'Suma combinada de rebotes y asistencias.',
    category: 'combos_advanced',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['rebAst', 'sl-player-ra-avg'],
  },
  {
    id: 'stocks',
    label: 'Stocks (Robos + Tapones)',
    shortLabel: 'STK',
    description: 'Suma combinada de acciones defensivas (ROB + TAP).',
    category: 'combos_advanced',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: [
      'stocks',
      'stk',
      'sg-player-stocks',
      'sl-player-stocks-avg',
      'sl-player-stocks-tot',
      'sg-team-stocks',
    ],
  },

  // ── 8. Eficiencia de Tiro Avanzada ──
  {
    id: 'tsPct',
    label: 'True Shooting (TS%)',
    shortLabel: 'TS%',
    description: 'Eficiencia real de tiro ponderando T2, T3 y Tiros Libres.',
    category: 'efficiency_advanced',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: [
      'tsPct',
      'ts',
      'sg-player-ts',
      'sl-player-ts',
      'sg-team-ts',
      'sl-team-ts',
      'adv_tsPct',
    ],
  },
  {
    id: 'efgPct',
    label: 'Tiro de Campo Efectivo (eFG%)',
    shortLabel: 'eFG%',
    description: 'Porcentaje de tiro ajustado al valor extra del triple.',
    category: 'efficiency_advanced',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: [
      'efgPct',
      'efg',
      'sg-player-efg',
      'sl-player-efg',
      'sg-team-efg',
      'sl-team-efg',
      'adv_efgPct',
    ],
  },
  {
    id: 'tsa',
    label: 'Intentos de Tiro Verdadero (TSA)',
    shortLabel: 'TSA',
    description: 'Volumen real de finalizaciones: FGA + 0.44 × FTA.',
    category: 'efficiency_advanced',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['tsa'],
  },
  {
    id: 'ptsPerShot',
    label: 'Puntos por Tiro Intentado (PTS/TCI)',
    shortLabel: 'PTS/TCI',
    description: 'Rendimiento anotador por cada tiro de campo lanzado.',
    category: 'efficiency_advanced',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['ptsPerShot'],
  },
  {
    id: 'threeRate',
    label: 'Tasa de Triples (3PAr%)',
    shortLabel: '3PAr%',
    description: 'Porcentaje de lanzamientos que son triples sobre el total de tiros.',
    category: 'efficiency_advanced',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['threeRate', 'fg3aRate'],
  },
  {
    id: 'ftRate',
    label: 'Tasa de Tiros Libres (FTr%)',
    shortLabel: 'FTr%',
    description: 'Ratio de tiros libres intentados por cada tiro de campo.',
    category: 'efficiency_advanced',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['ftRate', 'ftaRate'],
  },

  // ── 9. Ratings, Ritmo e Impacto Global ──
  {
    id: 'offRtg',
    label: 'Rating Ofensivo (OffRtg)',
    shortLabel: 'OffRtg',
    description: 'Puntos anotados por cada 100 posesiones.',
    category: 'ratings_impact',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: [
      'offRtg',
      'offrtg',
      'team_off_rtg',
      'sg-team-offrtg',
      'sl-player-offrtg',
      'sl-team-offrtg',
      'adv_offRtg',
    ],
  },
  {
    id: 'defRtg',
    label: 'Rating Defensivo (DefRtg)',
    shortLabel: 'DefRtg',
    description: 'Puntos permitidos por cada 100 posesiones.',
    category: 'ratings_impact',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: [
      'defRtg',
      'defrtg',
      'team_def_rtg',
      'sg-team-defrtg',
      'sl-player-defrtg',
      'sl-team-defrtg',
      'adv_defRtg',
    ],
  },
  {
    id: 'netRtg',
    label: 'Rating Neto (NetRtg)',
    shortLabel: 'NetRtg',
    description: 'Diferencia entre OffRtg y DefRtg por cada 100 posesiones.',
    category: 'ratings_impact',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: [
      'netRtg',
      'netrtg',
      'team_net_rtg',
      'sg-team-netrtg',
      'sl-player-netrtg',
      'sl-team-netrtg',
      'adv_netRtg',
    ],
  },
  {
    id: 'pace',
    label: 'Ritmo de Posesiones (Pace)',
    shortLabel: 'Pace',
    description: 'Velocidad estimada de posesiones cada 48 minutos.',
    category: 'ratings_impact',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['pace', 'team_pace', 'sg-team-pace', 'sl-team-pace', 'adv_pace'],
  },
  {
    id: 'usgEst',
    label: 'Uso Ofensivo (USG%)',
    shortLabel: 'USG%',
    description: 'Porcentaje de jugadas del equipo finalizadas por el jugador.',
    category: 'ratings_impact',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['usgEst', 'usgPct', 'sg-player-usg', 'sl-player-usg', 'adv_usgPct'],
  },
  {
    id: 'gameScore',
    label: 'Valoración Hollinger (Game Score / GmSc)',
    shortLabel: 'GmSc',
    description: 'Índice sintético de rendimiento global en un partido.',
    category: 'ratings_impact',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['gameScore', 'gmSc', 'sg-player-gmsc', 'sl-player-gmsc-avg'],
  },
  {
    id: 'pie',
    label: 'Impacto en Pista (PIE%)',
    shortLabel: 'PIE%',
    description: 'Player Impact Estimate oficial de NBA.com.',
    category: 'ratings_impact',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['pie', 'sl-player-pie', 'adv_pie'],
  },

  // ── 10. Ratios, Porcentajes de Posesión y Por 36m ──
  {
    id: 'astTo',
    label: 'Ratio Asistencias / Pérdidas (AST/PER)',
    shortLabel: 'AST/PER',
    description: 'Cuidado del balón al crear juego.',
    category: 'per36_ratios',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['astTo', 'astTovRatio', 'sl-player-astto', 'adv_astTo'],
  },
  {
    id: 'astPct',
    label: 'Porcentaje y Ratio de Asistencias (AST% / AST Ratio)',
    shortLabel: 'AST%',
    description: 'Proporción de canastas de compañeros asistidas en pista.',
    category: 'per36_ratios',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['astPct', 'astRatioEst', 'astRatio', 'sl-player-astpct', 'adv_astPct'],
  },
  {
    id: 'tovPct',
    label: 'Porcentaje de Pérdidas (TOV%)',
    shortLabel: 'TOV%',
    description: 'Pérdidas por cada 100 posesiones usadas.',
    category: 'per36_ratios',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['tovPct', 'tovPctEst', 'tovpct', 'sl-player-tovpct', 'adv_tovPct'],
  },
  {
    id: 'orebPct',
    label: 'Porcentaje de Rebote Ofensivo (OREB%)',
    shortLabel: 'OREB%',
    description: 'Porcentaje de rebotes disponibles capturados en ataque.',
    category: 'per36_ratios',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['orebPct', 'orebpct', 'sl-player-orebpct', 'adv_orebPct'],
  },
  {
    id: 'rebPct',
    label: 'Porcentaje de Rebote Total y Defensivo (REB% / DREB%)',
    shortLabel: 'REB%',
    description: 'Cuota total o defensiva de rebotes capturados en pista.',
    category: 'per36_ratios',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['rebPct', 'drebPct', 'sl-player-rebpct', 'adv_rebPct', 'adv_drebPct'],
  },
  {
    id: 'ptsPerMin',
    label: 'Puntos por Minuto (PPM)',
    shortLabel: 'PPM',
    description: 'Ritmo de anotación por cada minuto jugado.',
    category: 'per36_ratios',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['ptsPerMin'],
  },
  {
    id: 'ptsPer36',
    label: 'Puntos por 36 Minutos (PTS/36m)',
    shortLabel: 'PTS/36',
    description: 'Producción anotadora proyectada a 36 minutos.',
    category: 'per36_ratios',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['ptsPer36', 'sl-player-pts36'],
  },
  {
    id: 'rebPer36',
    label: 'Rebotes por 36 Minutos (REB / OR / DR /36m)',
    shortLabel: 'REB/36',
    description: 'Producción reboteadora proyectada a 36 minutos.',
    category: 'per36_ratios',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['rebPer36', 'drebPer36', 'orebPer36', 'sl-player-reb36'],
  },
  {
    id: 'astPer36',
    label: 'Asistencias por 36 Minutos (AST/36m)',
    shortLabel: 'AST/36',
    description: 'Asistencias proyectadas a 36 minutos.',
    category: 'per36_ratios',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['astPer36', 'sl-player-ast36'],
  },
  {
    id: 'stocksPer36',
    label: 'Stocks por 36 Minutos (STK/36m)',
    shortLabel: 'STK/36',
    description: 'Robos + tapones proyectados a 36 minutos.',
    category: 'per36_ratios',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['stocksPer36'],
  },
  {
    id: 'praPer36',
    label: 'PRA por 36 Minutos (PRA/36m)',
    shortLabel: 'PRA/36',
    description: 'Producción combinada PRA proyectada a 36 minutos.',
    category: 'per36_ratios',
    entityScope: 'player',
    defaultMode: 'advanced',
    aliases: ['praPer36'],
  },

  // ── 11. Hustle, Zonas y Tracking NBA.com ──
  {
    id: 'ptsPaint',
    label: 'Puntos en la Pintura',
    shortLabel: 'Pintura',
    description: 'Puntos anotados dentro de la zona restringida/pintura.',
    category: 'hustle_zones',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['ptsPaint', 'paint', 'oppPtsPaint', 'sl-player-paint', 'sl-team-paint'],
  },
  {
    id: 'ptsFastBreak',
    label: 'Puntos al Contraataque (Fast Break)',
    shortLabel: 'Contraat.',
    description: 'Puntos anotados en transición rápida.',
    category: 'hustle_zones',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['ptsFastBreak', 'fb', 'oppPtsFastBreak', 'sl-player-fb', 'sl-team-fb'],
  },
  {
    id: 'pts2ndChance',
    label: 'Puntos de 2ª Oportunidad',
    shortLabel: '2ª Oport.',
    description: 'Puntos logrados tras rebote ofensivo.',
    category: 'hustle_zones',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['pts2ndChance', 'second', 'oppPts2ndChance', 'ptsOffTov', 'sl-player-2nd'],
  },
  {
    id: 'hustle_deflections',
    label: 'Desvíos de Balón (Deflections)',
    shortLabel: 'Desvíos',
    description: 'Manos activas y balones desviados en defensa (Hustle).',
    category: 'hustle_zones',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['hustle_deflections', 'deflections', 'hustle', 'sl-player-defl'],
  },
  {
    id: 'hustle_contested',
    label: 'Tiros Punteados (Contested Shots)',
    shortLabel: 'Punteos',
    description: 'Tiros rivales punteados de 2 y 3 puntos (Hustle).',
    category: 'hustle_zones',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: [
      'hustle_contested',
      'contestedShots',
      'contested2pt',
      'contested3pt',
      'sl-player-contest',
    ],
  },
  {
    id: 'hustle_loose',
    label: 'Balones Divididos Recuperados (Loose Balls)',
    shortLabel: 'Divididos',
    description: 'Recuperaciones de balones sueltos en pista.',
    category: 'hustle_zones',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['hustle_loose', 'looseBalls', 'sl-player-loose'],
  },
  {
    id: 'hustle_boxouts',
    label: 'Cierres de Rebote (Box-Outs)',
    shortLabel: 'Box-Outs',
    description: 'Bloqueos de rebote defensivos y ofensivos.',
    category: 'hustle_zones',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['hustle_boxouts', 'boxOuts', 'sl-player-boxouts'],
  },
  {
    id: 'hustle_screens',
    label: 'Asistencias de Bloqueo y Cargas (Screens / Charges)',
    shortLabel: 'Bloqueos',
    description: 'Bloqueos que generan canasta directa y faltas en ataque forzadas.',
    category: 'hustle_zones',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: [
      'hustle_screens',
      'screenAssists',
      'screenAstPts',
      'chargesDrawn',
      'sl-player-screen',
    ],
  },
  {
    id: 'foulsDrawn',
    label: 'Faltas Provocadas (PFD)',
    shortLabel: 'PFD',
    description: 'Faltas personales forzadas al rival por partido.',
    category: 'hustle_zones',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: ['foulsDrawn', 'pfd', 'sl-player-pfd'],
  },
  {
    id: 'tracking_advanced',
    label: 'Tracking, Clutch, Defensa Rival y Violaciones',
    shortLabel: 'Tracking',
    description: 'Drives, toques, pases potenciales, Catch & Shoot, Pull-up, velocidad, clutch y violaciones.',
    category: 'hustle_zones',
    entityScope: 'both',
    defaultMode: 'advanced',
    aliases: [
      'tracking_advanced',
      'drives',
      'drivePts',
      'driveFgPct',
      'touches',
      'frontCtTouches',
      'timeOfPoss',
      'avgSecPerTouch',
      'paintTouches',
      'postTouches',
      'elbowTouches',
      'passesMade',
      'passesReceived',
      'potentialAst',
      'secondaryAst',
      'astPtsCreated',
      'catchShootPts',
      'catchShootFg3Pct',
      'pullUpPts',
      'pullUpFgPct',
      'speedOff',
      'speedDef',
      'distMiles',
      'clutchPts',
      'clutchWinPct',
      'clutchNetRtg',
      'defDiffPct',
      'defDfga',
      'defDfgPct',
      'fantasyPts',
      'traveling',
      'palming',
      'threeSec',
      'defThreeSec',
      'shotClock',
      'backcourt',
      'offFoul',
      'chargeViol',
      'kickedBall',
      'rimFgPct',
      'midFgPct',
      'corner3Pct',
    ],
  },
];

export const EXPERIENCE_METRIC_ID_SET = new Set<string>(
  EXPERIENCE_METRICS_CATALOG.map((m) => m.id)
);

export const DEFAULT_SIMPLE_METRIC_IDS: string[] = EXPERIENCE_METRICS_CATALOG.filter(
  (m) => m.defaultMode === 'simple'
).map((m) => m.id);

export const DEFAULT_EXPERIENCE_METRICS_CONFIG: ExperienceMetricsConfig = {
  simpleMetricIds: [...DEFAULT_SIMPLE_METRIC_IDS],
  updatedAt: 0,
};

// Fast lookup table: any alias (exact or lowercase) -> canonical metric ID
const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const entry of EXPERIENCE_METRICS_CATALOG) {
  ALIAS_TO_CANONICAL.set(entry.id, entry.id);
  ALIAS_TO_CANONICAL.set(entry.id.toLowerCase(), entry.id);
  for (const alias of entry.aliases) {
    ALIAS_TO_CANONICAL.set(alias, entry.id);
    ALIAS_TO_CANONICAL.set(alias.toLowerCase(), entry.id);
  }
}

export function normalizeExperienceMetricsConfig(
  raw: unknown
): ExperienceMetricsConfig {
  const obj =
    raw && typeof raw === 'object'
      ? (raw as Partial<ExperienceMetricsConfig>)
      : {};
  const rawList = Array.isArray(obj.simpleMetricIds)
    ? obj.simpleMetricIds
    : DEFAULT_SIMPLE_METRIC_IDS;

  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of rawList) {
    const id = String(item ?? '').trim();
    if (!id || !EXPERIENCE_METRIC_ID_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    clean.push(id);
  }

  return {
    simpleMetricIds: clean.length > 0 ? clean : [...DEFAULT_SIMPLE_METRIC_IDS],
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
  };
}

export function resolveCanonicalExperienceMetricId(
  rawKey: string | null | undefined
): string | null {
  if (!rawKey) return null;
  const trimmed = String(rawKey).trim();
  if (!trimmed) return null;

  const exact = ALIAS_TO_CANONICAL.get(trimmed);
  if (exact) return exact;
  const lower = ALIAS_TO_CANONICAL.get(trimmed.toLowerCase());
  if (lower) return lower;

  // Handle prefixed keys from inspector/scatter/filters/auto-streaks
  const stripped = trimmed
    .replace(/^(basic_|adv_|hustle_|tracking_|clutch_|defense_|shooting_|playmaking_|scoring_|team_|player_)/i, '')
    .trim();
  if (stripped && stripped !== trimmed) {
    const viaStripped =
      ALIAS_TO_CANONICAL.get(stripped) ||
      ALIAS_TO_CANONICAL.get(stripped.toLowerCase());
    if (viaStripped) return viaStripped;
  }

  // Fallback heuristics for known advanced namespaces
  const lc = trimmed.toLowerCase();
  if (
    lc.includes('ts%') ||
    lc.includes('tspct') ||
    lc.includes('trueshooting')
  ) {
    return 'tsPct';
  }
  if (lc.includes('efg')) return 'efgPct';
  if (lc.includes('offrtg') || lc.includes('off_rtg')) return 'offRtg';
  if (lc.includes('defrtg') || lc.includes('def_rtg')) return 'defRtg';
  if (lc.includes('netrtg') || lc.includes('net_rtg')) return 'netRtg';
  if (lc.includes('pace')) return 'pace';
  if (lc.includes('usg')) return 'usgEst';
  if (lc.includes('gmsc') || lc.includes('gamescore')) return 'gameScore';
  if (lc.includes('pie')) return 'pie';
  if (lc.includes('per36') || lc.includes('/36')) return 'ptsPer36';
  if (lc.includes('stocks') || lc.includes('stk')) return 'stocks';
  if (lc.includes('pra')) return 'pra';
  if (lc.includes('paint') || lc.includes('pintura')) return 'ptsPaint';
  if (lc.includes('fastbreak') || lc.includes('contraataque')) return 'ptsFastBreak';
  if (lc.includes('2nd') || lc.includes('second')) return 'pts2ndChance';
  if (lc.includes('deflect') || lc.includes('hustle') || lc.includes('contest') || lc.includes('boxout') || lc.includes('screen') || lc.includes('loose')) {
    return 'hustle_deflections';
  }
  if (lc.includes('drive') || lc.includes('touch') || lc.includes('pass') || lc.includes('clutch') || lc.includes('speed') || lc.includes('dist') || lc.includes('pullup') || lc.includes('catchshoot') || lc.includes('def_')) {
    return 'tracking_advanced';
  }
  if (lc.includes('dd2') || lc.includes('doble-doble') || lc.includes('doubledouble')) {
    return 'doubleDouble';
  }
  if (lc.includes('td3') || lc.includes('triple-doble') || lc.includes('tripledouble')) {
    return 'tripleDouble';
  }
  if (lc.includes('oreb') || lc.includes('orb')) return 'oreb';
  if (lc.includes('dreb') || lc.includes('drb')) return 'dreb';
  if (lc.includes('reb')) return 'rebounds';
  if (lc.includes('ast')) return 'assists';
  if (lc.includes('stl') || lc.includes('robo')) return 'steals';
  if (lc.includes('blk') || lc.includes('tapon')) return 'blocks';
  if (lc.includes('tov') || lc.includes('perd')) return 'turnovers';
  if (lc.includes('3p%') || lc.includes('fg3pct') || lc.includes('3ppct')) return 'fg3Pct';
  if (lc.includes('3pm') || lc.includes('fg3m') || lc.includes('triple')) return 'fg3m';
  if (lc.includes('ft%') || lc.includes('ftpct')) return 'ftPct';
  if (lc.includes('fg%') || lc.includes('fgpct')) return 'fgPct';
  if (lc.includes('pts') || lc.includes('point') || lc.includes('punto')) return 'points';
  if (lc.includes('min')) return 'minutes';

  return null;
}

/**
 * Checks whether a metric key should be visible under the current ExperienceMode.
 * - In 'advanced' mode: ALL metrics are always allowed.
 * - In 'simple' mode: ONLY metrics whose canonical ID is inside `simpleMetricIds` are allowed.
 *   Unknown metrics default to hidden in 'simple' mode unless explicitly mapped to a simple canonical ID.
 */
export function isMetricAllowedInExperienceMode(
  rawMetricKey: string | null | undefined,
  experienceMode: ExperienceMode,
  simpleMetricIdSet: ReadonlySet<string>
): boolean {
  if (experienceMode === 'advanced') return true;
  const canonical = resolveCanonicalExperienceMetricId(rawMetricKey);
  if (!canonical) return false;
  return simpleMetricIdSet.has(canonical);
}

export function buildSimpleMetricIdSet(
  config?: ExperienceMetricsConfigValues | null
): Set<string> {
  if (!config || !Array.isArray(config.simpleMetricIds) || config.simpleMetricIds.length === 0) {
    return new Set(DEFAULT_SIMPLE_METRIC_IDS);
  }
  return new Set(config.simpleMetricIds);
}
