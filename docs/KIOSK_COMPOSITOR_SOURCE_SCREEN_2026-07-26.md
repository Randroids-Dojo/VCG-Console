# Kiosk compositor source screen

Date: 2026-07-26
Investigation: I-092
Status: source inspection only; no route selected or target operation authorized

## Purpose

This note freezes the upstream facts used to pre-register the Cage,
Gamescope, and VCG-wrapper comparison. It is not installation, build, security,
compatibility, performance, maintenance, or target qualification evidence.

The comparison keeps Chromium and the VCG browser-supervision contract common
where possible. It measures the compositor/session layer separately from the
browser wrapper instead of treating those layers as interchangeable.

## Cage observation

Repository: <https://github.com/cage-kiosk/cage>

Observed `master` revision:
`5491610293a59123710861330be92e4c2ec93840`

Immutable sources:

- [README](https://raw.githubusercontent.com/cage-kiosk/cage/5491610293a59123710861330be92e4c2ec93840/README.md), 2,518 bytes, SHA-256 `7ad6d2850c21dc9c958ae4107c4e8729763397033bdf23503563a0087de58b10`.
- [manual source](https://raw.githubusercontent.com/cage-kiosk/cage/5491610293a59123710861330be92e4c2ec93840/cage.1.scd), 1,456 bytes, SHA-256 `4612f4499a6c60c65049625efbaf6a66a822c773db4c29f35785ba3d910fab08`.

The observed README describes Cage as a Wayland kiosk that runs one maximized
application. It identifies Wayland, wlroots, and xkbcommon as build
dependencies; says the observed source is based on wlroots branch 0.20; makes
XWayland support dependent on the compile-time wlroots configuration and an
installed XWayland binary; and distinguishes nested launch in a virtual output
from TTY launch with the KMS/DRM backend.

Those facts make Cage a relevant single-application candidate. They do not
prove the exact VCG build, architecture support, browser compatibility, GPU or
display behavior, input ownership, privileged recovery, child containment,
readiness, liveness, audio, storage isolation, or target recovery.

## Gamescope observation

Repository: <https://github.com/ValveSoftware/gamescope>

Observed `master` revision:
`17baf4abd1ab3353fb705e4d0d023f84e870f7e8`

Immutable source:

- [README](https://raw.githubusercontent.com/ValveSoftware/gamescope/17baf4abd1ab3353fb705e4d0d023f84e870f7e8/README.md), 5,595 bytes, SHA-256 `d01cc26db47f9f69fabcda36abf48f26cbff3db1bb6fd7313b8e523db0c023aa`.

The observed README distinguishes embedded and nested use. It describes an
embedded DRM/KMS path, Vulkan composition, a private XWayland desktop in the
nested use case, virtual game/output resolution and refresh controls, and
current driver-family requirements. Its documented keyboard shortcuts include
fullscreen, filtering, scaling, screenshots, and keyboard-grab behavior.

Those facts make Gamescope a relevant game-session micro-compositor candidate.
They do not prove that a browser session is contained, that the documented
keyboard controls are acceptable for a controller-only appliance, that
screenshots or grabs are disabled by the selected build, or that VCG retains
reserved input, focus, window, process, storage, audio, and recovery authority.

## Chromium flag boundary

Official Chromium note:
[Run Chromium with flags](https://chromium.googlesource.com/playground/chromium-org-site/+/master/developers/how-tos/run-chromium-with-flags.md).

The observed Chromium documentation says command-line switches can change
browser behavior and warns that such switches are not supported or recommended
and may break in the future. Therefore app mode, kiosk flags, a fresh profile,
or a successful process launch are configuration inputs only. They cannot
qualify origin containment, permission denial, readiness, liveness, visible
focus, reserved controls, descendant cleanup, or recovery.

## VCG wrapper boundary

The repository's current `HOSTED_BROWSER_SUPERVISION.md` and
`scripts/hosted-browser-supervisor.ts` define a bounded desk supervisor with
explicit readiness, fixed wrapper liveness challenges, navigation and target
guards, permission and download denial, owned-process termination, and
temporary-profile cleanup.

That wrapper remains a common candidate layer, not a compositor. A successful
challenge echo does not prove a visible or focused surface, GPU/display health,
input ownership, audio continuity, playability, login state, or privileged
Home/Back recovery. A compositor process existing beside it does not prove
those properties either.

## Comparison boundary

The strict I-092 plan must:

- run Cage, Gamescope, and the VCG-wrapper/base-compositor route against the
  same browser, workload, target, controller, display, audio, and fault
  contracts;
- keep Raspberry Pi AArch64 and ordinary x86-64 native Linux independently
  required, with optional SteamOS evidence unable to rescue either;
- distinguish source description, successful build, process survival, wrapper
  liveness, compositor readiness, visible/focused usability, controller-only
  recovery, and complete product qualification;
- retain failed, blocked, invalid, stopped, retried, and worst-case evidence;
- reject candidate, target, workload, scenario, or aggregate rescue;
- leave exact revisions, package closures, invocations, privilege boundaries,
  thresholds, ranking, operation, selection, and publication unapproved.

No source reviewed here is selected for a product image. No download, build,
install, session start, target access, controller use, network workload, fault,
qualification, or publication is authorized by this note.
