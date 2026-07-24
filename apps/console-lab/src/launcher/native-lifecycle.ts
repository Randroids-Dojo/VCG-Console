import type { NativeLaunchSnapshot } from "../native-host-client";

export function nativeLifecycleDetail(snapshot: NativeLaunchSnapshot): string {
  if (snapshot.state !== "running") {
    return snapshot.detailCode === "WATCHDOG_STARTING"
      ? "Host is starting the supervised runtime"
      : "Host is preparing the verified package";
  }
  if (snapshot.detailCode === "WATCHDOG_RESTARTING") {
    return "Host watchdog is restarting the unhealthy process";
  }
  if (snapshot.detailCode === "PROCESS_RESTARTED") {
    return "Host process restarted · waiting for a fresh runtime heartbeat";
  }
  if (snapshot.detailCode === "WATCHDOG_HEALTH_RECOVERED") {
    return "Runtime heartbeat recovered · waiting for compositor window readiness";
  }
  if (snapshot.detailCode === "WATCHDOG_HEALTHY") {
    return "Runtime heartbeat observed · waiting for compositor window readiness";
  }
  return "Host process started · waiting for compositor window readiness";
}
