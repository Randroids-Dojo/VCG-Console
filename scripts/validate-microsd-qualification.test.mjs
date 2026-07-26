import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MICROSD_QUALIFICATION_PHASE_IDS,
  MICROSD_QUALIFICATION_RESULT_FORMAT,
  parseMicroSdQualificationPlanBytes,
  parseMicroSdQualificationResultBytes,
  validateMicroSdQualificationResult,
} from "./validate-microsd-qualification.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = resolve(
  root,
  "benchmarks/microsd-qualification/sandisk-high-endurance-256gb-plan-v1.json",
);
const trackedPlanBytes = await readFile(planPath);
const trackedPlan = parseMicroSdQualificationPlanBytes(trackedPlanBytes);
const clone = (value) => structuredClone(value);
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const parsePlan = (value) => parseMicroSdQualificationPlanBytes(canonicalBytes(value));

function readyPlan() {
  const plan = clone(trackedPlan.value);
  plan.qualification = "destructive-qualification-plan";
  plan.candidate.approvedPartNumber = plan.candidate.quotedPartNumber;
  plan.candidate.partRelationship = "distinct-approved-test-boundary";
  plan.executionGate.status = "ready";
  plan.executionGate.purchaseAuthorized = true;
  plan.executionGate.destructiveTestingAuthorized = true;
  for (const key of Object.keys(plan.executionGate)) {
    if (key.endsWith("Sha256")) plan.executionGate[key] = digest(key);
  }
  plan.executionGate.blockerCodes = [];
  plan.acceptance = {
    minimumTestedCardCount: 3,
    minimumIndependentLotCount: 2,
    retainedUnpoweredControlRequired: true,
    scheduledPowerCutsPerCard: 220,
    minimumValidPowerCutsPerCard: 200,
    minimumReportedCapacityBytes: 255_000_000_000,
    projectedServiceHostWriteBytesPerCard: 1_000_000_000_000,
    minimumEnduranceMarginRatio: 1.5,
    maximumBootP95Ms: 60_000,
    maximumStorageOperationP95Ms: 30_000,
    maximumPerformanceDriftRatio: 1.2,
    maximumMediaOrFilesystemErrors: 0,
    maximumCommittedCorruptionEvents: 0,
    maximumUnverifiedOrUncommittedLaunches: 0,
    maximumUnauthorizedReclamationEvents: 0,
    maximumRecoveryFailures: 0,
    everyTestedCardMustPass: true,
    aggregateMayRescueFailedCard: false,
  };
  plan.claimBoundary =
    "This ready test fixture authorizes destructive qualification only for one exact approved SanDisk part boundary, a hash-bound cohort, Raspberry Pi assembly, software image, storage layout, filesystem policy, workload, recovery release, tools, power-cut and corruption plans, and data-handling protocol under pre-registered thresholds.";
  return plan;
}

function passingCard(index) {
  return {
    cardId: `card-${(index + 1).toString(16).padStart(8, "0")}`,
    lotId: index < 2 ? "lot-0000000a" : "lot-0000000b",
    intakeIdentitySha256: digest(`identity-${index}`),
    reportedCapacityBytes: 256_000_000_000,
    submittedHostWriteBytes: 1_500_000_000_000,
    validPassingPowerCutTrials: 220,
    validFailingPowerCutTrials: 0,
    harnessInvalidPowerCutTrials: 0,
    notRunPowerCutTrials: 0,
    mediaOrFilesystemErrors: 0,
    committedCorruptionEvents: 0,
    unverifiedOrUncommittedLaunches: 0,
    unauthorizedReclamationEvents: 0,
    recoveryFailures: 0,
    bootP95Ms: 50_000,
    storageOperationP95Ms: 20_000,
    performanceDriftRatio: 1.1,
    phases: MICROSD_QUALIFICATION_PHASE_IDS.map((id) => ({
      id,
      status: "pass",
      evidenceSha256: digest(`${index}:${id}`),
    })),
  };
}

