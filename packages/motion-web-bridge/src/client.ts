import {
  MOTION_API_SCHEMA_VERSION,
  type CapabilityRequest,
  type MotionFrame,
  type TrackerHealthEvent,
} from "@vcg/motion-contract";
import { BridgeServerMessageSchema, MOTION_BRIDGE_PROTOCOL_VERSION } from "./protocol";
import type { BridgeMessageEvent, BridgeMessageListener, BridgeMessageReceiver, BridgePostTarget } from "./window-types";

export type MotionBridgeClientState = "idle" | "connecting" | "connected" | "rejected";

export interface MotionBridgeClientOptions {
  receiver: BridgeMessageReceiver;
  target: BridgePostTarget;
  targetOrigin: string;
  clientId: string;
  request: CapabilityRequest;
  retryMs?: number;
  onFrame: (frame: MotionFrame) => void;
  onHealth?: (event: TrackerHealthEvent) => void;
  onStateChange?: (state: MotionBridgeClientState, detail?: string) => void;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancelScheduled?: (handle: unknown) => void;
}

export class MotionBridgeClient {
  readonly #options: MotionBridgeClientOptions;
  readonly #retryMs: number;
  readonly #schedule: (callback: () => void, delayMs: number) => unknown;
  readonly #cancelScheduled: (handle: unknown) => void;
  #state: MotionBridgeClientState = "idle";
  #sessionId: string | undefined;
  #retryHandle: unknown;
  #listening = false;

  readonly #listener: BridgeMessageListener = (event) => this.#receive(event);

  constructor(options: MotionBridgeClientOptions) {
    const targetOrigin = new URL(options.targetOrigin).origin;
    if (targetOrigin !== options.targetOrigin) throw new Error("Bridge targetOrigin must be exact and path-free");
    this.#options = options;
    this.#retryMs = options.retryMs ?? 1_000;
    if (!Number.isFinite(this.#retryMs) || this.#retryMs < 100) throw new Error("Bridge retryMs must be at least 100");
    this.#schedule = options.schedule ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
    this.#cancelScheduled = options.cancelScheduled ?? ((handle) => globalThis.clearTimeout(handle as number));
  }

  get state(): MotionBridgeClientState {
    return this.#state;
  }

  get sessionId(): string | undefined {
    return this.#sessionId;
  }

  start(): void {
    if (this.#state !== "idle") return;
    this.#attachListener();
    this.reconnect();
  }

  stop(): void {
    this.#cancelRetry();
    if (this.#sessionId) {
      this.#options.target.postMessage(
        { type: "vcg.motion.goodbye", protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION, sessionId: this.#sessionId },
        this.#options.targetOrigin,
      );
    }
    this.#options.receiver.removeEventListener("message", this.#listener);
    this.#listening = false;
    this.#sessionId = undefined;
    this.#setState("idle");
  }

  reconnect(): void {
    this.#attachListener();
    this.#cancelRetry();
    this.#sessionId = undefined;
    this.#setState("connecting");
    this.#sendHello();
  }

  #attachListener(): void {
    if (this.#listening) return;
    this.#options.receiver.addEventListener("message", this.#listener);
    this.#listening = true;
  }

  #sendHello(): void {
    if (this.#state !== "connecting") return;
    this.#retryHandle = this.#schedule(() => this.#sendHello(), this.#retryMs);
    this.#options.target.postMessage(
      {
        type: "vcg.motion.hello",
        protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
        motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
        clientId: this.#options.clientId,
        request: this.#options.request,
      },
      this.#options.targetOrigin,
    );
  }

  #receive(event: BridgeMessageEvent): void {
    if (event.origin !== this.#options.targetOrigin || event.source !== this.#options.target) return;
    const parsed = BridgeServerMessageSchema.safeParse(event.data);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.type === "vcg.motion.welcome") {
      if (!message.negotiation.accepted) return;
      this.#cancelRetry();
      this.#sessionId = message.sessionId;
      this.#setState("connected");
      this.#options.onHealth?.(message.health);
      return;
    }
    if (message.type === "vcg.motion.rejected") {
      this.#cancelRetry();
      this.#sessionId = undefined;
      this.#setState("rejected", message.reason);
      return;
    }
    if (message.type === "vcg.motion.error") {
      this.#options.onStateChange?.(this.#state, message.code);
      return;
    }
    if (message.type === "vcg.motion.health") {
      if (this.#state === "connected" && message.sessionId === this.#sessionId) {
        this.#options.onHealth?.(message.event);
      }
      return;
    }
    if (this.#state === "connected" && message.sessionId === this.#sessionId) {
      this.#options.onFrame(message.frame);
      this.#options.target.postMessage(
        {
          type: "vcg.motion.ack",
          protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
          sessionId: message.sessionId,
          sequence: message.frame.sequence,
        },
        this.#options.targetOrigin,
      );
    }
  }

  #setState(state: MotionBridgeClientState, detail?: string): void {
    this.#state = state;
    this.#options.onStateChange?.(state, detail);
  }

  #cancelRetry(): void {
    if (this.#retryHandle === undefined) return;
    this.#cancelScheduled(this.#retryHandle);
    this.#retryHandle = undefined;
  }
}
