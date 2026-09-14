import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { exactKeys, normalizedText, sha256 } from "./evidence-primitives.mjs";

const path = new URL("../benchmarks/provenance/legacy-measured-source-snapshot-v1.json", import.meta.url);
const metadata = await stat(path);
assert.ok(metadata.isFile() && metadata.size > 0 && metadata.size <= 1024 * 1024, "historical source snapshot size is invalid");
const snapshot = JSON.parse(normalizedText(await readFile(path), "historical source snapshot"));
exactKeys(snapshot, ["format", "retrievedFromCommit", "artifacts", "files"], "historical source snapshot");
assert.equal(snapshot.format, "vcg-historical-source-snapshot/v1");
assert.match(snapshot.retrievedFromCommit, /^[a-f0-9]{40}$/u);
for (const [sourcePath, source] of Object.entries(snapshot.files)) {
  assert.match(sourcePath, /^(?:apps|benchmarks|examples|packages|scripts)\/[a-zA-Z0-9_./-]+$/u);
  assert.ok(!sourcePath.split("/").includes(".."));
  exactKeys(source, ["sha256", "text"], sourcePath);
  assert.equal(typeof source.text, "string");
  assert.equal(sha256(source.text), source.sha256, `${sourcePath} archived bytes drifted`);
}

// A historical observation binds to the source edition that produced it.
// Current validators still enforce the report's independent acceptance rules.
export function historicalSourceSha256(sourcePath) {
  assert.ok(Object.hasOwn(snapshot.files, sourcePath), `no archived source for ${sourcePath}`);
  return snapshot.files[sourcePath].sha256;
}

export function historicalSourceBytes(sourcePath) {
  historicalSourceSha256(sourcePath);
  return Buffer.from(snapshot.files[sourcePath].text, "utf8");
}
