import { z } from "zod";
import { actionBelongsToProfile } from "./actions";
import {
  MOTION_API_SCHEMA_VERSION,
  MotionActionNameSchema,
  type MotionAction,
} from "./schema";

export const MOTION_BENCHMARK_MOVEMENTS = [
  "rest",
  "stand",
  "join",
  "squat",
  "jump",
  "punch_left",
  "punch_right",
  "step_left",
  "step_right",
  "cross_arms",
  "occlude",
  "exit_frame",
  "reenter_frame",
] as const;

export const MOTION_BENCHMARK_TRANSITIONS = [
  "freeze",
  "silent-recovery",
  "show-recovery",
  "recovery-resumed",
] as const;

const IdentifierSchema = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/).max(80);
const TimingWindowSchema = z
  .object({
    earliestMs: z.number().finite().nonnegative(),
    latestMs: z.number().finite().nonnegative(),
  })
  .strict()
  .refine((window) => window.latestMs >= window.earliestMs, {
    message: "latestMs must be greater than or equal to earliestMs",
  });

const BenchmarkExpectationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("trigger"),
      action: MotionActionNameSchema,
      window: TimingWindowSchema,
    })
    .strict(),
  z.object({ kind: z.literal("no-trigger") }).strict(),
  z.object({ kind: z.literal("landmark-only") }).strict(),
  z
    .object({
      kind: z.literal("session-transition"),
      transition: z.enum(MOTION_BENCHMARK_TRANSITIONS),
      window: TimingWindowSchema,
    })
    .strict(),
]);

export const MotionBenchmarkTrialSchema = z
  .object({
    id: IdentifierSchema,
    movement: z.enum(MOTION_BENCHMARK_MOVEMENTS),
    context: z.enum(["shell", "game", "overlay", "session"]),
    repetitions: z.number().int().min(1).max(100),
    durationMs: z.number().int().min(100).max(60_000),
    instruction: z.string().min(1).max(500),
    expectation: BenchmarkExpectationSchema,
  })
  .strict()
  .superRefine((trial, context) => {
    const window =
      trial.expectation.kind === "trigger" ||
      trial.expectation.kind === "session-transition"
        ? trial.expectation.window
        : undefined;
    if (window && window.latestMs > trial.durationMs) {
      context.addIssue({
        code: "custom",
        path: ["expectation", "window", "latestMs"],
        message: "expectation window must fit inside trial duration",
      });
    }
    if (trial.expectation.kind === "session-transition" && trial.context !== "session") {
      context.addIssue({
        code: "custom",
        path: ["context"],
        message: "session transitions require session context",
      });
    }
    if (trial.expectation.kind !== "session-transition" && trial.context === "session") {
      context.addIssue({
        code: "custom",
        path: ["expectation"],
        message: "session context requires a session-transition expectation",
      });
    }
    if (trial.expectation.kind !== "trigger") return;
    const action = trial.expectation.action;
    const valid =
      (trial.context === "game" &&
        (actionBelongsToProfile(action, "actions.obstacle.v1") || action === "pause")) ||
      ((trial.context === "shell" || trial.context === "overlay") &&
        actionBelongsToProfile(action, "actions.shell.v1") &&
        action !== "pause");
    if (!valid) {
      context.addIssue({
        code: "custom",
        path: ["expectation", "action"],
        message: `action ${action} is not valid in ${trial.context} context`,
      });
    }
  });

export const MotionBenchmarkPlanSchema = z
  .object({
    format: z.literal("vcg-motion-benchmark-plan"),
    formatVersion: z.literal(1),
    protocolId: IdentifierSchema,
    createdAt: z.string().datetime(),
    motionApiSchemaVersion: z.literal(MOTION_API_SCHEMA_VERSION),
    containsRawFrames: z.literal(false),
    rawVideoDefault: z.literal(false),
    trials: z.array(MotionBenchmarkTrialSchema).min(1).max(100),
  })
  .strict()
  .superRefine((plan, context) => {
    const ids = new Set<string>();
    plan.trials.forEach((trial, index) => {
      if (ids.has(trial.id)) {
        context.addIssue({
          code: "custom",
          path: ["trials", index, "id"],
          message: "trial IDs must be unique",
        });
      }
      ids.add(trial.id);
    });
  });

const ObservedTriggerSchema = z
  .object({
    action: MotionActionNameSchema,
    atMs: z.number().finite().nonnegative(),
  })
  .strict();

const ObservedTransitionSchema = z
  .object({
    transition: z.enum(MOTION_BENCHMARK_TRANSITIONS),
    atMs: z.number().finite().nonnegative(),
  })
  .strict();

