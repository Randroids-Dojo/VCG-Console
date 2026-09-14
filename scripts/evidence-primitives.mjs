import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export function exactKeys(value, expected, label) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted: unknown or missing fields, or incorrect field order`);
}

// A few schemas intentionally accept JSON key order independently of their
// canonical serialized order. Keep that contract distinct from exactKeys.
export function exactKeySet(value, expected, label) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys must be exactly ${expected.join(", ")}`);
}

export function normalizedText(bytes, label = "source") {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
  assert.ok(!text.startsWith("\uFEFF"), `${label} must not contain a UTF-8 BOM`);
  assert.ok(!/\r(?!\n)/u.test(text), `${label} contains a bare CR (carriage return)`);
  return text.replaceAll("\r\n", "\n");
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function normalizedSha256(bytes, label) {
  return sha256(normalizedText(bytes, label));
}

export function repositoryPath(repositoryRoot, path) {
  const absolute = resolve(repositoryRoot, path);
  const local = relative(repositoryRoot, absolute);
  assert.ok(local.length > 0 && !local.startsWith("..") && !isAbsolute(local), `${path} escapes repository`);
  return absolute;
}

export async function validateSourceBindings(bindings, repositoryRoot, definitions, keys = ["role", "path", "sha256"]) {
  assert.ok(Array.isArray(bindings), "sourceBindings must be an array");
  assert.equal(bindings.length, definitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, keys, `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], definitions[index]);
    assert.match(binding.sha256, /^[a-f0-9]{64}$/u);
    const absolute = repositoryPath(repositoryRoot, binding.path);
    assert.equal(normalizedSha256(await readFile(absolute), binding.path), binding.sha256, `${binding.path} digest drifted`);
  }
}
