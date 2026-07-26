import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/hailo-recovery/hailo-package-model-recovery-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const HAILO_RECOVERY_PLAN_FORMAT =
  "vcg-hailo-package-model-recovery-plan/v1";
export const HAILO_TUPLE_COMPONENTS = Object.freeze([
  "kernel",
  "pcie-driver",
  "hailo-firmware",
  "hailort",
  "tappas-core",
  "hailo-apps",
  "python-bindings",
  "pose-hef",
  "pose-postprocessor",
  "pose-configuration",
]);
export const HAILO_RECOVERY_SCENARIOS = Object.freeze([
  ["exact-baseline-boot", "healthy-exact-baseline", "offline", "none"],
  [
    "pcie-driver-runtime-major-mismatch",
    "fail-closed-preserve-active",
    "offline",
    "inert-candidate",
  ],
  [
    "runtime-firmware-mismatch",
    "fail-closed-preserve-active",
    "offline",
    "inert-candidate",
  ],
  [
    "runtime-hef-architecture-mismatch",
    "fail-closed-preserve-active",
    "offline",
    "inert-candidate",
  ],
  [
    "hef-postprocessor-mismatch",
    "fail-closed-preserve-active",
    "offline",
    "inert-candidate",
  ],
  [
    "python-native-binding-mismatch",
    "fail-closed-preserve-active",
    "offline",
    "inert-candidate",
  ],
  [
    "offline-reinstall-complete-cache",
    "restored-exact-baseline",
    "offline",
    "inactive-slot",
  ],
  [
    "offline-reinstall-missing-cache",
    "fail-closed-preserve-active",
    "offline",
    "inactive-slot",
  ],
  [
    "offline-reinstall-tampered-cache",
    "fail-closed-preserve-active",
    "offline",
    "inactive-slot",
  ],
  [
    "signed-forward-update-complete",
    "healthy-exact-candidate",
    "offline",
    "inactive-slot",
  ],
  [
    "forward-update-health-failure",
    "rolled-back-exact-prior-tuple",
    "offline",
    "candidate-boot",
  ],
  [
    "interrupted-update-before-slot-switch",
    "recovered-exact-prior-active",
    "offline",
    "inactive-slot",
  ],
  [
    "interrupted-update-after-slot-switch-before-health",
    "rolled-back-exact-prior-tuple",
    "offline",
    "candidate-boot",
  ],
  [
    "downgrade-replay-attempt",
    "fail-closed-preserve-active",
    "offline",
    "inert-candidate",
  ],
]);
export const HAILO_RECOVERY_BLOCKERS = Object.freeze([
  "exact-received-pi-hat-storage-power-cooling-camera-target",
  "qualified-baseline-image-and-complete-hailo-tuple",
  "signed-complete-offline-reinstall-and-update-bundle",
  "compatibility-manifest-and-single-component-mismatch-fixtures",
  "genuine-hailo-health-readiness-and-known-vector-oracle",
  "network-isolation-data-preservation-and-fault-injection-protocols",
  "counterbalanced-schedule-and-all-open-numeric-gates",
  "trusted-clock-instruments-operators-and-evidence-protocol",
  "hardware-download-install-slot-fault-network-and-publication-authority",
]);

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "qualificationScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "executionBoundary",
  "compatibilityTuple",
  "scenarios",
  "campaignRules",
  "fixedAcceptance",
  "openAcceptance",
  "dataPolicy",
  "executionGate",
  "result",
];
const sourceDefinitions = [
  ["system-update-and-recovery-decisions", "docs/DECISIONS.md"],
  ["blocked-pi-hailo-image-plan", "benchmarks/pi-image/pi5-hailo-image-plan-v1.json"],
  ["pi-hailo-image-plan-validator", "scripts/validate-pi5-hailo-image-plan.mjs"],
  ["pi-hailo-image-recipe-boundary", "docs/PI5_HAILO_IMAGE_RECIPE_2026-07-25.md"],
  [
    "hailo-model-accelerator-candidates",
    "benchmarks/hailo-accelerator/ai-hat-13-26-comparison-plan-v1.json",
  ],
  ["delegated-update-trust", "native/vcg-host/src/update_trust.rs"],
  ["signed-system-image-verification", "native/vcg-host/src/system_image.rs"],
  ["protected-ab-update-state-machine", "native/vcg-host/src/system_update.rs"],
  ["signed-recovery-image-verification", "native/vcg-host/src/recovery_image.rs"],
  ["ab-update-contract", "docs/SYSTEM_AB_UPDATE_STATE.md"],
  ["recovery-image-contract", "docs/RECOVERY_IMAGE_BUNDLE.md"],
];
const executionKeys = [
  "exactTargetHardwareSha256",
  "qualifiedBaselineImageResultSha256",
  "signedOfflineBundleSha256",
  "compatibilityManifestSha256",
  "healthOracleSha256",
  "faultInjectionProtocolSha256",
  "dataPreservationProtocolSha256",
  "networkIsolationProtocolSha256",
  "scheduleSha256",
  "trustedClockSha256",
  "hardwareAccessAuthorized",
  "downloadAuthorized",
  "installAuthorized",
  "slotMutationAuthorized",
  "faultInjectionAuthorized",
  "networkAccessAuthorized",
  "publicationAuthorized",
];

