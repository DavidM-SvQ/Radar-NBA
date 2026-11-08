import type {
  FantasyAbsenceTier,
  FantasyInjurySeverity,
  FantasyProjectionMode,
  PlayerGameLog,
  PlayerSummary,
  TeamGameLog,
} from '../types/nba';

/**
 * REGLAMENTO OFICIAL Y NORMATIVA - LIGA FANTASY NBA (Liga ESPN 445109163)
 *
 * 1. Estructura de plantilla:
 *    - Máximo estricto: 12 jugadores bajo contrato
 *    - 10 titulares activos (únicos que puntúan) + 2 reservas en banquillo
 *    - Bloqueo semanal estricto (madrugada del lunes): 0 FPTS por partido ausente
 *    - Volumen semanal esperado = Partidos Jugados en la Semana × Media FPTS/Partido
 *
 * 2. Sistema exacto de puntuación (FPTS):
 *    - FGM:  +2.0
 *    - FGMI: -1.0  (FGA - FGM)
 *    - FTM:  +1.0
 *    - FTMI: -1.0  (FTA - FTM)
 *    - 3PM:  +1.0  (Total triple anotado = +2.0 FGM + 1.0 3PM = +3.0 FPTS)
 *    - 3PMI: +0.5  (Total triple fallado = -1.0 FGMI + 0.5 3PMI = -0.5 FPTS)
 *    - OREB: +1.5
 *    - DREB: +0.75
 *    - AST:  +1.5
 *    - STL:  +2.5
 *    - BLK:  +2.5
 *    - TO:   -2.0
 *    - EJ:   -5.0  (Expulsión del partido)
 */
export const OFFICIAL_LEAGUE_RULES = {
  maxContracts: 13,
  activeStarters: 10,
  benchReserves: 2,
  irSlots: 1,
  weights: {
    fgm: 2.0,
    fgmi: -1.0,
    ftm: 1.0,
    ftmi: -1.0,
    fg3m: 1.0,
    fg3mi: 0.5,
    oreb: 1.5,
    dreb: 0.75,
    ast: 1.5,
    stl: 2.5,
    blk: 2.5,
    tov: -2.0,
    ej: -5.0,
  },
} as const;

export interface OfficialGameFptsBreakdown {
  fgm: number;
  fga: number;
  fgmi: number;
  ftm: number;
  fta: number;
  ftmi: number;
  fg3m: number;
  fg3a: number;
  fg3mi: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  ejections: number;
  fgmPts: number;
  fgmiPts: number;
  ftmPts: number;
  ftmiPts: number;
  fg3mPts: number;
  fg3miPts: number;
  orebPts: number;
  drebPts: number;
  astPts: number;
  stlPts: number;
  blkPts: number;
  tovPts: number;
  ejPts: number;
  shootingMakePts: number;
  shootingMissPenaltyPts: number;
  reboundPts: number;
  playmakingDefensePts: number;
  negativeDisciplinePts: number;
  totalFpts: number;
}

function round1(val: number): number {
  return Math.round((Number(val) || 0) * 10) / 10;
}

function round2(val: number): number {
  return Math.round((Number(val) || 0) * 100) / 100;
}

/**
 * Formats quarter-point Fantasy totals cleanly (e.g. 140.75 -> "140.75", 147 -> "147", 37.5 -> "37.5")
 */
export function formatFptsExact(val: number): string {
  const r2 = round2(val);
  if (Number.isInteger(r2)) return String(r2);
  if (Math.abs((r2 * 10) % 1) < 1e-6) return r2.toFixed(1);
  return r2.toFixed(2);
}

