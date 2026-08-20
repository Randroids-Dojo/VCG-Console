# Controller input prototype contract

Last updated: 2026-08-19

The console lab's Browser Gamepad adapter is a reversible desk prototype for canonical shell actions and connection lifecycle. It is not the native input authority and cannot prove that Home or Back remains available when a page, native game, compositor, or operating system owns focus.

## Canonical browser mapping

The adapter interprets the browser's standard mapping as follows:

| Console action | Standard input |
|---|---|
| Left / Right / Up / Down | D-pad buttons 14 / 15 / 12 / 13 or primary axes 0 / 1 outside the 0.55 dead zone |
| Select | Primary face button 0 |
| Back | Secondary face button 1 |
| Pause | Start button 9 |
| Home | Home button 16 when the browser exposes it |

Console actions are edge-triggered. Holding a button or axis emits one action
until it returns through neutral; reconnecting after an observed absence
starts a new edge epoch. The router also publishes the union of currently held
semantic actions on every valid poll to the explicitly enabled camera-free
pose simulator. That observation path changes only simulator landmarks: Home
and Back continue through the edge-triggered console path and are never
converted to poses.

Only a browser device whose mapping is exactly `standard` may emit these
semantic actions. An empty or `xr-standard` mapping remains visible as a
connected but ambiguous device and emits no directions, Select, Back, Home, or
Pause. The browser adapter does not guess button positions for an unknown
layout.

Direction repeat, guided ambiguity mapping, controller glyphs, haptics,
battery, and per-player ownership are not implemented.

## Connection lifecycle

Polling is authoritative because browser connection events are not sufficient by themselves:

- A controller already attached when the adapter starts is discovered and announced on the first poll.
- `gamepadconnected` and `gamepaddisconnected` events accelerate discovery but are deduplicated against polling.
- A polled slot that disappears is announced as disconnected even if the browser event was missed.
- A different ID or mapping at an occupied index disconnects the old device before connecting the replacement.
- Disconnect clears held-action state, so a replacement controller can emit a fresh edge.
- Every complete poll is validated before connection, held-state, or action
  mutation. It admits at most 64 browser slots and 16 connected devices;
  requires unique safe indexes, bounded non-control-character IDs, known
  mapping vocabulary, finite timestamps, at most eight finite normalized axes,
  and at most 32 finite normalized buttons.
- Simultaneous devices are reconciled and emit edges in ascending browser
  index order rather than browser-array order.
- A malformed, duplicate, excessive, or unavailable poll publishes an empty
  held-state observation and one closed fault code while preserving the last
  established connection/edge epoch. The next valid poll resumes observation
  without converting a continuously held button into a new edge. The lab
  presents that closed code and keeps motion/keyboard recovery visible; it
  never renders provider exception text.
- A disconnect immediately republishes held state without that device rather
  than waiting for another frame.
- Stopping removes listeners, cancels the outstanding animation frame, clears
  session-local state, and publishes an empty held state without pretending
  the hardware disconnected.

The prototype identity is the browser session's index plus ID and mapping. It is not a durable controller identity and must not be used to associate a person, profile, save, or trusted workstation.

## Bluetooth setup surface

On the Raspberry Pi appliance, `vcg-host` now owns a bounded `BlueZ`
`bluetoothctl` adapter behind the authenticated loopback API. The television
Settings > Controllers surface can scan, pair, reconnect, and confirm a forget
operation using the same focusable actions as the rest of the launcher. The
host filters discovery to devices whose `BlueZ` information identifies a
gaming input or HID service, validates addresses internally, and invokes no
shell.

The browser sees only session-local `controller-N` labels and paired/connected
state. It never receives advertised names, Bluetooth addresses, keys,
descriptors, or raw command output. A Bluetooth connection is presented as a
transport state, not proof of mapped input. The existing browser Gamepad
adapter remains responsible for observing fresh standard-mapped input and the
controller ownership layer remains responsible for deterministic player-slot
claims.

