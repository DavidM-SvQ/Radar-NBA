# Hoja de Ruta & Evolución de RadarNBA (Fusionada con Auditoría Integral)

Plan maestro permanente de arquitectura, analítica avanzada, rendimiento, diseño editorial y nuevas funcionalidades para la plataforma de seguimiento, juego y aprendizaje analítico de la NBA.

---

### Estado General del Proyecto

- **Fase 1: Snapshot Avanzado Diario 100% Offline-Safe** — ✅ **COMPLETADA**
- **Fase 2: Bloque de Filtros Personalizado (Equipos y Jugadores)** — ✅ **COMPLETADA**
- **Fase 3: Integración de Métricas en Alineaciones & Vistas de Entidad** — ✅ **COMPLETADA**
- **Fase 4: Explorador Analítico Avanzado (Categorías en Ejes, 18 Presets, Matriz & Campanas de Gauss)** — ✅ **COMPLETADA**
- **Fase 5: Módulo Histórico de Buzzer Beaters & Game Winners** — ✅ **COMPLETADA** (archivo oficial `0.0s` / `≤10s` persistido a diario en snapshot, diagrama SVG en pista, rankings jugadores/franquicias y referencias en crónicas)
- **Fase 6: Histórico Integral NBA (Career Highs, Medias Históricas y Todas las Temporadas)** — ⏳ **PENDIENTE**
- **Fase 7: Modo Claro / Tema Dual (Alternar Visualización Oscura ↔ Clara)** — ⏳ **PENDIENTE**
- **Fase 8: Notificaciones Inteligentes de Hitos Alcanzados (30 Disparadores y Baremos Configurables en Admin)** — ✅ **COMPLETADA**
- **Fase 9: Mejora Visual Completa (Diseño de Alto Impacto y Pulido Editorial Global)** — ✅ **COMPLETADA** (Paso 9A + Paso 9B)
- **Fase 10 (Propuesta): Refactorización Modular, Virtualización y Carga Progresiva** — 💡 **PROPUESTA**
- **Fase 11 (Propuesta): Mi NBA Personalizada, Play-In/Playoffs Bracket y Exportación Editorial** — 💡 **PROPUESTA**
- **Fase 12 (Propuesta): Radar de Bajas / Partes de Lesiones y Simulador Multi-Era** — 💡 **PROPUESTA**

---

### Detalle de Fases Completadas (Fases 1–5, 8 y 9)

- **Fases 1–4**: Snapshot avanzado diario en disco (`10 capas NBA.com`), filtro universal sobre +80 métricas, módulo completo de Alineaciones (`5-Man`, `3-Man`, `2-Man`) y Explorador Analítico con 18 presets, matrices multicapa 16×16 y Campanas de Gauss con sonda interactiva.
- **Fase 5**: Archivo histórico offline-safe de *Buzzer Beaters*, *Game Winners* y empates sobre la bocina con cancha reglamentaria SVG traducida al español, rankings por modalidad y menciones contextuales en las crónicas de cada jornada y partido.
- **Fase 8 (Completada ✅)**:
  - **Centro de Notificaciones en cabecera**: campana con contador de no leídas, filtros *Toda la liga / Favoritos*, categorías (*Jornada / Clutch-BB / Barreras / Rachas*), persistencia de leídas y salto directo al partido o ficha del protagonista.
  - **Panel completo en Zona Privada Admin → Notificaciones de Hitos**:
    - Interruptor maestro para activar/desactivar el sistema entero, ventana de jornadas, máximo de alertas, perfiles rápidos y ayuda contextual `(i)` en cada menú, disparador y parámetro numérico.
    - **30 disparadores independientes y configurables en todos sus baremos**:
      - *Actuaciones (11)*: Explosión anotadora, Tope de temporada (PTS y PJ mínimos), Lluvia de triples, Festival de asistencias, Dominio en rebote total, Rey del rebote ofensivo, Triples-dobles (baremo configurable), Exhibiciones combinadas `20-20 / 20-15` (ambos baremos configurables), Dobles-dobles filtrados, Francotirador letal (`PTS + %TC`) y Dirección impecable (`AST + PTS con 0 PER`).
      - *Defensa e Impacto (4)*: Muros defensivos (tapones, robos y combo simultáneo configurables), Valoración MVP (*Game Score*), Impacto `+/-` y Paliza/festival colectivo de equipo.
      - *Clutch & Buzzer Beaters (4)*: Buzzer Beaters ganadores (`0.0s`), Empates sobre la bocina (`OT`), Game Winners (ventana de segundos configurable) y Canasta heroica lejana (distancia mínima configurable).
      - *Barreras Acumuladas (8)*: Puntos (`PTS`), Triples (`3PM`), Rebotes (`REB`), Rebotes Ofensivos (`OREB`), Asistencias (`AST`), Robos (`STL`), Tapones (`BLK`) y Victorias acumuladas de equipo (`10, 20, 30...`).
      - *Inminentes y Rachas (3)*: Hitos inminentes "a las puertas", Rachas activas de jugadores y Racha de victorias consecutivas de equipo (separada de victorias acumuladas).
