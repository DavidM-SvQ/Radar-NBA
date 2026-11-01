import type {
  FantasyInjurySeverity,
  PlayerGameLog,
  PlayerSummary,
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
  maxContracts: 12,
  activeStarters: 10,
  benchReserves: 2,
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
  seasonEjections = 0
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

  // Strictly evaluate 2026-27 season games whenever the player has played >= 1 game in 2026-27
  const g2027 = allGames.filter((g) => g.seasonLabel === '2026-27');
  const evalGames = g2027.length >= 1 ? g2027 : allGames.slice(0, 30);

  const breakdowns = evalGames.map((g) => computeOfficialGameFptsBreakdown(g, 0));
  const ejPenaltyTotal =
    seasonEjections > 0 ? seasonEjections * OFFICIAL_LEAGUE_RULES.weights.ej : 0;
  const ejPenaltyPerGame =
    ejPenaltyTotal !== 0 && evalGames.length > 0
      ? ejPenaltyTotal / evalGames.length
      : 0;

  const gameTotals = breakdowns.map((b) => round2(b.totalFpts + ejPenaltyPerGame));
  const gp = evalGames.length;
  const rawSum = breakdowns.reduce((s, b) => s + b.totalFpts, 0) + ejPenaltyTotal;
  const seasonTotalFpts = g2027.length >= 1 ? round2(rawSum) : 0;

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

/**
 * Under Strict Weekly Lineup Lock (Monday lock, 0 FPTS for missed games, no mid-week subs),
 * calculates both the raw rule formula (Games × Season Avg FPTS) and the health-adjusted expected volume.
 */
export function computeWeeklyLockProjection(params: {
  scheduledGames: number;
  stats: PlayerOfficialFantasyStats;
  injurySeverity?: FantasyInjurySeverity;
}): {
  rawFormulaFpts: number; // Exact rule: Partidos en la Semana × Media FPTS/Partido
  playableGamesEst: number;
  lockAdjustedFpts: number; // Smart lock optimizer score accounting for 0-FPTS injury risk & recent form
  healthMultiplier: number;
  riskWarningEs: string | null;
} {
  const { scheduledGames, stats, injurySeverity = 'healthy' } = params;
  const rawFormulaFpts = round1(scheduledGames * stats.seasonAvgFpts);

  let healthMultiplier = 1.0;
  let riskWarningEs: string | null = null;

  if (injurySeverity === 'out') {
    healthMultiplier = 0.0;
    riskWarningEs = 'Baja médica: riesgo directo de 0.0 FPTS bajo cierre semanal';
  } else if (injurySeverity === 'suspended') {
    healthMultiplier = 0.0;
    riskWarningEs = 'Sancionado: suma 0.0 FPTS sin relevo entre semana';
  } else if (injurySeverity === 'doubtful') {
    healthMultiplier = 0.35;
    riskWarningEs = 'Muy dudoso: alto peligro de perder partidos tras el bloqueo';
  } else if (injurySeverity === 'questionable') {
    healthMultiplier = 0.78;
    riskWarningEs = 'Cuestionable / Día a día: vigilar antes del cierre del lunes';
  } else if (injurySeverity === 'probable') {
    healthMultiplier = 0.95;
  }

  const playableGamesEst = round1(scheduledGames * healthMultiplier);
  const lockAdjustedFpts = round1(playableGamesEst * stats.weightedFptsPerGame);

  return {
    rawFormulaFpts,
    playableGamesEst,
    lockAdjustedFpts,
    healthMultiplier,
    riskWarningEs,
  };
}

export function normalizePlayerLookupKey(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:jr|sr|ii|iii|iv)\b\.?/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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
