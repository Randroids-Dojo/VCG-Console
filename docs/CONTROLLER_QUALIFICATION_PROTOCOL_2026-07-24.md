# Controller lifecycle and reserved-action qualification protocol

Last updated: 2026-07-24

Status: browser and native policy state machines implemented; physical
controller, SDL3, compositor, sleep/wake, and target-Linux qualification not
run.

This protocol advances I-151 and I-152. It defines what must be measured before
the project can claim that supported controllers discover, reconnect, recover,
and preserve console Home/Back/Pause authority across both reference tiers.
It does not turn browser Gamepad behavior, Windows, WSL2, synthetic devices, or
Rust unit tests into a hardware compatibility result.

## Qualification claim

A configuration may be called controller-qualified only when:

- every listed supported device has an exact model/revision/firmware/transport
  identity;
- cold-attached, hot-plug, disconnect, reconnect, replacement, simultaneous,
  sleep/wake, battery, ambiguous-layout, focus-loss, and fault cycles pass on
  the exact target;
- no held action survives disconnect, sleep, mapping replacement, overlay
  transition, backend restart, or shutdown;
- Home, Back, and Pause always reach the console and never reach a hosted,
  native, or retro game;
- ambiguous mappings never emit semantic actions before deliberate mapping;
- player/controller assignment is stable, visible, correctable, and never
  inferred from a durable hardware identifier;
- every tested state has a controller-only route to recovery or a clearly
  disclosed unsupported state.

A claim is scoped to the exact target image, SDL3/mapping database,
compositor, browser/runtime, host build, controller revision/firmware,
transport, and test matrix. Any material change reopens affected cells.

## Present evidence

### Browser desk adapter

`GamepadRouter` currently proves:

- standard buttons and axes map to the closed console action vocabulary;
- ambiguous and `xr-standard` mappings remain connected but have zero semantic
  action authority;
- complete observations are validated before mutation;
- at most 64 browser slots and 16 connected devices are accepted;
- indexes are unique and bounded;
- IDs, mappings, timestamps, axes, and buttons are bounded and validated;
- simultaneous devices are processed by ascending browser index;
- event and poll discovery are deduplicated;
- missed disconnect, same-device reconnect, and same-index replacement are
  recovered;
- invalid or unavailable polls publish empty held state, preserve established
  edge state, and emit only a closed fault code;
- disconnect and stop clear published held state.

Fifteen deterministic tests cover those properties. Playwright flows use
synthetic standard devices to exercise launcher Select, Back, Home, Pause, and
direction paths. This evidence applies only to the adapter contract.

### Native policy model

The Rust `ControllerRegistry` and `ReservedInputRouter` already prove bounded
transactional observation, opaque session-local IDs, mapping-confidence
denial, deterministic edges, synthesized releases, connection epochs,
same-recipient releases, overlay rearming, held-state limits, and
console-only Home/Back/Pause routing.

They are not connected to SDL3 or a privileged compositor. Unit tests cannot
prove that a real game process cannot read, capture, suppress, or race the
physical controls.

## Required target matrix

Run the complete blocking matrix independently on:

1. the selected Raspberry Pi 5 target image; and
2. the selected ordinary x86-64 Linux target image.

Steam Machine/SteamOS remains an additional optional row until it becomes an
approved target. Windows and WSL2 results may debug tooling but do not replace
either blocking Linux row.

Before execution, freeze SHA-256-bound manifests for:

- hardware assembly, USB topology, Bluetooth/Wi-Fi radios, hubs, receivers,
  power supply, display, and storage;
- OS image, kernel, firmware, BlueZ, udev, SDL3, controller mapping database,
  compositor, browser, launcher, native host, retro runtime, and sample games;
- every controller model, hardware revision, firmware, cable/receiver,
  transport mode, and battery state;
- harness, clocks, event recorder, process/focus fault injector, and operator
  script.

## Required controller samples

The final exact sample set is an owner decision. The minimum engineering
coverage proposed here is:

- one current first-party standard-mapped USB/Bluetooth controller;
- one second-vendor standard-mapped controller;
- one 2.4 GHz receiver controller if that transport is claimed;
- one generic/retro controller that lacks a trusted standard mapping;
- two simultaneously connected supported controllers from different vendors.

Wired and wireless modes of the same product are separate configurations.
Material firmware or hardware revisions are separate configurations unless
the manufacturer evidence and observed behavior prove equivalence.

No device may be advertised as supported from family resemblance, USB IDs,
community reports, a mapping database entry, or a single successful connect.

## Blocking lifecycle scenarios

Run each scenario for every applicable controller/transport/target cell.
Schedule at least 20 valid cycles per cell; an invalid harness cycle is rerun
and never converted to a pass.

### Discovery and hot-plug

1. Controller attached before cold boot.
2. Controller attached at launcher idle.
3. Controller attached during hosted, native, and retro loading.
4. Controller attached while the console overlay is open.
5. Browser/SDL connection event omitted so polling/reconciliation is the only
   evidence.

Required: exactly one connection epoch, visible generic or known identity,
correct mapping confidence, no spontaneous action, and a controller-only next
step.

### Disconnect and reconnect

