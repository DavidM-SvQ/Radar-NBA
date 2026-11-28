import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Award,
  Bell,
  CalendarDays,
  CheckCheck,
  Crown,
  Flame,
  Search,
  Shield,
  SlidersHorizontal,
  Star,
  Target,
  TrendingUp,
  Trophy,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type {
  MilestoneGroupedSubItem,
  MilestoneNotificationCategory,
  MilestoneNotificationItem,
  MilestoneNotificationMinSeverity,
  MilestoneNotificationsPayload,
} from '../types/nba';

interface NotificationCenterPopoverProps {
  payload: MilestoneNotificationsPayload | null;
  watchlistIds: Set<string>;
  onInspectEntity: (type: 'player' | 'team', id: string) => void;
  onOpenGamedayDate?: (date: string) => void;
  onOpenAdminNotifications?: () => void;
}

const READ_STORAGE_KEY = 'radarnba_read_notifications_v1';

type CategoryFilter = 'all' | 'records' | 'gameday' | 'heroic' | 'milestones' | 'streaks';
type EntityFilter = 'all' | 'player' | 'team';

function loadReadSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.slice(-200).map((v) => String(v)));
    }
  } catch {
    // Ignore storage error
  }
  return new Set();
}

function saveReadSet(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const recent = Array.from(set).slice(-200);
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // Ignore storage error
  }
}

function formatShortDateEs(isoDate: string): string {
  if (!isoDate || isoDate === 'Temporada') return isoDate || 'Reciente';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

function getCategoryIcon(category: MilestoneNotificationCategory) {
  switch (category) {
    case 'record':
      return Crown;
    case 'heroic':
      return Zap;
    case 'triple_double':
      return Trophy;
    case 'defense':
      return Shield;
    case 'team':
      return Flame;
    case 'cumulative':
      return Award;
    case 'imminent':
      return Target;
    case 'streak':
      return TrendingUp;
    case 'scoring':
    default:
      return Flame;
  }
}

function matchesCategoryFilter(
  category: MilestoneNotificationCategory,
  filter: CategoryFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'records') return category === 'record';
  if (filter === 'gameday') {
    return (
      category === 'scoring' ||
      category === 'triple_double' ||
      category === 'defense' ||
      category === 'team'
    );
  }
  if (filter === 'heroic') return category === 'heroic';
  if (filter === 'milestones') return category === 'cumulative' || category === 'imminent';
  if (filter === 'streaks') return category === 'streak';
  return true;
}

