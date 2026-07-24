import {
  MotionFrameSchema,
  MotionTracePlayer,
  TrackerHealthEventSchema,
  type MotionFrame,
  type MotionTrace,
  type TrackerHealthEvent,
} from "@vcg/motion-contract";
import {
  MotionBridgeClient,
  type BridgeMessageReceiver,
  type BridgePostTarget,
} from "../src";

export type TinyControllerAction = "left" | "right" | "jump" | "duck";

export interface TinyGameSnapshot {
  readonly lane: 0 | 1 | 2;
  readonly stance: "standing" | "jumping" | "ducking";
  readonly score: number;
  readonly motionReady: boolean;
  readonly inputSource: "controller" | "motion" | "waiting";
  readonly status: string;
}

export interface TinyLiveConnection {
  readonly receiver: BridgeMessageReceiver;
  readonly target: BridgePostTarget;
  readonly targetOrigin: string;
  readonly clientId?: string;
}

/**
 * Minimal engine-independent consumer shared by live bridge, replay, and
 * controller paths. It never sees a camera object or provider-specific type.
 */
export class TinyMotionGame {
  #snapshot: TinyGameSnapshot = {
    lane: 1,
    stance: "standing",
    score: 0,
    motionReady: false,
    inputSource: "waiting",
    status: "WAITING FOR PLAYER",
  };

  constructor(private readonly onChange: (snapshot: Readonly<TinyGameSnapshot>) => void) {
    this.#publish();
  }

  get snapshot(): Readonly<TinyGameSnapshot> {
    return { ...this.#snapshot };
  }

  acceptHealth(value: TrackerHealthEvent | unknown): void {
    const health = TrackerHealthEventSchema.parse(value);
    const ready = health.status === "ready" && health.controlAvailability === "full";
    this.#snapshot = {
      ...this.#snapshot,
      motionReady: ready,
      inputSource: ready ? this.#snapshot.inputSource : "waiting",
      status: ready ? "MOTION READY" : `MOTION ${health.reason.replaceAll("-", " ").toUpperCase()}`,
    };
    this.#publish();
  }

  acceptFrame(value: MotionFrame | unknown): void {
    const frame = MotionFrameSchema.parse(value);
    const player = frame.players[0];
    if (frame.health !== "ready" || !player) {
      this.#snapshot = {
        ...this.#snapshot,
        motionReady: false,
        inputSource: "waiting",
        status: player ? "MOTION DEGRADED" : "PLAYER NOT FOUND",
      };
      this.#publish();
      return;
    }

    const leftHip = player.coreLandmarks.find((landmark) => landmark.name === "left_hip");
    const rightHip = player.coreLandmarks.find((landmark) => landmark.name === "right_hip");
    const hipCenter = leftHip && rightHip ? (leftHip.position.x + rightHip.position.x) / 2 : 0.5;
    const landmarkLane: 0 | 1 | 2 = hipCenter < 0.44 ? 0 : hipCenter > 0.56 ? 2 : 1;
    this.#snapshot = {
      ...this.#snapshot,
      lane: landmarkLane,
      motionReady: true,
      inputSource: "motion",
      status: "LANDMARKS ACTIVE",
    };

    for (const action of player.actions) {
      if (action.phase !== "triggered") continue;
      if (action.name === "dodge_left") this.#apply("left", "motion");
      if (action.name === "dodge_right") this.#apply("right", "motion");
      if (action.name === "jump") this.#apply("jump", "motion");
      if (action.name === "duck") this.#apply("duck", "motion");
    }
    this.#publish();
  }

  acceptController(action: TinyControllerAction): void {
    this.#apply(action, "controller");
    this.#publish();
  }

  #apply(action: TinyControllerAction, source: "controller" | "motion"): void {
    this.#snapshot = {
      ...this.#snapshot,
      lane:
        action === "left"
          ? Math.max(0, this.#snapshot.lane - 1) as 0 | 1 | 2
          : action === "right"
            ? Math.min(2, this.#snapshot.lane + 1) as 0 | 1 | 2
            : this.#snapshot.lane,
      stance: action === "jump" ? "jumping" : action === "duck" ? "ducking" : "standing",
      score: this.#snapshot.score + 100,
      inputSource: source,
      status: `${source.toUpperCase()} ${action.toUpperCase()}`,
    };
  }

  #publish(): void {
    this.onChange(this.snapshot);
  }
}

export function connectTinyLiveGame(
  game: TinyMotionGame,
  connection: TinyLiveConnection,
): MotionBridgeClient {
  const client = new MotionBridgeClient({
    receiver: connection.receiver,
    target: connection.target,
    targetOrigin: connection.targetOrigin,
    clientId: connection.clientId ?? "vcg-tiny-motion-game",
    request: {
      requiredProfiles: ["body.core17"],
      optionalProfiles: ["actions.obstacle.v1"],
    },
    onHealth: (health) => game.acceptHealth(health),
    onFrame: (frame) => game.acceptFrame(frame),
  });
  client.start();
  return client;
}

export function createTinyGameReplay(
  game: TinyMotionGame,
  trace: MotionTrace,
): MotionTracePlayer {
  return new MotionTracePlayer(trace, { onFrame: (frame) => game.acceptFrame(frame) });
}
