import type { DraftClassSummary, DraftPickRecord } from '../types/nba';
import { NBA_TEAMS_MAP } from './teamLogos';

export type RedraftMode = 'balanced' | 'peak' | 'volume';

export type PickVerdict =
  | 'steal'
  | 'value'
  | 'par'
  | 'underperform'
  | 'untracked';

export interface EvaluatedDraftPick extends DraftPickRecord {
  hasStats: boolean;
  redraftScore: number;
  expectedScore: number;
  valueOverExpected: number;
  redraftRank: number;
  rankDelta: number; // positive = outperformed draft slot (e.g. +30)
  stealScore: number;
  missScore: number;
  verdict: PickVerdict;
}

export interface EvaluatedDraftClass {
  year: number;
  displayName: string;
  pickCount: number;
  trackedCount: number;
  activeIn2027Count: number;
  coveragePct: number;
  isPartialLegacyCoverage: boolean;
  classPowerIndex: number;
  classGrade: 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C';
  top5AvgScore: number;
  top10AvgScore: number;
  starsCount: number; // careerPeakPpg >= 20 or careerPeakGmSc >= 16.5
  startersCount: number; // redraftScore >= 36
  stealsCount: number;
  lotteryHitRatePct: number; // % of lottery picks (1-14) reaching >= 34 score
  originalNumberOne: EvaluatedDraftPick | null;
  redraftNumberOne: EvaluatedDraftPick | null;
  numberOneHeld: boolean;
  biggestSteal: EvaluatedDraftPick | null;
  biggestLotteryDrop: EvaluatedDraftPick | null;
  picksByRedraft: EvaluatedDraftPick[];
  picksByOriginal: EvaluatedDraftPick[];
}

export interface FranchiseDraftEfficiency {
  teamAbbr: string;
  teamName: string;
  totalPicks: number;
  lotteryPicks: number;
  firstRoundPicks: number;
  secondRoundPicks: number;
  trackedPicks: number;
  active2027Picks: number;
  stealsCount: number;
  starsCount: number;
  avgPickOverall: number;
  avgRedraftScore: number;
  avgValueOverExpected: number;
  totalValueOverExpected: number;
  bestPick: EvaluatedDraftPick | null;
  biggestSteal: EvaluatedDraftPick | null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round((Number(n) || 0) * 10) / 10;
}

/**
 * Smooth historical NBA Draft expected value curve by overall slot (#1 to #60).
 * Calibrated on the same 0-100 scale as the Re-Draft composite index:
 * #1 ≈ 70, #3 ≈ 55.7, #5 ≈ 48.2, #10 ≈ 37.3, #14 ≈ 32.0, #20 ≈ 26.6, #30 ≈ 20.9, #45 ≈ 16.0, #60 ≈ 12.9.
 */
export function getExpectedScoreByPick(overall: number): number {
  const slot = Math.max(1, Math.min(65, Number(overall) || 60));
  const raw = 70 / (1 + 0.145 * Math.pow(slot - 1, 0.82));
  return round1(clamp(raw, 10, 70));
}

export function getRedraftModeMeta(mode: RedraftMode): {
  label: string;
  shortLabel: string;
  description: string;
} {
  if (mode === 'peak') {
    return {
      label: 'Techo / Estrellas',
      shortLabel: 'Techo',
      description:
        'Prioriza el pico máximo de Game Score, anotación techo y rendimiento actual 2026–27 para premiar a los jugadores franquicia.',
    };
  }
  if (mode === 'volume') {
    return {
      label: 'Volumen Acumulado',
      shortLabel: 'Volumen',
      description:
        'Prioriza puntos totales acumulados, partidos jugados de carrera y experiencia en Playoffs.',
    };
  }
  return {
    label: 'Integral (Equilibrado)',
    shortLabel: 'Integral',
    description:
      'Equilibra impacto por partido (Game Score y producción global), techo de estrella, durabilidad en carrera y Playoffs.',
  };
}