const MotionBenchmarkAttemptSchema = z
  .object({
    trialId: IdentifierSchema,
    repetition: z.number().int().min(1).max(100),
    completed: z.boolean(),
    observedTriggers: z.array(ObservedTriggerSchema).max(64),
    observedTransitions: z.array(ObservedTransitionSchema).max(16),
  })
  .strict()
  .superRefine((attempt, context) => {
    for (const [field, observations] of [
      ["observedTriggers", attempt.observedTriggers],
      ["observedTransitions", attempt.observedTransitions],
    ] as const) {
      for (let index = 1; index < observations.length; index += 1) {
        if (observations[index]!.atMs < observations[index - 1]!.atMs) {
          context.addIssue({
            code: "custom",
            path: [field, index, "atMs"],
            message: "observations must be ordered by atMs",
          });
        }
      }
    }
  });

export const MotionBenchmarkResultSchema = z
  .object({
    format: z.literal("vcg-motion-benchmark-result"),
    formatVersion: z.literal(1),
    protocolId: IdentifierSchema,
    runId: IdentifierSchema,
    createdAt: z.string().datetime(),
    containsRawFrames: z.literal(false),
    traceSha256: z.string().regex(/^[0-9a-f]{64}$/),
    timestampQuality: z.enum(["camera-exposure", "capture-arrival", "replay"]),
    configurationId: IdentifierSchema,
    placementId: IdentifierSchema,
    personaClass: z.enum([
      "school-age-child-standing",
      "adult-standing",
      "exploratory-other",
    ]),
    concurrentWorkload: z.string().min(1).max(200),
    attempts: z.array(MotionBenchmarkAttemptSchema).max(10_000),
  })
  .strict()
  .superRefine((result, context) => {
    const keys = new Set<string>();
    result.attempts.forEach((attempt, index) => {
      const key = `${attempt.trialId}:${attempt.repetition}`;
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["attempts", index],
          message: "trial repetition results must be unique",
        });
      }
      keys.add(key);
    });
  });

export interface MotionBenchmarkScore {
  complete: boolean;
  expectedAttempts: number;
  completedAttempts: number;
  invalidAttempts: number;
  truePositiveTriggers: number;
  falsePositiveTriggers: number;
  falseNegativeTriggers: number;
  triggerPrecision: number | null;
  triggerRecall: number | null;
  expectedTransitions: number;
  correctTransitions: number;
  falsePositiveTransitions: number;
  falseNegativeTransitions: number;
  transitionPrecision: number | null;
  transitionRecall: number | null;
}

export type MotionBenchmarkPlan = z.infer<typeof MotionBenchmarkPlanSchema>;
export type MotionBenchmarkResult = z.infer<typeof MotionBenchmarkResultSchema>;
export const motionBenchmarkPlanJsonSchema = z.toJSONSchema(
  MotionBenchmarkPlanSchema,
  { target: "draft-2020-12" },
) as Record<string, unknown>;
export const motionBenchmarkResultJsonSchema = z.toJSONSchema(
  MotionBenchmarkResultSchema,
  { target: "draft-2020-12" },
) as Record<string, unknown>;

export function requireHouseholdBenchmarkCoverage(value: unknown): MotionBenchmarkPlan {
  const plan = MotionBenchmarkPlanSchema.parse(value);
  const movements = new Set(plan.trials.map((trial) => trial.movement));
  const missing = MOTION_BENCHMARK_MOVEMENTS.filter((movement) => !movements.has(movement));
  if (missing.length > 0) {
    throw new Error(`Household benchmark is missing movements: ${missing.join(", ")}`);
  }
  const requiredScenarios = [
    "rest:shell:no-trigger",
    "stand:game:no-trigger",
    "join:shell:trigger:player_join",
    "squat:game:trigger:duck",
    "jump:game:trigger:jump",
    "punch_left:game:landmark-only",
    "punch_right:game:landmark-only",
    "step_left:game:trigger:dodge_left",
    "step_right:game:trigger:dodge_right",
    "cross_arms:shell:trigger:menu_back",
    "cross_arms:game:trigger:pause",
    "occlude:session:session-transition:freeze",
    "exit_frame:session:session-transition:show-recovery",
    "reenter_frame:session:session-transition:silent-recovery",
  ];
  const scenarios = new Map(
    plan.trials.map((trial) => [benchmarkScenarioKey(trial), trial.repetitions]),
  );
  const missingScenarios = requiredScenarios.filter(
    (scenario) => (scenarios.get(scenario) ?? 0) < 20,
  );
  if (missingScenarios.length > 0) {
    throw new Error(
      `Household benchmark is missing 20-attempt scenarios: ${missingScenarios.join(", ")}`,
    );
  }
  return plan;
}

