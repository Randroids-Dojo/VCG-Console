import { isDeepStrictEqual } from "node:util";

const MAX_SBOM_BYTES = 64 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const RETRO_CORE_SBOM_PATH =
  "compliance/retro-cores/libretro-2048.candidate.json";

export const RETRO_CORE_CANDIDATE = Object.freeze({
  schemaVersion: 1,
  documentType: "vcg-retro-core-source-candidate-sbom",
  observedOn: "2026-07-24",
  status: "source-candidate-unqualified",
  core: {
    id: "2048",
    name: "libretro 2048",
    upstreamAuthors: ["Gabriele Cirulli", "Higor Eurípedes"],
  },
  source: {
    repository: "https://github.com/libretro/libretro-2048",
    observedBranch: "master",
    revision: "c90437d3c3913999624deca3fb55ecfa632b72c4",
    sourceArchive:
      "https://github.com/libretro/libretro-2048/archive/c90437d3c3913999624deca3fb55ecfa632b72c4.tar.gz",
    sourceArchiveSha256: null,
    publishedRelease: null,
  },
  license: {
    expression: "LicenseRef-Unlicense",
    evidence:
      "https://raw.githubusercontent.com/libretro/libretro-2048/c90437d3c3913999624deca3fb55ecfa632b72c4/COPYING",
    reviewStatus: "source-text-observed-legal-review-pending",
    noticeObligation: "retain-exact-license-and-component-attribution",
    sourceOffer:
      "no-reciprocal-source-offer-identified-retain-exact-source-anyway",
  },
  runtime: {
    contentMode: "none",
    bios: [],
    supportsNoGame: true,
    controllerProfile: "retropad-standard-v1",
    documentedFeatures: [
      "controls",
      "netplay",
      "remapping",
      "restart",
      "rewind",
      "saves",
      "screenshots",
      "states",
    ],
  },
  build: {
    selectedRecipe: null,
    artifactSha256: null,
    artifactByteLength: null,
    requestedArchitectures: [
      {
        architecture: "aarch64",
        status: "unverified",
      },
      {
        architecture: "x86_64",
        status: "unverified",
      },
    ],
    sourceDependencies: [
      {
        id: "libretro-api-header",
        relationship: "vendored-source",
        license: "MIT",
        reviewStatus: "header-license-observed",
      },
      {
        id: "libretro-common-subset",
        relationship: "vendored-source",
        license: "NOASSERTION",
        reviewStatus: "complete-file-license-review-pending",
      },
    ],
    ambiguity: [
      "No target build recipe, compiler, flags, sysroot, or reproducible environment is selected.",
      "The non-Cairo Makefile compiles vendored libretro-common sources, while the README also names fontconfig, FreeType, expat, bzip2, zlib, and iconv for another build path.",
      "No ARM64 or x86-64 core binary has been built, hashed, scanned, or run.",
    ],
  },
  knownIssues: [
    {
      id: "upstream-11",
      state: "open",
      url: "https://github.com/libretro/libretro-2048/issues/11",
      summary: "Segmentation fault reported during regular gameplay.",
      disposition:
        "blocks qualification until reproduced or closed with target evidence",
    },
    {
      id: "upstream-33",
      state: "open",
      url: "https://github.com/libretro/libretro-2048/issues/33",
      summary: "Font size reported too small on handheld retro consoles.",
      disposition:
        "requires TV-distance and low-resolution legibility verification",
    },
    {
      id: "upstream-42",
      state: "open",
      url: "https://github.com/libretro/libretro-2048/issues/42",
      summary: "User reports uncertainty about loading the core.",
      disposition:
        "requires one-action Start Core and recovery-flow verification",
    },
    {
      id: "upstream-25",
      state: "open",
      url: "https://github.com/libretro/libretro-2048/issues/25",
      summary: "Upstream enhancement request for a 5x5 mode.",
      disposition: "not required for the VCG qualification candidate",
    },
  ],
  evidence: [
    {
      id: "repository",
      url: "https://github.com/libretro/libretro-2048",
    },
    {
      id: "pinned-commit",
      url: "https://github.com/libretro/libretro-2048/commit/c90437d3c3913999624deca3fb55ecfa632b72c4",
    },
    {
      id: "core-documentation",
      url: "https://docs.libretro.com/library/2048/",
    },
    {
      id: "license-index",
      url: "https://docs.libretro.com/development/licenses/",
    },
    {
      id: "open-issues",
      url: "https://github.com/libretro/libretro-2048/issues",
    },
  ],
});

