import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  LocalDiagnosticBuffer,
  MAX_LOCAL_DIAGNOSTIC_EXPORT_BYTES,
} from "../apps/console-lab/src/launcher/local-diagnostics.ts";
import { scanExclusionManifest } from "./device-only-data-exclusion.mjs";

const CANARIES = Object.freeze([
  Object.freeze({
    id: "profile-id",
    value: "VCG-CANARY-PROFILE_3D8F4A21C7",
  }),
  Object.freeze({
    id: "portrait",
    value: "VCG-CANARY-PORTRAIT_7B12E9C440",
  }),
  Object.freeze({
    id: "calibration",
    value: "VCG-CANARY-CALIBRATION_A84E1D2F09",
  }),
  Object.freeze({
    id: "body-profile",
    value: "VCG-CANARY-BODY_PROFILE_94C30FA271",
  }),
  Object.freeze({
    id: "progress-link",
    value: "VCG-CANARY-PROGRESS_LINK_E206BD1A75",
  }),
]);

function manifest(
  scanId: string,
  materializedPath: string,
  kind: "developer" | "diagnostics",
) {
  return {
    schemaVersion: 1,
    scanId,
    artifacts: [{
      id: "materialized-output",
      kind,
      materializedPath,
    }],
    canaries: CANARIES,
    forbiddenPathSegments: [],
    forbiddenFileDigests: [],
    limits: {
      maxEntries: 8,
      maxFiles: 4,
      maxFileBytes: MAX_LOCAL_DIAGNOSTIC_EXPORT_BYTES,
      maxFindings: 32,
      maxTotalBytes: 128 * 1_024,
    },
  };
}

test("the actual local diagnostic export excludes every seeded device-only field canary", async (t) => {
  const root = await mkdtemp(
    join(tmpdir(), "vcg-local-diagnostics-exclusion-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const diagnosticsRoot = join(root, "diagnostics");
  const positiveRoot = join(root, "positive-control");
  await mkdir(diagnosticsRoot);
  await mkdir(positiveRoot);

  const diagnostics = new LocalDiagnosticBuffer();
  diagnostics.record("launcher.ready", 1);
  diagnostics.record("package.inventory.available", 2);
  diagnostics.record("launch.started", 3);
  diagnostics.record("mode.identity-change.locked", 4);
  assert.throws(
    () =>
      diagnostics.record(
        CANARIES[0]!.value as "launcher.ready",
        5,
      ),
    /not allowed/,
  );

  const prepared = diagnostics.prepareExport(5);
  const exportBytes = Buffer.from(prepared.serialized, "utf8");
  const exportSha256 = createHash("sha256")
    .update(exportBytes)
    .digest("hex");
  assert.match(exportSha256, /^[0-9a-f]{64}$/);
  assert.ok(exportBytes.byteLength <= MAX_LOCAL_DIAGNOSTIC_EXPORT_BYTES);
  assert.equal(
    CANARIES.some(({ value }) => prepared.serialized.includes(value)),
    false,
  );
  await writeFile(
    join(diagnosticsRoot, "browser-local-diagnostics.json"),
    exportBytes,
  );

  const negative = await scanExclusionManifest(
    manifest(
      "browser-diagnostics-negative",
      "diagnostics",
      "diagnostics",
    ),
    root,
  );
  assert.equal(negative.status, "passed");
  assert.equal(negative.complete, true);
  assert.equal(negative.findings.length, 0);
  assert.deepEqual(negative.totals, {
    entries: 1,
    files: 1,
    bytes: exportBytes.byteLength,
  });
  const expectedContentTreeSha256 = createHash("sha256")
    .update("1\0file\0", "utf8")
    .update(
      `${exportBytes.byteLength}\0${exportSha256}\0`,
      "utf8",
    )
    .digest("hex");
  assert.equal(
    negative.artifacts[0]!.contentTreeSha256,
    expectedContentTreeSha256,
  );

  const positiveBytes = Buffer.from(
    `${JSON.stringify(
      Object.fromEntries(
        CANARIES.map(({ id, value }) => [id, value]),
      ),
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(positiveRoot, "seeded-device-only-fields.json"),
    positiveBytes,
  );
  const positive = await scanExclusionManifest(
    manifest(
      "browser-diagnostics-positive",
      "positive-control",
      "developer",
    ),
    root,
  );
  assert.equal(positive.status, "failed");
  assert.equal(positive.complete, true);
  assert.deepEqual(
    new Set(positive.findings.map(({ signalId }) => signalId)),
    new Set(CANARIES.map(({ id }) => id)),
  );
  const serializedEvidence = JSON.stringify({
    negative,
    positive,
  });
  for (const { value } of CANARIES) {
    assert.equal(serializedEvidence.includes(value), false);
  }
});