export function scoreMotionBenchmark(
  planValue: unknown,
  resultValue: unknown,
): MotionBenchmarkScore {
  const plan = MotionBenchmarkPlanSchema.parse(planValue);
  const result = MotionBenchmarkResultSchema.parse(resultValue);
  if (result.protocolId !== plan.protocolId) {
    throw new Error("Benchmark result protocolId does not match the plan");
  }

  const attempts = new Map(
    result.attempts.map((attempt) => [
      `${attempt.trialId}:${attempt.repetition}`,
      attempt,
    ]),
  );
  const expectedAttempts = plan.trials.reduce(
    (total, trial) => total + trial.repetitions,
    0,
  );
  if (attempts.size !== expectedAttempts) {
    throw new Error("Benchmark result must contain every planned trial repetition exactly once");
  }

  let completedAttempts = 0;
  let invalidAttempts = 0;
  let truePositiveTriggers = 0;
  let falsePositiveTriggers = 0;
  let falseNegativeTriggers = 0;
  let expectedTransitions = 0;
  let correctTransitions = 0;
  let falsePositiveTransitions = 0;
  let falseNegativeTransitions = 0;

  for (const trial of plan.trials) {
    for (let repetition = 1; repetition <= trial.repetitions; repetition += 1) {
      const attempt = attempts.get(`${trial.id}:${repetition}`);
      if (!attempt) {
        throw new Error("Benchmark result contains an unknown or missing trial repetition");
      }
      if (
        attempt.observedTriggers.some(({ atMs }) => atMs > trial.durationMs) ||
        attempt.observedTransitions.some(({ atMs }) => atMs > trial.durationMs)
      ) {
        throw new Error(`Benchmark observation exceeds duration for ${trial.id}`);
      }
      if (!attempt.completed) {
        invalidAttempts += 1;
        continue;
      }
      completedAttempts += 1;
      const expectation = trial.expectation;
      if (expectation.kind === "trigger") {
        const matches = attempt.observedTriggers.filter(
          ({ action, atMs }) =>
            action === expectation.action &&
            insideWindow(atMs, expectation.window),
        );
        if (matches.length > 0) truePositiveTriggers += 1;
        else falseNegativeTriggers += 1;
        falsePositiveTriggers += attempt.observedTriggers.length - Math.min(1, matches.length);
      } else {
        falsePositiveTriggers += attempt.observedTriggers.length;
      }

      if (expectation.kind === "session-transition") {
        expectedTransitions += 1;
        const matches = attempt.observedTransitions.filter(
          ({ transition, atMs }) =>
            transition === expectation.transition &&
            insideWindow(atMs, expectation.window),
        );
        if (matches.length > 0) correctTransitions += 1;
        else falseNegativeTransitions += 1;
        falsePositiveTransitions +=
          attempt.observedTransitions.length - Math.min(1, matches.length);
      } else {
        falsePositiveTransitions += attempt.observedTransitions.length;
      }
    }
  }

  const triggerPrecision = ratio(
    truePositiveTriggers,
    truePositiveTriggers + falsePositiveTriggers,
  );
  const triggerRecall = ratio(
    truePositiveTriggers,
    truePositiveTriggers + falseNegativeTriggers,
  );
  return {
    complete: invalidAttempts === 0,
    expectedAttempts,
    completedAttempts,
    invalidAttempts,
    truePositiveTriggers,
    falsePositiveTriggers,
    falseNegativeTriggers,
    triggerPrecision,
    triggerRecall,
    expectedTransitions,
    correctTransitions,
    falsePositiveTransitions,
    falseNegativeTransitions,
    transitionPrecision: ratio(
      correctTransitions,
      correctTransitions + falsePositiveTransitions,
    ),
    transitionRecall: ratio(
      correctTransitions,
      correctTransitions + falseNegativeTransitions,
    ),
  };
}

function insideWindow(
  atMs: number,
  window: Readonly<{ earliestMs: number; latestMs: number }>,
): boolean {
  return atMs >= window.earliestMs && atMs <= window.latestMs;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function benchmarkScenarioKey(
  trial: z.infer<typeof MotionBenchmarkTrialSchema>,
): string {
  const expectation = trial.expectation;
  const detail =
    expectation.kind === "trigger"
      ? expectation.action
      : expectation.kind === "session-transition"
        ? expectation.transition
        : undefined;
  return [trial.movement, trial.context, expectation.kind, detail]
    .filter((value) => value !== undefined)
    .join(":");
}

export type BenchmarkActionName = MotionAction["name"];
