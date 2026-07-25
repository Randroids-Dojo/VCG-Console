import { describe, expect, it } from "vitest";
import {
  LOCAL_WEB_READINESS_MAX_TRANSITIONS,
  LocalWebReadinessChallengeSchema,
  LocalWebReadinessClient,
  LocalWebReadinessError,
  LocalWebReadinessHost,
  LocalWebReadinessStatusSchema,
  type BridgeMessageEvent,
  type BridgeMessageListener,
  type BridgeMessageReceiver,
  type BridgePostTarget,
  type LocalWebReadinessChallenge,
  type LocalWebReadinessStatus,
} from "../src";

class FakeReceiver implements BridgeMessageReceiver {
  readonly listeners = new Set<BridgeMessageListener>();

  addEventListener(
    _type: "message",
    listener: BridgeMessageListener,
  ): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: "message",
    listener: BridgeMessageListener,
  ): void {
    this.listeners.delete(listener);
  }

  dispatch(event: BridgeMessageEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function fakeLink(
  gameOrigin = "http://127.0.0.1:4173",
  consoleOrigin = "https://console.example",
) {
  const hostReceiver = new FakeReceiver();
  const gameReceiver = new FakeReceiver();
  const hostMessages: unknown[] = [];
  const gameMessages: unknown[] = [];
  const hostTarget: BridgePostTarget = {
    postMessage(data, targetOrigin) {
      hostMessages.push(data);
      if (targetOrigin === consoleOrigin) {
        hostReceiver.dispatch({
          data,
          origin: gameOrigin,
          source: gameTarget,
        });
      }
    },
  };
  const gameTarget: BridgePostTarget = {
    postMessage(data, targetOrigin) {
      gameMessages.push(data);
      if (targetOrigin === gameOrigin) {
        gameReceiver.dispatch({
          data,
          origin: consoleOrigin,
          source: hostTarget,
        });
      }
    },
  };
  return {
    hostReceiver,
    gameReceiver,
    hostTarget,
    gameTarget,
    gameOrigin,
    consoleOrigin,
    hostMessages,
    gameMessages,
  };
}

const release = {
  gameId: "tiny-local-game",
  version: "1.2.3",
  manifestSha256: "a".repeat(64),
} as const;
const instanceId = "instance.local.0001";
const challengeOne = "A".repeat(43);
const challengeTwo = "B".repeat(43);

function hostFor(
  link: ReturnType<typeof fakeLink>,
  options: {
    challengeId?: string;
    expiresAfterMs?: number;
    now?: () => number;
    onStateChange?: ConstructorParameters<
      typeof LocalWebReadinessHost
    >[0]["onStateChange"];
  } = {},
) {
  return new LocalWebReadinessHost({
    receiver: link.hostReceiver,
    target: link.gameTarget,
    targetOrigin: link.gameOrigin,
    ...release,
    instanceId,
    expiresAfterMs: options.expiresAfterMs ?? 30_000,
    createChallengeId: () => options.challengeId ?? challengeOne,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.onStateChange === undefined
      ? {}
      : { onStateChange: options.onStateChange }),
  });
}

function clientFor(
  link: ReturnType<typeof fakeLink>,
  now?: () => number,
) {
  return new LocalWebReadinessClient({
    receiver: link.gameReceiver,
    target: link.hostTarget,
    targetOrigin: link.consoleOrigin,
    ...release,
    ...(now === undefined ? {} : { now }),
  });
}

function status(
  challenge: LocalWebReadinessChallenge,
  sequence: number,
  phase: LocalWebReadinessStatus["phase"],
  reason: LocalWebReadinessStatus["reason"],
): LocalWebReadinessStatus {
  return LocalWebReadinessStatusSchema.parse({
    type: "vcg.runtime.readiness.status",
    protocolVersion: 1,
    runtime: "local-web",
    gameId: challenge.gameId,
    version: challenge.version,
    manifestSha256: challenge.manifestSha256,
    instanceId: challenge.instanceId,
    challengeId: challenge.challengeId,
    sequence,
    phase,
    reason,
  });
}

