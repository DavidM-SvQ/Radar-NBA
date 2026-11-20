import type {
  NbaClutchEntry,
  NbaDefenseHustleEntry,
  NbaFourFactorsEntry,
  NbaPlaytypeEntitySummary,
  NbaScoringSplitsEntry,
  NbaShotZonesEntry,
  NbaTrackingEntry,
  NbaViolationsEntry,
  PlayerSummary,
  TeamSummary,
} from '../types/nba';
import { mean } from './analytics';
import {
  getFilterMetricValue,
  getStatLayerCategoryLabel,
  type StatLayerCategory,
} from './entityFilters';
import { resolveMetricHelp } from './humanize';
import { STREAK_METRIC_OPTIONS } from './streakMetricsCatalog';

export const SCATTER_LAYER_ORDER: StatLayerCategory[] = [
  'basic',
  'advanced',
  'scoring',
  'zones',
  'tracking',
  'hustle',
  'defense',
  'clutch',
  'playtypes',
  'violations',
];

export interface ScatterMetricDefinition {
  id: string;
  label: string;
  shortLabel: string;
  unit: string;
  decimals: number;
  lowerIsBetter?: boolean;
  category: StatLayerCategory;
  scope: 'team' | 'player' | 'both';
  helpKey?: string;
  description: string;
  interpretation?: string;
}

export interface ScatterAdvancedSnapshotBundle {
  advFourFactors?: NbaFourFactorsEntry;
  advScoring?: NbaScoringSplitsEntry;
  advZones?: NbaShotZonesEntry;
  advTracking?: NbaTrackingEntry;
  advDefHustle?: NbaDefenseHustleEntry;
  advClutch?: NbaClutchEntry;
  advPlaytypes?: NbaPlaytypeEntitySummary;
  advViolations?: NbaViolationsEntry;
  buzzerBeaters?: number;
  gameWinners?: number;
  heroicLoaded?: boolean;
}

export type TeamWithSnapshot = TeamSummary & ScatterAdvancedSnapshotBundle;
export type PlayerWithSnapshot = PlayerSummary & ScatterAdvancedSnapshotBundle;

function roundDecimals(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export function formatScatterMetricValue(
  val: number | null | undefined,
  metric: Pick<ScatterMetricDefinition, 'decimals'>
): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return roundDecimals(val, metric.decimals).toFixed(metric.decimals);
}

const STREAK_MAP = new Map(STREAK_METRIC_OPTIONS.map((m) => [m.id, m]));

