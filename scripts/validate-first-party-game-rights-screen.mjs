import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFirstPartyRightsSummary,
  FIRST_PARTY_GAMES,
  FIRST_PARTY_RIGHTS_LIMITATIONS,
  FIRST_PARTY_RIGHTS_SCREEN_DATE,
  FIRST_PARTY_RIGHTS_SCREEN_FORMAT,
  firstPartyRightsObservationSha256,
} from "./generate-first-party-game-rights-screen.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "compliance/first-party-game-rights/repository-rights-screen-v1.json",
);
export const FIRST_PARTY_RIGHTS_MAX_BYTES = 256 * 1024;

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value), expected, `${label} has unknown or missing fields`);
}

function integer(value, label) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, label);
}

function nullableString(value, label, maximum = 256) {
  assert.ok(
    value === null
      || (typeof value === "string"
        && value.length <= maximum
        && !/[\u0000-\u001f\u007f]/u.test(value)),
    label,
  );
}

function stringArray(value, label, maximumItems = 256) {
  assert.ok(Array.isArray(value) && value.length <= maximumItems, label);
  for (const item of value) {
    assert.ok(
      typeof item === "string"
        && item.length <= 1024
        && !/[\u0000-\u001f\u007f]/u.test(item),
      label,
    );
  }
  assert.deepEqual(
    value,
    [...new Set(value)].sort((left, right) => left.localeCompare(right)),
    `${label} must be sorted and unique`,
  );
}

function safeUrl(value, label) {
  const url = new URL(value);
  assert.equal(url.protocol, "https:", label);
  assert.equal(url.username, "", label);
  assert.equal(url.password, "", label);
  assert.equal(url.search, "", label);
  assert.equal(url.hash, "", label);
}

function safeRepositoryPath(value, label) {
  assert.ok(
    typeof value === "string"
      && value.length > 0
      && value.length <= 1024
      && !value.startsWith("/")
      && !value.includes("\\")
      && !value.split("/").some((segment) => segment === "" || segment === "..")
      && !/[\u0000-\u001f\u007f]/u.test(value),
    label,
  );
}

function validateGithubLicense(value, label) {
  exactKeys(value, ["key", "name", "spdxId"], label);
  nullableString(value.key, `${label}.key`);
  nullableString(value.name, `${label}.name`);
  nullableString(value.spdxId, `${label}.spdxId`);
  if (value.key === null) {
    assert.equal(value.name, null, label);
    assert.equal(value.spdxId, null, label);
  }
}

function validateRootLicense(value, label) {
  exactKeys(
    value,
    [
      "path",
      "bytes",
      "sha256",
      "firstLine",
      "grantSignal",
      "scopeExclusionSignal",
    ],
    label,
  );
  safeRepositoryPath(value.path, `${label}.path`);
  assert.equal(value.path.includes("/"), false, label);
  integer(value.bytes, `${label}.bytes`);
  assert.ok(value.bytes > 0, label);
  assert.match(value.sha256, /^[a-f0-9]{64}$/u, label);
  nullableString(value.firstLine, `${label}.firstLine`);
  assert.ok(
    ["mit-text-observed", "unclassified-text"].includes(value.grantSignal),
    label,
  );
  assert.equal(typeof value.scopeExclusionSignal, "boolean", label);
}

function validatePackageManifest(value, label) {
  exactKeys(
    value,
    ["present", "bytes", "sha256", "parsed", "name", "private", "license"],
    label,
  );
  assert.equal(typeof value.present, "boolean", label);
  if (!value.present) {
    for (const field of [
      "bytes",
      "sha256",
      "parsed",
      "name",
      "private",
      "license",
    ]) {
      assert.equal(value[field], null, `${label}.${field}`);
    }
    return;
  }
  integer(value.bytes, `${label}.bytes`);
  assert.ok(value.bytes > 0, label);
  assert.match(value.sha256, /^[a-f0-9]{64}$/u, label);
  assert.equal(typeof value.parsed, "boolean", label);
  nullableString(value.name, `${label}.name`);
  assert.ok(value.private === null || typeof value.private === "boolean", label);
  nullableString(value.license, `${label}.license`);
  if (!value.parsed) {
    assert.equal(value.name, null, label);
    assert.equal(value.private, null, label);
    assert.equal(value.license, null, label);
  }
}

