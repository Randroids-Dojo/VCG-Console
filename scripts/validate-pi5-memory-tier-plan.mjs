import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/pi5-memory-pressure/pi5-memory-tier-plan-v1.json");
const MAX_BYTES = 96 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
export const PI5_MEMORY_FORMAT = "vcg-pi5-memory-tier-plan/v1";
export const PI5_MEMORY_BLOCKERS = Object.freeze([
  "stable-passing-8gb-reference-campaign",
  "received-8gb-and-4gb-board-identities",
  "qualified-image-runtime-storage-and-workload-tuple",
  "swap-zram-cgroup-psi-and-oom-evidence-policy",
  "camera-room-exposure-clock-and-ground-truth",
  "workload-service-participant-and-data-authority",
  "schedule-monitoring-pressure-and-recovery-protocols",
  "memory-fps-drop-power-thermal-recovery-and-savings-gates",
  "hardware-purchase-image-storage-and-fault-authority",
]);

const topKeys = ["format", "status", "campaignId", "observedAt", "claimBoundary", "sourceDigestContract", "sourceBindings", "commonTargetBoundary", "tiers", "workloadIds", "phases", "runProtocol", "requiredMetrics", "acceptance", "selectionPolicy", "dataPolicy", "executionGate", "result"];
const commonKeys = ["boardFamily", "acceleratorProduct", "poseModel", "operatingSystemImageSha256", "kernelRelease", "eepromVersion", "runtimeManifestSha256", "workloadBundleSha256", "storageIdentitySha256", "filesystemAndMountPolicySha256", "swapAndZramPolicySha256", "memoryControllerPolicySha256", "oomEvidencePolicySha256", "coolingPowerEnclosureSha256", "cameraRoomClockSha256", "monitoringCalibrationSha256"];
const openGateKeys = ["minimumAvailableMemoryHeadroomBytes", "maximumPressureStallRatio", "maximumMajorFaultsPerSecond", "maximumSwapBytes", "maximumZramBytes", "maximumPressureStorageWriteBytes", "minimumPoseFps", "minimumGameFps", "maximumGameFrameTimeP95Ms", "maximumCaptureDropRatio", "maximumPoseDropRatio", "maximumWallPowerW", "maximumSustainedSocTemperatureC", "maximumThermalThrottleEvents", "maximumRecoveryMs", "minimumDeliveredSavingsCentsForFourGb"];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function digest(bytes, label) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  const expected = [
    ["cpu-only-workload-boundary", "benchmarks/pi5-cpu-only/pi5-cpu-only-pose-game-plan-v1.json"],
    ["accelerated-concurrent-workload-boundary", "benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json"],
    ["storage-boundary", "benchmarks/microsd-qualification/sandisk-high-endurance-256gb-plan-v1.json"],
    ["image-boundary", "benchmarks/pi-image/pi5-hailo-image-plan-v1.json"],
  ];
  assert.equal(bindings.length, expected.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expected[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    assert.ok(absolute.startsWith(`${repositoryRoot}\\`) || absolute.startsWith(`${repositoryRoot}/`));
    assert.equal(digest(await readFile(absolute), binding.path), binding.sha256, `${binding.path} digest drifted`);
  }
}

