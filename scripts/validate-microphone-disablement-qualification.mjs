import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/microphone-disablement/microphone-disablement-qualification-plan-v1.json",
);
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const MICROPHONE_DISABLEMENT_PLAN_FORMAT =
  "vcg-microphone-disablement-qualification-plan/v1";
export const MICROPHONE_DISABLEMENT_BLOCKERS = Object.freeze([
  "exact-camera-identity-and-usb-descriptors",
  "exact-target-images-builds-and-audio-stacks",
  "os-boundary-policy-implementation",
  "ordinary-user-browser-and-sandbox-harness",
  "signed-web-and-native-test-packages",
  "update-rollback-recovery-and-reset-harness",
  "valid-attempt-count-timeout-and-schedule",
  "admin-diagnostic-path-disposition",
  "audio-probe-and-data-handling-approval",
  "target-access-and-execution-schedule",
]);

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "targets",
  "requiredLayers",
  "requiredPhases",
  "executionMatrix",
  "acceptance",
  "dataPolicy",
  "diagnosticPolicy",
  "executionGate",
  "result",
];
const targetKeys = [
  "targetId",
  "operatingSystem",
  "architecture",
  "hostClass",
  "cameraIdentitySha256",
  "usbDescriptorSha256",
  "osImageSha256",
  "kernelOrBuild",
  "audioStackVersion",
  "sandboxRuntimeVersion",
  "browserVersion",
  "ordinaryUserPolicySha256",
];
const blockedTargetKeys = targetKeys.slice(4);
const expectedTargets = Object.freeze([
  ["raspberry-pi-os-arm64", "Raspberry Pi OS", "arm64", "Raspberry Pi 5 8GB"],
  ["steamos-x86_64", "SteamOS", "x86_64", "optional Steam Machine target"],
  [
    "windows-x86_64-fallback",
    "Windows fallback",
    "x86_64",
    "ordinary x86 fallback target",
  ],
]);
const expectedLayers = Object.freeze([
  {
    layerId: "usb-function-inventory",
    boundary:
      "record whether the exact bundled camera exposes an audio function without treating enumeration as capture authority",
    requiredOracle:
      "descriptor inventory is hash-bound and any audio function remains unopened by the ordinary account",
  },
  {
    layerId: "kernel-device-access",
    boundary:
      "ordinary account attempts direct platform device access through the documented kernel or Windows device interface",
    requiredOracle:
      "open or capture is denied or the capture device is unavailable before any audio buffer is returned",
  },
  {
    layerId: "system-audio-service",
    boundary:
      "ordinary account attempts capture through PipeWire, ALSA, or Windows Audio using the target-native API",
    requiredOracle:
      "no selectable or openable bundled-camera capture source returns an audio buffer",
  },
  {
    layerId: "application-sandbox",
    boundary:
      "the selected Flatpak, package sandbox, or native runtime boundary is exercised with direct device and audio-service probes",
    requiredOracle:
      "sandboxed code cannot open the microphone device, service node, or capture stream",
  },
  {
    layerId: "browser-permission",
    boundary:
      "launcher and hosted-browser contexts attempt getUserMedia audio capture after both default denial and a hostile site-level permission grant",
    requiredOracle:
      "OS and browser policy still prevent an audio track and no sample buffer is delivered",
  },
  {
    layerId: "bundled-web-package",
    boundary:
      "a signed local-web test package requests every declared and undeclared audio path through the production package lane",
    requiredOracle:
      "manifest review and runtime enforcement both deny microphone authority and no audio track or bytes are returned",
  },
  {
    layerId: "native-game-package",
    boundary:
      "a signed native test package probes platform devices, audio services, inherited handles, environment, and child processes",
    requiredOracle:
      "the runtime sandbox denies every capture route and descendants receive no audio authority or sample buffer",
  },
  {
    layerId: "launcher-tracker-account",
    boundary:
      "launcher, tracker, developer mode, and each ordinary local profile are exercised without a game",
    requiredOracle:
      "no account, profile, setting, or developer toggle can acquire or delegate microphone capture",
  },
]);
const expectedPhases = Object.freeze([
  "fresh-install-default",
  "ordinary-user-first-boot",
  "camera-hotplug-and-replug",
  "offline-restart",
  "qualified-update",
  "failed-update-rollback",
  "recovery-mode-and-return",
  "factory-reset-and-reprovision",
]);

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedDigest(bytes, label) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return createHash("sha256")
    .update(text.replaceAll("\r\n", "\n"))
    .digest("hex");
}

