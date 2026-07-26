import assert from "node:assert/strict";
import test from "node:test";

import {
  validateCommunityAdmissionEvidence,
  validateTrackedCommunityAdmissionEvidence,
} from "./validate-community-admission-evidence.mjs";

async function fixture() {
  return structuredClone(await validateTrackedCommunityAdmissionEvidence());
}

async function rejects(mutator) {
  const artifact = await fixture();
  mutator(artifact);
  await assert.rejects(() => validateCommunityAdmissionEvidence(artifact));
}

test("accepts the exact isolated hosted and local workflow exercise", async () => {
  const artifact = await fixture();
  assert.equal(artifact.summary.hostedSubmissionCount, 1);
  assert.equal(artifact.summary.localSubmissionCount, 1);
  assert.equal(artifact.summary.productApprovedCount, 0);
});

test("rejects manifest identity, version, runtime, or entrypoint drift", async () => {
  await rejects((artifact) => {
    artifact.submissions[0].source.manifestSha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.submissions[0].decision.scope.version = "replacement";
  });
  await rejects((artifact) => {
    artifact.submissions[1].source.runtime = "native";
  });
  await rejects((artifact) => {
    artifact.submissions[0].source.entrypointScope =
      "https://replacement.invalid";
  });
});

test("rejects scope digest or cross-case substitution", async () => {
  await rejects((artifact) => {
    artifact.submissions[0].decision.scopeDigest = "f".repeat(64);
  });
  await rejects((artifact) => {
    artifact.submissions.reverse();
  });
  await rejects((artifact) => {
    artifact.submissions[1].decision.scope =
      structuredClone(artifact.submissions[0].decision.scope);
  });
});

test("rejects omitted, reordered, or promoted review categories", async () => {
  await rejects((artifact) => {
    artifact.submissions[0].review.categories.pop();
  });
  await rejects((artifact) => {
    artifact.submissions[1].review.categories.reverse();
  });
  await rejects((artifact) => {
    artifact.submissions[0].review.categories[0].result = "approved";
  });
  await rejects((artifact) => {
    artifact.submissions[1].review.blockingProductionFacts = [];
  });
});

test("rejects production or family authority promotion", async () => {
  await rejects((artifact) => {
    artifact.policy.familyModeAdmission = true;
  });
  await rejects((artifact) => {
    artifact.submissions[0].decision.productionAuthority = true;
  });
  await rejects((artifact) => {
    artifact.submissions[1].decision.familyModeAuthority = true;
  });
  await rejects((artifact) => {
    artifact.summary.productApprovedCount = 1;
  });
});

test("rejects production catalog, package, or developer promotion", async () => {
  await rejects((artifact) => {
    artifact.policy.productionCatalogMutation = true;
  });
  await rejects((artifact) => {
    artifact.submissions[0].publication.productionCatalogChanged = true;
  });
  await rejects((artifact) => {
    artifact.submissions[1].publication.developerNamespacePromoted = true;
  });
  await rejects((artifact) => {
    artifact.summary.productionPackageMutationCount = 1;
  });
});

test("rejects incomplete emergency disable or revocation", async () => {
  await rejects((artifact) => {
    artifact.submissions[0].emergencyRemoval.testDisableApplied = false;
  });
  await rejects((artifact) => {
    artifact.submissions[1].emergencyRemoval.testRevocationApplied = false;
  });
  await rejects((artifact) => {
    artifact.submissions[0].emergencyRemoval.newTestLaunchDenied = false;
  });
  await rejects((artifact) => {
    artifact.submissions[1].emergencyRemoval.productionStateChanged = true;
  });
});

test("rejects fabricated runtime termination or production file mutation", async () => {
  await rejects((artifact) => {
    artifact.submissions[0].emergencyRemoval.runtimeProcessTerminationTested =
      true;
  });
  await rejects((artifact) => {
    artifact.submissions[1].userData.productionFilesMutated = true;
  });
  await rejects((artifact) => {
    artifact.summary.realRuntimeTerminationCount = 1;
  });
});

test("rejects audit gaps, reordering, free text, or personal data", async () => {
  await rejects((artifact) => {
    artifact.submissions[0].audit.events[2].sequence = 8;
  });
  await rejects((artifact) => {
    artifact.submissions[1].audit.events.reverse();
  });
  await rejects((artifact) => {
    artifact.submissions[0].audit.containsFreeText = true;
  });
  await rejects((artifact) => {
    artifact.submissions[1].audit.containsPersonalData = true;
  });
});

test("rejects stale provenance or weakened claim boundaries", async () => {
  await rejects((artifact) => {
    artifact.provenance.contractPathSha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.claimBoundary = "Both games are approved.";
  });
  await rejects((artifact) => {
    artifact.limitations = [];
  });
});

test("rejects unknown claims", async () => {
  await rejects((artifact) => {
    artifact.productQualified = true;
  });
  await rejects((artifact) => {
    artifact.submissions[0].publication.productionSignature = "trusted";
  });
});
