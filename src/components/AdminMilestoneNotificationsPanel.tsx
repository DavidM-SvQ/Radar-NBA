import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Bell,
  BellOff,
  Check,
  Crown,
  Filter,
  Flame,
  Layers,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
  Zap,
} from 'lucide-react';
import type {
  MilestoneNotificationCountsPreview,
  MilestoneNotificationMinSeverity,
  MilestoneNotificationsConfig,
  MilestoneNotificationsConfigValues,
} from '../types/nba';
import {
  DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
  MILESTONE_NOTIFICATIONS_BOUNDS,
  fetchAdminMilestoneNotificationsConfig,
  previewAdminMilestoneNotificationsCounts,
  resetAdminMilestoneNotificationsDefaults,
  updateAdminMilestoneNotificationsConfig,
} from '../utils/adminAuthClient';
import type { ColumnHelpEntry } from '../utils/humanize';
import { MetricInfoTooltip } from './MetricUiHelpers';

interface AdminMilestoneNotificationsPanelProps {
  onLockSession?: () => void;
  onConfigSaved?: () => void;
}

type NotificationGroupTab =
  | 'all'
  | 'gameday'
  | 'defense_team'
  | 'heroic'
  | 'cumulative'
  | 'streaks';

type EntityScopeFilter = 'all' | 'player' | 'team';
type TriggerStatusFilter = 'all' | 'active' | 'off' | 'noisy';

const TEAM_ONLY_TRIGGER_KEYS = new Set<string>([
  'teamBlowoutEnabled',
  'teamSeasonWinsMilestoneEnabled',
  'teamWinStreakEnabled',
]);

const BOTH_ENTITY_TRIGGER_KEYS = new Set<string>([
  'imminentMilestonesEnabled',
]);

function getTriggerEntityScope(
  toggleKey: string
): 'player' | 'team' | 'both' {
  if (TEAM_ONLY_TRIGGER_KEYS.has(toggleKey)) return 'team';
  if (BOTH_ENTITY_TRIGGER_KEYS.has(toggleKey)) return 'both';
  return 'player';
}

type BooleanTriggerKey = {
  [K in keyof MilestoneNotificationsConfigValues]: MilestoneNotificationsConfigValues[K] extends boolean
    ? K
    : never;
}[keyof MilestoneNotificationsConfigValues];

type TriggerToggleKey = Exclude<BooleanTriggerKey, 'enabled' | 'dedupePlayerGame'>;

type NumericTriggerKey = keyof typeof MILESTONE_NOTIFICATIONS_BOUNDS;

interface NumericBaremoSpec {
  key: NumericTriggerKey;
  label: string;
  help: ColumnHelpEntry;
}

interface TriggerCardMeta {
  index: number;
  toggleKey: TriggerToggleKey;
  group: Exclude<NotificationGroupTab, 'all'>;
  title: string;
  description: string;
  badgePreview: string;
  help: ColumnHelpEntry;
  baremos: NumericBaremoSpec[];
}

const makeHelp = (
  title: string,
  simpleDesc: string,
  calculation: string
): ColumnHelpEntry => ({
  title,
  simpleDesc,
  calculation,
});

const MENU_TAB_HELP: Record<NotificationGroupTab, ColumnHelpEntry> = {
  all: makeHelp(
    'Catálogo completo (31 disparadores)',
    'Muestra juntos los 31 disparadores configurables del motor de notificaciones de RadarNBA.',
    'Puedes activar o apagar cada uno de forma independiente y ajustar sus baremos numéricos exactos.'
  ),
  gameday: makeHelp(
    'Actuaciones de Partido (12)',
    'Alertas basadas en estadísticas ofensivas, asistencias, rebotes, triples-dobles, récords personales de carrera y precisión individual.',
    'Útil para detectar noches históricas y exhibiciones de anotación, dirección o dominio en el rebote.'
  ),
  defense_team: makeHelp(
    'Defensa, Impacto y Equipo (4)',
    'Disparadores centrados en tapones, robos, valoración global Game Score, impacto +/- y exhibiciones colectivas.',
    'Permite capturar muros defensivos y victorias contundentes que no siempre lideran en puntos.'
  ),
  heroic: makeHelp(
    'Clutch & Buzzer Beaters (4)',
    'Canastas ganadoras sobre la bocina (0.0s), empates que fuerzan prórroga, Game Winners y tiros lejanos heroicos.',
    'Alimentado directamente por el módulo Play-by-Play oficial NBA.'
  ),
  cumulative: makeHelp(
    'Barreras Acumuladas de Temporada (8)',
    'Cruces de cifras redondas durante la campaña en Puntos, Triples, Rebotes, Rebotes Ofensivos, Asistencias, Robos, Tapones y Victorias de Equipo.',
    'Cada estadística tiene su propio interruptor y salto de barrera configurable.'
  ),
  streaks: makeHelp(
    'Inminentes & Rachas (3)',
    'Detecta jugadores "a las puertas" de un hito en el próximo partido, rachas activas individuales y rachas consecutivas de victorias de equipo.',
    'A diferencia de las victorias totales de temporada, las rachas de equipo solo cuentan victorias seguidas sin derrota.'
  ),
};

