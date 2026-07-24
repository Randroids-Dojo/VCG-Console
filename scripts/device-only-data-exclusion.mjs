import { createHash } from "node:crypto";
import { open, readFile, realpath, readdir, lstat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const SCHEMA_VERSION = 1;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ARTIFACTS = 64;
const MAX_CANARIES = 64;
const MAX_SAFE_BYTES = 2 ** 40;
const MAX_SAFE_COUNT = 1_000_000;

const ARTIFACT_KINDS = new Set([
  "backup",
  "cloud-sync",
  "developer",
  "diagnostics",
  "export",
  "factory-reset",
  "game-storage",
  "recovery-image",
  "support-bundle",
  "system-slot",
]);

const OPAQUE_EXTENSIONS = [
  ".7z",
  ".bz2",
  ".cpio",
  ".db",
  ".ext2",
  ".ext3",
  ".ext4",
  ".gz",
  ".img",
  ".iso",
  ".ldb",
  ".pdf",
  ".qcow",
  ".qcow2",
  ".squashfs",
  ".sqlite",
  ".sqlite3",
  ".sst",
  ".tar",
  ".tar.bz2",
  ".tar.gz",
  ".tar.xz",
  ".tar.zst",
  ".tgz",
  ".vhd",
  ".vhdx",
  ".xz",
  ".zip",
  ".zst",
];

export class ExclusionScanError extends Error {
  constructor(code) {
    super(code);
    this.name = "ExclusionScanError";
    this.code = code;
  }
}

function fail(code) {
  throw new ExclusionScanError(code);
}

function requireObject(value, code) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(code);
  }
  return value;
}

function requireExactKeys(value, expected, code) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(code);
  }
}

function requireSafeId(value, code) {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)
  ) {
    fail(code);
  }
  return value;
}

function requireInteger(value, minimum, maximum, code) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(code);
  }
  return value;
}

function requireRelativeMaterializedPath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    value.includes("\\") ||
    value.includes("\0") ||
    isAbsolute(value)
  ) {
    fail("invalid_materialized_path");
  }
  const parts = value.split("/");
  if (
    parts.some(
      (part) =>
        part.length === 0 ||
        part === "." ||
        part === ".." ||
        part.length > 128 ||
        part.includes(":"),
    )
  ) {
    fail("invalid_materialized_path");
  }
  return value;
}

function requireCanaryValue(value) {
  if (
    typeof value !== "string" ||
    value.length < 24 ||
    value.length > 128 ||
    !/^VCG-CANARY-[A-Z0-9][A-Z0-9_-]*$/.test(value)
  ) {
    fail("invalid_canary_value");
  }
  return value;
}

function requireUnique(values, code) {
  if (new Set(values).size !== values.length) fail(code);
}

