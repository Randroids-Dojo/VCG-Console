import type { MotionFrame } from "@vcg/motion-contract";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

export class Metrics {
  readonly #inferenceMs: number[] = [];
  readonly #pipelineMs: number[] = [];
  #firstFrameAt = 0;
  #lastFrameAt = 0;
  #frames = 0;

  push(frame: MotionFrame): void {
    if (this.#firstFrameAt === 0) this.#firstFrameAt = performance.now();
    this.#lastFrameAt = performance.now();
    this.#frames += 1;
    this.#inferenceMs.push(frame.inferenceCompletedAtMs - frame.inferenceStartedAtMs);
    this.#pipelineMs.push(frame.publishedAtMs - frame.sourceTimestampMs);
    if (this.#inferenceMs.length > 600) this.#inferenceMs.shift();
    if (this.#pipelineMs.length > 600) this.#pipelineMs.shift();
  }

  snapshot() {
    const elapsedSeconds = Math.max(0.001, (this.#lastFrameAt - this.#firstFrameAt) / 1000);
    return {
      fps: this.#frames <= 1 ? 0 : (this.#frames - 1) / elapsedSeconds,
      inferenceP50: percentile(this.#inferenceMs, 0.5),
      inferenceP95: percentile(this.#inferenceMs, 0.95),
      pipelineP95: percentile(this.#pipelineMs, 0.95),
    };
  }

  reset(): void {
    this.#inferenceMs.length = 0;
    this.#pipelineMs.length = 0;
    this.#firstFrameAt = 0;
    this.#lastFrameAt = 0;
    this.#frames = 0;
  }
}
