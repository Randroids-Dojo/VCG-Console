import { MotionBridgeHost, type BridgeMessageReceiver } from "@vcg/motion-web-bridge";
import { syntheticFrame } from "./synthetic";

const status = document.querySelector<HTMLElement>("#host-status");
const publish = document.querySelector<HTMLButtonElement>("#publish");
if (!status || !publish) throw new Error("Bridge host fixture is incomplete");

const host = new MotionBridgeHost({
  receiver: window as unknown as BridgeMessageReceiver,
  allowedOrigins: [location.origin],
  capabilities: {
    profiles: ["body.core17"],
    maxPlayers: 1,
    coordinateSpecVersion: "0.1.0",
    coordinateSystem: "image.normalized.top-left",
    timestampQuality: "replay",
  },
});
host.start();

let sequence = 0;
publish.addEventListener("click", () => {
  const recipients = host.publish(syntheticFrame(sequence, performance.now()));
  status.textContent = `PUBLISHED ${sequence} TO ${recipients}`;
  sequence += 1;
});

const statusTimer = window.setInterval(() => {
  if (host.stats().acceptedConnections > 0 && status.textContent === "WAITING") status.textContent = "CONNECTED";
}, 25);
window.addEventListener("pagehide", () => {
  window.clearInterval(statusTimer);
  host.stop();
});
