import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ExclusionScanError,
  scanExclusionManifest,
  validateExclusionManifest,
} from "./device-only-data-exclusion.mjs";

const CANARY = "VCG-CANARY-PROFILE_A7F2D91E44";
const OTHER_CANARY = "VCG-CANARY-PORTRAIT_19B4CE82A0";
const CLI_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "verify-device-only-data-exclusion.mjs",
);

function manifest({
  artifacts = [
    {
      id: "support",
      kind: "support-bundle",
      materializedPath: "support",
    },
  ],
  canaries = [{ id: "profile", value: CANARY }],
  forbiddenPathSegments = [],
  forbiddenFileDigests = [],
  limits = {},
  ...extra
} = {}) {
  return {
    schemaVersion: 1,
    scanId: "device-only-fixture",
    artifacts,
    canaries,
    forbiddenPathSegments,
    forbiddenFileDigests,
    limits: {
      maxEntries: 128,
      maxFiles: 64,
      maxFileBytes: 2 * 1024 * 1024,
      maxFindings: 64,
      maxTotalBytes: 8 * 1024 * 1024,
      ...limits,
    },
    ...extra,
  };
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "vcg-data-exclusion-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test("strict manifest validation accepts only bounded synthetic canaries", () => {
  assert.equal(validateExclusionManifest(manifest()).schemaVersion, 1);

  assert.throws(
    () => validateExclusionManifest(manifest({ surprise: true })),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "unknown_or_missing_manifest_field",
  );
  assert.throws(
    () =>
      validateExclusionManifest({
        ...manifest(),
        schemaVersion: 2,
      }),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "unsupported_schema_version",
  );
  assert.throws(
    () =>
      validateExclusionManifest(
        manifest({
          artifacts: [
            {
              id: "support",
              kind: "support-bundle",
              materializedPath: "../support",
            },
          ],
        }),
      ),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "invalid_materialized_path",
  );
  assert.throws(
    () =>
      validateExclusionManifest(
        manifest({
          canaries: [{ id: "profile", value: "real-person-name" }],
        }),
      ),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "invalid_canary_value",
  );
  assert.throws(
    () =>
      validateExclusionManifest(
        manifest({
          canaries: [
            { id: "profile", value: CANARY },
            { id: "profile", value: OTHER_CANARY },
          ],
        }),
      ),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "duplicate_canary_id",
  );
  assert.throws(
    () =>
      validateExclusionManifest(
        manifest({
          forbiddenFileDigests: [
            {
              id: "vault",
              sha256: "A".repeat(64),
            },
          ],
        }),
      ),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "invalid_forbidden_file_digest",
  );
  assert.throws(
    () =>
      validateExclusionManifest(
        manifest({
          forbiddenPathSegments: [
            {
              id: "profile",
              value: "profile-vault",
            },
          ],
        }),
      ),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "duplicate_signal_id",
  );
  assert.throws(
    () =>
      validateExclusionManifest(
        manifest({
          limits: {
            maxEntries: 1,
            maxFiles: 2,
          },
        }),
      ),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "inconsistent_limits",
  );
});

test("a complete clean materialized tree produces deterministic bounded evidence", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "support", "nested"), { recursive: true });
  await writeFile(join(root, "support", "health.json"), '{"status":"ok"}\n');
  await writeFile(join(root, "support", "nested", "empty"), "");

  const first = await scanExclusionManifest(manifest(), root);
  const second = await scanExclusionManifest(manifest(), root);

  assert.deepEqual(first, second);
  assert.match(first.artifacts[0].contentTreeSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    {
      ...first,
      artifacts: first.artifacts.map(
        ({ contentTreeSha256: _contentTreeSha256, ...artifact }) =>
          artifact,
      ),
    },
    {
      schemaVersion: 1,
      scanId: "device-only-fixture",
      status: "passed",
      complete: true,
      artifacts: [
        {
          id: "support",
          kind: "support-bundle",
          entries: 3,
          files: 2,
          bytes: 16,
        },
      ],
      totals: {
        entries: 3,
        files: 2,
        bytes: 16,
      },
      findings: [],
      findingsTruncated: false,
    },
  );

  await writeFile(join(root, "support", "health.json"), '{"status":"new"}\n');
  const changed = await scanExclusionManifest(manifest(), root);
  assert.notEqual(
    changed.artifacts[0].contentTreeSha256,
    first.artifacts[0].contentTreeSha256,
  );
});

