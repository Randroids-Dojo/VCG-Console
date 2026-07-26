# Owner questions: SteamOS update-safe content

Date: 2026-07-26
Scope: I-166
Status: decisions required before execution

These questions preserve the strict zero-result plan. Freeze every answer in
an exact reviewed protocol before the first affected build or target action.
An answer does not by itself authorize a build, install, account interaction,
camera/controller operation, OS update, recovery reimage, selection,
qualification, tier change, or publication.

## SUC-001 - Exact received SteamOS target

Which received hardware revision, inventory, firmware, SteamOS image, kernel,
drivers, Gamescope/compositor, Flatpak/Steam runtime versions, storage layout,
supported writable roots, and read-only-root baseline form the target? Define
clean-state preparation, immutable evidence, and every change that invalidates
results.

## SUC-002 - Candidate comparison and selection rule

Must both Flatpak and self-contained Steam-runtime candidates complete every
scenario before selection, and what predeclared rule chooses between qualified
candidates? Freeze priorities for update safety, accountless launch,
containment, camera/graphics/input access, performance, recovery,
maintainability, and supported-platform status without choosing weights after
outcomes are visible.

## SUC-003 - Source, reproducible build, signing, and rights

Which exact source revision, dependency locks, compiler/toolchain/container,
browser/runtime/tracker/model assets, clean-build protocol, SBOM/license/notice
review, signing roles, key custody, artifact format, and release identity apply
to both candidates? Who authorizes build and signing operations?

## SUC-004 - Flatpak manifest and sandbox

Approve the exact application ID, runtime/SDK, extensions, finish arguments,
portals, devices, filesystems, sockets, IPC, display/audio/GPU/camera/input
permissions, background behavior, update remote, signature policy, and data
locations. Which permissions are mandatory, and which excess permission is an
automatic rejection?

## SUC-005 - Self-contained Steam-runtime content

Approve the exact runtime/base image, dependency closure, application/non-Steam
entry, launch wrapper, sandbox or bubblewrap policy, environment clearing,
device/network/filesystem access, writable roots, update channel, signature
policy, and descendant ownership. How is it supported without modifying the
read-only root or depending on Steam identity?

## SUC-006 - Install, launch, accountless, and offline protocol

What supported path installs and launches core VCG with no Steam login,
remembered credentials, account identifier, online first launch, or Steam
client identity? Define cold boot, manual/controller launch, offline restart,
account removal, network loss, and the visible separation of Steam-only
features.

## SUC-007 - Component supervision and readiness

Which owner starts and contains the launcher, browser, tracker, and Motion API;
which exact process/cgroup/service relationships are required; and which
independent signals prove focused responsive readiness? Define absolute
timeouts, heartbeat/liveness behavior, restart limits, descendant reaping,
launcher recovery, and the handling of partial component readiness.

## SUC-008 - I-167 camera and permission prerequisite

Which exact I-167 result must pass before real tracking is permitted? Freeze
camera identity/mode, Flatpak or content permission path, portal/device
bindings, microphone disablement, privacy/activity indication, disconnect,
reconnect, suspend/resume, latency, and the distinction between safe
unavailable handling and actual capture qualification.

## SUC-009 - Controller and reserved actions

Which exact controller/remote samples, mappings, glyph policy, Steam Input or
native input boundary, and compositor routes apply? Define controller-only
launch/navigation/exit, focus restoration, input epochs, and unstealable Home,
Back, and Pause during fullscreen, pointer lock, browser capture, hangs,
crashes, sleep, update, and recovery.

## SUC-010 - Root, filesystem, network, IPC, and device oracles

Which independently trusted before/after snapshots prove zero read-only-root
changes and no writes outside declared roots? Define filesystem event,
network, DNS, socket/IPC, process, device, camera, microphone, GPU, audio, and
display observation; background traffic; update noise; uncertainty; and how an
oracle failure invalidates a cycle.

## SUC-011 - Profiles, saves, caches, logs, and data disposition

Approve exact disjoint package/profile/save/cache/log/diagnostic roots,
ownership, quotas, encryption/protection dependencies, update/rollback
compatibility, low-space behavior, corruption handling, and controller-confirmed
uninstall preserve/delete semantics. What synthetic canaries prove isolation
without placing real profile IDs, saves, or secrets in evidence?

## SUC-012 - Suspend, SteamOS update, and content lifecycle

Which sleep/resume modes, OS update transitions, content updates, health
failures, rollbacks, interruptions, power conditions, and repetitions apply?
Freeze input-epoch reset, camera shutdown, component recovery, package
survival, writable-data integrity, and the rule that no passing recovery may
require read-only-root repair.

## SUC-013 - Recovery reimage and supported reinstall

Which official recovery/reimage path, media, backup prohibition, expected
writable-data disposition, package reacquisition source, signature checks,
accountless reinstall path, and controller workflow are tested? Define what is
expected to survive, what is expected to be permanently lost, and how the
result remains truthful without silently claiming backup or migration.

## SUC-014 - Workload and schedule

Which local package/game, browser surface, tracker backend, Motion replay or
qualified camera path, controller tasks, fault injections, update versions,
schedule, operators, warmups, cooldowns, and independent reviewers apply to
the 32 cells and 640 valid cycles? Define harness-invalid retests without
replacing product failures.

## SUC-015 - Numeric gates

Freeze maximum artifact and expanded size; p95 install, component-ready,
component-recovery, update, rollback, uninstall, and supported-reinstall time;
Motion delivery overhead; minimum game FPS; maximum p95 frame time; CPU, GPU,
resident memory, persistent-storage growth, and log growth. Define instruments,
sampling, uncertainty, and per-candidate/scenario no-rescue treatment.

## SUC-016 - Data rights, privacy, retention, and incidents

Approve the closed result schema, opaque labels, redaction, screen/audio/camera
rights, account-data prohibition, network capture treatment, crash/core/minidump
policy, private-key exclusion, custody, access, retention, verified deletion,
incident response, and adverse-evidence preservation. Who verifies that no
Steam identity, credential, profile/save content, path, environment, argument,
arbitrary message, or free text enters the result?

## SUC-017 - Operation, qualification, selection, and tier authority

Who may authorize builds, target operation, installs/uninstalls, account or
service interaction, camera/controller use, SteamOS updates, suspend/recovery,
and destructive reimage? Who may declare a candidate qualified, select one,
publish results, or change product support? State explicitly that an I-166 pass
does not close I-167/I-170, replace the ordinary x86 or Pi reference tiers, or
make Steam Machine the primary VCG appliance.
