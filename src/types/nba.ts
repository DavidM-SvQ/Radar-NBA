export type SeasonMode = 'continuous' | '2027' | '2026';

export type WindowSize = 3 | 5 | 10;

export type ExperienceMode = 'simple' | 'advanced';

export type FilterPresetId = 'broad' | 'balanced' | 'blockbusters' | 'custom';

export type ActiveSection =
  | 'home'
  | 'gameday'
  | 'anomalies'
  | 'streaks'
  | 'duel'
  | 'milestones'
  | 'comparator'
  | 'teams'
  | 'players'
  | 'glossary';

export type MilestoneComparisonMode =
  | 'full_season'
  | 'same_opening'
  | 'head_to_head';

export type DataSourceKind = 'nba_official_hybrid' | 'espn_fallback';

export interface PlayerAdvancedProfile {
  gp: number;
  usgPct: number; // Usage %
  tsPct: number; // True Shooting %
  efgPct: number; // Effective FG %
  offRtg: number; // Offensive Rating
  defRtg: number; // Defensive Rating
  netRtg: number; // Net Rating
  pie: number; // Player Impact Estimate (0-100 scale, e.g. 18.4%)
  pace: number; // Pace on court
  astPct: number; // Assist %
  astTo: number; // AST / TOV ratio
  astRatio: number; // Assist Ratio
  orebPct: number; // Offensive Rebound %
  drebPct: number; // Defensive Rebound %
  rebPct: number; // Total Rebound %
  tovPct: number; // Turnover %
  ptsPaint: number; // Points in the Paint / GP
  pts2ndChance: number; // Second Chance Points / GP
  ptsFastBreak: number; // Fastbreak Points / GP
  ptsOffTov: number; // Points off Turnovers / GP
  foulsDrawn: number; // Personal Fouls Drawn / GP
  contestedShots: number; // Hustle: Contested Shots / GP
  deflections: number; // Hustle: Deflections / GP
  screenAssists: number; // Hustle: Screen Assists / GP
  looseBalls: number; // Hustle: Loose Balls Recovered / GP
  boxOuts: number; // Hustle: Box Outs / GP
}

export interface PlayerGameLog {
  eventId: string;
  date: string; // ISO string or YYYY-MM-DD
  seasonLabel: string; // '2026-27' | '2025-26'
  opponentAbbr: string;
  opponentName: string;
  isHome: boolean;
  result: 'W' | 'L';
  scoreDisplay: string;
  restDays: number | null; // 0 = back-to-back
  isBackToBack: boolean;
  minutes: number;
  points: number;
  rebounds: number;
  oreb: number;
  dreb: number;
  assists: number;
  steals: number;
  blocks: number;
  stocks: number; // steals + blocks
  turnovers: number;
  fouls: number;
  plusMinus: number;
  fgm: number;
  fga: number;
  fgPct: number;
  fg3m: number;
  fg3a: number;
  fg3Pct: number;
  ftm: number;
  fta: number;
  ftPct: number;
  pra: number; // points + rebounds + assists
  tsPct: number; // Single-game True Shooting %
  efgPct: number; // Single-game Effective FG %
  usgEst: number; // Single-game Usage Rate %
  gameScore: number; // Hollinger Game Score (GmSc)
}

export interface PlayerSummary {
  id: string;
  name: string;
  teamId: string;
  teamAbbr: string;
  teamName: string;
  position: string;
  jersey?: string;
  height?: string;
  country?: string;
  headshotUrl?: string;
  advanced?: PlayerAdvancedProfile;
  games: PlayerGameLog[]; // Ordered newest first (index 0 = most recent game)
}

export interface TeamAdvancedProfile {
  gp: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pace: number;
  pie: number; // 0-100 scale
  efgPct: number;
  tsPct: number;
  astPct: number;
  astTo: number;
  astRatio: number;
  orebPct: number;
  drebPct: number;
  rebPct: number;
  tovPct: number;
  ptsPaint: number;
  oppPtsPaint: number;
  pts2ndChance: number;
  oppPts2ndChance: number;
  ptsFastBreak: number;
  ptsOffTov: number;
  contestedShots: number;
  deflections: number;
  screenAssists: number;
  looseBalls: number;
  boxOuts: number;
}

