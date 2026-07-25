import { COORDINATE_SPEC_VERSION, MOTION_API_SCHEMA_VERSION } from "@vcg/motion-contract";
import {
  LocalWebReadinessHost,
  MotionBridgeHost,
  type BridgeMessageReceiver,
  type BridgePostTarget,
} from "@vcg/motion-web-bridge";
import { syntheticFrame } from "./synthetic";
import { trackerHealthFixture } from "./tracker-health";

const status = document.querySelector<HTMLElement>("#host-status");
const hostileCount = document.querySelector<HTMLOutputElement>("#hostile-count");
const readinessState = document.querySelector<HTMLOutputElement>("#readiness-state");
const readinessGeneration = document.querySelector<HTMLOutputElement>(
  "#readiness-generation",
);
const publish = document.querySelector<HTMLButtonElement>("#publish");
const publishDegradedHealth = document.querySelector<HTMLButtonElement>("#publish-degraded-health");
const publishReadyHealth = document.querySelector<HTMLButtonElement>("#publish-ready-health");
const gameOrigin = document.querySelector<HTMLMetaElement>('meta[name="vcg-game-origin"]')?.content;
const game = document.querySelector<HTMLIFrameElement>("#game");
if (
  !status
  || !hostileCount
  || !readinessState
  || !readinessGeneration
  || !publish
  || !publishDegradedHealth
  || !publishReadyHealth
  || !gameOrigin
  || !game
) {
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

const readinessRelease = {
  gameId: "cross-origin-fixture",
  version: "1.0.0",
  manifestSha256: "f".repeat(64),
} as const;
let readinessHost: LocalWebReadinessHost | undefined;
let readinessInstance = 0;
const startReadiness = (): void => {
  readinessHost?.stop();
  const target = game.contentWindow as unknown as BridgePostTarget | null;
  if (!target) throw new Error("Cross-origin readiness target is unavailable");
  readinessInstance += 1;
  readinessGeneration.textContent = String(readinessInstance);
  readinessHost = new LocalWebReadinessHost({
    receiver: window as unknown as BridgeMessageReceiver,
    target,
    targetOrigin: gameOrigin,
    ...readinessRelease,
    instanceId: crypto.randomUUID(),
    expiresAfterMs: 5_000,
    createChallengeId: () => crypto.randomUUID(),
    onStateChange: (snapshot) => {
      readinessState.textContent = `${snapshot.state.toUpperCase()} / ${String(snapshot.reason).toUpperCase()} / ${String(snapshot.sequence)}`;
    },
  });
  readinessHost.start();
};
game.addEventListener("load", startReadiness);
startReadiness();

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
  readinessHost?.resendChallenge();
  hostileCount.textContent = String(stats.hostileOriginMessages);
  if (stats.acceptedConnections > 0 && status.textContent === "WAITING") {
    status.textContent = "CONNECTED";
  }
}, 25);
window.addEventListener("pagehide", () => {
  window.clearInterval(statusTimer);
  readinessHost?.stop();
  host.stop();
});