export function getVerdictMeta(verdict: PickVerdict): {
  label: string;
  shortLabel: string;
  textClass: string;
  bgClass: string;
} {
  if (verdict === 'steal') {
    return {
      label: 'Robo del Draft',
      shortLabel: 'Robo',
      textClass: 'text-emerald-300',
      bgClass: 'bg-emerald-500/15 border-emerald-500/35',
    };
  }
  if (verdict === 'value') {
    return {
      label: 'Gran Acierto',
      shortLabel: 'Acierto',
      textClass: 'text-sky-300',
      bgClass: 'bg-sky-500/15 border-sky-500/35',
    };
  }
  if (verdict === 'underperform') {
    return {
      label: 'Por Debajo',
      shortLabel: 'Por debajo',
      textClass: 'text-rose-300',
      bgClass: 'bg-rose-500/15 border-rose-500/35',
    };
  }
  if (verdict === 'par') {
    return {
      label: 'Acorde al Pick',
      shortLabel: 'Acorde',
      textClass: 'text-slate-300',
      bgClass: 'bg-slate-700/30 border-slate-600/40',
    };
  }
  return {
    label: 'Sin muestra NBA',
    shortLabel: 'Sin datos',
    textClass: 'text-slate-500',
    bgClass: 'bg-[#0B1120] border-[#1E293B]',
  };
}

export interface DraftGradeDescriptor {
  grade: EvaluatedDraftClass['classGrade'];
  minPower: number;
  rangeLabel: string;
  title: string;
  description: string;
}

export const DRAFT_GRADE_SCALE: DraftGradeDescriptor[] = [
  {
    grade: 'S',
    minPower: 74,
    rangeLabel: '≥ 74 pts',
    title: 'Camada Histórica',
    description:
      'Generación legendaria con múltiples superestrellas MVP/All-NBA y una profundidad sobresaliente.',
  },
  {
    grade: 'A+',
    minPower: 66,
    rangeLabel: '66 – 73,9',
    title: 'Camada Élite',
    description:
      'Top 5 de altísimo nivel y varias estrellas consolidadas con gran impacto sostenido.',
  },
  {
    grade: 'A',
    minPower: 58,
    rangeLabel: '58 – 65,9',
    title: 'Muy Fuerte',
    description:
      'Por encima de la media histórica NBA tanto en estrellas de franquicia como en titulares fiables.',
  },
  {
    grade: 'B+',
    minPower: 50,
    rangeLabel: '50 – 57,9',
    title: 'Notable Alta',
    description:
      'Buena camada con referentes claros y una base sólida de jugadores de rotación activa.',
  },
  {
    grade: 'B',
    minPower: 42,
    rangeLabel: '42 – 49,9',
    title: 'Sólida / Media NBA',
    description:
      'Rendimiento estándar de la liga; habitual también en camadas jóvenes que siguen creciendo.',
  },
  {
    grade: 'C+',
    minPower: 32,
    rangeLabel: '32 – 41,9',
    title: 'Discreta o en Desarrollo',
    description:
      'Pocas estrellas todavía o camada muy reciente (rookies/sophomores) sin recorrido acumulado.',
  },
  {
    grade: 'C',
    minPower: 0,
    rangeLabel: '< 32 pts',
    title: 'Baja o Muestra Parcial',
    description:
      'Escaso impacto registrado (o camada antigua donde casi toda la generación ya está retirada).',
  },
];

export function getClassGradeMeta(
  grade: EvaluatedDraftClass['classGrade']
): DraftGradeDescriptor {
  return (
    DRAFT_GRADE_SCALE.find((item) => item.grade === grade) ||
    DRAFT_GRADE_SCALE[DRAFT_GRADE_SCALE.length - 1]
  );
}

export function getClassGradeStyle(grade: EvaluatedDraftClass['classGrade']): string {
  if (grade === 'S') return 'text-amber-300 border-amber-400/40 bg-amber-500/15';
  if (grade === 'A+' || grade === 'A') return 'text-emerald-300 border-emerald-400/40 bg-emerald-500/15';
  if (grade === 'B+' || grade === 'B') return 'text-sky-300 border-sky-400/40 bg-sky-500/15';
  return 'text-slate-300 border-slate-600/40 bg-slate-700/30';
}

