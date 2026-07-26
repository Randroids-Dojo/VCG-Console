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
    gitTree: "5b8bcab69dc90185f10356b5780bf9d827684474",
    sourceArchive:
      "https://github.com/libretro/libretro-2048/archive/c90437d3c3913999624deca3fb55ecfa632b72c4.tar.gz",
    sourceArchiveSha256:
      "e60494b1b9b5483227c1f1c3cc06bddba256e9f82c9d6fa7abb1e7b31239f554",
    sourceArchiveByteLength: 2761393,
    archiveAudit: {
      status: "matched-pinned-git-tree",
      method: "git-blob-oid-and-tar-mode-comparison",
      independentDownloadCount: 3,
      committedBlobCount: 475,
      archiveFileCount: 475,
      executableFileCount: 22,
      missingFileCount: 0,
      mismatchedBlobCount: 0,
      extraFileCount: 0,
      executableModeDifferenceCount: 0,
    },
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
        status: "software-build-observed-unqualified",
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
        id: "libretro-common-selected-closure",
        relationship: "vendored-source",
        license: "MIT",
        reviewStatus: "31-selected-files-contain-exact-mit-grant",
      },
      {
        id: "apple-iigs-font-bitmap",
        relationship: "compiled-source-data",
        license: "NOASSERTION",
        reviewStatus: "provenance-and-redistribution-review-pending",
      },
    ],
    softwareBuildObservations: [
      {
        id: "wsl2-ubuntu-26.04-x86-64-gcc-15.2.0",
        status: "ephemeral-software-build-observation-unqualified",
        architecture: "x86_64",
        sourceArchiveSha256:
          "e60494b1b9b5483227c1f1c3cc06bddba256e9f82c9d6fa7abb1e7b31239f554",
        sourceDateEpoch: 1775830798,
        environment: {
          os: "Ubuntu 26.04 LTS",
          executionLayer: "WSL2",
          kernel: "Linux 6.6.87.2-microsoft-standard-WSL2",
          gccTarget: "x86_64-linux-gnu",
          gccVersion: "15.2.0",
          gccPackage: "gcc-15=15.2.0-16ubuntu1",
          binutilsPackage: "binutils=2.46-3ubuntu2",
          makePackage: "make=4.4.1-3",
          glibcPackage: "libc6=2.43-2ubuntu2",
        },
        recipe: {
          makefile: "Makefile.libretro",
          platform: "unix",
          compiler: "gcc",
          gitVersion: "c90437d3",
          translationUnitCount: 16,
          translationUnits: [
            "game_noncairo.c",
            "game_shared.c",
            "libretro-common/compat/compat_posix_string.c",
            "libretro-common/compat/compat_snprintf.c",
            "libretro-common/compat/compat_strcasestr.c",
            "libretro-common/compat/compat_strl.c",
            "libretro-common/compat/fopen_utf8.c",
            "libretro-common/encodings/encoding_utf.c",
            "libretro-common/file/file_path.c",
            "libretro-common/file/file_path_io.c",
            "libretro-common/streams/file_stream.c",
            "libretro-common/streams/file_stream_transforms.c",
            "libretro-common/string/stdstring.c",
            "libretro-common/time/rtime.c",
            "libretro-common/vfs/vfs_implementation.c",
            "libretro.c",
          ],
          trackedBuildInputCount: 39,
          trackedBuildInputs: [
            "Makefile.common",
            "Makefile.libretro",
            "game.h",
            "game_noncairo.c",
            "game_shared.c",
            "game_shared.h",
            "libretro-common/compat/compat_posix_string.c",
            "libretro-common/compat/compat_snprintf.c",
            "libretro-common/compat/compat_strcasestr.c",
            "libretro-common/compat/compat_strl.c",
            "libretro-common/compat/fopen_utf8.c",
            "libretro-common/encodings/encoding_utf.c",
            "libretro-common/file/file_path.c",
            "libretro-common/file/file_path_io.c",
            "libretro-common/include/boolean.h",
            "libretro-common/include/compat/fopen_utf8.h",
            "libretro-common/include/compat/posix_string.h",
            "libretro-common/include/compat/strcasestr.h",
            "libretro-common/include/compat/strl.h",
            "libretro-common/include/encodings/utf.h",
            "libretro-common/include/file/file_path.h",
            "libretro-common/include/libretro.h",
            "libretro-common/include/retro_assert.h",
            "libretro-common/include/retro_common_api.h",
            "libretro-common/include/retro_environment.h",
            "libretro-common/include/retro_inline.h",
            "libretro-common/include/retro_miscellaneous.h",
            "libretro-common/include/streams/file_stream.h",
            "libretro-common/include/string/stdstring.h",
            "libretro-common/include/time/rtime.h",
            "libretro-common/include/vfs/vfs.h",
            "libretro-common/include/vfs/vfs_implementation.h",
            "libretro-common/streams/file_stream.c",
            "libretro-common/streams/file_stream_transforms.c",
            "libretro-common/string/stdstring.c",
            "libretro-common/time/rtime.c",
            "libretro-common/vfs/vfs_implementation.c",
            "libretro.c",
            "noncairo/font2.c",
          ],
          closureSha256:
            "d8e6bfd77bdd20226130f10044196863db8f687c1786ae8db28b4c07c50b6b4c",
          compilerFlags: [
            "-DGIT_VERSION=\\\"c90437d3\\\"",
            "-DNDEBUG",
            "-I./libretro-common/include",
            "-O2",
            "-fPIC",
          ],
          linkerFlags: [
            "-Wl,--no-undefined",
            "-lm",
            "-shared",
          ],
        },
        result: {
          independentBuildCount: 2,
          byteIdentical: true,
          artifactSha256:
            "0f5c3a9b12dbe013da4e2cc29a01f41efd2186cce40bd7463cb8ad5bfabd0a9d",
          artifactByteLength: 90864,
          format: "ELF64 LSB shared object",
          machine: "x86-64",
          dynamicLibraries: ["libc.so.6", "libm.so.6"],
          requiredGlibcVersions: [
            "GLIBC_2.2.5",
            "GLIBC_2.3",
            "GLIBC_2.3.4",
            "GLIBC_2.4",
            "GLIBC_2.14",
            "GLIBC_2.33",
            "GLIBC_2.38",
          ],
          buildId: "065233a8a805690890b95c6318efe3d0a9e8d982",
          temporaryPathLeakObserved: false,
          retained: false,
          loaded: false,
          executed: false,
          scanned: false,
          signed: false,
        },
        limitations: [
          "The output was built twice and compared in one WSL2 host session, not in a hermetic or independently reproduced environment.",
          "The ephemeral output was inspected but not retained, signed, vulnerability-scanned, loaded by a libretro frontend, or executed on target hardware.",
          "Package versions are recorded but their repository snapshots, package hashes, compiler binary hashes, and sysroot contents are not pinned.",
        ],
      },
    ],
    ambiguity: [
      "No target build recipe, compiler, flags, sysroot, or reproducible environment is selected.",
      "The non-Cairo Makefile compiles vendored libretro-common sources, while the README also names fontconfig, FreeType, expat, bzip2, zlib, and iconv for another build path.",
      "The non-Cairo source closure embeds noncairo/font2.c, labeled Apple IIgs Original fonts, without an in-file license or provenance statement.",
      "No ARM64 binary has been built; the ephemeral x86-64 observation is not retained, signed, scanned, frontend-loaded, target-run, or qualified.",
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
      "archiveAudit",
      "gitTree",
      "observedBranch",
      "publishedRelease",
      "repository",
      "revision",
      "sourceArchive",
      "sourceArchiveByteLength",
      "sourceArchiveSha256",
    ],
    "source",
  );
  requireHttpsUrl(source.repository, "source repository");
  requireBoundedString(source.observedBranch, 1, 64, "observed branch");
  requireMatch(source.revision, REVISION, "source revision");
  requireMatch(source.gitTree, REVISION, "source Git tree");
  requireHttpsUrl(source.sourceArchive, "source archive");
  if (
    !source.sourceArchive.includes(source.revision)
    || !isCanonicalSha256(source.sourceArchiveSha256)
    || !Number.isSafeInteger(source.sourceArchiveByteLength)
    || source.sourceArchiveByteLength <= 0
    || source.publishedRelease !== null
  ) {
    throw new Error(
      "source candidate must retain its hashed revision archive and no-release boundary",
    );
  }
  validateArchiveAudit(source.archiveAudit);
}

