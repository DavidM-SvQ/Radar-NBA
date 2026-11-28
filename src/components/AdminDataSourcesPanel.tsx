import React, { useMemo, useState } from 'react';
import {
  Database,
  Globe,
  HardDrive,
  Layers,
  Search,
  ShieldCheck,
} from 'lucide-react';

type DataSourceCategory =
  | 'all'
  | 'games_stats'
  | 'contracts'
  | 'injuries_rosters'
  | 'history_awards'
  | 'internal_engines';

interface DataSourceEntry {
  id: string;
  category: Exclude<DataSourceCategory, 'all'>;
  categoryLabel: string;
  moduleTitle: string;
  sectionsFed: string[];
  primaryProvider: string;
  primaryDomain: string;
  endpointsSummary: string;
  fallbackStrategy: string;
  cachePolicy: string;
  notes: string;
}

const DATA_SOURCES_CATALOG: DataSourceEntry[] = [
  {
    id: 'core_games_boxscores',
    category: 'games_stats',
    categoryLabel: 'Partidos y Stats',
    moduleTitle: 'Partidos, Boxscores, Clasificación y Game Logs (2025-26 y 2026-27)',
    sectionsFed: [
      'Resumen del Día',
      'Clasificación y Conferencias',
      'Hitos de Temporada',
      'Rachas y Consistencia',
      'Radar de Anomalías',
      'Tendencias y Gráficos',
    ],
    primaryProvider: 'NBA Stats API Oficial',
    primaryDomain: 'stats.nba.com',
    endpointsSummary:
      'leaguegamelog (jugadores y equipos), leaguestandingsv3, playerindex y tablas generales por temporada.',
    fallbackStrategy:
      'NBA CDN Live (cdn.nba.com) para boxscores en tiempo real, ESPN Scoreboard (site.api.espn.com) para marcadores del día y snapshot local comprimido en disco si las APIs externas limitan tráfico.',
    cachePolicy: 'Memoria en servidor + snapshot comprimido en disco con actualización incremental.',
    notes:
      'Los identificadores oficiales de jugador y equipo de NBA.com actúan como clave maestra para unificar todas las secciones.',
  },
  {
    id: 'advanced_tracking_playtypes',
    category: 'games_stats',
    categoryLabel: 'Partidos y Stats',
    moduleTitle: 'Estadísticas Avanzadas, Tracking, Tiros, Defensa, Lineups y Playtypes',
    sectionsFed: [
      'Laboratorio Avanzado',
      'Inspector / Dossier de Jugador',
      'Inspector de Equipo',
      'Zonas de Tiro y Clutch',
      'Quintetos (Lineups) y Tiros Heroicos',
    ],
    primaryProvider: 'NBA Stats API + NBA CDN Play-by-Play',
    primaryDomain: 'stats.nba.com · cdn.nba.com',
    endpointsSummary:
      'leaguedashplayerstats (Advanced/Misc), leaguehustlestatsplayer/team, leaguedashptstats, leaguedashptdefend, synergyplaytypes, leaguedashlineups, teamplayeronoffsummary y playbyplay_*.json en CDN.',
    fallbackStrategy:
      'Circuit breaker por proveedor y degradación limpia a snapshots locales o métricas calculadas desde game logs cuando stats.nba.com responde lento.',
    cachePolicy: 'Caché por consulta en memoria + snapshots en disco para métricas pesadas.',
    notes:
      'Los tiros heroicos (game-winners y tiros decisivos en clutch) se extraen directamente del play-by-play oficial jugada a jugada en cdn.nba.com.',
  },
  {
    id: 'contracts_cba',
    category: 'contracts',
    categoryLabel: 'Contratos y Cap',
    moduleTitle: 'Contratos NBA, Masa Salarial, Cap Space y Proyecciones 2026-2030',
    sectionsFed: [
      'Hub de Contratos',
      'Cap Sheets de las 30 franquicias',
      'Mapa CBA (Cap / Tax / Aprons)',
      'Eficiencia Salarial Deportiva',
    ],
    primaryProvider: 'Fanspo NBA Payroll (Principal)',
    primaryDomain: 'fanspo.com',
    endpointsSummary:
      'Páginas de nómina de los 30 equipos (/nba/teams/<equipo>/<id>/payroll): cap hit oficial 2026-27, salarios exactos temporada a temporada (2026-27 a 2029-30), extensiones futuras firmadas, opciones (PO/TO), trade kickers, cláusulas anti-traspaso y estado Two-Way real.',
    fallbackStrategy:
      'ESPN Team Roster API (site.api.espn.com) equipo a equipo si Fanspo fallara temporalmente + umbrales oficiales del CBA 2026-27 (Cap $164.96M, Luxury Tax $200.43M, 1er Apron $209.02M, 2º Apron $221.69M, Two-Way $636K).',
    cachePolicy:
      'Caché en memoria (20 min) + snapshot comprimido en disco (6 horas, esquema v2). Se cruza por NBA Player ID oficial.',
    notes:
      'Sustituyó a ESPN como fuente principal porque ESPN omitía contratos nuevos o renovados del verano de 2026. Los jugadores cortados (dead cap) no ensucian la plantilla activa y los Two-Way no suman contra el Salary Cap.',
  },
  {
    id: 'injuries_rotations',
    category: 'injuries_rosters',
    categoryLabel: 'Lesiones y Plantillas',
    moduleTitle: 'Parte Médico, Lesiones y Disponibilidad de Rotación',
    sectionsFed: [
      'Enfermería / Lesiones',
      'Alertas de Jornada',
      'Asistente Fantasy ESPN',
    ],
    primaryProvider: 'ESPN NBA Injuries API',
    primaryDomain: 'site.api.espn.com',
    endpointsSummary:
      '/apis/site/v2/sports/basketball/nba/injuries (estado Out, Doubtful, Questionable, Day-To-Day y nota médica).',
    fallbackStrategy:
      'Cruce con ausencias reales en los últimos partidos del game log de stats.nba.com y snapshot local en disco.',
    cachePolicy: 'Caché temporal en memoria + snapshot local de respaldo.',
    notes:
      'Permite cuantificar cuántos minutos y puntos de media pierde cada equipo por lesión respecto a su rotación habitual.',
  },
  {
    id: 'history_awards',
    category: 'history_awards',
    categoryLabel: 'Histórico y Premios',
    moduleTitle: 'Trayectoria Histórica, Récords de Franquicia y Carrera por Premios',
    sectionsFed: [
      'Líderes Históricos y Carrera',
      'Carrera por los Premios (MVP, DPOY, ROY, 6MOY, MIP)',
      'Avatares y Fotos Oficiales',
    ],
    primaryProvider: 'NBA Stats API + NBA CDN + ESPN Roster',
    primaryDomain: 'stats.nba.com · cdn.nba.com · site.api.espn.com',
    endpointsSummary:
      'franchisehistory, teamyearbyyearstats, leaguegamelog histórico, headshots oficiales en cdn.nba.com/headshots y años de experiencia en ESPN Roster para validar elegibilidad de Rookie del Año (ROY).',
    fallbackStrategy:
      'Snapshot histórico en disco para evitar recargas masivas y conservar rendimiento instantáneo.',
    cachePolicy: 'Snapshots comprimidos de larga duración en disco.',
    notes:
      'Las fotos oficiales de jugadores se cargan desde el CDN de la NBA por ID oficial con respaldo visual si falta imagen.',
  },
  {
    id: 'draft_history',
    category: 'history_awards',
    categoryLabel: 'Histórico y Premios',
    moduleTitle: 'Archivo Histórico del Draft NBA y Evaluador de Camadas (2001–2026)',
    sectionsFed: [
      'Draft NBA — Archivo por Camada',
      'Re-Draft y Acierto',
      'Robos y Decepciones',
      'Camadas y Franquicias',
      'Buscador Global del Draft',
    ],
    primaryProvider: 'ESPN NBA Draft API + Snapshot Histórico RadarNBA',
    primaryDomain: 'site.api.espn.com',
    endpointsSummary:
      '/apis/site/v2/sports/basketball/nba/draft?season={2001..2026}: orden oficial de elección, ronda, lotería, equipo selector, procedencia universitaria/internacional y traspasos en noche de Draft.',
    fallbackStrategy:
      'Snapshot comprimido permanente en disco (data/nba-draft-history.json.gz) con respaldo en /tmp para lectura instantánea sin depender de red.',
    cachePolicy:
      'Archivo persistido en disco + cruce dinámico en memoria con carrera histórica (nba-career-history.json.gz) y estadísticas en vivo 2026–27.',
    notes:
      'Cada jugador elegido se enlaza automáticamente con su ficha inspectora, nota de camada S–C, Re-Draft determinista y estadísticas reales de carrera.',
  },
  {
    id: 'future_draft_picks',
    category: 'contracts',
    categoryLabel: 'Contratos y Cap',
    moduleTitle: 'Inventario de Rondas Futuras del Draft NBA (2027–2033) y Regla Ted Stepien',
    sectionsFed: [
      'Draft NBA — Rondas Futuras 27–33',
      'Trade Machine (Traspaso de Rondas y Validación Stepien)',
    ],
    primaryProvider: 'Fanspo NBA Future Draft Picks (Principal)',
    primaryDomain: 'fanspo.com',
    endpointsSummary:
      'Páginas de capital de Draft de las 30 franquicias (/nba/teams/<equipo>/<id>/draft-picks): 1ª y 2ª rondas controladas (2027–2033), picks propios y recibidos, swaps favorables/comprometidos, protecciones exactas y rondas salientes.',
    fallbackStrategy:
      'Snapshot comprimido en disco (data/nba-future-picks.json.gz) con respaldo en /tmp si Fanspo no responde temporalmente.',
    cachePolicy:
      'Caché en memoria (30 min) + snapshot comprimido en disco (12 horas, esquema v1) con recálculo automático de bloqueos por Regla Ted Stepien y Capital de Draft.',
    notes:
      'Integrado en tiempo real con la Trade Machine: impide dejar a una franquicia sin primera ronda en dos Drafts consecutivos y avisa de congelación del pick de 2033 por 2º Apron.',
  },
  {
    id: 'internal_analytics',
    category: 'internal_engines',
    categoryLabel: 'Cálculo Interno',
    moduleTitle: 'Motores Analíticos Propios de RadarNBA (Sin datos inventados)',
    sectionsFed: [
      'Motor Dinámico O(N) de Rachas y Referencias NBA 26-27',
      'Radar de Anomalías (Z-Score y Breakouts)',
      'Notificaciones de Hitos',
      'Asistente Fantasy y Valor Deportivo por Millón',
    ],
    primaryProvider: 'Motor Analítico RadarNBA (Cálculo determinista)',
    primaryDomain: 'Servidor y cliente RadarNBA',
    endpointsSummary:
      'Calculado 100% sobre los partidos oficiales cargados en memoria: detección de umbrales exactos en rachas, Media/P75/P90 de jugadores ≥20 MIN en 2026-27, desviaciones estadísticas y eficiencia salarial.',
    fallbackStrategy:
      'Reglas configurables desde Zona Admin (Rachas, Modo Sencillo/Avanzado, Criterios de Jornada, Notificaciones) guardadas en JSON en servidor.',
    cachePolicy: 'Recálculo en milisegundos en memoria; configuraciones persistidas en disco.',
    notes:
      'Todo cálculo se deriva exclusivamente de estadísticas oficiales verificadas y respeta los filtros del Modo Sencillo / Avanzado.',
  },
  {
    id: 'editorial_chronicles',
    category: 'internal_engines',
    categoryLabel: 'Cálculo Interno',
    moduleTitle: 'Crónicas de Jornada y Partido (v1 Clásica / v2 Táctica Híbrida)',
    sectionsFed: [
      'Resumen del Día (Crónica de Jornada v2 Híbrida o v1 Clásica)',
      'Crónica individual de partido (v2 Táctica Híbrida o v1 Clásica)',
    ],
    primaryProvider: 'Servicio Editorial RadarNBA + AP/ESPN Summary + Búsqueda Web',
    primaryDomain: 'Backend RadarNBA (/api/nba/*) · site.api.espn.com',
    endpointsSummary:
      'Tanto en Partido v2 como en Jornada v2 (activas por defecto y seleccionables de forma independiente en Admin → Crónicas & Estilo IA): combinan minería determinista de Four Factors (eFG%, TOV%, OREB%, FTr, AST%, duelos defensivos de Play-by-Play y extremos de la noche), crónicas post-partido completas de AP/ESPN (/apis/site/v2/sports/basketball/nba/summary — en paralelo para toda la cartelera en Jornada) y contraste con búsqueda web en vivo para esquemas defensivos y declaraciones verificadas.',
    fallbackStrategy:
      'Cascada automática: si la búsqueda web o la API externa falla o supera el tiempo límite, reintenta con el dossier táctico + crónicas AP/ESPN y degrada limpiamente a motor determinista táctico sin inventar citas ni métricas.',
    cachePolicy:
      'Caché persistente aislada por versión (v1_classic vs v2_tactical) y evento/fecha, purgable al instante desde Admin.',
    notes:
      'El estilo, extensión, enfoque táctico y clichés prohibidos se gobiernan de forma centralizada desde Zona Admin.',
  },
];

