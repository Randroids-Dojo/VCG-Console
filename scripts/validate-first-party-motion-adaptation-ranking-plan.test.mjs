import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FIRST_PARTY_MOTION_ADAPTATION_BLOCKERS,
  FIRST_PARTY_MOTION_ADAPTATION_CANDIDATE_IDS,
  FIRST_PARTY_MOTION_ADAPTATION_CONTRACT_SHA256,
  FIRST_PARTY_MOTION_ADAPTATION_DIMENSION_IDS,
  FIRST_PARTY_MOTION_ADAPTATION_OPEN_KEYS,
  parseFirstPartyMotionAdaptationRankingPlanBytes,
  validateFirstPartyMotionAdaptationRankingPlan,
  validateTrackedFirstPartyMotionAdaptationRankingPlan,
} from "./validate-first-party-motion-adaptation-ranking-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = resolve(
  root,
  "benchmarks/first-party-motion-adaptation/first-party-motion-adaptation-ranking-plan-v1.json",
);
const sourceBytes = await readFile(planPath);
const sourceText = sourceBytes.toString("utf8");

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

async function rejectsMutation(mutate, pattern = /plan contract drifted/u) {
  const plan = await loadPlan();
  mutate(plan);
  await assert.rejects(validateFirstPartyMotionAdaptationRankingPlan(plan, root), pattern);
}

test("tracked I-103 first-party motion-adaptation ranking plan validates", async () => {
  const plan = await validateTrackedFirstPartyMotionAdaptationRankingPlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.result, null);
  assert.match(FIRST_PARTY_MOTION_ADAPTATION_CONTRACT_SHA256, /^[a-f0-9]{64}$/u);
});

test("source bindings are strict and normalized-digest verified", async () => {
  await rejectsMutation((plan) => {
    plan.sourceBindings[0].sha256 = "0".repeat(64);
  }, /digest drifted/u);
  await rejectsMutation((plan) => {
    plan.sourceBindings[0].path = "docs/DECISIONS.md";
  }, /Expected values to be strictly deep-equal/u);
});

test("unknown or reordered top-level fields are rejected", async () => {
  await rejectsMutation((plan) => {
    plan.notes = "invented";
  }, /fields drifted/u);
  await rejectsMutation((plan) => {
    const status = plan.status;
    delete plan.status;
    plan.status = status;
  }, /fields drifted/u);
});

test("obstacle one-player two-player and shell prerequisites cannot be bypassed", async () => {
  for (const key of [
    "completeObstacleSampleMilestoneResultSha256",
    "completeOnePlayerQualifiedResultSha256",
    "completeTwoPlayerQualifiedResultSha256",
    "completeControllerOnlyShellNavigationAndRecoveryResultSha256",
  ]) await rejectsMutation((plan) => {
    plan.prerequisiteGate[key] = "f".repeat(64);
  });
  await rejectsMutation((plan) => {
    plan.prerequisiteGate.everyObstacleOnePlayerTwoPlayerAndShellPrerequisitePassed = true;
  });
  await rejectsMutation((plan) => {
    plan.prerequisiteGate.rankingOpened = true;
  });
});

test("the exact twenty-three first-party candidates remain source-bound and complete", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.candidatePoolContract.candidateGameIds, FIRST_PARTY_MOTION_ADAPTATION_CANDIDATE_IDS);
  assert.equal(plan.candidatePoolContract.candidateCount, 23);
  await rejectsMutation((candidate) => {
    candidate.candidatePoolContract.candidateGameIds.pop();
  }, /Expected values to be strictly deep-equal|plan contract drifted/u);
  await rejectsMutation((candidate) => {
    candidate.candidatePoolContract.candidateGameIds.reverse();
  }, /Expected values to be strictly deep-equal|plan contract drifted/u);
  await rejectsMutation((candidate) => {
    candidate.candidatePoolContract.candidateGameIds[0] = "obstacle-sample";
  }, /Expected values to be strictly deep-equal|plan contract drifted/u);
});

test("candidate popularity familiarity preference and easy evidence cannot exclude or qualify", async () => {
  await rejectsMutation((plan) => {
    plan.candidatePoolContract.candidateMayBeExcludedForPopularityFamiliarityPreferenceOrMissingEasyEvidence = true;
  });
  await rejectsMutation((plan) => {
    plan.candidatePoolContract.hostedReachabilityRepositoryMembershipGameNameOrExistingCatalogCardMayEstablishEligibility = true;
  });
  await rejectsMutation((plan) => {
    plan.candidatePoolContract.communityGamesObstacleSampleAndGodotSampleMayEnterThisRankingPool = true;
  });
});

