import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

import { parseTrueTypeFont, TTF_LIMITS } from "./ttf-inventory.mjs";
import { validateOcraFontEvidence } from "./validate-ocra-font-evidence.mjs";

const artifactPath = resolve(
  "benchmarks/font-coverage/ocra-font-structural-evidence-v1.json",
);
const fontPath = resolve("apps/console-lab/public/fonts/OCRA.ttf");
let baseline;
let fontBytes;
let temporaryRoot;
let sequence = 0;

before(async () => {
  baseline = JSON.parse(await readFile(artifactPath, "utf8"));
  fontBytes = await readFile(fontPath);
  temporaryRoot = await mkdtemp(join(tmpdir(), "vcg-ocra-evidence-"));
});

after(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

async function validateMutation(mutator) {
  const artifact = structuredClone(baseline);
  mutator(artifact);
  sequence += 1;
  const path = join(temporaryRoot, `mutation-${sequence}.json`);
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`);
  await assert.rejects(validateOcraFontEvidence(path));
}

test("accepts the exact OCR-A structural evidence", async () => {
  const artifact = await validateOcraFontEvidence();
  assert.equal(artifact.subject.bytes, 24_316);
  assert.equal(artifact.sfnt.cmap.mappingCount, 114);
  assert.equal(artifact.coverage.summary.printableAsciiMissingCount, 0);
  assert.equal(artifact.coverage.summary.productionSourceNonAsciiMissingCount, 0);
  assert.equal(artifact.coverage.summary.fallbackRequired, false);
  assert.equal(artifact.disposition.allProductionSourceNonAsciiCoveredByOcra, true);
});

test("rejects format, date, subject, or parser-limit substitution", async () => {
  await validateMutation((artifact) => {
    artifact.format = "vcg-ocra-font-structural-evidence/v2";
  });
  await validateMutation((artifact) => {
    artifact.evidenceDate = "2026-07-25";
  });
  await validateMutation((artifact) => {
    artifact.subject.sha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.parserLimits.maximumBytes += 1;
  });
});

test("rejects sfnt table, name, or metric substitution", async () => {
  await validateMutation((artifact) => {
    artifact.sfnt.tables[0].length += 1;
  });
  await validateMutation((artifact) => {
    artifact.sfnt.names.family = "OCR-A";
  });
  await validateMutation((artifact) => {
    artifact.sfnt.metrics.embeddingFsType = 4;
  });
  await validateMutation((artifact) => {
    artifact.sfnt.metrics.horizontalHeaderAscender = 800;
  });
});

test("rejects cmap selection, count, range, or code-point substitution", async () => {
  await validateMutation((artifact) => {
    artifact.sfnt.cmap.selectedFormat = 12;
  });
  await validateMutation((artifact) => {
    artifact.sfnt.cmap.mappingCount = 115;
  });
  await validateMutation((artifact) => {
    artifact.sfnt.cmap.ranges[0].count -= 1;
  });
  await validateMutation((artifact) => {
    artifact.sfnt.cmap.codePoints[0] = "U+0000";
  });
});

test("rejects coverage-set or summary drift", async () => {
  await validateMutation((artifact) => {
    artifact.coverage.sets[1].missing.push("U+2014");
  });
  await validateMutation((artifact) => {
    artifact.coverage.sets[3].fullyCovered = true;
  });
  await validateMutation((artifact) => {
    artifact.coverage.summary.productionSourceNonAsciiMissingCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.coverage.summary.fallbackRequired = true;
  });
  await validateMutation((artifact) => {
    artifact.disposition.allProductionSourceNonAsciiCoveredByOcra = false;
  });
});

test("rejects source file, code-point, coverage, or occurrence drift", async () => {
  await validateMutation((artifact) => {
    artifact.coverage.productionSource.files[0].sha256 = "f".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.coverage.productionSource.nonAsciiCodePoints[0].fontCovered = false;
  });
  await validateMutation((artifact) => {
    artifact.coverage.productionSource.nonAsciiCodePoints[0].codePoint = "U+00F7";
  });
  await validateMutation((artifact) => {
    artifact.coverage.productionSource.nonAsciiCodePoints[0].occurrences[0].lines[0] += 1;
  });
});

test("rejects provenance drift", async () => {
  await validateMutation((artifact) => {
    artifact.provenance.assetProvenancePathSha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.provenance.stylePath = "apps/console-lab/src/main.ts";
  });
  await validateMutation((artifact) => {
    delete artifact.provenance.parserPathSha256;
  });
});

test("rejects unsupported qualification or release claims", async () => {
  for (const key of [
    "fallbackIdentityVerified",
    "glyphShapesVerified",
    "tvLegibilityVerified",
    "localizationQualified",
    "accessibilityQualified",
    "redistributionApproved",
    "productionReady",
  ]) {
    await validateMutation((artifact) => {
      artifact.disposition[key] = true;
    });
  }
});

test("rejects weakened claim boundary, limitations, or unknown fields", async () => {
  await validateMutation((artifact) => {
    artifact.claimBoundary = "OCR-A is release ready.";
  });
  await validateMutation((artifact) => {
    artifact.limitations.pop();
  });
  await validateMutation((artifact) => {
    artifact.releaseApproved = true;
  });
});

test("bounded parser rejects truncation, oversize input, and duplicate tables", () => {
  assert.throws(() => parseTrueTypeFont(fontBytes.subarray(0, 100)));
  assert.throws(() =>
    parseTrueTypeFont(Buffer.alloc(TTF_LIMITS.maximumBytes + 1)),
  );
  const duplicate = Buffer.from(fontBytes);
  duplicate.copy(duplicate, 12 + 16, 12, 16);
  assert.throws(() => parseTrueTypeFont(duplicate), /duplicate/u);
});

test("bounded parser rejects an escaped table and unsupported sfnt version", () => {
  const escapedTable = Buffer.from(fontBytes);
  escapedTable.writeUInt32BE(escapedTable.length - 1, 12 + 8);
  escapedTable.writeUInt32BE(2, 12 + 12);
  assert.throws(() => parseTrueTypeFont(escapedTable), /exceeds/u);

  const unsupported = Buffer.from(fontBytes);
  unsupported.writeUInt32BE(0x4f54544f, 0);
  assert.throws(() => parseTrueTypeFont(unsupported), /TrueType outlines/u);
});