const CATEGORY_TABS: Array<{ id: DataSourceCategory; label: string }> = [
  { id: 'all', label: 'Todas las fuentes' },
  { id: 'games_stats', label: 'Partidos y Stats' },
  { id: 'contracts', label: 'Contratos y Cap' },
  { id: 'injuries_rosters', label: 'Lesiones y Plantillas' },
  { id: 'history_awards', label: 'Histórico y Premios' },
  { id: 'internal_engines', label: 'Cálculo Interno' },
];

export const AdminDataSourcesPanel: React.FC = () => {
  const [categoryFilter, setCategoryFilter] = useState<DataSourceCategory>('all');
  const [query, setQuery] = useState('');

  const filteredSources = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DATA_SOURCES_CATALOG.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!q) return true;
      const hay = [
        item.moduleTitle,
        item.primaryProvider,
        item.primaryDomain,
        item.endpointsSummary,
        item.fallbackStrategy,
        item.notes,
        ...item.sectionsFed,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [categoryFilter, query]);

  return (
    <div className="space-y-5 min-w-0 max-w-full">
      {/* Cabecera */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-orange-400">
              <Database className="w-4 h-4" />
              <span>Mapa Oficial de Origen de Datos · RadarNBA</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Fuentes de Datos, Proveedores y Respaldos Multinivel
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Referencia completa de dónde obtiene RadarNBA cada dato mostrado en la web, qué
              proveedor actúa como fuente principal, cuál entra como respaldo si hay un fallo
              externo y cómo se cachea para mantener tiempos de respuesta bajos.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 shrink-0 font-mono tabular-nums">
            <div className="px-3 py-2 rounded-lg bg-[#0B1120] border border-[#1E293B] text-center">
              <div className="text-base font-extrabold text-white">4</div>
              <div className="text-[10px] font-sans text-slate-400">APIs externas</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-[#0B1120] border border-[#1E293B] text-center">
              <div className="text-base font-extrabold text-emerald-300">
                {DATA_SOURCES_CATALOG.length}
              </div>
              <div className="text-[10px] font-sans text-slate-400">Módulos documentados</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-[#0B1120] border border-[#1E293B] text-center">
              <div className="text-base font-extrabold text-sky-300">3</div>
              <div className="text-[10px] font-sans text-slate-400">Capas de caché</div>
            </div>
          </div>
        </div>

        {/* Resumen rápido de dominios autorizados */}
        <div className="pt-3 border-t border-[#1E293B] flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Dominios externos activos:</span>
          <span className="font-mono text-sky-300">stats.nba.com</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-sky-300">cdn.nba.com</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-emerald-300">fanspo.com</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-amber-300">site.api.espn.com</span>
        </div>
      </div>

      {/* Filtros y Buscador */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  categoryFilter === tab.id
                    ? 'bg-orange-500 text-slate-950'
                    : 'bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar fuente, sección o dominio..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Lista detallada de fuentes */}
        <div className="divide-y divide-[#1E293B] border border-[#1E293B] rounded-xl overflow-hidden bg-[#0B1120]/60">
          {filteredSources.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No hay fuentes que coincidan con esa búsqueda.
            </div>
          ) : (
            filteredSources.map((src) => (
              <div key={src.id} className="p-4 sm:p-5 space-y-3 hover:bg-[#131C2E]/40 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                      <span className="font-semibold text-orange-400">{src.categoryLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-300">{src.primaryDomain}</span>
                    </div>
                    <h3 className="text-sm font-bold text-white">{src.moduleTitle}</h3>
                  </div>

                  <div className="text-xs font-semibold text-emerald-300 shrink-0">
                    {src.primaryProvider}
                  </div>
                </div>

                {/* Secciones alimentadas */}
                <div className="text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">Secciones que alimenta: </span>
                  <span>{src.sectionsFed.join(' · ')}</span>
                </div>

                {/* Detalle técnico en 3 columnas limpias */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-[#0B1120] border border-[#1E293B] space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300">
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span>Datos y endpoints principales</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {src.endpointsSummary}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-[#0B1120] border border-[#1E293B] space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Respaldo / Fallback</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {src.fallbackStrategy}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-[#0B1120] border border-[#1E293B] space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                      <HardDrive className="w-3.5 h-3.5 shrink-0" />
                      <span>Caché y notas operativas</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      <strong className="text-slate-200">{src.cachePolicy}</strong> {src.notes}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Nota de arquitectura de capas */}
        <div className="p-3.5 rounded-lg bg-[#0B1120] border border-[#1E293B] flex items-start gap-2.5 text-xs text-slate-400">
          <Layers className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-slate-200">Orden de resolución de caché:</strong> las peticiones
            pasan primero por la caché en memoria del servidor, luego por los snapshots comprimidos
            en disco (con versión de esquema para descartar automáticamente datos antiguos tras una
            mejora de fuente) y, cuando caducan o se fuerza recarga, consultan las APIs externas
            mediante listas estrictas de dominios autorizados (HTTPS).
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminDataSourcesPanel;
