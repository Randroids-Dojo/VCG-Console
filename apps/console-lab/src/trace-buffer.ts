import { MotionTraceSchema, type MotionFrame, type MotionTrace } from "@vcg/motion-contract";

export class TraceBuffer {
  readonly #frames: MotionFrame[] = [];

  constructor(private readonly capacity = 600) {}

  push(frame: MotionFrame): void {
    this.#frames.push(structuredClone(frame));
    if (this.#frames.length > this.capacity) this.#frames.splice(0, this.#frames.length - this.capacity);
  }

  clear(): void {
    this.#frames.length = 0;
  }

  snapshot(): MotionTrace {
    return MotionTraceSchema.parse({
      format: "vcg-motion-trace",
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      containsRawFrames: false,
      frames: this.#frames,
    });
  }

  get size(): number {
    return this.#frames.length;
  }
}