export function validateExclusionManifest(input) {
  const manifest = requireObject(input, "manifest_not_object");
  requireExactKeys(
    manifest,
    [
      "schemaVersion",
      "scanId",
      "artifacts",
      "canaries",
      "forbiddenFileDigests",
      "forbiddenPathSegments",
      "limits",
    ],
    "unknown_or_missing_manifest_field",
  );
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    fail("unsupported_schema_version");
  }
  const scanId = requireSafeId(manifest.scanId, "invalid_scan_id");

  if (
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length === 0 ||
    manifest.artifacts.length > MAX_ARTIFACTS
  ) {
    fail("invalid_artifact_count");
  }
  const artifacts = manifest.artifacts.map((entry) => {
    const artifact = requireObject(entry, "artifact_not_object");
    requireExactKeys(
      artifact,
      ["id", "kind", "materializedPath"],
      "unknown_or_missing_artifact_field",
    );
    const id = requireSafeId(artifact.id, "invalid_artifact_id");
    if (
      typeof artifact.kind !== "string" ||
      !ARTIFACT_KINDS.has(artifact.kind)
    ) {
      fail("invalid_artifact_kind");
    }
    return Object.freeze({
      id,
      kind: artifact.kind,
      materializedPath: requireRelativeMaterializedPath(
        artifact.materializedPath,
      ),
    });
  });
  requireUnique(
    artifacts.map(({ id }) => id),
    "duplicate_artifact_id",
  );
  requireUnique(
    artifacts.map(({ materializedPath }) => materializedPath),
    "duplicate_artifact_path",
  );

  if (
    !Array.isArray(manifest.canaries) ||
    manifest.canaries.length === 0 ||
    manifest.canaries.length > MAX_CANARIES
  ) {
    fail("invalid_canary_count");
  }
  const canaries = manifest.canaries.map((entry) => {
    const canary = requireObject(entry, "canary_not_object");
    requireExactKeys(
      canary,
      ["id", "value"],
      "unknown_or_missing_canary_field",
    );
    return Object.freeze({
      id: requireSafeId(canary.id, "invalid_canary_id"),
      value: requireCanaryValue(canary.value),
    });
  });
  requireUnique(
    canaries.map(({ id }) => id),
    "duplicate_canary_id",
  );
  requireUnique(
    canaries.map(({ value }) => value),
    "duplicate_canary_value",
  );

  if (
    !Array.isArray(manifest.forbiddenPathSegments) ||
    manifest.forbiddenPathSegments.length > MAX_CANARIES
  ) {
    fail("invalid_forbidden_path_segment_count");
  }
  const forbiddenPathSegments = manifest.forbiddenPathSegments.map((entry) => {
    const segment = requireObject(
      entry,
      "forbidden_path_segment_not_object",
    );
    requireExactKeys(
      segment,
      ["id", "value"],
      "unknown_or_missing_forbidden_path_segment_field",
    );
    if (
      typeof segment.value !== "string" ||
      segment.value.length === 0 ||
      segment.value.length > 128 ||
      segment.value === "." ||
      segment.value === ".." ||
      !/^[A-Za-z0-9._-]+$/.test(segment.value)
    ) {
      fail("invalid_forbidden_path_segment");
    }
    return Object.freeze({
      id: requireSafeId(segment.id, "invalid_forbidden_path_segment_id"),
      value: segment.value,
    });
  });
  requireUnique(
    forbiddenPathSegments.map(({ value }) => value.toLowerCase()),
    "duplicate_forbidden_path_segment",
  );

  if (
    !Array.isArray(manifest.forbiddenFileDigests) ||
    manifest.forbiddenFileDigests.length > MAX_CANARIES
  ) {
    fail("invalid_forbidden_file_digest_count");
  }
  const forbiddenFileDigests = manifest.forbiddenFileDigests.map((entry) => {
    const digest = requireObject(
      entry,
      "forbidden_file_digest_not_object",
    );
    requireExactKeys(
      digest,
      ["id", "sha256"],
      "unknown_or_missing_forbidden_file_digest_field",
    );
    if (
      typeof digest.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(digest.sha256)
    ) {
      fail("invalid_forbidden_file_digest");
    }
    return Object.freeze({
      id: requireSafeId(digest.id, "invalid_forbidden_file_digest_id"),
      sha256: digest.sha256,
    });
  });
  requireUnique(
    forbiddenFileDigests.map(({ sha256 }) => sha256),
    "duplicate_forbidden_file_digest",
  );
  requireUnique(
    [
      ...canaries.map(({ id }) => id),
      ...forbiddenPathSegments.map(({ id }) => id),
      ...forbiddenFileDigests.map(({ id }) => id),
    ],
    "duplicate_signal_id",
  );

  const rawLimits = requireObject(manifest.limits, "limits_not_object");
  requireExactKeys(
    rawLimits,
    [
      "maxEntries",
      "maxFiles",
      "maxFileBytes",
      "maxFindings",
      "maxTotalBytes",
    ],
    "unknown_or_missing_limit",
  );
  const limits = Object.freeze({
    maxEntries: requireInteger(
      rawLimits.maxEntries,
      1,
      MAX_SAFE_COUNT,
      "invalid_max_entries",
    ),
    maxFiles: requireInteger(
      rawLimits.maxFiles,
      1,
      MAX_SAFE_COUNT,
      "invalid_max_files",
    ),
    maxFileBytes: requireInteger(
      rawLimits.maxFileBytes,
      1,
      MAX_SAFE_BYTES,
      "invalid_max_file_bytes",
    ),
    maxFindings: requireInteger(
      rawLimits.maxFindings,
      1,
      4_096,
      "invalid_max_findings",
    ),
    maxTotalBytes: requireInteger(
      rawLimits.maxTotalBytes,
      1,
      MAX_SAFE_BYTES,
      "invalid_max_total_bytes",
    ),
  });
  if (
    limits.maxFiles > limits.maxEntries ||
    limits.maxFileBytes > limits.maxTotalBytes
  ) {
    fail("inconsistent_limits");
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    scanId,
    artifacts: Object.freeze(artifacts),
    canaries: Object.freeze(canaries),
    forbiddenPathSegments: Object.freeze(forbiddenPathSegments),
    forbiddenFileDigests: Object.freeze(forbiddenFileDigests),
    limits,
  });
}

