import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parsePi5HailoImagePlanBytes,
  validatePi5HailoImagePlan,
} from "./validate-pi5-hailo-image-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const planBytes = await readFile(
  resolve(root, "benchmarks/pi-image/pi5-hailo-image-plan-v1.json"),
);
const tracked = parsePi5HailoImagePlanBytes(planBytes);
const clone = () => structuredClone(tracked);
const bytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

test("accepts the tracked blocked Pi image plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.executionGate.blockerCodes.length, 8);
});

test("rejects base-image identity or hash drift", () => {
  for (const [key, value] of [
    ["releaseDate", "2026-06-19"],
    ["nominalKernelVersion", "6.19"],
    ["compressedSha256", "0".repeat(64)],
  ]) {
    const plan = clone();
    plan.baseImage[key] = value;
    assert.throws(() => validatePi5HailoImagePlan(plan));
  }
});

test("rejects Hailo tag, commit, or runtime-family drift", () => {
  for (const [key, value] of [
    ["tag", "main"],
    ["commit", "0".repeat(40)],
    ["hailoRtCandidateFamily", "5.3"],
  ]) {
    const plan = clone();
    plan.hailoSourceCandidate[key] = value;
    assert.throws(() => validatePi5HailoImagePlan(plan));
  }
});

test("rejects fabricated received hardware or camera identity", () => {
  const board = clone();
  board.hardware.board.receivedRevision = "invented";
  assert.throws(() => validatePi5HailoImagePlan(board));
  const camera = clone();
  camera.hardware.camera.usbVendorProductId = "046d:0000";
  assert.throws(() => validatePi5HailoImagePlan(camera));
});

test("rejects populated unverified immutable inputs", () => {
  const plan = clone();
  plan.immutableInputs.poseHefSha256 = "a".repeat(64);
  assert.throws(() => validatePi5HailoImagePlan(plan), /cannot populate/u);
});

test("rejects hidden execution authority", () => {
  for (const key of [
    "downloadAuthorized",
    "imageBuildAuthorized",
    "removableMediaWriteAuthorized",
    "destructiveTestAuthorized",
  ]) {
    const plan = clone();
    plan.executionGate[key] = true;
    assert.throws(() => validatePi5HailoImagePlan(plan));
  }
});

test("rejects blocker omission and reordering", () => {
  const missing = clone();
  missing.executionGate.blockerCodes.pop();
  assert.throws(() => validatePi5HailoImagePlan(missing));
  const reordered = clone();
  reordered.executionGate.blockerCodes.reverse();
  assert.throws(() => validatePi5HailoImagePlan(reordered));
});

test("rejects unauthorized keys and sensitive configuration keys", () => {
  const extra = clone();
  extra.hardware.camera.serial = "invented";
  assert.throws(() => validatePi5HailoImagePlan(extra));
  const sensitive = clone();
  sensitive.wifiSsid = "household";
  assert.throws(() => validatePi5HailoImagePlan(sensitive));
});

test("rejects noncanonical, duplicate, BOM, invalid UTF-8, and oversized input", () => {
  assert.throws(() => parsePi5HailoImagePlanBytes(Buffer.from(JSON.stringify(tracked))));
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  assert.throws(() => parsePi5HailoImagePlanBytes(duplicate), /canonical/u);
  assert.throws(() => parsePi5HailoImagePlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), planBytes])));
  assert.throws(() => parsePi5HailoImagePlanBytes(Buffer.from([0xc3, 0x28])));
  assert.throws(() => parsePi5HailoImagePlanBytes(Buffer.alloc(65_537)));
});

test("rejects array-count and claim-boundary weakening", () => {
  const capture = clone();
  capture.requiredBootCapture.pop();
  assert.throws(() => validatePi5HailoImagePlan(capture));
  const boundary = clone();
  boundary.claimBoundary = "Source-pinned, non-executing plan.";
  assert.throws(() => validatePi5HailoImagePlan(boundary));
});
