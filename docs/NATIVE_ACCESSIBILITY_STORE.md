# Native accessibility preference store

Status: strict crash-recoverable Rust persistence boundary implemented but not
wired to the launcher, native input, tracker, games, or a target service.

## Contract

The native store persists the exact D-164 browser prototype document:

```json
{
  "schemaVersion": 1,
  "textScale": "standard",
  "contrast": "standard",
  "motion": "system",
  "seatedPlay": "standard",
  "confirmButton": "south",
  "audioCues": "on"
}
```

The full UTF-8 input remains capped at 1,024 bytes. Unknown, missing,
duplicate, malformed, wrong-version, and out-of-vocabulary fields are rejected
as one unit. A rejected latest document produces complete conservative
defaults plus a distinct `Rejected` persistence state; it is never partially
migrated or silently rewritten.

This state is non-authoritative. It cannot enable administration, developer
mode, pairing, package or launch authority, camera access, profile selection,
or game permission. `confirmButton` and `seatedPlay` remain preview values:
the native input router, reserved Home/Back/Pause, tracker, and games do not
consume them.

## Publication and recovery

The store requires one absolute real directory and takes a nonblocking
exclusive lock. Each save serializes the exact compact v1 document, creates
and flushes one ordinal incoming file, renames it to a canonical committed
generation, synchronizes the directory where supported, and removes
superseded complete generations.

The rename is the publication point. A crash before it leaves an incoming file
that reopen validates by name and removes. A crash after it leaves a complete
newest generation; reopen selects it and removes older complete generations.
The directory is capped at four entries before parsing. Save rechecks that
publication headroom exists before creating an incoming file, so repeated
cleanup failure cannot push the store beyond that hard bound. Symlinks,
relative roots, noncanonical names, non-files, and unexpected root entries
fail closed.

Reset first publishes and flushes a fixed `reset-required` marker. It then
validates every accessibility generation name and type, removes only those
files, synchronizes the directory, and removes the marker. Reopen completes a
published reset marker before loading preferences. Unexpected files are never
swept into reset.

The store intentionally has no schema migration. A future v2 requires a
reviewed all-or-nothing migration with its own tests and update/rollback
contract. It also has no browser API, profile linkage, network path, telemetry,
export, or secret field.

## Current limits

- No production runtime opens this store.
- Q-159 still decides final device/per-profile scope.
- Q-160 still decides ordinary remapping and recovery; reserved controls
  remain immutable.
- Q-161 still decides audio behavior.
- Browser local storage is not yet replaced or reconciled.
- The root's mount, service identity, permissions, backup/factory-reset scope,
  and update/rollback ownership are not selected.
- Windows does not expose Unix directory `fsync` through this implementation,
  and no physical power-cut/full-disk/read-only/corruption evidence exists.
- The provisional scale, colors, posture support, remap behavior, and audio
  cues are not accessibility certification.

## Automated evidence

Nine Rust tests cover exact browser-v1 round trip, strict parser and byte
bound, conservative defaults, atomic save/reopen/superseded cleanup,
incomplete publication recovery, rejected-state disclosure and replacement,
reset-marker recovery, pre-publication directory-headroom refusal, unsafe
path/layout, and lock contention.
