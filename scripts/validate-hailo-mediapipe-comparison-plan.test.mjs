import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canonicalSourceSha256,
} from "./generate-hailo-mediapipe-comparison-plan.mjs";
import {
  validateHailoMediaPipeComparisonPlan,
  validateHailoMediaPipeComparisonPlanBytes,
  validateTrackedHailoMediaPipeComparisonPlan,
} from "./validate-hailo-mediapipe-comparison-plan.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const planPath = resolve(
  repositoryRoot,
  "benchmarks/pose-backends/hailo-mediapipe-core-comparison-plan-v1.json",
);

async function fixture() {
  return structuredClone(
    await validateTrackedHailoMediaPipeComparisonPlan(),
  );
}

test("accepts the blocked zero-result Hailo/MediaPipe plan", async () => {
  const plan = await fixture();
  assert.equal(plan.execution.status, "blocked");
  assert.equal(plan.execution.recordedAttemptCount, 0);
  assert.equal(plan.execution.resultArtifact, null);
  assert.equal(plan.execution.qualification, "not-run");
  assert.equal(plan.sourceBindings.length, 4);
});

test("binds source text identically across LF and CRLF checkouts", () => {
  assert.equal(
    canonicalSourceSha256(Buffer.from("first\nsecond\n", "utf8")),
    canonicalSourceSha256(Buffer.from("first\r\nsecond\r\n", "utf8")),
  );
  assert.throws(
    () => canonicalSourceSha256(Buffer.from("first\rsecond", "utf8")),
    /bare carriage returns/,
  );
  assert.throws(
    () => canonicalSourceSha256(Uint8Array.from([0xc3, 0x28])),
    /valid UTF-8/,
  );
});

test("rejects an invented Hailo richer capability", async () => {
  const plan = await fixture();
  plan.backends[0].expectedPoseProfilesAvailable.push("body.world3d");
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /expectedPoseProfilesAvailable/,
  );
});

test("rejects fabricated unavailable-profile values", async () => {
  const plan = await fixture();
  plan.capabilityComparison.unavailableValuePolicy =
    "fill missing heel and toe positions with zero";
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /unavailableValuePolicy/,
  );
});

test("rejects sequential or different-session input substitution", async () => {
  const plan = await fixture();
  plan.capturePrivacy.transport = "sequential-record-and-replay";
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /capturePrivacy\.transport/,
  );
});

test("rejects raw-frame retention authority", async () => {
  const plan = await fixture();
  plan.capturePrivacy.rawFramesRetained = true;
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /rawFramesRetained/,
  );

  const second = await fixture();
  second.capturePrivacy.temporaryRawCaptureAuthority = "approved";
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(second),
    /temporaryRawCaptureAuthority/,
  );
});

test("rejects capture arrival as exposure time", async () => {
  const plan = await fixture();
  plan.timestampProtocol.captureArrivalAcceptedAsExposure = true;
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /captureArrivalAcceptedAsExposure/,
  );

  const second = await fixture();
  second.timestampProtocol.exposureSource = "capture-arrival";
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(second),
    /timestampProtocol\.exposureSource/,
  );
});

test("rejects incomplete action and floor-event confusion matrices", async () => {
  const plan = await fixture();
  plan.scoring.actionConfusionMatrixRows.pop();
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /actionConfusionMatrixRows/,
  );

  const second = await fixture();
  second.scoring.floorEventConfusionMatrixColumns.pop();
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(second),
    /floorEventConfusionMatrixColumns/,
  );
});

test("keeps independent floor truth and unresolved metric gates blocking", async () => {
  const plan = await fixture();
  plan.study.floorContactApparatusManifestSha256 = "a".repeat(64);
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /floorContactApparatusManifestSha256/,
  );

  const second = await fixture();
  second.scoring.perActionPrecisionGates = { jump: 0.9 };
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(second),
    /perActionPrecisionGates/,
  );
});

test("rejects a result or richer-profile selection before execution", async () => {
  const plan = await fixture();
  plan.execution.recordedAttemptCount = 1;
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /recordedAttemptCount/,
  );

  const second = await fixture();
  second.gameProfileDecision.gamesRequiringRicherProfile.push(
    "obstacle-sample",
  );
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(second),
    /gamesRequiringRicherProfile/,
  );
});

test("rejects source-binding substitution", async () => {
  const plan = await fixture();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /sourceBindings\[0\]\.sha256/,
  );
});

test("rejects an unpinned runtime tuple or target substitution", async () => {
  const plan = await fixture();
  plan.backends[0].runtime.hailoRtVersion = "latest";
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /hailoRtVersion/,
  );

  const second = await fixture();
  second.target.productLane = "unmeasured-board";
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(second),
    /target\.productLane/,
  );
});

test("rejects persona, placement, and negative-stratum coverage drift", async () => {
  const plan = await fixture();
  plan.study.blockingPersonaClasses.pop();
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /blockingPersonaClasses/,
  );

  const second = await fixture();
  second.study.cameraPlacements.pop();
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(second),
    /cameraPlacements/,
  );

  const third = await fixture();
  third.study.requiredNegativeStrata.pop();
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(third),
    /requiredNegativeStrata/,
  );
});

test("rejects undeclared fields and sparse arrays", async () => {
  const plan = await fixture();
  plan.results = [];
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(plan),
    /plan keys must be exactly/,
  );

  const second = await fixture();
  second.study.blockingPersonaClasses = new Array(2);
  await assert.rejects(
    validateHailoMediaPipeComparisonPlan(second),
    /dense array/,
  );
});

test("requires canonical JSON and rejects duplicate fields", async () => {
  const bytes = await readFile(planPath);
  const compact = Buffer.from(JSON.stringify(JSON.parse(bytes)), "utf8");
  await assert.rejects(
    validateHailoMediaPipeComparisonPlanBytes(compact),
    /canonical two-space JSON/,
  );

  const text = bytes.toString("utf8");
  const duplicate = Buffer.from(
    text.replace("{", '{\n  "format": "substituted",'),
    "utf8",
  );
  await assert.rejects(
    validateHailoMediaPipeComparisonPlanBytes(duplicate),
    /canonical two-space JSON/,
  );
});

test("rejects BOM, malformed UTF-8, and oversized input", async () => {
  const bytes = await readFile(planPath);
  await assert.rejects(
    validateHailoMediaPipeComparisonPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]),
    ),
    /must not contain a BOM/,
  );
  await assert.rejects(
    validateHailoMediaPipeComparisonPlanBytes(
      Uint8Array.from([0xc3, 0x28]),
    ),
    /valid UTF-8/,
  );
  await assert.rejects(
    validateHailoMediaPipeComparisonPlanBytes(new Uint8Array(65_537)),
    /between 1 and 65536 bytes/,
  );
});
