import { z } from "zod";

export const RETRO_PERFORMANCE_SCHEMA_VERSION = 1 as const;
export const RETRO_PERFORMANCE_MAX_JSON_BYTES = 256 * 1024;
export const RETRO_PERFORMANCE_MAX_TARGETS = 8;
export const RETRO_PERFORMANCE_MAX_RUNS = 40;
export const RETRO_PERFORMANCE_MAX_KNOWN_LIMITS = 32;

export const RETRO_SYSTEM_CLASSES = [
  "8-bit",
  "16-bit",
  "32-bit",
  "64-bit",
  "arcade",
] as const;

const OpaqueIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const VersionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/u);
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, "SHA-256 must be lowercase hexadecimal");
const SafeNonnegativeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const SafePositiveIntegerSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const SystemClassSchema = z.enum(RETRO_SYSTEM_CLASSES);

const TargetSchema = z
  .object({
    targetId: OpaqueIdSchema,
    architecture: z.enum(["linux-arm64", "linux-x86-64"]),
    hardwareFingerprintSha256: Sha256Schema,
    osImageSha256: Sha256Schema,
    frontendId: OpaqueIdSchema,
    frontendVersion: VersionSchema,
    frontendSha256: Sha256Schema,
    frameProbeId: OpaqueIdSchema,
    audioProbeId: OpaqueIdSchema,
    powerProbeId: OpaqueIdSchema,
    thermalProbeId: OpaqueIdSchema,
    instrumentationPolicySha256: Sha256Schema,
    outputWidthPx: z.number().int().min(640).max(7680),
    outputHeightPx: z.number().int().min(480).max(4320),
    refreshMilliHz: z.number().int().min(24_000).max(240_000),
  })
  .strict();

const ThresholdsSchema = z
  .object({
    minimumDurationSeconds: z.number().int().min(60).max(14_400),
    maxP95FrameIntervalUs: z.number().int().positive().max(1_000_000),
    maxP99FrameIntervalUs: z.number().int().positive().max(1_000_000),
    maxMissedFrameRatePpm: z.number().int().nonnegative().max(1_000_000),
    maxP95AudioLatencyUs: z.number().int().positive().max(1_000_000),
    maxAudioUnderruns: z.number().int().nonnegative().max(1_000_000),
    maxPeakPowerMilliW: z.number().int().positive().max(1_000_000),
    maxPeakTemperatureMilliC: z
      .number()
      .int()
      .positive()
      .max(200_000),
  })
  .strict()
  .superRefine((thresholds, context) => {
    if (
      thresholds.maxP95FrameIntervalUs
      > thresholds.maxP99FrameIntervalUs
    ) {
      context.addIssue({
        code: "custom",
        path: ["maxP99FrameIntervalUs"],
        message: "p99 frame limit must be at least the p95 frame limit",
      });
    }
  });

const PlannedRunSchema = z
  .object({
    targetId: OpaqueIdSchema,
    systemClass: SystemClassSchema,
    caseId: OpaqueIdSchema,
    systemId: OpaqueIdSchema,
    coreId: OpaqueIdSchema,
    coreVersion: VersionSchema,
    coreSha256: Sha256Schema,
    contentId: OpaqueIdSchema,
    contentSha256: Sha256Schema,
    thresholds: ThresholdsSchema,
  })
  .strict();

const classOrder = new Map(
  RETRO_SYSTEM_CLASSES.map((value, index) => [value, index]),
);

function compareRunIdentity(
  left: Readonly<{
    targetId: string;
    systemClass: (typeof RETRO_SYSTEM_CLASSES)[number];
  }>,
  right: Readonly<{
    targetId: string;
    systemClass: (typeof RETRO_SYSTEM_CLASSES)[number];
  }>,
): number {
  const targetComparison =
    left.targetId < right.targetId
      ? -1
      : left.targetId > right.targetId
        ? 1
        : 0;
  if (targetComparison !== 0) return targetComparison;
  return (
    (classOrder.get(left.systemClass) ?? Number.MAX_SAFE_INTEGER)
    - (classOrder.get(right.systemClass) ?? Number.MAX_SAFE_INTEGER)
  );
}

function hasStrictlySortedUniqueIds(
  values: readonly Readonly<{ targetId: string }>[],
): boolean {
  return values.every(
    ({ targetId }, index) =>
      index === 0 || values[index - 1]!.targetId < targetId,
  );
}

