import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/tv-visual-tokens/physical-tv-visual-token-plan-v1.json",
);
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const PHYSICAL_TV_VISUAL_TOKEN_FORMAT =
  "vcg-physical-tv-visual-token-plan/v1";
export const VISUAL_TOKEN_SURFACES = Object.freeze([
  "launcher-home",
  "first-run-setup",
  "game-loading",
  "manual-pause",
  "tracking-loss",
  "profile-portrait",
  "retro-library",
  "recoverable-error",
  "developer-mode",
]);
export const VISUAL_TOKEN_ACCENTS = Object.freeze(["cyan", "amber", "violet"]);
export const VISUAL_TOKEN_PERSONAS = Object.freeze([
  "school-age-child",
  "adult",
]);
export const VISUAL_TOKEN_VISION_STRATA = Object.freeze([
  "ordinary-vision-control",
  "low-vision-protocol-stratum",
  "color-vision-protocol-stratum",
]);
export const VISUAL_TOKEN_TASKS = Object.freeze([
  "name-current-surface-and-state",
  "locate-focused-primary-action-without-color",
  "read-critical-copy-at-seating-distance",
  "activate-focused-action-with-controller",
  "recover-with-back-or-home",
  "explain-fault-and-next-safe-action",
]);
export const VISUAL_TOKEN_BLOCKERS = Object.freeze([
  "exact-release-candidate-build-and-catalog-projection",
  "selected-physical-televisions-panel-modes-and-reference-targets",
  "measured-seating-distance-room-lighting-camera-and-capture-protocol",
  "complete-surface-state-fixtures-controller-tasks-and-independent-scoring",
  "adult-child-recruitment-consent-assent-comprehension-and-stop-authority",
  "low-vision-and-color-vision-observation-protocols-and-cohort-sizes",
  "all-open-readability-comprehension-performance-animation-and-power-gates",
  "gpu-animation-clock-instruments-operators-schedule-and-invalid-run-rules",
  "data-redaction-deletion-accessibility-release-and-publication-authority",
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
  "surfaceMatrix",
  "renderingMatrix",
  "participantMatrix",
  "performanceMatrix",
  "fixedAcceptance",
  "openAcceptance",
  "evidencePolicy",
  "executionGate",
  "result",
];
const sourceDefinitions = [
  ["visual-accessibility-and-product-decisions", "docs/DECISIONS.md"],
  ["visual-token-contract", "docs/VISUAL_TOKEN_SYSTEM.md"],
  ["blocking-persona-boundary", "docs/PLAYER_PERSONAS.md"],
  ["visual-token-implementation", "apps/console-lab/src/visual-tokens.ts"],
  ["shell-style-implementation", "apps/console-lab/src/styles.css"],
  [
    "bounded-ocra-font-evidence",
    "benchmarks/font-coverage/windows-x64-chrome-150-ocra-platform-fallback-v1.json",
  ],
  [
    "representative-headless-tv-regression-evidence",
    "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json",
  ],
];
const executionKeys = [
  "exactBuildArtifactSha256",
  "exactCatalogProjectionSha256",
  "selectedTelevisionMatrixSha256",
  "seatingLightingAndCameraProtocolSha256",
  "participantRecruitmentConsentAndAssentProtocolSha256",
  "lowVisionObservationProtocolSha256",
  "colorVisionObservationProtocolSha256",
  "controllerTaskAndScoringProtocolSha256",
  "gpuAndAnimationMeasurementProtocolSha256",
  "dataHandlingRedactionAndDeletionProtocolSha256",
  "scheduleSha256",
  "physicalTelevisionAccessAuthorized",
  "adultParticipationAuthorized",
  "childParticipationAuthorized",
  "accessibilityObservationAuthorized",
  "cameraCaptureAuthorized",
  "targetExecutionAuthorized",
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

export async function validatePhysicalTvVisualTokenPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, PHYSICAL_TV_VISUAL_TOKEN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "physical-tv-visual-token-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-206"]);
  for (const phrase of [
    "zero-result physical-TV visual-token plan",
    "do not prove seating-distance readability",
    "No television access",
    "publication is authorized",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.executionBoundary, executionKeys, "executionBoundary");
  for (const key of executionKeys.slice(0, 11)) {
    assert.equal(plan.executionBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of executionKeys.slice(11)) {
    assert.equal(plan.executionBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  assert.deepEqual(plan.surfaceMatrix, {
    surfaceIds: [...VISUAL_TOKEN_SURFACES],
    surfaceCount: 9,
    everySurfaceMustIncludeDefaultFocusedFaultAndRecoveryEvidence: true,
    syntheticFixtureMayReplaceRealShellState: false,
    oneSurfaceMayQualifyAnother: false,
  });

  assert.deepEqual(plan.renderingMatrix, {
    accentIds: [...VISUAL_TOKEN_ACCENTS],
    contrastModeIds: ["standard", "high"],
    motionModeIds: ["standard", "reduced"],
    targetClassIds: ["ordinary-x86-64-linux", "raspberry-pi-5-hailo"],
    displayRoleIds: [
      "selected-primary-television",
      "selected-secondary-panel",
    ],
    validRunsPerCell: 3,
    requiredCellCount: 432,
    requiredRunCount: 1296,
    everyRunIncludesMeasuredSeatingDistanceAmbientLightAndPanelMode: true,
    grayscaleAndLuminanceReviewRequiredForEveryFocusedState: true,
    accentOrContrastModeMayRescueAnother: false,
    targetDisplayOrSeatingPositionMayRescueAnother: false,
    failedInvalidOrRetriedRunsRemainVisible: true,
  });
  assert.equal(
    plan.surfaceMatrix.surfaceCount *
      plan.renderingMatrix.accentIds.length *
      plan.renderingMatrix.contrastModeIds.length *
      plan.renderingMatrix.motionModeIds.length *
      plan.renderingMatrix.targetClassIds.length *
      plan.renderingMatrix.displayRoleIds.length,
    plan.renderingMatrix.requiredCellCount,
  );
  assert.equal(
    plan.renderingMatrix.requiredCellCount * plan.renderingMatrix.validRunsPerCell,
    plan.renderingMatrix.requiredRunCount,
  );

  exactKeys(plan.participantMatrix, [
    "blockingPersonaClassIds",
    "visionObservationStratumIds",
    "taskIds",
    "minimumDistinctParticipantsPerPersonaStratum",
    "validTaskRunsPerParticipantCell",
    "requiredParticipantCellCount",
    "requiredParticipantSessionCount",
    "everySurfaceAccentContrastPersonaAndVisionStratumIsBlocking",
    "oneParticipantPersonaOrVisionStratumMayRescueAnother",
    "postResultParticipantOrTaskExclusionAllowed",
    "medicalDiagnosisOrIdentityInferenceAllowed",
  ], "participantMatrix");
  assert.deepEqual(plan.participantMatrix.blockingPersonaClassIds, [
    ...VISUAL_TOKEN_PERSONAS,
  ]);
  assert.deepEqual(plan.participantMatrix.visionObservationStratumIds, [
    ...VISUAL_TOKEN_VISION_STRATA,
  ]);
  assert.deepEqual(plan.participantMatrix.taskIds, [...VISUAL_TOKEN_TASKS]);
  assert.equal(plan.participantMatrix.minimumDistinctParticipantsPerPersonaStratum, null);
  assert.equal(plan.participantMatrix.validTaskRunsPerParticipantCell, null);
  assert.equal(plan.participantMatrix.requiredParticipantCellCount, 324);
  assert.equal(plan.participantMatrix.requiredParticipantSessionCount, null);
  assert.equal(
    plan.surfaceMatrix.surfaceCount *
      plan.renderingMatrix.accentIds.length *
      plan.renderingMatrix.contrastModeIds.length *
      plan.participantMatrix.blockingPersonaClassIds.length *
      plan.participantMatrix.visionObservationStratumIds.length,
    plan.participantMatrix.requiredParticipantCellCount,
  );
  assert.equal(
    plan.participantMatrix.everySurfaceAccentContrastPersonaAndVisionStratumIsBlocking,
    true,
  );
  assert.equal(plan.participantMatrix.oneParticipantPersonaOrVisionStratumMayRescueAnother, false);
  assert.equal(plan.participantMatrix.postResultParticipantOrTaskExclusionAllowed, false);
  assert.equal(plan.participantMatrix.medicalDiagnosisOrIdentityInferenceAllowed, false);

  assert.deepEqual(plan.performanceMatrix, {
    transitionClassIds: [
      "immediate-focus",
      "feedback-confirm-deny",
      "view-overlay-transition",
      "ambient-status",
    ],
    requiredPerformanceCellCount: 216,
    validRunsPerPerformanceCell: 20,
    requiredPerformanceRunCount: 4320,
    gpuFrameTimeFpsDroppedFramesMemoryAndPowerRequired: true,
    declaredAndMeasuredTransitionDurationRequired: true,
    reducedMotionMustBeNonRepeatingAndEffectivelyImmediate: true,
    browserDevtoolsOrSyntheticTimerAloneMayQualifyTarget: false,
    oneTargetSurfaceAccentOrModeMayRescueAnother: false,
  });
  assert.equal(
    plan.surfaceMatrix.surfaceCount *
      plan.renderingMatrix.accentIds.length *
      plan.renderingMatrix.contrastModeIds.length *
      plan.renderingMatrix.motionModeIds.length *
      plan.renderingMatrix.targetClassIds.length,
    plan.performanceMatrix.requiredPerformanceCellCount,
  );
  assert.equal(
    plan.performanceMatrix.requiredPerformanceCellCount *
      plan.performanceMatrix.validRunsPerPerformanceCell,
    plan.performanceMatrix.requiredPerformanceRunCount,
  );

  assert.deepEqual(plan.fixedAcceptance, {
    maximumCriticalTextClippingOverflowOrSafeAreaFailures: 0,
    maximumFocusStatesDependingOnlyOnColor: 0,
    maximumControllerFocusTraps: 0,
    maximumBackOrHomeRecoveryFailures: 0,
    maximumFaultStatesWithoutNamedConditionAndRecoveryAction: 0,
    maximumReducedMotionRepeatingAnimations: 0,
    maximumHiddenBrowserOrTargetErrors: 0,
    everyBlockingRenderingParticipantAndPerformanceCellMustPass: true,
    aggregateAverageMayRescueFailedCell: false,
    headlessOrDesktopEvidenceMayQualifyPhysicalTelevision: false,
    passingCyanMayQualifyAmberOrViolet: false,
    campaignMaySelectShippingAccentsOrChangeVisualPolicy: false,
  });

  exactKeys(plan.openAcceptance, [
    "minimumCriticalTextAngularHeightMilliDegrees",
    "minimumFocusLuminanceContrastMilliRatio",
    "minimumTaskComprehensionRatePpm",
    "maximumTaskErrorRatePpm",
    "maximumTaskCompletionP95Ms",
    "maximumGpuFrameTimeP95Us",
    "minimumSustainedFpsMilliFps",
    "maximumDroppedFrameRatePpm",
    "maximumGpuMemoryBytes",
    "maximumAnimationTimingErrorUs",
    "maximumTargetWallPowerMilliW",
    "mustBeFixedBeforeFirstPhysicalRun",
  ], "openAcceptance");
  for (const key of Object.keys(plan.openAcceptance).slice(0, 11)) {
    assert.equal(plan.openAcceptance[key], null, `blocked plan cannot fix ${key}`);
  }
  assert.equal(plan.openAcceptance.mustBeFixedBeforeFirstPhysicalRun, true);

  assert.deepEqual(plan.evidencePolicy, {
    physicalDisplayCapturesMustExcludePeopleAndBeCroppedRedactedAndExifFree: true,
    participantNamesFacesVoicesExactAgesAddressesDiagnosesOrStableIdentifiersAllowed: false,
    individualParticipantFreeTextOrRawTaskRecordingAllowedInRepositoryOrRelease: false,
    aggregatePathFreeClosedVocabularyResultsRequired: true,
    rawHomeRoomPhotographyAllowed: false,
    networkEgressAllowed: false,
    temporaryParticipantOrDisplayCaptureRequiresSeparateConsentAccessAndDeletionProof: true,
    everyEvidenceArtifactMustBindPlanBuildTargetPanelModeDistanceLightingAndRun: true,
  });

  exactKeys(plan.executionGate, [
    "state",
    "blockerCodes",
    "readyRequiresEveryBlockerResolvedBeforeFirstPhysicalRun",
  ], "executionGate");
  assert.equal(plan.executionGate.state, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, [...VISUAL_TOKEN_BLOCKERS]);
  assert.equal(plan.executionGate.readyRequiresEveryBlockerResolvedBeforeFirstPhysicalRun, true);

  assert.deepEqual(plan.result, {
    disposition: "blocked",
    completedRenderingRunCount: 0,
    completedParticipantSessionCount: 0,
    completedPerformanceRunCount: 0,
    renderingCellResults: [],
    participantCellResults: [],
    performanceCellResults: [],
    physicalTelevisionCount: 0,
    participantCount: 0,
    qualifiedAccentIds: [],
    failedSurfaceIds: [],
    releaseQualified: false,
    visualPolicyChanged: false,
  });
}

export async function parsePhysicalTvVisualTokenPlanBytes(bytes) {
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
  await validatePhysicalTvVisualTokenPlan(plan);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await parsePhysicalTvVisualTokenPlanBytes(await readFile(trackedPath));
  console.log(
    `Physical-TV visual-token plan valid: status=${plan.status} surfaces=${plan.surfaceMatrix.surfaceCount} renderingRuns=${plan.renderingMatrix.requiredRunCount} performanceRuns=${plan.performanceMatrix.requiredPerformanceRunCount}`,
  );
}
