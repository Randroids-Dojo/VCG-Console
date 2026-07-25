# Power and Recovery State Machine

Status: bounded browser policy plus native ordering/launch-exclusion
coordination and abuse tests; production IPC, physical controls, OS adapters,
and target qualification remain open.

## Scope

[`power-lifecycle.ts`](../apps/console-lab/src/launcher/power-lifecycle.ts)
defines two pure controllers:

- `PowerLifecycleController` orders ordinary tier-native idle, wake, restart,
  and shutdown; and
- `BootMaintenanceGate` separates cold-boot service/recovery authority from
  controller, browser, game, and normal runtime input.

[`power.rs`](../native/vcg-host/src/power.rs) now supplies the privileged
in-process ordering boundary for the runtime half. It:

- closes fresh native launch admission before exposing quiescence;
- serializes that closure against direct and watchdog process activation;
- cancels an already-reserved activation before it can pass the same gate;
- invokes host-selected service adapters for the six remaining gates instead
  of accepting a public gate acknowledgement;
- retains a non-cloneable, non-serializable launch closure through idle,
  terminal fault, unclean loss, or restart/shutdown handoff; and
- consumes that exact closure only after all three wake readiness adapters
  complete.

The TypeScript controllers still change no operating-system state. The Rust
coordinator provides traits rather than concrete tracker, camera, input,
storage, update, display, input-source, systemd, firmware, or GPIO adapters.
Those production implementations must authenticate their own provenance and
exact operation binding. Importing the TypeScript model into a page, or
implementing a Rust trait with an untrusted page response, would not make the
claim trustworthy.

This design implements the policy slice selected by D-095:

- a short physical power press requests tier-native quick idle while active and
  wake while idle;
- the selected adapter maps idle to platform suspend or measured low-power
  launcher idle;
- Restart and Shut Down remain explicit commands with a distinct, expiring
  confirmation;
- no new game launch is admitted once quiescence starts;
- tracking and camera capture stop before the transition;
- a dedicated service-control path is available only during cold boot; and
- a forced electrical cut is recorded as unclean power loss, never relabeled as
  safe shutdown or recovery.

## Runtime state flow

```text
                                  confirmation expires / cancel
                                +----------------------------+
                                |                            |
                                v                            |
active -- Restart/Shut Down --> confirming -- exact confirm -+
  |                                               |
  | short power / Idle                            |
  +-----------------------------------------------+
                                                  v
                                             quiescing
                                                  |
                                      all 7 exact acknowledgements
                                                  |
                                                  v
                                         transition-ready
                                           /            \
                              start idle /                \ start restart/
                                        v                  \ shutdown
                                      idle              power-transfer
                                        |
                         qualified wake source
                                        v
                                      waking
                                        |
                              all 3 readiness gates
                                        v
                                      active

quiescing / transition-ready / waking -- failure or deadline --> fault
any state -- actual unclean electrical loss -----------------> power-lost
```

`fault`, `power-transfer`, and `power-lost` are terminal in one controller
instance. Recovery requires a new boot epoch and privileged boot coordination;
the model has no browser-callable reset or “pretend it succeeded” transition.

## Exact runtime protocol

Every controller instance requires a positive boot/coordinator epoch. Every
request then receives a positive, monotonically allocated safe-integer
operation ID. A confirmation, acknowledgement, failure, or platform handoff
acts only on the exact closed `{epoch, operationId}` reference. Stale,
cross-operation, cross-restart, wrong-epoch, and extra-field messages fail
without advancing the state. The privileged coordinator must provision a
non-repeating epoch for its retained message lifetime.

The native coordinator enforces the same relationship with positive `u64`
identifiers, a caller-supplied nondecreasing monotonic millisecond value,
checked deadlines, and closed Rust enums. Operation references are routing
identifiers, not authority: only the coordinator constructs adapter requests,
each request exposes its exact observation time and deadline, and a completion
must carry a nondecreasing monotonic observation still inside that window.
Late service, wake, and platform completions become terminal without advancing
the gate. Completion is accepted only in the same synchronous host call for
the exact live operation. There is no JSON deserializer or loopback route for
a page-supplied acknowledgement.

