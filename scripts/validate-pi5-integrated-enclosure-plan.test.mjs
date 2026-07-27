import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  ENCLOSURE_BLOCKER_CODES,
  ENCLOSURE_SAFETY_SCENARIO_IDS,
  ENCLOSURE_SPECIMEN_IDS,
  ENCLOSURE_STAGE_IDS,
  parsePi5IntegratedEnclosurePlanBytes,
  readPi5IntegratedEnclosurePlan,
  validatePi5IntegratedEnclosurePlan,
} from "./validate-pi5-integrated-enclosure-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const planPath = resolve(
  root,
  "benchmarks/enclosure/pi5-integrated-enclosure-reference-build-plan-v1.json",
);
const sourceBytes = await readFile(planPath);
const sourceText = sourceBytes.toString("utf8");

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

async function rejectsMutation(mutate, pattern) {
  const plan = await loadPlan();
  mutate(plan);
  await assert.rejects(validatePi5IntegratedEnclosurePlan(plan), pattern);
}

test("accepts the tracked blocked zero-result I-192 I-195 plan", async () => {
  const plan = await readPi5IntegratedEnclosurePlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.specimens.length, 2);
  assert.equal(plan.buildMatrix.requiredSpecimenStageCellCount, 24);
  assert.equal(plan.safetyMatrix.requiredSpecimenScenarioCellCount, 32);
  assert.equal(plan.result, null);
});

test("closed schema rejects an invented selected enclosure or build result", async () => {
  await rejectsMutation(
    (plan) => {
      plan.selectedEnclosure = "WA-40*16";
    },
    /plan fields drifted/u,
  );
});

test("source provenance rejects stale or substituted repository bytes", async () => {
  await rejectsMutation(
    (plan) => {
      plan.sourceBindings[1].sha256 = "0".repeat(64);
    },
    /ABS_PROJECT_BOX_CANDIDATE_SCREEN_2026-07-25\.md digest drifted/u,
  );
});

test("catalog CAD and cardboard fit cannot select buy cut or qualify a box", async () => {
  for (const mutate of [
    (plan) => {
      plan.prerequisiteGate.candidateScreenOrCatalogDimensionsMaySelectOrderOrAuthorizeCutting =
        true;
    },
    (plan) => {
      plan.prerequisiteGate.vendorClaimsCadModelsCardboardFitOrOneSuccessfulAssemblyMayQualifyABox =
        true;
    },
    (plan) => {
      plan.prerequisiteGate.collectionOpened = true;
    },
  ]) {
    await rejectsMutation(mutate);
  }
});

test("the primary adjustable discovery jig and locked independent reproduction remain distinct", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.specimens.map(({ specimenId }) => specimenId),
    ENCLOSURE_SPECIMEN_IDS,
  );
  assert.equal(plan.specimens[0].experimentalPitchAdjustmentAllowedBeforeAxisFreezeOnly, true);
  assert.equal(plan.specimens[1].experimentalPitchAdjustmentAllowedBeforeAxisFreezeOnly, false);
  await rejectsMutation((candidate) => {
    candidate.specimens[1].experimentalPitchAdjustmentAllowedBeforeAxisFreezeOnly = true;
  });
});

test("both specimen identities BOMs tools fixed axes and authorization remain open", async () => {
  await rejectsMutation(
    (plan) => {
      plan.specimens[0].exactReceivedBoxRevisionDimensionsMaterialAndDeliveredCostManifestSha256 =
        "a".repeat(64);
    },
    /must remain open/u,
  );
  await rejectsMutation((plan) => {
    plan.specimens[1].receivedInventoriedAndAuthorized = true;
  });
});

test("the editable source template datum jig tolerances BOM tools and procedures stay unbound", async () => {
  for (const key of [
    "editableSourceDimensionsAndCutTemplateSha256",
    "cameraOpticalDatumFixedAxisJigAndAllowedToleranceSha256",
    "assemblyDisassemblyRecalibrationInspectionAndFaultProcedureSha256",
    "exactBomDeliveredCostToolListPhotoRedactionAndPublicationPackageSha256",
  ]) {
    await rejectsMutation((plan) => {
      plan.designPackage[key] = "b".repeat(64);
    });
  }
  await rejectsMutation((plan) => {
    plan.designPackage.undocumentedDimensionsToolsShimsOralInstructionsOrHiddenSetupAllowed =
      true;
  });
});

test("all twelve ordered design build optical system service and review stages remain", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.stageIds, ENCLOSURE_STAGE_IDS);
  await rejectsMutation((candidate) => {
    candidate.stageIds.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.stageIds.reverse();
  });
});

