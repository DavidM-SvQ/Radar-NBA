import type {
  CbaSeasonThresholds,
  CbaTeamTier,
  FutureDraftPickItem,
  PlayerContractRecord,
  TeamCapSheet,
  TeamFutureDraftInventory,
} from '../types/nba';
import { formatSalaryCompact, formatSalaryShort, formatSignedSalaryShort } from './contractsClient';

export interface TradeIncomingItem {
  player: PlayerContractRecord;
  fromTeamIdx: number;
  fromAbbr: string;
  effectiveIncomingSalary: number;
  kickerBonus: number;
}

export interface TradeIncomingPickItem {
  pick: FutureDraftPickItem;
  fromTeamIdx: number;
  fromAbbr: string;
}

export interface TradeTeamEvaluation {
  teamIdx: number;
  teamAbbr: string;
  teamName: string;
  teamSheet: TeamCapSheet | null;
  outgoingPlayers: PlayerContractRecord[];
  incomingItems: TradeIncomingItem[];
  outgoingPicks: FutureDraftPickItem[];
  incomingPicks: TradeIncomingPickItem[];
  netFirstRoundDelta: number;
  netSecondRoundDelta: number;
  totalOutgoingSalary: number;
  totalIncomingSalary: number;
  totalEffectiveIncomingSalary: number;
  maxAllowedIncomingSalary: number;
  salaryDelta: number;
  prePayroll: number;
  postPayroll: number;
  preTier: CbaTeamTier;
  postTier: CbaTeamTier;
  preTaxBill: number;
  postTaxBill: number;
  taxBillDelta: number;
  payrollDelta2728: number;
  rosterDelta: number;
  postStandardRosterCount: number;
  isCbaValid: boolean;
  appliedRuleEs: string;
  violationsEs: string[];
  warningsEs: string[];
  // Sporting deltas
  ptsDelta: number;
  rebDelta: number;
  astDelta: number;
  minDelta: number;
  impactDelta: number;
}

export interface MultiTeamTradeEvaluation {
  teamCount: number;
  strictMode: boolean;
  hasAnyPlayers: boolean;
  isOverallValid: boolean;
  totalPlayersMoved: number;
  totalPicksMoved: number;
  totalSalaryMoved: number;
  totalViolations: number;
  teamResults: TradeTeamEvaluation[];
  editorialVerdictEs: string;
}

export interface DidacticTradePreset {
  id: string;
  label: string;
  description: string;
  teamCount: 2 | 3 | 4;
  strictMode: boolean;
  teams: [string, string, string, string];
  outgoingByIdx: Record<number, string[]>;
  destinations: Record<string, number>;
}

export function classifyPayrollCbaTier(
  payroll: number,
  th: CbaSeasonThresholds
): CbaTeamTier {
  if (payroll >= th.secondApron) return 'second_apron';
  if (payroll >= th.firstApron) return 'first_apron';
  if (payroll >= th.luxuryTax) return 'luxury_tax';
  if (payroll >= th.salaryCap) return 'over_cap';
  if (payroll >= th.salaryFloor) return 'under_cap';
  return 'under_floor';
}

/**
 * Progressive NBA CBA 2023 Luxury Tax estimator (indexed ~$5.7M brackets for 2026-27).
 * Uses standard non-repeater schedule as baseline reference.
 */
export function estimateLuxuryTaxBill(
  payroll: number,
  th: CbaSeasonThresholds
): number {
  const excess = payroll - th.luxuryTax;
  if (excess <= 0) return 0;

  const bracketSize = 5_700_000;
  const rates = [1.5, 1.75, 2.5, 3.25, 3.75, 4.25, 4.75, 5.25];
  let remaining = excess;
  let totalTax = 0;
  let idx = 0;

  while (remaining > 0) {
    const chunk = Math.min(remaining, bracketSize);
    const rate = idx < rates.length ? rates[idx] : rates[rates.length - 1] + (idx - rates.length + 1) * 0.5;
    totalTax += chunk * rate;
    remaining -= chunk;
    idx += 1;
  }

  return Math.round(totalTax);
}

function getEffectiveIncomingSalary(player: PlayerContractRecord): {
  effective: number;
  kickerBonus: number;
} {
  const base = player.incomingTradeValue || player.salary || 0;
  if (player.tradeKickerPct > 0 && base > 0) {
    const bonus = Math.round(base * (player.tradeKickerPct / 100));
    return { effective: base + bonus, kickerBonus: bonus };
  }
  return { effective: base, kickerBonus: 0 };
}

