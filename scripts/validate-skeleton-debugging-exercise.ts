import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  validateExerciseArtifacts,
  type BlindTraceBundle,
  type BlindTriageResult,
  type BlindTriageSubmission,
} from "./skeleton-debugging-exercise";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function validateSkeletonDebuggingExercise(): Promise<BlindTriageResult> {
  const directory = resolve("benchmarks", "skeleton-debugging");
  const bundle = await readJson<BlindTraceBundle>(resolve(directory, "blind-trace-bundle-v1.json"));
  const submission = await readJson<BlindTriageSubmission>(
    resolve(directory, "blind-triage-submission-v1.json"),
  );
  const result = await readJson<BlindTriageResult>(resolve(directory, "blind-triage-result-v1.json"));
  return validateExerciseArtifacts(bundle, submission, result).result;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  void validateSkeletonDebuggingExercise()
    .then((result) => {
      console.log(
        `validated ${result.aggregate.totalCases} cases: ` +
          `${result.aggregate.detectedDefectSymptoms}/${result.aggregate.defectCases} symptoms, ` +
          `${result.aggregate.identifiedRootCauses} root causes`,
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
