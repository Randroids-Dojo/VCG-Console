export class FrameGate {
  #busy = false;
  #droppedFrames = 0;

  get droppedFrames(): number {
    return this.#droppedFrames;
  }

  tryAcquire(): boolean {
    if (this.#busy) {
      this.#droppedFrames += 1;
      return false;
    }
    this.#busy = true;
    return true;
  }

  release(): void {
    this.#busy = false;
  }

  reset(): void {
    this.#busy = false;
    this.#droppedFrames = 0;
  }
}
