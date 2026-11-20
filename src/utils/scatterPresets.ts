export type PresetThemeId =
  | 'all'
  | 'efficiency'
  | 'shooting'
  | 'tracking'
  | 'defense'
  | 'clutch_synergy';

export interface ScatterPresetOption {
  id: string;
  label: string;
  axesHint: string;
  theme: Exclude<PresetThemeId, 'all'>;
  layerBadge: string;
  desc: string;
  xMetric: string;
  yMetric: string;
  sizeMetric: string;
  quadrants: { tr: string; tl: string; br: string; bl: string };
}

export const PRESET_THEMES: Array<{ id: PresetThemeId; label: string }> = [
  { id: 'all', label: 'Todos (18)' },
  { id: 'efficiency', label: 'Eficiencia e Impacto' },
  { id: 'shooting', label: 'Tiro y Zonas' },
  { id: 'tracking', label: 'Tracking Óptico' },
  { id: 'defense', label: 'Defensa y Hustle' },
  { id: 'clutch_synergy', label: 'Clutch, Synergy y Faltas' },
];

/**
 * 18 Presets Tácticos de Alta Correlación para Equipos NBA
 * Cubren las 10 capas estadísticas oficiales de NBA.com
 */
export const TEAM_PRESETS: ScatterPresetOption[] = [
  {
    id: 'contenders',
    label: '1. Aspirantes Élite',
    axesHint: 'OffRtg vs DefRtg',
    theme: 'efficiency',
    layerBadge: '2. Ratings y 4F',
    desc: 'Mapa maestro de la liga: relaciona eficiencia ofensiva y defensiva por 100 posesiones. En DefRtg menor es mejor (eje Y invertido), situando a los verdaderos candidatos al título arriba a la derecha.',
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
    id: 'net_win',
    label: '2. Dominio Neto vs Victorias',
    axesHint: 'NetRtg vs %V',
    theme: 'efficiency',
    layerBadge: '1 & 2. Balance',
    desc: 'La correlación más alta de todo el baloncesto (r > +0.94): el margen neto por 100 posesiones predice el porcentaje real de victorias de la franquicia.',
    xMetric: 'netRtg',
    yMetric: 'winPct',
    sizeMetric: 'differential',
    quadrants: {
      tr: 'Dominadores Reales (Balance y NetRtg Élite)',
      tl: 'Más Victorias que Margen (Suerte / Clutch)',
      br: 'Mejor Juego que Récord (Margen Sólido)',
      bl: 'Franquicias en Parte Baja',
    },
  },
  {
    id: 'efg_off',
    label: '3. Puntería Efectiva vs Ataque',
    axesHint: 'eFG% vs OffRtg',
    theme: 'efficiency',
    layerBadge: '2. 4 Factores',
    desc: 'El Factor #1 de Dean Oliver: medir cuánto impulsa el Tiro de Campo Efectivo (premiando el triple) la eficiencia ofensiva colectiva.',
    xMetric: 'efgPct',
    yMetric: 'offRtg',
    sizeMetric: 'tsPct',
    quadrants: {
      tr: 'Maquinaria Ofensiva Letal (Acierto y Rating Élite)',
      tl: 'Ataque por Rebote/Libres (Menos eFG%, Gran OffRtg)',
      br: 'Buen Tiro Frenado por Pérdidas',
      bl: 'Ataques Espesos de Bajo Acierto',
    },
  },
  {
    id: 'def_opp_efg',
    label: '4. Contención de Tiro Rival',
    axesHint: 'Opp eFG% vs DefRtg',
    theme: 'defense',
    layerBadge: '2 & 7. 4F Def.',
    desc: 'Correlación directa defensiva: ambos ejes están invertidos (menor es mejor), demostrando cómo bajar el eFG% rival blinda el Rating Defensivo.',
    xMetric: 'oppEfgPct',
    yMetric: 'defRtg',
    sizeMetric: 'oppPts',
    quadrants: {
      tr: 'Murallas Defensivas (Limitan Acierto y Puntos)',
      tl: 'Defensas de Robo y Rebote (Permiten Tiro, Cuidan Posesión)',
      br: 'Frenan el Tiro pero Sufren en Rebote/Faltas',
      bl: 'Defensas Permisivas en Tiro y Rating',
    },
  },
  {
    id: 'perimeter',
    label: '5. Triple: Peso vs Acierto',
    axesHint: '%PTS 3P vs 3P%',
    theme: 'shooting',
    layerBadge: '1 & 3. Splits',
    desc: 'Compara el peso del triple sobre la anotación total con el porcentaje de acierto real desde el perímetro.',
    xMetric: 'pctPts3pt',
    yMetric: 'fg3Pct',
    sizeMetric: 'fg3mAvg',
    quadrants: {
      tr: 'Artillería Pesada (Alto Volumen y Gran Acierto)',
      tl: 'Francotiradores Selectivos (Tiran Poco pero Aciertan)',
      br: 'Dependencia Exterior (Mucho Triple sin Puntería)',
      bl: 'Ataque Interior / Tradicional',
    },
  },
  {
    id: 'three_vs_paint',
    label: '6. Geometría: Triple vs Pintura',
    axesHint: '%FGA 3P vs %PTS Pint.',
    theme: 'shooting',
    layerBadge: '3. Scoring Splits',
    desc: 'Fuerte correlación inversa estilística: equipos que bombardean desde la línea de tres frente a conjuntos que atacan constantemente la pintura.',
    xMetric: 'pctFga3pt',
    yMetric: 'pctPtsPaint',
    sizeMetric: 'efgPct',
    quadrants: {
      tr: 'Ataque Moderno Híbrido (Pintura y Triple)',
      tl: 'Dominio Físico Interior (Pintura Prioritaria)',
      br: 'Perímetro Puro (Lluvia de Triples)',
      bl: 'Juego de Media Distancia y Tiros Libres',
    },
  },
  {
    id: 'playmaking',
    label: '7. Circulación vs Seguridad',
    axesHint: 'AST/TO vs TOV%',
    theme: 'efficiency',
    layerBadge: '2. 4 Factores',
    desc: 'Relación entre asistencias por pérdida y porcentaje de pérdidas por posesión (TOV% invertido: menor es mejor).',
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
    id: 'assisted_playstyle',
    label: '8. Juego Coral vs Ratio AST',
    axesHint: '%AST FGM vs AST Ratio',
    theme: 'shooting',
    layerBadge: '2 & 3. Creación',
    desc: 'Muestra la fuerte conexión entre el porcentaje de canastas asistidas y el flujo total de asistencias por cada 100 posesiones.',
    xMetric: 'pctAstFgm',
    yMetric: 'astRatio',
    sizeMetric: 'astAvg',
    quadrants: {
      tr: 'Baloncesto Coral (Movimiento Continuo de Balón)',
      tl: 'Alto Flujo de Pases sin Tiro Finalizado',
      br: 'Canastas Asistidas con Posesiones Lentas',
      bl: 'Juego de Aclarados (ISO) y Creación Propia',
    },
  },
  {
    id: 'rim_finishing',
    label: '9. Presión en el Aro vs Pintura',
    axesHint: 'Aro FGA vs PTS Pint.',
    theme: 'shooting',
    layerBadge: '4. Zonas de Tiro',
    desc: 'Relación directa entre el volumen de lanzamientos en Zona Restringida (<4ft) y la cosecha total de puntos en pintura.',
    xMetric: 'raFga',
    yMetric: 'ptsPaint',
    sizeMetric: 'raFgPct',
    quadrants: {
      tr: 'Aplastantes en la Zona (Mucho Aro y Pintura)',
      tl: 'Anotan en Pintura con Flotadoras / Ganchos',
      br: 'Llegan al Aro con Menor Acierto',
      bl: 'Equipos Alejados del Aro',
    },
  },
  {
    id: 'zones_3p_efg',
    label: '10. Zonas 3P vs Tiro Efectivo',
    axesHint: 'Zonas 3P% vs eFG%',
    theme: 'shooting',
    layerBadge: '4. Zonas y 2. 4F',
    desc: 'Correlación directa: el acierto combinado en esquinas y arco frontal dispara el eFG% colectivo del equipo.',
    xMetric: 'threeFgPct',
    yMetric: 'efgPct',
    sizeMetric: 'totalThreeFga',
    quadrants: {
      tr: 'Élite de Tiro Global y Exterior',
      tl: 'Gran eFG% Apoyado en Finalización Interior',
      br: 'Aciertan Triples pero Faltan Puntos Cerca del Aro',
      bl: 'Dificultad General en Selección y Acierto',
    },
  },
  {
    id: 'passing_creation',
    label: '11. Pases Dados vs Ast. Potenciales',
    axesHint: 'Pases vs Ast. Pot.',
    theme: 'tracking',
    layerBadge: '5. Tracking Óptico',
    desc: 'Seguimiento óptico puro: mover más el balón multiplica las asistencias potenciales y los puntos generados por pase.',
    xMetric: 'passesMade',
    yMetric: 'potentialAst',
    sizeMetric: 'astPtsCreated',
    quadrants: {
      tr: 'Generadores de Ventajas por Circulación',
      tl: 'Pases Directos a Tiro (Sistema Vertical)',
      br: 'Mucho Pase Perimetral sin Romper Defensa',
      bl: 'Juego Estático o Muy Individual',
    },
  },
  {
    id: 'drives_paint',
    label: '12. Penetraciones vs PTS en Drive',
    axesHint: 'Drives vs Drive PTS',
    theme: 'tracking',
    layerBadge: '5. Tracking Óptico',
    desc: 'Correlación lineal muy fuerte: las franquicias que más rompen la primera línea con bote dominan la anotación en penetración.',
    xMetric: 'drives',
    yMetric: 'drivePts',
    sizeMetric: 'driveFgPct',
    quadrants: {
      tr: 'Motores de Penetración Letales',
      tl: 'Penetran Poco pero Finalizan con Eficacia',
      br: 'Muchas Penetraciones para Doblar Balón (Drive & Kick)',
      bl: 'Ataques de Bloqueo y Tiro Exterior',
    },
  },
  {
    id: 'tracking_effort',
    label: '13. Distancia Recorrida vs Ritmo',
    axesHint: 'Dist. (mi) vs Pace',
    theme: 'tracking',
    layerBadge: '5. Tracking y Ritmo',
    desc: 'Desgaste físico colectivo: mayor distancia recorrida por partido suele ir ligada a un ritmo de posesiones más alto y juego en transición.',
    xMetric: 'distMiles',
    yMetric: 'pace',
    sizeMetric: 'ptsFastBreak',
    quadrants: {
      tr: 'Correcaminos (Ritmo Alto y Despliegue Físico)',
      tl: 'Ritmo Alto por Posesiones Cortas de Tiro Rápido',
      br: 'Mucho Movimiento sin Balón a Ritmo Controlado',
      bl: 'Baloncesto Pausado en Media Cancha',
    },
  },
  {
    id: 'paint_physical',
    label: '14. Pintura y 2ª Oportunidad',
    axesHint: 'OREB% vs PTS 2ª Op.',
    theme: 'defense',
    layerBadge: '6. Hustle & Reb.',
    desc: 'Correlación matemática evidente: capturar mayor porcentaje de rebote ofensivo se traduce directamente en puntos de segunda jugada.',
    xMetric: 'orebPct',
    yMetric: 'pts2ndChance',
    sizeMetric: 'boxOuts',
    quadrants: {
      tr: 'Bestias del Rebote Ofensivo y 2ª Opción',
      tl: 'Transforman Cada Rebote en Canasta Rápida',
      br: 'Capturan Rebotes pero Falla la Finalización',
      bl: 'Priorizan el Balance Defensivo tras Tiro',
    },
  },
  {
    id: 'hustle_disruption',
    label: '15. Desvíos vs Pérdidas Rival',
    axesHint: 'Desvíos vs Opp TOV',
    theme: 'defense',
    layerBadge: '6 & 7. Hustle/Def.',
    desc: 'Presión defensiva activa: tocar balones en líneas de pase (Deflections) correlaciona estrechamente con provocar pérdidas al contrario.',
    xMetric: 'deflections',
    yMetric: 'oppTov',
    sizeMetric: 'ptsOffTov',
    quadrants: {
      tr: 'Defensas Asfixiantes y Disruptivas',
      tl: 'Forzan Errores por Trampas y Presión Táctica',
      br: 'Manos Rápidas sin Robos Completados',
      bl: 'Defensa Conservadora de Contención',
    },
  },
  {
    id: 'dfg_impact',
    label: '16. Reducción Tiro Rival (DFG%)',
    axesHint: 'Diff% DFG vs DefRtg',
    theme: 'defense',
    layerBadge: '7. Defensa DFG%',
    desc: 'Ambos ejes invertidos (menor es mejor): bajar el acierto esperado de los tiradores rivales (-Diff%) mejora drásticamente el DefRtg del equipo.',
    xMetric: 'pctPlusMinus',
    yMetric: 'defRtg',
    sizeMetric: 'contestedShots',
    quadrants: {
      tr: 'Intimidación Élite y Rating Top',
      tl: 'Buen DefRtg por Pérdidas/Rebote aunque Metan Tiros',
      br: 'Puntean Bien pero Conceden Libres/Rebotes',
      bl: 'Defensas Blandas ante el Lanzador',
    },
  },
  {
    id: 'clutch_winners',
    label: '17. Sangre Fría en el Clutch',
    axesHint: 'NetRtg Cl. vs %V Cl.',
    theme: 'clutch_synergy',
    layerBadge: '8. Clutch & GW',
    desc: 'En los últimos 5 minutos con ±5 pts, el Net Rating en el clutch determina el porcentaje de victorias en finales apretados (tamaño: Game Winners).',
    xMetric: 'clNetRtg',
    yMetric: 'clWPct',
    sizeMetric: 'gameWinners',
    quadrants: {
      tr: 'Especialistas en Finales Igualados',
      tl: 'Ganan Finales Apretados por Tiros Decisivos',
      br: 'Dominan Parciales Clutch pero Escapan Partidos',
      bl: 'Sufren para Cerrar Marcadores Ajustados',
    },
  },
  {
    id: 'synergy_trans_fouls',
    label: '18. Transición Synergy vs Contraat.',
    axesHint: 'Trans. PPP vs Contraat.',
    theme: 'clutch_synergy',
    layerBadge: '9. Playtypes & 6',
    desc: 'Conecta la eficiencia táctica corriendo la pista (Synergy PPP en Transición) con los puntos totales anotados al contraataque.',
    xMetric: 'ptTransPpp',
    yMetric: 'ptsFastBreak',
    sizeMetric: 'ptTopPpp',
    quadrants: {
      tr: 'Contraataque Letal (Alto Volumen y PPP)',
      tl: 'Corren Mucho pero Definen con Menor Eficiencia',
      br: 'Transición Muy Eficiente cuando Deciden Correr',
      bl: 'Ataque Metódico en Estático',
    },
  },
];

