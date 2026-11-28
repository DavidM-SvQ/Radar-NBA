import { useMemo, useRef } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Radio,
  Tv,
} from 'lucide-react';
import type { ScoreboardGame } from '../types/nba';
import { TeamLogo } from './NbaVisuals';

interface BroadcastScoreboardRibbonProps {
  liveGames: ScoreboardGame[];
  recentGames: ScoreboardGame[];
  recentDate: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  onOpenDate: (date?: string) => void;
  onOpenGameday: () => void;
}

function formatShortEsDate(isoDate?: string): string {
  if (!isoDate) return '';
  const clean = isoDate.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}`;
}

export function BroadcastScoreboardRibbon({
  liveGames,
  recentGames,
  recentDate,
  isOpen,
  onToggleOpen,
  onOpenDate,
  onOpenGameday,
}: BroadcastScoreboardRibbonProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const mergedGames = useMemo(() => {
    const map = new Map<string, ScoreboardGame>();
    for (const g of liveGames) {
      map.set(g.id, g);
    }
    for (const g of recentGames) {
      if (!map.has(g.id)) {
        map.set(g.id, g);
      }
    }
    return Array.from(map.values()).slice(0, 18);
  }, [liveGames, recentGames]);

  const activeLiveCount = useMemo(
    () => mergedGames.filter((g) => g.isLive).length,
    [mergedGames]
  );

  if (mergedGames.length === 0) {
    return null;
  }

  const scrollByAmount = (dir: -1 | 1) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <div
      aria-label="Cinta de marcadores NBA"
      className="bg-[#080E1C]/90 backdrop-blur-md border-b border-slate-400/10 transition-colors"
    >
      {/* Compact Toggle / Summary Strip */}
      <div className="px-3 sm:px-6 h-8 flex items-center justify-between gap-3 text-[11px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-300 uppercase tracking-wider text-[10px] shrink-0">
            <Tv className="w-3.5 h-3.5 text-sky-400" />
            <span>Marcadores NBA</span>
          </span>
          {recentDate && (
            <span className="font-mono tabular-nums text-slate-400 shrink-0">
              {formatShortEsDate(recentDate)}
            </span>
          )}
          <span className="text-slate-600 shrink-0" aria-hidden="true">
            ·
          </span>
          <span className="font-mono tabular-nums text-slate-400 truncate">
            {mergedGames.length} partidos
          </span>
          {activeLiveCount > 0 && (
            <button
              type="button"
              onClick={onOpenGameday}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 font-semibold text-[10px] hover:bg-emerald-500/25 transition-colors shrink-0"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <Radio className="w-3 h-3" />
              <span>{activeLiveCount} En directo</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => (recentDate ? onOpenDate(recentDate) : onOpenGameday())}
            className="hidden sm:inline-flex items-center text-[11px] font-medium text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap"
          >
            Analizar jornada →
          </button>
          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={isOpen}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/60 hover:bg-slate-700/70 text-slate-300 hover:text-white border border-slate-400/15 transition-colors whitespace-nowrap"
          >
            <span>{isOpen ? 'Ocultar cinta' : 'Ver marcadores'}</span>
            {isOpen ? (
              <ChevronUp className="w-3 h-3 text-slate-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable Horizontal Scoreboard Ticker */}
      {isOpen && (
        <div className="relative border-t border-slate-400/10 bg-[#060A13]/75">
          <button
            type="button"
            onClick={() => scrollByAmount(-1)}
            aria-label="Desplazar marcadores a la izquierda"
            className="hidden md:flex items-center justify-center absolute left-1 top-1/2 -translate-y-1/2 z-10 w-7 h-11 rounded-md bg-[#0D1526]/95 border border-slate-400/15 text-slate-300 hover:text-white hover:border-sky-400/40 shadow-md transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div
            ref={scrollContainerRef}
            className="flex items-stretch gap-2 px-3 sm:px-6 md:px-10 py-2 overflow-x-auto no-scrollbar scroll-smooth"
          >
            {mergedGames.map((g) => {
              const hasScore = g.isLive || g.isCompleted || g.awayScore > 0 || g.homeScore > 0;
              const awayWon = g.isCompleted && g.awayScore > g.homeScore;
              const homeWon = g.isCompleted && g.homeScore > g.awayScore;

              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => (g.date ? onOpenDate(g.date) : onOpenGameday())}
                  title={`${g.awayAbbr} @ ${g.homeAbbr}${g.date ? ` · ${g.date}` : ''} — Abrir jornada`}
                  className={`group shrink-0 w-[142px] sm:w-[152px] rounded-lg px-2.5 py-1.5 border text-left transition-all flex flex-col justify-between gap-1 ${
                    g.isLive
                      ? 'bg-[#0F1B33] border-emerald-400/35 hover:border-emerald-400/65'
                      : 'bg-[#0D1526]/90 border-slate-400/15 hover:border-amber-400/45 hover:bg-[#131F36]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <span
                      className={`font-mono font-semibold truncate ${
                        g.isLive
                          ? 'text-emerald-300'
                          : g.isCompleted
                          ? 'text-slate-400'
                          : 'text-sky-300'
                      }`}
                    >
                      {g.isLive ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {g.statusText || 'EN VIVO'}
                        </span>
                      ) : (
                        g.statusText || (g.startTimeEs ? `${g.startTimeEs}h` : 'Final')
                      )}
                    </span>
                    {g.date && (
                      <span className="font-mono tabular-nums text-[9px] text-slate-500">
                        {formatShortEsDate(g.date)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <TeamLogo abbr={g.awayAbbr} size="xs" />
                        <span
                          className={`font-semibold truncate ${
                            awayWon
                              ? 'text-white'
                              : g.isCompleted
                              ? 'text-slate-400'
                              : 'text-slate-200'
                          }`}
                        >
                          {g.awayAbbr}
                        </span>
                      </span>
                      <span
                        className={`font-mono tabular-nums ${
                          awayWon
                            ? 'font-bold text-amber-300'
                            : g.isLive
                            ? 'font-semibold text-white'
                            : 'text-slate-400'
                        }`}
                      >
                        {hasScore ? g.awayScore : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <TeamLogo abbr={g.homeAbbr} size="xs" />
                        <span
                          className={`font-semibold truncate ${
                            homeWon
                              ? 'text-white'
                              : g.isCompleted
                              ? 'text-slate-400'
                              : 'text-slate-200'
                          }`}
                        >
                          {g.homeAbbr}
                        </span>
                      </span>
                      <span
                        className={`font-mono tabular-nums ${
                          homeWon
                            ? 'font-bold text-amber-300'
                            : g.isLive
                            ? 'font-semibold text-white'
                            : 'text-slate-400'
                        }`}
                      >
                        {hasScore ? g.homeScore : '—'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollByAmount(1)}
            aria-label="Desplazar marcadores a la derecha"
            className="hidden md:flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 z-10 w-7 h-11 rounded-md bg-[#0D1526]/95 border border-slate-400/15 text-slate-300 hover:text-white hover:border-sky-400/40 shadow-md transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
