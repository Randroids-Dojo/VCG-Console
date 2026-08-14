// Rewrite the frozen expectation tables in the launcher evidence validators
// from the current generated artifacts.
//
// The validators deliberately pin screenshot bytes/digests, measured minima,
// and request manifests so drift fails closed. After a deliberate UI change
// the artifacts are regenerated and these tables must be re-recorded — the
// same re-registration idea as `validate-source-bindings.mjs --write`. Run
// each generator, run this script, then run the generator again so the
// artifact embeds the edited validator's hash, and finish with the validator.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readArtifact(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

async function rewrite(path, edit) {
  const validatorPath = resolve(root, path);
  const before = await readFile(validatorPath, "utf8");
  const after = await edit(before);
  if (after !== before) await writeFile(validatorPath, after);
  console.log(`${after === before ? "unchanged" : "synced"}  ${path}`);
}

function replaceBlock(source, header, body, label) {
  const pattern = new RegExp(
    `const ${header} = Object\\.freeze\\(\\{[\\s\\S]*?\\n\\}\\);`,
  );
  if (!pattern.test(source)) {
    throw new Error(`${label}: const ${header} block not found`);
  }
  return source.replace(pattern, `const ${header} = Object.freeze({\n${body}});`);
}

// --- launcher home -----------------------------------------------------
{
  const artifact = await readArtifact(
    "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-tv-conformance-v1.json",
  );
  await rewrite(
    "scripts/validate-launcher-tv-conformance-evidence.mjs",
    (source) => {
      let shots = "";
      let expectations = "";
      for (const o of artifact.browser.observations) {
        shots += `  "${o.id}": Object.freeze({\n    path:\n      "${o.screenshot.path}",\n    bytes: ${o.screenshot.bytes},\n    sha256:\n      "${o.screenshot.sha256}",\n  }),\n`;
        expectations += `  "${o.id}": Object.freeze({\n    safeArea: Object.freeze({\n      left: ${o.safeArea.left},\n      top: ${o.safeArea.top},\n      right: ${o.safeArea.right},\n      bottom: ${o.safeArea.bottom},\n    }),\n    minimumCriticalTextCssPx: ${o.minimumCriticalTextCssPx},\n    minimumActionTargetWidthCssPx: ${o.minimumActionTargetWidthCssPx},\n    minimumActionTargetHeightCssPx: ${o.minimumActionTargetHeightCssPx},\n  }),\n`;
      }
      let counts = "";
      for (const [path, count] of Object.entries(
        artifact.browser.requestCounts,
      ).sort(([a], [b]) => a.localeCompare(b))) {
        counts += `  "${path}": ${count},\n`;
      }
      source = replaceBlock(source, "frozenScreenshots", shots, "home");
      source = replaceBlock(
        source,
        "observationExpectations",
        expectations,
        "home",
      );
      return replaceBlock(source, "expectedRequestCounts", counts, "home");
    },
  );
}

// --- representative surfaces -------------------------------------------
{
  const artifact = await readArtifact(
    "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json",
  );
  await rewrite(
    "scripts/validate-launcher-tv-surface-evidence.mjs",
    (source) => {
      const key = (o) => `${o.surface}/${o.id}`;
      let shots = "";
      let measurements = "";
      for (const o of artifact.browser.observations) {
        shots += `  "${key(o)}": {\n    path: "${o.screenshot.path}",\n    bytes: ${o.screenshot.bytes},\n    sha256: "${o.screenshot.sha256}",\n  },\n`;
        measurements += `  "${key(o)}": {\n    minimumCriticalTextCssPx: ${o.minimumCriticalTextCssPx},\n    minimumActionTargetWidthCssPx: ${o.minimumActionTargetWidthCssPx},\n    minimumActionTargetHeightCssPx: ${o.minimumActionTargetHeightCssPx},\n  },\n`;
      }
      for (const surface of new Set(
        artifact.browser.observations.map((o) => o.surface),
      )) {
        const observation = artifact.browser.observations.find(
          (o) => o.surface === surface,
        );
        source = source.replace(
          new RegExp(
            `(id: "${surface}",\\n    criticalTextCount: )\\d+(,\\n    actionTargetCount: )\\d+`,
          ),
          `$1${observation.criticalTextCount}$2${observation.actionTargetCount}`,
        );
      }
      source = replaceBlock(source, "EXPECTED_SCREENSHOTS", shots, "surfaces");
      return replaceBlock(
        source,
        "EXPECTED_MEASUREMENTS",
        measurements,
        "surfaces",
      );
    },
  );
}