const TRIGGER_ITEMS: TriggerCardMeta[] = [
  // GRUPO 1: ACTUACIONES DE PARTIDO (11)
  {
    index: 1,
    toggleKey: 'scoringMilestoneEnabled',
    group: 'gameday',
    title: 'Explosión Anotadora (PTS)',
    description: 'Salta cuando un jugador alcanza o supera el baremo de puntos en un partido.',
    badgePreview: '40+ PTS',
    help: makeHelp(
      'Disparador #1 · Explosión Anotadora',
      'Detecta actuaciones individuales de altísima anotación en la ventana de jornadas configurada.',
      'Por defecto en 40 PTS. Bájalo a 30-35 para seguir a segundas espadas o súbelo a 50 para solo noches históricas.'
    ),
    baremos: [
      {
        key: 'scoringThreshold',
        label: 'Puntos mínimos en el partido',
        help: makeHelp('Umbral de puntos', 'Cantidad exacta de PTS necesarios en un solo partido para generar la alerta.', 'Rango permitido: 20 a 80 PTS.'),
      },
    ],
  },
  {
    index: 2,
    toggleKey: 'seasonHighPtsEnabled',
    group: 'gameday',
    title: 'Máximo de Temporada (Season High)',
    description: 'Avisa cuando un jugador bate su mejor marca del curso 2026-27 en PTS, REB, AST, 3PM, ROB o TAP superando los baremos destacados.',
    badgePreview: 'MAX TEMP',
    help: makeHelp(
      'Disparador #2 · Máximo de Temporada Multi-Estadística',
      'Compara la actuación de la noche con todos los partidos previos del jugador en 2026-27 en las 6 grandes estadísticas.',
      'Exige un mínimo de partidos previos y umbrales altos para destacar solo topes realmente llamativos. Si además bate su Career High en esa misma estadística, evita duplicar el aviso.'
    ),
    baremos: [
      {
        key: 'seasonHighMinGames',
        label: 'PJ mínimos previos en temporada',
        help: makeHelp('Muestra mínima previa', 'Partidos ya disputados en 2026-27 antes de emitir alertas de máximo de temporada.', 'Por defecto: 8 PJ (rango 2–30).'),
      },
      {
        key: 'seasonHighMinPts',
        label: 'Mínimo PTS para Season High',
        help: makeHelp('Suelo de puntos', 'Evita avisos por topes discretos (ej. 16 PTS). Súbelo a 35-40 para solo actuaciones top.', 'Por defecto: 35 PTS.'),
      },
      {
        key: 'seasonHighMinReb',
        label: 'Mínimo REB para Season High',
        help: makeHelp('Suelo de rebotes', 'Rebotes mínimos exigidos para notificar un máximo personal de temporada.', 'Por defecto: 16 REB.'),
      },
      {
        key: 'seasonHighMinAst',
        label: 'Mínimo AST para Season High',
        help: makeHelp('Suelo de asistencias', 'Asistencias mínimas exigidas para notificar un máximo personal de temporada.', 'Por defecto: 13 AST.'),
      },
      {
        key: 'seasonHighMin3pm',
        label: 'Mínimo 3PM para Season High',
        help: makeHelp('Suelo de triples', 'Triples anotados mínimos para notificar un máximo personal de temporada.', 'Por defecto: 7 3PM.'),
      },
      {
        key: 'seasonHighMinStlBlk',
        label: 'Mínimo ROB/TAP para Season High',
        help: makeHelp('Suelo de robos o tapones', 'Mínimo en robos o tapones para notificar un máximo personal de temporada.', 'Por defecto: 5.'),
      },
    ],
  },
  {
    index: 31,
    toggleKey: 'careerHighEnabled',
    group: 'gameday',
    title: 'Máximo de Carrera (Career High)',
    description: 'Alerta épica verificada contra toda la carrera NBA del jugador (desde 2003-04) en PTS, REB, AST, 3PM, ROB o TAP.',
    badgePreview: 'CAREER HIGH',
    help: makeHelp(
      'Disparador #31 · Máximo de Carrera Histórico',
      'Contrasta cada actuación de 2026-27 frente al histórico completo de carrera NBA del jugador.',
      'Exige un mínimo de partidos acumulados en carrera para evitar récords triviales de debutantes y umbrales destacados por estadística.'
    ),
    baremos: [
      {
        key: 'careerHighMinGames',
        label: 'PJ mínimos previos en carrera',
        help: makeHelp('Experiencia mínima NBA', 'Partidos oficiales previos exigidos en la carrera del jugador antes de lanzar avisos de Career High.', 'Por defecto: 30 PJ (rango 5–150).'),
      },
      {
        key: 'careerHighMinPts',
        label: 'Mínimo PTS para Career High',
        help: makeHelp('Mínimo puntos', 'Suelo de puntos para considerar destacado un nuevo récord personal de carrera.', 'Por defecto: 32 PTS.'),
      },
      {
        key: 'careerHighMinReb',
        label: 'Mínimo REB para Career High',
        help: makeHelp('Mínimo rebotes', 'Suelo de rebotes para activar la alerta de récord personal.', 'Por defecto: 15 REB.'),
      },
      {
        key: 'careerHighMinAst',
        label: 'Mínimo AST para Career High',
        help: makeHelp('Mínimo asistencias', 'Suelo de asistencias para activar la alerta de récord personal.', 'Por defecto: 12 AST.'),
      },
      {
        key: 'careerHighMin3pm',
        label: 'Mínimo 3PM para Career High',
        help: makeHelp('Mínimo triples', 'Suelo de triples anotados para activar la alerta de récord personal.', 'Por defecto: 7 3PM.'),
      },
      {
        key: 'careerHighMinStlBlk',
        label: 'Mínimo ROB/TAP para Career High',
        help: makeHelp('Mínimo robos o tapones', 'Suelo en robos o tapones para activar la alerta de récord personal.', 'Por defecto: 5.'),
      },
    ],
  },
  {
    index: 3,
    toggleKey: 'threePointExplosionEnabled',
    group: 'gameday',
    title: 'Lluvia de Triples (3PM)',
    description: 'Notifica recitales exteriores al alcanzar el mínimo configurado de triples anotados.',
    badgePreview: '8+ 3PM',
    help: makeHelp(
      'Disparador #3 · Lluvia de Triples',
      'Registra noches de gran acierto y volumen desde la línea de 3 puntos.',
      'Por defecto salta con 8 o más triples convertidos en un solo partido.'
    ),
    baremos: [
      {
        key: 'threePointThreshold',
        label: 'Triples mínimos anotados',
        help: makeHelp('Triples convertidos (3PM)', 'Número mínimo de triples encestados en el partido.', 'Rango: 4 a 16 triples.'),
      },
    ],
  },
  {
    index: 4,
    toggleKey: 'assistExplosionEnabled',
    group: 'gameday',
    title: 'Festival de Asistencias (AST)',
    description: 'Alerta cuando un generador de juego reparte un volumen extraordinario de asistencias.',
    badgePreview: '14+ AST',
    help: makeHelp(
      'Disparador #4 · Festival de Asistencias',
      'Destaca partidos de dominio absoluto en la creación y pase para compañeros.',
      'Por defecto salta a partir de 14 asistencias en un encuentro.'
    ),
    baremos: [
      {
        key: 'assistExplosionThreshold',
        label: 'Asistencias mínimas',
        help: makeHelp('Asistencias mínimas (AST)', 'Cantidad mínima de asistencias en una noche para lanzar alerta.', 'Rango: 8 a 25 AST.'),
      },
    ],
  },
  {
    index: 5,
    toggleKey: 'reboundExplosionEnabled',
    group: 'gameday',
    title: 'Dominio en el Rebote (REB)',
    description: 'Avisa ante capturas masivas en ambos aros durante un partido.',
    badgePreview: '18+ REB',
    help: makeHelp(
      'Disparador #5 · Dominio en el Rebote Total',
      'Captura noches en las que un interior o jugador versátil barre los tableros.',
      'Por defecto configurado en 18 rebotes totales.'
    ),
    baremos: [
      {
        key: 'reboundExplosionThreshold',
        label: 'Rebotes totales mínimos',
        help: makeHelp('Rebotes totales (REB)', 'Suma de rebotes defensivos y ofensivos exigida en un partido.', 'Rango: 10 a 30 REB.'),
      },
    ],
  },
  {
    index: 6,
    toggleKey: 'orebExplosionEnabled',
    group: 'gameday',
    title: 'Rey del Rebote Ofensivo (OREB)',
    description: 'Destaca especialistas que generan segundas oportunidades constantes en aro rival.',
    badgePreview: '7+ OREB',
    help: makeHelp(
      'Disparador #6 · Rey del Rebote Ofensivo',
      'Aísla el impacto en el rebote de ataque, clave para ganar posesiones extra.',
      'Por defecto salta con 7 o más rebotes ofensivos en una noche.'
    ),
    baremos: [
      {
        key: 'orebExplosionThreshold',
        label: 'Rebotes ofensivos mínimos',
        help: makeHelp('Rebotes ofensivos (OREB)', 'Mínimo de capturas en ataque exigidas en un encuentro.', 'Rango: 4 a 15 OREB.'),
      },
    ],
  },
  {
    index: 7,
    toggleKey: 'tripleDoubleEnabled',
    group: 'gameday',
    title: 'Triples-Dobles Oficiales',
    description: 'Salta cuando un jugador alcanza el mínimo configurado en Puntos, Rebotes Totales y Asistencias.',
    badgePreview: 'TRIPLE-DOBLE',
    help: makeHelp(
      'Disparador #7 · Triples-Dobles Oficiales (PTS · REB · AST)',
      'Evalúa exclusivamente Puntos, Rebotes Totales y Asistencias en el partido. No tiene en cuenta robos ni tapones.',
      'El estándar NBA es 10 en cada una de las 3 categorías, pero puedes ajustarlo (ej. 12 para triples-dobles gigantes u 8 para casi triples-dobles).'
    ),
    baremos: [
      {
        key: 'tripleDoubleMinStat',
        label: 'Mínimo en PTS, REB y AST',
        help: makeHelp('Baremo oficial (PTS, REB y AST)', 'Valor mínimo simultáneo que debe alcanzar en Puntos, Rebotes Totales y Asistencias.', 'Estándar oficial NBA = 10.'),
      },
    ],
  },
  {
    index: 8,
    toggleKey: 'twentyTwentyEnabled',
    group: 'gameday',
    title: 'Exhibiciones Combinadas (20-20 / 20-15)',
    description: 'Fija tú mismo el baremo mínimo de Puntos y de Rebotes o Asistencias simultáneos.',
    badgePreview: '20-20 / 20-15',
    help: makeHelp(
      'Disparador #8 · Exhibiciones Combinadas',
      'Detecta partidos monstruosos que combinan alta anotación con dominio reboteador o asistente.',
      'Pon 20 PTS y 20 R/A si quieres únicamente 20-20 puros, o 20 PTS y 15 R/A para incluir 20-15.'
    ),
    baremos: [
      {
        key: 'twentyTwentyPtsMin',
        label: 'Puntos mínimos exigidos',
        help: makeHelp('Baremo de Puntos', 'Anotación mínima requerida junto al baremo secundario de rebotes o asistencias.', 'Por defecto: 20 PTS.'),
      },
      {
        key: 'twentyTwentySecMin',
        label: 'Rebotes o Asistencias mínimas',
        help: makeHelp('Baremo secundario (REB o AST)', 'Mínimo que debe alcanzar en rebotes O en asistencias. Si fijas 20 solo saltan 20-20; con 15 entran 20-15.', 'Por defecto: 15.'),
      },
    ],
  },
  {
    index: 9,
    toggleKey: 'doubleDoubleEnabled',
    group: 'gameday',
    title: 'Dobles-Dobles Destacados',
    description: 'Incluye dobles-dobles filtrados por anotación mínima para evitar saturar la bandeja.',
    badgePreview: 'DOBLE-DOBLE',
    help: makeHelp(
      'Disparador #9 · Dobles-Dobles Filtrados',
      'Activa alertas para dobles-dobles clásicos (≥10 en dos apartados) siempre que alcancen tus puntos mínimos.',
      'Desactivado por defecto para priorizar gestas más raras; al activarlo puedes subir el mínimo a 25 PTS si quieres solo élite.'
    ),
    baremos: [
      {
        key: 'doubleDoubleMinPts',
        label: 'Puntos mínimos del doble-doble',
        help: makeHelp('Filtro de puntos en doble-doble', 'Evita alertas de dobles-dobles discretos (ej. 10 PTS + 10 REB) exigiendo mayor anotación.', 'Rango: 10 a 35 PTS.'),
      },
    ],
  },
  {
    index: 10,
    toggleKey: 'efficiencySniperEnabled',
    group: 'gameday',
    title: 'Francotirador Letal (% TC)',
    description: 'Noches de altísima efectividad en tiro de campo con volumen relevante de puntos.',
    badgePreview: '25P · 75% TC',
    help: makeHelp(
      'Disparador #10 · Francotirador Letal',
      'Premia actuaciones ultraeficientes (mínimo 8 tiros de campo intentados) donde casi todo entra.',
      'Ejemplo típico: 28 puntos con 11/13 en tiros de campo (84.6% TC).'
    ),
    baremos: [
      {
        key: 'efficiencyMinPts',
        label: 'Puntos mínimos',
        help: makeHelp('Puntos mínimos para eficiencia', 'Evita que un pívot con 4/4 mates (8 PTS) dispare la alerta.', 'Por defecto: 25 PTS.'),
      },
      {
        key: 'efficiencyMinFgPct',
        label: 'Acierto mínimo en Tiros de Campo (%)',
        help: makeHelp('Porcentaje mínimo TC%', 'Porcentaje de tiro de campo mínimo exigido en la noche.', 'Rango: 60% a 95%.'),
      },
    ],
  },
  {
    index: 11,
    toggleKey: 'cleanPlaymakerEnabled',
    group: 'gameday',
    title: 'Dirección Impecable (0 Pérdidas)',
    description: 'Partidos de alto control repartiendo juego y anotando sin cometer ninguna pérdida.',
    badgePreview: '8+ AST · 0 PER',
    help: makeHelp(
      'Disparador #11 · Dirección Impecable (0 PER)',
      'Detecta noches quirúrgicas de bases y generadores con 0 turnovers en su casillero.',
      'Exige un mínimo de asistencias y puntos para destacar partidos completos de verdad.'
    ),
    baremos: [
      {
        key: 'cleanPlaymakerMinAst',
        label: 'Asistencias mínimas (con 0 pérdidas)',
        help: makeHelp('Asistencias mínimas', 'Pases de canasta mínimos manteniendo exactamente 0 pérdidas de balón.', 'Por defecto: 8 AST.'),
      },
      {
        key: 'cleanPlaymakerMinPts',
        label: 'Puntos mínimos',
        help: makeHelp('Puntos mínimos', 'Anotación mínima que debe acompañar la noche limpia en dirección.', 'Por defecto: 15 PTS.'),
      },
    ],
  },

  // GRUPO 2: DEFENSA, IMPACTO Y EQUIPO (4)
  {
    index: 12,
    toggleKey: 'defenseMilestoneEnabled',
    group: 'defense_team',
    title: 'Muros Defensivos (Tapones y Robos)',
    description: 'Configura exactamente cuántos tapones, robos o combinación simultánea disparan la alerta.',
    badgePreview: 'MURO DEF',
    help: makeHelp(
      'Disparador #12 · Muros Defensivos (Configurable)',
      'Salta si el jugador alcanza el baremo de Tapones, O el baremo de Robos, O el baremo combinado (ambos a la vez en el mismo partido).',
      'Así puedes exigir p. ej. 6 tapones, 5 robos o 3 robos + 3 tapones según tu criterio.'
    ),
    baremos: [
      {
        key: 'defenseMinBlk',
        label: 'Tapones mínimos (vía directa)',
        help: makeHelp('Tapones mínimos (TAP)', 'Salta automáticamente si coloca al menos este número de tapones.', 'Rango: 3 a 12 TAP.'),
      },
      {
        key: 'defenseMinStl',
        label: 'Robos mínimos (vía directa)',
        help: makeHelp('Robos mínimos (ROB)', 'Salta automáticamente si consigue al menos este número de robos.', 'Rango: 3 a 12 ROB.'),
      },
      {
        key: 'defenseComboMinEach',
        label: 'Mínimo simultáneo (ROB y TAP a la vez)',
        help: makeHelp('Combo defensivo (Robos + Tapones)', 'Salta cuando logra al menos X robos Y además X tapones en el mismo encuentro (ej. ≥3 ROB y ≥3 TAP).', 'Rango: 2 a 6 en cada uno.'),
      },
    ],
  },
  {
    index: 13,
    toggleKey: 'gameScoreMilestoneEnabled',
    group: 'defense_team',
    title: 'Valoración MVP de la Noche (Game Score)',
    description: 'Alerta integral cuando la estadística global Hollinger Game Score alcanza nivel MVP.',
    badgePreview: '38+ GmSc',
    help: makeHelp(
      'Disparador #13 · Valoración Hollinger Game Score',
      'Resume todo el boxscore (puntos, porcentajes, rebotes, asistencias, robos, tapones menos fallos y pérdidas) en una única nota.',
      'Por encima de 38-40 GmSc se considera una de las mejores actuaciones de la semana NBA.'
    ),
    baremos: [
      {
        key: 'gameScoreThreshold',
        label: 'Game Score mínimo',
        help: makeHelp('Umbral de Game Score', 'Puntuación mínima global en el partido.', 'Rango: 25 a 60 GmSc.'),
      },
    ],
  },
  {
    index: 14,
    toggleKey: 'plusMinusMilestoneEnabled',
    group: 'defense_team',
    title: 'Impacto Extremo en Pista (+/-)',
    description: 'Detecta noches donde el equipo arrolla al rival mientras el jugador está en cancha.',
    badgePreview: '+25 (+/-)',
    help: makeHelp(
      'Disparador #14 · Impacto Plus/Minus (+/-)',
      'Identifica jugadores con un parcial acumulado descomunal durante sus minutos en pista.',
      'Desactivado por defecto para no duplicar en palizas; actívalo para cazar impacto invisible.'
    ),
    baremos: [
      {
        key: 'plusMinusThreshold',
        label: 'Plus/Minus mínimo (+)',
        help: makeHelp('Diferencial mínimo con él en pista', 'Parcial positivo mínimo del equipo mientras el jugador disputa minutos.', 'Rango: +15 a +45.'),
      },
    ],
  },
  {
    index: 15,
    toggleKey: 'teamBlowoutEnabled',
    group: 'defense_team',
    title: 'Paliza o Festival Colectivo de Equipo',
    description: 'Avisa cuando una franquicia gana por paliza o supera un tope anotador colectivo.',
    badgePreview: '+25 DIF / 135P',
    help: makeHelp(
      'Disparador #15 · Exhibición Colectiva de Equipo',
      'Salta cuando un equipo gana superando el margen de diferencia O superando el umbral de puntos anotados.',
      'Ideal para localizar rápido los partidos más desequilibrados o espectaculares en ataque.'
    ),
    baremos: [
      {
        key: 'teamMarginThreshold',
        label: 'Margen mínimo de victoria (PTS)',
        help: makeHelp('Diferencia mínima en el marcador', 'Ventaja mínima al bocinazo final para considerarse paliza.', 'Por defecto: +25 PTS.'),
      },
      {
        key: 'teamPointsThreshold',
        label: 'Anotación colectiva mínima (PTS)',
        help: makeHelp('Tope ofensivo colectivo', 'Salta también si el equipo gana anotando al menos esta cifra de puntos.', 'Por defecto: 135 PTS.'),
      },
    ],
  },

  // GRUPO 3: CLUTCH & BUZZER BEATERS (4)
  {
    index: 16,
    toggleKey: 'heroicBuzzerEnabled',
    group: 'heroic',
    title: 'Buzzer Beaters Ganadores (0.0s)',
    description: 'Alerta épica ante lanzamientos sobre la bocina final que deciden el partido.',
    badgePreview: '⚡ BB 0.0s',
    help: makeHelp(
      'Disparador #16 · Buzzer Beaters (0.0s)',
      'Notifica exclusivamente tiros ganadores en el último suspiro con el reloj expirando en 0.0 segundos.',
      'Clasificación verificada en el Play-by-Play oficial NBA.'
    ),
    baremos: [],
  },
  {
    index: 17,
    toggleKey: 'heroicOtTieEnabled',
    group: 'heroic',
    title: 'Empates sobre la Bocina (Prórroga)',
    description: 'Avisa cuando un tiro en 0.0s iguala el marcador para enviar el duelo a prórroga.',
    badgePreview: '⏱️ EMPATE OT',
    help: makeHelp(
      'Disparador #17 · Empate sobre la Bocina (OT)',
      'Separado de los ganadores directos para que decidas si recibir también las canastas que fuerzan el tiempo extra.',
      'Incluye enlace directo a la jornada del partido.'
    ),
    baremos: [],
  },
  {
    index: 18,
    toggleKey: 'heroicGameWinnerEnabled',
    group: 'heroic',
    title: 'Game Winners en Cierre',
    description: 'Canastas definitivas que ponen por delante al ganador dentro de los últimos segundos.',
    badgePreview: '🎯 GW ≤10s',
    help: makeHelp(
      'Disparador #18 · Game Winners (Ventana Configurable)',
      'Detecta la acción ganadora cuando el rival ya no vuelve a anotar por delante.',
      'Puedes ajustar cuántos segundos finales consideras cierre heroico (por defecto ≤10 segundos).'
    ),
    baremos: [
      {
        key: 'heroicGameWinnerMaxSec',
        label: 'Segundos máximos restantes en reloj',
        help: makeHelp('Ventana de cierre Game Winner', 'Tiempo máximo que puede quedar en el cuarto período o prórroga tras la canasta.', 'Por defecto: 10 seg. (rango 1–24s).'),
      },
    ],
  },
  {
    index: 19,
    toggleKey: 'heroicLongRangeEnabled',
    group: 'heroic',
    title: 'Canasta Heroica de Larga Distancia',
    description: 'Alerta especial si un tiro decisivo se anota desde muy lejos (ej. casi medio campo).',
    badgePreview: '📏 38+ ft',
    help: makeHelp(
      'Disparador #19 · Distancia Extrema en Cierre',
      'Evalúa la distancia exacta en pies respecto al aro de los tiros clutch registrados.',
      'La línea de triple está a 23.75 ft y medio campo a 47 ft.'
    ),
    baremos: [
      {
        key: 'heroicLongRangeMinFt',
        label: 'Distancia mínima al aro (pies)',
        help: makeHelp('Distancia mínima (ft)', 'A partir de qué distancia se considera un lanzamiento lejano extraordinario.', 'Por defecto: 38 ft (~11.6 metros).'),
      },
    ],
  },

  // GRUPO 4: BARRERAS ACUMULADAS DE TEMPORADA (8)
  {
    index: 20,
    toggleKey: 'cumPointsEnabled',
    group: 'cumulative',
    title: 'Barrera Acumulada: Puntos (PTS)',
    description: 'Avisa cada vez que un jugador cruza un múltiplo redondo de puntos en la temporada.',
    badgePreview: 'PTS TEMP',
    help: makeHelp(
      'Disparador #20 · Barreras de Puntos Totales',
      'Suma partido a partido los puntos del curso 2026-27 y salta al cruzar cada escalón (500, 1.000, 1.500...).',
      'Ajusta el salto si prefieres recibir hitos cada 250 PTS o solo cada 1.000 PTS.'
    ),
    baremos: [
      {
        key: 'seasonPointsStep',
        label: 'Salto de barrera en Puntos',
        help: makeHelp('Intervalo de puntos', 'Cada cuántos puntos acumulados en temporada salta la notificación.', 'Por defecto: cada 500 PTS.'),
      },
    ],
  },
  {
    index: 21,
    toggleKey: 'cum3pmEnabled',
    group: 'cumulative',
    title: 'Barrera Acumulada: Triples (3PM)',
    description: 'Notifica hitos redondos de triples anotados en lo que va de campaña.',
    badgePreview: '3PM TEMP',
    help: makeHelp(
      'Disparador #21 · Barreras de Triples Anotados',
      'Controla los múltiplos redondos de triples convertidos (100, 200, 300 triples...).',
      'Con salto de 50 recibe avisos más frecuentes de tiradores de volumen medio.'
    ),
    baremos: [
      {
        key: 'season3pmStep',
        label: 'Salto de barrera en Triples',
        help: makeHelp('Intervalo de triples', 'Cada cuántos triples acumulados en temporada salta la alerta.', 'Por defecto: cada 100 3PM.'),
      },
    ],
  },
  {
    index: 22,
    toggleKey: 'cumRebEnabled',
    group: 'cumulative',
    title: 'Barrera Acumulada: Rebotes Totales (REB)',
    description: 'Salta cuando un jugador cruza escalones redondos de rebotes capturados.',
    badgePreview: 'REB TEMP',
    help: makeHelp(
      'Disparador #22 · Barreras de Rebotes Totales',
      'Monitoriza los múltiplos acumulados de rebotes en temporada regular 2026-27.',
      'Por defecto salta cada 200 rebotes (200, 400, 600, 800...).'
    ),
    baremos: [
      {
        key: 'seasonRebStep',
        label: 'Salto de barrera en Rebotes',
        help: makeHelp('Intervalo de rebotes totales', 'Cada cuántos rebotes acumulados salta la notificación.', 'Por defecto: cada 200 REB.'),
      },
    ],
  },
  {
    index: 23,
    toggleKey: 'cumOrebEnabled',
    group: 'cumulative',
    title: 'Barrera Acumulada: Rebotes Ofensivos (OREB)',
    description: 'Controla los hitos acumulados en el rebote ofensivo durante toda la temporada.',
    badgePreview: 'OREB TEMP',
    help: makeHelp(
      'Disparador #23 · Barreras de Rebotes Ofensivos',
      'Detecta cuándo pívots y reboteadores incansables alcanzan cifras redondas de capturas en ataque.',
      'Por defecto salta cada 50 OREB (50, 100, 150, 200...).'
    ),
    baremos: [
      {
        key: 'seasonOrebStep',
        label: 'Salto de barrera en Rebotes Ofensivos',
        help: makeHelp('Intervalo de rebotes ofensivos', 'Cada cuántos rebotes ofensivos acumulados salta la alerta.', 'Por defecto: cada 50 OREB.'),
      },
    ],
  },
  {
    index: 24,
    toggleKey: 'cumAstEnabled',
    group: 'cumulative',
    title: 'Barrera Acumulada: Asistencias (AST)',
    description: 'Avisa al superar marcas redondas de asistencias repartidas en la temporada.',
    badgePreview: 'AST TEMP',
    help: makeHelp(
      'Disparador #24 · Barreras de Asistencias',
      'Sigue el progreso anual de los mejores asistentes de la NBA al cruzar cada bloque.',
      'Por defecto salta cada 150 AST (150, 300, 450, 600...).'
    ),
    baremos: [
      {
        key: 'seasonAstStep',
        label: 'Salto de barrera en Asistencias',
        help: makeHelp('Intervalo de asistencias', 'Cada cuántas asistencias acumuladas en la temporada salta la notificación.', 'Por defecto: cada 150 AST.'),
      },
    ],
  },
  {
    index: 25,
    toggleKey: 'cumStlEnabled',
    group: 'cumulative',
    title: 'Barrera Acumulada: Robos de Balón (STL)',
    description: 'Notifica cuando un defensor cruza múltiplos de robos en la temporada.',
    badgePreview: 'STL TEMP',
    help: makeHelp(
      'Disparador #25 · Barreras de Robos',
      'Destaca a los especialistas de líneas de pase conforme alcanzan cifras redondas.',
      'Por defecto salta cada 30 robos (30, 60, 90, 120...).'
    ),
    baremos: [
      {
        key: 'seasonStlStep',
        label: 'Salto de barrera en Robos',
        help: makeHelp('Intervalo de robos', 'Cada cuántos robos acumulados salta la notificación.', 'Por defecto: cada 30 STL.'),
      },
    ],
  },
  {
    index: 26,
    toggleKey: 'cumBlkEnabled',
    group: 'cumulative',
    title: 'Barrera Acumulada: Tapones (BLK)',
    description: 'Avisa al cruzar múltiplos redondos de tapones colocados en la campaña.',
    badgePreview: 'BLK TEMP',
    help: makeHelp(
      'Disparador #26 · Barreras de Tapones',
      'Reconoce a los protectores del aro cuando superan hitos acumulados en temporada.',
      'Por defecto salta cada 30 tapones (30, 60, 90, 120...).'
    ),
    baremos: [
      {
        key: 'seasonBlkStep',
        label: 'Salto de barrera en Tapones',
        help: makeHelp('Intervalo de tapones', 'Cada cuántos tapones acumulados en temporada salta la notificación.', 'Por defecto: cada 30 BLK.'),
      },
    ],
  },
  {
    index: 27,
    toggleKey: 'teamSeasonWinsMilestoneEnabled',
    group: 'cumulative',
    title: 'Barrera Acumulada: Victorias de Equipo en Temporada',
    description: 'Avisa cuando una franquicia alcanza 10, 20, 30, 40 o 50 triunfos totales en el curso.',
    badgePreview: '10V / 20V TEMP',
    help: makeHelp(
      'Disparador #27 · Victorias Totales de Temporada',
      'Cuenta los triunfos totales acumulados desde el inicio del curso (por ejemplo, alcanzar las 10 victorias), independientemente de si fueron seguidas o no.',
      'Totalmente independiente del disparador #30 de victorias consecutivas.'
    ),
    baremos: [
      {
        key: 'teamSeasonWinsStep',
        label: 'Salto de victorias acumuladas',
        help: makeHelp('Intervalo de victorias de temporada', 'Cada cuántas victorias totales de temporada se lanza la alerta (5, 10, 15, 20...).', 'Por defecto: cada 10 victorias.'),
      },
    ],
  },

  // GRUPO 5: INMINENTES & RACHAS (3)
  {
    index: 28,
    toggleKey: 'imminentMilestonesEnabled',
    group: 'streaks',
    title: 'Hitos Inminentes ("A las puertas")',
    description: 'Avisa antes del próximo partido cuando un jugador o equipo está a punto de cruzar una barrera.',
    badgePreview: 'A LAS PUERTAS',
    help: makeHelp(
      'Disparador #28 · Hitos Inminentes',
      'Analiza qué jugadores están dentro del margen configurado para alcanzar su siguiente barrera de PTS, 3PM, REB, OREB, AST, STL, BLK o victorias.',
      'Permite anticipar qué partidos vigilar esta noche para presenciar un hito en directo.'
    ),
    baremos: [
      {
        key: 'imminentPtsWithin',
        label: 'Margen inminente en Puntos (≤ PTS)',
        help: makeHelp('Distancia máxima en PTS', 'Salta si al jugador le faltan estos puntos o menos para su siguiente múltiplo de temporada.', 'Por defecto: ≤25 PTS.'),
      },
      {
        key: 'imminentOtherWithin',
        label: 'Margen base en otras stats (3PM/REB/AST…)',
        help: makeHelp('Distancia base en otras categorías', 'Margen en triples y rebotes ofensivos (se duplica automáticamente en REB/AST totales).', 'Por defecto: ≤5.'),
      },
    ],
  },
  {
    index: 29,
    toggleKey: 'streakMilestoneEnabled',
    group: 'streaks',
    title: 'Rachas Individuales Activas (Jugadores)',
    description: 'Salta cuando un jugador encadena partidos consecutivos anotando, reboteando o asistiendo.',
    badgePreview: 'RACHA JUGADOR',
    help: makeHelp(
      'Disparador #29 · Rachas Activas de Jugadores',
      'Detecta series consecutivas vigentes (y rupturas de racha) de X+ PTS, 10+ REB, 10+ AST o 3+ Triples.',
      'Ambos parámetros (partidos mínimos y umbral de puntos) son ajustables.'
    ),
    baremos: [
      {
        key: 'streakMinGames',
        label: 'Partidos consecutivos mínimos',
        help: makeHelp('Longitud mínima de racha', 'Número mínimo de partidos seguidos cumpliendo la condición estadística.', 'Por defecto: 7 PJ.'),
      },
      {
        key: 'streakPtsThreshold',
        label: 'Umbral base de puntos para rachas anotadoras',
        help: makeHelp('Puntos por partido en la racha', 'Define la marca mínima de PTS consecutivos (también vigila el escalón +10 superior).', 'Por defecto: 20+ PTS.'),
      },
    ],
  },
  {
    index: 30,
    toggleKey: 'teamWinStreakEnabled',
    group: 'streaks',
    title: 'Racha de Victorias Consecutivas (Equipos)',
    description: 'Alerta exclusivamente cuando una franquicia encadena triunfos seguidos sin perder (o se corta la serie).',
    badgePreview: '5V SEGUIDAS',
    help: makeHelp(
      'Disparador #30 · Victorias Consecutivas de Equipo',
      'Cuenta estrictamente partidos seguidos ganados ordenados por fecha desde el último encuentro disputado (ej. 7V seguidas de Miami o 5V de NYK/PHI).',
      'También notifica si se rompe una racha activa de al menos este mínimo.'
    ),
    baremos: [
      {
        key: 'teamWinStreakMin',
        label: 'Victorias consecutivas mínimas',
        help: makeHelp('Racha mínima de triunfos seguidos', 'A partir de cuántas victorias seguidas sin derrota aparece la alerta de racha de equipo.', 'Por defecto: 5 V seguidas (rango 2–20).'),
      },
    ],
  },
];

