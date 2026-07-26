import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildLauncherCatalog,
  serializeLauncherCatalogModule,
  type LauncherCatalog,
} from "@vcg/launcher-catalog";

export const launcherPolicyPath = resolve("catalog", "launcher-policy.json");
export const generatedLauncherCatalogPath = resolve(
  "apps",
  "console-lab",
  "src",
  "launcher",
  "catalog.generated.ts",
);

export async function loadCanonicalLauncherCatalog(): Promise<LauncherCatalog> {
  const catalogDirectory = resolve("catalog");
  const manifestNames = (await readdir(catalogDirectory))
    .filter((name) => name.endsWith(".vcg-game.json"))
    .sort();
  const manifestInputs = await Promise.all(
    manifestNames.map(async (name) =>
      JSON.parse(await readFile(resolve(catalogDirectory, name), "utf8")),
    ),
  );
  const policyInput = JSON.parse(await readFile(launcherPolicyPath, "utf8"));
  return buildLauncherCatalog(manifestInputs, policyInput);
}

export async function expectedLauncherCatalogSource(): Promise<string> {
  return serializeLauncherCatalogModule(await loadCanonicalLauncherCatalog());
}
