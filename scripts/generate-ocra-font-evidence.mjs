import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compressCodePointRanges,
  formatCodePoint,
  parseTrueTypeFont,
  TTF_LIMITS,
} from "./ttf-inventory.mjs";

export const OCRA_EVIDENCE_FORMAT = "vcg-ocra-font-structural-evidence/v1";
export const OCRA_EVIDENCE_DATE = "2026-07-24";
export const OCRA_CLAIM_BOUNDARY =
  "A dependency-free bounded parser proves the exact prepared OCRA.ttf file identity, selected sfnt metadata, Unicode cmap membership, printable-ASCII coverage, and direct font coverage for non-ASCII code points present in the console-lab production source tree. This is structural inventory evidence only; it does not prove dynamically supplied text coverage, glyph shape, TV-distance legibility, language support, accessibility, browser/platform consistency, redistribution approval, or release readiness.";
export const OCRA_LIMITATIONS = Object.freeze([
  "The audit reads sfnt tables and source text; it does not rasterize glyphs, compare shapes, measure readability, or exercise a physical television.",
  "Non-ASCII source inventory includes code points present in production .css, .svelte, and .ts files, but source presence does not prove every runtime state rendered or every dynamically supplied string.",
  "Current static production-source text is directly covered, but dynamically supplied profile names or future localization may still use the platform fallback stack and vary by operating system and installed fonts.",
  "The upstream Public Domain label and repository notice are provenance evidence, not a legal conclusion or final redistribution approval.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fontRelativePath = "apps/console-lab/public/fonts/OCRA.ttf";
const sourceRootRelativePath = "apps/console-lab/src";
const artifactRelativePath =
  "benchmarks/font-coverage/ocra-font-structural-evidence-v1.json";
const MAX_SOURCE_FILES = 512;
const MAX_SOURCE_FILE_BYTES = 1024 * 1024;
const MAX_SOURCE_TREE_BYTES = 8 * 1024 * 1024;
const sourceExtensions = new Set([".css", ".svelte", ".ts"]);
const provenancePaths = Object.freeze({
  assetProvenancePath: "apps/console-lab/public/ASSET_PROVENANCE.json",
  preparationScriptPath: "scripts/prepare-assets.mjs",
  stylePath: "apps/console-lab/src/styles.css",
  parserPath: "scripts/ttf-inventory.mjs",
  generatorPath: "scripts/generate-ocra-font-evidence.mjs",
  validatorPath: "scripts/validate-ocra-font-evidence.mjs",
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizedSha256(bytes) {
  return sha256(Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n")));
}

function extension(path) {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot);
}

async function listProductionSourceFiles() {
  const sourceRoot = resolve(root, sourceRootRelativePath);
  const pending = [sourceRoot];
  const files = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`source scan rejects symlink: ${relative(root, absolute)}`);
      }
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (entry.isFile() && sourceExtensions.has(extension(entry.name))) {
        files.push(absolute);
      }
    }
  }
  files.sort();
  if (files.length > MAX_SOURCE_FILES) throw new Error("source file limit exceeded");
  return files;
}

function codePointsFor(text) {
  return [...text].map((character) => character.codePointAt(0));
}

function describeSet(id, description, codePoints, cmap, disposition) {
  const unique = [...new Set(codePoints)].sort((left, right) => left - right);
  const covered = unique.filter((codePoint) => cmap.has(codePoint));
  const missing = unique.filter((codePoint) => !cmap.has(codePoint));
  return {
    id,
    description,
    codePointCount: unique.length,
    codePoints: unique.map(formatCodePoint),
    covered: covered.map(formatCodePoint),
    missing: missing.map(formatCodePoint),
    fullyCovered: missing.length === 0,
    disposition,
  };
}

async function inspectProductionSource(cmap) {
  const files = await listProductionSourceFiles();
  const occurrences = new Map();
  const sourceCommitment = [];
  let totalBytes = 0;
  for (const absolute of files) {
    const metadata = await stat(absolute);
    if (!metadata.isFile() || metadata.size > MAX_SOURCE_FILE_BYTES) {
      throw new Error(`source file is invalid or too large: ${relative(root, absolute)}`);
    }
    totalBytes += metadata.size;
    if (totalBytes > MAX_SOURCE_TREE_BYTES) throw new Error("source tree byte limit exceeded");
    const bytes = await readFile(absolute);
    const path = relative(root, absolute).split(sep).join("/");
    const text = bytes.toString("utf8");
    if (Buffer.from(text, "utf8").equals(bytes) === false) {
      throw new Error(`source file is not canonical UTF-8: ${path}`);
    }
    sourceCommitment.push({ path, bytes: bytes.length, sha256: normalizedSha256(bytes) });
    const lines = text.replaceAll("\r\n", "\n").split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      for (const character of lines[lineIndex]) {
        const codePoint = character.codePointAt(0);
        if (codePoint <= 0x7f) continue;
        const key = formatCodePoint(codePoint);
        const entry = occurrences.get(key) ?? {
          codePoint: key,
          character,
          fontCovered: cmap.has(codePoint),
          occurrences: [],
        };
        const fileOccurrence = entry.occurrences.find((item) => item.path === path);
        if (fileOccurrence) {
          if (!fileOccurrence.lines.includes(lineIndex + 1)) fileOccurrence.lines.push(lineIndex + 1);
        } else {
          entry.occurrences.push({ path, lines: [lineIndex + 1] });
        }
        occurrences.set(key, entry);
      }
    }
  }
  const entries = [...occurrences.values()].sort((left, right) =>
    left.codePoint.localeCompare(right.codePoint),
  );
  return {
    fileCount: files.length,
    totalBytes,
    files: sourceCommitment,
    nonAsciiCodePoints: entries,
  };
}

