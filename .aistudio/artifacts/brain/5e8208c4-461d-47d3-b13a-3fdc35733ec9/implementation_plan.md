# Renovación del Gráfico de Historial de Rachas e Icono de Acceso Rápido

Transformación del acceso rápido en las tablas de rachas (sustituyendo la etiqueta `10 PJ` por un icono gráfico sincronizado) y rediseño integral del **Historial de Rachas** para analizar hasta dos temporadas completas con separación visual de campañas, selector de las 49 métricas categorizadas (máximo 3 a la vez), resaltado de puntos en racha activa y comparativa directa de desviaciones bajo el gráfico.

## Decisiones Confirmadas

> [!IMPORTANT]
> Estas decisiones recogen tus respuestas de la fase previa y definen el alcance exacto de esta entrega:

- **Acceso rápido en tablas**: Sustitución del botón de texto `10 PJ` por un icono limpio de línea de tendencia en todas las vistas de Rachas y Consistencia, precargando al pulsarlo el jugador, la métrica y el umbral exacto de esa fila.
- **Resaltado visual de racha activa**: La polilínea mantiene el color propio de cada métrica y **únicamente los puntos que integran la racha activa** cambian de color y halo para distinguir de inmediato qué partidos consecutivos sostienen la racha vigente.
- **Criterio de racha y umbral**: Cada métrica seleccionada evalúa su racha usando el umbral heredado al abrir desde la tabla o un umbral editable en el propio panel del gráfico (con ajuste rápido a su media de temporada si se desea).
- **Extras visuales e interactivos incluidos**: Línea horizontal conmutable de umbral o media de referencia, marcadores automáticos de **máximo (techo)** y **mínimo (suelo)** del tramo visible, y barra inferior de **zoom deslizable** al visualizar tramos amplios o las dos temporadas completas.
- **Alcance acotado**: Nos centramos al 100 % en dejar redondo el gráfico de historial y la conexión con las tablas, dejando el gráfico de dispersión anotado para una futura fase.

---

## 1. Visión General y Concepto Principal

- **Qué hace**: Permite pasar en un clic desde cualquier fila de las tablas de rachas (o directamente desde la pestaña *Historial de rachas*) a una línea temporal interactiva que une todos los partidos jugados de la **temporada pasada (2025-26)** y la **temporada actual (2026-27)**, filtrando al vuelo cualquier ventana de **últimos X partidos** (10 por defecto) y comparando hasta **3 métricas simultáneas** de entre las 49 disponibles en la aplicación.
- **Contexto de uso**: Consulta rápida para validar visualmente si una racha activa viene respaldada por una tendencia sostenida, cómo se comporta el jugador al cruzar de una temporada a otra y cuánta desviación existe entre su racha actual, el tramo observado y su media de temporada.
- **Valor principal**: Elimina la confusión del botón `10 PJ`, unifica el catálogo completo de métricas entre el buscador a medida y el gráfico, y concentra bajo el lienzo las dos comparativas clave (*Media temporada actual vs racha* y *Media del tramo vs racha*).

---

## 2. Experiencia de Usuario y Diseño Visual

### Flujo de interacción paso a paso

1. **Desde las tablas de Rachas y Consistencia**:
   - En la columna final de cada fila (y de forma homogénea en las tarjetas móviles), un botón compacto con icono de gráfico reemplaza al antiguo texto `10 PJ`.
   - Al pulsarlo sin abrir la ficha modal completa, se despliega encima de la tabla el panel del **Historial de Rachas** ya posicionado en ese jugador, con la métrica y el umbral exactos de esa racha preseleccionados y la ventana inicial en **Últimos 10 PJ**.
2. **Control temporal y separación de temporadas**:
   - Barra de tramo con accesos rápidos (**Últ. 5 PJ**, **Últ. 10 PJ** activo por defecto, **Últ. 15 PJ**, **Últ. 25 PJ**, **Temp. actual**, **2 Temporadas**) acompañada de un control deslizable/numérico para fijar cualquier número exacto de **Últimos X PJ** hasta el total de partidos del jugador entre ambas campañas.
   - Cuando el rango visible incluye partidos de `2025-26` y `2026-27`, el lienzo traza una **línea vertical divisoria discontinua** entre el último duelo de la campaña anterior y el debut de la actual, con rótulos discretos en la cabecera del gráfico (`← 2025-26` | `2026-27 →`).
   - Al visualizar tramos largos (como las dos temporadas completas), se activa bajo el eje horizontal un **zoom deslizable** que permite encuadrar y arrastrar cualquier subventana temporal con fluidez sin saturar las etiquetas de fechas y rivales.
