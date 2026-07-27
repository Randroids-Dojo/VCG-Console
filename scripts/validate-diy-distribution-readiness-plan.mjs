import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/diy-distribution-readiness/diy-distribution-readiness-plan-v1.json",
);
const MAX_BYTES = 384 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const ZERO_SHA256 = "0".repeat(64);

export const DIY_DISTRIBUTION_READINESS_FORMAT =
  "vcg-diy-distribution-readiness-plan/v1";
export const DIY_DISTRIBUTION_READINESS_CONTRACT_SHA256 =
  "073fc8e643fb6aa1250cb780d8291eaa2d712e829444bbb69440efb38e966159";

const topKeys = [
  "schemaVersion",
  "artifactId",
  "investigationIds",
  "status",
  "generatedAt",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "scopeBoundary",
  "prerequisites",
  "applicabilityMatrix",
  "releaseMaterialsMatrix",
  "reviewProtocol",
  "outcomeGates",
  "executionAuthority",
  "dataPolicy",
  "blockers",
  "result",
];

const sourceDefinitions = [
  ["docs/RELEASE_COMPLIANCE.md", "software-license-sbom-and-release-blocker-input"],
  ["docs/ACTIVE_PLAY_SAFETY.md", "engineering-active-play-hazard-input"],
  ["docs/CHILD_PRIVACY_REVIEW_BRIEF.md", "engineering-child-and-family-privacy-input"],
  ["docs/DATA_RETENTION_AND_DELETION_POLICY.md", "engineering-data-lifecycle-input"],
  ["docs/CONSOLE_OPERATING_MODES.md", "mode-authority-and-support-boundary-input"],
  ["docs/PROTOTYPE_SUCCESS_CRITERIA.md", "prototype-evidence-and-claim-boundary-input"],
  ["docs/PLAYER_PERSONAS.md", "intended-user-accessibility-and-consent-input"],
  ["THIRD_PARTY_NOTICES.md", "current-curated-notice-input"],
];

export const DIY_DISTRIBUTION_DOMAIN_IDS = Object.freeze([
  "electrical",
  "radio",
  "ir-laser-and-optical-emissions",
  "thermal-fire-and-materials",
  "consumer-product-and-instructions",
]);

export const DIY_DISTRIBUTION_MATERIAL_IDS = Object.freeze([
  "safe-play-installation-and-stop-guidance",
  "privacy-data-use-retention-deletion-and-family-notice",
  "open-source-licenses-attributions-notices-and-source-availability",
  "no-warranty-and-no-formal-support-scope",
  "security-reporting-known-risk-and-incident-routing",
  "assembly-operation-update-recovery-and-disposal-guidance",
  "accessibility-readable-language-and-non-color-cue-review",
  "exact-hardware-compatibility-and-substitution-limitations",
]);

export const DIY_DISTRIBUTION_REVIEW_LAYER_IDS = Object.freeze([
  "engineering-source-and-implementation-review",
  "qualified-legal-and-applicability-review",
  "home-pilot-safety-and-comprehension-review",
  "target-tv-accessibility-and-controller-review",
]);

export const DIY_DISTRIBUTION_BLOCKERS = Object.freeze([
  "exact-release-candidate-not-frozen",
  "target-markets-and-distribution-channels-not-selected",
  "legal-operator-and-business-model-not-selected",
  "exact-final-hardware-bom-enclosure-and-build-files-absent",
  "exact-software-image-package-and-content-set-absent",
  "first-party-code-documentation-and-hardware-file-licenses-unselected",
  "pinned-model-and-content-redistribution-rights-unresolved",
  "target-architecture-sbom-notices-and-source-availability-incomplete",
  "market-specific-authoritative-applicability-research-absent",
  "qualified-independent-reviewer-roster-and-conflict-policy-absent",
  "home-pilot-safety-comprehension-protocol-and-authority-absent",
  "child-family-privacy-and-data-flow-legal-review-absent",
  "target-tv-accessibility-controller-and-readable-language-evidence-absent",
  "security-reporting-incident-routing-and-support-ownership-unselected",
  "warranty-no-support-known-risk-and-substitution-language-unapproved",
  "final-owner-release-approval-absent",
]);

