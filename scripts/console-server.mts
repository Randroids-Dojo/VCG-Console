import { createServer, type Server } from "node:http";
import { open, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
import { resolveBoundaryHeaders } from "./console-response-headers.mjs";

const mediaTypes: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

function contained(root: string, candidate: string): boolean {
  const suffix = relative(root, candidate);
  return suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
}

/** Serves a trusted, read-only build directory. There is no source/SPA fallback. */
export async function createConsoleServer(directory: string): Promise<Server> {
  const root = await realpath(directory);
  const server = createServer({ maxHeaderSize: 16_384 }, async (request, response) => {
    const fail = (status: number): void => {
      response.writeHead(status, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      response.end();
    };
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 4173;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host ?? "")) {
        fail(403);
        return;
      }
      const target = request.url ?? "/";
      if (!target.startsWith("/") || target.startsWith("//") || target.length > 4_096) {
        fail(400);
        return;
      }
      const pathname = decodeURIComponent(target.split("?")[0]!);
      if (/[\\\u0000:]/u.test(pathname) || pathname.split("/").some((part) => part === ".." || part.startsWith("."))) {
        fail(400);
        return;
      }
      const acceptsHtml = pathname.endsWith(".html") || pathname === "/" || request.headers.accept?.includes("text/html") === true;
      for (const [name, value] of Object.entries(resolveBoundaryHeaders(pathname, acceptsHtml))) {
        response.setHeader(name, value);
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        fail(405);
        return;
      }
      if (request.headers["transfer-encoding"] || Number(request.headers["content-length"] ?? 0) !== 0) {
        fail(400);
        return;
      }
      const candidate = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!contained(root, candidate) || !contained(root, await realpath(candidate))) {
        fail(404);
        return;
      }
      const file = await open(candidate, "r");
      try {
        const stats = await file.stat();
        if (!stats.isFile()) {
          fail(404);
          return;
        }
        response.writeHead(200, {
          "Content-Type": mediaTypes[extname(candidate)] ?? "application/octet-stream",
          "Content-Length": stats.size,
          "Cache-Control": "no-cache",
        });
        if (request.method === "HEAD") response.end();
        else await pipeline(file.createReadStream({ autoClose: false }), response);
      } finally {
        await file.close();
      }
    } catch (error) {
      if (response.headersSent) response.destroy();
      else if (error instanceof URIError) fail(400);
      else if (error && typeof error === "object" && "code" in error && ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(String(error.code))) fail(404);
      else fail(500);
    }
  });
  server.maxConnections = 128;
  server.maxRequestsPerSocket = 1_000;
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.timeout = 30_000;
  return server;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let root: string | undefined;
  let port = 4173;
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value) throw new Error(`${flag} requires a value`);
    if (flag === "--root") root = value;
    else if (flag === "--port" && /^\d+$/u.test(value)) port = Number(value);
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!root || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Usage: console-server.mjs --root <built directory> [--port 4173]");
  }
  const server = await createConsoleServer(root);
  server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`Console: http://127.0.0.1:${port}`));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => { server.close(); server.closeAllConnections(); });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
