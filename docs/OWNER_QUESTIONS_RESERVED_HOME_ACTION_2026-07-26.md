# Owner questions: reserved Home action

Date: 2026-07-26
Investigation: I-091
Status: questions only; no physical input or target operation is authorized

## I091-001 — Exact target, compositor, and input stack

Which exact Pi and ordinary x86 hardware, firmware, Linux image, kernel,
compositor, seat/input service, privilege boundary, native host, browser, retro
runtime, and clock define each required target? Is the optional Steam Machine
included now or deferred?

Safe default: no target or stack is selected; Windows, WSL, Steam Machine, or
one required target cannot qualify another.

## I091-002 — Controller, remote, and binding decision

Which exact first-party, second-vendor, generic, simultaneous-pair, and recovery
remote samples, model revisions, firmware, transports, Home buttons, guided
mappings, and fallback chords are required? Will 2.4 GHz receiver support be
claimed?

Safe default: no sample, button, chord, mapping, or compatibility claim is
selected. Generic semantics are never guessed from family resemblance.

## I091-003 — Pre-game global reservation design

Which privileged component observes the physical Home edge before every game,
how is the event withheld from web/native/retro runtimes, what permissions and
IPC exist, and how do startup, update, crash, restart, or partial failure remain
fail-closed?

Safe default: application callbacks, Steam Input, browser JavaScript, and
game-owned handlers cannot be the security boundary.

## I091-004 — Home, resume, forced exit, and focus semantics

What exact surface opens on Home, what happens to game input/audio/process state,
where does focus land, how does resume work, and what separate hold/chord,
duration, confirmation, cancellation, and loss policy forces exit?

Safe default: do not choose timings or overload Back/Pause. A game menu or Steam
overlay cannot be the sole recovery authority.

## I091-005 — Runtime representatives and adapters

Which exact signed bundled-web, supervised hosted-web, native, and retro
artifacts represent the four runtime classes on both required architectures?
What wrapper, process tree, focus surface, fullscreen/input-capture method, and
return behavior applies to each?

Safe default: no runtime substitutes for another and no desk artifact qualifies
target behavior.

## I091-006 — Hostile-state fault harness and safety

How are all twelve focus/capture/hang/crash/stall states created repeatably
without corrupting data, escaping owned processes, or trapping the operator?
What stop, cleanup, watchdog, power, and recovery limits apply?

Safe default: no fullscreen, pointer, focus, process, input-flood, or network
fault is authorized until the harness and safety review are frozen.

## I091-007 — Independent oracles

What proves the physical edge, privileged recipient, zero game delivery, input
revocation, system-surface visibility/focus, canonical response, player/owner,
process/surface ownership, and monotonic timing without trusting UI copy or the
game under test?

Safe default: synthetic events, callbacks, screenshots, process exit, and
operator observation cannot substitute for independent structured evidence.

## I091-008 — Schedule, numeric gates, and statistics

Who freezes the 9,600-cycle required order, warmups, invalid-run policy, p95/p99
and worst-case Home deadlines, input-revocation deadline, forced-exit hold and
return time, resume/focus deadline, samples per revision/transport, environment,
operators, and independent review?

Safe default: all outcome-sensitive gates stay null until fixed before the first
operation; no failed or slow attempt is discarded.

## I091-009 — Accessibility and comprehension

Which child/adult, limited-dexterity, one-handed, low-vision, and unfamiliar-user
tasks prove Home, cancellation, resume, and forced exit are findable, distinct,
comfortable, and not accidentally invoked? What remote fallback is mandatory?

Safe default: the plan grants no participant collection. Physical comfort and
comprehension remain owner/human qualification gates.

## I091-010 — Result, sanitization, retention, and incident policy

What closed schema, materializer, redaction review, retention window,
repository/publication boundary, and incident response preserve every adverse
cycle without raw input, stable device IDs, media, paths, account/profile/save
data, entered text, or free-text logs?

Safe default: retain only opaque labels, closed categories, counts, timings,
digests, and metrics.

## I091-011 — Operational authority

Who may operate targets/controllers/remotes, launch packages, change compositor
or input mappings, persist configuration, inject faults, use participants, and
perform recovery? Which actions require a separate safety observer?

Safe default: none of those operations is authorized by the plan.

## I091-012 — Qualification and product policy authority

Who reviews each target/input/runtime/state cell, approves compatibility claims,
selects the shipping Home binding and forced-exit semantics, and authorizes
publication or changes to D-008/D-028/Q-046/Q-079?

Safe default: a passing matrix permits review only. It does not silently select
product controls, weaken separate Back/Pause requirements, or publish support.
