import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptsRoot, "..");
const suites = ["runtime", "evidence", "pi"] as const;
type Suite = (typeof suites)[number];

function suiteFor(path: string): Suite {
  if (path.startsWith("pi/")) return "pi";
  return basename(path).startsWith("validate-") ? "evidence" : "runtime";
}

async function discover(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...await discover(resolve(directory, entry.name), `${path}/`));
    } else if (entry.isFile() && /\.test\.(?:[cm]?js|[cm]?ts)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

const args = process.argv.slice(2);
const selected = args.find((arg) => arg !== "--list") ?? "all";
if (args.some((arg) => arg !== selected && arg !== "--list")
  || (selected !== "all" && !suites.includes(selected as Suite))) {
  throw new Error("Usage: tsx scripts/run-tests.mts [all|runtime|evidence|pi] [--list]");
}
const tests = await discover(scriptsRoot);
if (tests.length === 0) throw new Error("No script tests found");
for (const suite of suites) {
  if (selected !== "all" && selected !== suite) continue;
  const paths = tests.filter((path) => suiteFor(path) === suite);
  if (args.includes("--list")) {
    for (const path of paths) console.log(`${suite}: scripts/${path}`);
    continue;
  }
  if (suite === "pi" && process.platform !== "linux") {
    if (selected === "pi") throw new Error("The Pi suite requires Linux; CI owns it in pi-bringup and node / ubuntu-latest.");
    console.log("Pi script tests require Linux and run in the Linux CI jobs.");
    continue;
  }
  if (paths.length === 0) throw new Error(`No tests found in the ${suite} suite`);
  // Browser containment probes need uncontended startup timing. Evidence
  // validators use isolated fixtures and can share a bounded worker pool.
  console.log(`Running ${paths.length} ${suite} script test files`);
  const child = spawn(process.execPath, [
    "--import", "tsx", "--test", `--test-concurrency=${suite === "evidence" ? 4 : 1}`,
    ...paths.map((path) => `scripts/${path}`),
  ], { cwd: root, stdio: "inherit" });
  const code = await new Promise<number>((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => done(code ?? (signal ? 1 : 0)));
  });
  if (code !== 0) process.exit(code);
}