function passingResult(planEnvelope) {
  return {
    format: MICROSD_QUALIFICATION_RESULT_FORMAT,
    campaignId: planEnvelope.value.campaignId,
    planSha256: planEnvelope.sha256,
    startedAt: "2026-09-01T16:00:00.000Z",
    completedAt: "2026-12-01T16:00:00.000Z",
    cards: [passingCard(0), passingCard(1), passingCard(2)],
    retainedControlEvidenceSha256: digest("retained-control"),
    conclusion: "qualified",
    summary: {
      cardCount: 3,
      independentLotCount: 2,
      passingCardCount: 3,
      failingCardCount: 0,
      incompleteCardCount: 0,
      totalScheduledPowerCuts: 660,
      validPassingPowerCutTrials: 660,
      validFailingPowerCutTrials: 0,
      harnessInvalidPowerCutTrials: 0,
      notRunPowerCutTrials: 0,
      minimumSubmittedHostWriteBytes: 1_500_000_000_000,
      maximumBootP95Ms: 50_000,
      maximumStorageOperationP95Ms: 20_000,
      maximumPerformanceDriftRatio: 1.1,
      retainedControlPresent: true,
    },
    dataDisposition: {
      receiptOrAccountDataRetained: false,
      filesystemPathsRetained: false,
      hostUsernamesRetained: false,
      wifiCredentialsRetained: false,
      signingOrVaultSecretsRetained: false,
      playerDataRetained: false,
      freeTextRetained: false,
    },
    claimBoundary:
      "This result qualifies only the exact approved part boundary, tested cards and lots, Raspberry Pi assembly, software image, layout, filesystem, workload, recovery release, tools, service-write projection, margin, and fault plans in its hash-bound plan. It does not qualify another card revision, lot, workload, or USB SSD.",
    limitations: [
      "Only the exact tested card and lot boundary is represented.",
      "The retained control is not counted as a tested qualification card.",
      "Host-submitted writes do not claim internal NAND write amplification.",
      "Permanent device-local data loss remains the selected product boundary.",
      "A failed microSD result does not qualify an arbitrary USB SSD fallback.",
    ],
  };
}

function phase(card, id) {
  return card.phases.find((entry) => entry.id === id);
}

function assertPlanRejected(mutate, pattern) {
  const plan = readyPlan();
  mutate(plan);
  assert.throws(() => parsePlan(plan), pattern);
}

function assertResultRejected(mutate, pattern) {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  mutate(result, plan);
  assert.throws(() => validateMicroSdQualificationResult(plan, result), pattern);
}

test("accepts the tracked blocked plan without purchase or destructive authority", () => {
  assert.equal(trackedPlan.value.executionGate.status, "blocked");
  assert.equal(trackedPlan.value.executionGate.purchaseAuthorized, false);
  assert.equal(trackedPlan.value.executionGate.destructiveTestingAuthorized, false);
  assert.equal(trackedPlan.value.phaseIds.length, 9);
  assert.throws(
    () => validateMicroSdQualificationResult(trackedPlan, {}),
    /blocked plan cannot accept a result/,
  );
});

test("normalizes LF and CRLF plan bytes to the same digest", () => {
  const lf = parseMicroSdQualificationPlanBytes(trackedPlanBytes);
  const crlf = parseMicroSdQualificationPlanBytes(
    Buffer.from(trackedPlanBytes.toString("utf8").replaceAll("\n", "\r\n")),
  );
  assert.equal(crlf.sha256, lf.sha256);
});

test("accepts an exact ready plan and complete three-card qualification", () => {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  assert.equal(validateMicroSdQualificationResult(plan, result), result);
  assert.deepEqual(
    parseMicroSdQualificationResultBytes(plan, canonicalBytes(result)).value,
    result,
  );
});

test("rejects an unresolved, substituted, or invented part boundary", () => {
  assertPlanRejected(
    (plan) => { plan.candidate.partRelationship = null; },
    /part relationship is unsupported/,
  );
  assertPlanRejected(
    (plan) => { plan.candidate.approvedPartNumber = "SDSQQNR-512G"; },
    /outside the candidate boundary/,
  );
  assertPlanRejected(
    (plan) => { plan.candidate.nominalCapacityBytes = 512_000_000_000; },
    /Expected values to be strictly equal/,
  );
});

test("rejects hidden blocked values and missing ready execution bindings", () => {
  const hidden = clone(trackedPlan.value);
  hidden.acceptance.minimumTestedCardCount = 3;
  assert.throws(() => parsePlan(hidden), /3 !== null/);

  assertPlanRejected(
    (plan) => { plan.executionGate.powerCutPlanSha256 = null; },
    /must be lowercase SHA-256/,
  );
  assertPlanRejected(
    (plan) => { plan.executionGate.destructiveTestingAuthorized = false; },
    /false !== true/,
  );
});

