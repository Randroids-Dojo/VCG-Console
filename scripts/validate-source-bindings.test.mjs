import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { collectPlans, findDrift } from "./validate-source-bindings.mjs";

// `new URL("..", import.meta.url).pathname` yields "/C:/..." on Windows, which
// is not a usable filesystem path. Resolve through fileURLToPath instead.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function digestOf(text) {
  return createHash("sha256")
    .update(Buffer.from(text.replaceAll("\r\n", "\n"), "utf8"))
    .digest("hex");
}

async function scratchRepository() {
  const dir = await mkdtemp(join(tmpdir(), "vcg-source-bindings-"));
  await mkdir(join(dir, "benchmarks", "demo"), { recursive: true });
  await mkdir(join(dir, "docs"), { recursive: true });
  return dir;
}

async function writePlan(dir, bindings) {
  const plan = {
    format: "vcg-demo-plan/v1",
    status: "blocked",
    sourceDigestContract:
      "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
    sourceBindings: bindings,
  };
  const file = join(dir, "benchmarks", "demo", "demo-plan-v1.json");
  await writeFile(file, `${JSON.stringify(plan, null, 2)}\n`);
  return file;
}

test("accepts a plan whose bindings match their sources", async () => {
  const dir = await scratchRepository();
  try {
    const body = "# Demo\n\nExact reviewed content.\n";
    await writeFile(join(dir, "docs", "DEMO.md"), body);
    await writePlan(dir, [
      { role: "demo-boundary", path: "docs/DEMO.md", sha256: digestOf(body) },
    ]);

    const { drift, problems } = await findDrift(dir);
    assert.deepEqual(problems, []);
    assert.deepEqual(drift, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reports a binding whose source changed after registration", async () => {
  const dir = await scratchRepository();
  try {
    const reviewed = "# Demo\n\nExact reviewed content.\n";
    await writeFile(join(dir, "docs", "DEMO.md"), reviewed);
    await writePlan(dir, [
      { role: "demo-boundary", path: "docs/DEMO.md", sha256: digestOf(reviewed) },
    ]);
    await writeFile(join(dir, "docs", "DEMO.md"), `${reviewed}Added later.\n`);

    const { drift } = await findDrift(dir);
    assert.equal(drift.length, 1);
    assert.equal(drift[0].target, "docs/DEMO.md");
    assert.equal(drift[0].recorded, digestOf(reviewed));
    assert.notEqual(drift[0].actual, drift[0].recorded);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("treats CRLF and LF sources as the same reviewed bytes", async () => {
  const dir = await scratchRepository();
  try {
    const lf = "line one\nline two\n";
    await writeFile(join(dir, "docs", "DEMO.md"), lf.replaceAll("\n", "\r\n"));
    await writePlan(dir, [
      { role: "demo-boundary", path: "docs/DEMO.md", sha256: digestOf(lf) },
    ]);

    const { drift, problems } = await findDrift(dir);
    assert.deepEqual(problems, []);
    assert.deepEqual(drift, [], "a CRLF checkout must not look like drift");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects a bare carriage return and a missing source", async () => {
  const dir = await scratchRepository();
  try {
    await writeFile(join(dir, "docs", "DEMO.md"), "bare\rcarriage\n");
    await writePlan(dir, [
      { role: "demo-boundary", path: "docs/DEMO.md", sha256: "0".repeat(64) },
      { role: "absent", path: "docs/ABSENT.md", sha256: "1".repeat(64) },
    ]);

    const { problems } = await findDrift(dir);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /bare carriage return/u);
    assert.match(problems[1], /cannot digest docs\/ABSENT\.md/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects a malformed digest instead of silently skipping it", async () => {
  const dir = await scratchRepository();
  try {
    await writeFile(join(dir, "docs", "DEMO.md"), "content\n");
    await writePlan(dir, [
      { role: "demo-boundary", path: "docs/DEMO.md", sha256: "not-a-digest" },
    ]);

    const { problems, drift } = await findDrift(dir);
    assert.equal(drift.length, 0);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /is not a SHA-256/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the repository's own source bindings are all current", async () => {
  const { plans, drift, problems } = await findDrift(root);
  assert.ok(plans.length > 0, "expected to discover pre-registration plans");
  assert.deepEqual(problems, [], "source bindings must be readable");
  assert.deepEqual(
    drift.map((entry) => `${entry.plan} -> ${entry.target}`),
    [],
    "a drifted binding means a pre-registered plan no longer describes the bytes"
      + " it was reviewed against; re-register deliberately with"
      + " `node scripts/validate-source-bindings.mjs --write`",
  );
});

test("every discovered plan exposes well-formed bindings", async () => {
  const plans = await collectPlans(root);
  assert.ok(plans.length > 0, "expected to discover pre-registration plans");
  for (const plan of plans) {
    for (const [index, binding] of plan.bindings.entries()) {
      assert.equal(
        typeof binding?.path,
        "string",
        `${plan.relativePath} sourceBindings[${index}] has no path`,
      );
      assert.match(
        binding?.sha256 ?? "",
        /^[a-f0-9]{64}$/u,
        `${plan.relativePath} sourceBindings[${index}] has no SHA-256`,
      );
    }
  }
});
