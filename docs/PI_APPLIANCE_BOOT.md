# Raspberry Pi appliance boot

The VCG Console can be installed as the Raspberry Pi's boot-owned TV surface.
After installation and reboot, systemd starts the header-correct loopback server,
waits until that boundary is healthy, replaces the tty1 login prompt with Cage,
and runs the existing native host plus Chromium as one fullscreen application.
The normal desktop is not entered and nobody has to open a browser.

This is the intended production shape, but it is not yet hardware qualification.
It still needs cold-boot, HDMI/CEC, controller-only recovery, crash-loop, power-loss,
thermal, and exact Raspberry Pi OS package testing on the physical target.

## Prepare the Pi

Use the currently pinned 64-bit Raspberry Pi OS Trixie image in
[the day-one guide](PI_DAY_ONE_BRINGUP.md). From the exact checkout, run one
setup command as the non-root account that will own the console:

```sh
scripts/pi/setup-console.sh
```

The setup command installs Cage, Chromium, BlueZ, camera utilities, build tools,
and Debian's rustup package. Because Trixie's OS package is Node.js 20 while the
repository requires Node.js 22 or newer, it installs the SHA-256-pinned official
Node.js 22 ARM64 archive and exact repository-pinned pnpm under `/opt/vcg`
without replacing the OS Node. It then installs the repository-pinned Rust
toolchain, installs frozen JavaScript dependencies, prepares hash-pinned local
assets, builds the web app and native host, runs the full verification suite,
verifies the local browser-security boundary, and installs the boot services.
Pass `--quick` only when intentionally skipping the full typecheck/test gate.
`--dry-run` prints and validates the plan without changing the OS.

## Install boot ownership

The unified setup command enables boot ownership but deliberately does not
reboot without permission. Reboot when ready:

```sh
sudo systemctl reboot
```

Pass `--reboot` to the setup command only when an immediate reboot is intended.
The lower-level `bootstrap.sh` and `install-appliance.sh` commands remain
available for development and recovery.

The installer renders path-specific systemd units, verifies them, adds the
console user to the available `video`, `render`, and `input` device groups, sets
`multi-user.target` as the default, and enables `vcg-console.target`. It does
not uninstall the desktop or reboot without permission.

The installer also installs a Chromium managed policy that grants camera
capture to the exact launcher origin without a prompt and keeps audio capture
disabled (D-046). The fullscreen session has no pointer, so an unanswered
permission prompt would otherwise leave the camera waiting forever.

Granting permission is not sufficient on its own. The session unit runs in its
own mount namespace, and the XDG desktop portal identifies a caller by opening
`/proc/<pid>/root`, which it cannot do across that namespace. Chromium's
portal-based camera path therefore fails, and it does not fall back: device
enumeration never returns and the console waits for a camera that is present
and permitted. The launcher disables that path so Chromium reads V4L2
directly. A session that reports "Waiting for camera permission" indefinitely,
while `navigator.permissions.query` reports `granted`, is this failure
returning.

At the next boot:

1. `vcg-console-server.service` serves only `127.0.0.1:4173`.
2. `vcg-console-session.service` verifies the required headers before display.
3. Cage owns DRM/KMS from tty1 and permits one maximized application.
4. `vcg-host launcher` starts Chromium in fullscreen app mode and owns its
   authenticated loopback host API for the browser lifetime.
5. systemd restarts either process after an unexpected exit.

## Enable the catalog and the retro library

By default the session starts with no catalog and no library, and the launcher
serves metadata only. The signed catalog, its update trust material, and the
retro library are opt-in installer options, so an existing console keeps
booting unchanged until an operator asks for them.

Provision the material first, on the target, as the console account:
`vcg-retro-provision` writes the trust material and the signed catalog, and
`vcg-host retro-provision` commits library generations. The installer expects
the layout those tools produce under one root:

```text
<retro-root>/
├── installed-catalog.json              signed catalog
├── installed-catalog.sig               detached signature bundle
├── packages/                           install root
├── trust/
│   ├── anchors.json
│   ├── accepted-roots/
│   └── protected-state.json
├── retro/{objects,libraries,audit}     library generations
└── staging/retro-imports/retro-import.lock
```

Then reinstall with the retro options:

```sh
sudo scripts/pi/install-appliance.sh --user <console-account> \
  --retro-channel <channel> \
  --retro-profile-registry <absolute-registry-path>
```

`--retro-root` defaults to `<home>/.local/share/vcg`, `--retro-install-root`
to `<retro-root>/packages`, and `--retro-library-root` to `<retro-root>`. Each
can be named explicitly, and `--retro-content-root` is needed only for packages
carrying managed content. `--retro-channel` has no default: the accepted update
root authorizes exactly one channel.

Without `--retro-profile-registry` the console browses the catalog and library
but launches nothing. The registry format is in
[the profile registry contract](PROFILE_REGISTRY.md). Launching a library entry
also requires a connected controller, which the same session's Bluetooth
pairing provides.

The installer refuses to render a unit naming a catalog, signature, install
root, trust file, or library root that is not already there, so a wrong path
fails at install time instead of at the next boot. Adding
`--dry-run --output-dir <path>` still renders for inspection without changing
the operating system.

Saves, states, and the launch replay journal are written under
`/var/lib/vcg-console`, which the session already owns. The provisioned root
stays read-only to the running session.

The launcher requires a trusted-time snapshot, which a systemd `ExecStart=`
line cannot compute, so the session runs
`scripts/pi/start-launcher-with-trusted-time.sh`. It reads the system clock
once and then becomes the launcher. That value is not a protected time source.

The session unit restarts always and has no start limit, so a retro failure
that repeats at every start would loop the television at three-second
intervals. The wrapper prevents that by verifying the material first. With
retro options configured it runs `vcg-host launcher --dry-run` with the same
flags and the same clock reading, which verifies the signed catalog, every
installed package artifact, the update trust material, and the retro library
without changing any of them. On success it starts the launcher with the full
flag set, so a healthy boot verifies twice.

If the pre-flight fails, the wrapper starts the launcher with the retro
options removed. The console reaches the shell, the browser, controller
pairing, and the loopback host API are unaffected, and the catalog view shows
"Signed package catalog unavailable". The retro lane stays disabled until the
next start.

To return to a metadata-only console, reinstall with no `--retro-` option.

## Diagnose and recover

SSH remains the preferred service path. Inspect this boot with:

```sh
systemctl status vcg-console.target vcg-console-server.service vcg-console-session.service
journalctl -b -u vcg-console-server.service -u vcg-console-session.service
```

A console that reaches the shell with no retro lane took the pre-flight
fallback. Read why in the same journal:

```sh
journalctl -b -u vcg-console-session.service | grep -A 20 "Retro pre-flight failed"
```

That heading is followed by the launcher's own refusal and then by the line
naming the repair. Correct the material with `vcg-retro-provision`, or correct
the clock, and reboot; the next start verifies again and keeps the retro lane
if it passes.

To return tty1 to a local login prompt without deleting anything:

```sh
sudo systemctl disable --now vcg-console.target
sudo systemctl start getty@tty1.service
```

To restore desktop boot for diagnosis:

```sh
sudo systemctl disable --now vcg-console.target
sudo systemctl set-default graphical.target
sudo systemctl reboot
```

Reinstalling after a repository move or dependency rebuild safely replaces only
the three VCG-owned units. Use `--no-enable` to render and install units without
changing the boot target, or `--dry-run --output-dir <path>` to inspect rendered
units without changing the operating system.