export interface TeamGameLog {
  eventId: string;
  date: string;
  seasonLabel: string;
  opponentAbbr: string;
  opponentName: string;
  isHome: boolean;
  result: 'W' | 'L';
  pointsFor: number;
  pointsAgainst: number;
  differential: number;
  totalPoints: number;
  restDays: number | null;
  isBackToBack: boolean;
  fgm: number;
  fga: number;
  fgPct: number;
  fg3m: number;
  fg3a: number;
  fg3Pct: number;
  ftm: number;
  fta: number;
  ftPct: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  poss: number; // Estimated possessions
  offRtg: number; // Per-game Offensive Rating
  defRtg: number; // Per-game Defensive Rating
  netRtg: number; // Per-game Net Rating
  pace: number; // Per-game Pace (48 min)
  efgPct: number; // Four Factors: Effective FG%
  tsPct: number; // True Shooting %
  orebPct: number; // Four Factors: Offensive Rebound %
  tovPct: number; // Four Factors: Turnover %
}

export interface TeamSummary {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  conference: 'Este' | 'Oeste';
  logoUrl?: string;
  wins: number;
  losses: number;
  winPct: number;
  playoffSeed: number;
  gamesBehind: string;
  streakCode: string;
  homeRecord: string;
  roadRecord: string;
  lastTenRecord: string;
  avgPointsFor: number;
  avgPointsAgainst: number;
  differential: number;
  advanced?: TeamAdvancedProfile;
  games: TeamGameLog[]; // Ordered newest first
}

export interface ScoreboardGame {
  id: string;
  date: string;
  statusText: string;
  isLive: boolean;
  isCompleted: boolean;
  awayAbbr: string;
  awayName: string;
  awayScore: number;
  homeAbbr: string;
  homeName: string;
  homeScore: number;
}

export interface BootstrapPayload {
  seasonMode: SeasonMode;
  dataSource: DataSourceKind;
  totalLeaguePlayersAvailable: number;
  allPlayersLoaded: boolean;
  generatedAt: string;
  teams: TeamSummary[];
  players: PlayerSummary[];
  scoreboard: ScoreboardGame[];
}

export type AnomalyCategory =
  | 'surge'
  | 'slump'
  | 'role_shift'
  | 'shooting_variance'
  | 'advanced_shift'
  | 'team_shift';

export interface AnomalySignal {
  id: string;
  entityType: 'player' | 'team';
  entityId: string;
  entityName: string;
  subtitle: string;
  teamAbbr: string;
  category: AnomalyCategory;
  categoryLabel: string;
  metricKey: string;
  metricLabel: string;
  baselineAvg: number;
  windowAvg: number;
  absDelta: number;
  pctDelta: number;
  zScore: number;
  sampleGames: number;
  baselineGames: number;
  sustainabilityLabel: string;
  sustainabilityTone: 'solid' | 'warning' | 'negative';
  contextNote: string;
  takeaways: string[];
}

export interface StreakEntry {
  id: string;
  entityType: 'player' | 'team';
  entityId: string;
  entityName: string;
  subtitle: string;
  teamAbbr: string;
  streakLabel: string;
  metricLabel: string;
  thresholdLabel: string;
  count: number;
  windowAvgDuringStreak: number;
  seasonBaseline: number;
  isPositive: boolean;
  lastGameDate: string;
}

export interface ConsistencyEntry {
  entityId: string;
  entityName: string;
  teamAbbr: string;
  position: string;
  gamesPlayed: number;
  minutesAvg: number;
  ptsAvg: number;
  ptsStdDev: number;
  ptsFloor: number;
  ptsCeiling: number;
  praAvg: number;
  praStdDev: number;
  praFloor: number;
  praCeiling: number;
  gmScAvg: number;
  consistencyScore: number; // 0 - 100
  profileLabel: string;
  hitRate20Pts: number;
}

export interface ThresholdSettings {
  windowSize: WindowSize;
  minZScore: number;
  minPctDelta: number;
  minMinutes: number;
  minStreakGames: number;
}

export interface SearchPlayerResult {
  id: string;
  name: string;
  teamAbbr: string;
  position: string;
}

export interface RosterPlayerItem {
  id: string;
  name: string;
  position: string;
  jersey: string;
  height?: string;
  country?: string;
  age?: number;
}

export type RangePreset =
  | 'last_3'
  | 'last_5'
  | 'last_10'
  | 'prev_5'
  | 'prev_10'
  | 'season_all'
  | 'home_only'
  | 'away_only'
  | 'b2b_only'
  | 'rested_only'
  | 'custom_dates';

