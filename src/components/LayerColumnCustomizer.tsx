import { useState } from 'react';
import { Check, Columns3, Loader2, RotateCcw } from 'lucide-react';

export interface CustomizerColumnOption {
  key: string;
  label: string;
  group?: string;
}

interface LayerColumnCustomizerProps {
  columns: CustomizerColumnOption[];
  visibleKeys: string[];
  defaultKeys: string[];
  onChangeVisibleKeys: (nextKeys: string[]) => void;
  isLoading?: boolean;
  loadingLabel?: string;
  errorMessage?: string | null;
  minVisible?: number;
  title?: string;
}

export function LayerColumnCustomizer({
  columns,
  visibleKeys,
  defaultKeys,
  onChangeVisibleKeys,
  isLoading = false,
  loadingLabel = 'Cargando métricas NBA.com...',
  errorMessage = null,
  minVisible = 1,
  title = 'Personalizar métricas',
}: LayerColumnCustomizerProps) {
  const [open, setOpen] = useState(false);

  const visibleSet = new Set(visibleKeys);

  const handleToggle = (key: string) => {
    if (visibleSet.has(key)) {
      if (visibleKeys.length <= minVisible) return;
      onChangeVisibleKeys(visibleKeys.filter((k) => k !== key));
    } else {
      // Preserve definition order
      const nextSet = new Set([...visibleKeys, key]);
      onChangeVisibleKeys(columns.map((c) => c.key).filter((k) => nextSet.has(k)));
    }
  };

  const handleSelectAll = () => {
    onChangeVisibleKeys(columns.map((c) => c.key));
  };

  const handleResetDefaults = () => {
    const defSet = new Set(defaultKeys);
    const ordered = columns.map((c) => c.key).filter((k) => defSet.has(k));
    onChangeVisibleKeys(ordered.length > 0 ? ordered : columns.slice(0, 6).map((c) => c.key));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              open
                ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                : 'bg-[#0B1120] border-[#1E293B] text-slate-200 hover:text-white hover:border-[#283548]'
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>
              {title} ({visibleKeys.length}/{columns.length})
            </span>
          </button>

          {isLoading && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-orange-500/10 border border-orange-500/30 text-orange-300 rounded-md">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{loadingLabel}</span>
            </span>
          )}

          {errorMessage && !isLoading && (
            <span className="inline-flex items-center px-2.5 py-1 text-[11px] font-medium bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-md">
              {errorMessage}
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="bg-[#0B1120] border border-[#283548] rounded-lg p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              Pulsa para añadir o quitar columnas en esta capa ({visibleKeys.length} de {columns.length} activas):
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-[#131C2E] hover:bg-[#1E293B] border border-[#1E293B] rounded text-slate-300 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Por defecto ({defaultKeys.length})</span>
              </button>
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2 py-1 text-[11px] bg-[#131C2E] hover:bg-[#1E293B] border border-[#1E293B] rounded text-orange-300 transition-colors whitespace-nowrap"
              >
                Mostrar todas ({columns.length})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {columns.map((col) => {
              const active = visibleSet.has(col.key);
              const lockedLast = active && visibleKeys.length <= minVisible;
              return (
                <button
                  key={col.key}
                  type="button"
                  disabled={lockedLast}
                  onClick={() => handleToggle(col.key)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-orange-500 text-slate-950 border-orange-500 font-semibold'
                      : 'bg-[#131C2E] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                  } ${lockedLast ? 'opacity-80 cursor-not-allowed' : ''}`}
                >
                  {active && <Check className="w-3 h-3 shrink-0" />}
                  <span>{col.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
