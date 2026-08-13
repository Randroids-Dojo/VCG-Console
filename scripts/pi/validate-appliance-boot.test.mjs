import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    /^ExecStart=@CAGE_PATH@ -- @HOST_PATH@ launcher --browser @BROWSER_PATH@ --bluetoothctl @BLUETOOTHCTL_PATH@ --cursor-nudge @CURSOR_NUDGE_PATH@ --profile-dir \/var\/lib\/vcg-console\/browser-profile --url http:\/\/127\.0\.0\.1:4173\/$/m,
  );
  assert.doesNotMatch(unit, /--windowed/);
  assert.match(unit, /^Restart=always$/m);
  assert.match(unit, /^StartLimitIntervalSec=0$/m);
  assert.match(unit, /^User=@CONSOLE_USER@$/m);
  // pam_systemd (PAMName=login) sets XDG_RUNTIME_DIR to the real login-session
  // runtime directory (/run/user/<uid>), overriding the Environment= line
  // above, so Cage/Chromium create their Wayland socket there. Confirmed live
  // on a Pi 5: without this being writable too, every launch fails with
  // "Unable to open Wayland socket: Invalid argument" after exhausting all
  // wayland-0..31 lock attempts.
  //
  // systemd's %U specifier is documented to expand to the unit's User=, but
  // was observed live resolving to 0 (root) for this unit's mount-namespace
  // setup, failing with "/run/user/0: No such file or directory" -- the
  // installer resolves the numeric UID itself and templates it directly
  // instead.
  assert.match(
    unit,
    /^ReadWritePaths=(?:\S* )*\/run\/user\/@CONSOLE_UID@(?: \S*)*$/m,
  );
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
  assert.match(installer, /for group in video render input bluetooth/);
  assert.match(installer, /systemctl enable vcg-console\.target/);
  assert.match(installer, /systemctl disable --now vcg-console\.target/);
  assert.match(installer, /The fullscreen browser must not run as root/);
  assert.match(installer, /Node\.js 22 or newer is required/);
  assert.match(installer, /""\|\*\[!0-9\]\*/);
});

test("the installer grants uinput access for the cursor nudge", async () => {
  const [installer, udevRule, modulesLoad] = await Promise.all([
    read("./install-appliance.sh"),
    read("./udev/99-vcg-console-uinput.rules"),
    read("./modules-load.d/vcg-console-uinput.conf"),
  ]);

  // cage has no default-cursor flag, and Chromium only tells cage to hide
  // its default cursor in response to a real pointer event -- which never
  // happens with no physical pointing device attached. The vcg-cursor-nudge
  // binary supplies that one event synthetically, but needs /dev/uinput
  // writable and the module loaded first.
  assert.match(udevRule, /^KERNEL=="uinput", GROUP="input", MODE="0660"$/m);
  assert.match(modulesLoad, /^uinput$/m);
  assert.match(
    installer,
    /install -m 0644 "\$\{repo_root\}\/scripts\/pi\/udev\/99-vcg-console-uinput\.rules" \/etc\/udev\/rules\.d\/99-vcg-console-uinput\.rules/,
  );
  assert.match(
    installer,
    /install -m 0644 "\$\{repo_root\}\/scripts\/pi\/modules-load\.d\/vcg-console-uinput\.conf" \/etc\/modules-load\.d\/vcg-console-uinput\.conf/,
  );
  assert.match(installer, /udevadm control --reload-rules/);
  assert.match(installer, /modprobe uinput/);
  assert.match(installer, /udevadm trigger --name-match=uinput \|\| true/);
  // Re-running the installer must still pick up a freshly loaded module on
  // an already-existing /dev/uinput node -- the fallback trigger has to run
  // after modprobe, not before it.
  const modprobeIndex = installer.search(/modprobe uinput/);
  const triggerIndex = installer.search(/udevadm trigger --name-match=uinput \|\| true/);
  assert.ok(modprobeIndex >= 0 && triggerIndex > modprobeIndex);

  // vcg-cursor-nudge itself: resolved like the other release binaries,
  // validated as an absolute path, required to exist before a real
  // install, and substituted into the rendered session unit.
  assert.match(
    installer,
    /cursor_nudge_path="\$\{cursor_nudge_path:-\$\{repo_root\}\/target\/release\/vcg-cursor-nudge\}"/,
  );
  assert.match(installer, /validate_absolute_path "cursor-nudge" "\$\{cursor_nudge_path\}"/);
  assert.match(
    installer,
    /content="\$\{content\/\/@CURSOR_NUDGE_PATH@\/\$\{cursor_nudge_path\}\}"/,
  );
  // A missing cursor-nudge binary must fail the install before any unit is
  // rendered, exactly like the other release binaries it's listed beside.
  const executableCheckIndex = installer.search(
    /"\$\{bluetoothctl_path\}"\s*\\\n\s*"\$\{cursor_nudge_path\}"/,
  );
  const renderIndex = installer.search(
    /content="\$\{content\/\/@CURSOR_NUDGE_PATH@\/\$\{cursor_nudge_path\}\}"/,
  );
  assert.ok(executableCheckIndex >= 0 && renderIndex > executableCheckIndex);
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

test("the rendered session unit carries the getent-resolved numeric UID, not a placeholder", async () => {
  // The other tests here all use a fictitious "vcg" user that doesn't exist on
  // the CI runner, so console_uid resolution always falls through to the
  // dry-run default (1000) rather than exercising the getent lookup itself.
  // A stub `getent` on PATH forces the real lookup branch deterministically
  // and returns a UID that can't collide with that fallback, so this proves
  // the getent -> console_uid -> render pipeline actually works end-to-end
  // instead of just checking the placeholder token is gone. getent itself is
  // Linux-only (the installer's actual target), so skip everywhere else
  // rather than just win32.
  if (process.platform !== "linux") return;

  const fakeUser = "vcg-uid-fixture";
  const fakeUid = "4242";
  const fixtureDir = await mkdtemp(join(tmpdir(), "vcg-appliance-getent-"));
  const outputDir = await mkdtemp(join(tmpdir(), "vcg-appliance-uid-"));
  try {
    await writeFile(
      join(fixtureDir, "getent"),
      `#!/usr/bin/env bash\n` +
        `if [ "$1" = "passwd" ] && [ "$2" = "${fakeUser}" ]; then\n` +
        `  echo "${fakeUser}:x:${fakeUid}:${fakeUid}::/home/${fakeUser}:/bin/bash"\n` +
        `  exit 0\n` +
        `fi\n` +
        `exit 1\n`,
      { mode: 0o755 },
    );

    const result = spawnSync(
      "bash",
      [
        "scripts/pi/install-appliance.sh",
        "--dry-run",
        "--user",
        fakeUser,
        "--browser",
        "/usr/bin/chromium",
        "--cage",
        "/usr/bin/cage",
        "--host",
        "/usr/bin/vcg-host",
        "--output-dir",
        outputDir,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${fixtureDir}:${process.env.PATH}` },
      },
    );
    assert.equal(result.status, 0, result.stderr);

    const unit = await readFile(
      join(outputDir, "vcg-console-session.service"),
      "utf8",
    );
    assert.doesNotMatch(unit, /%U/);
    assert.match(
      unit,
      new RegExp(
        `^ReadWritePaths=(?:\\S* )*/run/user/${fakeUid}(?: \\S*)*$`,
        "m",
      ),
    );
  } finally {
    await rm(fixtureDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  }
});
