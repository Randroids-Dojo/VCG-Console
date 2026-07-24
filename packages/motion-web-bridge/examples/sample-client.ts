import { MotionBridgeClient, type BridgeMessageReceiver, type BridgePostTarget } from "../src";

/** A cooperating web game must receive these values from its reviewed launch configuration. */
export function connectSampleMotionGame(consoleWindow: Window, consoleOrigin: string): MotionBridgeClient {
  let motionActionsAvailable = false;
  const client = new MotionBridgeClient({
    receiver: window as unknown as BridgeMessageReceiver,
    target: consoleWindow as unknown as BridgePostTarget,
    targetOrigin: consoleOrigin,
    clientId: "vcg-sample-game",
    request: {
      requiredProfiles: ["body.core17", "actions.obstacle.v1"],
      optionalProfiles: ["body.world3d"],
    },
    onHealth(event) {
      motionActionsAvailable = event.controlAvailability === "full";
      console.info("VCG tracker health", event.status, event.reason);
    },
    onFrame(frame) {
      const player = frame.players[0];
      if (!player) return;
      if (!motionActionsAvailable) return;
      for (const action of player.actions) {
        if (action.phase === "triggered") console.info("VCG action", action.name, action.confidence);
      }
    },
  });
  client.start();
  return client;
}
