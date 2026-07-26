import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFullCatalogCandidateSummary,
  fullCatalogCandidateObservationSha256,
} from "./generate-full-catalog-candidate-ledger.mjs";
import {
  FULL_CATALOG_CANDIDATE_MAX_BYTES,
  parseCanonicalFullCatalogCandidateLedger,
  validateFullCatalogCandidateLedger,
  validateTrackedFullCatalogCandidateLedger,
} from "./validate-full-catalog-candidate-ledger.mjs";

const tracked = await validateTrackedFullCatalogCandidateLedger();

function clone() {
  return structuredClone(tracked);
}

function reseal(artifact) {
  artifact.observationSha256 = fullCatalogCandidateObservationSha256(
    artifact.entries,
  );
  artifact.summary = buildFullCatalogCandidateSummary(artifact.entries);
}

test("accepts the exact 26-entry zero-admission ledger", () => {
  const artifact = validateFullCatalogCandidateLedger(clone());
  assert.equal(artifact.summary.entryCount, 26);
  assert.equal(artifact.summary.checkedInPublicManifestCount, 3);
  assert.equal(artifact.summary.admissionApprovedCount, 0);
});

test("rejects candidate omission, reordering, or identity substitution", () => {
  const omitted = clone();
  omitted.entries.pop();
  reseal(omitted);
  assert.throws(
    () => validateFullCatalogCandidateLedger(omitted),
    /bound evidence/u,
  );

  const reordered = clone();
  [reordered.entries[0], reordered.entries[1]] = [
    reordered.entries[1],
    reordered.entries[0],
  ];
  reseal(reordered);
  assert.throws(
    () => validateFullCatalogCandidateLedger(reordered),
    /bound evidence/u,
  );

  const identity = clone();
  identity.entries[0].liveEntrypoint = "https://example.test/";
  reseal(identity);
  assert.throws(
    () => validateFullCatalogCandidateLedger(identity),
    /bound evidence/u,
  );
});

test("rejects invented manifest or launcher presence", () => {
  const manifest = clone();
  const entry = manifest.entries.find((candidate) => candidate.id === "vibe-pinball");
  entry.currentRepositoryState.publicManifest = "checked-in-v1";
  reseal(manifest);
  assert.throws(
    () => validateFullCatalogCandidateLedger(manifest),
    /bound evidence/u,
  );

  const launcher = clone();
  const launcherEntry = launcher.entries.find(
    (candidate) => candidate.id === "vibe-pinball",
  );
  launcherEntry.currentRepositoryState.launcherCatalog = "checked-in-museum";
  reseal(launcher);
  assert.throws(
    () => validateFullCatalogCandidateLedger(launcher),
    /bound evidence/u,
  );
});

test("rejects runtime, network, or offline qualification promotion", () => {
  const runtime = clone();
  runtime.entries[0].runtime.qualification = "qualified";
  reseal(runtime);
  assert.throws(() => validateFullCatalogCandidateLedger(runtime));

  const network = clone();
  network.entries[0].network.candidate = "optional";
  reseal(network);
  assert.throws(() => validateFullCatalogCandidateLedger(network));

  const offline = clone();
  offline.entries[0].network.offlineQualification = "complete";
  reseal(offline);
  assert.throws(() => validateFullCatalogCandidateLedger(offline));
});

test("rejects input, architecture, permission, or host-authority promotion", () => {
  const input = clone();
  input.entries[0].input.qualification = "qualified";
  input.entries[0].input.reviewedRequiredDevices = ["gamepad"];
  reseal(input);
  assert.throws(() => validateFullCatalogCandidateLedger(input));

  const architecture = clone();
  architecture.entries[0].architecture.qualification = "qualified";
  architecture.entries[0].architecture.reviewedArchitectures = ["x86_64"];
  reseal(architecture);
  assert.throws(() => validateFullCatalogCandidateLedger(architecture));

  const permissions = clone();
  permissions.entries[0].permissions.qualification = "reviewed";
  permissions.entries[0].permissions.reviewedPermissions = ["network"];
  permissions.entries[0].permissions.hostAuthorityGranted = true;
  reseal(permissions);
  assert.throws(() => validateFullCatalogCandidateLedger(permissions));
});

test("rejects rights or trust admission promotion", () => {
  const rights = clone();
  rights.entries[0].rights.redistributionStatus = "approved";
  rights.entries[0].rights.ownerAuthorizationStatus = "recorded";
  reseal(rights);
  assert.throws(() => validateFullCatalogCandidateLedger(rights));

  const trust = clone();
  trust.entries[0].trust.admissionStatus = "approved";
  trust.entries[0].trust.admissionAuthorityGranted = true;
  trust.entries[0].blockerCodes = [];
  reseal(trust);
  assert.throws(() => validateFullCatalogCandidateLedger(trust));
});

test("rejects provenance, digest, summary, or policy drift", () => {
  const provenance = clone();
  provenance.provenance.gameServiceObservationSha256 = "0".repeat(64);
  assert.throws(() => validateFullCatalogCandidateLedger(provenance));

  const digest = clone();
  digest.entries[0].services.signalCounts.database += 1;
  assert.throws(
    () => validateFullCatalogCandidateLedger(digest),
    /bound evidence|observation digest/u,
  );

  const summary = clone();
  summary.summary.admissionApprovedCount = 1;
  assert.throws(
    () => validateFullCatalogCandidateLedger(summary),
    /summary does not match/u,
  );

  const policy = clone();
  policy.policy.productionCatalogMutation = true;
  assert.throws(() => validateFullCatalogCandidateLedger(policy));
});

test("rejects unknown fields, changed limits, and non-canonical bytes", () => {
  const unknown = clone();
  unknown.entries[0].permissions.implicitNetwork = true;
  reseal(unknown);
  assert.throws(
    () => validateFullCatalogCandidateLedger(unknown),
    /bound evidence/u,
  );

  const limitations = clone();
  limitations.limitations.pop();
  assert.throws(() => validateFullCatalogCandidateLedger(limitations));

  const canonical = new TextEncoder().encode(
    `${JSON.stringify(tracked, null, 2)}\n`,
  );
  assert.deepEqual(parseCanonicalFullCatalogCandidateLedger(canonical), tracked);
  assert.throws(
    () =>
      parseCanonicalFullCatalogCandidateLedger(
        new TextEncoder().encode(JSON.stringify(tracked)),
      ),
    /canonical/u,
  );
  assert.throws(
    () =>
      parseCanonicalFullCatalogCandidateLedger(
        new Uint8Array(FULL_CATALOG_CANDIDATE_MAX_BYTES + 1),
      ),
    /byte size/u,
  );
  assert.throws(
    () => parseCanonicalFullCatalogCandidateLedger(new Uint8Array([0xff])),
  );
});
