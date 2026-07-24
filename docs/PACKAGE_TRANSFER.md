# Resumable package archive transfer

Last updated: 2026-07-24

This document defines the implemented durable local sink between a future network client and [signed package intake](PACKAGE_INTAKE.md). It does not select URLs, HTTP/TLS behavior, mirrors, credentials, proxies, scheduling, or UI.

## Authority and state

`PackageArchiveTransfer::open_or_begin` accepts only an already signature-verified release descriptor, a host-owned absolute transfer root, a bounded transaction ID, and a nonzero free-space reserve.

One immutable state file binds:

- schema version and transaction ID;
- release generation; and
- exact signed archive SHA-256 and byte length.

A nonblocking filesystem lock gives one cooperating receiver exclusive ownership. Existing state must match the same release. A partial file without binding state fails closed.

The generation store's `stage_ready_transfer` handoff keeps that receiver and
lock alive, independently verifies the descriptor with the store's configured
key, requires the immutable transfer binding to match the exact verified
release, and re-hashes the ready archive before extraction.

## Resume and replay

Durable progress is the synchronized partial archive's file length. There is no separately mutable received-byte counter.

Each chunk is at most 8 MiB and must:

- be nonempty;
- begin exactly at the current durable length; or
- be wholly inside the received prefix and match every existing byte.

Gaps, partial overlap, conflicting replay, and signed-length overrun fail. Before opening and before each new append, capacity is rechecked as:

```text
available >= remaining archive bytes + expanded bytes + nonzero reserve
```

Already received bytes are not charged twice because current filesystem availability already reflects them. This is still a point-in-time check, not a reservation; the eventual update coordinator must serialize other storage writers.

## Final publication and recovery

Finalization requires the exact signed length and full archive SHA-256. The verified partial file is published under `ready-<transaction>.archive` with a no-replace same-filesystem hard link, the directory is synchronized on Unix, and the partial name is removed. The immutable binding remains for the lifetime of the ready archive, so a reused transaction ID cannot reinterpret identical bytes as a different signed generation.

If interruption occurs after ready publication but before partial cleanup, reopening verifies the ready archive and matching state before completing cleanup. A ready archive without binding state fails closed. If publication did not commit, the synchronized partial remains resumable. A wrong complete hash remains inert and inspectable; no ready archive, staging transaction, promotion intent, or activation is created.

Successful staging retains the ready archive and binding as a durable receipt.
An incomplete transfer, changed descriptor binding, invalid reserve, or staging
failure leaves the receipt/partial state intact and creates no active
generation. Repeating a handoff after staging committed reports the existing
staging transaction rather than extracting over it.

The persistent lock file contains no authority or progress and may remain after completion. The future cleanup coordinator must remove a consumed ready archive and its binding together under the same exclusive service ownership.

## Remaining boundary

Network transport and descriptor discovery, TLS/pinning/proxy/mirror policy, HTTP range semantics, retry/backoff, bandwidth limits, abandoned-partial and consumed-ready cleanup, low-space UI/coordination, hostile noncooperating writers, filesystem-lock behavior on target Linux, and sudden-power qualification remain open. See [the owner transfer questions](OWNER_QUESTIONS_PACKAGE_TRANSFER_2026-07-24.md).
