import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const CONTROLLER_QUALIFICATION_FORMAT =
  "vcg-controller-lifecycle-qualification-plan/v1";
export const CONTROLLER_QUALIFICATION_BLOCKERS = Object.freeze([
  "exact-controller-sample-set-loan-and-purchase-authority-q227",
  "guided-ambiguous-mapping-scope-q228",
  "player-assignment-and-reassignment-ceremony-q229",
  "reserved-action-response-budgets-q230",
  "battery-support-sources-and-freshness-q231",
  "campaign-repetitions-and-compatibility-claim-q232",
  "exact-required-target-sdl-mapping-compositor-runtime-and-topology-tuples",
  "physical-device-target-and-fault-execution-authority",
  "privileged-compositor-owned-home-back-and-pause-routing",
  "controller-roster-assignment-guided-mapping-glyph-and-battery-ui",
  "applicability-matrix-schedule-harness-oracles-and-ledger-schema",
  "complete-cycle-ledger-and-per-target-compatibility-report",
]);

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "targetPolicy",
  "targets",
  "controllerSamplePolicy",
  "controllerSamples",
  "scenarioGroups",
  "runProtocol",
  "requiredMetrics",
  "acceptance",
  "dataPolicy",
  "authority",
  "executionGate",
  "result",
];

const expectedSources = [
  [
    "controller-protocol-boundary",
    "docs/CONTROLLER_QUALIFICATION_PROTOCOL_2026-07-24.md",
  ],
  ["mapping-contract-boundary", "docs/CONTROLLER_MAPPING_CONTRACT.md"],
  ["browser-adapter-boundary", "apps/console-lab/src/gamepad-router.ts"],
  [
    "canonical-mapping-boundary",
    "packages/motion-contract/src/controller-mapping.ts",
  ],
  ["idle-wake-policy-boundary", "apps/console-lab/src/launcher/power-lifecycle.ts"],
  [
    "timing-campaign-boundary",
    "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json",
  ],
  [
    "ordinary-x86-target-boundary",
    "benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json",
  ],
  ["pi-target-boundary", "benchmarks/pi-image/pi5-hailo-image-plan-v1.json"],
];

const targetNullKeys = [
  "hardwareManifestSha256",
  "operatingSystemManifestSha256",
  "sdlBuildSha256",
  "mappingDatabaseSha256",
  "compositorManifestSha256",
  "browserManifestSha256",
  "nativeHostBuildSha256",
  "retroRuntimeManifestSha256",
  "sampleGameManifestSha256",
  "usbRadioTopologySha256",
  "harnessManifestSha256",
  "clockCalibrationSha256",
  "focusFaultInjectorSha256",
];

const expectedTargets = [
  ["ordinary-x86-linux-premium", "common-premium-required", true],
  ["pi5-hailo26-reference", "lower-cost-reference-required", true],
  ["steam-machine-optional", "later-optional-compatibility", false],
];

const expectedSamples = [
  [
    "first-party-standard",
    "first-party-standard",
    "required-baseline",
    "trusted-standard",
    "must-pass",
  ],
  [
    "second-vendor-standard",
    "second-vendor-standard",
    "required-baseline",
    "trusted-standard",
    "must-pass",
  ],
  [
    "receiver-2.4ghz-if-claimed",
    "receiver-2.4ghz-if-claimed",
    "required-only-if-2.4ghz-support-is-claimed",
    "trusted-or-explicitly-unsupported",
    "must-pass-if-claimed-otherwise-visible-unsupported",
  ],
  [
    "generic-ambiguous",
    "generic-ambiguous",
    "required-fail-closed-baseline",
    "ambiguous-zero-semantic-authority",
    "must-fail-closed-or-pass-approved-guided-mapping",
  ],
  [
    "simultaneous-cross-vendor-pair",
    "simultaneous-cross-vendor-pair",
    "required-baseline",
    "two-distinct-trusted-standard-devices",
    "must-pass",
  ],
];