export function NotificationCenterPopover({
  payload,
  watchlistIds,
  onInspectEntity,
  onOpenGamedayDate,
  onOpenAdminNotifications,
}: NotificationCenterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [severityFilter, setSeverityFilter] =
    useState<MilestoneNotificationMinSeverity>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadSet());
  const [hoveredMerged, setHoveredMerged] = useState<{
    item: MilestoneNotificationItem;
    top: number;
    left: number;
    placement: 'above' | 'below';
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const showMergedTooltip = useCallback(
    (item: MilestoneNotificationItem, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const tooltipWidth = 312;
      const estimatedHeight = Math.min(
        260,
        56 + Math.max(1, item.mergedItems?.length ?? (item.mergedCount ? item.mergedCount - 1 : 1)) * 58
      );
      const margin = 12;
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      if (left < margin) left = margin;
      if (left + tooltipWidth > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - tooltipWidth - margin);
      }
      const spaceAbove = rect.top - margin;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const placement: 'above' | 'below' =
        spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove ? 'below' : 'above';
      const top = placement === 'below' ? rect.bottom + 8 : rect.top - 8;
      setHoveredMerged({ item, top, left, placement });
    },
    []
  );

  const hideMergedTooltip = useCallback(() => {
    setHoveredMerged(null);
  }, []);

  useEffect(() => {
    if (!open) {
      setHoveredMerged(null);
      return;
    }
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const notifications = useMemo(
    () => (payload?.enabled ? payload.notifications || [] : []),
    [payload]
  );

  const unreadCount = useMemo(() => {
    return notifications.reduce((acc, item) => acc + (readIds.has(item.id) ? 0 : 1), 0);
  }, [notifications, readIds]);

  const scopedNotifications = useMemo(() => {
    if (!onlyWatchlist) return notifications;
    return notifications.filter((item) =>
      watchlistIds.has(`${item.entityType}:${item.entityId}`)
    );
  }, [notifications, onlyWatchlist, watchlistIds]);

  const entityCounts = useMemo(() => {
    let player = 0;
    let team = 0;
    for (const item of scopedNotifications) {
      if (item.entityType === 'team') team++;
      else player++;
    }
    return {
      all: scopedNotifications.length,
      player,
      team,
    };
  }, [scopedNotifications]);

  const recordCount = useMemo(() => {
    return scopedNotifications.filter((item) => item.category === 'record').length;
  }, [scopedNotifications]);

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedNotifications.filter((item) => {
      if (entityFilter !== 'all' && item.entityType !== entityFilter) {
        return false;
      }
      if (!matchesCategoryFilter(item.category, categoryFilter)) {
        return false;
      }
      if (severityFilter === 'epic' && item.severity !== 'epic') {
        return false;
      }
      if (
        severityFilter === 'high' &&
        item.severity !== 'epic' &&
        item.severity !== 'high'
      ) {
        return false;
      }
      if (q) {
        const mergedHay = item.mergedItems
          ? item.mergedItems.map((m) => `${m.title} ${m.detail} ${m.badgeText}`).join(' ')
          : '';
        const hay = `${item.title} ${item.detail} ${item.entityName} ${item.teamAbbr} ${item.badgeText} ${mergedHay}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopedNotifications, entityFilter, categoryFilter, severityFilter, searchQuery]);

  if (!payload || !payload.enabled) {
    return null;
  }

  const markRead = (id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveReadSet(next);
      return next;
    });
  };

  const markAllRead = () => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const item of notifications) {
        next.add(item.id);
      }
      saveReadSet(next);
      return next;
    });
  };

  const handleOpenItem = (item: MilestoneNotificationItem) => {
    markRead(item.id);
    setOpen(false);
    onInspectEntity(item.entityType, item.entityId);
  };

  const handleJumpGameday = (
    e: React.MouseEvent,
    item: MilestoneNotificationItem
  ) => {
    e.stopPropagation();
    markRead(item.id);
    if (onOpenGamedayDate && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
      setOpen(false);
      onOpenGamedayDate(item.date);
    }
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Centro de notificaciones de hitos (${unreadCount} sin leer)`}
        aria-expanded={open}
        title="Hitos alcanzados, rachas y alertas recientes"
        className={`relative inline-flex items-center justify-center min-w-[38px] min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          open
            ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
            : 'bg-[#131C2E] hover:bg-[#182338] border-[#1E293B] hover:border-[#283548] text-slate-300 hover:text-white'
        }`}
      >
        <Bell
          className={`w-4 h-4 ${
            unreadCount > 0 ? 'text-orange-400' : 'text-slate-400'
          }`}
        />
        {unreadCount > 0 && (
          <span className="ml-1.5 px-1.5 py-0.5 min-w-[18px] text-center rounded bg-orange-500 text-slate-950 font-mono tabular-nums text-[10px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Centro de Notificaciones NBA"
          className="fixed inset-x-3 top-14 sm:inset-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-[430px] max-h-[78vh] flex flex-col bg-[#0F172A] border border-[#1E293B] rounded-lg shadow-2xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="px-3.5 py-2.5 bg-[#131C2E] border-b border-[#1E293B] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="text-xs font-display font-semibold text-slate-100 truncate">
                  Centro de Hitos
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  ({notifications.length})
                </span>
              </div>
              {payload.latestDate && (
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  Última jornada: {formatShortDateEs(payload.latestDate)}
                  {payload.summary?.consolidatedCount
                    ? ` · ${payload.summary.consolidatedCount} agrupadas`
                    : ''}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="px-2 py-1 text-[11px] font-medium text-orange-300 hover:text-orange-200 hover:bg-[#1E293B] rounded-md inline-flex items-center gap-1 transition-colors"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Leídas</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar notificaciones"
                className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-[#1E293B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Controls: Scope (Todas / Favoritos) & Category */}
          <div className="px-3.5 py-2 bg-[#0B1120] border-b border-[#1E293B] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center bg-[#131C2E] border border-[#1E293B] p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setOnlyWatchlist(false)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    !onlyWatchlist
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Toda la liga
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyWatchlist(true)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md inline-flex items-center gap-1 transition-colors ${
                    onlyWatchlist
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Star className="w-3 h-3" />
                  <span>Favoritos</span>
                </button>
              </div>

              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                {visibleItems.length} visibles
              </span>
            </div>

            {/* División Jugador / Equipos */}
            <div className="grid grid-cols-3 gap-1 bg-[#131C2E] border border-[#1E293B] p-0.5 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Todas', count: entityCounts.all, icon: Bell },
                  { id: 'player', label: 'Jugador', count: entityCounts.player, icon: User },
                  { id: 'team', label: 'Equipos', count: entityCounts.team, icon: Users },
                ] as const
              ).map((tab) => {
                const TabIcon = tab.icon;
                const active = entityFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEntityFilter(tab.id)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md inline-flex items-center justify-center gap-1 transition-colors ${
                      active
                        ? 'bg-[#1E293B] text-orange-300 border border-orange-500/40 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <TabIcon className="w-3 h-3 shrink-0" />
                    <span>{tab.label}</span>
                    <span className="font-mono tabular-nums text-[10px] opacity-80">
                      ({tab.count})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Buscador rápido + Relevancia */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar jugador, equipo o hito..."
                  aria-label="Buscar notificaciones"
                  className="w-full h-7 pl-7 pr-6 bg-[#131C2E] border border-[#1E293B] focus:border-orange-500/60 rounded-md text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="inline-flex items-center bg-[#131C2E] border border-[#1E293B] p-0.5 rounded-md shrink-0">
                {(
                  [
                    { id: 'all', label: 'Todas' },
                    { id: 'high', label: 'Top+' },
                    { id: 'epic', label: 'Épicas' },
                  ] as const
                ).map((sev) => (
                  <button
                    key={sev.id}
                    type="button"
                    onClick={() => setSeverityFilter(sev.id)}
                    className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                      severityFilter === sev.id
                        ? 'bg-[#1E293B] text-orange-300 border border-orange-500/40 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {sev.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  {
                    id: 'records',
                    label: recordCount > 0 ? `Récords (${recordCount})` : 'Récords',
                  },
                  { id: 'gameday', label: 'Jornada' },
                  { id: 'heroic', label: 'Clutch/BB' },
                  { id: 'milestones', label: 'Barreras' },
                  { id: 'streaks', label: 'Rachas' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
                    categoryFilter === tab.id
                      ? 'bg-[#1E293B] text-orange-300 border border-orange-500/30'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notification Feed */}
          <div
            onScroll={hideMergedTooltip}
            className="flex-1 overflow-y-auto divide-y divide-[#1E293B]/70"
          >
            {visibleItems.length === 0 ? (
              <div className="p-6 text-center space-y-1.5">
                <Bell className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="text-xs font-medium text-slate-300">
                  {onlyWatchlist
                    ? 'Sin hitos recientes en tus favoritos'
                    : 'No hay alertas activas con este filtro'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {onlyWatchlist
                    ? 'Marca jugadores o equipos con ★ para seguir sus hitos aquí.'
                    : 'Prueba otra categoría o ajusta los umbrales en Zona Admin.'}
                </p>
              </div>
            ) : (
              visibleItems.map((item) => {
                const Icon = getCategoryIcon(item.category);
                const isUnread = !readIds.has(item.id);
                const isWatched = watchlistIds.has(`${item.entityType}:${item.entityId}`);
                const hasExactDate = /^\d{4}-\d{2}-\d{2}$/.test(item.date);

                const isCareerHigh = item.category === 'record' && item.id.startsWith('ch:');
                const iconTone = isCareerHigh
                  ? 'text-amber-300 bg-amber-500/15 border-amber-500/40'
                  : item.severity === 'epic'
                    ? 'text-orange-400 bg-orange-500/10 border-orange-500/30'
                    : item.severity === 'high'
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                      : 'text-sky-400 bg-sky-500/10 border-sky-500/30';

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenItem(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenItem(item);
                      }
                    }}
                    className={`p-3 hover:bg-[#131C2E] transition-colors cursor-pointer flex items-start gap-2.5 ${
                      isUnread ? 'bg-[#131C2E]/45' : ''
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${iconTone}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isUnread && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"
                              aria-label="No leída"
                            />
                          )}
                          <span className="text-xs font-semibold text-slate-100 truncate">
                            {item.title}
                          </span>
                          {isWatched && (
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                          {item.teamAbbr} · {formatShortDateEs(item.date)}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 leading-snug">{item.detail}</p>

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${
                              item.entityType === 'team'
                                ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                                : 'text-sky-300 bg-sky-500/10 border-sky-500/30'
                            }`}
                          >
                            {item.entityType === 'team' ? 'Equipo' : 'Jugador'}
                          </span>
                          <span
                            className={`text-[10px] font-mono tabular-nums font-semibold truncate ${
                              isCareerHigh ? 'text-amber-300' : 'text-orange-300'
                            }`}
                          >
                            {item.badgeText}
                          </span>
                          {item.mergedCount && item.mergedCount > 1 && (
                            <span
                              tabIndex={0}
                              role="note"
                              aria-label={`Ver ${item.mergedCount - 1} ${item.mergedCount - 1 === 1 ? 'hito agrupado' : 'hitos agrupados'}`}
                              onMouseEnter={(e) => showMergedTooltip(item, e.currentTarget)}
                              onMouseLeave={hideMergedTooltip}
                              onFocus={(e) => showMergedTooltip(item, e.currentTarget)}
                              onBlur={hideMergedTooltip}
                              onClick={(e) => {
                                e.stopPropagation();
                                showMergedTooltip(item, e.currentTarget);
                              }}
                              className="text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 hover:border-sky-400/60 text-sky-300 shrink-0 cursor-help transition-colors"
                            >
                              +{item.mergedCount - 1}{' '}
                              {item.mergedCount - 1 === 1 ? 'hito' : 'hitos'}
                            </span>
                          )}
                        </div>
                        {hasExactDate && onOpenGamedayDate && (
                          <button
                            type="button"
                            onClick={(e) => handleJumpGameday(e, item)}
                            className="text-[10px] font-medium text-slate-400 hover:text-orange-300 inline-flex items-center gap-1 shrink-0"
                          >
                            <CalendarDays className="w-3 h-3" />
                            <span>Ver jornada</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {onOpenAdminNotifications && (
            <div className="px-3.5 py-2 bg-[#131C2E] border-t border-[#1E293B] flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Alertas configurables por hitos</span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenAdminNotifications();
                }}
                className="text-slate-300 hover:text-orange-300 font-medium inline-flex items-center gap-1 transition-colors"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Configurar en Admin</span>
              </button>
            </div>
          )}
        </div>
      )}

      {open &&
        hoveredMerged &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const target = hoveredMerged.item;
            const extraCount = Math.max(1, (target.mergedCount ?? 2) - 1);
            const subItems: MilestoneGroupedSubItem[] =
              target.mergedItems && target.mergedItems.length > 0
                ? target.mergedItems
                : (() => {
                    const marker = ' · También: ';
                    const idx = target.detail.indexOf(marker);
                    if (idx === -1) return [];
                    return target.detail
                      .slice(idx + marker.length)
                      .split(' · ')
                      .filter(Boolean)
                      .map((badge, i) => ({
                        id: `${target.id}:fallback:${i}`,
                        category: target.category,
                        severity: target.severity,
                        title: badge,
                        detail: `Logro agrupado en el mismo partido (${target.teamAbbr} · ${formatShortDateEs(target.date)}).`,
                        badgeText: badge,
                      }));
                  })();

            return (
              <div
                role="tooltip"
                style={{
                  position: 'fixed',
                  top: `${hoveredMerged.top}px`,
                  left: `${hoveredMerged.left}px`,
                  transform:
                    hoveredMerged.placement === 'above' ? 'translateY(-100%)' : undefined,
                  width: '312px',
                }}
                className="pointer-events-none z-[90] bg-[#0B1120] border border-sky-500/40 rounded-lg shadow-2xl overflow-hidden"
              >
                <div className="px-3 py-2 bg-[#131C2E] border-b border-[#1E293B] flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-sky-300 truncate">
                    {extraCount === 1 ? 'Hito agrupado' : `${extraCount} hitos agrupados`} · {target.entityName}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                    {formatShortDateEs(target.date)}
                  </span>
                </div>
                <div className="p-2.5 space-y-2 max-h-[240px] overflow-hidden">
                  {subItems.length > 0 ? (
                    subItems.map((sub) => {
                      const SubIcon = getCategoryIcon(sub.category);
                      const isSubCareerHigh =
                        sub.category === 'record' && sub.id.startsWith('ch:');
                      const subTone = isSubCareerHigh
                        ? 'text-amber-300 bg-amber-500/15 border-amber-500/40'
                        : sub.severity === 'epic'
                          ? 'text-orange-400 bg-orange-500/10 border-orange-500/30'
                          : sub.severity === 'high'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                            : 'text-sky-400 bg-sky-500/10 border-sky-500/30';
                      return (
                        <div
                          key={sub.id}
                          className="flex items-start gap-2 bg-[#131C2E]/70 border border-[#1E293B] rounded-md p-2"
                        >
                          <div
                            className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 mt-0.5 ${subTone}`}
                          >
                            <SubIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-100 truncate">
                                {sub.title}
                              </span>
                              <span
                                className={`text-[9px] font-mono tabular-nums font-semibold shrink-0 ${
                                  isSubCareerHigh ? 'text-amber-300' : 'text-orange-300'
                                }`}
                              >
                                {sub.badgeText}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 leading-snug">
                              {sub.detail}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-slate-300 leading-snug">
                      Incluye {target.mergedCount} logros destacados del mismo partido consolidados en esta alerta.
                    </p>
                  )}
                </div>
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
}
