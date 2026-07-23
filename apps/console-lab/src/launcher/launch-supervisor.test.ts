import { describe, expect, it } from "vitest";
import { LaunchSupervisor, type LaunchSupervisorOptions } from "./launch-supervisor";
import type { LaunchSession } from "./types";

function session(): LaunchSession {
  return {
    adapter: "local-web",
    adapterLabel: "LOCAL WEB",
    title: "Obstacle",
    context: "TEST",
    phases: [
      { label: "Check", detail: "Check package" },
      { label: "Start", detail: "Start session" },
    ],
    activePhase: 0,
    status: "loading",
    startedAt: 0,
    progress: 0,
    detail: "Check",
  };
}

function harness(overrides: Partial<LaunchSupervisorOptions> = {}) {
  let now = 1_000;
  const supervisor = new LaunchSupervisor(session(), {
    slowAfterMs: 200,
    timeoutMs: 1_000,
    heartbeatTimeoutMs: 500,
    pollMs: 0,
    now: () => now,
    ...overrides,
  });
  return { supervisor, setNow(value: number) { now = value; } };
}

describe("LaunchSupervisor", () => {
  it("distinguishes slow work from a silent hang", () => {
    const { supervisor, setNow } = harness();
    supervisor.start();
    setNow(1_201);
    supervisor.evaluate();
    expect(supervisor.snapshot).toMatchObject({ status: "slow", canRetry: false, diagnostics: { code: "LAUNCH_SLOW" } });

    setNow(1_501);
    supervisor.evaluate();
    expect(supervisor.snapshot).toMatchObject({ status: "hung", canRetry: true, diagnostics: { code: "HEARTBEAT_TIMEOUT" } });
  });

  it("uses health signals while retaining the absolute launch budget", () => {
    const { supervisor, setNow } = harness({ heartbeatTimeoutMs: 700 });
    supervisor.start();
    setNow(1_600);
    supervisor.heartbeat();
    setNow(2_001);
    supervisor.evaluate();
    expect(supervisor.snapshot).toMatchObject({ status: "hung", diagnostics: { code: "LAUNCH_TIMEOUT" } });
  });

  it("reports offline and process-crash failures separately", () => {
    const offline = harness().supervisor;
    offline.start();
    offline.offline();
    expect(offline.snapshot).toMatchObject({ status: "offline", diagnostics: { code: "NETWORK_OFFLINE" } });

    const crashed = harness().supervisor;
    crashed.start();
    crashed.crash("Process exited with code 137", "PROCESS_EXIT_137");
    expect(crashed.snapshot).toMatchObject({ status: "crashed", diagnostics: { code: "PROCESS_EXIT_137" } });
  });

  it("marks a successful retry as recovered", () => {
    const { supervisor, setNow } = harness();
    supervisor.start();
    supervisor.crash();
    setNow(2_000);
    supervisor.retry();
    supervisor.advance(1, "Host restarted", 0.5);
    supervisor.ready("Game recovered and is ready");
    expect(supervisor.snapshot).toMatchObject({
      status: "recovered",
      progress: 1,
      detail: "Game recovered and is ready",
      diagnostics: { code: "LAUNCH_RECOVERED", attempt: 2 },
    });
  });

  it("ignores late health and ready signals after a terminal failure", () => {
    const supervisor = harness().supervisor;
    supervisor.start();
    supervisor.crash("Process exited", "PROCESS_EXIT_1");
    supervisor.advance(1, "late phase", 0.5);
    supervisor.heartbeat("late heartbeat");
    supervisor.ready("late ready");
    expect(supervisor.snapshot).toMatchObject({
      status: "crashed",
      activePhase: 0,
      progress: 0,
      detail: "Process exited",
      diagnostics: { code: "PROCESS_EXIT_1" },
    });
  });

  it("validates phase and progress updates", () => {
    const supervisor = harness().supervisor;
    supervisor.start();
    expect(() => supervisor.advance(2, "invalid")).toThrow(/existing launch phase/);
    expect(() => supervisor.advance(1, "invalid", Number.NaN)).toThrow(/between zero and one/);
  });
});
