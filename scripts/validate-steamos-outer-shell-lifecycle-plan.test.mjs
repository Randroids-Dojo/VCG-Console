import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  STEAMOS_OUTER_SHELL_BLOCKERS,
  STEAMOS_OUTER_SHELL_OFFICIAL_REFERENCES,
  STEAMOS_OUTER_SHELL_ROUTES,
  STEAMOS_OUTER_SHELL_SCENARIOS,
  STEAMOS_OUTER_SHELL_SOURCES,
  STEAMOS_OUTER_SHELL_TARGETS,
  parseSteamOsOuterShellLifecyclePlanBytes,
  validateSteamOsOuterShellLifecyclePlan,
} from "./validate-steamos-outer-shell-lifecycle-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = resolve(
  root,
  "benchmarks/steamos-shell/steamos-outer-shell-lifecycle-plan-v1.json",
);
const planBytes = await readFile(planPath);
const baseline = await parseSteamOsOuterShellLifecyclePlanBytes(planBytes);

async function rejectsMutation(mutate, pattern = /./u) {
  const candidate = structuredClone(baseline);
  mutate(candidate);
  await assert.rejects(
    validateSteamOsOuterShellLifecyclePlan(candidate, root),
    pattern,
  );
}

test("accepts the tracked blocked zero-result I-171 plan", async () => {
  const parsed = await parseSteamOsOuterShellLifecyclePlanBytes(planBytes);
  assert.equal(parsed.status, "blocked");
  assert.equal(parsed.captureMatrix.cellCount, 48);
  assert.equal(parsed.captureMatrix.totalCycles, 960);
  assert.equal(parsed.result, null);
});

test("rejects stale, reordered, substituted, escaping, or missing sources", async () => {
  assert.equal(baseline.sourceBindings.length, STEAMOS_OUTER_SHELL_SOURCES.length);
  await rejectsMutation((plan) => {
    plan.sourceBindings[0].sha256 = "0".repeat(64);
  });
  await rejectsMutation((plan) => {
    [plan.sourceBindings[0], plan.sourceBindings[1]] = [
      plan.sourceBindings[1],
      plan.sourceBindings[0],
    ];
  });
  await rejectsMutation((plan) => {
    plan.sourceBindings[0].path = "docs/RESEARCH.md";
  });
  await rejectsMutation((plan) => {
    plan.sourceBindings[0].path = "../outside.md";
  });
  await rejectsMutation((plan) => {
    plan.sourceBindings.pop();
  });
});

test("pins current Valve facts without inventing automatic entry or shell ownership", async () => {
  assert.deepEqual(
    baseline.officialReferenceRecords,
    structuredClone(STEAMOS_OUTER_SHELL_OFFICIAL_REFERENCES),
  );
  await rejectsMutation((plan) => {
    plan.officialReferenceRecords[0].facts[0] =
      "stock-first-start-launches-vcg-without-steam";
  });
  await rejectsMutation((plan) => {
    plan.officialReferenceRecords[1].facts[1] =
      "non-steam-shortcut-receives-steam-updates";
  });
  await rejectsMutation((plan) => {
    plan.officialReferenceRecords[3].facts[2] =
      "browser-rendering-always-supports-overlay";
  });
  await rejectsMutation((plan) => {
    plan.officialReferenceRecords.push(
      structuredClone(plan.officialReferenceRecords[0]),
    );
  });
});

test("keeps the exact target mandatory and proxy evidence development-only", async () => {
  assert.deepEqual(
    baseline.targetCandidates.map((target) => [
      target.targetId,
      target.targetClass,
      target.evidenceDisposition,
    ]),
    STEAMOS_OUTER_SHELL_TARGETS,
  );
  await rejectsMutation((plan) => {
    plan.targetCandidates[0].receivedInventoriedAndAuthorized = true;
  });
  await rejectsMutation((plan) => {
    plan.targetCandidates[1].evidenceDisposition =
      "may-qualify-the-steam-machine";
  });
  await rejectsMutation((plan) => {
    plan.targetCandidates[1].otherTargetEvidenceMayQualify = true;
  });
  await rejectsMutation((plan) => {
    plan.targetCandidates.reverse();
  });
});

