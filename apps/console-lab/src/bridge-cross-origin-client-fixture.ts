import {
  LocalWebReadinessClient,
  MotionBridgeClient,
  type BridgeMessageReceiver,
  type BridgePostTarget,
} from "@vcg/motion-web-bridge";

const status = document.querySelector<HTMLElement>("#client-status");
const origin = document.querySelector<HTMLOutputElement>("#client-origin");
const health = document.querySelector<HTMLOutputElement>("#health-state");
const output = document.querySelector<HTMLOutputElement>("#frame-sequence");
const readinessState = document.querySelector<HTMLOutputElement>("#readiness-state");
const degradeReadiness = document.querySelector<HTMLButtonElement>("#degrade-readiness");
const recoverReadiness = document.querySelector<HTMLButtonElement>("#recover-readiness");
const failReadiness = document.querySelector<HTMLButtonElement>("#fail-readiness");
const consoleOrigin = document.querySelector<HTMLMetaElement>(
  'meta[name="vcg-console-origin"]',
)?.content;
if (
  !status
  || !origin
  || !health
  || !output
  || !readinessState
  || !degradeReadiness
  || !recoverReadiness
  || !failReadiness
  || !consoleOrigin
) {
  throw new Error("Cross-origin bridge client fixture is incomplete");
}

origin.textContent = location.origin;
const client = new MotionBridgeClient({
  receiver: window as unknown as BridgeMessageReceiver,
  target: window.parent as unknown as BridgePostTarget,
  targetOrigin: consoleOrigin,
  clientId: "playwright-cross-origin-game",
  request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
  onStateChange: (state) => {
    status.textContent = state.toUpperCase();
  },
  onHealth: (event) => {
    health.textContent = `HEALTH ${event.reason.toUpperCase()} / ${event.controlAvailability.toUpperCase()}`;
  },
  onFrame: (frame) => {
    output.textContent = `FRAME ${frame.sequence}`;
  },
});
client.start();

const readiness = new LocalWebReadinessClient({
  receiver: window as unknown as BridgeMessageReceiver,
  target: window.parent as unknown as BridgePostTarget,
  targetOrigin: consoleOrigin,
  gameId: "cross-origin-fixture",
  version: "1.0.0",
  manifestSha256: "f".repeat(64),
  onChallenge: () => {
    readiness.publishReady();
    readinessState.textContent = "READY";
  },
});
readiness.start();
degradeReadiness.addEventListener("click", () => {
  readiness.publishDegraded("recovering");
  readinessState.textContent = "DEGRADED / RECOVERING";
});
recoverReadiness.addEventListener("click", () => {
  readiness.publishReady();
  readinessState.textContent = "READY";
});
failReadiness.addEventListener("click", () => {
  readiness.publishFailed("runtime-error");
  readinessState.textContent = "FAILED / RUNTIME-ERROR";
});

window.addEventListener("pagehide", () => {
  readiness.stop();
  client.stop();
});
