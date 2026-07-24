import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildBlindTraceBundle,
  scoreBlindTriage,
  triageBlindTraceBundle,
  validateExerciseArtifacts,
  type BlindTraceBundle,
  type BlindTriageResult,
  type BlindTriageSubmission,
} from "./skeleton-debugging-exercise";

const OUTPUT_DIRECTORY = resolve("benchmarks", "skeleton-debugging");
const BUNDLE_PATH = resolve(OUTPUT_DIRECTORY, "blind-trace-bundle-v1.json");
const SUBMISSION_PATH = resolve(OUTPUT_DIRECTORY, "blind-triage-submission-v1.json");
const RESULT_PATH = resolve(OUTPUT_DIRECTORY, "blind-triage-result-v1.json");

function git(arguments_: string[]): string {
  return execFileSync("git", arguments_, { encoding: "utf8" }).trim();
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(path);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  switch (mode) {
    case "bundle": {
      const bundle = buildBlindTraceBundle(
        git(["rev-parse", "HEAD"]),
        git(["status", "--porcelain"]) === "",
      );
      await writeJson(BUNDLE_PATH, bundle);
      return;
    }
    case "triage": {
      const bundle = await readJson<BlindTraceBundle>(BUNDLE_PATH);
      await writeJson(SUBMISSION_PATH, triageBlindTraceBundle(bundle));
      return;
    }
    case "score": {
      const bundle = await readJson<BlindTraceBundle>(BUNDLE_PATH);
      const submission = await readJson<BlindTriageSubmission>(SUBMISSION_PATH);
      await writeJson(RESULT_PATH, scoreBlindTriage(bundle, submission));
      return;
    }
    case "validate": {
      const bundle = await readJson<BlindTraceBundle>(BUNDLE_PATH);
      const submission = await readJson<BlindTriageSubmission>(SUBMISSION_PATH);
      const result = await readJson<BlindTriageResult>(RESULT_PATH);
      const validated = validateExerciseArtifacts(bundle, submission, result);
      console.log(
        `validated ${validated.bundle.cases.length} traces: ` +
          `${validated.result.aggregate.fullyReproducedDefects} full, ` +
          `${validated.result.aggregate.symptomOnlyDefects} symptom-only, ` +
          `${validated.result.aggregate.insufficientDefects} insufficient`,
      );
      return;
    }
    default:
      throw new Error("usage: tsx scripts/generate-skeleton-debugging-exercise.ts bundle|triage|score|validate");
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
