import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/four-player/four-player-qualification-plan-v1.json");
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const FOUR_PLAYER_FORMAT = "vcg-four-player-qualification-plan/v1";
export const FOUR_PLAYER_ROSTER_CLASSES = Object.freeze([
  "p1-child-p2-child-p3-child-p4-child",
  "p1-child-p2-child-p3-child-p4-adult",
  "p1-child-p2-child-p3-adult-p4-child",
  "p1-child-p2-child-p3-adult-p4-adult",
  "p1-child-p2-adult-p3-child-p4-child",
  "p1-child-p2-adult-p3-child-p4-adult",
  "p1-child-p2-adult-p3-adult-p4-child",
  "p1-child-p2-adult-p3-adult-p4-adult",
  "p1-adult-p2-child-p3-child-p4-child",
  "p1-adult-p2-child-p3-child-p4-adult",
  "p1-adult-p2-child-p3-adult-p4-child",
  "p1-adult-p2-child-p3-adult-p4-adult",
  "p1-adult-p2-adult-p3-child-p4-child",
  "p1-adult-p2-adult-p3-child-p4-adult",
  "p1-adult-p2-adult-p3-adult-p4-child",
  "p1-adult-p2-adult-p3-adult-p4-adult",
]);
export const FOUR_PLAYER_PLACEMENTS = Object.freeze([
  "two-by-two-grid",
  "shallow-wide-arc",
  "deep-staggered-diamond",
  "four-lateral-lanes",
  "paired-near-far-lanes",
  "four-corners-with-measured-center-clearance",
]);
export const FOUR_PLAYER_IDENTITY_SCENARIOS = Object.freeze([
  "four-player-static",
  "p1-p2-lateral-swap-p3-p4-static",
  "p3-p4-lateral-swap-p1-p2-static",
  "p1-p3-depth-swap-p2-p4-static",
  "p2-p4-depth-swap-p1-p3-static",
  "two-pairs-simultaneous-cross",
  "four-way-center-crossing",
  "rotating-position-cycle-clockwise",
  "rotating-position-cycle-counterclockwise",
  "p1-front-occludes-p2",
  "p2-front-occludes-p3",
  "p3-front-occludes-p4",
  "p4-front-occludes-p1",
  "two-simultaneous-pair-occlusions",
  "synchronized-same-motion-all",
  "split-pair-opposing-motion",
  "p1-exit-and-reenter",
  "p2-exit-and-reenter",
  "p3-exit-and-reenter",
  "p4-exit-and-reenter",
  "p1-p2-exit-and-reenter",
  "p3-p4-exit-and-reenter",
]);
export const FOUR_PLAYER_ACTION_SCENARIOS = Object.freeze([
  "p1-dodge-left", "p1-dodge-right", "p1-duck", "p1-jump",
  "p2-dodge-left", "p2-dodge-right", "p2-duck", "p2-jump",
  "p3-dodge-left", "p3-dodge-right", "p3-duck", "p3-jump",
  "p4-dodge-left", "p4-dodge-right", "p4-duck", "p4-jump",
  "all-jump", "all-duck",
  "p1-p3-jump-p2-p4-duck", "p1-p3-duck-p2-p4-jump",
  "p1-p2-dodge-left-p3-p4-dodge-right",
  "p1-p2-dodge-right-p3-p4-dodge-left",
  "four-distinct-actions-permutation-a", "four-distinct-actions-permutation-b",
]);
export const FOUR_PLAYER_SESSION_SCENARIOS = Object.freeze([
  "sequential-join-p1-through-p4",
  "simultaneous-join-attempt-remains-sequential",
  "independent-calibration-p1", "independent-calibration-p2",
  "independent-calibration-p3", "independent-calibration-p4",
  "launcher-initial-p1-owner",
  "p1-pause-owns-overlay", "p2-pause-owns-overlay",
  "p3-pause-owns-overlay", "p4-pause-owns-overlay",
  "same-update-four-way-pause-lower-slot-wins",
  "earlier-p4-pause-completion-wins",
  "overlay-nonowner-input-blocked",
  "pause-exit-transfers-launcher-owner",
  "p1-loss-freezes-entire-game", "p2-loss-freezes-entire-game",
  "p3-loss-freezes-entire-game", "p4-loss-freezes-entire-game",
  "any-two-loss-freezes-entire-game", "all-loss-freezes-entire-game",
  "all-original-tracks-silent-reacquire",
  "partial-roster-cannot-auto-resume",
  "wrong-track-cannot-silent-reacquire",
  "expired-reacquisition-opens-recovery",
  "full-roster-deliberate-resume",
  "explicit-four-to-three-roster-reduction",
  "explicit-four-to-two-roster-reduction",
  "p1-leave-and-fresh-reentry", "p2-leave-and-fresh-reentry",
  "p3-leave-and-fresh-reentry", "p4-leave-and-fresh-reentry",
  "tracker-restart-hard-freeze", "camera-disconnect-hard-freeze",
  "tracker-overload-hard-freeze", "time-regression-fails-closed",
]);
export const FOUR_PLAYER_ACCESSIBLE_TASKS = Object.freeze([
  "identify-own-number-pattern-shape-outline",
  "identify-each-other-player-without-color-alone",
  "join-as-player-one", "join-as-player-two", "join-as-player-three", "join-as-player-four",
  "identify-current-launcher-owner", "identify-current-pause-overlay-owner",
  "understand-whole-game-freeze-and-wait-state",
  "recover-the-exact-original-four-player-roster",
  "choose-explicit-roster-reduction-or-exit",
  "use-independent-controller-recovery",
]);
export const FOUR_PLAYER_SAFETY_SCENARIOS = Object.freeze([
  "static-minimum-separation",
  "simultaneous-lateral-dodges",
  "simultaneous-forward-back-movement",
  "two-pair-crossing-with-center-clearance",
  "four-way-center-approach-stop-before-contact",
  "simultaneous-jump-clearance", "simultaneous-duck-clearance",
  "player-exit-through-safe-lane", "player-entry-through-safe-lane",
  "furniture-egress-and-cable-boundary",
  "operator-emergency-stop", "controller-rescuer-emergency-exit",
]);
export const FOUR_PLAYER_BLOCKERS = Object.freeze([
  "complete-two-player-result-all-required-cell-closure-and-explicit-four-player-activation",
  "selected-four-player-target-build-camera-capture-calibration-and-tracker",
  "implemented-four-player-sequential-join-identity-menu-freeze-recovery-and-roster-semantics",
  "measured-larger-room-safe-four-player-zone-placement-fixtures-egress-and-stop-boundary",
  "ordered-child-adult-participant-quartets-consent-assent-comprehension-and-safety",
  "independent-four-player-identity-action-freeze-menu-collision-and-clock-oracles",
  "accessible-number-pattern-shape-outline-instruction-owner-and-recovery-protocol",
  "console-shell-and-obstacle-four-player-runtime-freeze-state-integrity-adapters",
  "participant-identity-performance-resource-thermal-power-safety-and-recovery-gates",
  "data-handling-retention-deletion-audit-schedule-instruments-and-operators",
  "room-participant-camera-runtime-fault-and-collection-authority",
  "retest-expiry-milestone-product-scope-and-publication-decision",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "prerequisiteGate",
  "authorityBoundary", "apiAndImplementationBoundary", "identityAndSessionBoundary",
  "matrices", "measurements", "acceptance", "dataPolicy", "decisionProtocol",
  "executionGate", "result",
];
const sourceDefinitions = [
  ["multiplayer-decision-boundary", "docs/DECISIONS.md"],
  ["implemented-session-semantics-boundary", "docs/PLAYER_SESSION_STATE_MACHINE.md"],
  ["blocking-persona-boundary", "docs/PLAYER_PERSONAS.md"],
  ["prototype-success-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["one-two-player-room-boundary", "docs/LIVING_ROOM_PLAY_ZONE_SURVEY_PLAN_2026-07-25.md"],
  ["complete-two-player-prerequisite-plan", "benchmarks/two-player/two-player-qualification-plan-v1.json"],
  ["motion-api-shape-boundary", "packages/motion-contract/src/schema.ts"],
  ["synthetic-identity-evidence-boundary", "benchmarks/identity-tracking/windows-x64-synthetic-appearance-free-v1.json"],
  ["synthetic-session-interference-boundary", "benchmarks/player-session-interference/camera-free-authority-rehearsal-v1.json"],
  ["session-controller-implementation-boundary", "apps/console-lab/src/player-session.ts"],
  ["one-player-lab-configuration-boundary", "apps/console-lab/src/main.ts"],
];
const openAcceptanceKeys = [
  "minimumParticipantQuartetsPerOrderedClass", "minimumPerPlayerPoseFpsMilliHz",
  "minimumPerPlayerCore17CoveragePpm", "maximumPerPlayerJitterMilliTorso",
  "maximumIdentityFragmentationsPerTrial", "maximumSequentialJoinAndCalibrationMs",
  "minimumAccessibleIdentityComprehensionPpm", "maximumOrdinaryLossConfirmationUs",
  "maximumRecoveryOverlayReadyUs", "pauseOwnershipLockoutMs",
  "minimumInterPlayerClearanceMm", "minimumFourPlayerZoneWidthMm",
  "minimumFourPlayerZoneDepthMm", "maximumCpuUtilizationPpm",
  "maximumGpuUtilizationPpm", "maximumResidentMemoryBytes", "maximumWallPowerMw",
  "maximumTemperatureMilliC", "minimumGameFrameRateMilliHz",
  "maximumGameFrameTimeP95Us", "maximumCameraDropRatePpm",
  "maximumTrackerOverloadRecoveryUs",
];
const fixedAcceptance = {
  maximumIdentitySwitches: 0,
  maximumFalseControlTransfers: 0,
  maximumCrossPlayerActionAttributions: 0,
  maximumUnintendedPrivilegedActions: 0,
  maximumMissedGlobalFreezes: 0,
  maximumStateAdvancesDuringFreeze: 0,
  maximumIncorrectMenuOwnershipEvents: 0,
  maximumWrongTrackSilentReacquisitions: 0,
  maximumAutomaticPartialRosterResumes: 0,
  maximumPlayerCollisionOrContactEvents: 0,
  maximumUnsafeZoneOrEgressViolations: 0,
  maximumEmergencyStopFailures: 0,
  maximumInvalidAttemptsPerCell: 0,
  minimumPerPlayerTriggerPrecisionPpm: 950000,
  minimumPerPlayerTriggerRecallPpm: 900000,
  maximumExposureToCorrectPlayerGameApiP95Us: 120000,
};

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label} must not contain a BOM`);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be strict UTF-8`, { cause: error });
  }
  const normalized = text.replaceAll("\r\n", "\n");
  assert.ok(!normalized.includes("\r"), `${label} must not contain a bare carriage return`);
  return normalized;
}