const includedReleaseForms = [
  "source-code",
  "build-scripts",
  "software-images-and-packages-after-separate-release-gates",
  "bill-of-materials",
  "enclosure-source-files-and-templates",
  "build-use-recovery-and-safe-play-instructions",
];

const excludedReleaseForms = [
  "hardware-sales",
  "kit-sales",
  "preassembled-hardware",
  "paid-services",
  "warranty-backed-hardware",
  "formal-hardware-support",
  "certification-claims",
  "compatibility-with-arbitrary-substitutions",
  "entitlement-to-third-party-games-or-content",
];

const requiredDomainFields = [
  "exact-market-and-channel",
  "exact-candidate-scope",
  "authoritative-source-identity-version-and-date",
  "applicability-analysis",
  "required-tests-records-labels-and-instructions",
  "responsible-owner-and-qualified-reviewer",
  "adverse-conflicting-and-not-applicable-evidence",
  "dated-disposition",
];

const allowedData = [
  "authoritative-public-source-identifiers-versions-and-access-dates",
  "candidate-artifact-identifiers-byte-lengths-and-sha256",
  "closed-domain-material-review-codes",
  "aggregate-path-free-test-and-review-counts",
  "coded-adverse-conflict-blocker-and-disposition-records",
];

const prohibitedData = [
  "participant-child-household-reviewer-or-counsel-identities",
  "home-addresses-precise-locations-photos-video-audio-or-room-layouts",
  "raw-camera-skeleton-biometric-health-or-accessibility-payloads",
  "account-credentials-secrets-payment-tax-or-shipping-details",
  "device-serials-network-identifiers-filesystem-paths-or-support-bundle-content",
  "unbounded-notes-opinions-correspondence-or-free-text-evidence",
];

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
    exactKeys(binding, ["path", "sha256", "role"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.path, binding.role], sourceDefinitions[index]);
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

export async function validateDiyDistributionReadinessPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.schemaVersion, DIY_DISTRIBUTION_READINESS_FORMAT);
  assert.equal(plan.artifactId, "i143-i144-diy-distribution-readiness-plan-2026-07-26");
  assert.deepEqual(plan.investigationIds, ["I-143", "I-144"]);
  assert.equal(plan.status, "blocked-zero-result");
  assert.equal(plan.generatedAt, "2026-07-26T23:59:59.000Z");
  for (const phrase of [
    "No exact release candidate",
    "target market",
    "legal opinion",
    "public release",
    "hardware sale",
    "product-compliance conclusion",
  ]) assert.match(plan.claimBoundary, new RegExp(phrase, "u"));

  exactKeys(plan.sourceDigestContract, ["algorithm", "byteContract", "pathBase"], "sourceDigestContract");
  assert.equal(plan.sourceDigestContract.algorithm, "sha256");
  assert.match(plan.sourceDigestContract.byteContract, /CRLF normalized to LF/u);
  assert.equal(plan.sourceDigestContract.pathBase, "repository-root");
  await validateSources(plan.sourceBindings, repositoryRoot);
  assert.equal(
    contractDigest(plan),
    DIY_DISTRIBUTION_READINESS_CONTRACT_SHA256,
    "plan contract drifted",
  );

  exactKeys(plan.scopeBoundary, [
    "distributionModel",
    "includedReleaseForms",
    "excludedReleaseForms",
    "scopeExpansionRequiresSupersedingDecision",
    "repositoryPublicationIsNotMarketExemption",
    "diyLabelIsNotComplianceEvidence",
  ], "scopeBoundary");
  assert.equal(plan.scopeBoundary.distributionModel, "open-source-diy-project-only");
  assert.deepEqual(plan.scopeBoundary.includedReleaseForms, includedReleaseForms);
  assert.deepEqual(plan.scopeBoundary.excludedReleaseForms, excludedReleaseForms);
  assert.equal(plan.scopeBoundary.scopeExpansionRequiresSupersedingDecision, true);
  assert.equal(plan.scopeBoundary.repositoryPublicationIsNotMarketExemption, true);
  assert.equal(plan.scopeBoundary.diyLabelIsNotComplianceEvidence, true);

  exactKeys(plan.prerequisites, [
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
    "state",
  ], "prerequisites");
  for (const [key, value] of Object.entries(plan.prerequisites)) {
    if (key === "state") assert.equal(value, "blocked");
    else assert.equal(value, null, `prerequisites.${key} must remain open`);
  }

  exactKeys(plan.applicabilityMatrix, [
    "domainIds",
    "requiredFieldsPerDomain",
    "domainCount",
    "dispositions",
    "missingOrConflictedEvidenceDisposition",
    "crossDomainRescueAllowed",
    "supplierDeclarationAloneQualifiesAssembly",
    "componentCertificationAutomaticallyTransfers",
    "diyOrNoWarrantyLabelWaivesRequirements",
  ], "applicabilityMatrix");
  assert.deepEqual(plan.applicabilityMatrix.domainIds, DIY_DISTRIBUTION_DOMAIN_IDS);
  assert.deepEqual(plan.applicabilityMatrix.requiredFieldsPerDomain, requiredDomainFields);
  assert.equal(plan.applicabilityMatrix.domainCount, DIY_DISTRIBUTION_DOMAIN_IDS.length);
  assert.deepEqual(plan.applicabilityMatrix.dispositions, []);
  assert.equal(
    plan.applicabilityMatrix.missingOrConflictedEvidenceDisposition,
    "blocked-not-applicable-cannot-be-assumed",
  );
  for (const key of [
    "crossDomainRescueAllowed",
    "supplierDeclarationAloneQualifiesAssembly",
    "componentCertificationAutomaticallyTransfers",
    "diyOrNoWarrantyLabelWaivesRequirements",
  ]) assert.equal(plan.applicabilityMatrix[key], false, `applicabilityMatrix.${key} must remain false`);

  exactKeys(plan.releaseMaterialsMatrix, [
    "materialIds",
    "reviewLayerIds",
    "materialCount",
    "reviewLayerCount",
    "requiredReviewCellCount",
    "reviewRecords",
    "everyCellRequired",
    "missingUnavailableAdverseAndConflictedEvidenceRetained",
    "postResultExclusionAllowed",
    "aggregateOrBestCaseRescueAllowed",
    "existingEngineeringDocumentsAreReleaseApproval",
  ], "releaseMaterialsMatrix");
  assert.deepEqual(plan.releaseMaterialsMatrix.materialIds, DIY_DISTRIBUTION_MATERIAL_IDS);
  assert.deepEqual(plan.releaseMaterialsMatrix.reviewLayerIds, DIY_DISTRIBUTION_REVIEW_LAYER_IDS);
  assert.equal(plan.releaseMaterialsMatrix.materialCount, DIY_DISTRIBUTION_MATERIAL_IDS.length);
  assert.equal(plan.releaseMaterialsMatrix.reviewLayerCount, DIY_DISTRIBUTION_REVIEW_LAYER_IDS.length);
  assert.equal(
    plan.releaseMaterialsMatrix.requiredReviewCellCount,
    DIY_DISTRIBUTION_MATERIAL_IDS.length * DIY_DISTRIBUTION_REVIEW_LAYER_IDS.length,
  );
  assert.deepEqual(plan.releaseMaterialsMatrix.reviewRecords, []);
  assert.equal(plan.releaseMaterialsMatrix.everyCellRequired, true);
  assert.equal(plan.releaseMaterialsMatrix.missingUnavailableAdverseAndConflictedEvidenceRetained, true);
  assert.equal(plan.releaseMaterialsMatrix.postResultExclusionAllowed, false);
  assert.equal(plan.releaseMaterialsMatrix.aggregateOrBestCaseRescueAllowed, false);
  assert.equal(plan.releaseMaterialsMatrix.existingEngineeringDocumentsAreReleaseApproval, false);

  exactKeys(plan.reviewProtocol, [
    "authoritativeRequirementResearchAfterMarketFreeze",
    "sourceCurrencyVerifiedAtReviewAndRelease",
    "qualifiedReviewerIndependenceRequired",
    "originalReviewRecordsRetained",
    "conflictsEscalateWithoutSilentResolution",
    "notApplicableRequiresMarketCandidateSourceAndReviewer",
    "homePilotCannotProduceLegalApproval",
    "legalReviewCannotSubstituteForPhysicalOrAccessibilityEvidence",
    "engineeringPassCannotAuthorizePublication",
    "ownerApprovalCannotWaiveFixedZeroGates",
  ], "reviewProtocol");
  for (const [key, value] of Object.entries(plan.reviewProtocol)) {
    assert.equal(value, true, `reviewProtocol.${key} must remain true`);
  }

  exactKeys(plan.outcomeGates, [
    "exactApplicableRequirementSet",
    "requiredEvidenceStandards",
    "homePilotProtocolAndCohort",
    "accessibilityProtocolAndCohort",
    "reviewerConflictAndEscalationRules",
    "releaseCandidateFreezeWindow",
    "sourceCurrencyWindow",
    "finalSignoffFormat",
    "fixedZeroGates",
    "allDomainsAndMaterialsMustPass",
    "partialMarketOrArtifactResultCannotQualifyAnother",
    "releaseDecision",
  ], "outcomeGates");
  for (const key of Object.keys(plan.outcomeGates).slice(0, 8)) {
    assert.equal(plan.outcomeGates[key], null, `outcomeGates.${key} must remain open`);
  }
  exactKeys(plan.outcomeGates.fixedZeroGates, [
    "unresolvedApplicableRequirements",
    "missingRequiredReviewCells",
    "unsupportedSafetyPrivacyAccessibilityOrComplianceClaims",
    "unresolvedReleaseArtifactLicenseOrRedistributionBlockers",
    "unresolvedCriticalOrHighSeverityRisks",
    "unsafeOrMisleadingInstructions",
    "unreviewedChildOrFamilyPrivacyBlockers",
    "unresolvedAccessibilityBlockingFailures",
  ], "outcomeGates.fixedZeroGates");
  for (const [key, value] of Object.entries(plan.outcomeGates.fixedZeroGates)) {
    assert.equal(value, 0, `outcomeGates.fixedZeroGates.${key} must remain zero`);
  }
  assert.equal(plan.outcomeGates.allDomainsAndMaterialsMustPass, true);
  assert.equal(plan.outcomeGates.partialMarketOrArtifactResultCannotQualifyAnother, true);
  assert.equal(plan.outcomeGates.releaseDecision, null);

  for (const [key, value] of Object.entries(plan.executionAuthority)) {
    assert.equal(value, false, `executionAuthority.${key} must remain false`);
  }
  exactKeys(plan.dataPolicy, ["allowed", "prohibited", "releaseArtifactsContainOnlyReviewedMinimizedContent", "adverseEvidenceMayNotBeDeleted"], "dataPolicy");
  assert.deepEqual(plan.dataPolicy.allowed, allowedData);
  assert.deepEqual(plan.dataPolicy.prohibited, prohibitedData);
  assert.equal(plan.dataPolicy.releaseArtifactsContainOnlyReviewedMinimizedContent, true);
  assert.equal(plan.dataPolicy.adverseEvidenceMayNotBeDeleted, true);
  assert.deepEqual(plan.blockers, DIY_DISTRIBUTION_BLOCKERS);
  assert.equal(plan.blockers.length, 16);
  assert.equal(plan.result, null);
  return plan;
}

export async function parseDiyDistributionReadinessPlanBytes(bytes, repositoryRoot = root) {
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
  return validateDiyDistributionReadinessPlan(plan, repositoryRoot);
}

export async function validateTrackedDiyDistributionReadinessPlan() {
  return parseDiyDistributionReadinessPlanBytes(await readFile(trackedPath), root);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await validateTrackedDiyDistributionReadinessPlan();
  console.log("Validated blocked DIY-distribution readiness plan (I-143/I-144).");
}