export const RetroBenchmarkPlanSchema = z
  .object({
    schemaVersion: z.literal(RETRO_PERFORMANCE_SCHEMA_VERSION),
    campaignId: OpaqueIdSchema,
    revision: z.number().int().positive(),
    targets: z.array(TargetSchema).min(1).max(RETRO_PERFORMANCE_MAX_TARGETS),
    runs: z.array(PlannedRunSchema).min(5).max(RETRO_PERFORMANCE_MAX_RUNS),
  })
  .strict()
  .superRefine((plan, context) => {
    if (!hasStrictlySortedUniqueIds(plan.targets)) {
      context.addIssue({
        code: "custom",
        path: ["targets"],
        message: "targets must be unique and strictly target-ID-sorted",
      });
    }
    if (
      plan.runs.some(
        (run, index) =>
          index > 0 && compareRunIdentity(plan.runs[index - 1]!, run) >= 0,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["runs"],
        message:
          "runs must be unique and sorted by target ID and system class",
      });
    }
    const caseIds = plan.runs.map(({ caseId }) => caseId);
    if (new Set(caseIds).size !== caseIds.length) {
      context.addIssue({
        code: "custom",
        path: ["runs"],
        message: "case IDs must be globally unique",
      });
    }
    const targetIds = new Set(plan.targets.map(({ targetId }) => targetId));
    if (plan.runs.some(({ targetId }) => !targetIds.has(targetId))) {
      context.addIssue({
        code: "custom",
        path: ["runs"],
        message: "every run must reference a declared target",
      });
    }
    if (plan.runs.length !== plan.targets.length * RETRO_SYSTEM_CLASSES.length) {
      context.addIssue({
        code: "custom",
        path: ["runs"],
        message: "every target requires exactly one run per system class",
      });
    }
    for (const { targetId } of plan.targets) {
      const observedClasses = plan.runs
        .filter((run) => run.targetId === targetId)
        .map(({ systemClass }) => systemClass);
      if (
        observedClasses.length !== RETRO_SYSTEM_CLASSES.length
        || RETRO_SYSTEM_CLASSES.some(
          (systemClass) => !observedClasses.includes(systemClass),
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["runs"],
          message: `target ${targetId} is missing a required system class`,
        });
      }
    }
  });

const InstrumentationSchema = z
  .object({
    frameProbeId: OpaqueIdSchema,
    audioProbeId: OpaqueIdSchema,
    powerProbeId: OpaqueIdSchema,
    thermalProbeId: OpaqueIdSchema,
    instrumentationPolicySha256: Sha256Schema,
    calibrationEvidenceSha256: Sha256Schema,
    rawTelemetrySha256: Sha256Schema,
  })
  .strict();

const MetricsSchema = z
  .object({
    observedDurationSeconds: SafePositiveIntegerSchema,
    frameCount: SafePositiveIntegerSchema,
    missedFrameCount: SafeNonnegativeIntegerSchema,
    p50FrameIntervalUs: SafePositiveIntegerSchema,
    p95FrameIntervalUs: SafePositiveIntegerSchema,
    p99FrameIntervalUs: SafePositiveIntegerSchema,
    maxFrameIntervalUs: SafePositiveIntegerSchema,
    p50AudioLatencyUs: SafePositiveIntegerSchema,
    p95AudioLatencyUs: SafePositiveIntegerSchema,
    audioUnderrunCount: SafeNonnegativeIntegerSchema,
    meanPowerMilliW: SafePositiveIntegerSchema,
    peakPowerMilliW: SafePositiveIntegerSchema,
    startTemperatureMilliC: SafeNonnegativeIntegerSchema,
    peakTemperatureMilliC: SafeNonnegativeIntegerSchema,
    endTemperatureMilliC: SafeNonnegativeIntegerSchema,
    throttlingObserved: z.boolean(),
    crashCount: SafeNonnegativeIntegerSchema,
    hangCount: SafeNonnegativeIntegerSchema,
  })
  .strict()
  .superRefine((metrics, context) => {
    if (
      !(
        metrics.p50FrameIntervalUs <= metrics.p95FrameIntervalUs
        && metrics.p95FrameIntervalUs <= metrics.p99FrameIntervalUs
        && metrics.p99FrameIntervalUs <= metrics.maxFrameIntervalUs
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["p50FrameIntervalUs"],
        message: "frame interval quantiles must be monotonic",
      });
    }
    if (metrics.p50AudioLatencyUs > metrics.p95AudioLatencyUs) {
      context.addIssue({
        code: "custom",
        path: ["p50AudioLatencyUs"],
        message: "audio latency quantiles must be monotonic",
      });
    }
    if (metrics.missedFrameCount > metrics.frameCount) {
      context.addIssue({
        code: "custom",
        path: ["missedFrameCount"],
        message: "missed frame count cannot exceed total frames",
      });
    }
    if (metrics.meanPowerMilliW > metrics.peakPowerMilliW) {
      context.addIssue({
        code: "custom",
        path: ["meanPowerMilliW"],
        message: "mean power cannot exceed peak power",
      });
    }
    if (
      metrics.startTemperatureMilliC > metrics.peakTemperatureMilliC
      || metrics.endTemperatureMilliC > metrics.peakTemperatureMilliC
    ) {
      context.addIssue({
        code: "custom",
        path: ["peakTemperatureMilliC"],
        message: "peak temperature must cover the start and end readings",
      });
    }
  });

