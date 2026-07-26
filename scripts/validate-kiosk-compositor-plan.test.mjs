import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  KIOSK_BLOCKER_CODES,
  KIOSK_OPTIONAL_TARGET_IDS,
  KIOSK_REQUIRED_TARGET_IDS,
  KIOSK_ROUTE_IDS,
  KIOSK_SCENARIO_IDS,
  KIOSK_WORKLOAD_DEFINITIONS,
  parseKioskCompositorPlanBytes,
  readKioskCompositorPlan,
  validateKioskCompositorPlan,
} from "./validate-kiosk-compositor-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const planPath = resolve(
  root,
  "benchmarks/kiosk-compositor/cross-tier-kiosk-compositor-plan-v1.json",
);
const trackedBytes = await readFile(planPath);

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

test("accepts the tracked blocked zero-result I-092 plan", async () => {
  const plan = await readKioskCompositorPlan();
  assert.equal(plan.status, "blocked");
  assert.deepEqual(plan.qualificationScope, ["I-092", "Q-047", "Q-101"]);
  assert.equal(plan.qualificationMatrix.requiredCellCount, 648);
  assert.equal(plan.qualificationMatrix.requiredCycleCount, 12960);
  assert.equal(plan.qualificationMatrix.requiredOneHourSoakRunCount, 108);
  assert.equal(plan.result, null);
});

test("closed schema rejects an invented route result", async () => {
  const plan = await loadPlan();
  plan.selectedRouteId = "cage-chromium-vcg-wrapper";
  await assert.rejects(validateKioskCompositorPlan(plan), /plan fields drifted/u);
});

test("source provenance rejects stale or substituted repository bytes", async () => {
  const plan = await loadPlan();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateKioskCompositorPlan(plan),
    /KIOSK_COMPOSITOR_SOURCE_SCREEN_2026-07-26\.md digest drifted/u,
  );
});

test("upstream observations cannot become build or qualification evidence", async () => {
  for (const mutate of [
    (plan) => {
      plan.sourceScreen.cage.observedRevision = "0".repeat(40);
    },
    (plan) => {
      plan.sourceScreen.cage.sourceFactsMayQualifyBuildTargetOrProduct = true;
    },
    (plan) => {
      plan.sourceScreen.gamescope.observedFacts.pop();
    },
    (plan) => {
      plan.sourceScreen.chromium.flagsAppModeOrKioskMayQualifyContainmentOrRecovery =
        true;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateKioskCompositorPlan(plan));
  }
});

test("required Linux targets remain exact and non-rescuing", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.targetPolicy.requiredTargetIds, KIOSK_REQUIRED_TARGET_IDS);
  assert.deepEqual(plan.targetPolicy.optionalTargetIds, KIOSK_OPTIONAL_TARGET_IDS);
  plan.targetPolicy.optionalTargetMayRescueRequiredTarget = true;
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("target image, browser, compositor, display, and oracle identities remain open", async () => {
  for (const mutate of [
    (plan) => {
      plan.targets[0].osKernelGpuDriverAndSessionSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.targets[1].browserCompositorAndWrapperBuildSha256 = "b".repeat(64);
    },
    (plan) => {
      plan.targets[2].receivedInventoriedAndAuthorized = true;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateKioskCompositorPlan(plan), /must remain open|false/u);
  }
});

test("all three route candidates remain exact, unbuilt, and unqualified", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.routeCandidates.map(({ routeId }) => routeId),
    KIOSK_ROUTE_IDS,
  );
  plan.routeCandidates[1].exactCompositorBuildAndDependencyManifestSha256 =
    "a".repeat(64);
  await assert.rejects(validateKioskCompositorPlan(plan), /must remain open/u);
});