export function computeOfficialGameFptsBreakdown(
  g: Pick<
    PlayerGameLog,
    | 'fgm'
    | 'fga'
    | 'ftm'
    | 'fta'
    | 'fg3m'
    | 'fg3a'
    | 'oreb'
    | 'dreb'
    | 'assists'
    | 'steals'
    | 'blocks'
    | 'turnovers'
  >,
  ejections = 0
): OfficialGameFptsBreakdown {
  const w = OFFICIAL_LEAGUE_RULES.weights;

  const fgm = Math.max(0, Number(g.fgm) || 0);
  const fga = Math.max(fgm, Number(g.fga) || 0);
  const fgmi = Math.max(0, fga - fgm);

  const ftm = Math.max(0, Number(g.ftm) || 0);
  const fta = Math.max(ftm, Number(g.fta) || 0);
  const ftmi = Math.max(0, fta - ftm);

  const fg3m = Math.max(0, Number(g.fg3m) || 0);
  const fg3a = Math.max(fg3m, Number(g.fg3a) || 0);
  const fg3mi = Math.max(0, fg3a - fg3m);

  const oreb = Math.max(0, Number(g.oreb) || 0);
  const dreb = Math.max(0, Number(g.dreb) || 0);
  const ast = Math.max(0, Number(g.assists) || 0);
  const stl = Math.max(0, Number(g.steals) || 0);
  const blk = Math.max(0, Number(g.blocks) || 0);
  const tov = Math.max(0, Number(g.turnovers) || 0);
  const ej = Math.max(0, Number(ejections) || 0);

  const fgmPts = fgm * w.fgm;
  const fgmiPts = fgmi * w.fgmi;
  const ftmPts = ftm * w.ftm;
  const ftmiPts = ftmi * w.ftmi;
  const fg3mPts = fg3m * w.fg3m;
  const fg3miPts = fg3mi * w.fg3mi;
  const orebPts = oreb * w.oreb;
  const drebPts = dreb * w.dreb;
  const astPts = ast * w.ast;
  const stlPts = stl * w.stl;
  const blkPts = blk * w.blk;
  const tovPts = tov * w.tov;
  const ejPts = ej * w.ej;

  const shootingMakePts = round2(fgmPts + fg3mPts + ftmPts);
  const shootingMissPenaltyPts = round2(fgmiPts + fg3miPts + ftmiPts);
  const reboundPts = round2(orebPts + drebPts);
  const playmakingDefensePts = round2(astPts + stlPts + blkPts);
  const negativeDisciplinePts = round2(tovPts + ejPts);

  const totalFpts = round2(
    fgmPts +
      fgmiPts +
      ftmPts +
      ftmiPts +
      fg3mPts +
      fg3miPts +
      orebPts +
      drebPts +
      astPts +
      stlPts +
      blkPts +
      tovPts +
      ejPts
  );

  return {
    fgm,
    fga,
    fgmi,
    ftm,
    fta,
    ftmi,
    fg3m,
    fg3a,
    fg3mi,
    oreb,
    dreb,
    ast,
    stl,
    blk,
    tov,
    ejections: ej,
    fgmPts: round2(fgmPts),
    fgmiPts: round2(fgmiPts),
    ftmPts: round2(ftmPts),
    ftmiPts: round2(ftmiPts),
    fg3mPts: round2(fg3mPts),
    fg3miPts: round2(fg3miPts),
    orebPts: round2(orebPts),
    drebPts: round2(drebPts),
    astPts: round2(astPts),
    stlPts: round2(stlPts),
    blkPts: round2(blkPts),
    tovPts: round2(tovPts),
    ejPts: round2(ejPts),
    shootingMakePts,
    shootingMissPenaltyPts,
    reboundPts,
    playmakingDefensePts,
    negativeDisciplinePts,
    totalFpts,
  };
}

export function computeOfficialGameFpts(
  g: Pick<
    PlayerGameLog,
    | 'fgm'
    | 'fga'
    | 'ftm'
    | 'fta'
    | 'fg3m'
    | 'fg3a'
    | 'oreb'
    | 'dreb'
    | 'assists'
    | 'steals'
    | 'blocks'
    | 'turnovers'
  >,
  ejections = 0
): number {
  return computeOfficialGameFptsBreakdown(g, ejections).totalFpts;
}

export interface PlayerOfficialFantasyStats {
  gamesPlayed: number;
  currentSeasonGamesPlayed: number;
  minutesAvg: number;
  seasonTotalFpts: number;
  seasonAvgFpts: number;
  last5AvgFpts: number;
  last10AvgFpts: number;
  formDeltaLast5: number;
  weightedFptsPerGame: number;
  stdDevFpts: number;
  floorFpts: number;
  ceilingFpts: number;
  avgShootingMakePts: number;
  avgShootingMissPenaltyPts: number;
  avgReboundPts: number;
  avgOreb: number;
  avgDreb: number;
  avgPlaymakingDefensePts: number;
  avgNegativeDisciplinePts: number;
  avgTurnovers: number;
}

