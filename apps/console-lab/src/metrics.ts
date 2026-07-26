import type { MotionFrame } from "@vcg/motion-contract";

const MAX_METRIC_SAMPLES = 600;

type TimestampQuality = MotionFrame["capabilities"]["timestampQuality"];

export interface SourceTimingSnapshot {
  readonly boundaryLabel: string;
  readonly disclosure: string;
  readonly invalidSamples: number;
  readonly p95: number | null;
  readonly timestampQuality: TimestampQuality | null;
  readonly validSamples: number;
}

export interface MetricsSnapshot {
  readonly fps: number;
  readonly inferenceInvalidSamples: number;
  readonly inferenceP50: number | null;
  readonly inferenceP95: number | null;
  readonly sourceTiming: SourceTimingSnapshot;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

function timingPresentation(timestampQuality: TimestampQuality | null): Readonly<{
  boundaryLabel: string;
  disclosure: string;
}> {
  switch (timestampQuality) {
    case "camera-exposure":
      return {
        boundaryLabel: "EXPOSURE TO FRAME P95",
        disclosure:
          "Camera exposure to Motion frame publication. This ends before recognized-action receipt and cannot alone qualify the 120 ms exposure-to-action gate.",
      };
    case "capture-arrival":
      return {
        boundaryLabel: "ARRIVAL TO FRAME P95",
        disclosure:
          "Browser capture arrival to Motion frame publication. Camera exposure and capture transport are outside this boundary, so it cannot qualify the 120 ms exposure-to-action gate.",
      };
    case "replay":
      return {
        boundaryLabel: "REPLAY TO FRAME P95",
        disclosure:
          "Replay source time to Motion frame publication. This is camera-free diagnostic timing, not live camera or exposure-to-action latency.",
      };
    default:
      return {
        boundaryLabel: "SOURCE TO FRAME P95",
        disclosure:
          "No source timing samples are available. This diagnostic never substitutes for exposure-to-action qualification.",
      };
  }
}

export class Metrics {
  readonly #inferenceMs: number[] = [];
  readonly #sourceToPublishMs: number[] = [];
  readonly #now: () => number;
  #firstFrameAt = 0;
  #lastFrameAt = 0;
  #frames = 0;
  #inferenceInvalidSamples = 0;
  #sourceTimingInvalidSamples = 0;
  #timestampQuality: TimestampQuality | null = null;

  constructor(now: () => number = () => performance.now()) {
    this.#now = now;
  }

  push(frame: MotionFrame): void {
    const observedAt = this.#now();
    if (this.#frames === 0) this.#firstFrameAt = observedAt;
    this.#lastFrameAt = observedAt;
    this.#frames += 1;

    const inferenceMs =
      frame.inferenceCompletedAtMs - frame.inferenceStartedAtMs;
    if (Number.isFinite(inferenceMs) && inferenceMs >= 0) {
      this.#inferenceMs.push(inferenceMs);
      if (this.#inferenceMs.length > MAX_METRIC_SAMPLES) {
        this.#inferenceMs.shift();
      }
    } else {
      this.#inferenceInvalidSamples += 1;
    }

    const timestampQuality = frame.capabilities.timestampQuality;
    if (
      this.#timestampQuality !== null &&
      this.#timestampQuality !== timestampQuality
    ) {
      this.#sourceToPublishMs.length = 0;
      this.#sourceTimingInvalidSamples = 0;
    }
    this.#timestampQuality = timestampQuality;

    const sourceToPublishMs = frame.publishedAtMs - frame.sourceTimestampMs;
    if (Number.isFinite(sourceToPublishMs) && sourceToPublishMs >= 0) {
      this.#sourceToPublishMs.push(sourceToPublishMs);
      if (this.#sourceToPublishMs.length > MAX_METRIC_SAMPLES) {
        this.#sourceToPublishMs.shift();
      }
    } else {
      this.#sourceTimingInvalidSamples += 1;
    }
  }

  snapshot(): MetricsSnapshot {
    const elapsedSeconds = Math.max(0.001, (this.#lastFrameAt - this.#firstFrameAt) / 1000);
    const presentation = timingPresentation(this.#timestampQuality);
    const invalidDisclosure =
      this.#sourceTimingInvalidSamples === 0 &&
      this.#inferenceInvalidSamples === 0
        ? ""
        : ` Omitted ${this.#sourceTimingInvalidSamples} source-timing and ${this.#inferenceInvalidSamples} inference sample(s) with invalid timestamp order.`;
    return {
      fps: this.#frames <= 1 ? 0 : (this.#frames - 1) / elapsedSeconds,
      inferenceInvalidSamples: this.#inferenceInvalidSamples,
      inferenceP50:
        this.#inferenceMs.length === 0
          ? null
          : percentile(this.#inferenceMs, 0.5),
      inferenceP95:
        this.#inferenceMs.length === 0
          ? null
          : percentile(this.#inferenceMs, 0.95),
      sourceTiming: {
        boundaryLabel: presentation.boundaryLabel,
        disclosure: presentation.disclosure + invalidDisclosure,
        invalidSamples: this.#sourceTimingInvalidSamples,
        p95:
          this.#sourceToPublishMs.length === 0
            ? null
            : percentile(this.#sourceToPublishMs, 0.95),
        timestampQuality: this.#timestampQuality,
        validSamples: this.#sourceToPublishMs.length,
      },
    };
  }

  reset(): void {
    this.#inferenceMs.length = 0;
    this.#sourceToPublishMs.length = 0;
    this.#firstFrameAt = 0;
    this.#lastFrameAt = 0;
    this.#frames = 0;
    this.#inferenceInvalidSamples = 0;
    this.#sourceTimingInvalidSamples = 0;
    this.#timestampQuality = null;
  }
}
