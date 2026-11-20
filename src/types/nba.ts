export type ActiveSection =
  | 'home'
  | 'gameday'
  | 'anomalies'
  | 'streaks'
  | 'duel'
  | 'milestones'
  | 'heroic'
  | 'awards'
  | 'comparator'
  | 'teams'
  | 'players'
  | 'lineups'
  | 'scatter'
  | 'fantasy_espn'
  | 'glossary';

export type ExperienceMode = 'simple' | 'advanced';

export type SeasonMode =
  | 'continuous'
  | '2027'
  | '2026'
  | '2025'
  | '2024'
  | (string & {});

export type DataSourceKind =
  | 'official_nba'
  | 'nba_cdn_live'
  | 'nba_official_hybrid'
  | 'espn_fallback'
  | 'snapshot_hybrid'
  | string;

export type WindowSize = 3 | 5 | 10;

export interface ThresholdSettings {
  windowSize: WindowSize;
  defaultPlayerMatchWindow?: number;
  minZScore: number;
  minPctDelta: number;
  minMinutes: number;
  minStreakGames: number;
}

export interface AdminSecurityConfigValues {
  nbaApiLimit: number;
  nbaApiWindowMinutes: number;
  nbaRefreshLimit: number;
  nbaRefreshWindowMinutes: number;
  adminBruteForceMaxAttempts: number;
  adminBruteForceWindowMinutes: number;
  adminFloodLimit: number;
  adminFloodWindowMinutes: number;
  adminSessionTtlHours: number;
}

export interface AdminSecurityConfig extends AdminSecurityConfigValues {
  updatedAt: number;
}

export interface GamedayThresholdsConfigValues {
  // 03A. Noches de Explosión
  explosionShootingTsDiff: number;
  explosion3pMinMade: number;
  explosion3pDelta: number;
  explosionRebMinTotal: number;
  explosionRebDelta: number;
  explosionAstMinTotal: number;
  explosionAstDelta: number;
  explosionStocksMinTotal: number;
  explosionStocksDelta: number;
  explosionMinutesDelta: number;
  explosionScoringPtsDelta: number;
  explosionZScoreThreshold: number;

  // 03B. Batacazos de Titulares
  starterMinMinutesAvg: number;
  starterMinPointsAvg: number;
  slumpScoringDropPts: number;
  slumpShootingMaxTsPct: number;
  slumpShootingTsDrop: number;
  slumpFoulsTroubleCount: number;
  slumpFoulsMinutesCut: number;
  slumpTurnoversCount: number;
  slumpTurnoversDelta: number;
  slump3pSpecialistAvg: number;
  slump3pDropDelta: number;
  slumpAstFacilitatorAvg: number;
  slumpAstDropDelta: number;
  slumpRebInteriorAvg: number;
  slumpRebDropDelta: number;
  slumpMinutesCutDelta: number;
}

export interface GamedayThresholdsConfig extends GamedayThresholdsConfigValues {
  updatedAt: number;
}

export interface WebFeatureFlags {
  showHeroicBadges: boolean;
  updatedAt: number;
}

export interface InspectorDefaultKpisConfig {
  playerDefaultKpiKeys: string[];
  teamDefaultKpiKeys: string[];
  updatedAt: number;
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
  totalPoints?: number;
  restDays: number | null;
  isBackToBack: boolean;
  fgm: number;
  fga: number;
  fgPct?: number;
  fg3m: number;
  fg3a: number;
  fg3Pct?: number;
  ftm: number;
  fta: number;
  ftPct?: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  poss: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pace: number;
  efgPct: number;
  tsPct: number;
  orebPct: number;
  tovPct: number;
}

export interface TeamAdvancedProfile {
  gp?: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pace: number;
  efgPct: number;
  tsPct: number;
  orebPct: number;
  drebPct: number;
  rebPct: number;
  astPct: number;
  astTo?: number;
  astRatio?: number;
  tovPct: number;
  pie: number;
  ptsPaint: number;
  oppPtsPaint: number;
  ptsFastBreak: number;
  oppPtsFb?: number;
  pts2ndChance: number;
  oppPts2ndChance?: number;
  ptsOffTov: number;
  oppPtsOffTov?: number;
  contestedShots: number;
  contestedShots2pt?: number;
  contestedShots3pt?: number;
  deflections: number;
  chargesDrawn?: number;
  boxOuts: number;
  offBoxOuts?: number;
  defBoxOuts?: number;
  boxOutTeamRebs?: number;
  boxOutPlayerRebs?: number;
  looseBalls?: number;
  offLooseBalls?: number;
  defLooseBalls?: number;
  screenAssists: number;
  screenAstPts?: number;
  blka?: number;
  pf?: number;
  pfd?: number;
}

