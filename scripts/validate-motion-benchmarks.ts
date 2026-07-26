import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  motionBenchmarkPlanJsonSchema,
  motionBenchmarkResultJsonSchema,
  requireHouseholdBenchmarkCoverage,
} from "@vcg/motion-contract/benchmark";

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const paths =
    requested.length > 0
      ? requested.map((path) => resolve(path))
      : (await readdir(resolve("benchmarks")))
          .filter((name) => name.endsWith(".json"))
          .sort()
          .map((name) => resolve("benchmarks", name));
  let failures = 0;
  for (const [name, schema] of [
    ["motion-benchmark-plan.schema.json", motionBenchmarkPlanJsonSchema],
    ["motion-benchmark-result.schema.json", motionBenchmarkResultJsonSchema],
  ] as const) {
    const schemaPath = resolve("schemas", name);
    try {
      if ((await readFile(schemaPath, "utf8")) !== `${JSON.stringify(schema, null, 2)}\n`) {
        failures += 1;
        console.error(`${schemaPath}: STALE (run pnpm prepare:schemas)`);
      }
    } catch (error) {
      failures += 1;
      console.error(`${schemaPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const path of paths) {
    try {
      const plan = requireHouseholdBenchmarkCoverage(
        JSON.parse(await readFile(path, "utf8")),
      );
      const attempts = plan.trials.reduce(
        (total, trial) => total + trial.repetitions,
        0,
      );
      console.log(`${path}: valid (${plan.trials.length} trials, ${attempts} attempts)`);
    } catch (error) {
      failures += 1;
      console.error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
