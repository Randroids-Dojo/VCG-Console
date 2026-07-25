import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FIRST_PARTY_GAMES } from "./generate-first-party-game-rights-screen.mjs";
import {
  buildGameServiceSummary,
  buildServiceSignals,
  COMMUNITY_GAMES,
  GAME_SERVICE_SCREEN_DATE,
  GAME_SERVICE_SCREEN_FORMAT,
  GAME_SERVICE_SCREEN_LIMITATIONS,
  gameServiceObservationSha256,
} from "./generate-game-service-dependency-screen.mjs";
import { validateTrackedFirstPartyGameRightsScreen } from "./validate-first-party-game-rights-screen.mjs";
import { validateTrackedRemoteGameOfflineEvidence } from "./validate-remote-game-offline-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "compliance/game-services/game-service-dependency-screen-v2.json",
);
export const GAME_SERVICE_SCREEN_MAX_BYTES = 512 * 1024;
const references = await Promise.all([
  validateTrackedFirstPartyGameRightsScreen(),
  validateTrackedRemoteGameOfflineEvidence(),
]);
const [rightsReference, offlineReference] = references;
const rightsById = new Map(rightsReference.games.map((game) => [game.id, game]));
const offlineById = new Map(
  offlineReference.games.map((game) => [game.id, game]),
);
const expectedGames = [
  ...FIRST_PARTY_GAMES.map(({ id, title, liveUrl, repository }) => ({
    id,
    title,
    liveUrl,
    repository,
    catalogClass: "first-party",
  })),
  ...COMMUNITY_GAMES.map(({ id, title, liveUrl }) => ({
    id,
    title,
    liveUrl,
    repository: null,
    catalogClass: "promoted-community",
  })),
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value), expected, `${label} has unknown or missing fields`);
}

function integer(value, label, nullable = false) {
  if (nullable && value === null) return;
  assert.ok(Number.isSafeInteger(value) && value >= 0, label);
}

function nullableString(value, label, maximum = 2048) {
  assert.ok(
    value === null
      || (typeof value === "string"
        && value.length <= maximum
        && !/[\u0000-\u001f\u007f]/u.test(value)),
    label,
  );
}

