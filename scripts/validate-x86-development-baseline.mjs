import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultBundleDirectory = resolve(repositoryRoot, "benchmarks", "x86-development");

export async function validateBaselineBundle(bundle, root = repositoryRoot) {
  requireRecord(bundle, "bundle");
  requireExactKeys(
    bundle,
    [
      "format",
      "formatVersion",
      "assembledAt",
      "role",
      "hostCapture",
      "evidence",
      "claimBoundary",
      "limitations",
    ],
    "bundle",
  );
  requireEqual(bundle.format, "vcg-x86-development-baseline-bundle", "format");
  requireEqual(bundle.formatVersion, 1, "formatVersion");
  requireIsoDate(bundle.assembledAt, "assembledAt");
  requireEqual(bundle.role, "x86-64-development-host", "role");
  validateHostCapture(bundle.hostCapture);
  validateClaimBoundary(bundle.claimBoundary);

  if (!Array.isArray(bundle.limitations) || bundle.limitations.length < 6) {
    throw new Error("limitations must contain at least six explicit entries");
  }
  bundle.limitations.forEach((value, index) => requireString(value, `limitations[${index}]`));

  if (!Array.isArray(bundle.evidence) || bundle.evidence.length < 3) {
    throw new Error("evidence must contain a host report and Windows plus WSL2 benchmarks");
  }

  const seenPaths = new Set();
  let hostReports = 0;
  let windowsReports = 0;
  let wslReports = 0;
  for (const [index, item] of bundle.evidence.entries()) {
    const name = `evidence[${index}]`;
    requireRecord(item, name);
    requireExactKeys(item, ["kind", "repositoryPath", "bytes", "sha256", "expect"], name);
    if (!["sanitized-host-report", "transport-benchmark"].includes(item.kind)) {
      throw new Error(`${name}.kind is unsupported`);
    }
    requireRepositoryPath(item.repositoryPath, `${name}.repositoryPath`);
    requireInteger(item.bytes, 1, 100_000_000, `${name}.bytes`);
    if (!/^[0-9a-f]{64}$/.test(item.sha256)) {
      throw new Error(`${name}.sha256 must be lowercase SHA-256 text`);
    }
    if (seenPaths.has(item.repositoryPath)) {
      throw new Error(`${name}.repositoryPath is duplicated`);
    }
    seenPaths.add(item.repositoryPath);

    const absolutePath = resolve(root, ...item.repositoryPath.split("/"));
    const rootRelative = relative(root, absolutePath);
    if (
      rootRelative === ".." ||
      rootRelative.startsWith(`..${sep}`) ||
      isAbsolute(rootRelative)
    ) {
      throw new Error(`${name}.repositoryPath escapes the repository`);
    }
    const bytes = await readFile(absolutePath);
    requireEqual(bytes.byteLength, item.bytes, `${name}.bytes`);
    const digest = createHash("sha256").update(bytes).digest("hex");
    requireEqual(digest, item.sha256, `${name}.sha256`);

    if (item.kind === "sanitized-host-report") {
      hostReports += 1;
      requireRecord(item.expect, `${name}.expect`);
      requireExactKeys(item.expect, ["format"], `${name}.expect`);
      requireEqual(item.expect.format, "markdown", `${name}.expect.format`);
      if (!item.repositoryPath.startsWith("docs/") || !item.repositoryPath.endsWith(".md")) {
        throw new Error(`${name} must bind a tracked Markdown report under docs/`);
      }
      continue;
    }

    const report = parseJson(bytes, item.repositoryPath);
    validateTransportExpectation(report, item.expect, `${name}.expect`);
    if (report.environment.platform === "win32") windowsReports += 1;
    if (report.environment.environmentKind === "wsl2") wslReports += 1;
  }

  requireEqual(hostReports, 1, "sanitized host report count");
  if (windowsReports < 1) throw new Error("evidence requires at least one Windows benchmark");
  if (wslReports < 1) throw new Error("evidence requires at least one WSL2 benchmark");
}

