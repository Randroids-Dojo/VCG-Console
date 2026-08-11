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

At the next boot:

1. `vcg-console-server.service` serves only `127.0.0.1:4173`.
2. `vcg-console-session.service` verifies the required headers before display.
3. Cage owns DRM/KMS from tty1 and permits one maximized application.
4. `vcg-host launcher` starts Chromium in fullscreen app mode and owns its
   authenticated loopback host API for the browser lifetime.
5. systemd restarts either process after an unexpected exit.

## Diagnose and recover

SSH remains the preferred service path. Inspect this boot with:

```sh
systemctl status vcg-console.target vcg-console-server.service vcg-console-session.service
journalctl -b -u vcg-console-server.service -u vcg-console-session.service
```

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
