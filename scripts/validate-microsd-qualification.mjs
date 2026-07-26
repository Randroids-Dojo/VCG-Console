import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPlanPath = resolve(
  root,
  "benchmarks/microsd-qualification/sandisk-high-endurance-256gb-plan-v1.json",
);
const MAX_PLAN_BYTES = 128 * 1024;
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CARD_ID_PATTERN = /^card-[a-f0-9]{8}$/;
const LOT_ID_PATTERN = /^lot-[a-f0-9]{8}$/;

export const MICROSD_QUALIFICATION_PLAN_FORMAT =
  "vcg-microsd-qualification-plan/v1";
export const MICROSD_QUALIFICATION_RESULT_FORMAT =
  "vcg-microsd-qualification-result/v1";
export const MICROSD_QUALIFICATION_PHASE_IDS = Object.freeze([
  "intake-and-chain-of-custody",
  "destructive-capacity-screen",
  "final-image-baseline",
  "console-workload-replay",
  "capacity-quota-and-full-disk",
  "power-cut-and-update-interruption",
  "corruption-and-removal",
  "blank-card-and-replacement-recovery",
  "accelerated-endurance-and-drift",
]);

const blockerCodes = [
  "cohort-and-lot-budget",
  "destructive-test-authority",
  "part-suffix-relationship",
  "production-image-and-layout",
  "qualification-thresholds",
  "recovery-release",
  "service-horizon-and-margin",
];
const gateDigestKeys = [
  "cohortManifestSha256",
  "hardwareManifestSha256",
  "softwareImageManifestSha256",
  "storageLayoutManifestSha256",
  "filesystemMountPolicySha256",
  "workloadTraceManifestSha256",
  "recoveryReleaseManifestSha256",
  "toolchainManifestSha256",
  "powerCutPlanSha256",
  "corruptionPlanSha256",
  "dataHandlingProtocolSha256",
];
const openAcceptanceKeys = [
  "minimumTestedCardCount",
  "minimumIndependentLotCount",
  "retainedUnpoweredControlRequired",
  "scheduledPowerCutsPerCard",
  "minimumValidPowerCutsPerCard",
  "minimumReportedCapacityBytes",
  "projectedServiceHostWriteBytesPerCard",
  "minimumEnduranceMarginRatio",
  "maximumBootP95Ms",
  "maximumStorageOperationP95Ms",
  "maximumPerformanceDriftRatio",
];
const fixedAcceptance = {
  maximumMediaOrFilesystemErrors: 0,
  maximumCommittedCorruptionEvents: 0,
  maximumUnverifiedOrUncommittedLaunches: 0,
  maximumUnauthorizedReclamationEvents: 0,
  maximumRecoveryFailures: 0,
  everyTestedCardMustPass: true,
  aggregateMayRescueFailedCard: false,
};
const evidenceBooleanKeys = [
  "allScheduledTrialsAccounted",
  "harnessInvalidTrialsCannotCountAsValid",
  "advertisedEnduranceCannotReplaceHostWriteEvidence",
  "semanticCommittedStateOraclesRequired",
  "readBackImageIdentityRequired",
];
const forbiddenDataKeys = [
  "receiptOrAccountDataAllowed",
  "filesystemPathsAllowed",
  "hostUsernamesAllowed",
  "wifiCredentialsAllowed",
  "signingOrVaultSecretsAllowed",
  "playerDataAllowed",
  "freeTextAllowed",
];

function exactKeys(value, expected, path) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`,
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${path} keys must be exactly ${expected.join(", ")}`,
  );
}

function assertDigest(value, path) {
  assert.match(value, SHA256_PATTERN, `${path} must be lowercase SHA-256`);
}

function assertIsoTimestamp(value, path) {
  assert.equal(typeof value, "string", `${path} must be a string`);
  const parsed = new Date(value);
  assert.ok(Number.isFinite(parsed.getTime()), `${path} is invalid`);
  assert.equal(parsed.toISOString(), value, `${path} must be canonical UTC`);
}

