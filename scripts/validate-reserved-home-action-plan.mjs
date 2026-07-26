import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/reserved-home/reserved-home-action-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const RESERVED_HOME_FORMAT = "vcg-reserved-home-action-plan/v1";
export const RESERVED_HOME_REQUIRED_TARGET_IDS = Object.freeze([
  "pi5-ai-hat26",
  "ordinary-x86-linux",
]);
export const RESERVED_HOME_OPTIONAL_TARGET_IDS = Object.freeze([
  "steam-machine-steamos",
]);
export const RESERVED_HOME_REQUIRED_INPUT_ROLE_IDS = Object.freeze([
  "first-party-standard",
  "second-vendor-standard",
  "generic-ambiguous",
  "simultaneous-cross-vendor-pair",
  "dedicated-recovery-remote",
]);
export const RESERVED_HOME_RUNTIME_IDS = Object.freeze([
  "bundled-local-web",
  "supervised-hosted-web",
  "signed-native-game",
  "supervised-retro",
]);
export const RESERVED_HOME_HOSTILE_STATE_IDS = Object.freeze([
  "interactive-focused",
  "exclusive-fullscreen-or-equivalent",
  "pointer-or-relative-input-capture",
  "fullscreen-plus-input-capture",
  "text-entry-or-ime-active",
  "game-modal-or-overlay-active",
  "input-flood-or-repeat-storm",
  "main-thread-renderer-or-game-loop-hung",
  "process-crash-or-exit-race",
  "popup-child-window-or-secondary-surface-focused",
  "focus-stolen-or-game-backgrounded",
  "network-load-or-content-readiness-stalled",
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
  "targetPolicy",
  "targets",
  "inputRoles",
  "runtimeClasses",
  "hostileStates",
  "homeSemantics",
  "authorityBoundary",
  "qualificationMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "dataPolicy",
  "executionGate",
  "result",
];

const sourceDefinitions = [
  ["security-boundary", "docs/SECURITY_THREAT_MODEL.md"],
  ["offline-input-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
  ["tv-controller-boundary", "docs/TV_COMPATIBILITY_CONTRACT.md"],
  ["hosted-supervision-boundary", "docs/HOSTED_BROWSER_SUPERVISION.md"],
  ["retro-supervision-boundary", "docs/RETROARCH_INTEGRATION.md"],
  [
    "controller-qualification-boundary",
    "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json",
  ],
  [
    "steam-input-boundary",
    "benchmarks/steam-input/steamos-steam-input-action-plan-v1.json",
  ],
  [
    "signed-native-boundary",
    "benchmarks/signed-local-package/runtime-neutral-signed-local-package-plan-v1.json",
  ],
  [
    "steamos-shell-boundary",
    "benchmarks/steamos-shell/steamos-outer-shell-lifecycle-plan-v1.json",
  ],
  ["hosted-supervisor-implementation-boundary", "scripts/hosted-browser-supervisor.ts"],
];

const allInputRoleIds = [
  ...RESERVED_HOME_REQUIRED_INPUT_ROLE_IDS.slice(0, 4),
  "dedicated-recovery-remote",
  "receiver-2.4ghz-if-claimed",
];
const inputBindingClasses = [
  "dedicated-system-button-or-owner-approved-chord",
  "dedicated-system-button-or-owner-approved-chord",
  "approved-guided-mapping-without-semantic-guessing",
  "either-player-system-action-with-deterministic-host-ownership",
  "dedicated-system-home-control",
  "dedicated-system-button-or-owner-approved-chord",
];

const metricIds = [
  "physical-home-edge-count",
  "pre-game-router-home-edge-count",
  "game-home-delivery-count",
  "system-surface-visible-ms",
  "system-surface-focused-ms",
  "canonical-system-action-response-ms",
  "game-input-revocation-ms",
  "wrong-player-or-owner-count",
  "swallowed-duplicate-stuck-or-fabricated-home-count",
  "keyboard-mouse-shell-or-operator-recovery-count",
  "unowned-process-or-focus-count",
  "unrecovered-trap-or-failure-count",
];

const blockerCodes = [
  "I091-001-exact-target-compositor-and-input-stack",
  "I091-002-exact-controller-remote-samples-and-bindings",
  "I091-003-pre-game-global-reservation-design",
  "I091-004-home-resume-forced-exit-and-focus-policy",
  "I091-005-runtime-representatives-and-adapters",
  "I091-006-hostile-state-fault-harness-and-safety",
  "I091-007-independent-edge-recipient-focus-process-and-clock-oracles",
  "I091-008-schedule-numeric-gates-and-statistics",
  "I091-009-controller-only-accessibility-and-comprehension",
  "I091-010-result-sanitization-retention-review-and-incident-policy",
  "I091-011-target-input-fault-package-and-participant-authority",
  "I091-012-qualification-publication-and-product-policy-authority",
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
    );
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateReservedHomeActionPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, RESERVED_HOME_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "i091-reserved-home-action-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-091"]);
  for (const phrase of [
    "strict zero-result compositor-owned Home qualification plan",
    "does not prove a physical controller or recovery remote",
    "globally reserved Home binding",
    "Back, Pause, ordinary game actions",
    "cannot rescue Home failure",
    "No target, controller, remote, compositor, input service, game, fault, mapping, persistence, package, process, participant, qualification, publication, compatibility, or product-policy operation is authorized",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(
    plan.targetPolicy,
    [
      "requiredTargetIds",
      "optionalTargetIds",
      "windowsOrWslMayQualifyRequiredLinuxTarget",
      "optionalTargetMayRescueRequiredTarget",
      "oneRequiredTargetMayRescueAnother",
      "browserSyntheticSteamInputOrGameHandlerMayQualifySystemReservation",
      "automaticCompositorInputStackOrBindingSelection",
    ],
    "targetPolicy",
  );
  assert.deepEqual(plan.targetPolicy.requiredTargetIds, RESERVED_HOME_REQUIRED_TARGET_IDS);
  assert.deepEqual(plan.targetPolicy.optionalTargetIds, RESERVED_HOME_OPTIONAL_TARGET_IDS);
  for (const [key, value] of Object.entries(plan.targetPolicy)) {
    if (key.endsWith("Ids")) continue;
    assert.equal(value, false, `${key} must remain false`);
  }

  assert.ok(Array.isArray(plan.targets));
  assert.equal(plan.targets.length, 3);
  assert.deepEqual(
    plan.targets.map(({ targetId }) => targetId),
    [...RESERVED_HOME_REQUIRED_TARGET_IDS, ...RESERVED_HOME_OPTIONAL_TARGET_IDS],
  );
  for (const [index, target] of plan.targets.entries()) {
    exactKeys(
      target,
      [
        "targetId",
        "role",
        "required",
        "hardwareFirmwareAndInputTopologySha256",
        "operatingSystemKernelCompositorAndInputServiceSha256",
        "nativeHostBrowserRetroAndRuntimeManifestSha256",
        "globalShortcutAndFocusPolicySha256",
        "faultHarnessAndClockManifestSha256",
        "receivedInventoriedAndAuthorized",
      ],
      `targets[${index}]`,
    );
    assert.equal(target.required, index < 2);
    for (const key of Object.keys(target).filter((key) => key.endsWith("Sha256"))) {
      assert.equal(target[key], null, `${target.targetId}.${key} must remain open`);
    }
    assert.equal(target.receivedInventoriedAndAuthorized, false);
  }

  assert.ok(Array.isArray(plan.inputRoles));
  assert.equal(plan.inputRoles.length, 6);
  assert.deepEqual(plan.inputRoles.map(({ roleId }) => roleId), allInputRoleIds);
  for (const [index, role] of plan.inputRoles.entries()) {
    exactKeys(
      role,
      [
        "roleId",
        "requirement",
        "homeBindingClass",
        "physicalSampleManifestSha256s",
        "mappingAndFirmwareManifestSha256",
        "qualified",
      ],
      `inputRoles[${index}]`,
    );
    assert.equal(
      role.requirement,
      index === 5 ? "conditional-if-product-support-is-claimed" : "required",
    );
    assert.equal(role.homeBindingClass, inputBindingClasses[index]);
    assert.deepEqual(role.physicalSampleManifestSha256s, []);
    assert.equal(role.mappingAndFirmwareManifestSha256, null);
    assert.equal(role.qualified, false);
  }

  assert.ok(Array.isArray(plan.runtimeClasses));
  assert.equal(plan.runtimeClasses.length, RESERVED_HOME_RUNTIME_IDS.length);
  assert.deepEqual(
    plan.runtimeClasses.map(({ runtimeId }) => runtimeId),
    RESERVED_HOME_RUNTIME_IDS,
  );
  for (const [index, runtime] of plan.runtimeClasses.entries()) {
    exactKeys(
      runtime,
      ["runtimeId", "requiredRepresentativeArtifactSha256", "gameMayReceiveHome"],
      `runtimeClasses[${index}]`,
    );
    assert.equal(runtime.requiredRepresentativeArtifactSha256, null);
    assert.equal(runtime.gameMayReceiveHome, false);
  }
  assert.deepEqual(plan.hostileStates, RESERVED_HOME_HOSTILE_STATE_IDS);

  exactKeys(
    plan.homeSemantics,
    [
      "reservedActionId",
      "owner",
      "timerStart",
      "passingEnd",
      "gameDeliveryAllowed",
      "gameAcknowledgementRequired",
      "steamOverlayMayBeSoleHomeAuthority",
      "browserEscapeBackOrPageHandlerMaySubstitute",
      "gameProvidedPauseExitOrMenuMaySubstitute",
      "hostMustRevokeGameInputBeforeSystemSurfaceInteraction",
      "hostMustRetainProcessAndFocusRecoveryAuthority",
      "homeTransitionPolicySha256",
      "resumeReturnAndFocusPolicySha256",
      "forcedExitBindingHoldAndConfirmationPolicySha256",
      "backAndPauseRemainSeparateUnqualifiedActions",
    ],
    "homeSemantics",
  );
  assert.equal(plan.homeSemantics.reservedActionId, "home");
  assert.equal(plan.homeSemantics.owner, "system-compositor-or-pre-game-input-host");
  assert.match(plan.homeSemantics.timerStart, /before-game-delivery/u);
  assert.match(plan.homeSemantics.passingEnd, /visible-focused/u);
  for (const key of [
    "gameDeliveryAllowed",
    "gameAcknowledgementRequired",
    "steamOverlayMayBeSoleHomeAuthority",
    "browserEscapeBackOrPageHandlerMaySubstitute",
    "gameProvidedPauseExitOrMenuMaySubstitute",
  ]) {
    assert.equal(plan.homeSemantics[key], false, `${key} must remain false`);
  }
  for (const key of [
    "hostMustRevokeGameInputBeforeSystemSurfaceInteraction",
    "hostMustRetainProcessAndFocusRecoveryAuthority",
    "backAndPauseRemainSeparateUnqualifiedActions",
  ]) {
    assert.equal(plan.homeSemantics[key], true, `${key} must remain true`);
  }
  for (const key of [
    "homeTransitionPolicySha256",
    "resumeReturnAndFocusPolicySha256",
    "forcedExitBindingHoldAndConfirmationPolicySha256",
  ]) {
    assert.equal(plan.homeSemantics[key], null, `${key} must remain open`);
  }

  const authorityNullKeys = [
    "exactInputSampleAndBindingDecisionSha256",
    "compositorInputServiceAndPrivilegeDesignSha256",
    "runtimeAdapterAndPreGameRoutingImplementationSha256",
    "homeResumeForcedExitAndFocusPolicySha256",
    "faultInjectionScheduleAndIndependentOracleSha256",
    "numericGateAndStatisticalProtocolSha256",
    "resultSchemaSanitizationRetentionAndReviewProtocolSha256",
  ];
  const authorityFalseKeys = [
    "targetControllerRemoteOrParticipantOperationAuthorized",
    "compositorInputMappingOrPersistenceMutationAuthorized",
    "fullscreenPointerFocusProcessOrNetworkFaultAuthorized",
    "gamePackageOrRuntimeLaunchAuthorized",
    "qualificationPublicationCompatibilityOrProductPolicyAuthorized",
  ];
  exactKeys(
    plan.authorityBoundary,
    [...authorityNullKeys, ...authorityFalseKeys],
    "authorityBoundary",
  );
  for (const key of authorityNullKeys) assert.equal(plan.authorityBoundary[key], null);
  for (const key of authorityFalseKeys) assert.equal(plan.authorityBoundary[key], false);

  exactKeys(
    plan.qualificationMatrix,
    [
      "requiredTargetCount",
      "optionalTargetCount",
      "requiredInputRoleIds",
      "conditionalInputRoleIds",
      "runtimeClassIds",
      "hostileStateIds",
      "requiredInputRoleCount",
      "conditionalInputRoleCount",
      "runtimeClassCount",
      "hostileStateCount",
      "requiredCellCount",
      "optionalCellCount",
      "conditionalCellsPerTarget",
      "validCyclesPerCell",
      "requiredCycleCount",
      "optionalCycleCount",
      "conditionalCyclesPerTarget",
      "everyDeclaredCellMustRun",
      "failedBlockedInvalidStoppedRetriedAndWorstCaseCyclesRemainVisible",
      "otherActionInputTargetRuntimeStateOrAggregateMayRescueFailure",
    ],
    "qualificationMatrix",
  );
  const matrix = plan.qualificationMatrix;
  assert.deepEqual(matrix.requiredInputRoleIds, RESERVED_HOME_REQUIRED_INPUT_ROLE_IDS);
  assert.deepEqual(matrix.conditionalInputRoleIds, ["receiver-2.4ghz-if-claimed"]);
  assert.deepEqual(matrix.runtimeClassIds, RESERVED_HOME_RUNTIME_IDS);
  assert.deepEqual(matrix.hostileStateIds, RESERVED_HOME_HOSTILE_STATE_IDS);
  assert.equal(matrix.requiredTargetCount, 2);
  assert.equal(matrix.optionalTargetCount, 1);
  assert.equal(matrix.requiredInputRoleCount, 5);
  assert.equal(matrix.conditionalInputRoleCount, 1);
  assert.equal(matrix.runtimeClassCount, 4);
  assert.equal(matrix.hostileStateCount, 12);
  assert.equal(matrix.requiredCellCount, 480);
  assert.equal(matrix.optionalCellCount, 240);
  assert.equal(matrix.conditionalCellsPerTarget, 48);
  assert.equal(matrix.validCyclesPerCell, 20);
  assert.equal(matrix.requiredCycleCount, 9600);
  assert.equal(matrix.optionalCycleCount, 4800);
  assert.equal(matrix.conditionalCyclesPerTarget, 960);
  assert.equal(
    matrix.requiredCellCount,
    matrix.requiredTargetCount *
      matrix.requiredInputRoleCount *
      matrix.runtimeClassCount *
      matrix.hostileStateCount,
  );
  assert.equal(matrix.requiredCycleCount, matrix.requiredCellCount * 20);
  assert.equal(matrix.optionalCycleCount, matrix.optionalCellCount * 20);
  assert.equal(matrix.conditionalCyclesPerTarget, matrix.conditionalCellsPerTarget * 20);
  assert.equal(matrix.everyDeclaredCellMustRun, true);
  assert.equal(
    matrix.failedBlockedInvalidStoppedRetriedAndWorstCaseCyclesRemainVisible,
    true,
  );
  assert.equal(matrix.otherActionInputTargetRuntimeStateOrAggregateMayRescueFailure, false);

  exactKeys(
    plan.measurements,
    [
      "requiredMetricIds",
      "independentPhysicalEdgeRecipientFocusSurfaceInputRevocationProcessAndClockOraclesRequired",
      "everyAttemptDeliveryFocusTransitionFaultFailureAndRecoveryMustRemainVisible",
      "uiCopyGameCallbackSyntheticInputProcessExitOrOtherActionMaySubstitute",
    ],
    "measurements",
  );
  assert.deepEqual(plan.measurements.requiredMetricIds, metricIds);
  assert.equal(
    plan.measurements
      .independentPhysicalEdgeRecipientFocusSurfaceInputRevocationProcessAndClockOraclesRequired,
    true,
  );
  assert.equal(
    plan.measurements.everyAttemptDeliveryFocusTransitionFaultFailureAndRecoveryMustRemainVisible,
    true,
  );
  assert.equal(
    plan.measurements.uiCopyGameCallbackSyntheticInputProcessExitOrOtherActionMaySubstitute,
    false,
  );

  const zeroKeys = [
    "maximumHomeEventsDeliveredToGame",
    "maximumHomeEventsSwallowedDuplicatedStuckOrFabricated",
    "maximumSystemSurfaceFocusOwnershipFailures",
    "maximumCanonicalSystemActionResponseFailures",
    "maximumWrongPlayerOrHostOwnershipTransitions",
    "maximumKeyboardMouseShellOrOperatorRecoveries",
    "maximumUnownedOrEscapedGameProcessesOrSurfaces",
    "maximumUnrecoveredTrapsOrValidProductFailuresPerCell",
  ];
  exactKeys(
    plan.fixedAcceptance,
    [
      "minimumValidCyclesPerCell",
      ...zeroKeys,
      "everyRequiredCellMustPass",
      "homeMustWorkWithoutMotionCameraNetworkOrSteamAccount",
      "systemMustOwnHomeBeforeGameDelivery",
      "gameMayNotOverrideDisableRemapAcknowledgeOrDelayHome",
      "gameFailureMayNotDisableSystemSurfaceOrForcedRecovery",
      "otherActionInputTargetRuntimeStateOrAggregateMayRescueFailure",
      "allOpenGatesMustBeFrozenBeforeOperation",
    ],
    "fixedAcceptance",
  );
  assert.equal(plan.fixedAcceptance.minimumValidCyclesPerCell, 20);
  for (const key of zeroKeys) assert.equal(plan.fixedAcceptance[key], 0);
  for (const key of [
    "everyRequiredCellMustPass",
    "homeMustWorkWithoutMotionCameraNetworkOrSteamAccount",
    "systemMustOwnHomeBeforeGameDelivery",
    "gameMayNotOverrideDisableRemapAcknowledgeOrDelayHome",
    "gameFailureMayNotDisableSystemSurfaceOrForcedRecovery",
    "allOpenGatesMustBeFrozenBeforeOperation",
  ]) {
    assert.equal(plan.fixedAcceptance[key], true, `${key} must remain true`);
  }
  assert.equal(
    plan.fixedAcceptance.otherActionInputTargetRuntimeStateOrAggregateMayRescueFailure,
    false,
  );

  exactKeys(
    plan.openAcceptance,
    [
      "maximumSystemSurfaceVisibleP95Ms",
      "maximumSystemSurfaceFocusedP95Ms",
      "maximumCanonicalSystemActionResponseP95Ms",
      "maximumGameInputRevocationP95Ms",
      "maximumHomeEndToEndP99Ms",
      "maximumHomeEndToEndWorstMs",
      "forcedExitBindingAndHoldMs",
      "maximumForcedExitToLauncherP95Ms",
      "resumeReturnAndFocusDeadlineMs",
      "minimumPhysicalSamplesPerModelFirmwareAndTransport",
    ],
    "openAcceptance",
  );
  for (const [key, value] of Object.entries(plan.openAcceptance)) {
    assert.equal(value, null, `${key} must remain open`);
  }

  exactKeys(
    plan.dataPolicy,
    [
      "opaqueTargetInputRuntimeStateCellCycleAndReasonLabelsRequired",
      "closedCountsTimingsDigestsMetricsAndRedactedCategoriesRequired",
      "rawUsbBluetoothHidInputOrRemotePayloadsAllowed",
      "serialMacStableControllerOrRemoteIdentifiersAllowed",
      "screenVideoAudioCameraOrParticipantDataAllowed",
      "windowTitlesUrlsPathsEnvironmentArgumentsOrStorageValuesAllowed",
      "accountProfileSavePackageOrEnteredTextDataAllowed",
      "freeTextGameCompositorDriverServiceCrashOrResultLogsAllowed",
      "failedBlockedInvalidStoppedRetriedAndWorstCaseEvidenceMustRemainVisible",
    ],
    "dataPolicy",
  );
  for (const key of [
    "opaqueTargetInputRuntimeStateCellCycleAndReasonLabelsRequired",
    "closedCountsTimingsDigestsMetricsAndRedactedCategoriesRequired",
    "failedBlockedInvalidStoppedRetriedAndWorstCaseEvidenceMustRemainVisible",
  ]) {
    assert.equal(plan.dataPolicy[key], true);
  }
  for (const key of [
    "rawUsbBluetoothHidInputOrRemotePayloadsAllowed",
    "serialMacStableControllerOrRemoteIdentifiersAllowed",
    "screenVideoAudioCameraOrParticipantDataAllowed",
    "windowTitlesUrlsPathsEnvironmentArgumentsOrStorageValuesAllowed",
    "accountProfileSavePackageOrEnteredTextDataAllowed",
    "freeTextGameCompositorDriverServiceCrashOrResultLogsAllowed",
  ]) {
    assert.equal(plan.dataPolicy[key], false, `${key} must remain false`);
  }

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, blockerCodes);
  assert.equal(plan.result, null);
}

export async function readReservedHomeActionPlan(
  path = trackedPath,
  repositoryRoot = root,
) {
  const bytes = await readFile(path);
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const value = JSON.parse(normalizedText(bytes, path));
  await validateReservedHomeActionPlan(value, repositoryRoot);
  return value;
}

async function main() {
  const plan = await readReservedHomeActionPlan();
  console.log(
    `Reserved Home plan valid: ${plan.qualificationMatrix.requiredCellCount} required cells, ${plan.qualificationMatrix.requiredCycleCount} required cycles, ${plan.executionGate.blockerCodes.length} blockers.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
