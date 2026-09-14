import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { exactKeys, exactKeySet, normalizedText, normalizedSha256, repositoryPath, validateSourceBindings } from "./evidence-primitives.mjs";

test("canonical and order-independent schemas retain distinct key contracts", () => {
  assert.throws(() => exactKeys({ second: 2, first: 1 }, ["first", "second"], "record"));
  exactKeySet({ second: 2, first: 1 }, ["first", "second"], "record");
  for (const value of [null, [], { first: 1 }, { first: 1, second: 2, extra: 3 }]) {
    assert.throws(() => exactKeys(value, ["first", "second"], "record"));
    assert.throws(() => exactKeySet(value, ["first", "second"], "record"));
  }
});

test("source digests agree on LF and CRLF without erasing malformed text", () => {
  assert.equal(normalizedSha256(Buffer.from("hello\r\nworld\r\n")), normalizedSha256(Buffer.from("hello\nworld\n")));
  for (const value of [Buffer.alloc(0), Buffer.from([0xc3, 0x28]), Buffer.from("\uFEFFtext"), Buffer.from("bare\rCR"), Buffer.from("double\r\r\n")]) {
    assert.throws(() => normalizedText(value));
  }
  assert.equal(normalizedText(Buffer.from("α\r\nβ")), "α\nβ");
});

test("source bindings reject changed bytes, role substitution and path escape", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vcg-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "source.md"), "reviewed\r\n");
  const binding = { role: "contract", path: "source.md", sha256: normalizedSha256(Buffer.from("reviewed\n")) };
  const definitions = [["contract", "source.md"]];
  await validateSourceBindings([binding], root, definitions);
  await assert.rejects(validateSourceBindings([{ ...binding, role: "substituted" }], root, definitions));
  assert.throws(() => repositoryPath(root, "../outside.md"), /escapes/);
  await writeFile(join(root, "source.md"), "changed\n");
  await assert.rejects(validateSourceBindings([binding], root, definitions), /digest drifted/);
});