test("wrapper-only control cannot silently acquire a dedicated compositor", async () => {
  const plan = await loadPlan();
  plan.routeCandidates[2].dedicatedCompositor = true;
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("common Chromium policy preserves origin, permission, profile, and liveness boundaries", async () => {
  for (const mutate of [
    (plan) => {
      plan.commonBrowserContract.maximumRemoteOriginAllowlistCount = 9;
    },
    (plan) => {
      plan.commonBrowserContract.downloadsAllowed = true;
    },
    (plan) => {
      plan.commonBrowserContract.popupsOrSecondaryTargetsAllowed = true;
    },
    (plan) => {
      plan.commonBrowserContract.freshPerGameProfileRequired = false;
    },
    (plan) => {
      plan.commonBrowserContract.wrapperLivenessMaySubstituteForVisibleFocusedCompositorReadiness =
        true;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateKioskCompositorPlan(plan));
  }
});

test("all six workloads remain exact and unqualified", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.workloads.map(({ workloadId, runtimeClass, networkClass }) => [
      workloadId,
      runtimeClass,
      networkClass,
    ]),
    KIOSK_WORKLOAD_DEFINITIONS,
  );
  plan.workloads[5].networkClass = "offline-capable";
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("all eighteen launch, capture, failure, media, and recovery scenarios remain mandatory", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.hostileScenarios, KIOSK_SCENARIO_IDS);
  plan.hostileScenarios.splice(11, 1);
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("matrix arithmetic preserves 648 required cells and 12960 cycles", async () => {
  const plan = await loadPlan();
  plan.qualificationMatrix.requiredCellCount = 647;
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("every route receives the complete one-hour soak schedule", async () => {
  const plan = await loadPlan();
  plan.qualificationMatrix.requiredOneHourSoakRunCount = 107;
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("failed, blocked, invalid, stopped, retried, and worst cases stay visible", async () => {
  const plan = await loadPlan();
  plan.qualificationMatrix.failedBlockedInvalidStoppedRetriedAndWorstCaseEvidenceMustRemainVisible =
    false;
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("route, target, workload, scenario, soak, and aggregate rescue remain forbidden", async () => {
  const plan = await loadPlan();
  plan.qualificationMatrix.oneTargetWorkloadScenarioSoakOrAggregateMayRescueFailure =
    true;
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("independent input, focus, surface, process, media, storage, and clock oracles remain required", async () => {
  const plan = await loadPlan();
  plan.measurements.independentInputFocusSurfaceProcessOriginPermissionStorageAudioVideoDisplayAndClockOraclesRequired =
    false;
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("fixed launch, input, containment, storage, and recovery gates cannot weaken", async () => {
  for (const mutate of [
    (plan) => {
      plan.fixedAcceptance.maximumInteractiveLaunchP95Ms = 16000;
    },
    (plan) => {
      plan.fixedAcceptance.maximumFirstControllerFeedbackP95Ms = 300;
    },
    (plan) => {
      plan.fixedAcceptance.maximumReservedHomeOrBackDeliveriesToGame = 1;
    },
    (plan) => {
      plan.fixedAcceptance.maximumUnownedOrEscapedProcessesSurfacesOrSessions = 1;
    },
    (plan) => {
      plan.fixedAcceptance.sourceFactsBuildSuccessFlagsProcessSurvivalOrWrapperLivenessMayQualifyRoute =
        true;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateKioskCompositorPlan(plan));
  }
});

test("outcome-sensitive performance, recovery, sample, and ranking gates remain open", async () => {
  const plan = await loadPlan();
  plan.openAcceptance.minimumSustainedGameFpsMilliFps = 60000;
  await assert.rejects(
    validateKioskCompositorPlan(plan),
    /minimumSustainedGameFpsMilliFps must remain open/u,
  );
});

test("no download, target, network, fault, selection, or publication authority is granted", async () => {
  const plan = await loadPlan();
  plan.authorityBoundary.fullscreenFocusProcessStorageNetworkDisplayOrAudioFaultAuthorized =
    true;
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("raw input, identifiers, URLs, media, paths, credentials, and free text remain prohibited", async () => {
  const plan = await loadPlan();
  plan.dataPolicy.urlsQueriesTitlesHeadersBodiesCookiesTokensCredentialsOrEnteredTextAllowed =
    true;
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("all blockers remain and blocked execution cannot contain a result", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.executionGate.blockerCodes, KIOSK_BLOCKER_CODES);
  plan.result = { disposition: "qualified" };
  await assert.rejects(validateKioskCompositorPlan(plan));
});

test("rejects noncanonical JSON, duplicate keys, BOM, invalid UTF-8, bare CR, and oversize", async () => {
  const plan = await loadPlan();
  await assert.rejects(
    parseKioskCompositorPlanBytes(Buffer.from(JSON.stringify(plan))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(plan, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseKioskCompositorPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseKioskCompositorPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseKioskCompositorPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseKioskCompositorPlanBytes(Buffer.from("{\r}")),
    /bare CR/u,
  );
  await assert.rejects(
    parseKioskCompositorPlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
