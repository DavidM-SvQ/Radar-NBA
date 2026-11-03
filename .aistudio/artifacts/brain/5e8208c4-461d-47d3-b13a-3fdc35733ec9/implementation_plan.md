# RadarNBA — Fase 1: Automatización Diaria del Snapshot, Cinta de Jornada en Juego y Premios de Temporada NBA

Esta entrega automatiza la consolidación matinal gratuita de todas las estadísticas de la madrugada NBA en GitHub y Vercel, incorpora un aviso superior limpio cuando hay partidos en directo sin consumir recursos en segundo plano, e integra un nuevo módulo de seguimiento de **Premios de Temporada NBA** conectado al motor de desviaciones y rachas de RadarNBA.

### Revisión y Decisiones Confirmadas

> [!IMPORTANT]
> Las siguientes decisiones han quedado confirmadas contigo e integradas en este plan antes de tocar una sola línea de código:

- **Alcance completo de esta Fase 1**: Implementamos conjuntamente la automatización diaria en GitHub Actions, la cinta superior de jornada en vivo y el nuevo apartado de Premios de Temporada NBA, dejando documentado al final del documento el recordatorio completo de las Fases 2, 3 y 4 pendientes.
- **Cinta superior sin sondeo automático (cero gasto extra)**: La barra de «Jornada en juego» aprovechará únicamente el marcador ya descargado al entrar o actualizar manualmente, descartando cualquier temporizador cada 60 segundos.
- **Cobertura total de galardones (8 carreras)**: El módulo de Premios incluirá los 5 clásicos (**MVP**, **Rookie del Año**, **Jugador Más Mejorado**, **Defensor del Año** y **Sexto Hombre**), más **Jugador Clutch del Año**, **Jugador Hustle del Año** y la **Proyección de los 3 Quintetos All-NBA**.
- **Índice propio + Slider configurable de partidos mínimos**: Los candidatos combinarán promedios, impacto colectivo, rachas activas y desviaciones recientes, aplicando por defecto la regla oficial NBA de **65 partidos proyectados** con un control deslizante interactivo (`0–82` partidos) para simular cortes de elegibilidad en tiempo real.

---

### 1. Visión General y Hoja de Ruta Completa

- **Qué aporta esta entrega**:
  1. **Autonomía diaria total de datos**: Cada mañana (11:00h hora peninsular española, tras concluir toda la jornada nocturna de la Costa Oeste), una tarea programada actualizará la base comprimida de partidos, jugadores, titulares/suplentes y plantillas sin intervención manual, desplegándose automáticamente en Vercel solo cuando haya partidos nuevos.
  2. **Pulso inmediato al abrir la web**: Si entras mientras se disputa la jornada NBA, verás al instante los marcadores en vivo arriba del área de trabajo con acceso directo al Analizador de Jornadas.
  3. **Seguimiento visual de Premios con ADN RadarNBA**: Consulta al momento quién lidera cada trofeo y qué candidatos están **subiendo o cayendo** gracias a sus desviaciones recientes (`Últ. 5 PJ` frente a media anual) y rachas activas.
- **Audiencia y valor clave**: Diseñado para consulta rápida, visual y homogénea desde ordenador o móvil, manteniendo exactamente la misma gramática visual y nivel de detalle (`Modo Sencillo` y `Modo Avanzado`) en toda la plataforma.

> [!NOTE]
> **Recordatorio íntegro del resto de mejoras pendientes (Hoja de Ruta por Fases)**
> Tal y como pediste, aquí queda registrado todo el inventario pendiente tras completar esta Fase 1 para ir abordándolo ordenadamente:
> - **Fase 2 — Seguridad y Robustez Backend (Pendiente)**: Eliminar la contraseña y clave HMAC por defecto del código fuente exigiendo variables de entorno, migrar la sesión Admin 100 % a cookies `HttpOnly` con protección CSRF, persistir los límites antiatacantes y ajustes de seguridad en Upstash Redis, y activar el tipado estricto TypeScript en los módulos del servidor.
> - **Fase 3 — Rendimiento y Carga Diferida (Pendiente)**: Aplicar división de código (`lazy loading`) por secciones para aligerar la carga inicial en móvil, pedir datos pesados bajo demanda únicamente al entrar en su sección correspondiente y calcular tablas analíticas solo para la vista activa.
> - **Fase 4 — Fantasy Avanzado y Experiencia Móvil (Pendiente)**: Añadir casillas de lesionados (`IR`) independientes de los 12 contratos activos en el asistente ESPN Fantasy, crear el Comparador de Enfrentamiento Semanal directo frente a cualquiera de los otros 11 rivales de tu liga, y habilitar la instalación como aplicación móvil (`PWA`).

---

