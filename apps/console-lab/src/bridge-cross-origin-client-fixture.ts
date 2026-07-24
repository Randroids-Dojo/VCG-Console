import { MotionBridgeClient, type BridgeMessageReceiver, type BridgePostTarget } from "@vcg/motion-web-bridge";

const status = document.querySelector<HTMLElement>("#client-status");
const origin = document.querySelector<HTMLOutputElement>("#client-origin");
const health = document.querySelector<HTMLOutputElement>("#health-state");
const output = document.querySelector<HTMLOutputElement>("#frame-sequence");
const consoleOrigin = document.querySelector<HTMLMetaElement>(
  'meta[name="vcg-console-origin"]',
)?.content;
if (!status || !origin || !health || !output || !consoleOrigin) {
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
window.addEventListener("pagehide", () => client.stop());
