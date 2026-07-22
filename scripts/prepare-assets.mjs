import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "apps/console-lab/public");

const downloads = [
  {
    name: "MediaPipe Pose Landmarker Lite float16 model",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    destination: resolve(publicDir, "models/pose_landmarker_lite.task"),
    bytes: 5_777_746,
    sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  },
  {
    name: "OCR-A 1.0 TrueType font",
    url: "https://downloads.sourceforge.net/project/ocr-a-font/OCR-A/1.0/OCRA.ttf?download=1",
    destination: resolve(publicDir, "fonts/OCRA.ttf"),
    bytes: 24_316,
    sha256: "a0f58809705d54108fe41409bae70fbb8315a64e989aaf2afa04d5cfbb94f54e",
  },
];

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function download(asset) {
  await mkdir(dirname(asset.destination), { recursive: true });
  try {
    const existingHash = await sha256(asset.destination);
    if (existingHash === asset.sha256) {
      console.log(`verified ${asset.name}`);
      return;
    }
  } catch {
    // Missing files are downloaded below.
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(asset.url, { redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`${asset.name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== asset.bytes || digest !== asset.sha256) {
    throw new Error(`${asset.name}: expected ${asset.bytes}/${asset.sha256}, received ${bytes.byteLength}/${digest}`);
  }
  await writeFile(asset.destination, bytes);
  console.log(`downloaded ${asset.name}`);
}

await Promise.all(downloads.map(download));

const wasmSource = resolve(root, "apps/console-lab/node_modules/@mediapipe/tasks-vision/wasm");
const wasmDestination = resolve(publicDir, "wasm");
await rm(wasmDestination, { recursive: true, force: true });
await mkdir(wasmDestination, { recursive: true });
await cp(wasmSource, wasmDestination, { recursive: true });
console.log("copied pinned MediaPipe WASM runtime");

await writeFile(
  resolve(publicDir, "ASSET_PROVENANCE.json"),
  `${JSON.stringify(
    {
      package: "@mediapipe/tasks-vision@0.10.35",
      assets: downloads.map(({ name, url, bytes, sha256 }) => ({ name, url, bytes, sha256 })),
    },
    null,
    2,
  )}\n`,
);