export function computePlayerOfficialFantasyStats(
  player: PlayerSummary,
  seasonEjections = 0,
  gameCorrections?: Record<string, { fptsDelta: number; reason?: string }>
): PlayerOfficialFantasyStats {
  const allGames = player.games || [];
  if (allGames.length === 0) {
    return {
      gamesPlayed: 0,
      currentSeasonGamesPlayed: 0,
      minutesAvg: 0,
      seasonTotalFpts: 0,
      seasonAvgFpts: 0,
      last5AvgFpts: 0,
      last10AvgFpts: 0,
      formDeltaLast5: 0,
      weightedFptsPerGame: 0,
      stdDevFpts: 0,
      floorFpts: 0,
      ceilingFpts: 0,
      avgShootingMakePts: 0,
      avgShootingMissPenaltyPts: 0,
      avgReboundPts: 0,
      avgOreb: 0,
      avgDreb: 0,
      avgPlaymakingDefensePts: 0,
      avgNegativeDisciplinePts: 0,
      avgTurnovers: 0,
    };
  }

  // Strictly evaluate 2026-27 current season games
  const g2027 = allGames.filter((g) => g.seasonLabel === '2026-27');
  if (g2027.length === 0) {
    return {
      gamesPlayed: 0,
      currentSeasonGamesPlayed: 0,
      minutesAvg: 0,
      seasonTotalFpts: 0,
      seasonAvgFpts: 0,
      last5AvgFpts: 0,
      last10AvgFpts: 0,
      formDeltaLast5: 0,
      weightedFptsPerGame: 0,
      stdDevFpts: 0,
      floorFpts: 0,
      ceilingFpts: 0,
      avgShootingMakePts: 0,
      avgShootingMissPenaltyPts: 0,
      avgReboundPts: 0,
      avgOreb: 0,
      avgDreb: 0,
      avgPlaymakingDefensePts: 0,
      avgNegativeDisciplinePts: 0,
      avgTurnovers: 0,
    };
  }

  const evalGames = g2027;
  const breakdowns = evalGames.map((g) => {
    const base = computeOfficialGameFptsBreakdown(g, 0);
    if (!gameCorrections) return base;
    const corr = gameCorrections[`${player.id}:${g.eventId}`] || gameCorrections[`${player.id}:${g.date}`];
    if (corr && typeof corr.fptsDelta === 'number' && Number.isFinite(corr.fptsDelta)) {
      return {
        ...base,
        totalFpts: round2(base.totalFpts + corr.fptsDelta),
      };
    }
    return base;
  });
  const ejPenaltyTotal =
    seasonEjections > 0 ? seasonEjections * OFFICIAL_LEAGUE_RULES.weights.ej : 0;
  const ejPenaltyPerGame =
    ejPenaltyTotal !== 0 && evalGames.length > 0
      ? ejPenaltyTotal / evalGames.length
      : 0;

  const gameTotals = breakdowns.map((b) => round2(b.totalFpts + ejPenaltyPerGame));
  const gp = evalGames.length;
  const rawSum = breakdowns.reduce((s, b) => s + b.totalFpts, 0) + ejPenaltyTotal;
  const seasonTotalFpts = round2(rawSum);

  const meanVal = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, x) => s + x, 0) / arr.length;

  const seasonAvg = gp > 0 ? rawSum / gp : 0;
  const last5 = gameTotals.slice(0, Math.min(5, gameTotals.length));
  const last10 = gameTotals.slice(0, Math.min(10, gameTotals.length));
  const last5Avg = meanVal(last5);
  const last10Avg = meanVal(last10);

  const weighted =
    gp >= 4 ? seasonAvg * 0.65 + last5Avg * 0.35 : seasonAvg;

  let variance = 0;
  if (gameTotals.length >= 2) {
    for (const v of gameTotals) {
      const diff = v - seasonAvg;
      variance += diff * diff;
    }
    variance /= gameTotals.length;
  }
  const sd = Math.sqrt(variance);
  const sorted = [...gameTotals].sort((a, b) => a - b);
  const p15Idx = Math.floor((sorted.length - 1) * 0.15);
  const p85Idx = Math.ceil((sorted.length - 1) * 0.85);

  return {
    gamesPlayed: gp,
    currentSeasonGamesPlayed: g2027.length,
    minutesAvg: round1(meanVal(evalGames.map((g) => g.minutes))),
    seasonTotalFpts,
    seasonAvgFpts: round1(seasonAvg),
    last5AvgFpts: round1(last5Avg),
    last10AvgFpts: round1(last10Avg),
    formDeltaLast5: round1(last5Avg - seasonAvg),
    weightedFptsPerGame: round1(weighted),
    stdDevFpts: round1(sd),
    floorFpts: round2(sorted[p15Idx] ?? seasonAvg),
    ceilingFpts: round2(sorted[p85Idx] ?? seasonAvg),
    avgShootingMakePts: round2(meanVal(breakdowns.map((b) => b.shootingMakePts))),
    avgShootingMissPenaltyPts: round2(
      meanVal(breakdowns.map((b) => b.shootingMissPenaltyPts))
    ),
    avgReboundPts: round2(meanVal(breakdowns.map((b) => b.reboundPts))),
    avgOreb: round1(meanVal(evalGames.map((g) => g.oreb))),
    avgDreb: round1(meanVal(evalGames.map((g) => g.dreb))),
    avgPlaymakingDefensePts: round2(
      meanVal(breakdowns.map((b) => b.playmakingDefensePts))
    ),
    avgNegativeDisciplinePts: round2(
      meanVal(breakdowns.map((b) => b.negativeDisciplinePts)) + ejPenaltyPerGame
    ),
    avgTurnovers: round1(meanVal(evalGames.map((g) => g.turnovers))),
  };
}

