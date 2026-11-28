import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Check,
  Cloud,
  Database,
  Eye,
  FileText,
  Flame,
  HardDrive,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_EDITORIAL_CONFIG_VALUES,
  fetchAdminEditorialConfig,
  purgeAdminChronicleCache,
  resetAdminEditorialConfigDefaults,
  updateAdminEditorialConfig,
  type DailyChronicleVersion,
  type EditorialConfigStored,
  type EditorialConfigValues,
  type EditorialLengthProfile,
  type EditorialStorageInfo,
  type EditorialTacticalFocus,
  type GameChronicleVersion,
} from '../utils/adminAuthClient';

interface AdminEditorialConfigPanelProps {
  onLockSession?: () => void;
}

const GAME_VERSION_OPTIONS: {
  id: GameChronicleVersion;
  code: string;
  label: string;
  tag: string;
  desc: string;
  highlights: string[];
}[] = [
  {
    id: 'v2_tactical',
    code: 'v2',
    label: 'v2 · Táctica Híbrida',
    tag: 'Por defecto',
    desc: 'Mantiene la estructura actual afinada y añade análisis táctico causal, emparejamientos defensivos y citas verificadas.',
    highlights: [
      'Four Factors + perfil de tiro + duelos defensivos PBP',
      'Crónica completa AP/ESPN + Búsqueda Web en vivo',
      'Bloques nuevos: 3 Claves Tácticas, Pizarra Defensiva y Voces del Vestuario',
    ],
  },
  {
    id: 'v1_classic',
    code: 'v1',
    label: 'v1 · Editorial Clásica',
    tag: 'Afinada intacta',
    desc: 'Conserva exactamente el motor clásico de 8 bloques en mundo cerrado, basado solo en acta oficial, PBP y teletipo breve.',
    highlights: [
      'Estructura clásica de 8 secciones sin búsqueda web',
      'Máxima velocidad y estilo editorial ya afinado',
      'Caché independiente de v2 para alternar sin mezclar',
    ],
  },
];

const DAILY_VERSION_OPTIONS: {
  id: DailyChronicleVersion;
  code: string;
  label: string;
  tag: string;
  desc: string;
  highlights: string[];
}[] = [
  {
    id: 'v2_tactical',
    code: 'v2',
    label: 'v2 · Revista Táctica Híbrida',
    tag: 'Por defecto',
    desc: 'Combina Radar Táctico de la Noche (Four Factors + duelos PBP), cobertura total AP/ESPN de toda la cartelera y búsqueda web en vivo con prosa más concisa y escaneable.',
    highlights: [
      'Bloque Radar Táctico (3 ejes causales + 4 extremos clicables + duelos PBP)',
      'Crónicas AP/ESPN de toda la cartelera en paralelo + Búsqueda Web',
      'Voces de la Noche verificadas (solo si existen citas reales) y lectura ágil',
    ],
  },
  {
    id: 'v1_classic',
    code: 'v1',
    label: 'v1 · Editorial Clásica',
    tag: 'Afinada intacta',
    desc: 'Conserva exactamente el motor clásico de 7 bloques en mundo cerrado con cobertura integral de todos los partidos, Pizarras, Hitos, Españoles y 4 Claves.',
    highlights: [
      'Estructura clásica de 7 secciones sin búsqueda web ni bloques extra',
      'Máxima velocidad y estilo editorial ya afinado',
      'Caché independiente de v2 para alternar sin mezclar',
    ],
  },
];

const LENGTH_OPTIONS: {
  id: EditorialLengthProfile;
  label: string;
  badge: string;
  desc: string;
}[] = [
  {
    id: 'concise',
    label: 'Concisa y Ágil',
    badge: '3–4 líneas / párrafo',
    desc: 'Ritmo rápido tipo columna flash: síntesis directa y máxima densidad por frase sin perder cifras exactas.',
  },
  {
    id: 'standard',
    label: 'Estándar RadarNBA',
    badge: 'Recomendado',
    desc: 'Equilibrio entre pulso periodístico de The Athletic / Gigantes y análisis táctico estructurado en 8 secciones.',
  },
  {
    id: 'deep',
    label: 'Scouting Profundo',
    badge: 'Detalle extendido',
    desc: 'Mayor desarrollo causal de ajustes por cuarto, lectura de emparejamientos y comparativa de rotaciones.',
  },
];