/**
 * 18 Presets Analíticos de Alta Correlación para Jugadores NBA
 * Cubren las 10 capas estadísticas oficiales de NBA.com
 */
export const PLAYER_PRESETS: ScatterPresetOption[] = [
  {
    id: 'usage_efficiency',
    label: '1. Uso vs Eficiencia',
    axesHint: 'USG% vs TS%',
    theme: 'efficiency',
    layerBadge: '2. Avanzadas',
    desc: 'La matriz definitiva de estrellas: detecta primeras espadas capaces de sostener una eficiencia True Shooting élite soportando altísimo volumen de uso.',
    xMetric: 'usgEst',
    yMetric: 'tsPct',
    sizeMetric: 'points',
    quadrants: {
      tr: 'Superestrellas Élite (Alto Uso y Eficiencia)',
      tl: 'Finalizadores Letales / Rol Eficiente',
      br: 'Alto Volumen / Eficiencia Moderada',
      bl: 'Defensivos y Apoyo Táctico',
    },
  },
  {
    id: 'minutes_scoring',
    label: '2. Puntos vs Minutos',
    axesHint: 'PTS vs MIN',
    theme: 'efficiency',
    layerBadge: '1. Básicas',
    desc: 'Correlación natural entre producción anotadora (PTS) y tiempo en cancha (MIN), ponderando el tamaño de burbuja por Game Score.',
    xMetric: 'points',
    yMetric: 'minutes',
    sizeMetric: 'gameScore',
    quadrants: {
      tr: 'Máximos Anotadores Titulares',
      tl: 'Especialistas Defensivos / Minutos Altos',
      br: 'Microondas de Banquillo (Alta Anotación/Min)',
      bl: 'Rotación Secundaria',
    },
  },
  {
    id: 'pra_impact',
    label: '3. Producción PRA vs GmSc',
    axesHint: 'PRA vs GmSc',
    theme: 'efficiency',
    layerBadge: '1 & 2. Impacto',
    desc: 'Altísima correlación (r > +0.92): compara la suma de Puntos+Rebotes+Asistencias frente al índice de impacto real Game Score.',
    xMetric: 'pra',
    yMetric: 'gameScore',
    sizeMetric: 'plusMinus',
    quadrants: {
      tr: 'Dominio Total del Encuentro',
      tl: 'Eficiencia Analítica Pura (Sin Fallos ni Pérdidas)',
      br: 'Volumen de Cifras con Menor Eficiencia',
      bl: 'Rol Específico de Contención',
    },
  },
  {
    id: 'offrtg_netrtg',
    label: '4. Rating Ofensivo vs Net Rating',
    axesHint: 'OffRtg vs NetRtg',
    theme: 'efficiency',
    layerBadge: '2. Avanzadas',
    desc: 'Relación directa (r ≈ +0.80) entre eficiencia ofensiva en pista (OffRtg) y margen neto total del equipo (NetRtg), ponderando la burbuja por PIE%.',
    xMetric: 'offRtg',
    yMetric: 'netRtg',
    sizeMetric: 'pie',
    quadrants: {
      tr: 'Motores de Impacto Ganador (OffRtg y NetRtg Élite)',
      tl: 'Impacto Neto Positivo desde la Defensa',
      br: 'Gran Ataque Lastrado por la Defensa en Pista',
      bl: 'Etapas o Quintetos de Dificultad Colectiva',
    },
  },
  {
    id: 'perimeter_shooters',
    label: '5. Triples: Volumen vs Acierto',
    axesHint: '3PA vs 3P%',
    theme: 'shooting',
    layerBadge: '1. Tiro Exterior',
    desc: 'Diferencia a los tiradores de alto volumen y gravedad exterior frente a los especialistas de selección más conservadora.',
    xMetric: 'fg3a',
    yMetric: 'fg3Pct',
    sizeMetric: 'fg3m',
    quadrants: {
      tr: 'Tiradores Letales de Alto Volumen',
      tl: 'Especialistas Clínicos de Bajo Volumen',
      br: 'Tiradores Racha de Alto Lanzamiento',
      bl: 'Interiores / No Tiradores',
    },
  },
  {
    id: 'scoring_profile',
    label: '6. Perfil: Exterior vs Pintura',
    axesHint: '%FGA 3P vs %PTS Pint.',
    theme: 'shooting',
    layerBadge: '3. Scoring Splits',
    desc: 'Fuerte correlación negativa entre especialistas perimetrales y finalizadores puros dentro de la pintura.',
    xMetric: 'pctFga3pt',
    yMetric: 'pctPtsPaint',
    sizeMetric: 'points',
    quadrants: {
      tr: 'Anotadores Totales (Aro y Perímetro)',
      tl: 'Dominadores de la Zona Pintada',
      br: 'Tiradores Perimetrales Puros',
      bl: 'Especialistas de Media Distancia / Libres',
    },
  },
  {
    id: 'self_creation',
    label: '7. Creación Propia vs Pull-Up',
    axesHint: '%UAST vs PullUp PTS',
    theme: 'shooting',
    layerBadge: '3 & 5. Creación',
    desc: 'Correlación directa: quienes anotan más canastas sin asistencia previa (%UAST) lideran la liga en puntos tras bote (Pull-Up).',
    xMetric: 'pctUastFgm',
    yMetric: 'pullUpPts',
    sizeMetric: 'usgEst',
    quadrants: {
      tr: 'Creadores de Tiro Élite en 1c1',
      tl: 'Pull-Up tras Salida de Bloqueos',
      br: 'Aislamientos hacia el Aro sin Tiro Tras Bote',
      bl: 'Finalizadores Asistidos / Sin Balón',
    },
  },
  {
    id: 'catch_shoot_spotup',
    label: '8. Catch & Shoot vs Spot-Up %',
    axesHint: 'C&S PTS vs SpotUp %',
    theme: 'shooting',
    layerBadge: '5 & 9. Tiro/Syn.',
    desc: 'Unión directa entre Tracking Óptico y Synergy Playtypes: los reyes del tiro tras recepción dominan la frecuencia Spot-Up.',
    xMetric: 'catchShootPts',
    yMetric: 'ptSpotupPct',
    sizeMetric: 'catchShootFg3Pct',
    quadrants: {
      tr: 'Francotiradores Puros Sin Balón',
      tl: 'Rol Spot-Up con Menor Volumen de Tiros',
      br: 'Anotadores C&S que También Crean con Balón',
      bl: 'Manejadores Primarios / Pívots Interiores',
    },
  },
  {
    id: 'rim_pressure',
    label: '9. Presión en el Aro vs Pintura',
    axesHint: 'Aro FGA vs PTS Pint.',
    theme: 'shooting',
    layerBadge: '4 & 6. Zonas',
    desc: 'Relación casi lineal: intentar tiros en Zona Restringida (<4ft) alimenta la producción total de puntos en la pintura (tamaño: % acierto en aro).',
    xMetric: 'raFga',
    yMetric: 'ptsPaint',
    sizeMetric: 'raFgPct',
    quadrants: {
      tr: 'Finalizadores Imparables en Pintura',
      tl: 'Anotan en Pintura mediante Flotadoras/Poste',
      br: 'Muchos Intentos Cerca del Aro con Menos Acierto',
      bl: 'Juego Exterior / Perimetral',
    },
  },
  {
    id: 'drives_playmaking',
    label: '10. Penetraciones vs PTS Drive',
    axesHint: 'Drives vs Drive PTS',
    theme: 'tracking',
    layerBadge: '5. Tracking Óptico',
    desc: 'Correlación altísima (r > +0.90): muestra qué manejadores transforman el volumen de penetraciones en anotación directa o pase (tamaño: Drive AST%).',
    xMetric: 'drives',
    yMetric: 'drivePts',
    sizeMetric: 'driveAstPct',
    quadrants: {
      tr: 'Desequilibrantes Totales en Penetración',
      tl: 'Penetran Poco con Alta Eficacia Directa',
      br: 'Penetran para Doblar el Balón (Playmakers)',
      bl: 'Jugadores Sin Bote de Penetración',
    },
  },
  {
    id: 'playmaker_engine',
    label: '11. Creación de Pases de Canasta',
    axesHint: 'Ast. Pot. vs PTS x Pase',
    theme: 'tracking',
    layerBadge: '5. Tracking Óptico',
    desc: 'Medición exacta de visión de juego: las asistencias potenciales reflejan las oportunidades reales creadas más allá de si el compañero acierta.',
    xMetric: 'potentialAst',
    yMetric: 'astPtsCreated',
    sizeMetric: 'assists',
    quadrants: {
      tr: 'Generadores Élite de la Liga',
      tl: 'Pases de Alto Valor (Triples / Aro)',
      br: 'Generan Tiros sin Conversión de Compañeros',
      bl: 'Finalizadores y Especialistas',
    },
  },
  {
    id: 'synergy_pnr_poss',
    label: '12. Posesión vs Pick & Roll Man.',
    axesHint: 'T. Pos vs P&R Man. %',
    theme: 'tracking',
    layerBadge: '5 & 9. Tracking/Syn.',
    desc: 'Conexión táctica entre Tracking y Playtypes Synergy: dominar el tiempo con el balón suele asociarse a dirigir el Pick & Roll.',
    xMetric: 'timeOfPoss',
    yMetric: 'ptPrbhPct',
    sizeMetric: 'ptPrbhPpp',
    quadrants: {
      tr: 'Directores de Pick & Roll Puros',
      tl: 'P&R Directo sin Amasar Posesión',
      br: 'Generadores en Aclarado o Poste con Balón',
      bl: 'Juego Sin Balón y Cortes',
    },
  },
  {
    id: 'motor_distance',
    label: '13. Minutos vs Distancia Recorrida',
    axesHint: 'MIN vs Dist. (mi)',
    theme: 'tracking',
    layerBadge: '5. Tracking Físico',
    desc: 'Relación física directa: evalúa el despliegue kilométrico por partido en función del tiempo en pista (tamaño: velocidad media mph).',
    xMetric: 'minutes',
    yMetric: 'distMiles',
    sizeMetric: 'avgSpeed',
    quadrants: {
      tr: 'Motores Incansables (Muchos Minutos y Millas)',
      tl: 'Máxima Intensidad y Velocidad en Rotación',
      br: 'Estrellas de Juego Estático / Controlado',
      bl: 'Rotación Corta',
    },
  },
  {
    id: 'hustle_disruptor',
    label: '14. Desvíos vs Robos de Balón',
    axesHint: 'Desvíos vs ROB',
    theme: 'defense',
    layerBadge: '6 & 1. Hustle',
    desc: 'Fuerte correlación defensiva: desviar balones en líneas de pase (Deflections) es el predictor número uno de los robos por partido.',
    xMetric: 'deflections',
    yMetric: 'steals',
    sizeMetric: 'looseBalls',
    quadrants: {
      tr: 'Ladrones de Guante Blanco (Anticipación Élite)',
      tl: 'Robos Directos sin Desvíos Previos',
      br: 'Ensucian Pases y Frenan Circulación Rival',
      bl: 'Defensores Posicionales',
    },
  },
  {
    id: 'paint_anchor',
    label: '15. Intimidación y Tapones 2P',
    axesHint: 'Punt. 2P vs TAP',
    theme: 'defense',
    layerBadge: '6 & 1. Hustle',
    desc: 'Para pívots y aleros altos: puntear lanzamientos interiores de dos puntos se asocia directamente con colocar tapones (tamaño: Box-Outs).',
    xMetric: 'contestedShots2pt',
    yMetric: 'blocks',
    sizeMetric: 'boxOuts',
    quadrants: {
      tr: 'Protectores de Aro Élite',
      tl: 'Taponadores Llegando desde el Lado Débil',
      br: 'Punteo Vertical Sólido sin Saltar al Tapón',
      bl: 'Defensores Exteriores',
    },
  },
  {
    id: 'dfg_workload',
    label: '16. Carga Defensiva vs Tiros Punteados',
    axesHint: 'DFGA/PJ vs Punteados',
    theme: 'defense',
    layerBadge: '7 & 6. Defensa',
    desc: 'Fuerte correlación (r ≈ +0.81): relaciona los tiros defendidos como marcador más cercano (DFGA/PJ) con los tiros punteados por partido (tamaño: Diff% DFG).',
    xMetric: 'dFga',
    yMetric: 'contestedShots',
    sizeMetric: 'pctPlusMinus',
    quadrants: {
      tr: 'Anclas Defensivas (Alta Carga y Máximo Punteo)',
      tl: 'Ayudas Puntuales (Puntean Mucho en Menos Emparejamientos)',
      br: 'Exigidos por Sistema con Menor Punteo Directo',
      bl: 'Menor Exposición Defensiva Directa',
    },
  },
  {
    id: 'clutch_closers',
    label: '17. Cerradores en el Clutch',
    axesHint: 'PTS Cl. vs MIN Cl.',
    theme: 'clutch_synergy',
    layerBadge: '8. Clutch & GW',
    desc: 'Anotación por partido en los últimos 5 minutos con marcador ajustado (±5 pts) frente a los minutos disputados en clutch, resaltando Game Winners en el tamaño.',
    xMetric: 'clPts',
    yMetric: 'clMin',
    sizeMetric: 'gameWinners',
    quadrants: {
      tr: 'Cerradores Decisivos en Finales Apretados',
      tl: 'Presencia Defensiva / Apoyo sin Tirar en Finales',
      br: 'Anotación Explosiva en Pocos Minutos Clutch',
      bl: 'Poca Participación en Finales Igualados',
    },
  },
  {
    id: 'fouls_drawn_fta',
    label: '18. Faltas Provocadas vs Tiros Libres',
    axesHint: 'PFD/PJ vs TLI/PJ',
    theme: 'clutch_synergy',
    layerBadge: '10 & 1. Faltas',
    desc: 'Correlación casi perfecta (r ≈ +0.94): forzar faltas al defensor atacando el aro garantiza viajes constantes a la línea de tiros libres.',
    xMetric: 'pfd',
    yMetric: 'fta',
    sizeMetric: 'ftRate',
    quadrants: {
      tr: 'Maestros Generando Contacto y Tiros Libres',
      tl: 'Sufren Faltas en Lanzamiento con Alto TLI',
      br: 'Forzan Faltas en Pista sin Tiro Asociado',
      bl: 'Juego Exterior sin Contacto Físico',
    },
  },
];