function resolveRepositoryPath(repositoryRoot, path) {
  assert.equal(isAbsolute(path), false, "source path must be repository-relative");
  assert.match(path, /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/u, "source path contains unsafe characters");
  const absolute = resolve(repositoryRoot, path);
  assert.ok(!relative(repositoryRoot, absolute).startsWith(".."), "source path escapes repository");
  return absolute;
}

async function normalizedDigest(repositoryRoot, path) {
  const text = normalizedText(await readFile(resolveRepositoryPath(repositoryRoot, path)), `source ${path}`);
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

export async function validateFourPlayerQualificationPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, FOUR_PLAYER_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "four-player-qualification-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-055", "D-015", "D-031", "D-071", "D-103"]);
  assert.ok(plan.claimBoundary.length >= 1900, "claim boundary is incomplete");
  for (const phrase of [
    "requires the two-player milestone to pass",
    "cannot open the campaign",
    "current console lab remains configured for one player",
    "separate owner decision",
  ]) assert.ok(plan.claimBoundary.includes(phrase), `claim boundary must include: ${phrase}`);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );

  assert.equal(plan.sourceBindings.length, sourceDefinitions.length, "source binding count drifted");
  for (const [index, [role, path]] of sourceDefinitions.entries()) {
    const binding = plan.sourceBindings[index];
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], [role, path], `sourceBindings[${index}] identity drifted`);
    assert.match(binding.sha256, SHA256);
    assert.equal(binding.sha256, await normalizedDigest(repositoryRoot, path), `${path} digest drifted`);
  }

  exactKeys(plan.prerequisiteGate, [
    "completeTwoPlayerResultSha256", "twoPlayerQualifiedTargetConfigurationSha256",
    "twoPlayerQualifiedCameraAndCapturePolicySha256", "twoPlayerQualifiedRoomAndPlayZoneSha256",
    "twoPlayerQualifiedTrackerAndSessionConfigurationSha256", "everyRequiredTwoPlayerCellPassed",
    "fourPlayerMilestoneExplicitlyActivated",
    "twoPlayerResultMayBeReplacedByOnePlayerSyntheticAggregateOrVendorEvidence",
    "fourPlayerCollectionMayBeginBeforePrerequisiteClosure",
  ], "prerequisiteGate");
  for (const key of Object.keys(plan.prerequisiteGate).slice(0, 5)) {
    assert.equal(plan.prerequisiteGate[key], null, `prerequisiteGate.${key} must remain null`);
  }
  for (const key of Object.keys(plan.prerequisiteGate).slice(5)) {
    assert.equal(plan.prerequisiteGate[key], false, `prerequisiteGate.${key} must remain false`);
  }

  const authorityKeys = [
    "selectedFourPlayerTargetConfigurationSha256", "cleanBuildAndRuntimeTupleSha256",
    "selectedFourPersonTrackerConfigurationSha256", "cameraCaptureCalibrationAndTimestampProtocolSha256",
    "measuredLargerRoomAndFourPlayerZoneResultSha256", "orderedParticipantQuartetCohortProtocolSha256",
    "consentAssentComprehensionAndSafetyProtocolSha256",
    "independentIdentityActionFreezeMenuAndSafetyOracleSha256",
    "accessibleFourPlayerIdentityAndInstructionProtocolSha256",
    "fourPlayerJoinRecoveryAndRuntimeFreezeAdapterSha256",
    "resourceThermalPowerAndClockProtocolSha256",
    "dataHandlingRetentionDeletionAndAuditProtocolSha256",
    "scheduleInstrumentOperatorAndStopProtocolSha256", "roomAccessAuthorized",
    "adultParticipationAuthorized", "childParticipationAuthorized", "cameraCollectionAuthorized",
    "runtimeMutationAuthorized", "purchaseAuthorized", "publicationAuthorized",
    "fourPlayerProductClaimAuthorized",
  ];
  exactKeys(plan.authorityBoundary, authorityKeys, "authorityBoundary");
  for (const key of authorityKeys.slice(0, 13)) {
    assert.equal(plan.authorityBoundary[key], null, `authorityBoundary.${key} must remain null`);
  }
  for (const key of authorityKeys.slice(13)) {
    assert.equal(plan.authorityBoundary[key], false, `authorityBoundary.${key} must remain false`);
  }

  assert.deepEqual(plan.apiAndImplementationBoundary, {
    motionApiSchemaVersion: "0.4.0",
    apiTargetPlayerCount: 4,
    apiMaxPlayersDeclarationMayQualifyFourPlayerProduct: false,
    currentConsoleLabConfiguredPlayerCount: 1,
    currentValidatedSessionStateMachineMaximumPlayers: 2,
    fourPlayerJoinCalibrationOwnershipRecoverySemanticsImplemented: false,
    syntheticTwoOrThreePersonIdentityEvidenceMayQualifyFourPlayers: false,
    providerAdapterOrVendorMaximumMayQualifyFourPlayers: false,
    oneOrTwoPlayerResultsMayBeRelabeledAsFourPlayerEvidence: false,
  });
  assert.deepEqual(plan.identityAndSessionBoundary, {
    trackerIdsAreOpaqueSessionLocalContinuityEvidence: true,
    trackerIdsMayIdentifyAuthenticateOrReassociateProfiles: false,
    playersJoinSequentiallyFromOneThroughFour: true,
    eachPlayerCalibrationIsIndependent: true,
    numberPatternShapeAndColorAreRequiredTogether: true,
    colorAloneMayDistinguishPlayers: false,
    allFourOriginalPlayersMustBeVisibleForAutomaticPlay: true,
    confirmedLossOfAnyJoinedPlayerFreezesTheEntireGame: true,
    silentReacquisitionRequiresEveryExactOriginalTrack: true,
    wrongPartialOrSubstituteRosterMayAutoResume: false,
    anyJoinedPlayerMayInvokePauseWithDeterministicOwnership: true,
    sameUpdatePauseTieUsesLowerSlotAfterEarlierCompletion: true,
    launcherStartsWithPlayerOneAndTransfersToPauseInitiator: true,
    expiredRecoveryRequiresFullRosterConfirmationReductionOrExit: true,
    automaticBodyFaceOrProfileIdentityMatchingIsOutsideCampaignAuthority: true,
    independentFourPlayerGroundTruthIsRequired: true,
    identityOrSessionFailureMayBeHiddenByActionSafetyOrAggregateSuccess: false,
  });

  exactKeys(plan.matrices, [
    "targetPolicy", "orderedRosterPersonaClasses", "placementQuartetIds",
    "identityScenarioIds", "independentActionScenarioIds", "sessionScenarioIds",
    "accessibleIdentityTaskIds", "roomSafetyScenarioIds", "requiredRuntimeSurfaces",
    "validTrialsPerCell", "identityCellCount", "identityTrialCount", "actionCellCount",
    "actionTrialCount", "sessionCellCount", "sessionCycleCount",
    "accessibleIdentityCellCount", "accessibleIdentityTrialCount", "roomSafetyCellCount",
    "roomSafetyTrialCount", "runtimeSoakCellCount", "runtimeSoakDurationMs",
    "runtimeSoakCount", "everyRosterPlacementScenarioRuntimeAndSafetyCellMustPass",
    "rosterPlacementScenarioRuntimeTargetOrBestCaseAggregateMayRescueFailure",
  ], "matrices");
  assert.deepEqual(plan.matrices.targetPolicy, {
    requiredTargetCount: 1,
    targetRole: "explicitly-activated-four-player-candidate-on-the-qualified-product-contract",
    substituteTargetMayRescueFailure: false,
  });
  assert.deepEqual(plan.matrices.orderedRosterPersonaClasses, [...FOUR_PLAYER_ROSTER_CLASSES]);
  assert.deepEqual(plan.matrices.placementQuartetIds, [...FOUR_PLAYER_PLACEMENTS]);
  assert.deepEqual(plan.matrices.identityScenarioIds, [...FOUR_PLAYER_IDENTITY_SCENARIOS]);
  assert.deepEqual(plan.matrices.independentActionScenarioIds, [...FOUR_PLAYER_ACTION_SCENARIOS]);
  assert.deepEqual(plan.matrices.sessionScenarioIds, [...FOUR_PLAYER_SESSION_SCENARIOS]);
  assert.deepEqual(plan.matrices.accessibleIdentityTaskIds, [...FOUR_PLAYER_ACCESSIBLE_TASKS]);
  assert.deepEqual(plan.matrices.roomSafetyScenarioIds, [...FOUR_PLAYER_SAFETY_SCENARIOS]);
  assert.deepEqual(plan.matrices.requiredRuntimeSurfaces, ["console-shell", "obstacle-sample"]);
  assert.equal(new Set(plan.matrices.orderedRosterPersonaClasses).size, 16);
  assert.equal(plan.matrices.validTrialsPerCell, 20);
  const rosterCount = FOUR_PLAYER_ROSTER_CLASSES.length;
  const placementCount = FOUR_PLAYER_PLACEMENTS.length;
  const runtimeCount = 2;
  assert.equal(plan.matrices.identityCellCount, rosterCount * placementCount * FOUR_PLAYER_IDENTITY_SCENARIOS.length * runtimeCount);
  assert.equal(plan.matrices.identityTrialCount, plan.matrices.identityCellCount * 20);
  assert.equal(plan.matrices.actionCellCount, rosterCount * placementCount * FOUR_PLAYER_ACTION_SCENARIOS.length * runtimeCount);
  assert.equal(plan.matrices.actionTrialCount, plan.matrices.actionCellCount * 20);
  assert.equal(plan.matrices.sessionCellCount, rosterCount * FOUR_PLAYER_SESSION_SCENARIOS.length * runtimeCount);
  assert.equal(plan.matrices.sessionCycleCount, plan.matrices.sessionCellCount * 20);
  assert.equal(plan.matrices.accessibleIdentityCellCount, rosterCount * FOUR_PLAYER_ACCESSIBLE_TASKS.length * runtimeCount);
  assert.equal(plan.matrices.accessibleIdentityTrialCount, plan.matrices.accessibleIdentityCellCount * 20);
  assert.equal(plan.matrices.roomSafetyCellCount, rosterCount * placementCount * FOUR_PLAYER_SAFETY_SCENARIOS.length);
  assert.equal(plan.matrices.roomSafetyTrialCount, plan.matrices.roomSafetyCellCount * 20);
  assert.equal(plan.matrices.runtimeSoakCellCount, rosterCount * placementCount * runtimeCount);
  assert.equal(plan.matrices.runtimeSoakDurationMs, 3_600_000);
  assert.equal(plan.matrices.runtimeSoakCount, plan.matrices.runtimeSoakCellCount);
  assert.equal(plan.matrices.everyRosterPlacementScenarioRuntimeAndSafetyCellMustPass, true);
  assert.equal(plan.matrices.rosterPlacementScenarioRuntimeTargetOrBestCaseAggregateMayRescueFailure, false);

  exactKeys(plan.measurements, [
    "requiredMetrics", "independentPerPlayerAndSafetyGroundTruthRequired",
    "exactActionOwnerRequiredForEveryEvent", "exactMenuOwnerRequiredForEveryShellAction",
    "runtimeStateDigestRequiredBeforeFreezeDuringFreezeAndAfterResume",
    "everyScheduledAttemptFailureInvalidationInterventionAndStopRemainsVisible",
    "sameExposureClockRequiredForFourPlayerLatency",
    "captureArrivalOrInferenceCompletionMayQualifyExposureLatency",
    "selfReportedOrTrackerInferredIdentitySafetyOrCollisionTruthAllowed",
    "syntheticOneTwoOrThreePlayerEvidenceMaySubstituteFourPlayerTrials",
    "oneOrTwoPlayerResultMayRescueFourPlayerFailure",
    "resourceAverageMayHidePerCellOverloadThermalOrFramePacingFailure",
  ], "measurements");
  assert.deepEqual(plan.measurements.requiredMetrics, [
    "per-player-pose-fps-core17-coverage-jitter-and-missingness",
    "four-player-identity-switch-fragmentation-false-transfer-and-missed-player-counts",
    "per-player-action-trigger-precision-recall-and-cross-player-attribution",
    "unintended-privileged-action-count",
    "exposure-to-correct-player-game-api-p50-p95-p99-worst",
    "sequential-four-player-join-and-independent-calibration-time",
    "outline-owner-freeze-and-recovery-comprehension",
    "loss-confirmation-global-freeze-and-exact-roster-recovery-time",
    "simulation-timer-hazard-score-and-action-advance-during-freeze",
    "launcher-pause-recovery-owner-and-pause-race-correctness",
    "minimum-inter-player-fixture-hazard-egress-and-collision-clearance",
    "emergency-stop-controller-rescue-and-operator-stop-correctness",
    "camera-drops-buffering-timestamp-quality-and-tracker-overload-recovery",
    "cpu-gpu-memory-wall-power-temperature-game-fps-and-frame-pacing",
    "tracker-camera-clock-process-and-runtime-fault-recovery",
  ]);
  for (const key of Object.keys(plan.measurements).slice(1, 7)) {
    assert.equal(plan.measurements[key], true, `measurements.${key} drifted`);
  }
  for (const key of Object.keys(plan.measurements).slice(7)) {
    assert.equal(plan.measurements[key], false, `measurements.${key} drifted`);
  }

  exactKeys(plan.acceptance, [
    ...Object.keys(fixedAcceptance), ...openAcceptanceKeys,
    "allZeroToleranceAndNumericGatesApplyPerRosterPlacementScenarioRuntimeAndSafetyCell",
    "aggregateImprovementMayRescueAnyFailedCell",
  ], "acceptance");
  assert.deepEqual(Object.fromEntries(Object.entries(plan.acceptance).slice(0, 16)), fixedAcceptance);
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.acceptance[key], null, `acceptance.${key} must remain null before collection`);
  }
  assert.equal(plan.acceptance.allZeroToleranceAndNumericGatesApplyPerRosterPlacementScenarioRuntimeAndSafetyCell, true);
  assert.equal(plan.acceptance.aggregateImprovementMayRescueAnyFailedCell, false);

  assert.deepEqual(plan.dataPolicy, {
    rawRoomVideoDefault: false,
    rawFramesImagesAudioOrDepthAllowedInRepositoryReleaseOrResult: false,
    participantNamesStableIdentifiersFacesPortraitsOrProfileIdsAllowed: false,
    bodyMeasurementsCalibrationVectorsAppearanceEmbeddingsOrIdentityTemplatesAllowed: false,
    opaqueSessionLocalTrialQuartetAndPlayerLabelsRequired: true,
    skeletonOnlyTraceMayContainStableCrossSessionIdentity: false,
    freeTextResultEvidenceAllowed: false,
    networkEgressAllowed: false,
    temporaryDiagnosticImagesRequireSeparateProtocolConsentAndAuthorization: true,
    temporaryDiagnosticImagesMustBeDeletedAndDeletionVerified: true,
    adverseAttemptsStopsFaultsCollisionsOrExcludedQuartetsMayBeDeletedOrHidden: false,
  });
  assert.deepEqual(plan.decisionProtocol, {
    completePassingEvidenceMayAutomaticallyActivateTheMilestone: false,
    completePassingEvidenceMayAutomaticallyPromiseFourPlayerProductQuality: false,
    failedFourPlayerEvidenceMayAutomaticallyChangeTheProductMaximum: false,
    separateOwnerMilestoneAndProductScopeDecisionRequired: true,
    qualifiedClaimMustNameExactTargetCameraTrackerRoomZoneRosterProtocolAndBuild: true,
    partialRosterTargetRoomScenarioOrAggregateQualificationForbidden: true,
    resultMustRetainRejectedIncompleteInvalidStoppedAndWorstCases: true,
    retestAndEvidenceExpiryRuleSha256: null,
    fourPlayerProductDecisionId: null,
  });
  assert.deepEqual(plan.executionGate, { status: "blocked", blockerCodes: [...FOUR_PLAYER_BLOCKERS] });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedIdentityTrialCount: 0,
    completedActionTrialCount: 0,
    completedSessionCycleCount: 0,
    completedAccessibleIdentityTrialCount: 0,
    completedRoomSafetyTrialCount: 0,
    completedRuntimeSoakCount: 0,
    qualifiedOrderedRosterPersonaClasses: [],
    qualifiedPlacementQuartetIds: [],
    qualifiedRuntimeSurfaces: [],
    fourPlayerProductQualityClaimed: false,
    maximumProductPlayersChanged: false,
    decisionId: null,
  });

  return {
    status: plan.status,
    sourceBindingCount: plan.sourceBindings.length,
    rosterClassCount: plan.matrices.orderedRosterPersonaClasses.length,
    identityTrialCount: plan.matrices.identityTrialCount,
    actionTrialCount: plan.matrices.actionTrialCount,
    sessionCycleCount: plan.matrices.sessionCycleCount,
    accessibleIdentityTrialCount: plan.matrices.accessibleIdentityTrialCount,
    roomSafetyTrialCount: plan.matrices.roomSafetyTrialCount,
    runtimeSoakCount: plan.matrices.runtimeSoakCount,
    openGateCount: openAcceptanceKeys.length,
  };
}

export async function loadFourPlayerQualificationPlan(path = trackedPath) {
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

export async function validateTrackedFourPlayerQualificationPlan(path = trackedPath) {
  return validateFourPlayerQualificationPlan(await loadFourPlayerQualificationPlan(path), root);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await validateTrackedFourPlayerQualificationPlan();
  console.log(
    `${trackedPath}: valid ${summary.status} ${summary.rosterClassCount}-roster, `
      + `${summary.identityTrialCount}-identity-trial, ${summary.actionTrialCount}-action-trial, `
      + `${summary.sessionCycleCount}-session-cycle, ${summary.roomSafetyTrialCount}-safety-trial, `
      + `${summary.runtimeSoakCount}-one-hour-soak I-055 plan`,
  );
}