export function computeRedraftScore(pick: DraftPickRecord, mode: RedraftMode): {
  hasStats: boolean;
  score: number;
} {
  const gp = Math.max(pick.careerGp ?? 0, pick.season27Gp ?? 0);
  if (gp <= 0) {
    return { hasStats: false, score: 0 };
  }

  const ppg = pick.careerPpg ?? pick.season27PtsPg ?? 0;
  const rpg = pick.careerRpg ?? pick.season27RebPg ?? 0;
  const apg = pick.careerApg ?? pick.season27AstPg ?? 0;
  const stl = pick.careerStlPg ?? 0;
  const blk = pick.careerBlkPg ?? 0;

  const fallbackGmSc = ppg * 0.72 + rpg * 0.42 + apg * 0.58 + (stl + blk) * 0.85;
  const gmSc = pick.careerGmScPg !== null && pick.careerGmScPg !== undefined ? pick.careerGmScPg : fallbackGmSc;
  const peakGmSc =
    pick.careerPeakGmSc !== null && pick.careerPeakGmSc !== undefined
      ? Math.max(pick.careerPeakGmSc, gmSc)
      : Math.max(gmSc, (pick.careerPeakPpg ?? ppg) * 0.78);
  const peakPpg = pick.careerPeakPpg ?? ppg;
  const ptsTotal = pick.careerPtsTotal ?? Math.round(ppg * gp);
  const playoffGp = pick.careerPlayoffGp ?? 0;

  const avgImpact = clamp((gmSc / 23.5) * 100, 0, 100);
  const peakImpact = clamp((peakGmSc / 27) * 100, 0, 100);
  const scoringPeak = clamp((peakPpg / 31) * 100, 0, 100);
  const volume = clamp((Math.sqrt(Math.max(0, ptsTotal)) / 140) * 100, 0, 100);
  const longevity = clamp((Math.sqrt(Math.max(0, gp)) / 29) * 100, 0, 100);
  const playoffScore = clamp((Math.sqrt(Math.max(0, playoffGp)) / 11.5) * 100, 0, 100);

  const current27Composite =
    pick.season27PtsPg !== null
      ? clamp(
          ((pick.season27PtsPg * 0.72 +
            (pick.season27RebPg ?? 0) * 0.45 +
            (pick.season27AstPg ?? 0) * 0.65) /
            29) *
            100,
          0,
          100
        )
      : avgImpact * 0.85;

  let raw = 0;
  if (mode === 'peak') {
    const reliability = 0.68 + 0.32 * Math.min(1, gp / 25);
    raw =
      (0.46 * peakImpact + 0.24 * avgImpact + 0.16 * current27Composite + 0.14 * scoringPeak) *
      reliability;
  } else if (mode === 'volume') {
    raw = 0.42 * volume + 0.28 * longevity + 0.18 * playoffScore + 0.12 * avgImpact;
  } else {
    // Balanced / Integral mode: adjusts longevity expectation gently for recent classes (2024-2026)
    const reliability = 0.62 + 0.38 * Math.min(1, gp / 55);
    const isVeryYoungClass = pick.year >= 2024;
    raw = isVeryYoungClass
      ? (0.42 * avgImpact + 0.28 * peakImpact + 0.18 * current27Composite + 0.12 * longevity) *
        reliability
      : (0.36 * avgImpact +
          0.24 * peakImpact +
          0.17 * longevity +
          0.13 * volume +
          0.1 * playoffScore) *
        reliability;
  }

  return {
    hasStats: true,
    score: round1(clamp(raw, 1, 99.5)),
  };
}

