# Retro core and content deployment

Status: recipes, staging, signed packages, and library provisioning are
implemented and exercised on a Raspberry Pi 5; no qualified launch

Last updated: 2026-08-20

How to get libretro cores and your own ROM collection onto a Raspberry Pi 5
target. Nothing here is a qualification record: none of it proves a core loads a
title, that input reaches it, or that saves persist.

## Before you start

On your workstation: this checkout, Node.js 22.12 or newer, and `ssh`. On the
Pi: 64-bit Raspberry Pi OS Trixie, this checkout, and an account you can reach
over `ssh`.

You supply your own ROMs. This project ships no content and no emulator code.

## Getting started

**1. Set up the console** — on the Pi, once:

```sh
scripts/pi/setup-console.sh
```

**2. Build the cores** — on the Pi, from the repository root:

```sh
scripts/pi/build-retro-cores.sh
```

Each core is fetched from a pinned upstream archive and refused on any digest
mismatch. Results land in `build/retro-cores/`.

**3. Build the frontend** — on the Pi:

```sh
sudo apt install -y libsdl2-dev libasound2-dev libwayland-dev wayland-protocols
scripts/pi/build-retro-frontend.sh
```

**4. Stage your collection** — on your workstation:

```sh
node scripts/pi/stage-retro-content.mjs \
  --source "/path/to/your/NES roms" \
  --system nes \
  --core mesen
```

Every ROM is hashed and written to `build/retro-content/<system>/` as
`objects/<system>-content-<sha256><extension>`. Read the `skipped.tsv` it writes
before moving on.

**5. Deploy and verify** — on your workstation:

```sh
scripts/pi/deploy-retro-content.sh \
  --payload build/retro-content/nes \
  --target pi-user@raspberrypi.local
```

The Pi recomputes every digest itself, so a damaged transfer fails here rather
than at launch.

## Where this stops

Verified content and built cores on the target are not yet a playable console.
Two further steps are implemented and documented below: signing a catalog and
a system policy with `vcg-retro-provision`, and committing a payload into the
library with `vcg-host retro-provision`. A console reaches them at boot only
when the installer is run with its opt-in retro options; see
[the appliance boot guide](PI_APPLIANCE_BOOT.md).

Nothing above is qualification. No controller, audio, video, save, timing, or
recovery evidence exists on any target, and the reserved-input router is
started by the diagnostic `vcg-host retroarch` path rather than by the
launcher, so a launcher-driven session has neither the controller requirement
nor a host-owned exit. The gates remain the ones in
[the supervised frontend campaign](SUPERVISED_LIBRETRO_FRONTEND_QUALIFICATION_CAMPAIGN_2026-07-26.md).

## FAQ

**My ROMs are for Sega, not NES or SNES.**
Only `nes` and `snes` have built-in extension tables. Name the extensions
yourself for anything else:

```sh
--system genesis --core genesis-plus-gx --extensions .md,.gen,.smd,.bin,.sms,.gg
```

**My ROMs are inside ZIP files.**
Supported, as long as each archive holds exactly one ROM. The payload is
extracted and hashed; the container is not. You need a ZIP-capable reader —
`C:\Windows\System32\tar.exe` on Windows, or `bsdtar`/`unzip` elsewhere. Plain
GNU `tar` cannot read ZIP, and the tool says so rather than failing obscurely.

**Some of my files were skipped.**
Read `build/retro-content/<system>/skipped.tsv`, which gives the exact reason
per file. The common ones are byte-identical duplicates under different
filenames, archives holding more than one file, and archives whose payload has
no file extension. Each needs your decision, so none of them are guessed at.

**I don't have `rsync`.**
Nothing to do. The deploy script streams a tar over the ssh connection you
already have. Only `--delete` needs real `rsync`.

**Do my ROMs end up in git?**
No. Staging writes only to `build/`, which is ignored. Deployment goes straight
from there to your target.

**Can I put the content somewhere else on the Pi?**
Yes, `--remote-root`. The default is `$HOME/vcg-content`, expanded by the
target's shell.

