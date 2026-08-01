import { spawnSync } from "node:child_process";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let command = "bash";
let args = [resolve(root, "scripts/run-native-parser-fuzz-smoke.sh")];

if (process.platform === "win32") {
  const match = /^(?<drive>[A-Za-z]):\\(?<tail>.*)$/u.exec(root);
  if (!match?.groups) throw new Error(`cannot map repository path into WSL: ${root}`);
  const wslRoot = `/mnt/${match.groups.drive.toLowerCase()}/${match.groups.tail.replaceAll("\\", "/")}`;
  command = "wsl.exe";
  args = ["bash", posix.join(wslRoot, "scripts/run-native-parser-fuzz-smoke.sh")];
}

const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`native parser fuzz smoke run exited with status ${result.status ?? "unknown"}`);
}
