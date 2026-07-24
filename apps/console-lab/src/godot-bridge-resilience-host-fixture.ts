import {
  COORDINATE_SPEC_VERSION,
  MOTION_API_SCHEMA_VERSION,
  type TrackerHealthEvent,
} from "@vcg/motion-contract";
import {
  MotionBridgeHost,
  type BridgeMessageReceiver,
} from "@vcg/motion-web-bridge";
import { syntheticFrame } from "./synthetic";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing resilience fixture element ${selector}`);
  return element;
}

const status = requiredElement<HTMLElement>("#host-status");
const accepted = requiredElement<HTMLOutputElement>("#accepted-count");
const active = requiredElement<HTMLOutputElement>("#active-count");
const peak = requiredElement<HTMLOutputElement>("#peak-count");
const pending = requiredElement<HTMLOutputElement>("#pending-count");
const published = requiredElement<HTMLOutputElement>("#published-count");
const health = requiredElement<HTMLOutputElement>("#health-count");
const invalidAcknowledgements =
  requiredElement<HTMLOutputElement>("#invalid-ack-count");
const publish = requiredElement<HTMLButtonElement>("#publish");
const degrade = requiredElement<HTMLButtonElement>("#degrade");
const recover = requiredElement<HTMLButtonElement>("#recover");
const reload = requiredElement<HTMLButtonElement>("#reload");
const game = requiredElement<HTMLIFrameElement>("#game");
const gameOrigin = requiredElement<HTMLMetaElement>(
  'meta[name="vcg-game-origin"]',
).content;
if (!gameOrigin) throw new Error("Godot resilience game origin is missing");

const host = new MotionBridgeHost({
  receiver: window as unknown as BridgeMessageReceiver,
  allowedOrigins: [gameOrigin],
  capabilities: {
    profiles: ["body.core17"],
    maxPlayers: 1,
    coordinateSpecVersion: COORDINATE_SPEC_VERSION,
    coordinateSystem: "image.normalized.top-left",
    timestampQuality: "replay",
  },
  authorizedProfiles: ["body.core17"],
  initialHealth: {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence: 0,
    source: "synthetic",
    occurredAtMs: 0,
    status: "ready",
    reason: "healthy",
    controlAvailability: "full",
  },
});
host.start();

let frameSequence = 0;
let healthSequence = 0;

publish.addEventListener("click", () => {
  const currentSequence = frameSequence;
  const recipients = host.publish(
    syntheticFrame(currentSequence, 10 + currentSequence * 100),
  );
  frameSequence += 1;
  status.textContent = `PUBLISHED ${currentSequence} TO ${recipients}`;
});

degrade.addEventListener("click", () => {
  healthSequence += 1;
  const event: TrackerHealthEvent = {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence: healthSequence,
    source: "synthetic",
    occurredAtMs: 100,
    status: "degraded",
    reason: "overload",
    controlAvailability: "landmarks-only",
  };
  status.textContent = `DEGRADED TO ${host.publishHealth(event)}`;
});

recover.addEventListener("click", () => {
  healthSequence += 1;
  const event: TrackerHealthEvent = {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence: healthSequence,
    source: "synthetic",
    occurredAtMs: 200,
    status: "ready",
    reason: "healthy",
    controlAvailability: "full",
  };
  status.textContent = `RECOVERED TO ${host.publishHealth(event)}`;
});

reload.addEventListener("click", () => {
  status.textContent = "RELOADING";
  game.src = game.src;
});

const statusTimer = window.setInterval(() => {
  const stats = host.stats();
  accepted.textContent = String(stats.acceptedConnections);
  active.textContent = String(stats.activeSessions);
  peak.textContent = String(stats.peakSessions);
  pending.textContent = String(stats.pendingFrames);
  published.textContent = String(stats.publishedFrames);
  health.textContent = String(stats.publishedHealthEvents);
  invalidAcknowledgements.textContent =
    String(stats.invalidAcknowledgements);
  if (stats.acceptedConnections === 1 && status.textContent === "WAITING") {
    status.textContent = "CONNECTED";
  } else if (
    stats.acceptedConnections === 2
    && status.textContent === "RELOADING"
  ) {
    status.textContent = "RECONNECTED";
  }
}, 10);

window.addEventListener("pagehide", () => {
  window.clearInterval(statusTimer);
  host.stop();
});
