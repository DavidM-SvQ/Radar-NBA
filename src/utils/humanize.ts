import type {
  AnomalySignal,
  ComparisonMetricRow,
  FilterPresetId,
  PlayerSummary,
  TeamSummary,
  ThresholdSettings,
  WindowSize,
} from '../types/nba';
import { formatSigned, mean, round1, stdDev } from './analytics';

export interface MetricBenchmark {
  mean: number;
  sd: number;
  lowerIsBetter?: boolean;
  decimals?: number;
  suffix?: string;
}

export interface LeagueBenchmarks {
  player: {
    pts: MetricBenchmark;
    reb: MetricBenchmark;
    oreb: MetricBenchmark;
    ast: MetricBenchmark;
    stocks: MetricBenchmark;
    tsPct: MetricBenchmark;
    usgPct: MetricBenchmark;
    efgPct: MetricBenchmark;
    gmSc: MetricBenchmark;
    pie: MetricBenchmark;
    min: MetricBenchmark;
  };
  team: {
    avgPointsFor: MetricBenchmark;
    avgPointsAgainst: MetricBenchmark;
    differential: MetricBenchmark;
    offRtg: MetricBenchmark;
    defRtg: MetricBenchmark;
    netRtg: MetricBenchmark;
    pace: MetricBenchmark;
    efgPct: MetricBenchmark;
    tsPct: MetricBenchmark;
    orebPct: MetricBenchmark;
    tovPct: MetricBenchmark;
    ptsPaint: MetricBenchmark;
  };
}

export interface LeagueEvaluation {
  pct: number; // 4..98, where 50 = exact NBA league average
  z: number;
  tierLabel: 'Élite NBA' | 'Destacado' | 'En media NBA' | 'Bajo media';
  textClass: string;
  barClass: string;
  avgFormatted: string;
}

export interface ColumnHelpEntry {
  title: string;
  simpleDesc: string;
  calculation: string;
  benchmarkText?: string;
}

export const FILTER_PRESETS: Record<
  Exclude<FilterPresetId, 'custom'>,
  {
    label: string;
    shortHint: string;
    values: Omit<ThresholdSettings, 'windowSize'>;
  }
> = {
  broad: {
    label: 'Amplio (Ver más)',
    shortHint: 'Detecta mejoras suaves y jugadores de rotación media',
    values: {
      minZScore: 0.9,
      minPctDelta: 12,
      minMinutes: 16,
      minStreakGames: 2,
    },
  },
  balanced: {
    label: 'Normal (Recomendado)',
    shortHint: 'Equilibrio ideal entre titulares y cambios claros',
    values: {
      minZScore: 1.2,
      minPctDelta: 16,
      minMinutes: 22,
      minStreakGames: 3,
    },
  },
  blockbusters: {
    label: 'Solo Bombazos',
    shortHint: 'Filtra únicamente explosiones o caídas extraordinarias',
    values: {
      minZScore: 1.8,
      minPctDelta: 24,
      minMinutes: 26,
      minStreakGames: 4,
    },
  },
};

export function detectActivePreset(settings: ThresholdSettings): FilterPresetId {
  for (const key of ['broad', 'balanced', 'blockbusters'] as const) {
    const p = FILTER_PRESETS[key].values;
    if (
      Math.abs(settings.minZScore - p.minZScore) < 0.05 &&
      settings.minPctDelta === p.minPctDelta &&
      settings.minMinutes === p.minMinutes &&
      settings.minStreakGames === p.minStreakGames
    ) {
      return key;
    }
  }
  return 'custom';
}

export function describeSliderSurpriseLevel(minZ: number): string {
  if (minZ <= 1.0) return 'Suave';
  if (minZ <= 1.35) return 'Normal';
  if (minZ <= 1.75) return 'Exigente';
  return 'Solo bombazos';
}

export function computeLeagueBenchmarks(
  players: PlayerSummary[],
  teams: TeamSummary[]
): LeagueBenchmarks {
  const rotPlayers = players.filter((p) => {
    if (p.games.length < 2) return false;
    return mean(p.games.map((g) => g.minutes)) >= 15;
  });
  const pPool =
    rotPlayers.length >= 20
      ? rotPlayers
      : players.filter((p) => p.games.length > 0);

  const buildStat = (
    vals: number[],
    fallbackMean: number,
    fallbackSd: number,
    opts?: { lowerIsBetter?: boolean; decimals?: number; suffix?: string }
  ): MetricBenchmark => {
    if (vals.length < 5) {
      return {
        mean: fallbackMean,
        sd: fallbackSd,
        lowerIsBetter: opts?.lowerIsBetter,
        decimals: opts?.decimals ?? 1,
        suffix: opts?.suffix ?? '',
      };
    }
    const avg = round1(mean(vals));
    const s = Math.max(fallbackSd * 0.45, round1(stdDev(vals)));
    return {
      mean: avg,
      sd: s,
      lowerIsBetter: opts?.lowerIsBetter,
      decimals: opts?.decimals ?? 1,
      suffix: opts?.suffix ?? '',
    };
  };

  const pPts = pPool.map((p) => mean(p.games.map((g) => g.points)));
  const pReb = pPool.map((p) => mean(p.games.map((g) => g.rebounds)));
  const pOreb = pPool.map((p) => mean(p.games.map((g) => g.oreb)));
  const pAst = pPool.map((p) => mean(p.games.map((g) => g.assists)));
  const pStocks = pPool.map((p) => mean(p.games.map((g) => g.stocks)));
  const pMin = pPool.map((p) => mean(p.games.map((g) => g.minutes)));
  const pGmSc = pPool.map((p) => mean(p.games.map((g) => g.gameScore)));
  const pUsg = pPool.map(
    (p) => p.advanced?.usgPct ?? mean(p.games.map((g) => g.usgEst))
  );
  const pTs = pPool.map((p) => {
    if (p.advanced?.tsPct) return p.advanced.tsPct;
    const fga = p.games.reduce((s, g) => s + g.fga, 0);
    const fta = p.games.reduce((s, g) => s + g.fta, 0);
    const pts = p.games.reduce((s, g) => s + g.points, 0);
    const denom = 2 * (fga + 0.44 * fta);
    return denom > 0 ? (pts / denom) * 100 : 56;
  });
  const pEfg = pPool.map(
    (p) => p.advanced?.efgPct ?? mean(p.games.map((g) => g.efgPct))
  );
  const pPie = pPool
    .map((p) => p.advanced?.pie ?? 0)
    .filter((v) => v > 0);

  const tPool = teams.filter(
    (t) => t.games.length > 0 || t.wins + t.losses > 0
  );
  const tPf = tPool.map((t) => t.avgPointsFor);
  const tPa = tPool.map((t) => t.avgPointsAgainst);
  const tDiff = tPool.map((t) => t.differential);
  const tOff = tPool.map(
    (t) => t.advanced?.offRtg ?? mean(t.games.map((g) => g.offRtg))
  );
  const tDef = tPool.map(
    (t) => t.advanced?.defRtg ?? mean(t.games.map((g) => g.defRtg))
  );
  const tNet = tPool.map(
    (t) => t.advanced?.netRtg ?? mean(t.games.map((g) => g.netRtg))
  );
  const tPace = tPool.map(
    (t) => t.advanced?.pace ?? mean(t.games.map((g) => g.pace))
  );
  const tEfg = tPool.map(
    (t) => t.advanced?.efgPct ?? mean(t.games.map((g) => g.efgPct))
  );
  const tTs = tPool.map(
    (t) => t.advanced?.tsPct ?? mean(t.games.map((g) => g.tsPct))
  );
  const tOrebPct = tPool.map(
    (t) => t.advanced?.orebPct ?? mean(t.games.map((g) => g.orebPct))
  );
  const tTovPct = tPool.map(
    (t) => t.advanced?.tovPct ?? mean(t.games.map((g) => g.tovPct))
  );
  const tPaint = tPool
    .map((t) => t.advanced?.ptsPaint ?? 0)
    .filter((v) => v > 0);

  return {
    player: {
      pts: buildStat(pPts, 13.8, 6.2),
      reb: buildStat(pReb, 4.9, 2.4),
      oreb: buildStat(pOreb, 1.2, 0.9),
      ast: buildStat(pAst, 3.2, 2.1),
      stocks: buildStat(pStocks, 1.4, 0.6),
      tsPct: buildStat(pTs, 58.0, 4.8, { suffix: '%' }),
      usgPct: buildStat(pUsg, 19.6, 5.4, { suffix: '%' }),
      efgPct: buildStat(pEfg, 54.4, 5.2, { suffix: '%' }),
      gmSc: buildStat(pGmSc, 10.6, 4.9),
      pie: buildStat(pPie, 10.2, 3.4, { suffix: '%' }),
      min: buildStat(pMin, 25.5, 6.0),
    },
    team: {
      avgPointsFor: buildStat(tPf, 114.2, 4.2),
      avgPointsAgainst: buildStat(tPa, 114.2, 4.2, { lowerIsBetter: true }),
      differential: buildStat(tDiff, 0.0, 4.8),
      offRtg: buildStat(tOff, 114.5, 3.6),
      defRtg: buildStat(tDef, 114.5, 3.6, { lowerIsBetter: true }),
      netRtg: buildStat(tNet, 0.0, 4.6),
      pace: buildStat(tPace, 99.6, 2.2),
      efgPct: buildStat(tEfg, 54.5, 2.1, { suffix: '%' }),
      tsPct: buildStat(tTs, 58.0, 2.0, { suffix: '%' }),
      orebPct: buildStat(tOrebPct, 25.2, 2.4, { suffix: '%' }),
      tovPct: buildStat(tTovPct, 13.8, 1.2, {
        lowerIsBetter: true,
        suffix: '%',
      }),
      ptsPaint: buildStat(tPaint, 48.5, 4.2),
    },
  };
}

export function evaluateVsLeague(
  value: number,
  bench: MetricBenchmark
): LeagueEvaluation {
  const rawDelta = bench.lowerIsBetter
    ? bench.mean - value
    : value - bench.mean;
  const z = rawDelta / Math.max(0.25, bench.sd);
  const pct = Math.max(4, Math.min(98, Math.round(50 + z * 22)));
  const avgFormatted = `${bench.mean.toFixed(bench.decimals ?? 1)}${
    bench.suffix ?? ''
  }`;

  if (z >= 1.3) {
    return {
      pct,
      z,
      tierLabel: 'Élite NBA',
      textClass: 'text-emerald-400',
      barClass: 'bg-emerald-500',
      avgFormatted,
    };
  }
  if (z >= 0.45) {
    return {
      pct,
      z,
      tierLabel: 'Destacado',
      textClass: 'text-orange-300',
      barClass: 'bg-orange-400',
      avgFormatted,
    };
  }
  if (z > -0.45) {
    return {
      pct,
      z,
      tierLabel: 'En media NBA',
      textClass: 'text-slate-400',
      barClass: 'bg-slate-400',
      avgFormatted,
    };
  }
  return {
    pct,
    z,
    tierLabel: 'Bajo media',
    textClass: 'text-rose-400',
    barClass: 'bg-rose-500',
    avgFormatted,
  };
}

