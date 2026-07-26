# Owner questions: retro import activation

Date: 2026-07-24

Status: questions preserved; none blocks continued host-side implementation,
all block product activation where noted

## Current safe default

The new shared import contract ships no product system allowlist and performs
no I/O. USB and paired LAN share one strict planner. Family mode denies import
unless explicitly enabled. Entitlement applies only to selected files. ZIP is
representable only as one inspected regular payload. Conflicts require an
explicit decision. No source path, device/workstation identity, IP address,
profile name, commercial metadata, or artwork URL enters the installed
library.

These questions refine existing Q-057, Q-064, Q-065, Q-067, D-097, D-098, and
D-100 rather than silently answering them.

## RI-001: first supported systems and exact mappings

Which systems should the first import release expose, and which exact
core/version, file extensions, controller profile, BIOS rule, per-item size,
and archive formats belong to each?

Safe default: no production system policy, so imports remain unavailable.

Needed before activation: per-system qualification evidence under Q-064 and
Q-067, including rights, both architecture artifacts, BIOS diagnostics,
save/state compatibility, controller behavior, and hostile-content results.

## RI-002: multi-file and disc content

Should the first release remain plain-file plus single-payload ZIP only, or
must it support cue/bin, multiple discs, CHD, MAME parent/clone sets, or other
multi-file relationships?

Safe default: reject every multi-file archive and nested container.

Tradeoff: the narrow rule is easier to make atomic and understandable but
excludes important systems. Expanding it requires one signed installed-entry
graph, exact component hashing, dependency diagnostics, replacement/delete
semantics, quotas, and source-removal tests—not merely allowing more ZIP
entries.

## RI-003: same-title conflict presentation

When two different hashes produce the same normalized title, should the normal
UI offer Keep Both, replace the exact existing entry, both, or only cancel and
manual review?

Safe default: the planner exposes only capacity-valid choices and never
selects one. Replacement requires an exact existing entry ID.

Needed before activation: controller-accessible copy, preview metadata,
default focus, destructive confirmation, cancellation, and household testing.

## RI-004: entitlement wording and audit retention

What exact legal/UX wording should replace the placeholder
`vcg-user-entitled-content-v1`, who may acknowledge it, and how long should
the path-free audit record be retained?

Safe default: “selected files only,” one active local profile, no ownership
claim by the console, no source paths, and no product activation pending legal
review.

Needed before activation: legal approval under Q-065, age/family-mode rules,
local retention/deletion behavior, diagnostic/export exclusion, and a
decision on whether opaque profile ID belongs in the durable audit or only
the visible session.

## RI-005: paired-LAN import authority

Should retro import reuse the developer workstation pairing root with a
separate short-lived capability, or use a distinct pairing identity and
confirmation flow?

Safe default: no LAN receiver. The pure contract requires a separately visible
expiring session and supports explicit revocation; ordinary developer pairing
does not grant import.

Needed before activation: Q-057 key exchange, authenticated encryption,
discovery, confirmation, idle and absolute timeout, replay/downgrade defense,
stolen-key response, reboot closure, resumable transfer, and hostile-LAN
evidence.

## RI-006: offline scanner and rule updates

Which scanner, rule source, signature/update authority, retention, and
unavailable/error policy should produce the required clean native scan
evidence on both target tiers?

Safe default: `blocked`, `error`, missing, stale, mismatched-hash, or
mismatched-inspection results deny planning. The repository currently bundles
no scanner and makes no detection claim.

Needed before activation: exact engine/license/package, signed rules, offline
age policy, performance, false-positive recovery, archive-expanded coverage,
malformed-input isolation, update rollback, and ARM64/x86-64 results.

## RI-007: archive support at launch

Should ZIP remain disabled until the native bounded streaming implementation
and hostile corpus pass, even if the signed policy format can represent it?

Safe default: policy lists no archive format. Plain files remain the first
implementation target.

Needed before enabling ZIP: total and per-entry limits, compatibility-path
collision parity, decompression ratio, encrypted/data-descriptor/ZIP64 cases,
CRC/hash mismatch, truncation, cancellation, source removal, disk-full and
power-loss recovery, and proof no entry escapes staging.

## RI-008: installed-library history compaction

How many append-only installed-library generations and path-free audit records
should remain locally, and what protected checkpoint permits older generations
to be compacted without weakening crash recovery or forensic review?

Safe default: retain every contiguous generation and block a new import after
4,096 generations. Do not delete history automatically and do not treat a
generated audit record as eligible diagnostics/export data.

Needed before activation at scale: exact retention duration/count, protected
current-generation anchor, crash-safe compaction transaction, audit-retention
answer from RI-004, full-disk behavior, factory-reset behavior, and tests
proving compaction cannot select a forged or incomplete generation.

## RI-009: privileged import coordinator ownership

Which native service owns source-handle creation, live session revocation,
exact-intent authorization, scanner invocation, recovery at boot, and handoff
of committed object identity to RetroArch?

Safe default: no browser or LAN endpoint invokes the new filesystem module.
The exact terminal intent must first be authorized against independently held
native source/session/policy state; a structurally valid JSON document alone
has no installation authority.

Needed before activation: one service identity and startup order, private IPC
schema, caller authentication, controller-visible lifecycle, reboot recovery
ordering, scanner sandbox, object/library read authority, and tests proving a
browser cannot mint or replay native context.