function getSeasonSalary(
  player: PlayerContractRecord,
  season: '2026-27' | '2027-28' | '2028-29' | '2029-30'
): number {
  const slot = player.yearlySalaries?.find((y) => y.season === season);
  if (slot && typeof slot.salary === 'number' && Number.isFinite(slot.salary)) {
    return slot.salary;
  }
  return season === '2026-27' ? player.salary || 0 : 0;
}

/**
 * Evaluates a 2-, 3-, or 4-team NBA trade against CBA 2023 (2026-27 season) rules:
 * - Cap Space absorption (postPayroll <= salaryCap)
 * - Standard Over-Cap / Tax matching tiers (200% + $250K / +$8.5M cushion / 125% + $250K)
 * - Minimum Salary Exception (minimum contracts exempt from matching)
 * - 1st Apron strict 100% matching + Hard Wall (cannot cross 1st Apron by taking back more salary)
 * - 2nd Apron strict 100% matching + Anti-Aggregation rule (cannot combine 2+ outgoing salaries for 1 larger incoming contract)
 * - Trade Kicker adjustment, Two-Way contract warning, Trade Restriction notice, and 14-15 standard roster advisory
 */
export function evaluateMultiTeamTrade(params: {
  teamCount: 2 | 3 | 4;
  strictMode: boolean;
  tradeTeams: [string, string, string, string];
  outgoingPlayerIds: Record<number, Set<string>>;
  playerDestinations: Record<string, number>;
  outgoingPickIds?: Record<number, Set<string>>;
  pickDestinations?: Record<string, number>;
  futurePicksTeams?: TeamFutureDraftInventory[];
  teamsList: TeamCapSheet[];
  thresholds: CbaSeasonThresholds;
}): MultiTeamTradeEvaluation {
  const {
    teamCount,
    strictMode,
    tradeTeams,
    outgoingPlayerIds,
    playerDestinations,
    outgoingPickIds = {},
    pickDestinations = {},
    futurePicksTeams = [],
    teamsList,
    thresholds,
  } = params;

  const byAbbr = new Map<string, TeamCapSheet>();
  for (const t of teamsList) {
    byAbbr.set(t.teamAbbr.toUpperCase(), t);
  }

  const picksInventoryByAbbr = new Map<string, TeamFutureDraftInventory>();
  for (const inv of futurePicksTeams) {
    picksInventoryByAbbr.set(inv.teamAbbr.toUpperCase(), inv);
  }

  // First pass: resolve outgoing players and picks per active team slot
  const outgoingByTeam: Record<number, PlayerContractRecord[]> = {};
  const outgoingPicksByTeam: Record<number, FutureDraftPickItem[]> = {};
  for (let i = 0; i < teamCount; i++) {
    const abbr = tradeTeams[i];
    const sheet = byAbbr.get(abbr?.toUpperCase() || '') || null;
    const selectedIds = outgoingPlayerIds[i] || new Set<string>();
    outgoingByTeam[i] = sheet
      ? sheet.players.filter((p) => selectedIds.has(p.id))
      : [];

    const inv = picksInventoryByAbbr.get(abbr?.toUpperCase() || '') || null;
    const selectedPicks = outgoingPickIds[i] || new Set<string>();
    outgoingPicksByTeam[i] = inv
      ? inv.picks.filter((pk) => pk.isControlled && selectedPicks.has(pk.id))
      : [];
  }

  // Second pass: resolve incoming players and picks per active team slot
  const incomingByTeam: Record<number, TradeIncomingItem[]> = {};
  const incomingPicksByTeam: Record<number, TradeIncomingPickItem[]> = {};
  for (let i = 0; i < teamCount; i++) {
    incomingByTeam[i] = [];
    incomingPicksByTeam[i] = [];
  }

  for (let srcIdx = 0; srcIdx < teamCount; srcIdx++) {
    const srcAbbr = tradeTeams[srcIdx];
    const outList = outgoingByTeam[srcIdx] || [];
    for (const player of outList) {
      let destIdx: number;
      if (teamCount === 2) {
        destIdx = srcIdx === 0 ? 1 : 0;
      } else {
        const assigned = playerDestinations[player.id];
        if (
          typeof assigned === 'number' &&
          assigned >= 0 &&
          assigned < teamCount &&
          assigned !== srcIdx
        ) {
          destIdx = assigned;
        } else {
          destIdx = (srcIdx + 1) % teamCount;
        }
      }
      const { effective, kickerBonus } = getEffectiveIncomingSalary(player);
      incomingByTeam[destIdx].push({
        player,
        fromTeamIdx: srcIdx,
        fromAbbr: srcAbbr,
        effectiveIncomingSalary: effective,
        kickerBonus,
      });
    }

    const outPickList = outgoingPicksByTeam[srcIdx] || [];
    for (const pick of outPickList) {
      let destIdx: number;
      if (teamCount === 2) {
        destIdx = srcIdx === 0 ? 1 : 0;
      } else {
        const assigned = pickDestinations[pick.id];
        if (
          typeof assigned === 'number' &&
          assigned >= 0 &&
          assigned < teamCount &&
          assigned !== srcIdx
        ) {
          destIdx = assigned;
        } else {
          destIdx = (srcIdx + 1) % teamCount;
        }
      }
      incomingPicksByTeam[destIdx].push({
        pick,
        fromTeamIdx: srcIdx,
        fromAbbr: srcAbbr,
      });
    }
  }

  const teamResults: TradeTeamEvaluation[] = [];
  let totalPlayersMoved = 0;
  let totalPicksMoved = 0;
  let totalSalaryMoved = 0;
  let totalViolations = 0;

  for (let teamIdx = 0; teamIdx < teamCount; teamIdx++) {
    const abbr = tradeTeams[teamIdx];
    const sheet = byAbbr.get(abbr?.toUpperCase() || '') || null;
    const inv = picksInventoryByAbbr.get(abbr?.toUpperCase() || '') || null;
    const outgoingPlayers = outgoingByTeam[teamIdx] || [];
    const incomingItems = incomingByTeam[teamIdx] || [];
    const outgoingPicks = outgoingPicksByTeam[teamIdx] || [];
    const incomingPicks = incomingPicksByTeam[teamIdx] || [];

    totalPlayersMoved += outgoingPlayers.length;
    totalPicksMoved += outgoingPicks.length;

    const netFirstRoundDelta =
      incomingPicks.filter((ip) => ip.pick.round === 1).length -
      outgoingPicks.filter((op) => op.round === 1).length;
    const netSecondRoundDelta =
      incomingPicks.filter((ip) => ip.pick.round === 2).length -
      outgoingPicks.filter((op) => op.round === 2).length;

    const totalOutgoingSalary = outgoingPlayers.reduce(
      (sum, p) => sum + (p.outgoingTradeValue || p.salary || 0),
      0
    );
    const totalIncomingSalary = incomingItems.reduce(
      (sum, item) => sum + (item.player.salary || 0),
      0
    );
    const totalEffectiveIncomingSalary = incomingItems.reduce(
      (sum, item) => sum + item.effectiveIncomingSalary,
      0
    );

    totalSalaryMoved += totalOutgoingSalary;

    // Exclude Minimum Salary Exception players from matching requirement (standard CBA rule)
    const nonMinIncomingSalary = incomingItems.reduce((sum, item) => {
      const isMinExempt =
        item.player.minimumSalaryException ||
        item.player.isTwoWay ||
        item.effectiveIncomingSalary <= thresholds.veteranMinimum;
      return isMinExempt ? sum : sum + item.effectiveIncomingSalary;
    }, 0);

    const prePayroll = sheet?.activePayroll || 0;
    const salaryDelta = totalEffectiveIncomingSalary - totalOutgoingSalary;
    const postPayroll = Math.max(0, prePayroll + salaryDelta);
    const preTier = sheet?.cbaTier || classifyPayrollCbaTier(prePayroll, thresholds);
    const postTier = classifyPayrollCbaTier(postPayroll, thresholds);

    const preTaxBill = estimateLuxuryTaxBill(prePayroll, thresholds);
    const postTaxBill = estimateLuxuryTaxBill(postPayroll, thresholds);
    const taxBillDelta = postTaxBill - preTaxBill;

    const out2728 = outgoingPlayers.reduce((s, p) => s + getSeasonSalary(p, '2027-28'), 0);
    const in2728 = incomingItems.reduce((s, i) => s + getSeasonSalary(i.player, '2027-28'), 0);
    const payrollDelta2728 = in2728 - out2728;

    const outStdCount = outgoingPlayers.filter((p) => !p.isTwoWay).length;
    const inStdCount = incomingItems.filter((i) => !i.player.isTwoWay).length;
    const rosterDelta = inStdCount - outStdCount;
    const postStandardRosterCount = (sheet?.standardContractsCount || 0) + rosterDelta;

    // Sporting deltas
    const ptsDelta =
      incomingItems.reduce((s, i) => s + i.player.pointsPg, 0) -
      outgoingPlayers.reduce((s, p) => s + p.pointsPg, 0);
    const rebDelta =
      incomingItems.reduce((s, i) => s + i.player.reboundsPg, 0) -
      outgoingPlayers.reduce((s, p) => s + p.reboundsPg, 0);
    const astDelta =
      incomingItems.reduce((s, i) => s + i.player.assistsPg, 0) -
      outgoingPlayers.reduce((s, p) => s + p.assistsPg, 0);
    const minDelta =
      incomingItems.reduce((s, i) => s + i.player.minutesPg, 0) -
      outgoingPlayers.reduce((s, p) => s + p.minutesPg, 0);
    const impactDelta =
      incomingItems.reduce((s, i) => s + i.player.sportingImpactScore, 0) -
      outgoingPlayers.reduce((s, p) => s + p.sportingImpactScore, 0);

    // CBA Validation Rules
    const violationsEs: string[] = [];
    const warningsEs: string[] = [];
    let appliedRuleEs = 'Sin jugadores seleccionados para esta franquicia.';
    let maxAllowedIncomingSalary = totalOutgoingSalary;

    const hasSalaryActivity = outgoingPlayers.length > 0 || incomingItems.length > 0;
    const hasPickActivity = outgoingPicks.length > 0 || incomingPicks.length > 0;
    const hasActivity = hasSalaryActivity || hasPickActivity;

    if (hasPickActivity && !hasSalaryActivity) {
      appliedRuleEs =
        'Intercambio exclusivo de rondas del Draft ($0 de salario computable en CBA; sujeto a Regla Ted Stepien).';
    }

    if (hasSalaryActivity && sheet) {
      // 1) Check Two-Way contracts included
      const twoWayOut = outgoingPlayers.filter((p) => p.isTwoWay);
      const twoWayIn = incomingItems.filter((i) => i.player.isTwoWay);
      if (twoWayOut.length > 0 || twoWayIn.length > 0) {
        warningsEs.push(
          'Incluye contratos Two-Way: no cuentan para el emparejamiento salarial oficial y rara vez se traspasan directamente.'
        );
      }

      // 2) Check trade restrictions & trade kickers
      const restrictedPlayers = [
        ...outgoingPlayers.filter((p) => p.tradeRestriction),
        ...incomingItems.filter((i) => i.player.tradeRestriction).map((i) => i.player),
      ];
      if (restrictedPlayers.length > 0) {
        const names = restrictedPlayers.map((p) => p.name).join(', ');
        warningsEs.push(
          `Cláusula o restricción temporal de traspaso activa en: ${names} (requiere consentimiento o ventana abierta).`
        );
      }

      const kickerItems = incomingItems.filter((i) => i.kickerBonus > 0);
      if (kickerItems.length > 0) {
        const summaryKicker = kickerItems
          .map((k) => `${k.player.name} (+${formatSalaryCompact(k.kickerBonus)})`)
          .join(', ');
        warningsEs.push(
          `Trade Kicker aplicado al salario entrante: ${summaryKicker}.`
        );
      }

      // 3) Standard roster bounds advisory
      if (postStandardRosterCount > 15) {
        warningsEs.push(
          `La plantilla estándar subiría a ${postStandardRosterCount} contratos (máximo NBA: 15); obligaría a cortar a ${postStandardRosterCount - 15} jugador(es).`
        );
      } else if (postStandardRosterCount < 12 && sheet.standardContractsCount >= 12) {
        warningsEs.push(
          `La plantilla estándar bajaría a ${postStandardRosterCount} jugadores (mínimo NBA: 14); habría que completar huecos con mínimos.`
        );
      }

      // 4) Determine exact CBA salary matching ceiling
      if (postPayroll <= thresholds.salaryCap) {
        // Absorbing via Cap Space
        const capRoomBeforeTrade = Math.max(0, thresholds.salaryCap - prePayroll);
        maxAllowedIncomingSalary = totalOutgoingSalary + capRoomBeforeTrade;
        appliedRuleEs = `Absorción con Cap Space: la nómina resultante (${formatSalaryShort(postPayroll)}) queda bajo el Salary Cap (${formatSalaryShort(thresholds.salaryCap)}).`;
      } else if (preTier === 'second_apron' || postTier === 'second_apron') {
        // Second Apron strict wall
        const startsBelowSecond = preTier !== 'second_apron';
        const roomToSecondApron = Math.max(0, thresholds.secondApron - prePayroll);
        maxAllowedIncomingSalary = startsBelowSecond
          ? Math.max(totalOutgoingSalary, totalOutgoingSalary + roomToSecondApron)
          : totalOutgoingSalary;

        if (preTier === 'second_apron') {
          appliedRuleEs =
            'Regla del 2º Apron: emparejamiento 100% estricto (entrante ≤ saliente) y prohibición de agregar contratos.';

          if (nonMinIncomingSalary > totalOutgoingSalary) {
            const excess = nonMinIncomingSalary - totalOutgoingSalary;
            violationsEs.push(
              `Excede el límite del 2º Apron por ${formatSalaryShort(excess)}: no puede recibir más salario (${formatSalaryShort(nonMinIncomingSalary)}) del que envía (${formatSalaryShort(totalOutgoingSalary)}).`
            );
          }

          // Anti-aggregation rule: cannot combine 2+ outgoing salaries to acquire 1 incoming player paid more than every individual outgoing player
          if (outgoingPlayers.length >= 2 && incomingItems.length >= 1) {
            const maxSingleOutgoing = Math.max(
              ...outgoingPlayers.map((p) => p.outgoingTradeValue || p.salary || 0)
            );
            const violatingIncoming = incomingItems.find(
              (item) =>
                !item.player.minimumSalaryException &&
                item.effectiveIncomingSalary > thresholds.veteranMinimum &&
                item.effectiveIncomingSalary > maxSingleOutgoing
            );
            if (violatingIncoming) {
              violationsEs.push(
                `Prohibición de agregación (2º Apron): no puede sumar ${outgoingPlayers.length} salarios para absorber a ${violatingIncoming.player.name} (${formatSalaryShort(violatingIncoming.effectiveIncomingSalary)}), cuyo salario supera al mayor contrato individual saliente (${formatSalaryShort(maxSingleOutgoing)}).`
              );
            }
          }
        } else {
          // Crossed into 2nd Apron via trade
          appliedRuleEs =
            'Cruce al 2º Apron: el traspaso dispara la nómina sobre el 2º Apron; aplica emparejamiento 100% estricto.';
          if (nonMinIncomingSalary > totalOutgoingSalary) {
            const excess = nonMinIncomingSalary - totalOutgoingSalary;
            violationsEs.push(
              `Al cruzar el 2º Apron (${formatSalaryShort(thresholds.secondApron)}), el CBA prohíbe recibir más salario del enviado (exceso de ${formatSalaryShort(excess)}).`
            );
          }
        }
      } else if (preTier === 'first_apron' || postTier === 'first_apron') {
        // First Apron 100% matching wall
        maxAllowedIncomingSalary = totalOutgoingSalary;
        if (preTier === 'first_apron') {
          appliedRuleEs =
            'Regla del 1er Apron: emparejamiento 100% estricto (entrante ≤ saliente); sin uso de TPE previas.';
          if (nonMinIncomingSalary > totalOutgoingSalary) {
            const excess = nonMinIncomingSalary - totalOutgoingSalary;
            violationsEs.push(
              `Equipo sobre el 1er Apron: incumple la regla del 100% por ${formatSalaryShort(excess)} (recibe ${formatSalaryShort(nonMinIncomingSalary)} enviando ${formatSalaryShort(totalOutgoingSalary)}).`
            );
          }
        } else {
          // Started under 1st Apron, taking more salary crosses 1st Apron
          const allowedBeforeWall = Math.max(
            totalOutgoingSalary,
            thresholds.firstApron - (prePayroll - totalOutgoingSalary)
          );
          maxAllowedIncomingSalary = allowedBeforeWall;
          appliedRuleEs =
            'Muro del 1er Apron: un equipo por debajo del 1er Apron no puede superarlo absorbiendo más salario del que envía.';
          if (nonMinIncomingSalary > allowedBeforeWall) {
            const excess = nonMinIncomingSalary - allowedBeforeWall;
            violationsEs.push(
              `Este traspaso empuja la nómina sobre el 1er Apron (${formatSalaryShort(thresholds.firstApron)}) recibiendo más salario del saliente. Sobran ${formatSalaryShort(excess)}.`
            );
          }
        }
      } else {
        // Over Cap or Luxury Tax (staying below 1st Apron): Standard CBA 2023 Simultaneous Trade Exception
        let bracketLimit = 0;
        let bracketLabel = '';
        if (totalOutgoingSalary <= 0) {
          bracketLimit = 0;
          bracketLabel = 'Sin salario saliente (solo absorbe mínimos o Cap Space)';
        } else if (totalOutgoingSalary <= 7_500_000) {
          bracketLimit = Math.round(totalOutgoingSalary * 2 + 250_000);
          bracketLabel = 'Tramo bajo CBA (200% + $250K)';
        } else if (totalOutgoingSalary <= 33_000_000) {
          bracketLimit = totalOutgoingSalary + 8_500_000;
          bracketLabel = 'Tramo medio CBA (+$8.5M de margen)';
        } else {
          bracketLimit = Math.round(totalOutgoingSalary * 1.25 + 250_000);
          bracketLabel = 'Tramo alto CBA (125% + $250K)';
        }

        // Also cannot cross 1st Apron if taking extra money
        const capBeforeFirstApron = Math.max(
          totalOutgoingSalary,
          thresholds.firstApron - (prePayroll - totalOutgoingSalary)
        );
        maxAllowedIncomingSalary = Math.min(bracketLimit, capBeforeFirstApron);
        appliedRuleEs = `${bracketLabel}: permite recibir hasta ${formatSalaryShort(maxAllowedIncomingSalary)} (sin cruzar el 1er Apron).`;

        if (nonMinIncomingSalary > maxAllowedIncomingSalary) {
          const excess = nonMinIncomingSalary - maxAllowedIncomingSalary;
          violationsEs.push(
            `Supera el tope de emparejamiento salarial en ${formatSalaryShort(excess)} (recibe ${formatSalaryShort(nonMinIncomingSalary)} frente al máximo legal de ${formatSalaryShort(maxAllowedIncomingSalary)}).`
          );
        }
      }
    }

    // 5) NBA Ted Stepien Rule & 2nd Apron Frozen Pick check for outgoing future 1st-round picks
    if (outgoingPicks.length > 0 && inv) {
      const postFirstsByYear: Record<number, number> = { ...inv.firstsByYear };
      const touchedYears = new Set<number>();

      for (const op of outgoingPicks) {
        if (op.round === 1 && op.category !== 'swap_favorable') {
          postFirstsByYear[op.year] = Math.max(0, (postFirstsByYear[op.year] || 0) - 1);
          touchedYears.add(op.year);
        }
        if (preTier === 'second_apron' && op.round === 1 && op.year >= 2033 && op.category === 'own') {
          warningsEs.push(
            `Regla del 2º Apron (pick congelado): la propia 1ª ronda de ${op.year} de ${abbr} está sujeta a congelación CBA mientras permanezca sobre el 2º Apron.`
          );
        }
      }

      for (const ip of incomingPicks) {
        if (ip.pick.round === 1 && ip.pick.category !== 'swap_favorable') {
          postFirstsByYear[ip.pick.year] = (postFirstsByYear[ip.pick.year] || 0) + 1;
        }
      }

      const stepienPairs: string[] = [];
      const yearsSorted = [2027, 2028, 2029, 2030, 2031, 2032, 2033];
      for (let idx = 0; idx < yearsSorted.length - 1; idx++) {
        const y1 = yearsSorted[idx];
        const y2 = yearsSorted[idx + 1];
        if (!touchedYears.has(y1) && !touchedYears.has(y2)) continue;
        if ((postFirstsByYear[y1] || 0) <= 0 && (postFirstsByYear[y2] || 0) <= 0) {
          stepienPairs.push(`${y1} y ${y2}`);
        }
      }
      if (stepienPairs.length > 0) {
        violationsEs.push(
          `Incumple la Regla Ted Stepien: ${abbr} quedaría sin elecciones de 1ª ronda en Drafts consecutivos (${stepienPairs.join(', ')}).`
        );
      }
    }

    const isCbaValid = strictMode ? violationsEs.length === 0 : true;
    if (strictMode) {
      totalViolations += violationsEs.length;
    }

    teamResults.push({
      teamIdx,
      teamAbbr: abbr,
      teamName: sheet?.teamName || abbr,
      teamSheet: sheet,
      outgoingPlayers,
      incomingItems,
      outgoingPicks,
      incomingPicks,
      netFirstRoundDelta,
      netSecondRoundDelta,
      totalOutgoingSalary,
      totalIncomingSalary,
      totalEffectiveIncomingSalary,
      maxAllowedIncomingSalary,
      salaryDelta,
      prePayroll,
      postPayroll,
      preTier,
      postTier,
      preTaxBill,
      postTaxBill,
      taxBillDelta,
      payrollDelta2728,
      rosterDelta,
      postStandardRosterCount,
      isCbaValid,
      appliedRuleEs,
      violationsEs,
      warningsEs,
      ptsDelta,
      rebDelta,
      astDelta,
      minDelta,
      impactDelta,
    });
  }

  const hasAnyPlayers = totalPlayersMoved > 0 || totalPicksMoved > 0;
  const isOverallValid = hasAnyPlayers
    ? strictMode
      ? totalViolations === 0
      : true
    : true;

  // Build concise editorial verdict
  let editorialVerdictEs =
    'Selecciona jugadores o rondas del Draft (2027–2033) en al menos dos franquicias para validar el encaje CBA y medir el impacto deportivo.';
  if (hasAnyPlayers) {
    const teamAbbrs = teamResults.map((r) => r.teamAbbr).join(' ↔ ');
    const biggestPtsGainer = [...teamResults].sort((a, b) => b.ptsDelta - a.ptsDelta)[0];
    const biggestSaver = [...teamResults].sort((a, b) => a.salaryDelta - b.salaryDelta)[0];
    const picksSuffix =
      totalPicksMoved > 0
        ? ` y ${totalPicksMoved} ronda${totalPicksMoved > 1 ? 's' : ''} del Draft`
        : '';

    if (!strictMode) {
      editorialVerdictEs = `Simulación Sandbox (${teamAbbrs}): ${totalPlayersMoved} jugadores${picksSuffix} y ${formatSalaryCompact(totalSalaryMoved)} en movimiento. ${biggestPtsGainer.teamAbbr} gana ${biggestPtsGainer.ptsDelta >= 0 ? '+' : ''}${biggestPtsGainer.ptsDelta.toFixed(1)} PTS/P y ${biggestSaver.teamAbbr} ajusta su nómina en ${formatSignedSalaryShort(biggestSaver.salaryDelta)}.`;
    } else if (isOverallValid) {
      const saverText =
        biggestSaver.salaryDelta < -500_000
          ? ` con ahorro de ${formatSalaryCompact(Math.abs(biggestSaver.salaryDelta))} para ${biggestSaver.teamAbbr}`
          : '';
      editorialVerdictEs = `Traspaso VÁLIDO bajo el CBA 2026–27 (${teamAbbrs}): mueve ${totalPlayersMoved} contratos${picksSuffix} (${formatSalaryCompact(totalSalaryMoved)})${saverText}; mayor impulso anotador para ${biggestPtsGainer.teamAbbr} (${biggestPtsGainer.ptsDelta >= 0 ? '+' : ''}${biggestPtsGainer.ptsDelta.toFixed(1)} PTS/P).`;
    } else {
      const offending = teamResults
        .filter((r) => !r.isCbaValid)
        .map((r) => r.teamAbbr)
        .join(', ');
      editorialVerdictEs = `Traspaso INVÁLIDO en modo estricto CBA (${totalViolations} infracción${totalViolations > 1 ? 'es' : ''} en ${offending}): revisa los márgenes salariales, Aprons y la Regla Ted Stepien.`;
    }
  }

  return {
    teamCount,
    strictMode,
    hasAnyPlayers,
    isOverallValid,
    totalPlayersMoved,
    totalPicksMoved,
    totalSalaryMoved,
    totalViolations,
    teamResults,
    editorialVerdictEs,
  };
}

