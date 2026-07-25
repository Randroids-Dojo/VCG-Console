import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRemoteGameInputFindings,
  buildRemoteGameInputSummary,
  INTERESTING_EVENTS,
  REMOTE_GAME_INPUT_EVIDENCE_DATE,
  REMOTE_GAME_INPUT_EVIDENCE_FORMAT,
  REMOTE_GAME_INPUT_LIMITATIONS,
  remoteGameInputObservationSha256,
} from "./generate-remote-game-input-surface-evidence.mjs";
import { validateTrackedRemoteGameOfflineEvidence } from "./validate-remote-game-offline-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "compliance/game-input/remote-game-input-surface-observation-v2.json",
);
export const REMOTE_GAME_INPUT_MAX_BYTES = 256 * 1024;
const offlineReference = await validateTrackedRemoteGameOfflineEvidence();

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value), expected, `${label} has unknown or missing fields`);
}

function integer(value, label) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, label);
}

function safeUrl(value, label) {
  const url = new URL(value);
  assert.ok(["http:", "https:"].includes(url.protocol), label);
  assert.equal(url.username, "", label);
  assert.equal(url.password, "", label);
  assert.equal(url.search, "", label);
  assert.equal(url.hash, "", label);
}

function validateNavigation(value, label) {
  exactKeys(value, ["outcome", "error"], label);
  assert.ok(["loaded", "failed"].includes(value.outcome), label);
  if (value.outcome === "loaded") {
    assert.equal(value.error, null, label);
  } else {
    assert.ok(
      /^net::ERR_[A-Z0-9_]+$/u.test(value.error)
        || ["timeout", "navigation-error"].includes(value.error),
      label,
    );
  }
}

function validateRuntime(value, label) {
  exactKeys(
    value,
    [
      "accessible",
      "title",
      "readyState",
      "listenerAdds",
      "handlerProperties",
      "gamepad",
      "requests",
      "dom",
    ],
    label,
  );
  assert.equal(typeof value.accessible, "boolean", label);
  assert.ok(
    value.title === null
      || (typeof value.title === "string"
        && value.title.length <= 256
        && !/[\u0000-\u001f\u007f]/u.test(value.title)),
    label,
  );
  assert.ok(
    value.readyState === null
      || ["loading", "interactive", "complete"].includes(value.readyState),
    label,
  );
  exactKeys(value.listenerAdds, [...INTERESTING_EVENTS], `${label}.listenerAdds`);
  for (const count of Object.values(value.listenerAdds)) {
    integer(count, `${label}.listenerAdds`);
  }
  exactKeys(
    value.handlerProperties,
    [
      "onkeydown",
      "onkeypress",
      "onkeyup",
      "onmousedown",
      "onmousemove",
      "onmouseup",
      "onpointerdown",
      "onpointermove",
      "onpointerup",
      "ontouchend",
      "ontouchmove",
      "ontouchstart",
    ],
    `${label}.handlerProperties`,
  );
  for (const present of Object.values(value.handlerProperties)) {
    assert.equal(typeof present, "boolean", `${label}.handlerProperties`);
  }
  exactKeys(
    value.gamepad,
    ["originalApiAvailable", "instrumented", "pollCount"],
    `${label}.gamepad`,
  );
  assert.equal(typeof value.gamepad.originalApiAvailable, "boolean", label);
  assert.equal(typeof value.gamepad.instrumented, "boolean", label);
  integer(value.gamepad.pollCount, `${label}.gamepad.pollCount`);
  exactKeys(value.requests, ["pointerLock", "fullscreen"], `${label}.requests`);
  integer(value.requests.pointerLock, `${label}.requests.pointerLock`);
  integer(value.requests.fullscreen, `${label}.requests.fullscreen`);
  exactKeys(
    value.dom,
    [
      "canvas",
      "button",
      "anchor",
      "input",
      "select",
      "textarea",
      "contentEditable",
      "focusable",
    ],
    `${label}.dom`,
  );
  for (const count of Object.values(value.dom)) integer(count, `${label}.dom`);
  if (!value.accessible) {
    assert.equal(value.title, null, label);
    assert.equal(value.readyState, null, label);
  }
}

