import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAY_SUPPORT_SCENARIO_IDS,
  PlaySupportMatrixSchema,
  buildPlaySupportMatrix,
} from "@vcg/motion-contract";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/play-support/seated-partial-assisted-synthetic-matrix-v1.json",
);

const provenancePaths = {
  implementationPath: "packages/motion-contract/src/play-support-matrix.ts",
  generatorPath: "scripts/generate-play-support-matrix.mjs",
  validatorPath: "scripts/validate-play-support-matrix.mjs",
};

function sha256(value) {
  const normalized = value.toString("utf8").replaceAll("\r\n", "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

async function expectedProvenance() {
  const [implementation, generator, validator] = await Promise.all([
    readFile(resolve(root, provenancePaths.implementationPath)),
    readFile(resolve(root, provenancePaths.generatorPath)),
    readFile(resolve(root, provenancePaths.validatorPath)),
  ]);
  return {
    ...provenancePaths,
    implementationSha256: sha256(implementation),
    generatorSha256: sha256(generator),
    validatorSha256: sha256(validator),
  };
}

function exactKeys(value, expected, path) {
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${path} keys must be exactly ${expected.join(", ")}`,
  );
}

export function validatePlaySupportMatrix(value, provenance) {
  const artifact = PlaySupportMatrixSchema.parse(value);
  assert.deepEqual(
    artifact.scenarios.map(({ scenarioId }) => scenarioId),
    PLAY_SUPPORT_SCENARIO_IDS,
    "scenarios must contain every frozen scenario exactly once and in order",
  );
  for (const [scenarioIndex, scenario] of artifact.scenarios.entries()) {
    assert.deepEqual(
      scenario.controls.map(({ controlGroup }) => controlGroup),
      [
        "menuSelect",
        "menuBackPause",
        "menuSwipe",
        "gameDodge",
        "gameDuck",
        "gameJump",
      ],
      `scenarios[${scenarioIndex}].controls must contain every control exactly once and in order`,
    );
    for (const [controlIndex, control] of scenario.controls.entries()) {
      const path = `scenarios[${scenarioIndex}].controls[${controlIndex}]`;
      if (control.supportLabel === "controller-alternate-only") {
        assert.ok(control.alternateMapping, `${path}.alternateMapping must be explicit`);
      } else {
        assert.equal(
          control.alternateMapping,
          null,
          `${path}.alternateMapping must be null without controller-alternate-only`,
        );
      }
      if (control.safetyGate !== "permitted") {
        assert.notEqual(
          control.supportLabel,
          "synthetic-motion-path",
          `${path} cannot authorize a safety-blocked body path`,
        );
      }
    }
  }
  assert.equal(
    artifact.summary.syntheticMotionPathCount +
      artifact.summary.controllerAlternateOnlyCount +
      artifact.summary.unsupportedCount,
    artifact.summary.controlAssessmentCount,
    "summary support counts must cover every control assessment",
  );
  assert.deepEqual(artifact.provenance, provenance, "provenance hashes must match sources");
  const expected = buildPlaySupportMatrix(provenance);
  assert.deepEqual(
    artifact,
    expected,
    "tracked artifact must exactly match deterministic evaluation",
  );
  return artifact;
}

export async function validateTrackedPlaySupportMatrix() {
  const raw = JSON.parse(await readFile(artifactPath, "utf8"));
  return validatePlaySupportMatrix(raw, await expectedProvenance());
}

async function main() {
  const artifact = await validateTrackedPlaySupportMatrix();
  exactKeys(
    artifact,
    [
      "schemaVersion",
      "artifactId",
      "evidenceClass",
      "evidenceDate",
      "qualification",
      "policy",
      "scenarios",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  console.log(
    `validated ${artifact.summary.scenarioCount} seated/partial/assisted scenarios without qualification claims`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
