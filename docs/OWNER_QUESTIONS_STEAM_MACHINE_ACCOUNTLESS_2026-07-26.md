# Owner questions: Steam Machine accountless-core qualification

Date: 2026-07-26
Investigation: I-170
Status: questions only; no target or account operation is authorized

The canonical plan remains blocked until every answer below is frozen. Safe
defaults preserve a zero-result plan and the D-118 accountless-core requirement.

## I170-001 — Exact retail target and custody

Which exact received Steam Machine, hardware revision, serial-redacted custody
record, firmware state, storage assembly, display, network devices, controller,
camera, and power path may be used?

Safe default: no target is selected, received, inventoried, or operated.

## I170-002 — Exact SteamOS and runtime tuple

Which exact SteamOS image, kernel, firmware, GPU/network/input drivers, Steam
client, Gamescope/compositor, browser, tracker, package runtime, and VCG build
digests define the qualification target?

Safe default: no other target, desk host, rolling version label, or vendor
description may substitute for one frozen reproducible tuple.

## I170-003 — Supported accountless first entry

What documented supported path reaches VCG from stock first boot without
entering, remembering, restoring, or silently selecting a Steam account? What
exact state proves no account or stored credential was ever present?

Safe default: Valve's guided login is treated as a blocker. Do not invent an
unsupported bypass or count Steam Offline Mode as accountless.

## I170-004 — Supported install and launch path

What signed package, supported writable root, installation procedure,
auto-start/manual-entry boundary, host supervision, controller path, and
uninstall/reinstall procedure make all six local roles reproducible without
read-only-root edits or Steam ownership?

Safe default: existing desk builds and zero-result I-166/I-181 plans grant no
install or launch authority.

## I170-005 — Core readiness and controller oracles

What independent oracle proves interactive readiness for launcher, tracker and
Motion API, local profiles, signed packages, retro, saves, and unassigned
progress? What controller action, focus recipient, deadline, and failure code
apply to each role?

Safe default: first pixels, process liveness, cached content, bridge hello, or
operator observation cannot establish usable accountless operation.

## I170-006 — Steam process, account, identity, and storage audit

Which bounded tools prove that local VCG neither requires nor reads/writes a
Steam client, SDK, overlay, account ID, credential, token, cookie, cloud record,
or stable Steam-linked storage value? How are false positives and unsupported
opaque containers handled without retaining sensitive data?

Safe default: no raw credentials, identifiers, storage values, paths, or
free-text process output may enter tracked evidence.

## I170-007 — Network faults, egress, and service classification

Who may disable and restore which interfaces, at what schedule points, with
what independent link and traffic oracles? Which exact destinations and flows
belong to local core, VCG hosted content, Steam services, and third parties?

Safe default: no network fault or traffic capture is authorized. Cached content
and silent traffic do not prove local operation.

## I170-008 — Disposable account and removal disposition

If the account-removal scenario is approved, which disposable account may be
used, what data may it contain, how is login/sign-out/removal verified, and
what exact Steam state is deleted? How do we prove that local VCG profiles,
saves, packages, and opaque owners remain independent afterward?

Safe default: do not create, enter, retain, or remove any account. The scenario
stays blocked rather than using a household account.

## I170-009 — Update, reinstall, recovery, and device-only loss

Which SteamOS/VCG update sequence, interruptions, rollback, supported reinstall,
and recovery path may run? What local data is preserved, deliberately lost, or
recreated, and how is device-only identity prevented from returning through
Steam or a support path?

Safe default: no update, repair, reimage, recovery, or destructive operation is
authorized. Recovery cannot infer profile restoration from package availability.

## I170-010 — Schedule, numeric gates, and independent review

Who freezes the 600-cycle order, warmup policy, timing sources, readiness/action
deadlines, network recovery limits, update/recovery limits, storage/log growth
caps, environment, operators, stop rules, and independent result reviewer?

Safe default: all open gates remain null and must be fixed before the first
target operation; no failed or slow cycle may be discarded or reordered away.

## I170-011 — Result, sanitization, retention, and incident policy

What closed result schema, redaction/materialization tool, retention window,
review process, repository/publication boundary, and incident response apply?
How are blocked, invalid, stopped, retried, and worst-case cycles retained
without free text or sensitive identifiers?

Safe default: only opaque labels, closed categories, counts, timings, digests,
and metrics are allowed. No raw screen, audio, camera, input, network, account,
profile, save, package, path, or log data is retained.

## I170-012 — Operational authority

Who may authorize exact target operation, account interaction, network faults,
package installation and launch, local profile/save mutation, SteamOS update or
recovery, evidence review, compatibility publication, and any tier decision?

Safe default: none of those actions is authorized by the plan. A blocked or
failed Steam Machine result keeps the target optional and cannot weaken D-118.
