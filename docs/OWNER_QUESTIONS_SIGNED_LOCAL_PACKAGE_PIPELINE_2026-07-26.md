# Owner questions — I-181 signed local-package pipeline

Date: 2026-07-26

Status: non-blocking for strict plan validation; blocking for example-package
selection, build, signing, installation, execution, target qualification, or
publication

## Q1 — Example game and rights authority

Which exact controlled game source revision must be packaged in both bundled-
web and native form, and who may authorize those four test releases?

Provide an independently reviewable code/content/trademark/dependency rights
record. The existing public manifest fixtures, built-in obstacle sample, and
community-admission fixture are synthetic evidence and cannot become a signed
production package by implication.

## Q2 — Exact Linux targets

Which exact AArch64 and x86-64 Linux hardware, OS image, kernel, graphics/audio/
input stack, compositor, browser or native runtime, service manager, and power
configuration must independently qualify?

Windows, WSL2, one architecture, or an architecture-neutral web artifact
cannot qualify either target result.

## Q3 — Reproducible build boundary

Select the hermetic build system, pinned toolchain/container identities,
dependency source and lock policy, timestamp/locale/path normalization,
network policy, SBOM/provenance format, and two-clean-builder independence
rule.

Freeze whether byte identity applies to the complete release archive, each
runtime artifact, debug-symbol handling, and any separately signed metadata.

## Q4 — Signing, delegation, and key custody

Who owns the package-release and installed-catalog roles, thresholds,
expiration/rotation/revocation policy, offline roots, signer isolation, trusted
time, audit, incident response, and test-versus-production namespaces?

No private key material may enter the repository, benchmark artifact, runtime
package, browser, game, or ordinary host log.

## Q5 — Local-web production adapter

Which host-owned loopback server, exact HTTPS/origin policy, browser engine,
kiosk wrapper, profile/storage partition, service-worker/cache policy,
certificate/trust boundary, process owner, network sandbox, and readiness
producer implement signed local-web packages on both targets?

Define how immutable package bytes map to one origin without port/origin reuse
leaking storage across games or profiles, and how the host proves usable input
rather than accepting first pixels or a package-controlled boolean.

## Q6 — Native sandbox and compositor adapter

Select the native package sandbox, immutable executable handoff, cleared
environment, filesystem/device/network policy, user/namespace/cgroup/service
ownership, descendant containment, GPU/audio/display access, compositor surface
identity, focus/readiness oracle, and termination/reaping contract.

The current direct-child adapter is process-only and cannot qualify hostile or
family-mode native code.

## Q7 — Motion, controller, and reserved actions

Freeze the Motion `0.4.0` projection, permission admission, exposure clock,
IPC transport, controller mapping/glyph source, hot-plug behavior, and OS/
compositor ownership of Home, Back, and Pause for each runtime and target.

Define the representative workload and physical evidence that prove usable
input, zero stolen reserved actions, and the unchanged 120 ms p95/precision/
recall gates.

## Q8 — Network and service enforcement

Select default-deny enforcement for local-web and native packages, exact origin
or endpoint declarations, DNS behavior, optional-service failure UX, family-
mode policy, firewall/sandbox audit source, and the rule for loopback services.

An honest manifest declaration without target enforcement is not a network
qualification.

## Q9 — Saves, quota, migration, rollback, and uninstall

Freeze per-game/per-profile save schemas and quotas; native and browser storage
mapping; low-space behavior; schema migration and rollback compatibility;
healthy-update preservation; reset/factory-reset/card-loss behavior; and the
controller-confirmed preserve/delete choice at uninstall.

Specify how rollback avoids deleting or rewriting newer saves even when an old
game build cannot interpret them. Export, backup, cloud sync, and cross-device
migration remain unavailable unless separately approved.

## Q10 — Health, recovery, numeric gates, and authority

Select local-web and native health/readiness producers, post-activation failure
and rollback policy, interruption injection points, update/uninstall recovery,
and all still-null package-size, install/update/rollback/uninstall duration,
CPU/RAM/GPU, quota, jitter, and recovery thresholds.

Identify who may authorize the 960-cycle campaign, destructive target
mutations, signing, installation, update/rollback/uninstall, evidence release,
and any later package publication. Passing qualification must not itself grant
publication authority or select a catalog-wide runtime default.
