import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GODOT_EXPORT_BROWSER_PRODUCT,
  GODOT_EXPORT_NODE_VERSION,
  GODOT_EXPECTED_OUTPUT_FILES,
  GODOT_VERSION,
} from "./generate-godot-export-evidence.mjs";
import {
  GODOT_WEB_BRIDGE_EVIDENCE_FORMAT,
} from "./generate-godot-web-bridge-evidence.mjs";
import {
  GODOT_WEB_BRIDGE_RESILIENCE_CLAIM_BOUNDARY,
  GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_DATE,
  GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_FORMAT,
  GODOT_WEB_BRIDGE_RESILIENCE_LIMITATIONS,
} from "./generate-godot-web-bridge-resilience-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/godot/windows-x64-godot-web-bridge-resilience-v1.json",
);
const baseBridgeArtifactPath = resolve(
  root,
  "benchmarks/godot/windows-x64-godot-web-bridge-v1.json",
);
const MAX_ARTIFACT_BYTES = 96 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const HOST_ASSET_PATH =
  "/assets/godot-bridge-resilience-host-BwgTstbg.js";
const provenancePaths = Object.freeze({
  projectPath: "examples/godot-motion-game/project.godot",
  mainScriptPath: "examples/godot-motion-game/scripts/main.gd",
  gameScriptPath: "examples/godot-motion-game/scripts/motion_game.gd",
  bridgeScriptPath: "examples/godot-motion-game/scripts/motion_web_bridge.gd",
  hostDocumentPath:
    "apps/console-lab/godot-bridge-resilience-host.html",
  hostFixturePath:
    "apps/console-lab/src/godot-bridge-resilience-host-fixture.ts",
  hostImplementationPath: "packages/motion-web-bridge/src/host.ts",
  protocolPath: "packages/motion-web-bridge/src/protocol.ts",
  syntheticFramePath: "apps/console-lab/src/synthetic.ts",
  baseExportEvidencePath:
    "benchmarks/godot/windows-x64-godot-4.7.1-export-v1.json",
  baseBridgeEvidencePath:
    "benchmarks/godot/windows-x64-godot-web-bridge-v1.json",
  generatorPath:
    "scripts/generate-godot-web-bridge-resilience-evidence.mjs",
  validatorPath:
    "scripts/validate-godot-web-bridge-resilience-evidence.mjs",
});
const expectedWebFiles = GODOT_EXPECTED_OUTPUT_FILES.filter((file) =>
  file.path.startsWith("artifacts/godot-motion/web/")
);
const expectedWebTotalBytes = expectedWebFiles.reduce(
  (sum, file) => sum + file.bytes,
  0,
);
const expectedPackSha256 = expectedWebFiles.find((file) =>
  file.path.endsWith(".pck")
).sha256;

function exactKeys(value, expected, path) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`,
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${path} keys must be exactly ${expected.join(", ")}`,
  );
}

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function expectedGodotWebBridgeResilienceProvenance() {
  const entries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => [
      key,
      path,
      normalizedSha256(await readFile(resolve(root, path))),
    ]),
  );
  return Object.fromEntries(
    entries.flatMap(([key, path, digest]) => [
      [key, path],
      [`${key}Sha256`, digest],
    ]),
  );
}

function gameSnapshot(status, inputSource) {
  return {
    schemaVersion: 1,
    lane: 1,
    stance: "standing",
    score: 0,
    inputSource,
    status,
  };
}

function hostSnapshot({
  status,
  accepted,
  published,
  health,
}) {
  return {
    status,
    accepted: String(accepted),
    active: "1",
    peak: "1",
    pending: "0",
    published: String(published),
    health: String(health),
    invalidAck: "0",
  };
}