test("preserves all three routes without selecting or promoting one", async () => {
  assert.deepEqual(
    baseline.shellRoutes.map((route) => [
      route.routeId,
      route.entryOwnership,
      route.officialSupportBoundary,
    ]),
    STEAMOS_OUTER_SHELL_ROUTES,
  );
  await rejectsMutation((plan) => {
    plan.shellRoutes[0].mayClaimAutomaticEntry = true;
  });
  await rejectsMutation((plan) => {
    plan.shellRoutes[2].mayReplaceValveOuterShell = true;
  });
  await rejectsMutation((plan) => {
    plan.routeSelectionBoundary.selectedProductRouteId =
      "candidate-supported-automatic-vcg-entry";
  });
  await rejectsMutation((plan) => {
    plan.routeSelectionBoundary.manualRouteMayRescueAutomaticRoute = true;
  });
  await rejectsMutation((plan) => {
    plan.routeSelectionBoundary.steamLoginMayRescueAccountlessCore = true;
  });
});

test("grants no target, identity, mutation, capture, or publication authority", async () => {
  for (const key of Object.keys(baseline.authorityBoundary)) {
    await rejectsMutation((plan) => {
      plan.authorityBoundary[key] = true;
    });
  }
});

test("requires all eight ordered lifecycle scenarios and independent oracles", async () => {
  assert.deepEqual(
    baseline.lifecycleScenarios.map((scenario) => [
      scenario.scenarioId,
      scenario.startEvent,
      scenario.endEvent,
    ]),
    STEAMOS_OUTER_SHELL_SCENARIOS,
  );
  await rejectsMutation((plan) => {
    plan.lifecycleScenarios.pop();
  });
  await rejectsMutation((plan) => {
    plan.lifecycleScenarios.reverse();
  });
  await rejectsMutation((plan) => {
    plan.lifecycleScenarios[4].requiredOracles.pop();
  });
  await rejectsMutation((plan) => {
    plan.lifecycleScenarios[5].requiredVisualStates[0] =
      plan.lifecycleScenarios[5].requiredVisualStates[1];
  });
});

test("pins 48 target-route-scenario cells and 960 visible cycles", async () => {
  await rejectsMutation((plan) => {
    plan.captureMatrix.cellCount = 47;
  });
  await rejectsMutation((plan) => {
    plan.captureMatrix.cyclesPerCell = 19;
  });
  await rejectsMutation((plan) => {
    plan.captureMatrix.totalCycles = 959;
  });
  await rejectsMutation((plan) => {
    plan.captureMatrix.structuredEventLedgerRequiredPerCycle = false;
  });
  await rejectsMutation((plan) => {
    plan.captureMatrix.representativeSanitizedVideoRequiredPerCell = false;
  });
  await rejectsMutation((plan) => {
    plan.captureMatrix.targetRouteScenarioOrCycleRescueAllowed = true;
  });
});

test("requires independent lifecycle, owner, update, power, and video measurements", async () => {
  await rejectsMutation((plan) => {
    plan.measurements.pop();
  });
  await rejectsMutation((plan) => {
    plan.measurements[1] = plan.measurements[0];
  });
  for (const required of [
    "outer-shell-vcg-overlay-loading-failure-recovery-and-platform-handoff-owner-ledger",
    "overlay-open-close-pause-resume-focus-and-rendering-compatibility-results",
    "update-before-after-version-reboot-route-package-data-and-recovery-results",
    "shutdown-confirmation-quiescence-platform-handoff-power-state-and-failure-results",
    "sanitized-video-event-ledger-screenshot-and-detached-artifact-digests",
  ]) {
    await rejectsMutation((plan) => {
      plan.measurements = plan.measurements.filter((value) => value !== required);
      plan.measurements.push(`replacement-${required}`);
    });
  }
});

