export const POWER_CONFIRMATION_WINDOW_MS = 30_000;
export const POWER_QUIESCE_WINDOW_MS = 60_000;
export const POWER_WAKE_WINDOW_MS = 30_000;

export const POWER_QUIESCE_GATES = [
  "launch-admission-closed",
  "game-stopped-or-suspended",
  "tracker-stopped",
  "camera-capture-stopped",
  "input-released",
  "writes-quiesced",
  "update-state-safe",
] as const;

export const POWER_WAKE_GATES = [
  "launcher-ready",
  "display-ready",
  "input-ready",
] as const;

export type PowerQuiesceGate = (typeof POWER_QUIESCE_GATES)[number];
export type PowerWakeGate = (typeof POWER_WAKE_GATES)[number];
export type PowerAction = "idle" | "restart" | "shutdown";
export type IdleStrategy = "platform-suspend" | "low-power-launcher-idle";
export type WakeSource =
  | "physical-power-button"
  | "controller"
  | "remote"
  | "hdmi-cec";
export type PowerFaultCode =
  | "ADAPTER_FAILED"
  | "DEADLINE_EXPIRED"
  | "UNSAFE_UPDATE_STATE";
export type PowerPhase =
  | "active"
  | "confirming"
  | "quiescing"
  | "transition-ready"
  | "idle"
  | "waking"
  | "power-transfer"
  | "fault"
  | "power-lost";

export interface PowerOperationRef {
  epoch: number;
  operationId: number;
}

interface PendingPowerOperation {
  operationId: number;
  action: PowerAction;
  deadlineAtMs: number;
  acknowledged: Set<PowerQuiesceGate>;
}

interface PendingWakeOperation {
  operationId: number;
  source: WakeSource;
  deadlineAtMs: number;
  acknowledged: Set<PowerWakeGate>;
}

interface PendingConfirmation {
  operationId: number;
  action: "restart" | "shutdown";
  expiresAtMs: number;
}

export interface PowerLifecycleSnapshot {
  phase: PowerPhase;
  idleStrategy: IdleStrategy;
  operationEpoch: number;
  canAdmitLaunch: boolean;
  pendingConfirmation?: {
    operation: PowerOperationRef;
    action: "restart" | "shutdown";
    expiresAtMs: number;
  };
  pendingOperation?: {
    operation: PowerOperationRef;
    action: PowerAction | "wake";
    deadlineAtMs: number;
    acknowledged: readonly (PowerQuiesceGate | PowerWakeGate)[];
    missing: readonly (PowerQuiesceGate | PowerWakeGate)[];
    wakeSource?: WakeSource;
  };
  readyTransition?: {
    operation: PowerOperationRef;
    target: IdleStrategy | "restart" | "shutdown";
  };
  fault?: {
    operation: PowerOperationRef;
    action: PowerAction | "wake";
    code: PowerFaultCode;
  };
}

/**
 * Pure fail-closed policy model for tier-native idle, restart, and shutdown.
 *
 * Every input to this class is evidence supplied by a future privileged
 * coordinator. This class neither proves that evidence nor performs an OS
 * transition. In particular, page script must not be allowed to acknowledge
 * quiescence gates or call `startPlatformTransition`.
 */
export class PowerLifecycleController {
  readonly #idleStrategy: IdleStrategy;
  readonly #operationEpoch: number;
  #phase: PowerPhase = "active";
  #nextOperationId: number;
  #lastObservedMs = 0;
  #confirmation: PendingConfirmation | undefined;
  #powerOperation: PendingPowerOperation | undefined;
  #wakeOperation: PendingWakeOperation | undefined;
  #fault:
    | {
        operationId: number;
        action: PowerAction | "wake";
        code: PowerFaultCode;
      }
    | undefined;

