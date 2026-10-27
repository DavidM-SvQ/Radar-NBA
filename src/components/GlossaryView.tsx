import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calculator,
  Database,
  Lightbulb,
  Search,
} from 'lucide-react';
import type { ActiveSection } from '../types/nba';
import { normalizeSearchText } from '../utils/analytics';
import { MetricInfoTooltip } from './MetricUiHelpers';

interface GlossaryViewProps {
  onNavigateSection: (section: ActiveSection) => void;
}

type GlossaryFilter =
  | 'all'
  | 'sections'
  | 'sources'
  | 'metrics'
  | 'interpretation';

type MetricCategoryFilter =
  | 'Todas'
  | 'Básica y Tiro'
  | 'Rebote y Creación'
  | 'Avanzada y 4 Factores'
  | 'Zona y Hustle (Intangibles)'
  | 'Motor de Anomalías'
  | 'Equipo y Contexto';

interface AppSectionDoc {
  id: ActiveSection;
  title: string;
  purpose: string;
  measuredStats: string;
  whenToUse: string;
}

interface DataSourceDoc {
  channel: string;
  endpointScope: string;
  providedMetrics: string;
  refreshRule: string;
}

interface MetricDefinition {
  code: string;
  name: string;
  category: Exclude<MetricCategoryFilter, 'Todas'>;
  description: string;
  formula: string;
  benchmark: string;
}

interface PracticalRule {
  title: string;
  signalExample: string;
  interpretation: string;
}

const APP_SECTIONS_DOCS: AppSectionDoc[] = [
  {
    id: 'home',
    title: 'Resumen del Día (Portada Guiada)',
    purpose:
      'Punto de partida pensado para entender de un vistazo qué está ocurriendo hoy en la NBA en lenguaje cotidiano y con comparación visual frente a la media de la liga.',
    measuredStats:
      'Jugadores más en forma, equipos dominantes, rachas activas destacadas y termómetro visual frente a la Media NBA (tanto en Modo Sencillo como en Modo Avanzado).',
    whenToUse:
      'Nada más entrar en la aplicación si quieres las historias más importantes de la jornada explicadas sin tecnicismos ni siglas complejas.',
  },
  {
    id: 'gameday',
    title: 'Analizador de Jornadas NBA (Crónica + Informes de Scouting)',
    purpose:
      'Sintetiza todo lo ocurrido en los 10–12 partidos de cualquier fecha del calendario con una Crónica Global matinal plegable (capítulos dinámicos + Pizarras, Hitos, Españoles y Claves) y permite abrir en cada encuentro su Informe Periodístico y de Scouting completo.',
    measuredStats:
      'Crónica global en rejilla editorial, Quinteto Ideal y MVP (Game Score), marcador por cuartos y punto de quiebre, Podio visual en 3 columnas (⭐⭐⭐/⭐⭐/⭐), batallas NBA.com (Pintura, Contraataque, Tras Pérdida, 2ª Oportunidad, Banquillo), líderes #Dorsal I. Apellido, Acta Oficial (Titulares/Suplentes/Bajas), explosiones Z, cambios de rol y rachas.',
    whenToUse:
      'Cada mañana para leer el pulso global de la liga y profundizar con un clic en la crónica táctica y el acta completa de cualquier partido sin salir de la pantalla.',
  },
  {
    id: 'anomalies',
    title: 'Radar de Anomalías',
    purpose:
      'Detecta automáticamente jugadores y equipos cuyo rendimiento reciente (Últimos 3, 5 o 10 PJ) se desvía de forma extraordinaria respecto a su media habitual.',
    measuredStats:
      'Z-Score (σ), % Delta, Puntos, Rebotes, Asistencias, PRA, Minutos, Uso Ofensivo (USG%), True Shooting (TS%), Impacto Game Score (GmSc), NetRtg, OffRtg, DefRtg y Pace.',
    whenToUse:
      'Al empezar la jornada para localizar brotes sostenibles por subida de USG%/MIN, alertas de regresión por TS%/3P% inflado y cambios bruscos de eficiencia ofensiva o defensiva en equipos.',
  },
  {
    id: 'streaks',
    title: 'Rachas y Consistencia',
    purpose:
      'Rastrea series activas de partidos consecutivos superando marcas concretas y clasifica a los jugadores según su regularidad o volatilidad.',
    measuredStats:
      'Rachas activas (20+/25+/30+ PTS, 10+ REB, 8+ AST, 3+ triples, victorias/derrotas), Índice de Consistencia (0–100), Desviación Estándar (±σ) y Banda Suelo–Techo.',
    whenToUse:
      'Cuando buscas tendencias calientes ininterrumpidas o necesitas diferenciar un jugador "reloj suizo" de uno muy irregular de todo o nada.',
  },
  {
    id: 'duel',
    title: 'Duelo Directo 1v1 (Batalla de Cartas y Radar)',
    purpose:
      'Enfrenta cara a cara a dos jugadores cualesquiera de la NBA con un gráfico radar superpuesto de 6 ejes y un marcador de categorías ganadas estilo videojuego deportivo.',
    measuredStats:
      '6 ejes normalizados frente a la Media NBA (Anotación, Eficiencia, Creación, Rebote, Defensa e Impacto) y hasta 16 categorías directas (PTS, REB, OR, AST, PRA, 3PM, Stocks, Pérdidas, TS%, eFG%, USG%, AST/PER, GmSc, +/-, Pintura y Hustle).',
    whenToUse:
      'Cuando quieres zanjar un debate entre dos estrellas, comparar estilos opuestos en temporada completa o ver quién domina en los últimos partidos.',
  },
  {
    id: 'comparator',
    title: 'Comparador de Tramos (Básico + Avanzado)',
    purpose:
      'Enfrenta dos ventanas cualesquiera de un mismo jugador o equipo para auditar con precisión qué ha cambiado tanto en volumen básico como en eficiencia avanzada.',
    measuredStats:
      '19 métricas en jugadores (PTS, REB, OR, DR, AST, Stocks, +/-, USG%, TS%, eFG%, GmSc, tiros) y 15 métricas en equipos (PTS, DIF, OffRtg, DefRtg, NetRtg, Pace y los 4 Factores).',
    whenToUse:
      'Para evaluar el impacto real de un traspaso, lesiones de compañeros, rendimiento Local vs. Visitante, fatiga Back-to-Back o evolución entre dos meses de calendario.',
  },
  {
    id: 'milestones',
    title: 'Hitos de la Temporada (2026-27 vs. 2025-26)',
    purpose:
      'Compara la evolución macro de toda la NBA (~580 jugadores y 30 equipos) entre la temporada actual y la anterior, incluyendo topes de una noche y líderes anuales.',
    measuredStats:
      '19 indicadores globales NBA (Pace, OffRtg, eFG%, TS%, OREB%, Pintura, 2ª Oportunidad), 12 récords en un partido (incluyendo GmSc, +/-, OR y Stocks) y 19 categorías de líderes básicos, avanzados y Hustle.',
    whenToUse:
      'Para comprobar con sus 3 modos de comparador si la liga juega más rápido, más eficiente o carga más el rebote ofensivo que el curso pasado y quién lidera cada apartado.',
  },
  {
    id: 'teams',
    title: 'Equipos NBA (3 Capas Estadísticas)',
    purpose:
      'Explorador homogéneo de las 30 franquicias con conmutador instantáneo entre estadísticas básicas, eficiencia avanzada / 4 Factores y anotación por zonas + Hustle.',
    measuredStats:
      'Capa 1: V-D, PTS, DIF, Racha · Capa 2: OffRtg, DefRtg, NetRtg, Pace, eFG%, TS%, OREB%, TOV% · Capa 3: PTS Pintura, 2ª Oportunidad, Contraataque, PTS tras Pérdida, Desvíos y Tiros Punteados.',
    whenToUse:
      'Para radiografiar el nivel estructural real de cada franquicia más allá de las victorias y abrir el inspector con su plantilla oficial.',
  },
  {
    id: 'players',
    title: 'Jugadores NBA (~580 Activos en 3 Capas)',
    purpose:
      ' Tabla integral de la liga con carga de los ~580 jugadores activos y tres vistas especializadas: Básicas, Avanzadas NBA.com y Pintura / Creación / Hustle.',
    measuredStats:
      'Capa 1: MIN, PTS, REB, OR, AST, Stocks, +/- · Capa 2: USG%, TS%, eFG%, GmSc, PIE, NetRtg, AST%, OREB% · Capa 3: PTS Pintura, 2ª Oport., Contraataque, Faltas Recibidas, Desvíos, Pantallas Asistidas y Tiros Punteados.',
    whenToUse:
      'Para ordenar líderes de toda la liga en cualquier faceta del juego, desde los máximos anotadores hasta los especialistas defensivos e intangibles.',
  },
];

