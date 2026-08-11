import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/first-party-motion-adaptation/first-party-motion-adaptation-ranking-plan-v1.json",
);
const MAX_BYTES = 384 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const ZERO_SHA256 = "0".repeat(64);

export const FIRST_PARTY_MOTION_ADAPTATION_FORMAT =
  "vcg-first-party-motion-adaptation-ranking-plan/v1";
export const FIRST_PARTY_MOTION_ADAPTATION_CONTRACT_SHA256 =
  "10b77ae37e059939696845ee85c87d05f3fee0520c5eb020cd64232e51dbd671";

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings",
  "prerequisiteGate", "candidatePoolContract", "scoringDimensions",
  "evidenceMatrix", "scoringScale", "rankingProtocol", "fixedAcceptance",
  "openAcceptance", "decisionProtocol", "authorityBoundary", "dataPolicy",
  "executionGate", "result",
];

const sourceDefinitions = [
  ["exact-first-party-game-pool-and-zero-rights-approval-boundary", "compliance/first-party-game-rights/repository-rights-screen-v1.json"],
  ["full-catalog-candidate-and-zero-admission-boundary", "compliance/catalog-candidates/full-catalog-candidate-ledger-v2.json"],
  ["per-game-runtime-scorecard-and-zero-selection-boundary", "compliance/runtime-scorecard/runtime-payload-scorecard-desk-baseline-v2.json"],
  ["first-real-room-one-player-prerequisite-boundary", "benchmarks/real-room-one-player/first-real-room-one-player-plan-v1.json"],
  ["complete-two-player-prerequisite-boundary", "benchmarks/two-player/two-player-qualification-plan-v1.json"],
  ["synthetic-accessibility-support-nonqualification-boundary", "benchmarks/play-support/seated-partial-assisted-synthetic-matrix-v1.json"],
  ["controller-only-shell-navigation-and-recovery-prerequisite-boundary", "benchmarks/controller-only-usability/cross-tier-controller-only-usability-plan-v1.json"],
  ["fixed-product-success-and-motion-latency-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["blocking-persona-and-accessibility-boundary", "docs/PLAYER_PERSONAS.md"],
  ["canonical-controller-and-reserved-action-boundary", "docs/CONTROLLER_INPUT.md"],
  ["offline-and-hosted-service-separation-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
  ["game-trust-containment-readiness-and-recovery-boundary", "docs/GAME_TRUST_TIERS.md"],
  ["runtime-neutral-signed-local-package-boundary", "benchmarks/signed-local-package/runtime-neutral-signed-local-package-plan-v1.json"],
  ["obstacle-sample-mechanic-and-current-implementation-boundary", "apps/console-lab/src/obstacle-game.ts"],
  ["two-player-obstacle-round-state-and-resolution-boundary", "apps/console-lab/src/two-player-obstacle-round.ts"],
  ["motion-api-actions-players-clocks-and-trace-contract-boundary", "packages/motion-contract/src/schema.ts"],
  ["play-support-policy-implementation-boundary", "packages/motion-contract/src/play-support-matrix.ts"],
];

export const FIRST_PARTY_MOTION_ADAPTATION_CANDIDATE_IDS = Object.freeze([
  "vibebots", "vibe-pinball", "vibe-racer", "vibe-pins",
  "fracking-asteroids", "hoops", "mi-casa-es-su-casa",
  "block-punch-kick", "epoch", "game-tape", "go-pit", "block-you",
  "determined", "software-dev-sim", "baby-piano", "clankers",
  "vibe-city", "flatline", "vibe-gear-2", "text-racer",
  "drop-dead-keep", "streamer-billboard", "go-dig",
]);

export const FIRST_PARTY_MOTION_ADAPTATION_DIMENSION_IDS = Object.freeze([
  "mechanic-fit", "ownership", "code-effort", "latency", "accessibility",
  "multiplayer-value", "showcase-value",
]);

export const FIRST_PARTY_MOTION_ADAPTATION_OPEN_KEYS = Object.freeze([
  "mechanicFitWeightPpm",
  "ownershipWeightPpm",
  "codeEffortWeightPpm",
  "latencyWeightPpm",
  "accessibilityWeightPpm",
  "multiplayerValueWeightPpm",
  "showcaseValueWeightPpm",
  "minimumEligibleMechanicFitScore",
  "minimumEligibleOwnershipScore",
  "minimumEligibleCodeEffortScore",
  "minimumEligibleLatencyScore",
  "minimumEligibleAccessibilityScore",
  "minimumEligibleMultiplayerValueScore",
  "minimumEligibleShowcaseValueScore",
  "maximumBoundedAdaptationImplementationPersonHours",
  "maximumAnnualMaintenancePersonHours",
  "minimumHouseholdTaskComprehensionPpm",
  "minimumRepeatUseIntentPpm",
  "minimumMaterialWeightedLeadPpm",
  "maximumRankedCandidateCount",
  "tieBreakDimensionOrderSha256",
  "exactReviewerQualificationConflictBlindScoringAndAdjudicationProtocolSha256",
  "exactScoreNormalizationUncertaintySensitivityAndMissingDataProtocolSha256",
  "exactEvidenceExpiryRegressionAndRerankingProtocolSha256",
]);

export const FIRST_PARTY_MOTION_ADAPTATION_BLOCKERS = Object.freeze([
  "I103-001-complete-obstacle-sample-motion-api-milestone-result",
  "I103-002-complete-one-player-qualified-result-and-stable-action-contract",
  "I103-003-complete-two-player-qualified-identity-action-menu-freeze-and-recovery-result",
  "I103-004-complete-controller-only-shell-navigation-loading-exit-and-recovery-result",
  "I103-005-exact-twenty-three-game-source-build-deployment-service-and-candidate-pool-manifest",
  "I103-006-exact-code-asset-font-audio-model-title-trademark-contributor-service-rights-and-maintenance-closure",
  "I103-007-exact-per-candidate-motion-mechanic-controller-alternative-and-failure-semantics-packets",
  "I103-008-exact-blocking-persona-safety-accessibility-comprehension-and-equivalent-control-protocol",
  "I103-009-exact-target-runtime-package-performance-exposure-latency-and-recovery-evidence-protocol",
  "I103-010-exact-one-and-two-player-value-identity-action-menu-freeze-interference-and-recovery-protocol",
  "I103-011-exact-source-bound-implementation-test-package-migration-maintenance-effort-and-uncertainty-protocol",
  "I103-012-exact-household-showcase-task-comprehension-repeat-value-disclosure-and-novelty-protocol",
  "I103-013-frozen-dimension-weights-eligibility-thresholds-tie-break-materiality-rank-depth-and-sensitivity-rules",
  "I103-014-exact-independent-reviewer-qualification-conflict-blind-scoring-adjudication-and-evidence-expiry-policy",
  "I103-015-closed-path-free-data-retention-deletion-incident-and-complete-adverse-evidence-policy",
  "I103-016-owner-reviewed-ranking-selection-scope-budget-rights-release-publication-and-product-decision-boundary",
]);

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  assert.ok(
    !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
    `${label} must not contain a UTF-8 BOM`,
  );
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has a bare CR`);
  return text.replaceAll("\r\n", "\n");
}

function digest(bytes, label) {
  return createHash("sha256").update(normalizedText(bytes, label)).digest("hex");
}

function contractDigest(plan) {
  const normalized = structuredClone(plan);
  for (const binding of normalized.sourceBindings) binding.sha256 = ZERO_SHA256;
  return createHash("sha256")
    .update(`${JSON.stringify(normalized, null, 2)}\n`)
    .digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.ok(Array.isArray(bindings));
  assert.equal(bindings.length, sourceDefinitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], sourceDefinitions[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    const relativePath = relative(repositoryRoot, absolute);
    assert.ok(relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath));
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

async function validateCandidateSource(plan, repositoryRoot) {
  const source = JSON.parse(normalizedText(
    await readFile(resolve(repositoryRoot, sourceDefinitions[0][1])),
    sourceDefinitions[0][1],
  ));
  assert.equal(source.qualification, "zero-offline-redistribution-approvals");
  assert.equal(source.summary.redistributionApprovedCount, 0);
  assert.equal(source.summary.ownerAuthorizationRecordedCount, 0);
  assert.deepEqual(source.games.map((game) => game.id), FIRST_PARTY_MOTION_ADAPTATION_CANDIDATE_IDS);
  assert.deepEqual(plan.candidatePoolContract.candidateGameIds, FIRST_PARTY_MOTION_ADAPTATION_CANDIDATE_IDS);
}

export async function validateFirstPartyMotionAdaptationRankingPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, FIRST_PARTY_MOTION_ADAPTATION_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "i103-first-party-motion-adaptation-ranking-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26T23:59:59.000Z");
  assert.match(plan.qualificationScope, /I-103/u);
  assert.match(plan.claimBoundary, /strict zero-result/u);
  assert.match(plan.claimBoundary, /D-113/u);
  assert.match(plan.claimBoundary, /No source checkout/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);
  await validateCandidateSource(plan, repositoryRoot);

  assert.equal(
    contractDigest(plan),
    FIRST_PARTY_MOTION_ADAPTATION_CONTRACT_SHA256,
    "plan contract drifted",
  );

  assert.equal(plan.candidatePoolContract.candidateCount, FIRST_PARTY_MOTION_ADAPTATION_CANDIDATE_IDS.length);
  assert.equal(plan.candidatePoolContract.currentRightsDisposition, "zero-offline-redistribution-approvals");
  assert.equal(plan.candidatePoolContract.everyCandidateStartsIneligibleUnscoredUnrankedAndUnselected, true);
  assert.equal(plan.candidatePoolContract.communityGamesObstacleSampleAndGodotSampleMayEnterThisRankingPool, false);
  assert.equal(plan.candidatePoolContract.candidatePoolChangeRequiresACompleteNewPlanAndRerun, true);

  assert.deepEqual(
    plan.scoringDimensions.map((dimension) => dimension.dimensionId),
    FIRST_PARTY_MOTION_ADAPTATION_DIMENSION_IDS,
  );
  for (const dimension of plan.scoringDimensions) {
    const shortcut = Object.keys(dimension).find((key) => key.startsWith("mayBeScoredFrom"));
    assert.equal(dimension[shortcut], false, `${dimension.dimensionId} shortcut must remain false`);
  }

  assert.deepEqual(plan.evidenceMatrix.candidateGameIds, FIRST_PARTY_MOTION_ADAPTATION_CANDIDATE_IDS);
  assert.deepEqual(plan.evidenceMatrix.dimensionIds, FIRST_PARTY_MOTION_ADAPTATION_DIMENSION_IDS);
  assert.equal(
    plan.evidenceMatrix.requiredCandidateDimensionCellCount,
    plan.evidenceMatrix.candidateCount * plan.evidenceMatrix.dimensionCount,
  );
  assert.equal(
    plan.evidenceMatrix.requiredIndependentReviewCount,
    plan.evidenceMatrix.requiredCandidateDimensionCellCount
      * plan.evidenceMatrix.independentReviewsPerCell,
  );
  assert.equal(plan.evidenceMatrix.missingEvidenceMayBeConvertedToZeroMeanNeutralOrEstimatedScore, false);
  assert.equal(plan.evidenceMatrix.oneCandidateDimensionReviewerBestCaseOrAggregateMayRescueAnother, false);

  assert.deepEqual(plan.scoringScale.scoreDefinitions.map(({ score }) => score), [0, 1, 2, 3, 4]);
  assert.equal(plan.scoringScale.eligibilityGatesRemainSeparateFromWeightedScores, true);
  assert.equal(plan.scoringScale.scoreMayNotOverrideRightsSafetyAccessibilityLatencyControllerTargetOrServiceFailure, true);

  exactKeys(plan.openAcceptance, FIRST_PARTY_MOTION_ADAPTATION_OPEN_KEYS, "openAcceptance");
  for (const key of FIRST_PARTY_MOTION_ADAPTATION_OPEN_KEYS) {
    assert.equal(plan.openAcceptance[key], null, `openAcceptance.${key} must remain open`);
  }
  for (const value of Object.values(plan.rankingProtocol.dimensionWeightPpm)) assert.equal(value, null);
  for (const value of Object.values(plan.rankingProtocol.minimumEligibleDimensionScoreById)) assert.equal(value, null);
  assert.deepEqual(plan.rankingProtocol.tieBreakDimensionOrder, []);
  assert.equal(plan.rankingProtocol.weightsThresholdsTieBreaksAndMaterialityMustBeFrozenBeforeAnyScoring, true);
  assert.equal(plan.rankingProtocol.postEvidenceWeightThresholdTieBreakCandidateOrEvidenceExclusionAllowed, false);

  assert.equal(plan.fixedAcceptance.maximumFirstMilestoneExistingGameAdaptationsStartedOrCommitted, 0);
  assert.equal(plan.fixedAcceptance.maximumCandidatesEligibleWithIncompleteRightsOwnershipOrMaintenanceAuthority, 0);
  assert.equal(plan.fixedAcceptance.maximumCandidatesEligibleWithoutEquivalentControllerAlternative, 0);
  assert.equal(plan.fixedAcceptance.maximumCandidatesEligibleWithPredictedOrMeasuredExposureToActionP95UsAbove120000, 0);
  assert.equal(plan.fixedAcceptance.everyObstacleOnePlayerTwoPlayerAndShellPrerequisiteMustPassBeforeScoring, true);
  assert.equal(plan.fixedAcceptance.weightedScoreMayOverrideASeparateEligibilityGate, false);
  assert.equal(plan.fixedAcceptance.rankOrTechnicalPassMaySelectAuthorizeAdaptAdmitPackagePublishOrCommitAProduct, false);

  assert.equal(plan.decisionProtocol.d113FirstMilestoneObstacleOnlyBoundaryRemains, true);
  assert.equal(plan.decisionProtocol.topRankedCandidateAutomaticallySelected, false);
  assert.equal(plan.decisionProtocol.selectionMayOccurWithoutSeparateOwnerDecisionAndCompleteEligibilityReview, false);
  assert.deepEqual(plan.decisionProtocol.eligibleCandidateIds, []);
  assert.deepEqual(plan.decisionProtocol.orderedRankedCandidateIds, []);
  assert.equal(plan.decisionProtocol.selectedAdaptationCandidateId, null);

  for (const [key, value] of Object.entries(plan.authorityBoundary)) {
    assert.equal(value, false, `authorityBoundary.${key} must remain false`);
  }
  for (const key of [
    "sourceArtifactServiceOrDeploymentPayloadBytesAllowedInPlanRepositoryOrResult",
    "participantReviewerOwnerMaintainerContributorOrHouseholdNamesAndStableIdentifiersAllowed",
    "facesVoicesScreenshotsVideoAudioBodyDataProfilesSavesOrEnteredTextAllowed",
    "pathsUsernamesHostnamesRepositoryBranchesIssueIdsUrlsWithQueriesCommandsArgumentsOrEnvironmentValuesAllowed",
    "credentialsTokensCookiesAccountIdsServicePayloadsOrPrivateRightsDocumentsAllowed",
    "freeTextGameSourceServiceParticipantReviewerLegalOrOperatorEvidenceAllowed",
  ]) assert.equal(plan.dataPolicy[key], false, `dataPolicy.${key} must remain false`);

  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, FIRST_PARTY_MOTION_ADAPTATION_BLOCKERS);
  assert.equal(plan.executionGate.mayScoreOrRank, false);
  assert.equal(plan.result, null);
  return plan;
}

export async function parseFirstPartyMotionAdaptationRankingPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes instanceof Uint8Array, "plan bytes must be a Uint8Array");
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error("plan is not valid JSON", { cause: error });
  }
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical two-space JSON with one trailing newline",
  );
  return validateFirstPartyMotionAdaptationRankingPlan(plan, repositoryRoot);
}

export async function validateTrackedFirstPartyMotionAdaptationRankingPlan() {
  return parseFirstPartyMotionAdaptationRankingPlanBytes(await readFile(trackedPath), root);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await validateTrackedFirstPartyMotionAdaptationRankingPlan();
  console.log("Validated blocked first-party motion-adaptation ranking plan (I-103).");
}
