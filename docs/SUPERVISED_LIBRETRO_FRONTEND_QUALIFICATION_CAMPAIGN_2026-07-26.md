# Supervised Libretro frontend qualification campaign

Status: blocked zero-result plan

Date: 2026-07-26

Scope: I-122, I-123 and I-198

The canonical artifact is
[`supervised-libretro-frontend-qualification-plan-v1.json`](../benchmarks/libretro/supervised-libretro-frontend-qualification-plan-v1.json).
It converts the remaining supervised RetroArch and fallback-frontend work into
one closed, source-bound, cross-tier campaign. It does not claim that a
frontend, core, title, package, controller, target, save path, compositor, or
recovery path has qualified.

## Why this plan is needed

The repository already has meaningful software foundations:

- a strict `runtime: "libretro"` manifest contract;
- direct no-shell frontend invocation with exact artifact hashing;
- generated kiosk-oriented configuration and separated runtime/save/state/
  remap namespaces;
- signed installed-package resolution and bounded launch intent;
- controller mapping, reserved-action, save-lifecycle, and local-package
  contracts; and
- a six-title source screen whose admitted count is zero.

Those facts are not target evidence. They do not establish that RetroArch or a
fallback frontend can be packaged, contained, controlled, heard, displayed,
updated, recovered, or removed safely on either reference architecture. The
unverified 2048 manifest is especially not a launchable or rights-approved
title merely because its source candidate is small and contentless.

## Required independent lanes

Two frontend roles are blocking:

1. `primary-retroarch-required`, the D-096 primary; and
2. `fallback-libretro-frontend-required`, whose exact candidate remains open.

Both must pass independently on:

- ordinary x86-64 Linux; and
- the Raspberry Pi 5 lower-cost AArch64 reference.

Both must also pass two workload roles:

- one fully rights-cleared starter title suitable for the public starter
  catalog; and
- one rights-cleared, console-managed-content conformance fixture kept in a
  hidden developer namespace.

The fixture proves the managed-content path even if the eventual starter title
uses contentless `Start Core`. It cannot count as the promised starter game.
The starter title cannot make the managed-content path disappear.

No fallback frontend or starter title is selected by this plan. The current
2048, Dinothawr, Lutro, Mr.Boom, and sample candidates remain exactly as the
existing screen classified them.

## Lifecycle matrix

The campaign crosses:

- 2 frontend roles;
- 2 target roles;
- 2 workload roles;
- 20 lifecycle scenarios; and
- 20 valid cycles per cell.

That yields 160 blocking cells and 3,200 required lifecycle cycles. Every
failed, invalid, interrupted, retried, rolled-back, and pre-repair attempt stays
visible. No frontend, target, workload, scenario, cycle, or aggregate may
rescue another.

The twenty scenarios cover:

1. reproducible signed frontend/core/title/config packaging and installation;
2. cold launch, branded loading, exact readiness, and usable input;
3. one-action `Start Core` or content start without a raw frontend menu detour;
4. curated controller defaults, glyphs, and player assignment;
5. system-owned Home, pause overlay, and exact resume;
6. system-owned Back/exit, cleanup, and branded return;
7. save write, clean restart, and restore;
8. save-state creation/load, version binding, and corruption refusal;
9. approved per-game core/controller/accessibility overrides;
10. family-mode menu, settings, core, content, and filesystem containment;
11. offline updater, achievement, command-interface, and network denial;
12. audio/video sync, latency, frame pacing, and baseline feature state;
13. compositor focus/fullscreen/window/descendant/desktop containment;
14. crash detection, descendant cleanup, and branded return;
15. hang/readiness loss, forced cleanup, and branded return;
16. signed update, health, save preservation, and generation switching;
17. rollback, save/state compatibility, and last-known-good restoration;
18. uninstall, explicit save disposition, no leftovers, and clean reinstall;
19. suspend/resume audio, video, input, focus, save, and runtime continuity; and
20. refusal of missing, tampered, or incompatible frontend/core/content/BIOS/
    configuration artifacts.

Readiness means a visible, focused surface that responds to the intended
physical controller with the correct recipient. Process start, a first frame,
window existence, frontend self-report, or a heartbeat alone cannot prove it.

