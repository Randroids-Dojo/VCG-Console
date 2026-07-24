const hostileStatus = document.querySelector<HTMLElement>("#hostile-status");
if (!hostileStatus) throw new Error("Hostile bridge fixture is incomplete");

window.addEventListener("message", () => {
  hostileStatus.textContent = "REPLIED";
});
window.parent.postMessage(
  {
    type: "vcg.motion.hello",
    protocolVersion: 1,
    clientId: "unapproved-origin",
    request: { requiredProfiles: ["body.core17"], optionalProfiles: [] },
  },
  location.origin,
);
hostileStatus.textContent = "NO RESPONSE";

export {};
