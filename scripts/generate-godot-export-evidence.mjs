import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const GODOT_EXPORT_EVIDENCE_FORMAT =
  "vcg-godot-export-evidence/v1";
export const GODOT_EXPORT_EVIDENCE_DATE = "2026-07-24";
export const GODOT_VERSION = "4.7.1.stable.official.a13da4feb";
export const GODOT_TEMPLATE_VERSION = "4.7.1.stable";
export const GODOT_EXPORT_NODE_VERSION = "v24.18.0";
export const GODOT_EXPORT_BROWSER_PRODUCT = "Chrome/150.0.7871.182";
export const GODOT_EXPORT_WSL_KERNEL =
  "Linux 6.6.87.2-microsoft-standard-WSL2 x86_64 GNU/Linux";
export const GODOT_TEMPLATE_ARCHIVE = Object.freeze({
  url: "https://github.com/godotengine/godot-builds/releases/download/4.7.1-stable/Godot_v4.7.1-stable_export_templates.tpz",
  bytes: 1_280_486_955,
  sha256: "86409db6200b6f8fd3230989c2d2002851f3dd18acf11d7bdbafddf5a0dd0f72",
});
export const GODOT_EXPORT_CLAIM_BOUNDARY =
  "One Windows x64 desk run with exact Godot 4.7.1 templates proves that the tiny Motion sample exported to unthreaded Web, Linux x86-64, and Linux ARM64; the Web build reached a bounded diagnostic state in installed Chrome and accepted two keyboard fallback actions; and the Linux x86-64 build booted headlessly under WSL2. It does not prove a real controller, live Motion bridge negotiation, native Motion IPC, target Linux or ARM64 execution, compositor recovery controls, signed-package launch, camera-to-action latency, or product qualification.";