// --- search states ------------------------------------------------------
{
  const artifact = await readArtifact(
    "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-tv-conformance-v1.json",
  );
  const generator = await readFile(
    resolve(root, "scripts/generate-launcher-search-tv-evidence.mjs"),
    "utf8",
  );
  await rewrite(
    "scripts/validate-launcher-search-tv-evidence.mjs",
    (source) => {
      const statesMatch = generator.match(
        /const SEARCH_STATES = Object\.freeze\(\[[\s\S]*?\n\]\);/,
      );
      if (!statesMatch) throw new Error("search: SEARCH_STATES block not found");
      source = source.replace(
        /const EXPECTED_STATES = Object\.freeze\(\[[\s\S]*?\n\]\);/,
        statesMatch[0].replace("const SEARCH_STATES", "const EXPECTED_STATES"),
      );
      const key = (o) => `${o.state}/${o.id}`;
      let shots = "";
      let measurements = "";
      for (const o of artifact.browser.observations) {
        shots += `  "${key(o)}": {\n    path: "${o.screenshot.path}",\n    bytes: ${o.screenshot.bytes},\n    sha256: "${o.screenshot.sha256}",\n  },\n`;
        const scroll = o.resultsScroll;
        measurements += `  "${key(o)}": {\n    measuredCriticalTextCount: ${o.measuredCriticalTextCount},\n    minimumCriticalTextCssPx: ${o.minimumCriticalTextCssPx},\n    minimumActionTargetWidthCssPx: ${o.minimumActionTargetWidthCssPx},\n    minimumActionTargetHeightCssPx: ${o.minimumActionTargetHeightCssPx},\n    resultsScroll: {\n      clientHeightCssPx: ${scroll.clientHeightCssPx},\n      scrollHeightCssPx: ${scroll.scrollHeightCssPx},\n      initialScrollTopCssPx: ${scroll.initialScrollTopCssPx},\n      finalScrollTopCssPx: ${scroll.finalScrollTopCssPx},\n      maximumScrollTopCssPx: ${scroll.maximumScrollTopCssPx},\n      lastResultInsideViewportAfterFocus: ${scroll.lastResultInsideViewportAfterFocus},\n    },\n  },\n`;
      }
      source = replaceBlock(source, "EXPECTED_SCREENSHOTS", shots, "search");
      return replaceBlock(
        source,
        "EXPECTED_MEASUREMENTS",
        measurements,
        "search",
      );
    },
  );
}

// --- OCR-A platform fallback --------------------------------------------
{
  const artifact = await readArtifact(
    "benchmarks/font-coverage/windows-x64-chrome-151-ocra-platform-fallback-v1.json",
  );
  await rewrite(
    "scripts/validate-ocra-platform-fallback-evidence.mjs",
    (source) => {
      const names = Object.keys(artifact.browser.requestCounts);
      const css = names.find((name) => name.endsWith(".css"));
      const js = names.find((name) => /main-[A-Za-z0-9_-]+\.js$/.test(name));
      return source
        .replace(/\/assets\/main-[A-Za-z0-9_-]+\.css/, css)
        .replace(/\/assets\/main-[A-Za-z0-9_-]+\.js/, js)
        .replace(
          /bytes: [\d_]+,\n  sha256: "[a-f0-9]{64}",\n\}\);/,
          `bytes: ${artifact.screenshot.bytes},\n  sha256: "${artifact.screenshot.sha256}",\n});`,
        );
    },
  );
}
