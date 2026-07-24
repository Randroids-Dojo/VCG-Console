import {
  actionBelongsToProfile,
  MOTION_API_SCHEMA_VERSION,
  MotionFrameSchema,
  MotionCapabilitiesSchema,
  negotiateCapabilities,
  type MotionCapabilities,
  type MotionFrame,
  type MotionProfile,
} from "@vcg/motion-contract";
import { BridgeClientMessageSchema, MOTION_BRIDGE_PROTOCOL_VERSION, type BridgeServerMessage } from "./protocol";
import type { BridgeMessageEvent, BridgeMessageListener, BridgeMessageReceiver, BridgePostTarget } from "./window-types";

interface Session {
  id: string;
  clientId: string;
  origin: string;
  target: BridgePostTarget;
  profiles: MotionProfile[];
  lastFrameAtMs: number;
  unacknowledgedSinceMs?: number;
}

export interface MotionBridgeHostStats {
  acceptedConnections: number;
  rejectedConnections: number;
  hostileOriginMessages: number;
  invalidMessages: number;
  publishedFrames: number;
  rateLimitedFrames: number;
  expiredSessions: number;
}

export interface MotionBridgeHostOptions {
  receiver: BridgeMessageReceiver;
  allowedOrigins: readonly string[];
  capabilities: MotionCapabilities;
  maximumFramesPerSecond?: number;
  sessionTtlMs?: number;
  now?: () => number;
}

function exactOrigin(value: string): string {
  const url = new URL(value);
  if (url.origin !== value) throw new Error(`Bridge origin must be exact and path-free: ${value}`);
  return url.origin;
}

export class MotionBridgeHost {
  readonly #receiver: BridgeMessageReceiver;
  readonly #allowedOrigins: Set<string>;
  readonly #capabilities: MotionCapabilities;
  readonly #minimumFrameIntervalMs: number;
  readonly #sessionTtlMs: number;
  readonly #now: () => number;
  readonly #sessions = new Map<BridgePostTarget, Session>();
  readonly #stats: MotionBridgeHostStats = {
    acceptedConnections: 0,
    rejectedConnections: 0,
    hostileOriginMessages: 0,
    invalidMessages: 0,
    publishedFrames: 0,
    rateLimitedFrames: 0,
    expiredSessions: 0,
  };
  #started = false;
  #nextSession = 1;

  readonly #listener: BridgeMessageListener = (event) => this.#receive(event);

  constructor(options: MotionBridgeHostOptions) {
    this.#receiver = options.receiver;
    this.#allowedOrigins = new Set(options.allowedOrigins.map(exactOrigin));
    if (this.#allowedOrigins.size === 0) throw new Error("Motion bridge requires at least one allowed origin");
    this.#capabilities = MotionCapabilitiesSchema.parse(options.capabilities);
    const maximumFramesPerSecond = options.maximumFramesPerSecond ?? 60;
    if (!Number.isFinite(maximumFramesPerSecond) || maximumFramesPerSecond <= 0 || maximumFramesPerSecond > 240) {
      throw new Error("maximumFramesPerSecond must be between 0 and 240");
    }
    this.#minimumFrameIntervalMs = 1_000 / maximumFramesPerSecond;
    this.#sessionTtlMs = options.sessionTtlMs ?? 30_000;
    if (!Number.isFinite(this.#sessionTtlMs) || this.#sessionTtlMs < 1_000) {
      throw new Error("sessionTtlMs must be at least 1000");
    }
    this.#now = options.now ?? (() => performance.now());
  }

  start(): void {
    if (this.#started) return;
    this.#receiver.addEventListener("message", this.#listener);
    this.#started = true;
  }

  stop(): void {
    if (!this.#started) return;
    this.#receiver.removeEventListener("message", this.#listener);
    this.#sessions.clear();
    this.#started = false;
  }

  stats(): Readonly<MotionBridgeHostStats> {
    return { ...this.#stats };
  }

  publish(value: MotionFrame): number {
    const frame = MotionFrameSchema.parse(value);
    const now = this.#now();
    let recipients = 0;
    for (const [target, session] of this.#sessions) {
      if (session.unacknowledgedSinceMs !== undefined) {
        if (now - session.unacknowledgedSinceMs > this.#sessionTtlMs) {
          this.#sessions.delete(target);
          this.#stats.expiredSessions += 1;
        } else {
          this.#stats.rateLimitedFrames += 1;
        }
        continue;
      }
      if (now - session.lastFrameAtMs < this.#minimumFrameIntervalMs) {
        this.#stats.rateLimitedFrames += 1;
        continue;
      }
      session.lastFrameAtMs = now;
      session.unacknowledgedSinceMs ??= now;
      this.#send(session.target, session.origin, {
        type: "vcg.motion.frame",
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        sessionId: session.id,
        frame: projectFrame(frame, session.profiles),
      });
      recipients += 1;
      this.#stats.publishedFrames += 1;
    }
    return recipients;
  }

  #receive(event: BridgeMessageEvent): void {
    if (!this.#allowedOrigins.has(event.origin)) {
      this.#stats.hostileOriginMessages += 1;
      return;
    }
    if (!event.source) return;
    const parsed = BridgeClientMessageSchema.safeParse(event.data);
    if (!parsed.success) {
      this.#stats.invalidMessages += 1;
      this.#send(event.source, event.origin, {
        type: "vcg.motion.error",
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        code: "invalid-message",
      });
      return;
    }
    if (parsed.data.type === "vcg.motion.goodbye") {
      const session = this.#sessions.get(event.source);
      if (session?.id === parsed.data.sessionId && session.origin === event.origin) this.#sessions.delete(event.source);
      return;
    }
    if (parsed.data.type === "vcg.motion.ack") {
      const session = this.#sessions.get(event.source);
      if (session?.id === parsed.data.sessionId && session.origin === event.origin) delete session.unacknowledgedSinceMs;
      return;
    }

    const negotiation = negotiateCapabilities(this.#capabilities, parsed.data.request);
    if (!negotiation.accepted) {
      this.#sessions.delete(event.source);
      this.#stats.rejectedConnections += 1;
      this.#send(event.source, event.origin, {
        type: "vcg.motion.rejected",
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        reason: "capability-mismatch",
        negotiation,
      });
      return;
    }

    const session: Session = {
      id: `motion-${this.#nextSession++}`,
      clientId: parsed.data.clientId,
      origin: event.origin,
      target: event.source,
      profiles: negotiation.activeProfiles,
      lastFrameAtMs: -Infinity,
    };
    this.#sessions.set(event.source, session);
    this.#stats.acceptedConnections += 1;
    this.#send(event.source, event.origin, {
      type: "vcg.motion.welcome",
      protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
      motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
      sessionId: session.id,
      capabilities: this.#capabilities,
      negotiation,
    });
  }

  #send(target: BridgePostTarget, origin: string, message: BridgeServerMessage): void {
    target.postMessage(message, origin);
  }
}