test("rejects weakened safety gates and unsafe qualification arithmetic", () => {
  assertPlanRejected(
    (plan) => { plan.acceptance.maximumCommittedCorruptionEvents = 1; },
    /changed/,
  );
  assertPlanRejected(
    (plan) => { plan.acceptance.minimumValidPowerCutsPerCard = 199; },
    /200 through/,
  );
  assertPlanRejected(
    (plan) => { plan.acceptance.minimumIndependentLotCount = 4; },
    /1 through 3/,
  );
  assertPlanRejected(
    (plan) => {
      plan.acceptance.projectedServiceHostWriteBytesPerCard = Number.MAX_SAFE_INTEGER;
      plan.acceptance.minimumEnduranceMarginRatio = 2;
    },
    /exceeds safe integer range/,
  );
});

test("rejects phase removal, reordering, and policy weakening", () => {
  assertPlanRejected(
    (plan) => plan.phaseIds.pop(),
    /Expected values to be strictly deep-equal/,
  );
  assertPlanRejected(
    (plan) => plan.phaseIds.reverse(),
    /Expected values to be strictly deep-equal/,
  );
  assertPlanRejected(
    (plan) => { plan.evidencePolicy.allScheduledTrialsAccounted = false; },
    /false !== true/,
  );
  const reordered = readyPlan();
  reordered.evidencePolicy = Object.fromEntries(
    Object.entries(reordered.evidencePolicy).reverse(),
  );
  reordered.dataPolicy = Object.fromEntries(
    Object.entries(reordered.dataPolicy).reverse(),
  );
  assert.doesNotThrow(() => parsePlan(reordered));
});

test("rejects sensitive data fields and undeclared plan content", () => {
  assertPlanRejected(
    (plan) => { plan.dataPolicy.receiptOrAccountDataAllowed = true; },
    /true !== false/,
  );
  assertPlanRejected(
    (plan) => { plan.dataPolicy.filesystemPathsAllowed = true; },
    /true !== false/,
  );
  assertPlanRejected(
    (plan) => { plan.dataPolicy.playerDataAllowed = true; },
    /true !== false/,
  );
  assertPlanRejected(
    (plan) => { plan.surprise = true; },
    /plan keys must be exactly/,
  );
});

test("rejects noncanonical JSON, malformed UTF-8, and oversized input", () => {
  assert.throws(
    () => parseMicroSdQualificationPlanBytes(Buffer.from(JSON.stringify(trackedPlan.value))),
    /canonical two-space JSON/,
  );
  assert.throws(
    () => parseMicroSdQualificationPlanBytes(Uint8Array.from([0xc3, 0x28])),
    /encoded data was not valid|encoding/i,
  );
  assert.throws(
    () => parseMicroSdQualificationPlanBytes(Buffer.alloc(128 * 1_024 + 1, 0x20)),
    /byte size is invalid/,
  );
});

test("rejects forged plan envelopes and result plan substitution", () => {
  const plan = parsePlan(readyPlan());
  assert.throws(
    () => validateMicroSdQualificationResult(
      { value: plan.value, sha256: digest("forged") },
      passingResult(plan),
    ),
    /does not match its canonical value/,
  );
  assertResultRejected(
    (result) => { result.planSha256 = digest("wrong-plan"); },
    /Expected values to be strictly equal/,
  );
  assertResultRejected(
    (result) => { result.startedAt = "2026-07-24T23:59:59.000Z"; },
    /starts before its plan/,
  );
});

test("accepts an honest incomplete cohort and missing retained control", () => {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  result.cards.pop();
  result.retainedControlEvidenceSha256 = null;
  result.conclusion = "incomplete";
  result.summary.cardCount = 2;
  result.summary.independentLotCount = 1;
  result.summary.passingCardCount = 2;
  result.summary.totalScheduledPowerCuts = 440;
  result.summary.validPassingPowerCutTrials = 440;
  result.summary.retainedControlPresent = false;
  assert.equal(validateMicroSdQualificationResult(plan, result), result);
});

