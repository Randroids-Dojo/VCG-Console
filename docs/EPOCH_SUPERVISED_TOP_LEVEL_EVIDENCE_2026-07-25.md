# Epoch supervised top-level evidence successor

Evidence date: 2026-07-25

Status: current load-probe supervisor provenance restored in v3; I-090 remains
complete only at the framing-mode boundary.

## Result

The v3 live Windows x64 run reproduced the narrow Epoch top-level-load result
after the live hosted runner began requiring a separate explicit marker.
Installed Chrome loaded the exact reviewed HTTPS entrypoint as the sole
supervised top-level page, reached `document.readyState=complete`, exited
cleanly, and left no ephemeral profile.

The health request used the current production supervisor contract: a
bodyless credential-free `GET`, `no-store`, no referrer, manual redirects, a
fixed health `Accept` value, and an unread canceled response body. The
observation therefore binds the current privacy-hardened supervisor source
rather than treating either earlier source hash as current. The probe remains
load-only and does not claim Epoch emitted the new game-readiness marker.

## Successor relationship

The authoritative current record is
`benchmarks/hosted-browser/epoch-top-level-windows-v3.json`. The original
`epoch-top-level-windows-v1.json` and privacy-safe-health successor
`epoch-top-level-windows-v2.json` remain immutable historical observations.

The v3 generator and validator retain the v1 closed schema and claim boundary:

- supervised top-level load verified: yes;
- console-origin framing supported: no;
- catalog playability verified: no;
- controller exit verified: no; and
- reserved Home/Back verified: no.

The record claims one HTTP success and one top-level load with zero play,
controller, or participant tests. It does not promote transport health or
document load into gameplay readiness.

## Verification

Run the offline validator and mutation suite:

```sh
pnpm validate:epoch-top-level
```

The live generator is intentionally frozen to this evidence date:

```sh
pnpm exec tsx scripts/generate-epoch-top-level-evidence.mjs
```

Any later observation requires another versioned successor rather than
rewriting v1, v2, or v3.

## Remaining limits

This is still one Windows development-host observation. It does not establish
controller input, audio, fullscreen, service-worker or storage behavior,
authentication, offline recovery, compositor-owned Home/Back, target Linux
readiness, or catalog qualification. The privacy-safe HTTP health boundary is
only one part of I-099; local-web, native, Godot, Libretro, launcher
projection, cadence, and target evidence remain open.