- **Fase 9 (Completada ✅)**: Unificación de barras, radios y alturas (`h-9`, `rounded-lg`/`rounded-md`), mini sparklines en *Equipos*, *Jugadores*, *Duelo*, *Comparador*, *Explorador Analítico* y *Resumen del Día*, cancha SVG reglamentaria en Mapa de Tiro y jerarquía KPI depurada.

---

### Fases Pendientes de la Hoja de Ruta Original

- **Fase 6: Histórico Integral NBA — Estadísticas de Todas las Temporadas, Career Highs y Trayectorias (Pendiente ⏳)**
  - Ingesta offline-safe de temporadas históricas completas previas a 2023-24 para cada jugador y franquicia.
  - Cálculo de *Career Highs* (máximos históricos de carrera), medias acumuladas de trayectoria y comparativa histórica en fichas, *Duelo*, *Comparador* y crónicas de jornada.
- **Fase 7: Modo Claro / Tema Dual (Pendiente ⏳)**
  - Conmutador en cabecera **Modo Oscuro ↔ Modo Claro** mediante variables CSS semánticas (`--bg-surface`, `--text-primary`, etc.) con paletas adaptadas en gráficos SVG y exportaciones PNG.

---

## Análisis Integral de la Aplicación & Propuestas de Mejora

### 1. Mejoras de Rendimiento
1. **Particionamiento y carga por demanda del árbol de componentes y datos**: Extraer hooks puros y dividir vistas extensas en sub-chunks diferidos reduce el tamaño inicial JS y acelera la hidratación móvil.
2. **Virtualización de tablas y listas largas**: Al cargar toda la liga (+470–550 jugadores), virtualizar filas visibles mantiene 60 fps fluidos al ordenar o filtrar, clave antes de la Fase 6.
3. **Web Workers para analítica pesada en cliente**: Mover matrices de correlación 16×16, campanas de Gauss y rankings de consistencia fuera del hilo principal evita micro-cortes en móviles.
4. **Segmentación del snapshot y compresión/caché por capas**: Separar el payload base de jornada del histórico profundo con `ETag` + `stale-while-revalidate`.

### 2. Mejoras de Diseño y Visuales
1. **Migración a Tokens Semánticos CSS (Prerrequisito Fase 7 — Modo Claro)**: Sustituir colores fijos por variables semánticas garantiza contraste AA en tema oscuro y claro.
2. **Narrativa visual unificada en Estados Vacíos, Skeletons y Badges**: Skeletons contextuales y tarjetas homogéneas en alertas y favoritos.
3. **Miniaturas de forma reciente en hover/tap**: Mostrar últimos 5 partidos (`PTS / REB / AST` + W/L) antes de abrir la ficha desde Notificaciones o Favoritos.
4. **Selector de densidad en tablas amplias**: Alternar entre vista *Compacta* y *Editorial* manteniendo `tabular-nums`.

### 3. Nuevos Desarrollos y Funcionalidades Propuestas (Fases 10–12)
1. **Portada "Mi NBA" / Panel Personalizado de Favoritos (`Watchlist Hub`)**: Resumen diario exclusivo de tus jugadores y equipos con ★.
2. **Cuadro Interactivo de Play-In & Playoffs + Simulador de Series**: Bracket visual en vivo con enfrentamientos directos y quintetos clave al mejor de 7.
3. **Radar de Bajas, Lesiones y Rotaciones de Última Hora**: Cruce automático con *Fantasy*, *Alineaciones* y *Jornadas* indicando qué jugador absorbe minutos y uso.
4. **Comparador Multi-Temporada & Era-Adjusted (Extensión Fase 6)**: Comparar años distintos de un jugador o leyendas ajustando por ritmo (*Pace*).
5. **Generador de Tarjetas / Hilos Editoriales Exportables**: Exportación en alta resolución (vertical móvil y 16:9) de actuaciones heroicas, duelos 1v1 e hitos recién batidos.
