import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/steam-machine-accountless/steam-machine-accountless-core-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const STEAM_MACHINE_ACCOUNTLESS_FORMAT =
  "vcg-steam-machine-accountless-core-plan/v1";

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "qualificationScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "officialReferenceRecords",
  "targetContract",
  "authorityBoundary",
  "coreRoles",
  "lifecycleScenarios",
  "serviceBoundaryCases",
  "qualificationMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "dataPolicy",
  "executionGate",
  "result",
];

const sourceDefinitions = [
  ["accountless-research-boundary", "docs/AUTONOMOUS_RESEARCH_2026-07-19.md"],
  ["online-offline-service-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
  ["steam-machine-platform-boundary", "docs/STEAM_MACHINE_2026.md"],
  [
    "steamos-package-campaign-boundary",
    "docs/STEAMOS_UPDATE_SAFE_CONTENT_CAMPAIGN_2026-07-26.md",
  ],
  [
    "steamos-input-campaign-boundary",
    "docs/STEAMOS_STEAM_INPUT_ACTION_CAMPAIGN_2026-07-26.md",
  ],
  [
    "steamos-shell-campaign-boundary",
    "docs/STEAMOS_OUTER_SHELL_LIFECYCLE_CAMPAIGN_2026-07-26.md",
  ],
  [
    "steamos-package-plan-boundary",
    "benchmarks/steamos-content/steamos-update-safe-content-plan-v1.json",
  ],
  [
    "steamos-input-plan-boundary",
    "benchmarks/steam-input/steamos-steam-input-action-plan-v1.json",
  ],
  [
    "steamos-shell-plan-boundary",
    "benchmarks/steamos-shell/steamos-outer-shell-lifecycle-plan-v1.json",
  ],
  [
    "boot-resume-timing-boundary",
    "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json",
  ],
  [
    "signed-local-package-boundary",
    "benchmarks/signed-local-package/runtime-neutral-signed-local-package-plan-v1.json",
  ],
];

export const ACCOUNTLESS_CORE_ROLE_IDS = Object.freeze([
  "launcher-shell",
  "tracker-motion-api",
  "local-profile-management",
  "signed-local-package",
  "supervised-retro-lane",
  "local-save-and-unassigned-progress",
]);

export const ACCOUNTLESS_LIFECYCLE_SCENARIO_IDS = Object.freeze([
  "stock-first-boot-before-any-steam-login",
  "supported-accountless-first-vcg-entry-online",
  "accountless-cold-restart-online",
  "accountless-cold-restart-network-disabled",
  "network-loss-during-core-operation",
  "network-restore-after-offline-operation",
  "steam-client-absent-stopped-or-failed",
  "prior-steam-account-signed-out-and-removed",
  "post-steamos-and-vcg-update",
  "post-supported-reinstall-or-recovery",
]);

const serviceCases = [
  ["local-core-no-service", "available-without-account-or-network"],
  [
    "vcg-hosted-content",
    "separately-network-dependent-without-steam-identity",
  ],
  [
    "steam-store-library-community-and-cloud",
    "steam-account-dependent-and-truthfully-disclosed",
  ],
  [
    "third-party-account-or-launcher-content",
    "separately-account-dependent-or-unavailable-without-weakening-local-core",
  ],
  [
    "steam-offline-mode",
    "prior-account-offline-feature-never-accountless-evidence",
  ],
];

const metricIds = [
  "supported-path-disposition",
  "controller-usable-ready-ms",
  "canonical-action-response-ms",
  "account-login-prompt-count",
  "steam-process-sdk-or-client-dependency-count",
  "required-network-request-count",
  "undeclared-egress-count",
  "steam-identity-credential-token-or-cookie-observation-count",
  "local-owner-or-profile-reassociation-count",
  "local-data-loss-or-corruption-count",
  "operator-keyboard-mouse-or-shell-intervention-count",
  "unrecovered-failure-count",
];

const blockerCodes = [
  "I170-001-exact-retail-target-and-custody",
  "I170-002-exact-steamos-and-runtime-manifest",
  "I170-003-supported-accountless-first-setup-or-vcg-entry",
  "I170-004-supported-package-install-and-launch-path",
  "I170-005-core-role-readiness-and-controller-oracles",
  "I170-006-steam-process-account-identity-and-storage-audit",
  "I170-007-network-fault-egress-and-service-classification",
  "I170-008-disposable-account-fixture-removal-and-data-disposition",
  "I170-009-update-reinstall-recovery-and-device-only-loss",
  "I170-010-schedule-numeric-gates-and-independent-review",
  "I170-011-result-schema-sanitization-retention-and-incident-policy",
  "I170-012-owner-authority-for-target-account-network-and-update-operation",
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
  let value;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(value), `${label} has a bare CR`);
  return value.replaceAll("\r\n", "\n");
}

