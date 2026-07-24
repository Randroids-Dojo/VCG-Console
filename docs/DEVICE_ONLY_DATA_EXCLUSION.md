# Device-only data exclusion verifier

Status: reusable verifier implemented; production artifact integrations and
target qualification remain open

Last reviewed: 2026-07-24

## Purpose

`scripts/verify-device-only-data-exclusion.mjs` inspects deliberately
materialized qualification artifacts for synthetic player-identity canaries.
It is the first reusable I-186 primitive for proving that portraits,
calibration fields, body-profile templates, matching probes, and their links
do not enter backup, export, cloud, diagnostics, support, recovery,
system-slot, game-storage, developer, or factory-reset outputs.

The verifier does not claim that those product paths exist or are safe today.
It proves only that a complete, stable, materialized directory tree does or
does not contain the supplied synthetic canaries in the representations it
recognizes. Every producer still needs an integration that seeds all sensitive
fields, creates the real target artifact, materializes every opaque layer with
a separately trusted format-specific tool, and submits the complete result.

Never put real household data, names, portraits, measurements, credentials, or
secrets in a scan manifest. Canary values must be synthetic strings beginning
with `VCG-CANARY-`.

## Closed v1 manifest

The JSON document is limited to 64 KiB, rejects unknown or missing fields, and
has this exact shape:

```json
{
  "schemaVersion": 1,
  "scanId": "pi-recovery-qualification",
  "artifacts": [
    {
      "id": "recovery-root",
      "kind": "recovery-image",
      "materializedPath": "recovery-root"
    }
  ],
  "canaries": [
    {
      "id": "profile-template",
      "value": "VCG-CANARY-TEMPLATE_7A91F26C44"
    }
  ],
  "forbiddenPathSegments": [
    {
      "id": "vault-directory",
      "value": "profile-vault"
    }
  ],
  "forbiddenFileDigests": [
    {
      "id": "sealed-vault-copy",
      "sha256": "8b4feaf143c828ea5fd6412e92dc9d4874b01d20a7b60599baaa9478dfcb4f51"
    }
  ],
  "limits": {
    "maxEntries": 100000,
    "maxFiles": 80000,
    "maxFileBytes": 1073741824,
    "maxFindings": 256,
    "maxTotalBytes": 8589934592
  }
}
```

`materializedPath` is a canonical forward-slash relative path beneath the
manifest directory. Each artifact root must be a real directory. Artifact
roots must be mutually disjoint and cannot traverse through a symlink.

Allowed artifact kinds are:

- `backup`
- `cloud-sync`
- `developer`
- `diagnostics`
- `export`
- `factory-reset`
- `game-storage`
- `recovery-image`
- `support-bundle`
- `system-slot`

IDs are opaque lowercase tokens limited to 64 characters and are unique
across all signal types. The manifest requires one through 64 artifacts and
one through 64 unique canaries. It also accepts zero through 64 case-folded
forbidden path segments and zero through 64 exact lowercase SHA-256 source-
file digests. These additional signals catch a fixed vault directory or an
encrypted/renamed byte-for-byte vault copy that cannot reveal a plaintext
canary. Every limit is explicit; defaults cannot silently widen a scan.

## Invocation and result

From the repository root:

```text
node scripts/verify-device-only-data-exclusion.mjs path/to/scan.json
```

Exit status is part of the contract:

| Exit | Meaning |
|---:|---|
| `0` | Complete scan; no supplied canary representation found |
| `1` | Complete or explicitly truncated scan found one or more forbidden signals |
| `2` | Manifest, filesystem, materialization, stability, or internal error; no absence claim |

Standard output on exit `0` or `1` is closed JSON containing:

- schema version and opaque scan ID;
- `passed` or `failed` status;
- whether findings are complete or truncated;
- per-artifact kind, entry/file/byte counts, and a path-free content-tree
  SHA-256;
