// Register measured baselines after inspecting a fresh browser run. This writes
// data only: validators and reviewed scenario requirements are never rewritten.
// Generate each artifact once, inspect its screenshots, then run this command.
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = resolve(root, "benchmarks/tv-conformance/launcher-baselines-v1.json");
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const authoring = await read("benchmarks/tv-conformance/windows-x64-chrome-150-tv-conformance-v1.json");
const home = await read("benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-tv-conformance-v1.json");
const surfaces = await read("benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json");
const search = await read("benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-tv-conformance-v1.json");
const font = await read("benchmarks/font-coverage/windows-x64-chrome-151-ocra-platform-fallback-v1.json");

const entries = (observations, key, value) => Object.fromEntries(observations.map((observation) => [key(observation), value(observation)]));
const measurements = (observation) => ({
  minimumCriticalTextCssPx: observation.minimumCriticalTextCssPx,
  minimumActionTargetWidthCssPx: observation.minimumActionTargetWidthCssPx,
  minimumActionTargetHeightCssPx: observation.minimumActionTargetHeightCssPx,
});
const screenshot = (observation) => observation.screenshot;
const observation = (artifact) => ({ evidenceDate: artifact.evidenceDate, environment: artifact.environment });
const candidate = {
  format: "vcg-launcher-recorded-baselines/v1",
  home: {
    observation: observation(home),
    screenshots: entries(home.browser.observations, (o) => o.id, screenshot),
    measurements: entries(home.browser.observations, (o) => o.id, (o) => ({ safeArea: o.safeArea, ...measurements(o) })),
    requestCounts: home.browser.requestCounts,
  },
  surfaces: {
    observation: observation(surfaces),
    screenshots: entries(surfaces.browser.observations, (o) => `${o.surface}/${o.id}`, screenshot),
    measurements: entries(surfaces.browser.observations, (o) => `${o.surface}/${o.id}`, measurements),
  },
  search: {
    observation: observation(search),
    screenshots: entries(search.browser.observations, (o) => `${o.state}/${o.id}`, screenshot),
    measurements: entries(search.browser.observations, (o) => `${o.state}/${o.id}`, (o) => ({
      measuredCriticalTextCount: o.measuredCriticalTextCount,
      ...measurements(o),
      resultsScroll: o.resultsScroll,
    })),
  },
  fontFallback: { observation: observation(font), screenshot: font.screenshot, requestCounts: font.browser.requestCounts },
  authoring: { observation: observation(authoring), screenshots: entries(authoring.browser.observations, (o) => o.id, screenshot), measurements: entries(authoring.browser.observations, (o) => o.id, (o) => ({ safeArea: o.safeArea, ...measurements(o) })) },
};

async function publish(text) {
  const temporary = `${baselinePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { flag: "wx" });
    await rename(temporary, baselinePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

const before = await readFile(baselinePath, "utf8");
await publish(`${JSON.stringify(candidate, null, 2)}\n`);
try {
  // Dynamic import reads the candidate baselines. The existing validators still
  // enforce source provenance, PNG identity, privacy, coverage, geometry floors,
  // focus and recovery. A failure restores the previous baseline atomically.
  const { validateTrackedLauncherTvConformanceEvidence } = await import("./validate-launcher-tv-conformance-evidence.mjs");
  const { validateLauncherTvSurfaceEvidence } = await import("./validate-launcher-tv-surface-evidence.mjs");
  const { validateLauncherSearchTvEvidence } = await import("./validate-launcher-search-tv-evidence.mjs");
  const { validateOcraPlatformFallbackEvidence } = await import("./validate-ocra-platform-fallback-evidence.mjs");
  const { validateTrackedTvConformanceEvidence } = await import("./validate-tv-conformance-evidence.mjs");
  await validateTrackedTvConformanceEvidence();
  await validateTrackedLauncherTvConformanceEvidence();
  await validateLauncherTvSurfaceEvidence();
  await validateLauncherSearchTvEvidence();
  await validateOcraPlatformFallbackEvidence();
} catch (error) {
  await publish(before);
  throw error;
}
console.log("Recorded launcher baselines; all five independent validators passed.");
