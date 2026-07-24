import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalRetroCoreSbom,
  generatedRetroCoreSbom,
  isCanonicalSha256,
  parseRetroCoreSbom,
  RETRO_CORE_CANDIDATE,
  RETRO_CORE_SBOM_PATH,
  validateRetroCoreSbom,
} from "./retro-core-sbom.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sbomPath = resolve(repositoryRoot, RETRO_CORE_SBOM_PATH);
const generatorPath = resolve(
  repositoryRoot,
  "scripts/generate-retro-core-sbom.mjs",
);

function rejectMutation(mutator, expected = /invalid|must|candidate|boundary/) {
  const candidate = generatedRetroCoreSbom();
  mutator(candidate);
  assert.throws(() => validateRetroCoreSbom(candidate), expected);
}

test("checked-in SBOM is canonical, current, and generator-verified", async () => {
  const bytes = await readFile(sbomPath);
  const document = parseRetroCoreSbom(bytes);

  assert.deepEqual(document, generatedRetroCoreSbom());
  assert.equal(bytes.toString("utf8"), canonicalRetroCoreSbom(document));
  assert.deepEqual(document, RETRO_CORE_CANDIDATE);

  const check = spawnSync(
    process.execPath,
    [generatorPath, "--check"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /verified .*libretro-2048\.candidate\.json/);
});

test("parser rejects empty, oversized, malformed, and invalid UTF-8 input", () => {
  assert.throws(
    () => parseRetroCoreSbom(Buffer.alloc(0)),
    /non-empty bounded document/,
  );
  assert.throws(
    () => parseRetroCoreSbom(Buffer.alloc(64 * 1024 + 1, 0x20)),
    /non-empty bounded document/,
  );
  assert.throws(
    () => parseRetroCoreSbom(Buffer.from("{", "utf8")),
    /valid UTF-8 JSON/,
  );
  assert.throws(
    () => parseRetroCoreSbom(Buffer.from([0xc3, 0x28])),
    /encoded data was not valid for encoding utf-8/,
  );
});

test("parser rejects duplicate object fields, including escaped aliases", () => {
  const duplicate = canonicalRetroCoreSbom(generatedRetroCoreSbom()).replace(
    '"schemaVersion": 1,',
    '"schemaVersion": 1,\n  "schemaVersion": 1,',
  );
  assert.throws(
    () => parseRetroCoreSbom(duplicate),
    /duplicate object field: schemaVersion/,
  );

  assert.throws(
    () => parseRetroCoreSbom('{"core":1,"c\\u006fre":2}'),
    /duplicate object field: core/,
  );
});

test("closed objects reject unknown and missing fields", () => {
  rejectMutation(
    (candidate) => {
      candidate.unreviewed = true;
    },
    /unknown or missing fields/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.unreviewed = true;
    },
    /unknown or missing fields/,
  );
  rejectMutation(
    (candidate) => {
      delete candidate.source.observedBranch;
    },
    /unknown or missing fields/,
  );
});

test("source revision, tree, archive hash, and release boundaries are locked", () => {
  rejectMutation((candidate) => {
    candidate.source.revision = "a".repeat(40);
    candidate.source.sourceArchive =
      `https://github.com/libretro/libretro-2048/archive/${candidate.source.revision}.tar.gz`;
  });
  rejectMutation((candidate) => {
    candidate.source.gitTree = "a".repeat(40);
  });
  rejectMutation((candidate) => {
    candidate.source.sourceArchive =
      "https://example.com/substituted-source.tar.gz";
  });
  rejectMutation(
    (candidate) => {
      candidate.source.sourceArchiveSha256 = null;
    },
    /hashed revision archive/,
  );
  rejectMutation(
    (candidate) => {
      candidate.source.sourceArchiveByteLength += 1;
    },
    /reviewed source candidate evidence/,
  );
  rejectMutation(
    (candidate) => {
      candidate.source.publishedRelease =
        "https://github.com/libretro/libretro-2048/releases/tag/v1";
    },
    /no-release boundary/,
  );
});

test("archive audit cannot hide download or tree-equivalence failures", () => {
  rejectMutation(
    (candidate) => {
      candidate.source.archiveAudit.independentDownloadCount = 1;
    },
    /must prove exact tree equivalence/,
  );
  for (const field of [
    "missingFileCount",
    "mismatchedBlobCount",
    "extraFileCount",
    "executableModeDifferenceCount",
  ]) {
    rejectMutation(
      (candidate) => {
        candidate.source.archiveAudit[field] = 1;
      },
      /must prove exact tree equivalence/,
    );
  }
  rejectMutation(
    (candidate) => {
      candidate.source.archiveAudit.committedBlobCount -= 1;
    },
    /must prove exact tree equivalence/,
  );
});

test("unqualified candidate cannot claim recipes, artifacts, or qualification", () => {
  rejectMutation((candidate) => {
    candidate.status = "qualified";
  });
  rejectMutation(
    (candidate) => {
      candidate.build.selectedRecipe = "linux-gcc";
    },
    /cannot claim a build recipe or artifact/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.artifactSha256 = "0".repeat(64);
    },
    /cannot claim a build recipe or artifact/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.artifactByteLength = 1;
    },
    /cannot claim a build recipe or artifact/,
  );
});

