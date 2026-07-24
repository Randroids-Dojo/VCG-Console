import { describe, expect, it } from "vitest";
import {
  BootMaintenanceGate,
  POWER_CONFIRMATION_WINDOW_MS,
  POWER_QUIESCE_GATES,
  POWER_QUIESCE_WINDOW_MS,
  POWER_WAKE_GATES,
  POWER_WAKE_WINDOW_MS,
  PowerLifecycleController,
  type PhysicalServiceEvidence,
  type PowerOperationRef,
  type PowerQuiesceGate,
  type PowerWakeGate,
} from "./power-lifecycle";

const POWER_EPOCH = 77;

function operation(
  operationId: number,
  epoch = POWER_EPOCH,
): PowerOperationRef {
  return { epoch, operationId };
}

function completeQuiesce(
  controller: PowerLifecycleController,
  operationId: number,
  startMs: number,
): void {
  POWER_QUIESCE_GATES.forEach((gate, index) => {
    controller.acknowledgeQuiesce(
      operation(operationId),
      gate,
      startMs + index,
    );
  });
}

function enterIdle(
  controller: PowerLifecycleController,
  startMs = 0,
): number {
  const request = controller.requestIdle("physical-power-button", startMs);
  const operationId = request.pendingOperation?.operation.operationId;
  if (operationId === undefined) throw new Error("missing idle operation");
  completeQuiesce(controller, operationId, startMs + 1);
  controller.startPlatformTransition(
    operation(operationId),
    startMs + POWER_QUIESCE_GATES.length + 1,
  );
  return operationId;
}

function evidence(
  bootId: number,
  sequence: number,
  signal: PhysicalServiceEvidence["signal"],
): PhysicalServiceEvidence {
  return {
    bootId,
    sequence,
    source: "platform-service-button",
    signal,
  };
}

