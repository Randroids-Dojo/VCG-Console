import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gameManifestJsonSchema } from "@vcg/game-manifest";
import { motionFrameJsonSchema, trackerHealthEventJsonSchema } from "@vcg/motion-contract";
import {
  motionBenchmarkPlanJsonSchema,
  motionBenchmarkResultJsonSchema,
} from "@vcg/motion-contract/benchmark";
import { bridgeClientMessageJsonSchema, bridgeServerMessageJsonSchema } from "@vcg/motion-web-bridge";

async function main(): Promise<void> {
  const outputDirectory = resolve("schemas");
  const artifacts = [
    ["motion-frame.schema.json", motionFrameJsonSchema],
    ["tracker-health-event.schema.json", trackerHealthEventJsonSchema],
    ["motion-benchmark-plan.schema.json", motionBenchmarkPlanJsonSchema],
    ["motion-benchmark-result.schema.json", motionBenchmarkResultJsonSchema],
    ["game-manifest.schema.json", gameManifestJsonSchema],
    ["motion-bridge-client.schema.json", bridgeClientMessageJsonSchema],
    ["motion-bridge-server.schema.json", bridgeServerMessageJsonSchema],
  ] as const;

  if (process.argv.includes("--check")) {
    for (const [name, schema] of artifacts) {
      const expected = `${JSON.stringify(schema, null, 2)}\n`;
      const actual = await readFile(resolve(outputDirectory, name), "utf8");
      if (actual !== expected) throw new Error(`${name} is stale; run pnpm prepare:schemas`);
      console.log(`verified schemas/${name}`);
    }
    return;
  }

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    artifacts.map(([name, schema]) =>
      writeFile(resolve(outputDirectory, name), `${JSON.stringify(schema, null, 2)}\n`),
    ),
  );
  for (const [name] of artifacts) console.log(`exported schemas/${name}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