const RAW_SCATTER_METRICS: ScatterMetricDefinition[] = [
  // =========================================================================
  // 1. BÁSICAS & CAJA / BALANCE
  // =========================================================================
  // Team-specific basic metrics
  {
    id: 'winPct',
    label: '% Victorias · Balance de temporada',
    shortLabel: '% Victorias',
    unit: '%',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'winPct',
    description: 'Porcentaje de partidos ganados respecto al total disputado en la temporada.',
    interpretation: 'Mayor es mejor: Más del 60% suele garantizar ventaja de campo en playoffs.',
  },
  {
    id: 'avgPointsFor',
    label: 'PTS Favor · Puntos anotados por partido',
    shortLabel: 'PTS Favor',
    unit: ' pts',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'avgPointsFor',
    description: 'Promedio de puntos anotados por encuentro.',
    interpretation: 'Mayor es mejor: Volumen directo de anotación ofensiva.',
  },
  {
    id: 'avgPointsAgainst',
    label: 'PTS Contra · Puntos recibidos por partido',
    shortLabel: 'PTS Contra',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'basic',
    scope: 'team',
    helpKey: 'avgPointsAgainst',
    description: 'Promedio de puntos recibidos por encuentro.',
    interpretation: 'Menor es mejor: Menos de 110 puntos encajados indica gran contención defensiva.',
  },
  {
    id: 'differential',
    label: 'Diferencial · Margen de puntos por partido',
    shortLabel: 'Margen PTS',
    unit: ' pts',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'differential',
    description: 'Diferencia media entre puntos anotados y recibidos por partido.',
    interpretation: 'Mayor es mejor: Positivo sostenido indica dominio real de los partidos.',
  },
  {
    id: 'fgPct',
    label: 'TC% · % Acierto en Tiros de Campo',
    shortLabel: 'TC%',
    unit: '%',
    decimals: 1,
    category: 'basic',
    scope: 'both',
    helpKey: 'fgPct',
    description: 'Porcentaje global de canastas convertidas sobre todos los lanzamientos de campo.',
    interpretation: 'Mayor es mejor: Combina acierto cerca del aro, media distancia y triples.',
  },
  {
    id: 'fg3mAvg',
    label: '3PM · Triples convertidos por partido',
    shortLabel: '3PM/PJ',
    unit: ' 3PM',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'fg3m',
    description: 'Promedio de canastas de tres puntos anotadas por partido.',
    interpretation: 'Mayor es mejor: Más de 14 triples/PJ refleja gran producción exterior.',
  },
  {
    id: 'fg3aAvg',
    label: '3PA · Triples intentados por partido',
    shortLabel: '3PA/PJ',
    unit: ' 3PA',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'fg3a',
    description: 'Volumen de tiros exteriores lanzados por partido.',
    interpretation: 'Volumen: Equipos modernos suelen lanzar entre 35 y 45 triples por partido.',
  },
  {
    id: 'fg3Pct',
    label: '3P% · % Acierto en Triples',
    shortLabel: '3P%',
    unit: '%',
    decimals: 1,
    category: 'basic',
    scope: 'both',
    helpKey: 'fg3Pct',
    description: 'Porcentaje de acierto en lanzamientos desde más allá de la línea de tres.',
    interpretation: 'Mayor es mejor: Superar el 37% convierte el ataque exterior en amenaza letal.',
  },
  {
    id: 'ftPct',
    label: 'TL% · % Acierto en Tiros Libres',
    shortLabel: 'TL%',
    unit: '%',
    decimals: 1,
    category: 'basic',
    scope: 'both',
    helpKey: 'ftPct',
    description: 'Porcentaje de tiros libres anotados desde la línea de personal.',
    interpretation: 'Mayor es mejor: Puntos gratuitos clave en finales apretados.',
  },
  {
    id: 'rebAvg',
    label: 'REB · Rebotes totales por partido',
    shortLabel: 'REB/PJ',
    unit: ' reb',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'rebBase',
    description: 'Promedio de rebotes capturados por el equipo cada partido.',
    interpretation: 'Mayor es mejor: Asegura posesiones y limita segundas oportunidades rivales.',
  },
  {
    id: 'orebAvg',
    label: 'OR · Rebotes ofensivos por partido',
    shortLabel: 'OR/PJ',
    unit: ' or',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'orebBase',
    description: 'Rebotes capturados bajo el aro rival por partido.',
    interpretation: 'Mayor es mejor: Genera posesiones extra de ataque.',
  },
  {
    id: 'drebAvg',
    label: 'DR · Rebotes defensivos por partido',
    shortLabel: 'DR/PJ',
    unit: ' dr',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'drebBase',
    description: 'Rebotes capturados bajo el propio aro para cerrar la defensa.',
    interpretation: 'Mayor es mejor: Corta de raíz los rebotes en ataque del rival.',
  },
  {
    id: 'astAvg',
    label: 'AST · Asistencias por partido',
    shortLabel: 'AST/PJ',
    unit: ' ast',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'astBase',
    description: 'Promedio de pases de canasta convertidos por partido.',
    interpretation: 'Mayor es mejor: Evidencia circulación de balón y juego colectivo.',
  },
  {
    id: 'stlAvg',
    label: 'ROB · Robos de balón por partido',
    shortLabel: 'ROB/PJ',
    unit: ' rob',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'steals',
    description: 'Balones recuperados activamente por partido.',
    interpretation: 'Mayor es mejor: Presión en líneas de pase y robos en bote.',
  },
  {
    id: 'blkAvg',
    label: 'TAP · Tapones colocados por partido',
    shortLabel: 'TAP/PJ',
    unit: ' tap',
    decimals: 1,
    category: 'basic',
    scope: 'team',
    helpKey: 'blocks',
    description: 'Lanzamientos taponados al rival por partido.',
    interpretation: 'Mayor es mejor: Intimidación e impermeabilidad cerca del aro.',
  },
  {
    id: 'tovAvg',
    label: 'PER · Pérdidas de balón por partido',
    shortLabel: 'PER/PJ',
    unit: ' per',
    decimals: 1,
    lowerIsBetter: true,
    category: 'basic',
    scope: 'team',
    helpKey: 'tov',
    description: 'Balones perdidos por partido.',
    interpretation: 'Menor es mejor: Cuidar la posesión evita contraataques fáciles del rival.',
  },

  // Player-specific basic game-log metrics (preserving all STREAK_METRIC_OPTIONS)
  {
    id: 'points',
    label: 'PTS · Puntos por partido',
    shortLabel: 'PTS',
    unit: ' pts',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'ptsBase',
    description: 'Promedio de puntos anotados por partido.',
    interpretation: 'Mayor es mejor: Capacidad anotadora directa del jugador.',
  },
  {
    id: 'rebounds',
    label: 'REB · Rebotes totales por partido',
    shortLabel: 'REB',
    unit: ' reb',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'rebBase',
    description: 'Promedio de rebotes totales capturados por encuentro.',
    interpretation: 'Mayor es mejor: Dominio del tablero ofensivo y defensivo.',
  },
  {
    id: 'dreb',
    label: 'DR · Rebotes defensivos por partido',
    shortLabel: 'DR',
    unit: ' dr',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'drebBase',
    description: 'Rebotes defensivos capturados por partido.',
    interpretation: 'Mayor es mejor: Cierra posesiones defensivas e inicia transición.',
  },
  {
    id: 'oreb',
    label: 'OR · Rebotes ofensivos por partido',
    shortLabel: 'OR',
    unit: ' or',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'orebBase',
    description: 'Rebotes en ataque capturados por partido.',
    interpretation: 'Mayor es mejor: Aporta segundas jugadas valiosas.',
  },
  {
    id: 'assists',
    label: 'AST · Asistencias por partido',
    shortLabel: 'AST',
    unit: ' ast',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'astBase',
    description: 'Pases de canasta repartidos por partido.',
    interpretation: 'Mayor es mejor: Visión de juego y creación para compañeros.',
  },
  {
    id: 'steals',
    label: 'ROB · Robos de balón por partido',
    shortLabel: 'ROB',
    unit: ' rob',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'steals',
    description: 'Robos de balón logrados por partido.',
    interpretation: 'Mayor es mejor: Actividad defensiva de manos rápidas.',
  },
  {
    id: 'blocks',
    label: 'TAP · Tapones por partido',
    shortLabel: 'TAP',
    unit: ' tap',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'blocks',
    description: 'Tapones colocados por partido.',
    interpretation: 'Mayor es mejor: Protección de aro e intimidación vertical.',
  },
  {
    id: 'stocks',
    label: 'STK · Robos + Tapones (Stocks)',
    shortLabel: 'STK',
    unit: ' stk',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'stocksBase',
    description: 'Suma de robos y tapones por partido.',
    interpretation: 'Mayor es mejor: Termómetro clásico de impacto defensivo directo.',
  },
  {
    id: 'turnovers',
    label: 'PER · Pérdidas de balón por partido',
    shortLabel: 'PER',
    unit: ' per',
    decimals: 1,
    lowerIsBetter: true,
    category: 'basic',
    scope: 'player',
    helpKey: 'tov',
    description: 'Pérdidas de balón cometidas por partido.',
    interpretation: 'Menor es mejor: Seguridad con el balón frente a la presión rival.',
  },
  {
    id: 'fouls',
    label: 'FP · Faltas personales por partido',
    shortLabel: 'FP',
    unit: ' fp',
    decimals: 1,
    lowerIsBetter: true,
    category: 'basic',
    scope: 'player',
    helpKey: 'personalFouls',
    description: 'Faltas personales cometidas por partido.',
    interpretation: 'Menor es mejor: Disciplina defensiva para evitar problemas de faltas.',
  },
  {
    id: 'plusMinus',
    label: '+/- · Impacto Más / Menos en pista',
    shortLabel: '+/-',
    unit: '',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'plusMinusBase',
    description: 'Saldo medio de puntos del equipo mientras el jugador está en pista.',
    interpretation: 'Mayor es mejor: Balance neto positivo durante sus minutos de juego.',
  },
  {
    id: 'minutes',
    label: 'MIN · Minutos jugados por partido',
    shortLabel: 'MIN',
    unit: ' min',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'minBase',
    description: 'Minutos promedio en pista por encuentro.',
    interpretation: 'Mayor indica rol titular y confianza estable del cuerpo técnico.',
  },
  {
    id: 'fg3m',
    label: '3PM · Triples anotados por partido',
    shortLabel: '3PM',
    unit: ' 3PM',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'fg3m',
    description: 'Canastas de 3 puntos anotadas por partido.',
    interpretation: 'Mayor es mejor: Amenaza exterior y espaciado ofensivo.',
  },
  {
    id: 'fg3a',
    label: '3PA · Triples intentados por partido',
    shortLabel: '3PA',
    unit: ' 3PA',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'fg3a',
    description: 'Tiros de tres puntos lanzados por partido.',
    interpretation: 'Mide el volumen y la gravedad exterior del tirador.',
  },
  {
    id: 'fgm',
    label: 'TCM · Tiros de campo anotados / PJ',
    shortLabel: 'TCM',
    unit: '',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'fgmMade',
    description: 'Tiros de campo totales convertidos por partido.',
  },
  {
    id: 'fga',
    label: 'TCI · Tiros de campo intentados / PJ',
    shortLabel: 'TCI',
    unit: '',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'fga',
    description: 'Volumen total de tiros de campo lanzados por partido.',
  },
  {
    id: 'fg2m',
    label: 'T2M · Tiros de 2 puntos anotados / PJ',
    shortLabel: 'T2M',
    unit: '',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'fg2m',
    description: 'Canastas de dos puntos anotadas por partido.',
  },
  {
    id: 'fg2a',
    label: 'T2I · Tiros de 2 puntos intentados / PJ',
    shortLabel: 'T2I',
    unit: '',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'fg2a',
    description: 'Tiros de dos puntos intentados por partido.',
  },
  {
    id: 'ftm',
    label: 'TLM · Tiros libres anotados / PJ',
    shortLabel: 'TLM',
    unit: '',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'ftmMade',
    description: 'Tiros libres convertidos por partido.',
  },
  {
    id: 'fta',
    label: 'TLI · Tiros libres intentados / PJ',
    shortLabel: 'TLI',
    unit: '',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'fta',
    description: 'Tiros libres forzados e intentados por partido.',
  },
  {
    id: 'pra',
    label: 'PRA · Puntos + Rebotes + Asistencias',
    shortLabel: 'PRA',
    unit: ' PRA',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'pra',
    description: 'Suma estadística de puntos, rebotes y asistencias por encuentro.',
    interpretation: 'Mayor es mejor: Mide la producción estadística global del jugador.',
  },
  {
    id: 'ptsReb',
    label: 'PTS+REB · Puntos + Rebotes',
    shortLabel: 'P+R',
    unit: '',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'prCombo',
    description: 'Combinación de anotación y rebote por partido.',
  },
  {
    id: 'ptsAst',
    label: 'PTS+AST · Puntos + Asistencias',
    shortLabel: 'P+A',
    unit: '',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'paCombo',
    description: 'Combinación de puntos anotados y asistencias repartidas.',
  },
  {
    id: 'rebAst',
    label: 'REB+AST · Rebotes + Asistencias',
    shortLabel: 'R+A',
    unit: '',
    decimals: 1,
    category: 'basic',
    scope: 'player',
    helpKey: 'raCombo',
    description: 'Contribución colectiva fuera de la anotación directa.',
  },

  // =========================================================================
  // 2. AVANZADAS E IMPACTO / RATINGS Y 4 FACTORES
  // =========================================================================
  {
    id: 'offRtg',
    label: 'OffRtg · Rating Ofensivo (pts/100 pos)',
    shortLabel: 'OffRtg',
    unit: ' pts',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'offRtg',
    description: 'Puntos anotados por cada 100 posesiones. Aísla la eficacia ofensiva real del ritmo.',
    interpretation: 'Mayor es mejor: Más de 116 pts/100 pos representa un ataque élite en la NBA.',
  },
  {
    id: 'defRtg',
    label: 'DefRtg · Rating Defensivo (pts/100 pos)',
    shortLabel: 'DefRtg',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'advanced',
    scope: 'both',
    helpKey: 'defRtg',
    description: 'Puntos permitidos por cada 100 posesiones defensivas.',
    interpretation: 'MENOR ES MEJOR: Menos de 112 pts/100 pos refleja defensa élite. Se invierte el eje automáticamente.',
  },
  {
    id: 'netRtg',
    label: 'NetRtg · Diferencial Neto (Off - Def)',
    shortLabel: 'NetRtg',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'netRtg',
    description: 'Margen neto de puntos por cada 100 posesiones (OffRtg - DefRtg).',
    interpretation: 'Mayor es mejor: Por encima de +5.0 denota dominio claro en cancha.',
  },
  {
    id: 'pace',
    label: 'Pace · Ritmo de juego (Posesiones/48m)',
    shortLabel: 'Pace',
    unit: ' pos',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'paceSimple',
    description: 'Posesiones disputadas por cada 48 minutos de partido.',
    interpretation: 'Informativo: Más de 101 pos indica juego vertiginoso; menos de 97, ritmo pausado.',
  },
  {
    id: 'tsPct',
    label: 'TS% · Acierto de Tiro Verdadero (True Shooting)',
    shortLabel: 'TS%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'tsPct',
    description: 'Eficiencia global del tiro integrando tiros de 2, triples y tiros libres.',
    interpretation: 'Mayor es mejor: Por encima del 58-60% es eficiencia anotadora sobresaliente.',
  },
  {
    id: 'efgPct',
    label: 'eFG% · Tiro de Campo Efectivo',
    shortLabel: 'eFG%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'efgPct',
    description: 'Porcentaje de tiro que otorga un 50% extra de valor a cada triple: (FGM + 0.5×3PM) / FGA.',
    interpretation: 'Mayor es mejor: Superior al 55% sitúa en la aristocracia del tiro.',
  },
  {
    id: 'usgEst',
    label: 'USG% · Tasa de Uso Ofensivo',
    shortLabel: 'USG%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'usgPct',
    description: 'Porcentaje de jugadas del equipo que finaliza un jugador (tiro, libre o pérdida) mientras está en pista.',
    interpretation: 'Mayor indica mayor protagonismo ofensivo: >28% suele corresponder a primeras estrellas.',
  },
  {
    id: 'pie',
    label: 'PIE% · Impacto Global NBA.com',
    shortLabel: 'PIE%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'pie',
    description: 'Player Impact Estimate oficial: proporción de todo el impacto estadístico que genera respecto al partido.',
    interpretation: 'Mayor es mejor: >14% en jugadores es nivel All-Star; >50% en equipos indica dominio.',
  },
  {
    id: 'gameScore',
    label: 'GmSc · Valoración Game Score (Hollinger)',
    shortLabel: 'GmSc',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'gmSc',
    description: 'Índice único que pondera puntos, porcentajes, rebotes, asistencias, robos, tapones, faltas y pérdidas.',
    interpretation: 'Mayor es mejor: >18 de media denota impacto All-NBA.',
  },
  {
    id: 'astPct',
    label: 'AST% · Porcentaje de canastas asistidas',
    shortLabel: 'AST%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'astPct',
    description: 'Porcentaje de canastas de campo nacidas tras asistencia previa.',
    interpretation: 'Mayor refleja juego colectivo y alta capacidad de pase.',
  },
  {
    id: 'astRatio',
    label: 'AST Ratio · Asistencias por 100 posesiones',
    shortLabel: 'AST Ratio',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'astRatio',
    description: 'Porcentaje de posesiones que culminan en asistencia oficial.',
    interpretation: 'Mayor es mejor: Especialmente valioso en generadores y sistemas dinámicos.',
  },
  {
    id: 'astTovRatio',
    label: 'Ratio AST/TO · Asistencias por pérdida',
    shortLabel: 'AST/TO',
    unit: 'x',
    decimals: 2,
    category: 'advanced',
    scope: 'team',
    helpKey: 'astTo',
    description: 'Relación entre asistencias repartidas y pérdidas sufridas (AST / TOV).',
    interpretation: 'Mayor es mejor: Por encima de 2.0 indica alta precisión organizativa.',
  },
  {
    id: 'astTo',
    label: 'AST/PER · Ratio Asistencias / Pérdidas',
    shortLabel: 'AST/PER',
    unit: 'x',
    decimals: 2,
    category: 'advanced',
    scope: 'player',
    helpKey: 'astTo',
    description: 'Cuántas asistencias reparte el jugador por cada balón que pierde.',
    interpretation: 'Mayor es mejor: >2.5x es excelente seguridad en el manejo.',
  },
  {
    id: 'tovPct',
    label: 'TOV% · Porcentaje de pérdidas por posesión',
    shortLabel: 'TOV%',
    unit: '%',
    decimals: 1,
    lowerIsBetter: true,
    category: 'advanced',
    scope: 'both',
    helpKey: 'tovPct',
    description: 'Porcentaje de posesiones que terminan en pérdida de balón.',
    interpretation: 'MENOR ES MEJOR: Menos del 12.5% denota máxima disciplina ofensiva.',
  },
  {
    id: 'orebPct',
    label: 'OREB% · Porcentaje de rebote ofensivo',
    shortLabel: 'OREB%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'orebPct',
    description: 'Porcentaje de rebotes ofensivos disponibles capturados en el aro rival.',
    interpretation: 'Mayor es mejor: Genera segundas opciones de alto porcentaje.',
  },
  {
    id: 'drebPct',
    label: 'DREB% · Porcentaje de rebote defensivo',
    shortLabel: 'DREB%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'drebPct',
    description: 'Porcentaje de rebotes disponibles asegurados bajo el propio aro.',
    interpretation: 'Mayor es mejor: Cierra posesiones rivales evitando puntos en segunda oportunidad.',
  },
  {
    id: 'rebPct',
    label: 'REB% · Porcentaje de rebote total',
    shortLabel: 'REB%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'both',
    helpKey: 'rebPct',
    description: 'Cuota total de rebotes capturados mientras está en pista.',
    interpretation: 'Mayor es mejor: >50% en equipos garantiza control territorial bajo los aros.',
  },
  {
    id: 'ftaRate',
    label: 'FTA Rate · Ratio de Tiros Libres (FTA / FGA)',
    shortLabel: 'FTA Rate',
    unit: '',
    decimals: 3,
    category: 'advanced',
    scope: 'both',
    helpKey: 'ftr',
    description: 'Frecuencia con la que se visitan los tiros libres en relación con los tiros de campo intentados.',
    interpretation: 'Mayor es mejor: Refleja agresividad atacando el aro y capacidad para forzar faltas.',
  },
  {
    id: 'oppEfgPct',
    label: 'Opp eFG% · Tiro Efectivo permitido al rival (4 Factores)',
    shortLabel: 'Opp eFG%',
    unit: '%',
    decimals: 1,
    lowerIsBetter: true,
    category: 'advanced',
    scope: 'team',
    helpKey: 'oppFourFactors',
    description: 'Uno de los 4 Factores de Dean Oliver: eFG% que permite la defensa al rival.',
    interpretation: 'MENOR ES MEJOR: Limitar el tiro efectivo rival es la base de las mejores defensas.',
  },
  {
    id: 'oppTovPct',
    label: 'Opp TOV% · % Pérdidas forzadas al rival (4 Factores)',
    shortLabel: 'Opp TOV%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'team',
    helpKey: 'oppFourFactors',
    description: 'Uno de los 4 Factores: porcentaje de posesiones en las que la defensa provoca una pérdida.',
    interpretation: 'Mayor es mejor: Defensa agresiva capaz de robar balones y forzar errores.',
  },
  {
    id: 'oppOrebPct',
    label: 'Opp OREB% · % Rebote ofensivo concedido (4 Factores)',
    shortLabel: 'Opp OREB%',
    unit: '%',
    decimals: 1,
    lowerIsBetter: true,
    category: 'advanced',
    scope: 'team',
    helpKey: 'oppFourFactors',
    description: 'Uno de los 4 Factores: porcentaje de rebotes ofensivos capturados por el oponente.',
    interpretation: 'MENOR ES MEJOR: Impedir segundas jugadas rivales.',
  },
  {
    id: 'oppFtaRate',
    label: 'Opp FTr · Tiros Libres concedidos al rival (4 Factores)',
    shortLabel: 'Opp FTr',
    unit: '',
    decimals: 3,
    lowerIsBetter: true,
    category: 'advanced',
    scope: 'team',
    helpKey: 'oppFourFactors',
    description: 'Uno de los 4 Factores: frecuencia de tiros libres que concede la defensa.',
    interpretation: 'MENOR ES MEJOR: Defender sin regalar faltas gratuitas.',
  },
  // Player efficiency & /36m extras from StreakMetricsCatalog
  {
    id: 'fg2Pct',
    label: 'T2% · % Acierto en Tiros de 2 puntos',
    shortLabel: 'T2%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'fg2Pct',
    description: 'Efectividad en lanzamientos dentro del arco de tres puntos.',
  },
  {
    id: 'tsa',
    label: 'TSA · Posesiones de tiro lanzadas (FGA + 0.44×FTA)',
    shortLabel: 'TSA',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'tsaVolume',
    description: 'Volumen real de finalizaciones de tiro incluyendo viajes a la línea de libres.',
  },
  {
    id: 'ptsPerShot',
    label: 'PTS/TCI · Puntos por Tiro de Campo Intentado',
    shortLabel: 'PTS/TCI',
    unit: '',
    decimals: 2,
    category: 'advanced',
    scope: 'player',
    helpKey: 'ptsPerShot',
    description: 'Eficiencia bruta de conversión por cada tiro de campo intentado.',
  },
  {
    id: 'threeRate',
    label: '3PAr · % Volumen de Triples (3PA / FGA)',
    shortLabel: '3PAr',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'threeRatio',
    description: 'Qué porcentaje de los lanzamientos de campo totales son triples.',
  },
  {
    id: 'ftRate',
    label: 'FTr% · Ratio Tiros Libres % (FTA / FGA)',
    shortLabel: 'FTr%',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'ftr',
    description: 'Porcentaje de tiros libres intentados por cada 100 tiros de campo.',
  },
  {
    id: 'tovPctEst',
    label: 'TOV% (Caja) · % Pérdidas estimadas en caja',
    shortLabel: 'TOV% Caja',
    unit: '%',
    decimals: 1,
    lowerIsBetter: true,
    category: 'advanced',
    scope: 'player',
    helpKey: 'tovRatioEst',
    description: 'Estimación por partido de pérdidas sobre posesiones usadas.',
  },
  {
    id: 'astRatioEst',
    label: 'AST Ratio (Caja) · % Posesiones en asistencia',
    shortLabel: 'AST Ratio Caja',
    unit: '%',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'astRatio',
    description: 'Porcentaje de posesiones individuales acabadas en pase de canasta.',
  },
  {
    id: 'ptsPerMin',
    label: 'PTS/MIN · Puntos anotados por minuto',
    shortLabel: 'PTS/MIN',
    unit: '',
    decimals: 2,
    category: 'advanced',
    scope: 'player',
    helpKey: 'ptsPerMin',
    description: 'Ritmo de anotación por cada minuto real en cancha.',
  },
  {
    id: 'ptsPer36',
    label: 'PTS/36 · Puntos por cada 36 minutos',
    shortLabel: 'PTS/36',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'ptsPer36',
    description: 'Puntos proyectados a 36 minutos de juego para comparar titulares y suplentes.',
  },
  {
    id: 'rebPer36',
    label: 'REB/36 · Rebotes por cada 36 minutos',
    shortLabel: 'REB/36',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'rebPer36',
    description: 'Rebotes totales normalizados por 36 minutos.',
  },
  {
    id: 'drebPer36',
    label: 'DR/36 · Rebotes defensivos por 36 minutos',
    shortLabel: 'DR/36',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'drebPer36',
    description: 'Rebotes defensivos proyectados a 36 minutos.',
  },
  {
    id: 'orebPer36',
    label: 'OR/36 · Rebotes ofensivos por 36 minutos',
    shortLabel: 'OR/36',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'orebPer36',
    description: 'Rebotes ofensivos proyectados a 36 minutos.',
  },
  {
    id: 'astPer36',
    label: 'AST/36 · Asistencias por cada 36 minutos',
    shortLabel: 'AST/36',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'astPer36',
    description: 'Asistencias normalizadas a 36 minutos.',
  },
  {
    id: 'stocksPer36',
    label: 'STK/36 · Robos + Tapones por 36 minutos',
    shortLabel: 'STK/36',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'stocksPer36',
    description: 'Actividad defensiva directa proyectada a 36 minutos.',
  },
  {
    id: 'praPer36',
    label: 'PRA/36 · Producción PRA por 36 minutos',
    shortLabel: 'PRA/36',
    unit: '',
    decimals: 1,
    category: 'advanced',
    scope: 'player',
    helpKey: 'praPer36',
    description: 'Suma de Puntos, Rebotes y Asistencias proyectada a 36 minutos.',
  },

  // =========================================================================
  // 3. TIRO Y SCORING SPLITS
  // =========================================================================
  {
    id: 'pctPts3p',
    label: '%PTS 3P (Caja) · Proporción de puntos desde el triple',
    shortLabel: '%PTS 3P',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'team',
    helpKey: 'pctPts3pt',
    description: 'Proporción del tanteo total del equipo que proviene de lanzamientos triples.',
  },
  {
    id: 'pctFga2pt',
    label: '%FGA 2P · % Tiros de campo intentados de 2',
    shortLabel: '%FGA 2P',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctFga2pt',
    description: 'Porcentaje de lanzamientos que se ejecutan dentro de la línea de tres puntos.',
  },
  {
    id: 'pctFga3pt',
    label: '%FGA 3P · % Tiros de campo intentados de 3',
    shortLabel: '%FGA 3P',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctFga3pt',
    description: 'Frecuencia de triples sobre el volumen total de tiro de campo.',
  },
  {
    id: 'pctPts2pt',
    label: '%PTS 2P · % Puntos anotados de 2',
    shortLabel: '%PTS 2P',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctPts2pt',
    description: 'Porcentaje del tanteo total proveniente de canastas de dos puntos.',
  },
  {
    id: 'pctPts2ptMr',
    label: '%PTS MidRange · % Puntos desde media distancia',
    shortLabel: '%PTS MidRange',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctPts2ptMr',
    description: 'Porcentaje de puntos totales generados mediante tiros de media distancia.',
  },
  {
    id: 'pctPts3pt',
    label: '%PTS 3P · % Puntos anotados de triple (NBA.com)',
    shortLabel: '%PTS 3P',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctPts3pt',
    description: 'Porcentaje oficial de los puntos totales que llegan desde más allá del arco.',
  },
  {
    id: 'pctPtsFb',
    label: '%PTS Contraat. · % Puntos en contraataque',
    shortLabel: '%PTS Contr.',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctPtsFb',
    description: 'Peso de las transiciones rápidas sobre la anotación total.',
  },
  {
    id: 'pctPtsFt',
    label: '%PTS Libres · % Puntos desde tiros libres',
    shortLabel: '%PTS Libres',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctPtsFt',
    description: 'Proporción de la anotación generada desde la línea de personal.',
  },
  {
    id: 'pctPtsOffTov',
    label: '%PTS x Pérd. · % Puntos tras pérdida rival',
    shortLabel: '%PTS x Pérd.',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctPtsOffTov',
    description: 'Porcentaje de puntos anotados capitalizando errores del adversario.',
  },
  {
    id: 'pctPtsPaint',
    label: '%PTS Pintura · % Puntos dentro de la zona',
    shortLabel: '%PTS Pintura',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctPtsPaint',
    description: 'Peso del juego interior y penetraciones sobre el total de puntos.',
  },
  {
    id: 'pctAstFgm',
    label: '%AST FGM · % Canastas anotadas tras asistencia',
    shortLabel: '%AST FGM',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctAstFgm',
    description: 'Porcentaje de canastas asistidas frente a canastas generadas en solitario.',
  },
  {
    id: 'pctUastFgm',
    label: '%UAST FGM · % Canastas individuales sin asistencia',
    shortLabel: '%UAST FGM',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    scope: 'both',
    helpKey: 'pctUastFgm',
    description: 'Porcentaje de canastas autogeneradas sin pase previo de un compañero.',
  },

  // =========================================================================
  // 4. ZONAS DE TIRO (SHOT ZONES)
  // =========================================================================
  {
    id: 'raFga',
    label: 'Aro FGA/PJ · Intentos en Zona Restringida (<4ft)',
    shortLabel: 'Aro FGA',
    unit: '',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'restrictedArea',
    description: 'Volumen de lanzamientos intentados pegado al aro (<4 pies) por partido.',
  },
  {
    id: 'raFgPct',
    label: 'Aro FG% · % Acierto en Zona Restringida (<4ft)',
    shortLabel: 'Aro FG%',
    unit: '%',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'restrictedArea',
    description: 'Efectividad finalizando bandejas, mates y tiros bajo el aro.',
    interpretation: 'Mayor es mejor: >66% indica gran capacidad de finalización cerca del aro.',
  },
  {
    id: 'paintNonRaFga',
    label: 'Pintura (No-RA) FGA/PJ · Intentos zona flotadoras',
    shortLabel: 'Pint.(NoRA) FGA',
    unit: '',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'ptsPaint',
    description: 'Tiros intentados dentro de la pintura pero fuera del semicírculo restringido.',
  },
  {
    id: 'paintNonRaFgPct',
    label: 'Pintura (No-RA) FG% · % Acierto en zona intermedia',
    shortLabel: 'Pint.(NoRA) %',
    unit: '%',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'ptsPaint',
    description: 'Efectividad en ganchos cortos, bombas y tiros de pintura intermedia.',
  },
  {
    id: 'midFga',
    label: 'Media Dist. FGA/PJ · Intentos de media distancia',
    shortLabel: 'Mid FGA',
    unit: '',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'pctPts2ptMr',
    description: 'Volumen de lanzamientos de 2 puntos fuera de la pintura.',
  },
  {
    id: 'midFgPct',
    label: 'Media Dist. FG% · % Acierto en media distancia',
    shortLabel: 'Mid FG%',
    unit: '%',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'pctPts2ptMr',
    description: 'Porcentaje de acierto en tiros de media distancia.',
  },
  {
    id: 'corner3Fga',
    label: 'Triple Esquina FGA/PJ · Intentos desde las esquinas',
    shortLabel: 'Esq.3 FGA',
    unit: '',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'corner3',
    description: 'Volumen de triples lanzados desde ambas esquinas (distancia más corta).',
  },
  {
    id: 'corner3FgPct',
    label: 'Triple Esquina FG% · % Acierto en triples de esquina',
    shortLabel: 'Esq.3 %',
    unit: '%',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'corner3',
    description: 'Efectividad desde el tiro más eficiente del perímetro.',
  },
  {
    id: 'ab3Fga',
    label: 'Triple Frontal FGA/PJ · Intentos por encima del arco',
    shortLabel: 'Cab.3 FGA',
    unit: '',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'corner3',
    description: 'Triples intentados desde la cabecera y ángulos frontales.',
  },
  {
    id: 'ab3FgPct',
    label: 'Triple Frontal FG% · % Acierto triples frontales',
    shortLabel: 'Cab.3 %',
    unit: '%',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'corner3',
    description: 'Acierto en triples lejanos de cabecera y 45 grados.',
  },
  {
    id: 'totalThreeFga',
    label: 'Total 3PA/PJ (Zonas) · Volumen global de triples',
    shortLabel: 'Zonas 3PA',
    unit: '',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'fg3a',
    description: 'Suma de intentos triples desde esquinas y arco frontal.',
  },
  {
    id: 'threeFgPct',
    label: 'Total 3P% (Zonas) · Acierto global en triples',
    shortLabel: 'Zonas 3P%',
    unit: '%',
    decimals: 1,
    category: 'zones',
    scope: 'both',
    helpKey: 'fg3Pct',
    description: 'Acierto combinado en todas las zonas de tres puntos.',
  },

  // =========================================================================
  // 5. TRACKING ÓPTICO (COLECTIVO / JUGADORES)
  // =========================================================================
  {
    id: 'drives',
    label: 'Drives · Penetraciones a canasta por partido',
    shortLabel: 'Drives',
    unit: '',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'drives',
    description: 'Ataques al aro con bote iniciando al menos a 20 pies del aro y llegando a <10 pies.',
    interpretation: 'Mayor indica desequilibrio constante en el 1 contra 1 para romper defensas.',
  },
  {
    id: 'drivePts',
    label: 'Drive PTS · Puntos generados penetrando',
    shortLabel: 'Drive PTS',
    unit: ' pts',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'drives',
    description: 'Puntos anotados directamente tras penetración hacia la canasta.',
  },
  {
    id: 'driveFgPct',
    label: 'Drive FG% · % Acierto finalizando penetraciones',
    shortLabel: 'Drive FG%',
    unit: '%',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'drives',
    description: 'Efectividad lanzando tras romper la primera línea con bote.',
  },
  {
    id: 'driveAstPct',
    label: 'Drive AST% · % Asistencias tras penetración',
    shortLabel: 'Drive AST%',
    unit: '%',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'drives',
    description: 'Porcentaje de penetraciones que acaban en pase de canasta tras atraer ayudas.',
  },
  {
    id: 'drivePassesPct',
    label: 'Drive Pase% · % Penetraciones que terminan en pase',
    shortLabel: 'Drive Pase%',
    unit: '%',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'drives',
    description: 'Tendencia a doblar el balón hacia tiradores o interiores tras penetrar.',
  },
  {
    id: 'catchShootPts',
    label: 'C&S PTS · Puntos en Catch & Shoot',
    shortLabel: 'C&S PTS',
    unit: ' pts',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'catchShoot',
    description: 'Puntos anotados recibiendo y tirando casi sin botar (<2s y sin botes).',
  },
  {
    id: 'catchShootFg3Pct',
    label: 'C&S 3P% · % Acierto en triples Catch & Shoot',
    shortLabel: 'C&S 3P%',
    unit: '%',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'catchShoot',
    description: 'Puntería en triples a pies parados tras recepción.',
  },
  {
    id: 'pullUpPts',
    label: 'Pull-Up PTS · Puntos en tiros tras bote',
    shortLabel: 'PullUp PTS',
    unit: ' pts',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'pullUp',
    description: 'Puntos generados parándose a lanzar tras driblar (tiros autogenerados).',
  },
  {
    id: 'pullUpFg3Pct',
    label: 'Pull-Up 3P% · % Acierto en triples tras bote',
    shortLabel: 'PullUp 3P%',
    unit: '%',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'pullUp',
    description: 'Acierto en triples tras bote, rasgo distintivo de generadores élite.',
  },
  {
    id: 'passesMade',
    label: 'Pases Dados · Pases completados por partido',
    shortLabel: 'Pases',
    unit: '',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'potentialAst',
    description: 'Volumen total de pases realizados por partido según cámaras ópticas.',
  },
  {
    id: 'passesReceived',
    label: 'Pases Rec. · Pases recibidos por partido',
    shortLabel: 'Pases Rec.',
    unit: '',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'potentialAst',
    description: 'Volumen de recepciones de pase por partido.',
  },
  {
    id: 'potentialAst',
    label: 'Ast. Potenc. · Asistencias potenciales por partido',
    shortLabel: 'Ast. Pot.',
    unit: '',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'potentialAst',
    description: 'Pases que generan un tiro inmediato del compañero (anote o falle).',
  },
  {
    id: 'astPtsCreated',
    label: 'PTS x Pase · Puntos creados por asistencias',
    shortLabel: 'PTS x Pase',
    unit: ' pts',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'potentialAst',
    description: 'Puntos totales producidos por el equipo gracias a las asistencias dadas.',
  },
  {
    id: 'touches',
    label: 'Toques/PJ · Toques totales de balón',
    shortLabel: 'Toques',
    unit: '',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'touches',
    description: 'Número de veces que entra en contacto con el balón por partido.',
  },
  {
    id: 'timeOfPoss',
    label: 'T. Posesión · Minutos con balón por partido',
    shortLabel: 'T. Pos (m)',
    unit: ' m',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'timeOfPoss',
    description: 'Tiempo acumulado teniendo posesión viva del balón por partido.',
  },
  {
    id: 'distMiles',
    label: 'Distancia · Millas recorridas por partido',
    shortLabel: 'Dist. (mi)',
    unit: ' mi',
    decimals: 2,
    category: 'tracking',
    scope: 'both',
    helpKey: 'distMiles',
    description: 'Distancia total recorrida en ataque y defensa medida por seguimiento óptico.',
  },
  {
    id: 'avgSpeed',
    label: 'Velocidad · Velocidad media en pista (mph)',
    shortLabel: 'Vel. (mph)',
    unit: ' mph',
    decimals: 2,
    category: 'tracking',
    scope: 'both',
    helpKey: 'avgSpeed',
    description: 'Velocidad promedio de desplazamiento durante el juego vivo.',
  },
  {
    id: 'rebChances',
    label: 'Oport. Reb · Ocasiones reales de rebote / PJ',
    shortLabel: 'Oport. Reb',
    unit: '',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'rebChances',
    description: 'Veces que estuvo a <3.5 pies de un rebote en juego.',
  },
  {
    id: 'rebChancePctAdj',
    label: 'Reb Aj.% · Conversión ajustada de oportunidades',
    shortLabel: 'Reb Aj.%',
    unit: '%',
    decimals: 1,
    category: 'tracking',
    scope: 'both',
    helpKey: 'rebChances',
    description: 'Porcentaje de rebotes capturados cuando tuvo oportunidad real sin compañero disputando.',
  },

  // =========================================================================
  // 6. HUSTLE Y PINTURA
  // =========================================================================
  {
    id: 'ptsPaint',
    label: 'PTS Pintura · Puntos en la zona interior / PJ',
    shortLabel: 'PTS Pintura',
    unit: ' pts',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'ptsPaint',
    description: 'Puntos anotados dentro de la pintura rival por encuentro.',
    interpretation: 'Mayor es mejor: Mide dominio físico cerca del aro y penetración.',
  },
  {
    id: 'pts2ndChance',
    label: 'PTS 2ª Op. · Puntos tras rebote ofensivo / PJ',
    shortLabel: '2ª Jugada',
    unit: ' pts',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'pts2ndChance',
    description: 'Puntos obtenidos en segundas jugadas tras rebote de ataque.',
  },
  {
    id: 'ptsFastBreak',
    label: 'PTS Contraat. · Puntos en transición rápida / PJ',
    shortLabel: 'Contraat.',
    unit: ' pts',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'ptsFastBreak',
    description: 'Puntos sumados corriendo la cancha antes de que se forme la defensa rival.',
  },
  {
    id: 'ptsOffTov',
    label: 'PTS x Pérd. · Puntos tras pérdida rival / PJ',
    shortLabel: 'PTS x Pérd.',
    unit: ' pts',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'ptsOffTov',
    description: 'Puntos directos convertidos tras robo o error de posesión del contrario.',
  },
  {
    id: 'contestedShots',
    label: 'Punteados Tot · Tiros rivales punteados / PJ',
    shortLabel: 'Punteados',
    unit: '',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'contestedShots',
    description: 'Lanzamientos rivales en los que el defensor llega a puntear con mano cercana.',
  },
  {
    id: 'contestedShots2pt',
    label: 'Punt. 2P · Tiros de 2 rivales punteados / PJ',
    shortLabel: 'Punt. 2P',
    unit: '',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'contestedShots',
    description: 'Tiros interiores o de media distancia incomodados cerca del tirador.',
  },
  {
    id: 'contestedShots3pt',
    label: 'Punt. 3P · Triples rivales punteados / PJ',
    shortLabel: 'Punt. 3P',
    unit: '',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'contestedShots',
    description: 'Salidas al perímetro (closeouts) punteando lanzamientos triples.',
  },
  {
    id: 'deflections',
    label: 'Desvíos · Balones desviados (Deflections) / PJ',
    shortLabel: 'Desvíos',
    unit: '',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'deflections',
    description: 'Toques defensivos que desvían pases o botes sin necesidad de robar directamente.',
  },
  {
    id: 'chargesDrawn',
    label: 'Cargas Prov. · Faltas en ataque forzadas / PJ',
    shortLabel: 'Cargas Prov.',
    unit: '',
    decimals: 2,
    category: 'hustle',
    scope: 'both',
    helpKey: 'chargesDrawn',
    description: 'Sacrificio corporal colocándose a tiempo para provocar falta en ataque rival.',
  },
  {
    id: 'screenAssists',
    label: 'Screen AST · Bloqueos directos con canasta / PJ',
    shortLabel: 'Screen AST',
    unit: '',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'screenAssists',
    description: 'Pantallas o bloqueos que liberan directamente al compañero para anotar.',
  },
  {
    id: 'screenAstPts',
    label: 'Scr. AST PTS · Puntos generados por bloqueos / PJ',
    shortLabel: 'Scr. PTS',
    unit: ' pts',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'screenAstPts',
    description: 'Puntos anotados por el equipo gracias a bloqueos directos efectivos.',
  },
  {
    id: 'looseBalls',
    label: 'Bal. Sueltos · Balones divididos recuperados / PJ',
    shortLabel: 'Bal. Sueltos',
    unit: '',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'looseBalls',
    description: 'Recuperaciones en pugnas 50/50 por balones sin dueño claro.',
  },
  {
    id: 'boxOuts',
    label: 'Box-Outs · Cierres de rebote totales / PJ',
    shortLabel: 'Box-Outs',
    unit: '',
    decimals: 1,
    category: 'hustle',
    scope: 'both',
    helpKey: 'offBoxOuts',
    description: 'Bloqueos físicos para ganar la posición interior y cerrar el rebote.',
  },

  // =========================================================================
  // 7. DEFENSA Y DFG% / STATS RIVAL
  // =========================================================================
  {
    id: 'defRating',
    label: 'DefRtg (Mód. Defensa) · Puntos permitidos / 100 pos',
    shortLabel: 'DefRtg Def.',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'both',
    helpKey: 'defRtg',
    description: 'Eficiencia defensiva oficial medida dentro del módulo de defensa NBA.com.',
    interpretation: 'MENOR ES MEJOR: Menos puntos recibidos cada 100 posesiones.',
  },
  {
    id: 'defWs',
    label: 'Def Win Shares · Victorias aportadas en defensa',
    shortLabel: 'Def WS',
    unit: '',
    decimals: 3,
    category: 'defense',
    scope: 'both',
    helpKey: 'defWs',
    description: 'Estimación acumulada de victorias atribuibles directamente a la defensa.',
  },
  {
    id: 'dFga',
    label: 'DFGA/PJ · Tiros rivales defendidos / PJ',
    shortLabel: 'DFGA/PJ',
    unit: '',
    decimals: 1,
    category: 'defense',
    scope: 'both',
    helpKey: 'dFgPct',
    description: 'Volumen medio de lanzamientos rivales defendidos como defensor más cercano por partido.',
    interpretation: 'Mayor indica mayor volumen de emparejamientos directos y carga defensiva.',
  },
  {
    id: 'dFgm',
    label: 'DFGM/PJ · Canastas rivales encajadas como defensor',
    shortLabel: 'DFGM/PJ',
    unit: '',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'both',
    helpKey: 'dFgPct',
    description: 'Canastas anotadas por el atacante defendido directamente por partido.',
  },
  {
    id: 'dFgPct',
    label: 'DFG% · % Acierto permitido al tirador defendido',
    shortLabel: 'DFG%',
    unit: '%',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'both',
    helpKey: 'dFgPct',
    description: 'Porcentaje real de tiro que logran los oponentes cuando son punteados directamente.',
    interpretation: 'MENOR ES MEJOR: Indica capacidad para incomodar y bajar porcentajes rivales.',
  },
  {
    id: 'normalFgPct',
    label: 'FG% Esperado · % Habitual de los tiradores defendidos',
    shortLabel: 'FG% Esp.',
    unit: '%',
    decimals: 1,
    category: 'defense',
    scope: 'both',
    helpKey: 'dFgPct',
    description: 'Porcentaje medio que suelen meter esos mismos tiradores frente a toda la liga.',
  },
  {
    id: 'pctPlusMinus',
    label: 'Diff% (DFG) · Reducción del % tiro rival',
    shortLabel: 'Diff% DFG',
    unit: '%',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'both',
    helpKey: 'dFgPct',
    description: 'Diferencia entre DFG% y FG% esperado. Negativo significa que baja el acierto del atacante.',
    interpretation: 'MENOR (MÁS NEGATIVO) ES MEJOR: -3.0% o inferior indica élite defensiva punteando tiros.',
  },
  {
    id: 'defFreq',
    label: 'Frec. Def. · % Tiros rivales defendidos',
    shortLabel: 'Frec. Def.',
    unit: '%',
    decimals: 1,
    category: 'defense',
    scope: 'both',
    helpKey: 'dFgPct',
    description: 'Frecuencia con la que asume el emparejamiento directo sobre el lanzador.',
  },
  {
    id: 'oppPts',
    label: 'Opp PTS · Puntos totales permitidos al rival / PJ',
    shortLabel: 'Opp PTS',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'team',
    helpKey: 'oppStats',
    description: 'Anotación media del equipo contrario.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'oppFgPct',
    label: 'Opp FG% · % Tiros de campo permitidos al rival',
    shortLabel: 'Opp FG%',
    unit: '%',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'team',
    helpKey: 'oppStats',
    description: 'Porcentaje de tiro de campo que logra el adversario.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'oppFg3Pct',
    label: 'Opp 3P% · % Triples permitidos al rival',
    shortLabel: 'Opp 3P%',
    unit: '%',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'team',
    helpKey: 'oppStats',
    description: 'Acierto exterior que permite la defensa perimetral.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'oppReb',
    label: 'Opp REB · Rebotes concedidos al rival / PJ',
    shortLabel: 'Opp REB',
    unit: '',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'team',
    helpKey: 'oppStats',
    description: 'Total de rebotes capturados por los adversarios.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'oppAst',
    label: 'Opp AST · Asistencias concedidas al rival / PJ',
    shortLabel: 'Opp AST',
    unit: '',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'team',
    helpKey: 'oppStats',
    description: 'Pases de canasta que logra generar el oponente.',
    interpretation: 'MENOR ES MEJOR: Indica buena defensa sin ayudas tardías.',
  },
  {
    id: 'oppTov',
    label: 'Opp TOV · Pérdidas provocadas al rival / PJ',
    shortLabel: 'Opp TOV',
    unit: '',
    decimals: 1,
    category: 'defense',
    scope: 'team',
    helpKey: 'oppStats',
    description: 'Balones perdidos forzados al equipo contrario por partido.',
    interpretation: 'Mayor es mejor: Defensa disruptiva y agresiva.',
  },
  {
    id: 'oppPtsPaint',
    label: 'Opp Pintura · Puntos rivales recibidos en pintura',
    shortLabel: 'Opp Pintura',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'both',
    helpKey: 'oppPtsPaint',
    description: 'Puntos interiores concedidos en la zona restringida.',
    interpretation: 'MENOR ES MEJOR: Alta protección de aro.',
  },
  {
    id: 'oppPtsFb',
    label: 'Opp Contraat. · Puntos rivales al contraataque',
    shortLabel: 'Opp Contr.',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'both',
    helpKey: 'oppStats',
    description: 'Puntos recibidos en transición por balance defensivo.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'oppPtsOffTov',
    label: 'Opp x Pérd. · Puntos rivales tras pérdida propia',
    shortLabel: 'Opp x Pérd.',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'both',
    helpKey: 'oppStats',
    description: 'Puntos anotados por el rival aprovechando nuestras pérdidas.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'oppPts2ndChance',
    label: 'Opp 2ª Op. · Puntos rivales en 2ª oportunidad',
    shortLabel: 'Opp 2ª Op.',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    scope: 'both',
    helpKey: 'oppStats',
    description: 'Puntos encajados tras no asegurar el rebote defensivo.',
    interpretation: 'MENOR ES MEJOR.',
  },

  // =========================================================================
  // 8. CLUTCH (<5m, ±5) + BUZZER BEATERS & GAME WINNERS
  // =========================================================================
  {
    id: 'clPts',
    label: 'PTS Clutch · Puntos en últimos 5 min (±5 pts)',
    shortLabel: 'PTS Cl.',
    unit: ' pts',
    decimals: 1,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'Puntos anotados en momentos de máxima tensión (últimos 5 minutos con marcador ≤5 puntos).',
  },
  {
    id: 'clMin',
    label: 'MIN Clutch · Minutos en momentos decisivos',
    shortLabel: 'MIN Cl.',
    unit: ' min',
    decimals: 1,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'Tiempo disputado en pista durante situaciones clutch.',
  },
  {
    id: 'clWPct',
    label: '%V Clutch · % Victorias en finales apretados',
    shortLabel: '%V Cl.',
    unit: '%',
    decimals: 1,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'Porcentaje de partidos ganados cuando el choque llegó igualado al clutch.',
  },
  {
    id: 'clFgPct',
    label: 'FG% Clutch · % Tiros de campo en clutch',
    shortLabel: 'FG% Cl.',
    unit: '%',
    decimals: 1,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'Porcentaje de tiro bajo presión de cierre de partido.',
  },
  {
    id: 'clFg3Pct',
    label: '3P% Clutch · % Triples en momentos decisivos',
    shortLabel: '3P% Cl.',
    unit: '%',
    decimals: 1,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'Acierto desde el triple en los últimos 5 minutos igualados.',
  },
  {
    id: 'clFtPct',
    label: 'FT% Clutch · % Tiros libres bajo máxima presión',
    shortLabel: 'FT% Cl.',
    unit: '%',
    decimals: 1,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'Temple desde la línea de personal para sellar victorias.',
  },
  {
    id: 'clOffRtg',
    label: 'OffRtg Clutch · Eficiencia ofensiva en clutch',
    shortLabel: 'OffRtg Cl.',
    unit: ' pts',
    decimals: 1,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'Puntos anotados cada 100 posesiones en finales apretados.',
  },
  {
    id: 'clDefRtg',
    label: 'DefRtg Clutch · Eficiencia defensiva en clutch',
    shortLabel: 'DefRtg Cl.',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'Puntos permitidos cada 100 posesiones en finales apretados.',
    interpretation: 'MENOR ES MEJOR: Capacidad para cerrar el aro en los minutos finales.',
  },
  {
    id: 'clNetRtg',
    label: 'NetRtg Clutch · Diferencial neto en clutch',
    shortLabel: 'NetRtg Cl.',
    unit: '',
    decimals: 1,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'Balance ofensivo-defensivo por 100 posesiones en los últimos 5 minutos.',
  },
  {
    id: 'clTsPct',
    label: 'TS% Clutch · Acierto real de tiro en clutch',
    shortLabel: 'TS% Cl.',
    unit: '%',
    decimals: 1,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'True Shooting % específico en finales igualados.',
  },
  {
    id: 'clPlusMinus',
    label: '+/- Clutch · Impacto Más/Menos en clutch',
    shortLabel: '+/- Cl.',
    unit: '',
    decimals: 1,
    category: 'clutch',
    scope: 'both',
    helpKey: 'clutch',
    description: 'Diferencial de marcador en situaciones clutch por partido.',
  },
  {
    id: 'buzzerBeaters',
    label: 'Buzzer Beaters (BB) · Tiros ganadores sobre la bocina (0.0s)',
    shortLabel: 'Buzzer B.',
    unit: ' BB',
    decimals: 0,
    category: 'clutch',
    scope: 'both',
    helpKey: 'buzzerBeater',
    description: 'Canastas ganadoras anotadas con el reloj llegando exactamente a 0.0s en 4º cuarto o prórroga.',
  },
  {
    id: 'gameWinners',
    label: 'Game Winners (GW) · Tiros ganadores definitivos (≤10s)',
    shortLabel: 'Game Win.',
    unit: ' GW',
    decimals: 0,
    category: 'clutch',
    scope: 'both',
    helpKey: 'gameWinner',
    description: 'Tiros decisivos anotados en los últimos 10 segundos para poner a su equipo por delante de forma definitiva.',
  },

  // =========================================================================
  // 9. PLAYTYPES (SYNERGY)
  // =========================================================================
  {
    id: 'ptTotalPoss',
    label: 'Pos. Ofensivas/PJ · Posesiones totales Synergy',
    shortLabel: 'Pos. Syn.',
    unit: '',
    decimals: 1,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Total de finalizaciones ofensivas clasificadas por Synergy por partido.',
  },
  {
    id: 'ptTopPpp',
    label: 'Top PPP · Eficiencia en jugada principal',
    shortLabel: 'Top PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión (PPP) conseguidos en la acción táctica más utilizada.',
  },
  {
    id: 'ptSpotupPpp',
    label: 'Spot-Up PPP · Eficiencia en tiros tras pase',
    shortLabel: 'SpotUp PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión ejecutando tiros estáticos o ataques tras recepción.',
  },
  {
    id: 'ptSpotupPct',
    label: 'Spot-Up % · Frecuencia ofensiva en Spot-Up',
    shortLabel: 'SpotUp %',
    unit: '%',
    decimals: 1,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Porcentaje del ataque que proviene de situaciones Spot-Up.',
  },
  {
    id: 'ptPrbhPpp',
    label: 'P&R Manejador PPP · Eficiencia con balón en bloqueo directo',
    shortLabel: 'P&R Man. PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión generados por el manejador en Pick & Roll.',
  },
  {
    id: 'ptPrbhPct',
    label: 'P&R Manejador % · Frecuencia jugando Pick & Roll',
    shortLabel: 'P&R Man. %',
    unit: '%',
    decimals: 1,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Porcentaje de posesiones iniciadas como manejador de Pick & Roll.',
  },
  {
    id: 'ptTransPpp',
    label: 'Transición PPP · Eficiencia al contraataque (Synergy)',
    shortLabel: 'Trans. PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión corriendo en transición ofensiva.',
  },
  {
    id: 'ptIsoPpp',
    label: 'Aislamiento PPP · Eficiencia en aclarados 1c1 (ISO)',
    shortLabel: 'ISO PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión resolviendo situaciones individuales de uno contra uno.',
  },
  {
    id: 'ptPrrPpp',
    label: 'P&R Continuador PPP · Eficiencia continuando al aro/pop',
    shortLabel: 'Roll Man PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión del bloqueador continuando hacia canasta o abriéndose (Roll/Pop).',
  },
  {
    id: 'ptCutPpp',
    label: 'Corte PPP · Eficiencia en cortes sin balón al aro',
    shortLabel: 'Corte PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión recibiendo en movimiento mediante cortes a canasta.',
  },
  {
    id: 'ptPostPpp',
    label: 'Poste Bajo PPP · Eficiencia jugando de espaldas',
    shortLabel: 'Poste PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión atacando al poste bajo.',
  },
  {
    id: 'ptHandoffPpp',
    label: 'Mano a Mano PPP · Eficiencia en Hand-Offs',
    shortLabel: 'Handoff PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión tras entrega mano a mano.',
  },
  {
    id: 'ptOffScrPpp',
    label: 'Salida Bloqueo PPP · Eficiencia saliendo de indirectos',
    shortLabel: 'OffScr PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión recibiendo tras salir de pantallas indirectas.',
  },
  {
    id: 'ptPutbackPpp',
    label: 'Rebote Ofensivo PPP · Eficiencia en palmeos (Putbacks)',
    shortLabel: 'Putback PPP',
    unit: ' PPP',
    decimals: 2,
    category: 'playtypes',
    scope: 'both',
    helpKey: 'ppp',
    description: 'Puntos por posesión finalizando inmediatamente tras capturar rebote ofensivo.',
  },

  // =========================================================================
  // 10. INFRACCIONES, FALTAS Y HITOS
  // =========================================================================
  {
    id: 'totalViolations',
    label: 'Total Violaciones (Tot) · Infracciones de reglamento',
    shortLabel: 'Violac. (Tot)',
    unit: '',
    decimals: 0,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'violationsTotal',
    description: 'Total acumulado en temporada de infracciones reglamentarias (pasos, dobles, 24s, 3s, etc.).',
    interpretation: 'MENOR ES MEJOR: Menos errores no forzados de reglamento.',
  },
  {
    id: 'pf',
    label: 'FP/PJ · Faltas personales cometidas por partido',
    shortLabel: 'FP/PJ',
    unit: ' fp',
    decimals: 1,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'personalFouls',
    description: 'Faltas personales cometidas por partido.',
    interpretation: 'MENOR ES MEJOR: Evita bonus rival y exclusiones por faltas.',
  },
  {
    id: 'pfd',
    label: 'PFD/PJ · Faltas recibidas / provocadas por partido',
    shortLabel: 'PFD/PJ',
    unit: ' pfd',
    decimals: 1,
    category: 'violations',
    scope: 'both',
    helpKey: 'foulsDrawn',
    description: 'Faltas que obliga a cometer al rival atacando con agresividad.',
    interpretation: 'Mayor es mejor: Lleva al rival al bonus y suma viajes al tiro libre.',
  },
  {
    id: 'blka',
    label: 'BLKA/PJ · Tapones recibidos en contra por partido',
    shortLabel: 'Tap. Rec./PJ',
    unit: '',
    decimals: 1,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'blka',
    description: 'Veces que los lanzamientos propios son taponados por el rival.',
    interpretation: 'MENOR ES MEJOR: Mejor selección de tiro y lectura de ayudas.',
  },
  {
    id: 'tov',
    label: 'PER/PJ (Violac.) · Pérdidas totales por partido',
    shortLabel: 'PER/PJ',
    unit: '',
    decimals: 1,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'tov',
    description: 'Pérdidas totales registradas en el módulo oficial de faltas e infracciones.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'travel',
    label: 'Pasos (Tot) · Infracciones por pasos acumuladas',
    shortLabel: 'Pasos',
    unit: '',
    decimals: 0,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'violationsTotal',
    description: 'Violaciones de pasos sancionadas en la temporada.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'doubleDribble',
    label: 'Dobles (Tot) · Doblar bote acumulados',
    shortLabel: 'Dobles',
    unit: '',
    decimals: 0,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'violationsTotal',
    description: 'Infracciones por volver a botar o acompañar el balón sancionadas.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'offThreeSec',
    label: '3s Ataque (Tot) · Infracciones de 3 segundos ofensivos',
    shortLabel: '3s Ataque',
    unit: '',
    decimals: 0,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'violationsTotal',
    description: 'Violaciones por permanecer >3 segundos en la pintura rival.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'defThreeSec',
    label: '3s Defensa (Tot) · Infracciones de 3 segundos defensivos',
    shortLabel: '3s Defensa',
    unit: '',
    decimals: 0,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'violationsTotal',
    description: 'Técnicas por permanecer >3 segundos en pintura sin marcar atacante.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'shotClock',
    label: 'Reloj 24s (Tot) · Agotamiento de posesión',
    shortLabel: 'Reloj 24s',
    unit: '',
    decimals: 0,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'violationsTotal',
    description: 'Posesiones agotadas sin lograr lanzar a tiempo.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'backcourt',
    label: 'Campo Atrás (Tot) · Violaciones de campo atrás',
    shortLabel: 'Campo Atrás',
    unit: '',
    decimals: 0,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'violationsTotal',
    description: 'Pérdidas por devolver el balón a pista trasera.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'offFoul',
    label: 'Falta Ataque (Tot) · Faltas ofensivas cometidas',
    shortLabel: 'Falta Ataque',
    unit: '',
    decimals: 0,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'violationsTotal',
    description: 'Faltas personales sancionadas en ataque (bloqueos móviles, empujones, cargas).',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'chargeViol',
    label: 'Carga Of. (Tot) · Cargas de ataque cometidas',
    shortLabel: 'Carga Of.',
    unit: '',
    decimals: 0,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'violationsTotal',
    description: 'Faltas ofensivas por arrollar a un defensor bien plantado.',
    interpretation: 'MENOR ES MEJOR.',
  },
  {
    id: 'kickedBall',
    label: 'Pie (Tot) · Balones tocados con el pie (Kick Ball)',
    shortLabel: 'Pie (Tot)',
    unit: '',
    decimals: 0,
    lowerIsBetter: true,
    category: 'violations',
    scope: 'both',
    helpKey: 'violationsTotal',
    description: 'Interrupciones de pase tocando el balón con el pie.',
  },
  {
    id: 'dd2',
    label: 'DD2 (Tot) · Dobles-Dobles logrados en temporada',
    shortLabel: 'DD2',
    unit: '',
    decimals: 0,
    category: 'violations',
    scope: 'player',
    helpKey: 'doubleDoubles',
    description: 'Partidos alcanzando ≥10 en dos apartados estadísticos principales.',
  },
  {
    id: 'td3',
    label: 'TD3 (Tot) · Triples-Dobles logrados en temporada',
    shortLabel: 'TD3',
    unit: '',
    decimals: 0,
    category: 'violations',
    scope: 'player',
    helpKey: 'tripleDoubles',
    description: 'Partidos alcanzando ≥10 en tres apartados estadísticos principales.',
  },
];

