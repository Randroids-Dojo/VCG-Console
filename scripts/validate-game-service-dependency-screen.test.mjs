import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGameServiceSummary,
  gameServiceObservationSha256,
} from "./generate-game-service-dependency-screen.mjs";
import {
  GAME_SERVICE_SCREEN_MAX_BYTES,
  parseCanonicalGameServiceScreen,
  validateGameServiceDependencyScreen,
  validateTrackedGameServiceDependencyScreen,
} from "./validate-game-service-dependency-screen.mjs";

const tracked = await validateTrackedGameServiceDependencyScreen();

function clone() {
  return structuredClone(tracked);
}

function reseal(artifact) {
  artifact.observationSha256 = gameServiceObservationSha256(artifact.games);
  artifact.summary = buildGameServiceSummary(artifact.games);
}

test("accepts the exact 26-game zero-qualification screen", () => {
  const artifact = validateGameServiceDependencyScreen(clone());
  assert.equal(artifact.summary.gameCount, 26);
  assert.equal(artifact.summary.exactSourceScreenedCount, 23);
  assert.equal(artifact.summary.sourceUnavailableCount, 3);
});

test("rejects catalog omission, reordering, or substitution", () => {
  const omitted = clone();
  omitted.games.pop();
  reseal(omitted);
  assert.throws(() => validateGameServiceDependencyScreen(omitted));

  const reordered = clone();
  [reordered.games[0], reordered.games[1]] = [
    reordered.games[1],
    reordered.games[0],
  ];
  reseal(reordered);
  assert.throws(
    () => validateGameServiceDependencyScreen(reordered),
    /inventory identity/u,
  );

  const substituted = clone();
  substituted.games[0].liveUrl = "https://example.test/";
  reseal(substituted);
  assert.throws(
    () => validateGameServiceDependencyScreen(substituted),
    /inventory identity/u,
  );
});

test("rejects provenance substitution", () => {
  const rights = clone();
  rights.provenance.firstPartyRightsObservationSha256 = "0".repeat(64);
  assert.throws(() => validateGameServiceDependencyScreen(rights));

  const browser = clone();
  browser.provenance.remoteOfflineObservationSha256 = "0".repeat(64);
  assert.throws(() => validateGameServiceDependencyScreen(browser));
});

test("rejects degradation, offline, or catalog promotion", () => {
  const degradation = clone();
  degradation.games[0].degradationStatus = "verified";
  reseal(degradation);
  assert.throws(() => validateGameServiceDependencyScreen(degradation));

  const offline = clone();
  offline.games[0].offlineQualification = "complete";
  reseal(offline);
  assert.throws(() => validateGameServiceDependencyScreen(offline));

  const mutation = clone();
  mutation.policy.productionCatalogMutation = true;
  assert.throws(() => validateGameServiceDependencyScreen(mutation));
});

test("rejects source commit, archive, and browser evidence drift", () => {
  const commit = clone();
  commit.games[0].source.commit = "0".repeat(40);
  commit.games[0].source.archiveUrl =
    `https://codeload.github.com/Randroids-Dojo/VibeBots/zip/${"0".repeat(40)}`;
  reseal(commit);
  assert.throws(() => validateGameServiceDependencyScreen(commit));

  const archive = clone();
  archive.games[0].source.archiveSha256 = "0".repeat(64);
  assert.throws(
    () => validateGameServiceDependencyScreen(archive),
    /observation digest/u,
  );

  const browser = clone();
  browser.games[0].browser.observedOrigins = [];
  reseal(browser);
  assert.throws(
    () => validateGameServiceDependencyScreen(browser),
    /drifted from browser evidence/u,
  );
});

test("rejects invented service signals and community source promotion", () => {
  const signal = clone();
  signal.games[1].serviceSignals.auth = ["environment:AUTH_SECRET"];
  reseal(signal);
  assert.throws(
    () => validateGameServiceDependencyScreen(signal),
    /does not match source\/browser signals/u,
  );

  const community = clone();
  const candidate = community.games.find((game) => game.id === "bone-cleaver");
  candidate.source.status = "exact-public-source-screened";
  candidate.source.repository = "unknown";
  reseal(community);
  assert.throws(() => validateGameServiceDependencyScreen(community));
});

test("rejects unsafe paths, credential URLs, and captured value fields", () => {
  const path = clone();
  path.games[0].source.apiRoutePaths = ["../api/secret.ts"];
  reseal(path);
  assert.throws(() => validateGameServiceDependencyScreen(path));

  const url = clone();
  url.games[0].source.repositoryUrl =
    "https://user:password@github.com/Randroids-Dojo/VibeBots";
  reseal(url);
  assert.throws(() => validateGameServiceDependencyScreen(url));

  const values = clone();
  values.games[0].source.environmentVariableValues = {
    AUTH_SECRET: "secret",
  };
  reseal(values);
  assert.throws(
    () => validateGameServiceDependencyScreen(values),
    /unknown or missing fields/u,
  );
});

test("rejects digest, summary, unknown-field, or limitation drift", () => {
  const digest = clone();
  digest.games[0].source.screenedTextFileCount -= 1;
  assert.throws(
    () => validateGameServiceDependencyScreen(digest),
    /observation digest/u,
  );

  const summary = clone();
  summary.summary.offlineQualifiedGameCount = 1;
  assert.throws(
    () => validateGameServiceDependencyScreen(summary),
    /summary does not match/u,
  );

  const unknown = clone();
  unknown.serviceQualified = true;
  assert.throws(
    () => validateGameServiceDependencyScreen(unknown),
    /unknown or missing fields/u,
  );

  const limitations = clone();
  limitations.limitations.pop();
  assert.throws(() => validateGameServiceDependencyScreen(limitations));
});

test("requires bounded canonical UTF-8 JSON", () => {
  const artifact = clone();
  const canonical = new TextEncoder().encode(
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  assert.deepEqual(parseCanonicalGameServiceScreen(canonical), artifact);
  assert.throws(
    () =>
      parseCanonicalGameServiceScreen(
        new TextEncoder().encode(JSON.stringify(artifact)),
      ),
    /canonical/u,
  );
  assert.throws(
    () =>
      parseCanonicalGameServiceScreen(
        new Uint8Array(GAME_SERVICE_SCREEN_MAX_BYTES + 1),
      ),
    /byte size/u,
  );
  assert.throws(
    () => parseCanonicalGameServiceScreen(new Uint8Array([0xff])),
  );
});
