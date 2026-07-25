# Owner questions: native diagnostic exclusion qualification

Last updated: 2026-07-24

The current qualification harness proves that one exact host-generated
persistent `NativeDiagnosticStore` tree excludes five synthetic device-only
field canaries, two stable vault path segments, and an exact seeded-source
copy. It does not select a production support/export artifact or release
authority.

## Q-249: production materialization and release-evidence envelope

Which exact production artifacts and tool identity must bind the native
diagnostic I-186 result on Raspberry Pi OS and ordinary x86-64 Linux?

Safe default:

- treat the live persistent store, any reviewed snapshot representation,
  support bundle, crash report, service journal, core-dump configuration, and
  temporary collection directory as separate producers;
- keep the native store itself non-serializable and non-exporting until
  Q-149/Q-246 select a privileged one-shot review/export service;
- quiesce each selected producer or take a read-only filesystem snapshot
  before scanning; never claim stability from a concurrently mutable live
  tree;
- bind exact target/build identity, raw artifact or snapshot digest, complete
  path inventory, materializer executable digest/version/configuration,
  verifier version, closed result, and independent positive-control result;
- retain only the path-free result and nonsensitive build/tool provenance;
  destroy seeded sources and materialized trees after review; and
- fail the release when any producer is unseeded, unmaterialized, unstable,
  truncated, opaque, or absent from the inventory.

Decisions required:

1. Identify whether production support collection exists at all and name its
   privileged OS owner.
2. Select the exact filesystem snapshot or quiescence mechanism on both target
   classes.
3. Decide whether service-manager journals and disabled/enabled core-dump
   configurations are separate release cells.
4. Select the signed evidence-envelope schema and independent release reviewer.
5. Define whether the persistent diagnostic store is scanned in place from a
   read-only snapshot or copied through a separately qualified materializer.
6. Confirm the destruction and retention policy for synthetic seeded sources,
   materializations, and path-free reports.

Evidence needed before closing Q-249:

- exact target builds and service identities;
- a complete native diagnostic/support/crash artifact data-flow inventory;
- pinned snapshot/materializer tools with hostile-layout and completeness
  tests;
- producer-specific field/path/digest canaries and separate positive controls;
- interrupted collection, concurrent writer, full-disk, read-only,
  corruption, reboot, update, rollback, clear, and factory-reset trials; and
- independent review proving every named artifact cell is present and bound
  to its exact raw bytes.
