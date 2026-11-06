# Plan de Acción y Estado de RadarNBA

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

### Fase 3: Fantasy Edge & Analítica Avanzada (Próxima Fase)
- [ ] **11. Simulador de Traspasos Proyectivo (Net Impact)**: Cálculo del impacto neto no solo en promedios pasados, sino en proyecciones Rest-of-Season (ROS) y volumen de partidos restantes.
- [ ] **12. Radar de Chollos (Smart Waiver Watcher)**: Algoritmo que detecta aumentos de USG% en suplentes ante lesiones confirmadas de estrellas, notificando oportunidades en el mercado de agentes libres.
- [ ] **13. Optimizador de Alineación Semanal**: Matriz de densidad de partidos por semana, identificando días con pocos partidos (Quality Starts) para maximizar puntuación.
- [ ] **14. Persistencia de Filtros en URL (Deep Linking)**: Sincronización de la vista actual (filtros, temporada, ventana temporal) con la barra de direcciones para compartir análisis.
- [ ] **15. Virtualización de Listados Voluminosos**: Implementación de `Windowing` en tablas de 500+ filas para garantizar 60 FPS en móviles.

### Fase 4: Módulo Histórico & Career Highs (Aplazado)
- [ ] **16. Registro de Career Highs**: Detector de récords personales históricos en 5 categorías principales.
- [ ] **17. Hitos Cruzados Multitemporada**: Comparativas visuales de la evolución del jugador a lo largo de las 3 temporadas disponibles.
- [ ] **18. Notificaciones de Récord**: Insignias visuales en el Inspector cuando un jugador está en trayectoria de superar su mejor marca.