// Enrich descriptions from global COLUMN_HELP glossary when helpful
export const SCATTER_METRICS_CATALOG: ScatterMetricDefinition[] = RAW_SCATTER_METRICS.map(
  (m) => {
    const help = resolveMetricHelp(m.helpKey || m.id);
    if (!help) return m;
    return {
      ...m,
      description: m.description || help.simpleDesc,
      interpretation:
        m.interpretation || (help.benchmarkText ? `${help.benchmarkText}` : help.calculation),
    };
  }
);

export function getScatterMetricsForScope(
  scope: 'team' | 'player'
): ScatterMetricDefinition[] {
  return SCATTER_METRICS_CATALOG.filter(
    (m) => m.scope === scope || m.scope === 'both'
  );
}

export interface GroupedScatterMetrics {
  id: StatLayerCategory;
  label: string;
  metrics: ScatterMetricDefinition[];
}

export function getGroupedScatterMetrics(
  scope: 'team' | 'player'
): GroupedScatterMetrics[] {
  const scoped = getScatterMetricsForScope(scope);
  return SCATTER_LAYER_ORDER.map((catId) => ({
    id: catId,
    label: getStatLayerCategoryLabel(catId, scope),
    metrics: scoped.filter((m) => m.category === catId),
  })).filter((g) => g.metrics.length > 0);
}