test("matrix arithmetic preserves two specimens twelve stages and twenty-four cells", async () => {
  for (const [key, value] of [
    ["stageCountPerSpecimen", 11],
    ["requiredSpecimenStageCellCount", 23],
  ]) {
    await rejectsMutation((plan) => {
      plan.buildMatrix[key] = value;
    });
  }
  await rejectsMutation((plan) => {
    plan.buildMatrix.firstBuildSecondBuildStageUpstreamPlanBestCaseOrAggregateMayRescueFailure =
      true;
  });
});

test("all sixteen child pet cable mechanical thermal access and emergency safety scenes remain", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.safetyScenarioIds, ENCLOSURE_SAFETY_SCENARIO_IDS);
  await rejectsMutation((candidate) => {
    candidate.safetyScenarioIds.splice(3, 1);
  });
  await rejectsMutation((candidate) => {
    candidate.safetyMatrix.requiredSpecimenScenarioCellCount = 31;
  });
});

test("independent physical safety truth cannot be replaced by no observed injury or operation", async () => {
  await rejectsMutation((plan) => {
    plan.safetyMatrix.independentPhysicalGroundTruthAndPredefinedStopRulesRequired = false;
  });
  await rejectsMutation((plan) => {
    plan.safetyMatrix.absenceOfObservedInjuryMayEstablishSafety = true;
  });
  await rejectsMutation((plan) => {
    plan.safetyMatrix.successfulOperationSignalQualityOrLowCostMayRescueSafetyFailure = true;
  });
});

test("dimensional optical electrical thermal radio safety cost and service evidence remains mandatory", async () => {
  await rejectsMutation((plan) => {
    plan.measurements.independentDimensionalOpticalElectricalThermalAcousticRadioSafetyCostAndServiceOraclesRequired =
      false;
  });
  await rejectsMutation((plan) => {
    plan.measurements.catalogCadPreviewHostTelemetrySelfReportOrSuccessfulBootMaySubstitutePhysicalMeasurement =
      true;
  });
  await rejectsMutation((plan) => {
    plan.measurements.requiredMetricIds.pop();
  });
});

test("zero safety failures 1080p60 D-110 8x8 acoustics and service gates cannot weaken", async () => {
  for (const [key, value] of [
    ["maximumBurrSharpEdgeLooseSwarfOrUnsecuredFastenerFindings", 1],
    ["maximumAccessibleMovingHotOrConductiveHazards", 1],
    ["requiredSustainedCaptureFramesPerSecond", 59],
    ["maximumExposureToGameApiP95Microseconds", 120001],
    ["minimumRequiredZoneWidthMm", 2438.3],
    ["maximumOneMeterAcousticsDba", 36],
    ["maximumEndToEndCameraServiceDurationMs", 300001],
    ["minimumValidCompleteDisassemblyReassemblyRecalibrationAttemptsPerSpecimen", 19],
    ["minimumIndependentReproductionBuilders", 0],
    ["minimumCompleteIndependentReproductions", 0],
  ]) {
    await rejectsMutation((plan) => {
      plan.fixedAcceptance[key] = value;
    });
  }
});

test("qualified builds require one fixed axis physical shutter indicator wake and ordinary fasteners", async () => {
  for (const [key, value] of [
    ["exactlyOneLockedIntegratedFixedPitchMustQualify", false],
    ["manualOrMotorizedPitchAdjustmentAllowedInQualifiedReferenceBuild", true],
    ["physicalOpticalShutterTruthfulCaptureIndicatorAndVisibleWakeFallbackRequired", false],
    ["ordinaryReversibleFastenersAndStandardCameraConnectorRequiredWherePractical", false],
  ]) {
    await rejectsMutation((plan) => {
      plan.fixedAcceptance[key] = value;
    });
  }
});

test("outcome-sensitive cost geometry mechanical thermal radio timing wear and reproduction gates stay open", async () => {
  for (const key of [
    "maximumCompleteDeliveredEnclosureAndIncludedHardwareCostCents",
    "minimumStaticTipAngleMilliDegreesByDirection",
    "maximumFixedAxisPitchRollYawErrorMilliDegrees",
    "maximumSustainedSocAcceleratorStorageCameraAndSurfaceTemperatureMilliC",
    "maximumRadioThroughputInputLatencyAndRecoveryRegressionPpm",
    "minimumFastenerConnectorCableMountAndJigWearCycleCount",
  ]) {
    await rejectsMutation(
      (plan) => {
        plan.openAcceptance[key] = 1;
      },
      /must remain open/u,
    );
  }
});