const DATA_SOURCES_DOCS: DataSourceDoc[] = [
  {
    channel: 'Motor Masivo Partido a Partido — NBA.com Official Stats',
    endpointScope: 'stats.nba.com/stats/leaguegamelog (Player & Team · 2026-27 y 2025-26)',
    providedMetrics:
      'Descarga simultánea de todas las hojas de partido oficiales de los ~580 jugadores y 30 equipos: PTS, OR, DR, REB, AST, ROB, TAP, PER, +/-, TC/3P/TL y emparejamiento por GAME_ID para calcular posesiones exactas, OffRtg, DefRtg, NetRtg, Pace, USG% y Game Score noche a noche.',
    refreshRule: 'Caché en servidor de 15 minutos (forzable al pulsar "Actualizar datos").',
  },
  {
    channel: ' Perfiles Avanzados y Zonas de Anotación — NBA.com Dashboards',
    endpointScope: 'stats.nba.com · leaguedashplayerstats & leaguedashteamstats (Advanced + Misc)',
    providedMetrics:
      'Métricas oficiales NBA.com calculadas sobre posesiones reales de seguimiento: OffRtg, DefRtg, NetRtg, USG%, TS%, eFG%, PIE, AST%, AST/TO, OREB%, DREB%, TOV%, Puntos en la Pintura, Puntos tras 2ª Oportunidad, Contraataque, Puntos tras Pérdida y Faltas Recibidas.',
    refreshRule: 'Caché sincronizada de 15 minutos con cruce directo por identificador oficial NBA.',
  },
  {
    channel: 'Intangibles y Tracking de Esfuerzo — NBA.com Hustle Stats',
    endpointScope: 'stats.nba.com · leaguehustlestatsplayer & leaguehustlestatsteam',
    providedMetrics:
      'Estadísticas de seguimiento óptico que no aparecen en el boxscore clásico: Tiros Punteados (Contested Shots), Desvíos de balón (Deflections), Asistencias de Pantalla (Screen Assists + PTS generados), Balones Sueltos Recuperados, Cargas Recibidas y Box-Outs.',
    refreshRule: 'Caché de 15 minutos integrada en las tablas de Jugadores, Equipos, Inspector e Hitos.',
  },
  {
    channel: 'Actas Oficiales de Partido (Game Book) y Crónicas de Scouting',
    endpointScope: 'cdn.nba.com/static/json/liveData/boxscore + Gemini Scouting con Google Search',
    providedMetrics:
      'Parciales cuarto a cuarto (1Q–4Q y prórrogas), pabellón, asistencia oficial, cambios de líder, empates, puntos de banquillo, pintura, contraataque, tras pérdida, 2ª oportunidad, titulares/suplentes/inactivos y redacción periodística contrastada con actualidad NBA.',
    refreshRule: 'Actas oficiales al instante (<150 ms) y crónicas cacheadas en memoria con opción de regeneración.',
  },
  {
    channel: 'Directorio Oficial, Marcadores en Vivo y Respaldo — NBA.com + ESPN',
    endpointScope: 'stats.nba.com/stats/playerindex + site.api.espn.com (standings / scoreboard)',
    providedMetrics:
      'Censo completo de jugadores activos con dorsal, altura, país y franquicia desde NBA.com combinado con marcadores en directo, cabezas de serie de conferencia y sistema automático de respaldo (failover) mediante ESPN API.',
    refreshRule: 'Marcadores cada 2 minutos; directorio oficial cacheado 60 minutos.',
  },
];