  constructor(
    idleStrategy: IdleStrategy,
    operationEpoch: number,
    firstOperationId = 1,
  ) {
    if (
      idleStrategy !== "platform-suspend" &&
      idleStrategy !== "low-power-launcher-idle"
    ) {
      throw new Error("idle strategy must be a supported closed value");
    }
    this.#requireOperationId(operationEpoch);
    this.#requireOperationId(firstOperationId);
    this.#idleStrategy = idleStrategy;
    this.#operationEpoch = operationEpoch;
    this.#nextOperationId = firstOperationId;
  }

  snapshot(nowMs?: number): PowerLifecycleSnapshot {
    if (nowMs !== undefined) {
      this.#observeTime(nowMs);
      this.#expireTimedState(nowMs);
    }

    const base: PowerLifecycleSnapshot = {
      phase: this.#phase,
      idleStrategy: this.#idleStrategy,
      operationEpoch: this.#operationEpoch,
      canAdmitLaunch:
        this.#phase === "active" || this.#phase === "confirming",
    };

    if (this.#confirmation !== undefined) {
      base.pendingConfirmation = {
        operation: this.#operationRef(this.#confirmation.operationId),
        action: this.#confirmation.action,
        expiresAtMs: this.#confirmation.expiresAtMs,
      };
    }

    if (this.#powerOperation !== undefined) {
      const acknowledged = POWER_QUIESCE_GATES.filter((gate) =>
        this.#powerOperation?.acknowledged.has(gate),
      );
      const missing = POWER_QUIESCE_GATES.filter(
        (gate) => !this.#powerOperation?.acknowledged.has(gate),
      );
      base.pendingOperation = {
        operation: this.#operationRef(this.#powerOperation.operationId),
        action: this.#powerOperation.action,
        deadlineAtMs: this.#powerOperation.deadlineAtMs,
        acknowledged,
        missing,
      };
      if (this.#phase === "transition-ready") {
        base.readyTransition = {
          operation: this.#operationRef(this.#powerOperation.operationId),
          target:
            this.#powerOperation.action === "idle"
              ? this.#idleStrategy
              : this.#powerOperation.action,
        };
      }
    }

    if (this.#wakeOperation !== undefined) {
      const acknowledged = POWER_WAKE_GATES.filter((gate) =>
        this.#wakeOperation?.acknowledged.has(gate),
      );
      const missing = POWER_WAKE_GATES.filter(
        (gate) => !this.#wakeOperation?.acknowledged.has(gate),
      );
      base.pendingOperation = {
        operation: this.#operationRef(this.#wakeOperation.operationId),
        action: "wake",
        deadlineAtMs: this.#wakeOperation.deadlineAtMs,
        acknowledged,
        missing,
        wakeSource: this.#wakeOperation.source,
      };
    }

    if (this.#fault !== undefined) {
      base.fault = {
        operation: this.#operationRef(this.#fault.operationId),
        action: this.#fault.action,
        code: this.#fault.code,
      };
    }

    return base;
  }

  requestIdle(
    source: "physical-power-button" | "local-console-ui",
    nowMs: number,
  ): PowerLifecycleSnapshot {
    this.#observeTime(nowMs);
    if (
      source !== "physical-power-button" &&
      source !== "local-console-ui"
    ) {
      throw new Error("idle request source is not trusted");
    }
    this.#requirePhase("active", "idle request");
    this.#beginQuiescing("idle", nowMs);
    return this.snapshot();
  }

  shortPressPowerButton(nowMs: number): PowerLifecycleSnapshot {
    if (this.#phase === "active") {
      return this.requestIdle("physical-power-button", nowMs);
    }
    if (this.#phase === "idle") {
      return this.requestWake("physical-power-button", nowMs);
    }
    this.#observeTime(nowMs);
    throw new Error("short power press is unavailable during a transition");
  }