export function validateHostCapture(capture) {
  requireRecord(capture, "hostCapture");
  requireExactKeys(
    capture,
    [
      "format",
      "formatVersion",
      "capturedAt",
      "sourceCommit",
      "workingTreeClean",
      "inventory",
      "runtimes",
      "virtualizedLinux",
      "privacy",
    ],
    "hostCapture",
  );
  requireEqual(capture.format, "vcg-x86-development-host-capture", "hostCapture.format");
  requireEqual(capture.formatVersion, 1, "hostCapture.formatVersion");
  requireIsoDate(capture.capturedAt, "hostCapture.capturedAt");
  if (!/^[0-9a-f]{40}$/.test(capture.sourceCommit)) {
    throw new Error("hostCapture.sourceCommit must be a lowercase Git commit");
  }
  requireBoolean(capture.workingTreeClean, "hostCapture.workingTreeClean");

  requireRecord(capture.inventory, "hostCapture.inventory");
  requireExactKeys(
    capture.inventory,
    ["operatingSystem", "cpu", "memory", "graphics", "cameras", "controllers"],
    "hostCapture.inventory",
  );
  const { operatingSystem, cpu, memory, graphics, cameras, controllers } = capture.inventory;

  requireRecord(operatingSystem, "hostCapture.inventory.operatingSystem");
  requireExactKeys(
    operatingSystem,
    ["name", "version", "build", "architecture"],
    "hostCapture.inventory.operatingSystem",
  );
  for (const field of ["name", "version", "build", "architecture"]) {
    requireString(operatingSystem[field], `hostCapture.inventory.operatingSystem.${field}`);
  }

  requireRecord(cpu, "hostCapture.inventory.cpu");
  requireExactKeys(cpu, ["model", "physicalCores", "logicalProcessors"], "hostCapture.inventory.cpu");
  requireString(cpu.model, "hostCapture.inventory.cpu.model");
  requireInteger(cpu.physicalCores, 1, 4_096, "hostCapture.inventory.cpu.physicalCores");
  requireInteger(
    cpu.logicalProcessors,
    cpu.physicalCores,
    8_192,
    "hostCapture.inventory.cpu.logicalProcessors",
  );

  requireRecord(memory, "hostCapture.inventory.memory");
  requireExactKeys(memory, ["physicalBytes"], "hostCapture.inventory.memory");
  requireInteger(memory.physicalBytes, 1_073_741_824, Number.MAX_SAFE_INTEGER, "memory.physicalBytes");

  requireRecord(graphics, "hostCapture.inventory.graphics");
  requireExactKeys(
    graphics,
    ["model", "dedicatedMemoryMiB", "driverVersion", "memoryEvidence"],
    "hostCapture.inventory.graphics",
  );
  requireString(graphics.model, "hostCapture.inventory.graphics.model");
  requireInteger(
    graphics.dedicatedMemoryMiB,
    128,
    1_048_576,
    "hostCapture.inventory.graphics.dedicatedMemoryMiB",
  );
  requireString(graphics.driverVersion, "hostCapture.inventory.graphics.driverVersion");
  requireString(graphics.memoryEvidence, "hostCapture.inventory.graphics.memoryEvidence");

  if (!Array.isArray(cameras)) throw new Error("hostCapture.inventory.cameras must be an array");
  cameras.forEach((camera, index) => {
    const name = `hostCapture.inventory.cameras[${index}]`;
    requireRecord(camera, name);
    requireExactKeys(camera, ["model", "usbVendorProduct", "status"], name);
    requireString(camera.model, `${name}.model`);
    if (camera.usbVendorProduct !== null && !/^[0-9a-f]{4}:[0-9a-f]{4}$/.test(camera.usbVendorProduct)) {
      throw new Error(`${name}.usbVendorProduct must be null or lowercase vendor:product text`);
    }
    requireString(camera.status, `${name}.status`);
  });

  if (!Array.isArray(controllers)) {
    throw new Error("hostCapture.inventory.controllers must be an array");
  }
  controllers.forEach((controller, index) => {
    const name = `hostCapture.inventory.controllers[${index}]`;
    requireRecord(controller, name);
    requireExactKeys(controller, ["model", "status"], name);
    requireString(controller.model, `${name}.model`);
    requireString(controller.status, `${name}.status`);
  });

  requireRecord(capture.runtimes, "hostCapture.runtimes");
  requireExactKeys(
    capture.runtimes,
    ["node", "projectPnpm", "projectPackageManager", "rustc", "cargo", "git"],
    "hostCapture.runtimes",
  );
  for (const field of ["node", "projectPnpm", "projectPackageManager", "rustc", "cargo", "git"]) {
    requireString(capture.runtimes[field], `hostCapture.runtimes.${field}`);
  }

  requireRecord(capture.virtualizedLinux, "hostCapture.virtualizedLinux");
  requireExactKeys(
    capture.virtualizedLinux,
    [
      "kind",
      "distribution",
      "distributionName",
      "architecture",
      "kernel",
      "node",
      "wslVersion",
    ],
    "hostCapture.virtualizedLinux",
  );
  requireEqual(capture.virtualizedLinux.kind, "wsl2", "hostCapture.virtualizedLinux.kind");
  for (const field of [
    "distribution",
    "distributionName",
    "architecture",
    "kernel",
    "node",
    "wslVersion",
  ]) {
    requireString(capture.virtualizedLinux[field], `hostCapture.virtualizedLinux.${field}`);
  }

  requireRecord(capture.privacy, "hostCapture.privacy");
  const privacyKeys = [
    "containsComputerName",
    "containsUserName",
    "containsDeviceInstanceIds",
    "containsSerialNumbers",
    "containsFilesystemPaths",
    "containsNetworkAddresses",
  ];
  requireExactKeys(capture.privacy, privacyKeys, "hostCapture.privacy");
  for (const field of privacyKeys) {
    requireEqual(capture.privacy[field], false, `hostCapture.privacy.${field}`);
  }
  rejectSensitiveCaptureText(capture);
}