const METRICS_DICTIONARY: MetricDefinition[] = [
  // Avanzada y 4 Factores
  {
    code: 'OffRtg / DefRtg / NetRtg',
    name: 'Eficiencia Ofensiva, Defensiva y Neta por 100 Posesiones',
    category: 'Avanzada y 4 Factores',
    description:
      'Puntos anotados (OffRtg), encajados (DefRtg) y diferencia neta (NetRtg = OffRtg − DefRtg) estandarizados por cada 100 posesiones. Elimina la distorsión de jugar a ritmo rápido o lento.',
    formula: 'OffRtg = 100 × (PTS / Posesiones) · DefRtg = 100 × (PTS Rival / Posesiones)',
    benchmark: 'OffRtg 118+ ataque élite · DefRtg <110 defensa élite (menor es mejor) · NetRtg +6.0 candidato al anillo',
  },
  {
    code: 'Pace (Ritmo)',
    name: 'Posesiones Estimadas por cada 48 Minutos',
    category: 'Avanzada y 4 Factores',
    description:
      'Mide la velocidad real a la que juega un equipo o jugador. Un equipo puede anotar muchos puntos simplemente por jugar a un Pace muy alto aunque su eficiencia no sea élite.',
    formula: '48 × ((Posesiones Equipo + Posesiones Rival) / (2 × (Minutos Equipo / 5)))',
    benchmark: '101.5+ ritmo vertiginoso · ~99.0 media NBA · <96.5 baloncesto lento de media pista',
  },
  {
    code: 'USG% (Usage)',
    name: 'Porcentaje de Uso Ofensivo',
    category: 'Avanzada y 4 Factores',
    description:
      'Porcentaje de jugadas ofensivas de su equipo que un jugador finaliza mientras está en cancha mediante tiro de campo, visita al tiro libre o pérdida de balón.',
    formula: '100 × ((FGA + 0.44×FTA + TOV) × (Min Equipo / 5)) / (MIN × (FGA_eq + 0.44×FTA_eq + TOV_eq))',
    benchmark: '30%+ primera espada / superestrella · 22–28% segunda opción · <16% especialista de rol',
  },
  {
    code: 'TS% (True Shooting)',
    name: 'Porcentaje de Tiro Verdadero',
    category: 'Avanzada y 4 Factores',
    description:
      'La métrica reina de eficiencia anotadora: integra en un único porcentaje el valor real de los tiros de 2 puntos, el punto extra de los triples y los tiros libres.',
    formula: 'PTS / (2 × (FGA + 0.44 × FTA)) × 100',
    benchmark: '58% media NBA actual · 62%+ eficiencia élite · <53% volumen ineficiente',
  },
  {
    code: 'eFG% (Tiro Efectivo)',
    name: 'Porcentaje de Tiro de Campo Efectivo (1º de los 4 Factores)',
    category: 'Avanzada y 4 Factores',
    description:
      'Corrige el FG% tradicional otorgando un 50% más de valor a cada triple anotado (pues vale 3 puntos frente a 2). Es el factor con mayor peso de los Cuatro Factores de Dean Oliver.',
    formula: '((FGM + 0.5 × 3PM) / FGA) × 100',
    benchmark: '54.5% media NBA · 58%+ puntería élite en juego dinámico',
  },
  {
    code: 'PIE',
    name: 'Player Impact Estimate (Estimación Oficial NBA.com)',
    category: 'Avanzada y 4 Factores',
    description:
      'Métrica integral todo-en-uno de NBA.com que mide qué porcentaje total de los sucesos estadísticos positivos y negativos del partido ha generado un jugador.',
    formula: ' Ratio oficial NBA.com de aportación neta individual sobre el total acumulado de ambos equipos en el encuentro',
    benchmark: '10.0% media de rotación · 15.0%+ nivel All-Star · 18.5%+ impacto de candidato a MVP',
  },
  {
    code: 'GmSc (Game Score)',
    name: 'Valoración Integral por Partido de John Hollinger',
    category: 'Avanzada y 4 Factores',
    description:
      'Resume toda la hoja estadística de una noche en una única cifra en escala similar a los puntos anotados, premiando eficiencia, rebote ofensivo, creación y defensa y penalizando fallos y pérdidas.',
    formula: 'PTS + 0.4×FGM − 0.7×FGA − 0.4×(FTA−FTM) + 0.7×OR + 0.3×DR + ROB + 0.7×AST + 0.7×TAP − 0.4×PF − TOV',
    benchmark: '10.0 partido medio · 20.0+ gran actuación · 30.0+ exhibición dominante · 40.0+ noche histórica',
  },
  {
    code: 'OREB% / DREB%',
    name: 'Porcentaje de Rebote Ofensivo y Defensivo (2º de los 4 Factores)',
    category: 'Avanzada y 4 Factores',
    description:
      'Porcentaje de rebotes disponibles que un jugador o equipo captura mientras está en pista, independientemente de si ha habido muchos o pocos fallos totales en el partido.',
    formula: 'OREB / (OREB + DREB Rival) × 100',
    benchmark: 'Equipo OREB%: 29%+ élite cargando el aro · Jugador OREB%: 11%+ pívot dominante en cristal rival',
  },
  {
    code: 'TOV%',
    name: 'Porcentaje de Pérdidas por 100 Jugadas (3º de los 4 Factores)',
    category: 'Avanzada y 4 Factores',
    description:
      'Estimación de balones perdidos por cada 100 posesiones jugadas. En esta métrica, un valor menor significa mayor seguridad con el balón.',
    formula: '100 × TOV / (FGA + 0.44 × FTA + TOV)',
    benchmark: '<12.5% excelente cuidado del balón · ~14.0% media NBA · >16.0% sangría de pérdidas',
  },
  {
    code: 'AST% y AST/TO',
    name: 'Porcentaje de Asistencias y Ratio Asistencias / Pérdida',
    category: 'Avanzada y 4 Factores',
    description:
      'AST% mide qué porcentaje de las canastas de sus compañeros asiste un jugador mientras está en cancha; AST/TO evalúa la limpieza de esa creación.',
    formula: 'AST% = % canastas de compañeros asistidas en pista · AST/TO = AST ÷ TOV',
    benchmark: 'AST% 32%+ director de juego élite · AST/TO ≥ 3.0 control sobresaliente',
  },

  // Zona y Hustle (Intangibles)
  {
    code: 'PTS Pintura (PINT)',
    name: 'Puntos Anotados en la Zona Restringida / Pintura',
    category: 'Zona y Hustle (Intangibles)',
    description:
      'Puntos conseguidos pisando la pintura. Refleja capacidad de presión al aro, cortes sin balón y dominio físico interior.',
    formula: 'Suma oficial NBA.com (Misc) de puntos anotados dentro de la pintura por partido',
    benchmark: 'Equipo: 52+ PTS/PJ dominio interior · Jugador: 12+ PTS/PJ finalizador élite cerca del aro',
  },
  {
    code: '2ª Oportunidad (2ªOP)',
    name: 'Puntos de Segunda Oportunidad tras Rebote Ofensivo',
    category: 'Zona y Hustle (Intangibles)',
    description:
      'Puntos logrados inmediatamente en posesiones extendidas gracias a capturar un rebote ofensivo previo.',
    formula: 'Puntos anotados tras OR en la misma posesión (NBA.com Misc)',
    benchmark: 'Equipo: 16+ PTS/PJ castigo severo en el cristal · Jugador: 3.5+ PTS/PJ especialista interior',
  },
  {
    code: 'Contraataque y Tras Pérdida',
    name: 'Puntos en Transición (FB) y Puntos tras Pérdida Rival (PTSxPér)',
    category: 'Zona y Hustle (Intangibles)',
    description:
      'Miden la capacidad de convertir robos, desvíos y rebotes largos en canastas rápidas antes de que se coloque la defensa estática rival.',
    formula: 'Conteo oficial NBA.com Misc de Fastbreak Points y Points Off Turnovers por PJ',
    benchmark: 'Equipo: 17+ PTS en contraataque y 19+ tras pérdida indican defensa agresiva y vértigo',
  },
  {
    code: 'Deflections (DESV)',
    name: 'Desvíos Defensivos de Balón (Hustle)',
    category: 'Zona y Hustle (Intangibles)',
    description:
      'Toques defensivos que desvían un pase o bote del rival cortando el ritmo de la jugada aunque no acaben en robo directo.',
    formula: 'Tracking óptico oficial NBA.com Hustle de desvíos por partido',
    benchmark: 'Jugador: 3.0+ DESV/PJ defensor exterior disruptivo · Equipo: 16.5+ DESV/PJ manos muy activas',
  },
  {
    code: 'Contested Shots (PUNT)',
    name: 'Tiros Punteados en Defensa (2P + 3P)',
    category: 'Zona y Hustle (Intangibles)',
    description:
      'Lanzamientos rivales en los que el defensor cierra el espacio y levanta la mano para dificultar la visión y parábola de tiro.',
    formula: 'Contested 2PT Shots + Contested 3PT Shots por partido (NBA.com Hustle)',
    benchmark: 'Jugador: 9.5+ tiros punteados/PJ ancla defensiva interior · Equipo: 52+ esfuerzo colectivo alto',
  },
  {
    code: 'Screen Assists (PANT)',
    name: 'Asistencias de Pantalla y Puntos por Bloqueo',
    category: 'Zona y Hustle (Intangibles)',
    description:
      'Bloqueos directos o indirectos puestos por un jugador que liberan directamente a un compañero para anotar canasta.',
    formula: 'Conteo NBA.com Hustle de pantallas que derivan directamente en canasta (y puntos generados)',
    benchmark: '3.5+ PANT/PJ (8+ puntos generados) pívot generador invisible en pick-and-roll',
  },
  {
    code: 'Box-Outs y Loose Balls',
    name: 'Cierre de Rebote (Box-Out) y Balones Divididos Recuperados',
    category: 'Zona y Hustle (Intangibles)',
    description:
      'Contacto físico para sellar al rival antes del rebote (Box-Outs) y balones sueltos recuperados lanzándose al suelo o en disputa 50/50.',
    formula: 'Tracking NBA.com Hustle de Box-Outs totales y Loose Balls Recovered por PJ',
    benchmark: 'Termómetro puro de sacrificio físico que explica por qué ciertos quintetos rebotean mejor',
  },

  // Básica, Rebote y Creación
  {
    code: 'OR / DR / REB',
    name: 'Rebotes Ofensivos, Defensivos y Totales',
    category: 'Rebote y Creación',
    description:
      'Desglose exacto noche a noche de capturas en aro rival (OR), en aro propio (DR) y suma total (REB = OR + DR).',
    formula: 'REB = OR + DR',
    benchmark: 'Jugador: 3.0+ OR/PJ o 10.5+ REB/PJ · Equipo: 12.0+ OR/PJ',
  },
  {
    code: 'PRA',
    name: 'Producción Combinada Total',
    category: 'Rebote y Creación',
    description:
      'Suma directa de Puntos, Rebotes y Asistencias en un partido. Resume el volumen ofensivo integral de un jugador.',
    formula: 'PRA = PTS + REB + AST',
    benchmark: '30+ PRA nivel estrella · 42+ PRA nivel candidato a MVP',
  },
  {
    code: 'Stocks (ROB + TAP)',
    name: 'Eventos Defensivos de Caja (Steals + Blocks)',
    category: 'Rebote y Creación',
    description:
      'Suma combinada de robos de balón y tapones logrados en un partido o promedio de temporada.',
    formula: 'Stocks = ROB + TAP',
    benchmark: '2.5+ Stocks/PJ especialista defensivo de élite · 3.5+ candidato a Defensor del Año',
  },
  {
    code: '+/- (Plus-Minus)',
    name: 'Más/Menos con el Jugador en Cancha',
    category: 'Equipo y Contexto',
    description:
      'Diferencial neto en el marcador mientras el jugador ha estado exactamente en pista.',
    formula: 'Puntos de su equipo en pista − Puntos del rival con él en pista',
    benchmark: 'En un partido suelto tiene ruido de quintetos; en muestras de 15+ PJ revela impacto real',
  },
  {
    code: 'DD2 / TD3',
    name: 'Doble-Doble y Triple-Doble',
    category: 'Rebote y Creación',
    description:
      'Partidos alcanzando 10 o más unidades en dos (DD2) o tres (TD3) apartados estadísticos principales.',
    formula: 'Conteo de encuentros con ≥10 en 2 categorías (DD2) o ≥10 en 3 categorías (TD3)',
    benchmark: 'Referencia de polivalencia total en interiores creadores y bases altos',
  },
  {
    code: 'TC% / 3P% / TL%',
    name: 'Porcentajes Clásicos de Tiro (Campo, Triple y Libres)',
    category: 'Básica y Tiro',
    description:
      'Porcentajes de acierto desglosados en tiros en juego totales (TC%), desde el perímetro (3P%) y desde la línea de personal (TL%).',
    formula: '(Anotados / Intentados) × 100 en cada distancia',
    benchmark: 'Club 50-40-90 representa la excelencia histórica de puntería en las tres zonas',
  },

  // Motor de Anomalías y Contexto
  {
    code: 'Z-Score (σ)',
    name: 'Puntuación de Desviación Típica Propia',
    category: 'Motor de Anomalías',
    description:
      'Mide cuántas desviaciones estándar se aleja el promedio reciente de un jugador o equipo respecto a su propia media y volatilidad habitual.',
    formula: 'Z = (Media Ventana − Media Base) / Desviación Estándar Base (σ)',
    benchmark: '|Z| ≥ 1.2σ tendencia clara · |Z| ≥ 1.8σ anomalía fuerte · |Z| ≥ 2.2σ suceso extremo',
  },
  {
    code: '% Delta',
    name: 'Variación Porcentual Reciente',
    category: 'Motor de Anomalías',
    description:
      'Porcentaje relativo de subida o caída entre la ventana activa (Últimos 3, 5 o 10 PJ) y la media base de referencia.',
    formula: '((Media Ventana − Media Base) / Media Base) × 100',
    benchmark: '±15% variación moderada · ±25% o superior cambio drástico de producción',
  },
  {
    code: 'Consistencia (0–100)',
    name: 'Índice de Regularidad Estadística y Banda 1σ',
    category: 'Motor de Anomalías',
    description:
      'Puntuación inversa al coeficiente de variación (σ / media) sobre PRA, acompañada de su banda habitual Suelo–Techo (Media ± 1σ, ~68% de noches).',
    formula: 'Escala 0–100 inversa a CV = σ(PRA) / Media(PRA)',
    benchmark: '78–98 "Reloj suizo" · 62–77 "Estable" · 46–61 "Variable" · <46 "Todo o nada"',
  },
  {
    code: 'B2B (Back-to-Back)',
    name: 'Partido sin Días de Descanso',
    category: 'Equipo y Contexto',
    description:
      'Encuentro disputado en días naturales consecutivos (0 días libres respecto al partido anterior).',
    formula: 'Fecha Partido Actual − Fecha Partido Previo = 1 día natural (0 días descanso)',
    benchmark: 'Clave para explicar rotaciones cortas de minutos, caídas de piernas en 3P% y DefRtg',
  },
  {
    code: 'Media NBA (Barra Central)',
    name: 'Referencia Visual frente al Promedio Real de la Liga',
    category: 'Motor de Anomalías',
    description:
      'En Modo Sencillo y en el Inspector lateral, cada barra horizontal sitúa exactamente en su marca blanca central (50%) el promedio real de los jugadores de rotación o de las 30 franquicias NBA.',
    formula: 'Posición relativa (Z-Score frente a la liga) sobre la muestra activa cargada',
    benchmark: 'Élite NBA (~top 10%) · Destacado · En media NBA · Bajo media',
  },
];