- aggregate counts; and
- bounded findings containing artifact ID, artifact-relative entry ordinal,
  location, signal ID/type, and encoding.

Findings never contain the canary value, file content, a snippet, or the
relative path. A canary placed in a filename therefore cannot make the report
echo that value. Exit `2` emits only a closed error code to standard error; it
does not serialize an exception, input, path, or canary.

## Scan behavior

The verifier:

1. validates the complete closed manifest before touching artifact roots;
2. resolves every root beneath the real manifest directory and rejects
   symlink components or overlapping roots;
3. inventories entries in stable code-unit order and enforces global entry,
   file, per-file byte, total-byte, and finding limits;
4. rejects symlinks, non-file/non-directory entries, unsafe names, unreadable
   entries, and changes observed between inventory and scanning;
5. opens each regular file directly, checks its identity before and after a
   streaming scan, and reinventories the tree afterward;
6. checks every path segment against the exact and ASCII-case-folded forbidden
   segment list and every complete regular-file SHA-256 against forbidden
   source digests;
7. scans paths and file bytes for literal UTF-8, lowercase UTF-8, UTF-16LE,
   UTF-16BE, Base64, Base64URL, lowercase hexadecimal, and uppercase
   hexadecimal representations;
8. retains enough overlap between 64 KiB chunks to detect a representation
   split at any stream boundary; and
9. commits each materialized tree by hashing ordered entry ordinals/types plus
   regular-file sizes and content digests without publishing names; and
10. returns a failed, incomplete result when findings exceed the explicit cap.

Limits apply across all artifact roots, not independently to each root.
Finding truncation can never become a pass.

## Opaque-container refusal

Scanning the raw compressed bytes of a ZIP or a mounted-filesystem image can
miss a canary that is plainly present after extraction. The verifier therefore
returns exit `2` for recognized archive, compression, PDF, and disk/filesystem
container extensions or magic, including ZIP, gzip, xz, Zstandard, 7-Zip,
bzip2, TAR, common database/LSM files, ISO, SquashFS, ext-family images, QCOW,
VHDX, and PDF.

The qualification harness must:

1. retain and hash the exact raw product artifact;
2. materialize it with a pinned, sandboxed, format-specific reader that rejects
   traversal, links, devices, collisions, and expansion abuse;
3. place the full materialized output in a dedicated scan directory;
4. run this verifier over that directory; and
5. bind the verifier result, raw-artifact digest, materializer version/config,
   and target/build identity in the enclosing evidence record.

Renaming a known opaque format does not help: common magic is also rejected.
An unknown proprietary encoded or encrypted file is not thereby proven clean.
It needs a semantic exporter/materializer or a separate verifier.

## Qualification procedure

For each real path in the matrix:

1. Provision a disposable profile fixture containing a different synthetic
   canary in every sensitive field and linkage. Include portrait pixels or
   metadata canaries only in a deliberately synthetic portrait fixture.
   Record exact SHA-256 for any sealed vault/database/source file whose
   byte-for-byte appearance in an output is forbidden, and list stable
   profile-vault path segments.
2. Exercise the production operation on the exact target build: update,
   rollback, export, support collection, recovery creation, game save, profile
   deletion, factory reset, or replacement-console setup.
3. Capture every resulting artifact and intermediate root named by the
   producer's data-flow review, including temporary, rollback, inactive-slot,
   cache, and journal state.
4. Materialize opaque containers as described above.
5. Run the verifier with limits exceeding the predeclared complete artifact
   inventory, and retain the closed JSON evidence.
6. Treat exit `1`, exit `2`, an unaccounted artifact, a producer that could not
   be seeded, or a missing materializer as a failed gate.
7. Independently verify the expected positive control: scan the seeded profile
   vault/source fixture and require the canary to be found. A clean negative
   result without a positive control does not prove correct instrumentation.
8. Destroy the disposable fixture and test keys under the selected target
   sanitization procedure.