function assertInteger(value, minimum, maximum, path) {
  assert.ok(
    Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    `${path} must be an integer from ${minimum} through ${maximum}`,
  );
}

function assertFiniteNumber(value, minimum, maximum, path) {
  assert.ok(
    typeof value === "number"
      && Number.isFinite(value)
      && value >= minimum
      && value <= maximum,
    `${path} must be finite from ${minimum} through ${maximum}`,
  );
}

function validateCandidate(plan) {
  const candidate = plan.candidate;
  exactKeys(
    candidate,
    [
      "manufacturer",
      "productFamily",
      "nominalCapacityBytes",
      "quotedPartNumber",
      "manufacturerListedPartNumber",
      "approvedPartNumber",
      "partRelationship",
    ],
    "plan.candidate",
  );
  assert.equal(candidate.manufacturer, "SanDisk");
  assert.equal(candidate.productFamily, "High Endurance microSD UHS-I");
  assert.equal(candidate.nominalCapacityBytes, 256_000_000_000);
  assert.equal(candidate.quotedPartNumber, "SDSQQNR-256G-AN6IA");
  assert.equal(candidate.manufacturerListedPartNumber, "SDSQQNR-256G-GN6IA");
  if (plan.executionGate.status === "blocked") {
    assert.equal(candidate.approvedPartNumber, null);
    assert.equal(candidate.partRelationship, null);
    return;
  }
  assert.ok(
    candidate.approvedPartNumber === candidate.quotedPartNumber
      || candidate.approvedPartNumber === candidate.manufacturerListedPartNumber,
    "ready plan approved part number is outside the candidate boundary",
  );
  assert.ok(
    candidate.partRelationship === "manufacturer-confirmed-alias"
      || candidate.partRelationship === "distinct-approved-test-boundary",
    "ready plan part relationship is unsupported",
  );
}

function validateExecutionGate(plan) {
  const gate = plan.executionGate;
  exactKeys(
    gate,
    [
      "status",
      "purchaseAuthorized",
      "destructiveTestingAuthorized",
      ...gateDigestKeys,
      "blockerCodes",
    ],
    "plan.executionGate",
  );
  assert.ok(gate.status === "blocked" || gate.status === "ready");
  if (gate.status === "blocked") {
    assert.equal(
      plan.qualification,
      "blocked-plan-only-no-purchase-or-destructive-test-authority",
    );
    assert.equal(gate.purchaseAuthorized, false);
    assert.equal(gate.destructiveTestingAuthorized, false);
    for (const key of gateDigestKeys) assert.equal(gate[key], null);
    assert.deepEqual(gate.blockerCodes, blockerCodes);
    assert.ok(
      plan.claimBoundary.includes("authorizes no purchase"),
      "blocked claim must deny purchase authority",
    );
    return;
  }
  assert.equal(plan.qualification, "destructive-qualification-plan");
  assert.equal(gate.purchaseAuthorized, true);
  assert.equal(gate.destructiveTestingAuthorized, true);
  for (const key of gateDigestKeys) assertDigest(gate[key], `plan.executionGate.${key}`);
  assert.deepEqual(gate.blockerCodes, []);
}