export function findScatterMetric(
  id: string,
  scope: 'team' | 'player'
): ScatterMetricDefinition {
  const scoped = getScatterMetricsForScope(scope);
  return (
    scoped.find((m) => m.id === id) ||
    SCATTER_METRICS_CATALOG.find((m) => m.id === id) ||
    scoped[0]
  );
}

function numOrNull(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolves any Team metric from the 10 official layers, returning null when
 * an advanced snapshot entry is genuinely absent so it isn't plotted as a fake 0.
 */
export function resolveTeamScatterMetricValue(
  team: TeamWithSnapshot,
  metricId: string,
  decimals = 1
): number | null {
  const games = team.games || [];
  const adv = team.advanced;
  const ff = team.advFourFactors;
  const defH = team.advDefHustle;

  const r = (v: number | null): number | null =>
    v === null || Number.isNaN(v) ? null : roundDecimals(v, decimals);

  switch (metricId) {
    // 1. Básicas & Balance
    case 'winPct':
      return r(team.winPct * 100);
    case 'avgPointsFor':
      return r(
        team.avgPointsFor ||
          (games.length > 0 ? mean(games.map((g) => g.pointsFor)) : null)
      );
    case 'avgPointsAgainst':
      return r(
        team.avgPointsAgainst ||
          (games.length > 0 ? mean(games.map((g) => g.pointsAgainst)) : null)
      );
    case 'differential':
      return r(team.differential);
    case 'fgPct': {
      const a = games.reduce((s, g) => s + g.fga, 0);
      const m = games.reduce((s, g) => s + g.fgm, 0);
      return a > 0 ? r((m / a) * 100) : null;
    }
    case 'fg3mAvg':
      return games.length > 0 ? r(mean(games.map((g) => g.fg3m))) : null;
    case 'fg3aAvg':
      return games.length > 0 ? r(mean(games.map((g) => g.fg3a))) : null;
    case 'fg3Pct': {
      const a = games.reduce((s, g) => s + g.fg3a, 0);
      const m = games.reduce((s, g) => s + g.fg3m, 0);
      return a > 0 ? r((m / a) * 100) : null;
    }
    case 'ftPct': {
      const a = games.reduce((s, g) => s + g.fta, 0);
      const m = games.reduce((s, g) => s + g.ftm, 0);
      return a > 0 ? r((m / a) * 100) : null;
    }
    case 'rebAvg':
      return games.length > 0 ? r(mean(games.map((g) => g.reb))) : null;
    case 'orebAvg':
      return games.length > 0 ? r(mean(games.map((g) => g.oreb))) : null;
    case 'drebAvg':
      return games.length > 0 ? r(mean(games.map((g) => g.dreb))) : null;
    case 'astAvg':
      return games.length > 0 ? r(mean(games.map((g) => g.ast))) : null;
    case 'stlAvg':
      return games.length > 0 ? r(mean(games.map((g) => g.stl))) : null;
    case 'blkAvg':
      return games.length > 0 ? r(mean(games.map((g) => g.blk))) : null;
    case 'tovAvg':
      return games.length > 0 ? r(mean(games.map((g) => g.tov))) : null;

    // 2. Avanzadas / 4 Factores
    case 'offRtg':
      return r(
        numOrNull(ff?.offRtg) ??
          numOrNull(adv?.offRtg) ??
          (games.length > 0 ? mean(games.map((g) => g.offRtg)) : null)
      );
    case 'defRtg':
      return r(
        numOrNull(ff?.defRtg) ??
          numOrNull(adv?.defRtg) ??
          (games.length > 0 ? mean(games.map((g) => g.defRtg)) : null)
      );
    case 'netRtg': {
      const n = numOrNull(ff?.netRtg) ?? numOrNull(adv?.netRtg);
      if (n !== null) return r(n);
      const off = numOrNull(adv?.offRtg);
      const def = numOrNull(adv?.defRtg);
      if (off !== null && def !== null) return r(off - def);
      return games.length > 0 ? r(mean(games.map((g) => g.netRtg))) : null;
    }
    case 'pace':
      return r(
        numOrNull(ff?.pace) ??
          numOrNull(adv?.pace) ??
          (games.length > 0 ? mean(games.map((g) => g.pace)) : null)
      );
    case 'efgPct':
      return r(
        numOrNull(ff?.efgPct) ??
          numOrNull(adv?.efgPct) ??
          (games.length > 0 ? mean(games.map((g) => g.efgPct)) : null)
      );
    case 'tsPct':
      return r(
        numOrNull(ff?.tsPct) ??
          numOrNull(adv?.tsPct) ??
          (games.length > 0 ? mean(games.map((g) => g.tsPct)) : null)
      );
    case 'astPct':
      return r(numOrNull(ff?.astPct) ?? numOrNull(adv?.astPct));
    case 'astRatio':
      return r(numOrNull(ff?.astRatio) ?? numOrNull(adv?.astRatio));
    case 'astTovRatio': {
      const v = numOrNull(ff?.astTo) ?? numOrNull(adv?.astTo);
      if (v !== null) return r(v);
      if (games.length === 0) return null;
      const a = mean(games.map((g) => g.ast));
      const tov = mean(games.map((g) => g.tov));
      return tov > 0 ? r(a / tov) : r(a);
    }
    case 'tovPct':
      return r(numOrNull(ff?.tmTovPct) ?? numOrNull(adv?.tovPct));
    case 'orebPct':
      return r(numOrNull(ff?.orebPct) ?? numOrNull(adv?.orebPct));
    case 'drebPct':
      return r(numOrNull(ff?.drebPct) ?? numOrNull(adv?.drebPct));
    case 'rebPct':
      return r(numOrNull(ff?.rebPct) ?? numOrNull(adv?.rebPct));
    case 'pie':
      return r(numOrNull(ff?.pie) ?? numOrNull(adv?.pie));
    case 'ftaRate':
      return r(numOrNull(ff?.ftaRate));

    // 3. Scoring legacy id
    case 'pctPts3p': {
      const scVal = numOrNull(team.advScoring?.pctPts3pt);
      if (scVal !== null) return r(scVal);
      const pts = team.avgPointsFor || mean(games.map((g) => g.pointsFor));
      const fg3m = mean(games.map((g) => g.fg3m));
      return pts > 0 ? r(((fg3m * 3) / pts) * 100) : null;
    }

    // 5 & 6 & 7 & 8 & 9 & 10 extra fields not explicitly switched in entityFilters
    case 'rebChancePctAdj':
      return r(numOrNull(team.advTracking?.rebChancePctAdj));
    case 'defWs':
      return r(numOrNull(defH?.defWs));
    case 'ptTotalPoss':
      return r(numOrNull(team.advPlaytypes?.totalPossOff));
    case 'buzzerBeaters':
      return team.heroicLoaded || typeof team.buzzerBeaters === 'number'
        ? team.buzzerBeaters ?? 0
        : null;
    case 'gameWinners':
      return team.heroicLoaded || typeof team.gameWinners === 'number'
        ? team.gameWinners ?? 0
        : null;

    default: {
      const resolved = getFilterMetricValue(team, metricId, true);
      return r(resolved);
    }
  }
}

/**
 * Resolves any Player metric across game logs + the 10 NBA.com advanced layers.
 */
export function resolvePlayerScatterMetricValue(
  player: PlayerWithSnapshot,
  metricId: string,
  decimals = 1
): number | null {
  const games = player.games || [];
  const adv = player.advanced;
  const ff = player.advFourFactors;
  const defH = player.advDefHustle;

  const r = (v: number | null): number | null =>
    v === null || Number.isNaN(v) ? null : roundDecimals(v, decimals);

  // Check if it's a game-log metric defined in STREAK_METRIC_OPTIONS
  const streakOpt = STREAK_MAP.get(metricId);
  if (streakOpt) {
    if (games.length === 0) return null;
    return r(mean(games.map((g) => streakOpt.getValue(g))));
  }

  switch (metricId) {
    // 2. Official NBA.com advanced ratings for players
    case 'offRtg':
      return r(numOrNull(ff?.offRtg) ?? numOrNull(adv?.offRtg));
    case 'defRtg':
      return r(numOrNull(ff?.defRtg) ?? numOrNull(adv?.defRtg));
    case 'netRtg':
      return r(numOrNull(ff?.netRtg) ?? numOrNull(adv?.netRtg));
    case 'pace':
      return r(numOrNull(ff?.pace) ?? numOrNull(adv?.pace));
    case 'pie':
      return r(numOrNull(ff?.pie) ?? numOrNull(adv?.pie));
    case 'astPct':
      return r(numOrNull(ff?.astPct) ?? numOrNull(adv?.astPct));
    case 'astRatio':
      return r(numOrNull(ff?.astRatio) ?? numOrNull(adv?.astRatio));
    case 'tovPct':
      return r(numOrNull(ff?.tmTovPct) ?? numOrNull(adv?.tovPct));
    case 'orebPct':
      return r(numOrNull(ff?.orebPct) ?? numOrNull(adv?.orebPct));
    case 'drebPct':
      return r(numOrNull(ff?.drebPct) ?? numOrNull(adv?.drebPct));
    case 'rebPct':
      return r(numOrNull(ff?.rebPct) ?? numOrNull(adv?.rebPct));
    case 'ftaRate':
      return r(numOrNull(ff?.ftaRate));

    // Tracking & Defense & Playtypes & Heroic & Milestones extras
    case 'rebChancePctAdj':
      return r(numOrNull(player.advTracking?.rebChancePctAdj));
    case 'defWs':
      return r(numOrNull(defH?.defWs));
    case 'ptTotalPoss':
      return r(numOrNull(player.advPlaytypes?.totalPossOff));
    case 'buzzerBeaters':
      return player.heroicLoaded || typeof player.buzzerBeaters === 'number'
        ? player.buzzerBeaters ?? 0
        : null;
    case 'gameWinners':
      return player.heroicLoaded || typeof player.gameWinners === 'number'
        ? player.gameWinners ?? 0
        : null;

    case 'dd2': {
      const fromSnap = numOrNull(player.advViolations?.dd2);
      if (fromSnap !== null) return r(fromSnap);
      if (games.length === 0) return null;
      let count = 0;
      for (const g of games) {
        const cats = [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter(
          (v) => v >= 10
        ).length;
        if (cats >= 2) count += 1;
      }
      return count;
    }
    case 'td3': {
      const fromSnap = numOrNull(player.advViolations?.td3);
      if (fromSnap !== null) return r(fromSnap);
      if (games.length === 0) return null;
      let count = 0;
      for (const g of games) {
        const cats = [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter(
          (v) => v >= 10
        ).length;
        if (cats >= 3) count += 1;
      }
      return count;
    }
    default: {
      const resolved = getFilterMetricValue(player, metricId, false);
      return r(resolved);
    }
  }
}