test("literal and common encoded canaries are found across stream boundaries without value disclosure", async (t) => {
  const root = await fixture(t);
  const artifact = join(root, "support");
  await mkdir(artifact, { recursive: true });

  const utf8 = Buffer.from(CANARY, "utf8");
  const utf16le = Buffer.from(CANARY, "utf16le");
  const utf16be = Buffer.from(utf16le);
  utf16be.swap16();
  const representations = new Map([
    ["utf8", utf8],
    ["utf8-lowercase", Buffer.from(CANARY.toLowerCase(), "utf8")],
    ["utf16le", utf16le],
    ["utf16be", utf16be],
    ["base64", Buffer.from(utf8.toString("base64"), "ascii")],
    ["base64url", Buffer.from(utf8.toString("base64url"), "ascii")],
    ["hex-lowercase", Buffer.from(utf8.toString("hex"), "ascii")],
    [
      "hex-uppercase",
      Buffer.from(utf8.toString("hex").toUpperCase(), "ascii"),
    ],
  ]);
  for (const [name, bytes] of representations) {
    await writeFile(
      join(artifact, `${name}.txt`),
      Buffer.concat([Buffer.alloc(65_530, 0x2e), bytes]),
    );
  }

  const result = await scanExclusionManifest(manifest(), root);
  assert.equal(result.status, "failed");
  assert.equal(result.complete, true);
  const foundEncodings = new Set(
    result.findings.map(({ encoding }) => encoding),
  );
  for (const encoding of representations.keys()) {
    assert.ok(foundEncodings.has(encoding), `missing ${encoding}`);
  }
  for (const finding of result.findings) {
    assert.equal(Number.isSafeInteger(finding.entryOrdinal), true);
    assert.equal(finding.signalId, "profile");
    assert.equal(finding.signalKind, "canary");
    assert.equal(finding.location, "content");
    assert.equal("relativePath" in finding, false);
  }
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(CANARY), false);
  assert.equal(serialized.includes(CANARY.toLowerCase()), false);
  assert.equal(serialized.includes(utf8.toString("hex")), false);
});

test("canaries in names are reported through an ordinal only", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "support"), { recursive: true });
  await writeFile(join(root, "support", `${CANARY}.txt`), "safe");

  const result = await scanExclusionManifest(manifest(), root);
  assert.equal(result.status, "failed");
  assert.ok(result.findings.some(({ location }) => location === "path"));
  assert.equal(JSON.stringify(result).includes(CANARY), false);
});

test("fixed path segments and exact source digests detect encrypted or renamed copies without disclosure", async (t) => {
  const root = await fixture(t);
  const sourceBytes = Buffer.from("synthetic-encrypted-vault-bytes", "utf8");
  const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
  await mkdir(join(root, "support", "profile-vault"), { recursive: true });
  await writeFile(
    join(root, "support", "profile-vault", "renamed.bin"),
    sourceBytes,
  );

  const result = await scanExclusionManifest(
    manifest({
      forbiddenPathSegments: [
        { id: "vault-path", value: "profile-vault" },
      ],
      forbiddenFileDigests: [
        { id: "vault-copy", sha256: sourceDigest },
      ],
    }),
    root,
  );
  assert.equal(result.status, "failed");
  assert.ok(
    result.findings.some(
      ({ signalId, signalKind }) =>
        signalId === "vault-path" &&
        signalKind === "forbidden-path-segment",
    ),
  );
  assert.ok(
    result.findings.some(
      ({ signalId, signalKind }) =>
        signalId === "vault-copy" &&
        signalKind === "forbidden-file-digest",
    ),
  );
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("profile-vault"), false);
  assert.equal(serialized.includes(sourceDigest), false);
  assert.equal(serialized.includes(sourceBytes.toString("utf8")), false);
});

test("finding truncation remains an explicit failed and incomplete result", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "support"), { recursive: true });
  await writeFile(join(root, "support", "first.txt"), CANARY);
  await writeFile(join(root, "support", "second.txt"), CANARY);

  const result = await scanExclusionManifest(
    manifest({ limits: { maxFindings: 1 } }),
    root,
  );
  assert.equal(result.status, "failed");
  assert.equal(result.complete, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findingsTruncated, true);
});