test("all seven exact scoring dimensions and anti-shortcuts remain fixed", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.scoringDimensions.map(({ dimensionId }) => dimensionId), FIRST_PARTY_MOTION_ADAPTATION_DIMENSION_IDS);
  for (let index = 0; index < FIRST_PARTY_MOTION_ADAPTATION_DIMENSION_IDS.length; index += 1) {
    const shortcut = Object.keys(plan.scoringDimensions[index]).find((key) => key.startsWith("mayBeScoredFrom"));
    await rejectsMutation((candidate) => {
      candidate.scoringDimensions[index][shortcut] = true;
    });
  }
  await rejectsMutation((candidate) => {
    candidate.scoringDimensions.pop();
  });
});

test("the 161-cell and 322-independent-review arithmetic remains exact", async () => {
  const plan = await loadPlan();
  assert.equal(plan.evidenceMatrix.requiredCandidateDimensionCellCount, 161);
  assert.equal(plan.evidenceMatrix.requiredIndependentReviewCount, 322);
  await rejectsMutation((candidate) => {
    candidate.evidenceMatrix.independentReviewsPerCell = 1;
  });
  await rejectsMutation((candidate) => {
    candidate.evidenceMatrix.requiredCandidateDimensionCellCount = 160;
  });
  await rejectsMutation((candidate) => {
    candidate.evidenceMatrix.reviewersMustScoreIndependentlyBeforeSeeingEachOtherOrAggregate = false;
  });
});

test("missing adverse conflict and original reviewer evidence cannot be hidden or imputed", async () => {
  await rejectsMutation((plan) => {
    plan.evidenceMatrix.missingUnavailableBlockedConflictOrAdverseEvidenceRemainsVisible = false;
  });
  await rejectsMutation((plan) => {
    plan.evidenceMatrix.missingEvidenceMayBeConvertedToZeroMeanNeutralOrEstimatedScore = true;
  });
  await rejectsMutation((plan) => {
    plan.evidenceMatrix.disagreementAdjudicationMustPreserveBothOriginalScoresAndEvidence = false;
  });
  await rejectsMutation((plan) => {
    plan.evidenceMatrix.oneCandidateDimensionReviewerBestCaseOrAggregateMayRescueAnother = true;
  });
});

test("the closed zero-through-four scale and separate eligibility gates remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.scoringScale.scoreDefinitions.map(({ score }) => score), [0, 1, 2, 3, 4]);
  await rejectsMutation((candidate) => {
    candidate.scoringScale.maximumScore = 5;
  });
  await rejectsMutation((candidate) => {
    candidate.scoringScale.eligibilityGatesRemainSeparateFromWeightedScores = false;
  });
  await rejectsMutation((candidate) => {
    candidate.scoringScale.scoreMayNotOverrideRightsSafetyAccessibilityLatencyControllerTargetOrServiceFailure = false;
  });
});

test("weights thresholds tie breaks rank depth and review protocols remain open", async () => {
  const plan = await loadPlan();
  assert.deepEqual(Object.keys(plan.openAcceptance), FIRST_PARTY_MOTION_ADAPTATION_OPEN_KEYS);
  for (const key of FIRST_PARTY_MOTION_ADAPTATION_OPEN_KEYS) {
    assert.equal(plan.openAcceptance[key], null);
    await rejectsMutation((candidate) => {
      candidate.openAcceptance[key] = key.endsWith("Sha256") ? "f".repeat(64) : 1;
    }, /must remain open|plan contract drifted/u);
  }
  await rejectsMutation((candidate) => {
    candidate.rankingProtocol.dimensionWeightPpm["mechanic-fit"] = 1000000;
  });
  await rejectsMutation((candidate) => {
    candidate.rankingProtocol.tieBreakDimensionOrder = ["mechanic-fit"];
  });
});

test("rights source build deployment controller accessibility latency and multiplayer gates stay non-rescuing", async () => {
  for (const key of [
    "maximumCandidatesEligibleWithIncompleteRightsOwnershipOrMaintenanceAuthority",
    "maximumCandidatesEligibleWithoutExactSourceBuildDeploymentAndServiceIdentity",
    "maximumCandidatesEligibleWithoutEquivalentControllerAlternative",
    "maximumCandidatesEligibleWithUnresolvedSafetyOrBlockingPersonaAccessibilityFailure",
    "maximumCandidatesEligibleWithPredictedOrMeasuredExposureToActionP95UsAbove120000",
    "maximumCandidatesEligibleWithCrossPlayerActionIdentityMenuFreezeOrRecoveryFailure",
  ]) await rejectsMutation((plan) => {
    plan.fixedAcceptance[key] = 1;
  });
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.weightedScoreMayOverrideASeparateEligibilityGate = true;
  });
});

