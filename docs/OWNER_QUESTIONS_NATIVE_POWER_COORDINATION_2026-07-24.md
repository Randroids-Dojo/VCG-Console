# Owner question: native power coordination boundary

Last updated: 2026-07-24

The Rust coordinator now enforces launch-admission-first ordering and invokes
only host-selected adapters. It intentionally does not choose a process model,
transport, credential, service manager, or platform power API. The following
decision is required before the coordinator can be wired into the appliance.

## Q-245: privileged process and acknowledgement boundary

Which exact native process owns the power coordinator, and how does it
authenticate each tracker, camera, input, writable-state, protected-update,
display, wake-input, and platform-handoff result on both target tiers?

Safe default: keep the coordinator in the same privileged appliance service as
native launch admission; expose no browser or general loopback route; use
direct same-process adapters where the service already owns the subsystem; and
otherwise require a fixed local service identity plus mutually authenticated,
operation-bound, deadline-bound IPC. An adapter must fail `Unavailable` when
peer identity, service epoch, operation reference, response freshness, process
scope, or result completeness is ambiguous. Do not accept a bearer flag,
pathname, page callback, ordinary user-session socket, or deserialized gate
name as proof.

The answer must identify:

- the coordinator process, privilege account, sandbox, startup order, and
  restart relationship to the launcher and game supervisor;
- the concrete transport and peer authentication for every out-of-process
  adapter;
- which service owns and monotonically provisions the non-repeating
  coordinator epoch;
- how launch exclusion, tracker/camera stop, input release, mutable-service
  synchronization, and all pending protected-state commits are proven for the
  same live operation;
- whether a service restart during quiescence is terminal or has a separately
  authenticated recovery protocol;
- the exact systemd/logind, firmware, SteamOS, or Raspberry Pi handoff selected
  for each tier;
- the display/input readiness producers and qualified controller, remote, and
  HDMI-CEC wake sources;
- audit codes and local recovery UX for timeout, unavailable peer, unsafe
  update state, failed handoff, and wake failure; and
- why no browser, game, Motion input, paired developer session, or ordinary
  controller event can implement or select an authority-bearing adapter.

Evidence needed to close Q-245:

- hostile local-user and hostile-page attempts to forge, replay, reorder, or
  cross-bind every adapter result;
- coordinator/service restart and stale-epoch tests at every protocol phase;
- same-race process-start injection proving the native launch closure wins
  before another direct or watchdog child can spawn;
- crash, hang, disconnect, partial-write, full-disk, and protected-state
  ambiguity tests for every acknowledgement producer;
- target traces showing launch admission stays closed through OS handoff,
  idle, and wake readiness;
- proof that tracker and camera capture are stopped and the capture-active
  indicator is correct before handoff;
- exact suspend/resume, shutdown/restart, controller-only recovery, and
  unclean-power-cut campaigns on both reference tiers; and
- independent security review of the final privilege and IPC boundary.

Q-167 through Q-169 still select the physical service control, per-game idle
disposition, and boot-service authority. Q-245 does not authorize recovery,
choose those policies, or turn the current adapter traits into target evidence.