export const GODOT_EXPORT_LIMITATIONS = Object.freeze([
  "The browser exercise used keyboard events as the sample's fallback input and did not connect a physical gamepad, recovery remote, camera, tracker, or participant.",
  "The web export loaded from a random loopback HTTP origin in installed Chrome; it did not negotiate the Motion bridge, run under the console wrapper, or prove production origin and permission authority.",
  "The Linux x86-64 executable booted under WSL2 on the Windows development host, not either selected ordinary Linux appliance, its GPU/audio stack, compositor, or service manager.",
  "The Linux ARM64 output was identified structurally as AArch64 but was not executed on ARM64 hardware or an emulator.",
  "Release files are retained only as ignored local build artifacts; the tracked evidence records their exact hashes and sizes but does not sign, distribute, sandbox, or qualify them.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectPath = resolve(root, "examples/godot-motion-game");
const outputRoot = resolve(root, "artifacts/godot-motion");
const artifactPath = resolve(
  root,
  "benchmarks/godot/windows-x64-godot-4.7.1-export-v1.json",
);
const provenancePaths = Object.freeze({
  projectPath: "examples/godot-motion-game/project.godot",
  scenePath: "examples/godot-motion-game/main.tscn",
  mainScriptPath: "examples/godot-motion-game/scripts/main.gd",
  gameScriptPath: "examples/godot-motion-game/scripts/motion_game.gd",
  presetPath: "examples/godot-motion-game/export_presets.cfg",
  generatorPath: "scripts/generate-godot-export-evidence.mjs",
  validatorPath: "scripts/validate-godot-export-evidence.mjs",
});
export const GODOT_INSTALLED_TEMPLATES = Object.freeze([
  Object.freeze({
    name: "linux_debug.arm64",
    bytes: 68_111_656,
    sha256: "90b31e8d23d9929b9640409a0d229c7bb8a1e63fadb9ceb2a20b6ba476f81d39",
  }),
  Object.freeze({
    name: "linux_debug.x86_64",
    bytes: 73_675_128,
    sha256: "0b20d290d99ab6e73b1b5888bea582859fde5be8116160f0eb192cc1b2611808",
  }),
  Object.freeze({
    name: "linux_release.arm64",
    bytes: 67_046_672,
    sha256: "96b9343e2747d373ba6c4d21df168dbc76e5cf373904b74b255504d7ab51af9f",
  }),
  Object.freeze({
    name: "linux_release.x86_64",
    bytes: 73_470_264,
    sha256: "2cb27aee3f7fdf763d0ae16972f6975606959a071f4cd33f6ef1429eb8385049",
  }),
  Object.freeze({
    name: "version.txt",
    bytes: 13,
    sha256: "233b4ce93ffa3c6bc967b45dcfcdf2d29c7d65878d0af6d2fc7c95661d585013",
  }),
  Object.freeze({
    name: "web_debug.zip",
    bytes: 10_342_565,
    sha256: "105e3b45b64e149bccfb137a1ebc1dd35019d025b0a5a8b33d1f9f66b0d54b68",
  }),
  Object.freeze({
    name: "web_dlink_debug.zip",
    bytes: 12_124_531,
    sha256: "bd3581067e1a0f321a1df1c027a30ea74eaced7305052e3f82e281b2e122fdf4",
  }),
  Object.freeze({
    name: "web_dlink_nothreads_debug.zip",
    bytes: 12_013_956,
    sha256: "2f3015c397d86c62e9b1fbbbb58bd2d7e443de72dde10388334b72d080239ca2",
  }),
  Object.freeze({
    name: "web_dlink_nothreads_release.zip",
    bytes: 11_548_067,
    sha256: "553026cc96519da0db3a2dcae493ba9497ca34bbe15e21f0be68713079c81541",
  }),
  Object.freeze({
    name: "web_dlink_release.zip",
    bytes: 11_567_332,
    sha256: "3d9a4f7963759b31d9bc19fffe0991b7348eeeb970187c9f09bbf1aa843a0c6c",
  }),
  Object.freeze({
    name: "web_nothreads_debug.zip",
    bytes: 10_231_638,
    sha256: "eb6ca0ca168c405e73b20a4439d6dc048d74ae65eb31cc7675b6bc3cf7ad1815",
  }),
  Object.freeze({
    name: "web_nothreads_release.zip",
    bytes: 10_246_274,
    sha256: "b7b7d7da29fc6cc2f4934fdd26cc571a40e7af57f716ea3eb7e18da720dae28a",
  }),
  Object.freeze({
    name: "web_release.zip",
    bytes: 10_289_612,
    sha256: "fbf25789a657fc484e4ae9befd7bab8e4919d6ab758bef96a9ea05ba82097406",
  }),
]);
export const GODOT_EXPECTED_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: "artifacts/godot-motion/web/index.apple-touch-icon.png",
    bytes: 11_944,
    sha256: "01d4f63e525941e06ce74f5187dad030d20a8d52a07ce365ae4e94af97a3b1f5",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/web/index.audio.position.worklet.js",
    bytes: 2_973,
    sha256: "be33985bc7160d6bf9646f259cd86b259cd67b02ccb297ee5c44f8ac84327bc8",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/web/index.audio.worklet.js",
    bytes: 7_298,
    sha256: "5b476a9c9ce642c0ee4256436d1bc31d9c38f868aca0f9a8e2a57c18d2dec2a3",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/web/index.html",
    bytes: 5_449,
    sha256: "f4680a7c520c0e26b5709ef6dd34db53b7dce65f46393ba8e1b2f2d98e4e3dc2",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/web/index.icon.png",
    bytes: 5_700,
    sha256: "ad3c35ad0facf487c618204bd98db543034fc95224eadc7f08c7a9ff38d5b3b5",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/web/index.js",
    bytes: 279_815,
    sha256: "68586d6daafc93c6e697b3fb258976874aa7459b8931165ebb1dc3c9614cc42c",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/web/index.pck",
    bytes: 20_232,
    sha256: "b36484dfaf3ee798a3152fc859bf7d11b90917438036a84d6f9a10e1c9eefc5a",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/web/index.png",
    bytes: 21_443,
    sha256: "3cb4495c0b98dfbe4b663cbf2b6836473572339beb66d902367893162a70be0e",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/web/index.wasm",
    bytes: 39_513_091,
    sha256: "35116f68540ac41acf7d71ea457added91b5e960a9cca3e2acc72918eaf01277",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/linux-x86_64/vcg-tiny-motion-game.pck",
    bytes: 20_232,
    sha256: "b36484dfaf3ee798a3152fc859bf7d11b90917438036a84d6f9a10e1c9eefc5a",
  }),
  Object.freeze({
    path:
      "artifacts/godot-motion/linux-x86_64/vcg-tiny-motion-game.x86_64",
    bytes: 73_470_264,
    sha256: "2cb27aee3f7fdf763d0ae16972f6975606959a071f4cd33f6ef1429eb8385049",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/linux-arm64/vcg-tiny-motion-game.arm64",
    bytes: 67_046_672,
    sha256: "96b9343e2747d373ba6c4d21df168dbc76e5cf373904b74b255504d7ab51af9f",
  }),
  Object.freeze({
    path: "artifacts/godot-motion/linux-arm64/vcg-tiny-motion-game.pck",
    bytes: 20_232,
    sha256: "b36484dfaf3ee798a3152fc859bf7d11b90917438036a84d6f9a10e1c9eefc5a",
  }),
]);

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
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

