# Owner questions: Retro sandbox enforcement

Date: 2026-07-24

The repository now derives an exact least-privilege plan but does not select
or claim a production Linux enforcement mechanism.

## RS-001: enforcement adapter

Should the first target use bubblewrap, Flatpak, systemd sandboxing, a dedicated
user/namespace service, or another reviewed combination on Pi and ordinary
x86-64 Linux?

Safe default: require one adapter that works on both tiers and fails closed
before spawn; do not maintain a silently weaker Pi path.

## RS-002: runtime library surface

Which exact dynamic loader, shared libraries, locale/font data, GPU drivers,
and read-only system files are necessary for the selected RetroArch build?

Safe default: derive a versioned allowlist from the reproducible package and
deny the rest of the host root.

## RS-003: GPU, audio, display, and gamepad mediation

Which device nodes, sockets, portals, groups, and broker APIs are required, and
how are raw keyboard/mouse/controller access and other users' sessions denied?

Safe default: broker semantic controller input, one compositor surface, and
only the minimum audio/GPU endpoints; expose no raw host input devices.

## RS-004: network exceptions

Does any approved retro feature require network access for achievements,
multiplayer, metadata, updates, or debugging?

Safe default: none. Updates and metadata remain host services outside the
emulator; achievements and remote play stay disabled until separately
threat-modeled.

## RS-005: firmware mounting

How are exact ready firmware objects mounted read-only without exposing the
complete shared firmware store or allowing a core to enumerate unrelated
systems?

Safe default: launch-specific bind mounts for only the exact policy-bound
opaque ID/hash set.

## RS-006: descendant and crash cleanup

Which cgroup/service-manager boundary proves every descendant, namespace,
mount, socket, temporary file, and device grant is removed after normal exit,
crash, watchdog termination, or host restart?

Safe default: one transient service/cgroup per launch with external cleanup
acknowledgement before replay or another launch.