function validateGame(value, expected, index) {
  const label = `games[${index}]`;
  exactKeys(
    value,
    [
      "id",
      "title",
      "entrypoint",
      "finalUrl",
      "navigation",
      "observation",
      "findings",
    ],
    label,
  );
  assert.deepEqual(
    {
      id: value.id,
      title: value.title,
      entrypoint: value.entrypoint,
    },
    {
      id: expected.id,
      title: expected.title,
      entrypoint: expected.entrypoint,
    },
    `${label} inventory identity changed`,
  );
  safeUrl(value.entrypoint, `${label}.entrypoint`);
  safeUrl(value.finalUrl, `${label}.finalUrl`);
  validateNavigation(value.navigation, `${label}.navigation`);
  exactKeys(
    value.observation,
    [
      "dispatchedNeutralGamepadEvent",
      "requestCount",
      "mutatingRequestCount",
      "requestFailureCount",
      "consoleErrorCount",
      "pageErrorCount",
      "runtime",
    ],
    `${label}.observation`,
  );
  assert.equal(
    typeof value.observation.dispatchedNeutralGamepadEvent,
    "boolean",
    label,
  );
  for (const field of [
    "requestCount",
    "mutatingRequestCount",
    "requestFailureCount",
    "consoleErrorCount",
    "pageErrorCount",
  ]) {
    integer(value.observation[field], `${label}.observation.${field}`);
  }
  assert.ok(
    value.observation.mutatingRequestCount <= value.observation.requestCount,
    label,
  );
  assert.equal(
    value.observation.mutatingRequestCount,
    0,
    `${label} made a mutating request`,
  );
  validateRuntime(value.observation.runtime, `${label}.observation.runtime`);
  assert.deepEqual(
    value.findings,
    buildRemoteGameInputFindings(value.observation.runtime),
    `${label}.findings do not match the observation`,
  );
  assert.equal(value.findings.inputQualification, "none");
}

export function parseCanonicalRemoteGameInputEvidence(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= REMOTE_GAME_INPUT_MAX_BYTES,
    "remote game input evidence byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "remote game input evidence must be canonical JSON",
  );
  return value;
}

export function validateRemoteGameInputSurfaceEvidence(value) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "observedAtUtc",
      "evidenceClass",
      "qualification",
      "environment",
      "provenance",
      "scope",
      "games",
      "observationSha256",
      "summary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, REMOTE_GAME_INPUT_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, REMOTE_GAME_INPUT_EVIDENCE_DATE);
  const observedAt = new Date(value.observedAtUtc);
  assert.ok(
    typeof value.observedAtUtc === "string"
      && !Number.isNaN(observedAt.getTime())
      && observedAt.toISOString() === value.observedAtUtc,
    "observedAtUtc is invalid",
  );
  assert.equal(
    value.evidenceClass,
    "neutral-synthetic-input-api-surface-observation",
  );
  assert.equal(value.qualification, "zero-input-qualifications");
  assert.deepEqual(value.environment, {
    platform: "win32",
    architecture: "x64",
    nodeVersion: "v24.18.0",
    browserProduct: "Google Chrome",
    browserVersion: "150.0.7871.182",
    headless: true,
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    navigationTimeoutMs: 30_000,
    settleMs: 4_000,
  });
  assert.deepEqual(value.provenance, {
    remoteOfflineFormat: offlineReference.format,
    remoteOfflineObservationSha256: offlineReference.observationSha256,
  });
  assert.deepEqual(value.scope, {
    catalogSnapshotDate: "2026-07-19",
    expectedGameCount: offlineReference.games.length,
    syntheticGamepad:
      "one standard-mapped connected fixture with four neutral axes and seventeen unpressed buttons",
    interactionPolicy:
      "dispatch one neutral gamepadconnected event only; no button, key, pointer, touch, form, permission, login, or game action",
    storedData:
      "listener/control/request/error counts, boolean signals, titles, and query-free URLs only; no values, bodies, messages, identifiers, or user data",
  });
  assert.ok(Array.isArray(value.games), "games must be an array");
  assert.equal(value.games.length, offlineReference.games.length);
  value.games.forEach((game, index) =>
    validateGame(game, offlineReference.games[index], index));
  assert.match(value.observationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    value.observationSha256,
    remoteGameInputObservationSha256(value.games),
    "observation digest does not bind the game records",
  );
  assert.deepEqual(
    value.summary,
    buildRemoteGameInputSummary(value.games),
    "summary does not match the game records",
  );
  assert.equal(value.summary.mutatingRequestGameCount, 0);
  assert.equal(value.summary.inputQualifiedCount, 0);
  assert.deepEqual(value.limitations, [...REMOTE_GAME_INPUT_LIMITATIONS]);
  return value;
}

export async function validateTrackedRemoteGameInputSurfaceEvidence() {
  return validateRemoteGameInputSurfaceEvidence(
    parseCanonicalRemoteGameInputEvidence(await readFile(artifactPath)),
  );
}

async function main() {
  const artifact = await validateTrackedRemoteGameInputSurfaceEvidence();
  console.log(
    `validated remote game input evidence; games=${artifact.summary.gameCount}; gamepad-signals=${artifact.summary.gamepadSignalCount}; input-qualified=${artifact.summary.inputQualifiedCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
