import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Flame,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  AutoStreakRuleCategory,
  AutoStreakRuleConfig,
  AutoStreakRuleOperator,
  AutoStreaksConfig,
  AutoStreaksConfigValues,
  PlayerSummary,
  TeamSummary,
} from '../types/nba';
import {
  AUTO_STREAK_CATEGORIES,
  DEFAULT_AUTO_STREAKS_CONFIG,
  TEAM_STREAK_METRIC_OPTIONS,
  buildAutoRuleLabel,
  formatRuleOperatorSymbol,
  getDefaultAutoStreakRuleForKey,
  isBinaryStreakMetric,
} from '../utils/autoStreaksConfig';
import {
  computeCalibratedThresholdForRule,
  computeNbaStreakBenchmarks,
  countSingleAutoStreakRuleMatches,
  detectConfigurableActiveStreaks,
  type NbaCalibrationPreset,
  type StreakSeasonReferenceSlices,
} from '../utils/autoStreaksEngine';
import {
  STREAK_METRIC_GROUPS,
  STREAK_METRIC_OPTIONS,
} from '../utils/streakMetricsCatalog';
import {
  fetchAdminAutoStreaksConfig,
  resetAdminAutoStreaksConfigDefaults,
  updateAdminAutoStreaksConfig,
} from '../utils/adminAuthClient';

interface AdminStreaksConfigPanelProps {
  players: PlayerSummary[];
  teams: TeamSummary[];
  seasonReferenceSlices?: StreakSeasonReferenceSlices;
  currentConfig: AutoStreaksConfig;
  onConfigSaved: (saved: AutoStreaksConfig) => void;
  onLockSession?: () => void;
}

type TableSortMode = 'hits_desc' | 'category' | 'alpha';

interface InlineRestrictionDraft {
  operator: AutoStreakRuleOperator;
  threshold: number;
  minGamesOverride: string;
  minMinutes: string;
  minAttempts: string;
}

const NOISY_THRESHOLD = 10;
const PLAYER_METRIC_MAP = new Map(STREAK_METRIC_OPTIONS.map((m) => [m.id, m]));
const TEAM_METRIC_MAP = new Map(TEAM_STREAK_METRIC_OPTIONS.map((m) => [m.id, m]));

function inferCategoryForPlayerMetric(metricId: string, isPositive: boolean): AutoStreakRuleCategory {
  if (!isPositive) return 'slumps';
  if (metricId === 'doubleDouble' || metricId === 'tripleDouble') return 'milestones';
  if (metricId === 'points' || metricId === 'fgm' || metricId === 'fga' || metricId === 'fg2m' || metricId === 'ptsPer36') return 'scoring';
  if (metricId === 'rebounds' || metricId === 'oreb' || metricId === 'dreb' || metricId === 'rebPer36') return 'rebounding';
  if (metricId === 'assists' || metricId === 'astTo' || metricId === 'astPer36') return 'playmaking';
  if (metricId === 'steals' || metricId === 'blocks' || metricId === 'stocks' || metricId === 'stocksPer36') return 'defense';
  if (metricId === 'fg3m' || metricId === 'fg3a' || metricId === 'fg3Pct' || metricId === 'ftm' || metricId === 'fta' || metricId === 'ftPct' || metricId === 'fg3mPer36') return 'shooting';
  if (metricId === 'pra' || metricId === 'ptsReb' || metricId === 'ptsAst' || metricId === 'rebAst' || metricId === 'praPer36') return 'combos';
  return 'efficiency';
}

function getRuleStep(rule: Pick<AutoStreakRuleConfig, 'entityType' | 'metricId'>): number {
  if (rule.entityType === 'team') {
    return TEAM_METRIC_MAP.get(rule.metricId)?.step ?? 1;
  }
  return PLAYER_METRIC_MAP.get(rule.metricId)?.step ?? 1;
}

function getRuleBounds(
  rule: Pick<AutoStreakRuleConfig, 'entityType' | 'metricId'>
): { min: number; max: number; isBinary: boolean } {
  if (rule.entityType === 'team') {
    const def = TEAM_METRIC_MAP.get(rule.metricId);
    return {
      min: def?.min ?? -50,
      max: def?.max ?? 200,
      isBinary: Boolean(def?.isBinary) || isBinaryStreakMetric(rule.metricId),
    };
  }
  const def = PLAYER_METRIC_MAP.get(rule.metricId);
  return {
    min: def?.min ?? -40,
    max: def?.max ?? 120,
    isBinary: isBinaryStreakMetric(rule.metricId),
  };
}

function getAttemptsUnitLabel(metricId: string): string {
  if (metricId === 'fg3Pct' || metricId === 'fg3m') return '3PA';
  if (metricId === 'ftPct' || metricId === 'ftm') return 'TLI';
  if (metricId === 'fg2Pct' || metricId === 'fg2m') return 'T2I';
  return 'TCI';
}

function formatBenchmarkValue(value: number, unit: string, step: number): string {
  const cleanUnit = unit.trim();
  const formatted =
    step < 0.1
      ? value.toFixed(2)
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(1);
  if (cleanUnit === '%') return `${formatted}%`;
  if (cleanUnit === 'x') return `${formatted}x`;
  return cleanUnit ? `${formatted} ${cleanUnit}` : formatted;
}

