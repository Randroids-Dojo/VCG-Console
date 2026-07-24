import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Connect, type Plugin } from "vite";
import { fileURLToPath } from "node:url";

const isolationHeaders = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function crossOriginBridgeFixtureHeaders(): Plugin {
  const install = (middlewares: Connect.Server): void => {
    middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (pathname === "/bridge-cross-origin-client.html") {
        response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      }
      next();
    });
  };
  return {
    name: "vcg-cross-origin-bridge-fixture-headers",
    configureServer: (server) => install(server.middlewares),
    configurePreviewServer: (server) => install(server.middlewares),
  };
}

export default defineConfig({
  plugins: [svelte(), crossOriginBridgeFixtureHeaders()],
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
      },
    },
  },
  server: {
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
});
