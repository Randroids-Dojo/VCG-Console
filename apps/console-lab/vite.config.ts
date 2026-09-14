import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Connect, type Plugin } from "vite";
import { fileURLToPath } from "node:url";

import { resolveBoundaryHeaders } from "../../scripts/console-response-headers.mjs";

function browserBoundaryHeaders(): Plugin {
  const install = (middlewares: Connect.Server): void => {
    middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      const headers = resolveBoundaryHeaders(pathname, request.headers.accept?.includes("text/html") ?? false);
      for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
      next();
    });
  };
  return {
    name: "vcg-browser-boundary-headers",
    configureServer: (server) => install(server.middlewares),
    configurePreviewServer: (server) => install(server.middlewares),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [svelte(), browserBoundaryHeaders()],
  define: { __VCG_LAB__: JSON.stringify(mode === "lab") },
  build: {
    outDir: mode === "lab" ? "dist-lab" : "dist",
    rollupOptions: {
      input: mode === "lab" ? {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        bridgeHost: fileURLToPath(new URL("./bridge-host.html", import.meta.url)),
        bridgeClient: fileURLToPath(new URL("./bridge-client.html", import.meta.url)),
        bridgeStalledClient: fileURLToPath(
          new URL("./bridge-stalled-client.html", import.meta.url),
        ),
        bridgeCrossOriginHost: fileURLToPath(
          new URL("./bridge-cross-origin-host.html", import.meta.url),
        ),
        godotBridgeHost: fileURLToPath(
          new URL("./godot-bridge-host.html", import.meta.url),
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
        browserPolicyOpaqueHost: fileURLToPath(
          new URL("./browser-policy-opaque-host.html", import.meta.url),
        ),
        browserPolicyOpaqueChild: fileURLToPath(
          new URL("./browser-policy-opaque-child.html", import.meta.url),
        ),
      } : { main: fileURLToPath(new URL("./index.html", import.meta.url)) },
    },
  },
}));
