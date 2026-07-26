import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/pi5-hdmi-cec/pi5-hdmi-audio-cec-plan-v1.json");
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
export const PI5_HDMI_CEC_FORMAT = "vcg-pi5-hdmi-audio-cec-plan/v1";
export const PI5_HDMI_CEC_BLOCKERS = Object.freeze([
  "received-host-tv-port-cable-and-optional-receiver-identities",
  "qualified-image-kernel-compositor-display-audio-and-cec-stack",
  "edid-eld-link-physical-video-and-audio-observation-instruments",
  "room-viewing-overscan-color-channel-and-latency-protocol",
  "cec-command-policy-addressing-trace-and-fallback-oracles",
  "counterbalanced-av-and-hundred-cycle-cec-schedule",
  "frame-audio-cec-hotplug-performance-power-and-thermal-gates",
  "hardware-purchase-tv-mutation-cec-and-sustained-load-authority",
]);
const topKeys = ["format", "status", "campaignId", "observedAt", "qualificationScope", "claimBoundary", "sourceDigestContract", "sourceBindings", "targetBoundary", "displayModes", "audioRoutes", "avChecks", "cecScenarios", "schedule", "requiredMetrics", "acceptance", "selectionPolicy", "dataPolicy", "executionGate", "result"];
const targetKeys = ["hostProduct", "receivedHostAndFirmwareSha256", "imageKernelCompositorDriverSha256", "primaryTvManufacturerModelRevisionSha256", "tvFirmwareVersion", "tvPortAndSettingsSha256", "hdmiCableIdentityAndCertificationSha256", "receiverOrSoundbarIdentitySha256", "captureAndTimingInstrumentSha256", "cecAdapterAndTraceToolSha256", "roomAndViewingGeometrySha256", "workloadBundleSha256"];
const openGates = ["maximumOverscanCropPixels", "maximumMissedFrameRatio", "maximumFrameTimeP95Ms", "maximumAudioLatencyP95Ms", "maximumAudioVideoDriftMs", "maximumCecCommandP95Ms", "maximumCecWakeFailureRatio", "maximumHotPlugRecoveryMs", "minimumPoseFps", "minimumGameFps", "maximumSustainedSocTemperatureC", "maximumWallPowerW"];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}
function digest(bytes, label) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
}
async function validateSources(bindings, repositoryRoot) {
  const expected = [
    ["settings-rehearsal-boundary", "docs/DISPLAY_AUDIO_SETTINGS_REHEARSAL_2026-07-25.md"],
    ["boot-wake-timing-boundary", "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json"],
    ["browser-tv-geometry-boundary", "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json"],
    ["sustained-load-boundary", "benchmarks/pi5-thermal-acoustic/pi5-cooling-soak-plan-v1.json"],
  ];
  assert.equal(bindings.length, expected.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expected[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    assert.ok(absolute.startsWith(`${repositoryRoot}\\`) || absolute.startsWith(`${repositoryRoot}/`));
    assert.equal(digest(await readFile(absolute), binding.path), binding.sha256, `${binding.path} digest drifted`);
  }
}

export async function validatePi5HdmiAudioCecPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, PI5_HDMI_CEC_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "pi5-primary-tv-hdmi-audio-cec-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-027", "I-028"]);
  assert.match(plan.claimBoundary, /^Pre-registered Raspberry Pi 5 physical HDMI/u);
  assert.match(plan.claimBoundary, /browser screenshots and Web Audio cues are not physical HDMI evidence/u);
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.targetBoundary, targetKeys, "targetBoundary");
  assert.equal(plan.targetBoundary.hostProduct, "Raspberry Pi 5 8GB");
  for (const key of targetKeys.slice(1)) assert.equal(plan.targetBoundary[key], null, `blocked plan cannot populate ${key}`);

  const modeKeys = ["modeId", "width", "height", "refreshNumerator", "refreshDenominator", "hdr", "role", "required"];
  const modes = [
    ["safe-recovery-1280x720-60-sdr", 1280, 720, 60, 1, false, "recovery-candidate", true],
    ["baseline-1920x1080-60-sdr", 1920, 1080, 60, 1, false, "baseline-candidate", true],
    ["headroom-3840x2160-60-sdr", 3840, 2160, 60, 1, false, "headroom-candidate-not-selected", true],
  ];
  assert.equal(plan.displayModes.length, 3);
  for (const [index, mode] of plan.displayModes.entries()) {
    exactKeys(mode, modeKeys, `displayModes[${index}]`);
    assert.deepEqual(modeKeys.map((key) => mode[key]), modes[index]);
  }
  assert.deepEqual(plan.audioRoutes, [
    { routeId: "hdmi-tv-stereo-pcm-48khz", required: true, mayQualifyBaseline: true, channelCount: 2, sampleRateHz: 48000 },
    { routeId: "hdmi-receiver-or-soundbar-stereo-pcm-48khz", required: false, mayQualifyBaseline: false, channelCount: 2, sampleRateHz: 48000 },
  ]);
  assert.deepEqual(plan.avChecks, [
    "edid-and-eld-read-repeatability", "requested-applied-observed-and-physically-confirmed-mode",
    "safe-area-overscan-and-visible-edge-pattern", "frame-pacing-refresh-and-sustained-load-stability",
    "left-right-channel-identity-silence-clipping-and-dropout", "audio-video-latency-drift-and-lip-sync",
    "hot-plug-unplug-reconnect-and-safe-fallback", "idle-blank-wake-and-route-restoration",
  ]);
  const cecIds = ["cold-boot-active-source-and-tv-power-on", "launcher-idle-cec-wake", "tv-standby-notification-and-console-policy", "active-source-input-switch-request", "external-source-steal-and-return", "volume-up-down-and-mute", "cec-bus-unavailable-or-malformed", "hdmi-hot-plug-logical-address-reacquire", "receiver-in-path-power-input-volume", "restart-update-and-power-loss-recovery"];
  assert.deepEqual(plan.cecScenarios.map((scenario) => scenario.scenarioId), cecIds);
  for (const [index, scenario] of plan.cecScenarios.entries()) {
    exactKeys(scenario, ["scenarioId", "requiredOutcome"], `cecScenarios[${index}]`);
    assert.ok(scenario.requiredOutcome.length >= 70);
  }
  assert.deepEqual(plan.schedule, {
    displayModeCount: 3, audioRouteCount: 2, avCheckCount: 8, allAvCellCount: 48,
    requiredDirectTvAvCellCount: 24, cecScenarioCount: 10,
    validTrialsPerRequiredAvCell: 20, validCyclesPerCecScenario: 100,
    minimumSustainedSecondsPerModeRoute: 3600, counterbalancedOrder: true,
    invalidHarnessTrialsRetainedAndRerun: true, productFailuresMayBeReplaced: false,
    scheduleSha256: null, operatorProtocolSha256: null, physicalObservationProtocolSha256: null,
  });
  assert.equal(plan.requiredMetrics.length, 11);
  assert.equal(new Set(plan.requiredMetrics).size, 11);

  exactKeys(plan.acceptance, ["maximumWarmWakeToUsableMs", "maximumExposureToActionP95Ms", "maximumUnrecoveredModeOrAudioFailures", "maximumCecCommandLoopsOrRunawayRepeats", "maximumFalseCecSuccessClaims", "maximumLostControllerRecoveryPaths", "maximumUnexpectedAudioDropouts", "maximumUnexpectedVideoBlankingEvents", ...openGates, "everyRequiredAvCellAndCecScenarioMustPass", "aggregateMayRescueFailedCell", "edidOrCompositorStateMayEstablishPhysicalDisplay", "webAudioPlaybackMayEstablishPhysicalAudio", "browserViewportMayEstablishHdmiModeOrOverscan", "optionalReceiverMayRescueDirectTvFailure"], "acceptance");
  assert.deepEqual([
    plan.acceptance.maximumWarmWakeToUsableMs, plan.acceptance.maximumExposureToActionP95Ms,
    plan.acceptance.maximumUnrecoveredModeOrAudioFailures, plan.acceptance.maximumCecCommandLoopsOrRunawayRepeats,
    plan.acceptance.maximumFalseCecSuccessClaims, plan.acceptance.maximumLostControllerRecoveryPaths,
    plan.acceptance.maximumUnexpectedAudioDropouts, plan.acceptance.maximumUnexpectedVideoBlankingEvents,
  ], [5000, 120, 0, 0, 0, 0, 0, 0]);
  for (const key of openGates) assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  assert.equal(plan.acceptance.everyRequiredAvCellAndCecScenarioMustPass, true);
  for (const key of ["aggregateMayRescueFailedCell", "edidOrCompositorStateMayEstablishPhysicalDisplay", "webAudioPlaybackMayEstablishPhysicalAudio", "browserViewportMayEstablishHdmiModeOrOverscan", "optionalReceiverMayRescueDirectTvFailure"]) assert.equal(plan.acceptance[key], false);
  assert.deepEqual(plan.selectionPolicy, { selectedDisplayModeId: null, selectedAudioRouteId: null, selectedCecPolicySha256: null, automaticSelectionAllowed: false, hdrAuthorized: false, surroundAudioAuthorized: false, safeRecoveryModeMustRemainControllerOperable: true, unsupportedCecMustRetainPhysicalAndControllerFallbacks: true });
  assert.deepEqual(plan.dataPolicy, { rawFramesVideoOrAudioRecordingAuthorized: false, edidEldAndCecTraceAuthorized: false, stableTvReceiverOrCableSerialsAllowed: false, participantIdentifiersAllowed: false, freeTextAllowed: false, saltedPerCampaignEquipmentAliasesAllowed: true, aggregateTelemetryReleaseOnly: true });
  assert.deepEqual(plan.executionGate, { status: "blocked", hardwareAccessAuthorized: false, purchaseAuthorized: false, tvPowerInputVolumeOrMuteMutationAuthorized: false, displayModeOrAudioRouteMutationAuthorized: false, cecTransmissionAuthorized: false, sustainedLoadAuthorized: false, blockerCodes: [...PI5_HDMI_CEC_BLOCKERS] });
  assert.deepEqual(plan.result, { artifactPath: null, sha256: null, disposition: "not-run", completedRequiredAvCells: 0, completedCecCycles: 0, qualifiedDisplayModeIds: [], qualifiedAudioRouteIds: [], qualifiedCecScenarioIds: [], selectedDisplayModeId: null, selectedAudioRouteId: null });
  return plan;
}

export async function parsePi5HdmiAudioCecPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Pi 5 HDMI/CEC plan must be valid UTF-8"); }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error("Pi 5 HDMI/CEC plan must be valid JSON"); }
  await validatePi5HdmiAudioCecPlan(value, repositoryRoot);
  assert.equal(text, `${JSON.stringify(value, null, 2)}\n`, "Pi 5 HDMI/CEC plan must use canonical two-space JSON with one trailing newline");
  return value;
}
export async function validateTrackedPi5HdmiAudioCecPlan() { return parsePi5HdmiAudioCecPlanBytes(await readFile(trackedPath)); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedPi5HdmiAudioCecPlan();
  console.log(`Pi 5 HDMI/CEC plan valid: modes=${plan.displayModes.length} requiredAvCells=${plan.schedule.requiredDirectTvAvCellCount} cecCycles=${plan.schedule.cecScenarioCount * plan.schedule.validCyclesPerCecScenario}`);
}