export interface TeamSummary {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logoUrl?: string;
  conference: 'Este' | 'Oeste' | 'East' | 'West';
  wins: number;
  losses: number;
  winPct: number;
  playoffSeed?: number;
  gamesBehind?: string;
  streakCode: string;
  currentStreak?: string;
  homeRecord: string;
  roadRecord: string;
  awayRecord?: string;
  lastTenRecord: string;
  last10Record?: string;
  b2bRecord?: string;
  avgPointsFor: number;
  avgPointsAgainst: number;
  differential: number;
  ppg?: number;
  oppPpg?: number;
  diffPpg?: number;
  offRtg?: number;
  defRtg?: number;
  netRtg?: number;
  pace?: number;
  efgPct?: number;
  tsPct?: number;
  orebPct?: number;
  tovPct?: number;
  rebPerGame?: number;
  astPerGame?: number;
  fg3Pct?: number;
  ftPct?: number;
  ftRate?: number;
  advanced?: TeamAdvancedProfile;
  games: TeamGameLog[];
}

export interface PlayerGameLog {
  eventId: string;
  date: string;
  seasonLabel: string;
  teamAbbr?: string;
  teamId?: string;
  opponentAbbr: string;
  opponentName: string;
  isHome: boolean;
  result: 'W' | 'L';
  scoreDisplay?: string;
  restDays: number | null;
  isBackToBack: boolean;
  isStarter?: boolean;
  minutes: number;
  points: number;
  rebounds: number;
  oreb: number;
  dreb: number;
  assists: number;
  steals: number;
  blocks: number;
  stocks: number;
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
  efgPct: number;
  usgEst: number;
  gameScore: number;
  pra: number;
}

export interface PlayerAdvancedProfile {
  gp?: number;
  gamesStarted?: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pace?: number;
  pie: number;
  usgPct?: number;
  tsPct?: number;
  efgPct?: number;
  astTo?: number;
  astRatio?: number;
  astPct: number;
  orebPct: number;
  drebPct: number;
  rebPct: number;
  tovPct?: number;
  ptsPaint: number;
  pts2ndChance: number;
  ptsFastBreak: number;
  ptsOffTov: number;
  oppPtsPaint?: number;
  oppPts2ndChance?: number;
  oppPtsFb?: number;
  oppPtsOffTov?: number;
  contestedShots: number;
  contestedShots2pt?: number;
  contestedShots3pt?: number;
  deflections: number;
  chargesDrawn?: number;
  screenAssists: number;
  screenAstPts?: number;
  boxOuts: number;
  offBoxOuts?: number;
  defBoxOuts?: number;
  boxOutTeamRebs?: number;
  boxOutPlayerRebs?: number;
  looseBalls: number;
  offLooseBalls?: number;
  defLooseBalls?: number;
  foulsDrawn: number;
  blka?: number;
  pf?: number;
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
  birthYear?: number;
  fromYear?: number;
  draftYear?: number;
  experienceYears?: number;
  headshotUrl?: string;
  gamesPlayed?: number;
  minutesAvg?: number;
  ptsAvg?: number;
  rebAvg?: number;
  astAvg?: number;
  stlAvg?: number;
  blkAvg?: number;
  tovAvg?: number;
  fgPct?: number;
  fg3Pct?: number;
  ftPct?: number;
  tsPct?: number;
  efgPct?: number;
  usgAvg?: number;
  gameScoreAvg?: number;
  plusMinusAvg?: number;
  advanced?: PlayerAdvancedProfile;
  games: PlayerGameLog[];
}

export interface ScoreboardGame {
  id: string;
  date?: string;
  status?: 'scheduled' | 'in_progress' | 'final' | string;
  statusDetail?: string;
  statusText: string;
  isLive: boolean;
  isCompleted: boolean;
  homeAbbr: string;
  homeName?: string;
  homeScore: number;
  awayAbbr: string;
  awayName?: string;
  awayScore: number;
  venue?: string;
  startTimeEs?: string;
}

export interface BootstrapPayload {
  seasonMode: SeasonMode;
  dataSource: DataSourceKind;
  totalLeaguePlayersAvailable: number;
  allPlayersLoaded: boolean;
  generatedAt: string;
  scoreboard: ScoreboardGame[];
  teams: TeamSummary[];
  players: PlayerSummary[];
}

export type TrendBreakoutAxis = 'exterior' | 'minutes_usage' | 'efficiency';

export interface WindowComparisonStrip {
  season: number;
  l3: number;
  l5: number;
  l10: number;
}

export interface TrendBreakoutAlert {
  id: string;
  playerId: string;
  playerName: string;
  teamAbbr: string;
  position: string;
  axis: TrendBreakoutAxis;
  axisLabel: string;
  direction: 'positive' | 'negative';
  severity: 'extreme' | 'high' | 'notable';
  badgeLabel: string;
  metricKey: string;
  metricLabel: string;
  unit: string;
  decimals: number;
  baselineAvg: number;
  windowAvg: number;
  absDelta: number;
  pctDelta: number;
  zScore: number;
  breakoutScore: number;
  sampleGames: number;
  baselineGames: number;
  windows: WindowComparisonStrip;
  secondaryLabel: string;
  headlineSimple: string;
  detailSimple: string;
  headlineAdvanced: string;
  detailAdvanced: string;
  sustainabilityLabel: string;
  sustainabilityTone: 'solid' | 'warning' | 'negative';
  activeStreakLabel: string | null;
  activeStreakCount: number;
}

