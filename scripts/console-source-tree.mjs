import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizedText } from "./evidence-primitives.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const productionSourceTreeRoots = Object.freeze([
  "scripts/console-server.mts",
  "scripts/console-response-headers.mts",
  "scripts/console-source-tree.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "apps/console-lab/package.json",
  "apps/console-lab/index.html",
  "apps/console-lab/vite.config.ts",
  "apps/console-lab/src",
  "packages/game-manifest/src",
  "packages/launcher-catalog/src",
  "packages/motion-contract/src",
  "packages/motion-web-bridge/src",
  "packages/retro-firmware-contract/src",
  "packages/retro-import-contract/src",
]);

async function collectSourceTreeFiles(path) {
  const absolute = resolve(root, path);
  const metadata = await stat(absolute);
  if (metadata.isFile()) return /\.test\.[cm]?[jt]s$/u.test(path) ? [] : [path.replaceAll("\\", "/")];
  assert.equal(metadata.isDirectory(), true);
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) =>
        collectSourceTreeFiles(
          `${path.replaceAll("\\", "/")}/${entry.name}`,
        )
      ),
  );
  return nested.flat();
}

export async function sourceTreeCommitment() {
  const paths = (
    await Promise.all(
      productionSourceTreeRoots.map(collectSourceTreeFiles),
    )
  ).flat().sort();
  const hash = createHash("sha256");
  for (const path of paths) {
    const bytes = await readFile(resolve(root, path));
    hash.update(path);
    hash.update("\0");
    hash.update(normalizedText(bytes, path));
    hash.update("\0");
  }
  return {
    roots: productionSourceTreeRoots,
    fileCount: paths.length,
    sha256: hash.digest("hex"),
  };
}