function stringArray(
  value,
  label,
  { maximumItems = 512, maximumLength = 2048 } = {},
) {
  assert.ok(Array.isArray(value) && value.length <= maximumItems, label);
  for (const item of value) {
    assert.ok(
      typeof item === "string"
        && item.length <= maximumLength
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

function safeUrl(
  value,
  label,
  { nullable = false, originOnly = false, allowHttp = false } = {},
) {
  if (nullable && value === null) return;
  assert.equal(typeof value, "string", label);
  const url = new URL(value);
  assert.ok(
    url.protocol === "https:" || (allowHttp && url.protocol === "http:"),
    label,
  );
  assert.equal(url.username, "", label);
  assert.equal(url.password, "", label);
  assert.equal(url.search, "", label);
  assert.equal(url.hash, "", label);
  if (originOnly) assert.equal(value, url.origin, label);
}

function safePath(value, label) {
  assert.ok(
    typeof value === "string"
      && value.length > 0
      && value.length <= 2048
      && !value.startsWith("/")
      && !value.includes("\\")
      && !value.split("/").some((segment) => segment === "" || segment === "..")
      && !/[\u0000-\u001f\u007f]/u.test(value),
    label,
  );
}

function validateDependency(value, label) {
  exactKeys(value, ["name", "specifications"], label);
  assert.ok(
    typeof value.name === "string"
      && value.name.length > 0
      && value.name.length <= 256
      && /^[A-Za-z0-9@][A-Za-z0-9@._/-]*$/u.test(value.name),
    label,
  );
  stringArray(value.specifications, `${label}.specifications`, {
    maximumItems: 32,
    maximumLength: 256,
  });
  assert.ok(
    value.specifications.every(
      (specification) =>
        !/(password|secret|token)=/iu.test(specification)
        && !/https?:\/\/[^/]*@/iu.test(specification),
    ),
    `${label} contains credential-shaped package metadata`,
  );
}

function validateSource(value, expected, label) {
  exactKeys(
    value,
    [
      "status",
      "repository",
      "repositoryUrl",
      "commit",
      "archiveUrl",
      "archiveBytes",
      "archiveSha256",
      "sourceFileCount",
      "screenedTextFileCount",
      "skippedOversizeTextFileCount",
      "unreadableTextFileCount",
      "packageManifestPaths",
      "runtimeDependencies",
      "environmentVariableNames",
      "apiRoutePaths",
      "sourceLiteralOrigins",
      "submodulePaths",
    ],
    label,
  );
  assert.ok(
    [
      "exact-public-source-screened",
      "no-first-party-repository-link",
    ].includes(value.status),
    label,
  );
  if (expected.catalogClass === "promoted-community") {
    assert.equal(value.status, "no-first-party-repository-link", label);
    for (const field of [
      "repository",
      "repositoryUrl",
      "commit",
      "archiveUrl",
      "archiveBytes",
      "archiveSha256",
      "sourceFileCount",
      "screenedTextFileCount",
      "skippedOversizeTextFileCount",
      "unreadableTextFileCount",
    ]) {
      assert.equal(value[field], null, `${label}.${field}`);
    }
    for (const field of [
      "packageManifestPaths",
      "runtimeDependencies",
      "environmentVariableNames",
      "apiRoutePaths",
      "sourceLiteralOrigins",
      "submodulePaths",
    ]) {
      assert.deepEqual(value[field], [], `${label}.${field}`);
    }
    return;
  }

  const rights = rightsById.get(expected.id);
  assert.ok(rights, `${label} lacks rights reference`);
  assert.equal(value.status, "exact-public-source-screened", label);
  assert.equal(value.repository, expected.repository, label);
  assert.equal(
    value.repositoryUrl,
    `https://github.com/Randroids-Dojo/${expected.repository}`,
  );
  safeUrl(value.repositoryUrl, `${label}.repositoryUrl`);
  assert.equal(value.commit, rights.observedHeadCommit, label);
  assert.match(value.commit, /^[a-f0-9]{40}$/u, label);
  assert.equal(
    value.archiveUrl,
    `https://codeload.github.com/Randroids-Dojo/${expected.repository}/zip/${value.commit}`,
  );
  safeUrl(value.archiveUrl, `${label}.archiveUrl`);
  integer(value.archiveBytes, `${label}.archiveBytes`);
  assert.ok(value.archiveBytes > 0 && value.archiveBytes <= 192 * 1024 * 1024, label);
  assert.match(value.archiveSha256, /^[a-f0-9]{64}$/u, label);
  for (const field of [
    "sourceFileCount",
    "screenedTextFileCount",
    "skippedOversizeTextFileCount",
    "unreadableTextFileCount",
  ]) {
    integer(value[field], `${label}.${field}`);
  }
  assert.ok(value.sourceFileCount <= 20_000, label);
  assert.ok(value.screenedTextFileCount <= value.sourceFileCount, label);
  for (const field of [
    "packageManifestPaths",
    "apiRoutePaths",
    "submodulePaths",
  ]) {
    stringArray(value[field], `${label}.${field}`);
    value[field].forEach((path) => safePath(path, `${label}.${field}`));
  }
  assert.ok(
    Array.isArray(value.runtimeDependencies)
      && value.runtimeDependencies.length <= 512,
    label,
  );
  value.runtimeDependencies.forEach((dependency, index) =>
    validateDependency(dependency, `${label}.runtimeDependencies[${index}]`));
  assert.deepEqual(
    value.runtimeDependencies.map((dependency) => dependency.name),
    value.runtimeDependencies
      .map((dependency) => dependency.name)
      .sort((left, right) => left.localeCompare(right)),
    `${label}.runtimeDependencies must be sorted`,
  );
  stringArray(
    value.environmentVariableNames,
    `${label}.environmentVariableNames`,
  );
  value.environmentVariableNames.forEach((name) =>
    assert.match(name, /^[A-Z][A-Z0-9_]*$/u, `${label}.environmentVariableNames`));
  stringArray(value.sourceLiteralOrigins, `${label}.sourceLiteralOrigins`);
  value.sourceLiteralOrigins.forEach((origin) =>
    safeUrl(origin, `${label}.sourceLiteralOrigins`, {
      originOnly: true,
      allowHttp: true,
    }));
  assert.deepEqual(value.submodulePaths, rights.submodulePaths, label);
}

function expectedBrowser(id) {
  const game = offlineById.get(id);
  assert.ok(game, `browser reference missing for ${id}`);
  return {
    finalOnlineUrl: game.finalOnlineUrl,
    observedOrigins: [...game.online.origins],
    observedThirdPartyOrigins: [...game.online.thirdPartyOrigins],
    mutatingRequestCount: game.online.mutatingRequestCount,
    localStorageKeyCount:
      game.browserState.afterServiceWorkerUpdate.localStorageKeys.length,
    cacheStorageNameCount:
      game.browserState.afterServiceWorkerUpdate.cacheNames.length,
    indexedDbNameCount:
      game.browserState.afterServiceWorkerUpdate.indexedDbNames.length,
  };
}

function validateBrowser(value, expected, label) {
  exactKeys(
    value,
    [
      "finalOnlineUrl",
      "observedOrigins",
      "observedThirdPartyOrigins",
      "mutatingRequestCount",
      "localStorageKeyCount",
      "cacheStorageNameCount",
      "indexedDbNameCount",
    ],
    label,
  );
  safeUrl(value.finalOnlineUrl, `${label}.finalOnlineUrl`);
  for (const field of ["observedOrigins", "observedThirdPartyOrigins"]) {
    stringArray(value[field], `${label}.${field}`);
    value[field].forEach((origin) =>
      safeUrl(origin, `${label}.${field}`, { originOnly: true }));
  }
  for (const field of [
    "mutatingRequestCount",
    "localStorageKeyCount",
    "cacheStorageNameCount",
    "indexedDbNameCount",
  ]) {
    integer(value[field], `${label}.${field}`);
  }
  assert.deepEqual(value, expected, `${label} drifted from browser evidence`);
}

function validateServiceSignals(value, game, label) {
  exactKeys(
    value,
    [
      "auth",
      "database",
      "ai",
      "analytics",
      "notifications",
      "payments",
      "externalNetwork",
    ],
    label,
  );
  for (const field of Object.keys(value)) {
    stringArray(value[field], `${label}.${field}`);
    assert.ok(
      value[field].every((signal) =>
        /^(dependency|environment|origin):[^\u0000-\u001f\u007f]+$/u.test(
          signal,
        )),
      `${label}.${field}`,
    );
  }
  const ownOrigin = new URL(game.liveUrl).origin;
  const externalOrigins = sortedUniqueForValidation(
    [
      ...game.source.sourceLiteralOrigins,
      ...game.browser.observedThirdPartyOrigins,
    ].filter((origin) => origin !== ownOrigin),
  );
  assert.deepEqual(
    value,
    buildServiceSignals(
      game.source.runtimeDependencies,
      game.source.environmentVariableNames,
      externalOrigins,
    ),
    `${label} does not match source/browser signals`,
  );
}

function sortedUniqueForValidation(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function validateGame(value, expected, index) {
  const label = `games[${index}]`;
  exactKeys(
    value,
    [
      "id",
      "title",
      "catalogClass",
      "liveUrl",
      "source",
      "browser",
      "serviceSignals",
      "consoleNetworkRecommendation",
      "degradationStatus",
      "offlineQualification",
    ],
    label,
  );
  assert.deepEqual(
    {
      id: value.id,
      title: value.title,
      catalogClass: value.catalogClass,
      liveUrl: value.liveUrl,
    },
    {
      id: expected.id,
      title: expected.title,
      catalogClass: expected.catalogClass,
      liveUrl: expected.liveUrl,
    },
    `${label} inventory identity changed`,
  );
  safeUrl(value.liveUrl, `${label}.liveUrl`);
  validateSource(value.source, expected, `${label}.source`);
  validateBrowser(value.browser, expectedBrowser(expected.id), `${label}.browser`);
  validateServiceSignals(value.serviceSignals, value, `${label}.serviceSignals`);
  assert.equal(
    value.consoleNetworkRecommendation,
    "required-pending-per-title-review",
  );
  assert.equal(value.degradationStatus, "unverified-source-signal-only");
  assert.equal(value.offlineQualification, "none");
}

export function parseCanonicalGameServiceScreen(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= GAME_SERVICE_SCREEN_MAX_BYTES,
    "game service screen byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "game service screen must be canonical JSON",
  );
  return value;
}

export function validateGameServiceDependencyScreen(value) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "observedAtUtc",
      "evidenceClass",
      "qualification",
      "policy",
      "provenance",
      "scope",
      "games",
      "observationSha256",
      "summary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, GAME_SERVICE_SCREEN_FORMAT);
  assert.equal(value.evidenceDate, GAME_SERVICE_SCREEN_DATE);
  const observedAt = new Date(value.observedAtUtc);
  assert.ok(
    typeof value.observedAtUtc === "string"
      && !Number.isNaN(observedAt.getTime())
      && observedAt.toISOString() === value.observedAtUtc,
    "observedAtUtc is invalid",
  );
  assert.equal(
    value.evidenceClass,
    "exact-source-and-fresh-browser-service-signal-screen",
  );
  assert.equal(
    value.qualification,
    "zero-verified-degradation-or-offline-claims",
  );
  assert.deepEqual(value.policy, {
    signalsGrantNoRuntimeAuthority: true,
    signalsGrantNoDataCollectionAuthority: true,
    signalsGrantNoOfflineClaim: true,
    productionCatalogMutation: false,
  });
  assert.deepEqual(value.provenance, {
    firstPartyRightsFormat: rightsReference.format,
    firstPartyRightsObservationSha256: rightsReference.observationSha256,
    remoteOfflineFormat: offlineReference.format,
    remoteOfflineObservationSha256: offlineReference.observationSha256,
  });
  assert.deepEqual(value.scope, {
    catalogSnapshotDate: "2026-07-19",
    gameCount: 26,
    sourceArchiveMaximumBytes: 192 * 1024 * 1024,
    textFileMaximumBytes: 512 * 1024,
    sourceFileMaximumCount: 20_000,
    signalMaximumItems: 512,
    storedData:
      "public package names/specifications, environment-variable names, API route paths, origin names, source archive identity/counts, and prior privacy-bounded browser counts only",
    excludedFromTextScan:
      "AGENTS.md; hidden/tooling, documentation, test, build, dependency, and vendor directories; symlinks; unsupported extensions; and text files larger than the declared bound",
  });
  assert.ok(Array.isArray(value.games), "games must be an array");
  assert.equal(value.games.length, expectedGames.length);
  value.games.forEach((game, index) =>
    validateGame(game, expectedGames[index], index));
  assert.match(value.observationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    value.observationSha256,
    gameServiceObservationSha256(value.games),
    "observation digest does not bind the game records",
  );
  assert.deepEqual(
    value.summary,
    buildGameServiceSummary(value.games),
    "summary does not match the game records",
  );
  assert.equal(value.summary.verifiedDegradationGameCount, 0);
  assert.equal(value.summary.offlineQualifiedGameCount, 0);
  assert.equal(value.summary.productionCatalogMutationCount, 0);
  assert.deepEqual(value.limitations, [...GAME_SERVICE_SCREEN_LIMITATIONS]);
  return value;
}

export async function validateTrackedGameServiceDependencyScreen() {
  return validateGameServiceDependencyScreen(
    parseCanonicalGameServiceScreen(await readFile(artifactPath)),
  );
}

async function main() {
  const artifact = await validateTrackedGameServiceDependencyScreen();
  console.log(
    `validated game service screen; games=${artifact.summary.gameCount}; source-screened=${artifact.summary.exactSourceScreenedCount}; degradation-verified=${artifact.summary.verifiedDegradationGameCount}; offline-qualified=${artifact.summary.offlineQualifiedGameCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
