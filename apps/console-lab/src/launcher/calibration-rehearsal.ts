export const CALIBRATION_REHEARSAL_MIN_SAMPLES = 8;
export const CALIBRATION_REHEARSAL_MAX_SAMPLES = 24;
export const CALIBRATION_REHEARSAL_CONFIDENCE_GATE = 0.82;
export const CALIBRATION_REHEARSAL_SESSION_TTL_MS = 120_000;

export type CalibrationRehearsalPhase =
  | "idle"
  | "notice"
  | "observing"
  | "guided"
  | "blocked"
  | "ready"
  | "invalidated";
export type CalibrationDimension =
  | "floor"
  | "play-zone"
  | "player-scale"
  | "neutral-stance"
  | "usable-range";
export type CalibrationDimensionStatus =
  | "unknown"
  | "ready"
  | "needs-check"
  | "blocked"
  | "conservative";
export type CalibrationIssue =
  | "no-player"
  | "multiple-people"
  | "camera-moved"
  | "unsafe-zone"
  | "partial-body"
  | "feet-missing"
  | "floor-low-confidence"
  | "zone-low-confidence"
  | "scale-low-confidence"
  | "neutral-low-confidence"
  | "range-low-confidence";
export type CalibrationGuidedStep =
  | "camera-placement"
  | "clear-play-zone"
  | "neutral-stance"
  | "usable-range";
export type CalibrationInvalidationReason =
  | "room-change"
  | "camera-change"
  | "geometry-change"
  | "confidence-drop";

export interface CalibrationAttemptRef {
  sessionId: number;
  attempt: number;
  profileId: string;
  environmentId: string;
  cameraConfigurationId: string;
}

export interface CalibrationObservation {
  sampleNumber: number;
  bodyCount: number;
  fullBodyVisible: boolean;
  feetVisible: boolean;
  cameraStable: boolean;
  zoneClear: boolean;
  floorConfidence: number;
  zoneConfidence: number;
  scaleConfidence: number;
  neutralConfidence: number;
  rangeConfidence: number;
}

export interface CalibrationDimensionSummary {
  dimension: CalibrationDimension;
  status: CalibrationDimensionStatus;
  confidence: number | null;
}

export interface CalibrationReadyResult {
  id: string;
  profileId: string;
  sessionId: number;
  attempt: number;
  limited: boolean;
}

export interface CalibrationRehearsalSnapshot {
  revision: number;
  phase: CalibrationRehearsalPhase;
  profileId: string | null;
  sessionId: number | null;
  attempt: number | null;
  sampleCount: number;
  sessionExpiresAtMs: number | null;
  dimensions: readonly Readonly<CalibrationDimensionSummary>[];
  issues: readonly CalibrationIssue[];
  guidedSteps: readonly CalibrationGuidedStep[];
  readyResult: Readonly<CalibrationReadyResult> | null;
  invalidationReason: CalibrationInvalidationReason | null;
}

interface ActiveCalibrationSession {
  id: number;
  profileId: string;
  environmentId: string;
  cameraConfigurationId: string;
  attempt: number;
  expiresAtMs: number;
  samples: CalibrationObservation[];
  dimensions: CalibrationDimensionSummary[];
  issues: CalibrationIssue[];
  guidedSteps: CalibrationGuidedStep[];
  readyResult: CalibrationReadyResult | null;
  invalidationReason: CalibrationInvalidationReason | null;
}

const dimensions = Object.freeze<readonly CalibrationDimension[]>([
  "floor",
  "play-zone",
  "player-scale",
  "neutral-stance",
  "usable-range",
]);
const attemptRefKeys = [
  "attempt",
  "cameraConfigurationId",
  "environmentId",
  "profileId",
  "sessionId",
] as const;
const observationKeys = [
  "bodyCount",
  "cameraStable",
  "feetVisible",
  "floorConfidence",
  "fullBodyVisible",
  "neutralConfidence",
  "rangeConfidence",
  "sampleNumber",
  "scaleConfidence",
  "zoneClear",
  "zoneConfidence",
] as const;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const invalidationReasons = new Set<CalibrationInvalidationReason>([
  "room-change",
  "camera-change",
  "geometry-change",
  "confidence-drop",
]);

export class CalibrationRehearsalError extends Error {}