Restart and shutdown confirmation lasts 30 seconds. Quiescence, including the
platform handoff from `transition-ready`, lasts 60 seconds. Wake readiness lasts
30 seconds. The caller supplies a monotonic clock; rollback, invalid values, and
deadline overflow are rejected. These prototype limits are deliberately
bounded, not target timing claims.

Quiescence requires all seven closed gates:

1. `launch-admission-closed`;
2. `game-stopped-or-suspended`;
3. `tracker-stopped`;
4. `camera-capture-stopped`;
5. `input-released`;
6. `writes-quiesced`; and
7. `update-state-safe`.

Launch admission must close before any other gate is accepted. The native
coordinator holds a fail-closed lease through the OS handoff and idle; dropping
the lease cannot reopen admission. The game gate
means the exact title reached its manifest-selected safe suspend/checkpoint or
was completely stopped and reaped. The camera gate includes ending capture and
its capture-active indication; it does not infer the position of an
unsensored physical shutter. `input-released` builds on the native registry and
reserved router's deterministic release behavior. `writes-quiesced` requires
all cooperating mutable services to finish or abandon their bounded
transactions and synchronize according to their own durability contracts.
`update-state-safe` requires no root, package-generation, or system-update
record to be awaiting an exact protected-state commit and no candidate boot
transfer to be in an unsafe phase.

Only after all gates pass does the snapshot expose one closed platform target:
`platform-suspend`, `low-power-launcher-idle`, `restart`, or `shutdown`. The
native adapter must match the configured and qualified tier; the browser cannot
select the adapter.

Wake accepts only a platform-qualified physical power button, controller,
remote, or HDMI-CEC event. Unsupported hardware does not become supported
because its enum value exists. Launch admission stays closed until launcher,
display, and input readiness all acknowledge the exact wake operation.
Tracking and camera capture remain stopped after ordinary shell wake; a later
explicit game/session flow may start them.

## Power-button and emergency behavior

| Physical event | Active | Idle | Any transition or fault |
|---|---|---|---|
| Qualified short press | Begin safe idle | Begin wake | No second transition |
| Electrical long-hold cut | Unclean power loss | Unclean power loss | Unclean power loss |

The hardware/firmware long-hold threshold and electrical behavior are not
implemented here. Software must never advertise that emergency removal will
flush state, preserve the latest progress, or enter recovery. D-109 requires
the storage/update design to remain bootable after sudden power loss while
allowing the latest uncommitted progress to be lost.

Restart and Shut Down are not overloaded onto a browser-visible power-button
hold. They remain explicit, confirmable local commands. A short press received
while confirmation, quiescence, wake, or handoff is already active cannot
replace the live operation.

## Boot-only service and recovery flow

```text
sampling
  | \
  |  \ no qualified boot hold
  |   +----------------------------------------------> closed / ordinary boot
  |
  | exact qualified dedicated-service-button hold
  v
service-release-required -- exact release --> service-mode
                                                   |  \
                                    Exit service --+   \ request recovery
                                    to ordinary boot    v
                                             recovery-confirming
                                                      |
                                           fresh physical press
                                                      v
                                         recovery-release-required
                                           /                  \
                           cancel after press /                \ fresh release
                                         v                      v
                       recovery-cancel-release-required   recovery-authorized
                                         |                      |
                         required physical release       one-shot consumption
                                         v                      v
                                  service-mode        closed / enter recovery
```

The initial service-button hold authorizes only a bounded, non-destructive
service environment. Requiring its release prevents a stuck or continuously
held switch from authorizing the next action. Destructive recovery requires a
new press and release after a visible recovery request. Authorization is bound
to one positive boot ID and strictly consecutive physical-evidence sequence,
is one-shot, and closes on ordinary boot, service exit, or consumption.
Canceling before the new press returns directly to service mode. Canceling
after the press first requires its physical release, so cancellation cannot
strand or reuse a held confirmation edge.

