import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
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
  if (platform() === "win32") {
    const candidates = [
      process.env.ProgramFiles && join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
      process.env["ProgramFiles(x86)"] &&
        join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe"),
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    ].filter((candidate): candidate is string => Boolean(candidate));
    return candidates.find(existsSync) ?? "chrome.exe";
  }
  return "chromium";
}

function dataPath(): string {
  if (process.env.VCG_DATA_PATH) return resolve(process.env.VCG_DATA_PATH);
  if (platform() === "win32" && process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, "VCG Console");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "VCG Console");
  return process.env.XDG_DATA_HOME
    ? join(process.env.XDG_DATA_HOME, "vcg-console")
    : join(homedir(), ".local", "share", "vcg-console");
}

async function requireHealthyEndpoint(
  entrypoint: string,
  path: string | undefined,
  allowedOrigins: readonly string[],
  timeoutMs: number,
): Promise<void> {
  const url = new URL(path ?? "/", entrypoint);
  const normalizedOrigins = new Set(allowedOrigins.map((origin) => new URL(origin).origin));
  if (!normalizedOrigins.has(url.origin)) throw new Error(`Health check origin is not allowed: ${url.origin}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!normalizedOrigins.has(new URL(response.url).origin)) throw new Error(`redirected to disallowed origin ${new URL(response.url).origin}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Health check failed for ${url.href}: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const { manifestPath, dryRun } = parseArguments();
  const manifest = parseGameManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  if (manifest.runtime !== "remote-web") throw new Error(`Prototype supervisor supports remote-web only, received ${manifest.runtime}`);

  const profilePath = join(dataPath(), "dev", "browser-profiles", manifest.id);
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
      "HTTP readiness is checked before launch; explicit in-game readiness is not yet reported.",
    ],
  };

  if (dryRun) {
    console.log(JSON.stringify(launchPlan, null, 2));
    return;
  }

  if (process.env.VCG_ALLOW_UNCONTAINED_BROWSER !== "1") {
    throw new Error(
      "Refusing an uncontained browser launch. A managed navigation policy is not implemented; set VCG_ALLOW_UNCONTAINED_BROWSER=1 only for an explicit development test.",
    );
  }
  if (manifest.launch.healthCheck.type !== "http") {
    throw new Error(`Remote browser prototype requires an HTTP health check, received ${manifest.launch.healthCheck.type}`);
  }
  await requireHealthyEndpoint(
    manifest.entrypoint,
    manifest.launch.healthCheck.path,
    manifest.allowedOrigins,
    manifest.launch.timeoutMs,
  );

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