### 2. Experiencia de Usuario y Diseño Visual Homogéneo

- **Flujos de usuario principales**:
  1. **Cinta de Jornada en Juego**:
     - Solo aparece en la parte superior del lienzo principal cuando existen partidos con estado en vivo (`isLive`) y no ha sido cerrada por el usuario durante la sesión actual.
     - Muestra el recuento de encuentros en directo, marcadores compactos con escudos y cuarto/reloj en cifras tabulares, un botón directo **«Ir a Jornada →»** y un botón de cierre que recuerda tu decisión durante toda la sesión.
  2. **Apartado «Premios de Temporada»**:
     - Accesible desde la barra lateral de escritorio, el menú móvil y mediante enlace directo compartible (`?view=awards&award=mvp`).
     - **Barra superior homogénea de control**: Selector de temporada (`2026-27 Actual` o `2025-26 Completa`), pestañas horizontales para las 8 categorías, buscador rápido de jugador/equipo y el **Slider interactivo de elegibilidad** (`Mín. partidos proyectados: 65 PJ`, ajustable de `0` a `82`, más selector para ocultar o mostrar con aviso a quienes no alcanzan el ritmo de partidos).
     - **Podio y tabla comparativa de candidatos (7 trofeos individuales)**: Destaca al Top 3 en tarjetas superiores de un solo nivel de elevación y despliega la tabla completa de aspirantes mostrando: **Índice Radar (0–100)** con desglose transparente al pasar el cursor, estadísticas clave específicas del premio, **Desviación reciente (`Δ Últ. 5 PJ` positiva o negativa)**, **Racha activa** y **Ritmo de partidos sobre 82**.
     - **Vista especial «Quintetos All-NBA»**: Presenta visualmente el **1.er, 2.º y 3.er Quinteto All-NBA** (15 jugadores sin restricción de posición según la normativa actual NBA) más el bloque de **«Al corte (Puestos 16–20)»**, permitiendo comprobar al instante quién entra o sale de los quintetos al mover el slider de partidos mínimos.
     - Al pulsar cualquier jugador en el podio, tabla o quinteto All-NBA, se abre el **Inspector lateral de jugador** habitual de RadarNBA.

- **Identidad visual y disciplina estética**:
  - **Homogeneidad absoluta (Regla 60-30-10)**: Lienzo oscuro dominante `#0B1120` (60 %), contenedores estructurales planos `#131C2E` con bordes finos `#1E293B` sin anidar tarjetas dentro de tarjetas ni usar bordes gruesos laterales (30 %), y acento naranja `orange-500` reservado para controles activos y acciones primarias (10 %), complementado con verde esmeralda para desviaciones positivas / elegibilidad cumplida y ámbar/rojo coral para caídas de rendimiento o riesgo de no llegar al mínimo de partidos (siempre acompañados de etiqueta textual explícita, nunca solo color).
  - **Tipografía y cifras tabulares**: Encabezados e interfaz en `Plus Jakarta Sans` con `text-wrap: balance`, y todas las métricas, diferenciales (`+4.6 PTS`), marcadores y proyecciones (`71/82 PJ`) en `JetBrains Mono` con `tabular-nums` para alineación vertical milimétrica.
  - **Cero cápsulas decorativas y límite móvil**: Metadatos secundarios presentados como texto limpio separado por puntos medios (`·`), sin etiquetas tipo cápsula decorativa, y colocando la cinta en vivo dentro del flujo superior de contenido para no superar nunca el 15 % de altura fija en pantallas móviles.

---

### 3. Decisiones de Producto y Equilibrios Técnicos

- **Sincronización GitHub Actions resiliente ante bloqueos en la nube**:
  - *Enfoque elegido*: Flujo diario automatizado (11:00h España + botón manual bajo demanda) que ejecuta la sincronización incrementando el respaldo por CDN oficial de la NBA, marcador/plantillas de ESPN y validación estricta antes de guardar; solo realiza `git commit` cuando el volumen real de partidos o plantillas cambia.
  - *Por qué*: Las direcciones IP de los servidores en la nube suelen sufrir bloqueos puntuales en el servidor histórico de la NBA, mientras que el CDN de actas en vivo y ESPN responden siempre. Además, evitar commits vacíos en días sin NBA ahorra despliegues innecesarios en Vercel.