export function evaluateDraftClass(
  cls: DraftClassSummary,
  mode: RedraftMode = 'balanced'
): EvaluatedDraftClass {
  const scored = cls.picks.map((pick) => {
    const { hasStats, score } = computeRedraftScore(pick, mode);
    const expectedScore = getExpectedScoreByPick(pick.overall);
    const valueOverExpected = hasStats ? round1(score - expectedScore) : round1(-expectedScore);
    return {
      pick,
      hasStats,
      redraftScore: score,
      expectedScore,
      valueOverExpected,
    };
  });

  // Sort for Re-Draft order: tracked picks by score desc, then untracked picks by original slot asc
  const sortedForRedraft = [...scored].sort((a, b) => {
    if (a.hasStats !== b.hasStats) return a.hasStats ? -1 : 1;
    if (b.redraftScore !== a.redraftScore) return b.redraftScore - a.redraftScore;
    return a.pick.overall - b.pick.overall;
  });

  const isPartialLegacyCoverage = cls.year <= 2013;

  const evaluatedPicks: EvaluatedDraftPick[] = sortedForRedraft.map((item, idx) => {
    const redraftRank = idx + 1;
    const rankDelta = item.hasStats ? item.pick.overall - redraftRank : 0;

    let verdict: PickVerdict = 'par';
    if (!item.hasStats) {
      verdict = 'untracked';
    } else if (
      item.redraftScore >= 32 &&
      ((item.pick.overall >= 15 && rankDelta >= 8) ||
        (item.pick.overall >= 31 && rankDelta >= 6) ||
        (item.valueOverExpected >= 16 && rankDelta >= 5))
    ) {
      verdict = 'steal';
    } else if (
      item.redraftScore >= 28 &&
      (rankDelta >= 3 ||
        item.valueOverExpected >= 7 ||
        (item.pick.overall <= 3 && redraftRank <= 3 && item.redraftScore >= 46))
    ) {
      verdict = 'value';
    } else if (
      (item.pick.overall <= 14 && (rankDelta <= -6 || item.valueOverExpected <= -14)) ||
      (item.pick.overall <= 30 && rankDelta <= -11 && item.valueOverExpected <= -10)
    ) {
      verdict = 'underperform';
    }

    const lateBonus = item.pick.overall >= 31 ? 10 : item.pick.overall >= 15 ? 5 : 0;
    const starBonus = item.redraftScore >= 65 ? 14 : item.redraftScore >= 50 ? 7 : 0;
    const stealScore =
      item.hasStats && item.pick.overall >= 6 && item.valueOverExpected > 0
        ? round1(
            Math.max(
              0,
              item.valueOverExpected * 0.95 + Math.max(0, rankDelta) * 0.65 + lateBonus + starBonus
            )
          )
        : 0;

    // Lottery miss score (only meaningful when full modern coverage 2014-2024 or tracked underperformer)
    const canScoreMiss =
      item.pick.overall <= 14 &&
      (item.hasStats || (cls.year >= 2014 && cls.year <= 2024));
    const missScore = canScoreMiss
      ? round1(
          Math.max(
            0,
            (item.expectedScore - item.redraftScore) * 1.15 +
              Math.max(0, -rankDelta) * 0.55 +
              (item.pick.overall <= 5 ? 8 : 0)
          )
        )
      : 0;

    const fallbackGmSc =
      item.hasStats
        ? round1(
            (item.pick.careerPpg ?? item.pick.season27PtsPg ?? 0) * 0.72 +
              (item.pick.careerRpg ?? item.pick.season27RebPg ?? 0) * 0.42 +
              (item.pick.careerApg ?? item.pick.season27AstPg ?? 0) * 0.58 +
              ((item.pick.careerStlPg ?? 0) + (item.pick.careerBlkPg ?? 0)) * 0.85
          )
        : null;
    const resolvedCareerGmScPg =
      typeof item.pick.careerGmScPg === 'number' && Number.isFinite(item.pick.careerGmScPg)
        ? item.pick.careerGmScPg
        : fallbackGmSc;
    const resolvedCareerPeakGmSc =
      typeof item.pick.careerPeakGmSc === 'number' && Number.isFinite(item.pick.careerPeakGmSc)
        ? item.pick.careerPeakGmSc
        : resolvedCareerGmScPg !== null
        ? round1(
            Math.max(
              resolvedCareerGmScPg,
              (item.pick.careerPeakPpg ?? item.pick.careerPpg ?? 0) * 0.78
            )
          )
        : null;

    return {
      ...item.pick,
      careerGmScPg: resolvedCareerGmScPg,
      careerPeakGmSc: resolvedCareerPeakGmSc,
      hasStats: item.hasStats,
      redraftScore: item.redraftScore,
      expectedScore: item.expectedScore,
      valueOverExpected: item.valueOverExpected,
      redraftRank,
      rankDelta,
      stealScore,
      missScore,
      verdict,
    };
  });

  const picksByOriginal = [...evaluatedPicks].sort((a, b) => a.overall - b.overall);
  const trackedPicks = evaluatedPicks.filter((p) => p.hasStats);

  const top5 = trackedPicks.slice(0, 5);
  const top10 = trackedPicks.slice(0, 10);
  const top5AvgScore =
    top5.length > 0 ? round1(top5.reduce((s, p) => s + p.redraftScore, 0) / top5.length) : 0;
  const top10AvgScore =
    top10.length > 0 ? round1(top10.reduce((s, p) => s + p.redraftScore, 0) / top10.length) : 0;

  const starsCount = trackedPicks.filter(
    (p) => (p.careerPeakPpg ?? 0) >= 20 || (p.careerPeakGmSc ?? 0) >= 16.5
  ).length;
  const startersCount = trackedPicks.filter((p) => p.redraftScore >= 36).length;
  const stealsCount = evaluatedPicks.filter((p) => p.verdict === 'steal').length;

  const lotteryPicks = picksByOriginal.filter((p) => p.overall <= 14);
  const lotteryHits = lotteryPicks.filter((p) => p.hasStats && p.redraftScore >= 34).length;
  const lotteryHitRatePct =
    lotteryPicks.length > 0 ? Math.round((lotteryHits / lotteryPicks.length) * 100) : 0;

  // Class Power Index (0-100)
  const depthFactor = clamp((startersCount / 16) * 100, 0, 100);
  const starFactor = clamp((starsCount / 8) * 100, 0, 100);
  const classPowerIndex =
    trackedPicks.length > 0
      ? round1(clamp(top5AvgScore * 0.42 + top10AvgScore * 0.28 + starFactor * 0.18 + depthFactor * 0.12, 0, 99))
      : 0;

  let classGrade: EvaluatedDraftClass['classGrade'] = 'C';
  if (classPowerIndex >= 74) classGrade = 'S';
  else if (classPowerIndex >= 66) classGrade = 'A+';
  else if (classPowerIndex >= 58) classGrade = 'A';
  else if (classPowerIndex >= 50) classGrade = 'B+';
  else if (classPowerIndex >= 42) classGrade = 'B';
  else if (classPowerIndex >= 32) classGrade = 'C+';

  const originalNumberOne = picksByOriginal.find((p) => p.overall === 1) || picksByOriginal[0] || null;
  const redraftNumberOne = trackedPicks[0] || null;
  const numberOneHeld = Boolean(
    originalNumberOne && redraftNumberOne && originalNumberOne.id === redraftNumberOne.id
  );

  const biggestSteal =
    [...trackedPicks]
      .filter((p) => p.overall >= 8 && p.stealScore > 0)
      .sort((a, b) => b.stealScore - a.stealScore)[0] || null;

  const biggestLotteryDrop =
    [...lotteryPicks]
      .filter((p) => p.missScore > 12)
      .sort((a, b) => b.missScore - a.missScore)[0] || null;

  const coveragePct =
    cls.pickCount > 0 ? Math.round((trackedPicks.length / cls.pickCount) * 100) : 0;

  return {
    year: cls.year,
    displayName: cls.displayName,
    pickCount: cls.pickCount,
    trackedCount: trackedPicks.length,
    activeIn2027Count: cls.activeIn2027Count,
    coveragePct,
    isPartialLegacyCoverage,
    classPowerIndex,
    classGrade,
    top5AvgScore,
    top10AvgScore,
    starsCount,
    startersCount,
    stealsCount,
    lotteryHitRatePct,
    originalNumberOne,
    redraftNumberOne,
    numberOneHeld,
    biggestSteal,
    biggestLotteryDrop,
    picksByRedraft: evaluatedPicks,
    picksByOriginal,
  };
}

