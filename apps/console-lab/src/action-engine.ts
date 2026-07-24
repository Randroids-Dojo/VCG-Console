import {
  sortMotionActions,
  type CoreLandmarkName,
  type MotionAction,
  type MotionFrame,
  type PlayerMotion,
} from "@vcg/motion-contract";

interface Point {
  x: number;
  y: number;
}

interface Baseline {
  centerX: number;
  shoulderY: number;
  hipY: number;
  ankleY: number;
  shoulderWidth: number;
}

type SustainedActionName = "player_join" | "menu_select" | "menu_back" | "pause";

interface HoldState {
  name: SustainedActionName;
  startedAtMs: number;
  triggered: boolean;
  lastConfidence: number;
}

const HOLD_SELECT_MS = 450;
const HOLD_BACK_MS = 650;
const HOLD_PAUSE_MS = 1_100;
const ACTION_COOLDOWN_MS = 650;

export type ActionContext = "shell" | "game" | "overlay";

function point(player: PlayerMotion, name: CoreLandmarkName): Point | undefined {
  const landmark = player.coreLandmarks.find((candidate) => candidate.name === name);
  return landmark?.observed ? landmark.position : undefined;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export class ActionEngine {
  readonly #baselineSamples: Baseline[] = [];
  readonly #lastTriggeredAt = new Map<MotionAction["name"], number>();
  readonly #latchedActions = new Set<MotionAction["name"]>();
  #baseline: Baseline | undefined;
  #previousLeftWrist: Point | undefined;
  #previousRightWrist: Point | undefined;
  #previousAtMs = 0;
  #lastFrameAtMs: number | undefined;
  #handsHold: HoldState | undefined;
  #armsHold: HoldState | undefined;
  #joined = false;

  enrich(frame: MotionFrame, context: ActionContext = "shell"): MotionFrame {
    const now = frame.publishedAtMs;
    if (this.#lastFrameAtMs !== undefined && now < this.#lastFrameAtMs) this.reset();
    this.#lastFrameAtMs = now;
    const enrichedFrame: MotionFrame = {
      ...frame,
      capabilities: {
        ...frame.capabilities,
        profiles: [
          ...new Set([
            ...frame.capabilities.profiles,
            "actions.obstacle.v1" as const,
            "actions.shell.v1" as const,
          ]),
        ],
      },
    };
    const player = enrichedFrame.players[0];
    if (!player) {
      this.#resetGestureContinuity();
      return enrichedFrame;
    }

    const measurements = this.#measure(player);
    if (!measurements) {
      const actions = this.#terminateHolds(now);
      this.#resetSpatialContinuity();
      return {
        ...enrichedFrame,
        players: [
          { ...player, state: this.#joined ? "joined" : "candidate", actions },
          ...enrichedFrame.players.slice(1),
        ],
      };
    }
    this.#captureBaseline(measurements);
    const actions = this.#recognize(player, measurements, now, context);
    const enrichedPlayer: PlayerMotion = {
      ...player,
      state: this.#joined ? "joined" : "candidate",
      actions,
    };
    this.#previousLeftWrist = point(player, "left_wrist");
    this.#previousRightWrist = point(player, "right_wrist");
    this.#previousAtMs = now;
    return { ...enrichedFrame, players: [enrichedPlayer, ...enrichedFrame.players.slice(1)] };
  }

  join(): void {
    this.#joined = true;
  }

  reset(): void {
    this.#baselineSamples.length = 0;
    this.#baseline = undefined;
    this.#lastTriggeredAt.clear();
    this.#resetGestureContinuity();
    this.#lastFrameAtMs = undefined;
    this.#joined = false;
  }

  #resetGestureContinuity(): void {
    this.#handsHold = undefined;
    this.#armsHold = undefined;
    this.#resetSpatialContinuity();
  }

  #resetSpatialContinuity(): void {
    this.#previousLeftWrist = undefined;
    this.#previousRightWrist = undefined;
    this.#previousAtMs = 0;
    this.#latchedActions.clear();
  }

  #measure(player: PlayerMotion): Baseline | undefined {
    const leftShoulder = point(player, "left_shoulder");
    const rightShoulder = point(player, "right_shoulder");
    const leftHip = point(player, "left_hip");
    const rightHip = point(player, "right_hip");
    const leftAnkle = point(player, "left_ankle");
    const rightAnkle = point(player, "right_ankle");
    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftAnkle || !rightAnkle) return undefined;
    const shoulders = midpoint(leftShoulder, rightShoulder);
    const hips = midpoint(leftHip, rightHip);
    const ankles = midpoint(leftAnkle, rightAnkle);
    return {
      centerX: hips.x,
      shoulderY: shoulders.y,
      hipY: hips.y,
      ankleY: ankles.y,
      shoulderWidth: Math.max(0.05, distance(leftShoulder, rightShoulder)),
    };
  }

  #captureBaseline(sample: Baseline): void {
    if (this.#baseline) return;
    this.#baselineSamples.push(sample);
    if (this.#baselineSamples.length < 24) return;
    const average = (key: keyof Baseline) => this.#baselineSamples.reduce((sum, value) => sum + value[key], 0) / this.#baselineSamples.length;
    this.#baseline = {
      centerX: average("centerX"),
      shoulderY: average("shoulderY"),
      hipY: average("hipY"),
      ankleY: average("ankleY"),
      shoulderWidth: average("shoulderWidth"),
    };
  }

  #recognize(player: PlayerMotion, current: Baseline, now: number, context: ActionContext): MotionAction[] {
    const actions: MotionAction[] = [];
    const leftWrist = point(player, "left_wrist");
    const rightWrist = point(player, "right_wrist");
    const leftElbow = point(player, "left_elbow");
    const rightElbow = point(player, "right_elbow");
    const baseline = this.#baseline;

    if (leftWrist && rightWrist) {
      const together = distance(leftWrist, rightWrist) < current.shoulderWidth * 0.52;
      const name = this.#joined ? "menu_select" : "player_join";
      const confidence = Math.max(0, Math.min(1, 1 - distance(leftWrist, rightWrist) / current.shoulderWidth));
      const enabled = context !== "game";
      const update = this.#advanceHold(
        this.#handsHold,
        together && enabled,
        name,
        HOLD_SELECT_MS,
        confidence,
        now,
        false,
      );
      this.#handsHold = update.state;
      actions.push(...update.actions);
      if (update.triggered && name === "player_join") this.#joined = true;
    } else {
      const update = this.#advanceHold(
        this.#handsHold,
        false,
        this.#handsHold?.name ?? (this.#joined ? "menu_select" : "player_join"),
        HOLD_SELECT_MS,
        0,
        now,
        false,
      );
      this.#handsHold = update.state;
      actions.push(...update.actions);
    }

    if (leftWrist && rightWrist && leftElbow && rightElbow) {
      const crossed = leftWrist.x > rightElbow.x && rightWrist.x < leftElbow.x && Math.abs(leftWrist.y - rightWrist.y) < current.shoulderWidth;
      const name = context === "game" ? "pause" : "menu_back";
      const thresholdMs = context === "game" ? HOLD_PAUSE_MS : HOLD_BACK_MS;
      const update = this.#advanceHold(this.#armsHold, crossed, name, thresholdMs, crossed ? 0.9 : 0, now, true);
      this.#armsHold = update.state;
      actions.push(...update.actions);
    } else {
      const fallbackName = this.#armsHold?.name ?? (context === "game" ? "pause" : "menu_back");
      const update = this.#advanceHold(
        this.#armsHold,
        false,
        fallbackName,
        fallbackName === "pause" ? HOLD_PAUSE_MS : HOLD_BACK_MS,
        0,
        now,
        true,
      );
      this.#armsHold = update.state;
      actions.push(...update.actions);
    }

    if (this.#joined && baseline && context === "game") {
      const screenShift = baseline.centerX - current.centerX;
      const shoulderDrop = current.shoulderY - baseline.shoulderY;
      const hipRise = baseline.hipY - current.hipY;
      const ankleRise = baseline.ankleY - current.ankleY;
      this.#updateDiscrete(
        "dodge_left",
        screenShift < (this.#latchedActions.has("dodge_left") ? -0.08 : -0.12),
        now,
        0.8,
        actions,
      );
      this.#updateDiscrete(
        "dodge_right",
        screenShift > (this.#latchedActions.has("dodge_right") ? 0.08 : 0.12),
        now,
        0.8,
        actions,
      );
      this.#updateDiscrete(
        "duck",
        shoulderDrop > (this.#latchedActions.has("duck") ? 0.07 : 0.105),
        now,
        0.8,
        actions,
      );
      const jumpActive = this.#latchedActions.has("jump")
        ? hipRise > 0.04 && ankleRise > 0.015
        : hipRise > 0.075 && ankleRise > 0.035;
      this.#updateDiscrete("jump", jumpActive, now, 0.78, actions);
    } else {
      for (const name of ["dodge_left", "dodge_right", "duck", "jump"] as const) {
        this.#updateDiscrete(name, false, now, 0, actions);
      }
    }

    if (this.#joined && context !== "game" && leftWrist && rightWrist && this.#previousAtMs > 0) {
      const elapsed = Math.max(1, now - this.#previousAtMs);
      const leftVelocity = this.#previousLeftWrist ? (this.#previousLeftWrist.x - leftWrist.x) / elapsed : 0;
      const rightVelocity = this.#previousRightWrist ? (this.#previousRightWrist.x - rightWrist.x) / elapsed : 0;
      const raised = leftWrist.y < current.shoulderY || rightWrist.y < current.shoulderY;
      const mirroredVelocity = Math.abs(leftVelocity) > Math.abs(rightVelocity) ? leftVelocity : rightVelocity;
      const rightThreshold = this.#latchedActions.has("menu_swipe_right") ? 0.0005 : 0.0012;
      const leftThreshold = this.#latchedActions.has("menu_swipe_left") ? -0.0005 : -0.0012;
      this.#updateDiscrete(
        "menu_swipe_right",
        raised && mirroredVelocity > rightThreshold,
        now,
        Math.min(1, Math.max(0, mirroredVelocity * 500)),
        actions,
      );
      this.#updateDiscrete(
        "menu_swipe_left",
        raised && mirroredVelocity < leftThreshold,
        now,
        Math.min(1, Math.max(0, -mirroredVelocity * 500)),
        actions,
      );
    } else {
      this.#updateDiscrete("menu_swipe_right", false, now, 0, actions);
      this.#updateDiscrete("menu_swipe_left", false, now, 0, actions);
    }
    return sortMotionActions(actions);
  }

  #advanceHold(
    currentState: HoldState | undefined,
    active: boolean,
    requestedName: SustainedActionName,
    thresholdMs: number,
    confidence: number,
    now: number,
    restartOnNameChange: boolean,
  ): Readonly<{ state: HoldState | undefined; actions: MotionAction[]; triggered: boolean }> {
    const actions: MotionAction[] = [];
    let state = currentState;
    if (state && state.name !== requestedName && restartOnNameChange) {
      actions.push(this.#terminalAction(state, now));
      state = undefined;
    }
    if (!active) {
      if (state) actions.push(this.#terminalAction(state, now));
      return { state: undefined, actions: sortMotionActions(actions), triggered: false };
    }
    if (!state) {
      state = { name: requestedName, startedAtMs: now, triggered: false, lastConfidence: confidence };
      actions.push(this.#action(state.name, "started", now, confidence, 0));
      return { state, actions, triggered: false };
    }

    state.lastConfidence = confidence;
    const durationMs = Math.max(0, now - state.startedAtMs);
    actions.push(this.#action(state.name, "held", now, confidence, durationMs));
    let triggered = false;
    if (!state.triggered && durationMs >= thresholdMs && this.#trigger(state.name, now)) {
      state.triggered = true;
      triggered = true;
      actions.push(this.#action(state.name, "triggered", now, confidence, durationMs));
    }
    return { state, actions: sortMotionActions(actions), triggered };
  }

  #terminateHolds(now: number): MotionAction[] {
    const actions: MotionAction[] = [];
    if (this.#handsHold) actions.push(this.#terminalAction(this.#handsHold, now));
    if (this.#armsHold) actions.push(this.#terminalAction(this.#armsHold, now));
    this.#handsHold = undefined;
    this.#armsHold = undefined;
    return sortMotionActions(actions);
  }

  #terminalAction(state: HoldState, now: number): MotionAction {
    return this.#action(
      state.name,
      state.triggered ? "ended" : "cancelled",
      now,
      state.triggered ? state.lastConfidence : 0,
      Math.max(0, now - state.startedAtMs),
    );
  }

  #updateDiscrete(
    name: MotionAction["name"],
    active: boolean,
    now: number,
    confidence: number,
    actions: MotionAction[],
  ): void {
    const latched = this.#latchedActions.has(name);
    if (!active) {
      this.#latchedActions.delete(name);
      return;
    }
    if (latched) return;
    this.#latchedActions.add(name);
    if (this.#trigger(name, now)) actions.push(this.#action(name, "triggered", now, confidence));
  }

  #trigger(name: MotionAction["name"], now: number): boolean {
    const last = this.#lastTriggeredAt.get(name) ?? -Infinity;
    if (now - last < ACTION_COOLDOWN_MS) return false;
    this.#lastTriggeredAt.set(name, now);
    return true;
  }

  #action(
    name: MotionAction["name"],
    phase: MotionAction["phase"],
    now: number,
    confidence: number,
    durationMs?: number,
  ): MotionAction {
    return {
      name,
      phase,
      confidence,
      occurredAtMs: now,
      ...(durationMs === undefined ? {} : { durationMs }),
    };
  }
}