function validateArchiveAudit(audit) {
  requireObject(audit, "source archive audit");
  requireFields(
    audit,
    [
      "archiveFileCount",
      "committedBlobCount",
      "executableFileCount",
      "executableModeDifferenceCount",
      "extraFileCount",
      "independentDownloadCount",
      "method",
      "mismatchedBlobCount",
      "missingFileCount",
      "status",
    ],
    "source archive audit",
  );
  requireEqual(
    audit.status,
    "matched-pinned-git-tree",
    "source archive audit status",
  );
  requireEqual(
    audit.method,
    "git-blob-oid-and-tar-mode-comparison",
    "source archive audit method",
  );
  for (const [field, value] of Object.entries(audit)) {
    if (
      !["status", "method"].includes(field)
      && (!Number.isSafeInteger(value) || value < 0)
    ) {
      throw new Error("source archive audit counts must be nonnegative");
    }
  }
  if (
    audit.independentDownloadCount < 2
    || audit.committedBlobCount !== audit.archiveFileCount
    || audit.executableFileCount <= 0
    || audit.missingFileCount !== 0
    || audit.mismatchedBlobCount !== 0
    || audit.extraFileCount !== 0
    || audit.executableModeDifferenceCount !== 0
  ) {
    throw new Error("source archive audit must prove exact tree equivalence");
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
      "softwareBuildObservations",
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
  const architectureIds = new Map();
  for (const architecture of build.requestedArchitectures) {
    requireObject(architecture, "architecture");
    requireFields(architecture, ["architecture", "status"], "architecture");
    if (
      !["aarch64", "x86_64"].includes(architecture.architecture)
      || ![
        "software-build-observed-unqualified",
        "unverified",
      ].includes(architecture.status)
      || architectureIds.has(architecture.architecture)
    ) {
      throw new Error(
        "architectures must be unique and retain unqualified status",
      );
    }
    architectureIds.set(architecture.architecture, architecture.status);
  }
  if (
    architectureIds.get("aarch64") !== "unverified"
    || architectureIds.get("x86_64")
      !== "software-build-observed-unqualified"
  ) {
    throw new Error("architecture evidence status is invalid");
  }
  requireArray(build.sourceDependencies, 3, 32, "source dependencies");
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
    if (
      !["compiled-source-data", "vendored-source"].includes(
        dependency.relationship,
      )
    ) {
      throw new Error("dependency relationship is invalid");
    }
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
        dependency.id === "libretro-common-selected-closure"
        && dependency.license === "MIT"
        && dependency.reviewStatus
          === "31-selected-files-contain-exact-mit-grant",
    )
  ) {
    throw new Error(
      "selected libretro-common MIT closure must remain explicit",
    );
  }
  if (
    !build.sourceDependencies.some(
      (dependency) =>
        dependency.id === "apple-iigs-font-bitmap"
        && dependency.relationship === "compiled-source-data"
        && dependency.license === "NOASSERTION"
        && dependency.reviewStatus
          === "provenance-and-redistribution-review-pending",
    )
  ) {
    throw new Error(
      "embedded Apple IIgs font rights uncertainty must remain explicit",
    );
  }
  requireArray(
    build.softwareBuildObservations,
    1,
    16,
    "software build observations",
  );
  const observationIds = new Set();
  for (const observation of build.softwareBuildObservations) {
    validateSoftwareBuildObservation(observation);
    if (observationIds.has(observation.id)) {
      throw new Error("software build observation IDs must be unique");
    }
    observationIds.add(observation.id);
  }
  requireUniqueStrings(build.ambiguity, 4, 16, "build ambiguity");
}

