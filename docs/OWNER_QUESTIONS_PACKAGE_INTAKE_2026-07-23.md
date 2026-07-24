# Owner questions: package intake

Last updated: 2026-07-23

No answer here blocks the implemented signed uncompressed-TAR staging lane. The defaults below remain conservative and reversible.

## Q-117: production archive compression

Should production releases remain uncompressed TAR, or adopt `tar-zstd` after target measurements?

Safe default: accept only uncompressed TAR. It uses more transfer/storage bandwidth but keeps expanded-size enforcement direct and leaves no decompression-bomb ambiguity. Add `tar-zstd` only with a bounded streaming decoder, hostile corpus, memory/CPU measurements on both hardware tiers, and interruption cleanup evidence.

## Q-118: reserved free-space policy

What absolute or percentage reserve must remain during package download, extraction, and rollback retention on each storage tier?

Safe default: require a nonzero host-supplied reserve and expose no production default until the 256 GB microSD and premium-PC workloads are measured. Admission remains a point-in-time check, so the update coordinator must serialize competing writers and recheck at phase boundaries.

## Q-119: release signing role

May the signed release descriptor use the installed-catalog signing key, or should it have a separately delegated online role?

Safe default: keep the current domain-separated shared prototype key only for local implementation evidence. Before distribution, define offline-root delegation, online release/catalog roles, rotation, revocation, expiry/freeze behavior, and protected per-channel monotonic state.
