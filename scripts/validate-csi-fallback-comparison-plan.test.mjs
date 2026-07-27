import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  CSI_BLOCKER_CODES,
  CSI_CAMERA_PATHS,
  CSI_PHASE_IDS,
  parseCsiFallbackComparisonPlanBytes,
  readCsiFallbackComparisonPlan,
  validateCsiFallbackComparisonPlan,
} from "./validate-csi-fallback-comparison-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const planPath = resolve(
  root,
  "benchmarks/csi-fallback/pi5-camera-module-3-wide-csi-fallback-plan-v1.json",
);
const trackedBytes = await readFile(planPath);

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

test("accepts the tracked blocked zero-result I-033 I-034 plan", async () => {
  const plan = await readCsiFallbackComparisonPlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.cameraPaths.length, 2);
  assert.equal(plan.comparisonMatrix.requiredPhaseCellCount, 16);
  assert.equal(plan.result, null);
});

test("closed schema rejects an invented CSI selection or result", async () => {
  const plan = await loadPlan();
  plan.selectedCsiCamera = "camera-module-3-wide";
  await assert.rejects(validateCsiFallbackComparisonPlan(plan), /plan fields drifted/u);
});

test("source provenance rejects stale or substituted repository bytes", async () => {
  const plan = await loadPlan();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateCsiFallbackComparisonPlan(plan),
    /OPEN_QUESTIONS\.md digest drifted/u,
  );
});

test("CSI remains closed without one exact valid shared-UVC failure", async () => {
  for (const mutate of [
    (plan) => {
      plan.triggerPolicy.requiredExactUvcFailureResultSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.triggerPolicy.validSharedUvcProductFailureRequired = false;
    },
    (plan) => {
      plan.triggerPolicy.fallbackExecutionOpened = true;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateCsiFallbackComparisonPlan(plan));
  }
});

test("specifications cable convenience driver availability and aggregates cannot open fallback", async () => {
  for (const key of [
    "vendorSpecificationCableConvenienceDriverAvailabilityOrSingleRunMayOpenFallback",
    "anotherTargetCameraModeCellOrAggregateMayOpenFallback",
  ]) {
    const plan = await loadPlan();
    plan.triggerPolicy[key] = true;
    await assert.rejects(validateCsiFallbackComparisonPlan(plan));
  }
});

test("shared UVC and Camera Module 3 Wide paths remain exact and Pi-only", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.cameraPaths.map(({ cameraPathId, interfaceClass, comparisonRole }) => [
      cameraPathId,
      interfaceClass,
      comparisonRole,
    ]),
    CSI_CAMERA_PATHS,
  );
  plan.cameraPaths[1].requiredTargetIds.push("steam-machine-steamos");
  await assert.rejects(validateCsiFallbackComparisonPlan(plan));
});

test("received camera lens cable driver mode enclosure and privacy identities remain open", async () => {
  const plan = await loadPlan();
  plan.cameraPaths[1].exactReceivedCameraRevisionLensAndCableManifestSha256 = "b".repeat(64);
  await assert.rejects(validateCsiFallbackComparisonPlan(plan));
});

test("complete camera-path differences cannot be mislabeled as pure CSI benefit", async () => {
  for (const mutate of [
    (plan) => {
      plan.attributionPolicy.comparisonConclusionClass = "pure-csi-interface-benefit";
    },
    (plan) => {
      plan.attributionPolicy.pureCsiInterfaceBenefitMayBeClaimedWithoutMatchedControl = true;
    },
    (plan) => {
      plan.attributionPolicy.lowerLatencyWiderFieldOrBetterAccuracyMayBeAttributedToCsiAlone =
        true;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateCsiFallbackComparisonPlan(plan));
  }
});

test("all eight ordered identity optical timing quality action system recovery and service phases remain", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.phaseIds, CSI_PHASE_IDS);
  plan.phaseIds.reverse();
  await assert.rejects(validateCsiFallbackComparisonPlan(plan));
});

test("matrix arithmetic preserves two paths eight phases and sixteen cells", async () => {
  for (const [key, value] of [
    ["cameraPathCount", 3],
    ["phaseCount", 7],
    ["requiredPhaseCellCount", 15],
    ["requiredUpstreamCoverageCount", 7],
  ]) {
    const plan = await loadPlan();
    plan.comparisonMatrix[key] = value;
    await assert.rejects(validateCsiFallbackComparisonPlan(plan));
  }
});

test("every path uses every phase and the same target workload schedule and oracles", async () => {
  for (const key of [
    "everyPathRunsEveryPhaseAndApplicableUpstreamCoverage",
    "sameExactTargetImageWorkloadPlacementLightingScheduleAndOraclesRequired",
    "failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible",
  ]) {
    const plan = await loadPlan();
    plan.comparisonMatrix[key] = false;
    await assert.rejects(validateCsiFallbackComparisonPlan(plan));
  }
});

test("path phase coverage persona position lighting and aggregate rescue remain forbidden", async () => {
  const plan = await loadPlan();
  plan.comparisonMatrix.pathPhaseCoveragePersonaPositionLightingOrAggregateMayRescueFailure =
    true;
  await assert.rejects(validateCsiFallbackComparisonPlan(plan));
});

