import type { InjuryPlayerReportItem } from '../types/nba';
import { getInjuryStatusVisualMeta } from '../utils/injuriesClient';

interface InjuryStatusBadgeProps {
  injury: InjuryPlayerReportItem;
  compact?: boolean;
  showDetail?: boolean;
}

export function InjuryStatusBadge({
  injury,
  compact = false,
  showDetail = false,
}: InjuryStatusBadgeProps) {
  const meta = getInjuryStatusVisualMeta(injury.statusCode);
  const tooltip = [
    `${injury.statusLabelEs}`,
    injury.detailEs,
    injury.returnDate ? `Regreso est.: ${injury.returnDate}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  if (compact) {
    return (
      <span
        title={tooltip}
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight border whitespace-nowrap shrink-0 ${meta.surfaceClass} ${meta.textClass} ${meta.borderClass}`}
      >
        {meta.shortLabel}
      </span>
    );
  }

  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap"
    >
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${meta.surfaceClass} ${meta.textClass} ${meta.borderClass}`}
      >
        {meta.shortLabel}
      </span>
      <span className={`font-medium ${meta.textClass}`}>
        {injury.statusLabelEs}
      </span>
      {showDetail && injury.detailEs && (
        <span className="text-slate-400 truncate max-w-[240px]">
          · {injury.detailEs}
        </span>
      )}
    </span>
  );
}