const FOCUS_OPTIONS: {
  id: EditorialTacticalFocus;
  label: string;
  desc: string;
}[] = [
  {
    id: 'balanced',
    label: 'Equilibrado (Prensa + Pizarra)',
    desc: 'Combina narrativa de partido, claves tácticas y métricas de eficiencia a partes iguales.',
  },
  {
    id: 'tactical_chalkboard',
    label: 'Pizarra y Ajustes Tácticos',
    desc: 'Refuerza bloqueos directos, protección de pintura, espaciado, rebote ofensivo y respuestas defensivas.',
  },
  {
    id: 'narrative_storytelling',
    label: 'Pulso Narrativo y Duelos',
    desc: 'Da prioridad al hilo dramático, puntos de inflexión emocionales y cara a cara de líderes.',
  },
  {
    id: 'advanced_metrics',
    label: 'Analítica Avanzada y Eficiencia',
    desc: 'Pone en primer plano OffRtg, eFG%, TS%, Pace, puntos por posesión y eficiencia en pintura/pérdidas.',
  },
];

const QUICK_CLICHE_SUGGESTIONS: string[] = [
  'paseo militar',
  'sin despeinarse',
  'recital ofensivo',
  'exhibición baloncestística',
  'golpe sobre la mesa',
  'nadie pudo pararlo',
  'a medio gas',
  'dar la campanada',
];

const LOCKED_CORE_GUARDS: { title: string; detail: string }[] = [
  {
    title: 'Rigor Empírico y Citas Verificadas',
    detail: 'Cero cifras inventadas. En v2, las citas post-partido solo se muestran si provienen de AP/ESPN o búsqueda web verificada.',
  },
  {
    title: 'Jerarquía Acta > Prensa',
    detail: 'Si cualquier crónica externa discrepa del Boxscore/PBP oficial, manda siempre el dato oficial del acta.',
  },
  {
    title: 'Estructura Parseable y Caché Aislada',
    detail: 'Etiquetas ===...=== blindadas y claves de caché separadas por versión (v1 vs v2) para alternar sin conflictos.',
  },
  {
    title: 'Career Highs & Buzzer Beaters',
    detail: 'Solo se narran récords de carrera y tiros heroicos verificados en el dossier del servidor.',
  },
  {
    title: 'Pulcritud en Bajas y 6 Faltas',
    detail: 'Separa lesión médica, decisión técnica y expulsiones con cuarto/reloj exacto sin deducciones.',
  },
  {
    title: 'Terminología NBA Natural',
    detail: 'Prohíbe calcos artificiales ("espalda con espalda") y dobles artículos ("Los Los Angeles").',
  },
];

function buildClientPreviewBlock(
  cfg: EditorialConfigValues,
  target: 'game' | 'daily'
): string {
  if (target === 'game' && !cfg.applyToGameChronicles) return '';
  if (target === 'daily' && !cfg.applyToDailyChronicles) return '';

  const lines: string[] = [];
  if (cfg.lengthProfile === 'concise') {
    lines.push(
      '- EXTENSIÓN CONCISA: Redacta párrafos más ágiles y directos (3 a 4 líneas por párrafo) priorizando síntesis y ritmo de lectura rápida sin sacrificar el rigor estadístico.'
    );
  } else if (cfg.lengthProfile === 'deep') {
    lines.push(
      '- ANÁLISIS PROFUNDO: Desarrolla con mayor detalle causal las secuencias tácticas, los ajustes entre cuartos y la lectura comparada de cada duelo, manteniendo párrafos cohesivos y cero relleno.'
    );
  }

  if (cfg.tacticalFocus === 'tactical_chalkboard') {
    lines.push(
      '- FOCO PIZARRA Y TÁCTICA: Pon especial énfasis en emparejamientos, protección de pintura, espaciado, gestión de pérdidas, rebote ofensivo y respuestas defensivas tras parciales.'
    );
  } else if (cfg.tacticalFocus === 'narrative_storytelling') {
    lines.push(
      '- FOCO NARRATIVO Y PULSO PERIODÍSTICO: Da mayor protagonismo al hilo dramático del encuentro, los puntos de inflexión emocionales y el duelo de líderes, integrando las métricas con máxima fluidez literaria.'
    );
  } else if (cfg.tacticalFocus === 'advanced_metrics') {
    lines.push(
      '- FOCO ANALÍTICO Y EFICIENCIA: Prioriza métricas de eficiencia (OffRtg, eFG%, TS%, Pace, puntos por posesión, puntos en pintura y tras pérdida) para explicar cada ventaja competitiva.'
    );
  }

  if (cfg.extraForbiddenCliches.length > 0) {
    const quoted = cfg.extraForbiddenCliches.map((c) => `"${c}"`).join(', ');
    lines.push(
      `- EXPRESIONES Y CLICHÉS ADICIONALES PROHIBIDOS: Evita absolutamente escribir ${quoted}.`
    );
  }

  const trimmed = cfg.customStyleDirectives
    .replace(/={3,}/g, '-')
    .replace(/\|\|/g, '/')
    .trim();
  if (trimmed.length > 0) {
    lines.push(`- DIRECTRIZ DE REDACCIÓN ADICIONAL DEL EDITOR: ${trimmed}`);
  }

  if (lines.length === 0) return '';
  return [
    'PREFERENCIAS EDITORIALES CONFIGURADAS (siempre subordinadas a las reglas de mundo cerrado y a las etiquetas exactas de salida):',
    ...lines,
  ].join('\n');
}

