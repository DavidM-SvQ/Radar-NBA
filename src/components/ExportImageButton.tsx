import { useEffect, useState } from 'react';
import { Check, Copy, ImageDown, Loader2, Sparkles } from 'lucide-react';
import {
  EDITORIAL_VERDICT_TOGGLE_EVENT,
  canCopyImageToClipboard,
  copyPngPromiseToClipboard,
  downloadPngBlob,
  getExportEditorialVerdictEnabled,
  setExportEditorialVerdictEnabled,
} from '../utils/exportImageCard';

interface ExportImageButtonProps {
  onBuildImage: () => Promise<{ blob: Blob; filename: string }>;
  label?: string;
  copyLabel?: string;
  showCopyLabel?: boolean;
  compactOnMobile?: boolean;
  disabled?: boolean;
  title?: string;
  /** Permite ocultar el selector de pie editorial en contextos muy reducidos (por defecto: true) */
  showEditorialToggle?: boolean;
}

export function ExportImageButton({
  onBuildImage,
  label = 'Exportar PNG',
  copyLabel = 'Copiar imagen',
  showCopyLabel = false,
  compactOnMobile = true,
  disabled = false,
  title = 'Descargar imagen PNG de alta resolución lista para compartir',
  showEditorialToggle = true,
}: ExportImageButtonProps) {
  const [status, setStatus] = useState<
    'idle' | 'generating' | 'downloaded' | 'copied'
  >('idle');
  const [includeVerdict, setIncludeVerdict] = useState<boolean>(() =>
    getExportEditorialVerdictEnabled()
  );

  useEffect(() => {
    const handleSync = () => {
      setIncludeVerdict(getExportEditorialVerdictEnabled());
    };
    window.addEventListener(EDITORIAL_VERDICT_TOGGLE_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(EDITORIAL_VERDICT_TOGGLE_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const supportsClipboardImage = canCopyImageToClipboard();

  const handleToggleVerdict = () => {
    const next = !includeVerdict;
    setIncludeVerdict(next);
    setExportEditorialVerdictEnabled(next);
  };

  const handleDownload = async () => {
    if (disabled || status === 'generating') return;
    setStatus('generating');
    try {
      const { blob, filename } = await onBuildImage();
      downloadPngBlob(blob, filename);
      setStatus('downloaded');
      window.setTimeout(() => setStatus('idle'), 2200);
    } catch {
      setStatus('idle');
    }
  };

  const handleCopyClipboard = async () => {
    if (disabled || status === 'generating') return;
    setStatus('generating');
    try {
      const buildPromise = onBuildImage();
      const copied = await copyPngPromiseToClipboard(
        buildPromise.then((res) => res.blob)
      );
      if (copied) {
        setStatus('copied');
      } else {
        const { blob, filename } = await buildPromise;
        downloadPngBlob(blob, filename);
        setStatus('downloaded');
      }
      window.setTimeout(() => setStatus('idle'), 2200);
    } catch {
      setStatus('idle');
    }
  };

  const isSuccess = status === 'downloaded' || status === 'copied';

  return (
    <div className="inline-flex items-center rounded-lg overflow-hidden border border-[#1E293B] bg-[#131C2E] shrink-0">
      <button
        type="button"
        disabled={disabled || status === 'generating'}
        onClick={() => void handleDownload()}
        title={title}
        aria-label={title}
        className={`min-h-[34px] inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 ${
          isSuccess
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'hover:bg-[#182338] text-slate-200 hover:text-white'
        }`}
      >
        {status === 'generating' ? (
          <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin shrink-0" />
        ) : isSuccess ? (
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <ImageDown className="w-3.5 h-3.5 text-orange-400 shrink-0" />
        )}
        <span className={compactOnMobile ? 'hidden sm:inline' : ''}>
          {status === 'downloaded'
            ? 'PNG descargado'
            : status === 'copied'
            ? 'Imagen copiada'
            : label}
        </span>
        {compactOnMobile && (
          <span className="sm:hidden">
            {status === 'downloaded'
              ? 'Listo'
              : status === 'copied'
              ? 'Copiada'
              : 'PNG'}
          </span>
        )}
      </button>

      {showEditorialToggle && (
        <button
          type="button"
          disabled={disabled || status === 'generating'}
          onClick={handleToggleVerdict}
          aria-pressed={includeVerdict}
          title={
            includeVerdict
              ? 'Pie editorial ACTIVADO: incluye veredicto/insight de 1 línea y firma radar-nba.vercel.app en la imagen exportada (clic para desactivar)'
              : 'Pie editorial DESACTIVADO: exporta el gráfico limpio sin bloque de veredicto (clic para activar)'
          }
          aria-label="Alternar pie editorial con veredicto en la imagen exportada"
          className={`min-h-[34px] px-2 py-1.5 border-l border-[#1E293B] text-[11px] font-medium transition-colors disabled:opacity-45 inline-flex items-center gap-1 shrink-0 ${
            includeVerdict
              ? 'bg-orange-500/12 text-orange-300 hover:bg-orange-500/20'
              : 'text-slate-500 hover:bg-[#182338] hover:text-slate-300'
          }`}
        >
          <Sparkles
            className={`w-3 h-3 shrink-0 ${
              includeVerdict ? 'text-orange-400' : 'text-slate-500'
            }`}
          />
          <span className="hidden md:inline">Veredicto</span>
        </button>
      )}

      {supportsClipboardImage && (
        <button
          type="button"
          disabled={disabled || status === 'generating'}
          onClick={() => void handleCopyClipboard()}
          title="Copiar imagen al portapapeles para pegar en WhatsApp, Discord o X"
          aria-label="Copiar imagen al portapapeles"
          className={`min-h-[34px] py-1.5 border-l border-[#1E293B] hover:bg-[#182338] transition-colors disabled:opacity-45 inline-flex items-center justify-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
            showCopyLabel ? 'px-2.5 sm:px-3' : 'px-2'
          } ${
            status === 'copied'
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'text-slate-300 hover:text-orange-300'
          }`}
        >
          {status === 'copied' ? (
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          )}
          {showCopyLabel && (
            <span>{status === 'copied' ? 'Copiada' : copyLabel}</span>
          )}
        </button>
      )}
    </div>
  );
}