export type AnomalyCategory =
  | 'surge'
  | 'slump'
  | 'role_shift'
  | 'shooting_variance'
  | 'exterior_shift'
  | 'efficiency_outlier'
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
  unit?: string;
  baselineAvg: number;
  windowAvg: number;
  absDelta: number;
  pctDelta: number;
  zScore: number;
  sampleGames: number;
  baselineGames: number;
  sustainabilityLabel: string;
  sustainabilityTone: 'solid' | 'sustainable' | 'warning' | 'negative' | 'neutral';
  contextNote: string;
  takeaways: string[];
  breakoutAxis?: TrendBreakoutAxis;
  windows?: WindowComparisonStrip;
  activeStreakLabel?: string | null;
  activeStreakCount?: number;
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
  currentSeasonAvg?: number | null;
  currentSeasonGames?: number;
  prevSeasonAvg?: number | null;
  prevSeasonGames?: number;
  isPositive: boolean;
  lastGameDate: string;
  breakoutAxis?: TrendBreakoutAxis;
  windowAvgRef?: number;
  windowDeltaVsSeason?: number;
  unit?: string;
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
  consistencyScore: number;
  profileLabel: string;
  hitRate20Pts: number;
  windowGames?: number;
  ptsWindowAvg?: number;
  ptsWindowDelta?: number;
  praWindowAvg?: number;
  praWindowDelta?: number;
  tsSeasonAvg?: number;
  tsWindowAvg?: number;
  tsWindowDelta?: number;
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
  startDate?: string;
  endDate?: string;
  label?: string;
}

export interface ComparisonMetricRow {
  key: string;
  label: string;
  unit: string;
  group: 'volume' | 'efficiency' | 'advanced' | 'pace_four_factors' | string;
  rangeAValue: number;
  rangeBValue: number;
  absDiff: number;
  pctDiff: number;
  inverseGood?: boolean;
}

export type FilterPresetId = 'broad' | 'balanced' | 'blockbusters' | 'custom';

export interface SearchPlayerResult {
  id: string;
  name: string;
  teamId?: string;
  teamAbbr: string;
  teamName?: string;
  position: string;
  jersey?: string;
  height?: string;
  country?: string;
  birthYear?: number;
  headshotUrl?: string;
  hasActiveLogs?: boolean;
  gamesPlayed?: number;
}

export interface RosterPlayerItem {
  id: string;
  name: string;
  position: string;
  jersey: string;
  height?: string;
  country?: string;
  birthYear?: number;
  headshotUrl?: string;
  ptsAvg?: number;
  rebAvg?: number;
  astAvg?: number;
  minutesAvg?: number;
  gamesPlayed?: number;
}

export interface PlayerInspectorBenchmarkItem {
  key?: string;
  mean: number;
  sd: number;
  lowerIsBetter?: boolean;
  decimals: number;
  suffix: string;
  valuesAsc?: number[];
}

export interface PlayerInspectorDossier {
  player: PlayerSummary;
  player2027: PlayerSummary | null;
  player2026: PlayerSummary | null;
  advanced2027?: PlayerAdvancedProfile | null;
  advanced2026?: PlayerAdvancedProfile | null;
  latestLeagueDate2027: string;
  benchmarksByScope: {
    continuous: Record<string, PlayerInspectorBenchmarkItem>;
    s2027: Record<string, PlayerInspectorBenchmarkItem>;
    s2026: Record<string, PlayerInspectorBenchmarkItem>;
    sameDate2026: Record<string, PlayerInspectorBenchmarkItem>;
  };
}

export type MilestoneComparisonMode =
  | 'full_season'
  | 'same_opening'
  | 'same_stage'
  | 'head_to_head';

export interface SingleGamePerformance {
  entityId: string;
  entityName: string;
  teamAbbr: string;
  value: number;
  context: string;
  date: string;
}

export interface SingleGameRecordEntry {
  metricId: string;
  metricLabel: string;
  category: 'player' | 'team';
  subGroup: 'scoring' | 'playmaking_reb' | 'defense' | 'impact';
  unit: string;
  decimals: number;
  lowerIsBetter?: boolean;
  layer?: 'basic' | 'advanced';
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
  gamesPlayed?: number;
}

export interface MilestoneSeasonLeaderEntry {
  metricId: string;
  metricLabel: string;
  group: string;
  entityType: 'player' | 'team';
  unit: string;
  decimals: number;
  isCumulativeTotal?: boolean;
  lowerIsBetter?: boolean;
  layer?: 'basic' | 'advanced';
  current2027: SeasonLeaderHolder | null;
  prev2026Full: SeasonLeaderHolder | null;
  prev2026Opening: SeasonLeaderHolder | null;
}

export interface MilestoneGlobalSnapshot {
  seasonLabel: string;
  gamesCount: number;
  avgTeamPoints: number;
  avgTotalGamePoints: number;
  avgMargin: number;
  homeWinPct: number;
  closeGamesPct: number;
  blowoutGamesPct: number;
  avgTeam3PM: number;
  avgTeam3Pct: number;
  avgTeamORB: number;
  avgTeamREB: number;
  avgTeamAST: number;
  avgTeamSTL?: number;
  avgTeamBLK?: number;
  avgTeamTOV?: number;
  avgPace?: number;
  avgOffRtg?: number;
  avgEfgPct?: number;
  avgTsPct?: number;
  avgPtsPaint?: number;
  avgPts2ndChance?: number;
  avgPtsFastBreak?: number;
  [key: string]: any;
}

