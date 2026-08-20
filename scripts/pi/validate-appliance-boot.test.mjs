import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Rendering runs the installer itself rather than reimplementing it, so the
// assertions below are about the bytes an operator would actually install.
const hasBash = spawnSync("bash", ["-c", "exit 0"]).status === 0;
const skipWithoutBash = hasBash ? false : "bash renders the units under test";
// A retro root is embedded in the rendered unit, so the fixture has to be an
// absolute POSIX path, which a Windows temporary directory is not. The Linux
// CI job -- the installer's actual target -- runs these.
const skipWithoutPosixPaths =
  skipWithoutBash ||
  (process.platform === "win32" && "the retro fixture needs a POSIX path");

const repoRoot = hasBash
  ? spawnSync("bash", ["-c", "pwd -P"], { encoding: "utf8" }).stdout.trim()
  : "";

// Every path the installer would otherwise autodetect, so one render is
// reproducible on any machine. The fictitious "vcg" user does not exist on a
// CI runner, so the dry run resolves UID 1000 and this exact home directory.
const RENDER_ARGUMENTS = [
  "--dry-run",
  "--user",
  "vcg",
  "--group",
  "vcg",
  "--home",
  "/home/vcg",
  "--browser",
  "/usr/bin/chromium",
  "--cage",
  "/usr/bin/cage",
  "--host",
  "/usr/bin/vcg-host",
  "--node",
  "/usr/bin/node",
  "--bluetoothctl",
  "/usr/bin/bluetoothctl",
  "--cursor-nudge",
  "/usr/bin/vcg-cursor-nudge",
];

const render = async (extraArguments = []) => {
  const outputDir = await mkdtemp(join(tmpdir(), "vcg-appliance-render-"));
  const result = spawnSync(
    "bash",
    [
      "scripts/pi/install-appliance.sh",
      ...RENDER_ARGUMENTS,
      ...extraArguments,
      "--output-dir",
      outputDir,
    ],
    { encoding: "utf8" },
  );
  return { result, outputDir };
};

const execStartOf = (unit) => unit.match(/^ExecStart=.*$/m)?.[0];

/** Provisions the exact layout `vcg-retro-provision` leaves on the target. */
const provisionedRetroRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "vcg-appliance-retro-"));
  for (const directory of [
    "packages",
    "trust/accepted-roots",
    "retro/objects",
    "retro/libraries",
    "retro/audit",
    "staging/retro-imports",
  ]) {
    await mkdir(join(root, directory), { recursive: true });
  }
  for (const file of [
    "installed-catalog.json",
    "installed-catalog.sig",
    "trust/anchors.json",
    "trust/protected-state.json",
    "staging/retro-imports/retro-import.lock",
  ]) {
    await writeFile(join(root, file), "");
  }
  await writeFile(
    join(root, "profile-registry.json"),
    '{"schemaVersion":1,"profiles":[{"id":"profile-randy"}]}',
  );
  return root;
};

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
  // The launcher's catalog, update trust, and retro library are optional
  // installer configuration, and the trusted-time snapshot they need cannot be
  // rendered, so the installer composes the whole invocation. The exact
  // default bytes are pinned by the render tests below.
  assert.match(unit, /^ExecStart=@CAGE_PATH@ -- @LAUNCHER_COMMAND@$/m);
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
    /launcher_command="\$\{launcher_command\} --cursor-nudge \$\{cursor_nudge_path\}"/,
  );
  // A missing cursor-nudge binary must fail the install before any unit is
  // rendered, exactly like the other release binaries it's listed beside.
  const executableCheckIndex = installer.search(
    /"\$\{bluetoothctl_path\}"\s*\\\n\s*"\$\{cursor_nudge_path\}"/,
  );
  const renderIndex = installer.search(
    /content="\$\{content\/\/@LAUNCHER_COMMAND@\/\$\{launcher_command\}\}"/,
  );
  assert.ok(executableCheckIndex >= 0 && renderIndex > executableCheckIndex);
});

