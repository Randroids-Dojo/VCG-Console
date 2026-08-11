import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  assert.match(unit, /^Environment=PATH=@NODE_BIN_DIR@:/m);
  assert.doesNotMatch(unit, /--host 0\.0\.0\.0/);
  assert.match(unit, /^User=@CONSOLE_USER@$/m);
  assert.match(unit, /^PartOf=vcg-console\.target$/m);
  assert.match(unit, /^Restart=always$/m);
  assert.match(unit, /^StartLimitIntervalSec=0$/m);
  // `vite preview` bundles vite.config.ts into node_modules/.vite-temp on
  // every startup, even for an already-built preview server. Confirmed live
  // on a Pi 5: ProtectSystem=strict plus ProtectHome=read-only without this
  // makes that write fail with EROFS, crash-looping the service forever.
  assert.match(unit, /^ProtectSystem=strict$/m);
  assert.match(
    unit,
    /^ReadWritePaths=@REPO_ROOT@\/apps\/console-lab\/node_modules$/m,
  );
});

test("the TV session replaces tty1 with Cage and the native fullscreen launcher", async () => {
  const unit = await read("./systemd/vcg-console-session.service.in");

  assert.match(unit, /^Conflicts=getty@tty1\.service$/m);
  assert.match(unit, /^TTYPath=\/dev\/tty1$/m);
  assert.match(unit, /^PAMName=login$/m);
  assert.match(unit, /^PartOf=vcg-console\.target$/m);
  assert.match(unit, /^After=bluetooth\.service /m);
  assert.match(unit, /^ExecStartPre=.*wait-for-console\.sh @REPO_ROOT@$/m);
  assert.match(
    unit,
    /^ExecStart=@CAGE_PATH@ -- @HOST_PATH@ launcher --browser @BROWSER_PATH@ --bluetoothctl @BLUETOOTHCTL_PATH@ --profile-dir \/var\/lib\/vcg-console\/browser-profile --url http:\/\/127\.0\.0\.1:4173\/$/m,
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
  assert.match(target, /^Wants=bluetooth\.service$/m);
  assert.match(target, /^After=bluetooth\.service vcg-console-server\.service$/m);
  assert.match(target, /^WantedBy=multi-user\.target$/m);
  assert.match(installer, /systemctl set-default multi-user\.target/);
  assert.match(installer, /find_command_path bluetoothctl/);
  assert.match(installer, /validate_absolute_path "bluetoothctl"/);
  assert.match(installer, /systemctl cat bluetooth\.service/);
  assert.match(installer, /systemctl enable bluetooth\.service/);
  assert.match(installer, /systemctl enable vcg-console\.target/);
  assert.match(installer, /systemctl disable --now vcg-console\.target/);
  assert.match(installer, /The fullscreen browser must not run as root/);
  assert.match(installer, /Node\.js 22 or newer is required/);
  assert.match(installer, /""\|\*\[!0-9\]\*/);
});

test("one setup command installs, builds, verifies, and owns boot", async () => {
  const setup = await read("./setup-console.sh");

  assert.match(setup, /VERSION_CODENAME:-.*trixie/);
  assert.match(setup, /node_version="22\.23\.2"/);
  assert.match(
    setup,
    /node_sha256="fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8"/,
  );
  assert.match(
    setup,
    /pnpm_sha512="c961d1e0a2d8e354ecaa5166b822516668b7f44cb5bd95122d590dd81922f606f5473b6d23ec4a5be05e7fcd18e8488d47d978bbe981872f1145d06e9a740017"/,
  );
  assert.match(setup, /npm_path.*install --global --ignore-scripts --prefix/);
  assert.match(setup, /getent passwd "\$\{console_user\}"/);
  assert.match(setup, /node_install_root}\.staging/);
  assert.match(setup, /sudo mv -T -- "\$\{node_staging\}" "\$\{node_install_root\}"/);
  for (const packageName of ["bluez", "cage", "chromium", "rustup", "v4l-utils"]) {
    assert.match(setup, new RegExp(`^  ${packageName}$`, "m"));
  }
  assert.match(setup, /bootstrap_args=\(--no-install-instructions\)/);
  assert.match(setup, /bootstrap_args\+?=?.*--full-verify/);
  assert.match(setup, /scripts\/pi\/install-appliance\.sh/);
  assert.match(setup, /The next boot enters the fullscreen console instead of the desktop/);

  if (process.platform === "win32") return;
  const result = spawnSync(
    "bash",
    ["scripts/pi/setup-console.sh", "--dry-run", "--user", "vcg"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /VCG Console Raspberry Pi setup plan/);
  assert.match(result.stdout, /Rendered VCG Console appliance units successfully/);
  assert.match(result.stdout, /no operating-system or repository state was changed/);
});

test("the installer rejects systemd metacharacters in rendered paths", async () => {
  const installer = await read("./install-appliance.sh");
  assert.match(installer, /\*'\$'\*\|\*"'"\*\|\*'"'\*\|\*\\\\\*\)/);

  // Windows' WSL bridge expands `$browser` before bash receives this direct
  // argv probe. The Pi CI job is native Linux and exercises the rejection.
  if (process.platform === "win32") return;

  const unsafeBrowsers = [
    "/usr/bin/$browser",
    "/usr/bin/with'quote",
    '/usr/bin/with"quote',
    "/usr/bin/with\\backslash",
  ];

  for (const browser of unsafeBrowsers) {
    const result = spawnSync(
      "bash",
      [
        "scripts/pi/install-appliance.sh",
        "--dry-run",
        "--user",
        "vcg",
        "--group",
        "vcg",
        "--home",
        "/home/vcg",
        "--browser",
        browser,
        "--cage",
        "/usr/bin/cage",
        "--host",
        "/usr/bin/vcg-host",
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 1, `${browser}: ${result.stderr}`);
    assert.match(result.stderr, /browser cannot contain \$, quotes, or backslashes/);
  }
});