  requestExplicitTransition(
    action: "restart" | "shutdown",
    nowMs: number,
  ): PowerLifecycleSnapshot {
    this.#observeTime(nowMs);
    if (action !== "restart" && action !== "shutdown") {
      throw new Error("explicit transition must be restart or shutdown");
    }
    this.#requirePhase("active", "explicit transition request");
    const operationId = this.#allocateOperationId();
    this.#confirmation = {
      operationId,
      action,
      expiresAtMs: this.#addWindow(nowMs, POWER_CONFIRMATION_WINDOW_MS),
    };
    this.#phase = "confirming";
    return this.snapshot();
  }

  confirmExplicitTransition(
    operationRef: PowerOperationRef,
    nowMs: number,
  ): PowerLifecycleSnapshot {
    this.#observeTime(nowMs);
    this.#expireTimedState(nowMs);
    this.#validateOperationRef(operationRef);
    const confirmation = this.#confirmation;
    if (
      this.#phase !== "confirming" ||
      confirmation === undefined ||
      confirmation.operationId !== operationRef.operationId
    ) {
      throw new Error("no matching live power confirmation");
    }
    this.#confirmation = undefined;
    this.#beginQuiescing(
      confirmation.action,
      nowMs,
      operationRef.operationId,
    );
    return this.snapshot();
  }

  cancelExplicitTransition(
    operationRef: PowerOperationRef,
  ): PowerLifecycleSnapshot {
    this.#validateOperationRef(operationRef);
    if (
      this.#phase !== "confirming" ||
      this.#confirmation?.operationId !== operationRef.operationId
    ) {
      throw new Error("no matching power confirmation to cancel");
    }
    this.#confirmation = undefined;
    this.#phase = "active";
    return this.snapshot();
  }

  acknowledgeQuiesce(
    operationRef: PowerOperationRef,
    gate: PowerQuiesceGate,
    nowMs: number,
  ): PowerLifecycleSnapshot {
    this.#observeTime(nowMs);
    this.#expireTimedState(nowMs);
    this.#validateOperationRef(operationRef);
    this.#requireQuiesceGate(gate);
    const operation = this.#powerOperation;
    if (
      this.#phase !== "quiescing" ||
      operation === undefined ||
      operation.operationId !== operationRef.operationId
    ) {
      throw new Error("no matching quiesce operation");
    }
    if (
      gate !== "launch-admission-closed" &&
      !operation.acknowledged.has("launch-admission-closed")
    ) {
      throw new Error("launch admission must close before service quiescence");
    }

    operation.acknowledged.add(gate);
    if (operation.acknowledged.size === POWER_QUIESCE_GATES.length) {
      this.#phase = "transition-ready";
    }
    return this.snapshot();
  }

  startPlatformTransition(
    operationRef: PowerOperationRef,
    nowMs: number,
  ): PowerLifecycleSnapshot {
    this.#observeTime(nowMs);
    this.#expireTimedState(nowMs);
    this.#validateOperationRef(operationRef);
    const operation = this.#powerOperation;
    if (
      this.#phase !== "transition-ready" ||
      operation === undefined ||
      operation.operationId !== operationRef.operationId
    ) {
      throw new Error("no matching transition is ready");
    }

    if (operation.action === "idle") {
      this.#phase = "idle";
      this.#powerOperation = undefined;
    } else {
      this.#phase = "power-transfer";
    }
    return this.snapshot();
  }

  requestWake(source: WakeSource, nowMs: number): PowerLifecycleSnapshot {
    this.#observeTime(nowMs);
    this.#requireWakeSource(source);
    this.#requirePhase("idle", "wake request");
    this.#wakeOperation = {
      operationId: this.#allocateOperationId(),
      source,
      deadlineAtMs: this.#addWindow(nowMs, POWER_WAKE_WINDOW_MS),
      acknowledged: new Set(),
    };
    this.#phase = "waking";
    return this.snapshot();
  }

  acknowledgeWake(
    operationRef: PowerOperationRef,
    gate: PowerWakeGate,
    nowMs: number,
  ): PowerLifecycleSnapshot {
    this.#observeTime(nowMs);
    this.#expireTimedState(nowMs);
    this.#validateOperationRef(operationRef);
    this.#requireWakeGate(gate);
    const operation = this.#wakeOperation;
    if (
      this.#phase !== "waking" ||
      operation === undefined ||
      operation.operationId !== operationRef.operationId
    ) {
      throw new Error("no matching wake operation");
    }

    operation.acknowledged.add(gate);
    if (operation.acknowledged.size === POWER_WAKE_GATES.length) {
      this.#wakeOperation = undefined;
      this.#phase = "active";
    }
    return this.snapshot();
  }

  failOperation(
    operationRef: PowerOperationRef,
    code: PowerFaultCode,
    nowMs: number,
  ): PowerLifecycleSnapshot {
    this.#observeTime(nowMs);
    this.#validateOperationRef(operationRef);
    this.#requireFaultCode(code);
    const operation =
      this.#phase === "quiescing" || this.#phase === "transition-ready"
        ? this.#powerOperation
        : this.#phase === "waking"
          ? this.#wakeOperation
          : undefined;
    if (
      operation === undefined ||
      operation.operationId !== operationRef.operationId
    ) {
      throw new Error("no matching live power operation");
    }

    const action =
      "action" in operation ? operation.action : ("wake" as const);
    this.#enterFault(operationRef.operationId, action, code);
    return this.snapshot();
  }

  observeUncleanPowerLoss(): PowerLifecycleSnapshot {
    this.#confirmation = undefined;
    this.#powerOperation = undefined;
    this.#wakeOperation = undefined;
    this.#fault = undefined;
    this.#phase = "power-lost";
    return this.snapshot();
  }

  #beginQuiescing(
    action: PowerAction,
    nowMs: number,
    operationId = this.#allocateOperationId(),
  ): void {
    this.#powerOperation = {
      operationId,
      action,
      deadlineAtMs: this.#addWindow(nowMs, POWER_QUIESCE_WINDOW_MS),
      acknowledged: new Set(),
    };
    this.#phase = "quiescing";
  }

  #expireTimedState(nowMs: number): void {
    if (
      this.#phase === "confirming" &&
      this.#confirmation !== undefined &&
      nowMs >= this.#confirmation.expiresAtMs
    ) {
      this.#confirmation = undefined;
      this.#phase = "active";
      return;
    }

    const operation =
      this.#phase === "quiescing" || this.#phase === "transition-ready"
        ? this.#powerOperation
        : this.#phase === "waking"
          ? this.#wakeOperation
          : undefined;
    if (operation !== undefined && nowMs >= operation.deadlineAtMs) {
      const action =
        "action" in operation ? operation.action : ("wake" as const);
      this.#enterFault(
        operation.operationId,
        action,
        "DEADLINE_EXPIRED",
      );
    }
  }

  #enterFault(
    operationId: number,
    action: PowerAction | "wake",
    code: PowerFaultCode,
  ): void {
    this.#confirmation = undefined;
    this.#powerOperation = undefined;
    this.#wakeOperation = undefined;
    this.#fault = { operationId, action, code };
    this.#phase = "fault";
  }

  #allocateOperationId(): number {
    const operationId = this.#nextOperationId;
    if (operationId >= Number.MAX_SAFE_INTEGER) {
      throw new Error("power operation identifier space exhausted");
    }
    this.#nextOperationId += 1;
    return operationId;
  }

  #observeTime(nowMs: number): void {
    if (!Number.isSafeInteger(nowMs) || nowMs < this.#lastObservedMs) {
      throw new Error("power clock must be a nondecreasing safe integer");
    }
    this.#lastObservedMs = nowMs;
  }

  #addWindow(nowMs: number, windowMs: number): number {
    if (nowMs > Number.MAX_SAFE_INTEGER - windowMs) {
      throw new Error("power deadline exceeds the safe clock range");
    }
    return nowMs + windowMs;
  }

  #requirePhase(expected: PowerPhase, action: string): void {
    if (this.#phase !== expected) {
      throw new Error(`${action} requires ${expected} phase`);
    }
  }

  #requireOperationId(operationId: number): void {
    if (!Number.isSafeInteger(operationId) || operationId < 1) {
      throw new Error("operation ID must be a positive safe integer");
    }
  }

  #operationRef(operationId: number): PowerOperationRef {
    return { epoch: this.#operationEpoch, operationId };
  }

  #validateOperationRef(operationRef: PowerOperationRef): void {
    if (
      operationRef === null ||
      typeof operationRef !== "object" ||
      Array.isArray(operationRef) ||
      Object.keys(operationRef).length !== 2 ||
      operationRef.epoch !== this.#operationEpoch
    ) {
      throw new Error("power operation has the wrong coordinator epoch");
    }
    this.#requireOperationId(operationRef.operationId);
  }

  #requireQuiesceGate(gate: PowerQuiesceGate): void {
    if (!(POWER_QUIESCE_GATES as readonly unknown[]).includes(gate)) {
      throw new Error("unknown quiesce gate");
    }
  }

  #requireWakeGate(gate: PowerWakeGate): void {
    if (!(POWER_WAKE_GATES as readonly unknown[]).includes(gate)) {
      throw new Error("unknown wake gate");
    }
  }

  #requireWakeSource(source: WakeSource): void {
    if (
      source !== "physical-power-button" &&
      source !== "controller" &&
      source !== "remote" &&
      source !== "hdmi-cec"
    ) {
      throw new Error("wake source is not a supported closed value");
    }
  }

  #requireFaultCode(code: PowerFaultCode): void {
    if (
      code !== "ADAPTER_FAILED" &&
      code !== "DEADLINE_EXPIRED" &&
      code !== "UNSAFE_UPDATE_STATE"
    ) {
      throw new Error("unknown power fault code");
    }
  }
}

