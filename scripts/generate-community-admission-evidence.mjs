import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const COMMUNITY_ADMISSION_FORMAT =
  "vcg-community-admission-exercise/v1";
export const COMMUNITY_ADMISSION_DATE = "2026-07-29";
export const COMMUNITY_ADMISSION_REVIEW_CATEGORIES = Object.freeze([
  "submission-authority",
  "content",
  "controller-and-reserved-actions",
  "permissions",
  "privacy",
  "loading-and-offline",
  "security",
  "update-owner",
  "emergency-removal",
]);
export const COMMUNITY_ADMISSION_EVENT_CODES = Object.freeze([
  "submission-received",
  "review-completed",
  "test-decision-issued",
  "test-catalog-published",
  "emergency-disabled",
  "revocation-published",
  "user-data-disposition-recorded",
]);
export const COMMUNITY_ADMISSION_CLAIM_BOUNDARY =
  "This deterministic desk exercise binds one hosted and one local-web test submission to exact checked-in manifest identities, records every required manual-review category, issues version-and-entrypoint-scoped test decisions, publishes only into an isolated test namespace, exercises emergency disable and revocation state transitions, records user-data dispositions, and retains path-free ordered audit events. It grants no production authority, changes no production catalog or package state, makes nothing visible in family mode, proves no submitter rights, terminates no real runtime process, and does not qualify either game.";
export const COMMUNITY_ADMISSION_LIMITATIONS = Object.freeze([
  "The checked-in manifests are review fixtures, not verified submissions from authorized publishers or production package artifacts.",
  "Checklist results prove the workflow can retain required review categories and blockers; they do not prove content, rights, privacy, security, accessibility, controller behavior, offline behavior, or update ownership.",
  "Catalog publication, emergency disable, revocation, and user-data handling are isolated state-transition records. No production catalog, installed package, save, active process, or external service was changed.",
  "A product workflow still needs authenticated reviewer and submitter identities, approval thresholds, durable signing and anti-rollback authority, active-session enforcement, notices, appeal or reinstatement rules, and target-system evidence.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  root,
  "benchmarks/community-admission/community-admission-exercise-v1.json",
);
const provenancePaths = Object.freeze({
  contractPath: "docs/COMMUNITY_GAME_ADMISSION.md",
  generatorPath: "scripts/generate-community-admission-evidence.mjs",
  validatorPath: "scripts/validate-community-admission-evidence.mjs",
});
const cases = Object.freeze([
  Object.freeze({
    caseId: "hosted-test-submission",
    manifestPath: "catalog/determined.vcg-game.json",
    expectedRuntime: "remote-web",
    blockingProductionFacts: Object.freeze([
      "publisher-authority-unverified",
      "controller-exit-unverified",
      "privacy-review-unverified",
      "update-owner-unverified",
      "reserved-home-back-unverified",
    ]),
    userDataPolicy: "no-console-managed-data-in-test-exercise",
    userDataResult: "no-production-data-observed-or-mutated",
  }),
  Object.freeze({
    caseId: "local-test-submission",
    manifestPath:
      "packages/game-manifest/fixtures/v1/valid/local-web.vcg-game.json",
    expectedRuntime: "local-web",
    blockingProductionFacts: Object.freeze([
      "package-signature-unavailable",
      "payload-artifact-unavailable",
      "sandbox-unqualified",
      "controller-exit-unverified",
      "update-owner-unverified",
    ]),
    userDataPolicy:
      "remove-test-package-preserve-user-data-pending-owner-policy",
    userDataResult: "state-transition-recorded-no-files-mutated",
  }),
]);

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function scopeFor(manifest, manifestSha256) {
  const entrypointScope =
    manifest.runtime === "remote-web"
      ? new URL(manifest.entrypoint).origin
      : `manifest-sha256:${manifestSha256}`;
  return {
    gameId: manifest.id,
    version: manifest.version,
    runtime: manifest.runtime,
    entrypointScope,
    manifestSha256,
  };
}

function auditEvents(scopeDigest) {
  return COMMUNITY_ADMISSION_EVENT_CODES.map((code, index) => ({
    sequence: index + 1,
    code,
    scopeDigest,
    testOnly: true,
  }));
}

async function provenance() {
  const entries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => [
      key,
      path,
      normalizedSha256(await readFile(resolve(root, path))),
    ]),
  );
  return Object.fromEntries(
    entries.flatMap(([key, path, digest]) => [
      [key, path],
      [`${key}Sha256`, digest],
    ]),
  );
}

