import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAYER_SESSION_ADVERSARIAL_EVIDENCE_FORMAT,
  generatePlayerSessionAdversarialEvidence,
} from "./generate-player-session-adversarial-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/player-session-interference/camera-free-authority-rehearsal-v1.json",
);
const MAX_ARTIFACT_BYTES = 64 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const SCENARIO_CONTRACT = [
  {
    id: "passive-spectator",
    checks: [
      "passive-detection-no-join",
      "spectator-no-control",
      "spectator-action-ignored",
    ],
    finalPhase: "setup",
  },
  {
    id: "pet-mirror-television",
    checks: [
      "joined-track-stable",
      "outsiders-no-control",
      "outsider-actions-ignored",
      "joined-action-wins",
    ],
    finalPhase: "paused",
  },
  {
    id: "passerby-during-loss",
    checks: [
      "passerby-no-silent-recovery",
      "recovery-stays-frozen",
      "passerby-no-recovery-control",
      "original-player-explicit-resume",
    ],
    finalPhase: "playing",
  },
  {
    id: "deliberate-one-player-takeover",
    checks: [
      "replacement-does-not-auto-takeover",
      "explicit-one-player-takeover",
    ],
    finalPhase: "playing",
  },
  {
    id: "multiplayer-outsider-recovery",
    checks: [
      "missing-player-not-substituted",
      "explicit-roster-reduction",
    ],
    finalPhase: "playing",
  },
];

const INTERFERENCE_CLASSES = [
  "spectator",
  "pet",
  "mirror",
  "television-person",
  "passerby",
];

const METRIC_KEYS = [
  "falseCandidateObservations",
  "falseJoins",
  "falseControls",
  "unintendedTakeovers",
  "falseActions",
  "explicitTakeovers",
];

const FORBIDDEN_REPORT_KEYS = new Set([
  "image",
  "images",
  "portrait",
  "portraits",
  "landmark",
  "landmarks",
  "embedding",
  "embeddings",
  "bodyMeasurement",
  "bodyMeasurements",
  "displayName",
  "filePath",
  "rawFrame",
  "rawFrames",
]);

function exactKeys(value, expected, path) {
  assertObject(value, path);
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${path} keys must be exactly ${expected.join(", ")}`,
  );
}

function assertObject(value, path) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`,
  );
}

function assertSafeText(value, path, maxLength = 512) {
  assert.equal(typeof value, "string", `${path} must be a string`);
  assert.ok(value.length > 0 && value.length <= maxLength, `${path} length is invalid`);
  assert.equal(value.trim(), value, `${path} must not have outer whitespace`);
  assert.ok(!/[\u0000-\u001f\u007f]/u.test(value), `${path} contains control characters`);
}

function assertNonnegativeInteger(value, path, maximum = 10_000) {
  assert.ok(
    Number.isInteger(value) && value >= 0 && value <= maximum,
    `${path} must be a bounded nonnegative integer`,
  );
}

function assertNoForbiddenKeys(value, path = "report") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!FORBIDDEN_REPORT_KEYS.has(key), `${path}.${key} is prohibited`);
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

function validateMetrics(value, path) {
  exactKeys(value, METRIC_KEYS, path);
  for (const key of METRIC_KEYS) {
    assertNonnegativeInteger(value[key], `${path}.${key}`);
  }
}

function addMetrics(left, right) {
  return Object.fromEntries(
    METRIC_KEYS.map((key) => [key, left[key] + right[key]]),
  );
}

function validateReport(report) {
  exactKeys(
    report,
    [
      "schemaVersion",
      "source",
      "scenarios",
      "coveredInterferenceClasses",
      "totals",
      "passed",
      "qualificationBoundary",
    ],
    "artifact.report",
  );
  assert.equal(
    report.schemaVersion,
    "player-session-adversarial-synthetic/v1",
    "artifact.report.schemaVersion is invalid",
  );
  assert.equal(report.source, "camera-free synthetic tracks");
  assert.ok(Array.isArray(report.scenarios), "artifact.report.scenarios must be an array");
  assert.equal(report.scenarios.length, SCENARIO_CONTRACT.length);

  let calculatedTotals = Object.fromEntries(METRIC_KEYS.map((key) => [key, 0]));
  for (const [scenarioIndex, expected] of SCENARIO_CONTRACT.entries()) {
    const scenario = report.scenarios[scenarioIndex];
    const path = `artifact.report.scenarios[${scenarioIndex}]`;
    exactKeys(
      scenario,
      ["id", "title", "interferenceClasses", "checks", "metrics", "finalPhase"],
      path,
    );
    assert.equal(scenario.id, expected.id, `${path}.id is substituted or reordered`);
    assert.match(scenario.id, SAFE_ID_PATTERN);
    assertSafeText(scenario.title, `${path}.title`, 128);
    assert.ok(Array.isArray(scenario.interferenceClasses));
    assert.ok(scenario.interferenceClasses.length >= 1);
    assert.deepEqual(
      [...new Set(scenario.interferenceClasses)],
      scenario.interferenceClasses,
      `${path}.interferenceClasses must be unique`,
    );
    for (const interferenceClass of scenario.interferenceClasses) {
      assert.ok(
        INTERFERENCE_CLASSES.includes(interferenceClass),
        `${path}.interferenceClasses contains an unknown class`,
      );
    }
    assert.ok(Array.isArray(scenario.checks));
    assert.deepEqual(
      scenario.checks.map(({ id }) => id),
      expected.checks,
      `${path}.checks are substituted or reordered`,
    );
    for (const [checkIndex, check] of scenario.checks.entries()) {
      const checkPath = `${path}.checks[${checkIndex}]`;
      exactKeys(check, ["id", "passed", "detail"], checkPath);
      assert.match(check.id, SAFE_ID_PATTERN);
      assert.equal(check.passed, true, `${checkPath}.passed must be true`);
      assertSafeText(check.detail, `${checkPath}.detail`, 256);
    }
    validateMetrics(scenario.metrics, `${path}.metrics`);
    assert.equal(scenario.finalPhase, expected.finalPhase, `${path}.finalPhase is invalid`);
    calculatedTotals = addMetrics(calculatedTotals, scenario.metrics);
  }
  assert.deepEqual(
    report.coveredInterferenceClasses,
    INTERFERENCE_CLASSES,
    "artifact.report.coveredInterferenceClasses must be complete and ordered",
  );
  validateMetrics(report.totals, "artifact.report.totals");
  assert.deepEqual(report.totals, calculatedTotals, "artifact.report.totals are inconsistent");
  assert.equal(report.passed, true, "artifact.report.passed must be true");
  assertSafeText(report.qualificationBoundary, "artifact.report.qualificationBoundary", 256);
  assertNoForbiddenKeys(report);
}

