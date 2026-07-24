import {
  ObservationConfidenceGate,
  type ObservationConfidenceReason,
  type ObservationConfidenceSample,
} from "./observation-confidence";

export const OBSERVATION_CONFIDENCE_BENCHMARK_VERSION =
  "synthetic-confidence-degradation/v1" as const;

export const OBSERVATION_CONFIDENCE_STRATEGIES = [
  "memoryless-release-threshold",
  "fail-closed-confidence-rearm",
] as const;

export type ObservationConfidenceStrategy =
  (typeof OBSERVATION_CONFIDENCE_STRATEGIES)[number];

export interface ObservationConfidenceTruthSample
  extends ObservationConfidenceSample {
  expectedObserved: boolean;
}

export interface ObservationConfidenceScenario {
  id: string;
  description: string;
  samples: ObservationConfidenceTruthSample[];
}

export interface ObservationConfidenceScenarioResult {
  id: string;
  samples: number;
  exact: number;
  unsafeAvailable: number;
  falseUnavailable: number;
  transitions: number;
  predictions: boolean[];
  reasons: ObservationConfidenceReason[];
}

export interface ObservationConfidenceEvaluation {
  strategy: ObservationConfidenceStrategy;
  scenarios: ObservationConfidenceScenarioResult[];
  totals: {
    samples: number;
    exact: number;
    unsafeAvailable: number;
    falseUnavailable: number;
    transitions: number;
    accuracy: number;
  };
}

interface ScenarioPoint {
  confidence: number;
  providerObserved?: boolean;
  expectedObserved: boolean;
}

function scenario(
  id: string,
  description: string,
  points: readonly ScenarioPoint[],
): ObservationConfidenceScenario {
  return {
    id,
    description,
    samples: points.map((point, index) => ({
      timestampMs: index * 16,
      providerObserved: point.providerObserved ?? true,
      confidence: point.confidence,
      expectedObserved: point.expectedObserved,
    })),
  };
}

function repeat(
  count: number,
  point: ScenarioPoint,
): ScenarioPoint[] {
  return Array.from({ length: count }, () => ({ ...point }));
}

export function generateObservationConfidenceBenchmarkSuite():
  ObservationConfidenceScenario[] {
  const visibleHigh = { confidence: 0.9, expectedObserved: true };
  const hiddenLow = { confidence: 0.2, expectedObserved: false };
  return [
    scenario(
      "stable-high",
      "A continuously visible landmark remains available after bounded startup rearming.",
      repeat(12, visibleHigh),
    ),
    scenario(
      "stable-low",
      "A continuously low-confidence landmark never becomes available.",
      repeat(12, hiddenLow),
    ),
    scenario(
      "visible-threshold-jitter",
      "A visible landmark jitters across release and acquire thresholds.",
      [
        ...repeat(3, visibleHigh),
        { confidence: 0.49, expectedObserved: true },
        { confidence: 0.76, expectedObserved: true },
        { confidence: 0.74, expectedObserved: true },
        { confidence: 0.8, expectedObserved: true },
        { confidence: 0.78, expectedObserved: true },
        { confidence: 0.79, expectedObserved: true },
        { confidence: 0.48, expectedObserved: true },
        ...repeat(2, visibleHigh),
      ],
    ),
    scenario(
      "occluded-medium-rebound",
      "After an occlusion collapse, medium-confidence occluder output must not immediately regain availability.",
      [
        ...repeat(3, visibleHigh),
        hiddenLow,
        ...repeat(5, {
          confidence: 0.6,
          expectedObserved: false,
        }),
        ...repeat(3, visibleHigh),
      ],
    ),
    scenario(
      "provider-loss-high-score",
      "An explicit provider-unobserved signal blocks even when its numeric score remains high.",
      [
        ...repeat(3, visibleHigh),
        ...repeat(4, {
          confidence: 0.95,
          providerObserved: false,
          expectedObserved: false,
        }),
        ...repeat(3, visibleHigh),
      ],
    ),
    scenario(
      "single-low-blip",
      "One true low-confidence loss blocks immediately and requires a fresh rearm.",
      [
        ...repeat(3, visibleHigh),
        hiddenLow,
        ...repeat(4, visibleHigh),
      ],
    ),
    scenario(
      "sustained-loss-recovery",
      "Sustained low confidence blocks until three high-confidence recovery samples.",
      [
        ...repeat(3, visibleHigh),
        ...repeat(4, hiddenLow),
        ...repeat(5, visibleHigh),
      ],
    ),
    scenario(
      "ambiguous-alternation",
      "Alternating boundary confidence after loss remains unavailable instead of chattering.",
      [
        hiddenLow,
        ...Array.from({ length: 10 }, (_, index) => ({
          confidence: index % 2 === 0 ? 0.55 : 0.45,
          expectedObserved: false,
        })),
        ...repeat(3, visibleHigh),
      ],
    ),
    scenario(
      "retain-band-visible",
      "An already acquired visible landmark remains available in the confidence retain band.",
      [
        ...repeat(3, visibleHigh),
        ...repeat(8, {
          confidence: 0.6,
          expectedObserved: true,
        }),
      ],
    ),
    scenario(
      "provider-flag-oscillation",
      "Alternating provider observed flags never accumulate enough evidence to rearm.",
      [
        hiddenLow,
        ...Array.from({ length: 8 }, (_, index) => ({
          confidence: 0.9,
          providerObserved: index % 2 === 0,
          expectedObserved: false,
        })),
        ...repeat(3, visibleHigh),
      ],
    ),
  ];
}

