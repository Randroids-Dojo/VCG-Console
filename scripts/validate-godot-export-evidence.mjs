import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GODOT_EXPORT_BROWSER_PRODUCT,
  GODOT_EXPORT_CLAIM_BOUNDARY,
  GODOT_EXPORT_EVIDENCE_DATE,
  GODOT_EXPORT_EVIDENCE_FORMAT,
  GODOT_EXPORT_LIMITATIONS,
  GODOT_EXPORT_NODE_VERSION,
  GODOT_EXPORT_WSL_KERNEL,
  GODOT_EXPECTED_OUTPUT_FILES,
  GODOT_INSTALLED_TEMPLATES,
  GODOT_TEMPLATE_ARCHIVE,
  GODOT_TEMPLATE_VERSION,
  GODOT_VERSION,
} from "./generate-godot-export-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/godot/windows-x64-godot-4.7.1-export-v1.json",
);
const MAX_ARTIFACT_BYTES = 128 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const provenancePaths = Object.freeze({
  projectPath: "examples/godot-motion-game/project.godot",
  scenePath: "examples/godot-motion-game/main.tscn",
  mainScriptPath: "examples/godot-motion-game/scripts/main.gd",
  gameScriptPath: "examples/godot-motion-game/scripts/motion_game.gd",
  presetPath: "examples/godot-motion-game/export_presets.cfg",
  generatorPath: "scripts/generate-godot-export-evidence.mjs",
  validatorPath: "scripts/validate-godot-export-evidence.mjs",
});

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

