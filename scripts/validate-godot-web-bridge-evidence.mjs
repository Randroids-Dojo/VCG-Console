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
  GODOT_WEB_BRIDGE_CLAIM_BOUNDARY,
  GODOT_WEB_BRIDGE_EVIDENCE_DATE,
  GODOT_WEB_BRIDGE_EVIDENCE_FORMAT,
  GODOT_WEB_BRIDGE_LIMITATIONS,
} from "./generate-godot-web-bridge-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/godot/windows-x64-godot-web-bridge-v1.json",
);
const MAX_ARTIFACT_BYTES = 64 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const provenancePaths = Object.freeze({
  projectPath: "examples/godot-motion-game/project.godot",
  mainScriptPath: "examples/godot-motion-game/scripts/main.gd",
  gameScriptPath: "examples/godot-motion-game/scripts/motion_game.gd",
  bridgeScriptPath: "examples/godot-motion-game/scripts/motion_web_bridge.gd",
  presetPath: "examples/godot-motion-game/export_presets.cfg",
  hostDocumentPath: "apps/console-lab/godot-bridge-host.html",
  hostFixturePath: "apps/console-lab/src/godot-bridge-host-fixture.ts",
  hostImplementationPath: "packages/motion-web-bridge/src/host.ts",
  protocolPath: "packages/motion-web-bridge/src/protocol.ts",
  syntheticFramePath: "apps/console-lab/src/synthetic.ts",
  viteConfigPath: "apps/console-lab/vite.config.ts",
  baseEvidencePath:
    "benchmarks/godot/windows-x64-godot-4.7.1-export-v1.json",
  generatorPath: "scripts/generate-godot-web-bridge-evidence.mjs",
  validatorPath: "scripts/validate-godot-web-bridge-evidence.mjs",
});
const expectedWebFiles = GODOT_EXPECTED_OUTPUT_FILES.filter((file) =>
  file.path.startsWith("artifacts/godot-motion/web/"),
);
const expectedWebTotalBytes = expectedWebFiles.reduce(
  (sum, file) => sum + file.bytes,
  0,
);
const expectedWebPackSha256 = expectedWebFiles.find((file) =>
  file.path.endsWith(".pck"),
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

export async function expectedGodotWebBridgeProvenance() {
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

export function validateGodotWebBridgeEvidence(
  value,
  expectedProvenance,
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
  assert.equal(value.format, GODOT_WEB_BRIDGE_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, GODOT_WEB_BRIDGE_EVIDENCE_DATE);
  assert.equal(
    value.evidenceClass,
    "windows-x64-chrome-cross-origin-godot-web-motion-bridge",
  );
  assert.equal(
    value.qualification,
    "desk-live-bridge-only-not-product-qualification",
  );
  assert.ok(Number.isFinite(Date.parse(value.retrievedAtUtc)));
  assert.ok(
    value.retrievedAtUtc.startsWith(`${GODOT_WEB_BRIDGE_EVIDENCE_DATE}T`),
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
    value.baseWebBuild,
    ["fileCount", "totalBytes", "packSha256"],
    "artifact.baseWebBuild",
  );
  assert.deepEqual(value.baseWebBuild, {
    fileCount: expectedWebFiles.length,
    totalBytes: expectedWebTotalBytes,
    packSha256: expectedWebPackSha256,
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
      "bridgeProtocolVersion",
      "motionApiSchemaVersion",
      "initialHost",
      "afterFirstFrame",
      "finalHost",
      "acceptedSessionCount",
      "publishedFrameCount",
      "acknowledgedFrameCount",
      "consoleErrorCount",
      "pageErrorCount",
      "requestFailureCount",
      "abortedWasmFetchCount",
      "hostRequestCount",
      "childRequestCount",
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
    queryEmpty: true,
  });
  assert.ok(
    Number.isFinite(value.bridge.connectedMs)
      && value.bridge.connectedMs > 0
      && value.bridge.connectedMs <= 30_000,
  );
  assert.equal(value.bridge.bridgeProtocolVersion, 2);
  assert.equal(value.bridge.motionApiSchemaVersion, "0.4.0");
  assert.deepEqual(value.bridge.initialHost, {
    status: "CONNECTED",
    accepted: "1",
    active: "1",
    pending: "0",
    invalidAck: "0",
  });
  assert.deepEqual(value.bridge.afterFirstFrame, {
    schemaVersion: 1,
    lane: 1,
    stance: "standing",
    score: 0,
    inputSource: "motion",
    status: "LANDMARKS ACTIVE",
  });
  assert.deepEqual(value.bridge.finalHost, {
    status: "PUBLISHED 1 TO 1",
    accepted: "1",
    active: "1",
    pending: "0",
    invalidAck: "0",
  });
  assert.equal(value.bridge.acceptedSessionCount, 1);
  assert.equal(value.bridge.publishedFrameCount, 2);
  assert.equal(value.bridge.acknowledgedFrameCount, 2);
  assert.equal(value.bridge.consoleErrorCount, 0);
  assert.equal(value.bridge.pageErrorCount, 0);
  assert.equal(value.bridge.requestFailureCount, 0);
  assert.equal(value.bridge.abortedWasmFetchCount, 0);
  assert.ok(
    Number.isSafeInteger(value.bridge.hostRequestCount)
      && value.bridge.hostRequestCount >= 2
      && value.bridge.hostRequestCount <= 16,
  );
  assert.equal(value.bridge.childRequestCount, 7);

  exactKeys(
    value.disposition,
    [
      "distinctParentChildOriginsVerified",
      "responseInjectedExactParentOriginVerified",
      "urlParameterAuthorityUsed",
      "bridgeV2Negotiated",
      "motionApi040Negotiated",
      "syntheticCoreFramesApplied",
      "exactFrameAcknowledgementsObserved",
      "physicalControllerVerified",
      "realTrackerVerified",
      "productionHostAuthorityVerified",
      "signedPermissionAdmissionVerified",
      "targetPlatformQualified",
      "latencyQualified",
    ],
    "artifact.disposition",
  );
  assert.deepEqual(value.disposition, {
    distinctParentChildOriginsVerified: true,
    responseInjectedExactParentOriginVerified: true,
    urlParameterAuthorityUsed: false,
    bridgeV2Negotiated: true,
    motionApi040Negotiated: true,
    syntheticCoreFramesApplied: true,
    exactFrameAcknowledgementsObserved: true,
    physicalControllerVerified: false,
    realTrackerVerified: false,
    productionHostAuthorityVerified: false,
    signedPermissionAdmissionVerified: false,
    targetPlatformQualified: false,
    latencyQualified: false,
  });

  exactKeys(
    value.summary,
    [
      "acceptedSessionCount",
      "publishedFrameCount",
      "acknowledgedFrameCount",
      "motionFrameCount",
      "physicalControllerCount",
      "participantCount",
      "targetHardwareCount",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    acceptedSessionCount: 1,
    publishedFrameCount: 2,
    acknowledgedFrameCount: 2,
    motionFrameCount: 2,
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
  assert.equal(value.claimBoundary, GODOT_WEB_BRIDGE_CLAIM_BOUNDARY);
  assert.deepEqual(value.limitations, GODOT_WEB_BRIDGE_LIMITATIONS);
  return value;
}

function parseBoundedJson(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES,
    "artifact byte size is invalid",
  );
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function validateTrackedGodotWebBridgeEvidence() {
  const [bytes, expectedProvenance] = await Promise.all([
    readFile(artifactPath),
    expectedGodotWebBridgeProvenance(),
  ]);
  return validateGodotWebBridgeEvidence(
    parseBoundedJson(bytes),
    expectedProvenance,
  );
}

async function main() {
  const artifact = await validateTrackedGodotWebBridgeEvidence();
  console.log(
    `validated Godot bridge ${artifact.bridge.bridgeProtocolVersion}/Motion ${artifact.bridge.motionApiSchemaVersion}; frames=${artifact.summary.publishedFrameCount}/${artifact.summary.acknowledgedFrameCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