3. **Selector categorizado de las 49 métricas (máximo 3 activas)**:
   - Selector organizado en los **5 bloques homogéneos** de la aplicación:
     1. *Estadísticas básicas por partido* (12)
     2. *Volumen de tiro y conversión* (9)
     3. *Combinadas e hitos* (6)
     4. *Porcentajes y eficiencia de tiro* (9)
     5. *Ratios de creación, ritmo /36m y valoración* (13)
   - Contador visible `X/3 métricas activas`. Si ya hay 3 marcadas, el resto queda bloqueado visualmente hasta desmarcar una (y los perfiles rápidos se adaptan a combinaciones de hasta 3 indicadores).
4. **Lectura visual sobre el gráfico**:
   - **Puntos en racha activa**: la línea conserva el color identificativo de cada métrica, mientras que los nodos pertenecientes a la racha activa vigente (contando desde el partido más reciente hacia atrás según el umbral activo) se pintan con relleno diferenciado de alto contraste (verde esmeralda para rachas positivas, rojo coral para rachas negativas o de sequía) y doble anillo exterior. Los partidos fuera de racha mantienen nodo oscuro con borde del color de la serie.
   - **Techo y suelo del tramo**: señalización directa sobre el punto máximo (`Máx`) y mínimo (`Mín`) del tramo seleccionado.
   - **Línea horizontal de referencia**: conmutador rápido para superponer en escala real la línea horizontal del **Umbral de racha**, la **Media de temporada actual** o mantener limpio el lienzo.
   - **Umbral editable por métrica**: control compacto junto a cada métrica activa para ajustar operador (`≥`, `>`, `≤`, `<`) y valor del umbral en vivo, recalculando al instante qué puntos entran en racha y las desviaciones inferiores.
5. **Resumen estadístico inferior por cada indicador seleccionado**:
   - Justo debajo del gráfico se muestra una franja homogénea con una tarjeta/columna por cada métrica activa (de 1 a 3), presentando con tipografía monoespaciada tabular:
     - **Estado y media de la racha activa** (nº de partidos consecutivos cumpliendo el umbral y promedio durante la racha; si en ese umbral concreto lleva `0 PJ` activos, se indica expresamente y permite comparar frente al último partido o ajustar el umbral).
     - **Media temporada actual y desviación con la racha**: valor medio en `2026-27` y diferencia firmada (`Media racha − Media temporada actual`, p. ej. `Temp. actual: 24.2 · Desv. racha: +5.1`).
     - **Media tramo y desviación con la racha**: valor medio en los `X PJ` visibles en el gráfico y diferencia firmada (`Media racha − Media tramo`, p. ej. `Media tramo (10 PJ): 26.8 · Desv. racha: +2.5`).

### Identidad visual y homogeneidad

- **Paleta y superficies**: Respeto absoluto al sistema visual oscuro de toda la aplicación (`#0B1120` fondo de lienzo, `#131C2E` contenedores principales, `#1E293B` líneas divisorias de 1px, `#F97316` naranja para controles activos, `#10B981` esmeralda para desviaciones/rachas favorables y `#F43F5E` coral para desviaciones desfavorables).
- **Tipografía y rigor numérico**: Cifras, promedios, umbrales y deltas alineados con `font-mono tabular-nums` para evitar saltos visuales al mover el deslizador de partidos o cambiar de jugador. Metadata limpia separada con `·` sin encapsular datos estáticos en píldoras decorativas.

---

## 3. Decisiones de Producto y Equilibrios Técnicos

- **Unificación del catálogo de 49 métricas**
  - *Enfoque elegido*: Extraer las definiciones de las 49 métricas y sus 5 grupos a un catálogo compartido entre el buscador de rachas y el gráfico de historial.
  - *Por qué*: Garantiza homogeneidad total en nombres, unidades, decimales, operadores por defecto y reglas de clasificación mínima (como mínimos de tiros o minutos en porcentajes y ratios), permitiendo que pulsar el icono gráfico en cualquier fila cargue siempre la misma métrica exacta.
- **Escalado inteligente para hasta 3 métricas simultáneas**
  - *Enfoque elegido*: Mantener el selector de escala (`Auto`, `Real`, `Relativa %`) optimizado para un máximo de 3 series, activando la normalización `0–100 %` automáticamente solo cuando se mezclan magnitudes incompatibles (p. ej. `PTS` junto a `TAP` o `TS%`), mientras que en escala real de una métrica se dibuja con exactitud la línea horizontal del umbral o de la media.
  - *Por qué*: Al limitar la selección a 3 métricas como máximo, el gráfico gana muchísima limpieza visual y las etiquetas de techo/suelo y puntos en racha no se solapan.
