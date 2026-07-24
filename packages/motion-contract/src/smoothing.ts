export const SMOOTHING_ALGORITHMS = [
  "passthrough",
  "ema",
  "one-euro",
  "kalman",
] as const;

export type SmoothingAlgorithm = (typeof SMOOTHING_ALGORITHMS)[number];

export type SmoothingSample =
  | {
      timestampMs: number;
      observed: true;
      x: number;
      y: number;
    }
  | {
      timestampMs: number;
      observed: false;
    };

export type SmoothedSample = SmoothingSample;

export interface MotionPointSmootherOptions {
  algorithm: SmoothingAlgorithm;
  maxGapMs?: number;
  emaAlpha?: number;
  oneEuroMinCutoffHz?: number;
  oneEuroBeta?: number;
  oneEuroDerivativeCutoffHz?: number;
  kalmanProcessVariance?: number;
  kalmanMeasurementVariance?: number;
}

interface ResolvedOptions {
  algorithm: SmoothingAlgorithm;
  maxGapMs: number;
  emaAlpha: number;
  oneEuroMinCutoffHz: number;
  oneEuroBeta: number;
  oneEuroDerivativeCutoffHz: number;
  kalmanProcessVariance: number;
  kalmanMeasurementVariance: number;
}

interface OneEuroAxisState {
  raw: number;
  filtered: number;
  filteredDerivative: number;
}

interface KalmanAxisState {
  position: number;
  velocity: number;
  covariance00: number;
  covariance01: number;
  covariance10: number;
  covariance11: number;
}

const DEFAULT_OPTIONS: Omit<ResolvedOptions, "algorithm"> = {
  maxGapMs: 250,
  emaAlpha: 0.35,
  oneEuroMinCutoffHz: 1,
  oneEuroBeta: 4,
  oneEuroDerivativeCutoffHz: 1,
  kalmanProcessVariance: 0.002,
  kalmanMeasurementVariance: 0.001,
};

