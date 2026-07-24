import {
  MotionPointSmoother,
  type SmoothingAlgorithm,
  type SmoothingSample,
} from "./smoothing";

export const SMOOTHING_BENCHMARK_SUITE_VERSION =
  "normalized-point-smoothing-synthetic/v1";

export interface SmoothingTruthPoint {
  x: number;
  y: number;
}

export interface SmoothingBenchmarkFrame {
  timestampMs: number;
  truth: SmoothingTruthPoint;
  input: SmoothingSample;
}

export interface SmoothingBenchmarkScenario {
  id: "static-jitter" | "step" | "ramp" | "reversal" | "dropout";
  description: string;
  framesPerSecond: 60;
  frames: SmoothingBenchmarkFrame[];
}

export interface SmoothingEvaluation {
  overallRmsError: number;
  static: {
    rmsError: number;
    p95AbsoluteError: number;
    outputDeltaRms: number;
  };
  step: {
    rmsError: number;
    response90Milliseconds: number | null;
    overshoot: number;
  };
  ramp: {
    rmsError: number;
    meanSignedXError: number;
  };
  reversal: {
    rmsError: number;
    maximumAbsoluteError: number;
  };
  dropout: {
    rmsError: number;
    missingOutputCount: number;
    reacquisitionAbsoluteError: number;
    postReacquisitionRmsError: number;
  };
}

const FRAME_INTERVAL_MS = 1000 / 60;

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function noise(frame: number, phase: number, amplitude: number): number {
  return (
    amplitude *
    (0.55 * Math.sin(frame * 1.71 + phase) +
      0.3 * Math.sin(frame * 0.47 + phase * 1.9) +
      0.15 * Math.cos(frame * 2.43 - phase))
  );
}

function observedFrame(
  frame: number,
  truth: SmoothingTruthPoint,
  amplitude: number,
): SmoothingBenchmarkFrame {
  return {
    timestampMs: rounded(frame * FRAME_INTERVAL_MS),
    truth,
    input: {
      timestampMs: rounded(frame * FRAME_INTERVAL_MS),
      observed: true,
      x: Math.min(1, Math.max(0, truth.x + noise(frame, 0.3, amplitude))),
      y: Math.min(1, Math.max(0, truth.y + noise(frame, 1.7, amplitude))),
    },
  };
}

function staticScenario(): SmoothingBenchmarkScenario {
  return {
    id: "static-jitter",
    description: "Stationary normalized point with deterministic mixed-frequency noise.",
    framesPerSecond: 60,
    frames: Array.from({ length: 300 }, (_, frame) =>
      observedFrame(frame, { x: 0.5, y: 0.5 }, 0.014),
    ),
  };
}

function stepScenario(): SmoothingBenchmarkScenario {
  return {
    id: "step",
    description: "Abrupt horizontal step from x=0.3 to x=0.7 at frame 60.",
    framesPerSecond: 60,
    frames: Array.from({ length: 180 }, (_, frame) =>
      observedFrame(
        frame,
        { x: frame < 60 ? 0.3 : 0.7, y: 0.5 },
        0.002,
      ),
    ),
  };
}

function rampScenario(): SmoothingBenchmarkScenario {
  return {
    id: "ramp",
    description: "Constant-speed horizontal ramp from x=0.2 to x=0.8.",
    framesPerSecond: 60,
    frames: Array.from({ length: 240 }, (_, frame) =>
      observedFrame(
        frame,
        { x: 0.2 + (0.6 * frame) / 239, y: 0.5 },
        0.004,
      ),
    ),
  };
}

function reversalScenario(): SmoothingBenchmarkScenario {
  return {
    id: "reversal",
    description: "Horizontal triangle wave with an abrupt direction reversal.",
    framesPerSecond: 60,
    frames: Array.from({ length: 240 }, (_, frame) => {
      const progress = frame <= 119 ? frame / 119 : (239 - frame) / 120;
      return observedFrame(
        frame,
        { x: 0.2 + 0.6 * progress, y: 0.5 },
        0.004,
      );
    }),
  };
}

function dropoutScenario(): SmoothingBenchmarkScenario {
  return {
    id: "dropout",
    description:
      "Constant-speed horizontal motion with eight consecutive missing observations.",
    framesPerSecond: 60,
    frames: Array.from({ length: 180 }, (_, frame) => {
      const truth = { x: 0.2 + (0.6 * frame) / 179, y: 0.5 };
      if (frame >= 80 && frame <= 87) {
        return {
          timestampMs: rounded(frame * FRAME_INTERVAL_MS),
          truth,
          input: {
            timestampMs: rounded(frame * FRAME_INTERVAL_MS),
            observed: false,
          },
        };
      }
      return observedFrame(frame, truth, 0.004);
    }),
  };
}

export function generateSmoothingBenchmarkSuite(): SmoothingBenchmarkScenario[] {
  return [
    staticScenario(),
    stepScenario(),
    rampScenario(),
    reversalScenario(),
    dropoutScenario(),
  ];
}

function rootMeanSquare(values: readonly number[]): number {
  return Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0) / values.length,
  );
}

