import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DIY_DISTRIBUTION_BLOCKERS,
  DIY_DISTRIBUTION_DOMAIN_IDS,
  DIY_DISTRIBUTION_MATERIAL_IDS,
  DIY_DISTRIBUTION_REVIEW_LAYER_IDS,
  parseDiyDistributionReadinessPlanBytes,
  validateDiyDistributionReadinessPlan,
  validateTrackedDiyDistributionReadinessPlan,
} from "./validate-diy-distribution-readiness-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/diy-distribution-readiness/diy-distribution-readiness-plan-v1.json",
);
const trackedBytes = await readFile(trackedPath);
const trackedPlan = JSON.parse(trackedBytes.toString("utf8"));

async function rejectsMutation(mutator, pattern = /drifted|must|remain|expected|contract/u) {
  const plan = structuredClone(trackedPlan);
  mutator(plan);
  await assert.rejects(() => validateDiyDistributionReadinessPlan(plan, root), pattern);
}

test("tracked I-143/I-144 DIY-distribution readiness plan validates", async () => {
  const plan = await validateTrackedDiyDistributionReadinessPlan();
  assert.deepEqual(plan.investigationIds, ["I-143", "I-144"]);
  assert.equal(plan.status, "blocked-zero-result");
  assert.equal(plan.result, null);
});

test("source bindings are exact, normalized, and digest verified", async () => {
  await rejectsMutation((plan) => {
    plan.sourceBindings[0].sha256 = "0".repeat(64);
  }, /digest drifted/u);
  await rejectsMutation((plan) => {
    plan.sourceBindings[1].path = "docs/DECISIONS.md";
  });
  await rejectsMutation((plan) => {
    plan.sourceBindings.reverse();
  });
});

test("closed top-level schema rejects unknown and reordered fields", async () => {
  await rejectsMutation((plan) => {
    plan.certified = true;
  });
  const reordered = Object.fromEntries(Object.entries(trackedPlan).reverse());
  await assert.rejects(
    () => validateDiyDistributionReadinessPlan(reordered, root),
    /fields drifted/u,
  );
});

test("DIY scope cannot become hardware sales, support, certification, or arbitrary compatibility", async () => {
  await rejectsMutation((plan) => {
    plan.scopeBoundary.excludedReleaseForms = plan.scopeBoundary.excludedReleaseForms.filter(
      (value) => value !== "hardware-sales",
    );
  });
  await rejectsMutation((plan) => {
    plan.scopeBoundary.includedReleaseForms.push("preassembled-hardware");
  });
  await rejectsMutation((plan) => {
    plan.scopeBoundary.diyLabelIsNotComplianceEvidence = false;
  });
  await rejectsMutation((plan) => {
    plan.scopeBoundary.repositoryPublicationIsNotMarketExemption = false;
  });
});

test("release, market, operator, reviewer, pilot, and publication prerequisites stay open", async () => {
  for (const key of [
    "exactReleaseCandidate",
    "exactSoftwareArtifactSet",
    "exactHardwareAssembly",
    "exactBillOfMaterials",
    "exactEnclosureAndBuildFiles",
    "legalOperatorAndBusinessModel",
    "targetMarketsAndDistributionChannels",
    "qualifiedReviewerRoster",
    "homePilotAndAccessibilityAuthority",
    "publicReleaseAuthority",
  ]) {
    await rejectsMutation((plan) => {
      plan.prerequisites[key] = "invented";
    });
  }
  await rejectsMutation((plan) => {
    plan.prerequisites.state = "ready";
  });
});

test("all five applicability domains remain exact and unassessed", async () => {
  assert.deepEqual(trackedPlan.applicabilityMatrix.domainIds, DIY_DISTRIBUTION_DOMAIN_IDS);
  assert.equal(trackedPlan.applicabilityMatrix.domainCount, 5);
  await rejectsMutation((plan) => {
    plan.applicabilityMatrix.domainIds.pop();
  });
  await rejectsMutation((plan) => {
    plan.applicabilityMatrix.dispositions.push({ domainId: "radio", applicable: false });
  });
  await rejectsMutation((plan) => {
    plan.applicabilityMatrix.missingOrConflictedEvidenceDisposition = "not-applicable";
  });
});

test("supplier, component, DIY, and cross-domain shortcuts cannot qualify the assembly", async () => {
  for (const key of [
    "crossDomainRescueAllowed",
    "supplierDeclarationAloneQualifiesAssembly",
    "componentCertificationAutomaticallyTransfers",
    "diyOrNoWarrantyLabelWaivesRequirements",
  ]) {
    await rejectsMutation((plan) => {
      plan.applicabilityMatrix[key] = true;
    });
  }
});

test("the eight-by-four release-material matrix remains complete", async () => {
  assert.deepEqual(trackedPlan.releaseMaterialsMatrix.materialIds, DIY_DISTRIBUTION_MATERIAL_IDS);
  assert.deepEqual(trackedPlan.releaseMaterialsMatrix.reviewLayerIds, DIY_DISTRIBUTION_REVIEW_LAYER_IDS);
  assert.equal(trackedPlan.releaseMaterialsMatrix.requiredReviewCellCount, 32);
  await rejectsMutation((plan) => {
    plan.releaseMaterialsMatrix.materialIds.shift();
  });
  await rejectsMutation((plan) => {
    plan.releaseMaterialsMatrix.reviewLayerIds.pop();
  });
  await rejectsMutation((plan) => {
    plan.releaseMaterialsMatrix.requiredReviewCellCount = 31;
  });
});