- **Densidad adaptativa del eje X + Zoom deslizable**
  - *Enfoque elegido*: Con 10–14 partidos se muestran todas las etiquetas de rival y fecha en el eje X; al ampliar a decenas de partidos o a las 2 temporadas completas (~100–160 PJ), las etiquetas del eje X se espacian automáticamente mientras cada partido conserva su columna interactiva al pasar el cursor, complementado con el control deslizable inferior de zoom.
  - *Por qué*: Permite inspeccionar dos años enteros partido a partido sin textos montados ni pérdida de precisión táctil o con ratón.

---

## 4. Arquitectura Técnica y Estrategia de Datos

### Diagrama de componentes y flujo de datos

```
┌───────────────────────────────────────────────────────────────────────────┐
│                Cortes en Memoria (2025-26 + 2026-27)                      │
│     Unión cronológica sin duplicados por jugador + etiqueta temporada     │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    Vista de Rachas y Consistencia                         │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Tablas y Tarjetas (Rachas Automáticas · Buscador 49 · Consistencia) │  │
│  │  • Botón con icono de gráfico -> envía { jugador, métrica, umbral } │  │
│  └─────────────────────────────────┬───────────────────────────────────┘  │
│                                    │ Contexto precargado                  │
│                                    ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │             Catálogo Compartido (49 Métricas · 5 Categorías)         │  │
│  └─────────────────────────────────┬───────────────────────────────────┘  │
│                                    ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │               Gráfico Interactivo de Historial de Rachas            │  │
│  │  • Barra superior: Selector jugador + Filtro Últ. X PJ (def. 10)    │  │
│  │  • Selector por categorías (máx. 3 activas) + Umbral editable       │  │
│  │  • Lienzo SVG:                                                      │  │
│  │      - Línea vertical divisoria 2025-26 | 2026-27                   │  │
│  │      - Línea horizontal conmutable (Umbral / Media Temp. actual)    │  │
│  │      - Nodos coloreados exclusivos en racha activa + Máx / Mín      │  │
│  │  • Zoom deslizable temporal (activo en rangos amplios / 2 temp.)    │  │
│  │  • Franja inferior por métrica (1 a 3):                             │  │
│  │      - Media temporada actual y desviación con la racha             │  │
│  │      - Media tramo y desviación con la racha                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Modelo de estado e interacciones clave

- **Fusión bitemporal por jugador**: Para el jugador seleccionado se combinan sus registros de `2025-26` y `2026-27` (desduplicados por identificador de partido y ordenados cronológicamente de más antiguo a más reciente). Se calcula el índice exacto de cambio de temporada para posicionar la línea vertical divisoria cuando ambos lados están presentes en la ventana visible.
- **Ventana visible y Zoom**:
  - Por defecto ` últimos X partidos = 10`, tomando los 10 encuentros más recientes de la serie combinada.
  - Al elegir un `X` mayor o `2 Temporadas`, el estado de subrango del zoom deslizable (`inicio` – `fin`) recorta la vista activa sin alterar el cálculo oficial de la media de temporada actual (`2026-27`) ni de la racha activa vigente (que siempre se mide desde el último partido real disputado por el jugador).
- **Sincronización tabla → gráfico**:
  - Se define un estado de contexto de apertura (`jugador`, `métrica`, `operador`, `umbral`, `esPositiva`) que se actualiza al pulsar el icono de gráfico desde cualquiera de las tres tablas (mapeando cada regla de racha automática, la métrica activa del buscador a medida o los puntos de consistencia al identificador correspondiente del catálogo de 49 métricas).
- **Cálculo de racha y desviaciones inferiores**:
  - Para cada una de las hasta 3 métricas activas se evalúa desde el último partido jugado cuántos encuentros consecutivos cumplen su condición activa (`operador` + `umbral`), obteniendo la **Media de la racha**.
  - Se calcula la **Media de la temporada actual** (exclusivamente sobre los partidos `2026-27` del jugador) y la **Media del tramo** (sobre los partidos actualmente visibles en el gráfico), mostrando ambas cifras junto a su desviación exacta respecto a la racha (`Media racha − Media referencia`), coloreada semánticamente teniendo en cuenta las métricas inversas (como pérdidas o faltas personales, donde menos es mejor).