export class CalibrationRehearsalController {
  #revision = 0;
  #phase: CalibrationRehearsalPhase = "idle";
  #session: ActiveCalibrationSession | null = null;
  #nextSessionId = 1;
  #lastNowMs = 0;

  snapshot(): CalibrationRehearsalSnapshot {
    const session = this.#session;
    return Object.freeze({
      revision: this.#revision,
      phase: this.#phase,
      profileId: session?.profileId ?? null,
      sessionId: session?.id ?? null,
      attempt: session?.attempt ?? null,
      sampleCount: session?.samples.length ?? 0,
      sessionExpiresAtMs: session?.expiresAtMs ?? null,
      dimensions: Object.freeze(
        (session?.dimensions ?? unknownDimensions()).map((summary) =>
          Object.freeze({ ...summary }),
        ),
      ),
      issues: Object.freeze([...(session?.issues ?? [])]),
      guidedSteps: Object.freeze([...(session?.guidedSteps ?? [])]),
      readyResult: session?.readyResult
        ? Object.freeze({ ...session.readyResult })
        : null,
      invalidationReason: session?.invalidationReason ?? null,
    });
  }

  open(
    profileId: string,
    environmentId: string,
    cameraConfigurationId: string,
    nowMs: number,
  ): CalibrationRehearsalSnapshot {
    this.#observeTime(nowMs);
    validateId(profileId, "calibration profile ID");
    validateId(environmentId, "calibration environment ID");
    validateId(cameraConfigurationId, "camera configuration ID");
    if (this.#phase !== "idle") {
      throw new CalibrationRehearsalError(
        "another calibration rehearsal is active",
      );
    }
    if (this.#nextSessionId > Number.MAX_SAFE_INTEGER) {
      throw new CalibrationRehearsalError(
        "calibration session identifier exhausted",
      );
    }
    if (
      nowMs
      > Number.MAX_SAFE_INTEGER - CALIBRATION_REHEARSAL_SESSION_TTL_MS
    ) {
      throw new CalibrationRehearsalError(
        "calibration session exceeds safe time",
      );
    }
    this.#session = {
      id: this.#nextSessionId++,
      profileId,
      environmentId,
      cameraConfigurationId,
      attempt: 0,
      expiresAtMs: nowMs + CALIBRATION_REHEARSAL_SESSION_TTL_MS,
      samples: [],
      dimensions: unknownDimensions(),
      issues: [],
      guidedSteps: [],
      readyResult: null,
      invalidationReason: null,
    };
    this.#phase = "notice";
    this.#revision += 1;
    return this.snapshot();
  }

  beginAutomatic(nowMs: number): CalibrationAttemptRef {
    this.#observeTime(nowMs);
    const session = this.#requireLiveSession(nowMs);
    if (
      this.#phase !== "notice"
      && this.#phase !== "guided"
      && this.#phase !== "blocked"
      && this.#phase !== "invalidated"
    ) {
      throw new CalibrationRehearsalError(
        "automatic calibration cannot start from this phase",
      );
    }
    if (session.attempt >= Number.MAX_SAFE_INTEGER) {
      throw new CalibrationRehearsalError(
        "calibration attempt identifier exhausted",
      );
    }
    session.attempt += 1;
    session.samples = [];
    session.dimensions = unknownDimensions();
    session.issues = [];
    session.guidedSteps = [];
    session.readyResult = null;
    session.invalidationReason = null;
    this.#phase = "observing";
    this.#revision += 1;
    return freezeAttemptRef(session);
  }

  submitObservation(
    attempt: CalibrationAttemptRef,
    observation: CalibrationObservation,
    nowMs: number,
  ): CalibrationRehearsalSnapshot {
    this.#observeTime(nowMs);
    validateAttemptRef(attempt);
    const validated = validateObservation(observation);
    const session = this.#requireLiveSession(nowMs);
    if (this.#phase !== "observing") {
      throw new CalibrationRehearsalError(
        "calibration observation requires active observation",
      );
    }
    if (!sameAttempt(session, attempt)) {
      throw new CalibrationRehearsalError(
        "stale calibration observation callback",
      );
    }
    if (session.samples.length >= CALIBRATION_REHEARSAL_MAX_SAMPLES) {
      throw new CalibrationRehearsalError(
        "too many calibration observations",
      );
    }
    if (validated.sampleNumber !== session.samples.length + 1) {
      throw new CalibrationRehearsalError(
        "calibration sample sequence mismatch",
      );
    }
    session.samples.push(validated);
    this.#revision += 1;
    return this.snapshot();
  }

  evaluate(nowMs: number): CalibrationRehearsalSnapshot {
    this.#observeTime(nowMs);
    const session = this.#requireLiveSession(nowMs);
    if (this.#phase !== "observing") {
      throw new CalibrationRehearsalError(
        "calibration evaluation requires active observation",
      );
    }
    if (session.samples.length < CALIBRATION_REHEARSAL_MIN_SAMPLES) {
      throw new CalibrationRehearsalError(
        "calibration needs more observations",
      );
    }
    const evaluation = evaluateSamples(session.samples);
    session.dimensions = evaluation.dimensions;
    session.issues = evaluation.issues;
    session.guidedSteps = evaluation.guidedSteps;
    session.readyResult = null;
    session.invalidationReason = null;
    if (evaluation.blocked) {
      this.#phase = "blocked";
    } else if (evaluation.guidedSteps.length > 0) {
      this.#phase = "guided";
    } else {
      session.readyResult = readyResult(session, false);
      this.#phase = "ready";
    }
    this.#revision += 1;
    return this.snapshot();
  }

  skipOptionalGuidance(nowMs: number): CalibrationRehearsalSnapshot {
    this.#observeTime(nowMs);
    const session = this.#requireLiveSession(nowMs);
    if (this.#phase !== "guided") {
      throw new CalibrationRehearsalError(
        "optional calibration skip requires guided correction",
      );
    }
    const unsafeToSkip = session.issues.some(
      (issue) =>
        issue !== "neutral-low-confidence"
        && issue !== "range-low-confidence",
    );
    if (unsafeToSkip) {
      throw new CalibrationRehearsalError(
        "required calibration guidance cannot be skipped",
      );
    }
    session.dimensions = session.dimensions.map((summary) =>
      summary.status === "needs-check"
        ? { ...summary, status: "conservative" }
        : summary,
    );
    session.readyResult = readyResult(session, true);
    this.#phase = "ready";
    this.#revision += 1;
    return this.snapshot();
  }

  invalidate(
    reason: CalibrationInvalidationReason,
    environmentId: string,
    cameraConfigurationId: string,
    nowMs: number,
  ): CalibrationRehearsalSnapshot {
    this.#observeTime(nowMs);
    validateId(environmentId, "calibration environment ID");
    validateId(cameraConfigurationId, "camera configuration ID");
    if (!invalidationReasons.has(reason)) {
      throw new CalibrationRehearsalError(
        "invalid calibration invalidation reason",
      );
    }
    const session = this.#requireLiveSession(nowMs);
    if (this.#phase !== "ready" || session.readyResult === null) {
      throw new CalibrationRehearsalError(
        "only a ready calibration can be invalidated",
      );
    }
    if (
      reason === "room-change"
      && environmentId === session.environmentId
    ) {
      throw new CalibrationRehearsalError(
        "room-change invalidation requires a changed environment",
      );
    }
    if (
      (reason === "camera-change" || reason === "geometry-change")
      && cameraConfigurationId === session.cameraConfigurationId
    ) {
      throw new CalibrationRehearsalError(
        "camera invalidation requires changed configuration",
      );
    }
    session.environmentId = environmentId;
    session.cameraConfigurationId = cameraConfigurationId;
    session.samples = [];
    session.issues = [];
    session.guidedSteps = [];
    session.readyResult = null;
    session.invalidationReason = reason;
    session.dimensions = dimensions.map((dimension) => ({
      dimension,
      status: "blocked",
      confidence: null,
    }));
    this.#phase = "invalidated";
    this.#revision += 1;
    return this.snapshot();
  }

  cancel(nowMs: number): CalibrationRehearsalSnapshot {
    this.#observeTime(nowMs);
    this.#requireLiveSession(nowMs);
    this.#session = null;
    this.#phase = "idle";
    this.#revision += 1;
    return this.snapshot();
  }

  expire(nowMs: number): CalibrationRehearsalSnapshot | null {
    this.#observeTime(nowMs);
    if (!this.#session || nowMs <= this.#session.expiresAtMs) return null;
    this.#session = null;
    this.#phase = "idle";
    this.#revision += 1;
    return this.snapshot();
  }

  #requireLiveSession(nowMs: number): ActiveCalibrationSession {
    const session = this.#session;
    if (!session) {
      throw new CalibrationRehearsalError(
        "no calibration rehearsal is active",
      );
    }
    if (nowMs > session.expiresAtMs) {
      throw new CalibrationRehearsalError(
        "calibration rehearsal expired",
      );
    }
    return session;
  }

  #observeTime(nowMs: number): void {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new CalibrationRehearsalError(
        "time must be a non-negative safe integer",
      );
    }
    if (nowMs < this.#lastNowMs) {
      throw new CalibrationRehearsalError(
        "calibration clock moved backwards",
      );
    }
    this.#lastNowMs = nowMs;
  }
}