export function evaluateAllClasses(
  classes: DraftClassSummary[],
  mode: RedraftMode = 'balanced'
): EvaluatedDraftClass[] {
  return classes.map((cls) => evaluateDraftClass(cls, mode));
}

export function getGlobalStealsRanking(
  evaluatedClasses: EvaluatedDraftClass[],
  options: {
    minYear?: number;
    maxYear?: number;
    minPickOverall?: number;
    teamAbbr?: string;
    onlyActive?: boolean;
  } = {}
): EvaluatedDraftPick[] {
  const minYear = options.minYear ?? 2003;
  const maxYear = options.maxYear ?? 2026;
  const minPickOverall = options.minPickOverall ?? 10;
  const teamFilter = options.teamAbbr && options.teamAbbr !== 'all' ? options.teamAbbr : null;

  const out: EvaluatedDraftPick[] = [];
  for (const cls of evaluatedClasses) {
    if (cls.year < minYear || cls.year > maxYear) continue;
    for (const p of cls.picksByRedraft) {
      if (!p.hasStats) continue;
      if (p.overall < minPickOverall) continue;
      if (teamFilter && p.draftedByTeamAbbr !== teamFilter) continue;
      if (options.onlyActive && !p.isActive2027) continue;
      const gp = Math.max(p.careerGp ?? 0, p.season27Gp ?? 0);
      const minGp = p.year >= 2025 ? 8 : 30;
      if (gp < minGp) continue;
      if (p.stealScore <= 0 || p.redraftScore < 28) continue;
      out.push(p);
    }
  }

  return out.sort((a, b) => {
    if (b.stealScore !== a.stealScore) return b.stealScore - a.stealScore;
    return b.redraftScore - a.redraftScore;
  });
}

