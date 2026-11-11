# Plan de Implementación: Corrección Admin, Muestras por Defecto e Ingesta Play-by-Play para Crónicas

Solución integral para garantizar la estabilidad de sesión en la Zona Admin (soporte para entornos enmarcados e iframe), asegurar que la muestra por defecto en toda la app y en Jugadores sea la **temporada actual 2026-27**, e integrar en el servidor la lectura interna de Play-by-Play (PBP) para enriquecer la exactitud periodística de las crónicas.

---

## 1. Corrección de Autenticación Admin (Sesión Ininterrumpida)

### Causa del Problema
En entornos de vista previa o dentro de un `<iframe>`, la directiva de cookies `SameSite=Strict` provoca que los navegadores omitan la cookie de sesión en las peticiones secundarias (`/api/admin/gameday-thresholds`). Al recibir un `401 Unauthorized`, el componente cliente activaba el cierre de sesión y reaparecía el diálogo de contraseña.

### Cambios a Aplicar:
- **`src/server/securityMiddleware.ts`**:
  - Configurar las cookies de sesión con `SameSite=Lax` (y `SameSite=None` si la conexión es HTTPS/Secure) para permitir su envío en subrecursos dentro de vistas previas.
  - Implementar soporte dual de autenticación: admitir tanto la cookie HttpOnly como el token de sesión transmitido mediante la cabecera `Authorization: Bearer <token>`.
- **`src/utils/adminAuthClient.ts`**:
  - Al recibir una respuesta exitosa en `/api/admin/login`, almacenar una copia del token en memoria/sessionStorage y adjuntarlo en la cabecera `Authorization: Bearer <token>` en todas las llamadas administrativas (`fetchAdminGamedayThresholds`, `updateAdminGamedayThresholds`, etc.).
  - Evitar el cierre intempestivo de sesión ante fallos puntuales de red.

---

## 2. Muestras Temporales por Defecto (Temporada Actual 2026-27)

### Cambios a Aplicar:
- **`src/App.tsx`**:
  - Asegurar que `loadSavedSeasonMode()` devuelva siempre `'2027'` (temporada actual 2026-27) como estado inicial por defecto.
- **`src/components/PlayersExplorerView.tsx`**:
  - Configurar la tabla de **Jugadores NBA** para que al montarse muestre de forma predeterminada las medias y porcentajes acumulados de la **temporada actual 2026-27** (`ptsBase`, `minBase`, `tsPct`, `usgPct`), eliminando cualquier desviación hacia muestras históricas.

---

## 3. Ingesta e Indexación de Play-by-Play (PBP) en Servidor para Crónicas

### Enfoque Técnico:
Tal y como has indicado, **no se integrará el Play-by-Play crudo en la interfaz de la app**. La ingesta se realizará exclusivamente en el **servidor**, donde un motor de análisis procesará la secuencia de jugadas e indexará los hitos para alimentar el redactor de crónicas (`scoutingEngine.ts`).

### Cambios a Aplicar:
- **`src/server/nbaDataService.ts` / `src/server/scoutingEngine.ts`**:
  - Integrar la llamada a la API oficial de Play-by-Play de NBA.com (`cdn.nba.com/static/json/live/10/00226.../playbyplay.json` con fallback en ESPN PBP).
  - **Motor de Infección e Hitos Tácticos**:
    - **Parciales demoledores (*Runs*)**: Rastrea rachas continuas de puntos (ej. parcial 14-2 o 10-0) con el minuto exacto del cuarto.
    - **Acontecimientos en *Clutch Time***: Identifica tiros encestados, robos o tapones en los últimos 2 minutos con margen $\le 5$ puntos.
    - **Cambios de liderazgo y quiebre**: Registra el momento exacto en que el vencedor tomó la ventaja definitiva.
  - **Redacción Enriquecida**: Integrar estos datos numéricos en los textos narrativos de los capítulos de la crónica (Pizarras, Claves y Desarrollo), aportando nombres de jugadores, minutos concretos y marcadores exactos.

---

## 4. Plan de Verificación

1. **Prueba de Admin**:
   - Iniciar sesión en la Zona Privada con la clave `19.Sirio.85`.
   - Navegar entre *Zona Fantasy*, *Criterios de jornada (03A/03B)* y *Configuración de la Web* verificando que la sesión se mantenga unlocked sin solicitar contraseña.
   - Modificar un criterio en *Criterios de jornada*, guardar y confirmar que los valores persisten.
2. **Prueba de Muestras Temporales**:
   - Verificar en la vista principal y en la pestaña **Jugadores NBA** que la muestra por defecto es la temporada **2026-27 (Actual)**.
3. **Prueba de Crónicas Enriquecidas por PBP**:
   - Abrir las crónicas de partidos de la jornada reciente y verificar que el texto narre con exactitud los parciales clave y momentos de cierre gracias al análisis interno del Play-by-Play.
4. **Validación de Compilación y Calidad**:
   - Ejecutar `compile_applet` y `lint_applet` para confirmar 0 errores de TypeScript y total estabilidad.