export function generatedRetroCoreSbom() {
  return JSON.parse(JSON.stringify(RETRO_CORE_CANDIDATE));
}

export function canonicalRetroCoreSbom(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseRetroCoreSbom(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.length === 0 || buffer.length > MAX_SBOM_BYTES) {
    throw new Error("retro core SBOM must be a non-empty bounded document");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  assertNoDuplicateObjectFields(text);
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error("retro core SBOM must be valid UTF-8 JSON");
  }
  validateRetroCoreSbom(document);
  return document;
}

export function validateRetroCoreSbom(document) {
  requireObject(document, "retro core SBOM");
  requireFields(
    document,
    [
      "build",
      "core",
      "documentType",
      "evidence",
      "knownIssues",
      "license",
      "observedOn",
      "runtime",
      "schemaVersion",
      "source",
      "status",
    ],
    "retro core SBOM",
  );
  requireEqual(document.schemaVersion, 1, "schema version");
  requireEqual(
    document.documentType,
    "vcg-retro-core-source-candidate-sbom",
    "document type",
  );
  requireMatch(document.observedOn, DATE, "observation date");
  requireEqual(
    document.status,
    "source-candidate-unqualified",
    "qualification status",
  );
  validateCore(document.core);
  validateSource(document.source);
  validateLicense(document.license);
  validateRuntime(document.runtime);
  validateBuild(document.build);
  validateKnownIssues(document.knownIssues);
  validateEvidence(document.evidence);
  if (!isDeepStrictEqual(document, RETRO_CORE_CANDIDATE)) {
    throw new Error(
      "retro core SBOM must match the reviewed source candidate evidence",
    );
  }
  return document;
}

function assertNoDuplicateObjectFields(text) {
  let offset = 0;

  function skipWhitespace() {
    while (
      offset < text.length
      && (
        text[offset] === " "
        || text[offset] === "\n"
        || text[offset] === "\r"
        || text[offset] === "\t"
      )
    ) {
      offset += 1;
    }
  }

  function parseString() {
    const start = offset;
    if (text[offset] !== '"') {
      throw new Error("retro core SBOM must be valid UTF-8 JSON");
    }
    offset += 1;
    while (offset < text.length) {
      if (text[offset] === "\\") {
        offset += 2;
      } else if (text[offset] === '"') {
        offset += 1;
        try {
          return JSON.parse(text.slice(start, offset));
        } catch {
          throw new Error("retro core SBOM must be valid UTF-8 JSON");
        }
      } else {
        offset += 1;
      }
    }
    throw new Error("retro core SBOM must be valid UTF-8 JSON");
  }

  function parseValue() {
    skipWhitespace();
    if (text[offset] === "{") {
      parseObject();
      return;
    }
    if (text[offset] === "[") {
      parseArray();
      return;
    }
    if (text[offset] === '"') {
      parseString();
      return;
    }
    const start = offset;
    while (
      offset < text.length
      && ![" ", "\n", "\r", "\t", ",", "]", "}"].includes(text[offset])
    ) {
      offset += 1;
    }
    if (offset === start) {
      throw new Error("retro core SBOM must be valid UTF-8 JSON");
    }
  }

  function parseObject() {
    offset += 1;
    skipWhitespace();
    const fields = new Set();
    if (text[offset] === "}") {
      offset += 1;
      return;
    }
    while (offset < text.length) {
      skipWhitespace();
      const field = parseString();
      if (fields.has(field)) {
        throw new Error(`retro core SBOM has duplicate object field: ${field}`);
      }
      fields.add(field);
      skipWhitespace();
      if (text[offset] !== ":") {
        throw new Error("retro core SBOM must be valid UTF-8 JSON");
      }
      offset += 1;
      parseValue();
      skipWhitespace();
      if (text[offset] === "}") {
        offset += 1;
        return;
      }
      if (text[offset] !== ",") {
        throw new Error("retro core SBOM must be valid UTF-8 JSON");
      }
      offset += 1;
    }
    throw new Error("retro core SBOM must be valid UTF-8 JSON");
  }

  function parseArray() {
    offset += 1;
    skipWhitespace();
    if (text[offset] === "]") {
      offset += 1;
      return;
    }
    while (offset < text.length) {
      parseValue();
      skipWhitespace();
      if (text[offset] === "]") {
        offset += 1;
        return;
      }
      if (text[offset] !== ",") {
        throw new Error("retro core SBOM must be valid UTF-8 JSON");
      }
      offset += 1;
    }
    throw new Error("retro core SBOM must be valid UTF-8 JSON");
  }

  parseValue();
  skipWhitespace();
  if (offset !== text.length) {
    throw new Error("retro core SBOM must be valid UTF-8 JSON");
  }
}