const KnownLimitSchema = z
  .object({
    id: OpaqueIdSchema,
    category: z.enum([
      "compatibility",
      "accuracy",
      "frame-pacing",
      "audio",
      "power",
      "thermal",
      "input",
      "storage",
      "feature",
    ]),
    evidenceSha256: Sha256Schema,
  })
  .strict();

const ObservedRunSchema = z
  .object({
    targetId: OpaqueIdSchema,
    systemClass: SystemClassSchema,
    caseId: OpaqueIdSchema,
    hardwareFingerprintSha256: Sha256Schema,
    osImageSha256: Sha256Schema,
    frontendSha256: Sha256Schema,
    coreSha256: Sha256Schema,
    contentSha256: Sha256Schema,
    instrumentation: InstrumentationSchema,
    metrics: MetricsSchema,
    knownLimits: z
      .array(KnownLimitSchema)
      .max(RETRO_PERFORMANCE_MAX_KNOWN_LIMITS),
  })
  .strict()
  .superRefine((run, context) => {
    const ids = run.knownLimits.map(({ id }) => id);
    if (
      new Set(ids).size !== ids.length
      || ids.some((id, index) => index > 0 && run.knownLimits[index - 1]!.id >= id)
    ) {
      context.addIssue({
        code: "custom",
        path: ["knownLimits"],
        message: "known limits must be unique and strictly ID-sorted",
      });
    }
  });

export const RetroBenchmarkResultSchema = z
  .object({
    schemaVersion: z.literal(RETRO_PERFORMANCE_SCHEMA_VERSION),
    resultId: OpaqueIdSchema,
    campaignId: OpaqueIdSchema,
    campaignRevision: z.number().int().positive(),
    evidenceClass: z.enum(["physical-target", "development-dry-run"]),
    observedAt: z.iso.datetime({ precision: 0 }),
    runs: z.array(ObservedRunSchema).min(1).max(RETRO_PERFORMANCE_MAX_RUNS),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.runs.some(
        (run, index) =>
          index > 0 && compareRunIdentity(result.runs[index - 1]!, run) >= 0,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["runs"],
        message:
          "observed runs must be unique and sorted by target ID and system class",
      });
    }
    const caseIds = result.runs.map(({ caseId }) => caseId);
    if (new Set(caseIds).size !== caseIds.length) {
      context.addIssue({
        code: "custom",
        path: ["runs"],
        message: "observed case IDs must be globally unique",
      });
    }
  });

export type RetroBenchmarkPlan = Readonly<
  z.infer<typeof RetroBenchmarkPlanSchema>
>;
export type RetroBenchmarkResult = Readonly<
  z.infer<typeof RetroBenchmarkResultSchema>
>;

export type RetroBenchmarkFailureCode =
  | "insufficient-duration"
  | "frame-p95-limit"
  | "frame-p99-limit"
  | "missed-frame-rate-limit"
  | "audio-latency-limit"
  | "audio-underrun-limit"
  | "power-limit"
  | "temperature-limit"
  | "throttling-observed"
  | "crash-observed"
  | "hang-observed";

export interface RetroBenchmarkRunFailure {
  readonly targetId: string;
  readonly caseId: string;
  readonly codes: readonly RetroBenchmarkFailureCode[];
}

export interface RetroBenchmarkKnownLimit {
  readonly id: string;
  readonly category:
    | "compatibility"
    | "accuracy"
    | "frame-pacing"
    | "audio"
    | "power"
    | "thermal"
    | "input"
    | "storage"
    | "feature";
  readonly evidenceSha256: string;
}

