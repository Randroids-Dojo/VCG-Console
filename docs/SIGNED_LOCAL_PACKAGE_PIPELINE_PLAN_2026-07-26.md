# Runtime-neutral signed local-package pipeline plan — 2026-07-26

Status: strict blocked I-181 qualification plan; no example package, target
result, runtime selection, publication, or product qualification exists

Authority: D-019, D-051, D-056, D-057, D-106, D-110, I-094, I-099, I-181,
I-185 through I-191, I-201, I-209, Q-047, Q-052

## Purpose

I-181 requires controlled games to use one independently signed package
lifecycle without forcing every game into the same payload runtime. The
checked-in plan turns that requirement into a reproducible cross-runtime and
cross-architecture qualification contract before an example game, build,
signature, target mutation, or package publication is authorized.

The contract covers four independent lanes:

1. one bundled local-web release on AArch64 Linux;
2. the identical local-web release identity on x86-64 Linux;
3. one native AArch64 Linux release; and
4. the same native release identity with an independently built x86-64 Linux
   artifact.

The architecture-neutral web bundle still needs a separate physical target
result on both architectures. A desktop fixture, built-in obstacle sample,
hosted page, Windows run, or one Linux architecture cannot qualify another
lane.

## Existing source boundary

`benchmarks/signed-local-package/runtime-neutral-signed-local-package-plan-v1.json`
binds the exact current bytes of:

- D-019/D-051/D-056/D-057 package and runtime decisions;
- the public game-manifest schema plus its synthetic local-web and native
  fixtures;
- signature-first archive intake, installed-catalog verification, protected
  generation activation, shared launch dispatch, native process planning, and
  runtime-neutral save lifecycle;
- the local-web explicit-readiness boundary; and
- the native-package process-only boundary.

Those sources prove useful implementation components, not an I-181 package.
The signed installed catalog currently dispatches Libretro and native process
plans, while local-web production serving, browser ownership, exact origin,
storage partitioning, and package health remain unimplemented. The native
adapter does not yet prove sandboxing, environment clearing, device/network
filtering, descendant ownership, immutable execution, compositor readiness, or
reserved input on either Linux target.

## Qualification matrix

Every lane must execute all twelve lifecycle scenarios:

- two clean reproducible builds;
- signature-first intake;
- install and architecture selection;
- cold launch to usable input;
- Motion API delivery under representative load;
- controller gameplay and glyphs;
- unstealable Home, Back, and Pause;
- offline operation and declared-network enforcement;
- save creation plus restart and healthy-update preservation;
- health failure and rollback;
- update plus interrupted-update recovery; and
- controller-confirmed uninstall with preserve/delete save disposition.

The plan requires 20 valid cycles in every lane/scenario cell: 48 cells and
960 cycles total. A runtime, target, scenario, average, or aggregate cannot
rescue one failed cell. Failures, retries, interruptions, and rollback reasons
remain part of the result.

## Fixed gates

Existing project requirements remain fixed before any package result:

- two clean builds produce byte-identical release archives and runtime
  artifacts for the same lane;
- every signed manifest, catalog, archive, artifact, build recipe, toolchain,
  and result identity agrees exactly;
- local interactive readiness means usable input within 15 seconds, not first
  pixels or a self-asserted loading screen;
- Motion-enabled examples retain the 120 ms p95 exposure-to-game-API gate,
  95% action precision, 90% recall, and zero unintended privileged actions;
- undeclared network attempts, undeclared device access, escaped descendants,
  and valid product failures remain zero;
- healthy update preserves saves, rollback does not delete or rewrite them,
  and uninstall cannot silently choose their disposition; and
- every lane and every cell must pass without cross-runtime or cross-target
  rescue.

Archive, expanded-size, install/update/rollback/uninstall duration, per-lane
CPU/RAM/GPU, storage quota, readiness jitter, and recovery thresholds remain
null. They must be frozen before the first build so observed results cannot set
their own acceptance criteria.

## Interface and evidence boundary

The signed manifest and installed catalog must agree on version, runtime,
entrypoint, architecture, permissions, input, rights, health, integrity,
network, storage quota, and compatibility. A package cannot choose a program,
arguments, environment, writable path, architecture adapter, browser origin,
or sandbox. The host owns those decisions.

Both runtimes must expose one controller-only lifecycle and Motion `0.4.0`
surface. Games cannot capture Home, Back, or Pause. Local-web requires an exact
loopback origin and qualified browser wrapper; native requires a target sandbox
and complete descendant ownership. Both use host-derived per-game/per-profile
save roots and default-deny network enforcement.

Releasable evidence is digest-bound and cycle-level. It includes two sanitized
clean-build logs, SBOM/license/rights evidence, declared-network attempts, and
all failure/recovery dispositions. It excludes raw camera/audio, save contents,
participant identifiers, free text, filesystem paths, secrets, credentials,
tokens, and private signing material. Motion evidence remains skeleton-only.

## Validation

Run the canonical-plan validator and adversarial suite with:

```powershell
node scripts/validate-runtime-neutral-signed-local-package-plan.mjs
node --test scripts/validate-runtime-neutral-signed-local-package-plan.test.mjs
```

The ten adversarial groups reject stale sources, invented build/signing/runtime
authority, lane or lifecycle weakening, built-in/hosted substitution, interface
or fixed-gate drift, post-result thresholds, unsafe evidence, blocker removal,
premature qualification/publication, unknown fields, malformed encoding, and
noncanonical or oversized JSON.

## Current boundary

This tranche advances I-181 from an unstructured open item to an auditable
blocked qualification plan. It does not implement the local-web adapter, close
the native process-only boundary, select an example game or default runtime,
authorize signing, or prove any package on AArch64 or x86-64 Linux.

Execution remains blocked on the decisions and authorities recorded in
`OWNER_QUESTIONS_SIGNED_LOCAL_PACKAGE_PIPELINE_2026-07-26.md`.