Use distinct canaries per field and test run. Reusing one value hides which
producer field was omitted and makes stale evidence easier to mistake for a
current run.

## I-186 coverage ledger

| Required path/event | Current verifier contribution | Still required |
|---|---|---|
| OS update and inactive A/B slot | Materialized `system-slot` trees can be scanned | Real image writer, mounted slots, temporary/rollback state, target binding |
| A/B rollback | Can scan both post-rollback slots and writable evidence | Real bootloader/slot transition and protected-state rollback tests |
| Save backup/restore | `backup` and `game-storage` kinds are defined | Console backup is intentionally absent; prove no hidden path and inspect every runtime's saves |
| Game export | `export` and `game-storage` trees can be scanned | Real web/native/Godot/Libretro export and storage brokers |
| Developer mode | `developer` trees can be scanned | Paired deployment does not exist; future staging, logs, keys, and workstation traffic |
| Logs and diagnostics | Materialized diagnostic files can be scanned | Native producers/store; current volatile browser diagnostics have separate closed-schema tests |
| Support bundle | `support-bundle` trees can be scanned | Final bundle builder, review UI, materializer, and independent redaction review |
| Recovery image and reflash | Refuses an opaque image until fully materialized | Exact Pi/PC images, partitions, free-space model, flash/replacement tests |
| Cloud path | `cloud-sync` trees can be scanned | Prove no console profile service/path and inspect each hosted game's separate service behavior |
| Card clone/removal | Materialized clone content can be scanned | I-187 vault/key protection, offline attack, ciphertext metadata, second-device unlock denial |
| Profile deletion | Pre/post trees and `factory-reset` output can be scanned | Crash-recoverable lifecycle, old generations, caches, free-space/remanence policy |
| Factory reset | Post-reset materialized roots can be scanned | Exact retained partitions/content, key destruction, flash behavior, target evidence |
| Replacement console | Import/materialized roots can be scanned | Prove no profile recovery/migration and no save-driven identity reassociation |

The current ten-test fixture suite proves the verifier contract, not any row
in the rightmost column.

## Explicit limits

- Canary/path/digest absence is not general proof that arbitrary personal
  information is absent. Correct field-by-field instrumentation, source
  inventory, and a positive control are mandatory.
- Only the eight documented literal/common encodings are detected. Hashes,
  compression, encryption, deltas, database pages, custom serialization, and
  derived values require semantic materialization or format-specific checks.
- The verifier does not inspect RAM, GPU memory, swap, hibernation, crash
  capture below the submitted tree, network traffic, filesystem slack,
  flash-remanence behavior, NTFS alternate streams, hidden firmware storage,
  or a running root attacker.
- Metadata checks detect ordinary concurrent mutation but are not a snapshot
  primitive against a hostile filesystem administrator. Production evidence
  should scan an immutable snapshot or read-only materialization.
- The path-free content-tree digest binds ordered types and file contents, not
  exact filenames. The enclosing evidence must separately bind the raw
  artifact digest and materializer; forbidden path-segment findings cover
  selected names without publishing them.
- A `passed` result is scoped to the exact manifest, roots, canaries,
  forbidden path/digest signals, limits, materializer, target/build, and time.
  It must never be generalized to a different release or artifact producer.
- Synthetic portrait fixtures must not be mistaken for permission to capture
  or process a real household portrait before I-185's consent/legal gates.

## Automated evidence

`pnpm validate:data-exclusion` covers:

- exact manifest fields, schema, identifiers, paths, counts, and limits;
- deterministic clean-tree evidence;
- all eight encodings, including a canary crossing a streaming chunk boundary;
- path-canary redaction;
- fixed forbidden path segments and exact source-file digests;
- bounded finding truncation;
- extension- and magic-based opaque-container refusal;
- global limits across disjoint roots;
- overlapping-root and symlink refusal; and
- CLI exit `0`/`1`/`2` behavior without canary echo.

These tests use disposable synthetic fixtures only.