function pointError(
  output: Extract<SmoothingSample, { observed: true }>,
  truth: SmoothingTruthPoint,
): number {
  return Math.hypot(output.x - truth.x, output.y - truth.y);
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function runScenario(
  algorithm: SmoothingAlgorithm,
  scenario: SmoothingBenchmarkScenario,
): SmoothingSample[] {
  const smoother = new MotionPointSmoother({ algorithm });
  return scenario.frames.map(({ input }) => smoother.update({ ...input }));
}

function requireScenario(
  suite: readonly SmoothingBenchmarkScenario[],
  id: SmoothingBenchmarkScenario["id"],
): SmoothingBenchmarkScenario {
  const scenario = suite.find((candidate) => candidate.id === id);
  if (scenario === undefined) throw new Error(`missing scenario ${id}`);
  return scenario;
}

function observedErrors(
  scenario: SmoothingBenchmarkScenario,
  outputs: readonly SmoothingSample[],
): number[] {
  return outputs.flatMap((output, index) =>
    output.observed ? [pointError(output, scenario.frames[index]!.truth)] : [],
  );
}

export function evaluateSmoothingAlgorithm(
  algorithm: SmoothingAlgorithm,
  suite = generateSmoothingBenchmarkSuite(),
): SmoothingEvaluation {
  const staticCase = requireScenario(suite, "static-jitter");
  const stepCase = requireScenario(suite, "step");
  const rampCase = requireScenario(suite, "ramp");
  const reversalCase = requireScenario(suite, "reversal");
  const dropoutCase = requireScenario(suite, "dropout");
  const staticOutputs = runScenario(algorithm, staticCase);
  const stepOutputs = runScenario(algorithm, stepCase);
  const rampOutputs = runScenario(algorithm, rampCase);
  const reversalOutputs = runScenario(algorithm, reversalCase);
  const dropoutOutputs = runScenario(algorithm, dropoutCase);

  const staticErrors = observedErrors(staticCase, staticOutputs);
  const staticDeltas = staticOutputs.slice(1).flatMap((output, index) => {
    const previous = staticOutputs[index]!;
    return output.observed && previous.observed
      ? [Math.hypot(output.x - previous.x, output.y - previous.y)]
      : [];
  });
  const stepErrors = observedErrors(stepCase, stepOutputs);
  const stepStart = 60;
  const stepTarget90 = 0.66;
  const stepResponseIndex = stepOutputs.findIndex(
    (output, index) =>
      index >= stepStart && output.observed && output.x >= stepTarget90,
  );
  const stepXs = stepOutputs.slice(stepStart).flatMap((output) =>
    output.observed ? [output.x] : [],
  );
  const rampErrors = observedErrors(rampCase, rampOutputs);
  const rampSignedXErrors = rampOutputs.flatMap((output, index) =>
    output.observed
      ? [output.x - rampCase.frames[index]!.truth.x]
      : [],
  );
  const reversalErrors = observedErrors(reversalCase, reversalOutputs);
  const dropoutErrors = observedErrors(dropoutCase, dropoutOutputs);
  const reacquisitionIndex = 88;
  const reacquisition = dropoutOutputs[reacquisitionIndex]!;
  if (!reacquisition.observed) {
    throw new Error("dropout scenario must reacquire an observed output");
  }
  const postReacquisitionErrors = dropoutOutputs
    .slice(reacquisitionIndex, reacquisitionIndex + 12)
    .map((output, offset) => {
      if (!output.observed) {
        throw new Error("post-reacquisition window must be fully observed");
      }
      return pointError(
        output,
        dropoutCase.frames[reacquisitionIndex + offset]!.truth,
      );
    });
  const allErrors = [
    ...staticErrors,
    ...stepErrors,
    ...rampErrors,
    ...reversalErrors,
    ...dropoutErrors,
  ];

  return {
    overallRmsError: rounded(rootMeanSquare(allErrors)),
    static: {
      rmsError: rounded(rootMeanSquare(staticErrors)),
      p95AbsoluteError: rounded(percentile(staticErrors, 0.95)),
      outputDeltaRms: rounded(rootMeanSquare(staticDeltas)),
    },
    step: {
      rmsError: rounded(rootMeanSquare(stepErrors)),
      response90Milliseconds:
        stepResponseIndex === -1
          ? null
          : rounded(
              stepCase.frames[stepResponseIndex]!.timestampMs -
                stepCase.frames[stepStart]!.timestampMs,
            ),
      overshoot: rounded(Math.max(0, Math.max(...stepXs) - 0.7)),
    },
    ramp: {
      rmsError: rounded(rootMeanSquare(rampErrors)),
      meanSignedXError: rounded(
        rampSignedXErrors.reduce((sum, value) => sum + value, 0) /
          rampSignedXErrors.length,
      ),
    },
    reversal: {
      rmsError: rounded(rootMeanSquare(reversalErrors)),
      maximumAbsoluteError: rounded(Math.max(...reversalErrors)),
    },
    dropout: {
      rmsError: rounded(rootMeanSquare(dropoutErrors)),
      missingOutputCount: dropoutOutputs.filter((output) => !output.observed)
        .length,
      reacquisitionAbsoluteError: rounded(
        pointError(reacquisition, dropoutCase.frames[reacquisitionIndex]!.truth),
      ),
      postReacquisitionRmsError: rounded(
        rootMeanSquare(postReacquisitionErrors),
      ),
    },
  };
}