export async function validatePi5MemoryTierPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, PI5_MEMORY_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "pi5-8gb-4gb-memory-pressure-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.match(plan.claimBoundary, /^Pre-registered I-016/u);
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.commonTargetBoundary, commonKeys, "commonTargetBoundary");
  assert.deepEqual(commonKeys.slice(0, 3).map((key) => plan.commonTargetBoundary[key]), ["Raspberry Pi 5", "Raspberry Pi AI HAT+ 26 TOPS", "yolov8m_pose"]);
  for (const key of commonKeys.slice(3)) assert.equal(plan.commonTargetBoundary[key], null, `blocked plan cannot populate ${key}`);

  const tierKeys = ["tierId", "nominalMemoryBytes", "required", "executionOrder", "role", "receivedPartAndRevisionSha256", "sameDateDeliveredCostCents", "eligibleForMinimumRecommendation"];
  const expectedTiers = [
    ["pi5-8gb-reference", 8589934592, true, 1, "selected-reference-first", true],
    ["pi5-4gb-minimum-candidate", 4294967296, true, 2, "evaluate-only-after-8gb-stable", true],
    ["pi5-2gb-exploratory", 2147483648, false, 3, "exploratory-only-not-selected-by-d042", false],
  ];
  assert.equal(plan.tiers.length, 3);
  for (const [index, tier] of plan.tiers.entries()) {
    exactKeys(tier, tierKeys, `tiers[${index}]`);
    assert.deepEqual([tier.tierId, tier.nominalMemoryBytes, tier.required, tier.executionOrder, tier.role, tier.eligibleForMinimumRecommendation], expectedTiers[index]);
    assert.equal(tier.receivedPartAndRevisionSha256, null);
    assert.equal(tier.sameDateDeliveredCostCents, null);
  }
  assert.deepEqual(plan.workloadIds, ["obstacle-local-web-motion", "tiny-motion-godot-native-arm64", "vibebots-remote-web-compatibility", "mi-casa-remote-web-compatibility", "determined-remote-web-compatibility"]);
  const phaseIds = ["cold-launch-and-idle-headroom", "one-hour-representative-workload", "bounded-memory-pressure-and-reclaim", "oom-containment-and-fresh-recovery"];
  assert.deepEqual(plan.phases.map((phase) => phase.phaseId), phaseIds);
  for (const [index, phase] of plan.phases.entries()) {
    exactKeys(phase, ["phaseId", "requiredEvidence"], `phases[${index}]`);
    assert.equal(phase.requiredEvidence.length, 3);
    assert.equal(new Set(phase.requiredEvidence).size, 3);
  }
  assert.deepEqual(plan.runProtocol, {
    warmupSeconds: 300,
    measuredSecondsPerWorkload: 3600,
    requiredRunsPerWorkloadTier: 1,
    samplingPeriodMs: 1000,
    eightGbMustCompleteBeforeFourGb: true,
    sameArtifactsAndConfigurationAcrossTiers: true,
    counterbalancedWorkloadOrder: true,
    invalidHarnessRunsRetainedAndRerun: true,
    productFailuresMayBeReplaced: false,
    oneRunIsReliabilityRateEvidence: false,
    scheduleSha256: null,
    operatorProtocolSha256: null,
    pressureInjectionProtocolSha256: null,
  });
  assert.equal(plan.requiredMetrics.length, 12);
  assert.equal(new Set(plan.requiredMetrics).size, 12);

  exactKeys(plan.acceptance, ["maximumExposureToActionP95Ms", "maximumPrivilegedFalseActivations", "maximumUnrecoveredFailures", "maximumUnexpectedOomKillsDuringRepresentativeRun", "maximumOneMeterAcousticsDba", ...openGateKeys, "everyRequiredTierWorkloadPhaseMustPass", "aggregateMayRescueFailedCell", "optionalTwoGbMayRescueRequiredTier", "syntheticPressureAloneMayQualifyTier"], "acceptance");
  assert.deepEqual([
    plan.acceptance.maximumExposureToActionP95Ms,
    plan.acceptance.maximumPrivilegedFalseActivations,
    plan.acceptance.maximumUnrecoveredFailures,
    plan.acceptance.maximumUnexpectedOomKillsDuringRepresentativeRun,
    plan.acceptance.maximumOneMeterAcousticsDba,
  ], [120, 0, 0, 0, 35]);
  for (const key of openGateKeys) assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  assert.equal(plan.acceptance.everyRequiredTierWorkloadPhaseMustPass, true);
  assert.equal(plan.acceptance.aggregateMayRescueFailedCell, false);
  assert.equal(plan.acceptance.optionalTwoGbMayRescueRequiredTier, false);
  assert.equal(plan.acceptance.syntheticPressureAloneMayQualifyTier, false);
  assert.deepEqual(plan.selectionPolicy, {
    currentReferenceTierId: "pi5-8gb-reference",
    minimumCandidateTierId: "pi5-4gb-minimum-candidate",
    recommendedTierId: null,
    automaticSelectionAllowed: false,
    fourGbRequiresStablePassingEightGbBaseline: true,
    twoGbRequiresSupersedingDecisionForProductEligibility: true,
    memorySavingsCannotExcuseLatencyAccuracyRecoveryOrStorageFailure: true,
  });
  assert.deepEqual(plan.dataPolicy, {
    rawFrameRetentionAuthorized: false,
    audioRecordingAuthorized: false,
    skeletonTraceRetentionAuthorized: false,
    swapOrDumpMayContainVaultPlaintext: false,
    credentialsTokensOrHostedBodiesRetained: false,
    participantIdentifiersAllowed: false,
    freeTextAllowed: false,
    systemTelemetryWithoutUserContentAllowed: true,
    releaseEvidenceAggregateOnly: true,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    hardwareAccessAuthorized: false,
    purchaseAuthorized: false,
    imageOrStorageMutationAuthorized: false,
    participantCollectionAuthorized: false,
    pressureOrOomInjectionAuthorized: false,
    blockerCodes: [...PI5_MEMORY_BLOCKERS],
  });
  assert.deepEqual(plan.result, { artifactPath: null, sha256: null, disposition: "not-run", completedRequiredCells: 0, qualifiedTierIds: [], recommendedTierId: null });
  return plan;
}

export async function parsePi5MemoryTierPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Pi 5 memory plan must be valid UTF-8"); }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error("Pi 5 memory plan must be valid JSON"); }
  await validatePi5MemoryTierPlan(value, repositoryRoot);
  assert.equal(text, `${JSON.stringify(value, null, 2)}\n`, "Pi 5 memory plan must use canonical two-space JSON with one trailing newline");
  return value;
}

export async function validateTrackedPi5MemoryTierPlan() {
  return parsePi5MemoryTierPlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedPi5MemoryTierPlan();
  const requiredCells = plan.tiers.filter((tier) => tier.required).length * plan.workloadIds.length * plan.phases.length;
  console.log(`Pi 5 memory-tier plan valid: tiers=${plan.tiers.length} requiredCells=${requiredCells} blockers=${plan.executionGate.blockerCodes.length}`);
}