export interface RetroBenchmarkQualification {
  readonly status: "qualified" | "blocked";
  readonly campaignId: string;
  readonly campaignRevision: number;
  readonly resultId: string;
  readonly evidenceClass: "physical-target" | "development-dry-run";
  readonly blockingCodes: readonly "development-evidence-only"[];
  readonly runFailures: readonly RetroBenchmarkRunFailure[];
  readonly knownLimits: readonly RetroBenchmarkKnownLimit[];
}

export interface RetroBenchmarkQualificationBinding {
  readonly campaignId: string;
  readonly campaignRevision: number;
  readonly resultId: string;
  readonly observedAt: string;
  readonly targetIds: readonly string[];
  readonly caseIds: readonly string[];
  readonly knownLimits: readonly RetroBenchmarkKnownLimit[];
}

const planAuthorities = new WeakSet<object>();
const resultAuthorities = new WeakSet<object>();
const qualificationAuthorities = new WeakMap<
  object,
  Readonly<{
    plan: RetroBenchmarkPlan;
    result: RetroBenchmarkResult;
  }>
>();

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function parseCanonicalJson(bytes: Uint8Array, label: string): unknown {
  if (
    bytes.byteLength === 0
    || bytes.byteLength > RETRO_PERFORMANCE_MAX_JSON_BYTES
  ) {
    throw new Error(`${label} JSON byte size is invalid`);
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  if (text !== `${JSON.stringify(value, null, 2)}\n`) {
    throw new Error(
      `${label} must be canonical JSON without duplicates or reordered fields`,
    );
  }
  return value;
}

export function parseRetroBenchmarkPlan(value: unknown): RetroBenchmarkPlan {
  const plan = deepFreeze(RetroBenchmarkPlanSchema.parse(value));
  planAuthorities.add(plan);
  return plan;
}

export function parseRetroBenchmarkPlanJson(
  bytes: Uint8Array,
): RetroBenchmarkPlan {
  return parseRetroBenchmarkPlan(parseCanonicalJson(bytes, "benchmark plan"));
}

export function parseRetroBenchmarkResult(
  value: unknown,
): RetroBenchmarkResult {
  const result = deepFreeze(RetroBenchmarkResultSchema.parse(value));
  resultAuthorities.add(result);
  return result;
}

export function parseRetroBenchmarkResultJson(
  bytes: Uint8Array,
): RetroBenchmarkResult {
  return parseRetroBenchmarkResult(
    parseCanonicalJson(bytes, "benchmark result"),
  );
}

function requireAuthority(
  value: object,
  authorities: WeakSet<object>,
  label: string,
): void {
  if (!authorities.has(value)) {
    throw new Error(`${label} must be an exact parsed authority object`);
  }
}

function requireEqual(
  actual: string,
  expected: string,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(`${label} does not match the benchmark plan`);
  }
}