function digest(bytes, label) {
  return createHash("sha256").update(normalizedText(bytes, label)).digest("hex");
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

function validateOfficialReferences(records) {
  assert.deepEqual(records, [
    {
      referenceId: "valve-steam-machine-feature-guide",
      publisher: "Valve",
      url: "https://help.steampowered.com/en/faqs/view/1180-0BA6-4A75-B7CA",
      checkedAt: "2026-07-26",
      facts: [
        "stock-first-start-guides-controller-network-and-steam-login",
        "desktop-mode-is-reached-from-steam-menu-power",
        "steamos-and-hardware-updates-remain-in-steam-settings",
      ],
    },
    {
      referenceId: "valve-steam-offline-mode",
      publisher: "Valve",
      url: "https://help.steampowered.com/en/faqs/view/0E18-319B-E34B-B2C8",
      checkedAt: "2026-07-26",
      facts: [
        "offline-mode-starts-from-an-online-steam-login-with-remember-me-enabled",
        "offline-content-must-be-updated-and-usually-launched-online-first",
        "stored-account-information-is-required-for-offline-mode",
        "a-login-prompt-cannot-be-bypassed-while-offline",
      ],
    },
  ]);
}

export async function validateSteamMachineAccountlessCorePlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, STEAM_MACHINE_ACCOUNTLESS_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "i170-steam-machine-accountless-core-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.equal(
    plan.qualificationScope,
    "accountless local VCG core operation on one exact retail Steam Machine and stock supported SteamOS path, with Steam-only services disclosed and kept separate",
  );
  for (const phrase of [
    "strict zero-result I-170 qualification plan",
    "stock first setup through network connection and Steam login",
    "Offline Mode requires prior online login",
    "cannot establish accountless operation",
    "cannot prove a received Steam Machine",
    "No target, account, network, package, profile, save, update, recovery, publication, compatibility, or product-tier operation is authorized",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);
  validateOfficialReferences(plan.officialReferenceRecords);

  exactKeys(
    plan.targetContract,
    [
      "targetId",
      "targetClass",
      "exactReceivedHardwareFirmwareAndCustodyManifestSha256",
      "exactSteamOsImageKernelFirmwareDriverClientAndGamescopeManifestSha256",
      "supportedAccountlessFirstSetupOrVcgEntryPathSha256",
      "vcgPackageRuntimeAndWritableRootManifestSha256",
      "controllerCameraNetworkAndDisplayManifestSha256",
      "targetReceivedInventoriedAndAuthorized",
      "stockFirstSetupDocumentedWithoutSteamLogin",
      "steamOfflineModeCountsAsAccountless",
      "rememberedCredentialsCountAsAccountless",
      "signedOutOrAccountRemovedStateRequiresIndependentProof",
      "optionalSteamMachineMayReplaceRequiredPiOrOrdinaryLinuxTargets",
      "otherTargetDeskOrOfficialDescriptionEvidenceMayQualify",
    ],
    "targetContract",
  );
  assert.equal(plan.targetContract.targetId, "optional-retail-steam-machine");
  assert.equal(
    plan.targetContract.targetClass,
    "exact-retail-steam-machine-stock-steamos",
  );
  for (const key of [
    "exactReceivedHardwareFirmwareAndCustodyManifestSha256",
    "exactSteamOsImageKernelFirmwareDriverClientAndGamescopeManifestSha256",
    "supportedAccountlessFirstSetupOrVcgEntryPathSha256",
    "vcgPackageRuntimeAndWritableRootManifestSha256",
    "controllerCameraNetworkAndDisplayManifestSha256",
  ]) {
    assert.equal(plan.targetContract[key], null, `${key} must remain open`);
  }
  for (const key of [
    "targetReceivedInventoriedAndAuthorized",
    "stockFirstSetupDocumentedWithoutSteamLogin",
    "steamOfflineModeCountsAsAccountless",
    "rememberedCredentialsCountAsAccountless",
    "optionalSteamMachineMayReplaceRequiredPiOrOrdinaryLinuxTargets",
    "otherTargetDeskOrOfficialDescriptionEvidenceMayQualify",
  ]) {
    assert.equal(plan.targetContract[key], false, `${key} must remain false`);
  }
  assert.equal(
    plan.targetContract.signedOutOrAccountRemovedStateRequiresIndependentProof,
    true,
  );

  const authorityNullKeys = [
    "supportedFirstSetupEntryAndInstallProtocolSha256",
    "coreSubsystemReadinessAndControllerProtocolSha256",
    "steamProcessAccountIdentityAndStorageAuditProtocolSha256",
    "networkDisableLossRestoreAndEgressAuditProtocolSha256",
    "steamAccountFixtureSignOutRemovalAndDeletionProtocolSha256",
    "steamosUpdatePackageReinstallAndRecoveryProtocolSha256",
    "localProfileSavePackageAndIdentityDispositionProtocolSha256",
    "scheduleIndependentOracleAndNumericGateProtocolSha256",
    "resultSchemaSanitizationRetentionAndReviewProtocolSha256",
  ];
  const authorityFalseKeys = [
    "exactTargetOperationAuthorized",
    "steamAccountCreationLoginSignOutRemovalOrDeletionAuthorized",
    "networkDisableLossRestoreOrTrafficInspectionAuthorized",
    "packageInstallUpdateRollbackUninstallOrLaunchAuthorized",
    "localProfileSaveOrIdentityMutationAuthorized",
    "steamOsUpdateRepairReimageOrRecoveryAuthorized",
    "qualificationPublicationCompatibilityOrTierMutationAuthorized",
  ];
  exactKeys(
    plan.authorityBoundary,
    [...authorityNullKeys, ...authorityFalseKeys],
    "authorityBoundary",
  );
  for (const key of authorityNullKeys) {
    assert.equal(plan.authorityBoundary[key], null, `${key} must remain open`);
  }
  for (const key of authorityFalseKeys) {
    assert.equal(plan.authorityBoundary[key], false, `${key} must remain false`);
  }

  assert.ok(Array.isArray(plan.coreRoles));
  assert.equal(plan.coreRoles.length, ACCOUNTLESS_CORE_ROLE_IDS.length);
  assert.deepEqual(
    plan.coreRoles.map(({ roleId }) => roleId),
    ACCOUNTLESS_CORE_ROLE_IDS,
  );
  for (const [index, role] of plan.coreRoles.entries()) {
    exactKeys(
      role,
      ["roleId", "passingEnd", "steamDependencyAllowed"],
      `coreRoles[${index}]`,
    );
    assert.equal(typeof role.passingEnd, "string");
    assert.ok(role.passingEnd.length >= 70);
    assert.equal(role.steamDependencyAllowed, false);
  }

  assert.ok(Array.isArray(plan.lifecycleScenarios));
  assert.equal(
    plan.lifecycleScenarios.length,
    ACCOUNTLESS_LIFECYCLE_SCENARIO_IDS.length,
  );
  assert.deepEqual(
    plan.lifecycleScenarios.map(({ scenarioId }) => scenarioId),
    ACCOUNTLESS_LIFECYCLE_SCENARIO_IDS,
  );
  for (const [index, scenario] of plan.lifecycleScenarios.entries()) {
    exactKeys(
      scenario,
      ["scenarioId", "precondition", "transition", "requiredOutcome"],
      `lifecycleScenarios[${index}]`,
    );
    for (const key of ["precondition", "transition", "requiredOutcome"]) {
      assert.equal(typeof scenario[key], "string");
      assert.ok(
        scenario[key].length >= (key === "transition" ? 35 : 55),
        `${scenario.scenarioId}.${key} is underspecified`,
      );
    }
  }
  assert.match(
    plan.lifecycleScenarios[0].requiredOutcome,
    /blocking login boundary is recorded without workaround promotion/u,
  );
  assert.match(
    plan.lifecycleScenarios[7].requiredOutcome,
    /local VCG profiles, saves, packages, and opaque owners remain independent/u,
  );
  assert.match(
    plan.lifecycleScenarios[9].requiredOutcome,
    /recreated rather than recovered or reassociated through Steam/u,
  );

  assert.deepEqual(
    plan.serviceBoundaryCases.map(({ caseId, expectedDisposition }) => [
      caseId,
      expectedDisposition,
    ]),
    serviceCases,
  );
  for (const [index, value] of plan.serviceBoundaryCases.entries()) {
    exactKeys(
      value,
      ["caseId", "expectedDisposition"],
      `serviceBoundaryCases[${index}]`,
    );
  }

  exactKeys(
    plan.qualificationMatrix,
    [
      "coreRoleIds",
      "lifecycleScenarioIds",
      "coreRoleCount",
      "lifecycleScenarioCount",
      "requiredCellCount",
      "validCyclesPerCell",
      "requiredCycleCount",
      "everyRoleScenarioCellMustRun",
      "failedBlockedInvalidStoppedRetriedAndWorstCaseCyclesRemainVisible",
      "loggedInOfflineModeOtherTargetRoleScenarioOrAggregateMayRescueFailure",
    ],
    "qualificationMatrix",
  );
  assert.deepEqual(plan.qualificationMatrix.coreRoleIds, ACCOUNTLESS_CORE_ROLE_IDS);
  assert.deepEqual(
    plan.qualificationMatrix.lifecycleScenarioIds,
    ACCOUNTLESS_LIFECYCLE_SCENARIO_IDS,
  );
  assert.equal(plan.qualificationMatrix.coreRoleCount, 6);
  assert.equal(plan.qualificationMatrix.lifecycleScenarioCount, 10);
  assert.equal(plan.qualificationMatrix.requiredCellCount, 60);
  assert.equal(plan.qualificationMatrix.validCyclesPerCell, 10);
  assert.equal(plan.qualificationMatrix.requiredCycleCount, 600);
  assert.equal(plan.qualificationMatrix.everyRoleScenarioCellMustRun, true);
  assert.equal(
    plan.qualificationMatrix
      .failedBlockedInvalidStoppedRetriedAndWorstCaseCyclesRemainVisible,
    true,
  );
  assert.equal(
    plan.qualificationMatrix
      .loggedInOfflineModeOtherTargetRoleScenarioOrAggregateMayRescueFailure,
    false,
  );
  assert.equal(
    plan.qualificationMatrix.requiredCellCount,
    plan.qualificationMatrix.coreRoleCount *
      plan.qualificationMatrix.lifecycleScenarioCount,
  );
  assert.equal(
    plan.qualificationMatrix.requiredCycleCount,
    plan.qualificationMatrix.requiredCellCount *
      plan.qualificationMatrix.validCyclesPerCell,
  );

  exactKeys(
    plan.measurements,
    [
      "requiredMetricIds",
      "independentProcessAccountIdentityNetworkInputReadinessStorageAndRecoveryOraclesRequired",
      "everyAttemptPromptRequestDependencyMutationFailureAndDisclosureMustRemainVisible",
      "uiCopyProcessLivenessCachedContentRememberedCredentialsOrOtherTargetMaySubstitute",
    ],
    "measurements",
  );
  assert.deepEqual(plan.measurements.requiredMetricIds, metricIds);
  assert.equal(
    plan.measurements
      .independentProcessAccountIdentityNetworkInputReadinessStorageAndRecoveryOraclesRequired,
    true,
  );
  assert.equal(
    plan.measurements
      .everyAttemptPromptRequestDependencyMutationFailureAndDisclosureMustRemainVisible,
    true,
  );
  assert.equal(
    plan.measurements
      .uiCopyProcessLivenessCachedContentRememberedCredentialsOrOtherTargetMaySubstitute,
    false,
  );

  const fixedZeroKeys = [
    "maximumAccountLoginPromptsForLocalCore",
    "maximumSteamProcessSdkClientOrOverlayDependenciesForLocalCore",
    "maximumRequiredNetworkRequestsForLocalCore",
    "maximumUndeclaredEgresses",
    "maximumSteamIdentityCredentialTokenCookieOrAccountStateObservationsInVcg",
    "maximumLocalOwnerProfileSaveOrPackageReassociationsToSteamIdentity",
    "maximumSilentLocalProfileSavePackageOrProgressLossOrCorruption",
    "maximumKeyboardMouseShellOrOperatorInterventionsInControllerOnlyCore",
    "maximumSteamOfflineModeCyclesCountedAsAccountless",
    "maximumRememberedCredentialCyclesCountedAsAccountless",
    "maximumValidProductFailuresPerCell",
  ];
  exactKeys(
    plan.fixedAcceptance,
    [
      "minimumValidCyclesPerCell",
      ...fixedZeroKeys,
      "everyRequiredCellMustPass",
      "steamOnlyFeaturesMustRemainSeparateAndDisclosed",
      "accountRemovalMayDeleteOrReassignLocalVcgData",
      "recoveryMayRestoreDeviceOnlyIdentityFromSteam",
      "optionalSteamMachineFailureMayWeakenAccountlessCoreRequirement",
      "loggedInOfflineModeOtherTargetRoleScenarioOrAggregateMayRescueFailure",
      "allOpenGatesMustBeFrozenBeforeOperation",
    ],
    "fixedAcceptance",
  );
  assert.equal(plan.fixedAcceptance.minimumValidCyclesPerCell, 10);
  for (const key of fixedZeroKeys) {
    assert.equal(plan.fixedAcceptance[key], 0, `${key} must remain zero`);
  }
  for (const key of [
    "everyRequiredCellMustPass",
    "steamOnlyFeaturesMustRemainSeparateAndDisclosed",
    "allOpenGatesMustBeFrozenBeforeOperation",
  ]) {
    assert.equal(plan.fixedAcceptance[key], true, `${key} must remain true`);
  }
  for (const key of [
    "accountRemovalMayDeleteOrReassignLocalVcgData",
    "recoveryMayRestoreDeviceOnlyIdentityFromSteam",
    "optionalSteamMachineFailureMayWeakenAccountlessCoreRequirement",
    "loggedInOfflineModeOtherTargetRoleScenarioOrAggregateMayRescueFailure",
  ]) {
    assert.equal(plan.fixedAcceptance[key], false, `${key} must remain false`);
  }

  exactKeys(
    plan.openAcceptance,
    [
      "maximumControllerUsableReadyP95MsByScenario",
      "maximumCanonicalActionResponseP95MsByRole",
      "maximumNetworkLossRecoveryP95MsByRole",
      "maximumNetworkRestoreSettlingP95MsByRole",
      "maximumUpdateReturnToAccountlessCoreP95Ms",
      "maximumRecoveryReturnToAccountlessCoreP95Ms",
      "maximumPersistentStorageGrowthBytesPerHour",
      "maximumDiagnosticLogGrowthBytesPerHour",
    ],
    "openAcceptance",
  );
  for (const [key, value] of Object.entries(plan.openAcceptance)) {
    assert.equal(value, null, `${key} must remain open`);
  }

  exactKeys(
    plan.dataPolicy,
    [
      "opaqueTargetBuildRoleScenarioCellCycleAccountStateAndReasonLabelsRequired",
      "closedCountsTimingsDigestsMetricsAndRedactedServiceCategoriesRequired",
      "steamAccountNamesIdsEmailsPhoneNumbersCredentialsTokensCookiesOrQrCodesAllowed",
      "localProfileIdsDisplayNamesPortraitsBodyDataSaveContentsOrPackagePayloadsAllowed",
      "pathsEnvironmentValuesProcessArgumentsUrlsWithQueriesOrStorageValuesAllowed",
      "rawNetworkBodiesScreenVideoAudioCameraFramesOrInputBuffersAllowed",
      "freeTextLogsPromptsErrorsOrResultEvidenceAllowed",
      "failedBlockedInvalidStoppedRetriedAndWorstCaseEvidenceMustRemainVisible",
    ],
    "dataPolicy",
  );
  for (const key of [
    "opaqueTargetBuildRoleScenarioCellCycleAccountStateAndReasonLabelsRequired",
    "closedCountsTimingsDigestsMetricsAndRedactedServiceCategoriesRequired",
    "failedBlockedInvalidStoppedRetriedAndWorstCaseEvidenceMustRemainVisible",
  ]) {
    assert.equal(plan.dataPolicy[key], true, `${key} must remain true`);
  }
  for (const key of [
    "steamAccountNamesIdsEmailsPhoneNumbersCredentialsTokensCookiesOrQrCodesAllowed",
    "localProfileIdsDisplayNamesPortraitsBodyDataSaveContentsOrPackagePayloadsAllowed",
    "pathsEnvironmentValuesProcessArgumentsUrlsWithQueriesOrStorageValuesAllowed",
    "rawNetworkBodiesScreenVideoAudioCameraFramesOrInputBuffersAllowed",
    "freeTextLogsPromptsErrorsOrResultEvidenceAllowed",
  ]) {
    assert.equal(plan.dataPolicy[key], false, `${key} must remain false`);
  }

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, blockerCodes);
  assert.equal(plan.result, null);
}

export async function readSteamMachineAccountlessCorePlan(
  path = trackedPath,
  repositoryRoot = root,
) {
  const bytes = await readFile(path);
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const value = JSON.parse(normalizedText(bytes, path));
  await validateSteamMachineAccountlessCorePlan(value, repositoryRoot);
  return value;
}

async function main() {
  const plan = await readSteamMachineAccountlessCorePlan();
  console.log(
    `Steam Machine accountless plan valid: ${plan.qualificationMatrix.requiredCellCount} cells, ${plan.qualificationMatrix.requiredCycleCount} cycles, ${plan.executionGate.blockerCodes.length} blockers.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