test("recognized archives and disk-image content cannot produce a misleading pass", async (t) => {
  const extensionRoot = await fixture(t);
  await mkdir(join(extensionRoot, "support"), { recursive: true });
  await writeFile(join(extensionRoot, "support", "bundle.zip"), "not-a-zip");
  await assert.rejects(
    scanExclusionManifest(manifest(), extensionRoot),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "opaque_container_requires_materialization",
  );

  const magicRoot = await fixture(t);
  await mkdir(join(magicRoot, "support"), { recursive: true });
  await writeFile(
    join(magicRoot, "support", "renamed.dat"),
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
  );
  await assert.rejects(
    scanExclusionManifest(manifest(), magicRoot),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "opaque_container_requires_materialization",
  );
});

test("global file and byte limits apply across disjoint artifact roots", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "support"), { recursive: true });
  await mkdir(join(root, "recovery"), { recursive: true });
  await writeFile(join(root, "support", "one.txt"), "one");
  await writeFile(join(root, "recovery", "two.txt"), "two");
  const artifacts = [
    {
      id: "support",
      kind: "support-bundle",
      materializedPath: "support",
    },
    {
      id: "recovery",
      kind: "recovery-image",
      materializedPath: "recovery",
    },
  ];

  await assert.rejects(
    scanExclusionManifest(
      manifest({ artifacts, limits: { maxEntries: 1, maxFiles: 1 } }),
      root,
    ),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "max_entries_exceeded",
  );
  await assert.rejects(
    scanExclusionManifest(
      manifest({
        artifacts,
        limits: {
          maxEntries: 2,
          maxFiles: 2,
          maxFileBytes: 3,
          maxTotalBytes: 5,
        },
      }),
      root,
    ),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "max_total_bytes_exceeded",
  );
});

test("overlapping roots and symlinks fail closed", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "support", "nested"), { recursive: true });
  await assert.rejects(
    scanExclusionManifest(
      manifest({
        artifacts: [
          {
            id: "outer",
            kind: "support-bundle",
            materializedPath: "support",
          },
          {
            id: "inner",
            kind: "diagnostics",
            materializedPath: "support/nested",
          },
        ],
      }),
      root,
    ),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "overlapping_artifact_roots",
  );

  const outside = join(root, "outside");
  await mkdir(outside);
  try {
    await symlink(
      outside,
      join(root, "support", "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "EPERM" || error.code === "EACCES")
    ) {
      t.diagnostic("symlink creation is unavailable on this host");
      return;
    }
    throw error;
  }
  await assert.rejects(
    scanExclusionManifest(manifest(), root),
    (error) =>
      error instanceof ExclusionScanError &&
      error.code === "symlink_not_allowed",
  );
});

test("CLI exit codes distinguish pass, finding, and contract error without echoing canaries", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "support"), { recursive: true });
  await writeFile(join(root, "support", "health.json"), '{"ok":true}\n');
  const manifestPath = join(root, "scan.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest())}\n`);

  const passed = spawnSync(process.execPath, [CLI_PATH, manifestPath], {
    encoding: "utf8",
  });
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).status, "passed");
  assert.equal(passed.stdout.includes(CANARY), false);

  await writeFile(join(root, "support", "health.json"), CANARY);
  const failed = spawnSync(process.execPath, [CLI_PATH, manifestPath], {
    encoding: "utf8",
  });
  assert.equal(failed.status, 1, failed.stderr);
  assert.equal(JSON.parse(failed.stdout).status, "failed");
  assert.equal(failed.stdout.includes(CANARY), false);

  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest({ unexpected: CANARY }))}\n`,
  );
  const invalid = spawnSync(process.execPath, [CLI_PATH, manifestPath], {
    encoding: "utf8",
  });
  assert.equal(invalid.status, 2);
  assert.deepEqual(JSON.parse(invalid.stderr), {
    schemaVersion: 1,
    status: "error",
    code: "unknown_or_missing_manifest_field",
  });
  assert.equal(invalid.stderr.includes(CANARY), false);
});
