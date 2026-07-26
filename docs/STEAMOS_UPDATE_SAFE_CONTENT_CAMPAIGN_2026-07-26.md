# SteamOS update-safe content campaign

Date: 2026-07-26
Scope: I-166
Status: blocked strict zero-result pre-registration

## Claim boundary

This campaign defines the evidence required to package the VCG launcher,
embedded browser, tracker, and Motion API as update-safe SteamOS content. It
does not claim that the optional Steam Machine has been received, inventoried,
booted, modified, or qualified; that a SteamOS image or supported writable
application root has been selected; or that any Flatpak or Steam-runtime
artifact exists, installs, launches, survives an update, or passes.

Existing Windows, ordinary Linux, Raspberry Pi, browser, native-process,
signed-package, and vendor-description evidence remains useful source
material. None of it can substitute for an exact received-target result. The
Steam Machine remains an optional later compatibility target and cannot
replace either required reference tier through this campaign.

## Product boundary

Core VCG operation must not depend on a Steam login or expose Steam identity
to local profiles. The selected package must keep the launcher, browser,
tracker, Motion API, installed local packages, profiles, saves, caches, and
logs inside reviewed writable application/data roots without modifying or
repairing the read-only SteamOS root. Steam-only games, store, community,
cloud, or account features remain separate and visibly disclosed.

The package must contain or close the runtime dependency boundary for four
roles:

1. the VCG launcher and recovery surfaces;
2. the independently supervised embedded browser;
3. the tracker process and its safe unavailable/failure states; and
4. the Motion `0.4.0` API and component health boundary.

First pixels, process liveness, a browser bridge hello, or a vendor launcher
entry does not prove that the package is focused, responsive, controller
usable, contained, healthy, or update-safe.

## Candidate comparison

The plan freezes two candidates:

- `flatpak-writable-content`, with an exact Flatpak manifest, runtime,
  dependency closure, sandbox, portal/device policy, and update channel; and
- `self-contained-steam-runtime-content`, with an exact content manifest,
  Steam runtime/dependency closure, sandbox, launch entry, and update path.

Both candidates must be attempted under one predeclared selection rule before
the first build. A failed or stopped candidate remains in the evidence. A
non-selected candidate may fail without being called qualified, but another
candidate cannot rescue any failed cell of the selected candidate. Desk
builds, a different Linux distribution, or a vendor recommendation cannot
select either candidate.

## Target and authority prerequisites

Before any build or operation, bind:

- the exact received hardware, inventory, SteamOS image, kernel, drivers,
  Gamescope/compositor, firmware, writable application roots, and read-only
  root baseline;
- exact source revision, reproducible toolchain, manifests, dependency
  closures, SBOM/license/rights review, signing/delegation policy, and build
  recipes for both candidates;
- supported install, launch, offline, accountless, Steam-feature separation,
  update, rollback, uninstall, suspend, recovery, reimage, and supported
  reinstall protocols;
- component supervision, descendant ownership, browser/tracker/Motion
  readiness, controller/reserved input, network/IPC/filesystem/device policy,
  writable-data handling, independent oracles, schedule, and numeric gates;
  and
- data rights, privacy, retention, deletion, incident handling, and explicit
  authority for each destructive or external action.

All bindings and authorities remain null or false in the tracked plan.

## Required lifecycle matrix

Each candidate runs all 16 scenarios independently:

1. two clean reproducible builds;
2. installation from a supported writable location;
3. launch with no Steam login or identity dependency;
4. launcher, browser, tracker, and Motion readiness;
5. controller-only launch, navigation, and exit;
6. Home, Back, and Pause while focus/fullscreen/capture is contested;
7. local-package and offline restart;
8. simultaneous game, tracker, and Motion workload;
9. camera denied/unavailable state and recovery;
10. component crash plus bounded restart;
11. sleep/resume with input-epoch reset;
12. survival of a SteamOS update without root repair;
13. content update, health failure, and rollback;
14. interrupted content-update recovery;
15. controller-confirmed uninstall with explicit preserve/delete disposition;
    and
16. recovery reimage plus truthful supported-reinstallation disposition.

The two candidates by 16 scenarios form 32 cells. Twenty valid cycles per
cell require 640 cycles. Every cycle observes all four component roles plus
root, process, input, Motion, network, data, and recovery oracles. Failed,
invalid, stopped, retried, interrupted, and adverse cycles remain visible.

## Separate camera boundary

I-166 must package the tracker and safely handle camera denied, unavailable,
disconnect, and recovery states. It does not qualify USB camera access or
permissions. The exact I-167 result must separately prove the received camera,
SteamOS/Flatpak or content permissions, privacy indicator, microphone
disablement, reconnect, suspend/resume, and low-latency capture path before a
selected package may claim real tracking.

Likewise, a synthetic/replay Motion handshake proves integration only. It
cannot replace exposure-authoritative camera-to-game latency, pose accuracy,
or real-room action evidence.

## Fixed acceptance boundary

The tracked gates require two byte-identical clean-build artifacts, at least
20 valid cycles per candidate/scenario, local interactive readiness within 15
seconds, and warm resume within five seconds. They permit zero:

- read-only-root modifications or writes outside declared writable roots;
- undeclared network, IPC, filesystem, or device access;
- Steam-login or identity dependency for core VCG operation;
- credential, token, Steam identity, personal-data, path, or free-text
  disclosure;
- unowned descendants, escaped processes, swallowed or game-delivered
  reserved actions, Motion version/capability/epoch mismatch, silent data loss
  or corruption, or unaccounted component restarts; and
- valid selected-candidate product failures.

The selected package must remain runnable after a SteamOS update without
read-only-root repair. Every selected-candidate cell must pass; no aggregate
may rescue failure.

Seventeen outcome-sensitive gates remain null: artifact/expanded size;
install, component-ready, component-recovery, content-update, rollback,
uninstall, and supported-reinstall timing; Motion delivery overhead; game FPS
and frame time; CPU, GPU, and resident memory; persistent storage growth; and
log growth. Freeze them before the first build, never from observed outcomes.

## Evidence and privacy

The result envelope permits opaque candidate, target, build, component,
cycle, and account-state labels plus closed reason codes, counts, timings,
digests, and redacted categories. It excludes raw screen, room, player,
controller, camera, audio, or video data; credentials, tokens, cookies, Steam
IDs/account names, profile IDs, save contents, storage values, paths, query
URLs, environment values, process arguments, arbitrary messages, private
signing keys, crash/core/minidump/memory contents, and free text.

Declared package/service traffic is the only permitted egress. Collection of
screens, audio, people, accounts, camera data, or destructive update/reimage
evidence requires a separately approved protocol and authority.

## Honest stopping point

This document and its machine validator convert I-166 into an auditable
blocked campaign. They do not build, sign, install, execute, update, suspend,
reimage, qualify, or publish either package candidate; prove I-167; authorize
account or camera use; change a product tier; or select SteamOS as the primary
VCG appliance.
