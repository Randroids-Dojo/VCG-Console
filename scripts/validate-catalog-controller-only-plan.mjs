import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/catalog-controller-only/catalog-controller-only-qualification-plan-v1.json");
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const CATALOG_CONTROLLER_FORMAT = "vcg-catalog-controller-only-qualification-plan/v1";
export const CATALOG_CONTROLLER_GAME_IDS = Object.freeze([
  "vibebots", "vibe-pinball", "vibe-racer", "vibe-pins", "bone-cleaver",
  "vibeman-hangman", "asymptotic-bitrot", "fracking-asteroids", "hoops",
  "mi-casa-es-su-casa", "block-punch-kick", "epoch", "game-tape", "go-pit",
  "block-you", "determined", "software-dev-sim", "baby-piano", "clankers",
  "vibe-city", "flatline", "vibe-gear-2", "text-racer", "drop-dead-keep",
  "streamer-billboard", "go-dig",
]);
export const CATALOG_CONTROLLER_TARGETS = Object.freeze([
  "ordinary-x86-linux-premium",
  "pi5-hailo26-reference",
]);
export const CATALOG_CONTROLLER_ROLES = Object.freeze([
  "first-party-standard",
  "second-vendor-standard",
  "generic-ambiguous",
]);
export const CATALOG_CONTROLLER_TASKS = Object.freeze([
  "launch-from-controller-only-shell",
  "reach-usable-title-or-menu",
  "understand-correct-controls-and-glyphs",
  "start-ordinary-play",
  "perform-primary-gameplay-mechanics",
  "pause-and-resume",
  "retry-or-restart-after-declared-failure",
  "complete-required-text-entry-or-prove-none-required",
  "back-to-safe-title-or-launcher",
  "home-or-forced-exit-to-responsive-launcher",
]);
export const CATALOG_CONTROLLER_LIFECYCLE = Object.freeze([
  "controller-attached-before-cold-launch",
  "controller-hotplugged-after-game-load",
  "disconnect-during-navigation",
  "disconnect-while-gameplay-control-held",
  "same-device-reconnect",
  "different-device-replaces-same-slot",
  "controller-sleep-and-wake",
  "browser-focus-loss-and-return",
  "fullscreen-capture-and-global-recovery",
  "pointer-lock-capture-and-global-recovery",
  "network-loss-and-declared-recovery",
  "game-hang-crash-and-supervisor-return",
]);
export const CATALOG_REMOTE_SCENARIOS = Object.freeze([
  "launch-or-focus-safe-shell-control",
  "back-from-game-or-overlay",
  "home-from-ordinary-gameplay",
  "home-from-fullscreen-or-pointer-lock",
  "home-from-hung-or-crashed-game",
  "retry-exit-and-shutdown-recovery",
]);
export const CATALOG_TV_AUDIO_CHECKS = Object.freeze([
  "safe-area-and-critical-text",
  "correct-controller-glyphs-and-focus",
  "gameplay-action-visibility",
  "pause-retry-error-and-exit-comprehension",
  "expected-game-audio-and-no-unexpected-dropout",
  "launcher-audio-focus-and-volume-recovery",
]);
export const CATALOG_CONTROLLER_BLOCKERS = Object.freeze([
  "cco-001-exact-two-target-runtime-compositor-and-browser-tuples",
  "cco-002-qualified-controller-samples-mappings-and-glyph-policy",
  "cco-003-exact-recovery-remote-and-privileged-routing",
  "cco-004-per-game-control-ordinary-play-and-input-applicability-ledger",
  "cco-005-network-service-account-permission-and-text-entry-policy",
  "cco-006-tv-audio-safe-area-focus-and-capture-fixtures",
  "cco-007-fullscreen-pointer-lock-focus-hang-crash-and-recovery-oracles",
  "cco-008-physical-sample-participant-gameplay-timing-performance-audio-and-comprehension-gates",
  "cco-009-data-rights-privacy-consent-recording-deletion-and-incident-protocol",
  "cco-010-schedule-operators-independent-review-and-operation-authority",
  "cco-011-manifest-admission-permission-family-mode-and-publication-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "catalogContract",
  "authorityBoundary", "matrices", "measurements", "fixedAcceptance",
  "openAcceptance", "dataPolicy", "executionGate", "result",
];
const sourceDefinitions = [
  ["neutral-input-surface-observation", "compliance/game-input/remote-game-input-surface-observation-v2.json"],
  ["exact-catalog-candidate-ledger", "compliance/catalog-candidates/full-catalog-candidate-ledger-v2.json"],
  ["neutral-input-audit-boundary", "docs/REMOTE_GAME_INPUT_SURFACE_AUDIT_2026-07-24.md"],
  ["remote-input-owner-question-boundary", "docs/OWNER_QUESTIONS_REMOTE_GAME_INPUT_2026-07-24.md"],
  ["controller-routing-boundary", "docs/CONTROLLER_INPUT.md"],
  ["controller-mapping-boundary", "docs/CONTROLLER_MAPPING_CONTRACT.md"],
  ["controller-qualification-protocol", "docs/CONTROLLER_QUALIFICATION_PROTOCOL_2026-07-24.md"],
  ["controller-qualification-plan", "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json"],
  ["prototype-success-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["television-compatibility-boundary", "docs/TV_COMPATIBILITY_CONTRACT.md"],
  ["online-offline-service-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
];
const authorityKeys = [
  "ordinaryX86TargetRuntimeAndCompositorSha256", "pi5TargetRuntimeAndCompositorSha256",
  "supervisedBrowserAndLauncherBuildSha256", "controllerQualificationResultSha256",
  "exactControllerSampleSetAndMappingDatabaseSha256", "recoveryRemoteManifestAndMappingSha256",
  "compositorReservedActionEnforcementSha256", "perGameControlAndOrdinaryPlayScriptLedgerSha256",
  "perGameInputTextAuthNetworkAndPermissionApplicabilityLedgerSha256",
  "televisionAudioAndCaptureFixtureSha256", "networkServiceAndTestAccountProtocolSha256",
  "faultInjectionAndRecoveryOracleSha256", "dataHandlingRecordingAndDeletionProtocolSha256",
  "scheduleOperatorAndIndependentReviewProtocolSha256", "targetOperationAuthorized",
  "physicalControllerAndRemoteOperationAuthorized", "gameInteractionOrAccountUseAuthorized",
  "screenAudioOrRoomCollectionAuthorized", "catalogManifestPermissionOrFamilyModeMutationAuthorized",
  "qualificationOrPublicationAuthorized",
];
const openAcceptanceKeys = [
  "minimumIndependentPhysicalSamplesPerControllerRole", "minimumIndependentAdultParticipants",
  "minimumIndependentChildParticipants", "minimumOrdinaryGameplayDurationMsPerTrial",
  "minimumDistinctPrimaryMechanicsPerGame", "maximumControllerDetectionP95Ms",
  "maximumControllerToGameActionP95Us", "maximumReconnectP95Ms",
  "maximumReservedActionP95Ms", "maximumRecoveryToResponsiveLauncherP95Ms",
  "minimumGameFrameRateMilliHz", "maximumGameFrameTimeP95Us",
  "maximumAudioOutputLatencyUs", "maximumAudioDropoutDurationMs",
  "minimumTvAndControlComprehensionPpm", "minimumControllerTextEntryCharactersPerMinute",
  "maximumControllerTextEntryErrorRatePpm",
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be strict UTF-8`, { cause: error });
  }
  assert.ok(!text.startsWith("\uFEFF"), `${label} must not contain a UTF-8 BOM`);
  assert.ok(!/\r(?!\n)/u.test(text), `${label} contains a bare carriage return`);
  return text.replaceAll("\r\n", "\n");
}

function digest(bytes, label) {
  return createHash("sha256").update(Buffer.from(normalizedText(bytes, label), "utf8")).digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.equal(bindings.length, sourceDefinitions.length, "source binding count drifted");
  for (const [index, [role, path]] of sourceDefinitions.entries()) {
    const binding = bindings[index];
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], [role, path], `sourceBindings[${index}] identity drifted`);
    assert.match(binding.sha256, SHA256, `sourceBindings[${index}].sha256 is invalid`);
    assert.equal(isAbsolute(path), false, "source path must be relative");
    const absolute = resolve(repositoryRoot, path);
    assert.ok(!relative(repositoryRoot, absolute).startsWith(".."), "source path escaped repository");
    assert.equal(digest(await readFile(absolute), path), binding.sha256, `${path} digest drifted`);
  }
}

export async function validateCatalogControllerOnlyPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, CATALOG_CONTROLLER_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "catalog-controller-only-qualification-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-089"]);
  for (const phrase of [
    "Strict zero-result", "exact 26-entry catalog", "both required Linux tiers",
    "No physical controller", "Neutral browser Gamepad API signals", "cannot qualify",
  ]) assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.catalogContract, {
    catalogSnapshotDate: "2026-07-19",
    exactGameIds: [...CATALOG_CONTROLLER_GAME_IDS],
    expectedGameCount: 26,
    everyGameRequiresIndependentTargetControllerTaskAndRecoveryEvidence: true,
    neutralGamepadSignalListenerOrDomSurfaceMayEstablishSupport: false,
    loadedUrlMayEstablishReadinessPlayabilityOrControllerSupport: false,
    controllerCompatibilityMayGrantCatalogAdmissionRightsPermissionsOrOfflineSupport: false,
    oneGameControllerTargetOrBestCaseMayRescueAnother: false,
  });

  exactKeys(plan.authorityBoundary, authorityKeys, "authorityBoundary");
  for (const key of authorityKeys.slice(0, 14)) assert.equal(plan.authorityBoundary[key], null, `authorityBoundary.${key} must remain null`);
  for (const key of authorityKeys.slice(14)) assert.equal(plan.authorityBoundary[key], false, `authorityBoundary.${key} must remain false`);

  exactKeys(plan.matrices, [
    "requiredTargetIds", "controllerRoleIds", "controllerOnlyTaskIds", "lifecycleScenarioIds",
    "recoveryRemoteScenarioIds", "televisionAudioCheckIds", "validTrialsPerCell",
    "controllerTaskCellCount", "controllerTaskTrialCount", "lifecycleCellCount",
    "lifecycleCycleCount", "recoveryRemoteCellCount", "recoveryRemoteTrialCount",
    "televisionAudioCellCount", "televisionAudioTrialCount", "totalRequiredObservationCount",
    "everyGameTargetControllerTaskLifecycleRemoteAndTvAudioCellMustPass",
    "unsupportedGenericDeviceMustRemainVisibleRecoverableAndZeroAuthority",
    "gameControllerTargetTaskScenarioOrAggregateMayRescueFailure",
  ], "matrices");
  assert.deepEqual(plan.matrices.requiredTargetIds, [...CATALOG_CONTROLLER_TARGETS]);
  assert.deepEqual(plan.matrices.controllerRoleIds, [...CATALOG_CONTROLLER_ROLES]);
  assert.deepEqual(plan.matrices.controllerOnlyTaskIds, [...CATALOG_CONTROLLER_TASKS]);
  assert.deepEqual(plan.matrices.lifecycleScenarioIds, [...CATALOG_CONTROLLER_LIFECYCLE]);
  assert.deepEqual(plan.matrices.recoveryRemoteScenarioIds, [...CATALOG_REMOTE_SCENARIOS]);
  assert.deepEqual(plan.matrices.televisionAudioCheckIds, [...CATALOG_TV_AUDIO_CHECKS]);
  assert.equal(plan.matrices.validTrialsPerCell, 20);
  const games = CATALOG_CONTROLLER_GAME_IDS.length;
  const targets = CATALOG_CONTROLLER_TARGETS.length;
  const controllers = CATALOG_CONTROLLER_ROLES.length;
  const trials = plan.matrices.validTrialsPerCell;
  assert.equal(plan.matrices.controllerTaskCellCount, games * targets * controllers * CATALOG_CONTROLLER_TASKS.length);
  assert.equal(plan.matrices.controllerTaskTrialCount, plan.matrices.controllerTaskCellCount * trials);
  assert.equal(plan.matrices.lifecycleCellCount, games * targets * controllers * CATALOG_CONTROLLER_LIFECYCLE.length);
  assert.equal(plan.matrices.lifecycleCycleCount, plan.matrices.lifecycleCellCount * trials);
  assert.equal(plan.matrices.recoveryRemoteCellCount, games * targets * CATALOG_REMOTE_SCENARIOS.length);
  assert.equal(plan.matrices.recoveryRemoteTrialCount, plan.matrices.recoveryRemoteCellCount * trials);
  assert.equal(plan.matrices.televisionAudioCellCount, games * targets * CATALOG_TV_AUDIO_CHECKS.length);
  assert.equal(plan.matrices.televisionAudioTrialCount, plan.matrices.televisionAudioCellCount * trials);
  assert.equal(
    plan.matrices.totalRequiredObservationCount,
    plan.matrices.controllerTaskTrialCount + plan.matrices.lifecycleCycleCount
      + plan.matrices.recoveryRemoteTrialCount + plan.matrices.televisionAudioTrialCount,
  );
  assert.equal(plan.matrices.everyGameTargetControllerTaskLifecycleRemoteAndTvAudioCellMustPass, true);
  assert.equal(plan.matrices.unsupportedGenericDeviceMustRemainVisibleRecoverableAndZeroAuthority, true);
  assert.equal(plan.matrices.gameControllerTargetTaskScenarioOrAggregateMayRescueFailure, false);

  exactKeys(plan.measurements, [
    "requiredMetricIds", "independentControllerScreenAudioReservedActionAndRecoveryOraclesRequired",
    "ordinaryPlayScriptMustExerciseDeclaredPrimaryMechanics",
    "requiredInputUnavailableFeatureAuthOrServiceMustRemainVisible",
    "everyScheduledAttemptAndFailureMustRemainVisible",
    "syntheticSignalUrlLoadOrDomSurfaceMaySubstituteHandsOnEvidence",
    "keyboardMouseTouchOrDeveloperToolMayRescueControllerOnlyFailure",
    "laterGameTargetControllerOrRecoveryMayEraseEarlierFailure",
  ], "measurements");
  assert.equal(plan.measurements.requiredMetricIds.length, 14);
  for (const key of [
    "independentControllerScreenAudioReservedActionAndRecoveryOraclesRequired",
    "ordinaryPlayScriptMustExerciseDeclaredPrimaryMechanics",
    "requiredInputUnavailableFeatureAuthOrServiceMustRemainVisible",
    "everyScheduledAttemptAndFailureMustRemainVisible",
  ]) assert.equal(plan.measurements[key], true, `measurements.${key} drifted`);
  for (const key of [
    "syntheticSignalUrlLoadOrDomSurfaceMaySubstituteHandsOnEvidence",
    "keyboardMouseTouchOrDeveloperToolMayRescueControllerOnlyFailure",
    "laterGameTargetControllerOrRecoveryMayEraseEarlierFailure",
  ]) assert.equal(plan.measurements[key], false, `measurements.${key} drifted`);

  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidTrialsPerCell: 20,
    maximumRequiredKeyboardMouseOrTouchInterventionsInControllerFirstPath: 0,
    maximumUnmappedOrWrongRequiredGameplayActions: 0,
    maximumIncorrectControllerGlyphOrControlInstructions: 0,
    maximumStuckStaleDuplicateOrCrossEpochActions: 0,
    maximumReservedHomeBackOrPauseActionsDeliveredToGame: 0,
    maximumLostSuppressedOrUnrecoverableReservedActions: 0,
    maximumWrongSilentOrDurablePlayerAssignments: 0,
    maximumControllerOnlyTextEntryBlockages: 0,
    maximumUnrecoveredDisconnectFocusFullscreenPointerLockHangOrCrashEvents: 0,
    maximumRecoveryRemoteFailures: 0,
    maximumCriticalTvSafeAreaFocusTextOrActionVisibilityFailures: 0,
    maximumUnexpectedRequiredAudioAbsenceDropoutOrFocusFailures: 0,
    maximumCredentialTokenFormValuePersonalDataUrlQueryOrFreeTextDisclosures: 0,
    maximumSilentlyDiscardedFailedInvalidStoppedRetriedOrAdverseEvidence: 0,
    everyGameTargetControllerTaskScenarioAndTvAudioGateMustPass: true,
    aggregateSuccessMayRescueFailure: false,
    allOpenGatesMustBeFrozenBeforeOperation: true,
  });
  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const key of openAcceptanceKeys) assert.equal(plan.openAcceptance[key], null, `openAcceptance.${key} must remain null`);

  assert.deepEqual(plan.dataPolicy, {
    rawRoomPlayerControllerVideoAudioOrImagesAllowedInRepositoryReleaseOrResult: false,
    credentialsTokensCookiesStorageValuesFormValuesChatTextOrProfileDataAllowed: false,
    participantNamesFacesVoicesExactAgesStableDeviceIdentifiersPathsOrUrlsWithQueriesAllowed: false,
    arbitraryConsolePageNetworkOrProviderMessagesAllowed: false,
    freeTextResultEvidenceAllowed: false,
    opaqueGameTargetControllerTrialAndParticipantLabelsRequired: true,
    screenOrAudioCaptureRequiresSeparateRightsPrivacyConsentSecurityAndDeletionProtocol: true,
    closedReasonCodesCountsTimingsDigestsAndRedactedCategoriesRequired: true,
    failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
    networkEgressOutsideDeclaredGameServiceTrafficAllowed: false,
  });
  assert.deepEqual(plan.executionGate, { status: "blocked", blockerCodes: [...CATALOG_CONTROLLER_BLOCKERS] });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedControllerTaskTrialCount: 0,
    completedLifecycleCycleCount: 0,
    completedRecoveryRemoteTrialCount: 0,
    completedTelevisionAudioTrialCount: 0,
    compatibleGameIdsByTarget: [],
    blockedGameIdsByTarget: [],
    incompleteGameIdsByTarget: [],
    qualifiedControllerRoleIds: [],
    catalogAdmissionOrManifestPermissionsChanged: false,
    familyModeClaimPublished: false,
  });

  return {
    status: plan.status,
    sourceBindingCount: plan.sourceBindings.length,
    gameCount: plan.catalogContract.expectedGameCount,
    controllerTaskTrialCount: plan.matrices.controllerTaskTrialCount,
    lifecycleCycleCount: plan.matrices.lifecycleCycleCount,
    recoveryRemoteTrialCount: plan.matrices.recoveryRemoteTrialCount,
    televisionAudioTrialCount: plan.matrices.televisionAudioTrialCount,
    totalRequiredObservationCount: plan.matrices.totalRequiredObservationCount,
    openGateCount: openAcceptanceKeys.length,
  };
}

export async function loadCatalogControllerOnlyPlan(path = trackedPath) {
  const bytes = await readFile(path);
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES, `plan must contain 1 through ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error("plan must be valid JSON", { cause: error });
  }
  assert.equal(text, `${JSON.stringify(plan, null, 2)}\n`, "plan must be canonical two-space JSON with trailing LF");
  return plan;
}

export async function validateTrackedCatalogControllerOnlyPlan(path = trackedPath) {
  return validateCatalogControllerOnlyPlan(await loadCatalogControllerOnlyPlan(path), root);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await validateTrackedCatalogControllerOnlyPlan();
  console.log(
    `${trackedPath}: valid ${summary.status} ${summary.gameCount}-game, `
      + `${summary.totalRequiredObservationCount}-observation I-089 plan`,
  );
}