const PRACTICAL_RULES: PracticalRule[] = [
  {
    title: '01. Cruza siempre la subida de puntos con USG% y Minutos',
    signalExample: 'Jugador sube +24% en PTS acompañado de +4.8 pp en USG% y +5.0 MIN',
    interpretation:
      'Señal estructural de máximo valor. El jugador no solo está metiendo canastas: está absorbiendo muchas más posesiones de su equipo por lesión de un titular o ascenso en la rotación.',
  },
  {
    title: '02. Detecta espejismos de eficiencia con TS% y 3P%',
    signalExample: 'Jugador sube +6.5 PTS con idéntico USG% (19%) pero firmando un 74% TS% y 58% en triples',
    interpretation:
      'Alerta naranja de regresión a la media. Nadie mantiene un 74% de True Shooting con rol secundario: en cuanto su puntería exterior vuelva a niveles normales (36–38%), sus puntos bajarán.',
  },
  {
    title: '03. Compra barato cuando el USG% sube pero el TS% está hundido',
    signalExample: 'Estrella cae en puntos (Z = −1.5σ) tirando un 44% TS%, pero su USG% sube al 33% con 36 MIN',
    interpretation:
      'Oportunidad clara de rebote estadístico. El volumen ofensivo y la confianza del entrenador están en máximos; un simple retorno a su TS% habitual disparará su producción.',
  },
  {
    title: '04. En equipos, el NetRtg y los 4 Factores predicen mejor que el balance V-D',
    signalExample: 'Franquicia con racha 2-3 en 5 PJ pero NetRtg de +6.8 y eFG% de 58.2% tras perder dos finales apretados',
    interpretation:
      'El equipo está jugando a nivel de élite aunque haya tenido mala fortuna en posesiones finales (clutch). El NetRtg por 100 posesiones anticipa rachas ganadoras antes que la clasificación.',
  },
  {
    title: '05. Separa ritmo (Pace) de calidad defensiva real (DefRtg)',
    signalExample: 'Equipo encaja 121 PTS/PJ pero tiene Pace de 104.2 y un notable DefRtg de 110.8',
    interpretation:
      'No es una mala defensa: encaja más puntos brutos únicamente porque sus partidos tienen muchas más posesiones. Al evaluar rivales, mira siempre OffRtg/DefRtg junto al Pace.',
  },
  {
    title: '06. Valora el suelo invisible de las métricas Hustle y Rebote Ofensivo',
    signalExample: 'Interior con 4.2 OR/PJ, 4.5 Screen Assists y 11 Tiros Punteados por noche',
    interpretation:
      'Los especialistas en intangibles (Hustle) mantienen minutos estables aunque tengan una mala noche de tiro porque sostienen la defensa y generan segundas oportunidades constantes.',
  },
];

