import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBlindTraceBundle,
  scoreBlindTriage,
  triageBlindTraceBundle,
  validateExerciseArtifacts,
  type BlindTraceBundle,
  type BlindTriageResult,
  type BlindTriageSubmission,
} from "./skeleton-debugging-exercise";

function artifacts(): {
  bundle: BlindTraceBundle;
  submission: BlindTriageSubmission;
  result: BlindTriageResult;
} {
  const bundle = buildBlindTraceBundle();
  const submission = triageBlindTraceBundle(bundle);
  const result = scoreBlindTriage(bundle, submission);
  return { bundle, submission, result };
}

test("accepts the committed eight-case blind exercise", () => {
  const values = artifacts();
  const validated = validateExerciseArtifacts(values.bundle, values.submission, values.result);
  assert.deepEqual(validated.result.aggregate, {
    totalCases: 8,
    defectCases: 7,
    controlCases: 1,
    detectedDefectSymptoms: 7,
    fullyReproducedDefects: 2,
    symptomOnlyDefects: 3,
    insufficientDefects: 2,
    identifiedRootCauses: 2,
    unsupportedRootCauseClaims: 0,
    controlFalsePositives: 0,
  });
  assert.equal(
    validated.submission.cases
      .filter((value) => value.reproductionLevel !== "full")
      .every((value) => value.rootCauseCode === null),
    true,
  );
});

test("rejects a raw-frame or privacy-flag substitution", () => {
  const values = artifacts();
  const privacy = values.bundle.cases[0]!.trace.privacy as { containsRawFrames: boolean };
  privacy.containsRawFrames = true;
  assert.throws(
    () => validateExerciseArtifacts(values.bundle, values.submission, values.result),
    /false|literal|trace/i,
  );
});

test("rejects a stable profile identifier in a debugging trace", () => {
  const values = artifacts();
  values.bundle.cases[0]!.trace.frames[0]!.players[0]!.id = "profile-123";
  assert.throws(
    () => validateExerciseArtifacts(values.bundle, values.submission, values.result),
    /pseudonym|trace/i,
  );
});

test("rejects trace substitution behind the committed digest", () => {
  const values = artifacts();
  values.bundle.cases[0]!.trace.frames[0]!.players[0]!.confidence = 0.9;
  assert.throws(
    () => validateExerciseArtifacts(values.bundle, values.submission, values.result),
    /digest changed/,
  );
});

test("rejects a root cause injected after blind triage", () => {
  const values = artifacts();
  values.submission.cases[1]!.rootCauseCode = "provider-landmark-name-swap";
  assert.throws(
    () => validateExerciseArtifacts(values.bundle, values.submission, values.result),
    /blind triage submission/,
  );
});

test("rejects a truth reveal that differs from the prior commitment", () => {
  const values = artifacts();
  values.result.truth[0]!.rootCauseCode = "motion-blur";
  assert.throws(
    () => validateExerciseArtifacts(values.bundle, values.submission, values.result),
    /truth reveal/,
  );
});

test("rejects inflated aggregate claims", () => {
  const values = artifacts();
  values.result.aggregate.identifiedRootCauses = 7;
  assert.throws(
    () => validateExerciseArtifacts(values.bundle, values.submission, values.result),
    /scored result/,
  );
});

test("rejects undeclared envelope fields", () => {
  const values = artifacts();
  Object.assign(values.bundle, { participantName: "not allowed" });
  assert.throws(
    () => validateExerciseArtifacts(values.bundle, values.submission, values.result),
    /undeclared/,
  );
});

test("rejects missing or reordered cases", () => {
  const values = artifacts();
  values.bundle.cases.reverse();
  assert.throws(
    () => validateExerciseArtifacts(values.bundle, values.submission, values.result),
    /case order/,
  );
});

test("rejects timestamp-provenance substitution", () => {
  const values = artifacts();
  values.bundle.cases[4]!.trace.provenance.timestampQualities = ["replay"];
  assert.throws(
    () => validateExerciseArtifacts(values.bundle, values.submission, values.result),
    /provenance|trace/i,
  );
});
