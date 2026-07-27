import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/controller-only-usability/cross-tier-controller-only-usability-plan-v1.json",
);
const MAX_BYTES = 384 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const CONTROLLER_USABILITY_FORMAT =
  "vcg-cross-tier-controller-only-usability-plan/v1";

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "prerequisiteGate",
  "targetRoles", "runtimePaths", "participantRoles", "taskIds", "sessionMatrix",
  "recoveryScenarioIds", "recoveryMatrix", "measurements", "fixedAcceptance",
  "openAcceptance", "recordingAndIssuePolicy", "decisionProtocol",
  "authorityBoundary", "dataPolicy", "executionGate", "result",
];

const sourceDefinitions = [
  ["prototype-navigation-loading-recovery-and-controller-success-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["cross-tier-controller-qualification-protocol", "docs/CONTROLLER_QUALIFICATION_PROTOCOL_2026-07-24.md"],
  ["canonical-controller-mapping-and-ambiguity-boundary", "docs/CONTROLLER_MAPPING_CONTRACT.md"],
  ["controller-lifecycle-and-zero-keyboard-recovery-boundary", "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json"],
  ["cold-boot-launch-feedback-and-usable-input-timing-boundary", "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json"],
  ["unstealable-home-back-focus-and-forced-exit-boundary", "benchmarks/reserved-home/reserved-home-action-plan-v1.json"],
  ["physical-tv-controller-audio-video-and-shutdown-boundary", "benchmarks/tv-appliance/cross-tier-tv-appliance-plan-v1.json"],
  ["kiosk-focus-fullscreen-desktop-escape-and-recovery-boundary", "benchmarks/kiosk-compositor/cross-tier-kiosk-compositor-plan-v1.json"],
  ["physical-tv-visual-focus-comprehension-and-accessibility-boundary", "benchmarks/tv-visual-tokens/physical-tv-visual-token-plan-v1.json"],
  ["runtime-neutral-local-package-controller-and-lifecycle-boundary", "benchmarks/signed-local-package/runtime-neutral-signed-local-package-plan-v1.json"],
  ["supervised-hosted-browser-containment-and-exit-boundary", "docs/HOSTED_BROWSER_SUPERVISION.md"],
  ["shared-branded-loading-retry-details-and-exit-surface", "apps/console-lab/src/launcher/LaunchScreen.svelte"],
  ["deterministic-loading-fault-retry-and-recovery-state-machine", "apps/console-lab/src/launcher/launch-supervisor.ts"],
  ["current-launcher-navigation-runtime-adapter-and-power-surface", "apps/console-lab/src/launcher/Launcher.svelte"],
  ["shutdown-restart-power-loss-and-safe-return-boundary", "docs/POWER_RECOVERY_STATE_MACHINE.md"],
  ["runtime-trust-loading-retry-details-exit-and-no-desktop-boundary", "docs/GAME_TRUST_TIERS.md"],
  ["closed-four-runtime-manifest-and-input-contract", "packages/game-manifest/src/index.ts"],
];

export const CONTROLLER_USABILITY_TARGET_IDS = Object.freeze([
  "ordinary-x86-linux-required",
  "pi5-lower-cost-reference-required",
]);

export const CONTROLLER_USABILITY_RUNTIME_IDS = Object.freeze([
  "remote-web-supervised-top-level",
  "local-web-signed-package",
  "native-godot-signed-package",
  "libretro-supervised-local",
]);

export const CONTROLLER_USABILITY_PERSONA_IDS = Object.freeze([
  "school-age-child-blocking",
  "adult-blocking",
]);

export const CONTROLLER_USABILITY_TASK_IDS = Object.freeze([
  "apply-power-and-receive-immediate-branded-feedback",
  "controller-discovered-with-canonical-glyphs-and-no-manual-setup",
  "cold-boot-to-visible-focused-usable-home",
  "navigate-home-catalog-search-and-runtime-disclosure",
  "select-one-exact-game-and-start-launch",
  "understand-loading-waiting-progress-and-current-escape-action",
  "cancel-in-progress-launch-with-system-back",
  "relaunch-the-same-game-without-stale-state",
  "reach-visible-focused-interactive-gameplay",
  "perform-the-declared-controller-only-play-task",
  "open-system-owned-home-or-pause-surface-during-play",
  "resume-the-exact-game-with-focus-and-input-restored",
  "exit-the-game-through-universal-back-or-system-exit",
  "return-to-launcher-with-one-visible-valid-focus-target",
  "open-power-menu-without-keyboard-mouse-or-hidden-shell",
  "confirm-shutdown-and-observe-the-exact-physical-terminal-state",
]);

export const CONTROLLER_USABILITY_RECOVERY_IDS = Object.freeze([
  "slow-launch-with-truthful-progress-before-deadline",
  "absolute-launch-timeout-or-runtime-hang",
  "runtime-crash-or-unexpected-process-exit",
  "readiness-heartbeat-or-visible-focus-loss",
  "network-offline-or-required-resource-unavailable",
  "controller-disconnect-sleep-and-reconnect",
  "fullscreen-pointer-lock-focus-or-compositor-capture-attempt",
  "failed-retry-followed-by-safe-details-exit-and-clean-return",
]);

const metricIds = [
  "physical-power-application-feedback-boot-and-terminal-shutdown-state",
  "controller-discovery-mapping-glyph-transport-epoch-focus-and-action-recipient",
  "task-start-first-feedback-completion-abandonment-assistance-and-wrong-action",
  "loading-state-copy-progress-phase-timeout-details-retry-exit-and-comprehension",
  "visible-focused-usable-home-game-overlay-and-return-surface",
  "reserved-home-back-pause-resume-exit-delivery-revocation-and-game-nondelivery",
  "interactive-gameplay-input-audio-video-frame-and-state-continuity",
  "fault-injection-detection-classification-retry-exit-return-and-cleanup",
  "keyboard-mouse-shell-desktop-operator-hidden-setup-and-manual-mapping-use",
  "screen-recording-input-ledger-clock-issue-and-independent-observer-binding",
  "participant-comprehension-confidence-discomfort-stop-and-accessibility-category",
  "invalid-stopped-retried-assisted-adverse-and-pre-repair-failure-ledger",
];

const openKeys = [
  "minimumDistinctParticipantsPerPersonaClass",
  "maximumSessionsPerParticipantAndRequiredCounterbalancingPolicySha256",
  "maximumControllerDiscoveryAndUsableFocusP95Ms",
  "maximumTaskCompletionP95AndWorstMsByTaskPersonaAndRuntime",
  "minimumFirstAttemptTaskCompletionPpmByTaskPersonaAndRuntime",
  "minimumLoadingFaultAndRecoveryCopyComprehensionPpm",
  "maximumFaultDetectionClassificationDetailsAndRetryP95Ms",
  "maximumHomeBackPauseResumeExitAndShutdownP95Ms",
  "maximumControllerReconnectAndInputRestoreP95Ms",
  "maximumParticipantDiscomfortStopOrAccessibilityFailureEvents",
  "minimumPhysicalControllerSamplesPerMappingTransportAndTarget",
  "issueSeverityBlockingThresholdTriageAndClosurePolicySha256",
  "recordingReviewSamplingRetentionDeletionAndIndependentAuditPolicySha256",
  "decisionRankingExpiryRetestAndRegressionPolicySha256",
];

export const CONTROLLER_USABILITY_BLOCKERS = Object.freeze([
  "I155-001-exact-qualified-ordinary-x86-and-pi-target-runtime-tv-audio-power-network-manifests",
  "I155-002-complete-controller-reserved-home-back-kiosk-tv-and-visual-qualification-results",
  "I155-003-exact-supported-controller-samples-mappings-transports-glyphs-and-physical-inventory",
  "I155-004-exact-four-runtime-game-release-manifests-play-tasks-data-and-fault-dispositions",
  "I155-005-participant-cohort-counterbalancing-consent-assent-accessibility-safety-and-stop-protocol",
  "I155-006-complete-session-task-instruction-scoring-ground-truth-and-invalid-attempt-protocol",
  "I155-007-complete-fault-detection-details-retry-exit-return-cleanup-and-recovery-protocol",
  "I155-008-physical-power-input-recipient-focus-surface-process-network-tv-and-clock-oracles",
  "I155-009-frozen-cohort-controller-task-comprehension-timing-assistance-and-discomfort-gates",
  "I155-010-frozen-issue-severity-triage-closure-ranking-expiry-retest-and-regression-policy",
  "I155-011-screen-only-recording-input-ledger-metadata-retention-deletion-and-independent-review-policy",
  "I155-012-exact-session-and-recovery-schedule-environment-order-randomization-and-stop-rules",
  "I155-013-target-controller-tv-network-participant-fault-recording-and-diagnostic-operation-authority",
  "I155-014-product-guidance-compatibility-publication-and-input-promise-decision-boundary",
]);

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label} must not contain a UTF-8 BOM`);
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
    assert.ok(relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath));
    assert.equal(digest(await readFile(absolute), binding.path), binding.sha256, `${binding.path} digest drifted`);
  }
}

function validateTargets(targets) {
  assert.equal(targets.length, 2);
  assert.deepEqual(targets.map(({ targetId }) => targetId), CONTROLLER_USABILITY_TARGET_IDS);
  const roles = ["required-premium-reference", "required-lower-cost-reference"];
  for (const [index, target] of targets.entries()) {
    exactKeys(target, ["targetId", "comparisonRole", "exactHardwareFirmwareOsCompositorBrowserSdlAndRuntimeManifestSha256", "exactPhysicalTvAudioPowerControllerAndNetworkManifestSha256", "receivedInventoriedQualifiedAndAuthorized"], `targetRoles[${index}]`);
    assert.equal(target.comparisonRole, roles[index]);
    assert.equal(target.exactHardwareFirmwareOsCompositorBrowserSdlAndRuntimeManifestSha256, null);
    assert.equal(target.exactPhysicalTvAudioPowerControllerAndNetworkManifestSha256, null);
    assert.equal(target.receivedInventoriedQualifiedAndAuthorized, false);
  }
}

function validateRuntimePaths(paths) {
  assert.deepEqual(paths.map(({ runtimePathId }) => runtimePathId), CONTROLLER_USABILITY_RUNTIME_IDS);
  const classes = ["remote-web", "local-web", "native", "libretro"];
  const deadlines = [30000, 15000, 15000, 15000];
  const networks = ["network-required-with-truthful-offline-failure", "offline-required", "declared-by-exact-manifest", "offline-required"];
  for (const [index, path] of paths.entries()) {
    exactKeys(path, ["runtimePathId", "runtimeClass", "interactiveDeadlineMs", "networkExpectation", "exactGameReleaseManifestPolicyAndTargetResultSha256", "requiredOnEveryTarget"], `runtimePaths[${index}]`);
    assert.deepEqual([path.runtimeClass, path.interactiveDeadlineMs, path.networkExpectation], [classes[index], deadlines[index], networks[index]]);
    assert.equal(path.exactGameReleaseManifestPolicyAndTargetResultSha256, null);
    assert.equal(path.requiredOnEveryTarget, true);
  }
}

function validateParticipants(participants) {
  assert.deepEqual(participants.map(({ personaId }) => personaId), CONTROLLER_USABILITY_PERSONA_IDS);
  const roles = ["blocking-child-controller-usability", "blocking-adult-controller-usability"];
  for (const [index, participant] of participants.entries()) {
    exactKeys(participant, ["personaId", "role", "exactCohortRecruitmentConsentAssentAccessibilityAndSafetyManifestSha256", "participationAuthorized"], `participantRoles[${index}]`);
    assert.equal(participant.role, roles[index]);
    assert.equal(participant.exactCohortRecruitmentConsentAssentAccessibilityAndSafetyManifestSha256, null);
    assert.equal(participant.participationAuthorized, false);
  }
}

export async function validateControllerOnlyUsabilityPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, CONTROLLER_USABILITY_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-controller-only-usability-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26T23:59:59.000Z");
  assert.match(plan.qualificationScope, /I-155/u);
  assert.match(plan.claimBoundary, /No target, controller, participant/u);
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.prerequisiteGate, {
    completeRequiredTargetQualificationResultsSha256: null,
    completeControllerQualificationResultSha256: null,
    completeReservedHomeAndBackQualificationResultSha256: null,
    completePhysicalTvKioskAndVisualQualificationResultsSha256: null,
    exactRuntimeReleaseManifestAndPlayTaskSetSha256: null,
    exactControllerSamplesMappingsTransportsAndGlyphsSha256: null,
    exactParticipantRecruitmentConsentAssentAccessibilityAndSafetyProtocolSha256: null,
    exactSessionFaultRecordingIssueScoringAndStopProtocolSha256: null,
    browserDesktopSyntheticInputOrAutomatedFlowMayQualifyHumanControllerOnlyUsability: false,
    oneTargetRuntimePersonaFaultOrBestCaseMayOpenOrQualifyAnother: false,
    collectionOpened: false,
  });
  validateTargets(plan.targetRoles);
  validateRuntimePaths(plan.runtimePaths);
  validateParticipants(plan.participantRoles);
  assert.deepEqual(plan.taskIds, CONTROLLER_USABILITY_TASK_IDS);
  assert.deepEqual(plan.sessionMatrix, {
    targetIds: CONTROLLER_USABILITY_TARGET_IDS,
    runtimePathIds: CONTROLLER_USABILITY_RUNTIME_IDS,
    personaIds: CONTROLLER_USABILITY_PERSONA_IDS,
    taskCountPerSession: 16,
    requiredTargetRuntimePersonaCellCount: 16,
    validCompleteSessionsPerCell: 20,
    requiredCompleteSessionCount: 320,
    requiredTaskObservationCount: 5120,
    everySessionBeginsAtVerifiedColdOffAndEndsAtVerifiedShutdownState: true,
    sameFrozenTargetRuntimeControllerTaskInstructionsScoringAndOraclesRequired: true,
    failedInvalidStoppedRetriedAssistedAndPreRepairEvidenceMustRemainVisible: true,
    targetRuntimePersonaTaskSessionAverageOrBestCaseMayRescueFailure: false,
  });
  assert.deepEqual(plan.recoveryScenarioIds, CONTROLLER_USABILITY_RECOVERY_IDS);
  assert.deepEqual(plan.recoveryMatrix, {
    targetCount: 2, runtimePathCount: 4, personaCount: 2, scenarioCount: 8,
    requiredTargetRuntimePersonaScenarioCellCount: 128,
    validRecoveryCyclesPerCell: 20,
    requiredRecoveryCycleCount: 2560,
    everyCycleRequiresIndependentFaultDetectionStateCopyFocusInputRetryExitAndReturnOracles: true,
    successfulRetryMayNotHideFailedRetryDetailsExitOrPreRepairEvidence: true,
    anotherFaultRuntimeTargetPersonaOrNormalSessionMayRescueFailure: false,
  });
  assert.deepEqual(plan.measurements, {
    requiredMetricIds: metricIds,
    independentPhysicalPowerInputRecipientFocusSurfaceProcessNetworkAndClockOraclesRequired: true,
    screenCopyFirstPixelsProcessStartHeartbeatOrSelfReportMayEstablishUsableInteraction: false,
    sessionRecordingMaySelfEstablishPhysicalInputRecipientPowerOrAbsenceOfKeyboardMouse: false,
    everyAttemptIssueAssistanceWrongActionFailureRetryAndStopMustRemainVisible: true,
  });
  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidCompleteSessionsPerTargetRuntimePersonaCell: 20,
    minimumValidRecoveryCyclesPerTargetRuntimePersonaScenarioCell: 20,
    maximumMissingRequiredSessionTaskOrRecoveryCells: 0,
    maximumFailedRequiredSessionsOrRecoveryCycles: 0,
    maximumKeyboardMouseShellDesktopOperatorOrHiddenSetupRecoveries: 0,
    maximumManualMappingEventsForSupportedStandardsConformantControllers: 0,
    maximumMissedDuplicatedStuckWrongRecipientOrWrongMappedControllerActions: 0,
    maximumHomeBackPauseResumeOrExitEventsDeliveredToGame: 0,
    maximumFocusTrapsDesktopExposureBlankDeadEndsOrUnboundedWaits: 0,
    maximumUnpromptedWrongActionGuessOrAssistanceEvents: 0,
    maximumFalseReadyRecoveredInteractiveShutdownOrSuccessClaims: 0,
    maximumUnintendedPrivilegedBackHomePauseResumeExitOrShutdownActions: 0,
    maximumVisibleFeedbackMs: 250,
    maximumColdBootToControllerUsableHomeMs: 60000,
    maximumLocalGameLaunchToInteractiveMs: 15000,
    maximumHostedLaunchToInteractiveOrTruthfulPhaseMs: 30000,
    interactiveMeansVisibleFocusedAndResponsiveToTheIntendedController: true,
    firstPixelsProcessStartHeartbeatOrTruthfulHostedPhaseMayEstablishPlayability: false,
    systemMustOwnHomeBackPauseRetryExitAndShutdownOutsideGameAuthority: true,
    allOpenCohortTaskFaultTimingComprehensionAndIssueGatesFrozenBeforeCollection: true,
    targetRuntimePersonaFaultTaskAverageOrBestCaseMayRescueFailure: false,
  });
  exactKeys(plan.openAcceptance, openKeys, "openAcceptance");
  for (const key of openKeys) assert.equal(plan.openAcceptance[key], null, `openAcceptance.${key} must remain open`);
  assert.deepEqual(plan.recordingAndIssuePolicy, {
    exactScreenOnlyRecordingInputLedgerClockAndObserverProtocolSha256: null,
    exactClosedIssueTaxonomySeverityDispositionAndEvidenceSchemaSha256: null,
    screenOnlyRecordingRequiredForEveryValidSessionAndRecoveryCycle: true,
    recordingMustExcludeRoomFacesBodiesVoicesCameraAndHouseholdIdentity: true,
    recordingMetadataMustBeRemovedAndPublishedArtifactMayBeDigestOnly: true,
    issueRecordsRequireClosedCodesCountsTimingsCellIdentityAndEvidenceDigests: true,
    participantOrOperatorFreeTextIssueNarrativesAllowed: false,
    issuesFailuresStopsRetriesAssistanceAndWrongActionsMayBeDeletedOrHidden: false,
  });
  assert.deepEqual(plan.decisionProtocol, {
    completeOrdinaryX86ResultSha256: null,
    completePi5ResultSha256: null,
    completeCrossTierIndependentReviewSha256: null,
    controllerOnlyUsabilityDisposition: null,
    productGuidanceOrCompatibilityMutation: null,
    oneTargetRuntimePersonaOrAggregatePassAutomaticallyQualifiesAnother: false,
    completeTechnicalPassAutomaticallyChangesProductSupportOrInputPromise: false,
    selectionRequiresEveryRequiredCellPassingAndSeparateOwnerReview: true,
  });
  assert.deepEqual(plan.authorityBoundary, {
    exactTargetRuntimeControllerTvPowerNetworkAndFaultManifestSha256: null,
    exactParticipantSessionTaskScoringSafetyConsentAndStopProtocolSha256: null,
    exactRecordingIssueRetentionIncidentAndIndependentReviewProtocolSha256: null,
    targetPowerControllerTvAudioNetworkRuntimeOrGameOperationAuthorized: false,
    participantAdultChildRecruitmentConsentAssentOrCollectionAuthorized: false,
    controllerPurchaseLoanPairingMappingOrPersistenceMutationAuthorized: false,
    networkProcessFullscreenFocusCrashHangOrPowerFaultAuthorized: false,
    screenInputIssueDiagnosticOrHumanFactorsRecordingAuthorized: false,
    productQualificationCompatibilityPublicationOrPolicyMutationAuthorized: false,
  });
  assert.deepEqual(plan.dataPolicy, {
    opaqueTargetRuntimePersonaParticipantSessionTaskScenarioCycleIssueAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsCategoriesAndDispositionCodesRequired: true,
    rawRoomFacesBodiesVoicesCameraFramesAudioOrHouseholdMediaAllowed: false,
    participantNamesExactAgesAddressesDiagnosesProfilesSavesOrStableIdentifiersAllowed: false,
    rawControllerHidUsbBluetoothPayloadSerialMacOrStableDeviceIdentifiersAllowed: false,
    credentialsTokensCookiesStorageValuesUrlsPathsEnvironmentOrEnteredTextAllowed: false,
    freeTextParticipantOperatorGameDriverCompositorServiceCrashOrIssueLogsAllowed: false,
    failedInvalidStoppedRetriedAssistedAdverseAndPreRepairEvidenceMustRemainVisible: true,
  });
  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, CONTROLLER_USABILITY_BLOCKERS);
  assert.equal(plan.result, null);
  return plan;
}

export async function parseControllerOnlyUsabilityPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "controller-only usability plan");
  const plan = JSON.parse(text);
  assert.equal(text, `${JSON.stringify(plan, null, 2)}\n`, "plan must be canonical two-space JSON with one trailing newline");
  return validateControllerOnlyUsabilityPlan(plan, repositoryRoot);
}

export async function readControllerOnlyUsabilityPlan(path = trackedPath) {
  return parseControllerOnlyUsabilityPlanBytes(await readFile(path), root);
}

async function main() {
  const plan = await readControllerOnlyUsabilityPlan();
  console.log(`Controller-only usability plan valid: ${plan.sessionMatrix.requiredCompleteSessionCount} sessions, ${plan.sessionMatrix.requiredTaskObservationCount} task observations, ${plan.recoveryMatrix.requiredRecoveryCycleCount} recovery cycles, ${plan.executionGate.blockerCodes.length} blockers.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