function swapUtf16Bytes(buffer) {
  const result = Buffer.from(buffer);
  for (let index = 0; index < result.length; index += 2) {
    const first = result[index];
    result[index] = result[index + 1];
    result[index + 1] = first;
  }
  return result;
}

function createPatterns(canaries) {
  const patterns = [];
  for (const canary of canaries) {
    const utf8 = Buffer.from(canary.value, "utf8");
    const utf16le = Buffer.from(canary.value, "utf16le");
    const encoded = [
      ["utf8", utf8],
      ["utf8-lowercase", Buffer.from(canary.value.toLowerCase(), "utf8")],
      ["utf16le", utf16le],
      ["utf16be", swapUtf16Bytes(utf16le)],
      ["base64", Buffer.from(utf8.toString("base64"), "ascii")],
      [
        "base64url",
        Buffer.from(utf8.toString("base64url"), "ascii"),
      ],
      ["hex-lowercase", Buffer.from(utf8.toString("hex"), "ascii")],
      [
        "hex-uppercase",
        Buffer.from(utf8.toString("hex").toUpperCase(), "ascii"),
      ],
    ];
    for (const [encoding, bytes] of encoded) {
      patterns.push(
        Object.freeze({
          canaryId: canary.id,
          encoding,
          bytes,
        }),
      );
    }
  }
  return Object.freeze(patterns);
}

function isWithin(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

async function requireNoSymlinkComponents(base, materializedPath) {
  let current = base;
  for (const component of materializedPath.split("/")) {
    current = join(current, component);
    let status;
    try {
      status = await lstat(current);
    } catch {
      fail("materialized_path_unavailable");
    }
    if (status.isSymbolicLink()) fail("symlink_not_allowed");
  }
}

function stableEntryFingerprint(entry) {
  return [
    entry.relativePath,
    entry.kind,
    entry.size,
    entry.mtimeMs,
    entry.dev,
    entry.ino,
  ].join("\0");
}

async function enumerateMaterializedTree(root, limits) {
  const entries = [];
  const files = [];
  let totalBytes = 0;

  async function visit(directory, prefix) {
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch {
      fail("artifact_read_failed");
    }
    children.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const child of children) {
      if (
        child.name.length === 0 ||
        child.name.length > 255 ||
        child.name.includes("\0") ||
        child.name.includes("/") ||
        child.name.includes("\\") ||
        child.name.includes(":")
      ) {
        fail("unsafe_artifact_entry_name");
      }
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      const absolutePath = join(directory, child.name);
      let status;
      try {
        status = await lstat(absolutePath);
      } catch {
        fail("artifact_changed_during_inventory");
      }
      if (status.isSymbolicLink()) fail("symlink_not_allowed");
      const kind = status.isDirectory()
        ? "directory"
        : status.isFile()
          ? "file"
          : "unsupported";
      if (kind === "unsupported") fail("unsupported_artifact_entry");
      const entry = Object.freeze({
        relativePath,
        absolutePath,
        kind,
        size: status.size,
        mtimeMs: status.mtimeMs,
        dev: status.dev,
        ino: status.ino,
      });
      entries.push(entry);
      if (entries.length > limits.maxEntries) fail("max_entries_exceeded");
      if (kind === "directory") {
        await visit(absolutePath, relativePath);
      } else {
        if (status.size > limits.maxFileBytes) {
          fail("max_file_bytes_exceeded");
        }
        files.push(entry);
        if (files.length > limits.maxFiles) fail("max_files_exceeded");
        totalBytes += status.size;
        if (
          !Number.isSafeInteger(totalBytes) ||
          totalBytes > limits.maxTotalBytes
        ) {
          fail("max_total_bytes_exceeded");
        }
      }
    }
  }

  await visit(root, "");
  return Object.freeze({
    entries: Object.freeze(entries),
    files: Object.freeze(files),
    totalBytes,
    fingerprint: entries.map(stableEntryFingerprint).join("\n"),
  });
}