async function validateSourceBindings(bindings, repositoryRoot) {
  const expected = [
    ["game-permission-boundary", "docs/GAME_PERMISSION_MODEL.md"],
    ["hosted-browser-permission-boundary", "docs/HOSTED_BROWSER_SUPERVISION.md"],
    ["prototype-acceptance-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ];
  assert.equal(bindings.length, expected.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expected[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    const fromRoot = relative(repositoryRoot, absolute);
    assert.ok(fromRoot && !fromRoot.startsWith("..") && !isAbsolute(fromRoot));
    assert.equal(
      normalizedDigest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateMicrophoneDisablementQualificationPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, MICROPHONE_DISABLEMENT_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "bundled-camera-microphone-disablement-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.match(plan.claimBoundary, /^Pre-registered microphone-disablement qualification only\./u);
  assert.match(plan.claimBoundary, /No exact bundled camera/u);
  assert.match(plan.claimBoundary, /returning any audio sample buffer is a failure/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSourceBindings(plan.sourceBindings, repositoryRoot);

  assert.equal(plan.targets.length, expectedTargets.length);
  for (const [index, target] of plan.targets.entries()) {
    exactKeys(target, targetKeys, `targets[${index}]`);
    assert.deepEqual(
      [target.targetId, target.operatingSystem, target.architecture, target.hostClass],
      expectedTargets[index],
    );
    for (const key of blockedTargetKeys) {
      assert.equal(target[key], null, `blocked plan cannot populate ${key}`);
    }
  }

  assert.deepEqual(plan.requiredLayers, expectedLayers);
  for (const [index, layer] of plan.requiredLayers.entries()) {
    exactKeys(layer, ["layerId", "boundary", "requiredOracle"], `requiredLayers[${index}]`);
  }
  assert.deepEqual(plan.requiredPhases, expectedPhases);

  exactKeys(
    plan.executionMatrix,
    [
      "rule",
      "targetCount",
      "layerCount",
      "phaseCount",
      "expectedCellCount",
      "minimumValidAttemptsPerCell",
      "attemptTimeoutMs",
      "scheduleSha256",
      "probeBundleSha256",
    ],
    "executionMatrix",
  );
  assert.equal(
    plan.executionMatrix.rule,
    "full Cartesian product in target, layer, phase order with no omitted, duplicated, reordered, or aggregate-only cell",
  );
  assert.deepEqual(
    [
      plan.executionMatrix.targetCount,
      plan.executionMatrix.layerCount,
      plan.executionMatrix.phaseCount,
      plan.executionMatrix.expectedCellCount,
    ],
    [3, 8, 8, 192],
  );
  assert.equal(
    plan.executionMatrix.expectedCellCount,
    plan.targets.length * plan.requiredLayers.length * plan.requiredPhases.length,
  );
  for (const key of [
    "minimumValidAttemptsPerCell",
    "attemptTimeoutMs",
    "scheduleSha256",
    "probeBundleSha256",
  ]) {
    assert.equal(plan.executionMatrix[key], null, `blocked plan cannot populate ${key}`);
  }

  assert.deepEqual(plan.acceptance, {
    everyCellMustPass: true,
    aggregateMayRescueFailedCell: false,
    maximumOrdinaryUserCaptureSuccesses: 0,
    maximumBrowserAudioTrackSuccesses: 0,
    maximumGamePackageCaptureSuccesses: 0,
    maximumReturnedAudioBuffers: 0,
    maximumReturnedAudioBytes: 0,
    authorizationDeniedOrDeviceUnavailableRequired: true,
    silentOrMutedPcmCountsAsFailure: true,
    permissionPromptOrUiToggleAloneQualifies: false,
    endpointEnumerationAloneQualifies: false,
    updateRollbackAndRecoveryMustReapplyBeforeOrdinaryLogin: true,
    denialMustRemainVisibleWithPathFreeCode: true,
  });
  assert.deepEqual(plan.dataPolicy, {
    rawAudioRetentionAuthorized: false,
    audioSamplePersistenceAuthorized: false,
    networkEgressAuthorized: false,
    transcriptionAuthorized: false,
    voiceprintAuthorized: false,
    participantIdentifiersAllowed: false,
    freeTextAllowed: false,
    releasedEvidenceScope:
      "path-free configuration digests, denial codes, counters, timings, and zero-byte assertions only",
  });
  assert.deepEqual(plan.diagnosticPolicy, {
    adminDiagnosticPathDisposition: "unresolved",
    ordinaryUserUnlockAllowed: false,
    developerModeUnlockAllowed: false,
    gameRequestUnlockAllowed: false,
    profileSettingUnlockAllowed: false,
    separateOwnerDecisionRequired: true,
    visibleDisclosureAndIndicatorRequiredIfEnabled: true,
    temporaryProbeMayPersistAudio: false,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    targetAccessAuthorized: false,
    osPolicyMutationAuthorized: false,
    audioProbeAuthorized: false,
    purchaseAuthorized: false,
    blockerCodes: [...MICROPHONE_DISABLEMENT_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    qualifiedTargetIds: [],
    completedCellCount: 0,
    allCellsComplete: false,
  });
  return plan;
}

export async function parseMicrophoneDisablementQualificationPlanBytes(
  bytes,
  repositoryRoot = root,
) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("microphone-disablement plan must be valid UTF-8");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("microphone-disablement plan must be valid JSON");
  }
  await validateMicrophoneDisablementQualificationPlan(value, repositoryRoot);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "microphone-disablement plan must use canonical two-space JSON with one trailing newline",
  );
  return value;
}

export async function validateTrackedMicrophoneDisablementQualificationPlan() {
  return parseMicrophoneDisablementQualificationPlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedMicrophoneDisablementQualificationPlan();
  console.log(
    `microphone-disablement plan valid: targets=${plan.targets.length} layers=${plan.requiredLayers.length} phases=${plan.requiredPhases.length} cells=${plan.executionMatrix.expectedCellCount}`,
  );
}
