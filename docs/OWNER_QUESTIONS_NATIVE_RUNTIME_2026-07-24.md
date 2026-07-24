# Owner questions: native runtime qualification

Last updated: 2026-07-24

No answer here blocks the process-only adapter. The safe default is to keep
native packages unqualified for family mode until the selected target adapters
and evidence exist.

## Q-128: production sandbox mechanism

Which target-owned sandbox should launch native/Godot packages on Raspberry Pi
OS and ordinary x86-64 Linux: a systemd service plus namespaces and seccomp,
bubblewrap, Flatpak, or another maintained mechanism?

Safe default: select no mechanism by assumption. Require a read-only package,
one per-game writable namespace, no ambient home/profile access, descendant
cgroup ownership, and explicit device/network grants. Qualify the exact
mechanism on both reference architectures with hostile fixtures.

## Q-129: inherited environment and runtime arguments

Which environment variables and fixed host arguments do qualified native
runtimes require for Wayland/display, PipeWire/audio, locale, graphics, and
diagnostics?

Safe default: packages cannot declare arbitrary names, values, or arguments.
Build a host-owned allowlist per qualified runtime/target, scrub secrets and
developer/session credentials, and version any future signed fixed-argument
contract instead of interpreting a shell command.

## Q-130: device and network grants

Which native package classes may access gamepads, GPU, audio, camera, Motion
transport, microphone, raw input, USB, or network?

Safe default: deny camera, microphone, raw devices, USB, and network. Grant
only the narrow display/audio/controller paths required by a qualified sample;
Motion uses its capability-filtered service rather than camera ownership.

## Q-131: compositor readiness and global recovery

What trusted compositor/service-manager event proves that the expected native
surface is visible, focused, and associated with the owned process group, and
how are Home/Back/Pause enforced outside the game?

Safe default: process survival, an application-written ready token, and a
heartbeat are not readiness. Keep the launcher loading state until a trusted
surface event arrives, reserve recovery input above the game, and require
bounded return after crash, hang, escaped descendants, compositor failure, and
host restart.
