import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { downloadPinnedAsset } from "./download-pinned-asset.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "vcg-pinned-asset-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from("pinned model bytes");
  const asset = {
    name: "test model", url: "https://assets.invalid/model", destination: join(directory, "model"),
    bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  await writeFile(asset.destination, "previous asset");
  return { directory, bytes, asset };
}

test("publishes verified bytes atomically and reuses the verified file", async (t) => {
  const { directory, bytes, asset } = await fixture(t);
  const fetchImpl = async () => new Response(new ReadableStream({
    async start(controller) {
      controller.enqueue(bytes.subarray(0, 4));
      assert.equal(await readFile(asset.destination, "utf8"), "previous asset");
      controller.enqueue(bytes.subarray(4));
      controller.close();
    },
  }));
  assert.equal(await downloadPinnedAsset(asset, { fetchImpl }), "downloaded");
  assert.deepEqual(await readFile(asset.destination), bytes);
  assert.equal(await downloadPinnedAsset(asset, { fetchImpl: () => assert.fail("cached asset fetched") }), "verified");
  assert.deepEqual(await readdir(directory), ["model"]);
});

for (const failure of ["oversized", "declared oversized", "truncated", "wrong hash", "stalled"]) {
  test(`rejects a ${failure} body without replacing the existing asset`, async (t) => {
    const { directory, bytes, asset } = await fixture(t);
    let cancelled = false;
    const fetchImpl = async () => {
      if (failure === "stalled") {
        return new Response(new ReadableStream({
          start(controller) { controller.enqueue(bytes.subarray(0, 2)); },
          cancel() { cancelled = true; },
        }));
      }
      return new Response(
        failure === "oversized" ? Buffer.concat([bytes, bytes])
          : failure === "truncated" ? bytes.subarray(0, 2)
          : failure === "wrong hash" ? Buffer.alloc(bytes.length) : bytes,
        failure === "declared oversized" ? { headers: { "content-length": String(bytes.length + 1) } } : {},
      );
    };
    await assert.rejects(downloadPinnedAsset(asset, { fetchImpl, timeoutMs: 40 }),
      failure === "stalled" ? /timed out/ : /exceeds|expected/);
    assert.equal(await readFile(asset.destination, "utf8"), "previous asset");
    assert.deepEqual(await readdir(directory), ["model"]);
    if (failure === "stalled") assert.equal(cancelled, true);
  });
}
