# Owner questions: SteamOS Steam Input actions

Date: 2026-07-26
Scope: I-169
Status: decisions required before execution

These questions preserve the strict zero-result campaign. Freeze each answer
in an exact reviewed protocol before the first affected action. An answer does
not itself authorize target or controller operation, account or partner access,
configuration publication, service mutation, text entry, fault injection,
qualification, publication, or a compatibility claim.

## STI-001 - Exact target, Steam client, SDK, and runtime tuple

Which received Steam Machine or explicitly development-only SteamOS proxy,
firmware, SteamOS image, kernel, Gamescope, SDL, Steam client channel/build,
Steamworks SDK version, package/runtime, browser, native host, display, USB/
Bluetooth topology, network state, and instrument set define the campaign?
Which material change invalidates affected cells?

## STI-002 - AppID, partner access, IGA VDF, and official configurations

Which exact Steam AppID and authorized partner account may create, test, and
publish the IGA VDF and official default configurations? Approve the KeyValues
source, action/localization blocks, target controller configuration set,
configurator procedure, depot binding, review, signing or digest process,
publication scope, rollback, and cleanup. What may be tested locally without
publishing or mutating production partner state?

## STI-003 - Seven physical controller roles

Select exact model, revision, firmware, transport, operating mode, physical
sample count, ownership or loan source, and safe connection procedure for the
Steam Controller, Xbox-, PlayStation-, Switch Pro-, 8BitDo multimode-, generic
DirectInput-, and ambiguous-controller roles. Which purchases or loans, if
any, are authorized, and which family/revision equivalence claims are denied?

## STI-004 - Four route implementations

Approve the exact accountless SDL base adapter, Steam Input native action API
adapter, legacy gamepad emulation configuration, and legacy keyboard/mouse
configuration. How are duplicate intake, mixed SDL/Steam events, client
availability changes, focus, epochs, releases, and route selection controlled?
Confirm that only the native route can qualify native actions and Steam cannot
replace the base route.

## STI-005 - Action sets, layers, handles, origins, and localization

Approve the exact `vcg-shell`, `vcg-game`, `vcg-console-overlay`, and
`vcg-text-entry` definitions; action names; API handles; set/layer activation
state machine; canonical mappings; analog modes; dead zones; origin lookup;
localization tokens; configuration updates; and stale-action rejection. Which
game-specific actions may extend the common set without weakening portability?

## STI-006 - Privileged Home, Back, and Pause route

Which physical controls and shell/compositor/service path own Home, Back, and
Pause on the exact target? Define recipients, press/release pairing, latency
oracles, pointer lock, fullscreen, focus loss, responsive and hung games,
client/overlay loss, compositor restart, high-rate input, forced exit, and
proof of zero game delivery or swallowing. How is the path preserved when
Steam is absent or frozen?

## STI-007 - Controller text entry

Which fields genuinely require text, what exact `ISteamUtils` text-entry mode
and flags apply, and how do controller-only open, edit, confirm, cancel, close,
focus return, timeout, client loss, unsupported locale, and recovery work?
Define maximum length, character and localization policy, content ownership,
temporary buffer lifetime, deletion, and proof that entered text never reaches
diagnostics or evidence.

## STI-008 - Glyph origins, localization, and fallback

Approve action-origin lookup, controller-family differentiation, glyph asset
source and license, localization, loading and cache rules, hotplug or mode-
switch update, mixed-controller presentation, safe generic glyphs, missing
origin behavior, seating-distance presentation, and accessibility. Which
branded glyph guesses are forbidden, and how is a mismatch detected?

## STI-009 - Unknown-controller guided mapping

Define zero semantic authority, unsupported explanation, controller-only
guided steps, canonical completeness, conflicting/duplicate input denial,
reserved-control isolation, cancel/reset/retry, generic glyphs, mapping ID and
revision, signing, persistence, rollback, stale/replaced-device denial, broken-
mapping recovery, and privacy. Who may persist or delete a mapping?

## STI-010 - Player assignment and simultaneous controllers

Freeze preattached and hotplug order, session-local controller IDs, automatic
assignment, explicit correction/reassignment ceremony, simultaneous input,
replacement, reconnect, sleep/wake, controller beside a standard comparator,
text-entry ownership, overlay ownership, and release synthesis. Which state may
survive restart, and how are people, profiles, saves, and durable device IDs
kept separate?

## STI-011 - Exact workloads and interactions

Which shell views, overlay, text fields, controlled native-action client,
local/hosted games, legacy gamepad title, legacy keyboard/mouse title, failure
fixtures, settings, content versions, interactions, service/account use, and
non-destructive mutations exercise the 24 scenarios? How are page readiness,
pixels, action callbacks, and emulated keystrokes kept from substituting for
visible controlled response and controller-only completion?

## STI-012 - Sample and latency gates

Freeze minimum physical samples per role/firmware/revision/transport; discovery
and reconnect p95; ordinary-action p95; Home/Back/Pause p95, p99, and worst;
action-set/layer and glyph-update p95; text-entry open/close p95; Steam-
unavailable fallback p95; and mapping/configuration rollback p95. Define clocks,
units, percentile method, uncertainty, per-cell pass logic, invalidity, and the
prohibition on post-result threshold tuning.

## STI-013 - Client, overlay, process, compositor, and update faults

Approve Steam client exit/restart/update, overlay loss, package/input process
termination, compositor/focus faults, configuration removal or corruption,
mapping and SDK update, rollback, network loss, offline restart, controller
sleep, USB reset, Bluetooth restart, and fresh recovery. Which operations are
destructive, how are failures injected and contained, and who may authorize
each fault?

## STI-014 - Accountless, identity, privacy, and evidence policy

Define the exact signed-out, no-account, client-never-started, offline, and
network-loss states plus proof that core controller operation has no Steam
dependency and Steam identity does not enter VCG profile or save state. Approve
opaque labels, redaction, raw-input/text prohibition, custody, access,
retention, verified deletion, adverse-evidence preservation, and incident
response. Who independently inspects data flows?

## STI-015 - Operation, qualification, and publication authority

Who may access the target, Steam account or partner site; install the SDK;
connect or modify controllers; create, upload, publish, or roll back
configurations; invoke text entry; use services; inject client/input/compositor
faults; and retain diagnostics? Separately, who may qualify a controller/route,
authorize a standards-conformant compatibility claim, publish results, or
change product support? State explicitly what I-169 cannot close or claim.
