import { describe, expect, it } from "vitest";
import type { NativeLaunchSnapshot } from "../native-host-client";
import { nativeLifecycleDetail } from "./native-lifecycle";

function snapshot(
  state: NativeLaunchSnapshot["state"],
  detailCode: string,
): NativeLaunchSnapshot {
  return {
    protocolVersion: "0.1.0",
    requestId: "1".repeat(32),
    gameId: "retro-2048",
    profileId: "profile-randy",
    state,
    sequence: 2,
    detailCode,
    replayed: false,
  };
}

describe("nativeLifecycleDetail", () => {
  it("keeps watchdog health distinct from compositor readiness", () => {
    expect(nativeLifecycleDetail(snapshot("running", "WATCHDOG_HEALTHY"))).toBe(
      "Runtime heartbeat observed · waiting for compositor window readiness",
    );
    expect(nativeLifecycleDetail(snapshot("running", "WATCHDOG_HEALTH_RECOVERED"))).toBe(
      "Runtime heartbeat recovered · waiting for compositor window readiness",
    );
  });

  it("describes bounded restart progress without claiming a second launch", () => {
    expect(nativeLifecycleDetail(snapshot("running", "WATCHDOG_RESTARTING"))).toBe(
      "Host watchdog is restarting the unhealthy process",
    );
    expect(nativeLifecycleDetail(snapshot("running", "PROCESS_RESTARTED"))).toBe(
      "Host process restarted · waiting for a fresh runtime heartbeat",
    );
  });

  it("retains preparation and process-only fallbacks", () => {
    expect(nativeLifecycleDetail(snapshot("preparing", "WATCHDOG_STARTING"))).toBe(
      "Host is starting the supervised runtime",
    );
    expect(nativeLifecycleDetail(snapshot("preparing", "PACKAGE_RESOLVING"))).toBe(
      "Host is preparing the verified package",
    );
    expect(nativeLifecycleDetail(snapshot("running", "PROCESS_STARTED"))).toBe(
      "Host process started · waiting for compositor window readiness",
    );
  });
});