test("preserves fixed branding, timing, reserved-action, update, and no-rescue gates", async () => {
  for (const key of [
    "valveOuterShellRemainsVisibleAndTruthfullyOwned",
    "vcgMayOwnOnlyItsApplicationSurface",
    "vcgMayNotSpoofSteamSetupOverlayUpdateRecoveryOrShutdown",
    "steamHomeOverlayActionRemainsPlatformOwned",
    "steamOverlayMayNeverBeSoleVcgRecoveryAuthority",
    "stockUpdatesAndRecoveryMayNotBeDisabledOrMasked",
    "accountlessCoreMayNotBeWeakenedByI171",
  ]) {
    await rejectsMutation((plan) => {
      plan.fixedAcceptance[key] = false;
    });
  }
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.immediateBrandedFeedbackMillisecondsMaximum = 251;
  });
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.coldBootControllerUsableSecondsMaximum = 61;
  });
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.criticalFailuresAllowedPerCell = 1;
  });
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.aggregateTargetRouteScenarioOrProxyRescueAllowed = true;
  });
});

test("keeps every outcome-sensitive gate null until approved", async () => {
  for (const key of Object.keys(baseline.openAcceptance)) {
    await rejectsMutation((plan) => {
      plan.openAcceptance[key] = key.endsWith("Milliseconds") ? 1000 : "0".repeat(64);
    });
  }
});

test("rejects identity, secrets, entered text, raw media, paths, free text, or hidden failures", async () => {
  await rejectsMutation((plan) => {
    plan.dataPolicy.prohibited.shift();
  });
  await rejectsMutation((plan) => {
    plan.dataPolicy.allowed.push("steam-user-name");
  });
  await rejectsMutation((plan) => {
    plan.dataPolicy.networkPayloadCaptureAllowed = true;
  });
  await rejectsMutation((plan) => {
    plan.dataPolicy.screenVideoCollectionAuthorized = true;
  });
  await rejectsMutation((plan) => {
    plan.dataPolicy.rawMediaRetentionAllowed = true;
  });
  await rejectsMutation((plan) => {
    plan.captureMatrix.failedInvalidStoppedAndRetriedCyclesRetained = false;
  });
});

test("rejects blocker weakening and premature results, selection, or qualification", async () => {
  assert.deepEqual(baseline.executionGate.blockers, [...STEAMOS_OUTER_SHELL_BLOCKERS]);
  await rejectsMutation((plan) => {
    plan.executionGate.blockers.pop();
  });
  await rejectsMutation((plan) => {
    plan.executionGate.blockers.reverse();
  });
  await rejectsMutation((plan) => {
    plan.executionGate.state = "ready";
  });
  await rejectsMutation((plan) => {
    plan.status = "complete";
  });
  await rejectsMutation((plan) => {
    plan.result = { disposition: "qualified" };
  });
  await rejectsMutation((plan) => {
    plan.claimBoundary = "I-171 qualified";
  });
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  await rejectsMutation((plan) => {
    plan.notes = [];
  });
  const text = planBytes.toString("utf8");
  await assert.rejects(
    parseSteamOsOuterShellLifecyclePlanBytes(
      Buffer.from(text.replace('"status": "blocked"', '"status":"blocked"')),
    ),
  );
  await assert.rejects(
    parseSteamOsOuterShellLifecyclePlanBytes(
      Buffer.from(
        text.replace(
          '"status": "blocked"',
          '"status": "blocked",\n  "status": "ready"',
        ),
      ),
    ),
  );
  await assert.rejects(
    parseSteamOsOuterShellLifecyclePlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), planBytes]),
    ),
  );
  await assert.rejects(
    parseSteamOsOuterShellLifecyclePlanBytes(Buffer.from([0xc3, 0x28])),
  );
  await assert.rejects(
    parseSteamOsOuterShellLifecyclePlanBytes(
      Buffer.from(text.replace("\n", "\r")),
    ),
  );
  await assert.rejects(
    parseSteamOsOuterShellLifecyclePlanBytes(Buffer.alloc(256 * 1024 + 1)),
  );
  await parseSteamOsOuterShellLifecyclePlanBytes(
    Buffer.from(text.replaceAll("\n", "\r\n")),
  );
});
