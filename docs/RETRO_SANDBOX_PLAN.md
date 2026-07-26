# Retro least-privilege sandbox plan

Status: host-derived policy plan implemented; Linux enforcement unimplemented

Last updated: 2026-07-24

RetroArch and libretro cores parse attacker-influenced content and must not
inherit the host service's ambient filesystem, network, input, sensor, or
desktop authority. Configuration lockdown is defense in depth, not a sandbox.

## Implemented plan

Every successfully verified `RetroArchPlan` now carries a separate immutable
`RetroSandboxPlan`. It is derived only after the host has:

- canonicalized the installed package and managed-content roots;
- required regular frontend, core, base-configuration, and optional content
  files beneath their respective roots;
- completely verified each signed SHA-256 identity; and
- derived exact profile/game runtime and persistent storage namespaces.

The sandbox intent exposes only:

- frontend executable, core, base configuration, and optional managed content
  as exact read-only files; and
- the exact session, saves, states, remaps, screenshots, system/firmware, and
  core-options directories as read-write paths.

It does not expose the complete package root, complete content store, source
media, another game/profile namespace, package staging, updates, logs outside
the session, or arbitrary home/system paths.

The capability intent allows display, audio, and mediated gamepad access. It
denies network, camera, microphone, raw input, source media, and desktop
authority. Reserved Home/Back/Pause remain outside the game process.

## Overlap refusal

A verified read-only artifact nested beneath any writable game namespace is
rejected. The check canonicalizes the deepest existing ancestor and reattaches
not-yet-created path suffixes, so Windows extended canonical paths and planned
directories cannot bypass the relationship test.

Mounts are path-sorted and duplicate paths fail. Contentless launches expose
no content-store path.

## Evidence

Four new tests, within 14 focused RetroArch tests, prove:

- exact read-only artifact and read-write namespace selection;
- denial of ambient/network/sensor/source-media/desktop capabilities;
- contentless exclusion of the content store; and
- refusal of managed content nested in a writable save namespace.

The first failing Windows run exposed a canonical-versus-planned path mismatch;
the ancestor-based comparison fix is included in the passing evidence.

## Enforcement boundary

The plan does not currently create a namespace, bind mount, Flatpak or
bubblewrap profile, seccomp filter, cgroup, device broker, or compositor
surface. It does not yet enumerate the read-only system runtime libraries,
GPU/audio/display sockets, or mediated controller endpoints needed for a real
launch. `LaunchSpec` still starts the ordinary child directly.

Production must select a Linux enforcement adapter that consumes this exact
plan and fails before spawn if any mount or capability cannot be applied. The
adapter must close artifact hash-to-exec replacement, contain descendants,
mediate GPU/audio/gamepad access, deny source devices and unrestricted input,
associate one compositor surface, and preserve console-owned recovery.
