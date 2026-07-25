import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFullCatalogCandidateEntry,
  buildFullCatalogCandidateSummary,
  FULL_CATALOG_CANDIDATE_DATE,
  FULL_CATALOG_CANDIDATE_FORMAT,
  FULL_CATALOG_CANDIDATE_LIMITATIONS,
  fullCatalogCandidateObservationSha256,
} from "./generate-full-catalog-candidate-ledger.mjs";
import { validateTrackedFirstPartyGameRightsScreen } from "./validate-first-party-game-rights-screen.mjs";
import { validateTrackedGameServiceDependencyScreen } from "./validate-game-service-dependency-screen.mjs";
import { validateTrackedRemoteGameOfflineEvidence } from "./validate-remote-game-offline-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "compliance/catalog-candidates/full-catalog-candidate-ledger-v2.json",
);
export const FULL_CATALOG_CANDIDATE_MAX_BYTES = 256 * 1024;
const [rightsReference, offlineReference, serviceReference] = await Promise.all([
  validateTrackedFirstPartyGameRightsScreen(),
  validateTrackedRemoteGameOfflineEvidence(),
  validateTrackedGameServiceDependencyScreen(),
]);
const rightsById = new Map(
  rightsReference.games.map((game) => [game.id, game]),
);
const offlineById = new Map(
  offlineReference.games.map((game) => [game.id, game]),
);
const expectedEntries = serviceReference.games.map((service) => {
  const offline = offlineById.get(service.id);
  assert.ok(offline, `offline reference missing for ${service.id}`);
  return buildFullCatalogCandidateEntry(
    service,
    offline,
    rightsById.get(service.id),
  );
});

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value), expected, `${label} has unknown or missing fields`);
}

export function parseCanonicalFullCatalogCandidateLedger(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= FULL_CATALOG_CANDIDATE_MAX_BYTES,
    "full catalog candidate ledger byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "full catalog candidate ledger must be canonical JSON",
  );
  return value;
}

export function validateFullCatalogCandidateLedger(value) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "policy",
      "provenance",
      "scope",
      "entries",
      "observationSha256",
      "summary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, FULL_CATALOG_CANDIDATE_FORMAT);
  assert.equal(value.evidenceDate, FULL_CATALOG_CANDIDATE_DATE);
  assert.equal(
    value.evidenceClass,
    "non-authoritative-full-catalog-candidate-reconciliation",
  );
  assert.equal(value.qualification, "zero-new-admissions");
  assert.deepEqual(value.policy, {
    sourceCatalogIsInputOnly: true,
    candidateRecordsGrantNoManifestAuthority: true,
    candidateRecordsGrantNoHostAuthority: true,
    productionCatalogMutation: false,
    requiredReviewGates: [
      "exact-source-build-deployment",
      "owner-code-content-title-rights",
      "trust-and-content-admission",
      "controller-input-and-reserved-actions",
      "network-services-and-degradation",
      "permissions-data-and-storage",
      "browser-containment-and-global-controls",
      "architecture-performance-and-recovery",
    ],
  });
  assert.deepEqual(value.provenance, {
    firstPartyRightsFormat: rightsReference.format,
    firstPartyRightsObservationSha256: rightsReference.observationSha256,
    remoteOfflineFormat: offlineReference.format,
    remoteOfflineObservationSha256: offlineReference.observationSha256,
    gameServiceFormat: serviceReference.format,
    gameServiceObservationSha256: serviceReference.observationSha256,
  });
  assert.deepEqual(value.scope, {
    catalogSnapshotDate: "2026-07-19",
    expectedEntryCount: 26,
    currentCheckedInMuseumIds: [
      "determined",
      "mi-casa-es-su-casa",
      "vibebots",
    ],
  });
  assert.deepEqual(
    value.entries,
    expectedEntries,
    "candidate entries do not exactly match the bound evidence",
  );
  for (const entry of value.entries) {
    assert.equal(entry.runtime.qualification, "unverified");
    assert.equal(entry.network.candidate, "required");
    assert.equal(entry.network.offlineQualification, "none");
    assert.equal(entry.input.qualification, "unverified");
    assert.deepEqual(entry.input.reviewedRequiredDevices, []);
    assert.equal(entry.architecture.qualification, "unverified");
    assert.deepEqual(entry.architecture.reviewedArchitectures, []);
    assert.equal(entry.permissions.qualification, "not-reviewed");
    assert.deepEqual(entry.permissions.reviewedPermissions, []);
    assert.equal(entry.permissions.hostAuthorityGranted, false);
    assert.equal(entry.trust.admissionStatus, "blocked");
    assert.equal(entry.trust.admissionAuthorityGranted, false);
    assert.ok(entry.blockerCodes.length >= 10);
  }
  assert.match(value.observationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    value.observationSha256,
    fullCatalogCandidateObservationSha256(value.entries),
    "observation digest does not bind the candidate entries",
  );
  assert.deepEqual(
    value.summary,
    buildFullCatalogCandidateSummary(value.entries),
    "summary does not match the candidate entries",
  );
  assert.equal(value.summary.admissionApprovedCount, 0);
  assert.equal(value.summary.hostAuthorityGrantedCount, 0);
  assert.equal(value.summary.productionCatalogMutationCount, 0);
  assert.deepEqual(value.limitations, [...FULL_CATALOG_CANDIDATE_LIMITATIONS]);
  return value;
}

export async function validateTrackedFullCatalogCandidateLedger() {
  return validateFullCatalogCandidateLedger(
    parseCanonicalFullCatalogCandidateLedger(await readFile(artifactPath)),
  );
}

async function main() {
  const artifact = await validateTrackedFullCatalogCandidateLedger();
  console.log(
    `validated full catalog candidate ledger; entries=${artifact.summary.entryCount}; manifests=${artifact.summary.checkedInPublicManifestCount}; approved=${artifact.summary.admissionApprovedCount}; mutations=${artifact.summary.productionCatalogMutationCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