function validateAssetInventory(value, label) {
  exactKeys(value, ["image", "audio", "font", "model", "video", "total"], label);
  for (const field of ["image", "audio", "font", "model", "video", "total"]) {
    integer(value[field], `${label}.${field}`);
  }
  assert.equal(
    value.total,
    value.image + value.audio + value.font + value.model + value.video,
    `${label}.total`,
  );
}

function validateRights(value, game, label) {
  exactKeys(
    value,
    [
      "codeGrantStatus",
      "contentRightsStatus",
      "titleTrademarkStatus",
      "ownerAuthorizationStatus",
      "sourceDeploymentBindingStatus",
      "redistributionStatus",
      "blockerCodes",
    ],
    label,
  );
  assert.ok(
    [
      "repository-grant-observed-review-required",
      "repository-grant-with-explicit-scope-exclusion",
      "package-license-declaration-only",
      "no-explicit-code-grant-observed",
    ].includes(value.codeGrantStatus),
    label,
  );
  assert.equal(
    value.contentRightsStatus,
    "not-cleared-by-repository-screen",
  );
  assert.equal(value.titleTrademarkStatus, "not-reviewed");
  assert.equal(value.ownerAuthorizationStatus, "not-recorded");
  assert.equal(value.sourceDeploymentBindingStatus, "not-proven");
  assert.equal(value.redistributionStatus, "blocked");
  stringArray(value.blockerCodes, `${label}.blockerCodes`, 16);
  for (const blocker of [
    "attribution-notices",
    "build-dependency-license",
    "content-asset-rights",
    "exact-source-build-deployment",
    "owner-authorization",
    "trademark-title",
  ]) {
    assert.ok(value.blockerCodes.includes(blocker), `${label} lacks ${blocker}`);
  }

  const rootGrant = game.rootLicenses.some(
    (license) => license.grantSignal === "mit-text-observed",
  );
  const scopeExclusion = game.rootLicenses.some(
    (license) => license.scopeExclusionSignal,
  );
  if (value.codeGrantStatus === "repository-grant-observed-review-required") {
    assert.equal(rootGrant, true, label);
    assert.equal(scopeExclusion, false, label);
  }
  if (
    value.codeGrantStatus
    === "repository-grant-with-explicit-scope-exclusion"
  ) {
    assert.equal(rootGrant, true, label);
    assert.equal(scopeExclusion, true, label);
    assert.ok(value.blockerCodes.includes("license-scope-closure"), label);
  }
  if (value.codeGrantStatus === "package-license-declaration-only") {
    assert.equal(rootGrant, false, label);
    assert.notEqual(game.packageManifest.license, null, label);
    assert.ok(value.blockerCodes.includes("code-license"), label);
    assert.ok(value.blockerCodes.includes("license-text"), label);
  }
  if (value.codeGrantStatus === "no-explicit-code-grant-observed") {
    assert.equal(rootGrant, false, label);
    assert.equal(game.packageManifest.license, null, label);
    assert.ok(value.blockerCodes.includes("code-license"), label);
  }
}

function validateGame(value, expected, index) {
  const label = `games[${index}]`;
  exactKeys(
    value,
    [
      "id",
      "title",
      "liveUrl",
      "repository",
      "repositoryUrl",
      "defaultBranch",
      "observedHeadCommit",
      "repositoryPublic",
      "repositoryArchived",
      "githubDetectedLicense",
      "licenseNoticePaths",
      "rootLicenses",
      "packageManifest",
      "assetInventory",
      "submodulePaths",
      "rights",
    ],
    label,
  );
  assert.deepEqual(
    {
      id: value.id,
      title: value.title,
      liveUrl: value.liveUrl,
      repository: value.repository,
    },
    expected,
    `${label} inventory identity changed`,
  );
  safeUrl(value.liveUrl, `${label}.liveUrl`);
  assert.equal(
    value.repositoryUrl,
    `https://github.com/Randroids-Dojo/${expected.repository}`,
  );
  safeUrl(value.repositoryUrl, `${label}.repositoryUrl`);
  assert.equal(value.defaultBranch, "main");
  assert.match(value.observedHeadCommit, /^[a-f0-9]{40}$/u, label);
  assert.equal(value.repositoryPublic, true);
  assert.equal(value.repositoryArchived, false);
  validateGithubLicense(
    value.githubDetectedLicense,
    `${label}.githubDetectedLicense`,
  );
  stringArray(value.licenseNoticePaths, `${label}.licenseNoticePaths`);
  value.licenseNoticePaths.forEach((path) =>
    safeRepositoryPath(path, `${label}.licenseNoticePaths`));
  assert.ok(Array.isArray(value.rootLicenses) && value.rootLicenses.length <= 16, label);
  value.rootLicenses.forEach((license, licenseIndex) =>
    validateRootLicense(license, `${label}.rootLicenses[${licenseIndex}]`));
  assert.deepEqual(
    value.rootLicenses.map((license) => license.path),
    value.licenseNoticePaths.filter((path) => !path.includes("/")),
    `${label} root license inventory changed`,
  );
  validatePackageManifest(value.packageManifest, `${label}.packageManifest`);
  validateAssetInventory(value.assetInventory, `${label}.assetInventory`);
  stringArray(value.submodulePaths, `${label}.submodulePaths`, 64);
  value.submodulePaths.forEach((path) =>
    safeRepositoryPath(path, `${label}.submodulePaths`));
  validateRights(value.rights, value, `${label}.rights`);
}

