// Repository-wide source-binding integrity check.
//
// Pre-registration plans under `benchmarks/` and `compliance/` bind themselves
// to the exact reviewed bytes of the documents and sources they depend on. Each
// per-plan validator already enforces its own bindings, but each one stops at
// its first mismatch, so a single drifted document hides every later drift --
// including drift in unrelated plans. This walks every declared binding in one
// pass and reports the complete picture.
//
// Digests follow the `sourceDigestContract` those plans declare: SHA-256 over
// strict UTF-8 after CRLF-to-LF normalization, with bare carriage returns and a
// UTF-8 BOM rejected.
//
// usage:
//   node scripts/validate-source-bindings.mjs            # report drift, exit 1
//   node scripts/validate-source-bindings.mjs --write    # re-register drift
//
// `--write` is a deliberate re-registration: it asserts that the new content of
// every drifted source has been reviewed and is intended to bind the plan. It
// is never automatic, and CI runs the read-only form.

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH_ROOTS = ["benchmarks", "compliance"];
const SHA256 = /^[a-f0-9]{64}$/u;

/** Normalizes one source file exactly as the plan validators do. */
function normalizedText(bytes, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be strict UTF-8`, { cause: error });
  }
  if (text.startsWith("﻿")) {
    throw new Error(`${label} must not contain a UTF-8 BOM`);
  }
  if (/\r(?!\n)/u.test(text)) {
    throw new Error(`${label} contains a bare carriage return`);
  }
  return text.replaceAll("\r\n", "\n");
}

function normalizedSha256(bytes, label) {
  return createHash("sha256")
    .update(Buffer.from(normalizedText(bytes, label), "utf8"))
    .digest("hex");
}

async function* walkJson(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkJson(full);
    else if (entry.name.endsWith(".json")) yield full;
  }
}

/** Every plan file that declares source bindings, in stable order. */
export async function collectPlans(repositoryRoot = root) {
  const plans = [];
  for (const searchRoot of SEARCH_ROOTS) {
    for await (const file of walkJson(resolve(repositoryRoot, searchRoot))) {
      const text = await readFile(file, "utf8");
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed?.sourceBindings)) continue;
      plans.push({
        file,
        relativePath: relative(repositoryRoot, file).split(sep).join("/"),
        bindings: parsed.sourceBindings,
      });
    }
  }
  return plans;
}

/** Reports every binding whose recorded digest no longer matches its source. */
export async function findDrift(repositoryRoot = root) {
  const plans = await collectPlans(repositoryRoot);
  const digests = new Map();
  const drift = [];
  const problems = [];

  for (const plan of plans) {
    for (const [index, binding] of plan.bindings.entries()) {
      const target = binding?.path;
      const recorded = binding?.sha256;
      if (typeof target !== "string" || typeof recorded !== "string") continue;
      if (!SHA256.test(recorded)) {
        problems.push(`${plan.relativePath}: sourceBindings[${index}].sha256 is not a SHA-256`);
        continue;
      }
      if (!digests.has(target)) {
        try {
          const bytes = await readFile(resolve(repositoryRoot, target));
          digests.set(target, normalizedSha256(bytes, target));
        } catch (error) {
          digests.set(target, null);
          problems.push(`${plan.relativePath}: cannot digest ${target} (${error.message})`);
        }
      }
      const actual = digests.get(target);
      if (actual && actual !== recorded) {
        drift.push({
          plan: plan.relativePath,
          file: plan.file,
          index,
          target,
          recorded,
          actual,
        });
      }
    }
  }
  return { plans, drift, problems };
}

/**
 * Rewrites drifted digests in place. Editing a plan changes that plan's own
 * bytes, so plans that bind other plans drift in turn; this repeats until the
 * repository reaches a fixed point.
 */
async function reregister(repositoryRoot) {
  const rewritten = new Map();
  for (let pass = 1; pass <= 16; pass += 1) {
    const { drift, problems } = await findDrift(repositoryRoot);
    if (problems.length > 0) {
      for (const problem of problems) console.error(`  ${problem}`);
      throw new Error("refusing to re-register while bindings are unreadable");
    }
    if (drift.length === 0) {
      return { passes: pass - 1, rewritten };
    }
    const byFile = new Map();
    for (const entry of drift) {
      if (!byFile.has(entry.file)) byFile.set(entry.file, []);
      byFile.get(entry.file).push(entry);
    }
    for (const [file, entries] of byFile) {
      let text = await readFile(file, "utf8");
      for (const entry of entries) {
        // Rewrite the digest that sits beside this exact path, leaving all
        // other formatting byte-identical. JSON round-tripping would reflow
        // the document and change bytes no reviewer approved.
        const escaped = entry.target.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        const pattern = new RegExp(
          `("path"\\s*:\\s*"${escaped}"\\s*,\\s*"sha256"\\s*:\\s*")[0-9a-f]{64}(")`,
          "u",
        );
        if (!pattern.test(text)) {
          throw new Error(
            `${entry.plan}: could not locate the sha256 beside ${entry.target}`,
          );
        }
        text = text.replace(pattern, `$1${entry.actual}$2`);
        const key = `${entry.plan} -> ${entry.target}`;
        if (!rewritten.has(key)) rewritten.set(key, entry);
      }
      await writeFile(file, text);
    }
  }
  throw new Error("source bindings did not converge after 16 passes");
}

async function main() {
  const write = process.argv.includes("--write");
  if (write) {
    const { passes, rewritten } = await reregister(root);
    console.log(`re-registered ${rewritten.size} binding(s) over ${passes} pass(es)`);
    for (const key of [...rewritten.keys()].sort()) console.log(`  ${key}`);
    return;
  }

  const { plans, drift, problems } = await findDrift(root);
  for (const problem of problems) console.error(problem);
  if (drift.length === 0 && problems.length === 0) {
    const bindings = plans.reduce((total, plan) => total + plan.bindings.length, 0);
    console.log(`${bindings} source bindings across ${plans.length} plans are current.`);
    return;
  }
  for (const entry of drift) {
    console.error(
      `${entry.plan}\n    -> ${entry.target}\n       recorded ${entry.recorded}\n       actual   ${entry.actual}`,
    );
  }
  console.error(
    `\n${drift.length} drifted source binding(s). A drifted binding means a`
      + " pre-registered plan no longer describes the bytes it was reviewed"
      + " against. Re-register deliberately with:\n"
      + "  node scripts/validate-source-bindings.mjs --write",
  );
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/gu, "/")
  || process.argv[1]?.endsWith("validate-source-bindings.mjs")) {
  await main();
}
