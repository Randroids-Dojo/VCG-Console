import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRemoteGameOfflineSummary,
  REMOTE_GAME_OFFLINE_EVIDENCE_DATE,
  REMOTE_GAME_OFFLINE_EVIDENCE_FORMAT,
  REMOTE_GAME_OFFLINE_LIMITATIONS,
  REMOTE_GAMES,
  remoteGameObservationSha256,
} from "./generate-remote-game-offline-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "compliance/hosted-game-offline/remote-game-offline-observation-v1.json",
);
export const REMOTE_GAME_OFFLINE_MAX_BYTES = 1024 * 1024;

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value), expected, `${label} has unknown or missing fields`);
}

function integer(value, label, minimum = 0) {
  assert.ok(Number.isSafeInteger(value) && value >= minimum, label);
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

function stringArray(value, label, { maximumItems = 256, maximumLength = 256 } = {}) {
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

function safeUrl(value, label, { nullable = false, originOnly = false } = {}) {
  if (nullable && value === null) return;
  assert.equal(typeof value, "string", label);
  const url = new URL(value);
  assert.ok(["http:", "https:"].includes(url.protocol), label);
  assert.equal(url.username, "", label);
  assert.equal(url.password, "", label);
  assert.equal(url.search, "", label);
  assert.equal(url.hash, "", label);
  if (originOnly) assert.equal(value, url.origin, label);
}

function countMap(value, label, keyPattern) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
  const keys = Object.keys(value);
  assert.deepEqual(keys, [...keys].sort((left, right) => left.localeCompare(right)), label);
  for (const [key, count] of Object.entries(value)) {
    assert.match(key, keyPattern, label);
    integer(count, label);
  }
}

function validateLoad(value, label) {
  exactKeys(value, ["outcome", "error"], label);
  assert.ok(["loaded", "failed"].includes(value.outcome), label);
  if (value.outcome === "loaded") {
    assert.equal(value.error, null, label);
  } else {
    assert.ok(
      typeof value.error === "string"
        && (/^net::ERR_[A-Z0-9_]+$/u.test(value.error)
          || ["timeout", "navigation-error"].includes(value.error)),
      label,
    );
  }
}

function validateRegistration(value, label) {
  exactKeys(value, ["scope", "active", "waiting", "installing"], label);
  safeUrl(value.scope, `${label}.scope`, { nullable: true });
  safeUrl(value.active, `${label}.active`, { nullable: true });
  safeUrl(value.waiting, `${label}.waiting`, { nullable: true });
  safeUrl(value.installing, `${label}.installing`, { nullable: true });
}

function validateBrowserState(value, label) {
  exactKeys(
    value,
    [
      "documentAccessible",
      "readyState",
      "title",
      "manifestLinks",
      "serviceWorkerSupported",
      "serviceWorkerController",
      "registrations",
      "localStorageKeys",
      "sessionStorageKeys",
      "cacheNames",
      "indexedDbNames",
      "bodyTextLength",
    ],
    label,
  );
  assert.equal(typeof value.documentAccessible, "boolean", label);
  assert.ok(
    value.readyState === null
      || ["loading", "interactive", "complete"].includes(value.readyState),
    label,
  );
  nullableString(value.title, `${label}.title`);
  stringArray(value.manifestLinks, `${label}.manifestLinks`, {
    maximumItems: 8,
    maximumLength: 2048,
  });
  for (const url of value.manifestLinks) safeUrl(url, `${label}.manifestLinks`);
  assert.equal(typeof value.serviceWorkerSupported, "boolean", label);
  safeUrl(value.serviceWorkerController, `${label}.serviceWorkerController`, {
    nullable: true,
  });
  assert.ok(Array.isArray(value.registrations) && value.registrations.length <= 16, label);
  value.registrations.forEach((registration, index) =>
    validateRegistration(registration, `${label}.registrations[${index}]`));
  assert.deepEqual(
    value.registrations,
    [...value.registrations].sort((left, right) =>
      String(left.scope).localeCompare(String(right.scope))),
    `${label}.registrations must be sorted`,
  );
  for (const field of [
    "localStorageKeys",
    "sessionStorageKeys",
    "cacheNames",
    "indexedDbNames",
  ]) {
    stringArray(value[field], `${label}.${field}`);
  }
  assert.ok(
    value.bodyTextLength === null
      || (Number.isSafeInteger(value.bodyTextLength) && value.bodyTextLength >= 0),
    label,
  );
  if (!value.documentAccessible) {
    assert.equal(value.readyState, null, label);
    assert.equal(value.title, null, label);
    assert.equal(value.bodyTextLength, null, label);
  }
}

function validateManifestFields(value, label) {
  if (value === null) return;
  exactKeys(
    value,
    ["name", "shortName", "startUrl", "scope", "display", "iconCount"],
    label,
  );
  for (const field of ["name", "shortName", "startUrl", "scope", "display"]) {
    nullableString(value[field], `${label}.${field}`);
  }
  integer(value.iconCount, `${label}.iconCount`);
}

function validateServiceWorkerFeatures(value, label) {
  if (value === null) return;
  exactKeys(
    value,
    ["install", "activate", "fetch", "push", "notificationClick"],
    label,
  );
  for (const field of ["install", "activate", "fetch", "push", "notificationClick"]) {
    assert.equal(typeof value[field], "boolean", `${label}.${field}`);
  }
}

function validateProbe(value, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
  if (value.outcome === "response") {
    exactKeys(
      value,
      [
        "url",
        "finalUrl",
        "outcome",
        "status",
        "contentType",
        "bodyBytes",
        "bodyTruncated",
        "sha256",
        "classification",
        "manifest",
        "serviceWorkerFeatures",
      ],
      label,
    );
    safeUrl(value.url, `${label}.url`);
    safeUrl(value.finalUrl, `${label}.finalUrl`);
    integer(value.status, `${label}.status`, 100);
    assert.ok(value.status <= 599, label);
    nullableString(value.contentType, `${label}.contentType`);
    integer(value.bodyBytes, `${label}.bodyBytes`);
    assert.equal(typeof value.bodyTruncated, "boolean", label);
    assert.match(value.sha256, /^[a-f0-9]{64}$/u, label);
    assert.ok(
      [
        "not-found",
        "html-fallback",
        "web-manifest",
        "javascript",
        "other",
      ].includes(value.classification),
      label,
    );
    validateManifestFields(value.manifest, `${label}.manifest`);
    validateServiceWorkerFeatures(
      value.serviceWorkerFeatures,
      `${label}.serviceWorkerFeatures`,
    );
    if (value.classification === "web-manifest") {
      assert.notEqual(value.manifest, null, label);
    } else {
      assert.equal(value.manifest, null, label);
    }
    if (value.classification === "javascript") {
      assert.notEqual(value.serviceWorkerFeatures, null, label);
    } else {
      assert.equal(value.serviceWorkerFeatures, null, label);
    }
    if (value.classification === "not-found") {
      assert.ok([404, 410].includes(value.status), label);
    }
    return;
  }
  exactKeys(
    value,
    [
      "url",
      "finalUrl",
      "outcome",
      "status",
      "contentType",
      "bodyBytes",
      "bodyTruncated",
      "sha256",
      "classification",
      "manifest",
      "serviceWorkerFeatures",
      "error",
    ],
    label,
  );
  assert.equal(value.outcome, "request-error", label);
  safeUrl(value.url, `${label}.url`);
  for (const field of [
    "finalUrl",
    "status",
    "contentType",
    "bodyBytes",
    "bodyTruncated",
    "sha256",
    "manifest",
    "serviceWorkerFeatures",
  ]) {
    assert.equal(value[field], null, `${label}.${field}`);
  }
  assert.equal(value.classification, "unavailable", label);
  assert.ok(
    /^net::ERR_[A-Z0-9_]+$/u.test(value.error)
      || ["timeout", "navigation-error"].includes(value.error),
    label,
  );
}

function validateGame(value, expected, index) {
  const label = `games[${index}]`;
  exactKeys(
    value,
    [
      "id",
      "title",
      "entrypoint",
      "finalOnlineUrl",
      "online",
      "browserState",
      "manifest",
      "serviceWorker",
      "offlineReload",
    ],
    label,
  );
  assert.deepEqual(
    { id: value.id, title: value.title, entrypoint: value.entrypoint },
    expected,
    `${label} inventory identity changed`,
  );
  safeUrl(value.entrypoint, `${label}.entrypoint`);
  safeUrl(value.finalOnlineUrl, `${label}.finalOnlineUrl`);

  exactKeys(
    value.online,
    [
      "firstLoad",
      "secondLoad",
      "requestCount",
      "responseCount",
      "requestFailureCount",
      "consoleErrorCount",
      "pageErrorCount",
      "requestMethods",
      "responseStatuses",
      "origins",
      "thirdPartyOrigins",
      "mutatingRequestCount",
    ],
    `${label}.online`,
  );
  validateLoad(value.online.firstLoad, `${label}.online.firstLoad`);
  validateLoad(value.online.secondLoad, `${label}.online.secondLoad`);
  for (const field of [
    "requestCount",
    "responseCount",
    "requestFailureCount",
    "consoleErrorCount",
    "pageErrorCount",
    "mutatingRequestCount",
  ]) {
    integer(value.online[field], `${label}.online.${field}`);
  }
  assert.ok(value.online.responseCount <= value.online.requestCount, label);
  assert.ok(value.online.mutatingRequestCount <= value.online.requestCount, label);
  countMap(value.online.requestMethods, `${label}.online.requestMethods`, /^[A-Z]+$/u);
  countMap(value.online.responseStatuses, `${label}.online.responseStatuses`, /^[1-5][0-9]{2}$/u);
  for (const field of ["origins", "thirdPartyOrigins"]) {
    stringArray(value.online[field], `${label}.online.${field}`, {
      maximumItems: 128,
      maximumLength: 2048,
    });
    value.online[field].forEach((origin) =>
      safeUrl(origin, `${label}.online.${field}`, { originOnly: true }));
  }
  assert.ok(
    value.online.thirdPartyOrigins.every((origin) =>
      value.online.origins.includes(origin)),
    label,
  );

  exactKeys(
    value.browserState,
    [
      "firstLoad",
      "beforeServiceWorkerUpdate",
      "afterServiceWorkerUpdate",
      "cookieNames",
    ],
    `${label}.browserState`,
  );
  validateBrowserState(value.browserState.firstLoad, `${label}.browserState.firstLoad`);
  validateBrowserState(
    value.browserState.beforeServiceWorkerUpdate,
    `${label}.browserState.beforeServiceWorkerUpdate`,
  );
  validateBrowserState(
    value.browserState.afterServiceWorkerUpdate,
    `${label}.browserState.afterServiceWorkerUpdate`,
  );
  stringArray(value.browserState.cookieNames, `${label}.browserState.cookieNames`);

  exactKeys(value.manifest, ["cdp", "probes"], `${label}.manifest`);
  exactKeys(
    value.manifest.cdp,
    ["available", "manifestUrl", "manifestErrorCount", "installabilityErrorIds"],
    `${label}.manifest.cdp`,
  );
  assert.equal(typeof value.manifest.cdp.available, "boolean", label);
  safeUrl(value.manifest.cdp.manifestUrl, `${label}.manifest.cdp.manifestUrl`, {
    nullable: true,
  });
  assert.ok(
    value.manifest.cdp.manifestErrorCount === null
      || (Number.isSafeInteger(value.manifest.cdp.manifestErrorCount)
        && value.manifest.cdp.manifestErrorCount >= 0),
    label,
  );
  stringArray(
    value.manifest.cdp.installabilityErrorIds,
    `${label}.manifest.cdp.installabilityErrorIds`,
  );
  assert.ok(Array.isArray(value.manifest.probes) && value.manifest.probes.length <= 8, label);
  value.manifest.probes.forEach((probe, probeIndex) =>
    validateProbe(probe, `${label}.manifest.probes[${probeIndex}]`));

  exactKeys(value.serviceWorker, ["update", "probes"], `${label}.serviceWorker`);
  exactKeys(
    value.serviceWorker.update,
    ["attempted", "succeeded", "failed"],
    `${label}.serviceWorker.update`,
  );
  for (const field of ["attempted", "succeeded", "failed"]) {
    integer(value.serviceWorker.update[field], `${label}.serviceWorker.update.${field}`);
  }
  assert.equal(
    value.serviceWorker.update.succeeded + value.serviceWorker.update.failed,
    value.serviceWorker.update.attempted,
    `${label}.serviceWorker.update totals`,
  );
  assert.ok(
    Array.isArray(value.serviceWorker.probes)
      && value.serviceWorker.probes.length <= 8,
    label,
  );
  value.serviceWorker.probes.forEach((probe, probeIndex) =>
    validateProbe(probe, `${label}.serviceWorker.probes[${probeIndex}]`));

  exactKeys(value.offlineReload, ["outcome", "error", "state"], `${label}.offlineReload`);
  validateLoad(
    { outcome: value.offlineReload.outcome, error: value.offlineReload.error },
    `${label}.offlineReload`,
  );
  validateBrowserState(value.offlineReload.state, `${label}.offlineReload.state`);
  if (value.offlineReload.outcome === "loaded") {
    assert.equal(value.offlineReload.state.documentAccessible, true, label);
  }
}

export function parseCanonicalRemoteGameOfflineEvidence(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= REMOTE_GAME_OFFLINE_MAX_BYTES,
    "remote game offline evidence byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "remote game offline evidence must be canonical JSON",
  );
  return value;
}

