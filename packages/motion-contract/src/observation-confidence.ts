export const OBSERVATION_CONFIDENCE_GATE_VERSION =
  "fail-closed-confidence-rearm/v1" as const;

export const OBSERVATION_CONFIDENCE_GATE_DEFAULTS = Object.freeze({
  releaseConfidence: 0.5,
  acquireConfidence: 0.75,
  acquireSamples: 3,
});

export interface ObservationConfidenceGateOptions {
  releaseConfidence?: number;
  acquireConfidence?: number;
  acquireSamples?: number;
}

export interface ObservationConfidenceSample {
  timestampMs: number;
  providerObserved: boolean;
  confidence: number;
}

export type ObservationConfidenceReason =
  | "observed"
  | "blocked-provider"
  | "blocked-confidence"
  | "rearming";

export interface ObservationConfidenceUpdate {
  timestampMs: number;
  observed: boolean;
  reason: ObservationConfidenceReason;
  consecutiveAcquireSamples: number;
}

function requireExactKeys(
  value: object,
  allowed: readonly string[],
  name: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${name} contains unknown keys: ${unknown.join(", ")}`);
  }
}

function boundedConfidence(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1) {
    throw new Error(`${name} must be a finite number between 0 and 1`);
  }
  return resolved;
}

function boundedAcquireSamples(value: number | undefined): number {
  const resolved =
    value ?? OBSERVATION_CONFIDENCE_GATE_DEFAULTS.acquireSamples;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 120) {
    throw new Error("acquireSamples must be an integer between 1 and 120");
  }
  return resolved;
}

/**
 * Research-only per-landmark observation gate.
 *
 * Loss is immediate. Restoration requires consecutive high-confidence
 * provider-observed samples. The gate does not choose provider thresholds,
 * extrapolate a landmark, or grant action authority.
 */
export class ObservationConfidenceGate {
  readonly releaseConfidence: number;
  readonly acquireConfidence: number;
  readonly acquireSamples: number;

  #observed = false;
  #consecutiveAcquireSamples = 0;
  #lastTimestampMs: number | undefined;

  constructor(options: ObservationConfidenceGateOptions = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw new Error("observation confidence gate options must be an object");
    }
    requireExactKeys(
      options,
      ["releaseConfidence", "acquireConfidence", "acquireSamples"],
      "observation confidence gate options",
    );
    this.releaseConfidence = boundedConfidence(
      options.releaseConfidence,
      OBSERVATION_CONFIDENCE_GATE_DEFAULTS.releaseConfidence,
      "releaseConfidence",
    );
    this.acquireConfidence = boundedConfidence(
      options.acquireConfidence,
      OBSERVATION_CONFIDENCE_GATE_DEFAULTS.acquireConfidence,
      "acquireConfidence",
    );
    if (this.acquireConfidence < this.releaseConfidence) {
      throw new Error(
        "acquireConfidence must be greater than or equal to releaseConfidence",
      );
    }
    this.acquireSamples = boundedAcquireSamples(options.acquireSamples);
  }

  update(sample: ObservationConfidenceSample): ObservationConfidenceUpdate {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      throw new Error("observation confidence sample must be an object");
    }
    requireExactKeys(
      sample,
      ["timestampMs", "providerObserved", "confidence"],
      "observation confidence sample",
    );
    if (
      !Number.isFinite(sample.timestampMs) ||
      sample.timestampMs < 0 ||
      (this.#lastTimestampMs !== undefined &&
        sample.timestampMs <= this.#lastTimestampMs)
    ) {
      throw new Error(
        "timestampMs must be finite, non-negative, and strictly increasing",
      );
    }
    if (typeof sample.providerObserved !== "boolean") {
      throw new Error("providerObserved must be boolean");
    }
    boundedConfidence(sample.confidence, sample.confidence, "confidence");
    this.#lastTimestampMs = sample.timestampMs;

    if (!sample.providerObserved) {
      return this.#block(sample.timestampMs, "blocked-provider");
    }
    if (sample.confidence < this.releaseConfidence) {
      return this.#block(sample.timestampMs, "blocked-confidence");
    }
    if (this.#observed) {
      return {
        timestampMs: sample.timestampMs,
        observed: true,
        reason: "observed",
        consecutiveAcquireSamples: this.acquireSamples,
      };
    }
    if (sample.confidence < this.acquireConfidence) {
      this.#consecutiveAcquireSamples = 0;
      return {
        timestampMs: sample.timestampMs,
        observed: false,
        reason: "blocked-confidence",
        consecutiveAcquireSamples: 0,
      };
    }
    this.#consecutiveAcquireSamples += 1;
    if (this.#consecutiveAcquireSamples < this.acquireSamples) {
      return {
        timestampMs: sample.timestampMs,
        observed: false,
        reason: "rearming",
        consecutiveAcquireSamples: this.#consecutiveAcquireSamples,
      };
    }
    this.#observed = true;
    return {
      timestampMs: sample.timestampMs,
      observed: true,
      reason: "observed",
      consecutiveAcquireSamples: this.acquireSamples,
    };
  }

  reset(): void {
    this.#observed = false;
    this.#consecutiveAcquireSamples = 0;
    this.#lastTimestampMs = undefined;
  }

  #block(
    timestampMs: number,
    reason: "blocked-provider" | "blocked-confidence",
  ): ObservationConfidenceUpdate {
    this.#observed = false;
    this.#consecutiveAcquireSamples = 0;
    return {
      timestampMs,
      observed: false,
      reason,
      consecutiveAcquireSamples: 0,
    };
  }
}