export interface MilestonesPayload {
  generatedAt: string;
  dataSource: DataSourceKind;
  totalPlayersScanned: number;
  openingGamesPerTeam: number;
  global2027: MilestoneGlobalSnapshot;
  global2026Full: MilestoneGlobalSnapshot;
  global2026Opening: MilestoneGlobalSnapshot;
  singleGameRecords: SingleGameRecordEntry[];
  seasonLeaders: MilestoneSeasonLeaderEntry[];
}

export interface GameDayPlayerLine {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  opponentAbbr: string;
  isHome: boolean;
  result: 'W' | 'L';
  scoreDisplay?: string;
  eventId: string;
  position: string;
  minutes: number;
  points: number;
  rebounds: number;
  oreb: number;
  dreb: number;
  assists: number;
  steals: number;
  blocks: number;
  stocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  fgPct?: number;
  fg3m: number;
  fg3a: number;
  fg3Pct?: number;
  ftm: number;
  fta: number;
  ftPct?: number;
  plusMinus: number;
  tsPct: number;
  efgPct?: number;
  usgEst: number;
  gameScore: number;
  pra?: number;
  ptsBaselineAvg: number;
  ptsDelta: number;
  gmScBaselineAvg: number;
  [key: string]: any;
}

export interface GameDayMatchupSide {
  teamId: string;
  abbr: string;
  name: string;
  shortName: string;
  score: number;
  isWinner: boolean;
  isBackToBack: boolean;
  restDays: number | null;
  record?: string;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  efgPct: number;
  tsPct: number;
  fg3m: number;
  fg3a: number;
  fg3Pct: number;
  oreb: number;
  reb: number;
  ast: number;
  tov: number;
  topPlayer?: GameDayPlayerLine | null;
  topPlayers?: GameDayPlayerLine[];
  rotationPlayers: GameDayPlayerLine[];
  [key: string]: any;
}

export interface GameDayMatchupCard {
  eventId: string;
  date: string;
  seasonLabel: string;
  contextTag: string;
  contextTone: 'amber' | 'emerald' | 'slate' | string;
  margin: number;
  totalPoints: number;
  pace: number;
  away: GameDayMatchupSide;
  home: GameDayMatchupSide;
  keyTakeawaysSimple: string[];
  keyTakeawaysAdvanced: string[];
  [key: string]: any;
}

export interface GameDayChroniclePayload {
  date: string;
  seasonLabel: string;
  gamesCount: number;
  generatedAt: string;
  engineMode: string;
  headline: string;
  lead: string;
  dynamicSections: Array<{
    kicker: string;
    title: string;
    body: string;
  }>;
  pizarrasSection: string;
  hitosSection: string;
  espanolesSection: string;
  clavesList: Array<{
    title: string;
    detail: string;
    body?: string;
  }>;
  spanishPlayersSummary: string;
  sources: Array<{ uri: string; title: string }>;
  [key: string]: any;
}

export interface GameDayPayload {
  selectedDate: string;
  seasonLabel: string;
  availableDates: Array<{
    date: string;
    seasonLabel: string;
    gamesCount: number;
  }>;
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
  topExplosion: any | null;
  statementTeamWin: any | null;
  idealFive: GameDayPlayerLine[];
  matchups: GameDayMatchupCard[];
  explosions: any[];
  slumps: any[];
  roleShifts: any[];
  streakShifts: any[];
  liveOrScheduledToday: ScoreboardGame[];
  [key: string]: any;
}

export interface GameBoxScorePlayerLine {
  playerId: string;
  name: string;
  shortName: string;
  position: string;
  jersey: string;
  isStarter: boolean;
  starter?: boolean;
  minutes: number;
  minutesFormatted: string;
  points: number;
  rebounds: number;
  oreb: number;
  dreb: number;
  assists: number;
  steals: number;
  blocks: number;
  stocks?: number;
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
  efgPct: number;
  usgEst: number;
  gameScore: number;
  doubleDouble?: boolean;
  tripleDouble?: boolean;
  country?: string;
  [key: string]: any;
}

export interface GameInactiveOrDnpItem {
  playerId?: string;
  name: string;
  jersey?: string;
  position?: string;
  statusType: 'injury' | 'dnp_cd' | 'foul_out' | 'inactive' | string;
  statusLabel: string;
  reason: string;
  foulOutPeriod?: string;
  foulOutClock?: string;
  minutesPlayed?: number;
  [key: string]: any;
}

export interface PlayerSeasonHighEntry {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  metricLabel: string;
  value: number;
  previousHigh?: number;
  [key: string]: any;
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
  totals: Record<string, any>;
  absencesAndDnp: GameInactiveOrDnpItem[];
  podium: GameBoxScorePlayerLine[];
  nextGame: Record<string, any>;
  [key: string]: any;
}

