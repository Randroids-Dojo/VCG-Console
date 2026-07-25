import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  HAILO_MEDIAPIPE_CAMPAIGN_ID,
  HAILO_MEDIAPIPE_PLAN_FORMAT,
  HAILO_MEDIAPIPE_PLAN_VERSION,
  buildHailoMediaPipeComparisonPlan,
} from "./generate-hailo-mediapipe-comparison-plan.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const trackedPlanPath =
  "benchmarks/pose-backends/hailo-mediapipe-core-comparison-plan-v1.json";
const maximumPlanBytes = 65_536;

function requirePlainJson(value, name = "plan") {
  if (value === null) return;
  if (typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must contain only finite JSON numbers`);
    }
    return;
  }
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (
      keys.length !== value.length ||
      keys.some((key, index) => key !== String(index))
    ) {
      throw new Error(`${name} must be a dense array without unknown fields`);
    }
    value.forEach((entry, index) =>
      requirePlainJson(entry, `${name}[${index}]`),
    );
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${name} contains a non-JSON value`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${name} must contain only plain JSON objects`);
  }
  for (const [key, entry] of Object.entries(value)) {
    requirePlainJson(entry, `${name}.${key}`);
  }
}

function firstMismatch(actual, expected, name = "plan") {
  if (Object.is(actual, expected)) return null;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${name} must be an array`;
    const actualKeys = Object.keys(actual);
    if (
      actualKeys.length !== actual.length ||
      actualKeys.some((key, index) => key !== String(index))
    ) {
      return `${name} must be a dense array without unknown fields`;
    }
    if (actual.length !== expected.length) {
      return `${name} must contain exactly ${expected.length} entries`;
    }
    for (let index = 0; index < expected.length; index += 1) {
      const mismatch = firstMismatch(
        actual[index],
        expected[index],
        `${name}[${index}]`,
      );
      if (mismatch) return mismatch;
    }
    return null;
  }
  if (expected && typeof expected === "object") {
    if (
      !actual ||
      typeof actual !== "object" ||
      Array.isArray(actual)
    ) {
      return `${name} must be an object`;
    }
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      return `${name} keys must be exactly ${expectedKeys.join(", ")}`;
    }
    for (const key of expectedKeys) {
      const mismatch = firstMismatch(
        actual[key],
        expected[key],
        `${name}.${key}`,
      );
      if (mismatch) return mismatch;
    }
    return null;
  }
  return `${name} must equal ${JSON.stringify(expected)}`;
}

function requireMetadata(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("plan must be an object");
  }
  if (plan.format !== HAILO_MEDIAPIPE_PLAN_FORMAT) {
    throw new Error(
      `plan.format must equal ${JSON.stringify(HAILO_MEDIAPIPE_PLAN_FORMAT)}`,
    );
  }
  if (plan.formatVersion !== HAILO_MEDIAPIPE_PLAN_VERSION) {
    throw new Error(
      `plan.formatVersion must equal ${HAILO_MEDIAPIPE_PLAN_VERSION}`,
    );
  }
  if (plan.documentType !== "plan") {
    throw new Error('plan.documentType must equal "plan"');
  }
  if (plan.campaignId !== HAILO_MEDIAPIPE_CAMPAIGN_ID) {
    throw new Error(
      `plan.campaignId must equal ${JSON.stringify(HAILO_MEDIAPIPE_CAMPAIGN_ID)}`,
    );
  }
  if (
    typeof plan.createdAt !== "string" ||
    !Number.isFinite(Date.parse(plan.createdAt)) ||
    new Date(plan.createdAt).toISOString() !== plan.createdAt
  ) {
    throw new Error("plan.createdAt must be a canonical ISO date-time");
  }
  if (
    typeof plan.sourceCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(plan.sourceCommit)
  ) {
    throw new Error("plan.sourceCommit must be a lowercase Git commit");
  }
  if (typeof plan.workingTreeClean !== "boolean") {
    throw new Error("plan.workingTreeClean must be boolean");
  }
}

export async function validateHailoMediaPipeComparisonPlan(
  plan,
  root = repositoryRoot,
) {
  requirePlainJson(plan);
  requireMetadata(plan);
  const expected = await buildHailoMediaPipeComparisonPlan({
    repositoryRoot: root,
    createdAt: plan.createdAt,
    sourceCommit: plan.sourceCommit,
    workingTreeClean: plan.workingTreeClean,
  });
  const mismatch = firstMismatch(plan, expected);
  if (mismatch) throw new Error(mismatch);
  return plan;
}

export async function validateHailoMediaPipeComparisonPlanBytes(
  bytes,
  root = repositoryRoot,
) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("plan bytes must be a Uint8Array");
  }
  if (bytes.length === 0 || bytes.length > maximumPlanBytes) {
    throw new Error(
      `Hailo/MediaPipe comparison plan must be between 1 and ${maximumPlanBytes} bytes`,
    );
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    throw new Error("Hailo/MediaPipe comparison plan must not contain a BOM");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Hailo/MediaPipe comparison plan must be valid UTF-8");
  }
  let plan;
  try {
    plan = JSON.parse(text);
  } catch {
    throw new Error("Hailo/MediaPipe comparison plan must be valid JSON");
  }
  await validateHailoMediaPipeComparisonPlan(plan, root);
  const canonical = `${JSON.stringify(plan, null, 2)}\n`;
  if (text !== canonical) {
    throw new Error(
      "Hailo/MediaPipe comparison plan must use canonical two-space JSON with one trailing newline and no duplicate fields",
    );
  }
  return plan;
}

export async function validateTrackedHailoMediaPipeComparisonPlan(
  root = repositoryRoot,
) {
  return validateHailoMediaPipeComparisonPlanBytes(
    await readFile(resolve(root, trackedPlanPath)),
    root,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const plan = await validateTrackedHailoMediaPipeComparisonPlan();
  console.log(
    `validated ${plan.campaignId} (${plan.execution.recordedAttemptCount} recorded attempts, ${plan.execution.qualification})`,
  );
}
