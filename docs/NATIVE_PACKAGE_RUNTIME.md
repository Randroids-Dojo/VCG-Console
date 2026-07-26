# Native package runtime adapter

Last updated: 2026-07-24

This document defines the implemented signed native-package adapter. It extends
the installed-package, candidate-health, and launch-lifecycle pipeline beyond
Libretro without claiming that an ordinary child process is a production
sandbox.

## Signed authority

A native installed-catalog entry has `runtime: "native"` and exactly one
runtime-specific record:

```json
{
  "id": "sample-native",
  "version": "1.0.0",
  "qualification": "qualified",
  "runtime": "native",
  "manifest": {
    "path": "packages/sample-native/vcg-game.json",
    "sha256": "<64 lowercase hex>"
  },
  "native": {
    "executable": {
      "path": "packages/sample-native/game",
      "sha256": "<64 lowercase hex>"
    }
  }
}
```

The catalog is the executable authority. The public manifest remains the
signed identity and health-policy document; it cannot introduce a program,
argument, working directory, environment name, writable path, or sandbox
permission. A native record containing a Libretro record, a Libretro record
containing a native record, or a runtime missing its matching record fails
closed.

At resolution and planning time, the host:

1. re-hashes the bound manifest and requires exact schema, ID, version,
   `native` runtime, `qualified` status, and bounded launch-health policy;
2. resolves the executable beneath the canonical host-selected install root;
3. requires a canonical regular file and hashes its complete bytes against the
   signed catalog digest;
4. creates a direct `LaunchSpec` with no shell and no package-controlled
   arguments;
5. derives the working directory from the executable's installed parent;
6. supplies only host-derived `VCG_GAME_ID`, `VCG_PROFILE_ID`,
   `VCG_RUNTIME_ROOT`, and `VCG_DATA_ROOT` additions.

The current generic process layer inherits the host service environment. That
is an explicit qualification gap, not permission for a package to add or
select environment variables.

## Storage

The adapter derives, but does not accept from the package, these namespaces:

```text
<runtime-root>/games/<game-id>/profiles/<profile-id>/native/
  cache/
  logs/

<data-root>/games/<game-id>/profiles/<profile-id>/native/saves/
```

The runtime and data roots must be distinct and non-overlapping. Preparation
creates those directories with private mode on Unix. Candidate
health replaces both roots with a transaction/game-scoped ephemeral root, so a
candidate cannot read or mutate the player's intended native data through the
paths supplied by this adapter. The production sandbox must independently make
the installed package read-only and expose only the intended writable data.

## Shared health and lifecycle path

`PackageLaunchPlan` is the common runtime boundary for Libretro and native
packages. Package-generation health, normal authenticated launch, and
host-selected watchdog preparation all call that same dispatcher. This avoids
having promotion test one invocation while live launch executes another.

Signed `process` health means only that the direct child survives the complete
signed observation window. Signed `explicit-ready` means only that a qualified
producer wrote the expected bounded token in ephemeral storage. Neither proves
a visible, focused, responsive, controllable, or contained game window.
Watchdog heartbeat is also runtime liveness rather than compositor readiness.

## Process-only boundary

This adapter is deliberately **process-only**. It does not currently:

- create a user, namespace, container, Flatpak/bubblewrap profile, seccomp
  filter, cgroup, or mandatory-access-control policy;
- restrict filesystem traversal outside the supplied paths;
- filter network, camera, microphone, input, GPU, audio, display, or other
  device access;
- clear or qualify the inherited host environment;
- own escaped descendants after the direct child exits;
- associate a process with one compositor surface or prove window readiness;
- enforce global Home, Back, Pause, focus, fullscreen, or input ownership;
- close the hash-to-spawn path replacement interval with an immutable mount or
  descriptor-bound execution.

Consequently, a catalog entry may exercise the adapter in desk tests but must
not be described as target-qualified or safe for hostile native code. Family
mode requires the target-specific sandbox, compositor, input, service-manager,
immutable-package, and hardware evidence tracked by I-094, I-109, I-141, and
I-209.

## Evidence

Rust tests cover native catalog resolution, runtime-record confusion, missing
records, manifest runtime misbinding, executable tamper and install-root
escape, unsafe intent/storage inputs, direct no-argument planning, private
storage creation, ephemeral candidate-health roots, and shared live/watchdog
preparation. Existing lifecycle and watchdog tests continue to cover the
runtime-independent state machine, cancellation, retry, durable replay, and
generation protection.

The remaining product selections are recorded in
[the native-runtime owner questions](OWNER_QUESTIONS_NATIVE_RUNTIME_2026-07-24.md).