export function qualifyRecentDelta(pctDelta: number): {
  label: string;
  textClass: string;
} {
  if (pctDelta >= 20) {
    return { label: 'En racha explosiva', textClass: 'text-emerald-400' };
  }
  if (pctDelta >= 8) {
    return { label: 'Muy caliente', textClass: 'text-emerald-400' };
  }
  if (pctDelta <= -20) {
    return { label: 'Bajón fuerte', textClass: 'text-rose-400' };
  }
  if (pctDelta <= -8) {
    return { label: 'Frío reciente', textClass: 'text-amber-300' };
  }
  return { label: 'En su línea', textClass: 'text-slate-400' };
}

export function qualifyUsageRole(usgPct: number): {
  label: string;
  textClass: string;
} {
  if (usgPct >= 28.5) {
    return { label: '1ª Estrella', textClass: 'text-orange-300' };
  }
  if (usgPct >= 23.0) {
    return { label: '2ª Opción', textClass: 'text-slate-200' };
  }
  if (usgPct >= 17.5) {
    return { label: 'Titular / Apoyo', textClass: 'text-slate-400' };
  }
  return { label: 'Jugador de rol', textClass: 'text-slate-500' };
}

export function describeZScoreHuman(
  zScore: number,
  isGood: boolean
): {
  label: string;
  textClass: string;
} {
  const abs = Math.abs(zScore);
  if (abs >= 2.2) {
    return {
      label: isGood ? 'Bombazo histórico' : 'Desplome extremo',
      textClass: isGood
        ? 'text-emerald-400 font-semibold'
        : 'text-rose-400 font-semibold',
    };
  }
  if (abs >= 1.7) {
    return {
      label: isGood ? 'Subida muy fuerte' : 'Bajón muy fuerte',
      textClass: isGood
        ? 'text-emerald-400 font-medium'
        : 'text-rose-400 font-medium',
    };
  }
  if (abs >= 1.2) {
    return {
      label: isGood ? 'Cambio notable' : 'Bajada notable',
      textClass: isGood
        ? 'text-orange-300 font-medium'
        : 'text-amber-300 font-medium',
    };
  }
  return {
    label: isGood ? 'Mejora moderada' : 'Caída moderada',
    textClass: 'text-slate-300',
  };
}

export function plainMetricName(metricKey: string, fallback: string): string {
  switch (metricKey) {
    case 'points':
    case 'pts':
      return 'Puntos por partido';
    case 'rebounds':
    case 'reb':
      return 'Rebotes totales';
    case 'oreb':
      return 'Rebotes en ataque';
    case 'assists':
    case 'ast':
      return 'Asistencias (pases de canasta)';
    case 'pra':
      return 'Producción total (Puntos+Reb+Asist)';
    case 'gameScore':
      return 'Valoración global del partido';
    case 'usgEst':
      return 'Protagonismo con balón';
    case 'minutes':
    case 'min':
      return 'Minutos jugados';
    case 'tsPct':
      return 'Acierto real de tiro';
    case 'efgPct':
      return 'Puntería en tiros de campo';
    case 'netRtg':
      return 'Dominio real del equipo';
    case 'offRtg':
      return 'Potencia de ataque';
    case 'defRtg':
      return 'Solidez defensiva';
    case 'pace':
      return 'Velocidad de partido';
    default:
      return fallback;
  }
}

export function plainAnomalyExplanation(sig: AnomalySignal): {
  headline: string;
  detail: string;
} {
  const isInverse = sig.metricKey === 'defRtg';
  const isUp = sig.absDelta >= 0;
  const isGood = isInverse ? !isUp : isUp;

  if (sig.entityType === 'player') {
    if (sig.category === 'shooting_variance') {
      return isUp
        ? {
            headline: 'Racha de puntería extraordinaria (cuesta mantenerla)',
            detail: `Está metiendo un porcentaje altísimo de sus tiros recientes (${sig.windowAvg.toFixed(
              1
            )}% frente a su ${sig.baselineAvg.toFixed(1)}% normal).`,
          }
        : {
            headline: 'Mala racha de cara al aro (candidato a recuperarse)',
            detail: `Sus tiros no están entrando (${sig.windowAvg.toFixed(
              1
            )}% frente a su ${sig.baselineAvg.toFixed(
              1
            )}% habitual), pero sigue intentándolo en pista.`,
          };
    }

    if (sig.category === 'role_shift') {
      if (sig.metricKey === 'minutes') {
        return isUp
          ? {
              headline: 'El entrenador le está dando muchos más minutos',
              detail: `Ha subido de ${sig.baselineAvg.toFixed(
                1
              )} a ${sig.windowAvg.toFixed(
                1
              )} minutos por noche en sus últimos ${sig.sampleGames} partidos.`,
            }
          : {
              headline: 'Ha perdido tiempo en la rotación reciente',
              detail: `Baja de ${sig.baselineAvg.toFixed(
                1
              )} a ${sig.windowAvg.toFixed(
                1
              )} minutos por encuentro en el tramo reciente.`,
            };
      }
      return isUp
        ? {
            headline: 'Asume muchos más tiros y jugadas de su equipo',
            detail: `Finaliza el ${sig.windowAvg.toFixed(
              1
            )}% de los ataques cuando está en cancha (su media era ${sig.baselineAvg.toFixed(
              1
            )}%).`,
          }
        : {
            headline: 'Tiene menos balón en ataque últimamente',
            detail: `Ha pasado de finalizar el ${sig.baselineAvg.toFixed(
              1
            )}% de las jugadas al ${sig.windowAvg.toFixed(1)}% reciente.`,
          };
    }

    if (sig.sustainabilityTone === 'warning') {
      return isUp
        ? {
            headline: 'Anota más por puntería caliente que por jugar más',
            detail: `Sube a ${sig.windowAvg.toFixed(
              1
            )} sin apenas ganar minutos extra; depende de que siga enchufado en el tiro.`,
          }
        : {
            headline: 'Bajón por mala puntería, pero mantiene su rol intacto',
            detail:
              'Sigue jugando sus minutos habituales; lo normal es que sus números vuelvan a subir pronto.',
          };
    }

    return isGood
      ? {
          headline: 'Subida muy sólida respaldada por minutos y tiros',
          detail: `Pasa de ${sig.baselineAvg.toFixed(
            1
          )} a ${sig.windowAvg.toFixed(
            1
          )} de media en sus últimos ${sig.sampleGames} encuentros con mayor peso en el equipo.`,
        }
      : {
          headline: 'Caída clara de aportación en los últimos partidos',
          detail: `Baja de ${sig.baselineAvg.toFixed(
            1
          )} a ${sig.windowAvg.toFixed(
            1
          )} en sus últimos ${sig.sampleGames} partidos disputados.`,
        };
  }

  if (sig.metricKey === 'defRtg') {
    return isGood
      ? {
          headline: 'Cerrojo atrás: deja a los rivales en muy pocos puntos',
          detail: `Su defensa ha mejorado notablemente en los últimos ${sig.sampleGames} partidos respecto al resto del año.`,
        }
      : {
          headline: 'Defensa con fisuras: encaja bastante más de lo habitual',
          detail: `Los rivales están anotando con mucha más facilidad contra ellos en estas últimas ${sig.sampleGames} jornadas.`,
        };
  }

  if (sig.metricKey === 'pace') {
    return isUp
      ? {
          headline: 'Partidos de ida y vuelta mucho más rápidos',
          detail:
            'Están corriendo más la pista y jugando posesiones más cortas, lo que infla los marcadores.',
        }
      : {
          headline: 'Baloncesto más pausado y de ataques largos',
          detail:
            'Han frenado el ritmo de sus partidos recientes buscando posesiones más elaboradas.',
        };
  }

  if (sig.metricKey === 'offRtg') {
    return isGood
      ? {
          headline: 'Ataque en estado de gracia y muy efectivo',
          detail: `Aprovechan mucho mejor cada ataque en sus últimos ${sig.sampleGames} compromisos.`,
        }
      : {
          headline: 'Atasco ofensivo en las últimas jornadas',
          detail:
            'Les está costando bastante más conseguir canastas limpias que en su media de temporada.',
        };
  }

  return isGood
    ? {
        headline: 'Dominio colectivo claro frente a sus rivales recientes',
        detail: `Superan a sus oponentes con mucha más solvencia en estos últimos ${sig.sampleGames} partidos.`,
      }
    : {
        headline: 'Bache colectivo: pierden terreno en el marcador',
        detail:
          'Su diferencia de puntos contra los rivales ha empeorado de forma clara últimamente.',
      };
}

export function computePlainPlayerTakeaways(
  player: PlayerSummary,
  windowSize: WindowSize,
  benchmarks: LeagueBenchmarks
): string[] {
  const games = player.games;
  if (games.length < 2) {
    return [
      'Todavía lleva muy pocos partidos jugados para extraer patrones claros.',
    ];
  }

  const winSlice = games.slice(0, Math.min(windowSize, games.length));
  const notes: string[] = [];

  const basePts = mean(games.map((g) => g.points));
  const winPts = mean(winSlice.map((g) => g.points));
  const ptsDiff = winPts - basePts;

  const baseMin = mean(games.map((g) => g.minutes));
  const winMin = mean(winSlice.map((g) => g.minutes));
  const minDiff = winMin - baseMin;

  const baseFga = mean(games.map((g) => g.fga));
  const winFga = mean(winSlice.map((g) => g.fga));
  const fgaDiff = winFga - baseFga;

  const ptsEval = evaluateVsLeague(basePts, benchmarks.player.pts);
  notes.push(
    `Nivel frente a la NBA: promedia ${basePts.toFixed(
      1
    )} puntos por noche (${ptsEval.tierLabel.toLowerCase()}, la media de rotación NBA es ${benchmarks.player.pts.mean.toFixed(
      1
    )}).`
  );

  if (Math.abs(ptsDiff) >= 2.5) {
    if (ptsDiff > 0 && (minDiff >= 2.5 || fgaDiff >= 2.0)) {
      notes.push(
        `Está en plena subida real: anota ${winPts.toFixed(
          1
        )} puntos en sus últimos ${
          winSlice.length
        } partidos porque juega más tiempo (${winMin.toFixed(
          1
        )} min) y tira más veces a canasta.`
      );
    } else if (ptsDiff > 0) {
      notes.push(
        `Muñeca caliente: sube a ${winPts.toFixed(
          1
        )} puntos recientes gracias a un gran acierto en el tiro, manteniendo casi los mismos minutos.`
      );
    } else {
      notes.push(
        `Tramo más discreto: promedia ${winPts.toFixed(
          1
        )} puntos en los últimos ${winSlice.length} encuentros (${formatSigned(
          ptsDiff
        )} respecto a su media habitual).`
      );
    }
  }

  const homeGames = games.filter((g) => g.isHome);
  const awayGames = games.filter((g) => !g.isHome);
  if (homeGames.length >= 3 && awayGames.length >= 3) {
    const homePts = mean(homeGames.map((g) => g.points));
    const awayPts = mean(awayGames.map((g) => g.points));
    const splitDiff = homePts - awayPts;
    if (Math.abs(splitDiff) >= 2.8) {
      notes.push(
        splitDiff > 0
          ? `Se crece jugando en casa: anota ${homePts.toFixed(
              1
            )} puntos ante su público frente a ${awayPts.toFixed(
              1
            )} cuando viaja.`
          : `Rinde mejor fuera de casa: sube a ${awayPts.toFixed(
              1
            )} puntos como visitante frente a ${homePts.toFixed(
              1
            )} en su pabellón.`
      );
    }
  }

  if (player.advanced) {
    const adv = player.advanced;
    if (adv.ptsPaint >= 10) {
      notes.push(
        `Especialista cerca del aro: consigue ${adv.ptsPaint.toFixed(
          1
        )} puntos por noche pisando la zona interior.`
      );
    } else if (adv.deflections >= 2.8 || adv.contestedShots >= 8.5) {
      notes.push(
        `Gran trabajo defensivo sin balón: desvía ${adv.deflections.toFixed(
          1
        )} pases y puntea ${adv.contestedShots.toFixed(
          1
        )} tiros rivales por noche.`
      );
    }
  }

  const ptsSd = stdDev(games.map((g) => g.points));
  if (games.length >= 4) {
    const floor = Math.max(0, basePts - ptsSd);
    const ceil = basePts + ptsSd;
    notes.push(
      `Lo normal en una noche suya es moverse entre ${floor.toFixed(
        0
      )} y ${ceil.toFixed(0)} puntos.`
    );
  }

  return notes;
}