1. Unplug or radio-loss while neutral.
2. Disconnect while every canonical action is held in separate cycles.
3. Same device reconnects to the same backend slot.
4. Same device reconnects to a different backend slot.
5. Different device occupies the old slot.
6. Receiver remains while its paired controller sleeps and wakes.
7. Backend process restarts while a control is physically held.

Required: all held actions release to their original recipient before
disconnect, the old epoch cannot emit again, reconnect receives a new
session-local identity/epoch, and a continuously held control must rearm
according to the documented release policy.

### Sleep, suspend, and wake

Exercise controller sleep, console suspend/resume, warm launcher idle/wake,
Bluetooth service restart, USB reset, and radio coexistence load.

Record discovery delay, first usable input, duplicate events, lost
assignments, battery freshness, reserved-action availability, and whether any
keyboard/mouse intervention was needed.

### Simultaneous devices and assignment

Exercise at least:

- two devices attached before boot;
- devices attached in both orders;
- simultaneous button completion;
- either device disconnecting/reconnecting;
- replacement in one slot;
- player assignment, correction, and deliberate reassignment;
- one ambiguous device beside one standard device;
- one device opening Pause while the other holds a gameplay action.

Required: deterministic visible player/controller assignment, no cross-player
action, earliest/lower-slot policy where specified, no durable association to
serial/model ID, and a controller-only correction path.

### Ambiguous mappings

For every device without a trusted standard/SDL mapping:

- every physical control must initially have zero semantic authority;
- Home/Back/Pause must not be guessed;
- the UI must explain why the device cannot yet control the console;
- guided mapping must reserve Home/Back/Pause outside the game mapping;
- conflicting, duplicate, incomplete, cancelled, stale, or device-replaced
  mapping attempts must fail closed;
- a generic glyph set must remain available without inventing branded labels.

Until the guided mapping lifecycle is implemented and qualified, the correct
product behavior is visible unsupported/ambiguous state with another recovery
input, not a guessed layout.

### Reserved actions under hostile focus

For hosted browser, native/Godot, and retro surfaces, test:

- pointer lock and full screen;
- focused and unfocused windows;
- hung renderer and busy CPU/GPU;
- rapid overlay open/close;
- game process crash and descendant survival attempt;
- synthetic high-rate ordinary input;
- game attempts to read or suppress Home/Back/Pause;
- compositor and service restart.

Required: Home, Back, and Pause are observed only by the console authority,
arrive within the declared response budget, cannot be swallowed, and never
appear in game input. A browser `preventDefault`, SDL grab, focus owner, or
game mapping must not change the outcome.

### Battery and power reporting

Where a trusted platform API provides battery state, test charging, full,
medium, low, critical, unavailable, stale, disconnect, and replacement.
Record source, timestamp/freshness, units, update cadence, and failure.

Where battery state is unavailable or untrusted, show `Unavailable`; never
infer charge from connection duration, transport, voltage without calibration,
or a model default. Battery status must not grant input or profile authority.

## Metrics and zero-tolerance failures

Record per cycle:

- connection/disconnection event counts and ordering;
- connection epoch and opaque controller ID changes;
- detection and first-usable-input latency;
- press/release edges and recipient;
- player assignment before/after;
- mapping confidence and mapping revision;
- held actions before fault and releases after fault;
- reserved console deliveries and any game deliveries;
- battery state, source, freshness, and unavailable status;
- recovery UI path and operator intervention;
- harness validity and closed failure codes.

Any valid occurrence of the following rejects the configuration:

- missed, phantom, duplicate, or misordered lifecycle transition;
- stuck or fabricated action;
- Home/Back/Pause delivered to a game or unavailable to the console;
- action from an ambiguous mapping;
- wrong player/controller assignment or silent reassignment;
- old-epoch action after disconnect/replacement;
- branded or exact battery claim from unavailable/stale evidence;
- keyboard/mouse requirement on a claimed controller-only recovery path;
- loss of the console stop path.

Latency, reconnect-time, and battery-freshness numerical gates must be frozen
before trials. The current repository has no owner-approved thresholds.

## Evidence and privacy

Persist only bounded event evidence:

- opaque campaign, cell, cycle, controller-session, epoch, and player-slot IDs;
- exact manifest digests;
- monotonic timestamps and timestamp quality;
- closed lifecycle/action/mapping/battery/fault codes;
- recipient and assignment transitions;
- artifact byte lengths and SHA-256 digests.

Do not retain raw USB/Bluetooth descriptors, serial numbers, MAC addresses,
usernames, workstation paths, free-text device names, controller input outside
the planned action vocabulary, or gameplay/save/profile content in the
qualification ledger. An exact device manifest may be access-controlled
separately when vendor/product/revision evidence is necessary.

## Remaining implementation

I-151 and I-152 remain open. Before physical execution the project still
needs:

- real SDL3 snapshot producer and pinned mapping database;
- privileged compositor/service routing;
- controller roster and assignment UI;
- guided ambiguity mapping and generic glyphs;
- battery adapter with freshness semantics;
- target sleep/wake and backend restart hooks;
- event collector and strict plan/result validator;
- exact controller sample purchase/loan authorization;
- owner-approved latency/repetition/compatibility claim.

Questions are isolated in
`OWNER_QUESTIONS_CONTROLLER_QUALIFICATION_2026-07-24.md`.