function evaluateSamples(samples: readonly CalibrationObservation[]): {
  dimensions: CalibrationDimensionSummary[];
  issues: CalibrationIssue[];
  guidedSteps: CalibrationGuidedStep[];
  blocked: boolean;
} {
  const issues: CalibrationIssue[] = [];
  const all = (predicate: (sample: CalibrationObservation) => boolean) =>
    samples.every(predicate);
  const any = (predicate: (sample: CalibrationObservation) => boolean) =>
    samples.some(predicate);
  const average = (key: ConfidenceKey) =>
    samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;

  if (any((sample) => sample.bodyCount === 0)) issues.push("no-player");
  if (any((sample) => sample.bodyCount > 1)) issues.push("multiple-people");
  if (!all((sample) => sample.cameraStable)) issues.push("camera-moved");
  if (!all((sample) => sample.zoneClear)) issues.push("unsafe-zone");
  if (!all((sample) => sample.fullBodyVisible)) issues.push("partial-body");
  if (!all((sample) => sample.feetVisible)) issues.push("feet-missing");

  const confidence = {
    floor: average("floorConfidence"),
    "play-zone": average("zoneConfidence"),
    "player-scale": average("scaleConfidence"),
    "neutral-stance": average("neutralConfidence"),
    "usable-range": average("rangeConfidence"),
  } satisfies Record<CalibrationDimension, number>;
  if (confidence.floor < CALIBRATION_REHEARSAL_CONFIDENCE_GATE) {
    issues.push("floor-low-confidence");
  }
  if (confidence["play-zone"] < CALIBRATION_REHEARSAL_CONFIDENCE_GATE) {
    issues.push("zone-low-confidence");
  }
  if (confidence["player-scale"] < CALIBRATION_REHEARSAL_CONFIDENCE_GATE) {
    issues.push("scale-low-confidence");
  }
  if (confidence["neutral-stance"] < CALIBRATION_REHEARSAL_CONFIDENCE_GATE) {
    issues.push("neutral-low-confidence");
  }
  if (confidence["usable-range"] < CALIBRATION_REHEARSAL_CONFIDENCE_GATE) {
    issues.push("range-low-confidence");
  }

  const blockingIssues = new Set<CalibrationIssue>([
    "no-player",
    "multiple-people",
    "camera-moved",
    "unsafe-zone",
  ]);
  const blocked = issues.some((issue) => blockingIssues.has(issue));
  const statusFor = (
    dimension: CalibrationDimension,
  ): CalibrationDimensionStatus => {
    if (blocked) return "blocked";
    const affected = dimensionIssues(dimension).some((issue) =>
      issues.includes(issue),
    );
    return affected ? "needs-check" : "ready";
  };
  const summaries = dimensions.map((dimension) => ({
    dimension,
    status: statusFor(dimension),
    confidence: roundConfidence(confidence[dimension]),
  }));
  const guidedSteps: CalibrationGuidedStep[] = [];
  if (!blocked) {
    if (
      issues.some((issue) =>
        [
          "partial-body",
          "feet-missing",
          "floor-low-confidence",
          "scale-low-confidence",
        ].includes(issue)
      )
    ) {
      guidedSteps.push("camera-placement");
    }
    if (issues.includes("zone-low-confidence")) {
      guidedSteps.push("clear-play-zone");
    }
    if (issues.includes("neutral-low-confidence")) {
      guidedSteps.push("neutral-stance");
    }
    if (issues.includes("range-low-confidence")) {
      guidedSteps.push("usable-range");
    }
  }
  return {
    dimensions: summaries,
    issues,
    guidedSteps,
    blocked,
  };
}