function startsWithBytes(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function hasOpaqueExtension(relativePath) {
  const lower = relativePath.toLowerCase();
  return OPAQUE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function detectOpaqueContainer(header) {
  const signatures = [
    [Buffer.from([0x50, 0x4b, 0x03, 0x04]), 0],
    [Buffer.from([0x50, 0x4b, 0x05, 0x06]), 0],
    [Buffer.from([0x50, 0x4b, 0x07, 0x08]), 0],
    [Buffer.from([0x1f, 0x8b]), 0],
    [Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]), 0],
    [Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), 0],
    [Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), 0],
    [Buffer.from("BZh", "ascii"), 0],
    [Buffer.from("ustar", "ascii"), 257],
    [Buffer.from("CD001", "ascii"), 32_769],
    [Buffer.from("hsqs", "ascii"), 0],
    [Buffer.from("sqsh", "ascii"), 0],
    [Buffer.from("QFI\u00fb", "latin1"), 0],
    [Buffer.from("vhdxfile", "ascii"), 0],
    [Buffer.from("%PDF-", "ascii"), 0],
    [Buffer.from([0x53, 0xef]), 1_080],
  ];
  return signatures.some(([signature, offset]) =>
    startsWithBytes(header, signature, offset),
  );
}

function findPatterns(buffer, patterns) {
  const matches = [];
  for (const pattern of patterns) {
    if (buffer.indexOf(pattern.bytes) !== -1) matches.push(pattern);
  }
  return matches;
}

function appendFinding(state, finding, deduplicationKey) {
  if (state.findingKeys.has(deduplicationKey)) return;
  state.findingKeys.add(deduplicationKey);
  if (state.findings.length < state.maxFindings) {
    state.findings.push(Object.freeze(finding));
  } else {
    state.findingsTruncated = true;
  }
}

function findingLocation(entryOrdinal) {
  return Object.freeze({
    entryOrdinal,
  });
}

function scanPathForPatterns(
  artifact,
  entry,
  entryOrdinal,
  patterns,
  state,
) {
  const pathBytes = Buffer.from(entry.relativePath, "utf8");
  const location = findingLocation(entryOrdinal);
  for (const pattern of findPatterns(pathBytes, patterns)) {
    appendFinding(
      state,
      {
        artifactId: artifact.id,
        ...location,
        location: "path",
        signalId: pattern.canaryId,
        signalKind: "canary",
        encoding: pattern.encoding,
      },
      [
        artifact.id,
        entry.relativePath,
        "path",
        pattern.canaryId,
        pattern.encoding,
      ].join("\0"),
    );
  }
}

function scanForbiddenPathSegments(
  artifact,
  entry,
  entryOrdinal,
  forbiddenPathSegments,
  state,
) {
  const pathSegments = entry.relativePath.split("/");
  const location = findingLocation(entryOrdinal);
  for (const forbidden of forbiddenPathSegments) {
    const exact = pathSegments.includes(forbidden.value);
    const folded =
      !exact &&
      pathSegments.some(
        (segment) => segment.toLowerCase() === forbidden.value.toLowerCase(),
      );
    if (!exact && !folded) continue;
    const encoding = exact ? "exact" : "ascii-case-folded";
    appendFinding(
      state,
      {
        artifactId: artifact.id,
        ...location,
        location: "path",
        signalId: forbidden.id,
        signalKind: "forbidden-path-segment",
        encoding,
      },
      [
        artifact.id,
        entry.relativePath,
        "path-segment",
        forbidden.id,
        encoding,
      ].join("\0"),
    );
  }
}

function sameFileIdentity(status, entry) {
  return (
    status.isFile() &&
    status.size === entry.size &&
    status.mtimeMs === entry.mtimeMs &&
    status.dev === entry.dev &&
    status.ino === entry.ino
  );
}