export type BootMaintenancePhase =
  | "sampling"
  | "service-release-required"
  | "service-mode"
  | "recovery-confirming"
  | "recovery-release-required"
  | "recovery-cancel-release-required"
  | "recovery-authorized"
  | "closed";

export type PhysicalServiceSignal =
  | "qualified-boot-hold"
  | "pressed"
  | "released";

export interface PhysicalServiceEvidence {
  bootId: number;
  sequence: number;
  source: "platform-service-button";
  signal: PhysicalServiceSignal;
}

export interface BootMaintenanceSnapshot {
  bootId: number;
  phase: BootMaintenancePhase;
  nextEvidenceSequence: number;
  serviceModeAuthorized: boolean;
  recoveryAuthorized: boolean;
}

/**
 * Boot-only, one-shot gate for service mode and destructive recovery.
 *
 * The platform must qualify the initial hold from a dedicated physical service
 * control before passing evidence here. A held button grants only entry to the
 * non-destructive service environment. Recovery additionally requires a fresh
 * press and release after the service environment asks for confirmation.
 */
export class BootMaintenanceGate {
  readonly #bootId: number;
  #phase: BootMaintenancePhase = "sampling";
  #nextEvidenceSequence = 1;

  constructor(bootId: number) {
    this.#requirePositiveSafeInteger(bootId, "boot ID");
    this.#bootId = bootId;
  }

