import type { CoreLandmarkName, MotionAction, MotionFrame, PlayerMotion } from "@vcg/motion-contract";

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

const HOLD_SELECT_MS = 450;
const HOLD_BACK_MS = 650;
const HOLD_PAUSE_MS = 1_100;
const ACTION_COOLDOWN_MS = 650;

export type ActionContext = "shell" | "game";

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
  readonly #lastTriggeredAt = new Map<string, number>();
  #baseline: Baseline | undefined;
  #previousLeftWrist: Point | undefined;
  #previousRightWrist: Point | undefined;
  #previousAtMs = 0;
  #handsTogetherStartedAt: number | undefined;
  #armsCrossedStartedAt: number | undefined;
  #joined = false;

  enrich(frame: MotionFrame, context: ActionContext = "shell"): MotionFrame {
    const player = frame.players[0];
    if (!player) {
      this.#resetGestureContinuity();
      return frame;
    }

    const now = frame.publishedAtMs;
    const measurements = this.#measure(player);
    if (!measurements) {
      this.#resetGestureContinuity();
      return frame;
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
    return { ...frame, players: [enrichedPlayer, ...frame.players.slice(1)] };
  }

  join(): void {
    this.#joined = true;
  }

  reset(): void {
    this.#baselineSamples.length = 0;
    this.#baseline = undefined;
    this.#lastTriggeredAt.clear();
    this.#resetGestureContinuity();
    this.#joined = false;
  }

  #resetGestureContinuity(): void {
    this.#previousLeftWrist = undefined;
    this.#previousRightWrist = undefined;
    this.#previousAtMs = 0;
    this.#handsTogetherStartedAt = undefined;
    this.#armsCrossedStartedAt = undefined;
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
      if (together && this.#handsTogetherStartedAt === undefined) this.#handsTogetherStartedAt = now;
      if (!together) this.#handsTogetherStartedAt = undefined;
      if (together && this.#handsTogetherStartedAt !== undefined && now - this.#handsTogetherStartedAt >= HOLD_SELECT_MS) {
        const name = this.#joined ? "menu_select" : "player_join";
        if (this.#trigger(name, now)) {
          actions.push(this.#action(name, now, Math.min(1, 1 - distance(leftWrist, rightWrist) / current.shoulderWidth)));
          if (name === "player_join") this.#joined = true;
        }
      }
    }

    if (leftWrist && rightWrist && leftElbow && rightElbow) {
      const crossed = leftWrist.x > rightElbow.x && rightWrist.x < leftElbow.x && Math.abs(leftWrist.y - rightWrist.y) < current.shoulderWidth;
      if (crossed && this.#armsCrossedStartedAt === undefined) this.#armsCrossedStartedAt = now;
      if (!crossed) this.#armsCrossedStartedAt = undefined;
      const heldMs = crossed && this.#armsCrossedStartedAt !== undefined ? now - this.#armsCrossedStartedAt : 0;
      if (context === "game" && heldMs >= HOLD_PAUSE_MS && this.#trigger("pause", now)) {
        actions.push(this.#action("pause", now, 0.9, heldMs));
      } else if (context === "shell" && heldMs >= HOLD_BACK_MS && this.#trigger("menu_back", now)) {
        actions.push(this.#action("menu_back", now, 0.8, heldMs));
      }
    }

    if (this.#joined && baseline) {
      const screenShift = baseline.centerX - current.centerX;
      if (screenShift < -0.12 && this.#trigger("dodge_left", now)) actions.push(this.#action("dodge_left", now, 0.8));
      if (screenShift > 0.12 && this.#trigger("dodge_right", now)) actions.push(this.#action("dodge_right", now, 0.8));
      if (current.shoulderY - baseline.shoulderY > 0.105 && this.#trigger("duck", now)) actions.push(this.#action("duck", now, 0.8));
      if (baseline.hipY - current.hipY > 0.075 && baseline.ankleY - current.ankleY > 0.035 && this.#trigger("jump", now)) {
        actions.push(this.#action("jump", now, 0.78));
      }
    }

    if (this.#joined && leftWrist && rightWrist && this.#previousAtMs > 0) {
      const elapsed = Math.max(1, now - this.#previousAtMs);
      const leftVelocity = this.#previousLeftWrist ? (this.#previousLeftWrist.x - leftWrist.x) / elapsed : 0;
      const rightVelocity = this.#previousRightWrist ? (this.#previousRightWrist.x - rightWrist.x) / elapsed : 0;
      const raised = leftWrist.y < current.shoulderY || rightWrist.y < current.shoulderY;
      const mirroredVelocity = Math.abs(leftVelocity) > Math.abs(rightVelocity) ? leftVelocity : rightVelocity;
      if (raised && mirroredVelocity > 0.0012 && this.#trigger("menu_swipe_right", now)) {
        actions.push(this.#action("menu_swipe_right", now, Math.min(1, mirroredVelocity * 500)));
      }
      if (raised && mirroredVelocity < -0.0012 && this.#trigger("menu_swipe_left", now)) {
        actions.push(this.#action("menu_swipe_left", now, Math.min(1, -mirroredVelocity * 500)));
      }
    }
    return actions;
  }

  #trigger(name: string, now: number): boolean {
    const last = this.#lastTriggeredAt.get(name) ?? -Infinity;
    if (now - last < ACTION_COOLDOWN_MS) return false;
    this.#lastTriggeredAt.set(name, now);
    return true;
  }

  #action(name: MotionAction["name"], now: number, confidence: number, durationMs?: number): MotionAction {
    return {
      name,
      phase: "triggered",
      confidence,
      occurredAtMs: now,
      ...(durationMs === undefined ? {} : { durationMs }),
    };
  }
}