test("the installer pre-grants camera capture to the launcher origin only", async () => {
  const [installer, policyText] = await Promise.all([
    read("./install-appliance.sh"),
    read("./chromium-policies/vcg-console.json"),
  ]);

  // The Cage session has no pointer, so Chromium's camera permission prompt
  // can never be answered and getUserMedia stays pending forever. The managed
  // policy must pre-grant video capture -- and only to the exact origin the
  // session actually opens, so the grant cannot drift from the URL.
  const policy = JSON.parse(policyText);
  const launcherUrl = installer.match(/^launcher_url="([^"]+)"$/m)?.[1];
  assert.ok(launcherUrl, "the installer must declare the launcher --url");
  assert.deepEqual(policy.VideoCaptureAllowedUrls, [new URL(launcherUrl).origin]);
  // D-046: audio capture stays disabled at every boundary by default.
  assert.equal(policy.AudioCaptureAllowed, false);
  assert.deepEqual(
    Object.keys(policy).sort(),
    ["AudioCaptureAllowed", "VideoCaptureAllowedUrls"],
    "the policy must not silently grant anything beyond the camera decision",
  );

  // Raspberry Pi OS has shipped the browser as both chromium and
  // chromium-browser, and each package name reads its own policy directory.
  assert.match(
    installer,
    /for policy_dir in \/etc\/chromium\/policies\/managed \/etc\/chromium-browser\/policies\/managed/,
  );
  // -D because neither policies/managed directory exists until a policy is
  // installed into it.
  assert.match(
    installer,
    /install -D -m 0644 "\$\{repo_root\}\/scripts\/pi\/chromium-policies\/vcg-console\.json"/,
  );
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

// The exact metadata-only launcher invocation the installer has always
// rendered. RL-013 made the catalog, update trust, and retro library opt-in
// precisely so an already-working console keeps booting this command.
const DEFAULT_LAUNCHER_COMMAND =
  "/usr/bin/vcg-host launcher" +
  " --browser /usr/bin/chromium" +
  " --bluetoothctl /usr/bin/bluetoothctl" +
  " --cursor-nudge /usr/bin/vcg-cursor-nudge" +
  " --profile-dir /var/lib/vcg-console/browser-profile" +
  " --url http://127.0.0.1:4173/";

test(
  "with no retro option the rendered session unit is unchanged",
  { skip: skipWithoutBash },
  async () => {
    const template = await read("./systemd/vcg-console-session.service.in");
    const { result, outputDir } = await render();
    try {
      assert.equal(result.status, 0, result.stderr);
      const unit = await readFile(
        join(outputDir, "vcg-console-session.service"),
        "utf8",
      );

      // Byte identity in two halves: the rendered unit is the template with
      // nothing but these substitutions applied, and the one substitution that
      // now carries the launcher invocation expands to the exact command
      // above. Nothing about the catalog, the library, or the trusted-time
      // wrapper can reach a default install.
      const substitutions = {
        "@CONSOLE_USER@": "vcg",
        "@CONSOLE_GROUP@": "vcg",
        "@CONSOLE_HOME@": "/home/vcg",
        "@CONSOLE_UID@": "1000",
        "@REPO_ROOT@": repoRoot,
        "@CAGE_PATH@": "/usr/bin/cage",
        "@LAUNCHER_COMMAND@": DEFAULT_LAUNCHER_COMMAND,
      };
      let expected = template;
      for (const [placeholder, value] of Object.entries(substitutions)) {
        expected = expected.split(placeholder).join(value);
      }
      assert.equal(unit, expected);
      assert.equal(
        execStartOf(unit),
        `ExecStart=/usr/bin/cage -- ${DEFAULT_LAUNCHER_COMMAND}`,
      );
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  },
);

test(
  "the retro options render the whole catalog group, the library, and Bluetooth",
  { skip: skipWithoutPosixPaths },
  async () => {
    const retroRoot = await provisionedRetroRoot();
    const { result, outputDir } = await render([
      "--retro-root",
      retroRoot,
      "--retro-channel",
      "development",
      "--retro-profile-registry",
      join(retroRoot, "profile-registry.json"),
    ]);
    try {
      assert.equal(result.status, 0, result.stderr);
      const unit = await readFile(
        join(outputDir, "vcg-console-session.service"),
        "utf8",
      );

      // A launcher catalog is all or nothing, so a partial group would fail at
      // boot with the TV already showing the session. The whole group,
      // including the library and the retained controller pairing, is pinned
      // here instead. --trusted-unix-seconds is deliberately absent: the
      // wrapper resolves it at start.
      assert.equal(
        execStartOf(unit),
        "ExecStart=/usr/bin/cage --" +
          ` ${repoRoot}/scripts/pi/start-launcher-with-trusted-time.sh` +
          " /usr/bin/vcg-host launcher" +
          " --browser /usr/bin/chromium" +
          " --bluetoothctl /usr/bin/bluetoothctl" +
          " --cursor-nudge /usr/bin/vcg-cursor-nudge" +
          " --profile-dir /var/lib/vcg-console/browser-profile" +
          " --url http://127.0.0.1:4173/" +
          ` --catalog ${retroRoot}/installed-catalog.json` +
          ` --catalog-signature ${retroRoot}/installed-catalog.sig` +
          ` --install-root ${retroRoot}/packages` +
          ` --update-root-store ${retroRoot}/trust/accepted-roots` +
          ` --update-root-anchors ${retroRoot}/trust/anchors.json` +
          ` --update-root-protected-state ${retroRoot}/trust/protected-state.json` +
          " --update-channel development" +
          " --runtime-root /run/vcg-console/retro" +
          " --data-root /var/lib/vcg-console/data/retro" +
          ` --profile-registry ${retroRoot}/profile-registry.json` +
          " --launch-replay-root /var/lib/vcg-console/data/launch-replay" +
          ` --retro-library-root ${retroRoot}`,
      );

      // The session writes only inside its own RuntimeDirectory and
      // StateDirectory, both already writable under ProtectSystem=strict, so
      // configuring retro adds no writable path to the sandbox.
      assert.match(
        unit,
        /^ReadWritePaths=\/var\/lib\/vcg-console \/run\/vcg-console \/run\/user\/1000$/m,
      );
    } finally {
      await rm(outputDir, { recursive: true, force: true });
      await rm(retroRoot, { recursive: true, force: true });
    }
  },
);

test(
  "the installer refuses to name retro material that is not there",
  { skip: skipWithoutPosixPaths },
  async () => {
    const retroRoot = await provisionedRetroRoot();
    // Every path below is named in the rendered unit, and the launcher's
    // catalog is all or nothing, so any one of them missing costs the operator
    // a boot into a crash-looping session instead of an installer error.
    const cases = [
      {
        removed: "installed-catalog.json",
        message: /Retro catalog is not a file/,
      },
      {
        removed: "installed-catalog.sig",
        message: /Retro catalog signature is not a file/,
      },
      { removed: "packages", message: /Retro install root is not a directory/ },
      {
        removed: "trust/accepted-roots",
        message: /Retro accepted root store is not a directory/,
      },
      {
        removed: "trust/anchors.json",
        message: /Retro root anchor set is not a file/,
      },
      {
        removed: "trust/protected-state.json",
        message: /Retro protected state is not a file/,
      },
      {
        removed: "retro/libraries",
        message: /Retro library generation store is not a directory/,
      },
      {
        removed: "staging/retro-imports/retro-import.lock",
        message: /Retro library import lock is not a file/,
      },
    ];

    try {
      for (const { removed, message } of cases) {
        const held = await mkdtemp(join(tmpdir(), "vcg-appliance-held-"));
        const source = join(retroRoot, removed);
        const parked = join(held, "parked");
        await rename(source, parked);
        let rendered;
        try {
          rendered = await render([
            "--retro-root",
            retroRoot,
            "--retro-channel",
            "development",
          ]);
        } finally {
          await rename(parked, source);
          await rm(held, { recursive: true, force: true });
        }
        try {
          const { status, stdout, stderr } = rendered.result;
          assert.equal(status, 1, `${removed}: ${stdout}`);
          assert.match(stderr, message);
          assert.match(stderr, /vcg-retro-provision/);
        } finally {
          await rm(rendered.outputDir, { recursive: true, force: true });
        }
      }

      // Nothing names a channel by default, and an accepted root authorizes
      // exactly one, so the installer must not invent it.
      const { result, outputDir } = await render(["--retro-root", retroRoot]);
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, /requires --retro-channel/);
      await rm(outputDir, { recursive: true, force: true });
    } finally {
      await rm(retroRoot, { recursive: true, force: true });
    }
  },
);

test("the trusted-time wrapper resolves the snapshot without claiming it is protected", async () => {
  const wrapper = await read("./start-launcher-with-trusted-time.sh");

  // A systemd ExecStart= line cannot compute --trusted-unix-seconds, and an
  // install-time value would freeze at the install. The wrapper reads the
  // clock at start, refuses a non-numeric reading, and replaces itself with
  // the launcher so systemd still supervises the real process.
  assert.match(wrapper, /^trusted_unix_seconds="\$\(date \+%s\)"$/m);
  assert.match(wrapper, /^\s*""\|\*\[!0-9\]\*\)$/m);
  assert.match(
    wrapper,
    /^exec "\$\{host\}" "\$@" --trusted-unix-seconds "\$\{trusted_unix_seconds\}"$/m,
  );
  // The repository already records that a CLI-supplied snapshot is not a
  // protected time adapter. The wrapper must not read as if it were one.
  assert.match(wrapper, /not a protected time\n# adapter/);
});

/** The catalog options the wrapper strips, read out of its own case pattern. */
const droppedRetroOptions = (wrapper) => {
  const patterns = wrapper.match(
    /\n(\s*--catalog\|[\s\S]*?)\)\n\s+retro_configured=1\n/,
  )?.[1];
  assert.ok(patterns, "the wrapper must list the options a fallback drops");
  return new Set(patterns.replace(/[\\\s]/g, "").split("|"));
};