async function scanFile(
  artifact,
  entry,
  entryOrdinal,
  patterns,
  forbiddenFileDigests,
  state,
) {
  if (hasOpaqueExtension(entry.relativePath)) {
    fail("opaque_container_requires_materialization");
  }
  let handle;
  let completedDigest;
  try {
    handle = await open(entry.absolutePath, "r");
    const before = await handle.stat();
    if (!sameFileIdentity(before, entry)) {
      fail("artifact_changed_during_scan");
    }

    const headerLength = Math.min(entry.size, 65_536);
    const header = Buffer.alloc(headerLength);
    if (headerLength > 0) {
      const { bytesRead } = await handle.read(header, 0, headerLength, 0);
      if (bytesRead !== headerLength) fail("artifact_changed_during_scan");
    }
    if (detectOpaqueContainer(header)) {
      fail("opaque_container_requires_materialization");
    }

    const longestPattern = patterns.reduce(
      (maximum, pattern) => Math.max(maximum, pattern.bytes.length),
      1,
    );
    let carry = Buffer.alloc(0);
    let observedBytes = 0;
    const location = findingLocation(entryOrdinal);
    const fileDigest = createHash("sha256");
    const stream = handle.createReadStream({
      autoClose: false,
      start: 0,
      highWaterMark: 64 * 1024,
    });
    for await (const rawChunk of stream) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk);
      observedBytes += chunk.length;
      if (observedBytes > entry.size) fail("artifact_changed_during_scan");
      fileDigest.update(chunk);
      const searchable =
        carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
      for (const pattern of findPatterns(searchable, patterns)) {
        appendFinding(
          state,
          {
            artifactId: artifact.id,
            ...location,
            location: "content",
            signalId: pattern.canaryId,
            signalKind: "canary",
            encoding: pattern.encoding,
          },
          [
            artifact.id,
            entry.relativePath,
            "content",
            pattern.canaryId,
            pattern.encoding,
          ].join("\0"),
        );
      }
      const carryLength = Math.min(longestPattern - 1, searchable.length);
      carry =
        carryLength === 0
          ? Buffer.alloc(0)
          : Buffer.from(searchable.subarray(searchable.length - carryLength));
    }
    if (observedBytes !== entry.size) fail("artifact_changed_during_scan");
    const sha256 = fileDigest.digest("hex");
    completedDigest = sha256;
    for (const forbidden of forbiddenFileDigests) {
      if (forbidden.sha256 !== sha256) continue;
      appendFinding(
        state,
        {
          artifactId: artifact.id,
          ...location,
          location: "file-digest",
          signalId: forbidden.id,
          signalKind: "forbidden-file-digest",
          encoding: "sha256",
        },
        [
          artifact.id,
          entry.relativePath,
          "file-digest",
          forbidden.id,
        ].join("\0"),
      );
    }
    const after = await handle.stat();
    if (!sameFileIdentity(after, entry)) {
      fail("artifact_changed_during_scan");
    }
  } catch (error) {
    if (error instanceof ExclusionScanError) throw error;
    fail("artifact_read_failed");
  } finally {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch {
        fail("artifact_close_failed");
      }
    }
  }
  if (completedDigest === undefined) fail("artifact_scan_incomplete");
  return completedDigest;
}

function contentTreeDigest(entries, fileDigests) {
  const digest = createHash("sha256");
  for (const [index, entry] of entries.entries()) {
    const entryOrdinal = index + 1;
    digest.update(`${entryOrdinal}\0${entry.kind}\0`, "utf8");
    if (entry.kind === "file") {
      const fileDigest = fileDigests.get(entry.relativePath);
      if (fileDigest === undefined) fail("internal_inventory_error");
      digest.update(`${entry.size}\0${fileDigest}\0`, "utf8");
    }
  }
  return digest.digest("hex");
}

