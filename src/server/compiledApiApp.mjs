// Pre-compiled RadarNBA Express API bundle for Vercel Serverless
if (!process.env.VERCEL) process.env.VERCEL = "1";
if (!process.env.NBA_SNAPSHOT_ONLY) process.env.NBA_SNAPSHOT_ONLY = "1";

// src/server/apiApp.ts
import "dotenv/config";
import express from "express";
import helmet from "helmet";

// src/server/nbaDataService.ts
import crypto from "crypto";
import fs3 from "fs";
import path3 from "path";

// src/utils/playerInspectorAnalytics.ts
function r1(v) {
  return Math.round((Number(v) || 0) * 10) / 10;
}
function r2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}
function avgNums(arr) {
  if (arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}
function sdNums(arr) {
  if (arr.length < 2) return 0;
  const m = avgNums(arr);
  let sq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    sq += d * d;
  }
  return Math.sqrt(sq / arr.length);
}
function sumBy(games, fn) {
  let s = 0;
  for (let i = 0; i < games.length; i++) s += fn(games[i]);
  return s;
}
function formatMetricNumber(val, decimals = 1, suffix = "", signed = false) {
  const num = Number.isFinite(val) ? val : 0;
  if (signed) {
    const absFixed = Math.abs(num).toFixed(decimals);
    const threshold = decimals === 0 ? 0.4 : decimals === 2 ? 5e-3 : 0.04;
    if (num > threshold) return `+${absFixed}${suffix}`;
    if (num < -threshold) return `-${absFixed}${suffix}`;
    return `${0 .toFixed(decimals)}${suffix}`;
  }
  return `${num.toFixed(decimals)}${suffix}`;
}
function seasonCycleDay(dateIso) {
  const clean = (dateIso || "").slice(0, 10);
  const parts = clean.split("-");
  if (parts.length < 3) return 9999;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (Number.isNaN(month) || Number.isNaN(day)) return 9999;
  const shiftedMonth = month >= 9 ? month : month + 12;
  return shiftedMonth * 100 + day;
}
var PLAYER_PER_GAME_METRICS = [
  // --- 15 ESTADÍSTICAS BÁSICAS (Mostradas de serie en Nivel Comparado) ---
  {
    key: "minutes",
    label: "Minutos jugados",
    shortLabel: "MIN",
    helpKey: "minBase",
    family: "basic",
    decimals: 1,
    suffix: "",
    isDefaultBasicKpi: true,
    fallbackMean: 25.4,
    fallbackSd: 6.1,
    gameValue: (g) => g.minutes,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.minutes)))
  },
  {
    key: "points",
    label: "Puntos por partido",
    shortLabel: "PTS",
    helpKey: "ptsBase",
    family: "basic",
    decimals: 1,
    suffix: "",
    isDefaultBasicKpi: true,
    fallbackMean: 13.8,
    fallbackSd: 6.2,
    gameValue: (g) => g.points,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.points)))
  },
  {
    key: "rebounds",
    label: "Rebotes totales",
    shortLabel: "REB",
    helpKey: "rebBase",
    family: "basic",
    decimals: 1,
    suffix: "",
    isDefaultBasicKpi: true,
    fallbackMean: 4.9,
    fallbackSd: 2.4,
    gameValue: (g) => g.rebounds,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.rebounds)))
  },
  {
    key: "oreb",
    label: "Rebotes ofensivos",
    shortLabel: "OREB",
    helpKey: "orebBase",
    family: "basic",
    decimals: 1,
    suffix: "",
    isDefaultBasicKpi: true,
    fallbackMean: 1.2,
    fallbackSd: 0.9,
    gameValue: (g) => g.oreb,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.oreb)))
  },
  {
    key: "dreb",
    label: "Rebotes defensivos",
    shortLabel: "DREB",
    helpKey: "drebBase",
    family: "basic",
    decimals: 1,
    suffix: "",
    isDefaultBasicKpi: true,
    fallbackMean: 3.7,
    fallbackSd: 1.8,
    gameValue: (g) => g.dreb,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.dreb)))
  },
  {
    key: "assists",
    label: "Asistencias",
    shortLabel: "AST",
    helpKey: "astBase",
    family: "basic",
    decimals: 1,
    suffix: "",
    isDefaultBasicKpi: true,
    fallbackMean: 3.2,
    fallbackSd: 2.1,
    gameValue: (g) => g.assists,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.assists)))
  },
  {
    key: "steals",
    label: "Robos de bal\xF3n",
    shortLabel: "ROB",
    helpKey: "steals",
    family: "basic",
    decimals: 1,
    suffix: "",
    isDefaultBasicKpi: true,
    fallbackMean: 0.9,
    fallbackSd: 0.4,
    gameValue: (g) => g.steals,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.steals)))
  },
  {
    key: "blocks",
    label: "Tapones",
    shortLabel: "TAP",
    helpKey: "blocks",
    family: "basic",
    decimals: 1,
    suffix: "",
    isDefaultBasicKpi: true,
    fallbackMean: 0.6,
    fallbackSd: 0.5,
    gameValue: (g) => g.blocks,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.blocks)))
  },
  {
    key: "turnovers",
    label: "P\xE9rdidas de bal\xF3n",
    shortLabel: "PER",
    helpKey: "tov",
    family: "basic",
    decimals: 1,
    suffix: "",
    lowerIsBetter: true,
    isDefaultBasicKpi: true,
    fallbackMean: 1.6,
    fallbackSd: 0.8,
    gameValue: (g) => g.turnovers,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.turnovers)))
  },
  {
    key: "fouls",
    label: "Faltas personales",
    shortLabel: "FP",
    helpKey: "personalFouls",
    family: "basic",
    decimals: 1,
    suffix: "",
    lowerIsBetter: true,
    isDefaultBasicKpi: true,
    fallbackMean: 2.1,
    fallbackSd: 0.6,
    gameValue: (g) => g.fouls,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fouls)))
  },
  {
    key: "fgPct",
    label: "% Tiros de campo",
    shortLabel: "TC%",
    helpKey: "fgPct",
    family: "basic",
    decimals: 1,
    suffix: "%",
    isDefaultBasicKpi: true,
    fallbackMean: 47.2,
    fallbackSd: 5.8,
    gameValue: (g) => r1(g.fgPct),
    sliceValue: (gs) => {
      const m = sumBy(gs, (g) => g.fgm);
      const a = sumBy(gs, (g) => g.fga);
      return a > 0 ? r1(m / a * 100) : 0;
    }
  },
  {
    key: "fg3m",
    label: "Triples anotados",
    shortLabel: "3PM",
    helpKey: "fg3m",
    family: "basic",
    decimals: 1,
    suffix: "",
    isDefaultBasicKpi: true,
    fallbackMean: 1.7,
    fallbackSd: 1,
    gameValue: (g) => g.fg3m,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fg3m)))
  },
  {
    key: "fg3Pct",
    label: "% Triples",
    shortLabel: "3P%",
    helpKey: "fg3Pct",
    family: "basic",
    decimals: 1,
    suffix: "%",
    isDefaultBasicKpi: true,
    fallbackMean: 36.4,
    fallbackSd: 6.5,
    gameValue: (g) => r1(g.fg3Pct),
    sliceValue: (gs) => {
      const m = sumBy(gs, (g) => g.fg3m);
      const a = sumBy(gs, (g) => g.fg3a);
      return a > 0 ? r1(m / a * 100) : 0;
    }
  },
  {
    key: "ftPct",
    label: "% Tiros libres",
    shortLabel: "TL%",
    helpKey: "ftPct",
    family: "basic",
    decimals: 1,
    suffix: "%",
    isDefaultBasicKpi: true,
    fallbackMean: 78.2,
    fallbackSd: 8.8,
    gameValue: (g) => r1(g.ftPct),
    sliceValue: (gs) => {
      const m = sumBy(gs, (g) => g.ftm);
      const a = sumBy(gs, (g) => g.fta);
      return a > 0 ? r1(m / a * 100) : 0;
    }
  },
  {
    key: "plusMinus",
    label: "Impacto M\xE1s / Menos",
    shortLabel: "+/-",
    helpKey: "plusMinusBase",
    family: "basic",
    decimals: 1,
    suffix: "",
    signed: true,
    isDefaultBasicKpi: true,
    fallbackMean: 0,
    fallbackSd: 4.2,
    gameValue: (g) => g.plusMinus,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.plusMinus)))
  },
  // --- 8 MÉTRICAS DE VOLUMEN Y DESGLOSE DE TIRO ---
  {
    key: "fgm",
    label: "Tiros de campo anotados",
    shortLabel: "TCA",
    helpKey: "fgmMade",
    family: "shooting",
    decimals: 1,
    suffix: "",
    fallbackMean: 5.1,
    fallbackSd: 2.3,
    gameValue: (g) => g.fgm,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fgm)))
  },
  {
    key: "fga",
    label: "Tiros de campo intentados",
    shortLabel: "TCI",
    helpKey: "fga",
    family: "shooting",
    decimals: 1,
    suffix: "",
    fallbackMean: 10.8,
    fallbackSd: 4.8,
    gameValue: (g) => g.fga,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fga)))
  },
  {
    key: "fg2m",
    label: "Tiros de 2 anotados",
    shortLabel: "T2A",
    helpKey: "fg2m",
    family: "shooting",
    decimals: 1,
    suffix: "",
    fallbackMean: 3.4,
    fallbackSd: 2,
    gameValue: (g) => Math.max(0, g.fgm - g.fg3m),
    sliceValue: (gs) => r1(avgNums(gs.map((g) => Math.max(0, g.fgm - g.fg3m))))
  },
  {
    key: "fg2a",
    label: "Tiros de 2 intentados",
    shortLabel: "T2I",
    helpKey: "fg2a",
    family: "shooting",
    decimals: 1,
    suffix: "",
    fallbackMean: 6.2,
    fallbackSd: 3.5,
    gameValue: (g) => Math.max(0, g.fga - g.fg3a),
    sliceValue: (gs) => r1(avgNums(gs.map((g) => Math.max(0, g.fga - g.fg3a))))
  },
  {
    key: "fg2Pct",
    label: "% Tiros de 2",
    shortLabel: "T2%",
    helpKey: "fg2Pct",
    family: "shooting",
    decimals: 1,
    suffix: "%",
    fallbackMean: 54.5,
    fallbackSd: 6.8,
    gameValue: (g) => {
      const m2 = Math.max(0, g.fgm - g.fg3m);
      const a2 = Math.max(0, g.fga - g.fg3a);
      return a2 > 0 ? r1(m2 / a2 * 100) : 0;
    },
    sliceValue: (gs) => {
      const m2 = sumBy(gs, (g) => Math.max(0, g.fgm - g.fg3m));
      const a2 = sumBy(gs, (g) => Math.max(0, g.fga - g.fg3a));
      return a2 > 0 ? r1(m2 / a2 * 100) : 0;
    }
  },
  {
    key: "fg3a",
    label: "Triples intentados",
    shortLabel: "3PI",
    helpKey: "fg3a",
    family: "shooting",
    decimals: 1,
    suffix: "",
    fallbackMean: 4.6,
    fallbackSd: 2.5,
    gameValue: (g) => g.fg3a,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fg3a)))
  },
  {
    key: "ftm",
    label: "Tiros libres anotados",
    shortLabel: "TLA",
    helpKey: "ftmMade",
    family: "shooting",
    decimals: 1,
    suffix: "",
    fallbackMean: 2,
    fallbackSd: 1.6,
    gameValue: (g) => g.ftm,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.ftm)))
  },
  {
    key: "fta",
    label: "Tiros libres intentados",
    shortLabel: "TLI",
    helpKey: "fta",
    family: "shooting",
    decimals: 1,
    suffix: "",
    fallbackMean: 2.6,
    fallbackSd: 1.9,
    gameValue: (g) => g.fta,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.fta)))
  },
  // --- 17 RATIOS, EFICIENCIA Y PROYECCIONES (Todos los ratios por partido) ---
  {
    key: "tsPct",
    label: "Acierto Real (TS%)",
    shortLabel: "TS%",
    helpKey: "tsPct",
    family: "ratios",
    decimals: 1,
    suffix: "%",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 58,
    fallbackSd: 4.8,
    gameValue: (g) => r1(g.tsPct),
    sliceValue: (gs) => {
      const pts = sumBy(gs, (g) => g.points);
      const fga = sumBy(gs, (g) => g.fga);
      const fta = sumBy(gs, (g) => g.fta);
      const denom = 2 * (fga + 0.44 * fta);
      return denom > 0 ? r1(pts / denom * 100) : 0;
    }
  },
  {
    key: "efgPct",
    label: "Tiro Efectivo (eFG%)",
    shortLabel: "eFG%",
    helpKey: "efgPct",
    family: "ratios",
    decimals: 1,
    suffix: "%",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 54.4,
    fallbackSd: 5.2,
    gameValue: (g) => r1(g.efgPct),
    sliceValue: (gs) => {
      const fgm = sumBy(gs, (g) => g.fgm);
      const fg3m = sumBy(gs, (g) => g.fg3m);
      const fga = sumBy(gs, (g) => g.fga);
      return fga > 0 ? r1((fgm + 0.5 * fg3m) / fga * 100) : 0;
    }
  },
  {
    key: "usgEst",
    label: "Uso Ofensivo (USG%)",
    shortLabel: "USG%",
    helpKey: "usgPct",
    family: "ratios",
    decimals: 1,
    suffix: "%",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 19.6,
    fallbackSd: 5.4,
    gameValue: (g) => r1(g.usgEst),
    sliceValue: (gs) => {
      const totMin = sumBy(gs, (g) => g.minutes);
      if (totMin > 0) {
        const w = sumBy(gs, (g) => g.usgEst * g.minutes);
        return r1(w / totMin);
      }
      return r1(avgNums(gs.map((g) => g.usgEst)));
    }
  },
  {
    key: "gameScore",
    label: "Valoraci\xF3n (GmSc)",
    shortLabel: "GmSc",
    helpKey: "gmSc",
    family: "ratios",
    decimals: 1,
    suffix: "",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 10.6,
    fallbackSd: 4.9,
    gameValue: (g) => r1(g.gameScore),
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.gameScore)))
  },
  {
    key: "pra",
    label: "Producci\xF3n PRA",
    shortLabel: "PRA",
    helpKey: "pra",
    family: "ratios",
    decimals: 1,
    suffix: "",
    fallbackMean: 21.9,
    fallbackSd: 9.2,
    gameValue: (g) => g.pra,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.pra)))
  },
  {
    key: "stocks",
    label: "Robos + Tapones (STK)",
    shortLabel: "STK",
    helpKey: "stocksBase",
    family: "ratios",
    decimals: 1,
    suffix: "",
    fallbackMean: 1.4,
    fallbackSd: 0.6,
    gameValue: (g) => g.stocks,
    sliceValue: (gs) => r1(avgNums(gs.map((g) => g.stocks)))
  },
  {
    key: "astTo",
    label: "Ratio Asist./P\xE9rdidas",
    shortLabel: "AST/PER",
    helpKey: "astTo",
    family: "ratios",
    decimals: 2,
    suffix: "",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 2.05,
    fallbackSd: 0.85,
    gameValue: (g) => r2(g.turnovers > 0 ? g.assists / g.turnovers : g.assists),
    sliceValue: (gs) => {
      const ast = sumBy(gs, (g) => g.assists);
      const tov = sumBy(gs, (g) => g.turnovers);
      if (ast === 0 && tov === 0) return 0;
      return r2(tov > 0 ? ast / tov : ast);
    }
  },
  {
    key: "threePar",
    label: "Ratio de Triples (3PAr)",
    shortLabel: "3PAr",
    helpKey: "threeRatio",
    family: "ratios",
    decimals: 1,
    suffix: "%",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 42,
    fallbackSd: 18,
    gameValue: (g) => g.fga > 0 ? r1(g.fg3a / g.fga * 100) : 0,
    sliceValue: (gs) => {
      const fg3a = sumBy(gs, (g) => g.fg3a);
      const fga = sumBy(gs, (g) => g.fga);
      return fga > 0 ? r1(fg3a / fga * 100) : 0;
    }
  },
  {
    key: "ftr",
    label: "Ratio Tiros Libres (FTr)",
    shortLabel: "FTr",
    helpKey: "ftr",
    family: "ratios",
    decimals: 1,
    suffix: "%",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 24.5,
    fallbackSd: 11.5,
    gameValue: (g) => g.fga > 0 ? r1(g.fta / g.fga * 100) : 0,
    sliceValue: (gs) => {
      const fta = sumBy(gs, (g) => g.fta);
      const fga = sumBy(gs, (g) => g.fga);
      return fga > 0 ? r1(fta / fga * 100) : 0;
    }
  },
  {
    key: "tovRatioEst",
    label: "Ratio P\xE9rdidas (TOV%)",
    shortLabel: "TOV%",
    helpKey: "tovRatioEst",
    family: "ratios",
    decimals: 1,
    suffix: "%",
    lowerIsBetter: true,
    isAdvancedRadiographyRatio: true,
    fallbackMean: 11.8,
    fallbackSd: 3.6,
    gameValue: (g) => {
      const plays = g.fga + 0.44 * g.fta + g.turnovers;
      return plays > 0 ? r1(g.turnovers / plays * 100) : 0;
    },
    sliceValue: (gs) => {
      const tov = sumBy(gs, (g) => g.turnovers);
      const fga = sumBy(gs, (g) => g.fga);
      const fta = sumBy(gs, (g) => g.fta);
      const plays = fga + 0.44 * fta + tov;
      return plays > 0 ? r1(tov / plays * 100) : 0;
    }
  },
  {
    key: "ptsPerShot",
    label: "Puntos por Tiro (PTS/TCI)",
    shortLabel: "PTS/TCI",
    helpKey: "ptsPerShot",
    family: "ratios",
    decimals: 2,
    suffix: "",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 1.25,
    fallbackSd: 0.14,
    gameValue: (g) => g.fga > 0 ? r2(g.points / g.fga) : 0,
    sliceValue: (gs) => {
      const pts = sumBy(gs, (g) => g.points);
      const fga = sumBy(gs, (g) => g.fga);
      return fga > 0 ? r2(pts / fga) : 0;
    }
  },
  {
    key: "ptsPerMin",
    label: "Puntos por Minuto",
    shortLabel: "PTS/MIN",
    helpKey: "ptsPerMin",
    family: "ratios",
    decimals: 2,
    suffix: "",
    fallbackMean: 0.52,
    fallbackSd: 0.16,
    gameValue: (g) => g.minutes > 0 ? r2(g.points / g.minutes) : 0,
    sliceValue: (gs) => {
      const pts = sumBy(gs, (g) => g.points);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r2(pts / min) : 0;
    }
  },
  {
    key: "ptsPer36",
    label: "Puntos por 36 min",
    shortLabel: "PTS/36",
    helpKey: "ptsPer36",
    family: "ratios",
    decimals: 1,
    suffix: "",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 18.8,
    fallbackSd: 5.6,
    gameValue: (g) => g.minutes > 0 ? r1(g.points / g.minutes * 36) : 0,
    sliceValue: (gs) => {
      const pts = sumBy(gs, (g) => g.points);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r1(pts / min * 36) : 0;
    }
  },
  {
    key: "rebPer36",
    label: "Rebotes por 36 min",
    shortLabel: "REB/36",
    helpKey: "rebPer36",
    family: "ratios",
    decimals: 1,
    suffix: "",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 6.9,
    fallbackSd: 3.1,
    gameValue: (g) => g.minutes > 0 ? r1(g.rebounds / g.minutes * 36) : 0,
    sliceValue: (gs) => {
      const reb = sumBy(gs, (g) => g.rebounds);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r1(reb / min * 36) : 0;
    }
  },
  {
    key: "astPer36",
    label: "Asistencias por 36 min",
    shortLabel: "AST/36",
    helpKey: "astPer36",
    family: "ratios",
    decimals: 1,
    suffix: "",
    isAdvancedRadiographyRatio: true,
    fallbackMean: 4.5,
    fallbackSd: 2.5,
    gameValue: (g) => g.minutes > 0 ? r1(g.assists / g.minutes * 36) : 0,
    sliceValue: (gs) => {
      const ast = sumBy(gs, (g) => g.assists);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r1(ast / min * 36) : 0;
    }
  },
  {
    key: "praPer36",
    label: "PRA por 36 min",
    shortLabel: "PRA/36",
    helpKey: "praPer36",
    family: "ratios",
    decimals: 1,
    suffix: "",
    fallbackMean: 30.2,
    fallbackSd: 7.4,
    gameValue: (g) => g.minutes > 0 ? r1(g.pra / g.minutes * 36) : 0,
    sliceValue: (gs) => {
      const pra = sumBy(gs, (g) => g.pra);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r1(pra / min * 36) : 0;
    }
  },
  {
    key: "stocksPer36",
    label: "Robos+Tapones / 36m",
    shortLabel: "STK/36",
    helpKey: "stocksPer36",
    family: "ratios",
    decimals: 1,
    suffix: "",
    fallbackMean: 2,
    fallbackSd: 0.85,
    gameValue: (g) => g.minutes > 0 ? r1(g.stocks / g.minutes * 36) : 0,
    sliceValue: (gs) => {
      const stk = sumBy(gs, (g) => g.stocks);
      const min = sumBy(gs, (g) => g.minutes);
      return min > 0 ? r1(stk / min * 36) : 0;
    }
  }
];
var PLAYER_METRICS_MAP = Object.fromEntries(PLAYER_PER_GAME_METRICS.map((m) => [m.key, m]));
var PLAYER_ANNUAL_TRACKING_METRICS = [
  {
    key: "offRtg",
    label: "Eficiencia Ofensiva (OffRtg)",
    shortLabel: "OffRtg",
    helpKey: "offRtg",
    group: "on_court",
    decimals: 1,
    suffix: "",
    fallbackMean: 114.2,
    fallbackSd: 4.8
  },
  {
    key: "defRtg",
    label: "Eficiencia Defensiva (DefRtg)",
    shortLabel: "DefRtg",
    helpKey: "defRtg",
    group: "on_court",
    decimals: 1,
    suffix: "",
    lowerIsBetter: true,
    fallbackMean: 113.8,
    fallbackSd: 4.5
  },
  {
    key: "netRtg",
    label: "Dominio Neto en pista (NetRtg)",
    shortLabel: "NetRtg",
    helpKey: "netRtg",
    group: "on_court",
    decimals: 1,
    suffix: "",
    signed: true,
    fallbackMean: 0.4,
    fallbackSd: 5.8
  },
  {
    key: "pie",
    label: "Impacto Global NBA.com (PIE%)",
    shortLabel: "PIE%",
    helpKey: "pie",
    group: "on_court",
    decimals: 1,
    suffix: "%",
    fallbackMean: 10.2,
    fallbackSd: 3.4
  },
  {
    key: "astPct",
    label: "% Asistencias en pista (AST%)",
    shortLabel: "AST%",
    helpKey: "astPct",
    group: "on_court",
    decimals: 1,
    suffix: "%",
    fallbackMean: 15.8,
    fallbackSd: 8.6
  },
  {
    key: "orebPct",
    label: "% Rebote Ofensivo (OREB%)",
    shortLabel: "OREB%",
    helpKey: "orebPct",
    group: "on_court",
    decimals: 1,
    suffix: "%",
    fallbackMean: 4.6,
    fallbackSd: 3.4
  },
  {
    key: "drebPct",
    label: "% Rebote Defensivo (DREB%)",
    shortLabel: "DREB%",
    helpKey: "drebPct",
    group: "on_court",
    decimals: 1,
    suffix: "%",
    fallbackMean: 14.2,
    fallbackSd: 5.8
  },
  {
    key: "rebPct",
    label: "% Rebote Total (REB%)",
    shortLabel: "REB%",
    helpKey: "rebPct",
    group: "on_court",
    decimals: 1,
    suffix: "%",
    fallbackMean: 9.4,
    fallbackSd: 4.1
  },
  {
    key: "ptsPaint",
    label: "Puntos en la Pintura / PJ",
    shortLabel: "Pintura",
    helpKey: "ptsPaint",
    group: "zones",
    decimals: 1,
    suffix: "",
    fallbackMean: 5.8,
    fallbackSd: 3.6
  },
  {
    key: "pts2ndChance",
    label: "Puntos 2\xAA Oportunidad / PJ",
    shortLabel: "2\xAA Jug.",
    helpKey: "pts2ndChance",
    group: "zones",
    decimals: 1,
    suffix: "",
    fallbackMean: 1.6,
    fallbackSd: 1
  },
  {
    key: "ptsFastBreak",
    label: "Puntos Contraataque / PJ",
    shortLabel: "Contraat.",
    helpKey: "ptsFastBreak",
    group: "zones",
    decimals: 1,
    suffix: "",
    fallbackMean: 1.9,
    fallbackSd: 1.2
  },
  {
    key: "ptsOffTov",
    label: "Puntos tras P\xE9rdida Rival / PJ",
    shortLabel: "Tras P\xE9rd.",
    helpKey: "ptsOffTov",
    group: "zones",
    decimals: 1,
    suffix: "",
    fallbackMean: 2.1,
    fallbackSd: 1.1
  },
  {
    key: "contestedShots",
    label: "Tiros Punteados / PJ",
    shortLabel: "Punteados",
    helpKey: "contestedShots",
    group: "hustle",
    decimals: 1,
    suffix: "",
    fallbackMean: 4.8,
    fallbackSd: 2.4
  },
  {
    key: "deflections",
    label: "Desv\xEDos de Bal\xF3n / PJ",
    shortLabel: "Desv\xEDos",
    helpKey: "deflections",
    group: "hustle",
    decimals: 1,
    suffix: "",
    fallbackMean: 1.6,
    fallbackSd: 0.8
  },
  {
    key: "screenAssists",
    label: "Asistencias de Bloqueo / PJ",
    shortLabel: "Screen AST",
    helpKey: "screenAssists",
    group: "hustle",
    decimals: 1,
    suffix: "",
    fallbackMean: 1.1,
    fallbackSd: 1.2
  },
  {
    key: "boxOuts",
    label: "Cierres de Rebote (Box-Outs)",
    shortLabel: "Box-Outs",
    helpKey: "boxOuts",
    group: "hustle",
    decimals: 1,
    suffix: "",
    fallbackMean: 1.2,
    fallbackSd: 0.9
  },
  {
    key: "looseBalls",
    label: "Balones Divididos / PJ",
    shortLabel: "Bal. Sueltos",
    helpKey: "looseBalls",
    group: "hustle",
    decimals: 1,
    suffix: "",
    fallbackMean: 0.6,
    fallbackSd: 0.35
  },
  {
    key: "foulsDrawn",
    label: "Faltas Recibidas / PJ",
    shortLabel: "Faltas Rec.",
    helpKey: "foulsDrawn",
    group: "zones",
    decimals: 1,
    suffix: "",
    fallbackMean: 2.4,
    fallbackSd: 1.5
  }
];
var PLAYER_ANNUAL_TRACKING_MAP = Object.fromEntries(PLAYER_ANNUAL_TRACKING_METRICS.map((m) => [m.key, m]));
var DEFAULT_15_SAMPLE_RATIO_KEYS = [
  "tsPct",
  "efgPct",
  "usgEst",
  "gameScore",
  "astTo",
  "tovRatioEst",
  "threePar",
  "ftr",
  "ptsPerShot"
];
var DEFAULT_15_ANNUAL_TRACKING_KEYS = [
  "offRtg",
  "defRtg",
  "netRtg",
  "pie",
  "astPct",
  "rebPct"
];
var ADDABLE_SAMPLE_RATIO_KEYS = [
  "pra",
  "stocks",
  "ptsPerMin",
  "ptsPer36",
  "rebPer36",
  "astPer36",
  "praPer36",
  "stocksPer36"
];
var ADDABLE_ZONES_REB_KEYS = [
  "orebPct",
  "drebPct",
  "ptsPaint",
  "pts2ndChance",
  "ptsFastBreak",
  "ptsOffTov",
  "foulsDrawn"
];
var ADDABLE_HUSTLE_KEYS = [
  "contestedShots",
  "deflections",
  "screenAssists",
  "boxOuts",
  "looseBalls"
];
var PLAYER_ADVANCED_RADIOGRAPHY_METRICS = [
  // 15 estadísticas avanzadas de base (9 ratios recalculados en muestra + 6 pilares en pista NBA.com)
  ...DEFAULT_15_SAMPLE_RATIO_KEYS.map((k) => {
    const m = PLAYER_METRICS_MAP[k];
    return {
      key: m.key,
      label: m.label,
      shortLabel: m.shortLabel,
      helpKey: m.helpKey,
      source: "sample_ratio",
      isDefaultCore15: true,
      perGameKey: m.key
    };
  }),
  ...DEFAULT_15_ANNUAL_TRACKING_KEYS.map((k) => {
    const m = PLAYER_ANNUAL_TRACKING_MAP[k];
    return {
      key: String(m.key),
      label: m.label,
      shortLabel: m.shortLabel,
      helpKey: m.helpKey,
      source: "annual_tracking",
      isDefaultCore15: true,
      annualKey: m.key
    };
  }),
  // 20 KPIs avanzados adicionales seleccionables mediante "+ Añadir KPIs"
  ...ADDABLE_SAMPLE_RATIO_KEYS.map((k) => {
    const m = PLAYER_METRICS_MAP[k];
    return {
      key: m.key,
      label: m.label,
      shortLabel: m.shortLabel,
      helpKey: m.helpKey,
      source: "sample_ratio",
      isDefaultCore15: false,
      addableGroup: "ratios_36",
      perGameKey: m.key
    };
  }),
  ...ADDABLE_ZONES_REB_KEYS.map((k) => {
    const m = PLAYER_ANNUAL_TRACKING_MAP[k];
    return {
      key: String(m.key),
      label: m.label,
      shortLabel: m.shortLabel,
      helpKey: m.helpKey,
      source: "annual_tracking",
      isDefaultCore15: false,
      addableGroup: "zones_reb",
      annualKey: m.key
    };
  }),
  ...ADDABLE_HUSTLE_KEYS.map((k) => {
    const m = PLAYER_ANNUAL_TRACKING_MAP[k];
    return {
      key: String(m.key),
      label: m.label,
      shortLabel: m.shortLabel,
      helpKey: m.helpKey,
      source: "annual_tracking",
      isDefaultCore15: false,
      addableGroup: "hustle",
      annualKey: m.key
    };
  })
];
var PLAYER_ADVANCED_RADIOGRAPHY_MAP = Object.fromEntries(
  PLAYER_ADVANCED_RADIOGRAPHY_METRICS.map((m) => [m.key, m])
);
var PLAYER_GAME_LOG_COLUMNS = [
  // Básicas (8 por defecto + complementarias)
  {
    key: "minutes",
    label: "MIN",
    helpKey: "minBase",
    family: "basic",
    isDefault: true,
    renderCell: (g) => `${g.minutes}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.minutes))).toFixed(1)
  },
  {
    key: "points",
    label: "PTS",
    helpKey: "ptsBase",
    family: "basic",
    isDefault: true,
    highlightTone: "primary",
    renderCell: (g) => `${g.points}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.points))).toFixed(1)
  },
  {
    key: "rebounds",
    label: "REB",
    helpKey: "rebBase",
    family: "basic",
    isDefault: true,
    renderCell: (g) => `${g.rebounds}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.rebounds))).toFixed(1)
  },
  {
    key: "oreb",
    label: "OREB",
    helpKey: "orebBase",
    family: "basic",
    renderCell: (g) => `${g.oreb}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.oreb))).toFixed(1)
  },
  {
    key: "dreb",
    label: "DREB",
    helpKey: "drebBase",
    family: "basic",
    renderCell: (g) => `${g.dreb}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.dreb))).toFixed(1)
  },
  {
    key: "assists",
    label: "AST",
    helpKey: "astBase",
    family: "basic",
    isDefault: true,
    renderCell: (g) => `${g.assists}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.assists))).toFixed(1)
  },
  {
    key: "steals",
    label: "ROB",
    helpKey: "steals",
    family: "basic",
    renderCell: (g) => `${g.steals}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.steals))).toFixed(1)
  },
  {
    key: "blocks",
    label: "TAP",
    helpKey: "blocks",
    family: "basic",
    renderCell: (g) => `${g.blocks}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.blocks))).toFixed(1)
  },
  {
    key: "stocks",
    label: "STK",
    helpKey: "stocksBase",
    family: "basic",
    renderCell: (g) => `${g.stocks}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.stocks))).toFixed(1)
  },
  {
    key: "turnovers",
    label: "PER",
    helpKey: "tov",
    family: "basic",
    renderCell: (g) => `${g.turnovers}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.turnovers))).toFixed(1)
  },
  {
    key: "fouls",
    label: "FP",
    helpKey: "personalFouls",
    family: "basic",
    renderCell: (g) => `${g.fouls}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.fouls))).toFixed(1)
  },
  {
    key: "pra",
    label: "PRA",
    helpKey: "pra",
    family: "basic",
    highlightTone: "primary",
    renderCell: (g) => `${g.pra}`,
    renderAverage: (gs) => r1(avgNums(gs.map((g) => g.pra))).toFixed(1)
  },
  // Tiro (series A-I y porcentajes)
  {
    key: "fg_split",
    label: "TC",
    helpKey: "fgPct",
    family: "shooting",
    isDefault: true,
    renderCell: (g) => `${g.fgm}-${g.fga}`,
    renderAverage: (gs) => `${r1(avgNums(gs.map((g) => g.fgm))).toFixed(1)}-${r1(
      avgNums(gs.map((g) => g.fga))
    ).toFixed(1)}`
  },
  {
    key: "fgPct",
    label: "TC%",
    helpKey: "fgPct",
    family: "shooting",
    renderCell: (g) => g.fga > 0 ? `${g.fgPct.toFixed(1)}%` : "\u2014",
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.fgPct.sliceValue(gs).toFixed(1)}%`
  },
  {
    key: "fg2_split",
    label: "T2",
    helpKey: "fg2Pct",
    family: "shooting",
    renderCell: (g) => `${Math.max(0, g.fgm - g.fg3m)}-${Math.max(0, g.fga - g.fg3a)}`,
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.fg2m.sliceValue(gs).toFixed(1)}-${PLAYER_METRICS_MAP.fg2a.sliceValue(gs).toFixed(1)}`
  },
  {
    key: "fg2Pct",
    label: "T2%",
    helpKey: "fg2Pct",
    family: "shooting",
    renderCell: (g) => {
      const a2 = Math.max(0, g.fga - g.fg3a);
      return a2 > 0 ? `${PLAYER_METRICS_MAP.fg2Pct.gameValue(g).toFixed(1)}%` : "\u2014";
    },
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.fg2Pct.sliceValue(gs).toFixed(1)}%`
  },
  {
    key: "fg3_split",
    label: "3P",
    helpKey: "fg3Pct",
    family: "shooting",
    isDefault: true,
    renderCell: (g) => `${g.fg3m}-${g.fg3a}`,
    renderAverage: (gs) => `${r1(avgNums(gs.map((g) => g.fg3m))).toFixed(1)}-${r1(
      avgNums(gs.map((g) => g.fg3a))
    ).toFixed(1)}`
  },
  {
    key: "fg3Pct",
    label: "3P%",
    helpKey: "fg3Pct",
    family: "shooting",
    renderCell: (g) => g.fg3a > 0 ? `${g.fg3Pct.toFixed(1)}%` : "\u2014",
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.fg3Pct.sliceValue(gs).toFixed(1)}%`
  },
  {
    key: "ft_split",
    label: "TL",
    helpKey: "ftPct",
    family: "shooting",
    isDefault: true,
    renderCell: (g) => `${g.ftm}-${g.fta}`,
    renderAverage: (gs) => `${r1(avgNums(gs.map((g) => g.ftm))).toFixed(1)}-${r1(
      avgNums(gs.map((g) => g.fta))
    ).toFixed(1)}`
  },
  {
    key: "ftPct",
    label: "TL%",
    helpKey: "ftPct",
    family: "shooting",
    renderCell: (g) => g.fta > 0 ? `${g.ftPct.toFixed(1)}%` : "\u2014",
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.ftPct.sliceValue(gs).toFixed(1)}%`
  },
  {
    key: "plusMinus",
    label: "+/-",
    helpKey: "plusMinusBase",
    family: "basic",
    isDefault: true,
    highlightTone: "signed",
    numericForTone: (g) => g.plusMinus,
    renderCell: (g) => formatMetricNumber(g.plusMinus, 0, "", true),
    renderAverage: (gs) => formatMetricNumber(PLAYER_METRICS_MAP.plusMinus.sliceValue(gs), 1, "", true)
  },
  // Ratios y eficiencia avanzada
  {
    key: "usgEst",
    label: "USG%",
    helpKey: "usgPct",
    family: "ratios",
    highlightTone: "orange",
    renderCell: (g) => `${g.usgEst.toFixed(1)}%`,
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.usgEst.sliceValue(gs).toFixed(1)}%`
  },
  {
    key: "tsPct",
    label: "TS%",
    helpKey: "tsPct",
    family: "ratios",
    highlightTone: "emerald",
    renderCell: (g) => `${g.tsPct.toFixed(1)}%`,
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.tsPct.sliceValue(gs).toFixed(1)}%`
  },
  {
    key: "efgPct",
    label: "eFG%",
    helpKey: "efgPct",
    family: "ratios",
    renderCell: (g) => `${g.efgPct.toFixed(1)}%`,
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.efgPct.sliceValue(gs).toFixed(1)}%`
  },
  {
    key: "gameScore",
    label: "GmSc",
    helpKey: "gmSc",
    family: "ratios",
    highlightTone: "primary",
    renderCell: (g) => g.gameScore.toFixed(1),
    renderAverage: (gs) => PLAYER_METRICS_MAP.gameScore.sliceValue(gs).toFixed(1)
  },
  {
    key: "astTo",
    label: "AST/PER",
    helpKey: "astTo",
    family: "ratios",
    renderCell: (g) => PLAYER_METRICS_MAP.astTo.gameValue(g).toFixed(2),
    renderAverage: (gs) => PLAYER_METRICS_MAP.astTo.sliceValue(gs).toFixed(2)
  },
  {
    key: "threePar",
    label: "3PAr",
    helpKey: "threeRatio",
    family: "ratios",
    renderCell: (g) => g.fga > 0 ? `${PLAYER_METRICS_MAP.threePar.gameValue(g).toFixed(1)}%` : "\u2014",
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.threePar.sliceValue(gs).toFixed(1)}%`
  },
  {
    key: "ftr",
    label: "FTr",
    helpKey: "ftr",
    family: "ratios",
    renderCell: (g) => g.fga > 0 ? `${PLAYER_METRICS_MAP.ftr.gameValue(g).toFixed(1)}%` : "\u2014",
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.ftr.sliceValue(gs).toFixed(1)}%`
  },
  {
    key: "tovRatioEst",
    label: "TOV%",
    helpKey: "tovRatioEst",
    family: "ratios",
    renderCell: (g) => `${PLAYER_METRICS_MAP.tovRatioEst.gameValue(g).toFixed(1)}%`,
    renderAverage: (gs) => `${PLAYER_METRICS_MAP.tovRatioEst.sliceValue(gs).toFixed(1)}%`
  },
  {
    key: "ptsPerShot",
    label: "PTS/TCI",
    helpKey: "ptsPerShot",
    family: "ratios",
    renderCell: (g) => g.fga > 0 ? PLAYER_METRICS_MAP.ptsPerShot.gameValue(g).toFixed(2) : "\u2014",
    renderAverage: (gs) => PLAYER_METRICS_MAP.ptsPerShot.sliceValue(gs).toFixed(2)
  },
  {
    key: "ptsPerMin",
    label: "PTS/MIN",
    helpKey: "ptsPerMin",
    family: "ratios",
    renderCell: (g) => PLAYER_METRICS_MAP.ptsPerMin.gameValue(g).toFixed(2),
    renderAverage: (gs) => PLAYER_METRICS_MAP.ptsPerMin.sliceValue(gs).toFixed(2)
  },
  {
    key: "ptsPer36",
    label: "PTS/36",
    helpKey: "ptsPer36",
    family: "ratios",
    renderCell: (g) => PLAYER_METRICS_MAP.ptsPer36.gameValue(g).toFixed(1),
    renderAverage: (gs) => PLAYER_METRICS_MAP.ptsPer36.sliceValue(gs).toFixed(1)
  },
  {
    key: "rebPer36",
    label: "REB/36",
    helpKey: "rebPer36",
    family: "ratios",
    renderCell: (g) => PLAYER_METRICS_MAP.rebPer36.gameValue(g).toFixed(1),
    renderAverage: (gs) => PLAYER_METRICS_MAP.rebPer36.sliceValue(gs).toFixed(1)
  },
  {
    key: "astPer36",
    label: "AST/36",
    helpKey: "astPer36",
    family: "ratios",
    renderCell: (g) => PLAYER_METRICS_MAP.astPer36.gameValue(g).toFixed(1),
    renderAverage: (gs) => PLAYER_METRICS_MAP.astPer36.sliceValue(gs).toFixed(1)
  }
];
var PLAYER_LOG_COLUMNS_MAP = Object.fromEntries(PLAYER_GAME_LOG_COLUMNS.map((c) => [c.key, c]));
function buildExtendedPlayerBenchmarks(players, gameFilter) {
  const projected = players.map((p) => ({
    advanced: p.advanced,
    games: gameFilter ? p.games.filter(gameFilter) : p.games
  })).filter((p) => p.games.length > 0);
  const rotPool = projected.filter(
    (p) => p.games.length >= 2 && avgNums(p.games.map((g) => g.minutes)) >= 15
  );
  const pool = rotPool.length >= 20 ? rotPool : projected.filter(
    (p) => avgNums(p.games.map((g) => g.minutes)) >= 12
  ).length >= 15 ? projected.filter((p) => avgNums(p.games.map((g) => g.minutes)) >= 12) : projected;
  const out = {};
  for (const m of PLAYER_PER_GAME_METRICS) {
    const vals = pool.filter((p) => {
      if (m.key === "fg3Pct") return sumBy(p.games, (g) => g.fg3a) >= 4;
      if (m.key === "ftPct") return sumBy(p.games, (g) => g.fta) >= 3;
      if (m.key === "fg2Pct")
        return sumBy(p.games, (g) => Math.max(0, g.fga - g.fg3a)) >= 4;
      if (m.key === "fgPct" || m.key === "tsPct" || m.key === "efgPct")
        return sumBy(p.games, (g) => g.fga) >= 6;
      return true;
    }).map((p) => m.sliceValue(p.games));
    if (vals.length < 8) {
      out[m.key] = {
        mean: m.fallbackMean,
        sd: m.fallbackSd,
        lowerIsBetter: m.lowerIsBetter,
        decimals: m.decimals,
        suffix: m.suffix
      };
    } else {
      const avg = m.decimals === 2 ? r2(avgNums(vals)) : r1(avgNums(vals));
      const sdRaw = m.decimals === 2 ? r2(sdNums(vals)) : r1(sdNums(vals));
      out[m.key] = {
        mean: avg,
        sd: Math.max(m.fallbackSd * 0.45, sdRaw),
        lowerIsBetter: m.lowerIsBetter,
        decimals: m.decimals,
        suffix: m.suffix
      };
    }
  }
  for (const t of PLAYER_ANNUAL_TRACKING_METRICS) {
    const vals = pool.map((p) => p.advanced ? Number(p.advanced[t.key]) : NaN).filter((v) => Number.isFinite(v) && (t.signed || v > 0));
    if (vals.length < 8) {
      out[t.key] = {
        mean: t.fallbackMean,
        sd: t.fallbackSd,
        lowerIsBetter: t.lowerIsBetter,
        decimals: t.decimals,
        suffix: t.suffix
      };
    } else {
      const avg = r1(avgNums(vals));
      const sdRaw = r1(sdNums(vals));
      out[t.key] = {
        mean: avg,
        sd: Math.max(t.fallbackSd * 0.45, sdRaw),
        lowerIsBetter: t.lowerIsBetter,
        decimals: t.decimals,
        suffix: t.suffix
      };
    }
  }
  return out;
}

// src/utils/teamLogos.ts
var NBA_TEAMS_MAP = {
  ATL: {
    id: "1610612737",
    nbaId: 1610612737,
    espnId: "1",
    espnSlug: "atl",
    abbr: "ATL",
    name: "Atlanta Hawks",
    city: "Atlanta",
    primaryColor: "#C8102E",
    secondaryColor: "#FDB927",
    fallbackBgClass: "bg-red-700"
  },
  BOS: {
    id: "1610612738",
    nbaId: 1610612738,
    espnId: "2",
    espnSlug: "bos",
    abbr: "BOS",
    name: "Boston Celtics",
    city: "Boston",
    primaryColor: "#007A33",
    secondaryColor: "#BA9653",
    fallbackBgClass: "bg-emerald-700"
  },
  BKN: {
    id: "1610612751",
    nbaId: 1610612751,
    espnId: "17",
    espnSlug: "bkn",
    abbr: "BKN",
    name: "Brooklyn Nets",
    city: "Brooklyn",
    primaryColor: "#18181B",
    secondaryColor: "#FFFFFF",
    fallbackBgClass: "bg-zinc-800"
  },
  CHA: {
    id: "1610612766",
    nbaId: 1610612766,
    espnId: "30",
    espnSlug: "cha",
    abbr: "CHA",
    name: "Charlotte Hornets",
    city: "Charlotte",
    primaryColor: "#1D1160",
    secondaryColor: "#00788C",
    fallbackBgClass: "bg-cyan-700"
  },
  CHI: {
    id: "1610612741",
    nbaId: 1610612741,
    espnId: "4",
    espnSlug: "chi",
    abbr: "CHI",
    name: "Chicago Bulls",
    city: "Chicago",
    primaryColor: "#CE1141",
    secondaryColor: "#000000",
    fallbackBgClass: "bg-rose-700"
  },
  CLE: {
    id: "1610612739",
    nbaId: 1610612739,
    espnId: "5",
    espnSlug: "cle",
    abbr: "CLE",
    name: "Cleveland Cavaliers",
    city: "Cleveland",
    primaryColor: "#860038",
    secondaryColor: "#041E42",
    fallbackBgClass: "bg-rose-900"
  },
  DAL: {
    id: "1610612742",
    nbaId: 1610612742,
    espnId: "6",
    espnSlug: "dal",
    abbr: "DAL",
    name: "Dallas Mavericks",
    city: "Dallas",
    primaryColor: "#00538C",
    secondaryColor: "#002B5E",
    fallbackBgClass: "bg-sky-700"
  },
  DEN: {
    id: "1610612743",
    nbaId: 1610612743,
    espnId: "7",
    espnSlug: "den",
    abbr: "DEN",
    name: "Denver Nuggets",
    city: "Denver",
    primaryColor: "#0E2240",
    secondaryColor: "#FEC524",
    fallbackBgClass: "bg-blue-900"
  },
  DET: {
    id: "1610612765",
    nbaId: 1610612765,
    espnId: "8",
    espnSlug: "det",
    abbr: "DET",
    name: "Detroit Pistons",
    city: "Detroit",
    primaryColor: "#C8102E",
    secondaryColor: "#1D428A",
    fallbackBgClass: "bg-blue-700"
  },
  GSW: {
    id: "1610612744",
    nbaId: 1610612744,
    espnId: "9",
    espnSlug: "gs",
    abbr: "GSW",
    name: "Golden State Warriors",
    city: "Golden State",
    primaryColor: "#1D428A",
    secondaryColor: "#FFC72C",
    fallbackBgClass: "bg-blue-700"
  },
  HOU: {
    id: "1610612745",
    nbaId: 1610612745,
    espnId: "10",
    espnSlug: "hou",
    abbr: "HOU",
    name: "Houston Rockets",
    city: "Houston",
    primaryColor: "#CE1141",
    secondaryColor: "#000000",
    fallbackBgClass: "bg-red-700"
  },
  IND: {
    id: "1610612754",
    nbaId: 1610612754,
    espnId: "11",
    espnSlug: "ind",
    abbr: "IND",
    name: "Indiana Pacers",
    city: "Indiana",
    primaryColor: "#002D62",
    secondaryColor: "#FDBB30",
    fallbackBgClass: "bg-amber-600"
  },
  LAC: {
    id: "1610612746",
    nbaId: 1610612746,
    espnId: "12",
    espnSlug: "lac",
    abbr: "LAC",
    name: "LA Clippers",
    city: "Los Angeles",
    primaryColor: "#C8102E",
    secondaryColor: "#1D428A",
    fallbackBgClass: "bg-red-700"
  },
  LAL: {
    id: "1610612747",
    nbaId: 1610612747,
    espnId: "13",
    espnSlug: "lal",
    abbr: "LAL",
    name: "Los Angeles Lakers",
    city: "Los Angeles",
    primaryColor: "#552583",
    secondaryColor: "#FDB927",
    fallbackBgClass: "bg-purple-800"
  },
  MEM: {
    id: "1610612763",
    nbaId: 1610612763,
    espnId: "29",
    espnSlug: "mem",
    abbr: "MEM",
    name: "Memphis Grizzlies",
    city: "Memphis",
    primaryColor: "#5D76A9",
    secondaryColor: "#12173F",
    fallbackBgClass: "bg-slate-600"
  },
  MIA: {
    id: "1610612748",
    nbaId: 1610612748,
    espnId: "14",
    espnSlug: "mia",
    abbr: "MIA",
    name: "Miami Heat",
    city: "Miami",
    primaryColor: "#98002E",
    secondaryColor: "#F9A01B",
    fallbackBgClass: "bg-rose-800"
  },
  MIL: {
    id: "1610612749",
    nbaId: 1610612749,
    espnId: "15",
    espnSlug: "mil",
    abbr: "MIL",
    name: "Milwaukee Bucks",
    city: "Milwaukee",
    primaryColor: "#00471B",
    secondaryColor: "#EEE1C6",
    fallbackBgClass: "bg-emerald-800"
  },
  MIN: {
    id: "1610612750",
    nbaId: 1610612750,
    espnId: "16",
    espnSlug: "min",
    abbr: "MIN",
    name: "Minnesota Timberwolves",
    city: "Minnesota",
    primaryColor: "#0C2340",
    secondaryColor: "#236192",
    fallbackBgClass: "bg-sky-800"
  },
  NOP: {
    id: "1610612740",
    nbaId: 1610612740,
    espnId: "3",
    espnSlug: "no",
    abbr: "NOP",
    name: "New Orleans Pelicans",
    city: "New Orleans",
    primaryColor: "#0C2340",
    secondaryColor: "#C8102E",
    fallbackBgClass: "bg-blue-900"
  },
  NYK: {
    id: "1610612752",
    nbaId: 1610612752,
    espnId: "18",
    espnSlug: "ny",
    abbr: "NYK",
    name: "New York Knicks",
    city: "New York",
    primaryColor: "#006BB6",
    secondaryColor: "#F58426",
    fallbackBgClass: "bg-orange-600"
  },
  OKC: {
    id: "1610612760",
    nbaId: 1610612760,
    espnId: "25",
    espnSlug: "okc",
    abbr: "OKC",
    name: "Oklahoma City Thunder",
    city: "Oklahoma City",
    primaryColor: "#007AC1",
    secondaryColor: "#EF3B24",
    fallbackBgClass: "bg-sky-600"
  },
  ORL: {
    id: "1610612753",
    nbaId: 1610612753,
    espnId: "19",
    espnSlug: "orl",
    abbr: "ORL",
    name: "Orlando Magic",
    city: "Orlando",
    primaryColor: "#0077C0",
    secondaryColor: "#C4CED4",
    fallbackBgClass: "bg-blue-600"
  },
  PHI: {
    id: "1610612755",
    nbaId: 1610612755,
    espnId: "20",
    espnSlug: "phi",
    abbr: "PHI",
    name: "Philadelphia 76ers",
    city: "Philadelphia",
    primaryColor: "#006BB6",
    secondaryColor: "#ED174C",
    fallbackBgClass: "bg-blue-700"
  },
  PHX: {
    id: "1610612756",
    nbaId: 1610612756,
    espnId: "21",
    espnSlug: "phx",
    abbr: "PHX",
    name: "Phoenix Suns",
    city: "Phoenix",
    primaryColor: "#1D1160",
    secondaryColor: "#E56020",
    fallbackBgClass: "bg-orange-700"
  },
  POR: {
    id: "1610612757",
    nbaId: 1610612757,
    espnId: "22",
    espnSlug: "por",
    abbr: "POR",
    name: "Portland Trail Blazers",
    city: "Portland",
    primaryColor: "#E03A3E",
    secondaryColor: "#000000",
    fallbackBgClass: "bg-red-600"
  },
  SAC: {
    id: "1610612758",
    nbaId: 1610612758,
    espnId: "23",
    espnSlug: "sac",
    abbr: "SAC",
    name: "Sacramento Kings",
    city: "Sacramento",
    primaryColor: "#5A2D81",
    secondaryColor: "#63727A",
    fallbackBgClass: "bg-purple-700"
  },
  SAS: {
    id: "1610612759",
    nbaId: 1610612759,
    espnId: "24",
    espnSlug: "sa",
    abbr: "SAS",
    name: "San Antonio Spurs",
    city: "San Antonio",
    primaryColor: "#475569",
    secondaryColor: "#000000",
    fallbackBgClass: "bg-slate-600"
  },
  TOR: {
    id: "1610612761",
    nbaId: 1610612761,
    espnId: "28",
    espnSlug: "tor",
    abbr: "TOR",
    name: "Toronto Raptors",
    city: "Toronto",
    primaryColor: "#CE1141",
    secondaryColor: "#000000",
    fallbackBgClass: "bg-red-700"
  },
  UTA: {
    id: "1610612762",
    nbaId: 1610612762,
    espnId: "26",
    espnSlug: "utah",
    abbr: "UTA",
    name: "Utah Jazz",
    city: "Utah",
    primaryColor: "#002B5C",
    secondaryColor: "#F9A01B",
    fallbackBgClass: "bg-indigo-900"
  },
  WAS: {
    id: "1610612764",
    nbaId: 1610612764,
    espnId: "27",
    espnSlug: "wsh",
    abbr: "WAS",
    name: "Washington Wizards",
    city: "Washington",
    primaryColor: "#002B5C",
    secondaryColor: "#E31837",
    fallbackBgClass: "bg-red-800"
  }
};
var ESPN_TEAM_IDS = Object.fromEntries(
  Object.entries(NBA_TEAMS_MAP).map(([abbr, meta]) => [abbr, meta.espnId])
);

// src/server/scoutingEngine.ts
import { GoogleGenAI } from "@google/genai";

// src/data/nbaSchedule2027.ts
var NBA_SCHEDULE_2027_TUPLES = [["0022600001", "2026-10-20", "2026-10-20T19:00:00Z", "BOS", "DET"], ["0022600002", "2026-10-20", "2026-10-20T23:00:00Z", "PHI", "NYK"], ["0022600003", "2026-10-20", "2026-10-21T01:30:00Z", "OKC", "SAS"], ["0022600085", "2026-10-21", "2026-10-21T23:00:00Z", "ATL", "ORL"], ["0022600086", "2026-10-21", "2026-10-21T23:00:00Z", "MIL", "WAS"], ["0022600004", "2026-10-21", "2026-10-21T23:30:00Z", "MIN", "MIA"], ["0022600087", "2026-10-21", "2026-10-21T23:30:00Z", "CHA", "BKN"], ["0022600088", "2026-10-21", "2026-10-21T23:30:00Z", "CHI", "TOR"], ["0022600089", "2026-10-21", "2026-10-22T00:00:00Z", "UTA", "MEM"], ["0022600090", "2026-10-21", "2026-10-22T00:00:00Z", "IND", "NOP"], ["0022600091", "2026-10-21", "2026-10-22T00:30:00Z", "DAL", "HOU"], ["0022600005", "2026-10-21", "2026-10-22T02:00:00Z", "GSW", "LAL"], ["0022600092", "2026-10-21", "2026-10-22T02:00:00Z", "PHX", "POR"], ["0022600093", "2026-10-21", "2026-10-22T02:30:00Z", "SAC", "LAC"], ["0022600006", "2026-10-22", "2026-10-22T23:00:00Z", "CLE", "PHI"], ["0022600007", "2026-10-22", "2026-10-23T01:30:00Z", "DEN", "OKC"], ["0022600099", "2026-10-23", "2026-10-23T20:00:00Z", "CHI", "MIL"], ["0022600008", "2026-10-23", "2026-10-23T23:00:00Z", "NYK", "BOS"], ["0022600094", "2026-10-23", "2026-10-23T23:00:00Z", "ATL", "CHA"], ["0022600095", "2026-10-23", "2026-10-23T23:00:00Z", "DAL", "IND"], ["0022600096", "2026-10-23", "2026-10-23T23:00:00Z", "MIN", "ORL"], ["0022600097", "2026-10-23", "2026-10-23T23:00:00Z", "TOR", "WAS"], ["0022600098", "2026-10-23", "2026-10-24T00:00:00Z", "DET", "MIA"], ["0022600009", "2026-10-23", "2026-10-24T01:30:00Z", "HOU", "SAS"], ["0022600100", "2026-10-23", "2026-10-24T01:30:00Z", "NOP", "UTA"], ["0022600101", "2026-10-23", "2026-10-24T02:00:00Z", "MEM", "GSW"], ["0022600102", "2026-10-23", "2026-10-24T02:00:00Z", "LAC", "LAL"], ["0022600103", "2026-10-23", "2026-10-24T02:00:00Z", "POR", "SAC"], ["0022600104", "2026-10-24", "2026-10-24T22:00:00Z", "MIA", "CHA"], ["0022600105", "2026-10-24", "2026-10-24T23:30:00Z", "BKN", "CLE"], ["0022600106", "2026-10-24", "2026-10-24T23:30:00Z", "MIL", "PHI"], ["0022600108", "2026-10-24", "2026-10-25T00:00:00Z", "WAS", "CHI"], ["0022600109", "2026-10-24", "2026-10-25T00:00:00Z", "SAS", "DAL"], ["0022600107", "2026-10-24", "2026-10-25T00:30:00Z", "HOU", "ATL"], ["0022600110", "2026-10-24", "2026-10-25T01:00:00Z", "NOP", "DEN"], ["0022600111", "2026-10-24", "2026-10-25T02:00:00Z", "GSW", "PHX"], ["0022600112", "2026-10-25", "2026-10-25T21:00:00Z", "LAL", "UTA"], ["0022600113", "2026-10-25", "2026-10-25T22:00:00Z", "IND", "BKN"], ["0022600114", "2026-10-25", "2026-10-25T23:00:00Z", "ORL", "NYK"], ["0022600115", "2026-10-25", "2026-10-25T23:00:00Z", "TOR", "MIN"], ["0022600116", "2026-10-25", "2026-10-25T23:00:00Z", "LAC", "OKC"], ["0022600117", "2026-10-25", "2026-10-25T23:30:00Z", "DET", "PHI"], ["0022600118", "2026-10-25", "2026-10-26T01:00:00Z", "MEM", "SAC"], ["0022600119", "2026-10-26", "2026-10-26T23:00:00Z", "WAS", "CHA"], ["0022600120", "2026-10-26", "2026-10-26T23:00:00Z", "MIN", "CLE"], ["0022600121", "2026-10-26", "2026-10-26T23:30:00Z", "CHI", "BOS"], ["0022600122", "2026-10-26", "2026-10-26T23:30:00Z", "DAL", "MIA"], ["0022600123", "2026-10-26", "2026-10-27T00:00:00Z", "IND", "MIL"], ["0022600124", "2026-10-26", "2026-10-27T00:00:00Z", "PHX", "OKC"], ["0022600125", "2026-10-26", "2026-10-27T00:30:00Z", "ATL", "HOU"], ["0022600126", "2026-10-26", "2026-10-27T01:00:00Z", "MEM", "UTA"], ["0022600127", "2026-10-26", "2026-10-27T02:00:00Z", "GSW", "DEN"], ["0022600128", "2026-10-27", "2026-10-27T23:30:00Z", "BKN", "BOS"], ["0022600129", "2026-10-27", "2026-10-28T00:00:00Z", "DET", "NYK"], ["0022600130", "2026-10-27", "2026-10-28T00:00:00Z", "SAC", "SAS"], ["0022600131", "2026-10-27", "2026-10-28T03:00:00Z", "POR", "LAL"], ["0022600132", "2026-10-28", "2026-10-28T23:00:00Z", "MIA", "ATL"], ["0022600133", "2026-10-28", "2026-10-28T23:00:00Z", "WAS", "CLE"], ["0022600134", "2026-10-28", "2026-10-28T23:00:00Z", "CHA", "DET"], ["0022600135", "2026-10-28", "2026-10-28T23:00:00Z", "PHI", "IND"], ["0022600136", "2026-10-28", "2026-10-28T23:30:00Z", "ORL", "TOR"], ["0022600137", "2026-10-28", "2026-10-29T00:00:00Z", "NYK", "CHI"], ["0022600138", "2026-10-28", "2026-10-29T00:00:00Z", "HOU", "MIL"], ["0022600139", "2026-10-28", "2026-10-29T00:00:00Z", "GSW", "MIN"], ["0022600140", "2026-10-28", "2026-10-29T00:00:00Z", "DEN", "NOP"], ["0022600141", "2026-10-28", "2026-10-29T01:00:00Z", "SAS", "UTA"], ["0022600142", "2026-10-28", "2026-10-29T01:30:00Z", "OKC", "DAL"], ["0022600143", "2026-10-28", "2026-10-29T02:30:00Z", "LAL", "LAC"], ["0022600144", "2026-10-29", "2026-10-30T00:00:00Z", "CLE", "ATL"], ["0022600145", "2026-10-29", "2026-10-30T00:00:00Z", "SAC", "NOP"], ["0022600146", "2026-10-29", "2026-10-30T02:00:00Z", "MEM", "POR"], ["0022600015", "2026-10-30", "2026-10-30T23:00:00Z", "CHA", "WAS"], ["0022600016", "2026-10-30", "2026-10-30T23:30:00Z", "CHI", "BOS"], ["0022600017", "2026-10-30", "2026-10-30T23:30:00Z", "DET", "BKN"], ["0022600018", "2026-10-30", "2026-10-30T23:30:00Z", "NYK", "PHI"], ["0022600019", "2026-10-30", "2026-10-30T23:30:00Z", "ORL", "TOR"], ["0022600020", "2026-10-30", "2026-10-31T00:00:00Z", "IND", "MIA"], ["0022600021", "2026-10-30", "2026-10-31T00:00:00Z", "HOU", "DAL"], ["0022600022", "2026-10-30", "2026-10-31T00:00:00Z", "LAC", "MIN"], ["0022600023", "2026-10-30", "2026-10-31T02:00:00Z", "LAL", "GSW"], ["0022600024", "2026-10-30", "2026-10-31T02:00:00Z", "DEN", "PHX"], ["0022600147", "2026-10-31", "2026-10-31T19:00:00Z", "POR", "UTA"], ["0022600148", "2026-10-31", "2026-10-31T22:00:00Z", "PHI", "CHA"], ["0022600149", "2026-10-31", "2026-10-31T23:00:00Z", "ATL", "NOP"], ["0022600150", "2026-10-31", "2026-11-01T00:00:00Z", "SAC", "MEM"], ["0022600151", "2026-10-31", "2026-11-01T00:00:00Z", "CLE", "MIL"], ["0022600152", "2026-10-31", "2026-11-01T00:00:00Z", "MIN", "SAS"], ["0022600153", "2026-10-31", "2026-11-01T00:30:00Z", "OKC", "HOU"], ["0022600154", "2026-11-01", "2026-11-01T20:30:00Z", "BOS", "ORL"], ["0022600155", "2026-11-01", "2026-11-01T22:00:00Z", "BKN", "IND"], ["0022600156", "2026-11-01", "2026-11-02T01:30:00Z", "LAC", "GSW"], ["0022600157", "2026-11-01", "2026-11-02T02:00:00Z", "TOR", "LAL"], ["0022600158", "2026-11-02", "2026-11-03T00:00:00Z", "OKC", "CLE"], ["0022600159", "2026-11-02", "2026-11-03T00:30:00Z", "DET", "CHA"], ["0022600160", "2026-11-02", "2026-11-03T00:30:00Z", "ATL", "IND"], ["0022600161", "2026-11-02", "2026-11-03T00:30:00Z", "BKN", "NYK"], ["0022600162", "2026-11-02", "2026-11-03T00:30:00Z", "WAS", "ORL"], ["0022600163", "2026-11-02", "2026-11-03T00:30:00Z", "CHI", "PHI"], ["0022600164", "2026-11-02", "2026-11-03T01:00:00Z", "SAC", "DAL"], ["0022600165", "2026-11-02", "2026-11-03T01:00:00Z", "NOP", "MEM"], ["0022600166", "2026-11-02", "2026-11-03T01:00:00Z", "MIL", "MIN"], ["0022600167", "2026-11-02", "2026-11-03T01:30:00Z", "BOS", "HOU"], ["0022600168", "2026-11-02", "2026-11-03T01:30:00Z", "UTA", "SAS"], ["0022600169", "2026-11-02", "2026-11-03T02:00:00Z", "POR", "DEN"], ["0022600170", "2026-11-02", "2026-11-03T03:00:00Z", "PHX", "GSW"], ["0022600171", "2026-11-02", "2026-11-03T03:00:00Z", "TOR", "LAC"], ["0022600172", "2026-11-02", "2026-11-03T03:00:00Z", "MIA", "LAL"], ["0022600173", "2026-11-04", "2026-11-05T00:00:00Z", "PHI", "DET"], ["0022600174", "2026-11-04", "2026-11-05T00:00:00Z", "ATL", "WAS"], ["0022600175", "2026-11-04", "2026-11-05T00:30:00Z", "MIL", "BOS"], ["0022600176", "2026-11-04", "2026-11-05T00:30:00Z", "CHA", "BKN"], ["0022600177", "2026-11-04", "2026-11-05T00:30:00Z", "CHI", "NYK"], ["0022600178", "2026-11-04", "2026-11-05T01:00:00Z", "IND", "MEM"], ["0022600179", "2026-11-04", "2026-11-05T01:00:00Z", "UTA", "NOP"], ["0022600180", "2026-11-04", "2026-11-05T01:00:00Z", "CLE", "OKC"], ["0022600181", "2026-11-04", "2026-11-05T01:30:00Z", "MIN", "HOU"], ["0022600182", "2026-11-04", "2026-11-05T02:00:00Z", "TOR", "DEN"], ["0022600183", "2026-11-04", "2026-11-05T02:00:00Z", "POR", "PHX"], ["0022600184", "2026-11-04", "2026-11-05T02:30:00Z", "DAL", "SAS"], ["0022600185", "2026-11-04", "2026-11-05T03:00:00Z", "LAL", "SAC"], ["0022600186", "2026-11-04", "2026-11-05T03:30:00Z", "MIA", "LAC"], ["0022600187", "2026-11-05", "2026-11-06T02:00:00Z", "ORL", "PHX"], ["0022600188", "2026-11-05", "2026-11-06T03:00:00Z", "MIA", "GSW"], ["0022600025", "2026-11-06", "2026-11-07T00:00:00Z", "WAS", "ATL"], ["0022600026", "2026-11-06", "2026-11-07T00:00:00Z", "BOS", "CHA"], ["0022600027", "2026-11-06", "2026-11-07T00:30:00Z", "PHI", "CLE"], ["0022600028", "2026-11-06", "2026-11-07T01:00:00Z", "UTA", "DAL"], ["0022600029", "2026-11-06", "2026-11-07T01:00:00Z", "OKC", "MEM"], ["0022600030", "2026-11-06", "2026-11-07T01:00:00Z", "TOR", "MIL"], ["0022600031", "2026-11-06", "2026-11-07T01:00:00Z", "MIN", "NOP"], ["0022600032", "2026-11-06", "2026-11-07T03:00:00Z", "POR", "LAL"], ["0022600033", "2026-11-06", "2026-11-07T03:00:00Z", "SAS", "SAC"], ["0022600189", "2026-11-07", "2026-11-07T22:00:00Z", "DEN", "IND"], ["0022600190", "2026-11-07", "2026-11-08T00:30:00Z", "BKN", "ATL"], ["0022600191", "2026-11-07", "2026-11-08T01:00:00Z", "NYK", "CLE"], ["0022600192", "2026-11-07", "2026-11-08T01:00:00Z", "WAS", "OKC"], ["0022600193", "2026-11-07", "2026-11-08T01:30:00Z", "ORL", "GSW"], ["0022600194", "2026-11-07", "2026-11-08T02:00:00Z", "HOU", "PHX"], ["0022600195", "2026-11-07", "2026-11-08T03:00:00Z", "SAS", "POR"], ["0022600196", "2026-11-08", "2026-11-08T20:30:00Z", "PHI", "CHI"], ["0022600197", "2026-11-08", "2026-11-08T23:00:00Z", "LAL", "DET"], ["0022600198", "2026-11-08", "2026-11-09T00:00:00Z", "UTA", "MIN"], ["0022600199", "2026-11-08", "2026-11-09T00:30:00Z", "BKN", "DAL"], ["0022600200", "2026-11-08", "2026-11-09T01:00:00Z", "BOS", "MIL"], ["0022600201", "2026-11-08", "2026-11-09T02:00:00Z", "NOP", "LAC"], ["0022600202", "2026-11-08", "2026-11-09T02:00:00Z", "MIA", "SAC"], ["0022600203", "2026-11-09", "2026-11-10T00:00:00Z", "LAL", "ATL"], ["0022600204", "2026-11-09", "2026-11-10T00:00:00Z", "CLE", "CHA"], ["0022600205", "2026-11-09", "2026-11-10T00:00:00Z", "WAS", "DET"], ["0022600206", "2026-11-09", "2026-11-10T00:30:00Z", "MEM", "TOR"], ["0022600207", "2026-11-09", "2026-11-10T01:00:00Z", "IND", "DAL"], ["0022600208", "2026-11-09", "2026-11-10T01:30:00Z", "DEN", "HOU"], ["0022600209", "2026-11-09", "2026-11-10T02:00:00Z", "SAS", "PHX"], ["0022600210", "2026-11-09", "2026-11-10T03:00:00Z", "NOP", "GSW"], ["0022600211", "2026-11-10", "2026-11-11T00:30:00Z", "MIL", "NYK"], ["0022600212", "2026-11-10", "2026-11-11T01:00:00Z", "BOS", "PHI"], ["0022600213", "2026-11-10", "2026-11-11T02:00:00Z", "LAC", "PHX"], ["0022600214", "2026-11-10", "2026-11-11T02:00:00Z", "MIA", "UTA"], ["0022600215", "2026-11-10", "2026-11-11T03:00:00Z", "ORL", "SAC"], ["0022600216", "2026-11-10", "2026-11-11T04:00:00Z", "OKC", "POR"], ["0022600217", "2026-11-11", "2026-11-12T00:00:00Z", "WAS", "IND"], ["0022600218", "2026-11-11", "2026-11-12T00:00:00Z", "CLE", "NYK"], ["0022600219", "2026-11-11", "2026-11-12T00:00:00Z", "BOS", "TOR"], ["0022600220", "2026-11-11", "2026-11-12T01:00:00Z", "SAS", "CHI"], ["0022600221", "2026-11-11", "2026-11-12T01:00:00Z", "DEN", "MEM"], ["0022600222", "2026-11-11", "2026-11-12T01:00:00Z", "LAL", "MIL"], ["0022600223", "2026-11-11", "2026-11-12T01:00:00Z", "BKN", "NOP"], ["0022600224", "2026-11-11", "2026-11-12T02:00:00Z", "ORL", "UTA"], ["0022600225", "2026-11-11", "2026-11-12T02:30:00Z", "GSW", "HOU"], ["0022600226", "2026-11-11", "2026-11-12T03:00:00Z", "OKC", "POR"], ["0022600227", "2026-11-12", "2026-11-13T00:00:00Z", "TOR", "PHI"], ["0022600228", "2026-11-12", "2026-11-13T00:00:00Z", "DET", "WAS"], ["0022600229", "2026-11-12", "2026-11-13T01:00:00Z", "DAL", "MIN"], ["0022600230", "2026-11-12", "2026-11-13T02:00:00Z", "CHA", "PHX"], ["0022600034", "2026-11-13", "2026-11-14T00:00:00Z", "NYK", "IND"], ["0022600035", "2026-11-13", "2026-11-14T00:00:00Z", "MIL", "ORL"], ["0022600036", "2026-11-13", "2026-11-14T01:00:00Z", "CLE", "MIA"], ["0022600037", "2026-11-13", "2026-11-14T01:00:00Z", "ATL", "CHI"], ["0022600038", "2026-11-13", "2026-11-14T01:00:00Z", "MEM", "NOP"], ["0022600039", "2026-11-13", "2026-11-14T01:30:00Z", "UTA", "HOU"], ["0022600040", "2026-11-13", "2026-11-14T02:30:00Z", "GSW", "SAS"], ["0022600041", "2026-11-13", "2026-11-14T03:00:00Z", "POR", "SAC"], ["0022600042", "2026-11-13", "2026-11-14T03:30:00Z", "OKC", "LAC"], ["0022600231", "2026-11-14", "2026-11-15T00:00:00Z", "DEN", "NOP"], ["0022600232", "2026-11-14", "2026-11-15T00:30:00Z", "DAL", "CLE"], ["0022600233", "2026-11-14", "2026-11-15T01:00:00Z", "DET", "MIA"], ["0022600234", "2026-11-14", "2026-11-15T01:00:00Z", "BKN", "MEM"], ["0022600235", "2026-11-14", "2026-11-15T01:00:00Z", "CHI", "MIN"], ["0022600236", "2026-11-15", "2026-11-15T18:00:00Z", "IND", "PHI"], ["0022600237", "2026-11-15", "2026-11-15T21:00:00Z", "LAL", "PHX"], ["0022600238", "2026-11-15", "2026-11-15T21:30:00Z", "CHA", "LAC"], ["0022600239", "2026-11-15", "2026-11-15T22:00:00Z", "SAS", "UTA"], ["0022600240", "2026-11-15", "2026-11-15T23:00:00Z", "DAL", "BOS"], ["0022600241", "2026-11-15", "2026-11-15T23:00:00Z", "NYK", "TOR"], ["0022600242", "2026-11-15", "2026-11-16T00:00:00Z", "HOU", "WAS"], ["0022600243", "2026-11-15", "2026-11-16T01:00:00Z", "ATL", "MIL"], ["0022600244", "2026-11-15", "2026-11-16T02:00:00Z", "OKC", "SAC"], ["0022600245", "2026-11-16", "2026-11-17T00:00:00Z", "ORL", "BOS"], ["0022600246", "2026-11-16", "2026-11-17T00:00:00Z", "CHI", "CLE"], ["0022600247", "2026-11-16", "2026-11-17T00:00:00Z", "MEM", "WAS"], ["0022600248", "2026-11-16", "2026-11-17T00:30:00Z", "PHI", "BKN"], ["0022600249", "2026-11-16", "2026-11-17T00:30:00Z", "HOU", "MIA"], ["0022600250", "2026-11-16", "2026-11-17T01:00:00Z", "POR", "MIN"], ["0022600251", "2026-11-16", "2026-11-17T01:00:00Z", "GSW", "NOP"], ["0022600252", "2026-11-16", "2026-11-17T02:00:00Z", "PHX", "DEN"], ["0022600253", "2026-11-17", "2026-11-18T00:30:00Z", "NYK", "TOR"], ["0022600254", "2026-11-17", "2026-11-18T01:00:00Z", "POR", "MIN"], ["0022600255", "2026-11-17", "2026-11-18T01:00:00Z", "DET", "SAS"], ["0022600256", "2026-11-17", "2026-11-18T03:00:00Z", "CHA", "LAL"], ["0022600257", "2026-11-17", "2026-11-18T04:00:00Z", "UTA", "LAC"], ["0022600258", "2026-11-18", "2026-11-19T00:00:00Z", "MEM", "CLE"], ["0022600259", "2026-11-18", "2026-11-19T00:00:00Z", "HOU", "IND"], ["0022600260", "2026-11-18", "2026-11-19T00:00:00Z", "MIL", "MIA"], ["0022600261", "2026-11-18", "2026-11-19T00:00:00Z", "PHI", "ORL"], ["0022600262", "2026-11-18", "2026-11-19T00:30:00Z", "CHI", "BKN"], ["0022600263", "2026-11-18", "2026-11-19T00:30:00Z", "WAS", "TOR"], ["0022600264", "2026-11-18", "2026-11-19T01:00:00Z", "DET", "NOP"], ["0022600265", "2026-11-18", "2026-11-19T01:00:00Z", "ATL", "OKC"], ["0022600266", "2026-11-18", "2026-11-19T02:00:00Z", "BOS", "DEN"], ["0022600267", "2026-11-18", "2026-11-19T02:30:00Z", "GSW", "DAL"], ["0022600268", "2026-11-18", "2026-11-19T03:00:00Z", "UTA", "LAL"], ["0022600269", "2026-11-18", "2026-11-19T03:00:00Z", "PHX", "SAC"], ["0022600270", "2026-11-19", "2026-11-20T01:00:00Z", "GSW", "MEM"], ["0022600271", "2026-11-19", "2026-11-20T01:00:00Z", "POR", "MIL"], ["0022600272", "2026-11-19", "2026-11-20T01:00:00Z", "NYK", "MIN"], ["0022600273", "2026-11-19", "2026-11-20T01:00:00Z", "LAC", "SAS"], ["0022600043", "2026-11-20", "2026-11-21T00:00:00Z", "CHA", "ATL"], ["0022600044", "2026-11-20", "2026-11-21T00:30:00Z", "ORL", "BKN"], ["0022600045", "2026-11-20", "2026-11-21T00:30:00Z", "IND", "CLE"], ["0022600046", "2026-11-20", "2026-11-21T00:30:00Z", "TOR", "DET"], ["0022600047", "2026-11-20", "2026-11-21T01:00:00Z", "WAS", "CHI"], ["0022600048", "2026-11-20", "2026-11-21T01:00:00Z", "NOP", "OKC"], ["0022600049", "2026-11-20", "2026-11-21T02:30:00Z", "PHX", "UTA"], ["0022600050", "2026-11-20", "2026-11-21T03:00:00Z", "HOU", "DEN"], ["0022600051", "2026-11-20", "2026-11-21T03:00:00Z", "SAC", "LAL"], ["0022600274", "2026-11-21", "2026-11-21T18:00:00Z", "MIL", "PHI"], ["0022600275", "2026-11-21", "2026-11-22T00:30:00Z", "POR", "NYK"], ["0022600276", "2026-11-21", "2026-11-22T01:00:00Z", "LAC", "DAL"], ["0022600277", "2026-11-21", "2026-11-22T01:00:00Z", "MEM", "MIN"], ["0022600278", "2026-11-21", "2026-11-22T01:00:00Z", "NOP", "SAS"], ["0022600279", "2026-11-21", "2026-11-22T03:00:00Z", "BOS", "SAC"], ["0022600280", "2026-11-22", "2026-11-22T20:30:00Z", "DET", "ATL"], ["0022600281", "2026-11-22", "2026-11-22T23:00:00Z", "OKC", "MIA"], ["0022600282", "2026-11-22", "2026-11-23T00:00:00Z", "ORL", "WAS"], ["0022600283", "2026-11-22", "2026-11-23T00:00:00Z", "DEN", "CHI"], ["0022600284", "2026-11-22", "2026-11-23T00:00:00Z", "DAL", "UTA"], ["0022600285", "2026-11-22", "2026-11-23T01:00:00Z", "IND", "NYK"], ["0022600286", "2026-11-22", "2026-11-23T01:30:00Z", "BOS", "GSW"], ["0022600287", "2026-11-23", "2026-11-24T00:00:00Z", "MEM", "CHA"], ["0022600288", "2026-11-23", "2026-11-24T00:00:00Z", "POR", "PHI"], ["0022600289", "2026-11-23", "2026-11-24T00:30:00Z", "OKC", "IND"], ["0022600290", "2026-11-23", "2026-11-24T00:30:00Z", "MIL", "TOR"], ["0022600291", "2026-11-23", "2026-11-24T00:30:00Z", "BKN", "MIN"], ["0022600292", "2026-11-23", "2026-11-24T01:00:00Z", "CLE", "CHI"], ["0022600293", "2026-11-23", "2026-11-24T01:00:00Z", "PHX", "NOP"], ["0022600294", "2026-11-23", "2026-11-24T01:30:00Z", "LAC", "HOU"], ["0022600295", "2026-11-23", "2026-11-24T03:00:00Z", "UTA", "LAL"], ["0022600296", "2026-11-23", "2026-11-24T03:00:00Z", "SAS", "SAC"], ["0022600052", "2026-11-24", "2026-11-25T00:00:00Z", "DET", "ORL"], ["0022600053", "2026-11-24", "2026-11-25T01:00:00Z", "BOS", "WAS"], ["0022600054", "2026-11-24", "2026-11-25T03:00:00Z", "DAL", "DEN"], ["0022600055", "2026-11-25", "2026-11-25T22:00:00Z", "MIA", "PHI"], ["0022600056", "2026-11-25", "2026-11-26T00:00:00Z", "CHI", "CHA"], ["0022600057", "2026-11-25", "2026-11-26T00:30:00Z", "CLE", "NYK"], ["0022600058", "2026-11-25", "2026-11-26T00:30:00Z", "MIN", "OKC"], ["0022600059", "2026-11-25", "2026-11-26T01:00:00Z", "LAC", "MEM"], ["0022600060", "2026-11-25", "2026-11-26T01:00:00Z", "BKN", "MIL"], ["0022600061", "2026-11-25", "2026-11-26T01:30:00Z", "PHX", "HOU"], ["0022600062", "2026-11-25", "2026-11-26T03:00:00Z", "SAC", "GSW"], ["0022600063", "2026-11-25", "2026-11-26T03:00:00Z", "SAS", "POR"], ["0022600064", "2026-11-27", "2026-11-28T00:00:00Z", "MIA", "NYK"], ["0022600065", "2026-11-27", "2026-11-28T00:30:00Z", "MIL", "DET"], ["0022600066", "2026-11-27", "2026-11-28T00:30:00Z", "PHI", "IND"], ["0022600067", "2026-11-27", "2026-11-28T00:30:00Z", "BKN", "TOR"], ["0022600068", "2026-11-27", "2026-11-28T01:00:00Z", "ATL", "BOS"], ["0022600069", "2026-11-27", "2026-11-28T01:30:00Z", "MEM", "MIN"], ["0022600070", "2026-11-27", "2026-11-28T02:00:00Z", "DAL", "PHX"], ["0022600071", "2026-11-27", "2026-11-28T02:30:00Z", "LAL", "SAS"], ["0022600072", "2026-11-27", "2026-11-28T02:30:00Z", "DEN", "UTA"], ["0022600073", "2026-11-27", "2026-11-28T02:30:00Z", "NOP", "LAC"], ["0022600074", "2026-11-27", "2026-11-28T02:30:00Z", "GSW", "POR"], ["0022600297", "2026-11-28", "2026-11-28T22:00:00Z", "ORL", "WAS"], ["0022600298", "2026-11-28", "2026-11-28T23:00:00Z", "BKN", "CHA"], ["0022600299", "2026-11-28", "2026-11-29T01:00:00Z", "IND", "CHI"], ["0022600300", "2026-11-28", "2026-11-29T01:00:00Z", "OKC", "MIL"], ["0022600301", "2026-11-28", "2026-11-29T01:30:00Z", "PHI", "HOU"], ["0022600302", "2026-11-29", "2026-11-29T21:00:00Z", "LAL", "MEM"], ["0022600303", "2026-11-29", "2026-11-29T21:00:00Z", "BOS", "SAS"], ["0022600304", "2026-11-29", "2026-11-29T22:00:00Z", "PHX", "UTA"], ["0022600305", "2026-11-29", "2026-11-29T23:00:00Z", "MIA", "CLE"], ["0022600306", "2026-11-29", "2026-11-29T23:00:00Z", "ORL", "DET"], ["0022600307", "2026-11-29", "2026-11-29T23:00:00Z", "ATL", "NYK"], ["0022600308", "2026-11-29", "2026-11-29T23:00:00Z", "DEN", "TOR"], ["0022600309", "2026-11-29", "2026-11-29T23:00:00Z", "NOP", "POR"], ["0022600310", "2026-11-29", "2026-11-30T01:30:00Z", "LAC", "GSW"], ["0022600311", "2026-11-29", "2026-11-30T02:00:00Z", "MIN", "SAC"], ["0022600312", "2026-11-30", "2026-12-01T00:00:00Z", "WAS", "CHA"], ["0022600313", "2026-11-30", "2026-12-01T00:00:00Z", "DEN", "DET"], ["0022600314", "2026-11-30", "2026-12-01T00:30:00Z", "OKC", "BKN"], ["0022600315", "2026-11-30", "2026-12-01T00:30:00Z", "LAL", "HOU"], ["0022600316", "2026-11-30", "2026-12-01T01:00:00Z", "BOS", "DAL"], ["0022600317", "2026-11-30", "2026-12-01T01:00:00Z", "SAS", "MIL"], ["0022600318", "2026-11-30", "2026-12-01T03:00:00Z", "NOP", "SAC"], ["0022600319", "2026-12-01", "2026-12-02T00:00:00Z", "IND", "CLE"], ["0022600320", "2026-12-01", "2026-12-02T00:00:00Z", "MEM", "PHI"], ["0022600321", "2026-12-01", "2026-12-02T00:30:00Z", "ATL", "MIA"], ["0022600322", "2026-12-01", "2026-12-02T01:00:00Z", "NYK", "CHI"], ["0022600323", "2026-12-01", "2026-12-02T01:30:00Z", "TOR", "HOU"], ["0022600324", "2026-12-01", "2026-12-02T02:00:00Z", "LAC", "PHX"], ["0022600325", "2026-12-01", "2026-12-02T03:00:00Z", "MIN", "POR"], ["0022600326", "2026-12-01", "2026-12-02T04:00:00Z", "UTA", "GSW"], ["0022600327", "2026-12-02", "2026-12-03T00:00:00Z", "MEM", "DET"], ["0022600328", "2026-12-02", "2026-12-03T00:00:00Z", "DEN", "PHI"], ["0022600329", "2026-12-02", "2026-12-03T00:30:00Z", "CHA", "BOS"], ["0022600330", "2026-12-02", "2026-12-03T01:00:00Z", "ORL", "DAL"], ["0022600331", "2026-12-02", "2026-12-03T01:00:00Z", "NYK", "MIL"], ["0022600332", "2026-12-02", "2026-12-03T01:00:00Z", "LAL", "NOP"], ["0022600333", "2026-12-02", "2026-12-03T01:00:00Z", "BKN", "OKC"], ["0022600334", "2026-12-02", "2026-12-03T02:00:00Z", "SAC", "PHX"], ["0022600335", "2026-12-02", "2026-12-03T03:30:00Z", "MIN", "LAC"], ["0022600336", "2026-12-03", "2026-12-04T00:00:00Z", "IND", "ATL"], ["0022600337", "2026-12-03", "2026-12-04T00:30:00Z", "WAS", "MIA"], ["0022600338", "2026-12-03", "2026-12-04T01:00:00Z", "CLE", "CHI"], ["0022600339", "2026-12-03", "2026-12-04T01:00:00Z", "TOR", "SAS"], ["0022600340", "2026-12-03", "2026-12-04T03:00:00Z", "UTA", "POR"], ["0022600341", "2026-12-12", "2026-12-12T22:00:00Z", "MIL", "MEM"], ["0022600342", "2026-12-12", "2026-12-13T00:00:00Z", "CHA", "WAS"], ["0022600343", "2026-12-12", "2026-12-13T00:30:00Z", "ORL", "PHI"], ["0022600344", "2026-12-12", "2026-12-13T01:00:00Z", "GSW", "CLE"], ["0022600345", "2026-12-12", "2026-12-13T01:30:00Z", "NYK", "MIA"], ["0022600346", "2026-12-12", "2026-12-13T02:00:00Z", "MIN", "PHX"], ["0022600347", "2026-12-12", "2026-12-13T02:30:00Z", "DEN", "UTA"], ["0022600348", "2026-12-12", "2026-12-13T03:00:00Z", "ATL", "POR"], ["0022600349", "2026-12-13", "2026-12-13T20:00:00Z", "BOS", "BKN"], ["0022600350", "2026-12-13", "2026-12-13T20:30:00Z", "TOR", "OKC"], ["0022600351", "2026-12-13", "2026-12-13T22:00:00Z", "DET", "IND"], ["0022600352", "2026-12-13", "2026-12-13T23:00:00Z", "HOU", "CHI"], ["0022600353", "2026-12-13", "2026-12-14T00:00:00Z", "LAC", "SAS"], ["0022600354", "2026-12-13", "2026-12-14T02:00:00Z", "NOP", "SAC"], ["0022600355", "2026-12-14", "2026-12-15T00:00:00Z", "TOR", "CHA"], ["0022600356", "2026-12-14", "2026-12-15T00:00:00Z", "BKN", "DET"], ["0022600357", "2026-12-14", "2026-12-15T00:00:00Z", "PHI", "ORL"], ["0022600358", "2026-12-14", "2026-12-15T00:30:00Z", "WAS", "BOS"], ["0022600359", "2026-12-14", "2026-12-15T01:00:00Z", "MIA", "CHI"], ["0022600360", "2026-12-14", "2026-12-15T01:00:00Z", "MIL", "DAL"], ["0022600361", "2026-12-14", "2026-12-15T01:00:00Z", "GSW", "MEM"], ["0022600362", "2026-12-14", "2026-12-15T01:30:00Z", "NYK", "HOU"], ["0022600363", "2026-12-14", "2026-12-15T02:00:00Z", "ATL", "PHX"], ["0022600364", "2026-12-14", "2026-12-15T02:00:00Z", "MIN", "UTA"], ["0022600365", "2026-12-14", "2026-12-15T03:00:00Z", "NOP", "LAL"], ["0022600366", "2026-12-15", "2026-12-16T01:00:00Z", "SAS", "CLE"], ["0022600367", "2026-12-15", "2026-12-16T04:00:00Z", "DEN", "POR"], ["0022600368", "2026-12-16", "2026-12-17T00:00:00Z", "WAS", "BOS"], ["0022600369", "2026-12-16", "2026-12-17T00:00:00Z", "LAC", "CHA"], ["0022600370", "2026-12-16", "2026-12-17T00:00:00Z", "PHX", "DET"], ["0022600371", "2026-12-16", "2026-12-17T00:00:00Z", "GSW", "IND"], ["0022600372", "2026-12-16", "2026-12-17T00:00:00Z", "CLE", "ORL"], ["0022600373", "2026-12-16", "2026-12-17T00:30:00Z", "DAL", "BKN"], ["0022600374", "2026-12-16", "2026-12-17T00:30:00Z", "SAS", "TOR"], ["0022600375", "2026-12-16", "2026-12-17T01:00:00Z", "UTA", "CHI"], ["0022600376", "2026-12-16", "2026-12-17T01:00:00Z", "MIA", "MEM"], ["0022600377", "2026-12-16", "2026-12-17T01:00:00Z", "NYK", "NOP"], ["0022600378", "2026-12-16", "2026-12-17T01:00:00Z", "SAC", "OKC"], ["0022600379", "2026-12-16", "2026-12-17T01:30:00Z", "MIL", "HOU"], ["0022600380", "2026-12-16", "2026-12-17T02:30:00Z", "LAL", "MIN"], ["0022600381", "2026-12-17", "2026-12-18T00:00:00Z", "POR", "IND"], ["0022600382", "2026-12-17", "2026-12-18T00:00:00Z", "DAL", "PHI"], ["0022600383", "2026-12-17", "2026-12-18T02:00:00Z", "ATL", "DEN"], ["0022600384", "2026-12-18", "2026-12-19T00:00:00Z", "OKC", "CHA"], ["0022600385", "2026-12-18", "2026-12-19T00:00:00Z", "LAC", "MIA"], ["0022600386", "2026-12-18", "2026-12-19T00:00:00Z", "NYK", "WAS"], ["0022600387", "2026-12-18", "2026-12-19T00:30:00Z", "UTA", "BOS"], ["0022600388", "2026-12-18", "2026-12-19T00:30:00Z", "ORL", "BKN"], ["0022600389", "2026-12-18", "2026-12-19T00:30:00Z", "CLE", "DET"], ["0022600390", "2026-12-18", "2026-12-19T00:30:00Z", "GSW", "TOR"], ["0022600391", "2026-12-18", "2026-12-19T01:00:00Z", "HOU", "MEM"], ["0022600392", "2026-12-18", "2026-12-19T01:00:00Z", "PHX", "MIL"], ["0022600393", "2026-12-18", "2026-12-19T01:00:00Z", "LAL", "MIN"], ["0022600394", "2026-12-18", "2026-12-19T01:00:00Z", "SAC", "NOP"], ["0022600395", "2026-12-18", "2026-12-19T01:00:00Z", "CHI", "SAS"], ["0022600396", "2026-12-19", "2026-12-19T23:00:00Z", "POR", "CHA"], ["0022600397", "2026-12-19", "2026-12-20T00:00:00Z", "ORL", "ATL"], ["0022600398", "2026-12-19", "2026-12-20T01:00:00Z", "CHI", "DAL"], ["0022600399", "2026-12-19", "2026-12-20T02:00:00Z", "LAL", "DEN"], ["0022600400", "2026-12-20", "2026-12-20T20:00:00Z", "WAS", "BKN"], ["0022600401", "2026-12-20", "2026-12-20T20:30:00Z", "HOU", "TOR"], ["0022600402", "2026-12-20", "2026-12-20T21:00:00Z", "PHX", "MEM"], ["0022600403", "2026-12-20", "2026-12-20T23:00:00Z", "UTA", "CLE"], ["0022600404", "2026-12-20", "2026-12-20T23:00:00Z", "SAC", "MIA"], ["0022600405", "2026-12-20", "2026-12-21T00:00:00Z", "OKC", "ATL"], ["0022600406", "2026-12-20", "2026-12-21T00:00:00Z", "SAS", "NOP"], ["0022600407", "2026-12-20", "2026-12-21T01:00:00Z", "DET", "BOS"], ["0022600408", "2026-12-20", "2026-12-21T01:00:00Z", "GSW", "MIL"], ["0022600409", "2026-12-20", "2026-12-21T03:00:00Z", "IND", "LAC"], ["0022600410", "2026-12-21", "2026-12-22T00:00:00Z", "PHI", "CHA"], ["0022600411", "2026-12-21", "2026-12-22T00:00:00Z", "NYK", "CLE"], ["0022600412", "2026-12-21", "2026-12-22T00:00:00Z", "SAC", "ORL"], ["0022600413", "2026-12-21", "2026-12-22T00:30:00Z", "POR", "BKN"], ["0022600414", "2026-12-21", "2026-12-22T00:30:00Z", "CHI", "MIA"], ["0022600415", "2026-12-21", "2026-12-22T01:00:00Z", "PHX", "MIN"], ["0022600416", "2026-12-21", "2026-12-22T01:00:00Z", "MEM", "NOP"], ["0022600417", "2026-12-21", "2026-12-22T01:00:00Z", "MIL", "SAS"], ["0022600418", "2026-12-21", "2026-12-22T03:00:00Z", "IND", "LAL"], ["0022600419", "2026-12-21", "2026-12-22T03:30:00Z", "DEN", "LAC"], ["0022600420", "2026-12-22", "2026-12-23T00:00:00Z", "TOR", "WAS"], ["0022600421", "2026-12-22", "2026-12-23T01:00:00Z", "DET", "OKC"], ["0022600422", "2026-12-22", "2026-12-23T03:30:00Z", "DAL", "GSW"], ["0022600423", "2026-12-23", "2026-12-24T00:00:00Z", "DET", "ATL"], ["0022600424", "2026-12-23", "2026-12-24T00:00:00Z", "CHA", "ORL"], ["0022600425", "2026-12-23", "2026-12-24T00:00:00Z", "CLE", "WAS"], ["0022600426", "2026-12-23", "2026-12-24T00:30:00Z", "POR", "BOS"], ["0022600427", "2026-12-23", "2026-12-24T00:30:00Z", "SAS", "BKN"], ["0022600428", "2026-12-23", "2026-12-24T00:30:00Z", "CHI", "MIA"], ["0022600429", "2026-12-23", "2026-12-24T00:30:00Z", "UTA", "NYK"], ["0022600430", "2026-12-23", "2026-12-24T00:30:00Z", "HOU", "PHI"], ["0022600431", "2026-12-23", "2026-12-24T01:00:00Z", "TOR", "MEM"], ["0022600432", "2026-12-23", "2026-12-24T01:00:00Z", "MIN", "MIL"], ["0022600433", "2026-12-23", "2026-12-24T01:00:00Z", "OKC", "NOP"], ["0022600434", "2026-12-23", "2026-12-24T02:00:00Z", "IND", "PHX"], ["0022600435", "2026-12-23", "2026-12-24T03:00:00Z", "DEN", "LAL"], ["0022600436", "2026-12-23", "2026-12-24T03:00:00Z", "DAL", "SAC"], ["0022600437", "2026-12-23", "2026-12-24T03:30:00Z", "GSW", "LAC"], ["0022600010", "2026-12-25", "2026-12-25T17:00:00Z", "SAS", "NYK"], ["0022600011", "2026-12-25", "2026-12-25T19:30:00Z", "MIA", "BOS"], ["0022600012", "2026-12-25", "2026-12-25T22:00:00Z", "PHI", "LAL"], ["0022600013", "2026-12-25", "2026-12-26T01:00:00Z", "OKC", "MIN"], ["0022600014", "2026-12-25", "2026-12-26T03:30:00Z", "DEN", "GSW"], ["0022600438", "2026-12-26", "2026-12-26T18:00:00Z", "POR", "WAS"], ["0022600439", "2026-12-26", "2026-12-26T20:30:00Z", "CHA", "ATL"], ["0022600440", "2026-12-26", "2026-12-26T22:00:00Z", "IND", "UTA"], ["0022600441", "2026-12-26", "2026-12-26T23:00:00Z", "NOP", "BKN"], ["0022600442", "2026-12-26", "2026-12-27T00:00:00Z", "TOR", "ORL"], ["0022600443", "2026-12-26", "2026-12-27T01:00:00Z", "DET", "CHI"], ["0022600444", "2026-12-26", "2026-12-27T01:00:00Z", "PHX", "DAL"], ["0022600445", "2026-12-26", "2026-12-27T03:30:00Z", "MEM", "LAC"], ["0022600446", "2026-12-27", "2026-12-27T20:30:00Z", "OKC", "HOU"], ["0022600447", "2026-12-27", "2026-12-27T23:00:00Z", "WAS", "CLE"], ["0022600448", "2026-12-27", "2026-12-27T23:00:00Z", "CHA", "MIA"], ["0022600449", "2026-12-27", "2026-12-27T23:00:00Z", "BKN", "NYK"], ["0022600450", "2026-12-27", "2026-12-27T23:00:00Z", "MIL", "ORL"], ["0022600451", "2026-12-27", "2026-12-27T23:00:00Z", "UTA", "SAC"], ["0022600452", "2026-12-27", "2026-12-28T00:00:00Z", "POR", "DET"], ["0022600453", "2026-12-27", "2026-12-28T00:00:00Z", "ATL", "SAS"], ["0022600454", "2026-12-27", "2026-12-28T01:00:00Z", "IND", "DEN"], ["0022600455", "2026-12-27", "2026-12-28T01:30:00Z", "MIN", "GSW"], ["0022600456", "2026-12-27", "2026-12-28T02:00:00Z", "PHI", "LAC"], ["0022600457", "2026-12-27", "2026-12-28T02:00:00Z", "MEM", "LAL"], ["0022600458", "2026-12-28", "2026-12-29T00:30:00Z", "NOP", "TOR"], ["0022600459", "2026-12-28", "2026-12-29T01:00:00Z", "CLE", "BOS"], ["0022600460", "2026-12-28", "2026-12-29T02:00:00Z", "GSW", "PHX"], ["0022600461", "2026-12-28", "2026-12-29T03:30:00Z", "MIN", "DEN"], ["0022600462", "2026-12-29", "2026-12-30T00:00:00Z", "CHI", "ATL"], ["0022600463", "2026-12-29", "2026-12-30T00:00:00Z", "ORL", "CHA"], ["0022600464", "2026-12-29", "2026-12-30T00:00:00Z", "LAC", "IND"], ["0022600465", "2026-12-29", "2026-12-30T01:00:00Z", "MIA", "DAL"], ["0022600466", "2026-12-29", "2026-12-30T01:00:00Z", "SAS", "MEM"], ["0022600467", "2026-12-29", "2026-12-30T01:00:00Z", "MIL", "OKC"], ["0022600468", "2026-12-29", "2026-12-30T03:00:00Z", "BKN", "POR"], ["0022600469", "2026-12-29", "2026-12-30T03:00:00Z", "PHI", "SAC"], ["0022600470", "2026-12-29", "2026-12-30T03:30:00Z", "HOU", "LAL"], ["0022600471", "2026-12-30", "2026-12-31T00:00:00Z", "NOP", "DET"], ["0022600472", "2026-12-30", "2026-12-31T00:30:00Z", "WAS", "TOR"], ["0022600473", "2026-12-30", "2026-12-31T01:00:00Z", "BOS", "CHI"], ["0022600474", "2026-12-30", "2026-12-31T02:00:00Z", "PHI", "PHX"], ["0022600475", "2026-12-30", "2026-12-31T02:00:00Z", "NYK", "UTA"], ["0022600476", "2026-12-30", "2026-12-31T03:00:00Z", "HOU", "GSW"], ["0022600477", "2026-12-31", "2026-12-31T18:00:00Z", "SAS", "CHA"], ["0022600478", "2026-12-31", "2026-12-31T20:00:00Z", "MIL", "ATL"], ["0022600479", "2026-12-31", "2026-12-31T20:00:00Z", "LAC", "CLE"], ["0022600480", "2026-12-31", "2026-12-31T20:00:00Z", "ORL", "IND"], ["0022600481", "2026-12-31", "2026-12-31T21:00:00Z", "DEN", "MIN"], ["0022600482", "2026-12-31", "2026-12-31T23:00:00Z", "BKN", "SAC"], ["0022600483", "2026-12-31", "2027-01-01T01:00:00Z", "LAL", "NOP"], ["0022600484", "2026-12-31", "2027-01-01T01:00:00Z", "MIA", "OKC"], ["0022600485", "2026-12-31", "2027-01-01T02:00:00Z", "NYK", "PHX"], ["0022600486", "2027-01-01", "2027-01-01T22:00:00Z", "SAS", "WAS"], ["0022600487", "2027-01-01", "2027-01-02T00:30:00Z", "ORL", "DET"], ["0022600488", "2027-01-01", "2027-01-02T00:30:00Z", "LAC", "TOR"], ["0022600489", "2027-01-01", "2027-01-02T01:00:00Z", "PHI", "MIL"], ["0022600490", "2027-01-01", "2027-01-02T01:30:00Z", "DAL", "HOU"], ["0022600491", "2027-01-01", "2027-01-02T02:30:00Z", "BOS", "UTA"], ["0022600492", "2027-01-02", "2027-01-02T18:00:00Z", "CLE", "CHA"], ["0022600493", "2027-01-02", "2027-01-02T22:00:00Z", "NYK", "DEN"], ["0022600494", "2027-01-02", "2027-01-03T00:00:00Z", "MIN", "IND"], ["0022600495", "2027-01-02", "2027-01-03T00:00:00Z", "MIA", "NOP"], ["0022600496", "2027-01-02", "2027-01-03T00:30:00Z", "DAL", "ATL"], ["0022600497", "2027-01-02", "2027-01-03T01:00:00Z", "LAL", "CHI"], ["0022600498", "2027-01-02", "2027-01-03T01:00:00Z", "UTA", "OKC"], ["0022600499", "2027-01-02", "2027-01-03T01:30:00Z", "BKN", "GSW"], ["0022600500", "2027-01-02", "2027-01-03T02:00:00Z", "SAC", "PHX"], ["0022600501", "2027-01-02", "2027-01-03T03:00:00Z", "BOS", "POR"], ["0022600502", "2027-01-03", "2027-01-03T22:00:00Z", "DET", "DEN"], ["0022600503", "2027-01-03", "2027-01-03T22:30:00Z", "CHA", "MIL"], ["0022600504", "2027-01-03", "2027-01-03T23:00:00Z", "MEM", "ORL"], ["0022600505", "2027-01-03", "2027-01-04T00:00:00Z", "LAL", "TOR"], ["0022600506", "2027-01-03", "2027-01-04T00:00:00Z", "LAC", "WAS"], ["0022600507", "2027-01-03", "2027-01-04T00:00:00Z", "CLE", "HOU"], ["0022600508", "2027-01-03", "2027-01-04T00:00:00Z", "SAS", "MIN"], ["0022600509", "2027-01-03", "2027-01-04T01:00:00Z", "SAC", "OKC"], ["0022600510", "2027-01-04", "2027-01-05T00:00:00Z", "CHI", "IND"], ["0022600511", "2027-01-04", "2027-01-05T00:00:00Z", "ATL", "PHI"], ["0022600512", "2027-01-04", "2027-01-05T01:00:00Z", "DAL", "NOP"], ["0022600513", "2027-01-04", "2027-01-05T02:00:00Z", "BOS", "PHX"], ["0022600514", "2027-01-04", "2027-01-05T02:00:00Z", "BKN", "UTA"], ["0022600515", "2027-01-04", "2027-01-05T03:00:00Z", "NYK", "POR"], ["0022600516", "2027-01-05", "2027-01-06T00:00:00Z", "ATL", "CHA"], ["0022600517", "2027-01-05", "2027-01-06T00:00:00Z", "TOR", "CLE"], ["0022600518", "2027-01-05", "2027-01-06T00:00:00Z", "LAC", "ORL"], ["0022600519", "2027-01-05", "2027-01-06T00:00:00Z", "LAL", "WAS"], ["0022600520", "2027-01-05", "2027-01-06T00:30:00Z", "MEM", "MIA"], ["0022600521", "2027-01-05", "2027-01-06T01:00:00Z", "MIL", "CHI"], ["0022600522", "2027-01-05", "2027-01-06T01:00:00Z", "MIN", "HOU"], ["0022600523", "2027-01-05", "2027-01-06T03:00:00Z", "PHX", "DEN"], ["0022600524", "2027-01-05", "2027-01-06T03:00:00Z", "DET", "SAC"], ["0022600525", "2027-01-06", "2027-01-07T00:30:00Z", "UTA", "BKN"], ["0022600526", "2027-01-06", "2027-01-07T00:30:00Z", "OKC", "PHI"], ["0022600527", "2027-01-06", "2027-01-07T01:00:00Z", "POR", "NOP"], ["0022600528", "2027-01-06", "2027-01-07T01:00:00Z", "IND", "SAS"], ["0022600529", "2027-01-06", "2027-01-07T03:00:00Z", "NYK", "GSW"], ["0022600530", "2027-01-07", "2027-01-08T00:00:00Z", "IND", "ATL"], ["0022600531", "2027-01-07", "2027-01-08T00:00:00Z", "DEN", "CHA"], ["0022600532", "2027-01-07", "2027-01-08T00:00:00Z", "CLE", "ORL"], ["0022600533", "2027-01-07", "2027-01-08T00:00:00Z", "OKC", "WAS"], ["0022600534", "2027-01-07", "2027-01-08T00:30:00Z", "MIA", "BKN"], ["0022600535", "2027-01-07", "2027-01-08T00:30:00Z", "MIN", "TOR"], ["0022600536", "2027-01-07", "2027-01-08T01:00:00Z", "POR", "DAL"], ["0022600537", "2027-01-07", "2027-01-08T01:00:00Z", "LAC", "MIL"], ["0022600538", "2027-01-07", "2027-01-08T01:30:00Z", "MEM", "HOU"], ["0022600539", "2027-01-07", "2027-01-08T03:00:00Z", "DET", "GSW"], ["0022600540", "2027-01-07", "2027-01-08T03:00:00Z", "BOS", "LAL"], ["0022600541", "2027-01-07", "2027-01-08T03:00:00Z", "CHI", "SAC"], ["0022600542", "2027-01-08", "2027-01-09T00:00:00Z", "MIA", "PHI"], ["0022600543", "2027-01-08", "2027-01-09T00:00:00Z", "MIN", "WAS"], ["0022600544", "2027-01-08", "2027-01-09T00:30:00Z", "UTA", "TOR"], ["0022600545", "2027-01-08", "2027-01-09T01:00:00Z", "ORL", "NOP"], ["0022600546", "2027-01-08", "2027-01-09T01:00:00Z", "MEM", "SAS"], ["0022600547", "2027-01-08", "2027-01-09T02:30:00Z", "PHX", "DAL"], ["0022600548", "2027-01-08", "2027-01-09T03:00:00Z", "DET", "LAL"], ["0022600549", "2027-01-08", "2027-01-09T03:00:00Z", "NYK", "SAC"], ["0022600550", "2027-01-09", "2027-01-09T22:00:00Z", "DEN", "CLE"], ["0022600551", "2027-01-09", "2027-01-09T23:00:00Z", "HOU", "BKN"], ["0022600552", "2027-01-09", "2027-01-10T00:00:00Z", "MIL", "IND"], ["0022600553", "2027-01-09", "2027-01-10T01:30:00Z", "CHI", "GSW"], ["0022600554", "2027-01-09", "2027-01-10T03:00:00Z", "CHA", "POR"], ["0022600555", "2027-01-09", "2027-01-10T03:30:00Z", "BOS", "LAC"], ["0022600556", "2027-01-10", "2027-01-10T20:00:00Z", "SAS", "ATL"], ["0022600557", "2027-01-10", "2027-01-10T23:00:00Z", "UTA", "DET"], ["0022600558", "2027-01-10", "2027-01-10T23:00:00Z", "NOP", "MIA"], ["0022600559", "2027-01-10", "2027-01-10T23:00:00Z", "OKC", "ORL"], ["0022600560", "2027-01-10", "2027-01-10T23:00:00Z", "PHI", "TOR"], ["0022600561", "2027-01-10", "2027-01-10T23:00:00Z", "DAL", "MEM"], ["0022600562", "2027-01-10", "2027-01-11T00:00:00Z", "CHI", "PHX"], ["0022600563", "2027-01-10", "2027-01-11T02:00:00Z", "CHA", "SAC"], ["0022600564", "2027-01-11", "2027-01-12T00:00:00Z", "BKN", "IND"], ["0022600565", "2027-01-11", "2027-01-12T00:00:00Z", "ATL", "WAS"], ["0022600566", "2027-01-11", "2027-01-12T00:30:00Z", "HOU", "BOS"], ["0022600567", "2027-01-11", "2027-01-12T00:30:00Z", "DEN", "NYK"], ["0022600568", "2027-01-11", "2027-01-12T01:00:00Z", "CLE", "MIN"], ["0022600569", "2027-01-11", "2027-01-12T03:00:00Z", "LAL", "LAC"], ["0022600570", "2027-01-12", "2027-01-13T00:30:00Z", "BKN", "MIA"], ["0022600571", "2027-01-12", "2027-01-13T00:30:00Z", "DET", "TOR"], ["0022600572", "2027-01-12", "2027-01-13T01:00:00Z", "WAS", "PHI"], ["0022600573", "2027-01-12", "2027-01-13T01:00:00Z", "DAL", "MEM"], ["0022600574", "2027-01-12", "2027-01-13T01:00:00Z", "DEN", "MIL"], ["0022600575", "2027-01-12", "2027-01-13T02:00:00Z", "CHI", "UTA"], ["0022600576", "2027-01-12", "2027-01-13T03:00:00Z", "ORL", "POR"], ["0022600577", "2027-01-12", "2027-01-13T04:00:00Z", "SAC", "GSW"], ["0022600578", "2027-01-13", "2027-01-14T00:00:00Z", "CLE", "ATL"], ["0022600579", "2027-01-13", "2027-01-14T00:00:00Z", "NYK", "BOS"], ["0022600580", "2027-01-13", "2027-01-14T00:00:00Z", "MIL", "IND"], ["0022600581", "2027-01-13", "2027-01-14T00:30:00Z", "PHX", "TOR"], ["0022600582", "2027-01-13", "2027-01-14T02:30:00Z", "HOU", "OKC"], ["0022600583", "2027-01-13", "2027-01-14T03:00:00Z", "CHA", "GSW"], ["0022600584", "2027-01-13", "2027-01-14T03:00:00Z", "LAL", "POR"], ["0022600075", "2027-01-14", "2027-01-14T19:00:00Z", "NOP", "SAS"], ["0022600585", "2027-01-14", "2027-01-15T00:00:00Z", "DAL", "DET"], ["0022600586", "2027-01-14", "2027-01-15T00:00:00Z", "BKN", "PHI"], ["0022600587", "2027-01-14", "2027-01-15T00:30:00Z", "MIA", "NYK"], ["0022600588", "2027-01-14", "2027-01-15T01:00:00Z", "MIN", "CHI"], ["0022600589", "2027-01-14", "2027-01-15T02:00:00Z", "MEM", "DEN"], ["0022600590", "2027-01-14", "2027-01-15T02:00:00Z", "CHA", "UTA"], ["0022600591", "2027-01-14", "2027-01-15T03:00:00Z", "ORL", "LAL"], ["0022600592", "2027-01-14", "2027-01-15T03:00:00Z", "LAC", "SAC"], ["0022600593", "2027-01-15", "2027-01-16T00:00:00Z", "GSW", "ATL"], ["0022600594", "2027-01-15", "2027-01-16T00:00:00Z", "PHX", "IND"], ["0022600595", "2027-01-15", "2027-01-16T00:30:00Z", "MIA", "TOR"], ["0022600596", "2027-01-15", "2027-01-16T01:00:00Z", "CLE", "MIL"], ["0022600597", "2027-01-15", "2027-01-16T01:00:00Z", "UTA", "OKC"], ["0022600598", "2027-01-15", "2027-01-16T01:30:00Z", "WAS", "HOU"], ["0022600599", "2027-01-15", "2027-01-16T03:00:00Z", "SAC", "POR"], ["0022600600", "2027-01-15", "2027-01-16T03:30:00Z", "ORL", "LAC"], ["0022600601", "2027-01-16", "2027-01-16T17:30:00Z", "MIN", "PHI"], ["0022600602", "2027-01-16", "2027-01-17T00:00:00Z", "BKN", "BOS"], ["0022600603", "2027-01-16", "2027-01-17T00:30:00Z", "DAL", "NYK"], ["0022600604", "2027-01-16", "2027-01-17T01:00:00Z", "CLE", "MEM"], ["0022600605", "2027-01-16", "2027-01-17T01:30:00Z", "DET", "HOU"], ["0022600606", "2027-01-16", "2027-01-17T02:00:00Z", "CHA", "DEN"], ["0022600076", "2027-01-17", "2027-01-17T15:30:00Z", "SAS", "NOP"], ["0022600607", "2027-01-17", "2027-01-17T18:00:00Z", "IND", "WAS"], ["0022600608", "2027-01-17", "2027-01-17T20:30:00Z", "TOR", "CHI"], ["0022600609", "2027-01-17", "2027-01-17T20:30:00Z", "POR", "OKC"], ["0022600610", "2027-01-17", "2027-01-17T22:00:00Z", "SAC", "UTA"], ["0022600611", "2027-01-17", "2027-01-17T23:00:00Z", "GSW", "MIA"], ["0022600612", "2027-01-17", "2027-01-18T01:00:00Z", "ORL", "DEN"], ["0022600613", "2027-01-17", "2027-01-18T02:00:00Z", "MIL", "LAL"], ["0022600077", "2027-01-18", "2027-01-18T17:00:00Z", "DET", "CLE"], ["0022600078", "2027-01-18", "2027-01-18T19:30:00Z", "PHI", "ATL"], ["0022600614", "2027-01-18", "2027-01-18T20:00:00Z", "BOS", "WAS"], ["0022600079", "2027-01-18", "2027-01-18T22:00:00Z", "MIN", "NYK"], ["0022600080", "2027-01-18", "2027-01-19T00:30:00Z", "HOU", "MEM"], ["0022600615", "2027-01-18", "2027-01-19T01:00:00Z", "OKC", "DAL"], ["0022600616", "2027-01-18", "2027-01-19T03:30:00Z", "PHX", "LAC"], ["0022600617", "2027-01-19", "2027-01-20T00:00:00Z", "GSW", "ORL"], ["0022600618", "2027-01-19", "2027-01-20T00:00:00Z", "IND", "PHI"], ["0022600619", "2027-01-19", "2027-01-20T00:00:00Z", "CHI", "TOR"], ["0022600620", "2027-01-19", "2027-01-20T00:30:00Z", "POR", "MIA"], ["0022600621", "2027-01-19", "2027-01-20T01:00:00Z", "CHA", "DAL"], ["0022600622", "2027-01-19", "2027-01-20T03:00:00Z", "UTA", "DEN"], ["0022600623", "2027-01-19", "2027-01-20T03:00:00Z", "LAL", "SAC"], ["0022600624", "2027-01-20", "2027-01-21T00:00:00Z", "POR", "ATL"], ["0022600625", "2027-01-20", "2027-01-21T00:00:00Z", "CHI", "BKN"], ["0022600626", "2027-01-20", "2027-01-21T00:30:00Z", "IND", "BOS"], ["0022600627", "2027-01-20", "2027-01-21T00:30:00Z", "TOR", "NYK"], ["0022600628", "2027-01-20", "2027-01-21T01:00:00Z", "HOU", "MIN"], ["0022600629", "2027-01-20", "2027-01-21T01:00:00Z", "OKC", "NOP"], ["0022600630", "2027-01-20", "2027-01-21T02:00:00Z", "MEM", "PHX"], ["0022600631", "2027-01-20", "2027-01-21T02:00:00Z", "LAC", "UTA"], ["0022600632", "2027-01-20", "2027-01-21T02:30:00Z", "MIA", "SAS"], ["0022600633", "2027-01-20", "2027-01-21T03:00:00Z", "MIL", "SAC"], ["0022600634", "2027-01-21", "2027-01-22T00:30:00Z", "PHI", "BOS"], ["0022600635", "2027-01-21", "2027-01-22T00:30:00Z", "CLE", "BKN"], ["0022600636", "2027-01-21", "2027-01-22T02:00:00Z", "WAS", "DEN"], ["0022600637", "2027-01-21", "2027-01-22T03:00:00Z", "LAL", "GSW"], ["0022600638", "2027-01-22", "2027-01-23T00:00:00Z", "NYK", "ATL"], ["0022600639", "2027-01-22", "2027-01-23T00:00:00Z", "HOU", "CHA"], ["0022600640", "2027-01-22", "2027-01-23T00:00:00Z", "POR", "ORL"], ["0022600641", "2027-01-22", "2027-01-23T00:30:00Z", "IND", "DET"], ["0022600642", "2027-01-22", "2027-01-23T01:00:00Z", "DAL", "NOP"], ["0022600643", "2027-01-22", "2027-01-23T01:00:00Z", "MEM", "OKC"], ["0022600644", "2027-01-22", "2027-01-23T02:00:00Z", "UTA", "PHX"], ["0022600645", "2027-01-22", "2027-01-23T02:30:00Z", "MIN", "SAS"], ["0022600646", "2027-01-22", "2027-01-23T03:00:00Z", "MIL", "GSW"], ["0022600647", "2027-01-22", "2027-01-23T03:00:00Z", "SAC", "LAL"], ["0022600648", "2027-01-22", "2027-01-23T03:30:00Z", "WAS", "LAC"], ["0022600649", "2027-01-23", "2027-01-23T22:00:00Z", "PHI", "CHI"], ["0022600650", "2027-01-23", "2027-01-23T23:00:00Z", "TOR", "BKN"], ["0022600651", "2027-01-23", "2027-01-24T00:00:00Z", "CHA", "BOS"], ["0022600652", "2027-01-23", "2027-01-24T01:00:00Z", "ATL", "MIA"], ["0022600653", "2027-01-23", "2027-01-24T01:00:00Z", "CLE", "DAL"], ["0022600654", "2027-01-23", "2027-01-24T02:00:00Z", "MIL", "DEN"], ["0022600655", "2027-01-24", "2027-01-24T20:30:00Z", "POR", "SAS"], ["0022600656", "2027-01-24", "2027-01-24T21:00:00Z", "UTA", "PHX"], ["0022600657", "2027-01-24", "2027-01-24T21:00:00Z", "WAS", "LAL"], ["0022600658", "2027-01-24", "2027-01-24T23:00:00Z", "MIN", "DET"], ["0022600659", "2027-01-24", "2027-01-24T23:00:00Z", "HOU", "ORL"], ["0022600660", "2027-01-24", "2027-01-25T00:00:00Z", "LAC", "NYK"], ["0022600661", "2027-01-24", "2027-01-25T01:30:00Z", "OKC", "GSW"], ["0022600662", "2027-01-25", "2027-01-26T00:00:00Z", "TOR", "BOS"], ["0022600663", "2027-01-25", "2027-01-26T00:00:00Z", "ORL", "CHA"], ["0022600664", "2027-01-25", "2027-01-26T00:00:00Z", "LAC", "PHI"], ["0022600665", "2027-01-25", "2027-01-26T00:30:00Z", "MIA", "BKN"], ["0022600666", "2027-01-25", "2027-01-26T01:00:00Z", "DAL", "CHI"], ["0022600667", "2027-01-25", "2027-01-26T01:00:00Z", "MIN", "MEM"], ["0022600668", "2027-01-25", "2027-01-26T01:00:00Z", "CLE", "NOP"], ["0022600669", "2027-01-25", "2027-01-26T02:30:00Z", "SAC", "DEN"], ["0022600670", "2027-01-26", "2027-01-27T00:00:00Z", "ATL", "DET"], ["0022600671", "2027-01-26", "2027-01-27T00:00:00Z", "CHI", "IND"], ["0022600672", "2027-01-26", "2027-01-27T00:30:00Z", "PHX", "NYK"], ["0022600673", "2027-01-26", "2027-01-27T01:00:00Z", "HOU", "SAS"], ["0022600674", "2027-01-26", "2027-01-27T02:00:00Z", "MIL", "UTA"], ["0022600675", "2027-01-26", "2027-01-27T03:00:00Z", "WAS", "POR"], ["0022600676", "2027-01-26", "2027-01-27T04:00:00Z", "OKC", "LAL"], ["0022600677", "2027-01-27", "2027-01-28T00:00:00Z", "DET", "CLE"], ["0022600678", "2027-01-27", "2027-01-28T00:00:00Z", "SAC", "PHI"], ["0022600679", "2027-01-27", "2027-01-28T00:30:00Z", "LAC", "BOS"], ["0022600680", "2027-01-27", "2027-01-28T00:30:00Z", "PHX", "BKN"], ["0022600681", "2027-01-27", "2027-01-28T00:30:00Z", "DAL", "TOR"], ["0022600682", "2027-01-27", "2027-01-28T01:00:00Z", "CHA", "SAS"], ["0022600683", "2027-01-27", "2027-01-28T01:30:00Z", "NOP", "HOU"], ["0022600684", "2027-01-27", "2027-01-28T02:30:00Z", "DEN", "MIN"], ["0022600685", "2027-01-27", "2027-01-28T03:00:00Z", "GSW", "POR"], ["0022600686", "2027-01-28", "2027-01-29T00:00:00Z", "LAL", "IND"], ["0022600687", "2027-01-28", "2027-01-29T00:00:00Z", "ATL", "NYK"], ["0022600688", "2027-01-28", "2027-01-29T00:00:00Z", "CHI", "ORL"], ["0022600689", "2027-01-28", "2027-01-29T00:00:00Z", "SAC", "WAS"], ["0022600690", "2027-01-28", "2027-01-29T01:00:00Z", "PHI", "NOP"], ["0022600691", "2027-01-28", "2027-01-29T01:00:00Z", "MEM", "OKC"], ["0022600692", "2027-01-28", "2027-01-29T02:00:00Z", "GSW", "UTA"], ["0022600693", "2027-01-28", "2027-01-29T02:30:00Z", "MIA", "MIL"], ["0022600694", "2027-01-29", "2027-01-30T00:00:00Z", "CLE", "TOR"], ["0022600695", "2027-01-29", "2027-01-30T00:30:00Z", "PHX", "BOS"], ["0022600696", "2027-01-29", "2027-01-30T00:30:00Z", "LAC", "BKN"], ["0022600697", "2027-01-29", "2027-01-30T01:00:00Z", "DET", "DAL"], ["0022600698", "2027-01-29", "2027-01-30T01:30:00Z", "ORL", "HOU"], ["0022600699", "2027-01-29", "2027-01-30T02:30:00Z", "CHA", "MIN"], ["0022600700", "2027-01-30", "2027-01-30T17:30:00Z", "PHI", "MIA"], ["0022600701", "2027-01-30", "2027-01-30T20:00:00Z", "DEN", "OKC"], ["0022600702", "2027-01-30", "2027-01-30T22:30:00Z", "SAS", "GSW"], ["0022600703", "2027-01-30", "2027-01-31T00:00:00Z", "WAS", "IND"], ["0022600704", "2027-01-30", "2027-01-31T00:30:00Z", "NOP", "CLE"], ["0022600705", "2027-01-30", "2027-01-31T01:00:00Z", "ATL", "MIL"], ["0022600706", "2027-01-30", "2027-01-31T01:30:00Z", "LAL", "NYK"], ["0022600707", "2027-01-30", "2027-01-31T02:30:00Z", "MEM", "UTA"], ["0022600708", "2027-01-31", "2027-01-31T20:00:00Z", "SAC", "DET"], ["0022600709", "2027-01-31", "2027-01-31T23:00:00Z", "BKN", "ORL"], ["0022600710", "2027-01-31", "2027-01-31T23:00:00Z", "BOS", "TOR"], ["0022600711", "2027-01-31", "2027-01-31T23:00:00Z", "PHX", "MIN"], ["0022600712", "2027-01-31", "2027-01-31T23:00:00Z", "CHI", "OKC"], ["0022600713", "2027-01-31", "2027-02-01T00:00:00Z", "LAL", "CHA"], ["0022600714", "2027-01-31", "2027-02-01T01:00:00Z", "POR", "DEN"], ["0022600715", "2027-01-31", "2027-02-01T01:30:00Z", "HOU", "DAL"], ["0022600716", "2027-02-01", "2027-02-02T00:00:00Z", "WAS", "ATL"], ["0022600717", "2027-02-01", "2027-02-02T00:00:00Z", "NOP", "PHI"], ["0022600718", "2027-02-01", "2027-02-02T00:30:00Z", "NYK", "BKN"], ["0022600719", "2027-02-01", "2027-02-02T00:30:00Z", "MIA", "IND"], ["0022600720", "2027-02-01", "2027-02-02T01:00:00Z", "MEM", "MIL"], ["0022600721", "2027-02-01", "2027-02-02T02:00:00Z", "CLE", "UTA"], ["0022600722", "2027-02-01", "2027-02-02T03:00:00Z", "SAS", "GSW"], ["0022600723", "2027-02-02", "2027-02-03T00:00:00Z", "CHI", "DET"], ["0022600724", "2027-02-02", "2027-02-03T00:00:00Z", "NOP", "ORL"], ["0022600725", "2027-02-02", "2027-02-03T00:30:00Z", "CHA", "MIA"], ["0022600726", "2027-02-02", "2027-02-03T01:00:00Z", "LAL", "BOS"], ["0022600727", "2027-02-02", "2027-02-03T01:00:00Z", "TOR", "DAL"], ["0022600728", "2027-02-02", "2027-02-03T02:00:00Z", "OKC", "DEN"], ["0022600729", "2027-02-02", "2027-02-03T03:30:00Z", "SAS", "LAC"], ["0022600730", "2027-02-02", "2027-02-03T04:00:00Z", "MIN", "POR"], ["0022600731", "2027-02-03", "2027-02-04T00:00:00Z", "NYK", "DET"], ["0022600732", "2027-02-03", "2027-02-04T00:00:00Z", "ATL", "IND"], ["0022600733", "2027-02-03", "2027-02-04T01:00:00Z", "PHI", "MEM"], ["0022600734", "2027-02-03", "2027-02-04T02:00:00Z", "CLE", "PHX"], ["0022600735", "2027-02-03", "2027-02-04T02:30:00Z", "UTA", "HOU"], ["0022600736", "2027-02-03", "2027-02-04T03:30:00Z", "GSW", "LAC"], ["0022600737", "2027-02-04", "2027-02-05T00:00:00Z", "NOP", "WAS"], ["0022600738", "2027-02-04", "2027-02-05T00:30:00Z", "LAL", "BKN"], ["0022600739", "2027-02-04", "2027-02-05T00:30:00Z", "BOS", "CHA"], ["0022600740", "2027-02-04", "2027-02-05T00:30:00Z", "MIL", "MIA"], ["0022600741", "2027-02-04", "2027-02-05T00:30:00Z", "TOR", "NYK"], ["0022600742", "2027-02-04", "2027-02-05T01:00:00Z", "OKC", "CHI"], ["0022600743", "2027-02-04", "2027-02-05T01:00:00Z", "ORL", "SAS"], ["0022600744", "2027-02-04", "2027-02-05T03:00:00Z", "DAL", "DEN"], ["0022600745", "2027-02-04", "2027-02-05T03:00:00Z", "CLE", "POR"], ["0022600746", "2027-02-04", "2027-02-05T03:00:00Z", "MIN", "SAC"], ["0022600747", "2027-02-05", "2027-02-06T00:00:00Z", "BOS", "ATL"], ["0022600748", "2027-02-05", "2027-02-06T00:00:00Z", "GSW", "CHA"], ["0022600749", "2027-02-05", "2027-02-06T00:00:00Z", "DET", "PHI"], ["0022600750", "2027-02-05", "2027-02-06T02:00:00Z", "LAC", "DEN"], ["0022600751", "2027-02-05", "2027-02-06T02:00:00Z", "HOU", "PHX"], ["0022600752", "2027-02-05", "2027-02-06T02:30:00Z", "IND", "OKC"], ["0022600753", "2027-02-06", "2027-02-06T20:00:00Z", "UTA", "DAL"], ["0022600754", "2027-02-06", "2027-02-06T20:00:00Z", "MIA", "MIN"], ["0022600755", "2027-02-06", "2027-02-06T22:30:00Z", "POR", "MEM"], ["0022600756", "2027-02-06", "2027-02-06T23:00:00Z", "WAS", "BKN"], ["0022600757", "2027-02-06", "2027-02-07T00:30:00Z", "ORL", "CLE"], ["0022600758", "2027-02-06", "2027-02-07T00:30:00Z", "MIL", "TOR"], ["0022600759", "2027-02-06", "2027-02-07T01:00:00Z", "NOP", "CHI"], ["0022600760", "2027-02-06", "2027-02-07T01:30:00Z", "LAL", "SAS"], ["0022600761", "2027-02-06", "2027-02-07T03:00:00Z", "PHX", "SAC"], ["0022600762", "2027-02-07", "2027-02-07T20:00:00Z", "DEN", "ATL"], ["0022600763", "2027-02-07", "2027-02-07T20:00:00Z", "GSW", "DET"], ["0022600764", "2027-02-07", "2027-02-07T20:30:00Z", "UTA", "MIN"], ["0022600765", "2027-02-07", "2027-02-07T21:30:00Z", "LAC", "DAL"], ["0022600766", "2027-02-07", "2027-02-07T23:00:00Z", "CHA", "TOR"], ["0022600767", "2027-02-07", "2027-02-08T00:00:00Z", "BOS", "PHI"], ["0022600768", "2027-02-07", "2027-02-08T02:30:00Z", "NYK", "OKC"], ["0022600769", "2027-02-07", "2027-02-08T03:30:00Z", "HOU", "SAC"], ["0022600770", "2027-02-08", "2027-02-09T00:00:00Z", "MIA", "ATL"], ["0022600771", "2027-02-08", "2027-02-09T00:00:00Z", "NOP", "IND"], ["0022600772", "2027-02-08", "2027-02-09T00:00:00Z", "BKN", "PHI"], ["0022600773", "2027-02-08", "2027-02-09T00:00:00Z", "CHI", "WAS"], ["0022600774", "2027-02-08", "2027-02-09T01:00:00Z", "POR", "MEM"], ["0022600775", "2027-02-08", "2027-02-09T01:00:00Z", "ORL", "MIL"], ["0022600776", "2027-02-08", "2027-02-09T02:30:00Z", "LAL", "PHX"], ["0022600777", "2027-02-09", "2027-02-10T00:00:00Z", "TOR", "CLE"], ["0022600778", "2027-02-09", "2027-02-10T00:30:00Z", "DEN", "BOS"], ["0022600779", "2027-02-09", "2027-02-10T00:30:00Z", "MIN", "BKN"], ["0022600780", "2027-02-09", "2027-02-10T00:30:00Z", "CHA", "NYK"], ["0022600781", "2027-02-09", "2027-02-10T01:00:00Z", "GSW", "CHI"], ["0022600782", "2027-02-09", "2027-02-10T01:00:00Z", "SAS", "DAL"], ["0022600783", "2027-02-09", "2027-02-10T01:00:00Z", "SAC", "MIL"], ["0022600784", "2027-02-09", "2027-02-10T01:00:00Z", "POR", "OKC"], ["0022600785", "2027-02-09", "2027-02-10T03:00:00Z", "HOU", "UTA"], ["0022600786", "2027-02-09", "2027-02-10T03:30:00Z", "DET", "LAC"], ["0022600787", "2027-02-10", "2027-02-11T00:00:00Z", "NOP", "ATL"], ["0022600788", "2027-02-10", "2027-02-11T00:00:00Z", "CLE", "IND"], ["0022600789", "2027-02-10", "2027-02-11T00:00:00Z", "MIA", "WAS"], ["0022600790", "2027-02-10", "2027-02-11T00:30:00Z", "GSW", "BOS"], ["0022600791", "2027-02-10", "2027-02-11T01:00:00Z", "ORL", "MEM"], ["0022600792", "2027-02-10", "2027-02-11T02:00:00Z", "DET", "PHX"], ["0022600793", "2027-02-10", "2027-02-11T03:00:00Z", "LAC", "LAL"], ["0022600794", "2027-02-11", "2027-02-12T00:00:00Z", "MIL", "CHA"], ["0022600795", "2027-02-11", "2027-02-12T00:00:00Z", "UTA", "IND"], ["0022600796", "2027-02-11", "2027-02-12T00:00:00Z", "NYK", "PHI"], ["0022600797", "2027-02-11", "2027-02-12T01:00:00Z", "POR", "DAL"], ["0022600798", "2027-02-11", "2027-02-12T01:30:00Z", "SAC", "HOU"], ["0022600799", "2027-02-11", "2027-02-12T02:00:00Z", "CHI", "DEN"], ["0022600800", "2027-02-11", "2027-02-12T02:30:00Z", "SAS", "OKC"], ["0022600801", "2027-02-12", "2027-02-13T00:00:00Z", "PHX", "ATL"], ["0022600802", "2027-02-12", "2027-02-13T00:00:00Z", "MIA", "ORL"], ["0022600803", "2027-02-12", "2027-02-13T00:00:00Z", "BKN", "WAS"], ["0022600804", "2027-02-12", "2027-02-13T00:30:00Z", "CLE", "TOR"], ["0022600805", "2027-02-12", "2027-02-13T01:00:00Z", "MIN", "BOS"], ["0022600806", "2027-02-12", "2027-02-13T01:00:00Z", "LAC", "MEM"], ["0022600807", "2027-02-12", "2027-02-13T01:00:00Z", "HOU", "NOP"], ["0022600808", "2027-02-12", "2027-02-13T03:30:00Z", "DEN", "LAL"], ["0022600809", "2027-02-13", "2027-02-13T19:00:00Z", "SAC", "IND"], ["0022600810", "2027-02-13", "2027-02-13T20:00:00Z", "DAL", "CHA"], ["0022600811", "2027-02-13", "2027-02-13T20:30:00Z", "DET", "POR"], ["0022600812", "2027-02-13", "2027-02-13T22:30:00Z", "PHI", "OKC"], ["0022600813", "2027-02-13", "2027-02-14T00:00:00Z", "SAS", "ORL"], ["0022600814", "2027-02-13", "2027-02-14T00:00:00Z", "MIL", "WAS"], ["0022600815", "2027-02-13", "2027-02-14T01:30:00Z", "GSW", "NYK"], ["0022600816", "2027-02-14", "2027-02-14T18:00:00Z", "SAC", "ATL"], ["0022600817", "2027-02-14", "2027-02-14T18:00:00Z", "TOR", "BOS"], ["0022600818", "2027-02-14", "2027-02-14T18:00:00Z", "PHX", "CLE"], ["0022600819", "2027-02-14", "2027-02-14T18:00:00Z", "BKN", "MIA"], ["0022600820", "2027-02-14", "2027-02-14T19:00:00Z", "DEN", "HOU"], ["0022600821", "2027-02-14", "2027-02-14T19:00:00Z", "LAC", "NOP"], ["0022600822", "2027-02-14", "2027-02-14T20:30:00Z", "CHI", "POR"], ["0022600081", "2027-02-15", "2027-02-15T17:00:00Z", "MIN", "CHA"], ["0022600082", "2027-02-15", "2027-02-15T19:30:00Z", "PHI", "DAL"], ["0022600083", "2027-02-15", "2027-02-15T22:00:00Z", "SAS", "MIA"], ["0022600823", "2027-02-15", "2027-02-16T00:00:00Z", "PHX", "WAS"], ["0022600084", "2027-02-15", "2027-02-16T00:30:00Z", "IND", "GSW"], ["0022600824", "2027-02-15", "2027-02-16T01:00:00Z", "NYK", "MEM"], ["0022600825", "2027-02-15", "2027-02-16T01:00:00Z", "ORL", "OKC"], ["0022600826", "2027-02-15", "2027-02-16T02:00:00Z", "DET", "UTA"], ["0022600827", "2027-02-16", "2027-02-17T00:00:00Z", "MIL", "CLE"], ["0022600828", "2027-02-16", "2027-02-17T01:00:00Z", "TOR", "ATL"], ["0022600829", "2027-02-16", "2027-02-17T03:00:00Z", "CHI", "LAL"], ["0022600830", "2027-02-16", "2027-02-17T03:00:00Z", "NOP", "POR"], ["0022600831", "2027-02-16", "2027-02-17T04:00:00Z", "HOU", "LAC"], ["0022600832", "2027-02-17", "2027-02-18T00:00:00Z", "TOR", "CHA"], ["0022600833", "2027-02-17", "2027-02-18T00:00:00Z", "MIL", "CLE"], ["0022600834", "2027-02-17", "2027-02-18T00:00:00Z", "NYK", "DET"], ["0022600835", "2027-02-17", "2027-02-18T00:00:00Z", "DAL", "ORL"], ["0022600836", "2027-02-17", "2027-02-18T00:00:00Z", "PHX", "PHI"], ["0022600837", "2027-02-17", "2027-02-18T00:00:00Z", "MIA", "WAS"], ["0022600838", "2027-02-17", "2027-02-18T00:30:00Z", "ATL", "BKN"], ["0022600839", "2027-02-17", "2027-02-18T01:00:00Z", "SAS", "MEM"], ["0022600840", "2027-02-17", "2027-02-18T02:00:00Z", "UTA", "DEN"], ["0022600841", "2027-02-17", "2027-02-18T02:30:00Z", "BOS", "OKC"], ["0022600842", "2027-02-17", "2027-02-18T03:00:00Z", "NOP", "GSW"], ["0022600843", "2027-02-17", "2027-02-18T03:00:00Z", "IND", "SAC"], ["0022600844", "2027-02-17", "2027-02-18T03:30:00Z", "CHI", "LAC"], ["0022600845", "2027-02-18", "2027-02-19T00:30:00Z", "SAS", "MIN"], ["0022600846", "2027-02-18", "2027-02-19T01:00:00Z", "BOS", "MEM"], ["0022600847", "2027-02-18", "2027-02-19T03:00:00Z", "HOU", "LAL"], ["0022600848", "2027-02-18", "2027-02-19T03:00:00Z", "IND", "POR"], ["0022600849", "2027-02-25", "2027-02-26T00:00:00Z", "SAC", "CLE"], ["0022600850", "2027-02-25", "2027-02-26T00:00:00Z", "MIA", "DET"], ["0022600851", "2027-02-25", "2027-02-26T00:00:00Z", "CHA", "ORL"], ["0022600852", "2027-02-25", "2027-02-26T00:30:00Z", "PHI", "BKN"], ["0022600853", "2027-02-25", "2027-02-26T00:30:00Z", "OKC", "NYK"], ["0022600854", "2027-02-25", "2027-02-26T01:00:00Z", "ATL", "CHI"], ["0022600855", "2027-02-25", "2027-02-26T01:00:00Z", "WAS", "MIL"], ["0022600856", "2027-02-25", "2027-02-26T01:00:00Z", "PHX", "NOP"], ["0022600857", "2027-02-25", "2027-02-26T03:00:00Z", "DAL", "GSW"], ["0022600858", "2027-02-25", "2027-02-26T03:30:00Z", "UTA", "LAC"], ["0022600859", "2027-02-26", "2027-02-27T00:30:00Z", "CLE", "BOS"], ["0022600860", "2027-02-26", "2027-02-27T00:30:00Z", "ATL", "TOR"], ["0022600861", "2027-02-26", "2027-02-27T01:00:00Z", "IND", "MIN"], ["0022600862", "2027-02-26", "2027-02-27T01:00:00Z", "MEM", "SAS"], ["0022600863", "2027-02-26", "2027-02-27T01:30:00Z", "CHA", "HOU"], ["0022600864", "2027-02-26", "2027-02-27T03:00:00Z", "LAL", "DEN"], ["0022600865", "2027-02-26", "2027-02-27T03:00:00Z", "DAL", "POR"], ["0022600866", "2027-02-27", "2027-02-27T20:00:00Z", "WAS", "UTA"], ["0022600867", "2027-02-27", "2027-02-27T22:30:00Z", "OKC", "DET"], ["0022600868", "2027-02-27", "2027-02-28T01:00:00Z", "BKN", "CHI"], ["0022600869", "2027-02-27", "2027-02-28T01:00:00Z", "SAC", "MEM"], ["0022600870", "2027-02-27", "2027-02-28T01:30:00Z", "PHI", "NYK"], ["0022600871", "2027-02-27", "2027-02-28T02:00:00Z", "NOP", "PHX"], ["0022600872", "2027-02-28", "2027-02-28T18:00:00Z", "DEN", "SAS"], ["0022600873", "2027-02-28", "2027-02-28T20:30:00Z", "LAL", "DAL"], ["0022600874", "2027-02-28", "2027-02-28T21:00:00Z", "TOR", "IND"], ["0022600875", "2027-02-28", "2027-02-28T21:30:00Z", "ATL", "ORL"], ["0022600876", "2027-02-28", "2027-03-01T00:00:00Z", "SAC", "CHA"], ["0022600877", "2027-02-28", "2027-03-01T00:00:00Z", "BOS", "MIN"], ["0022600878", "2027-02-28", "2027-03-01T00:30:00Z", "MIL", "NYK"], ["0022600879", "2027-02-28", "2027-03-01T02:30:00Z", "MIA", "HOU"], ["0022600880", "2027-02-28", "2027-03-01T03:30:00Z", "POR", "LAC"], ["0022600881", "2027-03-01", "2027-03-02T00:00:00Z", "PHI", "CLE"], ["0022600882", "2027-03-01", "2027-03-02T00:00:00Z", "CHI", "DET"], ["0022600883", "2027-03-01", "2027-03-02T01:00:00Z", "UTA", "NOP"], ["0022600884", "2027-03-01", "2027-03-02T01:30:00Z", "GSW", "HOU"], ["0022600885", "2027-03-01", "2027-03-02T02:00:00Z", "BKN", "DEN"], ["0022600886", "2027-03-01", "2027-03-02T02:30:00Z", "WAS", "PHX"], ["0022600887", "2027-03-02", "2027-03-03T00:00:00Z", "BOS", "IND"], ["0022600888", "2027-03-02", "2027-03-03T00:00:00Z", "LAL", "ORL"], ["0022600889", "2027-03-02", "2027-03-03T00:30:00Z", "TOR", "MIA"], ["0022600890", "2027-03-02", "2027-03-03T00:30:00Z", "MEM", "NYK"], ["0022600891", "2027-03-02", "2027-03-03T01:00:00Z", "GSW", "DAL"], ["0022600892", "2027-03-02", "2027-03-03T01:00:00Z", "DET", "MIL"], ["0022600893", "2027-03-02", "2027-03-03T01:00:00Z", "MIN", "OKC"], ["0022600894", "2027-03-02", "2027-03-03T03:00:00Z", "WAS", "SAC"], ["0022600895", "2027-03-02", "2027-03-03T04:00:00Z", "LAC", "POR"], ["0022600896", "2027-03-03", "2027-03-04T00:00:00Z", "CHI", "ATL"], ["0022600897", "2027-03-03", "2027-03-04T00:00:00Z", "CHA", "PHI"], ["0022600898", "2027-03-03", "2027-03-04T00:30:00Z", "TOR", "MIA"], ["0022600899", "2027-03-03", "2027-03-04T01:00:00Z", "UTA", "MIL"], ["0022600900", "2027-03-03", "2027-03-04T01:30:00Z", "NOP", "HOU"], ["0022600901", "2027-03-03", "2027-03-04T02:00:00Z", "BKN", "PHX"], ["0022600902", "2027-03-03", "2027-03-04T03:00:00Z", "SAS", "DEN"], ["0022600903", "2027-03-04", "2027-03-05T00:00:00Z", "POR", "CLE"], ["0022600904", "2027-03-04", "2027-03-05T00:00:00Z", "IND", "ORL"], ["0022600905", "2027-03-04", "2027-03-05T00:00:00Z", "LAL", "PHI"], ["0022600906", "2027-03-04", "2027-03-05T00:30:00Z", "MEM", "ATL"], ["0022600907", "2027-03-04", "2027-03-05T02:30:00Z", "NYK", "DAL"], ["0022600908", "2027-03-04", "2027-03-05T03:00:00Z", "WAS", "GSW"], ["0022600909", "2027-03-04", "2027-03-05T03:00:00Z", "OKC", "SAC"], ["0022600910", "2027-03-04", "2027-03-05T03:30:00Z", "BKN", "LAC"], ["0022600911", "2027-03-05", "2027-03-06T00:00:00Z", "BOS", "DET"], ["0022600912", "2027-03-05", "2027-03-06T00:00:00Z", "UTA", "ORL"], ["0022600913", "2027-03-05", "2027-03-06T00:30:00Z", "POR", "TOR"], ["0022600914", "2027-03-05", "2027-03-06T01:00:00Z", "MIL", "NOP"], ["0022600915", "2027-03-05", "2027-03-06T02:00:00Z", "MIN", "PHX"], ["0022600916", "2027-03-05", "2027-03-06T02:30:00Z", "SAS", "HOU"], ["0022600917", "2027-03-06", "2027-03-06T20:00:00Z", "IND", "MIA"], ["0022600918", "2027-03-06", "2027-03-06T22:00:00Z", "CHA", "CHI"], ["0022600919", "2027-03-06", "2027-03-06T22:30:00Z", "ATL", "CLE"], ["0022600920", "2027-03-06", "2027-03-07T00:00:00Z", "UTA", "WAS"], ["0022600921", "2027-03-06", "2027-03-07T01:00:00Z", "NOP", "MEM"], ["0022600922", "2027-03-06", "2027-03-07T01:30:00Z", "OKC", "LAL"], ["0022600923", "2027-03-06", "2027-03-07T03:00:00Z", "LAC", "SAC"], ["0022600924", "2027-03-07", "2027-03-07T18:00:00Z", "PHI", "BOS"], ["0022600925", "2027-03-07", "2027-03-07T20:30:00Z", "MIN", "DEN"], ["0022600926", "2027-03-07", "2027-03-07T22:00:00Z", "POR", "CHI"], ["0022600927", "2027-03-07", "2027-03-08T00:30:00Z", "NYK", "SAS"], ["0022600928", "2027-03-07", "2027-03-08T03:00:00Z", "HOU", "GSW"], ["0022600929", "2027-03-07", "2027-03-08T03:30:00Z", "BKN", "LAL"], ["0022600930", "2027-03-08", "2027-03-09T00:00:00Z", "CHA", "IND"], ["0022600931", "2027-03-08", "2027-03-09T00:00:00Z", "UTA", "PHI"], ["0022600932", "2027-03-08", "2027-03-09T00:30:00Z", "PHX", "MIA"], ["0022600933", "2027-03-08", "2027-03-09T01:00:00Z", "ATL", "MEM"], ["0022600934", "2027-03-08", "2027-03-09T01:00:00Z", "NOP", "MIN"], ["0022600935", "2027-03-08", "2027-03-09T02:30:00Z", "DAL", "OKC"], ["0022600936", "2027-03-08", "2027-03-09T03:00:00Z", "DEN", "SAC"], ["0022600937", "2027-03-08", "2027-03-09T03:30:00Z", "HOU", "LAC"], ["0022600938", "2027-03-09", "2027-03-10T00:00:00Z", "PHX", "ORL"], ["0022600939", "2027-03-09", "2027-03-10T00:30:00Z", "MIL", "BKN"], ["0022600940", "2027-03-09", "2027-03-10T01:00:00Z", "CLE", "DET"], ["0022600941", "2027-03-09", "2027-03-10T01:00:00Z", "BOS", "CHI"], ["0022600942", "2027-03-09", "2027-03-10T01:00:00Z", "MEM", "DAL"], ["0022600943", "2027-03-09", "2027-03-10T01:00:00Z", "WAS", "SAS"], ["0022600944", "2027-03-09", "2027-03-10T04:00:00Z", "POR", "GSW"], ["0022600945", "2027-03-10", "2027-03-11T00:00:00Z", "NOP", "CHA"], ["0022600946", "2027-03-10", "2027-03-11T00:00:00Z", "ORL", "MIA"], ["0022600947", "2027-03-10", "2027-03-11T00:30:00Z", "OKC", "TOR"], ["0022600948", "2027-03-10", "2027-03-11T02:00:00Z", "HOU", "UTA"], ["0022600949", "2027-03-10", "2027-03-11T02:30:00Z", "ATL", "MIN"], ["0022600950", "2027-03-10", "2027-03-11T03:00:00Z", "DEN", "POR"], ["0022600951", "2027-03-10", "2027-03-11T03:00:00Z", "GSW", "SAC"], ["0022600952", "2027-03-10", "2027-03-11T03:30:00Z", "NYK", "LAC"], ["0022600953", "2027-03-11", "2027-03-12T00:00:00Z", "IND", "CHA"], ["0022600954", "2027-03-11", "2027-03-12T00:00:00Z", "MIL", "DET"], ["0022600955", "2027-03-11", "2027-03-12T00:30:00Z", "MEM", "BOS"], ["0022600956", "2027-03-11", "2027-03-12T00:30:00Z", "PHI", "SAS"], ["0022600957", "2027-03-11", "2027-03-12T01:00:00Z", "BKN", "ATL"], ["0022600958", "2027-03-11", "2027-03-12T01:00:00Z", "PHX", "CHI"], ["0022600959", "2027-03-11", "2027-03-12T01:00:00Z", "WAS", "DAL"], ["0022600960", "2027-03-11", "2027-03-12T03:00:00Z", "NYK", "LAL"], ["0022600961", "2027-03-11", "2027-03-12T03:30:00Z", "CLE", "LAC"], ["0022600962", "2027-03-12", "2027-03-13T00:30:00Z", "OKC", "BOS"], ["0022600963", "2027-03-12", "2027-03-13T01:00:00Z", "MIA", "MIL"], ["0022600964", "2027-03-12", "2027-03-13T01:00:00Z", "TOR", "NOP"], ["0022600965", "2027-03-12", "2027-03-13T02:30:00Z", "SAC", "UTA"], ["0022600966", "2027-03-12", "2027-03-13T03:00:00Z", "GSW", "DEN"], ["0022600967", "2027-03-12", "2027-03-13T03:00:00Z", "CLE", "LAL"], ["0022600968", "2027-03-13", "2027-03-13T20:00:00Z", "ORL", "ATL"], ["0022600969", "2027-03-13", "2027-03-13T20:00:00Z", "BKN", "DET"], ["0022600970", "2027-03-13", "2027-03-13T22:30:00Z", "IND", "HOU"], ["0022600971", "2027-03-13", "2027-03-13T23:00:00Z", "PHX", "CHA"], ["0022600972", "2027-03-13", "2027-03-14T01:00:00Z", "MEM", "CHI"], ["0022600973", "2027-03-13", "2027-03-14T01:00:00Z", "NOP", "DAL"], ["0022600974", "2027-03-13", "2027-03-14T01:30:00Z", "PHI", "MIN"], ["0022600975", "2027-03-13", "2027-03-14T03:30:00Z", "LAC", "POR"], ["0022600976", "2027-03-14", "2027-03-14T16:00:00Z", "BOS", "NYK"], ["0022600977", "2027-03-14", "2027-03-14T18:30:00Z", "SAS", "OKC"], ["0022600978", "2027-03-14", "2027-03-14T21:00:00Z", "DET", "TOR"], ["0022600979", "2027-03-14", "2027-03-14T22:00:00Z", "CLE", "SAC"], ["0022600980", "2027-03-14", "2027-03-14T23:30:00Z", "MIA", "DEN"], ["0022600981", "2027-03-14", "2027-03-15T00:00:00Z", "WAS", "MIN"], ["0022600982", "2027-03-14", "2027-03-15T02:00:00Z", "GSW", "LAL"], ["0022600983", "2027-03-15", "2027-03-15T23:00:00Z", "TOR", "PHI"], ["0022600984", "2027-03-15", "2027-03-15T23:30:00Z", "IND", "BKN"], ["0022600985", "2027-03-15", "2027-03-16T00:00:00Z", "ORL", "CHI"], ["0022600986", "2027-03-15", "2027-03-16T00:00:00Z", "PHX", "MEM"], ["0022600987", "2027-03-15", "2027-03-16T01:30:00Z", "ATL", "DAL"], ["0022600988", "2027-03-16", "2027-03-16T23:00:00Z", "NYK", "WAS"], ["0022600989", "2027-03-16", "2027-03-16T23:30:00Z", "SAC", "BOS"], ["0022600990", "2027-03-16", "2027-03-17T00:00:00Z", "DET", "IND"], ["0022600991", "2027-03-16", "2027-03-17T00:00:00Z", "ORL", "MIL"], ["0022600992", "2027-03-16", "2027-03-17T00:00:00Z", "MIN", "NOP"], ["0022600993", "2027-03-16", "2027-03-17T00:00:00Z", "CHA", "OKC"], ["0022600994", "2027-03-16", "2027-03-17T00:30:00Z", "SAS", "HOU"], ["0022600995", "2027-03-16", "2027-03-17T02:00:00Z", "CLE", "GSW"], ["0022600996", "2027-03-16", "2027-03-17T02:00:00Z", "LAL", "POR"], ["0022600997", "2027-03-16", "2027-03-17T03:00:00Z", "DEN", "LAC"], ["0022600998", "2027-03-17", "2027-03-17T23:00:00Z", "CHI", "PHI"], ["0022600999", "2027-03-17", "2027-03-17T23:30:00Z", "SAC", "NYK"], ["0022601000", "2027-03-17", "2027-03-17T23:30:00Z", "DAL", "OKC"], ["0022601001", "2027-03-17", "2027-03-18T00:30:00Z", "BKN", "HOU"], ["0022601002", "2027-03-17", "2027-03-18T01:00:00Z", "ATL", "UTA"], ["0022601003", "2027-03-17", "2027-03-18T02:00:00Z", "MEM", "GSW"], ["0022601004", "2027-03-17", "2027-03-18T02:00:00Z", "PHX", "LAL"], ["0022601005", "2027-03-17", "2027-03-18T02:00:00Z", "MIA", "POR"], ["0022601006", "2027-03-18", "2027-03-18T23:00:00Z", "TOR", "IND"], ["0022601007", "2027-03-18", "2027-03-18T23:00:00Z", "PHI", "WAS"], ["0022601008", "2027-03-18", "2027-03-18T23:30:00Z", "ORL", "BOS"], ["0022601009", "2027-03-18", "2027-03-19T00:00:00Z", "DET", "MIL"], ["0022601010", "2027-03-18", "2027-03-19T00:00:00Z", "CHA", "NOP"], ["0022601011", "2027-03-18", "2027-03-19T00:00:00Z", "BKN", "SAS"], ["0022601012", "2027-03-18", "2027-03-19T01:00:00Z", "CLE", "DEN"], ["0022601013", "2027-03-18", "2027-03-19T01:00:00Z", "MIN", "UTA"], ["0022601014", "2027-03-18", "2027-03-19T02:30:00Z", "MEM", "LAC"], ["0022601015", "2027-03-19", "2027-03-19T23:30:00Z", "SAC", "TOR"], ["0022601016", "2027-03-19", "2027-03-20T00:00:00Z", "HOU", "NOP"], ["0022601017", "2027-03-19", "2027-03-20T00:00:00Z", "DAL", "SAS"], ["0022601018", "2027-03-19", "2027-03-20T02:00:00Z", "POR", "GSW"], ["0022601019", "2027-03-19", "2027-03-20T02:00:00Z", "ATL", "LAL"], ["0022601020", "2027-03-19", "2027-03-20T02:30:00Z", "MIA", "PHX"], ["0022601021", "2027-03-20", "2027-03-20T17:00:00Z", "WAS", "NYK"], ["0022601022", "2027-03-20", "2027-03-20T23:00:00Z", "DEN", "ORL"], ["0022601023", "2027-03-20", "2027-03-20T23:30:00Z", "CHI", "CLE"], ["0022601024", "2027-03-20", "2027-03-21T00:00:00Z", "CHA", "DET"], ["0022601025", "2027-03-20", "2027-03-21T00:00:00Z", "OKC", "MEM"], ["0022601026", "2027-03-20", "2027-03-21T00:00:00Z", "IND", "MIL"], ["0022601027", "2027-03-20", "2027-03-21T02:30:00Z", "ATL", "LAC"], ["0022601028", "2027-03-21", "2027-03-21T19:00:00Z", "NOP", "BOS"], ["0022601029", "2027-03-21", "2027-03-21T19:00:00Z", "SAC", "BKN"], ["0022601030", "2027-03-21", "2027-03-21T21:00:00Z", "TOR", "UTA"], ["0022601031", "2027-03-21", "2027-03-21T21:00:00Z", "POR", "PHX"], ["0022601032", "2027-03-21", "2027-03-21T22:00:00Z", "DEN", "MIA"], ["0022601033", "2027-03-21", "2027-03-21T23:30:00Z", "SAS", "PHI"], ["0022601034", "2027-03-21", "2027-03-22T02:00:00Z", "DAL", "LAL"], ["0022601035", "2027-03-22", "2027-03-22T23:00:00Z", "HOU", "CLE"], ["0022601036", "2027-03-22", "2027-03-22T23:00:00Z", "IND", "ORL"], ["0022601037", "2027-03-22", "2027-03-23T00:00:00Z", "SAC", "CHI"], ["0022601038", "2027-03-22", "2027-03-23T00:00:00Z", "CHA", "MEM"], ["0022601039", "2027-03-22", "2027-03-23T00:00:00Z", "WAS", "MIL"], ["0022601040", "2027-03-22", "2027-03-23T01:30:00Z", "DET", "MIN"], ["0022601041", "2027-03-22", "2027-03-23T02:00:00Z", "ATL", "GSW"], ["0022601042", "2027-03-22", "2027-03-23T02:30:00Z", "DAL", "LAC"], ["0022601043", "2027-03-23", "2027-03-23T23:30:00Z", "BOS", "BKN"], ["0022601044", "2027-03-23", "2027-03-23T23:30:00Z", "NOP", "NYK"], ["0022601045", "2027-03-23", "2027-03-24T00:00:00Z", "LAL", "MIA"], ["0022601046", "2027-03-23", "2027-03-24T01:00:00Z", "PHI", "UTA"], ["0022601047", "2027-03-23", "2027-03-24T02:00:00Z", "TOR", "POR"], ["0022601048", "2027-03-23", "2027-03-24T03:00:00Z", "OKC", "PHX"], ["0022601049", "2027-03-24", "2027-03-24T23:00:00Z", "DET", "CHA"], ["0022601050", "2027-03-24", "2027-03-24T23:00:00Z", "MEM", "IND"], ["0022601051", "2027-03-24", "2027-03-24T23:00:00Z", "DEN", "WAS"], ["0022601052", "2027-03-24", "2027-03-24T23:30:00Z", "SAS", "BOS"], ["0022601053", "2027-03-24", "2027-03-24T23:30:00Z", "HOU", "NYK"], ["0022601054", "2027-03-24", "2027-03-25T00:00:00Z", "ORL", "CHI"], ["0022601055", "2027-03-24", "2027-03-25T00:00:00Z", "DAL", "MIN"], ["0022601056", "2027-03-24", "2027-03-25T02:00:00Z", "PHI", "GSW"], ["0022601057", "2027-03-24", "2027-03-25T02:00:00Z", "OKC", "PHX"], ["0022601058", "2027-03-24", "2027-03-25T02:00:00Z", "ATL", "SAC"], ["0022601059", "2027-03-24", "2027-03-25T02:30:00Z", "MIL", "LAC"], ["0022601060", "2027-03-25", "2027-03-25T23:00:00Z", "LAL", "CLE"], ["0022601061", "2027-03-25", "2027-03-25T23:00:00Z", "HOU", "DET"], ["0022601062", "2027-03-25", "2027-03-25T23:00:00Z", "SAS", "IND"], ["0022601063", "2027-03-25", "2027-03-25T23:30:00Z", "DEN", "BKN"], ["0022601064", "2027-03-25", "2027-03-25T23:30:00Z", "UTA", "MIA"], ["0022601065", "2027-03-25", "2027-03-26T00:00:00Z", "CHI", "MEM"], ["0022601066", "2027-03-25", "2027-03-26T02:00:00Z", "TOR", "GSW"], ["0022601067", "2027-03-26", "2027-03-26T23:00:00Z", "NYK", "CHA"], ["0022601068", "2027-03-26", "2027-03-27T00:00:00Z", "NOP", "DAL"], ["0022601069", "2027-03-26", "2027-03-27T00:00:00Z", "ORL", "MIN"], ["0022601070", "2027-03-26", "2027-03-27T00:00:00Z", "LAC", "OKC"], ["0022601071", "2027-03-26", "2027-03-27T02:00:00Z", "MIL", "PHX"], ["0022601072", "2027-03-26", "2027-03-27T02:00:00Z", "PHI", "POR"], ["0022601073", "2027-03-27", "2027-03-27T19:00:00Z", "SAS", "DET"], ["0022601074", "2027-03-27", "2027-03-27T23:00:00Z", "UTA", "ATL"], ["0022601075", "2027-03-27", "2027-03-27T23:00:00Z", "GSW", "WAS"], ["0022601076", "2027-03-27", "2027-03-28T00:00:00Z", "BOS", "MIA"], ["0022601077", "2027-03-27", "2027-03-28T00:00:00Z", "LAC", "CHI"], ["0022601078", "2027-03-27", "2027-03-28T02:00:00Z", "MIL", "POR"], ["0022601079", "2027-03-27", "2027-03-28T02:00:00Z", "TOR", "SAC"], ["0022601080", "2027-03-28", "2027-03-28T16:30:00Z", "NYK", "ORL"], ["0022601081", "2027-03-28", "2027-03-28T19:00:00Z", "MEM", "BKN"], ["0022601082", "2027-03-28", "2027-03-28T19:00:00Z", "LAL", "HOU"], ["0022601083", "2027-03-28", "2027-03-28T22:00:00Z", "UTA", "CHA"], ["0022601084", "2027-03-28", "2027-03-28T22:00:00Z", "DAL", "WAS"], ["0022601085", "2027-03-28", "2027-03-28T23:00:00Z", "BOS", "NOP"], ["0022601086", "2027-03-28", "2027-03-28T23:30:00Z", "OKC", "MIN"], ["0022601087", "2027-03-28", "2027-03-29T01:00:00Z", "TOR", "PHX"], ["0022601088", "2027-03-28", "2027-03-29T02:00:00Z", "PHI", "DEN"], ["0022601089", "2027-03-29", "2027-03-29T23:00:00Z", "MIN", "ATL"], ["0022601090", "2027-03-29", "2027-03-29T23:00:00Z", "MIA", "CLE"], ["0022601091", "2027-03-29", "2027-03-29T23:00:00Z", "LAC", "DET"], ["0022601092", "2027-03-29", "2027-03-29T23:30:00Z", "GSW", "BKN"], ["0022601093", "2027-03-29", "2027-03-30T00:00:00Z", "IND", "CHI"], ["0022601094", "2027-03-29", "2027-03-30T00:00:00Z", "DAL", "MIL"], ["0022601095", "2027-03-29", "2027-03-30T01:30:00Z", "PHX", "SAS"], ["0022601096", "2027-03-29", "2027-03-30T02:00:00Z", "DEN", "SAC"], ["0022601097", "2027-03-30", "2027-03-30T23:00:00Z", "MIA", "CHA"], ["0022601098", "2027-03-30", "2027-03-31T00:00:00Z", "BOS", "IND"], ["0022601099", "2027-03-30", "2027-03-31T00:00:00Z", "NYK", "ORL"], ["0022601100", "2027-03-30", "2027-03-31T00:00:00Z", "LAL", "MEM"], ["0022601101", "2027-03-30", "2027-03-31T01:00:00Z", "OKC", "UTA"], ["0022601102", "2027-03-30", "2027-03-31T03:00:00Z", "HOU", "POR"], ["0022601103", "2027-03-31", "2027-03-31T23:00:00Z", "LAC", "ATL"], ["0022601104", "2027-03-31", "2027-03-31T23:00:00Z", "TOR", "DET"], ["0022601105", "2027-03-31", "2027-03-31T23:00:00Z", "GSW", "PHI"], ["0022601106", "2027-03-31", "2027-03-31T23:00:00Z", "CHI", "WAS"], ["0022601107", "2027-03-31", "2027-03-31T23:30:00Z", "CLE", "BKN"], ["0022601108", "2027-03-31", "2027-04-01T00:00:00Z", "NOP", "MIL"], ["0022601109", "2027-03-31", "2027-04-01T00:00:00Z", "SAC", "MIN"], ["0022601110", "2027-03-31", "2027-04-01T00:00:00Z", "PHX", "SAS"], ["0022601111", "2027-03-31", "2027-04-01T01:30:00Z", "DEN", "DAL"], ["0022601112", "2027-03-31", "2027-04-01T02:00:00Z", "HOU", "POR"], ["0022601113", "2027-04-01", "2027-04-01T23:00:00Z", "BOS", "CLE"], ["0022601114", "2027-04-01", "2027-04-01T23:00:00Z", "ORL", "IND"], ["0022601115", "2027-04-01", "2027-04-01T23:30:00Z", "CHA", "NYK"], ["0022601116", "2027-04-01", "2027-04-02T01:30:00Z", "LAL", "OKC"], ["0022601117", "2027-04-02", "2027-04-02T23:00:00Z", "PHI", "WAS"], ["0022601118", "2027-04-02", "2027-04-02T23:30:00Z", "MIA", "BOS"], ["0022601119", "2027-04-02", "2027-04-02T23:30:00Z", "NYK", "BKN"], ["0022601120", "2027-04-02", "2027-04-02T23:30:00Z", "GSW", "MIN"], ["0022601121", "2027-04-02", "2027-04-03T00:00:00Z", "DET", "CHI"], ["0022601122", "2027-04-02", "2027-04-03T00:00:00Z", "SAC", "DAL"], ["0022601123", "2027-04-02", "2027-04-03T00:00:00Z", "CHA", "MIL"], ["0022601124", "2027-04-02", "2027-04-03T00:30:00Z", "ATL", "TOR"], ["0022601125", "2027-04-02", "2027-04-03T00:30:00Z", "MEM", "HOU"], ["0022601126", "2027-04-02", "2027-04-03T02:00:00Z", "DEN", "PHX"], ["0022601127", "2027-04-02", "2027-04-03T02:00:00Z", "UTA", "POR"], ["0022601128", "2027-04-02", "2027-04-03T02:30:00Z", "SAS", "LAC"], ["0022601129", "2027-04-03", "2027-04-03T21:00:00Z", "NOP", "OKC"], ["0022601130", "2027-04-03", "2027-04-03T23:00:00Z", "WAS", "ORL"], ["0022601131", "2027-04-04", "2027-04-04T17:00:00Z", "ATL", "PHI"], ["0022601132", "2027-04-04", "2027-04-04T18:00:00Z", "BKN", "MIL"], ["0022601133", "2027-04-04", "2027-04-04T19:00:00Z", "CHA", "CLE"], ["0022601134", "2027-04-04", "2027-04-04T19:00:00Z", "MIA", "DET"], ["0022601135", "2027-04-04", "2027-04-04T19:00:00Z", "MIN", "DAL"], ["0022601136", "2027-04-04", "2027-04-04T19:30:00Z", "IND", "TOR"], ["0022601137", "2027-04-04", "2027-04-04T20:00:00Z", "CHI", "HOU"], ["0022601138", "2027-04-04", "2027-04-04T20:30:00Z", "PHX", "LAC"], ["0022601139", "2027-04-04", "2027-04-04T21:00:00Z", "MEM", "DEN"], ["0022601140", "2027-04-04", "2027-04-04T21:00:00Z", "POR", "UTA"], ["0022601141", "2027-04-04", "2027-04-04T22:00:00Z", "GSW", "SAC"], ["0022601142", "2027-04-04", "2027-04-04T23:30:00Z", "BOS", "NYK"], ["0022601143", "2027-04-04", "2027-04-05T02:00:00Z", "SAS", "LAL"], ["0022601144", "2027-04-05", "2027-04-05T23:00:00Z", "BKN", "CLE"], ["0022601145", "2027-04-05", "2027-04-05T23:00:00Z", "MIA", "ORL"], ["0022601146", "2027-04-05", "2027-04-06T00:00:00Z", "WAS", "NOP"], ["0022601147", "2027-04-06", "2027-04-06T23:00:00Z", "IND", "CHA"], ["0022601148", "2027-04-06", "2027-04-06T23:30:00Z", "PHI", "TOR"], ["0022601149", "2027-04-06", "2027-04-07T00:00:00Z", "NYK", "ATL"], ["0022601150", "2027-04-06", "2027-04-07T00:00:00Z", "DET", "MEM"], ["0022601151", "2027-04-06", "2027-04-07T00:00:00Z", "CHI", "MIL"], ["0022601152", "2027-04-06", "2027-04-07T00:00:00Z", "SAC", "SAS"], ["0022601153", "2027-04-06", "2027-04-07T01:00:00Z", "NOP", "DEN"], ["0022601154", "2027-04-06", "2027-04-07T01:00:00Z", "OKC", "UTA"], ["0022601155", "2027-04-06", "2027-04-07T02:00:00Z", "DAL", "LAL"], ["0022601156", "2027-04-06", "2027-04-07T02:30:00Z", "MIN", "LAC"], ["0022601157", "2027-04-06", "2027-04-07T03:00:00Z", "PHX", "GSW"], ["0022601158", "2027-04-07", "2027-04-07T23:00:00Z", "IND", "DET"], ["0022601159", "2027-04-07", "2027-04-07T23:00:00Z", "BOS", "ORL"], ["0022601160", "2027-04-07", "2027-04-07T23:30:00Z", "BKN", "TOR"], ["0022601161", "2027-04-07", "2027-04-07T23:30:00Z", "CLE", "SAS"], ["0022601162", "2027-04-07", "2027-04-08T00:00:00Z", "CHA", "CHI"], ["0022601163", "2027-04-07", "2027-04-08T00:00:00Z", "WAS", "MEM"], ["0022601164", "2027-04-07", "2027-04-08T00:30:00Z", "SAC", "HOU"], ["0022601165", "2027-04-07", "2027-04-08T02:00:00Z", "MIN", "LAL"], ["0022601166", "2027-04-07", "2027-04-08T02:00:00Z", "DAL", "POR"], ["0022601167", "2027-04-08", "2027-04-08T23:00:00Z", "PHI", "MIA"], ["0022601168", "2027-04-08", "2027-04-09T00:00:00Z", "NYK", "MIL"], ["0022601169", "2027-04-08", "2027-04-09T01:00:00Z", "LAC", "DEN"], ["0022601170", "2027-04-08", "2027-04-09T01:00:00Z", "NOP", "UTA"], ["0022601171", "2027-04-08", "2027-04-09T01:30:00Z", "GSW", "OKC"], ["0022601172", "2027-04-09", "2027-04-09T23:00:00Z", "BOS", "ATL"], ["0022601173", "2027-04-09", "2027-04-09T23:00:00Z", "BKN", "CHA"], ["0022601174", "2027-04-09", "2027-04-09T23:00:00Z", "CLE", "IND"], ["0022601175", "2027-04-09", "2027-04-09T23:00:00Z", "DET", "NYK"], ["0022601176", "2027-04-09", "2027-04-09T23:00:00Z", "TOR", "ORL"], ["0022601177", "2027-04-09", "2027-04-10T00:00:00Z", "WAS", "MIA"], ["0022601178", "2027-04-09", "2027-04-10T00:00:00Z", "MIL", "CHI"], ["0022601179", "2027-04-09", "2027-04-10T00:00:00Z", "GSW", "OKC"], ["0022601180", "2027-04-09", "2027-04-10T00:30:00Z", "POR", "HOU"], ["0022601181", "2027-04-09", "2027-04-10T01:30:00Z", "DEN", "SAS"], ["0022601182", "2027-04-09", "2027-04-10T01:30:00Z", "LAC", "UTA"], ["0022601183", "2027-04-09", "2027-04-10T02:00:00Z", "MIN", "LAL"], ["0022601184", "2027-04-09", "2027-04-10T02:00:00Z", "MEM", "PHX"], ["0022601185", "2027-04-09", "2027-04-10T02:00:00Z", "DAL", "SAC"], ["0022601186", "2027-04-11", "2027-04-11T22:00:00Z", "MIL", "BOS"], ["0022601187", "2027-04-11", "2027-04-11T22:00:00Z", "TOR", "BKN"], ["0022601188", "2027-04-11", "2027-04-11T22:00:00Z", "ATL", "CLE"], ["0022601189", "2027-04-11", "2027-04-11T22:00:00Z", "ORL", "MIA"], ["0022601190", "2027-04-11", "2027-04-11T22:00:00Z", "IND", "NYK"], ["0022601191", "2027-04-11", "2027-04-11T22:00:00Z", "CHA", "PHI"], ["0022601192", "2027-04-11", "2027-04-11T22:00:00Z", "DET", "WAS"], ["0022601193", "2027-04-11", "2027-04-11T22:00:00Z", "CHI", "NOP"], ["0022601194", "2027-04-11", "2027-04-12T00:30:00Z", "MEM", "DAL"], ["0022601195", "2027-04-11", "2027-04-12T00:30:00Z", "HOU", "MIN"], ["0022601196", "2027-04-11", "2027-04-12T00:30:00Z", "POR", "SAS"], ["0022601197", "2027-04-11", "2027-04-12T00:30:00Z", "OKC", "DEN"], ["0022601198", "2027-04-11", "2027-04-12T00:30:00Z", "UTA", "GSW"], ["0022601199", "2027-04-11", "2027-04-12T00:30:00Z", "SAC", "LAC"], ["0022601200", "2027-04-11", "2027-04-12T00:30:00Z", "PHX", "LAL"]];

// src/utils/staticSchedule.ts
var MONTHS_SHORT_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic"
];
var WEEKDAYS_SHORT_ES = ["Dom", "Lun", "Mar", "Mi\xE9", "Jue", "Vie", "S\xE1b"];
var STATIC_SCHEDULE_2027 = NBA_SCHEDULE_2027_TUPLES.map(
  ([gameId, dateIso, dateTimeUtc, awayAbbr, homeAbbr]) => ({
    gameId,
    dateIso,
    dateTimeUtc,
    awayAbbr,
    homeAbbr
  })
);
function getEasternTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date());
  const y = parts.find((p) => p.type === "year")?.value || "2026";
  const m = parts.find((p) => p.type === "month")?.value || "11";
  const d = parts.find((p) => p.type === "day")?.value || "02";
  return `${y}-${m}-${d}`;
}
function addDaysIso(dateIso, deltaDays) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function getMondayOfWeekIso(dateIso) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(dateIso, diffToMon);
}
function formatDayShortEs(dateIso) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const wd = WEEKDAYS_SHORT_ES[dt.getUTCDay()] || "";
  return `${wd} ${d}`;
}
function formatRangeLabelEs(startIso, endIso) {
  const [, m1, d1] = startIso.split("-").map(Number);
  const [, m2, d2] = endIso.split("-").map(Number);
  const mo1 = MONTHS_SHORT_ES[(m1 || 1) - 1] || "";
  const mo2 = MONTHS_SHORT_ES[(m2 || 1) - 1] || "";
  return `Lun ${d1} ${mo1} \u2013 Dom ${d2} ${mo2}`;
}
function buildWeeklyWindowsFromSchedule(scheduleGames, referenceTodayIso = getEasternTodayIso()) {
  const [y, m, d] = referenceTodayIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  let pivotMonday = getMondayOfWeekIso(referenceTodayIso);
  if (dow !== 1) {
    pivotMonday = addDaysIso(pivotMonday, 7);
  }
  const currentMonday = pivotMonday;
  const specs = [
    { id: "prev", offsetWeeks: -1, label: "Semana Anterior" },
    { id: "current", offsetWeeks: 0, label: "Semana Actual" },
    { id: "next", offsetWeeks: 1, label: "Pr\xF3xima Semana" },
    { id: "next2", offsetWeeks: 2, label: "Semana +2" }
  ];
  const allTeamAbbrs = Object.keys(NBA_TEAMS_MAP);
  const nowMs = Date.now();
  return specs.map((spec) => {
    const startIso = addDaysIso(currentMonday, spec.offsetWeeks * 7);
    const endIso = addDaysIso(startIso, 6);
    const weekGames = scheduleGames.filter(
      (g) => g.dateIso >= startIso && g.dateIso <= endIso
    );
    const mondayGames = weekGames.filter(
      (g) => g.dateIso === startIso && g.dateTimeUtc && g.dateTimeUtc.includes("T")
    ).sort((a, b) => a.dateTimeUtc.localeCompare(b.dateTimeUtc));
    let lockDeadlineLabel = `Madrugada del ${formatDayShortEs(
      startIso
    )} (Cierre semanal estricto)`;
    let isLocked = referenceTodayIso > startIso;
    if (mondayGames.length > 0) {
      const firstTip = new Date(mondayGames[0].dateTimeUtc);
      if (!Number.isNaN(firstTip.getTime())) {
        isLocked = nowMs >= firstTip.getTime();
        const madridFmt = new Intl.DateTimeFormat("es-ES", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Europe/Madrid"
        }).format(firstTip).replace(/\./g, "");
        const etFmt = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "America/New_York"
        }).format(firstTip);
        lockDeadlineLabel = `${madridFmt.charAt(0).toUpperCase() + madridFmt.slice(1)}h ESP (${etFmt} ET)`;
      }
    }
    const teamSchedules = {};
    for (const abbr of allTeamAbbrs) {
      teamSchedules[abbr] = {
        gamesCount: 0,
        b2bCount: 0,
        games: []
      };
    }
    for (const g of weekGames) {
      for (const side of ["away", "home"]) {
        const teamAbbr = side === "away" ? g.awayAbbr : g.homeAbbr;
        const oppAbbr = side === "away" ? g.homeAbbr : g.awayAbbr;
        const bucket = teamSchedules[teamAbbr];
        if (!bucket) continue;
        const prevSlot = bucket.games[bucket.games.length - 1];
        const isBackToBack = prevSlot ? addDaysIso(prevSlot.dateIso, 1) === g.dateIso : false;
        const slot = {
          gameId: g.gameId,
          dateIso: g.dateIso,
          dayShortEs: formatDayShortEs(g.dateIso),
          opponentAbbr: oppAbbr,
          isHome: side === "home",
          isBackToBack
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
      teamSchedules
    };
  });
}

// src/server/scoutingEngine.ts
var __name = (fn, _n) => fn;
var NBA_LIVE_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Referer: "https://www.nba.com/", Origin: "https://www.nba.com", Accept: "application/json" };
var NBA_TEAM_ARENAS = { ATL: { arenaName: "State Farm Arena", arenaCity: "Atlanta" }, BOS: { arenaName: "TD Garden", arenaCity: "Boston" }, BKN: { arenaName: "Barclays Center", arenaCity: "Brooklyn" }, CHA: { arenaName: "Spectrum Center", arenaCity: "Charlotte" }, CHI: { arenaName: "United Center", arenaCity: "Chicago" }, CLE: { arenaName: "Rocket Arena", arenaCity: "Cleveland" }, DAL: { arenaName: "American Airlines Center", arenaCity: "Dallas" }, DEN: { arenaName: "Ball Arena", arenaCity: "Denver" }, DET: { arenaName: "Little Caesars Arena", arenaCity: "Detroit" }, GSW: { arenaName: "Chase Center", arenaCity: "San Francisco" }, HOU: { arenaName: "Toyota Center", arenaCity: "Houston" }, IND: { arenaName: "Gainbridge Fieldhouse", arenaCity: "Indianapolis" }, LAC: { arenaName: "Intuit Dome", arenaCity: "Inglewood" }, LAL: { arenaName: "Crypto.com Arena", arenaCity: "Los \xC1ngeles" }, MEM: { arenaName: "FedExForum", arenaCity: "Memphis" }, MIA: { arenaName: "Kaseya Center", arenaCity: "Miami" }, MIL: { arenaName: "Fiserv Forum", arenaCity: "Milwaukee" }, MIN: { arenaName: "Target Center", arenaCity: "Minneapolis" }, NOP: { arenaName: "Smoothie King Center", arenaCity: "Nueva Orleans" }, NYK: { arenaName: "Madison Square Garden", arenaCity: "Nueva York" }, OKC: { arenaName: "Paycom Center", arenaCity: "Oklahoma City" }, ORL: { arenaName: "Kia Center", arenaCity: "Orlando" }, PHI: { arenaName: "Wells Fargo Center", arenaCity: "Filadelfia" }, PHX: { arenaName: "Footprint Center", arenaCity: "Phoenix" }, POR: { arenaName: "Moda Center", arenaCity: "Portland" }, SAC: { arenaName: "Golden 1 Center", arenaCity: "Sacramento" }, SAS: { arenaName: "Frost Bank Center", arenaCity: "San Antonio" }, TOR: { arenaName: "Scotiabank Arena", arenaCity: "Toronto" }, UTA: { arenaName: "Delta Center", arenaCity: "Salt Lake City" }, WAS: { arenaName: "Capital One Arena", arenaCity: "Washington" } };
var KNOWN_SPANISH_NBA_PLAYERS = /* @__PURE__ */ new Set(["santi aldama", "santiago aldama", "hugo gonzalez", "usman garuba", "eli ndiaye", "eli john ndiaye", "juan nunez", "aday mara", "izan almansa", "baba miller", "great osobor", "willy hernangomez", "juancho hernangomez", "ricky rubio", "alex abrines"]);
var reportMemoryCache = /* @__PURE__ */ new Map();
var reportInflight = /* @__PURE__ */ new Map();
var reportInflightStartedAt = /* @__PURE__ */ new Map();
function round1(val) {
  return Math.round((Number(val) || 0) * 10) / 10;
}
function normalizePlain(str) {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function isSpanishPlayerCheck(name, country) {
  const normCountry = normalizePlain(country || "");
  if (normCountry === "spain" || normCountry === "espana") return true;
  const normName = normalizePlain(name);
  return KNOWN_SPANISH_NBA_PLAYERS.has(normName);
}
function formatThousandsEs(num) {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function parseIsoMinutes(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const mins = Math.floor(raw);
    const secs = Math.round((raw - mins) * 60);
    return { decimal: round1(raw), formatted: `${mins}:${String(secs).padStart(2, "0")}` };
  }
  const str = String(raw || "").trim();
  const isoMatch = str.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/i);
  if (isoMatch) {
    const mins = Number(isoMatch[1]) || 0;
    const secs = Math.min(59, Math.round(Number(isoMatch[2]) || 0));
    return { decimal: round1(mins + secs / 60), formatted: `${mins}:${String(secs).padStart(2, "0")}` };
  }
  const colonMatch = str.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const mins = Number(colonMatch[1]) || 0;
    const secs = Number(colonMatch[2]) || 0;
    return { decimal: round1(mins + secs / 60), formatted: `${mins}:${String(secs).padStart(2, "0")}` };
  }
  const n = Number(str) || 0;
  return { decimal: round1(n), formatted: `${Math.round(n)}:00` };
}
function buildShortPlayerName(fullName, firstName, familyName) {
  const f = (firstName || "").trim();
  const l = (familyName || "").trim();
  if (f && l) {
    return `${f.charAt(0).toUpperCase()}. ${l}`;
  }
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName.trim() || "Jugador";
  const initial = parts[0].charAt(0).toUpperCase();
  const rest = parts.slice(1).join(" ");
  return `${initial}. ${rest}`;
}
function sanitizeJersey(rawJersey, fallbackJersey) {
  const cleanA = String(rawJersey ?? "").replace(/[^0-9]/g, "").trim();
  if (cleanA.length > 0) return cleanA;
  const cleanB = String(fallbackJersey ?? "").replace(/[^0-9]/g, "").trim();
  if (cleanB.length > 0) return cleanB;
  return "0";
}
function computeHollingerGmSc(stats) {
  return round1(stats.points + 0.4 * stats.fgm - 0.7 * stats.fga - 0.4 * (stats.fta - stats.ftm) + 0.7 * stats.oreb + 0.3 * stats.dreb + stats.stl + 0.7 * stats.ast + 0.7 * stats.blk - 0.4 * stats.pf - stats.tov);
}
function parsePbpClockRemaining(rawClock) {
  const str = String(rawClock || "").trim();
  const isoMatch = str.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/i);
  if (isoMatch) {
    const mins = Math.max(0, Number(isoMatch[1]) || 0);
    const secsFloat = Math.max(0, Number(isoMatch[2]) || 0);
    const secs = Math.min(59, Math.floor(secsFloat));
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  const colonMatch = str.match(/^(\d{1,2}):(\d{2})(?:\.\d+)?$/);
  if (colonMatch) {
    return `${colonMatch[1].padStart(2, "0")}:${colonMatch[2]}`;
  }
  return "";
}
var MEDICAL_BODY_PARTS_ES = [{ rx: /\bplantar\s+fascia\b/i, es: "fascia plantar", gender: "f" }, { rx: /\bfifth\s+metatarsal\b/i, es: "quinto metatarsiano", gender: "m" }, { rx: /\bmetatarsal\b/i, es: "metatarsiano", gender: "m" }, { rx: /\bachilles(?:\s+tendon)?\b/i, es: "tend\xF3n de Aquiles", gender: "m" }, { rx: /\bacl\b|\banterior\s+cruciate(?:\s+ligament)?\b/i, es: "ligamento cruzado anterior (LCA)", gender: "m" }, { rx: /\bmcl\b|\bmedial\s+collateral(?:\s+ligament)?\b/i, es: "ligamento lateral interno", gender: "m" }, { rx: /\blcl\b|\blateral\s+collateral(?:\s+ligament)?\b/i, es: "ligamento lateral externo", gender: "m" }, { rx: /\bpcl\b|\bposterior\s+cruciate(?:\s+ligament)?\b/i, es: "ligamento cruzado posterior", gender: "m" }, { rx: /\bmeniscus\b/i, es: "menisco", gender: "m" }, { rx: /\brotator\s+cuff\b/i, es: "manguito rotador", gender: "m" }, { rx: /\blabrum\b/i, es: "labrum", gender: "m" }, { rx: /\bhip\s+flexor\b/i, es: "flexor de la cadera", gender: "m" }, { rx: /\blow(?:er)?\s+back\b|\blumbar\b/i, es: "zona lumbar", gender: "f" }, { rx: /\bupper\s+back\b|\bthoracic\b/i, es: "zona dorsal", gender: "f" }, { rx: /\bgreat\s+toe\b|\bbig\s+toe\b/i, es: "dedo gordo del pie", gender: "m" }, { rx: /\bindex\s+finger\b/i, es: "dedo \xEDndice", gender: "m" }, { rx: /\bring\s+finger\b/i, es: "dedo anular", gender: "m" }, { rx: /\bmiddle\s+finger\b/i, es: "dedo coraz\xF3n", gender: "m" }, { rx: /\bpinky(?:\s+finger)?\b|\blittle\s+finger\b/i, es: "dedo me\xF1ique", gender: "m" }, { rx: /\bankle\b/i, es: "tobillo", gender: "m" }, { rx: /\bknee\b|\bpatella(?:r)?\b/i, es: "rodilla", gender: "f" }, { rx: /\bhamstring\b/i, es: "isquiotibiales", gender: "mp" }, { rx: /\bcalf\b|\bgastrocnemius\b|\bsoleus\b/i, es: "gemelo", gender: "m" }, { rx: /\badductor\b/i, es: "aductor", gender: "m" }, { rx: /\babductor\b|\bgroin\b/i, es: "abductor", gender: "m" }, { rx: /\bquad(?:riceps)?\b/i, es: "cu\xE1driceps", gender: "m" }, { rx: /\bthigh\b/i, es: "muslo", gender: "m" }, { rx: /\bhip\b/i, es: "cadera", gender: "f" }, { rx: /\bpelvis\b|\bpelvic\b/i, es: "pelvis", gender: "f" }, { rx: /\bback\b|\bspine\b|\bspinal\b/i, es: "espalda", gender: "f" }, { rx: /\bshoulder\b|\bclavicle\b|\bcollarbone\b/i, es: "hombro", gender: "m" }, { rx: /\bwrist\b/i, es: "mu\xF1eca", gender: "f" }, { rx: /\bthumb\b/i, es: "pulgar", gender: "m" }, { rx: /\bfinger\b/i, es: "dedo de la mano", gender: "m" }, { rx: /\bhand\b|\bmetacarpal\b/i, es: "mano", gender: "f" }, { rx: /\bforearm\b/i, es: "antebrazo", gender: "m" }, { rx: /\belbow\b/i, es: "codo", gender: "m" }, { rx: /\bbiceps?\b/i, es: "b\xEDceps", gender: "m" }, { rx: /\btriceps?\b/i, es: "tr\xEDceps", gender: "m" }, { rx: /\bpectoral\b|\bchest\b/i, es: "pectoral", gender: "m" }, { rx: /\bfoot\b/i, es: "pie", gender: "m" }, { rx: /\btoe\b/i, es: "dedo del pie", gender: "m" }, { rx: /\bheel\b/i, es: "tal\xF3n", gender: "m" }, { rx: /\bshin\b|\btibia(?:l)?\b/i, es: "tibia", gender: "f" }, { rx: /\bfibula(?:r)?\b/i, es: "peron\xE9", gender: "m" }, { rx: /\bleg\b|\blower\s+leg\b/i, es: "pierna", gender: "f" }, { rx: /\barm\b/i, es: "brazo", gender: "m" }, { rx: /\bneck\b|\bcervical\b/i, es: "cuello", gender: "m" }, { rx: /\brib(?:s|cage)?\b/i, es: "costillas", gender: "fp" }, { rx: /\babdom(?:en|inal)\b|\bcore\b|\boblique\b/i, es: "zona abdominal", gender: "f" }, { rx: /\btailbone\b|\bcoccyx\b|\bglute(?:al)?\b/i, es: "zona gl\xFAtea", gender: "f" }, { rx: /\bnose\b|\bnasal\b/i, es: "tabique nasal", gender: "m" }, { rx: /\beye\b|\borbital\b/i, es: "zona ocular", gender: "f" }, { rx: /\bjaw\b/i, es: "mand\xEDbula", gender: "f" }, { rx: /\bface\b|\bfacial\b|\bcheek\b/i, es: "rostro", gender: "m" }, { rx: /\bhead\b/i, es: "cabeza", gender: "f" }];
var MEDICAL_CONDITIONS_ES = [{ rx: /\bconcussion(?:\s+protocol)?\b/i, withBody: __name(() => "protocolo de conmoci\xF3n cerebral", "withBody"), standalone: "protocolo de conmoci\xF3n cerebral" }, { rx: /\bplantar\s+fasciitis\b/i, withBody: __name((b) => b.includes("plantar") ? `fascitis en ${b}` : `fascitis plantar (${b})`, "withBody"), standalone: "fascitis plantar" }, { rx: /\bgastroenteritis\b|\bstomach\s+(?:illness|virus|flu|bug)\b/i, withBody: __name(() => "gastroenteritis", "withBody"), standalone: "gastroenteritis" }, { rx: /\bupper\s+respiratory(?:\s+illness|\s+infection)?\b|\brespiratory\s+illness\b|\bsinus(?:itis)?\b/i, withBody: __name(() => "infecci\xF3n respiratoria", "withBody"), standalone: "infecci\xF3n respiratoria" }, { rx: /\bmigraine\b/i, withBody: __name(() => "cuadro de migra\xF1a", "withBody"), standalone: "cuadro de migra\xF1a" }, { rx: /\b(?:non-covid\s+)?illness\b|\bflu\b|\bviral\b|\bsick(?:ness)?\b/i, withBody: __name(() => "proceso v\xEDrico", "withBody"), standalone: "proceso v\xEDrico" }, { rx: /\bhealth\s+and\s+safety(?:\s+protocols?)?\b/i, withBody: __name(() => "protocolo m\xE9dico de salud", "withBody"), standalone: "protocolo m\xE9dico de salud" }, { rx: /\breturn\s+to\s+competition(?:\s+reconditioning)?\b|\breconditioning\b/i, withBody: __name((b) => `readaptaci\xF3n competitiva (${b})`, "withBody"), standalone: "readaptaci\xF3n f\xEDsica a la competici\xF3n" }, { rx: /\binjury\s+management\b|\bload\s+management\b|\bmanagement\b/i, withBody: __name((b) => `gesti\xF3n m\xE9dica de cargas en ${b}`, "withBody"), standalone: "gesti\xF3n m\xE9dica de cargas" }, { rx: /\bsurgery\b|\bsurgical\b|\barthroscop(?:y|ic)\b|\brepair\b|\breconstruction\b/i, withBody: __name((b) => `recuperaci\xF3n quir\xFArgica en ${b}`, "withBody"), standalone: "recuperaci\xF3n tras intervenci\xF3n quir\xFArgica" }, { rx: /\btorn\b|\btear\b|\brupture(?:d)?\b/i, withBody: __name((b) => `rotura fibrilar/ligamentosa en ${b}`, "withBody"), standalone: "rotura fibrilar o ligamentosa" }, { rx: /\bstress\s+fracture\b/i, withBody: __name((b) => `fractura por estr\xE9s en ${b}`, "withBody"), standalone: "fractura por estr\xE9s" }, { rx: /\bstress\s+reaction\b/i, withBody: __name((b) => `reacci\xF3n \xF3sea por estr\xE9s en ${b}`, "withBody"), standalone: "reacci\xF3n \xF3sea por estr\xE9s" }, { rx: /\bavulsion\b|\bfracture(?:d)?\b|\bbroken\b/i, withBody: __name((b) => `fractura en ${b}`, "withBody"), standalone: "fractura \xF3sea" }, { rx: /\bdislocat(?:ion|ed)\b/i, withBody: __name((b) => `luxaci\xF3n en ${b}`, "withBody"), standalone: "luxaci\xF3n articular" }, { rx: /\bsubluxation\b/i, withBody: __name((b) => `subluxaci\xF3n en ${b}`, "withBody"), standalone: "subluxaci\xF3n articular" }, { rx: /\bsprain(?:ed)?\b/i, withBody: __name((b) => `esguince de ${b}`, "withBody"), standalone: "esguince articular" }, { rx: /\bstrain(?:ed)?\b|\bpulled\b/i, withBody: __name((b) => `distensi\xF3n en ${b}`, "withBody"), standalone: "distensi\xF3n muscular" }, { rx: /\btendinopathy\b/i, withBody: __name((b) => `tendinopat\xEDa en ${b}`, "withBody"), standalone: "tendinopat\xEDa" }, { rx: /\btendinitis\b|\btendonitis\b/i, withBody: __name((b) => `tendinitis en ${b}`, "withBody"), standalone: "tendinitis" }, { rx: /\bbursitis\b/i, withBody: __name((b) => `bursitis en ${b}`, "withBody"), standalone: "bursitis" }, { rx: /\bimpingement\b/i, withBody: __name((b) => `pinzamiento articular en ${b}`, "withBody"), standalone: "pinzamiento articular" }, { rx: /\bbone\s+bruise\b/i, withBody: __name((b) => `edema \xF3seo en ${b}`, "withBody"), standalone: "edema \xF3seo" }, { rx: /\bcontusion\b|\bbruis(?:e|ed|ing)\b/i, withBody: __name((b) => `contusi\xF3n en ${b}`, "withBody"), standalone: "contusi\xF3n" }, { rx: /\binflammation\b|\bswelling\b|\beffusion\b/i, withBody: __name((b) => `inflamaci\xF3n en ${b}`, "withBody"), standalone: "inflamaci\xF3n articular" }, { rx: /\bspasms?\b/i, withBody: __name((b) => `espasmos musculares en ${b}`, "withBody"), standalone: "espasmos musculares" }, { rx: /\btightness\b|\bstiffness\b/i, withBody: __name((b) => `sobrecarga en ${b}`, "withBody"), standalone: "sobrecarga muscular" }, { rx: /\blaceration\b|\bcut\b/i, withBody: __name((b) => `herida inciso-contusa en ${b}`, "withBody"), standalone: "herida inciso-contusa" }, { rx: /\bsore(?:ness)?\b|\bpain\b|\bach(?:e|ing)\b|\bdiscomfort\b/i, withBody: __name((b) => `molestias en ${b}`, "withBody"), standalone: "molestias f\xEDsicas" }, { rx: /\brecovery\b|\brehab(?:ilitation)?\b/i, withBody: __name((b) => `proceso de recuperaci\xF3n en ${b}`, "withBody"), standalone: "proceso de recuperaci\xF3n m\xE9dica" }];
function formatSpanishLaterality(side, gender) {
  if (!side) return "";
  if (side === "bilateral") {
    return gender === "mp" || gender === "fp" ? "bilaterales" : "bilateral";
  }
  if (side === "left") {
    if (gender === "f") return "izquierda";
    if (gender === "mp") return "izquierdos";
    if (gender === "fp") return "izquierdas";
    return "izquierdo";
  }
  if (gender === "f") return "derecha";
  if (gender === "mp") return "derechos";
  if (gender === "fp") return "derechas";
  return "derecho";
}
function translateMedicalDetailEs(rawDetail) {
  const cleaned = String(rawDetail || "").replace(/^Injury\/Illness\s*-\s*/i, "").replace(/^(?:INACTIVE|DNP|DND|NWT)_(?:INJURY|REST|PERSONAL|NORMAL)\s*[-:]?\s*/i, "").replace(/^(?:DNP|DND|NWT)\s*-\s*/i, "").replace(/\bNot\s+Specified\b/gi, "").replace(/\b(?:Out(?:\s+for\s+season)?|Day-To-Day|Questionable|Doubtful|Probable|Injured\s+Reserve)\b/gi, "").replace(/[;:]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return "";
  let side = null;
  if (/\bbilateral\b/i.test(cleaned)) side = "bilateral";
  else if (/\bleft\b|\bizq(?:uierd[oa]s?)?\b/i.test(cleaned)) side = "left";
  else if (/\bright\b|\bder(?:ech[oa]s?)?\b/i.test(cleaned)) side = "right";
  let matchedBody = null;
  for (const bp of MEDICAL_BODY_PARTS_ES) {
    if (bp.rx.test(cleaned)) {
      matchedBody = { es: bp.es, gender: bp.gender };
      break;
    }
  }
  const bodyPhrase = matchedBody ? [matchedBody.es, formatSpanishLaterality(side, matchedBody.gender)].filter(Boolean).join(" ") : "";
  for (const cond of MEDICAL_CONDITIONS_ES) {
    if (cond.rx.test(cleaned)) {
      return bodyPhrase ? cond.withBody(bodyPhrase) : cond.standalone;
    }
  }
  if (bodyPhrase) {
    return `molestias en ${bodyPhrase}`;
  }
  if (/\brest\b|\bdescanso\b/i.test(cleaned)) {
    return "descanso programado";
  }
  const hasEnglishLeak = /\b(?:the|and|for|with|from|against|game|out|ruled|expected|return|week|month|season|injury|injured|illness|unspecified|status|coach|decision|assignment|personal|suspended|suspension|pending|trade|sore|pain|tear|torn|broken|surgery|sprain|strain)\b/i.test(cleaned);
  if (hasEnglishLeak) {
    return "";
  }
  return cleaned;
}
function classifyAbsenceOrDnp(isActiveOnBench, rawReason, rawDesc, espnInjury) {
  const cleanReasonRaw = String(rawReason || "").trim();
  const cleanDescRaw = String(rawDesc || "").trim();
  const reasonDescLow = `${cleanReasonRaw} ${cleanDescRaw}`.toLowerCase();
  const espnStatusLow = String(espnInjury?.status || "").toLowerCase();
  const espnDetailLow = String(espnInjury?.detail || "").toLowerCase();
  if (reasonDescLow.includes("coach") || reasonDescLow.includes("cd -") || reasonDescLow.includes("dnp_coach") || reasonDescLow.includes("decision")) {
    return { statusType: "coach_decision", statusLabel: "Decisi\xF3n t\xE9cnica", statusTone: "slate", priorityRank: isActiveOnBench ? 7 : 6, note: isActiveOnBench ? "Convocado en banquillo sin minutos por rotaci\xF3n t\xE9cnica" : "Descarte t\xE9cnico de convocatoria (sin parte m\xE9dico)" };
  }
  if (reasonDescLow.includes("gleague") || reasonDescLow.includes("g-league") || reasonDescLow.includes("g league") || reasonDescLow.includes("two-way") || reasonDescLow.includes("twoway") || reasonDescLow.includes("on assignment")) {
    return { statusType: "gleague", statusLabel: "Decisi\xF3n t\xE9cnica \xB7 G-League", statusTone: "slate", priorityRank: 6, note: "Asignado a G-League / contrato dual (fuera de rotaci\xF3n NBA)" };
  }
  if (reasonDescLow.includes("rest") && !reasonDescLow.includes("wrist") || espnDetailLow === "rest") {
    return { statusType: "rest", statusLabel: "Descanso", statusTone: "amber", priorityRank: 4, note: "Gesti\xF3n programada de descanso y cargas f\xEDsicas" };
  }
  if (reasonDescLow.includes("suspension") || reasonDescLow.includes("suspended") || espnStatusLow.includes("suspension")) {
    return { statusType: "suspension_personal", statusLabel: "Sanci\xF3n", statusTone: "amber", priorityRank: 4, note: "Baja disciplinaria \xB7 Sanci\xF3n oficial NBA" };
  }
  if (reasonDescLow.includes("personal") || reasonDescLow.includes("not with team") || reasonDescLow.includes("nwt") || reasonDescLow.includes("bereavement")) {
    return { statusType: "suspension_personal", statusLabel: "Motivos personales", statusTone: "amber", priorityRank: 4, note: "Ausencia autorizada \xB7 Motivos personales" };
  }
  if (reasonDescLow.includes("trade")) {
    return { statusType: "suspension_personal", statusLabel: "Traspaso en curso", statusTone: "amber", priorityRank: 5, note: "Fuera de convocatoria \xB7 Operaci\xF3n de traspaso en curso" };
  }
  const espnConfirmsMedical = Boolean(espnInjury && (!isActiveOnBench || espnStatusLow.includes("out") || espnStatusLow.includes("doubtful") || espnStatusLow.includes("questionable") || espnStatusLow.includes("day-to-day") || espnStatusLow.includes("injured")));
  const fullMedicalCheckLow = `${reasonDescLow} ${espnConfirmsMedical ? espnDetailLow : ""}`;
  if (fullMedicalCheckLow.includes("illness") || fullMedicalCheckLow.includes("flu") || fullMedicalCheckLow.includes("stomach") || fullMedicalCheckLow.includes("gastro") || fullMedicalCheckLow.includes("respiratory") || fullMedicalCheckLow.includes("sinus") || fullMedicalCheckLow.includes("migraine") || fullMedicalCheckLow.includes("viral")) {
    const cleanIll = translateMedicalDetailEs(cleanDescRaw || espnInjury?.detail || "");
    return { statusType: "injury", statusLabel: "Baja m\xE9dica", statusTone: "rose", priorityRank: 3, note: cleanIll ? `Indisposici\xF3n m\xE9dica (${cleanIll})` : "Proceso v\xEDrico / indisposici\xF3n m\xE9dica en acta" };
  }
  const translatedCandidate = translateMedicalDetailEs([cleanDescRaw, espnConfirmsMedical ? espnInjury?.detail || "" : "", cleanReasonRaw].filter(Boolean).join(" "));
  const hasMedicalKeyword = Boolean(translatedCandidate) || fullMedicalCheckLow.includes("injury") || fullMedicalCheckLow.includes("dnd") || fullMedicalCheckLow.includes("sprain") || fullMedicalCheckLow.includes("strain") || fullMedicalCheckLow.includes("soreness") || fullMedicalCheckLow.includes("surgery") || fullMedicalCheckLow.includes("fracture") || fullMedicalCheckLow.includes("contusion") || fullMedicalCheckLow.includes("tightness") || fullMedicalCheckLow.includes("reconditioning") || fullMedicalCheckLow.includes("concussion") || fullMedicalCheckLow.includes("recovery") || fullMedicalCheckLow.includes("torn") || fullMedicalCheckLow.includes("tear") || fullMedicalCheckLow.includes("tendinitis") || fullMedicalCheckLow.includes("tendinopathy") || fullMedicalCheckLow.includes("bursitis") || fullMedicalCheckLow.includes("inflammation") || fullMedicalCheckLow.includes("dislocation") || fullMedicalCheckLow.includes("spasms");
  if (espnConfirmsMedical || hasMedicalKeyword) {
    return { statusType: "injury", statusLabel: "Lesionado", statusTone: "rose", priorityRank: 3, note: translatedCandidate ? `Parte m\xE9dico: ${translatedCandidate}` : "Baja por lesi\xF3n confirmada en acta oficial NBA" };
  }
  return { statusType: "coach_decision", statusLabel: "Decisi\xF3n t\xE9cnica", statusTone: "slate", priorityRank: isActiveOnBench ? 7 : 6, note: isActiveOnBench ? "Convocado en banquillo sin minutos por rotaci\xF3n t\xE9cnica" : "Descarte t\xE9cnico de convocatoria (sin parte m\xE9dico activo)" };
}
var KNOWN_NBA_COACH_NAMES = ["Tom Thibodeau", "Coach Thibs", "Thibodeau", "Thibs", "Mike Brown", "Joe Mazzulla", "Mazzulla", "Kenny Atkinson", "JB Bickerstaff", "J.B. Bickerstaff", "Bickerstaff", "Erik Spoelstra", "Spoelstra", "Rick Carlisle", "Carlisle", "Nick Nurse", "Doc Rivers", "Billy Donovan", "Jamahl Mosley", "Quin Snyder", "Charles Lee", "Jordi Fern\xE1ndez", "Jordi Fernandez", "Darko Rajakovic", "Darko Rajakovi\u0107", "Rajakovic", "Rajakovi\u0107", "Brian Keefe", "Mark Daigneault", "Daigneault", "Chris Finch", "JJ Redick", "J.J. Redick", "Redick", "Steve Kerr", "Tyronn Lue", "Ty Lue", "Ime Udoka", "Udoka", "Jason Kidd", "Michael Malone", "Mike Malone", "David Adelman", "Taylor Jenkins", "Tuomas Iisalo", "Iisalo", "Mike Budenholzer", "Budenholzer", "Frank Vogel", "Darvin Ham", "Monty Williams", "Adrian Griffin", "Jacque Vaughn", "Gregg Popovich", "Popovich", "Mitch Johnson", "Willie Green", "Will Hardy", "Chauncey Billups", "Doug Christie", "Jordan Ott", "James Borrego", "Terry Stotts", "Tiago Splitter", "Sam Cassell", "Micah Nori", "Chris Quinn", "Jeff Van Gundy", "Stan Van Gundy", "Brad Stevens", "Pat Riley", "Leon Rose", "Rob Pelinka", "Sam Presti", "Daryl Morey", "Masai Ujiri", "Danny Ainge"].sort((a, b) => b.length - a.length);
var NBA_TEAM_SAFE_TOKENS = ["atlanta", "hawks", "atl", "boston", "celtics", "bos", "brooklyn", "nets", "bkn", "charlotte", "hornets", "cha", "chicago", "bulls", "chi", "cleveland", "cavaliers", "cavs", "cle", "dallas", "mavericks", "mavs", "dal", "denver", "nuggets", "den", "detroit", "pistons", "det", "golden state", "warriors", "gsw", "houston", "rockets", "hou", "indiana", "pacers", "ind", "los angeles", "clippers", "lakers", "lac", "lal", "memphis", "grizzlies", "mem", "miami", "heat", "mia", "milwaukee", "bucks", "mil", "minnesota", "timberwolves", "wolves", "min", "new orleans", "pelicans", "nop", "new york", "knicks", "nyk", "oklahoma city", "thunder", "okc", "orlando", "magic", "orl", "philadelphia", "sixers", "76ers", "phi", "phoenix", "suns", "phx", "portland", "trail blazers", "blazers", "por", "sacramento", "kings", "sac", "san antonio", "spurs", "sas", "toronto", "raptors", "tor", "utah", "jazz", "uta", "washington", "wizards", "was", "nba"];
function buildVerifiedPlayerTokenSet(playerNames) {
  const set = /* @__PURE__ */ new Set();
  const suffixes = /* @__PURE__ */ new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);
  for (const raw of playerNames) {
    const clean = normalizePlain(raw);
    if (!clean) continue;
    set.add(clean);
    const parts = clean.split(/\s+/).filter((w) => w.length >= 3 && !suffixes.has(w));
    for (const part of parts) {
      set.add(part);
    }
  }
  return set;
}
function preserveCasePhrase(referenceMatch, lowerPhrase) {
  const trimmed = referenceMatch.trimStart();
  if (/^[A-ZÁÉÍÓÚÑ]/.test(trimmed)) {
    return lowerPhrase.charAt(0).toUpperCase() + lowerPhrase.slice(1);
  }
  return lowerPhrase;
}
function sanitizeUnverifiedCoachClaims(text, verifiedPlayerNames = []) {
  if (!text) return text;
  const playerTokens = buildVerifiedPlayerTokenSet(verifiedPlayerNames);
  const teamTokens = new Set(NBA_TEAM_SAFE_TOKENS.map((t) => normalizePlain(t)));
  const isVerifiedPlayerOrTeam = __name((candidate) => {
    const norm = normalizePlain(candidate.replace(/\*/g, "")).replace(/^(?:los|las|el|la|de|del)\s+/, "");
    if (!norm) return true;
    if (playerTokens.has(norm) || teamTokens.has(norm)) return true;
    for (const t of teamTokens) {
      if (t.length >= 4 && norm.includes(t)) return true;
    }
    return false;
  }, "isVerifiedPlayerOrTeam");
  let out = text;
  out = out.replace(/\b([Ee]l|[Ss]u)\s+(?:[Ee]ntrenador(?:\s+jefe)?|[Tt]écnico|[Pp]reparador)\s+de\s+((?:los\s+|las\s+)?[\p{L}\d\s]{2,26}?),\s*([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})\s*,?/gu, (match, determiner, teamPhrase, person) => {
    if (isVerifiedPlayerOrTeam(person)) return match;
    return `${preserveCasePhrase(determiner, "el cuerpo t\xE9cnico")} de ${teamPhrase.trim()}`;
  });
  out = out.replace(/\b([Ee]l|[Ss]u)\s+(?:[Ee]ntrenador(?:\s+jefe)?|[Tt]écnico|[Pp]reparador)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, determiner, person) => {
    if (isVerifiedPlayerOrTeam(person)) return match;
    return preserveCasePhrase(determiner, "el cuerpo t\xE9cnico");
  });
  out = out.replace(/\b([Ll]a\s+pizarra\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, prefix, entity) => {
    if (isVerifiedPlayerOrTeam(entity)) return match;
    return preserveCasePhrase(prefix, "la pizarra t\xE9cnica");
  }).replace(/\b([Ee]l\s+banquillo\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, prefix, entity) => {
    if (isVerifiedPlayerOrTeam(entity)) return match;
    return preserveCasePhrase(prefix, "el cuerpo t\xE9cnico");
  }).replace(/\b([Ll]os\s+(?:hombres|pupilos|chicos)\s+de)\s+([A-ZÁÉÍÓÚÑ][\p{L}.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}.'-]+){0,2})/gu, (match, prefix, entity) => {
    if (isVerifiedPlayerOrTeam(entity)) return match;
    return preserveCasePhrase(prefix, "el conjunto");
  });
  const leftBound = "(?<![\\p{L}\\p{N}])";
  const rightBound = "(?![\\p{L}\\p{N}])";
  for (const coach of KNOWN_NBA_COACH_NAMES) {
    const normCoach = normalizePlain(coach);
    if (!normCoach || playerTokens.has(normCoach)) continue;
    const escaped = coach.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?:el\\s+|su\\s+)?(?:entrenador|t\xE9cnico|preparador)(?:\\s+jefe)?\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el cuerpo t\xE9cnico")).replace(new RegExp(`la\\s+pizarra\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "la pizarra t\xE9cnica")).replace(new RegExp(`el\\s+banquillo\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el cuerpo t\xE9cnico")).replace(new RegExp(`el\\s+sistema\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el planteamiento t\xE1ctico")).replace(new RegExp(`bajo\\s+(?:las\\s+\xF3rdenes|la\\s+batuta|el\\s+mando|la\\s+direcci\xF3n)\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "bajo la direcci\xF3n t\xE9cnica")).replace(new RegExp(`dirigidos\\s+por\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "desde la direcci\xF3n t\xE9cnica")).replace(new RegExp(`los\\s+(?:hombres|pupilos|chicos)\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el conjunto")).replace(new RegExp(`los\\s+de\\s+${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "el bloque")).replace(new RegExp(`${leftBound}${escaped}${rightBound}`, "giu"), (m) => preserveCasePhrase(m, "la direcci\xF3n t\xE9cnica"));
  }
  return sanitizeEditorialSpanishGrammar(out);
}
function sanitizeEditorialSpanishGrammar(text) {
  if (!text) return text;
  return text.replace(/\b(de|a|ante|contra|para|por|con|sobre|entre)\s+los\s+(\*\*)?Los\s+Angeles\b/giu, (_m, prep, stars) => `${prep} ${stars || ""}Los Angeles`).replace(/\b[Ll]os\s+(\*\*)?Los\s+Angeles\b/gu, (_m, stars) => `${stars || ""}Los Angeles`).replace(/\btasa\s+de\s+tiros\s+libres\b/giu, "frecuencia de visitas al tiro libre");
}
function getGeminiClient(timeoutMs = 2e4) {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY || "").trim();
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs, headers: { "User-Agent": "aistudio-build" } } });
}
function normalizeEspnTeamAbbr(raw) {
  const up = (raw || "").trim().toUpperCase();
  const map = { GS: "GSW", NY: "NYK", NO: "NOP", SA: "SAS", UTAH: "UTA", WSH: "WAS" };
  return map[up] || up;
}
function extractGroundingSources(response, seedSources = []) {
  const seen = /* @__PURE__ */ new Set();
  const links = [];
  const pushLink = __name((uri, title) => {
    const cleanUri = (uri || "").trim();
    if (!cleanUri || seen.has(cleanUri)) return;
    seen.add(cleanUri);
    links.push({ uri: cleanUri, title: (title || "").trim() || "Fuente actualidad NBA" });
  }, "pushLink");
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const ch of chunks) {
      pushLink(String(ch?.web?.uri || ""), String(ch?.web?.title || ""));
      if (links.length >= 6) return links;
    }
  }
  for (const s of seedSources) {
    pushLink(s.uri, s.title);
    if (links.length >= 6) break;
  }
  return links;
}
var modelCooldownMap = /* @__PURE__ */ new Map();
var deprecatedModelsSet = /* @__PURE__ */ new Set();
var MODEL_DISCOVERY_TTL_MS = 6 * 60 * 60 * 1e3;
var discoveredModelsCache = { models: [], expiresAt: 0 };
var discoveryInflight = null;
function isQuotaExhaustedError(err) {
  const msg = String(err instanceof Error ? err.message : err || "");
  return msg.includes("429") || msg.includes("503") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded") || msg.includes("high demand") || msg.includes("UNAVAILABLE") || msg.includes("overloaded");
}
function isModelDeprecatedError(err) {
  const msg = String(err instanceof Error ? err.message : err || "");
  return msg.includes("404") || msg.includes("NOT_FOUND") || msg.includes("no longer available") || msg.includes("is not found");
}
function isSuitableAutoTextModel(modelId, supportedActions) {
  const low = modelId.toLowerCase();
  if (!low.startsWith("gemini-")) return false;
  if (Array.isArray(supportedActions) && supportedActions.length > 0) {
    const supportsGen = supportedActions.some((a) => String(a).toLowerCase() === "generatecontent");
    if (!supportsGen) return false;
  }
  if (/(?:image|nano-banana|tts|live|transcribe|translate|audio|speech|embedding|aqa|omni|robotics|computer-use|deep-research|customtools)/i.test(low)) {
    return false;
  }
  if (/^gemini-(?:1\.|2\.0|pro$|pro-vision)/i.test(low)) {
    return false;
  }
  if (/(?:-argon|-carbon|-ultra|-pro(?:$|-))/i.test(low)) {
    return false;
  }
  return true;
}
function scoreDiscoveredGeminiModel(modelId) {
  const low = modelId.toLowerCase();
  const verMatch = /^gemini-(\d+)(?:\.(\d+))?/i.exec(low);
  const major = verMatch ? Number(verMatch[1]) || 0 : 0;
  const minor = verMatch && verMatch[2] ? Number(verMatch[2]) || 0 : 0;
  let score = major * 100 + minor * 10;
  if (low.includes("hydrogen") || low.includes("flash") && !low.includes("lite")) {
    score += 40;
  } else if (low.includes("lite")) {
    score += 25;
  } else {
    score += 10;
  }
  if (low.includes("-exp")) {
    score -= 15;
  } else if (low.includes("-preview") || /-\d{3,4}$/.test(low)) {
    score += 5;
  } else {
    score += 18;
  }
  return score;
}
async function discoverLiveGeminiTextModels(ai, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && discoveredModelsCache.models.length > 0 && discoveredModelsCache.expiresAt > now) {
    return discoveredModelsCache.models;
  }
  if (discoveryInflight) {
    return discoveryInflight;
  }
  discoveryInflight = (async () => {
    try {
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("models.list timeout")), 4500)
      );
      const listPromise = (async () => {
        const pager = await ai.models.list({ config: { pageSize: 100 } });
        const collected = [];
        for await (const m of pager) {
          const rawName = String(m?.name || "").replace(/^models\//, "").trim();
          if (rawName && !deprecatedModelsSet.has(rawName) && isSuitableAutoTextModel(rawName, m?.supportedActions)) {
            collected.push(rawName);
          }
          if (collected.length >= 40) break;
        }
        return collected;
      })();
      const candidates = await Promise.race([listPromise, timeoutPromise]);
      const ranked = [...new Set(candidates)].sort((a, b) => scoreDiscoveredGeminiModel(b) - scoreDiscoveredGeminiModel(a)).slice(0, 6);
      if (ranked.length > 0) {
        discoveredModelsCache = { models: ranked, expiresAt: Date.now() + MODEL_DISCOVERY_TTL_MS };
        console.info(`[RadarNBA] Modelos Gemini vigentes detectados autom\xE1ticamente: ${ranked.join(", ")}`);
      }
      return ranked;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || "");
      console.info(`[RadarNBA] Auto-descubrimiento models.list omitido: ${msg.slice(0, 100)}`);
      return discoveredModelsCache.models;
    } finally {
      discoveryInflight = null;
    }
  })();
  return discoveryInflight;
}
async function generateWithGeminiCascade(params) {
  const isServerless = Boolean(params.isServerless) || Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) || process.env.NBA_SNAPSHOT_ONLY === "1";
  const ai = getGeminiClient(isServerless ? 3e4 : 35e3);
  if (!ai) {
    throw new Error("GEMINI_API_KEY unavailable");
  }
  const modelTimeout = isServerless ? 25e3 : 25e3;
  const seedNames = [
    process.env.GEMINI_MODEL_PRIMARY,
    process.env.GEMINI_MODEL_SECONDARY,
    process.env.GEMINI_MODEL_TERTIARY,
    ...discoveredModelsCache.expiresAt > Date.now() ? discoveredModelsCache.models : [],
    "gemini-4-hydrogen",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash"
  ].filter((n) => Boolean(n && n.trim()));
  const buildOrderedQueue = (names, excludeSet) => {
    const unique = [];
    const seen = /* @__PURE__ */ new Set();
    for (const rawName of names) {
      const name = rawName.trim();
      if (name && !seen.has(name) && !excludeSet.has(name) && !deprecatedModelsSet.has(name)) {
        seen.add(name);
        unique.push({ name, timeoutMs: modelTimeout });
      }
    }
    const now = Date.now();
    const active = unique.filter((m) => (modelCooldownMap.get(m.name) || 0) < now);
    return active.length > 0 ? active : unique;
  };
  const triedNames = /* @__PURE__ */ new Set();
  const attemptErrors = [];
  let lastErr = null;
  let sawDeprecatedError = false;
  const tryQueue = async (queue) => {
    for (const { name: model, timeoutMs } of queue) {
      triedNames.add(model);
      try {
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms for ${model}`)), timeoutMs)
        );
        const callPromise = ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            systemInstruction: params.systemInstruction
          }
        });
        const response = await Promise.race([callPromise, timeoutPromise]);
        const text = (response?.text || "").trim();
        if (text && text.length > 80) {
          modelCooldownMap.delete(model);
          return {
            text,
            sources: extractGroundingSources(response, params.seedSources)
          };
        }
        attemptErrors.push(`${model}: empty_or_short_response`);
      } catch (err) {
        lastErr = err;
        if (isModelDeprecatedError(err)) {
          deprecatedModelsSet.add(model);
          sawDeprecatedError = true;
        } else if (isQuotaExhaustedError(err)) {
          modelCooldownMap.set(model, Date.now() + 5 * 60 * 1e3);
        }
        const rawMsg = err instanceof Error ? err.message : String(err || "");
        const cleanMsg = rawMsg.replace(/[\{\}\"\:]/g, " ").replace(/\s+/g, " ").slice(0, 120);
        attemptErrors.push(`${model}: ${cleanMsg}`);
        console.info(`[RadarNBA] Transici\xF3n de modelo ${model} -> ${cleanMsg}`);
      }
    }
    return null;
  };
  const initialQueue = buildOrderedQueue(seedNames, triedNames);
  const firstResult = await tryQueue(initialQueue);
  if (firstResult) {
    if (sawDeprecatedError || discoveredModelsCache.expiresAt <= Date.now()) {
      void discoverLiveGeminiTextModels(ai, sawDeprecatedError);
    }
    return firstResult;
  }
  if (sawDeprecatedError || discoveredModelsCache.expiresAt <= Date.now()) {
    const liveDiscovered = await discoverLiveGeminiTextModels(ai, true);
    const healedQueue = buildOrderedQueue(liveDiscovered, triedNames);
    if (healedQueue.length > 0) {
      console.info(`[RadarNBA] Auto-curaci\xF3n Gemini: probando modelos descubiertos (${healedQueue.map((q) => q.name).join(", ")})`);
      const healedResult = await tryQueue(healedQueue);
      if (healedResult) {
        return healedResult;
      }
    }
  }
  if (attemptErrors.length > 0) {
    throw new Error(`Cascade failed (${attemptErrors.join(" | ")})`);
  }
  throw lastErr || new Error("All Gemini cascade models failed");
}
function cleanSectionText(raw, preserveHorizontalRules = false) {
  const withoutHeadings = (raw || "").replace(/^#+\s+.*$/gm, "").replace(/^\*\*PASO B.*?\*\*$/gim, "");
  const withoutRules = preserveHorizontalRules ? withoutHeadings.replace(/^(?:\s*---+\s*\n)+|(?:\n\s*---+\s*)+$/g, "") : withoutHeadings.replace(/^\s*---+\s*$/gm, "");
  return withoutRules.replace(/\n{3,}/g, "\n\n").trim();
}
function parseDelimitedSections(text, keys) {
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const startRegex = new RegExp(`===${key}===`, "i");
    const startMatch = startRegex.exec(text);
    if (!startMatch) continue;
    const contentStart = startMatch.index + startMatch[0].length;
    let contentEnd = text.length;
    for (let j = i + 1; j < keys.length; j++) {
      const nextRegex = new RegExp(`===${keys[j]}===`, "i");
      const nextMatch = nextRegex.exec(text.slice(contentStart));
      if (nextMatch) {
        contentEnd = contentStart + nextMatch.index;
        break;
      }
    }
    out[key] = cleanSectionText(text.slice(contentStart, contentEnd), key === "CAPITULOS_DINAMICOS");
  }
  return out;
}
function stripInlineWrapper(s) {
  return (s || "").replace(/^[-•*\d.)\s]+/, "").replace(/^\*\*|\*\*$/g, "").replace(/\*\*/g, "").trim();
}
function parseDynamicChapters(raw, fallback) {
  if (!raw || raw.trim().length < 50) return fallback;
  const normalizedSeparators = raw.replace(/^\s*---+\s*$/gm, "\n---\n").replace(/\n{2,}(?=[^\n:]{4,95}\s*::\s*\S)/g, "\n---\n").trim();
  const rawChunks = normalizedSeparators.split(/\n\s*(?:---+\s*\n?\s*)+/).map((c) => c.trim()).filter((c) => c.length > 40);
  const chapters = [];
  for (const chunk of rawChunks.slice(0, 2)) {
    let title = "";
    let body = "";
    const doubleColonIdx = chunk.indexOf("::");
    if (doubleColonIdx > 2 && doubleColonIdx < 130) {
      title = stripInlineWrapper(chunk.slice(0, doubleColonIdx));
      body = cleanSectionText(chunk.slice(doubleColonIdx + 2));
    } else {
      const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2 && lines[0].length <= 115) {
        title = stripInlineWrapper(lines[0]);
        body = cleanSectionText(lines.slice(1).join("\n\n"));
      }
    }
    if (title && body.length >= 45) {
      chapters.push({ kicker: chapters.length === 0 ? "Foco Principal" : "Segundo Foco", title, body });
    }
  }
  return chapters.length > 0 ? chapters : fallback;
}
function parseClavesList(raw, fallback) {
  if (!raw || raw.trim().length < 25) return fallback;
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 18);
  const items = [];
  for (const line of lines.slice(0, 4)) {
    let title = "";
    let detail = "";
    const sepIdx = line.indexOf("::");
    if (sepIdx > 2 && sepIdx < 95) {
      title = stripInlineWrapper(line.slice(0, sepIdx));
      let rawDetail = line.slice(sepIdx + 2).trim();
      if (/^\*\*[^*]+\*\*$/.test(rawDetail)) {
        rawDetail = rawDetail.slice(2, -2).trim();
      }
      detail = rawDetail;
    } else {
      const boldMatch = /^\*\*([^*]{3,80})\*\*[:\s—-]*(.+)$/.exec(line.replace(/^[-•\d.)\s]+/, ""));
      if (boldMatch) {
        title = stripInlineWrapper(boldMatch[1]);
        detail = boldMatch[2].trim();
      } else {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 3 && colonIdx < 75) {
          title = stripInlineWrapper(line.slice(0, colonIdx));
          detail = line.slice(colonIdx + 1).trim();
        }
      }
    }
    if (title && detail.length >= 15) {
      items.push({ title: sanitizeEditorialSpanishGrammar(title), detail: sanitizeEditorialSpanishGrammar(detail) });
    }
  }
  return items.length >= 2 ? items : fallback;
}
function parseSpotlight(raw, fallback) {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed || /^ningun[oa]\b/i.test(trimmed) || /^no aplica\b/i.test(trimmed) || trimmed.length < 40) {
    return null;
  }
  const pipeIdx = trimmed.indexOf("||");
  const colonIdx = trimmed.indexOf("::");
  const sepIdx = pipeIdx > 2 && pipeIdx < 120 ? pipeIdx : colonIdx > 2 && colonIdx < 120 ? colonIdx : -1;
  if (sepIdx !== -1) {
    const title = stripInlineWrapper(trimmed.slice(0, sepIdx));
    const body = cleanSectionText(trimmed.slice(sepIdx + 2));
    if (title && body.length >= 40) {
      return { title, body };
    }
  }
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && lines[0].length <= 105) {
    const title = stripInlineWrapper(lines[0]);
    const body = cleanSectionText(lines.slice(1).join("\n\n"));
    if (title && body.length >= 40) {
      return { title, body };
    }
  }
  return fallback;
}
function createScoutingEngine(deps) {
  async function fetchLivePressContext(dateIso, forceRefresh = false) {
    const yyyymmdd = dateIso.replace(/-/g, "");
    const byMatchup = /* @__PURE__ */ new Map();
    const dayNotes = [];
    const daySources = [];
    const [sbSettled] = await Promise.allSettled([deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`, 15 * 60 * 1e3, {}, 7e3, forceRefresh)]);
    if (sbSettled.status === "fulfilled" && Array.isArray(sbSettled.value?.events)) {
      for (const ev of sbSettled.value.events) {
        const comp = ev?.competitions?.[0];
        const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const homeComp = competitors.find((c) => c?.homeAway === "home");
        const awayComp = competitors.find((c) => c?.homeAway === "away");
        const homeAbbr = normalizeEspnTeamAbbr(homeComp?.team?.abbreviation || "");
        const awayAbbr = normalizeEspnTeamAbbr(awayComp?.team?.abbreviation || "");
        if (!homeAbbr || !awayAbbr) continue;
        const key = `${awayAbbr}@${homeAbbr}`;
        const notes = [];
        const sources = [];
        const headlines = Array.isArray(comp?.headlines) ? comp.headlines : [];
        for (const hl of headlines) {
          const shortTxt = String(hl?.shortLinkText || "").trim();
          const descTxt = String(hl?.description || "").trim();
          const combined = [shortTxt, descTxt].filter(Boolean).join(" \u2014 ");
          if (combined) {
            notes.push(combined);
            dayNotes.push(`[${awayAbbr} @ ${homeAbbr}] ${combined}`);
          }
        }
        const evLinks = Array.isArray(ev?.links) ? ev.links : [];
        const recapLink = evLinks.find((l) => Array.isArray(l?.rel) && (l.rel.includes("recap") || l.rel.includes("summary"))) || evLinks[0];
        if (recapLink?.href) {
          const src = { uri: String(recapLink.href).replace(/^http:\/\//i, "https://"), title: `${awayAbbr} vs ${homeAbbr} \u2014 Cr\xF3nica y Resumen Oficial ESPN/AP` };
          sources.push(src);
          if (daySources.length < 6) daySources.push(src);
        }
        byMatchup.set(key, { notes, sources });
      }
    }
    return { byMatchup, dayNotes, daySources };
  }
  function utcToEasternDateIso2(utcStr) {
    if (!utcStr) return "";
    const dt = new Date(utcStr);
    if (Number.isNaN(dt.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(dt);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return y && m && d ? `${y}-${m}-${d}` : "";
  }
  function normalizeScheduleDateToEasternIso2(estRaw, gdDateRaw, utcRaw) {
    const estTrim = String(estRaw || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(estTrim)) {
      return estTrim.slice(0, 10);
    }
    for (const candidate of [estTrim, String(gdDateRaw || "").trim()]) {
      const slashMatch = candidate.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (slashMatch) {
        return `${slashMatch[3]}-${slashMatch[1]}-${slashMatch[2]}`;
      }
    }
    const utcTrim = String(utcRaw || "").trim();
    if (utcTrim.includes("T")) {
      const converted = utcToEasternDateIso2(utcTrim);
      if (converted) return converted;
    }
    return utcTrim.slice(0, 10);
  }
  let cachedScheduleList = null;
  async function fetchLeagueScheduleGames(forceRefresh = false) {
    if (!forceRefresh && cachedScheduleList && cachedScheduleList.expiresAt > Date.now()) {
      return cachedScheduleList.games;
    }
    const gameMap = /* @__PURE__ */ new Map();
    for (const sg of STATIC_SCHEDULE_2027) {
      const fallbackArena = NBA_TEAM_ARENAS[sg.homeAbbr];
      gameMap.set(`${sg.dateIso}:${sg.awayAbbr}:${sg.homeAbbr}`, { gameId: sg.gameId, dateIso: sg.dateIso, dateTimeUtc: sg.dateTimeUtc, awayAbbr: sg.awayAbbr, homeAbbr: sg.homeAbbr, arenaName: fallbackArena?.arenaName || `Pabell\xF3n ${sg.homeAbbr}`, arenaCity: fallbackArena?.arenaCity || "" });
    }
    try {
      const raw = await deps.cachedFetchJson("https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json", 6 * 60 * 60 * 1e3, NBA_LIVE_HEADERS, 3500, forceRefresh);
      const gameDates = Array.isArray(raw?.leagueSchedule?.gameDates) ? raw.leagueSchedule.gameDates : [];
      for (const gd of gameDates) {
        const gamesArr = Array.isArray(gd?.games) ? gd.games : [];
        for (const g of gamesArr) {
          const homeAbbr = String(g?.homeTeam?.teamTricode || "").trim().toUpperCase();
          const awayAbbr = String(g?.awayTeam?.teamTricode || "").trim().toUpperCase();
          if (!homeAbbr || !awayAbbr) continue;
          const utcStr = String(g?.gameDateTimeUTC || g?.gameDateUTC || "").trim();
          const dateIso = normalizeScheduleDateToEasternIso2(g?.gameDateEst, gd?.gameDate, utcStr);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
          const fallbackArena = NBA_TEAM_ARENAS[homeAbbr];
          gameMap.set(`${dateIso}:${awayAbbr}:${homeAbbr}`, { gameId: String(g?.gameId || ""), dateIso, dateTimeUtc: utcStr, awayAbbr, homeAbbr, arenaName: String(g?.arenaName || "").trim() || fallbackArena?.arenaName || `Pabell\xF3n ${homeAbbr}`, arenaCity: String(g?.arenaCity || "").trim() || fallbackArena?.arenaCity || "" });
        }
      }
    } catch {
    }
    if (gameMap.size === 0) {
      try {
        const full = await deps.getFullLeagueMemory();
        for (const t of full.teams) {
          for (const g of t.games) {
            const dateIso = g.date.slice(0, 10);
            const isHome = g.isHome;
            const homeAbbr = isHome ? t.abbreviation : g.opponentAbbr;
            const awayAbbr = isHome ? g.opponentAbbr : t.abbreviation;
            const key = `${dateIso}:${awayAbbr}:${homeAbbr}`;
            if (!gameMap.has(key)) {
              const fallbackArena = NBA_TEAM_ARENAS[homeAbbr];
              gameMap.set(key, { gameId: g.eventId || `mem_${dateIso}_${awayAbbr}_${homeAbbr}`, dateIso, dateTimeUtc: `${dateIso}T00:00:00Z`, awayAbbr, homeAbbr, arenaName: fallbackArena?.arenaName || `Pabell\xF3n ${homeAbbr}`, arenaCity: fallbackArena?.arenaCity || "" });
            }
          }
        }
      } catch {
      }
    }
    const combined = [...gameMap.values()];
    combined.sort((a, b) => (a.dateIso + "T" + (a.dateTimeUtc || "")).localeCompare(b.dateIso + "T" + (b.dateTimeUtc || "")));
    cachedScheduleList = { expiresAt: Date.now() + 6 * 60 * 60 * 1e3, games: combined };
    return combined;
  }
  async function fetchEspnInjuriesByName(forceRefresh = false) {
    const map = /* @__PURE__ */ new Map();
    try {
      const data = await deps.cachedFetchJson("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries", 20 * 60 * 1e3, {}, 5500, forceRefresh);
      const teamsArr = Array.isArray(data?.injuries) ? data.injuries : [];
      for (const tBlock of teamsArr) {
        const items = Array.isArray(tBlock?.injuries) ? tBlock.injuries : [];
        for (const inj of items) {
          const dispName = String(inj?.athlete?.displayName || "").trim();
          if (!dispName) continue;
          const status = String(inj?.status || "").trim();
          const cleanField = __name((val) => {
            const s = String(val || "").trim();
            return /^not\s+specified$/i.test(s) ? "" : s;
          }, "cleanField");
          const typeDesc = cleanField(inj?.details?.type);
          const sideDesc = cleanField(inj?.details?.side);
          const detailDesc = cleanField(inj?.details?.detail);
          const returnDate = cleanField(inj?.details?.returnDate);
          const comment = String(
            inj?.shortComment || inj?.athlete?.notes?.items?.[0]?.headline || inj?.details?.fantasyStatus?.description || ""
          ).trim();
          const baseDetail = [sideDesc, typeDesc, detailDesc].filter(Boolean).join(" ").trim();
          let combinedDetail = baseDetail;
          if (comment) {
            combinedDetail = combinedDetail ? `${combinedDetail} (${comment})` : comment;
          }
          if (returnDate) {
            combinedDetail = combinedDetail ? `${combinedDetail} [Regreso est: ${returnDate}]` : `Regreso est: ${returnDate}`;
          }
          map.set(normalizePlain(dispName), { status, detail: combinedDetail });
        }
      }
    } catch {
    }
    return map;
  }
  function computeGameTimeRemaining(periodNum, clockStr) {
    const [mStr, sStr] = (clockStr || "00:00").split(":");
    const m = Number(mStr) || 0;
    const s = Number(sStr) || 0;
    if (periodNum <= 4) {
      const totalRegSecs = (4 - periodNum) * 720 + (m * 60 + s);
      const remMins = Math.floor(totalRegSecs / 60);
      const remSecs = totalRegSecs % 60;
      return `${remMins} min y ${String(remSecs).padStart(2, "0")}s de encuentro`;
    }
    return `${m} min y ${String(s).padStart(2, "0")}s de pr\xF3rroga`;
  }
  async function fetchPlayByPlayFoulOuts(eventId, fouledOutPlayerIds, seasonLabel, forceRefresh = false) {
    const out = /* @__PURE__ */ new Map();
    if (fouledOutPlayerIds.length === 0 || !/^00\d{8}$/.test(eventId)) {
      return out;
    }
    const ttl = seasonLabel === "2026-27" ? 15 * 60 * 1e3 : 180 * 60 * 1e3;
    try {
      const pbp = await deps.cachedFetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${eventId}.json`, ttl, NBA_LIVE_HEADERS, 7500, forceRefresh);
      const actions = Array.isArray(pbp?.game?.actions) ? pbp.game.actions : [];
      if (actions.length === 0) return out;
      for (const pid of fouledOutPlayerIds) {
        const numPid = Number(pid);
        if (!numPid) continue;
        const playerFouls = actions.filter((a) => {
          if (Number(a?.personId) !== numPid) return false;
          const actType = String(a?.actionType || "").toLowerCase();
          if (actType !== "foul") return false;
          const subType = String(a?.subType || "").toLowerCase();
          if (subType.includes("technical") || subType.includes("defense 3 second")) {
            return false;
          }
          return true;
        });
        if (playerFouls.length === 0) continue;
        const exactSixth = playerFouls.find((a) => Number(a?.foulPersonalTotal) === 6 || /\b(?:P6|6\s*PF)\b/i.test(String(a?.description || ""))) || playerFouls[playerFouls.length - 1];
        const fifthFoul = playerFouls.find((a) => Number(a?.foulPersonalTotal) === 5);
        const pNum = Number(exactSixth?.period) || 4;
        const periodLabel = pNum <= 4 ? `${pNum}Q` : pNum === 5 ? "PR" : `PR${pNum - 4}`;
        const clockRemaining = parsePbpClockRemaining(exactSixth?.clock) || "00:00";
        const gameTimeLeft = computeGameTimeRemaining(pNum, clockRemaining);
        let fifthFoulDetail = "";
        if (fifthFoul) {
          const p5 = Number(fifthFoul?.period) || 3;
          const p5Label = p5 <= 4 ? `${p5}Q` : "PR";
          const p5Clock = parsePbpClockRemaining(fifthFoul?.clock) || "00:00";
          fifthFoulDetail = `; 5\xAA falta en el ${p5Label} a falta de ${p5Clock}`;
        }
        out.set(pid, { periodLabel, clockRemaining, gameTimeLeft, fifthFoulDetail });
      }
    } catch {
    }
    return out;
  }
  async function fetchPlayByPlayHighlights(eventId, awayAbbr, homeAbbr, winnerAbbr, seasonLabel, forceRefresh = false) {
    const emptyRes = { keyRun: null, breakpoint: null, clutchPlays: [], playerHotSpurts: [], formattedDossierBlock: "" };
    if (!eventId) return emptyRes;
    let actions = [];
    const ttl = seasonLabel === "2026-27" ? 15 * 60 * 1e3 : 180 * 60 * 1e3;
    if (/^00\d{8}$/.test(eventId)) {
      try {
        const pbp = await deps.cachedFetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${eventId}.json`, ttl, NBA_LIVE_HEADERS, 7500, forceRefresh);
        if (Array.isArray(pbp?.game?.actions)) {
          actions = pbp.game.actions;
        }
      } catch {
      }
    }
    if (actions.length === 0) {
      try {
        const espnSummary = await deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`, ttl, {}, 7500, forceRefresh);
        const espnPlays = Array.isArray(espnSummary?.plays) ? espnSummary.plays : [];
        if (espnPlays.length > 0) {
          actions = espnPlays.map((p) => {
            const rawTextLow = String(p?.text || "").toLowerCase();
            const isMiss = rawTextLow.includes("misses") || rawTextLow.includes("falla");
            const isScoring = Boolean(p?.scoringPlay);
            return {
              period: Number(p?.period?.number) || 1,
              clock: p?.clock?.displayValue || "00:00",
              teamTricode: normalizeEspnTeamAbbr(p?.team?.abbreviation || ""),
              playerNameI: p?.athlete?.displayName || String(p?.text || "").split(" ")[0] || "",
              description: String(p?.text || "").trim(),
              scoreHome: String(p?.homeScore ?? 0),
              scoreAway: String(p?.awayScore ?? 0),
              actionType: p?.type?.text?.toLowerCase() || (isScoring ? "made" : "play"),
              pointsTotal: isScoring ? p?.scoreValue || 2 : 0,
              subType: p?.type?.text || "",
              shotResult: isScoring ? "made" : isMiss ? "missed" : ""
            };
          });
        }
      } catch {
      }
    }
    if (actions.length === 0) return emptyRes;
    const clockToSec = (clockStr) => {
      const parts = String(clockStr || "00:00").split(":");
      const m = Number(parts[0]) || 0;
      const s = Number(parts[1]) || 0;
      return m * 60 + s;
    };
    const timeoutEvents = [];
    for (const a of actions) {
      const actType = String(a?.actionType || "").toLowerCase();
      const subType = String(a?.subType || "").toLowerCase();
      const desc = String(a?.description || "").toLowerCase();
      const isTimeout = actType.includes("timeout") || subType.includes("timeout") || desc.includes("timeout") || desc.includes("tiempo muerto");
      if (!isTimeout) continue;
      const pNum = Number(a?.period) || 1;
      const periodLabel = pNum <= 4 ? `${pNum}Q` : pNum === 5 ? "PR" : `PR${pNum - 4}`;
      const clock = parsePbpClockRemaining(a?.clock) || String(a?.clock || "00:00");
      const clockSec = clockToSec(clock);
      let teamAbbr = String(a?.teamTricode || "").toUpperCase();
      if (!teamAbbr || teamAbbr !== awayAbbr && teamAbbr !== homeAbbr) {
        if (desc.includes(awayAbbr.toLowerCase())) teamAbbr = awayAbbr;
        else if (desc.includes(homeAbbr.toLowerCase())) teamAbbr = homeAbbr;
      }
      timeoutEvents.push({
        period: pNum,
        periodLabel,
        clock,
        clockSec,
        teamAbbr,
        description: String(a?.description || "").trim()
      });
    }
    const scoringEvents = [];
    let currentAway = 0;
    let currentHome = 0;
    for (const a of actions) {
      const pNum = Number(a?.period) || 1;
      const periodLabel = pNum <= 4 ? `${pNum}Q` : pNum === 5 ? "PR" : `PR${pNum - 4}`;
      const clockRemaining = parsePbpClockRemaining(a?.clock) || String(a?.clock || "00:00");
      const teamAbbr = String(a?.teamTricode || "").toUpperCase();
      const desc = String(a?.description || "").trim();
      const playerName = String(a?.playerNameI || a?.playerName || "").trim();
      const parsedAway = Number(a?.scoreAway);
      const parsedHome = Number(a?.scoreHome);
      let ptsAdded = 0;
      if (Number.isFinite(parsedAway) && Number.isFinite(parsedHome) && (parsedAway > currentAway || parsedHome > currentHome)) {
        ptsAdded = parsedAway - currentAway + (parsedHome - currentHome);
        currentAway = Math.max(currentAway, parsedAway);
        currentHome = Math.max(currentHome, parsedHome);
      } else {
        const actType = String(a?.actionType || "").toLowerCase();
        const shotRes = String(a?.shotResult || "").toLowerCase();
        if (actType === "made" || shotRes === "made" || Number(a?.pointsTotal) > 0) {
          ptsAdded = Number(a?.pointsTotal) || 2;
          if (teamAbbr === awayAbbr) currentAway += ptsAdded;
          else if (teamAbbr === homeAbbr) currentHome += ptsAdded;
        }
      }
      if (ptsAdded > 0 && desc) {
        scoringEvents.push({
          period: pNum,
          periodLabel,
          clock: clockRemaining,
          teamAbbr,
          description: desc,
          playerName,
          points: ptsAdded,
          awayScore: currentAway,
          homeScore: currentHome
        });
      }
    }
    if (scoringEvents.length === 0) return emptyRes;
    let bestRun = { scoringTeamAbbr: "", defendingTeamAbbr: "", runPoints: 0, opponentPoints: 0, periodLabel: "", startClock: "", endClock: "", summary: "", timeoutCalled: null };
    for (const team of [awayAbbr, homeAbbr]) {
      const oppTeam = team === awayAbbr ? homeAbbr : awayAbbr;
      let runPts = 0;
      let oppPts = 0;
      let startEv = scoringEvents[0];
      let endEv = scoringEvents[0];
      for (const ev of scoringEvents) {
        if (ev.teamAbbr === team) {
          if (runPts === 0) startEv = ev;
          runPts += ev.points;
          endEv = ev;
        } else if (ev.teamAbbr === oppTeam) {
          if (runPts > bestRun.runPoints && runPts >= 7) {
            bestRun = {
              scoringTeamAbbr: team,
              defendingTeamAbbr: oppTeam,
              runPoints: runPts,
              opponentPoints: oppPts,
              periodLabel: startEv.periodLabel,
              startClock: startEv.clock,
              endClock: endEv.clock,
              summary: `Parcial de ${runPts}-${oppPts} para ${team} en el ${startEv.periodLabel} (reloj ${startEv.clock} a ${endEv.clock})`,
              timeoutCalled: null
            };
          }
          oppPts += ev.points;
          if (oppPts > 4) {
            runPts = 0;
            oppPts = 0;
          }
        }
      }
      if (runPts > bestRun.runPoints && runPts >= 7) {
        bestRun = {
          scoringTeamAbbr: team,
          defendingTeamAbbr: oppTeam,
          runPoints: runPts,
          opponentPoints: oppPts,
          periodLabel: startEv.periodLabel,
          startClock: startEv.clock,
          endClock: endEv.clock,
          summary: `Parcial de ${runPts}-${oppPts} para ${team} en el ${startEv.periodLabel} (reloj ${startEv.clock} a ${endEv.clock})`,
          timeoutCalled: null
        };
      }
    }
    if (bestRun.runPoints >= 7) {
      const runStartSec = clockToSec(bestRun.startClock);
      const runEndSec = clockToSec(bestRun.endClock);
      const provokedTimeout = timeoutEvents.find(
        (t) => t.periodLabel === bestRun.periodLabel && (t.teamAbbr === bestRun.defendingTeamAbbr || !t.teamAbbr && t.clockSec <= runStartSec && t.clockSec >= runEndSec - 35) && t.clockSec <= runStartSec && t.clockSec >= runEndSec - 40
      );
      if (provokedTimeout) {
        bestRun.timeoutCalled = {
          teamAbbr: bestRun.defendingTeamAbbr,
          periodLabel: provokedTimeout.periodLabel,
          clock: provokedTimeout.clock
        };
        bestRun.summary = `Parcial de ${bestRun.runPoints}-${bestRun.opponentPoints} para ${bestRun.scoringTeamAbbr} en el ${bestRun.periodLabel} (reloj ${bestRun.startClock} a ${bestRun.endClock}) que oblig\xF3 a parar el partido con tiempo muerto de ${bestRun.defendingTeamAbbr} (reloj ${provokedTimeout.clock})`;
      }
    }
    let lastLeadChange = null;
    const isWinningTeamHome = winnerAbbr === homeAbbr;
    for (let i = 0; i < scoringEvents.length; i++) {
      const ev = scoringEvents[i];
      const prevAway = i > 0 ? scoringEvents[i - 1].awayScore : 0;
      const prevHome = i > 0 ? scoringEvents[i - 1].homeScore : 0;
      const wasWinnerAhead = isWinningTeamHome ? prevHome > prevAway : prevAway > prevHome;
      const isWinnerAhead = isWinningTeamHome ? ev.homeScore > ev.awayScore : ev.awayScore > ev.homeScore;
      if (!wasWinnerAhead && isWinnerAhead) {
        let stayedAhead = true;
        for (let j = i + 1; j < scoringEvents.length; j++) {
          const futureEv = scoringEvents[j];
          const futureWinnerAhead = isWinningTeamHome ? futureEv.homeScore > futureEv.awayScore : futureEv.awayScore > futureEv.homeScore;
          if (!futureWinnerAhead) {
            stayedAhead = false;
            break;
          }
        }
        if (stayedAhead) {
          lastLeadChange = {
            winningTeamAbbr: winnerAbbr,
            periodLabel: ev.periodLabel,
            clock: ev.clock,
            playerScoreName: ev.playerName || ev.description,
            awayScore: ev.awayScore,
            homeScore: ev.homeScore,
            summary: `Canasta decisiva (${ev.playerName || ev.description}) a falta de ${ev.clock} del ${ev.periodLabel} (${ev.awayScore}-${ev.homeScore}) que dio a ${winnerAbbr} el liderazgo definitivo`
          };
          break;
        }
      }
    }
    const clutchPlays = [];
    for (const ev of scoringEvents) {
      if (ev.period >= 4) {
        const secsRemaining = clockToSec(ev.clock);
        const margin = Math.abs(ev.awayScore - ev.homeScore);
        if (secsRemaining <= 300 && margin <= 5) {
          clutchPlays.push({
            periodLabel: ev.periodLabel,
            clock: ev.clock,
            teamAbbr: ev.teamAbbr,
            description: ev.description,
            scoreMargin: margin
          });
          if (clutchPlays.length >= 6) break;
        }
      }
    }
    const playerHotSpurts = [];
    let currentStreakPlayer = "";
    let currentStreak3PCount = 0;
    let currentStreakPts = 0;
    for (const ev of scoringEvents) {
      const is3P = /\b3pt\b|\btriple\b|\b3-pt\b/i.test(ev.description) || ev.points === 3;
      if (ev.playerName && ev.playerName === currentStreakPlayer) {
        if (is3P) currentStreak3PCount++;
        currentStreakPts += ev.points;
        if (currentStreak3PCount >= 3 || currentStreakPts >= 8) {
          playerHotSpurts.push({
            playerName: ev.playerName,
            teamAbbr: ev.teamAbbr,
            periodLabel: ev.periodLabel,
            clock: ev.clock,
            count3P: currentStreak3PCount,
            points: currentStreakPts,
            summary: currentStreak3PCount >= 3 ? `${ev.playerName} (${ev.teamAbbr}) encaden\xF3 ${currentStreak3PCount} triples consecutivos en el ${ev.periodLabel} (reloj ${ev.clock})` : `${ev.playerName} (${ev.teamAbbr}) firm\xF3 una racha personal de ${currentStreakPts} puntos seguidos en el ${ev.periodLabel} (reloj ${ev.clock})`
          });
          currentStreakPlayer = "";
          currentStreak3PCount = 0;
          currentStreakPts = 0;
        }
      } else {
        currentStreakPlayer = ev.playerName || "";
        currentStreak3PCount = is3P ? 1 : 0;
        currentStreakPts = ev.points;
      }
    }
    const earlyFoulTroubles = [];
    const playerFoulMap = /* @__PURE__ */ new Map();
    for (const a of actions) {
      const actType = String(a?.actionType || "").toLowerCase();
      const desc = String(a?.description || "").toLowerCase();
      const isFoul = actType === "foul" || desc.includes("foul") || desc.includes("falta");
      if (!isFoul) continue;
      const subType = String(a?.subType || "").toLowerCase();
      if (subType.includes("technical") || subType.includes("defense 3 second")) continue;
      const pid = String(a?.personId || a?.playerNameI || a?.playerName || "").trim();
      if (!pid) continue;
      const pName = String(a?.playerNameI || a?.playerName || pid).trim();
      const teamAbbr = String(a?.teamTricode || "").toUpperCase();
      const pNum = Number(a?.period) || 1;
      const clock = parsePbpClockRemaining(a?.clock) || String(a?.clock || "00:00");
      const entry = playerFoulMap.get(pid) || { fouls: 0, logged1Q: false, logged2Q: false };
      const explicitTotal = Number(a?.foulPersonalTotal);
      entry.fouls = Number.isFinite(explicitTotal) && explicitTotal > 0 ? explicitTotal : entry.fouls + 1;
      playerFoulMap.set(pid, entry);
      if (pNum === 1 && entry.fouls >= 3 && !entry.logged1Q) {
        entry.logged1Q = true;
        earlyFoulTroubles.push({
          playerName: pName,
          teamAbbr,
          periodLabel: "1Q",
          clock,
          foulCount: entry.fouls,
          summary: `${pName} (${teamAbbr}) cometi\xF3 su 3\xAA falta en el 1er cuarto (reloj ${clock}) y tuvo que ir al banquillo tempranamente por acumulaci\xF3n de faltas`
        });
      } else if (pNum === 2 && entry.fouls >= 4 && !entry.logged2Q) {
        entry.logged2Q = true;
        earlyFoulTroubles.push({
          playerName: pName,
          teamAbbr,
          periodLabel: "2Q",
          clock,
          foulCount: entry.fouls,
          summary: `${pName} (${teamAbbr}) carg\xF3 con su 4\xAA falta en el 2\xBA cuarto (reloj ${clock}) condicionando su presencia antes del descanso`
        });
      }
    }
    let isClutchGame = false;
    for (const ev of scoringEvents) {
      if (ev.period >= 4) {
        const sec = clockToSec(ev.clock);
        const margin = Math.abs(ev.awayScore - ev.homeScore);
        if (sec <= 120 && margin <= 5) {
          isClutchGame = true;
          break;
        }
      }
    }
    if (!isClutchGame && scoringEvents.length > 0) {
      const lastEv = scoringEvents[scoringEvents.length - 1];
      if (Math.abs(lastEv.awayScore - lastEv.homeScore) <= 5) {
        isClutchGame = true;
      }
    }
    let clutchExecution = null;
    if (isClutchGame) {
      const clutchStats = {
        [awayAbbr]: { teamAbbr: awayAbbr, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, points: 0, turnovers: 0, playerShots: /* @__PURE__ */ new Map() },
        [homeAbbr]: { teamAbbr: homeAbbr, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, points: 0, turnovers: 0, playerShots: /* @__PURE__ */ new Map() }
      };
      for (const a of actions) {
        const pNum = Number(a?.period) || 1;
        if (pNum < 4) continue;
        const clock = parsePbpClockRemaining(a?.clock) || String(a?.clock || "00:00");
        const sec = clockToSec(clock);
        if (sec > 120) continue;
        const actType = String(a?.actionType || "").toLowerCase();
        const subType = String(a?.subType || "").toLowerCase();
        const shotResult = String(a?.shotResult || "").toLowerCase();
        const desc = String(a?.description || "").trim();
        const descLow = desc.toLowerCase();
        let teamAbbr = String(a?.teamTricode || "").toUpperCase();
        if (!teamAbbr || teamAbbr !== awayAbbr && teamAbbr !== homeAbbr) {
          if (descLow.includes(awayAbbr.toLowerCase())) teamAbbr = awayAbbr;
          else if (descLow.includes(homeAbbr.toLowerCase())) teamAbbr = homeAbbr;
        }
        if (teamAbbr !== awayAbbr && teamAbbr !== homeAbbr) continue;
        const teamObj = clutchStats[teamAbbr];
        const rawPlayer = String(a?.playerNameI || a?.playerName || "").trim();
        const pName = rawPlayer || (desc.split(" ")[0] || "Equipo");
        const pEntry = teamObj.playerShots.get(pName) || { name: pName, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, points: 0, turnovers: 0 };
        const is3P = actType === "3pt" || subType.includes("3pt") || descLow.includes("3pt") || descLow.includes("triple") || descLow.includes("3-pt");
        const isFT = actType.includes("freethrow") || descLow.includes("free throw") || descLow.includes("tiro libre");
        const isTurnover = actType.includes("turnover") || descLow.includes("turnover") || descLow.includes("p\xE9rdida") || descLow.includes("bad pass") || descLow.includes("lost ball") || descLow.includes("traveling") || descLow.includes("offensive foul");
        const isMade = shotResult === "made" || descLow.includes("makes") || actType === "made" || Number(a?.pointsTotal) > 0;
        const isMissed = shotResult === "missed" || descLow.includes("misses") || descLow.includes("falla");
        if (isTurnover) {
          teamObj.turnovers++;
          pEntry.turnovers++;
        } else if (isFT) {
          teamObj.fta++;
          pEntry.fta++;
          if (isMade) {
            teamObj.ftm++;
            teamObj.points += 1;
            pEntry.ftm++;
            pEntry.points += 1;
          }
        } else if (isMade || isMissed || actType === "2pt" || actType === "3pt" || actType === "shot") {
          teamObj.fga++;
          pEntry.fga++;
          if (is3P) {
            teamObj.fg3a++;
            pEntry.fg3a++;
          }
          if (isMade) {
            const pts = is3P ? 3 : 2;
            teamObj.fgm++;
            teamObj.points += pts;
            pEntry.fgm++;
            pEntry.points += pts;
            if (is3P) {
              teamObj.fg3m++;
              pEntry.fg3m++;
            }
          }
        }
        teamObj.playerShots.set(pName, pEntry);
      }
      const totalClutchFga = clutchStats[awayAbbr].fga + clutchStats[homeAbbr].fga;
      const totalClutchTov = clutchStats[awayAbbr].turnovers + clutchStats[homeAbbr].turnovers;
      if (totalClutchFga > 0 || totalClutchTov > 0) {
        const winnerStats = clutchStats[winnerAbbr] || { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, points: 0, turnovers: 0, playerShots: /* @__PURE__ */ new Map() };
        const loserStats = clutchStats[loserAbbr] || { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, points: 0, turnovers: 0, playerShots: /* @__PURE__ */ new Map() };
        const winnerPlayers = Array.from(winnerStats.playerShots.values()).filter((p) => p.fga > 0 || p.points > 0 || p.turnovers > 0).sort((a, b) => b.points * 2 + b.fgm - (a.points * 2 + a.fgm));
        const loserPlayers = Array.from(loserStats.playerShots.values()).filter((p) => p.fga > 0 || p.points > 0 || p.turnovers > 0).sort((a, b) => b.points * 2 + b.fgm + b.turnovers - (a.points * 2 + a.fgm + a.turnovers));
        const winnerDetail = winnerPlayers.slice(0, 2).map(
          (p) => `${p.name} (${p.fgm}/${p.fga} TC${p.fg3m > 0 ? `, ${p.fg3m} T3` : ""}${p.points > 0 ? `, ${p.points} pts` : ""})`
        ).join(" y ");
        const loserDetail = loserPlayers.slice(0, 2).map(
          (p) => `${p.name} (${p.fgm}/${p.fga} TC${p.turnovers > 0 ? `, ${p.turnovers} PER` : ""}${p.points > 0 ? `, ${p.points} pts` : ""})`
        ).join(" y ");
        const finalTimeout = timeoutEvents.find((t) => t.period >= 4 && t.clockSec <= 35);
        const winnerLine = `${winnerAbbr} ejecut\xF3 con ${winnerStats.fgm}/${winnerStats.fga} en tiros de campo (${winnerStats.points} pts${winnerStats.fg3m > 0 ? `, ${winnerStats.fg3m} triple(s)` : ""}) y ${winnerStats.turnovers === 0 ? "cero p\xE9rdidas" : `${winnerStats.turnovers} p\xE9rdida(s)`}${winnerDetail ? ` liderado por ${winnerDetail}` : ""}`;
        const loserLine = `${loserAbbr} firm\xF3 ${loserStats.fgm}/${loserStats.fga} TC (${loserStats.points} pts) y ${loserStats.turnovers > 0 ? `${loserStats.turnovers} p\xE9rdida(s) cr\xEDtica(s)` : "cero p\xE9rdidas"}${loserDetail ? ` (${loserDetail})` : ""}`;
        let summaryNarrative = `En los dos minutos finales con el partido en el alambre (margen \u22645 pts), ${winnerLine}, mientras que ${loserLine}`;
        if (finalTimeout) {
          summaryNarrative += `, tras un tiempo muerto solicitado por ${finalTimeout.teamAbbr} a falta de ${finalTimeout.clock} para dise\xF1ar la posesi\xF3n definitiva`;
        }
        clutchExecution = {
          isClutchGame: true,
          summaryNarrative,
          breakdownLine: `${winnerAbbr}: ${winnerStats.fgm}/${winnerStats.fga} TC, ${winnerStats.points} PTS, ${winnerStats.turnovers} PER (${winnerDetail || "sin tiros"}) | ${loserAbbr}: ${loserStats.fgm}/${loserStats.fga} TC, ${loserStats.points} PTS, ${loserStats.turnovers} PER (${loserDetail || "sin tiros"})`,
          winner: { teamAbbr: winnerAbbr, ...winnerStats },
          loser: { teamAbbr: loserAbbr, ...loserStats },
          finalTimeout: finalTimeout ? { teamAbbr: finalTimeout.teamAbbr, clock: finalTimeout.clock } : null
        };
      }
    }
    const keyRun = bestRun.runPoints >= 7 ? bestRun : null;
    const lines = [];
    if (keyRun) lines.push(`- PARCIAL M\xC1XIMO INDEXADO E INTERVENCI\xD3N T\xC1CTICA: ${keyRun.summary}`);
    if (lastLeadChange) lines.push(`- PUNTO DE QUIEBRE Y VENTAJA DEFINITIVA: ${lastLeadChange.summary}`);
    if (clutchExecution && clutchExecution.isClutchGame && clutchExecution.summaryNarrative) {
      lines.push(`- EJECUCI\xD3N CLUTCH EN LOS 2 MINUTOS FINALES (MARGEN \u22645 PTS): ${clutchExecution.summaryNarrative}`);
      if (clutchExecution.breakdownLine) lines.push(`  * Reparto de tiros y p\xE9rdidas: ${clutchExecution.breakdownLine}`);
    }
    if (playerHotSpurts.length > 0) lines.push(`- R\xC1FAGAS Y TRIPLES CONSECUTIVOS DE JUGADOR: ${playerHotSpurts.map((s) => s.summary).join("; ")}`);
    if (earlyFoulTroubles.length > 0) lines.push(`- PROBLEMAS DE FALTAS TEMPRANAS EN TITULARES/ROTACI\xD3N (1Q/2Q): ${earlyFoulTroubles.map((e) => e.summary).join("; ")}`);
    if (clutchPlays.length > 0 && (!clutchExecution || !clutchExecution.isClutchGame)) {
      lines.push(`- ACCIONES CLUTCH (\xDALTIMOS 5 MIN \u22645 PTS): ${clutchPlays.map((c) => `[${c.periodLabel} ${c.clock}] ${c.teamAbbr}: ${c.description} (margen ${c.scoreMargin} pts)`).join("; ")}`);
    }
    return {
      keyRun,
      breakpoint: lastLeadChange,
      clutchPlays,
      clutchExecution,
      playerHotSpurts,
      earlyFoulTroubles,
      formattedDossierBlock: lines.join("\n")
    };
  }
  function formatSpanishScheduleDateTime(dateIso, dateTimeUtc) {
    const monthsEs = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const weekdaysEs = ["Dom", "Lun", "Mar", "Mi\xE9", "Jue", "Vie", "S\xE1b"];
    if (dateTimeUtc && dateTimeUtc.includes("T")) {
      const dt = new Date(dateTimeUtc);
      if (!Number.isNaN(dt.getTime())) {
        const utcHours = dt.getUTCHours();
        const utcMinutes = dt.getUTCMinutes();
        const hasRealTipoff = !(utcHours === 0 && utcMinutes === 0);
        const esDateFmt = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: hasRealTipoff ? "Europe/Madrid" : "UTC" }).format(dt);
        const cleanDate = esDateFmt.replace(/\./g, "");
        if (hasRealTipoff) {
          const esTime = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Madrid" }).format(dt);
          const etTime = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).format(dt);
          return { dateFormatted: cleanDate.charAt(0).toUpperCase() + cleanDate.slice(1), timeFormatted: `${esTime}h ESP (${etTime} ET)` };
        }
      }
    }
    const [y, m, d] = (dateIso || "").slice(0, 10).split("-").map(Number);
    if (y && m && d) {
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const wd = weekdaysEs[dt.getUTCDay()] || "";
      const mo = monthsEs[dt.getUTCMonth()] || "";
      return { dateFormatted: `${wd} ${d} ${mo} ${y}`, timeFormatted: "Horario NBA oficial" };
    }
    return { dateFormatted: dateIso || "Por definir", timeFormatted: "Por confirmar" };
  }
  function computeNextGameFatigue(currentDateIso, nextDateIso) {
    if (!nextDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(currentDateIso) || !/^\d{4}-\d{2}-\d{2}$/.test(nextDateIso)) {
      return { restDays: null, isBackToBackNext: false, fatigueShort: "\u2014", fatigueDetail: "Sin fecha programada", fatigueTone: "slate" };
    }
    const [cy, cm, cd] = currentDateIso.split("-").map(Number);
    const [ny, nm, nd] = nextDateIso.split("-").map(Number);
    const dayDiff = Math.round((Date.UTC(ny, nm - 1, nd) - Date.UTC(cy, cm - 1, cd)) / 864e5);
    if (dayDiff <= 0) {
      return { restDays: null, isBackToBackNext: false, fatigueShort: "\u2014", fatigueDetail: "Por confirmar", fatigueTone: "slate" };
    }
    const restDays = dayDiff - 1;
    if (restDays === 0) {
      return { restDays: 0, isBackToBackNext: true, fatigueShort: "B2B \xB7 0 d\xEDas", fatigueDetail: "Back-to-Back (0 d\xEDas de descanso antes del pr\xF3ximo duelo)", fatigueTone: "rose" };
    }
    if (restDays === 1) {
      return { restDays: 1, isBackToBackNext: false, fatigueShort: "1 d\xEDa", fatigueDetail: "1 d\xEDa de descanso previo (ritmo est\xE1ndar)", fatigueTone: "slate" };
    }
    return { restDays, isBackToBackNext: false, fatigueShort: `${restDays} d\xEDas`, fatigueDetail: restDays >= 3 ? `${restDays} d\xEDas de descanso previo (plantilla descansada)` : `${restDays} d\xEDas de descanso previo`, fatigueTone: "emerald" };
  }
  async function resolveTeamNextGameInfo(params) {
    const { currentEventId, teamObj, recordAfter, fullTeams, gameDate, seasonLabel, scheduleGames, forceRefresh } = params;
    const abbr = teamObj.abbreviation;
    const findTeamIdByAbbr = __name((targetAbbr) => fullTeams.find((t) => t.abbreviation === targetAbbr)?.id, "findTeamIdByAbbr");
    const confPeers = fullTeams.filter((t) => t.conference === teamObj.conference).map((t) => {
      const logs = t.games.filter((g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate).sort((a, b) => b.date.localeCompare(a.date));
      const w = logs.filter((g) => g.result === "W").length;
      const l = logs.length - w;
      const gp = w + l;
      const pct = gp > 0 ? w / gp : 0;
      const diffSum = logs.reduce((s, g) => s + g.differential, 0);
      return { abbr: t.abbreviation, w, l, gp, pct, avgDiff: gp > 0 ? diffSum / gp : 0, logs };
    }).sort((a, b) => b.pct - a.pct || b.w - a.w || b.avgDiff - a.avgDiff);
    const peerIdx = confPeers.findIndex((p) => p.abbr === abbr);
    const conferenceRank = peerIdx >= 0 ? peerIdx + 1 : teamObj.playoffSeed || 1;
    const myLogs = peerIdx >= 0 ? confPeers[peerIdx].logs : teamObj.games.filter((g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate).sort((a, b) => b.date.localeCompare(a.date));
    let streakCode = teamObj.streakCode || "\u2014";
    if (myLogs.length > 0) {
      const firstRes = myLogs[0].result;
      let count = 0;
      for (const lg of myLogs) {
        if (lg.result === firstRes) count++;
        else break;
      }
      streakCode = `${firstRes}${count}`;
    }
    const futureTeamLogs = teamObj.games.filter((g) => g.seasonLabel === seasonLabel && g.eventId !== currentEventId && g.date.slice(0, 10) > gameDate).sort((a, b) => a.date.localeCompare(b.date));
    const nextFromSchedule = scheduleGames.find((sg) => sg.gameId !== currentEventId && sg.dateIso > gameDate && (sg.awayAbbr === abbr || sg.homeAbbr === abbr));
    if (futureTeamLogs.length > 0) {
      const nl = futureTeamLogs[0];
      const nlDate = nl.date.slice(0, 10);
      const matchedSched = scheduleGames.find((sg) => sg.gameId === nl.eventId || sg.dateIso === nlDate && (sg.awayAbbr === abbr || sg.homeAbbr === abbr));
      const hostAbbr = nl.isHome ? abbr : nl.opponentAbbr;
      const hostArena = NBA_TEAM_ARENAS[hostAbbr];
      const dtFmt = formatSpanishScheduleDateTime(nlDate, matchedSched?.dateTimeUtc);
      const fatigue = computeNextGameFatigue(gameDate, nlDate);
      return { hasScheduledGame: true, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: nl.opponentAbbr, opponentName: NBA_TEAMS_MAP[nl.opponentAbbr]?.name || nl.opponentName || nl.opponentAbbr, opponentTeamId: findTeamIdByAbbr(nl.opponentAbbr), isHome: nl.isHome, dateIso: nlDate, dateFormatted: dtFmt.dateFormatted, timeFormatted: dtFmt.timeFormatted, arenaName: matchedSched?.arenaName || hostArena?.arenaName || `Pabell\xF3n ${hostAbbr}`, arenaCity: matchedSched?.arenaCity || hostArena?.arenaCity || "", ...fatigue };
    }
    if (nextFromSchedule) {
      const isHome = nextFromSchedule.homeAbbr === abbr;
      const oppAbbr = isHome ? nextFromSchedule.awayAbbr : nextFromSchedule.homeAbbr;
      const dtFmt = formatSpanishScheduleDateTime(nextFromSchedule.dateIso, nextFromSchedule.dateTimeUtc);
      const fatigue = computeNextGameFatigue(gameDate, nextFromSchedule.dateIso);
      return { hasScheduledGame: true, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: oppAbbr, opponentName: NBA_TEAMS_MAP[oppAbbr]?.name || oppAbbr, opponentTeamId: findTeamIdByAbbr(oppAbbr), isHome, dateIso: nextFromSchedule.dateIso, dateFormatted: dtFmt.dateFormatted, timeFormatted: dtFmt.timeFormatted, arenaName: nextFromSchedule.arenaName, arenaCity: nextFromSchedule.arenaCity, ...fatigue };
    }
    const espnId = ESPN_TEAM_IDS[abbr];
    if (espnId && seasonLabel === "2026-27") {
      try {
        const espnSched = await deps.cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnId}/schedule`, 2 * 60 * 60 * 1e3, {}, 5500, forceRefresh);
        const events = Array.isArray(espnSched?.events) ? espnSched.events : [];
        for (const ev of events) {
          const evUtc = String(ev?.date || "").trim();
          const evIso = evUtc.includes("T") ? utcToEasternDateIso2(evUtc) || evUtc.slice(0, 10) : evUtc.slice(0, 10);
          if (!evIso || evIso <= gameDate) continue;
          const comp = ev?.competitions?.[0];
          const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const meComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") === abbr);
          const oppComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") !== abbr);
          if (!oppComp) continue;
          const oppAbbr = normalizeEspnTeamAbbr(oppComp?.team?.abbreviation || "NBA");
          const isHome = meComp?.homeAway === "home";
          const hostAbbr = isHome ? abbr : oppAbbr;
          const hostArena = NBA_TEAM_ARENAS[hostAbbr];
          const venueName = String(comp?.venue?.fullName || "").trim() || hostArena?.arenaName || `Pabell\xF3n ${hostAbbr}`;
          const venueCity = String(comp?.venue?.address?.city || "").trim() || hostArena?.arenaCity || "";
          const dtFmt = formatSpanishScheduleDateTime(evIso, evUtc);
          const fatigue = computeNextGameFatigue(gameDate, evIso);
          return { hasScheduledGame: true, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: oppAbbr, opponentName: NBA_TEAMS_MAP[oppAbbr]?.name || String(oppComp?.team?.displayName || oppAbbr), opponentTeamId: findTeamIdByAbbr(oppAbbr), isHome, dateIso: evIso, dateFormatted: dtFmt.dateFormatted, timeFormatted: dtFmt.timeFormatted, arenaName: venueName, arenaCity: venueCity, ...fatigue };
        }
      } catch {
      }
    }
    const emptyFatigue = computeNextGameFatigue(gameDate, void 0);
    return { hasScheduledGame: false, record: recordAfter, conference: teamObj.conference, conferenceRank, streakCode, opponentAbbr: "", opponentName: "Calendario regular completado en este tramo", isHome: true, dateFormatted: "Sin pr\xF3ximo encuentro programado", timeFormatted: "\u2014", arenaName: NBA_TEAM_ARENAS[abbr]?.arenaName || "", arenaCity: NBA_TEAM_ARENAS[abbr]?.arenaCity || "", ...emptyFatigue };
  }
  async function computeGameOfficialReportData(eventId, forceRefresh = false, cacheKey = `game_official_report_v6:${eventId}`) {
    const [full, biosMap, scheduleGames] = await Promise.all([deps.getFullLeagueMemory(), deps.getPlayerBiosMap(forceRefresh), fetchLeagueScheduleGames(forceRefresh)]);
    let homeTeamObj;
    let homeLog;
    let awayTeamObj;
    let awayLog;
    const staticSched = STATIC_SCHEDULE_2027.find((s) => s.gameId === eventId) || scheduleGames.find((s) => s.gameId === eventId);
    for (const t of full.teams) {
      const g = t.games.find((x) => x.eventId === eventId);
      if (g) {
        const isHome = staticSched ? t.abbreviation === staticSched.homeAbbr : g.isHome;
        if (isHome) {
          homeTeamObj = t;
          homeLog = { ...g, isHome: true };
        } else {
          awayTeamObj = t;
          awayLog = { ...g, isHome: false };
        }
      }
    }
    if (!homeTeamObj || !homeLog || !awayTeamObj || !awayLog) {
      throw new Error(`Encuentro ${eventId} no encontrado en el registro oficial NBA.`);
    }
    const gameDate = homeLog.date.slice(0, 10);
    const seasonLabel = homeLog.seasonLabel;
    const homeAbbr = homeTeamObj.abbreviation;
    const awayAbbr = awayTeamObj.abbreviation;
    const playerById = /* @__PURE__ */ new Map();
    for (const p of full.allPlayers) {
      playerById.set(p.id, p);
    }
    const espnInjuriesMap = seasonLabel === "2026-27" ? await fetchEspnInjuriesByName(forceRefresh) : /* @__PURE__ */ new Map();
    let cdnGame = null;
    if (/^00\d{8}$/.test(eventId)) {
      const ttl = seasonLabel === "2026-27" ? 10 * 60 * 1e3 : 120 * 60 * 1e3;
      try {
        const bj = await deps.cachedFetchJson(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${eventId}.json`, ttl, NBA_LIVE_HEADERS, 9e3, forceRefresh);
        if (bj && bj.game) {
          cdnGame = bj.game;
        }
      } catch (err) {
        console.warn(`NBA CDN boxscore fallback for ${eventId}:`, err);
      }
    }
    const cdnAwayPeriods = Array.isArray(cdnGame?.awayTeam?.periods) ? cdnGame.awayTeam.periods : [];
    const cdnHomePeriods = Array.isArray(cdnGame?.homeTeam?.periods) ? cdnGame.homeTeam.periods : [];
    let espnEventData = null;
    if (cdnAwayPeriods.length === 0 || cdnHomePeriods.length === 0 || !cdnGame?.attendance || !cdnGame?.officials?.length) {
      try {
        const yyyymmdd = gameDate.replace(/-/g, "");
        const sbData = await deps.cachedFetchJson(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`,
          15 * 60 * 1e3,
          {},
          6500,
          forceRefresh
        );
        const events = Array.isArray(sbData?.events) ? sbData.events : [];
        for (const ev of events) {
          const comp = ev?.competitions?.[0];
          const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const awayComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") === awayAbbr);
          const homeComp = competitors.find((c) => normalizeEspnTeamAbbr(c?.team?.abbreviation || "") === homeAbbr);
          if (awayComp && homeComp) {
            espnEventData = {
              evId: String(ev?.id || ""),
              awayLinescores: Array.isArray(awayComp.linescores) ? awayComp.linescores : [],
              homeLinescores: Array.isArray(homeComp.linescores) ? homeComp.linescores : [],
              attendance: Number(comp?.attendance) || 0,
              officials: Array.isArray(comp?.officials) ? comp.officials.map((o) => String(o?.fullName || o?.displayName || o?.name || "").trim()).filter(Boolean) : [],
              venueName: String(comp?.venue?.fullName || "").trim(),
              venueCity: String(comp?.venue?.address?.city || "").trim()
            };
            break;
          }
        }
      } catch (err) {
        console.warn(`ESPN Scoreboard fallback for ${gameDate} ${awayAbbr}@${homeAbbr}:`, err);
      }
    }
    const fallbackArena = NBA_TEAM_ARENAS[homeAbbr] || { arenaName: `Pabell\xF3n de ${homeTeamObj.shortName}`, arenaCity: homeTeamObj.name };
    const arenaName = String(cdnGame?.arena?.arenaName || "").trim() || String(espnEventData?.venueName || "").trim() || fallbackArena.arenaName;
    const arenaCity = String(cdnGame?.arena?.arenaCity || "").trim() || String(espnEventData?.venueCity || "").trim() || fallbackArena.arenaCity;
    const rawAttendance = Number(cdnGame?.attendance) || Number(espnEventData?.attendance) || 0;
    const attendance = rawAttendance > 0 ? rawAttendance : null;
    const attendanceFormatted = attendance !== null ? `${formatThousandsEs(attendance)} espectadores` : "Aforo oficial NBA";
    const rawDuration = Number(cdnGame?.duration) || 0;
    const durationMinutes = rawDuration > 0 ? rawDuration : 135;
    const cdnOfficials = Array.isArray(cdnGame?.officials) ? cdnGame.officials.map((o) => String(o?.name || "").trim()).filter(Boolean) : [];
    const officials = cdnOfficials.length > 0 ? cdnOfficials : espnEventData?.officials || [];
    const periods = [];
    if (cdnAwayPeriods.length > 0 && cdnHomePeriods.length > 0) {
      const maxLen = Math.max(cdnAwayPeriods.length, cdnHomePeriods.length);
      for (let i = 0; i < maxLen; i++) {
        const ap = cdnAwayPeriods[i];
        const hp = cdnHomePeriods[i];
        const pNum = Number(ap?.period || hp?.period || i + 1);
        const isOt = pNum > 4 || String(ap?.periodType || "").toUpperCase() === "OVERTIME";
        const otIdx = pNum - 4;
        periods.push({ period: pNum, label: isOt ? maxLen > 5 ? `PR${otIdx}` : "PR" : `${pNum}Q`, isOvertime: isOt, awayScore: Number(ap?.score) || 0, homeScore: Number(hp?.score) || 0 });
      }
    } else if (espnEventData && espnEventData.awayLinescores.length > 0 && espnEventData.homeLinescores.length > 0) {
      const maxLen = Math.max(espnEventData.awayLinescores.length, espnEventData.homeLinescores.length);
      for (let i = 0; i < maxLen; i++) {
        const ap = espnEventData.awayLinescores[i];
        const hp = espnEventData.homeLinescores[i];
        const pNum = i + 1;
        const isOt = pNum > 4;
        const otIdx = pNum - 4;
        periods.push({ period: pNum, label: isOt ? maxLen > 5 ? `PR${otIdx}` : "PR" : `${pNum}Q`, isOvertime: isOt, awayScore: Number(ap?.value) || 0, homeScore: Number(hp?.value) || 0 });
      }
    }
    const isOvertime = periods.some((p) => p.isOvertime);
    const overtimeCount = periods.filter((p) => p.isOvertime).length;
    const winnerSideKey = awayLog.pointsFor > homeLog.pointsFor ? "away" : "home";
    const winnerAbbr = winnerSideKey === "away" ? awayAbbr : homeAbbr;
    let decisivePeriodLabel = Math.abs(awayLog.pointsFor - homeLog.pointsFor) <= 5 ? "Desenlace en el clutch final" : `Dominio sostenido de ${winnerAbbr}`;
    if (periods.length > 0) {
      let bestSwing = -999;
      let bestP = periods[0];
      for (const p of periods) {
        const swing = winnerSideKey === "away" ? p.awayScore - p.homeScore : p.homeScore - p.awayScore;
        if (swing > bestSwing) {
          bestSwing = swing;
          bestP = p;
        }
      }
      if (bestP.isOvertime) {
        decisivePeriodLabel = `${bestP.label} (${bestP.awayScore}-${bestP.homeScore} \xB7 +${bestSwing} ${winnerAbbr})`;
      } else if (bestSwing >= 6) {
        decisivePeriodLabel = `${bestP.label} (${bestP.awayScore}-${bestP.homeScore} \xB7 +${bestSwing} ${winnerAbbr})`;
      } else {
        const p4 = periods.find((p) => p.period === 4) || bestP;
        decisivePeriodLabel = `Cierre en ${p4.label} (${p4.awayScore}-${p4.homeScore})`;
      }
    }
    const computeRecordUpToDate = __name((tm) => {
      const slice = tm.games.filter((g) => g.seasonLabel === seasonLabel && g.date.slice(0, 10) <= gameDate);
      const w = slice.filter((g) => g.result === "W").length;
      const l = slice.length - w;
      return `${w}-${l}`;
    }, "computeRecordUpToDate");
    const spanishDetails = [];
    const milestonesList = [];
    const seenSpanishIds = /* @__PURE__ */ new Set();
    const buildSideReport = __name((sideRole, teamObj, teamLog, cdnTeam, oppAbbr) => {
      const abbr = teamObj.abbreviation;
      const isWinner = teamLog.result === "W";
      const starters = [];
      const bench = [];
      const absencesAndDnp = [];
      const playedIdsTonight = /* @__PURE__ */ new Set();
      const listedIdsTonight = /* @__PURE__ */ new Set();
      const cdnPlayers = Array.isArray(cdnTeam?.players) ? cdnTeam.players : [];
      if (cdnPlayers.length > 0) {
        for (const cp of cdnPlayers) {
          const pid = String(cp?.personId || "");
          if (pid) listedIdsTonight.add(pid);
          const bio = pid ? biosMap.get(pid) : void 0;
          const fullName = String(cp?.name || "").trim() || bio?.name || "Jugador NBA";
          const shortName = buildShortPlayerName(fullName, cp?.firstName, cp?.familyName);
          const jersey = sanitizeJersey(cp?.jerseyNum, bio?.jersey);
          const position = String(cp?.position || "").trim() || bio?.position || "JUG";
          const country = bio?.country || "";
          const isSpanish = isSpanishPlayerCheck(fullName, country);
          const playedFlag = String(cp?.played || "") === "1";
          const statusStr = String(cp?.status || "ACTIVE").toUpperCase();
          const minParsed = parseIsoMinutes(cp?.statistics?.minutes);
          if (!playedFlag || statusStr !== "ACTIVE" || minParsed.decimal <= 0) {
            const isActiveOnBench = statusStr === "ACTIVE";
            const category = isActiveOnBench ? "dnp_bench" : "inactive";
            const espnInj = espnInjuriesMap.get(normalizePlain(fullName));
            const classified = classifyAbsenceOrDnp(isActiveOnBench, cp?.notPlayingReason, cp?.notPlayingDescription, espnInj);
            const plMem = pid ? playerById.get(pid) : void 0;
            const sLogs = plMem ? plMem.games.filter((g) => g.seasonLabel === seasonLabel) : [];
            const avgMin = sLogs.length >= 2 ? round1(sLogs.reduce((s, g) => s + g.minutes, 0) / sLogs.length) : void 0;
            const avgPts = sLogs.length >= 2 ? round1(sLogs.reduce((s, g) => s + g.points, 0) / sLogs.length) : void 0;
            const baselineTail = avgMin !== void 0 && avgPts !== void 0 && avgMin >= 12 && classified.statusType !== "coach_decision" && classified.statusType !== "gleague" ? ` \xB7 Media ${avgPts.toFixed(1)} PTS y ${avgMin.toFixed(1)} MIN` : "";
            const enrichedNote = `${classified.note}${baselineTail}`;
            absencesAndDnp.push({ playerId: pid || void 0, name: fullName, jersey, category, statusType: classified.statusType, statusLabel: classified.statusLabel, statusTone: classified.statusTone, priorityRank: classified.priorityRank, ptsAvg: avgPts, minAvg: avgMin, note: enrichedNote, isSpanish });
            if (isSpanish && pid && !seenSpanishIds.has(pid)) {
              seenSpanishIds.add(pid);
              spanishDetails.push({ playerId: pid, name: fullName, jersey, teamAbbr: abbr, played: false, lineSummary: `#${jersey} ${fullName} (${abbr}) \u2014 ${classified.statusLabel}: ${enrichedNote}` });
            }
            continue;
          }
          playedIdsTonight.add(pid);
          const st = cp.statistics || {};
          const pts = Number(st.points) || 0;
          const reb = Number(st.reboundsTotal) || 0;
          const oreb = Number(st.reboundsOffensive) || 0;
          const dreb = Number(st.reboundsDefensive) || 0;
          const ast = Number(st.assists) || 0;
          const stl = Number(st.steals) || 0;
          const blk = Number(st.blocks) || 0;
          const tov = Number(st.turnovers) || 0;
          const pf = Number(st.foulsPersonal) || 0;
          const pm = Number(st.plusMinusPoints) || 0;
          const fgm = Number(st.fieldGoalsMade) || 0;
          const fga = Number(st.fieldGoalsAttempted) || 0;
          const fg3m = Number(st.threePointersMade) || 0;
          const fg3a = Number(st.threePointersAttempted) || 0;
          const ftm = Number(st.freeThrowsMade) || 0;
          const fta = Number(st.freeThrowsAttempted) || 0;
          const fgPct = fga > 0 ? round1(fgm / fga * 100) : 0;
          const fg3Pct = fg3a > 0 ? round1(fg3m / fg3a * 100) : 0;
          const ftPct = fta > 0 ? round1(ftm / fta * 100) : 0;
          const tsDenom = 2 * (fga + 0.44 * fta);
          const tsPct = tsDenom > 0 ? round1(pts / tsDenom * 100) : 0;
          const gmSc = computeHollingerGmSc({ points: pts, fgm, fga, ftm, fta, oreb, dreb, stl, ast, blk, pf, tov });
          const tens = [pts, reb, ast, stl, blk].filter((v) => v >= 10).length;
          const tripleDouble = tens >= 3;
          const doubleDouble = tens === 2;
          const lineObj = { playerId: pid, name: fullName, shortName, jersey, position, country, isSpanish, isStarter: String(cp?.starter || "") === "1", minutes: minParsed.decimal, minutesFormatted: minParsed.formatted, points: pts, rebounds: reb, oreb, dreb, assists: ast, steals: stl, blocks: blk, turnovers: tov, fouls: pf, plusMinus: pm, fgm, fga, fgPct, fg3m, fg3a, fg3Pct, ftm, fta, ftPct, tsPct, gameScore: gmSc, ptsPaint: typeof st.pointsInThePaint === "number" ? st.pointsInThePaint : void 0, ptsFastBreak: typeof st.pointsFastBreak === "number" ? st.pointsFastBreak : void 0, doubleDouble, tripleDouble };
          if (lineObj.isStarter) starters.push(lineObj);
          else bench.push(lineObj);
          if (isSpanish && !seenSpanishIds.has(pid)) {
            seenSpanishIds.add(pid);
            spanishDetails.push({ playerId: pid, name: fullName, jersey, teamAbbr: abbr, played: true, lineSummary: `#${jersey} ${fullName} (${abbr}): ${pts} PTS, ${reb} REB, ${ast} AST en ${minParsed.formatted} min (${fgm}/${fga} TC, ${pm >= 0 ? `+${pm}` : pm})` });
          }
          if (tripleDouble || doubleDouble) {
            milestonesList.push({ playerId: pid, name: fullName, jersey, teamAbbr: abbr, type: tripleDouble ? "TD" : "DD", detail: `#${jersey} ${fullName} (${abbr}): ${pts} PTS \xB7 ${reb} REB \xB7 ${ast} AST${stl >= 10 ? ` \xB7 ${stl} ROB` : ""}${blk >= 10 ? ` \xB7 ${blk} TAP` : ""}` });
          }
        }
      } else {
        const memMatched = [];
        for (const p of full.allPlayers) {
          const g = p.games.find((x) => x.eventId === eventId);
          if (!g) continue;
          const belongsHere = g.opponentAbbr === oppAbbr || g.isHome && sideRole === "home" || !g.isHome && sideRole === "away";
          if (!belongsHere) continue;
          playedIdsTonight.add(p.id);
          listedIdsTonight.add(p.id);
          const bio = biosMap.get(p.id);
          const jersey = sanitizeJersey(p.jersey, bio?.jersey);
          const country = p.country || bio?.country || "";
          const isSpanish = isSpanishPlayerCheck(p.name, country);
          const tens = [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter((v) => v >= 10).length;
          const tripleDouble = tens >= 3;
          const doubleDouble = tens === 2;
          const minParsed = parseIsoMinutes(g.minutes);
          const lineObj = { playerId: p.id, name: p.name, shortName: buildShortPlayerName(p.name), jersey, position: p.position || bio?.position || "JUG", country, isSpanish, isStarter: false, minutes: g.minutes, minutesFormatted: minParsed.formatted, points: g.points, rebounds: g.rebounds, oreb: g.oreb, dreb: g.dreb, assists: g.assists, steals: g.steals, blocks: g.blocks, turnovers: g.turnovers, fouls: g.fouls, plusMinus: g.plusMinus, fgm: g.fgm, fga: g.fga, fgPct: g.fgPct, fg3m: g.fg3m, fg3a: g.fg3a, fg3Pct: g.fg3Pct, ftm: g.ftm, fta: g.fta, ftPct: g.ftPct, tsPct: g.tsPct, gameScore: g.gameScore, ptsPaint: Math.max(0, (g.fgm - g.fg3m) * 2), doubleDouble, tripleDouble };
          memMatched.push(lineObj);
          if (isSpanish && !seenSpanishIds.has(p.id)) {
            seenSpanishIds.add(p.id);
            spanishDetails.push({ playerId: p.id, name: p.name, jersey, teamAbbr: abbr, played: true, lineSummary: `#${jersey} ${p.name} (${abbr}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST en ${minParsed.formatted} min` });
          }
          if (tripleDouble || doubleDouble) {
            milestonesList.push({ playerId: p.id, name: p.name, jersey, teamAbbr: abbr, type: tripleDouble ? "TD" : "DD", detail: `#${jersey} ${p.name} (${abbr}): ${g.points} PTS \xB7 ${g.rebounds} REB \xB7 ${g.assists} AST` });
          }
        }
        memMatched.sort((a, b) => b.minutes - a.minutes);
        memMatched.forEach((pl, idx) => {
          pl.isStarter = idx < 5;
          if (idx < 5) starters.push(pl);
          else bench.push(pl);
        });
      }
      if (seasonLabel === "2026-27") {
        for (const p of full.allPlayers) {
          if (p.teamAbbr !== abbr) continue;
          const bio = biosMap.get(p.id);
          const isSp = isSpanishPlayerCheck(p.name, p.country || bio?.country);
          const seasonGames = p.games.filter((g) => g.seasonLabel === "2026-27");
          if (isSp && !seenSpanishIds.has(p.id)) {
            seenSpanishIds.add(p.id);
            const j = sanitizeJersey(p.jersey, bio?.jersey);
            const spInj = espnInjuriesMap.get(normalizePlain(p.name));
            const spCleanInj = spInj ? translateMedicalDetailEs(spInj.detail) : "";
            spanishDetails.push({ playerId: p.id, name: p.name, jersey: j, teamAbbr: abbr, played: false, lineSummary: spInj ? `#${j} ${p.name} (${abbr}) \u2014 Lesionado: Parte m\xE9dico (${spCleanInj || "baja m\xE9dica"})` : `#${j} ${p.name} (${abbr}) \u2014 Decisi\xF3n t\xE9cnica: Fuera de convocatoria sin parte m\xE9dico activo` });
          }
          if (playedIdsTonight.has(p.id) || listedIdsTonight.has(p.id)) continue;
          if (seasonGames.length < 2) continue;
          const avgMin = seasonGames.reduce((s, g) => s + g.minutes, 0) / seasonGames.length;
          const avgPts = seasonGames.reduce((s, g) => s + g.points, 0) / seasonGames.length;
          if (avgMin >= 14.5) {
            const espnInj = espnInjuriesMap.get(normalizePlain(p.name));
            const cleanInj = espnInj ? translateMedicalDetailEs(espnInj.detail) : "";
            absencesAndDnp.unshift({ playerId: p.id, name: p.name, jersey: sanitizeJersey(p.jersey, bio?.jersey), category: "rotation_absence", statusType: espnInj ? "injury" : "coach_decision", statusLabel: espnInj ? "Lesionado" : "Decisi\xF3n t\xE9cnica", statusTone: espnInj ? "rose" : "slate", priorityRank: espnInj ? 3 : 6, ptsAvg: round1(avgPts), minAvg: round1(avgMin), note: espnInj ? `Parte m\xE9dico: ${cleanInj || "baja m\xE9dica confirmada"} \xB7 Media ${avgPts.toFixed(1)} PTS y ${avgMin.toFixed(1)} MIN` : `Fuera de convocatoria sin parte m\xE9dico activo (media ${avgPts.toFixed(1)} PTS \xB7 ${avgMin.toFixed(1)} MIN)`, isSpanish: isSp });
          }
        }
        for (const b of biosMap.values()) {
          if (b.teamAbbr !== abbr) continue;
          if (isSpanishPlayerCheck(b.name, b.country) && !seenSpanishIds.has(b.id)) {
            seenSpanishIds.add(b.id);
            const j = sanitizeJersey(b.jersey);
            spanishDetails.push({ playerId: b.id, name: b.name, jersey: j, teamAbbr: abbr, played: false, lineSummary: `#${j} ${b.name} (${abbr}): en plantilla oficial, sin participaci\xF3n en el encuentro` });
          }
        }
      }
      starters.sort((a, b) => b.minutes - a.minutes || b.points - a.points);
      bench.sort((a, b) => b.minutes - a.minutes || b.points - a.points);
      const allPlayed = [...starters, ...bench];
      const cdnStats = cdnTeam?.statistics || {};
      const sumFouls = allPlayed.reduce((s, x) => s + x.fouls, 0);
      const sumBenchPts = bench.reduce((s, x) => s + x.points, 0);
      const teamPossEst = teamLog.fga + 0.44 * teamLog.fta + teamLog.tov;
      for (const pl of allPlayed) {
        const plPoss = pl.fga + 0.44 * pl.fta + pl.turnovers;
        if (teamPossEst > 0 && pl.minutes > 0) {
          const usgVal = plPoss / (teamPossEst * (pl.minutes / 48)) * 20;
          pl.usgEst = round1(Math.min(55, Math.max(0, usgVal)));
        } else {
          pl.usgEst = 0;
        }
        const plSummary = playerById.get(pl.playerId);
        const seasonLogs = plSummary ? plSummary.games.filter((g) => g.seasonLabel === seasonLabel && g.minutes > 0) : [];
        const otherSeasonGames = seasonLogs.filter((g) => g.eventId !== eventId);
        if (otherSeasonGames.length >= 1) {
          const totalGamesSample = otherSeasonGames.length + 1;
          const highs = {};
          const evalSeasonHigh = __name((colKey, tonightVal, extractOther, opts) => {
            if (opts?.qualifyTonight === false) return;
            if ((opts?.minPositive ?? true) && tonightVal <= 0) return;
            const eligibleOthers = opts?.qualifyOther ? otherSeasonGames.filter(opts.qualifyOther) : otherSeasonGames;
            if (eligibleOthers.length === 0) return;
            let maxOther = -Infinity;
            let tiedCount = 0;
            const eps = opts?.eps ?? 0.05;
            for (const og of eligibleOthers) {
              const v = extractOther(og);
              if (v > maxOther) maxOther = v;
            }
            if (!Number.isFinite(maxOther)) return;
            for (const og of eligibleOthers) {
              if (Math.abs(extractOther(og) - tonightVal) <= eps) {
                tiedCount++;
              }
            }
            if (tonightVal > maxOther + eps) {
              highs[colKey] = { mode: "sole", prevBest: round1(maxOther), gamesPlayed: totalGamesSample };
            } else if (Math.abs(tonightVal - maxOther) <= eps) {
              if (opts?.skipRoutinePerfectTie && tonightVal >= 99.9 && tiedCount >= 2) {
                return;
              }
              highs[colKey] = { mode: "tied", prevBest: round1(maxOther), gamesPlayed: totalGamesSample };
            }
          }, "evalSeasonHigh");
          evalSeasonHigh("min", pl.minutes, (g) => g.minutes, { eps: 0.09 });
          evalSeasonHigh("pts", pl.points, (g) => g.points);
          evalSeasonHigh("fgm", pl.fgm, (g) => g.fgm);
          evalSeasonHigh("fga", pl.fga, (g) => g.fga);
          evalSeasonHigh("fgPct", pl.fgPct, (g) => g.fgPct, { qualifyTonight: pl.fga >= 4, qualifyOther: __name((g) => g.fga >= 4, "qualifyOther"), eps: 0.15, skipRoutinePerfectTie: true });
          evalSeasonHigh("fg3m", pl.fg3m, (g) => g.fg3m);
          evalSeasonHigh("fg3a", pl.fg3a, (g) => g.fg3a);
          evalSeasonHigh("fg3Pct", pl.fg3Pct, (g) => g.fg3Pct, { qualifyTonight: pl.fg3a >= 3, qualifyOther: __name((g) => g.fg3a >= 3, "qualifyOther"), eps: 0.15, skipRoutinePerfectTie: true });
          evalSeasonHigh("ftm", pl.ftm, (g) => g.ftm);
          evalSeasonHigh("fta", pl.fta, (g) => g.fta);
          evalSeasonHigh("ftPct", pl.ftPct, (g) => g.ftPct, { qualifyTonight: pl.fta >= 4, qualifyOther: __name((g) => g.fta >= 4, "qualifyOther"), eps: 0.15, skipRoutinePerfectTie: true });
          evalSeasonHigh("oreb", pl.oreb, (g) => g.oreb);
          evalSeasonHigh("dreb", pl.dreb, (g) => g.dreb);
          evalSeasonHigh("reb", pl.rebounds, (g) => g.rebounds);
          evalSeasonHigh("ast", pl.assists, (g) => g.assists);
          evalSeasonHigh("stl", pl.steals, (g) => g.steals);
          evalSeasonHigh("blk", pl.blocks, (g) => g.blocks);
          evalSeasonHigh("plusMinus", pl.plusMinus, (g) => g.plusMinus, { minPositive: true });
          evalSeasonHigh("gameScore", pl.gameScore, (g) => g.gameScore, { minPositive: true, eps: 0.09 });
          evalSeasonHigh("tsPct", pl.tsPct, (g) => g.tsPct, { qualifyTonight: pl.fga + pl.fta >= 5, qualifyOther: __name((g) => g.fga + g.fta >= 5, "qualifyOther"), eps: 0.15 });
          evalSeasonHigh("usgEst", pl.usgEst || 0, (g) => g.usgEst || 0, { qualifyTonight: pl.minutes >= 10, qualifyOther: __name((g) => g.minutes >= 10, "qualifyOther"), eps: 0.25 });
          if (Object.keys(highs).length > 0) {
            pl.seasonHighs = highs;
          }
        }
        const hasSeasonBase = seasonLogs.length >= 3;
        const avgMin = hasSeasonBase ? seasonLogs.reduce((s, g) => s + g.minutes, 0) / seasonLogs.length : void 0;
        const avgPts = hasSeasonBase ? seasonLogs.reduce((s, g) => s + g.points, 0) / seasonLogs.length : void 0;
        if (pl.fouls >= 6) {
          absencesAndDnp.unshift({ playerId: pl.playerId, name: pl.name, jersey: pl.jersey, category: "in_game_setback", statusType: "foul_out", statusLabel: "Expulsado (6 faltas)", statusTone: "rose", priorityRank: 1, note: `Expulsado por 6 faltas personales \xB7 ${pl.minutesFormatted} min jugados (${pl.points} PTS \xB7 ${pl.rebounds} REB)`, ptsAvg: avgPts !== void 0 ? round1(avgPts) : void 0, minAvg: avgMin !== void 0 ? round1(avgMin) : void 0, reason: "6 Faltas personales", isSpanish: pl.isSpanish });
        } else if (avgMin !== void 0 && avgPts !== void 0 && avgMin >= 16 && pl.minutes <= Math.min(11.5, avgMin * 0.42)) {
          const espnInj = espnInjuriesMap.get(normalizePlain(pl.name));
          const cleanInj = espnInj ? translateMedicalDetailEs(espnInj.detail) : "";
          absencesAndDnp.unshift({ playerId: pl.playerId, name: pl.name, jersey: pl.jersey, category: "in_game_setback", statusType: "in_game_setback", statusLabel: "Percance en pista", statusTone: "amber", priorityRank: 2, note: `Salida prematura${cleanInj ? ` (${cleanInj})` : ""} \xB7 Solo ${pl.minutesFormatted} min en pista (media habitual: ${avgMin.toFixed(1)} MIN \xB7 ${avgPts.toFixed(1)} PTS)`, ptsAvg: round1(avgPts), minAvg: round1(avgMin), reason: "Retirado prematuramente durante el encuentro", isSpanish: pl.isSpanish });
        }
      }
      absencesAndDnp.sort((a, b) => (a.priorityRank ?? 8) - (b.priorityRank ?? 8) || (b.ptsAvg ?? 0) - (a.ptsAvg ?? 0));
      const totals = { points: teamLog.pointsFor, fgm: teamLog.fgm, fga: teamLog.fga, fgPct: teamLog.fgPct, fg3m: teamLog.fg3m, fg3a: teamLog.fg3a, fg3Pct: teamLog.fg3Pct, ftm: teamLog.ftm, fta: teamLog.fta, ftPct: teamLog.ftPct, reb: teamLog.reb, oreb: teamLog.oreb, dreb: teamLog.dreb, ast: teamLog.ast, stl: teamLog.stl, blk: teamLog.blk, tov: teamLog.tov, fouls: typeof cdnStats.foulsPersonal === "number" ? cdnStats.foulsPersonal : sumFouls, efgPct: teamLog.efgPct, tsPct: teamLog.tsPct, offRtg: teamLog.offRtg, defRtg: teamLog.defRtg, netRtg: teamLog.netRtg, pace: teamLog.pace, ptsPaint: typeof cdnStats.pointsInThePaint === "number" ? cdnStats.pointsInThePaint : Math.round(teamLog.pointsFor * 0.42), ptsFastBreak: typeof cdnStats.pointsFastBreak === "number" ? cdnStats.pointsFastBreak : Math.round(teamLog.pointsFor * 0.14), ptsOffTov: typeof cdnStats.pointsFromTurnovers === "number" ? cdnStats.pointsFromTurnovers : Math.round(teamLog.tov * 1.1), ptsSecondChance: typeof cdnStats.pointsSecondChance === "number" ? cdnStats.pointsSecondChance : Math.round(teamLog.oreb * 1.25), benchPoints: typeof cdnStats.benchPoints === "number" ? cdnStats.benchPoints : sumBenchPts, biggestLead: typeof cdnStats.biggestLead === "number" ? cdnStats.biggestLead : 12, biggestRun: typeof cdnStats.biggestScoringRun === "number" ? cdnStats.biggestScoringRun : 8 };
      const rankedForPodium = [...allPlayed].map((pl) => ({ pl, podiumScore: round1(pl.gameScore + 0.22 * pl.plusMinus + (isWinner ? 1.5 : 0)) })).sort((a, b) => b.podiumScore - a.podiumScore || b.pl.gameScore - a.pl.gameScore || b.pl.points - a.pl.points).slice(0, 3);
      const podium = rankedForPodium.map((item, idx) => ({ stars: 3 - idx, playerId: item.pl.playerId, jersey: item.pl.jersey, name: item.pl.name, position: item.pl.position, points: item.pl.points, rebounds: item.pl.rebounds, assists: item.pl.assists, plusMinus: item.pl.plusMinus, fgm: item.pl.fgm, fga: item.pl.fga, tsPct: item.pl.tsPct, shortLine: `${item.pl.points}P \xB7 ${item.pl.rebounds}R \xB7 ${item.pl.assists}A \xB7 ${item.pl.plusMinus >= 0 ? `+${item.pl.plusMinus}` : item.pl.plusMinus}`, gameScore: item.pl.gameScore, podiumScore: item.podiumScore }));
      const placeholderNextGame = { hasScheduledGame: false, record: computeRecordUpToDate(teamObj), conference: teamObj.conference, conferenceRank: teamObj.playoffSeed || 1, streakCode: teamObj.streakCode || "\u2014", opponentAbbr: "", opponentName: "", isHome: true, dateFormatted: "", timeFormatted: "", arenaName: "", arenaCity: "" };
      return { teamId: teamObj.id, abbr, name: teamObj.name, shortName: teamObj.shortName, recordAfter: placeholderNextGame.record, score: teamLog.pointsFor, isWinner, isBackToBack: teamLog.isBackToBack, starters, bench, totals, absencesAndDnp, podium, nextGame: placeholderNextGame };
    }, "buildSideReport");
    const awaySide = buildSideReport("away", awayTeamObj, awayLog, cdnGame?.awayTeam, homeAbbr);
    const homeSide = buildSideReport("home", homeTeamObj, homeLog, cdnGame?.homeTeam, awayAbbr);
    const fouledOutIds = [...awaySide.absencesAndDnp, ...homeSide.absencesAndDnp].filter((item) => item.statusType === "foul_out" && item.playerId).map((item) => String(item.playerId));
    const [foulOutTimings, awayNextGame, homeNextGame, pbpHighlights] = await Promise.all([
      fetchPlayByPlayFoulOuts(eventId, fouledOutIds, seasonLabel, forceRefresh),
      resolveTeamNextGameInfo({ currentEventId: eventId, teamObj: awayTeamObj, recordAfter: awaySide.recordAfter, fullTeams: full.teams, gameDate, seasonLabel, scheduleGames, forceRefresh }),
      resolveTeamNextGameInfo({ currentEventId: eventId, teamObj: homeTeamObj, recordAfter: homeSide.recordAfter, fullTeams: full.teams, gameDate, seasonLabel, scheduleGames, forceRefresh }),
      fetchPlayByPlayHighlights(eventId, awayAbbr, homeAbbr, winnerAbbr, seasonLabel, forceRefresh)
    ]);
    awaySide.nextGame = awayNextGame;
    homeSide.nextGame = homeNextGame;
    if (foulOutTimings.size > 0) {
      for (const side of [awaySide, homeSide]) {
        const allPl = [...side.starters, ...side.bench];
        for (const item of side.absencesAndDnp) {
          if (item.statusType === "foul_out" && item.playerId) {
            const timing = foulOutTimings.get(item.playerId);
            if (timing) {
              item.foulOutPeriod = timing.periodLabel;
              item.foulOutClock = timing.clockRemaining;
              const plLine = allPl.find((p) => p.playerId === item.playerId);
              const statTail = plLine ? ` \xB7 ${plLine.minutesFormatted} min (${plLine.points} PTS \xB7 ${plLine.rebounds} REB)` : "";
              item.note = `Expulsado por 6 faltas en el ${timing.periodLabel} a falta de ${timing.clockRemaining} (${timing.gameTimeLeft}${timing.fifthFoulDetail})${statTail}`;
            }
          }
        }
      }
    }
    let leaguePaceSum = 0;
    let leaguePaceCount = 0;
    for (const tm of full.teams) {
      for (const gm of tm.games) {
        if (gm.seasonLabel === seasonLabel && gm.pace > 75 && gm.pace < 125) {
          leaguePaceSum += gm.pace;
          leaguePaceCount++;
        }
      }
    }
    const leagueAvgPace = leaguePaceCount > 0 ? round1(leaguePaceSum / leaguePaceCount) : 99.6;
    const matchPace = round1((awaySide.totals.pace + homeSide.totals.pace) / 2 || awaySide.totals.pace);
    const paceDiffVsLeague = round1(matchPace - leagueAvgPace);
    const leadChanges = typeof cdnGame?.homeTeam?.statistics?.leadChanges === "number" ? cdnGame.homeTeam.statistics.leadChanges : null;
    const timesTied = typeof cdnGame?.homeTeam?.statistics?.timesTied === "number" ? cdnGame.homeTeam.statistics.timesTied : null;
    const otSuffix = isOvertime ? overtimeCount > 1 ? ` (${overtimeCount} PR)` : " (PR)" : "";
    const pasoBTitle = `${awaySide.name} vs ${homeSide.name} | ${awaySide.score}-${homeSide.score}${otSuffix} | ${arenaName}, ${arenaCity} (${attendanceFormatted})`;
    const teamComparisonRows = [];
    const pushTeamRow = __name((opts) => {
      const dec = opts.decimals ?? 0;
      const suf = opts.suffix ?? "";
      const rawDiff = opts.awayVal - opts.homeVal;
      let betterSide = "tie";
      if (Math.abs(rawDiff) > 0.04) {
        if (opts.lowerIsBetter) {
          betterSide = opts.awayVal < opts.homeVal ? "away" : "home";
        } else {
          betterSide = opts.awayVal > opts.homeVal ? "away" : "home";
        }
      }
      const winnerAbbrRow = betterSide === "away" ? awaySide.abbr : betterSide === "home" ? homeSide.abbr : "";
      const absStr = dec === 0 ? `${Math.round(Math.abs(rawDiff))}${suf}` : `${Math.abs(rawDiff).toFixed(dec)}${suf}`;
      const diffDisplay = betterSide === "tie" ? "Igualado" : `+${absStr} ${winnerAbbrRow}`;
      teamComparisonRows.push({ key: opts.key, label: opts.label, helpKey: opts.helpKey, awayDisplay: opts.awayDisplay, homeDisplay: opts.homeDisplay, awayNumeric: opts.awayVal, homeNumeric: opts.homeVal, diffDisplay, betterSide, section: opts.section, lowerIsBetter: opts.lowerIsBetter });
    }, "pushTeamRow");
    const at = awaySide.totals;
    const ht = homeSide.totals;
    pushTeamRow({ key: "pts", label: "Puntos Totales", helpKey: "ptsBase", awayVal: at.points, homeVal: ht.points, awayDisplay: `${at.points}`, homeDisplay: `${ht.points}`, section: "scoring_shooting" });
    pushTeamRow({ key: "fg", label: "Tiros de Campo (TC \xB7 %)", helpKey: "fgPct", awayVal: at.fgPct, homeVal: ht.fgPct, awayDisplay: `${at.fgm}/${at.fga} (${at.fgPct.toFixed(1)}%)`, homeDisplay: `${ht.fgm}/${ht.fga} (${ht.fgPct.toFixed(1)}%)`, decimals: 1, suffix: "%", section: "scoring_shooting" });
    pushTeamRow({ key: "fg3", label: "Triples (T3 \xB7 %)", helpKey: "fg3Pct", awayVal: at.fg3Pct, homeVal: ht.fg3Pct, awayDisplay: `${at.fg3m}/${at.fg3a} (${at.fg3Pct.toFixed(1)}%)`, homeDisplay: `${ht.fg3m}/${ht.fg3a} (${ht.fg3Pct.toFixed(1)}%)`, decimals: 1, suffix: "%", section: "scoring_shooting" });
    pushTeamRow({ key: "ft", label: "Tiros Libres (TL \xB7 %)", helpKey: "ftPct", awayVal: at.ftm, homeVal: ht.ftm, awayDisplay: `${at.ftm}/${at.fta} (${at.ftPct.toFixed(1)}%)`, homeDisplay: `${ht.ftm}/${ht.fta} (${ht.ftPct.toFixed(1)}%)`, suffix: " TL", section: "scoring_shooting" });
    pushTeamRow({ key: "efg", label: "Tiro Efectivo (eFG%)", helpKey: "efgPct", awayVal: at.efgPct, homeVal: ht.efgPct, awayDisplay: `${at.efgPct.toFixed(1)}%`, homeDisplay: `${ht.efgPct.toFixed(1)}%`, decimals: 1, suffix: "%", section: "efficiency_tactics" });
    pushTeamRow({ key: "ts", label: "Acierto Real (TS%)", helpKey: "tsPct", awayVal: at.tsPct, homeVal: ht.tsPct, awayDisplay: `${at.tsPct.toFixed(1)}%`, homeDisplay: `${ht.tsPct.toFixed(1)}%`, decimals: 1, suffix: "%", section: "efficiency_tactics" });
    pushTeamRow({ key: "offRtg", label: "Eficiencia Ofensiva (OffRtg)", helpKey: "offRtg", awayVal: at.offRtg, homeVal: ht.offRtg, awayDisplay: `${at.offRtg.toFixed(1)}`, homeDisplay: `${ht.offRtg.toFixed(1)}`, decimals: 1, section: "efficiency_tactics" });
    pushTeamRow({ key: "paint", label: "Puntos en la pintura (PITP)", helpKey: "ptsPaint", awayVal: at.ptsPaint ?? 0, homeVal: ht.ptsPaint ?? 0, awayDisplay: `${at.ptsPaint ?? 0}`, homeDisplay: `${ht.ptsPaint ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "secondChance", label: "Puntos 2\xAA oportunidad", helpKey: "pts2ndChance", awayVal: at.ptsSecondChance ?? 0, homeVal: ht.ptsSecondChance ?? 0, awayDisplay: `${at.ptsSecondChance ?? 0}`, homeDisplay: `${ht.ptsSecondChance ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "fastbreak", label: "Puntos contraataque (FB PTS)", helpKey: "ptsFastBreak", awayVal: at.ptsFastBreak ?? 0, homeVal: ht.ptsFastBreak ?? 0, awayDisplay: `${at.ptsFastBreak ?? 0}`, homeDisplay: `${ht.ptsFastBreak ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "ptsOffTov", label: "Puntos tras p\xE9rdidas", helpKey: "ptsOffTov", awayVal: at.ptsOffTov ?? 0, homeVal: ht.ptsOffTov ?? 0, awayDisplay: `${at.ptsOffTov ?? 0}`, homeDisplay: `${ht.ptsOffTov ?? 0}`, section: "efficiency_tactics" });
    pushTeamRow({ key: "bench", label: "Puntos banquillo", helpKey: "benchPts", awayVal: at.benchPoints, homeVal: ht.benchPoints, awayDisplay: `${at.benchPoints}`, homeDisplay: `${ht.benchPoints}`, section: "efficiency_tactics" });
    const away3PAr = at.fga > 0 ? round1(at.fg3a / at.fga * 100) : 0;
    const home3PAr = ht.fga > 0 ? round1(ht.fg3a / ht.fga * 100) : 0;
    pushTeamRow({ key: "threeRatio", label: "Ratio tiros de 3 (3PAr %)", helpKey: "threeRatio", awayVal: away3PAr, homeVal: home3PAr, awayDisplay: `${away3PAr.toFixed(1)}% (${at.fg3a} int)`, homeDisplay: `${home3PAr.toFixed(1)}% (${ht.fg3a} int)`, decimals: 1, suffix: "%", section: "efficiency_tactics" });
    pushTeamRow({ key: "reb", label: "Rebotes Totales (REB)", helpKey: "rebBase", awayVal: at.reb, homeVal: ht.reb, awayDisplay: `${at.reb} (${at.oreb} OF / ${at.dreb} DEF)`, homeDisplay: `${ht.reb} (${ht.oreb} OF / ${ht.dreb} DEF)`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "oreb", label: "Rebote Ofensivo (OREB \xB7 %)", helpKey: "orebPct", awayVal: at.oreb, homeVal: ht.oreb, awayDisplay: `${at.oreb} (${awayLog.orebPct.toFixed(1)}%)`, homeDisplay: `${ht.oreb} (${homeLog.orebPct.toFixed(1)}%)`, suffix: " OR", section: "reb_playmaking_defense" });
    pushTeamRow({ key: "ast", label: "Asistencias (AST)", helpKey: "astBase", awayVal: at.ast, homeVal: ht.ast, awayDisplay: `${at.ast}`, homeDisplay: `${ht.ast}`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "stl", label: "Robos (ROB)", helpKey: "steals", awayVal: at.stl, homeVal: ht.stl, awayDisplay: `${at.stl}`, homeDisplay: `${ht.stl}`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "blk", label: "Tapones (TAP)", helpKey: "blocks", awayVal: at.blk, homeVal: ht.blk, awayDisplay: `${at.blk}`, homeDisplay: `${ht.blk}`, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "tov", label: "P\xE9rdidas de Bal\xF3n (PER)", helpKey: "tov", awayVal: at.tov, homeVal: ht.tov, awayDisplay: `${at.tov}`, homeDisplay: `${ht.tov}`, lowerIsBetter: true, suffix: " menos", section: "reb_playmaking_defense" });
    pushTeamRow({ key: "tovPct", label: "% P\xE9rdidas (TOV%)", helpKey: "tovPct", awayVal: awayLog.tovPct, homeVal: homeLog.tovPct, awayDisplay: `${awayLog.tovPct.toFixed(1)}%`, homeDisplay: `${homeLog.tovPct.toFixed(1)}%`, decimals: 1, lowerIsBetter: true, suffix: "%", section: "reb_playmaking_defense" });
    const awayAstTov = at.tov > 0 ? round1(at.ast / at.tov) : at.ast;
    const homeAstTov = ht.tov > 0 ? round1(ht.ast / ht.tov) : ht.ast;
    pushTeamRow({ key: "astTov", label: "Ratio Asist / P\xE9rd", helpKey: "astTo", awayVal: awayAstTov, homeVal: homeAstTov, awayDisplay: `${awayAstTov.toFixed(2)}`, homeDisplay: `${homeAstTov.toFixed(2)}`, decimals: 2, section: "reb_playmaking_defense" });
    pushTeamRow({ key: "pf", label: "Faltas Personales (FP)", helpKey: "personalFouls", awayVal: at.fouls, homeVal: ht.fouls, awayDisplay: `${at.fouls}`, homeDisplay: `${ht.fouls}`, lowerIsBetter: true, suffix: " menos", section: "reb_playmaking_defense" });
    const awayPool = [...awaySide.starters, ...awaySide.bench];
    const homePool = [...homeSide.starters, ...homeSide.bench];
    const leaderComparisonRows = [];
    const pickTopLeader = __name((pool, getter, tieBreakMoreMinutes = false) => {
      if (pool.length === 0) return null;
      return [...pool].sort((a, b) => {
        const diff = getter(b) - getter(a);
        if (Math.abs(diff) > 0.01) return diff;
        if (tieBreakMoreMinutes) {
          return b.minutes - a.minutes || b.fga - a.fga;
        }
        if (b.gameScore !== a.gameScore) return b.gameScore - a.gameScore;
        return a.minutes - b.minutes;
      })[0];
    }, "pickTopLeader");
    const playerByNameKey = /* @__PURE__ */ new Map();
    for (const p of full.allPlayers) {
      playerByNameKey.set(normalizePlain(p.name), p);
    }
    const resolvePlayerBaselineLogs = __name((playerId, fullName) => {
      const summary = playerById.get(playerId) || playerByNameKey.get(normalizePlain(fullName));
      if (!summary) return { logs: [] };
      const seasonLogs = summary.games.filter((g) => g.seasonLabel === seasonLabel && g.minutes > 0);
      if (seasonLogs.length >= 2) {
        return { summary, logs: seasonLogs };
      }
      const allActiveLogs = summary.games.filter((g) => g.minutes > 0);
      return { summary, logs: allActiveLogs.length >= 2 ? allActiveLogs : [] };
    }, "resolvePlayerBaselineLogs");
    const avgOf = __name((logs, fn) => {
      if (logs.length === 0) return null;
      const sum = logs.reduce((acc, g) => acc + fn(g), 0);
      return round1(sum / logs.length);
    }, "avgOf");
    const leaderDefs = [{ key: "min", label: "Minutos Jugados", groupLabel: "I. Volumen Base y Tableros", helpKey: "minBase", getter: __name((p) => p.minutes, "getter"), formatStat: __name((p) => `${p.minutesFormatted}`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.minutes), "baselineGetter"), deltaUnit: "m", surgeThreshold: 3, isElite: __name((v) => v >= 38, "isElite"), decimals: 1, diffSuffix: "m" }, { key: "pts", label: "Puntos", groupLabel: "I. Volumen Base y Tableros", helpKey: "ptsBase", getter: __name((p) => p.points, "getter"), formatStat: __name((p) => `${p.points} PTS`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.points), "baselineGetter"), surgeThreshold: 3, isElite: __name((v) => v >= 30, "isElite"), diffSuffix: " PTS" }, { key: "reb", label: "Rebotes Totales", groupLabel: "I. Volumen Base y Tableros", helpKey: "rebBase", getter: __name((p) => p.rebounds, "getter"), formatStat: __name((p) => `${p.rebounds} REB`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.rebounds), "baselineGetter"), surgeThreshold: 2, isElite: __name((v) => v >= 13, "isElite"), diffSuffix: " REB" }, { key: "ast", label: "Asistencias", groupLabel: "I. Volumen Base y Tableros", helpKey: "astBase", getter: __name((p) => p.assists, "getter"), formatStat: __name((p) => `${p.assists} AST`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.assists), "baselineGetter"), surgeThreshold: 1.8, isElite: __name((v) => v >= 10, "isElite"), diffSuffix: " AST" }, { key: "oreb", label: "Rebotes Ofensivos", groupLabel: "I. Volumen Base y Tableros", helpKey: "orebBase", getter: __name((p) => p.oreb, "getter"), formatStat: __name((p) => `${p.oreb} OREB`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.oreb), "baselineGetter"), surgeThreshold: 1.2, isElite: __name((v) => v >= 5, "isElite"), diffSuffix: " OR" }, { key: "tc", label: "Tiros de Campo Anotados", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "fgmMade", getter: __name((p) => p.fgm, "getter"), formatStat: __name((p) => `${p.fgm}/${p.fga} TC`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.fgm), "baselineGetter"), surgeThreshold: 2, isElite: __name((v) => v >= 11, "isElite"), diffSuffix: " TC" }, { key: "fg3m", label: "Triples Anotados", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "fg3m", getter: __name((p) => p.fg3m, "getter"), formatStat: __name((p) => `${p.fg3m}/${p.fg3a} T3`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.fg3m), "baselineGetter"), surgeThreshold: 1.2, isElite: __name((v) => v >= 5, "isElite"), diffSuffix: " T3" }, { key: "tl", label: "Tiros Libres Anotados", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "ftmMade", getter: __name((p) => p.ftm, "getter"), formatStat: __name((p) => `${p.ftm}/${p.fta} TL`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.ftm), "baselineGetter"), surgeThreshold: 1.8, isElite: __name((v) => v >= 8, "isElite"), diffSuffix: " TL" }, { key: "tsPct", label: "Acierto Real (TS%)", groupLabel: "II. Producci\xF3n de Tiro y Eficiencia", helpKey: "tsPct", filter: __name((p) => p.fga >= 6, "filter"), getter: __name((p) => p.tsPct, "getter"), formatStat: __name((p) => `${p.tsPct.toFixed(1)}%`, "formatStat"), baselineGetter: __name((logs, summary) => {
      if (logs.length === 0) return summary?.advanced?.tsPct ?? null;
      const pts = logs.reduce((s, g) => s + g.points, 0);
      const fga = logs.reduce((s, g) => s + g.fga, 0);
      const fta = logs.reduce((s, g) => s + g.fta, 0);
      const denom = 2 * (fga + 0.44 * fta);
      return denom > 0 ? round1(pts / denom * 100) : avgOf(logs, (g) => g.tsPct);
    }, "baselineGetter"), deltaUnit: "%", surgeThreshold: 4.5, isElite: __name((v, p) => p.fga >= 6 && v >= 70, "isElite"), decimals: 1, diffSuffix: "%" }, { key: "tov", label: "P\xE9rdidas", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "leaderTurnovers", getter: __name((p) => p.turnovers, "getter"), formatStat: __name((p) => `${p.turnovers} PER`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.turnovers), "baselineGetter"), surgeThreshold: 0.8, isElite: __name((v) => v <= 1, "isElite"), lowerIsBetter: true, diffSuffix: " menos" }, { key: "astTo", label: "Ratio Asistencias/P\xE9rdidas", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "astTo", filter: __name((p) => p.assists >= 4, "filter"), getter: __name((p) => p.turnovers > 0 ? round1(p.assists / p.turnovers) : p.assists, "getter"), formatStat: __name((p) => `${(p.turnovers > 0 ? round1(p.assists / p.turnovers) : p.assists).toFixed(1)} A/P`, "formatStat"), baselineGetter: __name((logs) => {
      if (logs.length === 0) return null;
      const ast = logs.reduce((s, g) => s + g.assists, 0);
      const tov = logs.reduce((s, g) => s + g.turnovers, 0);
      return round1(ast / Math.max(1, tov));
    }, "baselineGetter"), surgeThreshold: 1, isElite: __name((v, p) => p.assists >= 5 && v >= 4.5, "isElite"), decimals: 1 }, { key: "stl", label: "Robos de Bal\xF3n", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "steals", getter: __name((p) => p.steals, "getter"), formatStat: __name((p) => `${p.steals} ROB`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.steals), "baselineGetter"), surgeThreshold: 0.8, isElite: __name((v) => v >= 3, "isElite"), diffSuffix: " ROB" }, { key: "blk", label: "Tapones", groupLabel: "III. Control de Bal\xF3n y Defensa", helpKey: "blocks", getter: __name((p) => p.blocks, "getter"), formatStat: __name((p) => `${p.blocks} TAP`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.blocks), "baselineGetter"), surgeThreshold: 0.8, isElite: __name((v) => v >= 3, "isElite"), diffSuffix: " TAP" }, { key: "pm", label: "Impacto M\xE1s / Menos", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "plusMinusBase", getter: __name((p) => p.plusMinus, "getter"), formatStat: __name((p) => `${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.plusMinus), "baselineGetter"), surgeThreshold: 4, isElite: __name((v) => v >= 15, "isElite") }, { key: "gmSc", label: "Valoraci\xF3n (GmSc)", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "gmSc", getter: __name((p) => p.gameScore, "getter"), formatStat: __name((p) => `${p.gameScore.toFixed(1)}`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.gameScore), "baselineGetter"), surgeThreshold: 3, isElite: __name((v) => v >= 24, "isElite"), decimals: 1 }, { key: "usgEst", label: "Uso Ofensivo Est. (USG%)", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "usgPct", filter: __name((p) => p.minutes >= 12, "filter"), getter: __name((p) => p.usgEst || 0, "getter"), formatStat: __name((p) => `${(p.usgEst || 0).toFixed(1)}%`, "formatStat"), baselineGetter: __name((logs, summary) => {
      if (seasonLabel === "2026-27" && summary?.advanced?.usgPct) {
        return round1(summary.advanced.usgPct);
      }
      return avgOf(logs, (g) => g.usgEst || 0);
    }, "baselineGetter"), deltaUnit: "%", surgeThreshold: 3, isElite: __name((v) => v >= 32, "isElite"), decimals: 1, diffSuffix: "%" }, { key: "sixthMan", label: "Mejor Suplente (6\xBA Hombre)", groupLabel: "IV. Impacto Avanzado y Rotaci\xF3n", helpKey: "sixthMan", filter: __name((p) => !p.isStarter, "filter"), getter: __name((p) => p.gameScore, "getter"), formatStat: __name((p) => `${p.points}P \xB7 ${p.gameScore.toFixed(1)} GmSc`, "formatStat"), baselineGetter: __name((logs) => avgOf(logs, (g) => g.gameScore), "baselineGetter"), surgeThreshold: 2.5, isElite: __name((v) => v >= 14, "isElite"), decimals: 1, diffSuffix: " GmSc" }];
    const buildLeaderDeltaMeta = __name((val, player, def) => {
      const { summary, logs } = resolvePlayerBaselineLogs(player.playerId, player.name);
      const avg = def.baselineGetter(logs, summary);
      if (avg === null || !Number.isFinite(avg)) return {};
      const rawDelta = round1(val - avg);
      const effectiveDelta = def.lowerIsBetter ? -rawDelta : rawDelta;
      const unit = def.deltaUnit || "";
      const threshold = def.surgeThreshold ?? 1.5;
      let deltaDisplay;
      if (Math.abs(rawDelta) < 0.05) {
        deltaDisplay = "= media";
      } else {
        const signed = rawDelta > 0 ? `+${rawDelta.toFixed(1)}` : rawDelta.toFixed(1);
        deltaDisplay = `${signed}${unit} vs media`;
      }
      const deltaTone = effectiveDelta >= threshold ? "positive" : effectiveDelta <= -threshold ? "negative" : "neutral";
      return { avg, deltaVsAvg: rawDelta, deltaDisplay, deltaTone };
    }, "buildLeaderDeltaMeta");
    for (const def of leaderDefs) {
      const aFiltered = def.filter ? awayPool.filter(def.filter) : awayPool;
      const hFiltered = def.filter ? homePool.filter(def.filter) : homePool;
      const aL = pickTopLeader(aFiltered.length > 0 ? aFiltered : awayPool, def.getter, Boolean(def.lowerIsBetter));
      const hL = pickTopLeader(hFiltered.length > 0 ? hFiltered : homePool, def.getter, Boolean(def.lowerIsBetter));
      if (!aL || !hL) continue;
      const aVal = def.getter(aL);
      const hVal = def.getter(hL);
      const rawDiff = aVal - hVal;
      let betterSide = "tie";
      if (Math.abs(rawDiff) >= 0.05) {
        if (def.lowerIsBetter) {
          betterSide = aVal < hVal ? "away" : "home";
        } else {
          betterSide = aVal > hVal ? "away" : "home";
        }
      }
      const dec = def.decimals ?? 0;
      const suf = def.diffSuffix ?? "";
      const absStr = dec === 0 ? `${Math.round(Math.abs(rawDiff))}${suf}` : `${Math.abs(rawDiff).toFixed(dec)}${suf}`;
      const winAbbr = betterSide === "away" ? awaySide.abbr : betterSide === "home" ? homeSide.abbr : "";
      const diffDisplay = betterSide === "tie" ? "Igualado" : `+${absStr} ${winAbbr}`;
      const awayStatDisplay = def.formatStat(aL);
      const homeStatDisplay = def.formatStat(hL);
      const awayDeltaMeta = buildLeaderDeltaMeta(aVal, aL, def);
      const homeDeltaMeta = buildLeaderDeltaMeta(hVal, hL, def);
      leaderComparisonRows.push({ categoryKey: def.key, categoryLabel: def.label, groupLabel: def.groupLabel, helpKey: def.helpKey, awayPlayerId: aL.playerId, awayJersey: aL.jersey, awayShortName: aL.shortName, awayPlayerName: aL.name, awayStatDisplay, awayFormatted: `#${aL.jersey} ${aL.shortName} (${awayStatDisplay}${awayDeltaMeta.deltaDisplay ? ` \xB7 ${awayDeltaMeta.deltaDisplay}` : ""})`, awayValue: aVal, awayAvg: awayDeltaMeta.avg, awayDeltaVsAvg: awayDeltaMeta.deltaVsAvg, awayDeltaDisplay: awayDeltaMeta.deltaDisplay, awayDeltaTone: awayDeltaMeta.deltaTone, awayIsElite: def.isElite ? def.isElite(aVal, aL) : false, homePlayerId: hL.playerId, homeJersey: hL.jersey, homeShortName: hL.shortName, homePlayerName: hL.name, homeStatDisplay, homeFormatted: `#${hL.jersey} ${hL.shortName} (${homeStatDisplay}${homeDeltaMeta.deltaDisplay ? ` \xB7 ${homeDeltaMeta.deltaDisplay}` : ""})`, homeValue: hVal, homeAvg: homeDeltaMeta.avg, homeDeltaVsAvg: homeDeltaMeta.deltaVsAvg, homeDeltaDisplay: homeDeltaMeta.deltaDisplay, homeDeltaTone: homeDeltaMeta.deltaTone, homeIsElite: def.isElite ? def.isElite(hVal, hL) : false, diffDisplay, lowerIsBetter: def.lowerIsBetter, betterSide });
    }
    const hasSpanishPlayers = spanishDetails.length > 0;
    const spanishSummaryLine = hasSpanishPlayers ? spanishDetails.map((s) => s.lineSummary).join(" \xB7 ") : `Sin representaci\xF3n espa\xF1ola en las plantillas de ${awaySide.shortName} ni ${homeSide.shortName} en este encuentro.`;
    const report = { eventId, date: gameDate, seasonLabel, pasoBTitle, arenaName, arenaCity, attendance, attendanceFormatted, durationMinutes, officials, isOvertime, overtimeCount, decisivePeriodLabel, leadChanges, timesTied, leagueAvgPace, paceDiffVsLeague, periods, away: awaySide, home: homeSide, spanishPlayersReport: { hasSpanishPlayers, summaryLine: spanishSummaryLine, details: spanishDetails }, milestonesList, teamComparisonRows, leaderComparisonRows, pbpHighlights };
    const ttlMs = seasonLabel === "2026-27" ? 10 * 60 * 1e3 : 120 * 60 * 1e3;
    reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, data: report });
    return report;
  }
  async function buildGameOfficialReportData(eventId, forceRefresh = false) {
    const cacheKey = `game_official_report_v6:${eventId}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }
    const inflightKey = `official_report_inflight:${eventId}`;
    const existing = reportInflight.get(inflightKey);
    const existingStart = reportInflightStartedAt.get(inflightKey) || 0;
    if (existing && (!forceRefresh || Date.now() - existingStart < 2500)) {
      return existing;
    }
    const p = computeGameOfficialReportData(eventId, forceRefresh, cacheKey);
    reportInflight.set(inflightKey, p);
    reportInflightStartedAt.set(inflightKey, Date.now());
    try {
      return await p;
    } finally {
      if (reportInflight.get(inflightKey) === p) {
        reportInflight.delete(inflightKey);
        reportInflightStartedAt.delete(inflightKey);
      }
    }
  }
  function buildDeterministicGameNarrative(report) {
    const winner = report.away.isWinner ? report.away : report.home;
    const loser = report.away.isWinner ? report.home : report.away;
    const margin = Math.abs(winner.score - loser.score);
    const wt = winner.totals;
    const lt = loser.totals;
    const wStar = winner.podium[0];
    const wSecond = winner.podium[1];
    const lStar = loser.podium[0];
    const pressHeadline = wStar ? `${winner.shortName} impone su ley ante ${loser.shortName} (${report.away.score}-${report.home.score}) al ritmo de #${wStar.jersey} ${wStar.name}` : `${winner.name} resuelve el pulso ante ${loser.name} (${report.away.score}-${report.home.score}) en ${report.arenaName}`;
    const pressLead = `**${winner.name}** (${winner.recordAfter}) sell\xF3 el triunfo ${report.away.isWinner ? "a domicilio" : "en su pista"} apoyado en un ${wt.efgPct.toFixed(1)}% de tiro efectivo y **el golpe t\xE1ctico asestado en ${report.decisivePeriodLabel}**, dejando sin premio la resistencia de **${loser.name}** (${loser.recordAfter}).`;
    const paceSignStr = report.paceDiffVsLeague >= 0 ? `+${report.paceDiffVsLeague.toFixed(1)}` : report.paceDiffVsLeague.toFixed(1);
    let quarterNarrative = report.periods.length >= 4 ? `El guion por parciales (${report.periods.map((p) => `${p.label}: ${p.awayScore}-${p.homeScore}`).join(", ")}) **encontr\xF3 su punto de ruptura definitivo en ${report.decisivePeriodLabel}**${report.leadChanges !== null ? `, tras un intercambio t\xE1ctico con ${report.leadChanges} cambios de mando y ${report.timesTied ?? 0} empates` : ""}, disput\xE1ndose a un ritmo de ${wt.pace.toFixed(1)} posesiones (${paceSignStr} frente a las ${report.leagueAvgPace.toFixed(1)} de media NBA esta temporada).` : `El encuentro entre **${report.away.shortName}** y **${report.home.shortName}** se defini\xF3 por una renta final de ${margin} tantos (${report.away.score}-${report.home.score}), **imponiendo el control del ritmo competitivo** con ${wt.pace.toFixed(1)} posesiones (${paceSignStr} respecto a las ${report.leagueAvgPace.toFixed(1)} de promedio NBA).`;
    if (report.pbpHighlights?.breakpoint?.summary) {
      quarterNarrative += ` ${report.pbpHighlights.breakpoint.summary}.`;
    }
    let dynamicSpotlight = null;
    if (report.isOvertime) {
      dynamicSpotlight = { title: "Tiempo extra bajo m\xE1xima presi\xF3n", body: `El choque exigi\xF3 ${report.overtimeCount > 1 ? `${report.overtimeCount} pr\xF3rrogas` : "cinco minutos suplementarios"} tras agotarse el tiempo reglamentario en m\xE1xima igualdad, poniendo a prueba las piernas de los titulares y **premiando la ejecuci\xF3n en media pista** de **${winner.shortName}** frente a **${loser.shortName}**.` };
    } else if (report.pbpHighlights?.clutchExecution?.isClutchGame && margin <= 4) {
      dynamicSpotlight = {
        title: "Duelo t\xE1ctico en los dos minutos finales",
        body: `Con el electr\xF3nico comprimido en una o dos posesiones, **la lucidez en la toma de decisiones al l\xEDmite** dict\xF3 sentencia entre **${winner.shortName}** y **${loser.shortName}**. ${report.pbpHighlights.clutchExecution.summaryNarrative}.`
      };
    } else if (Math.abs(wt.benchPoints - lt.benchPoints) >= 16) {
      const benchWinner = wt.benchPoints > lt.benchPoints ? winner.shortName : loser.shortName;
      dynamicSpotlight = { title: `Desequilibrio en los tramos de segunda unidad`, body: `La brecha de banquillos (${wt.benchPoints}-${lt.benchPoints} en puntos de suplentes) **alter\xF3 los minutos de descanso titular**, dando aire constante a la rotaci\xF3n de **${benchWinner}**.` };
    }
    let runAndClutchProse = wt.biggestLead !== null && wt.biggestRun !== null ? `**${winner.shortName}** lleg\xF3 a estirar su ventaja m\xE1xima hasta los +${wt.biggestLead} puntos gracias a una racha de ${wt.biggestRun}-0 que **desarm\xF3 el balance defensivo rival**, sabiendo administrar las posesiones finales ante **${loser.shortName}** sin conceder segundas vidas.` : `En el tramo decisivo, **la gesti\xF3n quir\xFArgica del tempo ofensivo** (${wt.offRtg.toFixed(1)} de eficiencia ofensiva frente a ${lt.offRtg.toFixed(1)}) permiti\xF3 a **${winner.shortName}** blindar el electr\xF3nico frente a **${loser.shortName}**.`;
    if (report.pbpHighlights?.keyRun?.summary) {
      runAndClutchProse += ` El flujo anotador qued\xF3 marcado por el ${report.pbpHighlights.keyRun.summary}.`;
    }
    if (dynamicSpotlight?.title?.includes("dos minutos finales")) {
      runAndClutchProse += ` En los compases finales con el marcador en un pu\xF1o, **${winner.shortName}** impuso su temple en cada posesi\xF3n para no ceder el liderato ante el empuje de **${loser.shortName}**.`;
    } else if (report.pbpHighlights?.clutchExecution?.isClutchGame && report.pbpHighlights.clutchExecution.summaryNarrative) {
      runAndClutchProse += ` ${report.pbpHighlights.clutchExecution.summaryNarrative}.`;
    } else if (report.pbpHighlights?.clutchPlays && report.pbpHighlights.clutchPlays.length > 0) {
      const clutchSummary = report.pbpHighlights.clutchPlays.slice(0, 3).map((c) => `[${c.periodLabel} ${c.clock}] ${c.description}`).join("; ");
      runAndClutchProse += ` En los minutos calientes del clutch, destacaron estas acciones clave: ${clutchSummary}.`;
    }
    const paintAndThreeBattle = wt.ptsPaint !== null && lt.ptsPaint !== null ? `En la pizarra de espacios, **${winner.name}** **domin\xF3 la selecci\xF3n de tiro interior y exterior** con un ${wt.efgPct.toFixed(1)}% en tiro efectivo (${wt.fg3m}/${wt.fg3a} en triples) y ${wt.ptsPaint} puntos en la pintura frente a los ${lt.ptsPaint} de **${loser.shortName}**, mientras que en el rebote el pulso cerr\xF3 ${wt.reb}-${lt.reb} (${wt.oreb} capturas ofensivas del ganador por ${lt.oreb} del rival).` : `En el pulso de los Cuatro Factores, **${winner.name}** **marc\xF3 diferencias desde la eficiencia real de tiro** con un ${wt.efgPct.toFixed(1)}% de acierto efectivo (${wt.fg3m}/${wt.fg3a} desde el per\xEDmetro) frente al ${lt.efgPct.toFixed(1)}% de **${loser.name}**, acompa\xF1ando el acierto con un balance reboteador de ${wt.reb}-${lt.reb}.`;
    const isNonTechnicalAbsence = __name((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague", "isNonTechnicalAbsence");
    const awayMedAbs = report.away.absencesAndDnp.filter(isNonTechnicalAbsence);
    const homeMedAbs = report.home.absencesAndDnp.filter(isNonTechnicalAbsence);
    const benchAndAbsences = `La rotaci\xF3n de segunda unidad aport\xF3 ${wt.benchPoints} puntos en **${winner.shortName}** por ${lt.benchPoints} del banquillo de **${loser.shortName}**${wt.ptsFastBreak !== null && lt.ptsFastBreak !== null ? `, **castigando cada p\xE9rdida a campo abierto** con un parcial de ${wt.ptsFastBreak}-${lt.ptsFastBreak} al contraataque y ${wt.ptsOffTov ?? 0} tantos tras las ${lt.tov} p\xE9rdidas rivales` : `, **penalizando los errores en el manejo** tras las ${lt.tov} p\xE9rdidas de **${loser.shortName}**`}.${awayMedAbs.length > 0 || homeMedAbs.length > 0 ? ` Las rotaciones estuvieron condicionadas por el parte oficial de bajas e incidencias: ${[...awayMedAbs.map((a) => `**${a.name}** (${report.away.abbr} \xB7 ${a.statusLabel || "Baja"}: ${a.note})`), ...homeMedAbs.map((a) => `**${a.name}** (${report.home.abbr} \xB7 ${a.statusLabel || "Baja"}: ${a.note})`)].slice(0, 4).join("; ")}.` : ""}`;
    const xFactorSection = wStar && lStar ? `El tim\xF3n ofensivo perteneci\xF3 a **#${wStar.jersey} ${wStar.name}** (${wStar.points} puntos, ${wStar.rebounds} rebotes, ${wStar.assists} asistencias, GmSc ${wStar.gameScore.toFixed(1)}), **generando ventajas constantes sobre la primera ayuda** de **${loser.shortName}**.

Como Factor X emergi\xF3 ${wSecond ? `**#${wSecond.jersey} ${wSecond.name}** (${wSecond.points} puntos, ${wSecond.rebounds} rebotes y ${wSecond.assists} asistencias, ${wSecond.plusMinus >= 0 ? `+${wSecond.plusMinus}` : wSecond.plusMinus} en pista)` : `el bloque exterior de **${winner.shortName}**`}, **dando continuidad ofensiva a cada tramo sin bal\xF3n**, mientras que en **${loser.name}** la producci\xF3n de **#${lStar.jersey} ${lStar.name}** (${lStar.points} puntos, ${lStar.rebounds} rebotes, ${lStar.assists} asistencias) sostuvo la pelea hasta el desenlace.` : `**El reparto coral en ataque est\xE1tico** de **${winner.name}** inclin\xF3 la balanza en las posesiones calientes del \xFAltimo cuarto ante **${loser.name}**.`;
    const ddProse = report.milestonesList.length > 0 ? `La hoja estad\xEDstica dej\xF3 actuaciones de dobles figuras m\xFAltiples con ${report.milestonesList.map((m) => m.type === "TD" ? `el triple-doble de **${m.detail.replace(/\s*\(.*$/, "")}** (${m.detail.match(/\((.*)\)/)?.[1] || m.detail})` : `el doble-doble de **${m.detail.replace(/\s*\(.*$/, "")}** (${m.detail.match(/\((.*)\)/)?.[1] || m.detail})`).join(", ")}. ` : "";
    const verdictSection = `${ddProse}En la lectura global de scouting, **${winner.name}** (${winner.recordAfter}) **refuerza su solidez competitiva en media pista** firmando ${wt.offRtg.toFixed(1)} puntos por cada 100 posesiones, mientras que **${loser.name}** (${loser.recordAfter}) deber\xE1 corregir el cierre del rebote y el cuidado del bal\xF3n (${lt.tov} p\xE9rdidas) para su siguiente cita.`;
    return { eventId: report.eventId, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), engineMode: "empirical_fallback", pressHeadline, pressLead, gameFlowSection: `${quarterNarrative}

${runAndClutchProse}`, chalkboardSection: `${paintAndThreeBattle}

${benchAndAbsences}`, dynamicSpotlight, xFactorSection, spanishSection: report.spanishPlayersReport.summaryLine, verdictSection, sources: [] };
  }
  async function buildGameNarrativePayload(eventId, forceRefresh = false) {
    const cacheKey = `game_narrative_v9:${eventId}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        if (!(cached.data.engineMode === "empirical_fallback" && getGeminiClient())) {
          return cached.data;
        }
      }
    }
    const existing = reportInflight.get(cacheKey);
    if (existing) {
      return existing;
    }
    const startTime = Date.now();
    const promise = (async () => {
      const isServerless = Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) || process.env.NBA_SNAPSHOT_ONLY === "1";
      const report = await buildGameOfficialReportData(eventId, forceRefresh);
      if (!getGeminiClient()) {
        const fallback = buildDeterministicGameNarrative(report);
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = true;
        return fallback;
      }
      let pressCtx = { byMatchup: /* @__PURE__ */ new Map(), globalNotes: [] };
      try {
        const pressTimeoutMs = isServerless ? 4e3 : 7e3;
        pressCtx = await Promise.race([
          fetchLivePressContext(report.date, forceRefresh),
          new Promise(
            (resolve) => setTimeout(() => resolve({ byMatchup: /* @__PURE__ */ new Map(), globalNotes: [] }), pressTimeoutMs)
          )
        ]);
      } catch {
        pressCtx = { byMatchup: /* @__PURE__ */ new Map(), globalNotes: [] };
      }
      const matchPress = pressCtx.byMatchup.get(`${report.away.abbr}@${report.home.abbr}`);
      const seedSources = [{ uri: `https://www.nba.com/game/${report.away.abbr.toLowerCase()}-vs-${report.home.abbr.toLowerCase()}-${report.eventId}/box-score`, title: `NBA.com Acta Oficial \u2014 ${report.away.abbr} vs ${report.home.abbr}` }, { uri: `https://www.nba.com/game/${report.away.abbr.toLowerCase()}-vs-${report.home.abbr.toLowerCase()}-${report.eventId}/play-by-play`, title: `NBA.com Play-by-Play \u2014 ${report.away.abbr} vs ${report.home.abbr}` }, ...matchPress?.sources || []];
      const formatPlayerDossier = __name((p) => `#${p.jersey} ${p.name} (${p.position}, ${p.isStarter ? "Titular" : "Suplente"}): ${p.points} PTS, ${p.rebounds} REB (${p.oreb} OR), ${p.assists} AST, ${p.steals} ROB, ${p.blocks} TAP, ${p.turnovers} PER, ${p.fgm}/${p.fga} TC, ${p.fg3m}/${p.fg3a} T3, ${p.ftm}/${p.fta} TL, ${p.minutesFormatted} MIN, +/- ${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus}, GmSc ${p.gameScore.toFixed(1)}${p.tripleDouble ? " [TRIPLE-DOBLE]" : p.doubleDouble ? " [DOBLE-DOBLE]" : ""}`, "formatPlayerDossier");
      const verifiedGamePlayers = [...report.away.starters.map((p) => p.name), ...report.away.bench.map((p) => p.name), ...report.away.absencesAndDnp.map((p) => p.name), ...report.home.starters.map((p) => p.name), ...report.home.bench.map((p) => p.name), ...report.home.absencesAndDnp.map((p) => p.name)];
      const dossier = [`AVISO CR\xCDTICO DE MUNDO CERRADO: Fecha real del encuentro ${report.date} (Temporada ${report.seasonLabel}). Tu memoria interna de entrenamiento est\xE1 desactualizada varios a\xF1os respecto a entrenadores actuales, traspasos, contratos y palmar\xE9s. NO des NING\xDAN dato por supuesto fuera de los hechos expl\xEDcitos de este dossier.`, `PARTIDO OFICIAL NBA (${report.date} \xB7 Temporada ${report.seasonLabel}):`, `T\xCDTULO: ${report.pasoBTitle}`, `PARCIALES POR CUARTOS: ${report.periods.length > 0 ? report.periods.map((p) => `${p.label} (${report.away.abbr} ${p.awayScore} - ${p.homeScore} ${report.home.abbr})`).join(" | ") : "Sin desglose parcial"} \xB7 Tramo clave: ${report.decisivePeriodLabel}`, `FLUJO DE MARCADOR: Cambios de l\xEDder=${report.leadChanges ?? "No consta"}, Empates=${report.timesTied ?? "No consta"}, M\xE1xima ventaja ${report.away.abbr}=+${report.away.totals.biggestLead ?? 0} (mejor parcial ${report.away.totals.biggestRun ?? 0}-0), M\xE1xima ventaja ${report.home.abbr}=+${report.home.totals.biggestLead ?? 0} (mejor parcial ${report.home.totals.biggestRun ?? 0}-0).`, `RITMO DEL ENCUENTRO (PACE VS MEDIA NBA): ${report.away.totals.pace.toFixed(1)} posesiones/48m (${report.paceDiffVsLeague >= 0 ? `+${report.paceDiffVsLeague.toFixed(1)}` : report.paceDiffVsLeague.toFixed(1)} frente al promedio oficial NBA ${report.seasonLabel} de ${report.leagueAvgPace.toFixed(1)} posesiones).`, matchPress && matchPress.notes.length > 0 ? `TELETIPO DE PRENSA DE ESTE PARTIDO (${report.date}): ${matchPress.notes.join(" | ")}` : "", report.pbpHighlights?.formattedDossierBlock ? `HITOS PLAY-BY-PLAY (DATOS INDEXADOS EN VIVO EN PISTA):
${report.pbpHighlights.formattedDossierBlock}` : "", ``, `ESTAD\xCDSTICAS COLECTIVAS:`, `- VISITANTE ${report.away.name} (${report.away.abbr}, r\xE9cord ${report.away.recordAfter}${report.away.isBackToBack ? ", en Back-to-Back" : ""}): ${report.away.score} PTS | ${report.away.totals.fgm}/${report.away.totals.fga} TC (${report.away.totals.fgPct}%) | ${report.away.totals.fg3m}/${report.away.totals.fg3a} T3 (${report.away.totals.fg3Pct}%) | ${report.away.totals.ftm}/${report.away.totals.fta} TL | ${report.away.totals.reb} REB (${report.away.totals.oreb} OR) | ${report.away.totals.ast} AST | ${report.away.totals.stl} ROB | ${report.away.totals.blk} TAP | ${report.away.totals.tov} PER | OffRtg ${report.away.totals.offRtg} | eFG% ${report.away.totals.efgPct}% | Pintura: ${report.away.totals.ptsPaint ?? "s/d"} | Contraataque: ${report.away.totals.ptsFastBreak ?? "s/d"} | Tras p\xE9rdida: ${report.away.totals.ptsOffTov ?? "s/d"} | 2\xAA jugada: ${report.away.totals.ptsSecondChance ?? "s/d"} | Banquillo: ${report.away.totals.benchPoints} PTS.`, `- LOCAL ${report.home.name} (${report.home.abbr}, r\xE9cord ${report.home.recordAfter}${report.home.isBackToBack ? ", en Back-to-Back" : ""}): ${report.home.score} PTS | ${report.home.totals.fgm}/${report.home.totals.fga} TC (${report.home.totals.fgPct}%) | ${report.home.totals.fg3m}/${report.home.totals.fg3a} T3 (${report.home.totals.fg3Pct}%) | ${report.home.totals.ftm}/${report.home.totals.fta} TL | ${report.home.totals.reb} REB (${report.home.totals.oreb} OR) | ${report.home.totals.ast} AST | ${report.home.totals.stl} ROB | ${report.home.totals.blk} TAP | ${report.home.totals.tov} PER | OffRtg ${report.home.totals.offRtg} | eFG% ${report.home.totals.efgPct}% | Pintura: ${report.home.totals.ptsPaint ?? "s/d"} | Contraataque: ${report.home.totals.ptsFastBreak ?? "s/d"} | Tras p\xE9rdida: ${report.home.totals.ptsOffTov ?? "s/d"} | 2\xAA jugada: ${report.home.totals.ptsSecondChance ?? "s/d"} | Banquillo: ${report.home.totals.benchPoints} PTS.`, ``, `PLANTILLA ${report.away.abbr} EN PISTA:`, ...[...report.away.starters, ...report.away.bench].map(formatPlayerDossier), `BAJAS M\xC9DICAS / LESIONADOS E INCIDENCIAS EN PISTA ${report.away.abbr}: ${report.away.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").length > 0 ? report.away.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Lesionado"} \u2014 ${a.note}]`).join("; ") : "Ninguna baja m\xE9dica ni incidencia registrada"}`, `SIN MINUTOS POR DECISI\xD3N T\xC9CNICA / G-LEAGUE ${report.away.abbr}: ${report.away.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").length > 0 ? report.away.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Decisi\xF3n t\xE9cnica"} \u2014 ${a.note}]`).join("; ") : "Ninguno"}`, ``, `PLANTILLA ${report.home.abbr} EN PISTA:`, ...[...report.home.starters, ...report.home.bench].map(formatPlayerDossier), `BAJAS M\xC9DICAS / LESIONADOS E INCIDENCIAS EN PISTA ${report.home.abbr}: ${report.home.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").length > 0 ? report.home.absencesAndDnp.filter((a) => a.statusType !== "coach_decision" && a.statusType !== "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Lesionado"} \u2014 ${a.note}]`).join("; ") : "Ninguna baja m\xE9dica ni incidencia registrada"}`, `SIN MINUTOS POR DECISI\xD3N T\xC9CNICA / G-LEAGUE ${report.home.abbr}: ${report.home.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").length > 0 ? report.home.absencesAndDnp.filter((a) => a.statusType === "coach_decision" || a.statusType === "gleague").map((a) => `#${a.jersey} ${a.name} [${a.statusLabel || "Decisi\xF3n t\xE9cnica"} \u2014 ${a.note}]`).join("; ") : "Ninguno"}`, ``, `DETECTOR OFICIAL DE JUGADORES ESPA\xD1OLES: ${report.spanishPlayersReport.summaryLine}`, `DOBLES-DOBLES Y TRIPLES-DOBLES VERIFICADOS: ${report.milestonesList.length > 0 ? report.milestonesList.map((m) => `${m.type}: ${m.detail}`).join(" | ") : "Ninguno en este encuentro"}`, `PODIO CALCULADO: ${report.away.abbr} (${report.away.podium.map((p) => `${"\u2B50".repeat(p.stars)} #${p.jersey} ${p.name}`).join(" | ")}) // ${report.home.abbr} (${report.home.podium.map((p) => `${"\u2B50".repeat(p.stars)} #${p.jersey} ${p.name}`).join(" | ")})`].filter(Boolean).join("\n");
      const systemInstruction = [
        "Eres un periodista s\xE9nior de prensa deportiva espa\xF1ola y scout t\xE1ctico profesional de la NBA (estilo The Athletic, Gigantes del Basket y NBAManiacs).",
        "REGLAS INQUEBRANTABLES DE RIGOR Y MUNDO CERRADO (CERO DATOS POR SUPUESTOS):",
        '1. RIGOR EMP\xCDRICO ABSOLUTO: Usa EXCLUSIVAMENTE las cifras estad\xEDsticas exactas, el pabell\xF3n oficial indicado en T\xCDTULO y la informaci\xF3n expl\xEDcita del dossier adjunto. Jam\xE1s inventes puntos, rebotes, parciales, jugadas concretas segundo a segundo (ej. "triple desde la esquina a falta de 2 segundos") ni dorsales que no figuren en el acta.',
        '2. PROHIBICI\xD3N TOTAL DE DAR DATOS POR SUPUESTOS O USAR MEMORIA PREENTRENADA: Tu conocimiento interno previo est\xE1 desactualizado respecto a la temporada actual. Tienes TERMINANTEMENTE PROHIBIDO dar por supuesto o mencionar: (a) nombres propios o apodos de entrenadores, asistentes o directivos (ej. Tom Thibodeau dej\xF3 los NY Knicks hace a\xF1os; NUNCA cites nombres de entrenadores, usa SIEMPRE "el cuerpo t\xE9cnico de [Equipo]", "la direcci\xF3n t\xE9cnica de [Equipo]" o "la pizarra de [Equipo]"); (b) antig\xFCedad, edad, rondas de Draft, condici\xF3n de rookie, contratos, exequipos o traspasos de jugadores; (c) premios pasados, anillos, "vigente campe\xF3n" o series de temporadas anteriores; (d) puestos exactos en la tabla clasificatoria (ej. "3\xBA del Este") o pr\xF3ximos rivales del calendario; (e) diagn\xF3sticos m\xE9dicos o plazos de recuperaci\xF3n m\xE1s all\xE1 de la nota literal del dossier.',
        '3. PULCRITUD EN BAJAS (LESI\xD3N VS DECISI\xD3N T\xC9CNICA) Y RITMO: Al mencionar ausencias o jugadores sin minutos en PIZARRA_Y_ROTACION o ESPANOLES, s\xE9 escrupulosamente pulcro distinguiendo entre quienes causaron baja por lesi\xF3n / parte m\xE9dico (bloque BAJAS M\xC9DICAS / LESIONADOS) y quienes no participaron por decisi\xF3n t\xE9cnica o asignaci\xF3n a G-League (bloque SIN MINUTOS POR DECISI\xD3N T\xC9CNICA). Jam\xE1s llames "lesionado" a un descarte por decisi\xF3n t\xE9cnica ni viceversa. Integra tambi\xE9n el Pace frente a la media oficial NBA y, si hubo expulsados por 6 faltas, cita cuarto y reloj exactos.',
        "4. REDACCI\xD3N 100% NATURAL Y HUMANA: Escribe en espa\xF1ol de Espa\xF1a fluido, con vocabulario t\xE1ctico aut\xE9ntico (espaciado, pintura, bloqueo directo, ajuste tras descanso, transici\xF3n defensiva, segunda unidad, rebote ofensivo, clutch).",
        '5. CERO CLICH\xC9S NI RELLENO: Prohibido usar "En conclusi\xF3n", "Cabe destacar", "Sin lugar a dudas", "Sin duda" o metatexto. Redacta p\xE1rrafos cohesivos, sin listas de vi\xF1etas ni tablas Markdown.',
        '6. JERARQU\xCDA VISUAL Y \xC9NFASIS EN NEGRITA (**...**): En todos los p\xE1rrafos del cuerpo (ENTRADILLA, GUION_Y_QUIEBRE, PIZARRA_Y_ROTACION, cuerpo de FOCO_ESPECIAL, FACTOR_X_Y_LIDERES, ESPANOLES y VEREDICTO_E_HITOS), utiliza negrita Markdown (**texto**) EXCLUSIVAMENTE para estos tres elementos: (a) nombres de jugadores (incluyendo su dorsal cuando lo cites, ej. **#15 Nikola Joki\u0107**), (b) nombres o apodos oficiales de equipos/franquicias (ej. **Boston Celtics**, **Knicks**), y (c) UNA sola idea t\xE1ctica clave por p\xE1rrafo (una frase corta de 4 a 10 palabras que resuma la clave del juego, ej. **colapsando la pintura tras cada bloqueo directo**). PROHIBIDO poner en negrita cifras o estad\xEDsticas sueltas (como "49 puntos", "12 rebotes" o "58.4%"): int\xE9gralas en texto normal sin formato especial. PROHIBIDO usar ** en TITULAR_PRENSA ni en el t\xEDtulo corto previo a || en FOCO_ESPECIAL.',
        "7. ESTRUCTURA EXACTA DE SALIDA CON ESTAS 8 ETIQUETAS EN MAY\xDASCULAS:",
        "===TITULAR_PRENSA===",
        "(Titular period\xEDstico vibrante y directo de 1 l\xEDnea sobre el partido, sin almohadillas # ni asteriscos **).",
        "===ENTRADILLA===",
        "(Entradilla destacada de 2 l\xEDneas sintetizando la tesis t\xE1ctica y el protagonista del encuentro, aplicando la regla de negritas).",
        "===GUION_Y_QUIEBRE===",
        "(2 p\xE1rrafos fluidos: evoluci\xF3n del partido por cuartos, ritmo comparado con la media NBA, alternancias, rachas anotadoras y el momento exacto donde se rompi\xF3 o decidi\xF3 el choque).",
        "===PIZARRA_Y_ROTACION===",
        "(2 p\xE1rrafos de scouting profundo: ajustes t\xE1cticos colectivos, batallas en pintura/triple/rebote, impacto real diferenciando con pulcritud bajas por lesi\xF3n frente a ausencias por decisi\xF3n t\xE9cnica o expulsiones por faltas con su cuarto/reloj, rendimiento de la segunda unidad y puntos tras p\xE9rdida/contraataque).",
        "===FOCO_ESPECIAL===",
        '(Si el partido tuvo un \xE1ngulo singular \u2014pr\xF3rroga, remontada grande, exhibici\xF3n hist\xF3rica, cortocircuito en el clutch, cl\xEDnica defensiva\u2014, escribe en una l\xEDnea el t\xEDtulo corto sin ** seguido de || y 1 p\xE1rrafo anal\xEDtico con la regla de negritas: ej. "Supervivencia en la pr\xF3rroga || Texto...". Si fue un guion convencional sin \xE1ngulo extra, escribe \xFAnicamente: NINGUNO).',
        "===FACTOR_X_Y_LIDERES===",
        "(2 p\xE1rrafos analizando el duelo de estrellas y qui\xE9n emergi\xF3 como Factor X inesperado para inclinar la balanza, citando siempre dorsales # y cifras reales).",
        "===ESPANOLES===",
        "(Si hay espa\xF1oles en el detector oficial, analiza en 1 p\xE1rrafo su impacto o situaci\xF3n en convocatoria; si NO los hay, escribe UNA SOLA FRASE breve, limpia y directa confirm\xE1ndolo).",
        "===VEREDICTO_E_HITOS===",
        "(2 p\xE1rrafos integrando con total naturalidad los dobles-dobles o triples-dobles verificados y cerrando con el veredicto strictly t\xE1ctico del scout sobre qu\xE9 deja este choque a ambos equipos).",
        '8. INTEGRACI\xD3N FLUIDA DEL PLAY-BY-PLAY (SIN REPETICIONES NI LISTAS ARTIFICIALES): (a) TIEMPOS MUERTOS TRAS PARCIAL: Si el dossier detalla un parcial demoledor que forz\xF3 un tiempo muerto t\xE9cnico (ej. "parcial de 11-0 que oblig\xF3 a parar el partido con tiempo muerto"), int\xE9gralo con soltura en GUION_Y_QUIEBRE sin inventar nombres propios de entrenadores (usa siempre "el cuerpo t\xE9cnico de [Equipo rival]" o "la direcci\xF3n t\xE9cnica de [Equipo rival]"). (b) REPARTO DE TIROS Y P\xC9RDIDAS EN CLUTCH: Si el dossier incluye el bloque de ejecuci\xF3n clutch (\xFAltimos 2 minutos con margen \u22645 pts), sintetiza con solvencia t\xE1ctica c\xF3mo se repartieron los tiros decisivos, qui\xE9n asumi\xF3 la responsabilidad y qu\xE9 p\xE9rdidas de bal\xF3n castigaron al derrotado en GUION_Y_QUIEBRE o FOCO_ESPECIAL, sin enumerar vi\xF1etas mec\xE1nicas. (c) CERO REPETICI\xD3N ENTRE SECCIONES: Distribuye la informaci\xF3n arm\xF3nicamente para no repetir el mismo hecho o cifra exacta en GUION_Y_QUIEBRE y de nuevo en PIZARRA_Y_ROTACION o FOCO_ESPECIAL.'
      ].join("\n");
      try {
        const cascadeBudgetMs = isServerless ? 28e3 : 28e3;
        const geminiCall = generateWithGeminiCascade({
          systemInstruction,
          contents: dossier,
          seedSources,
          isServerless
        });
        const cascadeTimer = new Promise(
          (_, reject) => setTimeout(() => reject(new Error(`Timeout ${cascadeBudgetMs}ms en Vercel/serverless`)), cascadeBudgetMs)
        );
        const { text: rawText, sources } = await Promise.race([geminiCall, cascadeTimer]);
        const safeRawText = sanitizeUnverifiedCoachClaims(rawText, verifiedGamePlayers);
        const parsed = parseDelimitedSections(safeRawText, ["TITULAR_PRENSA", "ENTRADILLA", "GUION_Y_QUIEBRE", "PIZARRA_Y_ROTACION", "FOCO_ESPECIAL", "FACTOR_X_Y_LIDERES", "ESPANOLES", "VEREDICTO_E_HITOS"]);
        const fallback = buildDeterministicGameNarrative(report);
        const payload = { eventId: report.eventId, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), engineMode: "gemini_search", generationTimeMs: Date.now() - startTime, pressHeadline: parsed.TITULAR_PRENSA && parsed.TITULAR_PRENSA.length > 12 ? stripInlineWrapper(parsed.TITULAR_PRENSA) : fallback.pressHeadline, pressLead: parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25 ? parsed.ENTRADILLA : fallback.pressLead, gameFlowSection: parsed.GUION_Y_QUIEBRE && parsed.GUION_Y_QUIEBRE.length > 60 ? parsed.GUION_Y_QUIEBRE : fallback.gameFlowSection, chalkboardSection: parsed.PIZARRA_Y_ROTACION && parsed.PIZARRA_Y_ROTACION.length > 60 ? parsed.PIZARRA_Y_ROTACION : fallback.chalkboardSection, dynamicSpotlight: parseSpotlight(parsed.FOCO_ESPECIAL, fallback.dynamicSpotlight), xFactorSection: parsed.FACTOR_X_Y_LIDERES && parsed.FACTOR_X_Y_LIDERES.length > 50 ? parsed.FACTOR_X_Y_LIDERES : fallback.xFactorSection, spanishSection: parsed.ESPANOLES && parsed.ESPANOLES.length > 12 ? parsed.ESPANOLES : fallback.spanishSection, verdictSection: parsed.VEREDICTO_E_HITOS && parsed.VEREDICTO_E_HITOS.length > 45 ? parsed.VEREDICTO_E_HITOS : fallback.verdictSection, sources };
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + 6 * 60 * 60 * 1e3, data: payload });
        return payload;
      } catch (err) {
        const rawErrStr = String(err instanceof Error ? err.message : err || "timeout/offline");
        const cleanReason = rawErrStr.replace(/[\{\}\"\:]/g, " ").replace(/\s+/g, " ").slice(0, 90);
        console.info(`[RadarNBA] Motor determinista activo para ${eventId} -> ${cleanReason}`);
        const isQuota = isQuotaExhaustedError(err);
        const fallback = buildDeterministicGameNarrative(report);
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = false;
        fallback.quotaExhausted = isQuota;
        fallback.fallbackReason = isQuota ? "quota_exhausted_429" : err instanceof Error ? err.message : String(err);
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1e3, data: fallback });
        return fallback;
      }
    })();
    reportInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      reportInflight.delete(cacheKey);
    }
  }
  function buildDeterministicDailyChronicle(gd, spanishNightNotes, matchEnrichments = /* @__PURE__ */ new Map(), tripleDoublesNight = []) {
    const mvp = gd.mvpOfTheNight;
    const stmt = gd.statementTeamWin;
    const topExp = gd.topExplosion;
    const ptsDiff = gd.pulse.avgTotalPoints - gd.pulse.leagueAvgTotalPoints;
    const brokenList = gd.streakShifts.filter((s) => s.status === "broken");
    const extendedList = gd.streakShifts.filter((s) => s.status === "extended");
    const formatGameScoreline = (m) => {
      const winner = m.away.isWinner ? m.away : m.home;
      const loser = m.away.isWinner ? m.home : m.away;
      return `**${winner.name}** ${winner.score}-${loser.score} ante **${loser.name}**`;
    };
    const sortedByDrama = [...gd.matchups || []].sort((a, b) => a.margin - b.margin || b.totalPoints - a.totalPoints);
    const headlineGame = sortedByDrama[0];
    const hWin = headlineGame ? headlineGame.away.isWinner ? headlineGame.away : headlineGame.home : null;
    const hLose = headlineGame ? headlineGame.away.isWinner ? headlineGame.home : headlineGame.away : null;
    const headline = mvp ? `${mvp.playerName} lidera con ${mvp.points} puntos una jornada de ${gd.pulse.gamesCount} partidos (${gd.pulse.avgTotalPoints.toFixed(1)} pts de media)` : stmt ? `${stmt.teamName} marca el techo colectivo (${stmt.scoreDisplay}) en una jornada de ${gd.pulse.gamesCount} encuentros` : headlineGame && hWin && hLose ? `${hWin.shortName} resuelve el pulso de la noche (${hWin.score}-${hLose.score}) en ${gd.pulse.gamesCount} duelos` : `Radiograf\xEDa t\xE1ctica y scouting completo de los ${gd.pulse.gamesCount} partidos de la jornada NBA`;
    const roadLabel = gd.pulse.roadWinsCount === 1 ? "victoria visitante" : "victorias visitantes";
    const closeLabel = gd.pulse.closeGamesCount === 1 ? "final apretado" : "finales apretados";
    const blowLabel = gd.pulse.blowoutsCount === 1 ? "triunfo" : "triunfos";
    const lead = `La cartelera del ${gd.selectedDate} reuni\xF3 ${gd.pulse.gamesCount} partidos con un promedio de ${gd.pulse.avgTotalPoints.toFixed(1)} puntos combinados (${ptsDiff >= 0 ? `+${ptsDiff.toFixed(1)}` : ptsDiff.toFixed(1)} frente a los ${gd.pulse.leagueAvgTotalPoints.toFixed(1)} de media NBA) y un ritmo de ${gd.pulse.avgPace.toFixed(1)} posesiones. **${gd.pulse.roadWinsCount} ${roadLabel}, ${gd.pulse.closeGamesCount} ${closeLabel} (\u22645 pts) y ${gd.pulse.blowoutsCount} ${blowLabel} por \u226515 tantos** retrataron una noche de marcados contrastes entre exhibiciones individuales y cerrojos defensivos.`;
    const dynamicSections = [];
    const focusMatch = mvp && gd.matchups.find((m) => m.away.abbr === mvp.teamAbbr || m.home.abbr === mvp.teamAbbr) || sortedByDrama[0];
    if (focusMatch) {
      const enr = matchEnrichments.get(focusMatch.eventId);
      const winner = focusMatch.away.isWinner ? focusMatch.away : focusMatch.home;
      const loser = focusMatch.away.isWinner ? focusMatch.home : focusMatch.away;
      const wLog = enr?.winnerLog;
      const lLog = enr?.loserLog;
      const wTop = winner.topPlayer;
      const lTop = loser.topPlayer;
      const pbp = enr?.pbp;
      const p1Parts = [
        `El foco principal de la noche se concentr\xF3 en el pulso entre **${winner.name}** y **${loser.name}** (${winner.score}-${loser.score}), resuelto a favor de **${winner.shortName}** a un ritmo de ${focusMatch.pace.toFixed(1)} posesiones.`
      ];
      if (wLog && lLog) {
        p1Parts.push(
          `**${winner.shortName}** inclin\xF3 la pizarra con un ${wLog.efgPct.toFixed(1)}% de tiro efectivo (${wLog.fgm}/${wLog.fga} TC, ${wLog.fg3m}/${wLog.fg3a} en triples y ${wLog.ftm}/${wLog.fta} en libres) frente al ${lLog.efgPct.toFixed(1)}% de **${loser.shortName}** (${lLog.fgm}/${lLog.fga} TC, ${lLog.fg3m}/${lLog.fg3a} T3), **decantando la balanza desde el cuidado del bal\xF3n (${wLog.tov} p\xE9rdidas frente a ${lLog.tov} del rival)** y un balance de ${wLog.reb}-${lLog.reb} en el rebote (${wLog.oreb} capturas ofensivas).`
        );
      }
      if (pbp?.keyRun?.summary) {
        p1Parts.push(`En la secuencia real de pista destac\xF3 el ${pbp.keyRun.summary}.`);
      }
      const p2Parts = [];
      if (wTop) {
        p2Parts.push(
          `En el plano individual, **${wTop.playerName}** (${winner.abbr}) marc\xF3 el paso con ${wTop.points} puntos, ${wTop.rebounds} rebotes y ${wTop.assists} asistencias (${wTop.fgm}/${wTop.fga} TC, ${wTop.fg3m}/${wTop.fg3a} T3, ${wTop.tsPct.toFixed(1)}% TS en ${Math.round(wTop.minutes)} minutos, ${wTop.plusMinus >= 0 ? `+${wTop.plusMinus}` : wTop.plusMinus} en pista), superando su promedio habitual de ${wTop.ptsBaselineAvg.toFixed(1)} tantos.`
        );
      }
      if (lTop) {
        p2Parts.push(
          `En **${loser.shortName}**, la respuesta de **${lTop.playerName}** (${lTop.points} PTS, ${lTop.rebounds} REB, ${lTop.assists} AST, ${lTop.fgm}/${lTop.fga} TC, ${lTop.tsPct.toFixed(1)}% TS) sostuvo la resistencia${pbp?.clutchExecution?.summaryNarrative ? `, pero ${pbp.clutchExecution.summaryNarrative.charAt(0).toLowerCase()}${pbp.clutchExecution.summaryNarrative.slice(1)}.` : ", insuficiente ante **la mayor profundidad y control de posesiones del vencedor**."}`
        );
      }
      dynamicSections.push({
        kicker: "Foco Principal",
        title: `${winner.shortName} y la lectura t\xE1ctica del ${winner.score}-${loser.score}`,
        body: `${p1Parts.join(" ")}

${p2Parts.join(" ") || (focusMatch.keyTakeawaysSimple || []).join(" ")}`
      });
    }
    const stmtMatch = stmt ? gd.matchups.find((m) => m.away.abbr === stmt.teamAbbr || m.home.abbr === stmt.teamAbbr) : sortedByDrama[sortedByDrama.length - 1];
    if (stmtMatch) {
      const enr = matchEnrichments.get(stmtMatch.eventId);
      const winner = stmtMatch.away.isWinner ? stmtMatch.away : stmtMatch.home;
      const loser = stmtMatch.away.isWinner ? stmtMatch.home : stmtMatch.away;
      const wLog = enr?.winnerLog;
      const lLog = enr?.loserLog;
      const lSeasonAvg = enr?.loserAvgPtsFor || 0;
      const lVsAvg = lSeasonAvg > 0 ? loser.score - lSeasonAvg : 0;
      const c2p1 = wLog && lLog ? `M\xE1s all\xE1 de los marcadores ajustados, la otra gran lectura de la fecha la firm\xF3 **${winner.name}** al imponerse a **${loser.name}** por ${winner.score}-${loser.score} (+${stmtMatch.margin} puntos). La defensa de **${winner.shortName}** dej\xF3 a su oponente en ${loser.score} puntos${lSeasonAvg > 0 ? ` (${lVsAvg >= 0 ? `+${lVsAvg.toFixed(1)}` : lVsAvg.toFixed(1)} frente a su media de ${lSeasonAvg.toFixed(1)})` : ""} con apenas un ${lLog.fgPct.toFixed(1)}% en tiros de campo (${lLog.fgm}/${lLog.fga}) y ${lLog.fg3m}/${lLog.fg3a} en triples, **imponiendo un muro defensivo de ${wLog.stl + wLog.blk} acciones entre robos y tapones (${wLog.stl} ROB, ${wLog.blk} TAP)** y un DefRtg de ${wLog.defRtg.toFixed(1)}.` : `En el bloque de control colectivo, **${winner.name}** marc\xF3 territorio ante **${loser.name}** (${winner.score}-${loser.score}) con +${winner.netRtg.toFixed(1)} de diferencial neto y **una ejecuci\xF3n impecable en ambos tableros**.`;
      const closeMatches = gd.matchups.filter((m) => m.margin <= 6);
      const c2p2 = closeMatches.length > 0 ? `En contraste, los ${closeMatches.length} encuentros resueltos por 6 o menos puntos (${closeMatches.slice(0, 3).map(formatGameScoreline).join(", ")}) premiaron a quienes protegieron el bal\xF3n y cargaron el rebote ofensivo: en toda la cartelera, las escuadras ganadoras promediaron ${round1(gd.matchups.reduce((acc, m) => acc + (m.away.isWinner ? m.away.tov : m.home.tov), 0) / Math.max(1, gd.matchups.length)).toFixed(1)} p\xE9rdidas frente a ${round1(gd.matchups.reduce((acc, m) => acc + (m.away.isWinner ? m.home.tov : m.away.tov), 0) / Math.max(1, gd.matchups.length)).toFixed(1)} de los derrotados, **confirmando el peso decisivo de la econom\xEDa de posesiones**.` : `A nivel global de cartelera, el contraste entre los ${gd.pulse.blowoutsCount} triunfos holgados (\u226515 pts) y el ritmo medio de ${gd.pulse.avgPace.toFixed(1)} posesiones reflej\xF3 c\xF3mo los equipos con mejor balance entre tiro interior y acierto exterior (${gd.pulse.avgTotalPoints.toFixed(1)} pts combinados por duelo) **rompieron los partidos antes del \xFAltimo cuarto**.`;
      dynamicSections.push({
        kicker: "Segundo Foco",
        title: `Cerrojo colectivo de ${winner.shortName} y econom\xEDa de posesiones`,
        body: `${c2p1}

${c2p2}`
      });
    }
    const pizarrasParagraphs = (gd.matchups || []).slice(0, 3).map((m) => {
      const enr = matchEnrichments.get(m.eventId);
      const winner = m.away.isWinner ? m.away : m.home;
      const loser = m.away.isWinner ? m.home : m.away;
      const wLog = enr?.winnerLog;
      const lLog = enr?.loserLog;
      if (wLog && lLog) {
        const w2m = Math.max(0, wLog.fgm - wLog.fg3m);
        const w2a = Math.max(0, wLog.fga - wLog.fg3a);
        const l2m = Math.max(0, lLog.fgm - lLog.fg3m);
        const l2a = Math.max(0, lLog.fga - lLog.fg3a);
        return `En el ${winner.score}-${loser.score} entre **${winner.name}** y **${loser.name}**, la pizarra de **${winner.shortName}** produjo ${wLog.offRtg.toFixed(1)} puntos por 100 posesiones (${w2m}/${w2a} en tiros de dos, ${wLog.fg3m}/${wLog.fg3a} en triples y ${wLog.ast} asistencias sobre ${wLog.fgm} canastas), mientras que **${loser.shortName}** qued\xF3 en ${lLog.offRtg.toFixed(1)} OffRtg (${l2m}/${l2a} T2, ${lLog.tov} p\xE9rdidas) bajo ${wLog.stl} robos y ${wLog.blk} tapones rivales.`;
      }
      return `En el triunfo de **${winner.name}** ante **${loser.name}** (${winner.score}-${loser.score}), **${winner.shortName}** registr\xF3 ${winner.efgPct.toFixed(1)}% eFG, ${winner.ast} asistencias y ${winner.tov} p\xE9rdidas frente a las ${loser.tov} del rival.`;
    });
    const pizarrasSection = pizarrasParagraphs.join("\n\n") || `El an\xE1lisis colectivo registr\xF3 un ritmo medio de ${gd.pulse.avgPace.toFixed(1)} posesiones por 48 minutos.`;
    const hitosSection = [
      mvp ? `**Exhibici\xF3n de la Noche**: **${mvp.playerName}** (${mvp.teamAbbr} ${mvp.isHome ? "vs" : "@"} ${mvp.opponentAbbr}, ${mvp.result}) lider\xF3 la jornada con ${mvp.points} puntos, ${mvp.rebounds} rebotes y ${mvp.assists} asistencias (${mvp.fgm}/${mvp.fga} TC, ${mvp.fg3m}/${mvp.fg3a} T3, ${mvp.ftm}/${mvp.fta} TL, ${mvp.tsPct.toFixed(1)}% TS, ${mvp.gameScore.toFixed(1)} GmSc en ${Math.round(mvp.minutes)} min), elev\xE1ndose +${mvp.ptsDelta.toFixed(1)} sobre su media de ${mvp.ptsBaselineAvg.toFixed(1)} PTS.` : "",
      tripleDoublesNight.length > 0 ? `**Triples-Dobles de la Jornada**: ${tripleDoublesNight.join("; ")}.` : "",
      topExp && (!mvp || topExp.playerId !== mvp.playerId) ? `**Explosi\xF3n Estad\xEDstica**: **${topExp.playerName}** (${topExp.teamAbbr} ${topExp.isHome ? "vs" : "@"} ${topExp.opponentAbbr}) alcanz\xF3 los ${topExp.points} puntos (+${topExp.ptsDelta.toFixed(1)} respecto a su media de ${topExp.ptsAvg.toFixed(1)}) con ${topExp.fgm}/${topExp.fga} TC, ${topExp.fg3m}/${topExp.fg3a} en triples y ${topExp.tsPct.toFixed(1)}% TS.` : "",
      gd.slumps.length > 0 ? `**Frenazos a Referentes**: **${gd.slumps[0].playerName}** (${gd.slumps[0].teamAbbr}) qued\xF3 reducido a ${gd.slumps[0].points} puntos (${gd.slumps[0].ptsDelta.toFixed(1)} vs su media de ${gd.slumps[0].ptsAvg.toFixed(1)}) con ${gd.slumps[0].fgm}/${gd.slumps[0].fga} TC (${gd.slumps[0].tsPct.toFixed(1)}% TS) en ${Math.round(gd.slumps[0].minutes)} minutos.` : "",
      gd.roleShifts.length > 0 ? `**Irrupciones de Minutos y Rol**: Destacaron en la rotaci\xF3n ${gd.roleShifts.slice(0, 3).map((r) => `**${r.playerName}** (${r.teamAbbr}: ${r.points} PTS, ${r.rebounds} REB, ${r.assists} AST en ${r.minutes.toFixed(0)} min, +${r.minutesDelta.toFixed(1)} vs media)`).join("; ")}.` : "",
      brokenList.length > 0 || extendedList.length > 0 ? `**Rachas**: ${extendedList.slice(0, 2).map((ex) => `**${ex.playerName}** (${ex.teamAbbr}) prolong\xF3 a ${ex.streakCount} partidos seguidos su serie en ${ex.thresholdLabel} (${ex.nightValueDisplay} hoy)`).join("; ")}${brokenList.length > 0 ? `${extendedList.length > 0 ? ". " : ""}Se cort\xF3 la racha de ${brokenList[0].streakCount} encuentros de **${brokenList[0].playerName}** (${brokenList[0].thresholdLabel}, hoy ${brokenList[0].nightValueDisplay}).` : "."}` : ""
    ].filter(Boolean).join("\n\n");
    const espanolesSection = spanishNightNotes.length > 0 ? `Acta de jugadores espa\xF1oles: ${spanishNightNotes.join("; ")}.` : "Ning\xFAn jugador espa\xF1ol sum\xF3 minutos en pista durante los encuentros disputados en esta fecha del calendario NBA.";
    const clavesList = (gd.matchups || []).slice(0, 4).map((m, idx) => {
      const winner = m.away.isWinner ? m.away : m.home;
      const loser = m.away.isWinner ? m.home : m.away;
      const enr = matchEnrichments.get(m.eventId);
      const wLog = enr?.winnerLog;
      const lLog = enr?.loserLog;
      const topP = winner.topPlayer;
      const rawKey = m.keyTakeawaysAdvanced && m.keyTakeawaysAdvanced[0] || m.keyTakeawaysSimple && m.keyTakeawaysSimple[0] || "";
      const cleanKey = rawKey.replace(/\*\*/g, "").trim();
      const titles = [
        `${winner.abbr} ${winner.score}-${loser.score} ${loser.abbr}: ${topP ? topP.playerName : winner.shortName}`,
        `Pizarra de ${winner.shortName} ante ${loser.shortName}`,
        `Pulso estad\xEDstico en ${m.away.abbr} @ ${m.home.abbr}`,
        `Factor decisivo de ${winner.shortName} (+${m.margin} pts)`
      ];
      let detail = cleanKey;
      if (wLog && lLog) {
        detail = `**${winner.name}** venci\xF3 ${winner.score}-${loser.score} a **${loser.name}** con ${wLog.efgPct.toFixed(1)}% eFG (${wLog.fgm}/${wLog.fga} TC, ${wLog.fg3m}/${wLog.fg3a} T3), ${wLog.tov} p\xE9rdidas frente a ${lLog.tov} del rival y ${wLog.reb}-${lLog.reb} en rebotes${topP ? `, guiado por **${topP.playerName}** (${topP.points} PTS, ${topP.rebounds} REB, ${topP.assists} AST, ${topP.tsPct.toFixed(1)}% TS)` : ""}.`;
      } else if (topP) {
        detail = `**${winner.name}** super\xF3 a **${loser.name}** (${winner.score}-${loser.score}) con **${topP.playerName}** firmando ${topP.points} PTS, ${topP.rebounds} REB y ${topP.assists} AST (${topP.fgm}/${topP.fga} TC).`;
      }
      return {
        title: titles[idx] || `${winner.abbr} ${winner.score}-${loser.score} ${loser.abbr}`,
        detail
      };
    });
    return {
      date: gd.selectedDate,
      seasonLabel: gd.seasonLabel,
      gamesCount: gd.pulse.gamesCount,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      engineMode: "empirical_fallback",
      missingApiKey: !getGeminiClient(),
      headline: sanitizeEditorialSpanishGrammar(headline),
      lead: sanitizeEditorialSpanishGrammar(lead),
      dynamicSections,
      pizarrasSection: sanitizeEditorialSpanishGrammar(pizarrasSection),
      hitosSection: sanitizeEditorialSpanishGrammar(hitosSection || lead),
      espanolesSection: sanitizeEditorialSpanishGrammar(espanolesSection),
      clavesList,
      spanishPlayersSummary: spanishNightNotes.length > 0 ? spanishNightNotes.join(" \xB7 ") : "Sin participaci\xF3n en pista de jugadores espa\xF1oles registrada en los partidos de esta fecha.",
      sources: []
    };
  }
  async function buildGameDayChroniclePayload(requestedDate, forceRefresh = false) {
    const gd = await deps.getGameDayPayload(requestedDate, forceRefresh);
    const cacheKey = `gameday_chronicle_v9:${gd.selectedDate}`;
    if (!forceRefresh) {
      const cached = reportMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        if (cached.data.engineMode === "gemini_search" || !getGeminiClient()) {
          return cached.data;
        }
      }
    }
    const existing = reportInflight.get(cacheKey);
    if (existing) {
      return existing;
    }
    const promise = (async () => {
      const startTime = Date.now();
      const [full, biosMap, pressCtx] = await Promise.all([deps.getFullLeagueMemory(), deps.getPlayerBiosMap(false), fetchLivePressContext(gd.selectedDate, forceRefresh)]);
      const spanishNightNotes = [];
      const tripleDoublesNight = [];
      const doubleDoublesNight = [];
      const verifiedNightPlayerNames = [];
      const eventIdsToday = new Set(gd.matchups.map((m) => m.eventId));
      let totalDoubleDoubles = 0;
      const teamByAbbr = /* @__PURE__ */ new Map();
      for (const tm of full.teams) {
        teamByAbbr.set(tm.abbreviation, tm);
      }
      for (const p of full.allPlayers) {
        const g = p.games.find((x) => eventIdsToday.has(x.eventId) || x.date.slice(0, 10) === gd.selectedDate);
        if (!g) continue;
        verifiedNightPlayerNames.push(p.name);
        const bio = biosMap.get(p.id);
        const isSp = isSpanishPlayerCheck(p.name, p.country || bio?.country);
        if (isSp) {
          spanishNightNotes.push(`#${sanitizeJersey(p.jersey, bio?.jersey)} ${p.name} (${p.teamAbbr} ${g.isHome ? "vs" : "@"} ${g.opponentAbbr}, ${g.result}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST, ${g.fgm}/${g.fga} TC (${g.fg3m}/${g.fg3a} T3) en ${Math.round(g.minutes)} MIN`);
        }
        const tens = [g.points, g.rebounds, g.assists, g.steals, g.blocks].filter((v) => v >= 10).length;
        if (tens >= 3) {
          tripleDoublesNight.push(`${p.name} (${p.teamAbbr} ${g.isHome ? "vs" : "@"} ${g.opponentAbbr}, ${g.result}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST (${g.fgm}/${g.fga} TC, ${g.fg3m}/${g.fg3a} T3, ${g.tsPct.toFixed(1)}% TS, ${Math.round(g.minutes)} MIN, ${g.plusMinus >= 0 ? `+${g.plusMinus}` : g.plusMinus} +/-)`);
        } else if (tens === 2) {
          totalDoubleDoubles++;
          if (doubleDoublesNight.length < 8) {
            doubleDoublesNight.push(`${p.name} (${p.teamAbbr} vs ${g.opponentAbbr}): ${g.points} PTS, ${g.rebounds} REB, ${g.assists} AST (${g.fgm}/${g.fga} TC)`);
          }
        }
      }
      const matchEnrichments = /* @__PURE__ */ new Map();
      for (const m of gd.matchups) {
        const awayTeamObj = teamByAbbr.get(m.away.abbr);
        const homeTeamObj = teamByAbbr.get(m.home.abbr);
        const awayLog = awayTeamObj?.games?.find((x) => x.eventId === m.eventId) || null;
        const homeLog = homeTeamObj?.games?.find((x) => x.eventId === m.eventId) || null;
        const winnerIsAway = m.away.isWinner;
        matchEnrichments.set(m.eventId, {
          awayLog,
          homeLog,
          winnerLog: winnerIsAway ? awayLog : homeLog,
          loserLog: winnerIsAway ? homeLog : awayLog,
          awayAvgPtsFor: awayTeamObj?.avgPointsFor || 0,
          homeAvgPtsFor: homeTeamObj?.avgPointsFor || 0,
          winnerAvgPtsFor: winnerIsAway ? awayTeamObj?.avgPointsFor || 0 : homeTeamObj?.avgPointsFor || 0,
          loserAvgPtsFor: winnerIsAway ? homeTeamObj?.avgPointsFor || 0 : awayTeamObj?.avgPointsFor || 0,
          pbp: null
        });
      }
      const marqueeEventIds = /* @__PURE__ */ new Set();
      const closeSorted = [...gd.matchups].filter((m) => m.margin <= 8).sort((a, b) => a.margin - b.margin);
      for (const cm of closeSorted.slice(0, 2)) marqueeEventIds.add(cm.eventId);
      if (gd.mvpOfTheNight) {
        const mvpMatch = gd.matchups.find((m) => m.away.abbr === gd.mvpOfTheNight.teamAbbr || m.home.abbr === gd.mvpOfTheNight.teamAbbr);
        if (mvpMatch) marqueeEventIds.add(mvpMatch.eventId);
      }
      if (gd.statementTeamWin) {
        const stmtMatch = gd.matchups.find((m) => m.away.abbr === gd.statementTeamWin.teamAbbr || m.home.abbr === gd.statementTeamWin.teamAbbr);
        if (stmtMatch) marqueeEventIds.add(stmtMatch.eventId);
      }
      if (marqueeEventIds.size < 2) {
        for (const m of gd.matchups.slice(0, 2)) marqueeEventIds.add(m.eventId);
      }
      const pbpTargets = [...marqueeEventIds].slice(0, 4).map((eid) => gd.matchups.find((m) => m.eventId === eid)).filter(Boolean);
      if (pbpTargets.length > 0) {
        try {
          const pbpBatch = await Promise.race([
            Promise.all(
              pbpTargets.map(async (m) => {
                const winnerAbbr = m.away.isWinner ? m.away.abbr : m.home.abbr;
                const h = await fetchPlayByPlayHighlights(m.eventId, m.away.abbr, m.home.abbr, winnerAbbr, gd.seasonLabel, forceRefresh);
                return { eventId: m.eventId, h };
              })
            ),
            new Promise((resolve) => setTimeout(() => resolve([]), 3500))
          ]);
          if (Array.isArray(pbpBatch)) {
            for (const item of pbpBatch) {
              if (item?.eventId && item?.h) {
                const enr = matchEnrichments.get(item.eventId);
                if (enr) enr.pbp = item.h;
              }
            }
          }
        } catch {
        }
      }
      if (!getGeminiClient() || gd.matchups.length === 0) {
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes, matchEnrichments, tripleDoublesNight);
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = !getGeminiClient();
        fallback.fallbackReason = !getGeminiClient() ? "missing_api_key" : "no_matchups";
        return fallback;
      }
      const formatTopRotLine = (playersList) => {
        return (playersList || []).slice(0, 3).map(
          (p) => `${p.playerName} (${p.points}P/${p.rebounds}R/${p.assists}A${p.steals ? `/${p.steals}ROB` : ""}${p.blocks ? `/${p.blocks}TAP` : ""}, ${p.fgm}/${p.fga} TC, ${p.fg3m}/${p.fg3a} T3, ${p.ftm}/${p.fta} TL, ${p.tsPct.toFixed(1)}% TS, ${p.turnovers} PER, ${Math.round(p.minutes)}m, ${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus} +/-; media ${p.ptsBaselineAvg.toFixed(1)} PTS)`
        ).join(" | ");
      };
      const formatDetailedTeamLine = (side, log, seasonAvgPts) => {
        if (!log) {
          return `${side.abbr}: ${side.score} PTS (${side.fg3m}/${side.fg3a} T3, ${side.efgPct.toFixed(1)}% eFG, ${side.reb} REB, ${side.ast} AST, ${side.tov} PER, OffRtg ${side.offRtg.toFixed(1)}, DefRtg ${side.defRtg.toFixed(1)})`;
        }
        const fg2m = Math.max(0, log.fgm - log.fg3m);
        const fg2a = Math.max(0, log.fga - log.fg3a);
        const fg2Pct = fg2a > 0 ? (fg2m / fg2a * 100).toFixed(1) : "0.0";
        const fgPct = log.fga > 0 ? (log.fgm / log.fga * 100).toFixed(1) : "0.0";
        const vsMedia = seasonAvgPts > 0 ? ` [vs media equipo ${seasonAvgPts.toFixed(1)}: ${side.score - seasonAvgPts >= 0 ? "+" : ""}${(side.score - seasonAvgPts).toFixed(1)}]` : "";
        return `${side.abbr}: ${side.score} PTS${vsMedia} | ${log.fgm}/${log.fga} TC (${fgPct}%) | ${fg2m}/${fg2a} T2 (${fg2Pct}%) | ${log.fg3m}/${log.fg3a} T3 (${side.fg3Pct.toFixed(1)}%) | ${log.ftm}/${log.fta} TL | ${log.reb} REB (${log.oreb} OR) | ${log.ast} AST | ${log.stl} ROB | ${log.blk} TAP | ${log.tov} PER | eFG ${log.efgPct.toFixed(1)}% | TS ${log.tsPct.toFixed(1)}% | OffRtg ${log.offRtg.toFixed(1)} / DefRtg ${log.defRtg.toFixed(1)} / NetRtg ${log.netRtg >= 0 ? "+" : ""}${log.netRtg.toFixed(1)}`;
      };
      const detailedMatchupBlocks = gd.matchups.map((m) => {
        const enr = matchEnrichments.get(m.eventId);
        const pbpLines = [];
        if (enr?.pbp) {
          if (enr.pbp.keyRun?.summary) pbpLines.push(`Parcial/TM: ${enr.pbp.keyRun.summary}`);
          if (enr.pbp.breakpoint?.summary) pbpLines.push(`Quiebre: ${enr.pbp.breakpoint.summary}`);
          if (enr.pbp.clutchExecution?.summaryNarrative) pbpLines.push(`Clutch 2min: ${enr.pbp.clutchExecution.summaryNarrative}`);
          if (enr.pbp.playerHotSpurts?.length) pbpLines.push(`Rachas PBP: ${enr.pbp.playerHotSpurts.map((s) => s.summary).join("; ")}`);
          if (enr.pbp.earlyFoulTroubles?.length) pbpLines.push(`Faltas tempranas PBP: ${enr.pbp.earlyFoulTroubles.map((f) => f.summary).join("; ")}`);
        }
        return [
          `PARTIDO: ${m.away.name} (${m.away.abbr} ${m.away.recordAfter || ""}${m.away.isBackToBack ? ", B2B" : ""}) ${m.away.score} - ${m.home.score} ${m.home.name} (${m.home.abbr} ${m.home.recordAfter || ""}${m.home.isBackToBack ? ", B2B" : ""}) [${m.contextTag} \xB7 Margen ${m.margin} \xB7 Pace ${m.pace.toFixed(1)}]`,
          `  - ${formatDetailedTeamLine(m.away, enr?.awayLog, enr?.awayAvgPtsFor || 0)}`,
          `  - ${formatDetailedTeamLine(m.home, enr?.homeLog, enr?.homeAvgPtsFor || 0)}`,
          `  - L\xEDderes ${m.away.abbr}: ${formatTopRotLine(m.away.rotationPlayers)}`,
          `  - L\xEDderes ${m.home.abbr}: ${formatTopRotLine(m.home.rotationPlayers)}`,
          `  - Claves anal\xEDticas: ${m.keyTakeawaysAdvanced.map((k) => k.replace(/\*\*/g, "")).join(" / ")}`,
          pbpLines.length > 0 ? `  - Hitos Play-by-Play en pista: ${pbpLines.join(" | ")}` : ""
        ].filter(Boolean).join("\n");
      });
      const daySeedSources = [{ uri: `https://www.nba.com/games?date=${gd.selectedDate}`, title: `NBA.com \u2014 Resultados y Actas Oficiales (${gd.selectedDate})` }, ...pressCtx.daySources].slice(0, 6);
      const dayDossier = [
        `AVISO CR\xCDTICO DE MUNDO CERRADO: Jornada oficial NBA del ${gd.selectedDate} (Temporada ${gd.seasonLabel}). Tu memoria interna de entrenamiento est\xE1 desactualizada varios a\xF1os respecto a entrenadores actuales, traspasos, contratos y palmar\xE9s. NO des NING\xDAN dato por supuesto fuera de los hechos expl\xEDcitos de este dossier.`,
        `FECHA DE LA JORNADA NBA: ${gd.selectedDate} (Temporada ${gd.seasonLabel})`,
        `PULSO GLOBAL: ${gd.pulse.gamesCount} partidos disputados | Media puntos combinados: ${gd.pulse.avgTotalPoints.toFixed(1)} PTS (media liga: ${gd.pulse.leagueAvgTotalPoints.toFixed(1)}) | Finales apretados (<=5 pts): ${gd.pulse.closeGamesCount} | Palizas (>=15 pts): ${gd.pulse.blowoutsCount} | Victorias visitantes: ${gd.pulse.roadWinsCount}/${gd.pulse.gamesCount} | Ritmo medio (Pace): ${gd.pulse.avgPace.toFixed(1)}.`,
        gd.statementTeamWin ? `GOLPE EN LA MESA COLECTIVO: ${gd.statementTeamWin.teamName} (${gd.statementTeamWin.summaryAdvanced}).` : "",
        pressCtx.dayNotes.length > 0 ? `TELETIPOS DE PRENSA DE LOS PARTIDOS DE ESTA FECHA (${gd.selectedDate}):
${pressCtx.dayNotes.slice(0, 12).map((n) => `  \u2022 ${n}`).join("\n")}` : "",
        ``,
        `QUINTETO IDEAL DE LA NOCHE (TOP 5 GAME SCORE):`,
        ...gd.idealFive.map((p, i) => `${i + 1}. ${p.playerName} (${p.teamAbbr} ${p.isHome ? "vs" : "@"} ${p.opponentAbbr}, ${p.result}): ${p.points} PTS, ${p.rebounds} REB, ${p.assists} AST, ${p.stocks} ROB+TAP, ${p.fgm}/${p.fga} TC, ${p.fg3m}/${p.fg3a} T3, ${p.ftm}/${p.fta} TL, ${p.tsPct.toFixed(1)}% TS, ${p.turnovers} PER, ${Math.round(p.minutes)} MIN, ${p.plusMinus >= 0 ? `+${p.plusMinus}` : p.plusMinus} +/-, GmSc ${p.gameScore.toFixed(1)} (su media es ${p.ptsBaselineAvg.toFixed(1)} PTS)`),
        ``,
        `DESGLOSE EMP\xCDRICO COMPLETO DE LOS ${gd.matchups.length} PARTIDOS:`,
        ...detailedMatchupBlocks,
        ``,
        `EXPLOSIONES FRENTE A SU MEDIA: ${gd.explosions.length > 0 ? gd.explosions.slice(0, 6).map((e) => `${e.playerName} (${e.teamAbbr} ${e.isHome ? "vs" : "@"} ${e.opponentAbbr}, ${e.result}): ${e.points} PTS (+${e.ptsDelta.toFixed(1)} vs media ${e.ptsAvg.toFixed(1)}), ${e.fgm}/${e.fga} TC, ${e.fg3m}/${e.fg3a} T3, ${e.tsPct.toFixed(1)}% TS, ${e.rebounds} REB, ${e.assists} AST, ${e.stocks} STK en ${Math.round(e.minutes)} MIN [${e.driverTag}]`).join(" | ") : "Ninguna extrema"}`,
        `BATACAZOS DE TITULARES: ${gd.slumps.length > 0 ? gd.slumps.slice(0, 5).map((s) => `${s.playerName} (${s.teamAbbr} vs ${s.opponentAbbr}, ${s.result}): ${s.points} PTS (${s.ptsDelta.toFixed(1)} vs media ${s.ptsAvg.toFixed(1)}), ${s.fgm}/${s.fga} TC, ${s.fg3m}/${s.fg3a} T3, ${s.tsPct.toFixed(1)}% TS, ${s.turnovers} PER en ${Math.round(s.minutes)} MIN [${s.driverTag}]`).join(" | ") : "Ninguno acusado"}`,
        `CAMBIOS DE ROL / PICOS DE MINUTOS: ${gd.roleShifts.length > 0 ? gd.roleShifts.slice(0, 4).map((r) => `${r.playerName} (${r.teamAbbr} vs ${r.opponentAbbr}): ${r.minutes.toFixed(0)} MIN (+${r.minutesDelta.toFixed(1)} vs media ${r.minutesAvg.toFixed(0)}), ${r.usgEst.toFixed(1)}% USG, ${r.points}P/${r.rebounds}R/${r.assists}A con ${r.fga} TCI`).join(" | ") : "Rotaciones estables"}`,
        `RACHAS DESTACADAS: ${gd.streakShifts.length > 0 ? gd.streakShifts.slice(0, 6).map((st) => `${st.playerName} (${st.teamAbbr} vs ${st.opponentAbbr}): ${st.status === "broken" ? `RACHA ROTA tras ${st.streakCount} PJ` : `PROLONGA a ${st.streakCount} PJ`} en ${st.thresholdLabel} (${st.nightValueDisplay} hoy, media racha ${st.avgDuringStreak})`).join(" | ") : "Sin rachas largas alteradas"}`,
        `TRIPLES-DOBLES DE LA NOCHE: ${tripleDoublesNight.length > 0 ? tripleDoublesNight.join(" | ") : "Ninguno"} (Total dobles-dobles en la jornada: ${totalDoubleDoubles}${doubleDoublesNight.length > 0 ? `; destacados: ${doubleDoublesNight.slice(0, 4).join(" | ")}` : ""}).`,
        `JUGADORES ESPA\xD1OLES EN LA JORNADA: ${spanishNightNotes.length > 0 ? spanishNightNotes.join(" | ") : "Ning\xFAn jugador espa\xF1ol sum\xF3 minutos en pista esta fecha."}`
      ].filter(Boolean).join("\n");
      const systemInstruction = [
        "Eres el analista jefe y cronista de scouting NBA de referencia en Espa\xF1a. Cada ma\xF1ana escribes la gran revista editorial de la jornada para que un lector exigente entienda en pocos minutos qu\xE9 ocurri\xF3 exactamente y por qu\xE9 se ganaron o perdieron los partidos.",
        "REGLAS INQUEBRANTABLES DE RIGOR, CONCRECI\xD3N Y PRUEBA NUM\xC9RICA:",
        "1. RIGOR EMP\xCDRICO TOTAL: Todos los marcadores, puntos, series de tiro, porcentajes, p\xE9rdidas, rebotes, r\xE9cords y rachas que cites deben coincidir al 100% con el dossier adjunto. Jam\xE1s inventes resultados, cifras ni jugadas concretas no descritas.",
        '2. PROHIBICI\xD3N DE DAR DATOS POR SUPUESTOS: Tienes TERMINANTEMENTE PROHIBIDO mencionar: (a) nombres propios o apodos de entrenadores, asistentes o directivos (usa SIEMPRE "el cuerpo t\xE9cnico de [Equipo]", "la direcci\xF3n t\xE9cnica de [Equipo]" o "la pizarra de [Equipo]"); (b) antig\xFCedad, edad, rondas de Draft, condici\xF3n de rookie, contratos, exequipos o traspasos de jugadores; (c) premios pasados, anillos o series de temporadas anteriores; (d) puestos exactos en la clasificaci\xF3n o pr\xF3ximos rivales; (e) causas m\xE9dicas no escritas literalmente en el dossier.',
        '3. PRUEBA NUM\xC9RICA OBLIGATORIA EN CADA AFIRMACI\xD3N (CERO PROSA VAGA O GEN\xC9RICA): Queda TERMINANTEMENTE PROHIBIDO soltar afirmaciones cualitativas sin mostrar inmediatamente las cifras reales que las prueban. Por ejemplo:\n   - PROHIBIDO escribir "secando a su rival casi 20 puntos por debajo de su media" sin mostrar los n\xFAmeros \u2192 OBLIGATORIO: "dejando a **Dallas Mavericks** en 94 puntos (112-94, 19.8 por debajo de su media de 113.8) tras limitarles al 40.2% TC y 8/31 en triples".\n   - PROHIBIDO escribir "con una eficiencia asombrosa", "control de p\xE9rdidas ejemplar" o "superioridad interior abrumadora" sin cifras \u2192 OBLIGATORIO mostrar la serie exacta (ej. "11/16 TC, 4/6 en triples y 78.9% TS", "apenas 8 p\xE9rdidas frente a 17 del rival", "28/45 en tiros de dos \u201462.2%\u2014 y 46 rebotes").\n   - PROHIBIDO mencionar un partido o duelo sin incluir su marcador exacto (ej. 124-121) la primera vez que se analiza.',
        '4. PROFUNDIDAD Y COHESI\xD3N TEM\xC1TICA (PROHIBIDAS LAS IDEAS DISPERSAS Y EL REPASO UNO A UNO): No enumeres partidos secuencialmente ("En el partido 1... en el partido 2...") ni saltes superficialmente de un tema a otro en frases sueltas. Cada secci\xF3n y cap\xEDtulo debe desarrollar 1 o 2 tesis claras con profundidad real, hilando causa-efecto t\xE1ctico respaldada por los datos exactos (incluyendo hitos Play-by-Play de parciales/tiempos muertos y ejecuci\xF3n en los \xFAltimos 2 minutos del clutch cuando consten en el dossier).',
        '5. GRAM\xC1TICA ESPA\xD1OLA IMPECABLE + JERARQU\xCDA EN NEGRITA (**...**): JAM\xC1S dupliques el art\xEDculo delante de franquicias que ya empiezan por "Los" (PROHIBIDO escribir "Los Los Angeles Lakers" o "los Los Angeles Clippers"; escribe siempre "**Los Angeles Lakers**" o "los **Lakers**"). En todos los p\xE1rrafos del cuerpo (ENTRADILLA, CAPITULOS_DINAMICOS, PIZARRAS, HITOS, ESPANOLES y la explicaci\xF3n tras :: en CLAVES), utiliza negrita Markdown (**texto**) EXCLUSIVAMENTE para: (a) nombres de jugadores (ej. **Nikola Joki\u0107**), (b) nombres o apodos oficiales de equipos (ej. **Boston Celtics**, **Lakers**), y (c) UNA sola idea t\xE1ctica clave por p\xE1rrafo (frase breve de 4 a 10 palabras que sintetice la clave causal, ej. **castigando las 17 p\xE9rdidas rivales tras cada atrapada**). PROHIBIDO poner en negrita cifras aisladas y PROHIBIDO poner ** en TITULAR o antes de ::.',
        "6. FORMATO EXACTO CON ESTAS 7 ETIQUETAS EN MAY\xDASCULAS:",
        "===TITULAR===",
        "(Titular period\xEDstico potente de portada en 1 sola l\xEDnea con foco concreto de la noche, sin # ni **).",
        "===ENTRADILLA===",
        "(Entradilla editorial de 2 a 3 l\xEDneas resumiendo los grandes focos con datos clave reales \u2014marcadores o cifras destacadas\u2014 aplicando la regla de negritas).",
        "===CAPITULOS_DINAMICOS===",
        '(Exactamente 2 cap\xEDtulos de fondo separados por una l\xEDnea con ---. Formato obligatorio: "T\xEDtulo concreto del cap\xEDtulo :: P\xE1rrafo 1\\n\\nP\xE1rrafo 2".\n- CAP\xCDTULO 1 (El gran pulso / partido eje de la noche): P\xE1rrafo 1 desarrolla el guion t\xE1ctico completo con marcador, ritmo (Pace), porcentajes de tiro, p\xE9rdidas/rebotes e hitos PBP si figuran (parciales, tiempos muertos provocados o ejecuci\xF3n en los \xFAltimos 2 minutos); P\xE1rrafo 2 profundiza en los duelos individuales que lo decidieron con sus l\xEDneas estad\xEDsticas completas.\n- CAP\xCDTULO 2 (El contraste t\xE1ctico / tendencia colectiva dominante): P\xE1rrafo 1 analiza en profundidad el patr\xF3n colectivo m\xE1s determinante de la jornada (cerrojo defensivo, dominio en tiros de 2, avalancha exterior o contraste de eficiencia) comparando con exactitud 2 o 3 equipos y sus cifras reales (`OffRtg`/`DefRtg`, `T2%`, `T3%`, `REB`, `PER`, media anotadora vs resultado); P\xE1rrafo 2 explica la causa-efecto en pista en finales cerrados o rotaciones sin dejar cabos sueltos).',
        "===PIZARRAS===",
        "(Ep\xEDgrafe fijo Pizarras: 2 p\xE1rrafos densos de pizarra t\xE9cnica comparando cifras colectivas reales \u2014tiros de 2 vs triples, p\xE9rdidas cometidas/provocadas, robos+tapones, rebote ofensivo, `NetRtg`/`DefRtg`/`Pace` frente al promedio NBA\u2014 explicando exactamente qu\xE9 ajustes t\xE1cticos ganaron los partidos).",
        "===HITOS===",
        "(Ep\xEDgrafe fijo Hitos: 2 p\xE1rrafos entrelazando triples-dobles/dobles-dobles, explosiones y batacazos frente a su media, irrupciones de minutos/rol y rachas prolongadas o rotas, mostrando SIEMPRE la hoja completa de cada protagonista: puntos, rebotes, asistencias, serie `TC`, serie `T3`, `TS%`, `MIN` y el marcador de su partido).",
        "===ESPANOLES===",
        "(Ep\xEDgrafe fijo Espa\xF1oles: si jugaron espa\xF1oles, 1 p\xE1rrafo analizando sus minutos, serie de tiro, producci\xF3n exacta y contexto del partido; si ninguno sum\xF3 minutos en esta fecha, 1 frase sobria, directa y natural confirm\xE1ndolo).",
        "===CLAVES===",
        '(Ep\xEDgrafe fijo Claves: exactamente 4 claves anal\xEDticas incisivas, una por l\xEDnea con formato exacto "T\xEDtulo anal\xEDtico corto sin ** :: Explicaci\xF3n t\xE1ctica en 2 frases respaldada por marcador exacto y 3-4 cifras concretas aplicando negritas", sin numeraci\xF3n inicial. Criterio obligatorio: [1] la gran exhibici\xF3n individual de la noche y c\xF3mo gener\xF3 ventaja para su equipo; [2] la pizarra colectiva o cerrojo t\xE1ctico m\xE1s determinante de la jornada; [3] el cierre apretado, manejo de p\xE9rdidas o factor X m\xE1s decisivo; [4] lectura t\xE1ctica transversal de la cartelera con promedios reales de la fecha. PROHIBIDO usar ratios opacos como "tasa de tiros libres" / FTR% o afirmaciones sin cifras).'
      ].join("\n");
      try {
        const { text: rawText, sources } = await generateWithGeminiCascade({ systemInstruction, contents: dayDossier, seedSources: daySeedSources });
        const safeRawText = sanitizeUnverifiedCoachClaims(rawText, verifiedNightPlayerNames);
        const parsed = parseDelimitedSections(safeRawText, ["TITULAR", "ENTRADILLA", "CAPITULOS_DINAMICOS", "PIZARRAS", "HITOS", "ESPANOLES", "CLAVES"]);
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes, matchEnrichments, tripleDoublesNight);
        const payload = { date: gd.selectedDate, seasonLabel: gd.seasonLabel, gamesCount: gd.pulse.gamesCount, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), generationTimeMs: Date.now() - startTime, engineMode: "gemini_search", headline: parsed.TITULAR && parsed.TITULAR.length > 12 ? stripInlineWrapper(parsed.TITULAR) : fallback.headline, lead: parsed.ENTRADILLA && parsed.ENTRADILLA.length > 25 ? parsed.ENTRADILLA : fallback.lead, dynamicSections: parseDynamicChapters(parsed.CAPITULOS_DINAMICOS, fallback.dynamicSections), pizarrasSection: parsed.PIZARRAS && parsed.PIZARRAS.length > 60 ? parsed.PIZARRAS : fallback.pizarrasSection, hitosSection: parsed.HITOS && parsed.HITOS.length > 60 ? parsed.HITOS : fallback.hitosSection, espanolesSection: parsed.ESPANOLES && parsed.ESPANOLES.length > 12 ? parsed.ESPANOLES : fallback.espanolesSection, clavesList: parseClavesList(parsed.CLAVES, fallback.clavesList), spanishPlayersSummary: spanishNightNotes.length > 0 ? spanishNightNotes.join(" \xB7 ") : "Sin minutos en pista de jugadores espa\xF1oles en los encuentros disputados esta fecha.", sources };
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + 4 * 60 * 60 * 1e3, data: payload });
        return payload;
      } catch (err) {
        const isQuota = isQuotaExhaustedError(err);
        console.info(
          `[RadarNBA] Activado motor determinista de jornada para ${gd.selectedDate} (${isQuota ? "cuota_diaria_429_agotada" : err?.status || err?.code || "timeout/offline"})`
        );
        const fallback = buildDeterministicDailyChronicle(gd, spanishNightNotes, matchEnrichments, tripleDoublesNight);
        fallback.generationTimeMs = Date.now() - startTime;
        fallback.missingApiKey = !getGeminiClient();
        fallback.quotaExhausted = isQuota;
        fallback.fallbackReason = isQuota ? "quota_exhausted_429" : err instanceof Error ? err.message : String(err);
        reportMemoryCache.set(cacheKey, { expiresAt: Date.now() + (isQuota ? 5 * 60 * 1e3 : 30 * 1e3), data: fallback });
        return fallback;
      }
    })();
    reportInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      reportInflight.delete(cacheKey);
    }
  }
  return { buildGameOfficialReportData, buildGameNarrativePayload, buildDeterministicGameNarrative, buildGameDayChroniclePayload, fetchLeagueScheduleGames, fetchEspnInjuriesByName };
}

// src/server/fantasyEspnService.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// src/utils/fantasyScoring.ts
var OFFICIAL_LEAGUE_RULES = {
  maxContracts: 13,
  activeStarters: 10,
  benchReserves: 2,
  irSlots: 1,
  weights: {
    fgm: 2,
    fgmi: -1,
    ftm: 1,
    ftmi: -1,
    fg3m: 1,
    fg3mi: 0.5,
    oreb: 1.5,
    dreb: 0.75,
    ast: 1.5,
    stl: 2.5,
    blk: 2.5,
    tov: -2,
    ej: -5
  }
};
function normalizePlayerLookupKey(raw) {
  const norm = (raw || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(?:jr|sr|ii|iii|iv)\b\.?/gi, "").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (norm === "chet holmgrem") return "chet holmgren";
  return norm;
}

// src/server/upstashRedis.ts
var __name2 = (fn, _n) => fn;
function getRedisRestConfig() {
  const explicitPairs = [
    [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN],
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN],
    [process.env.REDIS_REST_URL, process.env.REDIS_REST_TOKEN],
    [process.env.FANTASY_REDIS_REST_URL, process.env.FANTASY_REDIS_REST_TOKEN]
  ];
  for (const [rawUrl, rawToken] of explicitPairs) {
    if (typeof rawUrl === "string" && rawUrl.trim().startsWith("https://") && typeof rawToken === "string" && rawToken.trim()) {
      return {
        url: rawUrl.trim().replace(/\/+$/, ""),
        token: rawToken.trim()
      };
    }
  }
  for (const [key, val] of Object.entries(process.env)) {
    if (typeof val !== "string" || !val.trim().startsWith("https://")) continue;
    if (key.endsWith("_REDIS_REST_URL")) {
      const prefix = key.slice(0, -"_REDIS_REST_URL".length);
      const tok = process.env[`${prefix}_REDIS_REST_TOKEN`];
      if (typeof tok === "string" && tok.trim()) {
        return { url: val.trim().replace(/\/+$/, ""), token: tok.trim() };
      }
    }
    if (key.endsWith("_KV_REST_API_URL")) {
      const prefix = key.slice(0, -"_KV_REST_API_URL".length);
      const tok = process.env[`${prefix}_KV_REST_API_TOKEN`];
      if (typeof tok === "string" && tok.trim()) {
        return { url: val.trim().replace(/\/+$/, ""), token: tok.trim() };
      }
    }
  }
  return null;
}
__name2(getRedisRestConfig, "getRedisRestConfig");
function isUpstashRedisConfigured() {
  return getRedisRestConfig() !== null;
}
__name2(isUpstashRedisConfigured, "isUpstashRedisConfigured");
async function executeUpstashCommand(redisCfg, commandArgs, timeoutMs = 5e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(redisCfg.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisCfg.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commandArgs),
      cache: "no-store",
      signal: controller.signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Upstash HTTP ${res.status}: ${errText.slice(0, 160)}`);
    }
    const payload = await res.json();
    if (payload && payload.error) {
      throw new Error(`Upstash Redis error: ${String(payload.error)}`);
    }
    return payload ? payload.result : null;
  } finally {
    clearTimeout(timer);
  }
}
__name2(executeUpstashCommand, "executeUpstashCommand");
async function executeUpstashPipeline(redisCfg, commandsList, timeoutMs = 5e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${redisCfg.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisCfg.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commandsList),
      cache: "no-store",
      signal: controller.signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Upstash Pipeline HTTP ${res.status}: ${errText.slice(0, 160)}`);
    }
    const payload = await res.json();
    if (!Array.isArray(payload)) {
      throw new Error("Upstash Pipeline malformed response");
    }
    return payload.map((item) => {
      if (item && item.error) {
        throw new Error(`Upstash Redis pipeline item error: ${String(item.error)}`);
      }
      return item ? item.result : null;
    });
  } finally {
    clearTimeout(timer);
  }
}
__name2(executeUpstashPipeline, "executeUpstashPipeline");

// src/server/fantasyEspnService.ts
var __name3 = (fn, _n) => fn;
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var DATA_DIR = [path.resolve(process.cwd(), "data"), path.resolve(__dirname, "../data"), path.resolve(__dirname, "../../data")].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "data");
var MANUAL_STATE_FILE = path.join(DATA_DIR, "fantasy-manual-league.json");
var SERVERLESS_TMP_STATE_FILE = "/tmp/radarnba-fantasy-manual-league.json";
var FANTASY_REDIS_KEY = "radarnba:fantasy:manual_league_v1";
function getFantasyStorageBackendInfo() {
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    return { storageMode: "upstash-redis", cloudConfigured: true };
  }
  if (process.env.VERCEL) {
    return { storageMode: "tmp-ephemeral", cloudConfigured: false };
  }
  return { storageMode: "local-disk", cloudConfigured: false };
}
function sanitizeManualFantasyState(raw) {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw;
  const updatedAt = typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt) ? obj.updatedAt : Date.now();
  const myTeamName = typeof obj.myTeamName === "string" && obj.myTeamName.trim() ? obj.myTeamName.trim().slice(0, 80) : "Mi Equipo Fantasy";
  const roster = [];
  const seenRoster = /* @__PURE__ */ new Set();
  if (Array.isArray(obj.roster)) {
    for (const item of obj.roster) {
      if (!item || typeof item !== "object") continue;
      const r = item;
      const pid = String(r.playerId || "").trim();
      const slot = r.slot === "bench" ? "bench" : r.slot === "ir" ? "ir" : "starter";
      if (pid && !seenRoster.has(pid) && roster.length < OFFICIAL_LEAGUE_RULES.maxContracts) {
        seenRoster.add(pid);
        roster.push({ playerId: pid, slot });
      }
    }
  }
  const takenRivalIds = Array.isArray(obj.takenRivalIds) ? Array.from(new Set(obj.takenRivalIds.map((x) => String(x || "").trim()).filter(Boolean))) : [];
  const rivalRosters = {};
  if (obj.rivalRosters && typeof obj.rivalRosters === "object") {
    for (const [k, v] of Object.entries(obj.rivalRosters)) {
      const cleanKey = String(k || "").trim().slice(0, 40);
      if (!cleanKey || !Array.isArray(v)) continue;
      rivalRosters[cleanKey] = Array.from(new Set(v.map((x) => String(x || "").trim()).filter(Boolean)));
    }
  }
  const rivalTeamNames = {};
  if (obj.rivalTeamNames && typeof obj.rivalTeamNames === "object") {
    for (const [k, v] of Object.entries(obj.rivalTeamNames)) {
      const cleanKey = String(k || "").trim().slice(0, 40);
      if (!cleanKey || typeof v !== "string") continue;
      rivalTeamNames[cleanKey] = v.slice(0, 80);
    }
  }
  const gameCorrections = {};
  if (obj.gameCorrections && typeof obj.gameCorrections === "object") {
    for (const [k, v] of Object.entries(obj.gameCorrections)) {
      const cleanKey = String(k || "").trim().slice(0, 80);
      if (!cleanKey || !v || typeof v !== "object") continue;
      const numDelta = typeof v.fptsDelta === "number" && Number.isFinite(v.fptsDelta) ? v.fptsDelta : 0;
      const reason = typeof v.reason === "string" ? v.reason.slice(0, 150) : "";
      if (Math.abs(numDelta) > 1e-3 || reason) {
        gameCorrections[cleanKey] = {
          fptsDelta: Number(numDelta.toFixed(2)),
          reason,
          updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : Date.now()
        };
      }
    }
  }
  if (!gameCorrections["1642349:0022600007"] && !gameCorrections["1642349:2026-10-22"]) {
    gameCorrections["1642349:0022600007"] = {
      fptsDelta: 2.5,
      reason: "6 stocks en ESPN/BBRef vs 5 en NBA.com (+2.5 FPTS)",
      updatedAt: Date.now()
    };
    gameCorrections["1642349:2026-10-22"] = {
      fptsDelta: 2.5,
      reason: "6 stocks en ESPN/BBRef vs 5 en NBA.com (+2.5 FPTS)",
      updatedAt: Date.now()
    };
  }
  return { updatedAt, myTeamName, roster, takenRivalIds, rivalRosters, rivalTeamNames, gameCorrections };
}
function readManualFantasyStateFromDisk() {
  const candidates = process.env.VERCEL ? [SERVERLESS_TMP_STATE_FILE, MANUAL_STATE_FILE] : [MANUAL_STATE_FILE];
  for (const target of candidates) {
    try {
      if (!fs.existsSync(target)) continue;
      const content = fs.readFileSync(target, "utf8");
      const parsed = JSON.parse(content);
      const valid = sanitizeManualFantasyState(parsed);
      if (valid) return valid;
    } catch {
    }
  }
  return null;
}
function persistNormalizedStateToLocalDisk(toSave) {
  try {
    if (process.env.VERCEL) {
      const tmpTarget = `${SERVERLESS_TMP_STATE_FILE}.tmp`;
      fs.writeFileSync(tmpTarget, JSON.stringify(toSave, null, 2), "utf8");
      fs.renameSync(tmpTarget, SERVERLESS_TMP_STATE_FILE);
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmpFile = `${MANUAL_STATE_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(toSave, null, 2), "utf8");
      fs.renameSync(tmpFile, MANUAL_STATE_FILE);
    }
  } catch (err) {
    console.error("Error writing fantasy-manual-league.json:", err);
  }
}
async function readManualFantasyState() {
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      const rawResult = await executeUpstashCommand(redisCfg, ["GET", FANTASY_REDIS_KEY]);
      if (rawResult !== null && rawResult !== void 0) {
        const parsed = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
        const valid = sanitizeManualFantasyState(parsed);
        if (valid) return valid;
      }
      return null;
    } catch (err) {
      console.error("Error reading Fantasy state from Upstash Redis:", err);
    }
  }
  return readManualFantasyStateFromDisk();
}
async function writeManualFantasyState(rawState) {
  const sanitized = sanitizeManualFantasyState(rawState);
  if (!sanitized) return null;
  const toSave = { ...sanitized, updatedAt: Math.max(sanitized.updatedAt, Date.now()) };
  persistNormalizedStateToLocalDisk(toSave);
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    await executeUpstashCommand(redisCfg, ["SET", FANTASY_REDIS_KEY, JSON.stringify(toSave)]);
  }
  return toSave;
}
function buildWeeklyWindows(scheduleGames, referenceTodayIso) {
  const effectiveGames = scheduleGames.length >= 200 ? scheduleGames : STATIC_SCHEDULE_2027;
  return buildWeeklyWindowsFromSchedule(effectiveGames, referenceTodayIso);
}
function mapInjuryStatusToSpanish(rawStatus, rawDetail) {
  const stLow = (rawStatus || "").toLowerCase().trim();
  const detLow = (rawDetail || "").toLowerCase().trim();
  const translated = translateMedicalDetailEs(rawDetail);
  const combinedText = `${detLow} ${(translated || "").toLowerCase()}`;
  const hasRestKeywords = /\b(?:rest|load management|injury management|recovery|descanso|dosificaci|gesti[oó]n de cargas)\b/i.test(
    combinedText
  );
  const hasLongTermKeywords = /\b(?:surgery|fracture|torn|acl|mcl|achilles|meniscus|indefinitely|months|season-ending|out for season|re-evaluated|extended|cirug|rotura|cruzado|fractur|meses|indefinid|temporada|prolongad|aquiles|menisco|8-10|6-8|4-6|3-4|2-4)\b/i.test(
    combinedText
  ) || (combinedText.includes("semanas") || combinedText.includes("weeks")) && !combinedText.includes("esta semana") && !combinedText.includes("this week") && !combinedText.includes("proxima semana") && !combinedText.includes("next week");
  if (stLow.includes("suspension") || detLow.includes("suspension")) {
    return {
      severity: "suspended",
      absenceTier: "long_term",
      statusLabelEs: "Sancionado",
      detailEs: translated || "Sanci\xF3n disciplinaria oficial NBA"
    };
  }
  if (stLow.includes("injured reserve") || stLow === "ir" || /\b(?:out for season|season-ending)\b/i.test(detLow)) {
    return {
      severity: "ir",
      absenceTier: "long_term",
      statusLabelEs: "Lista IR (Larga duraci\xF3n)",
      detailEs: translated || "En reserva de lesionados de larga duraci\xF3n"
    };
  }
  if (stLow.includes("out")) {
    if (hasLongTermKeywords) {
      let finalDetail = translated;
      if (!finalDetail || finalDetail === "baja m\xE9dica") {
        if (/patellar/i.test(detLow) || /8-10/i.test(detLow)) {
          finalDetail = "Rotura de tend\xF3n rotuliano (~8-10 semanas de baja)";
        } else if (/achilles/i.test(detLow)) {
          finalDetail = "Rotura de tend\xF3n de Aquiles (Baja indefinida)";
        } else if (/acl/i.test(detLow) || /cruzado/i.test(detLow)) {
          finalDetail = "Rotura de ligamento cruzado anterior";
        } else if (/meniscus|menisco/i.test(detLow)) {
          finalDetail = "Lesi\xF3n de menisco / cirug\xEDa";
        } else if (/surgery|cirug/i.test(detLow)) {
          finalDetail = "Intervenci\xF3n quir\xFArgica (Larga duraci\xF3n)";
        } else {
          finalDetail = "Baja m\xE9dica prolongada confirmada";
        }
      }
      return {
        severity: "out",
        absenceTier: "long_term",
        statusLabelEs: "Baja larga duraci\xF3n",
        detailEs: finalDetail
      };
    }
    if (hasRestKeywords) {
      return {
        severity: "out",
        absenceTier: "b2b_rest",
        statusLabelEs: "Baja por descanso",
        detailEs: translated || "Descanso puntual / gesti\xF3n de cargas"
      };
    }
    return {
      severity: "out",
      absenceTier: "punctual",
      statusLabelEs: "Baja puntual (Corto plazo)",
      detailEs: translated || "Baja puntual confirmada en parte oficial"
    };
  }
  if (stLow.includes("doubtful")) {
    return {
      severity: "doubtful",
      absenceTier: "punctual",
      statusLabelEs: "Muy dudoso (Puntual)",
      detailEs: translated || "Participaci\xF3n muy improbable en el pr\xF3ximo partido"
    };
  }
  if (stLow.includes("day-to-day") || stLow.includes("dtd")) {
    return {
      severity: "dtd",
      absenceTier: hasRestKeywords ? "b2b_rest" : "punctual",
      statusLabelEs: hasRestKeywords ? "DTD (Gesti\xF3n cargas)" : "D\xEDa a d\xEDa (DTD)",
      detailEs: translated || "Seguimiento diario previo al partido"
    };
  }
  if (stLow.includes("probable")) {
    return {
      severity: "probable",
      absenceTier: hasRestKeywords ? "b2b_rest" : "punctual",
      statusLabelEs: "Probable",
      detailEs: translated || "Molestias leves, previsto disponible"
    };
  }
  if (stLow.includes("questionable")) {
    return {
      severity: "questionable",
      absenceTier: hasRestKeywords ? "b2b_rest" : "punctual",
      statusLabelEs: hasRestKeywords ? "Duda (Descanso/B2B)" : "Cuestionable (Puntual)",
      detailEs: translated || "En evaluaci\xF3n m\xE9dica previa al partido"
    };
  }
  return {
    severity: "questionable",
    absenceTier: "punctual",
    statusLabelEs: "Seguimiento m\xE9dico",
    detailEs: translated || "Observaci\xF3n m\xE9dica en parte de equipo"
  };
}
var cachedNbaContext = null;
async function buildFantasyEspnSyncPayload(params) {
  const { allPlayers, fetchLeagueScheduleGames, fetchEspnInjuriesByName, forceRefresh = false } = params;
  const [savedState, backendInfo] = await Promise.all([
    readManualFantasyState(),
    Promise.resolve(getFantasyStorageBackendInfo())
  ]);
  if (!forceRefresh && cachedNbaContext && cachedNbaContext.expiresAt > Date.now()) {
    return { ...cachedNbaContext.payloadBase, savedState, ...backendInfo };
  }
  const playersByNorm = /* @__PURE__ */ new Map();
  const playersByRawNorm = /* @__PURE__ */ new Map();
  for (const p of allPlayers) {
    const k1 = normalizePlayerLookupKey(p.name);
    const k2 = (p.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (k1) {
      const arr = playersByNorm.get(k1) || [];
      arr.push(p);
      playersByNorm.set(k1, arr);
    }
    if (k2) {
      const arr = playersByRawNorm.get(k2) || [];
      arr.push(p);
      playersByRawNorm.set(k2, arr);
    }
  }
  const resolveNbaPlayerId = __name3((fullName) => {
    let raw = fullName || "";
    if (/chet\s+holmgrem/i.test(raw)) raw = "Chet Holmgren";
    const kRaw = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const kClean = normalizePlayerLookupKey(raw);
    const cands = playersByRawNorm.get(kRaw) || playersByNorm.get(kClean) || [];
    return cands.length > 0 ? cands[0].id : null;
  }, "resolveNbaPlayerId");
  const [scheduleGames, rawInjuriesMap] = await Promise.all([fetchLeagueScheduleGames(forceRefresh), fetchEspnInjuriesByName(forceRefresh)]);
  const todayIso = getEasternTodayIso();
  const weeks = buildWeeklyWindows(scheduleGames, todayIso);
  const injuriesByNormName = {};
  const injuriesByPlayerId = {};
  for (const [normKey, rawInj] of rawInjuriesMap.entries()) {
    const mapped = mapInjuryStatusToSpanish(rawInj.status, rawInj.detail);
    const alert = {
      playerNameNorm: normKey,
      displayName: normKey,
      severity: mapped.severity,
      absenceTier: mapped.absenceTier,
      statusLabelEs: mapped.statusLabelEs,
      detailEs: mapped.detailEs
    };
    injuriesByNormName[normKey] = alert;
    const matchedNbaId = resolveNbaPlayerId(normKey);
    if (matchedNbaId) {
      const pObj = allPlayers.find((p) => p.id === matchedNbaId);
      if (pObj) {
        alert.displayName = pObj.name;
      }
      injuriesByPlayerId[matchedNbaId] = alert;
    }
  }
  const payloadBase = { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), injuriesByNormName, injuriesByPlayerId, weeks, defaultWeekId: "current" };
  cachedNbaContext = { expiresAt: Date.now() + 5 * 60 * 1e3, payloadBase };
  return { ...payloadBase, savedState, ...backendInfo };
}

// src/server/nbaDataService.ts
import zlib2 from "zlib";

// src/utils/bootstrapWireCodec.ts
function packBootstrapWirePayload(payload) {
  const seasons = [];
  const seasonMap = /* @__PURE__ */ new Map();
  const getSeasonIdx = (label) => {
    let idx = seasonMap.get(label);
    if (idx === void 0) {
      idx = seasons.length;
      seasons.push(label);
      seasonMap.set(label, idx);
    }
    return idx;
  };
  const strings = [];
  const stringMap = /* @__PURE__ */ new Map();
  const getStringIdx = (val) => {
    if (val === void 0) return -1;
    let idx = stringMap.get(val);
    if (idx === void 0) {
      idx = strings.length;
      strings.push(val);
      stringMap.set(val, idx);
    }
    return idx;
  };
  const games = [];
  const gameMap = /* @__PURE__ */ new Map();
  const getGameIdx = (eventId, date, seasonLabel, scoreDisplay) => {
    const sIdx = getSeasonIdx(seasonLabel);
    const key = `${eventId}|${date}|${sIdx}|${scoreDisplay}`;
    let idx = gameMap.get(key);
    if (idx === void 0) {
      idx = games.length;
      games.push([eventId, date, sIdx, scoreDisplay]);
      gameMap.set(key, idx);
    }
    return idx;
  };
  const packedTeams = payload.teams.map((tm) => {
    const { games: tmGames, ...meta } = tm;
    const g = tmGames.map((log) => {
      const awayPts = log.isHome ? log.pointsAgainst : log.pointsFor;
      const homePts = log.isHome ? log.pointsFor : log.pointsAgainst;
      const gameIdx = getGameIdx(
        log.eventId,
        log.date,
        log.seasonLabel,
        `${awayPts}-${homePts}`
      );
      const flags = (log.isHome ? 1 : 0) | (log.result === "W" ? 2 : 0) | (log.isBackToBack ? 4 : 0);
      return [
        gameIdx,
        getStringIdx(log.opponentAbbr),
        getStringIdx(log.opponentName),
        flags,
        log.pointsFor,
        log.pointsAgainst,
        log.restDays,
        log.fgm,
        log.fga,
        log.fg3m,
        log.fg3a,
        log.ftm,
        log.fta,
        log.oreb,
        log.dreb,
        log.reb,
        log.ast,
        log.stl,
        log.blk,
        log.tov,
        log.poss,
        log.offRtg,
        log.defRtg,
        log.netRtg,
        log.pace,
        log.efgPct,
        log.tsPct,
        log.orebPct,
        log.tovPct
      ];
    });
    return {
      ...meta,
      g
    };
  });
  const packedPlayers = payload.players.map((pl) => {
    const { games: plGames, ...meta } = pl;
    const g = plGames.map((log) => {
      const gameIdx = getGameIdx(
        log.eventId,
        log.date,
        log.seasonLabel,
        log.scoreDisplay || ""
      );
      const flags = (log.isHome ? 1 : 0) | (log.result === "W" ? 2 : 0) | (log.isBackToBack ? 4 : 0);
      return [
        gameIdx,
        getStringIdx(log.teamAbbr),
        getStringIdx(log.teamId),
        getStringIdx(log.opponentAbbr),
        getStringIdx(log.opponentName),
        flags,
        log.restDays,
        log.minutes,
        log.points,
        log.rebounds,
        log.oreb,
        log.dreb,
        log.assists,
        log.steals,
        log.blocks,
        log.turnovers,
        log.fouls,
        log.plusMinus,
        log.fgm,
        log.fga,
        log.fg3m,
        log.fg3a,
        log.ftm,
        log.fta,
        log.usgEst,
        log.gameScore
      ];
    });
    return {
      ...meta,
      g
    };
  });
  return {
    wireVersion: 2,
    seasonMode: payload.seasonMode,
    dataSource: payload.dataSource,
    totalLeaguePlayersAvailable: payload.totalLeaguePlayersAvailable,
    allPlayersLoaded: payload.allPlayersLoaded,
    generatedAt: payload.generatedAt,
    scoreboard: payload.scoreboard,
    dicts: {
      seasons,
      strings,
      games
    },
    teams: packedTeams,
    players: packedPlayers
  };
}

// src/server/nbaSnapshotStore.ts
import fs2 from "fs";
import path2 from "path";
import zlib from "zlib";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/server/circuitBreaker.ts
var DEFAULT_CONFIGS = {
  nba_stats: {
    failureThreshold: 3,
    baseCooldownMs: 35 * 1e3,
    maxCooldownMs: 300 * 1e3,
    canaryTarget: 2
  },
  nba_cdn: {
    failureThreshold: 4,
    baseCooldownMs: 25 * 1e3,
    maxCooldownMs: 180 * 1e3,
    canaryTarget: 2
  },
  espn_api: {
    failureThreshold: 3,
    baseCooldownMs: 30 * 1e3,
    maxCooldownMs: 240 * 1e3,
    canaryTarget: 2
  },
  general: {
    failureThreshold: 3,
    baseCooldownMs: 30 * 1e3,
    maxCooldownMs: 240 * 1e3,
    canaryTarget: 2
  }
};
var ProviderCircuit = class {
  constructor(provider) {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.totalShortCircuits = 0;
    this.trippedCount = 0;
    this.lastFailureTime = null;
    this.lastFailureReason = null;
    this.lastSuccessTime = null;
    this.openUntil = null;
    this.halfOpenCanaryRemaining = 0;
    this.provider = provider;
    this.config = DEFAULT_CONFIGS[provider] || DEFAULT_CONFIGS.general;
  }
  getCurrentCooldownMs() {
    const exponent = Math.max(0, this.trippedCount - 1);
    const ms = this.config.baseCooldownMs * Math.pow(1.6, exponent);
    return Math.min(this.config.maxCooldownMs, Math.round(ms));
  }
  recordSuccess() {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    if (this.state === "HALF_OPEN") {
      this.halfOpenCanaryRemaining--;
      if (this.halfOpenCanaryRemaining <= 0) {
        this.state = "CLOSED";
        this.consecutiveFailures = 0;
        this.openUntil = null;
        console.log(`[CircuitBreaker] ${this.provider} recuperado -> CLOSED`);
      }
    } else if (this.state === "CLOSED") {
      this.consecutiveFailures = 0;
    }
  }
  recordFailure(reason) {
    this.totalFailures++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.lastFailureReason = reason.slice(0, 160);
    if (this.state === "HALF_OPEN" || this.consecutiveFailures >= this.config.failureThreshold) {
      this.trippedCount++;
      const cooldown = this.getCurrentCooldownMs();
      this.state = "OPEN";
      this.openUntil = Date.now() + cooldown;
      console.warn(
        `[CircuitBreaker] ${this.provider} ha disparado OPEN por ${Math.round(cooldown / 1e3)}s tras error: ${reason}`
      );
    }
  }
  canExecute() {
    const now = Date.now();
    if (this.state === "CLOSED") {
      return true;
    }
    if (this.state === "OPEN") {
      if (this.openUntil && now >= this.openUntil) {
        this.state = "HALF_OPEN";
        this.halfOpenCanaryRemaining = this.config.canaryTarget;
        console.log(`[CircuitBreaker] ${this.provider} cooldown cumplido -> HALF_OPEN (enviando canario)`);
        return true;
      }
      this.totalShortCircuits++;
      return false;
    }
    if (this.state === "HALF_OPEN") {
      return true;
    }
    return true;
  }
  reset() {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.openUntil = null;
    this.halfOpenCanaryRemaining = 0;
    this.trippedCount = 0;
  }
  toMetrics() {
    const now = Date.now();
    const openRemaining = this.openUntil && this.openUntil > now ? this.openUntil - now : 0;
    return {
      provider: this.provider,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.config.failureThreshold,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalShortCircuits: this.totalShortCircuits,
      trippedCount: this.trippedCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      lastFailureReason: this.lastFailureReason,
      lastSuccessTime: this.lastSuccessTime ? new Date(this.lastSuccessTime).toISOString() : null,
      cooldownMs: this.getCurrentCooldownMs(),
      openUntil: this.openUntil,
      openRemainingMs: openRemaining
    };
  }
};
var circuits = {
  nba_stats: new ProviderCircuit("nba_stats"),
  nba_cdn: new ProviderCircuit("nba_cdn"),
  espn_api: new ProviderCircuit("espn_api"),
  general: new ProviderCircuit("general")
};
function identifyProviderFromUrl(url) {
  if (url.includes("stats.nba.com")) return "nba_stats";
  if (url.includes("cdn.nba.com")) return "nba_cdn";
  if (url.includes("espn.com") || url.includes("espncdn.com")) return "espn_api";
  return "general";
}
var CircuitBreakerOpenError = class extends Error {
  constructor(provider, openRemainingMs) {
    super(`Circuit breaker OPEN para el proveedor ${provider}. Petici\xF3n abortada de inmediato.`);
    this.name = "CircuitBreakerOpenError";
    this.provider = provider;
    this.openRemainingMs = openRemainingMs;
  }
};
async function executeWithCircuitBreaker(provider, action, fallback) {
  const circuit = circuits[provider] || circuits.general;
  if (!circuit.canExecute()) {
    const metrics = circuit.toMetrics();
    const cbErr = new CircuitBreakerOpenError(provider, metrics.openRemainingMs);
    if (fallback) {
      return await fallback(cbErr);
    }
    throw cbErr;
  }
  try {
    const result = await action();
    circuit.recordSuccess();
    return result;
  } catch (err) {
    const reason = err?.message || String(err);
    circuit.recordFailure(reason);
    if (fallback) {
      return await fallback(err);
    }
    throw err;
  }
}
function getAllCircuitMetrics() {
  return {
    nba_stats: circuits.nba_stats.toMetrics(),
    nba_cdn: circuits.nba_cdn.toMetrics(),
    espn_api: circuits.espn_api.toMetrics(),
    general: circuits.general.toMetrics()
  };
}
function resetCircuit(provider) {
  if (provider && circuits[provider]) {
    circuits[provider].reset();
  } else {
    for (const c of Object.values(circuits)) {
      c.reset();
    }
  }
}

// src/server/nbaSnapshotStore.ts
var __name4 = (fn, _n) => fn;
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path2.dirname(__filename2);
var NBA_CDN_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Referer: "https://www.nba.com/", Origin: "https://www.nba.com", Accept: "application/json" };
var EAST_TEAM_ABBRS = /* @__PURE__ */ new Set(["ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS"]);
function round12(val) {
  return Math.round((Number(val) || 0) * 10) / 10;
}
function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}
function meanNums(arr) {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}
function diffDaysIso(olderIso, newerIso) {
  const a = Date.parse(`${olderIso.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${newerIso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / (24 * 60 * 60 * 1e3)) - 1;
  return Math.max(0, days);
}
function getShortTeamName(abbr, fullName) {
  const meta = NBA_TEAMS_MAP[abbr];
  if (meta) {
    if (abbr === "POR") return "Trail Blazers";
    const parts2 = meta.name.split(" ");
    return parts2[parts2.length - 1] || meta.name;
  }
  const clean = (fullName || abbr).trim();
  const parts = clean.split(" ");
  return parts[parts.length - 1] || clean;
}
function parseCdnIsoMinutes(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return round12(raw);
  }
  const str = String(raw || "").trim();
  if (!str) return 0;
  const isoMatch = str.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/i);
  if (isoMatch) {
    const mins = Number(isoMatch[1]) || 0;
    const secs = Number(isoMatch[2]) || 0;
    return round12(mins + secs / 60);
  }
  const colonMatch = str.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const mins = Number(colonMatch[1]) || 0;
    const secs = Number(colonMatch[2]) || 0;
    return round12(mins + secs / 60);
  }
  const n = Number(str);
  return Number.isFinite(n) ? round12(n) : 0;
}
function computeHollingerGameScore(s) {
  return round12(s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.oreb + 0.3 * s.dreb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.tov);
}
function utcToEasternDateIso(utcStr) {
  if (!utcStr) return "";
  const dt = new Date(utcStr);
  if (Number.isNaN(dt.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(dt);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : "";
}
function normalizeScheduleDateToEasternIso(estRaw, gdDateRaw, utcRaw) {
  const estTrim = String(estRaw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(estTrim)) {
    return estTrim.slice(0, 10);
  }
  for (const candidate of [estTrim, String(gdDateRaw || "").trim()]) {
    const slashMatch = candidate.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (slashMatch) {
      return `${slashMatch[3]}-${slashMatch[1]}-${slashMatch[2]}`;
    }
  }
  const utcTrim = String(utcRaw || "").trim();
  if (utcTrim.includes("T")) {
    const converted = utcToEasternDateIso(utcTrim);
    if (converted) return converted;
  }
  return utcTrim.slice(0, 10);
}
function getSnapshotCandidatePaths() {
  const candidates = [path2.resolve(process.cwd(), "data", "nba-snapshot.json.gz"), path2.resolve(__dirname2, "data", "nba-snapshot.json.gz"), path2.resolve(__dirname2, "..", "data", "nba-snapshot.json.gz"), path2.resolve(__dirname2, "..", "..", "data", "nba-snapshot.json.gz"), path2.resolve(__dirname2, "..", "..", "..", "data", "nba-snapshot.json.gz")];
  return Array.from(new Set(candidates));
}
var memorySnapshotCache = null;
function isValidSnapshotPayload(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  const snap = candidate;
  if (snap.version !== 1) return false;
  if (!Array.isArray(snap.bios) || snap.bios.length < 250) return false;
  if (!snap.s2026 || !Array.isArray(snap.s2026.teams) || snap.s2026.teams.length < 30 || !Array.isArray(snap.s2026.players) || snap.s2026.players.length < 300) {
    return false;
  }
  if (!snap.s2027 || !Array.isArray(snap.s2027.teams) || snap.s2027.teams.length < 30 || !Array.isArray(snap.s2027.players)) {
    return false;
  }
  if (snap.s2025 && (!Array.isArray(snap.s2025.teams) || snap.s2025.teams.length < 30 || !Array.isArray(snap.s2025.players))) {
    return false;
  }
  if (snap.s2024 && (!Array.isArray(snap.s2024.teams) || snap.s2024.teams.length < 30 || !Array.isArray(snap.s2024.players))) {
    return false;
  }
  return true;
}
function readNbaSnapshotFromDisk() {
  for (const filePath of getSnapshotCandidatePaths()) {
    try {
      if (!fs2.existsSync(filePath)) continue;
      const stat = fs2.statSync(filePath);
      if (memorySnapshotCache && memorySnapshotCache.filePath === filePath && memorySnapshotCache.mtimeMs === stat.mtimeMs) {
        return memorySnapshotCache.snapshot;
      }
      const compressed = fs2.readFileSync(filePath);
      const jsonStr = zlib.gunzipSync(compressed).toString("utf8");
      const parsed = JSON.parse(jsonStr);
      if (!isValidSnapshotPayload(parsed)) {
        console.warn(`[RadarNBA Snapshot] Archivo ignorado por validaci\xF3n incompleta: ${filePath}`);
        continue;
      }
      memorySnapshotCache = { filePath, mtimeMs: stat.mtimeMs, snapshot: parsed };
      return parsed;
    } catch (err) {
      console.warn(`[RadarNBA Snapshot] No se pudo leer ${filePath}:`, err);
    }
  }
  return null;
}
function hydrateSeasonDatasetFromSnapshot(serialized) {
  const teamsByAbbr = /* @__PURE__ */ new Map();
  const tmUsageCtx = /* @__PURE__ */ new Map();
  for (const t of serialized.teams) {
    const clonedTeamGames = t.games.map((g) => {
      const tmPlays = (Number(g.fga) || 0) + 0.44 * (Number(g.fta) || 0) + (Number(g.tov) || 0);
      const rawGameMins = g.poss && g.pace ? g.poss / Math.max(70, g.pace) * 48 : 48;
      const gameMins = Math.max(48, rawGameMins);
      if (tmPlays > 0 && g.eventId) {
        tmUsageCtx.set(`${g.eventId}:${t.abbreviation}`, { tmPlays, gameMins });
      }
      return { ...g };
    });
    teamsByAbbr.set(t.abbreviation, { ...t, advanced: t.advanced ? { ...t.advanced } : void 0, games: clonedTeamGames });
  }
  const playersById = /* @__PURE__ */ new Map();
  for (const p of serialized.players) {
    const clonedPlayerGames = p.games.map((g) => {
      const mins = Number(g.minutes) || 0;
      const tAbbr = g.teamAbbr || p.teamAbbr;
      const ctx = g.eventId && tAbbr ? tmUsageCtx.get(`${g.eventId}:${tAbbr}`) : null;
      const plPlays = (Number(g.fga) || 0) + 0.44 * (Number(g.fta) || 0) + (Number(g.turnovers) || 0);
      const tmPlays = ctx && ctx.tmPlays > 0 ? ctx.tmPlays : (Number(ctx?.poss) || 99) * 1.135;
      const gameMins = Math.max(ctx ? ctx.gameMins : 48, mins);
      const usgEst = mins > 0 && tmPlays > 0 ? round12(Math.min(55, Math.max(0, plPlays / (tmPlays * (mins / gameMins)) * 100))) : 0;
      return { ...g, usgEst };
    });
    playersById.set(p.id, { ...p, advanced: p.advanced ? { ...p.advanced } : void 0, games: clonedPlayerGames });
  }
  return { seasonCode: serialized.seasonCode, dataSource: serialized.dataSource, teamsByAbbr, playersById };
}
async function fetchCdnJsonWithTimeout(url, timeoutMs) {
  const provider = identifyProviderFromUrl(url);
  return executeWithCircuitBreaker(provider, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: NBA_CDN_HEADERS, signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  });
}
var ESPN_ABBR_TO_NBA = { GS: "GSW", NY: "NYK", NO: "NOP", SA: "SAS", UTAH: "UTA", WSH: "WAS" };
function normalizeEspnTricode(raw) {
  const up = String(raw || "").trim().toUpperCase();
  return ESPN_ABBR_TO_NBA[up] || up;
}
function normalizeLookupNamePlain(raw) {
  return (raw || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\b(jr|sr|ii|iii|iv)\b/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
async function discoverCandidateCompletedGames2027(timeoutMs) {
  const todayIso = getEasternTodayIso();
  const nowMs = Date.now();
  const byGameId = /* @__PURE__ */ new Map();
  const liveNotFinalIds = /* @__PURE__ */ new Set();
  for (const sg of STATIC_SCHEDULE_2027) {
    if (!/^00226\d{5}$/.test(sg.gameId)) continue;
    if (sg.dateIso > todayIso) continue;
    if (sg.dateIso === todayIso && sg.dateTimeUtc) {
      const tipMs = Date.parse(sg.dateTimeUtc);
      if (!Number.isNaN(tipMs) && nowMs - tipMs < 95 * 60 * 1e3) {
        continue;
      }
    }
    byGameId.set(sg.gameId, { gameId: sg.gameId, dateIso: sg.dateIso, dateTimeUtc: sg.dateTimeUtc, awayAbbr: sg.awayAbbr, homeAbbr: sg.homeAbbr, confirmedFinal: false });
  }
  try {
    const sb = await fetchCdnJsonWithTimeout("https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json", Math.min(2e3, Math.max(900, timeoutMs)));
    const sbDateRaw = String(sb?.scoreboard?.gameDate || "").slice(0, 10);
    const sbGames = Array.isArray(sb?.scoreboard?.games) ? sb.scoreboard.games : [];
    for (const g of sbGames) {
      const gameId = String(g?.gameId || "").trim();
      if (!/^00226\d{5}$/.test(gameId)) continue;
      const statusNum = Number(g?.gameStatus) || 0;
      const statusTxt = String(g?.gameStatusText || "").trim();
      const isFinal = statusNum === 3 || /^final/i.test(statusTxt);
      if (!isFinal) {
        liveNotFinalIds.add(gameId);
        byGameId.delete(gameId);
        continue;
      }
      const awayAbbr = String(g?.awayTeam?.teamTricode || "").trim().toUpperCase();
      const homeAbbr = String(g?.homeTeam?.teamTricode || "").trim().toUpperCase();
      if (!NBA_TEAMS_MAP[awayAbbr] || !NBA_TEAMS_MAP[homeAbbr]) continue;
      const utcStr = String(g?.gameTimeUTC || g?.gameEt || "").trim();
      const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(sbDateRaw) ? sbDateRaw : normalizeScheduleDateToEasternIso("", "", utcStr) || todayIso;
      byGameId.set(gameId, { gameId, dateIso, dateTimeUtc: utcStr, awayAbbr, homeAbbr, confirmedFinal: true });
    }
  } catch {
  }
  for (const openId of liveNotFinalIds) {
    byGameId.delete(openId);
  }
  const list = [...byGameId.values()];
  list.sort((a, b) => (b.dateIso + "T" + (b.dateTimeUtc || "")).localeCompare(a.dateIso + "T" + (a.dateTimeUtc || "")));
  return list;
}
async function fetchEspnFallbackForMissingRefs(stillMissing, biosMap, remainingBudgetMs, lookbackDays = 3) {
  if (stillMissing.length === 0 || remainingBudgetMs < 900) return [];
  const todayIso = getEasternTodayIso();
  const minDateIso = addDaysIso(todayIso, -Math.max(3, lookbackDays));
  const recentMissing = stillMissing.filter((r) => r.dateIso >= minDateIso);
  if (recentMissing.length === 0) return [];
  const bioByNormAndTeam = /* @__PURE__ */ new Map();
  const bioByNormOnly = /* @__PURE__ */ new Map();
  for (const b of biosMap.values()) {
    const n = normalizeLookupNamePlain(b.name);
    if (!n) continue;
    bioByNormAndTeam.set(`${n}|${b.teamAbbr}`, b);
    if (!bioByNormOnly.has(n)) bioByNormOnly.set(n, b);
  }
  const maxDates = lookbackDays > 3 ? 12 : 3;
  const datesToQuery = Array.from(new Set(recentMissing.map((r) => r.dateIso))).slice(0, maxDates);
  const startedAt = Date.now();
  const recovered = [];
  for (const dateIso of datesToQuery) {
    const budgetLeft = remainingBudgetMs - (Date.now() - startedAt);
    if (budgetLeft < 700) break;
    const ymd = dateIso.replace(/-/g, "");
    try {
      const sb = await fetchCdnJsonWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymd}`, Math.min(1800, budgetLeft));
      const events = Array.isArray(sb?.events) ? sb.events : [];
      const matchingPairs = [];
      for (const ev of events) {
        const comp = ev?.competitions?.[0];
        const completed = Boolean(comp?.status?.type?.completed || ev?.status?.type?.completed);
        if (!completed) continue;
        const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const awayComp = competitors.find((c) => c?.homeAway === "away");
        const homeComp = competitors.find((c) => c?.homeAway === "home");
        const awayAbbr = normalizeEspnTricode(awayComp?.team?.abbreviation);
        const homeAbbr = normalizeEspnTricode(homeComp?.team?.abbreviation);
        const refMatch = recentMissing.find((r) => r.dateIso === dateIso && r.awayAbbr === awayAbbr && r.homeAbbr === homeAbbr);
        const espnEventId = String(ev?.id || "").trim();
        if (refMatch && espnEventId) {
          matchingPairs.push({ ref: refMatch, espnEventId });
        }
      }
      if (matchingPairs.length === 0) continue;
      const summaries = await Promise.allSettled(matchingPairs.map(async ({ ref, espnEventId }) => {
        const sumRaw = await fetchCdnJsonWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${espnEventId}`, Math.min(2200, Math.max(800, remainingBudgetMs - (Date.now() - startedAt))));
        const bsPlayers = Array.isArray(sumRaw?.boxscore?.players) ? sumRaw.boxscore.players : [];
        const headerComps = sumRaw?.header?.competitions?.[0]?.competitors || [];
        const buildCdnSide = __name4((targetAbbr) => {
          const pBlock = bsPlayers.find((b) => normalizeEspnTricode(b?.team?.abbreviation) === targetAbbr);
          const hComp = headerComps.find((c) => normalizeEspnTricode(c?.team?.abbreviation) === targetAbbr);
          const statGroup = pBlock?.statistics?.[0] || {};
          const labels = Array.isArray(statGroup.labels) ? statGroup.labels.map((l) => String(l || "").toUpperCase()) : [];
          const athletes = Array.isArray(statGroup.athletes) ? statGroup.athletes : [];
          const idxOf = __name4((lbl) => labels.indexOf(lbl), "idxOf");
          const parseMadeAtt = __name4((val) => {
            const m = String(val || "").match(/^(\d+)-(\d+)$/);
            return m ? [Number(m[1]) || 0, Number(m[2]) || 0] : [0, 0];
          }, "parseMadeAtt");
          const playersOut = [];
          for (const athEntry of athletes) {
            if (athEntry?.didNotPlay) continue;
            const statsArr = Array.isArray(athEntry?.stats) ? athEntry.stats.map(String) : [];
            if (statsArr.length === 0) continue;
            const rawName = String(athEntry?.athlete?.displayName || "").trim();
            const normName = normalizeLookupNamePlain(rawName);
            const matchedBio = bioByNormAndTeam.get(`${normName}|${targetAbbr}`) || bioByNormOnly.get(normName);
            const personId = matchedBio?.id || `espn_${String(athEntry?.athlete?.id || normName)}`;
            const minStr = statsArr[idxOf("MIN")] || "0";
            const mins = parseCdnIsoMinutes(minStr);
            if (mins <= 0) continue;
            const [fgm, fga] = parseMadeAtt(statsArr[idxOf("FG")]);
            const [fg3m, fg3a] = parseMadeAtt(statsArr[idxOf("3PT")]);
            const [ftm, fta] = parseMadeAtt(statsArr[idxOf("FT")]);
            const oreb = Number(statsArr[idxOf("OREB")]) || 0;
            const dreb = Number(statsArr[idxOf("DREB")]) || 0;
            const reb = Number(statsArr[idxOf("REB")]) || oreb + dreb;
            const ast = Number(statsArr[idxOf("AST")]) || 0;
            const stl = Number(statsArr[idxOf("STL")]) || 0;
            const blk = Number(statsArr[idxOf("BLK")]) || 0;
            const tov = Number(statsArr[idxOf("TO")]) || 0;
            const pf = Number(statsArr[idxOf("PF")]) || 0;
            const pm = Number(statsArr[idxOf("+/-")]) || 0;
            const pts = Number(statsArr[idxOf("PTS")]) || 0;
            const starterFlag = athEntry?.starter === true ? "1" : "0";
            playersOut.push({ personId, name: matchedBio?.name || rawName, position: matchedBio?.position || String(athEntry?.athlete?.position?.abbreviation || "G-F"), jerseyNum: matchedBio?.jersey || String(athEntry?.athlete?.jersey || ""), starter: starterFlag, played: "1", statistics: { minutes: minStr, points: pts, fieldGoalsMade: fgm, fieldGoalsAttempted: fga, threePointersMade: fg3m, threePointersAttempted: fg3a, freeThrowsMade: ftm, freeThrowsAttempted: fta, reboundsOffensive: oreb, reboundsDefensive: dreb, reboundsTotal: reb, assists: ast, steals: stl, blocks: blk, turnovers: tov, foulsPersonal: pf, plusMinusPoints: pm } });
          }
          const scoreNum = Number(hComp?.score) || playersOut.reduce((acc, p) => acc + (Number(p.statistics.points) || 0), 0);
          return { teamTricode: targetAbbr, score: scoreNum, statistics: {}, players: playersOut };
        }, "buildCdnSide");
        const awaySide = buildCdnSide(ref.awayAbbr);
        const homeSide = buildCdnSide(ref.homeAbbr);
        if (awaySide.score <= 0 || homeSide.score <= 0) {
          throw new Error("Incomplete ESPN boxscore");
        }
        const synthesized = { gameId: ref.gameId, gameStatus: 3, gameStatusText: "Final", awayTeam: awaySide, homeTeam: homeSide };
        cdnBoxscorePermanentCache.set(ref.gameId, synthesized);
        return { ref, cdnGame: synthesized };
      }));
      for (const s of summaries) {
        if (s.status === "fulfilled") {
          recovered.push(s.value);
        }
      }
    } catch {
    }
  }
  return recovered;
}
var cdnBoxscorePermanentCache = /* @__PURE__ */ new Map();
var cdnNotYetFinalCooldown = /* @__PURE__ */ new Map();
async function applyCdnDeltaGamesTo2027(dataset, biosMap, options) {
  const maxGamesToFetch = options?.maxGamesToFetch ?? 32;
  const timeoutBudgetMs = options?.timeoutBudgetMs ?? 5500;
  const forceRefresh = options?.forceRefresh ?? false;
  const startedAt = Date.now();
  const candidateRefs = await discoverCandidateCompletedGames2027(Math.min(1600, timeoutBudgetMs));
  if (candidateRefs.length === 0) return 0;
  const existingEventIds = /* @__PURE__ */ new Set();
  for (const tm of dataset.teamsByAbbr.values()) {
    for (const g of tm.games) {
      existingEventIds.add(g.eventId);
    }
  }
  const nowMs = Date.now();
  const missingRefs = candidateRefs.filter((ref) => {
    if (existingEventIds.has(ref.gameId)) return false;
    if (!forceRefresh && !ref.confirmedFinal) {
      const coolUntil = cdnNotYetFinalCooldown.get(ref.gameId) || 0;
      if (coolUntil > nowMs) return false;
    }
    return true;
  }).slice(0, maxGamesToFetch);
  if (missingRefs.length === 0) return 0;
  const fetchedGames = [];
  const failedRefs = [];
  const batchSize = 8;
  for (let i = 0; i < missingRefs.length; i += batchSize) {
    const elapsed = Date.now() - startedAt;
    const remainingMs = timeoutBudgetMs - elapsed;
    if (remainingMs < 600) {
      failedRefs.push(...missingRefs.slice(i));
      break;
    }
    const slice = missingRefs.slice(i, i + batchSize);
    const settled = await Promise.allSettled(slice.map(async (ref) => {
      const memHit = cdnBoxscorePermanentCache.get(ref.gameId);
      if (memHit) return { ref, cdnGame: memHit };
      const raw = await fetchCdnJsonWithTimeout(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${ref.gameId}.json`, Math.min(2200, Math.max(650, remainingMs)));
      const gameObj = raw?.game;
      if (!gameObj) {
        throw new Error(`Empty CDN boxscore for ${ref.gameId}`);
      }
      const statusNum = Number(gameObj.gameStatus) || 0;
      const statusTxt = String(gameObj.gameStatusText || "").trim();
      const isFinal = statusNum === 3 || /^final/i.test(statusTxt);
      if (!isFinal) {
        cdnNotYetFinalCooldown.set(ref.gameId, Date.now() + 3 * 60 * 1e3);
        throw new Error(`Game ${ref.gameId} not yet Final (${statusTxt})`);
      }
      cdnBoxscorePermanentCache.set(ref.gameId, gameObj);
      return { ref, cdnGame: gameObj };
    }));
    for (let idx = 0; idx < settled.length; idx++) {
      const s = settled[idx];
      if (s.status === "fulfilled") {
        fetchedGames.push(s.value);
      } else {
        const reason = String(s.reason || "");
        if (!reason.includes("not yet Final")) {
          failedRefs.push(slice[idx]);
        }
      }
    }
  }
  if (failedRefs.length > 0) {
    const remainingForEspn = timeoutBudgetMs - (Date.now() - startedAt);
    if (remainingForEspn >= 900) {
      const lookbackDays = options?.lookbackDays ?? (timeoutBudgetMs >= 15e3 ? 14 : 3);
      const espnRecovered = await fetchEspnFallbackForMissingRefs(failedRefs, biosMap, remainingForEspn, lookbackDays);
      fetchedGames.push(...espnRecovered);
    }
  }
  if (fetchedGames.length === 0) return 0;
  const touchedPlayers = /* @__PURE__ */ new Set();
  for (const { ref, cdnGame } of fetchedGames) {
    const awayTeamCdn = cdnGame.awayTeam || {};
    const homeTeamCdn = cdnGame.homeTeam || {};
    const awayAbbr = String(awayTeamCdn.teamTricode || ref.awayAbbr).trim().toUpperCase();
    const homeAbbr = String(homeTeamCdn.teamTricode || ref.homeAbbr).trim().toUpperCase();
    const awayTeamSummary = dataset.teamsByAbbr.get(awayAbbr);
    const homeTeamSummary = dataset.teamsByAbbr.get(homeAbbr);
    if (!awayTeamSummary || !homeTeamSummary) continue;
    if (awayTeamSummary.games.some((x) => x.eventId === ref.gameId)) continue;
    const extractTeamTotals = __name4((cdnSide) => {
      const st = cdnSide.statistics || {};
      const playersArr = Array.isArray(cdnSide.players) ? cdnSide.players : [];
      const sumPl = __name4((field) => playersArr.reduce((acc, p) => acc + (Number(p?.statistics?.[field]) || 0), 0), "sumPl");
      const pts = Number(cdnSide.score) || Number(st.points) || sumPl("points");
      const fgm = Number(st.fieldGoalsMade) || sumPl("fieldGoalsMade");
      const fga = Number(st.fieldGoalsAttempted) || sumPl("fieldGoalsAttempted");
      const fg3m = Number(st.threePointersMade) || sumPl("threePointersMade");
      const fg3a = Number(st.threePointersAttempted) || sumPl("threePointersAttempted");
      const ftm = Number(st.freeThrowsMade) || sumPl("freeThrowsMade");
      const fta = Number(st.freeThrowsAttempted) || sumPl("freeThrowsAttempted");
      const oreb = Number(st.reboundsOffensive) || sumPl("reboundsOffensive");
      const dreb = Number(st.reboundsDefensive) || sumPl("reboundsDefensive");
      const reb = Number(st.reboundsTotal) || Number(st.reboundsPersonal) || oreb + dreb;
      const ast = Number(st.assists) || sumPl("assists");
      const stl = Number(st.steals) || sumPl("steals");
      const blk = Number(st.blocks) || sumPl("blocks");
      const tov = Number(st.turnoversTotal) || Number(st.turnovers) || sumPl("turnovers");
      const teamTotalMins = parseCdnIsoMinutes(st.minutes) || playersArr.reduce((acc, p) => acc + parseCdnIsoMinutes(p?.statistics?.minutes), 0) || 240;
      return { pts, fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, blk, tov, gameMins: Math.max(48, teamTotalMins / 5) };
    }, "extractTeamTotals");
    const aw = extractTeamTotals(awayTeamCdn);
    const hm = extractTeamTotals(homeTeamCdn);
    if (aw.pts <= 0 && hm.pts <= 0) continue;
    const gameMins = Math.max(aw.gameMins, hm.gameMins, 48);
    const awPossRaw = aw.fga + 0.4 * aw.fta - 1.07 * (aw.oreb / Math.max(1, aw.oreb + hm.dreb)) * (aw.fga - aw.fgm) + aw.tov;
    const hmPossRaw = hm.fga + 0.4 * hm.fta - 1.07 * (hm.oreb / Math.max(1, hm.oreb + aw.dreb)) * (hm.fga - hm.fgm) + hm.tov;
    const poss = Math.max(1, round12(0.5 * (awPossRaw + hmPossRaw)));
    const pace = round12(poss / gameMins * 48);
    const buildTeamLog = __name4((me, opp, oppAbbr, isHome) => {
      const offRtg = round12(me.pts / poss * 100);
      const defRtg = round12(opp.pts / poss * 100);
      const netRtg = round12(offRtg - defRtg);
      const fgPct = me.fga > 0 ? round12(me.fgm / me.fga * 100) : 0;
      const fg3Pct = me.fg3a > 0 ? round12(me.fg3m / me.fg3a * 100) : 0;
      const ftPct = me.fta > 0 ? round12(me.ftm / me.fta * 100) : 0;
      const efgPct = me.fga > 0 ? round12((me.fgm + 0.5 * me.fg3m) / me.fga * 100) : 0;
      const tsDenom = 2 * (me.fga + 0.44 * me.fta);
      const tsPct = tsDenom > 0 ? round12(me.pts / tsDenom * 100) : 0;
      const orebPct = me.oreb + opp.dreb > 0 ? round12(me.oreb / (me.oreb + opp.dreb) * 100) : 0;
      const tovDenom = me.fga + 0.44 * me.fta + me.tov;
      const tovPct = tovDenom > 0 ? round12(me.tov / tovDenom * 100) : 0;
      return { eventId: ref.gameId, date: ref.dateIso, seasonLabel: "2026-27", opponentAbbr: oppAbbr, opponentName: NBA_TEAMS_MAP[oppAbbr]?.name || oppAbbr, isHome, result: me.pts > opp.pts ? "W" : "L", pointsFor: me.pts, pointsAgainst: opp.pts, differential: me.pts - opp.pts, totalPoints: me.pts + opp.pts, restDays: null, isBackToBack: false, fgm: me.fgm, fga: me.fga, fgPct, fg3m: me.fg3m, fg3a: me.fg3a, fg3Pct, ftm: me.ftm, fta: me.fta, ftPct, oreb: me.oreb, dreb: me.dreb, reb: me.reb, ast: me.ast, stl: me.stl, blk: me.blk, tov: me.tov, poss, offRtg, defRtg, netRtg, pace, efgPct, tsPct, orebPct, tovPct };
    }, "buildTeamLog");
    const awayLog = buildTeamLog(aw, hm, homeAbbr, false);
    const homeLog = buildTeamLog(hm, aw, awayAbbr, true);
    awayTeamSummary.games.push(awayLog);
    homeTeamSummary.games.push(homeLog);
    const scoreDisplay = `${aw.pts}-${hm.pts}`;
    const awTmPlays = Math.max(1, aw.fga + 0.44 * aw.fta + aw.tov);
    const hmTmPlays = Math.max(1, hm.fga + 0.44 * hm.fta + hm.tov);
    for (const sideInfo of [{ cdnSide: awayTeamCdn, teamAbbr: awayAbbr, oppAbbr: homeAbbr, isHome: false, result: awayLog.result, tmPlays: awTmPlays }, { cdnSide: homeTeamCdn, teamAbbr: homeAbbr, oppAbbr: awayAbbr, isHome: true, result: homeLog.result, tmPlays: hmTmPlays }]) {
      const cdnPlayers = Array.isArray(sideInfo.cdnSide.players) ? sideInfo.cdnSide.players : [];
      const teamMeta = NBA_TEAMS_MAP[sideInfo.teamAbbr];
      for (const cp of cdnPlayers) {
        const pid = String(cp?.personId || "").trim();
        if (!pid) continue;
        const fullName = String(cp?.name || "").trim() || [cp?.firstName, cp?.familyName].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
        const pos = String(cp?.position || "").trim();
        const jersey = String(cp?.jerseyNum ?? "").trim();
        const existingBio = biosMap.get(pid);
        if (!existingBio) {
          biosMap.set(pid, { id: pid, name: fullName || pid, teamId: teamMeta?.id || "", teamAbbr: sideInfo.teamAbbr, position: pos || "G-F", jersey, height: "", country: "" });
        } else if (sideInfo.teamAbbr && NBA_TEAMS_MAP[sideInfo.teamAbbr]) {
          existingBio.teamAbbr = sideInfo.teamAbbr;
          existingBio.teamId = teamMeta?.id || existingBio.teamId;
          if (jersey) existingBio.jersey = jersey;
          if (pos) existingBio.position = pos;
        }
        const playedFlag = String(cp?.played || "") === "1";
        const minutes = parseCdnIsoMinutes(cp?.statistics?.minutes);
        if (!playedFlag || minutes <= 0) continue;
        const bio = biosMap.get(pid);
        let pSummary = dataset.playersById.get(pid);
        if (!pSummary) {
          pSummary = { id: pid, name: fullName || bio?.name || pid, teamId: teamMeta?.id || bio?.teamId || "", teamAbbr: sideInfo.teamAbbr, teamName: teamMeta?.name || sideInfo.teamAbbr, position: pos || bio?.position || "G-F", jersey: jersey || bio?.jersey || void 0, height: bio?.height || void 0, country: bio?.country || void 0, ...bio?.birthYear ? { birthYear: bio.birthYear } : {}, games: [] };
          dataset.playersById.set(pid, pSummary);
        } else {
          pSummary.teamAbbr = sideInfo.teamAbbr;
          pSummary.teamId = teamMeta?.id || pSummary.teamId;
          pSummary.teamName = teamMeta?.name || pSummary.teamName;
          if (!pSummary.birthYear && bio?.birthYear) pSummary.birthYear = bio.birthYear;
          if (!pSummary.country && bio?.country) pSummary.country = bio.country;
        }
        if (pSummary.games.some((g) => g.eventId === ref.gameId)) continue;
        const st = cp.statistics || {};
        const pts = Number(st.points) || 0;
        const oreb = Number(st.reboundsOffensive) || 0;
        const dreb = Number(st.reboundsDefensive) || 0;
        const reb = Number(st.reboundsTotal) || oreb + dreb;
        const ast = Number(st.assists) || 0;
        const stl = Number(st.steals) || 0;
        const blk = Number(st.blocks) || 0;
        const tov = Number(st.turnovers) || 0;
        const pf = Number(st.foulsPersonal) || 0;
        const pm = Number(st.plusMinusPoints) || 0;
        const fgm = Number(st.fieldGoalsMade) || 0;
        const fga = Number(st.fieldGoalsAttempted) || 0;
        const fg3m = Number(st.threePointersMade) || 0;
        const fg3a = Number(st.threePointersAttempted) || 0;
        const ftm = Number(st.freeThrowsMade) || 0;
        const fta = Number(st.freeThrowsAttempted) || 0;
        const fgPct = fga > 0 ? round12(fgm / fga * 100) : 0;
        const fg3Pct = fg3a > 0 ? round12(fg3m / fg3a * 100) : 0;
        const ftPct = fta > 0 ? round12(ftm / fta * 100) : 0;
        const efgPct = fga > 0 ? round12((fgm + 0.5 * fg3m) / fga * 100) : 0;
        const tsDenom = 2 * (fga + 0.44 * fta);
        const tsPct = tsDenom > 0 ? round12(pts / tsDenom * 100) : 0;
        const plPoss = fga + 0.44 * fta + tov;
        const effGameMins = Math.max(gameMins, minutes);
        const usgEst = minutes > 0 && sideInfo.tmPlays > 0 ? round12(Math.min(55, Math.max(0, plPoss / (sideInfo.tmPlays * (minutes / effGameMins)) * 100))) : 0;
        const gmSc = computeHollingerGameScore({ pts, fgm, fga, ftm, fta, oreb, dreb, stl, ast, blk, pf, tov });
        const isStarter = cp?.starter === "1" || cp?.starter === true || cp?.starter === 1;
        const pLog = { eventId: ref.gameId, date: ref.dateIso, seasonLabel: "2026-27", teamAbbr: sideInfo.teamAbbr, teamId: teamMeta?.id || pSummary.teamId, opponentAbbr: sideInfo.oppAbbr, opponentName: NBA_TEAMS_MAP[sideInfo.oppAbbr]?.name || sideInfo.oppAbbr, isHome: sideInfo.isHome, result: sideInfo.result, scoreDisplay, restDays: null, isBackToBack: false, isStarter, minutes, points: pts, rebounds: reb, oreb, dreb, assists: ast, steals: stl, blocks: blk, stocks: stl + blk, turnovers: tov, fouls: pf, plusMinus: pm, fgm, fga, fgPct, fg3m, fg3a, fg3Pct, ftm, fta, ftPct, pra: pts + reb + ast, tsPct, efgPct, usgEst, gameScore: gmSc };
        pSummary.games.push(pLog);
        touchedPlayers.add(pid);
      }
    }
  }
  for (const [abbr, tm] of dataset.teamsByAbbr.entries()) {
    if (!tm.shortName) {
      tm.shortName = getShortTeamName(abbr, tm.name);
    }
    if (!tm.conference) {
      tm.conference = EAST_TEAM_ABBRS.has(abbr) ? "Este" : "Oeste";
    }
    tm.games.sort((a, b) => b.date.localeCompare(a.date));
    for (let i = 0; i < tm.games.length; i++) {
      const cur = tm.games[i];
      const prev = tm.games[i + 1];
      if (prev) {
        const rd = diffDaysIso(prev.date, cur.date);
        cur.restDays = rd;
        cur.isBackToBack = rd === 0;
      } else {
        cur.restDays = null;
        cur.isBackToBack = false;
      }
    }
    if (tm.games.length > 0) {
      const w = tm.games.filter((g) => g.result === "W").length;
      const l = tm.games.length - w;
      tm.wins = w;
      tm.losses = l;
      tm.winPct = round2(w / tm.games.length);
      tm.avgPointsFor = round12(meanNums(tm.games.map((g) => g.pointsFor)));
      tm.avgPointsAgainst = round12(meanNums(tm.games.map((g) => g.pointsAgainst)));
      tm.differential = round12(tm.avgPointsFor - tm.avgPointsAgainst);
      const homeG = tm.games.filter((g) => g.isHome);
      const roadG = tm.games.filter((g) => !g.isHome);
      const l10G = tm.games.slice(0, 10);
      tm.homeRecord = `${homeG.filter((g) => g.result === "W").length}-${homeG.filter((g) => g.result === "L").length}`;
      tm.roadRecord = `${roadG.filter((g) => g.result === "W").length}-${roadG.filter((g) => g.result === "L").length}`;
      tm.lastTenRecord = `${l10G.filter((g) => g.result === "W").length}-${l10G.filter((g) => g.result === "L").length}`;
      const firstRes = tm.games[0].result;
      let sc = 0;
      for (const g of tm.games) {
        if (g.result === firstRes) sc++;
        else break;
      }
      tm.streakCode = `${firstRes}${sc}`;
    }
  }
  for (const conf of ["Este", "Oeste"]) {
    const peers = [...dataset.teamsByAbbr.values()].filter((t) => t.conference === conf).sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
    const leader = peers[0];
    peers.forEach((t, idx) => {
      t.playoffSeed = idx + 1;
      if (leader) {
        const gb = (leader.wins - t.wins + (t.losses - leader.losses)) / 2;
        t.gamesBehind = gb <= 0 ? "0.0" : gb.toFixed(1);
      }
    });
  }
  for (const pid of touchedPlayers) {
    const p = dataset.playersById.get(pid);
    if (!p) continue;
    p.games.sort((a, b) => b.date.localeCompare(a.date));
    for (let i = 0; i < p.games.length; i++) {
      const cur = p.games[i];
      const prev = p.games[i + 1];
      if (prev) {
        const rd = diffDaysIso(prev.date, cur.date);
        cur.restDays = rd;
        cur.isBackToBack = rd === 0;
      } else {
        cur.restDays = null;
        cur.isBackToBack = false;
      }
    }
  }
  dataset.dataSource = "nba_official_hybrid";
  return fetchedGames.length;
}

// src/server/seasonAwardsService.ts
var NBA_ABBR_TO_ESPN_SLUG = {
  ATL: "atl",
  BOS: "bos",
  BKN: "bkn",
  CHA: "cha",
  CHI: "chi",
  CLE: "cle",
  DAL: "dal",
  DEN: "den",
  DET: "det",
  GSW: "gs",
  HOU: "hou",
  IND: "ind",
  LAC: "lac",
  LAL: "lal",
  MEM: "mem",
  MIA: "mia",
  MIL: "mil",
  MIN: "min",
  NOP: "no",
  NYK: "ny",
  OKC: "okc",
  ORL: "orl",
  PHI: "phi",
  PHX: "phx",
  POR: "por",
  SAC: "sac",
  SAS: "sa",
  TOR: "tor",
  UTA: "utah",
  WAS: "wsh"
};
function round13(val) {
  return Math.round((Number(val) || 0) * 10) / 10;
}
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
function meanNums2(arr) {
  if (!arr || arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}
function normalizeLookupName(raw) {
  return String(raw || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\b(jr|sr|ii|iii|iv)\b/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function formatSigned1(val) {
  const r = round13(val);
  return r > 0 ? `+${r.toFixed(1)}` : r.toFixed(1);
}
var espnRosterExperienceCache = null;
var espnRosterInflight = null;
async function fetchJsonShortTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
async function getEspnRosterExperienceMap(forceRefresh = false, timeoutMs = 2400) {
  if (!forceRefresh && espnRosterExperienceCache && espnRosterExperienceCache.expiresAt > Date.now()) {
    return espnRosterExperienceCache.byNormName;
  }
  if (!forceRefresh && espnRosterInflight) {
    return espnRosterInflight;
  }
  const run = (async () => {
    const byNormName = /* @__PURE__ */ new Map();
    const entries = Object.entries(NBA_ABBR_TO_ESPN_SLUG);
    const settled = await Promise.allSettled(
      entries.map(async ([nbaAbbr, espnSlug]) => {
        const data = await fetchJsonShortTimeout(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnSlug}/roster`,
          timeoutMs
        );
        const rawAthletes = Array.isArray(data?.athletes) ? data.athletes : [];
        const flatAthletes = [];
        for (const item of rawAthletes) {
          if (Array.isArray(item?.items)) {
            flatAthletes.push(...item.items);
          } else if (item && typeof item === "object") {
            flatAthletes.push(item);
          }
        }
        return { nbaAbbr, flatAthletes };
      })
    );
    let teamsResolved = 0;
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      teamsResolved++;
      const { nbaAbbr, flatAthletes } = s.value;
      for (const ath of flatAthletes) {
        const displayName = String(ath?.fullName || ath?.displayName || "").trim();
        const norm = normalizeLookupName(displayName);
        if (!norm) continue;
        const expRaw = ath?.experience?.years;
        const experienceYears = typeof expRaw === "number" && Number.isFinite(expRaw) ? expRaw : null;
        const debutYear = Number(ath?.debutYear) || null;
        const jersey = String(ath?.jersey ?? "").trim();
        const position = String(ath?.position?.abbreviation || "").trim();
        const dobRaw = String(ath?.dateOfBirth || "").trim();
        const dobYearMatch = dobRaw.match(/^(\d{4})-/);
        const birthYear = dobYearMatch ? Number(dobYearMatch[1]) : null;
        const country = String(ath?.birthPlace?.country || "").trim();
        byNormName.set(norm, {
          displayName,
          teamAbbr: nbaAbbr,
          experienceYears,
          debutYear,
          jersey,
          position,
          birthYear,
          country
        });
      }
    }
    if (teamsResolved >= 15) {
      espnRosterExperienceCache = {
        expiresAt: Date.now() + 6 * 60 * 60 * 1e3,
        byNormName
      };
    } else if (espnRosterExperienceCache) {
      return espnRosterExperienceCache.byNormName;
    }
    return byNormName;
  })();
  espnRosterInflight = run;
  try {
    return await run;
  } finally {
    espnRosterInflight = null;
  }
}
async function enrichBiosWithEspnRosters(biosMap, options = {}) {
  try {
    const expMap = await getEspnRosterExperienceMap(
      Boolean(options.forceRefresh),
      options.timeoutMs ?? 4500
    );
    if (!expMap || expMap.size === 0) return 0;
    let updatedCount = 0;
    for (const bio of biosMap.values()) {
      const norm = normalizeLookupName(bio.name);
      const hit = expMap.get(norm);
      if (!hit) continue;
      if (typeof hit.experienceYears === "number") {
        bio.experienceYears = hit.experienceYears;
        if (!bio.fromYear) {
          bio.fromYear = 2026 - hit.experienceYears;
        }
      }
      if (hit.debutYear && !bio.fromYear) {
        bio.fromYear = hit.debutYear;
      }
      if (hit.birthYear && !bio.birthYear) {
        bio.birthYear = hit.birthYear;
      }
      if (hit.country && !bio.country) {
        bio.country = hit.country;
      }
      if (options.updateActiveTeams && hit.teamAbbr && NBA_TEAMS_MAP[hit.teamAbbr]) {
        bio.teamAbbr = hit.teamAbbr;
        bio.teamId = NBA_TEAMS_MAP[hit.teamAbbr].id;
        if (hit.jersey) bio.jersey = hit.jersey;
        if (hit.position) bio.position = hit.position;
      }
      updatedCount++;
    }
    return updatedCount;
  } catch {
    return 0;
  }
}
function detectPlayerActiveStreak(games) {
  if (!games || games.length < 3) {
    return { label: null, count: 0 };
  }
  const rules = [
    { label: "30+ PTS", min: 3, check: (g) => g.points >= 30 },
    { label: "25+ PTS", min: 3, check: (g) => g.points >= 25 },
    {
      label: "Doble-Doble",
      min: 3,
      check: (g) => {
        const cats = (g.points >= 10 ? 1 : 0) + (g.rebounds >= 10 ? 1 : 0) + (g.assists >= 10 ? 1 : 0) + (g.steals >= 10 ? 1 : 0) + (g.blocks >= 10 ? 1 : 0);
        return cats >= 2;
      }
    },
    { label: "20+ PTS", min: 4, check: (g) => g.points >= 20 },
    { label: "10+ AST", min: 3, check: (g) => g.assists >= 10 },
    { label: "10+ REB", min: 4, check: (g) => g.rebounds >= 10 },
    { label: "3+ ROB+TAP", min: 3, check: (g) => g.stocks >= 3 },
    { label: "GmSc 20+", min: 3, check: (g) => g.gameScore >= 20 },
    { label: "15+ PTS", min: 5, check: (g) => g.points >= 15 },
    { label: "2+ ROB+TAP", min: 4, check: (g) => g.stocks >= 2 }
  ];
  let best = { label: null, count: 0, priorityScore: 0 };
  rules.forEach((rule, idx) => {
    let c = 0;
    for (const g of games) {
      if (rule.check(g)) c++;
      else break;
    }
    if (c >= rule.min) {
      const score = c * 10 - idx * 1.4;
      if (score > best.priorityScore) {
        best = { label: `${c} PJ \xB7 ${rule.label}`, count: c, priorityScore: score };
      }
    }
  });
  return { label: best.label, count: best.count };
}
function inferSeasonGamesStartedMap(playersList) {
  const seasonAvgMinsByPlayerTeam = /* @__PURE__ */ new Map();
  const gameSideEntries = /* @__PURE__ */ new Map();
  for (const p of playersList) {
    const minsByTeam = /* @__PURE__ */ new Map();
    for (const g of p.games || []) {
      const tAbbr = g.teamAbbr || p.teamAbbr;
      const arr = minsByTeam.get(tAbbr) || [];
      arr.push(g.minutes);
      minsByTeam.set(tAbbr, arr);
      const sideKey = `${g.eventId}:${tAbbr}`;
      const bucket = gameSideEntries.get(sideKey) || [];
      bucket.push({ playerId: p.id, game: g });
      gameSideEntries.set(sideKey, bucket);
    }
    for (const [tAbbr, arr] of minsByTeam.entries()) {
      seasonAvgMinsByPlayerTeam.set(`${p.id}:${tAbbr}`, meanNums2(arr));
    }
  }
  const startedCounts = /* @__PURE__ */ new Map();
  for (const [sideKey, entries] of gameSideEntries.entries()) {
    const tAbbr = sideKey.split(":")[1] || "";
    const explicitStarters = entries.filter((e) => e.game.isStarter === true);
    const explicitBench = new Set(
      entries.filter((e) => e.game.isStarter === false).map((e) => e.playerId)
    );
    const chosenStarterIds = new Set(explicitStarters.map((e) => e.playerId));
    if (chosenStarterIds.size < 5) {
      const candidates = entries.filter((e) => !chosenStarterIds.has(e.playerId) && !explicitBench.has(e.playerId)).sort((a, b) => {
        const baseA = seasonAvgMinsByPlayerTeam.get(`${a.playerId}:${tAbbr}`) || a.game.minutes;
        const baseB = seasonAvgMinsByPlayerTeam.get(`${b.playerId}:${tAbbr}`) || b.game.minutes;
        const scoreA = baseA * 0.65 + a.game.minutes * 0.35;
        const scoreB = baseB * 0.65 + b.game.minutes * 0.35;
        return scoreB - scoreA;
      });
      for (const cand of candidates) {
        if (chosenStarterIds.size >= 5) break;
        chosenStarterIds.add(cand.playerId);
      }
    }
    for (const pid of chosenStarterIds) {
      startedCounts.set(pid, (startedCounts.get(pid) || 0) + 1);
    }
  }
  const result = /* @__PURE__ */ new Map();
  for (const p of playersList) {
    const gp = p.games?.length || 0;
    const explicitGs = p.advanced?.gamesStarted;
    const inferredGs = startedCounts.get(p.id) || 0;
    const gs = typeof explicitGs === "number" && Number.isFinite(explicitGs) ? clamp(Math.round(explicitGs), 0, gp) : clamp(inferredGs, 0, gp);
    result.set(p.id, gs);
  }
  return result;
}
function parseScoreMargin(scoreDisplay) {
  const m = String(scoreDisplay || "").match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  return Math.abs(Number(m[1]) - Number(m[2]));
}
function isPlayerEligibleRookie({
  player,
  seasonScope,
  s2026PlayersById,
  biosMap,
  espnExpMap
}) {
  const pid = String(player.id || "");
  const bio = biosMap.get(pid);
  const normName = normalizeLookupName(player.name);
  const espnHit = espnExpMap?.get(normName);
  if (seasonScope === "2027") {
    const prev26 = s2026PlayersById.get(pid);
    if (prev26 && Array.isArray(prev26.games) && prev26.games.length > 0) {
      return false;
    }
    if (typeof bio?.fromYear === "number" && bio.fromYear > 0) {
      return bio.fromYear >= 2026;
    }
    if (typeof bio?.experienceYears === "number" && bio.experienceYears >= 0) {
      return bio.experienceYears === 0;
    }
    if (espnHit && typeof espnHit.experienceYears === "number" && espnHit.experienceYears >= 0) {
      return espnHit.experienceYears === 0;
    }
    if (espnHit && espnHit.debutYear) {
      return espnHit.debutYear >= 2026;
    }
    const numId2 = Number(pid);
    if (Number.isFinite(numId2) && numId2 > 0) {
      return numId2 >= 1642600;
    }
    return pid.startsWith("espn_");
  }
  if (typeof bio?.fromYear === "number" && bio.fromYear > 0) {
    return bio.fromYear === 2025;
  }
  if (typeof bio?.experienceYears === "number" && bio.experienceYears >= 0) {
    return bio.experienceYears === 1;
  }
  if (espnHit && espnHit.debutYear) {
    return espnHit.debutYear === 2025;
  }
  if (espnHit && typeof espnHit.experienceYears === "number" && espnHit.experienceYears >= 0) {
    return espnHit.experienceYears === 1;
  }
  const numId = Number(pid);
  return Number.isFinite(numId) && numId >= 1642200 && numId < 1643100;
}
var awardsCache = /* @__PURE__ */ new Map();
async function buildSeasonAwardsPayload({
  full,
  biosMap,
  seasonScope = "2027",
  forceRefresh = false
}) {
  const cacheKey = seasonScope === "2026" ? "2026" : "2027";
  const hit = awardsCache.get(cacheKey);
  if (!forceRefresh && hit && hit.expiresAt > Date.now()) {
    return hit.payload;
  }
  const espnExpMap = await getEspnRosterExperienceMap(forceRefresh, 2400);
  const activeDs = seasonScope === "2026" ? full.s2026 : full.s2027;
  const seasonLabel = seasonScope === "2026" ? "2025-26" : "2026-27";
  const teamsMap = activeDs.teamsByAbbr;
  const playersList = [...activeDs.playersById.values()].filter(
    (p) => Array.isArray(p.games) && p.games.length > 0 && NBA_TEAMS_MAP[p.teamAbbr]
  );
  const teamsList = [...teamsMap.values()];
  const avgTeamGamesPlayed = Math.max(
    1,
    Math.round(meanNums2(teamsList.map((t) => t.games?.length || 0)))
  );
  const closeEventMarginMap = /* @__PURE__ */ new Map();
  const teamClutchGamesCount = /* @__PURE__ */ new Map();
  for (const tm of teamsList) {
    let cCount = 0;
    for (const tg of tm.games || []) {
      const margin = Math.abs(Number(tg.differential) || 0);
      closeEventMarginMap.set(tg.eventId, margin);
      if (margin <= 5) cCount++;
    }
    teamClutchGamesCount.set(tm.abbreviation, cCount);
  }
  const teamDefRtgByAbbr = /* @__PURE__ */ new Map();
  for (const tm of teamsList) {
    const drtg = tm.advanced?.defRtg && tm.advanced.defRtg > 0 ? tm.advanced.defRtg : tm.games?.length > 0 ? round13(meanNums2(tm.games.map((g) => g.defRtg))) : 114;
    teamDefRtgByAbbr.set(tm.abbreviation, drtg);
  }
  const gsByPlayerId = inferSeasonGamesStartedMap(playersList);
  const profiles = [];
  for (const p of playersList) {
    const games = p.games;
    const gp = games.length;
    const tm = teamsMap.get(p.teamAbbr);
    const teamGp = Math.max(1, tm?.games?.length || avgTeamGamesPlayed);
    const isCompletedSeason = teamGp >= 80;
    const projectedGames82 = isCompletedSeason ? gp : clamp(Math.round(gp / teamGp * 82), gp, 82);
    const gs = gsByPlayerId.get(p.id) ?? 0;
    const benchGames = Math.max(0, gp - gs);
    const minutesAvg = round13(meanNums2(games.map((g) => g.minutes)));
    if (minutesAvg < 10) continue;
    const ptsAvg = round13(meanNums2(games.map((g) => g.points)));
    const rebAvg = round13(meanNums2(games.map((g) => g.rebounds)));
    const orebAvg = round13(meanNums2(games.map((g) => g.oreb)));
    const drebAvg = round13(meanNums2(games.map((g) => g.dreb)));
    const astAvg = round13(meanNums2(games.map((g) => g.assists)));
    const stlAvg = round13(meanNums2(games.map((g) => g.steals)));
    const blkAvg = round13(meanNums2(games.map((g) => g.blocks)));
    const stocksAvg = round13(stlAvg + blkAvg);
    const tovAvg = round13(meanNums2(games.map((g) => g.turnovers)));
    const praAvg = round13(ptsAvg + rebAvg + astAvg);
    const gmScAvg = round13(meanNums2(games.map((g) => g.gameScore)));
    const plusMinusAvg = round13(meanNums2(games.map((g) => g.plusMinus)));
    const totalPts = games.reduce((s, g) => s + g.points, 0);
    const totalFgm = games.reduce((s, g) => s + g.fgm, 0);
    const totalFg3m = games.reduce((s, g) => s + g.fg3m, 0);
    const totalFga = games.reduce((s, g) => s + g.fga, 0);
    const totalFta = games.reduce((s, g) => s + g.fta, 0);
    const tsDenom = 2 * (totalFga + 0.44 * totalFta);
    const tsPct = tsDenom > 0 ? round13(totalPts / tsDenom * 100) : round13(meanNums2(games.map((g) => g.tsPct)));
    const efgPct = totalFga > 0 ? round13((totalFgm + 0.5 * totalFg3m) / totalFga * 100) : round13(meanNums2(games.map((g) => g.efgPct)));
    const netRtg = p.advanced?.netRtg !== void 0 ? round13(p.advanced.netRtg) : round13(plusMinusAvg * 2.1);
    const recentSlice = games.slice(0, Math.min(5, gp));
    const recentWindowGames = recentSlice.length;
    const recentPtsAvg = round13(meanNums2(recentSlice.map((g) => g.points)));
    const recentPtsDelta = round13(recentPtsAvg - ptsAvg);
    const recentGmScAvg = round13(meanNums2(recentSlice.map((g) => g.gameScore)));
    const recentGmScDelta = round13(recentGmScAvg - gmScAvg);
    const recentStocksAvg = round13(meanNums2(recentSlice.map((g) => g.stocks)));
    const recentStocksDelta = round13(recentStocksAvg - stocksAvg);
    let momentumTone = "neutral";
    let momentumLabel = "Ritmo estable";
    if (gp >= 4 && (recentGmScDelta >= 1.8 || recentPtsDelta >= 2.8)) {
      momentumTone = "positive";
      momentumLabel = `En alza (${formatSigned1(recentPtsDelta)} PTS \xFAlt. ${recentWindowGames})`;
    } else if (gp >= 4 && (recentGmScDelta <= -1.8 || recentPtsDelta <= -2.8)) {
      momentumTone = "negative";
      momentumLabel = `En bache (${formatSigned1(recentPtsDelta)} PTS \xFAlt. ${recentWindowGames})`;
    }
    const streak = detectPlayerActiveStreak(games);
    const clutchLogs = games.filter((g) => {
      const m = closeEventMarginMap.get(g.eventId) ?? parseScoreMargin(g.scoreDisplay);
      return m !== null && m <= 5;
    });
    const clutchGames = clutchLogs.length;
    const clutchWins = clutchLogs.filter((g) => g.result === "W").length;
    const clutchLosses = clutchGames - clutchWins;
    const clutchPtsAvg = clutchGames > 0 ? round13(meanNums2(clutchLogs.map((g) => g.points))) : 0;
    const clutchAstAvg = clutchGames > 0 ? round13(meanNums2(clutchLogs.map((g) => g.assists))) : 0;
    const clutchGmScAvg = clutchGames > 0 ? round13(meanNums2(clutchLogs.map((g) => g.gameScore))) : 0;
    const clutchPlusMinusAvg = clutchGames > 0 ? round13(meanNums2(clutchLogs.map((g) => g.plusMinus))) : 0;
    const cPtsSum = clutchLogs.reduce((s, g) => s + g.points, 0);
    const cFgaSum = clutchLogs.reduce((s, g) => s + g.fga, 0);
    const cFtaSum = clutchLogs.reduce((s, g) => s + g.fta, 0);
    const cTsDenom = 2 * (cFgaSum + 0.44 * cFtaSum);
    const clutchTsPct = cTsDenom > 0 ? round13(cPtsSum / cTsDenom * 100) : 0;
    const adv = p.advanced;
    const hasOfficialHustle = adv && (adv.deflections > 0 || adv.contestedShots > 0 || adv.looseBalls > 0 || adv.boxOuts > 0);
    const deflectionsAvg = hasOfficialHustle ? round13(adv.deflections) : round13(stlAvg * 1.85 + blkAvg * 0.25);
    const contestedShotsAvg = hasOfficialHustle ? round13(adv.contestedShots) : round13(blkAvg * 3.4 + drebAvg * 0.55 + stlAvg * 0.7);
    const looseBallsAvg = hasOfficialHustle ? round13(adv.looseBalls) : round13(stlAvg * 0.55 + orebAvg * 0.28);
    const screenAssistsAvg = hasOfficialHustle ? round13(adv.screenAssists) : round13(orebAvg * 0.85 + blkAvg * 0.45);
    const boxOutsAvg = hasOfficialHustle ? round13(adv.boxOuts) : round13(orebAvg * 0.75 + drebAvg * 0.28);
    const foulsDrawnAvg = adv && adv.foulsDrawn > 0 ? round13(adv.foulsDrawn) : round13(totalFta / Math.max(1, gp) * 0.78);
    const teamWins = tm?.wins ?? 0;
    const teamLosses = tm?.losses ?? 0;
    const teamWinPct = tm?.winPct ?? 0.5;
    const conference = tm?.conference ?? "Oeste";
    const conferenceSeed = tm?.playoffSeed ?? 8;
    const teamDefRtg = teamDefRtgByAbbr.get(p.teamAbbr) ?? 114;
    const playerDefRtg = adv?.defRtg && adv.defRtg > 0 ? round13(adv.defRtg) : round13(teamDefRtg - stocksAvg * 0.7);
    const isRookie = isPlayerEligibleRookie({
      player: p,
      seasonScope,
      s2026PlayersById: full.s2026.playersById,
      biosMap,
      espnExpMap
    });
    profiles.push({
      p,
      gp,
      teamGp,
      projectedGames82,
      gs,
      benchGames,
      minutesAvg,
      ptsAvg,
      rebAvg,
      orebAvg,
      drebAvg,
      astAvg,
      stlAvg,
      blkAvg,
      stocksAvg,
      tovAvg,
      praAvg,
      gmScAvg,
      plusMinusAvg,
      tsPct,
      efgPct,
      netRtg,
      pie: adv?.pie || 0,
      recentWindowGames,
      recentPtsAvg,
      recentPtsDelta,
      recentGmScAvg,
      recentGmScDelta,
      recentStocksDelta,
      momentumTone,
      momentumLabel,
      streak,
      clutchGames,
      clutchWins,
      clutchLosses,
      clutchPtsAvg,
      clutchAstAvg,
      clutchGmScAvg,
      clutchPlusMinusAvg,
      clutchTsPct,
      deflectionsAvg,
      contestedShotsAvg,
      looseBallsAvg,
      screenAssistsAvg,
      boxOutsAvg,
      foulsDrawnAvg,
      hasOfficialHustle: Boolean(hasOfficialHustle),
      teamWins,
      teamLosses,
      teamWinPct,
      conference,
      conferenceSeed,
      teamDefRtg,
      playerDefRtg,
      isRookie
    });
  }
  const makeEntry = (prof, scoreParts, extras) => {
    const production = round13(clamp(scoreParts.production, 0, 48));
    const efficiencyImpact = round13(clamp(scoreParts.efficiencyImpact, 0, 26));
    const teamContext = round13(clamp(scoreParts.teamContext, 0, 18));
    const momentum = round13(clamp(scoreParts.momentum, 0, 14));
    const awardScore = round13(clamp(production + efficiencyImpact + teamContext + momentum, 1, 99.8));
    return {
      playerId: prof.p.id,
      playerName: prof.p.name,
      teamId: prof.p.teamId,
      teamAbbr: prof.p.teamAbbr,
      teamName: prof.p.teamName,
      position: prof.p.position || "G-F",
      teamWins: prof.teamWins,
      teamLosses: prof.teamLosses,
      teamWinPct: prof.teamWinPct,
      conference: prof.conference,
      conferenceSeed: prof.conferenceSeed,
      gamesPlayed: prof.gp,
      teamGamesPlayed: prof.teamGp,
      gamesStarted: prof.gs,
      benchGames: prof.benchGames,
      projectedGames82: prof.projectedGames82,
      awardScore,
      scoreBreakdown: {
        production,
        efficiencyImpact,
        teamContext,
        momentum
      },
      minutesAvg: prof.minutesAvg,
      ptsAvg: prof.ptsAvg,
      rebAvg: prof.rebAvg,
      astAvg: prof.astAvg,
      stlAvg: prof.stlAvg,
      blkAvg: prof.blkAvg,
      stocksAvg: prof.stocksAvg,
      tsPct: prof.tsPct,
      efgPct: prof.efgPct,
      gmScAvg: prof.gmScAvg,
      plusMinusAvg: prof.plusMinusAvg,
      netRtg: prof.netRtg,
      recentWindowGames: prof.recentWindowGames,
      recentPtsAvg: prof.recentPtsAvg,
      recentPtsDelta: prof.recentPtsDelta,
      recentGmScAvg: prof.recentGmScAvg,
      recentGmScDelta: prof.recentGmScDelta,
      momentumLabel: prof.momentumLabel,
      momentumTone: prof.momentumTone,
      activeStreakLabel: prof.streak.label,
      activeStreakCount: prof.streak.count,
      ...extras
    };
  };
  const minQualifyGames = avgTeamGamesPlayed >= 50 ? 22 : Math.max(2, Math.floor(avgTeamGamesPlayed * 0.35));
  const mvpCandidates = profiles.filter((pr) => pr.gp >= minQualifyGames && pr.minutesAvg >= 26 && (pr.ptsAvg >= 18 || pr.gmScAvg >= 16.5)).map((pr) => {
    const production = clamp((pr.gmScAvg - 11) * 2.15 + Math.max(0, pr.ptsAvg - 20) * 0.65, 6, 46);
    const efficiencyImpact = clamp(
      (pr.tsPct - 53) * 0.85 + clamp(pr.plusMinusAvg + 2, 0, 14) * 0.95 + (pr.pie > 0 ? Math.max(0, pr.pie - 13) * 0.6 : 0),
      2,
      24
    );
    const seedBonus = pr.conferenceSeed <= 3 ? 4.2 : pr.conferenceSeed <= 6 ? 2.2 : 0;
    const teamContext = clamp((pr.teamWinPct - 0.38) * 32 + seedBonus, 0, 18);
    const momentum = clamp(
      5.5 + pr.recentGmScDelta * 0.65 + Math.min(3.5, pr.streak.count * 0.45),
      1,
      12
    );
    return makeEntry(
      pr,
      { production, efficiencyImpact, teamContext, momentum },
      {
        metricsSimple: [
          { key: "pts", label: "PTS / PJ", valueDisplay: pr.ptsAvg.toFixed(1), tone: "accent" },
          { key: "reb_ast", label: "REB \xB7 AST", valueDisplay: `${pr.rebAvg.toFixed(1)} \xB7 ${pr.astAvg.toFixed(1)}` },
          { key: "record", label: "Balance equipo", valueDisplay: `${pr.teamWins}-${pr.teamLosses} (#${pr.conferenceSeed})` }
        ],
        metricsAdvanced: [
          { key: "gmsc", label: "GmSc / PJ", valueDisplay: pr.gmScAvg.toFixed(1), tone: "accent" },
          { key: "ts", label: "TS% Real", valueDisplay: `${pr.tsPct.toFixed(1)}%` },
          { key: "pm", label: "+/- \xB7 NetRtg", valueDisplay: `${formatSigned1(pr.plusMinusAvg)} \xB7 ${formatSigned1(pr.netRtg)}` }
        ],
        summarySimple: `Promedia ${pr.ptsAvg.toFixed(1)} PTS, ${pr.rebAvg.toFixed(1)} REB y ${pr.astAvg.toFixed(1)} AST liderando el ${pr.teamWins}-${pr.teamLosses} de ${pr.p.teamAbbr}.`,
        summaryAdvanced: `${pr.gmScAvg.toFixed(1)} GmSc al ${pr.tsPct.toFixed(1)}% TS (${formatSigned1(pr.netRtg)} NetRtg) en el #${pr.conferenceSeed} del ${pr.conference}.`
      }
    );
  }).sort((a, b) => b.awardScore - a.awardScore).slice(0, 25);
  const royCandidates = profiles.filter((pr) => pr.isRookie && pr.gp >= Math.max(1, minQualifyGames - 1) && pr.minutesAvg >= 12).map((pr) => {
    const production = clamp(pr.gmScAvg * 2.55 + pr.ptsAvg * 0.72 + (pr.rebAvg + pr.astAvg) * 0.45, 5, 47);
    const efficiencyImpact = clamp(
      (pr.tsPct - 46) * 0.75 + pr.stocksAvg * 2.8 + clamp(pr.minutesAvg - 14, 0, 22) * 0.35,
      2,
      24
    );
    const teamContext = clamp(4 + pr.minutesAvg / 36 * 8 + pr.teamWinPct * 5, 2, 16);
    const momentum = clamp(
      5.5 + pr.recentPtsDelta * 0.65 + Math.min(3.5, pr.streak.count * 0.5),
      1,
      13
    );
    return makeEntry(
      pr,
      { production, efficiencyImpact, teamContext, momentum },
      {
        metricsSimple: [
          { key: "pts", label: "PTS / PJ", valueDisplay: pr.ptsAvg.toFixed(1), tone: "accent" },
          { key: "reb_ast", label: "REB \xB7 AST", valueDisplay: `${pr.rebAvg.toFixed(1)} \xB7 ${pr.astAvg.toFixed(1)}` },
          { key: "min", label: "Minutos", valueDisplay: `${pr.minutesAvg.toFixed(1)} MIN` }
        ],
        metricsAdvanced: [
          { key: "gmsc", label: "GmSc / PJ", valueDisplay: pr.gmScAvg.toFixed(1), tone: "accent" },
          { key: "ts", label: "TS% \xB7 STK", valueDisplay: `${pr.tsPct.toFixed(1)}% \xB7 ${pr.stocksAvg.toFixed(1)}` },
          { key: "min_pm", label: "MIN \xB7 +/-", valueDisplay: `${pr.minutesAvg.toFixed(1)}m \xB7 ${formatSigned1(pr.plusMinusAvg)}` }
        ],
        summarySimple: `Novato con rol de ${pr.minutesAvg.toFixed(1)} MIN aportando ${pr.ptsAvg.toFixed(1)} PTS, ${pr.rebAvg.toFixed(1)} REB y ${pr.astAvg.toFixed(1)} AST.`,
        summaryAdvanced: `Impacto rookie de ${pr.gmScAvg.toFixed(1)} GmSc (${pr.tsPct.toFixed(1)}% TS \xB7 ${pr.stocksAvg.toFixed(1)} STK) en ${pr.minutesAvg.toFixed(1)} MIN/PJ.`
      }
    );
  }).sort((a, b) => b.awardScore - a.awardScore).slice(0, 25);
  const mipCandidates = [];
  for (const pr of profiles) {
    if (pr.isRookie || pr.gp < minQualifyGames || pr.minutesAvg < 20 || pr.ptsAvg < 12.5) continue;
    let basePts = 0;
    let basePra = 0;
    let baseGmSc = 0;
    let baseTs = 0;
    let baseLabel = "2025-26";
    let targetPts = pr.ptsAvg;
    let targetPra = pr.praAvg;
    let targetGmSc = pr.gmScAvg;
    let targetTs = pr.tsPct;
    if (seasonScope === "2027") {
      const p26 = full.s2026.playersById.get(pr.p.id);
      if (!p26 || !Array.isArray(p26.games) || p26.games.length < 15) continue;
      basePts = round13(meanNums2(p26.games.map((g) => g.points)));
      if (basePts > 23.5) continue;
      const baseReb = meanNums2(p26.games.map((g) => g.rebounds));
      const baseAst = meanNums2(p26.games.map((g) => g.assists));
      basePra = round13(basePts + baseReb + baseAst);
      baseGmSc = round13(meanNums2(p26.games.map((g) => g.gameScore)));
      const pts26Sum = p26.games.reduce((s, g) => s + g.points, 0);
      const fga26Sum = p26.games.reduce((s, g) => s + g.fga, 0);
      const fta26Sum = p26.games.reduce((s, g) => s + g.fta, 0);
      const denom26 = 2 * (fga26Sum + 0.44 * fta26Sum);
      baseTs = denom26 > 0 ? round13(pts26Sum / denom26 * 100) : 55;
    } else {
      if (pr.gp < 35) continue;
      const bio = biosMap.get(String(pr.p.id));
      const expYrs = bio?.experienceYears ?? (bio?.fromYear ? 2025 - bio.fromYear : 3);
      const chrono = [...pr.p.games].reverse();
      const splitIdx = Math.max(10, Math.floor(chrono.length * 0.4));
      const early = chrono.slice(0, splitIdx);
      const late = chrono.slice(splitIdx);
      basePts = round13(meanNums2(early.map((g) => g.points)));
      if (basePts > 19.5 || expYrs >= 7 && basePts >= 16.5) continue;
      targetPts = round13(meanNums2(late.map((g) => g.points)));
      targetPra = round13(meanNums2(late.map((g) => g.pra)));
      targetGmSc = round13(meanNums2(late.map((g) => g.gameScore)));
      targetTs = round13(meanNums2(late.map((g) => g.tsPct)));
      basePra = round13(meanNums2(early.map((g) => g.pra)));
      baseGmSc = round13(meanNums2(early.map((g) => g.gameScore)));
      baseTs = round13(meanNums2(early.map((g) => g.tsPct)));
      baseLabel = "1\xAA mitad 25-26";
    }
    const yoyPtsDelta = round13(targetPts - basePts);
    const yoyPraDelta = round13(targetPra - basePra);
    const yoyGmScDelta = round13(targetGmSc - baseGmSc);
    const yoyTsDelta = round13(targetTs - baseTs);
    if (yoyPtsDelta < 2.2 && yoyPraDelta < 3.5 && yoyGmScDelta < 2) continue;
    const production = clamp(
      yoyPtsDelta * 3.4 + Math.max(0, yoyPraDelta) * 1.15 + Math.max(0, pr.ptsAvg - 14) * 0.75,
      8,
      47
    );
    const efficiencyImpact = clamp(
      yoyGmScDelta * 2.1 + clamp(yoyTsDelta + 3, 0, 12) * 0.85 + Math.max(0, pr.tsPct - 55) * 0.5,
      2,
      24
    );
    const teamContext = clamp(pr.teamWinPct * 15 + pr.gs / Math.max(1, pr.gp) * 3, 2, 16);
    const momentum = clamp(
      5.5 + pr.recentPtsDelta * 0.55 + Math.min(3.5, pr.streak.count * 0.45),
      1,
      13
    );
    mipCandidates.push(
      makeEntry(
        pr,
        { production, efficiencyImpact, teamContext, momentum },
        {
          yoyPtsDelta,
          yoyPraDelta,
          yoyTsDelta,
          prevPtsAvg: basePts,
          metricsSimple: [
            {
              key: "yoy_pts",
              label: `Salto vs ${baseLabel}`,
              valueDisplay: `${formatSigned1(yoyPtsDelta)} PTS`,
              tone: "positive"
            },
            {
              key: "pts_now",
              label: "Antes \u2192 Ahora",
              valueDisplay: `${basePts.toFixed(1)} \u2192 ${targetPts.toFixed(1)}`
            },
            {
              key: "pra_jump",
              label: "Salto PRA",
              valueDisplay: `${formatSigned1(yoyPraDelta)} PRA`
            }
          ],
          metricsAdvanced: [
            {
              key: "yoy_gmsc",
              label: "Salto GmSc",
              valueDisplay: `${formatSigned1(yoyGmScDelta)} GmSc`,
              tone: "positive"
            },
            {
              key: "pts_now",
              label: "PTS (Ant \u2192 Act)",
              valueDisplay: `${basePts.toFixed(1)} \u2192 ${targetPts.toFixed(1)}`
            },
            {
              key: "ts_jump",
              label: "TS% (\u0394)",
              valueDisplay: `${targetTs.toFixed(1)}% (${formatSigned1(yoyTsDelta)})`
            }
          ],
          summarySimple: `Crece ${formatSigned1(yoyPtsDelta)} puntos por noche (de ${basePts.toFixed(1)} en ${baseLabel} a ${targetPts.toFixed(1)}) y ${formatSigned1(yoyPraDelta)} en PRA.`,
          summaryAdvanced: `Expansi\xF3n de ${formatSigned1(yoyGmScDelta)} GmSc y ${formatSigned1(yoyPtsDelta)} PTS/PJ sosteniendo ${targetTs.toFixed(1)}% TS (${formatSigned1(yoyTsDelta)} pp).`
        }
      )
    );
  }
  mipCandidates.sort((a, b) => b.awardScore - a.awardScore);
  const mipTop = mipCandidates.slice(0, 25);
  const dpoyCandidates = profiles.filter((pr) => pr.gp >= minQualifyGames && pr.minutesAvg >= 22 && (pr.stocksAvg >= 1.7 || pr.contestedShotsAvg >= 7.5 && pr.teamDefRtg <= 112.5)).map((pr) => {
    const production = clamp(
      pr.blkAvg * 9.2 + pr.stlAvg * 8.6 + pr.drebAvg * 1.45,
      8,
      46
    );
    const efficiencyImpact = clamp(
      pr.contestedShotsAvg * 0.95 + pr.deflectionsAvg * 1.85 + Math.max(0, 115 - pr.playerDefRtg) * 0.9,
      3,
      25
    );
    const teamContext = clamp((116.5 - pr.teamDefRtg) * 1.65 + pr.teamWinPct * 5, 1, 18);
    const momentum = clamp(
      5.5 + pr.recentStocksDelta * 2.2 + (pr.streak.label?.includes("ROB+TAP") ? pr.streak.count * 0.8 : 0),
      1,
      11
    );
    return makeEntry(
      pr,
      { production, efficiencyImpact, teamContext, momentum },
      {
        deflectionsAvg: pr.deflectionsAvg,
        contestedShotsAvg: pr.contestedShotsAvg,
        metricsSimple: [
          { key: "stocks", label: "Robos + Tapones", valueDisplay: `${pr.stocksAvg.toFixed(1)} STK`, tone: "accent" },
          { key: "stl_blk", label: "ROB \xB7 TAP", valueDisplay: `${pr.stlAvg.toFixed(1)} \xB7 ${pr.blkAvg.toFixed(1)}` },
          { key: "dreb", label: "Reb. Defensivos", valueDisplay: `${pr.drebAvg.toFixed(1)} DREB` }
        ],
        metricsAdvanced: [
          { key: "stocks", label: "STK (ROB/TAP)", valueDisplay: `${pr.stocksAvg.toFixed(1)} (${pr.stlAvg.toFixed(1)}/${pr.blkAvg.toFixed(1)})`, tone: "accent" },
          { key: "hustle_def", label: "Punteos \xB7 Desv\xEDos", valueDisplay: `${pr.contestedShotsAvg.toFixed(1)} \xB7 ${pr.deflectionsAvg.toFixed(1)}` },
          { key: "drtg", label: "DefRtg (Eq / Ind)", valueDisplay: `${pr.teamDefRtg.toFixed(1)} / ${pr.playerDefRtg.toFixed(1)}` }
        ],
        summarySimple: `Intimida con ${pr.stocksAvg.toFixed(1)} robos+tapones por noche (${pr.stlAvg.toFixed(1)} ROB, ${pr.blkAvg.toFixed(1)} TAP) y ${pr.drebAvg.toFixed(1)} rebotes defensivos.`,
        summaryAdvanced: `Ancla defensiva (${pr.teamDefRtg.toFixed(1)} DefRtg equipo) con ${pr.stocksAvg.toFixed(1)} STK, ${pr.contestedShotsAvg.toFixed(1)} tiros punteados y ${pr.deflectionsAvg.toFixed(1)} desv\xEDos.`
      }
    );
  }).sort((a, b) => b.awardScore - a.awardScore).slice(0, 25);
  const minBenchSample = avgTeamGamesPlayed >= 50 ? 24 : Math.max(3, Math.ceil(avgTeamGamesPlayed * 0.45));
  const sixthManCandidates = profiles.filter(
    (pr) => pr.gp >= minQualifyGames && pr.benchGames >= minBenchSample && pr.benchGames > pr.gs && pr.minutesAvg >= 16 && pr.minutesAvg <= 31.5 && pr.ptsAvg >= 10
  ).map((pr) => {
    const production = clamp(pr.ptsAvg * 1.75 + (pr.astAvg + pr.rebAvg) * 1.15 + pr.gmScAvg * 0.85, 8, 46);
    const efficiencyImpact = clamp(
      (pr.tsPct - 50) * 0.9 + clamp(pr.plusMinusAvg + 3, 0, 12) * 1.15,
      2,
      24
    );
    const benchRatio = pr.benchGames / Math.max(1, pr.gp);
    const teamContext = clamp(pr.teamWinPct * 13 + benchRatio * 4.5, 2, 17);
    const momentum = clamp(
      5.5 + pr.recentPtsDelta * 0.65 + Math.min(3.5, pr.streak.count * 0.45),
      1,
      13
    );
    return makeEntry(
      pr,
      { production, efficiencyImpact, teamContext, momentum },
      {
        metricsSimple: [
          { key: "pts", label: "PTS suplente", valueDisplay: pr.ptsAvg.toFixed(1), tone: "accent" },
          { key: "bench_gp", label: "Salidas banquillo", valueDisplay: `${pr.benchGames}/${pr.gp} PJ` },
          { key: "min_pra", label: "MIN \xB7 PRA", valueDisplay: `${pr.minutesAvg.toFixed(1)}m \xB7 ${pr.praAvg.toFixed(1)}` }
        ],
        metricsAdvanced: [
          { key: "gmsc", label: "GmSc \xB7 PTS", valueDisplay: `${pr.gmScAvg.toFixed(1)} \xB7 ${pr.ptsAvg.toFixed(1)}`, tone: "accent" },
          { key: "bench_gp", label: "Suplente / Titular", valueDisplay: `${pr.benchGames} SUP \xB7 ${pr.gs} TIT` },
          { key: "ts_pm", label: "TS% \xB7 +/-", valueDisplay: `${pr.tsPct.toFixed(1)}% \xB7 ${formatSigned1(pr.plusMinusAvg)}` }
        ],
        summarySimple: `Revoluciona la segunda unidad en ${pr.benchGames} de ${pr.gp} noches con ${pr.ptsAvg.toFixed(1)} PTS en ${pr.minutesAvg.toFixed(1)} minutos.`,
        summaryAdvanced: `Microondas de rotaci\xF3n (${pr.benchGames}/${pr.gp} desde banco): ${pr.ptsAvg.toFixed(1)} PTS y ${pr.gmScAvg.toFixed(1)} GmSc al ${pr.tsPct.toFixed(1)}% TS (${formatSigned1(pr.plusMinusAvg)} +/-).`
      }
    );
  }).sort((a, b) => b.awardScore - a.awardScore).slice(0, 25);
  const clutchCandidates = profiles.filter((pr) => {
    const teamCg = teamClutchGamesCount.get(pr.p.teamAbbr) || 1;
    const minCg = Math.max(2, Math.min(5, Math.floor(teamCg * 0.4)));
    return pr.clutchGames >= minCg && pr.minutesAvg >= 24 && pr.clutchPtsAvg >= 17;
  }).map((pr) => {
    const clutchWinPct = pr.clutchWins / Math.max(1, pr.clutchGames);
    const production = clamp(
      (pr.clutchPtsAvg - 14) * 1.9 + pr.clutchGmScAvg * 0.95 + pr.clutchAstAvg * 0.85,
      8,
      46
    );
    const efficiencyImpact = clamp(
      (pr.clutchTsPct - 50) * 0.9 + clamp(pr.clutchPlusMinusAvg + 4, 0, 16) * 0.95,
      2,
      24
    );
    const teamContext = clamp(clutchWinPct * 14 + Math.min(4, pr.clutchGames * 0.22), 2, 18);
    const momentum = clamp(5.5 + pr.recentGmScDelta * 0.55 + Math.min(3, pr.streak.count * 0.4), 1, 12);
    return makeEntry(
      pr,
      { production, efficiencyImpact, teamContext, momentum },
      {
        clutchGames: pr.clutchGames,
        clutchWins: pr.clutchWins,
        clutchLosses: pr.clutchLosses,
        clutchPtsAvg: pr.clutchPtsAvg,
        clutchTsPct: pr.clutchTsPct,
        clutchPlusMinusAvg: pr.clutchPlusMinusAvg,
        metricsSimple: [
          { key: "c_pts", label: "PTS en finales \u22645p", valueDisplay: pr.clutchPtsAvg.toFixed(1), tone: "accent" },
          { key: "c_wl", label: "Balance finales", valueDisplay: `${pr.clutchWins}-${pr.clutchLosses} (${pr.clutchGames} PJ)` },
          { key: "c_pm", label: "Impacto +/- final", valueDisplay: formatSigned1(pr.clutchPlusMinusAvg) }
        ],
        metricsAdvanced: [
          { key: "c_gmsc", label: "GmSc finales \u22645p", valueDisplay: pr.clutchGmScAvg.toFixed(1), tone: "accent" },
          { key: "c_ts", label: "TS% \xB7 PTS Clutch", valueDisplay: `${pr.clutchTsPct.toFixed(1)}% \xB7 ${pr.clutchPtsAvg.toFixed(1)}` },
          { key: "c_wl", label: "R\xE9cord \u22645 pts", valueDisplay: `${pr.clutchWins}-${pr.clutchLosses} (${Math.round(clutchWinPct * 100)}%V)` }
        ],
        summarySimple: `En ${pr.clutchGames} partidos decididos por 5 puntos o menos promedia ${pr.clutchPtsAvg.toFixed(1)} PTS con balance de ${pr.clutchWins}-${pr.clutchLosses}.`,
        summaryAdvanced: `Sangre fr\xEDa en finales apretados (\u22645 pts): ${pr.clutchGmScAvg.toFixed(1)} GmSc al ${pr.clutchTsPct.toFixed(1)}% TS (${pr.clutchWins}-${pr.clutchLosses}, ${formatSigned1(pr.clutchPlusMinusAvg)} +/-).`
      }
    );
  }).sort((a, b) => b.awardScore - a.awardScore).slice(0, 25);
  const hustleCandidates = profiles.filter((pr) => pr.gp >= minQualifyGames && pr.minutesAvg >= 18).map((pr) => {
    const rawEffortPerGame = pr.deflectionsAvg * 2.4 + pr.looseBallsAvg * 3.8 + pr.contestedShotsAvg * 0.85 + pr.screenAssistsAvg * 1.45 + pr.boxOutsAvg * 1.2 + pr.orebAvg * 1.65 + pr.stocksAvg * 2.2;
    const effortPer36 = rawEffortPerGame / Math.max(18, pr.minutesAvg) * 32;
    const production = clamp(rawEffortPerGame * 1.65, 6, 46);
    const efficiencyImpact = clamp(
      effortPer36 * 0.72 + clamp(pr.plusMinusAvg + 3, 0, 12) * 0.65 + pr.foulsDrawnAvg * 0.7,
      3,
      25
    );
    const teamContext = clamp(pr.teamWinPct * 12 + (115.5 - pr.teamDefRtg) * 0.8, 2, 16);
    const momentum = clamp(5.5 + pr.recentStocksDelta * 1.8 + pr.recentGmScDelta * 0.35, 1, 13);
    return makeEntry(
      pr,
      { production, efficiencyImpact, teamContext, momentum },
      {
        deflectionsAvg: pr.deflectionsAvg,
        contestedShotsAvg: pr.contestedShotsAvg,
        looseBallsAvg: pr.looseBallsAvg,
        screenAssistsAvg: pr.screenAssistsAvg,
        boxOutsAvg: pr.boxOutsAvg,
        orebAvg: pr.orebAvg,
        metricsSimple: [
          { key: "defl_loose", label: "Desv\xEDos \xB7 Bal. sueltos", valueDisplay: `${pr.deflectionsAvg.toFixed(1)} \xB7 ${pr.looseBallsAvg.toFixed(1)}`, tone: "accent" },
          { key: "contest", label: "Tiros punteados", valueDisplay: `${pr.contestedShotsAvg.toFixed(1)} / PJ` },
          { key: "oreb_stk", label: "OREB \xB7 ROB+TAP", valueDisplay: `${pr.orebAvg.toFixed(1)} \xB7 ${pr.stocksAvg.toFixed(1)}` }
        ],
        metricsAdvanced: [
          { key: "defl_loose", label: "Desv\xEDos \xB7 Recuperac.", valueDisplay: `${pr.deflectionsAvg.toFixed(1)} \xB7 ${pr.looseBallsAvg.toFixed(1)}`, tone: "accent" },
          { key: "scr_box", label: "Pantallas \xB7 BoxOuts", valueDisplay: `${pr.screenAssistsAvg.toFixed(1)} \xB7 ${pr.boxOutsAvg.toFixed(1)}` },
          { key: "contest_oreb", label: "Punteos \xB7 OREB", valueDisplay: `${pr.contestedShotsAvg.toFixed(1)} \xB7 ${pr.orebAvg.toFixed(1)}` }
        ],
        summarySimple: `Motor incansable: ${pr.deflectionsAvg.toFixed(1)} desv\xEDos, ${pr.contestedShotsAvg.toFixed(1)} tiros punteados, ${pr.looseBallsAvg.toFixed(1)} balones divididos y ${pr.orebAvg.toFixed(1)} rebotes ofensivos.`,
        summaryAdvanced: `Intangibles \xE9lite por noche: ${pr.deflectionsAvg.toFixed(1)} DESV \xB7 ${pr.looseBallsAvg.toFixed(1)} REC \xB7 ${pr.contestedShotsAvg.toFixed(1)} PUNT \xB7 ${pr.screenAssistsAvg.toFixed(1)} PANT \xB7 ${pr.boxOutsAvg.toFixed(1)} BOX.`
      }
    );
  }).sort((a, b) => b.awardScore - a.awardScore).slice(0, 25);
  const allNbaPool = profiles.filter((pr) => pr.gp >= minQualifyGames && pr.minutesAvg >= 24 && (pr.ptsAvg >= 15 || pr.gmScAvg >= 14.5)).map((pr) => {
    const production = clamp((pr.gmScAvg - 10) * 2.25 + Math.max(0, pr.ptsAvg - 18) * 0.65, 6, 47);
    const efficiencyImpact = clamp(
      (pr.tsPct - 52) * 0.85 + pr.stocksAvg * 1.4 + clamp(pr.plusMinusAvg + 3, 0, 14) * 0.85,
      2,
      25
    );
    const teamContext = clamp((pr.teamWinPct - 0.32) * 24 + (pr.conferenceSeed <= 6 ? 2.5 : 0), 1, 15);
    const momentum = clamp(5.5 + pr.recentGmScDelta * 0.55 + Math.min(3, pr.streak.count * 0.4), 1, 13);
    return makeEntry(
      pr,
      { production, efficiencyImpact, teamContext, momentum },
      {
        metricsSimple: [
          { key: "pts", label: "PTS / PJ", valueDisplay: pr.ptsAvg.toFixed(1), tone: "accent" },
          { key: "reb_ast", label: "REB \xB7 AST", valueDisplay: `${pr.rebAvg.toFixed(1)} \xB7 ${pr.astAvg.toFixed(1)}` },
          { key: "record", label: "Equipo", valueDisplay: `${pr.p.teamAbbr} (${pr.teamWins}-${pr.teamLosses})` }
        ],
        metricsAdvanced: [
          { key: "gmsc", label: "GmSc \xB7 TS%", valueDisplay: `${pr.gmScAvg.toFixed(1)} \xB7 ${pr.tsPct.toFixed(1)}%`, tone: "accent" },
          { key: "line", label: "PTS \xB7 REB \xB7 AST", valueDisplay: `${pr.ptsAvg.toFixed(1)} \xB7 ${pr.rebAvg.toFixed(1)} \xB7 ${pr.astAvg.toFixed(1)}` },
          { key: "net", label: "NetRtg \xB7 +/-", valueDisplay: `${formatSigned1(pr.netRtg)} \xB7 ${formatSigned1(pr.plusMinusAvg)}` }
        ],
        summarySimple: `${pr.ptsAvg.toFixed(1)} PTS \xB7 ${pr.rebAvg.toFixed(1)} REB \xB7 ${pr.astAvg.toFixed(1)} AST (${pr.teamWins}-${pr.teamLosses})`,
        summaryAdvanced: `${pr.gmScAvg.toFixed(1)} GmSc \xB7 ${pr.tsPct.toFixed(1)}% TS \xB7 ${formatSigned1(pr.netRtg)} NetRtg`
      }
    );
  }).sort((a, b) => b.awardScore - a.awardScore).slice(0, 42);
  const payload = {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    dataSource: activeDs.dataSource,
    seasonScope: cacheKey,
    seasonLabel,
    avgTeamGamesPlayed,
    defaultMinProjectedGames: 65,
    categories: {
      mvp: mvpCandidates,
      roy: royCandidates,
      mip: mipTop,
      dpoy: dpoyCandidates,
      "6moy": sixthManCandidates,
      clutch: clutchCandidates,
      hustle: hustleCandidates
    },
    allNbaPool
  };
  awardsCache.set(cacheKey, {
    expiresAt: Date.now() + 8 * 60 * 1e3,
    payload
  });
  return payload;
}

// src/server/nbaDataService.ts
var __name5 = (fn, _name) => fn;
var GAMEDAY_THRESHOLDS_FILE = path3.resolve(process.cwd(), "data", "gameday-thresholds-config.json");
var DEFAULT_GAMEDAY_THRESHOLDS = {
  // 03A. Noches de Explosión
  explosionShootingTsDiff: 10,
  explosion3pMinMade: 4,
  explosion3pDelta: 3,
  explosionRebMinTotal: 10,
  explosionRebDelta: 4,
  explosionAstMinTotal: 8,
  explosionAstDelta: 4,
  explosionStocksMinTotal: 5,
  explosionStocksDelta: 2.5,
  explosionMinutesDelta: 5,
  explosionScoringPtsDelta: 8,
  explosionZScoreThreshold: 1.8,
  // 03B. Batacazos de Titulares
  starterMinMinutesAvg: 24,
  starterMinPointsAvg: 14,
  slumpScoringDropPts: 7.5,
  slumpShootingMaxTsPct: 42,
  slumpShootingTsDrop: 12,
  slumpFoulsTroubleCount: 5,
  slumpFoulsMinutesCut: 6,
  slumpTurnoversCount: 5,
  slumpTurnoversDelta: 2.5,
  slump3pSpecialistAvg: 2,
  slump3pDropDelta: 2,
  slumpAstFacilitatorAvg: 6,
  slumpAstDropDelta: 3.5,
  slumpRebInteriorAvg: 8.5,
  slumpRebDropDelta: 4.5,
  slumpMinutesCutDelta: 8
};
var activeGamedayThresholds = { ...DEFAULT_GAMEDAY_THRESHOLDS, updatedAt: 0 };
function initGamedayThresholdsFromDisk() {
  try {
    if (fs3.existsSync(GAMEDAY_THRESHOLDS_FILE)) {
      const raw = fs3.readFileSync(GAMEDAY_THRESHOLDS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.explosionShootingTsDiff === "number") {
        activeGamedayThresholds = { ...DEFAULT_GAMEDAY_THRESHOLDS, ...parsed };
      }
    }
  } catch {
  }
}
initGamedayThresholdsFromDisk();
function getGamedayThresholdsConfig() {
  return { ...activeGamedayThresholds };
}
function updateGamedayThresholdsConfig(values) {
  const updated = {
    ...activeGamedayThresholds,
    ...values,
    updatedAt: Date.now()
  };
  activeGamedayThresholds = updated;
  try {
    const dir = path3.dirname(GAMEDAY_THRESHOLDS_FILE);
    if (!fs3.existsSync(dir)) fs3.mkdirSync(dir, { recursive: true });
    fs3.writeFileSync(GAMEDAY_THRESHOLDS_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch {
  }
  return { ...activeGamedayThresholds };
}
function resetGamedayThresholdsConfigDefaults() {
  const reset = {
    ...DEFAULT_GAMEDAY_THRESHOLDS,
    updatedAt: Date.now()
  };
  activeGamedayThresholds = reset;
  try {
    if (fs3.existsSync(GAMEDAY_THRESHOLDS_FILE)) {
      fs3.unlinkSync(GAMEDAY_THRESHOLDS_FILE);
    }
  } catch {
  }
  return { ...activeGamedayThresholds };
}
function isSnapshotOnlyRuntime() {
  return Boolean(process.env.VERCEL) || process.env.NBA_SNAPSHOT_ONLY === "1";
}
var staticScheduleByGameId = new Map(STATIC_SCHEDULE_2027.map((s) => [s.gameId, s]));
var NBA_STATS_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Referer: "https://www.nba.com/", Origin: "https://www.nba.com", Accept: "application/json, text/plain, */*", "x-nba-stats-origin": "stats", "x-nba-stats-token": "true", "Accept-Language": "en-US,en;q=0.9" };
var EAST_TEAM_ABBRS2 = /* @__PURE__ */ new Set(["ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS"]);
var jsonCache = /* @__PURE__ */ new Map();
var jsonInflight = /* @__PURE__ */ new Map();
function round14(val) {
  return Math.round((Number(val) || 0) * 10) / 10;
}
function round22(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}
function meanNums3(arr) {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}
function stdDevNums(arr) {
  if (arr.length < 2) return 0;
  const avg = meanNums3(arr);
  let sq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - avg;
    sq += d * d;
  }
  return Math.sqrt(sq / arr.length);
}
function toPct100(raw) {
  const n = Number(raw) || 0;
  if (n === 0) return 0;
  if (Math.abs(n) <= 1.5) return round14(n * 100);
  return round14(n);
}
function normalizeText(str) {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function normalizeEspnAbbr(raw) {
  const up = (raw || "").trim().toUpperCase();
  const map = { GS: "GSW", NY: "NYK", NO: "NOP", SA: "SAS", UTAH: "UTA", WSH: "WAS" };
  return map[up] || up;
}
function getShortTeamName2(abbr, fullName) {
  const meta = NBA_TEAMS_MAP[abbr];
  if (meta) {
    if (abbr === "POR") return "Trail Blazers";
    const parts2 = meta.name.split(" ");
    return parts2[parts2.length - 1] || meta.name;
  }
  const clean = (fullName || abbr).trim();
  const parts = clean.split(" ");
  return parts[parts.length - 1] || clean;
}
async function cachedFetchJson(url, ttlMs = 5 * 60 * 1e3, headers = {}, timeoutMs = 12e3, forceRefresh = false) {
  if (!forceRefresh) {
    const hit = jsonCache.get(url);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
  }
  const inflight = jsonInflight.get(url);
  if (inflight && !forceRefresh) {
    return inflight;
  }
  const provider = identifyProviderFromUrl(url);
  const p = executeWithCircuitBreaker(
    provider,
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { headers, signal: controller.signal });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} fetching ${url}`);
        }
        const data = await res.json();
        jsonCache.set(url, { expiresAt: Date.now() + ttlMs, value: data });
        return data;
      } finally {
        clearTimeout(timer);
      }
    },
    (err) => {
      const staleHit = jsonCache.get(url);
      if (staleHit) {
        console.warn(`[CircuitBreaker Fallback] Sirviendo cach\xE9 stale para ${url} debido a: ${err.message}`);
        return staleHit.value;
      }
      throw err;
    }
  );
  jsonInflight.set(url, p);
  try {
    return await p;
  } finally {
    jsonInflight.delete(url);
  }
}
function parseNbaResultSet(raw) {
  const rs = Array.isArray(raw?.resultSets) ? raw.resultSets[0] : raw?.resultSet;
  if (!rs || !Array.isArray(rs.headers) || !Array.isArray(rs.rowSet)) {
    return [];
  }
  const headers = rs.headers;
  const rows = rs.rowSet;
  const out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = r[j];
    }
    out[i] = obj;
  }
  return out;
}
function computeHollingerGameScore2(s) {
  return round14(s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.oreb + 0.3 * s.dreb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.tov);
}
function parseMatchupField(matchupRaw, selfAbbr) {
  const str = String(matchupRaw || "").trim();
  if (str.includes("@")) {
    const parts = str.split("@").map((s) => s.trim().toUpperCase());
    return { isHome: false, opponentAbbr: parts[1] || selfAbbr };
  }
  if (/vs\.?/i.test(str)) {
    const parts = str.split(/vs\.?/i).map((s) => s.trim().toUpperCase());
    return { isHome: true, opponentAbbr: parts[1] || selfAbbr };
  }
  return { isHome: true, opponentAbbr: "NBA" };
}
function diffDaysIso2(olderIso, newerIso) {
  const a = Date.parse(`${olderIso.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${newerIso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / (24 * 60 * 60 * 1e3)) - 1;
  return Math.max(0, days);
}
var cachedBios = null;
async function getPlayerBiosMap(forceRefresh = false, options) {
  const forceLive = Boolean(options?.forceLiveStats);
  if (!forceRefresh && !forceLive && cachedBios && cachedBios.expiresAt > Date.now()) {
    return cachedBios.map;
  }
  const map = /* @__PURE__ */ new Map();
  const snap = readNbaSnapshotFromDisk();
  if (snap?.bios?.length) {
    for (const b of snap.bios) {
      if (b?.id) {
        map.set(b.id, { ...b });
      }
    }
  }
  if (isSnapshotOnlyRuntime() && !forceLive) {
    cachedBios = { expiresAt: Date.now() + 60 * 60 * 1e3, map };
    return map;
  }
  const need2026Live = forceLive || map.size < 450;
  const requests = [];
  if (need2026Live) {
    requests.push(cachedFetchJson("https://stats.nba.com/stats/playerindex?College=&Country=&DraftPick=&DraftRound=&DraftYear=&Height=&Historical=0&LeagueID=00&Season=2025-26&SeasonType=Regular%20Season&TeamID=0&Weight=", 6 * 60 * 60 * 1e3, NBA_STATS_HEADERS, 12e3, forceRefresh || forceLive));
  }
  requests.push(cachedFetchJson("https://stats.nba.com/stats/playerindex?College=&Country=&DraftPick=&DraftRound=&DraftYear=&Height=&Historical=0&LeagueID=00&Season=2026-27&SeasonType=Regular%20Season&TeamID=0&Weight=", 60 * 60 * 1e3, NBA_STATS_HEADERS, 12e3, forceRefresh || forceLive));
  const settledList = await Promise.allSettled(requests);
  let statsRowsParsed = 0;
  for (const settled of settledList) {
    if (settled.status !== "fulfilled") continue;
    const rows = parseNbaResultSet(settled.value);
    for (const r of rows) {
      const id = String(r.PERSON_ID || "").trim();
      if (!id) continue;
      statsRowsParsed++;
      const prev = map.get(id);
      const first = String(r.PLAYER_FIRST_NAME || "").trim();
      const last = String(r.PLAYER_LAST_NAME || "").trim();
      const name = [first, last].filter(Boolean).join(" ").trim();
      const teamAbbr = String(r.TEAM_ABBREVIATION || "").trim().toUpperCase();
      const teamId = String(r.TEAM_ID || "").trim() || NBA_TEAMS_MAP[teamAbbr]?.id || "";
      const fromYear = Number(r.FROM_YEAR) || prev?.fromYear;
      const draftYear = Number(r.DRAFT_YEAR) || prev?.draftYear;
      map.set(id, { id, name: name || prev?.name || id, teamId, teamAbbr: teamAbbr || "NBA", position: String(r.POSITION || prev?.position || "G-F").trim() || "G-F", jersey: String(r.JERSEY_NUMBER ?? prev?.jersey ?? "").trim(), height: String(r.HEIGHT || prev?.height || "").trim(), country: String(r.COUNTRY || prev?.country || "").trim(), ...prev?.birthYear ? { birthYear: prev.birthYear } : {}, ...fromYear ? { fromYear } : {}, ...draftYear ? { draftYear } : {}, ...typeof prev?.experienceYears === "number" ? { experienceYears: prev.experienceYears } : {} });
    }
  }
  if (forceLive) {
    await enrichBiosWithEspnRosters(map, { forceRefresh: true, updateActiveTeams: statsRowsParsed === 0, timeoutMs: 6e3 });
  }
  cachedBios = { expiresAt: Date.now() + 60 * 60 * 1e3, map };
  return map;
}
var seasonDatasetCache = /* @__PURE__ */ new Map();
var seasonDatasetInflight = /* @__PURE__ */ new Map();
async function buildSingleSeasonDataset(seasonCode, forceRefresh = false, options) {
  const forceLive = Boolean(options?.forceLiveStats);
  const ttlMs = seasonCode === "2026-27" ? 4 * 60 * 1e3 : 6 * 60 * 60 * 1e3;
  if (!forceRefresh && !forceLive) {
    const hit = seasonDatasetCache.get(seasonCode);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.data;
    }
  }
  const existing = seasonDatasetInflight.get(seasonCode);
  if (existing && !forceRefresh && !forceLive) {
    return existing;
  }
  const promise = (async () => {
    const snap = readNbaSnapshotFromDisk();
    if (seasonCode === "2025-26" && !forceLive && snap?.s2026) {
      const hydrated26 = hydrateSeasonDatasetFromSnapshot(snap.s2026);
      seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: hydrated26 });
      return hydrated26;
    }
    if (seasonCode === "2023-24" && !forceLive && snap?.s2024) {
      const hydrated24 = hydrateSeasonDatasetFromSnapshot(snap.s2024);
      seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: hydrated24 });
      return hydrated24;
    }
    const biosMap = await getPlayerBiosMap(forceRefresh, { forceLiveStats: forceLive });
    if (isSnapshotOnlyRuntime() && !forceLive) {
      const createEmptyTeamsMap = __name5(() => new Map(Object.values(NBA_TEAMS_MAP).map((tm) => [tm.abbr, { id: tm.id, name: tm.name, shortName: tm.abbr === "POR" ? "Trail Blazers" : tm.name.split(" ").slice(-1)[0] || tm.name, abbreviation: tm.abbr, conference: EAST_TEAM_ABBRS2.has(tm.abbr) ? "Este" : "Oeste", wins: 0, losses: 0, winPct: 0, playoffSeed: 0, gamesBehind: "-", streakCode: "-", homeRecord: "0-0", roadRecord: "0-0", lastTenRecord: "0-0", avgPointsFor: 0, avgPointsAgainst: 0, differential: 0, games: [] }])), "createEmptyTeamsMap");
      if (seasonCode === "2025-26") {
        const fallback26 = snap?.s2026 ? hydrateSeasonDatasetFromSnapshot(snap.s2026) : { seasonCode: "2025-26", dataSource: "espn_fallback", teamsByAbbr: createEmptyTeamsMap(), playersById: /* @__PURE__ */ new Map() };
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback26 });
        return fallback26;
      }
      if (seasonCode === "2024-25") {
        const fallback25 = snap?.s2025 ? hydrateSeasonDatasetFromSnapshot(snap.s2025) : { seasonCode: "2024-25", dataSource: "espn_fallback", teamsByAbbr: createEmptyTeamsMap(), playersById: /* @__PURE__ */ new Map() };
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback25 });
        return fallback25;
      }
      if (seasonCode === "2023-24") {
        const fallback24 = snap?.s2024 ? hydrateSeasonDatasetFromSnapshot(snap.s2024) : { seasonCode: "2023-24", dataSource: "espn_fallback", teamsByAbbr: createEmptyTeamsMap(), playersById: /* @__PURE__ */ new Map() };
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback24 });
        return fallback24;
      }
      const hydrated27 = snap?.s2027 ? hydrateSeasonDatasetFromSnapshot(snap.s2027) : { seasonCode: "2026-27", dataSource: "nba_official_hybrid", teamsByAbbr: createEmptyTeamsMap(), playersById: /* @__PURE__ */ new Map() };
      await applyCdnDeltaGamesTo2027(hydrated27, biosMap, { maxGamesToFetch: options?.cdnMaxGames ?? 32, timeoutBudgetMs: options?.cdnTimeoutMs ?? 3800, forceRefresh });
      seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: hydrated27 });
      return hydrated27;
    }
    const encSeason = encodeURIComponent(seasonCode);
    const [teamLogsRes, playerLogsRes, standingsRes, teamAdvRes, teamMiscRes, teamHustleRes, playerAdvRes, playerMiscRes, playerHustleRes] = await Promise.allSettled([cachedFetchJson(`https://stats.nba.com/stats/leaguegamelog?Counter=0&DateFrom=&DateTo=&Direction=DESC&LeagueID=00&PlayerOrTeam=T&Season=${encSeason}&SeasonType=Regular%20Season&Sorter=DATE`, ttlMs, NBA_STATS_HEADERS, 14e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguegamelog?Counter=0&DateFrom=&DateTo=&Direction=DESC&LeagueID=00&PlayerOrTeam=P&Season=${encSeason}&SeasonType=Regular%20Season&Sorter=DATE`, ttlMs, NBA_STATS_HEADERS, 16e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguestandingsv3?GroupBy=conf&LeagueID=00&Season=${encSeason}&SeasonType=Regular%20Season&Section=overall`, ttlMs, NBA_STATS_HEADERS, 11e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguedashteamstats?Conference=&DateFrom=&DateTo=&Division=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0&VsConference=&VsDivision=`, ttlMs, NBA_STATS_HEADERS, 11e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguedashteamstats?Conference=&DateFrom=&DateTo=&Division=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Misc&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0&VsConference=&VsDivision=`, ttlMs, NBA_STATS_HEADERS, 11e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguehustlestatsteam?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&TeamID=0&VsConference=&VsDivision=&Weight=`, ttlMs, NBA_STATS_HEADERS, 11e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguedashplayerstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=`, ttlMs, NBA_STATS_HEADERS, 12e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguedashplayerstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Misc&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=`, ttlMs, NBA_STATS_HEADERS, 12e3, forceRefresh), cachedFetchJson(`https://stats.nba.com/stats/leaguehustlestatsplayer?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&Height=&ISTRound=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${encSeason}&SeasonType=Regular%20Season&TeamID=0&VsConference=&VsDivision=&Weight=`, ttlMs, NBA_STATS_HEADERS, 12e3, forceRefresh)]);
    const rawTeamLogs = teamLogsRes.status === "fulfilled" ? parseNbaResultSet(teamLogsRes.value) : [];
    const rawPlayerLogs = playerLogsRes.status === "fulfilled" ? parseNbaResultSet(playerLogsRes.value) : [];
    const rawStandings = standingsRes.status === "fulfilled" ? parseNbaResultSet(standingsRes.value) : [];
    const rawTeamAdv = teamAdvRes.status === "fulfilled" ? parseNbaResultSet(teamAdvRes.value) : [];
    const rawTeamMisc = teamMiscRes.status === "fulfilled" ? parseNbaResultSet(teamMiscRes.value) : [];
    const rawTeamHustle = teamHustleRes.status === "fulfilled" ? parseNbaResultSet(teamHustleRes.value) : [];
    const rawPlayerAdv = playerAdvRes.status === "fulfilled" ? parseNbaResultSet(playerAdvRes.value) : [];
    const rawPlayerMisc = playerMiscRes.status === "fulfilled" ? parseNbaResultSet(playerMiscRes.value) : [];
    const rawPlayerHustle = playerHustleRes.status === "fulfilled" ? parseNbaResultSet(playerHustleRes.value) : [];
    const teamsByAbbr = /* @__PURE__ */ new Map();
    const teamIdToAbbr = /* @__PURE__ */ new Map();
    for (const [abbr, meta] of Object.entries(NBA_TEAMS_MAP)) {
      teamIdToAbbr.set(meta.id, abbr);
      teamsByAbbr.set(abbr, { id: meta.id, name: meta.name, shortName: getShortTeamName2(abbr, meta.name), abbreviation: abbr, conference: EAST_TEAM_ABBRS2.has(abbr) ? "Este" : "Oeste", wins: 0, losses: 0, winPct: 0, playoffSeed: 8, gamesBehind: "0.0", streakCode: "\u2014", homeRecord: "0-0", roadRecord: "0-0", lastTenRecord: "0-0", avgPointsFor: 0, avgPointsAgainst: 0, differential: 0, games: [] });
    }
    const byGameId = /* @__PURE__ */ new Map();
    for (const r of rawTeamLogs) {
      const gid = String(r.GAME_ID || "").trim();
      if (!gid) continue;
      const list = byGameId.get(gid) || [];
      list.push(r);
      byGameId.set(gid, list);
    }
    const teamGameContextMap = /* @__PURE__ */ new Map();
    for (const [gid, pair] of byGameId.entries()) {
      for (const row of pair) {
        const abbr = String(row.TEAM_ABBREVIATION || "").trim().toUpperCase();
        const teamSummary = teamsByAbbr.get(abbr);
        if (!teamSummary) continue;
        const oppRow = pair.find((x) => String(x.TEAM_ABBREVIATION || "").trim().toUpperCase() !== abbr);
        const parsedMatchup = parseMatchupField(String(row.MATCHUP || ""), abbr);
        const oppAbbr = oppRow ? String(oppRow.TEAM_ABBREVIATION || "").trim().toUpperCase() : parsedMatchup.opponentAbbr;
        const oppName = NBA_TEAMS_MAP[oppAbbr]?.name || String(oppRow?.TEAM_NAME || oppAbbr);
        const ptsFor = Number(row.PTS) || 0;
        const pm = Number(row.PLUS_MINUS) || 0;
        const ptsAgainst = oppRow ? Number(oppRow.PTS) || 0 : Math.max(0, ptsFor - pm);
        const fgm = Number(row.FGM) || 0;
        const fga = Number(row.FGA) || 0;
        const fg3m = Number(row.FG3M) || 0;
        const fg3a = Number(row.FG3A) || 0;
        const ftm = Number(row.FTM) || 0;
        const fta = Number(row.FTA) || 0;
        const oreb = Number(row.OREB) || 0;
        const dreb = Number(row.DREB) || 0;
        const reb = Number(row.REB) || oreb + dreb;
        const ast = Number(row.AST) || 0;
        const stl = Number(row.STL) || 0;
        const blk = Number(row.BLK) || 0;
        const tov = Number(row.TOV) || 0;
        const rawMin = Number(row.MIN) || 240;
        const gameMins = Math.max(48, rawMin / 5);
        const oppFgm = Number(oppRow?.FGM) || fgm;
        const oppFga = Number(oppRow?.FGA) || fga;
        const oppFta = Number(oppRow?.FTA) || fta;
        const oppOreb = Number(oppRow?.OREB) || oreb;
        const oppDreb = Number(oppRow?.DREB) || dreb;
        const oppTov = Number(oppRow?.TOV) || tov;
        const selfPoss = fga + 0.4 * fta - 1.07 * (oreb / Math.max(1, oreb + oppDreb)) * (fga - fgm) + tov;
        const oppPoss = oppFga + 0.4 * oppFta - 1.07 * (oppOreb / Math.max(1, oppOreb + dreb)) * (oppFga - oppFgm) + oppTov;
        const poss = Math.max(1, round14(0.5 * (selfPoss + oppPoss)));
        const pace = round14(poss / gameMins * 48);
        const offRtg = round14(ptsFor / poss * 100);
        const defRtg = round14(ptsAgainst / poss * 100);
        const netRtg = round14(offRtg - defRtg);
        const fgPct = fga > 0 ? round14(fgm / fga * 100) : 0;
        const fg3Pct = fg3a > 0 ? round14(fg3m / fg3a * 100) : 0;
        const ftPct = fta > 0 ? round14(ftm / fta * 100) : 0;
        const efgPct = fga > 0 ? round14((fgm + 0.5 * fg3m) / fga * 100) : 0;
        const tsDenom = 2 * (fga + 0.44 * fta);
        const tsPct = tsDenom > 0 ? round14(ptsFor / tsDenom * 100) : 0;
        const orebPct = oreb + oppDreb > 0 ? round14(oreb / (oreb + oppDreb) * 100) : 0;
        const tovDenom = fga + 0.44 * fta + tov;
        const tovPct = tovDenom > 0 ? round14(tov / tovDenom * 100) : 0;
        const result = String(row.WL || "").toUpperCase() === "W" || ptsFor > ptsAgainst ? "W" : "L";
        const dateStr = String(row.GAME_DATE || "").slice(0, 10);
        const tLog = { eventId: gid, date: dateStr, seasonLabel: seasonCode, opponentAbbr: oppAbbr, opponentName: oppName, isHome: parsedMatchup.isHome, result, pointsFor: ptsFor, pointsAgainst: ptsAgainst, differential: ptsFor - ptsAgainst, totalPoints: ptsFor + ptsAgainst, restDays: null, isBackToBack: false, fgm, fga, fgPct, fg3m, fg3a, fg3Pct, ftm, fta, ftPct, oreb, dreb, reb, ast, stl, blk, tov, poss, offRtg, defRtg, netRtg, pace, efgPct, tsPct, orebPct, tovPct };
        teamSummary.games.push(tLog);
      }
    }
    for (const tm of teamsByAbbr.values()) {
      tm.games.sort((a, b) => b.date.localeCompare(a.date));
      for (let i = 0; i < tm.games.length; i++) {
        const cur = tm.games[i];
        const prev = tm.games[i + 1];
        if (prev) {
          const rd = diffDaysIso2(prev.date, cur.date);
          cur.restDays = rd;
          cur.isBackToBack = rd === 0;
        }
        const awayPts = cur.isHome ? cur.pointsAgainst : cur.pointsFor;
        const homePts = cur.isHome ? cur.pointsFor : cur.pointsAgainst;
        teamGameContextMap.set(`${cur.eventId}:${tm.abbreviation}`, { scoreDisplay: `${awayPts}-${homePts}`, opponentName: cur.opponentName, opponentAbbr: cur.opponentAbbr, isHome: cur.isHome, result: cur.result, poss: cur.poss, tmPlays: cur.fga + 0.44 * cur.fta + cur.tov, gameMins: Math.max(48, cur.poss / Math.max(70, cur.pace) * 48), restDays: cur.restDays, isBackToBack: cur.isBackToBack });
      }
      if (tm.games.length > 0) {
        const w = tm.games.filter((g) => g.result === "W").length;
        const l = tm.games.length - w;
        tm.wins = w;
        tm.losses = l;
        tm.winPct = round22(w / tm.games.length);
        tm.avgPointsFor = round14(meanNums3(tm.games.map((g) => g.pointsFor)));
        tm.avgPointsAgainst = round14(meanNums3(tm.games.map((g) => g.pointsAgainst)));
        tm.differential = round14(tm.avgPointsFor - tm.avgPointsAgainst);
        const homeG = tm.games.filter((g) => g.isHome);
        const roadG = tm.games.filter((g) => !g.isHome);
        const l10G = tm.games.slice(0, 10);
        tm.homeRecord = `${homeG.filter((g) => g.result === "W").length}-${homeG.filter((g) => g.result === "L").length}`;
        tm.roadRecord = `${roadG.filter((g) => g.result === "W").length}-${roadG.filter((g) => g.result === "L").length}`;
        tm.lastTenRecord = `${l10G.filter((g) => g.result === "W").length}-${l10G.filter((g) => g.result === "L").length}`;
        const firstRes = tm.games[0].result;
        let sc = 0;
        for (const g of tm.games) {
          if (g.result === firstRes) sc++;
          else break;
        }
        tm.streakCode = `${firstRes}${sc}`;
      }
    }
    for (const s of rawStandings) {
      const tid = String(s.TeamID || "").trim();
      const abbr = teamIdToAbbr.get(tid);
      if (!abbr) continue;
      const tm = teamsByAbbr.get(abbr);
      if (!tm) continue;
      tm.wins = Number(s.WINS ?? tm.wins);
      tm.losses = Number(s.LOSSES ?? tm.losses);
      tm.winPct = Number(s.WinPCT ?? tm.winPct);
      tm.playoffSeed = Number(s.PlayoffRank || s.LeagueRank || tm.playoffSeed);
      tm.gamesBehind = String(s.ConferenceGamesBack ?? "0.0");
      if (s.strCurrentStreak) {
        tm.streakCode = String(s.strCurrentStreak).replace(/\s+/g, "");
      }
      if (s.HOME) tm.homeRecord = String(s.HOME).trim();
      if (s.ROAD) tm.roadRecord = String(s.ROAD).trim();
      if (s.L10) tm.lastTenRecord = String(s.L10).trim();
      if (s.PointsPG) tm.avgPointsFor = round14(Number(s.PointsPG));
      if (s.OppPointsPG) tm.avgPointsAgainst = round14(Number(s.OppPointsPG));
      if (s.DiffPointsPG !== void 0 && s.DiffPointsPG !== null) {
        tm.differential = round14(Number(s.DiffPointsPG));
      }
    }
    for (const conf of ["Este", "Oeste"]) {
      const peers = [...teamsByAbbr.values()].filter((t) => t.conference === conf).sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
      peers.forEach((t, idx) => {
        if (!rawStandings.length || !t.playoffSeed) {
          t.playoffSeed = idx + 1;
        }
      });
    }
    const teamMiscById = /* @__PURE__ */ new Map();
    for (const r of rawTeamMisc) teamMiscById.set(String(r.TEAM_ID), r);
    const teamHustleById = /* @__PURE__ */ new Map();
    for (const r of rawTeamHustle) teamHustleById.set(String(r.TEAM_ID), r);
    for (const r of rawTeamAdv) {
      const tid = String(r.TEAM_ID || "").trim();
      const abbr = teamIdToAbbr.get(tid);
      if (!abbr) continue;
      const tm = teamsByAbbr.get(abbr);
      if (!tm) continue;
      const misc = teamMiscById.get(tid) || {};
      const hus = teamHustleById.get(tid) || {};
      const adv = { gp: Number(r.GP) || tm.games.length, offRtg: round14(Number(r.OFF_RATING) || 0), defRtg: round14(Number(r.DEF_RATING) || 0), netRtg: round14(Number(r.NET_RATING) || 0), pace: round14(Number(r.PACE) || 99.5), pie: toPct100(r.PIE), efgPct: toPct100(r.EFG_PCT), tsPct: toPct100(r.TS_PCT), astPct: toPct100(r.AST_PCT), astTo: round22(Number(r.AST_TO) || 0), astRatio: round14(Number(r.AST_RATIO) || 0), orebPct: toPct100(r.OREB_PCT), drebPct: toPct100(r.DREB_PCT), rebPct: toPct100(r.REB_PCT), tovPct: toPct100(r.TM_TOV_PCT), ptsPaint: round14(Number(misc.PTS_PAINT) || 0), oppPtsPaint: round14(Number(misc.OPP_PTS_PAINT) || 0), pts2ndChance: round14(Number(misc.PTS_2ND_CHANCE) || 0), oppPts2ndChance: round14(Number(misc.OPP_PTS_2ND_CHANCE) || 0), ptsFastBreak: round14(Number(misc.PTS_FB) || 0), ptsOffTov: round14(Number(misc.PTS_OFF_TOV) || 0), contestedShots: round14(Number(hus.CONTESTED_SHOTS) || 0), deflections: round14(Number(hus.DEFLECTIONS) || 0), screenAssists: round14(Number(hus.SCREEN_ASSISTS) || 0), looseBalls: round14(Number(hus.LOOSE_BALLS_RECOVERED) || 0), boxOuts: round14(Number(hus.BOX_OUTS) || 0) };
      tm.advanced = adv;
    }
    const playerAdvById = /* @__PURE__ */ new Map();
    for (const r of rawPlayerAdv) playerAdvById.set(String(r.PLAYER_ID), r);
    const playerMiscById = /* @__PURE__ */ new Map();
    for (const r of rawPlayerMisc) playerMiscById.set(String(r.PLAYER_ID), r);
    const playerHustleById = /* @__PURE__ */ new Map();
    for (const r of rawPlayerHustle) playerHustleById.set(String(r.PLAYER_ID), r);
    const playersById = /* @__PURE__ */ new Map();
    for (const row of rawPlayerLogs) {
      const pid = String(row.PLAYER_ID || "").trim();
      if (!pid) continue;
      const gid = String(row.GAME_ID || "").trim();
      const tAbbr = String(row.TEAM_ABBREVIATION || "").trim().toUpperCase();
      const tMeta = NBA_TEAMS_MAP[tAbbr];
      const bio = biosMap.get(pid);
      let pSummary = playersById.get(pid);
      if (!pSummary) {
        const activeTeamAbbr = seasonCode === "2025-26" ? tAbbr || bio?.teamAbbr || "NBA" : bio?.teamAbbr && NBA_TEAMS_MAP[bio.teamAbbr] ? bio.teamAbbr : tAbbr || "NBA";
        const activeTeamMeta = NBA_TEAMS_MAP[activeTeamAbbr] || tMeta;
        pSummary = { id: pid, name: String(row.PLAYER_NAME || bio?.name || pid).trim(), teamId: activeTeamMeta?.id || String(row.TEAM_ID || bio?.teamId || ""), teamAbbr: activeTeamAbbr, teamName: activeTeamMeta?.name || String(row.TEAM_NAME || activeTeamAbbr), position: bio?.position || "G-F", jersey: bio?.jersey || void 0, height: bio?.height || void 0, country: bio?.country || void 0, ...bio?.birthYear ? { birthYear: bio.birthYear } : {}, games: [] };
        playersById.set(pid, pSummary);
      }
      const ctx = teamGameContextMap.get(`${gid}:${tAbbr}`);
      const parsedMatch = parseMatchupField(String(row.MATCHUP || ""), tAbbr);
      const oppAbbr = ctx?.opponentAbbr || parsedMatch.opponentAbbr;
      const oppName = ctx?.opponentName || NBA_TEAMS_MAP[oppAbbr]?.name || oppAbbr;
      const isHome = ctx ? ctx.isHome : parsedMatch.isHome;
      const result = ctx?.result || (String(row.WL || "").toUpperCase() === "W" ? "W" : "L");
      const minutes = round14(Number(row.MIN) || 0);
      const pts = Number(row.PTS) || 0;
      const reb = Number(row.REB) || 0;
      const oreb = Number(row.OREB) || 0;
      const dreb = Number(row.DREB) || 0;
      const ast = Number(row.AST) || 0;
      const stl = Number(row.STL) || 0;
      const blk = Number(row.BLK) || 0;
      const tov = Number(row.TOV) || 0;
      const pf = Number(row.PF) || 0;
      const pm = Number(row.PLUS_MINUS) || 0;
      const fgm = Number(row.FGM) || 0;
      const fga = Number(row.FGA) || 0;
      const fg3m = Number(row.FG3M) || 0;
      const fg3a = Number(row.FG3A) || 0;
      const ftm = Number(row.FTM) || 0;
      const fta = Number(row.FTA) || 0;
      const fgPct = fga > 0 ? round14(fgm / fga * 100) : 0;
      const fg3Pct = fg3a > 0 ? round14(fg3m / fg3a * 100) : 0;
      const ftPct = fta > 0 ? round14(ftm / fta * 100) : 0;
      const efgPct = fga > 0 ? round14((fgm + 0.5 * fg3m) / fga * 100) : 0;
      const tsDenom = 2 * (fga + 0.44 * fta);
      const tsPct = tsDenom > 0 ? round14(pts / tsDenom * 100) : 0;
      const teamPoss = ctx?.poss || 99;
      const tmPlays = ctx?.tmPlays && ctx.tmPlays > 0 ? ctx.tmPlays : teamPoss * 1.135;
      const gameMins = Math.max(ctx?.gameMins || 48, minutes);
      const plPoss = fga + 0.44 * fta + tov;
      const usgEst = minutes > 0 && tmPlays > 0 ? round14(Math.min(55, Math.max(0, plPoss / (tmPlays * (minutes / gameMins)) * 100))) : 0;
      const gmSc = computeHollingerGameScore2({ pts, fgm, fga, ftm, fta, oreb, dreb, stl, ast, blk, pf, tov });
      const gLog = { eventId: gid, date: String(row.GAME_DATE || "").slice(0, 10), seasonLabel: seasonCode, teamAbbr: tAbbr || pSummary.teamAbbr, teamId: tMeta?.id || String(row.TEAM_ID || pSummary.teamId || ""), opponentAbbr: oppAbbr, opponentName: oppName, isHome, result, scoreDisplay: ctx?.scoreDisplay || "", restDays: ctx?.restDays ?? null, isBackToBack: ctx?.isBackToBack ?? false, minutes, points: pts, rebounds: reb, oreb, dreb, assists: ast, steals: stl, blocks: blk, stocks: stl + blk, turnovers: tov, fouls: pf, plusMinus: pm, fgm, fga, fgPct, fg3m, fg3a, fg3Pct, ftm, fta, ftPct, pra: pts + reb + ast, tsPct, efgPct, usgEst, gameScore: gmSc };
      pSummary.games.push(gLog);
    }
    for (const [pid, p] of playersById.entries()) {
      p.games.sort((a, b) => b.date.localeCompare(a.date));
      const latestLogTeam = p.games[0]?.teamAbbr;
      if (latestLogTeam && NBA_TEAMS_MAP[latestLogTeam] && (seasonCode === "2025-26" || !NBA_TEAMS_MAP[p.teamAbbr])) {
        const meta = NBA_TEAMS_MAP[latestLogTeam];
        p.teamAbbr = latestLogTeam;
        p.teamId = meta.id;
        p.teamName = meta.name;
      }
      for (let i = 0; i < p.games.length; i++) {
        const cur = p.games[i];
        const prev = p.games[i + 1];
        if (prev) {
          const rd = diffDaysIso2(prev.date, cur.date);
          cur.restDays = rd;
          cur.isBackToBack = rd === 0;
        }
      }
      const advR = playerAdvById.get(pid);
      if (advR) {
        const miscR = playerMiscById.get(pid) || {};
        const husR = playerHustleById.get(pid) || {};
        const pAdv = { gp: Number(advR.GP) || p.games.length, usgPct: toPct100(advR.USG_PCT), tsPct: toPct100(advR.TS_PCT), efgPct: toPct100(advR.EFG_PCT), offRtg: round14(Number(advR.OFF_RATING) || 0), defRtg: round14(Number(advR.DEF_RATING) || 0), netRtg: round14(Number(advR.NET_RATING) || 0), pie: toPct100(advR.PIE), pace: round14(Number(advR.PACE) || 99.5), astPct: toPct100(advR.AST_PCT), astTo: round22(Number(advR.AST_TO) || 0), astRatio: round14(Number(advR.AST_RATIO) || 0), orebPct: toPct100(advR.OREB_PCT), drebPct: toPct100(advR.DREB_PCT), rebPct: toPct100(advR.REB_PCT), tovPct: toPct100(advR.TM_TOV_PCT ?? advR.E_TOV_PCT), ptsPaint: round14(Number(miscR.PTS_PAINT) || 0), pts2ndChance: round14(Number(miscR.PTS_2ND_CHANCE) || 0), ptsFastBreak: round14(Number(miscR.PTS_FB) || 0), ptsOffTov: round14(Number(miscR.PTS_OFF_TOV) || 0), foulsDrawn: round14(Number(miscR.PFD) || 0), contestedShots: round14(Number(husR.CONTESTED_SHOTS) || 0), deflections: round14(Number(husR.DEFLECTIONS) || 0), screenAssists: round14(Number(husR.SCREEN_ASSISTS) || 0), looseBalls: round14(Number(husR.LOOSE_BALLS_RECOVERED) || 0), boxOuts: round14(Number(husR.BOX_OUTS) || 0) };
        p.advanced = pAdv;
      }
    }
    if (rawTeamLogs.length === 0 || rawPlayerLogs.length === 0) {
      if (seasonCode === "2024-25" && snap?.s2025) {
        const fallback25 = hydrateSeasonDatasetFromSnapshot(snap.s2025);
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback25 });
        return fallback25;
      }
      if (seasonCode === "2023-24" && snap?.s2024) {
        const fallback24 = hydrateSeasonDatasetFromSnapshot(snap.s2024);
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback24 });
        return fallback24;
      }
      if (seasonCode === "2025-26" && snap?.s2026) {
        const fallback26 = hydrateSeasonDatasetFromSnapshot(snap.s2026);
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: fallback26 });
        return fallback26;
      }
      if (seasonCode === "2026-27") {
        const base27 = snap?.s2027 ? hydrateSeasonDatasetFromSnapshot(snap.s2027) : { seasonCode: "2026-27", dataSource: "nba_official_hybrid", teamsByAbbr, playersById };
        await applyCdnDeltaGamesTo2027(base27, biosMap, { maxGamesToFetch: options?.cdnMaxGames ?? 60, timeoutBudgetMs: options?.cdnTimeoutMs ?? 8e3, forceRefresh: true });
        seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: base27 });
        return base27;
      }
    }
    const built = { seasonCode, dataSource: rawTeamLogs.length > 0 ? "nba_official_hybrid" : "espn_fallback", teamsByAbbr, playersById };
    if (seasonCode === "2026-27") {
      await applyCdnDeltaGamesTo2027(built, biosMap, { maxGamesToFetch: options?.cdnMaxGames ?? 16, timeoutBudgetMs: options?.cdnTimeoutMs ?? 4500, forceRefresh });
    }
    seasonDatasetCache.set(seasonCode, { expiresAt: Date.now() + ttlMs, data: built });
    return built;
  })();
  seasonDatasetInflight.set(seasonCode, promise);
  try {
    return await promise;
  } finally {
    seasonDatasetInflight.delete(seasonCode);
  }
}
async function getFullLeagueMemory(forceRefresh = false) {
  const [s2027, s2026] = await Promise.all([buildSingleSeasonDataset("2026-27", forceRefresh), buildSingleSeasonDataset("2025-26", false)]);
  const teams = [];
  for (const abbr of Object.keys(NBA_TEAMS_MAP)) {
    const t27 = s2027.teamsByAbbr.get(abbr);
    const t26 = s2026.teamsByAbbr.get(abbr);
    if (!t27 && !t26) continue;
    const base = t27 && t27.games.length > 0 ? t27 : t26 || t27;
    const combinedGames = [...t27?.games || [], ...t26?.games || []].sort((a, b) => b.date.localeCompare(a.date));
    teams.push({ ...base, advanced: t27?.advanced || t26?.advanced, games: combinedGames });
  }
  teams.sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
  const allPids = /* @__PURE__ */ new Set([...s2027.playersById.keys(), ...s2026.playersById.keys()]);
  const allPlayers = [];
  for (const pid of allPids) {
    const p27 = s2027.playersById.get(pid);
    const p26 = s2026.playersById.get(pid);
    const primary = p27 || p26;
    const mergedGames = [...p27?.games || [], ...p26?.games || []].sort((a, b) => b.date.localeCompare(a.date));
    if (mergedGames.length === 0) continue;
    allPlayers.push({ ...primary, jersey: p27?.jersey || p26?.jersey, height: p27?.height || p26?.height, country: p27?.country || p26?.country, birthYear: p27?.birthYear ?? p26?.birthYear, advanced: p27?.advanced || p26?.advanced, games: mergedGames });
  }
  allPlayers.sort((a, b) => {
    const aRecent = meanNums3(a.games.slice(0, 10).map((g) => g.points));
    const bRecent = meanNums3(b.games.slice(0, 10).map((g) => g.points));
    return bRecent - aRecent || a.id.localeCompare(b.id);
  });
  return { teams, allPlayers, s2027, s2026 };
}
async function fetchLiveScoreboardGames(dateIso, forceRefresh = false) {
  try {
    const qs = dateIso ? `?dates=${dateIso.replace(/-/g, "")}` : "";
    const raw = await cachedFetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard${qs}`, 2 * 60 * 1e3, {}, isSnapshotOnlyRuntime() ? 3500 : 7e3, forceRefresh);
    const events = Array.isArray(raw?.events) ? raw.events : [];
    const list = [];
    for (const ev of events) {
      const comp = ev?.competitions?.[0];
      const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
      const awayC = competitors.find((c) => c?.homeAway === "away");
      const homeC = competitors.find((c) => c?.homeAway === "home");
      if (!awayC || !homeC) continue;
      const awayAbbr = normalizeEspnAbbr(awayC?.team?.abbreviation || "");
      const homeAbbr = normalizeEspnAbbr(homeC?.team?.abbreviation || "");
      const stateStr = String(ev?.status?.type?.state || "").toLowerCase();
      list.push({ id: String(ev?.id || ""), date: String(ev?.date || "").slice(0, 10), statusText: String(ev?.status?.type?.shortDetail || ev?.status?.type?.detail || "Programado"), isLive: stateStr === "in", isCompleted: stateStr === "post", awayAbbr, awayName: NBA_TEAMS_MAP[awayAbbr]?.name || String(awayC?.team?.displayName || awayAbbr), awayScore: Number(awayC?.score) || 0, homeAbbr, homeName: NBA_TEAMS_MAP[homeAbbr]?.name || String(homeC?.team?.displayName || homeAbbr), homeScore: Number(homeC?.score) || 0 });
    }
    return list;
  } catch {
    return [];
  }
}
async function getScoreboardDeltaPayload(clientSinceHash, forceRefresh = false) {
  const games = await fetchLiveScoreboardGames(void 0, forceRefresh);
  const scoreFingerprint = games.map((g) => `${g.id}:${g.statusText}:${g.isLive ? 1 : 0}:${g.isCompleted ? 1 : 0}:${g.awayScore}:${g.homeScore}`).join("|");
  const serverHash = crypto.createHash("md5").update(scoreFingerprint || "empty").digest("hex").slice(0, 16);
  const liveCount = games.filter((g) => g.isLive).length;
  if (clientSinceHash && clientSinceHash === serverHash) {
    return {
      unmodified: true,
      hash: serverHash,
      liveCount,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      gamesCount: games.length
    };
  }
  let changedGames = void 0;
  if (clientSinceHash && clientSinceHash !== serverHash) {
    changedGames = games.filter((g) => g.isLive || g.isCompleted);
  }
  return {
    unmodified: false,
    hash: serverHash,
    liveCount,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    games,
    changedGames
  };
}
async function getBootstrapPayload(seasonMode = "continuous", forceRefresh = false) {
  if (seasonMode === "2027") {
    const [s2027, biosMap2, scoreboard2] = await Promise.all([buildSingleSeasonDataset("2026-27", forceRefresh), getPlayerBiosMap(false), fetchLiveScoreboardGames(void 0, forceRefresh)]);
    const teams = [...s2027.teamsByAbbr.values()].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
    const players = [...s2027.playersById.values()].sort((a, b) => meanNums3(b.games.map((g) => g.points)) - meanNums3(a.games.map((g) => g.points)));
    return { seasonMode, dataSource: s2027.dataSource, totalLeaguePlayersAvailable: Math.max(biosMap2.size, players.length), allPlayersLoaded: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), teams, players, scoreboard: scoreboard2 };
  }
  if (seasonMode === "2026") {
    const [s2026, biosMap2, scoreboard2] = await Promise.all([buildSingleSeasonDataset("2025-26", false), getPlayerBiosMap(false), fetchLiveScoreboardGames(void 0, false)]);
    const teams = [...s2026.teamsByAbbr.values()].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
    const players = [...s2026.playersById.values()].sort((a, b) => meanNums3(b.games.map((g) => g.points)) - meanNums3(a.games.map((g) => g.points)));
    return { seasonMode, dataSource: s2026.dataSource, totalLeaguePlayersAvailable: Math.max(biosMap2.size, players.length), allPlayersLoaded: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), teams, players, scoreboard: scoreboard2 };
  }
  if (seasonMode === "2025") {
    const [s2025, biosMap2, scoreboard2] = await Promise.all([buildSingleSeasonDataset("2024-25", false), getPlayerBiosMap(false), fetchLiveScoreboardGames(void 0, false)]);
    const teams = [...s2025.teamsByAbbr.values()].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
    const players = [...s2025.playersById.values()].sort((a, b) => meanNums3(b.games.map((g) => g.points)) - meanNums3(a.games.map((g) => g.points)));
    return { seasonMode, dataSource: s2025.dataSource, totalLeaguePlayersAvailable: Math.max(biosMap2.size, players.length), allPlayersLoaded: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), teams, players, scoreboard: scoreboard2 };
  }
  if (seasonMode === "2024") {
    const [s2024, biosMap2, scoreboard2] = await Promise.all([buildSingleSeasonDataset("2023-24", false), getPlayerBiosMap(false), fetchLiveScoreboardGames(void 0, false)]);
    const teams = [...s2024.teamsByAbbr.values()].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.differential - a.differential);
    const players = [...s2024.playersById.values()].sort((a, b) => meanNums3(b.games.map((g) => g.points)) - meanNums3(a.games.map((g) => g.points)));
    return { seasonMode, dataSource: s2024.dataSource, totalLeaguePlayersAvailable: Math.max(biosMap2.size, players.length), allPlayersLoaded: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), teams, players, scoreboard: scoreboard2 };
  }
  const [full, biosMap, scoreboard] = await Promise.all([getFullLeagueMemory(forceRefresh), getPlayerBiosMap(false), fetchLiveScoreboardGames(void 0, forceRefresh)]);
  return { seasonMode, dataSource: full.s2027.dataSource, totalLeaguePlayersAvailable: Math.max(biosMap.size, full.allPlayers.length), allPlayersLoaded: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), teams: full.teams, players: full.allPlayers, scoreboard };
}
var bootstrapWireBuffersCache = /* @__PURE__ */ new Map();
var bootstrapWireInflight = /* @__PURE__ */ new Map();
async function getBootstrapWireBuffers(seasonMode = "continuous", forceRefresh = false) {
  if (forceRefresh) {
    bootstrapWireBuffersCache.delete("2027");
    bootstrapWireBuffersCache.delete("continuous");
    if (seasonMode === "2026") {
      bootstrapWireBuffersCache.delete("2026");
    }
    if (seasonMode === "2025") {
      bootstrapWireBuffersCache.delete("2025");
    }
    if (seasonMode === "2024") {
      bootstrapWireBuffersCache.delete("2024");
    }
  } else {
    const hit = bootstrapWireBuffersCache.get(seasonMode);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.data;
    }
    const inflight = bootstrapWireInflight.get(seasonMode);
    if (inflight) {
      return inflight;
    }
  }
  const ttlMs = seasonMode === "2026" || seasonMode === "2025" || seasonMode === "2024" ? 10 * 60 * 1e3 : 90 * 1e3;
  const promise = (async () => {
    const rawPayload = await getBootstrapPayload(seasonMode, forceRefresh);
    const wirePayload = packBootstrapWirePayload(rawPayload);
    const jsonBuffer = Buffer.from(JSON.stringify(wirePayload), "utf8");
    const gzipBuffer = zlib2.gzipSync(jsonBuffer, { level: 6 });
    const entry = { wirePayload, jsonBuffer, gzipBuffer };
    bootstrapWireBuffersCache.set(seasonMode, { expiresAt: Date.now() + ttlMs, data: entry });
    return entry;
  })();
  bootstrapWireInflight.set(seasonMode, promise);
  try {
    return await promise;
  } finally {
    bootstrapWireInflight.delete(seasonMode);
  }
}
async function searchLeaguePlayers(query) {
  const norm = normalizeText(query);
  if (norm.length < 2) return [];
  const [biosMap, full] = await Promise.all([getPlayerBiosMap(false), getFullLeagueMemory(false)]);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const p of full.allPlayers) {
    if (normalizeText(`${p.name} ${p.teamAbbr} ${p.teamName}`).includes(norm)) {
      seen.add(p.id);
      out.push({ id: p.id, name: p.name, teamAbbr: p.teamAbbr, position: p.position });
      if (out.length >= 16) return out;
    }
  }
  for (const b of biosMap.values()) {
    if (seen.has(b.id)) continue;
    if (normalizeText(`${b.name} ${b.teamAbbr}`).includes(norm)) {
      seen.add(b.id);
      out.push({ id: b.id, name: b.name, teamAbbr: b.teamAbbr, position: b.position });
      if (out.length >= 20) break;
    }
  }
  return out;
}
async function getSinglePlayerSummary(playerId, seasonMode = "continuous") {
  const [full, biosMap] = await Promise.all([getFullLeagueMemory(false), getPlayerBiosMap(false)]);
  if (seasonMode === "2027") {
    const p = full.s2027.playersById.get(playerId);
    if (p) return p;
  } else if (seasonMode === "2026") {
    const p = full.s2026.playersById.get(playerId);
    if (p) return p;
  } else if (seasonMode === "2025") {
    const s2025 = await buildSingleSeasonDataset("2024-25", false);
    const p = s2025.playersById.get(playerId);
    if (p) return p;
  } else if (seasonMode === "2024") {
    const s2024 = await buildSingleSeasonDataset("2023-24", false);
    const p = s2024.playersById.get(playerId);
    if (p) return p;
  } else {
    const p = full.allPlayers.find((x) => x.id === playerId);
    if (p) return p;
  }
  const bio = biosMap.get(playerId);
  if (!bio) return null;
  const tMeta = NBA_TEAMS_MAP[bio.teamAbbr];
  return { id: bio.id, name: bio.name, teamId: bio.teamId || tMeta?.id || "", teamAbbr: bio.teamAbbr || "NBA", teamName: tMeta?.name || bio.teamAbbr || "NBA", position: bio.position || "G-F", jersey: bio.jersey || void 0, height: bio.height || void 0, country: bio.country || void 0, ...bio.birthYear ? { birthYear: bio.birthYear } : {}, games: [] };
}
var cachedInspectorBenchmarks = null;
async function getPlayerInspectorDossier(playerId) {
  const [full, biosMap] = await Promise.all([getFullLeagueMemory(false), getPlayerBiosMap(false)]);
  const pContinuous = full.allPlayers.find((x) => x.id === playerId);
  const p2027 = full.s2027.playersById.get(playerId);
  const p2026 = full.s2026.playersById.get(playerId);
  let player = pContinuous || null;
  if (!player) {
    const bio = biosMap.get(playerId);
    if (!bio) return null;
    const tMeta = NBA_TEAMS_MAP[bio.teamAbbr];
    player = { id: bio.id, name: bio.name, teamId: bio.teamId || tMeta?.id || "", teamAbbr: bio.teamAbbr || "NBA", teamName: tMeta?.name || bio.teamAbbr || "NBA", position: bio.position || "G-F", jersey: bio.jersey || void 0, height: bio.height || void 0, country: bio.country || void 0, ...bio.birthYear ? { birthYear: bio.birthYear } : {}, games: [] };
  }
  const now = Date.now();
  if (!cachedInspectorBenchmarks || cachedInspectorBenchmarks.expiresAt <= now) {
    let latestLeagueDate2027 = "";
    for (const t of full.s2027.teamsByAbbr.values()) {
      if (t.games[0]?.date && t.games[0].date > latestLeagueDate2027) {
        latestLeagueDate2027 = t.games[0].date;
      }
    }
    if (!latestLeagueDate2027) {
      latestLeagueDate2027 = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    }
    const cutoffCycle = seasonCycleDay(latestLeagueDate2027);
    const players2027 = [...full.s2027.playersById.values()];
    const players2026 = [...full.s2026.playersById.values()];
    cachedInspectorBenchmarks = { expiresAt: now + 5 * 60 * 1e3, latestLeagueDate2027, benchmarksByScope: { continuous: buildExtendedPlayerBenchmarks(full.allPlayers), s2027: buildExtendedPlayerBenchmarks(players2027), s2026: buildExtendedPlayerBenchmarks(players2026), sameDate2026: buildExtendedPlayerBenchmarks(players2026, (g) => seasonCycleDay(g.date) <= cutoffCycle) } };
  }
  return { player, advanced2027: p2027?.advanced, advanced2026: p2026?.advanced, latestLeagueDate2027: cachedInspectorBenchmarks.latestLeagueDate2027, benchmarksByScope: cachedInspectorBenchmarks.benchmarksByScope };
}
async function getTeamRoster(teamId) {
  const [biosMap, full] = await Promise.all([getPlayerBiosMap(false), getFullLeagueMemory(false)]);
  const targetTeam = full.teams.find((t) => t.id === teamId || t.abbreviation.toUpperCase() === teamId.toUpperCase());
  const targetAbbr = targetTeam?.abbreviation || "";
  const roster = [];
  const seen = /* @__PURE__ */ new Set();
  for (const b of biosMap.values()) {
    if (b.teamId === teamId || targetAbbr && b.teamAbbr === targetAbbr) {
      seen.add(b.id);
      roster.push({ id: b.id, name: b.name, position: b.position || "JUG", jersey: b.jersey || "0", height: b.height || void 0, country: b.country || void 0, ...b.birthYear ? { birthYear: b.birthYear } : {} });
    }
  }
  if (roster.length === 0 && targetAbbr) {
    for (const p of full.allPlayers) {
      if (p.teamAbbr === targetAbbr && !seen.has(p.id)) {
        seen.add(p.id);
        roster.push({ id: p.id, name: p.name, position: p.position || "JUG", jersey: p.jersey || "0", height: p.height, country: p.country, ...p.birthYear ? { birthYear: p.birthYear } : {} });
      }
    }
  }
  roster.sort((a, b) => {
    const na = parseInt(a.jersey, 10);
    const nb = parseInt(b.jersey, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return a.name.localeCompare(b.name);
  });
  return roster;
}
function buildIndividualMatchupKeys(params) {
  const { awaySide, homeSide, winner, loser, winnerLog, loserLog, winnerTeam, loserTeam, winnerPlayers, loserPlayers, roleShifts, streakShifts, usedFamilyCounts } = params;
  const margin = Math.abs(awaySide.score - homeSide.score);
  const totalPoints = awaySide.score + homeSide.score;
  const isRoadWin = awaySide.isWinner;
  const pace = homeSide.pace;
  const w2m = Math.max(0, winnerLog.fgm - winnerLog.fg3m);
  const w2a = Math.max(1, winnerLog.fga - winnerLog.fg3a);
  const w2Pct = w2m / w2a * 100;
  const l2m = Math.max(0, loserLog.fgm - loserLog.fg3m);
  const l2a = Math.max(1, loserLog.fga - loserLog.fg3a);
  const l2Pct = l2m / l2a * 100;
  const w2Diff = w2m - l2m;
  const pts2Diff = w2Diff * 2;
  const fg3mDiff = winnerLog.fg3m - loserLog.fg3m;
  const pts3Diff = fg3mDiff * 3;
  const w3Par = winnerLog.fg3a / Math.max(1, winnerLog.fga) * 100;
  const l3Par = loserLog.fg3a / Math.max(1, loserLog.fga) * 100;
  const ftmDiff = winnerLog.ftm - loserLog.ftm;
  const loserMissedFt = Math.max(0, loserLog.fta - loserLog.ftm);
  const winnerFtr = winnerLog.fta / Math.max(1, winnerLog.fga) * 100;
  const loserFtr = loserLog.fta / Math.max(1, loserLog.fga) * 100;
  const fgaDiff = winnerLog.fga - loserLog.fga;
  const orebDiff = winnerLog.oreb - loserLog.oreb;
  const rebDiff = winnerLog.reb - loserLog.reb;
  const tovDiff = loserLog.tov - winnerLog.tov;
  const astDiff = winnerLog.ast - loserLog.ast;
  const wAstPctOfFgm = winnerLog.ast / Math.max(1, winnerLog.fgm) * 100;
  const wAstTo = winnerLog.ast / Math.max(1, winnerLog.tov);
  const wStocks = winnerLog.stl + winnerLog.blk;
  const loserPtsVsSeason = loserTeam.avgPointsFor > 0 ? loser.score - loserTeam.avgPointsFor : 0;
  const wTop = winnerPlayers[0] || null;
  const lTop = loserPlayers[0] || null;
  const wDoubleDigits = winnerPlayers.filter((p) => p.points >= 10).length;
  const lDoubleDigits = loserPlayers.filter((p) => p.points >= 10).length;
  const candidates = [];
  if (winnerLog.efgPct + 0.8 < loserLog.efgPct) {
    const efgGap = loserLog.efgPct - winnerLog.efgPct;
    const extraShotsReason = fgaDiff >= 5 && ftmDiff >= 5 ? `lanzando ${fgaDiff} tiros de campo m\xE1s (${winnerLog.oreb} rebotes ofensivos y solo ${winnerLog.tov} p\xE9rdidas) y sumando +${ftmDiff} puntos en tiros libres` : fgaDiff >= 4 ? `fabricando ${fgaDiff} tiros a canasta m\xE1s (${winnerLog.fga} vs ${loserLog.fga} TC) gracias a ${winnerLog.oreb} rebotes ofensivos y ${tovDiff > 0 ? `${tovDiff} p\xE9rdidas menos` : `su empuje interior`}` : ftmDiff >= 4 ? `compens\xE1ndolo desde la l\xEDnea de personal con +${ftmDiff} tiros libres anotados (${winnerLog.ftm}/${winnerLog.fta} frente a ${loserLog.ftm}/${loserLog.fta})` : `exprimiendo m\xE1s posesiones \xFAtiles (${winnerLog.oreb} rebotes ofensivos y ${winnerLog.ftm} tiros libres convertidos)`;
    candidates.push({ family: "paradox_won_shooting_worse", axis: "paradox", score: 19 + efgGap * 1.55 + Math.max(0, fgaDiff) * 0.35 + Math.max(0, ftmDiff) * 0.3, simple: `**Triunfo pese a peor punter\xEDa:** Aunque ${winner.shortName} tir\xF3 peor que ${loser.shortName} (${winnerLog.efgPct.toFixed(1)}% vs ${loserLog.efgPct.toFixed(1)}% efectivo), volte\xF3 el duelo ${extraShotsReason}.`, advanced: `**Paradoja de volumen sobre acierto:** ${winner.abbr} sobrevivi\xF3 a un d\xE9ficit de -${efgGap.toFixed(1)} pp en eFG% (${winnerLog.efgPct.toFixed(1)}% vs ${loserLog.efgPct.toFixed(1)}%) imponiendo volumen (${winnerLog.fga} vs ${loserLog.fga} FGA \xB7 ${winnerLog.orebPct.toFixed(1)}% OREB \xB7 ${winnerLog.tovPct.toFixed(1)}% TOV \xB7 +${Math.max(0, ftmDiff)} FTM).` });
  }
  const winnerMissedFt = Math.max(0, winnerLog.fta - winnerLog.ftm);
  if (margin <= 7 && loserMissedFt >= 6 && loserLog.ftPct <= 73.5 && loserMissedFt >= margin && loserMissedFt - winnerMissedFt >= 4 && winnerLog.ftPct - loserLog.ftPct >= 8) {
    candidates.push({ family: "clutch_ft_bleeding", axis: "free_throws", score: 16.4 + (loserMissedFt - margin) * 1.1 + Math.max(0, 75 - loserLog.ftPct) * 0.22, simple: `**Sangr\xEDa en los tiros libres:** En un cierre por solo ${margin} puntos, ${loser.shortName} perdon\xF3 ${loserMissedFt} tiros libres (${loserLog.ftm}/${loserLog.fta}, ${loserLog.ftPct.toFixed(0)}%) frente al ${winnerLog.ftm}/${winnerLog.fta} (${winnerLog.ftPct.toFixed(0)}%) de ${winner.shortName}.`, advanced: `**Peaje cr\xEDtico en el 4,60m:** Con margen final de ${margin} pts, el ${loserLog.ftPct.toFixed(1)}% FT de ${loser.abbr} (${loserMissedFt} libres errados) hundi\xF3 su cierre frente al ${winnerLog.ftPct.toFixed(1)}% FT (${winnerLog.ftm}/${winnerLog.fta}) de ${winner.abbr}.` });
  }
  if (ftmDiff >= 11 || margin <= 6 && ftmDiff >= 7 && winnerLog.fta >= 22) {
    candidates.push({ family: "free_throw_disparity", axis: "free_throws", score: 9.2 + Math.min(4.5, Math.max(0, ftmDiff - 8) * 0.45) + (margin <= 6 ? 1.8 : 0), simple: `**Castigo constante hacia la personal:** ${winner.shortName} sac\xF3 +${ftmDiff} puntos de ventaja en tiros libres (${winnerLog.ftm}/${winnerLog.fta} al ${winnerLog.ftPct.toFixed(0)}% frente al ${loserLog.ftm}/${loserLog.fta} de ${loser.shortName}) atacando la pintura con agresividad.`, advanced: `**Agresividad hacia la l\xEDnea (+${ftmDiff} pts en libres):** ${winner.abbr} convirti\xF3 ${winnerLog.ftm}/${winnerLog.fta} en tiros libres (${winnerLog.ftPct.toFixed(0)}%) frente al ${loserLog.ftm}/${loserLog.fta} (${loserLog.ftPct.toFixed(0)}%) de ${loser.abbr}, forzando faltas en penetraci\xF3n y juego interior.` });
  }
  if (fg3mDiff >= 5 || winnerLog.fg3m >= 17 && winnerLog.fg3Pct >= 39.5 && fg3mDiff >= 3) {
    candidates.push({ family: "three_point_avalanche", axis: "perimeter", score: 10.2 + fg3mDiff * 1.05 + (winnerLog.fg3Pct >= 42.5 ? 2.2 : 0) + (winnerLog.fg3m >= 19 ? 1.8 : 0), simple: `**Bombardeo desde el per\xEDmetro:** ${winner.shortName} abri\xF3 brecha desde el arco con ${winnerLog.fg3m}/${winnerLog.fg3a} en triples (${winnerLog.fg3Pct.toFixed(1)}%), firmando +${pts3Diff} puntos exteriores m\xE1s que ${loser.shortName} (${loserLog.fg3m}/${loserLog.fg3a}).`, advanced: `**Matem\xE1tica perimetral (+${pts3Diff} pts):** ${winner.abbr} castig\xF3 con ${winnerLog.fg3m} T3 al ${winnerLog.fg3Pct.toFixed(1)}% (${w3Par.toFixed(0)}% 3PAr) frente al ${loserLog.fg3m}/${loserLog.fg3a} (${loserLog.fg3Pct.toFixed(1)}%) de ${loser.abbr}.` });
  }
  if (loserLog.fg3a >= 28 && loserLog.fg3Pct <= 26.5 && fg3mDiff >= 2) {
    const missed3 = loserLog.fg3a - loserLog.fg3m;
    candidates.push({ family: "rival_perimeter_collapse", axis: "perimeter", score: 11.8 + (27.5 - loserLog.fg3Pct) * 0.8 + missed3 * 0.14, simple: `**Apag\xF3n exterior de ${loser.shortName}:** El aro se cerr\xF3 desde lejos para ${loser.shortName}, estancado en un gris ${loserLog.fg3m}/${loserLog.fg3a} en triples (${loserLog.fg3Pct.toFixed(1)}%, ${missed3} fallos exteriores).`, advanced: `**Colapso de varianza en el triple:** Pese a volcar el ${l3Par.toFixed(0)}% de sus tiros al per\xEDmetro, ${loser.abbr} naufrag\xF3 con ${loserLog.fg3Pct.toFixed(1)}% 3P (${loserLog.fg3m}/${loserLog.fg3a}), lastrando su ataque a ${loserLog.offRtg.toFixed(1)} OffRtg.` });
  }
  if (w2Diff >= 7 && w2Pct >= 54 || fg3mDiff <= -3 && w2Diff >= 5) {
    candidates.push({ family: "interior_2pt_siege", axis: "interior", score: 10.4 + w2Diff * 0.85 + (fg3mDiff <= -3 ? 3.8 : 0) + Math.max(0, w2Pct - 56) * 0.25, simple: fg3mDiff <= -3 ? `**Martillo interior pese a ceder el triple:** Aunque encaj\xF3 ${Math.abs(fg3mDiff)} triples m\xE1s, ${winner.shortName} gobern\xF3 la pintura con un ${w2m}/${w2a} en tiros de dos (${w2Pct.toFixed(1)}%, +${pts2Diff} puntos dentro del arco).` : `**Asedio constante en la pintura:** ${winner.shortName} impuso su ley cerca del aro firmando un ${w2m}/${w2a} en tiros de dos (${w2Pct.toFixed(1)}%), por el ${l2m}/${l2a} (${l2Pct.toFixed(1)}%) de ${loser.shortName}.`, advanced: `**Dominio interior 2PT (+${pts2Diff} pts):** ${winner.abbr} convirti\xF3 el ${w2Pct.toFixed(1)}% en tiros de 2 (${w2m}/${w2a} vs ${l2m}/${l2a}, ${l2Pct.toFixed(1)}% de ${loser.abbr})${fg3mDiff <= -3 ? `, neutralizando un d\xE9ficit de ${Math.abs(pts3Diff)} pts en el triple` : ""}.` });
  }
  if (tovDiff >= 5 || winnerLog.stl >= 11 && loserLog.tov >= 15 && tovDiff >= 2 || winnerLog.tov <= 7 && tovDiff >= 3) {
    const activeHands = winnerLog.stl >= 10 && loserLog.tov >= 15;
    candidates.push({ family: activeHands ? "defensive_steals_press" : "surgical_ball_security", axis: "ball_security", score: 10.4 + Math.max(0, tovDiff) * 1.1 + (winnerLog.stl >= 11 ? 2.4 : 0) + (winnerLog.tov <= 7 ? 2 : 0), simple: activeHands ? `**Asfixia en l\xEDneas de pase:** Las manos activas de ${winner.shortName} (${winnerLog.stl} robos) provocaron ${loserLog.tov} p\xE9rdidas de ${loser.shortName} (${winnerLog.tov <= 12 ? `por solo ${winnerLog.tov} propias` : `+${tovDiff} en el balance de p\xE9rdidas`}) para castigar a campo abierto.` : winnerLog.tov <= 10 ? `**Cuidado quir\xFArgico del bal\xF3n:** ${winner.shortName} apenas concedi\xF3 ${winnerLog.tov} p\xE9rdidas en toda la noche mientras exprim\xEDa los ${loserLog.tov} balones perdidos de ${loser.shortName}.` : `**Batalla ganada en las p\xE9rdidas:** ${winner.shortName} protegi\xF3 mucho mejor sus posesiones (${winnerLog.tov} p\xE9rdidas frente a las ${loserLog.tov} de ${loser.shortName}) para inclinar el volumen ofensivo.`, advanced: `**Econom\xEDa de posesiones (TOV%):** ${winner.abbr} cerr\xF3 en ${winnerLog.tovPct.toFixed(1)}% TOV (${winnerLog.tov} p\xE9rdidas, AST/TOV ${wAstTo.toFixed(2)}) frente al ${loserLog.tovPct.toFixed(1)}% TOV (${loserLog.tov} p\xE9rdidas, ${winnerLog.stl} STL rivales) de ${loser.abbr}.` });
  }
  if (orebDiff >= 6 || winnerLog.oreb >= 15 && orebDiff >= 3 || rebDiff >= 12) {
    candidates.push({ family: "second_chance_glass", axis: "glass", score: 10 + Math.max(0, orebDiff) * 0.9 + Math.max(0, rebDiff - 6) * 0.45 + (winnerLog.oreb >= 16 ? 1.8 : 0), simple: winnerLog.oreb >= 14 && orebDiff >= 3 ? `**Segundas vidas en el cristal:** ${winner.shortName} carg\xF3 el aro rival con ${winnerLog.oreb} rebotes ofensivos (${winnerLog.reb}-${loserLog.reb} en el total) para desgastar cada defensa de ${loser.shortName}.` : `**Monopolio bajo los tableros:** ${winner.shortName} impuso su f\xEDsico dominando el rebote por ${winnerLog.reb} a ${loserLog.reb} (+${rebDiff} capturas, con ${winnerLog.oreb} rechaces en ataque).`, advanced: `**Control del rebote ofensivo:** ${winner.abbr} captur\xF3 el ${winnerLog.orebPct.toFixed(1)}% OREB (${winnerLog.oreb} vs ${loserLog.oreb} OREB \xB7 +${rebDiff} REB totales), inclinando el volumen de tiro (${winnerLog.fga} vs ${loserLog.fga} FGA).` });
  }
  if (astDiff >= 7 || winnerLog.ast >= 31 && wAstPctOfFgm >= 68) {
    candidates.push({ family: "ball_movement_clinic", axis: "playmaking", score: 9.8 + Math.max(0, astDiff) * 0.72 + (winnerLog.ast >= 33 ? 2.4 : 0) + (wAstPctOfFgm >= 72 ? 1.6 : 0), simple: `**Cl\xEDnica de pase extra:** El bal\xF3n vol\xF3 en el ataque de ${winner.shortName}, repartiendo ${winnerLog.ast} asistencias sobre ${winnerLog.fgm} canastas en juego (por ${loserLog.ast} asistencias de ${loser.shortName}).`, advanced: `**Creaci\xF3n colectiva (${wAstPctOfFgm.toFixed(0)}% AST/FGM):** ${winner.abbr} asisti\xF3 ${winnerLog.ast} de sus ${winnerLog.fgm} tiros anotados (${astDiff >= 0 ? `+${astDiff}` : astDiff} AST vs ${loser.abbr}) sosteniendo un ratio AST/TOV de ${wAstTo.toFixed(2)}.` });
  }
  if (loserPtsVsSeason <= -10.5 || winnerLog.defRtg <= 103.5 || winnerLog.blk >= 8) {
    const rimWall = winnerLog.blk >= 8;
    const defLeadLabel = winnerLog.defRtg <= 101.5 ? "Contenci\xF3n \xE9lite" : "Freno defensivo";
    candidates.push({ family: rimWall ? "rim_protection_wall" : "defensive_stranglehold", axis: "defense", score: 10.2 + Math.max(0, -loserPtsVsSeason - 7) * 0.6 + Math.max(0, 106 - winnerLog.defRtg) * 0.55 + (rimWall ? 3.2 : 0), simple: rimWall ? `**Muro protector del aro:** ${winner.shortName} intimid\xF3 cada penetraci\xF3n con ${winnerLog.blk} tapones (${wStocks} robos+tapones), frenando a ${loser.shortName} en ${loser.score} puntos (${loserLog.fgPct.toFixed(1)}% TC).` : `**Cerrojo defensivo:** ${winner.shortName} dej\xF3 a ${loser.shortName} en ${loser.score} puntos${loserPtsVsSeason <= -8 ? ` (${Math.abs(Math.round(loserPtsVsSeason))} menos de sus ${loserTeam.avgPointsFor.toFixed(1)} habituales)` : ""} y un ${loserLog.fgPct.toFixed(1)}% en tiros de campo.`, advanced: `**${defLeadLabel} (${winnerLog.defRtg.toFixed(1)} DefRtg):** ${winner.abbr} sum\xF3 ${wStocks} stocks (${winnerLog.stl} STL / ${winnerLog.blk} BLK)${loserPtsVsSeason <= -6 ? ` y sec\xF3 a ${loser.abbr} ${Math.abs(loserPtsVsSeason).toFixed(1)} pts bajo su media (${loserTeam.avgPointsFor.toFixed(1)})` : ` dejando en ${loserLog.efgPct.toFixed(1)}% eFG a ${loser.abbr}`}.` });
  }
  const xFactorCandidates = winnerPlayers.filter((p) => p.ptsBaselineAvg > 0 && p.ptsBaselineAvg <= 16.8 && (p.points >= 18 && p.ptsDelta >= 9.5 || p.ptsBaselineAvg <= 13.5 && p.points >= 16 && p.fg3m >= 4 || p.ptsBaselineAvg <= 14 && p.points >= 14 && p.plusMinus >= 18)).sort((a, b) => b.ptsDelta + b.plusMinus * 0.25 - (a.ptsDelta + a.plusMinus * 0.25));
  if (xFactorCandidates.length > 0) {
    const xf = xFactorCandidates[0];
    candidates.push({ family: "unexpected_x_factor", axis: "x_factor", score: 12.4 + Math.max(0, xf.ptsDelta - 8) * 0.68 + (xf.plusMinus >= 14 ? 1.8 : 0), simple: `**Factor X inesperado:** ${xf.playerName} rompi\xF3 el guion para ${winner.shortName} aportando ${xf.points} puntos (+${xf.ptsDelta.toFixed(1)} sobre su media de ${xf.ptsBaselineAvg.toFixed(1)})${xf.fg3m >= 4 ? ` con ${xf.fg3m}/${xf.fg3a} en triples` : xf.plusMinus >= 12 ? ` y +${xf.plusMinus} en pista` : ""}.`, advanced: `**Disrupci\xF3n de secundario:** ${xf.playerName} elev\xF3 el techo de ${winner.abbr} con ${xf.points} PTS (+${xf.ptsDelta.toFixed(1)} vs media) al ${xf.tsPct.toFixed(1)}% TS (${xf.plusMinus >= 0 ? `+${xf.plusMinus}` : xf.plusMinus} +/- en ${xf.minutes.toFixed(0)}m).` });
  } else {
    const matchRoleSpike = roleShifts.find((r) => r.teamAbbr === winner.abbr && r.points >= 15 && (r.minutesDelta >= 8 || r.usgDelta >= 8));
    if (matchRoleSpike) {
      candidates.push({ family: "role_spike_step_up", axis: "x_factor", score: 10.8 + Math.max(0, matchRoleSpike.minutesDelta - 6) * 0.35 + Math.max(0, matchRoleSpike.usgDelta - 6) * 0.3, simple: `**Paso al frente en la rotaci\xF3n:** Asumiendo galones extra (${matchRoleSpike.minutes.toFixed(0)} minutos, +${matchRoleSpike.minutesDelta.toFixed(1)} sobre su media), ${matchRoleSpike.playerName} respondi\xF3 con ${matchRoleSpike.points} puntos y ${matchRoleSpike.rebounds} rebotes para ${winner.shortName}.`, advanced: `**Expansi\xF3n de rol productiva:** ${matchRoleSpike.playerName} absorbi\xF3 ${matchRoleSpike.minutes.toFixed(0)} MIN (+${matchRoleSpike.minutesDelta.toFixed(1)}) y ${matchRoleSpike.usgEst.toFixed(1)}% USG (${matchRoleSpike.usgDelta >= 0 ? "+" : ""}${matchRoleSpike.usgDelta.toFixed(1)} pp) firmando ${matchRoleSpike.gameScore.toFixed(1)} GmSc.` });
    }
  }
  const lockedRivalStars = loserPlayers.filter((p) => p.ptsBaselineAvg >= 19.5 && p.minutes >= 20 && p.ptsDelta <= -8.5 && p.tsPct <= 47.5).sort((a, b) => a.ptsDelta - b.ptsDelta);
  if (lockedRivalStars.length > 0) {
    const ls = lockedRivalStars[0];
    candidates.push({ family: "rival_star_lockdown", axis: "rival_star", score: 12.2 + Math.abs(ls.ptsDelta) * 0.52 + Math.max(0, 48 - ls.tsPct) * 0.18, simple: `**Estrella rival maniatada:** La defensa de ${winner.shortName} sec\xF3 a ${ls.playerName}, limitado a ${ls.points} puntos (${ls.fgm}/${ls.fga} en tiros, ${Math.abs(ls.ptsDelta).toFixed(1)} por debajo de su media de ${ls.ptsBaselineAvg.toFixed(1)}).`, advanced: `**Anulaci\xF3n del generador primario:** ${ls.playerName} cay\xF3 a ${ls.points} PTS (${ls.ptsDelta.toFixed(1)} vs media) con un ${ls.tsPct.toFixed(1)}% TS (${ls.fgm}/${ls.fga} TC) en ${ls.minutes.toFixed(0)}m ante las ayudas de ${winner.abbr}.` });
  } else if (lTop && lTop.points >= 35 && lDoubleDigits <= 3) {
    candidates.push({ family: "lonely_rival_star", axis: "rival_star", score: 11.2 + (lTop.points - 33) * 0.48, simple: `**Estrella sin escolta en ${loser.shortName}:** Los ${lTop.points} puntos de ${lTop.playerName} (${lTop.fgm}/${lTop.fga} en tiros) quedaron hu\xE9rfanos de apoyo coral (solo ${Math.max(0, lDoubleDigits - 1)} compa\xF1eros m\xE1s llegaron a 10 puntos).`, advanced: `**Hiperdependencia rival:** Pese a los ${lTop.points} PTS (${lTop.gameScore.toFixed(1)} GmSc) de ${lTop.playerName} (${(lTop.points / Math.max(1, loser.score) * 100).toFixed(0)}% del total de ${loser.abbr}), su rotaci\xF3n secundaria naufrag\xF3.` });
  }
  const tdPlayer = winnerPlayers.find((p) => {
    const cats = (p.points >= 10 ? 1 : 0) + (p.rebounds >= 10 ? 1 : 0) + (p.assists >= 10 ? 1 : 0) + (p.steals >= 10 ? 1 : 0) + (p.blocks >= 10 ? 1 : 0);
    return cats >= 3;
  });
  if (tdPlayer) {
    candidates.push({ family: "triple_double_command", axis: "star_outlier", score: 13.8 + Math.max(0, tdPlayer.gameScore - 25) * 0.5, simple: `**Triple-doble total de ${tdPlayer.playerName}:** Gobern\xF3 cada faceta del juego con ${tdPlayer.points} puntos, ${tdPlayer.rebounds} rebotes y ${tdPlayer.assists} asistencias (${tdPlayer.plusMinus >= 0 ? `+${tdPlayer.plusMinus}` : tdPlayer.plusMinus} en pista) para conducir a ${winner.shortName}.`, advanced: `**Motor integral (${tdPlayer.gameScore.toFixed(1)} GmSc):** Triple-doble de ${tdPlayer.playerName} (${tdPlayer.points}P/${tdPlayer.rebounds}R/${tdPlayer.assists}A) al ${tdPlayer.tsPct.toFixed(1)}% TS con ${tdPlayer.usgEst.toFixed(1)}% USG (${tdPlayer.plusMinus >= 0 ? `+${tdPlayer.plusMinus}` : tdPlayer.plusMinus} +/-).` });
  } else if (wTop && (wTop.points >= 38 || wTop.ptsDelta >= 12.5 || wTop.gameScore >= 32)) {
    candidates.push({ family: "supernova_star_eruption", axis: "star_outlier", score: 12.2 + Math.max(0, wTop.gameScore - 28) * 0.62, simple: `**Exhibici\xF3n imparable de ${wTop.playerName}:** Desat\xF3 ${wTop.points} puntos (${wTop.ptsDelta >= 8 ? `+${wTop.ptsDelta.toFixed(1)} sobre su media habitual, ` : ""}${wTop.fgm}/${wTop.fga} en tiros) sin que la defensa de ${loser.shortName} encontrara ant\xEDdoto.`, advanced: `**Techo individual MVP (${wTop.gameScore.toFixed(1)} GmSc):** ${wTop.playerName} produjo ${wTop.points} PTS (${wTop.ptsDelta >= 0 ? `+${wTop.ptsDelta.toFixed(1)}` : wTop.ptsDelta.toFixed(1)} vs media) al ${wTop.tsPct.toFixed(1)}% TS con ${wTop.usgEst.toFixed(1)}% USG.` });
  } else if (winnerPlayers.length >= 2 && winnerPlayers[0].points >= 26 && winnerPlayers[1].points >= 24 && winnerPlayers[0].points + winnerPlayers[1].points >= Math.max(55, winner.score * 0.48)) {
    const p1 = winnerPlayers[0];
    const p2 = winnerPlayers[1];
    const duoPts = p1.points + p2.points;
    candidates.push({ family: "star_duo_punch", axis: "star_outlier", score: 11 + (duoPts - 54) * 0.4, simple: `**Doble martillo ofensivo:** ${p1.playerName} (${p1.points} PTS) y ${p2.playerName} (${p2.points} PTS) se combinaron para ${duoPts} puntos, desbordando las ayudas de ${loser.shortName}.`, advanced: `**Doble gravedad ofensiva:** ${p1.playerName} (${p1.tsPct.toFixed(0)}% TS) y ${p2.playerName} (${p2.tsPct.toFixed(0)}% TS) generaron el ${(duoPts / Math.max(1, winner.score) * 100).toFixed(0)}% del marcador de ${winner.abbr} (${duoPts} PTS conjuntos).` });
  }
  const brokenRivalStreak = streakShifts.find((s) => s.status === "broken" && s.teamAbbr === loser.abbr && s.streakCount >= 6);
  const extendedWinnerStreak = streakShifts.find((s) => s.status === "extended" && s.teamAbbr === winner.abbr && s.streakCount >= 8);
  if (brokenRivalStreak) {
    candidates.push({ family: "snapped_rival_streak", axis: "rival_star", score: 11.4 + (brokenRivalStreak.streakCount - 5) * 0.55, simple: `**Racha cortada de ra\xEDz:** ${winner.shortName} fren\xF3 la racha de ${brokenRivalStreak.streakCount} partidos seguidos en ${brokenRivalStreak.thresholdLabel} de ${brokenRivalStreak.playerName}, dej\xE1ndolo esta noche en ${brokenRivalStreak.nightValueDisplay}.`, advanced: `**Ruptura de tendencia estad\xEDstica:** ${brokenRivalStreak.playerName} vio cortada su serie activa de ${brokenRivalStreak.streakCount} encuentros en ${brokenRivalStreak.thresholdLabel} (qued\xE1ndose en ${brokenRivalStreak.nightValueDisplay} frente a ${brokenRivalStreak.avgDuringStreak} de media en la racha).` });
  } else if (extendedWinnerStreak) {
    candidates.push({ family: "extended_winner_streak", axis: "star_outlier", score: 10.6 + (extendedWinnerStreak.streakCount - 7) * 0.45, simple: `**Racha en estado de gracia:** ${extendedWinnerStreak.playerName} prolong\xF3 a ${extendedWinnerStreak.streakCount} noches consecutivas su racha de ${extendedWinnerStreak.thresholdLabel} (${extendedWinnerStreak.nightValueDisplay} hoy) impulsando a ${winner.shortName}.`, advanced: `**Continuidad de racha \xE9lite:** ${extendedWinnerStreak.playerName} encaden\xF3 su ${extendedWinnerStreak.streakCount}\xBA partido consecutivo en ${extendedWinnerStreak.thresholdLabel} (${extendedWinnerStreak.nightValueDisplay}, promedio de ${extendedWinnerStreak.avgDuringStreak} en la serie).` });
  }
  if (wDoubleDigits >= 6 && (wDoubleDigits - lDoubleDigits >= 2 || !wTop || wTop.points <= 25)) {
    candidates.push({ family: "coral_collective_depth", axis: "depth", score: 10.6 + (wDoubleDigits - 5) * 1.45 + Math.max(0, wDoubleDigits - lDoubleDigits) * 0.65, simple: `**Victoria coral de toda la plantilla:** Hasta ${wDoubleDigits} jugadores de ${winner.shortName} sumaron dobles d\xEDgitos en anotaci\xF3n (por ${lDoubleDigits} en ${loser.shortName}), castigando cada rotaci\xF3n rival.`, advanced: `**Profundidad y reparto ofensivo:** ${wDoubleDigits} efectivos con \u226510 PTS sostuvieron los ${winnerLog.offRtg.toFixed(1)} OffRtg de ${winner.abbr} sin monopolio de uso (techo individual de ${wTop ? wTop.usgEst.toFixed(1) : "24.0"}% USG).` });
  } else {
    const benchRunPlayer = winnerPlayers.slice(2).filter((p) => p.plusMinus >= 17 && p.minutes >= 15 && margin <= 16).sort((a, b) => b.plusMinus - a.plusMinus)[0];
    if (benchRunPlayer) {
      candidates.push({ family: "rotation_plus_minus_run", axis: "depth", score: 10.3 + (benchRunPlayer.plusMinus - 15) * 0.38, simple: `**Parcial demoledor de rotaci\xF3n:** Los minutos en cancha de ${benchRunPlayer.playerName} arrojaron un +${benchRunPlayer.plusMinus} en el marcador (${benchRunPlayer.points}P \xB7 ${benchRunPlayer.rebounds}R \xB7 ${benchRunPlayer.assists}A en ${benchRunPlayer.minutes.toFixed(0)}m) para romper la igualdad.`, advanced: `**Impacto neto de rotaci\xF3n (+/-):** ${benchRunPlayer.playerName} inclin\xF3 los tramos puente con +${benchRunPlayer.plusMinus} en ${benchRunPlayer.minutes.toFixed(0)} MIN (${benchRunPlayer.gameScore.toFixed(1)} GmSc) en un choque de ${margin} pts de margen.` });
    }
  }
  if (winner.isBackToBack && !loser.isBackToBack) {
    candidates.push({ family: "b2b_resilience_win", axis: "context_pace", score: 10.6 + (isRoadWin ? 2 : 0) + (margin >= 9 ? 1 : 0), simple: `**Pulso f\xEDsico sin descanso:** Pese a jugar en segunda noche consecutiva (Back-to-Back)${isRoadWin ? " y a domicilio" : ""}, ${winner.shortName} sostuvo piernas y concentraci\xF3n ante un ${loser.shortName} descansado.`, advanced: `**Resiliencia en Back-to-Back (0 d\xEDas reposo):** Desafiando el peaje de calendario${isRoadWin ? " como visitante" : ""}, ${winner.abbr} firm\xF3 +${winner.netRtg.toFixed(1)} NetRtg (${winner.offRtg.toFixed(1)} OffRtg) a ${pace.toFixed(1)} Pace.` });
  } else if (loser.isBackToBack && !winner.isBackToBack && (loserLog.efgPct <= 49.5 || margin >= 10)) {
    candidates.push({ family: "rival_b2b_fatigue", axis: "context_pace", score: 10 + (margin >= 12 ? 1.4 : 0), simple: `**Factura f\xEDsica del calendario:** ${winner.shortName} impuso piernas frescas ante un ${loser.shortName} sin descanso (Back-to-Back) que acus\xF3 el desgaste en el tiro (${loserLog.fgPct.toFixed(1)}% TC).`, advanced: `**Asimetr\xEDa de descanso (rival en B2B):** La fatiga acumulada de ${loser.abbr} (0 d\xEDas de reposo) hundi\xF3 su tiro a ${loserLog.efgPct.toFixed(1)}% eFG y su balance a ${loserLog.netRtg.toFixed(1)} NetRtg.` });
  } else if (pace >= 105 || pace <= 93.5) {
    const isTrackMeet = pace >= 105;
    candidates.push({ family: isTrackMeet ? "fast_pace_track_meet" : "slow_pace_grind", axis: "context_pace", score: 9.5 + Math.abs(pace - 99.5) * 0.38, simple: isTrackMeet ? `**V\xE9rtigo a campo abierto:** El partido vol\xF3 a ${pace.toFixed(0)} posesiones (${totalPoints} puntos totales), un intercambio fren\xE9tico donde ${winner.shortName} ejecut\xF3 mejor en transici\xF3n.` : `**Guerra de trincheras a media pista:** Encuentro espeso de pocas posesiones (ritmo de ${pace.toFixed(0)}) donde ${winner.shortName} supo fabricar mejores tiros en est\xE1tico.`, advanced: isTrackMeet ? `**Imposici\xF3n de Pace alto (${pace.toFixed(1)}):** A ritmo de v\xE9rtigo, ${winner.abbr} maximiz\xF3 el intercambio con ${winnerLog.offRtg.toFixed(1)} OffRtg (${winnerLog.tsPct.toFixed(1)}% TS).` : `**Control de tempo bajo (${pace.toFixed(1)} Pace):** En batalla de media pista, ${winner.abbr} marc\xF3 diferencias desde el orden t\xE1ctico (+${winner.netRtg.toFixed(1)} NetRtg \xB7 ${winner.defRtg.toFixed(1)} DefRtg).` });
  }
  if (winnerLog.efgPct > loserLog.efgPct && (winnerLog.tsPct - loserLog.tsPct >= 8 || winnerLog.efgPct >= 60.5)) {
    const tsGap = winnerLog.tsPct - loserLog.tsPct;
    candidates.push({ family: "true_shooting_clinic", axis: "efficiency", score: 9.6 + Math.max(0, tsGap - 4) * 0.45 + Math.max(0, winnerLog.efgPct - 59) * 0.4, simple: `**Cl\xEDnica de punter\xEDa:** ${winner.shortName} roz\xF3 la excelencia en selecci\xF3n de tiro con un ${winnerLog.fgPct.toFixed(1)}% en tiros de campo (${winnerLog.efgPct.toFixed(1)}% efectivo) frente al ${loserLog.fgPct.toFixed(1)}% de ${loser.shortName}.`, advanced: `**Brecha de eficiencia real (+${tsGap.toFixed(1)} pp TS):** ${winner.abbr} escal\xF3 hasta ${winnerLog.tsPct.toFixed(1)}% TS (${winnerLog.efgPct.toFixed(1)}% eFG \xB7 ${winnerLog.offRtg.toFixed(1)} OffRtg) ante el ${loserLog.tsPct.toFixed(1)}% TS de ${loser.abbr}.` });
  }
  const ranked = [...candidates].sort((a, b) => {
    const effA = a.score - (usedFamilyCounts.get(a.family) ?? 0) * 2.25;
    const effB = b.score - (usedFamilyCounts.get(b.family) ?? 0) * 2.25;
    return effB - effA || b.score - a.score;
  });
  const picked = [];
  const usedAxes = /* @__PURE__ */ new Set();
  for (const cand of ranked) {
    if (picked.length >= 2) break;
    if (usedAxes.has(cand.axis)) continue;
    picked.push(cand);
    usedAxes.add(cand.axis);
    if (cand.family === "paradox_won_shooting_worse") {
      if (fgaDiff >= 4) usedAxes.add("glass");
      if (ftmDiff >= 4) usedAxes.add("free_throws");
      if (fgaDiff >= 5 && tovDiff >= 4) usedAxes.add("ball_security");
    }
  }
  if (picked.length < 2) {
    const microLevers = [];
    if (margin <= 6 && !usedAxes.has("efficiency")) {
      const clutchEdgeSimple = tovDiff >= 2 && !usedAxes.has("ball_security") ? `cometiendo ${tovDiff} p\xE9rdidas menos (${winnerLog.tov} vs ${loserLog.tov})` : ftmDiff >= 3 && !usedAxes.has("free_throws") ? `sumando +${ftmDiff} puntos desde el tiro libre (${winnerLog.ftm}/${winnerLog.fta})` : pts2Diff >= 6 && !usedAxes.has("interior") ? `anotando +${pts2Diff} puntos en canastas de dos (${w2m}/${w2a})` : pts3Diff >= 6 && !usedAxes.has("perimeter") ? `convirtiendo ${fg3mDiff} triples m\xE1s (${winnerLog.fg3m}/${winnerLog.fg3a})` : `templando mejor el pulso en las posesiones finales (${winnerLog.ast} asistencias y ${winnerLog.tov} p\xE9rdidas)`;
      microLevers.push({ family: "clutch_micro_execution", axis: "efficiency", score: 8.5, simple: `**Sangre fr\xEDa en el alambre:** En un desenlace decidido por ${margin} puntos (${awaySide.score}-${homeSide.score}), ${winner.shortName} inclin\xF3 la balanza ${clutchEdgeSimple}.`, advanced: `**Ejecuci\xF3n en final apretado (+${margin}):** En pulso de 1\u20132 posesiones, ${winner.abbr} sostuvo +${winner.netRtg.toFixed(1)} NetRtg (${winner.offRtg.toFixed(1)} vs ${loser.offRtg.toFixed(1)} OffRtg) minimizando errores clave.` });
    }
    const zoneOptions = [{ val: pts2Diff, cand: { family: "micro_2pt_edge", axis: "interior", score: 8, simple: `**Ventaja dentro del arco:** ${winner.shortName} encontr\xF3 mejores penetraciones y tiros cortos con ${w2m}/${w2a} de dos (${w2Pct.toFixed(1)}%), sacando +${pts2Diff} puntos interiores a ${loser.shortName}.`, advanced: `**Renta en finalizaci\xF3n 2PT:** +${pts2Diff} pts en canastas de 2 para ${winner.abbr} (${w2m}/${w2a}, ${w2Pct.toFixed(1)}% vs ${l2m}/${l2a}, ${l2Pct.toFixed(1)}% de ${loser.abbr}).` } }, { val: pts3Diff, cand: { family: "micro_3pt_edge", axis: "perimeter", score: 8, simple: `**Mejor tino exterior:** Los ${winnerLog.fg3m} triples de ${winner.shortName} (${winnerLog.fg3Pct.toFixed(1)}%) frente a los ${loserLog.fg3m} de ${loser.shortName} aportaron un colch\xF3n de +${pts3Diff} puntos.`, advanced: `**Diferencial en el arco:** ${winner.abbr} sum\xF3 +${pts3Diff} pts desde el triple (${winnerLog.fg3m}/${winnerLog.fg3a} al ${winnerLog.fg3Pct.toFixed(1)}% vs ${loserLog.fg3m}/${loserLog.fg3a} de ${loser.abbr}).` } }, { val: ftmDiff * 1.15, cand: { family: "micro_ft_edge", axis: "free_throws", score: 8, simple: `**Renta desde el tiro libre:** ${winner.shortName} supo forzar personales (${winnerLog.ftm}/${winnerLog.fta} en libres por ${loserLog.ftm}/${loserLog.fta} de ${loser.shortName}) para amarrar +${ftmDiff} puntos.`, advanced: `**Renta en tiros libres (+${ftmDiff} pts):** ${winner.abbr} convirti\xF3 ${winnerLog.ftm}/${winnerLog.fta} TL (${winnerLog.ftPct.toFixed(0)}%) frente al ${loserLog.ftm}/${loserLog.fta} (${loserLog.ftPct.toFixed(0)}%) de ${loser.abbr}.` } }, { val: tovDiff * 2.2, cand: { family: "micro_tov_edge", axis: "ball_security", score: 8, simple: `**Pulso ganado en las p\xE9rdidas:** Cuidar mejor la posesi\xF3n (${winnerLog.tov} p\xE9rdidas de ${winner.shortName} frente a ${loserLog.tov} de ${loser.shortName}, con ${winnerLog.stl} robos) evit\xF3 rachas rivales.`, advanced: `**Control de p\xE9rdidas:** ${winner.abbr} oper\xF3 al ${winnerLog.tovPct.toFixed(1)}% TOV (${winnerLog.tov} p\xE9rdidas) frente al ${loserLog.tovPct.toFixed(1)}% TOV (${loserLog.tov} p\xE9rdidas) de ${loser.abbr}.` } }, { val: astDiff * 1.5, cand: { family: "micro_ast_edge", axis: "playmaking", score: 8, simple: `**Fluidez en media pista:** Con ${winnerLog.ast} asistencias (frente a ${loserLog.ast} de ${loser.shortName}), ${winner.shortName} gener\xF3 tiros m\xE1s c\xF3modos en los cuartos finales.`, advanced: `**Fluidez ofensiva:** ${winner.abbr} reparti\xF3 ${winnerLog.ast} AST (${wAstPctOfFgm.toFixed(0)}% de sus FGM asistidos) por ${loserLog.ast} AST de ${loser.abbr}.` } }];
    zoneOptions.sort((a, b) => b.val - a.val);
    for (const z2 of zoneOptions) {
      if (z2.val > 0) microLevers.push(z2.cand);
    }
    const bestPmPlayer = [...winnerPlayers].filter((p) => p.minutes >= 18).sort((a, b) => b.plusMinus - a.plusMinus || b.gameScore - a.gameScore)[0];
    if (bestPmPlayer && bestPmPlayer.plusMinus >= 4) {
      microLevers.push({ family: "on_court_lineup_swing", axis: "depth", score: 7.8, simple: `**Quinteto dominante en pista:** Con ${bestPmPlayer.playerName} sobre el parqu\xE9, ${winner.shortName} firm\xF3 un parcial de +${bestPmPlayer.plusMinus} en ${bestPmPlayer.minutes.toFixed(0)} minutos (${bestPmPlayer.points}P \xB7 ${bestPmPlayer.rebounds}R \xB7 ${bestPmPlayer.assists}A).`, advanced: `**Diferencial en pista (+/-):** Los minutos con ${bestPmPlayer.playerName} arrojaron +${bestPmPlayer.plusMinus} en ${bestPmPlayer.minutes.toFixed(0)}m (${bestPmPlayer.gameScore.toFixed(1)} GmSc \xB7 ${bestPmPlayer.tsPct.toFixed(0)}% TS).` });
    }
    microLevers.push({ family: "two_way_balance_fallback", axis: "defense", score: 7, simple: `**Solidez en ambos aros:** ${winner.shortName} combin\xF3 equilibrio anotador (${winner.score} puntos, ${winnerLog.fgm}/${winnerLog.fga} en tiros) y control atr\xE1s para cerrar el ${awaySide.score}-${homeSide.score}.`, advanced: `**Balance neto por posesi\xF3n:** ${winner.abbr} se impuso con +${winner.netRtg.toFixed(1)} NetRtg (${winner.offRtg.toFixed(1)} OffRtg vs ${winner.defRtg.toFixed(1)} DefRtg) a ${pace.toFixed(1)} posesiones.` });
    for (const fb of microLevers) {
      if (picked.length >= 2) break;
      if (usedAxes.has(fb.axis)) continue;
      picked.push(fb);
      usedAxes.add(fb.axis);
    }
  }
  for (const p of picked) {
    usedFamilyCounts.set(p.family, (usedFamilyCounts.get(p.family) ?? 0) + 1);
  }
  return { simple: picked.map((p) => p.simple), advanced: picked.map((p) => p.advanced) };
}
async function getGameDayPayload(requestedDate, forceRefresh = false) {
  const full = await getFullLeagueMemory(forceRefresh);
  const dateEventMap = /* @__PURE__ */ new Map();
  for (const t of full.teams) {
    for (const g of t.games) {
      const d = g.date.slice(0, 10);
      if (!d) continue;
      let entry = dateEventMap.get(d);
      if (!entry) {
        entry = { seasonLabel: g.seasonLabel, eventIds: /* @__PURE__ */ new Set() };
        dateEventMap.set(d, entry);
      }
      entry.eventIds.add(g.eventId);
    }
  }
  const availableDates = [...dateEventMap.entries()].map(([date, info]) => ({ date, seasonLabel: info.seasonLabel, gamesCount: info.eventIds.size })).sort((a, b) => b.date.localeCompare(a.date));
  const cleanReq = (requestedDate || "").slice(0, 10);
  const selectedOpt = availableDates.find((d) => d.date === cleanReq) || availableDates[0];
  const selectedDate = selectedOpt?.date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const seasonLabel = selectedOpt?.seasonLabel || "2026-27";
  const eventIdsSet = dateEventMap.get(selectedDate)?.eventIds || /* @__PURE__ */ new Set();
  const liveOrScheduledToday = await fetchLiveScoreboardGames(void 0, forceRefresh);
  const seasonTotals = [];
  for (const t of full.teams) {
    for (const g of t.games) {
      if (g.seasonLabel === seasonLabel && g.isHome) {
        seasonTotals.push(g.totalPoints);
      }
    }
  }
  const leagueAvgTotalPoints = seasonTotals.length > 0 ? round14(meanNums3(seasonTotals)) : 228.4;
  const nightLinesByEventSide = /* @__PURE__ */ new Map();
  const allNightLines = [];
  const explosions = [];
  const slumps = [];
  const roleShifts = [];
  const streakShifts = [];
  for (const p of full.allPlayers) {
    const nightIdx = p.games.findIndex((g2) => eventIdsSet.has(g2.eventId) || g2.date.slice(0, 10) === selectedDate);
    if (nightIdx === -1) continue;
    const g = p.games[nightIdx];
    const nightTeamAbbr = g.teamAbbr || p.teamAbbr;
    const priorGames = p.games.filter((_, idx) => idx !== nightIdx).slice(0, 25);
    let baselinePool = [...priorGames];
    if (baselinePool.length < 15) {
      const pPrev = full.s2026?.playersById?.get(p.id) || full.s2025?.playersById?.get(p.id);
      if (pPrev && Array.isArray(pPrev.games) && pPrev.games.length > 0) {
        const needed = 15 - baselinePool.length;
        baselinePool = [...baselinePool, ...pPrev.games.slice(0, needed)];
      } else {
        const needed = 15 - baselinePool.length;
        const posUp = (p.position || "").toUpperCase();
        const isGuard = posUp.includes("G");
        const isCenter = posUp.includes("C");
        const defaultPts = isGuard ? 10.5 : isCenter ? 9.2 : 10;
        const defaultReb = isCenter ? 6.5 : isGuard ? 2.8 : 4.2;
        const defaultAst = isGuard ? 3.8 : 1.8;
        const default3pm = isGuard ? 1.4 : isCenter ? 0.3 : 1;
        for (let k = 0; k < needed; k++) {
          baselinePool.push({
            points: defaultPts,
            rebounds: defaultReb,
            assists: defaultAst,
            fg3m: default3pm,
            minutes: 18,
            gameScore: 7.5,
            tsPct: 54,
            usgEst: 18.5,
            fga: 8.5,
            fgm: 4,
            stocks: 1.2
          });
        }
      }
    }
    if (baselinePool.length === 0) baselinePool = p.games;
    const ptsAvg = round14(meanNums3(baselinePool.map((x) => x.points)));
    const ptsSd = Math.max(2.6, stdDevNums(baselinePool.map((x) => x.points)));
    const gmScAvg = round14(meanNums3(baselinePool.map((x) => x.gameScore)));
    const minAvg = round14(meanNums3(baselinePool.map((x) => x.minutes)));
    const tsAvg = round14(meanNums3(baselinePool.map((x) => x.tsPct)));
    const usgAvg = round14(meanNums3(baselinePool.map((x) => x.usgEst)));
    const fgaAvg = round14(meanNums3(baselinePool.map((x) => x.fga)));
    const ptsDelta = round14(g.points - ptsAvg);
    const staticSched = staticScheduleByGameId.get(g.eventId);
    const resolvedIsHome = staticSched ? nightTeamAbbr === staticSched.homeAbbr || p.teamAbbr === staticSched.homeAbbr : g.isHome;
    const line = { playerId: p.id, playerName: p.name, teamAbbr: nightTeamAbbr, position: p.position, opponentAbbr: g.opponentAbbr, isHome: resolvedIsHome, result: g.result, minutes: g.minutes, points: g.points, rebounds: g.rebounds, oreb: g.oreb, assists: g.assists, steals: g.steals, blocks: g.blocks, stocks: g.stocks, turnovers: g.turnovers, fgm: g.fgm, fga: g.fga, fg3m: g.fg3m, fg3a: g.fg3a, ftm: g.ftm, fta: g.fta, plusMinus: g.plusMinus, tsPct: g.tsPct, efgPct: g.efgPct, usgEst: g.usgEst, gameScore: g.gameScore, ptsBaselineAvg: ptsAvg, ptsDelta, gmScBaselineAvg: gmScAvg };
    allNightLines.push(line);
    const sideKey = `${g.eventId}:${resolvedIsHome ? "home" : "away"}`;
    const bucket = nightLinesByEventSide.get(sideKey) || [];
    bucket.push(line);
    nightLinesByEventSide.set(sideKey, bucket);
    if (baselinePool.length >= 3) {
      const zPts = round14((g.points - ptsAvg) / ptsSd);
      const rebAvg = round14(meanNums3(baselinePool.map((x) => x.rebounds)));
      const rebSd = Math.max(1.8, stdDevNums(baselinePool.map((x) => x.rebounds)));
      const zReb = round14((g.rebounds - rebAvg) / rebSd);
      const astAvg = round14(meanNums3(baselinePool.map((x) => x.assists)));
      const astSd = Math.max(1.8, stdDevNums(baselinePool.map((x) => x.assists)));
      const zAst = round14((g.assists - astAvg) / astSd);
      const fg3mAvg = round14(meanNums3(baselinePool.map((x) => x.fg3m)));
      const fg3mSd = Math.max(1, stdDevNums(baselinePool.map((x) => x.fg3m)));
      const z3PM = round14((g.fg3m - fg3mAvg) / fg3mSd);
      const gmScSd = Math.max(2.5, stdDevNums(baselinePool.map((x) => x.gameScore)));
      const zGmSc = round14((g.gameScore - gmScAvg) / gmScSd);
      const tovAvg = round14(meanNums3(baselinePool.map((x) => x.turnovers || 0)));
      const foulsAvg = round14(meanNums3(baselinePool.map((x) => x.fouls || 0)));
      const nightStocks = Number(g.stocks ?? (g.steals || 0) + (g.blocks || 0)) || 0;
      const stocksAvg = round14(meanNums3(baselinePool.map((x) => Number(x.stocks ?? (x.steals || 0) + (x.blocks || 0)) || 0)));
      const stocksSd = Math.max(1, stdDevNums(baselinePool.map((x) => Number(x.stocks ?? (x.steals || 0) + (x.blocks || 0)) || 0)));
      const zStocks = round14((nightStocks - stocksAvg) / stocksSd);
      const maxZ = Math.max(zPts, zGmSc, zReb, zAst, z3PM, zStocks);
      const minDiff = round14(g.minutes - minAvg);
      const tsDiff = round14(g.tsPct - tsAvg);
      const cfg = activeGamedayThresholds;
      const isPtsExplosion = zPts >= cfg.explosionZScoreThreshold - 0.45 && ptsDelta >= cfg.explosionScoringPtsDelta - 1.5;
      const isGmScExplosion = zGmSc >= cfg.explosionZScoreThreshold - 0.4 && g.gameScore - gmScAvg >= 6;
      const isRebExplosion = zReb >= cfg.explosionZScoreThreshold && g.rebounds - rebAvg >= cfg.explosionRebDelta && g.rebounds >= cfg.explosionRebMinTotal;
      const isAstExplosion = zAst >= cfg.explosionZScoreThreshold && g.assists - astAvg >= cfg.explosionAstDelta && g.assists >= cfg.explosionAstMinTotal;
      const is3pExplosion = z3PM >= cfg.explosionZScoreThreshold && g.fg3m - fg3mAvg >= cfg.explosion3pDelta && g.fg3m >= cfg.explosion3pMinMade;
      const isStocksExplosion = nightStocks >= cfg.explosionStocksMinTotal && nightStocks - stocksAvg >= cfg.explosionStocksDelta || nightStocks >= cfg.explosionStocksMinTotal + 1 && zStocks >= 1.6;
      if (isPtsExplosion || isGmScExplosion || isRebExplosion || isAstExplosion || is3pExplosion || isStocksExplosion) {
        let driverTag = "Despliegue estad\xEDstico sobresaliente";
        let triggerMetricKey = "points";
        let triggerMetricLabel = "Puntos";
        let triggerNightDisplay = `${g.points} PTS`;
        let triggerBaselineDisplay = `${ptsAvg.toFixed(1)} PTS`;
        let triggerDeltaDisplay = `+${ptsDelta.toFixed(1)}`;
        let triggerDeltaNumeric = ptsDelta;
        let driverDetailSimple = `Anot\xF3 ${g.points} PTS (+${ptsDelta.toFixed(1)} vs media de ${ptsAvg.toFixed(1)} en 2026-27) con ${g.fgm}/${g.fga} TC.`;
        if (priorGames.length === 0) {
          driverTag = "Reaparici\xF3n / Debut de temporada";
          driverDetailSimple = `Debut\xF3 en la temporada sumando ${g.points} PTS (+${ptsDelta.toFixed(1)} vs su media anterior de ${ptsAvg.toFixed(1)} en 2026-27) en ${g.minutes.toFixed(0)} MIN.`;
        } else if (is3pExplosion && g.fg3m >= cfg.explosion3pMinMade) {
          driverTag = "Explosi\xF3n desde el triple";
          triggerMetricKey = "fg3m";
          triggerMetricLabel = "Triples (3PM)";
          triggerNightDisplay = `${g.fg3m} Triples (${g.fg3m}/${g.fg3a})`;
          triggerBaselineDisplay = `${fg3mAvg.toFixed(1)} 3PM`;
          const diff3p = round14(g.fg3m - fg3mAvg);
          triggerDeltaDisplay = `+${diff3p.toFixed(1)}`;
          triggerDeltaNumeric = diff3p;
          driverDetailSimple = `Anot\xF3 ${g.fg3m} triples (${g.fg3m}/${g.fg3a}) sumando ${g.points} PTS (+${diff3p.toFixed(1)} triples respecto a su media de ${fg3mAvg.toFixed(1)} en 2026-27).`;
        } else if (tsDiff >= cfg.explosionShootingTsDiff && minDiff < 4) {
          driverTag = "Explosi\xF3n de punter\xEDa";
          triggerMetricKey = "tsPct";
          triggerMetricLabel = "Punter\xEDa (TS%)";
          triggerNightDisplay = `${g.tsPct.toFixed(1)}% TS`;
          triggerBaselineDisplay = `${tsAvg.toFixed(1)}%`;
          triggerDeltaDisplay = `+${tsDiff.toFixed(1)} pp`;
          triggerDeltaNumeric = tsDiff;
          driverDetailSimple = `Anot\xF3 ${g.points} PTS con una punter\xEDa sobresaliente del ${g.tsPct.toFixed(1)}% TS (+${tsDiff.toFixed(1)} pp respecto a su media de ${tsAvg.toFixed(1)}% en 2026-27, con ${g.fgm}/${g.fga} TC).`;
        } else if (isRebExplosion) {
          driverTag = "Dominio en el rebote";
          triggerMetricKey = "rebounds";
          triggerMetricLabel = "Rebotes";
          triggerNightDisplay = `${g.rebounds} REB`;
          triggerBaselineDisplay = `${rebAvg.toFixed(1)} REB`;
          const diffReb = round14(g.rebounds - rebAvg);
          triggerDeltaDisplay = `+${diffReb.toFixed(1)}`;
          triggerDeltaNumeric = diffReb;
          driverDetailSimple = `Captur\xF3 ${g.rebounds} REB (+${diffReb.toFixed(1)} respecto a su media de ${rebAvg.toFixed(1)} en 2026-27) y sum\xF3 ${g.points} PTS.`;
        } else if (isAstExplosion) {
          driverTag = "Recital en la direcci\xF3n";
          triggerMetricKey = "assists";
          triggerMetricLabel = "Asistencias";
          triggerNightDisplay = `${g.assists} AST`;
          triggerBaselineDisplay = `${astAvg.toFixed(1)} AST`;
          const diffAst = round14(g.assists - astAvg);
          triggerDeltaDisplay = `+${diffAst.toFixed(1)}`;
          triggerDeltaNumeric = diffAst;
          driverDetailSimple = `Reparti\xF3 ${g.assists} AST (+${diffAst.toFixed(1)} respecto a su media de ${astAvg.toFixed(1)} en 2026-27) y anot\xF3 ${g.points} PTS.`;
        } else if (isStocksExplosion) {
          driverTag = "Muralla defensiva e impacto en 'stocks'";
          triggerMetricKey = "stocks";
          triggerMetricLabel = "Robos + Tapones (Stocks)";
          triggerNightDisplay = `${nightStocks} STOCKS (${g.steals || 0} STL / ${g.blocks || 0} BLK)`;
          triggerBaselineDisplay = `${stocksAvg.toFixed(1)} Stocks`;
          const diffStocks = round14(nightStocks - stocksAvg);
          triggerDeltaDisplay = `+${diffStocks.toFixed(1)}`;
          triggerDeltaNumeric = diffStocks;
          driverDetailSimple = `Despliegue defensivo de impacto con ${nightStocks} stocks (${g.steals || 0} robos y ${g.blocks || 0} tapones, +${diffStocks.toFixed(1)} vs media de ${stocksAvg.toFixed(1)} en 2026-27), aportando adem\xE1s ${g.points} PTS.`;
        } else if (minDiff >= cfg.explosionMinutesDelta) {
          driverTag = "Expansi\xF3n de minutos y rol";
          triggerMetricKey = "minutes";
          triggerMetricLabel = "Minutos en Pista";
          triggerNightDisplay = `${g.minutes.toFixed(0)} MIN`;
          triggerBaselineDisplay = `${minAvg.toFixed(0)} MIN`;
          triggerDeltaDisplay = `+${minDiff.toFixed(0)} MIN`;
          triggerDeltaNumeric = minDiff;
          driverDetailSimple = `Disfrut\xF3 de una ampliaci\xF3n notable de minutos con ${g.minutes.toFixed(0)} MIN (+${minDiff.toFixed(0)}m vs media de ${minAvg.toFixed(0)}m en 2026-27) y sum\xF3 ${g.points} PTS.`;
        }
        explosions.push({
          playerId: p.id,
          playerName: p.name,
          teamAbbr: nightTeamAbbr,
          position: p.position,
          opponentAbbr: g.opponentAbbr,
          isHome: g.isHome,
          result: g.result,
          scoreDisplay: g.scoreDisplay,
          kind: "explosion",
          minutes: g.minutes,
          minutesAvg: minAvg,
          points: g.points,
          ptsAvg,
          ptsDelta,
          rebounds: g.rebounds,
          rebAvg,
          assists: g.assists,
          astAvg,
          stocks: nightStocks,
          turnovers: g.turnovers,
          fgm: g.fgm,
          fga: g.fga,
          fg3m: g.fg3m,
          fg3a: g.fg3a,
          fg3mAvg,
          tsPct: g.tsPct,
          tsAvg,
          usgEst: g.usgEst,
          usgAvg,
          gameScore: g.gameScore,
          gmScAvg,
          singleNightZ: maxZ,
          driverTag,
          triggerMetricKey,
          triggerMetricLabel,
          triggerNightDisplay,
          triggerBaselineDisplay,
          triggerDeltaDisplay,
          triggerDeltaNumeric,
          triggerIsPositive: true,
          triggerSeasonScope: "2026-27",
          driverDetailSimple,
          driverDetailAdvanced: `Z +${maxZ.toFixed(1)}\u03C3 \xB7 TS% ${g.tsPct.toFixed(1)}% (base 2026-27: ${tsAvg.toFixed(1)}%) \xB7 USG ${g.usgEst.toFixed(1)}% \xB7 GmSc ${g.gameScore.toFixed(1)}.`
        });
      }
      const isEstablishedStarter = minAvg >= cfg.starterMinMinutesAvg && (ptsAvg >= cfg.starterMinPointsAvg || rebAvg >= 8 || astAvg >= 5.5) && g.minutes >= 16;
      if (isEstablishedStarter) {
        const isFoulTrouble = (g.fouls >= cfg.slumpFoulsTroubleCount || g.fouls >= 4 && minDiff <= -cfg.slumpFoulsMinutesCut) && (ptsDelta <= -5 || g.gameScore <= 8);
        const isTurnoverDisaster = g.turnovers >= cfg.slumpTurnoversCount && g.turnovers - tovAvg >= cfg.slumpTurnoversDelta && (ptsDelta <= -4 || g.gameScore <= 8);
        const is3pDisaster = fg3mAvg >= cfg.slump3pSpecialistAvg && g.fg3a >= 5 && g.fg3m <= 1 && g.fg3m - fg3mAvg <= -cfg.slump3pDropDelta && ptsDelta <= -4;
        const isShootingSlump = (g.tsPct < cfg.slumpShootingMaxTsPct || tsDiff <= -cfg.slumpShootingTsDrop) && ptsDelta <= -5;
        const isAstBlackout = astAvg >= cfg.slumpAstFacilitatorAvg && g.assists - astAvg <= -cfg.slumpAstDropDelta && g.assists <= 3 && ptsDelta <= -4;
        const isRebBlackout = rebAvg >= cfg.slumpRebInteriorAvg && g.rebounds - rebAvg <= -cfg.slumpRebDropDelta && g.rebounds <= 4 && ptsDelta <= -4;
        const isMinutesCut = minDiff <= -cfg.slumpMinutesCutDelta && ptsDelta <= -6;
        const isScoringDrop = ptsDelta <= -cfg.slumpScoringDropPts;
        if (isFoulTrouble || isTurnoverDisaster || is3pDisaster || isShootingSlump || isAstBlackout || isRebBlackout || isMinutesCut || isScoringDrop) {
          let driverTag = "Frenado por la defensa";
          let triggerMetricKey = "points";
          let triggerMetricLabel = "Puntos";
          let triggerNightDisplay = `${g.points} PTS`;
          let triggerBaselineDisplay = `${ptsAvg.toFixed(1)} PTS`;
          let triggerDeltaDisplay = `${ptsDelta.toFixed(1)}`;
          let triggerDeltaNumeric = ptsDelta;
          let driverDetailSimple = `Se qued\xF3 en ${g.points} PTS (${ptsDelta.toFixed(1)} respecto a su media de ${ptsAvg.toFixed(1)} en 2026-27) con ${g.fgm}/${g.fga} en tiros.`;
          if (isFoulTrouble) {
            driverTag = "Lastrado por faltas";
            triggerMetricKey = "fouls";
            triggerMetricLabel = "Faltas / Minutos";
            triggerNightDisplay = `${g.fouls} Faltas (${g.minutes.toFixed(0)}m)`;
            triggerBaselineDisplay = `${foulsAvg.toFixed(1)} Faltas (${minAvg.toFixed(0)}m)`;
            const diffFouls = round14(g.fouls - foulsAvg);
            triggerDeltaDisplay = `+${diffFouls.toFixed(1)} faltas (${minDiff.toFixed(0)}m)`;
            triggerDeltaNumeric = diffFouls;
            driverDetailSimple = `Problemas de faltas (${g.fouls} personales) limitaron su minutaje a ${g.minutes.toFixed(0)} MIN (${minDiff.toFixed(0)}m vs media de ${minAvg.toFixed(0)}m), qued\xE1ndose en ${g.points} PTS.`;
          } else if (isTurnoverDisaster) {
            driverTag = "Sangr\xEDa de p\xE9rdidas";
            triggerMetricKey = "turnovers";
            triggerMetricLabel = "P\xE9rdidas de Bal\xF3n";
            triggerNightDisplay = `${g.turnovers} P\xE9rdidas`;
            triggerBaselineDisplay = `${tovAvg.toFixed(1)} TOV`;
            const diffTov = round14(g.turnovers - tovAvg);
            triggerDeltaDisplay = `+${diffTov.toFixed(1)} TOV`;
            triggerDeltaNumeric = diffTov;
            driverDetailSimple = `Cometi\xF3 ${g.turnovers} p\xE9rdidas (+${diffTov.toFixed(1)} vs media de ${tovAvg.toFixed(1)} en 2026-27), lastrando el ritmo de su equipo y qued\xE1ndose en ${g.points} PTS.`;
          } else if (is3pDisaster) {
            driverTag = "P\xF3lvora mojada desde el triple";
            triggerMetricKey = "fg3m";
            triggerMetricLabel = "Triples (3PM)";
            triggerNightDisplay = `${g.fg3m}/${g.fg3a} Triples`;
            triggerBaselineDisplay = `${fg3mAvg.toFixed(1)} 3PM`;
            const diff3p = round14(g.fg3m - fg3mAvg);
            triggerDeltaDisplay = `${diff3p.toFixed(1)} 3PM`;
            triggerDeltaNumeric = diff3p;
            driverDetailSimple = `Noche aciaga desde el per\xEDmetro con solo ${g.fg3m}/${g.fg3a} en triples (${diff3p.toFixed(1)} vs media de ${fg3mAvg.toFixed(1)} en 2026-27), sumando solo ${g.points} PTS.`;
          } else if (isShootingSlump) {
            driverTag = "Atasco en el tiro";
            triggerMetricKey = "tsPct";
            triggerMetricLabel = "Punter\xEDa (TS%)";
            triggerNightDisplay = `${g.tsPct.toFixed(1)}% TS`;
            triggerBaselineDisplay = `${tsAvg.toFixed(1)}%`;
            triggerDeltaDisplay = `${tsDiff.toFixed(1)} pp`;
            triggerDeltaNumeric = tsDiff;
            driverDetailSimple = `Se qued\xF3 en ${g.points} PTS (${ptsDelta.toFixed(1)} vs media de ${ptsAvg.toFixed(1)} en 2026-27) con solo ${g.tsPct.toFixed(1)}% TS (${tsDiff.toFixed(1)} pp vs media habitual de ${tsAvg.toFixed(1)}%, ${g.fgm}/${g.fga} TC).`;
          } else if (isAstBlackout) {
            driverTag = "Apag\xF3n en la direcci\xF3n";
            triggerMetricKey = "assists";
            triggerMetricLabel = "Asistencias";
            triggerNightDisplay = `${g.assists} AST`;
            triggerBaselineDisplay = `${astAvg.toFixed(1)} AST`;
            const diffAst = round14(g.assists - astAvg);
            triggerDeltaDisplay = `${diffAst.toFixed(1)} AST`;
            triggerDeltaNumeric = diffAst;
            driverDetailSimple = `Reparti\xF3 solo ${g.assists} asistencias (${diffAst.toFixed(1)} vs su media de ${astAvg.toFixed(1)} en 2026-27) y sum\xF3 ${g.points} PTS.`;
          } else if (isRebBlackout) {
            driverTag = "Superado en el cristal";
            triggerMetricKey = "rebounds";
            triggerMetricLabel = "Rebotes";
            triggerNightDisplay = `${g.rebounds} REB`;
            triggerBaselineDisplay = `${rebAvg.toFixed(1)} REB`;
            const diffReb = round14(g.rebounds - rebAvg);
            triggerDeltaDisplay = `${diffReb.toFixed(1)} REB`;
            triggerDeltaNumeric = diffReb;
            driverDetailSimple = `Captur\xF3 solo ${g.rebounds} rebotes (${diffReb.toFixed(1)} vs su media de ${rebAvg.toFixed(1)} en 2026-27) y sum\xF3 ${g.points} PTS.`;
          } else if (isMinutesCut) {
            driverTag = "Minutos recortados en rotaci\xF3n";
            triggerMetricKey = "minutes";
            triggerMetricLabel = "Minutos en Pista";
            triggerNightDisplay = `${g.minutes.toFixed(0)} MIN`;
            triggerBaselineDisplay = `${minAvg.toFixed(0)} MIN`;
            triggerDeltaDisplay = `${minDiff.toFixed(0)} MIN`;
            triggerDeltaNumeric = minDiff;
            driverDetailSimple = `Su presencia cay\xF3 a ${g.minutes.toFixed(0)} minutos (${minDiff.toFixed(0)}m vs media de ${minAvg.toFixed(0)}m), anotando solo ${g.points} PTS.`;
          }
          slumps.push({
            playerId: p.id,
            playerName: p.name,
            teamAbbr: nightTeamAbbr,
            position: p.position,
            opponentAbbr: g.opponentAbbr,
            isHome: g.isHome,
            result: g.result,
            scoreDisplay: g.scoreDisplay,
            kind: "slump",
            minutes: g.minutes,
            minutesAvg: minAvg,
            points: g.points,
            ptsAvg,
            ptsDelta,
            rebounds: g.rebounds,
            assists: g.assists,
            stocks: g.stocks,
            turnovers: g.turnovers,
            fgm: g.fgm,
            fga: g.fga,
            fg3m: g.fg3m,
            fg3a: g.fg3a,
            tsPct: g.tsPct,
            tsAvg,
            usgEst: g.usgEst,
            usgAvg,
            gameScore: g.gameScore,
            gmScAvg,
            singleNightZ: zPts,
            driverTag,
            triggerMetricKey,
            triggerMetricLabel,
            triggerNightDisplay,
            triggerBaselineDisplay,
            triggerDeltaDisplay,
            triggerDeltaNumeric,
            triggerIsPositive: false,
            triggerSeasonScope: "2026-27",
            driverDetailSimple,
            driverDetailAdvanced: `Z ${zPts.toFixed(1)}\u03C3 \xB7 TS% ${g.tsPct.toFixed(1)}% vs ${tsAvg.toFixed(1)}% en 2026-27 \xB7 USG ${g.usgEst.toFixed(1)}%.`
          });
        }
      }
      const minDelta = round14(g.minutes - minAvg);
      const usgDelta = round14(g.usgEst - usgAvg);
      if (minDelta >= 7.5 && g.minutes >= 24 || usgDelta >= 7.5 && g.minutes >= 20) {
        const shiftType = minDelta >= 6.5 && usgDelta >= 6 ? "dual_breakout" : minDelta >= 7.5 ? "minutes_spike" : "usage_spike";
        roleShifts.push({ playerId: p.id, playerName: p.name, teamAbbr: nightTeamAbbr, position: p.position, opponentAbbr: g.opponentAbbr, isHome: g.isHome, result: g.result, minutes: g.minutes, minutesAvg: minAvg, minutesDelta: minDelta, usgEst: g.usgEst, usgAvg, usgDelta, points: g.points, rebounds: g.rebounds, assists: g.assists, fga: g.fga, fgaAvg, gameScore: g.gameScore, shiftType, headlineSimple: `Salto a ${g.minutes.toFixed(0)} minutos (+${minDelta.toFixed(1)} vs media) con ${g.points} PTS y ${g.fga} tiros.`, headlineAdvanced: `${g.minutes.toFixed(0)} MIN (+${minDelta.toFixed(1)}) \xB7 ${g.usgEst.toFixed(1)}% USG (${usgDelta >= 0 ? "+" : ""}${usgDelta.toFixed(1)} pp) \xB7 ${g.fga} FGA (base ${fgaAvg.toFixed(1)}).` });
      }
    }
    const olderChrono = p.games.slice(nightIdx + 1);
    const streakRules = [
      { id: "pts25", label: "25+ PTS", unit: "PTS", minCount: 3, check: (x) => x.points >= 25, val: (x) => x.points },
      { id: "pts20", label: "20+ PTS", unit: "PTS", minCount: 4, check: (x) => x.points >= 20, val: (x) => x.points },
      { id: "pts_reb25", label: "25+ PTS+REB", unit: "P+R", minCount: 3, check: (x) => x.points + x.rebounds >= 25, val: (x) => x.points + x.rebounds },
      { id: "pts_ast24", label: "24+ PTS+AST", unit: "P+A", minCount: 3, check: (x) => x.points + x.assists >= 24, val: (x) => x.points + x.assists },
      { id: "pra30", label: "30+ PRA", unit: "PRA", minCount: 3, check: (x) => x.pra >= 30, val: (x) => x.pra },
      { id: "3pm3", label: "3+ 3PM", unit: "3PM", minCount: 4, check: (x) => x.fg3m >= 3, val: (x) => x.fg3m },
      { id: "3pm2", label: "2+ 3PM", unit: "3PM", minCount: 6, check: (x) => x.fg3m >= 2, val: (x) => x.fg3m },
      { id: "ast8", label: "8+ AST", unit: "AST", minCount: 3, check: (x) => x.assists >= 8, val: (x) => x.assists },
      { id: "reb10", label: "10+ REB", unit: "REB", minCount: 3, check: (x) => x.rebounds >= 10, val: (x) => x.rebounds }
    ];
    for (const sr of streakRules) {
      let priorCount = 0;
      const vals = [];
      for (const og of olderChrono) {
        if (sr.check(og)) {
          priorCount++;
          vals.push(sr.val(og));
        } else {
          break;
        }
      }
      const hitTonight = sr.check(g);
      if (hitTonight && priorCount + 1 >= sr.minCount) {
        vals.unshift(sr.val(g));
        streakShifts.push({ id: `${p.id}-${sr.id}-ext`, playerId: p.id, playerName: p.name, teamAbbr: nightTeamAbbr, position: p.position, opponentAbbr: g.opponentAbbr, isHome: g.isHome, status: "extended", thresholdLabel: sr.label, streakCount: priorCount + 1, nightValueDisplay: `${sr.val(g)} ${sr.unit}`, avgDuringStreak: round14(meanNums3(vals)), unit: sr.unit });
        break;
      } else if (!hitTonight && priorCount >= sr.minCount) {
        streakShifts.push({ id: `${p.id}-${sr.id}-brk`, playerId: p.id, playerName: p.name, teamAbbr: nightTeamAbbr, position: p.position, opponentAbbr: g.opponentAbbr, isHome: g.isHome, status: "broken", thresholdLabel: sr.label, streakCount: priorCount, nightValueDisplay: `${sr.val(g)} ${sr.unit}`, avgDuringStreak: round14(meanNums3(vals)), unit: sr.unit });
        break;
      }
    }
  }
  explosions.sort((a, b) => b.ptsDelta - a.ptsDelta);
  slumps.sort((a, b) => a.ptsDelta - b.ptsDelta);
  roleShifts.sort((a, b) => b.minutesDelta + b.usgDelta * 0.6 - (a.minutesDelta + a.usgDelta * 0.6));
  streakShifts.sort((a, b) => b.streakCount - a.streakCount);
  const rawMatchups = [];
  const recordUpTo = __name5((tm) => {
    const sl = tm.games.filter((x) => x.seasonLabel === seasonLabel && x.date.slice(0, 10) <= selectedDate);
    const w = sl.filter((x) => x.result === "W").length;
    return `${w}-${sl.length - w}`;
  }, "recordUpTo");
  for (const eventId of eventIdsSet) {
    let homeTeam;
    let homeLog;
    let awayTeam;
    let awayLog;
    const staticSched = staticScheduleByGameId.get(eventId);
    for (const tm of full.teams) {
      const gl = tm.games.find((x) => x.eventId === eventId);
      if (!gl) continue;
      const isHomeTeam = staticSched ? tm.abbreviation === staticSched.homeAbbr : gl.isHome;
      if (isHomeTeam) {
        homeTeam = tm;
        homeLog = { ...gl, isHome: true };
      } else {
        awayTeam = tm;
        awayLog = { ...gl, isHome: false };
      }
    }
    if (!homeTeam || !homeLog || !awayTeam || !awayLog) continue;
    const buildMatchSide = __name5((tm, lg, role) => {
      const rot = [...nightLinesByEventSide.get(`${eventId}:${role}`) || []].sort((a, b) => b.gameScore - a.gameScore || b.points - a.points);
      return { allRot: rot, side: { teamId: tm.id, abbr: tm.abbreviation, name: tm.name, shortName: tm.shortName, recordAfter: recordUpTo(tm), score: lg.pointsFor, isWinner: lg.result === "W", fg3m: lg.fg3m, fg3a: lg.fg3a, fg3Pct: lg.fg3Pct, efgPct: lg.efgPct, tsPct: lg.tsPct, reb: lg.reb, oreb: lg.oreb, orebPct: lg.orebPct, ast: lg.ast, tov: lg.tov, tovPct: lg.tovPct, ftm: lg.ftm, fta: lg.fta, offRtg: lg.offRtg, defRtg: lg.defRtg, netRtg: lg.netRtg, pace: lg.pace, isBackToBack: lg.isBackToBack, topPlayer: rot[0] || null, rotationPlayers: rot.slice(0, 8) } };
    }, "buildMatchSide");
    const awayBuilt = buildMatchSide(awayTeam, awayLog, "away");
    const homeBuilt = buildMatchSide(homeTeam, homeLog, "home");
    const awaySide = awayBuilt.side;
    const homeSide = homeBuilt.side;
    rawMatchups.push({ eventId, awayTeam, awayLog, awaySide, awayAllPlayers: awayBuilt.allRot, homeTeam, homeLog, homeSide, homeAllPlayers: homeBuilt.allRot, margin: Math.abs(awaySide.score - homeSide.score), totalPoints: awaySide.score + homeSide.score });
  }
  rawMatchups.sort((a, b) => a.margin - b.margin || b.totalPoints - a.totalPoints);
  const usedFamilyCounts = /* @__PURE__ */ new Map();
  const matchups = rawMatchups.map((rm) => {
    const { eventId, awayTeam, awayLog, awaySide, awayAllPlayers, homeTeam, homeLog, homeSide, homeAllPlayers, margin, totalPoints } = rm;
    const winner = awaySide.isWinner ? awaySide : homeSide;
    const loser = awaySide.isWinner ? homeSide : awaySide;
    const winnerLog = awaySide.isWinner ? awayLog : homeLog;
    const loserLog = awaySide.isWinner ? homeLog : awayLog;
    const winnerTeam = awaySide.isWinner ? awayTeam : homeTeam;
    const loserTeam = awaySide.isWinner ? homeTeam : awayTeam;
    const winnerPlayers = awaySide.isWinner ? awayAllPlayers : homeAllPlayers;
    const loserPlayers = awaySide.isWinner ? homeAllPlayers : awayAllPlayers;
    let contextTag = "Duelo de temporada regular";
    let contextTone = "slate";
    if (margin <= 3) {
      contextTag = "Final de infarto (Clutch)";
      contextTone = "amber";
    } else if (margin <= 6) {
      contextTag = "Desenlace apretado";
      contextTone = "amber";
    } else if (awaySide.isWinner && margin >= 14) {
      contextTag = "Golpe visitante";
      contextTone = "emerald";
    } else if (margin >= 18) {
      contextTag = "Dominio contundente";
      contextTone = "emerald";
    } else if (awaySide.isWinner && winner.isBackToBack && !loser.isBackToBack) {
      contextTag = "Asalto visitante en B2B";
      contextTone = "emerald";
    } else if (awaySide.isWinner && margin >= 9) {
      contextTag = "Triunfo a domicilio";
      contextTone = "slate";
    } else if (totalPoints >= 246) {
      contextTag = "Duelo de alto voltaje";
      contextTone = "slate";
    } else if (totalPoints <= 204) {
      contextTag = "Batalla defensiva";
      contextTone = "slate";
    }
    const keys = buildIndividualMatchupKeys({ awaySide, homeSide, winner, loser, winnerLog, loserLog, winnerTeam, loserTeam, winnerPlayers, loserPlayers, roleShifts, streakShifts, usedFamilyCounts });
    return { eventId, date: selectedDate, seasonLabel, contextTag, contextTone, margin, totalPoints, pace: homeLog.pace, away: awaySide, home: homeSide, keyTakeawaysSimple: keys.simple, keyTakeawaysAdvanced: keys.advanced };
  });
  const sortedByGmSc = [...allNightLines].sort((a, b) => b.gameScore - a.gameScore || b.points - a.points);
  const idealFive = sortedByGmSc.slice(0, 5);
  const mvpOfTheNight = idealFive[0] || null;
  let statementTeamWin = null;
  if (matchups.length > 0) {
    const bestWinMatch = [...matchups].sort((a, b) => {
      const wA = a.away.isWinner ? a.away : a.home;
      const wB = b.away.isWinner ? b.away : b.home;
      const scoreA = wA.netRtg + (a.away.isWinner ? 3.5 : 0);
      const scoreB = wB.netRtg + (b.away.isWinner ? 3.5 : 0);
      return scoreB - scoreA;
    })[0];
    const wSide = bestWinMatch.away.isWinner ? bestWinMatch.away : bestWinMatch.home;
    const lSide = bestWinMatch.away.isWinner ? bestWinMatch.home : bestWinMatch.away;
    statementTeamWin = { teamId: wSide.teamId, teamAbbr: wSide.abbr, teamName: wSide.name, opponentAbbr: lSide.abbr, isHome: !bestWinMatch.away.isWinner, scoreDisplay: `${bestWinMatch.away.score}-${bestWinMatch.home.score}`, margin: bestWinMatch.margin, netRtg: wSide.netRtg, efgPct: wSide.efgPct, summarySimple: `+${bestWinMatch.margin} pts (${bestWinMatch.away.score}-${bestWinMatch.home.score}) ante ${lSide.shortName} con ${wSide.efgPct.toFixed(1)}% eFG`, summaryAdvanced: `NetRtg +${wSide.netRtg.toFixed(1)} \xB7 OffRtg ${wSide.offRtg.toFixed(1)} \xB7 ${wSide.efgPct.toFixed(1)}% eFG (${bestWinMatch.away.score}-${bestWinMatch.home.score} vs ${lSide.abbr})` };
  }
  const gamesCount = matchups.length;
  const avgTotalPoints = gamesCount > 0 ? round14(meanNums3(matchups.map((m) => m.totalPoints))) : leagueAvgTotalPoints;
  const avgPace = gamesCount > 0 ? round14(meanNums3(matchups.map((m) => m.pace))) : 99.6;
  return { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), dataSource: full.s2027.dataSource, selectedDate, seasonLabel, availableDates, pulse: { gamesCount, avgTotalPoints, leagueAvgTotalPoints, closeGamesCount: matchups.filter((m) => m.margin <= 5).length, blowoutsCount: matchups.filter((m) => m.margin >= 15).length, roadWinsCount: matchups.filter((m) => m.away.isWinner).length, avgPace }, mvpOfTheNight, topExplosion: explosions[0] || null, statementTeamWin, idealFive, matchups, explosions: explosions.slice(0, 12), slumps: slumps.slice(0, 12), roleShifts: roleShifts.slice(0, 12), streakShifts: streakShifts.slice(0, 16), liveOrScheduledToday };
}
var cachedMilestones = null;
async function getMilestonesPayload(forceRefresh = false) {
  if (!forceRefresh && cachedMilestones && cachedMilestones.expiresAt > Date.now()) {
    return cachedMilestones.payload;
  }
  const full = await getFullLeagueMemory(forceRefresh);
  const t27 = [...full.s2027.teamsByAbbr.values()];
  const t26 = [...full.s2026.teamsByAbbr.values()];
  const p27 = [...full.s2027.playersById.values()];
  const p26 = [...full.s2026.playersById.values()];
  const avgGp27 = Math.max(1, Math.round(meanNums3(t27.map((t) => t.games.length))));
  const buildGlobalSnap = __name5((label, teamsList, maxGamesChrono) => {
    const allLogs = [];
    for (const tm of teamsList) {
      const chrono = [...tm.games].reverse();
      const slice = maxGamesChrono ? chrono.slice(0, maxGamesChrono) : chrono;
      allLogs.push(...slice);
    }
    const homeLogs = allLogs.filter((g) => g.isHome);
    const gamesCount = homeLogs.length;
    const avgPtsPaint = round14(meanNums3(teamsList.map((t) => t.advanced?.ptsPaint || 0).filter((v) => v > 0)) || 48.4);
    const avgPts2nd = round14(meanNums3(teamsList.map((t) => t.advanced?.pts2ndChance || 0).filter((v) => v > 0)) || 14.1);
    const avgPtsFb = round14(meanNums3(teamsList.map((t) => t.advanced?.ptsFastBreak || 0).filter((v) => v > 0)) || 15.2);
    return { seasonLabel: label, gamesCount, avgTeamPoints: round14(meanNums3(allLogs.map((g) => g.pointsFor))), avgTotalGamePoints: round14(meanNums3(homeLogs.map((g) => g.totalPoints))), avgMargin: round14(meanNums3(homeLogs.map((g) => Math.abs(g.differential)))), homeWinPct: gamesCount > 0 ? round14(homeLogs.filter((g) => g.result === "W").length / gamesCount * 100) : 54, closeGamesPct: gamesCount > 0 ? round14(homeLogs.filter((g) => Math.abs(g.differential) <= 5).length / gamesCount * 100) : 28, blowoutGamesPct: gamesCount > 0 ? round14(homeLogs.filter((g) => Math.abs(g.differential) >= 15).length / gamesCount * 100) : 31, avgTeam3PM: round14(meanNums3(allLogs.map((g) => g.fg3m))), avgTeam3Pct: round14(meanNums3(allLogs.map((g) => g.fg3Pct))), avgTeamORB: round14(meanNums3(allLogs.map((g) => g.oreb))), avgTeamREB: round14(meanNums3(allLogs.map((g) => g.reb))), avgTeamAST: round14(meanNums3(allLogs.map((g) => g.ast))), avgPace: round14(meanNums3(allLogs.map((g) => g.pace))), avgOffRtg: round14(meanNums3(allLogs.map((g) => g.offRtg))), avgEfgPct: round14(meanNums3(allLogs.map((g) => g.efgPct))), avgTsPct: round14(meanNums3(allLogs.map((g) => g.tsPct))), avgOrebPct: round14(meanNums3(allLogs.map((g) => g.orebPct))), avgTovPct: round14(meanNums3(allLogs.map((g) => g.tovPct))), avgPtsPaint, avgPts2ndChance: avgPts2nd, avgPtsFastBreak: avgPtsFb };
  }, "buildGlobalSnap");
  const sampleDates26 = [];
  for (const tm of t26) {
    const chrono = [...tm.games].reverse();
    if (chrono.length > 0) {
      const idx = Math.min(chrono.length - 1, avgGp27 - 1);
      sampleDates26.push(chrono[idx].date);
    }
  }
  sampleDates26.sort();
  const openingCutoff26 = sampleDates26[Math.floor(sampleDates26.length / 2)] || "2025-11-05";
  const pickBestPlayerGame = __name5((pool, getter, opts) => {
    let best = null;
    let bestTieBreak = -Infinity;
    const dec = opts?.decimals ?? 1;
    const roundFn = dec >= 2 ? round22 : round14;
    for (const p of pool) {
      for (const g of p.games) {
        if (opts?.maxDate && g.date > opts.maxDate) continue;
        if (opts?.qualifies && !opts.qualifies(g)) continue;
        const rawVal = getter(g);
        if (!Number.isFinite(rawVal)) continue;
        const val = dec === 0 ? Math.round(rawVal) : roundFn(rawVal);
        const tie = g.gameScore;
        const isBetter = !best ? true : opts?.lowerIsBetter ? val < best.value || val === best.value && tie > bestTieBreak : val > best.value || val === best.value && tie > bestTieBreak;
        if (isBetter) {
          bestTieBreak = tie;
          const gameTeamAbbr = g.teamAbbr || p.teamAbbr;
          const extra = opts?.extraContext ? opts.extraContext(g) : "";
          best = { entityId: p.id, entityName: p.name, teamAbbr: gameTeamAbbr, value: val, context: `${g.isHome ? "vs" : "@"} ${g.opponentAbbr} (${g.result}${g.scoreDisplay ? ` ${g.scoreDisplay}` : ""})${extra ? ` \xB7 ${extra}` : ""}`, date: g.date };
        }
      }
    }
    return best;
  }, "pickBestPlayerGame");
  const pickBestTeamGame = __name5((pool, getter, opts) => {
    let best = null;
    let bestTieBreak = -Infinity;
    const dec = opts?.decimals ?? 1;
    const roundFn = dec >= 2 ? round22 : round14;
    for (const t of pool) {
      for (const g of t.games) {
        if (opts?.maxDate && g.date > opts.maxDate) continue;
        if (opts?.qualifies && !opts.qualifies(g)) continue;
        const rawVal = getter(g);
        if (!Number.isFinite(rawVal)) continue;
        const val = dec === 0 ? Math.round(rawVal) : roundFn(rawVal);
        const tie = g.differential;
        const isBetter = !best ? true : opts?.lowerIsBetter ? val < best.value || val === best.value && tie > bestTieBreak : val > best.value || val === best.value && tie > bestTieBreak;
        if (isBetter) {
          bestTieBreak = tie;
          const extra = opts?.extraContext ? opts.extraContext(g) : "";
          best = { entityId: t.id, entityName: t.name, teamAbbr: t.abbreviation, value: val, context: `${g.isHome ? "vs" : "@"} ${g.opponentAbbr} (${g.pointsFor}-${g.pointsAgainst})${extra ? ` \xB7 ${extra}` : ""}`, date: g.date };
        }
      }
    }
    return best;
  }, "pickBestTeamGame");
  const makePlayerSG = __name5((metricId, metricLabel, subGroup, unit, getter, opts) => {
    const decimals = opts?.decimals ?? 0;
    return { metricId, metricLabel, category: "player", subGroup, unit, decimals, lowerIsBetter: opts?.lowerIsBetter, current2027: pickBestPlayerGame(p27, getter, { ...opts, decimals }), prev2026Full: pickBestPlayerGame(p26, getter, { ...opts, decimals }), prev2026Opening: pickBestPlayerGame(p26, getter, { ...opts, decimals, maxDate: openingCutoff26 }) };
  }, "makePlayerSG");
  const makeTeamSG = __name5((metricId, metricLabel, subGroup, unit, getter, opts) => {
    const decimals = opts?.decimals ?? 0;
    return { metricId, metricLabel, category: "team", subGroup, unit, decimals, lowerIsBetter: opts?.lowerIsBetter, current2027: pickBestTeamGame(t27, getter, { ...opts, decimals }), prev2026Full: pickBestTeamGame(t26, getter, { ...opts, decimals }), prev2026Opening: pickBestTeamGame(t26, getter, { ...opts, decimals, maxDate: openingCutoff26 }) };
  }, "makeTeamSG");
  const singleGameRecords = [makePlayerSG("sg-player-pts", "M\xE1xima anotaci\xF3n individual en un partido", "scoring", "PTS", (g) => g.points), makePlayerSG("sg-player-fgm", "M\xE1s tiros de campo anotados por un jugador", "scoring", "TCM", (g) => g.fgm, { extraContext: __name5((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makePlayerSG("sg-player-fga", "M\xE1s tiros de campo intentados por un jugador", "scoring", "TCI", (g) => g.fga, { extraContext: __name5((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makePlayerSG("sg-player-fg2m", "M\xE1s canastas de 2 puntos anotadas en una noche", "scoring", "T2M", (g) => Math.max(0, g.fgm - g.fg3m), { extraContext: __name5((g) => `${Math.max(0, g.fgm - g.fg3m)}/${Math.max(0, g.fga - g.fg3a)} T2`, "extraContext") }), makePlayerSG("sg-player-3pm", "M\xE1s triples anotados por un jugador en un partido", "scoring", "3PM", (g) => g.fg3m, { extraContext: __name5((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makePlayerSG("sg-player-3pa", "M\xE1s triples intentados por un jugador en una noche", "scoring", "3PA", (g) => g.fg3a, { extraContext: __name5((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makePlayerSG("sg-player-ftm", "M\xE1s tiros libres anotados por un jugador", "scoring", "TLM", (g) => g.ftm, { extraContext: __name5((g) => `${g.ftm}/${g.fta} TL`, "extraContext") }), makePlayerSG("sg-player-fta", "M\xE1s tiros libres intentados por un jugador", "scoring", "TLI", (g) => g.fta, { extraContext: __name5((g) => `${g.ftm}/${g.fta} TL`, "extraContext") }), makePlayerSG("sg-player-ft-perfect", "M\xE1s tiros libres encestados sin fallo (100% TL)", "scoring", "TLM", (g) => g.ftm, { qualifies: __name5((g) => g.fta >= 8 && g.ftm === g.fta, "qualifies"), extraContext: __name5((g) => `${g.ftm}/${g.fta} TL`, "extraContext") }), makePlayerSG("sg-player-fgpct", "Mejor % en tiros de campo en una noche (m\xEDn. 12 TCI)", "scoring", "%", (g) => g.fgPct, { decimals: 1, qualifies: __name5((g) => g.fga >= 12, "qualifies"), extraContext: __name5((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makePlayerSG("sg-player-3ppct", "Mejor % en triples en una noche (m\xEDn. 7 intentos)", "scoring", "%", (g) => g.fg3Pct, { decimals: 1, qualifies: __name5((g) => g.fg3a >= 7, "qualifies"), extraContext: __name5((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makePlayerSG("sg-player-ts", "Mayor eficiencia True Shooting en una noche (m\xEDn. 20 PTS)", "scoring", "%", (g) => g.tsPct, { decimals: 1, qualifies: __name5((g) => g.points >= 20 && g.fga >= 8, "qualifies"), extraContext: __name5((g) => `${g.points} PTS`, "extraContext") }), makePlayerSG("sg-player-efg", "Mayor tiro efectivo eFG% individual (m\xEDn. 12 TCI)", "scoring", "%", (g) => g.efgPct, { decimals: 1, qualifies: __name5((g) => g.fga >= 12, "qualifies"), extraContext: __name5((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makePlayerSG("sg-player-reb", "M\xE1ximos rebotes totales individuales en una noche", "playmaking_reb", "REB", (g) => g.rebounds, { extraContext: __name5((g) => `${g.oreb} OR + ${g.dreb} DR`, "extraContext") }), makePlayerSG("sg-player-oreb", "M\xE1ximos rebotes ofensivos individuales en un partido", "playmaking_reb", "OR", (g) => g.oreb), makePlayerSG("sg-player-dreb", "M\xE1ximos rebotes defensivos individuales en un partido", "playmaking_reb", "DR", (g) => g.dreb), makePlayerSG("sg-player-ast", "M\xE1ximas asistencias repartidas en un partido", "playmaking_reb", "AST", (g) => g.assists, { extraContext: __name5((g) => `${g.turnovers} PER`, "extraContext") }), makePlayerSG("sg-player-ast-notov", "M\xE1s asistencias repartidas sin ninguna p\xE9rdida (0 PER)", "playmaking_reb", "AST", (g) => g.assists, { qualifies: __name5((g) => g.turnovers === 0 && g.assists >= 6, "qualifies"), extraContext: __name5(() => "0 p\xE9rdidas", "extraContext") }), makePlayerSG("sg-player-pra", "Mayor producci\xF3n combinada PRA (PTS+REB+AST)", "playmaking_reb", "PRA", (g) => g.pra, { extraContext: __name5((g) => `${g.points}+${g.rebounds}+${g.assists}`, "extraContext") }), makePlayerSG("sg-player-stl", "M\xE1s robos de bal\xF3n individuales en un partido", "defense", "ROB", (g) => g.steals), makePlayerSG("sg-player-blk", "M\xE1s tapones colocados por un jugador en una noche", "defense", "TAP", (g) => g.blocks), makePlayerSG("sg-player-stocks", "M\xE1s acciones defensivas Stocks (Robos + Tapones)", "defense", "STK", (g) => g.stocks, { extraContext: __name5((g) => `${g.steals} ROB + ${g.blocks} TAP`, "extraContext") }), makePlayerSG("sg-player-tov", "M\xE1s p\xE9rdidas cometidas por un jugador en una noche", "defense", "PER", (g) => g.turnovers), makePlayerSG("sg-player-gmsc", "Mayor Valoraci\xF3n Hollinger (Game Score) en una noche", "impact", "GmSc", (g) => g.gameScore, { decimals: 1, extraContext: __name5((g) => `${g.points}p/${g.rebounds}r/${g.assists}a`, "extraContext") }), makePlayerSG("sg-player-pm", "Mejor impacto M\xE1s/Menos (+/-) individual en pista", "impact", "+/-", (g) => g.plusMinus), makePlayerSG("sg-player-usg", "Mayor Uso Ofensivo (USG%) en una noche (m\xEDn. 20 MIN)", "impact", "%", (g) => g.usgEst, { decimals: 1, qualifies: __name5((g) => g.minutes >= 20, "qualifies"), extraContext: __name5((g) => `${g.fga} TCI`, "extraContext") }), makePlayerSG("sg-player-min", "M\xE1s minutos disputados por un jugador en un partido", "impact", "MIN", (g) => g.minutes, { decimals: 1 }), makeTeamSG("sg-team-pts", "M\xE1xima anotaci\xF3n colectiva de un equipo", "scoring", "PTS", (g) => g.pointsFor), makeTeamSG("sg-team-total", "Partido con mayor marcador combinado (ambos equipos)", "scoring", "PTS", (g) => g.totalPoints, { qualifies: __name5((g) => g.result === "W", "qualifies") }), makeTeamSG("sg-team-fgm", "M\xE1s tiros de campo anotados por un equipo", "scoring", "TCM", (g) => g.fgm, { extraContext: __name5((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makeTeamSG("sg-team-fgpct", "Mejor % de tiro de campo colectivo en un partido", "scoring", "%", (g) => g.fgPct, { decimals: 1, extraContext: __name5((g) => `${g.fgm}/${g.fga} TC`, "extraContext") }), makeTeamSG("sg-team-3pm", "M\xE1s triples anotados por un equipo en una noche", "scoring", "3PM", (g) => g.fg3m, { extraContext: __name5((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makeTeamSG("sg-team-3pa", "M\xE1s triples intentados por un equipo en una noche", "scoring", "3PA", (g) => g.fg3a, { extraContext: __name5((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makeTeamSG("sg-team-3ppct", "Mejor % en triples colectivo (m\xEDn. 25 intentos)", "scoring", "%", (g) => g.fg3Pct, { decimals: 1, qualifies: __name5((g) => g.fg3a >= 25, "qualifies"), extraContext: __name5((g) => `${g.fg3m}/${g.fg3a} T3`, "extraContext") }), makeTeamSG("sg-team-ftm", "M\xE1s tiros libres anotados por un equipo", "scoring", "TLM", (g) => g.ftm, { extraContext: __name5((g) => `${g.ftm}/${g.fta} TL`, "extraContext") }), makeTeamSG("sg-team-efg", "Mayor Tiro Efectivo (eFG%) colectivo en una noche", "scoring", "%", (g) => g.efgPct, { decimals: 1 }), makeTeamSG("sg-team-ts", "Mayor True Shooting (TS%) colectivo en una noche", "scoring", "%", (g) => g.tsPct, { decimals: 1 }), makeTeamSG("sg-team-reb", "M\xE1s rebotes totales capturados por un equipo", "playmaking_reb", "REB", (g) => g.reb, { extraContext: __name5((g) => `${g.oreb} OR + ${g.dreb} DR`, "extraContext") }), makeTeamSG("sg-team-oreb", "M\xE1s rebotes ofensivos de un equipo en una noche", "playmaking_reb", "OR", (g) => g.oreb), makeTeamSG("sg-team-dreb", "M\xE1s rebotes defensivos de un equipo en una noche", "playmaking_reb", "DR", (g) => g.dreb), makeTeamSG("sg-team-ast", "M\xE1s asistencias colectivas repartidas en un partido", "playmaking_reb", "AST", (g) => g.ast), makeTeamSG("sg-team-stl", "M\xE1s robos de bal\xF3n colectivos en un partido", "defense", "ROB", (g) => g.stl), makeTeamSG("sg-team-blk", "M\xE1s tapones colectivos en un partido", "defense", "TAP", (g) => g.blk), makeTeamSG("sg-team-stocks", "M\xE1s robos + tapones colectivos en una noche", "defense", "STK", (g) => g.stl + g.blk, { extraContext: __name5((g) => `${g.stl} ROB + ${g.blk} TAP`, "extraContext") }), makeTeamSG("sg-team-opp-pts-low", "Menor anotaci\xF3n permitida al rival en un partido", "defense", "PTS", (g) => g.pointsAgainst, { lowerIsBetter: true, qualifies: __name5((g) => g.pointsAgainst > 50, "qualifies") }), makeTeamSG("sg-team-tov-low", "Menos p\xE9rdidas cometidas por un equipo en un partido", "defense", "PER", (g) => g.tov, { lowerIsBetter: true }), makeTeamSG("sg-team-defrtg", "Mejor Eficiencia Defensiva (DefRtg) en una noche", "defense", "RTG", (g) => g.defRtg, { decimals: 1, lowerIsBetter: true, qualifies: __name5((g) => g.defRtg > 60, "qualifies") }), makeTeamSG("sg-team-margin", "Mayor diferencia de puntos lograda en una victoria", "impact", "PTS", (g) => g.differential), makeTeamSG("sg-team-offrtg", "Mejor Eficiencia Ofensiva (OffRtg) en una noche", "impact", "RTG", (g) => g.offRtg, { decimals: 1 }), makeTeamSG("sg-team-netrtg", "Mayor Dominio Neto (NetRtg) en un partido", "impact", "RTG", (g) => g.netRtg, { decimals: 1 }), makeTeamSG("sg-team-pace", "Partido disputado a mayor ritmo de posesiones (Pace)", "impact", "POS", (g) => g.pace, { decimals: 1, qualifies: __name5((g) => g.result === "W", "qualifies") })];
  const resolvePlayerSliceTeam = __name5((slice, fallbackAbbr) => {
    const primary = slice[0]?.teamAbbr || fallbackAbbr;
    const chrono = [...slice].reverse();
    const seen = [];
    for (const g of chrono) {
      const ab = g.teamAbbr || fallbackAbbr;
      if (ab && !seen.includes(ab)) seen.push(ab);
    }
    return { teamAbbr: primary, stintNote: seen.length > 1 ? `${seen.join("/")} \xB7 ` : "" };
  }, "resolvePlayerSliceTeam");
  const countDoubleDoubles = __name5((gs) => gs.reduce((acc, g) => {
    let tens = 0;
    if (g.points >= 10) tens++;
    if (g.rebounds >= 10) tens++;
    if (g.assists >= 10) tens++;
    if (g.steals >= 10) tens++;
    if (g.blocks >= 10) tens++;
    return acc + (tens >= 2 ? 1 : 0);
  }, 0), "countDoubleDoubles");
  const countTripleDoubles = __name5((gs) => gs.reduce((acc, g) => {
    let tens = 0;
    if (g.points >= 10) tens++;
    if (g.rebounds >= 10) tens++;
    if (g.assists >= 10) tens++;
    if (g.steals >= 10) tens++;
    if (g.blocks >= 10) tens++;
    return acc + (tens >= 3 ? 1 : 0);
  }, 0), "countTripleDoubles");
  const avgGp26 = Math.max(1, Math.round(meanNums3(t26.map((t) => t.games.length))));
  const minGp27 = Math.max(2, Math.min(45, Math.floor(avgGp27 * 0.55)));
  const minGp26Full = Math.max(10, Math.min(45, Math.floor(avgGp26 * 0.55)));
  const minGp26Open = Math.max(2, Math.min(45, Math.floor(avgGp27 * 0.55)));
  const pickPlayerSliceLeader = __name5((pool, minGames, getter, opts) => {
    const minMin = opts?.minMinutesAvg ?? (opts?.isTotal ? 0 : 16);
    const dec = opts?.decimals ?? 1;
    const roundFn = dec >= 2 ? round22 : dec === 0 ? Math.round : round14;
    let best = null;
    let bestTie = -Infinity;
    for (const p of pool) {
      const slice = opts?.maxDate ? p.games.filter((g) => g.date <= opts.maxDate) : p.games;
      if (slice.length < minGames) continue;
      if (minMin > 0 && meanNums3(slice.map((g) => g.minutes)) < minMin) continue;
      const rawVal = getter(slice, p);
      if (rawVal === null || !Number.isFinite(rawVal)) continue;
      const val = roundFn(rawVal);
      if (opts?.isTotal && val <= 0) continue;
      const tie = slice.length;
      const isBetter = !best ? true : opts?.lowerIsBetter ? val < best.value || val === best.value && tie > bestTie : val > best.value || val === best.value && tie > bestTie;
      if (isBetter) {
        bestTie = tie;
        const { teamAbbr, stintNote } = resolvePlayerSliceTeam(slice, p.teamAbbr);
        const extra = opts?.extraSecondary ? opts.extraSecondary(slice, p) : "";
        best = { entityId: p.id, entityName: p.name, teamAbbr, value: val, secondaryLabel: `${stintNote}${slice.length} PJ${extra ? ` \xB7 ${extra}` : ""}` };
      }
    }
    return best;
  }, "pickPlayerSliceLeader");
  const makePlayerSL = __name5((metricId, metricLabel, group, unit, decimals, getter, opts) => {
    const isTotal = Boolean(opts?.isCumulativeTotal);
    return { metricId, metricLabel, group, entityType: "player", unit, decimals, isCumulativeTotal: isTotal, lowerIsBetter: opts?.lowerIsBetter, current2027: pickPlayerSliceLeader(p27, isTotal ? 1 : minGp27, getter, { decimals, minMinutesAvg: opts?.minMinutesAvg, lowerIsBetter: opts?.lowerIsBetter, isTotal, extraSecondary: opts?.extraSecondary }), prev2026Full: pickPlayerSliceLeader(p26, isTotal ? 1 : minGp26Full, getter, { decimals, minMinutesAvg: opts?.minMinutesAvg, lowerIsBetter: opts?.lowerIsBetter, isTotal, extraSecondary: opts?.extraSecondary }), prev2026Opening: pickPlayerSliceLeader(p26, isTotal ? 1 : minGp26Open, getter, { maxDate: openingCutoff26, decimals, minMinutesAvg: opts?.minMinutesAvg, lowerIsBetter: opts?.lowerIsBetter, isTotal, extraSecondary: opts?.extraSecondary }) };
  }, "makePlayerSL");
  const makePlayerAdvSL = __name5((metricId, metricLabel, group, unit, decimals, advGetter, opts) => {
    const minMin = opts?.minMinutesAvg ?? 18;
    const pickAdv = __name5((pool, minGames, maxDate) => {
      let best = null;
      for (const p of pool) {
        if (!p.advanced) continue;
        const slice = maxDate ? p.games.filter((g) => g.date <= maxDate) : p.games;
        if (slice.length < minGames) continue;
        if (meanNums3(slice.map((g) => g.minutes)) < minMin) continue;
        const raw = advGetter(p.advanced);
        if (!Number.isFinite(raw) || raw <= 0) continue;
        const val = decimals >= 2 ? round22(raw) : round14(raw);
        const isBetter = !best ? true : opts?.lowerIsBetter ? val < best.value : val > best.value;
        if (isBetter) {
          const { teamAbbr, stintNote } = resolvePlayerSliceTeam(slice, p.teamAbbr);
          best = { entityId: p.id, entityName: p.name, teamAbbr, value: val, secondaryLabel: maxDate ? `${stintNote}${slice.length} PJ (perfil 25-26)` : `${stintNote}${p.advanced.gp || slice.length} PJ` };
        }
      }
      return best;
    }, "pickAdv");
    return { metricId, metricLabel, group, entityType: "player", unit, decimals, lowerIsBetter: opts?.lowerIsBetter, current2027: pickAdv(p27, minGp27), prev2026Full: pickAdv(p26, minGp26Full), prev2026Opening: pickAdv(p26, minGp26Open, openingCutoff26) };
  }, "makePlayerAdvSL");
  const makeTeamSL = __name5((metricId, metricLabel, unit, decimals, getter, opts) => {
    const pickTeam = __name5((pool, maxDate) => {
      let best = null;
      const roundFn = decimals >= 2 ? round22 : decimals === 0 ? Math.round : round14;
      for (const t of pool) {
        const slice = maxDate ? t.games.filter((g) => g.date <= maxDate) : t.games;
        if (slice.length === 0) continue;
        const raw = getter(slice, t, Boolean(maxDate));
        if (raw === null || !Number.isFinite(raw)) continue;
        const val = roundFn(raw);
        const isBetter = !best ? true : opts?.lowerIsBetter ? val < best.value : val > best.value;
        if (isBetter) {
          const wins = slice.filter((g) => g.result === "W").length;
          const losses = slice.length - wins;
          best = { entityId: t.id, entityName: t.name, teamAbbr: t.abbreviation, value: val, secondaryLabel: `Balance ${wins}-${losses} (${slice.length} PJ)` };
        }
      }
      return best;
    }, "pickTeam");
    return { metricId, metricLabel, group: "team_leaders", entityType: "team", unit, decimals, lowerIsBetter: opts?.lowerIsBetter, current2027: pickTeam(t27), prev2026Full: pickTeam(t26), prev2026Opening: pickTeam(t26, openingCutoff26) };
  }, "makeTeamSL");
  const seasonLeaders = [makePlayerSL("sl-player-pts-avg", "Puntos por partido (PPG)", "shooting_scoring", "PTS", 1, (gs) => meanNums3(gs.map((g) => g.points)), { extraSecondary: __name5((gs) => `${gs.reduce((s, g) => s + g.points, 0)} PTS tot.`, "extraSecondary") }), makePlayerSL("sl-player-pts-tot", "Puntos totales acumulados", "shooting_scoring", "PTS", 0, (gs) => gs.reduce((s, g) => s + g.points, 0), { isCumulativeTotal: true, extraSecondary: __name5((gs) => `${round14(meanNums3(gs.map((g) => g.points))).toFixed(1)} PTS/PJ`, "extraSecondary") }), makePlayerSL("sl-player-pts36", "Puntos por cada 36 minutos (PTS/36m)", "shooting_scoring", "PTS", 1, (gs) => {
    const min = gs.reduce((s, g) => s + g.minutes, 0);
    const pts = gs.reduce((s, g) => s + g.points, 0);
    return min >= gs.length * 18 ? pts / min * 36 : null;
  }, { minMinutesAvg: 20 }), makePlayerSL("sl-player-fgm-avg", "Tiros de campo anotados por partido (FGM)", "shooting_scoring", "TCM", 1, (gs) => meanNums3(gs.map((g) => g.fgm))), makePlayerSL("sl-player-fgm-tot", "Tiros de campo totales anotados", "shooting_scoring", "TCM", 0, (gs) => gs.reduce((s, g) => s + g.fgm, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-fga-avg", "Tiros de campo intentados por partido (FGA)", "shooting_scoring", "TCI", 1, (gs) => meanNums3(gs.map((g) => g.fga))), makePlayerSL("sl-player-fgpct", "% Acierto en tiros de campo (FG%, m\xEDn. 7 TCI/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const fgm = gs.reduce((s, g) => s + g.fgm, 0);
    const fga = gs.reduce((s, g) => s + g.fga, 0);
    return fga >= gs.length * 7 ? fgm / fga * 100 : null;
  }, { extraSecondary: __name5((gs) => `${gs.reduce((s, g) => s + g.fgm, 0)}/${gs.reduce((s, g) => s + g.fga, 0)} TC`, "extraSecondary") }), makePlayerSL("sl-player-fg2m-avg", "Tiros de 2 puntos anotados por partido (2PM)", "shooting_scoring", "T2M", 1, (gs) => meanNums3(gs.map((g) => Math.max(0, g.fgm - g.fg3m)))), makePlayerSL("sl-player-fg2pct", "% Acierto en tiros de 2 puntos (2P%, m\xEDn. 5 T2I/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const fg2m = gs.reduce((s, g) => s + Math.max(0, g.fgm - g.fg3m), 0);
    const fg2a = gs.reduce((s, g) => s + Math.max(0, g.fga - g.fg3a), 0);
    return fg2a >= gs.length * 5 ? fg2m / fg2a * 100 : null;
  }, { extraSecondary: __name5((gs) => `${gs.reduce((s, g) => s + Math.max(0, g.fgm - g.fg3m), 0)}/${gs.reduce((s, g) => s + Math.max(0, g.fga - g.fg3a), 0)} T2`, "extraSecondary") }), makePlayerSL("sl-player-3pm-avg", "Triples anotados por partido (3PM)", "shooting_scoring", "3PM", 1, (gs) => meanNums3(gs.map((g) => g.fg3m)), { extraSecondary: __name5((gs) => `${gs.reduce((s, g) => s + g.fg3m, 0)} triples tot.`, "extraSecondary") }), makePlayerSL("sl-player-3pm-tot", "Triples totales acumulados", "shooting_scoring", "3PM", 0, (gs) => gs.reduce((s, g) => s + g.fg3m, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-3pa-avg", "Triples intentados por partido (3PA)", "shooting_scoring", "3PA", 1, (gs) => meanNums3(gs.map((g) => g.fg3a))), makePlayerSL("sl-player-3ppct", "% Acierto en triples (3P%, m\xEDn. 3.5 3PA/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const m = gs.reduce((s, g) => s + g.fg3m, 0);
    const a = gs.reduce((s, g) => s + g.fg3a, 0);
    return a >= gs.length * 3.5 ? m / a * 100 : null;
  }, { extraSecondary: __name5((gs) => `${gs.reduce((s, g) => s + g.fg3m, 0)}/${gs.reduce((s, g) => s + g.fg3a, 0)} T3`, "extraSecondary") }), makePlayerSL("sl-player-ftm-avg", "Tiros libres anotados por partido (FTM)", "shooting_scoring", "TLM", 1, (gs) => meanNums3(gs.map((g) => g.ftm))), makePlayerSL("sl-player-ftm-tot", "Tiros libres totales anotados", "shooting_scoring", "TLM", 0, (gs) => gs.reduce((s, g) => s + g.ftm, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-fta-avg", "Tiros libres intentados por partido (FTA)", "shooting_scoring", "TLI", 1, (gs) => meanNums3(gs.map((g) => g.fta))), makePlayerSL("sl-player-ftpct", "% Acierto en tiros libres (FT%, m\xEDn. 2.5 TLI/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const m = gs.reduce((s, g) => s + g.ftm, 0);
    const a = gs.reduce((s, g) => s + g.fta, 0);
    return a >= gs.length * 2.5 ? m / a * 100 : null;
  }, { extraSecondary: __name5((gs) => `${gs.reduce((s, g) => s + g.ftm, 0)}/${gs.reduce((s, g) => s + g.fta, 0)} TL`, "extraSecondary") }), makePlayerSL("sl-player-efg", "Tiro de Campo Efectivo (eFG%, m\xEDn. 7 TCI/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const fgm = gs.reduce((s, g) => s + g.fgm, 0);
    const fg3m = gs.reduce((s, g) => s + g.fg3m, 0);
    const fga = gs.reduce((s, g) => s + g.fga, 0);
    return fga >= gs.length * 7 ? (fgm + 0.5 * fg3m) / fga * 100 : null;
  }), makePlayerSL("sl-player-ts", "Acierto Real True Shooting (TS%, m\xEDn. 12 PTS/PJ)", "shooting_scoring", "%", 1, (gs) => {
    const pts = gs.reduce((s, g) => s + g.points, 0);
    const fga = gs.reduce((s, g) => s + g.fga, 0);
    const fta = gs.reduce((s, g) => s + g.fta, 0);
    const denom = 2 * (fga + 0.44 * fta);
    return pts >= gs.length * 12 && denom > 0 ? pts / denom * 100 : null;
  }, { extraSecondary: __name5((gs) => `${round14(meanNums3(gs.map((g) => g.points))).toFixed(1)} PTS/PJ`, "extraSecondary") }), makePlayerSL("sl-player-reb-avg", "Rebotes totales por partido (RPG)", "rebounding", "REB", 1, (gs) => meanNums3(gs.map((g) => g.rebounds))), makePlayerSL("sl-player-reb-tot", "Rebotes totales acumulados", "rebounding", "REB", 0, (gs) => gs.reduce((s, g) => s + g.rebounds, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-orb-avg", "Rebotes ofensivos por partido (ORPG)", "rebounding", "OR", 1, (gs) => meanNums3(gs.map((g) => g.oreb))), makePlayerSL("sl-player-orb-tot", "Rebotes ofensivos totales acumulados", "rebounding", "OR", 0, (gs) => gs.reduce((s, g) => s + g.oreb, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-drb-avg", "Rebotes defensivos por partido (DRPG)", "rebounding", "DR", 1, (gs) => meanNums3(gs.map((g) => g.dreb))), makePlayerSL("sl-player-drb-tot", "Rebotes defensivos totales acumulados", "rebounding", "DR", 0, (gs) => gs.reduce((s, g) => s + g.dreb, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-reb36", "Rebotes totales por cada 36 minutos (REB/36m)", "rebounding", "REB", 1, (gs) => {
    const min = gs.reduce((s, g) => s + g.minutes, 0);
    const reb = gs.reduce((s, g) => s + g.rebounds, 0);
    return min >= gs.length * 16 ? reb / min * 36 : null;
  }), makePlayerAdvSL("sl-player-orebpct", "% Rebote Ofensivo capturado en pista (OREB% NBA.com)", "rebounding", "%", 1, (adv) => adv.orebPct), makePlayerAdvSL("sl-player-rebpct", "% Rebote Total capturado en pista (REB% NBA.com)", "rebounding", "%", 1, (adv) => adv.rebPct), makePlayerSL("sl-player-ast-avg", "Asistencias por partido (APG)", "playmaking_allaround", "AST", 1, (gs) => meanNums3(gs.map((g) => g.assists))), makePlayerSL("sl-player-ast-tot", "Asistencias totales acumuladas", "playmaking_allaround", "AST", 0, (gs) => gs.reduce((s, g) => s + g.assists, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-astto", "Ratio Asistencias / P\xE9rdidas (AST/PER, m\xEDn. 4 AST/PJ)", "playmaking_allaround", "x", 2, (gs) => {
    const ast = gs.reduce((s, g) => s + g.assists, 0);
    const tov = gs.reduce((s, g) => s + g.turnovers, 0);
    if (ast < gs.length * 4) return null;
    return tov > 0 ? ast / tov : ast;
  }, { extraSecondary: __name5((gs) => `${round14(meanNums3(gs.map((g) => g.assists))).toFixed(1)} AST / ${round14(meanNums3(gs.map((g) => g.turnovers))).toFixed(1)} PER`, "extraSecondary") }), makePlayerSL("sl-player-ast36", "Asistencias por cada 36 minutos (AST/36m)", "playmaking_allaround", "AST", 1, (gs) => {
    const min = gs.reduce((s, g) => s + g.minutes, 0);
    const ast = gs.reduce((s, g) => s + g.assists, 0);
    return min >= gs.length * 18 ? ast / min * 36 : null;
  }), makePlayerAdvSL("sl-player-astpct", "% de Asistencias sobre canastas en pista (AST% NBA.com)", "playmaking_allaround", "%", 1, (adv) => adv.astPct), makePlayerSL("sl-player-pra-avg", "Producci\xF3n combinada PRA (PTS+REB+AST) / PJ", "playmaking_allaround", "PRA", 1, (gs) => meanNums3(gs.map((g) => g.pra))), makePlayerSL("sl-player-pr-avg", "Combinada Puntos + Rebotes (PTS+REB) / PJ", "playmaking_allaround", "P+R", 1, (gs) => meanNums3(gs.map((g) => g.points + g.rebounds))), makePlayerSL("sl-player-pa-avg", "Combinada Puntos + Asistencias (PTS+AST) / PJ", "playmaking_allaround", "P+A", 1, (gs) => meanNums3(gs.map((g) => g.points + g.assists))), makePlayerSL("sl-player-ra-avg", "Combinada Rebotes + Asistencias (REB+AST) / PJ", "playmaking_allaround", "R+A", 1, (gs) => meanNums3(gs.map((g) => g.rebounds + g.assists))), makePlayerSL("sl-player-dd2", "Dobles-Dobles logrados en temporada (DD2)", "playmaking_allaround", "DD2", 0, (gs) => countDoubleDoubles(gs), { isCumulativeTotal: true }), makePlayerSL("sl-player-td3", "Triples-Dobles logrados en temporada (TD3)", "playmaking_allaround", "TD3", 0, (gs) => countTripleDoubles(gs), { isCumulativeTotal: true }), makePlayerSL("sl-player-gmsc-avg", "Valoraci\xF3n media Hollinger (Game Score / PJ)", "playmaking_allaround", "GmSc", 1, (gs) => meanNums3(gs.map((g) => g.gameScore))), makePlayerSL("sl-player-min-avg", "Minutos disputados por partido (MPG)", "playmaking_allaround", "MIN", 1, (gs) => meanNums3(gs.map((g) => g.minutes))), makePlayerSL("sl-player-min-tot", "Minutos totales acumulados", "playmaking_allaround", "MIN", 0, (gs) => gs.reduce((s, g) => s + g.minutes, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-pm-avg", "Impacto M\xE1s/Menos medio por partido (+/-)", "playmaking_allaround", "+/-", 1, (gs) => meanNums3(gs.map((g) => g.plusMinus))), makePlayerSL("sl-player-pm-tot", "Impacto M\xE1s/Menos total acumulado (+/-)", "playmaking_allaround", "+/-", 0, (gs) => gs.reduce((s, g) => s + g.plusMinus, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-stl-avg", "Robos de bal\xF3n por partido (SPG)", "defense_discipline", "ROB", 1, (gs) => meanNums3(gs.map((g) => g.steals))), makePlayerSL("sl-player-stl-tot", "Robos totales acumulados", "defense_discipline", "ROB", 0, (gs) => gs.reduce((s, g) => s + g.steals, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-blk-avg", "Tapones colocados por partido (BPG)", "defense_discipline", "TAP", 1, (gs) => meanNums3(gs.map((g) => g.blocks))), makePlayerSL("sl-player-blk-tot", "Tapones totales acumulados", "defense_discipline", "TAP", 0, (gs) => gs.reduce((s, g) => s + g.blocks, 0), { isCumulativeTotal: true }), makePlayerSL("sl-player-stocks-avg", "Stocks (Robos + Tapones) por partido", "defense_discipline", "STK", 1, (gs) => meanNums3(gs.map((g) => g.stocks))), makePlayerSL("sl-player-stocks-tot", "Stocks (Robos + Tapones) totales acumulados", "defense_discipline", "STK", 0, (gs) => gs.reduce((s, g) => s + g.stocks, 0), { isCumulativeTotal: true }), makePlayerAdvSL("sl-player-defl", "Desv\xEDos de bal\xF3n por partido (Deflections NBA.com)", "defense_discipline", "DESV", 1, (adv) => adv.deflections), makePlayerAdvSL("sl-player-contest", "Tiros rivales punteados por partido (Contested Shots)", "defense_discipline", "PUNT", 1, (adv) => adv.contestedShots), makePlayerAdvSL("sl-player-loose", "Balones divididos recuperados / PJ (Loose Balls)", "defense_discipline", "REC", 1, (adv) => adv.looseBalls), makePlayerAdvSL("sl-player-boxouts", "Cierres de rebote por partido (Box-Outs NBA.com)", "defense_discipline", "BOX", 1, (adv) => adv.boxOuts), makePlayerSL("sl-player-tov-high", "M\xE1s p\xE9rdidas de bal\xF3n cometidas por partido", "defense_discipline", "PER", 1, (gs) => meanNums3(gs.map((g) => g.turnovers))), makePlayerSL("sl-player-pf-low", "Menor media de faltas en titulares (\u226528 MIN/PJ)", "defense_discipline", "FP", 1, (gs) => meanNums3(gs.map((g) => g.fouls)), { minMinutesAvg: 28, lowerIsBetter: true }), makePlayerSL("sl-player-usg", "Protagonismo ofensivo (Uso estimado USG%)", "advanced_hustle", "%", 1, (gs) => meanNums3(gs.map((g) => g.usgEst)), { minMinutesAvg: 20 }), makePlayerAdvSL("sl-player-pie", "Impacto global en pista (PIE% NBA.com)", "advanced_hustle", "%", 1, (adv) => adv.pie, { minMinutesAvg: 22 }), makePlayerAdvSL("sl-player-netrtg", "Mejor Net Rating individual en pista (\u226524 MIN/PJ)", "advanced_hustle", "RTG", 1, (adv) => adv.netRtg, { minMinutesAvg: 24 }), makePlayerAdvSL("sl-player-offrtg", "Mejor Eficiencia Ofensiva en pista OffRtg (\u226524 MIN/PJ)", "advanced_hustle", "RTG", 1, (adv) => adv.offRtg, { minMinutesAvg: 24 }), makePlayerAdvSL("sl-player-defrtg", "Mejor Eficiencia Defensiva en pista DefRtg (\u226524 MIN/PJ)", "advanced_hustle", "RTG", 1, (adv) => adv.defRtg, { minMinutesAvg: 24, lowerIsBetter: true }), makePlayerAdvSL("sl-player-paint", "Puntos en la Pintura por partido (NBA.com)", "advanced_hustle", "PTS", 1, (adv) => adv.ptsPaint), makePlayerAdvSL("sl-player-fb", "Puntos al Contraataque por partido (Fast Break)", "advanced_hustle", "PTS", 1, (adv) => adv.ptsFastBreak), makePlayerAdvSL("sl-player-2nd", "Puntos de 2\xAA Oportunidad por partido (NBA.com)", "advanced_hustle", "PTS", 1, (adv) => adv.pts2ndChance), makePlayerAdvSL("sl-player-pfd", "Faltas personales provocadas por partido (PFD)", "advanced_hustle", "PFD", 1, (adv) => adv.foulsDrawn), makePlayerAdvSL("sl-player-screen", "Asistencias de bloqueo por partido (Screen Assists)", "advanced_hustle", "PANT", 1, (adv) => adv.screenAssists), makeTeamSL("sl-team-winpct", "Mejor porcentaje de victorias colectivo (%V)", "%", 1, (gs) => gs.filter((g) => g.result === "W").length / gs.length * 100), makeTeamSL("sl-team-pts-avg", "Ataque m\xE1s anotador de la NBA (PTS a favor / PJ)", "PTS", 1, (gs) => meanNums3(gs.map((g) => g.pointsFor))), makeTeamSL("sl-team-opp-pts", "Defensa que menos puntos recibe (PTS en contra / PJ)", "PTS", 1, (gs) => meanNums3(gs.map((g) => g.pointsAgainst)), { lowerIsBetter: true }), makeTeamSL("sl-team-diff", "Mayor margen medio de puntos (Diferencial +/-)", "PTS", 1, (gs) => meanNums3(gs.map((g) => g.differential))), makeTeamSL("sl-team-offrtg", "Mejor Eficiencia Ofensiva colectiva (OffRtg)", "RTG", 1, (gs, t, isOpen) => !isOpen && t.advanced?.offRtg ? t.advanced.offRtg : meanNums3(gs.map((g) => g.offRtg))), makeTeamSL("sl-team-defrtg", "Mejor Eficiencia Defensiva colectiva (DefRtg)", "RTG", 1, (gs, t, isOpen) => !isOpen && t.advanced?.defRtg ? t.advanced.defRtg : meanNums3(gs.map((g) => g.defRtg)), { lowerIsBetter: true }), makeTeamSL("sl-team-netrtg", "Mejor Dominio Neto por 100 posesiones (NetRtg)", "RTG", 1, (gs, t, isOpen) => !isOpen && t.advanced?.netRtg !== void 0 ? t.advanced.netRtg : meanNums3(gs.map((g) => g.netRtg))), makeTeamSL("sl-team-pace", "Franquicia con ritmo m\xE1s alto de juego (Pace)", "POS", 1, (gs, t, isOpen) => !isOpen && t.advanced?.pace ? t.advanced.pace : meanNums3(gs.map((g) => g.pace))), makeTeamSL("sl-team-3pm-avg", "M\xE1s triples anotados por partido (Equipo)", "3PM", 1, (gs) => meanNums3(gs.map((g) => g.fg3m))), makeTeamSL("sl-team-3ppct", "Mejor % de acierto en triples colectivo", "%", 1, (gs) => {
    const m = gs.reduce((s, g) => s + g.fg3m, 0);
    const a = gs.reduce((s, g) => s + g.fg3a, 0);
    return a > 0 ? m / a * 100 : null;
  }), makeTeamSL("sl-team-fgpct", "Mejor % en tiros de campo colectivo (FG%)", "%", 1, (gs) => {
    const m = gs.reduce((s, g) => s + g.fgm, 0);
    const a = gs.reduce((s, g) => s + g.fga, 0);
    return a > 0 ? m / a * 100 : null;
  }), makeTeamSL("sl-team-ftpct", "Mejor % en tiros libres colectivo (FT%)", "%", 1, (gs) => {
    const m = gs.reduce((s, g) => s + g.ftm, 0);
    const a = gs.reduce((s, g) => s + g.fta, 0);
    return a > 0 ? m / a * 100 : null;
  }), makeTeamSL("sl-team-efg", "Mejor Tiro Efectivo colectivo (eFG%)", "%", 1, (gs, t, isOpen) => !isOpen && t.advanced?.efgPct ? t.advanced.efgPct : meanNums3(gs.map((g) => g.efgPct))), makeTeamSL("sl-team-ts", "Mejor True Shooting colectivo (TS%)", "%", 1, (gs, t, isOpen) => !isOpen && t.advanced?.tsPct ? t.advanced.tsPct : meanNums3(gs.map((g) => g.tsPct))), makeTeamSL("sl-team-reb-avg", "M\xE1s rebotes totales por partido (Equipo)", "REB", 1, (gs) => meanNums3(gs.map((g) => g.reb))), makeTeamSL("sl-team-orb-avg", "M\xE1s rebotes ofensivos por partido (Equipo)", "OR", 1, (gs) => meanNums3(gs.map((g) => g.oreb))), makeTeamSL("sl-team-ast-avg", "M\xE1s asistencias colectivas por partido (Equipo)", "AST", 1, (gs) => meanNums3(gs.map((g) => g.ast))), makeTeamSL("sl-team-stl-avg", "M\xE1s robos de bal\xF3n por partido (Equipo)", "ROB", 1, (gs) => meanNums3(gs.map((g) => g.stl))), makeTeamSL("sl-team-blk-avg", "M\xE1s tapones colocados por partido (Equipo)", "TAP", 1, (gs) => meanNums3(gs.map((g) => g.blk))), makeTeamSL("sl-team-tov-low", "Equipo que menos balones pierde por partido", "PER", 1, (gs) => meanNums3(gs.map((g) => g.tov)), { lowerIsBetter: true }), makeTeamSL("sl-team-paint", "M\xE1s puntos en la Pintura por partido (Equipo NBA.com)", "PTS", 1, (_gs, t) => t.advanced?.ptsPaint && t.advanced.ptsPaint > 0 ? t.advanced.ptsPaint : null), makeTeamSL("sl-team-fb", "M\xE1s puntos al Contraataque por partido (Equipo NBA.com)", "PTS", 1, (_gs, t) => t.advanced?.ptsFastBreak && t.advanced.ptsFastBreak > 0 ? t.advanced.ptsFastBreak : null)];
  const payload = { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), dataSource: full.s2027.dataSource, totalPlayersScanned: (/* @__PURE__ */ new Set([...p27.map((x) => x.id), ...p26.map((x) => x.id)])).size, openingGamesPerTeam: avgGp27, global2027: buildGlobalSnap("2026-27", t27), global2026Full: buildGlobalSnap("2025-26", t26), global2026Opening: buildGlobalSnap("2025-26 (Mismo tramo)", t26, avgGp27), singleGameRecords, seasonLeaders };
  cachedMilestones = { expiresAt: Date.now() + 10 * 60 * 1e3, payload };
  return payload;
}
var scoutingEngine = createScoutingEngine({ getFullLeagueMemory: __name5(async () => {
  const full = await getFullLeagueMemory(false);
  return { teams: full.teams, allPlayers: full.allPlayers };
}, "getFullLeagueMemory"), getPlayerBiosMap, getGameDayPayload, cachedFetchJson });
async function getFantasyEspnSyncPayload(forceRefresh = false) {
  const biosMap = await getPlayerBiosMap(false);
  const lightweightPlayers = [...biosMap.values()].map((b) => ({ id: b.id, name: b.name, teamId: b.teamId, teamAbbr: b.teamAbbr, teamName: NBA_TEAMS_MAP[b.teamAbbr]?.name || b.teamAbbr, position: b.position || "G-F", jersey: b.jersey || void 0, height: b.height || void 0, country: b.country || void 0, ...b.birthYear ? { birthYear: b.birthYear } : {}, games: [] }));
  return buildFantasyEspnSyncPayload({ allPlayers: lightweightPlayers, fetchLeagueScheduleGames: scoutingEngine.fetchLeagueScheduleGames, fetchEspnInjuriesByName: scoutingEngine.fetchEspnInjuriesByName, forceRefresh });
}
async function getSeasonAwardsPayload(seasonScope = "2027", forceRefresh = false) {
  const [full, biosMap] = await Promise.all([getFullLeagueMemory(forceRefresh), getPlayerBiosMap(false)]);
  return buildSeasonAwardsPayload({ full, biosMap, seasonScope, forceRefresh });
}

// src/server/securityMiddleware.ts
import crypto2 from "crypto";
import fs4 from "fs";
import path4 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

// src/server/validationSchemas.ts
import { z } from "zod";
function stripControlChars(raw) {
  return raw.replace(/[\x00-\x1F\x7F]+/g, " ").trim();
}
var FORBIDDEN_PROTOTYPE_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var safeEntityIdSchema = z.string({ error: "Identificador requerido." }).trim().min(1, "El identificador no puede estar vac\xEDo.").max(48, "Identificador demasiado largo (m\xE1x. 48 caracteres).").regex(/^[a-zA-Z0-9:_-]+$/, 'Formato de identificador no v\xE1lido (solo letras, n\xFAmeros, ":", "_" o "-").').refine((val) => !val.includes("..") && !FORBIDDEN_PROTOTYPE_KEYS.has(val.toLowerCase()), "Identificador reservado o secuencia no permitida.");
var seasonModeSchema = z.enum(["continuous", "2027", "2026", "2025", "2024"], { error: "Modo de temporada no v\xE1lido (permitidos: continuous, 2027, 2026, 2025, 2024)." });
var booleanQueryFlagSchema = z.enum(["0", "1", "true", "false"], { error: "Par\xE1metro booleano no v\xE1lido (usa 0 o 1)." }).optional().transform((val) => val === "1" || val === "true");
var isoDateSchema = z.string({ error: "Fecha no v\xE1lida." }).trim().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato estricto YYYY-MM-DD.").refine((val) => {
  const [yStr, mStr, dStr] = val.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isInteger(y) || y < 2020 || y > 2035) return false;
  if (!Number.isInteger(m) || m < 1 || m > 12) return false;
  if (!Number.isInteger(d) || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}, "Fecha fuera de rango o inexistente en el calendario.");
var emptyQuerySchema = z.strictObject({});
var refreshOnlyQuerySchema = z.strictObject({ refresh: booleanQueryFlagSchema });
var awardsQuerySchema = z.strictObject({ season: z.enum(["2027", "2026"], { error: "Temporada de premios no v\xE1lida (permitidos: 2027, 2026)." }).optional().default("2027"), refresh: booleanQueryFlagSchema });
var bootstrapQuerySchema = z.strictObject({ seasonMode: seasonModeSchema.optional(), season: seasonModeSchema.optional(), refresh: booleanQueryFlagSchema, wire: z.enum(["compact", "v2", "legacy"], { error: "Formato wire no v\xE1lido (permitidos: compact, v2, legacy)." }).optional(), full: booleanQueryFlagSchema }).transform((q) => ({ seasonMode: q.seasonMode ?? q.season ?? "continuous", refresh: Boolean(q.refresh), wire: q.wire ?? "compact" }));
var searchQuerySchema = z.strictObject({ q: z.string({ error: "Par\xE1metro de b\xFAsqueda no v\xE1lido." }).max(80, "La b\xFAsqueda no puede superar 80 caracteres.").transform(stripControlChars).refine((s) => !/[<>${}\\]/.test(s), "La b\xFAsqueda contiene caracteres especiales no permitidos.").optional().default("") });
var playerParamsSchema = z.strictObject({ playerId: safeEntityIdSchema });
var playerSummaryQuerySchema = z.strictObject({ seasonMode: seasonModeSchema.optional(), season: seasonModeSchema.optional(), name: z.string().max(80).transform(stripControlChars).optional(), teamAbbr: z.string().max(12).transform(stripControlChars).refine((v) => v === "" || /^[a-zA-Z0-9_-]{1,12}$/.test(v), "Abreviatura de equipo no v\xE1lida.").optional(), position: z.string().max(16).transform(stripControlChars).refine((v) => v === "" || /^[a-zA-Z0-9/_ -]{1,16}$/.test(v), "Posici\xF3n no v\xE1lida.").optional() }).transform((q) => ({ seasonMode: q.seasonMode ?? q.season ?? "continuous", name: q.name, teamAbbr: q.teamAbbr, position: q.position }));
var teamParamsSchema = z.strictObject({ teamId: safeEntityIdSchema });
var gamedayQuerySchema = z.strictObject({ date: z.preprocess((val) => val === "" ? void 0 : val, isoDateSchema.optional()), refresh: booleanQueryFlagSchema });
var gameEventParamsSchema = z.strictObject({ eventId: safeEntityIdSchema });
var adminLoginBodySchema = z.strictObject({ passcode: z.string({ error: "Debes introducir una clave de acceso v\xE1lida." }).trim().min(1, "La clave de acceso no puede estar vac\xEDa.").max(128, "La clave supera la longitud m\xE1xima permitida.") });
var ADMIN_SECURITY_BOUNDS = { nbaApiLimit: { min: 20, max: 2e3 }, nbaApiWindowMinutes: { min: 1, max: 60 }, nbaRefreshLimit: { min: 2, max: 200 }, nbaRefreshWindowMinutes: { min: 1, max: 60 }, adminBruteForceMaxAttempts: { min: 2, max: 25 }, adminBruteForceWindowMinutes: { min: 1, max: 180 }, adminFloodLimit: { min: 10, max: 500 }, adminFloodWindowMinutes: { min: 1, max: 180 }, adminSessionTtlHours: { min: 1, max: 168 } };
var adminSecurityConfigBodySchema = z.strictObject({ nbaApiLimit: z.coerce.number({ error: "El l\xEDmite de peticiones API debe ser num\xE9rico." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.nbaApiLimit.min, "M\xEDnimo 20 peticiones.").max(ADMIN_SECURITY_BOUNDS.nbaApiLimit.max, "M\xE1ximo 2000 peticiones."), nbaApiWindowMinutes: z.coerce.number({ error: "La ventana de tiempo API debe ser num\xE9rica." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.nbaApiWindowMinutes.min, "M\xEDnimo 1 minuto.").max(ADMIN_SECURITY_BOUNDS.nbaApiWindowMinutes.max, "M\xE1ximo 60 minutos."), nbaRefreshLimit: z.coerce.number({ error: "El l\xEDmite de recargas forzadas debe ser num\xE9rico." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.nbaRefreshLimit.min, "M\xEDnimo 2 recargas.").max(ADMIN_SECURITY_BOUNDS.nbaRefreshLimit.max, "M\xE1ximo 200 recargas."), nbaRefreshWindowMinutes: z.coerce.number({ error: "La ventana de recargas forzadas debe ser num\xE9rica." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.nbaRefreshWindowMinutes.min, "M\xEDnimo 1 minuto.").max(ADMIN_SECURITY_BOUNDS.nbaRefreshWindowMinutes.max, "M\xE1ximo 60 minutos."), adminBruteForceMaxAttempts: z.coerce.number({ error: "El m\xE1ximo de intentos fallidos debe ser num\xE9rico." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.adminBruteForceMaxAttempts.min, "M\xEDnimo 2 intentos.").max(ADMIN_SECURITY_BOUNDS.adminBruteForceMaxAttempts.max, "M\xE1ximo 25 intentos."), adminBruteForceWindowMinutes: z.coerce.number({ error: "El tiempo de bloqueo login debe ser num\xE9rico." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.adminBruteForceWindowMinutes.min, "M\xEDnimo 1 minuto.").max(ADMIN_SECURITY_BOUNDS.adminBruteForceWindowMinutes.max, "M\xE1ximo 180 minutos."), adminFloodLimit: z.coerce.number({ error: "El l\xEDmite de tr\xE1fico admin debe ser num\xE9rico." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.adminFloodLimit.min, "M\xEDnimo 10 solicitudes.").max(ADMIN_SECURITY_BOUNDS.adminFloodLimit.max, "M\xE1ximo 500 solicitudes."), adminFloodWindowMinutes: z.coerce.number({ error: "La ventana de tr\xE1fico admin debe ser num\xE9rica." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.adminFloodWindowMinutes.min, "M\xEDnimo 1 minuto.").max(ADMIN_SECURITY_BOUNDS.adminFloodWindowMinutes.max, "M\xE1ximo 180 minutos."), adminSessionTtlHours: z.coerce.number({ error: "La duraci\xF3n de sesi\xF3n debe ser num\xE9rica." }).int("Debe ser un n\xFAmero entero.").min(ADMIN_SECURITY_BOUNDS.adminSessionTtlHours.min, "M\xEDnimo 1 hora.").max(ADMIN_SECURITY_BOUNDS.adminSessionTtlHours.max, "M\xE1ximo 168 horas (7 d\xEDas).") });
var gamedayThresholdsBodySchema = z.strictObject({
  explosionShootingTsDiff: z.coerce.number().min(2).max(40),
  explosion3pMinMade: z.coerce.number().int().min(1).max(15),
  explosion3pDelta: z.coerce.number().min(0.5).max(10),
  explosionRebMinTotal: z.coerce.number().int().min(3).max(25),
  explosionRebDelta: z.coerce.number().min(1).max(15),
  explosionAstMinTotal: z.coerce.number().int().min(3).max(25),
  explosionAstDelta: z.coerce.number().min(1).max(15),
  explosionStocksMinTotal: z.coerce.number().int().min(2).max(12),
  explosionStocksDelta: z.coerce.number().min(1).max(10),
  explosionMinutesDelta: z.coerce.number().min(1).max(20),
  explosionScoringPtsDelta: z.coerce.number().min(2).max(25),
  explosionZScoreThreshold: z.coerce.number().min(0.8).max(3.5),
  starterMinMinutesAvg: z.coerce.number().min(10).max(40),
  starterMinPointsAvg: z.coerce.number().min(4).max(30),
  slumpScoringDropPts: z.coerce.number().min(2).max(25),
  slumpShootingMaxTsPct: z.coerce.number().min(25).max(60),
  slumpShootingTsDrop: z.coerce.number().min(4).max(30),
  slumpFoulsTroubleCount: z.coerce.number().int().min(3).max(6),
  slumpFoulsMinutesCut: z.coerce.number().min(2).max(20),
  slumpTurnoversCount: z.coerce.number().int().min(2).max(12),
  slumpTurnoversDelta: z.coerce.number().min(0.5).max(8),
  slump3pSpecialistAvg: z.coerce.number().min(0.8).max(6),
  slump3pDropDelta: z.coerce.number().min(0.5).max(6),
  slumpAstFacilitatorAvg: z.coerce.number().min(2).max(15),
  slumpAstDropDelta: z.coerce.number().min(1).max(10),
  slumpRebInteriorAvg: z.coerce.number().min(4).max(18),
  slumpRebDropDelta: z.coerce.number().min(1).max(12),
  slumpMinutesCutDelta: z.coerce.number().min(2).max(25)
});
var safeRivalKeySchema = z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/, "Clave de equipo rival no v\xE1lida.").refine((k) => !FORBIDDEN_PROTOTYPE_KEYS.has(k.toLowerCase()), "Clave reservada.");
var safeGameCorrectionKeySchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_:-]+$/, "Clave de correcci\xF3n no v\xE1lida.").refine((k) => !FORBIDDEN_PROTOTYPE_KEYS.has(k.toLowerCase()), "Clave reservada.");
var gameCorrectionItemSchema = z.object({
  fptsDelta: z.number().finite(),
  reason: z.string().max(200).optional().default(""),
  updatedAt: z.number().finite().nonnegative().optional()
});
var manualFantasyStateBodySchema = z.object({
  updatedAt: z.number().finite().nonnegative().optional(),
  myTeamName: z.string().max(80, "El nombre del equipo no puede superar 80 caracteres.").transform(stripControlChars).optional(),
  roster: z.array(z.object({ playerId: safeEntityIdSchema, slot: z.enum(["starter", "bench", "ir"]) })).max(25, "La plantilla no puede superar 25 jugadores."),
  takenRivalIds: z.array(safeEntityIdSchema).max(600, "Demasiados jugadores rivales marcados."),
  rivalRosters: z.record(safeRivalKeySchema, z.array(safeEntityIdSchema).max(30)),
  rivalTeamNames: z.record(safeRivalKeySchema, z.string().max(80).transform(stripControlChars)),
  gameCorrections: z.record(safeGameCorrectionKeySchema, gameCorrectionItemSchema).optional()
}).passthrough();
function getValidated(req) {
  const bag = req.__validated;
  if (bag) {
    return bag;
  }
  return { params: req.params ?? {}, query: req.query ?? {}, body: req.body };
}
function validateRequest(schemas) {
  return (req, res, next) => {
    const issues = [];
    let parsedParams = req.params;
    let parsedQuery = req.query;
    let parsedBody = req.body;
    if (schemas.params) {
      const r = schemas.params.safeParse(req.params ?? {});
      if (!r.success) {
        for (const iss of r.error.issues) {
          const subPath = iss.path.map(String).join(".");
          issues.push({ field: subPath ? `params.${subPath}` : "params", message: iss.message });
        }
      } else {
        parsedParams = r.data;
      }
    }
    if (schemas.query) {
      const rawQueryObj = req.query && typeof req.query === "object" ? req.query : {};
      const cleanedQuery = {};
      for (const [k, v] of Object.entries(rawQueryObj)) {
        if (k === "__api_path" || k === "path" || k.startsWith("__vercel") || k.startsWith("nxtP")) {
          continue;
        }
        cleanedQuery[k] = v;
      }
      const r = schemas.query.safeParse(cleanedQuery);
      if (!r.success) {
        for (const iss of r.error.issues) {
          const subPath = iss.path.map(String).join(".");
          issues.push({ field: subPath ? `query.${subPath}` : "query", message: iss.message });
        }
      } else {
        parsedQuery = r.data;
      }
    }
    if (schemas.body) {
      const r = schemas.body.safeParse(req.body ?? {});
      if (!r.success) {
        for (const iss of r.error.issues) {
          const subPath = iss.path.map(String).join(".");
          issues.push({ field: subPath ? `body.${subPath}` : "body", message: iss.message });
        }
      } else {
        parsedBody = r.data;
      }
    }
    if (issues.length > 0) {
      res.status(400).json({ error: issues[0]?.message || "Par\xE1metros de entrada no v\xE1lidos.", code: "VALIDATION_ERROR", issues });
      return;
    }
    req.__validated = { params: parsedParams, query: parsedQuery, body: parsedBody };
    next();
  };
}

// src/server/securityMiddleware.ts
var __name6 = (fn, _n) => fn;
var __filename3 = fileURLToPath3(import.meta.url);
var __dirname3 = path4.dirname(__filename3);
var DATA_DIR2 = [
  path4.resolve(process.cwd(), "data"),
  path4.resolve(__dirname3, "../data"),
  path4.resolve(__dirname3, "../../data")
].find((p) => fs4.existsSync(p)) || path4.resolve(process.cwd(), "data");
var SECURITY_CONFIG_FILE = path4.join(DATA_DIR2, "admin-security-config.json");
var SERVERLESS_TMP_SECURITY_CONFIG_FILE = "/tmp/radarnba-admin-security-config.json";
var ADMIN_COOKIE_NAME = "radarnba_admin_session";
var ADMIN_CSRF_HEADER_NAME = "x-radarnba-csrf";
var ADMIN_CSRF_HEADER_VALUE = "1";
var REDIS_SECURITY_STATE_KEY = "radarnba:security:state_v1";
var REDIS_RATE_LIMIT_KEY_PREFIX = "radarnba:rl:v1";
var REDIS_RATE_LIMIT_TIMEOUT_MS = 2500;
var SECURITY_STATE_SYNC_TTL_MS = 1e4;
var MAX_LOCAL_COUNTER_ENTRIES = 5e3;
var LUA_FIXED_WINDOW_INCR = [
  "local c = redis.call('INCR', KEYS[1])",
  "local pttl = redis.call('PTTL', KEYS[1])",
  "if c == 1 or pttl < 0 then",
  "  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))",
  "  pttl = tonumber(ARGV[1])",
  "end",
  "return {c, pttl}"
].join("\n");
var LUA_PEEK_COUNTER = [
  "local raw = redis.call('GET', KEYS[1])",
  "if not raw then",
  "  return {0, -2}",
  "end",
  "local pttl = redis.call('PTTL', KEYS[1])",
  "return {tonumber(raw) or 0, pttl}"
].join("\n");
var MIN_ADMIN_PASSCODE_LENGTH = 8;
var MIN_PROD_TOKEN_SECRET_LENGTH = 32;
var MIN_DEV_TOKEN_SECRET_LENGTH = 16;
var SCRYPT_KEYLEN = 64;
var SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
var FORBIDDEN_PLACEHOLDER_SECRETS = /* @__PURE__ */ new Set([
  "change_me_admin_passcode",
  "change_me_random_hmac_secret",
  "changeme",
  "password",
  "admin",
  "12345678"
]);
var EPHEMERAL_DEV_TOKEN_SECRET = crypto2.randomBytes(32).toString("hex");
var DEFAULT_ADMIN_SECURITY_VALUES = {
  nbaApiLimit: 120,
  nbaApiWindowMinutes: 1,
  nbaRefreshLimit: 15,
  nbaRefreshWindowMinutes: 5,
  adminBruteForceMaxAttempts: 5,
  adminBruteForceWindowMinutes: 15,
  adminFloodLimit: 40,
  adminFloodWindowMinutes: 15,
  adminSessionTtlHours: 12
};
var DEFAULT_ADMIN_SECURITY_CONFIG = { ...DEFAULT_ADMIN_SECURITY_VALUES, updatedAt: 0 };
function isProductionSecurityRuntime() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}
__name6(isProductionSecurityRuntime, "isProductionSecurityRuntime");
function isHttpsOrProductionRequest(req) {
  if (isProductionSecurityRuntime()) return true;
  if (req?.secure) return true;
  const fwdProto = req?.headers?.["x-forwarded-proto"];
  const rawProto = Array.isArray(fwdProto) ? fwdProto[0] : fwdProto;
  if (typeof rawProto === "string" && rawProto.split(",")[0].trim().toLowerCase() === "https") {
    return true;
  }
  return false;
}
__name6(isHttpsOrProductionRequest, "isHttpsOrProductionRequest");
function buildAdminSessionCookieHeader(token, maxAgeSec, req) {
  const safeMaxAge = Math.max(60, Math.floor(maxAgeSec));
  const secureAttr = isHttpsOrProductionRequest(req) ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${safeMaxAge}; HttpOnly; SameSite=Lax${secureAttr}`;
}
__name6(buildAdminSessionCookieHeader, "buildAdminSessionCookieHeader");
function buildClearAdminSessionCookieHeader(req) {
  const secureAttr = isHttpsOrProductionRequest(req) ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secureAttr}`;
}
__name6(buildClearAdminSessionCookieHeader, "buildClearAdminSessionCookieHeader");
function resolveValidatedAdminSecrets() {
  const isProd = isProductionSecurityRuntime();
  const rawPasscode = (process.env.ADMIN_PASSCODE || "19.Sirio.85").trim();
  const rawTokenSecret = (process.env.ADMIN_TOKEN_SECRET || "radarnba-default-production-token-secret-32-chars-v1").trim();
  if (!rawPasscode || rawPasscode.length < MIN_ADMIN_PASSCODE_LENGTH || FORBIDDEN_PLACEHOLDER_SECRETS.has(rawPasscode.toLowerCase())) {
    return {
      configured: false,
      code: "ADMIN_ENV_NOT_CONFIGURED",
      reason: `Acceso administrativo deshabilitado por seguridad: configura la variable de entorno obligatoria ADMIN_PASSCODE (m\xEDn. ${MIN_ADMIN_PASSCODE_LENGTH} caracteres) en el servidor.`
    };
  }
  if (isProd) {
    if (!rawTokenSecret || rawTokenSecret.length < MIN_PROD_TOKEN_SECRET_LENGTH || FORBIDDEN_PLACEHOLDER_SECRETS.has(rawTokenSecret.toLowerCase())) {
      return {
        configured: false,
        code: "ADMIN_ENV_NOT_CONFIGURED",
        reason: `Acceso administrativo deshabilitado por seguridad: en producci\xF3n es obligatorio configurar ADMIN_TOKEN_SECRET (m\xEDn. ${MIN_PROD_TOKEN_SECRET_LENGTH} caracteres aleatorios) en el servidor.`
      };
    }
    if (rawTokenSecret === rawPasscode) {
      return {
        configured: false,
        code: "ADMIN_ENV_NOT_CONFIGURED",
        reason: "Acceso administrativo deshabilitado por seguridad: ADMIN_TOKEN_SECRET debe ser distinto de ADMIN_PASSCODE."
      };
    }
    return { configured: true, passcode: rawPasscode, tokenSecret: rawTokenSecret };
  }
  if (rawTokenSecret) {
    if (rawTokenSecret.length < MIN_DEV_TOKEN_SECRET_LENGTH || FORBIDDEN_PLACEHOLDER_SECRETS.has(rawTokenSecret.toLowerCase()) || rawTokenSecret === rawPasscode) {
      return {
        configured: false,
        code: "ADMIN_ENV_NOT_CONFIGURED",
        reason: `ADMIN_TOKEN_SECRET no v\xE1lido en entorno local (usa al menos ${MIN_DEV_TOKEN_SECRET_LENGTH} caracteres aleatorios y distintos de ADMIN_PASSCODE).`
      };
    }
    return { configured: true, passcode: rawPasscode, tokenSecret: rawTokenSecret };
  }
  return { configured: true, passcode: rawPasscode, tokenSecret: EPHEMERAL_DEV_TOKEN_SECRET };
}
__name6(resolveValidatedAdminSecrets, "resolveValidatedAdminSecrets");
function getAdminAuthReadiness() {
  const resolved = resolveValidatedAdminSecrets();
  if (!resolved.configured) {
    return { configured: false, code: resolved.code, reason: resolved.reason };
  }
  return { configured: true };
}
__name6(getAdminAuthReadiness, "getAdminAuthReadiness");
function deriveScryptKeyAsync(secret, salt) {
  return new Promise((resolve, reject) => {
    crypto2.scrypt(secret, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}
__name6(deriveScryptKeyAsync, "deriveScryptKeyAsync");
var cachedAdminCryptoMaterial = null;
function getDerivedAdminCryptoMaterial() {
  const resolved = resolveValidatedAdminSecrets();
  if (!resolved.configured) {
    cachedAdminCryptoMaterial = null;
    return null;
  }
  const normalizedPasscode = resolved.passcode.normalize("NFKC");
  const effectiveTokenSecret = resolved.tokenSecret;
  const fingerprint = crypto2.createHash("sha256").update(`${normalizedPasscode}\0${effectiveTokenSecret}`, "utf8").digest("hex");
  if (cachedAdminCryptoMaterial && cachedAdminCryptoMaterial.fingerprint === fingerprint) {
    return cachedAdminCryptoMaterial;
  }
  const passcodeSalt = crypto2.createHmac("sha256", "radarnba-admin-passcode-scrypt-salt-v2").update(effectiveTokenSecret, "utf8").digest();
  const sessionKdfSalt = crypto2.createHmac("sha256", "radarnba-admin-session-scrypt-salt-v2").update(effectiveTokenSecret, "utf8").digest();
  const expectedPasscodeKey = crypto2.scryptSync(normalizedPasscode, passcodeSalt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  const sessionSigningKey = crypto2.scryptSync(normalizedPasscode, sessionKdfSalt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  cachedAdminCryptoMaterial = {
    fingerprint,
    passcodeSalt,
    expectedPasscodeKey,
    sessionSigningKey
  };
  return cachedAdminCryptoMaterial;
}
__name6(getDerivedAdminCryptoMaterial, "getDerivedAdminCryptoMaterial");
if (isProductionSecurityRuntime() && !getAdminAuthReadiness().configured) {
  console.warn("[RadarNBA Security] Zona privada /admin en modo fail-closed: faltan ADMIN_PASSCODE y/o ADMIN_TOKEN_SECRET v\xE1lidos en variables de entorno.");
}
function parseValidatedSecurityConfigObject(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const { updatedAt: rawUpdatedAt, ...rest } = parsed;
  const check = adminSecurityConfigBodySchema.safeParse(rest);
  if (!check.success) return null;
  const updatedAt = typeof rawUpdatedAt === "number" && Number.isFinite(rawUpdatedAt) && rawUpdatedAt >= 0 ? rawUpdatedAt : Date.now();
  return { ...check.data, updatedAt };
}
__name6(parseValidatedSecurityConfigObject, "parseValidatedSecurityConfigObject");
function readSecurityConfigFromDisk() {
  const candidates = process.env.VERCEL ? [SERVERLESS_TMP_SECURITY_CONFIG_FILE, SECURITY_CONFIG_FILE] : [SECURITY_CONFIG_FILE];
  for (const target of candidates) {
    try {
      if (!fs4.existsSync(target)) continue;
      const rawContent = fs4.readFileSync(target, "utf8");
      const parsed = JSON.parse(rawContent);
      const valid = parseValidatedSecurityConfigObject(parsed);
      if (valid) return valid;
    } catch {
    }
  }
  return { ...DEFAULT_ADMIN_SECURITY_CONFIG };
}
__name6(readSecurityConfigFromDisk, "readSecurityConfigFromDisk");
function writeSecurityConfigToDisk(config) {
  try {
    if (process.env.VERCEL) {
      const tmpTarget = `${SERVERLESS_TMP_SECURITY_CONFIG_FILE}.tmp`;
      fs4.writeFileSync(tmpTarget, JSON.stringify(config, null, 2), "utf8");
      fs4.renameSync(tmpTarget, SERVERLESS_TMP_SECURITY_CONFIG_FILE);
    } else {
      fs4.mkdirSync(DATA_DIR2, { recursive: true });
      const tmpFile = `${SECURITY_CONFIG_FILE}.tmp`;
      fs4.writeFileSync(tmpFile, JSON.stringify(config, null, 2), "utf8");
      fs4.renameSync(tmpFile, SECURITY_CONFIG_FILE);
    }
  } catch (err) {
    console.error("Error writing admin-security-config.json:", err);
  }
}
__name6(writeSecurityConfigToDisk, "writeSecurityConfigToDisk");
function extractFirstHeaderToken(raw) {
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (typeof val !== "string" || !val.trim()) return "";
  return val.split(",")[0].trim();
}
__name6(extractFirstHeaderToken, "extractFirstHeaderToken");
function resolveClientRateLimitKey(req) {
  let candidate = "";
  if (Boolean(process.env.VERCEL)) {
    candidate = extractFirstHeaderToken(req.headers["x-vercel-forwarded-for"]) || extractFirstHeaderToken(req.headers["x-real-ip"]);
  }
  if (!candidate) {
    candidate = req.ip || req.socket?.remoteAddress || "127.0.0.1";
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.split(":")[0];
  }
  if (candidate.startsWith("::ffff:")) {
    candidate = candidate.slice(7);
  }
  try {
    return ipKeyGenerator(candidate || "127.0.0.1");
  } catch {
    return candidate || "127.0.0.1";
  }
}
__name6(resolveClientRateLimitKey, "resolveClientRateLimitKey");
function computeRetryAfterSecondsFromRateLimit(req, fallbackWindowMs) {
  const resetTime = req.rateLimit?.resetTime;
  if (resetTime instanceof Date) {
    const diffSec = Math.ceil((resetTime.getTime() - Date.now()) / 1e3);
    if (diffSec > 0) return diffSec;
  }
  return Math.ceil(fallbackWindowMs / 1e3);
}
__name6(computeRetryAfterSecondsFromRateLimit, "computeRetryAfterSecondsFromRateLimit");
function buildNbaApiInMemoryLimiter(cfg) {
  const nbaApiWindowMs = cfg.nbaApiWindowMinutes * 60 * 1e3;
  return rateLimit({
    windowMs: nbaApiWindowMs,
    limit: cfg.nbaApiLimit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    validate: false,
    keyGenerator: __name6((req) => `nba_api:${resolveClientRateLimitKey(req)}`, "keyGenerator"),
    handler: __name6((req, res) => {
      const retryAfterSeconds = computeRetryAfterSecondsFromRateLimit(req, nbaApiWindowMs);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: `Has superado el l\xEDmite de peticiones en la API (${cfg.nbaApiLimit} cada ${cfg.nbaApiWindowMinutes} min). Espera unos segundos antes de continuar.`,
        code: "NBA_API_RATE_LIMIT",
        retryAfterSeconds
      });
    }, "handler")
  });
}
__name6(buildNbaApiInMemoryLimiter, "buildNbaApiInMemoryLimiter");
var currentSecurityConfig = readSecurityConfigFromDisk();
var activeNbaApiLimiter = buildNbaApiInMemoryLimiter(currentSecurityConfig);
var rateLimitEpoch = 1;
var lastRedisSecuritySyncAt = 0;
var inflightRedisSecuritySync = null;
var localFixedWindowCounters = /* @__PURE__ */ new Map();
function pruneLocalCountersIfNeeded(now) {
  if (localFixedWindowCounters.size <= MAX_LOCAL_COUNTER_ENTRIES) return;
  for (const [k, entry] of localFixedWindowCounters.entries()) {
    if (entry.expiresAt <= now) {
      localFixedWindowCounters.delete(k);
    }
  }
  if (localFixedWindowCounters.size > MAX_LOCAL_COUNTER_ENTRIES) {
    const overflow = localFixedWindowCounters.size - MAX_LOCAL_COUNTER_ENTRIES;
    let deleted = 0;
    for (const k of localFixedWindowCounters.keys()) {
      localFixedWindowCounters.delete(k);
      deleted += 1;
      if (deleted >= overflow) break;
    }
  }
}
__name6(pruneLocalCountersIfNeeded, "pruneLocalCountersIfNeeded");
function buildDistributedRateLimitKey(scope, ipKey) {
  return `${REDIS_RATE_LIMIT_KEY_PREFIX}:e${rateLimitEpoch}:${scope}:${ipKey}`;
}
__name6(buildDistributedRateLimitKey, "buildDistributedRateLimitKey");
function applyDraft7RateLimitHeaders(res, limit, remaining, resetSeconds, windowMs) {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1e3));
  const safeRemaining = Math.max(0, remaining);
  const safeReset = Math.max(1, resetSeconds);
  res.setHeader("RateLimit-Policy", `${limit};w=${windowSec}`);
  res.setHeader("RateLimit", `limit=${limit}, remaining=${safeRemaining}, reset=${safeReset}`);
}
__name6(applyDraft7RateLimitHeaders, "applyDraft7RateLimitHeaders");
async function syncSecurityStateFromRedisIfStale(force = false) {
  const redisCfg = getRedisRestConfig();
  if (!redisCfg) return;
  const now = Date.now();
  if (!force && now - lastRedisSecuritySyncAt < SECURITY_STATE_SYNC_TTL_MS) {
    return;
  }
  if (inflightRedisSecuritySync) {
    await inflightRedisSecuritySync;
    return;
  }
  inflightRedisSecuritySync = (async () => {
    try {
      const raw = await executeUpstashCommand(redisCfg, ["GET", REDIS_SECURITY_STATE_KEY], REDIS_RATE_LIMIT_TIMEOUT_MS);
      lastRedisSecuritySyncAt = Date.now();
      if (!raw || typeof raw !== "string") return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.epoch === "number" && Number.isFinite(parsed.epoch) && parsed.epoch > rateLimitEpoch) {
        rateLimitEpoch = Math.floor(parsed.epoch);
        localFixedWindowCounters.clear();
      }
      const validCfg = parseValidatedSecurityConfigObject(parsed.config);
      if (validCfg && validCfg.updatedAt > currentSecurityConfig.updatedAt) {
        currentSecurityConfig = validCfg;
        activeNbaApiLimiter = buildNbaApiInMemoryLimiter(validCfg);
      }
    } catch {
      lastRedisSecuritySyncAt = Date.now();
    } finally {
      inflightRedisSecuritySync = null;
    }
  })();
  await inflightRedisSecuritySync;
}
__name6(syncSecurityStateFromRedisIfStale, "syncSecurityStateFromRedisIfStale");
async function persistSecurityStateToRedis(config, epoch) {
  const redisCfg = getRedisRestConfig();
  if (!redisCfg) return;
  try {
    const payload = JSON.stringify({ config, epoch });
    await executeUpstashCommand(redisCfg, ["SET", REDIS_SECURITY_STATE_KEY, payload], REDIS_RATE_LIMIT_TIMEOUT_MS);
    lastRedisSecuritySyncAt = Date.now();
  } catch (err) {
    console.error("[RadarNBA Security] Error persisting security state to Upstash Redis:", err);
  }
}
__name6(persistSecurityStateToRedis, "persistSecurityStateToRedis");
async function incrementDistributedCounter(scope, ipKey, windowMs) {
  await syncSecurityStateFromRedisIfStale(false);
  const fullKey = buildDistributedRateLimitKey(scope, ipKey);
  const now = Date.now();
  pruneLocalCountersIfNeeded(now);
  const existingLocal = localFixedWindowCounters.get(fullKey);
  let localEntry;
  if (!existingLocal || existingLocal.expiresAt <= now) {
    localEntry = { count: 1, expiresAt: now + windowMs };
  } else {
    localEntry = { count: existingLocal.count + 1, expiresAt: existingLocal.expiresAt };
  }
  localFixedWindowCounters.set(fullKey, localEntry);
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      const result = await executeUpstashCommand(
        redisCfg,
        ["EVAL", LUA_FIXED_WINDOW_INCR, "1", fullKey, String(windowMs)],
        REDIS_RATE_LIMIT_TIMEOUT_MS
      );
      if (Array.isArray(result) && result.length >= 2) {
        const count = Number(result[0]) || 1;
        const pttlMs = Number(result[1]) > 0 ? Number(result[1]) : windowMs;
        localFixedWindowCounters.set(fullKey, { count, expiresAt: Date.now() + pttlMs });
        return { count, pttlMs, backend: "upstash-redis" };
      }
    } catch (err) {
      console.warn("[RadarNBA Security] Upstash rate-limit increment fallback to memory:", err?.message || err);
    }
  }
  return {
    count: localEntry.count,
    pttlMs: Math.max(1e3, localEntry.expiresAt - now),
    backend: "memory"
  };
}
__name6(incrementDistributedCounter, "incrementDistributedCounter");
async function peekDistributedCounter(scope, ipKey, windowMs) {
  await syncSecurityStateFromRedisIfStale(false);
  const fullKey = buildDistributedRateLimitKey(scope, ipKey);
  const now = Date.now();
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      const result = await executeUpstashCommand(
        redisCfg,
        ["EVAL", LUA_PEEK_COUNTER, "1", fullKey],
        REDIS_RATE_LIMIT_TIMEOUT_MS
      );
      if (Array.isArray(result) && result.length >= 2) {
        const count = Math.max(0, Number(result[0]) || 0);
        const rawPttl = Number(result[1]);
        const pttlMs = count > 0 && rawPttl > 0 ? rawPttl : windowMs;
        if (count > 0 && rawPttl > 0) {
          localFixedWindowCounters.set(fullKey, { count, expiresAt: Date.now() + rawPttl });
        } else {
          localFixedWindowCounters.delete(fullKey);
        }
        return { count, pttlMs, backend: "upstash-redis" };
      }
    } catch (err) {
      console.warn("[RadarNBA Security] Upstash rate-limit peek fallback to memory:", err?.message || err);
    }
  }
  const existingLocal = localFixedWindowCounters.get(fullKey);
  if (!existingLocal || existingLocal.expiresAt <= now) {
    if (existingLocal) localFixedWindowCounters.delete(fullKey);
    return { count: 0, pttlMs: windowMs, backend: "memory" };
  }
  return {
    count: existingLocal.count,
    pttlMs: Math.max(1e3, existingLocal.expiresAt - now),
    backend: "memory"
  };
}
__name6(peekDistributedCounter, "peekDistributedCounter");
async function deleteDistributedCounter(scope, ipKey) {
  const fullKey = buildDistributedRateLimitKey(scope, ipKey);
  localFixedWindowCounters.delete(fullKey);
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    try {
      await executeUpstashCommand(redisCfg, ["DEL", fullKey], REDIS_RATE_LIMIT_TIMEOUT_MS);
    } catch {
    }
  }
}
__name6(deleteDistributedCounter, "deleteDistributedCounter");
function getRateLimitBackendInfo() {
  const configured = getRedisRestConfig() !== null;
  return {
    rateLimitBackend: configured ? "upstash-redis" : "memory",
    distributedRateLimit: configured
  };
}
__name6(getRateLimitBackendInfo, "getRateLimitBackendInfo");
async function getAdminSecurityConfig() {
  await syncSecurityStateFromRedisIfStale(true);
  return { ...currentSecurityConfig };
}
__name6(getAdminSecurityConfig, "getAdminSecurityConfig");
async function saveAdminSecurityConfig(nextValues) {
  await syncSecurityStateFromRedisIfStale(true);
  const updated = { ...nextValues, updatedAt: Date.now() };
  currentSecurityConfig = updated;
  writeSecurityConfigToDisk(updated);
  activeNbaApiLimiter = buildNbaApiInMemoryLimiter(updated);
  await persistSecurityStateToRedis(updated, rateLimitEpoch);
  return { ...updated };
}
__name6(saveAdminSecurityConfig, "saveAdminSecurityConfig");
async function resetAdminSecurityConfigToDefaults() {
  await syncSecurityStateFromRedisIfStale(true);
  const restored = { ...DEFAULT_ADMIN_SECURITY_VALUES, updatedAt: Date.now() };
  currentSecurityConfig = restored;
  writeSecurityConfigToDisk(restored);
  activeNbaApiLimiter = buildNbaApiInMemoryLimiter(restored);
  await persistSecurityStateToRedis(restored, rateLimitEpoch);
  return { ...restored };
}
__name6(resetAdminSecurityConfigToDefaults, "resetAdminSecurityConfigToDefaults");
async function resetAllRateLimitCounters() {
  await syncSecurityStateFromRedisIfStale(true);
  rateLimitEpoch = Math.max(rateLimitEpoch + 1, Date.now());
  localFixedWindowCounters.clear();
  activeNbaApiLimiter = buildNbaApiInMemoryLimiter(currentSecurityConfig);
  await persistSecurityStateToRedis(currentSecurityConfig, rateLimitEpoch);
}
__name6(resetAllRateLimitCounters, "resetAllRateLimitCounters");
async function recordAdminLoginFailure(req) {
  const windowMs = currentSecurityConfig.adminBruteForceWindowMinutes * 60 * 1e3;
  const ipKey = resolveClientRateLimitKey(req);
  return incrementDistributedCounter("admin_login", ipKey, windowMs);
}
__name6(recordAdminLoginFailure, "recordAdminLoginFailure");
async function resetAdminBruteForceForRequest(req) {
  const ipKey = resolveClientRateLimitKey(req);
  await deleteDistributedCounter("admin_login", ipKey);
}
__name6(resetAdminBruteForceForRequest, "resetAdminBruteForceForRequest");
function nbaApiRateLimiter(req, res, next) {
  void activeNbaApiLimiter(req, res, next);
}
__name6(nbaApiRateLimiter, "nbaApiRateLimiter");
async function nbaHeavyRefreshLimiter(req, res, next) {
  const flag = String(req.query.refresh || "").toLowerCase();
  if (flag !== "1" && flag !== "true") {
    next();
    return;
  }
  try {
    const cfg = currentSecurityConfig;
    const windowMs = cfg.nbaRefreshWindowMinutes * 60 * 1e3;
    const ipKey = resolveClientRateLimitKey(req);
    const { count, pttlMs } = await incrementDistributedCounter("nba_refresh", ipKey, windowMs);
    const retryAfterSeconds = Math.max(1, Math.ceil(pttlMs / 1e3));
    applyDraft7RateLimitHeaders(res, cfg.nbaRefreshLimit, cfg.nbaRefreshLimit - count, retryAfterSeconds, windowMs);
    if (count > cfg.nbaRefreshLimit) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: `Demasiadas actualizaciones forzadas seguidas (m\xE1x. ${cfg.nbaRefreshLimit} cada ${cfg.nbaRefreshWindowMinutes} min). Espera unos instantes antes de volver a actualizar.`,
        code: "NBA_REFRESH_RATE_LIMIT",
        retryAfterSeconds
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
__name6(nbaHeavyRefreshLimiter, "nbaHeavyRefreshLimiter");
async function adminEndpointFloodLimiter(req, res, next) {
  try {
    const cfg = currentSecurityConfig;
    const windowMs = cfg.adminFloodWindowMinutes * 60 * 1e3;
    const ipKey = resolveClientRateLimitKey(req);
    const { count, pttlMs } = await incrementDistributedCounter("admin_flood", ipKey, windowMs);
    const retryAfterSeconds = Math.max(1, Math.ceil(pttlMs / 1e3));
    applyDraft7RateLimitHeaders(res, cfg.adminFloodLimit, cfg.adminFloodLimit - count, retryAfterSeconds, windowMs);
    if (count > cfg.adminFloodLimit) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: "Demasiadas solicitudes sobre la zona privada. Acceso pausado temporalmente por seguridad.",
        code: "ADMIN_FLOOD_RATE_LIMIT",
        retryAfterSeconds
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
__name6(adminEndpointFloodLimiter, "adminEndpointFloodLimiter");
async function adminBruteForceLimiter(req, res, next) {
  try {
    const cfg = currentSecurityConfig;
    const windowMs = cfg.adminBruteForceWindowMinutes * 60 * 1e3;
    const ipKey = resolveClientRateLimitKey(req);
    const { count, pttlMs } = await peekDistributedCounter("admin_login", ipKey, windowMs);
    const retryAfterSeconds = Math.max(1, Math.ceil(pttlMs / 1e3));
    applyDraft7RateLimitHeaders(
      res,
      cfg.adminBruteForceMaxAttempts,
      cfg.adminBruteForceMaxAttempts - count,
      retryAfterSeconds,
      windowMs
    );
    if (count >= cfg.adminBruteForceMaxAttempts) {
      const retryMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        ok: false,
        error: `Demasiados intentos fallidos (m\xE1x. ${cfg.adminBruteForceMaxAttempts}). Acceso bloqueado temporalmente por seguridad (${retryMinutes} min).`,
        code: "ADMIN_BRUTE_FORCE_LOCKED",
        retryAfterSeconds
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
__name6(adminBruteForceLimiter, "adminBruteForceLimiter");
async function verifyAdminPasscodeConstantTime(candidateRaw) {
  if (typeof candidateRaw !== "string") return false;
  const candidate = candidateRaw.trim();
  if (!candidate || candidate.length > 128) return false;
  const material = getDerivedAdminCryptoMaterial();
  if (!material) return false;
  const candidateKey = await deriveScryptKeyAsync(candidate.normalize("NFKC"), material.passcodeSalt);
  if (candidateKey.length !== material.expectedPasscodeKey.length) return false;
  return crypto2.timingSafeEqual(candidateKey, material.expectedPasscodeKey);
}
__name6(verifyAdminPasscodeConstantTime, "verifyAdminPasscodeConstantTime");
function issueAdminSessionToken() {
  const material = getDerivedAdminCryptoMaterial();
  if (!material) {
    throw new Error("ADMIN_ENV_NOT_CONFIGURED");
  }
  const now = Date.now();
  const ttlMs = currentSecurityConfig.adminSessionTtlHours * 60 * 60 * 1e3;
  const expiresAt = now + ttlMs;
  const payload = { sub: "radarnba_admin", iat: now, exp: expiresAt, jti: crypto2.randomBytes(8).toString("hex") };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sigB64 = crypto2.createHmac("sha256", material.sessionSigningKey).update(`v2.${payloadB64}`, "utf8").digest("base64url");
  return { token: `v2.${payloadB64}.${sigB64}`, expiresAt };
}
__name6(issueAdminSessionToken, "issueAdminSessionToken");
function verifyAdminSessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return { valid: false };
  const material = getDerivedAdminCryptoMaterial();
  if (!material) return { valid: false };
  const parts = rawToken.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "v2") return { valid: false };
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64 || payloadB64.length > 512 || sigB64.length > 128) return { valid: false };
  let sigBuf;
  try {
    sigBuf = Buffer.from(sigB64, "base64url");
  } catch {
    return { valid: false };
  }
  const expectedBuf = crypto2.createHmac("sha256", material.sessionSigningKey).update(`v2.${payloadB64}`, "utf8").digest();
  if (sigBuf.length !== expectedBuf.length || !crypto2.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false };
  }
  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!decoded || decoded.sub !== "radarnba_admin" || typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp) || decoded.exp <= Date.now()) {
      return { valid: false };
    }
    return { valid: true, expiresAt: decoded.exp };
  } catch {
    return { valid: false };
  }
}
__name6(verifyAdminSessionToken, "verifyAdminSessionToken");
function parseCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    if (k === name) {
      try {
        return decodeURIComponent(pair.slice(idx + 1).trim());
      } catch {
        return pair.slice(idx + 1).trim();
      }
    }
  }
  return null;
}
__name6(parseCookieValue, "parseCookieValue");
function extractAdminTokenFromRequest(req) {
  const authHdr = req.headers.authorization;
  if (typeof authHdr === "string" && authHdr.trim().toLowerCase().startsWith("bearer ")) {
    const token = authHdr.trim().slice(7).trim();
    if (token) return token;
  }
  return parseCookieValue(req.headers.cookie, ADMIN_COOKIE_NAME);
}
__name6(extractAdminTokenFromRequest, "extractAdminTokenFromRequest");
function getTrustedExpectedHosts(req) {
  const hosts = /* @__PURE__ */ new Set();
  const hostHdr = extractFirstHeaderToken(req.headers.host);
  if (hostHdr) {
    hosts.add(hostHdr.toLowerCase());
  }
  if (Boolean(process.env.VERCEL)) {
    const fwdHost = extractFirstHeaderToken(req.headers["x-forwarded-host"]);
    if (fwdHost) {
      hosts.add(fwdHost.toLowerCase());
    }
    const vercelUrl = (process.env.VERCEL_URL || "").trim();
    if (vercelUrl) {
      hosts.add(vercelUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase());
    }
  }
  const appUrl = (process.env.APP_URL || "").trim();
  if (appUrl && /^https?:\/\//i.test(appUrl)) {
    try {
      hosts.add(new URL(appUrl).host.toLowerCase());
    } catch {
    }
  }
  return hosts;
}
__name6(getTrustedExpectedHosts, "getTrustedExpectedHosts");
function extractUrlHostSafe(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === "null") return null;
  try {
    return new URL(trimmed).host.toLowerCase();
  } catch {
    return null;
  }
}
__name6(extractUrlHostSafe, "extractUrlHostSafe");
function requireAdminCsrfProtection(req, res, next) {
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }
  const csrfTokenHeader = extractFirstHeaderToken(req.headers[ADMIN_CSRF_HEADER_NAME]);
  if (csrfTokenHeader !== ADMIN_CSRF_HEADER_VALUE) {
    res.setHeader("Cache-Control", "no-store");
    res.status(403).json({
      ok: false,
      error: "Solicitud bloqueada por protecci\xF3n CSRF (cabecera de verificaci\xF3n ausente).",
      code: "ADMIN_CSRF_REJECTED"
    });
    return;
  }
  const trustedHosts = getTrustedExpectedHosts(req);
  if (trustedHosts.size === 0) {
    res.setHeader("Cache-Control", "no-store");
    res.status(403).json({
      ok: false,
      error: "Solicitud bloqueada por protecci\xF3n CSRF (Host de destino no verificable).",
      code: "ADMIN_CSRF_REJECTED"
    });
    return;
  }
  const rawOrigin = extractFirstHeaderToken(req.headers.origin);
  const rawReferer = extractFirstHeaderToken(req.headers.referer);
  if (!rawOrigin && !rawReferer) {
    res.setHeader("Cache-Control", "no-store");
    res.status(403).json({
      ok: false,
      error: "Solicitud bloqueada por protecci\xF3n CSRF (cabecera Origin/Referer obligatoria).",
      code: "ADMIN_CSRF_REJECTED"
    });
    return;
  }
  if (rawOrigin) {
    const originHost = extractUrlHostSafe(rawOrigin);
    if (!originHost || !trustedHosts.has(originHost)) {
      res.setHeader("Cache-Control", "no-store");
      res.status(403).json({
        ok: false,
        error: "Solicitud bloqueada por protecci\xF3n CSRF (origen cruzado no autorizado).",
        code: "ADMIN_CSRF_REJECTED"
      });
      return;
    }
  } else if (rawReferer) {
    const refererHost = extractUrlHostSafe(rawReferer);
    if (!refererHost || !trustedHosts.has(refererHost)) {
      res.setHeader("Cache-Control", "no-store");
      res.status(403).json({
        ok: false,
        error: "Solicitud bloqueada por protecci\xF3n CSRF (referencia cruzada no autorizada).",
        code: "ADMIN_CSRF_REJECTED"
      });
      return;
    }
  }
  next();
}
__name6(requireAdminCsrfProtection, "requireAdminCsrfProtection");
function requireAdminAuth(req, res, next) {
  const readiness = getAdminAuthReadiness();
  if (!readiness.configured) {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      error: readiness.reason || "Acceso administrativo deshabilitado por seguridad.",
      code: readiness.code || "ADMIN_ENV_NOT_CONFIGURED"
    });
    return;
  }
  const token = extractAdminTokenFromRequest(req);
  const check = verifyAdminSessionToken(token);
  if (!check.valid) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json({ error: "No autorizado. Inicia sesi\xF3n en la zona privada /admin.", code: "ADMIN_AUTH_REQUIRED" });
    return;
  }
  next();
}
__name6(requireAdminAuth, "requireAdminAuth");

// src/server/telemetryLogger.ts
import crypto3 from "crypto";
var SERVER_START_TIME = Date.now();
var MAX_RING_BUFFER_SIZE = 500;
var logRingBuffer = [];
var requestLatenciesMs = [];
var MAX_LATENCY_SAMPLES = 1e3;
var totalRequestsCount = 0;
var s2xxCount = 0;
var s3xxCount = 0;
var s4xxCount = 0;
var s5xxCount = 0;
var rateLimit429Count = 0;
var ACTIVE_ALERTS = /* @__PURE__ */ new Map();
var SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passcode/i,
  /secret/i,
  /token/i,
  /auth/i,
  /cookie/i,
  /session/i,
  /bearer/i,
  /api[_-]?key/i,
  /private[_-]?key/i
];
var ANONYMIZATION_SALT = process.env.LOG_ANONYMIZATION_SALT || "radarnba_telemetry_salt_v1";
function hashClientIp(ipRaw) {
  if (!ipRaw) return "ip_unknown";
  const cleanIp = String(ipRaw).split(",")[0].trim();
  const hash = crypto3.createHash("sha256").update(`${cleanIp}:${ANONYMIZATION_SALT}`).digest("hex");
  return `ip_${hash.slice(0, 10)}`;
}
function sanitizeLogData(data, depth = 0) {
  if (depth > 4 || data === null || data === void 0) {
    return data;
  }
  if (typeof data === "string") {
    let clean = data;
    clean = clean.replace(/(bearer\s+)[a-zA-Z0-9._~+/-]+=*/gi, "$1[REDACTED_TOKEN]");
    clean = clean.replace(/(passcode=)[^&]+/gi, "$1[REDACTED]");
    clean = clean.replace(/(radarnba_admin_session=)[^;]+/gi, "$1[REDACTED_COOKIE]");
    return clean;
  }
  if (Array.isArray(data)) {
    return data.slice(0, 50).map((item) => sanitizeLogData(item, depth + 1));
  }
  if (typeof data === "object") {
    const cleanObj = {};
    for (const [key, value] of Object.entries(data)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        cleanObj[key] = "[REDACTED]";
      } else {
        cleanObj[key] = sanitizeLogData(value, depth + 1);
      }
    }
    return cleanObj;
  }
  return data;
}
function pushToRingBuffer(entry) {
  logRingBuffer.unshift(entry);
  if (logRingBuffer.length > MAX_RING_BUFFER_SIZE) {
    logRingBuffer.pop();
  }
}
function recordLatency(durationMs) {
  requestLatenciesMs.push(durationMs);
  if (requestLatenciesMs.length > MAX_LATENCY_SAMPLES) {
    requestLatenciesMs.shift();
  }
}
function calculatePercentile(p) {
  if (requestLatenciesMs.length === 0) return 0;
  const sorted = [...requestLatenciesMs].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length));
  return Math.round(sorted[index]);
}
function logTelemetry(level, event, meta = {}) {
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    event,
    ...meta
  };
  if (entry.message) entry.message = sanitizeLogData(entry.message);
  if (entry.meta) entry.meta = sanitizeLogData(entry.meta);
  pushToRingBuffer(entry);
  const jsonStr = JSON.stringify(entry);
  if (level === "error" || level === "alert") {
    console.error(`[RadarNBA Telemetry] ${jsonStr}`);
  } else if (level === "warn") {
    console.warn(`[RadarNBA Telemetry] ${jsonStr}`);
  } else {
    console.log(`[RadarNBA Telemetry] ${jsonStr}`);
  }
  evaluateAlertConditions();
  return entry;
}
function expressTelemetryMiddleware(req, res, next) {
  const startTime = Date.now();
  const ipHash = hashClientIp(req.headers["x-forwarded-for"] || req.socket?.remoteAddress);
  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;
    totalRequestsCount++;
    recordLatency(durationMs);
    if (statusCode >= 200 && statusCode < 300) s2xxCount++;
    else if (statusCode >= 300 && statusCode < 400) s3xxCount++;
    else if (statusCode >= 400 && statusCode < 500) {
      s4xxCount++;
      if (statusCode === 429) rateLimit429Count++;
    } else if (statusCode >= 500) {
      s5xxCount++;
    }
    const level = statusCode >= 500 ? "error" : statusCode === 429 ? "warn" : "info";
    logTelemetry(level, "http_request", {
      method: req.method,
      path: req.path || req.url,
      statusCode,
      durationMs,
      ipHash,
      meta: {
        queryKeys: Object.keys(req.query || {}),
        contentLength: res.getHeader("content-length") || 0,
        cacheControl: res.getHeader("cache-control") || "none"
      }
    });
  });
  next();
}
function evaluateAlertConditions() {
  const nowStr = (/* @__PURE__ */ new Date()).toISOString();
  const recentWindow = logRingBuffer.slice(0, 100);
  const totalRecent = recentWindow.length;
  if (totalRecent >= 20) {
    const recent5xx = recentWindow.filter((l) => l.statusCode && l.statusCode >= 500).length;
    const errorRate5xx = recent5xx / totalRecent * 100;
    if (errorRate5xx >= 12) {
      ACTIVE_ALERTS.set("HIGH_ERROR_RATE", {
        id: "alert_5xx_rate",
        triggeredAt: nowStr,
        type: "HIGH_ERROR_RATE",
        severity: "high",
        title: "Tasa elevada de errores HTTP 5xx",
        description: `Un ${errorRate5xx.toFixed(1)}% de las \xFAltimas 100 peticiones respondieron con error de servidor (>= 500).`,
        metrics: { recent5xx, totalRecent, errorRate5xx: Math.round(errorRate5xx) }
      });
    } else {
      ACTIVE_ALERTS.delete("HIGH_ERROR_RATE");
    }
  }
  const p95 = calculatePercentile(95);
  if (p95 >= 3e3 && requestLatenciesMs.length >= 25) {
    ACTIVE_ALERTS.set("HIGH_LATENCY", {
      id: "alert_latency_p95",
      triggeredAt: nowStr,
      type: "HIGH_LATENCY",
      severity: "medium",
      title: "Latencia p95 elevada en respuestas de servidor",
      description: `El percentil 95 de latencia ha alcanzado ${p95}ms en las muestras recientes.`,
      metrics: { p95Ms: p95, samples: requestLatenciesMs.length }
    });
  } else {
    ACTIVE_ALERTS.delete("HIGH_LATENCY");
  }
  if (rateLimit429Count >= 15) {
    ACTIVE_ALERTS.set("RATE_LIMIT_FLOOD", {
      id: "alert_429_flood",
      triggeredAt: nowStr,
      type: "RATE_LIMIT_FLOOD",
      severity: "medium",
      title: "Pico de bloqueos por Rate Limit (HTTP 429)",
      description: `Se han registrado ${rateLimit429Count} peticiones bloqueadas por rate-limiting.`,
      metrics: { rateLimit429Count }
    });
  } else {
    ACTIVE_ALERTS.delete("RATE_LIMIT_FLOOD");
  }
}
function getTelemetrySummary(circuitsMetrics) {
  const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1e3);
  const recentOneMinLogs = logRingBuffer.filter(
    (l) => Date.now() - new Date(l.timestamp).getTime() <= 6e4
  );
  const avgMs = requestLatenciesMs.length > 0 ? Math.round(requestLatenciesMs.reduce((a, b) => a + b, 0) / requestLatenciesMs.length) : 0;
  const totalErrors = s4xxCount + s5xxCount;
  const errorRatePct = totalRequestsCount > 0 ? Math.round(totalErrors / totalRequestsCount * 1e3) / 10 : 0;
  return {
    uptimeSeconds,
    totalRequests: totalRequestsCount,
    requestsLastMinute: recentOneMinLogs.length,
    statusDistribution: {
      s2xx: s2xxCount,
      s3xx: s3xxCount,
      s4xx: s4xxCount,
      s5xx: s5xxCount
    },
    latency: {
      avgMs,
      p50Ms: calculatePercentile(50),
      p90Ms: calculatePercentile(90),
      p95Ms: calculatePercentile(95)
    },
    errorRatePct,
    activeAlerts: Array.from(ACTIVE_ALERTS.values()),
    circuitBreakerStatus: circuitsMetrics || {},
    recentLogs: logRingBuffer.slice(0, 50)
  };
}

// src/server/apiApp.ts
var isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
var isVercelDeployment = Boolean(process.env.VERCEL);
function sendPreserializedJsonBuffers(req, res, buffers, cacheControl) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("Cache-Control", cacheControl);
  const acceptEnc = String(req.headers["accept-encoding"] || "");
  if (acceptEnc.includes("gzip") && buffers.jsonBuffer.byteLength > 2048) {
    res.setHeader("Content-Encoding", "gzip");
    res.send(buffers.gzipBuffer);
    return;
  }
  res.send(buffers.jsonBuffer);
}
var app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { defaultSrc: ["'self'"], scriptSrc: isProduction ? ["'self'", "'unsafe-inline'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"], styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"], imgSrc: ["'self'", "data:", "blob:", "https://cdn.nba.com", "https://ak-static.cms.nba.com", "https://a.espncdn.com", "https:"], connectSrc: isProduction ? ["'self'"] : ["'self'", "ws:", "wss:"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: isVercelDeployment ? ["'self'"] : ["'self'", "https://aistudio.google.com", "https://*.google.com", "https://*.googleusercontent.com", "https://*.run.app"], upgradeInsecureRequests: isProduction ? [] : null } }, frameguard: isVercelDeployment ? { action: "sameorigin" } : false, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: isVercelDeployment ? { policy: "same-origin" } : false, crossOriginResourcePolicy: { policy: "cross-origin" }, dnsPrefetchControl: { allow: true }, referrerPolicy: { policy: "same-origin" }, strictTransportSecurity: { maxAge: 31536e3, includeSubDomains: true, preload: false } }));
app.use((req, _res, next) => {
  const desc = Object.getOwnPropertyDescriptor(req, "body");
  if (desc && "value" in desc && desc.value !== void 0 && typeof desc.value === "object" && desc.value !== null && !req._body) {
    req._body = true;
  }
  next();
});
app.use(express.json({ limit: "512kb" }));
app.use(expressTelemetryMiddleware);
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Cuerpo JSON mal formado.", code: "INVALID_JSON_BODY" });
    return;
  }
  next(err);
});
app.use("/api/nba", nbaApiRateLimiter, nbaHeavyRefreshLimiter);
app.use("/api/admin", adminEndpointFloodLimiter);
app.get("/admin", adminEndpointFloodLimiter, (_req, _res, next) => {
  next();
});
app.get("/api/health", (_req, res) => {
  const snap = readNbaSnapshotFromDisk();
  res.json({ status: "ok", name: "RadarNBA", runtime: process.env.VERCEL ? "vercel-serverless" : "node-server", snapshotLoaded: Boolean(snap), snapshotGeneratedAt: snap?.generatedAt || null, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.post("/api/admin/login", requireAdminCsrfProtection, adminBruteForceLimiter, validateRequest({ query: emptyQuerySchema, body: adminLoginBodySchema }), async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const readiness = getAdminAuthReadiness();
    if (!readiness.configured) {
      res.status(503).json({
        ok: false,
        code: readiness.code || "ADMIN_ENV_NOT_CONFIGURED",
        error: readiness.reason || "Acceso administrativo deshabilitado por seguridad: variables de entorno no configuradas."
      });
      return;
    }
    const { body } = getValidated(req);
    const isValid = await verifyAdminPasscodeConstantTime(body.passcode);
    if (!isValid) {
      await recordAdminLoginFailure(req);
      await new Promise((resolve) => setTimeout(resolve, 250));
      res.status(401).json({ ok: false, error: "Clave incorrecta. Int\xE9ntalo de nuevo." });
      return;
    }
    await resetAdminBruteForceForRequest(req);
    const { token, expiresAt } = issueAdminSessionToken();
    const maxAgeSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1e3));
    res.setHeader("Set-Cookie", buildAdminSessionCookieHeader(token, maxAgeSec, req));
    res.json({ ok: true, token, expiresAt });
  } catch (err) {
    console.error("Error in /api/admin/login:", err);
    res.status(500).json({ ok: false, error: "Error al verificar credenciales." });
  }
});
app.get("/api/admin/session", validateRequest({ query: emptyQuerySchema }), (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const readiness = getAdminAuthReadiness();
  if (!readiness.configured) {
    res.status(503).json({ authenticated: false, code: readiness.code || "ADMIN_ENV_NOT_CONFIGURED" });
    return;
  }
  const token = extractAdminTokenFromRequest(req);
  const check = verifyAdminSessionToken(token);
  if (!check.valid) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, expiresAt: check.expiresAt });
});
app.post("/api/admin/logout", requireAdminCsrfProtection, validateRequest({ query: emptyQuerySchema }), (req, res) => {
  res.setHeader("Set-Cookie", buildClearAdminSessionCookieHeader(req));
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true });
});
app.get("/api/admin/security-config", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    const config = await getAdminSecurityConfig();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config, defaults: DEFAULT_ADMIN_SECURITY_VALUES, bounds: ADMIN_SECURITY_BOUNDS, circuits: getAllCircuitMetrics(), ...getRateLimitBackendInfo() });
  } catch (err) {
    console.error("Error in GET /api/admin/security-config:", err);
    res.status(500).json({ ok: false, error: "No se pudo leer la configuraci\xF3n de seguridad." });
  }
});
app.put("/api/admin/security-config", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: adminSecurityConfigBodySchema }), async (req, res) => {
  try {
    const { body } = getValidated(req);
    const saved = await saveAdminSecurityConfig(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: saved, defaults: DEFAULT_ADMIN_SECURITY_VALUES, circuits: getAllCircuitMetrics(), ...getRateLimitBackendInfo() });
  } catch (err) {
    console.error("Error in PUT /api/admin/security-config:", err);
    res.status(500).json({ ok: false, error: "No se pudo guardar la configuraci\xF3n de seguridad." });
  }
});
app.post("/api/admin/security-config/reset-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    const restored = await resetAdminSecurityConfigToDefaults();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: restored, defaults: DEFAULT_ADMIN_SECURITY_VALUES, circuits: getAllCircuitMetrics(), ...getRateLimitBackendInfo() });
  } catch (err) {
    console.error("Error in POST /api/admin/security-config/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudieron restaurar los valores base." });
  }
});
app.post("/api/admin/security-config/reset-counters", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    await resetAllRateLimitCounters();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, clearedAt: Date.now(), circuits: getAllCircuitMetrics(), ...getRateLimitBackendInfo() });
  } catch (err) {
    console.error("Error in POST /api/admin/security-config/reset-counters:", err);
    res.status(500).json({ ok: false, error: "No se pudieron reiniciar los contadores IP." });
  }
});
app.get("/api/admin/circuit-breaker", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, circuits: getAllCircuitMetrics() });
});
app.post("/api/admin/circuit-breaker/reset", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  resetCircuit();
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, clearedAt: Date.now(), circuits: getAllCircuitMetrics() });
});
app.get("/api/admin/telemetry", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, telemetry: getTelemetrySummary(getAllCircuitMetrics()) });
});
app.get("/api/admin/gameday-thresholds", requireAdminAuth, validateRequest({ query: emptyQuerySchema }), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, config: getGamedayThresholdsConfig(), defaults: DEFAULT_GAMEDAY_THRESHOLDS });
});
app.put("/api/admin/gameday-thresholds", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema, body: gamedayThresholdsBodySchema }), async (req, res) => {
  try {
    const { body } = getValidated(req);
    const updated = updateGamedayThresholdsConfig(body);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: updated, defaults: DEFAULT_GAMEDAY_THRESHOLDS });
  } catch (err) {
    console.error("Error in PUT /api/admin/gameday-thresholds:", err);
    res.status(500).json({ ok: false, error: "No se pudieron guardar los criterios de jornada." });
  }
});
app.post("/api/admin/gameday-thresholds/reset-defaults", requireAdminCsrfProtection, requireAdminAuth, validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    const restored = resetGamedayThresholdsConfigDefaults();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, config: restored, defaults: DEFAULT_GAMEDAY_THRESHOLDS });
  } catch (err) {
    console.error("Error in POST /api/admin/gameday-thresholds/reset-defaults:", err);
    res.status(500).json({ ok: false, error: "No se pudieron restablecer los criterios recomendados." });
  }
});
app.get("/api/nba/bootstrap", validateRequest({ query: bootstrapQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const { seasonMode: season, refresh, wire } = query;
    const isClosedHistorical = season === "2026" || season === "2025" || season === "2024";
    const cacheControl = refresh ? "no-store" : isClosedHistorical ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=60, s-maxage=180, stale-while-revalidate=900";
    if (wire === "legacy") {
      res.setHeader("Cache-Control", cacheControl);
      const legacyPayload = await getBootstrapPayload(season, refresh);
      res.json(legacyPayload);
      return;
    }
    const buffers = await getBootstrapWireBuffers(season, refresh);
    sendPreserializedJsonBuffers(req, res, buffers, cacheControl);
  } catch (err) {
    console.error("Error in /api/nba/bootstrap:", err);
    res.status(500).json({ error: err?.message || "Error al cargar datos NBA." });
  }
});
app.get("/api/nba/search", validateRequest({ query: searchQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");
    const results = await searchLeaguePlayers(query.q);
    res.json({ results });
  } catch (err) {
    console.error("Error in /api/nba/search:", err);
    res.status(500).json({ error: err?.message || "Error en b\xFAsqueda NBA." });
  }
});
app.get("/api/nba/player/:playerId", validateRequest({ params: playerParamsSchema, query: playerSummaryQuerySchema }), async (req, res) => {
  try {
    const { params, query } = getValidated(req);
    const isClosedHistorical = query.seasonMode === "2026" || query.seasonMode === "2025" || query.seasonMode === "2024";
    res.setHeader(
      "Cache-Control",
      isClosedHistorical ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=120, s-maxage=600, stale-while-revalidate=3600"
    );
    const player = await getSinglePlayerSummary(params.playerId, query.seasonMode);
    if (!player) {
      res.status(404).json({ error: "Jugador no encontrado." });
      return;
    }
    res.json({ player });
  } catch (err) {
    console.error("Error in /api/nba/player/:playerId:", err);
    res.status(500).json({ error: err?.message || "Error al consultar jugador." });
  }
});
app.get("/api/nba/player/:playerId/inspector", validateRequest({ params: playerParamsSchema, query: emptyQuerySchema }), async (req, res) => {
  try {
    const { params } = getValidated(req);
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=3600");
    const dossier = await getPlayerInspectorDossier(params.playerId);
    if (!dossier) {
      res.status(404).json({ error: "Jugador no encontrado." });
      return;
    }
    res.json(dossier);
  } catch (err) {
    console.error("Error in /api/nba/player/:playerId/inspector:", err);
    res.status(500).json({ error: err?.message || "Error al cargar ficha completa del jugador." });
  }
});
app.get("/api/nba/team/:teamId/roster", validateRequest({ params: teamParamsSchema, query: emptyQuerySchema }), async (req, res) => {
  try {
    const { params } = getValidated(req);
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");
    const roster = await getTeamRoster(params.teamId);
    res.json({ roster });
  } catch (err) {
    console.error("Error in /api/nba/team/:teamId/roster:", err);
    res.status(500).json({ error: err?.message || "Error al cargar plantilla." });
  }
});
app.get("/api/nba/milestones", validateRequest({ query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    res.setHeader("Cache-Control", query.refresh ? "no-store" : "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");
    const payload = await getMilestonesPayload(Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/milestones:", err);
    res.status(500).json({ error: err?.message || "Error al calcular hitos." });
  }
});
app.get("/api/nba/awards", validateRequest({ query: awardsQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const isClosedHistorical = query.season === "2026" || query.season === "2025" || query.season === "2024";
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : isClosedHistorical ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400"
    );
    const payload = await getSeasonAwardsPayload(query.season, Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/awards:", err);
    res.status(500).json({ error: err?.message || "Error al calcular carreras a los premios NBA." });
  }
});
app.get("/api/nba/gameday", validateRequest({ query: gamedayQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const todayIso = getEasternTodayIso();
    const isPastDate = query.date && query.date < todayIso;
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : isPastDate ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=30, s-maxage=90, stale-while-revalidate=300"
    );
    const payload = await getGameDayPayload(query.date, Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/gameday:", err);
    res.status(500).json({ error: err?.message || "Error al analizar la jornada NBA." });
  }
});
app.get("/api/nba/gameday/chronicle", validateRequest({ query: gamedayQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const todayIso = getEasternTodayIso();
    const isPastDate = query.date && query.date < todayIso;
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : isPastDate ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=60, s-maxage=300, stale-while-revalidate=1800"
    );
    const payload = await scoutingEngine.buildGameDayChroniclePayload(query.date, Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/gameday/chronicle:", err);
    res.status(500).json({ error: err?.message || "Error al generar cr\xF3nica de la jornada." });
  }
});
app.get("/api/nba/scoreboard", validateRequest({ query: gamedayQuerySchema }), async (req, res) => {
  try {
    const { query } = getValidated(req);
    const clientEtag = req.headers["if-none-match"];
    const delta = await getScoreboardDeltaPayload(query.date, Boolean(query.refresh), clientEtag);
    if (delta.unmodified) {
      res.setHeader("ETag", delta.hash);
      res.setHeader("Cache-Control", "public, max-age=5, s-maxage=10, stale-while-revalidate=30");
      res.status(304).end();
      return;
    }
    res.setHeader("ETag", delta.hash);
    if (delta.buffers) {
      sendPreserializedJsonBuffers(req, res, delta.buffers, "public, max-age=5, s-maxage=10, stale-while-revalidate=30");
    } else {
      res.json(delta);
    }
  } catch (err) {
    console.error("Error in /api/nba/scoreboard:", err);
    res.status(500).json({ error: err?.message || "Error al obtener marcador delta." });
  }
});
app.get("/api/nba/game/:eventId/boxscore", validateRequest({ params: gameEventParamsSchema, query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { params, query } = getValidated(req);
    const report = await scoutingEngine.buildGameOfficialReportData(params.eventId, Boolean(query.refresh));
    const isFinal = report?.status === "final" || report?.gameStatus === 3 || Boolean(report?.isFinal);
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : isFinal ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=15, s-maxage=30, stale-while-revalidate=120"
    );
    res.json(report);
  } catch (err) {
    console.error("Error in /api/nba/game/:eventId/boxscore:", err);
    res.status(500).json({ error: err?.message || "Error al cargar acta oficial del partido." });
  }
});
app.get("/api/nba/game/:eventId/narrative", validateRequest({ params: gameEventParamsSchema, query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    const { params, query } = getValidated(req);
    const narrative = await scoutingEngine.buildGameNarrativePayload(params.eventId, Boolean(query.refresh));
    const isFinal = narrative?.isFinal || Boolean(narrative?.report?.isFinal);
    res.setHeader(
      "Cache-Control",
      query.refresh ? "no-store" : isFinal ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=60, s-maxage=300, stale-while-revalidate=1800"
    );
    res.json(narrative);
  } catch (err) {
    const cleanErr = String(err instanceof Error ? err.message : err || "").replace(/[\{\}\"\:]/g, " ").slice(0, 100);
    console.info(`[RadarNBA API] Respuesta determinista para cr\xF3nica -> ${cleanErr}`);
    try {
      const { params } = getValidated(req);
      const report = await scoutingEngine.buildGameOfficialReportData(params.eventId, false);
      const fallback = scoutingEngine.buildDeterministicGameNarrative(report);
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=1800");
      res.json(fallback);
    } catch (innerErr) {
      const cleanInner = String(innerErr instanceof Error ? innerErr.message : innerErr || "").replace(/[\{\}\"\:]/g, " ").slice(0, 100);
      console.warn(`[RadarNBA API] Fallback de cr\xF3nica secundario -> ${cleanInner}`);
      res.status(500).json({ error: "Error al redactar cr\xF3nica del partido." });
    }
  }
});
app.get(["/api/nba/fantasy/context", "/api/nba/fantasy/espn"], validateRequest({ query: refreshOnlyQuerySchema }), async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const { query } = getValidated(req);
    const payload = await getFantasyEspnSyncPayload(Boolean(query.refresh));
    res.json(payload);
  } catch (err) {
    console.error("Error in /api/nba/fantasy/context:", err);
    res.status(500).json({ error: err?.message || "Error al cargar calendario y partes NBA para Fantasy." });
  }
});
app.get("/api/nba/fantasy/manual-state", validateRequest({ query: emptyQuerySchema }), async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const state = await readManualFantasyState();
    const backendInfo = getFantasyStorageBackendInfo();
    res.json({ state, ...backendInfo });
  } catch (err) {
    console.error("Error reading manual fantasy state:", err);
    res.status(500).json({ error: "Error al leer estado guardado de la liga Fantasy." });
  }
});
app.put("/api/nba/fantasy/manual-state", validateRequest({ query: emptyQuerySchema, body: manualFantasyStateBodySchema }), async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const { body } = getValidated(req);
    const saved = await writeManualFantasyState(body);
    if (!saved) {
      res.status(400).json({ error: "Formato de datos de liga Fantasy no v\xE1lido." });
      return;
    }
    const backendInfo = getFantasyStorageBackendInfo();
    res.json({ ok: true, state: saved, ...backendInfo });
  } catch (err) {
    console.error("Error saving manual fantasy state:", err);
    res.status(500).json({ error: err?.message || "Error al guardar permanentemente la liga Fantasy." });
  }
});
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta de API no encontrada.", code: "API_ROUTE_NOT_FOUND" });
});
app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (String(req.url || "").startsWith("/api")) {
    console.error("[RadarNBA API Unhandled Error]:", err);
    res.status(500).json({ error: err?.message || "Error interno del servidor de estad\xEDsticas.", code: "INTERNAL_API_ERROR" });
    return;
  }
  next(err);
});
var apiApp_default = app;
export {
  app,
  apiApp_default as default
};