const expectedGroups = [
  [
    "discovery-and-hotplug",
    [
      "first-party-standard",
      "second-vendor-standard",
      "receiver-2.4ghz-if-claimed",
      "generic-ambiguous",
      "simultaneous-cross-vendor-pair",
    ],
    [
      "attached-before-cold-boot",
      "attach-at-launcher-idle",
      "attach-during-hosted-loading",
      "attach-during-native-loading",
      "attach-during-retro-loading",
      "attach-with-console-overlay-open",
      "reconcile-connection-without-backend-event",
    ],
  ],
  [
    "disconnect-reconnect-and-replacement",
    [
      "first-party-standard",
      "second-vendor-standard",
      "receiver-2.4ghz-if-claimed",
      "generic-ambiguous",
      "simultaneous-cross-vendor-pair",
    ],
    [
      "disconnect-while-neutral",
      "disconnect-each-canonical-action-held",
      "same-device-reconnect-same-slot",
      "same-device-reconnect-different-slot",
      "different-device-replaces-old-slot",
      "receiver-present-controller-sleep-wake",
      "backend-restart-while-control-held",
    ],
  ],
  [
    "sleep-suspend-wake-and-radio",
    [
      "first-party-standard",
      "second-vendor-standard",
      "receiver-2.4ghz-if-claimed",
      "generic-ambiguous",
      "simultaneous-cross-vendor-pair",
    ],
    [
      "controller-sleep-and-wake",
      "console-suspend-and-resume",
      "launcher-idle-and-wake",
      "bluetooth-service-restart",
      "usb-reset",
      "radio-coexistence-load",
    ],
  ],
  [
    "simultaneous-devices-and-assignment",
    ["simultaneous-cross-vendor-pair"],
    [
      "two-devices-attached-before-boot",
      "two-devices-attached-in-both-orders",
      "simultaneous-button-completion",
      "either-device-disconnect-reconnect",
      "replacement-in-one-slot",
      "player-assignment-correction-and-reassignment",
      "ambiguous-device-beside-standard-device",
      "pause-from-one-while-other-holds-gameplay",
    ],
  ],
  [
    "ambiguous-mapping",
    ["generic-ambiguous"],
    [
      "initial-zero-semantic-authority",
      "home-back-pause-not-guessed",
      "visible-unsupported-explanation",
      "guided-mapping-reserves-console-actions",
      "conflicting-duplicate-incomplete-mapping-denied",
      "cancelled-stale-or-replaced-mapping-denied",
      "generic-glyphs-without-branded-invention",
    ],
  ],
  [
    "reserved-actions-under-hostile-focus",
    [
      "first-party-standard",
      "second-vendor-standard",
      "receiver-2.4ghz-if-claimed",
      "simultaneous-cross-vendor-pair",
    ],
    [
      "pointer-lock-and-fullscreen",
      "focused-and-unfocused-windows",
      "hung-renderer-and-busy-system",
      "rapid-overlay-open-close",
      "game-crash-and-descendant-survival-attempt",
      "high-rate-ordinary-input",
      "game-read-or-suppress-reserved-actions",
      "compositor-and-service-restart",
    ],
  ],
  [
    "battery-and-power-reporting",
    [
      "first-party-standard",
      "second-vendor-standard",
      "receiver-2.4ghz-if-claimed",
      "generic-ambiguous",
    ],
    [
      "battery-charging",
      "battery-full",
      "battery-medium",
      "battery-low",
      "battery-critical",
      "battery-unavailable",
      "battery-stale",
      "battery-disconnect-and-replacement",
    ],
  ],
];

const expectedMetrics = [
  "connection and disconnection event count, ordering, source and monotonic timestamps",
  "opaque session-local controller identity and connection-epoch transitions",
  "detection, reconnect and first-usable-input latency distributions",
  "every canonical press and release edge plus exact recipient",
  "player assignment before and after every lifecycle transition",
  "mapping confidence, mapping revision and zero-authority ambiguous state",
  "held actions before fault and synthesized releases to the original recipient",
  "console Home, Back and Pause delivery plus proof of zero game delivery",
  "battery state, source, freshness, units and explicit unavailable or stale disposition",
  "controller-only recovery path and any keyboard, mouse or operator intervention",
  "harness validity, closed failure code and every retry without deleting the original attempt",
  "exact target, SDL, mapping database, compositor, runtime, device, transport, firmware, harness, schedule and evidence digests",
];