function evaluateScenario(
  strategy: ObservationConfidenceStrategy,
  value: ObservationConfidenceScenario,
): ObservationConfidenceScenarioResult {
  const gate =
    strategy === "fail-closed-confidence-rearm"
      ? new ObservationConfidenceGate()
      : undefined;
  const predictions: boolean[] = [];
  const reasons: ObservationConfidenceReason[] = [];
  for (const sample of value.samples) {
    if (gate) {
      const update = gate.update({
        timestampMs: sample.timestampMs,
        providerObserved: sample.providerObserved,
        confidence: sample.confidence,
      });
      predictions.push(update.observed);
      reasons.push(update.reason);
    } else {
      const observed =
        sample.providerObserved && sample.confidence >= 0.5;
      predictions.push(observed);
      reasons.push(
        observed
          ? "observed"
          : sample.providerObserved
            ? "blocked-confidence"
            : "blocked-provider",
      );
    }
  }
  const exact = predictions.filter(
    (prediction, index) =>
      prediction === value.samples[index]!.expectedObserved,
  ).length;
  const unsafeAvailable = predictions.filter(
    (prediction, index) =>
      prediction && !value.samples[index]!.expectedObserved,
  ).length;
  const falseUnavailable = predictions.filter(
    (prediction, index) =>
      !prediction && value.samples[index]!.expectedObserved,
  ).length;
  const transitions = predictions.slice(1).filter(
    (prediction, index) => prediction !== predictions[index],
  ).length;
  return {
    id: value.id,
    samples: value.samples.length,
    exact,
    unsafeAvailable,
    falseUnavailable,
    transitions,
    predictions,
    reasons,
  };
}

export function evaluateObservationConfidenceStrategy(
  strategy: ObservationConfidenceStrategy,
  suite = generateObservationConfidenceBenchmarkSuite(),
): ObservationConfidenceEvaluation {
  if (
    !(OBSERVATION_CONFIDENCE_STRATEGIES as readonly string[]).includes(
      strategy,
    )
  ) {
    throw new Error(`unknown observation confidence strategy ${String(strategy)}`);
  }
  const scenarios = suite.map((value) =>
    evaluateScenario(strategy, value),
  );
  const totals = scenarios.reduce(
    (total, result) => ({
      samples: total.samples + result.samples,
      exact: total.exact + result.exact,
      unsafeAvailable:
        total.unsafeAvailable + result.unsafeAvailable,
      falseUnavailable:
        total.falseUnavailable + result.falseUnavailable,
      transitions: total.transitions + result.transitions,
      accuracy: 0,
    }),
    {
      samples: 0,
      exact: 0,
      unsafeAvailable: 0,
      falseUnavailable: 0,
      transitions: 0,
      accuracy: 0,
    },
  );
  totals.accuracy =
    Math.round((totals.exact / totals.samples) * 1_000_000) / 1_000_000;
  return { strategy, scenarios, totals };
}