function validateAcceptance(plan) {
  const acceptance = plan.acceptance;
  exactKeys(
    acceptance,
    [...openAcceptanceKeys, ...Object.keys(fixedAcceptance)],
    "plan.acceptance",
  );
  for (const [key, value] of Object.entries(fixedAcceptance)) {
    assert.equal(acceptance[key], value, `plan.acceptance.${key} changed`);
  }
  if (plan.executionGate.status === "blocked") {
    for (const key of openAcceptanceKeys) assert.equal(acceptance[key], null);
    return;
  }
  assertInteger(acceptance.minimumTestedCardCount, 1, 32, "minimumTestedCardCount");
  assertInteger(
    acceptance.minimumIndependentLotCount,
    1,
    acceptance.minimumTestedCardCount,
    "minimumIndependentLotCount",
  );
  assert.equal(typeof acceptance.retainedUnpoweredControlRequired, "boolean");
  assertInteger(
    acceptance.scheduledPowerCutsPerCard,
    200,
    10_000,
    "scheduledPowerCutsPerCard",
  );
  assertInteger(
    acceptance.minimumValidPowerCutsPerCard,
    200,
    acceptance.scheduledPowerCutsPerCard,
    "minimumValidPowerCutsPerCard",
  );
  assertInteger(
    acceptance.minimumReportedCapacityBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    "minimumReportedCapacityBytes",
  );
  assert.ok(
    acceptance.minimumReportedCapacityBytes <= plan.candidate.nominalCapacityBytes,
    "minimum reported capacity cannot exceed nominal capacity",
  );
  assertInteger(
    acceptance.projectedServiceHostWriteBytesPerCard,
    1,
    Number.MAX_SAFE_INTEGER,
    "projectedServiceHostWriteBytesPerCard",
  );
  assertFiniteNumber(
    acceptance.minimumEnduranceMarginRatio,
    1,
    100,
    "minimumEnduranceMarginRatio",
  );
  assert.ok(
    Number.isSafeInteger(
      Math.ceil(
        acceptance.projectedServiceHostWriteBytesPerCard
          * acceptance.minimumEnduranceMarginRatio,
      ),
    ),
    "service-write target with margin exceeds safe integer range",
  );
  assertInteger(acceptance.maximumBootP95Ms, 1, 600_000, "maximumBootP95Ms");
  assertInteger(
    acceptance.maximumStorageOperationP95Ms,
    1,
    600_000,
    "maximumStorageOperationP95Ms",
  );
  assertFiniteNumber(
    acceptance.maximumPerformanceDriftRatio,
    1,
    10,
    "maximumPerformanceDriftRatio",
  );
}

function validateEvidencePolicy(policy) {
  exactKeys(
    policy,
    [
      "powerCutResultFormat",
      "powerCutResultFormatVersion",
      ...evidenceBooleanKeys,
    ],
    "plan.evidencePolicy",
  );
  assert.equal(policy.powerCutResultFormat, "vcg-power-cut-campaign-result");
  assert.equal(policy.powerCutResultFormatVersion, 1);
  for (const key of evidenceBooleanKeys) assert.equal(policy[key], true);
}

function validateDataPolicy(policy) {
  exactKeys(
    policy,
    [
      "opaqueCardAndLotIdsRequired",
      ...forbiddenDataKeys,
    ],
    "plan.dataPolicy",
  );
  assert.equal(policy.opaqueCardAndLotIdsRequired, true);
  for (const key of forbiddenDataKeys) assert.equal(policy[key], false);
}

export function validateMicroSdQualificationPlan(plan) {
  exactKeys(
    plan,
    [
      "format",
      "campaignId",
      "createdAt",
      "qualification",
      "candidate",
      "executionGate",
      "phaseIds",
      "acceptance",
      "evidencePolicy",
      "dataPolicy",
      "claimBoundary",
      "limitations",
    ],
    "plan",
  );
  assert.equal(plan.format, MICROSD_QUALIFICATION_PLAN_FORMAT);
  assert.match(plan.campaignId, ID_PATTERN, "plan campaign ID is invalid");
  assertIsoTimestamp(plan.createdAt, "plan.createdAt");
  assert.deepEqual(plan.phaseIds, [...MICROSD_QUALIFICATION_PHASE_IDS]);
  validateExecutionGate(plan);
  validateCandidate(plan);
  validateAcceptance(plan);
  validateEvidencePolicy(plan.evidencePolicy);
  validateDataPolicy(plan.dataPolicy);
  assert.ok(
    typeof plan.claimBoundary === "string"
      && plan.claimBoundary.length >= 160
      && plan.claimBoundary.length <= 1_024,
    "plan claim boundary is invalid",
  );
  assert.ok(Array.isArray(plan.limitations) && plan.limitations.length === 5);
  for (const limitation of plan.limitations) {
    assert.ok(
      typeof limitation === "string"
        && limitation.length >= 30
        && limitation.length <= 512,
      "plan limitation is invalid",
    );
  }
  return plan;
}

