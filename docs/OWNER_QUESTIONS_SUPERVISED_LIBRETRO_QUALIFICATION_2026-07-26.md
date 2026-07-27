# Owner questions: supervised Libretro qualification

Date: 2026-07-26

Status: sixteen unresolved choices; none authorizes execution

These questions freeze the choices that cannot be inferred honestly from the
current software foundations or candidate screen. Safe defaults keep the
campaign blocked and preserve failed evidence.

## LRQ-001: fallback frontend candidate

Which exact fallback Libretro frontend should be screened against RetroArch?

Safe default: select none yet. First compare actively maintained candidates for
both target architectures, licensing, controller-only automation, kiosk
containment, save/state compatibility, package size, and reproducible builds.

## LRQ-002: primary RetroArch revision and build basis

Which exact RetroArch source revision, toolchain, feature set, SDL backend, and
base configuration should become the primary candidate?

Safe default: no moving branch or distribution package family. Require a
source revision and reproducible per-architecture artifacts before execution.

## LRQ-003: first starter-title deep review

Should the first complete rights/package review continue with 2048, pursue
another screened candidate, or create a small first-party title?

Safe default: keep every screened title blocked. A small first-party title is
the schedule-safe fallback, but it still needs explicit code/content/title
licensing, reproducible packages, maintenance, and removal ownership.

## LRQ-004: managed-content conformance fixture

Which rights-cleared fixture should prove the console-managed content path?

Safe default: use an explicitly non-catalog first-party or permissively licensed
fixture with tiny deterministic content. It must never count as the starter
game or become visible in family mode.

## LRQ-005: exact target configurations

Which ordinary x86-64 Linux and Raspberry Pi 5 AArch64 hardware, OS image,
compositor, SDL, audio, display, storage, controller, and power configurations
are the blocking references?

Safe default: do not substitute the Windows development workstation, WSL2, or
an unqualified proxy. Bind the exact received target manifests first.

## LRQ-006: readiness and liveness producer

Which trusted component proves visible focused readiness and continued
responsiveness for each frontend?

Safe default: a host/compositor-owned adapter tied to the exact window and
process scope. Do not treat process start, first frame, a generic heartbeat, or
RetroArch log output as usable interaction.

## LRQ-007: containment and cleanup adapter

Which production service-manager/cgroup and compositor controls own descendant
attachment, anti-escape, termination, empty-scope proof, focus, fullscreen, and
desktop denial?

Safe default: keep target execution blocked until the adapter is selected and
qualified. Configuration-file kiosk settings remain defense in depth only.

## LRQ-008: physical controller sample policy

How many distinct standards-conformant controllers, transports, reconnect
states, and battery/sleep conditions must each frontend/target lane pass?

Safe default: freeze a cross-vendor wired/Bluetooth sample with at least one
sleep/reconnect cycle per device. Preserve zero manual mapping and zero
reserved-action leakage.

## LRQ-009: player assignment and multi-controller scope

Does this first qualification require only one active player, or also prove
ordered multi-controller assignment before I-054/I-055?

Safe default: qualify one active player here and keep multi-player product
claims behind the dedicated two- and four-player campaigns. Still prove that
extra connected controllers cannot steal reserved or gameplay ownership.

## LRQ-010: per-game overrides and family-mode policy

Which core, controller, accessibility, video, and audio overrides are approved,
and what compatibility warning is required before a change?

Safe default: one curated system default, no raw frontend menu in family mode,
and only a closed owner-reviewed override list with explicit save/state
compatibility disclosure.

## LRQ-011: audio/video and performance gates

What p95/worst controller response, input-to-photon latency, audio latency, A/V
sync, frame pacing, dropped-frame, CPU/GPU/RAM, power, thermal, and acoustic
limits apply per target/frontend/workload?

Safe default: freeze them before the first target run. No average, other target,
or lighter title may rescue a failed blocking cell.

## LRQ-012: display enhancement and accessibility profiles

Which shaders, filters, run-ahead, rewind, frame-delay, or accessibility options
may exist outside the no-enhancement baseline?

Safe default: none for qualification. Add only exact, named, independently
tested profiles under the existing display-latency/accessibility policy.

## LRQ-013: save-state compatibility and retention

What save and save-state compatibility promises apply across frontend, core,
title, and package updates, rollbacks, uninstall, reinstall, and migration?

Safe default: healthy updates preserve saves; incompatible states are declared
and refused safely; rollback restores the last-known-good runtime without
silently rewriting data; uninstall asks separately whether to retain saves.

## LRQ-014: suspend/resume and recovery thresholds

What p95/worst suspend/resume and crash/hang recovery times are acceptable, and
which faults require immediate return versus bounded retry?

Safe default: one bounded automatic recovery attempt only when the exact
frontend wrapper is qualified for it; otherwise show truthful failure and a
system-owned Exit/Details path. Never fabricate readiness.

## LRQ-015: evidence retention and independent review

What closed issue taxonomy, retention/deletion schedule, independent sampling,
incident escalation, expiry, and regression policy governs the 3,200 lifecycle
cycles and 3,360 controller trials?

Safe default: retain path-free adverse records and artifact digests, delete any
temporary sensitive capture under a separately approved protocol, and prohibit
free-form logs or post-result exclusions.

## LRQ-016: execution, release, and publication authority

Who may authorize artifact retrieval/build/signing, target installation,
controller/display/power operation, fault injection, rights/trademark review,
security/accessibility review, catalog admission, and publication?

Safe default: these are separate approvals. Completing the technical campaign
does not automatically admit a title, select a fallback, approve redistribution,
or change product support.
