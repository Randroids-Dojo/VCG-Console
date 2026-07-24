import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Connect, type Plugin } from "vite";
import { fileURLToPath } from "node:url";

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

const documentPolicies = new Map<string, string>([
  ["/", launcherDocumentCsp],
  ["/index.html", launcherDocumentCsp],
  ["/bridge-host.html", sameOriginBridgeHostCsp],
  ["/bridge-client.html", sameOriginBridgeClientCsp],
  ["/bridge-stalled-client.html", sameOriginBridgeClientCsp],
  ["/bridge-cross-origin-host.html", crossOriginBridgeHostCsp],
  ["/bridge-cross-origin-client.html", crossOriginBridgeClientCsp],
  ["/bridge-hostile-client.html", crossOriginBridgeClientCsp],
  ["/browser-policy-host.html", hostilePolicyHostCsp],
  ["/browser-policy-hostile.html", hostilePolicyClientCsp],
]);

const crossOriginEmbeddableDocuments = new Set([
  "/bridge-cross-origin-client.html",
  "/browser-policy-hostile.html",
]);

function browserBoundaryHeaders(): Plugin {
  const install = (middlewares: Connect.Server): void => {
    middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      for (const [name, value] of Object.entries(sharedResponseHeaders)) {
        response.setHeader(name, value);
      }
      response.setHeader(
        "Cross-Origin-Resource-Policy",
        crossOriginEmbeddableDocuments.has(pathname) ? "cross-origin" : "same-origin",
      );

      const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
      const contentSecurityPolicy =
        documentPolicies.get(pathname) ?? (acceptsHtml ? launcherDocumentCsp : undefined);
      if (contentSecurityPolicy) {
        response.setHeader("Content-Security-Policy", contentSecurityPolicy);
      }
      next();
    });
  };
  return {
    name: "vcg-browser-boundary-headers",
    configureServer: (server) => install(server.middlewares),
    configurePreviewServer: (server) => install(server.middlewares),
  };
}

export default defineConfig({
  plugins: [svelte(), browserBoundaryHeaders()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        bridgeHost: fileURLToPath(new URL("./bridge-host.html", import.meta.url)),
        bridgeClient: fileURLToPath(new URL("./bridge-client.html", import.meta.url)),
        bridgeStalledClient: fileURLToPath(
          new URL("./bridge-stalled-client.html", import.meta.url),
        ),
        bridgeCrossOriginHost: fileURLToPath(
          new URL("./bridge-cross-origin-host.html", import.meta.url),
        ),
        bridgeCrossOriginClient: fileURLToPath(
          new URL("./bridge-cross-origin-client.html", import.meta.url),
        ),
        bridgeHostileClient: fileURLToPath(
          new URL("./bridge-hostile-client.html", import.meta.url),
        ),
        browserPolicyHost: fileURLToPath(
          new URL("./browser-policy-host.html", import.meta.url),
        ),
        browserPolicyHostile: fileURLToPath(
          new URL("./browser-policy-hostile.html", import.meta.url),
        ),
      },
    },
  },
});