export interface GameNarrativePayload {
  eventId: string;
  generatedAt: string;
  engineMode: string;
  pressHeadline: string;
  pressLead: string;
  gameFlowSection: string;
  chalkboardSection: string;
  dynamicSpotlight: {
    kicker?: string;
    title: string;
    body: string;
  } | null;
  xFactorSection: string;
  spanishSection: string;
  verdictSection: string;
  sources: Array<{ uri: string; title: string }>;
  [key: string]: any;
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
  leagueAvgPace: number;
  paceDiffVsLeague: number;
  periods: Array<{
    period: number;
    label: string;
    awayScore: number;
    homeScore: number;
    [key: string]: any;
  }>;
  away: GameReportTeamSide;
  home: GameReportTeamSide;
  spanishPlayersReport: {
    hasSpanishPlayers: boolean;
    summaryLine: string;
    details: any[];
  };
  milestonesList: any[];
  teamComparisonRows: any[];
  leaderComparisonRows: any[];
  [key: string]: any;
}

export type FantasyInjurySeverity =
  | 'healthy'
  | 'probable'
  | 'questionable'
  | 'doubtful'
  | 'dtd'
  | 'out'
  | 'ir'
  | 'suspended';

export type FantasyAbsenceTier =
  | 'healthy'
  | 'b2b_rest'
  | 'punctual'
  | 'long_term';

export type FantasyProjectionMode = 'smart' | 'conservative';

export interface FantasyPlayerInjuryAlert {
  playerNameNorm: string;
  displayName: string;
  severity: FantasyInjurySeverity;
  absenceTier?: FantasyAbsenceTier;
  statusLabelEs: string;
  detailEs: string;
  [key: string]: any;
}

export interface FantasyTeamGameSlot {
  gameId: string;
  dateIso: string;
  dateTimeUtc?: string;
  dayShortEs?: string;
  opponentAbbr: string;
  isHome: boolean;
  isBackToBack?: boolean;
  [key: string]: any;
}

export interface FantasyWeekWindow {
  id: string;
  weekNumber?: number;
  label: string;
  rangeLabel: string;
  startIso: string;
  endIso: string;
  lockDeadlineLabel: string;
  isLocked: boolean;
  isCurrent?: boolean;
  teamSchedules: Record<
    string,
    {
      gamesCount: number;
      b2bCount: number;
      homeCount?: number;
      awayCount?: number;
      games: FantasyTeamGameSlot[];
      [key: string]: any;
    }
  >;
  [key: string]: any;
}

export interface FantasyRosterContract {
  playerId: string;
  slot: 'starter' | 'bench' | 'ir' | string;
}

export interface FantasyGameCorrection {
  fptsDelta: number;
  reason?: string;
  updatedAt?: number;
}

export interface FantasyManualLeagueState {
  updatedAt: number;
  myTeamName: string;
  roster: FantasyRosterContract[];
  takenRivalIds: string[];
  rivalRosters: Record<string, string[]>;
  rivalTeamNames: Record<string, string>;
  gameCorrections?: Record<string, FantasyGameCorrection>;
}

export type FantasyStorageMode = 'upstash-redis' | 'local-disk' | 'tmp-ephemeral';

export interface FantasyEspnSyncPayload {
  generatedAt: string;
  injuriesByNormName: Record<string, FantasyPlayerInjuryAlert>;
  injuriesByPlayerId: Record<string, FantasyPlayerInjuryAlert>;
  weeks: FantasyWeekWindow[];
  defaultWeekId: string;
  savedState: FantasyManualLeagueState | null;
  storageMode?: FantasyStorageMode;
  cloudConfigured?: boolean;
}

export type AwardCategoryId =
  | 'mvp'
  | 'roy'
  | 'mip'
  | 'dpoy'
  | '6moy'
  | 'clutch'
  | 'hustle'
  | 'all_nba';

export type AwardIndividualCategoryId = Exclude<AwardCategoryId, 'all_nba'>;

export type AwardSeasonScope = '2027' | '2026';

export interface AwardCandidateMetricItem {
  key: string;
  label: string;
  valueDisplay: string;
  subDisplay?: string;
  tone?: 'positive' | 'negative' | 'accent' | 'neutral';
}

export interface AwardScoreBreakdown {
  production: number;
  efficiencyImpact: number;
  teamContext: number;
  momentum: number;
}

export interface AwardCandidateEntry {
  playerId: string;
  playerName: string;
  teamId: string;
  teamAbbr: string;
  teamName: string;
  position: string;
  teamWins: number;
  teamLosses: number;
  teamWinPct: number;
  conference: string;
  conferenceSeed: number;
  gamesPlayed: number;
  teamGamesPlayed: number;
  gamesStarted: number;
  benchGames: number;
  projectedGames82: number;
  awardScore: number;
  scoreBreakdown: AwardScoreBreakdown;
  minutesAvg: number;
  ptsAvg: number;
  rebAvg: number;
  astAvg: number;
  stlAvg: number;
  blkAvg: number;
  stocksAvg: number;
  tsPct: number;
  efgPct: number;
  gmScAvg: number;
  plusMinusAvg: number;
  netRtg: number;
  recentWindowGames: number;
  recentPtsAvg: number;
  recentPtsDelta: number;
  recentGmScAvg: number;
  recentGmScDelta: number;
  momentumLabel: string;
  momentumTone: 'positive' | 'negative' | 'neutral';
  activeStreakLabel: string | null;
  activeStreakCount: number;
  yoyPtsDelta?: number;
  yoyPraDelta?: number;
  yoyTsDelta?: number;
  prevPtsAvg?: number;
  clutchGames?: number;
  clutchWins?: number;
  clutchLosses?: number;
  clutchPtsAvg?: number;
  clutchTsPct?: number;
  clutchPlusMinusAvg?: number;
  deflectionsAvg?: number;
  contestedShotsAvg?: number;
  looseBallsAvg?: number;
  screenAssistsAvg?: number;
  boxOutsAvg?: number;
  orebAvg?: number;
  metricsSimple: AwardCandidateMetricItem[];
  metricsAdvanced: AwardCandidateMetricItem[];
  summarySimple: string;
  summaryAdvanced: string;
}

