import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRemoteGameOfflineSummary,
  remoteGameObservationSha256,
} from "./generate-remote-game-offline-evidence.mjs";
import {
  parseCanonicalRemoteGameOfflineEvidence,
  REMOTE_GAME_OFFLINE_MAX_BYTES,
  validateRemoteGameOfflineEvidence,
  validateTrackedRemoteGameOfflineEvidence,
} from "./validate-remote-game-offline-evidence.mjs";

const tracked = await validateTrackedRemoteGameOfflineEvidence();

function clone() {
  return structuredClone(tracked);
}

function reseal(artifact) {
  artifact.observationSha256 = remoteGameObservationSha256(artifact.games);
  artifact.summary = buildRemoteGameOfflineSummary(artifact.games);
}

test("accepts the tracked 26-game fresh-profile observation", () => {
  const artifact = validateRemoteGameOfflineEvidence(clone());
  assert.equal(artifact.games.length, 26);
  assert.equal(artifact.summary.offlinePackageQualifiedCount, 0);
});

test("rejects catalog omission, reordering, or endpoint substitution", () => {
  const omitted = clone();
  omitted.games.pop();
  reseal(omitted);
  assert.throws(
    () => validateRemoteGameOfflineEvidence(omitted),
    /Expected values to be strictly equal|inventory/u,
  );

  const reordered = clone();
  [reordered.games[0], reordered.games[1]] = [
    reordered.games[1],
    reordered.games[0],
  ];
  reseal(reordered);
  assert.throws(
    () => validateRemoteGameOfflineEvidence(reordered),
    /inventory identity/u,
  );

  const substituted = clone();
  substituted.games[0].entrypoint = "https://example.test/";
  reseal(substituted);
  assert.throws(
    () => validateRemoteGameOfflineEvidence(substituted),
    /inventory identity/u,
  );
});

test("rejects qualification promotion or summary drift", () => {
  const promoted = clone();
  promoted.qualification = "offline-qualified";
  assert.throws(
    () => validateRemoteGameOfflineEvidence(promoted),
    /strictly equal/u,
  );

  const summary = clone();
  summary.summary.offlinePackageQualifiedCount = 1;
  assert.throws(
    () => validateRemoteGameOfflineEvidence(summary),
    /summary does not match/u,
  );
});

test("rejects observation mutation without a matching digest", () => {
  const artifact = clone();
  artifact.games[0].online.requestCount += 1;
  assert.throws(
    () => validateRemoteGameOfflineEvidence(artifact),
    /observation digest/u,
  );
});

test("rejects query strings, credentials, and hidden captured values", () => {
  const query = clone();
  query.games[0].finalOnlineUrl += "?token=secret";
  reseal(query);
  assert.throws(() => validateRemoteGameOfflineEvidence(query));

  const credentials = clone();
  credentials.games[0].finalOnlineUrl =
    "https://user:password@vibebots.randroid.dev/";
  reseal(credentials);
  assert.throws(() => validateRemoteGameOfflineEvidence(credentials));

  const values = clone();
  values.games[0].browserState.localStorageValues = { token: "secret" };
  reseal(values);
  assert.throws(
    () => validateRemoteGameOfflineEvidence(values),
    /unknown or missing fields/u,
  );
});

test("rejects inconsistent endpoint and service-worker records", () => {
  const manifestProbe = clone();
  const probe = manifestProbe.games
    .flatMap((game) => game.manifest.probes)
    .find((candidate) => candidate.outcome === "response");
  assert.ok(probe);
  probe.classification = "web-manifest";
  probe.manifest = null;
  reseal(manifestProbe);
  assert.throws(() => validateRemoteGameOfflineEvidence(manifestProbe));

  const updates = clone();
  updates.games[0].serviceWorker.update.attempted += 1;
  reseal(updates);
  assert.throws(
    () => validateRemoteGameOfflineEvidence(updates),
    /update totals/u,
  );
});

test("rejects unknown fields, changed limitations, and environment drift", () => {
  const unknown = clone();
  unknown.claimedOfflineCapable = true;
  assert.throws(
    () => validateRemoteGameOfflineEvidence(unknown),
    /unknown or missing fields/u,
  );

  const limitations = clone();
  limitations.limitations.pop();
  assert.throws(() => validateRemoteGameOfflineEvidence(limitations));

  const environment = clone();
  environment.environment.headless = false;
  assert.throws(() => validateRemoteGameOfflineEvidence(environment));
});

test("requires bounded canonical UTF-8 JSON", () => {
  const artifact = clone();
  const canonical = new TextEncoder().encode(
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  assert.deepEqual(parseCanonicalRemoteGameOfflineEvidence(canonical), artifact);
  assert.throws(
    () =>
      parseCanonicalRemoteGameOfflineEvidence(
        new TextEncoder().encode(JSON.stringify(artifact)),
      ),
    /canonical/u,
  );
  assert.throws(
    () =>
      parseCanonicalRemoteGameOfflineEvidence(
        new Uint8Array(REMOTE_GAME_OFFLINE_MAX_BYTES + 1),
      ),
    /byte size/u,
  );
  assert.throws(
    () => parseCanonicalRemoteGameOfflineEvidence(new Uint8Array([0xff])),
  );
});
