import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  evaluateBoundaryHeaders,
  launcherDocumentCsp,
  resolveBoundaryHeaders,
  sharedResponseHeaders,
} from "./console-boundary-policy";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const viteConfigPath = resolve(root, "apps/console-lab/vite.config.ts");

test("the launcher document is cross-origin isolated and camera-capable", () => {
  const headers = resolveBoundaryHeaders("/", true);
  assert.equal(headers["Cross-Origin-Embedder-Policy"], "require-corp");
  assert.equal(headers["Cross-Origin-Opener-Policy"], "same-origin");
  assert.equal(headers["Cross-Origin-Resource-Policy"], "same-origin");
  assert.equal(headers["Content-Security-Policy"], launcherDocumentCsp);
  assert.ok(headers["Permissions-Policy"]?.includes("camera=(self)"));
  assert.ok(headers["Permissions-Policy"]?.includes("microphone=()"));
  assert.ok(!("Access-Control-Allow-Origin" in headers));
});

test("every shared header survives on a non-document response", () => {
  // The pinned MediaPipe wasm and model are fetched as subresources. Losing
  // cross-origin isolation there disables threaded inference rather than
  // failing loudly, so the boundary must not be document-only.
  const headers = resolveBoundaryHeaders("/wasm/vision_wasm_internal.js", false);
  for (const [name, value] of Object.entries(sharedResponseHeaders)) {
    assert.equal(headers[name], value, `missing shared header: ${name}`);
  }
  assert.equal(headers["Cross-Origin-Resource-Policy"], "same-origin");
  assert.ok(!("Content-Security-Policy" in headers));
});

test("the cross-origin escape hatch stays limited to the named fixtures", () => {
  const fixture = resolveBoundaryHeaders("/browser-policy-opaque-child.html", true);
  assert.equal(fixture["Cross-Origin-Resource-Policy"], "cross-origin");
  assert.ok(!("Access-Control-Allow-Origin" in fixture));

  const script = resolveBoundaryHeaders("/src/browser-policy-hostile-fixture.ts", false);
  assert.equal(script["Cross-Origin-Resource-Policy"], "cross-origin");
  assert.equal(script["Access-Control-Allow-Origin"], "*");

  const built = resolveBoundaryHeaders("/assets/browser-policy-hostile-fixture-a1B2c3.js", false);
  assert.equal(built["Access-Control-Allow-Origin"], "*");
  assert.ok(
    !("Access-Control-Allow-Origin" in resolveBoundaryHeaders("/assets/main-a1B2c3.js", false)),
  );
});

test("an exact response reports no failure", () => {
  const observed = Object.entries(resolveBoundaryHeaders("/", true)).map(
    ([name, value]) => [name.toLowerCase(), value] as const,
  );
  assert.deepEqual(evaluateBoundaryHeaders("/", true, observed), []);
});

test("a missing or reworded header is reported instead of passing silently", () => {
  const observed = Object.entries(resolveBoundaryHeaders("/", true))
    .filter(([name]) => name !== "Cross-Origin-Embedder-Policy")
    .map(([name, value]) =>
      name === "Cross-Origin-Opener-Policy"
        ? ([name, "unsafe-none"] as const)
        : ([name, value] as const),
    );
  const failures = evaluateBoundaryHeaders("/", true, observed);
  assert.deepEqual(
    failures.find((failure) => failure.header === "Cross-Origin-Embedder-Policy"),
    { header: "Cross-Origin-Embedder-Policy", expected: "require-corp", observed: undefined },
  );
  assert.deepEqual(
    failures.find((failure) => failure.header === "Cross-Origin-Opener-Policy"),
    { header: "Cross-Origin-Opener-Policy", expected: "same-origin", observed: "unsafe-none" },
  );
});

test("the serving config still contains every expected header value", async () => {
  // A static cross-check only. It cannot prove the middleware runs, which is
  // why `verify:console-headers` probes a live server; it does catch an edit
  // that changes one file and not the other.
  const config = await readFile(viteConfigPath, "utf8");
  for (const [name, value] of Object.entries(sharedResponseHeaders)) {
    assert.ok(config.includes(name), `vite config no longer sets ${name}`);
    if (name !== "Permissions-Policy") {
      assert.ok(config.includes(value), `vite config no longer sets ${name}: ${value}`);
    }
  }
  for (const directive of launcherDocumentCsp.split("; ")) {
    assert.ok(
      config.includes(`"${directive}"`),
      `vite config no longer declares the launcher CSP directive: ${directive}`,
    );
  }
});