function areEditorialConfigsEqual(
  a: EditorialConfigValues,
  b: EditorialConfigValues
): boolean {
  if (a.gameChronicleVersion !== b.gameChronicleVersion) return false;
  if (a.dailyChronicleVersion !== b.dailyChronicleVersion) return false;
  if (a.lengthProfile !== b.lengthProfile) return false;
  if (a.tacticalFocus !== b.tacticalFocus) return false;
  if (a.customStyleDirectives.trim() !== b.customStyleDirectives.trim()) return false;
  if (a.applyToGameChronicles !== b.applyToGameChronicles) return false;
  if (a.applyToDailyChronicles !== b.applyToDailyChronicles) return false;
  if (a.extraForbiddenCliches.length !== b.extraForbiddenCliches.length) return false;
  return a.extraForbiddenCliches.every((val, idx) => val === b.extraForbiddenCliches[idx]);
}

function formatDateTimeEs(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return 'Aún sin guardar';
  try {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return 'Actualizado';
  }
}

export function AdminEditorialConfigPanel({
  onLockSession,
}: AdminEditorialConfigPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [purgingScope, setPurgingScope] = useState<'all' | 'date' | 'game' | null>(null);

  const [savedConfig, setSavedConfig] = useState<EditorialConfigStored | null>(null);
  const [draft, setDraft] = useState<EditorialConfigValues>(DEFAULT_EDITORIAL_CONFIG_VALUES);
  const [storage, setStorage] = useState<EditorialStorageInfo | null>(null);

  const [invalidateOnSave, setInvalidateOnSave] = useState(false);
  const [clicheInput, setClicheInput] = useState('');
  const [previewTarget, setPreviewTarget] = useState<'game' | 'daily'>('game');

  const [purgeDateInput, setPurgeDateInput] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [purgeEventIdInput, setPurgeEventIdInput] = useState('');
  const [confirmGlobalPurge, setConfirmGlobalPurge] = useState(false);

  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    const res = await fetchAdminEditorialConfig();
    if (res.unauthorized) {
      onLockSession?.();
      setLoading(false);
      return;
    }
    if (res.ok && res.config) {
      setSavedConfig(res.config);
      setDraft({
        gameChronicleVersion: res.config.gameChronicleVersion ?? DEFAULT_EDITORIAL_CONFIG_VALUES.gameChronicleVersion,
        dailyChronicleVersion: res.config.dailyChronicleVersion ?? DEFAULT_EDITORIAL_CONFIG_VALUES.dailyChronicleVersion,
        lengthProfile: res.config.lengthProfile,
        tacticalFocus: res.config.tacticalFocus,
        customStyleDirectives: res.config.customStyleDirectives,
        extraForbiddenCliches: [...res.config.extraForbiddenCliches],
        applyToGameChronicles: res.config.applyToGameChronicles,
        applyToDailyChronicles: res.config.applyToDailyChronicles,
      });
      if (res.storage) setStorage(res.storage);
      setStatusBanner(null);
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error || 'No se pudo cargar la configuración editorial.',
      });
    }
    setLoading(false);
  }, [onLockSession]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const isDirty = useMemo(() => {
    if (!savedConfig) return false;
    return !areEditorialConfigsEqual(draft, savedConfig);
  }, [draft, savedConfig]);

  const livePreviewText = useMemo(
    () => buildClientPreviewBlock(draft, previewTarget),
    [draft, previewTarget]
  );

  const handleAddCliche = useCallback(
    (rawValue?: string) => {
      const candidate = (rawValue ?? clicheInput)
        .replace(/={3,}/g, '-')
        .replace(/\|\|/g, '/')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
      if (!candidate) return;
      setDraft((prev) => {
        if (prev.extraForbiddenCliches.length >= 30) return prev;
        const exists = prev.extraForbiddenCliches.some(
          (item) => item.toLowerCase() === candidate.toLowerCase()
        );
        if (exists) return prev;
        return {
          ...prev,
          extraForbiddenCliches: [...prev.extraForbiddenCliches, candidate],
        };
      });
      if (rawValue === undefined) setClicheInput('');
    },
    [clicheInput]
  );

  const handleRemoveCliche = useCallback((value: string) => {
    setDraft((prev) => ({
      ...prev,
      extraForbiddenCliches: prev.extraForbiddenCliches.filter((item) => item !== value),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatusBanner(null);
    const res = await updateAdminEditorialConfig({
      ...draft,
      invalidateCacheOnSave: invalidateOnSave,
    });
    setSaving(false);
    if (res.unauthorized) {
      onLockSession?.();
      return;
    }
    if (res.ok && res.config) {
      setSavedConfig(res.config);
      setDraft({
        gameChronicleVersion: res.config.gameChronicleVersion ?? DEFAULT_EDITORIAL_CONFIG_VALUES.gameChronicleVersion,
        dailyChronicleVersion: res.config.dailyChronicleVersion ?? DEFAULT_EDITORIAL_CONFIG_VALUES.dailyChronicleVersion,
        lengthProfile: res.config.lengthProfile,
        tacticalFocus: res.config.tacticalFocus,
        customStyleDirectives: res.config.customStyleDirectives,
        extraForbiddenCliches: [...res.config.extraForbiddenCliches],
        applyToGameChronicles: res.config.applyToGameChronicles,
        applyToDailyChronicles: res.config.applyToDailyChronicles,
      });
      if (res.storage) setStorage(res.storage);
      setStatusBanner({
        type: 'success',
        text: invalidateOnSave
          ? `Directivas guardadas y caché global de crónicas invalidada (época #${res.config.cacheEpoch}). Las próximas visitas regenerarán con el nuevo estilo.`
          : 'Directivas editoriales guardadas correctamente. Se aplicarán a todas las nuevas crónicas generadas.',
      });
      setInvalidateOnSave(false);
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error || 'No se pudieron guardar las directivas editoriales.',
      });
    }
  }, [draft, invalidateOnSave, onLockSession]);

  const handleResetDefaults = useCallback(async () => {
    setResetting(true);
    setStatusBanner(null);
    const res = await resetAdminEditorialConfigDefaults();
    setResetting(false);
    if (res.unauthorized) {
      onLockSession?.();
      return;
    }
    if (res.ok && res.config) {
      setSavedConfig(res.config);
      setDraft({
        gameChronicleVersion: res.config.gameChronicleVersion ?? DEFAULT_EDITORIAL_CONFIG_VALUES.gameChronicleVersion,
        dailyChronicleVersion: res.config.dailyChronicleVersion ?? DEFAULT_EDITORIAL_CONFIG_VALUES.dailyChronicleVersion,
        lengthProfile: res.config.lengthProfile,
        tacticalFocus: res.config.tacticalFocus,
        customStyleDirectives: res.config.customStyleDirectives,
        extraForbiddenCliches: [...res.config.extraForbiddenCliches],
        applyToGameChronicles: res.config.applyToGameChronicles,
        applyToDailyChronicles: res.config.applyToDailyChronicles,
      });
      if (res.storage) setStorage(res.storage);
      setStatusBanner({
        type: 'info',
        text: 'Perfil editorial restablecido a los valores estándar recomendados de RadarNBA.',
      });
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error || 'No se pudo restablecer el perfil editorial.',
      });
    }
  }, [onLockSession]);

  const handlePurgeCache = useCallback(
    async (scope: 'all' | 'date' | 'game') => {
      if (scope === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(purgeDateInput.trim())) {
        setStatusBanner({
          type: 'error',
          text: 'Introduce una fecha válida con formato AAAA-MM-DD (ej. 2026-11-24).',
        });
        return;
      }
      if (scope === 'game' && !/^[A-Za-z0-9_-]{4,24}$/.test(purgeEventIdInput.trim())) {
        setStatusBanner({
          type: 'error',
          text: 'Introduce un ID de partido válido (ej. 401705123 o 0022600123).',
        });
        return;
      }

      setPurgingScope(scope);
      setStatusBanner(null);
      const res = await purgeAdminChronicleCache({
        scope,
        date: scope === 'date' ? purgeDateInput.trim() : undefined,
        eventId: scope === 'game' ? purgeEventIdInput.trim() : undefined,
      });
      setPurgingScope(null);
      setConfirmGlobalPurge(false);

      if (res.unauthorized) {
        onLockSession?.();
        return;
      }
      if (res.ok) {
        if (typeof res.cacheEpoch === 'number') {
          setSavedConfig((prev) =>
            prev ? { ...prev, cacheEpoch: res.cacheEpoch!, updatedAt: Date.now() } : prev
          );
        }
        const message =
          scope === 'all'
            ? `Caché global invalidada al instante (nueva época #${res.cacheEpoch ?? ''}). Todas las crónicas se regenerarán con el prompt optimizado al abrirse.`
            : scope === 'date'
              ? `Crónica de la jornada ${purgeDateInput.trim()} purgada de caché. Se regenerará en la próxima consulta.`
              : `Crónica del partido ${purgeEventIdInput.trim()} purgada de caché. Se regenerará al abrir su dossier.`;
        setStatusBanner({ type: 'success', text: message });
      } else {
        setStatusBanner({
          type: 'error',
          text: res.error || 'No se pudo purgar la caché de crónicas.',
        });
      }
    },
    [onLockSession, purgeDateInput, purgeEventIdInput]
  );

  if (loading) {
    return (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-10 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
        <span className="text-sm">Cargando motor editorial y directivas de crónicas IA...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Header & Action Bar */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Crónicas IA & Directivas Editoriales
              </h2>
              {storage && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                    storage.cloudConfigured
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {storage.cloudConfigured ? (
                    <Cloud className="w-3 h-3" />
                  ) : (
                    <HardDrive className="w-3 h-3" />
                  )}
                  {storage.cloudConfigured
                    ? 'Upstash Redis · Persistente en Vercel'
                    : 'Disco local · Modo desarrollo'}
                </span>
              )}
              {isDirty && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/15 text-orange-300 border border-orange-500/30">
                  Cambios sin guardar
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              Ajusta el tono, la extensión, el enfoque táctico y el glosario de expresiones prohibidas sin
              tocar el código. Las reglas de <strong className="text-slate-200">Mundo Cerrado</strong> y
              las etiquetas estructurales del parser permanecen blindadas en servidor para evitar roturas
              o alucinaciones.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 pt-1">
              <span>
                Última actualización:{' '}
                <strong className="text-slate-200">
                  {formatDateTimeEs(savedConfig?.updatedAt ?? 0)}
                </strong>
              </span>
              <span>
                Época de caché:{' '}
                <strong className="text-sky-300 font-mono">
                  e{savedConfig?.cacheEpoch ?? 1}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={resetting || saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1120] hover:bg-[#1E293B] border border-[#1E293B] text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {resetting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>Restablecer estándar</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || resetting || (!isDirty && !invalidateOnSave)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 text-xs font-bold shadow-sm transition-colors disabled:opacity-45"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Guardar directivas</span>
            </button>
          </div>
        </div>

        {/* Save-time Cache Invalidation Checkbox */}
        <div className="mt-4 pt-3 border-t border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={invalidateOnSave}
              onChange={(e) => setInvalidateOnSave(e.target.checked)}
              className="w-4 h-4 rounded border-[#334155] bg-[#0B1120] text-orange-500 focus:ring-orange-500/40"
            />
            <span>
              Invalidar la caché de crónicas automáticamente al guardar (fuerza regeneración en la
              próxima apertura)
            </span>
          </label>
          <button
            type="button"
            onClick={() => void loadConfig()}
            disabled={loading || saving}
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors self-start sm:self-auto"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Recargar desde servidor</span>
          </button>
        </div>

        {statusBanner && (
          <div
            className={`mt-4 rounded-lg px-3.5 py-2.5 border text-xs flex items-start gap-2.5 ${
              statusBanner.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : statusBanner.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
            }`}
          >
            {statusBanner.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            ) : statusBanner.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            ) : (
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
            )}
            <span className="leading-relaxed">{statusBanner.text}</span>
          </div>
        )}
      </div>

      {/* Section 00: Default Chronicle Version Selectors (Game vs Daily) */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              00 · Versión por Defecto de Crónicas (Partidos y Jornadas)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Partido: <strong className="text-orange-300">{draft.gameChronicleVersion === 'v2_tactical' ? 'v2 Táctica' : 'v1 Clásica'}</strong>
            {' · '}
            Jornada: <strong className="text-sky-300">{draft.dailyChronicleVersion === 'v2_tactical' ? 'v2 Táctica' : 'v1 Clásica'}</strong>
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Elige qué versión del motor editorial se usa por defecto al abrir una crónica de partido o de jornada. Cada versión
          mantiene su propia caché aislada para que puedas alternar entre <strong className="text-slate-200">v1</strong> y{' '}
          <strong className="text-slate-200">v2</strong> en cualquier momento sin perder ni mezclar las crónicas ya afinadas.
        </p>

        <div className="space-y-5">
          {/* Individual Games Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-200">
                Crónicas de Partido (Individuales)
              </p>
              <span className="text-[11px] text-slate-400">2 versiones disponibles</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {GAME_VERSION_OPTIONS.map((opt) => {
                const active = draft.gameChronicleVersion === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, gameChronicleVersion: opt.id }))
                    }
                    className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                      active
                        ? 'bg-orange-500/10 border-orange-500/60 shadow-sm'
                        : 'bg-[#0B1120] border-[#1E293B] hover:border-slate-600'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-bold ${
                            active ? 'text-orange-300' : 'text-slate-100'
                          }`}
                        >
                          {opt.label}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-semibold ${
                            active ? 'text-orange-300' : 'text-slate-500'
                          }`}
                        >
                          {active ? 'Activa' : opt.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {opt.desc}
                      </p>
                    </div>
                    <ul className="space-y-1 border-t border-[#1E293B] pt-2.5 text-[11px] text-slate-400">
                      {opt.highlights.map((item) => (
                        <li key={item} className="flex items-start gap-1.5">
                          <Check
                            className={`w-3 h-3 shrink-0 mt-0.5 ${
                              active ? 'text-orange-400' : 'text-slate-500'
                            }`}
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Daily Chronicles Selector */}
          <div className="space-y-2.5 pt-4 border-t border-[#1E293B]/80">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-200">
                Crónicas de Jornada (Resumen Diario)
              </p>
              <span className="text-[11px] text-slate-400">2 versiones disponibles</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {DAILY_VERSION_OPTIONS.map((opt) => {
                const active = draft.dailyChronicleVersion === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, dailyChronicleVersion: opt.id }))
                    }
                    className={`w-full text-left p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                      active
                        ? 'bg-sky-500/10 border-sky-500/60 shadow-sm'
                        : 'bg-[#0B1120] border-[#1E293B] hover:border-slate-600'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-bold ${
                            active ? 'text-sky-300' : 'text-slate-100'
                          }`}
                        >
                          {opt.label}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-semibold ${
                            active ? 'text-sky-300' : 'text-slate-500'
                          }`}
                        >
                          {active ? 'Activa' : opt.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {opt.desc}
                      </p>
                    </div>
                    <ul className="space-y-1 border-t border-[#1E293B] pt-2.5 text-[11px] text-slate-400">
                      {opt.highlights.map((item) => (
                        <li key={item} className="flex items-start gap-1.5">
                          <Check
                            className={`w-3 h-3 shrink-0 mt-0.5 ${
                              active ? 'text-sky-400' : 'text-slate-500'
                            }`}
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 01: Length Profile, Tactical Focus & Scope */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              01 · Extensión, Enfoque Táctico y Alcance
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none bg-[#0B1120] border border-[#1E293B] px-2.5 py-1.5 rounded-lg">
              <input
                type="checkbox"
                checked={draft.applyToGameChronicles}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, applyToGameChronicles: e.target.checked }))
                }
                className="w-3.5 h-3.5 rounded border-[#334155] bg-[#0B1120] text-orange-500"
              />
              <span>Crónicas de partido</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none bg-[#0B1120] border border-[#1E293B] px-2.5 py-1.5 rounded-lg">
              <input
                type="checkbox"
                checked={draft.applyToDailyChronicles}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, applyToDailyChronicles: e.target.checked }))
                }
                className="w-3.5 h-3.5 rounded border-[#334155] bg-[#0B1120] text-orange-500"
              />
              <span>Revista de jornada</span>
            </label>
          </div>
        </div>

        {/* Length Profile */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-300">
            Densidad y extensión de párrafos
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {LENGTH_OPTIONS.map((opt) => {
              const active = draft.lengthProfile === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, lengthProfile: opt.id }))}
                  className={`text-left p-3.5 rounded-xl border transition-all ${
                    active
                      ? 'bg-orange-500/12 border-orange-500/60 shadow-sm'
                      : 'bg-[#0B1120] border-[#1E293B] hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`text-xs font-bold ${
                        active ? 'text-orange-300' : 'text-slate-100'
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        active
                          ? 'bg-orange-500 text-slate-950'
                          : 'bg-[#131C2E] text-slate-400 border border-[#1E293B]'
                      }`}
                    >
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tactical Focus */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-300">
            Enfoque editorial predominante
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FOCUS_OPTIONS.map((opt) => {
              const active = draft.tacticalFocus === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, tacticalFocus: opt.id }))}
                  className={`text-left p-3.5 rounded-xl border transition-all ${
                    active
                      ? 'bg-sky-500/10 border-sky-500/60 shadow-sm'
                      : 'bg-[#0B1120] border-[#1E293B] hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`text-xs font-bold ${
                        active ? 'text-sky-300' : 'text-slate-100'
                      }`}
                    >
                      {opt.label}
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 02: Custom Directives & Forbidden Clichés */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Custom Directives */}
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                02A · Directriz Editorial Personalizada
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {draft.customStyleDirectives.length} / 900
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Añade matices de redacción opcionales (ej. «Destaca el rendimiento en el tercer cuarto
            si hubo parcial decisivo» o «Mantén tono más sobrio en victorias por más de 25 puntos»).
            Se sanean automáticamente delimitadores como <code className="text-slate-300">===</code>{' '}
            o <code className="text-slate-300">||</code>.
          </p>
          <textarea
            value={draft.customStyleDirectives}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                customStyleDirectives: e.target.value.slice(0, 900),
              }))
            }
            rows={5}
            maxLength={900}
            placeholder="Ej.: Da un énfasis especial al impacto de la segunda unidad cuando el banquillo aporte más de 35 puntos, y evita dramatizar en exceso los partidos decididos antes del último cuarto."
            className="w-full rounded-lg bg-[#0B1120] border border-[#1E293B] focus:border-orange-500/60 focus:outline-none px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 leading-relaxed resize-y"
          />
        </div>

        {/* Forbidden Clichés */}
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                02B · Lista Negra Extra de Clichés
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {draft.extraForbiddenCliches.length} / 30
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Se suman a los clichés ya vetados por defecto («En conclusión», «Cabe destacar», «Sin
            lugar a dudas», «espalda con espalda»).
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddCliche();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={clicheInput}
              onChange={(e) => setClicheInput(e.target.value.slice(0, 60))}
              placeholder="Escribe una expresión a evitar (máx. 60 caracteres)..."
              className="flex-1 min-w-0 rounded-lg bg-[#0B1120] border border-[#1E293B] focus:border-orange-500/60 focus:outline-none px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={!clicheInput.trim() || draft.extraForbiddenCliches.length >= 30}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-100 text-xs font-semibold transition-colors disabled:opacity-40 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir</span>
            </button>
          </form>

          {/* Active Cliché Tags */}
          <div className="min-h-[54px] rounded-lg bg-[#0B1120] border border-[#1E293B] p-2.5 flex flex-wrap gap-1.5 items-start">
            {draft.extraForbiddenCliches.length === 0 ? (
              <span className="text-[11px] text-slate-500 italic px-1 py-0.5">
                Sin expresiones adicionales bloqueadas todavía.
              </span>
            ) : (
              draft.extraForbiddenCliches.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/12 border border-rose-500/30 text-rose-200 text-[11px] font-medium"
                >
                  <span>«{tag}»</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCliche(tag)}
                    className="text-rose-300/80 hover:text-white transition-colors"
                    aria-label={`Eliminar ${tag}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Quick Add Suggestions */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-slate-400">Sugerencias rápidas (1 clic):</span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_CLICHE_SUGGESTIONS.map((s) => {
                const alreadyAdded = draft.extraForbiddenCliches.some(
                  (item) => item.toLowerCase() === s.toLowerCase()
                );
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={alreadyAdded || draft.extraForbiddenCliches.length >= 30}
                    onClick={() => handleAddCliche(s)}
                    className="px-2 py-0.5 rounded-md text-[11px] border border-[#1E293B] bg-[#0B1120] hover:border-orange-500/40 hover:text-orange-300 text-slate-400 transition-colors disabled:opacity-35"
                  >
                    + {s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 03: Live Prompt Injection Preview & Locked Core Safeguards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                03A · Vista Previa del Bloque Inyectado
              </h3>
            </div>
            <div className="inline-flex bg-[#0B1120] border border-[#1E293B] p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => setPreviewTarget('game')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  previewTarget === 'game'
                    ? 'bg-orange-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Crónica Partido
              </button>
              <button
                type="button"
                onClick={() => setPreviewTarget('daily')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  previewTarget === 'daily'
                    ? 'bg-orange-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Revista Jornada
              </button>
            </div>
          </div>

          <pre className="rounded-lg bg-[#0B1120] border border-[#1E293B] p-3.5 text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed min-h-[140px] max-h-[260px] overflow-y-auto">
            {livePreviewText ||
              '// Sin directivas adicionales activas para este modo.\n// Se aplicará únicamente el prompt base optimizado de RadarNBA.'}
          </pre>
        </div>

        <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                03B · Núcleo Editorial Blindado en Código
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <Lock className="w-3 h-3" />
              Protegido
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {LOCKED_CORE_GUARDS.map((guard) => (
              <div
                key={guard.title}
                className="rounded-lg bg-[#0B1120] border border-[#1E293B] p-2.5 space-y-1"
              >
                <div className="text-xs font-semibold text-emerald-300">{guard.title}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{guard.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 04: Cache Purge & On-Demand Regeneration */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex items-center gap-2 border-b border-[#1E293B] pb-3">
          <Database className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            04 · Caché y Regeneración de Crónicas
          </h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Las crónicas generadas se cachean para carga instantánea y ahorro de cuota Gemini. Si
          cambias las directivas o quieres reescribir una jornada/partido concreto con el motor actual,
          puedes purgar la caché de forma selectiva o global al instante.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Purge by Date */}
          <div className="rounded-xl bg-[#0B1120] border border-[#1E293B] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
              <CalendarDays className="w-4 h-4 text-sky-400" />
              <span>Purgar Revista de una Jornada</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Borra solo la crónica general de un día concreto para regenerarla al consultarla.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={purgeDateInput}
                onChange={(e) => setPurgeDateInput(e.target.value)}
                className="flex-1 min-w-0 rounded-lg bg-[#131C2E] border border-[#1E293B] px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-500/60 focus:outline-none"
              />
              <button
                type="button"
                disabled={purgingScope !== null}
                onClick={() => void handlePurgeCache('date')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
              >
                {purgingScope === 'date' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Purgar día</span>
              </button>
            </div>
          </div>

          {/* Purge by Game Event ID */}
          <div className="rounded-xl bg-[#0B1120] border border-[#1E293B] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
              <FileText className="w-4 h-4 text-orange-400" />
              <span>Purgar Crónica de un Partido</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Borra el dossier de un único encuentro indicando su ID (visible en la URL del acta).
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={purgeEventIdInput}
                onChange={(e) => setPurgeEventIdInput(e.target.value.slice(0, 24))}
                placeholder="Ej. 401705123"
                className="flex-1 min-w-0 rounded-lg bg-[#131C2E] border border-[#1E293B] px-2.5 py-1.5 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none"
              />
              <button
                type="button"
                disabled={purgingScope !== null || !purgeEventIdInput.trim()}
                onClick={() => void handlePurgeCache('game')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/40 text-orange-300 text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
              >
                {purgingScope === 'game' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Purgar</span>
              </button>
            </div>
          </div>

          {/* Global Atomic Purge */}
          <div className="rounded-xl bg-[#0B1120] border border-rose-500/25 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-300">
              <RefreshCw className="w-4 h-4 text-rose-400" />
              <span>Invalidación Global Atómica</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Incrementa la época de caché global para regenerar todas las crónicas futuras con el
              estilo vigente.
            </p>
            {!confirmGlobalPurge ? (
              <button
                type="button"
                disabled={purgingScope !== null}
                onClick={() => setConfirmGlobalPurge(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/12 hover:bg-rose-500/20 border border-rose-500/35 text-rose-300 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Invalidar toda la caché de crónicas</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={purgingScope !== null}
                  onClick={() => void handlePurgeCache('all')}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {purgingScope === 'all' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Confirmar purga</span>
                </button>
                <button
                  type="button"
                  disabled={purgingScope !== null}
                  onClick={() => setConfirmGlobalPurge(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#131C2E] hover:bg-[#1E293B] border border-[#1E293B] text-slate-300 text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
