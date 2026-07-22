import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gameManifestJsonSchema } from "@vcg/game-manifest";
import { motionFrameJsonSchema } from "@vcg/motion-contract";
import { bridgeClientMessageJsonSchema, bridgeServerMessageJsonSchema } from "@vcg/motion-web-bridge";

async function main(): Promise<void> {
  const outputDirectory = resolve("schemas");
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDirectory, "motion-frame.schema.json"), `${JSON.stringify(motionFrameJsonSchema, null, 2)}\n`),
    writeFile(resolve(outputDirectory, "game-manifest.schema.json"), `${JSON.stringify(gameManifestJsonSchema, null, 2)}\n`),
    writeFile(resolve(outputDirectory, "motion-bridge-client.schema.json"), `${JSON.stringify(bridgeClientMessageJsonSchema, null, 2)}\n`),
    writeFile(resolve(outputDirectory, "motion-bridge-server.schema.json"), `${JSON.stringify(bridgeServerMessageJsonSchema, null, 2)}\n`),
  ]);
  console.log("exported schemas/motion-frame.schema.json");
  console.log("exported schemas/game-manifest.schema.json");
  console.log("exported schemas/motion-bridge-client.schema.json");
  console.log("exported schemas/motion-bridge-server.schema.json");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
