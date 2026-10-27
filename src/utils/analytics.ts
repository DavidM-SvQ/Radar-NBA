import type {
  AnomalySignal,
  ComparisonMetricRow,
  ConsistencyEntry,
  PlayerGameLog,
  PlayerSummary,
  RangeSelection,
  StreakEntry,
  TeamGameLog,
  TeamSummary,
  ThresholdSettings,
  WindowSize,
} from '../types/nba';

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  let sqDiffSum = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - avg;
    sqDiffSum += diff * diff;
  }
  return Math.sqrt(sqDiffSum / values.length);
}

export function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function normalizeSearchText(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function formatSigned(val: number, decimals = 1, suffix = ''): string {
  const fixed = Math.abs(val).toFixed(decimals);
  if (val > 0.04) return `+${fixed}${suffix}`;
  if (val < -0.04) return `-${fixed}${suffix}`;
  return `0.0${suffix}`;
}

export function formatShortDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function computePlayerTakeaways(
  player: PlayerSummary,
  windowSize: WindowSize
): string[] {
  const games = player.games;
  if (games.length < 2) {
    return ['Muestra insuficiente de partidos para desglosar patrones contextuales.'];
  }

  const winSlice = games.slice(0, Math.min(windowSize, games.length));
  const notes: string[] = [];

  // 1. Role/Volume (MIN + FGA + USG%) vs Shooting Efficiency (TS% + 3P%)
  const baseMin = mean(games.map((g) => g.minutes));
  const winMin = mean(winSlice.map((g) => g.minutes));
  const minDiff = winMin - baseMin;

  const baseFga = mean(games.map((g) => g.fga));
  const winFga = mean(winSlice.map((g) => g.fga));
  const fgaDiff = winFga - baseFga;

  const baseUsg = mean(games.map((g) => g.usgEst));
  const winUsg = mean(winSlice.map((g) => g.usgEst));
  const usgDiff = winUsg - baseUsg;

  const baseTs = mean(games.map((g) => g.tsPct));
  const winTs = mean(winSlice.map((g) => g.tsPct));
  const tsDiff = winTs - baseTs;

  const basePts = mean(games.map((g) => g.points));
  const winPts = mean(winSlice.map((g) => g.points));
  const ptsDiff = winPts - basePts;

  if (Math.abs(minDiff) >= 3.2 || Math.abs(usgDiff) >= 3.8) {
    const dir = minDiff >= 0 && usgDiff >= -1 ? 'expansión' : 'reducción';
    notes.push(
      `Cambio estructural de rol (${dir}): promedia ${winMin.toFixed(1)} MIN (${formatSigned(
        minDiff
      )}), ${winUsg.toFixed(1)}% de Uso USG% (${formatSigned(
        usgDiff,
        1,
        ' pp'
      )}) y ${winFga.toFixed(1)} tiros/PJ en los últimos ${winSlice.length} PJ.`
    );
  } else if (ptsDiff >= 3.5 && tsDiff >= 7.5 && Math.abs(usgDiff) < 2.5) {
    notes.push(
      `Pico de eficiencia pura: firma un ${winTs.toFixed(
        1
      )}% en Tiro Verdadero (TS%) frente a su ${baseTs.toFixed(
        1
      )}% base sin subida relevante de uso ni minutos (vigilar regresión).`
    );
  } else if (ptsDiff <= -3.5 && tsDiff <= -7.5 && usgDiff >= -1.5 && minDiff >= -1.5) {
    notes.push(
      `Oportunidad de rebote positivo: cae a un ${winTs.toFixed(
        1
      )}% TS reciente (base ${baseTs.toFixed(
        1
      )}%), pero mantiene intactos su Uso (${winUsg.toFixed(1)}% USG) y minutos.`
    );
  }

  // 2. Official NBA.com Advanced / Zone / Hustle context if available
  if (player.advanced) {
    const adv = player.advanced;
    if (adv.ptsPaint >= 10 || adv.pts2ndChance >= 3.2) {
      notes.push(
        `Dominio interior (NBA.com): genera ${adv.ptsPaint.toFixed(
          1
        )} PTS en la pintura y ${adv.pts2ndChance.toFixed(
          1
        )} PTS de 2ª oportunidad por noche (${adv.orebPct.toFixed(1)}% OREB%).`
      );
    } else if (adv.deflections >= 2.8 || adv.contestedShots >= 8.5) {
      notes.push(
        `Alto impacto intangible (Hustle): registra ${adv.deflections.toFixed(
          1
        )} desvíos y ${adv.contestedShots.toFixed(
          1
        )} tiros punteados por partido (DefRtg ${adv.defRtg.toFixed(1)}).`
      );
    } else if (adv.pie >= 15.0) {
      notes.push(
        `Impacto élite NBA.com: ${adv.pie.toFixed(1)}% PIE con Net Rating en pista de ${formatSigned(
          adv.netRtg
        )} (${adv.astPct.toFixed(1)}% AST%).`
      );
    }
  }

  // 3. Home vs Away split
  const homeGames = games.filter((g) => g.isHome);
  const awayGames = games.filter((g) => !g.isHome);
  if (homeGames.length >= 3 && awayGames.length >= 3) {
    const homePts = mean(homeGames.map((g) => g.points));
    const awayPts = mean(awayGames.map((g) => g.points));
    const splitDiff = homePts - awayPts;
    if (Math.abs(splitDiff) >= 2.8) {
      notes.push(
        splitDiff > 0
          ? `Factor cancha marcado: rinde +${splitDiff.toFixed(1)} PTS mejor como local (${homePts.toFixed(1)} en casa vs ${awayPts.toFixed(1)} fuera).`
          : `Especialista visitante: anota +${Math.abs(splitDiff).toFixed(1)} PTS más a domicilio (${awayPts.toFixed(1)} fuera vs ${homePts.toFixed(1)} en casa).`
      );
    }
  }

  // 4. Back-to-Back (0 rest days)
  const b2bGames = games.filter((g) => g.isBackToBack);
  const restedGames = games.filter((g) => !g.isBackToBack);
  if (b2bGames.length >= 2 && restedGames.length >= 4) {
    const b2bPts = mean(b2bGames.map((g) => g.points));
    const restPts = mean(restedGames.map((g) => g.points));
    const b2bDiff = b2bPts - restPts;
    if (Math.abs(b2bDiff) >= 2.2) {
      notes.push(
        `Impacto Back-to-Back (${b2bGames.length} PJ sin descanso): promedia ${b2bPts.toFixed(1)} PTS (${formatSigned(b2bDiff)} respecto a partidos descansado).`
      );
    }
  }

  // 5. Consistency & Game Score band
  const ptsSd = stdDev(games.map((g) => g.points));
  const avgGmSc = mean(games.map((g) => g.gameScore));
  if (games.length >= 4) {
    const floor = Math.max(0, basePts - ptsSd);
    const ceil = basePts + ptsSd;
    notes.push(
      `Banda habitual (1σ): oscila entre ${floor.toFixed(1)} y ${ceil.toFixed(
        1
      )} PTS (±${ptsSd.toFixed(1)}) con valoración media de ${avgGmSc.toFixed(1)} GmSc.`
    );
  }

  return notes;
}

export function computeTeamTakeaways(
  team: TeamSummary,
  windowSize: WindowSize
): string[] {
  const games = team.games;
  if (games.length < 2) {
    return ['Muestra corta de partidos completados en el modo de temporada seleccionado.'];
  }

  const winSlice = games.slice(0, Math.min(windowSize, games.length));
  const notes: string[] = [];

  const baseOff = mean(games.map((g) => g.offRtg));
  const winOff = mean(winSlice.map((g) => g.offRtg));
  const baseDef = mean(games.map((g) => g.defRtg));
  const winDef = mean(winSlice.map((g) => g.defRtg));
  const baseNet = mean(games.map((g) => g.netRtg));
  const winNet = mean(winSlice.map((g) => g.netRtg));
  const netDelta = winNet - baseNet;

  if (Math.abs(netDelta) >= 3.2) {
    notes.push(
      `Giro en Net Rating reciente (${winSlice.length} PJ): firma ${formatSigned(
        winNet
      )} pts/100 pos. (${formatSigned(netDelta)} vs base), con OffRtg ${winOff.toFixed(
        1
      )} y DefRtg ${winDef.toFixed(1)}.`
    );
  }

  const basePace = mean(games.map((g) => g.pace));
  const winPace = mean(winSlice.map((g) => g.pace));
  const paceDelta = winPace - basePace;
  if (Math.abs(paceDelta) >= 2.2) {
    notes.push(
      paceDelta > 0
        ? `Aceleración de ritmo real (Pace): juega a ${winPace.toFixed(
            1
          )} posesiones/48m en el tramo reciente (${formatSigned(paceDelta)} sobre su media de ${basePace.toFixed(1)}).`
        : `Desaceleración táctica: baja a ${winPace.toFixed(
            1
          )} posesiones/48m (${formatSigned(paceDelta)} frente a su Pace base de ${basePace.toFixed(1)}).`
    );
  }

  if (team.advanced) {
    const adv = team.advanced;
    notes.push(
      `Cuatro Factores y Zona (NBA.com): ${adv.efgPct.toFixed(1)}% eFG · ${adv.orebPct.toFixed(
        1
      )}% OREB · ${adv.tovPct.toFixed(1)}% TOV · ${adv.ptsPaint.toFixed(
        1
      )} PTS en pintura/PJ.`
    );
  }

  const b2b = games.filter((g) => g.isBackToBack);
  if (b2b.length >= 2) {
    const b2bWins = b2b.filter((g) => g.result === 'W').length;
    const b2bNet = mean(b2b.map((g) => g.netRtg));
    notes.push(
      `Rendimiento en Back-to-Back: balance ${b2bWins}-${
        b2b.length - b2bWins
      } con Net Rating medio de ${formatSigned(b2bNet)} sin descanso.`
    );
  }

  return notes;
}

export function detectAnomalies(
  players: PlayerSummary[],
  teams: TeamSummary[],
  settings: ThresholdSettings
): AnomalySignal[] {
  const signals: AnomalySignal[] = [];
  const { windowSize, minZScore, minPctDelta, minMinutes } = settings;

  // 1. Player anomalies (Basic Production + Role/Usage + Advanced Efficiency/Impact)
  for (const player of players) {
    const games = player.games;
    if (games.length < 3) continue;

    const avgMin = mean(games.map((g) => g.minutes));
    if (avgMin < minMinutes) continue;

    const effWinSize = Math.min(windowSize, Math.max(2, games.length - 1));
    const winGames = games.slice(0, effWinSize);
    const takeaways = computePlayerTakeaways(player, windowSize);
    const subtitle = `${player.teamAbbr} · ${player.position} · Base ${games.length} PJ`;

    const winMin = mean(winGames.map((g) => g.minutes));
    const minDelta = winMin - avgMin;
    const baseFga = mean(games.map((g) => g.fga));
    const winFga = mean(winGames.map((g) => g.fga));
    const fgaDelta = winFga - baseFga;

    const baseUsg = mean(games.map((g) => g.usgEst));
    const winUsg = mean(winGames.map((g) => g.usgEst));
    const usgDelta = winUsg - baseUsg;

    const baseTs = mean(games.map((g) => g.tsPct));
    const winTs = mean(winGames.map((g) => g.tsPct));
    const tsDelta = winTs - baseTs;

    // A) Primary Boxscore & Game Score impact outlier
    const metricsToCheck: Array<{
      key: 'points' | 'rebounds' | 'assists' | 'pra' | 'gameScore';
      label: string;
      minBase: number;
    }> = [
      { key: 'points', label: 'Puntos (PTS)', minBase: 10 },
      { key: 'rebounds', label: 'Rebotes (REB)', minBase: 4.5 },
      { key: 'assists', label: 'Asistencias (AST)', minBase: 3.5 },
      { key: 'pra', label: 'PTS+REB+AST', minBase: 18 },
      { key: 'gameScore', label: 'Valoración (GmSc)', minBase: 9.5 },
    ];

    let bestMetricSignal: AnomalySignal | null = null;

    for (const m of metricsToCheck) {
      const series = games.map((g) => g[m.key]);
      const base = mean(series);
      if (base < m.minBase) continue;
      const sd = Math.max(stdDev(series), base * 0.13);
      const winVal = mean(winGames.map((g) => g[m.key]));
      const absDelta = winVal - base;
      const pctDelta = (absDelta / base) * 100;
      const zScore = absDelta / sd;

      const passesThreshold =
        Math.abs(zScore) >= minZScore || Math.abs(pctDelta) >= minPctDelta;
      if (!passesThreshold) continue;

      const isPositive = absDelta > 0;
      let sustainabilityLabel = isPositive
        ? 'Respaldado por uso y volumen'
        : 'Caída de producción';
      let sustainabilityTone: 'solid' | 'warning' | 'negative' = isPositive
        ? 'solid'
        : 'negative';

      if (isPositive && minDelta < 1.2 && usgDelta < 1.5 && tsDelta >= 8.0) {
        sustainabilityLabel = 'Inflado por TS% alto (vigilar regresión)';
        sustainabilityTone = 'warning';
      } else if (!isPositive && minDelta > -1.2 && usgDelta > -1.5 && tsDelta <= -8.0) {
        sustainabilityLabel = 'Bache de tiro con mismo Uso (rebote)';
        sustainabilityTone = 'warning';
      } else if (isPositive && (minDelta >= 3.0 || usgDelta >= 3.2 || fgaDelta >= 2.5)) {
        sustainabilityLabel = `Sólido (${formatSigned(usgDelta, 1, '% USG')} / ${formatSigned(
          minDelta,
          1,
          ' MIN'
        )})`;
        sustainabilityTone = 'solid';
      }

      const candidate: AnomalySignal = {
        id: `player-${player.id}-${m.key}`,
        entityType: 'player',
        entityId: player.id,
        entityName: player.name,
        subtitle,
        teamAbbr: player.teamAbbr,
        category: m.key === 'gameScore' ? 'advanced_shift' : isPositive ? 'surge' : 'slump',
        categoryLabel:
          m.key === 'gameScore'
            ? isPositive
              ? 'Pico impacto global GmSc'
              : 'Caída impacto global GmSc'
            : isPositive
            ? 'Explosión estadística'
            : 'Bajón acusado',
        metricKey: m.key,
        metricLabel: m.label,
        baselineAvg: round1(base),
        windowAvg: round1(winVal),
        absDelta: round1(absDelta),
        pctDelta: round1(pctDelta),
        zScore: round1(zScore),
        sampleGames: effWinSize,
        baselineGames: games.length,
        sustainabilityLabel,
        sustainabilityTone,
        contextNote: takeaways[0] || '',
        takeaways,
      };

      if (
        !bestMetricSignal ||
        Math.abs(candidate.zScore) > Math.abs(bestMetricSignal.zScore)
      ) {
        bestMetricSignal = candidate;
      }
    }

    if (bestMetricSignal) {
      signals.push(bestMetricSignal);
    }

    // B) Usage Rate (USG%) or Minutes structural Role Shift
    const usgSeries = games.map((g) => g.usgEst);
    const usgSd = Math.max(stdDev(usgSeries), 3.2);
    const usgZ = usgDelta / usgSd;
    const usgPctChange = (usgDelta / Math.max(12, baseUsg)) * 100;

    if (
      baseUsg >= 14 &&
      Math.abs(usgDelta) >= 4.2 &&
      (Math.abs(usgZ) >= minZScore * 0.9 || Math.abs(usgPctChange) >= minPctDelta * 0.95)
    ) {
      signals.push({
        id: `player-${player.id}-usg`,
        entityType: 'player',
        entityId: player.id,
        entityName: player.name,
        subtitle,
        teamAbbr: player.teamAbbr,
        category: 'role_shift',
        categoryLabel: usgDelta > 0 ? 'Salto en Uso de balón' : 'Pérdida de Uso ofensivo',
        metricKey: 'usgEst',
        metricLabel: 'Uso Ofensivo (USG%)',
        baselineAvg: round1(baseUsg),
        windowAvg: round1(winUsg),
        absDelta: round1(usgDelta),
        pctDelta: round1(usgPctChange),
        zScore: round1(usgZ),
        sampleGames: effWinSize,
        baselineGames: games.length,
        sustainabilityLabel:
          usgDelta > 0
            ? `Absorbe ${formatSigned(fgaDelta)} tiros/PJ`
            : `Cede ${formatSigned(fgaDelta)} tiros/PJ`,
        sustainabilityTone: usgDelta > 0 ? 'solid' : 'negative',
        contextNote: takeaways[0] || '',
        takeaways,
      });
    } else {
      const minSeries = games.map((g) => g.minutes);
      const minSd = Math.max(stdDev(minSeries), 2.5);
      const minZ = minDelta / minSd;
      const minPct = (minDelta / Math.max(1, avgMin)) * 100;
      if (
        Math.abs(minDelta) >= 4.5 &&
        (Math.abs(minZ) >= minZScore * 0.92 || Math.abs(minPct) >= minPctDelta * 0.9)
      ) {
        signals.push({
          id: `player-${player.id}-minutes`,
          entityType: 'player',
          entityId: player.id,
          entityName: player.name,
          subtitle,
          teamAbbr: player.teamAbbr,
          category: 'role_shift',
          categoryLabel: 'Cambio de rotación / MIN',
          metricKey: 'minutes',
          metricLabel: 'Minutos (MIN)',
          baselineAvg: round1(avgMin),
          windowAvg: round1(winMin),
          absDelta: round1(minDelta),
          pctDelta: round1(minPct),
          zScore: round1(minZ),
          sampleGames: effWinSize,
          baselineGames: games.length,
          sustainabilityLabel:
            minDelta > 0
              ? `Uso ${formatSigned(usgDelta, 1, '% USG')}`
              : `Recorte de rotación`,
          sustainabilityTone: minDelta > 0 ? 'solid' : 'negative',
          contextNote: takeaways[0] || '',
          takeaways,
        });
      }
    }

    // C) True Shooting (TS%) / 3P% Efficiency Divergence
    const winFgaSum = winGames.reduce((s, g) => s + g.fga, 0);
    if (winFgaSum >= 28 && games.length >= 5) {
      if (Math.abs(tsDelta) >= Math.max(9.5, minPctDelta * 0.6)) {
        const tsZ = tsDelta / Math.max(stdDev(games.map((g) => g.tsPct)), 7.5);
        if (Math.abs(tsZ) >= minZScore * 0.85) {
          signals.push({
            id: `player-${player.id}-tsPct`,
            entityType: 'player',
            entityId: player.id,
            entityName: player.name,
            subtitle,
            teamAbbr: player.teamAbbr,
            category: 'shooting_variance',
            categoryLabel:
              tsDelta > 0 ? 'Fiebre de eficiencia TS%' : 'Hundimiento en TS%',
            metricKey: 'tsPct',
            metricLabel: 'Tiro Verdadero (TS%)',
            baselineAvg: round1(baseTs),
            windowAvg: round1(winTs),
            absDelta: round1(tsDelta),
            pctDelta: round1((tsDelta / Math.max(35, baseTs)) * 100),
            zScore: round1(tsZ),
            sampleGames: effWinSize,
            baselineGames: games.length,
            sustainabilityLabel:
              tsDelta > 0
                ? 'Varianza alta (probable regresión)'
                : 'Candidato a rebote de acierto',
            sustainabilityTone: 'warning',
            contextNote: takeaways[0] || '',
            takeaways,
          });
        }
      }
    }
  }

  // 2. Team anomalies (Net Rating, Offensive Rating, Defensive Rating & Real Pace)
  for (const team of teams) {
    const games = team.games;
    if (games.length < 3) continue;
    const effWinSize = Math.min(windowSize, Math.max(2, games.length - 1));
    const winGames = games.slice(0, effWinSize);
    const takeaways = computeTeamTakeaways(team, windowSize);
    const subtitle = `Conf. ${team.conference} · Balance ${team.wins}-${team.losses}`;

    // A) Net Rating shift (pts per 100 possessions)
    const netSeries = games.map((g) => g.netRtg);
    const baseNet = mean(netSeries);
    const sdNet = Math.max(stdDev(netSeries), 6.5);
    const winNet = mean(winGames.map((g) => g.netRtg));
    const netDelta = winNet - baseNet;
    const zNet = netDelta / sdNet;
    const pseudoNetPct = (netDelta / Math.max(8, Math.abs(baseNet) + 6)) * 100;

    if (
      Math.abs(netDelta) >= Math.max(4.8, minPctDelta * 0.34) &&
      (Math.abs(zNet) >= minZScore * 0.62 ||
        Math.abs(pseudoNetPct) >= minPctDelta * 1.35)
    ) {
      signals.push({
        id: `team-${team.id}-netRtg`,
        entityType: 'team',
        entityId: team.id,
        entityName: team.name,
        subtitle,
        teamAbbr: team.abbreviation,
        category: 'team_shift',
        categoryLabel:
          netDelta > 0 ? 'Salto en Net Rating' : 'Desplome en Net Rating',
        metricKey: 'netRtg',
        metricLabel: 'Net Rating (/100 pos)',
        baselineAvg: round1(baseNet),
        windowAvg: round1(winNet),
        absDelta: round1(netDelta),
        pctDelta: round1(pseudoNetPct),
        zScore: round1(zNet),
        sampleGames: effWinSize,
        baselineGames: games.length,
        sustainabilityLabel:
          netDelta > 0 ? 'Dominio ajustado a ritmo' : 'Bache competitivo neto',
        sustainabilityTone: netDelta > 0 ? 'solid' : 'negative',
        contextNote: takeaways[0] || '',
        takeaways,
      });
    }

    // B) Offensive Rating (OffRtg) shift
    const offSeries = games.map((g) => g.offRtg);
    const baseOff = mean(offSeries);
    const sdOff = Math.max(stdDev(offSeries), 5.8);
    const winOff = mean(winGames.map((g) => g.offRtg));
    const offDelta = winOff - baseOff;
    const offZ = offDelta / sdOff;
    const offPct = (offDelta / Math.max(95, baseOff)) * 100;

    if (
      Math.abs(offDelta) >= Math.max(5.2, minPctDelta * 0.36) &&
      Math.abs(offZ) >= minZScore * 0.66
    ) {
      signals.push({
        id: `team-${team.id}-offRtg`,
        entityType: 'team',
        entityId: team.id,
        entityName: team.name,
        subtitle,
        teamAbbr: team.abbreviation,
        category: 'team_shift',
        categoryLabel: offDelta > 0 ? 'Explosión OffRtg' : 'Atasco en OffRtg',
        metricKey: 'offRtg',
        metricLabel: 'Eficiencia Ofensiva (OffRtg)',
        baselineAvg: round1(baseOff),
        windowAvg: round1(winOff),
        absDelta: round1(offDelta),
        pctDelta: round1(offPct),
        zScore: round1(offZ),
        sampleGames: effWinSize,
        baselineGames: games.length,
        sustainabilityLabel:
          offDelta > 0 ? 'Ataque élite reciente' : 'Caída eficiencia ofensiva',
        sustainabilityTone: offDelta > 0 ? 'solid' : 'negative',
        contextNote: takeaways[0] || '',
        takeaways,
      });
    }

    // C) Defensive Rating (DefRtg — lower is better!)
    const defSeries = games.map((g) => g.defRtg);
    const baseDef = mean(defSeries);
    const sdDef = Math.max(stdDev(defSeries), 5.8);
    const winDef = mean(winGames.map((g) => g.defRtg));
    const defDelta = winDef - baseDef;
    const defZ = defDelta / sdDef;
    const defPct = (defDelta / Math.max(95, baseDef)) * 100;

    if (
      Math.abs(defDelta) >= Math.max(5.2, minPctDelta * 0.36) &&
      Math.abs(defZ) >= minZScore * 0.66
    ) {
      signals.push({
        id: `team-${team.id}-defRtg`,
        entityType: 'team',
        entityId: team.id,
        entityName: team.name,
        subtitle,
        teamAbbr: team.abbreviation,
        category: 'team_shift',
        categoryLabel:
          defDelta < 0 ? 'Cerrojo defensivo (DefRtg ↓)' : 'Fragilidad atrás (DefRtg ↑)',
        metricKey: 'defRtg',
        metricLabel: 'Eficiencia Defensiva (DefRtg)',
        baselineAvg: round1(baseDef),
        windowAvg: round1(winDef),
        absDelta: round1(defDelta),
        pctDelta: round1(defPct),
        zScore: round1(defZ),
        sampleGames: effWinSize,
        baselineGames: games.length,
        sustainabilityLabel:
          defDelta < 0 ? 'Mejora defensiva sólida' : 'Sangría de puntos/100 pos',
        sustainabilityTone: defDelta < 0 ? 'solid' : 'negative',
        contextNote: takeaways[0] || '',
        takeaways,
      });
    }

    // D) Real Pace (possessions per 48m) shift
    const paceSeries = games.map((g) => g.pace);
    const basePace = mean(paceSeries);
    const sdPace = Math.max(stdDev(paceSeries), 3.0);
    const winPace = mean(winGames.map((g) => g.pace));
    const paceDelta = winPace - basePace;
    const paceZ = paceDelta / sdPace;
    const pacePct = (paceDelta / Math.max(90, basePace)) * 100;

    if (
      Math.abs(paceDelta) >= Math.max(2.8, minPctDelta * 0.18) &&
      Math.abs(paceZ) >= minZScore * 0.72
    ) {
      signals.push({
        id: `team-${team.id}-pace`,
        entityType: 'team',
        entityId: team.id,
        entityName: team.name,
        subtitle,
        teamAbbr: team.abbreviation,
        category: 'team_shift',
        categoryLabel: paceDelta > 0 ? 'Subida de Ritmo (Pace)' : 'Freno de Ritmo (Pace)',
        metricKey: 'pace',
        metricLabel: 'Ritmo Posesiones (Pace)',
        baselineAvg: round1(basePace),
        windowAvg: round1(winPace),
        absDelta: round1(paceDelta),
        pctDelta: round1(pacePct),
        zScore: round1(paceZ),
        sampleGames: effWinSize,
        baselineGames: games.length,
        sustainabilityLabel:
          paceDelta > 0 ? 'Más posesiones por noche' : 'Baloncesto de media pista',
        sustainabilityTone: 'warning',
        contextNote: takeaways[0] || '',
        takeaways,
      });
    }
  }

  return signals.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

export function detectActiveStreaks(
  players: PlayerSummary[],
  teams: TeamSummary[],
  minStreakGames: number
): StreakEntry[] {
  const streaks: StreakEntry[] = [];

  for (const player of players) {
    const games = player.games;
    if (games.length < minStreakGames) continue;

    const checks: Array<{
      id: string;
      metricLabel: string;
      thresholdLabel: string;
      isPositive: boolean;
      test: (g: PlayerGameLog) => boolean;
      extract: (g: PlayerGameLog) => number;
    }> = [
      {
        id: 'pts30',
        metricLabel: 'Puntos',
        thresholdLabel: '30+ PTS seguidos',
        isPositive: true,
        test: (g) => g.points >= 30,
        extract: (g) => g.points,
      },
      {
        id: 'pts25',
        metricLabel: 'Puntos',
        thresholdLabel: '25+ PTS seguidos',
        isPositive: true,
        test: (g) => g.points >= 25,
        extract: (g) => g.points,
      },
      {
        id: 'pts20',
        metricLabel: 'Puntos',
        thresholdLabel: '20+ PTS seguidos',
        isPositive: true,
        test: (g) => g.points >= 20,
        extract: (g) => g.points,
      },
      {
        id: 'reb10',
        metricLabel: 'Rebotes',
        thresholdLabel: '10+ REB seguidos',
        isPositive: true,
        test: (g) => g.rebounds >= 10,
        extract: (g) => g.rebounds,
      },
      {
        id: 'ast8',
        metricLabel: 'Asistencias',
        thresholdLabel: '8+ AST seguidas',
        isPositive: true,
        test: (g) => g.assists >= 8,
        extract: (g) => g.assists,
      },
      {
        id: '3pm3',
        metricLabel: 'Triples',
        thresholdLabel: '3+ Triples anotados',
        isPositive: true,
        test: (g) => g.fg3m >= 3,
        extract: (g) => g.fg3m,
      },
      {
        id: 'gmsc22',
        metricLabel: 'Game Score',
        thresholdLabel: '22+ GmSc impacto élite',
        isPositive: true,
        test: (g) => g.gameScore >= 22,
        extract: (g) => g.gameScore,
      },
      {
        id: 'cold_ts',
        metricLabel: 'Tiro Verdadero',
        thresholdLabel: 'Menos de 46% TS (≥12 TCI)',
        isPositive: false,
        test: (g) => g.fga >= 12 && g.tsPct < 46,
        extract: (g) => g.tsPct,
      },
    ];

    let capturedPtsStreak = false;
    for (const c of checks) {
      if (c.id.startsWith('pts') && capturedPtsStreak) continue;
      let count = 0;
      for (let i = 0; i < games.length; i++) {
        if (c.test(games[i])) count++;
        else break;
      }
      if (count >= minStreakGames) {
        if (c.id.startsWith('pts')) capturedPtsStreak = true;
        const streakSlice = games.slice(0, count);
        streaks.push({
          id: `streak-p-${player.id}-${c.id}`,
          entityType: 'player',
          entityId: player.id,
          entityName: player.name,
          subtitle: `${player.teamAbbr} · ${player.position}`,
          teamAbbr: player.teamAbbr,
          streakLabel: `${count} PJ consecutivos`,
          metricLabel: c.metricLabel,
          thresholdLabel: c.thresholdLabel,
          count,
          windowAvgDuringStreak: round1(mean(streakSlice.map(c.extract))),
          seasonBaseline: round1(mean(games.map(c.extract))),
          isPositive: c.isPositive,
          lastGameDate: games[0]?.date || '',
        });
      }
    }
  }

  for (const team of teams) {
    const games = team.games;
    if (games.length < minStreakGames) continue;

    const firstRes = games[0].result;
    let resCount = 0;
    for (let i = 0; i < games.length; i++) {
      if (games[i].result === firstRes) resCount++;
      else break;
    }
    if (resCount >= minStreakGames) {
      const slice = games.slice(0, resCount);
      streaks.push({
        id: `streak-t-${team.id}-wl`,
        entityType: 'team',
        entityId: team.id,
        entityName: team.name,
        subtitle: `Conf. ${team.conference} · ${team.wins}-${team.losses}`,
        teamAbbr: team.abbreviation,
        streakLabel: `${resCount} ${firstRes === 'W' ? 'Victorias' : 'Derrotas'}`,
        metricLabel: 'Net Rating',
        thresholdLabel:
          firstRes === 'W' ? 'Victorias consecutivas' : 'Derrotas consecutivas',
        count: resCount,
        windowAvgDuringStreak: round1(mean(slice.map((g) => g.netRtg))),
        seasonBaseline: round1(mean(games.map((g) => g.netRtg))),
        isPositive: firstRes === 'W',
        lastGameDate: games[0]?.date || '',
      });
    }
  }

  return streaks.sort((a, b) => b.count - a.count);
}

export function computeConsistencyTable(
  players: PlayerSummary[],
  minMinutes: number
): ConsistencyEntry[] {
  const rows: ConsistencyEntry[] = [];

  for (const p of players) {
    const games = p.games;
    if (games.length < 3) continue;
    const minAvg = mean(games.map((g) => g.minutes));
    if (minAvg < minMinutes) continue;

    const ptsArr = games.map((g) => g.points);
    const praArr = games.map((g) => g.pra);
    const gmScAvg = mean(games.map((g) => g.gameScore));

    const ptsAvg = mean(ptsArr);
    const ptsSd = stdDev(ptsArr);
    const praAvg = mean(praArr);
    const praSd = stdDev(praArr);

    const cvPra = praSd / Math.max(10, praAvg);
    const rawScore = Math.round(100 - (cvPra - 0.12) * 210);
    const consistencyScore = Math.max(18, Math.min(98, rawScore));

    let profileLabel = 'Estable';
    if (consistencyScore >= 78) profileLabel = 'Reloj suizo';
    else if (consistencyScore >= 62) profileLabel = 'Estable';
    else if (consistencyScore >= 46) profileLabel = 'Variable';
    else profileLabel = 'Todo o nada';

    const threshold85 = ptsAvg * 0.85;
    const hits = games.filter((g) => g.points >= threshold85).length;
    const hitRate20Pts = Math.round((hits / games.length) * 100);

    rows.push({
      entityId: p.id,
      entityName: p.name,
      teamAbbr: p.teamAbbr,
      position: p.position,
      gamesPlayed: games.length,
      minutesAvg: round1(minAvg),
      ptsAvg: round1(ptsAvg),
      ptsStdDev: round1(ptsSd),
      ptsFloor: round1(Math.max(0, ptsAvg - ptsSd)),
      ptsCeiling: round1(ptsAvg + ptsSd),
      praAvg: round1(praAvg),
      praStdDev: round1(praSd),
      praFloor: round1(Math.max(0, praAvg - praSd)),
      praCeiling: round1(praAvg + praSd),
      gmScAvg: round1(gmScAvg),
      consistencyScore,
      profileLabel,
      hitRate20Pts,
    });
  }

  return rows.sort((a, b) => b.consistencyScore - a.consistencyScore);
}

export function sliceGamesByRange<
  T extends { date: string; isHome: boolean; isBackToBack: boolean }
>(games: T[], sel: RangeSelection): T[] {
  switch (sel.preset) {
    case 'last_3':
      return games.slice(0, 3);
    case 'last_5':
      return games.slice(0, 5);
    case 'last_10':
      return games.slice(0, 10);
    case 'prev_5':
      return games.slice(5, 10);
    case 'prev_10':
      return games.slice(10, 20);
    case 'home_only':
      return games.filter((g) => g.isHome);
    case 'away_only':
      return games.filter((g) => !g.isHome);
    case 'b2b_only':
      return games.filter((g) => g.isBackToBack);
    case 'rested_only':
      return games.filter((g) => !g.isBackToBack);
    case 'custom_dates': {
      return games.filter((g) => {
        const day = g.date.slice(0, 10);
        if (sel.startDate && day < sel.startDate) return false;
        if (sel.endDate && day > sel.endDate) return false;
        return true;
      });
    }
    case 'season_all':
    default:
      return games;
  }
}

export function comparePlayerSlices(
  sliceA: PlayerGameLog[],
  sliceB: PlayerGameLog[]
): { rows: ComparisonMetricRow[]; insights: string[] } {
  const calc = (arr: PlayerGameLog[]) => {
    if (arr.length === 0) {
      return {
        pts: 0,
        min: 0,
        reb: 0,
        oreb: 0,
        ast: 0,
        stocks: 0,
        tov: 0,
        plusMinus: 0,
        fga: 0,
        fgPct: 0,
        fg3m: 0,
        fg3Pct: 0,
        fta: 0,
        usgEst: 0,
        tsPct: 0,
        efgPct: 0,
        gameScore: 0,
        astTo: 0,
        pra: 0,
      };
    }
    const fgm = arr.reduce((s, g) => s + g.fgm, 0);
    const fga = arr.reduce((s, g) => s + g.fga, 0);
    const fg3m = arr.reduce((s, g) => s + g.fg3m, 0);
    const fg3a = arr.reduce((s, g) => s + g.fg3a, 0);
    const fta = arr.reduce((s, g) => s + g.fta, 0);
    const ptsTot = arr.reduce((s, g) => s + g.points, 0);
    const astTot = arr.reduce((s, g) => s + g.assists, 0);
    const tovTot = arr.reduce((s, g) => s + g.turnovers, 0);
    const tsDenom = 2 * (fga + 0.44 * fta);

    return {
      pts: mean(arr.map((g) => g.points)),
      min: mean(arr.map((g) => g.minutes)),
      reb: mean(arr.map((g) => g.rebounds)),
      oreb: mean(arr.map((g) => g.oreb)),
      ast: mean(arr.map((g) => g.assists)),
      stocks: mean(arr.map((g) => g.stocks)),
      tov: mean(arr.map((g) => g.turnovers)),
      plusMinus: mean(arr.map((g) => g.plusMinus)),
      fga: mean(arr.map((g) => g.fga)),
      fgPct: fga > 0 ? (fgm / fga) * 100 : 0,
      fg3m: mean(arr.map((g) => g.fg3m)),
      fg3Pct: fg3a > 0 ? (fg3m / fg3a) * 100 : 0,
      fta: mean(arr.map((g) => g.fta)),
      usgEst: mean(arr.map((g) => g.usgEst)),
      tsPct: tsDenom > 0 ? (ptsTot / tsDenom) * 100 : 0,
      efgPct: fga > 0 ? ((fgm + 0.5 * fg3m) / fga) * 100 : 0,
      gameScore: mean(arr.map((g) => g.gameScore)),
      astTo: tovTot > 0 ? astTot / tovTot : astTot,
      pra: mean(arr.map((g) => g.pra)),
    };
  };

  const a = calc(sliceA);
  const b = calc(sliceB);

  const defs: Array<{
    key: keyof typeof a;
    label: string;
    unit: string;
    group: 'basic' | 'advanced';
    inverseGood?: boolean;
  }> = [
    // Basic
    { key: 'pts', label: 'Puntos por partido', unit: 'PTS', group: 'basic' },
    { key: 'min', label: 'Minutos en pista', unit: 'MIN', group: 'basic' },
    { key: 'reb', label: 'Rebotes totales', unit: 'REB', group: 'basic' },
    { key: 'oreb', label: 'Rebotes ofensivos', unit: 'OR', group: 'basic' },
    { key: 'ast', label: 'Asistencias', unit: 'AST', group: 'basic' },
    { key: 'stocks', label: 'Robos + Tapones (Stocks)', unit: 'STK', group: 'basic' },
    { key: 'fga', label: 'Tiros de campo intentados', unit: 'TCI', group: 'basic' },
    { key: 'fgPct', label: 'Acierto en tiros de campo', unit: '%', group: 'basic' },
    { key: 'fg3m', label: 'Triples anotados', unit: '3PM', group: 'basic' },
    { key: 'fg3Pct', label: 'Porcentaje en triples', unit: '%', group: 'basic' },
    { key: 'fta', label: 'Tiros libres intentados', unit: 'TLI', group: 'basic' },
    {
      key: 'tov',
      label: 'Pérdidas de balón',
      unit: 'PER',
      group: 'basic',
      inverseGood: true,
    },
    // Advanced
    { key: 'usgEst', label: 'Uso ofensivo estimado (USG%)', unit: '%', group: 'advanced' },
    { key: 'tsPct', label: 'Tiro Verdadero (TS%)', unit: '%', group: 'advanced' },
    { key: 'efgPct', label: 'Tiro de Campo Efectivo (eFG%)', unit: '%', group: 'advanced' },
    { key: 'gameScore', label: 'Valoración Game Score (GmSc)', unit: 'GmSc', group: 'advanced' },
    { key: 'plusMinus', label: 'Impacto Más/Menos en pista', unit: '+/-', group: 'advanced' },
    { key: 'astTo', label: 'Ratio Asistencias / Pérdida', unit: 'A/P', group: 'advanced' },
    { key: 'pra', label: 'Producción combinada (PRA)', unit: 'PRA', group: 'advanced' },
  ];

  const rows: ComparisonMetricRow[] = defs.map((d) => {
    const valA = round1(a[d.key]);
    const valB = round1(b[d.key]);
    const absDiff = round1(valA - valB);
    const denom =
      d.key === 'plusMinus' ? Math.max(6, Math.abs(b[d.key]) + 4) : Math.abs(b[d.key]);
    const pctDiff = round1(denom > 0 ? ((a[d.key] - b[d.key]) / denom) * 100 : 0);
    return {
      key: d.key,
      label: d.label,
      unit: d.unit,
      group: d.group,
      rangeAValue: valA,
      rangeBValue: valB,
      absDiff,
      pctDiff,
      inverseGood: d.inverseGood,
    };
  });

  const insights: string[] = [];
  if (sliceA.length > 0 && sliceB.length > 0) {
    const ptsDiff = a.pts - b.pts;
    const usgDiff = a.usgEst - b.usgEst;
    const tsDiff = a.tsPct - b.tsPct;
    const minDiff = a.min - b.min;

    if (Math.abs(ptsDiff) >= 2.0) {
      insights.push(
        `Variación anotadora de ${formatSigned(ptsDiff)} PTS en Tramo A (${a.pts.toFixed(
          1
        )} vs ${b.pts.toFixed(1)} en Tramo B).`
      );
    }
    if (Math.abs(usgDiff) >= 2.2 || Math.abs(minDiff) >= 2.5) {
      insights.push(
        `Cambio en cuota de protagonismo: ${formatSigned(
          usgDiff,
          1,
          ' pp'
        )} en Uso USG% (${a.usgEst.toFixed(1)}% vs ${b.usgEst.toFixed(
          1
        )}%) y ${formatSigned(minDiff)} MIN.`
      );
    }
    if (Math.abs(tsDiff) >= 4.0) {
      insights.push(
        `Eficiencia real de tiro (TS%): pasa de ${b.tsPct.toFixed(
          1
        )}% en Tramo B a ${a.tsPct.toFixed(1)}% en Tramo A (${formatSigned(
          tsDiff,
          1,
          ' pp'
        )}).`
      );
    }
    if (insights.length === 0) {
      insights.push(
        'Volumen de uso (USG%) y eficiencia verdadera (TS%) muy homogéneos entre ambos tramos.'
      );
    }
  }

  return { rows, insights };
}

export function compareTeamSlices(
  sliceA: TeamGameLog[],
  sliceB: TeamGameLog[]
): { rows: ComparisonMetricRow[]; insights: string[] } {
  const calc = (arr: TeamGameLog[]) => {
    if (arr.length === 0) {
      return {
        winPct: 0,
        pf: 0,
        pa: 0,
        diff: 0,
        fg3m: 0,
        oreb: 0,
        reb: 0,
        ast: 0,
        offRtg: 0,
        defRtg: 0,
        netRtg: 0,
        pace: 0,
        efgPct: 0,
        tsPct: 0,
        orebPct: 0,
        tovPct: 0,
      };
    }
    const wins = arr.filter((g) => g.result === 'W').length;
    return {
      winPct: (wins / arr.length) * 100,
      pf: mean(arr.map((g) => g.pointsFor)),
      pa: mean(arr.map((g) => g.pointsAgainst)),
      diff: mean(arr.map((g) => g.differential)),
      fg3m: mean(arr.map((g) => g.fg3m)),
      oreb: mean(arr.map((g) => g.oreb)),
      reb: mean(arr.map((g) => g.reb)),
      ast: mean(arr.map((g) => g.ast)),
      offRtg: mean(arr.map((g) => g.offRtg)),
      defRtg: mean(arr.map((g) => g.defRtg)),
      netRtg: mean(arr.map((g) => g.netRtg)),
      pace: mean(arr.map((g) => g.pace)),
      efgPct: mean(arr.map((g) => g.efgPct)),
      tsPct: mean(arr.map((g) => g.tsPct)),
      orebPct: mean(arr.map((g) => g.orebPct)),
      tovPct: mean(arr.map((g) => g.tovPct)),
    };
  };

  const a = calc(sliceA);
  const b = calc(sliceB);

  const defs: Array<{
    key: keyof typeof a;
    label: string;
    unit: string;
    group: 'basic' | 'advanced';
    inverseGood?: boolean;
  }> = [
    // Basic
    { key: 'winPct', label: 'Porcentaje de victorias', unit: '%', group: 'basic' },
    { key: 'pf', label: 'Puntos anotados (Ataque)', unit: 'PTS', group: 'basic' },
    {
      key: 'pa',
      label: 'Puntos encajados (Defensa)',
      unit: 'PTS',
      group: 'basic',
      inverseGood: true,
    },
    { key: 'diff', label: 'Diferencial bruto de marcador', unit: 'DIF', group: 'basic' },
    { key: 'fg3m', label: 'Triples anotados por partido', unit: '3PM', group: 'basic' },
    { key: 'oreb', label: 'Rebotes ofensivos por partido', unit: 'OR', group: 'basic' },
    { key: 'ast', label: 'Asistencias por partido', unit: 'AST', group: 'basic' },
    // Advanced & Four Factors
    {
      key: 'offRtg',
      label: 'Eficiencia Ofensiva (OffRtg / 100 pos)',
      unit: 'ORTG',
      group: 'advanced',
    },
    {
      key: 'defRtg',
      label: 'Eficiencia Defensiva (DefRtg / 100 pos)',
      unit: 'DRTG',
      group: 'advanced',
      inverseGood: true,
    },
    {
      key: 'netRtg',
      label: 'Net Rating (Diferencial / 100 pos)',
      unit: 'NRTG',
      group: 'advanced',
    },
    {
      key: 'pace',
      label: 'Ritmo real (Pace · posesiones / 48m)',
      unit: 'POS',
      group: 'advanced',
    },
    {
      key: 'efgPct',
      label: '4 Factores: Tiro Efectivo (eFG%)',
      unit: '%',
      group: 'advanced',
    },
    {
      key: 'tsPct',
      label: 'Tiro Verdadero colectivo (TS%)',
      unit: '%',
      group: 'advanced',
    },
    {
      key: 'orebPct',
      label: '4 Factores: % Rebote Ofensivo (OREB%)',
      unit: '%',
      group: 'advanced',
    },
    {
      key: 'tovPct',
      label: '4 Factores: % Pérdidas por posesión (TOV%)',
      unit: '%',
      group: 'advanced',
      inverseGood: true,
    },
  ];

  const rows: ComparisonMetricRow[] = defs.map((d) => {
    const valA = round1(a[d.key]);
    const valB = round1(b[d.key]);
    const absDiff = round1(valA - valB);
    const denom =
      d.key === 'diff' || d.key === 'netRtg'
        ? Math.max(8, Math.abs(b[d.key]) + 5)
        : Math.abs(b[d.key]);
    const pctDiff = round1(denom > 0 ? ((a[d.key] - b[d.key]) / denom) * 100 : 0);
    return {
      key: d.key,
      label: d.label,
      unit: d.unit,
      group: d.group,
      rangeAValue: valA,
      rangeBValue: valB,
      absDiff,
      pctDiff,
      inverseGood: d.inverseGood,
    };
  });

  const insights: string[] = [];
  if (sliceA.length > 0 && sliceB.length > 0) {
    const netChange = a.netRtg - b.netRtg;
    const offChange = a.offRtg - b.offRtg;
    const defChange = a.defRtg - b.defRtg;
    const paceChange = a.pace - b.pace;

    if (Math.abs(netChange) >= 2.5) {
      insights.push(
        `El Net Rating varía en ${formatSigned(
          netChange
        )} pts/100 pos (${formatSigned(a.netRtg)} en Tramo A frente a ${formatSigned(
          b.netRtg
        )} en Tramo B).`
      );
    }
    if (Math.abs(offChange) >= Math.abs(defChange) && Math.abs(offChange) >= 2.5) {
      insights.push(
        `Impulsado por la eficiencia ofensiva: ${formatSigned(
          offChange
        )} en OffRtg (${a.efgPct.toFixed(1)}% eFG en Tramo A).`
      );
    } else if (Math.abs(defChange) >= 2.5) {
      insights.push(
        `Impulsado por la defensa: ${formatSigned(
          defChange
        )} en DefRtg (encaja ${a.defRtg.toFixed(1)} pts/100 pos en Tramo A).`
      );
    }
    if (Math.abs(paceChange) >= 2.0) {
      insights.push(
        `Cambio de velocidad: juega a ${a.pace.toFixed(
          1
        )} posesiones/48m (${formatSigned(paceChange)} respecto a Tramo B).`
      );
    }
    if (insights.length === 0) {
      insights.push(
        'Ratings por 100 posesiones y Cuatro Factores muy estables entre ambos periodos.'
      );
    }
  }

  return { rows, insights };
}
