import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
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

async function serve(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("downloads a closing socket body larger than the stream buffer through a relative redirect", async (t) => {
  const { directory, asset } = await fixture(t);
  const bytes = Buffer.alloc(256 * 1024, 0x61);
  const base = await serve(t, (request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/asset" });
      response.end();
    } else {
      response.writeHead(200, { "content-length": bytes.length, connection: "close" });
      response.end(bytes);
    }
  });
  assert.equal(await downloadPinnedAsset({ ...asset, url: `${base}/redirect`, bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex") }), "downloaded");
  assert.deepEqual(await readFile(asset.destination), bytes);
  assert.deepEqual(await readdir(directory), ["model"]);
});

for (const failure of ["redirect loop", "truncated socket", "stalled socket"]) {
  test(`bounds a ${failure} without publishing partial data`, async (t) => {
    const { directory, bytes, asset } = await fixture(t);
    let requests = 0;
    const base = await serve(t, (_request, response) => {
      requests += 1;
      if (failure === "redirect loop") {
        response.writeHead(302, { location: "/again" });
        response.end();
      } else {
        response.writeHead(200, { "content-length": bytes.length, connection: "close" });
        response.write(bytes.subarray(0, 2));
        if (failure === "truncated socket") response.end();
      }
    });
    await assert.rejects(downloadPinnedAsset({ ...asset, url: base }, { timeoutMs: 250 }),
      failure === "redirect loop" ? /redirect limit/ : /aborted|timed out|terminated/i);
    if (failure === "redirect loop") assert.equal(requests, 6);
    assert.equal(await readFile(asset.destination, "utf8"), "previous asset");
    assert.deepEqual(await readdir(directory), ["model"]);
  });
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
