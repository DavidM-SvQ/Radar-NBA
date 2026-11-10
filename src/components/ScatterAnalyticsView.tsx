import React, { useMemo, useState } from 'react';
import {
  LayoutGrid,
  Search,
  Users,
  RotateCcw,
  TrendingUp,
  Filter,
  Shield,
  ArrowRight,
  Flame,
  Zap,
  Target,
  Activity,
  Layers,
  Info,
  SlidersHorizontal,
  ChevronDown,
  Sparkles,
  HelpCircle,
  BarChart2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import type {
  ExperienceMode,
  PlayerSummary,
  TeamSummary,
  WindowSize,
} from '../types/nba';
import {
  mean,
  normalizeSearchText,
  round1,
} from '../utils/analytics';
import {
  STREAK_METRIC_OPTIONS,
  type StreakMetricOption,
} from '../utils/streakMetricsCatalog';
import { NBA_TEAMS_MAP, getTeamLogoUrls } from '../utils/teamLogos';
import { PlayerAvatar, TeamLogo } from './NbaVisuals';
import { ExportImageButton } from './ExportImageButton';
import { buildTableSnapshotBlob } from '../utils/exportImageCard';
import { type LeagueBenchmarks } from '../utils/humanize';

const TEAM_TO_DIV: Record<string, string> = {
  BOS: 'Atlantic', BKN: 'Atlantic', NYK: 'Atlantic', PHI: 'Atlantic', TOR: 'Atlantic',
  CHI: 'Central', CLE: 'Central', DET: 'Central', IND: 'Central', MIL: 'Central',
  ATL: 'Southeast', CHA: 'Southeast', MIA: 'Southeast', ORL: 'Southeast', WAS: 'Southeast',
  DEN: 'Northwest', MIN: 'Northwest', OKC: 'Northwest', POR: 'Northwest', UTA: 'Northwest',
  GSW: 'Pacific', LAC: 'Pacific', LAL: 'Pacific', PHX: 'Pacific', SAC: 'Pacific',
  DAL: 'Southwest', HOU: 'Southwest', MEM: 'Southwest', NOP: 'Southwest', SAS: 'Southwest',
};

const DIVISIONS = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'];

function getTeamScatterLogoUrl(abbr: string): string {
  const cleanAbbr = (abbr || 'NBA').toUpperCase().trim();
  const meta = NBA_TEAMS_MAP[cleanAbbr];
  if (meta?.espnSlug) {
    return `https://a.espncdn.com/i/teamlogos/nba/500/${meta.espnSlug}.png`;
  }
  return `https://a.espncdn.com/i/teamlogos/nba/500/${cleanAbbr.toLowerCase()}.png`;
}

interface EnrichedTeamMetricData {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  conference: 'Este' | 'Oeste';
  division: string;
  wins: number;
  losses: number;
  winPct: number;
  streakCode: string;
  stats: Record<string, number>;
}

export interface TeamMetricDefinition {
  id: string;
  label: string;
  shortLabel: string;
  unit: string;
  decimals: number;
  lowerIsBetter?: boolean;
  category: 'efficiency' | 'scoring' | 'perimeter' | 'playmaking' | 'defense' | 'pace';
  description: string;
  interpretation?: string;
  getValue: (t: TeamSummary) => number;
}

export const TEAM_METRIC_DEFINITIONS: TeamMetricDefinition[] = [
  {
    id: 'offRtg',
    label: 'OffRtg · Eficiencia Ofensiva (pts/100 pos)',
    shortLabel: 'OffRtg',
    unit: ' pts',
    decimals: 1,
    category: 'efficiency',
    description: 'Puntos anotados por cada 100 posesiones. Mide la eficacia ofensiva real aislando el ritmo.',
    interpretation: 'Mayor es mejor: Más de 115 pts/100 pos representa un ataque de élite de la NBA.',
    getValue: (t) => t.advanced?.offRtg ?? t.offRtg ?? round1(mean(t.games.map((g) => g.offRtg))),
  },
  {
    id: 'defRtg',
    label: 'DefRtg · Eficiencia Defensiva (pts/100 pos)',
    shortLabel: 'DefRtg',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'efficiency',
    description: 'Puntos permitidos por cada 100 posesiones defensivas. Mide la solidez defensiva independiente del ritmo de juego.',
    interpretation: '🚨 MENOR ES MEJOR: Cuanto más bajo sea el número, menos puntos recibe el equipo y mejor es su defensa. Menos de 112 pts/100 pos es defensa élite. Se invierte el eje para situar lo mejor arriba.',
    getValue: (t) => t.advanced?.defRtg ?? t.defRtg ?? round1(mean(t.games.map((g) => g.defRtg))),
  },
  {
    id: 'netRtg',
    label: 'NetRtg · Diferencial Neto (Off - Def)',
    shortLabel: 'NetRtg',
    unit: '',
    decimals: 1,
    category: 'efficiency',
    description: 'Margen neto de puntos por 100 posesiones (OffRtg menos DefRtg). Es el indicador más predictivo de campeones.',
    interpretation: 'Mayor es mejor: Superior a +5.0 denota franquicias candidatas al título (contenders).',
    getValue: (t) => t.advanced?.netRtg ?? t.netRtg ?? round1((t.advanced?.offRtg ?? 114) - (t.advanced?.defRtg ?? 114)),
  },
  {
    id: 'pace',
    label: 'Pace · Ritmo de juego (Posesiones/48m)',
    shortLabel: 'Pace',
    unit: ' pos',
    decimals: 1,
    category: 'pace',
    description: 'Posesiones disputadas por cada 48 minutos de partido. Mide la velocidad del juego, no la calidad.',
    interpretation: 'Informativo: Más de 101 posesiones indica ritmo vertiginoso; menos de 97, juego pausado a media cancha.',
    getValue: (t) => t.advanced?.pace ?? t.pace ?? round1(mean(t.games.map((g) => g.pace))),
  },
  {
    id: 'winPct',
    label: '% Victorias (Balance de temporada)',
    shortLabel: '% Victorias',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    description: 'Porcentaje de partidos ganados respecto al total disputado en la temporada seleccionada.',
    interpretation: 'Mayor es mejor: Más del 60% garantiza playoffs directos con factor cancha.',
    getValue: (t) => round1(t.winPct * 100),
  },
  {
    id: 'avgPointsFor',
    label: 'PTS Favor · Puntos anotados por partido',
    shortLabel: 'PTS Favor',
    unit: ' pts',
    decimals: 1,
    category: 'scoring',
    description: 'Promedio de puntos anotados por encuentro.',
    interpretation: 'Mayor es mejor: Volumen directo de anotación ofensiva.',
    getValue: (t) => t.avgPointsFor || round1(mean(t.games.map((g) => g.pointsFor))),
  },
  {
    id: 'avgPointsAgainst',
    label: 'PTS Contra · Puntos recibidos por partido',
    shortLabel: 'PTS Contra',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    description: 'Promedio de puntos recibidos por encuentro.',
    interpretation: '🚨 MENOR ES MEJOR: Menos de 110 puntos encajados indica alta contención defensiva. Eje invertido.',
    getValue: (t) => t.avgPointsAgainst || round1(mean(t.games.map((g) => g.pointsAgainst))),
  },
  {
    id: 'differential',
    label: 'Diferencial · Margen de puntos por partido',
    shortLabel: 'Margen PTS',
    unit: ' pts',
    decimals: 1,
    category: 'scoring',
    description: 'Diferencia media entre puntos anotados y recibidos por partido.',
    interpretation: 'Mayor es mejor: Positivo indica victorias dominantes.',
    getValue: (t) => t.differential,
  },
  {
    id: 'efgPct',
    label: 'eFG% · Tiro de Campo Efectivo',
    shortLabel: 'eFG%',
    unit: '%',
    decimals: 1,
    category: 'perimeter',
    description: 'Porcentaje de tiro que premia el valor del triple otorgándole un 50% extra de peso: (FGM + 0.5*3PM) / FGA.',
    interpretation: 'Mayor es mejor: Superior al 55% sitúa al equipo en la aristocracia del tiro.',
    getValue: (t) => t.advanced?.efgPct ?? t.efgPct ?? round1(mean(t.games.map((g) => g.efgPct))),
  },
  {
    id: 'tsPct',
    label: 'TS% · Acierto de Tiro Verdadero',
    shortLabel: 'TS%',
    unit: '%',
    decimals: 1,
    category: 'perimeter',
    description: 'True Shooting %: Mide la eficiencia global del tiro combinando tiros de 2, triples y tiros libres.',
    interpretation: 'Mayor es mejor: Por encima del 58% es eficiencia ofensiva superlativa.',
    getValue: (t) => t.advanced?.tsPct ?? t.tsPct ?? round1(mean(t.games.map((g) => g.tsPct))),
  },
  {
    id: 'fg3mAvg',
    label: '3PM · Triples convertidos por partido',
    shortLabel: '3PM/PJ',
    unit: ' 3PM',
    decimals: 1,
    category: 'perimeter',
    description: 'Promedio de canastas de tres puntos anotadas por partido.',
    interpretation: 'Mayor es mejor: Más de 14 triples anotados por partido refleja gran peligro exterior.',
    getValue: (t) => round1(mean(t.games.map((g) => g.fg3m))),
  },
  {
    id: 'fg3aAvg',
    label: '3PA · Triples intentados por partido',
    shortLabel: '3PA/PJ',
    unit: ' 3PA',
    decimals: 1,
    category: 'perimeter',
    description: 'Volumen de tiros exteriores lanzados por partido.',
    interpretation: 'Volumen: Equipos modernos lanzan entre 35 y 45 triples por choque.',
    getValue: (t) => round1(mean(t.games.map((g) => g.fg3a))),
  },
  {
    id: 'fg3Pct',
    label: '3P% · Acierto desde el triple',
    shortLabel: '3P%',
    unit: '%',
    decimals: 1,
    category: 'perimeter',
    description: 'Porcentaje de acierto en tiros de tres puntos.',
    interpretation: 'Mayor es mejor: Más del 37.5% es puntería letal desde el perímetro.',
    getValue: (t) => {
      const a = t.games.reduce((s, g) => s + g.fg3a, 0);
      const m = t.games.reduce((s, g) => s + g.fg3m, 0);
      return a > 0 ? round1((m / a) * 100) : 36.0;
    },
  },
  {
    id: 'pctPts3p',
    label: '% Pts 3P · Porcentaje de puntos en triples',
    shortLabel: '% Pts 3P',
    unit: '%',
    decimals: 1,
    category: 'perimeter',
    description: 'Proporción de los puntos totales de un equipo que provienen de más allá del arco.',
    interpretation: 'Informativo: Más del 36% revela fuerte dependencia táctica del tiro exterior.',
    getValue: (t) => {
      const pts = t.avgPointsFor || mean(t.games.map((g) => g.pointsFor));
      const fg3m = mean(t.games.map((g) => g.fg3m));
      return pts > 0 ? round1(((fg3m * 3) / pts) * 100) : 33.0;
    },
  },
  {
    id: 'ptsPaint',
    label: 'PTS Pintura · Puntos en la zona interior',
    shortLabel: 'PTS Pintura',
    unit: ' pts',
    decimals: 1,
    category: 'scoring',
    description: 'Puntos anotados en la zona restringida y pintura rival por encuentro.',
    interpretation: 'Mayor es mejor: Refleja poderío físico, penetraciones y juego de pívots interiores.',
    getValue: (t) => t.advanced?.ptsPaint ?? 48.0,
  },
  {
    id: 'oppPtsPaint',
    label: 'Pintura Rival · Puntos interiores permitidos',
    shortLabel: 'Pintura Rival',
    unit: ' pts',
    decimals: 1,
    lowerIsBetter: true,
    category: 'defense',
    description: 'Puntos en la pintura que concede el equipo a sus oponentes por partido.',
    interpretation: '🚨 MENOR ES MEJOR: Menos de 46 puntos encajados indica gran protección de aro (rim protection). Eje invertido.',
    getValue: (t) => t.advanced?.oppPtsPaint ?? 48.0,
  },
  {
    id: 'pts2ndChance',
    label: 'PTS 2ª Oportunidad · Canastas tras rebote ofensivo',
    shortLabel: '2ª Oportunidad',
    unit: ' pts',
    decimals: 1,
    category: 'scoring',
    description: 'Puntos obtenidos en segundas opciones tras capturar el rebote de ataque.',
    interpretation: 'Mayor es mejor: Más de 15 puntos refleja dominio absoluto bajo los tableros.',
    getValue: (t) => t.advanced?.pts2ndChance ?? 13.5,
  },
  {
    id: 'ptsFastBreak',
    label: 'PTS Contraataque · Transición rápida',
    shortLabel: 'PTS Contrataque',
    unit: ' pts',
    decimals: 1,
    category: 'scoring',
    description: 'Puntos sumados en transición rápida antes de que la defensa rival se estructure.',
    interpretation: 'Mayor es mejor: Castigo directo de robos y rebotes vivos en velocidad.',
    getValue: (t) => t.advanced?.ptsFastBreak ?? 14.5,
  },
  {
    id: 'astAvg',
    label: 'AST · Asistencias repartidas por partido',
    shortLabel: 'AST/PJ',
    unit: ' ast',
    decimals: 1,
    category: 'playmaking',
    description: 'Promedio de pases de canasta convertidos por partido.',
    interpretation: 'Mayor es mejor: Más de 27 asistencias evidencia circulación colectiva altruista.',
    getValue: (t) => round1(mean(t.games.map((g) => g.ast))),
  },
  {
    id: 'astPct',
    label: 'AST% · Porcentaje de canastas asistidas',
    shortLabel: 'AST%',
    unit: '%',
    decimals: 1,
    category: 'playmaking',
    description: 'Porcentaje de tiros de campo anotados que nacieron de una asistencia previa.',
    interpretation: 'Mayor es mejor: Más del 65% indica baloncesto fluido de pase frente al uno contra uno aislado.',
    getValue: (t) => t.advanced?.astPct ?? 62.0,
  },
  {
    id: 'astTovRatio',
    label: 'Ratio AST/TO · Asistencias por pérdida',
    shortLabel: 'Ratio AST/TO',
    unit: '',
    decimals: 2,
    category: 'playmaking',
    description: 'Relación entre asistencias repartidas y pérdidas sufridas (AST / TOV). Mide la salud organizativa.',
    interpretation: 'Mayor es mejor: Por encima de 2.0 indica máxima precisión con mínimos errores no forzados.',
    getValue: (t) => {
      const a = mean(t.games.map((g) => g.ast));
      const tov = mean(t.games.map((g) => g.tov));
      return tov > 0 ? round1((a / tov) * 10) / 10 : 1.8;
    },
  },
  {
    id: 'tovPct',
    label: 'TOV% · Porcentaje de posesiones perdidas',
    shortLabel: 'TOV%',
    unit: '%',
    decimals: 1,
    lowerIsBetter: true,
    category: 'playmaking',
    description: 'Porcentaje de posesiones jugadas que concluyen en pérdida de balón.',
    interpretation: '🚨 MENOR ES MEJOR: Menos del 12.5% denota ataque disciplinado que protege el balón. Eje invertido.',
    getValue: (t) => t.advanced?.tovPct ?? 13.5,
  },
  {
    id: 'orebPct',
    label: 'OREB% · Porcentaje de rebote ofensivo',
    shortLabel: 'OREB%',
    unit: '%',
    decimals: 1,
    category: 'scoring',
    description: 'Porcentaje de rebotes de ataque capturados respecto a los disponibles en el aro rival.',
    interpretation: 'Mayor es mejor: Más del 28% otorga posesiones extra y tiros de alta probabilidad.',
    getValue: (t) => t.advanced?.orebPct ?? 27.0,
  },
  {
    id: 'drebPct',
    label: 'DREB% · Porcentaje de rebote defensivo',
    shortLabel: 'DREB%',
    unit: '%',
    decimals: 1,
    category: 'defense',
    description: 'Porcentaje de rebotes capturados en el propio aro evitando segundas opciones al oponente.',
    interpretation: 'Mayor es mejor: Cerrar el rebote defensivo por encima del 75% es vital para ganar.',
    getValue: (t) => t.advanced?.drebPct ?? 72.5,
  },
  {
    id: 'stlAvg',
    label: 'STL · Robos de balón por partido',
    shortLabel: 'STL/PJ',
    unit: ' stl',
    decimals: 1,
    category: 'defense',
    description: 'Balones recuperados activamente por partido.',
    interpretation: 'Mayor es mejor: Presión agresiva en líneas de pase y bote rival.',
    getValue: (t) => round1(mean(t.games.map((g) => g.stl))),
  },
  {
    id: 'blkAvg',
    label: 'BLK · Tapones colocados por partido',
    shortLabel: 'BLK/PJ',
    unit: ' blk',
    decimals: 1,
    category: 'defense',
    description: 'Lanzamientos taponados al rival por partido.',
    interpretation: 'Mayor es mejor: Intimidación defensiva en la pintura.',
    getValue: (t) => round1(mean(t.games.map((g) => g.blk))),
  },
];

export interface TeamPresetOption {
  id: string;
  label: string;
  desc: string;
  xMetric: string;
  yMetric: string;
  sizeMetric: string;
  quadrants: { tr: string; tl: string; br: string; bl: string };
}

export const TEAM_PRESETS: TeamPresetOption[] = [
  {
    id: 'contenders',
    label: '1. Aspirantes Élite (OffRtg vs DefRtg)',
    desc: 'El mapa maestro de la liga: En DefRtg menor es mejor, por lo que el eje Y se invierte. El cuadrante superior derecho contiene a los verdaderos aspirantes al anillo.',
    xMetric: 'offRtg',
    yMetric: 'defRtg',
    sizeMetric: 'winPct',
    quadrants: {
      tr: 'Aspirantes al Anillo (Ataque y Defensa Élite)',
      tl: 'Fortalezas Defensivas (Defensa Top, Ataque Moderado)',
      br: 'Ataque Desbocado (Mucho Gol, Brecha Defensiva)',
      bl: 'Zona de Reconstrucción (Dificultades Globales)',
    },
  },
  {
    id: 'pace_net',
    label: '2. Ritmo vs Dominio (Pace vs NetRtg)',
    desc: '¿Jugar a mayor velocidad de posesiones garantiza dominar los partidos?',
    xMetric: 'pace',
    yMetric: 'netRtg',
    sizeMetric: 'winPct',
    quadrants: {
      tr: 'Showtime Eficiente (Rápido y Dominante)',
      tl: 'Control y Ejecución (Lento y Dominante)',
      br: 'Caos Ineficiente (Rápido y En Contra)',
      bl: 'Lento y Vulnerable',
    },
  },
  {
    id: 'perimeter',
    label: '3. Triple: Dependencia vs Puntería (3P% vs % Pts 3P)',
    desc: 'Equipos que tiran mucho de tres vs los que realmente castigan con alto acierto.',
    xMetric: 'pctPts3p',
    yMetric: 'fg3Pct',
    sizeMetric: 'fg3mAvg',
    quadrants: {
      tr: 'Artillería Pesada (Alto Volumen y Acierto)',
      tl: 'Francotiradores Selectivos (Tiran Poco pero Aciertan)',
      br: 'Dependencia Excesiva (Volumen sin Puntería)',
      bl: 'Ataque Interior / Tradicional',
    },
  },
  {
    id: 'playmaking',
    label: '4. Creación vs Pérdidas (AST/TO vs TOV%)',
    desc: 'Circulación colectiva frente al cuidado meticuloso de la posesión. En TOV% menor es mejor (eje Y invertido).',
    xMetric: 'astTovRatio',
    yMetric: 'tovPct',
    sizeMetric: 'astAvg',
    quadrants: {
      tr: 'Circulación Élite y Máxima Seguridad',
      tl: 'Ataques Seguros de Pocas Pérdidas',
      br: 'Pase Creativo con Riesgo de Balón',
      bl: 'Ataques Descuidados con Pérdidas Altas',
    },
  },
  {
    id: 'paint_physical',
    label: '5. Pintura y Físico (PTS Pintura vs 2ª Oport.)',
    desc: 'Dominio de la zona interior y castigo directo en el rebote ofensivo.',
    xMetric: 'ptsPaint',
    yMetric: 'pts2ndChance',
    sizeMetric: 'orebPct',
    quadrants: {
      tr: 'Gigantes de la Zona (Pintura + Rebote Ofensivo)',
      tl: 'Especialistas en Segundas Opciones',
      br: 'Penetraciones Directas al Aro',
      bl: 'Ataque de Perímetro y Media Distancia',
    },
  },
];

interface PlayerPresetOption {
  id: string;
  label: string;
  desc: string;
  xMetric: string;
  yMetric: string;
  sizeMetric: string;
  quadrants: { tr: string; tl: string; br: string; bl: string };
}

const PLAYER_PRESETS: PlayerPresetOption[] = [
  {
    id: 'usage_efficiency',
    label: '1. Uso vs Eficiencia (USG% vs TS%)',
    desc: 'La matriz definitiva: 1ª espadas que mantienen alta eficiencia con mucho balón.',
    xMetric: 'usgEst',
    yMetric: 'tsPct',
    sizeMetric: 'points',
    quadrants: {
      tr: 'Superestrellas Élite (Alto Uso y Eficiencia)',
      tl: 'Finalizadores Letales / Rol Eficiente',
      br: 'Alto Volumen / Baja Eficiencia',
      bl: 'Defensivos y Apoyo Táctico',
    },
  },
  {
    id: 'minutes_scoring',
    label: '2. Puntos vs Minutos (MIN vs PTS)',
    desc: 'Capacidad de anotación bruta y productividad por tiempo en cancha.',
    xMetric: 'minutes',
    yMetric: 'points',
    sizeMetric: 'gameScore',
    quadrants: {
      tr: 'Máximos Anotadores Titulares',
      tl: 'Microondas de Banquillo',
      br: 'Especialistas Defensivos / Minutos Altos',
      bl: 'Rotación Secundaria',
    },
  },
  {
    id: 'perimeter_shooters',
    label: '3. Triples: Volumen vs Puntería (3PA vs 3P%)',
    desc: 'Tiradores de alto volumen frente a acierto clínico desde el perímetro.',
    xMetric: 'fg3a',
    yMetric: 'fg3Pct',
    sizeMetric: 'fg3m',
    quadrants: {
      tr: 'Tiradores Letales de Alto Volumen',
      tl: 'Especialistas de Esquina Clínicos',
      br: 'Tiradores Racha con Alto Lanzamiento',
      bl: 'Generadores Interiores / No Tiradores',
    },
  },
  {
    id: 'creation_control',
    label: '4. Creación y Control (AST vs TOV)',
    desc: 'Volumen de pases frente a pérdidas de balón cometidas en juego.',
    xMetric: 'ast',
    yMetric: 'tov',
    sizeMetric: 'plusMinus',
    quadrants: {
      tr: 'Generadores con Gran Carga de Balón',
      tl: 'Riesgo Elevado de Pérdidas',
      br: 'Directores Puros de Juego Seguro',
      bl: 'Finalizadores / Juego sin Balón',
    },
  },
  {
    id: 'pra_impact',
    label: '5. Producción Total vs Impacto (PRA vs GmSc)',
    desc: 'Suma de números tradicionales frente a la valoración analítica de Hollinger.',
    xMetric: 'pra',
    yMetric: 'gameScore',
    sizeMetric: 'plusMinus',
    quadrants: {
      tr: 'Dominio Total del Encuentro',
      tl: 'Eficiencia Analítica Pura',
      br: 'Volumen de Cifras con Menor Eficiencia',
      bl: 'Rol Específico de Contención',
    },
  },
];

interface ScatterAnalyticsViewProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
  benchmarks: LeagueBenchmarks;
  experienceMode: ExperienceMode;
  watchlistIds: Set<string>;
  onToggleWatchlist: (key: string) => void;
  onInspectEntity: (type: 'player' | 'team', id: string) => void;
  windowSize: WindowSize;
}