export function getGlobalLotteryMissesRanking(
  evaluatedClasses: EvaluatedDraftClass[],
  options: {
    minYear?: number;
    maxYear?: number;
    teamAbbr?: string;
  } = {}
): EvaluatedDraftPick[] {
  // Default to mature modern classes (2014-2024) where coverage is high and rookies aren't prematurely judged
  const minYear = Math.max(2014, options.minYear ?? 2014);
  const maxYear = Math.min(2024, options.maxYear ?? 2024);
  const teamFilter = options.teamAbbr && options.teamAbbr !== 'all' ? options.teamAbbr : null;

  const out: EvaluatedDraftPick[] = [];
  for (const cls of evaluatedClasses) {
    if (cls.year < minYear || cls.year > maxYear) continue;
    for (const p of cls.picksByOriginal) {
      if (p.overall > 14) continue;
      if (teamFilter && p.draftedByTeamAbbr !== teamFilter) continue;
      if (p.missScore < 16) continue;
      out.push(p);
    }
  }

  return out.sort((a, b) => {
    if (b.missScore !== a.missScore) return b.missScore - a.missScore;
    return a.overall - b.overall;
  });
}

export function evaluateFranchiseDraftEfficiency(
  evaluatedClasses: EvaluatedDraftClass[],
  minYear = 2014,
  maxYear = 2026
): FranchiseDraftEfficiency[] {
  const map = new Map<
    string,
    {
      picks: EvaluatedDraftPick[];
    }
  >();

  for (const cls of evaluatedClasses) {
    if (cls.year < minYear || cls.year > maxYear) continue;
    for (const p of cls.picksByOriginal) {
      const abbr = p.draftedByTeamAbbr;
      if (!NBA_TEAMS_MAP[abbr]) continue;
      const bucket = map.get(abbr) || { picks: [] };
      bucket.picks.push(p);
      map.set(abbr, bucket);
    }
  }

  const rows: FranchiseDraftEfficiency[] = [];
  for (const [abbr, bucket] of map.entries()) {
    const picks = bucket.picks;
    const totalPicks = picks.length;
    if (totalPicks === 0) continue;

    const tracked = picks.filter((p) => p.hasStats);
    const lotteryPicks = picks.filter((p) => p.tier === 'lottery').length;
    const firstRoundPicks = picks.filter((p) => p.round === 1).length;
    const secondRoundPicks = picks.filter((p) => p.round === 2).length;
    const active2027Picks = picks.filter((p) => p.isActive2027).length;
    const stealsCount = picks.filter((p) => p.verdict === 'steal').length;
    const starsCount = tracked.filter(
      (p) => (p.careerPeakPpg ?? 0) >= 20 || (p.careerPeakGmSc ?? 0) >= 16.5
    ).length;

    const avgPickOverall = round1(picks.reduce((s, p) => s + p.overall, 0) / totalPicks);
    const avgRedraftScore = round1(
      picks.reduce((s, p) => s + p.redraftScore, 0) / totalPicks
    );
    const totalValueOverExpected = round1(
      picks.reduce((s, p) => s + p.valueOverExpected, 0)
    );
    const avgValueOverExpected = round1(totalValueOverExpected / totalPicks);

    const bestPick =
      [...tracked].sort((a, b) => b.redraftScore - a.redraftScore)[0] || null;
    const biggestSteal =
      [...tracked]
        .filter((p) => p.stealScore > 0)
        .sort((a, b) => b.stealScore - a.stealScore)[0] || null;

    rows.push({
      teamAbbr: abbr,
      teamName: NBA_TEAMS_MAP[abbr]?.name || abbr,
      totalPicks,
      lotteryPicks,
      firstRoundPicks,
      secondRoundPicks,
      trackedPicks: tracked.length,
      active2027Picks,
      stealsCount,
      starsCount,
      avgPickOverall,
      avgRedraftScore,
      avgValueOverExpected,
      totalValueOverExpected,
      bestPick,
      biggestSteal,
    });
  }

  return rows.sort((a, b) => {
    if (b.avgValueOverExpected !== a.avgValueOverExpected) {
      return b.avgValueOverExpected - a.avgValueOverExpected;
    }
    return b.avgRedraftScore - a.avgRedraftScore;
  });
}
