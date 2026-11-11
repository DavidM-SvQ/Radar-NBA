# Renovación y Rediseño Visual de las Fichas de Equipo y Jugador (EntityInspectorDrawer)

Rediseño completo de la experiencia de inspección de entidades en RadarNBA. Transformará el modal de inspección actual en una suite analítica estructurada por pestañas superiores (*Resumen & KPIs*, *Gráficos & Evolución*, *Historial de Partidos* y *Plantilla / Perfil*), con tarjetas destacadas de KPIs que incluyen valores, comparativa contra el promedio de la liga y cálculo de percentiles en tiempo real.

## Decisiones Confirmadas por el Usuario

- **Estructura de Ficha por Pestañas**: Navegación superior segmentada en 4 pestañas limpias (`Resumen & KPIs`, `Gráficos & Evolución`, `Historial de Partidos`, `Plantilla / Roster`) para evitar scroll excesivo y saturación de información.
- **Formato Visual de KPIs**: Tarjetas destacadas de alto contraste con tipografía tabular (`tabular-nums`), comparativa diferencial respecto a la media NBA y barra de percentil de la liga con codificación de color de rendimiento.
- **Analítica Destacada de Equipos**: Integración prioritaria del bloque de **Cuatro Factores de Dean Oliver** (eFG%, TOV%, OREB%, FT/FGA) junto con eficiencia por posesión (OffRtg vs DefRtg) y perfil táctico.

---

## 1. Visión General y Concepto

La ficha de inspección de equipos y jugadores (`EntityInspectorDrawer`) pasará de ser una lista larga con scroll continuo a un centro analítico modular y dinámico. La vista principal destacará inmediatamente los indicadores clave (KPIs) con contexto de liga (percentiles y diferenciales respecto al promedio NBA), mientras que el resto de herramientas (evolución temporal de partidos, desglose de log completo y plantilla/perfil) quedarán organizados en pestañas independientes accesibles a un solo clic.

---

## 2. Experiencia de Usuario y Diseño Visual

### Navegación por Pestañas Superiores
- **Pestaña 1: Resumen & KPIs**:
  - Encabezado con identidad visual de la entidad (Avatar/Escudo, posición/conferencia, balance y racha).
  - Bloque superior de **KPIs Principales Destacados**:
    - **Jugadores**: PTS, REB, AST, STL, BLK, FG%, 3P%, USG%, NetRtg, eFG%, TS%, PER/EFF.
    - **Equipos**: OffRtg, DefRtg, NetRtg, Pace, PTS Favor/Contra, Diferencial, eFG%, TOV%, OREB%, FT Rate.
  - Cada tarjeta de KPI incluirá:
    1. Valor actual en la muestra seleccionada.
    2. Comparativa vs Media NBA (diferencial numérico y flecha de tendencia).
    3. Barra y sello de **Percentil en la Liga** (ej. *Top 5%*, *Percentil 92* con tinte semitransparente verde/rojo según la métrica).
  - Bloque especializado de **Cuatro Factores de Dean Oliver** (para Equipos) con desglose de Eficiencia de Tiro (eFG%), Porcentaje de Pérdidas (TOV%), Rebote Ofensivo (OREB%) y Frecuencia de Tiro Libre (FT/FGA).
- **Pestaña 2: Gráficos & Evolución**:
  - Gráfico de línea temporal con selector de métricas.
  - Selector de modo de trazado (*Secuencia continua* vs *2 líneas en paralelo* para comparar la temporada 2026/27 contra la 2025/26).
  - Desglose de racha y consistencia en el rango seleccionado.
- **Pestaña 3: Historial de Partidos**:
  - Tabla completa e interactiva de partidos (`Game Log`) con selector dinámico de columnas, ordenación por cabecera y sombreado suave de rendimiento por celda.
- **Pestaña 4: Plantilla / Perfil**:
  - **Para Equipos**: Roster de la plantilla con promedios individuales, rol, edad, minutos y botón de inspección directa de cualquier jugador.
  - **Para Jugadores**: Ficha de radiografía física/biográfica y desglose de seguimiento de carrera por temporada.

---

## 3. Arquitectura Técnica y Modelo de Datos

```
┌────────────────────────────────────────────────────────────────────────┐
│                      EntityInspectorDrawer.tsx                         │
├────────────────────────────────────────────────────────────────────────┤
│ Header: Avatar/Logo · Nombre · Modal Display Mode (Wide/Full/Sidebar) │
│ Tabs: [ 📊 Resumen & KPIs ] [ 📈 Gráficos ] [ 📋 Partidos ] [ 👥 Roster]│
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ KpiOverviewTab  │       │  AnalyticsTab   │       │   GameLogTab    │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ • Featured KPIs │       │ • Timeline SVG  │       │ • Sortable Log  │
│ • League Perc.  │       │ • Parallel 25/26│       │ • Column Select │
│ • Dean Oliver   │       │ • Trend & Range │       │ • Tone Cells    │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Cálculo de Percentiles y Comparativa NBA
- Se integrará una función helper `computeLeaguePercentile(metricValue, metricKey, allEntities)` que ordenará los valores de todos los jugadores/equipos para determinar el percentil exacto ($0\text{--}100\%$) y la etiqueta correspondiente (*Top 1%*, *Top 5%*, *Top 10%*, *Superiores a la Media*, *Percentil 45*, etc.).
- Las métricas donde un número menor es mejor (ej. `DefRtg`, `TOV`, `Losses`) invertirán automáticamente el cálculo del percentil y la escala de color (verde para valores bajos, rojo para altos).

---

## 4. Plan de Implementación

1. **Estructuración por Pestañas en `EntityInspectorDrawer.tsx`**:
   - Agregar el estado `activeTab` (`'overview' | 'charts' | 'gamelog' | 'roster'`).
   - Implementar la barra de pestañas adaptativa debajo del encabezado principal.
2. **Diseño de Tarjetas de KPI con Percentil de Liga**:
   - Construir el componente `KpiPercentileCard` que muestre el valor numérico destacado, el diferencial vs la media de la NBA y el indicador visual de percentil.
3. **Módulo de Cuatro Factores de Dean Oliver**:
   - Crear el componente visual de los 4 factores para la vista de equipos con barras comparativas vs el estándar óptimo de la liga.
4. **Reorganización del Gráfico de Evolución y Tabla de Partidos**:
   - Mover la gráfica SVG interactiva a la pestaña *Gráficos & Evolución*.
   - Renderizar el *Game Log* completo en la pestaña *Historial de Partidos*.
5. **Verificación y Compilación**:
   - Ejecutar `compile_applet` y `lint_applet` para garantizar cero errores de TypeScript y linting.
