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

Use the currently pinned Raspberry Pi OS image in
[the day-one guide](PI_DAY_ONE_BRINGUP.md). Install Cage and Chromium from that
image's configured package repositories, then build the exact checkout:

```sh
sudo apt install cage chromium
scripts/pi/bootstrap.sh --full-verify
```

The bootstrap builds `vcg-host` in release mode and verifies the local server's
browser-security boundary. The installer defaults to that release host and
refuses a missing executable, an unbuilt web app, a missing compositor, or a
root-owned browser session.

## Install boot ownership

From the repository root:

```sh
sudo scripts/pi/install-appliance.sh --user "$USER"
sudo systemctl reboot
```

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
