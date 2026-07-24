# Owner questions: device-only data exclusion evidence

Last updated: 2026-07-24

The reusable verifier does not answer these product and qualification
questions. No current result authorizes automatic matching, portrait capture,
or a household beta.

## Q-155: authoritative artifact inventory

Which exact production components own every backup, export, diagnostics,
support, recovery, update-slot, developer, game-storage, deletion,
factory-reset, and replacement-console artifact on Raspberry Pi and the
premium PC target?

Safe default: treat the inventory as incomplete. Require each producer owner
to enumerate raw output, temporary state, inactive/rollback generations,
caches, journals, retained partitions, network destinations, and cleanup
behavior. An unowned or unmaterialized path fails I-186 even when every
submitted directory scans clean.

## Q-156: trusted materializers

Which pinned and sandboxed readers may materialize each selected system image,
archive, database, filesystem, support bundle, and other opaque format for
inspection?

Safe default: do not let raw compressed/encrypted/container bytes produce an
absence claim. Select exact versions/configuration only after traversal,
link/device, collision, expansion, malformed-input, and completeness tests;
bind the raw artifact digest and materializer identity into evidence.

## Q-157: deletion and physical-remanence standard

For profile deletion, factory reset, reflash, and key loss, is proof limited to
logical inaccessibility plus cryptographic key destruction, or must particular
targets also demonstrate discard/erase behavior against filesystem slack and
flash remanence?

Safe default: require immediate logical unlinking, deletion of every live and
rollback copy, and destruction of the only console-bound vault key. Do not
promise physical overwrite on flash until the exact controller/filesystem can
prove it; disclose the residual forensic boundary and obtain security/privacy
acceptance for each target.

## Q-158: evidence retention and review authority

Who may retain exclusion reports, positive-control results, artifact digests,
and materialization logs, for how long, and who signs the release decision?

Safe default: retain only closed path-free reports and non-sensitive build/tool
provenance under the release evidence policy. Never retain canary values,
profile fixtures, decrypted vaults, file snippets, real household fields, or
materialized sensitive sources. Require an independent reviewer to match every
matrix row to its exact artifact and positive control before release.
