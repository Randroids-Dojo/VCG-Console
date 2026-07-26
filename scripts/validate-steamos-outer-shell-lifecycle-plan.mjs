import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/steamos-shell/steamos-outer-shell-lifecycle-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const STEAMOS_OUTER_SHELL_PLAN_FORMAT =
  "vcg-steamos-outer-shell-lifecycle-plan/v1";
export const STEAMOS_OUTER_SHELL_SOURCES = Object.freeze([
  ["steam-machine-target-and-outer-shell-boundary", "docs/STEAM_MACHINE_2026.md"],
  ["product-branding-loading-and-lifecycle-boundary", "docs/RESEARCH.md"],
  [
    "boot-resume-launch-campaign",
    "docs/BOOT_RESUME_LAUNCH_TIMING_CAMPAIGN_2026-07-25.md",
  ],
  [
    "boot-resume-launch-plan",
    "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json",
  ],
  ["privileged-power-lifecycle-boundary", "docs/POWER_RECOVERY_STATE_MACHINE.md"],
  ["native-power-coordinator-boundary", "native/vcg-host/src/power.rs"],
  ["controller-and-reserved-action-boundary", "docs/CONTROLLER_INPUT.md"],
  [
    "steam-input-semantic-action-contract",
    "packages/motion-contract/src/steam-input-actions.ts",
  ],
  [
    "steam-input-campaign-plan",
    "benchmarks/steam-input/steamos-steam-input-action-plan-v1.json",
  ],
  [
    "steamos-update-safe-content-campaign",
    "docs/STEAMOS_UPDATE_SAFE_CONTENT_CAMPAIGN_2026-07-26.md",
  ],
  [
    "steamos-update-safe-content-plan",
    "benchmarks/steamos-content/steamos-update-safe-content-plan-v1.json",
  ],
  ["hosted-browser-wrapper-boundary", "docs/HOSTED_BROWSER_SUPERVISION.md"],
  [
    "launcher-tv-branding-boundary",
    "docs/LAUNCHER_TV_CONFORMANCE_EVIDENCE_2026-07-24.md",
  ],
  ["offline-service-disclosure-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
]);
export const STEAMOS_OUTER_SHELL_OFFICIAL_REFERENCES = Object.freeze([
  {
    referenceId: "valve-steam-machine-feature-guide",
    publisher: "Valve",
    url: "https://help.steampowered.com/en/faqs/view/1180-0BA6-4A75-B7CA",
    checkedAt: "2026-07-26",
    facts: [
      "stock-first-start-guides-controller-network-and-steam-login",
      "desktop-mode-is-reached-from-steam-menu-power",
      "steamos-and-hardware-updates-remain-in-steam-settings",
      "gaming-mode-is-the-stock-visible-outer-shell",
    ],
  },
  {
    referenceId: "valve-non-steam-shortcut-guide",
    publisher: "Valve",
    url: "https://help.steampowered.com/en/faqs/view/4B8B-9697-2338-40EC",
    checkedAt: "2026-07-26",
    facts: [
      "a-non-steam-entry-is-a-steam-client-shortcut",
      "the-shortcut-does-not-grant-steam-update-delivery",
      "the-shortcut-does-not-grant-steam-ownership-proof",
    ],
  },
  {
    referenceId: "valve-steamos-install-and-repair",
    publisher: "Valve",
    url: "https://help.steampowered.com/en/faqs/view/65B4-2AA3-5F37-4227",
    checkedAt: "2026-07-26",
    facts: [
      "stock-reimage-wipes-user-info-games-applications-and-operating-systems",
      "repair-attempts-to-preserve-games-and-personal-content",
      "recovery-tools-remain-a-separate-platform-owned-path",
    ],
  },
  {
    referenceId: "valve-steam-overlay-documentation",
    publisher: "Valve",
    url: "https://partner.steamgames.com/doc/features/overlay",
    checkedAt: "2026-07-26",
    facts: [
      "overlay-is-steam-ui-over-a-steam-launched-rendered-application",
      "overlay-activation-can-notify-a-game-to-pause-or-resume",
      "browser-rendering-is-not-a-supported-overlay-rendering-model-without-a-native-wrapper",
    ],
  },
]);
export const STEAMOS_OUTER_SHELL_TARGETS = Object.freeze([
  [
    "exact-steam-machine",
    "optional-delivered-steam-machine",
    "required-for-i171-qualification",
  ],
  [
    "supported-amd-steamos-proxy",
    "explicit-development-proxy-only",
    "may-exercise-harness-but-never-qualify-the-steam-machine",
  ],
]);
export const STEAMOS_OUTER_SHELL_ROUTES = Object.freeze([
  [
    "stock-gaming-mode-non-steam-shortcut",
    "valve-gaming-mode-manual-selection",
    "shortcut-only-not-steam-update-or-ownership",
  ],
  [
    "stock-desktop-mode-installed-application",
    "valve-power-menu-desktop-switch-then-desktop-launch",
    "desktop-install-and-return-to-gaming-mode-only",
  ],
  [
    "candidate-supported-automatic-vcg-entry",
    "unselected-platform-supported-method-only",
    "no-supported-method-established-by-this-plan",
  ],
]);
export const STEAMOS_OUTER_SHELL_SCENARIOS = Object.freeze([
  [
    "cold-boot-to-stock-outer-shell",
    "externally-observed-physical-power-application",
    "stock-shell-or-truthful-blocking-setup-is-controller-usable",
  ],
  [
    "route-entry-to-vcg-ready",
    "route-specific-supported-entry-action-or-platform-auto-entry-trigger",
    "vcg-home-is-visibly-branded-focused-and-controller-usable",
  ],
  [
    "branded-loading-to-local-game-interactive",
    "deliberate-controller-launch-action",
    "local-game-accepts-and-visibly-responds-to-supported-input",
  ],
  [
    "normal-game-exit-to-vcg",
    "deliberate-in-game-exit-action",
    "vcg-home-is-restored-with-one-deterministic-focus-owner",
  ],
  [
    "game-crash-or-hang-to-vcg-recovery",
    "authorized-contained-game-fault-injection",
    "truthful-recovery-screen-allows-controller-retry-details-or-exit",
  ],
  [
    "steam-overlay-open-close-focus-and-pause",
    "fresh-platform-owned-overlay-action",
    "overlay-closes-and-vcg-or-game-focus-is-restored-without-stuck-input",
  ],
  [
    "steamos-update-reboot-and-vcg-integrity",
    "authorized-stock-steamos-update-application",
    "post-update-stock-shell-and-selected-vcg-route-are-truthfully-usable-or-blocked",
  ],
  [
    "confirmed-shutdown-quiescence-and-power-off",
    "fresh-confirmed-controller-shutdown-request",
    "qualified-platform-handoff-reaches-observed-power-off-or-terminal-failure",
  ],
]);
export const STEAMOS_OUTER_SHELL_BLOCKERS = Object.freeze([
  "sol-001-exact-received-steam-machine-or-explicit-proxy-hardware-os-steam-firmware-and-display-inventory",
  "sol-002-owner-selected-product-route-and-explicit-manual-desktop-or-automatic-entry-requirement",
  "sol-003-platform-supported-automatic-entry-method-or-explicit-unsupported-disposition",
  "sol-004-qualified-i166-update-safe-package-result-and-signed-vcg-wrapper-launch-manifest",
  "sol-005-qualified-i170-accountless-core-result-kept-independent-from-steam-login",
  "sol-006-owner-approved-brand-assets-loading-state-vocabulary-copy-and-safe-area-review",
  "sol-007-i169-controller-reserved-action-glyph-overlay-pause-and-focus-integration",
  "sol-008-update-safe-install-entry-removal-rollback-repair-and-reimage-boundary",
  "sol-009-contained-game-crash-hang-descendant-reap-health-and-fresh-retry-protocol",
  "sol-010-native-power-coordinator-steamos-shutdown-adapter-and-external-power-oracle",
  "sol-011-exact-scenario-route-cycle-order-timing-gates-instruments-and-independent-review",
  "sol-012-screen-video-capture-sanitization-test-identity-retention-deletion-and-review-protocol",
  "sol-013-controller-only-tv-distance-accessibility-and-steam-vcg-owner-comprehension-protocol",
  "sol-014-target-account-service-fault-update-shutdown-capture-and-configuration-authority",
  "sol-015-adverse-evidence-incident-stop-recovery-and-no-rescue-policy",
  "sol-016-result-review-route-selection-qualification-and-publication-authority",
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
  "officialReferenceRecords",
  "targetCandidates",
  "shellRoutes",
  "routeSelectionBoundary",
  "authorityBoundary",
  "lifecycleScenarios",
  "captureMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "dataPolicy",
  "executionGate",
  "result",
];
const sourceKeys = ["role", "path", "sha256"];
const targetKeys = [
  "targetId",
  "targetClass",
  "evidenceDisposition",
  "hardwareOsSteamAndFirmwareManifestSha256",
  "receivedInventoriedAndAuthorized",
  "otherTargetEvidenceMayQualify",
];
const routeKeys = [
  "routeId",
  "entryOwnership",
  "vcgOwnership",
  "officialSupportBoundary",
  "mayClaimAutomaticEntry",
  "mayReplaceValveOuterShell",
];
const scenarioKeys = [
  "scenarioId",
  "startEvent",
  "endEvent",
  "requiredVisualStates",
  "requiredOracles",
];
const authorityKeys = [
  "exactTargetOrProxyOperationAuthorized",
  "steamAccountOrIdentityFixtureAuthorized",
  "platformOrClientConfigurationMutationAuthorized",
  "autoLaunchConfigurationAuthorized",
  "faultOrUpdateExecutionAuthorized",
  "shutdownOrPowerHandoffAuthorized",
  "screenVideoOrAudioCollectionAuthorized",
  "routeSelectionAuthorized",
  "brandApprovalGranted",
  "publicationAuthorized",
];
const openAcceptanceKeys = [
  "selectedProductRouteId",
  "exactTargetHardwareOsSteamFirmwareManifestSha256",
  "supportedAutomaticEntryMethodAndConfigurationSha256",
  "vcgApplicationWrapperPackageAndLaunchManifestSha256",
  "ownerApprovedBrandAssetAndStateVocabularySha256",
  "overlayRenderingPauseFocusAndBrowserWrapperProtocolSha256",
  "accountlessI170QualificationResultSha256",
  "crashHangRecoveryTimeGateMilliseconds",
  "updateSurvivalAndRecoveryGate",
  "shutdownQuiescenceAndHandoffTimeGateMilliseconds",
  "screenVideoCaptureSanitizationRetentionAndReviewProtocolSha256",
  "controllerOnlyAccessibilityAndTvDistanceReviewSha256",
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
  assert.equal(bindings.length, STEAMOS_OUTER_SHELL_SOURCES.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, sourceKeys, `sourceBindings[${index}]`);
    assert.deepEqual(
      [binding.role, binding.path],
      STEAMOS_OUTER_SHELL_SOURCES[index],
    );
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    const relativePath = relative(repositoryRoot, absolute);
    assert.ok(
      relativePath.length > 0
        && !relativePath.startsWith("..")
        && !isAbsolute(relativePath),
      `sourceBindings[${index}] escapes repository`,
    );
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateSteamOsOuterShellLifecyclePlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, STEAMOS_OUTER_SHELL_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "i171-steamos-outer-shell-lifecycle-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.equal(
    plan.qualificationScope,
    "prototype-vcg-branding-and-lifecycle-inside-the-steamos-outer-shell-on-one-exact-steam-machine-with-proxy-evidence-kept-development-only",
  );
  assert.equal(
    plan.claimBoundary,
    "zero-result-plan-only-no-target-operation-route-selection-auto-launch-support-brand-approval-overlay-compatibility-update-safety-shutdown-authority-video-evidence-or-i171-qualification",
  );
  assert.deepEqual(plan.sourceDigestContract, {
    algorithm: "sha256",
    textEncoding: "utf-8",
    lineEndingNormalization: "crlf-to-lf",
    bomAllowed: false,
  });
  await validateSources(plan.sourceBindings, repositoryRoot);
  assert.deepEqual(
    plan.officialReferenceRecords,
    structuredClone(STEAMOS_OUTER_SHELL_OFFICIAL_REFERENCES),
  );

  assert.equal(plan.targetCandidates.length, STEAMOS_OUTER_SHELL_TARGETS.length);
  for (const [index, target] of plan.targetCandidates.entries()) {
    exactKeys(target, targetKeys, `targetCandidates[${index}]`);
    assert.deepEqual(
      [target.targetId, target.targetClass, target.evidenceDisposition],
      STEAMOS_OUTER_SHELL_TARGETS[index],
    );
    assert.equal(target.hardwareOsSteamAndFirmwareManifestSha256, null);
    assert.equal(target.receivedInventoriedAndAuthorized, false);
    assert.equal(target.otherTargetEvidenceMayQualify, false);
  }

  assert.equal(plan.shellRoutes.length, STEAMOS_OUTER_SHELL_ROUTES.length);
  for (const [index, route] of plan.shellRoutes.entries()) {
    exactKeys(route, routeKeys, `shellRoutes[${index}]`);
    assert.deepEqual(
      [route.routeId, route.entryOwnership, route.officialSupportBoundary],
      STEAMOS_OUTER_SHELL_ROUTES[index],
    );
    assert.equal(route.vcgOwnership, "inside-launched-vcg-application-only");
    assert.equal(route.mayClaimAutomaticEntry, false);
    assert.equal(route.mayReplaceValveOuterShell, false);
  }

  assert.deepEqual(plan.routeSelectionBoundary, {
    selectedProductRouteId: null,
    manualRouteMayRescueAutomaticRoute: false,
    desktopRouteMayRescueGamingModeRoute: false,
    proxyMayRescueExactTarget: false,
    steamLoginMayRescueAccountlessCore: false,
    unsupportedMutationMayQualify: false,
  });
  exactKeys(plan.authorityBoundary, authorityKeys, "authorityBoundary");
  for (const key of authorityKeys) {
    assert.equal(plan.authorityBoundary[key], false, `${key} grants authority`);
  }

  assert.equal(
    plan.lifecycleScenarios.length,
    STEAMOS_OUTER_SHELL_SCENARIOS.length,
  );
  for (const [index, scenario] of plan.lifecycleScenarios.entries()) {
    exactKeys(scenario, scenarioKeys, `lifecycleScenarios[${index}]`);
    assert.deepEqual(
      [scenario.scenarioId, scenario.startEvent, scenario.endEvent],
      STEAMOS_OUTER_SHELL_SCENARIOS[index],
    );
    assert.ok(scenario.requiredVisualStates.length >= 3);
    assert.ok(scenario.requiredOracles.length >= 4);
    assert.equal(new Set(scenario.requiredVisualStates).size, scenario.requiredVisualStates.length);
    assert.equal(new Set(scenario.requiredOracles).size, scenario.requiredOracles.length);
  }

  assert.deepEqual(plan.captureMatrix, {
    targetCount: 2,
    routeCount: 3,
    scenarioCount: 8,
    cellCount: 48,
    cyclesPerCell: 20,
    totalCycles: 960,
    structuredEventLedgerRequiredPerCycle: true,
    representativeSanitizedVideoRequiredPerCell: true,
    failedInvalidStoppedAndRetriedCyclesRetained: true,
    targetRouteScenarioOrCycleRescueAllowed: false,
  });
  const derivedCells =
    plan.targetCandidates.length
    * plan.shellRoutes.length
    * plan.lifecycleScenarios.length;
  assert.equal(derivedCells, plan.captureMatrix.cellCount);
  assert.equal(
    derivedCells * plan.captureMatrix.cyclesPerCell,
    plan.captureMatrix.totalCycles,
  );

  assert.ok(Array.isArray(plan.measurements));
  assert.equal(plan.measurements.length, 15);
  assert.equal(new Set(plan.measurements).size, plan.measurements.length);
  for (const required of [
    "outer-shell-vcg-overlay-loading-failure-recovery-and-platform-handoff-owner-ledger",
    "overlay-open-close-pause-resume-focus-and-rendering-compatibility-results",
    "update-before-after-version-reboot-route-package-data-and-recovery-results",
    "shutdown-confirmation-quiescence-platform-handoff-power-state-and-failure-results",
    "sanitized-video-event-ledger-screenshot-and-detached-artifact-digests",
  ]) {
    assert.ok(plan.measurements.includes(required), `missing measurement ${required}`);
  }

  assert.deepEqual(plan.fixedAcceptance, {
    valveOuterShellRemainsVisibleAndTruthfullyOwned: true,
    vcgMayOwnOnlyItsApplicationSurface: true,
    vcgMayNotSpoofSteamSetupOverlayUpdateRecoveryOrShutdown: true,
    immediateBrandedFeedbackMillisecondsMaximum: 250,
    coldBootControllerUsableSecondsMaximum: 60,
    localGameInteractiveSecondsMaximum: 15,
    hostedGameInteractiveOrTruthfulProgressSecondsMaximum: 30,
    warmResumeControllerUsableSecondsMaximum: 5,
    requiredLoadingStates: [
      "preparing",
      "checking-dependency",
      "starting",
      "waiting-for-readiness",
      "recovering",
      "failed",
    ],
    controllerAccessibleEscapeActions: [
      "back-or-cancel",
      "retry",
      "details",
      "exit",
    ],
    steamHomeOverlayActionRemainsPlatformOwned: true,
    steamOverlayMayNeverBeSoleVcgRecoveryAuthority: true,
    stockUpdatesAndRecoveryMayNotBeDisabledOrMasked: true,
    accountlessCoreMayNotBeWeakenedByI171: true,
    criticalFailuresAllowedPerCell: 0,
    validCyclesRequiredPerCell: 20,
    aggregateTargetRouteScenarioOrProxyRescueAllowed: false,
  });
  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.openAcceptance[key], null, `${key} is prematurely fixed`);
  }

  assert.deepEqual(plan.dataPolicy, {
    allowed: [
      "opaque-target-route-scenario-cycle-and-artifact-identifiers",
      "monotonic-timestamps-durations-state-enums-counts-and-pass-fail-oracles",
      "software-version-package-configuration-and-detached-artifact-digests",
      "sanitized-screen-video-with-approved-opaque-test-identity-only",
    ],
    prohibited: [
      "steam-id-user-name-account-name-avatar-friends-chat-library-or-community-content",
      "credentials-tokens-session-cookies-qr-codes-email-phone-or-payment-data",
      "entered-network-account-or-recovery-text",
      "raw-camera-audio-microphone-body-profile-or-biometric-data",
      "filesystem-paths-process-command-lines-environment-values-or-free-text-notes",
      "deleted-failed-adverse-invalid-stopped-or-retried-evidence",
    ],
    networkPayloadCaptureAllowed: false,
    screenVideoCollectionAuthorized: false,
    rawMediaRetentionAllowed: false,
    publicationAuthorized: false,
  });

  exactKeys(plan.executionGate, ["state", "blockers"], "executionGate");
  assert.equal(plan.executionGate.state, "blocked");
  assert.deepEqual(plan.executionGate.blockers, [...STEAMOS_OUTER_SHELL_BLOCKERS]);
  assert.equal(plan.result, null);
}

export async function parseSteamOsOuterShellLifecyclePlanBytes(bytes) {
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
  await validateSteamOsOuterShellLifecyclePlan(plan);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await parseSteamOsOuterShellLifecyclePlanBytes(
    await readFile(trackedPath),
  );
  console.log(
    `${trackedPath}: valid blocked ${plan.captureMatrix.cellCount}-cell, ${plan.captureMatrix.totalCycles}-cycle I-171 plan`,
  );
}