const METRIC_CATEGORIES: MetricCategoryFilter[] = [
  'Todas',
  'Avanzada y 4 Factores',
  'Zona y Hustle (Intangibles)',
  'Básica y Tiro',
  'Rebote y Creación',
  'Motor de Anomalías',
  'Equipo y Contexto',
];

export function GlossaryView({ onNavigateSection }: GlossaryViewProps) {
  const [filter, setFilter] = useState<GlossaryFilter>('all');
  const [metricCategory, setMetricCategory] = useState<MetricCategoryFilter>('Todas');
  const [query, setQuery] = useState('');

  const q = normalizeSearchText(query);

  const filteredSections = useMemo(() => {
    if (!q) return APP_SECTIONS_DOCS;
    return APP_SECTIONS_DOCS.filter((s) =>
      normalizeSearchText(
        `${s.title} ${s.purpose} ${s.measuredStats} ${s.whenToUse}`
      ).includes(q)
    );
  }, [q]);

  const filteredSources = useMemo(() => {
    if (!q) return DATA_SOURCES_DOCS;
    return DATA_SOURCES_DOCS.filter((d) =>
      normalizeSearchText(
        `${d.channel} ${d.endpointScope} ${d.providedMetrics} ${d.refreshRule}`
      ).includes(q)
    );
  }, [q]);

  const filteredMetrics = useMemo(() => {
    return METRICS_DICTIONARY.filter((m) => {
      if (metricCategory !== 'Todas' && m.category !== metricCategory) return false;
      if (!q) return true;
      return normalizeSearchText(
        `${m.code} ${m.name} ${m.category} ${m.description} ${m.formula} ${m.benchmark}`
      ).includes(q);
    });
  }, [q, metricCategory]);

  const filteredRules = useMemo(() => {
    if (!q) return PRACTICAL_RULES;
    return PRACTICAL_RULES.filter((r) =>
      normalizeSearchText(`${r.title} ${r.signalExample} ${r.interpretation}`).includes(
        q
      )
    );
  }, [q]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Row 1: Homogeneous 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-xl sm:rounded-lg overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-[#1E293B] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-[#1E293B] lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <div className="p-3.5 sm:p-4">
          <p className="text-xs text-slate-400 truncate">Apartados de la app</p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {APP_SECTIONS_DOCS.length}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Diseño 100% homogéneo
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <p className="text-xs text-slate-400 truncate">Motor híbrido</p>
          <p className="mt-1 text-base sm:text-lg font-semibold text-orange-400 truncate">
            NBA.com + ESPN
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            ~580 jugadores y 30 equipos
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <p className="text-xs text-slate-400 truncate">Métricas y fórmulas</p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {METRICS_DICTIONARY.length}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Básicas, Avanzadas y Hustle
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <p className="text-xs text-slate-400 truncate">Criterio analítico</p>
          <p className="mt-1 text-base sm:text-lg font-semibold text-emerald-400 truncate">
            Posesiones + Z-Score
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Fórmulas verificables
          </p>
        </div>
      </div>

      {/* Row 2: Homogeneous Filter & Search Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
          {(
            [
              { id: 'all', label: 'Todo a la vez' },
              { id: 'sections', label: 'Apartados' },
              { id: 'sources', label: 'Fuentes de datos' },
              { id: 'metrics', label: 'Diccionario y fórmulas' },
              { id: 'interpretation', label: 'Cómo leer alertas' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-orange-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#182338]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full xl:w-80 shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar sigla o métrica (ej. USG%, NetRtg, PIE)..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#131C2E] border border-[#1E293B] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
      </div>

      {/* BLOCK 1: Guía por Apartados de la Web */}
      {(filter === 'all' || filter === 'sections') && filteredSections.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">
              01. Explicación de cada apartado de la web
            </h2>
          </div>

          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
            {/* Mobile App Sections Cards (< md) */}
            <div className="md:hidden divide-y divide-[#1E293B]">
              {filteredSections.map((sec) => (
                <div key={sec.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm text-slate-100">
                      {sec.title}
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigateSection(sec.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-orange-500 hover:text-slate-950 border border-[#283548] rounded-md text-orange-400 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Abrir</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {sec.purpose}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="font-semibold text-slate-300">Qué mide:</span>{' '}
                    {sec.measuredStats}
                  </p>
                </div>
              ))}
            </div>

            {/* Desktop App Sections Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                    <th className="py-3 pl-4 pr-3 font-medium w-56">Apartado</th>
                    <th className="py-3 px-3 font-medium">Finalidad principal</th>
                    <th className="py-3 px-3 font-medium">Qué estadísticas mide</th>
                    <th className="py-3 px-3 font-medium">Cuándo consultarlo</th>
                    <th className="py-3 pl-3 pr-4 font-medium text-right">Acceso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] text-xs">
                  {filteredSections.map((sec) => (
                    <tr key={sec.id} className="hover:bg-[#182338] transition-colors">
                      <td className="py-3 pl-4 pr-3 font-semibold text-sm text-slate-100 whitespace-nowrap align-top">
                        {sec.title}
                      </td>
                      <td className="py-3 px-3 text-slate-200 leading-relaxed align-top">
                        {sec.purpose}
                      </td>
                      <td className="py-3 px-3 text-slate-300 leading-relaxed align-top">
                        {sec.measuredStats}
                      </td>
                      <td className="py-3 px-3 text-slate-400 leading-relaxed align-top">
                        {sec.whenToUse}
                      </td>
                      <td className="py-3 pl-3 pr-4 text-right align-top">
                        <button
                          type="button"
                          onClick={() => onNavigateSection(sec.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[#0B1120] hover:bg-orange-500 hover:text-slate-950 border border-[#283548] rounded-md text-orange-400 transition-colors whitespace-nowrap shrink-0"
                        >
                          <span>Abrir</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* BLOCK 2: Fuentes de Datos y Arquitectura Híbrida */}
      {(filter === 'all' || filter === 'sources') && filteredSources.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">
              02. De dónde beben las estadísticas: Motor Híbrido NBA.com Official Stats + ESPN
            </h2>
          </div>

          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
            {/* Mobile Data Sources Cards (< md) */}
            <div className="md:hidden divide-y divide-[#1E293B]">
              {filteredSources.map((src, i) => (
                <div key={i} className="p-3.5 space-y-1.5 text-xs">
                  <div className="font-semibold text-sm text-slate-100">
                    {src.channel}
                  </div>
                  <div className="font-mono text-[11px] text-orange-300 break-all">
                    {src.endpointScope}
                  </div>
                  <p className="text-slate-200 leading-relaxed">
                    {src.providedMetrics}
                  </p>
                  <p className="text-[11px] text-slate-400">{src.refreshRule}</p>
                </div>
              ))}
            </div>

            {/* Desktop Data Sources Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                    <th className="py-3 pl-4 pr-3 font-medium">Canal de Datos Oficial</th>
                    <th className="py-3 px-3 font-medium">Servicio Consultado</th>
                    <th className="py-3 px-3 font-medium">Datos Extraídos y Derivados</th>
                    <th className="py-3 pl-3 pr-4 font-medium">Frecuencia y Caché</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] text-xs">
                  {filteredSources.map((src, i) => (
                    <tr key={i} className="hover:bg-[#182338] transition-colors">
                      <td className="py-3 pl-4 pr-3 font-semibold text-slate-100 align-top">
                        {src.channel}
                      </td>
                      <td className="py-3 px-3 font-mono text-orange-300 align-top whitespace-nowrap">
                        {src.endpointScope}
                      </td>
                      <td className="py-3 px-3 text-slate-200 leading-relaxed align-top">
                        {src.providedMetrics}
                      </td>
                      <td className="py-3 pl-3 pr-4 text-slate-400 leading-relaxed align-top">
                        {src.refreshRule}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-[#1E293B] bg-[#0F172A]/40 text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-orange-400">Nota sobre los 3 modos de Muestra Temporal (barra superior):</span>{' '}
              <strong>Continuo (26-27 + 25-26)</strong> enlaza los partidos recién jugados del curso actual sobre la base completa de 2025-26 para disponer de muestra robusta desde el primer día;{' '}
              <strong>2026-27 En curso</strong> aísla exclusivamente los partidos y métricas avanzadas de la campaña actual; y{' '}
              <strong>2025-26 Completa</strong> audita los 82 partidos cerrados de la temporada anterior.
            </div>
          </div>
        </section>
      )}

      {/* BLOCK 3: Diccionario Completo de Estadísticas Básicas, Avanzadas, Zona y Hustle */}
      {(filter === 'all' || filter === 'metrics') && (
        <section className="space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-100">
                03. Diccionario completo de estadísticas básicas, avanzadas, 4 factores y Hustle
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-x-auto no-scrollbar max-w-full">
              {METRIC_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setMetricCategory(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    metricCategory === cat
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {filteredMetrics.length > 0 ? (
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden">
              {/* Mobile Metrics Dictionary Cards (< md) */}
              <div className="md:hidden divide-y divide-[#1E293B]">
                {filteredMetrics.map((m) => (
                  <div key={m.code} className="p-3.5 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 font-mono font-bold text-sm text-orange-400">
                        <span>{m.code}</span>
                        <MetricInfoTooltip
                          customHelp={{
                            title: `${m.code} — ${m.name}`,
                            simpleDesc: m.description,
                            calculation: m.formula,
                            benchmarkText: m.benchmark,
                          }}
                          align="left"
                        />
                      </div>
                      <span className="text-[11px] text-slate-400 text-right">
                        {m.category}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-100">{m.name}</div>
                    <p className="text-slate-300 leading-relaxed">
                      {m.description}
                    </p>
                    <div className="bg-[#0B1120] border border-[#1E293B]/80 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-200 break-words">
                      <span className="text-slate-400 font-sans">Fórmula: </span>
                      {m.formula}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      <span className="text-emerald-400 font-medium">
                        Referencia NBA:
                      </span>{' '}
                      {m.benchmark}
                    </p>
                  </div>
                ))}
              </div>

              {/* Desktop Metrics Dictionary Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-xs text-slate-400 bg-[#0F172A]/60">
                      <th className="py-3 pl-4 pr-3 font-medium">Sigla / Métrica</th>
                      <th className="py-3 px-3 font-medium">Significado y Qué Mide</th>
                      <th className="py-3 px-3 font-medium">Fórmula / Obtención</th>
                      <th className="py-3 pl-3 pr-4 font-medium">Referencia NBA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] text-xs">
                    {filteredMetrics.map((m) => (
                      <tr key={m.code} className="hover:bg-[#182338] transition-colors">
                        <td className="py-3 pl-4 pr-3 align-top whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 font-mono font-bold text-sm text-orange-400">
                            <span>{m.code}</span>
                            <MetricInfoTooltip
                              customHelp={{
                                title: `${m.code} — ${m.name}`,
                                simpleDesc: m.description,
                                calculation: m.formula,
                                benchmarkText: m.benchmark,
                              }}
                            />
                          </div>
                          <div className="text-slate-400 mt-0.5">{m.category}</div>
                        </td>
                        <td className="py-3 px-3 align-top">
                          <div className="font-semibold text-slate-100 mb-0.5">
                            {m.name}
                          </div>
                          <p className="text-slate-300 leading-relaxed">{m.description}</p>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-200 align-top">
                          {m.formula}
                        </td>
                        <td className="py-3 pl-3 pr-4 text-slate-400 leading-relaxed align-top">
                          {m.benchmark}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg py-8 px-4 text-center text-xs text-slate-400">
              No hay métricas en la categoría "{metricCategory}" que coincidan con "{query}".
            </div>
          )}
        </section>
      )}

      {/* BLOCK 4: Guía Práctica de Interpretación de Alertas */}
      {(filter === 'all' || filter === 'interpretation') && filteredRules.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-orange-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">
              04. Guía práctica: cómo combinar volumen básico y métricas avanzadas sin caer en trampas
            </h2>
          </div>

          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y divide-[#1E293B]">
            {filteredRules.map((rule, idx) => (
              <div key={idx} className="p-4 space-y-1.5">
                <div className="flex flex-col lg:flex-row lg:items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    {rule.title}
                  </h3>
                  <span className="font-mono text-xs text-orange-300">
                    Ejemplo: {rule.signalExample}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {rule.interpretation}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {filteredSections.length === 0 &&
        filteredSources.length === 0 &&
        filteredMetrics.length === 0 &&
        filteredRules.length === 0 && (
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-200">
              No se encontraron términos en el glosario para "{query}".
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFilter('all');
                setMetricCategory('Todas');
              }}
              className="mt-3 px-3.5 py-1.5 text-xs font-semibold bg-orange-500 text-slate-950 rounded-lg hover:bg-orange-400 transition-colors"
            >
              Mostrar todo el glosario
            </button>
          </div>
        )}
    </div>
  );
}
