export type TrackingLossEvent = "freeze" | "recovered" | "show-recovery";

export class TrackingLossController {
  #lastSeenAt = 0;
  #confirmedLostAt = 0;
  #frozen = false;

  constructor(
    private readonly confirmationMs = 300,
    private readonly reacquisitionMs = 2_000,
  ) {}

  update(nowMs: number, playerVisible: boolean, sessionActive: boolean): TrackingLossEvent | undefined {
    if (!sessionActive) {
      this.reset();
      return undefined;
    }
    if (playerVisible) {
      this.#lastSeenAt = nowMs;
      if (this.#frozen && nowMs - this.#confirmedLostAt <= this.reacquisitionMs) {
        this.#frozen = false;
        this.#confirmedLostAt = 0;
        return "recovered";
      }
      return undefined;
    }
    if (this.#lastSeenAt === 0) this.#lastSeenAt = nowMs;
    if (!this.#frozen && nowMs - this.#lastSeenAt >= this.confirmationMs) {
      this.#frozen = true;
      this.#confirmedLostAt = nowMs;
      return "freeze";
    }
    if (this.#frozen && this.#confirmedLostAt > 0 && nowMs - this.#confirmedLostAt >= this.reacquisitionMs) {
      this.#confirmedLostAt = 0;
      return "show-recovery";
    }
    return undefined;
  }

  reset(): void {
    this.#lastSeenAt = 0;
    this.#confirmedLostAt = 0;
    this.#frozen = false;
  }
}
