import { COORDINATE_SPEC_VERSION, MOTION_API_SCHEMA_VERSION } from "@vcg/motion-contract";
import { MotionBridgeHost, type BridgeMessageReceiver } from "@vcg/motion-web-bridge";
import { syntheticFrame } from "./synthetic";
import { trackerHealthFixture } from "./tracker-health";

const status = document.querySelector<HTMLElement>("#host-status");
const hostileCount = document.querySelector<HTMLOutputElement>("#hostile-count");
const publish = document.querySelector<HTMLButtonElement>("#publish");
const publishDegradedHealth = document.querySelector<HTMLButtonElement>("#publish-degraded-health");
const publishReadyHealth = document.querySelector<HTMLButtonElement>("#publish-ready-health");
const gameOrigin = document.querySelector<HTMLMetaElement>('meta[name="vcg-game-origin"]')?.content;
if (!status || !hostileCount || !publish || !publishDegradedHealth || !publishReadyHealth || !gameOrigin) {
  throw new Error("Cross-origin bridge host fixture is incomplete");
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
let healthSequence = 1;
publish.addEventListener("click", () => {
  const recipients = host.publish(syntheticFrame(sequence, performance.now()));
  status.textContent = `PUBLISHED ${sequence} TO ${recipients}`;
  sequence += 1;
});
publishDegradedHealth.addEventListener("click", () => {
  const recipients = host.publishHealth(trackerHealthFixture("overload", healthSequence++, performance.now()));
  status.textContent = `HEALTH OVERLOAD TO ${recipients}`;
});
publishReadyHealth.addEventListener("click", () => {
  const recipients = host.publishHealth(trackerHealthFixture("healthy", healthSequence++, performance.now()));
  status.textContent = `HEALTH READY TO ${recipients}`;
});

const statusTimer = window.setInterval(() => {
  const stats = host.stats();
  hostileCount.textContent = String(stats.hostileOriginMessages);
  if (stats.acceptedConnections > 0 && status.textContent === "WAITING") {
    status.textContent = "CONNECTED";
  }
}, 25);
window.addEventListener("pagehide", () => {
  window.clearInterval(statusTimer);
  host.stop();
});
