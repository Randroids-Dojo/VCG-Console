# Owner questions: catalog controller-only qualification

Date: 2026-07-26
Scope: I-089
Status: decisions required before execution

These questions preserve the strict zero-result plan. Answers must be frozen
into exact reviewed protocols before affected evidence is collected. An
answer does not by itself authorize target operation, physical device use,
game/account interaction, recording, catalog mutation, qualification, or
publication.

## CCO-001 - Exact target and runtime tuples

Which ordinary x86 Linux and Pi 5 images, kernels, drivers, compositor,
browser, launcher, supervisor, configuration, and hardware revisions form the
two targets? Define artifact digests, clean-state preparation, and every
change that invalidates evidence.

## CCO-002 - Controller sample set and mappings

Which exact physical samples satisfy the first-party, second-vendor, and
generic/ambiguous roles, including vendor/product IDs, revision, transport,
firmware, receiver, battery/power state, mapping database, glyph policy, and
minimum independent sample count per role? Define how unsupported generic
devices remain visible without being granted compatibility.

## CCO-003 - Recovery remote and privileged routing

Which exact recovery remote, receiver, mapping manifest, compositor bindings,
and launcher routes are qualified? Freeze Home, Back, Pause, retry, exit, and
shutdown ownership; game nonreceipt requirements; timing gates; and behavior
when the game holds focus, fullscreen, pointer lock, or is hung.

## CCO-004 - Per-game controls and ordinary-play scripts

Approve one versioned script for each of the 26 games defining title/menu
readiness, correct glyphs, ordinary-play start, primary mechanics, pause,
retry/restart, declared failure, text entry, safe return, and forced exit.
How many distinct primary mechanics and how much ordinary gameplay are
required per valid trial without choosing the answer after results?

## CCO-005 - Input and feature applicability ledger

For every game, which keyboard, pointer, touch, text-entry, authentication,
network, storage, permission, accessibility, multiplayer, and optional-feature
requirements are applicable? Define when a requirement blocks controller-only
qualification versus when a clearly optional path may be excluded.

## CCO-006 - Participants and comprehension

Are adult and child participants required for television/control/glyph/error
comprehension, and if so how many independent participants per cohort? Freeze
consent/assent, supervision, inclusion/exclusion, repeat participation,
assistance, withdrawal, replacement, language, accessibility, and the minimum
per-task comprehension gate.

## CCO-007 - Controller detection and action timing

Freeze maximum controller-detection p95 and controller-to-game-action p95,
including the stimulus timestamp, game-observation point, common clock,
uncertainty budget, invalid-attempt rules, and per-game/target/controller
reporting. Browser receipt alone cannot stand in for game action.

## CCO-008 - Reconnect and lifecycle timing

Freeze reconnect p95, disconnect detection, held-action release, controller
epoch, same-device and replacement-slot semantics, sleep/wake behavior, and
the deadline for stable responsive control. Define how ambiguous or late
recovery is scored without allowing another scenario to rescue it.

## CCO-009 - Fullscreen, focus, pointer-lock, hang, and crash oracle

Which independent oracle proves focus/capture state, stale-input absence,
reserved-action delivery, supervisor intervention, process disposition, and
responsive launcher recovery for every lifecycle fault? Define injected
faults, timeouts, state digests, logging, adjudication, and harness-failure
retests.

## CCO-010 - Reserved-action and recovery timing

Freeze maximum reserved-action p95 and recovery-to-responsive-launcher p95.
Specify whether timing begins at physical actuation or host receipt, how
game nonreceipt is proved, and how simultaneous game/controller/remote events
are ordered and scored.

## CCO-011 - Television fixture and visual comprehension

Which television models, modes, resolutions, refresh rates, overscan/safe-area
settings, viewing distances, lighting, capture/calibration method, and critical
screens are required? Freeze glyph/focus/action/error/exit oracles and the
minimum comprehension rate without letting a best-case display rescue another
fixture.

## CCO-012 - Audio fixture and gates

Which television/receiver/speaker path, sample format, volume, acoustic
conditions, expected audio cues, synchronization method, meter, and uncertainty
apply? Freeze maximum output latency and dropout duration plus recovery and
focus-transfer rules.

## CCO-013 - Controller-only text entry

Which games genuinely require text entry, what controller-only keyboard or
selection UI is permitted, which characters and error corrections are tested,
and what minimum characters per minute and maximum error rate apply? Define
how authentication, personal data, chat, arbitrary free text, and optional
name entry are excluded or safely handled.

## CCO-014 - Services, accounts, networking, and permissions

Which game services, domains, test accounts, licenses, network conditions,
storage, browser permissions, and failure modes may be used for each game?
Approve secret injection/redaction, reset, retention, incident handling, and
the distinction between unavailable service, product failure, and invalid
harness evidence.

## CCO-015 - Performance and resource gates

Freeze minimum game FPS and maximum p95 frame time per game and target, plus
any CPU, GPU, memory, temperature, power, network, dropped-frame, and error
gates required for ordinary play. Define measurement tools, stabilization,
sampling, uncertainty, throttling, and no-aggregate-rescue behavior.

## CCO-016 - Data, recording, rights, privacy, and deletion

Approve the closed result schema, opaque labels, allowed redacted evidence,
screen/audio/room capture rights, adult consent and child assent if relevant,
security, custody, access, retention, verified deletion, incident response,
and support/export exclusions. How are failed and adverse attempts retained
without preserving credentials, personal data, free text, raw media, paths,
or query-bearing URLs?

## CCO-017 - Schedule, operation, admission, and publication authority

Who approves the randomized schedule, operators, warmups, breaks, 81,120
required observations, independent review, abandonment rules, and operation
authority? Who may declare each game/target/controller disposition and the
catalog result? State explicitly who may change manifests or permissions,
admit or quarantine a game, publish controller/offline/family-mode claims,
and require a fresh campaign after a relevant change.