export function computePlainTeamTakeaways(
  team: TeamSummary,
  windowSize: WindowSize,
  benchmarks: LeagueBenchmarks
): string[] {
  const games = team.games;
  if (games.length < 2) {
    return [
      'Pocos partidos completados todavía en este filtro de temporada.',
    ];
  }

  const winSlice = games.slice(0, Math.min(windowSize, games.length));
  const notes: string[] = [];

  const recentWins = winSlice.filter((g) => g.result === 'W').length;
  const recentDiff = mean(winSlice.map((g) => g.differential));

  notes.push(
    `Momento actual: ha ganado ${recentWins} de sus últimos ${
      winSlice.length
    } partidos con una diferencia media de ${formatSigned(
      recentDiff
    )} puntos en el marcador.`
  );

  const offEval = evaluateVsLeague(
    team.avgPointsFor,
    benchmarks.team.avgPointsFor
  );
  const defEval = evaluateVsLeague(
    team.avgPointsAgainst,
    benchmarks.team.avgPointsAgainst
  );

  notes.push(
    `Perfil frente a la NBA: anota ${team.avgPointsFor.toFixed(
      1
    )} puntos (${offEval.tierLabel.toLowerCase()}) y recibe ${team.avgPointsAgainst.toFixed(
      1
    )} (${defEval.tierLabel.toLowerCase()} en defensa; media NBA: ${benchmarks.team.avgPointsFor.mean.toFixed(
      1
    )}).`
  );

  if (team.advanced) {
    if (team.advanced.pace >= benchmarks.team.pace.mean + 1.8) {
      notes.push(
        'Juega un baloncesto muy rápido de posesiones cortas, por lo que sus partidos suelen tener marcadores altos.'
      );
    } else if (team.advanced.pace <= benchmarks.team.pace.mean - 1.8) {
      notes.push(
        'Prefiere ataques largos y ritmo pausado, controlando el reloj y bajando el tanteo total.'
      );
    }
  }

  return notes;
}

export function computePlainComparisonInsights(
  entityType: 'player' | 'team',
  rows: ComparisonMetricRow[]
): string[] {
  const findRow = (k: string) => rows.find((r) => r.key === k);
  const out: string[] = [];

  if (entityType === 'player') {
    const pts = findRow('pts');
    const min = findRow('min');
    const fg = findRow('fgPct');
    const reb = findRow('reb');
    const ast = findRow('ast');

    if (pts && Math.abs(pts.absDiff) >= 1.8) {
      out.push(
        pts.absDiff > 0
          ? `Anota ${formatSigned(
              pts.absDiff
            )} puntos más por partido en el Tramo A (${pts.rangeAValue.toFixed(
              1
            )} frente a ${pts.rangeBValue.toFixed(1)} en el Tramo B).`
          : `Baja ${Math.abs(pts.absDiff).toFixed(
              1
            )} puntos por partido en el Tramo A (${pts.rangeAValue.toFixed(
              1
            )} frente a ${pts.rangeBValue.toFixed(1)}).`
      );
    }
    if (min && Math.abs(min.absDiff) >= 2.2) {
      out.push(
        min.absDiff > 0
          ? `Cuenta con más confianza en cancha: juega ${formatSigned(
              min.absDiff
            )} minutos extra por encuentro.`
          : `Juega ${Math.abs(min.absDiff).toFixed(
              1
            )} minutos menos por noche en este tramo.`
      );
    }
    if (fg && Math.abs(fg.absDiff) >= 3.5) {
      out.push(
        fg.absDiff > 0
          ? `Está mucho más acertado tirando a canasta (${fg.rangeAValue.toFixed(
              1
            )}% de acierto frente a ${fg.rangeBValue.toFixed(1)}%).`
          : `Le está costando más meter sus tiros (${fg.rangeAValue.toFixed(
              1
            )}% frente a ${fg.rangeBValue.toFixed(1)}%).`
      );
    }
    if (reb && Math.abs(reb.absDiff) >= 1.5) {
      out.push(
        `En el rebote pasa de ${reb.rangeBValue.toFixed(
          1
        )} a ${reb.rangeAValue.toFixed(1)} capturas por partido (${formatSigned(
          reb.absDiff
        )}).`
      );
    }
    if (ast && Math.abs(ast.absDiff) >= 1.3) {
      out.push(
        `Reparte ${ast.rangeAValue.toFixed(
          1
        )} pases de canasta frente a ${ast.rangeBValue.toFixed(
          1
        )} en el tramo de referencia.`
      );
    }
    if (out.length === 0) {
      out.push(
        'Sus números principales de puntos, minutos y acierto son muy parecidos entre ambos tramos.'
      );
    }
    return out;
  }

  const pf = findRow('pf');
  const pa = findRow('pa');
  const winPct = findRow('winPct');
  if (winPct && Math.abs(winPct.absDiff) >= 8) {
    out.push(
      winPct.absDiff > 0
        ? `Gana muchos más partidos en el Tramo A (${winPct.rangeAValue.toFixed(
            0
          )}% de victorias frente al ${winPct.rangeBValue.toFixed(0)}%).`
        : `Su porcentaje de victorias cae del ${winPct.rangeBValue.toFixed(
            0
          )}% al ${winPct.rangeAValue.toFixed(0)}% en el Tramo A.`
    );
  }
  if (pf && Math.abs(pf.absDiff) >= 2.5) {
    out.push(
      `En ataque pasa de anotar ${pf.rangeBValue.toFixed(
        1
      )} a ${pf.rangeAValue.toFixed(1)} puntos por partido (${formatSigned(
        pf.absDiff
      )}).`
    );
  }
  if (pa && Math.abs(pa.absDiff) >= 2.5) {
    out.push(
      pa.absDiff < 0
        ? `Defiende mejor: encaja ${Math.abs(pa.absDiff).toFixed(
            1
          )} puntos menos por noche (${pa.rangeAValue.toFixed(
            1
          )} vs ${pa.rangeBValue.toFixed(1)}).`
        : `Recibe ${formatSigned(pa.absDiff)} puntos más en contra por encuentro.`
    );
  }
  if (out.length === 0) {
    out.push(
      'El rendimiento en ataque y defensa se mantiene muy estable entre ambos periodos.'
    );
  }
  return out;
}