test("the wrapper drops every catalog option the installer renders", async () => {
  const [wrapper, installer] = await Promise.all([
    read("./start-launcher-with-trusted-time.sh"),
    read("./install-appliance.sh"),
  ]);

  // A catalog option the installer renders but the wrapper does not strip
  // would make the metadata-only fallback itself fail, because any one of
  // them makes the launcher load the catalog. Adding a --retro- option to the
  // installer must therefore add it here too.
  const retroBlock = installer.slice(
    installer.indexOf('if [ "${retro_requested}" -eq 1 ]; then'),
  );
  const rendered = [
    ...retroBlock.matchAll(/\$\{launcher_command\} (--[a-z-]+)/g),
  ].map((match) => match[1]);
  assert.ok(rendered.length >= 10, "the retro block must render its options");

  const dropped = droppedRetroOptions(wrapper);
  for (const option of rendered) {
    assert.ok(dropped.has(option), `the wrapper keeps ${option} in a fallback`);
  }
  // The wrapper appends the snapshot itself, and the snapshot alone makes the
  // launcher demand the rest of the catalog group.
  assert.ok(dropped.has("--trusted-unix-seconds"));
});

// A stand-in vcg-host that records the argv of each invocation it receives,
// separately for the pre-flight and for the process the wrapper becomes.
const STUB_HOST = [
  "#!/usr/bin/env bash",
  "mode=exec",
  'for argument in "$@"; do',
  '  if [ "${argument}" = "--dry-run" ]; then mode=dry; fi',
  "done",
  "printf '%s\\n' \"$@\" >\"${VCG_STUB_RECORD}.${mode}\"",
  'if [ "${mode}" = "dry" ] && [ "${VCG_STUB_DRY_RUN_STATUS}" != "0" ]; then',
  '  echo "vcg-host: installed artifact digest mismatch for package retro-core" >&2',
  '  exit "${VCG_STUB_DRY_RUN_STATUS}"',
  "fi",
  "",
].join("\n");

