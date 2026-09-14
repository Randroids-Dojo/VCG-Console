import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectPath = join(repositoryRoot, "examples", "godot-motion-game");
const godot = findGodot();
const checks = [
  ["editor import", ["--headless", "--editor", "--path", projectPath, "--import", "--quit"]],
  ["contract tests", ["--headless", "--path", projectPath, "--script", "tests/run_tests.gd"]],
  ["main scene boot (60 main-loop iterations)", ["--headless", "--path", projectPath, "--quit-after", "60"]],
];

for (const [label, arguments_] of checks) {
  const result = spawnSync(godot, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output) process.stdout.write(output);
  if (result.error || result.status !== 0 || /\b(?:SCRIPT ERROR|ERROR):/u.test(output)) {
    throw new Error(
      `Godot ${label} failed${result.error ? `: ${result.error.message}` : ` with status ${result.status}`}`,
    );
  }
  console.log(`Godot ${label}: passed`);
}

function findGodot() {
  const candidates = [process.env.GODOT_BIN, process.env.GODOT, process.env.GODOT4, "godot", "godot4"];
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const packagesRoot = join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
    try {
      for (const packageDirectory of readdirSync(packagesRoot, { withFileTypes: true })) {
        if (!packageDirectory.isDirectory() || !packageDirectory.name.startsWith("GodotEngine.GodotEngine_")) {
          continue;
        }
        const installationRoot = join(packagesRoot, packageDirectory.name);
        for (const entry of readdirSync(installationRoot, { withFileTypes: true })) {
          if (
            entry.isFile() &&
            /^Godot_v.+_win64_console\.exe$/u.test(entry.name)
          ) {
            candidates.push(join(installationRoot, entry.name));
          }
        }
      }
    } catch {
      // The standard command candidates below still provide a useful failure.
    }
  }
  for (let candidate of candidates) {
    if (!candidate) continue;
    if (process.platform === "win32" && existsSync(candidate)) {
      // Resolve configured executable paths and prefer the console sibling so
      // spawnSync can collect version, import and test output on Windows.
      candidate = realpathSync(candidate);
      const consoleExecutable = candidate.replace(/(?<!_console)\.exe$/iu, "_console.exe");
      if (existsSync(consoleExecutable)) candidate = consoleExecutable;
    }
    const version = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
    });
    if (!version.error && version.status === 0 && /^4\.7\.\d+\.stable\./u.test(String(version.stdout).trim())) {
      console.log(`Using Godot ${String(version.stdout).trim()} from ${candidate}`);
      return candidate;
    }
  }
  throw new Error("Godot 4.7 stable was not found. Install it or set GODOT_BIN to its executable.");
}