function parseCanonicalJsonBytes(bytes, maximumBytes, label) {
  assert.ok(bytes.length > 0 && bytes.length <= maximumBytes, `${label} byte size is invalid`);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const normalized = text.replaceAll("\r\n", "\n");
  const value = JSON.parse(normalized);
  assert.equal(
    normalized,
    `${JSON.stringify(value, null, 2)}\n`,
    `${label} must use canonical two-space JSON with one trailing newline`,
  );
  return {
    value,
    sha256: createHash("sha256").update(normalized).digest("hex"),
  };
}

export function parseMicroSdQualificationPlanBytes(bytes) {
  const envelope = parseCanonicalJsonBytes(bytes, MAX_PLAN_BYTES, "plan");
  validateMicroSdQualificationPlan(envelope.value);
  return envelope;
}

function validatePlanEnvelope(envelope) {
  exactKeys(envelope, ["value", "sha256"], "plan envelope");
  const plan = validateMicroSdQualificationPlan(envelope.value);
  assertDigest(envelope.sha256, "plan envelope SHA-256");
  assert.equal(
    createHash("sha256").update(`${JSON.stringify(plan, null, 2)}\n`).digest("hex"),
    envelope.sha256,
    "plan envelope SHA-256 does not match its canonical value",
  );
  return plan;
}

function validatePhaseResults(phases, plan, cardPath) {
  assert.ok(Array.isArray(phases) && phases.length === plan.phaseIds.length);
  const statuses = new Map();
  for (const [index, phase] of phases.entries()) {
    const path = `${cardPath}.phases[${index}]`;
    exactKeys(phase, ["id", "status", "evidenceSha256"], path);
    assert.equal(phase.id, plan.phaseIds[index], `${path}.id changed or reordered`);
    assert.ok(
      phase.status === "pass" || phase.status === "fail" || phase.status === "incomplete",
      `${path}.status is invalid`,
    );
    assertDigest(phase.evidenceSha256, `${path}.evidenceSha256`);
    statuses.set(phase.id, phase.status);
  }
  return statuses;
}