export interface PlayerAvailabilityContext {
  recentConsecutiveTeamMisses: number;
  eligibleB2Bs: number;
  satOutB2Bs: number;
  b2bRestRate: number;
  hasB2BRestPattern: boolean;
}

/**
 * Empirically inspects 2026-27 player logs against team game logs to separate:
 * 1) Multi-week ongoing absences (missed >= 5 straight team games)
 * 2) Punctual Back-to-Back load-management rest patterns (missed >= 45% of B2Bs while active in adjacent games)
 */
export function analyzePlayerAvailabilityContext(
  player?: PlayerSummary,
  teamGames?: TeamGameLog[]
): PlayerAvailabilityContext {
  if (!player || !Array.isArray(teamGames) || teamGames.length === 0) {
    return {
      recentConsecutiveTeamMisses: 0,
      eligibleB2Bs: 0,
      satOutB2Bs: 0,
      b2bRestRate: 0,
      hasB2BRestPattern: false,
    };
  }

  const teamGames2027 = teamGames.filter((g) => g.seasonLabel === '2026-27');
  const playerGames2027 = (player.games || []).filter((g) => g.seasonLabel === '2026-27');

  if (teamGames2027.length === 0) {
    return {
      recentConsecutiveTeamMisses: 0,
      eligibleB2Bs: 0,
      satOutB2Bs: 0,
      b2bRestRate: 0,
      hasB2BRestPattern: false,
    };
  }

  const playedDates = new Set<string>();
  let minSum = 0;
  for (const pg of playerGames2027) {
    if (pg.minutes > 0) {
      playedDates.add(pg.date);
      minSum += pg.minutes;
    }
  }
  const avgMin = playerGames2027.length > 0 ? minSum / playerGames2027.length : 0;

  // teamGames2027 is ordered newest -> oldest
  let recentConsecutiveTeamMisses = 0;
  for (const tg of teamGames2027) {
    if (!playedDates.has(tg.date)) {
      recentConsecutiveTeamMisses += 1;
    } else {
      break;
    }
  }

  let eligibleB2Bs = 0;
  let satOutB2Bs = 0;

  if (avgMin >= 18 && playerGames2027.length >= 4) {
    for (let i = 0; i < teamGames2027.length; i += 1) {
      const tg = teamGames2027[i];
      if (!tg.isBackToBack) continue;
      // Check adjacent games (i + 1 is the 1st leg of the B2B, i - 1 is the next game after the B2B)
      const firstLeg = teamGames2027[i + 1];
      const nextAfter = teamGames2027[i - 1];
      const playedFirstLeg = firstLeg ? playedDates.has(firstLeg.date) : false;
      const playedNextAfter = nextAfter ? playedDates.has(nextAfter.date) : false;

      if (playedFirstLeg || playedNextAfter) {
        eligibleB2Bs += 1;
        if (!playedDates.has(tg.date)) {
          satOutB2Bs += 1;
        }
      }
    }
  }

  const b2bRestRate = eligibleB2Bs > 0 ? round2(satOutB2Bs / eligibleB2Bs) : 0;
  const hasB2BRestPattern = eligibleB2Bs >= 2 && b2bRestRate >= 0.45;

  return {
    recentConsecutiveTeamMisses,
    eligibleB2Bs,
    satOutB2Bs,
    b2bRestRate,
    hasB2BRestPattern,
  };
}

export interface WaiverRoleBreakoutSignal {
  sampleGames: number;
  seasonMinAvg: number;
  recentMinAvg: number;
  minDelta: number;
  seasonUsgAvg: number;
  recentUsgAvg: number;
  usgDelta: number;
  promotedToStarter: boolean;
}

/**
 * Fantasy-tuned role breakout detector for Free Agents (catches emerging 17-26 MIN rotation
 * players gaining minutes, usage, or a starting spot in their last 3-4 games).
 */
