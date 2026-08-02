// The browser boundary the console documents must be served with, expressed as
// an independent expectation.
//
// `apps/console-lab/vite.config.ts` is the serving definition; this file is the
// check. They are deliberately not shared code: the console-lab config is bound
// by SHA-256 in recorded evidence, and a tooling refactor must not invalidate an
// observation. The two are bound at runtime instead —
// `scripts/verify-console-headers.ts` probes a running server against these
// values and fails when any header is absent or reworded, which is a stronger
// guarantee than a shared constant because it also catches a server that never
// installed the middleware at all.
//
// This matters for a Raspberry Pi bring-up: a plain static file server answers
// the same URLs with the same bytes and no boundary headers, silently disabling
// cross-origin isolation and the camera permission policy.
//
// If the config's values change deliberately, change them here too; the live
// check is what makes the drift loud.

const permissionsPolicy = [
  "accelerometer=()",
  "autoplay=(self)",
  "camera=(self)",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=()",
  "gamepad=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "serial=()",
  "usb=()",
  "web-share=()",
].join(", ");

export const sharedResponseHeaders: Readonly<Record<string, string>> = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "Permissions-Policy": permissionsPolicy,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export const launcherDocumentCsp = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* ws://localhost:*",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

const sameOriginBridgeHostCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
].join("; ");

const sameOriginBridgeClientCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "script-src 'self'",
].join("; ");

const crossOriginBridgeHostCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'self' http://localhost:4173",
  "object-src 'none'",
  "script-src 'self'",
].join("; ");

const hostilePolicyHostCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src http://localhost:4173",
  "object-src 'none'",
].join("; ");

const crossOriginBridgeClientCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors http://127.0.0.1:4173",
  "object-src 'none'",
  "script-src 'self'",
].join("; ");

const hostilePolicyClientCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-ancestors http://127.0.0.1:4173",
  "frame-src 'none'",
  "img-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'none'",
].join("; ");

const opaqueSandboxHostCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'self'",
  "object-src 'none'",
].join("; ");

const opaqueSandboxClientCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-ancestors http://127.0.0.1:4173",
  "frame-src 'none'",
  "img-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "script-src http://127.0.0.1:4173",
  "style-src 'none'",
].join("; ");

const documentPolicies = new Map<string, string>([
  ["/", launcherDocumentCsp],
  ["/index.html", launcherDocumentCsp],
  ["/bridge-host.html", sameOriginBridgeHostCsp],
  ["/bridge-client.html", sameOriginBridgeClientCsp],
  ["/bridge-stalled-client.html", sameOriginBridgeClientCsp],
  ["/bridge-cross-origin-host.html", crossOriginBridgeHostCsp],
  ["/godot-bridge-host.html", crossOriginBridgeHostCsp],
  ["/bridge-cross-origin-client.html", crossOriginBridgeClientCsp],
  ["/bridge-hostile-client.html", crossOriginBridgeClientCsp],
  ["/browser-policy-host.html", hostilePolicyHostCsp],
  ["/browser-policy-hostile.html", hostilePolicyClientCsp],
  ["/browser-policy-opaque-host.html", opaqueSandboxHostCsp],
  ["/browser-policy-opaque-child.html", opaqueSandboxClientCsp],
]);

const crossOriginEmbeddableResources: ReadonlySet<string> = new Set([
  "/bridge-cross-origin-client.html",
  "/browser-policy-hostile.html",
  "/browser-policy-opaque-child.html",
  "/src/browser-policy-hostile-fixture.ts",
]);

function isOpaqueFixtureScript(pathname: string): boolean {
  return (
    pathname === "/src/browser-policy-hostile-fixture.ts" ||
    /^\/assets\/(?:browser-policy-hostile-fixture|modulepreload-polyfill)-[A-Za-z0-9_-]+\.js$/u.test(
      pathname,
    )
  );
}

/**
 * The exact response headers the console serves for one request. The Vite
 * middleware applies this result verbatim; nothing else may add or reword a
 * boundary header.
 */
export function resolveBoundaryHeaders(
  pathname: string,
  acceptsHtml: boolean,
): Record<string, string> {
  const headers: Record<string, string> = { ...sharedResponseHeaders };
  headers["Cross-Origin-Resource-Policy"] =
    crossOriginEmbeddableResources.has(pathname) || isOpaqueFixtureScript(pathname)
      ? "cross-origin"
      : "same-origin";
  if (isOpaqueFixtureScript(pathname)) {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  const contentSecurityPolicy =
    documentPolicies.get(pathname) ?? (acceptsHtml ? launcherDocumentCsp : undefined);
  if (contentSecurityPolicy) {
    headers["Content-Security-Policy"] = contentSecurityPolicy;
  }
  return headers;
}

/** One header that a running server did not serve as required. */
export interface BoundaryHeaderFailure {
  header: string;
  expected: string;
  observed: string | undefined;
}

/**
 * Compares one observed response against the required boundary. Header names
 * are compared case-insensitively because HTTP header names are not
 * case-sensitive; values must match exactly.
 */
export function evaluateBoundaryHeaders(
  pathname: string,
  acceptsHtml: boolean,
  observed: Iterable<readonly [string, string]>,
): BoundaryHeaderFailure[] {
  const seen = new Map<string, string>();
  for (const [name, value] of observed) {
    seen.set(name.toLowerCase(), value);
  }
  const failures: BoundaryHeaderFailure[] = [];
  for (const [header, expected] of Object.entries(resolveBoundaryHeaders(pathname, acceptsHtml))) {
    const value = seen.get(header.toLowerCase());
    if (value !== expected) {
      failures.push({ header, expected, observed: value });
    }
  }
  return failures;
}