function exactKeys(value, expected, label) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  assert.ok(
    !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
    `${label} must not contain a UTF-8 BOM`,
  );
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has a bare CR`);
  return text.replaceAll("\r\n", "\n");
}

function digest(bytes, label) {
  return createHash("sha256").update(normalizedText(bytes, label)).digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.ok(Array.isArray(bindings));
  assert.equal(bindings.length, sourceDefinitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], sourceDefinitions[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    const relativePath = relative(repositoryRoot, absolute);
    assert.ok(
      relativePath.length > 0 &&
        !relativePath.startsWith("..") &&
        !isAbsolute(relativePath),
      `sourceBindings[${index}] escapes repository`,
    );
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateHailoPackageModelRecoveryPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, HAILO_RECOVERY_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "hailo-package-model-recovery-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-164"]);
  for (const phrase of [
    "zero-result recovery plan",
    "do not prove",
    "No download",
    "hardware execution is authorized",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.executionBoundary, executionKeys, "executionBoundary");
  for (const key of executionKeys.slice(0, 10)) {
    assert.equal(plan.executionBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of executionKeys.slice(10)) {
    assert.equal(plan.executionBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  exactKeys(plan.compatibilityTuple, [
    "componentIds",
    "componentCount",
    "everyVersionArchitectureDigestAndDependencyEdgeRequired",
    "wildcardsMovingTagsLatestAliasesOrFilenameOnlyIdentityAllowed",
    "gamesOrBrowserMaySelectOrOverrideTuple",
    "baselineTupleSha256",
    "priorHealthyTupleSha256",
    "candidateTupleSha256",
  ], "compatibilityTuple");
  assert.deepEqual(plan.compatibilityTuple.componentIds, [...HAILO_TUPLE_COMPONENTS]);
  assert.equal(plan.compatibilityTuple.componentCount, 10);
  assert.equal(
    plan.compatibilityTuple.everyVersionArchitectureDigestAndDependencyEdgeRequired,
    true,
  );
  assert.equal(
    plan.compatibilityTuple.wildcardsMovingTagsLatestAliasesOrFilenameOnlyIdentityAllowed,
    false,
  );
  assert.equal(plan.compatibilityTuple.gamesOrBrowserMaySelectOrOverrideTuple, false);
  for (const key of [
    "baselineTupleSha256",
    "priorHealthyTupleSha256",
    "candidateTupleSha256",
  ]) {
    assert.equal(plan.compatibilityTuple[key], null);
  }

  assert.ok(Array.isArray(plan.scenarios));
  assert.equal(plan.scenarios.length, HAILO_RECOVERY_SCENARIOS.length);
  for (const [index, scenario] of plan.scenarios.entries()) {
    exactKeys(
      scenario,
      ["scenarioId", "expectedDisposition", "networkMode", "mutationClass"],
      `scenarios[${index}]`,
    );
    assert.deepEqual(
      [
        scenario.scenarioId,
        scenario.expectedDisposition,
        scenario.networkMode,
        scenario.mutationClass,
      ],
      HAILO_RECOVERY_SCENARIOS[index],
    );
  }

  assert.deepEqual(plan.campaignRules, {
    scenarioCount: 14,
    validCyclesPerScenario: 20,
    requiredCycleCount: 280,
    eachMismatchChangesExactlyOneDeclaredTupleComponent: true,
    scenarioOrderCounterbalanced: true,
    failuresRetriesCutsAndInvalidCyclesRemainVisible: true,
    failedOrInvalidCycleMayBeReplaced: false,
    scenarioMayRescueOtherScenario: false,
    aggregateMayRescueFailedCycle: false,
  });

  assert.deepEqual(plan.fixedAcceptance, {
    signatureAndThresholdVerificationBeforeParsingOrExtraction: true,
    archiveImageAndInstalledTupleReadbackHashesRequired: true,
    conventionalInPlaceFamilyModeUpdateAllowed: false,
    onlyInactiveSystemSlotMayBeWritten: true,
    mismatchMustFailBeforeCameraParticipantOrModelInference: true,
    healthMustLoadExactHefPostprocessorAndKnownNonSensitiveVector: true,
    hailortcliIdentityAloneMayPassHealth: false,
    launcherTrackerCameraControllerNetworkStorageAndHailoHealthRequired: true,
    maximumOfflineScenarioNetworkAttempts: 0,
    maximumSilentTupleSubstitutions: 0,
    maximumWritableSaveOrContentMutations: 0,
    maximumBootFailuresAfterRequiredRecovery: 0,
    maximumValidProductFailures: 0,
    downgradeOrRollbackMayLowerProtectedHighestSeenGeneration: false,
    allScenariosAndCyclesMustPass: true,
  });

  exactKeys(plan.openAcceptance, [
    "maximumHealthWindowMs",
    "maximumOfflineReinstallP95Ms",
    "maximumUpdateP95Ms",
    "maximumRollbackP95Ms",
    "maximumInterruptionRecoveryMs",
    "minimumFreeSpaceHeadroomBytes",
    "maximumWriteAmplificationPpm",
    "maximumBootAttemptCount",
    "maximumTemperatureMilliC",
    "maximumWallPowerMilliW",
    "mustBeFixedBeforeExecution",
  ], "openAcceptance");
  for (const key of Object.keys(plan.openAcceptance).slice(0, 10)) {
    assert.equal(plan.openAcceptance[key], null, `blocked plan cannot fix ${key}`);
  }
  assert.equal(plan.openAcceptance.mustBeFixedBeforeExecution, true);

  assert.deepEqual(plan.dataPolicy, {
    compatibilityEvidenceLimitedToVersionsArchitecturesDigestsDependencyEdgesAndClosedResults: true,
    knownHealthVectorMustBeSyntheticAndNonSensitive: true,
    rawCameraFramesAudioParticipantIdentifiersFreeTextPathsCredentialsKeysOrTokensAllowed: false,
    saveProfilePortraitCalibrationBodyMatchingOrImportedContentAllowedInImageOrEvidence: false,
    privateSigningMaterialAllowed: false,
    cycleLevelPowerCutTupleHealthAndPreservationEvidenceRequired: true,
  });

  exactKeys(plan.executionGate, [
    "state",
    "blockerCodes",
    "readyRequiresEveryBlockerResolvedBeforeFirstMutation",
  ], "executionGate");
  assert.equal(plan.executionGate.state, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, [...HAILO_RECOVERY_BLOCKERS]);
  assert.equal(plan.executionGate.readyRequiresEveryBlockerResolvedBeforeFirstMutation, true);

  assert.deepEqual(plan.result, {
    disposition: "blocked",
    completedScenarioCount: 0,
    completedCycleCount: 0,
    scenarioResults: [],
    qualifiedTupleSha256: null,
    rollbackQualified: false,
    offlineReinstallQualified: false,
    imageOrProductSelectionChanged: false,
  });
}

export async function parseHailoPackageModelRecoveryPlanBytes(bytes) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error("plan is not valid JSON", { cause: error });
  }
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must use canonical two-space JSON with one trailing LF",
  );
  await validateHailoPackageModelRecoveryPlan(plan);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await parseHailoPackageModelRecoveryPlanBytes(await readFile(trackedPath));
  console.log(
    `Hailo recovery plan valid: status=${plan.status} components=${plan.compatibilityTuple.componentCount} scenarios=${plan.campaignRules.scenarioCount} cycles=${plan.campaignRules.requiredCycleCount}`,
  );
}