export function evaluateWaiverRoleBreakout(
  player: PlayerSummary
): WaiverRoleBreakoutSignal | null {
  const g2027 = (player.games || []).filter(
    (g) => g.seasonLabel === '2026-27' && g.minutes > 0
  );
  if (g2027.length < 4) return null;

  const sampleGames = g2027.length >= 7 ? 4 : 3;
  const recent = g2027.slice(0, sampleGames);
  const prior = g2027.slice(sampleGames);
  if (prior.length === 0) return null;

  const mean = (arr: PlayerGameLog[], fn: (g: PlayerGameLog) => number) =>
    arr.reduce((s, g) => s + fn(g), 0) / arr.length;

  const seasonMinAvg = round1(mean(g2027, (g) => g.minutes));
  const recentMinAvg = round1(mean(recent, (g) => g.minutes));
  const priorMinAvg = round1(mean(prior, (g) => g.minutes));
  const minDeltaVsSeason = round1(recentMinAvg - seasonMinAvg);
  const minDeltaVsPrior = round1(recentMinAvg - priorMinAvg);
  const effectiveMinDelta = round1(
    Math.max(minDeltaVsSeason, minDeltaVsPrior * 0.72)
  );

  const seasonUsgAvg = round1(mean(g2027, (g) => g.usgEst));
  const recentUsgAvg = round1(mean(recent, (g) => g.usgEst));
  const usgDelta = round1(recentUsgAvg - seasonUsgAvg);

  const recentStarterRate = mean(recent, (g) => (g.isStarter ? 1 : 0));
  const priorStarterRate = mean(prior, (g) => (g.isStarter ? 1 : 0));
  const promotedToStarter =
    recentStarterRate >= 0.66 && priorStarterRate <= 0.34;

  if (recentMinAvg < 17.5) return null;

  const qualifies =
    effectiveMinDelta >= 3.2 ||
    usgDelta >= 2.8 ||
    (promotedToStarter && effectiveMinDelta >= 1.5);

  if (!qualifies) return null;

  return {
    sampleGames,
    seasonMinAvg,
    recentMinAvg,
    minDelta: effectiveMinDelta,
    seasonUsgAvg,
    recentUsgAvg,
    usgDelta,
    promotedToStarter,
  };
}

export interface WeeklyLockProjectionResult {
  rawFormulaFpts: number; // Exact rule: Partidos en la Semana × Media FPTS/Partido
  scheduledGames: number;
  playableGamesEst: number;
  missedInjuryGamesEst: number;
  b2bRestRiskGamesEst: number;
  lockAdjustedFpts: number; // Smart lock optimizer score accounting for 0-FPTS injury/B2B risk & recent form
  healthMultiplier: number;
  absenceTier: FantasyAbsenceTier;
  absenceLabelEs: string;
  riskWarningEs: string | null;
}

/**
 * Under Strict Weekly Lineup Lock (Monday lock, 0 FPTS for missed games, no mid-week subs),
 * differentiates:
 * - Long-term absences (IR / Suspension / Multi-week Out -> 0.0 playable games)
 * - Punctual Day-to-Day / Questionable / Doubtful / 1-game Out absences
 * - Back-to-Back load-management / rest risk when b2bGames > 0
 */
