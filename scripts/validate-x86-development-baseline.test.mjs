import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateBaselineBundle,
  validateHostCapture,
} from "./validate-x86-development-baseline.mjs";

const windowsReport = {
  format: "vcg-motion-transport-benchmark",
  formatVersion: 2,
  environment: {
    platform: "win32",
    architecture: "x64",
    node: "v24.18.0",
  },
  method: {
    payloadMode: "motion-json",
    payloadBytes: 2010,
    frameShape: "core17",
    processLayout: "servers run in separate child processes",
  },
};
const wslReport = {
  format: "vcg-motion-transport-benchmark",
  formatVersion: 3,
  environment: {
    platform: "linux",
    architecture: "x64",
    node: "v22.22.1",
    environmentKind: "wsl2",
  },
  method: {
    payloadMode: "motion-json",
    payloadBytes: 2010,
    frameShape: "core17",
    processLayout: "servers run in separate child processes",
  },
};

function capture() {
  return {
    format: "vcg-x86-development-host-capture",
    formatVersion: 1,
    capturedAt: "2026-07-24T16:27:38.133Z",
    sourceCommit: "a".repeat(40),
    workingTreeClean: true,
    inventory: {
      operatingSystem: {
        name: "Windows 11 Pro",
        version: "10.0.26200",
        build: "26200",
        architecture: "64-bit",
      },
      cpu: {
        model: "Example x86 CPU",
        physicalCores: 12,
        logicalProcessors: 24,
      },
      memory: { physicalBytes: 68_625_489_920 },
      graphics: {
        model: "Example GPU",
        dedicatedMemoryMiB: 12_288,
        driverVersion: "1.2.3",
        memoryEvidence: "vendor-cli",
      },
      cameras: [{ model: "Example camera", usbVendorProduct: "046d:082d", status: "OK" }],
      controllers: [],
    },
    runtimes: {
      node: "v24.18.0",
      projectPnpm: "10.30.3",
      projectPackageManager: "pnpm@10.30.3",
      rustc: "rustc 1.97.1",
      cargo: "cargo 1.97.1",
      git: "git version 2.55.0",
    },
    virtualizedLinux: {
      kind: "wsl2",
      distribution: "Ubuntu 26.04 LTS",
      distributionName: "Ubuntu",
      architecture: "x86_64",
      kernel: "6.6.87.2-microsoft-standard-WSL2",
      node: "v22.22.1",
      wslVersion: "2.6.3.0",
    },
    privacy: {
      containsComputerName: false,
      containsUserName: false,
      containsDeviceInstanceIds: false,
      containsSerialNumbers: false,
      containsFilesystemPaths: false,
      containsNetworkAddresses: false,
    },
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vcg-x86-baseline-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "benchmarks", "transport"), { recursive: true });

  const sources = [
    ["sanitized-host-report", "docs/host.md", Buffer.from("# Host\n"), { format: "markdown" }],
    [
      "transport-benchmark",
      "benchmarks/transport/windows.json",
      Buffer.from(`${JSON.stringify(windowsReport)}\n`),
      {
        formatVersion: 2,
        platform: "win32",
        architecture: "x64",
        node: "v24.18.0",
        environmentKind: "unreported",
        payloadMode: "motion-json",
        payloadBytes: 2010,
        frameShape: "core17",
        processLayout: "child-process",
      },
    ],
    [
      "transport-benchmark",
      "benchmarks/transport/wsl.json",
      Buffer.from(`${JSON.stringify(wslReport)}\n`),
      {
        formatVersion: 3,
        platform: "linux",
        architecture: "x64",
        node: "v22.22.1",
        environmentKind: "wsl2",
        payloadMode: "motion-json",
        payloadBytes: 2010,
        frameShape: "core17",
        processLayout: "child-process",
      },
    ],
  ];

  const evidence = [];
  for (const [kind, repositoryPath, bytes, expect] of sources) {
    await writeFile(join(root, ...repositoryPath.split("/")), bytes);
    evidence.push({
      kind,
      repositoryPath,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      expect,
    });
  }

  return {
    root,
    bundle: {
      format: "vcg-x86-development-baseline-bundle",
      formatVersion: 1,
      assembledAt: "2026-07-24T16:30:00.000Z",
      role: "x86-64-development-host",
      hostCapture: capture(),
      evidence,
      claimBoundary: {
        status: "established-development-only",
        establishes: ["sanitized host facts", "bounded transport observations"],
        doesNotEstablish: ["native Linux", "camera-to-action latency"],
      },
      limitations: ["one", "two", "three", "four", "five", "six"],
    },
  };
}

test("accepts a hash-bound Windows and WSL2 development bundle", async () => {
  const { root, bundle } = await fixture();
  await validateBaselineBundle(bundle, root);
});

test("rejects evidence changed after assembly", async () => {
  const { root, bundle } = await fixture();
  await writeFile(join(root, "docs", "host.md"), "# Changed\n");
  await assert.rejects(validateBaselineBundle(bundle, root), /bytes|sha256/);
});

test("rejects repository path traversal", async () => {
  const { root, bundle } = await fixture();
  bundle.evidence[0].repositoryPath = "../host.md";
  await assert.rejects(validateBaselineBundle(bundle, root), /normalized repository-relative/);
});

test("rejects a declared environment that does not match the report", async () => {
  const { root, bundle } = await fixture();
  bundle.evidence[1].expect.platform = "linux";
  await assert.rejects(validateBaselineBundle(bundle, root), /transport report platform/);
});

test("rejects duplicate evidence paths", async () => {
  const { root, bundle } = await fixture();
  bundle.evidence[2] = structuredClone(bundle.evidence[1]);
  await assert.rejects(validateBaselineBundle(bundle, root), /duplicated/);
});

test("rejects a capture with a filesystem path despite its privacy assertion", () => {
  const value = capture();
  value.inventory.cpu.model = "read from C:\\Users\\someone";
  assert.throws(() => validateHostCapture(value), /forbidden Windows filesystem path/);
});

test("rejects an expanded capture schema that could hide identifiers", () => {
  const value = capture();
  value.inventory.computerName = "hidden-host";
  assert.throws(() => validateHostCapture(value), /must contain exactly/);
});
