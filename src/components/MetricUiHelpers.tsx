import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, FileText, Info } from 'lucide-react';
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
        className="inline-flex items-center justify-center p-1.5 sm:p-0.5 rounded-md text-slate-400 sm:text-slate-500 hover:text-orange-400 active:text-orange-400 focus:outline-none focus-visible:text-orange-400 transition-colors shrink-0 touch-manipulation"
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
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  activeSort?: boolean;
  sortAsc?: boolean;
  onSort?: () => void;
  compact?: boolean;
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
  compact = false,
}: ColumnHelpHeaderProps) {
  return (
    <div
      className={`inline-flex items-center gap-1 whitespace-nowrap ${
        align === 'right'
          ? 'justify-end'
          : align === 'center'
          ? 'justify-center'
          : 'justify-start'
      }`}
    >
      {sortable && onSort ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSort();
          }}
          className={`inline-flex items-center gap-1 transition-colors whitespace-nowrap focus:outline-none focus-visible:text-orange-400 ${
            activeSort
              ? 'text-orange-400 font-semibold'
              : 'hover:text-slate-100'
          }`}
        >
          <span>{label}</span>
          {activeSort ? (
            sortAsc ? (
              <ArrowUp className="w-3 h-3 text-orange-400 shrink-0" />
            ) : (
              <ArrowDown className="w-3 h-3 text-orange-400 shrink-0" />
            )
          ) : !compact ? (
            <ArrowUpDown className="w-2.5 h-2.5 text-slate-500/60 group-hover/th:text-orange-400/80 transition-colors shrink-0" />
          ) : null}
        </button>
      ) : (
        <span>{label}</span>
      )}

      <MetricInfoTooltip
        helpKey={helpKey}
        customHelp={customHelp}
        fallbackTitle={label}
        align={align === 'left' ? 'left' : 'right'}
        iconClassName="w-3 h-3"
      />
    </div>
  );
}

export interface SortableThProps {
  label: ReactNode;
  active: boolean;
  asc: boolean;
  onSort: () => void;
  align?: 'left' | 'center' | 'right';
  helpKey?: string;
  customHelp?: ColumnHelpEntry;
  fallbackTitle?: string;
  className?: string;
  title?: string;
  compact?: boolean;
  colSpan?: number;
}

export function SortableTh({
  label,
  active,
  asc,
  onSort,
  align = 'right',
  helpKey,
  customHelp,
  fallbackTitle,
  className = 'py-2.5 px-3',
  title,
  compact = false,
  colSpan,
}: SortableThProps) {
  const showTooltip = Boolean(helpKey || customHelp);

  return (
    <th
      scope="col"
      colSpan={colSpan}
      aria-sort={active ? (asc ? 'ascending' : 'descending') : 'none'}
      tabIndex={0}
      title={title || 'Pulsa para ordenar por esta columna'}
      onClick={onSort}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort();
        }
      }}
      className={`group/th cursor-pointer select-none transition-colors hover:bg-[#162033]/90 focus:outline-none focus-visible:bg-[#162033] ${
        align === 'right'
          ? 'text-right'
          : align === 'center'
          ? 'text-center'
          : 'text-left'
      } ${
        active
          ? 'text-orange-400 font-semibold bg-[#162033]/50'
          : 'text-slate-400 hover:text-slate-100 font-medium'
      } ${className}`}
    >
      <div
        className={`inline-flex items-center gap-1 whitespace-nowrap max-w-full ${
          align === 'right'
            ? 'justify-end'
            : align === 'center'
            ? 'justify-center'
            : 'justify-start'
        }`}
      >
        <span className="truncate">{label}</span>
        {active ? (
          asc ? (
            <ArrowUp className="w-3 h-3 text-orange-400 shrink-0" />
          ) : (
            <ArrowDown className="w-3 h-3 text-orange-400 shrink-0" />
          )
        ) : !compact ? (
          <ArrowUpDown className="w-2.5 h-2.5 text-slate-500/60 group-hover/th:text-orange-400/80 transition-colors shrink-0" />
        ) : null}
        {showTooltip && (
          <MetricInfoTooltip
            helpKey={helpKey}
            customHelp={customHelp}
            fallbackTitle={
              fallbackTitle || (typeof label === 'string' ? label : undefined)
            }
            align={align === 'left' ? 'left' : 'right'}
            iconClassName="w-3 h-3"
          />
        )}
      </div>
    </th>
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

export interface BreakdownDetailCellProps {
  children: ReactNode;
  entityName: string;
  badgeLabel: string;
  badgeTone?: 'positive' | 'negative' | 'neutral';
  diagnosisLabel?: string;
  diagnosisTone?: 'solid' | 'sustainable' | 'warning' | 'negative' | 'neutral';
  headline?: string;
  detailText: string;
  secondaryText?: string;
  windowsSummary?: string;
  streakText?: string | null;
}

