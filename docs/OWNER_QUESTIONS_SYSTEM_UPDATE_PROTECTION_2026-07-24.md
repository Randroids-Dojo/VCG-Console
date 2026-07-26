# Owner Questions: System-Update Journal Protection

Date: 2026-07-24

These questions do not block the strict native journal protocol or its tests.
They block claiming that its bounded JSON boundary is backed by a qualified
production anti-rollback and boot transaction.

## Q-140: Protected-storage mechanism and write budget

Which Windows, ordinary Linux, and Raspberry Pi mechanism will hold the exact
system-update journal state, and can it provide durable integrity,
anti-rollback, exclusive slot identity, and atomic compare-and-swap at the
required transition rate?

The journal protects every new attempt claim and health-gate record, not only
image generations. The selected design must account for secure-storage write
latency and endurance without weakening the exact-record invariant. A writable
file beside the journal, an environment variable, or an unprotected command
line is not sufficient.

## Q-141: Boot-claim commit and firmware handoff

Which privileged coordinator will guarantee that a boot claim's exact
protected-state compare-and-swap succeeds before firmware or a bootloader can
transfer control to the candidate slot?

The Rust API now returns the claim and its required next state together, but it
does not control Raspberry Pi firmware. The adapter needs a reviewed failure
sequence for protected-write failure, reboot between commit and handoff,
firmware refusal, and a candidate that starts without producing health
evidence. It must not consume another attempt merely to rediscover the first.

## Q-142: Channel, target, and destructive-reset authority

How should an authorized update-channel or hardware-target migration preserve
or replace the protected journal identity, and which separately authorized
process may reset it after protected-storage or device loss?

The native core fails closed across channel or target drift. Reprovisioning a
fresh sequence-zero document through ordinary configuration could reopen old
signed generations and attempt IDs. Migration or reset therefore needs
explicit owner authority, auditable scope rules, and a defined relationship to
the accepted-root protected state and physical recovery image.

## Q-143: Rollback-detection and unexplained-advance response

What user-visible and fleet-visible response should follow journal deletion,
same-sequence substitution, a scope mismatch, or records ahead that no exact
authenticated retry can explain?

The native behavior is fail-closed and deliberately returns no digest that
could promote unexplained writable history. Product policy still needs to
choose quarantine, repair, offline recovery, or managed reprovisioning; define
the audit evidence retained, privacy limits, and whether any case can proceed
without owner or service authority.