The pure object validates the closed evidence shape but cannot prove that the
literal `platform-service-button` came from hardware. Production must construct
the evidence behind a privileged boot-only interface before normal input,
browser creation, network maintenance, or game execution. Controllers, remotes,
HDMI-CEC, Motion input, page script, and ordinary power-button events cannot
mint it. Once ordinary boot proceeds, later service-button events cannot reopen
that boot gate.

The exact physical switch, hold qualification, debounce, timing, indicator,
and permitted service operations remain Q-167 and Q-169. Recovery still needs
the signed image, update-root, protected-state, user-data disposition, and
physical-media evidence tracked by Q-069, I-110 through I-113, and I-186/I-187.

## Abuse-test evidence

[`power-lifecycle.test.ts`](../apps/console-lab/src/launcher/power-lifecycle.test.ts)
contains nineteen deterministic cases covering:

- both tier-native idle targets and short-press idle/wake mapping;
- launch-admission-first ordering and every exact quiescence gate;
- epoch-and-operation-bound restart/shutdown confirmation, cancellation, and
  expiration;
- stale, cross-operation, cross-restart, unknown, and duplicate-safe
  acknowledgement behavior;
- quiescence and transition-ready deadline failure;
- explicit adapter/update failure with no platform transition;
- exact idle handoff and bounded wake readiness;
- unsupported wake sources and gates;
- one-shot restart/shutdown handoff;
- honest unclean power-loss state;
- clock rollback, deadline/identifier exhaustion, invalid IDs, and open-enum
  rejection;
- ordinary boot with no service hold;
- hold-then-release service entry;
- a separate press-then-release recovery confirmation;
- cancellation before or after the confirmation press without retaining
  partial recovery authority; and
- wrong-boot, stale, reordered, forged-source, and unknown physical evidence.

The native suite adds thirteen coordinator cases plus two supporting
launch/process cases covering launch-admission-first snapshots, exact gate
requests, both tier targets, duplicate-idempotent adapters, negative and
ambiguous terminal results, exact confirmation, no cancel after quiescence,
handoff-within-deadline, input qualification, wake-only reopen, retained
closure on fault/drop/unclean loss, cross-epoch/stale refusal, clock and
identifier bounds, pending-activation cancellation, and an atomic watchdog
pre-spawn denial. Dedicated coverage proves late service, platform, and wake
completion cannot advance.

Run:

```powershell
pnpm --filter @vcg/console-lab exec vitest run src/launcher/power-lifecycle.test.ts
pnpm --filter @vcg/console-lab typecheck
cargo test -p vcg-host power --lib
cargo test -p vcg-host atomic_watchdog_launch_boundary_can_cancel_before_spawn --lib
```

## Explicitly unproven

I-029 is active rather than closed. This repository still lacks:

- production wiring for the native coordinator and an authenticated IPC
  protocol;
- proof that every launcher/browser/native game admission path shares the
  native launch closure;
- concrete authenticated tracker, camera, input, storage, update, display, and
  platform adapters behind the existing privileged traits;
- manifest vocabulary and implementation for safe per-title suspend,
  checkpoint, or close;
- systemd/logind, firmware, SteamOS, or Raspberry Pi power adapters;
- physical power/service circuitry, GPIO identity, debounce, timing, stuck-key,
  brownout, and electrical safety evidence;
- compositor display blanking and controller/remote/CEC wake qualification;
- signed recovery media and a complete service/recovery environment;
- exact profile/save/package/reset disposition during recovery;
- target clock, suspend/resume, process, camera-indicator, protected-state,
  filesystem, power-cut, thermal, energy, and endurance campaigns; and
- controller-only cold-boot-through-shutdown evidence.

Q-245 records the unresolved privileged process, peer-authentication, IPC,
epoch provisioning, and target-adapter boundary. The safe default is no
runtime wiring or browser route until that boundary is selected and qualified.

Until those gates pass, this is an executable ordering contract and abuse-tested
design—not evidence that either target can safely suspend, shut down, or
recover.