export interface RangeSelection {
  preset: RangePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface ComparisonMetricRow {
  key: string;
  label: string;
  unit: string;
  group: 'basic' | 'advanced';
  rangeAValue: number;
  rangeBValue: number;
  absDiff: number;
  pctDiff: number;
  inverseGood?: boolean;
}

/* --- Season Milestones & Inter-Season Comparison Types --- */

export interface LeagueGlobalSnapshot {
  seasonLabel: string;
  gamesCount: number;
  avgTeamPoints: number;
  avgTotalGamePoints: number;
  avgMargin: number;
  homeWinPct: number;
  closeGamesPct: number; // Margin <= 5 pts
  blowoutGamesPct: number; // Margin >= 15 pts
  avgTeam3PM: number;
  avgTeam3Pct: number;
  avgTeamORB: number;
  avgTeamREB: number;
  avgTeamAST: number;
  // Official NBA.com Advanced & Zone League Averages
  avgPace: number;
  avgOffRtg: number;
  avgEfgPct: number;
  avgTsPct: number;
  avgOrebPct: number;
  avgTovPct: number;
  avgPtsPaint: number;
  avgPts2ndChance: number;
  avgPtsFastBreak: number;
}

export interface SingleGamePerformance {
  entityId: string;
  entityName: string;
  teamAbbr: string;
  value: number;
  context: string;
  date: string;
}

export interface SingleGameRecordItem {
  metricId: string;
  metricLabel: string;
  category: 'player' | 'team';
  unit: string;
  decimals?: number;
  current2027: SingleGamePerformance | null;
  prev2026Full: SingleGamePerformance | null;
  prev2026Opening: SingleGamePerformance | null;
}

export interface SeasonLeaderHolder {
  entityId: string;
  entityName: string;
  teamAbbr: string;
  value: number;
  secondaryLabel: string;
}

export interface SeasonLeaderMilestoneItem {
  metricId: string;
  metricLabel: string;
  group:
    | 'rebounding'
    | 'shooting_scoring'
    | 'playmaking_allaround'
    | 'advanced_hustle';
  entityType: 'player' | 'team';
  unit: string;
  decimals: number;
  isCumulativeTotal?: boolean;
  lowerIsBetter?: boolean;
  current2027: SeasonLeaderHolder | null;
  prev2026Full: SeasonLeaderHolder | null;
  prev2026Opening: SeasonLeaderHolder | null;
}

export interface MilestonesPayload {
  generatedAt: string;
  dataSource: DataSourceKind;
  totalPlayersScanned: number;
  openingGamesPerTeam: number;
  global2027: LeagueGlobalSnapshot;
  global2026Full: LeagueGlobalSnapshot;
  global2026Opening: LeagueGlobalSnapshot;
  singleGameRecords: SingleGameRecordItem[];
  seasonLeaders: SeasonLeaderMilestoneItem[];
}

/* --- Fase 1: Analizador Integral de Jornadas NBA Types --- */

export interface GameDayDateOption {
  date: string; // YYYY-MM-DD
  seasonLabel: string; // '2026-27' | '2025-26'
  gamesCount: number;
}

export interface GameDayPlayerLine {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  position: string;
  opponentAbbr: string;
  isHome: boolean;
  result: 'W' | 'L';
  minutes: number;
  points: number;
  rebounds: number;
  oreb: number;
  assists: number;
  steals: number;
  blocks: number;
  stocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  plusMinus: number;
  tsPct: number;
  efgPct: number;
  usgEst: number;
  gameScore: number;
  ptsBaselineAvg: number;
  ptsDelta: number;
  gmScBaselineAvg: number;
}

export interface GameDayMatchupTeamSide {
  teamId: string;
  abbr: string;
  name: string;
  shortName: string;
  recordAfter: string;
  score: number;
  isWinner: boolean;
  fg3m: number;
  fg3a: number;
  fg3Pct: number;
  efgPct: number;
  tsPct: number;
  reb: number;
  oreb: number;
  orebPct: number;
  ast: number;
  tov: number;
  tovPct: number;
  ftm: number;
  fta: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pace: number;
  isBackToBack: boolean;
  topPlayer: GameDayPlayerLine | null;
  rotationPlayers: GameDayPlayerLine[];
}

export interface GameDayMatchupCard {
  eventId: string;
  date: string;
  seasonLabel: string;
  contextTag: string;
  contextTone: 'amber' | 'emerald' | 'slate';
  margin: number;
  totalPoints: number;
  pace: number;
  away: GameDayMatchupTeamSide;
  home: GameDayMatchupTeamSide;
  keyTakeawaysSimple: string[];
  keyTakeawaysAdvanced: string[];
}

export interface GameDayOutlierItem {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  position: string;
  opponentAbbr: string;
  isHome: boolean;
  result: 'W' | 'L';
  scoreDisplay: string;
  kind: 'explosion' | 'slump';
  minutes: number;
  minutesAvg: number;
  points: number;
  ptsAvg: number;
  ptsDelta: number;
  rebounds: number;
  assists: number;
  stocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  tsPct: number;
  tsAvg: number;
  usgEst: number;
  usgAvg: number;
  gameScore: number;
  gmScAvg: number;
  singleNightZ: number;
  driverTag: string;
  driverDetailSimple: string;
  driverDetailAdvanced: string;
}

export interface GameDayRoleShiftItem {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  position: string;
  opponentAbbr: string;
  isHome: boolean;
  result: 'W' | 'L';
  minutes: number;
  minutesAvg: number;
  minutesDelta: number;
  usgEst: number;
  usgAvg: number;
  usgDelta: number;
  points: number;
  rebounds: number;
  assists: number;
  fga: number;
  fgaAvg: number;
  gameScore: number;
  shiftType: 'minutes_spike' | 'usage_spike' | 'dual_breakout';
  headlineSimple: string;
  headlineAdvanced: string;
}

export interface GameDayStreakShiftItem {
  id: string;
  playerId: string;
  playerName: string;
  teamAbbr: string;
  position: string;
  opponentAbbr: string;
  isHome: boolean;
  status: 'extended' | 'broken';
  thresholdLabel: string;
  streakCount: number;
  nightValueDisplay: string;
  avgDuringStreak: number;
  unit: string;
}

export interface GameDayPayload {
  generatedAt: string;
  dataSource: DataSourceKind;
  selectedDate: string;
  seasonLabel: string;
  availableDates: GameDayDateOption[];
  pulse: {
    gamesCount: number;
    avgTotalPoints: number;
    leagueAvgTotalPoints: number;
    closeGamesCount: number;
    blowoutsCount: number;
    roadWinsCount: number;
    avgPace: number;
  };
  mvpOfTheNight: GameDayPlayerLine | null;
  topExplosion: GameDayOutlierItem | null;
  statementTeamWin: {
    teamId: string;
    teamAbbr: string;
    teamName: string;
    opponentAbbr: string;
    isHome: boolean;
    scoreDisplay: string;
    margin: number;
    netRtg: number;
    efgPct: number;
    summarySimple: string;
    summaryAdvanced: string;
  } | null;
  idealFive: GameDayPlayerLine[];
  matchups: GameDayMatchupCard[];
  explosions: GameDayOutlierItem[];
  slumps: GameDayOutlierItem[];
  roleShifts: GameDayRoleShiftItem[];
  streakShifts: GameDayStreakShiftItem[];
  liveOrScheduledToday: ScoreboardGame[];
}

/* --- Crónica Global de Scouting e Informe Táctico de Partido (Paso B + NBA.com) --- */

export interface GroundingSourceLink {
  title: string;
  uri: string;
}

export interface ChronicleDynamicSection {
  kicker?: string;
  title: string;
  body: string;
}

export interface ChronicleKeyItem {
  title: string;
  detail: string;
}

export interface GameDayChroniclePayload {
  date: string;
  seasonLabel: string;
  gamesCount: number;
  generatedAt: string;
  engineMode: 'gemini_search' | 'empirical_fallback';
  headline: string;
  lead: string;
  dynamicSections: ChronicleDynamicSection[];
  pizarrasSection: string;
  hitosSection: string;
  espanolesSection: string;
  clavesList: ChronicleKeyItem[];
  spanishPlayersSummary: string | null;
  sources: GroundingSourceLink[];
}

export interface GamePeriodScore {
  period: number;
  label: string; // '1Q' | '2Q' | '3Q' | '4Q' | 'PR1' ...
  isOvertime: boolean;
  awayScore: number;
  homeScore: number;
}

export interface GameBoxScorePlayerLine {
  playerId: string;
  name: string;
  shortName: string; // I. Apellido
  jersey: string; // Dorsal sin '#', ej. '15'
  position: string;
  country: string;
  isSpanish: boolean;
  isStarter: boolean;
  minutes: number;
  minutesFormatted: string; // '37:19' o '37'
  points: number;
  rebounds: number;
  oreb: number;
  dreb: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  plusMinus: number;
  fgm: number;
  fga: number;
  fgPct: number;
  fg3m: number;
  fg3a: number;
  fg3Pct: number;
  ftm: number;
  fta: number;
  ftPct: number;
  tsPct: number;
  usgEst?: number;
  gameScore: number;
  ptsPaint?: number;
  ptsFastBreak?: number;
  doubleDouble: boolean;
  tripleDouble: boolean;
}

export interface GameInactiveOrDnpItem {
  playerId?: string;
  name: string;
  jersey: string;
  category: 'dnp_bench' | 'inactive' | 'rotation_absence' | 'in_game_setback';
  note: string;
  ptsAvg?: number;
  minAvg?: number;
  reason?: string;
  isSpanish?: boolean;
}

export interface GamePodiumEntry {
  stars: 3 | 2 | 1;
  playerId: string;
  jersey: string;
  name: string;
  position: string;
  points: number;
  rebounds: number;
  assists: number;
  plusMinus: number;
  fgm: number;
  fga: number;
  tsPct: number;
  shortLine: string;
  gameScore: number;
  podiumScore: number;
}

export interface GameTeamTotalsSummary {
  points: number;
  fgm: number;
  fga: number;
  fgPct: number;
  fg3m: number;
  fg3a: number;
  fg3Pct: number;
  ftm: number;
  fta: number;
  ftPct: number;
  reb: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fouls: number;
  efgPct: number;
  tsPct: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pace: number;
  ptsPaint: number | null;
  ptsFastBreak: number | null;
  ptsOffTov: number | null;
  ptsSecondChance: number | null;
  benchPoints: number;
  biggestLead: number | null;
  biggestRun: number | null;
}

export interface GameReportTeamSide {
  teamId: string;
  abbr: string;
  name: string;
  shortName: string;
  recordAfter: string;
  score: number;
  isWinner: boolean;
  isBackToBack: boolean;
  starters: GameBoxScorePlayerLine[];
  bench: GameBoxScorePlayerLine[];
  totals: GameTeamTotalsSummary;
  absencesAndDnp: GameInactiveOrDnpItem[];
  podium: GamePodiumEntry[];
}

export interface GameTeamComparisonRow {
  key: string;
  label: string;
  helpKey?: string;
  awayDisplay: string;
  homeDisplay: string;
  awayNumeric: number;
  homeNumeric: number;
  diffDisplay: string;
  betterSide: 'away' | 'home' | 'tie';
  section: 'scoring_shooting' | 'efficiency_tactics' | 'reb_playmaking_defense' | 'core' | 'specialty';
  lowerIsBetter?: boolean;
}

export interface GameLeaderComparisonRow {
  categoryKey: string;
  categoryLabel: string;
  helpKey?: string;
  awayPlayerId: string;
  awayFormatted: string; // '#Dorsal I. Apellido (Dato)'
  awayValue: number;
  homePlayerId: string;
  homeFormatted: string; // '#Dorsal I. Apellido (Dato)'
  homeValue: number;
  betterSide: 'away' | 'home' | 'tie';
}

export interface GameOfficialReportData {
  eventId: string;
  date: string;
  seasonLabel: string;
  pasoBTitle: string;
  arenaName: string;
  arenaCity: string;
  attendance: number | null;
  attendanceFormatted: string;
  durationMinutes: number | null;
  officials: string[];
  isOvertime: boolean;
  overtimeCount: number;
  decisivePeriodLabel: string;
  leadChanges: number | null;
  timesTied: number | null;
  periods: GamePeriodScore[];
  away: GameReportTeamSide;
  home: GameReportTeamSide;
  spanishPlayersReport: {
    hasSpanishPlayers: boolean;
    summaryLine: string;
    details: Array<{
      playerId: string;
      name: string;
      jersey: string;
      teamAbbr: string;
      played: boolean;
      lineSummary: string;
    }>;
  };
  milestonesList: Array<{
    playerId: string;
    name: string;
    jersey: string;
    teamAbbr: string;
    type: 'TD' | 'DD';
    detail: string;
  }>;
  teamComparisonRows: GameTeamComparisonRow[];
  leaderComparisonRows: GameLeaderComparisonRow[];
}

export interface GameNarrativePayload {
  eventId: string;
  generatedAt: string;
  engineMode: 'gemini_search' | 'empirical_fallback';
  pressHeadline: string;
  pressLead: string;
  gameFlowSection: string;
  chalkboardSection: string;
  dynamicSpotlight: {
    title: string;
    body: string;
  } | null;
  xFactorSection: string;
  spanishSection: string;
  verdictSection: string;
  sources: GroundingSourceLink[];
}


