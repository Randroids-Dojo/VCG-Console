# Controller input prototype contract

Last updated: 2026-07-24

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

Actions are edge-triggered. Holding a button or axis emits one action until it returns through neutral; reconnecting after an observed absence starts a new edge epoch. Direction repeat, ambiguous-device mapping, controller glyphs, haptics, battery, and per-player ownership are not implemented.

## Connection lifecycle

Polling is authoritative because browser connection events are not sufficient by themselves:

- A controller already attached when the adapter starts is discovered and announced on the first poll.
- `gamepadconnected` and `gamepaddisconnected` events accelerate discovery but are deduplicated against polling.
- A polled slot that disappears is announced as disconnected even if the browser event was missed.
- A different ID or mapping at an occupied index disconnects the old device before connecting the replacement.
- Disconnect clears held-action state, so a replacement controller can emit a fresh edge.
- Stopping removes listeners, cancels the outstanding animation frame, and clears session-local state without pretending the hardware disconnected.

The prototype identity is the browser session's index plus ID and mapping. It is not a durable controller identity and must not be used to associate a person, profile, save, or trusted workstation.

## Native qualification boundary

The Rust host now adds a platform-neutral `ControllerSnapshotSource`/`ControllerRegistry` seam beside canonical `InputEvent` and `ShellAction`. A privileged adapter supplies a complete observation bounded to 16 controllers. The registry:

- validates the whole observation before mutation and rejects duplicate backend instances, zero connection epochs, duplicate semantic actions, or semantic input from an ambiguous mapping;
- assigns only opaque session-local `controller-NNNN` IDs, never adapter names, serials, paths, or backend instance IDs;
- reconciles in backend-order-independent form and emits deterministic press/release edges;
- treats a changed connection epoch or mapping as disconnect then connect with a new opaque ID;
- synthesizes releases before disconnect so Home, Back, Pause, or another action cannot remain held after disappearance, shutdown, sleep, or backend fault;
- keeps ambiguous devices visible for future guided mapping while denying them semantic shell authority; and
- leaves all established state unchanged when any complete observation is invalid or excessive.

This is the native lifecycle/edge state machine, not an SDL3 adapter or privileged compositor route. Product qualification still requires:

- SDL3 discovery, mapping-database behavior, hot-plug, reconnect, sleep/wake, and simultaneous-device tests on ARM64 and x86-64 Linux;
- explicit player assignment and controller-accessible recovery for ambiguous mappings;
- standards-conformant generic glyph behavior and an observed compatibility table;
- compositor- or service-owned Home and Back that hosted/native games cannot intercept;
- pointer-lock, fullscreen, lost-focus, hung-game, and hostile-input tests;
- battery, transport, and controller-specific limitations reported without narrowing the standards-conformant compatibility promise.

Until those gates pass, browser Home/Back and Rust registry events are contract evidence only, not proof of unstealable system controls.
