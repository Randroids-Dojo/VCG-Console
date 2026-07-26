# Owner questions: kiosk compositor comparison

Date: 2026-07-26
Investigation: I-092
Status: questions only; no download, build, target, network, controller, or fault operation is authorized

## I092-001 — Exact target tuples

Which exact Pi and ordinary x86 hardware, firmware, image, kernel, GPU/display
driver, display mode, audio route, input stack, storage, network, power policy,
browser dependencies, and clock define each required target? Is the optional
Steam Machine row included now or deferred?

Safe default: no target tuple is selected. Windows, WSL, SteamOS, a nested
desktop run, or one required target cannot qualify another.

## I092-002 — Cage build and session

Which exact Cage revision or release, wlroots/xkbcommon/Wayland/XWayland package
closure, compiler flags, signatures, image packages, nested-versus-TTY mode,
KMS/DRM seat ownership, service unit, environment allowlist, and invocation are
approved for each architecture?

Safe default: the observed upstream revision is a source-screen input only. No
download, build, package, XWayland support, AArch64 support, or target session is
selected or authorized.

## I092-003 — Gamescope build and session

Which exact Gamescope revision or release, submodules, Mesa/Vulkan/DRM/XWayland
and driver closure, compiler flags, signatures, nested-versus-embedded mode,
resolution/refresh/scaling policy, screenshot/grab disablement, service unit,
environment allowlist, and invocation are approved for each architecture?

Safe default: the observed upstream revision is not selected. Gamescope's
source description and SteamOS use do not qualify the VCG browser session.

## I092-004 — Wrapper/base-compositor control

Which exact base compositor, native VCG wrapper, service scope, privilege
boundary, focus/window observer, reserved-input producer, descendant owner, and
session invocation define the third route? Is it a shipping candidate or a
comparison control only?

Safe default: the current desk supervisor is not a compositor. The control may
not inherit containment, focus, readiness, or recovery authority from app mode,
a desktop, or the child browser.

## I092-005 — Chromium and wrapper policy

Which exact Chromium build, update channel, package source, signed wrapper,
admission binding, CDP version/policy, origin allowlist, redirect policy,
permissions, profile/cache/service-worker lifecycle, readiness contract,
liveness timings, renderer policy, and browser flags are frozen across routes?

Safe default: no moving browser channel or flag list is accepted. App/kiosk
mode, a fresh profile, wrapper echo, or process survival cannot qualify visible
focused containment or recovery.

## I092-006 — Workloads, rights, and network state

Which exact local artifacts and hosted deployments represent the controlled
fixture, obstacle workload, VibeBots, Mi Casa Es Su Casa, Determined, and Epoch?
What rights/admission records, interactions, login/service state, expected
origins, offline behavior, cache state, and dependency health are frozen?

Safe default: no package or hosted operation is authorized. One workload or
route cannot rescue another, and network-required evidence cannot become
offline qualification.

## I092-007 — Controller, reserved actions, focus, and return

Which exact controller and recovery-remote samples, mappings, firmware,
transports, privileged Home/Back/forced-exit bindings, focus policy, input
revocation order, launcher return surface, resume behavior, and same-controller
confirmation are required?

Safe default: browser callbacks, keyboard Escape, game menus, Steam overlay,
synthetic input, or the current desk mapping cannot own recovery. I-091's open
Home and forced-exit semantics remain open here.

## I092-008 — Hostile harness and safety

How are fullscreen, pointer capture, focus theft, popup/navigation/download and
permission attempts, hangs, renderer/browser/compositor exits, network stalls,
controller storms, profile corruption, audio loss, and display hotplug created
repeatably without escaping processes, corrupting unrelated data, damaging the
display/storage, or trapping the operator? What stop, cleanup, preservation,
watchdog, and power limits apply?

Safe default: no hostile scenario or target fault is authorized until its exact
harness, containment, stop, cleanup, and safety protocol is frozen.

## I092-009 — Independent oracles and clocks

What trusted producers prove physical input, pre-game reserved delivery, zero
game delivery, compositor surface generation, visibility, focus, ordinary
input, origin/navigation, permission and target counts, process/session/surface
ownership, storage isolation, audio/video/display continuity, network state,
resources, recovery, and monotonic timing?

Safe default: wrapper responses, page UI, compositor logs, process survival,
screenshots, synthetic input, or operator observation cannot independently
prove the complete state.

## I092-010 — Schedule, gates, ranking, and maintenance review

Who freezes the counterbalanced 12,960-cycle and 108-soak schedule, warmups,
invalid-run handling, p99/worst launch and recovery deadlines, FPS/frame-time,
audio, memory, power, acoustics, profile growth, physical sample counts, route
ranking weights, tie-breaks, dependency/update burden, and independent review?

Safe default: every outcome-sensitive value remains null until fixed before the
first operation. No failed or slow attempt is discarded, and no ranking is
created after results are visible.

## I092-011 — Result, sanitization, retention, and incidents

What closed result schema, materializer, detached evidence set, redaction
review, retention window, incident process, and repository/publication boundary
preserve adverse evidence without raw controller payloads, stable identifiers,
URLs/requests, credentials, paths, storage values, crash logs, media, or free
text?

Safe default: retain only opaque labels, closed categories, counts, timings,
digests, metrics, and redacted categories. Preserve every blocked, invalid,
stopped, retried, failed, and worst-case record.

## I092-012 — Operation, qualification, selection, and publication

Who may download/build dependencies, install packages, mutate images, start
sessions, operate displays/controllers/audio/power, use hosted services or
accounts, inject faults, recover targets, review each cell, qualify routes,
select a product route, publish compatibility, and supersede D-124/Q-047/Q-101?

Safe default: none of those actions is authorized by the plan. A complete
passing matrix permits review only; it does not automatically select or publish
a route.