function findGodot() {
  const candidates = [process.env.GODOT_BIN, "godot", "godot4"];
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const packagesRoot = join(
      process.env.LOCALAPPDATA,
      "Microsoft",
      "WinGet",
      "Packages",
    );
    try {
      for (const packageDirectory of readdirSync(packagesRoot, {
        withFileTypes: true,
      })) {
        if (
          !packageDirectory.isDirectory()
          || !packageDirectory.name.startsWith("GodotEngine.GodotEngine_")
        ) {
          continue;
        }
        const installationRoot = join(packagesRoot, packageDirectory.name);
        for (const entry of readdirSync(installationRoot, {
          withFileTypes: true,
        })) {
          if (
            entry.isFile()
            && /^Godot_v.+_win64_console\.exe$/u.test(entry.name)
          ) {
            candidates.push(join(installationRoot, entry.name));
          }
        }
      }
    } catch {
      // The standard command candidates still provide a useful failure.
    }
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    const result = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (
      !result.error
      && result.status === 0
      && String(result.stdout).trim() === GODOT_VERSION
    ) {
      return candidate;
    }
  }
  throw new Error(`exact Godot ${GODOT_VERSION} was not found`);
}

function findChrome() {
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

async function verifyTemplates() {
  assert.ok(process.env.APPDATA, "APPDATA is required");
  const templateRoot = resolve(
    process.env.APPDATA,
    "Godot",
    "export_templates",
    GODOT_TEMPLATE_VERSION,
  );
  const actual = [];
  for (const expected of GODOT_INSTALLED_TEMPLATES) {
    const path = resolve(templateRoot, expected.name);
    const metadata = await stat(path);
    const sha256 = await sha256File(path);
    assert.equal(metadata.size, expected.bytes, `${expected.name} size drift`);
    assert.equal(sha256, expected.sha256, `${expected.name} digest drift`);
    actual.push({ ...expected });
  }
  assert.equal(
    (await readFile(resolve(templateRoot, "version.txt"), "utf8")).trim(),
    GODOT_TEMPLATE_VERSION,
  );
  return actual;
}

function requireContainedOutput(path) {
  const resolvedPath = resolve(path);
  const expectedPrefix = `${resolve(root, "artifacts")}${sep}`;
  assert.ok(
    resolvedPath.startsWith(expectedPrefix),
    "Godot export output must stay inside the ignored artifacts directory",
  );
  return resolvedPath;
}

function runGodotExport(godot, preset, outputPath) {
  outputPath = requireContainedOutput(outputPath);
  const result = spawnSync(
    godot,
    [
      "--headless",
      "--path",
      projectPath,
      "--export-release",
      preset,
      outputPath,
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
      windowsHide: true,
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (
    result.error
    || result.status !== 0
    || /\b(?:SCRIPT ERROR|ERROR):/u.test(output)
  ) {
    throw new Error(
      `Godot ${preset} export failed: ${result.error?.message ?? `status ${result.status}`}`,
    );
  }
}

async function inventoryDirectory(directory, expectedNames) {
  const names = (await readdir(directory)).sort();
  assert.deepEqual(names, [...expectedNames].sort());
  const files = await Promise.all(
    names.map(async (name) => {
      const path = resolve(directory, name);
      const metadata = await stat(path);
      assert.ok(metadata.isFile() && metadata.size > 0);
      return {
        path: relative(root, path).replaceAll("\\", "/"),
        bytes: metadata.size,
        sha256: await sha256File(path),
      };
    }),
  );
  return {
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
}

async function readElf(path, expectedMachine, expectedMachineCode) {
  const bytes = (await readFile(path)).subarray(0, 64);
  assert.deepEqual([...bytes.subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46]);
  assert.equal(bytes[4], 2, "ELF must be 64 bit");
  assert.equal(bytes[5], 1, "ELF must be little endian");
  assert.equal(bytes.readUInt16LE(18), expectedMachineCode);
  return {
    class: "ELF64",
    endianness: "little",
    machine: expectedMachine,
    machineCode: expectedMachineCode,
  };
}

function windowsPathToWsl(path) {
  const match = /^([A-Za-z]):\\(.*)$/u.exec(resolve(path));
  assert.ok(match, "WSL evidence requires a drive-letter Windows path");
  assert.ok(!match[2].includes("'"), "WSL evidence path cannot contain quotes");
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

function runWslBoot(executablePath) {
  const directory = windowsPathToWsl(dirname(executablePath));
  const executable = basename(executablePath);
  assert.match(executable, /^[A-Za-z0-9._-]+$/u);
  const command =
    `cd '${directory}' && chmod +x '${executable}'`
    + ` && timeout 10s ./'${executable}' --headless --quit-after 1`;
  const result = spawnSync("wsl.exe", ["--", "bash", "-lc", command], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: 20_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `WSL x86-64 boot failed: ${result.error?.message ?? `status ${result.status}`}`,
    );
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const engineBanner = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith("Godot Engine "));
  assert.equal(
    engineBanner,
    `Godot Engine v${GODOT_VERSION} - https://godotengine.org`,
  );
  const kernel = spawnSync("wsl.exe", ["--", "uname", "-srmo"], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  assert.equal(kernel.status, 0);
  assert.equal(String(kernel.stdout).trim(), GODOT_EXPORT_WSL_KERNEL);
  return {
    attempted: true,
    environment: "WSL2-not-target-Linux",
    kernel: GODOT_EXPORT_WSL_KERNEL,
    exitCode: result.status,
    signal: result.signal,
    engineBanner,
  };
}

const contentTypes = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pck": "application/octet-stream",
  ".png": "image/png",
  ".wasm": "application/wasm",
});

async function startStaticServer(webRoot) {
  const allowed = new Set(await readdir(webRoot));
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405).end();
        return;
      }
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (
        !allowed.has(name)
        || name.includes("/")
        || name.includes("\\")
        || name.includes("..")
      ) {
        response.writeHead(404).end();
        return;
      }
      const path = resolve(webRoot, name);
      const extension = name.slice(name.lastIndexOf("."));
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type":
          contentTypes[extension] ?? "application/octet-stream",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(path).pipe(response);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/index.html`,
    close: () =>
      new Promise((resolveClose, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolveClose();
        });
      }),
  };
}

async function exerciseWebExport(webRoot, chromePath) {
  const requireFromConsoleLab = createRequire(
    resolve(root, "apps/console-lab/package.json"),
  );
  const { chromium } = requireFromConsoleLab("@playwright/test");
  const server = await startStaticServer(webRoot);
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--disable-gpu"],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const successfulResponsePaths = new Set();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    requestFailures.push({
      path: new URL(request.url()).pathname,
      resourceType: request.resourceType(),
      error: request.failure()?.errorText ?? "unknown failure",
    });
  });
  page.on("response", (response) => {
    if (response.status() === 200) {
      successfulResponsePaths.add(new URL(response.url()).pathname);
    }
  });
  const started = performance.now();
  try {
    const response = await page.goto(server.url, {
      waitUntil: "load",
      timeout: 20_000,
    });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(
      () => globalThis.__vcgGodotExportProbe?.schemaVersion === 1,
      undefined,
      { timeout: 20_000 },
    );
    const readyMs = performance.now() - started;
    const initial = await page.evaluate(
      () => globalThis.__vcgGodotExportProbe,
    );
    assert.deepEqual(initial, {
      schemaVersion: 1,
      lane: 1,
      stance: "standing",
      score: 0,
      inputSource: "waiting",
      status: "WAITING FOR PLAYER",
    });
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(
      () =>
        globalThis.__vcgGodotExportProbe?.score === 100
        && globalThis.__vcgGodotExportProbe?.lane === 0,
      undefined,
      { timeout: 5_000 },
    );
    const afterLeft = await page.evaluate(
      () => globalThis.__vcgGodotExportProbe,
    );
    assert.deepEqual(afterLeft, {
      schemaVersion: 1,
      lane: 0,
      stance: "standing",
      score: 100,
      inputSource: "controller",
      status: "CONTROLLER LEFT",
    });
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () =>
        globalThis.__vcgGodotExportProbe?.score === 200
        && globalThis.__vcgGodotExportProbe?.stance === "jumping",
      undefined,
      { timeout: 5_000 },
    );
    const afterJump = await page.evaluate(
      () => globalThis.__vcgGodotExportProbe,
    );
    assert.deepEqual(afterJump, {
      schemaVersion: 1,
      lane: 0,
      stance: "jumping",
      score: 200,
      inputSource: "controller",
      status: "CONTROLLER JUMP",
    });
    const document = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      return {
        title: document.title,
        readyState: document.readyState,
        canvasCount: document.querySelectorAll("canvas").length,
        canvasWidth: canvas?.width ?? 0,
        canvasHeight: canvas?.height ?? 0,
      };
    });
    assert.deepEqual(document, {
      title: "VCG Tiny Motion Game",
      readyState: "complete",
      canvasCount: 1,
      canvasWidth: 960,
      canvasHeight: 540,
    });
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(
      requestFailures,
      [
        {
          path: "/index.wasm",
          resourceType: "fetch",
          error: "net::ERR_ABORTED",
        },
      ],
      `request-failure shape changed: ${JSON.stringify(requestFailures)}`,
    );
    const requiredAssetPaths = [
      "/index.html",
      "/index.js",
      "/index.pck",
      "/index.wasm",
    ];
    for (const path of requiredAssetPaths) {
      assert.ok(
        successfulResponsePaths.has(path),
        `required browser asset did not return HTTP 200: ${path}`,
      );
    }
    return {
      browserProduct: `Chrome/${browser.version()}`,
      originClass: "random-loopback-http",
      path: "/index.html",
      httpStatus: 200,
      readyMs: Number(readyMs.toFixed(3)),
      document,
      initial,
      afterLeft,
      afterJump,
      keyboardFallbackActionCount: 2,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      requiredAssetHttpSuccessCount: requiredAssetPaths.length,
      requestFailureCount: 1,
      abortedWasmFetchCount: 1,
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

export async function generateGodotExportEvidence() {
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "x64");
  assert.equal(process.version, GODOT_EXPORT_NODE_VERSION);
  const retrievedAtUtc = new Date().toISOString();
  assert.ok(
    retrievedAtUtc.startsWith(`${GODOT_EXPORT_EVIDENCE_DATE}T`),
    `this versioned evidence generator is frozen to ${GODOT_EXPORT_EVIDENCE_DATE}`,
  );
  const godot = findGodot();
  const chrome = findChrome();
  const templates = await verifyTemplates();
  requireContainedOutput(outputRoot);
  await rm(outputRoot, { recursive: true, force: true });
  const webRoot = resolve(outputRoot, "web");
  const x86Root = resolve(outputRoot, "linux-x86_64");
  const armRoot = resolve(outputRoot, "linux-arm64");
  await Promise.all(
    [webRoot, x86Root, armRoot].map((path) =>
      mkdir(requireContainedOutput(path), { recursive: true }),
    ),
  );
  const webOutput = resolve(webRoot, "index.html");
  const x86Output = resolve(x86Root, "vcg-tiny-motion-game.x86_64");
  const armOutput = resolve(armRoot, "vcg-tiny-motion-game.arm64");
  runGodotExport(godot, "Web", webOutput);
  runGodotExport(godot, "Linux x86_64", x86Output);
  runGodotExport(godot, "Linux arm64", armOutput);

  const [web, linuxX86_64, linuxArm64, browser, x86Elf, armElf] =
    await Promise.all([
      inventoryDirectory(webRoot, [
        "index.apple-touch-icon.png",
        "index.audio.position.worklet.js",
        "index.audio.worklet.js",
        "index.html",
        "index.icon.png",
        "index.js",
        "index.pck",
        "index.png",
        "index.wasm",
      ]),
      inventoryDirectory(x86Root, [
        "vcg-tiny-motion-game.pck",
        "vcg-tiny-motion-game.x86_64",
      ]),
      inventoryDirectory(armRoot, [
        "vcg-tiny-motion-game.arm64",
        "vcg-tiny-motion-game.pck",
      ]),
      exerciseWebExport(webRoot, chrome),
      readElf(x86Output, "x86-64", 62),
      readElf(armOutput, "AArch64", 183),
    ]);
  const x86Pack = linuxX86_64.files.find((file) =>
    file.path.endsWith(".pck"),
  );
  const armPack = linuxArm64.files.find((file) => file.path.endsWith(".pck"));
  const webPack = web.files.find((file) => file.path.endsWith(".pck"));
  assert.ok(x86Pack && armPack && webPack);
  assert.equal(x86Pack.sha256, armPack.sha256);
  assert.equal(x86Pack.sha256, webPack.sha256);
  assert.deepEqual(
    [
      ...web.files,
      ...linuxX86_64.files,
      ...linuxArm64.files,
    ],
    GODOT_EXPECTED_OUTPUT_FILES,
  );
  assert.equal(browser.browserProduct, GODOT_EXPORT_BROWSER_PRODUCT);
  const wslBoot = runWslBoot(x86Output);

  return {
    format: GODOT_EXPORT_EVIDENCE_FORMAT,
    evidenceDate: GODOT_EXPORT_EVIDENCE_DATE,
    evidenceClass:
      "windows-x64-godot-export-web-load-and-wsl-x86-boot",
    qualification: "desk-export-and-load-only-not-target-qualification",
    retrievedAtUtc,
    environment: {
      producerPlatform: process.platform,
      producerArchitecture: process.arch,
      nodeVersion: process.version,
      godotVersion: GODOT_VERSION,
      godotBinaryName: basename(godot),
      browserProduct: browser.browserProduct,
    },
    toolchain: {
      templateVersion: GODOT_TEMPLATE_VERSION,
      templateArchive: GODOT_TEMPLATE_ARCHIVE,
      installedTemplateFileCount: templates.length,
      installedTemplates: templates,
    },
    outputs: {
      web: {
        preset: "Web",
        target: "wasm32-web-unthreaded",
        ...web,
      },
      linuxX86_64: {
        preset: "Linux x86_64",
        target: "linux-x86_64",
        elf: x86Elf,
        ...linuxX86_64,
        boot: wslBoot,
      },
      linuxArm64: {
        preset: "Linux arm64",
        target: "linux-arm64",
        elf: armElf,
        ...linuxArm64,
        executionAttempted: false,
      },
    },
    browser,
    disposition: {
      webReleaseExportProduced: true,
      linuxX86_64ReleaseExportProduced: true,
      linuxArm64ReleaseExportProduced: true,
      webChromeLoadVerified: true,
      keyboardFallbackVerified: true,
      physicalGamepadVerified: false,
      liveMotionBridgeNegotiationVerified: false,
      linuxX86_64WslBootObserved: true,
      linuxTargetQualified: false,
      linuxArm64ExecutionVerified: false,
      signedPackageLaunchVerified: false,
      latencyQualified: false,
    },
    summary: {
      exportCount: 3,
      webLoadCount: 1,
      keyboardFallbackActionCount: 2,
      physicalControllerCount: 0,
      participantCount: 0,
      motionFrameCount: 0,
      targetHardwareCount: 0,
    },
    provenance: await provenance(),
    claimBoundary: GODOT_EXPORT_CLAIM_BOUNDARY,
    limitations: GODOT_EXPORT_LIMITATIONS,
  };
}

async function main() {
  const artifact = await generateGodotExportEvidence();
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${artifact.summary.exportCount} Godot exports; web ready in ${artifact.browser.readyMs} ms; x86 WSL boot=${artifact.outputs.linuxX86_64.boot.exitCode}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