export type CorrelationPackId =
  | 'overview'
  | 'shooting_zones'
  | 'tracking_synergy'
  | 'defense_clutch_discipline';

export interface CorrelationPackConfig {
  id: CorrelationPackId;
  label: string;
  desc: string;
  metricIds: string[];
}

export const TEAM_CORRELATION_PACKS: CorrelationPackConfig[] = [
  {
    id: 'overview',
    label: '1. Radiografía 10 Capas (16×16)',
    desc: 'Selección transversal con métricas clave de las 10 capas oficiales NBA.com.',
    metricIds: [
      'winPct',
      'netRtg',
      'offRtg',
      'defRtg',
      'pace',
      'efgPct',
      'pctPts3pt',
      'raFgPct',
      'drives',
      'potentialAst',
      'ptsPaint',
      'deflections',
      'pctPlusMinus',
      'clNetRtg',
      'ptTopPpp',
      'pfd',
    ],
  },
  {
    id: 'shooting_zones',
    label: '2. Tiro, Scoring Splits y Zonas (12×12)',
    desc: 'Eficiencia de tiro, volumen exterior vs pintura y precisión por zonas de cancha.',
    metricIds: [
      'offRtg',
      'efgPct',
      'tsPct',
      'fg3Pct',
      'pctFga3pt',
      'pctPtsPaint',
      'pctPts2ptMr',
      'pctAstFgm',
      'raFga',
      'raFgPct',
      'corner3FgPct',
      'ab3FgPct',
    ],
  },
  {
    id: 'tracking_synergy',
    label: '3. Tracking Óptico y Synergy (14×14)',
    desc: 'Penetraciones, pases, distancia recorrida y eficiencia por jugada táctica Synergy.',
    metricIds: [
      'offRtg',
      'pace',
      'drives',
      'drivePts',
      'passesMade',
      'potentialAst',
      'astPtsCreated',
      'distMiles',
      'avgSpeed',
      'ptTopPpp',
      'ptSpotupPpp',
      'ptPrbhPpp',
      'ptTransPpp',
      'ptCutPpp',
    ],
  },
  {
    id: 'defense_clutch_discipline',
    label: '4. Defensa, Hustle, Clutch y Faltas (14×14)',
    desc: 'Impacto defensivo DFG%, hustle físico, finales igualados y disciplina arbitral.',
    metricIds: [
      'winPct',
      'defRtg',
      'oppEfgPct',
      'oppTovPct',
      'pts2ndChance',
      'deflections',
      'contestedShots',
      'boxOuts',
      'pctPlusMinus',
      'clNetRtg',
      'clWPct',
      'pf',
      'tov',
      'gameWinners',
    ],
  },
];

