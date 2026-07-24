import { MOTION_API_SCHEMA_VERSION } from "@vcg/motion-contract";
import { MOTION_BRIDGE_PROTOCOL_VERSION } from "@vcg/motion-web-bridge";

const hostileStatus = document.querySelector<HTMLElement>("#hostile-status");
if (!hostileStatus) throw new Error("Hostile bridge fixture is incomplete");

window.addEventListener("message", () => {
  hostileStatus.textContent = "REPLIED";
});
window.parent.postMessage(
  {
    type: "vcg.motion.hello",
    protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
    motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
    clientId: "unapproved-origin",
    request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
  },
  location.origin,
);
hostileStatus.textContent = "NO RESPONSE";

export {};