// The launcher invocation the installer renders with no --retro- option, and
// the same invocation with the retro group appended.
const METADATA_ONLY_ARGUMENTS = [
  "launcher",
  "--browser",
  "/usr/bin/chromium",
  "--bluetoothctl",
  "/usr/bin/bluetoothctl",
  "--cursor-nudge",
  "/usr/bin/vcg-cursor-nudge",
  "--profile-dir",
  "/var/lib/vcg-console/browser-profile",
  "--url",
  "http://127.0.0.1:4173/",
];
const RETRO_LAUNCHER_ARGUMENTS = [
  ...METADATA_ONLY_ARGUMENTS,
  "--catalog",
  "/opt/vcg/installed-catalog.json",
  "--catalog-signature",
  "/opt/vcg/installed-catalog.sig",
  "--install-root",
  "/opt/vcg/packages",
  "--update-root-store",
  "/opt/vcg/trust/accepted-roots",
  "--update-root-anchors",
  "/opt/vcg/trust/anchors.json",
  "--update-root-protected-state",
  "/opt/vcg/trust/protected-state.json",
  "--update-channel",
  "development",
  "--runtime-root",
  "/run/vcg-console/retro",
  "--data-root",
  "/var/lib/vcg-console/data/retro",
  "--profile-registry",
  "/opt/vcg/profile-registry.json",
  "--launch-replay-root",
  "/var/lib/vcg-console/data/launch-replay",
  "--retro-library-root",
  "/opt/vcg",
];