function validateSoftwareBuildObservation(observation) {
  requireObject(observation, "software build observation");
  requireFields(
    observation,
    [
      "architecture",
      "environment",
      "id",
      "limitations",
      "recipe",
      "result",
      "sourceArchiveSha256",
      "sourceDateEpoch",
      "status",
    ],
    "software build observation",
  );
  requireMatch(observation.id, SAFE_ID, "software build observation ID");
  requireEqual(
    observation.status,
    "ephemeral-software-build-observation-unqualified",
    "software build observation status",
  );
  requireEqual(
    observation.architecture,
    "x86_64",
    "software build observation architecture",
  );
  if (
    !isCanonicalSha256(observation.sourceArchiveSha256)
    || !Number.isSafeInteger(observation.sourceDateEpoch)
    || observation.sourceDateEpoch <= 0
  ) {
    throw new Error("software build observation source binding is invalid");
  }
  validateBuildEnvironment(observation.environment);
  validateBuildRecipe(observation.recipe);
  validateBuildResult(observation.result);
  requireUniqueStrings(
    observation.limitations,
    3,
    16,
    "software build observation limitations",
  );
}

function validateBuildEnvironment(environment) {
  requireObject(environment, "software build environment");
  requireFields(
    environment,
    [
      "binutilsPackage",
      "executionLayer",
      "gccPackage",
      "gccTarget",
      "gccVersion",
      "glibcPackage",
      "kernel",
      "makePackage",
      "os",
    ],
    "software build environment",
  );
  for (const [field, value] of Object.entries(environment)) {
    requireBoundedString(value, 1, 256, `build environment ${field}`);
  }
}