function validateCore(core) {
  requireObject(core, "core");
  requireFields(core, ["id", "name", "upstreamAuthors"], "core");
  requireMatch(core.id, SAFE_ID, "core ID");
  requireBoundedString(core.name, 1, 128, "core name");
  requireUniqueStrings(core.upstreamAuthors, 1, 16, "upstream authors");
}

function validateSource(source) {
  requireObject(source, "source");
  requireFields(
    source,
    [
      "observedBranch",
      "publishedRelease",
      "repository",
      "revision",
      "sourceArchive",
      "sourceArchiveSha256",
    ],
    "source",
  );
  requireHttpsUrl(source.repository, "source repository");
  requireBoundedString(source.observedBranch, 1, 64, "observed branch");
  requireMatch(source.revision, REVISION, "source revision");
  requireHttpsUrl(source.sourceArchive, "source archive");
  if (
    !source.sourceArchive.includes(source.revision)
    || source.sourceArchiveSha256 !== null
    || source.publishedRelease !== null
  ) {
    throw new Error(
      "source candidate must retain its unhashed revision archive and no-release boundary",
    );
  }
}

function validateLicense(license) {
  requireObject(license, "license");
  requireFields(
    license,
    [
      "evidence",
      "expression",
      "noticeObligation",
      "reviewStatus",
      "sourceOffer",
    ],
    "license",
  );
  requireEqual(
    license.expression,
    "LicenseRef-Unlicense",
    "core license",
  );
  requireHttpsUrl(license.evidence, "license evidence");
  requireEqual(
    license.reviewStatus,
    "source-text-observed-legal-review-pending",
    "license review status",
  );
  requireEqual(
    license.noticeObligation,
    "retain-exact-license-and-component-attribution",
    "notice obligation",
  );
  requireEqual(
    license.sourceOffer,
    "no-reciprocal-source-offer-identified-retain-exact-source-anyway",
    "source-offer boundary",
  );
}

function validateRuntime(runtime) {
  requireObject(runtime, "runtime");
  requireFields(
    runtime,
    [
      "bios",
      "contentMode",
      "controllerProfile",
      "documentedFeatures",
      "supportsNoGame",
    ],
    "runtime",
  );
  requireEqual(runtime.contentMode, "none", "content mode");
  if (!Array.isArray(runtime.bios) || runtime.bios.length !== 0) {
    throw new Error("contentless 2048 candidate must require no BIOS");
  }
  requireEqual(runtime.supportsNoGame, true, "no-game support");
  requireEqual(
    runtime.controllerProfile,
    "retropad-standard-v1",
    "controller profile",
  );
  requireUniqueStrings(
    runtime.documentedFeatures,
    1,
    32,
    "documented features",
  );
  requireSorted(runtime.documentedFeatures, "documented features");
}

function validateBuild(build) {
  requireObject(build, "build");
  requireFields(
    build,
    [
      "ambiguity",
      "artifactByteLength",
      "artifactSha256",
      "requestedArchitectures",
      "selectedRecipe",
      "sourceDependencies",
    ],
    "build",
  );
  if (
    build.selectedRecipe !== null
    || build.artifactSha256 !== null
    || build.artifactByteLength !== null
  ) {
    throw new Error(
      "unqualified core candidate cannot claim a build recipe or artifact",
    );
  }
  requireArray(build.requestedArchitectures, 2, 2, "architectures");
  const architectureIds = new Set();
  for (const architecture of build.requestedArchitectures) {
    requireObject(architecture, "architecture");
    requireFields(architecture, ["architecture", "status"], "architecture");
    if (
      !["aarch64", "x86_64"].includes(architecture.architecture)
      || architecture.status !== "unverified"
      || architectureIds.has(architecture.architecture)
    ) {
      throw new Error("architectures must be unique and unverified");
    }
    architectureIds.add(architecture.architecture);
  }
  requireArray(build.sourceDependencies, 2, 32, "source dependencies");
  const dependencyIds = new Set();
  for (const dependency of build.sourceDependencies) {
    requireObject(dependency, "source dependency");
    requireFields(
      dependency,
      ["id", "license", "relationship", "reviewStatus"],
      "source dependency",
    );
    requireMatch(dependency.id, SAFE_ID, "source dependency ID");
    if (dependencyIds.has(dependency.id)) {
      throw new Error("source dependency IDs must be unique");
    }
    dependencyIds.add(dependency.id);
    requireEqual(
      dependency.relationship,
      "vendored-source",
      "dependency relationship",
    );
    requireBoundedString(
      dependency.license,
      1,
      64,
      "dependency license",
    );
    requireBoundedString(
      dependency.reviewStatus,
      1,
      128,
      "dependency review status",
    );
  }
  if (
    !build.sourceDependencies.some(
      (dependency) =>
        dependency.id === "libretro-common-subset"
        && dependency.license === "NOASSERTION"
        && dependency.reviewStatus
          === "complete-file-license-review-pending",
    )
  ) {
    throw new Error(
      "vendored libretro-common license uncertainty must remain explicit",
    );
  }
  requireUniqueStrings(build.ambiguity, 3, 16, "build ambiguity");
}