const runWrapper = async (launcherArguments, dryRunStatus = "0") => {
  const directory = await mkdtemp(join(tmpdir(), "vcg-appliance-wrapper-"));
  const host = join(directory, "vcg-host");
  const record = join(directory, "record");
  await writeFile(host, STUB_HOST, { mode: 0o755 });
  const result = spawnSync(
    "bash",
    ["scripts/pi/start-launcher-with-trusted-time.sh", host, ...launcherArguments],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        VCG_STUB_RECORD: record,
        VCG_STUB_DRY_RUN_STATUS: dryRunStatus,
      },
    },
  );
  const recorded = async (mode) => {
    try {
      const argv = await readFile(`${record}.${mode}`, "utf8");
      return argv.split("\n").slice(0, -1);
    } catch {
      return null;
    }
  };
  const invocations = {
    result,
    preflight: await recorded("dry"),
    executed: await recorded("exec"),
  };
  await rm(directory, { recursive: true, force: true });
  return invocations;
};

test(
  "with no retro option the wrapper runs no pre-flight and prints nothing",
  { skip: skipWithoutBash },
  async () => {
    const { result, preflight, executed } = await runWrapper(
      METADATA_ONLY_ARGUMENTS,
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(preflight, null, "a metadata-only console has nothing to verify");
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.deepEqual(executed.slice(0, -2), METADATA_ONLY_ARGUMENTS);
    assert.equal(executed.at(-2), "--trusted-unix-seconds");
    assert.match(executed.at(-1), /^[0-9]+$/);
  },
);

test(
  "a passing pre-flight becomes the launcher with the whole retro flag set",
  { skip: skipWithoutBash },
  async () => {
    const { result, preflight, executed } = await runWrapper(
      RETRO_LAUNCHER_ARGUMENTS,
    );

    // The pre-flight is the rendered command plus --dry-run, so it verifies
    // the signed catalog, every package artifact, and the library that the
    // real start is about to load -- not a parse check of a shorter command.
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(preflight.slice(0, -3), RETRO_LAUNCHER_ARGUMENTS);
    assert.equal(preflight.at(-3), "--dry-run");
    assert.deepEqual(executed.slice(0, -2), RETRO_LAUNCHER_ARGUMENTS);
    assert.equal(executed.at(-2), "--trusted-unix-seconds");
    // One clock reading serves both, so the pre-flight cannot pass on a
    // different snapshot than the one the launcher is given.
    assert.equal(executed.at(-1), preflight.at(-1));
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  },
);

test(
  "a failing pre-flight becomes the launcher with the metadata-only flag set",
  { skip: skipWithoutBash },
  async () => {
    const { result, preflight, executed } = await runWrapper(
      RETRO_LAUNCHER_ARGUMENTS,
      "1",
    );

    // The console still reaches the shell instead of restarting every three
    // seconds, and the flags that have nothing to do with the retro material
    // survive: the browser, controller pairing, the cursor nudge, the profile
    // directory, and the URL.
    assert.equal(result.status, 0, result.stderr);
    assert.ok(preflight, "the pre-flight must run before the fallback");
    assert.deepEqual(executed, METADATA_ONLY_ARGUMENTS);
    for (const option of [
      "--browser",
      "--bluetoothctl",
      "--cursor-nudge",
      "--profile-dir",
      "--url",
    ]) {
      assert.ok(executed.includes(option), `${option} must survive a fallback`);
    }
    assert.ok(!executed.includes("--trusted-unix-seconds"));

    // The downgrade is silent on the television, so the reason has to reach
    // the journal with the recovery path named.
    const journal = `${result.stdout}${result.stderr}`;
    assert.match(journal, /installed artifact digest mismatch for package retro-core/);
    assert.match(journal, /retro lane is disabled for this boot/);
    assert.match(journal, /vcg-retro-provision/);
  },
);
