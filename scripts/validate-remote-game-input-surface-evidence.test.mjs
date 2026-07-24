import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRemoteGameInputSummary,
  remoteGameInputObservationSha256,
} from "./generate-remote-game-input-surface-evidence.mjs";
import {
  parseCanonicalRemoteGameInputEvidence,
  REMOTE_GAME_INPUT_MAX_BYTES,
  validateRemoteGameInputSurfaceEvidence,
  validateTrackedRemoteGameInputSurfaceEvidence,
} from "./validate-remote-game-input-surface-evidence.mjs";

const tracked = await validateTrackedRemoteGameInputSurfaceEvidence();

function clone() {
  return structuredClone(tracked);
}

function reseal(artifact) {
  artifact.observationSha256 = remoteGameInputObservationSha256(artifact.games);
  artifact.summary = buildRemoteGameInputSummary(artifact.games);
}

test("accepts the exact 26-game zero-qualification observation", () => {
  const artifact = validateRemoteGameInputSurfaceEvidence(clone());
  assert.equal(artifact.summary.gameCount, 26);
  assert.equal(artifact.summary.gamepadSignalCount, 5);
  assert.equal(artifact.summary.inputQualifiedCount, 0);
});

test("rejects catalog omission, reordering, or substitution", () => {
  const omitted = clone();
  omitted.games.pop();
  reseal(omitted);
  assert.throws(() => validateRemoteGameInputSurfaceEvidence(omitted));

  const reordered = clone();
  [reordered.games[0], reordered.games[1]] = [
    reordered.games[1],
    reordered.games[0],
  ];
  reseal(reordered);
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(reordered),
    /inventory identity/u,
  );

  const substituted = clone();
  substituted.games[0].entrypoint = "https://example.test/";
  reseal(substituted);
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(substituted),
    /inventory identity/u,
  );
});

test("rejects input qualification or signal promotion", () => {
  const qualification = clone();
  qualification.games[0].findings.inputQualification = "qualified";
  reseal(qualification);
  assert.throws(() => validateRemoteGameInputSurfaceEvidence(qualification));

  const signal = clone();
  signal.games[1].findings.gamepadSignal = true;
  reseal(signal);
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(signal),
    /findings do not match/u,
  );
});

test("rejects fabricated listener, poll, and control observations", () => {
  const listener = clone();
  listener.games[1].observation.runtime.listenerAdds.gamepadconnected += 1;
  reseal(listener);
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(listener),
    /findings do not match/u,
  );

  const poll = clone();
  poll.games[1].observation.runtime.gamepad.pollCount += 1;
  reseal(poll);
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(poll),
    /findings do not match/u,
  );

  const control = clone();
  control.games[0].observation.runtime.dom.input += 1;
  reseal(control);
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(control),
    /findings do not match/u,
  );
});

test("rejects mutating requests and unsafe captured fields", () => {
  const mutating = clone();
  mutating.games[0].observation.mutatingRequestCount = 1;
  reseal(mutating);
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(mutating),
    /mutating request/u,
  );

  const query = clone();
  query.games[0].finalUrl += "?token=secret";
  reseal(query);
  assert.throws(() => validateRemoteGameInputSurfaceEvidence(query));

  const secret = clone();
  secret.games[0].observation.requestBodies = ["secret"];
  reseal(secret);
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(secret),
    /unknown or missing fields/u,
  );
});

test("rejects provenance, environment, digest, or summary drift", () => {
  const provenance = clone();
  provenance.provenance.remoteOfflineObservationSha256 = "0".repeat(64);
  assert.throws(() => validateRemoteGameInputSurfaceEvidence(provenance));

  const environment = clone();
  environment.environment.headless = false;
  assert.throws(() => validateRemoteGameInputSurfaceEvidence(environment));

  const digest = clone();
  digest.games[0].observation.requestCount += 1;
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(digest),
    /observation digest/u,
  );

  const summary = clone();
  summary.summary.inputQualifiedCount = 1;
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(summary),
    /summary does not match/u,
  );
});

test("rejects unknown fields and changed limitations", () => {
  const unknown = clone();
  unknown.physicalControllerQualified = true;
  assert.throws(
    () => validateRemoteGameInputSurfaceEvidence(unknown),
    /unknown or missing fields/u,
  );

  const limitations = clone();
  limitations.limitations.pop();
  assert.throws(() => validateRemoteGameInputSurfaceEvidence(limitations));
});

test("requires bounded canonical UTF-8 JSON", () => {
  const artifact = clone();
  const canonical = new TextEncoder().encode(
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  assert.deepEqual(parseCanonicalRemoteGameInputEvidence(canonical), artifact);
  assert.throws(
    () =>
      parseCanonicalRemoteGameInputEvidence(
        new TextEncoder().encode(JSON.stringify(artifact)),
      ),
    /canonical/u,
  );
  assert.throws(
    () =>
      parseCanonicalRemoteGameInputEvidence(
        new Uint8Array(REMOTE_GAME_INPUT_MAX_BYTES + 1),
      ),
    /byte size/u,
  );
  assert.throws(
    () => parseCanonicalRemoteGameInputEvidence(new Uint8Array([0xff])),
  );
});
