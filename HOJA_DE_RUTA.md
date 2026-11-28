# Hoja de Ruta & Evolución de RadarNBA (Fusionada con Auditoría Integral)

Plan maestro permanente de arquitectura, analítica avanzada, rendimiento, diseño editorial y nuevas funcionalidades para la plataforma de seguimiento, juego y aprendizaje analítico de la NBA.

---

## Índice Rápido por Estado

- **A) En desarrollo**: Ninguna fase abierta (esperando selección de siguiente objetivo)
- **B) Pendiente prioritario**: **Fase 18 — Mejora Visual Continua** (selector de densidad y miniaturas de forma reciente) o **Fase 7 — Modo Claro / Tema Dual Completo**
- **C) Pendiente**: Fases 18 (Mejora Visual Continua — *Broadcast 3.0* ya desplegado como skin independiente), 7 (Modo Claro / Tema Dual), 10 (Virtualización y Web Workers) y 11 (Mi NBA Personalizada y Playoffs)
- **D) Ya finalizado**: Fases 1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 14, 15, 16 y **17 (17A + 17B + 17C)**

---

## A) En desarrollo 🎨

- *Sin fases activas en curso.*

---

## B) Pendiente prioritario 🚀

- **Fase 18 (Mejora Visual Continua)** o **Fase 7 (Modo Claro / Tema Dual Completo)** según prioridad de producto.

---

## C) Pendiente ⏳

### Fases Funcionales y de Producto en Cartera
- **Fase 18: Mejora Visual Continua y Ordenación de la Información (⏳)**:
  - Evolución constante del diseño editorial y la arquitectura de información en todas las secciones (*Skin Broadcast 3.0* con sidebar agrupado colapsable y cinta superior de partidos ya desplegado sin reemplazar v1/v2); quedan pendientes selector de densidad (*Compacta* vs *Editorial*) y miniaturas de forma reciente en *hover/tap*.
- **Fase 7: Modo Claro / Tema Dual Completo (⏳)**:
  - Migración completa a Tokens Semánticos CSS (`--bg-surface`, `--text-primary`, etc.) y conmutador **Modo Oscuro ↔ Modo Claro** con paletas adaptadas en gráficos SVG y exportaciones PNG.
- **Fase 10: Refactorización Modular, Virtualización y Carga Progresiva (💡)**:
  - Virtualización de tablas y listas largas (+550 jugadores a 60 fps fluidos), Web Workers para analítica pesada en cliente (matrices 16×16 y rankings de consistencia) y carga progresiva por sub-chunks.
- **Fase 11: Mi NBA Personalizada, Cuadro Play-In/Playoffs y Exportación Editorial Avanzada (💡)**:
  - Portada personalizada de favoritos (`Watchlist Hub`), cuadro interactivo de Play-In y Playoffs al mejor de 7 y generador de tarjetas/hilos exportables en formato vertical móvil y 16:9.

---

## D) Ya finalizado ✅

### 1. Fase 1: Snapshot Avanzado Diario 100% Offline-Safe — ✅ COMPLETADA
- Almacenamiento local comprimido (`.json.gz`) con las 10 capas estadísticas oficiales de NBA.com (`shotZones`, `clutch`, `defenseHustle`, `tracking`, `playtypes`, `scoring`, `fourFactors`, `violations`, `lineups`, `onOffByTeam`) y benchmarks de liga, garantizando disponibilidad total sin depender de peticiones en vivo.

### 2. Fase 2: Bloque de Filtros Personalizado (Equipos y Jugadores) — ✅ COMPLETADA
- Filtro universal homogéneo sobre +80 métricas para acotar muestras por conferencia, minutos, partidos jugados, equipo, posición y umbrales estadísticos personalizados.

### 3. Fase 3: Integración de Métricas en Alineaciones & Vistas de Entidad — ✅ COMPLETADA
- Módulo completo de Alineaciones (`5-Man`, `3-Man`, `2-Man`) y fichas detalladas de jugadores y franquicias con impacto *On/Off Court* y *Net Rating*.