function validateProvenance(provenance) {
  exactKeys(
    provenance,
    [
      "controllerPath",
      "rehearsalPath",
      "generatorPath",
      "validatorPath",
      "controllerSha256",
      "rehearsalSha256",
      "generatorSha256",
      "validatorSha256",
    ],
    "artifact.provenance",
  );
  const expectedPaths = {
    controllerPath: "apps/console-lab/src/player-session.ts",
    rehearsalPath: "apps/console-lab/src/player-session-adversarial.ts",
    generatorPath: "scripts/generate-player-session-adversarial-evidence.mjs",
    validatorPath: "scripts/validate-player-session-adversarial-evidence.mjs",
  };
  for (const [key, expected] of Object.entries(expectedPaths)) {
    assert.equal(provenance[key], expected, `artifact.provenance.${key} is invalid`);
  }
  for (const key of [
    "controllerSha256",
    "rehearsalSha256",
    "generatorSha256",
    "validatorSha256",
  ]) {
    assert.match(provenance[key], SHA256_PATTERN, `artifact.provenance.${key} is invalid`);
  }
}

export function validatePlayerSessionAdversarialEvidence(value, expected) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "invariant",
      "report",
      "summary",
      "provenance",
      "privacy",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, PLAYER_SESSION_ADVERSARIAL_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, "2026-07-24");
  assert.equal(value.evidenceClass, "camera-free-synthetic-state-machine");
  assert.equal(value.qualification, "not-physical-qualification");
  assertSafeText(value.invariant, "artifact.invariant", 512);
  validateReport(value.report);
  exactKeys(
    value.summary,
    [
      "scenarioCount",
      "checkCount",
      "interferenceClassCount",
      "falseCandidateObservations",
      "authorityFailureCount",
      "explicitTakeoverCount",
      "allChecksPassed",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    scenarioCount: 5,
    checkCount: 15,
    interferenceClassCount: 5,
    falseCandidateObservations: 12,
    authorityFailureCount: 0,
    explicitTakeoverCount: 1,
    allChecksPassed: true,
  });
  validateProvenance(value.provenance);
  exactKeys(
    value.privacy,
    [
      "rawFramesRetained",
      "imagesRetained",
      "landmarksRetained",
      "bodyMeasurementsRetained",
      "biometricIdentityUsed",
      "durableIdentityUsed",
      "syntheticTrackIdsOnly",
    ],
    "artifact.privacy",
  );
  assert.deepEqual(value.privacy, {
    rawFramesRetained: false,
    imagesRetained: false,
    landmarksRetained: false,
    bodyMeasurementsRetained: false,
    biometricIdentityUsed: false,
    durableIdentityUsed: false,
    syntheticTrackIdsOnly: true,
  });
  assertSafeText(value.claimBoundary, "artifact.claimBoundary", 768);
  assert.ok(Array.isArray(value.limitations) && value.limitations.length === 4);
  value.limitations.forEach((limitation, index) =>
    assertSafeText(limitation, `artifact.limitations[${index}]`, 320),
  );
  assert.deepEqual(value, expected, "artifact must exactly match deterministic evidence");
  return value;
}

function parseBoundedJson(bytes) {
  assert.ok(bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES, "artifact byte size is invalid");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

export async function validateTrackedPlayerSessionAdversarialEvidence() {
  const [bytes, expected] = await Promise.all([
    readFile(artifactPath),
    generatePlayerSessionAdversarialEvidence(),
  ]);
  return validatePlayerSessionAdversarialEvidence(parseBoundedJson(bytes), expected);
}

async function main() {
  const artifact = await validateTrackedPlayerSessionAdversarialEvidence();
  console.log(
    `validated ${artifact.summary.scenarioCount} scenarios / ${artifact.summary.checkCount} checks with ${artifact.summary.authorityFailureCount} authority failures`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
