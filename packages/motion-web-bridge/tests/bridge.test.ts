import {
  COORDINATE_SPEC_VERSION,
  CORE_LANDMARK_NAMES,
  MEDIAPIPE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MotionFrameSchema,
  type MotionCapabilities,
  type TrackerHealthEvent,
} from "@vcg/motion-contract";
import { describe, expect, it } from "vitest";
import {
  bridgeClientMessageJsonSchema,
  bridgeServerMessageJsonSchema,
  MOTION_BRIDGE_PROTOCOL_VERSION,
  MotionBridgeClient,
  MotionBridgeHost,
  projectFrame,
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
  coordinateSpecVersion: COORDINATE_SPEC_VERSION,
  coordinateSystem: "image.normalized.top-left",
  worldCoordinateSystem: "player.metric.hip-origin.provider-axes",
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
          { name: "menu_back", phase: "triggered", confidence: 1, occurredAtMs: sequence, durationMs: 450 },
        ],
      },
    ],
  });
}

function readyHealth(sequence = 0, occurredAtMs = 0): TrackerHealthEvent {
  return {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence,
    source: "synthetic",
    occurredAtMs,
    status: "ready",
    reason: "healthy",
    controlAvailability: "full",
  };
}

function connectedPair(options: { maximumFramesPerSecond?: number; sessionTtlMs?: number; now?: () => number } = {}) {
  const link = fakeLink();
  const host = new MotionBridgeHost({
    receiver: link.hostReceiver,
    allowedOrigins: [link.gameOrigin],
    capabilities,
    initialHealth: readyHealth(),
    ...(options.maximumFramesPerSecond === undefined ? {} : { maximumFramesPerSecond: options.maximumFramesPerSecond }),
    ...(options.sessionTtlMs === undefined ? {} : { sessionTtlMs: options.sessionTtlMs }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const received: ReturnType<typeof frame>[] = [];
  const receivedHealth: TrackerHealthEvent[] = [];
  const scheduled = new Set<unknown>();
  const client = new MotionBridgeClient({
    receiver: link.gameReceiver,
    target: link.hostTarget,
    targetOrigin: link.consoleOrigin,
    clientId: "sample-game",
    request: { requiredProfiles: ["body.core17", "actions.obstacle.v1"], optionalProfiles: [] },
    onFrame: (value) => received.push(value),
    onHealth: (value) => receivedHealth.push(value),
    schedule: (callback) => {
      scheduled.add(callback);
      return callback;
    },
    cancelScheduled: (handle) => scheduled.delete(handle),
  });
  host.start();
  client.start();
  return { ...link, host, client, received, receivedHealth, scheduled };
}

describe("Motion web bridge", () => {
  it("negotiates capabilities and projects frames to the granted profiles", () => {
    const { client, host, received, receivedHealth } = connectedPair();
    expect(client.state).toBe("connected");
    expect(receivedHealth).toEqual([readyHealth()]);
    expect(host.publish(frame())).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0]?.capabilities.profiles).toEqual(["body.core17", "actions.obstacle.v1"]);
    expect(received[0]?.players[0]?.richLandmarks).toBeUndefined();
    expect(received[0]?.players[0]?.coreLandmarks[0]?.worldPosition).toBeUndefined();
    expect(received[0]?.players[0]?.actions.map((action) => action.name)).toEqual(["jump"]);
  });

  it("delivers ordered health transitions outside the frame stream", () => {
    const { client, host, received, receivedHealth } = connectedPair();
    const overloaded: TrackerHealthEvent = {
      schemaVersion: MOTION_API_SCHEMA_VERSION,
      sequence: 1,
      source: "synthetic",
      occurredAtMs: 10,
      status: "degraded",
      reason: "overload",
      controlAvailability: "landmarks-only",
    };
    expect(host.publishHealth(overloaded)).toBe(1);
    expect(receivedHealth).toEqual([readyHealth(), overloaded]);
    expect(() => host.publish(frame())).toThrow(/does not match/);

    const degradedFrame = frame();
    degradedFrame.health = "degraded";
    degradedFrame.players = degradedFrame.players.map((player) => ({ ...player, actions: [] }));
    const wrongSourceFrame = structuredClone(degradedFrame);
    wrongSourceFrame.source = "replay";
    expect(() => host.publish(wrongSourceFrame)).toThrow(/source\/health replay\/degraded/);
    expect(host.publish(degradedFrame)).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0]?.health).toBe("degraded");
    expect(received[0]?.players[0]?.actions).toEqual([]);
    expect(() => host.publish({ ...degradedFrame, source: "replay" })).toThrow(/does not match/);
    expect(() => host.publishHealth(overloaded)).toThrow(/sequence must increase/);
    expect(() =>
      host.publishHealth({
        ...overloaded,
        sequence: 2,
        occurredAtMs: 9,
      }),
    ).toThrow(/time cannot move backwards/);

    const restarting: TrackerHealthEvent = {
      schemaVersion: MOTION_API_SCHEMA_VERSION,
      sequence: 2,
      source: "synthetic",
      occurredAtMs: 11,
      status: "starting",
      reason: "restarting",
      controlAvailability: "blocked",
    };
    expect(host.publishHealth(restarting)).toBe(1);
    expect(receivedHealth.at(-1)).toEqual(restarting);
    client.reconnect();
    expect(receivedHealth.at(-1)).toEqual(restarting);
    expect(host.stats().publishedHealthEvents).toBe(2);
  });

  it("rejects bridge v1 and mismatched Motion schemas before creating a session", () => {
    const link = fakeLink();
    const host = new MotionBridgeHost({
      receiver: link.hostReceiver,
      allowedOrigins: [link.gameOrigin],
      capabilities,
      initialHealth: readyHealth(),
    });
    const replies: unknown[] = [];
    const clientTarget: BridgePostTarget = {
      postMessage: (message, targetOrigin) => {
        expect(targetOrigin).toBe(link.gameOrigin);
        replies.push(message);
      },
    };
    host.start();

    for (const data of [
      {
        type: "vcg.motion.hello",
        protocolVersion: 1,
        motionApiSchemaVersion: "0.2.0",
        clientId: "legacy-client",
        request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
      },
      {
        type: "vcg.motion.hello",
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        motionApiSchemaVersion: "0.2.0",
        clientId: "wrong-schema-client",
        request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
      },
    ]) {
      link.hostReceiver.dispatch({ origin: link.gameOrigin, source: clientTarget, data });
      expect(host.publish(frame())).toBe(0);
    }

    expect(replies).toEqual([
      {
        type: "vcg.motion.error",
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        code: "invalid-message",
      },
      {
        type: "vcg.motion.error",
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        code: "invalid-message",
      },
    ]);
    expect(host.stats()).toMatchObject({ acceptedConnections: 0, invalidMessages: 2 });
  });

  it("keeps retrying until a welcome binds bridge v2 to the exact Motion schema", () => {
    const link = fakeLink();
    const scheduled = new Set<() => void>();
    const client = new MotionBridgeClient({
      receiver: link.gameReceiver,
      target: link.hostTarget,
      targetOrigin: link.consoleOrigin,
      clientId: "compatibility-client",
      request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
      onFrame: () => undefined,
      schedule: (callback) => {
        scheduled.add(callback);
        return callback;
      },
      cancelScheduled: (handle) => scheduled.delete(handle as () => void),
    });
    const welcome = {
      type: "vcg.motion.welcome",
      sessionId: "compatible-session",
      capabilities,
      negotiation: { accepted: true, activeProfiles: ["body.core17"], unavailableOptionalProfiles: [] },
      health: readyHealth(),
    };
    client.start();

    link.gameReceiver.dispatch({
      origin: link.consoleOrigin,
      source: link.hostTarget,
      data: { ...welcome, protocolVersion: 1, motionApiSchemaVersion: "0.2.0" },
    });
    link.gameReceiver.dispatch({
      origin: link.consoleOrigin,
      source: link.hostTarget,
      data: {
        ...welcome,
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        motionApiSchemaVersion: "0.2.0",
      },
    });
    expect(client.state).toBe("connecting");
    expect(client.sessionId).toBeUndefined();
    expect(scheduled.size).toBe(1);

    link.gameReceiver.dispatch({
      origin: link.consoleOrigin,
      source: link.hostTarget,
      data: {
        ...welcome,
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
      },
    });
    expect(client.state).toBe("connected");
    expect(client.sessionId).toBe("compatible-session");
    expect(scheduled.size).toBe(0);
  });

  it("removes world data when only the request advertises the world profile", () => {
    const source = frame();
    const { worldCoordinateSystem: _worldCoordinateSystem, ...nonWorldCapabilities } = source.capabilities;
    source.capabilities = {
      ...nonWorldCapabilities,
      profiles: source.capabilities.profiles.filter((profile) => profile !== "body.world3d"),
    };
    const projected = projectFrame(source, ["body.core17", "body.world3d"]);
    expect(projected.capabilities.profiles).toEqual(["body.core17"]);
    expect(projected.capabilities.worldCoordinateSystem).toBeUndefined();
    expect(projected.players[0]?.coreLandmarks[0]?.worldPosition).toBeUndefined();
    expect(projected.players[0]?.richLandmarks).toBeUndefined();
  });

  it("silently ignores hostile origins and rejects missing capabilities", () => {
    const link = fakeLink();
    const host = new MotionBridgeHost({
      receiver: link.hostReceiver,
      allowedOrigins: [link.gameOrigin],
      capabilities,
      initialHealth: readyHealth(),
    });
    const hostileReplies: unknown[] = [];
    const hostileTarget: BridgePostTarget = { postMessage: (message) => hostileReplies.push(message) };
    host.start();
    link.hostReceiver.dispatch({
      origin: "https://hostile.example",
      source: hostileTarget,
      data: {
        type: "vcg.motion.hello",
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
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
      capabilities: {
        profiles: ["body.core17"],
        maxPlayers: capabilities.maxPlayers,
        coordinateSpecVersion: capabilities.coordinateSpecVersion,
        coordinateSystem: capabilities.coordinateSystem,
        timestampQuality: capabilities.timestampQuality,
      },
      initialHealth: readyHealth(),
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

  it("reattaches its listener when reconnecting after stop", () => {
    const { client, host, gameReceiver } = connectedPair();
    client.stop();
    expect(gameReceiver.listeners.size).toBe(0);
    client.reconnect();
    expect(gameReceiver.listeners.size).toBe(1);
    expect(client.state).toBe("connected");
    expect(host.publish(frame())).toBe(1);
  });

  it("evicts sessions that stop acknowledging frames", () => {
    let now = 1_000;
    const link = fakeLink();
    const host = new MotionBridgeHost({
      receiver: link.hostReceiver,
      allowedOrigins: [link.gameOrigin],
      capabilities,
      initialHealth: readyHealth(),
      now: () => now,
      sessionTtlMs: 1_000,
    });
    const deadTarget: BridgePostTarget = { postMessage: () => undefined };
    host.start();
    link.hostReceiver.dispatch({
      origin: link.gameOrigin,
      source: deadTarget,
      data: {
        type: "vcg.motion.hello",
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
        clientId: "dead-client",
        request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
      },
    });
    expect(host.publish(frame())).toBe(1);
    now = 1_500;
    expect(host.publish(frame(2))).toBe(0);
    now = 2_001;
    expect(host.publish(frame(3))).toBe(0);
    expect(host.stats().expiredSessions).toBe(1);
    expect(host.stats().rateLimitedFrames).toBe(1);
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

    const host = new MotionBridgeHost({
      receiver: link.hostReceiver,
      allowedOrigins: [link.gameOrigin],
      capabilities,
      initialHealth: readyHealth(),
    });
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
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
        sessionId: "future-session",
        capabilities,
        negotiation: { accepted: true, activeProfiles: ["body.core17"], unavailableOptionalProfiles: [] },
        health: readyHealth(),
        futureField: "ignored",
      },
    });
    expect(client.sessionId).toBe("future-session");
  });

  it("exports forward-compatible wire schemas", () => {
    const containsClosedObject = (value: unknown): boolean => {
      if (!value || typeof value !== "object") return false;
      if ((value as Record<string, unknown>).additionalProperties === false) return true;
      return Object.values(value).some(containsClosedObject);
    };
    expect(containsClosedObject(bridgeClientMessageJsonSchema)).toBe(false);
    expect(containsClosedObject(bridgeServerMessageJsonSchema)).toBe(false);
  });

  it("exports the world-profile cross rule for every server capability object", () => {
    const capabilityRules: unknown[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      const properties = node.properties as Record<string, unknown> | undefined;
      if (properties?.profiles && properties.coordinateSpecVersion && properties.worldCoordinateSystem) {
        capabilityRules.push(node.allOf);
      }
      Object.values(node).forEach(visit);
    };
    visit(bridgeServerMessageJsonSchema);
    expect(capabilityRules).toHaveLength(2);
    for (const rule of capabilityRules) expect(rule).toEqual([
      {
        if: { properties: { profiles: { contains: { const: "body.world3d" } } }, required: ["profiles"] },
        then: { required: ["worldCoordinateSystem"] },
        else: { not: { required: ["worldCoordinateSystem"] } },
      },
    ]);
  });
});
