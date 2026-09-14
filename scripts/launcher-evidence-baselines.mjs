import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { exactKeys } from "./evidence-primitives.mjs";

const path = new URL("../benchmarks/tv-conformance/launcher-baselines-v1.json", import.meta.url);
const metadata = await stat(path);
assert.ok(metadata.isFile() && metadata.size > 0 && metadata.size <= 128 * 1024, "launcher baseline size is invalid");
const recorded = JSON.parse(await readFile(path, "utf8"));
exactKeys(recorded, ["format", "home", "surfaces", "search", "fontFallback", "authoring"], "launcher baselines");
assert.equal(recorded.format, "vcg-launcher-recorded-baselines/v1");

for (const section of ["home", "surfaces", "search", "fontFallback", "authoring"]) {
  const observation = recorded[section].observation;
  exactKeys(observation, ["evidenceDate", "environment"], `${section}.observation`);
  assert.match(observation.evidenceDate, /^\d{4}-\d{2}-\d{2}$/u);
  const date = new Date(observation.evidenceDate);
  assert.ok(Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === observation.evidenceDate && date.valueOf() <= Date.now(), `${section} has an invalid observation date`);
  const environment = observation.environment;
  assert.match(environment.nodeVersion ?? environment.node, /^v\d+\.\d+\.\d+$/u);
  assert.match(environment.browserProduct, /^Chrome\/\d+\.\d+\.\d+\.\d+$/u);
}

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Only observations live here. State coverage, privacy, geometry floors,
// readiness and focus requirements remain in the independent validators.
export const launcherBaselines = freeze(recorded);
