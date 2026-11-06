import { useState } from 'react';
import { Check, Copy, ImageDown, Loader2 } from 'lucide-react';
import {
  canCopyImageToClipboard,
  copyPngBlobToClipboard,
  downloadPngBlob,
} from '../utils/exportImageCard';

interface ExportImageButtonProps {
  onBuildImage: () => Promise<{ blob: Blob; filename: string }>;
  label?: string;
  compactOnMobile?: boolean;
  disabled?: boolean;
  title?: string;
}

export function ExportImageButton({
  onBuildImage,
  label = 'Exportar PNG',
  compactOnMobile = true,
  disabled = false,
  title = 'Descargar imagen PNG de alta resolución lista para compartir',
}: ExportImageButtonProps) {
  const [status, setStatus] = useState<
    'idle' | 'generating' | 'downloaded' | 'copied'
  >('idle');

  const supportsClipboardImage = canCopyImageToClipboard();

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
      const { blob, filename } = await onBuildImage();
      const copied = await copyPngBlobToClipboard(blob);
      if (copied) {
        setStatus('copied');
      } else {
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

      {supportsClipboardImage && (
        <button
          type="button"
          disabled={disabled || status === 'generating'}
          onClick={() => void handleCopyClipboard()}
          title="Copiar imagen al portapapeles para pegar en WhatsApp, Discord o X"
          aria-label="Copiar imagen al portapapeles"
          className="min-h-[34px] px-2 py-1.5 border-l border-[#1E293B] hover:bg-[#182338] text-slate-400 hover:text-orange-300 transition-colors disabled:opacity-45 flex items-center justify-center shrink-0"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