test("D-113 keeps existing-game adaptation out of the first milestone", async () => {
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.maximumFirstMilestoneExistingGameAdaptationsStartedOrCommitted = 1;
  });
  await rejectsMutation((plan) => {
    plan.decisionProtocol.d113FirstMilestoneObstacleOnlyBoundaryRemains = false;
  });
  await rejectsMutation((plan) => {
    plan.decisionProtocol.rankingMayCreateWorkInTheFirstMotionApiMilestone = true;
  });
});

test("ranking and technical pass cannot select authorize admit package or publish", async () => {
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.rankOrTechnicalPassMaySelectAuthorizeAdaptAdmitPackagePublishOrCommitAProduct = true;
  });
  await rejectsMutation((plan) => {
    plan.decisionProtocol.topRankedCandidateAutomaticallySelected = true;
  });
  await rejectsMutation((plan) => {
    plan.decisionProtocol.selectedAdaptationCandidateId = "vibebots";
  });
  await rejectsMutation((plan) => {
    plan.decisionProtocol.orderedRankedCandidateIds = ["vibebots"];
  });
});

test("no source service target participant scoring rights or product authority exists", async () => {
  const plan = await loadPlan();
  for (const key of Object.keys(plan.authorityBoundary)) {
    await rejectsMutation((candidate) => {
      candidate.authorityBoundary[key] = true;
    });
  }
});

test("payloads identities media paths credentials and free-form evidence remain prohibited", async () => {
  for (const key of [
    "sourceArtifactServiceOrDeploymentPayloadBytesAllowedInPlanRepositoryOrResult",
    "participantReviewerOwnerMaintainerContributorOrHouseholdNamesAndStableIdentifiersAllowed",
    "facesVoicesScreenshotsVideoAudioBodyDataProfilesSavesOrEnteredTextAllowed",
    "pathsUsernamesHostnamesRepositoryBranchesIssueIdsUrlsWithQueriesCommandsArgumentsOrEnvironmentValuesAllowed",
    "credentialsTokensCookiesAccountIdsServicePayloadsOrPrivateRightsDocumentsAllowed",
    "freeTextGameSourceServiceParticipantReviewerLegalOrOperatorEvidenceAllowed",
  ]) await rejectsMutation((plan) => {
    plan.dataPolicy[key] = true;
  });
});

test("all sixteen blockers and the zero-result envelope remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.executionGate.blockerCodes, FIRST_PARTY_MOTION_ADAPTATION_BLOCKERS);
  await rejectsMutation((candidate) => {
    candidate.executionGate.blockerCodes.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.executionGate.status = "ready";
  });
  await rejectsMutation((candidate) => {
    candidate.executionGate.mayScoreOrRank = true;
  });
  await rejectsMutation((candidate) => {
    candidate.result = { selectedAdaptationCandidateId: "vibebots" };
  });
});

test("rejects noncanonical JSON duplicate keys BOM invalid UTF-8 bare CR and oversize", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "vcg-first-party-motion-adaptation-"));
  try {
    const duplicate = resolve(directory, "duplicate.json");
    await writeFile(duplicate, sourceText.replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "ranked",'));
    await assert.rejects(parseFirstPartyMotionAdaptationRankingPlanBytes(await readFile(duplicate)), /canonical two-space JSON/u);

    const noncanonical = resolve(directory, "noncanonical.json");
    await writeFile(noncanonical, JSON.stringify(JSON.parse(sourceText)));
    await assert.rejects(parseFirstPartyMotionAdaptationRankingPlanBytes(await readFile(noncanonical)), /canonical two-space JSON/u);

    const bom = resolve(directory, "bom.json");
    await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), sourceBytes]));
    await assert.rejects(parseFirstPartyMotionAdaptationRankingPlanBytes(await readFile(bom)), /BOM/u);

    const invalid = resolve(directory, "invalid.json");
    await writeFile(invalid, Buffer.from([0xc3, 0x28]));
    await assert.rejects(parseFirstPartyMotionAdaptationRankingPlanBytes(await readFile(invalid)), /valid UTF-8/u);

    const bareCr = resolve(directory, "bare-cr.json");
    await writeFile(bareCr, Buffer.from(sourceText.replace("\n", "\r")));
    await assert.rejects(parseFirstPartyMotionAdaptationRankingPlanBytes(await readFile(bareCr)), /bare CR/u);

    await assert.rejects(
      parseFirstPartyMotionAdaptationRankingPlanBytes(Buffer.alloc(384 * 1024 + 1, 0x20)),
      /exceeds/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
