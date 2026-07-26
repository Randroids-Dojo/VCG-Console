import { MOTION_API_SCHEMA_VERSION } from "@vcg/motion-contract";
import {
  BridgeServerMessageSchema,
  MOTION_BRIDGE_PROTOCOL_VERSION,
  type BridgePostTarget,
} from "@vcg/motion-web-bridge";

const status = document.querySelector<HTMLElement>("#stalled-status");
const output = document.querySelector<HTMLOutputElement>("#stalled-frame");
if (!status || !output) throw new Error("Stalled bridge fixture is incomplete");

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  const parsed = BridgeServerMessageSchema.safeParse(event.data);
  if (!parsed.success) return;
  if (parsed.data.type === "vcg.motion.welcome") {
    status.textContent = "CONNECTED / ACKS DISABLED";
  } else if (parsed.data.type === "vcg.motion.frame") {
    output.textContent = `FRAME ${parsed.data.frame.sequence} / ACK WITHHELD`;
  }
});

(window.parent as unknown as BridgePostTarget).postMessage(
  {
    type: "vcg.motion.hello",
    protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
    motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
    clientId: "playwright-stalled-game",
    request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
  },
  location.origin,
);