test("rejects aggregate rescue when one card fails a phase or safety oracle", () => {
  assertResultRejected(
    (result) => { phase(result.cards[0], "corruption-and-removal").status = "fail"; },
    /result conclusion is not derived/,
  );
  assertResultRejected(
    (result) => { result.cards[0].committedCorruptionEvents = 1; },
    /result conclusion is not derived/,
  );
  assertResultRejected(
    (result) => { result.cards[0].bootP95Ms = 60_001; },
    /result conclusion is not derived/,
  );
});

test("derives power-cut failure and refuses a passing phase label", () => {
  assertResultRejected(
    (result) => {
      result.cards[0].validPassingPowerCutTrials = 219;
      result.cards[0].validFailingPowerCutTrials = 1;
    },
    /power-cut phase status is not derived/,
  );

  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  result.cards[0].validPassingPowerCutTrials = 219;
  result.cards[0].validFailingPowerCutTrials = 1;
  phase(result.cards[0], "power-cut-and-update-interruption").status = "fail";
  result.conclusion = "rejected";
  result.summary.passingCardCount = 2;
  result.summary.failingCardCount = 1;
  result.summary.validPassingPowerCutTrials = 659;
  result.summary.validFailingPowerCutTrials = 1;
  assert.equal(validateMicroSdQualificationResult(plan, result), result);
});

test("counts harness-invalid cuts separately and never as valid", () => {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  result.cards[0].validPassingPowerCutTrials = 200;
  result.cards[0].harnessInvalidPowerCutTrials = 20;
  result.summary.validPassingPowerCutTrials = 640;
  result.summary.harnessInvalidPowerCutTrials = 20;
  assert.equal(validateMicroSdQualificationResult(plan, result), result);
});

test("accepts honest incompleteness for unrun cuts or unfinished endurance", () => {
  const plan = parsePlan(readyPlan());
  const cuts = passingResult(plan);
  cuts.cards[0].validPassingPowerCutTrials = 199;
  cuts.cards[0].notRunPowerCutTrials = 21;
  phase(cuts.cards[0], "power-cut-and-update-interruption").status = "incomplete";
  cuts.conclusion = "incomplete";
  cuts.summary.passingCardCount = 2;
  cuts.summary.incompleteCardCount = 1;
  cuts.summary.validPassingPowerCutTrials = 639;
  cuts.summary.notRunPowerCutTrials = 21;
  assert.equal(validateMicroSdQualificationResult(plan, cuts), cuts);

  const endurance = passingResult(plan);
  endurance.cards[0].submittedHostWriteBytes = 1_400_000_000_000;
  phase(endurance.cards[0], "accelerated-endurance-and-drift").status = "incomplete";
  endurance.conclusion = "incomplete";
  endurance.summary.passingCardCount = 2;
  endurance.summary.incompleteCardCount = 1;
  endurance.summary.minimumSubmittedHostWriteBytes = 1_400_000_000_000;
  assert.equal(validateMicroSdQualificationResult(plan, endurance), endurance);
});

test("rejects a passing phase below capacity or endurance requirements", () => {
  assertResultRejected(
    (result) => { result.cards[0].reportedCapacityBytes = 254_999_999_999; },
    /capacity phase cannot pass/,
  );
  assertResultRejected(
    (result) => { result.cards[0].submittedHostWriteBytes = 1_499_999_999_999; },
    /endurance phase cannot pass/,
  );
});

test("rejects duplicate cards, reordered phases, summary drift, and retained data", () => {
  assertResultRejected(
    (result) => { result.cards[0].cardId = "card-alice"; },
    /cardId must be opaque/,
  );
  assertResultRejected(
    (result) => { result.cards[0].lotId = "lot-retailer-order"; },
    /lotId must be opaque/,
  );
  assertResultRejected(
    (result) => { result.cards[1].cardId = result.cards[0].cardId; },
    /cardId is duplicated/,
  );
  assertResultRejected(
    (result) => { result.cards[0].phases.reverse(); },
    /changed or reordered/,
  );
  assertResultRejected(
    (result) => { result.summary.cardCount = 4; },
    /Expected values to be strictly deep-equal/,
  );
  assertResultRejected(
    (result) => { result.dataDisposition.filesystemPathsRetained = true; },
    /true !== false/,
  );
});
