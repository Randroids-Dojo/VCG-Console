# Owner questions: remote game input

Date opened: 2026-07-24

Related work: I-089, I-091, I-104, I-128, I-149, I-150, I-151, I-152

The neutral browser observation qualifies no input path. These decisions are
needed before the 26 candidate records can receive reviewed input fields.

## RGI-001: minimum family-mode controller contract

What exact controls must every family-mode hosted game support without a
keyboard, mouse, touchscreen, or game-specific setup?

Safe default: require standard gamepad directional navigation, confirm,
cancel/back, ordinary gameplay controls, pause, and a console-owned forced exit.
Any exception must be disclosed before launch and must preserve a
controller-only recovery path.

## RGI-002: first physical qualification set

Should VibeBots, VibeRacer, Bone Cleaver, GoPit, and GoDig be the first physical
controller pass because they touched the neutral Gamepad API?

Safe default: yes for discovery priority, not presumed compatibility. Also test
at least one no-signal title from each input shape to prove the synthetic
screen does not hide controller support initialized after interaction.

## RGI-003: community controller claim

May Bone Cleaver enter family mode if its gamepad path works but its source,
rights, content, service, and removal-contact review remains incomplete?

Safe default: no. Controller compatibility is one independent gate and grants
no curated-community admission.

## RGI-004: keyboard and pointer requirements

Which titles intentionally require a physical keyboard or pointer for ordinary
play, and are those acceptable in the living-room catalog?

Safe default: exclude them from ordinary controller-first family surfaces until
a tested accessible controller alternative exists. A specialist/developer
surface may disclose the requirement separately without weakening global
recovery.

## RGI-005: text entry

What console-owned text-entry experience should serve titles with names,
search, messages, commands, or other text fields?

Safe default: provide a controller-operable on-screen keyboard outside the
hosted page's trust boundary, minimize child free-text collection, identify
where entered text is sent/stored, and allow cancel/back without losing safe
local state. Do not inject profile names automatically.

## RGI-006: touch signals on a television

Should any title with touch listeners be required to support touch, or are
those listeners only mobile fallbacks?

Safe default: do not promise a touchscreen. Qualify the controller path
independently and disclose pointer/touch-only features as unavailable on the
console.

## RGI-007: standard and ambiguous controllers

Which physical devices make up the first conformance matrix?

Safe default: include one Xbox-style standard controller, one PlayStation-style
controller, one Nintendo-layout controller, one generic/ambiguous USB device,
and the intended recovery remote where applicable. Record exact USB/Bluetooth
identity, SDL/Gamepad mapping, glyphs, firmware, connection mode, and target.

## RGI-008: connect and replacement behavior

Must games support controllers connected before launch, hot-plugged after
launch, disconnected/reconnected, replaced at the same index, and used
simultaneously?

Safe default: yes for the platform boundary. The console owns player assignment
and stale-release cleanup; a hosted title receives only the reviewed mediated
mapping and must not retain a disconnected device's held state.

## RGI-009: reserved Home, Back, and pause

Which physical inputs and timing own Home, Back, pause, and forced exit, and
may a hosted page ever receive them?

Safe default: keep them console-only at the native/compositor input boundary.
Do not rely on JavaScript cancellation, focus, pointer lock, fullscreen, or a
cooperative page. Long-X pause must retain the selected false-activation and
player-ownership rules.

## RGI-010: pointer lock and fullscreen

Should hosted games be allowed to request pointer lock or fullscreen after a
user action?

Safe default: permit only through the supervised browser policy when the exact
manifest and title review require it. Home/Back/forced exit must break capture,
restore launcher focus, and work during hangs and crashes.

## RGI-011: console-error follow-up

May a qualification run retain redacted console-error categories to diagnose
the 18 initial-window error signals?

Safe default: yes, but store only reviewed stable codes, counts, subsystem,
deploy identity, and bounded timing. Exclude arbitrary hosted message text,
URLs, stack contents, tokens, identifiers, form values, and player data.

## RGI-012: manifest promotion threshold

What evidence is required before a candidate manifest can name `gamepad`,
`keyboard`, `pointer`, `touch`, or text-entry permissions?

Safe default: require an exact physical session on both target tiers, ordinary
play coverage, failure/recovery tests, and owner confirmation. Record only
required and supported inputs; never convert listener registration into a
permission automatically.
