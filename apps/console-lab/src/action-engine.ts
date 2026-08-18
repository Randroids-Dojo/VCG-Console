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

interface Measurements {
  centerX?: number;
  shoulderY?: number;
  hipY?: number;
  ankleY?: number;
  shoulderWidth?: number;
}

export type SustainedActionName = "player_join" | "menu_select" | "menu_back" | "pause";

export type ActionChronologyFault =
  | "frame-timestamp-order-invalid"
  | "publication-time-regressed"
  | "sequence-invalid"
  | "sequence-not-increasing"
  | "source-changed"
  | "source-time-regressed"
  | "timestamp-quality-changed";

interface HoldState {
  name: SustainedActionName;
  startedAtMs: number;
  triggered: boolean;
  lastConfidence: number;
}

export const ACTION_HOLD_THRESHOLDS_MS = {
  player_join: 450,
  menu_select: 450,
  menu_back: 650,
  pause: 1_100,
} as const satisfies Readonly<Record<SustainedActionName, number>>;
const ACTION_COOLDOWN_MS = 650;

export type ActionContext = "shell" | "game" | "overlay";

/** Where the hands are sitting, relative to hanging at rest. */
export type HandZone = "rest" | "home" | "left" | "right" | "up" | "down" | "both";

/**
 * What the gesture recognizer is seeing right now, for the diagnostics drawer.
 *
 * A menu gesture is a position, so this reports the position rather than any
 * progress: which zone the hand is in, and how far it has travelled out of the
 * home position as a fraction of the distance a gesture needs.
 */
export interface SweepObservation {
  /** Whether a hand is up at all. A hand at your side is not playing. */
  handRaised: boolean;
  zone: HandZone;
  /** Travel out of home, where 1 is the edge of a gesture zone. */
  offset: number;
  /** True when the hand is home, so the next move out is a gesture. */
  armed: boolean;
}

/**
 * Where a raised hand sits across the body, in shoulder widths from the middle
 * of the chest, so the movement is the same near the camera and across the
 * room. A hand held out past the shoulder is out; a hand brought in over the
 * chest is in; the span between them is where a hand naturally rests.
 */
const HAND_REACH_OUT = 1.2;
/**
 * How near the head a hand counts as touching it, in shoulder widths. Well
 * clear of both hands together, which is Select, and of a hand held out.
 */
const HEAD_TOUCH_SPAN = 0.9;
/** Coming back needs less than leaving, so a boundary cannot flicker. */
const HAND_ZONE_SLACK = 0.2;
/**
 * How close the two hands are when they count as brought together, matching
 * the Select gesture so the two can never be read at the same time.
 */
const HANDS_TOGETHER_SPAN = 0.7;