describe("PowerLifecycleController", () => {
  it("starts active and maps idle to the selected tier strategy", () => {
    const suspend = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    expect(suspend.snapshot()).toEqual({
      phase: "active",
      idleStrategy: "platform-suspend",
      operationEpoch: POWER_EPOCH,
      canAdmitLaunch: true,
    });

    const request = suspend.requestIdle("physical-power-button", 100);
    expect(request).toMatchObject({
      phase: "quiescing",
      canAdmitLaunch: false,
      pendingOperation: {
        operation: operation(1),
        action: "idle",
        deadlineAtMs: 100 + POWER_QUIESCE_WINDOW_MS,
      },
    });
    completeQuiesce(suspend, 1, 101);
    expect(suspend.snapshot()).toMatchObject({
      phase: "transition-ready",
      readyTransition: {
        operation: operation(1),
        target: "platform-suspend",
      },
    });

    const pi = new PowerLifecycleController(
      "low-power-launcher-idle",
      POWER_EPOCH,
    );
    pi.requestIdle("local-console-ui", 0);
    completeQuiesce(pi, 1, 1);
    expect(pi.snapshot().readyTransition?.target).toBe(
      "low-power-launcher-idle",
    );
  });

  it("maps a short physical power press to idle and wake only", () => {
    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    expect(controller.shortPressPowerButton(0)).toMatchObject({
      phase: "quiescing",
      pendingOperation: { action: "idle" },
    });
    expect(() => controller.shortPressPowerButton(1)).toThrow(
      "unavailable during a transition",
    );
    completeQuiesce(controller, 1, 2);
    controller.startPlatformTransition(operation(1), 20);
    expect(controller.shortPressPowerButton(21)).toMatchObject({
      phase: "waking",
      pendingOperation: {
        action: "wake",
        wakeSource: "physical-power-button",
      },
    });
  });

  it("requires launch admission to close first and every exact quiesce gate", () => {
    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    controller.requestIdle("physical-power-button", 0);

    expect(() =>
      controller.acknowledgeQuiesce(operation(1), "tracker-stopped", 1),
    ).toThrow("launch admission");
    expect(controller.snapshot().pendingOperation?.acknowledged).toEqual([]);

    controller.acknowledgeQuiesce(
      operation(1),
      "launch-admission-closed",
      2,
    );
    for (const gate of POWER_QUIESCE_GATES.slice(1, -1)) {
      controller.acknowledgeQuiesce(operation(1), gate, 3);
    }
    expect(controller.snapshot()).toMatchObject({
      phase: "quiescing",
      pendingOperation: { missing: ["update-state-safe"] },
    });
    expect(() => controller.startPlatformTransition(operation(1), 4)).toThrow(
      "transition is ready",
    );

    controller.acknowledgeQuiesce(operation(1), "update-state-safe", 5);
    expect(controller.snapshot().phase).toBe("transition-ready");
  });

  it("binds restart and shutdown confirmation to one live operation", () => {
    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
      20,
    );
    expect(controller.requestExplicitTransition("restart", 1_000)).toMatchObject({
      phase: "confirming",
      canAdmitLaunch: true,
      pendingConfirmation: {
        operation: operation(20),
        action: "restart",
        expiresAtMs: 1_000 + POWER_CONFIRMATION_WINDOW_MS,
      },
    });

    expect(() =>
      controller.confirmExplicitTransition(operation(19), 1_001),
    ).toThrow(
      "matching live",
    );
    expect(controller.cancelExplicitTransition(operation(20)).phase).toBe(
      "active",
    );
    expect(() =>
      controller.confirmExplicitTransition(operation(20), 1_002),
    ).toThrow(
      "matching live",
    );

    const shutdown = controller.requestExplicitTransition("shutdown", 1_003);
    expect(shutdown.pendingConfirmation?.operation.operationId).toBe(21);
    expect(
      controller.confirmExplicitTransition(operation(21), 1_004),
    ).toMatchObject({
      phase: "quiescing",
      canAdmitLaunch: false,
      pendingOperation: { operation: operation(21), action: "shutdown" },
    });
    expect(() => controller.cancelExplicitTransition(operation(21))).toThrow(
      "confirmation to cancel",
    );
  });

  it("expires an unconfirmed request without taking power action", () => {
    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    controller.requestExplicitTransition("shutdown", 100);
    expect(
      controller.snapshot(100 + POWER_CONFIRMATION_WINDOW_MS),
    ).toEqual({
      phase: "active",
      idleStrategy: "platform-suspend",
      operationEpoch: POWER_EPOCH,
      canAdmitLaunch: true,
    });
    expect(() =>
      controller.confirmExplicitTransition(
        operation(1),
        100 + POWER_CONFIRMATION_WINDOW_MS + 1,
      ),
    ).toThrow("matching live");
  });

  it("rejects stale, cross-operation, and unknown acknowledgements", () => {
    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
      10,
    );
    controller.requestIdle("physical-power-button", 0);

    expect(() =>
      controller.acknowledgeQuiesce(
        operation(9),
        "launch-admission-closed",
        1,
      ),
    ).toThrow("matching quiesce");
    expect(() =>
      controller.acknowledgeQuiesce(
        operation(10, POWER_EPOCH - 1),
        "launch-admission-closed",
        2,
      ),
    ).toThrow("wrong coordinator epoch");
    expect(() =>
      controller.acknowledgeQuiesce(
        operation(10),
        "invented" as PowerQuiesceGate,
        3,
      ),
    ).toThrow("unknown quiesce");
    expect(controller.snapshot().pendingOperation?.acknowledged).toEqual([]);
  });

  it("moves an incomplete or explicitly failed operation to a terminal fault", () => {
    const timed = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    timed.requestIdle("physical-power-button", 1);
    expect(timed.snapshot(1 + POWER_QUIESCE_WINDOW_MS)).toMatchObject({
      phase: "fault",
      canAdmitLaunch: false,
      fault: {
        operation: operation(1),
        action: "idle",
        code: "DEADLINE_EXPIRED",
      },
    });
    expect(() => timed.requestIdle("physical-power-button", 70_000)).toThrow(
      "active phase",
    );

    const failed = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    failed.requestIdle("physical-power-button", 0);
    expect(
      failed.failOperation(operation(1), "UNSAFE_UPDATE_STATE", 1),
    ).toMatchObject({
      phase: "fault",
      fault: { code: "UNSAFE_UPDATE_STATE" },
    });
    expect(() => failed.startPlatformTransition(operation(1), 2)).toThrow(
      "transition is ready",
    );
  });

  it("expires a ready transition that the platform never starts", () => {
    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    controller.requestIdle("physical-power-button", 10);
    completeQuiesce(controller, 1, 11);
    expect(controller.snapshot().phase).toBe("transition-ready");
    expect(controller.snapshot(10 + POWER_QUIESCE_WINDOW_MS)).toMatchObject({
      phase: "fault",
      fault: {
        operation: operation(1),
        action: "idle",
        code: "DEADLINE_EXPIRED",
      },
    });
  });

  it("enters idle only after exact handoff and requires bounded wake readiness", () => {
    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    enterIdle(controller, 10);
    expect(controller.snapshot()).toMatchObject({
      phase: "idle",
      canAdmitLaunch: false,
    });

    const waking = controller.requestWake("controller", 100);
    expect(waking).toMatchObject({
      phase: "waking",
      pendingOperation: {
        operation: operation(2),
        action: "wake",
        wakeSource: "controller",
        deadlineAtMs: 100 + POWER_WAKE_WINDOW_MS,
      },
    });
    expect(() =>
      controller.acknowledgeWake(operation(1), "launcher-ready", 101),
    ).toThrow("matching wake");
    for (const gate of POWER_WAKE_GATES) {
      controller.acknowledgeWake(operation(2), gate, 102);
    }
    expect(controller.snapshot()).toEqual({
      phase: "active",
      idleStrategy: "platform-suspend",
      operationEpoch: POWER_EPOCH,
      canAdmitLaunch: true,
    });
  });

  it("rejects unsupported wake sources and gates without mutating idle", () => {
    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    enterIdle(controller);
    expect(() =>
      controller.requestWake("browser-script" as never, 100),
    ).toThrow("wake source");
    expect(controller.snapshot().phase).toBe("idle");

    controller.requestWake("physical-power-button", 101);
    expect(() =>
      controller.acknowledgeWake(
        operation(2),
        "camera-ready" as PowerWakeGate,
        102,
      ),
    ).toThrow("unknown wake gate");
    expect(controller.snapshot().pendingOperation?.acknowledged).toEqual([]);
  });

  it("hands restart or shutdown to the platform once and admits nothing later", () => {
    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    controller.requestExplicitTransition("restart", 0);
    controller.confirmExplicitTransition(operation(1), 1);
    completeQuiesce(controller, 1, 2);
    expect(
      controller.startPlatformTransition(operation(1), 20),
    ).toMatchObject({
      phase: "power-transfer",
      canAdmitLaunch: false,
      pendingOperation: { operation: operation(1), action: "restart" },
    });
    expect(() => controller.startPlatformTransition(operation(1), 21)).toThrow(
      "transition is ready",
    );
    expect(() => controller.requestIdle("physical-power-button", 22)).toThrow(
      "active phase",
    );
  });

  it("records emergency power loss without claiming safe quiescence", () => {
    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    controller.requestExplicitTransition("shutdown", 0);
    expect(controller.observeUncleanPowerLoss()).toEqual({
      phase: "power-lost",
      idleStrategy: "platform-suspend",
      operationEpoch: POWER_EPOCH,
      canAdmitLaunch: false,
    });
    expect(() =>
      controller.confirmExplicitTransition(operation(1), 1),
    ).toThrow(
      "matching live",
    );
  });

  it("rejects clock rollback, overflow, invalid IDs, and open enum values", () => {
    expect(
      () =>
        new PowerLifecycleController(
          "browser-nap" as never,
          POWER_EPOCH,
        ),
    ).toThrow("idle strategy");
    expect(
      () =>
        new PowerLifecycleController(
          "platform-suspend",
          POWER_EPOCH,
          Number.MAX_SAFE_INTEGER,
        ),
    ).not.toThrow();
    const exhausted = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
      Number.MAX_SAFE_INTEGER,
    );
    expect(() =>
      exhausted.requestIdle("physical-power-button", 0),
    ).toThrow("identifier space exhausted");

    const controller = new PowerLifecycleController(
      "platform-suspend",
      POWER_EPOCH,
    );
    controller.snapshot(10);
    expect(() => controller.snapshot(9)).toThrow("nondecreasing");
    expect(() =>
      controller.requestExplicitTransition(
        "hibernate" as never,
        11,
      ),
    ).toThrow("restart or shutdown");
    expect(() =>
      controller.requestIdle("browser-script" as never, 12),
    ).toThrow("source is not trusted");
  });
});

