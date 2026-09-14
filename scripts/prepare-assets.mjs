import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { downloadPinnedAsset } from "./download-pinned-asset.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "apps/console-lab/public");

const downloads = [
  {
    name: "MediaPipe Pose Landmarker Lite float16 model",
    kind: "model",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    destination: resolve(publicDir, "models/pose_landmarker_lite.task"),
    bytes: 5_777_746,
    sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  },
  {
    name: "OCR-A 1.0 TrueType font",
    kind: "font",
    url: "https://downloads.sourceforge.net/project/ocr-a-font/OCR-A/1.0/OCRA.ttf?download=1",
    destination: resolve(publicDir, "fonts/OCRA.ttf"),
    bytes: 24_316,
    sha256: "a0f58809705d54108fe41409bae70fbb8315a64e989aaf2afa04d5cfbb94f54e",
    provenance: {
      version: "1.0",
      upstreamProject: "https://sourceforge.net/projects/ocr-a-font/",
      releaseFiles: "https://sourceforge.net/projects/ocr-a-font/files/OCR-A/1.0/",
      upstreamLicenseLabel: "Public Domain",
      notice: "../../../THIRD_PARTY_NOTICES.md#ocr-a-font-10",
      retrievedAt: "2026-07-19",
    },
  },
];

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function download(asset) {
  const result = await downloadPinnedAsset(asset);
  console.log(`${result} ${asset.name}`);
}

await Promise.all(downloads.map(download));

const wasmSource = resolve(root, "apps/console-lab/node_modules/@mediapipe/tasks-vision/wasm");
const wasmDestination = resolve(publicDir, "wasm");
await rm(wasmDestination, { recursive: true, force: true });
await mkdir(wasmDestination, { recursive: true });
await cp(wasmSource, wasmDestination, { recursive: true });
console.log("copied pinned MediaPipe WASM runtime");

// Inter Variable is the launcher's UI text face. It ships from the
// lockfile-pinned @fontsource-variable/inter package rather than a URL so its
// bytes are governed the same way as the MediaPipe WASM runtime.
const interSource = resolve(
  root,
  "apps/console-lab/node_modules/@fontsource-variable/inter",
);
const interAsset = {
  name: "Inter Variable Latin font",
  kind: "font",
  url: "https://www.npmjs.com/package/@fontsource-variable/inter/v/5.3.0",
  bytes: 72_920,
  sha256: "2c295d99e26dcf357d4d01bcf270fd6924b600c9a13dd8c363ef114f4c6976fa",
  provenance: {
    version: "5.3.0",
    upstreamProject: "https://github.com/rsms/inter",
    package: "@fontsource-variable/inter@5.3.0",
    upstreamLicenseLabel: "SIL Open Font License 1.1",
    notice: "../../../THIRD_PARTY_NOTICES.md#inter-variable-font",
  },
};
const interFile = resolve(interSource, "files/inter-latin-standard-normal.woff2");
if ((await readFile(interFile)).length !== interAsset.bytes || await sha256(interFile) !== interAsset.sha256) {
  throw new Error("Inter Variable font differs from its recorded pin");
}
await cp(
  interFile,
  resolve(publicDir, "fonts/InterVariable.woff2"),
);
await cp(resolve(interSource, "LICENSE"), resolve(publicDir, "fonts/InterVariable.LICENSE.txt"));
console.log("copied pinned Inter Variable font");

await writeFile(
  resolve(publicDir, "ASSET_PROVENANCE.json"),
  `${JSON.stringify(
    {
      package: "@mediapipe/tasks-vision@0.10.35",
      generatedBy: "scripts/prepare-assets.mjs",
      assets: [...downloads, interAsset].map(({ name, kind, url, bytes, sha256, provenance }) => ({
        name,
        kind,
        url,
        bytes,
        sha256,
        ...(provenance ? { provenance } : {}),
      })),
    },
    null,
    2,
  )}\n`,
);