## Controller matrix

The plan fixes 21 actions: the sixteen declared RetroPad gameplay buttons plus
system Home, Back, Pause, Resume, and Exit confirmation. Across both frontends,
both targets, and both workloads, this creates 168 blocking action cells and
3,360 physical action trials at twenty trials per cell.

Every trial requires independent physical-source, canonical-mapping,
recipient, game-event, and system-event oracles. A supported standards-
conformant controller requires zero manual mapping. Home, Back, Pause, Resume,
and Exit must never reach the frontend, core, or content.

## Fixed gates

The campaign accepts zero:

- unsigned, unhashed, unlicensed, unreviewed, or nonreproducible artifacts;
- unexpected network, updater, achievement, telemetry, or command-interface
  attempts;
- desktop, shell, arbitrary filesystem, source-media, raw-menu, arbitrary-core,
  or arbitrary-content exposure;
- escaped, unreaped, or unaccounted descendants;
- cross-game or cross-profile package/content/save/state/remap/cache/log access;
- save/state loss, corruption, rollback regression, or wrong-generation use;
- missed, duplicated, stuck, misrouted, wrong-player, or wrongly mapped input;
- system-reserved actions delivered to the game lane;
- keyboard, mouse, shell, operator, hidden setup, manual core selection, or
  manual mapping recovery; and
- false Ready, Healthy, Saved, Recovered, Updated, Rolled Back, Uninstalled, or
  success claims.

Visible feedback remains bounded at 250 ms. Local launch to visible, focused,
controller-usable interaction remains bounded at 15 seconds. The current
no-enhancement baseline keeps shaders, run-ahead, preemptive frames, rewind,
frame delay, hard GPU sync, and threaded video disabled. Any later accessible
profile is a separately approved exact policy and cannot silently alter this
baseline.

Controller response, input-to-photon, audio latency, A/V sync, frame pacing,
resource, power, recovery, suspend/resume, save-state, controller-sample,
override, retention, and issue gates remain null. They must be frozen before
execution, not selected after seeing results.

## Rights, package, save, and lifecycle boundaries

Every frontend, core, title, content item, BIOS item, base configuration, and
controller profile requires exact source/version, architecture, license,
artifact digest, signed package, and read-back identity. A filename, family,
version label, candidate label, or candidate-screen entry is not identity or
authority.

The starter title separately needs code, content, asset, title/trademark,
attribution, age/content, maintenance, update-owner, and removal closure. A
technical pass cannot approve those product decisions.

Save, state, remap, core-option, screenshot, system, cache, log, runtime, game,
profile, and package-generation scopes remain distinct. Updates and rollbacks
must preserve compatible saves and declare state compatibility. Uninstall must
use controller-confirmed save disposition and leave no unexplained artifacts.
Profile deletion, factory reset, package removal, and game uninstall cannot be
collapsed into one operation.

## Evidence and authority

Accepted evidence is path-free and closed-vocabulary: opaque labels, counts,
timings, metrics, digests, categories, and dispositions. It excludes ROM,
content, BIOS, save, state, remap, screenshot, audio/video, or memory bytes;
paths, commands, arguments, process IDs, host/user identities; profile display
names, portraits, body data, credentials, and stable controller identifiers;
and free-form logs.

This plan grants no authority to download or check out sources, build or sign
packages, install software, select a title or fallback frontend, operate a
target/controller/display/audio/network/power path, mutate persistent data,
inject faults, approve rights/security/accessibility/release conclusions, or
publish/distribute/admit anything.

Sixteen blockers remain. The owner and engineering choices are recorded in
[`OWNER_QUESTIONS_SUPERVISED_LIBRETRO_QUALIFICATION_2026-07-26.md`](OWNER_QUESTIONS_SUPERVISED_LIBRETRO_QUALIFICATION_2026-07-26.md).

## Verification

```sh
pnpm validate:supervised-libretro-qualification
```

The validator checks normalized source provenance, the closed schema, exact
frontend/target/workload/scenario/action identities, matrix arithmetic, fixed
and open gates, rights/package/save/authority/data boundaries, blockers,
canonical JSON, strict UTF-8, and parser limits.
