# Owner questions: Raspberry Pi 5 memory-tier qualification

Date: 2026-07-25

Status: non-blocking for plan validation; blocking for I-016 execution and
minimum-tier recommendation

Local identifiers avoid conflicts with concurrent central-question edits.

## PMEM-001: received boards and comparison authority

Which exact 8 GB and 4 GB Raspberry Pi 5 part numbers, board revisions and
access path may be used after the 8 GB reference workload passes? Is a 2 GB
board available for explicitly exploratory evidence?

Do not infer purchase authority or accept different board, cooling, power or
storage revisions as a memory-only comparison.

## PMEM-002: swap, zram and memory-control policy

Which exact swap/zram configuration, cgroup-v2 hierarchy, `memory.high` and
`memory.max` policy, PSI sampling, OOM group behavior, crash-dump policy and
recovery sequence represents the product?

The policy must protect profile-vault keys and plaintext from swap/dumps,
attribute storage writes, retain a kernel-owned `memory.events` handle, and
distinguish product OOM from a harness failure.

## PMEM-003: pre-result gates

What minimum available-memory headroom, pose/game FPS and delivered savings,
and what maximum PSI, major faults, swap/zram occupancy, pressure-attributable
storage writes, frame/drop tails, wall power, temperature, throttling and
recovery time qualify 4 GB?

Freeze every value and its rationale before measurements are visible. Memory
cost savings cannot excuse a latency, action-quality, storage, recovery or
privacy failure.

## PMEM-004: pressure and OOM exercise authority

Who may authorize target memory pressure and intentional OOM injection, which
process/cgroup is in scope, what stop conditions protect the filesystem and
hosted sessions, and which fresh-instance/state-integrity oracle proves safe
recovery?

No injection is authorized by the checked-in plan. Synthetic pressure alone
cannot qualify ordinary representative operation.