const openAcceptanceKeys = [
  "maximumDetectionP95Ms",
  "maximumReconnectP95Ms",
  "maximumReservedActionP95Ms",
  "maximumReservedActionP99Ms",
  "maximumReservedActionWorstMs",
  "maximumBatteryFreshnessMs",
  "minimumPhysicalSamplesPerModelRevision",
];

function exactKeys(value, expected, label) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedDigest(bytes, label) {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(source), `${label} has bare CR`);
  return createHash("sha256")
    .update(source.replaceAll("\r\n", "\n"))
    .digest("hex");
}

async function validateSourceBindings(bindings, repositoryRoot) {
  assert.equal(bindings.length, expectedSources.length);
  const paths = new Set();
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expectedSources[index]);
    assert.match(binding.sha256, SHA256);
    assert.ok(!paths.has(binding.path), `${binding.path} is duplicated`);
    paths.add(binding.path);
    const absolute = resolve(repositoryRoot, binding.path);
    const repositoryRelative = relative(repositoryRoot, absolute);
    assert.ok(
      repositoryRelative.length > 0 &&
        !repositoryRelative.startsWith("..") &&
        !isAbsolute(repositoryRelative),
      `${binding.path} must remain inside the repository`,
    );
    assert.equal(
      normalizedDigest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateControllerQualificationPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, CONTROLLER_QUALIFICATION_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-controller-lifecycle-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.match(plan.claimBoundary, /^Pre-registered controller lifecycle/u);
  assert.match(plan.claimBoundary, /Windows, WSL2, SDL database entries/u);
  assert.match(plan.claimBoundary, /do not establish physical controller compatibility/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSourceBindings(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.targetPolicy, {
    requiredTargetIds: ["ordinary-x86-linux-premium", "pi5-hailo26-reference"],
    optionalTargetIds: ["steam-machine-optional"],
    windowsMayQualifyRequiredLinuxTarget: false,
    wsl2MayQualifyRequiredLinuxTarget: false,
    optionalTargetMayRescueRequiredTarget: false,
    browserAdapterMayQualifyNativeInput: false,
    policyModelMayQualifyPhysicalRouting: false,
  });

  assert.equal(plan.targets.length, expectedTargets.length);
  const targetIds = new Set();
  for (const [index, target] of plan.targets.entries()) {
    exactKeys(
      target,
      ["targetId", "role", "requiredForCommonComparison", ...targetNullKeys],
      `targets[${index}]`,
    );
    assert.deepEqual(
      [target.targetId, target.role, target.requiredForCommonComparison],
      expectedTargets[index],
    );
    assert.ok(!targetIds.has(target.targetId), `${target.targetId} is duplicated`);
    targetIds.add(target.targetId);
    for (const key of targetNullKeys) {
      assert.equal(target[key], null, `blocked target cannot populate ${key}`);
    }
  }

  assert.deepEqual(plan.controllerSamplePolicy, {
    requiredRoles: [
      "first-party-standard",
      "second-vendor-standard",
      "generic-ambiguous",
      "simultaneous-cross-vendor-pair",
    ],
    conditionalRoles: ["receiver-2.4ghz-if-claimed"],
    exactSampleSetDecision: "Q-227",
    wiredAndWirelessAreSeparateConfigurations: true,
    materialFirmwareAndHardwareRevisionsAreSeparate: true,
    familyResemblanceMayEstablishSupport: false,
    mappingDatabaseEntryMayEstablishSupport: false,
    oneSuccessfulConnectionMayEstablishSupport: false,
    durableHardwareIdentifierMayAssignPlayer: false,
  });

  assert.equal(plan.controllerSamples.length, expectedSamples.length);
  const roles = new Set();
  for (const [index, sample] of plan.controllerSamples.entries()) {
    exactKeys(
      sample,
      [
        "sampleId",
        "role",
        "claimCondition",
        "mappingExpectation",
        "expectedDisposition",
        "deviceManifestSha256s",
        "transportModes",
        "physicalSampleCount",
        "mappingManifestSha256",
      ],
      `controllerSamples[${index}]`,
    );
    assert.deepEqual(
      [
        sample.sampleId,
        sample.role,
        sample.claimCondition,
        sample.mappingExpectation,
        sample.expectedDisposition,
      ],
      expectedSamples[index],
    );
    assert.ok(!roles.has(sample.role), `${sample.role} is duplicated`);
    roles.add(sample.role);
    assert.deepEqual(sample.deviceManifestSha256s, []);
    assert.deepEqual(sample.transportModes, []);
    assert.equal(sample.physicalSampleCount, null);
    assert.equal(sample.mappingManifestSha256, null);
  }

  assert.equal(plan.scenarioGroups.length, expectedGroups.length);
  const groupIds = new Set();
  const scenarioIds = new Set();
  for (const [index, group] of plan.scenarioGroups.entries()) {
    exactKeys(
      group,
      [
        "groupId",
        "applicableRoles",
        "scenarioIds",
        "requiredValidCyclesPerApplicableCell",
      ],
      `scenarioGroups[${index}]`,
    );
    const [groupId, applicableRoles, expectedScenarioIds] = expectedGroups[index];
    assert.equal(group.groupId, groupId);
    assert.deepEqual(group.applicableRoles, applicableRoles);
    assert.deepEqual(group.scenarioIds, expectedScenarioIds);
    assert.equal(group.requiredValidCyclesPerApplicableCell, 20);
    assert.ok(!groupIds.has(group.groupId), `${group.groupId} is duplicated`);
    groupIds.add(group.groupId);
    for (const role of group.applicableRoles) assert.ok(roles.has(role));
    for (const scenarioId of group.scenarioIds) {
      assert.ok(!scenarioIds.has(scenarioId), `${scenarioId} is duplicated`);
      scenarioIds.add(scenarioId);
    }
  }

  assert.deepEqual(plan.runProtocol, {
    declaredScenarioCount: 51,
    minimumValidCyclesPerApplicableCell: 20,
    requiredCellCount: null,
    requiredScheduledValidCycles: null,
    invalidHarnessCycleCountsAsPass: false,
    invalidHarnessCycleMustBeRerun: true,
    failedProductCycleMayBeReplaced: false,
    allAttemptsFailuresInvalidsAndRetriesPublished: true,
    oneTransportModeMayRescueAnother: false,
    oneFirmwareOrRevisionMayRescueAnother: false,
    oneTargetMayRescueAnother: false,
    applicabilityMatrixSha256: null,
    cycleScheduleSha256: null,
    operatorProtocolSha256: null,
    eventLedgerSchemaSha256: null,
    instrumentCalibrationSha256: null,
  });
  assert.equal(plan.runProtocol.declaredScenarioCount, scenarioIds.size);
  assert.deepEqual(plan.requiredMetrics, expectedMetrics);
  assert.equal(new Set(plan.requiredMetrics).size, expectedMetrics.length);

  exactKeys(
    plan.acceptance,
    [
      "minimumValidCyclesPerApplicableCell",
      "maximumLifecycleTransitionFailures",
      "maximumStuckOrFabricatedActions",
      "maximumReservedActionsDeliveredToGame",
      "maximumSwallowedReservedActions",
      "maximumAmbiguousSemanticActionsBeforeApprovedMapping",
      "maximumWrongOrSilentPlayerAssignments",
      "maximumOldEpochActions",
      "maximumFalseBatteryClaims",
      "maximumKeyboardOrMouseRecoveriesInClaimedControllerOnlyPath",
      ...openAcceptanceKeys,
      "everyApplicableCellMustPass",
      "aggregateMayRescueFailedCell",
      "unsupportedOrAmbiguousStateMayCountAsCompatibility",
      "browserOrSyntheticEvidenceMayQualifyPhysicalDevice",
      "gameFocusMayOwnHomeBackOrPause",
      "batteryStateMayBeInferred",
      "durableDeviceIdentityMayAssignPlayer",
    ],
    "acceptance",
  );
  assert.equal(plan.acceptance.minimumValidCyclesPerApplicableCell, 20);
  for (const key of [
    "maximumLifecycleTransitionFailures",
    "maximumStuckOrFabricatedActions",
    "maximumReservedActionsDeliveredToGame",
    "maximumSwallowedReservedActions",
    "maximumAmbiguousSemanticActionsBeforeApprovedMapping",
    "maximumWrongOrSilentPlayerAssignments",
    "maximumOldEpochActions",
    "maximumFalseBatteryClaims",
    "maximumKeyboardOrMouseRecoveriesInClaimedControllerOnlyPath",
  ]) assert.equal(plan.acceptance[key], 0);
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  }
  assert.equal(plan.acceptance.everyApplicableCellMustPass, true);
  for (const key of [
    "aggregateMayRescueFailedCell",
    "unsupportedOrAmbiguousStateMayCountAsCompatibility",
    "browserOrSyntheticEvidenceMayQualifyPhysicalDevice",
    "gameFocusMayOwnHomeBackOrPause",
    "batteryStateMayBeInferred",
    "durableDeviceIdentityMayAssignPlayer",
  ]) assert.equal(plan.acceptance[key], false);

  assert.deepEqual(plan.dataPolicy, {
    rawUsbOrBluetoothDescriptorsAuthorized: false,
    serialNumbersAuthorized: false,
    macAddressesAuthorized: false,
    usernamesAuthorized: false,
    filesystemPathsAuthorized: false,
    freeTextDeviceNamesAuthorized: false,
    unplannedRawControllerInputAuthorized: false,
    gameplaySaveOrProfileContentAuthorized: false,
    stableDeviceIdentifiersAllowedInTrackedLedger: false,
    opaqueSessionLocalIdentifiersAllowed: true,
    closedEventCodesAllowed: true,
    exactManifestDigestsAllowed: true,
  });
  assert.deepEqual(plan.authority, {
    readOnlyRepositoryPlanningAuthorized: true,
    targetHardwareAccessAuthorized: false,
    controllerLoanAuthorized: false,
    controllerPurchaseAuthorized: false,
    physicalControllerExecutionAuthorized: false,
    bluetoothOrUsbServiceFaultAuthorized: false,
    compositorOrProcessFaultAuthorized: false,
    mappingPersistenceMutationAuthorized: false,
    participantCollectionAuthorized: false,
    diagnosticRetentionAuthorized: false,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    blockerCodes: [...CONTROLLER_QUALIFICATION_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    requiredCellCount: null,
    scheduledValidCycles: null,
    completedValidCycles: 0,
    passedRequiredCells: [],
    qualifiedTargetControllerConfigurations: [],
    compatibilityClaimAuthorized: false,
  });
  return plan;
}

export async function parseControllerQualificationPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Controller qualification plan must be valid UTF-8");
  }
  let plan;
  try {
    plan = JSON.parse(source);
  } catch {
    throw new Error("Controller qualification plan must be valid JSON");
  }
  await validateControllerQualificationPlan(plan, repositoryRoot);
  assert.equal(
    source,
    `${JSON.stringify(plan, null, 2)}\n`,
    "Controller qualification plan must use canonical two-space JSON with one trailing newline",
  );
  return plan;
}

export async function validateTrackedControllerQualificationPlan() {
  return parseControllerQualificationPlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedControllerQualificationPlan();
  console.log(
    `Controller qualification plan valid: targets=${plan.targets.length} samples=${plan.controllerSamples.length} scenarios=${plan.runProtocol.declaredScenarioCount} blockers=${plan.executionGate.blockerCodes.length}`,
  );
}
