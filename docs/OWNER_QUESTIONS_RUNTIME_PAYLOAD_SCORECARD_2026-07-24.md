# Owner questions: runtime payload scorecard

Last updated: 2026-07-24

These questions do not block the strict desk baseline. They block final I-182
payload selection, maintenance estimates, and any production package or
catalog change.

## RPS-001: exact Godot title

Should the repository's VCG Tiny Motion Game remain the required "one Godot
title" for the first I-182 comparison, or should a separate production-intent
Godot game replace it before target measurements?

Safe default: retain the small repository sample for plumbing, package,
controller, Motion, and architecture comparison. Do not generalize its result
to a production Godot game. Repeat the scorecard for any materially larger
production title before selecting its payload.

## RPS-002: obstacle sample product boundary

Should the current obstacle component become an independently packaged game,
or remain a console-lab mechanic used only to qualify tracking and actions?

Safe default: keep it a lab component until an explicit package identity is
approved. If it becomes a game, give it a separate manifest, source boundary,
version, save namespace, health check, permissions, rights record, and
reproducible build rather than packaging the entire console lab.

## RPS-003: controlled-title local-build authority

Who may authorize exact source snapshots of VibeBots, Mi Casa Es Su Casa, and
Determined for local build and redistribution work?

Safe default: public repository visibility and organization membership grant
no authority. Require a named owner authorization that explicitly covers code,
assets, title/trademark use, dependencies, modification, both architectures,
offline packaging, corresponding source, and ongoing update rights.

## RPS-004: hosted-service preservation

For each controlled title, which hosted features are essential to the game and
which may be disabled, replaced locally, or presented as unavailable in a
bundled package?

Safe default: preserve the current supervised remote-web path. Do not silently
stub authentication, databases, AI generation, notifications, leaderboards,
feedback, character data, or external assets. A local payload needs a
title-specific owner-reviewed degradation contract and a migration/privacy
review.

## RPS-005: maintenance estimate unit

What comparison unit should the scorecard use for ongoing maintenance:
engineering hours per release, hours per month, annual person-days, or a
bounded low/medium/high class with assumptions?

Safe default: record both estimated engineering hours per supported release
and annual person-days. Name the maintainer, supported runtime/toolchain
horizon, security-response expectation, architecture matrix, and confidence
range. Do not use an unlabeled low/medium/high score.

## RPS-006: selection threshold

Must every rubric dimension pass on both architectures before choosing a
payload, or may a documented exception leave a non-safety dimension open?

Safe default: require every cell to pass. Permit an exception only for a
specific non-safety, non-rights, non-security metric with an owner-approved
bound, visible user impact, fallback, expiry date, and retest trigger. Never
waive Home/Back, watchdog, rights, admission, privacy, integrity, or recovery
requirements through a scorecard exception.

## RPS-007: comparable workload duration

What minimum play and soak duration should be used for the five-title runtime
comparison on each architecture?

Safe default: use identical scripted representative play plus at least a
60-minute concurrent tracker/game soak for every candidate. Add a four-hour
run for a candidate that would become the default or shows thermal, memory, or
resource drift. Keep launch and latency trials separate from soak averages.

## RPS-008: package-size budget

Should I-182 enforce one universal payload-size ceiling or derive per-title
budgets from the selected 256 GB storage plan and rollback policy?

Safe default: use per-title signed limits derived from installed bytes, peak
update bytes, retained rollback generation, cache/save quotas, and reserved
system headroom. Also report normalized bytes for comparison. Do not reject a
runtime solely because its engine overhead is larger if the complete product
still meets storage, update, performance, and maintenance gates.