export function parseCanonicalFirstPartyRightsScreen(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= FIRST_PARTY_RIGHTS_MAX_BYTES,
    "first-party rights screen byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "first-party rights screen must be canonical JSON",
  );
  return value;
}

export function validateFirstPartyGameRightsScreen(value) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "observedAtUtc",
      "evidenceClass",
      "qualification",
      "policy",
      "scope",
      "games",
      "observationSha256",
      "summary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, FIRST_PARTY_RIGHTS_SCREEN_FORMAT);
  assert.equal(value.evidenceDate, FIRST_PARTY_RIGHTS_SCREEN_DATE);
  assert.ok(
    typeof value.observedAtUtc === "string"
      && value.observedAtUtc.startsWith(`${FIRST_PARTY_RIGHTS_SCREEN_DATE}T`)
      && !Number.isNaN(Date.parse(value.observedAtUtc)),
    "observedAtUtc is invalid",
  );
  assert.equal(
    value.evidenceClass,
    "public-repository-exact-head-rights-screen",
  );
  assert.equal(value.qualification, "zero-offline-redistribution-approvals");
  assert.deepEqual(value.policy, {
    decision: "fail-closed-per-title-review",
    organizationMembershipGrantsNoDistributionAuthority: true,
    publicSourceGrantsNoImplicitLicense: true,
    productionCatalogMutation: false,
    artifactDownloadOrInstallation: false,
  });
  assert.deepEqual(value.scope, {
    catalogSnapshotDate: "2026-07-19",
    organization: "Randroids-Dojo",
    firstPartyGameCount: FIRST_PARTY_GAMES.length,
    excludedCommunityGames: [
      "Asymptotic Bitrot",
      "Bone Cleaver",
      "Vibeman (Hangman)",
    ],
    observedMaterial:
      "public repository metadata, exact HEAD/tree identity, license/notice paths, root license bytes, root package metadata, asset-extension counts, and submodule paths",
  });
  assert.ok(Array.isArray(value.games), "games must be an array");
  assert.equal(value.games.length, FIRST_PARTY_GAMES.length);
  value.games.forEach((game, index) =>
    validateGame(game, FIRST_PARTY_GAMES[index], index));
  assert.match(value.observationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    value.observationSha256,
    firstPartyRightsObservationSha256(value.games),
    "observation digest does not bind the game records",
  );
  assert.deepEqual(
    value.summary,
    buildFirstPartyRightsSummary(value.games),
    "summary does not match the game records",
  );
  assert.equal(value.summary.ownerAuthorizationRecordedCount, 0);
  assert.equal(value.summary.redistributionApprovedCount, 0);
  assert.equal(value.summary.productionCatalogMutationCount, 0);
  assert.deepEqual(value.limitations, [...FIRST_PARTY_RIGHTS_LIMITATIONS]);
  return value;
}

export async function validateTrackedFirstPartyGameRightsScreen() {
  return validateFirstPartyGameRightsScreen(
    parseCanonicalFirstPartyRightsScreen(await readFile(artifactPath)),
  );
}

async function main() {
  const artifact = await validateTrackedFirstPartyGameRightsScreen();
  console.log(
    `validated first-party rights screen; games=${artifact.summary.gameCount}; grants=${artifact.summary.repositoryGrantObservedGameCount}; package-declarations=${artifact.summary.packageLicenseDeclarationOnlyGameCount}; approved=${artifact.summary.redistributionApprovedCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
