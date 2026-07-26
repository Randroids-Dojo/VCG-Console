import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  VISUAL_TOKEN_ACCENTS,
  VISUAL_TOKEN_BLOCKERS,
  VISUAL_TOKEN_PERSONAS,
  VISUAL_TOKEN_SURFACES,
  VISUAL_TOKEN_TASKS,
  VISUAL_TOKEN_VISION_STRATA,
  parsePhysicalTvVisualTokenPlanBytes,
  validatePhysicalTvVisualTokenPlan,
} from "./validate-physical-tv-visual-token-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/tv-visual-tokens/physical-tv-visual-token-plan-v1.json",
));
const tracked = await parsePhysicalTvVisualTokenPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-206 physical-TV visual-token plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.surfaceMatrix.surfaceCount, 9);
  assert.equal(tracked.renderingMatrix.requiredRunCount, 1296);
  assert.equal(tracked.performanceMatrix.requiredPerformanceRunCount, 4320);
});

test("rejects stale or substituted source bindings", async () => {
  const plan = clone();
  plan.sourceBindings[1].sha256 = "0".repeat(64);
  await assert.rejects(validatePhysicalTvVisualTokenPlan(plan), /digest drifted/u);
});

test("rejects invented builds, protocols, access, participants, captures, or publication authority", async () => {
  for (const mutate of [
    (plan) => { plan.executionBoundary.exactBuildArtifactSha256 = "a".repeat(64); },
    (plan) => { plan.executionBoundary.selectedTelevisionMatrixSha256 = "b".repeat(64); },
    (plan) => { plan.executionBoundary.participantRecruitmentConsentAndAssentProtocolSha256 = "c".repeat(64); },
    (plan) => { plan.executionBoundary.gpuAndAnimationMeasurementProtocolSha256 = "d".repeat(64); },
    (plan) => { plan.executionBoundary.physicalTelevisionAccessAuthorized = true; },
    (plan) => { plan.executionBoundary.adultParticipationAuthorized = true; },
    (plan) => { plan.executionBoundary.childParticipationAuthorized = true; },
    (plan) => { plan.executionBoundary.accessibilityObservationAuthorized = true; },
    (plan) => { plan.executionBoundary.cameraCaptureAuthorized = true; },
    (plan) => { plan.executionBoundary.targetExecutionAuthorized = true; },
    (plan) => { plan.executionBoundary.publicationAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validatePhysicalTvVisualTokenPlan(plan));
  }
});

test("preserves all nine real shell surfaces without cross-surface rescue", async () => {
  assert.deepEqual(tracked.surfaceMatrix.surfaceIds, [...VISUAL_TOKEN_SURFACES]);
  for (const mutate of [
    (plan) => { plan.surfaceMatrix.surfaceIds.pop(); },
    (plan) => { plan.surfaceMatrix.surfaceIds.reverse(); },
    (plan) => { plan.surfaceMatrix.surfaceCount = 8; },
    (plan) => { plan.surfaceMatrix.everySurfaceMustIncludeDefaultFocusedFaultAndRecoveryEvidence = false; },
    (plan) => { plan.surfaceMatrix.syntheticFixtureMayReplaceRealShellState = true; },
    (plan) => { plan.surfaceMatrix.oneSurfaceMayQualifyAnother = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validatePhysicalTvVisualTokenPlan(plan));
  }
});

test("requires the complete 432-cell, 1296-run physical rendering matrix", async () => {
  assert.deepEqual(tracked.renderingMatrix.accentIds, [...VISUAL_TOKEN_ACCENTS]);
  for (const mutate of [
    (plan) => { plan.renderingMatrix.accentIds.pop(); },
    (plan) => { plan.renderingMatrix.contrastModeIds.pop(); },
    (plan) => { plan.renderingMatrix.motionModeIds.reverse(); },
    (plan) => { plan.renderingMatrix.targetClassIds[1] = "desktop-proxy"; },
    (plan) => { plan.renderingMatrix.displayRoleIds.pop(); },
    (plan) => { plan.renderingMatrix.validRunsPerCell = 2; },
    (plan) => { plan.renderingMatrix.requiredCellCount = 431; },
    (plan) => { plan.renderingMatrix.requiredRunCount = 1295; },
    (plan) => { plan.renderingMatrix.everyRunIncludesMeasuredSeatingDistanceAmbientLightAndPanelMode = false; },
    (plan) => { plan.renderingMatrix.grayscaleAndLuminanceReviewRequiredForEveryFocusedState = false; },
    (plan) => { plan.renderingMatrix.accentOrContrastModeMayRescueAnother = true; },
    (plan) => { plan.renderingMatrix.targetDisplayOrSeatingPositionMayRescueAnother = true; },
    (plan) => { plan.renderingMatrix.failedInvalidOrRetriedRunsRemainVisible = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validatePhysicalTvVisualTokenPlan(plan));
  }
});

test("preserves persona, vision-stratum, controller-task, and pre-collection boundaries", async () => {
  assert.deepEqual(tracked.participantMatrix.blockingPersonaClassIds, [...VISUAL_TOKEN_PERSONAS]);
  assert.deepEqual(tracked.participantMatrix.visionObservationStratumIds, [...VISUAL_TOKEN_VISION_STRATA]);
  assert.deepEqual(tracked.participantMatrix.taskIds, [...VISUAL_TOKEN_TASKS]);
  for (const mutate of [
    (plan) => { plan.participantMatrix.blockingPersonaClassIds.pop(); },
    (plan) => { plan.participantMatrix.visionObservationStratumIds.pop(); },
    (plan) => { plan.participantMatrix.taskIds.pop(); },
    (plan) => { plan.participantMatrix.minimumDistinctParticipantsPerPersonaStratum = 1; },
    (plan) => { plan.participantMatrix.validTaskRunsPerParticipantCell = 1; },
    (plan) => { plan.participantMatrix.requiredParticipantCellCount = 323; },
    (plan) => { plan.participantMatrix.requiredParticipantSessionCount = 324; },
    (plan) => { plan.participantMatrix.everySurfaceAccentContrastPersonaAndVisionStratumIsBlocking = false; },
    (plan) => { plan.participantMatrix.oneParticipantPersonaOrVisionStratumMayRescueAnother = true; },
    (plan) => { plan.participantMatrix.postResultParticipantOrTaskExclusionAllowed = true; },
    (plan) => { plan.participantMatrix.medicalDiagnosisOrIdentityInferenceAllowed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validatePhysicalTvVisualTokenPlan(plan));
  }
});

test("requires target GPU and animation evidence across 4320 visible runs", async () => {
  for (const mutate of [
    (plan) => { plan.performanceMatrix.transitionClassIds.pop(); },
    (plan) => { plan.performanceMatrix.requiredPerformanceCellCount = 215; },
    (plan) => { plan.performanceMatrix.validRunsPerPerformanceCell = 19; },
    (plan) => { plan.performanceMatrix.requiredPerformanceRunCount = 4319; },
    (plan) => { plan.performanceMatrix.gpuFrameTimeFpsDroppedFramesMemoryAndPowerRequired = false; },
    (plan) => { plan.performanceMatrix.declaredAndMeasuredTransitionDurationRequired = false; },
    (plan) => { plan.performanceMatrix.reducedMotionMustBeNonRepeatingAndEffectivelyImmediate = false; },
    (plan) => { plan.performanceMatrix.browserDevtoolsOrSyntheticTimerAloneMayQualifyTarget = true; },
    (plan) => { plan.performanceMatrix.oneTargetSurfaceAccentOrModeMayRescueAnother = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validatePhysicalTvVisualTokenPlan(plan));
  }
});

test("rejects weakened fixed gates, post-result numeric gates, or unsafe evidence", async () => {
  for (const mutate of [
    (plan) => { plan.fixedAcceptance.maximumFocusStatesDependingOnlyOnColor = 1; },
    (plan) => { plan.fixedAcceptance.maximumBackOrHomeRecoveryFailures = 1; },
    (plan) => { plan.fixedAcceptance.aggregateAverageMayRescueFailedCell = true; },
    (plan) => { plan.fixedAcceptance.headlessOrDesktopEvidenceMayQualifyPhysicalTelevision = true; },
    (plan) => { plan.fixedAcceptance.passingCyanMayQualifyAmberOrViolet = true; },
    (plan) => { plan.fixedAcceptance.campaignMaySelectShippingAccentsOrChangeVisualPolicy = true; },
    (plan) => { plan.openAcceptance.minimumTaskComprehensionRatePpm = 900000; },
    (plan) => { plan.openAcceptance.maximumGpuFrameTimeP95Us = 16667; },
    (plan) => { plan.openAcceptance.mustBeFixedBeforeFirstPhysicalRun = false; },
    (plan) => { plan.evidencePolicy.physicalDisplayCapturesMustExcludePeopleAndBeCroppedRedactedAndExifFree = false; },
    (plan) => { plan.evidencePolicy.participantNamesFacesVoicesExactAgesAddressesDiagnosesOrStableIdentifiersAllowed = true; },
    (plan) => { plan.evidencePolicy.individualParticipantFreeTextOrRawTaskRecordingAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.evidencePolicy.rawHomeRoomPhotographyAllowed = true; },
    (plan) => { plan.evidencePolicy.networkEgressAllowed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validatePhysicalTvVisualTokenPlan(plan));
  }
});

test("rejects blocker removal, premature results, qualification, or policy changes", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [...VISUAL_TOKEN_BLOCKERS]);
  for (const mutate of [
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.executionGate.state = "ready"; },
    (plan) => { plan.executionGate.readyRequiresEveryBlockerResolvedBeforeFirstPhysicalRun = false; },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedRenderingRunCount = 1296; },
    (plan) => { plan.result.completedParticipantSessionCount = 1; },
    (plan) => { plan.result.completedPerformanceRunCount = 4320; },
    (plan) => { plan.result.renderingCellResults.push({}); },
    (plan) => { plan.result.physicalTelevisionCount = 2; },
    (plan) => { plan.result.participantCount = 1; },
    (plan) => { plan.result.qualifiedAccentIds.push("cyan"); },
    (plan) => { plan.result.releaseQualified = true; },
    (plan) => { plan.result.visualPolicyChanged = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validatePhysicalTvVisualTokenPlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.tvQualified = false;
  await assert.rejects(validatePhysicalTvVisualTokenPlan(extra), /fields drifted/u);
  await assert.rejects(
    parsePhysicalTvVisualTokenPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parsePhysicalTvVisualTokenPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parsePhysicalTvVisualTokenPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parsePhysicalTvVisualTokenPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parsePhysicalTvVisualTokenPlanBytes(Buffer.alloc(128 * 1024 + 1)),
    /exceeds/u,
  );
});
