# Owner questions — I-171 SteamOS outer-shell lifecycle

Date: 2026-07-26
Status: unresolved choices for the blocked I-171 campaign

The plan remains safe without answers because target operation, configuration,
screen capture, fault injection, update, shutdown, route selection, and
publication are all denied. Resolve these questions before moving the matching
`sol-*` blocker to ready.

## SOL-001 — exact target or proxy tuple

Which received Steam Machine may qualify I-171, and which supported AMD SteamOS
device, if any, may be used only to exercise the harness? Bind hardware, storage,
firmware, SteamOS image/build, kernel, Steam client channel/build, Gamescope,
display/TV, controller, network, and power-observation identities.

Safe default: wait for the exact delivered Steam Machine. Label every proxy run
development-only and never carry a proxy result into the exact row.

## SOL-002 — required product route

Must a shipping SteamOS appliance enter VCG automatically after stock boot, is
manual selection of a prominent Gaming Mode entry acceptable, or is Desktop
Mode only a recovery/development route? Define the visible owner and permitted
number of controller actions for ordinary boot.

Safe default: test all three candidates without selection. Do not describe
manual or Desktop launch as automatic entry.

## SOL-003 — supported automatic-entry method

Which current Valve-supported interface may configure automatic VCG entry, and
what exact update, disable, uninstall, safe-mode, and repair behavior makes it
supportable? If none exists, should the automatic route be recorded as
incompatible rather than implemented through an unsupported session override?

Safe default: make no persistent SteamOS or Steam client mutation. Record the
route as blocked until Valve documentation or an exact supported interface is
bound.

## SOL-004 — package and wrapper

Which signed I-166 package, native wrapper, launcher build, dependency closure,
installation root, Gaming Mode shortcut, Desktop entry, and health/readiness
contract may the campaign exercise?

Safe default: wait for a qualified I-166 result. A development checkout,
unsigned wrapper, or non-Steam shortcut alone cannot become the product package.

## SOL-005 — accountless dependency

Which completed I-170 result proves that core VCG operation remains accountless
despite stock Steam Machine setup currently guiding Steam login? What Steam
fixture, if any, may be used only for the I-171 overlay/outer-shell comparison
without being treated as a core dependency?

Safe default: keep I-170 independent and blocking. A logged-in I-171 run cannot
rescue or weaken D-118.

## SOL-006 — brand assets and state vocabulary

Which VCG logo, OCR-A usage, colors, motion, sounds, loading copy, failure copy,
safe areas, legal marks, localization set, and platform/VCG ownership labels are
approved for the prototype videos?

Safe default: use the current internal prototype treatment only as a labeled
test fixture. Do not publish it or treat it as owner-approved branding.

## SOL-007 — controller, reserved actions, and Overlay

Which completed I-169 route and controller samples may feed I-171? Define the
exact Steam/Home, Back, Pause, Overlay open/close, pause/resume, focus, input
epoch, glyph, and hung-client oracles for the selected wrapper.

Safe default: Steam/Home and Overlay stay platform-owned, Back stays available
to the trusted host, and no game or page receives or swallows either action.

## SOL-008 — update, rollback, repair, and reimage

Which stock SteamOS and Steam client update channels, before/after versions,
package-integrity checks, route-integrity checks, rollback behavior, repair
behavior, reimage boundary, and reinstall procedure must run? Which data is
expected to survive each operation?

Safe default: do not disable, pin, mask, intercept, or alter stock update and
recovery. Treat reimage as destructive and require explicit authorization and a
separate preservation expectation.

## SOL-009 — crash and hang protocol

Which exact local game/package may be faulted, and how will the harness cause a
contained crash, renderer hang, health-contract loss, child-tree leak, and
failed retry without corrupting user data or the platform? What recovery-time
gate and recurrence count must pass?

Safe default: use a signed disposable fixture only after fault authority is
granted. Retain every fault attempt and keep the recovery-time gate null until
the protocol is frozen.

## SOL-010 — SteamOS shutdown adapter

Which native SteamOS adapter may receive the coordinator's one-shot shutdown
handoff? Define authentication, service identity, required quiescence, deadline,
terminal error behavior, controller confirmation, external power-state oracle,
and recovery after an ambiguous handoff.

Safe default: do not call an OS shutdown command from the browser or an
unqualified child. Exercise the coordinator only with a reviewed adapter and
external power observation.

## SOL-011 — schedule, gates, and review

Who freezes target-route-scene order, warmup, cool-down, 20-cycle repetition,
timeouts, retry rules, invalidation rules, timebases, uncertainty, reviewer, and
all currently null crash/update/shutdown gates before collection?

Safe default: keep the plan blocked. Do not tune gates or omit adverse scenes
after seeing results.

## SOL-012 — video capture and test identity

Which opaque Steam test identity, library, avatar, friends/chat state,
notification policy, account/network entry method, capture device, crop/mask,
sanitization reviewer, storage location, retention period, deletion proof, and
incident response are authorized? May any audio be captured?

Safe default: authorize no screen or audio recording. Never use a household or
developer's ordinary Steam account in retained evidence.

## SOL-013 — controller-only, TV, and accessibility review

Which controller-only participants or reviewers, TV sizes/distances, resolutions,
HDR/SDR modes, safe-area checks, text/action-target thresholds, color/motion/
audio accessibility settings, and Steam-versus-VCG ownership comprehension
tasks are required?

Safe default: retain current machine checks as development evidence only. Do
not claim living-room usability or ownership comprehension without the selected
review.

## SOL-014 — operation authority

Who may authorize target use, Steam fixture creation, network use, package and
route configuration, platform/client mutation, automatic-entry experiments,
fault injection, stock updates, rollback/repair/reimage, shutdown, power
cycling, video capture, artifact retention, and any external service traffic?

Safe default: all remain unauthorized. A plan or available tool is not
permission to operate it.

## SOL-015 — adverse evidence and incident policy

What requires an immediate stop: identity disclosure, unexpected network
traffic, platform corruption, update failure, boot failure, stuck input, loss of
camera privacy, write corruption, runaway child, unsafe power state, or capture
sanitization failure? Who reviews, recovers, and decides whether testing may
resume?

Safe default: stop on any unplanned identity, credential, network, mutation,
privacy, update, recovery, or power event. Preserve a closed redacted incident
category and do not delete the failed cycle.

## SOL-016 — result and publication authority

Who independently reviews the 48 cells and 960 cycles, selects or rejects a
route, determines I-171 compatible/blocked/workaround-dependent disposition,
approves branding, and authorizes any sanitized videos or claims for
publication? What limitations must accompany the result?

Safe default: keep `result` null, select no route, publish nothing, and state
that the tranche is a pre-registered plan rather than SteamOS qualification.
