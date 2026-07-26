import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/steam-input/steamos-steam-input-action-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const STEAMOS_STEAM_INPUT_PLAN_FORMAT =
  "vcg-steamos-steam-input-action-plan/v1";
export const STEAMOS_STEAM_INPUT_ROUTES = Object.freeze([
  [
    "accountless-sdl-baseline",
    "required-core-control",
    "sdl-or-normal-linux-input",
    false,
    false,
  ],
  [
    "steam-input-native-actions",
    "optional-native-action-adapter",
    "isteaminput-native-mode",
    true,
    true,
  ],
  [
    "steam-input-legacy-gamepad",
    "declared-legacy-compatibility",
    "steam-input-gamepad-emulation",
    true,
    false,
  ],
  [
    "steam-input-legacy-keyboard-mouse",
    "declared-legacy-compatibility",
    "steam-input-keyboard-mouse-emulation",
    true,
    false,
  ],
]);
export const STEAMOS_STEAM_INPUT_CONTROLLER_ROLES = Object.freeze([
  ["steam-controller", "recognized-standard"],
  ["xbox-protocol-standard", "recognized-standard"],
  ["playstation-protocol-standard", "recognized-standard"],
  ["switch-pro-protocol-standard", "recognized-standard"],
  ["eightbitdo-multimode-standard", "recognized-standard-per-mode"],
  ["generic-directinput-standard", "recognized-or-safe-generic"],
  ["ambiguous-unknown-controller", "zero-authority-until-guided-mapping"],
]);
export const STEAMOS_STEAM_INPUT_SCENARIO_GROUPS = Object.freeze([
  {
    groupId: "controller-lifecycle-and-zero-setup",
    routeIds: STEAMOS_STEAM_INPUT_ROUTES.map(([id]) => id),
    scenarioIds: [
      "attached-before-cold-boot-zero-setup-canonical-default",
      "hotplug-at-shell-game-overlay-and-text-entry-boundaries",
      "disconnect-reconnect-replacement-and-fresh-input-epoch",
      "controller-sleep-console-suspend-and-fresh-wake",
      "simultaneous-standard-comparator-assignment-and-isolation",
    ],
    requiredCellCount: 140,
  },
  {
    groupId: "native-action-semantics",
    routeIds: ["steam-input-native-actions"],
    scenarioIds: [
      "shell-digital-navigation-confirm-and-text-entry-request",
      "game-digital-primary-secondary-and-shoulders",
      "game-analog-move-joystick-mode",
      "game-analog-look-absolute-mouse-mode",
      "shell-game-overlay-action-set-and-text-layer-transitions",
      "action-origin-controller-specific-and-generic-glyph-selection",
    ],
    requiredCellCount: 42,
  },
  {
    groupId: "legacy-emulation-compatibility",
    routeIds: [
      "steam-input-legacy-gamepad",
      "steam-input-legacy-keyboard-mouse",
    ],
    scenarioIds: [
      "declared-legacy-game-control-and-complete-release-edges",
      "simultaneous-mouse-keyboard-gamepad-and-double-input-denial",
      "legacy-glyph-truth-and-no-native-action-promotion",
      "focus-fullscreen-pointer-lock-and-mode-switch-recovery",
    ],
    requiredCellCount: 56,
  },
  {
    groupId: "accountless-and-steam-unavailable-fallback",
    routeIds: ["accountless-sdl-baseline"],
    scenarioIds: [
      "steam-client-never-started-core-controller-operation",
      "signed-out-offline-network-loss-and-local-restart",
      "steam-client-exit-restart-update-and-adapter-unavailable",
      "invalid-or-missing-steam-configuration-fails-to-accountless-base",
    ],
    requiredCellCount: 28,
  },
  {
    groupId: "privileged-actions-text-mapping-and-recovery",
    routeIds: STEAMOS_STEAM_INPUT_ROUTES.map(([id]) => id),
    scenarioIds: [
      "controller-text-entry-open-confirm-cancel-and-no-evidence-disclosure",
      "unknown-zero-authority-guided-mapping-reset-and-safe-generic-glyph",
      "reserved-home-back-pause-responsive-fullscreen-and-pointer-lock",
      "reserved-home-back-pause-hung-game-client-and-overlay-loss",
      "mapping-client-sdk-and-default-configuration-update-rollback-recovery",
    ],
    requiredCellCount: 140,
  },
]);
export const STEAMOS_STEAM_INPUT_METRICS = Object.freeze([
  "exact-target-steam-client-sdk-appid-action-manifest-default-config-controller-route-build-and-schedule-digests",
  "connection-disconnection-replacement-sleep-wake-input-epoch-and-player-assignment-events",
  "active-action-set-layer-transition-order-and-stale-action-denial",
  "canonical-digital-press-release-recipient-duplicate-miss-and-stuck-action-counts",
  "native-digital-analog-value-mode-deadzone-and-controlled-response",
  "legacy-gamepad-keyboard-mouse-output-mixed-input-double-event-and-mode-state",
  "action-origin-glyph-family-localization-generic-fallback-and-update-timing",
  "text-entry-request-overlay-open-confirm-cancel-close-return-and-data-disposition",
  "home-back-pause-host-route-game-nonreceipt-latency-and-recovery",
  "unknown-controller-zero-authority-guided-mapping-reset-persistence-and-conflict-state",
  "accountless-steam-absent-signed-out-offline-network-loss-and-identity-flow",
  "client-overlay-process-compositor-config-update-rollback-fault-and-fresh-recovery",
  "controller-only-path-keyboard-mouse-operator-intervention-and-visible-failure-state",
  "failed-invalid-stopped-retried-unsupported-adverse-and-worst-case-cell-ledger",
]);
export const STEAMOS_STEAM_INPUT_BLOCKERS = Object.freeze([
  "sti-001-selected-received-steamos-target-steam-client-sdk-runtime-and-system-tuple",
  "sti-002-steam-appid-partner-access-iga-vdf-and-official-default-configuration-authority",
  "sti-003-seven-exact-controller-role-samples-firmware-transports-loan-and-purchase-authority",
  "sti-004-accountless-sdl-native-action-and-two-legacy-route-implementations",
  "sti-005-action-set-layer-name-handle-origin-config-localization-and-canonical-mapping-protocol",
  "sti-006-privileged-host-or-compositor-home-back-pause-route-and-hostile-focus-oracles",
  "sti-007-controller-text-entry-overlay-confirm-cancel-return-and-data-disposition-protocol",
  "sti-008-controller-specific-action-origin-glyph-localization-and-safe-generic-fallback",
  "sti-009-unknown-controller-zero-authority-guided-mapping-reset-signing-and-persistence",
  "sti-010-player-assignment-simultaneous-controller-reconnect-and-replacement-ceremony",
  "sti-011-exact-shell-game-overlay-hosted-native-and-legacy-workload-content-and-interactions",
  "sti-012-all-open-sample-latency-transition-glyph-text-and-recovery-gates",
  "sti-013-client-overlay-process-compositor-mapping-sdk-config-update-rollback-and-fault-protocol",
  "sti-014-accountless-offline-steam-identity-data-rights-privacy-retention-and-incident-policy",
  "sti-015-target-controller-account-partner-service-fault-qualification-and-publication-authority",
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
  "prototypeContract",
  "authorityBoundary",
  "inputRoutes",
  "controllerRoles",
  "qualificationMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "dataPolicy",
  "executionGate",
  "result",
];
const sourceDefinitions = [
  ["portable-controller-policy", "docs/RESEARCH.md"],
  ["steam-machine-input-boundary", "docs/STEAM_MACHINE_2026.md"],
  ["official-source-registry", "docs/SOURCES.md"],
  ["canonical-mapping-boundary", "docs/CONTROLLER_MAPPING_CONTRACT.md"],
  ["native-input-boundary", "docs/CONTROLLER_INPUT.md"],
  [
    "steam-input-action-contract",
    "packages/motion-contract/src/steam-input-actions.ts",
  ],
  [
    "steam-input-action-contract-tests",
    "packages/motion-contract/tests/steam-input-actions.test.ts",
  ],
  [
    "controller-lifecycle-boundary",
    "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json",
  ],
  [
    "bluetooth-controller-boundary",
    "benchmarks/controller-pairing/cross-tier-bluetooth-controller-plan-v1.json",
  ],
  [
    "controller-only-catalog-boundary",
    "benchmarks/catalog-controller-only/catalog-controller-only-qualification-plan-v1.json",
  ],
  [
    "steamos-package-boundary",
    "benchmarks/steamos-content/steamos-update-safe-content-plan-v1.json",
  ],
  [
    "steamos-workload-boundary",
    "benchmarks/steamos-workload/steamos-pose-game-workload-plan-v1.json",
  ],
  ["accountless-offline-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
  ["native-input-policy-model", "native/vcg-host/src/input.rs"],
];
const authorityNullKeys = [
  "selectedSteamOsTargetManifestSha256",
  "steamClientSdkAppIdAndPartnerConfigurationSha256",
  "igaVdfAndOfficialDefaultConfigurationSetSha256",
  "sdlAndSteamInputAdapterBuildSha256",
  "controllerSampleTransportFirmwareAndMappingManifestSha256",
  "glyphOriginLocalizationAndGenericFallbackProtocolSha256",
  "textEntryInvocationCancelConfirmAndDataProtocolSha256",
  "reservedActionCompositorRouteAndHostileFocusProtocolSha256",
  "unknownControllerGuidedMappingAndPersistenceProtocolSha256",
  "workloadAccountlessFallbackFaultAndRecoveryProtocolSha256",
  "scheduleNumericGateAndIndependentReviewSha256",
  "dataRightsPrivacyRetentionDeletionAndIncidentProtocolSha256",
];
const authorityFalseKeys = [
  "targetControllerAccountOrPartnerOperationAuthorized",
  "controllerMappingTextEntryOrServiceMutationAuthorized",
  "clientOverlayProcessCompositorOrInputFaultAuthorized",
  "qualificationPublicationOrCompatibilityClaimAuthorized",
];
const routeKeys = [
  "routeId",
  "routeClass",
  "provider",
  "steamClientRequired",
  "mayQualifySteamNativeActions",
  "implementationBuildSha256",
  "routeResultSha256",
  "implementedOrQualified",
];
const controllerKeys = [
  "roleId",
  "mappingExpectation",
  "exactSampleManifestSha256",
  "mappingConfigurationSha256",
  "roleResultSha256",
  "sampleReceivedOrQualified",
];
const openAcceptanceKeys = [
  "minimumPhysicalSamplesPerRoleFirmwareRevisionAndTransport",
  "maximumDiscoveryP95Ms",
  "maximumReconnectP95Ms",
  "maximumOrdinaryActionDeliveryP95Ms",
  "maximumReservedActionDeliveryP95Ms",
  "maximumReservedActionDeliveryP99Ms",
  "maximumReservedActionDeliveryWorstMs",
  "maximumActionSetOrLayerTransitionP95Ms",
  "maximumGlyphOriginUpdateP95Ms",
  "maximumTextEntryOverlayOpenAndCloseP95Ms",
  "maximumSteamUnavailableFallbackRecoveryP95Ms",
  "maximumMappingOrConfigurationUpdateRollbackP95Ms",
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

export async function validateSteamOsSteamInputActionPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, STEAMOS_STEAM_INPUT_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "steamos-steam-input-actions-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-169"]);
  for (const phrase of [
    "strict zero-result Steam Input adapter plan",
    "Steam Input remains optional",
    "cannot replace or weaken accountless SDL or ordinary Linux input",
    "No target, controller, account, partner configuration, service mutation, fault, qualification, publication, or compatibility claim is authorized",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.prototypeContract, {
    schemaVersion: 1,
    contractId: "vcg-steam-input-actions-v1",
    contractSourceSha256:
      "fa503bc9cd8d9c543a77c8bbff2c908cceace272071ea384d9f9e034e6ad523e",
    disposition: "optional-steam-input-adapter",
    baseInputAuthority: "sdl-or-normal-linux-input",
    actionSetIds: ["vcg-shell", "vcg-game", "vcg-console-overlay"],
    actionSetLayerIds: ["vcg-text-entry"],
    reservedActionIds: ["home", "back", "pause"],
    reservedActionsHostOrCompositorOnly: true,
    steamActionMayBeSoleReservedAuthority: false,
    steamAccountRequiredForCoreOperation: false,
    actualIgaVdfDefaultConfigurationsAndAppIdBound: false,
    softwareContractMayQualifyPhysicalOrSteamIntegration: false,
  });

  exactKeys(
    plan.authorityBoundary,
    [...authorityNullKeys, ...authorityFalseKeys],
    "authorityBoundary",
  );
  for (const key of authorityNullKeys) {
    assert.equal(plan.authorityBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of authorityFalseKeys) {
    assert.equal(plan.authorityBoundary[key], false, `${key} must remain false`);
  }

  assert.ok(Array.isArray(plan.inputRoutes));
  assert.equal(plan.inputRoutes.length, STEAMOS_STEAM_INPUT_ROUTES.length);
  for (const [index, route] of plan.inputRoutes.entries()) {
    exactKeys(route, routeKeys, `inputRoutes[${index}]`);
    assert.deepEqual(
      [
        route.routeId,
        route.routeClass,
        route.provider,
        route.steamClientRequired,
        route.mayQualifySteamNativeActions,
      ],
      STEAMOS_STEAM_INPUT_ROUTES[index],
    );
    assert.equal(route.implementationBuildSha256, null);
    assert.equal(route.routeResultSha256, null);
    assert.equal(route.implementedOrQualified, false);
  }

  assert.ok(Array.isArray(plan.controllerRoles));
  assert.equal(
    plan.controllerRoles.length,
    STEAMOS_STEAM_INPUT_CONTROLLER_ROLES.length,
  );
  for (const [index, controller] of plan.controllerRoles.entries()) {
    exactKeys(controller, controllerKeys, `controllerRoles[${index}]`);
    assert.deepEqual(
      [controller.roleId, controller.mappingExpectation],
      STEAMOS_STEAM_INPUT_CONTROLLER_ROLES[index],
    );
    for (const key of controllerKeys.slice(2, 5)) {
      assert.equal(controller[key], null, `blocked role cannot bind ${key}`);
    }
    assert.equal(controller.sampleReceivedOrQualified, false);
  }

  assert.deepEqual(plan.qualificationMatrix, {
    controllerRoleIds: STEAMOS_STEAM_INPUT_CONTROLLER_ROLES.map(([id]) => id),
    scenarioGroups: structuredClone(STEAMOS_STEAM_INPUT_SCENARIO_GROUPS),
    controllerRoleCount: 7,
    routeCount: 4,
    declaredScenarioCount: 24,
    requiredCellCount: 406,
    validCyclesPerCell: 20,
    requiredCycleCount: 8120,
    everyDeclaredRoleRouteScenarioCellMustRun: true,
    failedInvalidStoppedRetriedUnsupportedAdverseAndWorstCaseCyclesRemainVisible:
      true,
    oneControllerRouteModeTargetOrAggregateMayRescueFailure: false,
  });
  const derivedCellCount = plan.qualificationMatrix.scenarioGroups.reduce(
    (sum, group) =>
      sum
      + plan.qualificationMatrix.controllerRoleCount
        * group.routeIds.length
        * group.scenarioIds.length,
    0,
  );
  assert.equal(derivedCellCount, 406, "qualification cell arithmetic drifted");
  assert.equal(
    derivedCellCount * plan.qualificationMatrix.validCyclesPerCell,
    8120,
    "qualification cycle arithmetic drifted",
  );

  assert.deepEqual(plan.measurements, {
    requiredMetricIds: [...STEAMOS_STEAM_INPUT_METRICS],
    independentInputRecipientGlyphTextEntryAccountlessIdentityAndRecoveryOraclesRequired:
      true,
    everyScheduledCellCycleFailureUnavailableRouteAndConfigurationMustRemainVisible:
      true,
    vendorListMappingPresenceSyntheticBrowserOrOtherControllerMaySubstitutePhysicalEvidence:
      false,
  });

  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidCyclesPerCell: 20,
    maximumSteamAccountDependenciesForCoreLocalControllerOperation: 0,
    maximumSteamClientDependenciesForCoreLocalControllerOperation: 0,
    maximumManualSetupRequirementsForRecognizedStandardControllers: 0,
    maximumWrongStaleOrUnannouncedActionSetOrLayerEvents: 0,
    maximumDoubleInputDuplicateStuckOrFabricatedActions: 0,
    maximumReservedActionsDeliveredToGameOrSwallowed: 0,
    maximumUnknownControllerSemanticActionsBeforeApprovedMapping: 0,
    maximumGuessedBrandedGlyphsOrSilentGlyphMismatches: 0,
    maximumKeyboardMouseOrOperatorInterventionsInControllerOnlyPath: 0,
    maximumUnhandledTextEntryConfirmCancelOrReturnFailures: 0,
    maximumEnteredTextDiagnosticEvidenceOrFreeTextDisclosures: 0,
    maximumLegacyResultsPromotedToNativeActionIntegration: 0,
    maximumSteamIdentityAccountControllerStableIdentifierPathOrCredentialDisclosures:
      0,
    maximumUnrecoveredClientOverlayInputMappingUpdateOrFaultFailures: 0,
    maximumValidProductFailures: 0,
    everyRequiredCellMustPass: true,
    steamInputMayReplaceAccountlessBaseInput: false,
    aggregateMayRescueFailure: false,
    allOpenGatesMustBeFrozenBeforeOperation: true,
  });

  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.openAcceptance[key], null, `blocked plan cannot fix ${key}`);
  }

  assert.deepEqual(plan.dataPolicy, {
    opaqueTargetControllerRouteBuildCellCycleAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsAndRedactedCategoriesRequired: true,
    rawUsbBluetoothSteamInputOrTextEntryBuffersAllowedInRepositoryReleaseOrResult:
      false,
    enteredTypedPastedOrSuggestedTextAllowedInDiagnosticsEvidenceOrResult: false,
    namesFreeTextDeviceNamesSerialsMacsStableControllerIdsPathsOrQueryUrlsAllowed:
      false,
    steamIdsAccountsCredentialsTokensCookiesProfilesSavesEnvironmentOrArgumentValuesAllowed:
      false,
    arbitrarySteamClientSdkDriverServiceGameConsoleOrCrashMessagesAllowed: false,
    freeTextResultEvidenceAllowed: false,
    networkEgressOutsideDeclaredPackageHostedServiceAndProbeTrafficAllowed: false,
    failedInvalidStoppedRetriedUnsupportedAdverseAndWorstCaseEvidenceMustRemainVisible:
      true,
  });

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, [
    ...STEAMOS_STEAM_INPUT_BLOCKERS,
  ]);

  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "blocked",
    executedTargetManifestSha256: null,
    completedCellCount: 0,
    completedCycleCount: 0,
    controllerRouteResults: [],
    qualifiedControllerRoleIds: [],
    qualifiedInputRouteIds: [],
    nativeSteamInputActionsQualified: false,
    legacyCompatibilityQualified: false,
    accountlessBaseInputPreserved: false,
    standardsConformantCompatibilityClaimAuthorized: false,
    publishedClaims: [],
  });
}

export async function parseSteamOsSteamInputActionPlanBytes(bytes) {
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
  await validateSteamOsSteamInputActionPlan(plan);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await parseSteamOsSteamInputActionPlanBytes(
    await readFile(trackedPath),
  );
  console.log(
    `${trackedPath}: valid blocked ${plan.qualificationMatrix.requiredCellCount}-cell, ${plan.qualificationMatrix.requiredCycleCount}-cycle I-169 plan`,
  );
}