/**
 * Generates 3 real-data didactic trade presets using the loaded 2026-27 NBA rosters
 * so users can immediately test valid matching, 2nd Apron aggregation blocks, and 3-team swaps.
 */
export function buildDidacticTradePresets(
  teamsList: TeamCapSheet[]
): DidacticTradePreset[] {
  if (!teamsList || teamsList.length < 3) return [];

  const presets: DidacticTradePreset[] = [];

  const byAbbr = new Map(teamsList.map((t) => [t.teamAbbr, t]));
  const pickPlayerInRange = (
    team: TeamCapSheet | undefined,
    minSal: number,
    maxSal: number,
    excludeIds = new Set<string>()
  ) =>
    team?.players.find(
      (p) =>
        !p.isTwoWay &&
        !excludeIds.has(p.id) &&
        p.salary >= minSal &&
        p.salary <= maxSal
    );

  // Preset 1: Valid balanced 2-team trade
  const teamA =
    byAbbr.get('LAL') ||
    teamsList.find((t) => t.cbaTier === 'over_cap' || t.cbaTier === 'luxury_tax') ||
    teamsList[0];
  const teamB =
    byAbbr.get('MIA') ||
    teamsList.find((t) => t.teamAbbr !== teamA.teamAbbr && t.cbaTier !== 'second_apron') ||
    teamsList[1];

  const pA =
    pickPlayerInRange(teamA, 8_000_000, 22_000_000) ||
    teamA.players.find((p) => !p.isTwoWay && p.salary >= 4_000_000);
  const pB =
    pA
      ? teamB.players.find(
          (p) =>
            !p.isTwoWay &&
            Math.abs(p.salary - pA.salary) <= 4_500_000 &&
            p.salary >= 4_000_000
        ) || pickPlayerInRange(teamB, 8_000_000, 22_000_000)
      : undefined;

  if (teamA && teamB && pA && pB) {
    presets.push({
      id: 'valid_balanced',
      label: `Encaje legal (${teamA.teamAbbr} ↔ ${teamB.teamAbbr})`,
      description: 'Dos contratos de rotación que cuadran bajo los tramos estándar CBA.',
      teamCount: 2,
      strictMode: true,
      teams: [teamA.teamAbbr, teamB.teamAbbr, 'GSW', 'DEN'],
      outgoingByIdx: {
        0: [pA.id],
        1: [pB.id],
      },
      destinations: {},
    });
  }

  // Preset 2: Second Apron anti-aggregation demonstration
  const secondApronTeam =
    teamsList.find((t) => t.cbaTier === 'second_apron') ||
    [...teamsList].sort((a, b) => b.activePayroll - a.activePayroll)[0];
  const partnerTeam =
    teamsList.find(
      (t) =>
        t.teamAbbr !== secondApronTeam.teamAbbr &&
        t.players.some((p) => !p.isTwoWay && p.salary >= 25_000_000 && p.salary <= 45_000_000)
    ) || teamsList.find((t) => t.teamAbbr !== secondApronTeam.teamAbbr);

  if (secondApronTeam && partnerTeam) {
    const midPlayers = secondApronTeam.players
      .filter((p) => !p.isTwoWay && p.salary >= 5_000_000 && p.salary <= 22_000_000)
      .slice(0, 2);
    if (midPlayers.length === 2) {
      const combined = midPlayers[0].salary + midPlayers[1].salary;
      const maxSingle = Math.max(midPlayers[0].salary, midPlayers[1].salary);
      const starTarget =
        partnerTeam.players.find(
          (p) => !p.isTwoWay && p.salary > maxSingle + 1_000_000 && p.salary <= combined + 2_000_000
        ) ||
        partnerTeam.players.find((p) => !p.isTwoWay && p.salary > maxSingle);

      if (starTarget) {
        presets.push({
          id: 'second_apron_block',
          label: `Bloqueo 2º Apron (${secondApronTeam.teamAbbr})`,
          description: 'Demuestra la prohibición de agregar 2 contratos en el 2º Apron.',
          teamCount: 2,
          strictMode: true,
          teams: [secondApronTeam.teamAbbr, partnerTeam.teamAbbr, 'BOS', 'DAL'],
          outgoingByIdx: {
            0: [midPlayers[0].id, midPlayers[1].id],
            1: [starTarget.id],
          },
          destinations: {},
        });
      }
    }
  }

  // Preset 3: 3-Team Circular Swap
  const t0 = byAbbr.get('BOS') || teamsList[0];
  const t1 = byAbbr.get('GSW') || teamsList.find((t) => t.teamAbbr !== t0.teamAbbr) || teamsList[1];
  const t2 =
    byAbbr.get('OKC') ||
    teamsList.find((t) => t.teamAbbr !== t0.teamAbbr && t.teamAbbr !== t1.teamAbbr) ||
    teamsList[2];

  const c0 = pickPlayerInRange(t0, 6_000_000, 20_000_000) || t0.players[2];
  const c1 = pickPlayerInRange(t1, 6_000_000, 20_000_000) || t1.players[2];
  const c2 = pickPlayerInRange(t2, 6_000_000, 20_000_000) || t2.players[2];

  if (t0 && t1 && t2 && c0 && c1 && c2) {
    presets.push({
      id: 'three_team_ring',
      label: `Traspaso a 3 bandas (${t0.teamAbbr}/${t1.teamAbbr}/${t2.teamAbbr})`,
      description: 'Intercambio triangular con destinos configurables por jugador.',
      teamCount: 3,
      strictMode: true,
      teams: [t0.teamAbbr, t1.teamAbbr, t2.teamAbbr, 'NYK'],
      outgoingByIdx: {
        0: [c0.id],
        1: [c1.id],
        2: [c2.id],
      },
      destinations: {
        [c0.id]: 1,
        [c1.id]: 2,
        [c2.id]: 0,
      },
    });
  }

  return presets;
}
