import { writeFile } from "node:fs/promises";
import {
  expectedLauncherCatalogSource,
  generatedLauncherCatalogPath,
} from "./launcher-catalog-files";

async function main(): Promise<void> {
  await writeFile(
    generatedLauncherCatalogPath,
    await expectedLauncherCatalogSource(),
    "utf8",
  );
  console.log(`wrote ${generatedLauncherCatalogPath}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
