import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  canonicalRetroCoreSbom,
  generatedRetroCoreSbom,
  parseRetroCoreSbom,
  RETRO_CORE_SBOM_PATH,
} from "./retro-core-sbom.mjs";

const expected = canonicalRetroCoreSbom(generatedRetroCoreSbom());
const outputPath = resolve(RETRO_CORE_SBOM_PATH);
const check = process.argv.includes("--check");

if (check) {
  let actual;
  try {
    actual = await readFile(outputPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`retro core SBOM is missing: ${detail}`);
  }
  parseRetroCoreSbom(actual);
  if (!actual.equals(Buffer.from(expected))) {
    throw new Error(
      "retro core SBOM is stale; run pnpm prepare:retro-core-sbom",
    );
  }
  console.log(`verified ${RETRO_CORE_SBOM_PATH}`);
} else {
  await writeFile(outputPath, expected, { encoding: "utf8", flag: "w" });
  console.log(`wrote ${RETRO_CORE_SBOM_PATH}`);
}