**Which cores may I redistribute?**
`mesen` (D-190) and `fceumm` (D-188) are GPL and permit commercial use.
`snes9x` (D-186) and `genesis-plus-gx` (D-189) forbid it. Building for your own
device is inside every one of those grants. [The decision
register](DECISIONS.md) has the exact terms and the component attribution each
one requires.

**Can I build the cores on my workstation instead?**
On x86-64 Linux, yes: `scripts/pi/build-retro-cores.sh --cross-aarch64`. The
`snes9x` recipe additionally needs an arm64 `zlib1g-dev` for a cross build, and
skips itself with an explanation when that is missing.

## Reference

- [RetroArch integration contract](RETROARCH_INTEGRATION.md) — launch, storage,
  and configuration boundaries
- [Signed installed-package catalog](INSTALLED_PACKAGE_CATALOG.md) — how the
  launcher is meant to discover installed games
- [Shared retro import contract](RETRO_IMPORT_CONTRACT.md) — the USB/LAN import
  path, which staging deliberately does not impersonate
- [Raspberry Pi appliance boot](PI_APPLIANCE_BOOT.md) — boot ownership and
  recovery
- [Decision register](DECISIONS.md) — D-185 through D-190 fix the retro boundary

### Recorded build observations

Native aarch64 runs on a Pi 5 target produced:

| Artifact | SHA-256 |
| --- | --- |
| retroarch 1.22.2 | `dcba0282d627ac90538d789b9471bcd0cdd7de3d9b1dea4e2d5a2f8347b14f6a` |
| mesen | `184ac03e62a01bf51f888c65daa7ce5bde253887a607681aef9a9a0a5c16449b` |
| snes9x | `1341d712c577a4d8c16fe869b33412392fac91a1c7fe8752b6ba04f881ccc0d7` |
| fceumm | `3e70951d587b7ddf55825331c822bf6b9eb6e81d076e9376dddce63114b2a8f4` |
| genesis-plus-gx | `f3817449115da2d3e59e4863d0bf8e0f1611bbf589280cef4395b77fe814adca` |

These record one observed build on one machine. The toolchain, sysroot, and
package snapshot are not pinned, so they are not reproducible-build evidence.

### What staging deliberately does not write

Staging writes no native installed-library generation. Its manifest records
what actually happened — `operator-staged-local-collection` — rather than
fabricating the session evidence a USB or paired-LAN import carries.

Committing a payload into the library is a separate, privileged step on the
target. The system-to-core mapping and the capacity ceilings are a **signed**
policy rather than command-line claims, so they are tamper-evident and adding a
system means re-signing.

Write the policy document, then have `vcg-retro-provision` sign it with the
trust material it already owns:

```sh
vcg-retro-provision --state-root <state> --install-root <state>/packages \
  --runtime-root <state>/run --data-root <state>/data \
  --channel <channel> --target aarch64-linux \
  --packages <state>/packages.json --expires-unix-seconds <seconds> \
  --system-policy <state>/policy.json
```

It prints the signed document and bundle paths. Commit a payload with those:

```sh
vcg-host retro-provision --writable-root <state>/data --payload <payload> \
  --system-policy <state>/retro-system-policy.json \
  --system-policy-signature <state>/retro-system-policy.sig \
  --update-root-store <state>/trust/accepted-roots \
  --update-root-anchors <state>/trust/anchors.json \
  --update-root-protected-state <state>/trust/protected-state.json \
  --update-channel <channel> --trusted-unix-seconds <seconds> \
  --reserve-bytes 268435456
```

It verifies the policy before touching the filesystem, then recomputes every
content digest itself rather than trusting the staged manifest, and commits
entries under an `operator-provisioned` transport that records no session, no
entitlement acknowledgement, and no scan result, because none of those exist
here. Add `--dry-run` to verify a payload without committing it.
[The import contract](RETRO_IMPORT_CONTRACT.md) states exactly what such an
entry does and does not carry. A committed generation reaches the shell through
the host's paged library endpoint, which the launcher serves when it is started
with `--retro-library-root`; the installer passes that only when its opt-in
retro options are supplied.
