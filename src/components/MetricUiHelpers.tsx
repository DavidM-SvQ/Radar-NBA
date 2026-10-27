import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Info } from 'lucide-react';
import {
  evaluateVsLeague,
  resolveMetricHelp,
  type ColumnHelpEntry,
  type MetricBenchmark,
} from '../utils/humanize';

interface MetricInfoTooltipProps {
  helpKey?: string;
  customHelp?: ColumnHelpEntry;
  fallbackTitle?: string;
  align?: 'left' | 'right';
  iconClassName?: string;
}

export function MetricInfoTooltip({
  helpKey,
  customHelp,
  fallbackTitle,
  align = 'right',
  iconClassName = 'w-3.5 h-3.5',
}: MetricInfoTooltipProps) {
  const help = customHelp || resolveMetricHelp(helpKey, fallbackTitle);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    flipAbove: boolean;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = () => {
    if (!btnRef.current || typeof window === 'undefined') return;
    const rect = btnRef.current.getBoundingClientRect();
    const tooltipWidth = Math.min(308, window.innerWidth - 24);
    let left = align === 'right' ? rect.right - tooltipWidth : rect.left;
    left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, left));

    const spaceBelow = window.innerHeight - rect.bottom;
    const flipAbove = spaceBelow < 240 && rect.top > spaceBelow;
    const rawTop = flipAbove ? rect.top - 8 : rect.bottom + 8;
    const top = flipAbove
      ? Math.max(16, rawTop)
      : Math.min(window.innerHeight - 24, rawTop);

    setCoords({ top, left, flipAbove });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (
        (target && btnRef.current?.contains(target)) ||
        (target && popRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);

    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside, { passive: true });
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  if (!help) return null;

  const canHover = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`Información sobre ${help.title}`}
        aria-expanded={open}
        onMouseEnter={() => {
          if (!canHover()) return;
          updatePosition();
          setOpen(true);
        }}
        onMouseLeave={() => {
          if (!canHover()) return;
          setOpen(false);
        }}
        onFocus={() => {
          if (!canHover()) return;
          updatePosition();
          setOpen(true);
        }}
        onBlur={() => {
          if (!canHover()) return;
          setOpen(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          updatePosition();
          setOpen((prev) => !prev);
        }}
        className="inline-flex items-center justify-center p-1.5 -m-1 sm:p-0.5 sm:m-0 rounded-md text-slate-400 sm:text-slate-500 hover:text-orange-400 active:text-orange-400 focus:outline-none focus-visible:text-orange-400 transition-colors shrink-0 touch-manipulation"
      >
        <Info className={iconClassName} />
      </button>

      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              top: coords.top,
              left: coords.left,
              transform: coords.flipAbove ? 'translateY(-100%)' : undefined,
            }}
            className="fixed z-[95] w-[308px] max-w-[calc(100vw-24px)] max-h-[75vh] overflow-y-auto p-3.5 rounded-xl bg-[#0B1120]/98 backdrop-blur-md border border-[#283548] shadow-2xl text-left pointer-events-auto sm:pointer-events-none"
          >
            <p className="text-xs font-semibold text-orange-400 leading-snug">
              {help.title}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-200 font-normal whitespace-normal">
              <span className="text-slate-400 font-medium">Significado: </span>
              {help.simpleDesc}
            </p>
            <p className="mt-1.5 pt-1.5 border-t border-[#1E293B] text-[11px] leading-relaxed text-slate-200 font-normal whitespace-normal">
              <span className="text-orange-300 font-medium">
                Cómo se calcula:{' '}
              </span>
              <span className="font-mono text-[10.5px] text-slate-200">
                {help.calculation}
              </span>
            </p>
            {help.benchmarkText && (
              <p className="mt-1.5 pt-1.5 border-t border-[#1E293B] text-[11px] leading-snug text-slate-400 font-normal whitespace-normal">
                <span className="text-slate-300 font-medium">
                  Referencia NBA:{' '}
                </span>
                {help.benchmarkText}
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

interface MetricLabelWithInfoProps {
  label: ReactNode;
  helpKey?: string;
  customHelp?: ColumnHelpEntry;
  fallbackTitle?: string;
  align?: 'left' | 'right';
  className?: string;
  iconClassName?: string;
}

export function MetricLabelWithInfo({
  label,
  helpKey,
  customHelp,
  fallbackTitle,
  align = 'left',
  className = '',
  iconClassName = 'w-3.5 h-3.5',
}: MetricLabelWithInfoProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span>{label}</span>
      <MetricInfoTooltip
        helpKey={helpKey}
        customHelp={customHelp}
        fallbackTitle={
          fallbackTitle || (typeof label === 'string' ? label : undefined)
        }
        align={align}
        iconClassName={iconClassName}
      />
    </span>
  );
}

interface ColumnHelpHeaderProps {
  label: string;
  helpKey?: string;
  customHelp?: ColumnHelpEntry;
  align?: 'left' | 'right';
  sortable?: boolean;
  activeSort?: boolean;
  sortAsc?: boolean;
  onSort?: () => void;
}

export function ColumnHelpHeader({
  label,
  helpKey,
  customHelp,
  align = 'right',
  sortable = false,
  activeSort = false,
  sortAsc = false,
  onSort,
}: ColumnHelpHeaderProps) {
  return (
    <div
      className={`inline-flex items-center gap-1 whitespace-nowrap ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      {sortable && onSort ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-1 hover:text-slate-200 transition-colors whitespace-nowrap focus:outline-none focus-visible:text-orange-400"
        >
          <span>{label}</span>
          {activeSort &&
            (sortAsc ? (
              <ArrowUp className="w-3 h-3 text-orange-400 shrink-0" />
            ) : (
              <ArrowDown className="w-3 h-3 text-orange-400 shrink-0" />
            ))}
        </button>
      ) : (
        <span>{label}</span>
      )}

      <MetricInfoTooltip
        helpKey={helpKey}
        customHelp={customHelp}
        fallbackTitle={label}
        align={align}
        iconClassName="w-3 h-3"
      />
    </div>
  );
}

interface NbaComparisonBarProps {
  value: number;
  benchmark: MetricBenchmark;
  compact?: boolean;
  showValueLabel?: string;
}

export function NbaComparisonBar({
  value,
  benchmark,
  compact = false,
  showValueLabel,
}: NbaComparisonBarProps) {
  const evalRes = evaluateVsLeague(value, benchmark);

  return (
    <div className={compact ? 'min-w-[138px]' : 'w-full'}>
      <div className="flex items-center justify-between gap-2 text-[11px] mb-1 whitespace-nowrap">
        <span className={`font-medium ${evalRes.textClass}`}>
          {showValueLabel ? `${showValueLabel} · ` : ''}
          {evalRes.tierLabel}
        </span>
        <span className="font-mono tabular-nums text-slate-400">
          Media NBA {evalRes.avgFormatted}
        </span>
      </div>
      <div className="relative h-2 bg-[#0B1120] border border-[#1E293B] rounded overflow-hidden">
        <div
          className={`h-full rounded-l transition-transform ${evalRes.barClass}`}
          style={{ width: `${evalRes.pct}%` }}
        />
        <div
          title={`Media de la NBA: ${evalRes.avgFormatted}`}
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-slate-100/80"
        />
      </div>
    </div>
  );
}