export function BreakdownDetailCell({
  children,
  entityName,
  badgeLabel,
  badgeTone = 'neutral',
  diagnosisLabel,
  diagnosisTone = 'neutral',
  headline,
  detailText,
  secondaryText,
  windowsSummary,
  streakText,
}: BreakdownDetailCellProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    flipAbove: boolean;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleHoverClose = () => {
    clearCloseTimer();
    if (typeof window === 'undefined') return;
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 110);
  };

  const updatePosition = () => {
    const anchor = wrapRef.current || btnRef.current;
    if (!anchor || typeof window === 'undefined') return;
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = Math.min(372, window.innerWidth - 24);
    let left = rect.right - tooltipWidth;
    left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, left));

    const spaceBelow = window.innerHeight - rect.bottom;
    const flipAbove = spaceBelow < 250 && rect.top > spaceBelow;
    const rawTop = flipAbove ? rect.top - 8 : rect.bottom + 8;
    const top = flipAbove
      ? Math.max(16, rawTop)
      : Math.min(window.innerHeight - 24, rawTop);

    setCoords({ top, left, flipAbove });
  };

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (
        (target && wrapRef.current?.contains(target)) ||
        (target && popRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
      setPinned(false);
    };
    const onScrollOrResize = () => {
      setOpen(false);
      setPinned(false);
    };

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

  const canHover = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const badgeColorClass =
    badgeTone === 'positive'
      ? 'text-emerald-400'
      : badgeTone === 'negative'
      ? 'text-rose-400'
      : 'text-orange-400';

  const diagnosisColorClass =
    diagnosisTone === 'solid' || diagnosisTone === 'sustainable'
      ? 'text-emerald-400'
      : diagnosisTone === 'warning'
      ? 'text-amber-400'
      : diagnosisTone === 'negative'
      ? 'text-rose-400'
      : 'text-slate-300';

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => {
        if (!canHover()) return;
        clearCloseTimer();
        updatePosition();
        setOpen(true);
      }}
      onMouseLeave={() => {
        if (!canHover() || pinned) return;
        scheduleHoverClose();
      }}
      className="group/detail flex items-start justify-between gap-2 min-w-0"
    >
      <div className="min-w-0 flex-1">{children}</div>

      <button
        ref={btnRef}
        type="button"
        aria-label={`Ver desglose técnico completo de ${entityName}`}
        aria-expanded={open}
        title="Ver desglose técnico completo"
        onClick={(e) => {
          e.stopPropagation();
          clearCloseTimer();
          updatePosition();
          setOpen((prev) => {
            const next = !prev;
            setPinned(next);
            return next;
          });
        }}
        className={`mt-0.5 inline-flex items-center justify-center p-1 rounded-md border transition-colors shrink-0 touch-manipulation ${
          open
            ? 'bg-[#182338] border-orange-500/50 text-orange-400'
            : 'bg-[#0B1120]/70 border-[#1E293B] text-slate-400 group-hover/detail:text-orange-400 group-hover/detail:border-orange-500/40 hover:bg-[#182338]'
        }`}
      >
        <FileText className="w-3.5 h-3.5" />
      </button>

      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            onMouseEnter={() => {
              if (!canHover()) return;
              clearCloseTimer();
            }}
            onMouseLeave={() => {
              if (!canHover() || pinned) return;
              scheduleHoverClose();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              top: coords.top,
              left: coords.left,
              transform: coords.flipAbove ? 'translateY(-100%)' : undefined,
            }}
            className="fixed z-[95] w-[372px] max-w-[calc(100vw-24px)] max-h-[78vh] overflow-y-auto p-3.5 rounded-xl bg-[#0B1120]/98 backdrop-blur-md border border-[#283548] shadow-2xl text-left space-y-2"
          >
            <div className="flex items-start justify-between gap-2 pb-1.5 border-b border-[#1E293B]">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-100 leading-snug">
                  {entityName}
                </p>
                <p
                  className={`mt-0.5 text-[11px] font-semibold leading-snug ${badgeColorClass}`}
                >
                  {badgeLabel}
                </p>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 shrink-0">
                Desglose completo
              </span>
            </div>

            {diagnosisLabel && (
              <p
                className={`text-[11px] font-semibold leading-snug ${diagnosisColorClass}`}
              >
                {diagnosisTone === 'warning' ? '◆ ' : ''}
                {diagnosisLabel}
              </p>
            )}

            {headline && headline !== diagnosisLabel && (
              <p className="text-xs font-medium text-slate-100 leading-snug whitespace-normal">
                {headline}
              </p>
            )}

            <p className="text-[11.5px] leading-relaxed text-slate-200 font-normal whitespace-normal">
              {detailText}
            </p>

            {secondaryText && secondaryText !== detailText && (
              <p className="pt-1.5 border-t border-[#1E293B] font-mono tabular-nums text-[11px] leading-relaxed text-slate-300 whitespace-normal">
                {secondaryText}
              </p>
            )}

            {windowsSummary && (
              <p className="pt-1.5 border-t border-[#1E293B] font-mono tabular-nums text-[10.5px] text-slate-400 whitespace-normal">
                <span className="font-sans font-medium text-slate-300">
                  Ventanas:{' '}
                </span>
                {windowsSummary}
              </p>
            )}

            {streakText && (
              <p className="pt-1.5 border-t border-[#1E293B] font-mono tabular-nums text-[11px] font-medium text-orange-300 whitespace-normal">
                {streakText}
              </p>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