export function validateGodotWebBridgeResilienceEvidence(
  value,
  expectedProvenance,
  expectedBaseBridgeSha256,
) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "retrievedAtUtc",
      "environment",
      "baseBridgeEvidence",
      "baseWebBuild",
      "bridge",
      "disposition",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(
    value.format,
    GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_FORMAT,
  );
  assert.equal(
    value.evidenceDate,
    GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_DATE,
  );
  assert.equal(
    value.evidenceClass,
    "windows-x64-chrome-cross-origin-godot-web-motion-bridge-resilience",
  );
  assert.equal(
    value.qualification,
    "desk-live-resilience-only-not-product-qualification",
  );
  assert.ok(Number.isFinite(Date.parse(value.retrievedAtUtc)));
  assert.ok(
    value.retrievedAtUtc.startsWith(
      `${GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_DATE}T`,
    ),
  );

  exactKeys(
    value.environment,
    [
      "producerPlatform",
      "producerArchitecture",
      "nodeVersion",
      "browserProduct",
      "godotVersion",
    ],
    "artifact.environment",
  );
  assert.deepEqual(value.environment, {
    producerPlatform: "win32",
    producerArchitecture: "x64",
    nodeVersion: GODOT_EXPORT_NODE_VERSION,
    browserProduct: GODOT_EXPORT_BROWSER_PRODUCT,
    godotVersion: GODOT_VERSION,
  });

  exactKeys(
    value.baseBridgeEvidence,
    ["format", "sha256"],
    "artifact.baseBridgeEvidence",
  );
  assert.deepEqual(value.baseBridgeEvidence, {
    format: GODOT_WEB_BRIDGE_EVIDENCE_FORMAT,
    sha256: expectedBaseBridgeSha256,
  });
  exactKeys(
    value.baseWebBuild,
    ["fileCount", "totalBytes", "packSha256"],
    "artifact.baseWebBuild",
  );
  assert.deepEqual(value.baseWebBuild, {
    fileCount: expectedWebFiles.length,
    totalBytes: expectedWebTotalBytes,
    packSha256: expectedPackSha256,
  });

  exactKeys(
    value.bridge,
    [
      "browserProduct",
      "parentOriginClass",
      "childOriginClass",
      "originsDistinct",
      "sandboxTokens",
      "responseInjectedConfig",
      "connectedMs",
      "reloadRoundTripMs",
      "bridgeProtocolVersion",
      "motionApiSchemaVersion",
      "initialHost",
      "afterFirstFrame",
      "afterDegradedHealth",
      "afterRecoveredHealth",
      "afterSecondFrame",
      "afterReloadHost",
      "afterReloadProbe",
      "finalHost",
      "acceptedSessionCount",
      "replacementSessionCount",
      "publishedFrameCount",
      "acknowledgedFrameCount",
      "publishedHealthEventCount",
      "consoleErrorCount",
      "pageErrorCount",
      "requestFailureCount",
      "abortedWasmFetchCount",
      "requestFailures",
      "hostRequestCounts",
      "childRequestCounts",
    ],
    "artifact.bridge",
  );
  assert.equal(value.bridge.browserProduct, GODOT_EXPORT_BROWSER_PRODUCT);
  assert.equal(
    value.bridge.parentOriginClass,
    "random-loopback-ipv4-http",
  );
  assert.equal(
    value.bridge.childOriginClass,
    "random-loopback-localhost-http",
  );
  assert.equal(value.bridge.originsDistinct, true);
  assert.deepEqual(value.bridge.sandboxTokens, [
    "allow-scripts",
    "allow-same-origin",
  ]);
  assert.deepEqual(value.bridge.responseInjectedConfig, {
    matchesParentOrigin: true,
    frozen: true,
    writable: false,
    configurable: false,
    queryEmptyBeforeAndAfterReload: true,
  });
  for (const [name, duration] of [
    ["connectedMs", value.bridge.connectedMs],
    ["reloadRoundTripMs", value.bridge.reloadRoundTripMs],
  ]) {
    assert.ok(
      Number.isFinite(duration) && duration > 0 && duration <= 30_000,
      `${name} must be a bounded observation`,
    );
  }
  assert.equal(value.bridge.bridgeProtocolVersion, 2);
  assert.equal(value.bridge.motionApiSchemaVersion, "0.4.0");
  assert.deepEqual(
    value.bridge.initialHost,
    hostSnapshot({
      status: "CONNECTED",
      accepted: 1,
      published: 0,
      health: 0,
    }),
  );
  assert.deepEqual(
    value.bridge.afterFirstFrame,
    gameSnapshot("LANDMARKS ACTIVE", "motion"),
  );
  assert.deepEqual(
    value.bridge.afterDegradedHealth,
    gameSnapshot("MOTION OVERLOAD", "waiting"),
  );
  assert.deepEqual(
    value.bridge.afterRecoveredHealth,
    gameSnapshot("MOTION READY", "waiting"),
  );
  assert.deepEqual(
    value.bridge.afterSecondFrame,
    gameSnapshot("LANDMARKS ACTIVE", "motion"),
  );
  assert.deepEqual(
    value.bridge.afterReloadHost,
    hostSnapshot({
      status: "RECONNECTED",
      accepted: 2,
      published: 2,
      health: 2,
    }),
  );
  assert.deepEqual(
    value.bridge.afterReloadProbe,
    gameSnapshot("MOTION READY", "waiting"),
  );
  assert.deepEqual(
    value.bridge.finalHost,
    hostSnapshot({
      status: "PUBLISHED 2 TO 1",
      accepted: 2,
      published: 3,
      health: 2,
    }),
  );
  assert.equal(value.bridge.acceptedSessionCount, 2);
  assert.equal(value.bridge.replacementSessionCount, 1);
  assert.equal(value.bridge.publishedFrameCount, 3);
  assert.equal(value.bridge.acknowledgedFrameCount, 3);
  assert.equal(value.bridge.publishedHealthEventCount, 2);
  assert.equal(value.bridge.consoleErrorCount, 0);
  assert.equal(value.bridge.pageErrorCount, 0);
  assert.ok(
    value.bridge.requestFailureCount === 0
      || value.bridge.requestFailureCount === 1,
  );
  assert.equal(
    value.bridge.abortedWasmFetchCount,
    value.bridge.requestFailureCount,
  );
  assert.equal(
    value.bridge.requestFailures.length,
    value.bridge.requestFailureCount,
  );
  if (value.bridge.requestFailureCount === 0) {
    assert.deepEqual(value.bridge.requestFailures, []);
  } else {
    assert.deepEqual(value.bridge.requestFailures, [
      {
        path: "/index.wasm",
        resourceType: "fetch",
        error: "net::ERR_ABORTED",
      },
    ]);
  }
  exactKeys(
    value.bridge.hostRequestCounts,
    ["/godot-bridge-resilience-host.html", HOST_ASSET_PATH],
    "artifact.bridge.hostRequestCounts",
  );
  assert.deepEqual(value.bridge.hostRequestCounts, {
    [HOST_ASSET_PATH]: 1,
    "/godot-bridge-resilience-host.html": 1,
  });
  assert.deepEqual(value.bridge.childRequestCounts, {
    "/index.audio.position.worklet.js": 2,
    "/index.audio.worklet.js": 2,
    "/index.html": 2,
    "/index.js": 2,
    "/index.pck": 2,
    "/index.png": 2,
    "/index.wasm": 2,
  });

  exactKeys(
    value.disposition,
    [
      "orderedDegradedHealthApplied",
      "orderedReadyHealthRestored",
      "frameAcknowledgementsResumed",
      "sameFrameReloadReconnected",
      "priorSessionReplacedWithoutOverlap",
      "postReloadFrameAcknowledged",
      "hostileOriginNavigationVerified",
      "physicalControllerVerified",
      "realTrackerVerified",
      "productionHostAuthorityVerified",
      "signedPermissionAdmissionVerified",
      "processSuspendOrKillVerified",
      "targetPlatformQualified",
      "latencyQualified",
    ],
    "artifact.disposition",
  );
  assert.deepEqual(value.disposition, {
    orderedDegradedHealthApplied: true,
    orderedReadyHealthRestored: true,
    frameAcknowledgementsResumed: true,
    sameFrameReloadReconnected: true,
    priorSessionReplacedWithoutOverlap: true,
    postReloadFrameAcknowledged: true,
    hostileOriginNavigationVerified: false,
    physicalControllerVerified: false,
    realTrackerVerified: false,
    productionHostAuthorityVerified: false,
    signedPermissionAdmissionVerified: false,
    processSuspendOrKillVerified: false,
    targetPlatformQualified: false,
    latencyQualified: false,
  });

  exactKeys(
    value.summary,
    [
      "acceptedSessionCount",
      "replacementSessionCount",
      "publishedFrameCount",
      "acknowledgedFrameCount",
      "publishedHealthEventCount",
      "reloadCount",
      "physicalControllerCount",
      "participantCount",
      "targetHardwareCount",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    acceptedSessionCount: 2,
    replacementSessionCount: 1,
    publishedFrameCount: 3,
    acknowledgedFrameCount: 3,
    publishedHealthEventCount: 2,
    reloadCount: 1,
    physicalControllerCount: 0,
    participantCount: 0,
    targetHardwareCount: 0,
  });

  exactKeys(
    value.provenance,
    Object.keys(expectedProvenance),
    "artifact.provenance",
  );
  assert.deepEqual(value.provenance, expectedProvenance);
  for (const [key, digest] of Object.entries(value.provenance)) {
    if (key.endsWith("Sha256")) assert.match(digest, SHA256_PATTERN);
  }
  assert.equal(
    value.claimBoundary,
    GODOT_WEB_BRIDGE_RESILIENCE_CLAIM_BOUNDARY,
  );
  assert.deepEqual(
    value.limitations,
    GODOT_WEB_BRIDGE_RESILIENCE_LIMITATIONS,
  );
  return value;
}

function parseBoundedJson(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES,
    "artifact byte size is invalid",
  );
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function validateTrackedGodotWebBridgeResilienceEvidence() {
  const [bytes, expectedProvenance, baseBridgeBytes] = await Promise.all([
    readFile(artifactPath),
    expectedGodotWebBridgeResilienceProvenance(),
    readFile(baseBridgeArtifactPath),
  ]);
  return validateGodotWebBridgeResilienceEvidence(
    parseBoundedJson(bytes),
    expectedProvenance,
    sha256(baseBridgeBytes),
  );
}

async function main() {
  const artifact =
    await validateTrackedGodotWebBridgeResilienceEvidence();
  console.log(
    `validated Godot bridge resilience; sessions=${artifact.summary.acceptedSessionCount}; health=${artifact.summary.publishedHealthEventCount}; frames=${artifact.summary.publishedFrameCount}/${artifact.summary.acknowledgedFrameCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
