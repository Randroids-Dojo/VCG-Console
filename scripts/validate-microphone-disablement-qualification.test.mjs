import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseMicrophoneDisablementQualificationPlanBytes,
  validateMicrophoneDisablementQualificationPlan,
} from "./validate-microphone-disablement-qualification.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(
  resolve(
    root,
    "benchmarks/microphone-disablement/microphone-disablement-qualification-plan-v1.json",
  ),
);
const tracked = await parseMicrophoneDisablementQualificationPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked 192-cell microphone plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.targets.length, 3);
  assert.equal(tracked.requiredLayers.length, 8);
  assert.equal(tracked.requiredPhases.length, 8);
  assert.equal(tracked.executionMatrix.expectedCellCount, 192);
  assert.equal(tracked.result.disposition, "not-run");
});

test("rejects source binding substitution", async () => {
  const plan = clone();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateMicrophoneDisablementQualificationPlan(plan),
    /digest drifted/u,
  );
});

test("rejects target, operating-system, architecture, or host substitution", async () => {
  for (const mutate of [
    (plan) => { plan.targets[0].hostClass = "Raspberry Pi 4"; },
    (plan) => { plan.targets[1].operatingSystem = "Ubuntu"; },
    (plan) => { plan.targets[2].architecture = "arm64"; },
    (plan) => { plan.targets.reverse(); },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateMicrophoneDisablementQualificationPlan(plan));
  }
});

test("rejects invented camera, image, stack, browser, or policy evidence", async () => {
  for (const mutate of [
    (plan) => { plan.targets[0].cameraIdentitySha256 = "a".repeat(64); },
    (plan) => { plan.targets[0].usbDescriptorSha256 = "b".repeat(64); },
    (plan) => { plan.targets[1].osImageSha256 = "c".repeat(64); },
    (plan) => { plan.targets[1].audioStackVersion = "invented"; },
    (plan) => { plan.targets[2].browserVersion = "invented"; },
    (plan) => { plan.targets[2].ordinaryUserPolicySha256 = "d".repeat(64); },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(
      validateMicrophoneDisablementQualificationPlan(plan),
      /blocked plan cannot populate/u,
    );
  }
});

test("rejects missing, duplicate, reordered, or weakened layers and phases", async () => {
  for (const mutate of [
    (plan) => { plan.requiredLayers.pop(); },
    (plan) => { plan.requiredLayers.reverse(); },
    (plan) => { plan.requiredLayers[1] = structuredClone(plan.requiredLayers[0]); },
    (plan) => { plan.requiredLayers[4].requiredOracle = "permission prompt shown"; },
    (plan) => { plan.requiredPhases.pop(); },
    (plan) => { plan.requiredPhases.reverse(); },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateMicrophoneDisablementQualificationPlan(plan));
  }
});

test("rejects matrix count drift and hidden premature execution bindings", async () => {
  for (const mutate of [
    (plan) => { plan.executionMatrix.expectedCellCount = 191; },
    (plan) => { plan.executionMatrix.targetCount = 2; },
    (plan) => { plan.executionMatrix.minimumValidAttemptsPerCell = 1; },
    (plan) => { plan.executionMatrix.attemptTimeoutMs = 1000; },
    (plan) => { plan.executionMatrix.scheduleSha256 = "a".repeat(64); },
    (plan) => { plan.executionMatrix.probeBundleSha256 = "b".repeat(64); },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateMicrophoneDisablementQualificationPlan(plan));
  }
});

test("requires denial before any buffer and rejects silence or UI-only proof", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.authorizationDeniedOrDeviceUnavailableRequired = false; },
    (plan) => { plan.acceptance.silentOrMutedPcmCountsAsFailure = false; },
    (plan) => { plan.acceptance.permissionPromptOrUiToggleAloneQualifies = true; },
    (plan) => { plan.acceptance.endpointEnumerationAloneQualifies = true; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateMicrophoneDisablementQualificationPlan(plan));
  }
});