function getLiveBadgePreview(
  toggleKey: TriggerToggleKey,
  cfg: MilestoneNotificationsConfigValues,
  fallback: string
): string {
  switch (toggleKey) {
    case 'scoringMilestoneEnabled':
      return `${cfg.scoringThreshold}+ PTS`;
    case 'seasonHighPtsEnabled':
      return `MÁX ${cfg.seasonHighMinPts}P/${cfg.seasonHighMinReb}R/${cfg.seasonHighMinAst}A`;
    case 'careerHighEnabled':
      return `CH ${cfg.careerHighMinPts}P/${cfg.careerHighMinReb}R/${cfg.careerHighMinAst}A`;
    case 'threePointExplosionEnabled':
      return `${cfg.threePointThreshold}+ 3PM`;
    case 'assistExplosionEnabled':
      return `${cfg.assistExplosionThreshold}+ AST`;
    case 'reboundExplosionEnabled':
      return `${cfg.reboundExplosionThreshold}+ REB`;
    case 'orebExplosionEnabled':
      return `${cfg.orebExplosionThreshold}+ OREB`;
    case 'tripleDoubleEnabled':
      return `TD ≥${cfg.tripleDoubleMinStat}`;
    case 'twentyTwentyEnabled':
      return `${cfg.twentyTwentyPtsMin}-${cfg.twentyTwentySecMin}`;
    case 'doubleDoubleEnabled':
      return `DD ≥${cfg.doubleDoubleMinPts}P`;
    case 'efficiencySniperEnabled':
      return `${cfg.efficiencyMinPts}P · ${cfg.efficiencyMinFgPct}% TC`;
    case 'cleanPlaymakerEnabled':
      return `${cfg.cleanPlaymakerMinAst}+ AST · 0 PER`;
    case 'defenseMilestoneEnabled':
      return `${cfg.defenseMinBlk}T / ${cfg.defenseMinStl}R / ${cfg.defenseComboMinEach}+${cfg.defenseComboMinEach}`;
    case 'gameScoreMilestoneEnabled':
      return `${cfg.gameScoreThreshold}+ GmSc`;
    case 'plusMinusMilestoneEnabled':
      return `+${cfg.plusMinusThreshold} (+/-)`;
    case 'teamBlowoutEnabled':
      return `+${cfg.teamMarginThreshold} DIF / ${cfg.teamPointsThreshold}P`;
    case 'heroicGameWinnerEnabled':
      return `🎯 GW ≤${cfg.heroicGameWinnerMaxSec}s`;
    case 'heroicLongRangeEnabled':
      return `📏 ${cfg.heroicLongRangeMinFt}+ ft`;
    case 'cumPointsEnabled':
      return `c/${cfg.seasonPointsStep} PTS`;
    case 'cum3pmEnabled':
      return `c/${cfg.season3pmStep} 3PM`;
    case 'cumRebEnabled':
      return `c/${cfg.seasonRebStep} REB`;
    case 'cumOrebEnabled':
      return `c/${cfg.seasonOrebStep} OREB`;
    case 'cumAstEnabled':
      return `c/${cfg.seasonAstStep} AST`;
    case 'cumStlEnabled':
      return `c/${cfg.seasonStlStep} STL`;
    case 'cumBlkEnabled':
      return `c/${cfg.seasonBlkStep} BLK`;
    case 'teamSeasonWinsMilestoneEnabled':
      return `c/${cfg.teamSeasonWinsStep}V temp.`;
    case 'imminentMilestonesEnabled':
      return `≤${cfg.imminentPtsWithin}P / ≤${cfg.imminentOtherWithin}`;
    case 'streakMilestoneEnabled':
      return `${cfg.streakMinGames} PJ · ${cfg.streakPtsThreshold}+P`;
    case 'teamWinStreakEnabled':
      return `${cfg.teamWinStreakMin}V SEGUIDAS`;
    default:
      return fallback;
  }
}

