import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
} from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { scanExclusionManifest } from "./device-only-data-exclusion.mjs";

const execute = promisify(execFile);
const REPOSITORY_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STANDARD_CARGO = join(
  process.env.CARGO_HOME ?? join(homedir(), ".cargo"),
  "bin",
  process.platform === "win32" ? "cargo.exe" : "cargo",
);
const CARGO = process.env.CARGO ??
  (existsSync(STANDARD_CARGO) ? STANDARD_CARGO : "cargo");
const CANARIES = Object.freeze([
  Object.freeze({
    id: "profile-id",
    value: "VCG-CANARY-NATIVE_PROFILE_5D817E30A2",
  }),
  Object.freeze({
    id: "portrait",
    value: "VCG-CANARY-NATIVE_PORTRAIT_81B6F209C4",
  }),
  Object.freeze({
    id: "calibration",
    value: "VCG-CANARY-NATIVE_CALIBRATION_F2A709C315",
  }),
  Object.freeze({
    id: "body-profile",
    value: "VCG-CANARY-NATIVE_BODY_PROFILE_4C13E8A729",
  }),
  Object.freeze({
    id: "progress-link",
    value: "VCG-CANARY-NATIVE_PROGRESS_LINK_9A30D5F718",
  }),
]);
const FORBIDDEN_PATH_SEGMENTS = Object.freeze([
  Object.freeze({
    id: "vault-directory",
    value: "profile-vault",
  }),
  Object.freeze({
    id: "portrait-directory",
    value: "portraits",
  }),
]);

function manifest({
  scanId,
  materializedPath,
  kind,
  sourceSha256,
}) {
  return {
    schemaVersion: 1,
    scanId,
    artifacts: [{
      id: "materialized-output",
      kind,
      materializedPath,
    }],
    canaries: CANARIES,
    forbiddenPathSegments: FORBIDDEN_PATH_SEGMENTS,
    forbiddenFileDigests: [{
      id: "seeded-source-copy",
      sha256: sourceSha256,
    }],
    limits: {
      maxEntries: 32,
      maxFiles: 24,
      maxFileBytes: 1_024,
      maxFindings: 32,
      maxTotalBytes: 16 * 1_024,
    },
  };
}

async function inventoryFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    );
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else {
        assert.equal(entry.isFile(), true);
        files.push(
          relative(root, path).split(sep).join("/"),
        );
      }
    }
  }
  await visit(root);
  return files;
}

test("the actual native diagnostic store excludes every seeded device-only field and source", async (t) => {
  const root = await mkdtemp(
    join(tmpdir(), "vcg-native-diagnostics-exclusion-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const diagnosticsRoot = join(root, "native-diagnostics");
  const positiveRoot = join(
    root,
    "positive-control",
    "profile-vault",
    "portraits",
  );
  await mkdir(positiveRoot, { recursive: true });

  const sourceBytes = Buffer.from(
    `${JSON.stringify(
      Object.fromEntries(
        CANARIES.map(({ id, value }) => [id, value]),
      ),
    )}\n`,
    "utf8",
  );
  const sourceSha256 = createHash("sha256")
    .update(sourceBytes)
    .digest("hex");
  await writeFile(
    join(positiveRoot, "seeded-device-only-fields.json"),
    sourceBytes,
  );

  const { stdout, stderr } = await execute(
    CARGO,
    [
      "run",
      "--quiet",
      "--package",
      "vcg-host",
      "--example",
      "native_diagnostics_exclusion_fixture",
      "--",
      diagnosticsRoot,
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1_024,
      windowsHide: true,
    },
  );
  assert.equal(stdout, "");
  assert.equal(stderr, "");

  const files = await inventoryFiles(diagnosticsRoot);
  assert.deepEqual(files, [
    "diagnostics.lock",
    "events/00000000000000000001.json",
    "events/00000000000000000002.json",
    "events/00000000000000000003.json",
    "events/00000000000000000004.json",
    "events/00000000000000000005.json",
    "events/00000000000000000006.json",
    "watermarks/00000000000000000001-access-controller-00000000000000000010",
    "watermarks/00000000000000000001-launcher-00000000000000000020",
    "watermarks/00000000000000000001-package-manager-00000000000000000030",
    "watermarks/00000000000000000001-power-coordinator-00000000000000000040",
    "watermarks/00000000000000000001-process-supervisor-00000000000000000050",
    "watermarks/00000000000000000001-system-update-00000000000000000060",
  ]);

  for (const path of files) {
    const bytes = await readFile(join(diagnosticsRoot, ...path.split("/")));
    assert.equal(bytes.byteLength <= 1_024, true);
    for (const { value } of CANARIES) {
      assert.equal(bytes.includes(Buffer.from(value, "utf8")), false);
    }
    assert.notEqual(
      createHash("sha256").update(bytes).digest("hex"),
      sourceSha256,
    );
  }

  const negativeManifest = manifest({
    scanId: "native-diagnostics-negative",
    materializedPath: "native-diagnostics",
    kind: "diagnostics",
    sourceSha256,
  });
  const negative = await scanExclusionManifest(negativeManifest, root);
  const repeated = await scanExclusionManifest(negativeManifest, root);
  assert.equal(negative.status, "passed");
  assert.equal(negative.complete, true);
  assert.equal(negative.findings.length, 0);
  assert.equal(negative.artifacts.length, 1);
  assert.match(
    negative.artifacts[0].contentTreeSha256,
    /^[0-9a-f]{64}$/,
  );
  assert.deepEqual(repeated, negative);
  assert.equal(negative.totals.entries, 15);
  assert.equal(negative.totals.files, 13);
  assert.equal(negative.totals.bytes > 0, true);
  assert.equal(negative.totals.bytes <= 16 * 1_024, true);

  const positive = await scanExclusionManifest(
    manifest({
      scanId: "native-diagnostics-positive",
      materializedPath: "positive-control",
      kind: "developer",
      sourceSha256,
    }),
    root,
  );
  assert.equal(positive.status, "failed");
  assert.equal(positive.complete, true);
  assert.deepEqual(
    new Set(positive.findings.map(({ signalId }) => signalId)),
    new Set([
      ...CANARIES.map(({ id }) => id),
      ...FORBIDDEN_PATH_SEGMENTS.map(({ id }) => id),
      "seeded-source-copy",
    ]),
  );

  const serializedEvidence = JSON.stringify({ negative, positive });
  for (const { value } of CANARIES) {
    assert.equal(serializedEvidence.includes(value), false);
  }
  assert.equal(serializedEvidence.includes("profile-vault"), false);
  assert.equal(serializedEvidence.includes("portraits"), false);
});