export const PLAYER_CORRELATION_PACKS: CorrelationPackConfig[] = [
  {
    id: 'overview',
    label: '1. Radiografía 10 Capas (16×16)',
    desc: 'Métricas representativas de las 10 capas oficiales para comparar su relación en jugadores.',
    metricIds: [
      'points',
      'gameScore',
      'pie',
      'usgEst',
      'tsPct',
      'pctPtsPaint',
      'raFgPct',
      'drives',
      'potentialAst',
      'distMiles',
      'deflections',
      'pctPlusMinus',
      'clPts',
      'ptTopPpp',
      'pfd',
      'netRtg',
    ],
  },
  {
    id: 'shooting_zones',
    label: '2. Tiro, Scoring Splits y Zonas (12×12)',
    desc: 'Perfil de tiro interior/exterior, autogeneración (%UAST) y acierto por zona.',
    metricIds: [
      'points',
      'tsPct',
      'efgPct',
      'fg3Pct',
      'pctFga3pt',
      'pctPtsPaint',
      'pctUastFgm',
      'raFga',
      'raFgPct',
      'midFgPct',
      'corner3FgPct',
      'ab3FgPct',
    ],
  },
  {
    id: 'tracking_synergy',
    label: '3. Tracking Óptico y Synergy (14×14)',
    desc: 'Penetraciones, Catch & Shoot, Pull-Up, carga de balón y eficiencia Synergy.',
    metricIds: [
      'minutes',
      'points',
      'drives',
      'drivePts',
      'catchShootPts',
      'pullUpPts',
      'potentialAst',
      'astPtsCreated',
      'timeOfPoss',
      'distMiles',
      'ptTopPpp',
      'ptSpotupPpp',
      'ptPrbhPpp',
      'ptIsoPpp',
    ],
  },
  {
    id: 'defense_clutch_discipline',
    label: '4. Defensa, Hustle, Clutch y Faltas (14×14)',
    desc: 'Desvíos, tiros punteados, carga y eficacia DFG%, rendimiento en el clutch y disciplina arbitral.',
    metricIds: [
      'gameScore',
      'stocks',
      'deflections',
      'contestedShots',
      'boxOuts',
      'dFga',
      'pctPlusMinus',
      'clPts',
      'clNetRtg',
      'clWPct',
      'pf',
      'pfd',
      'turnovers',
      'gameWinners',
    ],
  },
];