function NumericStepInput({
  value,
  min,
  max,
  step,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commitText = (raw: string, clampOnInvalid: boolean) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (clampOnInvalid) setText(String(value));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      if (clampOnInvalid) setText(String(value));
      return;
    }
    const rounded = Math.round(parsed);
    if (rounded >= min && rounded <= max) {
      if (rounded !== value) {
        onCommit(rounded);
      }
      if (clampOnInvalid) setText(String(rounded));
    } else if (clampOnInvalid) {
      const clamped = Math.min(max, Math.max(min, rounded));
      onCommit(clamped);
      setText(String(clamped));
    }
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        commitText(raw, false);
      }}
      onBlur={() => commitText(text, true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commitText(text, true);
          e.currentTarget.blur();
        }
      }}
      className="w-14 h-7 bg-[#131C2E] border border-[#1E293B] rounded-md text-center text-xs font-mono tabular-nums font-semibold text-orange-300 focus:outline-none focus:border-orange-500"
    />
  );
}

function stripUpdatedAt(
  cfg: MilestoneNotificationsConfig | MilestoneNotificationsConfigValues
): MilestoneNotificationsConfigValues {
  const { ...rest } = cfg as MilestoneNotificationsConfig;
  if ('updatedAt' in rest) {
    delete (rest as { updatedAt?: number }).updatedAt;
  }
  return {
    ...DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
    ...rest,
  };
}

