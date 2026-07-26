import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/signed-local-package/runtime-neutral-signed-local-package-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const SIGNED_LOCAL_PACKAGE_PLAN_FORMAT =
  "vcg-runtime-neutral-signed-local-package-plan/v1";
export const SIGNED_LOCAL_PACKAGE_LANES = Object.freeze([
  [
    "local-web-aarch64-linux",
    "local-web",
    "aarch64-linux",
    "architecture-neutral-bundled-web",
  ],
  [
    "local-web-x86-64-linux",
    "local-web",
    "x86-64-linux",
    "architecture-neutral-bundled-web",
  ],
  [
    "native-aarch64-linux",
    "native",
    "aarch64-linux",
    "aarch64-linux-native-executable",
  ],
  [
    "native-x86-64-linux",
    "native",
    "x86-64-linux",
    "x86-64-linux-native-executable",
  ],
]);
export const SIGNED_LOCAL_PACKAGE_SCENARIOS = Object.freeze([
  "clean-reproducible-build",
  "signature-first-intake",
  "install-and-architecture-selection",
  "cold-launch-to-interactive",
  "motion-api-under-representative-load",
  "controller-gameplay-and-glyphs",
  "reserved-home-back-pause",
  "offline-and-network-declaration",
  "save-create-restart-update-preservation",
  "health-failure-and-rollback",
  "update-and-interrupted-update-recovery",
  "uninstall-preserve-or-delete-choice",
]);
export const SIGNED_LOCAL_PACKAGE_BLOCKERS = Object.freeze([
  "exact-example-game-source-and-rights-review",
  "aarch64-and-x86-64-linux-target-configurations",
  "reproducible-build-toolchain-and-protocol",
  "package-signing-delegation-and-key-custody",
  "local-web-loopback-server-browser-wrapper-and-origin-policy",
  "native-sandbox-compositor-service-and-descendant-policy",
  "motion-api-controller-and-reserved-action-projection",
  "network-enforcement-and-service-declaration-policy",
  "save-schema-quota-update-rollback-uninstall-policy",
  "health-readiness-loading-and-recovery-policy",
  "numeric-size-performance-resource-and-recovery-gates",
  "evidence-collection-oracles-and-schedule",
  "build-sign-install-execute-update-uninstall-and-publication-authority",
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
  "authorityBoundary",
  "packageLanes",
  "lifecycleMatrix",
  "interfaceRequirements",
  "fixedAcceptance",
  "openAcceptance",
  "evidencePolicy",
  "executionGate",
  "result",
];
const sourceDefinitions = [
  ["package-and-runtime-decisions", "docs/DECISIONS.md"],
  ["public-game-manifest-contract", "packages/game-manifest/src/index.ts"],
  [
    "synthetic-local-web-manifest-fixture",
    "packages/game-manifest/fixtures/v1/valid/local-web.vcg-game.json",
  ],
  [
    "synthetic-native-manifest-fixture",
    "packages/game-manifest/fixtures/v1/valid/native.vcg-game.json",
  ],
  ["signature-first-package-intake", "native/vcg-host/src/package_intake.rs"],
  ["signed-installed-catalog", "native/vcg-host/src/installed_catalog.rs"],
  [
    "protected-package-generation-store",
    "native/vcg-host/src/package_generation.rs",
  ],
  ["shared-package-launch-dispatch", "native/vcg-host/src/package_launch.rs"],
  ["native-package-process-adapter", "native/vcg-host/src/native_package.rs"],
  ["runtime-neutral-save-lifecycle", "native/vcg-host/src/save_lifecycle.rs"],
  [
    "local-web-explicit-readiness-boundary",
    "docs/LOCAL_WEB_EXPLICIT_READINESS.md",
  ],
  ["native-package-runtime-boundary", "docs/NATIVE_PACKAGE_RUNTIME.md"],
];
const authorityKeys = [
  "targetConfigurations",
  "exampleGameSourceSha256",
  "rightsReviewSha256",
  "buildToolchainSha256",
  "reproducibleBuildProtocolSha256",
  "signingAndDelegationPolicySha256",
  "localWebRuntimePolicySha256",
  "nativeRuntimePolicySha256",
  "inputAndReservedActionProtocolSha256",
  "motionApiProtocolSha256",
  "networkEnforcementProtocolSha256",
  "saveLifecycleProtocolSha256",
  "healthAndReadinessProtocolSha256",
  "updateRollbackUninstallProtocolSha256",
  "evidenceProtocolSha256",
  "buildAuthorized",
  "signingAuthorized",
  "installMutationAuthorized",
  "executionAuthorized",
  "updateRollbackUninstallAuthorized",
  "publicationAuthorized",
];
const laneKeys = [
  "laneId",
  "runtime",
  "target",
  "artifactClass",
  "examplePackageId",
  "sourceRevisionSha256",
  "buildRecipeSha256",
  "artifactSha256",
  "manifestSha256",
  "signatureBundleSha256",
  "installedCatalogSha256",
  "reproducibilityWitnessSha256",
  "targetResultSha256",
  "requiresIndependentTargetResult",
  "otherTargetMayQualify",
  "builtinOrHostedFixtureMayQualify",
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
  const text = normalizedText(bytes, label);
  return createHash("sha256").update(text).digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.ok(Array.isArray(bindings), "sourceBindings must be an array");
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

export async function validateRuntimeNeutralSignedLocalPackagePlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, SIGNED_LOCAL_PACKAGE_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "runtime-neutral-signed-local-package-pipeline-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-181"]);
  for (const phrase of [
    "zero-result qualification plan",
    "do not prove",
    "No runtime lane or target may rescue another",
    "no package may be published",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.authorityBoundary, authorityKeys, "authorityBoundary");
  assert.deepEqual(plan.authorityBoundary.targetConfigurations, {
    aarch64LinuxSha256: null,
    x8664LinuxSha256: null,
  });
  for (const key of authorityKeys.slice(1, 15)) {
    assert.equal(plan.authorityBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of authorityKeys.slice(15)) {
    assert.equal(plan.authorityBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  assert.ok(Array.isArray(plan.packageLanes));
  assert.equal(plan.packageLanes.length, SIGNED_LOCAL_PACKAGE_LANES.length);
  for (const [index, lane] of plan.packageLanes.entries()) {
    exactKeys(lane, laneKeys, `packageLanes[${index}]`);
    assert.deepEqual(
      [lane.laneId, lane.runtime, lane.target, lane.artifactClass],
      SIGNED_LOCAL_PACKAGE_LANES[index],
    );
    for (const key of laneKeys.slice(4, 13)) {
      assert.equal(lane[key], null, `blocked lane cannot bind ${key}`);
    }
    assert.equal(lane.requiresIndependentTargetResult, true);
    assert.equal(lane.otherTargetMayQualify, false);
    assert.equal(lane.builtinOrHostedFixtureMayQualify, false);
  }

  exactKeys(plan.lifecycleMatrix, [
    "scenarioIds",
    "laneCount",
    "validCyclesPerLaneScenario",
    "requiredCellCount",
    "requiredCycleCount",
    "sameReleaseIdentityAcrossTargetsPerRuntime",
    "everyLaneAndScenarioRequired",
    "runtimeLaneMayRescueOtherRuntime",
    "targetMayRescueOtherTarget",
    "scenarioMayRescueOtherScenario",
    "aggregateMayRescueFailedCell",
  ], "lifecycleMatrix");
  assert.deepEqual(plan.lifecycleMatrix.scenarioIds, [
    ...SIGNED_LOCAL_PACKAGE_SCENARIOS,
  ]);
  assert.equal(plan.lifecycleMatrix.laneCount, 4);
  assert.equal(plan.lifecycleMatrix.validCyclesPerLaneScenario, 20);
  assert.equal(plan.lifecycleMatrix.requiredCellCount, 48);
  assert.equal(plan.lifecycleMatrix.requiredCycleCount, 960);
  assert.equal(plan.lifecycleMatrix.sameReleaseIdentityAcrossTargetsPerRuntime, true);
  assert.equal(plan.lifecycleMatrix.everyLaneAndScenarioRequired, true);
  for (const key of [
    "runtimeLaneMayRescueOtherRuntime",
    "targetMayRescueOtherTarget",
    "scenarioMayRescueOtherScenario",
    "aggregateMayRescueFailedCell",
  ]) {
    assert.equal(plan.lifecycleMatrix[key], false);
  }

  exactKeys(plan.interfaceRequirements, [
    "manifestRequiredFields",
    "manifestAndSignedCatalogMustAgree",
    "packageMayChooseProgramArgumentsEnvironmentOrWritablePaths",
    "hostSelectsArchitectureAndRuntimeAdapter",
    "motionSchemaVersion",
    "motionApiReceiptIsLatencyEndpoint",
    "reservedActionIds",
    "gameMayCaptureReservedActions",
    "controllerOnlyFlowRequired",
    "brandedLoadingAndResponsiveCancelRequired",
    "interactiveMeansUsableInputNotFirstPixels",
    "localWebRequiresExactLoopbackOriginAndQualifiedWrapper",
    "nativeRequiresTargetSandboxAndOwnedDescendants",
    "saveRootsHostDerivedAndPerGameProfile",
    "networkDefaultDenyAndExactDeclaration",
    "sameLifecycleAcrossRuntimes",
  ], "interfaceRequirements");
  assert.deepEqual(plan.interfaceRequirements.manifestRequiredFields, [
    "version",
    "runtime",
    "entrypoint",
    "architecture",
    "permissions",
    "input",
    "license",
    "health",
    "integrity",
    "network",
    "storage-quota",
    "compatibility",
  ]);
  assert.equal(plan.interfaceRequirements.manifestAndSignedCatalogMustAgree, true);
  assert.equal(
    plan.interfaceRequirements.packageMayChooseProgramArgumentsEnvironmentOrWritablePaths,
    false,
  );
  assert.equal(plan.interfaceRequirements.hostSelectsArchitectureAndRuntimeAdapter, true);
  assert.equal(plan.interfaceRequirements.motionSchemaVersion, "0.4.0");
  assert.equal(plan.interfaceRequirements.motionApiReceiptIsLatencyEndpoint, true);
  assert.deepEqual(plan.interfaceRequirements.reservedActionIds, ["Home", "Back", "Pause"]);
  assert.equal(plan.interfaceRequirements.gameMayCaptureReservedActions, false);
  for (const key of [
    "controllerOnlyFlowRequired",
    "brandedLoadingAndResponsiveCancelRequired",
    "interactiveMeansUsableInputNotFirstPixels",
    "localWebRequiresExactLoopbackOriginAndQualifiedWrapper",
    "nativeRequiresTargetSandboxAndOwnedDescendants",
    "saveRootsHostDerivedAndPerGameProfile",
    "networkDefaultDenyAndExactDeclaration",
    "sameLifecycleAcrossRuntimes",
  ]) {
    assert.equal(plan.interfaceRequirements[key], true);
  }

  assert.deepEqual(plan.fixedAcceptance, {
    cleanBuildCount: 2,
    byteIdenticalReleaseArchiveRequired: true,
    byteIdenticalRuntimeArtifactRequired: true,
    maximumLocalInteractiveMs: 15000,
    maximumMotionExposureToApiP95Ms: 120,
    minimumActionPrecisionPpm: 950000,
    minimumActionRecallPpm: 900000,
    maximumUnintendedPrivilegedActions: 0,
    maximumUndeclaredNetworkAttempts: 0,
    maximumUndeclaredDeviceAccesses: 0,
    maximumEscapedDescendants: 0,
    maximumValidProductFailures: 0,
    healthyUpdateMustPreserveSaves: true,
    rollbackMustNotDeleteOrRewriteSaves: true,
    uninstallMustRequireControllerConfirmedSaveDisposition: true,
    allCellsMustPass: true,
    crossRuntimeOrTargetAggregateRescueAllowed: false,
  });

  exactKeys(plan.openAcceptance, [
    "maximumArchiveBytesByRuntime",
    "maximumExpandedBytesByRuntime",
    "maximumInstallP95Ms",
    "maximumUpdateP95Ms",
    "maximumRollbackP95Ms",
    "maximumUninstallP95Ms",
    "maximumCpuPpmByLane",
    "maximumRamBytesByLane",
    "maximumGpuPpmByLane",
    "maximumStorageQuotaBytesByRuntime",
    "maximumReadyJitterMs",
    "maximumRecoveryMs",
    "mustBeFixedBeforeExecution",
  ], "openAcceptance");
  for (const key of Object.keys(plan.openAcceptance).slice(0, 12)) {
    assert.equal(plan.openAcceptance[key], null, `blocked plan cannot fix ${key}`);
  }
  assert.equal(plan.openAcceptance.mustBeFixedBeforeExecution, true);

  assert.deepEqual(plan.evidencePolicy, {
    exactSourceBuildRecipeToolchainArtifactManifestSignatureCatalogAndResultDigestsRequired: true,
    twoIndependentCleanBuildLogsRequired: true,
    sbomLicenseAndRightsEvidenceRequired: true,
    attemptAndCycleLevelEvidenceRequired: true,
    skeletonOnlyMotionEvidenceInRepositoryOrRelease: true,
    rawCameraFramesOrAudioAllowedInRepositoryOrRelease: false,
    participantIdentifiersFreeTextPathsSecretsKeysCredentialsOrTokensAllowed: false,
    privateSigningKeyMaterialAllowedInEvidence: false,
    declaredNetworkAttemptLedgerRequired: true,
    saveContentsAllowedInEvidence: false,
    failuresRetriesInterruptionsAndRollbackReasonsMustRemainVisible: true,
  });

  exactKeys(plan.executionGate, [
    "state",
    "blockerCodes",
    "readyRequiresEveryBlockerResolvedBeforeFirstBuild",
  ], "executionGate");
  assert.equal(plan.executionGate.state, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, [...SIGNED_LOCAL_PACKAGE_BLOCKERS]);
  assert.equal(plan.executionGate.readyRequiresEveryBlockerResolvedBeforeFirstBuild, true);

  assert.deepEqual(plan.result, {
    disposition: "blocked",
    completedCellCount: 0,
    completedCycleCount: 0,
    laneResults: [],
    qualifiedLaneIds: [],
    selectedDefaultRuntime: null,
    publishedPackageIds: [],
    productDefaultChanged: false,
  });
}

export async function parseRuntimeNeutralSignedLocalPackagePlanBytes(bytes) {
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
  await validateRuntimeNeutralSignedLocalPackagePlan(plan);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await parseRuntimeNeutralSignedLocalPackagePlanBytes(
    await readFile(trackedPath),
  );
  console.log(
    `signed local-package plan valid: status=${plan.status} lanes=${plan.packageLanes.length} cells=${plan.lifecycleMatrix.requiredCellCount} cycles=${plan.lifecycleMatrix.requiredCycleCount}`,
  );
}