export function projectFrame(frame: MotionFrame, profiles: readonly MotionProfile[]): MotionFrame {
  const active = new Set(profiles);
  const includeRich = active.has("body.mediapipe33");
  const includeObstacle = active.has("actions.obstacle.v1");
  const includeShell = active.has("actions.shell.v1");
  const { worldCoordinateSystem, ...portableCapabilities } = frame.capabilities;
  const includeWorld =
    active.has("body.world3d") &&
    frame.capabilities.profiles.includes("body.world3d") &&
    worldCoordinateSystem !== undefined;
  const withoutWorldPosition = <T extends { worldPosition?: unknown }>(landmark: T): T => {
    const projected = { ...landmark };
    delete projected.worldPosition;
    return projected;
  };
  return {
    ...frame,
    capabilities: {
      ...portableCapabilities,
      profiles: frame.capabilities.profiles.filter((profile) => active.has(profile)),
      ...(includeWorld && worldCoordinateSystem ? { worldCoordinateSystem } : {}),
    },
    players: frame.players.map((player) => {
      const { richLandmarks, ...portablePlayer } = player;
      return {
        ...portablePlayer,
        coreLandmarks: player.coreLandmarks.map((landmark) => (includeWorld ? landmark : withoutWorldPosition(landmark))),
        ...(includeRich && richLandmarks
          ? { richLandmarks: richLandmarks.map((landmark) => (includeWorld ? landmark : withoutWorldPosition(landmark))) }
          : {}),
        actions: player.actions.filter(
          (action) =>
            (includeObstacle && actionBelongsToProfile(action.name, "actions.obstacle.v1")) ||
            (includeShell && actionBelongsToProfile(action.name, "actions.shell.v1")),
        ),
      };
    }),
  };
}
