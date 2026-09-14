// Serving implementation shared by development and the built appliance server.
// console-boundary-policy.ts remains an independent live-probe oracle.

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

const sharedResponseHeaders = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "Permissions-Policy": permissionsPolicy,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const launcherDocumentCsp = [
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

const crossOriginEmbeddableResources = new Set([
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