export interface PearsonInterpretation {
  strengthLabel: string;
  directionLabel: string;
  badgeColorClass: string;
  summaryText: string;
}

export function interpretPearsonCorrelation(
  r: number,
  sampleSize: number
): PearsonInterpretation {
  if (sampleSize < 3 || Number.isNaN(r)) {
    return {
      strengthLabel: 'Muestra insuficiente',
      directionLabel: 'N < 3',
      badgeColorClass: 'bg-slate-800/80 text-slate-400 border-slate-700',
      summaryText: 'Se necesitan al menos 3 entidades válidas para calcular la correlación lineal.',
    };
  }

  const absR = Math.abs(r);
  const directionLabel =
    absR < 0.15 ? 'Sin tendencia clara' : r > 0 ? 'Relación directa (+)' : 'Relación inversa (-)';

  if (absR >= 0.75) {
    return {
      strengthLabel: 'Muy fuerte',
      directionLabel,
      badgeColorClass:
        r >= 0
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          : 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      summaryText: `Asociación lineal muy estrecha entre ambos ejes (${directionLabel.toLowerCase()}).`,
    };
  }
  if (absR >= 0.5) {
    return {
      strengthLabel: 'Fuerte',
      directionLabel,
      badgeColorClass:
        r >= 0
          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          : 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      summaryText: `Tendencia clara y consistente entre las dos métricas (${directionLabel.toLowerCase()}).`,
    };
  }
  if (absR >= 0.3) {
    return {
      strengthLabel: 'Moderada',
      directionLabel,
      badgeColorClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      summaryText: `Relación lineal moderada; influyen también otros factores tácticos.`,
    };
  }
  if (absR >= 0.15) {
    return {
      strengthLabel: 'Débil',
      directionLabel,
      badgeColorClass: 'bg-slate-800 text-slate-300 border-slate-700',
      summaryText: `Vínculo lineal ligero con alta dispersión individual.`,
    };
  }
  return {
    strengthLabel: 'Casi nula',
    directionLabel,
    badgeColorClass: 'bg-slate-800/70 text-slate-400 border-slate-700',
    summaryText: `Variables prácticamente independientes entre sí (gran diversidad de perfiles).`,
  };
}