export function evaluateRetroBenchmark(
  plan: RetroBenchmarkPlan,
  result: RetroBenchmarkResult,
): RetroBenchmarkQualification {
  requireAuthority(plan, planAuthorities, "benchmark plan");
  requireAuthority(result, resultAuthorities, "benchmark result");
  if (
    result.campaignId !== plan.campaignId
    || result.campaignRevision !== plan.revision
  ) {
    throw new Error("benchmark campaign identity does not match");
  }
  if (result.runs.length !== plan.runs.length) {
    throw new Error("benchmark result does not contain the complete run matrix");
  }

  const targetById = new Map(
    plan.targets.map((target) => [target.targetId, target]),
  );
  const runFailures: RetroBenchmarkRunFailure[] = [];
  const knownLimitsById = new Map<string, RetroBenchmarkKnownLimit>();
  for (const [index, expected] of plan.runs.entries()) {
    const observed = result.runs[index]!;
    requireEqual(observed.targetId, expected.targetId, "target ID");
    requireEqual(observed.systemClass, expected.systemClass, "system class");
    requireEqual(observed.caseId, expected.caseId, "case ID");
    requireEqual(observed.coreSha256, expected.coreSha256, "core identity");
    requireEqual(
      observed.contentSha256,
      expected.contentSha256,
      "content identity",
    );
    const target = targetById.get(expected.targetId);
    if (!target) throw new Error("planned run references an unknown target");
    requireEqual(
      observed.hardwareFingerprintSha256,
      target.hardwareFingerprintSha256,
      "hardware identity",
    );
    requireEqual(observed.osImageSha256, target.osImageSha256, "OS identity");
    requireEqual(
      observed.frontendSha256,
      target.frontendSha256,
      "frontend identity",
    );
    requireEqual(
      observed.instrumentation.frameProbeId,
      target.frameProbeId,
      "frame probe identity",
    );
    requireEqual(
      observed.instrumentation.audioProbeId,
      target.audioProbeId,
      "audio probe identity",
    );
    requireEqual(
      observed.instrumentation.powerProbeId,
      target.powerProbeId,
      "power probe identity",
    );
    requireEqual(
      observed.instrumentation.thermalProbeId,
      target.thermalProbeId,
      "thermal probe identity",
    );
    requireEqual(
      observed.instrumentation.instrumentationPolicySha256,
      target.instrumentationPolicySha256,
      "instrumentation policy identity",
    );

    const { metrics } = observed;
    const { thresholds } = expected;
    const codes: RetroBenchmarkFailureCode[] = [];
    if (metrics.observedDurationSeconds < thresholds.minimumDurationSeconds) {
      codes.push("insufficient-duration");
    }
    if (metrics.p95FrameIntervalUs > thresholds.maxP95FrameIntervalUs) {
      codes.push("frame-p95-limit");
    }
    if (metrics.p99FrameIntervalUs > thresholds.maxP99FrameIntervalUs) {
      codes.push("frame-p99-limit");
    }
    if (
      BigInt(metrics.missedFrameCount) * 1_000_000n
      > BigInt(thresholds.maxMissedFrameRatePpm)
        * BigInt(metrics.frameCount)
    ) {
      codes.push("missed-frame-rate-limit");
    }
    if (metrics.p95AudioLatencyUs > thresholds.maxP95AudioLatencyUs) {
      codes.push("audio-latency-limit");
    }
    if (metrics.audioUnderrunCount > thresholds.maxAudioUnderruns) {
      codes.push("audio-underrun-limit");
    }
    if (metrics.peakPowerMilliW > thresholds.maxPeakPowerMilliW) {
      codes.push("power-limit");
    }
    if (
      metrics.peakTemperatureMilliC
      > thresholds.maxPeakTemperatureMilliC
    ) {
      codes.push("temperature-limit");
    }
    if (metrics.throttlingObserved) codes.push("throttling-observed");
    if (metrics.crashCount > 0) codes.push("crash-observed");
    if (metrics.hangCount > 0) codes.push("hang-observed");
    if (codes.length > 0) {
      runFailures.push({
        targetId: observed.targetId,
        caseId: observed.caseId,
        codes,
      });
    }
    for (const knownLimit of observed.knownLimits) {
      const prior = knownLimitsById.get(knownLimit.id);
      if (
        prior
        && (
          prior.category !== knownLimit.category
          || prior.evidenceSha256 !== knownLimit.evidenceSha256
        )
      ) {
        throw new Error("known-limit identity has conflicting evidence");
      }
      knownLimitsById.set(knownLimit.id, knownLimit);
    }
  }

  const blockingCodes =
    result.evidenceClass === "physical-target"
      ? []
      : (["development-evidence-only"] as const);
  const qualification = deepFreeze({
    status:
      blockingCodes.length === 0 && runFailures.length === 0
        ? "qualified"
        : "blocked",
    campaignId: plan.campaignId,
    campaignRevision: plan.revision,
    resultId: result.resultId,
    evidenceClass: result.evidenceClass,
    blockingCodes,
    runFailures,
    knownLimits: [...knownLimitsById.values()].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    ),
  } satisfies RetroBenchmarkQualification);
  qualificationAuthorities.set(qualification, { plan, result });
  return qualification;
}

export function authorizeRetroBenchmarkQualification(
  qualification: RetroBenchmarkQualification,
  plan: RetroBenchmarkPlan,
  result: RetroBenchmarkResult,
): RetroBenchmarkQualificationBinding {
  const authority = qualificationAuthorities.get(qualification);
  if (
    !authority
    || authority.plan !== plan
    || authority.result !== result
  ) {
    throw new Error(
      "qualification must be the exact current benchmark authority",
    );
  }
  if (qualification.status !== "qualified") {
    throw new Error("retro benchmark matrix is not qualified");
  }
  return deepFreeze({
    campaignId: plan.campaignId,
    campaignRevision: plan.revision,
    resultId: result.resultId,
    observedAt: result.observedAt,
    targetIds: plan.targets.map(({ targetId }) => targetId),
    caseIds: plan.runs.map(({ caseId }) => caseId),
    knownLimits: qualification.knownLimits,
  });
}