test("independent reproduction cannot use oral fixes hidden setup intervention or primary rescue", async () => {
  for (const key of [
    "oralCorrectionsUndocumentedShimsPreCutPartsOrFirstBuildTeamInterventionAllowed",
    "reproductionFailureMayBeRepairedWithoutVersioningAndRestartingAffectedEvidence",
    "firstBuildPassMayRescueReproductionFailure",
    "referencePackageMayPublishBeforeBothCompleteResultsPassIndependentReview",
  ]) {
    await rejectsMutation((plan) => {
      plan.reproductionProtocol[key] = true;
    });
  }
});

test("no build pass automatically selects a box axis BOM publication or product claim", async () => {
  for (const key of [
    "primaryBuildPassAutomaticallySelectsBoxAxisBomOrPublication",
    "reproductionPassAutomaticallyCreatesProductWarrantyComplianceOrSupportClaim",
    "lowerCostSmallerSizeBetterThermalsOrEasierAssemblyMayRescueAnyFixedFailure",
  ]) {
    await rejectsMutation((plan) => {
      plan.decisionProtocol[key] = true;
    });
  }
  await rejectsMutation((plan) => {
    plan.decisionProtocol.selectedExactBoxAndReferenceBuildDisposition = "qualified";
  });
});

test("no purchase construction power room camera photo selection or publication authority exists", async () => {
  for (const key of Object.keys((await loadPlan()).authorityBoundary).filter((key) =>
    key.endsWith("Authorized"),
  )) {
    await rejectsMutation((plan) => {
      plan.authorityBoundary[key] = true;
    });
  }
});

test("raw household identities receipts device identifiers paths and free text remain prohibited", async () => {
  for (const key of [
    "rawRoomFacesBodiesChildrenPetsPortraitsAudioVideoOrCameraFramesAllowed",
    "namesAddressesReceiptsOrdersPaymentTaxSellerSupportOrBuilderIdentifiersAllowed",
    "serialsMacAddressesWifiNamesCredentialsHostnamesUsernamesPathsOrEnvironmentValuesAllowed",
    "freeTextFailureToolElectricalThermalRadioServiceOrResultLogsAllowed",
  ]) {
    await rejectsMutation((plan) => {
      plan.dataPolicy[key] = true;
    });
  }
});

test("all fourteen blockers and the zero-result envelope remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.executionGate.blockerCodes, ENCLOSURE_BLOCKER_CODES);
  await rejectsMutation((candidate) => {
    candidate.executionGate.blockerCodes.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.executionGate.status = "ready";
  });
  await rejectsMutation((candidate) => {
    candidate.result = { qualified: true };
  });
});

test("rejects noncanonical JSON duplicate keys BOM invalid UTF-8 bare CR and oversize", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "vcg-enclosure-plan-"));
  try {
    const duplicate = resolve(directory, "duplicate.json");
    await writeFile(
      duplicate,
      sourceText.replace(
        '  "status": "blocked",',
        '  "status": "blocked",\n  "status": "qualified",',
      ),
    );
    await assert.rejects(
      parsePi5IntegratedEnclosurePlanBytes(await readFile(duplicate)),
      /canonical two-space JSON/u,
    );

    const noncanonical = resolve(directory, "noncanonical.json");
    await writeFile(noncanonical, JSON.stringify(JSON.parse(sourceText)));
    await assert.rejects(
      parsePi5IntegratedEnclosurePlanBytes(await readFile(noncanonical)),
      /canonical two-space JSON/u,
    );

    const bom = resolve(directory, "bom.json");
    await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), sourceBytes]));
    await assert.rejects(
      parsePi5IntegratedEnclosurePlanBytes(await readFile(bom)),
      /BOM/u,
    );

    const invalid = resolve(directory, "invalid.json");
    await writeFile(invalid, Buffer.from([0xc3, 0x28]));
    await assert.rejects(
      parsePi5IntegratedEnclosurePlanBytes(await readFile(invalid)),
      /valid UTF-8/u,
    );

    const bareCr = resolve(directory, "bare-cr.json");
    await writeFile(bareCr, Buffer.from(sourceText.replace("\n", "\r")));
    await assert.rejects(
      parsePi5IntegratedEnclosurePlanBytes(await readFile(bareCr)),
      /bare CR/u,
    );

    await assert.rejects(
      parsePi5IntegratedEnclosurePlanBytes(Buffer.alloc(384 * 1024 + 1, 0x20)),
      /exceeds/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
