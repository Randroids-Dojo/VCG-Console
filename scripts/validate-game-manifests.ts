import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { GameManifestSchema } from "@vcg/game-manifest";

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const paths = requested.length > 0 ? requested.map((path) => resolve(path)) : (await readdir(resolve("catalog"))).filter((name) => name.endsWith(".vcg-game.json")).sort().map((name) => resolve("catalog", name));
  let failures = 0;

  for (const path of paths) {
    try {
      const parsed = GameManifestSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
      if (!parsed.success) {
        failures += 1;
        console.error(`${path}: INVALID`);
        for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".") || "manifest"}: ${issue.message}`);
      } else {
        console.log(`${path}: valid (${parsed.data.runtime}, ${parsed.data.compatibilityStatus})`);
      }
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
