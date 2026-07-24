import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gameManifestJsonSchema } from "@vcg/game-manifest";
import {
  bodyProfileConfirmedSelectionJsonSchema,
  bodyProfilePredictionJsonSchema,
  bodyProfileProbeJsonSchema,
  bodyProfileTemplateJsonSchema,
  motionFrameJsonSchema,
  motionGamepadOutputJsonSchema,
  motionGamepadSampleJsonSchema,
  motionTraceJsonSchema,
  optionalMotionCapabilityInventoryJsonSchema,
  optionalMotionCapabilityNegotiationJsonSchema,
  optionalMotionCapabilityQueryJsonSchema,
  playSupportMatrixJsonSchema,
  playerControlAvailabilityJsonSchema,
  trackerHealthEventJsonSchema,
} from "@vcg/motion-contract";
import {
  motionBenchmarkPlanJsonSchema,
  motionBenchmarkResultJsonSchema,
} from "@vcg/motion-contract/benchmark";
import { bridgeClientMessageJsonSchema, bridgeServerMessageJsonSchema } from "@vcg/motion-web-bridge";

async function main(): Promise<void> {
  const outputDirectory = resolve("schemas");
  const artifacts = [
    ["body-profile-template.schema.json", bodyProfileTemplateJsonSchema],
    ["body-profile-probe.schema.json", bodyProfileProbeJsonSchema],
    ["body-profile-prediction.schema.json", bodyProfilePredictionJsonSchema],
    [
      "body-profile-confirmed-selection.schema.json",
      bodyProfileConfirmedSelectionJsonSchema,
    ],
    ["motion-frame.schema.json", motionFrameJsonSchema],
    ["motion-gamepad-sample.schema.json", motionGamepadSampleJsonSchema],
    ["motion-gamepad-output.schema.json", motionGamepadOutputJsonSchema],
    ["motion-trace.schema.json", motionTraceJsonSchema],
    ["tracker-health-event.schema.json", trackerHealthEventJsonSchema],
    ["motion-capability-inventory.schema.json", optionalMotionCapabilityInventoryJsonSchema],
    ["motion-capability-query.schema.json", optionalMotionCapabilityQueryJsonSchema],
    ["motion-capability-negotiation.schema.json", optionalMotionCapabilityNegotiationJsonSchema],
    ["player-control-availability.schema.json", playerControlAvailabilityJsonSchema],
    ["play-support-matrix.schema.json", playSupportMatrixJsonSchema],
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
