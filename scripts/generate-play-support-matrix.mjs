import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPlaySupportMatrix } from "@vcg/motion-contract";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
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

async function buildProvenance() {
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

export async function generatePlaySupportMatrix() {
  return buildPlaySupportMatrix(await buildProvenance());
}

async function main() {
  const artifact = await generatePlaySupportMatrix();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${artifact.summary.scenarioCount} scenarios / ${artifact.summary.controlAssessmentCount} control assessments to ${outputPath}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