function validateCardResult(card, plan, index) {
  const path = `result.cards[${index}]`;
  exactKeys(
    card,
    [
      "cardId",
      "lotId",
      "intakeIdentitySha256",
      "reportedCapacityBytes",
      "submittedHostWriteBytes",
      "validPassingPowerCutTrials",
      "validFailingPowerCutTrials",
      "harnessInvalidPowerCutTrials",
      "notRunPowerCutTrials",
      "mediaOrFilesystemErrors",
      "committedCorruptionEvents",
      "unverifiedOrUncommittedLaunches",
      "unauthorizedReclamationEvents",
      "recoveryFailures",
      "bootP95Ms",
      "storageOperationP95Ms",
      "performanceDriftRatio",
      "phases",
    ],
    path,
  );
  assert.match(card.cardId, CARD_ID_PATTERN, `${path}.cardId must be opaque`);
  assert.match(card.lotId, LOT_ID_PATTERN, `${path}.lotId must be opaque`);
  assertDigest(card.intakeIdentitySha256, `${path}.intakeIdentitySha256`);
  for (const key of [
    "reportedCapacityBytes",
    "submittedHostWriteBytes",
  ]) assertInteger(card[key], 0, Number.MAX_SAFE_INTEGER, `${path}.${key}`);
  for (const key of [
    "validPassingPowerCutTrials",
    "validFailingPowerCutTrials",
    "harnessInvalidPowerCutTrials",
    "notRunPowerCutTrials",
    "mediaOrFilesystemErrors",
    "committedCorruptionEvents",
    "unverifiedOrUncommittedLaunches",
    "unauthorizedReclamationEvents",
    "recoveryFailures",
  ]) assertInteger(card[key], 0, 1_000_000, `${path}.${key}`);
  assertInteger(card.bootP95Ms, 0, 600_000, `${path}.bootP95Ms`);
  assertInteger(
    card.storageOperationP95Ms,
    0,
    600_000,
    `${path}.storageOperationP95Ms`,
  );
  assertFiniteNumber(card.performanceDriftRatio, 0, 100, `${path}.performanceDriftRatio`);
  const scheduled =
    card.validPassingPowerCutTrials
    + card.validFailingPowerCutTrials
    + card.harnessInvalidPowerCutTrials
    + card.notRunPowerCutTrials;
  assert.equal(
    scheduled,
    plan.acceptance.scheduledPowerCutsPerCard,
    `${path} power-cut accounting does not match the frozen schedule`,
  );
  const statuses = validatePhaseResults(card.phases, plan, path);
  const validCuts =
    card.validPassingPowerCutTrials + card.validFailingPowerCutTrials;
  const powerCutDerivedStatus = card.validFailingPowerCutTrials > 0
    ? "fail"
    : validCuts < plan.acceptance.minimumValidPowerCutsPerCard
        || card.notRunPowerCutTrials > 0
      ? "incomplete"
      : "pass";
  assert.equal(
    statuses.get("power-cut-and-update-interruption"),
    powerCutDerivedStatus,
    `${path} power-cut phase status is not derived from its ledger`,
  );
  const enduranceTarget = Math.ceil(
    plan.acceptance.projectedServiceHostWriteBytesPerCard
      * plan.acceptance.minimumEnduranceMarginRatio,
  );
  if (statuses.get("accelerated-endurance-and-drift") === "pass") {
    assert.ok(
      card.submittedHostWriteBytes >= enduranceTarget,
      `${path} endurance phase cannot pass below the service-write target plus margin`,
    );
  }
  if (statuses.get("destructive-capacity-screen") === "pass") {
    assert.ok(
      card.reportedCapacityBytes >= plan.acceptance.minimumReportedCapacityBytes,
      `${path} capacity phase cannot pass below the frozen minimum`,
    );
  }

  const safetyFailed =
    card.validFailingPowerCutTrials > 0
    || card.mediaOrFilesystemErrors
      > plan.acceptance.maximumMediaOrFilesystemErrors
    || card.committedCorruptionEvents
      > plan.acceptance.maximumCommittedCorruptionEvents
    || card.unverifiedOrUncommittedLaunches
      > plan.acceptance.maximumUnverifiedOrUncommittedLaunches
    || card.unauthorizedReclamationEvents
      > plan.acceptance.maximumUnauthorizedReclamationEvents
    || card.recoveryFailures > plan.acceptance.maximumRecoveryFailures;
  const performanceFailed =
    card.bootP95Ms > plan.acceptance.maximumBootP95Ms
    || card.storageOperationP95Ms
      > plan.acceptance.maximumStorageOperationP95Ms
    || card.performanceDriftRatio
      > plan.acceptance.maximumPerformanceDriftRatio;
  if (
    safetyFailed
    || performanceFailed
    || [...statuses.values()].includes("fail")
  ) return { outcome: "fail", scheduled, validCuts, enduranceTarget };
  if (
    validCuts < plan.acceptance.minimumValidPowerCutsPerCard
    || card.notRunPowerCutTrials > 0
    || card.submittedHostWriteBytes < enduranceTarget
    || card.reportedCapacityBytes < plan.acceptance.minimumReportedCapacityBytes
    || [...statuses.values()].includes("incomplete")
  ) return { outcome: "incomplete", scheduled, validCuts, enduranceTarget };
  return { outcome: "pass", scheduled, validCuts, enduranceTarget };
}