### 4. Fase 4: Explorador Analítico Avanzado — ✅ COMPLETADA
- Categorías completas en ejes X/Y, 18 *presets* tácticos, matriz de correlación multicapa 16×16, Dispersión 2D con logos/avatares HD y Campanas de Gauss con sonda interactiva de percentiles y desviaciones típicas ($\sigma$).

### 5. Fase 5: Módulo Histórico de *Buzzer Beaters* & *Game Winners* — ✅ COMPLETADA
- Archivo oficial `0.0s` / `≤10s` y empates sobre la bocina (`OT`) persistido a diario en snapshot, cancha reglamentaria NBA en SVG traducida al español, rankings de jugadores/franquicias y menciones contextuales verificadas en las crónicas de jornada y partido.

### 6. Fase 6: Histórico Integral NBA, *Career Highs* y Trayectorias — ✅ COMPLETADA
- **Micro-Snapshot Histórico Comprimido (`data/nba-career-history.json.gz`, ~554 KB)**: Carrera completa (`2003-04`–`2026-27`) de los **592 jugadores NBA en activo** (Temporada Regular y Playoffs, totales, promedios, temporada *Peak* y *Career Highs* exactos con fecha, rival y resultado) junto al historial completo año a año (`1946`–`2027`) de las **30 franquicias** con anillos y balances de Playoffs, fusionado en vivo con la temporada `2026-27` en curso.
- **Ficha Inspectora (`Trayectoria & Highs` / `Historia Franquicia`)**: Conmutador `Temporada Regular | Playoffs`, rejilla de *Career Highs* (con distintivo de récord batido en `26-27`), curva evolutiva SVG interactiva exportable a PNG y tabla ordenable año a año con totales/medias y Veredicto Editorial.
- **Duelo 1v1 Histórico (`Carrera` y `Peak — Mejor Año`)**: Nuevos modos de muestra en el comparador cara a cara con sub-selector `Temporada Regular | Playoffs`, barra contextual de trayectoria y filas de Puntos Acumulados y *Career High PTS*.
- **Comparador de Temporadas Históricas**: Nuevo modo `Temporadas Históricas` en el *Comparador de Tramos* para enfrentar cualquier curso de un jugador o franquicia frente a otro año concreto, su *Peak* o su Media de Carrera (Regular o Playoffs) con exportación PNG.
- **Buscador Global de Líderes y Récords Acumulados**: Integrado en *Hitos & Récords* con buscador en vivo, conmutador `Temporada Regular | Playoffs`, 3 modos (`Totales Acumulados`, `Promedios de Carrera`, `Career Highs 1P`), 13 métricas, banda de **Hitos Inminentes de Carrera** y exportación Top 20 PNG.
- **Notificaciones (#31 Nuevo Career High) y Crónicas Automáticas**: Nuevo disparador configurable en *Zona Privada Admin* (con umbrales por categoría y partidos mínimos) y menciones verificadas de récords personales batidos en las crónicas de partido y de jornada.

### 7. Fase 8: Notificaciones Inteligentes de Hitos Alcanzados — ✅ COMPLETADA
- **Centro de Notificaciones en cabecera**: campana con contador de no leídas, filtros *Toda la liga / Favoritos*, categorías (*Jornada / Clutch-BB / Barreras / Rachas*), persistencia de leídas y salto directo al partido o ficha del protagonista.
- **Panel completo en Zona Privada Admin → Notificaciones de Hitos**:
  - Interruptor maestro para activar/desactivar el sistema entero, ventana de jornadas, máximo de alertas, perfiles rápidos y ayuda contextual `(i)` en cada menú, disparador y parámetro numérico.
  - **31 disparadores independientes y configurables en todos sus baremos**:
    - *Actuaciones (12)*: Explosión anotadora, Tope de temporada, **Nuevo Career High (Récord de Carrera)**, Lluvia de triples, Festival de asistencias, Dominio en rebote total, Rey del rebote ofensivo, Triples-dobles, Exhibiciones combinadas `20-20 / 20-15`, Dobles-dobles filtrados, Francotirador letal (`PTS + %TC`) y Dirección impecable (`AST + PTS con 0 PER`).
    - *Defensa e Impacto (4)*: Muros defensivos (tapones, robos y combo simultáneo configurables), Valoración MVP (*Game Score*), Impacto `+/-` y Paliza/festival colectivo de equipo.
    - *Clutch & Buzzer Beaters (4)*: Buzzer Beaters ganadores (`0.0s`), Empates sobre la bocina (`OT`), Game Winners (ventana de segundos configurable) y Canasta heroica lejana (distancia mínima configurable).
    - *Barreras Acumuladas (8)*: Puntos (`PTS`), Triples (`3PM`), Rebotes (`REB`), Rebotes Ofensivos (`OREB`), Asistencias (`AST`), Robos (`STL`), Tapones (`BLK`) y Victorias acumuladas de equipo (`10, 20, 30...`).
    - *Inminentes y Rachas (3)*: Hitos inminentes "a las puertas", Rachas activas de jugadores y Racha de victorias consecutivas de equipo (separada de victorias acumuladas).

### 8. Fase 9: Mejora Visual Completa (Paso 9A + Paso 9B) — ✅ COMPLETADA
- Unificación de barras, radios y alturas (`h-9`, `rounded-lg`/`rounded-md`), mini *sparklines* en *Equipos*, *Jugadores*, *Duelo*, *Comparador*, *Explorador Analítico* y *Resumen del Día*, cancha SVG reglamentaria en Mapa de Tiro, filas compactas de 3 líneas en *Protagonistas*, condensación de *03A Explosiones* / *03B Batacazos* y exportación de imágenes con logos embebidos.

### 9. Fase 13: Rediseño Integral Editorial Deportivo Ilustrado (Versión 2.0 + Selector Dual) — ✅ COMPLETADA
- **Sistema Dual sin pérdidas**: Conmutador rápido en cabecera (`v2 Pro` ↔ `Clásico`) y selector visual detallado en **Zona Privada Admin → `00. Configuración de la Web`**, manteniendo intacto al 100 % el diseño Clásico v1.
- **Atmósfera Editorial Deportiva homogénea en las 14 zonas**: Lienzo azul medianoche (`#070B14`) con iluminación sutil de pabellón, tarjetas satinadas (`#0F182B`) con relieve superior limpio y hover luminoso, tipografía deportiva **`Outfit`** en titulares y marcadores, inputs/tablas unificadas y botones activos con gradiente vivo.
- **Identidad cromática de las 30 franquicias NBA**: Paleta oficial integrada en avatares, escudos, tarjetas de partido (barra superior bicolor visitante/local), cromos del **Quinteto Ideal**, podio de **Premios de Temporada**, tarjetas de **Duelo 1v1** y cabecera de la **Ficha Inspectora**.

### 10. Fase 14: Separación Modular de Snapshots por Temporada y Micro-Snapshots — ✅ COMPLETADA
- **Micro-Snapshot Independiente para *Buzzer Beaters & Game Winners* (`data/nba-heroic-shots.json.gz`)**: Extracción de `heroicShots` (~8 KB comprimido / ~45 KB crudo) fuera del snapshot avanzado de 42,7 MB, logrando lecturas en **< 100 ms** en frío en Vercel tanto en la sección de *Buzzer Beaters* como en el centro de *Notificaciones de Hitos*.
- **Snapshot Avanzado Core Ligero (`data/nba-advanced-core.json.gz`)**: Separación de las 8 capas estadísticas avanzadas + *On/Off Splits* + *Benchmarks* (~3,4 MB crudo) respecto a la matriz masiva de alineaciones (`lineups`, 39,2 MB), acelerando todas las consultas analíticas y fichas inspectoras que no requieren combinaciones de quintetos.
- **Particionamiento por Temporada y Carga bajo Demanda (`Lazy Season Loading`)**: División de `nba-snapshot.json.gz` (49,1 MB crudo) en `data/nba-bios.json.gz` (~0,13 MB) y archivos modulares por curso (`nba-snapshot-2027.json.gz` de ~3,4 MB, `2026`, `2025` y `2024`), cargando en RAM únicamente la temporada activa `2026-27` en el arranque (~14× menos memoria y CPU) y manteniendo fallback retrocompatible y sincronización diaria ligera.

### 11. Fase 15: Incrustar el "Veredicto / Insight" en la Exportación de Imagen — ✅ COMPLETADA
- **Pie Editorial Integrado Opcional en Gráficos y Tablas Exportadas (`ExportImageButton` + `exportImageCard.ts`)**: Conmutador persistente **`Veredicto`** junto a cada botón de exportación PNG/Portapapeles que permite incluir u ocultar en 1 clic la tarjeta editorial inferior con acento cromático lateral y la firma discreta **`radar-nba.vercel.app`** (tanto en cabecera y pie del PNG como incrustada en la capa vectorial SVG).
- **Veredicto Analítico de 1 Línea en Campana de Gauss, Dispersión 2D, Radar 1v1, Duelos y Tablas**: Síntesis automática e inyección del titular de 1 línea con correlación de Pearson ($r$ y lectura táctica) en **Dispersión 2D**, líder #1 con Z-Score/percentil y conteo de zona élite ($\ge +1\sigma$) en **Campana de Gauss**, exportación directa del gráfico **Radar 1v1 (6 ejes)** y **Duelo 1v1** con el veredicto de scouting, **Comparador de Tramos** y síntesis determinista para todas las tablas destacadas.

### 12. Fase 12: Lesiones y Bajas con Impacto en Rotaciones — ✅ COMPLETADA
- **Motor Oficial de Parte Médico y Reajuste de Rotación (`GET /api/nba/injuries` + caché *offline-safe*)**: Descarga en vivo del parte diario NBA con traducción al español del diagnóstico médico, fecha estimada de retorno y estados oficiales (*Out*, *IR*, *Suspendido*, *Doubtful*, *Questionable*, *Day-to-Day*, *Probable*), con respaldo en disco ante caídas de red.
- **Cálculo Automático de Carga Vacante y Beneficiarios (`+MIN`, `+USG%`, `+PTS`)**: Ponderación probabilística por estado médico de los minutos, puntos, rebotes, asistencias y *Usage %* vacantes en cada franquicia, combinando **splits empíricos reales sin el lesionado en 2026-27** con redistribución por afinidad posicional y margen de rotación.
- **Nueva Sección *Parte de Lesiones* (3 vistas)**: *Impacto por Equipo*, *Oportunidades en Rotación* y *Parte Médico Completo*, con filtros por estado, conferencia, equipo, búsqueda instantánea, conmutador *Toda la plantilla / Solo piezas de rotación (≥14 MIN)* y exportación PNG con veredicto.
- **Integración Homogénea en toda la plataforma**: Resumen del Día, Analizador de Jornadas, Equipos NBA, Jugadores NBA, Ficha Inspectora, Alineaciones y Zona Privada (Fantasy · Waivers).

### 13. Fase 16: Contratos, Límites Salariales / *Aprons* Didácticos y *Trade Machine* — ✅ COMPLETADA
- **Nóminas Oficiales 2026–27 y Cap Sheets Plurianuales (`Fanspo NBA Payroll` + respaldo `ESPN` + snapshot `.json.gz`)**: Cobertura de los 30 equipos (+500 contratos oficiales verificados con renovaciones 2026, opciones `PO`/`TO`/`GTD`/`Two-Way`, *Trade Kickers*, restricciones de traspaso y horizonte plurianual `2026-27`–`2029-30`), termómetro salarial con marcadores proporcionales de *Suelo / Cap / Tax / 1er Apron / 2º Apron*, estimación de *Luxury Tax* y vista conmutable *26–27 y Eficiencia* ↔ *Plurianual (26–30)*.
- **Guía Visual Didáctica del CBA 2023**: Explicación clara de los 6 escalones salariales, **Mapa Interactivo de las 30 Franquicias por Escalón CBA** (con salto directo al Cap Sheet de cada equipo), **Matriz Comparativa de Reglas** (*emparejamiento, agregación, MLE/BAE, Sign-and-Trade y penalizaciones de Draft*) y **Diccionario de Cláusulas Salariales** (`PO`, `TO`, `GTD`, `Two-Way`, `Trade Kicker`, `Hard Cap`, `TPE`, `Bird Rights`, `Agregación`).
- ***Trade Machine* Interactiva (2 a 4 Equipos) con Motor Real CBA (`tradeMachineEngine.ts`)**: Validación en tiempo real de absorción por *Cap Space*, tramos estándar CBA (`200%+$250K`, `+$8.5M`, `125%+$250K`), exención de mínimos, muro del **1er Apron (100% estricto)**, **2º Apron (100% + prohibición de agregación)**, *Trade Kickers*, avisos de plantilla (14–15 plazas) y *Two-Way*; selector explícito de destino por jugador en traspasos a 3 y 4 bandas, transición de escalón CBA (`Pre → Post`), ahorro/recargo estimado de *Luxury Tax*, balance deportivo completo (`PTS`, `REB`, `AST`, `Impacto`), escenarios didácticos en 1 clic y **exportación de tarjeta PNG dedicada del traspaso con veredicto editorial**.
- **Mejoras transversales de plataforma completadas en paralelo**: Motor dinámico de **Rachas Automáticas** con tabla unificada y autocalibrado por Media NBA 26–27 en Admin, **Modo Sencillo / Avanzado** global configurable en Admin y nueva pestaña **Fuentes de Datos** documentada en Zona Privada Admin.

### 14. Fase 17: Módulo de *Draft* NBA (17A + 17B + 17C) — ✅ COMPLETADA
- **17A — Archivo Histórico Oficial (2001–2026)**: Snapshot *offline-safe* (`data/nba-draft-history.json.gz`) con 26 ediciones oficiales (+1.540 elecciones), cruce en vivo con carrera histórica y temporada 2026–27, columna compacta `#Pick / Ronda`, foco al `#1`, buscador global transversal (por jugador, universidad, franquicia y rango), salto a la Ficha Inspectora y exportación PNG.
- **17B — Evaluador de Camadas (*Re-Draft*, Robos y Ojo Clínico)**: Motor determinista con 3 criterios (*Integral*, *Techo/Estrellas*, *Volumen*), guía interactiva de notas `S`–`C`, *Re-Draft* con aclaración explícita `Draft / Hoy` + nota de traspaso en noche de Draft, podio histórico de **Robos y Decepciones**, **Comparador Cara a Cara de Camadas**, **Ranking de Camadas** y **Ojo Clínico de las 30 Franquicias**.
- **17C — Inventario de Rondas Futuras (2027–2033) + Integración en *Trade Machine***: Ingesta real en vivo desde *Fanspo NBA Future Draft Picks* con snapshot *offline-safe* (`data/nba-future-picks.json.gz`), matriz interactiva de las 30 franquicias (2027–2033) ordenada por Capital de Draft, cartera año a año con cláusulas desplegables, protecciones, *swaps*, cálculo automático de bloqueos **Regla Ted Stepien**, guía didáctica CBA, exportación PNG y salto en 1 clic a la **Trade Machine** (que permite incluir 1ª y 2ª rondas en traspasos de 2 a 4 equipos validando en vivo la Regla Stepien y el congelado del 2º Apron).