- **Precisión reglamentaria en Rookies, Sexto Hombre, Clutch y Más Mejorado**:
  - *Enfoque elegido*:
    - **Rookie del Año**: Verificación cruzada del año de debut/experiencia oficial (`0` años previos en la liga) para impedir que veteranos que se perdieron entera la campaña anterior por lesión aparezcan por error como novatos.
    - **Sexto Hombre**: Registro de titularidades frente a salidas desde el banquillo en las actas para exigir que el jugador haya salido más veces desde el banquillo que como titular.
    - **Jugador Más Mejorado (MIP)**: Cruce directo en memoria entre la temporada actual (`2026-27`) y la anterior completa (`2025-26`) calculando el salto real interanual en puntos, creación, eficiencia y minutos, filtrando a quienes ya eran superestrellas consolidadas.
    - **Clutch y Hustle**: Cálculo de Clutch sobre partidos reales decididos por margen `≤ 5` puntos (victorias, anotación, eficiencia y `+/-` en finales apretados) y cálculo de Hustle combinando desvíos, balones divididos, tiros punteados, pantallas asistentes, cierres de rebote y rebotes ofensivos.

---

### 4. Arquitectura Técnica y Estrategia de Datos

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     AUTOMATIZACIÓN DIARIA (GitHub Actions)                   │
│  Cron 11:00h ES / Manual ──▶ Motor Sync NBA (Stats + CDN + ESPN Roster/Bios) │
│                                      │                                       │
│                       Valida integridad y detecta cambios                    │
│                                      ▼                                       │
│              Snapshot Comprimido en Repo ──▶ Auto-Deploy en Vercel           │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       SERVIDOR / API (Memoria Dual NBA)                      │
│  ┌──────────────────────────────┐        ┌────────────────────────────────┐  │
│  │ Bootstrap Inicial            │        │ Endpoint Premios (/nba/awards) │  │
│  │ Equipos + Jugadores +        │        │ Cruza 2026-27 + 2025-26 + Bios │  │
│  │ Marcador actual (Scoreboard) │        │ Calcula 8 carreras + Rachas + Δ│  │
│  └──────────────┬───────────────┘        └───────────────┬────────────────┘  │
└─────────────────┼────────────────────────────────────────┼───────────────────┘
                  │                                        │
                  ▼                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        INTERFAZ CLIENTE (RadarNBA SPA)                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Cinta Superior «Jornada en Juego» (Solo si hay partidos isLive)        │  │
│  │ [Marcadores en vivo tabular-nums]  [Ir a Jornada →]  [Cerrar (Sesión)] │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Vista «Premios de Temporada NBA» (?view=awards&award=...)              │  │
│  │  ├─ Controles: Temporada │ 8 Pestañas │ Slider Mín. PJ (def. 65) │ Busq│  │
│  │  ├─ Vista Trofeos (7): Podio Top 3 + Tabla con Δ Últ.5 PJ y Rachas     │  │
│  │  └─ Vista All-NBA: 1.er / 2.º / 3.er Quinteto + Corte (#16-#20)        │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      ▼                                       │
│                   Inspector Lateral de Jugador / Equipo                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Modelo de datos de Premios**:
  - Cada candidato expone su identidad, equipo y balance colectivo, partidos jugados (`PJ`), partidos jugados por su franquicia y **proyección sobre 82 encuentros**, elegibilidad frente al umbral activo, **Índice Radar (0–100)** desglosado en componentes explicables (producción base, eficiencia/impacto colectivo y momento actual), métricas específicas del galardón, **desviación de los últimos 5 partidos** respecto a su media anual y su **racha activa** más relevante.
  - Al enviar los candidatos precalculados sobre toda la plantilla NBA desde el servidor (con caché en memoria de respuesta instantánea), el deslizador de mínimo de partidos (`0–82 PJ`), los filtros, la búsqueda y el cambio entre las 8 pestañas responden en el navegador en `< 10 ms` sin nuevas llamadas de red.

- **Mapeo interactivo de componentes y estados**:
  - **Cinta de Jornada en Juego**: Lee los partidos en curso del marcador inicial; al pulsar «Ir a Jornada →» navega a `Analizador de Jornadas`; al pulsar cerrar guarda la marca del día en `sessionStorage` para no volver a mostrarse en esa sesión.
  - **Selector de categoría y URL**: Sincroniza la pestaña activa (`mvp`, `roy`, `mip`, `dpoy`, `6moy`, `clutch`, `hustle`, `all_nba`) con la barra de direcciones para permitir compartir enlaces exactos con el botón superior «Enlace».
  - **Slider de partidos mínimos y modo de visualización**: Recalcula instantáneamente en cliente qué jugadores cumplen la proyección sobre 82 partidos, reordenando el podio, la tabla o los 3 quintetos All-NBA (o marcando con etiqueta de advertencia a quienes quedan por debajo del corte si activas «Mostrar no elegibles»).
  - **Estados de carga, vacío y error**: Incluye esqueletos de carga alineados con la geometría de las tablas de RadarNBA, mensaje claro con opción de reducir el umbral si un filtro extremo deja vacía una tabla, y botón de reintento ante fallos de red.
