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
  | 'fantasy_espn'
  | 'glossary';

export type ExperienceMode = 'simple' | 'advanced';

export type SeasonMode = 'continuous' | '2027' | '2026';

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
  tovPct: number;
  pie: number;
  ptsPaint: number;
  oppPtsPaint: number;
  ptsFastBreak: number;
  pts2ndChance: number;
  ptsOffTov: number;
  contestedShots: number;
  deflections: number;
  boxOuts: number;
  looseBalls?: number;
  screenAssists: number;
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
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pie: number;
  usgPct?: number;
  tsPct?: number;
  efgPct?: number;
  astTo?: number;
  astPct: number;
  orebPct: number;
  drebPct: number;
  rebPct: number;
  ptsPaint: number;
  pts2ndChance: number;
  ptsFastBreak: number;
  ptsOffTov: number;
  contestedShots: number;
  deflections: number;
  screenAssists: number;
  boxOuts: number;
  looseBalls: number;
  foulsDrawn: number;
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

export type AnomalyCategory =
  | 'surge'
  | 'slump'
  | 'role_shift'
  | 'shooting_variance'
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
  consistencyScore: number;
  profileLabel: string;
  hitRate20Pts: number;
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

export interface FantasyPlayerInjuryAlert {
  playerNameNorm: string;
  displayName: string;
  severity: FantasyInjurySeverity;
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

export interface FantasyManualLeagueState {
  updatedAt: number;
  myTeamName: string;
  roster: FantasyRosterContract[];
  takenRivalIds: string[];
  rivalRosters: Record<string, string[]>;
  rivalTeamNames: Record<string, string>;
}

export interface FantasyEspnSyncPayload {
  generatedAt: string;
  injuriesByNormName: Record<string, FantasyPlayerInjuryAlert>;
  injuriesByPlayerId: Record<string, FantasyPlayerInjuryAlert>;
  weeks: FantasyWeekWindow[];
  defaultWeekId: string;
  savedState: FantasyManualLeagueState | null;
}