export const COLUMN_HELP: Record<string, ColumnHelpEntry> = {
  baselineAvg: {
    title: 'Media habitual de temporada',
    simpleDesc:
      'Indica el rendimiento normal de este jugador o equipo a lo largo de todos sus partidos cargados.',
    calculation:
      'Suma total de la estadística en todos sus partidos disputados dividida entre el número total de partidos (PJ).',
    benchmarkText:
      'Sirve como línea base para detectar si ahora rinde por encima o por debajo de su nivel.',
  },
  windowAvg: {
    title: 'Promedio en el tramo reciente',
    simpleDesc:
      'Mide su rendimiento actual en los últimos partidos seleccionados (3, 5 o 10 encuentros, o durante una racha activa).',
    calculation:
      'Suma de la estadística en los últimos N partidos jugados dividida entre N.',
    benchmarkText:
      'Si supera claramente a su media habitual, atraviesa un momento caliente.',
  },
  pctDelta: {
    title: 'Variación porcentual (Cambio %)',
    simpleDesc:
      'Muestra cuánto han subido (▲) o bajado (▼) sus números recientes en porcentaje frente a su promedio habitual.',
    calculation:
      '((Promedio Reciente − Media Habitual) / |Media Habitual|) × 100.',
    benchmarkText: 'Variaciones de ±15% o más reflejan cambios muy notables en pista.',
  },
  absDiff: {
    title: 'Diferencia neta entre tramos',
    simpleDesc:
      'Indica cuántas unidades exactas (puntos, rebotes o puntos porcentuales) sube o baja del Tramo B al Tramo A.',
    calculation: 'Resta directa: Valor medio del Tramo A − Valor medio del Tramo B.',
    benchmarkText: 'En métricas defensivas o pérdidas, bajar (−) es positivo.',
  },
  zScore: {
    title: 'Nivel de sorpresa estadística (Z-Score σ)',
    simpleDesc:
      'Mide cómo de extraordinario es el cambio reciente teniendo en cuenta lo regular o irregular que suele ser ese jugador.',
    calculation:
      '(Promedio Reciente − Media Habitual) dividido entre la desviación típica (σ) de sus partidos.',
    benchmarkText:
      '1.2σ = cambio claro · 1.8σ = muy fuerte · 2.2σ+ = explosión o desplome histórico.',
  },
  magnitudeSimple: {
    title: 'Magnitud de la sorpresa',
    simpleDesc:
      'Traduce a lenguaje cotidiano cómo de inusual es la subida o bajada reciente respecto a lo que suele hacer.',
    calculation:
      'Clasifica la desviación típica Z (|Promedio Reciente − Media| / σ) en niveles: moderada, notable, muy fuerte o bombazo.',
    benchmarkText:
      'Cuanto mayor sea la magnitud, menos probable es que se deba al azar.',
  },
  minBase: {
    title: 'Minutos jugados por partido (MIN)',
    simpleDesc:
      'Tiempo medio que permanece el jugador en cancha cada noche (un partido NBA sin prórroga dura 48 minutos).',
    calculation: 'Minutos totales en pista divididos entre los partidos jugados (MIN / PJ).',
    benchmarkText:
      '32+ min = estrella titular · 24–30 min = titular · <18 min = rotación.',
  },
  ptsBase: {
    title: 'Puntos por partido (PTS)',
    simpleDesc:
      'Anotación media que consigue cada noche sumando canastas de dos, triples y tiros libres.',
    calculation:
      '(2 × Tiros de 2 anotados + 3 × Triples anotados + 1 × Tiros libres anotados) / Partidos jugados.',
    benchmarkText:
      '25+ PTS = superestrella · 15–20 PTS = gran anotador · ~13.8 PTS media rotación NBA.',
  },
  ptsWin: {
    title: 'Puntos en los últimos partidos',
    simpleDesc:
      'Promedio anotador del jugador únicamente en la ventana corta seleccionada (últimos 3, 5 o 10 encuentros).',
    calculation:
      'Suma de puntos anotados en los últimos N partidos dividida entre N.',
    benchmarkText:
      'Compáralo con sus Puntos Base para ver si llega en racha anotadora.',
  },
  rebBase: {
    title: 'Rebotes totales por partido (REB)',
    simpleDesc:
      'Balones recuperados tras un lanzamiento fallado, sumando tanto canasta propia como canasta rival.',
    calculation:
      '(Rebotes Defensivos + Rebotes Ofensivos) divididos entre los partidos jugados.',
    benchmarkText:
      '10+ REB = dominante bajo aros · ~4.9 REB media de rotación NBA.',
  },
  orebBase: {
    title: 'Rebotes ofensivos por partido (OR)',
    simpleDesc:
      'Rebotes capturados en el aro rival tras fallo propio; otorgan una segunda posesión inmediata para anotar.',
    calculation:
      'Total de rebotes ofensivos capturados dividido entre los partidos disputados (OREB / PJ).',
    benchmarkText:
      '3.0+ OR en jugadores o 12+ OR en equipos refleja élite cargando el rebote.',
  },
  drebBase: {
    title: 'Rebotes defensivos por partido (DR)',
    simpleDesc:
      'Rebotes asegurados bajo el aro propio tras un fallo del rival para cerrar la posesión defensiva.',
    calculation:
      'Total de rebotes defensivos capturados dividido entre los partidos jugados (DREB / PJ).',
    benchmarkText: '7.5+ DR por noche distingue a los grandes cierres defensivos.',
  },
  astBase: {
    title: 'Asistencias por partido (AST)',
    simpleDesc:
      'Pases directos a un compañero que terminan de forma inmediata en canasta anotada.',
    calculation:
      'Total de pases de canasta contabilizados dividido entre los partidos jugados (AST / PJ).',
    benchmarkText:
      '8+ AST = director de juego élite · 5+ AST = buen creador · ~3.2 AST media NBA.',
  },
  pra: {
    title: 'Producción combinada (PRA)',
    simpleDesc:
      'Resume el volumen ofensivo y de tableros total sumando las tres grandes estadísticas clásicas.',
    calculation:
      'Suma directa en cada partido: Puntos (PTS) + Rebotes (REB) + Asistencias (AST).',
    benchmarkText:
      '35+ PRA = producción de All-Star · 45+ PRA = impacto de candidato a MVP.',
  },
  steals: {
    title: 'Robos de balón por partido (ROB)',
    simpleDesc:
      'Balones arrebatados limpiamente al ataque rival cortando un pase o bote sin cometer falta.',
    calculation: 'Total de recuperaciones (STL) dividido entre partidos jugados (PJ).',
    benchmarkText: '1.5+ robos por noche sitúa al jugador entre los mejores ladrones de la liga.',
  },
  blocks: {
    title: 'Tapones por partido (TAP)',
    simpleDesc:
      'Lanzamientos del rival desviados o bloqueados legalmente en el aire antes de que el balón baje hacia el aro.',
    calculation: 'Total de tapones colocados (BLK) dividido entre partidos jugados (PJ).',
    benchmarkText: '2.0+ tapones por noche identifica a los grandes protectores de aro.',
  },
  stocksBase: {
    title: 'Robos + Tapones combinados (Stocks)',
    simpleDesc:
      'Mide la capacidad total de un jugador para destruir jugadas rivales mediante robos y tapones.',
    calculation: 'Suma directa por partido: Robos de balón (STL) + Tapones (BLK).',
    benchmarkText:
      '2.5+ Stocks por noche identifica a los defensores más disruptivos de la NBA.',
  },
  tov: {
    title: 'Pérdidas de balón por partido (PER)',
    simpleDesc:
      'Veces que el jugador o equipo entrega la posesión al rival por mal pase, pasos, falta en ataque o robo recibido.',
    calculation: 'Total de balones perdidos (TOV) dividido entre partidos jugados (PJ).',
    benchmarkText: 'Menos pérdidas es mejor, aunque las estrellas con mucho balón suelen rondar 3–4.',
  },
  fga: {
    title: 'Tiros de campo intentados (TCI)',
    simpleDesc:
      'Volumen de lanzamientos en juego (de 2 y de 3 puntos) que ejecuta el jugador cada noche.',
    calculation: 'Total de tiros de campo lanzados (FGA) dividido entre partidos jugados.',
    benchmarkText: '18+ TCI por partido corresponde a primeras espadas ofensivas.',
  },
  fgPct: {
    title: 'Porcentaje en tiros de campo (TC%)',
    simpleDesc:
      'Proporción de lanzamientos en juego (sumando tiros de 2 y triples, sin libres) que acaban dentro del aro.',
    calculation: '(Tiros de campo anotados FGM / Tiros de campo intentados FGA) × 100.',
    benchmarkText:
      '~47% media NBA; pívots suelen superar el 55% y exteriores rondan el 44–48%.',
  },
  fg3m: {
    title: 'Triples anotados por partido (3PM)',
    simpleDesc:
      'Canastas convertidas desde detrás de la línea de tres puntos (7,24 metros en la NBA).',
    calculation: 'Total de triples encestados (FG3M) dividido entre partidos jugados (PJ).',
    benchmarkText:
      'Jugador: 3.0+ 3PM es tirador élite. Equipo: 14.5+ 3PM refleja alto volumen exterior.',
  },
  fg3Pct: {
    title: 'Porcentaje de acierto en triples (3P%)',
    simpleDesc:
      'Precisión desde el perímetro: cuántos triples entran de cada 100 intentos.',
    calculation: '(Triples anotados FG3M / Triples intentados FG3A) × 100.',
    benchmarkText:
      '~36.5% es la media NBA · 40% o más con volumen es puntería exterior de élite.',
  },
  fta: {
    title: 'Tiros libres intentados por partido (TLI)',
    simpleDesc:
      'Lanzamientos desde la línea de personal provocados al forzar faltas de tiro o en bonus.',
    calculation: 'Total de tiros libres lanzados (FTA) dividido entre partidos jugados.',
    benchmarkText: '7+ TLI por noche caracteriza a jugadores muy agresivos atacando el aro.',
  },
  ftPct: {
    title: 'Porcentaje en tiros libres (TL%)',
    simpleDesc:
      'Seguridad desde la línea de personal sin oposición (1 punto por acierto).',
    calculation: '(Tiros libres anotados FTM / Tiros libres intentados FTA) × 100.',
    benchmarkText:
      '~78% es la media NBA · 85%+ = gran especialista · 90%+ = infalible.',
  },
  plusMinusBase: {
    title: 'Impacto Más / Menos en pista (+/-)',
    simpleDesc:
      'Diferencia neta en el marcador que logra su equipo frente al rival durante los minutos exactos en que él juega.',
    calculation:
      '(Puntos de su equipo con él en cancha − Puntos del rival con él en cancha) / Partidos jugados.',
    benchmarkText:
      'Positivo (+) indica que su equipo supera al rival cuando él está en pista.',
  },
  usgPct: {
    title: 'Ratio de Uso Ofensivo (USG%)',
    simpleDesc:
      'Porcentaje de jugadas ofensivas de su equipo que finaliza este jugador mientras está en pista.',
    calculation:
      '100 × ((FGA + 0.44 × FTA + Pérdidas) × (Minutos Equipo / 5)) / (Minutos Jugador × Posesiones Equipo).',
    benchmarkText:
      '30%+ = 1ª estrella absoluta · ~20% = media rotación · <15% = jugador de apoyo.',
  },
  usgWin: {
    title: 'Uso ofensivo reciente (USG% ventana)',
    simpleDesc:
      'Cuota de ataques que está absorbiendo el jugador en los últimos partidos frente al resto de la temporada.',
    calculation:
      'Promedio de su USG% partido a partido en los últimos N encuentros seleccionados.',
    benchmarkText:
      'Subidas de +4% suelen indicar bajas de compañeros o cambio táctico del entrenador.',
  },
  tsPct: {
    title: 'Acierto Real de Tiro (True Shooting TS%)',
    simpleDesc:
      'La medida más completa de eficiencia anotadora: pondera tiros de 2, el valor extra del triple y los tiros libres.',
    calculation: 'Puntos Totales / (2 × (Tiros de Campo Intentados FGA + 0.44 × Tiros Libres Intentados FTA)) × 100.',
    benchmarkText:
      '~58% = media NBA actual · 62%+ = eficiencia élite · <53% = baja eficacia.',
  },
  efgPct: {
    title: 'Tiro de Campo Efectivo (eFG%)',
    simpleDesc:
      'Porcentaje de acierto en tiros en juego corrigiendo que un triple vale un 50% más que una canasta de dos.',
    calculation: '((Tiros de Campo Anotados FGM + 0.5 × Triples Anotados FG3M) / FGA) × 100.',
    benchmarkText:
      '~54.5% es la media NBA · 58%+ indica una selección y puntería sobresalientes.',
  },
  offRtg: {
    title: 'Eficiencia Ofensiva (OffRtg)',
    simpleDesc:
      'Puntos producidos por cada 100 posesiones atacadas. Elimina la distorsión de jugar más rápido o más lento.',
    calculation: '(Puntos Anotados / Posesiones Totales) × 100.',
    benchmarkText:
      '118+ = ataque de élite NBA · ~114.5 = media de la liga · <110 = ataque espeso.',
  },
  defRtg: {
    title: 'Eficiencia Defensiva (DefRtg)',
    simpleDesc:
      'Puntos encajados por cada 100 posesiones rivales. ¡Aquí un número MÁS BAJO significa mejor defensa!',
    calculation: '(Puntos Recibidos del Rival / Posesiones Defendidas) × 100.',
    benchmarkText:
      '<110 = defensa de campeonato · ~114.5 = media NBA · >117 = defensa vulnerable.',
  },
  netRtg: {
    title: 'Dominio Neto por 100 posesiones (NetRtg)',
    simpleDesc:
      'Balance real de puntos a favor o en contra cada 100 posesiones ajustado al ritmo de juego.',
    calculation: 'Eficiencia Ofensiva (OffRtg) − Eficiencia Defensiva (DefRtg).',
    benchmarkText:
      '+6.0 o más = candidato al anillo · 0.0 = equilibrio medio · negativo = superado.',
  },
  pie: {
    title: 'Índice de Impacto Global NBA.com (PIE%)',
    simpleDesc:
      'Fórmula oficial de NBA.com que estima qué cuota porcentual de todas las acciones positivas del partido genera el jugador o equipo.',
    calculation:
      '(PTS + FGM + FTM − FGA − FTA + DREB + 0.5×OREB + AST + STL + 0.5×BLK − PF − TOV) / Total acumulado de ambos equipos × 100.',
    benchmarkText:
      'Jugador: 10% = media · 15%+ = All-Star · 18%+ = nivel MVP. Equipo: 50% = media.',
  },
  gmSc: {
    title: 'Valoración por partido (Hollinger Game Score)',
    simpleDesc:
      'Nota global en una sola cifra que premia la producción ofensiva y defensiva y penaliza tiros fallados, faltas y pérdidas.',
    calculation:
      'PTS + 0.4×FGM − 0.7×FGA − 0.4×(FTA−FTM) + 0.7×OREB + 0.3×DREB + STL + 0.7×AST + 0.7×BLK − 0.4×PF − TOV.',
    benchmarkText:
      '10 = actuación media · 20+ = gran partido · 30+ = noche histórica · 40+ = leyenda.',
  },
  astPct: {
    title: 'Porcentaje de Asistencias (AST%)',
    simpleDesc:
      'Porcentaje de las canastas en juego de sus compañeros que han sido asistidas por este jugador mientras está en pista.',
    calculation:
      'AST / (((Minutos Jugador / (Minutos Equipo / 5)) × FGM Equipo) − FGM Jugador) × 100.',
    benchmarkText:
      '30%+ distingue a los grandes directores de orquesta ofensivos de la NBA.',
  },
  astTo: {
    title: 'Ratio Asistencias por Pérdida (AST/PER)',
    simpleDesc:
      'Mide la seguridad y limpieza organizando el juego: cuántos pases de canasta reparte por cada balón que pierde.',
    calculation:
      'Asistencias totales (AST) divididas entre Pérdidas de balón (TOV). En un partido sin pérdidas toma el total de AST.',
    benchmarkText:
      '2.5+ = creador muy seguro · 3.5+ = control de balón de élite.',
  },
  ptsPerMin: {
    title: 'Ratio Puntos por Minuto (PTS/MIN)',
    simpleDesc:
      'Velocidad de producción anotadora por cada minuto que pisa el parqué, útil para detectar microondas y estrellas.',
    calculation: 'Puntos anotados (PTS) divididos entre los Minutos jugados (MIN).',
    benchmarkText:
      '0.75+ PTS/MIN equivale a 27+ puntos por 36 minutos · 0.90+ es ritmo de líder anotador.',
  },
  rebPer36: {
    title: 'Ratio Rebotes por 36 Minutos (REB/36)',
    simpleDesc:
      'Proyección del ritmo reboteador estandarizada a 36 minutos de juego para igualar titulares y suplentes.',
    calculation: '(Rebotes Totales REB / Minutos Jugados MIN) × 36.',
    benchmarkText: '11.0+ REB/36 identifica a reboteadores de élite aunque salgan del banquillo.',
  },
  astPer36: {
    title: 'Ratio Asistencias por 36 Minutos (AST/36)',
    simpleDesc:
      'Tasa de creación de pases de canasta proyectada a 36 minutos en pista.',
    calculation: '(Asistencias AST / Minutos Jugados MIN) × 36.',
    benchmarkText: '8.0+ AST/36 señala a generadores primarios de élite.',
  },
  orebPct: {
    title: 'Porcentaje de Rebote Ofensivo (OREB%)',
    simpleDesc:
      'Uno de los Cuatro Factores: qué porcentaje de todos los rebotes disponibles en el aro rival logra capturar.',
    calculation: 'Rebotes Ofensivos Propios / (Rebotes Ofensivos Propios + Rebotes Defensivos del Rival) × 100.',
    benchmarkText:
      'Equipo: ~25.2% media NBA (28%+ élite). Pívot: 11%+ es dominio interior.',
  },
  drebPct: {
    title: 'Porcentaje de Rebote Defensivo (DREB%)',
    simpleDesc:
      'Qué porcentaje de los tiros fallados por el rival asegura bajo su propio aro evitando segundas jugadas.',
    calculation: 'Rebotes Defensivos Propios / (Rebotes Defensivos Propios + Rebotes Ofensivos del Rival) × 100.',
    benchmarkText: 'Equipo: 75%+ cierra muy bien su aro. Jugador interior: 22%+ es élite.',
  },
  tovPct: {
    title: 'Porcentaje de Pérdidas por Posesión (TOV%)',
    simpleDesc:
      'Uno de los Cuatro Factores: cuántas posesiones de cada 100 terminan en balón perdido antes de poder lanzar.',
    calculation: 'Pérdidas Totales TOV / (FGA + 0.44 × FTA + TOV) × 100.',
    benchmarkText:
      '<12.5% = cuidado excelente · ~13.8% = media NBA · >15.5% = sangría de pérdidas.',
  },
  ptsPaint: {
    title: 'Puntos en la Pintura (Zona interior)',
    simpleDesc:
      'Puntos anotados pisando la zona restringida y pintura cercana al aro (mates, bandejas, ganchos y posteos).',
    calculation: 'Suma de puntos conseguidos desde dentro de la zona interior dividida entre partidos jugados (NBA.com Tracking).',
    benchmarkText:
      'Equipo: ~48.5 media NBA (53+ élite). Jugador: 12+ PTS es dominio interior.',
  },
  oppPtsPaint: {
    title: 'Puntos recibidos en la Pintura',
    simpleDesc:
      'Puntos cerca del aro que concede la defensa al equipo contrario. Menor cifra implica mayor protección interior.',
    calculation: 'Puntos en la pintura anotados por los rivales divididos entre los partidos jugados.',
    benchmarkText:
      'Dejar al rival por debajo de 45 PTS en la pintura es muralla interior de élite.',
  },
  pts2ndChance: {
    title: 'Puntos de Segunda Oportunidad',
    simpleDesc:
      'Puntos conseguidos en la misma jugada inmediatamente después de capturar un rebote ofensivo.',
    calculation: 'Puntos anotados tras rebote ofensivo propio divididos entre partidos jugados.',
    benchmarkText:
      'Equipo: 16+ PTS/PJ o Jugador: 3.5+ PTS/PJ castiga duramente a las defensas.',
  },
  ptsFastBreak: {
    title: 'Puntos al Contraataque (Transición)',
    simpleDesc:
      'Puntos logrados corriendo la pista a gran velocidad antes de que el balance defensivo rival se coloque.',
    calculation: 'Puntos anotados en posesiones de transición rápida divididos entre partidos jugados.',
    benchmarkText:
      '17+ PTS/PJ refleja un equipo letal corriendo tras robo o rebote.',
  },
  ptsOffTov: {
    title: 'Puntos tras Pérdida del Rival',
    simpleDesc:
      'Puntos que consigue anotar el equipo o jugador castigando directamente los balones perdidos del adversario.',
    calculation: 'Puntos logrados en la posesión inmediatamente posterior a provocar una pérdida rival / PJ.',
    benchmarkText:
      '19+ PTS/PJ suele distinguir a las defensas más agresivas de la liga.',
  },
  foulsDrawn: {
    title: 'Faltas personales recibidas (PFD)',
    simpleDesc:
      'Veces por partido que el jugador obliga al defensor a cometer falta sobre él por su agresividad o físico.',
    calculation: 'Total de faltas personales provocadas al rival dividido entre partidos jugados.',
    benchmarkText: '6.0+ faltas recibidas por noche es propio de estrellas imparables en el 1 contra 1.',
  },
  contestedShots: {
    title: 'Tiros Punteados en Defensa (Hustle)',
    simpleDesc:
      'Acción de esfuerzo defensivo: veces que el defensor acerca la mano levantada para tapar la visión del tirador.',
    calculation: 'Tiros de 2 punteados + Triples punteados registrados por cámaras de tracking NBA.com / PJ.',
    benchmarkText:
      'Jugador: 9+ por noche es ancla defensiva. Equipo: 50+ denota máxima intensidad.',
  },
  deflections: {
    title: 'Desvíos de Balón (Deflections)',
    simpleDesc:
      'Toques defensivos con la mano sobre pases o botes rivales que cortan el ritmo de la jugada aunque no acaben en robo.',
    calculation: 'Total de desvíos de balón contabilizados por el tracking oficial de NBA.com / PJ.',
    benchmarkText: 'Jugador: 3.0+ por noche es élite absoluta en líneas de pase.',
  },
  screenAssists: {
    title: 'Asistencias de Bloqueo (Screen Assists)',
    simpleDesc:
      'Pantallas o bloqueos directos que liberan a un compañero para que anote inmediatamente una canasta.',
    calculation: 'Bloqueos que derivan directamente en tiro anotado del compañero / PJ (NBA.com Hustle).',
    benchmarkText:
      '3.5+ por partido destaca a pívots fundamentales en el juego de bloqueo y continuación.',
  },
  looseBalls: {
    title: 'Balones Divididos Recuperados (Loose Balls)',
    simpleDesc:
      'Balones sueltos sin dueño claro en los que el jugador se lanza o anticipa para ganar la posesión.',
    calculation: 'Balones sueltos recuperados en ataque y defensa según tracking NBA.com / PJ.',
    benchmarkText: '1.2+ por noche muestra gran energía e instinto competitivo.',
  },
  boxOuts: {
    title: 'Cierres de Rebote (Box-Outs)',
    simpleDesc:
      'Veces que bloquea físicamente con el cuerpo a su par para impedirle acercarse al rebote.',
    calculation: 'Contactos de bloqueo de rebote contabilizados por NBA.com Hustle / PJ.',
    benchmarkText: 'Trabajo invisible clave para asegurar el rebote colectivo.',
  },
  winPct: {
    title: 'Balance Victorias - Derrotas (%V)',
    simpleDesc:
      'Registro acumulado de partidos ganados y perdidos junto a la proporción porcentual de triunfos.',
    calculation: '(Partidos Ganados W / Partidos Totales Disputados) × 100.',
    benchmarkText:
      '60%+ equivale a ~50 victorias en 82 partidos (zona noble de Playoffs).',
  },
  avgPointsFor: {
    title: 'Puntos Anotados a Favor (Ataque)',
    simpleDesc: 'Promedio bruto de puntos que sube el equipo a su marcador cada partido.',
    calculation: 'Suma total de puntos anotados por la franquicia dividida entre sus partidos jugados.',
    benchmarkText:
      '~114.2 PTS es la media NBA · 118+ PTS identifica a los equipos más anotadores.',
  },
  avgPointsAgainst: {
    title: 'Puntos Recibidos en Contra (Defensa)',
    simpleDesc:
      'Promedio de puntos que encaja el equipo por noche. ¡Cuanto más bajo sea el número, más sólida es su defensa!',
    calculation: 'Suma total de puntos anotados por sus rivales dividida entre los partidos jugados.',
    benchmarkText:
      'Dejar a los oponentes por debajo de 109–110 PTS es nivel defensivo top.',
  },
  differential: {
    title: 'Margen Medio de Puntos (Diferencial)',
    simpleDesc:
      'Ventaja (+) o desventaja (−) media de puntos por la que gana o pierde sus encuentros.',
    calculation: 'Puntos Anotados por partido (PTS Favor) − Puntos Recibidos por partido (PTS Contra).',
    benchmarkText:
      '+5.0 PTS o más suele corresponder a claros aspirantes al anillo.',
  },
  windowDiff: {
    title: 'Margen de Puntos Reciente',
    simpleDesc:
      'Diferencia media en el marcador obtenida exclusivamente en los últimos N partidos seleccionados.',
    calculation: 'Promedio de (Puntos Favor − Puntos Contra) en los últimos N encuentros.',
    benchmarkText: 'Muestra el estado de forma competitivo más inmediato del equipo.',
  },
  winNetRtg: {
    title: 'Net Rating en Ventana Reciente',
    simpleDesc:
      'Dominio neto por cada 100 posesiones medido únicamente en los últimos N partidos jugados.',
    calculation: 'Promedio de (OffRtg − DefRtg) en los últimos N encuentros de la franquicia.',
    benchmarkText: 'Permite ver si un equipo mejora de verdad ajustando por velocidad.',
  },
  streakCurrent: {
    title: 'Racha Actual y Balance Local/Visitante',
    simpleDesc:
      'Indica cuántos triunfos (W) o derrotas (L) seguidos encadena hoy el equipo, junto a su récord en casa y fuera.',
    calculation: 'Conteo consecutivo desde su último partido hacia atrás sin cambiar de signo (W o L).',
    benchmarkText: 'W5 o superior señala a los equipos más en racha del momento.',
  },
  paceSimple: {
    title: 'Ritmo de Juego (Pace · Posesiones/48m)',
    simpleDesc:
      'Velocidad a la que juega el equipo: estima de cuántos ataques dispone cada conjunto en 48 minutos.',
    calculation:
      '48 × ((Posesiones Equipo + Posesiones Rival) / (2 × (Minutos Jugados Equipo / 5))).',
    benchmarkText:
      '101+ = ritmo vertiginoso · ~99.6 = media NBA · <97 = posesiones largas y pausadas.',
  },
  vsLeagueBar: {
    title: 'Termómetro frente a la Media de la NBA',
    simpleDesc:
      'Compara visualmente al jugador o equipo contra el promedio real de rotación de toda la NBA (línea blanca central).',
    calculation:
      'Posiciona el percentil relativo usando la desviación Z respecto a la Media NBA: 50% = media exacta de la liga.',
    benchmarkText:
      'Élite NBA (verde) = top ~10% · Destacado (naranja) = sobre la media.',
  },
  consistencyScore: {
    title: 'Índice de Regularidad (0 a 100)',
    simpleDesc:
      'Califica cómo de estable y predecible es la producción del jugador noche tras noche.',
    calculation:
      '100 − ((Coeficiente de Variación de PRA − 0.12) × 210), acotado en escala de 18 a 98, donde CV = Desv.Típica / Media.',
    benchmarkText:
      '78+ = "Reloj suizo" ultra fiable · <50 = perfil "Todo o nada" muy volátil.',
  },
  ptsStdDev: {
    title: 'Desviación Típica Anotadora (±σ)',
    simpleDesc:
      'Mide cuántos puntos arriba o abajo suele dispersarse de una noche a otra respecto a su propia media.',
    calculation:
      'Raíz cuadrada de la media de las diferencias al cuadrado entre los puntos de cada noche y su media: √(Σ(x − μ)² / N).',
    benchmarkText: '±4–5 PTS es muy regular · ±9 PTS o más indica fuertes altibajos.',
  },
  floorCeiling: {
    title: 'Horquilla Habitual (Suelo – Techo 1σ)',
    simpleDesc:
      'Rango normal de puntos entre una noche discreta (suelo) y una buena noche (techo) para ese jugador.',
    calculation:
      'Suelo = Media de Puntos − 1 Desviación Típica (σ) · Techo = Media de Puntos + 1σ (cubre ~68% de sus noches).',
    benchmarkText:
      'Ideal para saber qué mínimo razonable garantiza en un partido estándar.',
  },
  hitRate85: {
    title: 'Tasa de Cumplimiento (≥85% de su media)',
    simpleDesc:
      'Porcentaje de partidos disputados en los que alcanza al menos el 85% de su promedio anotador habitual.',
    calculation:
      '(Partidos con Puntos ≥ 0.85 × Media de Puntos / Partidos Totales Jugados) × 100.',
    benchmarkText:
      '65%+ identifica a jugadores muy seguros que rara vez firman noches grises.',
  },
  consecutiveStreak: {
    title: 'Partidos Consecutivos en Racha Activa',
    simpleDesc:
      'Cuántos encuentros seguidos acumula el jugador o equipo cumpliendo la condición desde su partido más reciente hacia atrás.',
    calculation:
      'Se evalúa partido a partido desde el más reciente (índice 0, 1, 2...) sumando +1 mientras supere el umbral; se detiene al primer fallo.',
    benchmarkText:
      '5+ partidos seguidos marcan una tendencia sostenida de alto nivel.',
  },
  lastGamePerf: {
    title: 'Último Partido Disputado',
    simpleDesc:
      'Registro más reciente del jugador o equipo en el calendario oficial para verificar cuándo sumó el último eslabón de la racha.',
    calculation:
      'Valor obtenido en el encuentro con fecha más reciente (posición 0 de su historial cronológico).',
  },
  totalGamePoints: {
    title: 'Marcador Combinado Medio por Encuentro',
    simpleDesc:
      'Suma media de puntos anotados entre ambos equipos en cada partido oficial de la NBA.',
    calculation:
      'Suma de (Puntos Local + Puntos Visitante) de todos los partidos dividida entre el total de encuentros.',
    benchmarkText: '~228.4 PTS combinados es el entorno medio de un partido NBA actual.',
  },
  homeWinPct: {
    title: 'Porcentaje de Victorias Locales',
    simpleDesc:
      'Mide el peso del factor cancha en la NBA: qué proporción de partidos gana el equipo que juega en su pabellón.',
    calculation: '(Victorias del equipo local / Total de partidos disputados en la liga) × 100.',
    benchmarkText: 'Históricamente en la NBA oscila entre el 54% y el 58%.',
  },
  closeGamesPct: {
    title: 'Partidos de Final Apretado (≤ 5 pts)',
    simpleDesc:
      'Proporción de encuentros decididos por una diferencia final de 5 puntos o menos en el marcador.',
    calculation: '(Partidos con |Puntos Local − Puntos Visitante| ≤ 5 / Total de partidos) × 100.',
    benchmarkText: 'Mide la competitividad e igualdad de los cierres de partido (Clutch).',
  },
  blowoutGamesPct: {
    title: 'Partidos por Amplio Margen (≥ 15 pts)',
    simpleDesc:
      'Proporción de encuentros resueltos por paliza o ventaja holgada de 15 o más puntos.',
    calculation: '(Partidos con |Puntos Local − Puntos Visitante| ≥ 15 / Total de partidos) × 100.',
    benchmarkText: 'Suele situarse alrededor del 28%–34% en la era del triple.',
  },
  tripleDoubles: {
    title: 'Triples-Dobles Logrados (TD3)',
    simpleDesc:
      'Partidos en los que un jugador alcanza 10 o más unidades (dobles dígitos) en al menos tres categorías estadísticas distintas.',
    calculation:
      'Conteo de partidos donde al menos 3 de [Puntos, Rebotes, Asistencias, Robos, Tapones] son ≥ 10.',
    benchmarkText: 'Hito de dominio total reservado a los jugadores más completos del planeta.',
  },
  singleGamePeak: {
    title: 'Tope Máximo en un Único Partido',
    simpleDesc:
      'La marca más alta lograda en una sola noche entre todos los jugadores o franquicias de la NBA.',
    calculation:
      'Valor máximo absoluto máx(x) escaneando todas las hojas de partido individuales de la temporada.',
    benchmarkText: '60+ PTS jugador o 145+ PTS equipo representan noches históricas.',
  },
  splitContext: {
    title: 'Rendimiento Segmentado por Contexto (Splits)',
    simpleDesc:
      'Compara cómo rinde jugando en Casa vs. Fuera o Con Descanso vs. Back-to-Back (dos noches seguidas sin descanso).',
    calculation:
      'Filtra únicamente los partidos que cumplen esa condición (ej. días de descanso = 0 para B2B) y calcula su promedio.',
    benchmarkText: 'En Back-to-Back suele bajar la eficiencia por fatiga acumulada.',
  },
  minMinutesFilter: {
    title: 'Filtro de Minutos Mínimos por Partido',
    simpleDesc:
      'Oculta en los radares automáticos a jugadores con presencia testimonial para enfocar el análisis en la rotación real.',
    calculation:
      'Conserva únicamente jugadores cuyo promedio (Minutos Totales / Partidos Jugados) sea mayor o igual al umbral elegido.',
    benchmarkText: '22+ MIN centra el foco en titulares y sextos hombres.',
  },
  duelCategoryScore: {
    title: 'Marcador de Categorías Ganadas (1 vs 1)',
    simpleDesc:
      'Cuenta en cuántos apartados estadísticos supera cada jugador a su rival directo estilo videojuego deportivo.',
    calculation:
      'Suma +1 victoria al jugador con mejor registro en cada categoría evaluada (en Pérdidas y en Eficiencia Defensiva DefRtg gana quien registra la cifra más baja). Diferencias mínimas dentro del margen técnico cuentan como empate.',
    benchmarkText:
      'Ganar 10+ de 17 categorías refleja un dominio integral en ambos lados de la pista.',
  },
  duelRadarRating: {
    title: 'Valoración Global Radar (Escala 0–99)',
    simpleDesc:
      'Nota global estilo videojuego deportivo que mide el calibre real del jugador sin penalizar su posición (evita que un base baje de nota por no rebotear como un pívot o viceversa).',
    calculation:
      'Pondera 55% sus 3 mejores ejes del radar (22% + 18% + 15%) + 25% Eje de Impacto Global + 20% media de sus 3 ejes complementarios. Cada eje se normaliza (50 + 18 × Z-Score con varianza unitaria σ=1, entre 25 y 99) frente al censo real de rotación NBA (349 jugadores ≥15 MIN).',
    benchmarkText:
      '50 = Media rotación NBA · 78–88 = Titular top / All-Star · 90+ = Superestrella / Candidato MVP.',
  },
  duelSimpleAxisAvg: {
    title: 'Media Simple de los 6 Ejes (Todoterreno)',
    simpleDesc:
      'Promedio aritmético puro de las 6 notas del hexágono a partes iguales, sin ajuste por posición ni especialidad.',
    calculation:
      '(Anotación + Eficiencia + Creación + Impacto + Defensa + Rebote) / 6 sobre la escala 25–99.',
    benchmarkText:
      '50 = Rotación media · 78+ = Jugador todoterreno dominante en casi todas las facetas.',
  },
  duelAxisScoring: {
    title: 'Eje Radar: Anotación (Escala 25–99)',
    simpleDesc:
      'Mide tanto el volumen total de puntos por noche como su capacidad para producir puntos por cada minuto en cancha.',
    calculation:
      '50 + 18 × Z, combinando 72% Z(PTS frente a 12.2 ± 5.9) + 28% Z(PTS/MIN frente a 0.47 ± 0.14), acotado entre 25 y 99.',
    benchmarkText:
      '50 = Media rotación NBA (12.2 PTS) · 90+ = Líderes anotadores NBA (27+ PTS).',
  },
  duelAxisEfficiency: {
    title: 'Eje Radar: Eficiencia de Tiro y Creación (Escala 25–99)',
    simpleDesc:
      'Evalúa cuánto aprovecha cada lanzamiento (tiros de 2, triples y tiros libres vía TS%) premiando además mantener alto acierto cuando el jugador asume gran volumen ofensivo frente a dobles ayudas.',
    calculation:
      '50 + 18 × (Z_TS + Bono_Volumen), donde Z_TS = (TS% − 58.0%) / 4.5%. Si supera el 57.5% TS con alto Uso (USG% > 19.1%), suma 0.38 × ((USG% − 19.1) / 8.5) × Z_TS para distinguir a superestrellas creadoras de finalizadores de bajo volumen.',
    benchmarkText:
      '50 = Media rotación NBA (58.0% TS) · 90+ = Eficiencia histórica a gran volumen (ej. 65%+ TS con 28%+ USG).',
  },
  duelAxisPlaymaking: {
    title: 'Eje Radar: Creación de Juego (Escala 25–99)',
    simpleDesc:
      'Valora la generación de canastas para los compañeros y la seguridad cuidando el balón al asistir.',
    calculation:
      '50 + 18 × (1.12 × [74% Z(AST frente a 2.82 ± 1.78) + 26% Z(Ratio AST/PER frente a 1.98 ± 0.74)]), con factor ×1.12 de varianza unitaria.',
    benchmarkText:
      '50 = Media rotación NBA (2.8 AST) · 88+ = Directores de orquesta élite (7.5+ AST).',
  },
  duelAxisRebounding: {
    title: 'Eje Radar: Dominio del Rebote (Escala 25–99)',
    simpleDesc:
      'Capacidad para cerrar el aro propio y capturar segundas oportunidades en el aro rival.',
    calculation:
      '50 + 18 × (1.03 × [72% Z(REB frente a 4.46 ± 2.20) + 28% Z(Rebote Ofensivo frente a 1.14 ± 0.82)]), acotado entre 25 y 99.',
    benchmarkText:
      '50 = Media rotación NBA (4.5 REB) · 90+ = Especialistas interiores (10.5+ REB).',
  },
  duelAxisDefense: {
    title: 'Eje Radar: Solidez y Disrupción Defensiva (Escala 25–99)',
    simpleDesc:
      'Combina la destrucción de jugadas (robos y tapones por partido y por 36 min), la eficacia real protegiendo la canasta (DefRtg en pista) y los intangibles de esfuerzo (desvíos y tiros punteados).',
    calculation:
      '50 + 18 × (1.38 × √(PJ/(PJ+5)) × [42% Z_Disrupción(Stocks y Stocks/36m) + 35% Z_DefRtg_Invertido((113.4 − DefRtg)/4.3) + 23% Z_Hustle(55% Desvíos + 45% Punteados)]). Evita inflar a pívots que encajan muchos puntos (DefRtg alto) o rachas cortas de 3 partidos.',
    benchmarkText:
      '50 = Defensa media NBA (113.4 DefRtg, 1.35 STK) · 83–90 = All-Defense · 92+ = Candidato DPOY.',
  },
  duelAxisImpact: {
    title: 'Eje Radar: Impacto Global (Escala 25–99)',
    simpleDesc:
      'Refleja cuánto inclina la balanza hacia la victoria cuando está en pista sumando producción integral y diferencial de marcador.',
    calculation:
      '50 + 18 × (1.15 × [50% Z(Game Score frente a 9.9 ± 4.6) + 22% Z(Más/Menos frente a 0 ± 3.7) + 28% Z(PIE% frente a 9.9% ± 3.0%)]).',
    benchmarkText:
      '50 = Jugador medio de rotación (9.9 GmSc) · 92+ = Impacto de calibre MVP.',
  },
  duelSampleScope: {
    title: 'Temporada y Tramo Evaluado en el Duelo',
    simpleDesc:
      'Define qué campaña se consulta y si el cara a cara enfrenta toda la temporada, la racha reciente (3, 5 o 10 partidos) o partidos en Casa / Visitante.',
    calculation:
      'Filtra las hojas oficiales de partido de ambos jugadores en el contexto elegido y recalcula desde cero promedios, porcentajes agregados (TS%, eFG%), radar y marcador.',
    benchmarkText:
      'Actual + Pasada (65+ PJ) mide su nivel real consolidado; Solo 2026-27 refleja únicamente el arranque actual.',
  },
  duelPlayerRole: {
    title: 'Escalafón Radar y Rol Ofensivo',
    simpleDesc:
      'Une el nivel global alcanzado en el radar con el grado de protagonismo con balón dentro de su equipo.',
    calculation:
      'Escalafón según Valoración Radar (≥90 Superestrella/MVP, ≥78 All-Star/Titular Top, ≥50 Rotación NBA) + Rol según Uso Ofensivo USG% (≥28% 1ª Espada, ≥23% Estrella, <23% Apoyo).',
    benchmarkText: 'Media de protagonismo en rotación NBA = ~19.1% USG.',
  },
  duelTugOfWar: {
    title: 'Barra de Pulso Directo (Proporción 1 vs 1)',
    simpleDesc:
      'Muestra de un vistazo qué porcentaje visual del cara a cara domina cada jugador en esa estadística.',
    calculation:
      'Proporción Valor_A / (Valor_A + Valor_B) acotada entre 10% y 90%. En Pérdidas y DefRtg se invierte la escala (menor cifra = barra mayor) y en Más/Menos (+/-) se traslada sobre el mínimo para admitir negativos.',
    benchmarkText: '50% / 50% (mitad exacta) equivale a igualdad total en la categoría.',
  },
  duelHustleActions: {
    title: 'Esfuerzo Defensivo Combinado (Hustle NBA.com)',
    simpleDesc:
      'Suma las acciones de desgaste e intimidación defensiva que no aparecen en las estadísticas clásicas de robos o tapones.',
    calculation:
      'Desvíos de balón con la mano (Deflections) + Tiros rivales punteados levantando el brazo (Contested Shots) por partido según el tracking óptico de NBA.com.',
    benchmarkText:
      '6.0 acciones/partido = Media rotación NBA · 10+ = Especialista defensivo de élite.',
  },
  duelVerdictCalc: {
    title: 'Síntesis Automática del Veredicto',
    simpleDesc:
      'Conclusión objetiva generada en tiempo real cruzando el marcador de categorías, el radar de estilos y la eficiencia anotadora.',
    calculation:
      'Integra 3 cálculos: 1) Vencedor del cómputo total de categorías, 2) Mayor ventaja diferencial en los 6 ejes del radar (≥ 5 pts) y 3) Balance entre Uso Ofensivo (USG%) y Acierto Real (TS% / GmSc).',
    benchmarkText:
      'Se adapta automáticamente entre lenguaje cotidiano (Modo Sencillo) y técnico (Modo Avanzado).',
  },
  loadFullLeagueCensus: {
    title: 'Ampliar al Censo Completo NBA (Rotación vs Liga Completa)',
    simpleDesc:
      'Para que la app abra al instante en móvil y PC, inicialmente se cargan los 260 jugadores principales por minutos jugados (todos los titulares y hombres clave de rotación de los 30 equipos). Este botón descarga el resto de plantillas completas.',
    calculation:
      'Añade a la memoria local los suplentes profundos, rookies y contratos duales restantes (ej. +151 hasta los 411 que han debutado en 2026-27, o +377 hasta los 637 del modo Continuo). Nota: el buscador por nombre ya encuentra e importa a cualquier jugador sin necesidad de pulsar este botón.',
    benchmarkText:
      '260 iniciales = 100% de titulares y rotación útil · Censo total = 411–637 jugadores con ≥1 minuto.',
  },
  gamedayPulse: {
    title: 'Pulso Global de la Jornada',
    simpleDesc:
      'Resume el ritmo anotador y la igualdad competitiva de todos los partidos disputados en la fecha seleccionada sin abrir uno por uno.',
    calculation:
      'Media de puntos combinados (Local + Visitante) de los N encuentros del día comparada con el promedio anual de la liga, junto al conteo de finales apretados (margen ≤ 5 pts) y triunfos visitantes.',
    benchmarkText:
      '~228 PTS combinados = ritmo anotador estándar NBA · ≥35% finales apretados = noche de alta tensión.',
  },
  gamedayMvp: {
    title: 'MVP de la Noche (Mejor Actuación Individual)',
    simpleDesc:
      'Distingue al jugador con mayor impacto estadístico integral entre todos los encuentros disputados en esa fecha del calendario.',
    calculation:
      'Jugador con el Hollinger Game Score (GmSc) más alto de la jornada: PTS + 0.4×FGM − 0.7×FGA − 0.4×(FTA−FTM) + 0.7×OREB + 0.3×DREB + STL + 0.7×AST + 0.7×BLK − 0.4×PF − TOV.',
    benchmarkText:
      '25+ GmSc = exhibición All-Star · 32+ GmSc = dominio de calibre MVP · 40+ GmSc = noche histórica.',
  },
  gamedaySingleZ: {
    title: 'Sorpresa de una Noche (Z-Score Puntual σ)',
    simpleDesc:
      'Mide cuánto superó (▲) o empeoró (▼) un jugador su propia media habitual en ese partido concreto, permitiendo descubrir explosiones de secundarios y no solo de las mismas superestrellas.',
    calculation:
      '0.55 × Z_GameScore + 0.45 × Z_Puntos, donde Z = (Valor_Noche − Media_Previa_Jugador) / máx(3.8, Desviación_Típica_Jugador) sobre su historial previo (mínimo 4 PJ base).',
    benchmarkText:
      '+1.5σ = gran noche sobre su nivel · +2.2σ o más = explosión extraordinaria · −1.4σ = batacazo claro.',
  },
  gamedayTeamStatement: {
    title: 'Golpe en la Mesa Colectivo',
    simpleDesc:
      'Identifica la victoria colectiva más autoritaria o meritoria de toda la jornada ponderando eficiencia neta y dificultad de jugar fuera de casa.',
    calculation:
      'Selecciona al equipo ganador con mayor Índice de Autoridad = Net Rating del partido (OffRtg − DefRtg por 100 posesiones) + Bono de +3.5 puntos si el triunfo se logra como visitante.',
    benchmarkText:
      '+15.0 NetRtg en una noche refleja un dominio táctico rotundo en ambos aros.',
  },
  gamedayIdealFive: {
    title: 'Quinteto Ideal de la Jornada (Top 5 GmSc)',
    simpleDesc:
      'Los cinco jugadores más determinantes de toda la noche ordenados por valoración objetiva completa (ataque, tableros, creación, defensa y eficiencia).',
    calculation:
      'Top 5 absoluto de Game Score (GmSc) entre todos los jugadores que saltaron a pista en la fecha seleccionada, mostrando su diferencial respecto a su promedio habitual.',
    benchmarkText:
      'Reúne en una sola fila las 5 mejores hojas estadísticas del día sin revisar 10–12 boxscores.',
  },
  gamedayMatchKeys: {
    title: 'Radiografía Automática de Claves del Partido',
    simpleDesc:
      'Explica en dos frases por qué ganó cada equipo analizando las ventajas estadísticas reales que decidieron el marcador.',
    calculation:
      'Evalúa y jerarquiza los diferenciales Ganador vs Perdedor en los Cuatro Factores de Dean Oliver: 1) Tiro Efectivo (eFG%), 2) Volumen y puntería exterior (3PM / 3P%), 3) Pérdidas provocadas (TOV / TOV%), 4) Rebote ofensivo (OREB%) y 5) Tiros libres anotados (FTM).',
    benchmarkText:
      'Pulsa cualquier partido para desplegar al instante los mejores jugadores de ambos equipos.',
  },
  gamedayExplosions: {
    title: 'Noches de Explosión frente a su Media (▲)',
    simpleDesc:
      'Jugadores que firmaron una actuación muy superior a su promedio habitual, indicando si se debió a mayor rol en pista o a una muñeca ardiendo.',
    calculation:
      'Filtra jugadores con ≥4 PJ previos, ≥16 MIN en la noche y Z-Score puntual ≥ +1.35σ (o +10 PTS sobre su media). Clasifica el motor entre "Salto de rol" (+5.5 MIN o +5% USG) y "Puntería al rojo vivo" (+12% TS sobre su media).',
    benchmarkText:
      'Las explosiones respaldadas por más minutos y tiros (USG%) suelen mantenerse en jornadas siguientes.',
  },
  gamedaySlumps: {
    title: 'Noches Aciagas / Batacazos frente a su Media (▼)',
    simpleDesc:
      'Titulares y referentes ofensivos habituales que sufrieron un cortocircuito estadístico en puntos, porcentajes o pérdidas.',
    calculation:
      'Evalúa exclusivamente jugadores consolidados (media ≥22 MIN y ≥12 PTS con ≥5 PJ base) que jugaron al menos 16 minutos esa noche (excluyendo lesiones tempranas) y registraron Z ≤ −1.25σ.',
    benchmarkText:
      'Si el jugador mantuvo sus minutos y tiros habituales pero tuvo <42% TS, suele rebotar al alza en el siguiente partido.',
  },
  gamedayRoleShift: {
    title: 'Radar de Minutos Inusuales y Cambios de Rol',
    simpleDesc:
      'Detecta al instante qué jugadores absorbieron muchos más minutos o tiros de lo normal esa noche (por lesiones de compañeros, descansos o ajustes del entrenador).',
    calculation:
      'Compara la noche frente a la media previa del jugador y alerta cuando gana +6.5 MIN extra o +6.0% de Uso Ofensivo (USG% con ≥10 TCI) jugando al menos 20 minutos.',
    benchmarkText:
      'Herramienta clave para anticipar titulares emergentes y oportunidades antes de que suban sus medias globales.',
  },
  gamedayStreakShift: {
    title: 'Termómetro de Rachas: Prolongadas y Rotas',
    simpleDesc:
      'Rastrea entre todos los protagonistas de la jornada quién alargó una racha vigente de 4+ partidos seguidos y quién vio cortada su serie esa noche.',
    calculation:
      'Escanea el historial cronológico hasta la fecha elegida en 6 hitos (25+ PTS, 20+ PTS, 10+ REB, 8+ AST, 3+ 3PM, 2+ Robos/Tapones). Marca "Prolongada" si cumple y alcanza ≥4 PJ seguidos; marca "Racha rota" si llegaba con ≥4 PJ previos seguidos y falló (con ≥14 MIN en pista).',
    benchmarkText:
      'Permite ver de un vistazo qué dinámicas siguen vivas y qué rachas históricas cayeron anoche.',
  },
  gamedayGlobalChronicle: {
    title: 'Crónica Global de Scouting y Actualidad NBA',
    simpleDesc:
      'Artículo matinal escrito desde la óptica de un periodista y scout NBA que conecta las tendencias tácticas, exhibiciones individuales, sorpresas de rol e hitos de toda la jornada.',
    calculation:
      'Combina el expediente empírico completo del día (pulsos de ritmo, 4 Factores, Quinteto Ideal, explosiones Z, cambios de minutos y rachas) con Gemini y búsqueda de actualidad NBA en tiempo real para contextualizar lesiones, declaraciones y clasificación.',
    benchmarkText:
      'Permanece plegada por defecto cada mañana para no ralentizar tu lectura rápida y se guarda en caché tras abrirse.',
  },
  gameReportQuarters: {
    title: 'Parciales por Cuartos y Punto de Quiebre',
    simpleDesc:
      'Desglosa el tanteo periodo a periodo (Q1–Q4 y prórrogas) para identificar en qué tramo exacto cambió el mando táctico del encuentro.',
    calculation:
      'Extraído del acta oficial en vivo de NBA.com (liveData boxscore). El "Punto de quiebre" señala el cuarto donde el equipo ganador logró su mayor diferencial neto de puntos.',
    benchmarkText:
      'Un parcial de +10 o más en un solo cuarto suele marcar la ruptura definitiva de pizarra.',
  },
  gameReportPodium: {
    title: 'Podio del Partido (⭐⭐⭐ / ⭐⭐ / ⭐)',
    simpleDesc:
      'Clasifica objetivamente a los tres mejores jugadores de cada equipo combinando su producción estadística integral con el impacto real de su equipo mientras estuvieron en pista.',
    calculation:
      'Índice Podio = Hollinger Game Score (GmSc) + 0.22 × Más/Menos en pista (+/-) + Bono de +1.5 si su equipo logró la victoria. Asigna ⭐⭐⭐ al 1º, ⭐⭐ al 2º y ⭐ al 3º de cada conjunto.',
    benchmarkText:
      'Equilibra volumen anotador, eficiencia de tiro, creación, defensa y diferencial real con el jugador en cancha.',
  },
  gameReportSpecialty: {
    title: 'Batallas Tácticas del Acta Oficial NBA.com (Game Book)',
    simpleDesc:
      'Mide las cinco guerras invisibles de pizarra que publican los informes oficiales de partido de la NBA: dominio interior, velocidad de transición, castigo de errores, segundas jugadas y profundidad de rotación.',
    calculation:
      'Datos oficiales del NBA Game Book: Puntos en la Pintura (PIP), Puntos al Contraataque (Fast Break), Puntos tras Pérdida Rival, Puntos de 2ª Oportunidad (tras rebote ofensivo) y Puntos de Banquillo (suplentes).',
    benchmarkText:
      'Ganar 3 o más de estas 5 batallas tácticas se traduce en victoria en más del 78% de los partidos NBA.',
  },
  gameReportLeaders: {
    title: 'Cara a Cara: Líderes Individuales (#Dorsal I. Apellido)',
    simpleDesc:
      'Enfrenta directamente al mejor especialista del equipo visitante y del equipo local en las 8 grandes categorías individuales del encuentro.',
    calculation:
      'Selecciona al líder máximo de cada plantilla en Puntos, Rebotes, Asistencias, Triples, Robos, Tapones, Más/Menos (+/-) y Valoración (GmSc), desempatando por eficiencia y menor número de minutos.',
    benchmarkText:
      'Formato estricto de scouting oficial: #Dorsal Inicial. Apellido (Registro). Pulsa cualquier líder para abrir su ficha.',
  },
  benchPts: {
    title: 'Puntos de la Segunda Unidad (Banquillo)',
    simpleDesc:
      'Aportación ofensiva combinada de todos los jugadores que no formaron parte del quinteto titular inicial.',
    calculation:
      'Suma total de puntos anotados por los jugadores suplentes (no titulares) de cada equipo en el partido.',
    benchmarkText:
      '~34 PTS es el promedio NBA de banquillo; superar los 45 PTS indica una profundidad de plantilla decisiva.',
  },
  biggestLead: {
    title: 'Máxima Ventaja y Mayor Parcial',
    simpleDesc:
      'Refleja el techo de dominio que llegó a alcanzar cada equipo en el marcador y su racha consecutiva de puntos sin respuesta rival.',
    calculation:
      'Máxima diferencia favorable registrada en el acta jugada a jugada (Play-by-Play) y mayor racha ininterrumpida (ej. parcial 14-0).',
    benchmarkText:
      'Remontar desventajas de 15+ puntos distingue victorias de enorme resiliencia táctica.',
  },
};

