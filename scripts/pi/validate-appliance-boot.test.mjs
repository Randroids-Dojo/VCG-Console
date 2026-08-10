import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the server is loopback-only and uses the production preview", async () => {
  const unit = await read("./systemd/vcg-console-server.service.in");

  assert.match(
    unit,
    /apps\/console-lab\/node_modules\/\.bin\/vite preview --host 127\.0\.0\.1 --port 4173 --strictPort/,
  );
  assert.match(unit, /^WorkingDirectory=@REPO_ROOT@\/apps\/console-lab$/m);
  assert.doesNotMatch(unit, /--host 0\.0\.0\.0/);
  assert.match(unit, /^User=@CONSOLE_USER@$/m);
  assert.match(unit, /^PartOf=vcg-console\.target$/m);
  assert.match(unit, /^Restart=always$/m);
  assert.match(unit, /^StartLimitIntervalSec=0$/m);
});

test("the TV session replaces tty1 with Cage and the native fullscreen launcher", async () => {
  const unit = await read("./systemd/vcg-console-session.service.in");

  assert.match(unit, /^Conflicts=getty@tty1\.service$/m);
  assert.match(unit, /^TTYPath=\/dev\/tty1$/m);
  assert.match(unit, /^PAMName=login$/m);
  assert.match(unit, /^PartOf=vcg-console\.target$/m);
  assert.match(unit, /^ExecStartPre=.*wait-for-console\.sh @REPO_ROOT@$/m);
  assert.match(
    unit,
    /^ExecStart=@CAGE_PATH@ -- @HOST_PATH@ launcher --browser @BROWSER_PATH@ --profile-dir \/var\/lib\/vcg-console\/browser-profile --url http:\/\/127\.0\.0\.1:4173\/$/m,
  );
  assert.doesNotMatch(unit, /--windowed/);
  assert.match(unit, /^Restart=always$/m);
  assert.match(unit, /^StartLimitIntervalSec=0$/m);
  assert.match(unit, /^User=@CONSOLE_USER@$/m);
});

test("the appliance target is a multi-user boot target", async () => {
  const [target, installer] = await Promise.all([
    read("./systemd/vcg-console.target.in"),
    read("./install-appliance.sh"),
  ]);

  assert.match(
    target,
    /^Requires=vcg-console-server\.service vcg-console-session\.service$/m,
  );
  assert.match(target, /^WantedBy=multi-user\.target$/m);
  assert.match(installer, /systemctl set-default multi-user\.target/);
  assert.match(installer, /systemctl enable vcg-console\.target/);
  assert.match(installer, /systemctl disable --now vcg-console\.target/);
  assert.match(installer, /The fullscreen browser must not run as root/);
});