test("architecture entries remain unique and explicitly unqualified", () => {
  rejectMutation(
    (candidate) => {
      candidate.build.requestedArchitectures[0].status = "qualified";
    },
    /retain unqualified status/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.requestedArchitectures[1].architecture = "aarch64";
    },
    /retain unqualified status/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.requestedArchitectures.reverse();
    },
    /reviewed source candidate evidence/,
  );
});

test("contentless and no-BIOS runtime boundary cannot be weakened", () => {
  rejectMutation((candidate) => {
    candidate.runtime.contentMode = "managed";
  });
  rejectMutation(
    (candidate) => {
      candidate.runtime.bios.push("firmware.bin");
    },
    /must require no BIOS/,
  );
  rejectMutation((candidate) => {
    candidate.runtime.supportsNoGame = false;
  });
  rejectMutation((candidate) => {
    candidate.runtime.documentedFeatures.pop();
  });
});

test("license review, notice, and source retention remain pending and exact", () => {
  rejectMutation((candidate) => {
    candidate.license.expression = "MIT";
  });
  rejectMutation((candidate) => {
    candidate.license.reviewStatus = "approved";
  });
  rejectMutation((candidate) => {
    candidate.license.noticeObligation = "none";
  });
  rejectMutation((candidate) => {
    candidate.license.sourceOffer = "not-required";
  });
});

test("selected MIT closure and embedded-font uncertainty cannot be weakened", () => {
  rejectMutation(
    (candidate) => {
      candidate.build.sourceDependencies[1].license = "NOASSERTION";
    },
    /selected libretro-common MIT closure must remain explicit/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.sourceDependencies[1].reviewStatus = "complete";
    },
    /selected libretro-common MIT closure must remain explicit/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.sourceDependencies[2].id =
        candidate.build.sourceDependencies[0].id;
    },
    /IDs must be unique/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.sourceDependencies[2].license = "MIT";
    },
    /embedded Apple IIgs font rights uncertainty must remain explicit/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.sourceDependencies =
        candidate.build.sourceDependencies.slice(0, 2);
    },
    /source dependencies must be a bounded array/,
  );
});

test("ephemeral x86-64 build observation cannot become qualification", () => {
  for (const field of [
    "executed",
    "loaded",
    "retained",
    "scanned",
    "signed",
    "temporaryPathLeakObserved",
  ]) {
    rejectMutation(
      (candidate) => {
        candidate.build.softwareBuildObservations[0].result[field] = true;
      },
      new RegExp(`build result ${field} is invalid`),
    );
  }
  rejectMutation(
    (candidate) => {
      candidate.build.softwareBuildObservations[0]
        .result.independentBuildCount = 1;
    },
    /software build result identity is invalid/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.softwareBuildObservations[0].result.byteIdentical =
        false;
    },
    /software build result identity is invalid/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.softwareBuildObservations[0].result.artifactSha256 =
        "0".repeat(64);
    },
    /reviewed source candidate evidence/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.softwareBuildObservations[0].recipe
        .trackedBuildInputCount = 15;
    },
    /software build recipe closure is invalid/,
  );
  rejectMutation(
    (candidate) => {
      const recipe =
        candidate.build.softwareBuildObservations[0].recipe;
      recipe.trackedBuildInputs =
        recipe.trackedBuildInputs.filter(
          (path) => path !== "noncairo/font2.c",
        );
      recipe.trackedBuildInputCount = recipe.trackedBuildInputs.length;
    },
    /software build recipe input closure is invalid/,
  );
  rejectMutation(
    (candidate) => {
      const recipe =
        candidate.build.softwareBuildObservations[0].recipe;
      recipe.trackedBuildInputs[1] = recipe.trackedBuildInputs[0];
    },
    /tracked build inputs must be unique/,
  );
  rejectMutation(
    (candidate) => {
      candidate.build.softwareBuildObservations[0].recipe.closureSha256 =
        "0".repeat(64);
    },
    /reviewed source candidate evidence/,
  );
});

test("open crash issue and its blocking disposition cannot be erased", () => {
  rejectMutation(
    (candidate) => {
      candidate.knownIssues = candidate.knownIssues.filter(
        (issue) => issue.id !== "upstream-11",
      );
    },
    /open gameplay crash must block qualification/,
  );
  rejectMutation(
    (candidate) => {
      candidate.knownIssues[0].state = "closed";
    },
    /known issue state is invalid/,
  );
  rejectMutation(
    (candidate) => {
      candidate.knownIssues[0].disposition = "accepted";
    },
    /open gameplay crash must block qualification/,
  );
});

test("issue and evidence identifiers must be unique and required evidence remains", () => {
  rejectMutation(
    (candidate) => {
      candidate.knownIssues[1].id = candidate.knownIssues[0].id;
    },
    /known issue IDs must be unique/,
  );
  rejectMutation(
    (candidate) => {
      candidate.evidence[1].id = candidate.evidence[0].id;
    },
    /evidence IDs must be unique/,
  );
  rejectMutation(
    (candidate) => {
      candidate.evidence = candidate.evidence.filter(
        (item) => item.id !== "open-issues",
      );
    },
    /missing required evidence: open-issues/,
  );
});

test("canonical SHA-256 helper accepts only lowercase 64-hex values", () => {
  assert.equal(isCanonicalSha256("0".repeat(64)), true);
  assert.equal(isCanonicalSha256("A".repeat(64)), false);
  assert.equal(isCanonicalSha256("0".repeat(63)), false);
  assert.equal(isCanonicalSha256(null), false);
});