export function AdminMilestoneNotificationsPanel({
  onLockSession,
  onConfigSaved,
}: AdminMilestoneNotificationsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [activeGroup, setActiveGroup] = useState<NotificationGroupTab>('all');
  const [entityScopeFilter, setEntityScopeFilter] =
    useState<EntityScopeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<TriggerStatusFilter>('all');

  const [savedConfig, setSavedConfig] = useState<MilestoneNotificationsConfigValues>(
    DEFAULT_MILESTONE_NOTIFICATIONS_VALUES
  );
  const [draft, setDraft] = useState<MilestoneNotificationsConfigValues>(
    DEFAULT_MILESTONE_NOTIFICATIONS_VALUES
  );
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const [previewCounts, setPreviewCounts] =
    useState<MilestoneNotificationCountsPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    const res = await fetchAdminMilestoneNotificationsConfig();
    setLoading(false);
    if (res.unauthorized && onLockSession) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      const clean = stripUpdatedAt(res.config);
      setSavedConfig(clean);
      setDraft(clean);
      setUpdatedAt(res.config.updatedAt || 0);
    } else if (res.error) {
      setFeedback({ kind: 'error', text: res.error });
    }
  }, [onLockSession]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (loading) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      setPreviewError(null);
      const res = await previewAdminMilestoneNotificationsCounts(
        draft,
        controller.signal
      );
      if (controller.signal.aborted) return;
      setLoadingPreview(false);
      if (res.unauthorized && onLockSession) {
        onLockSession();
        return;
      }
      if (res.ok && res.preview) {
        setPreviewCounts(res.preview);
      } else if (res.error) {
        setPreviewError(res.error);
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, loading, onLockSession]);

  const isDirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(savedConfig);
  }, [draft, savedConfig]);

  const activeTriggersCount = useMemo(() => {
    return TRIGGER_ITEMS.filter((item) => draft[item.toggleKey]).length;
  }, [draft]);

  const topNoiseTriggers = useMemo(() => {
    if (!previewCounts?.recentCounts) return [];
    return TRIGGER_ITEMS.filter((item) => draft[item.toggleKey])
      .map((item) => ({
        item,
        recent: Number(previewCounts.recentCounts[item.toggleKey] || 0),
        season: Number(previewCounts.seasonCounts[item.toggleKey] || 0),
      }))
      .filter((entry) => entry.recent > 0)
      .sort((a, b) => b.recent - a.recent || b.season - a.season)
      .slice(0, 4);
  }, [draft, previewCounts]);

  const filteredItems = useMemo(() => {
    return TRIGGER_ITEMS.filter((item) => {
      if (activeGroup !== 'all' && item.group !== activeGroup) return false;
      const scope = getTriggerEntityScope(item.toggleKey);
      if (entityScopeFilter === 'player' && scope !== 'player' && scope !== 'both') {
        return false;
      }
      if (entityScopeFilter === 'team' && scope !== 'team' && scope !== 'both') {
        return false;
      }
      if (statusFilter === 'active' && !draft[item.toggleKey]) return false;
      if (statusFilter === 'off' && draft[item.toggleKey]) return false;
      if (statusFilter === 'noisy') {
        const sCount = previewCounts?.seasonCounts?.[item.toggleKey] ?? 0;
        const rCount = previewCounts?.recentCounts?.[item.toggleKey] ?? 0;
        const threshold = item.toggleKey === 'imminentMilestonesEnabled' ? 12 : 40;
        if (sCount <= threshold && rCount < 4) return false;
      }
      return true;
    });
  }, [activeGroup, entityScopeFilter, statusFilter, draft, previewCounts]);

  const toggleBool = (key: BooleanTriggerKey) => {
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
    setFeedback(null);
  };

  const setMinSeverity = (next: MilestoneNotificationMinSeverity) => {
    setDraft((prev) => ({ ...prev, minSeverity: next }));
    setFeedback(null);
  };

  const setNumeric = (key: NumericTriggerKey, rawValue: number) => {
    const b = MILESTONE_NOTIFICATIONS_BOUNDS[key];
    const clamped = Math.min(b.max, Math.max(b.min, Math.round(rawValue)));
    setDraft((prev) => ({ ...prev, [key]: clamped }));
    setFeedback(null);
  };

  const applyPreset = (preset: 'essential' | 'epic' | 'total') => {
    setFeedback(null);
    if (preset === 'essential') {
      setDraft({
        ...DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
        enabled: true,
        minSeverity: 'all',
        dedupePlayerGame: true,
      });
    } else if (preset === 'epic') {
      setDraft({
        ...DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
        enabled: true,
        lookbackDays: 5,
        maxNotifications: 25,
        minSeverity: 'epic',
        dedupePlayerGame: true,
        scoringThreshold: 50,
        seasonHighPtsEnabled: false,
        careerHighEnabled: true,
        careerHighMinGames: 50,
        careerHighMinPts: 40,
        careerHighMinReb: 18,
        careerHighMinAst: 15,
        careerHighMin3pm: 8,
        careerHighMinStlBlk: 6,
        threePointThreshold: 9,
        assistExplosionThreshold: 16,
        reboundExplosionThreshold: 20,
        orebExplosionThreshold: 9,
        twentyTwentyPtsMin: 20,
        twentyTwentySecMin: 20,
        doubleDoubleEnabled: false,
        efficiencySniperEnabled: false,
        cleanPlaymakerEnabled: false,
        plusMinusMilestoneEnabled: false,
        defenseMinBlk: 6,
        defenseMinStl: 6,
        defenseComboMinEach: 4,
        gameScoreThreshold: 44,
        teamMarginThreshold: 30,
        teamPointsThreshold: 145,
        seasonPointsStep: 1000,
        season3pmStep: 100,
        seasonRebStep: 300,
        seasonOrebStep: 100,
        seasonAstStep: 250,
        seasonStlStep: 50,
        seasonBlkStep: 50,
        teamSeasonWinsStep: 20,
        imminentMilestonesEnabled: false,
        streakMinGames: 10,
        teamWinStreakMin: 7,
      });
    } else {
      const next: MilestoneNotificationsConfigValues = {
        ...DEFAULT_MILESTONE_NOTIFICATIONS_VALUES,
        enabled: true,
        lookbackDays: 4,
        maxNotifications: 70,
        minSeverity: 'all',
        dedupePlayerGame: false,
        doubleDoubleEnabled: true,
        plusMinusMilestoneEnabled: true,
        scoringThreshold: 35,
        threePointThreshold: 7,
        streakMinGames: 5,
        teamWinStreakMin: 4,
      };
      for (const t of TRIGGER_ITEMS) {
        next[t.toggleKey] = true;
      }
      setDraft(next);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    const res = await updateAdminMilestoneNotificationsConfig(draft);
    setSaving(false);
    if (res.unauthorized && onLockSession) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      const clean = stripUpdatedAt(res.config);
      setSavedConfig(clean);
      setDraft(clean);
      setUpdatedAt(res.config.updatedAt || Date.now());
      setFeedback({
        kind: 'success',
        text: clean.enabled
          ? 'Los 31 disparadores y baremos se han guardado. La bandeja ya aplica las nuevas reglas.'
          : 'Notificaciones desactivadas globalmente. La campana permanece oculta en la cabecera.',
      });
      onConfigSaved?.();
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'No se pudo guardar la configuración de notificaciones.',
      });
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setFeedback(null);
    const res = await resetAdminMilestoneNotificationsDefaults();
    setResetting(false);
    if (res.unauthorized && onLockSession) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      const clean = stripUpdatedAt(res.config);
      setSavedConfig(clean);
      setDraft(clean);
      setUpdatedAt(res.config.updatedAt || Date.now());
      setFeedback({
        kind: 'success',
        text: 'Los 31 disparadores y baremos se han restablecido a sus valores recomendados.',
      });
      onConfigSaved?.();
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'No se pudo restablecer la configuración.',
      });
    }
  };

  const renderNumericControl = (
    key: NumericTriggerKey,
    label: string,
    help: ColumnHelpEntry
  ) => {
    const b = MILESTONE_NOTIFICATIONS_BOUNDS[key];
    const val = draft[key];
    return (
      <div
        key={key}
        className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 bg-[#0B1120] border border-[#1E293B] rounded-md px-2.5 py-1.5"
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[11px] text-slate-300 truncate">{label}</span>
          <MetricInfoTooltip customHelp={help} align="left" iconClassName="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setNumeric(key, val - b.step)}
            disabled={val <= b.min}
            aria-label={`Disminuir ${label}`}
            className="w-7 h-7 rounded-md bg-[#131C2E] border border-[#1E293B] hover:border-[#283548] disabled:opacity-40 flex items-center justify-center text-slate-300"
          >
            <Minus className="w-3 h-3" />
          </button>
          <NumericStepInput
            value={val}
            min={b.min}
            max={b.max}
            step={b.step}
            onCommit={(nextVal) => setNumeric(key, nextVal)}
          />
          <button
            type="button"
            onClick={() => setNumeric(key, val + b.step)}
            disabled={val >= b.max}
            aria-label={`Aumentar ${label}`}
            className="w-7 h-7 rounded-md bg-[#131C2E] border border-[#1E293B] hover:border-[#283548] disabled:opacity-40 flex items-center justify-center text-slate-300"
          >
            <Plus className="w-3 h-3" />
          </button>
          <span className="text-[10px] font-mono text-slate-500 w-10 text-right">
            {b.unit}
          </span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-6 text-xs text-slate-400">
        Cargando configuración de los 31 disparadores de notificaciones...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + Master Activation Switch */}
      <section className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {draft.enabled ? (
                <Bell className="w-4 h-4 text-orange-400 shrink-0" />
              ) : (
                <BellOff className="w-4 h-4 text-slate-500 shrink-0" />
              )}
              <h2 className="text-base font-display font-semibold text-slate-100">
                Notificaciones Inteligentes de Hitos (31 Disparadores)
              </h2>
              <MetricInfoTooltip
                customHelp={makeHelp(
                  'Motor de Notificaciones Inteligentes',
                  'Permite controlar de forma centralizada si se muestran avisos de hitos en la web y personalizar cada uno de los 31 disparadores con sus propios baremos y reglas anti-ruido.',
                  'Al pulsar Guardar cambios la nueva configuración se aplica al instante en la campana superior.'
                )}
                align="left"
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              Activa o desactiva la campana pública, ajusta los baremos destacados de Career High y
              Season High y controla el volumen de avisos con filtros anti-ruido.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleBool('enabled')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
                  draft.enabled
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:text-white'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    draft.enabled ? 'bg-emerald-400' : 'bg-slate-500'
                  }`}
                />
                <span>{draft.enabled ? 'Sistema Activado' : 'Sistema Desactivado'}</span>
              </button>
              <MetricInfoTooltip
                customHelp={makeHelp(
                  'Interruptor Maestro del Sistema',
                  'Activa o apaga completamente el Centro de Notificaciones para todos los usuarios.',
                  'Cuando está Desactivado, el icono de la campana desaparece de la cabecera sin borrar tu configuración.'
                )}
                align="right"
              />
            </div>

            <button
              type="button"
              onClick={handleReset}
              disabled={resetting || saving}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] text-xs font-medium text-slate-300 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Por defecto</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || resetting || !isDirty}
              className="min-h-[38px] px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Guardando...' : 'Guardar cambios'}</span>
            </button>
          </div>
        </div>

        {/* Global Window & Volume Controls + Quick Profiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-[#1E293B]">
          {renderNumericControl(
            'lookbackDays',
            'Ventana reciente de jornadas',
            makeHelp(
              'Ventana de días / jornadas',
              'Cuántas fechas de partidos recientes explora el motor al buscar actuaciones, cierres y barreras superadas.',
              'Por defecto 2 días para ver las últimas jornadas con señal alta sin saturar el tope de la bandeja.'
            )
          )}
          {renderNumericControl(
            'maxNotifications',
            'Máximo de alertas en bandeja',
            makeHelp(
              'Límite de alertas visibles',
              'Cantidad máxima de notificaciones devueltas en la campana, priorizando las más recientes y relevantes.',
              'Si tienes muchos disparadores activos, sube este límite (hasta 100) para que ninguno quede fuera.'
            )
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0B1120] border border-[#1E293B] rounded-md px-2.5 py-1.5">
            <div className="inline-flex items-center gap-1">
              <span className="text-[11px] text-slate-400">Perfiles rápidos:</span>
              <MetricInfoTooltip
                customHelp={makeHelp(
                  'Perfiles de configuración rápida',
                  'Aplica una combinación preajustada de disparadores, baremos y filtro anti-ruido con un clic antes de guardar.',
                  'Equilibrado = estándar selectivo con agrupación; Solo Épicas = únicamente hitos históricos; Radar Total = activa los 31 disparadores sin agrupar.'
                )}
                align="right"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyPreset('essential')}
                className="px-2 py-1 text-[11px] font-medium rounded bg-[#131C2E] hover:bg-[#1E293B] text-slate-200 border border-[#1E293B]"
              >
                Equilibrado
              </button>
              <button
                type="button"
                onClick={() => applyPreset('epic')}
                className="px-2 py-1 text-[11px] font-medium rounded bg-[#131C2E] hover:bg-[#1E293B] text-orange-300 border border-[#1E293B]"
              >
                Solo Épicas
              </button>
              <button
                type="button"
                onClick={() => applyPreset('total')}
                className="px-2 py-1 text-[11px] font-medium rounded bg-[#131C2E] hover:bg-[#1E293B] text-emerald-300 border border-[#1E293B]"
              >
                Radar Total (31)
              </button>
            </div>
          </div>
        </div>

        {/* Control Anti-Ruido y Filtrado Inteligente */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#1E293B]/80">
          <div className="flex items-center justify-between gap-3 bg-[#0B1120] border border-[#1E293B] rounded-md px-3 py-2">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-xs font-medium text-slate-200">
                  Agrupar 1 alerta por jugador y partido
                </span>
                <MetricInfoTooltip
                  customHelp={makeHelp(
                    'Consolidación anti-duplicados por partido',
                    'Cuando un jugador firma una exhibición que activa varios disparadores la misma noche (ej. 45 PTS + Career High + Triple-Doble + 8 Triples), conserva solo la alerta de mayor rango y añade el resto en el detalle.',
                    'Evita que una misma actuación ocupe 4 o 5 huecos del límite máximo de la campana.'
                  )}
                  align="left"
                  iconClassName="w-3.5 h-3.5"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Evita que una misma noche histórica genere 4–6 alertas repetidas del mismo jugador.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.dedupePlayerGame}
              aria-label="Agrupar una alerta por jugador y partido"
              onClick={() => toggleBool('dedupePlayerGame')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                draft.dedupePlayerGame ? 'bg-orange-500' : 'bg-[#131C2E] border-[#283548]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                  draft.dedupePlayerGame ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 bg-[#0B1120] border border-[#1E293B] rounded-md px-3 py-2">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="text-xs font-medium text-slate-200">
                  Relevancia mínima publicada
                </span>
                <MetricInfoTooltip
                  customHelp={makeHelp(
                    'Filtro global de relevancia mínima',
                    'Descarta automáticamente avisos informativos menores antes de llenar la campana pública.',
                    'Todas = Épicas, Destacadas e Info (inminentes/dobles-dobles); Destacadas+ = oculta Info; Solo Épicas = únicamente actuaciones históricas y Career Highs.'
                  )}
                  align="right"
                  iconClassName="w-3.5 h-3.5"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Filtra el nivel mínimo de impacto antes de aplicar el tope de la bandeja.
              </p>
            </div>
            <div className="inline-flex items-center bg-[#131C2E] border border-[#1E293B] p-0.5 rounded-md shrink-0">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'high', label: 'Destacadas+' },
                  { id: 'epic', label: 'Solo Épicas' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMinSeverity(opt.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                    draft.minSeverity === opt.id
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`px-3 py-2 rounded-md border text-xs flex items-center gap-2 ${
              feedback.kind === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}
      </section>

      {/* Entity Split (Jugador / Equipos) + Status Filter + Live Simulation Summary */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 bg-[#131C2E] border border-[#1E293B] p-1 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Todos (31)', icon: Sparkles },
                  { id: 'player', label: 'Jugador (28)', icon: User },
                  { id: 'team', label: 'Equipos (4)', icon: Users },
                ] as const
              ).map((scopeTab) => {
                const ScopeIcon = scopeTab.icon;
                const active = entityScopeFilter === scopeTab.id;
                return (
                  <button
                    key={scopeTab.id}
                    type="button"
                    onClick={() => setEntityScopeFilter(scopeTab.id)}
                    className={`min-h-[28px] px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                      active
                        ? 'bg-[#1E293B] text-orange-300 border border-orange-500/40 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-[#1E293B]/60 border border-transparent'
                    }`}
                  >
                    <ScopeIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{scopeTab.label}</span>
                  </button>
                );
              })}
              <MetricInfoTooltip
                customHelp={makeHelp(
                  'División Jugador y Equipos',
                  'Separa las reglas entre alertas individuales de Jugador y alertas colectivas de Equipos.',
                  'El disparador de Hitos Inminentes ("A las puertas") aparece en ambos bloques porque vigila tanto marcas de jugadores como victorias acumuladas de franquicia.'
                )}
                align="left"
                iconClassName="w-3.5 h-3.5"
              />
            </div>

            <div className="inline-flex items-center gap-0.5 bg-[#131C2E] border border-[#1E293B] p-1 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'active', label: 'Activos' },
                  { id: 'off', label: 'Apagados' },
                  { id: 'noisy', label: 'Muy frecuentes' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`min-h-[28px] px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    statusFilter === st.id
                      ? 'bg-[#1E293B] text-sky-300 border border-sky-500/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
            <div className="inline-flex items-center gap-1.5 bg-[#0B1120] border border-[#1E293B] rounded-md px-2.5 py-1">
              {loadingPreview ? (
                <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin shrink-0" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              )}
              <span className="font-sans text-[11px] text-slate-300">
                Bandeja estimada ({draft.lookbackDays}d):{' '}
                <strong
                  className={`font-mono ${
                    previewCounts &&
                    (previewCounts.estimatedFinalAlerts ?? previewCounts.totalEnabledRecentAlerts) >
                      draft.maxNotifications
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  }`}
                >
                  {previewCounts
                    ? `${previewCounts.estimatedFinalAlerts ?? previewCounts.totalEnabledRecentAlerts}`
                    : '—'}
                </strong>{' '}
                alertas netas
              </span>
              {previewCounts &&
                typeof previewCounts.estimatedFinalAlerts === 'number' &&
                previewCounts.totalEnabledRecentAlerts > previewCounts.estimatedFinalAlerts && (
                  <span className="font-sans text-[10px] text-slate-500">
                    (de {previewCounts.totalEnabledRecentAlerts} brutos)
                  </span>
                )}
              {previewCounts &&
                (previewCounts.estimatedFinalAlerts ?? previewCounts.totalEnabledRecentAlerts) >
                  draft.maxNotifications && (
                  <span className="font-sans text-[10px] text-amber-300">
                    · tope {draft.maxNotifications}
                  </span>
                )}
              <MetricInfoTooltip
                customHelp={makeHelp(
                  'Simulación en vivo de temporada 2026-27',
                  'Calcula exactamente cuántas alertas netas aparecerán en la campana pública tras aplicar agrupación por partido y relevancia mínima.',
                  'Si el número supera tu tope de bandeja, silencia alguno de los disparadores más ruidosos o sube sus baremos.'
                )}
                align="right"
                iconClassName="w-3.5 h-3.5"
              />
            </div>

            <div>
              <span className="text-slate-200 font-semibold">{activeTriggersCount}</span> /{' '}
              {TRIGGER_ITEMS.length} activos
              {updatedAt > 0 && (
                <span className="text-slate-500 ml-2">
                  · Guardado {new Date(updatedAt).toLocaleDateString('es-ES')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Top Noise Generators Strip */}
        {topNoiseTriggers.length > 0 && (
          <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300 shrink-0">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Mayor volumen en {draft.lookbackDays}d:</span>
              <MetricInfoTooltip
                customHelp={makeHelp(
                  'Diagnóstico rápido de volumen',
                  'Lista los disparadores activos que más alertas están generando ahora mismo en la ventana reciente.',
                  'Puedes apagar cualquiera con un clic o subir su baremo en su tarjeta inferior para reducir ruido y evitar llenar el tope.'
                )}
                align="left"
                iconClassName="w-3 h-3"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {topNoiseTriggers.map(({ item, recent }) => (
                <div
                  key={item.toggleKey}
                  className="inline-flex items-center gap-1.5 bg-[#131C2E] border border-[#1E293B] rounded-md px-2 py-0.5 text-[11px]"
                >
                  <span className="text-slate-200 truncate max-w-[170px]">{item.title}</span>
                  <span className="font-mono tabular-nums font-semibold text-amber-300">
                    {recent}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleBool(item.toggleKey)}
                    className="ml-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#0B1120] hover:bg-rose-500/15 border border-[#283548] hover:border-rose-500/40 text-slate-400 hover:text-rose-300 transition-colors"
                    title={`Apagar ${item.title}`}
                  >
                    Apagar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="inline-flex flex-wrap items-center gap-1 bg-[#131C2E] border border-[#1E293B] p-1 rounded-lg">
          {(
            [
              { id: 'all', label: 'Todas categorías', icon: Sparkles },
              { id: 'gameday', label: 'Actuaciones (12)', icon: Flame },
              { id: 'defense_team', label: 'Defensa y Equipo (4)', icon: Shield },
              { id: 'heroic', label: 'Clutch y BB (4)', icon: Zap },
              { id: 'cumulative', label: 'Barreras Acumuladas (8)', icon: Award },
              { id: 'streaks', label: 'Inminentes y Rachas (3)', icon: TrendingUp },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeGroup === tab.id;
            return (
              <div key={tab.id} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setActiveGroup(tab.id)}
                  className={`min-h-[28px] px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-[#1E293B]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
                <MetricInfoTooltip
                  customHelp={MENU_TAB_HELP[tab.id]}
                  align="left"
                  iconClassName="w-3 h-3"
                />
              </div>
            );
          })}
        </div>

        {previewError && (
          <div className="px-3 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-300">
            No se pudo actualizar la simulación en vivo: {previewError}
          </div>
        )}
      </div>

      {/* Granular Triggers Grid */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-3 transition-opacity ${
          draft.enabled ? 'opacity-100' : 'opacity-60'
        }`}
      >
        {filteredItems.map((item) => {
          const isOn = draft[item.toggleKey];
          const isImminentItem = item.toggleKey === 'imminentMilestonesEnabled';
          const seasonHitCount = previewCounts?.seasonCounts?.[item.toggleKey];
          const recentHitCount = previewCounts?.recentCounts?.[item.toggleKey];
          const hasCounts = typeof seasonHitCount === 'number';
          const freqMeta = !hasCounts
            ? { label: 'Calculando…', cls: 'text-slate-400 border-[#1E293B] bg-[#0B1120]' }
            : seasonHitCount === 0
              ? { label: '0 veces', cls: 'text-slate-400 border-[#1E293B] bg-[#0B1120]' }
              : seasonHitCount <= 12
                ? {
                    label: 'Selectivo',
                    cls: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
                  }
                : seasonHitCount <= (isImminentItem ? 35 : 50)
                  ? {
                      label: 'Equilibrado',
                      cls: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
                    }
                  : {
                      label: 'Muy frecuente',
                      cls: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
                    };

          const IconComponent =
            item.toggleKey === 'careerHighEnabled' || item.toggleKey === 'seasonHighPtsEnabled'
              ? Crown
              : item.group === 'heroic'
                ? Zap
                : item.group === 'cumulative'
                  ? Award
                  : item.group === 'streaks'
                    ? item.toggleKey === 'imminentMilestonesEnabled'
                      ? Target
                      : TrendingUp
                    : item.group === 'defense_team'
                      ? Shield
                      : Flame;

          const liveBadge = getLiveBadgePreview(
            item.toggleKey,
            draft,
            item.badgePreview
          );
          const itemEntityScope = getTriggerEntityScope(item.toggleKey);

          return (
            <article
              key={item.toggleKey}
              className={`bg-[#131C2E] border rounded-lg p-4 flex flex-col justify-between gap-3 transition-colors ${
                isOn ? 'border-[#283548]' : 'border-[#1E293B] opacity-75'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <IconComponent
                      className={`w-4 h-4 shrink-0 ${
                        isOn ? 'text-orange-400' : 'text-slate-500'
                      }`}
                    />
                    <span className="text-[10px] font-mono tabular-nums text-slate-500">
                      #{String(item.index).padStart(2, '0')}
                    </span>
                    <span
                      className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${
                        itemEntityScope === 'team'
                          ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                          : itemEntityScope === 'both'
                            ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                            : 'text-sky-300 bg-sky-500/10 border-sky-500/30'
                      }`}
                    >
                      {itemEntityScope === 'team'
                        ? 'Equipos'
                        : itemEntityScope === 'both'
                          ? 'Jugador · Equipos'
                          : 'Jugador'}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-100">{item.title}</h3>
                    <MetricInfoTooltip customHelp={item.help} align="left" />
                    <span className="text-[10px] font-mono text-orange-300 bg-[#0B1120] border border-[#1E293B] px-1.5 py-0.5 rounded">
                      {liveBadge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isOn}
                  aria-label={`Activar o desactivar ${item.title}`}
                  onClick={() => toggleBool(item.toggleKey)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    isOn ? 'bg-orange-500' : 'bg-[#0B1120] border-[#283548]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      isOn ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-2 pt-2 border-t border-[#1E293B]/80">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="inline-flex items-center gap-1.5 text-slate-300 font-mono tabular-nums">
                    <span className="text-slate-400 font-sans">2026-27:</span>
                    <strong className="text-slate-100">
                      {hasCounts
                        ? isImminentItem
                          ? `${seasonHitCount} vigentes ahora`
                          : `${seasonHitCount} ${seasonHitCount === 1 ? 'vez' : 'veces'}`
                        : '—'}
                    </strong>
                    {hasCounts && !isImminentItem && typeof recentHitCount === 'number' && (
                      <span className="text-slate-500 font-sans">
                        · {recentHitCount} en {draft.lookbackDays}d
                      </span>
                    )}
                    <MetricInfoTooltip
                      customHelp={makeHelp(
                        'Conteo real en la temporada 2026-27',
                        'Muestra cuántas veces habría saltado este disparador con los valores que estás probando ahora mismo sobre toda la temporada 2026-27 (y en la ventana reciente de jornadas).',
                        'Se calcula incluso si el interruptor está apagado para ayudarte a calibrar cada límite sin quedarte corto ni pasarte.'
                      )}
                      align="left"
                      iconClassName="w-3 h-3"
                    />
                  </div>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${freqMeta.cls}`}
                  >
                    {freqMeta.label}
                  </span>
                </div>

                {item.baremos.map((bar) =>
                  renderNumericControl(bar.key, bar.label, bar.help)
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