function validateBuildRecipe(recipe) {
  requireObject(recipe, "software build recipe");
  requireFields(
    recipe,
    [
      "closureSha256",
      "compiler",
      "compilerFlags",
      "gitVersion",
      "linkerFlags",
      "makefile",
      "platform",
      "trackedBuildInputCount",
      "trackedBuildInputs",
      "translationUnitCount",
      "translationUnits",
    ],
    "software build recipe",
  );
  for (const field of ["compiler", "gitVersion", "makefile", "platform"]) {
    requireBoundedString(recipe[field], 1, 128, `build recipe ${field}`);
  }
  if (
    !isCanonicalSha256(recipe.closureSha256)
    || !Number.isSafeInteger(recipe.translationUnitCount)
    || recipe.translationUnitCount <= 0
    || !Number.isSafeInteger(recipe.trackedBuildInputCount)
    || recipe.trackedBuildInputCount < recipe.translationUnitCount
  ) {
    throw new Error("software build recipe closure is invalid");
  }
  requireUniqueStrings(
    recipe.translationUnits,
    1,
    64,
    "translation units",
  );
  requireSorted(recipe.translationUnits, "translation units");
  requireUniqueStrings(
    recipe.trackedBuildInputs,
    1,
    256,
    "tracked build inputs",
  );
  requireSorted(recipe.trackedBuildInputs, "tracked build inputs");
  if (
    recipe.translationUnits.length !== recipe.translationUnitCount
    || recipe.trackedBuildInputs.length !== recipe.trackedBuildInputCount
    || !recipe.translationUnits.every((path) =>
      recipe.trackedBuildInputs.includes(path)
    )
    || !recipe.trackedBuildInputs.includes("noncairo/font2.c")
  ) {
    throw new Error("software build recipe input closure is invalid");
  }
  requireUniqueStrings(recipe.compilerFlags, 1, 32, "compiler flags");
  requireSorted(recipe.compilerFlags, "compiler flags");
  requireUniqueStrings(recipe.linkerFlags, 1, 32, "linker flags");
  requireSorted(recipe.linkerFlags, "linker flags");
}

function validateBuildResult(result) {
  requireObject(result, "software build result");
  requireFields(
    result,
    [
      "artifactByteLength",
      "artifactSha256",
      "buildId",
      "byteIdentical",
      "dynamicLibraries",
      "executed",
      "format",
      "independentBuildCount",
      "loaded",
      "machine",
      "requiredGlibcVersions",
      "retained",
      "scanned",
      "signed",
      "temporaryPathLeakObserved",
    ],
    "software build result",
  );
  if (
    !Number.isSafeInteger(result.independentBuildCount)
    || result.independentBuildCount < 2
    || result.byteIdentical !== true
    || !isCanonicalSha256(result.artifactSha256)
    || !Number.isSafeInteger(result.artifactByteLength)
    || result.artifactByteLength <= 0
    || !REVISION.test(result.buildId)
  ) {
    throw new Error("software build result identity is invalid");
  }
  requireBoundedString(result.format, 1, 128, "build result format");
  requireBoundedString(result.machine, 1, 64, "build result machine");
  requireUniqueStrings(
    result.dynamicLibraries,
    1,
    32,
    "dynamic libraries",
  );
  requireSorted(result.dynamicLibraries, "dynamic libraries");
  requireUniqueStrings(
    result.requiredGlibcVersions,
    1,
    64,
    "required glibc versions",
  );
  for (const field of [
    "executed",
    "loaded",
    "retained",
    "scanned",
    "signed",
    "temporaryPathLeakObserved",
  ]) {
    requireEqual(result[field], false, `build result ${field}`);
  }
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
