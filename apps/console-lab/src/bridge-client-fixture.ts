import { MotionBridgeClient, type BridgeMessageReceiver, type BridgePostTarget } from "@vcg/motion-web-bridge";

const status = document.querySelector<HTMLElement>("#client-status");
const output = document.querySelector<HTMLOutputElement>("#frame-sequence");
if (!status || !output) throw new Error("Bridge client fixture is incomplete");

const client = new MotionBridgeClient({
  receiver: window as unknown as BridgeMessageReceiver,
  target: window.parent as unknown as BridgePostTarget,
  targetOrigin: location.origin,
  clientId: "playwright-cooperative-game",
  request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
  onStateChange: (state) => {
    status.textContent = state.toUpperCase();
  },
  onFrame: (frame) => {
    output.textContent = `FRAME ${frame.sequence}`;
  },
});
client.start();
window.addEventListener("pagehide", () => client.stop());