First-ever pairing still needs an already-working focus input such as a wired
controller or keyboard. A physical appliance button, HDMI-CEC remote path, or
other qualified fallback has not been implemented, and the target hardware
matrix remains unexecuted.

Fifteen deterministic unit tests cover the standard mapping, dead zone,
ambiguous mapping denial, invalid axes/buttons, held-state publication,
pre-attached discovery, event/poll deduplication, missed disconnect, same-ID
reconnect, same-index replacement, deterministic simultaneous devices,
transactional invalid-poll rejection, observation exceptions, slot/device
bounds, malformed events, stop cleanup, and rearmed input edges.

## Native qualification boundary

The Rust host now adds a platform-neutral standard shell mapper plus a
`ControllerSnapshotSource`/`ControllerRegistry` seam beside canonical
`InputEvent` and `ShellAction`.

`StandardShellControllerMapper` accepts a complete raw observation bounded to
16 controllers. Only an adapter-qualified standard mapping may supply the
closed button vocabulary:

| Standard button/input | Canonical shell action |
|---|---|
| South | Select |
| East | Back |
| Start | Pause |
| Guide | Home |
| D-pad | Up / Down / Left / Right |
| Primary X/Y axis | Left / Right / Up / Down |

The primary axes press at absolute value `0.55` and release below `0.35`, so
noise near the activation threshold cannot oscillate semantic state. The
mapper:

- validates the entire observation before changing hysteresis state;
- rejects duplicate devices/buttons, zero connection epochs, non-finite or
  out-of-range axes, and more than 16 devices;
- orders output by backend instance rather than caller array order;
- keys axis latches to exact backend instance plus volatile connection epoch;
- drops latches for absent/replaced/ambiguous controllers and exposes an
  explicit reset for shutdown, sleep, or backend fault; and
- permits a neutral ambiguous device to remain visible but rejects any
  standardized button or axis signal attributed to it.

The mapper emits complete semantic snapshots. A privileged adapter supplies
those snapshots to the registry, which:

- validates the whole observation before mutation and rejects duplicate backend instances, zero connection epochs, duplicate semantic actions, or semantic input from an ambiguous mapping;
- assigns only opaque session-local `controller-NNNN` IDs, never adapter names, serials, paths, or backend instance IDs;
- reconciles in backend-order-independent form and emits deterministic press/release edges;
- treats a changed connection epoch or mapping as disconnect then connect with a new opaque ID;
- synthesizes releases before disconnect so Home, Back, Pause, or another action cannot remain held after disappearance, shutdown, sleep, or backend fault;
- keeps ambiguous devices visible for future guided mapping while denying them semantic shell authority; and
- leaves all established state unchanged when any complete observation is invalid or excessive.

## Privileged routing policy

`ReservedInputRouter` consumes the canonical edges after registry reconciliation and selects a trusted recipient:

| Current surface | Home / Back / Pause | Directions / Select |
|---|---|---|
| Launcher | Console | Console |
| Game | Console | Game |
| Console overlay | Console | Console |

Home, Back, and Pause therefore have no route to a game in the native policy model. Pause is console-owned because it opens the console overlay; a game does not receive it as gameplay input. Motion long-X ownership remains in the separate player-session state machine.

The router records the recipient of each press and returns its release to that same recipient. A surface change first emits deterministic releases for every held action and clears the epoch. A still-held physical control must release and be pressed again, preventing movement or selection from leaking through an overlay transition. Duplicate presses and releases without a routed press are ignored. Device IDs are restricted to 1-64 safe ASCII identifier bytes before allocation. Held state is capped at 128 entries, matching 16 admitted controllers times eight canonical actions; an excessive new press is rejected without mutating existing state.

Registry-to-router tests prove that a synthesized disconnect release returns to the game that received its press. Separate tests cover all reserved actions, all game-routable actions, context transitions, rearming, duplicate/orphan edges, deterministic release targets, and capacity rejection.

Nineteen focused native input cases now pass. Five mapper cases cover complete
button/axis projection, deterministic ordering, press/release hysteresis,
fresh connection epochs, explicit reset, transactional invalid-poll refusal,
empty-poll latch removal, neutral ambiguous visibility, signal denial, and all
declared observation bounds.