describe("BootMaintenanceGate", () => {
  it("takes an ordinary boot when no boot-time service hold is qualified", () => {
    const gate = new BootMaintenanceGate(7);
    expect(gate.snapshot()).toEqual({
      bootId: 7,
      phase: "sampling",
      nextEvidenceSequence: 1,
      serviceModeAuthorized: false,
      recoveryAuthorized: false,
    });
    expect(gate.finishOrdinaryBoot()).toEqual({
      bootId: 7,
      action: "ordinary-boot",
    });
    expect(gate.snapshot().phase).toBe("closed");
    expect(() =>
      gate.acceptPhysicalEvidence(evidence(7, 1, "qualified-boot-hold")),
    ).toThrow("invalid in this phase");
  });

  it("requires a qualified cold-boot hold followed by release for service mode", () => {
    const gate = new BootMaintenanceGate(44);
    expect(
      gate.acceptPhysicalEvidence(evidence(44, 1, "qualified-boot-hold")),
    ).toMatchObject({
      phase: "service-release-required",
      serviceModeAuthorized: false,
    });
    expect(() => gate.requestRecovery()).toThrow("service mode");
    expect(
      gate.acceptPhysicalEvidence(evidence(44, 2, "released")),
    ).toMatchObject({
      phase: "service-mode",
      serviceModeAuthorized: true,
      recoveryAuthorized: false,
    });
    expect(gate.exitServiceMode()).toEqual({
      bootId: 44,
      action: "ordinary-boot",
    });
  });

  it("requires a fresh service-button press and release for recovery", () => {
    const gate = new BootMaintenanceGate(2);
    gate.acceptPhysicalEvidence(evidence(2, 1, "qualified-boot-hold"));
    gate.acceptPhysicalEvidence(evidence(2, 2, "released"));
    expect(gate.requestRecovery()).toMatchObject({
      phase: "recovery-confirming",
      recoveryAuthorized: false,
    });
    expect(
      gate.acceptPhysicalEvidence(evidence(2, 3, "pressed")),
    ).toMatchObject({
      phase: "recovery-release-required",
      recoveryAuthorized: false,
    });
    expect(
      gate.acceptPhysicalEvidence(evidence(2, 4, "released")),
    ).toMatchObject({
      phase: "recovery-authorized",
      recoveryAuthorized: true,
    });
    expect(gate.consumeRecoveryAuthorization()).toEqual({
      bootId: 2,
      action: "enter-recovery",
    });
    expect(() => gate.consumeRecoveryAuthorization()).toThrow(
      "not physically authorized",
    );
  });

  it("cancels recovery without retaining a partial physical confirmation", () => {
    const gate = new BootMaintenanceGate(3);
    gate.acceptPhysicalEvidence(evidence(3, 1, "qualified-boot-hold"));
    gate.acceptPhysicalEvidence(evidence(3, 2, "released"));
    gate.requestRecovery();
    gate.acceptPhysicalEvidence(evidence(3, 3, "pressed"));
    expect(gate.cancelRecovery()).toMatchObject({
      phase: "recovery-cancel-release-required",
      recoveryAuthorized: false,
    });
    expect(
      gate.acceptPhysicalEvidence(evidence(3, 4, "released")),
    ).toMatchObject({
      phase: "service-mode",
      recoveryAuthorized: false,
    });
  });

  it("rejects wrong-boot, stale, forged-source, and misordered evidence", () => {
    const gate = new BootMaintenanceGate(9);
    expect(() =>
      gate.acceptPhysicalEvidence(evidence(8, 1, "qualified-boot-hold")),
    ).toThrow("wrong boot ID");
    expect(() =>
      gate.acceptPhysicalEvidence({
        ...evidence(9, 1, "qualified-boot-hold"),
        source: "browser" as never,
      }),
    ).toThrow("platform button");
    expect(() =>
      gate.acceptPhysicalEvidence({
        ...evidence(9, 1, "qualified-boot-hold"),
        browserApproved: true,
      } as PhysicalServiceEvidence),
    ).toThrow("closed object");
    expect(() =>
      gate.acceptPhysicalEvidence(evidence(9, 2, "qualified-boot-hold")),
    ).toThrow("stale or out of order");
    expect(() =>
      gate.acceptPhysicalEvidence(evidence(9, 1, "pressed")),
    ).toThrow("invalid in this phase");
    expect(gate.snapshot()).toMatchObject({
      phase: "sampling",
      nextEvidenceSequence: 1,
      recoveryAuthorized: false,
    });
  });

  it("rejects invalid boot identifiers and unknown signals", () => {
    expect(() => new BootMaintenanceGate(0)).toThrow("positive safe integer");
    expect(() => new BootMaintenanceGate(Number.NaN)).toThrow(
      "positive safe integer",
    );
    const gate = new BootMaintenanceGate(1);
    expect(() =>
      gate.acceptPhysicalEvidence({
        ...evidence(1, 1, "qualified-boot-hold"),
        signal: "power-button" as never,
      }),
    ).toThrow("unknown physical service signal");
  });
});
