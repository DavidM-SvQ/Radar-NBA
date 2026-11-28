import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type {
  ExperienceMetricsConfig,
  ExperienceMode,
} from '../types/nba';
import {
  DEFAULT_EXPERIENCE_METRICS_CONFIG,
  buildSimpleMetricIdSet,
  isMetricAllowedInExperienceMode,
} from '../utils/experienceMetricsCatalog';

interface ExperienceMetricsContextValue {
  experienceMode: ExperienceMode;
  config: ExperienceMetricsConfig;
  simpleMetricIdSet: ReadonlySet<string>;
  /** Returns true if the given metric key/alias is allowed in the active mode ('advanced' always returns true) */
  isMetricAllowed: (rawMetricKey: string | null | undefined) => boolean;
  /** Checks specifically whether a metric belongs to Modo Sencillo regardless of current mode */
  isSimpleMetric: (rawMetricKey: string | null | undefined) => boolean;
}

const DEFAULT_SET = buildSimpleMetricIdSet(DEFAULT_EXPERIENCE_METRICS_CONFIG);

const ExperienceMetricsContext = createContext<ExperienceMetricsContextValue>({
  experienceMode: 'simple',
  config: DEFAULT_EXPERIENCE_METRICS_CONFIG,
  simpleMetricIdSet: DEFAULT_SET,
  isMetricAllowed: (rawKey) =>
    isMetricAllowedInExperienceMode(rawKey, 'simple', DEFAULT_SET),
  isSimpleMetric: (rawKey) =>
    isMetricAllowedInExperienceMode(rawKey, 'simple', DEFAULT_SET),
});

export function ExperienceMetricsProvider({
  experienceMode,
  config,
  children,
}: {
  experienceMode: ExperienceMode;
  config: ExperienceMetricsConfig;
  children: ReactNode;
}) {
  const simpleMetricIdSet = useMemo(
    () => buildSimpleMetricIdSet(config),
    [config]
  );

  const isMetricAllowed = useCallback(
    (rawMetricKey: string | null | undefined) =>
      isMetricAllowedInExperienceMode(
        rawMetricKey,
        experienceMode,
        simpleMetricIdSet
      ),
    [experienceMode, simpleMetricIdSet]
  );

  const isSimpleMetric = useCallback(
    (rawMetricKey: string | null | undefined) =>
      isMetricAllowedInExperienceMode(rawMetricKey, 'simple', simpleMetricIdSet),
    [simpleMetricIdSet]
  );

  const value = useMemo<ExperienceMetricsContextValue>(
    () => ({
      experienceMode,
      config,
      simpleMetricIdSet,
      isMetricAllowed,
      isSimpleMetric,
    }),
    [experienceMode, config, simpleMetricIdSet, isMetricAllowed, isSimpleMetric]
  );

  return (
    <ExperienceMetricsContext.Provider value={value}>
      {children}
    </ExperienceMetricsContext.Provider>
  );
}

export function useExperienceMetrics(): ExperienceMetricsContextValue {
  return useContext(ExperienceMetricsContext);
}
