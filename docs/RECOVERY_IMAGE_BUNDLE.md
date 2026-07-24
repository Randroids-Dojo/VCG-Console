# Verifiable Pi Recovery Image Bundle

Status: delegated recovery-manifest/archive/read-back verifier implemented;
release production, download client, archive decoder, removable-media writer,
first-boot recovery environment, and physical qualification remain open.

## Purpose and boundary

D-049 requires a failed or corrupted Raspberry Pi card to be recoverable by
downloading a verified VCG image and writing it from another computer. This is
the disaster-recovery path for a blank or replacement card. It does not replace
automatic A/B rollback, preserve data from a failed card, or convert recovery
into a backup feature. D-167 fixes the current verification boundary; Q-175
through Q-178 retain the unresolved signing, hardware, writer, and destructive
ceremony choices.

[`recovery_image.rs`](../native/vcg-host/src/recovery_image.rs) implements the
first non-destructive part:

1. accept one strict bounded manifest from an absolute regular file;
2. verify its exact bytes under a current delegated
   `channel/recovery-image/target` threshold before JSON parsing;
3. require the manifest's target and one sorted compatible-hardware ID to match
   separately supplied expectations;
4. bind archive format, archive length/hash, expanded raw-image length/hash,
   and minimum media capacity;
5. completely hash the downloaded regular archive and retain its exact opened
   handle; and
6. verify the exact signed expanded-image prefix from a caller-provided
   read-back stream.

The code does not fetch any bytes, establish trusted time or root provenance,
inspect ZIP structure, decompress an archive, enumerate or select disks, obtain
administrator privileges, write or synchronize a block device, prove that a
read-back stream came from that device, eject media, change boot firmware, or
validate first boot. `VerifiedRecoveryReadback` is byte evidence, not storage
provenance or permission to destroy a disk.

## Separate delegated authority

Recovery images use a fourth exact update artifact family:

```text
VCG-RECOVERY-IMAGE-MANIFEST-V1\0 || exact manifest bytes
```

The accepted update root must contain a distinct `recovery-image` role with a
non-reused key set. A `system-image`, `installed-catalog`, or `package-release`
signature cannot authorize it. The intended operator policy uses a separately
selected recovery channel rather than silently reusing the ordinary stable
release role. Root-chain replay, protected root identity, trusted time, offline
root recovery, and key custody remain the existing update-trust
responsibilities.

This separation matters because a recovery image can replace the entire card,
not merely write an inactive A/B slot. Compromise or routine availability of an
ordinary online system-image key must not automatically grant whole-device
reflash authority.

## Manifest v1

The manifest is closed JSON and limited to 64 KiB:

```json
{
  "schemaVersion": 1,
  "generation": 7,
  "releaseId": "vcg-pi5-recovery-7",
  "target": "raspberry-pi-5-vcg",
  "compatibleHardwareIds": [
    "pi5-rev-1.0-8gb-hailo26"
  ],
  "image": {
    "format": "raw-zip",
    "archiveSizeBytes": 4294967296,
    "archiveSha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "expandedSizeBytes": 34359738368,
    "expandedSha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "minimumMediaBytes": 256000000000
  }
}
```

The hashes above are illustrative zeros, not a release.

| Field | Contract |
|---|---|
| `schemaVersion` | Exactly `1` |
| `generation` | Positive recovery release generation |
| `releaseId` | 1–128 safe ASCII identifier bytes |
| `target` | Exact privileged update target, 1–64 safe ASCII bytes |
| `compatibleHardwareIds` | 1–16 strictly sorted unique safe identifiers; must contain the separately expected exact assembly ID |
| `image.format` | `raw` or `raw-zip` |
| `archiveSizeBytes` | 1 through 512 GiB |
| `archiveSha256` | Exact canonical lowercase SHA-256 of downloaded bytes |
| `expandedSizeBytes` | 1 through 512 GiB |
| `expandedSha256` | Exact canonical lowercase SHA-256 of the raw disk-image bytes |
| `minimumMediaBytes` | At least the expanded size and at most 2 TiB |

For `raw`, archive and expanded length/hash must be identical. For `raw-zip`,
they are intentionally separate. The current verifier treats ZIP bytes as
opaque signed input; a future decoder must permit exactly one bounded regular
raw-image entry, reject encryption, links, paths, duplicates, unsupported
methods, trailing ambiguity, size mismatch, and decompression bombs, and hash
expanded bytes while writing. An arbitrary byte string cannot be written merely
because a test labels it `raw-zip`; decode and expanded read-back must also
succeed.

The hardware ID is an engineering allowlist, not an automatically trustworthy
serial number. The recovery tool must obtain the expected ID from an
independently selected product/assembly record or a trustworthy diagnostic
path. A user choosing a string copied from the unverified manifest would defeat
the compatibility check.

## Required end-to-end transaction

The final computer-assisted tool must preserve this order:

1. Start on a clean supported Windows, macOS, or Linux computer.
2. Load pinned out-of-band VCG root anchors and replay the complete accepted
   signed root chain to its exact protected identity.
3. Establish the selected trusted-time/recovery-expiration policy.
4. Select exact VCG target and hardware identity independently of downloaded
   manifest contents.
5. Download the manifest, bounded key-ID-labeled signature bundle, and archive
   from stable release locations.
6. Verify the recovery role threshold before parsing the manifest.
7. Completely hash the archive through the retained file handle.
8. Enumerate removable media with stable OS identity, size, system-disk
   exclusion, mounted-volume state, and removal/reconnect detection.
9. Require a deliberate confirmation showing exact device model, capacity,
   and irreversible loss. Reopen by stable identity after confirmation and
   fail if any fact changed.