export function computeWeeklyLockProjection(params: {
  scheduledGames: number;
  b2bGames?: number;
  stats: PlayerOfficialFantasyStats;
  injurySeverity?: FantasyInjurySeverity;
  injuryAbsenceTier?: FantasyAbsenceTier;
  injuryDetailEs?: string;
  availabilityContext?: PlayerAvailabilityContext;
  projectionMode?: FantasyProjectionMode;
}): WeeklyLockProjectionResult {
  const {
    scheduledGames,
    b2bGames = 0,
    stats,
    injurySeverity = 'healthy',
    injuryAbsenceTier,
    injuryDetailEs = '',
    availabilityContext,
    projectionMode = 'smart',
  } = params;

  const rawFormulaFpts = round1(scheduledGames * stats.seasonAvgFpts);
  if (scheduledGames <= 0) {
    return {
      rawFormulaFpts: 0,
      scheduledGames: 0,
      playableGamesEst: 0,
      missedInjuryGamesEst: 0,
      b2bRestRiskGamesEst: 0,
      lockAdjustedFpts: 0,
      healthMultiplier: 0,
      absenceTier:
        injurySeverity === 'ir' || injurySeverity === 'suspended'
          ? 'long_term'
          : injuryAbsenceTier || 'healthy',
      absenceLabelEs: 'Sin partidos',
      riskWarningEs: null,
    };
  }

  const detail = (injuryDetailEs || '').toLowerCase();
  const isRestKeyword =
    injuryAbsenceTier === 'b2b_rest' ||
    /\b(?:descanso|dosificaci|gesti[oó]n de cargas|load management|injury management|rest)\b/i.test(
      detail
    );
  const isLongTermKeyword =
    injuryAbsenceTier === 'long_term' ||
    /\b(?:cirug|rotura|cruzado|fractur|meses|indefinid|temporada|prolongad|aquiles|menisco|8-10|6-8|4-6|3-4|2-4)\b/i.test(
      detail
    ) ||
    (detail.includes('semana') &&
      !detail.includes('esta semana') &&
      !detail.includes('proxima semana'));

  const consecutiveMisses = availabilityContext?.recentConsecutiveTeamMisses ?? 0;
  const hasB2BPattern = availabilityContext?.hasB2BRestPattern ?? false;
  const b2bRestRate = availabilityContext?.b2bRestRate ?? 0;
  const satOutB2Bs = availabilityContext?.satOutB2Bs ?? 0;
  const eligibleB2Bs = availabilityContext?.eligibleB2Bs ?? 0;

  let playableGamesEst = scheduledGames;
  let missedInjuryGamesEst = 0;
  let b2bRestRiskGamesEst = 0;
  let absenceTier: FantasyAbsenceTier = 'healthy';
  let absenceLabelEs = 'Disponible';
  let riskWarningEs: string | null = null;

  // 1. LONG-TERM ABSENCES (Out long-term, IR, Suspension, or Out + >= 5 consecutive missed team games)
  if (
    injurySeverity === 'ir' ||
    injurySeverity === 'suspended' ||
    (injurySeverity === 'out' &&
      (isLongTermKeyword || consecutiveMisses >= 5))
  ) {
    playableGamesEst = 0;
    missedInjuryGamesEst = scheduledGames;
    absenceTier = 'long_term';
    absenceLabelEs =
      injurySeverity === 'ir'
        ? 'Larga duración (IR · 0 PJ)'
        : injurySeverity === 'suspended'
        ? 'Sanción fija (0 PJ)'
        : 'Larga duración (0 PJ)';
    riskWarningEs =
      injurySeverity === 'suspended'
        ? 'Sancionado: suma 0.0 FPTS sin relevo entre semana'
        : injurySeverity === 'ir'
        ? 'Lista IR: baja de larga duración confirmada (0.0 FPTS)'
        : `Baja de larga duración (${
            consecutiveMisses >= 5
              ? `${consecutiveMisses} partidos seguidos ausente`
              : 'parte prolongado'
          }): 0.0 FPTS`;
  }
  // 2. SHORT-TERM / PUNCTUAL 'OUT' (1-game absence or load-management rest day)
  else if (injurySeverity === 'out') {
    if (isRestKeyword) {
      absenceTier = 'b2b_rest';
      b2bRestRiskGamesEst = Math.min(
        scheduledGames,
        projectionMode === 'conservative' ? 1.5 : 1.0
      );
      playableGamesEst = round1(Math.max(0, scheduledGames - b2bRestRiskGamesEst));
      absenceLabelEs = `Descanso puntual (${playableGamesEst}/${scheduledGames} PJ)`;
      riskWarningEs = `Descanso / gestión de cargas: se proyectan ${playableGamesEst} de ${scheduledGames} PJ jugables`;
    } else {
      absenceTier = 'punctual';
      const baseMiss =
        scheduledGames <= 1
          ? 1
          : projectionMode === 'conservative'
          ? Math.min(scheduledGames, 2.0)
          : 1.2;
      const extraB2B =
        b2bGames > 0 && scheduledGames - baseMiss > 1
          ? round1(b2bGames * (projectionMode === 'conservative' ? 0.45 : 0.3))
          : 0;
      missedInjuryGamesEst = round1(Math.min(scheduledGames, baseMiss));
      b2bRestRiskGamesEst = round1(
        Math.min(Math.max(0, scheduledGames - missedInjuryGamesEst), extraB2B)
      );
      playableGamesEst = round1(
        Math.max(0, scheduledGames - missedInjuryGamesEst - b2bRestRiskGamesEst)
      );
      absenceLabelEs = `Baja puntual (${playableGamesEst}/${scheduledGames} PJ)`;
      riskWarningEs = `Baja puntual de corto plazo: ~${playableGamesEst} de ${scheduledGames} PJ estimados${
        b2bRestRiskGamesEst > 0 ? ' (incluye cautela B2B)' : ''
      }`;
    }
  }
  // 3. DOUBTFUL (Puntual high-risk)
  else if (injurySeverity === 'doubtful') {
    absenceTier = 'punctual';
    const mult = projectionMode === 'conservative' ? 0.25 : 0.42;
    const afterInj = scheduledGames * mult;
    missedInjuryGamesEst = round1(scheduledGames - afterInj);
    if (b2bGames > 0 && afterInj > 0.4) {
      b2bRestRiskGamesEst = round1(Math.min(afterInj * 0.5, b2bGames * 0.3));
    }
    playableGamesEst = round1(Math.max(0, afterInj - b2bRestRiskGamesEst));
    absenceLabelEs = `Muy dudoso (${playableGamesEst}/${scheduledGames} PJ)`;
    riskWarningEs = `Muy dudoso: alto riesgo de perder ~${round1(
      scheduledGames - playableGamesEst
    )} PJ tras el bloqueo`;
  }
  // 4. QUESTIONABLE / DAY-TO-DAY (Puntual DTD + B2B interaction)
  else if (injurySeverity === 'questionable' || injurySeverity === 'dtd') {
    absenceTier = isRestKeyword && b2bGames > 0 ? 'b2b_rest' : 'punctual';
    const baseMult =
      injurySeverity === 'dtd'
        ? projectionMode === 'conservative'
          ? 0.68
          : 0.82
        : projectionMode === 'conservative'
        ? 0.62
        : 0.76;
    const afterInj = scheduledGames * baseMult;
    missedInjuryGamesEst = round1(scheduledGames - afterInj);

    if (b2bGames > 0 && afterInj > 1) {
      const b2bFactor =
        hasB2BPattern || isRestKeyword
          ? 0.55
          : projectionMode === 'conservative'
          ? 0.45
          : 0.35;
      b2bRestRiskGamesEst = round1(Math.min(afterInj - 0.5, b2bGames * b2bFactor));
    }
    playableGamesEst = round1(Math.max(0, afterInj - b2bRestRiskGamesEst));
    absenceLabelEs =
      b2bRestRiskGamesEst > 0
        ? `DTD + B2B (${playableGamesEst}/${scheduledGames} PJ)`
        : `Puntual DTD (${playableGamesEst}/${scheduledGames} PJ)`;
    riskWarningEs =
      b2bRestRiskGamesEst > 0
        ? `Día a día en semana con ${b2bGames} B2B: riesgo combinado (~${playableGamesEst}/${scheduledGames} PJ)`
        : `Baja puntual en evaluación (DTD/Q): ~${playableGamesEst} de ${scheduledGames} PJ proyectados`;
  }
  // 5. PROBABLE
  else if (injurySeverity === 'probable') {
    const afterInj = scheduledGames * (projectionMode === 'conservative' ? 0.9 : 0.95);
    missedInjuryGamesEst = round1(scheduledGames - afterInj);
    if (b2bGames > 0 && (hasB2BPattern || isRestKeyword)) {
      b2bRestRiskGamesEst = round1(
        Math.min(afterInj - 1, b2bGames * (projectionMode === 'conservative' ? 0.55 : 0.4))
      );
      absenceTier = 'b2b_rest';
    } else {
      absenceTier = 'punctual';
    }
    playableGamesEst = round1(Math.max(0, afterInj - b2bRestRiskGamesEst));
    absenceLabelEs =
      b2bRestRiskGamesEst > 0
        ? `Probable · Riesgo B2B (${playableGamesEst}/${scheduledGames} PJ)`
        : `Probable (${playableGamesEst}/${scheduledGames} PJ)`;
    if (b2bRestRiskGamesEst > 0) {
      riskWarningEs = `Probable pero con historial/riesgo de descanso en Back-to-Back`;
    }
  }
  // 6. HEALTHY ON REPORT, CHECK EMPIRICAL BACK-TO-BACK LOAD MANAGEMENT
  else if (b2bGames > 0 && (hasB2BPattern || isRestKeyword) && scheduledGames >= 2) {
    absenceTier = 'b2b_rest';
    const perB2BDisc = isRestKeyword
      ? 0.6
      : projectionMode === 'conservative'
      ? Math.max(0.6, round2(b2bRestRate * 0.95))
      : Math.max(0.45, Math.min(0.75, round2(b2bRestRate * 0.85)));
    b2bRestRiskGamesEst = round1(Math.min(scheduledGames - 1, b2bGames * perB2BDisc));
    playableGamesEst = round1(Math.max(1, scheduledGames - b2bRestRiskGamesEst));
    absenceLabelEs =
      eligibleB2Bs >= 2
        ? `Riesgo B2B (${satOutB2Bs}/${eligibleB2Bs} descansos)`
        : `Riesgo descanso B2B`;
    riskWarningEs =
      eligibleB2Bs >= 2
        ? `Descansó en ${satOutB2Bs} de ${eligibleB2Bs} B2B este curso: ajuste a ${playableGamesEst}/${scheduledGames} PJ`
        : `Semana con ${b2bGames} Back-to-Back y alerta de dosificación (${playableGamesEst}/${scheduledGames} PJ)`;
  }

  const healthMultiplier =
    scheduledGames > 0 ? round2(playableGamesEst / scheduledGames) : 0;
  const lockAdjustedFpts = round1(playableGamesEst * stats.weightedFptsPerGame);

  return {
    rawFormulaFpts,
    scheduledGames,
    playableGamesEst,
    missedInjuryGamesEst,
    b2bRestRiskGamesEst,
    lockAdjustedFpts,
    healthMultiplier,
    absenceTier,
    absenceLabelEs,
    riskWarningEs,
  };
}

