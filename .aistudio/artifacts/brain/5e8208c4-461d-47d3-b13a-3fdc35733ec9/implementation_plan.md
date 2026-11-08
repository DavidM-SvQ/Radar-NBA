# Plan de Acción y Hoja de Ruta de RadarNBA

## Estado Actual de Implementación

### Fase 1: Seguridad y Rendimiento Crítico (100% Completada)
- [x] **1. Derivación de claves con `scrypt` y fail-closed en producción**: Se retiró SHA-256 directo y contraseñas fijas en código.
- [x] **2. Sesión Admin blindada (`HttpOnly; Secure; SameSite=Strict`)**: Retirado el token de `sessionStorage` y añadida protección CSRF.
- [x] **3. Rate Limiting distribuido con Upstash Redis**: Persistencia de contadores anti fuerza bruta y refrescos pesados.
- [x] **4. Code-Splitting de vistas pesadas (`lazyWithPreload`)**: División modular de bundles.
- [x] **5. Memoización bajo demanda (`useOnDemandMemo`)**: Cálculos analíticos únicamente para la pestaña en pantalla.

### Fase 2: Robustez de Datos, Resiliencia y Monitoreo (100% Completada)
- [x] **6. Circuit Breaker y fallback multinivel**: Aislamiento de fallos para proveedores externos con estados dinámicos.
- [x] **7. Cabeceras Cache-Control calibradas**: Optimización de costes serverless en Vercel.
- [x] **8. Compresión y payload delta en marcadores**: Huellas MD5/ETag y GZip para ahorro masivo de ancho de banda.
- [x] **9. Telemetría y Alertas sin PII**: Dashboard administrativo con percentiles de latencia y monitoreo de errores.
- [x] **10. Motor de Crónicas con Cascada Resiliente (Gemini 3.8 Flash)**: Detección multivariable de claves API, soporte para Free Tier (429) e icono de alerta con tooltip sutil.
- [x] **11. Auditoría y Corrección Manual de Partidos Fantasy (± FPTS)**: Panel superior destacado para seleccionar partido, ingresar delta de puntos y registrar explicación/motivo con persistencia unificada y seed de Ajay Mitchell (213.25 FPTS).
- [x] **12. Sincronización Médica y Bajas Prolongadas**: Detección de bajas de larga duración (Chet Holmgren ~8 semanas) con exclusión automática en proyecciones semanales.

### Fase 3: Rachas Avanzadas & Multi-Estadística (Próxima Fase - Propuesta Nueva)
- [ ] **13. Detector de Rachas de Dobles-Dobles y Triples-Dobles Consecutivos**: Algoritmo de rastreo temporal que calcula secuencias ininterrumpidas de partidos logrando DD o TD (ej. Jokic o Westbrook con 7 TD seguidos).
- [ ] **14. Motor de Rachas Multivariable / Umbrales Compuestos**: Identificación de secuencias de X partidos consecutivos cumpliendo simultáneamente múltiples condiciones complejas (ej. ≥ 20 PTS + ≥ 5 REB + ≥ 5 AST + ≥ 2 TAP).
- [ ] **15. Integración en el Panel de Rachas y Radar de Anomalías**: Sección dedicada en la vista de Rachas con filtros por tipo de hito (Anotación, Versatilidad, Playmaking, Defensa) y extensión de la racha active/broken.
- [ ] **16. Insignias e Hitos en la Crónica Diaria e Inspector**: Inclusión automática de estas rachas multi-estadísticas en los dossiers del motor Gemini para destacarlas en la revista editorial de la jornada y en la ficha del jugador.

### Fase 4: Fantasy Edge & Herramientas de Mánager (En Ejecución)
- [x] **17. Simulador de Traspasos Proyectivo (Net Impact)**: Impacto neto calculado con proyecciones Rest-of-Season (ROS), densidad de partidos restantes según el calendario y simulación de hueco streaming o corte obligatorio (Tope 12 contratos).
- [x] **18. Radar de Chollos (Smart Waiver Watcher)**: Detección automática en agentes libres de aumentos en USG% y minutos en suplentes tras confirmarse lesiones de titulares o promociones en la rotación.
- [x] **19. Tabla Mi Equipo Fantasy Compacta & Botón Lápiz**: Altura de fila reducida, botón de auditar/corregir con icono exclusivo de lápiz sin texto e insignias de partidos en una sola línea horizontal sin salto.
- [x] **20. Tabla Agentes Libres sin Scroll Horizontal & Desglose Descendente**: Tabla real y compacta que encaja en pantalla completa con Total FPTS, Media FPTS, Próx. Sem. (con tooltip `(i)` de partidos/rivales), FPTS Últ. 7D / 15D / 30D, menú popover flotante al pasar el ratón con desglose descendente de partidos jugados y filtros rápidos reparados con `(i)` de información.
- [ ] **21. Optimizador de Alineación Semanal**: Matriz de densidad de partidos por semana, identificando días con pocos partidos (Quality Starts) para maximizar puntuación.
- [ ] **22. Persistencia de Filtros en URL (Deep Linking)**: Sincronización de la vista actual (filtros, temporada, ventana temporal) con la barra de direcciones para compartir análisis.
- [ ] **23. Virtualización de Listados Voluminosos**: Implementación de `Windowing` en tablas de 500+ filas para garantizar 60 FPS en móviles.

### Fase 5: Módulo Histórico & Career Highs (En reserva)
- [ ] **20. Registro de Career Highs**: Detector de récords personales históricos en 5 categorías principales.
- [ ] **21. Hitos Cruzados Multitemporada**: Comparativas visuales de la evolución del jugador a lo largo de las 3 temporadas disponibles.
- [ ] **22. Notificaciones de Récord**: Insignias visuales en el Inspector cuando un jugador está en trayectoria de superar su mejor marca.
