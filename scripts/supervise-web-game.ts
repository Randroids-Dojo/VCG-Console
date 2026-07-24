import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseGameManifest } from "@vcg/game-manifest";
import {
  buildHostedBrowserArguments,
  createHostedBrowserPolicy,
  requireHealthyHostedEndpoint,
  runSupervisedHostedBrowser,
} from "./hosted-browser-supervisor";

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

async function main() {
  const { manifestPath, dryRun } = parseArguments();
  const manifest = parseGameManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const policy = createHostedBrowserPolicy(manifest);
  const browser = chromePath();

  const launchPlan = {
    policy,
    profilePath: "<fresh operating-system temporary directory>",
    browser,
    browserArgs: buildHostedBrowserArguments("<ephemeral-profile>"),
    limitations: [
      "Back and Home are not yet global OS-level controls.",
      "A successful document load is not explicit in-game readiness.",
      "Desk process-tree cleanup is not target service-manager or cgroup containment.",
      "Target Linux compositor, service-manager, resource, and crash qualification remain.",
    ],
  };

  if (dryRun) {
    console.log(JSON.stringify(launchPlan, null, 2));
    return;
  }

  await requireHealthyHostedEndpoint(policy);
  const profilePath = await mkdtemp(
    join(tmpdir(), "vcg-hosted-browser-"),
  );
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    console.log(`Launching ${manifest.title}`);
    const result = await runSupervisedHostedBrowser({
      browserPath: browser,
      policy,
      profilePath,
      signal: abortController.signal,
      onStatus: ({ phase, detail }) => {
        console.log(`[${phase}] ${detail}`);
      },
    });
    console.log(JSON.stringify(result));
    if (
      result.code === "POLICY_VIOLATION"
      || result.code === "BROWSER_CRASHED"
    ) {
      process.exitCode = 1;
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