export async function expectedGodotExportProvenance() {
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

function validateFiles(value, expectedPaths, path) {
  assert.ok(Array.isArray(value), `${path} must be an array`);
  assert.equal(value.length, expectedPaths.length);
  assert.deepEqual(
    value.map((file) => file.path).sort(),
    [...expectedPaths].sort(),
  );
  for (const [index, file] of value.entries()) {
    exactKeys(file, ["path", "bytes", "sha256"], `${path}[${index}]`);
    assert.ok(
      Number.isSafeInteger(file.bytes) && file.bytes > 0,
      `${path}[${index}].bytes is invalid`,
    );
    assert.match(file.sha256, SHA256_PATTERN);
  }
}

function validateOutputTotals(value, path) {
  assert.equal(value.fileCount, value.files.length, `${path}.fileCount drift`);
  assert.equal(
    value.totalBytes,
    value.files.reduce((sum, file) => sum + file.bytes, 0),
    `${path}.totalBytes drift`,
  );
}

export function validateGodotExportEvidence(value, expectedProvenance) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "retrievedAtUtc",
      "environment",
      "toolchain",
      "outputs",
      "browser",
      "disposition",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, GODOT_EXPORT_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, GODOT_EXPORT_EVIDENCE_DATE);
  assert.equal(
    value.evidenceClass,
    "windows-x64-godot-export-web-load-and-wsl-x86-boot",
  );
  assert.equal(
    value.qualification,
    "desk-export-and-load-only-not-target-qualification",
  );
  assert.ok(Number.isFinite(Date.parse(value.retrievedAtUtc)));
  assert.ok(value.retrievedAtUtc.startsWith(`${GODOT_EXPORT_EVIDENCE_DATE}T`));

  exactKeys(
    value.environment,
    [
      "producerPlatform",
      "producerArchitecture",
      "nodeVersion",
      "godotVersion",
      "godotBinaryName",
      "browserProduct",
    ],
    "artifact.environment",
  );
  assert.equal(value.environment.producerPlatform, "win32");
  assert.equal(value.environment.producerArchitecture, "x64");
  assert.equal(value.environment.nodeVersion, GODOT_EXPORT_NODE_VERSION);
  assert.equal(value.environment.godotVersion, GODOT_VERSION);
  assert.match(
    value.environment.godotBinaryName,
    /^Godot_v4\.7\.1-stable_win64_console\.exe$/u,
  );
  assert.equal(
    value.environment.browserProduct,
    GODOT_EXPORT_BROWSER_PRODUCT,
  );

  exactKeys(
    value.toolchain,
    [
      "templateVersion",
      "templateArchive",
      "installedTemplateFileCount",
      "installedTemplates",
    ],
    "artifact.toolchain",
  );
  assert.equal(value.toolchain.templateVersion, GODOT_TEMPLATE_VERSION);
  assert.deepEqual(value.toolchain.templateArchive, GODOT_TEMPLATE_ARCHIVE);
  assert.equal(
    value.toolchain.installedTemplateFileCount,
    GODOT_INSTALLED_TEMPLATES.length,
  );
  assert.deepEqual(
    value.toolchain.installedTemplates,
    GODOT_INSTALLED_TEMPLATES,
  );

  exactKeys(
    value.outputs,
    ["web", "linuxX86_64", "linuxArm64"],
    "artifact.outputs",
  );
  exactKeys(
    value.outputs.web,
    ["preset", "target", "fileCount", "totalBytes", "files"],
    "artifact.outputs.web",
  );
  assert.equal(value.outputs.web.preset, "Web");
  assert.equal(value.outputs.web.target, "wasm32-web-unthreaded");
  validateFiles(
    value.outputs.web.files,
    [
      "artifacts/godot-motion/web/index.apple-touch-icon.png",
      "artifacts/godot-motion/web/index.audio.position.worklet.js",
      "artifacts/godot-motion/web/index.audio.worklet.js",
      "artifacts/godot-motion/web/index.html",
      "artifacts/godot-motion/web/index.icon.png",
      "artifacts/godot-motion/web/index.js",
      "artifacts/godot-motion/web/index.pck",
      "artifacts/godot-motion/web/index.png",
      "artifacts/godot-motion/web/index.wasm",
    ],
    "artifact.outputs.web.files",
  );
  validateOutputTotals(value.outputs.web, "artifact.outputs.web");

  exactKeys(
    value.outputs.linuxX86_64,
    [
      "preset",
      "target",
      "elf",
      "fileCount",
      "totalBytes",
      "files",
      "boot",
    ],
    "artifact.outputs.linuxX86_64",
  );
  assert.equal(value.outputs.linuxX86_64.preset, "Linux x86_64");
  assert.equal(value.outputs.linuxX86_64.target, "linux-x86_64");
  assert.deepEqual(value.outputs.linuxX86_64.elf, {
    class: "ELF64",
    endianness: "little",
    machine: "x86-64",
    machineCode: 62,
  });
  validateFiles(
    value.outputs.linuxX86_64.files,
    [
      "artifacts/godot-motion/linux-x86_64/vcg-tiny-motion-game.pck",
      "artifacts/godot-motion/linux-x86_64/vcg-tiny-motion-game.x86_64",
    ],
    "artifact.outputs.linuxX86_64.files",
  );
  validateOutputTotals(
    value.outputs.linuxX86_64,
    "artifact.outputs.linuxX86_64",
  );
  exactKeys(
    value.outputs.linuxX86_64.boot,
    [
      "attempted",
      "environment",
      "kernel",
      "exitCode",
      "signal",
      "engineBanner",
    ],
    "artifact.outputs.linuxX86_64.boot",
  );
  assert.equal(value.outputs.linuxX86_64.boot.attempted, true);
  assert.equal(
    value.outputs.linuxX86_64.boot.environment,
    "WSL2-not-target-Linux",
  );
  assert.equal(
    value.outputs.linuxX86_64.boot.kernel,
    GODOT_EXPORT_WSL_KERNEL,
  );
  assert.equal(value.outputs.linuxX86_64.boot.exitCode, 0);
  assert.equal(value.outputs.linuxX86_64.boot.signal, null);
  assert.equal(
    value.outputs.linuxX86_64.boot.engineBanner,
    `Godot Engine v${GODOT_VERSION} - https://godotengine.org`,
  );

  exactKeys(
    value.outputs.linuxArm64,
    [
      "preset",
      "target",
      "elf",
      "fileCount",
      "totalBytes",
      "files",
      "executionAttempted",
    ],
    "artifact.outputs.linuxArm64",
  );
  assert.equal(value.outputs.linuxArm64.preset, "Linux arm64");
  assert.equal(value.outputs.linuxArm64.target, "linux-arm64");
  assert.deepEqual(value.outputs.linuxArm64.elf, {
    class: "ELF64",
    endianness: "little",
    machine: "AArch64",
    machineCode: 183,
  });
  validateFiles(
    value.outputs.linuxArm64.files,
    [
      "artifacts/godot-motion/linux-arm64/vcg-tiny-motion-game.arm64",
      "artifacts/godot-motion/linux-arm64/vcg-tiny-motion-game.pck",
    ],
    "artifact.outputs.linuxArm64.files",
  );
  validateOutputTotals(
    value.outputs.linuxArm64,
    "artifact.outputs.linuxArm64",
  );
  assert.deepEqual(
    [
      ...value.outputs.web.files,
      ...value.outputs.linuxX86_64.files,
      ...value.outputs.linuxArm64.files,
    ],
    GODOT_EXPECTED_OUTPUT_FILES,
  );
  assert.equal(value.outputs.linuxArm64.executionAttempted, false);
  const webPack = value.outputs.web.files.find((file) =>
    file.path.endsWith(".pck"),
  );
  const x86Pack = value.outputs.linuxX86_64.files.find((file) =>
    file.path.endsWith(".pck"),
  );
  const armPack = value.outputs.linuxArm64.files.find((file) =>
    file.path.endsWith(".pck"),
  );
  assert.equal(webPack.sha256, x86Pack.sha256);
  assert.equal(webPack.sha256, armPack.sha256);

  exactKeys(
    value.browser,
    [
      "browserProduct",
      "originClass",
      "path",
      "httpStatus",
      "readyMs",
      "document",
      "initial",
      "afterLeft",
      "afterJump",
      "keyboardFallbackActionCount",
      "consoleErrorCount",
      "pageErrorCount",
      "requiredAssetHttpSuccessCount",
      "requestFailureCount",
      "abortedWasmFetchCount",
    ],
    "artifact.browser",
  );
  assert.equal(
    value.browser.browserProduct,
    value.environment.browserProduct,
  );
  assert.equal(value.browser.originClass, "random-loopback-http");
  assert.equal(value.browser.path, "/index.html");
  assert.equal(value.browser.httpStatus, 200);
  assert.ok(
    Number.isFinite(value.browser.readyMs)
      && value.browser.readyMs > 0
      && value.browser.readyMs <= 20_000,
  );
  assert.deepEqual(value.browser.document, {
    title: "VCG Tiny Motion Game",
    readyState: "complete",
    canvasCount: 1,
    canvasWidth: 960,
    canvasHeight: 540,
  });
  assert.deepEqual(value.browser.initial, {
    schemaVersion: 1,
    lane: 1,
    stance: "standing",
    score: 0,
    inputSource: "waiting",
    status: "WAITING FOR PLAYER",
  });
  assert.deepEqual(value.browser.afterLeft, {
    schemaVersion: 1,
    lane: 0,
    stance: "standing",
    score: 100,
    inputSource: "controller",
    status: "CONTROLLER LEFT",
  });
  assert.deepEqual(value.browser.afterJump, {
    schemaVersion: 1,
    lane: 0,
    stance: "jumping",
    score: 200,
    inputSource: "controller",
    status: "CONTROLLER JUMP",
  });
  assert.equal(value.browser.keyboardFallbackActionCount, 2);
  assert.equal(value.browser.consoleErrorCount, 0);
  assert.equal(value.browser.pageErrorCount, 0);
  assert.equal(value.browser.requiredAssetHttpSuccessCount, 4);
  assert.equal(value.browser.requestFailureCount, 1);
  assert.equal(value.browser.abortedWasmFetchCount, 1);

  exactKeys(
    value.disposition,
    [
      "webReleaseExportProduced",
      "linuxX86_64ReleaseExportProduced",
      "linuxArm64ReleaseExportProduced",
      "webChromeLoadVerified",
      "keyboardFallbackVerified",
      "physicalGamepadVerified",
      "liveMotionBridgeNegotiationVerified",
      "linuxX86_64WslBootObserved",
      "linuxTargetQualified",
      "linuxArm64ExecutionVerified",
      "signedPackageLaunchVerified",
      "latencyQualified",
    ],
    "artifact.disposition",
  );
  assert.deepEqual(value.disposition, {
    webReleaseExportProduced: true,
    linuxX86_64ReleaseExportProduced: true,
    linuxArm64ReleaseExportProduced: true,
    webChromeLoadVerified: true,
    keyboardFallbackVerified: true,
    physicalGamepadVerified: false,
    liveMotionBridgeNegotiationVerified: false,
    linuxX86_64WslBootObserved: true,
    linuxTargetQualified: false,
    linuxArm64ExecutionVerified: false,
    signedPackageLaunchVerified: false,
    latencyQualified: false,
  });

  exactKeys(
    value.summary,
    [
      "exportCount",
      "webLoadCount",
      "keyboardFallbackActionCount",
      "physicalControllerCount",
      "participantCount",
      "motionFrameCount",
      "targetHardwareCount",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    exportCount: 3,
    webLoadCount: 1,
    keyboardFallbackActionCount: 2,
    physicalControllerCount: 0,
    participantCount: 0,
    motionFrameCount: 0,
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
  assert.equal(value.claimBoundary, GODOT_EXPORT_CLAIM_BOUNDARY);
  assert.deepEqual(value.limitations, GODOT_EXPORT_LIMITATIONS);
  return value;
}

function parseBoundedJson(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES,
    "artifact byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

export async function validateTrackedGodotExportEvidence() {
  const [bytes, expectedProvenance] = await Promise.all([
    readFile(artifactPath),
    expectedGodotExportProvenance(),
  ]);
  return validateGodotExportEvidence(
    parseBoundedJson(bytes),
    expectedProvenance,
  );
}

async function main() {
  const artifact = await validateTrackedGodotExportEvidence();
  console.log(
    `validated ${artifact.summary.exportCount} Godot exports; web ready ${artifact.browser.readyMs} ms; ARM execution=${artifact.outputs.linuxArm64.executionAttempted}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
