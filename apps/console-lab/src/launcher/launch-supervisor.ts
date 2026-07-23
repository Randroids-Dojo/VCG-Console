import type { LaunchSession, LaunchStatus } from "./types";

export interface LaunchSupervisorOptions {
  slowAfterMs: number;
  timeoutMs: number;
  heartbeatTimeoutMs: number;
  pollMs?: number;
  now?: () => number;
}

type LaunchListener = (session: LaunchSession) => void;

const TERMINAL_STATES = new Set<LaunchStatus>(["ready", "offline", "hung", "crashed", "recovered", "unavailable"]);

export class LaunchSupervisor {
  readonly #base: LaunchSession;
  readonly #options: Required<Omit<LaunchSupervisorOptions, "now">>;
  readonly #now: () => number;
  readonly #listeners = new Set<LaunchListener>();
  #session: LaunchSession;
  #attempt = 0;
  #lastHealthAt = 0;
  #monitor: ReturnType<typeof setInterval> | undefined;

  constructor(base: LaunchSession, options: LaunchSupervisorOptions) {
    for (const [name, value] of Object.entries({
      slowAfterMs: options.slowAfterMs,
      timeoutMs: options.timeoutMs,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs,
    })) {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
    }
    if (options.slowAfterMs >= options.timeoutMs) throw new Error("slowAfterMs must be lower than timeoutMs");
    this.#base = structuredClone(base);
    this.#options = {
      slowAfterMs: options.slowAfterMs,
      timeoutMs: options.timeoutMs,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs,
      pollMs: options.pollMs ?? 100,
    };
    if (!Number.isFinite(this.#options.pollMs) || this.#options.pollMs < 0) throw new Error("pollMs must be a non-negative finite number");
    this.#now = options.now ?? Date.now;
    this.#session = structuredClone(base);
  }

  get snapshot(): LaunchSession {
    return structuredClone(this.#session);
  }

  subscribe(listener: LaunchListener): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }

  start(): void {
    this.#attempt += 1;
    const now = this.#now();
    this.#lastHealthAt = now;
    this.#session = {
      ...structuredClone(this.#base),
      status: this.#attempt > 1 ? "recovering" : "loading",
      startedAt: now,
      activePhase: 0,
      ...(this.#base.progress === undefined ? {} : { progress: 0 }),
      detail: this.#attempt > 1 ? "Retrying launch" : this.#base.phases[0]?.label ?? "Starting launch",
      canRetry: false,
      diagnostics: this.#diagnostics(this.#attempt > 1 ? "RETRY_STARTED" : "LAUNCH_STARTED", "launch started", now),
    };
    this.#emit();
    this.#startMonitor();
  }

  advance(activePhase: number, detail: string, progress?: number): void {
    if (TERMINAL_STATES.has(this.#session.status)) return;
    if (!Number.isInteger(activePhase) || activePhase < 0 || activePhase >= this.#session.phases.length) {
      throw new Error("activePhase must reference an existing launch phase");
    }
    if (progress !== undefined && (!Number.isFinite(progress) || progress < 0 || progress > 1)) {
      throw new Error("progress must be between zero and one");
    }
    const now = this.#now();
    this.#lastHealthAt = now;
    this.#update({
      activePhase,
      detail,
      ...(progress === undefined ? {} : { progress }),
      diagnostics: this.#diagnostics("PHASE_ADVANCED", `phase ${activePhase + 1}`, now),
    });
  }

  heartbeat(detail = "Launch heartbeat received"): void {
    if (TERMINAL_STATES.has(this.#session.status)) return;
    const now = this.#now();
    this.#lastHealthAt = now;
    this.#update({ detail, diagnostics: this.#diagnostics("HEARTBEAT", "heartbeat", now) });
  }

  ready(detail = "Session ready"): void {
    if (TERMINAL_STATES.has(this.#session.status)) return;
    const now = this.#now();
    const recovered = this.#attempt > 1;
    this.#update({
      status: recovered ? "recovered" : "ready",
      activePhase: Math.max(0, this.#session.phases.length - 1),
      ...(this.#session.progress === undefined ? {} : { progress: 1 }),
      detail,
      canRetry: false,
      diagnostics: this.#diagnostics(recovered ? "LAUNCH_RECOVERED" : "LAUNCH_READY", recovered ? "recovered" : "ready", now),
    });
    this.#stopMonitor();
  }

  offline(detail = "No network connection"): void {
    this.#fail("offline", "NETWORK_OFFLINE", detail);
  }

  crash(detail = "Game process exited before it became ready", code = "PROCESS_EXIT"): void {
    this.#fail("crashed", code, detail);
  }

  unavailable(detail: string, code = "HOST_UNAVAILABLE"): void {
    this.#fail("unavailable", code, detail);
  }

  retry(): void {
    if (!this.#session.canRetry) return;
    this.#stopMonitor();
    this.start();
  }

  evaluate(): void {
    if (TERMINAL_STATES.has(this.#session.status)) return;
    const now = this.#now();
    const elapsed = now - this.#session.startedAt;
    const silentFor = now - this.#lastHealthAt;
    if (silentFor >= this.#options.heartbeatTimeoutMs) {
      this.#fail("hung", "HEARTBEAT_TIMEOUT", `No launch signal for ${Math.round(silentFor)} ms`);
    } else if (elapsed >= this.#options.timeoutMs) {
      this.#fail("hung", "LAUNCH_TIMEOUT", `Launch exceeded its ${this.#options.timeoutMs} ms budget`);
    } else if (elapsed >= this.#options.slowAfterMs && this.#session.status !== "slow") {
      this.#update({
        status: "slow",
        detail: "Still working · you can keep waiting or go back",
        diagnostics: this.#diagnostics("LAUNCH_SLOW", "slow threshold reached", now),
      });
    }
  }

  dispose(): void {
    this.#stopMonitor();
    this.#listeners.clear();
  }

  #fail(status: Extract<LaunchStatus, "offline" | "hung" | "crashed" | "unavailable">, code: string, detail: string): void {
    if (TERMINAL_STATES.has(this.#session.status)) return;
    const now = this.#now();
    this.#update({ status, detail, canRetry: true, diagnostics: this.#diagnostics(code, status, now) });
    this.#stopMonitor();
  }

  #diagnostics(code: string, lastSignal: string, lastSignalAt: number): NonNullable<LaunchSession["diagnostics"]> {
    return {
      code,
      attempt: this.#attempt,
      lastSignal,
      lastSignalAt,
      timeoutMs: this.#options.timeoutMs,
      heartbeatTimeoutMs: this.#options.heartbeatTimeoutMs,
    };
  }

  #update(update: Partial<LaunchSession>): void {
    this.#session = { ...this.#session, ...update };
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.snapshot);
  }

  #startMonitor(): void {
    this.#stopMonitor();
    if (this.#options.pollMs === 0) return;
    this.#monitor = setInterval(() => this.evaluate(), this.#options.pollMs);
  }

  #stopMonitor(): void {
    if (this.#monitor === undefined) return;
    clearInterval(this.#monitor);
    this.#monitor = undefined;
  }
}