type ConfidenceKey =
  | "floorConfidence"
  | "zoneConfidence"
  | "scaleConfidence"
  | "neutralConfidence"
  | "rangeConfidence";

function dimensionIssues(
  dimension: CalibrationDimension,
): readonly CalibrationIssue[] {
  if (dimension === "floor") {
    return ["feet-missing", "floor-low-confidence"];
  }
  if (dimension === "play-zone") {
    return ["zone-low-confidence"];
  }
  if (dimension === "player-scale") {
    return ["partial-body", "scale-low-confidence"];
  }
  if (dimension === "neutral-stance") {
    return ["neutral-low-confidence"];
  }
  return ["range-low-confidence"];
}

function unknownDimensions(): CalibrationDimensionSummary[] {
  return dimensions.map((dimension) => ({
    dimension,
    status: "unknown",
    confidence: null,
  }));
}

function readyResult(
  session: ActiveCalibrationSession,
  limited: boolean,
): CalibrationReadyResult {
  return {
    id: `calibration-fixture-${session.id}-${session.attempt}`,
    profileId: session.profileId,
    sessionId: session.id,
    attempt: session.attempt,
    limited,
  };
}

function freezeAttemptRef(
  session: ActiveCalibrationSession,
): CalibrationAttemptRef {
  return Object.freeze({
    sessionId: session.id,
    attempt: session.attempt,
    profileId: session.profileId,
    environmentId: session.environmentId,
    cameraConfigurationId: session.cameraConfigurationId,
  });
}