  snapshot(): BootMaintenanceSnapshot {
    return {
      bootId: this.#bootId,
      phase: this.#phase,
      nextEvidenceSequence: this.#nextEvidenceSequence,
      serviceModeAuthorized:
        this.#phase === "service-mode" ||
        this.#phase === "recovery-confirming" ||
        this.#phase === "recovery-release-required" ||
        this.#phase === "recovery-cancel-release-required" ||
        this.#phase === "recovery-authorized",
      recoveryAuthorized: this.#phase === "recovery-authorized",
    };
  }

  acceptPhysicalEvidence(
    evidence: PhysicalServiceEvidence,
  ): BootMaintenanceSnapshot {
    this.#validateEvidence(evidence);

    if (
      this.#phase === "sampling" &&
      evidence.signal === "qualified-boot-hold"
    ) {
      this.#phase = "service-release-required";
    } else if (
      this.#phase === "service-release-required" &&
      evidence.signal === "released"
    ) {
      this.#phase = "service-mode";
    } else if (
      this.#phase === "recovery-confirming" &&
      evidence.signal === "pressed"
    ) {
      this.#phase = "recovery-release-required";
    } else if (
      this.#phase === "recovery-release-required" &&
      evidence.signal === "released"
    ) {
      this.#phase = "recovery-authorized";
    } else if (
      this.#phase === "recovery-cancel-release-required" &&
      evidence.signal === "released"
    ) {
      this.#phase = "service-mode";
    } else {
      throw new Error("physical service signal is invalid in this phase");
    }

    this.#nextEvidenceSequence += 1;
    return this.snapshot();
  }