test("existing documents, best cases, and post-result exclusions cannot create release approval", async () => {
  for (const key of [
    "postResultExclusionAllowed",
    "aggregateOrBestCaseRescueAllowed",
    "existingEngineeringDocumentsAreReleaseApproval",
  ]) {
    await rejectsMutation((plan) => {
      plan.releaseMaterialsMatrix[key] = true;
    });
  }
  await rejectsMutation((plan) => {
    plan.releaseMaterialsMatrix.missingUnavailableAdverseAndConflictedEvidenceRetained = false;
  });
  await rejectsMutation((plan) => {
    plan.releaseMaterialsMatrix.reviewRecords.push({ outcome: "pass" });
  });
});

test("review independence, source currency, conflicts, and non-substitution rules remain mandatory", async () => {
  for (const key of Object.keys(trackedPlan.reviewProtocol)) {
    await rejectsMutation((plan) => {
      plan.reviewProtocol[key] = false;
    });
  }
});

test("outcome-sensitive gates remain null and every fixed-zero gate remains zero", async () => {
  for (const key of [
    "exactApplicableRequirementSet",
    "requiredEvidenceStandards",
    "homePilotProtocolAndCohort",
    "accessibilityProtocolAndCohort",
    "reviewerConflictAndEscalationRules",
    "releaseCandidateFreezeWindow",
    "sourceCurrencyWindow",
    "finalSignoffFormat",
  ]) {
    await rejectsMutation((plan) => {
      plan.outcomeGates[key] = "invented-after-observation";
    });
  }
  for (const key of Object.keys(trackedPlan.outcomeGates.fixedZeroGates)) {
    await rejectsMutation((plan) => {
      plan.outcomeGates.fixedZeroGates[key] = 1;
    });
  }
});

test("partial markets, partial artifacts, and owner preference cannot produce a release decision", async () => {
  await rejectsMutation((plan) => {
    plan.outcomeGates.allDomainsAndMaterialsMustPass = false;
  });
  await rejectsMutation((plan) => {
    plan.outcomeGates.partialMarketOrArtifactResultCannotQualifyAnother = false;
  });
  await rejectsMutation((plan) => {
    plan.outcomeGates.releaseDecision = "release";
  });
});

test("the plan grants no market, reviewer, participant, test, filing, claim, sale, or publication authority", async () => {
  for (const key of Object.keys(trackedPlan.executionAuthority)) {
    await rejectsMutation((plan) => {
      plan.executionAuthority[key] = true;
    });
  }
});

test("the minimized data boundary cannot admit identities, household media, payloads, secrets, paths, or free text", async () => {
  await rejectsMutation((plan) => {
    plan.dataPolicy.allowed.push("reviewer-name");
  });
  await rejectsMutation((plan) => {
    plan.dataPolicy.prohibited = plan.dataPolicy.prohibited.filter(
      (value) => !value.includes("home-addresses"),
    );
  });
  await rejectsMutation((plan) => {
    plan.dataPolicy.releaseArtifactsContainOnlyReviewedMinimizedContent = false;
  });
  await rejectsMutation((plan) => {
    plan.dataPolicy.adverseEvidenceMayNotBeDeleted = false;
  });
});

test("all sixteen blockers and the zero-result envelope remain exact", async () => {
  assert.deepEqual(trackedPlan.blockers, DIY_DISTRIBUTION_BLOCKERS);
  assert.equal(trackedPlan.blockers.length, 16);
  await rejectsMutation((plan) => {
    plan.blockers.pop();
  });
  await rejectsMutation((plan) => {
    plan.result = { releaseDecision: "approved" };
  });
  await rejectsMutation((plan) => {
    plan.status = "qualified";
  });
});

test("rejects noncanonical JSON, duplicate keys, BOM, invalid UTF-8, bare CR, and oversize", async () => {
  const compact = Buffer.from(JSON.stringify(trackedPlan), "utf8");
  await assert.rejects(
    () => parseDiyDistributionReadinessPlanBytes(compact, root),
    /canonical two-space JSON/u,
  );

  const duplicate = Buffer.from(
    trackedBytes.toString("utf8").replace(
      '  "status": "blocked-zero-result",',
      '  "status": "blocked-zero-result",\n  "status": "blocked-zero-result",',
    ),
    "utf8",
  );
  await assert.rejects(
    () => parseDiyDistributionReadinessPlanBytes(duplicate, root),
    /canonical two-space JSON/u,
  );

  await assert.rejects(
    () => parseDiyDistributionReadinessPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
      root,
    ),
    /UTF-8 BOM/u,
  );
  await assert.rejects(
    () => parseDiyDistributionReadinessPlanBytes(Uint8Array.from([0xc3, 0x28]), root),
    /not valid UTF-8/u,
  );
  await assert.rejects(
    () => parseDiyDistributionReadinessPlanBytes(
      Buffer.from(trackedBytes.toString("utf8").replace("\n", "\r"), "utf8"),
      root,
    ),
    /bare CR/u,
  );
  await assert.rejects(
    () => parseDiyDistributionReadinessPlanBytes(Buffer.alloc(384 * 1024 + 1, 0x20), root),
    /exceeds/u,
  );
});