function validateTransportExpectation(report, expectation, name) {
  requireRecord(report, "transport report");
  requireEqual(report.format, "vcg-motion-transport-benchmark", "transport report format");
  requireRecord(report.environment, "transport report environment");
  requireRecord(report.method, "transport report method");

  requireRecord(expectation, name);
  requireExactKeys(
    expectation,
    [
      "formatVersion",
      "platform",
      "architecture",
      "node",
      "environmentKind",
      "payloadMode",
      "payloadBytes",
      "frameShape",
      "processLayout",
    ],
    name,
  );
  requireInteger(expectation.formatVersion, 1, 3, `${name}.formatVersion`);
  for (const field of [
    "platform",
    "architecture",
    "node",
    "environmentKind",
    "payloadMode",
    "processLayout",
  ]) {
    requireString(expectation[field], `${name}.${field}`);
  }
  requireInteger(expectation.payloadBytes, 256, 1_048_576, `${name}.payloadBytes`);
  if (expectation.frameShape !== null) requireString(expectation.frameShape, `${name}.frameShape`);

  requireEqual(report.formatVersion, expectation.formatVersion, "transport report formatVersion");
  requireEqual(report.environment.platform, expectation.platform, "transport report platform");
  requireEqual(
    report.environment.architecture,
    expectation.architecture,
    "transport report architecture",
  );
  requireEqual(report.environment.node, expectation.node, "transport report node");
  requireEqual(
    report.environment.environmentKind ?? "unreported",
    expectation.environmentKind,
    "transport report environmentKind",
  );
  requireEqual(
    report.method.payloadMode ?? "legacy-opaque-bytes",
    expectation.payloadMode,
    "transport report payloadMode",
  );
  requireEqual(report.method.payloadBytes, expectation.payloadBytes, "transport report payloadBytes");
  requireEqual(report.method.frameShape ?? null, expectation.frameShape, "transport report frameShape");
  requireEqual(
    report.method.processLayout.includes("separate child processes")
      ? "child-process"
      : "same-process",
    expectation.processLayout,
    "transport report processLayout",
  );
}

function validateClaimBoundary(boundary) {
  requireRecord(boundary, "claimBoundary");
  requireExactKeys(boundary, ["status", "establishes", "doesNotEstablish"], "claimBoundary");
  requireEqual(boundary.status, "established-development-only", "claimBoundary.status");
  for (const field of ["establishes", "doesNotEstablish"]) {
    if (!Array.isArray(boundary[field]) || boundary[field].length < 2) {
      throw new Error(`claimBoundary.${field} must contain at least two entries`);
    }
    boundary[field].forEach((value, index) =>
      requireString(value, `claimBoundary.${field}[${index}]`),
    );
  }
}

function rejectSensitiveCaptureText(capture) {
  const text = JSON.stringify(capture);
  const forbidden = [
    [/[A-Za-z]:\\/, "Windows filesystem path"],
    [/\\\\[^\\]/, "UNC path"],
    [/\/(?:home|Users)\//i, "user filesystem path"],
    [/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i, "GUID"],
    [/\b(?:instanceId|serialNumber|computerName|hostName|userName)\b/i, "identifier field"],
  ];
  for (const [pattern, description] of forbidden) {
    if (pattern.test(text)) throw new Error(`hostCapture contains a forbidden ${description}`);
  }
}

function requireRepositoryPath(value, name) {
  requireString(value, name);
  if (
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${name} must be a normalized repository-relative POSIX path`);
  }
}

function parseJson(bytes, name) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${name} must contain JSON`);
  }
}

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function requireExactKeys(value, keys, name) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${name} must contain exactly: ${expected.join(", ")}`);
  }
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be non-empty text`);
  }
}

function requireBoolean(value, name) {
  if (typeof value !== "boolean") throw new Error(`${name} must be boolean`);
}

function requireInteger(value, minimum, maximum, name) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
}

function requireEqual(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name} must equal ${JSON.stringify(expected)}`);
}

function requireIsoDate(value, name) {
  requireString(value, name);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${name} must be ISO date text`);
}

async function runCli() {
  const requested = process.argv.slice(2);
  const paths =
    requested.length > 0
      ? requested.map((value) => resolve(value))
      : (await readdir(defaultBundleDirectory))
          .filter((name) => name.endsWith(".json"))
          .sort()
          .map((name) => resolve(defaultBundleDirectory, name));
  if (paths.length === 0) throw new Error("no x86 development baseline bundles found");

  let failures = 0;
  for (const path of paths) {
    try {
      const bundle = JSON.parse(await readFile(path, "utf8"));
      await validateBaselineBundle(bundle);
      console.log(`${relative(repositoryRoot, path)}: valid`);
    } catch (error) {
      failures += 1;
      console.error(
        `${relative(repositoryRoot, path)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failures > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  await runCli();
}
