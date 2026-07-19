import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { resolve } from "node:path";
import { parseGameManifest } from "@vcg/game-manifest";

function parseArguments() {
  const args = process.argv.slice(2);
  const manifestPath = args.find((value) => !value.startsWith("--"));
  if (!manifestPath) throw new Error("Usage: pnpm supervise:game <manifest.json> [--dry-run]");
  return { manifestPath: resolve(manifestPath), dryRun: args.includes("--dry-run") };
}

function chromePath(): string {
  if (process.env.VCG_CHROME_PATH) return process.env.VCG_CHROME_PATH;
  if (platform() === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return "chromium";
}

async function main() {
  const { manifestPath, dryRun } = parseArguments();
  const manifest = parseGameManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  if (manifest.runtime !== "remote-web") throw new Error(`Prototype supervisor supports remote-web only, received ${manifest.runtime}`);

  const profilePath = resolve(homedir(), ".local/share/vcg-console/dev/browser-profiles", manifest.id);
  const browserArgs = [
    `--app=${manifest.entrypoint}`,
    `--user-data-dir=${profilePath}`,
    "--start-fullscreen",
    "--no-first-run",
    "--disable-default-apps",
    "--disable-features=Translate",
  ];

  const launchPlan = {
    manifest: manifest.id,
    runtime: manifest.runtime,
    entrypoint: manifest.entrypoint,
    allowedOrigins: manifest.allowedOrigins,
    timeoutMs: manifest.launch.timeoutMs,
    profilePath,
    browser: chromePath(),
    browserArgs,
    limitations: [
      "This process prototype cannot enforce origin containment after navigation.",
      "Back and Home are not yet global OS-level controls.",
      "Readiness is not yet reported by the hosted game.",
    ],
  };

  if (dryRun) {
    console.log(JSON.stringify(launchPlan, null, 2));
    return;
  }

  console.log(`Launching ${manifest.title}`);
  const child = spawn(chromePath(), browserArgs, { stdio: "inherit" });
  const terminate = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.once("SIGINT", terminate);
  process.once("SIGTERM", terminate);
  child.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    console.log(`Game process exited (${signal ?? code ?? "unknown"})`);
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