function sameAttempt(
  session: ActiveCalibrationSession,
  attempt: CalibrationAttemptRef,
): boolean {
  return (
    session.id === attempt.sessionId
    && session.attempt === attempt.attempt
    && session.profileId === attempt.profileId
    && session.environmentId === attempt.environmentId
    && session.cameraConfigurationId === attempt.cameraConfigurationId
  );
}

function validateAttemptRef(attempt: CalibrationAttemptRef): void {
  if (
    typeof attempt !== "object"
    || attempt === null
    || Array.isArray(attempt)
    || !hasExactKeys(attempt, attemptRefKeys)
    || !Number.isSafeInteger(attempt.sessionId)
    || attempt.sessionId <= 0
    || !Number.isSafeInteger(attempt.attempt)
    || attempt.attempt <= 0
  ) {
    throw new CalibrationRehearsalError(
      "invalid calibration attempt reference",
    );
  }
  validateId(attempt.profileId, "calibration profile ID");
  validateId(attempt.environmentId, "calibration environment ID");
  validateId(attempt.cameraConfigurationId, "camera configuration ID");
}

function validateObservation(
  observation: CalibrationObservation,
): CalibrationObservation {
  if (
    typeof observation !== "object"
    || observation === null
    || Array.isArray(observation)
    || !hasExactKeys(observation, observationKeys)
  ) {
    throw new CalibrationRehearsalError(
      "calibration observation must use the closed schema",
    );
  }
  if (
    !Number.isSafeInteger(observation.sampleNumber)
    || observation.sampleNumber <= 0
    || !Number.isSafeInteger(observation.bodyCount)
    || observation.bodyCount < 0
    || observation.bodyCount > 4
  ) {
    throw new CalibrationRehearsalError(
      "invalid calibration observation count",
    );
  }
  for (const key of [
    "fullBodyVisible",
    "feetVisible",
    "cameraStable",
    "zoneClear",
  ] as const) {
    if (typeof observation[key] !== "boolean") {
      throw new CalibrationRehearsalError(
        "invalid calibration observation state",
      );
    }
  }
  for (const key of [
    "floorConfidence",
    "zoneConfidence",
    "scaleConfidence",
    "neutralConfidence",
    "rangeConfidence",
  ] as const) {
    if (
      typeof observation[key] !== "number"
      || !Number.isFinite(observation[key])
      || observation[key] < 0
      || observation[key] > 1
    ) {
      throw new CalibrationRehearsalError(
        "invalid calibration confidence",
      );
    }
  }
  return { ...observation };
}

function validateId(value: string, label: string): void {
  if (
    typeof value !== "string"
    || value.length > 64
    || !idPattern.test(value)
  ) {
    throw new CalibrationRehearsalError(`invalid ${label}`);
  }
}

function hasExactKeys(
  value: object,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length
    && sortedExpected.every((key, index) => keys[index] === key)
  );
}

function roundConfidence(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
