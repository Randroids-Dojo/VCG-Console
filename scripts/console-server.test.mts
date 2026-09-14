import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, symlink, cp, readdir, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request } from "node:http";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";
import { createConsoleServer } from "./console-server.mjs";
import { evaluateBoundaryHeaders } from "./console-boundary-policy.js";

test("built files and errors preserve the independent browser boundary", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "vcg-server-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await writeFile(join(temp, "index.html"), "<!doctype html><title>Console</title>");
  await writeFile(join(temp, "model.task"), Buffer.from([1, 2, 3]));
  const server = await createConsoleServer(temp);
  t.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  for (const [path, status] of [["/", 200], ["/model.task", 200], ["/bridge-host.html", 404], ["/missing", 404]] as const) {
    const result = await fetch(base + path);
    assert.equal(result.status, status);
    assert.deepEqual(evaluateBoundaryHeaders(path, path === "/" || path.endsWith(".html"), result.headers), []);
    await result.arrayBuffer();
  }
  const head = await fetch(base + "/model.task", { method: "HEAD" });
  assert.equal(head.headers.get("content-length"), "3");
  assert.equal(await head.text(), "");
  assert.equal((await fetch(base, { method: "POST" })).status, 405);
  const foreignHostStatus = await new Promise<number | undefined>((accept, reject) => {
    const call = request(base, { headers: { host: "attacker.example" } }, (response) => {
      response.resume();
      response.on("end", () => accept(response.statusCode));
    });
    call.on("error", reject);
    call.end();
  });
  assert.equal(foreignHostStatus, 403);
});

test("encoded traversal, dotfiles, malformed paths and external symlinks cannot read outside the build", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "vcg-server-bounds-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const publicRoot = join(temp, "public");
  const privateRoot = join(temp, "private");
  await mkdir(publicRoot);
  await mkdir(privateRoot);
  await writeFile(join(privateRoot, "secret.txt"), "private");
  await writeFile(join(publicRoot, ".secret"), "private");
  await symlink(privateRoot, join(publicRoot, "linked"), process.platform === "win32" ? "junction" : "dir");
  const server = await createConsoleServer(publicRoot);
  t.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  for (const path of ["/%2e%2e/private/secret.txt", "/..%5cprivate/secret.txt", "/.secret", "/%00", "/%zz", "/linked/secret.txt"]) {
    const result = await new Promise<{ status: number; body: string }>((accept, reject) => {
      const call = request({ hostname: "127.0.0.1", port: address.port, path }, (response) => {
        let body = "";
        response.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        response.on("end", () => accept({ status: response.statusCode!, body }));
      });
      call.on("error", reject);
      call.end();
    });
    assert.ok(result.status >= 400, path);
    assert.doesNotMatch(result.body, /private/u);
  }
});

test("compiled runtime starts from a read-only package without node_modules", async (t) => {
  const built = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.runtime.json"], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const temp = await mkdtemp(join(tmpdir(), "vcg-server-package-"));
  const packageRoot = join(temp, "runtime");
  await cp(resolve("build/console-runtime"), packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "index.html"), "packaged console");
  const names = await readdir(packageRoot);
  assert.ok(!names.includes("node_modules"));
  if (process.platform !== "win32") await chmod(packageRoot, 0o555);
  t.after(async () => { await chmod(packageRoot, 0o755); await rm(temp, { recursive: true, force: true }); });
  // Import the compiled module in a separate process with no workspace loader.
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { createConsoleServer } from './console-server.mjs';
    const server = await createConsoleServer('.');
    server.listen(0, '127.0.0.1', async () => {
      const response = await fetch('http://127.0.0.1:' + server.address().port);
      if (await response.text() !== 'packaged console') process.exitCode = 1;
      server.closeAllConnections(); server.close();
    });
  `], { cwd: packageRoot, stdio: "pipe" });
  t.after(() => child.kill());
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, stderr);
  assert.deepEqual(await readdir(packageRoot), names);
});
