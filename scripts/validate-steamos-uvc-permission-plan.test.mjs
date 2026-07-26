import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  STEAMOS_UVC_BLOCKERS,
  STEAMOS_UVC_CHECKS,
  STEAMOS_UVC_METRICS,
  STEAMOS_UVC_ROUTES,
  STEAMOS_UVC_SCENARIOS,
  parseSteamOsUvcPermissionPlanBytes,
  validateSteamOsUvcPermissionPlan,
} from "./validate-steamos-uvc-permission-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(
  resolve(
    root,
    "benchmarks/steamos-camera/steamos-uvc-permission-plan-v1.json",
  ),
);
const tracked = await parseSteamOsUvcPermissionPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked zero-result I-167 plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.accessRoutes.length, 4);
  assert.equal(tracked.lifecycleMatrix.requiredCellCount, 56);
  assert.equal(tracked.lifecycleMatrix.requiredCycleCount, 1120);
  assert.equal(tracked.result.disposition, "blocked");
});

test("rejects stale, reordered, substituted, or missing source bindings", async () => {
  for (const mutate of [
    (plan) => {
      plan.sourceBindings[0].sha256 = "0".repeat(64);
    },
    (plan) => {
      plan.sourceBindings.reverse();
    },
    (plan) => {
      plan.sourceBindings[0].path = "docs/SOURCES.md";
    },
    (plan) => {
      plan.sourceBindings.pop();
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
});

test("keeps the exact unreceived SteamOS target and camera fail-closed", async () => {
  const target = tracked.targetAndDeviceBoundary;
  for (const key of Object.keys(target).slice(1, 6)) {
    const plan = clone();
    plan.targetAndDeviceBoundary[key] = "a".repeat(64);
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
  for (const key of Object.keys(target).slice(6)) {
    const plan = clone();
    plan.targetAndDeviceBoundary[key] = true;
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
  const plan = clone();
  plan.targetAndDeviceBoundary.targetClassId = "ordinary-x86-linux-premium";
  await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
});

test("rejects invented route, device, privacy, recovery, or publication authority", async () => {
  for (const [key, value] of Object.entries(tracked.authorityBoundary)) {
    const plan = clone();
    plan.authorityBoundary[key] = value === null ? "a".repeat(64) : true;
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
});

test("pins all four V4L2 and PipeWire routes without selecting or hiding one", async () => {
  assert.deepEqual(
    tracked.accessRoutes.map((route) => [
      route.routeId,
      route.packageCandidateId,
      route.accessPath,
    ]),
    [...STEAMOS_UVC_ROUTES],
  );
  for (const mutate of [
    (plan) => {
      plan.accessRoutes.pop();
    },
    (plan) => {
      plan.accessRoutes.reverse();
    },
    (plan) => {
      plan.accessRoutes[0].accessPath = "raw-usb";
    },
    (plan) => {
      plan.accessRoutes[0].exactManifestAndPermissionSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.accessRoutes[0].broadAllDeviceGrantRequired = false;
    },
    (plan) => {
      plan.accessRoutes[0].rawUsbPermissionMayProveV4l2NodeAccess = true;
    },
    (plan) => {
      plan.accessRoutes[0].documentationOrOtherRouteMayQualify = true;
    },
    (plan) => {
      plan.accessRoutes[0].failedRouteEvidenceMayBeDiscarded = true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
});

test("requires all 56 route-scenario cells and 1120 visible cycles", async () => {
  assert.deepEqual(tracked.lifecycleMatrix.scenarioIds, [...STEAMOS_UVC_SCENARIOS]);
  for (const mutate of [
    (plan) => {
      plan.lifecycleMatrix.scenarioIds.pop();
    },
    (plan) => {
      plan.lifecycleMatrix.scenarioIds.reverse();
    },
    (plan) => {
      plan.lifecycleMatrix.routeCount = 3;
    },
    (plan) => {
      plan.lifecycleMatrix.validCyclesPerRouteScenario = 19;
    },
    (plan) => {
      plan.lifecycleMatrix.requiredCellCount = 55;
    },
    (plan) => {
      plan.lifecycleMatrix.requiredCycleCount = 1119;
    },
    (plan) => {
      plan.lifecycleMatrix.everyRouteMustBeAttempted = false;
    },
    (plan) => {
      plan.lifecycleMatrix.routeSelectionRuleMustBeFrozenBeforeOperation = false;
    },
    (plan) => {
      plan.lifecycleMatrix.nonselectedRouteFailureMayBeHidden = true;
    },
    (plan) => {
      plan.lifecycleMatrix.selectedRouteMustPassEveryScenario = false;
    },
    (plan) => {
      plan.lifecycleMatrix.otherRouteScenarioOrAggregateMayRescueSelectedRouteFailure =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
});

test("preserves mode, timestamp, control, privacy, and trusted-tracker checks", async () => {
  assert.deepEqual(
    tracked.modeControlAndPrivacyChecks.requiredCheckIds,
    [...STEAMOS_UVC_CHECKS],
  );
  for (const [key, value] of Object.entries(
    tracked.modeControlAndPrivacyChecks,
  ).slice(1)) {
    const plan = clone();
    plan.modeControlAndPrivacyChecks[key] = !value;
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
  for (const mutate of [
    (plan) => {
      plan.modeControlAndPrivacyChecks.requiredCheckIds.pop();
    },
    (plan) => {
      plan.modeControlAndPrivacyChecks.requiredCheckIds.reverse();
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
});

test("requires complete independent capture, permission, privacy, and recovery evidence", async () => {
  assert.deepEqual(tracked.measurements.requiredMetricIds, [...STEAMOS_UVC_METRICS]);
  for (const mutate of [
    (plan) => {
      plan.measurements.requiredMetricIds.pop();
    },
    (plan) => {
      plan.measurements.requiredMetricIds.reverse();
    },
    (plan) => {
      plan.measurements.independentUsbExposurePermissionAudioIndicatorProcessAndRecoveryOraclesRequired =
        false;
    },
    (plan) => {
      plan.measurements.everyScheduledCycleAndFailureMustRemainVisible = false;
    },
    (plan) => {
      plan.measurements.vendorDocsEnumerationOtherTargetRouteOrAggregateMaySubstituteTargetEvidence =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
});

test("preserves fixed 1080p60, isolation, recovery, and no-rescue gates", async () => {
  for (const [key, value] of Object.entries(tracked.fixedAcceptance)) {
    const plan = clone();
    plan.fixedAcceptance[key] = typeof value === "boolean" ? !value : value + 1;
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
});

test("keeps all outcome-sensitive sample, timing, quality, and resource gates null", async () => {
  for (const key of Object.keys(tracked.openAcceptance)) {
    const plan = clone();
    plan.openAcceptance[key] = 1;
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
});

test("rejects unsafe evidence, media, identifiers, secrets, paths, and hidden failures", async () => {
  for (const [key, value] of Object.entries(tracked.dataPolicy)) {
    const plan = clone();
    plan.dataPolicy[key] = !value;
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
});

test("rejects blocker weakening, premature results, route selection, and tier claims", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [...STEAMOS_UVC_BLOCKERS]);
  for (const mutate of [
    (plan) => {
      plan.executionGate.blockerCodes.pop();
    },
    (plan) => {
      plan.executionGate.status = "ready";
    },
    (plan) => {
      plan.result.artifactPath = "result.json";
    },
    (plan) => {
      plan.result.sha256 = "a".repeat(64);
    },
    (plan) => {
      plan.result.disposition = "qualified";
    },
    (plan) => {
      plan.result.completedRouteScenarioCellCount = 56;
    },
    (plan) => {
      plan.result.completedCycleCount = 1120;
    },
    (plan) => {
      plan.result.routeResults.push({});
    },
    (plan) => {
      plan.result.qualifiedRouteIds.push("flatpak-direct-v4l2");
    },
    (plan) => {
      plan.result.selectedAccessRouteId = "flatpak-direct-v4l2";
    },
    (plan) => {
      plan.result.qualifiedCameraIdentitySha256 = "a".repeat(64);
    },
    (plan) => {
      plan.result.microphoneDisablementQualified = true;
    },
    (plan) => {
      plan.result.targetQualified = true;
    },
    (plan) => {
      plan.result.sharedCameraSelected = true;
    },
    (plan) => {
      plan.result.steamMachinePrimaryTierChanged = true;
    },
    (plan) => {
      plan.result.publishedClaims.push("supported");
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsUvcPermissionPlan(plan));
  }
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  const extra = clone();
  extra.cameraQualified = false;
  await assert.rejects(validateSteamOsUvcPermissionPlan(extra), /fields drifted/u);
  await assert.rejects(
    parseSteamOsUvcPermissionPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseSteamOsUvcPermissionPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseSteamOsUvcPermissionPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseSteamOsUvcPermissionPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseSteamOsUvcPermissionPlanBytes(Buffer.from('{\r"format":1}\n')),
    /bare CR/u,
  );
  await assert.rejects(
    parseSteamOsUvcPermissionPlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