export interface SeasonAwardsPayload {
  generatedAt: string;
  dataSource: DataSourceKind;
  seasonScope: AwardSeasonScope;
  seasonLabel: string;
  avgTeamGamesPlayed: number;
  defaultMinProjectedGames: number;
  categories: Record<AwardIndividualCategoryId, AwardCandidateEntry[]>;
  allNbaPool: AwardCandidateEntry[];
}

export type NbaAdvancedCategory =
  | 'zones'
  | 'clutch'
  | 'defense_hustle'
  | 'tracking'
  | 'playtypes'
  | 'scoring'
  | 'four_factors'
  | 'violations';

export interface ShotZoneMetric {
  fgm: number;
  fga: number;
  fgPct: number;
  fgmTotal?: number;
  fgaTotal?: number;
}

export interface NbaShotZonesEntry {
  entityId: string;
  entityName: string;
  teamId: string;
  teamAbbr: string;
  restrictedArea: ShotZoneMetric;
  paintNonRa: ShotZoneMetric;
  midRange: ShotZoneMetric;
  leftCorner3: ShotZoneMetric;
  rightCorner3: ShotZoneMetric;
  aboveBreak3: ShotZoneMetric;
  corner3: ShotZoneMetric;
  backcourt: ShotZoneMetric;
  totalRimFga: number;
  rimFgPct: number;
  totalThreeFga: number;
  threeFgPct: number;
  totalRimFgaTotal?: number;
  totalThreeFgaTotal?: number;
}

export interface NbaClutchEntry {
  entityId: string;
  entityName: string;
  teamId: string;
  teamAbbr: string;
  gp: number;
  w: number;
  l: number;
  wPct: number;
  min: number;
  pts: number;
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
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  plusMinus: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  tsPct: number;
  efgPct: number;
  usgPct: number;
  pie: number;
}

export interface NbaDefenseHustleEntry {
  entityId: string;
  entityName: string;
  teamId: string;
  teamAbbr: string;
  gp: number;
  min: number;
  defRating: number;
  stl: number;
  blk: number;
  dreb: number;
  drebPct: number;
  pctDreb?: number;
  pctStl?: number;
  pctBlk?: number;
  oppPtsOffTov: number;
  oppPts2ndChance: number;
  oppPtsFb: number;
  oppPtsPaint: number;
  ptsPaint?: number;
  pts2ndChance?: number;
  ptsFb?: number;
  ptsOffTov?: number;
  blka?: number;
  pf?: number;
  pfd?: number;
  defWs: number;
  dFgm: number;
  dFga: number;
  dFgPct: number;
  normalFgPct: number;
  pctPlusMinus: number;
  defFreq: number;
  oppFgm?: number;
  oppFga?: number;
  oppFgPct?: number;
  oppFg3m?: number;
  oppFg3a?: number;
  oppFg3Pct?: number;
  oppFtm?: number;
  oppFta?: number;
  oppFtPct?: number;
  oppOreb?: number;
  oppDreb?: number;
  oppReb?: number;
  oppAst?: number;
  oppTov?: number;
  oppStl?: number;
  oppBlk?: number;
  oppBlka?: number;
  oppPf?: number;
  oppPfd?: number;
  oppPts?: number;
  contestedShots: number;
  contestedShots2pt: number;
  contestedShots3pt: number;
  deflections: number;
  chargesDrawn: number;
  screenAssists: number;
  screenAstPts: number;
  offLooseBalls: number;
  defLooseBalls: number;
  looseBalls: number;
  pctLooseBallsOff?: number;
  pctLooseBallsDef?: number;
  offBoxOuts: number;
  defBoxOuts: number;
  boxOuts: number;
  boxOutTeamRebs: number;
  boxOutPlayerRebs: number;
  pctBoxOutsOff: number;
  pctBoxOutsDef: number;
  pctBoxOutsTeamReb?: number;
  pctBoxOutsReb?: number;
}