function point(player: PlayerMotion, name: CoreLandmarkName): Point | undefined {
  const landmark = player.coreLandmarks.find((candidate) => candidate.name === name);
  return landmark?.observed ? landmark.position : undefined;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointOrUndefined(a: Point | undefined, b: Point | undefined): Point | undefined {
  return a && b ? midpoint(a, b) : (a ?? b);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export class ActionEngine {
  readonly #baselineSamples: Baseline[] = [];
  readonly #lastTriggeredAt = new Map<MotionAction["name"], number>();
  readonly #latchedActions = new Set<MotionAction["name"]>();
  #baseline: Baseline | undefined;
  #sweep: SweepObservation = {
    handRaised: false,
    zone: "rest",
    offset: 0,
    armed: false,
  };
  #handZone: HandZone = "rest";
  #previousAtMs = 0;
  #lastFrameSequence: number | undefined;
  #lastPublishedAtMs: number | undefined;
  #lastSource: MotionFrame["source"] | undefined;
  #lastSourceTimestampMs: number | undefined;
  #lastTimestampQuality:
    | MotionFrame["capabilities"]["timestampQuality"]
    | undefined;
  #chronologyFault: ActionChronologyFault | undefined;
  #handsHold: HoldState | undefined;
  #armsHold: HoldState | undefined;
  #joined = false;
  #joinRequiresRelease = false;

  enrich(frame: MotionFrame, context: ActionContext = "shell"): MotionFrame {
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
      players: frame.players.map((player) => ({
        ...player,
        actions: [],
      })),
    };
    if (this.#chronologyFault) return this.#suppressActions(enrichedFrame);
    const chronologyFault = this.#chronologyFaultFor(frame);
    if (chronologyFault) {
      this.#enterChronologyFault(chronologyFault);
      return this.#suppressActions(enrichedFrame);
    }
    this.#recordChronology(frame);

    const now = frame.publishedAtMs;
    if (enrichedFrame.health !== "ready") {
      this.#resetGestureContinuity();
      return {
        ...enrichedFrame,
        players: enrichedFrame.players.map((player) => ({ ...player, actions: [] })),
      };
    }
    const player = enrichedFrame.players[0];
    if (!player) {
      this.#resetGestureContinuity();
      return enrichedFrame;
    }

    const measurements = this.#measure(player);
    const baselineSample = this.#completeBaseline(measurements);
    if (baselineSample) this.#captureBaseline(baselineSample);
    const actions = this.#recognize(player, measurements, now, context);
    const enrichedPlayer: PlayerMotion = {
      ...player,
      state: this.#joined ? "joined" : "candidate",
      actions,
    };
    this.#previousAtMs = now;
    return { ...enrichedFrame, players: [enrichedPlayer, ...enrichedFrame.players.slice(1)] };
  }

  join(): void {
    this.#joined = true;
    this.#joinRequiresRelease = false;
  }

  leave(): void {
    this.#resetRecognitionState();
    this.#joinRequiresRelease = true;
  }

  suspend(): void {
    this.#resetGestureContinuity();
  }

  get chronologyFault(): ActionChronologyFault | undefined {
    return this.#chronologyFault;
  }

  /** What the sweep recognizer saw on the most recent frame. */
  get sweep(): Readonly<SweepObservation> {
    return this.#sweep;
  }

  reset(): void {
    this.#resetRecognitionState();
    this.#lastFrameSequence = undefined;
    this.#lastPublishedAtMs = undefined;
    this.#lastSource = undefined;
    this.#lastSourceTimestampMs = undefined;
    this.#lastTimestampQuality = undefined;
    this.#chronologyFault = undefined;
  }

  #resetRecognitionState(): void {
    this.#baselineSamples.length = 0;
    this.#baseline = undefined;
    this.#lastTriggeredAt.clear();
    this.#resetGestureContinuity();
    this.#joined = false;
    this.#joinRequiresRelease = false;
  }

  #chronologyFaultFor(frame: MotionFrame): ActionChronologyFault | undefined {
    if (!Number.isSafeInteger(frame.sequence) || frame.sequence < 0) {
      return "sequence-invalid";
    }
    if (
      !Number.isFinite(frame.sourceTimestampMs) ||
      !Number.isFinite(frame.inferenceStartedAtMs) ||
      !Number.isFinite(frame.inferenceCompletedAtMs) ||
      !Number.isFinite(frame.publishedAtMs) ||
      frame.sourceTimestampMs > frame.inferenceStartedAtMs ||
      frame.inferenceStartedAtMs > frame.inferenceCompletedAtMs ||
      frame.inferenceCompletedAtMs > frame.publishedAtMs
    ) {
      return "frame-timestamp-order-invalid";
    }
    if (this.#lastSource !== undefined && frame.source !== this.#lastSource) {
      return "source-changed";
    }
    if (
      this.#lastTimestampQuality !== undefined &&
      frame.capabilities.timestampQuality !== this.#lastTimestampQuality
    ) {
      return "timestamp-quality-changed";
    }
    if (
      this.#lastFrameSequence !== undefined &&
      frame.sequence <= this.#lastFrameSequence
    ) {
      return "sequence-not-increasing";
    }
    if (
      this.#lastSourceTimestampMs !== undefined &&
      frame.sourceTimestampMs < this.#lastSourceTimestampMs
    ) {
      return "source-time-regressed";
    }
    if (
      this.#lastPublishedAtMs !== undefined &&
      frame.publishedAtMs < this.#lastPublishedAtMs
    ) {
      return "publication-time-regressed";
    }
    return undefined;
  }

  #recordChronology(frame: MotionFrame): void {
    this.#lastFrameSequence = frame.sequence;
    this.#lastPublishedAtMs = frame.publishedAtMs;
    this.#lastSource = frame.source;
    this.#lastSourceTimestampMs = frame.sourceTimestampMs;
    this.#lastTimestampQuality = frame.capabilities.timestampQuality;
  }

  #enterChronologyFault(fault: ActionChronologyFault): void {
    this.#resetRecognitionState();
    this.#chronologyFault = fault;
  }

  #suppressActions(frame: MotionFrame): MotionFrame {
    return {
      ...frame,
      players: frame.players.map((player, index) => ({
        ...player,
        ...(index === 0 ? { state: "candidate" as const } : {}),
        actions: [],
      })),
    };
  }

  #resetGestureContinuity(): void {
    this.#handsHold = undefined;
    this.#armsHold = undefined;
    this.#resetSpatialContinuity();
  }

  #resetSpatialContinuity(): void {
    this.#handZone = "rest";
    this.#previousAtMs = 0;
    this.#latchedActions.clear();
  }

  #measure(player: PlayerMotion): Measurements {
    const leftShoulder = point(player, "left_shoulder");
    const rightShoulder = point(player, "right_shoulder");
    const leftHip = point(player, "left_hip");
    const rightHip = point(player, "right_hip");
    const leftAnkle = point(player, "left_ankle");
    const rightAnkle = point(player, "right_ankle");
    const shoulders =
      leftShoulder && rightShoulder ? midpoint(leftShoulder, rightShoulder) : undefined;
    const shoulderWidth =
      leftShoulder && rightShoulder
        ? Math.max(0.05, distance(leftShoulder, rightShoulder))
        : undefined;
    const hips = leftHip && rightHip ? midpoint(leftHip, rightHip) : undefined;
    const ankles = leftAnkle && rightAnkle ? midpoint(leftAnkle, rightAnkle) : undefined;
    return {
      ...(hips ? { centerX: hips.x, hipY: hips.y } : {}),
      ...(shoulders && shoulderWidth !== undefined
        ? {
            shoulderY: shoulders.y,
            shoulderWidth,
          }
        : {}),
      ...(ankles ? { ankleY: ankles.y } : {}),
    };
  }

  #completeBaseline(measurements: Measurements): Baseline | undefined {
    const { centerX, shoulderY, hipY, ankleY, shoulderWidth } = measurements;
    if (
      centerX === undefined ||
      shoulderY === undefined ||
      hipY === undefined ||
      ankleY === undefined ||
      shoulderWidth === undefined
    ) {
      return undefined;
    }
    return { centerX, shoulderY, hipY, ankleY, shoulderWidth };
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

  #recognize(
    player: PlayerMotion,
    current: Measurements,
    now: number,
    context: ActionContext,
  ): MotionAction[] {
    const actions: MotionAction[] = [];
    const leftWrist = point(player, "left_wrist");
    const rightWrist = point(player, "right_wrist");
    const leftElbow = point(player, "left_elbow");
    const rightElbow = point(player, "right_elbow");
    const baseline = this.#baseline;

    if (leftWrist && rightWrist && current.shoulderWidth !== undefined) {
      const together = distance(leftWrist, rightWrist) < current.shoulderWidth * 0.52;
      if (!together && this.#joinRequiresRelease) {
        this.#joinRequiresRelease = false;
      }
      const name = this.#joined ? "menu_select" : "player_join";
      const confidence = Math.max(0, Math.min(1, 1 - distance(leftWrist, rightWrist) / current.shoulderWidth));
      const enabled =
        context !== "game"
        && (this.#joined || !this.#joinRequiresRelease);
      const update = this.#advanceHold(
        this.#handsHold,
        together && enabled,
        name,
        ACTION_HOLD_THRESHOLDS_MS[name],
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
        ACTION_HOLD_THRESHOLDS_MS[
          this.#handsHold?.name ?? (this.#joined ? "menu_select" : "player_join")
        ],
        0,
        now,
        false,
      );
      this.#handsHold = update.state;
      actions.push(...update.actions);
    }

    const leftShoulder = point(player, "left_shoulder");
    const rightShoulder = point(player, "right_shoulder");
    if (
      leftWrist &&
      rightWrist &&
      leftShoulder &&
      rightShoulder &&
      current.shoulderWidth !== undefined &&
      current.shoulderY !== undefined
    ) {
      // Folding the arms means each wrist has travelled past the middle of the
      // body, to the side its own shoulder is not on.
      //
      // Which image side a shoulder appears on depends on whether the frame is
      // mirrored, so the test reads the body's own orientation rather than
      // assuming one. Assuming it meant that in an unmirrored frame both
      // conditions were satisfied by arms hanging at rest, and Back fired
      // continuously.
      const midX = (leftShoulder.x + rightShoulder.x) / 2;
      const margin = current.shoulderWidth * 0.15;
      const past = (wrist: Point, shoulder: Point): boolean =>
        Math.sign(wrist.x - midX) === -Math.sign(shoulder.x - midX)
        && Math.abs(wrist.x - midX) > margin;
      // Chest-level, so a sweep above a shoulder is never read as a fold.
      const bothBelowShoulders =
        leftWrist.y > current.shoulderY && rightWrist.y > current.shoulderY;
      const crossed = bothBelowShoulders
        && past(leftWrist, leftShoulder)
        && past(rightWrist, rightShoulder)
        && Math.abs(leftWrist.y - rightWrist.y) < current.shoulderWidth;
      const name = context === "game" ? "pause" : "menu_back";
      const thresholdMs = ACTION_HOLD_THRESHOLDS_MS[name];
      const update = this.#advanceHold(this.#armsHold, crossed, name, thresholdMs, crossed ? 0.9 : 0, now, true);
      this.#armsHold = update.state;
      actions.push(...update.actions);
    } else {
      const fallbackName = this.#armsHold?.name ?? (context === "game" ? "pause" : "menu_back");
      const update = this.#advanceHold(
        this.#armsHold,
        false,
        fallbackName,
        ACTION_HOLD_THRESHOLDS_MS[fallbackName],
        0,
        now,
        true,
      );
      this.#armsHold = update.state;
      actions.push(...update.actions);
    }

    if (this.#joined && baseline && context === "game") {
      const screenShift =
        current.centerX === undefined ? undefined : baseline.centerX - current.centerX;
      const shoulderDrop =
        current.shoulderY === undefined ? undefined : current.shoulderY - baseline.shoulderY;
      const hipRise = current.hipY === undefined ? undefined : baseline.hipY - current.hipY;
      const ankleRise =
        current.ankleY === undefined ? undefined : baseline.ankleY - current.ankleY;
      this.#updateDiscrete(
        "dodge_left",
        screenShift !== undefined &&
          screenShift < (this.#latchedActions.has("dodge_left") ? -0.08 : -0.12),
        now,
        0.8,
        actions,
      );
      this.#updateDiscrete(
        "dodge_right",
        screenShift !== undefined &&
          screenShift > (this.#latchedActions.has("dodge_right") ? 0.08 : 0.12),
        now,
        0.8,
        actions,
      );
      this.#updateDiscrete(
        "duck",
        shoulderDrop !== undefined &&
          shoulderDrop > (this.#latchedActions.has("duck") ? 0.07 : 0.105),
        now,
        0.8,
        actions,
      );
      const jumpActive =
        hipRise !== undefined &&
        ankleRise !== undefined &&
        (this.#latchedActions.has("jump")
          ? hipRise > 0.04 && ankleRise > 0.015
          : hipRise > 0.075 && ankleRise > 0.035);
      this.#updateDiscrete("jump", jumpActive, now, 0.78, actions);
    } else {
      for (const name of ["dodge_left", "dodge_right", "duck", "jump"] as const) {
        this.#updateDiscrete(name, false, now, 0, actions);
      }
    }

    if (
      this.#joined &&
      context !== "game" &&
      leftWrist &&
      rightWrist &&
      current.shoulderY !== undefined &&
      this.#previousAtMs > 0
    ) {
      // Where the hand is, not how fast it moved.
      //
      // A sweep and the return that follows it are the same movement at the
      // same speed in opposite directions, so no speed threshold can tell them
      // apart. Reading position does: a raised hand rests above its own
      // shoulder, and carrying it away from there is the gesture. Coming back
      // is just coming back.
      const hand = this.#activeHand(player, current);
      const zone = hand?.zone ?? "rest";
      const previousZone = this.#handZone;
      // A gesture is the step out of the home position, so a hand arriving
      // from anywhere else -- including from another zone, or from below the
      // shoulder -- has to pass through home before it counts again.
      const leftHome = previousZone === "home" && zone !== "home";
      this.#handZone = zone;
      this.#updateDiscrete("menu_swipe_left", leftHome && zone === "left", now, 0.9, actions);
      this.#updateDiscrete("menu_swipe_right", leftHome && zone === "right", now, 0.9, actions);
      this.#updateDiscrete("menu_swipe_up", leftHome && zone === "up", now, 0.9, actions);
      this.#updateDiscrete("menu_swipe_down", leftHome && zone === "down", now, 0.9, actions);
      this.#sweep = {
        handRaised: hand?.raised ?? false,
        zone,
        offset: hand?.offset ?? 0,
        armed: zone === "home",
      };
    } else {
      this.#updateDiscrete("menu_swipe_right", false, now, 0, actions);
      this.#updateDiscrete("menu_swipe_left", false, now, 0, actions);
      this.#updateDiscrete("menu_swipe_up", false, now, 0, actions);
      this.#updateDiscrete("menu_swipe_down", false, now, 0, actions);
      this.#handZone = "rest";
      this.#sweep = { handRaised: false, zone: "rest", offset: 0, armed: false };
    }
    return sortMotionActions(actions);
  }

  /**
   * Reads an arm's posture as one of the gesture zones.
   *
   * Each arm has two easy positions either side of hanging at rest: the hand
   * held out away from the body, and the hand brought up to touch the head.
   * Nothing has to be held at a precise height, and the elbow can be bent or
   * straight. Which arm carries the movement picks the axis: the right arm
   * moves focus left and right, the left arm moves it up and down.
   *
   * Direction is taken from the body rather than the image, so it does not
   * matter which way round the camera presents the player.
   */
  #activeHand(
    player: PlayerMotion,
    current: Measurements,
  ): { zone: HandZone; offset: number; raised: boolean } | undefined {
    const leftShoulder = point(player, "left_shoulder");
    const rightShoulder = point(player, "right_shoulder");
    const shoulderWidth = current.shoulderWidth ?? this.#baseline?.shoulderWidth;
    const hipY = current.hipY ?? this.#baseline?.hipY;
    if (!leftShoulder || !rightShoulder || !shoulderWidth || hipY === undefined) {
      return undefined;
    }
    const midX = (leftShoulder.x + rightShoulder.x) / 2;
    const held = this.#handZone !== "home" && this.#handZone !== "rest";
    const head = point(player, "nose")
      ?? midpointOrUndefined(point(player, "left_ear"), point(player, "right_ear"));

    // Holding both hands together is Select. It wins outright, so a gesture
    // and a selection can never be read from the same posture.
    const leftWrist = point(player, "left_wrist");
    const rightWrist = point(player, "right_wrist");
    if (
      leftWrist && rightWrist
      && distance(leftWrist, rightWrist) < shoulderWidth * HANDS_TOGETHER_SPAN
    ) {
      return { zone: "home", offset: 0, raised: true };
    }

    const arms = (
      [
        ["left", leftShoulder, leftWrist],
        ["right", rightShoulder, rightWrist],
      ] as const
    ).flatMap(([side, shoulder, wrist]) => {
      // An arm hanging at rest has its hand at hip height.
      if (!wrist || wrist.y >= hipY) return [];
      const outward = Math.sign(shoulder.x - midX) || (side === "left" ? -1 : 1);
      return [{
        side,
        reach: ((wrist.x - midX) / shoulderWidth) * outward,
        onHead: head !== undefined
          && distance(wrist, head) < shoulderWidth * HEAD_TOUCH_SPAN,
      }];
    });
    // Both arms hanging is the home position, not an absence of input: it is
    // where every gesture starts and the place each one returns to.
    if (arms.length === 0) return { zone: "home", offset: 0, raised: false };

    const out = held ? HAND_REACH_OUT - HAND_ZONE_SLACK : HAND_REACH_OUT;

    // Both hands out at once is its own posture, and deliberately not a
    // direction: holding both arms wide would otherwise read as whichever
    // hand happened to reach further.
    if (arms.length === 2 && arms.every((arm) => arm.reach >= out)) {
      return { zone: "both", offset: 1, raised: true };
    }

    const touching = arms.filter((arm) => arm.onHead);
    // One hand on the head is a direction. Two is nothing in particular, so it
    // is left alone rather than guessed at.
    if (touching.length === 1) {
      return { zone: touching[0]!.side === "right" ? "left" : "down", offset: 1, raised: true };
    }
    if (touching.length === 0) {
      const reaching = arms.reduce((best, arm) => (arm.reach > best.reach ? arm : best));
      if (reaching.reach >= out) {
        return { zone: reaching.side === "right" ? "right" : "up", offset: 1, raised: true };
      }
      return { zone: "home", offset: Math.max(0, reaching.reach / HAND_REACH_OUT), raised: true };
    }
    return { zone: "home", offset: 0, raised: true };
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
