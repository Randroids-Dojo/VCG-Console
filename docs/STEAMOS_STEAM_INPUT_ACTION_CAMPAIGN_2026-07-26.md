# SteamOS Steam Input action and controller campaign

Date: 2026-07-26
Scope: I-169
Status: blocked strict zero-result pre-registration

## Outcome

This tranche adds a strict portable Steam Input action contract and defines the
evidence required to qualify the optional Steam Input adapter without making
Steam a dependency of core VCG controller operation. It records no received
SteamOS target, Steam client or SDK integration, AppID, partner configuration,
in-game actions file, official default layout, controller, glyph, text-entry
session, gameplay, fault, measurement, result, or compatibility claim.

The executable contract lives in
`packages/motion-contract/src/steam-input-actions.ts`. It is software-contract
evidence only. Browser Gamepad behavior, the native input policy model, mapping
database presence, Valve support lists, controller family names, package and
workload plans, and other controller campaigns do not prove physical or Steam
Input integration.

Steam Input remains optional behind SDL or ordinary Linux input. It cannot
replace the accountless controller path, narrow the standards-conformant
controllers-just-work promise, deliver reserved actions to a game, or rescue a
failed route or controller cell.

## Official platform boundary

Valve documents two distinct Steam Input modes. Native mode exposes semantic
actions, action sets, bound origins, and optional action-set layers through the
Steam Input API. Legacy mode emulates lower-level gamepad, keyboard, or mouse
input and can produce mixed-input or glyph mismatches. The contract therefore
keeps native-action and legacy-compatibility results separate:

- [Steam Input general concepts](https://partner.steamgames.com/doc/features/steam_controller/concepts)
- [Steam Input developer setup](https://partner.steamgames.com/doc/features/steam_controller/getting_started_for_devs)
- [In-game actions file format](https://partner.steamgames.com/doc/features/steam_controller/iga_file)
- [Steam Input devices](https://partner.steamgames.com/doc/features/steam_controller/device)

Valve's current developer guidance also places controller text entry under
`ISteamUtils`, not `ISteamInput`, and requires a game-specific AppID, VDF
in-game actions file, configurator-authored default configuration, API
integration, glyph retrieval, depot build, and published official
configuration for complete integration. None of those partner-owned artifacts
or authorities is assumed here.

Official documentation and support lists are platform facts, not evidence that
an exact VCG build, target, controller revision, transport, configuration, or
failure state works.

## Portable action contract

The strict v1 contract is deeply frozen and uses three ordered action sets:

1. `vcg-shell` for directional navigation, confirm, and a text-entry request;
2. `vcg-game` for primary, secondary, shoulder, two-axis move, and two-axis
   look actions; and
3. `vcg-console-overlay` for host-owned directional navigation and confirm.

The game move action uses joystick semantics. Look uses absolute-mouse
semantics so an adapter can preserve high-resolution cursor/camera input
without pretending it is a joystick. Exact `vcg_` Steam action names are
unique and separated from the canonical VCG action IDs.

`vcg-text-entry` is one host-owned layer over `vcg-shell`. While it is active,
game action delivery is forbidden. The ordinary request opens a separately
qualified controller text-entry surface; entered, pasted, or suggested text
may never enter diagnostics or evidence.

Home, Back, and Pause are not ordinary Steam action bindings. They remain
non-remappable, non-emulated, host- or compositor-owned routes. A Steam action
may be a supplemental observed signal but can never be the sole privileged
authority, because a hung application or unavailable Steam client must not
remove the recovery path.

The contract requires bound action-origin glyphs when available and a safe
generic fallback otherwise. It forbids guessed branded glyphs and free-text
device names. A recognized standards-conformant controller needs zero-setup
canonical defaults; an ambiguous controller has zero semantic authority until
an approved controller-only guided mapping completes. Reserved controls are
never guessed.

Ten focused package tests freeze the topology, accountless base, reserved
boundary, text-entry boundary, glyph behavior, unknown-controller behavior,
legacy separation, strict field vocabulary, and exact parsed authority. The
Motion contract package now has 212 passing tests and strict typechecking.

## Input-route boundary

Four routes remain separate:

1. `accountless-sdl-baseline` is the required non-Steam control and requires
   neither Steam client nor Steam account;
2. `steam-input-native-actions` is the optional native semantic-action route
   and is the only route that may qualify native Steam actions;
3. `steam-input-legacy-gamepad` is declared gamepad emulation; and
4. `steam-input-legacy-keyboard-mouse` is declared keyboard/mouse emulation.

Legacy results cannot qualify native action integration. A Steam Input result
cannot qualify or replace the accountless baseline. Each route needs an exact
implementation build and its own result; all remain null.

## Controller-role boundary

The plan reserves seven roles:

1. Steam Controller;
2. Xbox-protocol standard controller;
3. PlayStation-protocol standard controller;
4. Switch Pro-protocol standard controller;
5. 8BitDo multimode standard controller, with each mode treated separately;
6. generic DirectInput standard controller; and
7. ambiguous or unknown controller.

These are sample roles, not brand-wide support claims. Exact model, hardware
revision, firmware, transport, mode, received sample, mapping configuration,
and sample count remain unbound. Family resemblance, a Steam support-list
entry, a known protocol, a configuration listing, or one successful session
cannot qualify another device or revision.

## Qualification matrix

Every controller role runs the applicable route and scenario cells across five
groups:

| Group | Routes | Scenarios | Cells |
|---|---:|---:|---:|
| Lifecycle and zero setup | 4 | 5 | 140 |
| Native action semantics | 1 | 6 | 42 |
| Legacy emulation compatibility | 2 | 4 | 56 |
| Accountless and Steam-unavailable fallback | 1 | 4 | 28 |
| Privileged actions, text, mapping, recovery | 4 | 5 | 140 |

The 24 declared scenarios form 406 required role/route/scenario cells. Each
cell requires 20 valid cycles, for 8,120 valid cycles total.

Lifecycle coverage includes pre-attached cold boot, hotplug across shell/game/
overlay/text boundaries, disconnect/reconnect/replacement, sleep/suspend/wake,
fresh epochs, and simultaneous assignment beside a standard comparator.

Native coverage separately exercises shell digital actions, game digital and
analog actions, action-set and layer transitions, action-origin glyphs, and
safe generic fallback. Legacy coverage exercises gamepad and keyboard/mouse
emulation, complete release edges, mixed-input double-event denial, truthful
glyphs, focus, fullscreen, pointer lock, and mode switching without native
promotion.

The accountless control operates when Steam never starts, is signed out or
offline, loses network, exits, restarts, updates, becomes unavailable, or has
an invalid/missing configuration. It must fail to the local base rather than
fail the core controller path.

Privileged and recovery coverage includes controller text entry; ambiguous
zero-authority and guided mapping; Home, Back, and Pause while responsive,
fullscreen, pointer-locked, hung, or missing client/overlay state; plus mapping,
client, SDK, and default-configuration update/rollback.

Failed, invalid, stopped, retried, unsupported, adverse, and worst-case cycles
remain visible. Another controller, route, mode, target, or aggregate cannot
rescue a failed cell.

## Measurement boundary

Every cell binds exact target, client, SDK, AppID, action manifest, default
configuration, controller, route, build, and schedule identity. Independent
oracles record:

- connection, replacement, sleep/wake, epoch, and assignment events;
- action-set/layer state and stale-action denial;
- every canonical digital press/release, recipient, duplicate, miss, and stuck
  action;
- native analog values, modes, dead zones, and controlled response;
- legacy gamepad, keyboard, mouse, mixed-input, double-event, and mode state;
- action-origin glyph, family, localization, generic fallback, and update
  timing;
- text-entry request, open, confirm, cancel, close, return, and data
  disposition;
- Home/Back/Pause host delivery, game nonreceipt, latency, and recovery;
- unknown-controller mapping, reset, persistence, and conflict state;
- Steam-absent, signed-out, offline, network-loss, and identity flows;
- client, overlay, process, compositor, configuration, update, rollback, and
  fresh recovery; and
- every controller-only intervention and adverse cycle.

Vendor lists, mapping presence, browser/synthetic input, another controller,
or aggregate evidence cannot substitute for an exact physical cell.

## Fixed and open acceptance

The campaign permits zero:

- Steam-account or Steam-client dependencies for core local controller use;
- manual setup for a recognized standard controller;
- wrong, stale, or unannounced action-set/layer events;
- double, duplicate, stuck, or fabricated actions;
- reserved actions delivered to games or swallowed;
- ambiguous-controller semantic actions before approved mapping;
- guessed branded glyphs or silent glyph mismatch;
- keyboard, mouse, or operator intervention in a controller-only path;
- unhandled text-entry confirm, cancel, or return failures;
- entered-text diagnostic, evidence, or free-text disclosure;
- legacy evidence promoted to native integration;
- Steam identity, account, controller stable identifier, path, or credential
  disclosure;
- unrecovered client, overlay, input, mapping, update, or injected faults; and
- valid product failures.

Every required cell must pass. Steam Input cannot replace base input and no
aggregate may rescue failure.

Twelve outcome-sensitive gates remain null: minimum physical samples per role,
firmware, revision, and transport; discovery and reconnect p95; ordinary
action p95; reserved-action p95, p99, and worst case; action-set/layer and
glyph-update p95; text-entry open/close p95; Steam-unavailable fallback p95;
and mapping/configuration rollback p95. Freeze all values, units, percentile
methods, uncertainty, invalidity, and per-cell treatment before operation.

## Evidence and privacy

Tracked results may contain only opaque target, controller, route, build, cell,
cycle, and reason labels plus closed counts, timings, digests, metrics, and
redacted categories. They exclude raw USB, Bluetooth, Steam Input, and
text-entry buffers; entered, typed, pasted, or suggested text; names, free-text
device names, serials, MACs, stable controller identifiers, paths, query URLs,
Steam IDs, accounts, credentials, tokens, cookies, profile/save values,
environment or argument values, arbitrary Steam/client/SDK/driver/service/game/
console/crash messages, and free-text results. Only declared package,
hosted-service, and probe traffic may leave the target.

## Relationship to adjacent work

I-169 consumes the canonical mapping contract and I-152 controller lifecycle
campaign without replacing them. I-152 remains the cross-tier physical
controller qualification boundary. I-166 package, I-168 workload, I-170
accountless lifecycle, and compositor-owned reserved-input work remain
separate. Passing I-169 would not qualify another target, SDL implementation,
controller revision, transport, accountless product lifecycle, game catalog,
two-player experience, public release, or Steam Machine as a reference tier.

## Honest stopping point

The TypeScript contract, machine-readable plan, validator, tests, and owner
questions make I-169 auditable. They do not create a VDF, access a partner
account, publish a configuration, operate Steam, connect a controller, invoke
text entry, inject a fault, measure, qualify, or publish compatibility.