function serializeTable(table) {
  return {
    tag: table.tag,
    checksum: `0x${table.checksum.toString(16).padStart(8, "0")}`,
    offset: table.offset,
    length: table.length,
  };
}

export async function buildOcraFontEvidence() {
  const fontBytes = await readFile(resolve(root, fontRelativePath));
  const parsed = parseTrueTypeFont(fontBytes);
  const cmap = parsed.cmap.best.mappings;
  const source = await inspectProductionSource(cmap);
  const asciiPrintable = Array.from({ length: 95 }, (_, index) => 0x20 + index);
  const sourceNonAscii = source.nonAsciiCodePoints.map(({ codePoint }) =>
    Number.parseInt(codePoint.slice(2), 16),
  );
  const sets = [
    describeSet(
      "ascii-printable",
      "Every printable ASCII code point from SPACE through TILDE.",
      asciiPrintable,
      cmap,
      "Required baseline: OCRA must cover this set directly.",
    ),
    describeSet(
      "console-source-non-ascii",
      "Every non-ASCII code point present in console-lab production CSS, Svelte, and TypeScript source.",
      sourceNonAscii,
      cmap,
      "Missing code points require a fallback or non-font asset; this audit does not approve either.",
    ),
    describeSet(
      "ocr-control-symbols",
      "OCR hook, chair, and fork symbols encoded at U+2440 through U+2442.",
      [0x2440, 0x2441, 0x2442],
      cmap,
      "Inventory only; the console does not currently rely on these symbols.",
    ),
    describeSet(
      "localization-probe",
      "A bounded probe for common Western European accents, smart punctuation, and the euro sign.",
      codePointsFor("ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ‘’“”—…€"),
      cmap,
      "Diagnostic only: this probe is not a localization requirement or supported-locale declaration.",
    ),
  ];
  const provenanceEntries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => {
      const bytes = await readFile(resolve(root, path));
      return [key, path, normalizedSha256(bytes)];
    }),
  );
  const coveredSourceCodePoints = source.nonAsciiCodePoints.filter(
    (entry) => entry.fontCovered,
  );
  const missingSourceCodePoints = source.nonAsciiCodePoints.filter(
    (entry) => !entry.fontCovered,
  );

  return {
    format: OCRA_EVIDENCE_FORMAT,
    evidenceDate: OCRA_EVIDENCE_DATE,
    subject: {
      path: fontRelativePath,
      bytes: fontBytes.length,
      sha256: sha256(fontBytes),
    },
    parserLimits: {
      ...TTF_LIMITS,
      maximumSourceFiles: MAX_SOURCE_FILES,
      maximumSourceFileBytes: MAX_SOURCE_FILE_BYTES,
      maximumSourceTreeBytes: MAX_SOURCE_TREE_BYTES,
    },
    sfnt: {
      scalarVersion: parsed.scalarVersion,
      tableCount: parsed.numTables,
      tables: parsed.tables.map(serializeTable),
      names: parsed.names,
      metrics: parsed.metrics,
      cmap: {
        selectedPlatformId: parsed.cmap.best.platformId,
        selectedEncodingId: parsed.cmap.best.encodingId,
        selectedFormat: parsed.cmap.best.format,
        mappingCount: cmap.size,
        ranges: compressCodePointRanges(cmap.keys()),
        codePoints: [...cmap.keys()].sort((left, right) => left - right).map(formatCodePoint),
        subtables: parsed.cmap.subtables,
      },
    },
    coverage: {
      sets,
      productionSource: source,
      summary: {
        fontCodePointCount: cmap.size,
        printableAsciiCodePointCount: asciiPrintable.length,
        printableAsciiMissingCount: sets[0].missing.length,
        productionSourceNonAsciiCodePointCount: source.nonAsciiCodePoints.length,
        productionSourceNonAsciiCoveredCount: coveredSourceCodePoints.length,
        productionSourceNonAsciiMissingCount: missingSourceCodePoints.length,
        fallbackRequired: missingSourceCodePoints.length > 0,
      },
    },
    provenance: Object.fromEntries(
      provenanceEntries.flatMap(([key, path, digest]) => [
        [key, path],
        [`${key}Sha256`, digest],
      ]),
    ),
    disposition: {
      structuralInventoryVerified: true,
      exactFontIdentityVerified: true,
      printableAsciiCovered: sets[0].fullyCovered,
      allProductionSourceNonAsciiCoveredByOcra: sets[1].fullyCovered,
      fallbackRequired: missingSourceCodePoints.length > 0,
      fallbackIdentityVerified: false,
      glyphShapesVerified: false,
      tvLegibilityVerified: false,
      localizationQualified: false,
      accessibilityQualified: false,
      redistributionApproved: false,
      productionReady: false,
    },
    claimBoundary: OCRA_CLAIM_BOUNDARY,
    limitations: [...OCRA_LIMITATIONS],
  };
}

export async function generateOcraFontEvidence(
  outputPath = resolve(root, artifactRelativePath),
) {
  const evidence = await buildOcraFontEvidence();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const evidence = await generateOcraFontEvidence();
  console.log(
    `wrote ${artifactRelativePath}: ${evidence.sfnt.cmap.mappingCount} cmap code points, ` +
      `${evidence.coverage.summary.productionSourceNonAsciiMissingCount} source fallback code points`,
  );
}
