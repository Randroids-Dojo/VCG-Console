import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFirstPartyRightsSummary,
  firstPartyRightsObservationSha256,
} from "./generate-first-party-game-rights-screen.mjs";
import {
  FIRST_PARTY_RIGHTS_MAX_BYTES,
  parseCanonicalFirstPartyRightsScreen,
  validateFirstPartyGameRightsScreen,
  validateTrackedFirstPartyGameRightsScreen,
} from "./validate-first-party-game-rights-screen.mjs";

const tracked = await validateTrackedFirstPartyGameRightsScreen();

function clone() {
  return structuredClone(tracked);
}

function reseal(artifact) {
  artifact.observationSha256 = firstPartyRightsObservationSha256(
    artifact.games,
  );
  artifact.summary = buildFirstPartyRightsSummary(artifact.games);
}

test("accepts the exact 23-game zero-approval screen", () => {
  const artifact = validateFirstPartyGameRightsScreen(clone());
  assert.equal(artifact.summary.gameCount, 23);
  assert.equal(artifact.summary.redistributionApprovedCount, 0);
});

test("rejects repository omission, reordering, or substitution", () => {
  const omitted = clone();
  omitted.games.pop();
  reseal(omitted);
  assert.throws(() => validateFirstPartyGameRightsScreen(omitted));

  const reordered = clone();
  [reordered.games[0], reordered.games[1]] = [
    reordered.games[1],
    reordered.games[0],
  ];
  reseal(reordered);
  assert.throws(
    () => validateFirstPartyGameRightsScreen(reordered),
    /inventory identity/u,
  );

  const substituted = clone();
  substituted.games[0].repository = "example";
  reseal(substituted);
  assert.throws(
    () => validateFirstPartyGameRightsScreen(substituted),
    /inventory identity/u,
  );
});

test("rejects approval, authorization, or production mutation promotion", () => {
  const approval = clone();
  approval.games[0].rights.redistributionStatus = "approved";
  approval.games[0].rights.ownerAuthorizationStatus = "recorded";
  reseal(approval);
  assert.throws(() => validateFirstPartyGameRightsScreen(approval));

  const qualification = clone();
  qualification.qualification = "redistribution-approved";
  assert.throws(() => validateFirstPartyGameRightsScreen(qualification));

  const mutation = clone();
  mutation.policy.productionCatalogMutation = true;
  assert.throws(() => validateFirstPartyGameRightsScreen(mutation));
});

test("rejects record mutation without a matching digest or summary", () => {
  const digest = clone();
  digest.games[0].assetInventory.image += 1;
  digest.games[0].assetInventory.total += 1;
  assert.throws(
    () => validateFirstPartyGameRightsScreen(digest),
    /observation digest/u,
  );

  const summary = clone();
  summary.summary.redistributionApprovedCount = 1;
  assert.throws(
    () => validateFirstPartyGameRightsScreen(summary),
    /summary does not match/u,
  );
});

test("rejects unsupported grant and license-scope promotion", () => {
  const noGrant = clone();
  noGrant.games[0].rights.codeGrantStatus =
    "repository-grant-observed-review-required";
  noGrant.games[0].rights.blockerCodes =
    noGrant.games[0].rights.blockerCodes.filter(
      (blocker) => blocker !== "code-license",
    );
  reseal(noGrant);
  assert.throws(() => validateFirstPartyGameRightsScreen(noGrant));

  const packageDeclaration = clone();
  const blockPunchKick = packageDeclaration.games.find(
    (game) => game.id === "block-punch-kick",
  );
  blockPunchKick.rights.codeGrantStatus =
    "repository-grant-observed-review-required";
  reseal(packageDeclaration);
  assert.throws(() =>
    validateFirstPartyGameRightsScreen(packageDeclaration));

  const exclusion = clone();
  const clankers = exclusion.games.find((game) => game.id === "clankers");
  clankers.rights.codeGrantStatus =
    "repository-grant-observed-review-required";
  clankers.rights.blockerCodes = clankers.rights.blockerCodes.filter(
    (blocker) => blocker !== "license-scope-closure",
  );
  reseal(exclusion);
  assert.throws(() => validateFirstPartyGameRightsScreen(exclusion));
});

test("rejects unsafe repository paths and URLs", () => {
  const traversal = clone();
  traversal.games[0].licenseNoticePaths = ["../LICENSE"];
  reseal(traversal);
  assert.throws(() => validateFirstPartyGameRightsScreen(traversal));

  const query = clone();
  query.games[0].liveUrl += "?token=secret";
  reseal(query);
  assert.throws(() => validateFirstPartyGameRightsScreen(query));

  const credentials = clone();
  credentials.games[0].repositoryUrl =
    "https://user:password@github.com/Randroids-Dojo/VibeBots";
  reseal(credentials);
  assert.throws(() => validateFirstPartyGameRightsScreen(credentials));
});

test("rejects unknown fields, changed limits, and stale evidence identity", () => {
  const unknown = clone();
  unknown.ownerApproved = true;
  assert.throws(
    () => validateFirstPartyGameRightsScreen(unknown),
    /unknown or missing fields/u,
  );

  const limitations = clone();
  limitations.limitations.pop();
  assert.throws(() => validateFirstPartyGameRightsScreen(limitations));

  const date = clone();
  date.evidenceDate = "2026-07-25";
  assert.throws(() => validateFirstPartyGameRightsScreen(date));
});

test("requires bounded canonical UTF-8 JSON", () => {
  const artifact = clone();
  const canonical = new TextEncoder().encode(
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  assert.deepEqual(parseCanonicalFirstPartyRightsScreen(canonical), artifact);
  assert.throws(
    () =>
      parseCanonicalFirstPartyRightsScreen(
        new TextEncoder().encode(JSON.stringify(artifact)),
      ),
    /canonical/u,
  );
  assert.throws(
    () =>
      parseCanonicalFirstPartyRightsScreen(
        new Uint8Array(FIRST_PARTY_RIGHTS_MAX_BYTES + 1),
      ),
    /byte size/u,
  );
  assert.throws(
    () => parseCanonicalFirstPartyRightsScreen(new Uint8Array([0xff])),
  );
});
