import {
  COORDINATE_SPEC_VERSION,
  MOTION_API_SCHEMA_VERSION,
} from "@vcg/motion-contract";
import {
  MotionBridgeHost,
  type BridgeMessageReceiver,
} from "@vcg/motion-web-bridge";
import { syntheticFrame } from "./synthetic";

const status = document.querySelector<HTMLElement>("#host-status");
const accepted = document.querySelector<HTMLOutputElement>("#accepted-count");
const active = document.querySelector<HTMLOutputElement>("#active-count");
const pending = document.querySelector<HTMLOutputElement>("#pending-count");
const invalidAcknowledgements =
  document.querySelector<HTMLOutputElement>("#invalid-ack-count");
const publish = document.querySelector<HTMLButtonElement>("#publish");
const gameOrigin = document.querySelector<HTMLMetaElement>(
  'meta[name="vcg-game-origin"]',
)?.content;
if (
  !status
  || !accepted
  || !active
  || !pending
  || !invalidAcknowledgements
  || !publish
  || !gameOrigin
) {
  throw new Error("Godot bridge host fixture is incomplete");
}

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

let sequence = 0;
publish.addEventListener("click", () => {
  const currentSequence = sequence;
  const recipients = host.publish(
    syntheticFrame(currentSequence, currentSequence * 100),
  );
  sequence += 1;
  status.textContent = `PUBLISHED ${currentSequence} TO ${recipients}`;
});

const statusTimer = window.setInterval(() => {
  const stats = host.stats();
  accepted.textContent = String(stats.acceptedConnections);
  active.textContent = String(stats.activeSessions);
  pending.textContent = String(stats.pendingFrames);
  invalidAcknowledgements.textContent =
    String(stats.invalidAcknowledgements);
  if (stats.acceptedConnections > 0 && status.textContent === "WAITING") {
    status.textContent = "CONNECTED";
  }
}, 10);

window.addEventListener("pagehide", () => {
  window.clearInterval(statusTimer);
  host.stop();
});