function validateKnownIssues(issues) {
  requireArray(issues, 1, 64, "known issues");
  const ids = new Set();
  for (const issue of issues) {
    requireObject(issue, "known issue");
    requireFields(
      issue,
      ["disposition", "id", "state", "summary", "url"],
      "known issue",
    );
    requireMatch(issue.id, SAFE_ID, "issue ID");
    if (ids.has(issue.id)) throw new Error("known issue IDs must be unique");
    ids.add(issue.id);
    requireEqual(issue.state, "open", "known issue state");
    requireHttpsUrl(issue.url, "known issue URL");
    requireBoundedString(issue.summary, 1, 256, "known issue summary");
    requireBoundedString(
      issue.disposition,
      1,
      256,
      "known issue disposition",
    );
  }
  const crash = issues.find((issue) => issue.id === "upstream-11");
  if (
    crash?.disposition
    !== "blocks qualification until reproduced or closed with target evidence"
  ) {
    throw new Error("open gameplay crash must block qualification");
  }
}

function validateEvidence(evidence) {
  requireArray(evidence, 1, 32, "evidence");
  const ids = new Set();
  for (const item of evidence) {
    requireObject(item, "evidence item");
    requireFields(item, ["id", "url"], "evidence item");
    requireMatch(item.id, SAFE_ID, "evidence ID");
    if (ids.has(item.id)) throw new Error("evidence IDs must be unique");
    ids.add(item.id);
    requireHttpsUrl(item.url, "evidence URL");
  }
  for (const required of [
    "repository",
    "pinned-commit",
    "core-documentation",
    "license-index",
    "open-issues",
  ]) {
    if (!ids.has(required)) {
      throw new Error(`missing required evidence: ${required}`);
    }
  }
}

function requireObject(value, label) {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }
}

function requireFields(value, expected, label) {
  const fields = Object.keys(value).sort();
  const required = [...expected].sort();
  if (
    fields.length !== required.length
    || fields.some((field, index) => field !== required[index])
  ) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}

function requireArray(value, minimum, maximum, label) {
  if (
    !Array.isArray(value)
    || value.length < minimum
    || value.length > maximum
  ) {
    throw new Error(`${label} must be a bounded array`);
  }
}

function requireUniqueStrings(value, minimum, maximum, label) {
  requireArray(value, minimum, maximum, label);
  const unique = new Set();
  for (const item of value) {
    requireBoundedString(item, 1, 512, label);
    if (unique.has(item)) throw new Error(`${label} must be unique`);
    unique.add(item);
  }
}

function requireSorted(value, label) {
  const sorted = [...value].sort();
  if (value.some((item, index) => item !== sorted[index])) {
    throw new Error(`${label} must be sorted`);
  }
}

function requireBoundedString(value, minimum, maximum, label) {
  if (
    typeof value !== "string"
    || value.length < minimum
    || value.length > maximum
  ) {
    throw new Error(`${label} must be a bounded string`);
  }
}

function requireHttpsUrl(value, label) {
  requireBoundedString(value, 1, 2048, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
  ) {
    throw new Error(`${label} must use credential-free HTTPS`);
  }
}

function requireMatch(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} is invalid`);
}

export function isCanonicalSha256(value) {
  return typeof value === "string" && SHA256.test(value);
}