export async function scanExclusionManifest(
  input,
  manifestDirectory,
) {
  const manifest = validateExclusionManifest(input);
  if (
    typeof manifestDirectory !== "string" ||
    manifestDirectory.length === 0
  ) {
    fail("invalid_manifest_directory");
  }
  let base;
  try {
    base = await realpath(resolve(manifestDirectory));
  } catch {
    fail("manifest_directory_unavailable");
  }
  const patterns = createPatterns(manifest.canaries);
  const roots = [];
  for (const artifact of manifest.artifacts) {
    await requireNoSymlinkComponents(base, artifact.materializedPath);
    const requestedRoot = resolve(
      base,
      ...artifact.materializedPath.split("/"),
    );
    let root;
    let status;
    try {
      root = await realpath(requestedRoot);
      status = await lstat(requestedRoot);
    } catch {
      fail("materialized_path_unavailable");
    }
    if (!status.isDirectory()) fail("materialized_path_not_directory");
    if (!isWithin(base, root)) fail("materialized_path_escape");
    if (
      roots.some(
        (existing) =>
          isWithin(existing.root, root) || isWithin(root, existing.root),
      )
    ) {
      fail("overlapping_artifact_roots");
    }
    roots.push(Object.freeze({ artifact, root }));
  }

  const state = {
    findings: [],
    findingKeys: new Set(),
    findingsTruncated: false,
    maxFindings: manifest.limits.maxFindings,
  };
  const artifactResults = [];
  let totalEntries = 0;
  let totalFiles = 0;
  let totalBytes = 0;

  for (const { artifact, root } of roots) {
    const remainingLimits = {
      ...manifest.limits,
      maxEntries: manifest.limits.maxEntries - totalEntries,
      maxFiles: manifest.limits.maxFiles - totalFiles,
      maxTotalBytes: manifest.limits.maxTotalBytes - totalBytes,
    };
    const inventory = await enumerateMaterializedTree(root, remainingLimits);
    const entryOrdinals = new Map();
    const fileDigests = new Map();
    for (const [index, entry] of inventory.entries.entries()) {
      const entryOrdinal = index + 1;
      entryOrdinals.set(entry.relativePath, entryOrdinal);
      scanPathForPatterns(
        artifact,
        entry,
        entryOrdinal,
        patterns,
        state,
      );
      scanForbiddenPathSegments(
        artifact,
        entry,
        entryOrdinal,
        manifest.forbiddenPathSegments,
        state,
      );
    }
    for (const file of inventory.files) {
      const entryOrdinal = entryOrdinals.get(file.relativePath);
      if (entryOrdinal === undefined) fail("internal_inventory_error");
      const fileDigest = await scanFile(
        artifact,
        file,
        entryOrdinal,
        patterns,
        manifest.forbiddenFileDigests,
        state,
      );
      fileDigests.set(file.relativePath, fileDigest);
    }
    const after = await enumerateMaterializedTree(root, remainingLimits);
    if (after.fingerprint !== inventory.fingerprint) {
      fail("artifact_changed_during_scan");
    }
    totalEntries += inventory.entries.length;
    totalFiles += inventory.files.length;
    totalBytes += inventory.totalBytes;
    if (totalEntries > manifest.limits.maxEntries) {
      fail("max_entries_exceeded");
    }
    if (totalFiles > manifest.limits.maxFiles) fail("max_files_exceeded");
    if (totalBytes > manifest.limits.maxTotalBytes) {
      fail("max_total_bytes_exceeded");
    }
    artifactResults.push(
      Object.freeze({
        id: artifact.id,
        kind: artifact.kind,
        entries: inventory.entries.length,
        files: inventory.files.length,
        bytes: inventory.totalBytes,
        contentTreeSha256: contentTreeDigest(
          inventory.entries,
          fileDigests,
        ),
      }),
    );
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    scanId: manifest.scanId,
    status: state.findings.length > 0 ? "failed" : "passed",
    complete: !state.findingsTruncated,
    artifacts: Object.freeze(artifactResults),
    totals: Object.freeze({
      entries: totalEntries,
      files: totalFiles,
      bytes: totalBytes,
    }),
    findings: Object.freeze(state.findings),
    findingsTruncated: state.findingsTruncated,
  });
}

export async function scanExclusionManifestFile(manifestPath) {
  if (
    typeof manifestPath !== "string" ||
    manifestPath.length === 0 ||
    manifestPath.includes("\0")
  ) {
    fail("invalid_manifest_path");
  }
  const absolutePath = resolve(manifestPath);
  let status;
  try {
    status = await lstat(absolutePath);
  } catch {
    fail("manifest_unavailable");
  }
  if (status.isSymbolicLink() || !status.isFile()) {
    fail("manifest_not_regular_file");
  }
  if (status.size === 0 || status.size > MAX_MANIFEST_BYTES) {
    fail("invalid_manifest_size");
  }
  let bytes;
  try {
    bytes = await readFile(absolutePath);
  } catch {
    fail("manifest_read_failed");
  }
  if (bytes.length !== status.size) fail("manifest_changed_during_read");
  let input;
  try {
    input = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("invalid_manifest_json");
  }
  return scanExclusionManifest(input, dirname(absolutePath));
}