export interface NbaTrackingEntry {
  entityId: string;
  entityName: string;
  teamId: string;
  teamAbbr: string;
  gp: number;
  min: number;
  drives: number;
  driveFgm?: number;
  driveFga?: number;
  drivePts: number;
  driveFgPct: number;
  driveAstPct: number;
  driveTovPct: number;
  drivePassesPct?: number;
  catchShootFgm: number;
  catchShootFga: number;
  catchShootPts: number;
  catchShootFgPct?: number;
  catchShootFg3Pct: number;
  catchShootEfgPct: number;
  pullUpFgm: number;
  pullUpFga: number;
  pullUpPts: number;
  pullUpFgPct?: number;
  pullUpFg3Pct: number;
  pullUpEfgPct: number;
  passesMade: number;
  passesReceived: number;
  secondaryAst: number;
  potentialAst: number;
  astPtsCreated: number;
  astToPassPctAdj: number;
  orebContestPct: number;
  orebChances?: number;
  orebChancePctAdj?: number;
  avgOrebDist?: number;
  drebContestPct: number;
  drebChances?: number;
  drebChancePctAdj?: number;
  avgDrebDist?: number;
  rebContestPct?: number;
  rebChances: number;
  rebChancePctAdj: number;
  avgRebDist: number;
  distMiles: number;
  distMilesOff: number;
  distMilesDef: number;
  avgSpeed: number;
  avgSpeedOff: number;
  avgSpeedDef: number;
  touches: number;
  frontCtTouches?: number;
  timeOfPoss?: number;
  avgSecPerTouch?: number;
  avgDribPerTouch?: number;
  ptsPerTouch?: number;
  paintTouches: number;
  paintTouchFgPct: number;
  paintTouchPts: number;
  ptsPerPaintTouch?: number;
  postTouches: number;
  postTouchFgPct: number;
  postTouchPts: number;
  ptsPerPostTouch?: number;
  elbowTouches: number;
  ptsPerElbowTouch?: number;
}

export interface NbaScoringSplitsEntry {
  entityId: string;
  entityName: string;
  teamId: string;
  teamAbbr: string;
  gp: number;
  min: number;
  pctFga2pt: number;
  pctFga3pt: number;
  pctPts2pt: number;
  pctPts2ptMr: number;
  pctPts3pt: number;
  pctPtsFb: number;
  pctPtsFt: number;
  pctPtsOffTov: number;
  pctPtsPaint: number;
  pctAst2pm: number;
  pctUast2pm: number;
  pctAst3pm: number;
  pctUast3pm: number;
  pctAstFgm: number;
  pctUastFgm: number;
}

export interface NbaFourFactorsEntry {
  entityId: string;
  entityName: string;
  teamId: string;
  teamAbbr: string;
  gp: number;
  min: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pace: number;
  efgPct: number;
  ftaRate: number;
  tmTovPct: number;
  orebPct: number;
  oppEfgPct: number;
  oppFtaRate: number;
  oppTovPct: number;
  oppOrebPct: number;
  tsPct?: number;
  drebPct?: number;
  rebPct?: number;
  astPct?: number;
  astTo?: number;
  astRatio?: number;
  usgPct?: number;
  pie?: number;
}

export interface NbaViolationsEntry {
  entityId: string;
  entityName: string;
  teamId: string;
  teamAbbr: string;
  gp: number;
  min: number;
  travel: number;
  doubleDribble: number;
  discontinuedDribble: number;
  offThreeSec: number;
  fiveSec: number;
  eightSec: number;
  shotClock: number;
  inbound: number;
  backcourt: number;
  offGoaltending: number;
  palming: number;
  offFoul: number;
  defThreeSec: number;
  charge: number;
  delayOfGame: number;
  defGoaltending: number;
  lane: number;
  jumpBall: number;
  kickedBall: number;
  totalViolations: number;
  pf: number;
  pfd: number;
  blka: number;
  tov: number;
  dd2: number;
  td3: number;
  nbaFantasyPts: number;
  ptsPaint?: number;
  pts2ndChance?: number;
  ptsFb?: number;
  ptsOffTov?: number;
  oppPtsPaint?: number;
  oppPts2ndChance?: number;
  oppPtsFb?: number;
  oppPtsOffTov?: number;
}

export interface NbaPlaytypeRow {
  playType: string;
  playTypeLabelEs: string;
  typeGrouping: 'offensive' | 'defensive';
  percentile: number;
  gp: number;
  possPct: number;
  ppp: number;
  fgPct: number;
  efgPct: number;
  ftPossPct: number;
  tovPossPct: number;
  sfPossPct: number;
  scorePossPct: number;
  poss: number;
  pts: number;
}

export interface NbaPlaytypeEntitySummary {
  entityId: string;
  entityName: string;
  teamId: string;
  teamAbbr: string;
  gp: number;
  totalPossOff: number;
  topPlayTypeOff: NbaPlaytypeRow | null;
  topPlayTypeDef: NbaPlaytypeRow | null;
  offensive: NbaPlaytypeRow[];
  defensive: NbaPlaytypeRow[];
}

export interface NbaOnOffSplitEntry {
  playerId: string;
  playerName: string;
  gp: number;
  minOn: number;
  offRtgOn: number;
  defRtgOn: number;
  netRtgOn: number;
  paceOn: number;
  efgOn: number;
  tsOn: number;
  minOff: number;
  offRtgOff: number;
  defRtgOff: number;
  netRtgOff: number;
  paceOff: number;
  efgOff: number;
  tsOff: number;
  netDiff: number;
  offDiff: number;
  defDiff: number;
}

export type NbaHeroicShotType = 'buzzer_beater' | 'game_winner' | 'ot_tying_buzzer';

