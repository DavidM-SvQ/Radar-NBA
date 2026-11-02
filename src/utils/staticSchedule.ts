import { NBA_SCHEDULE_2027_TUPLES } from '../data/nbaSchedule2027';
import type { FantasyTeamGameSlot, FantasyWeekWindow } from '../types/nba';
import { NBA_TEAMS_MAP } from './teamLogos';

export interface StaticScheduledGame {
  gameId: string;
  dateIso: string;
  dateTimeUtc: string;
  awayAbbr: string;
  homeAbbr: string;
}

const MONTHS_SHORT_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const WEEKDAYS_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const STATIC_SCHEDULE_2027: StaticScheduledGame[] =
  NBA_SCHEDULE_2027_TUPLES.map(
    ([gameId, dateIso, dateTimeUtc, awayAbbr, homeAbbr]) => ({
      gameId,
      dateIso,
      dateTimeUtc,
      awayAbbr,
      homeAbbr,
    })
  );

export function getEasternTodayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '11';
  const d = parts.find((p) => p.type === 'day')?.value || '02';
  return `${y}-${m}-${d}`;
}

export function addDaysIso(dateIso: string, deltaDays: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getMondayOfWeekIso(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(dateIso, diffToMon);
}

export function formatDayShortEs(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const wd = WEEKDAYS_SHORT_ES[dt.getUTCDay()] || '';
  return `${wd} ${d}`;
}

export function formatRangeLabelEs(startIso: string, endIso: string): string {
  const [, m1, d1] = startIso.split('-').map(Number);
  const [, m2, d2] = endIso.split('-').map(Number);
  const mo1 = MONTHS_SHORT_ES[(m1 || 1) - 1] || '';
  const mo2 = MONTHS_SHORT_ES[(m2 || 1) - 1] || '';
  return `Lun ${d1} ${mo1} – Dom ${d2} ${mo2}`;
}

export function buildWeeklyWindowsFromSchedule(
  scheduleGames: StaticScheduledGame[],
  referenceTodayIso = getEasternTodayIso()
): FantasyWeekWindow[] {
  const currentMonday = getMondayOfWeekIso(referenceTodayIso);
  const specs: Array<{
    id: FantasyWeekWindow['id'];
    offsetWeeks: number;
    label: string;
  }> = [
    { id: 'prev', offsetWeeks: -1, label: 'Semana Anterior' },
    { id: 'current', offsetWeeks: 0, label: 'Semana Actual' },
    { id: 'next', offsetWeeks: 1, label: 'Próxima Semana' },
    { id: 'next2', offsetWeeks: 2, label: 'Semana +2' },
  ];

  const allTeamAbbrs = Object.keys(NBA_TEAMS_MAP);
  const nowMs = Date.now();

  return specs.map((spec) => {
    const startIso = addDaysIso(currentMonday, spec.offsetWeeks * 7);
    const endIso = addDaysIso(startIso, 6);

    const weekGames = scheduleGames.filter(
      (g) => g.dateIso >= startIso && g.dateIso <= endIso
    );

    const mondayGames = weekGames
      .filter(
        (g) =>
          g.dateIso === startIso && g.dateTimeUtc && g.dateTimeUtc.includes('T')
      )
      .sort((a, b) => a.dateTimeUtc.localeCompare(b.dateTimeUtc));

    let lockDeadlineLabel = `Madrugada del ${formatDayShortEs(
      startIso
    )} (Cierre semanal estricto)`;
    let isLocked = referenceTodayIso > startIso;

    if (mondayGames.length > 0) {
      const firstTip = new Date(mondayGames[0].dateTimeUtc);
      if (!Number.isNaN(firstTip.getTime())) {
        isLocked = nowMs >= firstTip.getTime();
        const madridFmt = new Intl.DateTimeFormat('es-ES', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Europe/Madrid',
        })
          .format(firstTip)
          .replace(/\./g, '');
        const etFmt = new Intl.DateTimeFormat('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'America/New_York',
        }).format(firstTip);
        lockDeadlineLabel = `${
          madridFmt.charAt(0).toUpperCase() + madridFmt.slice(1)
        }h ESP (${etFmt} ET)`;
      }
    }

    const teamSchedules: FantasyWeekWindow['teamSchedules'] = {};
    for (const abbr of allTeamAbbrs) {
      teamSchedules[abbr] = {
        gamesCount: 0,
        b2bCount: 0,
        games: [],
      };
    }

    for (const g of weekGames) {
      for (const side of ['away', 'home'] as const) {
        const teamAbbr = side === 'away' ? g.awayAbbr : g.homeAbbr;
        const oppAbbr = side === 'away' ? g.homeAbbr : g.awayAbbr;
        const bucket = teamSchedules[teamAbbr];
        if (!bucket) continue;

        const prevSlot = bucket.games[bucket.games.length - 1];
        const isBackToBack = prevSlot
          ? addDaysIso(prevSlot.dateIso, 1) === g.dateIso
          : false;

        const slot: FantasyTeamGameSlot = {
          gameId: g.gameId,
          dateIso: g.dateIso,
          dayShortEs: formatDayShortEs(g.dateIso),
          opponentAbbr: oppAbbr,
          isHome: side === 'home',
          isBackToBack,
        };
        bucket.games.push(slot);
        bucket.gamesCount = bucket.games.length;
        if (isBackToBack) bucket.b2bCount += 1;
      }
    }

    return {
      id: spec.id,
      label: spec.label,
      rangeLabel: formatRangeLabelEs(startIso, endIso),
      startIso,
      endIso,
      lockDeadlineLabel,
      isLocked,
      teamSchedules,
    };
  });
}

export function buildStaticFantasyWeeks(
  referenceTodayIso?: string
): FantasyWeekWindow[] {
  return buildWeeklyWindowsFromSchedule(STATIC_SCHEDULE_2027, referenceTodayIso);
}