describe("local-web explicit readiness", () => {
  it("binds starting and ready to one host challenge and exact release", () => {
    const link = fakeLink();
    const observed: string[] = [];
    const client = clientFor(link);
    const host = hostFor(link, {
      onStateChange: (snapshot) => observed.push(snapshot.state),
    });

    client.start();
    host.start();
    expect(host.snapshot()).toMatchObject({
      state: "starting",
      reason: "none",
      sequence: 0,
      acceptedTransitions: 1,
    });
    client.publishReady();
    expect(host.snapshot()).toMatchObject({
      state: "ready",
      reason: "none",
      sequence: 1,
      acceptedTransitions: 2,
    });
    expect(observed).toEqual(["waiting", "starting", "ready"]);
    expect(link.gameMessages[0]).toEqual({
      type: "vcg.runtime.readiness.challenge",
      protocolVersion: 1,
      runtime: "local-web",
      ...release,
      instanceId,
      challengeId: challengeOne,
      expiresAfterMs: 30_000,
    });
    expect(link.hostMessages).toHaveLength(2);
  });

  it("supports bounded degraded recovery and terminal failure", () => {
    const link = fakeLink();
    const client = clientFor(link);
    const host = hostFor(link);
    client.start();
    host.start();

    client.publishDegraded("dependency-unavailable");
    expect(host.snapshot()).toMatchObject({
      state: "degraded",
      reason: "dependency-unavailable",
      sequence: 1,
    });
    client.publishReady();
    expect(host.snapshot()).toMatchObject({
      state: "ready",
      reason: "none",
      sequence: 2,
    });
    client.publishFailed("runtime-error");
    expect(host.snapshot()).toMatchObject({
      state: "failed",
      reason: "runtime-error",
      sequence: 3,
    });
    expect(() => client.publishReady()).toThrow(
      /client transition is invalid/u,
    );
  });

  it("ignores hostile source/origin and rejects cross-release or replay binding", () => {
    const link = fakeLink();
    const host = hostFor(link);
    host.start();
    const challenge = LocalWebReadinessChallengeSchema.parse(
      link.gameMessages[0],
    );
    const starting = status(challenge, 0, "starting", "none");

    link.hostReceiver.dispatch({
      origin: "https://hostile.example",
      source: link.gameTarget,
      data: starting,
    });
    link.hostReceiver.dispatch({
      origin: link.gameOrigin,
      source: { postMessage: () => undefined },
      data: starting,
    });
    link.hostReceiver.dispatch({
      origin: link.gameOrigin,
      source: link.gameTarget,
      data: { ...starting, version: "9.9.9" },
    });
    expect(host.snapshot()).toMatchObject({
      state: "waiting",
      hostileMessages: 2,
      rejectedBindings: 1,
      acceptedTransitions: 0,
    });

    link.hostReceiver.dispatch({
      origin: link.gameOrigin,
      source: link.gameTarget,
      data: starting,
    });
    link.hostReceiver.dispatch({
      origin: link.gameOrigin,
      source: link.gameTarget,
      data: starting,
    });
    expect(host.snapshot()).toMatchObject({
      state: "starting",
      acceptedTransitions: 1,
      invalidTransitions: 1,
    });
  });

  it("requires contiguous sequences and the closed phase graph", () => {
    const link = fakeLink();
    const host = hostFor(link);
    host.start();
    const challenge = LocalWebReadinessChallengeSchema.parse(
      link.gameMessages[0],
    );
    const dispatch = (data: unknown) =>
      link.hostReceiver.dispatch({
        origin: link.gameOrigin,
        source: link.gameTarget,
        data,
      });

    dispatch(status(challenge, 1, "ready", "none"));
    dispatch(status(challenge, 0, "ready", "none"));
    expect(host.snapshot()).toMatchObject({
      state: "waiting",
      invalidTransitions: 2,
    });
    dispatch(status(challenge, 0, "starting", "none"));
    dispatch(status(challenge, 2, "ready", "none"));
    dispatch(status(challenge, 1, "ready", "none"));
    dispatch(status(challenge, 2, "starting", "none"));
    dispatch(status(challenge, 2, "failed", "initialization-failed"));
    dispatch(status(challenge, 3, "degraded", "recovering"));
    expect(host.snapshot()).toMatchObject({
      state: "failed",
      sequence: 2,
      acceptedTransitions: 3,
      invalidTransitions: 5,
    });
  });

  it("expires on the host monotonic deadline and refuses late publication", () => {
    let now = 100;
    const clock = () => now;
    const link = fakeLink();
    const client = clientFor(link, clock);
    const host = hostFor(link, {
      now: clock,
      expiresAfterMs: 1_000,
    });
    client.start();
    host.start();
    now = 1_100;

    expect(host.snapshot()).toMatchObject({
      state: "expired",
      reason: "expired",
      sequence: 0,
    });
    expect(() => client.publishReady()).toThrow(/challenge expired/u);
    expect(host.resendChallenge()).toBe(false);
  });

  it("invalidates an old challenge when a replacement instance starts", () => {
    const link = fakeLink();
    const first = hostFor(link, { challengeId: challengeOne });
    first.start();
    const staleChallenge = LocalWebReadinessChallengeSchema.parse(
      link.gameMessages[0],
    );
    first.stop();

    const second = hostFor(link, { challengeId: challengeTwo });
    second.start();
    link.hostReceiver.dispatch({
      origin: link.gameOrigin,
      source: link.gameTarget,
      data: status(staleChallenge, 0, "starting", "none"),
    });
    expect(second.snapshot()).toMatchObject({
      state: "waiting",
      rejectedBindings: 1,
    });

    const currentChallenge = LocalWebReadinessChallengeSchema.parse(
      link.gameMessages.at(-1),
    );
    link.hostReceiver.dispatch({
      origin: link.gameOrigin,
      source: link.gameTarget,
      data: status(currentChallenge, 0, "starting", "none"),
    });
    expect(second.snapshot().state).toBe("starting");
  });

  it("makes challenge retransmission idempotent for the client", () => {
    const link = fakeLink();
    const client = clientFor(link);
    const host = hostFor(link);
    host.start();
    expect(host.snapshot().state).toBe("waiting");
    expect(link.gameMessages).toHaveLength(1);

    client.start();
    expect(host.resendChallenge()).toBe(true);
    expect(host.snapshot().state).toBe("starting");
    expect(link.hostMessages).toHaveLength(1);
    expect(link.gameMessages).toHaveLength(2);
    expect(host.resendChallenge()).toBe(false);
    const challenge = LocalWebReadinessChallengeSchema.parse(
      link.gameMessages[0],
    );
    link.gameReceiver.dispatch({
      origin: link.consoleOrigin,
      source: link.hostTarget,
      data: challenge,
    });
    expect(link.hostMessages).toHaveLength(1);
  });

  it("rejects unknown fields, free text, private data, and phase/reason confusion", () => {
    const link = fakeLink();
    const host = hostFor(link);
    host.start();
    const challenge = LocalWebReadinessChallengeSchema.parse(
      link.gameMessages[0],
    );
    const base = status(challenge, 0, "starting", "none");
    for (const data of [
      { ...base, detail: "user profile path and private token" },
      { ...base, profileId: "child-profile" },
      { ...base, reason: "runtime-error" },
      { ...base, runtime: "native" },
      { ...base, sequence: -1 },
    ]) {
      link.hostReceiver.dispatch({
        origin: link.gameOrigin,
        source: link.gameTarget,
        data,
      });
    }
    expect(host.snapshot()).toMatchObject({
      state: "waiting",
      invalidMessages: 5,
      acceptedTransitions: 0,
    });
  });

  it("bounds one challenge to sixty-four accepted transitions", () => {
    const link = fakeLink();
    const client = clientFor(link);
    const host = hostFor(link);
    client.start();
    host.start();
    client.publishReady();
    for (
      let sequence = 2;
      sequence < LOCAL_WEB_READINESS_MAX_TRANSITIONS;
      sequence += 1
    ) {
      if (sequence % 2 === 0) client.publishDegraded("recovering");
      else client.publishReady();
    }
    expect(host.snapshot()).toMatchObject({
      state: "ready",
      sequence: 63,
      acceptedTransitions: LOCAL_WEB_READINESS_MAX_TRANSITIONS,
    });
    expect(() => client.publishDegraded("performance")).toThrow(
      /transition limit/u,
    );
  });

  it("requires safe release identity, high-entropy IDs, exact origins, and monotonic time", () => {
    const link = fakeLink();
    expect(() =>
      new LocalWebReadinessHost({
        receiver: link.hostReceiver,
        target: link.gameTarget,
        targetOrigin: "http://game.example",
        ...release,
        instanceId,
        expiresAfterMs: 30_000,
        createChallengeId: () => challengeOne,
      }),
    ).toThrow(/HTTPS or loopback origin/u);
    expect(() =>
      hostFor(link, { challengeId: "short" }).start(),
    ).toThrow();
    expect(() =>
      new LocalWebReadinessClient({
        receiver: link.gameReceiver,
        target: link.hostTarget,
        targetOrigin: `${link.consoleOrigin}/path`,
        ...release,
      }),
    ).toThrow(/exact HTTPS or loopback origin/u);

    let now = 10;
    const host = hostFor(fakeLink(), { now: () => now });
    host.start();
    now = 9;
    expect(() => host.snapshot()).toThrow(
      new LocalWebReadinessError("readiness monotonic clock is invalid"),
    );
  });

  it("removes listeners and clears authority when stopped", () => {
    const link = fakeLink();
    const client = clientFor(link);
    const host = hostFor(link);
    client.start();
    host.start();
    expect(link.gameReceiver.listeners.size).toBe(1);
    expect(link.hostReceiver.listeners.size).toBe(1);

    client.stop();
    host.stop();
    expect(link.gameReceiver.listeners.size).toBe(0);
    expect(link.hostReceiver.listeners.size).toBe(0);
    expect(host.snapshot()).toMatchObject({
      state: "stopped",
      reason: null,
      sequence: null,
    });
    expect(() => client.publishReady()).toThrow(/no active challenge/u);
  });
});