export function validateMicroSdQualificationResult(planEnvelope, result) {
  const plan = validatePlanEnvelope(planEnvelope);
  assert.equal(plan.executionGate.status, "ready", "blocked plan cannot accept a result");
  exactKeys(
    result,
    [
      "format",
      "campaignId",
      "planSha256",
      "startedAt",
      "completedAt",
      "cards",
      "retainedControlEvidenceSha256",
      "conclusion",
      "summary",
      "dataDisposition",
      "claimBoundary",
      "limitations",
    ],
    "result",
  );
  assert.equal(result.format, MICROSD_QUALIFICATION_RESULT_FORMAT);
  assert.equal(result.campaignId, plan.campaignId);
  assert.equal(result.planSha256, planEnvelope.sha256);
  assertIsoTimestamp(result.startedAt, "result.startedAt");
  assertIsoTimestamp(result.completedAt, "result.completedAt");
  assert.ok(
    Date.parse(result.startedAt) >= Date.parse(plan.createdAt),
    "result starts before its plan was created",
  );
  assert.ok(Date.parse(result.completedAt) >= Date.parse(result.startedAt));
  assert.ok(Array.isArray(result.cards) && result.cards.length <= 32);
  if (plan.acceptance.retainedUnpoweredControlRequired) {
    if (result.retainedControlEvidenceSha256 !== null) {
      assertDigest(
        result.retainedControlEvidenceSha256,
        "result.retainedControlEvidenceSha256",
      );
    }
  } else {
    assert.equal(result.retainedControlEvidenceSha256, null);
  }

  const cardIds = new Set();
  const identityDigests = new Set();
  const lotIds = new Set();
  let passingCardCount = 0;
  let failingCardCount = 0;
  let incompleteCardCount = 0;
  let totalScheduledPowerCuts = 0;
  let validPassingPowerCutTrials = 0;
  let validFailingPowerCutTrials = 0;
  let harnessInvalidPowerCutTrials = 0;
  let notRunPowerCutTrials = 0;
  let minimumSubmittedHostWriteBytes = null;
  let maximumBootP95Ms = 0;
  let maximumStorageOperationP95Ms = 0;
  let maximumPerformanceDriftRatio = 0;
  for (const [index, card] of result.cards.entries()) {
    const outcome = validateCardResult(card, plan, index);
    assert.ok(!cardIds.has(card.cardId), `result.cards[${index}].cardId is duplicated`);
    assert.ok(
      !identityDigests.has(card.intakeIdentitySha256),
      `result.cards[${index}].intakeIdentitySha256 is duplicated`,
    );
    cardIds.add(card.cardId);
    identityDigests.add(card.intakeIdentitySha256);
    lotIds.add(card.lotId);
    if (outcome.outcome === "pass") passingCardCount += 1;
    else if (outcome.outcome === "fail") failingCardCount += 1;
    else incompleteCardCount += 1;
    totalScheduledPowerCuts += outcome.scheduled;
    validPassingPowerCutTrials += card.validPassingPowerCutTrials;
    validFailingPowerCutTrials += card.validFailingPowerCutTrials;
    harnessInvalidPowerCutTrials += card.harnessInvalidPowerCutTrials;
    notRunPowerCutTrials += card.notRunPowerCutTrials;
    minimumSubmittedHostWriteBytes = minimumSubmittedHostWriteBytes === null
      ? card.submittedHostWriteBytes
      : Math.min(minimumSubmittedHostWriteBytes, card.submittedHostWriteBytes);
    maximumBootP95Ms = Math.max(maximumBootP95Ms, card.bootP95Ms);
    maximumStorageOperationP95Ms = Math.max(
      maximumStorageOperationP95Ms,
      card.storageOperationP95Ms,
    );
    maximumPerformanceDriftRatio = Math.max(
      maximumPerformanceDriftRatio,
      card.performanceDriftRatio,
    );
  }
  const cohortComplete =
    result.cards.length >= plan.acceptance.minimumTestedCardCount
    && lotIds.size >= plan.acceptance.minimumIndependentLotCount
    && (!plan.acceptance.retainedUnpoweredControlRequired
      || result.retainedControlEvidenceSha256 !== null);
  const conclusion = failingCardCount > 0
    ? "rejected"
    : cohortComplete
        && incompleteCardCount === 0
        && passingCardCount === result.cards.length
      ? "qualified"
      : "incomplete";
  assert.equal(result.conclusion, conclusion, "result conclusion is not derived");

  exactKeys(
    result.summary,
    [
      "cardCount",
      "independentLotCount",
      "passingCardCount",
      "failingCardCount",
      "incompleteCardCount",
      "totalScheduledPowerCuts",
      "validPassingPowerCutTrials",
      "validFailingPowerCutTrials",
      "harnessInvalidPowerCutTrials",
      "notRunPowerCutTrials",
      "minimumSubmittedHostWriteBytes",
      "maximumBootP95Ms",
      "maximumStorageOperationP95Ms",
      "maximumPerformanceDriftRatio",
      "retainedControlPresent",
    ],
    "result.summary",
  );
  assert.deepEqual(result.summary, {
    cardCount: result.cards.length,
    independentLotCount: lotIds.size,
    passingCardCount,
    failingCardCount,
    incompleteCardCount,
    totalScheduledPowerCuts,
    validPassingPowerCutTrials,
    validFailingPowerCutTrials,
    harnessInvalidPowerCutTrials,
    notRunPowerCutTrials,
    minimumSubmittedHostWriteBytes,
    maximumBootP95Ms,
    maximumStorageOperationP95Ms,
    maximumPerformanceDriftRatio,
    retainedControlPresent: result.retainedControlEvidenceSha256 !== null,
  });
  exactKeys(
    result.dataDisposition,
    [
      "receiptOrAccountDataRetained",
      "filesystemPathsRetained",
      "hostUsernamesRetained",
      "wifiCredentialsRetained",
      "signingOrVaultSecretsRetained",
      "playerDataRetained",
      "freeTextRetained",
    ],
    "result.dataDisposition",
  );
  for (const value of Object.values(result.dataDisposition)) assert.equal(value, false);
  assert.ok(
    typeof result.claimBoundary === "string"
      && result.claimBoundary.length >= 140
      && result.claimBoundary.length <= 1_024,
    "result claim boundary is invalid",
  );
  assert.ok(Array.isArray(result.limitations) && result.limitations.length === 5);
  for (const limitation of result.limitations) {
    assert.ok(typeof limitation === "string" && limitation.length >= 20);
  }
  return result;
}

export function parseMicroSdQualificationResultBytes(planEnvelope, bytes) {
  const envelope = parseCanonicalJsonBytes(bytes, MAX_RESULT_BYTES, "result");
  validateMicroSdQualificationResult(planEnvelope, envelope.value);
  return envelope;
}

export async function validateTrackedMicroSdQualificationPlan() {
  return parseMicroSdQualificationPlanBytes(await readFile(trackedPlanPath));
}

async function main() {
  const planPath = process.argv[2] ? resolve(process.argv[2]) : trackedPlanPath;
  const plan = parseMicroSdQualificationPlanBytes(await readFile(planPath));
  if (process.argv[3]) {
    const result = parseMicroSdQualificationResultBytes(
      plan,
      await readFile(resolve(process.argv[3])),
    );
    console.log(
      `validated ${result.value.summary.cardCount} microSD cards: ${result.value.conclusion}`,
    );
    return;
  }
  console.log(
    `validated blocked microSD qualification plan: ${plan.value.phaseIds.length} phases / ${plan.value.executionGate.blockerCodes.length} blockers`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