const METRIC_KEY_ALIASES: Record<string, string> = {
  // General & Comparator aliases
  points: 'ptsBase',
  pts: 'ptsBase',
  rebounds: 'rebBase',
  reb: 'rebBase',
  oreb: 'orebBase',
  orebAvg: 'orebBase',
  dreb: 'drebBase',
  assists: 'astBase',
  ast: 'astBase',
  minutes: 'minBase',
  min: 'minBase',
  stocks: 'stocksBase',
  plusMinus: 'plusMinusBase',
  usgEst: 'usgPct',
  gameScore: 'gmSc',
  fg3mAvg: 'fg3m',
  pf: 'avgPointsFor',
  pa: 'avgPointsAgainst',
  diff: 'differential',
  pace: 'paceSimple',
  // Milestones Global IDs
  ppg: 'avgPointsFor',
  tot: 'totalGamePoints',
  offrtg: 'offRtg',
  efg: 'efgPct',
  ts: 'tsPct',
  '3pm': 'fg3m',
  '3pct': 'fg3Pct',
  orb: 'orebBase',
  orebpct: 'orebPct',
  tovpct: 'tovPct',
  paint: 'ptsPaint',
  second: 'pts2ndChance',
  fb: 'ptsFastBreak',
  homew: 'homeWinPct',
  close: 'closeGamesPct',
  blowout: 'blowoutGamesPct',
  // Milestones Single-Game IDs
  'sg-player-pts': 'ptsBase',
  'sg-player-gmsc': 'gmSc',
  'sg-player-3pm': 'fg3m',
  'sg-player-oreb': 'orebBase',
  'sg-player-reb': 'rebBase',
  'sg-player-ast': 'astBase',
  'sg-player-stocks': 'stocksBase',
  'sg-player-pm': 'plusMinusBase',
  'sg-team-pts': 'avgPointsFor',
  'sg-team-3pm': 'fg3m',
  'sg-team-margin': 'differential',
  'sg-team-total': 'totalGamePoints',
  // Milestones Season Leaders IDs
  'sl-player-orb-avg': 'orebBase',
  'sl-player-orb-tot': 'orebBase',
  'sl-team-orb-avg': 'orebBase',
  'sl-player-reb-avg': 'rebBase',
  'sl-player-pts-avg': 'ptsBase',
  'sl-player-3pm-avg': 'fg3m',
  'sl-player-3pm-tot': 'fg3m',
  'sl-team-3pm-avg': 'fg3m',
  'sl-player-ast-avg': 'astBase',
  'sl-player-blk-avg': 'blocks',
  'sl-player-td3': 'tripleDoubles',
  'sl-player-usg': 'usgPct',
  'sl-player-pie': 'pie',
  'sl-player-ts': 'tsPct',
  'sl-player-paint': 'ptsPaint',
  'sl-player-defl': 'deflections',
  'sl-team-netrtg': 'netRtg',
  'sl-team-defrtg': 'defRtg',
  'sl-team-pace': 'paceSimple',
};

export function resolveMetricHelp(
  key?: string,
  fallbackTitle?: string
): ColumnHelpEntry | undefined {
  if (key) {
    if (COLUMN_HELP[key]) return COLUMN_HELP[key];
    const mapped = METRIC_KEY_ALIASES[key];
    if (mapped && COLUMN_HELP[mapped]) return COLUMN_HELP[mapped];
  }
  if (fallbackTitle) {
    return {
      title: fallbackTitle,
      simpleDesc: 'Indicador estadístico oficial calculado sobre los partidos registrados.',
      calculation: 'Obtenido agregando las hojas oficiales de partido de la NBA.',
    };
  }
  return undefined;
}

