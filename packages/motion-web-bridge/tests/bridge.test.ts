import {
  CORE_LANDMARK_NAMES,
  MEDIAPIPE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MotionFrameSchema,
  type MotionCapabilities,
} from "@vcg/motion-contract";
import { describe, expect, it } from "vitest";
import {
  MotionBridgeClient,
  MotionBridgeHost,
  type BridgeMessageEvent,
  type BridgeMessageListener,
  type BridgeMessageReceiver,
  type BridgePostTarget,
} from "../src";

class FakeReceiver implements BridgeMessageReceiver {
  readonly listeners = new Set<BridgeMessageListener>();

  addEventListener(_type: "message", listener: BridgeMessageListener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: BridgeMessageListener): void {
    this.listeners.delete(listener);
  }

  dispatch(event: BridgeMessageEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function fakeLink(gameOrigin = "https://game.example", consoleOrigin = "https://console.example") {
  const hostReceiver = new FakeReceiver();
  const gameReceiver = new FakeReceiver();
  const hostTarget: BridgePostTarget = {
    postMessage(data, targetOrigin) {
      if (targetOrigin === consoleOrigin) hostReceiver.dispatch({ data, origin: gameOrigin, source: gameTarget });
    },
  };
  const gameTarget: BridgePostTarget = {
    postMessage(data, targetOrigin) {
      if (targetOrigin === gameOrigin) gameReceiver.dispatch({ data, origin: consoleOrigin, source: hostTarget });
    },
  };
  return { hostReceiver, gameReceiver, hostTarget, gameTarget, gameOrigin, consoleOrigin };
}

const capabilities: MotionCapabilities = {
  profiles: ["body.core17", "body.mediapipe33", "body.world3d", "actions.obstacle.v1", "actions.shell.v1"],
  maxPlayers: 1,
  coordinateSystem: "image.normalized.top-left",
  timestampQuality: "capture-arrival",
};

function frame(sequence = 1) {
  const landmark = (name: string) => ({
    name,
    position: { x: 0.5, y: 0.5, z: 0.1 },
    worldPosition: { xMeters: 1, yMeters: 2, zMeters: 3 },
    visibility: 1,
    observed: true,
  });
  return MotionFrameSchema.parse({
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence,
    source: "synthetic",
    sourceTimestampMs: sequence,
    inferenceStartedAtMs: sequence,
    inferenceCompletedAtMs: sequence,
    publishedAtMs: sequence,
    health: "ready",
    capabilities,
    players: [
      {
        id: "player-1",
        sessionSlot: 1,
        confidence: 1,
        state: "joined",
        coreLandmarks: CORE_LANDMARK_NAMES.map(landmark),
        richLandmarks: MEDIAPIPE_LANDMARK_NAMES.map(landmark),
        bounds: { left: 0.2, top: 0.1, right: 0.8, bottom: 0.9 },
        actions: [
          { name: "jump", phase: "triggered", confidence: 1, occurredAtMs: sequence },
          { name: "menu_back", phase: "triggered", confidence: 1, occurredAtMs: sequence },
        ],
      },
    ],
  });
}

function connectedPair(options: { maximumFramesPerSecond?: number; now?: () => number } = {}) {
  const link = fakeLink();
  const host = new MotionBridgeHost({
    receiver: link.hostReceiver,
    allowedOrigins: [link.gameOrigin],
    capabilities,
    ...(options.maximumFramesPerSecond === undefined ? {} : { maximumFramesPerSecond: options.maximumFramesPerSecond }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const received: ReturnType<typeof frame>[] = [];
  const scheduled = new Set<unknown>();
  const client = new MotionBridgeClient({
    receiver: link.gameReceiver,
    target: link.hostTarget,
    targetOrigin: link.consoleOrigin,
    clientId: "sample-game",
    request: { requiredProfiles: ["body.core17", "actions.obstacle.v1"], optionalProfiles: [] },
    onFrame: (value) => received.push(value),
    schedule: (callback) => {
      scheduled.add(callback);
      return callback;
    },
    cancelScheduled: (handle) => scheduled.delete(handle),
  });
  host.start();
  client.start();
  return { ...link, host, client, received, scheduled };
}

describe("Motion web bridge", () => {
  it("negotiates capabilities and projects frames to the granted profiles", () => {
    const { client, host, received } = connectedPair();
    expect(client.state).toBe("connected");
    expect(host.publish(frame())).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0]?.capabilities.profiles).toEqual(["body.core17", "actions.obstacle.v1"]);
    expect(received[0]?.players[0]?.richLandmarks).toBeUndefined();
    expect(received[0]?.players[0]?.coreLandmarks[0]?.worldPosition).toBeUndefined();
    expect(received[0]?.players[0]?.actions.map((action) => action.name)).toEqual(["jump"]);
  });

  it("silently ignores hostile origins and rejects missing capabilities", () => {
    const link = fakeLink();
    const host = new MotionBridgeHost({ receiver: link.hostReceiver, allowedOrigins: [link.gameOrigin], capabilities });
    const hostileReplies: unknown[] = [];
    const hostileTarget: BridgePostTarget = { postMessage: (message) => hostileReplies.push(message) };
    host.start();
    link.hostReceiver.dispatch({
      origin: "https://hostile.example",
      source: hostileTarget,
      data: {
        type: "vcg.motion.hello",
        protocolVersion: 1,
        clientId: "hostile",
        request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
      },
    });
    expect(hostileReplies).toEqual([]);
    expect(host.stats().hostileOriginMessages).toBe(1);

    const states: string[] = [];
    const client = new MotionBridgeClient({
      receiver: link.gameReceiver,
      target: link.hostTarget,
      targetOrigin: link.consoleOrigin,
      clientId: "needs-depth",
      request: { requiredProfiles: ["body.core17", "body.world3d"], optionalProfiles: [] },
      onFrame: () => undefined,
      onStateChange: (state) => states.push(state),
      schedule: () => 1,
      cancelScheduled: () => undefined,
    });
    const limitedHost = new MotionBridgeHost({
      receiver: link.hostReceiver,
      allowedOrigins: [link.gameOrigin],
      capabilities: { ...capabilities, profiles: ["body.core17"] },
    });
    host.stop();
    limitedHost.start();
    client.start();
    expect(client.state).toBe("rejected");
    expect(states).toEqual(["connecting", "rejected"]);
  });

  it("rate-limits publication independently for each negotiated session", () => {
    let now = 1_000;
    const { host, received } = connectedPair({ maximumFramesPerSecond: 10, now: () => now });
    expect(host.publish(frame(1))).toBe(1);
    now += 50;
    expect(host.publish(frame(2))).toBe(0);
    now += 50;
    expect(host.publish(frame(3))).toBe(1);
    expect(received.map((value) => value.sequence)).toEqual([1, 3]);
    expect(host.stats().rateLimitedFrames).toBe(1);
  });

  it("replaces the session through an explicit reconnect handshake", () => {
    const { client, host, scheduled } = connectedPair();
    const firstSession = client.sessionId;
    expect(scheduled.size).toBe(0);
    client.reconnect();
    expect(client.state).toBe("connected");
    expect(client.sessionId).not.toBe(firstSession);
    expect(host.stats().acceptedConnections).toBe(2);
    expect(scheduled.size).toBe(0);
  });

  it("removes a cleanly stopped client session", () => {
    const { client, host } = connectedPair();
    client.stop();
    expect(client.state).toBe("idle");
    expect(host.publish(frame())).toBe(0);
  });

  it("retries the handshake until the console host becomes available", () => {
    const link = fakeLink();
    const scheduled = new Set<() => void>();
    const client = new MotionBridgeClient({
      receiver: link.gameReceiver,
      target: link.hostTarget,
      targetOrigin: link.consoleOrigin,
      clientId: "late-console",
      request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
      onFrame: () => undefined,
      schedule: (callback) => {
        scheduled.add(callback);
        return callback;
      },
      cancelScheduled: (handle) => scheduled.delete(handle as () => void),
    });
    client.start();
    expect(client.state).toBe("connecting");
    expect(scheduled.size).toBe(1);

    const host = new MotionBridgeHost({ receiver: link.hostReceiver, allowedOrigins: [link.gameOrigin], capabilities });
    host.start();
    const retry = [...scheduled][0]!;
    scheduled.delete(retry);
    retry();
    expect(client.state).toBe("connected");
    expect(scheduled.size).toBe(0);
  });

  it("drops a burst instead of queueing unbounded motion frames", () => {
    const { host, received } = connectedPair({ maximumFramesPerSecond: 60, now: () => 1_000 });
    for (let sequence = 0; sequence < 10_000; sequence += 1) host.publish(frame(sequence));
    expect(received).toHaveLength(1);
    expect(host.stats().rateLimitedFrames).toBe(9_999);
  });

  it("ignores unknown wire fields while validating known data", () => {
    const { client, hostTarget, gameReceiver, consoleOrigin } = connectedPair();
    gameReceiver.dispatch({
      origin: consoleOrigin,
      source: hostTarget,
      data: {
        type: "vcg.motion.welcome",
        protocolVersion: 1,
        sessionId: "future-session",
        capabilities,
        negotiation: { accepted: true, activeProfiles: ["body.core17"], unavailableOptionalProfiles: [] },
        futureField: "ignored",
      },
    });
    expect(client.sessionId).toBe("future-session");
  });
});