function requireExactKeys(
  value: object,
  expectedKeys: readonly string[],
  name: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} keys must be exactly ${expected.join(", ")}`);
  }
}

function requireFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
  minimumInclusive = true,
): number {
  if (
    !Number.isFinite(value) ||
    (minimumInclusive ? value < minimum : value <= minimum) ||
    value > maximum
  ) {
    const comparison = minimumInclusive ? "between" : "greater than";
    throw new Error(
      minimumInclusive
        ? `${name} must be a finite number between ${minimum} and ${maximum}`
        : `${name} must be a finite number ${comparison} ${minimum} and at most ${maximum}`,
    );
  }
  return value;
}

function resolveOptions(options: MotionPointSmootherOptions): ResolvedOptions {
  if (
    typeof options !== "object" ||
    options === null ||
    !SMOOTHING_ALGORITHMS.includes(options.algorithm)
  ) {
    throw new Error(
      `algorithm must be one of ${SMOOTHING_ALGORITHMS.join(", ")}`,
    );
  }
  const allowedKeys = [
    "algorithm",
    "maxGapMs",
    "emaAlpha",
    "oneEuroMinCutoffHz",
    "oneEuroBeta",
    "oneEuroDerivativeCutoffHz",
    "kalmanProcessVariance",
    "kalmanMeasurementVariance",
  ];
  const unknownKeys = Object.keys(options).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(`options contains unknown keys: ${unknownKeys.join(", ")}`);
  }
  return {
    algorithm: options.algorithm,
    maxGapMs: requireFiniteRange(
      options.maxGapMs ?? DEFAULT_OPTIONS.maxGapMs,
      1,
      10_000,
      "maxGapMs",
    ),
    emaAlpha: requireFiniteRange(
      options.emaAlpha ?? DEFAULT_OPTIONS.emaAlpha,
      0,
      1,
      "emaAlpha",
      false,
    ),
    oneEuroMinCutoffHz: requireFiniteRange(
      options.oneEuroMinCutoffHz ?? DEFAULT_OPTIONS.oneEuroMinCutoffHz,
      0,
      120,
      "oneEuroMinCutoffHz",
      false,
    ),
    oneEuroBeta: requireFiniteRange(
      options.oneEuroBeta ?? DEFAULT_OPTIONS.oneEuroBeta,
      0,
      100,
      "oneEuroBeta",
    ),
    oneEuroDerivativeCutoffHz: requireFiniteRange(
      options.oneEuroDerivativeCutoffHz ??
        DEFAULT_OPTIONS.oneEuroDerivativeCutoffHz,
      0,
      120,
      "oneEuroDerivativeCutoffHz",
      false,
    ),
    kalmanProcessVariance: requireFiniteRange(
      options.kalmanProcessVariance ??
        DEFAULT_OPTIONS.kalmanProcessVariance,
      0,
      1,
      "kalmanProcessVariance",
      false,
    ),
    kalmanMeasurementVariance: requireFiniteRange(
      options.kalmanMeasurementVariance ??
        DEFAULT_OPTIONS.kalmanMeasurementVariance,
      0,
      1,
      "kalmanMeasurementVariance",
      false,
    ),
  };
}

function validateSample(sample: SmoothingSample, previousTimestampMs?: number): void {
  if (typeof sample !== "object" || sample === null) {
    throw new Error("sample must be an object");
  }
  requireFiniteRange(
    sample.timestampMs,
    0,
    Number.MAX_SAFE_INTEGER,
    "timestampMs",
  );
  if (
    previousTimestampMs !== undefined &&
    sample.timestampMs <= previousTimestampMs
  ) {
    throw new Error("timestampMs must be strictly increasing");
  }
  if (typeof sample.observed !== "boolean") {
    throw new Error("observed must be boolean");
  }
  if (sample.observed) {
    requireExactKeys(sample, ["timestampMs", "observed", "x", "y"], "sample");
    requireFiniteRange(sample.x, 0, 1, "x");
    requireFiniteRange(sample.y, 0, 1, "y");
  } else {
    requireExactKeys(sample, ["timestampMs", "observed"], "sample");
  }
}

function clampNormalized(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lowPassAlpha(cutoffHz: number, deltaSeconds: number): number {
  const timeConstant = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + timeConstant / deltaSeconds);
}

function updateOneEuroAxis(
  state: OneEuroAxisState,
  measurement: number,
  deltaSeconds: number,
  options: ResolvedOptions,
): OneEuroAxisState {
  const rawDerivative = (measurement - state.raw) / deltaSeconds;
  const derivativeAlpha = lowPassAlpha(
    options.oneEuroDerivativeCutoffHz,
    deltaSeconds,
  );
  const filteredDerivative =
    derivativeAlpha * rawDerivative +
    (1 - derivativeAlpha) * state.filteredDerivative;
  const cutoff =
    options.oneEuroMinCutoffHz +
    options.oneEuroBeta * Math.abs(filteredDerivative);
  const valueAlpha = lowPassAlpha(cutoff, deltaSeconds);
  return {
    raw: measurement,
    filtered:
      valueAlpha * measurement + (1 - valueAlpha) * state.filtered,
    filteredDerivative,
  };
}

function createKalmanAxis(measurement: number): KalmanAxisState {
  return {
    position: measurement,
    velocity: 0,
    covariance00: 1,
    covariance01: 0,
    covariance10: 0,
    covariance11: 1,
  };
}

function predictKalmanAxis(
  state: KalmanAxisState,
  deltaSeconds: number,
  processVariance: number,
): KalmanAxisState {
  const dt2 = deltaSeconds * deltaSeconds;
  const dt3 = dt2 * deltaSeconds;
  const dt4 = dt2 * dt2;
  return {
    position: state.position + deltaSeconds * state.velocity,
    velocity: state.velocity,
    covariance00:
      state.covariance00 +
      deltaSeconds * (state.covariance10 + state.covariance01) +
      dt2 * state.covariance11 +
      processVariance * dt4 * 0.25,
    covariance01:
      state.covariance01 +
      deltaSeconds * state.covariance11 +
      processVariance * dt3 * 0.5,
    covariance10:
      state.covariance10 +
      deltaSeconds * state.covariance11 +
      processVariance * dt3 * 0.5,
    covariance11:
      state.covariance11 + processVariance * dt2,
  };
}

function correctKalmanAxis(
  predicted: KalmanAxisState,
  measurement: number,
  measurementVariance: number,
): KalmanAxisState {
  const innovationVariance =
    predicted.covariance00 + measurementVariance;
  const gain0 = predicted.covariance00 / innovationVariance;
  const gain1 = predicted.covariance10 / innovationVariance;
  const innovation = measurement - predicted.position;
  return {
    position: predicted.position + gain0 * innovation,
    velocity: predicted.velocity + gain1 * innovation,
    covariance00: (1 - gain0) * predicted.covariance00,
    covariance01: (1 - gain0) * predicted.covariance01,
    covariance10:
      predicted.covariance10 - gain1 * predicted.covariance00,
    covariance11:
      predicted.covariance11 - gain1 * predicted.covariance01,
  };
}

/**
 * A bounded, deterministic two-dimensional smoother for normalized motion points.
 *
 * Missing observations never synthesize visible output. State survives gaps no
 * longer than maxGapMs; the first observation after a longer gap starts a new
 * filter epoch at the measured coordinate.
 */
export class MotionPointSmoother {
  readonly options: Readonly<ResolvedOptions>;

  #previousTimestampMs: number | undefined;
  #lastObservedTimestampMs: number | undefined;
  #ema: { x: number; y: number } | undefined;
  #oneEuroX: OneEuroAxisState | undefined;
  #oneEuroY: OneEuroAxisState | undefined;
  #kalmanX: KalmanAxisState | undefined;
  #kalmanY: KalmanAxisState | undefined;

  constructor(options: MotionPointSmootherOptions) {
    this.options = Object.freeze(resolveOptions(options));
  }

  reset(): void {
    this.#previousTimestampMs = undefined;
    this.#lastObservedTimestampMs = undefined;
    this.#resetFilterState();
  }

  update(sample: SmoothingSample): SmoothedSample {
    validateSample(sample, this.#previousTimestampMs);
    this.#previousTimestampMs = sample.timestampMs;

    if (!sample.observed) {
      if (
        this.#lastObservedTimestampMs !== undefined &&
        sample.timestampMs - this.#lastObservedTimestampMs >
          this.options.maxGapMs
      ) {
        this.#lastObservedTimestampMs = undefined;
        this.#resetFilterState();
      }
      return { timestampMs: sample.timestampMs, observed: false };
    }

    const lastObservedTimestampMs = this.#lastObservedTimestampMs;
    const startsNewEpoch =
      lastObservedTimestampMs === undefined ||
      sample.timestampMs - lastObservedTimestampMs > this.options.maxGapMs;
    if (startsNewEpoch) this.#resetFilterState();

    const deltaSeconds =
      lastObservedTimestampMs === undefined
        ? undefined
        : (sample.timestampMs - lastObservedTimestampMs) / 1000;
    this.#lastObservedTimestampMs = sample.timestampMs;

    switch (this.options.algorithm) {
      case "passthrough":
        return { ...sample };
      case "ema":
        return this.#updateEma(sample);
      case "one-euro":
        return this.#updateOneEuro(sample, deltaSeconds);
      case "kalman":
        return this.#updateKalman(sample, deltaSeconds);
    }
  }

  #resetFilterState(): void {
    this.#ema = undefined;
    this.#oneEuroX = undefined;
    this.#oneEuroY = undefined;
    this.#kalmanX = undefined;
    this.#kalmanY = undefined;
  }

  #updateEma(sample: Extract<SmoothingSample, { observed: true }>): SmoothedSample {
    if (this.#ema === undefined) {
      this.#ema = { x: sample.x, y: sample.y };
    } else {
      this.#ema = {
        x:
          this.options.emaAlpha * sample.x +
          (1 - this.options.emaAlpha) * this.#ema.x,
        y:
          this.options.emaAlpha * sample.y +
          (1 - this.options.emaAlpha) * this.#ema.y,
      };
    }
    return {
      timestampMs: sample.timestampMs,
      observed: true,
      x: clampNormalized(this.#ema.x),
      y: clampNormalized(this.#ema.y),
    };
  }

  #updateOneEuro(
    sample: Extract<SmoothingSample, { observed: true }>,
    deltaSeconds?: number,
  ): SmoothedSample {
    if (
      this.#oneEuroX === undefined ||
      this.#oneEuroY === undefined ||
      deltaSeconds === undefined
    ) {
      this.#oneEuroX = {
        raw: sample.x,
        filtered: sample.x,
        filteredDerivative: 0,
      };
      this.#oneEuroY = {
        raw: sample.y,
        filtered: sample.y,
        filteredDerivative: 0,
      };
    } else {
      this.#oneEuroX = updateOneEuroAxis(
        this.#oneEuroX,
        sample.x,
        deltaSeconds,
        this.options,
      );
      this.#oneEuroY = updateOneEuroAxis(
        this.#oneEuroY,
        sample.y,
        deltaSeconds,
        this.options,
      );
    }
    return {
      timestampMs: sample.timestampMs,
      observed: true,
      x: clampNormalized(this.#oneEuroX.filtered),
      y: clampNormalized(this.#oneEuroY.filtered),
    };
  }

  #updateKalman(
    sample: Extract<SmoothingSample, { observed: true }>,
    deltaSeconds?: number,
  ): SmoothedSample {
    if (
      this.#kalmanX === undefined ||
      this.#kalmanY === undefined ||
      deltaSeconds === undefined
    ) {
      this.#kalmanX = createKalmanAxis(sample.x);
      this.#kalmanY = createKalmanAxis(sample.y);
    } else {
      this.#kalmanX = correctKalmanAxis(
        predictKalmanAxis(
          this.#kalmanX,
          deltaSeconds,
          this.options.kalmanProcessVariance,
        ),
        sample.x,
        this.options.kalmanMeasurementVariance,
      );
      this.#kalmanY = correctKalmanAxis(
        predictKalmanAxis(
          this.#kalmanY,
          deltaSeconds,
          this.options.kalmanProcessVariance,
        ),
        sample.y,
        this.options.kalmanMeasurementVariance,
      );
    }
    return {
      timestampMs: sample.timestampMs,
      observed: true,
      x: clampNormalized(this.#kalmanX.position),
      y: clampNormalized(this.#kalmanY.position),
    };
  }
}
