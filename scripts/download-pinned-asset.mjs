import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { Readable } from "node:stream";

// A pin is checked before publication. Failed or cancelled downloads leave any
// existing asset intact and never retain more than the declared byte count.
export async function downloadPinnedAsset(asset, { fetchImpl = requestAsset, timeoutMs = 30_000 } = {}) {
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
    throw new Error(`${asset.name}: invalid asset pin`);
  }
  await mkdir(dirname(asset.destination), { recursive: true });
  try {
    if ((await stat(asset.destination)).size === asset.bytes) {
      const existing = await readFile(asset.destination);
      if (existing.length === asset.bytes && digest(existing) === asset.sha256) return "verified";
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const temporary = `${asset.destination}.${randomUUID()}.download`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${asset.name}: download timed out`)), timeoutMs);
  let file;
  let reader;
  const cancelBody = () => { void reader?.cancel(controller.signal.reason).catch(() => {}); };
  try {
    const response = await fetchImpl(asset.url, { redirect: "follow", signal: controller.signal });
    reader = response.body?.getReader();
    controller.signal.throwIfAborted();
    if (!response.ok) throw new Error(`${asset.name}: HTTP ${response.status}`);
    if (!reader) throw new Error(`${asset.name}: missing response body`);
    controller.signal.addEventListener("abort", cancelBody, { once: true });
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > asset.bytes)) {
      throw new Error(`${asset.name}: response exceeds the pinned byte count`);
    }
    file = await open(temporary, "wx");
    const hash = createHash("sha256");
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      controller.signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > asset.bytes) throw new Error(`${asset.name}: response exceeds the pinned byte count`);
      hash.update(chunk.value);
      await file.writeFile(chunk.value);
    }
    const receivedHash = hash.digest("hex");
    if (bytes !== asset.bytes || receivedHash !== asset.sha256) {
      throw new Error(`${asset.name}: expected ${asset.bytes}/${asset.sha256}, received ${bytes}/${receivedHash}`);
    }
    await file.sync();
    await file.close();
    file = undefined;
    controller.signal.throwIfAborted();
    await rename(temporary, asset.destination);
    return "downloaded";
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", cancelBody);
    await reader?.cancel().catch(() => {});
    await file?.close();
    await rm(temporary, { force: true });
  }
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function requestAsset(url, { signal }) {
  // Node's bundled fetch can crash on a closing socket while disk writes apply
  // backpressure (nodejs/undici#5360). Core HTTP streams retain bounded reads
  // without that parser, including on the supported Node 22 baseline.
  let target = new URL(url);
  for (let redirects = 0; ; redirects += 1) {
    const request = target.protocol === "https:" ? requestHttps
      : target.protocol === "http:" ? requestHttp : undefined;
    if (!request) throw new Error("Asset URL must use HTTP or HTTPS");
    const response = await new Promise((resolve, reject) => {
      const pending = request(target, { signal, agent: false }, resolve);
      pending.once("error", reject);
      pending.end();
    });
    const status = response.statusCode;
    if ([301, 302, 303, 307, 308].includes(status)) {
      response.destroy();
      if (redirects >= 5 || !response.headers.location) throw new Error("Asset redirect limit or missing location");
      target = new URL(response.headers.location, target);
      continue;
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => response.headers[name.toLowerCase()] ?? null },
      body: Readable.toWeb(response, {
        strategy: { highWaterMark: 64 * 1024, size: (chunk) => chunk.byteLength },
      }),
    };
  }
}