export const AdminStreaksConfigPanel: React.FC<AdminStreaksConfigPanelProps> = ({
  players,
  teams,
  seasonReferenceSlices,
  currentConfig,
  onConfigSaved,
  onLockSession,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savedConfig, setSavedConfig] = useState<AutoStreaksConfig>(currentConfig);
  const [draft, setDraft] = useState<AutoStreaksConfigValues>({
    minStreakGames: currentConfig.minStreakGames,
    rules: currentConfig.rules.map((r) => ({ ...r })),
  });
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Auto-calibration preference
  const [preserveCustomOnCalibrate, setPreserveCustomOnCalibrate] = useState(true);

  // Master table filters & sorting
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [ruleSearch, setRuleSearch] = useState('');
  const [sortBy, setSortBy] = useState<TableSortMode>('hits_desc');

  // Inline row restriction editor
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<InlineRestrictionDraft | null>(null);

  // Collapsible custom restriction creator drawer
  const [showCustomDrawer, setShowCustomDrawer] = useState(false);
  const [newEntityType, setNewEntityType] = useState<'player' | 'team'>('player');
  const [newMetricId, setNewMetricId] = useState<string>('points');
  const [newOperator, setNewOperator] = useState<AutoStreakRuleOperator>('gte');
  const [newThreshold, setNewThreshold] = useState<number>(20);
  const [newMinGamesOverride, setNewMinGamesOverride] = useState<string>('8');
  const [newMinMinutes, setNewMinMinutes] = useState<string>('28');
  const [newMinAttempts, setNewMinAttempts] = useState<string>('');
  const [newIsPositive, setNewIsPositive] = useState<boolean>(true);
  const [newLabel, setNewLabel] = useState<string>('');
  const [labelTouched, setLabelTouched] = useState<boolean>(false);

  const onLockSessionRef = useRef(onLockSession);
  onLockSessionRef.current = onLockSession;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatusMessage(null);
    fetchAdminAutoStreaksConfig()
      .then((res) => {
        if (cancelled) return;
        if (res.unauthorized) {
          onLockSessionRef.current?.();
          setLoading(false);
          return;
        }
        if (res.ok && res.config) {
          setSavedConfig(res.config);
          setDraft({
            minStreakGames: res.config.minStreakGames,
            rules: res.config.rules.map((r) => ({ ...r })),
          });
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live 2026-27 NBA league benchmarks (computed once per dataset load)
  const nbaBenchmarks = useMemo(
    () => computeNbaStreakBenchmarks(players, teams),
    [players, teams]
  );

  // Live simulation of all active streaks with current draft
  const liveStreaks = useMemo(() => {
    return detectConfigurableActiveStreaks(
      players,
      teams,
      draft.minStreakGames,
      5,
      seasonReferenceSlices,
      draft
    );
  }, [players, teams, seasonReferenceSlices, draft]);

  const liveSummary = useMemo(() => {
    let playerStreaks = 0;
    let teamStreaks = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    const perRuleHits = new Map<
      string,
      {
        count: number;
        topName: string;
        topTeam: string;
        topStreak: number;
        topThresholdLabel: string;
      }
    >();

    for (const s of liveStreaks) {
      if (s.entityType === 'player') playerStreaks++;
      else teamStreaks++;
      if (s.isPositive) positiveCount++;
      else negativeCount++;
      if (s.ruleId) {
        const cur = perRuleHits.get(s.ruleId);
        if (!cur) {
          perRuleHits.set(s.ruleId, {
            count: 1,
            topName: s.entityName,
            topTeam: s.teamAbbr,
            topStreak: s.count,
            topThresholdLabel: s.thresholdLabel,
          });
        } else {
          cur.count++;
          if (s.count > cur.topStreak) {
            cur.topName = s.entityName;
            cur.topTeam = s.teamAbbr;
            cur.topStreak = s.count;
            cur.topThresholdLabel = s.thresholdLabel;
          }
        }
      }
    }

    let noisyRulesCount = 0;
    let customRulesCount = 0;
    let overriddenGamesCount = 0;
    let enabledRulesCount = 0;

    for (const r of draft.rules) {
      if (r.enabled) {
        enabledRulesCount++;
        const hits = perRuleHits.get(r.id)?.count ?? 0;
        if (hits > NOISY_THRESHOLD) noisyRulesCount++;
      }
      if (r.isCustom) customRulesCount++;
      if (r.minGamesOverride !== null && r.minGamesOverride !== draft.minStreakGames) {
        overriddenGamesCount++;
      }
    }

    return {
      total: liveStreaks.length,
      playerStreaks,
      teamStreaks,
      positiveCount,
      negativeCount,
      enabledRulesCount,
      noisyRulesCount,
      customRulesCount,
      overriddenGamesCount,
      topStreak: liveStreaks[0] || null,
      perRuleHits,
    };
  }, [liveStreaks, draft.rules, draft.minStreakGames]);

  // Inline restriction preview (real before -> after comparison)
  const expandedRule = useMemo(
    () => (expandedRuleId ? draft.rules.find((r) => r.id === expandedRuleId) ?? null : null),
    [expandedRuleId, draft.rules]
  );

  const inlinePreview = useMemo(() => {
    if (!expandedRule || !inlineDraft) return null;
    const ov = inlineDraft.minGamesOverride.trim() ? Number(inlineDraft.minGamesOverride) : null;
    const minM = inlineDraft.minMinutes.trim() ? Number(inlineDraft.minMinutes) : null;
    const minA = inlineDraft.minAttempts.trim() ? Number(inlineDraft.minAttempts) : null;
    const candidate: AutoStreakRuleConfig = {
      ...expandedRule,
      operator: inlineDraft.operator,
      threshold: Number.isFinite(inlineDraft.threshold) ? inlineDraft.threshold : expandedRule.threshold,
      minGamesOverride: ov && Number.isInteger(ov) && ov >= 2 && ov <= 25 ? ov : null,
      minMinutes: minM && Number.isFinite(minM) && minM > 0 ? minM : null,
      minAttempts: minA && Number.isFinite(minA) && minA > 0 ? minA : null,
      enabled: true,
    };
    return countSingleAutoStreakRuleMatches(players, teams, candidate, draft.minStreakGames);
  }, [expandedRule, inlineDraft, players, teams, draft.minStreakGames]);

  // Custom restriction drawer state helpers
  const selectedNewPlayerMetric = useMemo(
    () => (newEntityType === 'player' ? PLAYER_METRIC_MAP.get(newMetricId) : undefined),
    [newEntityType, newMetricId]
  );
  const selectedNewTeamMetric = useMemo(
    () => (newEntityType === 'team' ? TEAM_METRIC_MAP.get(newMetricId) : undefined),
    [newEntityType, newMetricId]
  );

  const existingMatchingRule = useMemo(
    () =>
      draft.rules.find(
        (r) =>
          r.entityType === newEntityType &&
          r.metricId === newMetricId &&
          r.isPositive === newIsPositive
      ) || null,
    [draft.rules, newEntityType, newMetricId, newIsPositive]
  );

  const computedNewLabel = useMemo(() => {
    const shortLabel =
      newEntityType === 'player'
        ? selectedNewPlayerMetric?.shortLabel || newMetricId
        : selectedNewTeamMetric?.shortLabel || newMetricId;
    const unit =
      newEntityType === 'player'
        ? selectedNewPlayerMetric?.unit || ''
        : selectedNewTeamMetric?.unit || '';
    const minM = newMinMinutes.trim() ? Number(newMinMinutes) : null;
    const minA = newMinAttempts.trim() ? Number(newMinAttempts) : null;
    if (newMetricId === 'doubleDouble') return 'Doble-Doble (DD2) consecutivo';
    if (newMetricId === 'tripleDouble') return 'Triple-Doble (TD3) consecutivo';
    if (newMetricId === 'team_win') return 'Victorias consecutivas';
    if (newMetricId === 'team_loss') return 'Derrotas consecutivas';
    return buildAutoRuleLabel(
      shortLabel,
      newOperator,
      newThreshold,
      unit,
      minM,
      minA,
      getAttemptsUnitLabel(newMetricId)
    );
  }, [
    newEntityType,
    newMetricId,
    newOperator,
    newThreshold,
    newMinMinutes,
    newMinAttempts,
    selectedNewPlayerMetric,
    selectedNewTeamMetric,
  ]);

  const effectiveNewLabel = labelTouched && newLabel.trim() ? newLabel.trim() : computedNewLabel;

  const customDrawerLivePreview = useMemo(() => {
    if (!showCustomDrawer) return null;
    const metricLabel =
      newEntityType === 'player'
        ? selectedNewPlayerMetric?.shortLabel || newMetricId
        : selectedNewTeamMetric?.shortLabel || newMetricId;
    const unit =
      newEntityType === 'player'
        ? selectedNewPlayerMetric?.unit || ''
        : selectedNewTeamMetric?.unit || '';
    const overrideNum = newMinGamesOverride.trim() ? Number(newMinGamesOverride) : null;
    const minM = newMinMinutes.trim() ? Number(newMinMinutes) : null;
    const minA = newMinAttempts.trim() ? Number(newMinAttempts) : null;

    const candidateRule: AutoStreakRuleConfig = {
      id: '__preview__',
      entityType: newEntityType,
      metricId: newMetricId,
      category:
        newEntityType === 'team'
          ? 'team'
          : inferCategoryForPlayerMetric(newMetricId, newIsPositive),
      metricLabel,
      label: effectiveNewLabel,
      operator: newOperator,
      threshold: Number.isFinite(newThreshold) ? newThreshold : 0,
      minGamesOverride:
        overrideNum && Number.isInteger(overrideNum) && overrideNum >= 2 && overrideNum <= 25
          ? overrideNum
          : null,
      minMinutes: minM && Number.isFinite(minM) && minM > 0 ? minM : null,
      minAttempts: minA && Number.isFinite(minA) && minA > 0 ? minA : null,
      groupSingle: null,
      breakoutAxis: null,
      unit,
      isPositive: newIsPositive,
      enabled: true,
      isCustom: true,
    };

    return countSingleAutoStreakRuleMatches(players, teams, candidateRule, draft.minStreakGames);
  }, [
    showCustomDrawer,
    players,
    teams,
    draft.minStreakGames,
    newEntityType,
    newMetricId,
    newOperator,
    newThreshold,
    newMinGamesOverride,
    newMinMinutes,
    newMinAttempts,
    newIsPositive,
    effectiveNewLabel,
    selectedNewPlayerMetric,
    selectedNewTeamMetric,
  ]);

  const hasUnsavedChanges = useMemo(() => {
    return (
      draft.minStreakGames !== savedConfig.minStreakGames ||
      JSON.stringify(draft.rules) !== JSON.stringify(savedConfig.rules)
    );
  }, [draft, savedConfig]);

  // Handlers
  const setGlobalMinGames = (val: number) => {
    const clamped = Math.max(2, Math.min(25, Math.round(val)));
    setDraft((prev) => ({ ...prev, minStreakGames: clamped }));
    setStatusMessage(null);
  };

  const handleUnifyAllGamesToGlobal = () => {
    setDraft((prev) => ({
      ...prev,
      rules: prev.rules.map((r) => ({ ...r, minGamesOverride: null })),
    }));
    setStatusMessage({
      type: 'success',
      text: `Todas las estadísticas heredan ahora el mínimo global de ${draft.minStreakGames} PJ. Pulsa "Guardar y aplicar cambios" para confirmarlo.`,
    });
  };

  const updateRule = (ruleId: string, patch: Partial<AutoStreakRuleConfig>) => {
    setDraft((prev) => ({
      ...prev,
      rules: prev.rules.map((r) => {
        if (r.id !== ruleId) return r;
        const next = { ...r, ...patch };
        if (
          patch.label === undefined &&
          !isBinaryStreakMetric(next.metricId) &&
          (patch.threshold !== undefined ||
            patch.operator !== undefined ||
            patch.minMinutes !== undefined ||
            patch.minAttempts !== undefined)
        ) {
          next.label = buildAutoRuleLabel(
            next.metricLabel,
            next.operator,
            next.threshold,
            next.unit || '',
            next.minMinutes,
            next.minAttempts,
            getAttemptsUnitLabel(next.metricId)
          );
        }
        return next;
      }),
    }));
    setStatusMessage(null);
  };

  const stepRuleThreshold = (rule: AutoStreakRuleConfig, deltaSign: 1 | -1) => {
    const step = getRuleStep(rule);
    const bounds = getRuleBounds(rule);
    if (bounds.isBinary) return;
    const raw = rule.threshold + deltaSign * step;
    const rounded = Math.round(raw * 100) / 100;
    const clamped = Math.max(bounds.min, Math.min(bounds.max, rounded));
    updateRule(rule.id, { threshold: clamped });
  };

  const applyNbaCalibrationGlobal = (preset: NbaCalibrationPreset) => {
    let updatedCount = 0;
    let skippedCustom = 0;

    setDraft((prev) => ({
      ...prev,
      rules: prev.rules.map((r) => {
        if (preserveCustomOnCalibrate && r.isCustom) {
          skippedCustom++;
          return r;
        }
        const bounds = getRuleBounds(r);
        if (bounds.isBinary) return r;
        const step = getRuleStep(r);
        const bm = nbaBenchmarks.get(`${r.entityType}:${r.metricId}`);
        const calibrated = computeCalibratedThresholdForRule(r, bm, preset, step, bounds);
        if (calibrated === null) return r;
        updatedCount++;
        return {
          ...r,
          threshold: calibrated,
          isCustom: preserveCustomOnCalibrate ? r.isCustom : false,
          label: buildAutoRuleLabel(
            r.metricLabel,
            r.operator,
            calibrated,
            r.unit || '',
            r.minMinutes,
            r.minAttempts,
            getAttemptsUnitLabel(r.metricId)
          ),
        };
      }),
    }));

    const presetName =
      preset === 'nba_mean'
        ? 'Media NBA 26-27'
        : preset === 'p75'
          ? 'Exigente (Percentil 75)'
          : 'Élite (Percentil 90)';

    setStatusMessage({
      type: 'success',
      text: `Autocalibrado "${presetName}" aplicado a ${updatedCount} estadísticas${
        skippedCustom > 0 ? ` (${skippedCustom} restricciones personalizadas respetadas)` : ''
      }. Revisa los contadores y pulsa "Guardar y aplicar cambios".`,
    });
  };

  const applyNbaCalibrationRow = (rule: AutoStreakRuleConfig, preset: NbaCalibrationPreset) => {
    const bounds = getRuleBounds(rule);
    const step = getRuleStep(rule);
    const bm = nbaBenchmarks.get(`${rule.entityType}:${rule.metricId}`);
    const calibrated = computeCalibratedThresholdForRule(rule, bm, preset, step, bounds);
    if (calibrated === null) return;
    updateRule(rule.id, { threshold: calibrated });
  };

  const openInlineRestriction = (rule: AutoStreakRuleConfig) => {
    if (expandedRuleId === rule.id) {
      setExpandedRuleId(null);
      setInlineDraft(null);
      return;
    }
    setExpandedRuleId(rule.id);
    setInlineDraft({
      operator: rule.operator,
      threshold: rule.threshold,
      minGamesOverride: rule.minGamesOverride !== null ? String(rule.minGamesOverride) : '',
      minMinutes: rule.minMinutes !== null && rule.minMinutes !== undefined ? String(rule.minMinutes) : '',
      minAttempts: rule.minAttempts !== null && rule.minAttempts !== undefined ? String(rule.minAttempts) : '',
    });
  };

  const applyInlineRestriction = () => {
    if (!expandedRule || !inlineDraft) return;
    const ov = inlineDraft.minGamesOverride.trim() ? Number(inlineDraft.minGamesOverride) : null;
    const minM = inlineDraft.minMinutes.trim() ? Number(inlineDraft.minMinutes) : null;
    const minA = inlineDraft.minAttempts.trim() ? Number(inlineDraft.minAttempts) : null;
    const bounds = getRuleBounds(expandedRule);
    const clampedThr = bounds.isBinary
      ? expandedRule.threshold
      : Math.max(bounds.min, Math.min(bounds.max, Number.isFinite(inlineDraft.threshold) ? inlineDraft.threshold : expandedRule.threshold));

    updateRule(expandedRule.id, {
      operator: inlineDraft.operator,
      threshold: clampedThr,
      minGamesOverride: ov && Number.isInteger(ov) && ov >= 2 && ov <= 25 ? ov : null,
      minMinutes: minM && Number.isFinite(minM) && minM > 0 ? minM : null,
      minAttempts: minA && Number.isFinite(minA) && minA > 0 ? minA : null,
      enabled: true,
      isCustom: true,
    });

    setStatusMessage({
      type: 'success',
      text: `Restricción prioritaria aplicada a ${expandedRule.metricLabel}. Sustituye al baremo base de esta estadística. Pulsa "Guardar y aplicar cambios" para publicarla.`,
    });
    setExpandedRuleId(null);
    setInlineDraft(null);
  };

  const resetRuleToStandardBase = (rule: AutoStreakRuleConfig) => {
    const def = getDefaultAutoStreakRuleForKey(rule.entityType, rule.metricId, rule.isPositive);
    if (def) {
      setDraft((prev) => ({
        ...prev,
        rules: prev.rules.map((r) => (r.id === rule.id ? { ...def, id: r.id } : r)),
      }));
    } else {
      updateRule(rule.id, {
        minGamesOverride: null,
        minMinutes: null,
        minAttempts: null,
        isCustom: false,
      });
    }
    setExpandedRuleId(null);
    setInlineDraft(null);
    setStatusMessage({
      type: 'success',
      text: `${rule.metricLabel} ha vuelto a su mínimo base estándar (${draft.minStreakGames} PJ).`,
    });
  };

  const handleNewEntityTypeChange = (next: 'player' | 'team') => {
    setNewEntityType(next);
    setLabelTouched(false);
    if (next === 'player') {
      const m = PLAYER_METRIC_MAP.get('points') || STREAK_METRIC_OPTIONS[0];
      setNewMetricId(m.id);
      setNewOperator(m.defaultOperator || 'gte');
      setNewThreshold(m.defaultThreshold);
      setNewIsPositive(!m.lowerIsBetter);
    } else {
      const m = TEAM_METRIC_MAP.get('team_pts_for') || TEAM_STREAK_METRIC_OPTIONS[0];
      setNewMetricId(m.id);
      setNewOperator(m.defaultOperator || 'gte');
      setNewThreshold(m.defaultThreshold);
      setNewIsPositive(m.id !== 'team_loss');
      setNewMinMinutes('');
      setNewMinAttempts('');
    }
  };

  const handleNewMetricChange = (metricId: string) => {
    setNewMetricId(metricId);
    setLabelTouched(false);
    if (newEntityType === 'player') {
      const m = PLAYER_METRIC_MAP.get(metricId);
      if (m) {
        setNewOperator(m.defaultOperator || 'gte');
        setNewThreshold(m.defaultThreshold);
        setNewIsPositive(!m.lowerIsBetter);
      }
    } else {
      const m = TEAM_METRIC_MAP.get(metricId);
      if (m) {
        setNewOperator(m.defaultOperator || 'gte');
        setNewThreshold(m.defaultThreshold);
        setNewIsPositive(m.id !== 'team_loss');
      }
    }
  };

  const handleApplyCustomDrawerRule = () => {
    const metricLabel =
      newEntityType === 'player'
        ? selectedNewPlayerMetric?.shortLabel || newMetricId
        : selectedNewTeamMetric?.shortLabel || newMetricId;
    const unit =
      newEntityType === 'player'
        ? selectedNewPlayerMetric?.unit || ''
        : selectedNewTeamMetric?.unit || '';
    const overrideNum = newMinGamesOverride.trim() ? Number(newMinGamesOverride) : null;
    const minM = newEntityType === 'player' && newMinMinutes.trim() ? Number(newMinMinutes) : null;
    const minA = newEntityType === 'player' && newMinAttempts.trim() ? Number(newMinAttempts) : null;

    if (existingMatchingRule) {
      setDraft((prev) => ({
        ...prev,
        rules: prev.rules.map((r) =>
          r.id === existingMatchingRule.id
            ? {
                ...r,
                operator: newOperator,
                threshold: Number.isFinite(newThreshold) ? newThreshold : r.threshold,
                label: effectiveNewLabel,
                minGamesOverride:
                  overrideNum && Number.isInteger(overrideNum) && overrideNum >= 2 && overrideNum <= 25
                    ? overrideNum
                    : null,
                minMinutes: minM && Number.isFinite(minM) && minM > 0 ? minM : null,
                minAttempts: minA && Number.isFinite(minA) && minA > 0 ? minA : null,
                enabled: true,
                isCustom: true,
              }
            : r
        ),
      }));
      setStatusMessage({
        type: 'success',
        text: `Regla restrictiva prioritaria aplicada sobre ${existingMatchingRule.metricLabel}: "${effectiveNewLabel}". Sustituye al mínimo base de esa estadística.`,
      });
      setShowCustomDrawer(false);
      return;
    }

    if (draft.rules.length >= 200) {
      setStatusMessage({
        type: 'error',
        text: 'Se ha alcanzado el límite máximo de 200 reglas simultáneas.',
      });
      return;
    }

    const customId = `custom_${newEntityType}_${newMetricId}_${Date.now().toString(36)}`;
    const newRule: AutoStreakRuleConfig = {
      id: customId,
      entityType: newEntityType,
      metricId: newMetricId,
      category:
        newEntityType === 'team'
          ? 'team'
          : inferCategoryForPlayerMetric(newMetricId, newIsPositive),
      metricLabel,
      label: effectiveNewLabel,
      operator: newOperator,
      threshold: Number.isFinite(newThreshold) ? newThreshold : 1,
      minGamesOverride:
        overrideNum && Number.isInteger(overrideNum) && overrideNum >= 2 && overrideNum <= 25
          ? overrideNum
          : null,
      minMinutes: minM && Number.isFinite(minM) && minM > 0 ? minM : null,
      minAttempts: minA && Number.isFinite(minA) && minA > 0 ? minA : null,
      groupSingle: null,
      breakoutAxis: null,
      unit,
      isPositive: newIsPositive,
      enabled: true,
      isCustom: true,
    };

    setDraft((prev) => ({
      ...prev,
      rules: [newRule, ...prev.rules],
    }));
    setStatusMessage({
      type: 'success',
      text: `Regla restrictiva "${newRule.label}" añadida con prioridad. Pulsa "Guardar y aplicar cambios" para publicarla.`,
    });
    setShowCustomDrawer(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    const res = await updateAdminAutoStreaksConfig(draft);
    if (res.unauthorized) {
      onLockSession?.();
      setSaving(false);
      return;
    }
    if (res.ok && res.config) {
      setSavedConfig(res.config);
      setDraft({
        minStreakGames: res.config.minStreakGames,
        rules: res.config.rules.map((r) => ({ ...r })),
      });
      onConfigSaved(res.config);
      setStatusMessage({
        type: 'success',
        text: `Configuración guardada (${res.config.minStreakGames}+ PJ globales · ${res.config.rules.filter((r) => r.enabled).length} estadísticas activas). Publicada al instante en Rachas y Consistencia.`,
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: res.error || 'Error al guardar la configuración de rachas.',
      });
    }
    setSaving(false);
  };

  const handleResetDefaults = async () => {
    setResetting(true);
    setStatusMessage(null);
    const res = await resetAdminAutoStreaksConfigDefaults();
    if (res.unauthorized) {
      onLockSession?.();
      setResetting(false);
      return;
    }
    if (res.ok && res.config) {
      setSavedConfig(res.config);
      setDraft({
        minStreakGames: res.config.minStreakGames,
        rules: res.config.rules.map((r) => ({ ...r })),
      });
      onConfigSaved(res.config);
      setExpandedRuleId(null);
      setInlineDraft(null);
      setStatusMessage({
        type: 'success',
        text: `Tabla restaurada por defecto (${DEFAULT_AUTO_STREAKS_CONFIG.minStreakGames}+ PJ globales en todas las estadísticas).`,
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: res.error || 'No se pudo restablecer la configuración por defecto.',
      });
    }
    setResetting(false);
  };

  // Filter & sort master table
  const filteredAndSortedRules = useMemo(() => {
    const q = ruleSearch.trim().toLowerCase();
    const list = draft.rules.filter((r) => {
      const hits = liveSummary.perRuleHits.get(r.id)?.count ?? 0;
      if (categoryFilter === 'active_hits' && hits === 0) return false;
      if (categoryFilter === 'noisy' && (!r.enabled || hits <= NOISY_THRESHOLD)) return false;
      if (categoryFilter === 'custom' && !r.isCustom) return false;
      if (categoryFilter === 'player' && r.entityType !== 'player') return false;
      if (categoryFilter === 'team' && r.entityType !== 'team') return false;
      if (categoryFilter === 'disabled' && r.enabled) return false;
      if (
        categoryFilter !== 'all' &&
        categoryFilter !== 'active_hits' &&
        categoryFilter !== 'noisy' &&
        categoryFilter !== 'custom' &&
        categoryFilter !== 'player' &&
        categoryFilter !== 'team' &&
        categoryFilter !== 'disabled' &&
        r.category !== categoryFilter
      ) {
        return false;
      }
      if (q) {
        const hay = `${r.label} ${r.metricLabel} ${r.metricId} ${r.category} ${
          r.entityType === 'team' ? 'equipo' : 'jugador'
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'hits_desc') {
      return [...list].sort((a, b) => {
        const ha = liveSummary.perRuleHits.get(a.id)?.count ?? 0;
        const hb = liveSummary.perRuleHits.get(b.id)?.count ?? 0;
        if (hb !== ha) return hb - ha;
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.metricLabel.localeCompare(b.metricLabel, 'es');
      });
    }
    if (sortBy === 'alpha') {
      return [...list].sort((a, b) => a.metricLabel.localeCompare(b.metricLabel, 'es'));
    }
    return list;
  }, [draft.rules, categoryFilter, ruleSearch, sortBy, liveSummary.perRuleHits]);

  if (loading) {
    return (
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-8 flex items-center justify-center gap-3 text-slate-300">
        <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
        <span className="text-sm font-medium">
          Cargando tabla maestra de rachas y referencias NBA 2026-27...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5 min-w-0 max-w-full">
      {/* 1. Cabecera Unificada y Acciones Principales */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-orange-400">
              <Flame className="w-4 h-4" />
              <span>Motor Único de Rachas · Prioridad Directa</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Tabla Maestra de Calibración y Referencia NBA 2026-27
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              No existen dos sistemas paralelos: cada estadística tiene{' '}
              <span className="text-slate-200 font-medium">una única regla activa</span>. El motor
              dinámico detecta el valor real alcanzado por encima de ese umbral (ej. 24+ PTS en 8 PJ).
              Si añades una{' '}
              <span className="text-amber-300 font-medium">restricción personalizada</span> en una
              métrica ruidosa, ésta tiene prioridad y sustituye al baremo base de esa estadística.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={resetting || saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
              <span>Restaurar por defecto (5 PJ)</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || resetting}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap ${
                hasUnsavedChanges
                  ? 'bg-orange-500 hover:bg-orange-400 text-slate-950'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? 'Guardando...'
                  : hasUnsavedChanges
                    ? 'Guardar y aplicar cambios'
                    : 'Guardado y activo'}
              </span>
            </button>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`mt-4 px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* 2. Control Global (PJ + Impacto + Autocalibrado NBA) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Global consecutive games selector */}
        <div className="xl:col-span-5 bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">
                Partidos consecutivos globales
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Mínimo base por defecto ({draft.minStreakGames} PJ) para todas las estadísticas sin PJ propio.
              </p>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-[#0B1120] border border-orange-500/40 text-orange-300 font-mono text-base font-extrabold tabular-nums shrink-0">
              {draft.minStreakGames}+ PJ
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setGlobalMinGames(draft.minStreakGames - 1)}
                disabled={draft.minStreakGames <= 2}
                className="w-8 h-8 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/50 text-slate-200 flex items-center justify-center disabled:opacity-40 transition-colors"
                aria-label="Disminuir partidos seguidos"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <input
                type="range"
                min={2}
                max={20}
                step={1}
                value={Math.min(20, draft.minStreakGames)}
                onChange={(e) => setGlobalMinGames(Number(e.target.value))}
                className="flex-1 accent-orange-500 cursor-pointer"
              />

              <button
                type="button"
                onClick={() => setGlobalMinGames(draft.minStreakGames + 1)}
                disabled={draft.minStreakGames >= 25}
                className="w-8 h-8 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/50 text-slate-200 flex items-center justify-center disabled:opacity-40 transition-colors"
                aria-label="Aumentar partidos seguidos"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              <input
                type="number"
                min={2}
                max={25}
                value={draft.minStreakGames}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setGlobalMinGames(n);
                }}
                className="w-14 px-2 py-1.5 text-center font-mono text-xs font-bold tabular-nums bg-[#0B1120] border border-[#1E293B] rounded-lg text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {[3, 4, 5, 6, 7, 10].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setGlobalMinGames(preset)}
                    className={`px-2 py-1 rounded text-xs font-mono font-semibold transition-colors whitespace-nowrap ${
                      draft.minStreakGames === preset
                        ? 'bg-orange-500 text-slate-950'
                        : 'bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white'
                    }`}
                  >
                    {preset} PJ
                  </button>
                ))}
              </div>

              {liveSummary.overriddenGamesCount > 0 && (
                <button
                  type="button"
                  onClick={handleUnifyAllGamesToGlobal}
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-sky-500/15 border border-sky-500/35 text-sky-300 hover:bg-sky-500/25 transition-colors whitespace-nowrap"
                  title="Limpia los PJ individuales heredados para que todas las filas usen el mínimo global"
                >
                  Unificar {liveSummary.overriddenGamesCount} filas a {draft.minStreakGames} PJ
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live Counter + NBA Auto-Calibration */}
        <div className="xl:col-span-7 bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">
                Impacto en vivo sobre la NBA 2026-27
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
                <span>
                  Jugadores: <strong className="text-sky-300">{liveSummary.playerStreaks}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Equipos: <strong className="text-indigo-300">{liveSummary.teamStreaks}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Positivas: <strong className="text-emerald-300">{liveSummary.positiveCount}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Baches: <strong className="text-rose-300">{liveSummary.negativeCount}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter(liveSummary.noisyRulesCount > 0 ? 'noisy' : 'all');
                    setSortBy('hits_desc');
                  }}
                  className={`underline-offset-2 hover:underline ${
                    liveSummary.noisyRulesCount > 0 ? 'text-amber-300 font-semibold' : 'text-slate-400'
                  }`}
                >
                  Ruidosas (&gt;{NOISY_THRESHOLD}): {liveSummary.noisyRulesCount}
                </button>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-2xl font-black font-mono text-white leading-none tabular-nums">
                {liveSummary.total}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                rachas activas totales
              </div>
            </div>
          </div>

          {/* NBA 26-27 Auto-Calibration Strip */}
          <div className="pt-3 border-t border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                <span>Autocalibrar horquillas con la NBA actual (2026-27)</span>
              </div>
              <label className="inline-flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preserveCustomOnCalibrate}
                  onChange={(e) => setPreserveCustomOnCalibrate(e.target.checked)}
                  className="rounded border-slate-600 bg-[#0B1120] accent-orange-500"
                />
                <span>Respetar mis restricciones personalizadas ({liveSummary.customRulesCount})</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => applyNbaCalibrationGlobal('nba_mean')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0B1120] border border-[#1E293B] text-slate-200 hover:border-orange-500/60 hover:text-white transition-colors whitespace-nowrap"
                title="Ajusta cada estadística a la media real NBA 2026-27 (jugadores con ≥20 MIN y equipos)"
              >
                Media NBA
              </button>
              <button
                type="button"
                onClick={() => applyNbaCalibrationGlobal('p75')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0B1120] border border-orange-500/40 text-orange-300 hover:bg-orange-500/15 transition-colors whitespace-nowrap"
                title="Ajusta cada estadística al Percentil 75 real NBA 2026-27 (top 25%)"
              >
                Exigente (P75)
              </button>
              <button
                type="button"
                onClick={() => applyNbaCalibrationGlobal('p90')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0B1120] border border-[#1E293B] text-slate-200 hover:border-orange-500/60 hover:text-white transition-colors whitespace-nowrap"
                title="Ajusta cada estadística al Percentil 90 real NBA 2026-27 (solo élite top 10%)"
              >
                Élite (P90)
              </button>
            </div>
          </div>

          {liveSummary.topStreak && (
            <div className="text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1E293B]/70">
              <span>Racha más larga activa:</span>
              <span className="text-slate-200 font-medium truncate">
                {liveSummary.topStreak.entityName} ({liveSummary.topStreak.teamAbbr}) ·{' '}
                <strong className="text-orange-400 font-mono tabular-nums">
                  {liveSummary.topStreak.count} PJ
                </strong>{' '}
                · {liveSummary.topStreak.thresholdLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Tabla Maestra Unificada de Todas las Estadísticas */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-xl p-5 space-y-4">
        {/* Table Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-orange-400 shrink-0" />
            <h3 className="text-base font-bold text-white">
              Todas las estadísticas ({filteredAndSortedRules.length} de {draft.rules.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 sm:flex-none sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
                placeholder="Buscar estadística..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0B1120] border border-[#1E293B] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Sort selector */}
            <div className="inline-flex items-center gap-1.5 bg-[#0B1120] border border-[#1E293B] rounded-lg px-2.5 py-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as TableSortMode)}
                aria-label="Ordenar estadísticas"
                className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="hits_desc" className="bg-[#0B1120]">Más rachas activas</option>
                <option value="category" className="bg-[#0B1120]">Por categoría</option>
                <option value="alpha" className="bg-[#0B1120]">Alfabético A–Z</option>
              </select>
            </div>

            {/* Toggle Collapsible Custom Restriction Drawer */}
            <button
              type="button"
              onClick={() => setShowCustomDrawer((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                showCustomDrawer
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#0B1120] border-[#1E293B] text-slate-200 hover:border-amber-500/50 hover:text-white'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Regla restrictiva personalizada</span>
              {showCustomDrawer ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Custom Restriction Drawer (Priority Override Creator) */}
        {showCustomDrawer && (
          <div className="bg-[#0B1120] border border-amber-500/35 rounded-xl p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-amber-300">
                  Crear o ajustar regla restrictiva prioritaria
                </h4>
                <p className="text-xs text-slate-400">
                  Sirve para endurecer una estadística con demasiadas rachas (añadiendo PJ mínimos,
                  minutos mínimos o intentos mínimos). Sustituye directamente a su baremo base sin duplicar filas.
                </p>
              </div>
              {customDrawerLivePreview && (
                <div className="text-xs font-mono tabular-nums text-slate-300 shrink-0">
                  {existingMatchingRule ? (
                    <span>
                      Actual:{' '}
                      <strong className="text-slate-200">
                        {liveSummary.perRuleHits.get(existingMatchingRule.id)?.count ?? 0} act.
                      </strong>{' '}
                      → Con restricción:{' '}
                      <strong className="text-amber-300">
                        {customDrawerLivePreview.count} act.
                      </strong>
                    </span>
                  ) : (
                    <span>
                      Vista previa:{' '}
                      <strong className="text-amber-300">
                        {customDrawerLivePreview.count} act.
                      </strong>
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Ámbito</label>
                <div className="grid grid-cols-2 bg-[#131C2E] border border-[#1E293B] rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => handleNewEntityTypeChange('player')}
                    className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                      newEntityType === 'player'
                        ? 'bg-orange-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Jugador
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNewEntityTypeChange('team')}
                    className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                      newEntityType === 'team'
                        ? 'bg-orange-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Equipo
                  </button>
                </div>
              </div>

              <div className="lg:col-span-4">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Estadística a restringir
                </label>
                <select
                  value={newMetricId}
                  onChange={(e) => handleNewMetricChange(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-medium bg-[#131C2E] border border-[#1E293B] rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {newEntityType === 'player'
                    ? STREAK_METRIC_GROUPS.map((grp) => (
                        <optgroup key={grp.id} label={grp.label}>
                          {STREAK_METRIC_OPTIONS.filter((m) => m.group === grp.id).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </optgroup>
                      ))
                    : TEAM_STREAK_METRIC_OPTIONS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Dirección</label>
                <div className="grid grid-cols-2 bg-[#131C2E] border border-[#1E293B] rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setNewIsPositive(true)}
                    className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                      newIsPositive
                        ? 'bg-emerald-500/25 text-emerald-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Positiva
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewIsPositive(false)}
                    className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                      !newIsPositive
                        ? 'bg-rose-500/25 text-rose-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Bache
                  </button>
                </div>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Condición</label>
                <select
                  value={newOperator}
                  onChange={(e) => setNewOperator(e.target.value as AutoStreakRuleOperator)}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-[#131C2E] border border-[#1E293B] rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="gte">≥ (Al menos)</option>
                  <option value="gt">&gt; (Mayor que)</option>
                  <option value="lte">≤ (Como máx.)</option>
                  <option value="lt">&lt; (Menor que)</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Umbral mín.</label>
                <input
                  type="number"
                  step={
                    newEntityType === 'player'
                      ? selectedNewPlayerMetric?.step ?? 1
                      : selectedNewTeamMetric?.step ?? 1
                  }
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-center font-mono text-xs font-bold tabular-nums bg-[#131C2E] border border-[#1E293B] rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  PJ mínimos
                </label>
                <input
                  type="number"
                  min={2}
                  max={25}
                  value={newMinGamesOverride}
                  onChange={(e) => setNewMinGamesOverride(e.target.value)}
                  placeholder={`Global (${draft.minStreakGames})`}
                  className="w-full px-2.5 py-1.5 font-mono text-xs tabular-nums bg-[#131C2E] border border-[#1E293B] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>

              {newEntityType === 'player' && (
                <>
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Mín. MIN / partido
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={48}
                      value={newMinMinutes}
                      onChange={(e) => setNewMinMinutes(e.target.value)}
                      placeholder="Ej. 25"
                      className="w-full px-2.5 py-1.5 font-mono text-xs tabular-nums bg-[#131C2E] border border-[#1E293B] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Mín. {getAttemptsUnitLabel(newMetricId)} / partido
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      value={newMinAttempts}
                      onChange={(e) => setNewMinAttempts(e.target.value)}
                      placeholder="Catálogo"
                      className="w-full px-2.5 py-1.5 font-mono text-xs tabular-nums bg-[#131C2E] border border-[#1E293B] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </>
              )}

              <div className={newEntityType === 'player' ? 'lg:col-span-4' : 'lg:col-span-8'}>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Nombre descriptivo (opcional)
                </label>
                <input
                  type="text"
                  value={labelTouched ? newLabel : computedNewLabel}
                  onChange={(e) => {
                    setLabelTouched(true);
                    setNewLabel(e.target.value);
                  }}
                  className="w-full px-3 py-1.5 text-xs bg-[#131C2E] border border-[#1E293B] rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="lg:col-span-2 flex items-end">
                <button
                  type="button"
                  onClick={handleApplyCustomDrawerRule}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors whitespace-nowrap"
                >
                  <span>Aplicar con prioridad</span>
                </button>
              </div>
            </div>

            {customDrawerLivePreview?.topExample && (
              <div className="text-[11px] text-slate-400">
                Mejor racha con esta restricción:{' '}
                <span className="text-emerald-300 font-medium">
                  {customDrawerLivePreview.topExample.name} ({customDrawerLivePreview.topExample.teamAbbr}) ·{' '}
                  {customDrawerLivePreview.topExample.thresholdLabel} · {customDrawerLivePreview.topExample.streak} PJ
                </span>
              </div>
            )}
          </div>
        )}

        {/* Filter Tabs (single-line segmented controls) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'active_hits', label: 'Con activas' },
            { id: 'noisy', label: `Ruidosas (>${NOISY_THRESHOLD})` },
            { id: 'custom', label: `Restringidas (${liveSummary.customRulesCount})` },
            { id: 'player', label: 'Jugador' },
            { id: 'team', label: 'Equipo' },
            ...AUTO_STREAK_CATEGORIES.filter((c) => c.id !== 'team'),
            { id: 'disabled', label: 'Apagadas' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                categoryFilter === cat.id
                  ? 'bg-orange-500 text-slate-950'
                  : 'bg-[#0B1120] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Unified High-Density Master Table */}
        <div className="border border-[#1E293B] rounded-xl overflow-hidden bg-[#0B1120]/70">
          {/* Desktop Column Header */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2.5 bg-[#0B1120] border-b border-[#1E293B] text-[11px] font-semibold text-slate-400">
            <div className="col-span-5">Estadística y mejor racha real</div>
            <div className="col-span-2 text-right">Media NBA 26-27</div>
            <div className="col-span-2 text-center">Umbral mín.</div>
            <div className="col-span-1 text-center">PJ mín.</div>
            <div className="col-span-1 text-right">Activas</div>
            <div className="col-span-1 text-right">Control</div>
          </div>

          <div className="divide-y divide-[#1E293B]">
            {filteredAndSortedRules.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  No hay estadísticas que coincidan con este filtro o búsqueda.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('all');
                    setRuleSearch('');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#131C2E] border border-[#1E293B] text-slate-200 hover:text-white"
                >
                  Mostrar todas las estadísticas
                </button>
              </div>
            ) : (
              filteredAndSortedRules.map((rule) => {
                const bounds = getRuleBounds(rule);
                const step = getRuleStep(rule);
                const hitInfo = liveSummary.perRuleHits.get(rule.id);
                const activeHits = hitInfo?.count ?? 0;
                const isNoisy = rule.enabled && activeHits > NOISY_THRESHOLD;
                const bm = nbaBenchmarks.get(`${rule.entityType}:${rule.metricId}`);
                const isExpanded = expandedRuleId === rule.id;

                return (
                  <div
                    key={rule.id}
                    className={`transition-colors ${
                      rule.enabled ? 'hover:bg-[#131C2E]/60' : 'opacity-50 bg-[#0B1120]'
                    }`}
                  >
                    <div className="px-4 py-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                      {/* Col 1-5: Toggle + Metric Name + Clean Metadata + Top Real Example */}
                      <div className="lg:col-span-5 flex items-start gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                          aria-label={rule.enabled ? 'Desactivar estadística' : 'Activar estadística'}
                          className={`mt-0.5 w-9 h-5 rounded-full transition-colors relative shrink-0 ${
                            rule.enabled ? 'bg-orange-500' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                              rule.enabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-baseline gap-2 min-w-0">
                            <span className="text-xs font-bold text-white truncate">
                              {rule.metricLabel}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate">
                              {rule.entityType === 'team' ? 'Equipo' : 'Jugador'} ·{' '}
                              <span className={rule.isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                                {rule.isPositive ? 'Positiva' : 'Bache'}
                              </span>
                              {rule.isCustom && (
                                <>
                                  {' · '}
                                  <span className="text-amber-300 font-semibold">
                                    Prioridad personalizada
                                  </span>
                                </>
                              )}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            {rule.minMinutes ? (
                              <span className="text-amber-300/90 font-mono">≥{rule.minMinutes} MIN</span>
                            ) : null}
                            {rule.minMinutes && rule.minAttempts ? <span>·</span> : null}
                            {rule.minAttempts ? (
                              <span className="text-amber-300/90 font-mono">
                                ≥{rule.minAttempts} {getAttemptsUnitLabel(rule.metricId)}
                              </span>
                            ) : null}
                            {(rule.minMinutes || rule.minAttempts) && hitInfo ? <span>·</span> : null}
                            {hitInfo ? (
                              <span className="text-slate-300 truncate">
                                Top: {hitInfo.topName} ({hitInfo.topTeam}) ·{' '}
                                <span className="text-emerald-300 font-medium">
                                  {hitInfo.topThresholdLabel}
                                </span>{' '}
                                · <span className="font-mono tabular-nums">{hitInfo.topStreak} PJ</span>
                              </span>
                            ) : (
                              <span className="text-slate-500">Sin rachas activas con esta horquilla</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Col 6-7: Real NBA 26-27 Benchmark + 1-click row calibration */}
                      <div className="lg:col-span-2 flex lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-1">
                        <span className="text-[11px] text-slate-500 lg:hidden">Media NBA 26-27:</span>
                        {!bounds.isBinary && bm ? (
                          <div className="flex flex-col items-end">
                            <span className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
                              {formatBenchmarkValue(bm.mean, rule.unit || '', step)}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                              <button
                                type="button"
                                onClick={() => applyNbaCalibrationRow(rule, 'nba_mean')}
                                className="hover:text-orange-300 transition-colors"
                                title="Igualar este umbral a la media NBA 26-27"
                              >
                                =Media
                              </button>
                              <span aria-hidden="true">·</span>
                              <button
                                type="button"
                                onClick={() => applyNbaCalibrationRow(rule, 'p75')}
                                className="hover:text-orange-300 transition-colors"
                                title="Ajustar este umbral al Percentil 75 real NBA 26-27"
                              >
                                P75 ({formatBenchmarkValue(
                                  rule.operator === 'lte' || rule.operator === 'lt' ? bm.p25 : bm.p75,
                                  rule.unit || '',
                                  step
                                )})
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">—</span>
                        )}
                      </div>

                      {/* Col 8-9: Threshold Stepper */}
                      <div className="lg:col-span-2 flex items-center justify-between lg:justify-center gap-2">
                        <span className="text-[11px] text-slate-500 lg:hidden">Umbral mín.:</span>
                        {!bounds.isBinary ? (
                          <div className="inline-flex items-center gap-1 bg-[#131C2E] border border-[#1E293B] rounded-lg p-0.5">
                            <span className="text-[11px] font-mono font-bold text-slate-400 pl-1.5 pr-0.5">
                              {formatRuleOperatorSymbol(rule.operator)}
                            </span>
                            <button
                              type="button"
                              onClick={() => stepRuleThreshold(rule, -1)}
                              className="w-6 h-6 rounded bg-[#0B1120] hover:bg-[#1E293B] text-slate-200 flex items-center justify-center transition-colors"
                              aria-label="Reducir umbral"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              step={step}
                              min={bounds.min}
                              max={bounds.max}
                              value={rule.threshold}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                if (Number.isFinite(n)) {
                                  updateRule(rule.id, { threshold: n });
                                }
                              }}
                              className="w-14 text-center font-mono text-xs font-bold tabular-nums bg-[#0B1120] border border-[#1E293B] rounded py-0.5 text-white focus:outline-none focus:border-orange-500"
                            />
                            <button
                              type="button"
                              onClick={() => stepRuleThreshold(rule, 1)}
                              className="w-6 h-6 rounded bg-[#0B1120] hover:bg-[#1E293B] text-slate-200 flex items-center justify-center transition-colors"
                              aria-label="Subir umbral"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-400">Hito exacto</span>
                        )}
                      </div>

                      {/* Col 10: Per-stat PJ minimum */}
                      <div className="lg:col-span-1 flex items-center justify-between lg:justify-center gap-1">
                        <span className="text-[11px] text-slate-500 lg:hidden">PJ mínimos:</span>
                        <div className="inline-flex items-center gap-0.5">
                          <input
                            type="number"
                            min={2}
                            max={25}
                            value={rule.minGamesOverride ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              if (!raw) {
                                updateRule(rule.id, { minGamesOverride: null });
                              } else {
                                const n = Math.max(2, Math.min(25, Math.round(Number(raw))));
                                if (Number.isFinite(n)) {
                                  updateRule(rule.id, { minGamesOverride: n });
                                }
                              }
                            }}
                            placeholder={`${draft.minStreakGames}`}
                            title={`Partidos consecutivos mínimos (vacío = global ${draft.minStreakGames} PJ)`}
                            className={`w-12 px-1.5 py-1 text-center font-mono text-xs tabular-nums rounded-lg border focus:outline-none focus:border-orange-500 ${
                              rule.minGamesOverride !== null
                                ? 'bg-sky-500/10 border-sky-500/40 text-sky-200 font-bold'
                                : 'bg-[#131C2E] border-[#1E293B] text-white placeholder:text-slate-500'
                            }`}
                          />
                          {rule.minGamesOverride !== null && (
                            <button
                              type="button"
                              onClick={() => updateRule(rule.id, { minGamesOverride: null })}
                              className="p-0.5 text-slate-500 hover:text-slate-200"
                              title={`Volver al global (${draft.minStreakGames} PJ)`}
                              aria-label="Restaurar PJ global"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Col 11: Live Active Streaks Count */}
                      <div className="lg:col-span-1 flex items-center justify-between lg:justify-end">
                        <span className="text-[11px] text-slate-500 lg:hidden">Rachas activas:</span>
                        <div className="text-right font-mono tabular-nums">
                          <div
                            className={`text-sm font-extrabold leading-tight ${
                              !rule.enabled
                                ? 'text-slate-500'
                                : isNoisy
                                  ? 'text-amber-300'
                                  : activeHits > 0
                                    ? 'text-emerald-300'
                                    : 'text-slate-500'
                            }`}
                          >
                            {activeHits}
                          </div>
                          {isNoisy && (
                            <div className="text-[10px] font-sans font-semibold text-amber-400">
                              Alto
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Col 12: Inline Restriction Trigger */}
                      <div className="lg:col-span-1 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => openInlineRestriction(rule)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                            isExpanded
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : rule.isCustom
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                                : isNoisy
                                  ? 'bg-[#131C2E] border-amber-500/45 text-amber-300 hover:bg-amber-500/15'
                                  : 'bg-[#131C2E] border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600'
                          }`}
                        >
                          {rule.isCustom ? 'Editar' : 'Restringir'}
                        </button>
                      </div>
                    </div>

                    {/* Inline Priority Restriction Editor */}
                    {isExpanded && inlineDraft && (
                      <div className="px-4 py-3.5 bg-[#090F1D] border-t border-amber-500/30 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-amber-300">
                            Restricción prioritaria para {rule.metricLabel}
                          </div>
                          {inlinePreview && (
                            <div className="text-xs font-mono tabular-nums text-slate-300">
                              Actual: <strong className="text-slate-200">{activeHits} act.</strong> → Con esta restricción:{' '}
                              <strong className={inlinePreview.count <= NOISY_THRESHOLD ? 'text-emerald-300' : 'text-amber-300'}>
                                {inlinePreview.count} act.
                              </strong>
                              {inlinePreview.topExample && (
                                <span className="font-sans text-slate-400 ml-2 hidden sm:inline">
                                  (Top: {inlinePreview.topExample.name} · {inlinePreview.topExample.thresholdLabel} · {inlinePreview.topExample.streak} PJ)
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 items-end">
                          {!bounds.isBinary && (
                            <>
                              <div>
                                <label className="block text-[11px] text-slate-400 mb-1">Condición</label>
                                <select
                                  value={inlineDraft.operator}
                                  onChange={(e) =>
                                    setInlineDraft({
                                      ...inlineDraft,
                                      operator: e.target.value as AutoStreakRuleOperator,
                                    })
                                  }
                                  className="w-full px-2 py-1.5 text-xs bg-[#131C2E] border border-[#1E293B] rounded-lg text-white focus:outline-none focus:border-orange-500"
                                >
                                  <option value="gte">≥ (Al menos)</option>
                                  <option value="gt">&gt; (Mayor que)</option>
                                  <option value="lte">≤ (Como máx.)</option>
                                  <option value="lt">&lt; (Menor que)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] text-slate-400 mb-1">Umbral mín.</label>
                                <input
                                  type="number"
                                  step={step}
                                  min={bounds.min}
                                  max={bounds.max}
                                  value={inlineDraft.threshold}
                                  onChange={(e) =>
                                    setInlineDraft({
                                      ...inlineDraft,
                                      threshold: Number(e.target.value),
                                    })
                                  }
                                  className="w-full px-2 py-1.5 text-center font-mono text-xs font-bold tabular-nums bg-[#131C2E] border border-[#1E293B] rounded-lg text-white focus:outline-none focus:border-orange-500"
                                />
                              </div>
                            </>
                          )}

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">PJ mínimos</label>
                            <input
                              type="number"
                              min={2}
                              max={25}
                              value={inlineDraft.minGamesOverride}
                              onChange={(e) =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  minGamesOverride: e.target.value,
                                })
                              }
                              placeholder={`Global (${draft.minStreakGames})`}
                              className="w-full px-2 py-1.5 font-mono text-xs tabular-nums bg-[#131C2E] border border-[#1E293B] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                            />
                          </div>

                          {rule.entityType === 'player' && (
                            <>
                              <div>
                                <label className="block text-[11px] text-slate-400 mb-1">Mín. MIN</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={48}
                                  value={inlineDraft.minMinutes}
                                  onChange={(e) =>
                                    setInlineDraft({
                                      ...inlineDraft,
                                      minMinutes: e.target.value,
                                    })
                                  }
                                  placeholder="Sin mín."
                                  className="w-full px-2 py-1.5 font-mono text-xs tabular-nums bg-[#131C2E] border border-[#1E293B] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-slate-400 mb-1">
                                  Mín. {getAttemptsUnitLabel(rule.metricId)}
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={40}
                                  value={inlineDraft.minAttempts}
                                  onChange={(e) =>
                                    setInlineDraft({
                                      ...inlineDraft,
                                      minAttempts: e.target.value,
                                    })
                                  }
                                  placeholder="Catálogo"
                                  className="w-full px-2 py-1.5 font-mono text-xs tabular-nums bg-[#131C2E] border border-[#1E293B] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                                />
                              </div>
                            </>
                          )}

                          <div className="flex items-center justify-end gap-1.5 col-span-2 sm:col-span-1">
                            <button
                              type="button"
                              onClick={applyInlineRestriction}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors whitespace-nowrap"
                            >
                              Aplicar
                            </button>
                            {rule.isCustom && (
                              <button
                                type="button"
                                onClick={() => resetRuleToStandardBase(rule)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#131C2E] border border-[#1E293B] text-slate-300 hover:text-white transition-colors whitespace-nowrap"
                                title="Quitar restricción personalizada y volver al mínimo base estándar"
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminStreaksConfigPanel;