// Pearson correlation helper
function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3 || y.length !== n) return 0;
  const meanX = mean(x);
  const meanY = mean(y);

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return round1((num / den) * 100) / 100;
}

/**
 * Reusable Metric Info Tooltip (i)
 */
function MetricInfoButton({
  title,
  desc,
  interpretation,
  unit,
  lowerIsBetter,
  align = 'center',
  placement = 'bottom',
}: {
  title: string;
  desc: string;
  interpretation?: string;
  unit?: string;
  lowerIsBetter?: boolean;
  align?: 'left' | 'right' | 'center';
  placement?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);

  const alignClasses =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2';

  const placementClasses =
    placement === 'top'
      ? 'bottom-full mb-2'
      : 'top-full mt-2';

  return (
    <div className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-4 h-4 rounded-full bg-slate-800 hover:bg-orange-500/20 text-slate-400 hover:text-orange-400 border border-slate-700/80 hover:border-orange-500/40 inline-flex items-center justify-center transition-colors text-[10px] font-bold"
        aria-label={`Información sobre ${title}`}
      >
        i
      </button>

      {open && (
        <div
          className={`absolute z-50 ${alignClasses} ${placementClasses} w-72 max-w-[min(288px,calc(100vw-36px))] p-3 bg-[#0B1120] border border-orange-500/60 rounded-lg shadow-2xl text-left pointer-events-none animate-in fade-in zoom-in-95 duration-150`}
          style={{ filter: 'drop-shadow(0 15px 25px rgba(0,0,0,0.75))' }}
        >
          <div className="flex items-center justify-between gap-1 border-b border-[#1E293B] pb-1.5 mb-1.5">
            <span className="font-bold text-xs text-orange-300 truncate">{title}</span>
            {unit && <span className="text-[10px] font-mono text-slate-400">Unidad: {unit}</span>}
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">{desc}</p>
          {interpretation && (
            <div className={`mt-2 p-1.5 rounded text-[10px] leading-snug border ${
              lowerIsBetter
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
            }`}>
              {interpretation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ScatterAnalyticsView({
  players,
  teams,
  onInspectEntity,
}: ScatterAnalyticsViewProps) {
  // Main view segment: 'teams' | 'players' | 'correlation'
  const [activeTab, setActiveTab] = useState<'teams' | 'players' | 'correlation'>('teams');

  // Teams view state
  const [teamPresetId, setTeamPresetId] = useState<string>('contenders');
  const [teamMetricXId, setTeamMetricXId] = useState<string>('offRtg');
  const [teamMetricYId, setTeamMetricYId] = useState<string>('defRtg');
  const [teamMetricSizeId, setTeamMetricSizeId] = useState<string>('winPct');
  const [teamConfFilter, setTeamConfFilter] = useState<'all' | 'Este' | 'Oeste'>('all');
  const [teamDivFilter, setTeamDivFilter] = useState<string>('all');
  const [teamQuery, setTeamQuery] = useState('');

  // Players view state
  const [playerPresetId, setPlayerPresetId] = useState<string>('usage_efficiency');
  const [playerMetricXId, setPlayerMetricXId] = useState<string>('usgEst');
  const [playerMetricYId, setPlayerMetricYId] = useState<string>('tsPct');
  const [playerMetricSizeId, setPlayerMetricSizeId] = useState<string>('points');
  const [playerPosFilter, setPlayerPosFilter] = useState<'all' | 'G' | 'F' | 'C'>('all');
  const [playerConfFilter, setPlayerConfFilter] = useState<'all' | 'East' | 'West'>('all');
  const [playerDivFilter, setPlayerDivFilter] = useState<string>('all');
  const [playerTeamFilter, setPlayerTeamFilter] = useState<string>('all');
  const [playerQuery, setPlayerQuery] = useState('');
  const [minGames, setMinGames] = useState(5);
  const [minMpg, setMinMpg] = useState(15);

  // Hover states for tooltips
  const [hoveredEntity, setHoveredEntity] = useState<any>(null);

  // Enriched Teams Data with real official CDN logos and franchise colors
  const enrichedTeams = useMemo<EnrichedTeamMetricData[]>(() => {
    return teams.map((t) => {
      const division = TEAM_TO_DIV[t.abbreviation] || 'General';
      const conf = t.conference === 'East' || t.conference === 'Este' ? 'Este' : 'Oeste';
      const meta = NBA_TEAMS_MAP[t.abbreviation];
      const logoUrl = t.logoUrl || getTeamScatterLogoUrl(t.abbreviation);
      const primaryColor = meta?.primaryColor || '#F97316';
      const secondaryColor = meta?.secondaryColor || '#FFFFFF';

      const stats: Record<string, number> = {};
      TEAM_METRIC_DEFINITIONS.forEach((def) => {
        stats[def.id] = def.getValue(t);
      });

      return {
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        abbreviation: t.abbreviation,
        logoUrl,
        primaryColor,
        secondaryColor,
        conference: conf,
        division,
        wins: t.wins,
        losses: t.losses,
        winPct: round1(t.winPct * 100),
        streakCode: t.streakCode,
        stats,
      };
    });
  }, [teams]);

  // Active Team Metric Objects
  const teamMetricX = useMemo(
    () => TEAM_METRIC_DEFINITIONS.find((m) => m.id === teamMetricXId) || TEAM_METRIC_DEFINITIONS[0],
    [teamMetricXId]
  );
  const teamMetricY = useMemo(
    () => TEAM_METRIC_DEFINITIONS.find((m) => m.id === teamMetricYId) || TEAM_METRIC_DEFINITIONS[1],
    [teamMetricYId]
  );
  const teamMetricSize = useMemo(
    () => TEAM_METRIC_DEFINITIONS.find((m) => m.id === teamMetricSizeId) || TEAM_METRIC_DEFINITIONS[4],
    [teamMetricSizeId]
  );

  // Filtered Teams for Scatter Plot
  const filteredTeams = useMemo(() => {
    const q = normalizeSearchText(teamQuery);
    return enrichedTeams.filter((t) => {
      if (teamConfFilter !== 'all' && t.conference !== teamConfFilter) return false;
      if (teamDivFilter !== 'all' && t.division !== teamDivFilter) return false;
      if (q) {
        const hay = normalizeSearchText(`${t.name} ${t.shortName} ${t.abbreviation}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedTeams, teamConfFilter, teamDivFilter, teamQuery]);

  // Average benchmarks for current team axes
  const teamMeanX = useMemo(() => {
    if (filteredTeams.length === 0) return 0;
    return round1(mean(filteredTeams.map((t) => t.stats[teamMetricX.id] ?? 0)));
  }, [filteredTeams, teamMetricX.id]);

  const teamMeanY = useMemo(() => {
    if (filteredTeams.length === 0) return 0;
    return round1(mean(filteredTeams.map((t) => t.stats[teamMetricY.id] ?? 0)));
  }, [filteredTeams, teamMetricY.id]);

  // Handle Team Preset Select
  const handleSelectTeamPreset = (presetId: string) => {
    setTeamPresetId(presetId);
    const p = TEAM_PRESETS.find((pr) => pr.id === presetId);
    if (p) {
      setTeamMetricXId(p.xMetric);
      setTeamMetricYId(p.yMetric);
      setTeamMetricSizeId(p.sizeMetric);
    }
  };

  // Active Player Metric Objects
  const playerMetricX = useMemo(
    () => STREAK_METRIC_OPTIONS.find((m) => m.id === playerMetricXId) || STREAK_METRIC_OPTIONS[0],
    [playerMetricXId]
  );
  const playerMetricY = useMemo(
    () => STREAK_METRIC_OPTIONS.find((m) => m.id === playerMetricYId) || STREAK_METRIC_OPTIONS[1],
    [playerMetricYId]
  );
  const playerMetricSize = useMemo(
    () => STREAK_METRIC_OPTIONS.find((m) => m.id === playerMetricSizeId) || STREAK_METRIC_OPTIONS[2],
    [playerMetricSizeId]
  );

  // Filtered Players for Scatter Plot with team colors
  const filteredPlayers = useMemo(() => {
    const q = normalizeSearchText(playerQuery);
    return players
      .filter((p) => {
        if (p.games.length < minGames) return false;
        const avgMin = mean(p.games.map((g) => g.minutes));
        if (avgMin < minMpg) return false;

        if (playerPosFilter !== 'all' && !p.position.toUpperCase().includes(playerPosFilter)) return false;

        const teamInfo = teams.find((t) => t.abbreviation === p.teamAbbr);
        if (playerConfFilter !== 'all') {
          const pConf = teamInfo?.conference === 'Este' || teamInfo?.conference === 'East' ? 'East' : 'West';
          if (pConf !== playerConfFilter) return false;
        }
        if (playerDivFilter !== 'all' && TEAM_TO_DIV[p.teamAbbr] !== playerDivFilter) return false;
        if (playerTeamFilter !== 'all' && p.teamAbbr !== playerTeamFilter) return false;

        if (q) {
          const hay = normalizeSearchText(`${p.name} ${p.teamAbbr}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((p) => {
        const xVal = round1(mean(p.games.map((g) => playerMetricX.getValue(g))));
        const yVal = round1(mean(p.games.map((g) => playerMetricY.getValue(g))));
        const sVal = round1(mean(p.games.map((g) => playerMetricSize.getValue(g))));
        const avgMin = round1(mean(p.games.map((g) => g.minutes)));
        const meta = NBA_TEAMS_MAP[p.teamAbbr?.toUpperCase()];
        const teamPrimaryColor = meta?.primaryColor || '#38BDF8';
        const teamSecondaryColor = meta?.secondaryColor || '#FFFFFF';

        return {
          id: p.id,
          name: p.name,
          teamAbbr: p.teamAbbr,
          position: p.position,
          teamPrimaryColor,
          teamSecondaryColor,
          x: xVal,
          y: yVal,
          size: sVal,
          minAvg: avgMin,
          item: p,
        };
      })
      .filter((p) => !isNaN(p.x) && !isNaN(p.y));
  }, [
    players,
    teams,
    minGames,
    minMpg,
    playerPosFilter,
    playerConfFilter,
    playerDivFilter,
    playerTeamFilter,
    playerQuery,
    playerMetricX,
    playerMetricY,
    playerMetricSize,
  ]);

  const playerMeanX = useMemo(() => {
    if (filteredPlayers.length === 0) return 0;
    return round1(mean(filteredPlayers.map((p) => p.x)));
  }, [filteredPlayers]);

  const playerMeanY = useMemo(() => {
    if (filteredPlayers.length === 0) return 0;
    return round1(mean(filteredPlayers.map((p) => p.y)));
  }, [filteredPlayers]);

  // Handle Player Preset Select
  const handleSelectPlayerPreset = (presetId: string) => {
    setPlayerPresetId(presetId);
    const p = PLAYER_PRESETS.find((pr) => pr.id === presetId);
    if (p) {
      setPlayerMetricXId(p.xMetric);
      setPlayerMetricYId(p.yMetric);
      setPlayerMetricSizeId(p.sizeMetric);
    }
  };

  // Correlation Matrix Calculations with Correct DefRtg Interpretation (Lower is better = positive impact on wins)
  const correlationData = useMemo(() => {
    if (enrichedTeams.length < 5) return null;

    const keyMetrics: Array<{
      id: string;
      label: string;
      desc: string;
      lowerIsBetter?: boolean;
    }> = [
      { id: 'winPct', label: '% Victorias', desc: 'Capacidad de ganar partidos en temporada' },
      { id: 'netRtg', label: 'Net Rating', desc: 'Diferencial neto pts/100 posesiones (Off - Def)' },
      { id: 'offRtg', label: 'Off Rating', desc: 'Eficacia de ataque (pts/100 pos)' },
      { id: 'defRtg', label: 'Def Rating', desc: 'Solidez defensiva (pts recibidos/100 pos)', lowerIsBetter: true },
      { id: 'pace', label: 'Pace (Ritmo)', desc: 'Velocidad de posesiones por partido' },
      { id: 'efgPct', label: 'eFG%', desc: 'Tiro de campo efectivo premiando triples' },
      { id: 'tsPct', label: 'TS%', desc: 'Tiro verdadero incluyendo tiros libres' },
      { id: 'pctPts3p', label: '% Pts 3P', desc: 'Porcentaje del tanteo en triples' },
      { id: 'astTovRatio', label: 'Ratio AST/TO', desc: 'Calidad de creación frente a pérdidas' },
      { id: 'ptsPaint', label: 'PTS Pintura', desc: 'Poderío interior en la zona' },
      { id: 'tovPct', label: 'TOV%', desc: 'Porcentaje de posesiones perdidas', lowerIsBetter: true },
      { id: 'orebPct', label: 'OREB%', desc: 'Capacidad de rebote ofensivo' },
    ];

    // Compute matrix
    const matrix: Array<{
      metricA: { id: string; label: string; lowerIsBetter?: boolean };
      correlations: Record<string, number>;
    }> = [];

    keyMetrics.forEach((mA) => {
      const valsA = enrichedTeams.map((t) => t.stats[mA.id] ?? 0);
      const row: Record<string, number> = {};

      keyMetrics.forEach((mB) => {
        if (mA.id === mB.id) {
          row[mB.id] = 1.0;
        } else {
          const valsB = enrichedTeams.map((t) => t.stats[mB.id] ?? 0);
          row[mB.id] = calculatePearsonCorrelation(valsA, valsB);
        }
      });

      matrix.push({
        metricA: { id: mA.id, label: mA.label, lowerIsBetter: mA.lowerIsBetter },
        correlations: row,
      });
    });

    // Correlation with WinPct specifically for ranking
    const winVals = enrichedTeams.map((t) => t.stats['winPct'] ?? 0);
    const winRanking = keyMetrics
      .filter((m) => m.id !== 'winPct')
      .map((m) => {
        const vals = enrichedTeams.map((t) => t.stats[m.id] ?? 0);
        const rawR = calculatePearsonCorrelation(vals, winVals);
        // If lower is better (like DefRtg or TOV%), a negative correlation with winPct means
        // that lower DefRtg actually HELPS win more games!
        const effectiveImpact = m.lowerIsBetter ? -rawR : rawR;
        return {
          ...m,
          rawR,
          effectiveImpact,
          absR: Math.abs(rawR),
        };
      })
      .sort((a, b) => b.absR - a.absR);

    return { keyMetrics, matrix, winRanking };
  }, [enrichedTeams]);

  // Reset helper
  const handleResetFilters = () => {
    if (activeTab === 'teams') {
      setTeamConfFilter('all');
      setTeamDivFilter('all');
      setTeamQuery('');
      handleSelectTeamPreset('contenders');
    } else {
      setPlayerPosFilter('all');
      setPlayerConfFilter('all');
      setPlayerDivFilter('all');
      setPlayerTeamFilter('all');
      setPlayerQuery('');
      setMinGames(5);
      setMinMpg(15);
      handleSelectPlayerPreset('usage_efficiency');
    }
  };

  // Custom Point Shape for Teams: Renders Official Franchise Logos via SVG <image>
  const renderTeamScatterShape = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || isNaN(cx) || isNaN(cy)) return null;

    const isHighlighted =
      teamQuery &&
      normalizeSearchText(payload.name + ' ' + payload.abbreviation).includes(
        normalizeSearchText(teamQuery)
      );
    const isHovered = hoveredEntity?.id === payload.id;
    const radius = isHovered ? 20 : isHighlighted ? 18 : 15;
    const imgSize = (radius - 2) * 2;

    return (
      <g
        className="cursor-pointer transition-transform duration-150 select-none"
        onMouseEnter={() => setHoveredEntity(payload)}
        onClick={() => onInspectEntity('team', payload.id)}
      >
        {/* Glow / Highlight ring */}
        {(isHighlighted || isHovered) && (
          <circle
            cx={cx}
            cy={cy}
            r={radius + 4}
            fill="none"
            stroke="#F97316"
            strokeWidth={2.5}
            strokeDasharray={isHovered ? 'none' : '3 3'}
            className="animate-pulse"
          />
        )}

        {/* Circular backing with team primary color stroke */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="#0B1120"
          stroke={isHovered ? '#F97316' : payload.primaryColor || '#1E293B'}
          strokeWidth={isHovered ? 2 : 1.5}
          className="shadow-md"
        />

        {/* Embedded Official NBA Team Logo */}
        {payload.logoUrl ? (
          <image
            href={payload.logoUrl}
            xlinkHref={payload.logoUrl}
            x={cx - imgSize / 2}
            y={cy - imgSize / 2}
            width={imgSize}
            height={imgSize}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            fontSize="10"
            fontWeight="bold"
            fill="#CBD5E1"
            className="font-mono"
          >
            {payload.abbreviation}
          </text>
        )}
      </g>
    );
  };

  // Custom Point Shape for Players: Colored with Official Franchise Primary Colors
  const renderPlayerScatterShape = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || isNaN(cx) || isNaN(cy)) return null;

    const isHighlighted =
      playerQuery &&
      normalizeSearchText(payload.name).includes(normalizeSearchText(playerQuery));
    const isHovered = hoveredEntity?.id === payload.id;
    const r = isHovered ? 9 : isHighlighted ? 8 : 6;
    const dotColor = isHighlighted ? '#F97316' : payload.teamPrimaryColor || '#38BDF8';

    return (
      <g
        className="cursor-pointer select-none"
        onMouseEnter={() => setHoveredEntity(payload)}
        onClick={() => onInspectEntity('player', payload.id)}
      >
        {isHovered && (
          <circle
            cx={cx}
            cy={cy}
            r={r + 4}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={1.5}
            className="animate-pulse"
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={dotColor}
          fillOpacity={isHovered ? 1 : 0.85}
          stroke={isHovered ? '#FFFFFF' : '#0B1120'}
          strokeWidth={isHovered ? 2 : 1}
          className="transition-all duration-150"
        />
      </g>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Header with View Mode Switcher (Equipos | Jugadores | Matriz Correlación) */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center text-orange-400 shrink-0">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100 truncate">
                  Explorador Analítico Avanzado
                </h2>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  Recharts Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                Matrices multidimensionales con escudos oficiales, colores de franquicia e indicadores explicados
              </p>
            </div>
          </div>

          {/* Primary View Segment Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg self-start lg:self-auto overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                setActiveTab('teams');
                setHoveredEntity(null);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'teams'
                  ? 'bg-orange-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Equipos NBA (30)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('players');
                setHoveredEntity(null);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'players'
                  ? 'bg-orange-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Jugadores NBA</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('correlation');
                setHoveredEntity(null);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'correlation'
                  ? 'bg-orange-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Matriz de Correlación</span>
            </button>
          </div>
        </div>

        {/* 2. Presets Carousel */}
        {activeTab === 'teams' && (
          <div className="space-y-2 pt-2 border-t border-[#1E293B]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-orange-400" /> Presets Tácticos para Franquicias
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] text-slate-400 hover:text-orange-400 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Restaurar filtros
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {TEAM_PRESETS.map((p) => {
                const isActive = teamPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectTeamPreset(p.id)}
                    className={`p-2.5 text-left rounded-lg border transition-all text-xs flex flex-col justify-between ${
                      isActive
                        ? 'bg-orange-500/15 border-orange-500/60 text-orange-200 shadow-sm'
                        : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:bg-[#182338] hover:border-slate-700'
                    }`}
                  >
                    <span className="font-semibold block truncate text-slate-100">{p.label}</span>
                    <span className="text-[10px] text-slate-400 line-clamp-2 mt-1 leading-tight">
                      {p.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'players' && (
          <div className="space-y-2 pt-2 border-t border-[#1E293B]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-sky-400" /> Presets Analíticos para Jugadores
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] text-slate-400 hover:text-orange-400 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Restaurar filtros
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {PLAYER_PRESETS.map((p) => {
                const isActive = playerPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPlayerPreset(p.id)}
                    className={`p-2.5 text-left rounded-lg border transition-all text-xs flex flex-col justify-between ${
                      isActive
                        ? 'bg-sky-500/15 border-sky-500/60 text-sky-200 shadow-sm'
                        : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:bg-[#182338] hover:border-slate-700'
                    }`}
                  >
                    <span className="font-semibold block truncate text-slate-100">{p.label}</span>
                    <span className="text-[10px] text-slate-400 line-clamp-2 mt-1 leading-tight">
                      {p.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Dropdown Controls Bar with (i) Information Tooltips */}
        {activeTab === 'teams' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-[#1E293B]">
            {/* Eje X Selector with (i) */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1 text-orange-400">
                  <Filter className="w-3 h-3" /> Eje X (Horizontal)
                </span>
                <MetricInfoButton
                  title={teamMetricX.label}
                  desc={teamMetricX.description}
                  interpretation={teamMetricX.interpretation}
                  unit={teamMetricX.unit}
                  lowerIsBetter={teamMetricX.lowerIsBetter}
                  align="left"
                  placement="bottom"
                />
              </label>
              <select
                value={teamMetricXId}
                onChange={(e) => {
                  setTeamMetricXId(e.target.value);
                  setTeamPresetId('custom');
                }}
                className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200 focus:outline-none focus:border-orange-500"
              >
                {TEAM_METRIC_DEFINITIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} {m.lowerIsBetter ? '⬇ (Menor mejor)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Eje Y Selector with (i) */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1 text-sky-400">
                  <Filter className="w-3 h-3" /> Eje Y (Vertical)
                </span>
                <MetricInfoButton
                  title={teamMetricY.label}
                  desc={teamMetricY.description}
                  interpretation={teamMetricY.interpretation}
                  unit={teamMetricY.unit}
                  lowerIsBetter={teamMetricY.lowerIsBetter}
                  align="left"
                  placement="bottom"
                />
              </label>
              <select
                value={teamMetricYId}
                onChange={(e) => {
                  setTeamMetricYId(e.target.value);
                  setTeamPresetId('custom');
                }}
                className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200 focus:outline-none focus:border-orange-500"
              >
                {TEAM_METRIC_DEFINITIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} {m.lowerIsBetter ? '⬇ (Menor mejor)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Conference & Division Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-emerald-400" /> Conf. y División
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={teamConfFilter}
                  onChange={(e) => setTeamConfFilter(e.target.value as any)}
                  className="w-full px-2 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200"
                >
                  <option value="all">Todas Conf.</option>
                  <option value="Este">Este (15)</option>
                  <option value="Oeste">Oeste (15)</option>
                </select>
                <select
                  value={teamDivFilter}
                  onChange={(e) => setTeamDivFilter(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200"
                >
                  <option value="all">Div: Todas</option>
                  {DIVISIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Size Metric Selector with (i) */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1 text-purple-400">
                  <Activity className="w-3 h-3" /> Tamaño Burbuja
                </span>
                <MetricInfoButton
                  title={teamMetricSize.label}
                  desc={teamMetricSize.description}
                  interpretation={teamMetricSize.interpretation}
                  unit={teamMetricSize.unit}
                  lowerIsBetter={teamMetricSize.lowerIsBetter}
                  align="right"
                  placement="bottom"
                />
              </label>
              <select
                value={teamMetricSizeId}
                onChange={(e) => setTeamMetricSizeId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200 focus:outline-none focus:border-orange-500"
              >
                {TEAM_METRIC_DEFINITIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Search */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-3 h-3 text-slate-400" /> Resaltar Franquicia
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={teamQuery}
                  onChange={(e) => setTeamQuery(e.target.value)}
                  placeholder="Buscar franquicia o abreviatura..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'players' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-[#1E293B]">
            {/* Player X Metric Selector with (i) */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1 text-orange-400">
                  <Filter className="w-3 h-3" /> Eje Horizontal (X)
                </span>
                <MetricInfoButton
                  title={playerMetricX.label}
                  desc={playerMetricX.qualificationNote || playerMetricX.label}
                  unit={playerMetricX.unit}
                  align="left"
                  placement="bottom"
                />
              </label>
              <select
                value={playerMetricXId}
                onChange={(e) => {
                  setPlayerMetricXId(e.target.value);
                  setPlayerPresetId('custom');
                }}
                className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200 focus:outline-none focus:border-orange-500"
              >
                {STREAK_METRIC_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Player Y Metric Selector with (i) */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1 text-sky-400">
                  <Filter className="w-3 h-3" /> Eje Vertical (Y)
                </span>
                <MetricInfoButton
                  title={playerMetricY.label}
                  desc={playerMetricY.qualificationNote || playerMetricY.label}
                  unit={playerMetricY.unit}
                  align="left"
                  placement="bottom"
                />
              </label>
              <select
                value={playerMetricYId}
                onChange={(e) => {
                  setPlayerMetricYId(e.target.value);
                  setPlayerPresetId('custom');
                }}
                className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200 focus:outline-none focus:border-orange-500"
              >
                {STREAK_METRIC_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Player Position & Conference Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3 h-3 text-emerald-400" /> Posición y Conf.
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={playerPosFilter}
                  onChange={(e) => setPlayerPosFilter(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200"
                >
                  <option value="all">Pos: Todas</option>
                  <option value="G">G - Bases</option>
                  <option value="F">F - Aleros</option>
                  <option value="C">C - Pívots</option>
                </select>
                <select
                  value={playerConfFilter}
                  onChange={(e) => setPlayerConfFilter(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg text-xs text-slate-200"
                >
                  <option value="all">Conf: Todas</option>
                  <option value="East">Este</option>
                  <option value="West">Oeste</option>
                </select>
              </div>
            </div>

            {/* Live Search */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-3 h-3 text-slate-400" /> Resaltar Jugador
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={playerQuery}
                  onChange={(e) => setPlayerQuery(e.target.value)}
                  placeholder="Buscar jugador..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 4. Tab 1: Teams Scatter Plot View */}
      {activeTab === 'teams' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Chart Area */}
          <div className="lg:col-span-3 space-y-3">
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 min-h-[560px] flex flex-col justify-between relative">
              {/* Dual Axes Explicit Indicators Bar with (i) */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2 pb-2.5 border-b border-[#1E293B]">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1120] border border-sky-500/30 text-xs">
                    <span className="text-sky-400 font-bold uppercase text-[10px]">Eje Y:</span>
                    <span className="font-semibold text-slate-200">{teamMetricY.label}</span>
                    {teamMetricY.lowerIsBetter && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-semibold border border-emerald-500/30">
                        ⬆ Escala invertida (Menor es mejor)
                      </span>
                    )}
                    <MetricInfoButton
                      title={teamMetricY.label}
                      desc={teamMetricY.description}
                      interpretation={teamMetricY.interpretation}
                      unit={teamMetricY.unit}
                      lowerIsBetter={teamMetricY.lowerIsBetter}
                      align="left"
                      placement="bottom"
                    />
                  </div>

                  <span className="text-slate-500 text-xs font-bold">vs</span>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1120] border border-orange-500/30 text-xs">
                    <span className="text-orange-400 font-bold uppercase text-[10px]">Eje X:</span>
                    <span className="font-semibold text-slate-200">{teamMetricX.label}</span>
                    {teamMetricX.lowerIsBetter && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-semibold border border-emerald-500/30">
                        ➡ Invertido (Menor mejor)
                      </span>
                    )}
                    <MetricInfoButton
                      title={teamMetricX.label}
                      desc={teamMetricX.description}
                      interpretation={teamMetricX.interpretation}
                      unit={teamMetricX.unit}
                      lowerIsBetter={teamMetricX.lowerIsBetter}
                      align="left"
                      placement="bottom"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400">
                    Media NBA: X={teamMeanX.toFixed(1)}{teamMetricX.unit} · Y={teamMeanY.toFixed(1)}{teamMetricY.unit}
                  </span>
                  <ExportImageButton
                    onBuildImage={() =>
                      buildTableSnapshotBlob({
                        filename: `RadarNBA-Equipos-${teamMetricY.shortLabel}-vs-${teamMetricX.shortLabel}`,
                        categoryTag: 'EXPLORADOR ANALÍTICO · EQUIPOS NBA',
                        title: `${teamMetricY.shortLabel} vs ${teamMetricX.shortLabel}`,
                        subtitle: `${filteredTeams.length} franquicias analizadas · Ejes: ${teamMetricY.label} vs ${teamMetricX.label}`,
                        entityColumnLabel: 'FRANQUICIA',
                        columns: [
                          { key: 'conf', label: 'CONF', align: 'left', widthWeight: 1 },
                          { key: 'valX', label: teamMetricX.shortLabel, align: 'right', widthWeight: 1.2 },
                          { key: 'valY', label: teamMetricY.shortLabel, align: 'right', widthWeight: 1.2 },
                          { key: 'net', label: 'NET RTG', align: 'right', widthWeight: 1 },
                          { key: 'record', label: 'BALANCE', align: 'right', widthWeight: 1.1 },
                        ],
                        rows: filteredTeams.slice(0, 15).map((t, idx) => ({
                          rank: idx + 1,
                          teamAbbr: t.abbreviation,
                          entityName: t.name,
                          entitySubtext: `${t.division} · ${t.conference}`,
                          cells: {
                            conf: t.conference,
                            valX: String(t.stats[teamMetricX.id]),
                            valY: String(t.stats[teamMetricY.id]),
                            net: (t.stats.netRtg >= 0 ? '+' : '') + t.stats.netRtg,
                            record: `${t.wins}-${t.losses}`,
                          },
                        })),
                      })
                    }
                    label="Exportar PNG"
                  />
                </div>
              </div>

              {/* Recharts Scatter Chart with Official Team Badges */}
              <div id="teams-scatter-container" className="w-full h-[460px] bg-[#0E1626]/40 rounded-lg p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 25, right: 35, bottom: 45, left: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.7} />

                    <XAxis
                      type="number"
                      dataKey={(d: EnrichedTeamMetricData) => d.stats[teamMetricX.id]}
                      name={teamMetricX.shortLabel}
                      unit={teamMetricX.unit}
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                      domain={['auto', 'auto']}
                      reversed={Boolean(teamMetricX.lowerIsBetter)}
                      label={{
                        value: `${teamMetricX.label} ${teamMetricX.lowerIsBetter ? '(Menor = Mejor)' : ''}`,
                        position: 'insideBottom',
                        offset: -12,
                        fill: '#CBD5E1',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    />

                    <YAxis
                      type="number"
                      dataKey={(d: EnrichedTeamMetricData) => d.stats[teamMetricY.id]}
                      name={teamMetricY.shortLabel}
                      unit={teamMetricY.unit}
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                      domain={['auto', 'auto']}
                      reversed={Boolean(teamMetricY.lowerIsBetter)}
                      label={{
                        value: `${teamMetricY.shortLabel}${teamMetricY.unit ? ` (${teamMetricY.unit.trim()})` : ''} ${teamMetricY.lowerIsBetter ? '⬇' : ''}`,
                        angle: -90,
                        position: 'insideLeft',
                        offset: 15,
                        fill: '#CBD5E1',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    />

                    <ZAxis range={[140, 140]} />

                    {/* League Mean Reference Lines */}
                    <ReferenceLine
                      x={teamMeanX}
                      stroke="#F97316"
                      strokeDasharray="4 4"
                      strokeOpacity={0.6}
                      strokeWidth={1.5}
                      label={{
                        value: `Media X: ${teamMeanX}`,
                        fill: '#F97316',
                        fontSize: 10,
                        position: 'top',
                      }}
                    />
                    <ReferenceLine
                      y={teamMeanY}
                      stroke="#38BDF8"
                      strokeDasharray="4 4"
                      strokeOpacity={0.6}
                      strokeWidth={1.5}
                      label={{
                        value: `Media Y: ${teamMeanY}`,
                        fill: '#38BDF8',
                        fontSize: 10,
                        position: 'right',
                      }}
                    />

                    <Tooltip
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const data: EnrichedTeamMetricData = payload[0].payload;
                        return (
                          <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 shadow-2xl z-30 min-w-56 space-y-2.5">
                            <div className="flex items-center gap-2.5">
                              <TeamLogo
                                abbr={data.abbreviation}
                                teamId={data.id}
                                logoUrl={data.logoUrl}
                                size="sm"
                              />
                              <div>
                                <h4 className="text-xs font-bold text-slate-100 leading-tight">
                                  {data.name}
                                </h4>
                                <span className="text-[10px] text-slate-400">
                                  {data.conference} · {data.division} · {data.wins}-{data.losses} ({data.winPct}%)
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5 pt-1.5 border-t border-[#1E293B] text-[11px]">
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="text-slate-400">{teamMetricX.shortLabel}:</span>
                                <span className="font-mono font-bold text-orange-400">
                                  {data.stats[teamMetricX.id]}
                                  {teamMetricX.unit}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="text-slate-400">{teamMetricY.shortLabel}:</span>
                                <span className="font-mono font-bold text-sky-400">
                                  {data.stats[teamMetricY.id]}
                                  {teamMetricY.unit}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="text-slate-400">Net Rating:</span>
                                <span className={`font-mono font-bold ${data.stats.netRtg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {data.stats.netRtg >= 0 ? `+${data.stats.netRtg}` : data.stats.netRtg}
                                </span>
                              </div>
                            </div>
                            <p className="text-[10px] text-orange-400 font-sans italic pt-1 border-t border-[#1E293B]/60 text-center">
                              Haz click para abrir expediente completo
                            </p>
                          </div>
                        );
                      }}
                    />

                    <Scatter
                      data={filteredTeams}
                      shape={renderTeamScatterShape}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* Quadrant Legend / Interpretive Guide */}
              {TEAM_PRESETS.find((p) => p.id === teamPresetId)?.quadrants && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-[#1E293B] text-[11px]">
                  <div className="bg-[#0B1120]/70 border border-emerald-500/20 rounded-md p-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block truncate">
                      ↗ Cuadrante Superior Derecho
                    </span>
                    <span className="text-slate-300 font-medium line-clamp-2">
                      {TEAM_PRESETS.find((p) => p.id === teamPresetId)?.quadrants.tr}
                    </span>
                  </div>
                  <div className="bg-[#0B1120]/70 border border-sky-500/20 rounded-md p-2">
                    <span className="text-[10px] uppercase font-bold text-sky-400 block truncate">
                      ↖ Cuadrante Superior Izquierdo
                    </span>
                    <span className="text-slate-300 font-medium line-clamp-2">
                      {TEAM_PRESETS.find((p) => p.id === teamPresetId)?.quadrants.tl}
                    </span>
                  </div>
                  <div className="bg-[#0B1120]/70 border border-amber-500/20 rounded-md p-2">
                    <span className="text-[10px] uppercase font-bold text-amber-400 block truncate">
                      ↘ Cuadrante Inferior Derecho
                    </span>
                    <span className="text-slate-300 font-medium line-clamp-2">
                      {TEAM_PRESETS.find((p) => p.id === teamPresetId)?.quadrants.br}
                    </span>
                  </div>
                  <div className="bg-[#0B1120]/70 border border-rose-500/20 rounded-md p-2">
                    <span className="text-[10px] uppercase font-bold text-rose-400 block truncate">
                      ↙ Cuadrante Inferior Izquierdo
                    </span>
                    <span className="text-slate-300 font-medium line-clamp-2">
                      {TEAM_PRESETS.find((p) => p.id === teamPresetId)?.quadrants.bl}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Teams Table Sidebar */}
          <div className="space-y-3">
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3 flex flex-col h-full max-h-[640px]">
              <div className="flex items-center justify-between pb-2 border-b border-[#1E293B]">
                <span className="text-xs font-bold text-slate-200">
                  Franquicias ({filteredTeams.length})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Orden: {teamMetricX.shortLabel}
                </span>
              </div>

              <div className="overflow-y-auto divide-y divide-[#1E293B]/60 flex-1 pr-1 mt-2">
                {filteredTeams
                  .slice()
                  .sort((a, b) => {
                    const valA = a.stats[teamMetricX.id] ?? 0;
                    const valB = b.stats[teamMetricX.id] ?? 0;
                    return teamMetricX.lowerIsBetter ? valA - valB : valB - valA;
                  })
                  .map((t, idx) => {
                    const isHovered = hoveredEntity?.id === t.id;
                    const valX = t.stats[teamMetricX.id];
                    const valY = t.stats[teamMetricY.id];

                    return (
                      <div
                        key={t.id}
                        onMouseEnter={() => setHoveredEntity(t)}
                        onMouseLeave={() => setHoveredEntity(null)}
                        onClick={() => onInspectEntity('team', t.id)}
                        className={`flex items-center justify-between py-2 px-1.5 rounded-md cursor-pointer transition-colors ${
                          isHovered ? 'bg-[#1E293B]' : 'hover:bg-[#182338]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-mono text-slate-500 w-4 text-center">
                            {idx + 1}
                          </span>
                          <TeamLogo
                            abbr={t.abbreviation}
                            teamId={t.id}
                            logoUrl={t.logoUrl}
                            size="xs"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-slate-200 block truncate">
                              {t.shortName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {t.wins}-{t.losses} ({t.winPct}%)
                            </span>
                          </div>
                        </div>

                        <div className="text-right font-mono text-xs shrink-0 pl-2">
                          <div className="text-orange-400 font-bold">
                            {valX}
                            <span className="text-[9px] text-slate-400 font-sans ml-0.5">
                              {teamMetricX.shortLabel}
                            </span>
                          </div>
                          <div className="text-sky-400 text-[11px]">
                            {valY}
                            <span className="text-[9px] text-slate-400 font-sans ml-0.5">
                              {teamMetricY.shortLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Players Scatter Plot View */}
      {activeTab === 'players' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-3">
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 min-h-[560px] flex flex-col justify-between relative">
              {/* Dual Axes Explicit Indicators Bar with (i) */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2 pb-2.5 border-b border-[#1E293B]">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1120] border border-sky-500/30 text-xs">
                    <span className="text-sky-400 font-bold uppercase text-[10px]">Eje Y:</span>
                    <span className="font-semibold text-slate-200">{playerMetricY.label}</span>
                    <MetricInfoButton
                      title={playerMetricY.label}
                      desc={playerMetricY.qualificationNote || playerMetricY.label}
                      unit={playerMetricY.unit}
                      align="left"
                      placement="bottom"
                    />
                  </div>

                  <span className="text-slate-500 text-xs font-bold">vs</span>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1120] border border-orange-500/30 text-xs">
                    <span className="text-orange-400 font-bold uppercase text-[10px]">Eje X:</span>
                    <span className="font-semibold text-slate-200">{playerMetricX.label}</span>
                    <MetricInfoButton
                      title={playerMetricX.label}
                      desc={playerMetricX.qualificationNote || playerMetricX.label}
                      unit={playerMetricX.unit}
                      align="left"
                      placement="bottom"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400">
                    Muestra: {filteredPlayers.length} jugadores (Media: X={playerMeanX.toFixed(1)} · Y={playerMeanY.toFixed(1)})
                  </span>
                  <ExportImageButton
                    onBuildImage={() =>
                      buildTableSnapshotBlob({
                        filename: `RadarNBA-Jugadores-${playerMetricY.shortLabel}-vs-${playerMetricX.shortLabel}`,
                        categoryTag: 'EXPLORADOR ANALÍTICO · JUGADORES NBA',
                        title: `${playerMetricY.shortLabel} vs ${playerMetricX.shortLabel}`,
                        subtitle: `${filteredPlayers.length} jugadores · Ejes: ${playerMetricY.label} vs ${playerMetricX.label}`,
                        entityColumnLabel: 'JUGADOR',
                        columns: [
                          { key: 'team', label: 'EQUIPO', align: 'left', widthWeight: 1 },
                          { key: 'pos', label: 'POS', align: 'left', widthWeight: 0.8 },
                          { key: 'valX', label: playerMetricX.shortLabel, align: 'right', widthWeight: 1.2 },
                          { key: 'valY', label: playerMetricY.shortLabel, align: 'right', widthWeight: 1.2 },
                          { key: 'min', label: 'MIN/PJ', align: 'right', widthWeight: 1 },
                        ],
                        rows: filteredPlayers.slice(0, 15).map((p, idx) => ({
                          rank: idx + 1,
                          teamAbbr: p.teamAbbr,
                          entityName: p.name,
                          entitySubtext: `${p.teamAbbr} · ${p.position}`,
                          cells: {
                            team: p.teamAbbr,
                            pos: p.position,
                            valX: String(p.x),
                            valY: String(p.y),
                            min: String(p.minAvg),
                          },
                        })),
                      })
                    }
                    label="Exportar PNG"
                  />
                </div>
              </div>

              {/* Recharts Scatter Chart with Official Franchise Colors */}
              <div id="players-scatter-container" className="w-full h-[460px] bg-[#0E1626]/40 rounded-lg p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 25, right: 35, bottom: 45, left: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.7} />

                    <XAxis
                      type="number"
                      dataKey="x"
                      name={playerMetricX.shortLabel}
                      unit={playerMetricX.unit}
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                      domain={['auto', 'auto']}
                      label={{
                        value: playerMetricX.label,
                        position: 'insideBottom',
                        offset: -12,
                        fill: '#CBD5E1',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    />

                    <YAxis
                      type="number"
                      dataKey="y"
                      name={playerMetricY.shortLabel}
                      unit={playerMetricY.unit}
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                      domain={['auto', 'auto']}
                      label={{
                        value: `${playerMetricY.shortLabel}${playerMetricY.unit ? ` (${playerMetricY.unit.trim()})` : ''}`,
                        angle: -90,
                        position: 'insideLeft',
                        offset: 15,
                        fill: '#CBD5E1',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    />

                    <ZAxis range={[60, 60]} />

                    <ReferenceLine
                      x={playerMeanX}
                      stroke="#F97316"
                      strokeDasharray="4 4"
                      strokeOpacity={0.6}
                      strokeWidth={1.5}
                      label={{
                        value: `Media X: ${playerMeanX}`,
                        fill: '#F97316',
                        fontSize: 10,
                        position: 'top',
                      }}
                    />
                    <ReferenceLine
                      y={playerMeanY}
                      stroke="#38BDF8"
                      strokeDasharray="4 4"
                      strokeOpacity={0.6}
                      strokeWidth={1.5}
                      label={{
                        value: `Media Y: ${playerMeanY}`,
                        fill: '#38BDF8',
                        fontSize: 10,
                        position: 'right',
                      }}
                    />

                    <Tooltip
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3 shadow-2xl z-30 min-w-56 space-y-2">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar
                                playerId={data.id}
                                name={data.name}
                                teamAbbr={data.teamAbbr}
                                size="sm"
                              />
                              <div>
                                <h4 className="text-xs font-bold text-slate-100 leading-tight">
                                  {data.name}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <TeamLogo abbr={data.teamAbbr} size="xs" />
                                  <span className="text-[10px] text-slate-400">
                                    {data.teamAbbr} · {data.position} · {data.minAvg} min
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1.5 pt-1.5 border-t border-[#1E293B] text-[11px]">
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="text-slate-400">{playerMetricX.label}:</span>
                                <span className="font-mono font-bold text-orange-400">
                                  {data.x}
                                  {playerMetricX.unit}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="text-slate-400">{playerMetricY.label}:</span>
                                <span className="font-mono font-bold text-sky-400">
                                  {data.y}
                                  {playerMetricY.unit}
                                </span>
                              </div>
                            </div>
                            <p className="text-[10px] text-orange-400 font-sans italic pt-1 border-t border-[#1E293B]/60 text-center">
                              Haz click para abrir expediente completo
                            </p>
                          </div>
                        );
                      }}
                    />

                    <Scatter
                      data={filteredPlayers}
                      shape={renderPlayerScatterShape}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* Player Quadrants Guide */}
              {PLAYER_PRESETS.find((p) => p.id === playerPresetId)?.quadrants && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-[#1E293B] text-[11px]">
                  <div className="bg-[#0B1120]/70 border border-emerald-500/20 rounded-md p-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block truncate">
                      ↗ Cuadrante Superior
                    </span>
                    <span className="text-slate-300 font-medium line-clamp-1">
                      {PLAYER_PRESETS.find((p) => p.id === playerPresetId)?.quadrants.tr}
                    </span>
                  </div>
                  <div className="bg-[#0B1120]/70 border border-sky-500/20 rounded-md p-2">
                    <span className="text-[10px] uppercase font-bold text-sky-400 block truncate">
                      ↖ Cuadrante Superior Izq.
                    </span>
                    <span className="text-slate-300 font-medium line-clamp-1">
                      {PLAYER_PRESETS.find((p) => p.id === playerPresetId)?.quadrants.tl}
                    </span>
                  </div>
                  <div className="bg-[#0B1120]/70 border border-amber-500/20 rounded-md p-2">
                    <span className="text-[10px] uppercase font-bold text-amber-400 block truncate">
                      ↘ Cuadrante Inferior Der.
                    </span>
                    <span className="text-slate-300 font-medium line-clamp-1">
                      {PLAYER_PRESETS.find((p) => p.id === playerPresetId)?.quadrants.br}
                    </span>
                  </div>
                  <div className="bg-[#0B1120]/70 border border-rose-500/20 rounded-md p-2">
                    <span className="text-[10px] uppercase font-bold text-rose-400 block truncate">
                      ↙ Cuadrante Inferior Izq.
                    </span>
                    <span className="text-slate-300 font-medium line-clamp-1">
                      {PLAYER_PRESETS.find((p) => p.id === playerPresetId)?.quadrants.bl}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Players Table Sidebar */}
          <div className="space-y-3">
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-3 flex flex-col h-full max-h-[640px]">
              <div className="flex items-center justify-between pb-2 border-b border-[#1E293B]">
                <span className="text-xs font-bold text-slate-200">
                  Líderes ({filteredPlayers.length})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Orden: {playerMetricX.shortLabel}
                </span>
              </div>

              <div className="overflow-y-auto divide-y divide-[#1E293B]/60 flex-1 pr-1 mt-2">
                {filteredPlayers
                  .slice()
                  .sort((a, b) => b.x - a.x)
                  .slice(0, 50)
                  .map((p, idx) => {
                    const isHovered = hoveredEntity?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        onMouseEnter={() => setHoveredEntity(p)}
                        onMouseLeave={() => setHoveredEntity(null)}
                        onClick={() => onInspectEntity('player', p.id)}
                        className={`flex items-center justify-between py-2 px-1.5 rounded-md cursor-pointer transition-colors ${
                          isHovered ? 'bg-[#1E293B]' : 'hover:bg-[#182338]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-mono text-slate-500 w-4 text-center">
                            {idx + 1}
                          </span>
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: p.teamPrimaryColor }}
                            title={`Franquicia: ${p.teamAbbr}`}
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-slate-200 block truncate">
                              {p.name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {p.teamAbbr} · {p.position}
                            </span>
                          </div>
                        </div>

                        <div className="text-right font-mono text-xs shrink-0 pl-2">
                          <div className="text-orange-400 font-bold">
                            {p.x}
                            <span className="text-[9px] text-slate-400 font-sans ml-0.5">
                              {playerMetricX.shortLabel}
                            </span>
                          </div>
                          <div className="text-sky-400 text-[11px]">
                            {p.y}
                            <span className="text-[9px] text-slate-400 font-sans ml-0.5">
                              {playerMetricY.shortLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Tab 3: Interactive Correlation Matrix View */}
      {activeTab === 'correlation' && correlationData && (
        <div className="space-y-4">
          {/* Top Analytical Findings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#131C2E] border border-emerald-500/30 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                1. Qué decide los partidos
              </span>
              <h4 className="text-sm font-bold text-slate-100">
                La supremacía del Net Rating y eFG%
              </h4>
              <p className="text-xs text-slate-300">
                El <strong>NetRtg</strong> y el <strong>eFG%</strong> tienen una correlación superior al +0.80 con las victorias. Anotar de forma eficiente y tener un balance positivo por 100 posesiones es la garantía matemática de ganar.
              </p>
            </div>

            <div className="bg-[#131C2E] border border-sky-500/30 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">
                2. Interpretación Defensiva (DefRtg)
              </span>
              <h4 className="text-sm font-bold text-slate-100">
                Menos puntos recibidos = Más victorias
              </h4>
              <p className="text-xs text-slate-300">
                El <strong>DefRtg</strong> presenta una correlación inversa directa: cuanto <em>menor</em> es el rating defensivo (menos puntos encajados), <em>más</em> partidos gana la franquicia.
              </p>
            </div>

            <div className="bg-[#131C2E] border border-purple-500/30 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
                3. El mito del Ritmo (Pace)
              </span>
              <h4 className="text-sm font-bold text-slate-100">
                La velocidad no garantiza el éxito
              </h4>
              <p className="text-xs text-slate-300">
                El <strong>Pace</strong> muestra una correlación cercana a <strong>0.05</strong> con las victorias. Jugar rápido no te hace ganar más: lo que importa es la eficacia por posesión, no el número total de posesiones.
              </p>
            </div>
          </div>

          {/* Ranking of Factors Impacting Victory */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Factores Determinantes de la Victoria en la NBA
                </h3>
                <p className="text-xs text-slate-400">
                  Correlación estadística de Pearson (r) respecto al porcentaje de victorias de la franquicia
                </p>
              </div>
              <span className="text-[11px] font-mono text-orange-400">
                Muestra: {enrichedTeams.length} franquicias
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {correlationData.winRanking.map((factor) => {
                const isPositiveEffect = factor.effectiveImpact >= 0;
                const barWidth = Math.min(100, Math.round(factor.absR * 100));

                return (
                  <div
                    key={factor.id}
                    className="p-2.5 bg-[#0B1120] border border-[#1E293B] rounded-lg space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-200">{factor.label}</span>
                        {factor.lowerIsBetter && (
                          <span className="text-[10px] text-emerald-400 font-mono">
                            (Menor = Mejor)
                          </span>
                        )}
                      </div>
                      <span
                        className={`font-mono font-bold ${
                          isPositiveEffect ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        r = {factor.rawR >= 0 ? `+${factor.rawR.toFixed(2)}` : factor.rawR.toFixed(2)}
                      </span>
                    </div>

                    <div className="w-full bg-[#1E293B] h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isPositiveEffect ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{factor.desc}</span>
                      <span className="font-mono">Fuerza: {barWidth}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Full N x N Pearson Correlation Heatmap Matrix */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Matriz Cruzada de Correlaciones (12x12)
                </h3>
                <p className="text-xs text-slate-400">
                  Haz click en cualquier celda para cargar automáticamente ese par de métricas en el gráfico de equipos
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Positiva (+1.0)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-slate-700 inline-block" /> Neutra (0.0)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" /> Negativa (-1.0)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono text-center border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B]">
                    <th className="p-2 text-left text-slate-400 font-sans">Métrica</th>
                    {correlationData.keyMetrics.map((m) => (
                      <th key={m.id} className="p-2 text-slate-300 font-semibold whitespace-nowrap">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/50">
                  {correlationData.matrix.map((row) => (
                    <tr key={row.metricA.id} className="hover:bg-[#182338]/40">
                      <td className="p-2 text-left font-sans font-bold text-slate-300 whitespace-nowrap">
                        {row.metricA.label}
                        {row.metricA.lowerIsBetter && (
                          <span className="text-[10px] text-emerald-400 font-normal ml-1">⬇</span>
                        )}
                      </td>
                      {correlationData.keyMetrics.map((col) => {
                        const r = row.correlations[col.id] ?? 0;
                        const isSelf = row.metricA.id === col.id;

                        // Color background based on r
                        let bgClass = 'bg-slate-800/30 text-slate-400';
                        if (!isSelf) {
                          if (r >= 0.6) bgClass = 'bg-emerald-500/30 text-emerald-300 font-bold';
                          else if (r >= 0.3) bgClass = 'bg-emerald-500/15 text-emerald-400';
                          else if (r <= -0.6) bgClass = 'bg-rose-500/30 text-rose-300 font-bold';
                          else if (r <= -0.3) bgClass = 'bg-rose-500/15 text-rose-400';
                          else bgClass = 'bg-[#0B1120] text-slate-400';
                        } else {
                          bgClass = 'bg-orange-500/20 text-orange-400 font-bold';
                        }

                        return (
                          <td
                            key={col.id}
                            onClick={() => {
                              if (!isSelf) {
                                setTeamMetricXId(col.id);
                                setTeamMetricYId(row.metricA.id);
                                setActiveTab('teams');
                              }
                            }}
                            title={`Graficar ${row.metricA.label} vs ${col.label} (r = ${r.toFixed(2)})`}
                            className={`p-2 transition-transform cursor-pointer hover:scale-105 border border-[#1E293B]/30 ${bgClass}`}
                          >
                            {isSelf ? '1.0' : r.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
