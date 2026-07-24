import { COORDINATE_SPEC_VERSION } from "@vcg/motion-contract";
import { MotionBridgeHost, type BridgeMessageReceiver } from "@vcg/motion-web-bridge";
import { syntheticFrame } from "./synthetic";

const status = document.querySelector<HTMLElement>("#host-status");
const hostileCount = document.querySelector<HTMLOutputElement>("#hostile-count");
const publish = document.querySelector<HTMLButtonElement>("#publish");
const gameOrigin = document.querySelector<HTMLMetaElement>('meta[name="vcg-game-origin"]')?.content;
if (!status || !hostileCount || !publish || !gameOrigin) {
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
});
host.start();

let sequence = 0;
publish.addEventListener("click", () => {
  const recipients = host.publish(syntheticFrame(sequence, performance.now()));
  status.textContent = `PUBLISHED ${sequence} TO ${recipients}`;
  sequence += 1;
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