  requestRecovery(): BootMaintenanceSnapshot {
    if (this.#phase !== "service-mode") {
      throw new Error("recovery request requires authorized service mode");
    }
    this.#phase = "recovery-confirming";
    return this.snapshot();
  }

  cancelRecovery(): BootMaintenanceSnapshot {
    if (this.#phase === "recovery-confirming") {
      this.#phase = "service-mode";
      return this.snapshot();
    }
    if (this.#phase === "recovery-release-required") {
      this.#phase = "recovery-cancel-release-required";
      return this.snapshot();
    }
    throw new Error("no recovery confirmation to cancel");
  }

  finishOrdinaryBoot(): { bootId: number; action: "ordinary-boot" } {
    if (this.#phase !== "sampling") {
      throw new Error("ordinary boot is unavailable after service entry");
    }
    this.#phase = "closed";
    return { bootId: this.#bootId, action: "ordinary-boot" };
  }

  exitServiceMode(): { bootId: number; action: "ordinary-boot" } {
    if (this.#phase !== "service-mode") {
      throw new Error("service mode is not ready to exit");
    }
    this.#phase = "closed";
    return { bootId: this.#bootId, action: "ordinary-boot" };
  }

  consumeRecoveryAuthorization(): {
    bootId: number;
    action: "enter-recovery";
  } {
    if (this.#phase !== "recovery-authorized") {
      throw new Error("recovery is not physically authorized");
    }
    this.#phase = "closed";
    return { bootId: this.#bootId, action: "enter-recovery" };
  }

  #validateEvidence(evidence: PhysicalServiceEvidence): void {
    if (
      evidence === null ||
      typeof evidence !== "object" ||
      Array.isArray(evidence) ||
      Object.keys(evidence).length !== 4
    ) {
      throw new Error("physical service evidence must be a closed object");
    }
    if (evidence.bootId !== this.#bootId) {
      throw new Error("physical service evidence has the wrong boot ID");
    }
    if (evidence.source !== "platform-service-button") {
      throw new Error("service evidence must come from the platform button");
    }
    this.#requirePositiveSafeInteger(evidence.sequence, "evidence sequence");
    if (evidence.sequence !== this.#nextEvidenceSequence) {
      throw new Error("physical service evidence is stale or out of order");
    }
    if (
      evidence.signal !== "qualified-boot-hold" &&
      evidence.signal !== "pressed" &&
      evidence.signal !== "released"
    ) {
      throw new Error("unknown physical service signal");
    }
    if (this.#nextEvidenceSequence >= Number.MAX_SAFE_INTEGER) {
      throw new Error("physical service evidence space exhausted");
    }
  }

  #requirePositiveSafeInteger(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${label} must be a positive safe integer`);
    }
  }
}
