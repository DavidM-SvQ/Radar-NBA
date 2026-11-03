import { useMemo, useState } from 'react';
import { ArrowRight, Radio, X } from 'lucide-react';
import type { ActiveSection, ScoreboardGame } from '../types/nba';
import { TeamLogo } from './NbaVisuals';

interface LiveGamedayBannerProps {
  scoreboard: ScoreboardGame[];
  activeSection: ActiveSection;
  onOpenGameday: () => void;
}

const DISMISS_STORAGE_PREFIX = 'radarnba_live_banner_dismissed_';

function getTodaySessionKey(liveGames: ScoreboardGame[]): string {
  const firstDate = liveGames[0]?.date?.slice(0, 10);
  if (firstDate && /^\d{4}-\d{2}-\d{2}$/.test(firstDate)) {
    return `${DISMISS_STORAGE_PREFIX}${firstDate}`;
  }
  return `${DISMISS_STORAGE_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

export function LiveGamedayBanner({
  scoreboard,
  activeSection,
  onOpenGameday,
}: LiveGamedayBannerProps) {
  const liveGames = useMemo(
    () => scoreboard.filter((g) => Boolean(g.isLive)),
    [scoreboard]
  );

  const sessionKey = useMemo(() => getTodaySessionKey(liveGames), [liveGames]);

  const [dismissedKey, setDismissedKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem('radarnba_live_banner_last_key');
      if (stored && sessionStorage.getItem(stored) === '1') {
        return stored;
      }
    } catch {
      // Ignore storage errors in restricted environments
    }
    return null;
  });

  const isDismissed = useMemo(() => {
    if (dismissedKey === sessionKey) return true;
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(sessionKey) === '1';
    } catch {
      return false;
    }
  }, [dismissedKey, sessionKey]);

  if (liveGames.length === 0 || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissedKey(sessionKey);
    try {
      sessionStorage.setItem(sessionKey, '1');
      sessionStorage.setItem('radarnba_live_banner_last_key', sessionKey);
    } catch {
      // Ignore storage quota errors
    }
  };

  return (
    <section
      aria-label="Aviso de jornada NBA en juego"
      className="bg-[#131C2E] border border-orange-500/35 rounded-xl sm:rounded-lg px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="inline-flex items-center gap-2 shrink-0">
          <Radio className="w-4 h-4 text-orange-400 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-slate-100 whitespace-nowrap">
            Jornada en juego
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-orange-300 font-mono tabular-nums whitespace-nowrap">
            {liveGames.length}{' '}
            {liveGames.length === 1 ? 'partido en directo' : 'partidos en directo'}
          </span>
        </div>

        <div className="hidden md:block h-4 w-px bg-[#1E293B] shrink-0" />

        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-0.5 min-w-0">
          {liveGames.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={onOpenGameday}
              className="inline-flex items-center gap-1.5 pr-3 border-r border-[#1E293B] last:border-r-0 last:pr-0 text-xs hover:text-white transition-colors whitespace-nowrap shrink-0 group"
              title="Abrir Analizador de Jornadas"
            >
              <TeamLogo abbr={g.awayAbbr} size="xs" />
              <span className="font-medium text-slate-200 group-hover:text-white">
                {g.awayAbbr}
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-100">
                {g.awayScore}-{g.homeScore}
              </span>
              <span className="font-medium text-slate-200 group-hover:text-white">
                {g.homeAbbr}
              </span>
              <TeamLogo abbr={g.homeAbbr} size="xs" />
              {g.statusText && (
                <>
                  <span className="text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-orange-300">
                    {g.statusText}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Horizontal Live Scores Row */}
      <div className="flex md:hidden items-center gap-2.5 overflow-x-auto no-scrollbar pt-1 border-t border-[#1E293B]/80">
        {liveGames.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={onOpenGameday}
            className="inline-flex items-center gap-1.5 pr-2.5 border-r border-[#1E293B] last:border-r-0 text-xs whitespace-nowrap shrink-0"
          >
            <TeamLogo abbr={g.awayAbbr} size="xs" />
            <span className="text-slate-200 font-medium">{g.awayAbbr}</span>
            <span className="font-mono tabular-nums font-semibold text-slate-100">
              {g.awayScore}-{g.homeScore}
            </span>
            <span className="text-slate-200 font-medium">{g.homeAbbr}</span>
            <TeamLogo abbr={g.homeAbbr} size="xs" />
            {g.statusText && (
              <span className="font-mono tabular-nums text-[11px] text-orange-300">
                · {g.statusText}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 shrink-0">
        {activeSection !== 'gameday' ? (
          <button
            type="button"
            onClick={onOpenGameday}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <span>Ir a Jornada</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-xs text-slate-400 whitespace-nowrap px-1">
            Viendo jornada actual
          </span>
        )}

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Ocultar aviso de jornada en juego"
          title="Ocultar aviso durante esta sesión"
          className="min-w-[34px] min-h-[34px] inline-flex items-center justify-center rounded-lg bg-[#0B1120] hover:bg-[#182338] border border-[#1E293B] text-slate-400 hover:text-slate-200 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