10. Decode from the retained archive handle, hash every expanded byte while
    writing, refuse bytes beyond the signed length, flush the writer, and
    request the platform's durable device synchronization.
11. Close and reopen the same selected physical device read-only, hash the
    exact expanded prefix, and compare it with the signed expanded identity.
12. Eject/unmount through the platform, report a closed success record without
    paths or host identifiers, and instruct the user to move the card.
13. First boot offline, validate hardware/release identity, partition layout,
    verified boot/update root, launcher, storage, controller, tracker, camera
    service, and explicit no-user-data state before reporting recovery.

Any ambiguity, changed device identity, disconnect, short write/read, decoder
error, sync error, hash mismatch, stale root, wrong target/hardware, or skipped
verification produces failure. Retry begins by reopening and revalidating every
input; it does not resume a partially written card as if it were trustworthy.

## Draft cross-platform human flow

Raspberry Pi currently documents Raspberry Pi Imager as its Windows, macOS,
and Linux tool for writing boot media, including manually downloaded/custom
images and post-write verification. It warns users to identify the correct
storage device and recommends retaining system-drive exclusion and the verify
step. See the official
[installation instructions](https://www.raspberrypi.com/documentation/computers/getting-started.html#install-using-imager)
and [Imager source repository](https://github.com/raspberrypi/rpi-imager).

That makes Imager the current UX baseline, but it is not yet VCG's qualified
writer. The draft family-facing sequence on each host OS is:

1. obtain the official VCG recovery tool and Imager through independently
   authenticated locations;
2. let the VCG tool verify the exact root chain, recovery manifest, signatures,
   and complete archive;
3. disconnect unrelated removable drives;
4. in Imager, select the exact Raspberry Pi model, choose the verified custom
   `.img` or `.zip`, and select the replacement card by displayed identity and
   capacity;
5. keep system drives excluded, skip all OS customisation, and confirm erasure;
6. never inject the host computer's Wi-Fi credentials, user account, SSH key,
   hostname, or locale into the signed VCG image;
7. complete Imager's write and verification without skipping; and
8. run VCG's exact expanded SHA-256 device read-back before accepting success.

The same conceptual steps apply on Windows, macOS, and Linux, but the final
screens, privilege prompts, device identity, safe-eject behavior, and exact
read-back integration must be tested for pinned tool/OS versions. Raw `dd`,
PowerShell disk commands, and ad hoc shell pipelines are intentionally not
offered as family instructions: one mistaken device path can destroy the host
computer.

Official Raspberry Pi documentation also describes HDMI/LED boot diagnostics
and bootloader recovery for a Pi that still fails after reimaging. Those are a
separate escalation, not evidence that the VCG image or card is correct. See
[Raspberry Pi boot diagnostics](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#boot-diagnostics).

## Data-loss and privacy contract

A blank/replacement-card recovery contains production software and
rights-cleared shipped content only. It contains no:

- local profiles, portraits, calibration, or body-matching fields;
- console vault key, profile keys, protected-state secrets, or paired developer
  keys;
- saves, achievements, scores, unassigned progress, or browser storage;
- household Wi-Fi credentials, service accounts, or host-computer settings;
- logs, diagnostics, support exports, skeletal traces, or raw camera data; or
- user-imported retro content or developer builds.

D-083, D-084, D-085, and D-089 intentionally make these classes unavailable
after destructive reflash or card replacement. The UI must disclose permanent
loss before writing. I-186 must independently scan the actual published image
and writer artifacts with producer-specific canaries; a clean source-tree
design is not release evidence.

## Automated evidence

Eight focused Rust tests currently cover:

- delegated recovery role, exact channel/target/hardware, signer identity, and
  manifest hash retention;
- signature-before-parse behavior for changed bytes;
- cross-role and cross-domain denial;
- exact raw archive and expanded read-back verification;
- distinct ZIP archive and expanded-image identities;
- strict target/hardware matching and sorted/unique allowlists;
- schema, bounds, raw coherence, unknown-field, and canonical-hash rejection;
- complete archive hashing, truncation/change detection, and retained-handle
  path-replacement resistance;
- short and changed expanded read-back rejection; and
- relative, directory, and oversized manifest denial.

Run:

```powershell
$env:Path = "C:\Users\randr\.cargo\bin;" + $env:Path
cargo test -p vcg-host recovery_image --lib
cargo clippy -p vcg-host --all-targets -- -D warnings
```

## Explicitly unproven

I-113 remains active until an actual release and representative household
restore pass. Missing evidence includes:

- final recovery-root/channel/signing custody and compromise procedure;
- exact Pi assembly IDs, supported substitutions, card identity and capacity;
- deterministic image build/provenance/SBOM/reproducibility and stable hosting;
- timestamp/snapshot/freeze/mirror defenses for network acquisition;
- a reviewed single-entry bounded ZIP decoder and writer integration;
- stable removable-device identity and system-disk exclusion on all three host
  operating systems;
- privilege, unplug/replug, cancellation, low-space, sleep, crash, malicious
  USB reader, and hostile archive behavior;
- synchronized full-device read-back on real qualified cards/readers;
- actual recovery-image I-186 canary exclusion;
- first-boot offline validation and bootloader escalation;
- controller-accessible service/recovery UX and deliberate data-loss consent;
- p50/p95/worst download, write, verify, first-boot, and complete restore time;
  and
- repeated blank/replacement/card-failure and sudden-power campaigns.

Until these pass, the repository can reject malformed or unauthorized recovery
inputs but cannot recover a console. See
[`OWNER_QUESTIONS_RECOVERY_IMAGE_2026-07-24.md`](OWNER_QUESTIONS_RECOVERY_IMAGE_2026-07-24.md)
for the decisions deliberately left to the owner.