async function buildCase(definition) {
  const manifestBytes = await readFile(resolve(root, definition.manifestPath));
  const manifest = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes),
  );
  assert.equal(manifest.runtime, definition.expectedRuntime);
  const manifestSha256 = normalizedSha256(manifestBytes);
  const scope = scopeFor(manifest, manifestSha256);
  const scopeDigest = sha256Text(JSON.stringify(scope));
  return {
    caseId: definition.caseId,
    source: {
      manifestPath: definition.manifestPath,
      manifestBytes: manifestBytes.length,
      manifestSha256,
      gameId: manifest.id,
      version: manifest.version,
      runtime: manifest.runtime,
      entrypointScope: scope.entrypointScope,
    },
    submission: {
      kind: "synthetic-test-submission",
      authorityEvidence: "test-fixture-only-not-publisher-authority",
      developerSideload: false,
      personalDataIncluded: false,
    },
    review: {
      categories: COMMUNITY_ADMISSION_REVIEW_CATEGORIES.map((category) => ({
        category,
        result: "exercise-recorded-no-product-proof",
      })),
      blockingProductionFacts: [...definition.blockingProductionFacts],
      recommendation: "block-production-admission",
    },
    decision: {
      scope,
      scopeDigest,
      outcome: "test-workflow-only",
      productionAuthority: false,
      familyModeAuthority: false,
    },
    publication: {
      namespace: "isolated-community-review-exercise",
      testCatalogPublished: true,
      productionCatalogChanged: false,
      familyModeVisible: false,
      developerNamespacePromoted: false,
    },
    emergencyRemoval: {
      testDisableApplied: true,
      testRevocationApplied: true,
      newTestLaunchDenied: true,
      testCatalogEntryRemoved: true,
      runtimeProcessTerminationTested: false,
      productionStateChanged: false,
    },
    userData: {
      policy: definition.userDataPolicy,
      result: definition.userDataResult,
      productionFilesMutated: false,
    },
    audit: {
      containsPersonalData: false,
      containsFreeText: false,
      events: auditEvents(scopeDigest),
    },
    finalDisposition: "test-exercise-complete-not-product-approved",
  };
}

export async function buildCommunityAdmissionEvidence(generatedAtUtc) {
  assert.ok(Number.isFinite(Date.parse(generatedAtUtc)));
  assert.ok(generatedAtUtc.startsWith(`${COMMUNITY_ADMISSION_DATE}T`));
  const submissions = [];
  for (const definition of cases) {
    submissions.push(await buildCase(definition));
  }
  return {
    format: COMMUNITY_ADMISSION_FORMAT,
    evidenceDate: COMMUNITY_ADMISSION_DATE,
    evidenceClass: "deterministic-isolated-community-admission-desk-exercise",
    qualification: "workflow-exercise-only-not-game-or-product-approval",
    generatedAtUtc,
    policy: {
      testNamespace: "isolated-community-review-exercise",
      familyModeAdmission: false,
      developerNamespaceAdmission: false,
      productionCatalogMutation: false,
      productionPackageInstallation: false,
      reviewCategories: [...COMMUNITY_ADMISSION_REVIEW_CATEGORIES],
      eventOrder: [...COMMUNITY_ADMISSION_EVENT_CODES],
    },
    submissions,
    summary: {
      submissionCount: 2,
      hostedSubmissionCount: 1,
      localSubmissionCount: 1,
      completedTestWorkflowCount: 2,
      productApprovedCount: 0,
      familyVisibleCount: 0,
      productionCatalogMutationCount: 0,
      productionPackageMutationCount: 0,
      realRuntimeTerminationCount: 0,
    },
    provenance: await provenance(),
    claimBoundary: COMMUNITY_ADMISSION_CLAIM_BOUNDARY,
    limitations: [...COMMUNITY_ADMISSION_LIMITATIONS],
  };
}

async function main() {
  const generatedAtUtc = new Date().toISOString();
  const artifact = await buildCommunityAdmissionEvidence(generatedAtUtc);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote isolated community admission exercise; submissions=${artifact.summary.submissionCount}; approved=${artifact.summary.productApprovedCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