export function normalizePlayerLookupKey(raw: string): string {
  const norm = (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:jr|sr|ii|iii|iv)\b\.?/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (norm === 'chet holmgrem') return 'chet holmgren';
  return norm;
}

/**
 * Parses text copied directly from an ESPN Fantasy Team or League Rosters page
 * (e.g. Ctrl+A, Ctrl+C on https://fantasy.espn.com/basketball/team?leagueId=445109163&teamId=11&seasonId=2027)
 * and extracts matched NBA players in exact appearance order, detecting Bench/IR slots when present.
 */
export function parseCopiedEspnTextToPlayers(
  rawText: string,
  allPlayers: PlayerSummary[],
  maxCount = 300
): Array<{ player: PlayerSummary; detectedSlot: 'starter' | 'bench' }> {
  if (!rawText || !rawText.trim() || allPlayers.length === 0) return [];

  const byNormExact = new Map<string, PlayerSummary[]>();
  const byNormRaw = new Map<string, PlayerSummary[]>();

  for (const p of allPlayers) {
    const k1 = normalizePlayerLookupKey(p.name);
    const k2 = (p.name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (k1) {
      const list = byNormExact.get(k1) || [];
      list.push(p);
      byNormExact.set(k1, list);
    }
    if (k2) {
      const list = byNormRaw.get(k2) || [];
      list.push(p);
      byNormRaw.set(k2, list);
    }
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: Array<{ player: PlayerSummary; detectedSlot: 'starter' | 'bench' }> = [];
  const seenIds = new Set<string>();
  let inBenchSection = false;
  let recentBenchTag = false;

  for (const line of lines) {
    if (results.length >= maxCount) break;

    if (/^(?:bench|banquillo|reservas|ir|injured reserve)\b/i.test(line)) {
      if (/^bench$/i.test(line) || /^banquillo$/i.test(line) || /^ir$/i.test(line)) {
        recentBenchTag = true;
        if (/bench|banquillo/i.test(line)) inBenchSection = true;
        continue;
      }
    }

    const startsWithBenchSlot = /^(?:BE|Bench|IR)\b[\s\t]+/i.test(line);
    const startsWithActiveSlot = /^(?:PG|SG|SF|PF|C|G|F|UTIL|SG\/SF|G\/F|F\/C)\b[\s\t]+/i.test(
      line
    );

    if (startsWithActiveSlot) {
      recentBenchTag = false;
    }

    // Clean common ESPN slot prefixes, injury tags (DTD, O, Q, SSPD), and team/pos suffixes
    const cleanedLine = line
      .replace(/^(?:PG|SG|SF|PF|C|G|F|UTIL|BE|Bench|IR)\b[\s\t]+/i, '')
      .replace(/\b(?:DTD|OUT|SSPD|O|Q|D|P)\b$/i, '')
      .split(/\t/)[0]
      .replace(
        /\s+(?:ATL|BOS|BKN|CHA|CHI|CLE|DAL|DEN|DET|GSW|GS|HOU|IND|LAC|LAL|MEM|MIA|MIL|MIN|NOP|NO|NYK|NY|OKC|ORL|PHI|PHX|POR|SAC|SAS|SA|TOR|UTA|UTAH|WAS|WSH)\b.*$/i,
        ''
      )
      .trim();

    const normRaw = cleanedLine
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const normStripped = normalizePlayerLookupKey(cleanedLine);

    const candidates =
      byNormRaw.get(normRaw) || byNormExact.get(normStripped) || null;

    if (candidates && candidates.length > 0) {
      // If multiple players share a normalized name, check if team abbreviation appears on the original line
      let chosen = candidates[0];
      if (candidates.length > 1) {
        const matchedTeam = candidates.find((c) =>
          new RegExp(`\\b${c.teamAbbr}\\b`, 'i').test(line)
        );
        if (matchedTeam) chosen = matchedTeam;
      }

      if (!seenIds.has(chosen.id)) {
        seenIds.add(chosen.id);
        const slot: 'starter' | 'bench' =
          startsWithBenchSlot || recentBenchTag || inBenchSection || results.length >= 10
            ? 'bench'
            : 'starter';
        results.push({ player: chosen, detectedSlot: slot });
        recentBenchTag = false;
      }
    }
  }

  // Fallback substring scan if user pasted comma-separated or single-line names
  if (results.length === 0 && rawText.length >= 4) {
    const chunks = rawText
      .split(/[,;|/]+|\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 4);

    for (const chunk of chunks) {
      if (results.length >= maxCount) break;
      const key = normalizePlayerLookupKey(chunk);
      if (!key || key.length < 4) continue;
      const exact = byNormExact.get(key);
      if (exact && exact[0] && !seenIds.has(exact[0].id)) {
        seenIds.add(exact[0].id);
        results.push({
          player: exact[0],
          detectedSlot: results.length >= 10 ? 'bench' : 'starter',
        });
      }
    }
  }

  return results;
}