test("rejects nonzero capture, track, buffer, byte, or aggregate rescue ceilings", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.everyCellMustPass = false; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.acceptance.maximumOrdinaryUserCaptureSuccesses = 1; },
    (plan) => { plan.acceptance.maximumBrowserAudioTrackSuccesses = 1; },
    (plan) => { plan.acceptance.maximumGamePackageCaptureSuccesses = 1; },
    (plan) => { plan.acceptance.maximumReturnedAudioBuffers = 1; },
    (plan) => { plan.acceptance.maximumReturnedAudioBytes = 2; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateMicrophoneDisablementQualificationPlan(plan));
  }
});

test("preserves update, rollback, recovery, and visible denial gates", async () => {
  for (const mutate of [
    (plan) => {
      plan.acceptance.updateRollbackAndRecoveryMustReapplyBeforeOrdinaryLogin = false;
    },
    (plan) => { plan.acceptance.denialMustRemainVisibleWithPathFreeCode = false; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateMicrophoneDisablementQualificationPlan(plan));
  }
});

test("rejects retained audio, egress, transcription, voiceprints, and identity data", async () => {
  for (const mutate of [
    (plan) => { plan.dataPolicy.rawAudioRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.audioSamplePersistenceAuthorized = true; },
    (plan) => { plan.dataPolicy.networkEgressAuthorized = true; },
    (plan) => { plan.dataPolicy.transcriptionAuthorized = true; },
    (plan) => { plan.dataPolicy.voiceprintAuthorized = true; },
    (plan) => { plan.dataPolicy.participantIdentifiersAllowed = true; },
    (plan) => { plan.dataPolicy.freeTextAllowed = true; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateMicrophoneDisablementQualificationPlan(plan));
  }
});

test("keeps every diagnostic unlock closed and unresolved", async () => {
  for (const mutate of [
    (plan) => { plan.diagnosticPolicy.adminDiagnosticPathDisposition = "enabled"; },
    (plan) => { plan.diagnosticPolicy.ordinaryUserUnlockAllowed = true; },
    (plan) => { plan.diagnosticPolicy.developerModeUnlockAllowed = true; },
    (plan) => { plan.diagnosticPolicy.gameRequestUnlockAllowed = true; },
    (plan) => { plan.diagnosticPolicy.profileSettingUnlockAllowed = true; },
    (plan) => { plan.diagnosticPolicy.separateOwnerDecisionRequired = false; },
    (plan) => { plan.diagnosticPolicy.visibleDisclosureAndIndicatorRequiredIfEnabled = false; },
    (plan) => { plan.diagnosticPolicy.temporaryProbeMayPersistAudio = true; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateMicrophoneDisablementQualificationPlan(plan));
  }
});

test("rejects execution authority, blocker drift, premature results, and unknown fields", async () => {
  for (const mutate of [
    (plan) => { plan.executionGate.targetAccessAuthorized = true; },
    (plan) => { plan.executionGate.osPolicyMutationAuthorized = true; },
    (plan) => { plan.executionGate.audioProbeAuthorized = true; },
    (plan) => { plan.executionGate.purchaseAuthorized = true; },
    (plan) => { plan.executionGate.blockerCodes.reverse(); },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedCellCount = 192; },
    (plan) => { plan.result.qualifiedTargetIds.push("raspberry-pi-os-arm64"); },
    (plan) => { plan.conclusion = "disabled"; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateMicrophoneDisablementQualificationPlan(plan));
  }
});

test("rejects noncanonical, duplicate, BOM, invalid UTF-8, and oversized bytes", async () => {
  await assert.rejects(
    parseMicrophoneDisablementQualificationPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(
    parseMicrophoneDisablementQualificationPlanBytes(duplicate),
    /canonical/u,
  );
  await assert.rejects(
    parseMicrophoneDisablementQualificationPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
  );
  await assert.rejects(
    parseMicrophoneDisablementQualificationPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseMicrophoneDisablementQualificationPlanBytes(Buffer.alloc(128 * 1024 + 1)),
  );
});