export function validateRemoteGameOfflineEvidence(value) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "observedAtUtc",
      "evidenceClass",
      "qualification",
      "environment",
      "scope",
      "games",
      "observationSha256",
      "summary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, REMOTE_GAME_OFFLINE_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, REMOTE_GAME_OFFLINE_EVIDENCE_DATE);
  assert.ok(
    typeof value.observedAtUtc === "string"
      && !Number.isNaN(Date.parse(value.observedAtUtc)),
    "observedAtUtc is invalid",
  );
  assert.equal(value.evidenceClass, "fresh-profile-live-browser-observation");
  assert.equal(
    value.qualification,
    "observation-only-no-offline-package-qualified",
  );

  exactKeys(
    value.environment,
    [
      "platform",
      "architecture",
      "nodeVersion",
      "browserProduct",
      "browserVersion",
      "headless",
      "viewport",
      "onlineNavigationTimeoutMs",
      "offlineNavigationTimeoutMs",
      "settleMs",
    ],
    "environment",
  );
  assert.equal(value.environment.platform, "win32");
  assert.equal(value.environment.architecture, "x64");
  assert.match(value.environment.nodeVersion, /^v[0-9]+\.[0-9]+\.[0-9]+$/u);
  assert.equal(value.environment.browserProduct, "Google Chrome");
  assert.match(value.environment.browserVersion, /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/u);
  assert.equal(value.environment.headless, true);
  exactKeys(
    value.environment.viewport,
    ["width", "height", "deviceScaleFactor"],
    "environment.viewport",
  );
  assert.deepEqual(value.environment.viewport, {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
  });
  assert.equal(value.environment.onlineNavigationTimeoutMs, 30_000);
  assert.equal(value.environment.offlineNavigationTimeoutMs, 15_000);
  assert.equal(value.environment.settleMs, 1_500);

  exactKeys(
    value.scope,
    [
      "catalogSnapshotDate",
      "expectedGameCount",
      "lifecycle",
      "interactionPolicy",
      "storedDataPolicy",
    ],
    "scope",
  );
  assert.deepEqual(value.scope, {
    catalogSnapshotDate: "2026-07-19",
    expectedGameCount: REMOTE_GAMES.length,
    lifecycle:
      "fresh profile, online navigation, online reload, service-worker update request, endpoint GET probes, offline reload",
    interactionPolicy:
      "navigation-and-browser-lifecycle-only; no play, login, consent, permission, purchase, or form interaction",
    storedDataPolicy:
      "metadata, counts, origins, storage names, status, MIME, size, and SHA-256 only; no values, request paths, query strings, bodies, messages, or identifiers",
  });

  assert.ok(Array.isArray(value.games), "games must be an array");
  assert.equal(value.games.length, REMOTE_GAMES.length);
  value.games.forEach((game, index) =>
    validateGame(game, REMOTE_GAMES[index], index));
  assert.match(value.observationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    value.observationSha256,
    remoteGameObservationSha256(value.games),
    "observation digest does not bind the game records",
  );
  assert.deepEqual(
    value.summary,
    buildRemoteGameOfflineSummary(value.games),
    "summary does not match the observations",
  );
  assert.equal(value.summary.offlinePackageQualifiedCount, 0);
  assert.deepEqual(value.limitations, [...REMOTE_GAME_OFFLINE_LIMITATIONS]);
  return value;
}

export async function validateTrackedRemoteGameOfflineEvidence() {
  const bytes = await readFile(artifactPath);
  return validateRemoteGameOfflineEvidence(
    parseCanonicalRemoteGameOfflineEvidence(bytes),
  );
}

async function main() {
  const artifact = await validateTrackedRemoteGameOfflineEvidence();
  console.log(
    `validated remote game offline evidence; games=${artifact.summary.gameCount}; offline-loaded=${artifact.summary.offlineReloadLoadedCount}; qualified=${artifact.summary.offlinePackageQualifiedCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
