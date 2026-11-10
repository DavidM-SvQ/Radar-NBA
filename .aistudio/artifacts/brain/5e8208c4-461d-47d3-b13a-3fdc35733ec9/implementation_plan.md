# Evolución del Explorador Analítico

Este plan detalla la reestructuración completa de la sección "Explorador Analítico" para dividir el análisis entre **Equipos** y **Jugadores**, elevando la calidad visual e interactiva mediante la integración de **Recharts**.

> [!IMPORTANT]
> Se instalará la librería `recharts` para proporcionar gráficos de dispersión de alta fidelidad, tooltips interactivos y zoom, manteniendo la estética azul oscuro homogénea de RadarNBA.

## Decisiones Críticas Confirmadas

- **Segmentación Principal**: División binaria entre "Equipos" y "Jugadores".
- **Motor de Gráficos**: Migración de SVG manual a **Recharts** para permitir personalización de puntos (p. ej., escudos de equipos) y mayor interactividad.
- **Análisis de Equipos**: Foco en la eficiencia (OffRtg vs DefRtg), ritmo, volumen de tiro y calidad de creación.
- **Matriz de Correlación**: Nueva vista para visualizar qué estadísticas tienen mayor impacto en el porcentaje de victorias (`winPct`).

## 1. Concepto Central y Valor

Transformar el explorador actual (centrado en jugadores) en un **laboratorio de scouting avanzado**. La herramienta permitirá a los usuarios no solo ver dónde se ubica cada jugador, sino entender la identidad de las franquicias mediante cuadrantes de rendimiento.

- **Equipos**: Análisis macro de la liga, permitiendo ver qué equipos son "pace-and-space" o cuáles basan su dominio en la pintura.
- **Jugadores**: Análisis micro para encontrar perfiles infravalorados (ej: alto uso con alta eficiencia).

## 2. Experiencia de Usuario y Diseño Visual

### Flujo de Navegación
1. **Selector de Entidad**: Interruptor (Teams | Players) en la cabecera.
2. **Selector de Ejes**: Dropdowns para elegir X, Y y Tamaño del punto (Z).
3. **Filtros Dinámicos**: Por Conferencia, División, Edad, o Umbrales de volumen (mínimo de partidos/minutos).

### Diseño de Gráficos (Recharts)
- **Puntos Personalizados**: 
    - En **Equipos**, los puntos del gráfico de dispersión serán los **logos oficiales** de las franquicias.
    - En **Jugadores**, círculos de colores según su equipo o posición.
- **Líneas de Referencia**: Medias de la liga automáticas que dividen el gráfico en 4 cuadrantes con etiquetas dinámicas (ej: "Élite Ofensiva").
- **Tooltips Pro**: Al pasar el ratón, se muestra un dossier rápido de la entidad (foto/logo, estadísticas clave y ranking en los ejes seleccionados).

## 3. Temas Analíticos Implementados

### Para Equipos (Nuevas Matrices)
- **Eficiencia Neta**: `OffRtg` vs `DefRtg` (Identifica aspirantes al título).
- **Identidad de Ritmo**: `Pace` vs `NetRtg` (¿Correr ayuda a ganar?).
- **Dependencia del Triple**: `% Frecuencia de 3P` vs `3P%` (Volumen vs Acierto).
- **Calidad de Creación**: `AST%` vs `TOV%` (Equilibrio entre pase y seguridad).
- **Matriz de Correlación**: Un mapa de calor que muestra la correlación de Pearson entre diversas métricas y el éxito (`winPct`).

## 4. Arquitectura Técnica

### Componentes y Estructura
```drawio
┌─────────────────────────────────────────────────────────┐
│ ScatterAnalyticsView (State: Mode, Metrics, Filters)    │
├────────────────────────────┬────────────────────────────┤
│   TeamAnalyticsView        │   PlayerAnalyticsView      │
│   (Recharts + TeamLogos)   │   (Recharts + Avatars)     │
├────────────────────────────┴────────────────────────────┤
│   CorrelationMatrixView (Heatmap Table)                │
└─────────────────────────────────────────────────────────┘
```

### Estrategia de Datos
- **Cálculos al Vuelo**: Las métricas de equipos se derivan de los perfiles `advanced` y de los `games` históricos.
- **Filtrado Reactivo**: El renderizado de Recharts se actualizará instantáneamente al mover los sliders de umbrales o cambiar los filtros de división.

### Dependencias a añadir
- `recharts`: Visualización interactiva.
- `framer-motion`: Animaciones fluidas al cambiar entre equipos y jugadores.
