import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createHostedBrowserPolicy,
  probeHostedBrowserTopLevelLoad,
  requireHealthyHostedEndpoint,
} from "./hosted-browser-supervisor.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  root,
  "benchmarks/hosted-browser/epoch-top-level-windows-v2.json",
);

export const EPOCH_TOP_LEVEL_EVIDENCE_FORMAT =
  "vcg-epoch-top-level-evidence/v1";
export const EPOCH_ENTRYPOINT = "https://epoch-theta.vercel.app/";
export const EPOCH_EVIDENCE_DATE = "2026-07-25";
export const EPOCH_EXPECTED_TITLE = "Epoch";
export const EPOCH_CLAIM_BOUNDARY =
  "One live Windows x64 Chrome desk observation proves that Epoch returned the reviewed restrictive framing headers yet loaded as the sole supervised top-level page under its exact HTTPS origin, then Chrome exited cleanly and the ephemeral profile was removed. It does not prove gameplay readiness, controller input, audio, fullscreen, storage, network degradation, Home/Back recovery, target Linux behavior, or catalog qualification.";
export const EPOCH_LIMITATIONS = Object.freeze([
  "The response still excludes every VCG console origin from frame-ancestors; this evidence uses top-level navigation and does not authorize embedding.",
  "Page load and document.readyState complete are not explicit in-game readiness or playability.",
  "No controller, recovery remote, keyboard-free exit, audio, fullscreen, storage, service worker, login, offline, or network-loss behavior was tested.",
  "The run used one Windows x64 development host and installed Chrome, not either selected Linux appliance or its compositor/service manager.",
  "The probe collected only URL, title, ready state, exit result, and profile removal; it did not inspect or retain game content, player data, or credentials.",
]);

const provenancePaths = {
  supervisorPath: "scripts/hosted-browser-supervisor.ts",
  generatorPath: "scripts/generate-epoch-top-level-evidence.mjs",
  validatorPath: "scripts/validate-epoch-top-level-evidence.mjs",
};

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

async function provenance() {
  const entries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => [
      key,
      path,
      normalizedSha256(await readFile(resolve(root, path))),
    ]),
  );
  return Object.fromEntries(
    entries.flatMap(([key, path, digest]) => [
      [key, path],
      [`${key}Sha256`, digest],
    ]),
  );
}

function installedChromePath() {
  const candidates = [
    process.env.VCG_CHROME_PATH,
    process.env.ProgramFiles
      ? join(
          process.env.ProgramFiles,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : undefined,
    process.env["ProgramFiles(x86)"]
      ? join(
          process.env["ProgramFiles(x86)"],
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : undefined,
    process.env.LOCALAPPDATA
      ? join(
          process.env.LOCALAPPDATA,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : undefined,
  ].filter((candidate) => typeof candidate === "string");
  const browser = candidates.find(existsSync);
  if (!browser) throw new Error("installed Chrome was not found");
  return browser;
}

async function fetchEpochResponse() {
  const response = await fetch(EPOCH_ENTRYPOINT, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200 || response.url !== EPOCH_ENTRYPOINT) {
    throw new Error(
      `Epoch response identity changed: ${response.status} ${response.url}`,
    );
  }
  const contentSecurityPolicy = response.headers.get(
    "content-security-policy",
  );
  const xFrameOptions = response.headers.get("x-frame-options");
  const contentType = response.headers.get("content-type");
  if (
    contentSecurityPolicy
      !== "frame-ancestors 'self' https://randroid.dev https://www.randroid.dev"
    || xFrameOptions !== "ALLOW-FROM https://randroid.dev"
    || contentType !== "text/html; charset=utf-8"
  ) {
    throw new Error("Epoch response headers changed from the reviewed boundary");
  }
  await response.body?.cancel();
  return {
    status: response.status,
    finalUrl: response.url,
    contentType,
    contentSecurityPolicy,
    xFrameOptions,
    consoleOriginFramingAllowed: false,
  };
}

export async function generateEpochTopLevelEvidence() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("this evidence run is frozen to the Windows x64 desk lane");
  }
  const policy = createHostedBrowserPolicy({
    id: "epoch",
    runtime: "remote-web",
    entrypoint: EPOCH_ENTRYPOINT,
    allowedOrigins: ["https://epoch-theta.vercel.app"],
    launch: {
      timeoutMs: 15_000,
      healthCheck: { type: "http", path: "/" },
    },
  });
  const browserPath = installedChromePath();
  const response = await fetchEpochResponse();
  await requireHealthyHostedEndpoint(policy);
  const profilePath = await mkdtemp(
    join(tmpdir(), "vcg-hosted-browser-"),
  );
  const profileCreated = existsSync(profilePath);
  const probe = await probeHostedBrowserTopLevelLoad(
    browserPath,
    profilePath,
    policy,
  );
  const profileRemoved = !existsSync(profilePath);
  if (
    !profileCreated
    || !profileRemoved
    || probe.finalUrl !== EPOCH_ENTRYPOINT
    || probe.title !== EPOCH_EXPECTED_TITLE
    || probe.readyState !== "complete"
    || probe.exitCode !== 0
    || probe.signal !== null
  ) {
    throw new Error(
      `Epoch top-level probe did not meet its exact desk gates: profile=${profileCreated}/${profileRemoved} final=${probe.finalUrl} titleLength=${probe.title.length} ready=${probe.readyState} exit=${String(probe.exitCode)}/${String(probe.signal)}`,
    );
  }
  const retrievedAtUtc = new Date().toISOString();
  if (!retrievedAtUtc.startsWith(`${EPOCH_EVIDENCE_DATE}T`)) {
    throw new Error(
      `this versioned evidence generator is frozen to ${EPOCH_EVIDENCE_DATE}`,
    );
  }

  return {
    format: EPOCH_TOP_LEVEL_EVIDENCE_FORMAT,
    evidenceDate: EPOCH_EVIDENCE_DATE,
    evidenceClass: "live-windows-x64-supervised-top-level-load",
    qualification: "top-level-load-only-not-playability",
    retrievedAtUtc,
    environment: {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      browserVersion: probe.browserProduct,
    },
    response,
    launchPolicy: policy,
    probe: {
      ...probe,
      profileCreated,
      profileRemoved,
    },
    disposition: {
      consoleOriginFramingSupported: false,
      supervisedTopLevelLoadVerified: true,
      embeddingRequired: false,
      headerChangeRequiredForTopLevel: false,
      catalogPlayabilityVerified: false,
      controllerExitVerified: false,
      reservedHomeBackVerified: false,
    },
    summary: {
      httpSuccessCount: 1,
      topLevelLoadCount: 1,
      policyViolationCount: 0,
      playTestCount: 0,
      controllerTestCount: 0,
      participantCount: 0,
    },
    provenance: await provenance(),
    claimBoundary: EPOCH_CLAIM_BOUNDARY,
    limitations: EPOCH_LIMITATIONS,
  };
}

async function main() {
  const artifact = await generateEpochTopLevelEvidence();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote Epoch HTTP ${artifact.response.status} / ${artifact.probe.readyState} top-level load to ${outputPath}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