export interface NbaHeroicShotEntry {
  id: string;
  seasonLabel: string;
  gameId: string;
  date: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamAbbr: string;
  opponentAbbr: string;
  isHome: boolean;
  shotType: NbaHeroicShotType;
  period: number;
  periodLabel: string;
  clock: string;
  clockSeconds: number;
  description: string;
  points: number;
  finalScoreTeam: number;
  finalScoreOpp: number;
  wonGame: boolean;
  shotDistance?: number | null;
}

export interface NbaHeroicShotCountSummary {
  buzzerBeaters: number;
  gameWinners: number;
  otTyingBuzzers: number;
}

export interface NbaHeroicShotsResponse {
  season: string;
  generatedAt: string;
  totalEvents: number;
  items: NbaHeroicShotEntry[];
  playerCounts: Record<string, NbaHeroicShotCountSummary>;
  teamCounts: Record<string, NbaHeroicShotCountSummary>;
}

export interface NbaLineupEntry {
  groupId: string;
  groupName: string;
  teamId: string;
  teamAbbr: string;
  groupQuantity: 2 | 3 | 5;
  gp: number;
  w: number;
  l: number;
  wPct: number;
  min: number;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pace: number;
  efgPct: number;
  tsPct: number;
  orebPct: number;
  drebPct: number;
  rebPct: number;
  astPct: number;
  astTo: number;
  astRatio?: number;
  tovPct: number;
  poss: number;
  pie: number;
  // Capa 1: Básicas & Caja (leaguedashlineups?MeasureType=Base)
  pts?: number;
  reb?: number;
  oreb?: number;
  dreb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  blka?: number;
  tov?: number;
  pf?: number;
  pfd?: number;
  fgm?: number;
  fga?: number;
  fgPct?: number;
  fg3m?: number;
  fg3a?: number;
  fg3Pct?: number;
  ftm?: number;
  fta?: number;
  ftPct?: number;
  plusMinus?: number;
  // Capa 2: Cuatro Factores oficiales de la alineación (MeasureType=Four Factors)
  ftaRate?: number;
  oppEfgPct?: number;
  oppFtaRate?: number;
  oppTovPct?: number;
  oppOrebPct?: number;
  // Capas 3-10 integradas (Scoring/Misc/Opponent oficial + composición de jugadores del quinteto/dúo/trío)
  advFourFactors?: NbaFourFactorsEntry;
  advScoring?: NbaScoringSplitsEntry;
  advZones?: NbaShotZonesEntry;
  advTracking?: NbaTrackingEntry;
  advDefHustle?: NbaDefenseHustleEntry;
  advClutch?: NbaClutchEntry;
  advPlaytypes?: NbaPlaytypeEntitySummary;
  advViolations?: NbaViolationsEntry;
}

export interface NbaAdvancedLeagueResponse<T = any> {
  season: string;
  seasonLabel: string;
  category: NbaAdvancedCategory;
  scope: 'team' | 'player';
  generatedAt: string;
  unavailable?: boolean;
  items: T[];
}

export interface NbaLineupsResponse {
  season: string;
  seasonLabel: string;
  groupQuantity: 2 | 3 | 5;
  teamId: string;
  generatedAt: string;
  unavailable?: boolean;
  items: NbaLineupEntry[];
}

export interface NbaAdvancedBenchmarkStat {
  mean: number;
  sd: number;
}

export interface NbaTeamDossierAdvancedResponse {
  teamId: string;
  season: string;
  seasonLabel: string;
  generatedAt: string;
  unavailable?: boolean;
  shotZones: NbaShotZonesEntry | null;
  clutch: NbaClutchEntry | null;
  defenseHustle: NbaDefenseHustleEntry | null;
  tracking: NbaTrackingEntry | null;
  scoring?: NbaScoringSplitsEntry | null;
  fourFactors?: NbaFourFactorsEntry | null;
  violations?: NbaViolationsEntry | null;
  playtypesOff: NbaPlaytypeRow[];
  playtypesDef: NbaPlaytypeRow[];
  onOffSplits: NbaOnOffSplitEntry[];
  lineups5: NbaLineupEntry[];
  lineups3?: NbaLineupEntry[];
  lineups2: NbaLineupEntry[];
  heroicShots?: NbaHeroicShotEntry[];
  leagueBenchmarks?: Record<string, NbaAdvancedBenchmarkStat>;
}

export interface NbaPlayerDossierAdvancedResponse {
  playerId: string;
  teamId: string;
  season: string;
  seasonLabel: string;
  generatedAt: string;
  unavailable?: boolean;
  shotZones: NbaShotZonesEntry | null;
  clutch: NbaClutchEntry | null;
  defenseHustle: NbaDefenseHustleEntry | null;
  tracking: NbaTrackingEntry | null;
  scoring?: NbaScoringSplitsEntry | null;
  fourFactors?: NbaFourFactorsEntry | null;
  violations?: NbaViolationsEntry | null;
  playtypesOff: NbaPlaytypeRow[];
  playtypesDef: NbaPlaytypeRow[];
  onOffSplit: NbaOnOffSplitEntry | null;
  heroicShots?: NbaHeroicShotEntry[];
  leagueBenchmarks?: Record<string, NbaAdvancedBenchmarkStat>;
}