test("independent exposure optical pose action system safety cost and service evidence remains required", async () => {
  for (const mutate of [
    (plan) => {
      plan.measurements.independentExposureClockOpticalPoseActionSystemSafetyCostAndServiceOraclesRequired =
        false;
    },
    (plan) => {
      plan.measurements.captureArrivalVendorUiAdvertisedFovPreviewOrInferenceOnlyTimingMaySubstitute =
        true;
    },
    (plan) => {
      plan.measurements.everyAttemptAndPreRepairFirstFailureMustRemainVisible = false;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateCsiFallbackComparisonPlan(plan));
  }
});

test("fixed 1080p60 D-110 non-rescue privacy and D-043 gates cannot weaken", async () => {
  for (const mutate of [
    (plan) => {
      plan.fixedAcceptance.requiredSustainedCaptureFramesPerSecond = 59;
    },
    (plan) => {
      plan.fixedAcceptance.maximumExposureToGameApiP95Microseconds = 120001;
    },
    (plan) => {
      plan.fixedAcceptance.maximumValidProductFailures = 1;
    },
    (plan) => {
      plan.fixedAcceptance.exactFailedUvcGateMustRemainFailedAndVisible = false;
    },
    (plan) => {
      plan.fixedAcceptance.physicalOpticalShutterAndTruthfulSoftwareCameraStateRemainRequired =
        false;
    },
    (plan) => {
      plan.fixedAcceptance.passingFallbackRequiresSupersedingD043OwnerDecisionBeforeSelection =
        false;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateCsiFallbackComparisonPlan(plan));
  }
});

test("outcome-sensitive trigger samples improvement timing quality cost and ranking gates remain open", async () => {
  for (const key of [
    "minimumRepeatedUvcFailureCountAndWindow",
    "minimumReceivedUnitsAndIndependentLotsPerCameraPath",
    "minimumMaterialImprovementOnExactFailedGate",
    "maximumGlassToMemoryP95P99AndWorstMicroseconds",
    "maximumDeliveredCostVolumeMassInstallationAndMaintenanceDelta",
    "decisionRankingTieBreakExpiryRetestAndAttributionPolicySha256",
  ]) {
    const plan = await loadPlan();
    plan.openAcceptance[key] = 1;
    await assert.rejects(validateCsiFallbackComparisonPlan(plan), /must remain open/u);
  }
});

test("no comparison result recommendation or D-043 supersession is invented", async () => {
  for (const mutate of [
    (plan) => {
      plan.decisionProtocol.cameraModule3WideCsiComparisonResultSha256 = "c".repeat(64);
    },
    (plan) => {
      plan.decisionProtocol.recommendedCameraPathId = "camera-module-3-wide-csi";
    },
    (plan) => {
      plan.decisionProtocol.passingCsiPathAutomaticallyOverridesSharedUvc = true;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateCsiFallbackComparisonPlan(plan));
  }
});

test("no purchase installation camera participant selection publication or BOM authority exists", async () => {
  for (const key of [
    "purchaseReturnOrVendorContactAuthorized",
    "cameraInstallationRibbonRoutingDriverFirmwareOrPersistentCalibrationMutationAuthorized",
    "cameraTargetParticipantOrDestructiveFaultOperationAuthorized",
    "cameraPathSelectionD043SupersessionBomMutationPublicationOrCompatibilityClaimAuthorized",
  ]) {
    const plan = await loadPlan();
    plan.authorityBoundary[key] = true;
    await assert.rejects(validateCsiFallbackComparisonPlan(plan));
  }
});

test("raw devices receipts paths media participants credentials payments and free text remain prohibited", async () => {
  for (const key of [
    "rawSerialUsbCsiFirmwareDeviceOrStableHardwareIdentifiersAllowed",
    "sellerReceiptOrderReturnWarrantySupportOrContactIdentifiersAllowed",
    "hostnamesUsernamesPathsEnvironmentArgumentsNetworkOrFilesystemValuesAllowed",
    "rawFramesAudioVideoProfileSaveControllerPayloadOrParticipantIdentifiersAllowed",
    "credentialsTokensKeysSecretsPaymentTaxOrStreetAddressDataAllowed",
    "freeTextCameraDriverKernelOpticalFaultServiceOrResultLogsAllowed",
  ]) {
    const plan = await loadPlan();
    plan.dataPolicy[key] = true;
    await assert.rejects(validateCsiFallbackComparisonPlan(plan));
  }
});

test("all blockers remain and blocked execution cannot contain a result", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.executionGate.blockerCodes, CSI_BLOCKER_CODES);
  plan.result = { status: "selected" };
  await assert.rejects(validateCsiFallbackComparisonPlan(plan));
});

test("rejects noncanonical JSON duplicate keys BOM invalid UTF-8 bare CR and oversize", async () => {
  const plan = await loadPlan();
  await assert.rejects(
    parseCsiFallbackComparisonPlanBytes(Buffer.from(JSON.stringify(plan))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(plan, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseCsiFallbackComparisonPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseCsiFallbackComparisonPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseCsiFallbackComparisonPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseCsiFallbackComparisonPlanBytes(Buffer.from("{\r}")),
    /bare CR/u,
  );
  await assert.rejects(
    parseCsiFallbackComparisonPlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