This is the standard shell mapping, native lifecycle, and routing policy state
machine, not an SDL3 adapter, complete gameplay-device projection, mapping
database, or privileged compositor route. One physical producer now feeds it
during a supervised libretro launch — see the next section — but no other
runtime does. Product qualification still requires:

- SDL3 discovery, mapping-database behavior, hot-plug, reconnect, sleep/wake, and simultaneous-device tests on ARM64 and x86-64 Linux;
- explicit player assignment and controller-accessible recovery for ambiguous mappings;
- standards-conformant generic glyph behavior and an observed compatibility table;
- wiring the router to real SDL3 input plus compositor/service ownership so hosted and native games cannot read or suppress Home, Back, or Pause;
- pointer-lock, fullscreen, lost-focus, hung-game, and hostile-input tests;
- battery, transport, and controller-specific limitations reported without narrowing the standards-conformant compatibility promise.

Until those gates pass, browser Home/Back and Rust registry/router events are contract evidence only, not proof of unstealable system controls.

## Host-observed reserved gesture

`vcg_host::reserved_input` is the first physical producer for that policy. On Linux it opens every connected controller's own event device read-only and feeds one canonical Home edge into `ReservedInputRouter` in `InputContext::Game`. The `vcg-host retroarch` launch path starts it before the child and terminates the child when the edge arrives, so the exit works even when the core has stopped processing input. The launcher-driven native launch path does not start it yet.

| Physical gesture | Canonical shell action |
|---|---|
| Select and Start held together for one second | Home |
| A dedicated Home button (`BTN_MODE`) held for one second | Home |

The dedicated button is an addition, not a replacement: not every pad reports one, so the Select-plus-Start form is the universally producible gesture. The one-second hold is the debounce policy — a momentary chord is ordinary play, and some titles bind Select plus Start themselves. The gesture fires once and re-arms only after release. No other button, axis, or event type is inspected.

Devices are admitted from sysfs capability data rather than device names: a node is a controller when its key bitmap declares a code in the kernel's joystick or gamepad button blocks, and it is observable when it also reports Select and Start or a Home button. The appliance's power button, HDMI nodes, and a controller's separate motion-sensor node are therefore never treated as controllers. The set is rescanned every 500 ms, so connecting or disconnecting a controller mid-session is picked up or dropped without restarting the host, and a vanished controller's held reserved action is released so a replacement can produce a fresh gesture. A session whose last controller disappears keeps running with no reachable exit until one reconnects.

The router fails closed: a libretro launch is refused when no connected controller can produce the gesture, and on a platform with no Linux event devices.

This is an observing router, not an interception. It never takes an exclusive `EVIOCGRAB` and never consumes an event, so the running game observes the same button presses. It establishes that the host owns the escape; it does not establish that the game never receives Home. That clause of the reserved Home invariant stays open, and closing it needs an exclusive grab plus re-emission through a virtual device.

Fourteen deterministic cases drive the byte-stream and synthetic-source seams on any host: record decoding across a split read, capability-bitmap parsing, controller admission against power-button, HDMI, and motion-sensor nodes, a controller with no reserved buttons, the recognized gesture, gameplay input that is not it, a partial combination released before the hold, single-fire and re-arm, hotplug add and remove, and the refusal paths. No physical controller has exercised the Linux backend.

The full physical matrix, evidence fields, zero-tolerance failures, privacy
boundary, and abort/claim rules are pre-registered in
[`CONTROLLER_QUALIFICATION_PROTOCOL_2026-07-24.md`](CONTROLLER_QUALIFICATION_PROTOCOL_2026-07-24.md).
Unresolved sample, mapping, assignment, response-budget, battery, and
repetition choices are isolated in
[`OWNER_QUESTIONS_CONTROLLER_QUALIFICATION_2026-07-24.md`](OWNER_QUESTIONS_CONTROLLER_QUALIFICATION_2026-07-24.md).
